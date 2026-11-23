/**
 * The chapter's shared-prefix session map: which hidden base session read the
 * chapter once, at which turn boundary, and which branch each mode forked.
 *
 * Kept in `.pdfdesk/cache/<book>/<code>/sessions.json` beside `text.md`. It is
 * derived data: deleting it only means reading the chapter again.
 * @module dsh-pdf-workbench/chapter-sessions
 */

import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** The four conversation modes that can fork from the base session. */
export const SESSION_MODES = ['general', 'extract', 'qa', 'exercise']

/**
 * Where one chapter's session map lives.
 * @param {string} libraryDir - the library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @returns {string} the absolute `sessions.json` path.
 */
export function chapterSessionsPath(libraryDir, book, code) {
  return join(libraryDir, '.pdfdesk', 'cache', book, code, 'sessions.json')
}

/**
 * @param {string} libraryDir - the library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @returns {Promise<object | null>} the map, or null when this chapter never prepared one.
 */
export async function readChapterSessions(libraryDir, book, code) {
  const raw = await readFile(chapterSessionsPath(libraryDir, book, code), 'utf8').catch(() => null)
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Write the map atomically (a half-written base id would make every branch point
 * at a broken session).
 * @param {string} libraryDir - the library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @param {object} value - the map.
 * @returns {Promise<string>} the path written.
 */
export async function writeChapterSessions(libraryDir, book, code, value) {
  const path = chapterSessionsPath(libraryDir, book, code)
  await mkdir(join(libraryDir, '.pdfdesk', 'cache', book, code), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
  return path
}

/**
 * Whether a recorded map still matches the PDF it was made from.
 * @param {object | null} manifest - the stored map.
 * @param {{ size: number, mtimeMs: number }} pdf - the PDF's current identity.
 * @returns {boolean} true when the PDF changed (or the map is unusable).
 */
export function chapterSessionsStale(manifest, pdf) {  if (manifest === null || typeof manifest !== 'object') return true
  if (typeof manifest.base !== 'object' || manifest.base === null) return true
  if (typeof manifest.base.id !== 'string' || manifest.base.id === '') return true
  if (typeof manifest.base.atSeq !== 'number' || manifest.base.atSeq < 1) return true
  const known = manifest.pdf
  if (typeof known !== 'object' || known === null) return true
  return known.size !== pdf.size || known.mtimeMs !== pdf.mtimeMs
}

/**
 * Move a stale map and its text aside instead of deleting anything the user
 * might still want to inspect.
 * @param {string} libraryDir - the library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @returns {Promise<string>} the `.stale` folder the old data moved into.
 */
export async function staleChapterSessions(libraryDir, book, code) {
  const at = join(libraryDir, '.pdfdesk', 'cache', '.stale', book, code, String(Date.now()))
  await mkdir(at, { recursive: true })
  for (const name of ['sessions.json', 'text.md']) {
    const from = join(libraryDir, '.pdfdesk', 'cache', book, code, name)
    const to = join(at, name)
    try {
      await rename(from, to)
    } catch {
      // not present: nothing to move
    }
  }
  return at
}

/**
 * Record the hidden base session and the turn boundary that branches fork at.
 * @param {object} manifest - the current map (or null).
 * @param {{ id: string, atSeq: number }} base - the base session.
 * @param {{ size: number, mtimeMs: number }} pdf - the PDF it read.
 * @returns {object} the next map.
 */
export function withBaseSession(manifest, base, pdf) {
  const current = manifest !== null && typeof manifest === 'object' ? manifest : {}
  return { ...current, base: { id: base.id, atSeq: base.atSeq }, pdf: { size: pdf.size, mtimeMs: pdf.mtimeMs }, branches: current.branches ?? {} }
}

/**
 * Remember which session serves one mode. Forking twice for the same mode would
 * split its history, so the first branch wins.
 * @param {object} manifest - the current map.
 * @param {string} mode - one of `SESSION_MODES`.
 * @param {string} sessionId - the branch session.
 * @returns {object} the next map.
 */
export function withBranchSession(manifest, mode, sessionId) {
  if (!SESSION_MODES.includes(mode)) throw new Error(`未知模式：${mode}`)
  const branches = manifest !== null && typeof manifest.branches === 'object' && manifest.branches !== null ? manifest.branches : {}
  return { ...manifest, branches: { ...branches, [mode]: String(sessionId) } }
}

/**
 * @param {object | null} manifest - the map.
 * @param {string} mode - one of `SESSION_MODES`.
 * @returns {string} the branch session id, or '' when the mode has not forked yet.
 */
export function branchSessionId(manifest, mode) {
  const branches = manifest !== null && typeof manifest.branches === 'object' && manifest.branches !== null ? manifest.branches : {}
  return typeof branches[mode] === 'string' ? branches[mode] : ''
}

/**
 * Forget every chapter's shared prefix: extracted text, base/branch maps and
 * any stale leftovers under `.pdfdesk/cache`. User sessions, PDFs and
 * annotations live elsewhere and are untouched.
 * @param {string} libraryDir - the library root.
 * @returns {Promise<{ removed: number }>} how many chapter folders were dropped.
 */
export async function clearSharedPrefixCache(libraryDir) {
  const root = join(libraryDir, '.pdfdesk', 'cache')
  let removed = 0
  const books = await readdir(root, { withFileTypes: true }).catch(() => [])
  for (const book of books) {
    if (!book.isDirectory() || book.name === '.stale') continue
    const chapters = await readdir(join(root, book.name), { withFileTypes: true }).catch(() => [])
    removed += chapters.filter(chapter => chapter.isDirectory()).length
  }
  await rm(root, { recursive: true, force: true })
  return { removed }
}
