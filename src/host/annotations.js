/**
 * Durable mirror of the reader's annotations and overlay boxes.
 *
 * The browser's localStorage is the live store (both the reader and the right
 * column edit it directly), but it disappears with site data, a new browser or
 * a new machine. Every edit is therefore mirrored to
 * `<库根>\.mathdesk\annotations\<书>\<章>.json`, which travels with the library
 * and survives plugin updates — the file format carries its own version so a
 * later release can migrate old files instead of dropping them.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** On-disk schema version; bump together with a migration in `readAnnotations`. */
export const ANNOTATION_FORMAT = 1

/**
 * Reject a value that cannot be one path segment.
 * @param {unknown} value - book id or chapter code from a request body.
 * @returns {string} the value, or '' when it is not a plain segment.
 */
export function pathSegment(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '.' || trimmed === '..') return ''
  if (/[\\/:*?"<>|]/.test(trimmed)) return ''
  return trimmed
}

/**
 * The mirror file of one chapter.
 * @param {string} libraryDir - library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @returns {string} absolute path.
 */
export function annotationsFile(libraryDir, book, code) {
  return join(libraryDir, '.mathdesk', 'annotations', book, `${code}.json`)
}

/**
 * Normalize one page entry from a request body or from an older file.
 * @param {unknown} entry - `{ masks, annots, updatedAt }`.
 * @returns {{ masks: object[], annots: object[], updatedAt: number }} the entry.
 */
function pageEntry(entry) {
  const source = entry !== null && typeof entry === 'object' ? entry : {}
  const masks = Array.isArray(source.masks) ? source.masks.filter(item => item !== null && typeof item === 'object') : []
  const annots = Array.isArray(source.annots) ? source.annots.filter(item => item !== null && typeof item === 'object') : []
  const stamp = Number(source.updatedAt)
  return { masks, annots, updatedAt: Number.isFinite(stamp) && stamp > 0 ? stamp : Date.now() }
}

/**
 * Read one chapter's mirror.
 * @param {string} libraryDir - library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @returns {Promise<{ format: number, pages: Record<string, object>, updatedAt: number }>} the mirror; empty when absent.
 */
export async function readAnnotations(libraryDir, book, code) {
  let parsed = null
  try {
    parsed = JSON.parse(await readFile(annotationsFile(libraryDir, book, code), 'utf8'))
  } catch {
    return { format: ANNOTATION_FORMAT, pages: {}, updatedAt: 0 }
  }
  const pages = {}
  const raw = parsed !== null && typeof parsed === 'object' && parsed.pages !== null && typeof parsed.pages === 'object'
    ? parsed.pages
    : {}
  for (const [key, value] of Object.entries(raw)) {
    const page = Number.parseInt(key, 10)
    if (!Number.isFinite(page) || page < 1) continue
    pages[String(page)] = pageEntry(value)
  }
  // Format 0 is what an early build wrote (no `format` field): the page shape is
  // the same, so it is adopted as version 1 rather than discarded.
  const format = Number.isFinite(Number(parsed?.format)) && Number(parsed?.format) > 0 ? Number(parsed.format) : 1
  const stamp = Number(parsed?.updatedAt)
  return { format, pages, updatedAt: Number.isFinite(stamp) ? stamp : 0 }
}

/**
 * Write the mirror atomically (temp file + rename), so a crash never leaves a
 * half file that the next read would treat as empty.
 * @param {string} libraryDir - library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @param {{ pages: Record<string, object>, updatedAt: number }} record - pages to keep.
 * @returns {Promise<number>} the stored `updatedAt`.
 */
async function persist(libraryDir, book, code, record) {
  const target = annotationsFile(libraryDir, book, code)
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.tmp`
  await writeFile(temporary, JSON.stringify({ format: ANNOTATION_FORMAT, book, code, ...record }, null, 1), 'utf8')
  await rename(temporary, target)
  return record.updatedAt
}

/**
 * Merge one page into the mirror. The page is replaced wholesale, because the
 * editor's page state is the authority for its own page.
 * @param {string} libraryDir - library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @param {number} page - 1-based page number.
 * @param {{ masks?: unknown, annots?: unknown, updatedAt?: unknown }} body - the page payload.
 * @returns {Promise<{ updatedAt: number }>} the mirror's new timestamp.
 */
export async function writeAnnotations(libraryDir, book, code, page, body) {
  const record = await readAnnotations(libraryDir, book, code)
  record.pages[String(page)] = pageEntry({ ...body, updatedAt: body.updatedAt ?? Date.now() })
  record.updatedAt = Date.now()
  await persist(libraryDir, book, code, record)
  return { updatedAt: record.updatedAt }
}

/**
 * Seed pages the mirror has never seen. Existing pages are left alone, so a
 * browser that still holds the notes can hand them over without a chance of
 * overwriting something newer on disk.
 * @param {string} libraryDir - library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @param {Array<{ page: unknown, masks?: unknown, annots?: unknown }>} pages - candidate pages.
 * @returns {Promise<{ added: number }>} how many pages were new.
 */
export async function seedAnnotations(libraryDir, book, code, pages) {
  const record = await readAnnotations(libraryDir, book, code)
  let added = 0
  for (const item of Array.isArray(pages) ? pages : []) {
    const page = Number.parseInt(String(item?.page ?? ''), 10)
    if (!Number.isFinite(page) || page < 1) continue
    if (record.pages[String(page)] !== undefined) continue
    record.pages[String(page)] = pageEntry(item)
    added += 1
  }
  if (added > 0) {
    record.updatedAt = Date.now()
    await persist(libraryDir, book, code, record)
  }
  return { added }
}
