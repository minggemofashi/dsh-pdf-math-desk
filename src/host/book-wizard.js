/**
 * Book-package import: inspect a PDF package (with an optional notes package)
 * and import only the books the user ticked.
 *
 * A PDF package is a ZIP that may mix both shapes the library uses:
 *   - split books: `<书id>/<章>.pdf` (a leading `分片/` is ignored), one book per
 *     first-level folder;
 *   - whole books: a loose `<书名>.pdf` (a leading `整本/` is ignored), one book
 *     per file.
 * A notes package is either a library export (`manifest.json` with
 * `pdfdesk-library-export`, paths under `.pdfdesk/…`) or a migration backup
 * (`format: 1`, paths under `libraries/<libId>/.pdfdesk/…`).
 *
 * Packages are read entry by entry, never as one buffered archive: inspecting
 * only looks at names, sizes and each PDF's header, content hashes are streamed,
 * and importing streams each PDF into a temp file in its destination folder
 * before the atomic rename.
 *
 * Existing books are detected by content (size + sha256) against the active
 * library's PDFs; such a book keeps its PDF untouched and only its notes can be
 * written (merge, overwrite or skip, per book).
 *
 * @module dsh-pdf-workbench/book-wizard
 */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { Transform } from 'node:stream'

import { walkFiles } from './backup.js'
import { MAX_ARCHIVE_FILE_BYTES } from './imports.js'
import { listZipEntries, pipeZipEntry, readZipEntryBuffer, readZipEntryHead, safeZipName } from './zip.js'

/** Categories of per-book data a notes package may carry. */
export const NOTE_CATEGORIES = ['annotations', 'questions', 'attachments']

/** PDF header, per ISO 32000. */
const PDF_SIGNATURE = '%PDF-'

/** Content hash used for "same PDF" detection, streamed so a book is never buffered. */
function hashFileStream(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}

/**
 * A safe book id (folder name under `分片/`).
 * @param {string} raw - proposed id.
 * @returns {string} the id, or '' when unusable.
 */
export function bookIdOf(raw) {
  const value = String(raw ?? '').trim()
  if (value === '' || value === '.' || value === '..') return ''
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(value)) return ''
  if (value.startsWith('.')) return ''
  return value.slice(0, 120)
}

/**
 * The one grouping rule for PDF packages, shared by the buffered helper and the
 * streaming wizard path so they cannot drift.
 *
 * @param {Iterable<{ name: string, bytes: number, isPdf: boolean, payload: unknown }>} items - every archive entry, in directory order, with its PDF-header verdict.
 * @returns {{ books: Array<{ id: string, kind: 'split'|'whole', files: Array<{ name: string, bytes: number, payload: unknown }> }>, warnings: string[] }} the books.
 */
function groupPdfEntries(items) {
  const books = new Map()
  const warnings = []
  for (const item of items) {
    const entryName = item.name
    if (entryName.endsWith('/')) continue
    const safe = safeZipName(entryName)
    const parts = safe.split('/').filter(part => part !== '')
    const leaf = parts[parts.length - 1]
    if (extname(leaf).toLowerCase() !== '.pdf') {
      warnings.push(`跳过非 PDF：${safe}`)
      continue
    }
    if (!item.isPdf) {
      warnings.push(`跳过假 PDF（文件头不是 ${PDF_SIGNATURE}）：${safe}`)
      continue
    }
    // Ignore the library's own zone wrappers so both `书/章.pdf` and
    // `分片/书/章.pdf` describe the same book.
    const rest = parts.length > 1 && (parts[0] === '分片' || parts[0] === '整本') ? parts.slice(1) : parts
    const split = rest.length >= 2
    const rawId = split ? rest[0] : leaf.replace(/\.pdf$/i, '')
    const id = bookIdOf(rawId)
    if (id === '') {
      warnings.push(`书名不合法，已跳过：${safe}`)
      continue
    }
    if (!books.has(id)) books.set(id, { id, kind: split ? 'split' : 'whole', files: [] })
    const book = books.get(id)
    if (book.kind === 'whole' && split) {
      book.kind = 'split'
      warnings.push(`《${id}》同时有整本与章节文件，按分片书处理`)
    }
    if (!split && book.kind === 'split') {
      warnings.push(`《${id}》的散装文件已忽略（书内已有章节文件）`)
      continue
    }
    book.files.push({ name: leaf, bytes: item.bytes, payload: item.payload })
  }
  return { books: [...books.values()], warnings }
}

/**
 * Group one PDF archive into books.
 * @param {Map<string, Buffer>} entries - archive entries.
 * @returns {{ books: Array<{ id: string, kind: 'split'|'whole', files: Array<{ name: string, bytes: number, data: Buffer }> }>, warnings: string[] }} the books.
 */
export function booksFromPdfEntries(entries) {
  const items = []
  for (const [entryName, data] of entries) {
    items.push({
      name: entryName,
      bytes: data.length,
      isPdf: data.length >= PDF_SIGNATURE.length && data.subarray(0, PDF_SIGNATURE.length).toString('latin1') === PDF_SIGNATURE,
      payload: data,
    })
  }
  const { books, warnings } = groupPdfEntries(items)
  return {
    books: books.map(book => ({
      id: book.id,
      kind: book.kind,
      files: book.files.map(file => ({ name: file.name, bytes: file.bytes, data: file.payload })),
    })),
    warnings,
  }
}

/**
 * Whether a listed entry can be a PDF, from its leaf name only.
 * @param {string} entryName - normalized archive name.
 * @returns {boolean} true when the leaf ends in `.pdf`.
 */
function looksLikePdfName(entryName) {
  const leaf = String(entryName).split('/').pop() ?? ''
  return extname(leaf).toLowerCase() === '.pdf'
}

/**
 * Group a listed archive into books without reading any PDF body: the header is
 * peeked through the stream, and the payload is the entry itself (`listZipEntries`
 * shape), which `pipeZipEntry` can later unpack one at a time.
 * @param {string} archivePath - archive on disk.
 * @param {Array<object>} listing - `listZipEntries` result.
 * @returns {Promise<{ books: Array<{ id: string, kind: 'split'|'whole', files: Array<{ name: string, bytes: number, entry: object }> }>, warnings: string[] }>} the books.
 */
async function booksFromListing(archivePath, listing) {
  const items = []
  for (const entry of listing) {
    let isPdf = false
    if (looksLikePdfName(entry.name) && entry.size >= PDF_SIGNATURE.length) {
      const head = await readZipEntryHead(archivePath, entry, PDF_SIGNATURE.length)
      isPdf = head.length === PDF_SIGNATURE.length && head.toString('latin1') === PDF_SIGNATURE
    }
    items.push({ name: entry.name, bytes: entry.size, isPdf, payload: entry })
  }
  const { books, warnings } = groupPdfEntries(items)
  return {
    books: books.map(book => ({
      id: book.id,
      kind: book.kind,
      files: book.files.map(file => ({ name: file.name, bytes: file.bytes, entry: file.payload })),
    })),
    warnings,
  }
}

/**
 * Where one entry belongs in a notes tree, or null when it is not a note.
 * @param {string} entryName - archive name.
 * @returns {{ id: string, category: string, path: string } | null} the note destination.
 */
function noteTargetOf(entryName) {
  const safe = safeZipName(entryName)
  const parts = safe.split('/').filter(part => part !== '')
  let rest = parts
  // Migration backup: libraries/<libId>/.pdfdesk/...
  if (rest[0] === 'libraries') {
    const pdfdeskAt = rest.indexOf('.pdfdesk')
    if (pdfdeskAt < 2) return null
    rest = rest.slice(pdfdeskAt)
  }
  if (rest[0] !== '.pdfdesk' || rest.length < 4) return null
  const category = rest[1]
  if (!NOTE_CATEGORIES.includes(category)) return null
  const id = bookIdOf(rest[2])
  if (id === '') return null
  const path = rest.slice(3).join('/')
  if (path === '') return null
  return { id, category, path }
}

/**
 * Per-book note data from a notes package.
 * @param {Map<string, Buffer>} entries - archive entries.
 * @returns {Map<string, Array<{ category: string, path: string, data: Buffer }>>} notes by book id.
 */
export function notesFromEntries(entries) {
  const notes = new Map()
  for (const [entryName, data] of entries) {
    const target = noteTargetOf(entryName)
    if (target === null) continue
    if (!notes.has(target.id)) notes.set(target.id, [])
    notes.get(target.id).push({ category: target.category, path: target.path, data })
  }
  return notes
}

/**
 * Read the note entries of a listed package. Notes are small JSON/image files by
 * design, so they stay buffered (the pure helpers take buffers); a single entry
 * is still capped, so a lying package cannot exhaust memory here.
 * @param {string} archivePath - notes package on disk.
 * @param {Array<object>} listing - `listZipEntries` result.
 * @returns {Promise<Map<string, Array<{ category: string, path: string, data: Buffer }>>>} notes by book id.
 */
async function notesFromListing(archivePath, listing) {
  const notes = new Map()
  for (const entry of listing) {
    const target = noteTargetOf(entry.name)
    if (target === null) continue
    const data = await readZipEntryBuffer(archivePath, entry, MAX_ARCHIVE_FILE_BYTES)
    if (!notes.has(target.id)) notes.set(target.id, [])
    notes.get(target.id).push({ category: target.category, path: target.path, data })
  }
  return notes
}

/**
 * Hash one archive entry by streaming it through a discarding sink.
 * @param {string} archivePath - archive on disk.
 * @param {object} entry - one `listZipEntries` entry.
 * @returns {Promise<string>} hex sha256 of the entry's content.
 */
async function hashEntry(archivePath, entry) {
  const sink = new Transform({
    transform(_chunk, _encoding, callback) {
      callback()
    },
  })
  const result = await pipeZipEntry(archivePath, entry, sink)
  return result.sha256
}

/**
 * Hash one library PDF only when its size can match; the index keeps the work
 * proportional to the books being imported.
 * @param {string} libraryDir - library root.
 * @returns {Promise<Map<number, Array<{ path: string, hash: string | null }>>>} size → files.
 */
async function libraryPdfIndex(libraryDir) {
  const index = new Map()
  const paths = []
  for (const name of await readdir(join(libraryDir, '整本')).catch(() => [])) {
    if (extname(name).toLowerCase() === '.pdf') paths.push(join(libraryDir, '整本', name))
  }
  for (const relative of await walkFiles(join(libraryDir, '分片')).catch(() => [])) {
    if (extname(relative).toLowerCase() === '.pdf') paths.push(join(libraryDir, '分片', relative))
  }
  for (const path of paths) {
    const info = await stat(path).catch(() => null)
    if (info === null || !info.isFile()) continue
    if (!index.has(info.size)) index.set(info.size, [])
    index.get(info.size).push({ path, hash: null })
  }
  return index
}

/**
 * Find an identical file already in the library.
 * @param {Map<number, Array<{ path: string, hash: string | null }>>} index - library index.
 * @param {number} size - candidate size.
 * @param {string} hash - candidate sha256.
 * @returns {Promise<string | null>} the existing path, or null.
 */
async function existingFile(index, size, hash) {
  const candidates = index.get(size)
  if (candidates === undefined) return null
  for (const candidate of candidates) {
    if (candidate.hash === null) candidate.hash = await hashFileStream(candidate.path)
    if (candidate.hash === hash) return candidate.path
  }
  return null
}

/**
 * Inspect a PDF package (and an optional notes package).
 * @param {{ archivePath: string, notesPath?: string, libraryDir: string }} options - packages and the active library.
 * @returns {Promise<{ books: Array<object>, notesBooks: string[], warnings: string[], notes: boolean }>} the inspection.
 */
export async function inspectBookPack(options) {
  const { books, warnings } = await booksFromListing(options.archivePath, await listZipEntries(options.archivePath))
  let notes = new Map()
  if (typeof options.notesPath === 'string' && options.notesPath !== '') {
    notes = await notesFromListing(options.notesPath, await listZipEntries(options.notesPath))
  }
  const index = await libraryPdfIndex(options.libraryDir)
  const result = []
  for (const book of books) {
    const matched = []
    for (const file of book.files) {
      const hash = await hashEntry(options.archivePath, file.entry)
      const existing = await existingFile(index, file.bytes, hash)
      if (existing !== null) matched.push(existing)
    }
    const bookNotes = notes.get(book.id) ?? []
    result.push({
      id: book.id,
      kind: book.kind,
      files: book.files.map(file => ({ name: file.name, bytes: file.bytes })),
      totalBytes: book.files.reduce((sum, file) => sum + file.bytes, 0),
      existing: matched.length === book.files.length && book.files.length > 0,
      matchedFiles: matched.length,
      notes: bookNotes.length > 0 ? { files: bookNotes.length, bytes: bookNotes.reduce((sum, note) => sum + note.data.length, 0) } : null,
    })
  }
  return {
    books: result,
    notesBooks: [...notes.keys()],
    notes: notes.size > 0,
    warnings,
  }
}

/**
 * Stream one archive entry into the destination folder, then give it a free name
 * under the wizard's `-1…` suffix rule (an identical neighbour is a duplicate).
 * @param {string} targetDir - destination.
 * @param {string} name - file name (a leaf, never a path).
 * @param {string} archivePath - the package the entry lives in.
 * @param {object} entry - one `listZipEntries` entry.
 * @returns {Promise<{ name: string, written: boolean, duplicate: string | null }>} what happened.
 */
async function writePdfEntry(targetDir, name, archivePath, entry) {
  await mkdir(targetDir, { recursive: true })
  const extension = extname(name)
  const stem = extension === '' ? name : name.slice(0, -extension.length)
  const temporary = join(targetDir, `.import-${randomUUID()}.pdf`)
  let hash
  try {
    const streamed = await pipeZipEntry(archivePath, entry, createWriteStream(temporary))
    hash = streamed.sha256
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
  try {
    for (let counter = 0; counter < 1000; counter += 1) {
      const candidate = counter === 0 ? name : `${stem}-${counter}${extension}`
      const target = join(targetDir, candidate)
      const info = await stat(target).catch(() => null)
      if (info === null) {
        await rename(temporary, target)
        return { name: candidate, written: true, duplicate: null }
      }
      if (await hashFileStream(target) === hash) {
        await rm(temporary, { force: true }).catch(() => {})
        return { name: candidate, written: false, duplicate: candidate }
      }
    }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
  await rm(temporary, { force: true }).catch(() => {})
  throw new Error(`同名文件太多：${name}`)
}

/**
 * Import the selected books, then their notes per book.
 * @param {{ archivePath: string, notesPath?: string, libraryDir: string, selection: Array<{ id: string, include?: boolean, notes?: 'merge'|'overwrite'|'skip' }> }} options - packages, library and ticked books.
 * @returns {Promise<{ books: Array<object>, warnings: string[] }>} the report.
 */
export async function applyBookPack(options) {
  const { books, warnings } = await booksFromListing(options.archivePath, await listZipEntries(options.archivePath))
  const notes = typeof options.notesPath === 'string' && options.notesPath !== ''
    ? await notesFromListing(options.notesPath, await listZipEntries(options.notesPath))
    : new Map()
  const wanted = new Map()
  for (const row of Array.isArray(options.selection) ? options.selection : []) {
    if (row === null || typeof row !== 'object' || row.include === false) continue
    const id = bookIdOf(row.id)
    if (id !== '') wanted.set(id, row.notes === 'overwrite' || row.notes === 'skip' ? row.notes : 'merge')
  }
  const report = []
  for (const book of books) {
    if (!wanted.has(book.id)) continue
    const row = { id: book.id, kind: book.kind, imported: [], duplicates: [], skipped: false, notes: null }
    const index = await libraryPdfIndex(options.libraryDir)
    let allExisting = book.files.length > 0
    for (const file of book.files) {
      const hash = await hashEntry(options.archivePath, file.entry)
      const existing = await existingFile(index, file.bytes, hash)
      if (existing === null) allExisting = false
    }
    row.skipped = allExisting
    if (!allExisting) {
      const targetDir = book.kind === 'split' ? join(options.libraryDir, '分片', book.id) : join(options.libraryDir, '整本')
      for (const file of book.files) {
        const result = await writePdfEntry(targetDir, file.name, options.archivePath, file.entry)
        if (result.written) row.imported.push(result.name)
        else row.duplicates.push(result.name)
      }
    }
    const policy = wanted.get(book.id)
    const bookNotes = notes.get(book.id) ?? []
    if (bookNotes.length > 0 && policy !== 'skip') {
      let written = 0
      let kept = 0
      for (const note of bookNotes) {
        const target = join(options.libraryDir, '.pdfdesk', note.category, book.id, ...note.path.split('/'))
        const exists = await stat(target).catch(() => null)
        if (exists !== null && policy === 'merge') {
          kept += 1
          continue
        }
        await mkdir(dirname(target), { recursive: true })
        const temporary = `${target}.${process.pid}.importing`
        await writeFile(temporary, note.data)
        await rename(temporary, target)
        written += 1
      }
      row.notes = { policy, written, kept }
    } else if (bookNotes.length > 0) {
      row.notes = { policy: 'skip', written: 0, kept: bookNotes.length }
    }
    report.push(row)
  }
  const selected = [...wanted.keys()]
  for (const id of selected) {
    if (!books.some(book => book.id === id)) warnings.push(`选择的书不在包里：${id}`)
  }
  return { books: report, warnings }
}

/**
 * Remove a staged upload once the wizard is done with it.
 * @param {string} path - staged file.
 * @returns {Promise<void>}
 */
export async function discardStage(path) {
  await rm(path, { force: true }).catch(() => {})
}
