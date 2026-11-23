/**
 * The chapter brief cache: one shared summary per chapter, kept beside the book.
 *
 * The first AI conversation of a chapter is asked to read the chapter and write
 * `brief.md`; every later conversation (any mode, either column) reuses it
 * instead of reading the chapter PDF again. The cache holds **derived** data
 * only: the PDF stays the single source of truth, and the whole folder can be
 * deleted and rebuilt at any time.
 *
 * Layout, inside the library so it travels with the books:
 *
 *   <库根>/.pdfdesk/cache/<书>/<章>/
 *     manifest.json   # schema, PDF fingerprint (size + mtime), builder version,
 *                     # status, the session that asked, timestamps
 *     brief.md        # what that session wrote
 *
 * A brief is valid only while the PDF fingerprint and the builder version still
 * match. A stale brief is moved under `cache/.stale/` before a new one is
 * requested, so a wrong brief is never silently reused.
 *
 * @module dsh-pdf-workbench/chapter-cache
 */
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

/** On-disk schema version of `manifest.json`. */
export const CACHE_FORMAT = 1

/** Bump when the brief's expected shape or the prompt that builds it changes. */
export const BUILDER_VERSION = 1

/** Bytes of `brief.md` served to the browser; the prompt takes fewer. */
export const MAX_BRIEF_BYTES = 64 * 1024

/** How long a `pending` request stays meaningful before it reads as missing. */
const PENDING_TTL_MS = 30 * 60 * 1000

/**
 * A pending request younger than this belongs to whoever asked first; after it,
 * the next conversation takes the request over. Without that, a first session
 * the user abandoned would keep every later session from building the brief.
 */
const ADOPT_AFTER_MS = 2 * 60 * 1000

/** Clock slack between "requested" and "written", so a fast writer still counts. */
const STALE_TOLERANCE_MS = 5000

/** A chapter code, canonical form. */
const CODE = /^c\d{2,3}$/

/** One path segment: no separators, no traversal, no drive colon. */
const SEGMENT = /^[^\\/:*?"<>|]{1,200}$/

/**
 * Whether a value can be one directory segment.
 * @param {unknown} value - candidate.
 * @returns {boolean} true when safe.
 */
function isSegment(value) {
  return typeof value === 'string' && SEGMENT.test(value) && value !== '.' && value !== '..'
}

/**
 * Whether `target` really lives under `root`.
 * @param {string} root - directory that must contain the target.
 * @param {string} target - resolved candidate.
 * @returns {boolean} true when contained.
 */
function isInside(root, target) {
  const normalize = value => value.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase()
  const parent = normalize(root)
  const child = normalize(target)
  return child === parent || child.startsWith(`${parent}${sep}`)
}

/**
 * The cache root of one library.
 * @param {string} libraryDir - library root.
 * @returns {string} absolute path.
 */
export function cacheRoot(libraryDir) {
  return join(libraryDir, '.pdfdesk', 'cache')
}

/**
 * One chapter's cache folder.
 * @param {string} libraryDir - library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @returns {string} absolute path.
 */
export function chapterCacheDir(libraryDir, book, code) {
  return join(cacheRoot(libraryDir), book, code)
}

/**
 * One chapter's brief file.
 * @param {string} libraryDir - library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @returns {string} absolute path.
 */
export function briefFile(libraryDir, book, code) {
  return join(chapterCacheDir(libraryDir, book, code), 'brief.md')
}

/**
 * One chapter's manifest file.
 * @param {string} libraryDir - library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @returns {string} absolute path.
 */
export function manifestFile(libraryDir, book, code) {
  return join(chapterCacheDir(libraryDir, book, code), 'manifest.json')
}

/**
 * Size and mtime of one file, or null when it is not a readable file.
 * @param {string} path - absolute path.
 * @returns {Promise<{ size: number, mtimeMs: number } | null>} the fingerprint.
 */
async function fileFingerprint(path) {
  try {
    const info = await stat(path)
    if (!info.isFile()) return null
    return { size: info.size, mtimeMs: info.mtimeMs }
  } catch {
    return null
  }
}

/**
 * Read `brief.md`, bounded by {@link MAX_BRIEF_BYTES}.
 * @param {string} path - absolute path.
 * @returns {Promise<{ text: string, truncated: boolean }>} the text.
 */
async function readBriefText(path) {
  let handle
  try {
    handle = await open(path, 'r')
  } catch {
    return { text: '', truncated: false }
  }
  try {
    const buffer = Buffer.alloc(MAX_BRIEF_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, MAX_BRIEF_BYTES, 0)
    const info = await handle.stat()
    let text = buffer.subarray(0, bytesRead).toString('utf8')
    const truncated = info.size > bytesRead
    // A byte cut may land inside a character; drop the replacement it leaves.
    if (truncated && text.endsWith('\uFFFD')) text = text.slice(0, -1)
    return { text, truncated }
  } catch {
    return { text: '', truncated: false }
  } finally {
    await handle.close().catch(() => {})
  }
}

/**
 * Read and sanitize one manifest. A broken manifest is no manifest.
 * @param {string} dir - the chapter's cache folder.
 * @returns {Promise<object | null>} the manifest fields the cache uses.
 */
async function readManifest(dir) {
  let parsed = null
  try {
    parsed = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object') return null
  const pdf = parsed.pdf !== null && typeof parsed.pdf === 'object'
    && Number.isFinite(parsed.pdf.size) && Number.isFinite(parsed.pdf.mtimeMs)
    ? { size: parsed.pdf.size, mtimeMs: parsed.pdf.mtimeMs }
    : null
  const pendingAt = Number(parsed.pendingAt)
  const requestedAt = Number(parsed.requestedAt)
  return {
    format: Number(parsed.format) || 0,
    builder: Number(parsed.builder) || 0,
    status: typeof parsed.status === 'string' ? parsed.status : '',
    pdf,
    sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '',
    pendingAt: Number.isFinite(pendingAt) && pendingAt > 0 ? pendingAt : 0,
    requestedAt: Number.isFinite(requestedAt) && requestedAt > 0 ? requestedAt : 0,
  }
}

/**
 * Write one JSON file atomically (temp file + rename).
 * @param {string} path - absolute path.
 * @param {object} value - payload.
 * @returns {Promise<void>} completion.
 */
async function writeJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}

/**
 * Compute one chapter's cache state without touching it.
 * @param {string} libraryDir - library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @param {string | null} pdfPath - the chapter's PDF, for the fingerprint.
 * @returns {Promise<{ status: 'missing'|'pending'|'ready'|'stale'|'failed', dir: string, briefPath: string, manifestPath: string, brief: string, chars: number, truncated: boolean, updatedAt: number, pdf: { size: number, mtimeMs: number } | null, pendingAt: number, sessionId: string }>} the state.
 */
export async function readChapterCache(libraryDir, book, code, pdfPath) {
  const dir = chapterCacheDir(libraryDir, book, code)
  const briefPath = join(dir, 'brief.md')
  const manifestPath = join(dir, 'manifest.json')
  const empty = {
    status: 'missing',
    dir,
    briefPath,
    manifestPath,
    brief: '',
    chars: 0,
    truncated: false,
    updatedAt: 0,
    pdf: null,
    pendingAt: 0,
    sessionId: '',
  }
  if (!isSegment(book) || !CODE.test(code)) return empty
  const brief = await fileFingerprint(briefPath)
  const manifest = await readManifest(dir)
  const pdf = typeof pdfPath === 'string' && pdfPath !== '' ? await fileFingerprint(pdfPath) : null
  const now = Date.now()
  let status
  if (brief === null) {
    if (manifest !== null && manifest.status === 'pending' && manifest.pendingAt > 0 && now - manifest.pendingAt < PENDING_TTL_MS) {
      status = 'pending'
    } else if (manifest !== null && manifest.status === 'failed') {
      status = 'failed'
    } else {
      status = 'missing'
    }
    return {
      ...empty,
      status,
      pdf,
      pendingAt: manifest === null ? 0 : manifest.pendingAt,
      sessionId: manifest === null ? '' : manifest.sessionId,
    }
  }
  const writtenAfterRequest = manifest === null || manifest.pendingAt === 0
    || brief.mtimeMs + STALE_TOLERANCE_MS >= manifest.pendingAt
  if (manifest === null) {
    // A brief without a manifest predates the manifest format. It is current
    // when it is not older than the PDF it summarizes.
    status = pdf === null || brief.mtimeMs + STALE_TOLERANCE_MS >= pdf.mtimeMs ? 'ready' : 'stale'
  } else if (manifest.builder !== BUILDER_VERSION) {
    status = 'stale'
  } else if (pdf !== null && (manifest.pdf === null || manifest.pdf.size !== pdf.size || manifest.pdf.mtimeMs !== pdf.mtimeMs)) {
    status = 'stale'
  } else if (!writtenAfterRequest) {
    status = 'stale'
  } else {
    status = 'ready'
  }
  const loaded = await readBriefText(briefPath)
  return {
    status,
    dir,
    briefPath,
    manifestPath,
    brief: loaded.text,
    chars: loaded.text.length,
    truncated: loaded.truncated,
    updatedAt: brief.mtimeMs,
    pdf,
    pendingAt: manifest === null ? 0 : manifest.pendingAt,
    sessionId: manifest === null ? '' : manifest.sessionId,
  }
}

/**
 * Move one chapter's stale brief aside, into `cache/.stale/`, so a rebuild
 * never reads it again but the old words are still on disk.
 * @param {string} libraryDir - library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @returns {Promise<void>} completion (best effort).
 */
async function archiveStale(libraryDir, book, code) {
  const dir = chapterCacheDir(libraryDir, book, code)
  const at = join(cacheRoot(libraryDir), '.stale', book, code, String(Date.now()))
  try {
    await mkdir(at, { recursive: true })
  } catch {
    return
  }
  for (const name of ['brief.md', 'manifest.json']) {
    try {
      await rename(join(dir, name), join(at, name))
    } catch {
      // Nothing to move, or the file is locked; the new request still goes on.
    }
  }
}

/**
 * Request the first brief for one chapter: create the folder, record who asked
 * and which PDF they asked about, and mark it `pending`.
 *
 * An already usable or recently requested cache is returned untouched, so two
 * conversations opening at once do not erase each other's work.
 *
 * @param {string} libraryDir - library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @param {string | null} pdfPath - the chapter's PDF.
 * @param {string} [sessionId] - the session that will write the brief.
 * @returns {Promise<object>} the cache state after the request.
 */
export async function prepareChapterCache(libraryDir, book, code, pdfPath, sessionId) {
  const owner = typeof sessionId === 'string' ? sessionId : ''
  const current = await readChapterCache(libraryDir, book, code, pdfPath)
  if (current.status === 'ready') return current
  const dir = chapterCacheDir(libraryDir, book, code)
  if (current.status === 'pending') {
    // One chapter, one writer: a fresh request keeps its owner. A request with
    // no owner (the chapter page asked), or one older than the adoption window,
    // hands the work to this session instead of blocking it forever.
    const stale = current.sessionId === '' || Date.now() - current.pendingAt >= ADOPT_AFTER_MS
    if (!stale || current.sessionId === owner) return current
    const manifest = await readManifest(dir)
    if (manifest === null) return current
    await writeJson(join(dir, 'manifest.json'), {
      format: CACHE_FORMAT,
      builder: BUILDER_VERSION,
      book,
      code,
      pdf: manifest.pdf,
      status: 'pending',
      sessionId: owner,
      pendingAt: manifest.pendingAt,
      requestedAt: manifest.requestedAt,
    })
    return await readChapterCache(libraryDir, book, code, pdfPath)
  }
  if (current.status === 'stale' || current.status === 'failed') await archiveStale(libraryDir, book, code)
  await mkdir(dir, { recursive: true })
  const pdf = typeof pdfPath === 'string' && pdfPath !== '' ? await fileFingerprint(pdfPath) : null
  const now = Date.now()
  await writeJson(join(dir, 'manifest.json'), {
    format: CACHE_FORMAT,
    builder: BUILDER_VERSION,
    book,
    code,
    pdf: pdf === null ? null : { size: pdf.size, mtimeMs: pdf.mtimeMs },
    status: 'pending',
    sessionId: owner,
    pendingAt: now,
    requestedAt: now,
  })
  return await readChapterCache(libraryDir, book, code, pdfPath)
}

/**
 * Forget one chapter's cache.
 * @param {string} libraryDir - library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @returns {Promise<{ removed: boolean }>} whether the folder was removed.
 */
export async function clearChapterCache(libraryDir, book, code) {
  if (!isSegment(book) || !CODE.test(code)) return { removed: false }
  const dir = chapterCacheDir(libraryDir, book, code)
  if (!isInside(resolve(cacheRoot(libraryDir)), resolve(dir))) return { removed: false }
  await rm(dir, { recursive: true, force: true })
  return { removed: true }
}

/**
 * Count the chapters that currently have a cache folder.
 * @param {string} libraryDir - library root.
 * @returns {Promise<number>} how many chapter folders exist.
 */
async function countChapters(libraryDir) {
  let count = 0
  let books
  try {
    books = await readdir(cacheRoot(libraryDir), { withFileTypes: true })
  } catch {
    return 0
  }
  for (const book of books) {
    if (!book.isDirectory() || !isSegment(book.name)) continue
    let codes
    try {
      codes = await readdir(join(cacheRoot(libraryDir), book.name), { withFileTypes: true })
    } catch {
      continue
    }
    for (const code of codes) {
      if (code.isDirectory() && CODE.test(code.name)) count += 1
    }
  }
  return count
}

/**
 * Forget every chapter cache of one library. PDFs, produced files and
 * annotations live elsewhere and are untouched.
 * @param {string} libraryDir - library root.
 * @returns {Promise<{ removed: number }>} how many chapter folders were cleared.
 */
export async function clearAllChapterCache(libraryDir) {
  const root = resolve(cacheRoot(libraryDir))
  // Never delete the library itself, and never something outside it.
  if (!isInside(resolve(libraryDir), root) || root === resolve(libraryDir)) return { removed: 0 }
  const removed = await countChapters(libraryDir)
  await rm(root, { recursive: true, force: true })
  return { removed }
}
