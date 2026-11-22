/**
 * Sessions created from the workbench but not yet used.
 *
 * A workbench session is named `[<book> cNN] <mode>` only when its first turn
 * starts. Until then it stays an ordinary, untitled blank: reusing it from
 * another surface cannot inherit a misleading title, and the workbench can
 * archive it when it is still unused. This registry is the durable intent
 * behind that delay.
 *
 * @module dsh-pdf-workbench/pending
 */
import { readFile, rename, mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** File format version. */
const VERSION = 1

/** Fields kept per entry. */
const MAX_TITLE = 200

/** A session id: the only shape this store accepts. */
const SESSION_ID = /^[\w-]{1,80}$/

/** A chapter code; mirrors the catalog's canonical form. */
const CODE = /^c\d{2,3}$/

/** Modes the workbench creates. */
const MODES = new Set(['general', 'extract', 'qa', 'exercise'])

/**
 * Keep one entry if it is usable.
 * @param {unknown} value - stored entry.
 * @returns {{ title: string, bookId: string, code: string, mode: string, createdAt: number } | null} the entry.
 */
function sanitizeEntry(value) {
  if (value === null || typeof value !== 'object') return null
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  const bookId = typeof value.bookId === 'string' ? value.bookId : ''
  const code = typeof value.code === 'string' ? value.code : ''
  const mode = typeof value.mode === 'string' ? value.mode : ''
  if (title === '' || title.length > MAX_TITLE) return null
  if (bookId === '' || bookId.length > 200) return null
  if (!CODE.test(code)) return null
  if (!MODES.has(mode)) return null
  const createdAt = typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : 0
  return { title, bookId, code, mode, createdAt }
}

/**
 * Read the pending registry; a damaged file reads as empty.
 * @param {string} file - absolute path of `pending.json`.
 * @returns {Promise<Record<string, object>>} entries by session id.
 */
async function readFileEntries(file) {
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return {}
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return {}
  }
  const raw = parsed !== null && typeof parsed === 'object' && parsed.entries !== null && typeof parsed.entries === 'object'
    ? parsed.entries
    : {}
  const entries = {}
  for (const [sessionId, value] of Object.entries(raw)) {
    if (!SESSION_ID.test(sessionId)) continue
    const entry = sanitizeEntry(value)
    if (entry !== null) entries[sessionId] = entry
  }
  return entries
}

/**
 * Durable registry of created-but-unused workbench sessions.
 */
export class PendingStore {
  /**
   * @param {string} file - absolute path of `pending.json`.
   */
  constructor(file) {
    this.file = file
    this.entries = {}
    this.ready = this.load()
    this.queue = Promise.resolve()
  }

  /** Load once; later failures read as empty. */
  async load() {
    this.entries = await readFileEntries(this.file)
  }

  /**
   * Snapshot for one bootstrap response.
   * @returns {Promise<Record<string, object>>} entries by session id.
   */
  async list() {
    await this.ready
    return { ...this.entries }
  }

  /**
   * Record one created session. The write is serialized with removals.
   * @param {string} sessionId - the session.
   * @param {object} value - title/bookId/code/mode.
   * @returns {Promise<void>} completion after durability.
   */
  async put(sessionId, value) {
    if (!SESSION_ID.test(sessionId)) throw new Error('sessionId 不合法')
    const entry = sanitizeEntry({ ...value, createdAt: Date.now() })
    if (entry === null) throw new Error('pending 记录不完整')
    await this.ready
    this.entries = { ...this.entries, [sessionId]: entry }
    this.queue = this.queue.then(() => this.flush()).catch(() => {})
    await this.queue
  }

  /**
   * Read one entry without removing it.
   * @param {string} sessionId - the session.
   * @returns {Promise<object | null>} the entry.
   */
  async get(sessionId) {
    await this.ready
    return this.entries[sessionId] ?? null
  }

  /**
   * Remove one session, returning the entry when it was pending.
   * @param {string} sessionId - the session.
   * @returns {Promise<object | null>} the removed entry.
   */
  async take(sessionId) {
    await this.ready
    const entry = this.entries[sessionId]
    if (entry === undefined) return null
    const next = { ...this.entries }
    delete next[sessionId]
    this.entries = next
    this.queue = this.queue.then(() => this.flush()).catch(() => {})
    await this.queue
    return entry
  }

  /**
   * Remove one session without needing the entry.
   * @param {string} sessionId - the session.
   * @returns {Promise<void>} completion.
   */
  async remove(sessionId) {
    await this.take(sessionId)
  }

  /** Persist atomically. */
  async flush() {
    await mkdir(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify({ version: VERSION, entries: this.entries }, null, 2)}\n`, 'utf8')
    await rename(temporary, this.file)
  }
}
