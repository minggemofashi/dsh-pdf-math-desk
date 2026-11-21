/**
 * Per-library shelf organisation: hidden books and user-made shelves.
 *
 * Nothing here touches the filesystem of the library: these are just book id
 * lists the browser asked the Host to remember, keyed by library id so several
 * libraries can hide or group independently.
 *
 * @module dsh-pdf-math-desk/shelf-groups
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const VERSION = 1
const MAX_SHELVES = 60
const MAX_BOOKS = 2000
const ID = /^[^\\/:*?"<>|]{1,200}$/
const SHELF_ID = /^g-[a-z0-9-]{1,40}$/

function bookIds(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const ids = []
  for (const item of value) {
    if (typeof item !== 'string' || !ID.test(item) || seen.has(item)) continue
    seen.add(item)
    ids.push(item)
    if (ids.length >= MAX_BOOKS) break
  }
  return ids
}

/**
 * Sanitize one library's stored groups.
 * @param {unknown} value - stored groups.
 * @returns {{ hidden: string[], shelves: { id: string, name: string, books: string[] }[] }} safe groups.
 */
export function sanitizeGroups(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  const shelves = []
  const seen = new Set()
  for (const entry of Array.isArray(source.shelves) ? source.shelves : []) {
    if (entry === null || typeof entry !== 'object') continue
    if (typeof entry.id !== 'string' || !SHELF_ID.test(entry.id) || seen.has(entry.id)) continue
    const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 60) : ''
    if (name === '') continue
    seen.add(entry.id)
    const parent = entry.parent === 'hidden'
      ? 'hidden'
      : typeof entry.parent === 'string' && SHELF_ID.test(entry.parent) ? entry.parent : undefined
    shelves.push(parent === undefined
      ? { id: entry.id, name, books: bookIds(entry.books) }
      : { id: entry.id, name, books: bookIds(entry.books), parent })
    if (shelves.length >= MAX_SHELVES) break
  }
  return { hidden: bookIds(source.hidden), shelves }
}

/** Durable per-library hidden list and shelves. */
export class ShelfGroups {
  /**
   * @param {string} file - absolute path of `shelves.json`.
   */
  constructor(file) {
    this.file = file
    this.data = {}
    this.ready = this.load()
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'))
      const libraries = parsed !== null && typeof parsed === 'object' && parsed.libraries !== null && typeof parsed.libraries === 'object'
        ? parsed.libraries
        : {}
      for (const [id, value] of Object.entries(libraries)) this.data[id] = sanitizeGroups(value)
    } catch {
      this.data = {}
    }
  }

  /**
   * @param {string} libraryId - active library id.
   * @returns {Promise<{ hidden: string[], shelves: object[] }>} its groups.
   */
  async get(libraryId) {
    await this.ready
    return this.data[libraryId] ?? { hidden: [], shelves: [] }
  }

  /**
   * Replace one library's groups.
   * @param {string} libraryId - active library id.
   * @param {unknown} value - browser-provided groups.
   * @returns {Promise<{ hidden: string[], shelves: object[] }>} the saved groups.
   */
  async put(libraryId, value) {
    await this.ready
    this.data[libraryId] = sanitizeGroups(value)
    await this.flush()
    return this.data[libraryId]
  }

  async flush() {
    await mkdir(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify({ version: VERSION, libraries: this.data }, null, 2)}\n`, 'utf8')
    await rename(temporary, this.file)
  }
}
