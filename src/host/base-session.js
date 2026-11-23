/**
 * Orchestration for the chapter's shared-prefix sessions: prepare one hidden
 * base session that reads the chapter text once, then fork one independent
 * branch per conversation mode.
 *
 * A branch is created the way DSH requires: read the base session's raw log up
 * to the recorded turn boundary and hand that prefix to `ctx.agents.create`
 * with `meta.isSeeded` — only agent-loop-published sessions persist and get a
 * driver. The services are injected so the policy is unit-tested.
 * @module dsh-pdf-workbench/base-session
 */

import { chapterTextPath } from './chapter-text.js'
import {
  SESSION_MODES,
  branchSessionId,
  chapterSessionsStale,
  readChapterSessions,
  staleChapterSessions,
  withBaseSession,
  withBranchSession,
  writeChapterSessions,
} from './chapter-sessions.js'

/** What the base session is told to do; it must not answer anything yet. */
export const BASE_READY_PROMPT = '通读本章全文，只回复 READY，不要回答问题，不要输出摘要。'

/**
 * The seq a branch may fork at: the end boundary of the last completed turn.
 * The running version returns `{ openTurnStartSeq, lastStepStartSeq,
 * lastStepBoundary: { kind: 'end', seq }, lastTurn }`; an open turn has no end
 * boundary and must not be forked mid-turn.
 * @param {object} boundary - the value of `ctx.agents.turnBoundaryOf(session)`.
 * @returns {number} the inclusive event seq, or 0 when the turn is still open.
 */
export function boundarySeq(boundary) {
  if (boundary === null || typeof boundary !== 'object') return 0
  if (boundary.openTurnStartSeq !== null && boundary.openTurnStartSeq !== undefined) return 0
  const last = boundary.lastStepBoundary
  if (last === null || last === undefined || last.kind !== 'end') return 0
  return Number.isFinite(last.seq) && last.seq > 0 ? last.seq : 0
}

/**
 * The prompt for the hidden base session: read the extracted file, nothing else.
 * @param {{ textPath: string, bookTitle?: string, chapterTitle?: string }} input - the chapter and its text file.
 * @returns {string} the prompt.
 */
export function baseReadPrompt(input) {
  const title = [input.bookTitle, input.chapterTitle].filter(part => typeof part === 'string' && part !== '').join(' · ')
  const head = title === '' ? '请' : `请先读《${title}》的章节全文文件：${input.textPath}。`
  return `${head}\n${BASE_READY_PROMPT}`
}

/**
 * Prepare (or reuse) the hidden base session of one chapter.
 * @param {{
 *   agents: object, workspace?: object, libraryDir: string, book: string, code: string,
 *   cwd: string, pdf: { size: number, mtimeMs: number }, textPath: string,
 *   createMessage: (text: string) => object, newId: () => string,
 *   archive?: (id: string) => Promise<void>, bookTitle?: string, chapterTitle?: string,
 * }} options - the services and the chapter identity.
 * @returns {Promise<{ manifest: object, created: boolean, sessionId: string }>} the map and the base id.
 */
export async function ensureBaseSession(options) {
  const { agents, libraryDir, book, code, pdf } = options
  const existing = await readChapterSessions(libraryDir, book, code)
  if (existing !== null && !chapterSessionsStale(existing, pdf)) {
    return { manifest: existing, created: false, sessionId: existing.base.id }
  }
  if (existing !== null) await staleChapterSessions(libraryDir, book, code)
  const id = options.newId()
  const handle = await agents.create({ sessionId: id, meta: { cwd: options.cwd } })
  const agent = handle !== null && handle !== undefined && handle.agent !== undefined ? handle.agent : handle
  const prompt = baseReadPrompt({ textPath: options.textPath ?? chapterTextPath(libraryDir, book, code), bookTitle: options.bookTitle, chapterTitle: options.chapterTitle })
  agent.followup(options.createMessage(prompt))
  await agent.whenIdle()
  const boundary = agents.turnBoundaryOf(agent.session ?? agent)
  const atSeq = options.atSeqOf(boundary)
  if (!Number.isFinite(atSeq) || atSeq < 1) throw Object.assign(new Error('基础会话没有可用的轮次边界'), { code: 'no-boundary' })
  const manifest = withBaseSession(null, { id, atSeq }, pdf)
  await writeChapterSessions(libraryDir, book, code, manifest)
  const archive = typeof options.archive === 'function'
    ? options.archive
    : options.workspace !== undefined && typeof options.workspace.archiveSession === 'function'
      ? (sessionId) => options.workspace.archiveSession(sessionId, { stopActivity: true })
      : null
  if (archive !== null) await archive(id)
  // The agent is idle and archived; disposing it leaves the persisted log
  // readable for forks. The base is never handed to the UI.
  if (handle !== null && handle !== undefined && typeof handle.dispose === 'function') await handle.dispose()
  return { manifest, created: true, sessionId: id }
}

/**
 * The session one mode should talk in: its existing branch, or a fresh seeded
 * fork of the base at the recorded boundary.
 * @param {{ agents: object, sessionQuery: object, libraryDir: string, book: string, code: string,
 *   cwd: string, manifest: object, mode: string, newId: () => string }} options - the services and the chapter map.
 * @returns {Promise<{ manifest: object, sessionId: string, created: boolean }>} the selected branch.
 */
export async function ensureBranchSession(options) {
  const { agents, sessionQuery, libraryDir, book, code, manifest, mode } = options
  if (!SESSION_MODES.includes(mode)) throw Object.assign(new Error(`未知模式：${mode}`), { code: 'bad-mode' })
  if (manifest === null || typeof manifest !== 'object' || typeof manifest.base !== 'object' || manifest.base === null) {
    throw Object.assign(new Error('本章还没有基础会话'), { code: 'no-base' })
  }
  const existing = branchSessionId(manifest, mode)
  if (existing !== '') return { manifest, sessionId: existing, created: false }
  const snapshot = await sessionQuery.readSession(manifest.base.id)
  const prefix = Array.isArray(snapshot.events) ? snapshot.events.filter(event => Number(event.seq) <= manifest.base.atSeq) : []
  if (prefix.length === 0) throw Object.assign(new Error('基础会话日志为空'), { code: 'no-seed' })
  const sessionId = options.newId()
  await agents.create({
    sessionId,
    seed: prefix,
    inheritedEventCount: prefix.length,
    meta: { cwd: options.cwd, isSeeded: true },
  })
  const next = withBranchSession(manifest, mode, sessionId)
  await writeChapterSessions(libraryDir, book, code, next)
  return { manifest: next, sessionId, created: true }
}

/**
 * The modes a branch can be asked for.
 * @returns {string[]} the mode names.
 */
export function branchModes() {
  return [...SESSION_MODES]
}
