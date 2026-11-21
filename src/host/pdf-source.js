/**
 * Where a chapter's PDF or a produced PDF actually lives.
 *
 * The catalog only carries file *names* (a chapter keeps its split file name, a
 * produced file keeps its own name inside the chapter folder), so the browser
 * asks for a (book, chapter) pair and the Host resolves the bytes. Both paths are
 * built from validated segments and then checked for containment: a catalog that
 * was edited by hand must not be able to point the reader outside the library.
 *
 * @module dsh-pdf-math-desk/pdf-source
 */
import { open, stat } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'

/** One path segment: no separators, no traversal, no drive colon. */
const SEGMENT = /^[^\\/:*?"<>|]{1,255}$/

/** A chapter code, canonical form. */
const CODE = /^c\d{2,3}$/

/** Bytes served for one PDF; the split files are a few MB at most. */
export const MAX_PDF_BYTES = 64 * 1024 * 1024

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
 * The split PDF of one chapter.
 * @param {{ fragmentDir: string }} config - resolved paths.
 * @param {object} book - catalog book row.
 * @param {object} chapter - catalog chapter row.
 * @returns {{ ok: true, path: string } | { ok: false, reason: 'bad-name' | 'not-found' }} the file, or why it cannot be served.
 */
export function chapterPdfPath(config, book, chapter) {
  // A whole-book library entry: one unsplit PDF under `<libraryDir>\整本\`.
  if (chapter.whole === true) {
    if (typeof book.id !== 'string' || !isSegment(book.id) || !isSegment(chapter.file)) {
      return { ok: false, reason: 'bad-name' }
    }
    const wholeAt = chapter.wholeAt === 'root' ? '' : '整本'
    const base = wholeAt === '' ? config.libraryDir : join(config.libraryDir, wholeAt)
    const target = resolve(base, `${chapter.file}.pdf`)
    if (!isInside(base, target)) return { ok: false, reason: 'bad-name' }
    return { ok: true, path: target }
  }
  if (!isSegment(book.dir) || !isSegment(chapter.file) || !CODE.test(chapter.code)) return { ok: false, reason: 'bad-name' }
  const target = resolve(config.fragmentDir, book.dir, `${chapter.file}.pdf`)
  if (!isInside(config.fragmentDir, target)) return { ok: false, reason: 'bad-name' }
  return { ok: true, path: target }
}

/**
 * A produced PDF inside one chapter's artifact folder.
 * @param {{ artifactDir: string }} config - resolved paths.
 * @param {object} book - catalog book row.
 * @param {object} chapter - catalog chapter row.
 * @param {string} name - file name inside the chapter folder.
 * @returns {{ ok: true, path: string } | { ok: false, reason: 'bad-name' | 'not-found' }} the file, or why it cannot be served.
 */
export function artifactPdfPath(config, book, chapter, name) {
  if (!isSegment(book.id) || !CODE.test(chapter.code)) return { ok: false, reason: 'bad-name' }
  if (!isSegment(name) || basename(name) !== name || !name.toLowerCase().endsWith('.pdf')) return { ok: false, reason: 'bad-name' }
  const dir = join(config.artifactDir, book.id, chapter.code)
  const target = resolve(dir, name)
  if (!isInside(config.artifactDir, target) || !isInside(dir, target)) return { ok: false, reason: 'bad-name' }
  return { ok: true, path: target }
}

/**
 * Read one PDF for the reader, bounded so a stray huge file cannot exhaust memory.
 * @param {string} path - absolute file path.
 * @returns {Promise<{ ok: true, bytes: Buffer, size: number } | { ok: false, reason: 'not-found' | 'too-large' }>} the bytes.
 */
export async function readPdf(path) {
  let info
  try {
    info = await stat(path)
  } catch {
    return { ok: false, reason: 'not-found' }
  }
  if (!info.isFile()) return { ok: false, reason: 'not-found' }
  if (info.size > MAX_PDF_BYTES) return { ok: false, reason: 'too-large' }
  let handle
  try {
    handle = await open(path, 'r')
  } catch {
    return { ok: false, reason: 'not-found' }
  }
  try {
    const buffer = Buffer.alloc(info.size)
    let offset = 0
    while (offset < info.size) {
      const { bytesRead } = await handle.read(buffer, offset, info.size - offset, offset)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    return { ok: true, bytes: buffer.subarray(0, offset), size: info.size }
  } catch {
    return { ok: false, reason: 'not-found' }
  } finally {
    await handle.close().catch(() => {})
  }
}
