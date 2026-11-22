/**
 * The workbench's own durable UI state.
 *
 * Only the position in the workbench lives here — which shelf/book is open and
 * which chapters are expanded per book. The Host owns it because the browser
 * has no storage service and a layout reset must not lose the place. Writes are
 * debounced by the caller; this module is tolerant of a damaged file.
 *
 * @module dsh-pdf-workbench/state
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** State format version; bump when the fields change shape. */
const STATE_VERSION = 4

/** Expanded chapter codes kept per book at most. */
const MAX_EXPANDED = 60

/** Books remembered in the map at most. */
const MAX_BOOKS = 400

/** A safe chapter code: `c` plus digits, or a plain short token. */
const SAFE_CODE = /^[\w-]{1,16}$/

/** Reading modes the reader offers. */
const MODES = new Set(['single', 'continuous'])

/**
 * Keep the reader's last position if it is usable.
 * @param {unknown} value - stored reader state.
 * @returns {{ bookId: string, code: string, name: string, page: number, mode: string, scale: number | null } | null} the reading position.
 */
function sanitizeReader(value) {
  if (value === null || typeof value !== 'object') return null
  const bookId = typeof value.bookId === 'string' && value.bookId !== '' && value.bookId.length <= 200 ? value.bookId : ''
  const code = typeof value.code === 'string' && SAFE_CODE.test(value.code) ? value.code : ''
  if (bookId === '' || code === '') return null
  const name = typeof value.name === 'string' && value.name.length <= 200 ? value.name : ''
  const page = typeof value.page === 'number' && Number.isFinite(value.page)
    ? Math.max(1, Math.min(100000, Math.round(value.page)))
    : 1
  const mode = MODES.has(value.mode) ? value.mode : 'single'
  const scale = typeof value.scale === 'number' && Number.isFinite(value.scale)
    ? Math.max(0.3, Math.min(4, Math.round(value.scale * 100) / 100))
    : null
  return { bookId, code, name, page, mode, scale }
}

/**
 * The position a fresh profile starts at.
 * @returns {{ version: number, view: 'shelf', bookId: null, activeChapter: null, expandedByBook: Record<string, string[]>, reader: null, updatedAt: number }} the default state.
 */
export function defaultState() {
  return {
    version: STATE_VERSION,
    view: 'shelf',
    bookId: null,
    activeChapter: null,
    expandedByBook: {},
    reader: null,
    updatedAt: 0,
  }
}

/**
 * Keep only the fields that make sense, so a hand-edited file cannot break the page.
 * @param {unknown} value - parsed JSON.
 * @returns {ReturnType<typeof defaultState>} a usable state.
 */
export function sanitizeState(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  const view = source.view === 'book' ? 'book' : source.view === 'libraries' ? 'libraries' : 'shelf'
  const bookId = typeof source.bookId === 'string' && source.bookId !== '' && source.bookId.length <= 200
    ? source.bookId
    : null
  const activeChapter = typeof source.activeChapter === 'string' && SAFE_CODE.test(source.activeChapter)
    ? source.activeChapter
    : null
  const expandedByBook = {}
  const rawMap = source.expandedByBook !== null && typeof source.expandedByBook === 'object' ? source.expandedByBook : {}
  for (const [key, codes] of Object.entries(rawMap)) {
    if (typeof key !== 'string' || key === '' || key.length > 200) continue
    if (!Array.isArray(codes)) continue
    const list = codes.filter(code => typeof code === 'string' && SAFE_CODE.test(code)).slice(0, MAX_EXPANDED)
    if (list.length > 0) expandedByBook[key] = list
    if (Object.keys(expandedByBook).length >= MAX_BOOKS) break
  }
  const updatedAt = typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt) ? source.updatedAt : 0
  return {
    version: STATE_VERSION,
    view,
    bookId: view === 'book' ? bookId : null,
    activeChapter: view === 'book' ? activeChapter : null,
    expandedByBook,
    reader: view === 'book' ? sanitizeReader(source.reader) : null,
    updatedAt,
  }
}

/**
 * Read the stored state, falling back to the default on any failure.
 * @param {string} statePath - absolute path of `state.json`.
 * @returns {Promise<ReturnType<typeof defaultState>>} the stored or default state.
 */
export async function readState(statePath) {
  try {
    const text = await readFile(statePath, 'utf8')
    return sanitizeState(JSON.parse(text))
  } catch {
    return defaultState()
  }
}

/**
 * Persist one state atomically.
 * @param {string} statePath - absolute path of `state.json`.
 * @param {unknown} value - the state to store; sanitized before writing.
 * @returns {Promise<ReturnType<typeof defaultState>>} the stored state.
 */
export async function writeState(statePath, value) {
  const state = sanitizeState({ ...(value !== null && typeof value === 'object' ? value : {}), updatedAt: Date.now() })
  await mkdir(dirname(statePath), { recursive: true })
  const temporary = `${statePath}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(temporary, statePath)
  return state
}
