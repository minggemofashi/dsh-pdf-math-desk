/**
 * The libraries this plugin knows about.
 *
 * One computer may hold several split libraries (different subjects, different
 * drives). Each entry is just the paths the rest of the plugin needs, kept in
 * `$DSH_HOME/pdfdesk/libraries.json` together with which one is active. An empty
 * file means no library: the profile config is only a fallback for migration and
 * tests, never a generated first library.
 *
 * Only the math layout is supported for now: the manual in the workbench tells a
 * user how a library must be split and named, and `mode` records that so a later
 * subject layout can be added without migrating.
 *
 * @module dsh-pdf-workbench/libraries
 */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/** File format version. */
const VERSION = 1

/** The only layout this version understands. */
export const MODE_MATH = 'math'

/** Entries kept at most. */
const MAX_LIBRARIES = 24

/** A generated id: no spaces, no Chinese, stable in URLs. */
const ID_SHAPE = /^lib-[a-z0-9-]{1,40}$/

/** A safe name for display. */
const MAX_NAME = 120

/**
 * Derive the standard layout of one library root.
 * @param {string} libraryDir - the library root (holds 分片/, 产物/, 封面/, 索引.json).
 * @returns {{ libraryDir: string, fragmentDir: string, artifactDir: string, coverDir: string, indexPath: string }} the paths.
 */
export function deriveLayout(libraryDir) {
  return {
    libraryDir,
    fragmentDir: join(libraryDir, '分片'),
    artifactDir: join(libraryDir, '产物'),
    coverDir: join(libraryDir, '封面'),
    indexPath: join(libraryDir, '索引.json'),
  }
}

/**
 * Keep one stored entry if it is usable.
 * @param {unknown} value - stored entry.
 * @returns {{ id: string, name: string, mode: string, libraryDir: string, fragmentDir: string, artifactDir: string, coverDir: string, indexPath: string, addedAt: number } | null} the entry.
 */
function sanitizeEntry(value) {
  if (value === null || typeof value !== 'object') return null
  const id = typeof value.id === 'string' && ID_SHAPE.test(value.id) ? value.id : ''
  const libraryDir = typeof value.libraryDir === 'string' && value.libraryDir !== '' ? value.libraryDir : ''
  if (id === '' || libraryDir === '') return null
  const name = typeof value.name === 'string' && value.name.trim() !== ''
    ? value.name.trim().slice(0, MAX_NAME)
    : basename(libraryDir)
  const layout = deriveLayout(libraryDir)
  return {
    id,
    name,
    mode: typeof value.mode === 'string' && value.mode !== '' ? value.mode : MODE_MATH,
    libraryDir,
    fragmentDir: typeof value.fragmentDir === 'string' && value.fragmentDir !== '' ? value.fragmentDir : layout.fragmentDir,
    artifactDir: typeof value.artifactDir === 'string' && value.artifactDir !== '' ? value.artifactDir : layout.artifactDir,
    coverDir: typeof value.coverDir === 'string' && value.coverDir !== '' ? value.coverDir : layout.coverDir,
    indexPath: typeof value.indexPath === 'string' && value.indexPath !== '' ? value.indexPath : layout.indexPath,
    addedAt: typeof value.addedAt === 'number' && Number.isFinite(value.addedAt) ? value.addedAt : 0,
  }
}

/**
 * Durable list of libraries plus the active one.
 */
export class LibrariesStore {
  /**
   * @param {string} file - absolute path of `libraries.json`.
   * @param {{ libraryDir: string, fragmentDir: string, artifactDir: string, coverDir: string, indexPath: string, name?: string }} fallback - the profile's configured library.
   */
  constructor(file, fallback) {
    this.file = file
    this.fallback = fallback
    this.items = []
    this.activeId = null
    this.ready = this.load()
    this.queue = Promise.resolve()
  }

  /** Load once; no libraries means an empty list, never a generated default. */
  async load() {
    let parsed = null
    try {
      parsed = JSON.parse(await readFile(this.file, 'utf8'))
    } catch {
      parsed = null
    }
    const raw = parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.items) ? parsed.items : []
    const items = []
    for (const value of raw) {
      const entry = sanitizeEntry(value)
      if (entry !== null && !items.some(item => item.id === entry.id)) items.push(entry)
      if (items.length >= MAX_LIBRARIES) break
    }
    this.items = items
    const storedActive = parsed !== null && typeof parsed === 'object' && typeof parsed.activeId === 'string' ? parsed.activeId : null
    this.activeId = items.some(item => item.id === storedActive) ? storedActive : (items[0]?.id ?? null)
  }

  /** The profile's configured library. Kept for explicit migration/tests only. */
  fallbackEntry() {
    return {
      id: 'lib-default',
      name: this.fallback.name !== undefined && this.fallback.name !== '' ? this.fallback.name : basename(this.fallback.libraryDir),
      mode: MODE_MATH,
      libraryDir: this.fallback.libraryDir,
      fragmentDir: this.fallback.fragmentDir,
      artifactDir: this.fallback.artifactDir,
      coverDir: this.fallback.coverDir,
      indexPath: this.fallback.indexPath,
      addedAt: Date.now(),
    }
  }

  /**
   * Snapshot for bootstrap.
   * @returns {Promise<{ items: object[], activeId: string | null }>} the list and the active id.
   */
  async list() {
    await this.ready
    return { items: this.items.map(item => ({ ...item })), activeId: this.activeId }
  }

  /**
   * The active library.
   * @returns {Promise<object | null>} the active entry, or null.
   */
  async active() {
    await this.ready
    return this.items.find(item => item.id === this.activeId) ?? null
  }

  /**
   * Add one library root. Validates that the directory exists.
   * @param {{ libraryDir: string, name?: string }} input - the root and an optional display name.
   * @returns {Promise<object>} the added entry.
   */
  async add(input) {
    const libraryDir = typeof input.libraryDir === 'string' ? input.libraryDir.trim() : ''
    if (libraryDir === '') throw new Error('书库目录不能为空')
    let info
    try {
      info = await stat(libraryDir)
    } catch {
      throw new Error(`目录不存在：${libraryDir}`)
    }
    if (!info.isDirectory()) throw new Error(`不是目录：${libraryDir}`)
    await this.ready
    const duplicate = this.items.find(item => item.libraryDir.toLowerCase() === libraryDir.toLowerCase())
    if (duplicate !== undefined) {
      this.activeId = duplicate.id
      await this.flush()
      return duplicate
    }
    if (this.items.length >= MAX_LIBRARIES) throw new Error('书库数量已达上限')
    const layout = deriveLayout(libraryDir)
    const entry = {
      id: `lib-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
      name: typeof input.name === 'string' && input.name.trim() !== ''
        ? input.name.trim().slice(0, MAX_NAME)
        : basename(libraryDir),
      mode: MODE_MATH,
      ...layout,
      addedAt: Date.now(),
    }
    this.items = [...this.items, entry]
    this.activeId = entry.id
    await this.flush()
    return entry
  }

  /**
   * Choose one library.
   * @param {string} id - the entry id.
   * @returns {Promise<boolean>} whether the id was known.
   */
  async setActive(id) {
    await this.ready
    if (!this.items.some(item => item.id === id)) return false
    this.activeId = id
    await this.flush()
    return true
  }

  /**
   * Forget one library (files stay on disk).
   * @param {string} id - the entry id.
   * @returns {Promise<boolean>} whether it was removed.
   */
  async remove(id) {
    await this.ready
    const next = this.items.filter(item => item.id !== id)
    if (next.length === this.items.length) return false
    this.items = next
    if (!this.items.some(item => item.id === this.activeId)) this.activeId = this.items[0]?.id ?? null
    await this.flush()
    return true
  }

  /** Persist atomically. */
  async flush() {
    await mkdir(dirname(this.file), { recursive: true })
    const payload = { version: VERSION, activeId: this.activeId, items: this.items }
    const temporary = `${this.file}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    await rename(temporary, this.file)
  }
}
