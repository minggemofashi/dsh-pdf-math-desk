/**
 * Chapter translation as a Host-owned background job.
 *
 * The client starts it; the Host rasterizes the chapter PDF with PyMuPDF and
 * calls the vision model page by page, so closing the reader or switching
 * conversations no longer cancels the work.
 * @module dsh-pdf-workbench/translate-job
 */
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { renderMarkdown } from './render.js'
import { translatePage } from './translate.js'
import { translatePageBlocks } from './translate-blocks.js'

const PYTHONS = [process.env.MATH_DESK_PYTHON, 'python', 'py'].filter(Boolean)
const CONCURRENCY = 3

function rasterize(script, source, outDir) {
  return new Promise((resolve, reject) => {
    let last = 'no Python found'
    const tryNext = index => {
      if (index >= PYTHONS.length) {
        reject(new Error(last))
        return
      }
      const python = PYTHONS[index]
      execFile(python, [script, source, outDir, '140'], { timeout: 180000, windowsHide: true, stdio: 'ignore' }, error => {
        if (error === null) resolve()
        else {
          last = `${python}: ${error.message}`
          tryNext(index + 1)
        }
      })
    }
    tryNext(0)
  })
}

function capture(script, args, env) {
  return new Promise((resolve, reject) => {
    const tryNext = index => {
      if (index >= PYTHONS.length) {
        reject(new Error('没有可用的 Python'))
        return
      }
      execFile(
        PYTHONS[index],
        [script, ...args],
        { timeout: 180000, windowsHide: true, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, ...(env ?? {}) } },
        (error, stdout) => {
          if (error === null) resolve(stdout)
          else tryNext(index + 1)
        }
      )
    }
    tryNext(0)
  })
}

/** Body font class for the chapter's own point size. */
function fontClassOf(fontPt) {
  if (fontPt >= 12.5) return '12pt'
  if (fontPt >= 11.2) return '11pt'
  if (fontPt >= 10) return '10pt'
  return '9pt'
}

/**
 * Start a chapter translation; resolves nothing, writes progress to `jobPath`.
 * @param {{ rasterScript: string, md2texScript: string, apiKey: string, source: string, outPath: string, jobPath: string, target: 'zh'|'en', book: string, code: string }} options - job inputs.
 * @returns {Promise<string>} the job id.
 */
export async function startChapterJob(options) {
  const jobId = `tr-${Date.now().toString(36)}`
  const state = {
    id: jobId,
    status: 'running',
    book: options.book,
    code: options.code,
    target: options.target,
    total: 0,
    done: 0,
    failed: 0,
    failedPages: [],
    pdf: '',
    error: '',
    startedAt: Date.now(),
  }
  await mkdir(options.jobDir, { recursive: true })
  const jobPath = join(options.jobDir, `${jobId}.json`)
  await writeFile(jobPath, JSON.stringify(state), 'utf8')
  const save = () => writeFile(jobPath, JSON.stringify(state), 'utf8')
  // Token accounting for the whole chapter: the API reports usage per call, so
  // every page adds its share and the reader can see what a chapter cost.
  const addUsage = usage => {
    state.tokens = state.tokens ?? { input: 0, output: 0, total: 0 }
    state.tokens.input += usage.input
    state.tokens.output += usage.output
    state.tokens.total += usage.total
  }

  void (async () => {
    let temporary = null
    let savedMarkdown = ''
    try {
      temporary = await mkdtemp(join(tmpdir(), 'pdfdesk-translate-'))
      await rasterize(options.rasterScript, options.source, temporary)
      const files = (await readdir(temporary)).filter(name => name.endsWith('.png')).sort()
      state.total = files.length
      await save()
      const chunks = new Array(files.length)
      let next = 0
      const worker = async () => {
        while (next < files.length) {
          if (existsSync(join(options.jobDir, `${jobId}.cancel`))) {
            throw new Error('翻译已取消')
          }
          const index = next
          next += 1
          // Resume: a page whose markdown is already cached costs nothing, so a
          // chapter interrupted by a crash or a failed page finishes where it
          // stopped instead of re-translating everything.
          if (options.resume === true && typeof options.cacheDir === 'string') {
            try {
              const cached = await readFile(join(options.cacheDir, `page-${String(index + 1).padStart(3, '0')}.md`), 'utf8')
              if (cached.trim() !== '') {
                chunks[index] = cached
                state.done += 1
                await save()
                continue
              }
            } catch {
              // no cached page: translate it below
            }
          }
          const image = `data:image/png;base64,${(await readFile(join(temporary, files[index]))).toString('base64')}`
          let pageMarkdown = ''
          let blockError = ''
          if (typeof options.cacheDir === 'string' && typeof options.toolsDir === 'string') {
            try {
              const raw = await capture(join(options.toolsDir, 'pdf_blocks.py'), [options.source, String(index + 1)])
              const blocks = JSON.parse(raw)
              if (Array.isArray(blocks) && blocks.length > 0) {
                const translated = await translatePageBlocks({
                  apiKey: options.apiKey,
                  image,
                  blocks,
                  target: options.target,
                  onUsage: addUsage,
                })
                const name = `page-${String(index + 1).padStart(3, '0')}.blocks.json`
                pageMarkdown = translated.map(block => block.md).filter(part => part !== '').join('\n\n')
                if (pageMarkdown.trim() !== '') {
                  await writeFile(join(options.cacheDir, name), JSON.stringify(translated), 'utf8').catch(() => {})
                } else {
                  await rm(join(options.cacheDir, name), { force: true }).catch(() => {})
                  blockError = '模型没有返回任何块的译文'
                }
              } else {
                blockError = '这一页没有解析出文本块'
              }
            } catch (error) {
              // Falling back to whole-page translation is not silent any more:
              // the chapter still translates, but the overlay can only be a
              // reflow, so the job says which page lost block alignment.
              blockError = String(error !== null && error !== undefined && error.message ? error.message : error)
              pageMarkdown = ''
            }
            if (blockError !== '') {
              state.blockErrors = Array.from(new Set([...(state.blockErrors ?? []), `第 ${index + 1} 页：${blockError}`]))
            }
          }
          if (pageMarkdown.trim() === '') {
            try {
              pageMarkdown = await translatePage({ apiKey: options.apiKey, image, target: options.target, onUsage: addUsage })
            } catch {
              // One page failing must not throw away the pages that worked: keep
              // the page empty, remember it, and let the chapter finish.
              pageMarkdown = ''
            }
          }
          if (pageMarkdown.trim() === '') {
            state.failed = (state.failed ?? 0) + 1
            state.failedPages = Array.from(new Set([...(state.failedPages ?? []), index + 1]))
          }
          chunks[index] = pageMarkdown
          state.done += 1
          await save()
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker()))
      if (chunks.every(chunk => chunk.trim() === '')) {
        throw new Error('所有页面都没有返回译文，请检查 API Key 与网络')
      }
      if (typeof options.cacheDir === 'string' && options.cacheDir !== '') {
        await mkdir(options.cacheDir, { recursive: true })
        for (let index = 0; index < chunks.length; index += 1) {
          // A failed page keeps whatever it had before instead of being
          // overwritten with an empty file.
          if (chunks[index].trim() === '') continue
          const name = `page-${String(index + 1).padStart(3, '0')}.md`
          await writeFile(join(options.cacheDir, name), chunks[index], 'utf8').catch(() => {})
        }
      }
      const markdown = chunks.join('\n\n\\newpage\n\n')
      savedMarkdown = markdown
      if (typeof options.overlayPath === 'string' && typeof options.toolsDir === 'string') {
        try {
          const sizes = JSON.parse(await capture(join(options.toolsDir, 'pdf_pagesizes.py'), [options.source]))
          let fontPt = 0
          try {
            fontPt = Number(JSON.parse(await capture(join(options.toolsDir, 'pdf_fontsize.py'), [options.source]))) || 0
          } catch {
            fontPt = 0
          }
          const fontClass = fontPt >= 12.5 ? '12pt' : fontPt >= 11.2 ? '11pt' : fontPt >= 10 ? '10pt' : '9pt'
          const parts = []
          const reflowPages = []
          for (let index = 0; index < chunks.length; index += 1) {
            const size = sizes[index] ?? sizes[sizes.length - 1] ?? [595, 842]
            const miniMd = join(tmpdir(), `md-${jobId}-${index}.md`)
            const miniPdf = join(tmpdir(), `pg-${jobId}-${index}.pdf`)
            let positioned = false
            if (typeof options.cacheDir === 'string' && options.cacheDir !== '') {
              try {
                const blocksFile = join(options.cacheDir, `page-${String(index + 1).padStart(3, '0')}.blocks.json`)
                await capture(join(options.toolsDir, 'md2overlay.py'), [
                  blocksFile,
                  miniPdf,
                  String(size[0]),
                  String(size[1]),
                  fontClass,
                ])
                positioned = true
              } catch {
                positioned = false
              }
            }
            if (!positioned) {
              reflowPages.push(index + 1)
              await writeFile(miniMd, chunks[index], 'utf8')
              await renderMarkdown(options.md2texScript, miniMd, miniPdf, {
                MATH_DESK_NO_TITLE: '1',
                MATH_DESK_PAPER: `${size[0] / 72},${size[1] / 72}`,
                MATH_DESK_FONTSIZE: fontClass,
              })
            }
            parts.push(miniPdf)
          }
          await capture(join(options.toolsDir, 'pdf_merge.py'), [options.overlayPath, ...parts])
          state.overlay = basename(options.overlayPath)
          // The overlay is only positionally aligned when every page came from
          // its block boxes. Say so instead of letting the boxes look broken.
          if (reflowPages.length > 0) state.overlayReflowPages = reflowPages
        } catch {
          // The overlay PDF is optional; the natural reading PDF still exists.
        }
      }
      const title = basename(options.outPath, '.pdf').replace(/_translated$/i, '')
      // The reading PDF also uses the chapter's own paper size and body size, so
      // the bilingual columns read at the same scale on both sides.
      let paper = ''
      let fontClass = ''
      if (typeof options.toolsDir === 'string') {
        try {
          const sizes = JSON.parse(await capture(join(options.toolsDir, 'pdf_pagesizes.py'), [options.source]))
          const size = Array.isArray(sizes) ? sizes[0] : null
          if (Array.isArray(size) && size.length === 2) paper = `${size[0] / 72},${size[1] / 72}`
        } catch {
          paper = ''
        }
        try {
          fontClass = fontClassOf(Number(JSON.parse(await capture(join(options.toolsDir, 'pdf_fontsize.py'), [options.source]))) || 0)
        } catch {
          fontClass = ''
        }
      }
      const markdownPath = join(tmpdir(), `${title}.md`)
      await writeFile(markdownPath, markdown, 'utf8')
      try {
        await renderMarkdown(
          options.md2texScript,
          markdownPath,
          options.outPath,
          {
            // The translated pages keep the book's headings; a generated one
            // would print the chapter's file name on top of page 1.
            MATH_DESK_NO_TITLE: '1',
            ...(paper === '' ? {} : { MATH_DESK_PAPER: paper }),
            ...(fontClass === '' ? {} : { MATH_DESK_FONTSIZE: fontClass }),
          }
        )
      } finally {
        await rm(markdownPath, { force: true })
      }
      state.status = 'done'
      state.pdf = basename(options.outPath)
    } catch (error) {
      state.status = 'error'
      state.error = String(error !== null && error !== undefined && error.message ? error.message : error)
      if (savedMarkdown !== '') {
        const keep = join(options.jobDir, `${jobId}.md`)
        await writeFile(keep, savedMarkdown, 'utf8').catch(() => {})
        state.error = `${state.error}（译文已保留：${keep}）`
      }
    } finally {
      await save()
      if (temporary !== null) await rm(temporary, { recursive: true, force: true })
    }
  })()

  return jobId
}
