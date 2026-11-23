/**
 * Host half of dsh-pdf-workbench.
 *
 * Owns the catalog (index file or file-name derivation), the persisted
 * workbench position, the pending-intent registry for created-but-unused
 * sessions, and the Workspace registered for the library directory — sessions
 * created from the workbench must live in that Workspace so the right-side
 * document preview can authorize their files.
 *
 * A workbench session is named only when its first turn starts: until then it
 * is an ordinary untitled blank that no other surface can mistake for a
 * classified session. The browser half never renames on creation for that
 * reason.
 *
 * @module dsh-pdf-workbench
 */
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from './src/host/config.js'
import { collectTranscript, saveDigest, summarize } from './src/host/digest.js'
import { LibrariesStore } from './src/host/libraries.js'
import { LinksStore } from './src/host/links.js'
import { PendingStore } from './src/host/pending.js'
import { PressureStore } from './src/host/pressure.js'
import { ShelfGroups } from './src/host/shelf-groups.js'
import { PREFIX, createHandler } from './src/host/routes.js'
import { installToolkit } from './src/host/toolkit.js'
import { purgeArchivedBlanks } from './src/host/purge.js'

/** Cordis plugin name. */
export const name = 'pdfdesk'

/** The browser carrier and the trust fence guarding its routes. */
export const inject = ['webServer', 'connection']

/**
 * Mount the `/pdfdesk/*` routes and name pending sessions on their first turn.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {unknown} [rawConfig] - the Loader row's `config`.
 * @returns {void}
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const connection = ctx.get('connection')
  const pending = new PendingStore(config.pendingPath)
  const links = new LinksStore(config.linksPath)
  const pressure = new PressureStore(config.pressurePath)
  const shelves = new ShelfGroups(config.shelvesPath)
  const libraries = new LibrariesStore(config.librariesPath, {
    libraryDir: config.libraryDir,
    fragmentDir: config.fragmentDir,
    artifactDir: config.artifactDir,
    coverDir: config.coverDir,
    indexPath: config.indexPath,
    name: basename(config.libraryDir),
  })

  /**
   * Read one session's context pressure, live when it is running and from the
   * last recorded snapshot when it is not.
   * @param {string} sessionId - the session.
   * @returns {Promise<{ tokens: number, window: number, ratio: number, source: 'live' | 'stored' } | null>} the pressure.
   */
  async function contextPressure(sessionId) {
    const meter = ctx.get('tokenMeter')
    if (meter !== undefined) {
      const sessions = ctx.get('sessions')
      const session = sessions === undefined ? undefined : sessions.get(sessionId)
      if (session !== undefined) {
        try {
          const reading = meter.contextPressure(session)
          const tokens = Number(reading?.pressureTokens)
          const window = Number(reading?.contextWindow)
          if (Number.isFinite(tokens) && tokens >= 0 && Number.isFinite(window) && window > 0) {
            void pressure.put(sessionId, { tokens, window }).catch(() => {})
            return { tokens, window, ratio: tokens / window, source: 'live' }
          }
        } catch {
          // Fall through to the stored snapshot.
        }
      }
    }
    const stored = await pressure.get(sessionId)
    return stored === null ? null : { tokens: stored.tokens, window: stored.window, ratio: stored.tokens / stored.window, source: 'stored' }
  }

  /**
   * Summarize one chapter's conversations into an outline file.
   * @param {{ book: object, chapter: object, sessionIds: string[], mode: string }} request - what to digest.
   * @returns {Promise<{ text: string, path: string, sessions: number, dropped: number }>} the outline.
   */
  async function digestChapter(request) {
    const query = ctx.get('sessionQuery')
    const model = ctx.get('agentDefaultModel')
    const llm = ctx.get('llm')
    if (query === undefined || model === undefined || llm === undefined) {
      throw new Error('模型或会话服务不可用')
    }
    const selection = model.currentSelection()
    if (selection === null || selection === undefined || typeof selection.provider !== 'string' || typeof selection.model !== 'string') {
      throw new Error('没有可用的默认模型')
    }
    const collected = await collectTranscript(request.sessionIds, id => query.readSession(id))
    if (collected.text.trim() === '') throw new Error('这些会话还没有可总结的内容')
    const text = await summarize(selection, options => llm.stream(options), {
      bookTitle: request.book.title,
      code: request.chapter.code,
      chapterTitle: request.chapter.title,
      mode: request.mode === 'all' ? '' : request.mode,
      transcript: collected.text,
    })
    if (text === '') throw new Error('模型没有返回内容')
    const library = await libraries.active()
    const path = await saveDigest(library, request.book.id, request.chapter.code, request.mode, text)
    return { text, path, sessions: collected.used.length, dropped: collected.dropped }
  }

  const handler = createHandler(config, {
    // Every route sits behind DSH's own Host/Origin and browser-login fence.
    // A website open in the user's browser cannot call the workbench API, even
    // on loopback; without this the routes rely on the socket address alone.
    requestRejection: request => {
      if (connection === undefined || connection === null || typeof connection.requestRejection !== 'function') return undefined
      return connection.requestRejection(request)
    },
    md2texScript: join(dirname(fileURLToPath(import.meta.url)), 'tools', 'md2tex.py'),
    pending,
    links,
    libraries,
    shelves,
    contextPressure,
    digest: digestChapter,
    installToolkit: libraryDir => installToolkit(config.toolsDir, libraryDir),
    /**
     * The Workspaces a user can choose for conversations. The browser never
     * creates one silently; it shows these and a create action.
     * @returns {Promise<Array<{ id: string, title: string, path: string }>>} the list.
     */
    async listWorkspaces() {
      const registry = ctx.get('workspaceRegistry')
      if (registry === undefined) return []
      try {
        return registry.list().map(workspace => ({
          id: String(workspace.id),
          title: typeof workspace.title === 'string' ? workspace.title : '',
          path: typeof workspace.path === 'string' ? workspace.path : '',
        }))
      } catch {
        return []
      }
    },
    /**
     * Resolve the Workspace that owns the library directory, so the browser
     * creates sessions inside it instead of into an ungrouped cwd.
     * @returns {Promise<{ workspaceId: string | null, cwd: string }>} the create target.
     */
    async resolveTarget() {
      const registry = ctx.get('workspaceRegistry')
      const library = await libraries.active()
      const libraryDir = library === null ? config.libraryDir : library.libraryDir
      if (registry === undefined) return { workspaceId: null, cwd: libraryDir }
      try {
        const workspace = await registry.resolveByPath(libraryDir)
        if (workspace === undefined || workspace === null) return { workspaceId: null, cwd: libraryDir }
        return {
          workspaceId: String(workspace.id),
          cwd: typeof workspace.path === 'string' && workspace.path !== '' ? workspace.path : libraryDir,
        }
      } catch {
        return { workspaceId: null, cwd: libraryDir }
      }
    },
    /**
     * Remove the empty session records the workbench itself left behind.
     * @returns {Promise<{ purged: number }>} how many were removed.
     */
    async purge() {
      return await purgeArchivedBlanks(ctx, config, pending, links, pressure)
    },
  })

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: PREFIX, handler }), 'pdfdesk: routes')

  // The first turn names a created session; every finished turn records how full
  // its context is, so "New" can decide between continuing and starting over.
  ctx.effect(() => ctx.on('session/event', (session, event) => {
    if (event === null || typeof event !== 'object') return
    if (event.type === 'turn/end') {
      const meter = ctx.get('tokenMeter')
      if (meter === undefined) return
      try {
        const reading = meter.contextPressure(session)
        const tokens = Number(reading?.pressureTokens)
        const window = Number(reading?.contextWindow)
        if (Number.isFinite(tokens) && tokens >= 0 && Number.isFinite(window) && window > 0) {
          void pressure.put(session.id, { tokens, window }).catch(() => {})
        }
      } catch {
        // A session without a measurable request simply has no snapshot yet.
      }
      return
    }
    if (event.type !== 'turn/start') return
    const titles = ctx.get('sessionTitle')
    if (titles === undefined) return
    void pending.get(session.id).then(async entry => {
      if (entry === null) return
      try {
        titles.rename(session, entry.title)
      } catch (error) {
        // Keep the intent: the workbench renames it on its next visit.
        ctx.logger?.warn?.('pdfdesk: failed to name session %s: %s', session.id, String(error))
        return
      }
      await pending.remove(session.id)
    }).catch(() => {})
  }), 'pdfdesk: pending naming and context pressure')
}
