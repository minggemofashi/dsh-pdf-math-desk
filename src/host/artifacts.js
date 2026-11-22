/**
 * Produced files: what a chapter's sessions wrote.
 *
 * The convention is `<artifactDir>/<book id>/<cNN>/` — one directory per
 * chapter, named exactly like the chapter code the session titles use. Listing
 * is deliberately narrow: a chapter that the catalog does not know is refused
 * rather than looked up, so a typo cannot read an unrelated folder, and a file
 * name is only ever joined under that chapter's own directory.
 *
 * The browser never touches the filesystem, so a previewed file arrives here in
 * full, decoded, and bounded: 512 KiB and a hard line cap is enough for notes
 * and extracts, and the response says when it stopped early.
 *
 * @module dsh-pdf-workbench/artifacts
 */
import { open, readdir, stat } from 'node:fs/promises'
import { basename, extname, join, resolve, sep } from 'node:path'

/** Bytes served for one text preview. */
export const MAX_TEXT_BYTES = 512 * 1024

/** Rows one chapter may list before it says the list is cut. */
const MAX_ROWS = 300

/** A chapter code, canonical form. */
const CODE = /^c\d{2,3}$/

/** One path segment: no separators, no traversal, no drive colon. */
const SEGMENT = /^[^\\/:*?"<>|]{1,200}$/

/** A plain file name as it appears in the chapter's own directory. */
const FILE_NAME = /^[^\\/:*?"<>|]{1,200}$/

/** Extensions rendered as text in the preview. Anything else is listed but not previewed. */
const TEXT_EXTENSIONS = new Set([
  'md', 'markdown', 'mdx', 'txt', 'text', 'tex', 'latex', 'log', 'rst',
  'json', 'jsonl', 'json5', 'csv', 'tsv', 'yml', 'yaml', 'toml', 'ini', 'conf', 'cfg',
  'py', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'java',
  'rs', 'go', 'rb', 'php', 'sh', 'bash', 'ps1', 'bat', 'cmd',
  'html', 'htm', 'css', 'scss', 'xml', 'svg', 'sql', 'r', 'jl', 'm', 'lua', 'pl', 'swift', 'kt',
])

/** Extensions shown as an image badge; the reader does not draw them yet. */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'])

/** Decoders tried in order for a preview; UTF-8 first, then the common Chinese Windows code page. */
const DECODERS = ['utf-8', 'gb18030']

/**
 * The kind shown as a badge and used to decide whether the reader can draw it.
 * @param {string} name - file name.
 * @returns {'pdf' | 'text' | 'image' | 'other'} the kind.
 */
export function kindOf(name) {
  const extension = extname(name).replace(/^\./, '').toLowerCase()
  if (extension === 'pdf') return 'pdf'
  if (TEXT_EXTENSIONS.has(extension)) return 'text'
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  return 'other'
}

/**
 * Whether a value can be used as one directory segment.
 * @param {unknown} value - candidate.
 * @returns {boolean} true when safe.
 */
function isSegment(value) {
  return typeof value === 'string' && SEGMENT.test(value) && value !== '.' && value !== '..'
}

/**
 * Whether a value is a plain file name (not a path).
 * @param {unknown} value - candidate.
 * @returns {boolean} true when safe.
 */
function isFileName(value) {
  return typeof value === 'string' && FILE_NAME.test(value) && value !== '.' && value !== '..' && basename(value) === value
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
 * The directory a chapter's produced files live in, whether or not it exists.
 * @param {{ artifactDir: string }} config - resolved paths.
 * @param {string} bookId - catalog book id.
 * @param {string} code - canonical chapter code.
 * @returns {string} the absolute directory.
 */
export function chapterArtifactDir(config, bookId, code) {
  return join(config.artifactDir, bookId, code)
}

/**
 * Describe one file name for the browser.
 * @param {string} name - file name inside the chapter directory.
 * @returns {{ name: string, kind: 'pdf' | 'text' | 'image' | 'other' }} the descriptor.
 */
function descriptorOf(name) {
  return { name, kind: kindOf(name) }
}

/**
 * Find the catalog row for one chapter, so the listing is scoped to a chapter
 * the workbench actually shows.
 * @param {{ books: object[] }} catalog - the loaded catalog.
 * @param {string} bookId - requested book.
 * @param {string} code - requested chapter.
 * @returns {{ book: object, chapter: object } | null} the rows, or null when either is unknown.
 */
export function findChapter(catalog, bookId, code) {
  const book = Array.isArray(catalog.books) ? catalog.books.find(item => item.id === bookId) : undefined
  if (book === undefined || !Array.isArray(book.chapters)) return null
  const chapter = book.chapters.find(item => item.code === code)
  if (chapter === undefined) return null
  return { book, chapter }
}

/**
 * List one chapter's produced files.
 * @param {{ artifactDir: string }} config - resolved paths.
 * @param {object} book - catalog book row.
 * @param {object} chapter - catalog chapter row.
 * @returns {Promise<{ dir: string, artifacts: object[], truncated: boolean, missing: boolean }>} the listing.
 */
export async function listArtifacts(config, book, chapter) {
  if (!isSegment(book.id) || !CODE.test(chapter.code)) {
    return { dir: '', artifacts: [], truncated: false, missing: true }
  }
  const dir = chapterArtifactDir(config, book.id, chapter.code)
  const names = await readingNames(dir)
  if (names === null) return { dir, artifacts: [], truncated: false, missing: true }
  const truncated = names.length > MAX_ROWS
  const rows = await Promise.all(names.slice(0, MAX_ROWS).map(async name => {
    const descriptor = descriptorOf(name)
    try {
      const info = await stat(join(dir, name))
      if (!info.isFile()) return null
      return { ...descriptor, size: info.size, mtime: info.mtimeMs }
    } catch {
      // A file that vanished between readdir and stat is not worth a row.
      return null
    }
  }))
  return {
    dir,
    artifacts: rows.filter(row => row !== null),
    truncated,
    missing: false,
  }
}

/**
 * Count the produced files of every chapter of one book without reading any
 * metadata, so a collapsed row can still say how many it holds. One scan of the
 * book's directories replaces a request per chapter.
 * @param {{ artifactDir: string }} config - resolved paths.
 * @param {object} book - catalog book row.
 * @returns {Promise<Record<string, { n: number, truncated: boolean }>>} counts by chapter code.
 */
export async function countArtifacts(config, book) {
  const counts = {}
  // An authored index may carry an id that is not a plain directory name; a
  // count is read-only, but it must not walk out of the artifact root either.
  if (!isSegment(book.id)) return counts
  const chapters = Array.isArray(book.chapters) ? book.chapters : []
  await Promise.all(chapters.map(async chapter => {
    if (!CODE.test(chapter.code)) return
    const dir = chapterArtifactDir(config, book.id, chapter.code)
    const names = await readingNames(dir)
    if (names === null || names.length === 0) return
    counts[chapter.code] = { n: Math.min(names.length, MAX_ROWS), truncated: names.length > MAX_ROWS }
  }))
  return counts
}

/**
 * The file names worth listing in one chapter directory.
 * @param {string} dir - the chapter's directory.
 * @returns {Promise<string[] | null>} sorted names, or null when the directory does not exist.
 */
async function readingNames(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    const code = error !== null && typeof error === 'object' ? error.code : undefined
    // A chapter nobody has written into yet is a normal, empty answer.
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw error
  }
  return entries
    .filter(entry => entry.isFile() || entry.isSymbolicLink())
    .map(entry => entry.name)
    // Office lock files and editor droppings are noise in a reading list.
    .filter(name => !name.startsWith('.') && !name.startsWith('~$'))
    .sort((left, right) => left.localeCompare(right, 'zh'))
}

/**
 * Decode a byte range, preferring UTF-8 but accepting the common Chinese
 * Windows code page when the bytes are not valid UTF-8.
 * @param {Buffer} bytes - the file's leading bytes.
 * @returns {{ text: string, encoding: string }} the decoded text.
 */
export function decodeText(bytes) {
  let best = { text: '', encoding: DECODERS[0], loss: Number.POSITIVE_INFINITY }
  for (const encoding of DECODERS) {
    let text
    try {
      text = new TextDecoder(encoding).decode(bytes)
    } catch {
      continue
    }
    // Each replacement character is one byte the decoder could not map.
    const loss = (text.match(/\uFFFD/g) ?? []).length
    if (loss < best.loss) best = { text, encoding, loss }
    if (loss === 0) break
  }
  return { text: best.text, encoding: best.encoding }
}

/**
 * Read one produced file for the preview.
 * @param {{ artifactDir: string }} config - resolved paths.
 * @param {object} book - catalog book row.
 * @param {object} chapter - catalog chapter row.
 * @param {string} name - file name inside the chapter directory.
 * @returns {Promise<{ ok: true, name: string, kind: string, size: number, mtime: number, text: string, encoding: string, truncated: boolean } | { ok: false, reason: 'bad-name' | 'not-found' | 'not-text' | 'binary' | 'directory' }>} the preview or why it cannot be drawn.
 */
export async function readArtifact(config, book, chapter, name) {
  if (!isFileName(name)) return { ok: false, reason: 'bad-name' }
  if (!isSegment(book.id) || !CODE.test(chapter.code)) return { ok: false, reason: 'bad-name' }
  const dir = chapterArtifactDir(config, book.id, chapter.code)
  const target = resolve(dir, name)
  if (!isInside(config.artifactDir, target) || !isInside(dir, target)) return { ok: false, reason: 'bad-name' }
  const kind = kindOf(name)
  if (kind !== 'text') return { ok: false, reason: 'not-text' }

  let handle
  let info
  try {
    info = await stat(target)
    if (!info.isFile()) return { ok: false, reason: 'directory' }
    handle = await open(target, 'r')
  } catch {
    return { ok: false, reason: 'not-found' }
  }
  try {
    const length = Math.min(info.size, MAX_TEXT_BYTES)
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, 0)
    let bytes = buffer.subarray(0, bytesRead)
    const truncated = info.size > bytesRead
    // NUL bytes mean binary; check the raw read so a trimmed tail cannot hide one.
    if (bytes.includes(0)) return { ok: false, reason: 'binary' }
    // A cut inside a multi-byte character leaves an invalid tail; dropping those
    // bytes keeps the encoding probe from mistaking the file for GB18030.
    if (truncated) bytes = trimPartialTail(bytes)
    const { text, encoding } = decodeText(bytes)
    return {
      ok: true,
      name,
      kind,
      size: info.size,
      mtime: info.mtimeMs,
      text,
      encoding,
      truncated,
    }
  } finally {
    await handle.close().catch(() => {})
  }
}

/**
 * Drop an incomplete trailing UTF-8 sequence (at most three bytes).
 * @param {Buffer} bytes - the truncated read.
 * @returns {Buffer} bytes that decode as UTF-8 without a replacement character.
 */
function trimPartialTail(bytes) {
  for (let drop = 0; drop <= 3 && drop < bytes.length; drop += 1) {
    const candidate = bytes.subarray(0, bytes.length - drop)
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(candidate)
      return candidate
    } catch {
      // Try cutting one more byte.
    }
  }
  return bytes
}

/**
 * Validate the pair the browser asked about and return the catalog rows.
 * @param {{ books: object[] }} catalog - the loaded catalog.
 * @param {unknown} bookId - requested book.
 * @param {unknown} code - requested chapter.
 * @returns {{ ok: true, book: object, chapter: object } | { ok: false, code: string, message: string }} the match or the refusal.
 */
export function resolveChapter(catalog, bookId, code) {
  if (!isSegment(bookId)) return { ok: false, code: 'invalid-book', message: '书 id 不合法' }
  if (typeof code !== 'string' || !CODE.test(code)) return { ok: false, code: 'invalid-code', message: '章号不合法' }
  const match = findChapter(catalog, bookId, code)
  if (match === null) return { ok: false, code: 'unknown-chapter', message: `书库里没有 ${bookId} ${code}` }
  return { ok: true, ...match }
}
