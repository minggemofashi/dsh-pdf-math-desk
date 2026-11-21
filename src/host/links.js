/**
 * Extra chapter placements for a session.
 *
 * A session's own title is its primary binding: `[<book id> cNN] <mode>` is
 * what the workbench classifies on. That gives exactly one chapter per session.
 * Two needs contradict that: an older session written before this convention,
 * and one conversation that belongs under two chapters. Both are solved here by
 * a link list instead of by rewriting the title — the conversation keeps its
 * name, and the workbench shows it under the union of its title and its links.
 *
 * Links are deliberately tiny: the browser sends `(sessionId, bookId, code,
 * mode)`; the Host validates the chapter against the live catalog before saving.
 * A link whose session disappears is pruned, never fatal.
 *
 * @module dsh-pdf-math-desk/links
 */
import { readFile, rename, mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** File format version. */
const VERSION = 1

/** Links one session may hold, so a stray loop cannot grow the file forever. */
const MAX_PER_SESSION = 40

/** A session id: the only shape this store accepts. */
const SESSION_ID = /^[\w-]{1,80}$/

/** One path-safe book id. */
const BOOK_ID = /^[^\\/:*?"<>|]{1,200}$/

/** A chapter code, canonical form. */
const CODE = /^c\d{2,3}$/

/** Modes a chapter groups its sessions by. */
const MODES = new Set(['extract', 'qa', 'exercise'])

/**
 * Keep one link if it is usable.
 * @param {unknown} value - stored or submitted link.
 * @returns {{ bookId: string, code: string, mode: string, createdAt: number } | null} the link.
 */
function sanitizeLink(value) {
  if (value === null || typeof value !== 'object') return null
  const bookId = typeof value.bookId === 'string' ? value.bookId : ''
  const code = typeof value.code === 'string' ? value.code.trim().toLowerCase() : ''
  const mode = typeof value.mode === 'string' ? value.mode : ''
  if (!BOOK_ID.test(bookId) || bookId === '.' || bookId === '..') return null
  if (!CODE.test(code)) return null
  if (!MODES.has(mode)) return null
  const createdAt = typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : 0
  return { bookId, code, mode, createdAt }
}

/**
 * Read the link file; anything damaged reads as empty.
 * @param {string} file - absolute path of `links.json`.
 * @returns {Promise<Record<string, object[]>>} links by session id.
 */
async function readLinkFile(file) {
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
  const raw = parsed !== null && typeof parsed === 'object' && parsed.links !== null && typeof parsed.links === 'object'
    ? parsed.links
    : {}
  const links = {}
  for (const [sessionId, entries] of Object.entries(raw)) {
    if (!SESSION_ID.test(sessionId) || !Array.isArray(entries)) continue
    const list = []
    const seen = new Set()
    for (const entry of entries) {
      const link = sanitizeLink(entry)
      if (link === null) continue
      const key = `${link.bookId}|${link.code}`
      if (seen.has(key)) continue
      seen.add(key)
      list.push(link)
      if (list.length >= MAX_PER_SESSION) break
    }
    if (list.length > 0) links[sessionId] = list
  }
  return links
}

/**
 * Durable extra placements for sessions; the session title stays untouched.
 */
export class LinksStore {
  /**
   * @param {string} file - absolute path of `links.json`.
   */
  constructor(file) {
    this.file = file
    this.links = {}
    this.ready = this.load()
    this.queue = Promise.resolve()
  }

  /** Load once; later failures read as empty. */
  async load() {
    this.links = await readLinkFile(this.file)
  }

  /**
   * Snapshot for one bootstrap response.
   * @returns {Promise<Record<string, object[]>>} links by session id.
   */
  async list() {
    await this.ready
    return { ...this.links }
  }

  /**
   * Links of one session.
   * @param {string} sessionId - the session.
   * @returns {Promise<object[]>} its links.
   */
  async forSession(sessionId) {
    await this.ready
    return [...(this.links[sessionId] ?? [])]
  }

  /**
   * Attach one session to one chapter. An existing entry for the same chapter
   * is replaced (its mode is updated) instead of duplicated.
   * @param {string} sessionId - the session.
   * @param {{ bookId: string, code: string, mode: string }} input - the placement.
   * @returns {Promise<object[]>} the session's links after the change.
   */
  async add(sessionId, input) {
    if (!SESSION_ID.test(sessionId)) throw new Error('sessionId 不合法')
    const link = sanitizeLink({ ...input, createdAt: Date.now() })
    if (link === null) throw new Error('挂载参数不完整')
    await this.ready
    const existing = this.links[sessionId] ?? []
    const key = `${link.bookId}|${link.code}`
    const next = existing.filter(entry => `${entry.bookId}|${entry.code}` !== key)
    next.push(link)
    this.links = { ...this.links, [sessionId]: next.slice(-MAX_PER_SESSION) }
    this.queue = this.queue.then(() => this.flush()).catch(() => {})
    await this.queue
    return this.forSession(sessionId)
  }

  /**
   * Detach one chapter from one session; other chapters are untouched.
   * @param {string} sessionId - the session.
   * @param {string} bookId - the chapter's book.
   * @param {string} code - the chapter code.
   * @returns {Promise<object[]>} the session's remaining links.
   */
  async remove(sessionId, bookId, code) {
    if (!SESSION_ID.test(sessionId)) throw new Error('sessionId 不合法')
    await this.ready
    const existing = this.links[sessionId]
    if (existing === undefined) return []
    const key = `${bookId}|${code}`
    const next = existing.filter(entry => `${entry.bookId}|${entry.code}` !== key)
    const links = { ...this.links }
    if (next.length === 0) delete links[sessionId]
    else links[sessionId] = next
    this.links = links
    this.queue = this.queue.then(() => this.flush()).catch(() => {})
    await this.queue
    return next
  }

  /**
   * Forget every link of a session that no longer exists.
   * @param {string} sessionId - the session.
   * @returns {Promise<void>} completion.
   */
  async forget(sessionId) {
    if (!SESSION_ID.test(sessionId)) return
    await this.ready
    if (this.links[sessionId] === undefined) return
    const links = { ...this.links }
    delete links[sessionId]
    this.links = links
    this.queue = this.queue.then(() => this.flush()).catch(() => {})
    await this.queue
  }

  /** Persist atomically. */
  async flush() {
    await mkdir(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify({ version: VERSION, links: this.links }, null, 2)}\n`, 'utf8')
    await rename(temporary, this.file)
  }
}
