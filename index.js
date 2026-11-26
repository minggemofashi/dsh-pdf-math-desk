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
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from './src/host/config.js'
import { resolveTypeset } from './src/host/engine.js'
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

/**
 * One error's message, whatever shape the throw took.
 * @param {unknown} error - the thrown value.
 * @returns {string} a readable message.
 */
function messageOf(error) {
  if (error !== null && error !== undefined && typeof error.message === 'string') return error.message
  return String(error)
}

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
   * The models this deployment can route, for the settings page. Read-only: it
   * never selects a model and never writes the default, so opening settings can
   * never change which model a session uses.
   * @returns {Promise<{ providers: Array<object>, default: object | null, failures: Array<object> }>} the catalog.
   */
  async function aiCatalog() {
    const llm = ctx.get('llm')
    const defaultModel = ctx.get('agentDefaultModel')
    const providers = []
    const failures = []
    if (llm !== undefined && llm !== null) {
      let listed = []
      try {
        listed = typeof llm.listProviders === 'function' ? llm.listProviders() : []
      } catch (error) {
        failures.push({ id: '', name: '', message: messageOf(error) })
      }
      for (const provider of listed) {
        const id = String(provider.id)
        const name = String(provider.name === undefined || provider.name === null ? id : provider.name)
        try {
          const rows = await llm.listModels(id)
          providers.push({
            id,
            name,
            models: rows.map(row => ({
              id: String(row.id),
              name: String(row.name === undefined || row.name === null ? row.id : row.name),
              modalities: Array.isArray(row.inputModalities) ? row.inputModalities.map(String) : ['text'],
            })),
          })
        } catch (error) {
          failures.push({ id, name, message: messageOf(error) })
        }
      }
    }
    const selection = defaultModel === undefined || defaultModel === null || typeof defaultModel.currentSelection !== 'function'
      ? null
      : defaultModel.currentSelection()
    return {
      providers,
      default: selection === null || selection === undefined
        ? null
        : { provider: String(selection.provider), model: String(selection.model) },
      failures,
    }
  }

  /**
   * The model selection a stored choice asks for: `follow` reads the deployment
   * default (live), `pinned` uses what the user picked. Read-only either way.
   * @param {{ mode?: string, provider?: string, model?: string } | null | undefined} choice - the client's stored choice.
   * @returns {{ provider: string, model: string } | null} the selection, or null when none is available.
   */
  function resolveChoice(choice) {
    if (choice !== null && choice !== undefined && choice.mode === 'pinned') {
      const provider = String(choice.provider ?? '')
      const model = String(choice.model ?? '')
      return provider === '' || model === '' ? null : { provider, model }
    }
    const defaultModel = ctx.get('agentDefaultModel')
    const selection = defaultModel === undefined || defaultModel === null || typeof defaultModel.currentSelection !== 'function'
      ? null
      : defaultModel.currentSelection()
    return selection === null || selection === undefined
      ? null
      : { provider: String(selection.provider), model: String(selection.model) }
  }

  /**
   * The directory one session should live in: the requested one, the chosen
   * Workspace, or the active library.
   * @param {{ cwd?: string, workspaceId?: string }} request - the client request.
   * @returns {string} an absolute directory.
   */
  function sessionCwd(request) {
    if (typeof request.cwd === 'string' && request.cwd !== '') return request.cwd
    const registry = ctx.get('workspaceRegistry')
    if (typeof request.workspaceId === 'string' && request.workspaceId !== ''
      && registry !== undefined && registry !== null && typeof registry.get === 'function') {
      const workspace = registry.get(request.workspaceId)
      if (workspace !== undefined && workspace !== null && typeof workspace.path === 'string') return workspace.path
    }
    return config.libraryDir
  }

  /**
   * Create one reader session with an explicit model. The model travels as
   * creation options only: this never writes the deployment default, so other
   * conversations keep the model the user chose for them.
   * @param {{ cwd?: string, workspaceId?: string, sessionId?: string, choice?: object }} request - the client request.
   * @returns {Promise<{ sessionId: string, selection: { provider: string, model: string } }>} the created session.
   */
  async function aiSession(request) {
    const agents = ctx.get('agents')
    if (agents === undefined || agents === null || typeof agents.create !== 'function') {
      throw Object.assign(new Error('宿主没有会话服务'), { code: 'no-agents' })
    }
    const choice = request === null || request === undefined ? null : request.choice
    const selection = resolveChoice(choice)
    if (selection === null) throw Object.assign(new Error('没有可用的模型选择'), { code: 'no-selection' })
    const sessionId = typeof request.sessionId === 'string' && request.sessionId !== '' ? request.sessionId : `session-${randomUUID()}`
    await agents.create({ sessionId, meta: { cwd: sessionCwd(request) }, agentOptions: selection })
    return { sessionId, selection }
  }

  /**
   * One-click isolation probe: create a throwaway session with the chosen model
   * and confirm the deployment default did not move. The session is archived and
   * disposed, so it never becomes a visible conversation.
   * @param {{ choice?: object }} request - the client request.
   * @returns {Promise<{ sessionId: string, requested: object, before: object | null, after: object | null, same: boolean | null, note: string }>} the probe result.
   */
  async function aiProbe(request) {
    const agents = ctx.get('agents')
    if (agents === undefined || agents === null || typeof agents.create !== 'function') {
      throw Object.assign(new Error('宿主没有会话服务'), { code: 'no-agents' })
    }
    const requested = resolveChoice(request === null || request === undefined ? null : request.choice)
    if (requested === null) throw Object.assign(new Error('没有可用的模型选择'), { code: 'no-selection' })
    const before = resolveChoice(null)
    const sessionId = `session-${randomUUID()}`
    let handle = null
    try {
      handle = await agents.create({ sessionId, meta: { cwd: config.libraryDir }, agentOptions: requested })
      const after = resolveChoice(null)
      const registry = ctx.get('workspaceRegistry')
      if (registry !== undefined && registry !== null && typeof registry.archiveSession === 'function') {
        try {
          await registry.archiveSession(sessionId, { stopActivity: true })
        } catch {
          // The probe result is still valid without the archive.
        }
      }
      return {
        sessionId,
        requested,
        before,
        after,
        same: before === null || after === null ? null : before.provider === after.provider && before.model === after.model,
        note: '会话在第一次发言前不写请求头，所以这里验证的是“创建成功 + 全局默认未变”。',
      }
    } finally {
      if (handle !== null && handle !== undefined && typeof handle.dispose === 'function') {
        try {
          await handle.dispose()
        } catch {
          // Already gone.
        }
      }
    }
  }

  /**
   * The Host model channel one translation call uses. Read-only towards the
   * deployment default: the model travels as a call argument and is never
   * selected, so translating a chapter cannot change what other conversations
   * use. Page images are stored once per page and referenced by the request,
   * which is the only shape `llm.stream` accepts an image in.
   * @param {{ mode?: string, provider?: string, model?: string } | null | undefined} choice - the client's stored choice.
   * @returns {Promise<{ label: string, provider: string, model: string, image: Function, chat: Function }>} the channel.
   */
  async function aiTranslate(choice) {
    const llm = ctx.get('llm')
    const attachments = ctx.get('attachments')
    if (llm === undefined || llm === null || typeof llm.stream !== 'function'
      || attachments === undefined || attachments === null || typeof attachments.saveImage !== 'function') {
      throw Object.assign(new Error('宿主没有可用的模型或附件服务'), { code: 'no-llm' })
    }
    const selection = resolveChoice(choice)
    if (selection === null) {
      throw Object.assign(new Error('没有可用的翻译模型：请在 设置 → AI 模型 为「整章翻译」选一个模型'), { code: 'no-model' })
    }
    const label = `${selection.provider} / ${selection.model}`
    // OpenCode requires an `x-opencode-session` header for every request and DSH
    // fills it from `sessionId`; a background translation is not an Agent Session,
    // so it carries one stable per-run routing key instead. Without it the
    // provider answers 400 MissingSessionID.
    const routingId = `session-pdfdesk-${randomUUID()}`
    let info = null
    try {
      info = await llm.resolveModelInfo(selection.provider, selection.model)
    } catch (error) {
      throw Object.assign(new Error(`翻译模型 ${label} 不可用：${messageOf(error)}`), { code: 'model-missing' })
    }
    const modalities = info !== null && info !== undefined && Array.isArray(info.inputModalities)
      ? info.inputModalities.map(String)
      : ['text']
    if (!modalities.includes('image')) {
      throw Object.assign(new Error(`翻译模型 ${label} 不能读图，请在 设置 → AI 模型 换一个支持图片的模型`), { code: 'model-cannot-read-image' })
    }
    return {
      label,
      provider: selection.provider,
      model: selection.model,
      /**
       * Store one page image so a request can reference it.
       * @param {Uint8Array | Buffer} bytes - PNG/JPEG/WebP bytes.
       * @param {string} [mediaType] - declared type, default PNG.
       * @returns {Promise<object>} the durable image reference.
       */
      async image(bytes, mediaType) {
        const data = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes)
        try {
          return await attachments.saveImage({
            data,
            mediaType: typeof mediaType === 'string' && mediaType !== '' ? mediaType : 'image/png',
            name: 'pdfdesk-page',
          })
        } catch (error) {
          throw new Error(`页图保存失败（${label}）：${messageOf(error)}`)
        }
      },
      /**
       * One model call carrying one page image and one prompt.
       * @param {{ prompt: string, image: object, signal?: AbortSignal, onUsage?: Function }} request - the call.
       * @returns {Promise<string>} the concatenated text blocks.
       */
      async chat(request) {
        const messages = [{
          role: 'user',
          content: [
            { type: 'text', text: String(request.prompt) },
            { type: 'image', attachment: request.image },
          ],
        }]
        let text = ''
        let usage = null
        try {
          for await (const chunk of llm.stream({
            provider: selection.provider,
            model: selection.model,
            messages,
            temperature: 0.2,
            signal: request.signal,
            sessionId: routingId,
          })) {
            if (chunk === null || chunk === undefined || typeof chunk !== 'object') continue
            if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
              text += chunk.text
              continue
            }
            if (chunk.type === 'usage' && chunk.usage !== null && chunk.usage !== undefined && typeof chunk.usage === 'object') {
              usage = chunk.usage
              continue
            }
            if (chunk.type !== 'finish') continue
            const reason = chunk.reason === null || chunk.reason === undefined ? {} : chunk.reason
            const kind = String(reason.kind ?? '')
            if (kind === 'error' || kind === 'aborted') {
              const failure = reason.failure === null || reason.failure === undefined ? {} : reason.failure
              throw new Error(String(failure.message ?? '模型调用中断'))
            }
          }
        } catch (error) {
          throw Object.assign(new Error(`翻译调用失败（${label}）：${messageOf(error)}`), { code: 'llm-failed' })
        }
        if (usage !== null && typeof request.onUsage === 'function') {
          const input = Number(usage.inputTokens) || 0
          const output = Number(usage.outputTokens) || 0
          request.onUsage({ input, output, total: Number(usage.totalTokens) || input + output })
        }
        return text
      },
    }
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

  const typeset = resolveTypeset(config.toolsDir)
  const handler = createHandler(config, {
    // Every route sits behind DSH's own Host/Origin and browser-login fence.
    // A website open in the user's browser cannot call the workbench API, even
    // on loopback; without this the routes rely on the socket address alone.
    requestRejection: request => {
      if (connection === undefined || connection === null || typeof connection.requestRejection !== 'function') return undefined
      return connection.requestRejection(request)
    },
    md2texScript: typeset.readingScript,
    overlayScript: typeset.overlayScript,
    overlayName: typeset.overlayName,
    typstEnv: typeset.env,
    // Engine provenance for the settings row and the on-demand installer.
    typeset: {
      engine: typeset.engine,
      typst: typeset.typst,
      version: typeset.typstVersion,
      source: typeset.typstSource,
    },
    // Session services the base-session route drives (stage 7.6).
    sessionServices: () => ({
      agents: ctx.get('agents'),
      query: ctx.get('sessionQuery'),
      workspace: ctx.get('workspaceRegistry'),
    }),
    pending,
    links,
    libraries,
    shelves,
    contextPressure,
    aiCatalog,
    aiSession,
    aiProbe,
    aiTranslate,
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
