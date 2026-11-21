/**
 * Chapter translation as a Host-owned background job.
 *
 * The client starts it; the Host rasterizes the chapter PDF with PyMuPDF and
 * calls the vision model page by page, so closing the reader or switching
 * conversations no longer cancels the work.
 * @module dsh-pdf-math-desk/translate-job
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { renderMarkdown } from './render.js'
import { translatePage } from './translate.js'

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
    pdf: '',
    error: '',
    startedAt: Date.now(),
  }
  await mkdir(options.jobDir, { recursive: true })
  const jobPath = join(options.jobDir, `${jobId}.json`)
  await writeFile(jobPath, JSON.stringify(state), 'utf8')
  const save = () => writeFile(jobPath, JSON.stringify(state), 'utf8')

  void (async () => {
    let temporary = null
    let savedMarkdown = ''
    try {
      temporary = await mkdtemp(join(tmpdir(), 'mathdesk-translate-'))
      await rasterize(options.rasterScript, options.source, temporary)
      const files = (await readdir(temporary)).filter(name => name.endsWith('.png')).sort()
      state.total = files.length
      await save()
      const chunks = new Array(files.length)
      let next = 0
      const worker = async () => {
        while (next < files.length) {
          const index = next
          next += 1
          const image = `data:image/png;base64,${(await readFile(join(temporary, files[index]))).toString('base64')}`
          chunks[index] = await translatePage({ apiKey: options.apiKey, image, target: options.target })
          state.done += 1
          await save()
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker()))
      const markdown = chunks.join('\n\n\\newpage\n\n')
      savedMarkdown = markdown
      const title = basename(options.outPath, '.pdf').replace(/_translated$/i, '')
      const markdownPath = join(tmpdir(), `${title}.md`)
      await writeFile(markdownPath, markdown, 'utf8')
      try {
        await renderMarkdown(options.md2texScript, markdownPath, options.outPath)
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
