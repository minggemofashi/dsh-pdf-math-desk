/**
 * The `/pdfdesk/*` surface.
 *
 *   GET  /pdfdesk/bootstrap        catalog + stored position + pending intents + links
 *   GET  /pdfdesk/artifacts        one chapter's produced files
 *   GET  /pdfdesk/artifact         one produced file's text, for the preview
 *   GET  /pdfdesk/pdf              one chapter's PDF, or a produced PDF, for the reader
 *   GET  /pdfdesk/pdf-ref          that PDF as a workspace-relative path
 *   GET  /pdfdesk/cover            a user-provided book cover image
 *   GET  /pdfdesk/context          how full one session's context is
 *   GET  /pdfdesk/chapter-cache    one chapter's brief cache state and text
 *   POST /pdfdesk/chapter-cache    request a brief, forget one, or forget all
 *   GET  /pdfdesk/questions        one chapter's page-mark questions
 *   PUT  /pdfdesk/questions        replace one chapter's questions
 *   POST /pdfdesk/print-page       one Markdown product as a printable HTML page
 *   POST /pdfdesk/digest           summarize a chapter's conversations
 *   GET  /pdfdesk/vendor/<file>    the reader's pdf.js build
 *   POST /pdfdesk/links            attach an existing session to a chapter
 *   POST /pdfdesk/links/remove     detach one chapter from a session
 *   PUT  /pdfdesk/state            persist the position
 *   POST /pdfdesk/pending          record a created-but-unused session
 *   POST /pdfdesk/pending/remove   forget one pending session
 *
 * The browser half owns no filesystem access, so every read the page needs
 * arrives through `bootstrap` or one of the read routes.
 *
 * @module dsh-pdf-workbench/routes
 */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative } from 'node:path'

import { chapterArtifactDir, countArtifacts, listArtifacts, readArtifact, resolveChapter } from './artifacts.js'
import { pathSegment, readAnnotations, seedAnnotations, writeAnnotations } from './annotations.js'
import { clearAllChapterCache, clearChapterCache, prepareChapterCache, readChapterCache } from './chapter-cache.js'
import { readQuestions, writeQuestions } from './questions.js'
import { prepareChapterText } from './chapter-text.js'
import { boundarySeq, ensureBaseSession, ensureBranchSession } from './base-session.js'
import { markdownToHtml, printPageHtml } from './print.js'
import { PLUGIN_VERSION } from './config.js'
import { fail, isLoopback, isSameOrigin, readJson, sendBytes, sendJson } from './http.js'
import { loadCatalog } from './index-source.js'
import { readPageBlocks } from './blocks.js'
import { translatePage } from './translate.js'
import { startChapterJob } from './translate-job.js'
import { artifactPdfPath, chapterPdfPath, readPdf } from './pdf-source.js'
import { checkForUpdate } from './update.js'
import { detectEnvironment } from './environment.js'
import { renderMarkdown } from './render.js'
import { readState, writeState } from './state.js'

/** Route prefix owned by this plugin. */
export const PREFIX = '/pdfdesk'

/** The reader's pdf.js build, by relative name so a path can never escape. */
function vendorContentType(name) {
  if (name === 'pdf.min.mjs' || name === 'pdf.worker.min.mjs') return 'text/javascript; charset=utf-8'
  if (/^wasm\/[A-Za-z0-9._-]+\.wasm$/.test(name)) return 'application/wasm'
  if (/^wasm\/[A-Za-z0-9._-]+_nowasm_fallback\.js$/.test(name)) return 'text/javascript; charset=utf-8'
  if (/^cmaps\/[A-Za-z0-9._-]+\.bcmap$/.test(name)) return 'application/octet-stream'
  // The hand-drawn text face, split into upstream's unicode-range subsets.
  if (/^fonts\/excalifont\/Excalifont-Regular-[a-f0-9]+\.woff2$/.test(name)) return 'font/woff2'
  if (name === 'fonts/excalifont/OFL.txt') return 'text/plain; charset=utf-8'
  if (name === 'fonts/zhhand/Xiaolai-Regular.ttf') return 'font/ttf'
  if (name === 'fonts/zhhand/OFL.txt') return 'text/plain; charset=utf-8'
  if (/^rough\/[^/]+\.mjs$/.test(name)) return 'text/javascript; charset=utf-8'
  if (name === 'rough/LICENSE') return 'text/plain; charset=utf-8'
  if (name === 'host-ui.cjs') return 'text/javascript; charset=utf-8'
  if (name === 'host-ui.css') return 'text/css; charset=utf-8'
  return null
}

/** Cover image extensions the shelf accepts, in preference order. */
const COVER_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/**
 * Book ids that have a user-provided cover, so the shelf can skip the 404 probe.
 * @param {string} dir - the active library's cover directory.
 * @returns {Promise<string[]>} ids without a known solution (may be empty).
 */
async function coverIds(dir) {
  try {
    const names = await readdir(dir)
    const ids = []
    for (const name of names) {
      const match = /^(.+)\.(png|jpe?g|webp)$/i.exec(name)
      if (match !== null) ids.push(match[1])
    }
    return ids
  } catch {
    return []
  }
}

/**
 * Read the request body for a mutation.
 * @param {import('node:http').IncomingMessage} request - inbound request.
 * @param {import('node:http').ServerResponse} response - outbound response.
 * @returns {Promise<unknown | undefined>} the body, or undefined after a failure was answered.
 */
async function mutationBody(request, response) {
  if (!isSameOrigin(request)) {
    fail(response, 403, 'cross-origin', '拒绝跨站写入')
    return undefined
  }
  try {
    return await readJson(request)
  } catch (error) {
    fail(response, 400, 'invalid-body', String(error && error.message ? error.message : error))
    return undefined
  }
}

/**
 * Build the prefix handler for the plugin's routes.
 * @param {{ libraryDir: string, fragmentDir: string, artifactDir: string, coverDir: string, indexPath: string, statePath: string, resumeRatio?: number, toolsDir?: string }} config - resolved paths and behavior (the profile's library is the fallback).
 * @param {{ resolveTarget?: () => Promise<{ workspaceId: string | null, cwd: string }>, listWorkspaces?: () => Promise<Array<{ id: string, title: string, path: string }>>, pending?: { list: Function, put: Function, remove: Function }, links?: { list: Function, add: Function, remove: Function }, contextPressure?: (sessionId: string) => Promise<object | null>, libraries?: { list: Function, active: Function, add: Function, setActive: Function, remove: Function }, installToolkit?: (libraryDir: string) => Promise<object> }} [options] - host capabilities the routes expose.
 * @returns {(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => Promise<void>} the handler.
 */
export function createHandler(config, options = {}) {
  const pending = options.pending
  const links = options.links
  const libraries = options.libraries
  // A burst of artifact reads (expand a chapter, click three files) must not
  // rescan the whole library each time; a short window is enough for that and
  // still refreshes on the next deliberate look.
  const CATALOG_TTL_MS = 2000
  let cachedCatalog = null
  let cachedAt = 0
  let cachedLibraryId = ''

  /**
   * The library every read route works on.
   * @returns {Promise<object>} the active library, or the profile's fallback.
   */
  /**
 * Locate a chapter's own PDF through the catalog (the same path the reader uses).
 * @param {object} library - active library entry.
 * @param {string} bookId - book id.
 * @param {string} code - chapter code.
 * @returns {Promise<string|null>} absolute path, or null when missing.
 */
function runTool(script, args) {
  const pythons = [process.env.MATH_DESK_PYTHON, 'python', 'py'].filter(Boolean)
  return new Promise((resolve, reject) => {
    const next = index => {
      if (index >= pythons.length) {
        reject(new Error('没有可用的 Python'))
        return
      }
      execFile(pythons[index], [script, ...args], { timeout: 240000, windowsHide: true }, error => {
        if (error === null) resolve()
        else next(index + 1)
      })
    }
    next(0)
  })
}

/**
 * Run one bundled tool and return its stdout (PDF sizes, font sizes, blocks).
 * @param {string} script - absolute tool path.
 * @param {string[]} args - tool arguments.
 * @returns {Promise<string>} the tool's stdout.
 */
function toolOutput(script, args) {
  const pythons = [process.env.MATH_DESK_PYTHON, 'python', 'py'].filter(Boolean)
  return new Promise((resolve, reject) => {
    const next = index => {
      if (index >= pythons.length) {
        reject(new Error('没有可用的 Python'))
        return
      }
      execFile(
        pythons[index],
        [script, ...args],
        { timeout: 180000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        (error, stdout) => {
          if (error === null) resolve(stdout)
          else next(index + 1)
        }
      )
    }
    next(0)
  })
}

async function chapterPdf(library, bookId, code) {
  const current = await catalog()
  const match = resolveChapter(current, bookId, code)
  if (match.ok !== true) return null
  const source = chapterPdfPath(library, match.book, match.chapter)
  return source.ok ? source.path : null
}

/**
 * The DeepSeek key for translation: config or env first, then the stored file.
 * @returns {Promise<string>} the key, or '' when none is configured.
 */
async function deepseekKey() {
  if (typeof config.deepseekApiKey === 'string' && config.deepseekApiKey !== '') return config.deepseekApiKey
  try {
    const raw = await readFile(join(config.dataDir, 'deepseek.json'), 'utf8')
    const stored = JSON.parse(raw)
    return typeof stored.apiKey === 'string' ? stored.apiKey : ''
  } catch {
    return ''
  }
}

async function activeLibrary() {
    if (libraries !== undefined && typeof libraries.active === 'function') {
      return await libraries.active()
    }
    return {
      id: 'default',
      name: '',
      mode: 'math',
      libraryDir: config.libraryDir,
      fragmentDir: config.fragmentDir,
      artifactDir: config.artifactDir,
      coverDir: config.coverDir,
      indexPath: config.indexPath,
    }
  }

  /**
   * The bundled sample library's manifest, when the package ships one.
   * @returns {Promise<object | null>} `{ book, files }` or null.
   */
  async function readSampleManifest() {
    try {
      const manifest = JSON.parse(await readFile(join(config.samplesDir, 'manifest.json'), 'utf8'))
      return manifest !== null && typeof manifest === 'object' ? manifest : null
    } catch {
      return null
    }
  }

  /**
   * The catalog of one library, reused for a couple of seconds; `fresh` rescans.
   * @param {boolean} [fresh] - ignore the cached copy.
   * @returns {Promise<Awaited<ReturnType<typeof loadCatalog>>>} the catalog.
   */
  async function catalog(fresh) {
    const library = await activeLibrary()
    if (fresh !== true && cachedCatalog !== null && cachedLibraryId === library.id && Date.now() - cachedAt < CATALOG_TTL_MS) {
      return cachedCatalog
    }
    cachedCatalog = await loadCatalog({
      fragmentDir: library.fragmentDir,
      indexPath: library.indexPath,
      libraryDir: library.libraryDir,
      artifactDir: library.artifactDir,
      coverDir: library.coverDir,
    })
    cachedLibraryId = library.id
    cachedAt = Date.now()
    return cachedCatalog
  }

  /**
   * Resolve `book` + `code` from the query against the live catalog.
   * @param {URL} url - the request URL.
   * @returns {Promise<{ ok: true, book: object, chapter: object } | { ok: false, status: number, code: string, message: string }>} the match or the refusal to answer.
   */
  async function chapterFromQuery(url) {
    const match = resolveChapter(await catalog(), url.searchParams.get('book') ?? '', (url.searchParams.get('code') ?? '').toLowerCase())
    if (match.ok) return match
    return { ...match, status: match.code === 'unknown-chapter' ? 404 : 400 }
  }

  return async function handle(request, response) {
    try {
      // DSH's trust fence: Host/Origin validation and browser authentication.
      // The loopback check below is defence-in-depth, not the authentication.
      if (typeof options.requestRejection === 'function') {
        const rejection = options.requestRejection(request)
        if (rejection !== undefined) {
          response.statusCode = rejection
          response.end()
          return
        }
      }
      if (!isLoopback(request)) {
        fail(response, 403, 'forbidden', '只接受本机请求')
        return
      }
      const url = new URL(request.url ?? '/', 'http://localhost')
      const path = url.pathname.replace(/\/+$/, '')

      // Temporary development probe for the session APIs stage 7.6 needs.
      // Read-only: it never creates, sends to, or archives a session.
      if (path === `${PREFIX}/_session-probe`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const probe = typeof options.sessionServices === 'function' ? options.sessionServices() : null
          if (probe === null || probe === undefined || probe.sessions === undefined || probe.agents === undefined) {
            fail(response, 503, 'probe-unavailable', '会话服务尚未就绪')
            return
          }
          const live = probe.sessions.list().slice(0, 3)
          const first = live[0]
          let boundary = null
          if (first !== undefined) {
            try {
              boundary = probe.agents.turnBoundaryOf(first)
            } catch (error) {
              boundary = { error: String(error && error.message ? error.message : error) }
            }
          }
          let events = []
          if (first !== undefined) {
            const source = typeof first.events === 'function' ? first.events() : first.events
            events = Array.isArray(source) ? source : []
          }
          const lastUser = [...events].reverse().find(event => event !== null && event !== undefined && event.type === 'user/message')
          const data = lastUser === undefined ? null : (lastUser.data === undefined ? lastUser : lastUser.data)
          const workspace = probe.workspace
          sendJson(response, 200, {
            ok: true,
            sessionIds: live.map(session => String(session.id)),
            boundary,
            userKeys: data === null ? null : Object.keys(data),
            contentTypes: data !== null && Array.isArray(data.content) ? data.content.map(block => (block === null ? null : block.type)) : null,
            workspaceArchive: workspace === undefined ? null : typeof workspace.archiveSession === 'function',
          })
        } catch (error) {
          fail(response, 500, 'probe-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      // Features that need a catalog stop at a clear 409 instead of inventing a
      // default library. Library management, settings, static assets and session
      // bookkeeping remain available so the user can add the first library.
      const libraryFree = path === `${PREFIX}/bootstrap`
        || path.startsWith(`${PREFIX}/libraries`)
        || path === `${PREFIX}/update`
        || path === `${PREFIX}/qa-persona`
        || path === `${PREFIX}/deepseek-key`
        || path.startsWith(`${PREFIX}/vendor/`)
        || path === `${PREFIX}/state`
        || path === `${PREFIX}/pending`
        || path === `${PREFIX}/pending/remove`
        || path === `${PREFIX}/context`
        || path === `${PREFIX}/purge`
      if (!libraryFree && (libraries === undefined || (await libraries.active()) === null)) {
        fail(response, 409, 'no-library', '还没有书库，请先在书库页添加一个')
        return
      }

      if (path === `${PREFIX}/qa-persona`) {
        if (request.method !== 'GET') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET')
          return
        }
        // The Socratic persona is a local workflow file, never shipped with the
        // plugin: `~/.dsh/pdfdesk/qa-persona.md`. A missing file is simply empty.
        try {
          const raw = await readFile(join(config.dataDir, 'qa-persona.md'), 'utf8')
          sendJson(response, 200, { ok: true, persona: raw })
        } catch {
          sendJson(response, 200, { ok: true, persona: '' })
        }
        return
      }

      if (path === `${PREFIX}/bootstrap`) {
        if (request.method !== 'GET') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET')
          return
        }
        // The Refresh button is a deliberate look: bypass the short reuse window.
        // A first run has no library: return an explicit empty payload so the
        // browser shows the add-a-library page instead of a fabricated default.
        const libraryList = libraries === undefined || typeof libraries.list !== 'function'
          ? { items: [], activeId: null }
          : await libraries.list()
        const library = libraryList.items.length === 0 ? null : await activeLibrary()
        const state = await readState(config.statePath)
        if (library === null) {
          sendJson(response, 200, {
            ok: true,
            version: PLUGIN_VERSION,
            source: 'missing',
            indexIgnored: false,
            problem: null,
            library: null,
            libraries: libraryList,
            libraryDir: '',
            fragmentDir: '',
            artifactDir: '',
            indexPath: '',
            covers: [],
            target: { workspaceId: null, cwd: '' },
            environment: { ...detectEnvironment(), apiKey: (await deepseekKey()) !== '' },
            workspaces: typeof options.listWorkspaces === 'function' ? await options.listWorkspaces() : [],
            resumeRatio: typeof config.resumeRatio === 'number' ? config.resumeRatio : 0.85,
            pending: pending === undefined ? {} : await pending.list(),
            links: links === undefined ? {} : await links.list(),
            shelves: { hidden: [], shelves: [] },
            books: [],
            skipped: [],
            warnings: [],
            state,
          })
          return
        }
        let fresh
        try {
          fresh = await catalog(true)
        } catch (error) {
          fresh = {
            source: 'missing',
            indexIgnored: false,
            problem: String(error !== null && error !== undefined && error.message ? error.message : error),
            books: [],
            skipped: [],
            warnings: [],
          }
        }
        const target = typeof options.resolveTarget === 'function'
          ? await options.resolveTarget()
          : { workspaceId: null, cwd: library.libraryDir }
        // Every chapter carries its absolute PDF path once. A new conversation's
        // prompt can then name the file directly instead of paying for a search;
        // an unplaceable chapter (hand-edited catalog) simply has no path.
        const pdfConfig = { libraryDir: library.libraryDir, fragmentDir: library.fragmentDir }
        const booksWithPaths = (Array.isArray(fresh.books) ? fresh.books : []).map(book => ({
          ...book,
          chapters: Array.isArray(book.chapters)
            ? book.chapters.map(chapter => {
              const pdf = chapterPdfPath(pdfConfig, book, chapter)
              return pdf.ok ? { ...chapter, pdfPath: pdf.path } : chapter
            })
            : book.chapters,
        }))
        sendJson(response, 200, {
          ok: true,
          version: PLUGIN_VERSION,
          source: fresh.source,
          indexIgnored: fresh.indexIgnored,
          problem: fresh.problem,
          library: {
            id: library.id,
            name: library.name,
            mode: library.mode,
            libraryDir: library.libraryDir,
            fragmentDir: library.fragmentDir,
            artifactDir: library.artifactDir,
            coverDir: library.coverDir,
          },
          libraries: libraryList,
          libraryDir: library.libraryDir,
          fragmentDir: library.fragmentDir,
          artifactDir: library.artifactDir,
          indexPath: library.indexPath,
          covers: await coverIds(library.coverDir),
          target,
          environment: { ...detectEnvironment(), apiKey: (await deepseekKey()) !== '' },
          workspaces: typeof options.listWorkspaces === 'function' ? await options.listWorkspaces() : [],
          resumeRatio: typeof config.resumeRatio === 'number' ? config.resumeRatio : 0.85,
          pending: pending === undefined ? {} : await pending.list(),
          links: links === undefined ? {} : await links.list(),
          shelves: options.shelves === undefined ? { hidden: [], shelves: [] } : await options.shelves.get(library.id),
          books: booksWithPaths,
          skipped: fresh.skipped,
          warnings: fresh.warnings,
          state,
        })
        return
      }

      if (path === `${PREFIX}/update`) {
        if (request.method !== 'GET') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET')
          return
        }
        const result = await checkForUpdate(config.updateProxy)
        sendJson(response, 200, result)
        return
      }

      if (path === `${PREFIX}/render`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const body = await readJson(request)
          const catalog = await loadCatalog(config)
          const chapter = resolveChapter(catalog, body.book, body.code)
          if (chapter === null) {
            fail(response, 404, 'no-chapter', '找不到这一章')
            return
          }
          const name = basename(String(body.name ?? ''))
          if (!/\.md$/i.test(name)) {
            fail(response, 400, 'bad-name', '只支持渲染 .md 文件')
            return
          }
          const library = await activeLibrary()
          const dir = join(library.libraryDir, '产物', body.book, body.code)
          const source = join(dir, name)
          try {
            await stat(source)
          } catch {
            fail(response, 404, 'missing-file', '文件不存在（可能已被删除），请点「重新读取」刷新列表')
            return
          }
          const out = `${source.slice(0, source.length - 3)}.pdf`
          await renderMarkdown(options.md2texScript, source, out)
          sendJson(response, 200, { ok: true, path: out })
        } catch (error) {
          fail(response, 503, 'render-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/print-page`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        const body = await mutationBody(request, response)
        if (body === undefined) return
        const record = body !== null && typeof body === 'object' ? body : {}
        const match = resolveChapter(await catalog(), record.book, String(record.code ?? '').toLowerCase())
        if (match.ok !== true) {
          fail(response, match.code === 'unknown-chapter' ? 404 : 400, match.code, match.message)
          return
        }
        const name = typeof record.name === 'string' ? record.name : ''
        // Only a text product can become a print page; a PDF prints itself.
        if (!/\.(md|markdown|txt)$/i.test(name)) {
          fail(response, 400, 'not-printable', '只有 Markdown 产物可以生成打印页')
          return
        }
        const library = await activeLibrary()
        const artifact = await readArtifact(library, match.book, match.chapter, name)
        if (artifact.ok !== true) {
          fail(response, artifact.reason === 'not-found' ? 404 : 400, 'print-read-failed', '读不到这个产物')
          return
        }
        const html = printPageHtml(`${match.book.id} / ${match.chapter.code} / ${name}`, markdownToHtml(artifact.text))
        sendJson(response, 200, { ok: true, title: name, html })
        return
      }

      if (path === `${PREFIX}/deepseek-key`) {
        if (request.method === 'GET') {
          sendJson(response, 200, { ok: true, configured: (await deepseekKey()) !== '' })
          return
        }
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET 或 POST')
          return
        }
        try {
          const body = await readJson(request)
          const key = typeof body.key === 'string' ? body.key.trim() : ''
          if (key !== '' && !key.startsWith('sk-')) {
            fail(response, 400, 'bad-key', 'API Key 应以 sk- 开头')
            return
          }
          await mkdir(config.dataDir, { recursive: true })
          await writeFile(join(config.dataDir, 'deepseek.json'), `${JSON.stringify({ apiKey: key })}\n`, { encoding: 'utf8', mode: 0o600 })
          sendJson(response, 200, { ok: true, configured: key !== '' })
        } catch (error) {
          fail(response, 500, 'key-save-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/blocks`) {
        try {
          const book = url.searchParams.get('book') ?? ''
          const code = (url.searchParams.get('code') ?? '').toLowerCase()
          const page = Number.parseInt(url.searchParams.get('page') ?? '', 10)
          if (!Number.isFinite(page) || page < 1) {
            fail(response, 400, 'bad-page', '页码不合法')
            return
          }
          const library = await activeLibrary()
          const source = await chapterPdf(library, book, code)
          if (source === null) {
            fail(response, 404, 'missing-file', '找不到这一章的 PDF 文件')
            return
          }
          const blocks = await readPageBlocks({
            script: join(config.toolsDir, 'pdf_blocks.py'),
            source,
            pageIndex: page,
          })
          sendJson(response, 200, { ok: true, blocks })
        } catch (error) {
          fail(response, 500, 'blocks-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/chapter-text`) {
        try {
          const book = url.searchParams.get('book') ?? ''
          const code = (url.searchParams.get('code') ?? '').toLowerCase()
          const library = await activeLibrary()
          const source = await chapterPdf(library, book, code)
          if (source === null) {
            fail(response, 404, 'missing-file', '找不到这一章的 PDF 文件')
            return
          }
          const result = await prepareChapterText({
            script: join(config.toolsDir, 'pdf_text.py'),
            source,
            libraryDir: library.libraryDir,
            book,
            code,
            refresh: url.searchParams.get('refresh') === '1',
            run: (script, args) => toolOutput(script, args),
          })
          sendJson(response, 200, { ok: true, ...result })
        } catch (error) {
          const noText = error !== null && error !== undefined && error.code === 'no-text'
          fail(
            response,
            noText ? 422 : 500,
            noText ? 'no-text' : 'text-failed',
            String(error && error.message ? error.message : error)
          )
        }
        return
      }

      if (path === `${PREFIX}/base-session`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const body = await readJson(request)
          const book = typeof body.book === 'string' ? body.book : ''
          const code = typeof body.code === 'string' ? body.code.toLowerCase() : ''
          const mode = typeof body.mode === 'string' ? body.mode : ''
          const library = await activeLibrary()
          const source = await chapterPdf(library, book, code)
          if (source === null) {
            fail(response, 404, 'missing-file', '找不到这一章的 PDF 文件')
            return
          }
          const info = await stat(source)
          const text = await prepareChapterText({
            script: join(config.toolsDir, 'pdf_text.py'),
            source,
            libraryDir: library.libraryDir,
            book,
            code,
            run: (script, args) => toolOutput(script, args),
          })
          const services = typeof options.sessionServices === 'function' ? options.sessionServices() : null
          if (services === null || services === undefined || services.agents === undefined || services.query === undefined) {
            fail(response, 503, 'session-unavailable', '会话服务尚未就绪')
            return
          }
          const base = await ensureBaseSession({
            agents: services.agents,
            workspace: services.workspace,
            libraryDir: library.libraryDir,
            book,
            code,
            cwd: library.libraryDir,
            pdf: { size: info.size, mtimeMs: Math.round(info.mtimeMs) },
            textPath: text.path,
            createMessage: value => ({
              role: 'user',
              id: `pdfdesk-${randomUUID()}`,
              content: [{ type: 'text', text: value }],
              source: { kind: 'user' },
            }),
            newId: () => `session-${randomUUID()}`,
            atSeqOf: boundarySeq,
          })
          let branch = null
          if (mode !== '') {
            branch = await ensureBranchSession({
              agents: services.agents,
              sessionQuery: services.query,
              libraryDir: library.libraryDir,
              book,
              code,
              cwd: library.libraryDir,
              manifest: base.manifest,
              mode,
              newId: () => `session-${randomUUID()}`,
            })
          }
          sendJson(response, 200, {
            ok: true,
            base: { id: base.sessionId, created: base.created },
            branch: branch === null ? null : { id: branch.sessionId, created: branch.created },
          })
        } catch (error) {
          const reason = error !== null && error !== undefined ? error.code : ''
          if (reason === 'no-text') {
            fail(response, 422, 'no-text', '这一章没有可提取的文本（可能是扫描件）')
          } else if (reason === 'bad-mode' || reason === 'no-base') {
            fail(response, 400, String(reason), String(error && error.message ? error.message : error))
          } else if (reason === 'no-boundary') {
            fail(response, 409, 'no-boundary', '基础会话没有完成一个完整回合')
          } else {
            fail(response, 500, 'base-session-failed', String(error && error.message ? error.message : error))
          }
        }
        return
      }

      if (path === `${PREFIX}/translate-chapter`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const body = await readJson(request)
          const target = body.target === 'zh' ? 'zh' : 'en'
          // `resume` fills pages that never came back, reusing the cached
          // per-page markdown instead of paying to translate them again.
          const resume = body.resume === true
          const library = await activeLibrary()
          const source = await chapterPdf(library, body.book, body.code)
          if (source === null) {
            fail(response, 404, 'missing-file', '找不到这一章的 PDF 文件')
            return
          }
          const outPath = join(dirname(source), `${basename(source, '.pdf')}_translated.pdf`)
          const jobId = await startChapterJob({
            jobDir: join(config.dataDir, 'translate-jobs'),
            cacheDir: join(config.dataDir, 'translation', body.book, body.code),
            toolsDir: config.toolsDir,
            overlayPath: join(dirname(source), `${basename(source, '.pdf')}_overlay.pdf`),
            rasterScript: join(config.toolsDir, 'pdf_raster.py'),
            md2texScript: options.md2texScript,
            apiKey: await deepseekKey(),
            source,
            outPath,
            target,
            book: body.book,
            code: body.code,
            resume,
          })
          sendJson(response, 200, { ok: true, jobId })
        } catch (error) {
          fail(response, 502, 'translate-start-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/translate-status`) {
        try {
          const jobId = url.searchParams.get('job') ?? ''
          if (!/^tr-[a-z0-9]+$/.test(jobId)) {
            fail(response, 400, 'bad-job', '任务编号不合法')
            return
          }
          const raw = await readFile(join(config.dataDir, 'translate-jobs', `${jobId}.json`), 'utf8')
          const state = JSON.parse(raw)
          sendJson(response, 200, { ...state, ok: true })
        } catch (error) {
          fail(response, 404, 'job-missing', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/translate-cancel`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const body = await readJson(request)
          const jobId = typeof body.job === 'string' ? body.job : ''
          if (!/^tr-[a-z0-9]+$/.test(jobId)) {
            fail(response, 400, 'bad-job', '任务编号不合法')
            return
          }
          await mkdir(join(config.dataDir, 'translate-jobs'), { recursive: true })
          await writeFile(join(config.dataDir, 'translate-jobs', `${jobId}.cancel`), '1', 'utf8')
          sendJson(response, 200, { ok: true })
        } catch (error) {
          fail(response, 500, 'cancel-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/chapter-cache`) {
        if (request.method === 'GET') {
          const match = await chapterFromQuery(url)
          if (match.ok !== true) {
            fail(response, match.status, match.code, match.message)
            return
          }
          const library = await activeLibrary()
          const source = chapterPdfPath(library, match.book, match.chapter)
          const cache = await readChapterCache(
            library.libraryDir,
            match.book.id,
            match.chapter.code,
            source.ok ? source.path : null,
          )
          sendJson(response, 200, { ok: true, cache })
          return
        }
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET 或 POST')
          return
        }
        const body = await mutationBody(request, response)
        if (body === undefined) return
        const record = body !== null && typeof body === 'object' ? body : {}
        const action = typeof record.action === 'string' ? record.action : ''
        const library = await activeLibrary()
        if (action === 'clear-all') {
          const result = await clearAllChapterCache(library.libraryDir)
          sendJson(response, 200, { ok: true, ...result })
          return
        }
        if (action !== 'prepare' && action !== 'clear') {
          fail(response, 400, 'unknown-action', `未知的缓存操作：${action}`)
          return
        }
        const match = resolveChapter(await catalog(), record.book, String(record.code ?? '').toLowerCase())
        if (match.ok !== true) {
          fail(response, match.code === 'unknown-chapter' ? 404 : 400, match.code, match.message)
          return
        }
        if (action === 'clear') {
          const result = await clearChapterCache(library.libraryDir, match.book.id, match.chapter.code)
          sendJson(response, 200, { ok: true, ...result })
          return
        }
        const source = chapterPdfPath(library, match.book, match.chapter)
        if (source.ok !== true) {
          fail(response, 409, 'pdf-missing', '这一章没有可用的 PDF，无法建立章节缓存')
          return
        }
        const cache = await prepareChapterCache(
          library.libraryDir,
          match.book.id,
          match.chapter.code,
          source.path,
          typeof record.sessionId === 'string' ? record.sessionId : '',
        )
        sendJson(response, 200, { ok: true, cache })
        return
      }

      if (path === `${PREFIX}/questions`) {
        const library = await activeLibrary()
        if (request.method === 'GET') {
          const match = await chapterFromQuery(url)
          if (match.ok !== true) {
            fail(response, match.status, match.code, match.message)
            return
          }
          sendJson(response, 200, { ok: true, ...(await readQuestions(library.libraryDir, match.book.id, match.chapter.code)) })
          return
        }
        if (request.method !== 'PUT') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET 或 PUT')
          return
        }
        const body = await mutationBody(request, response)
        if (body === undefined) return
        const record = body !== null && typeof body === 'object' ? body : {}
        const match = resolveChapter(await catalog(), record.book, String(record.code ?? '').toLowerCase())
        if (match.ok !== true) {
          fail(response, match.code === 'unknown-chapter' ? 404 : 400, match.code, match.message)
          return
        }
        try {
          sendJson(response, 200, { ok: true, ...(await writeQuestions(library.libraryDir, match.book.id, match.chapter.code, record)) })
        } catch (error) {
          fail(response, 400, 'questions-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/annotations`) {
        try {
          const library = await activeLibrary()
          if (request.method === 'POST') {
            const body = await readJson(request)
            const book = pathSegment(body.book)
            const code = pathSegment(String(body.code ?? '').toLowerCase())
            const page = Number.parseInt(String(body.page ?? ''), 10)
            if (book === '' || code === '' || !Number.isFinite(page) || page < 1) {
              fail(response, 400, 'bad-annotations-request', '书、章或页码不合法')
              return
            }
            const result = await writeAnnotations(library.libraryDir, book, code, page, body)
            sendJson(response, 200, { ok: true, updatedAt: result.updatedAt })
            return
          }
          const book = pathSegment(url.searchParams.get('book'))
          const code = pathSegment((url.searchParams.get('code') ?? '').toLowerCase())
          if (book === '' || code === '') {
            fail(response, 400, 'bad-annotations-request', '书或章不合法')
            return
          }
          sendJson(response, 200, { ok: true, ...(await readAnnotations(library.libraryDir, book, code)) })
        } catch (error) {
          fail(response, 500, 'annotations-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/annotations-bulk`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const body = await readJson(request)
          const book = pathSegment(body.book)
          const code = pathSegment(String(body.code ?? '').toLowerCase())
          if (book === '' || code === '') {
            fail(response, 400, 'bad-annotations-request', '书或章不合法')
            return
          }
          const library = await activeLibrary()
          const result = await seedAnnotations(library.libraryDir, book, code, body.pages)
          sendJson(response, 200, { ok: true, added: result.added })
        } catch (error) {
          fail(response, 500, 'annotations-bulk-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/import-annots`) {        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const body = await readJson(request)
          const library = await activeLibrary()
          const file = join(library.artifactDir, body.book, body.code, `${body.code}_export.annots.json`)
          let spec = null
          try {
            spec = JSON.parse(await readFile(file, 'utf8'))
          } catch {
            fail(response, 404, 'no-sidecar', '没有找到标注 sidecar，请先「导出整章」')
            return
          }
          const pages = spec !== null && Array.isArray(spec.pages) ? spec.pages : []
          sendJson(response, 200, { ok: true, pages })
        } catch (error) {
          fail(response, 500, 'import-annots-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/export-chapter`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const body = await readJson(request, 8 * 1024 * 1024)
          const library = await activeLibrary()
          const source = await chapterPdf(library, body.book, body.code)
          if (source === null) {
            fail(response, 404, 'missing-file', '找不到这一章的 PDF 文件')
            return
          }
          const pages = Array.isArray(body.pages) ? body.pages : []
          const jobDir = join(config.dataDir, 'export-jobs')
          await mkdir(jobDir, { recursive: true })
          const jobId = `ex-${Date.now().toString(36)}`
          const progressPath = join(jobDir, `${jobId}.progress.json`)
          const specPath = join(jobDir, `${jobId}.spec.json`)
          await writeFile(specPath, JSON.stringify({ pages }), 'utf8')
          const overlayPath = join(dirname(source), `${basename(source, '.pdf')}_overlay.pdf`)
          const outDir = join(library.artifactDir, body.book, body.code)
          await mkdir(outDir, { recursive: true })
          const outName = `${body.code}_export.pdf`
          const jsonName = `${body.code}_export.annots.json`
          await writeFile(join(outDir, jsonName),
            JSON.stringify({ version: 1, book: body.book, code: body.code, pages }, null, 2), 'utf8')
          const outPath = join(outDir, outName)
          // Compose in the background and let the client poll the progress file;
          // a long chapter must not hang one HTTP request.
          void runTool(join(config.toolsDir, 'export_chapter.py'),
            [source, overlayPath, specPath, outPath, progressPath])
            .then(() => {})
            .catch(() => writeFile(`${progressPath}.error`, '1', 'utf8').catch(() => {}))
          sendJson(response, 200, { ok: true, jobId, pdf: outName, json: jsonName, pages: pages.length })
        } catch (error) {
          fail(response, 500, 'export-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/export-status`) {
        try {
          const jobId = url.searchParams.get('job') ?? ''
          if (!/^ex-[a-z0-9]+$/.test(jobId)) {
            fail(response, 400, 'bad-job', '任务编号不合法')
            return
          }
          const progressPath = join(config.dataDir, 'export-jobs', `${jobId}.progress.json`)
          let state = { status: 'running', done: 0, total: 0 }
          try {
            state = JSON.parse(await readFile(progressPath, 'utf8'))
          } catch {
            state = { status: 'running', done: 0, total: 0 }
          }
          if (existsSync(`${progressPath}.error`)) state = { status: 'error', error: '导出失败' }
          sendJson(response, 200, { ...state, ok: true })
        } catch (error) {
          fail(response, 404, 'status-missing', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/export-cancel`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const body = await readJson(request)
          const jobId = typeof body.job === 'string' ? body.job : ''
          if (!/^ex-[a-z0-9]+$/.test(jobId)) {
            fail(response, 400, 'bad-job', '任务编号不合法')
            return
          }
          await mkdir(join(config.dataDir, 'export-jobs'), { recursive: true })
          await writeFile(join(config.dataDir, 'export-jobs', `${jobId}.progress.json.cancel`), '1', 'utf8')
          sendJson(response, 200, { ok: true })
        } catch (error) {
          fail(response, 500, 'cancel-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/export-page`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const body = await readJson(request, 8 * 1024 * 1024)
          const library = await activeLibrary()
          const source = await chapterPdf(library, body.book, body.code)
          if (source === null) {
            fail(response, 404, 'missing-file', '找不到这一章的 PDF 文件')
            return
          }
          const page = Math.max(1, Math.round(Number(body.page) || 1))
          const masks = Array.isArray(body.masks) ? body.masks : []
          const annots = Array.isArray(body.annots) ? body.annots : []
          const tmpDir = join(config.dataDir, 'tmp')
          await mkdir(tmpDir, { recursive: true })
          const stamp = Date.now().toString(36)
          const masksPath = join(tmpDir, `export-${stamp}-masks.json`)
          const annotsPath = join(tmpDir, `export-${stamp}-annots.json`)
          await writeFile(masksPath, JSON.stringify(masks), 'utf8')
          await writeFile(annotsPath, JSON.stringify(annots), 'utf8')
          const overlayPath = join(dirname(source), `${basename(source, '.pdf')}_overlay.pdf`)
          const outDir = join(library.artifactDir, body.book, body.code)
          await mkdir(outDir, { recursive: true })
          const outName = `${body.code}_p${String(page).padStart(3, '0')}_export.pdf`
          const outPath = join(outDir, outName)
          try {
            await runTool(join(config.toolsDir, 'export_page.py'), [
              source, overlayPath, String(page), masksPath, annotsPath, outPath,
            ])
          } finally {
            await unlink(masksPath).catch(() => {})
            await unlink(annotsPath).catch(() => {})
          }
          sendJson(response, 200, { ok: true, pdf: outName, page })
        } catch (error) {
          fail(response, 500, 'export-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/rebuild-overlay`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const body = await readJson(request)
          const library = await activeLibrary()
          const source = await chapterPdf(library, body.book, body.code)
          if (source === null) {
            fail(response, 404, 'missing-file', '找不到这一章的 PDF 文件')
            return
          }
          const cacheDir = join(config.dataDir, 'translation', body.book, body.code)
          const outPath = join(dirname(source), `${basename(source, '.pdf')}_overlay.pdf`)
          await runTool(join(config.toolsDir, 'rebuild_overlay.py'), [source, cacheDir, outPath, config.toolsDir])
          sendJson(response, 200, { ok: true, pdf: basename(outPath) })
        } catch (error) {
          fail(response, 500, 'rebuild-overlay-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/realign-overlay`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const body = await readJson(request)
          const library = await activeLibrary()
          const source = await chapterPdf(library, body.book, body.code)
          if (source === null) {
            fail(response, 404, 'missing-file', '找不到这一章的 PDF 文件')
            return
          }
          const cacheDir = join(config.dataDir, 'translation', body.book, body.code)
          let pages = []
          try {
            pages = (await readdir(cacheDir)).filter(name => /^page-\d+\.md$/.test(name))
          } catch {
            pages = []
          }
          if (pages.length === 0) {
            fail(response, 404, 'no-cache', '还没有可复用的逐页译文，请先翻译这一章')
            return
          }
          const outPath = join(dirname(source), `${basename(source, '.pdf')}_overlay.pdf`)
          // This is an approximation built from cached text, so the overlay it
          // replaces stays next to it as `.bak` instead of just vanishing.
          await copyFile(outPath, `${outPath}.bak`).catch(() => {})
          await runTool(join(config.toolsDir, 'realign_overlay.py'), [source, cacheDir, outPath, config.toolsDir])
          sendJson(response, 200, { ok: true, pdf: basename(outPath) })
        } catch (error) {
          fail(response, 500, 'realign-overlay-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/rebuild-translated`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const body = await readJson(request)
          const library = await activeLibrary()
          const source = await chapterPdf(library, body.book, body.code)
          if (source === null) {
            fail(response, 404, 'missing-file', '找不到这一章的 PDF 文件')
            return
          }
          const cacheDir = join(config.dataDir, 'translation', body.book, body.code)
          let pages = []
          try {
            pages = (await readdir(cacheDir)).filter(name => /^page-\d+\.md$/.test(name)).sort()
          } catch {
            pages = []
          }
          if (pages.length === 0) {
            fail(response, 404, 'no-cache', '还没有可复用的逐页译文，请先翻译这一章')
            return
          }
          const outPath = join(dirname(source), `${basename(source, '.pdf')}_translated.pdf`)
          // Re-render only when the renderer changed: the marker keeps re-opening
          // bilingual mode from spending seconds in XeLaTeX every time.
          const marker = join(cacheDir, '.render-version')
          let rendered = ''
          try {
            rendered = (await readFile(marker, 'utf8')).trim()
          } catch {
            rendered = ''
          }
          if (rendered === PLUGIN_VERSION) {
            sendJson(response, 200, { ok: true, skipped: true, pdf: basename(outPath) })
            return
          }
          const chunks = []
          for (const name of pages) chunks.push(await readFile(join(cacheDir, name), 'utf8'))
          // Render on the source's own paper size: bilingual columns then look
          // like one book instead of "chapter page next to an A4 sheet".
          let paper = ''
          try {
            const sizes = JSON.parse(await toolOutput(join(config.toolsDir, 'pdf_pagesizes.py'), [source]))
            const size = Array.isArray(sizes) ? sizes[0] : null
            if (Array.isArray(size) && size.length === 2) paper = `${size[0] / 72},${size[1] / 72}`
          } catch {
            paper = ''
          }
          const draft = join(cacheDir, `.render-${PLUGIN_VERSION}.md`)
          await writeFile(draft, chunks.join('\n\n\\newpage\n\n'), 'utf8')
          try {
            await renderMarkdown(
              options.md2texScript,
              draft,
              outPath,
              {
                // No generated heading: the pages carry the book's own one.
                MATH_DESK_NO_TITLE: '1',
                ...(paper === '' ? {} : { MATH_DESK_PAPER: paper }),
              }
            )
          } finally {
            await unlink(draft).catch(() => {})
          }
          await writeFile(marker, PLUGIN_VERSION, 'utf8').catch(() => {})
          sendJson(response, 200, { ok: true, pdf: basename(outPath) })
        } catch (error) {
          fail(response, 500, 'rebuild-translated-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/translate-page`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const body = await readJson(request, 16 * 1024 * 1024)
          const image = typeof body.image === 'string' ? body.image : ''
          if (!image.startsWith('data:image/')) {
            fail(response, 400, 'bad-image', '缺少页面图片')
            return
          }
          if (image.length > 24 * 1024 * 1024) {
            fail(response, 413, 'image-too-large', '页面图片过大，请降低渲染倍率')
            return
          }
          const target = body.target === 'zh' ? 'zh' : 'en'
          const library = await activeLibrary()
          const source = await chapterPdf(library, body.book, body.code)
          if (source === null) {
            fail(response, 404, 'missing-file', '找不到这一章的 PDF 文件')
            return
          }
          const dir = dirname(source)
          const name = basename(source)
          const markdown = await translatePage({ apiKey: await deepseekKey(), image, target })
          if (body.mdOnly === true) {
            sendJson(response, 200, { ok: true, md: markdown })
            return
          }
          const mdPath = join(dir, `.translate-${Date.now()}.md`)
          await writeFile(mdPath, markdown, 'utf8')
          const out = join(dir, `${name.slice(0, name.length - 4)}_translated.pdf`)
          try {
            // The translated page keeps the book's own chapter heading; a
            // generated one would print the temp file name above it.
            await renderMarkdown(options.md2texScript, mdPath, out, { MATH_DESK_NO_TITLE: '1' })
          } finally {
            await unlink(mdPath).catch(() => {})
          }
          sendJson(response, 200, { ok: true, pdf: basename(out) })
        } catch (error) {
          fail(response, 502, 'translate-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/translate-render`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const body = await readJson(request, 32 * 1024 * 1024)
          const markdown = typeof body.md === 'string' ? body.md : ''
          if (markdown.trim() === '') {
            fail(response, 400, 'bad-markdown', '译文内容为空')
            return
          }
          const library = await activeLibrary()
          const source = await chapterPdf(library, body.book, body.code)
          if (source === null) {
            fail(response, 404, 'missing-file', '找不到这一章的 PDF 文件')
            return
          }
          const dir = dirname(source)
          const name = basename(source)
          const mdPath = join(dir, `.translate-${Date.now()}.md`)
          await writeFile(mdPath, markdown, 'utf8')
          const out = join(dir, `${name.slice(0, name.length - 4)}_translated.pdf`)
          try {
            await renderMarkdown(options.md2texScript, mdPath, out, { MATH_DESK_NO_TITLE: '1' })
          } finally {
            await unlink(mdPath).catch(() => {})
          }
          sendJson(response, 200, { ok: true, pdf: basename(out) })
        } catch (error) {
          fail(response, 502, 'translate-render-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/translated-info`) {
        try {
          const book = url.searchParams.get('book') ?? ''
          const name = basename(url.searchParams.get('name') ?? '')
          if (!/\.pdf$/i.test(name)) {
            sendJson(response, 200, { ok: true, exists: false })
            return
          }
          const library = await activeLibrary()
          const source = await chapterPdf(library, book, url.searchParams.get('code') ?? '')
          if (source === null) {
            sendJson(response, 200, { ok: true, exists: false })
            return
          }
          const out = join(dirname(source), `${name.slice(0, name.length - 4)}_translated.pdf`)
          let exists = false
          try {
            await stat(out)
            exists = true
          } catch {
            exists = false
          }
          sendJson(response, 200, { ok: true, exists, pdf: basename(out) })
        } catch (error) {
          fail(response, 500, 'translated-info-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/trash-translated`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        try {
          const body = await readJson(request)
          const name = basename(String(body.name ?? ''))
          if (!/\.pdf$/i.test(name)) {
            fail(response, 400, 'bad-name', '只支持 PDF 章节')
            return
          }
          const library = await activeLibrary()
          const source = await chapterPdf(library, body.book, body.code)
          if (source === null) {
            fail(response, 404, 'missing-file', '找不到这一章的 PDF 文件')
            return
          }
          const out = join(dirname(source), `${name.slice(0, name.length - 4)}_translated.pdf`)
          try {
            await stat(out)
          } catch {
            fail(response, 404, 'missing-file', '译文文件不存在')
            return
          }
          const trashDir = join(library.libraryDir, '回收站', '译文')
          await mkdir(trashDir, { recursive: true })
          await rename(out, join(trashDir, `${Date.now()}_${basename(out)}`))
          sendJson(response, 200, { ok: true })
        } catch (error) {
          fail(response, 500, 'trash-translated-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/trash-book`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        const body = await readJson(request)
        const book = typeof body.book === 'string' ? body.book : ''
        if (book === '' || /[\\/:*?"<>|]/.test(book)) {
          fail(response, 400, 'bad-book', '书名不合法')
          return
        }
        const library = await activeLibrary()
        const catalog = await loadCatalog(config)
        const row = catalog.books.find(item => item.id === book)
        const fragmentRoot = join(library.libraryDir, '分片')
        let source = ''
        const candidates = []
        if (row !== undefined && typeof row.dir === 'string' && row.dir !== '') candidates.push(join(fragmentRoot, row.dir))
        candidates.push(join(fragmentRoot, book))
        for (const candidate of candidates) {
          try {
            await stat(candidate)
            source = candidate
            break
          } catch {
            // try the next naming variant
          }
        }
        if (source === '') {
          // The hidden id may be a book title while the folder carries another
          // suffix: accept a single unambiguous prefix match.
          try {
            const entries = await readdir(fragmentRoot, { withFileTypes: true })
            const match = entries.find(entry => entry.isDirectory()
              && (entry.name === book || book.startsWith(entry.name) || entry.name.startsWith(book)))
            if (match !== undefined) source = join(fragmentRoot, match.name)
          } catch {
            // no fragment root at all: fall through to whole-book lookup
          }
        }
        if (source === '') {
          for (const sub of ['整本', '']) {
            try {
              const entries = await readdir(join(library.libraryDir, sub), { withFileTypes: true })
              const match = entries.find(entry => {
                if (!entry.isFile() || !/\.pdf$/i.test(entry.name)) return false
                const stem = entry.name.replace(/\.pdf$/i, '')
                return stem === book || stem.startsWith(book) || book.startsWith(stem)
              })
              if (match !== undefined) source = join(library.libraryDir, sub, match.name)
            } catch {
              // that folder does not exist
            }
            if (source !== '') break
          }
        }
        if (source === '') {
          fail(response, 404, 'missing', `找不到这本书的分片目录或整本 PDF（书 id: ${book}）`)
          return
        }
        const trash = join(library.libraryDir, '回收站')
        await mkdir(trash, { recursive: true })
        const target = join(trash, `${Date.now()}-${book}`)
        await rename(source, target)
        sendJson(response, 200, { ok: true, path: target })
        return
      }

      if (path === `${PREFIX}/trash-artifact`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        const body = await readJson(request)
        const name = basename(String(body.name ?? ''))
        if (name === '') {
          fail(response, 400, 'bad-name', '文件名不能为空')
          return
        }
        const library = await activeLibrary()
        const source = join(library.libraryDir, '产物', body.book, body.code, name)
        try {
          await stat(source)
        } catch {
          fail(response, 404, 'missing', '文件不存在（可能已被删除）')
          return
        }
        const trash = join(library.libraryDir, '回收站')
        await mkdir(trash, { recursive: true })
        const target = join(trash, `${Date.now()}-${name}`)
        await rename(source, target)
        sendJson(response, 200, { ok: true, path: target })
        return
      }

      if (path === `${PREFIX}/import`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        const wanted = basename(url.searchParams.get('name') ?? '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 160)
        if (wanted === '' || !/\.(md|markdown|txt|pdf)$/i.test(wanted)) {
          fail(response, 400, 'bad-name', '只接受 md / markdown / txt / pdf 文件')
          return
        }
        const library = await activeLibrary()
        const dir = join(library.libraryDir, '整本')
        await mkdir(dir, { recursive: true })
        const chunks = []
        let total = 0
        for await (const chunk of request) {
          total += chunk.length
          if (total > 64 * 1024 * 1024) {
            fail(response, 413, 'too-large', '单个文件不能超过 64 MB')
            return
          }
          chunks.push(chunk)
        }
        const extension = extname(wanted).toLowerCase()
        const stem = wanted.slice(0, wanted.length - extension.length)
        const unique = async () => {
          let target = join(dir, `${stem}.pdf`)
          for (let n = 2; n < 1000; n += 1) {
            try {
              await stat(target)
            } catch {
              return target
            }
            target = join(dir, `${stem}-${n}.pdf`)
          }
          return target
        }
        if (extension === '.pdf') {
          const target = await unique()
          await writeFile(target, Buffer.concat(chunks))
          sendJson(response, 200, { ok: true, path: target, pdf: target, bytes: total })
          return
        }
        if (options.md2texScript === undefined) {
          fail(response, 503, 'render-unavailable', '导入 md 需要 Python 与 TeX Live（xelatex）')
          return
        }
        const temporary = join(config.dataDir, 'tmp', `${Date.now()}-${wanted}`)
        await mkdir(join(config.dataDir, 'tmp'), { recursive: true })
        await writeFile(temporary, Buffer.concat(chunks))
        const target = await unique()
        try {
          await renderMarkdown(options.md2texScript, temporary, target)
        } catch (error) {
          fail(response, 503, 'render-failed', `渲染失败：${String(error && error.message ? error.message : error).slice(-400)}`)
          return
        }
        sendJson(response, 200, { ok: true, path: target, pdf: target, bytes: total })
        return
      }

      if (path === `${PREFIX}/samples`) {
        if (request.method !== 'GET') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET')
          return
        }
        const manifest = await readSampleManifest()
        if (manifest === null) {
          fail(response, 404, 'no-samples', '插件没有附带示例书')
          return
        }
        sendJson(response, 200, { ok: true, ...manifest })
        return
      }

      if (path === `${PREFIX}/samples/install`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        const manifest = await readSampleManifest()
        if (manifest === null || manifest.book === undefined) {
          fail(response, 404, 'no-samples', '插件没有附带示例书')
          return
        }
        const bookId = String(manifest.book.id ?? '')
        if (!/^[^\\/:*?"<>|]{1,120}$/.test(bookId)) {
          fail(response, 400, 'bad-sample', '示例书的书 id 不合法')
          return
        }
        const library = await activeLibrary()
        const source = join(config.samplesDir, '分片', bookId)
        const target = join(library.fragmentDir, bookId)
        await mkdir(target, { recursive: true })
        let copied = 0
        let skipped = 0
        const names = Array.isArray(manifest.files) ? manifest.files : []
        for (const entry of names) {
          const name = typeof entry === 'string' ? entry : String(entry?.name ?? '')
          if (!/^[^\\/:*?"<>|]{1,200}\.pdf$/i.test(name)) continue
          // Always refresh: the bundled sample is ours, and an older copy in the
          // library (e.g. the pre-embedded-font render) must be replaced.
          try {
            await copyFile(join(source, name), join(target, name))
            copied += 1
          } catch {
            skipped += 1
          }
        }
        sendJson(response, 200, { ok: true, book: bookId, dir: target, copied, skipped })
        return
      }

      if (path === `${PREFIX}/shelves`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        if (options.shelves === undefined) {
          fail(response, 503, 'unavailable', '书架分组存储不可用')
          return
        }
        const body = await mutationBody(request, response)
        if (body === undefined) return
        const library = await activeLibrary()
        try {
          const saved = await options.shelves.put(library.id, body)
          sendJson(response, 200, { ok: true, ...saved })
        } catch (error) {
          fail(response, 400, 'invalid-shelves', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/libraries`) {
        if (request.method !== 'GET') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET')
          return
        }
        if (libraries === undefined) {
          fail(response, 503, 'unavailable', '书库存储不可用')
          return
        }
        sendJson(response, 200, { ok: true, ...(await libraries.list()) })
        return
      }

      if (path === `${PREFIX}/libraries/add`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        if (libraries === undefined) {
          fail(response, 503, 'unavailable', '书库存储不可用')
          return
        }
        const body = await mutationBody(request, response)
        if (body === undefined) return
        const record = body !== null && typeof body === 'object' ? body : {}
        try {
          const library = await libraries.add({
            libraryDir: typeof record.libraryDir === 'string' ? record.libraryDir : '',
            name: typeof record.name === 'string' ? record.name : '',
          })
          cachedLibraryId = ''
          sendJson(response, 200, { ok: true, library, ...(await libraries.list()) })
        } catch (error) {
          fail(response, 400, 'invalid-library', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/libraries/active`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        if (libraries === undefined) {
          fail(response, 503, 'unavailable', '书库存储不可用')
          return
        }
        const body = await mutationBody(request, response)
        if (body === undefined) return
        const record = body !== null && typeof body === 'object' ? body : {}
        const changed = typeof record.id === 'string' && await libraries.setActive(record.id)
        if (!changed) {
          fail(response, 404, 'unknown-library', '没有这个书库')
          return
        }
        cachedLibraryId = ''
        sendJson(response, 200, { ok: true, ...(await libraries.list()) })
        return
      }

      if (path === `${PREFIX}/libraries/remove`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        if (libraries === undefined) {
          fail(response, 503, 'unavailable', '书库存储不可用')
          return
        }
        const body = await mutationBody(request, response)
        if (body === undefined) return
        const record = body !== null && typeof body === 'object' ? body : {}
        if (typeof record.id === 'string') await libraries.remove(record.id)
        cachedLibraryId = ''
        sendJson(response, 200, { ok: true, ...(await libraries.list()) })
        return
      }

      if (path === `${PREFIX}/toolkit/install`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        if (typeof options.installToolkit !== 'function') {
          fail(response, 503, 'unavailable', '工具包不可用')
          return
        }
        const library = await activeLibrary()
        try {
          const result = await options.installToolkit(library.libraryDir)
          sendJson(response, 200, { ok: true, ...result })
        } catch (error) {
          fail(response, 500, 'toolkit-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/artifact-counts`) {
        if (request.method !== 'GET') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET')
          return
        }
        const bookId = url.searchParams.get('book') ?? ''
        const current = await catalog()
        const book = Array.isArray(current.books) ? current.books.find(item => item.id === bookId) : undefined
        if (book === undefined) {
          fail(response, 404, 'unknown-book', `书库里没有 ${bookId}`)
          return
        }
        sendJson(response, 200, {
          ok: true,
          book: { id: book.id, title: book.title },
          counts: await countArtifacts(await activeLibrary(), book),
        })
        return
      }

      if (path === `${PREFIX}/artifacts`) {
        if (request.method !== 'GET') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET')
          return
        }
        const match = await chapterFromQuery(url)
        if (!match.ok) {
          fail(response, match.status, match.code, match.message)
          return
        }
        const listing = await listArtifacts(await activeLibrary(), match.book, match.chapter)
        sendJson(response, 200, {
          ok: true,
          book: { id: match.book.id, title: match.book.title },
          chapter: { code: match.chapter.code, title: match.chapter.title },
          dir: listing.dir,
          missing: listing.missing,
          truncated: listing.truncated,
          artifacts: listing.artifacts,
        })
        return
      }

      if (path === `${PREFIX}/artifact`) {
        if (request.method !== 'GET') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET')
          return
        }
        const match = await chapterFromQuery(url)
        if (!match.ok) {
          fail(response, match.status, match.code, match.message)
          return
        }
        const name = url.searchParams.get('name') ?? ''
        const preview = await readArtifact(await activeLibrary(), match.book, match.chapter, name)
        if (!preview.ok) {
          const status = preview.reason === 'not-found' ? 404 : preview.reason === 'bad-name' ? 400 : 415
          const messages = {
            'bad-name': '文件名不合法',
            'not-found': `这个章里没有 ${name}`,
            'not-text': '这种文件不在页内预览里显示（PDF 阅读器还没接入）',
            binary: '看起来是二进制文件，不在页内预览里显示',
            directory: '这是一个目录，不是文件',
          }
          fail(response, status, preview.reason, messages[preview.reason] ?? '读不了这个文件')
          return
        }
        sendJson(response, 200, { ok: true, ...preview })
        return
      }

      if (path === `${PREFIX}/pdf`) {
        if (request.method !== 'GET') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET')
          return
        }
        const match = await chapterFromQuery(url)
        if (!match.ok) {
          fail(response, match.status, match.code, match.message)
          return
        }
        const name = url.searchParams.get('name') ?? ''
        const source = name === ''
          ? chapterPdfPath(await activeLibrary(), match.book, match.chapter)
          : artifactPdfPath(await activeLibrary(), match.book, match.chapter, name)
        if (!source.ok) {
          fail(response, 400, source.reason, '这个文件不能作为 PDF 打开')
          return
        }
        const variant = url.searchParams.get('variant') ?? ''
        if (variant === 'translated' || variant === 'overlay') {
          const suffix = variant === 'overlay' ? '_overlay' : '_translated'
          const target = join(dirname(source.path), `${basename(source.path, '.pdf')}${suffix}.pdf`)
          let bytes = null
          try {
            bytes = await readPdf(target)
          } catch {
            bytes = null
          }
          if (bytes === null || !bytes.ok) {
            fail(response, 404, 'missing-file', '还没有这一页/章的译文')
            return
          }
          sendBytes(response, 200, bytes.bytes, 'application/pdf')
          return
        }
        const file = await readPdf(source.path)
        if (!file.ok) {
          const status = file.reason === 'too-large' ? 413 : 404
          fail(response, status, file.reason, file.reason === 'too-large' ? '这个 PDF 太大了' : '找不到这个 PDF')
          return
        }
        sendBytes(response, 200, file.bytes, 'application/pdf')
        return
      }

      if (path.startsWith(`${PREFIX}/vendor/`)) {
        if (request.method !== 'GET') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET')
          return
        }
        const name = path.slice(`${PREFIX}/vendor/`.length)
        const contentType = vendorContentType(name)
        if (contentType === null) {
          fail(response, 404, 'not-found', '没有这个阅读器文件')
          return
        }
        try {
          const body = await readFile(join(config.vendorDir, ...name.split('/')))
          sendBytes(response, 200, body, contentType)
        } catch {
          fail(response, 404, 'missing-vendor', '阅读器文件缺失，请重新安装插件')
        }
        return
      }

      if (path === `${PREFIX}/pdf-ref`) {
        if (request.method !== 'GET') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET')
          return
        }
        const match = await chapterFromQuery(url)
        if (!match.ok) {
          fail(response, match.status, match.code, match.message)
          return
        }
        const name = url.searchParams.get('name') ?? ''
        const source = name === ''
          ? chapterPdfPath(await activeLibrary(), match.book, match.chapter)
          : artifactPdfPath(await activeLibrary(), match.book, match.chapter, name)
        if (!source.ok) {
          fail(response, 400, source.reason, '这个文件不能作为 PDF 打开')
          return
        }
        // What the host's right-pane preview needs: a path relative to the
        // session's workspace, so no absolute library path leaves the Host.
        const rel = relative((await activeLibrary()).libraryDir, source.path)
        const inside = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
        sendJson(response, 200, { ok: true, rel: inside ? rel.replace(/\\/g, '/') : '' })
        return
      }

      if (path === `${PREFIX}/cover`) {
        if (request.method !== 'GET') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET')
          return
        }
        const bookId = url.searchParams.get('book') ?? ''
        const current = await catalog()
        const book = Array.isArray(current.books) ? current.books.find(item => item.id === bookId) : undefined
        if (book === undefined) {
          fail(response, 404, 'unknown-book', `书库里没有 ${bookId}`)
          return
        }
        for (const [extension, contentType] of Object.entries(COVER_TYPES)) {
          try {
            const body = await readFile(join((await activeLibrary()).coverDir, `${bookId}.${extension}`))
            sendBytes(response, 200, body, contentType)
            return
          } catch {
            // Try the next extension; a missing cover is normal.
          }
        }
        fail(response, 404, 'no-cover', '这本书没有自定义封面')
        return
      }

      if (path === `${PREFIX}/context`) {
        if (request.method !== 'GET') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 GET')
          return
        }
        const sessionId = url.searchParams.get('session') ?? ''
        if (!/^[\w-]{1,80}$/.test(sessionId)) {
          fail(response, 400, 'invalid-session', '会话 id 不合法')
          return
        }
        const reading = typeof options.contextPressure === 'function'
          ? await options.contextPressure(sessionId)
          : null
        sendJson(response, 200, {
          ok: true,
          sessionId,
          context: reading === null ? null : {
            tokens: reading.tokens,
            window: reading.window,
            ratio: reading.ratio,
            source: reading.source,
          },
        })
        return
      }

      if (path === `${PREFIX}/digest`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        if (typeof options.digest !== 'function') {
          fail(response, 503, 'unavailable', '提纲生成不可用（缺少模型服务）')
          return
        }
        const body = await mutationBody(request, response)
        if (body === undefined) return
        const record = body !== null && typeof body === 'object' ? body : {}
        const match = resolveChapter(await catalog(), typeof record.bookId === 'string' ? record.bookId : '', String(record.code ?? '').toLowerCase())
        if (!match.ok) {
          fail(response, match.code === 'unknown-chapter' ? 404 : 400, match.code, match.message)
          return
        }
        const ids = Array.isArray(record.sessionIds)
          ? record.sessionIds.filter(id => typeof id === 'string' && /^[\w-]{1,80}$/.test(id)).slice(0, 50)
          : []
        if (ids.length === 0) {
          fail(response, 400, 'no-sessions', '这一章还没有可总结的会话')
          return
        }
        try {
          const result = await options.digest({
            book: match.book,
            chapter: match.chapter,
            sessionIds: ids,
            mode: typeof record.mode === 'string' && /^[\w-]{1,16}$/.test(record.mode) ? record.mode : 'all',
          })
          sendJson(response, 200, { ok: true, ...result })
        } catch (error) {
          fail(response, 502, 'digest-failed', String(error && error.message ? error.message : error))
        }
        return
      }

      if (path === `${PREFIX}/links`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        if (links === undefined) {
          fail(response, 503, 'unavailable', '挂载存储不可用')
          return
        }
        const body = await mutationBody(request, response)
        if (body === undefined) return
        const record = body !== null && typeof body === 'object' ? body : {}
        if (typeof record.sessionId !== 'string' || record.sessionId === '') {
          fail(response, 400, 'invalid-body', 'sessionId 缺失')
          return
        }
        // Only a chapter the catalog knows can be linked, so a typo cannot
        // create a placement the page would never render.
        const match = resolveChapter(await catalog(), typeof record.bookId === 'string' ? record.bookId : '', String(record.code ?? '').toLowerCase())
        if (!match.ok) {
          fail(response, match.code === 'unknown-chapter' ? 404 : 400, match.code, match.message)
          return
        }
        try {
          await links.add(record.sessionId, {
            bookId: match.book.id,
            code: match.chapter.code,
            mode: typeof record.mode === 'string' ? record.mode : 'qa',
          })
        } catch (error) {
          fail(response, 400, 'invalid-body', String(error && error.message ? error.message : error))
          return
        }
        sendJson(response, 200, { ok: true, links: await links.list() })
        return
      }

      if (path === `${PREFIX}/links/remove`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        const body = await mutationBody(request, response)
        if (body === undefined) return
        const record = body !== null && typeof body === 'object' ? body : {}
        if (links !== undefined && typeof record.sessionId === 'string' && record.sessionId !== '') {
          try {
            await links.remove(record.sessionId, String(record.bookId ?? ''), String(record.code ?? '').toLowerCase())
          } catch (error) {
            fail(response, 400, 'invalid-body', String(error && error.message ? error.message : error))
            return
          }
        }
        sendJson(response, 200, { ok: true, links: links === undefined ? {} : await links.list() })
        return
      }

      if (path === `${PREFIX}/pending`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        if (pending === undefined) {
          fail(response, 503, 'unavailable', 'pending 存储不可用')
          return
        }
        const body = await mutationBody(request, response)
        if (body === undefined) return
        const record = body !== null && typeof body === 'object' ? body : {}
        if (typeof record.sessionId !== 'string' || record.sessionId === '') {
          fail(response, 400, 'invalid-body', 'sessionId 缺失')
          return
        }
        try {
          await pending.put(record.sessionId, record)
        } catch (error) {
          fail(response, 400, 'invalid-body', String(error && error.message ? error.message : error))
          return
        }
        sendJson(response, 200, { ok: true, pending: await pending.list() })
        return
      }

      if (path === `${PREFIX}/pending/remove`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        const body = await mutationBody(request, response)
        if (body === undefined) return
        const record = body !== null && typeof body === 'object' ? body : {}
        if (pending !== undefined && typeof record.sessionId === 'string' && record.sessionId !== '') {
          await pending.remove(record.sessionId)
        }
        sendJson(response, 200, { ok: true, pending: pending === undefined ? {} : await pending.list() })
        return
      }

      if (path === `${PREFIX}/purge`) {
        if (request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 POST')
          return
        }
        if (!isSameOrigin(request)) {
          fail(response, 403, 'cross-origin', '拒绝跨站写入')
          return
        }
        const result = typeof options.purge === 'function' ? await options.purge() : { purged: 0 }
        sendJson(response, 200, { ok: true, purged: result.purged })
        return
      }

      if (path === `${PREFIX}/state`) {
        if (request.method !== 'PUT' && request.method !== 'POST') {
          fail(response, 405, 'method-not-allowed', '这个接口只接受 PUT')
          return
        }
        const body = await mutationBody(request, response)
        if (body === undefined) return
        const state = await writeState(config.statePath, body)
        sendJson(response, 200, { ok: true, state })
        return
      }

      fail(response, 404, 'not-found', `没有这个接口：${path}`)
    } catch (error) {
      fail(response, 500, 'internal', String(error && error.message ? error.message : error))
    }
  }
}
