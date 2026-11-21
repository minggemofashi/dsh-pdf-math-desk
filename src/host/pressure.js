/**
 * The last context pressure seen for each session.
 *
 * "New" from a chapter should continue that chapter's conversation instead of
 * leaving a new one behind on every click; it must start a continuation once the
 * conversation is nearly full. The live answer comes from `tokenMeter`, which
 * needs a live Session object — so the Host records the pressure it sees at the
 * end of every turn here, and a session that is no longer live still answers
 * from this snapshot.
 *
 * @module dsh-pdf-math-desk/pressure
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** File format version. */
const VERSION = 1

/** Session ids kept at most; older entries are dropped on write. */
const MAX_ENTRIES = 4000

/** A session id: the only shape this store accepts. */
const SESSION_ID = /^[\w-]{1,80}$/

/**
 * Keep one measurement if it is usable.
 * @param {unknown} value - stored measurement.
 * @returns {{ tokens: number, window: number, at: number } | null} the entry.
 */
function sanitize(value) {
  if (value === null || typeof value !== 'object') return null
  const tokens = typeof value.tokens === 'number' && Number.isFinite(value.tokens) && value.tokens >= 0 ? value.tokens : -1
  const window = typeof value.window === 'number' && Number.isFinite(value.window) && value.window > 0 ? value.window : 0
  if (tokens < 0 || window === 0) return null
  const at = typeof value.at === 'number' && Number.isFinite(value.at) ? value.at : Date.now()
  return { tokens, window, at }
}

/**
 * Durable per-session context pressure snapshots.
 */
export class PressureStore {
  /**
   * @param {string} file - absolute path of `pressure.json`.
   */
  constructor(file) {
    this.file = file
    this.entries = {}
    this.ready = this.load()
    this.queue = Promise.resolve()
  }

  /** Load once; a damaged file reads as empty. */
  async load() {
    let text
    try {
      text = await readFile(this.file, 'utf8')
    } catch {
      return
    }
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return
    }
    const raw = parsed !== null && typeof parsed === 'object' && parsed.entries !== null && typeof parsed.entries === 'object'
      ? parsed.entries
      : {}
    const entries = {}
    for (const [sessionId, value] of Object.entries(raw)) {
      if (!SESSION_ID.test(sessionId)) continue
      const entry = sanitize(value)
      if (entry !== null) entries[sessionId] = entry
    }
    this.entries = entries
  }

  /**
   * One session's last snapshot.
   * @param {string} sessionId - the session.
   * @returns {Promise<{ tokens: number, window: number, at: number } | null>} the entry.
   */
  async get(sessionId) {
    await this.ready
    return this.entries[sessionId] ?? null
  }

  /**
   * Record one measurement. Writes are serialized.
   * @param {string} sessionId - the session.
   * @param {{ tokens: number, window: number }} value - the measurement.
   * @returns {Promise<void>} completion after durability.
   */
  async put(sessionId, value) {
    if (!SESSION_ID.test(sessionId)) return
    const entry = sanitize({ ...value, at: Date.now() })
    if (entry === null) return
    await this.ready
    this.entries = { ...this.entries, [sessionId]: entry }
    const keys = Object.keys(this.entries)
    if (keys.length > MAX_ENTRIES) {
      // Drop the oldest snapshots rather than growing without bound.
      const trimmed = {}
      for (const key of keys.sort((left, right) => this.entries[right].at - this.entries[left].at).slice(0, MAX_ENTRIES)) {
        trimmed[key] = this.entries[key]
      }
      this.entries = trimmed
    }
    this.queue = this.queue.then(() => this.flush()).catch(() => {})
    await this.queue
  }

  /**
   * Forget one session.
   * @param {string} sessionId - the session.
   * @returns {Promise<void>} completion.
   */
  async forget(sessionId) {
    if (!SESSION_ID.test(sessionId)) return
    await this.ready
    if (this.entries[sessionId] === undefined) return
    const next = { ...this.entries }
    delete next[sessionId]
    this.entries = next
    this.queue = this.queue.then(() => this.flush()).catch(() => {})
    await this.queue
  }

  /** Persist atomically. */
  async flush() {
    await mkdir(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify({ version: VERSION, entries: this.entries }, null, 2)}\n`, 'utf8')
    await rename(temporary, this.file)
  }
}
