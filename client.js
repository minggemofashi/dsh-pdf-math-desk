/**
 * Browser half of dsh-pdf-workbench: the full-page workbench.
 *
 * Registered in two places under the same id: `sidebar.panellist` (the icon the
 * sidebar resolves to the `main` key) and `main` (the page itself). The page is
 * a controlled view over the Host catalog plus the Host-stored position, so it
 * survives switching away and back.
 *
 * No Harness Client package is imported; React comes from the module table,
 * every colour comes from a `--dsw-*` token, and layout adapts to the panel's
 * own width (container query), not the window's.
 */
window.__ModuleLoader__.load({
  id: 'dsh-pdf-workbench',
  factory(require) {
    'use strict'

    const React = require('react')
    const h = React.createElement
    const useState = React.useState
    const useEffect = React.useEffect
    const useCallback = React.useCallback
    const useMemo = React.useMemo
    const useRef = React.useRef
    const useLayoutEffect = typeof React.useLayoutEffect === 'function' ? React.useLayoutEffect : React.useEffect

    // Official host primitives are build-time source in DSH. The build script
    // compiles the subset we use into one CJS file; load it with this instance's
    // require so React and React DOM are the host's copies, never a duplicate.
    let hostUi = null
    let hostUiPromise = null
    const hostUiWaiters = new Set()

    function hostComponent(name) {
      if (hostUi === null) return null
      const value = hostUi[name]
      if (typeof value === 'function') return value
      if (value !== null && value !== undefined && typeof value === 'object' && value.$$typeof) return value
      return null
    }

    function notifyHostUi() {
      for (const waiter of hostUiWaiters) {
        try { waiter() } catch { /* a stale component */ }
      }
    }

    async function loadHostUi() {
      if (hostUi !== null) return hostUi
      if (hostUiPromise !== null) return await hostUiPromise
      hostUiPromise = (async () => {
        try {
          const [codeResponse, cssResponse] = await Promise.all([
            window.fetch('/pdfdesk/vendor/host-ui.cjs', { credentials: 'same-origin' }),
            window.fetch('/pdfdesk/vendor/host-ui.css', { credentials: 'same-origin' }),
          ])
          if (!codeResponse.ok) return null
          const code = await codeResponse.text()
          const module = { exports: {} }
          // esbuild emitted a CJS bundle. React and React DOM stay external and
          // resolve through the host module table.
          const execute = new Function('require', 'module', 'exports', 'process', code)
          execute(require, module, module.exports, { env: {} })
          if (cssResponse.ok) {
            const css = await cssResponse.text()
            if (css !== '') {
              const style = document.createElement('style')
              style.id = 'pdfdesk-host-ui'
              style.textContent = css
              document.head.appendChild(style)
            }
          }
          hostUi = module.exports
          notifyHostUi()
          return hostUi
        } catch {
          hostUi = null
          return null
        }
      })()
      return await hostUiPromise
    }

    /**
     * Subscribe a component to the host-primitives load.
     * @returns {object | null} the loaded primitives, or null while falling back.
     */
    function useHostUi() {
      const [, setTick] = React.useState(0)
      React.useEffect(() => {
        let alive = true
        const bump = () => {
          if (alive) setTick(value => value + 1)
        }
        hostUiWaiters.add(bump)
        void loadHostUi().then(bump)
        return () => {
          alive = false
          hostUiWaiters.delete(bump)
        }
      }, [])
      return hostUi
    }

    const PANEL_ID = 'pdfdesk'
    const NS = 'pdfDesk'
    const ENDPOINT = 'pdfdesk/'
    const REQUEST_TIMEOUT_MS = 12000
    const SAVE_DELAY_MS = 180
    const NOTICE_MS = 5000

    /** Session modes, in the order the chapter shows them. */
    const MODES = ['extract', 'qa', 'exercise']
    /** A no-op callback that keeps a stable identity across renders. */
    const noop = () => {}
    /** The always-available, purpose-free session type. */
    const GENERAL_MODE = 'general'
    const ALL_MODES = [GENERAL_MODE, ...MODES]
    /** Types shown in the session panel; general is always present. */
    const SESSION_TYPES = Object.freeze([
      { id: GENERAL_MODE, workflow: '' },
      { id: 'extract', workflow: 'math' },
      { id: 'qa', workflow: 'math' },
      { id: 'exercise', workflow: 'math' },
    ])

    /**
     * Session types available for one workflow.
     * @param {string} workflow - active workflow id, or '' for general.
     * @returns {string[]} type ids.
     */
    function sessionModesFor(workflow) {
      return SESSION_TYPES.filter(item => item.workflow === '' || item.workflow === workflow).map(item => item.id)
    }

    /** The mode word written into a session title (data, not UI copy). */
    const TITLE_MODE = { general: '会话', extract: '提取', qa: '答疑', exercise: '习题' }
    const GITHUB_URL = 'https://github.com/minggemofashi/dsh-pdf-workbench'
    /** The optional handwriting face is installed on demand, not shipped. */
    const XIAOLAI_STYLE_ID = 'pdfdesk-xiaolai-face'
    let xiaolaiInstalled = false

    /**
     * Reflect the Host's font state in the document: inject the @font-face only
     * when the file exists, so the browser never requests a missing 22 MB asset.
     * @param {boolean} installed - whether the Host has the font.
     * @returns {void}
     */
    function applyXiaolaiFace(installed) {
      xiaolaiInstalled = installed
      if (typeof document === 'undefined') return
      const style = document.getElementById(XIAOLAI_STYLE_ID)
      if (!installed) {
        if (style !== null) style.remove()
        return
      }
      if (style !== null) return
      const node = document.createElement('style')
      node.id = XIAOLAI_STYLE_ID
      node.textContent = "@font-face { font-family: 'Xiaolai'; src: url('/pdfdesk/font/file') format(\"truetype\"); font-weight: 400; font-style: normal; font-display: swap; }"
      document.head.appendChild(node)
    }

    /**
     * Ask the Host whether the handwriting font is installed and apply it.
     * @returns {Promise<boolean>} installed state.
     */
    async function refreshXiaolaiFont() {
      try {
        const payload = await request('GET', 'font')
        const installed = payload !== null && payload !== undefined && payload.installed === true
        applyXiaolaiFace(installed)
        return installed
      } catch {
        applyXiaolaiFace(false)
        return false
      }
    }
    const TEXLIVE_URL = 'https://tug.org/texlive/acquire.html'
    const PYTHON_URL = 'https://www.python.org/downloads/windows/'

    /** Optional workflows; general is the always-on base and has no entry here. */
    const WORKFLOWS = Object.freeze([
      { id: 'math', labelKey: 'workflowMath', descKey: 'workflowMathDesc' },
    ])
    const WORKFLOW_STORAGE = 'pdfdesk:workflow'
    const WORKFLOW_EVENT = 'pdfdesk:workflow'
    const WORKSPACE_STORAGE = 'pdfdesk:workspace:'
    const SPLIT_SESSION_STORAGE = 'pdfdesk:split-session:'

    /** Split-tool conversations this page visit has created or reopened. */
    const splitSessionIds = new Set()

    /**
     * Every split-tool conversation this browser remembers, for any library.
     * A split conversation carries the split preset in its composer until the
     * user sends it, so it stays "blank" and a chapter New could otherwise adopt
     * it; the preset would then look like the new chapter's prompt. No chapter
     * session may reuse one, so every library's pointer counts.
     * @returns {Set<string>} the known split session ids.
     */
    function storedSplitSessionIds() {
      try {
        const storage = window.localStorage
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index)
          if (typeof key !== 'string' || !key.startsWith(SPLIT_SESSION_STORAGE)) continue
          const raw = storage.getItem(key)
          if (raw === null || raw === '') continue
          const parsed = JSON.parse(raw)
          if (parsed === null || typeof parsed !== 'object') continue
          if (typeof parsed.sessionId === 'string' && parsed.sessionId !== '') splitSessionIds.add(parsed.sessionId)
        }
      } catch {
        // storage unavailable: keep the ids this visit already saw
      }
      return splitSessionIds
    }

    /**
     * The split-tool conversation remembered for one library.
     * @param {string} libraryId - library id.
     * @returns {{ sessionId: string, workspaceId: string } | null} the stored pointer.
     */
    function readStoredSplitSession(libraryId) {
      if (typeof libraryId !== 'string' || libraryId === '') return null
      try {
        const raw = window.localStorage.getItem(`${SPLIT_SESSION_STORAGE}${libraryId}`)
        if (raw === null || raw === '') return null
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return null
        if (typeof parsed.sessionId !== 'string' || parsed.sessionId === '') return null
        return {
          sessionId: parsed.sessionId,
          workspaceId: typeof parsed.workspaceId === 'string' ? parsed.workspaceId : '',
        }
      } catch {
        return null
      }
    }

    /**
     * Remember the split-tool conversation of one library.
     * @param {string} libraryId - library id.
     * @param {string} sessionId - the conversation.
     * @param {string} workspaceId - its workspace.
     * @returns {void}
     */
    function writeStoredSplitSession(libraryId, sessionId, workspaceId) {
      if (typeof libraryId !== 'string' || libraryId === '' || typeof sessionId !== 'string' || sessionId === '') return
      // Remember it even when storage is unavailable: this visit must not reuse it.
      splitSessionIds.add(sessionId)
      try {
        window.localStorage.setItem(`${SPLIT_SESSION_STORAGE}${libraryId}`, JSON.stringify({ sessionId, workspaceId }))
      } catch {
        // storage unavailable
      }
    }

    /**
     * The workspace the user explicitly chose for one library, if any.
     * @param {string} libraryId - library id.
     * @returns {{ workspaceId: string, cwd: string } | null} the stored target.
     */
    function readStoredWorkspace(libraryId) {
      if (typeof libraryId !== 'string' || libraryId === '') return null
      try {
        const raw = window.localStorage.getItem(`${WORKSPACE_STORAGE}${libraryId}`)
        if (raw === null || raw === '') return null
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return null
        if (typeof parsed.workspaceId !== 'string' || parsed.workspaceId === '') return null
        return { workspaceId: parsed.workspaceId, cwd: typeof parsed.cwd === 'string' ? parsed.cwd : '' }
      } catch {
        return null
      }
    }

    /**
     * Remember an explicit workspace choice across reloads.
     * @param {string} libraryId - library id.
     * @param {{ workspaceId: string, cwd: string }} target - chosen workspace.
     * @returns {void}
     */
    function writeStoredWorkspace(libraryId, target) {
      if (typeof libraryId !== 'string' || libraryId === '') return
      try {
        window.localStorage.setItem(`${WORKSPACE_STORAGE}${libraryId}`, JSON.stringify(target))
      } catch {
        // storage unavailable
      }
    }

    /**
     * Forget a workspace choice (library removed or workspace gone).
     * @param {string} libraryId - library id.
     * @returns {void}
     */
    function clearStoredWorkspace(libraryId) {
      if (typeof libraryId !== 'string' || libraryId === '') return
      try {
        window.localStorage.removeItem(`${WORKSPACE_STORAGE}${libraryId}`)
      } catch {
        // storage unavailable
      }
    }

    /**
     * The one optional workflow that is enabled, or '' for general mode.
     * @returns {string} a workflow id or ''.
     */
    function readWorkflowMode() {
      try {
        const value = window.localStorage.getItem(WORKFLOW_STORAGE)
        return WORKFLOWS.some(item => item.id === value) ? value : ''
      } catch {
        return ''
      }
    }

    /**
     * Persist one workflow id and notify the other mounted halves.
     * @param {string} value - workflow id, or '' for general.
     * @returns {void}
     */
    function writeWorkflowMode(value) {
      const next = WORKFLOWS.some(item => item.id === value) ? value : ''
      try {
        if (next === '') window.localStorage.removeItem(WORKFLOW_STORAGE)
        else window.localStorage.setItem(WORKFLOW_STORAGE, next)
      } catch {
        // storage unavailable: keep the in-memory switch
      }
      if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event(WORKFLOW_EVENT))
    }

    /**
     * Follow the active workflow across the page and the side preview.
     * @returns {string} the active workflow id, or '' for general.
     */
    function useWorkflowMode() {
      const [value, setValue] = React.useState(readWorkflowMode)
      React.useEffect(() => {
        const sync = () => setValue(readWorkflowMode())
        if (typeof window.addEventListener !== 'function') return undefined
        window.addEventListener(WORKFLOW_EVENT, sync)
        window.addEventListener('storage', sync)
        return () => {
          window.removeEventListener(WORKFLOW_EVENT, sync)
          window.removeEventListener('storage', sync)
        }
      }, [])
      return value
    }

    /**
     * The page stored for one chapter, when the reader ever wrote one.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {number | null} a positive page number, or null when unknown.
     */
    function readStoredPage(bookId, code) {
      try {
        const raw = window.localStorage.getItem(`pdfdesk:page:${bookId}:${code}`)
        if (raw === null || raw === '') return null
        const value = Number.parseInt(raw, 10)
        return Number.isFinite(value) && value > 0 ? value : null
      } catch {
        return null
      }
    }

    /**
     * Last page read for one chapter, so leaving the reader does not reset it.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {number} a positive page number, or 1.
     */
    function readReaderPage(bookId, code) {
      return readStoredPage(bookId, code) ?? 1
    }

    /** Per-book page width memory (the zoom the reader last settled on). */
    const WIDTH_PREFIX = 'pdfdesk:width:'
    /** Global reading mode, shared by every book (`single` | `continuous`). */
    const MODE_KEY = 'pdfdesk:mode'

    /**
     * The page width one book was last read at. `scale: null` means "fit the
     * width", which must be remembered as fit rather than as the fitted number:
     * a later window size should still fit the page.
     * @param {string} bookId - book id.
     * @returns {{ scale: number | null } | null} the stored width, or null when never set.
     */
    function readBookScale(bookId) {
      if (typeof bookId !== 'string' || bookId === '') return null
      try {
        const raw = window.localStorage.getItem(`${WIDTH_PREFIX}${bookId}`)
        if (raw === null || raw === '') return null
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return null
        if (parsed.scale === null) return { scale: null }
        const scale = Number(parsed.scale)
        if (!Number.isFinite(scale) || scale <= 0) return null
        return { scale }
      } catch {
        return null
      }
    }

    /**
     * Remember one book's page width.
     * @param {string} bookId - book id.
     * @param {number | null} scale - the zoom, or null for "fit the width".
     * @returns {void}
     */
    function writeBookScale(bookId, scale) {
      if (typeof bookId !== 'string' || bookId === '') return
      try {
        window.localStorage.setItem(`${WIDTH_PREFIX}${bookId}`, JSON.stringify({ scale: scale === null ? null : scale }))
      } catch {
        // storage unavailable
      }
    }

    /**
     * The reading mode shared by every book.
     * @returns {'single' | 'continuous' | null} the stored mode, or null when never set.
     */
    function readGlobalMode() {
      try {
        const raw = window.localStorage.getItem(MODE_KEY)
        // "canvas" was a third mode for one release. The shared annotation layer
        // replaced it, so an old stored value reads as the single page it looks
        // like, without touching the notes themselves.
        if (raw === 'single' || raw === 'continuous') return raw
        if (raw === 'canvas') return 'single'
        return null
      } catch {
        return null
      }
    }

    /**
     * Remember the reading mode for every book.
     * @param {string} mode - `single` or `continuous`.
     * @returns {void}
     */
    function writeGlobalMode(mode) {
      if (mode !== 'single' && mode !== 'continuous') return
      try {
        window.localStorage.setItem(MODE_KEY, mode)
      } catch {
        // storage unavailable
      }
    }

    /* ------------------------------------------------------------ questions -- */

    /** Whether creating a question appends its line to the open conversation. */
    const QUESTION_INJECT_KEY = 'pdfdesk:question-inject'

    /** Size below which a question drag is a click, not a mark (in page pixels). */
    const QUESTION_MIN_W = 24
    const QUESTION_MIN_H = 16

    /**
     * Whether a created question should be announced to the open conversation.
     * Missing preference means on: the setting is the opt-out.
     * @returns {boolean} the preference.
     */
    function questionInjectEnabled() {
      try {
        return window.localStorage.getItem(QUESTION_INJECT_KEY) !== '0'
      } catch {
        return true
      }
    }

    /**
     * Remember the injection preference.
     * @param {boolean} on - the choice.
     * @returns {void}
     */
    function writeQuestionInject(on) {
      try {
        window.localStorage.setItem(QUESTION_INJECT_KEY, on ? '1' : '0')
      } catch {
        // storage unavailable
      }
    }

    /**
     * A fresh question id. The Host only checks the shape; uniqueness keeps two
     * marks made in the same millisecond apart.
     * @returns {string} the id.
     */
    function createQuestionId() {
      return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    }

    /**
     * The rect between two page points, clamped into the page.
     * @param {[number, number]} from - drag start, page fractions.
     * @param {[number, number]} to - drag end, page fractions.
     * @returns {{ x: number, y: number, w: number, h: number }} the rect.
     */
    function questionRect(from, to) {
      const clamp = value => Math.min(1, Math.max(0, Number(value) || 0))
      const x0 = clamp(from[0])
      const y0 = clamp(from[1])
      const x1 = clamp(to[0])
      const y1 = clamp(to[1])
      return {
        x: Math.min(x0, x1),
        y: Math.min(y0, y1),
        w: Math.abs(x1 - x0),
        h: Math.abs(y1 - y0),
      }
    }

    /**
     * Order question marks by their number (then by creation), so the list and
     * the jump menu read like the chapter does.
     * @param {object[]} list - the marks.
     * @returns {object[]} a sorted copy.
     */
    function sortQuestions(list) {
      const numberOf = question => {
        const match = /疑问\s*(\d+)/.exec(String(question === null || question === undefined ? '' : question.name ?? ''))
        return match === null ? Number.MAX_SAFE_INTEGER : Number(match[1])
      }
      return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
        const diff = numberOf(a) - numberOf(b)
        return diff !== 0 ? diff : (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0)
      })
    }

    /**
     * Read one chapter's question marks.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {Promise<{ next: number, questions: object[] }>} the marks and the next default number.
     */
    async function loadChapterQuestions(bookId, code) {
      const payload = await request('GET', `questions?book=${encodeURIComponent(bookId)}&code=${encodeURIComponent(code)}`)
      const next = Number(payload !== null && payload !== undefined ? payload.next : NaN)
      return {
        next: Number.isFinite(next) && next > 0 ? Math.round(next) : 1,
        questions: sortQuestions(payload !== null && payload !== undefined && Array.isArray(payload.questions) ? payload.questions : []),
      }
    }

    /**
     * Replace one chapter's question marks.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {{ next: number, questions: object[] }} payload - the list to keep.
     * @returns {Promise<{ next: number, questions: object[] }>} what the Host stored.
     */
    async function saveChapterQuestions(bookId, code, payload) {
      const result = await request('PUT', 'questions', { book: bookId, code, next: payload.next, questions: payload.questions })
      const next = Number(result !== null && result !== undefined ? result.next : NaN)
      return {
        next: Number.isFinite(next) && next > 0 ? Math.round(next) : payload.next,
        questions: sortQuestions(result !== null && result !== undefined && Array.isArray(result.questions) ? result.questions : payload.questions),
      }
    }

    /**
     * The session the main area currently shows, if any. The workspace keeps the
     * main session retained while a global panel (this workbench) is in front,
     * so this is the conversation a question line would be appended to.
     * @returns {string} the session id, or '' when no conversation is open.
     */
    function currentMainSessionId() {
      const sessions = sessionService()
      if (sessions === null || sessions.list === undefined || typeof sessions.list.getSnapshot !== 'function') return ''
      const list = sessions.list.getSnapshot()
      if (list === null || list === undefined || list.phase !== 'ready' || list.byId === undefined) return ''
      for (const [id, row] of Object.entries(list.byId)) {
        const retained = row !== null && typeof row === 'object' ? row.retainedBy : null
        if (retained !== null && typeof retained === 'object' && Number(retained.mainView) > 0) return String(id)
      }
      return ''
    }

    /** Questions already announced, so one mark is never injected twice. */
    const injectedQuestions = new Set()

    /**
     * Append `看到疑问：<name>` to the conversation that is open, if any. This
     * writes the composer only: no session is created, opened or sent.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {{ id: string, name: string }} question - the created mark.
     * @returns {Promise<boolean>} whether the line was written.
     */
    async function injectQuestionLine(bookId, code, question) {
      if (!questionInjectEnabled()) return false
      const sessionId = currentMainSessionId()
      if (sessionId === '') return false
      const key = `${sessionId}|${bookId}|${code}|${question.id}`
      if (injectedQuestions.has(key)) return false
      injectedQuestions.add(key)
      const prefill = await beginPrefill(sessionId, `看到疑问：${question.name}`, 'append')
      if (prefill.reference !== null) {
        try { prefill.reference.release() } catch { /* already released */ }
      }
      return prefill.applied
    }

    /**
     * In-memory page drafts: unsaved note edits and unfinished strokes, one per
     * page. They never enter the annotation store, never reach the disk and are
     * never exported; leaving the page stashes them, returning restores them.
     * @returns {{ stash: Function, take: Function, peek: Function, clear: Function, size: number }} the store.
     */
    function createPageDraftStore() {
      const drafts = new Map()
      const pageKey = page => {
        const value = Math.round(Number(page))
        return Number.isFinite(value) && value >= 1 ? String(value) : ''
      }
      return {
        stash(page, draft) {
          const key = pageKey(page)
          if (key !== '' && draft !== null && draft !== undefined) drafts.set(key, draft)
        },
        take(page) {
          const key = pageKey(page)
          const value = key === '' ? undefined : drafts.get(key)
          if (key !== '') drafts.delete(key)
          return value
        },
        peek(page) {
          const key = pageKey(page)
          return key === '' ? undefined : drafts.get(key)
        },
        clear() {
          drafts.clear()
        },
        get size() {
          return drafts.size
        },
      }
    }

    /**
     * Remember the last page read for one chapter.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {number} page - 1-based page number.
     * @returns {void}
     */
    function saveReaderPage(bookId, code, page) {
      try {
        window.localStorage.setItem(`pdfdesk:page:${bookId}:${code}`, String(page))
      } catch {
        // storage unavailable
      }
    }

    /** A workbench session title: `[<book> cNN] <mode>`, half- or full-width brackets. */
    const SESSION_TITLE = /^[\[【](.+?)[\s\u3000]+(c\d{2,3})[\]】][\s\u3000]*(.+?)[\s\u3000]*$/i

    /** Mode word (Chinese canonical, English alias) → mode key; tolerant of a suffix such as `答疑（续）`. */
    const MODE_OF = [
      ['会话', 'general'],
      ['提取', 'extract'],
      ['答疑', 'qa'],
      ['习题', 'exercise'],
      ['general', 'general'],
      ['extract', 'extract'],
      ['qa', 'qa'],
      ['exercise', 'exercise'],
    ]

    /**
     * Map a title's mode text to a mode key.
     * @param {string} text - the text after the code.
     * @returns {string | null} the mode key, or null when it names no known mode.
     */
    function modeOf(text) {
      const value = String(text).trim().toLowerCase()
      for (const [word, mode] of MODE_OF) {
        if (value.startsWith(word)) return mode
      }
      return null
    }

    /* ---------------------------------------------------------------- copy -- */

    const zh = {
      title: 'PDF 阅读 · 随时问答',
      subtitle: '{books} 本书 · {chapters} 章',
      shelf: '书架',
      libraries: '书库',
      librariesTitle: '书库',
      librariesHint: '单击切换书库，双击进入书架。库根里按「分片 / 整本」放 PDF 即可。',
      heroEyebrow: 'PDF 阅读 · 随时问答',
      heroTitle: '欢迎使用阅读器',
      heroLead: '按章阅读、随手标注、随时提问。书库与阅读进度都在本地，打开就能接着读。',
      heroMeta: '{n} 个书库 · 数据在本地',
      heroEmpty: '还没有书库？导入一个包含「分片」或「整本」的目录即可开始。',
      homeTools: '工具箱',
      homeToolsHint: '左右滑动，全部工具都在这里',
      addPathPlaceholder: '书库根目录，例如 D:\\数学书库',
      addNamePlaceholder: '名称（可选）',
      libraryActive: '当前',
      libraryUse: '切换',
      libraryRemove: '移除',
      libraryRemoveConfirm: '再点一次移除',
      libraryAddTitle: '添加书库',
      libraryAddHint: '选库根目录：里面要有 分片\\ 或 整本\\（可以都有）',
      libraryName: '名称',
      libraryPath: '目录',
      libraryPick: '选择目录…',
      libraryAdd: '添加书库',
      libraryBusy: '处理中…',
      libraryFailed: '书库操作失败，检查目录权限后重试',
      libraryBooks: '{n} 本',
      modeMath: '数学',
      manualTitle: '书库说明书',
      manualSummary: '结构 · 命名 · 环境 · 来源',
      manualLead: '书库就是一个文件夹。把 PDF 按章放好，工作台负责书架、会话、标注和导出。',
      manualStep1: '添加书库：选择一个包含「分片」或「整本」的目录。',
      manualStep2: '放书：一章一个 PDF 放进 分片\\<书名>\\；整本 PDF 放进 整本\\。',
      manualStep3: '开始读：双击书卡，展开章节，打开 PDF 或新建会话。',
      manualTree: '{root}/\n  分片/\n    <书名>/\n      c01 第一章.pdf\n      c02 第二章.pdf\n  整本/\n    <整本书>.pdf\n  产物/<书名>/<章>/\n  索引.json（可选）',
      manualNaming1: '书 id 就是目录名；添加后不要改，旧会话和产物靠它关联。',
      manualNaming2: '一章一个 PDF，保留目录；文件名带页码范围或 cNN 即可，工作台自动编号。',
      manualNaming3: '不想拆：整本 PDF 放进 整本\\，会作为只有一章的一本书。',
      manualSessionLine: '会话按「书 / 章 / 模式」归档，已有会话也可以导入。',
      manualEnvLead: 'Markdown 转 PDF 需要 Python 3 + TeX（xelatex、ctex）；翻译还需要 DeepSeek API Key。没装时对应按钮会给出说明和下载入口，阅读、会话和预览不受影响。',
      aiPromptTitle: '给 AI 的拆分提示词',
      manualStructureTitle: '书库结构',
      manualNamingTitle: '拆分与命名',
      manualEnvTitle: '导出环境',
      manualSourceTitle: '目录来源',
      manualSourceHint: '书库列表在 ~/.dsh/pdfdesk/libraries.json；标注镜像在 <库根>\\.pdfdesk\\annotations\\。',
      manualWhy: '「分片」= 把书**按章节**切成小 PDF：一章一个文件，每个会话只读一章，上下文小、定位也清楚。**先由你手动按章节拆**（每章从哪页到哪页看目录），工具负责按规则重命名与校验；不要整本拆（整本拆=整本 OCR，贵且容易撑爆上下文）。**目录必须有**（放进 c00，它是定位各章的索引）。任何 PDF 都可以这样读；注解、框选翻译与导出都在阅读器里完成，不会改动原文件。',
      manualStructure: '放法：{root}\\分片\\<书 id>\\ 下，一章一个 PDF，保留目录。文件名带页码范围（如 概率论_积分和数学期望_97-138.pdf）即可，工作台会按页序自动编号；也可以写成 <书 id>_cNN_章名_p起-止.pdf。产物\\ 与 封面\\ 可选。',
      manualIdNote: '书 id 就是书目名/分片名前缀，添加书库后不要再改名：会话标题与产物目录都按它关联，改名会让旧会话和产物对不上（书名可以改显示，目录名请保持稳定）。',
      manualSplit: '拆分：任意 PDF 工具按章节切开、保留目录，放进 分片\\<书 id>\\ 即可；不需要自己编号，页码范围会自动排序（目录/前言归 c00，附录 c90+）。',
      manualSession: '拆分会话：点下面的按钮，工具会复制到当前书库的 工具\\，并新开一个会话，提示词里已经写好当前书库的路径、目标目录和命名规则。',
      aiPromptHint: '发给 AI，让它直接产出可用的 Markdown：',
      aiPromptText: '给我一份报告，用 markdown 格式，数学公式行内用 $ 格式，行间用 $$ 格式，不要出现 \\[ 和 \\( 格式',
      aiPromptCopy: '复制提示词',
      aiPromptCopied: '提示词已复制',
      splitStart: '拆分工具：开一个会话',
      splitHint: '把工具复制到 工具\\，并新建一个带预设提示词的会话',
      splitReopened: '已打开这个书库的拆分会话',
      splitWorkspace: '工作区',
      workspaceNotChosen: '未选择工作区',
      workspaceChoose: '选择工作区',
      workspaceChange: '更改',
      importStart: '导入文件',
      importBusy: '导入中…',
      importFilesHint: '导入 md/txt/pdf：md/txt 渲染成 PDF 放进 整本\\，PDF 直接放进去',
      importFilesDone: '已导入 {n} 个文件到 库根\\整本\\',
      splitPrompt: '你是数学书库整理助手。**拆分由用户手动作，按章节拆**（一章一个 PDF，页范围看目录）；你的工作是按命名规则重命名、校验、整理目录，不要整本 OCR/拆分。\n书库根目录：{dir}\n目标目录：{dir}\\分片\\<书 id>\\（书 id 是这本书的简写，例如 概率论）\n工具：{dir}\\工具\\ 下的 rename_chapters.py（批量改名）、pdfkit.py（split/verify/render）、auto_chapters.py；规则：{dir}\\工具\\README.md 与 {dir}\\工具\\规范\\。\n要点：目录页必须在 c00；一章一个 PDF，命名 <书 id>_cNN_第X章_章名_p起-止.pdf；缺目录就先请用户补，不要自己猜。\n流程：确认书 id 与已有分片 → 改名/校验 → 报告结果和缺的章。',
      splitFailed: '拆分工具没启动：确认库目录可写后重试',
      librariesTitleHint: '双击标题回到书库',
      back: '返回',
      refresh: '刷新',
      refreshing: '刷新中…',
      retry: '重试',
      crumbsLabel: '位置',
      chapters: '{n} 章',
      chaptersMore: '再显示 {n} 章',
      pages: '{range} 页',
      untitled: '{code}（未命名）',
      pdfLabel: 'PDF',
      openPdf: '打开 PDF',
      readerLoading: '正在载入 PDF…',
      readerFailed: 'PDF 打不开',
      readerRetry: '重新载入',
      readerPrev: '上一页',
      readerNext: '下一页',
      readerFirst: '首页',
      readerFirstHint: '第一页',
      readerPage: '页码',
      readerZoomIn: '放大',
      readerZoomOut: '缩小',
      readerFit: '适应宽度',
      readerFitScreen: '适应屏幕',
      readerBack: '返回章节',
      readerBackHint: '回到本章目录（阅读进度会保留）',
      readerPageHint: '输入页码后回车跳转',
      readerModeSingleHint: '单页：一页一屏，可在页外空白处平移画布',
      readerModeContinuousHint: '连续：纵向滚动整章，上下留白可书写',
      readerShelf: '书架',
      readerShelfHint: '回到书架',
      readerOf: '/ {n}',
      readerMode: '阅读模式',
      readerModeSingle: '单页',
      readerModeContinuous: '连续',
      canvasCenter: '居中',
      canvasCenterHint: '回到当前页居中',
      annotHand: '手（平移）',
      handPanelHint: '拖动页面平移，页外笔记也能看到；也可按住空格临时切手；「居中」回到当前页',
      planeExpand: '扩展画布',
      planeLeft: '向左扩一页',
      planeRight: '向右扩一页',
      planeUp: '向上扩一页',
      planeDown: '向下扩一页',
      planeBoundsHint: '虚线是画布边界',
      sideTabTitle: '{book} · {code}',
      sideOpenInDesk: '在工作台打开',
      sideOpenInDeskHint: '回到阅读器，停在同一页',
      sideForeign: '这个地址不属于PDF阅读，无法预览',
      sideHint: '翻页、模式与文件版本跟阅读器同步',
      sideMenuMore: '更多操作',
      sideMenuHint: '右键或点 ⋯ 打开菜单',
      sideMenuGoto: '跳页…',
      sideGotoPrompt: '跳到第几页',
      sideGotoHint: '点页码直接输入',
      sideMenuZoom: '缩放',
      sideMenuAutoFit: '自动适应栏宽',
      sideAutoFitOn: '自动适应栏宽',
      sideMenuFollowReader: '跟随阅读器缩放',
      sideMenuReload: '重新加载文件',
      sideMenuClose: '关闭预览',
      sideMenuTools: '工具',
      sideMenuClearAnnots: '清除本页标注',
      sideMenuClearMasks: '清空本页框选',
      sideMenuSessions: '跳到会话',
      sideHideToolbar: '隐藏工具条',
      sideShowToolbar: '显示工具条',
      sideMenuPaging: '翻页',
      sideMenuPreview: '预览',
      blocksToggle: '块',
      blocksHint: '显示文本块边框（调试用）',
      dualToggle: '双语',
      dualHint: '原文与译文并排（需先翻译）',
      dualNeedsTranslation: '还没有译文。现在翻译本章？会消耗 token，并需要先在设置里填 DeepSeek API Key。',
      dualOriginal: '原文',
      dualTranslated: '译文',
      dualPage: '第 {n} 页',
      toolsToggle: '收起/展开工具条',
      overlayToggle: '叠加',
      overlayHint: '拖框露出译文；拖圆点移动、拖角改大小、右键删除（需先翻译）',
      undo: '撤销',
      redo: '重做',
      undoHint: '撤销上一步标注或框选',
      redoHint: '重做刚撤销的一步',
      maskBoxHint: '拖顶部圆点移动 · 拖角改大小 · 右键删除',
      overlayBlocks: '框住本页块',
      overlayBlocksHint: '按文本块自动画框；再点一次取消（需先翻译）',
      overlayBlocksCancel: '取消框住',
      overlayBlocksCancelHint: '去掉「框住本页块」画出的框',
      overlayBlocksEmpty: '这一页没有可框的文本块',
      overlayBlocksFailed: '框住本页块失败',
      annotPen: '笔',
      annotErase: '擦',
      annotClear: '清空标注',
      annotTools: '标注工具',
      toolSettings: '工具设置',
      toolPanelSelectHint: '点中页面上的元素后，属性和操作显示在这里。',
      toolPanelMaskHint: '在页面上拖出要显示译文的区域；已有框可以直接拖动或缩放。',
      annotSelect: '选择',
      shapeLine: '直线',
      shapeArrow: '箭头',
      shapeRect: '矩形',
      shapeDiamond: '菱形',
      shapeEllipse: '椭圆',
      selectionTitle: '已选中',
      selectionPanelDragHint: '拖动标题移动面板；点面板外关闭',
      selectionPanelRightClickHint: '右键文本框打开调整面板；双击编辑文字',
      fillTitle: '填充',
      fillNone: '无',
      fillStyleTitle: '填充样式',
      fillHachure: '斜线',
      fillSolid: '实心',
      strokeStyleTitle: '线型',
      styleSolid: '实线',
      styleDashed: '虚线',
      styleDotted: '点线',
      opacityTitle: '不透明度',
      alignTitle: '对齐',
      alignLeft: '左',
      alignCenter: '中',
      alignRight: '右',
      duplicateSelection: '复制',
      bringFront: '置顶',
      sendBack: '置底',
      selectionDelete: '删除选中',
      annotHint: '手写批注；再点一次退出。按页保存，缩放不跑位',
      annotEraseHint: '点或划过笔画即可删除',
      annotClearHint: '清空本页手写标注',
      annotText: '文本框',
      annotTextHint: '点页面写字；Enter 保存，Shift+Enter 换行',
      annotTextPrompt: '批注内容',
      annotTextPlaceholder: '写下批注…',
      annotTextEditorHint: 'Enter 保存 · Shift+Enter 换行 · Esc 取消',
      annotTextEditHint: '双击编辑；清空内容再保存即删除',
      annotTextActiveHint: '文本框：点页面任意位置写字，Enter 保存，Esc 取消',
      annotDualHint: '两栏各自独立：原文栏记在本页公共笔记上，译文栏自己保存一份；两栏可以停在不同页',
      annotColorHint: '标注颜色',
      annotWidthHint: '笔画粗细',
      annotColor: '文字颜色',
      annotFontSize: '字号',
      annotFontFamily: '字体',
      annotTextStyle: '字形',
      annotBold: '粗体',
      annotItalic: '斜体',
      'annotFont.hand': '手写',
      'annotFont.normal': '正常',
      'annotFont.mono': '等宽',
      'annotFont.song': '宋体',
      'annotFont.hei': '黑体',
      exportPage: '导出本页',
      exportHint: '导出本页：原文 + 框内译文 + 标注，存到本章产物',
      exporting: '正在导出本页…',
      exportDone: '已导出',
      exportFailed: '导出失败',
      exportChapter: '导出整章',
      exportChapterHint: '导出整章：每页原文 + 框内译文 + 标注，并另存 sidecar JSON',
      exportingChapter: '正在导出整章…',
      exportAnnotatedPages: '带标注/遮罩 {n} 页',
      exportGroup: '导出…',
      exportGroupHint: '导出本页/整章，或导入标注',
      importAnnots: '导入标注',
      importAnnotsHint: '从 `<章代码>_export.annots.json` 恢复遮罩与标注（覆盖对应页）',
      importingAnnots: '正在导入标注…',
      importAnnotsDone: '已导入 {n} 页的遮罩与标注',
      importAnnotsFailed: '导入标注失败',
      retryAction: '重试',
      exportCancel: '取消导出',
      exportCancelled: '已取消导出',
      overlayMissing: '叠加层还没准备好：先翻译本章，再打开叠加',
      overlayFallback: '叠加层 PDF 不可用：框内是整页译文的对应区域，位置可能对不齐',
      overlayEmpty: '这一页的叠加层没有文字，框内无译文；重新翻译本章可重建',
      overlayReflow: '叠加层是整页重排，字号和位置对不上原文；可以按段落重建，或重新翻译本章按块对齐',
      overlayRealign: '按段落重建',
      overlayRealignHint: '用缓存的整页译文按段落重排，不调用模型；近似对齐，个别段落会偏小',
      overlayRealignWorking: '正在按段落重建叠加层…',
      overlayRealignDone: '叠加层已按段落重建（近似对齐；要按块精确对齐需重新翻译本章）',
      overlayRealignFailed: '按段落重建失败',
      overlayLoading: '正在准备叠加层…',
      overlayTwoColumns: '这一页疑似双栏：叠加位置可能不准，逐段对照建议用「双语」',
      translateAction: '翻译本页',
      translateChapterAction: '翻译本章',
      translateCancel: '取消翻译',
      translateResume: '补译缺失页',
      translateResumeHint: '只译还没有缓存的页，按缺失页数花 token',
      translateNeedsEnv: '翻译需要 Python + TeX，并先在 设置 → 环境 配置 DeepSeek API Key。',
      exportNeedsPython: '导出需要 Python；请先安装，并在 设置 → 环境 查看状态。',
      generalSession: '会话',
      generalSessionHint: '新建一个只带书籍地址的通用会话，不预设用途',
      generalSeedBook: '书籍',
      generalSeedLibrary: '书库',
      generalSeedBookDir: '书目录',
      generalSeedPdf: '当前 PDF',
      translatingResume: '正在补译缺失页…',
      translateCancelled: '翻译已取消',
      translateOverwriteConfirm: '这一章已经有译文，重新翻译会覆盖它。继续吗？',
      translateCostConfirm: '翻译会调用 DeepSeek 视觉模型并按页计费：整章通常消耗数万到数十万 token，费用由你的 API 账户承担。对齐模式还会略高（约 1.3 倍）。继续吗？',
      translating: '翻译中…',
      translateDone: '已生成',
      translateDonePartial: '翻译完成，但有 {n} 页没有返回译文（第 {pages} 页），已用 {tokens} tokens；可以点「补译缺失页」只补这几页',
      translateBlocksFallback: '第 {pages} 页没按块翻译，叠加层只能整页重排、对不齐；可以在叠加里按段落重建，或重新翻译本章按块对齐',
      translateTokens: '共 {n} tokens',
      translateFailed: '翻译失败',
      translateHint: '把本章翻成另一种语言（需要 DeepSeek API Key）',
      translateFor: '翻译为：',
      langZh: '中文',
      langEn: 'English',
      translateToEn: '译为英文',
      translateToZh: '译为中文',
      translatedLabel: '译文',
      translatedDelete: '删除译文',
      translatedDeleteConfirm: '删除这份译文？原 PDF 不会被改动，译文会移动到 回收站\\译文\\，可恢复。',
      readerNewLabel: '从这一章开始：',
      readerNewHint: '接着本章该分组的会话；快满时另起续会话；右侧同时开 PDF',
      readerInSessionFailed: '会话建好了，但右侧 PDF 没打开（可能不在库工作区）',
      sessionsTitle: '会话',
      sessionsNoModes: '通用模式没有预设会话类型；用工具栏「会话」开始一个只带书籍地址的会话。',
      newSession: '新建',
      newSessionOf: '新建{mode}会话',
      newSessionHint: '优先接着本章该分组的会话，快满时另起续会话',
      forceNew: '另起',
      forceNewOf: '另起一个新的{mode}会话（不续接）',
      forceNewHint: '跳过续接，直接开新的续会话',
      digest: '整理提纲',
      digestOf: '把本章会话整理成提纲',
      digestWorking: '正在整理…（一次模型调用）',
      digestFailed: '整理提纲失败',
      digestDone: '提纲已保存到本章产物',
      digestTitle: '本章提纲',
      digestCopy: '复制',
      digestCopied: '已复制提纲',
      digestEmpty: '这一章还没有可总结的会话',
      digestHint: '用当前模型总结本章会话，结果存到 产物/<书>/<章>/提纲-all.md',
      sessionWithOutline: '本章提纲已放进新会话的输入框，可直接改或发送',
      sessionWithContext: '已把本章与 PDF 信息放进新会话的输入框',
      creating: '正在新建…',
      sessionsCount: '{n} 个会话',
      sessionLoading: '正在读取会话…',
      sessionUnresolved: '{n} 个会话标题没对上书或章',
      sessionUnavailable: '会话服务不可用',
      sessionCreated: '已新建：{title}',
      sessionQuestionLead: '下面是我的问题：',
      sessionResumed: '接着「{mode}」会话（上下文 {pct}%）',
      sessionContinued: '上下文已用 {pct}%，已另起续会话',
      sessionCreateFailed: '新建会话失败，检查工作区设置后重试',
      sessionRenameFailed: '会话已建，但标题没写成约定格式',
      pendingHint: '发出第一条消息后才写入标题；没发送的不保留',
      importSessions: '导入',
      importOf: '导入已有会话到{mode}组',
      importHint: '把一个已有会话挂到本章，不改它的标题',
      importTitle: '导入已有会话',
      importChapter: '挂到 {code} · {title}',
      importSearch: '搜索标题…',
      importEmpty: '没有可导入的会话',
      importAlready: '已在本章',
      importForeign: '不在库工作区',
      importTruncated: '只显示前 {n} 个',
      importDone: '已挂到本章：{title}',
      importFailed: '挂载失败',
      linkedHint: '挂载到本章',
      unlink: '取消挂载',
      unlinkDone: '已从本章移除（对话没动）',
      rename: '重命名',
      renameSave: '保存',
      renameCancel: '取消',
      renameEmpty: '标题不能为空',
      renameHint: '标题按 `[书 cNN] 模式` 归类；改掉前缀会从本章移出',
      renameDone: '已重命名',
      renameFailed: '重命名失败',
      cleanup: '清理空会话',
      updateCheck: '检查更新',
      previewPdf: '右侧预览',
      previewOn: '开',
      previewOff: '关',
      previewPdfHint: '新建会话时在右栏显示本章 PDF（预览，不进上下文）',
      deleteNonPdf: '非PDF删除',
      deleteNonPdfHint: '开启后 md/txt 等产物也能删除；关闭时只删 PDF',
      socraticToggle: '答疑苏格拉底人格',
      socraticHint: '新建或打开答疑会话时，把本地 qa-persona.md 放进输入框（其他模式不注入）',
      personaFailed: '答疑人格读取失败（检查 ~/.dsh/pdfdesk/qa-persona.md 或重启 DSH）',
      settings: '设置',
      version: '版本',
      githubRepo: 'GitHub 仓库',
      feedbackIssue: '反馈问题',
      feedbackHint: '打开 GitHub 新建 issue，自动带入插件版本与系统信息；不会上传文件或本机路径',
      feedbackTitle: '问题：',
      feedbackBodyVersion: '插件版本',
      feedbackBodyEnv: '环境（系统 / 浏览器）',
      feedbackBodyDesc: '问题描述',
      feedbackBodySteps: '复现步骤',
      feedbackBodyNote: '请勿粘贴本机路径、密钥或日志；需要时脱敏后附加。',
      aiPromptTitle: 'AI 生成 Markdown',
      libraryPathsTitle: '书库路径与书 id',
      libraryPathHint: '这里统一显示为 {root}；绝对路径只在本机有效',
      readLocalPath: '读取本机路径',
      hideLocalPath: '隐藏本机路径',
      tipsLeftClick: '左键：书卡单击选中/取消，双击打开；章节名单击展开/收起。',
      tipsRightClick: '右键：产物可转 PDF/删除，会话可归档；书卡与章节没有右键菜单。',
      tipsTitle: '使用提示',
      splitToolTitle: '拆分工具',
      importToolTitle: '导入文件',
      toolbarTitle: '工具栏',
      diagnosticsTitle: '目录来源与路径',
      envTitle: '排版环境',
      envOn: '已就绪',
      envOff: '未安装（点击下载）',
      envPython: 'Python 3',
      envPythonSize: '约 25 MB',
      envTex: 'TeX Live（xelatex + ctex）',
      envTexSize: '约 5 GB',
      settingsFeatures: '特殊功能',
      toolRail: '工具条位置',
      railLeft: '左',
      railRight: '右',
      sketchRoughness: '手绘强度',
      settingsTabReading: '阅读',
      settingsTabWorkflow: '模式',
      settingsTabKeys: '快捷键',
      settingsTabEnv: '环境',
      settingsTabAbout: '关于',
      settingsNotesTitle: '笔记与备份',
      sharedPrefixClear: '清除章节共享前缀',
      sharedPrefixClearHint: '删除各章提取文本、基础会话与模式分支映射（.pdfdesk/cache）；PDF、笔记和已有会话不受影响',
      sharedPrefixClearAction: '清除',
      sharedPrefixCleared: '已清除 {n} 个章节的共享前缀',
      sharedPrefixFailed: '清除共享前缀失败',
      attachLabel: '附件',
      fontTitle: '手写字体（小赖）',
      fontMissing: '未下载，手写体暂时使用系统楷体',
      fontInstalled: '已下载（{mb} MB）',
      fontDownloaded: '字体已下载并启用（{mb} MB）',
      fontImported: '字体已导入并启用',
      fontRemovedNote: '字体已删除，手写体回退到系统楷体',
      fontRedownload: '重新下载',
      fontDownloadConfirm: '下载小赖字体约 22 MB（来自上游 OFL 发布），继续？',
      fontDownload: '下载',
      fontImport: '导入本地字体',
      fontRemove: '删除',
      fontHint: '22 MB 的 Xiaolai 字体不再随插件分发；下载或导入后只存放在本机插件数据目录，删除不影响笔记',
      fontFailed: '字体操作失败',
      settingsTabData: '数据',
      dataTitle: '整机数据迁移',
      dataHint: '打包会话、工作区登记、插件状态与书库内 .pdfdesk（笔记/疑问/缓存/附件）；书籍 PDF 与密钥永不打包',
      dataBackup: '打包数据',
      dataBackupCreated: '已生成 {name}（{files} 个文件，{mb} MB）',
      dataDownload: '下载迁移包',
      dataFonts: '包含手写字体（约 22 MB）',
      dataProjcache: '包含会话投影缓存（可重建，体积大）',
      dataSettings: '包含浏览器设置（阅读宽度/快捷键等，导出为 settings.json）',
      dataImportTitle: '导入迁移包',
      dataImportHint: '填写本机 ZIP 路径；合并策略不会覆盖已有文件，冲突项会改名为 *.imported-时间',
      dataPath: 'ZIP 路径',
      dataInspect: '检查',
      dataImport: '开始导入',
      dataStrategy: '冲突处理',
      dataMerge: '合并（不覆盖）',
      dataOverwrite: '覆盖（先备份）',
      dataSkip: '跳过已存在',
      dataReport: '导入完成：导入 {imported}，改名 {renamed}，跳过 {skipped}，重写书库 {rewritten}',
      dataRootHint: '书库 {id} 的新根目录',
      dataFailed: '迁移操作失败',
      dataWorking: '正在处理…',
      dataApplySettings: '应用导入的浏览器设置',
      dataApplied: '已应用 {n} 项设置；刷新页面后生效',
      dataNoSettings: '没有导入的浏览器设置',
      dataBookTitle: '导入书籍包',
      dataBookHint: '选择本机 PDF 压缩包；解压到书库的分片/整本目录，同名按上面的冲突策略处理',
      dataBookTarget: '目标',
      dataBookFragments: '分片',
      dataBookWhole: '整本',
      dataBookSubdir: '子目录（可选）',
      dataBookSubdirPh: '例如：新书',
      dataBookImport: '导入书籍包',
      dataOverwriteConfirm: '覆盖策略会替换同名文件（Host 会先做 pre-import 快照），继续？',
      bookOverwriteConfirm: '覆盖策略会替换目标目录里的同名 PDF，继续？',
      dataBookReport: '书籍包：导入 {imported}，改名 {renamed}，跳过 {skipped}，提醒 {warnings}',
      attachAdd: '添加',
      attachEmpty: '暂无附件',
      attachHint: '支持 PDF、图片与 PPT（自动转 PDF），单个不超过 50 MB；会复制到本章的附件目录',
      attachDelete: '删除附件',
      attachDeleteConfirm: '删除这个附件？',
      attachUploaded: '已添加附件',
      attachTooLarge: '附件超过 50 MB',
      attachFailed: '附件操作失败',
      settingsNotesHint: '标注与框选会自动镜像到 <库根>\\.pdfdesk\\annotations\\；清浏览器数据或换机器后，打开该章自动恢复',
      lastPageLabel: '上次阅读',
      lastPageAt: '读到第 {n} 页',
      lastPageHint: '上次阅读停在这一页',
      lastPageResume: '继续阅读',
      shortcutsTitle: '快捷键',
      shortcutsHint: '默认是阅读器一直用的键；点「录制」按新键替换，Esc 取消',
      shortcutsRecord: '录制',
      shortcutsRecording: '请按键…',
      shortcutsCancel: '取消',
      shortcutsClear: '清除',
      shortcutsRestore: '恢复默认',
      shortcutsClearAll: '全部清空',
      shortcutsUnbound: '未绑定',
      shortcutsListening: '正在给「{action}」录制按键…（Esc 取消）',
      shortcutScrollUp: '向上滚动',
      shortcutScrollDown: '向下滚动',
      shortcutClose: '关闭阅读器',
      apiKeyTitle: 'DeepSeek API Key（翻译用）',
      apiKeyConfigured: '已配置',
      apiKeyMissing: '未配置',
      apiKeySave: '保存',
      envReady: '已就绪：md→PDF、翻译和导出可用',
      envMissing: '缺少 Python / TeX：md→PDF、翻译、导出会受限',
      envImpact: '缺少 Python：md→PDF、翻译、导出不可用；缺少 TeX：md→PDF、翻译译文合成不可用；翻译还需要 API Key。',
      envPromptTitle: '需要环境',
      envNeedPython: 'Python 3',
      envNeedTex: 'TeX Live（xelatex、ctex）',
      envNeedKey: 'DeepSeek API Key',
      envUseRender: 'Markdown 转 PDF',
      envUseTranslate: '整章翻译与译文合成',
      envUseExport: '导出本页 / 整章',
      envPromptBody: '需要 {needs}，用于 {use}。',
      envPromptBack: '返回',
      envPromptDownloadPython: '下载 Python',
      envPromptDownloadTex: '下载 TeX Live',
      envPromptKey: '配置 API Key',
      workflowTitle: '工作流',
      workflowHint: '通用始终加载，不能被选择；点一个模式开启，再点当前模式退出。以后有多个模式时，点另一个会直接切换。',
      workflowGeneral: '通用',
      workflowGeneralDesc: '阅读、标注、翻译与通用工具；不需要选择，始终作为基础。',
      workflowGeneralAlways: '始终启用',
      workflowMath: '数学',
      workflowMathDesc: '提取 / 答疑 / 习题三种会话、数学提示词与 LaTeX 模板。',
      workflowOnlyOne: '同一时间只能启用一个模式；以后会增加其它工作流，结构已经按单选写好。',
      pressureTitle: '笔压测试',
      pressureHint: '用触控笔或鼠标在这里写字：线宽随压力变化。不保存、不上传，也不进任何页面。',
      pressurePadLabel: '笔压测试书写区',
      pressureIdle: '还没有笔迹；写一笔看看线宽',
      pressureNoPen: '当前设备没有压感，按默认线宽书写（{width}px）',
      pressureReading: '压感 {pressure} · 线宽 {width}px',
      pressureClear: '清除',
      readerLast: '末页',
      readerLastHint: '最后一页',
      readerJumpPage: '跳页',
      readerJumpPageHint: '跳到指定页：聚焦页码框输入',
      questionTool: '疑问框',
      questionPanelHint: '拖出矩形标记位置；框可拖动、四角缩放。改名：双击框或名称；删除：先选中疑问框工具，再右键框（可撤回）',
      questionJump: '疑问跳转',
      questionJumpEmpty: '本章没有疑问',
      questionNameHint: '双击框或名称改名；删除须先选中疑问框工具再右键',
      questionRename: '疑问名称',
      questionsTitle: '疑问',
      questionsEmpty: '本章还没有疑问标记',
      questionOpen: '定位',
      questionListHint: '点击跳到页面位置',
      questionInjectToggle: '疑问：右侧预览创建时注入当前会话',
      questionInjectHint: '只有在右侧预览（会话旁的 PDF）创建疑问时，才把「看到疑问：名称」追加到当前会话输入框，不自动发送；主阅读器里创建只标记位置；没有打开的会话时只创建标记',
      questionSaveFailed: '疑问保存失败',
      printAction: '打印',
      printHint: '用浏览器打印这个 Markdown（HTML 打印页，不需要 TeX）',
      printTitle: '打印预览',
      printBusy: '正在生成打印页…',
      printFailed: '打印页生成失败',
      printBlocked: '浏览器拒绝了打印对话框；可在打印预览里按 Ctrl+P',
      close: '关闭',
      officeArtifactHint: 'Office 文件不在插件内预览；请在 DSH 文件预览或 Office 中打开（文件就在本章产物目录）',
      officeOpening: '正在通过 DSH 打开这个文件…',
      officeOpenFailed: '无法在 DSH 中打开；可在本章产物目录用 Office 打开',
      workflowActiveHint: '已启用；再次点击这张卡片即可退出到通用。',
      workspaceTitle: '需要工作区',
      workspaceBody: '会话需要一个工作区来存放。工作区只保存对话，不会移动、复制或删除书库文件。',
      workspaceSelect: '选择已有工作区',
      workspaceEmpty: '还没有工作区',
      workspaceNew: '为书库目录新建工作区',
      workspacePath: '工作区目录',
      workspaceCreate: '创建并继续',
      workspaceCancel: '取消',
      workspaceUnavailable: '当前 DSH 不支持从插件创建工作区；请先在 DSH 的工作区页新建，再回来重试。',
      workspaceCreateFailed: '创建工作区失败',
      workspaceRequired: '请先选择或新建一个工作区，再开始会话。',
      envDownload: '下载 TeX Live（约 5 GB）',
      envHint: '需要 TeX Live（xelatex、ctex）与 Python 3；装好后把 TeX 的 bin 加进 PATH 并重启 DSH',
      updateChecking: '检查中…',
      updateHint: '只在你点击时访问 GitHub releases',
      updateLatest: '已是最新版本（v{version}）',
      updateNew: '发现新版本 {version}（当前 {current}），可以立即更新',
      updateNow: '立即更新',
      updateDownloadOnly: '市场未管理这个插件，点击会下载 zip；解压后在 DSH 插件页更新',
      updateMarketStarting: '正在通过插件市场更新…',
      updateMarketProgress: '正在更新：{state}',
      updateMarketDone: '已更新到 v{version}；重启 DSH 后生效',
      updateMarketFailed: '更新失败：{message}',
      updateRetry: '重试',
      updateDownload: '下载新版本 zip',
      modalClose: '关闭',
      hostUiLoaded: '界面组件：官方宿主 primitives',
      hostUiFallback: '界面组件：本地回退（宿主 primitives 未加载）',
      updateNoRelease: '仓库还没有发布版本',
      updateFailed: '检查更新失败（网络或代理问题），可稍后重试',
      pdfPassword: '这个 PDF 有密码或加密，暂时打不开——请先解除保护再放进书库',
      pdfInvalid: '这个文件不是有效的 PDF（可能没下载完整或已损坏）',
      pdfMissing: '找不到这个 PDF 文件，可能被移动或删除了',
      pdfUnreachable: '读取 PDF 失败：本机服务没有返回文件',
      shelfCount: '{n} 本',
      shelfSelected: '已选 {n} 本',
      shelfNew: '新建书架',
      shelfName: '书架名称',
      shelfCreate: '创建',
      shelfHide: '隐藏所选',
      shelfUnhide: '取消隐藏',
      shelfTrash: '删除所选（移入回收站）',
      trashSelectedConfirm: '删除选中的 {n} 本书？它们的章节 PDF 会移入 回收站\\，可恢复。',
      shelfRemove: '移出书架',
      shelfClear: '取消选择',
      shelfNameEmpty: '书架名称不能为空',
      shelfEmpty: '这个书架还没有书',
      hiddenShelf: '隐藏书籍',
      shelfDeleteConfirm: '删除这个书架？里面的书会回到书库，不会被隐藏。',
      shelfDeleteHint: '右键删除书架',
      hiddenDeleteConfirm: '删除「隐藏书籍」？里面的书会全部回到书库，不会被删除。',
      cleanupHint: '归档没发过消息的空会话',
      cleanupNotice: '已清理 {n} 个没说话的空白会话（归档）。',
      retryRename: '重试改名',
      targetMissing: '找不到库目录所属的工作区，无法新建会话。',
      sessionTarget: '会话建在：{dir}',
      titleLegend: '书 id（会话标题与产物目录共用）：{pairs}',
      running: '运行中',
      'mode.general': '通用',
      'mode.extract': '提取',
      'mode.qa': '答疑',
      'mode.exercise': '习题',
      bookEmpty: '这本书还没有可显示的章。',
      wholeBook: '整本',
      wholeBadge: '整本 PDF',
      wholeHint: '整本阅读，不分章',
      wholeExplain: '不会拆分？把整本 PDF 放进 {dir}\\整本\\ 也能直接读：点上面的按钮就开始读整本。代价是没有分章、没有按章会话，产物也只按整本。',
      manualWhole: '不想拆 / 不会拆？把整本 PDF 直接放进 {root}\\整本\\（文件名就是书 id）：书架会出现「整本 PDF」，点开就能读整本。代价是没有分章、没有按章会话，只有一个整本阅读。',
      sampleTitle: '示例书库',
      sampleLoading: '正在读取示例书…',
      sampleEmpty: '插件没有附带示例书',
      sampleMeta: '{chapters} 章 · 共 {size}',
      sampleHint: '内置小册子，已按章拆好，用来快速试用',
      sampleLoad: '加载示例书',
      sampleBusy: '正在复制…',
      sampleLoaded: '示例书已加入当前书库（{n} 个文件）',
      loading: '正在读取书目…',
      loadFailed: '读取书目失败',
      timeout: '读取超时，请重试。',
      saveFailed: '位置没有保存成功。',
      emptyTitle: '书库里还没有可识别的书',
      emptyHint: '把按章切好的 PDF 放进库目录的「分片」（如 书名_c04_第四章_标题_p097-138.pdf），或写一份 索引.json',
      sourceScan: '目录来自分片文件名（没有 索引.json）。',
      sourceIndex: '目录来自 索引.json。',
      indexIgnored: '索引.json 读取失败，已改为按文件名推导。',
      libraryAt: '库目录：{dir}',
      skipped: '未识别（未按章命名）：{dir}（{n} 个 PDF）',
      bookUnparsed: '{title}：{n} 个 PDF 未按章命名',
      partialHint: '{files} 个 PDF 没按章命名，已跳过；清单见页脚',
      problemUnreadable: '读不到书库（分片目录和整本目录都不存在），工作台列不出书。请确认库目录仍在（可拔掉的外置盘？），然后重试。',
      'kind.preface': '前置',
      'kind.appendix': '附录',
      'kind.bibliography': '参考',
      artifactsTitle: '产物',
      filesCount: '{n} 个文件',
      filesCountPlus: '{n}+ 个文件',
      filesTruncated: '只列出前 {n} 个',
      artifactsLoading: '正在读产物…',
      artifactsEmpty: '这一章还没有产物。',
      artifactsMissing: '这个目录还不存在。先建好这个文件夹，把文件放进去，再点「重新读取」：',
      artifactsEmptyHint: '把文件放进这个目录，再点「重新读取」：',
      artifactsScope: '只列这一层的文件；子文件夹不会显示。',
      artifactsBookId: '路径里的「{id}」是书 id，不是书名。',
      artifactsReload: '重新读取',
      artifactsExpand: '展开',
      artifactsCollapse: '收起',
      renderConfirm: '把 {name} 渲染为 PDF？会生成同名 PDF 放在 md 旁边。',
      renderAction: '转 PDF',
      renderActionHint: '渲染为 PDF，与 md 同目录',
      trashAction: '删除',
      trashFileHint: '移到 回收站\\，可恢复',
      archiveConfirm: '归档这个会话？归档不是删除：工作台不再列出，可在 DSH 的归档里恢复；要彻底清理请到 DSH 侧栏处理。',
      archiveSession: '归档',
      renderWorking: '正在渲染 PDF…（首次可能较慢）',
      renderDone: '已生成 {name}',
      renderFailed: '渲染失败：需要 Python 与 TeX Live（xelatex），详见 README',
      trashBookConfirm: '删除《{id}》？该书的章节 PDF 会移到 回收站\\，可手动恢复。',
      trashFileConfirm: '删除 {name}？会移到 回收站\\，md 保留。',
      trashDone: '已移入 库根\\回收站\\',
      trashFailed: '删除失败',
      artifactsReloadAria: '重新读取本章产物',
      artifactsFailed: '读不到这一章的产物',
      artifactsRetry: '重试',
      copyPath: '复制路径',
      pathCopied: '已复制路径',
      copyFailed: '复制失败，请手动选择路径。',
      previewTitle: '预览',
      previewClose: '关闭预览',
      previewLoading: '正在读取文件…',
      previewFailed: '读不到这个文件',
      previewRetry: '重试',
      previewGone: '这个文件可能已经被移动或删除。',
      previewUnsupported: '这类文件不能在页内预览。',
      previewEmptyFile: '这个文件没有可显示的文本（{size}）。',
      previewTruncatedBytes: '前 512 KB',
      previewTruncatedLines: '前 {n} 行',
      previewEncoding: '按 {encoding} 解码',
      previewContext: '{code} · {title}',
      artifactAt: '产物目录：{dir}',
      navLabel: 'PDF阅读',
      pageCrashed: '工作台页面出错了',
      pageCrashHint: '这是插件内部的错误，不是你的数据问题。把下面的信息发给我就能定位。',
    }

    const en = {
      title: 'PDF reading · ask as you read',
      subtitle: '{books} books · {chapters} chapters',
      shelf: 'Books',
      libraries: 'Libraries',
      librariesTitle: 'Libraries',
      librariesHint: 'Click to switch libraries, double-click to open the shelf. Keep PDFs under 分片/ or 整本/.',
      heroEyebrow: 'PDF reading · ask as you read',
      heroTitle: 'Welcome to your reader',
      heroLead: 'Read chapter by chapter, mark the page, ask whenever you need. Libraries and progress stay local.',
      heroMeta: '{n} libraries · data stays local',
      heroEmpty: 'No library yet. Import a folder that contains 分片/ or 整本/ to start.',
      homeTools: 'Toolbox',
      homeToolsHint: 'Swipe sideways; every tool lives here',
      addPathPlaceholder: 'Library root, e.g. D:\\数学书库',
      addNamePlaceholder: 'Name (optional)',
      libraryActive: 'Active',
      libraryUse: 'Switch',
      libraryRemove: 'Remove',
      libraryRemoveConfirm: 'Click again to remove',
      libraryAddTitle: 'Add a library',
      libraryAddHint: 'Pick the library root (it should contain 分片\\ or 整本\\; both may exist).',
      libraryName: 'Name',
      libraryPath: 'Directory',
      libraryPick: 'Choose…',
      libraryAdd: 'Add library',
      libraryBusy: 'Working…',
      libraryFailed: 'Library operation failed — check the folder permissions and retry',
      libraryBooks: '{n} books',
      modeMath: 'Math',
      manualTitle: 'Library manual',
      manualSummary: 'Structure · naming · export · source',
      manualLead: 'A library is just a folder. Put the PDFs in chapter order; the workbench handles the shelf, conversations, annotations and export.',
      manualStep1: 'Add a library: pick a folder that contains 分片/ or 整本/.',
      manualStep2: 'Add books: one PDF per chapter under 分片\\<book>\\; whole books under 整本\\.',
      manualStep3: 'Start reading: double-click a book, expand a chapter, open the PDF or start a conversation.',
      manualTree: '{root}/\n  分片/\n    <book>/\n      c01 chapter 1.pdf\n      c02 chapter 2.pdf\n  整本/\n    <whole book>.pdf\n  产物/<book>/<chapter>/\n  索引.json (optional)',
      manualNaming1: 'The book id is the folder name; keep it stable because old conversations and artifacts are linked by it.',
      manualNaming2: 'One PDF per chapter, keep the contents; a page range or cNN in the file name is enough, the workbench numbers it.',
      manualNaming3: 'Do not want to split? Put a whole PDF under 整本\\ and it becomes a one-chapter book.',
      manualSessionLine: 'Conversations are filed by book / chapter / mode, and existing ones can be imported.',
      manualEnvLead: 'Markdown-to-PDF needs Python 3 + TeX (xelatex, ctex); translation also needs a DeepSeek API key. Without them the matching buttons explain what to install and offer downloads; reading, conversations and preview still work.',
      aiPromptTitle: 'Prompt for an AI splitter',
      manualStructureTitle: 'Library structure',
      manualNamingTitle: 'Splitting and naming',
      manualEnvTitle: 'Export environment',
      manualSourceTitle: 'Directory source',
      manualSourceHint: 'The library list lives in ~/.dsh/pdfdesk/libraries.json; annotation mirrors in <root>\\.pdfdesk\\annotations\\.',
      manualWhy: '"分片" = the book cut into one PDF **per chapter**: each conversation reads one chapter, so its context stays small and the chapter is easy to locate. **You split manually, chapter by chapter** (page ranges from the contents); the tools rename and verify. Never split the whole book (whole-book splitting means whole-book OCR: expensive and context-blowing). The **table of contents must stay in c00** — it is the index that locates chapters. Any PDF can be read this way; ink, boxed translation and exports happen in the reader and never touch the original file.',
      manualStructure: 'Put one PDF per chapter under {root}\\分片\\<book id>\\, keep the contents. Page ranges in the name (e.g. 概率论_积分和数学期望_97-138.pdf) are enough — the workbench numbers chapters by page order; explicit <book id>_cNN_章名_p起-止.pdf also works. 产物\\ and 封面\\ optional.',
      manualSplit: 'Split with any PDF tool by chapter, keep the contents, and drop the files into 分片\\<book id>\\. No manual numbering: page ranges sort the chapters (contents/preface become c00, appendices c90+).',
      manualSession: 'Split session: the button below copies the toolkit into 工具\\ of this library and opens a conversation whose prompt already names the library path, the target folder, and the naming rules.',
      aiPromptHint: 'Ask the AI for usable Markdown (copy the sentence below):',
      aiPromptText: 'Give me a report in markdown; inline math with $...$, display math with $$...$$, never use \\[ or \\( forms.',
      aiPromptCopy: 'Copy prompt',
      aiPromptCopied: 'Prompt copied',
      splitStart: 'Split a book (opens a conversation)',
      splitHint: 'Copy the toolkit into 工具\\ of the active library and open a conversation with a prepared prompt.',
      splitReopened: 'Opened this library\'s split conversation',
      splitWorkspace: 'Workspace',
      workspaceNotChosen: 'No workspace selected',
      workspaceChoose: 'Choose workspace',
      workspaceChange: 'Change',
      importStart: 'Import files',
      importBusy: 'Importing…',
      importFilesHint: 'Import md/txt/pdf: md/txt are rendered to PDF in this library\'s 整本\\ as a whole book; PDFs go there directly.',
      importFilesDone: 'Imported {n} file(s) into the library\'s 整本\\ folder',
      splitPrompt: 'You organize a math library. **The user splits by hand, one chapter per PDF** (page ranges from the contents); your job is renaming, verifying and organizing — never OCR or split the whole book.\nLibrary root: {dir}\nTarget: {dir}\\分片\\<book id>\\ (a short id like 概率论)\nTools: {dir}\\工具\\ with rename_chapters.py (batch rename), pdfkit.py (split/verify/render), auto_chapters.py; rules: {dir}\\工具\\README.md and {dir}\\工具\\规范\\.\nPoints: the contents must be in c00; one PDF per chapter, named <book id>_cNN_第X章_章名_p起-止.pdf; if the contents are missing, ask the user — do not guess.\nFlow: confirm the book id and existing splits → rename/verify → report the result and missing chapters.',
      splitFailed: 'The split conversation did not start — check that the library folder is writable',
      librariesTitleHint: 'Double-click the title for the libraries',
      back: 'Back',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      retry: 'Retry',
      crumbsLabel: 'Location',
      chapters: '{n} chapters',
      chaptersMore: 'Show {n} more chapters',
      pages: 'pp. {range}',
      untitled: '{code} (untitled)',
      pdfLabel: 'PDF',
      openPdf: 'Open PDF',
      readerLoading: 'Loading the PDF…',
      readerFailed: 'Could not open this PDF',
      readerRetry: 'Load again',
      readerPrev: 'Previous page',
      readerNext: 'Next page',
      readerFirst: 'First page',
      readerFirstHint: 'Back to the first page',
      readerPage: 'Page',
      readerZoomIn: 'Zoom in',
      readerZoomOut: 'Zoom out',
      readerFit: 'Fit width',
      readerFitScreen: 'Fit screen',
      readerBack: 'Back to the chapter',
      readerBackHint: 'Return to this chapter’s pages; reading progress is kept',
      readerPageHint: 'Type a page number and press Enter to jump',
      readerModeSingleHint: 'Single page: one page per screen; the plane can be panned',
      readerModeContinuousHint: 'Continuous: scroll the whole chapter; the top/bottom margins are writable',
      readerShelf: 'Shelf',
      readerShelfHint: 'Back to the shelf (the book list)',
      readerOf: '/ {n}',
      readerMode: 'Reading mode',
      readerModeSingle: 'Single page',
      readerModeContinuous: 'Continuous',
      canvasCenter: 'Center',
      canvasCenterHint: 'Center the current page again',
      annotHand: 'Hand (pan)',
      handPanelHint: 'Drag the page to pan, even to marks outside it; hold Space for the same gesture; “Center” returns to the current page',
      planeExpand: 'Extend canvas',
      planeLeft: 'Add one page to the left',
      planeRight: 'Add one page to the right',
      planeUp: 'Add one page above',
      planeDown: 'Add one page below',
      planeBoundsHint: 'The dashed line is the plane edge',
      sideTabTitle: '{book} · {code}',
      sideOpenInDesk: 'Open in workbench',
      sideOpenInDeskHint: 'Return to the workbench reader at the same page',
      sideForeign: 'This address is not a math workbench chapter, so it cannot be previewed',
      sideHint: 'Follows the workbench reader: page, reading mode and file version',
      sideMenuMore: 'More actions',
      sideMenuHint: 'Right-click or click ⋯ to open the menu',
      sideMenuGoto: 'Go to page…',
      sideGotoPrompt: 'Page number',
      sideGotoHint: 'Click the page number to type',
      sideMenuZoom: 'Zoom',
      sideMenuAutoFit: 'Fit the column',
      sideAutoFitOn: 'Fitted to the column',
      sideMenuFollowReader: 'Follow the reader zoom',
      sideMenuReload: 'Reload the file',
      sideMenuClose: 'Close the preview',
      sideMenuTools: 'Tools',
      sideMenuClearAnnots: 'Clear this page’s ink',
      sideMenuClearMasks: 'Clear this page’s boxes',
      sideMenuSessions: 'Jump to a conversation',
      sideHideToolbar: 'Hide the toolbar',
      sideShowToolbar: 'Show the toolbar',
      sideMenuPaging: 'Pages',
      sideMenuPreview: 'Preview',
      blocksToggle: 'Blocks',
      blocksHint: 'Show text block boxes (debug)',
      dualToggle: 'Bilingual',
      dualHint: 'Original and translation side by side (translate first)',
      dualNeedsTranslation: 'No translation yet. Translate this chapter now? It costs tokens and needs a DeepSeek API key in Settings.',
      dualOriginal: 'Original',
      dualTranslated: 'Translation',
      dualPage: 'p. {n}',
      toolsToggle: 'Collapse or expand the tool row',
      overlayToggle: 'Overlay',
      overlayHint: 'Drag a box to reveal its translation; drag the dot to move, drag a handle to resize, right-click to delete (translate first)',
      undo: 'Undo',
      redo: 'Redo',
      undoHint: 'Undo the last stroke or box',
      redoHint: 'Redo the step just undone',
      maskBoxHint: 'Drag the dot to move · drag a handle to resize · right-click to delete',
      overlayBlocks: 'Box the page blocks',
      overlayBlocksHint: 'Box each text block automatically; press again to clear them (translate first)',
      overlayBlocksCancel: 'Clear block boxes',
      overlayBlocksCancelHint: 'Remove the boxes made by "Box the page blocks"',
      overlayBlocksEmpty: 'This page has no text blocks to box',
      overlayBlocksFailed: 'Boxing the page blocks failed',
      annotPen: 'Pen',
      annotErase: 'Erase',
      annotClear: 'Clear',
      annotTools: 'Annotation tools',
      toolSettings: 'Tool settings',
      toolPanelSelectHint: 'Pick an element on the page; its properties and actions appear here.',
      toolPanelMaskHint: 'Drag a region on the page to reveal the translation inside it; existing boxes can be moved or resized.',
      annotSelect: 'Select',
      shapeLine: 'Line',
      shapeArrow: 'Arrow',
      shapeRect: 'Rectangle',
      shapeDiamond: 'Diamond',
      shapeEllipse: 'Ellipse',
      selectionTitle: 'Selected',
      selectionPanelDragHint: 'Drag the title to move the panel; click outside to close',
      selectionPanelRightClickHint: 'Right-click a text box to adjust it; double-click to edit',
      fillTitle: 'Fill',
      fillNone: 'None',
      fillStyleTitle: 'Fill style',
      fillHachure: 'Hachure',
      fillSolid: 'Solid',
      strokeStyleTitle: 'Line style',
      styleSolid: 'Solid',
      styleDashed: 'Dashed',
      styleDotted: 'Dotted',
      opacityTitle: 'Opacity',
      alignTitle: 'Align',
      alignLeft: 'Left',
      alignCenter: 'Center',
      alignRight: 'Right',
      duplicateSelection: 'Duplicate',
      bringFront: 'Bring front',
      sendBack: 'Send back',
      selectionDelete: 'Delete selection',
      annotHint: 'Write on this page; click again to stop. Saved per page and keeps its place at any zoom',
      annotEraseHint: 'Click or drag across a stroke to delete it',
      annotClearHint: 'Remove every freehand stroke on this page',
      annotText: 'Text box',
      annotTextHint: 'Click the page to type; Enter saves, Shift+Enter breaks the line',
      annotTextPrompt: 'Note text',
      annotTextPlaceholder: 'Write a note…',
      annotTextEditorHint: 'Enter saves · Shift+Enter newline · Esc cancels',
      annotTextEditHint: 'Double-click to edit; save it empty to delete',
      annotTextActiveHint: 'Text box: click anywhere on the page and type; Enter saves, Esc cancels',
      annotDualHint: 'Each column keeps its own notes: the original column writes the page\'s shared notes, the translated column saves its own; they may sit on different pages',
      annotColorHint: 'Annotation colour',
      annotWidthHint: 'Stroke width',
      annotColor: 'Text colour',
      annotFontSize: 'Font size',
      annotFontFamily: 'Font',
      annotTextStyle: 'Style',
      annotBold: 'Bold',
      annotItalic: 'Italic',
      'annotFont.hand': 'Hand',
      'annotFont.normal': 'Normal',
      'annotFont.mono': 'Mono',
      'annotFont.song': 'Serif',
      'annotFont.hei': 'Sans',
      exportPage: 'Export page',
      exportHint: 'Export this page: original + revealed translation + ink, into the chapter artifacts',
      exporting: 'Exporting this page…',
      exportDone: 'Exported',
      exportFailed: 'Export failed',
      exportChapter: 'Export chapter',
      exportChapterHint: 'Export the whole chapter: original + revealed translation + ink per page, plus a sidecar JSON',
      exportingChapter: 'Exporting the chapter…',
      exportAnnotatedPages: '{n} page(s) with marks',
      exportGroup: 'Export…',
      exportGroupHint: 'Export this page or the chapter, or import annotations',
      importAnnots: 'Import notes',
      importAnnotsHint: 'Restore masks and notes from `<code>_export.annots.json` (overwrites those pages)',
      importingAnnots: 'Importing notes…',
      importAnnotsDone: 'Restored masks and notes for {n} page(s)',
      importAnnotsFailed: 'Importing notes failed',
      retryAction: 'Retry',
      exportCancel: 'Cancel export',
      exportCancelled: 'Export cancelled',
      overlayMissing: 'The overlay layer is not ready: translate this chapter first, then use the overlay',
      overlayFallback: 'The overlay PDF is unavailable: the boxes show the matching area of the whole translated page and may not line up',
      overlayEmpty: 'This overlay page has no text, so its boxes stay empty; translate the chapter again to rebuild it',
      overlayReflow: 'The overlay is a whole-page reflow, so its type size and position do not match the original; rebuild it by paragraph, or translate the chapter again for block alignment',
      overlayRealign: 'Rebuild by paragraph',
      overlayRealignHint: 'Re-flow the cached page text by paragraph, without calling the model; approximate, a few paragraphs may come out smaller',
      overlayRealignWorking: 'Rebuilding the overlay by paragraph…',
      overlayRealignDone: 'Overlay rebuilt by paragraph (approximate; re-translate the chapter for block-level alignment)',
      overlayRealignFailed: 'Rebuilding the overlay failed',
      overlayLoading: 'Preparing the overlay layer…',
      overlayTwoColumns: 'This page looks two-column: the overlay boxes may be off; use the bilingual view for a reliable reading',
      translateAction: 'Translate page',
      translateChapterAction: 'Translate chapter',
      translateCancel: 'Cancel translation',
      translateResume: 'Fill missing pages',
      translateResumeHint: 'Translate only the pages without cached text; pages that already have one are reused, so only the missing pages cost tokens',
      translateNeedsEnv: 'Translation needs Python + TeX and a DeepSeek API key in Settings → Environment.',
      exportNeedsPython: 'Export needs Python; install it and check Settings → Environment.',
      generalSession: 'Session',
      generalSessionHint: 'Start a general conversation that only carries the book address, with no preset purpose',
      generalSeedBook: 'Book',
      generalSeedLibrary: 'Library',
      generalSeedBookDir: 'Book folder',
      generalSeedPdf: 'Current PDF',
      translatingResume: 'Filling in the missing pages…',
      translateCancelled: 'Translation cancelled',
      translateOverwriteConfirm: 'This chapter already has a translation; translating again overwrites it. Continue?',
      translateCostConfirm: 'Translation calls the DeepSeek vision model page by page: a whole chapter usually costs tens of thousands to hundreds of thousands of tokens, billed to your API account. Alignment mode is slightly higher (~1.3x). Continue?',
      translating: 'Translating…',
      translateDone: 'Created',
      translateDonePartial: 'Translation finished, but {n} page(s) returned nothing (pages {pages}); {tokens} tokens used — use "Fill missing pages" to translate just those',
      translateBlocksFallback: 'Page(s) {pages} were translated whole-page, so the overlay can only reflow and will not line up; rebuild it by paragraph in the overlay, or re-translate the chapter for block alignment',
      translateTokens: '{n} tokens',
      translateFailed: 'Translation failed',
      translateHint: 'Translate this chapter into another language (needs a DeepSeek API key)',
      translateFor: 'Translate to:',
      langZh: 'Chinese',
      langEn: 'English',
      translateToEn: 'to English',
      translateToZh: 'to Chinese',
      translatedLabel: 'Translation',
      translatedDelete: 'Delete translation',
      translatedDeleteConfirm: 'Delete this translation? The original PDF is untouched; the translation moves to 回收站\\译文\\ and can be restored.',
      readerNewLabel: 'Start from this chapter:',
      readerNewHint: 'Continues this chapter’s group conversation; starts a continuation when it fills up; opens the PDF on the right',
      readerInSessionFailed: 'The session was created, but the PDF could not open on its right side',
      sessionsTitle: 'Sessions',
      sessionsNoModes: 'General mode has no preset session types; use the toolbar’s Session button to start one that only carries the book address.',
      newSession: 'New',
      newSessionOf: 'New {mode} session',
      newSessionHint: 'Continues this chapter’s group conversation; starts a continuation when it fills up',
      forceNew: 'Start new',
      forceNewOf: 'Start a new {mode} session without continuing',
      forceNewHint: 'Skip continuing and start a fresh continuation',
      digest: 'Outline',
      digestOf: 'Summarize this chapter’s conversations into an outline',
      digestWorking: 'Summarizing… (one model call)',
      digestFailed: 'Could not build the outline',
      digestDone: 'The outline was saved beside the chapter’s produced files',
      digestTitle: 'Chapter outline',
      digestCopy: 'Copy',
      digestCopied: 'Outline copied',
      digestEmpty: 'This chapter has no conversation to summarize yet',
      digestHint: 'The current model summarizes this chapter’s conversations into 产物/<book>/<cNN>/提纲-all.md',
      sessionWithOutline: 'The chapter outline is in the new conversation’s composer — edit or send it',
      sessionWithContext: 'The chapter and PDF are in the new conversation’s composer',
      creating: 'Creating…',
      sessionsCount: '{n} sessions',
      sessionLoading: 'Reading sessions…',
      sessionUnresolved: '{n} session titles matched no book or chapter',
      sessionUnavailable: 'The session service is unavailable',
      sessionCreated: 'Created: {title}',
      sessionQuestionLead: 'My question:',
      sessionResumed: 'Continuing the "{mode}" conversation (context {pct}%)',
      sessionContinued: 'Context was {pct}% full, so a continuation was started',
      sessionCreateFailed: 'Could not create the session — check the workspace and retry',
      sessionRenameFailed: 'The session was created, but its title was not written',
      pendingHint: 'The title is written after the first message; unsent ones are not kept',
      importSessions: 'Import',
      importOf: 'Import an existing session into the {mode} group',
      importHint: 'Attach an existing session to this chapter; its title is not changed',
      importTitle: 'Import an existing session',
      importChapter: 'Attach to {code} · {title}',
      importSearch: 'Search titles…',
      importEmpty: 'No session to import',
      importAlready: 'already here',
      importForeign: 'outside the library workspace',
      importTruncated: 'showing the first {n}',
      importDone: 'Attached to this chapter: {title}',
      importFailed: 'Could not attach the session',
      linkedHint: 'Attached to this chapter',
      unlink: 'Detach',
      unlinkDone: 'Removed from this chapter (the conversation is unchanged)',
      rename: 'Rename',
      renameSave: 'Save',
      renameCancel: 'Cancel',
      renameEmpty: 'The title cannot be empty',
      renameHint: 'Titles follow `[<book> cNN] <mode>`; changing the prefix moves it out of the chapter',
      renameDone: 'Renamed',
      renameFailed: 'Could not rename',
      cleanup: 'Clean unused',
      updateCheck: 'Check for updates',
      previewPdf: 'Side preview',
      previewOn: 'on',
      previewOff: 'off',
      previewPdfHint: 'Show this chapter\'s PDF in the side column when a session is created (preview only, not context)',
      deleteNonPdf: 'Delete non-PDF',
      deleteNonPdfHint: 'When on, md/txt artifacts can be deleted too; when off, only PDFs',
      socraticToggle: 'Socratic Q&A persona',
      socraticHint: 'Put the local qa-persona.md into the input when a Q&A session is created or opened (other modes are left alone)',
      personaFailed: 'Could not read the Q&A persona (check ~/.dsh/pdfdesk/qa-persona.md or restart DSH)',
      settings: 'Settings',
      version: 'Version',
      githubRepo: 'GitHub repository',
      feedbackIssue: 'Report an issue',
      feedbackHint: 'Opens a prefilled GitHub issue with the plugin version and system info; no files or local paths are sent',
      feedbackTitle: 'Issue: ',
      feedbackBodyVersion: 'Plugin version',
      feedbackBodyEnv: 'Environment (OS / browser)',
      feedbackBodyDesc: 'What happened',
      feedbackBodySteps: 'Steps to reproduce',
      feedbackBodyNote: 'Do not paste local paths, keys or logs; redact before attaching.',
      manualIdNote: 'A book id is its folder name / filename prefix. Do not rename it after adding the library: session titles and artifact folders key off it, so renaming breaks old sessions and artifacts (display names may change; keep the folder stable).',
      aiPromptTitle: 'AI-generated Markdown',
      libraryPathsTitle: 'Library paths and book ids',
      libraryPathHint: 'Shown as {root} here: absolute paths are local to this machine',
      readLocalPath: 'Read local path',
      hideLocalPath: 'Hide local path',
      tipsLeftClick: 'Left click: a cover selects/deselects, double click opens the book; a chapter row expands/collapses',
      tipsRightClick: 'Right click: artifacts can convert or delete, sessions can be archived; books and chapters have no menu',
      tipsTitle: 'Interaction tips',
      splitToolTitle: 'Split toolkit',
      importToolTitle: 'Import files',
      toolbarTitle: 'Toolbar',
      diagnosticsTitle: 'Catalog source and paths',
      envTitle: 'Typesetting environment',
      envOn: 'ready',
      envOff: 'missing (click to download)',
      envPython: 'Python 3',
      envPythonSize: '~25 MB',
      envTex: 'TeX Live (xelatex + ctex)',
      envTexSize: '~5 GB',
      settingsFeatures: 'Features',
      toolRail: 'Tool rail',
      railLeft: 'Left',
      railRight: 'Right',
      sketchRoughness: 'Sketch strength',
      settingsTabReading: 'Reading',
      settingsTabWorkflow: 'Modes',
      settingsTabKeys: 'Shortcuts',
      settingsTabEnv: 'Toolchain',
      settingsTabAbout: 'About',
      settingsNotesTitle: 'Notes and backup',
      sharedPrefixClear: 'Clear chapter shared prefix',
      sharedPrefixClearHint: 'Delete extracted text, base-session and branch maps (.pdfdesk/cache). PDFs, notes and existing sessions stay.',
      sharedPrefixClearAction: 'Clear',
      sharedPrefixCleared: 'Cleared the shared prefix of {n} chapters',
      sharedPrefixFailed: 'Could not clear the shared prefix',
      attachLabel: 'Attachments',
      fontTitle: 'Handwriting font (Xiaolai)',
      fontMissing: 'Not downloaded — hand text uses the system Kai face for now',
      fontInstalled: 'Downloaded ({mb} MB)',
      fontDownloaded: 'Font downloaded and enabled ({mb} MB)',
      fontImported: 'Font imported and enabled',
      fontRemovedNote: 'Font removed — handwriting falls back to the system Kai face',
      fontRedownload: 'Download again',
      fontDownloadConfirm: 'Download the Xiaolai font (~22 MB, upstream OFL release)?',
      fontDownload: 'Download',
      fontImport: 'Import local font',
      fontRemove: 'Remove',
      fontHint: 'The 22 MB Xiaolai face is no longer shipped; it is stored only in the local plugin data folder and removing it never touches notes',
      fontFailed: 'Font action failed',
      settingsTabData: 'Data',
      dataTitle: 'Machine migration',
      dataHint: 'Packs sessions, workspace registry, plugin state and each library’s .pdfdesk (notes, questions, cache, attachments). Book PDFs and keys are never included.',
      dataBackup: 'Create backup',
      dataBackupCreated: 'Created {name} ({files} files, {mb} MB)',
      dataDownload: 'Download backup',
      dataFonts: 'Include the handwriting font (~22 MB)',
      dataProjcache: 'Include the session projection cache (rebuildable, large)',
      dataSettings: 'Include browser settings (reading width, shortcuts…) as settings.json',
      dataImportTitle: 'Import a backup',
      dataImportHint: 'Enter the ZIP path on this machine. Merge never overwrites: conflicts become *.imported-<time>.',
      dataPath: 'ZIP path',
      dataInspect: 'Inspect',
      dataImport: 'Import',
      dataStrategy: 'Conflicts',
      dataMerge: 'Merge (keep existing)',
      dataOverwrite: 'Overwrite (snapshot first)',
      dataSkip: 'Skip existing',
      dataReport: 'Imported {imported}, renamed {renamed}, skipped {skipped}, rewrote {rewritten} libraries',
      dataRootHint: 'New root of library {id}',
      dataFailed: 'Migration action failed',
      dataWorking: 'Working…',
      dataApplySettings: 'Apply imported browser settings',
      dataApplied: 'Applied {n} settings; refresh the page to use them',
      dataNoSettings: 'No imported browser settings found',
      dataBookTitle: 'Import a book archive',
      dataBookHint: 'Pick a local PDF ZIP; it is unpacked into 分片/整本. Name clashes follow the conflict policy above.',
      dataBookTarget: 'Target',
      dataBookFragments: 'Fragments',
      dataBookWhole: 'Whole book',
      dataBookSubdir: 'Subfolder (optional)',
      dataBookSubdirPh: 'e.g. New book',
      dataBookImport: 'Import book archive',
      dataOverwriteConfirm: 'Overwrite replaces files with the same name (a pre-import snapshot is taken first). Continue?',
      bookOverwriteConfirm: 'Overwrite replaces same-named PDFs in the target folder. Continue?',
      dataBookReport: 'Book archive: imported {imported}, renamed {renamed}, skipped {skipped}, warnings {warnings}',
      attachAdd: 'Add',
      attachEmpty: 'No attachments',
      attachHint: 'PDFs, images and PPT (converted to PDF) up to 50 MB; copied into this chapter’s attachment folder',
      attachDelete: 'Delete attachment',
      attachDeleteConfirm: 'Delete this attachment?',
      attachUploaded: 'Attachment added',
      attachTooLarge: 'Attachment is over 50 MB',
      attachFailed: 'Attachment action failed',
      settingsNotesHint: 'Ink and boxes are mirrored into <library>\\.pdfdesk\\annotations\\ automatically and travel with the library; a cleared browser or a new machine gets them back on open.',
      lastPageLabel: 'Last read',
      lastPageAt: 'Page {n}',
      lastPageHint: 'The reader stopped on this page',
      lastPageResume: 'Continue reading',
      shortcutsTitle: 'Shortcuts',
      shortcutsHint: 'These are the keys the reader has always used; press “Record”, then the new key (Esc cancels)',
      shortcutsRecord: 'Record',
      shortcutsRecording: 'Press a key…',
      shortcutsCancel: 'Cancel',
      shortcutsClear: 'Clear',
      shortcutsRestore: 'Restore defaults',
      shortcutsClearAll: 'Clear all',
      shortcutsUnbound: 'unbound',
      shortcutsListening: 'Recording a key for “{action}”… (Esc cancels)',
      shortcutScrollUp: 'Scroll up',
      shortcutScrollDown: 'Scroll down',
      shortcutClose: 'Close the reader',
      apiKeyTitle: 'DeepSeek API key (translation)',
      apiKeyConfigured: 'configured',
      apiKeyMissing: 'not configured',
      apiKeySave: 'Save',
      envReady: 'ready: md-to-PDF, translation and export are available',
      envMissing: 'Python / TeX missing: md-to-PDF, translation and export are limited',
      envImpact: 'Without Python: md-to-PDF, translation and export are unavailable; without TeX: md-to-PDF and translation composition are unavailable; translation also needs an API key.',
      envPromptTitle: 'Environment required',
      envNeedPython: 'Python 3',
      envNeedTex: 'TeX Live (xelatex, ctex)',
      envNeedKey: 'DeepSeek API key',
      envUseRender: 'Markdown-to-PDF',
      envUseTranslate: 'whole-chapter translation and PDF composition',
      envUseExport: 'exporting a page or chapter',
      envPromptBody: 'Requires {needs}, used for {use}.',
      envPromptBack: 'Back',
      envPromptDownloadPython: 'Download Python',
      envPromptDownloadTex: 'Download TeX Live',
      envPromptKey: 'Configure API key',
      workflowTitle: 'Workflows',
      workflowHint: 'General is always loaded and cannot be selected; click a mode to enable it, and click the active mode again to return to General. With more modes, clicking another switches directly.',
      workflowGeneral: 'General',
      workflowGeneralDesc: 'Reading, annotations, translation and general tools; always on, no selection needed.',
      workflowGeneralAlways: 'Always on',
      workflowMath: 'Math',
      workflowMathDesc: 'Extract / Q&A / exercise sessions, math prompts and LaTeX templates.',
      workflowOnlyOne: 'Only one mode can be active at a time; the single-select structure is ready for more workflows.',
      pressureTitle: 'Pen pressure test',
      pressureHint: 'Write here with a stylus or a mouse: the line width follows pressure. Nothing is saved, uploaded, or attached to a page.',
      pressurePadLabel: 'Pen pressure drawing area',
      pressureIdle: 'No strokes yet; draw one to see the width',
      pressureNoPen: 'This device reports no pressure, so the default width is used ({width}px)',
      pressureReading: 'Pressure {pressure} · width {width}px',
      pressureClear: 'Clear',
      questionTool: 'Question mark',
      readerLast: 'Last page',
      readerLastHint: 'Go to the last page',
      readerJumpPage: 'Jump to page',
      readerJumpPageHint: 'Jump to a page: focus the page box and type',
      questionPanelHint: 'Drag out a rectangle to mark a place; drag it to move, pull a corner to resize. Rename: double-click the box or its name. Delete: pick the question tool first, then right-click the box (undo puts it back)',
      questionJump: 'Jump to a question',
      questionJumpEmpty: 'No questions in this chapter',
      questionNameHint: 'Double-click the box or its name to rename; to delete, pick the question tool first and right-click',
      questionRename: 'Question name',
      questionsTitle: 'Questions',
      questionsEmpty: 'No questions marked in this chapter yet',
      questionOpen: 'Go to',
      questionListHint: 'Click to jump there',
      questionInjectToggle: 'Questions: append when created in the right preview',
      questionInjectHint: 'Only a mark created in the right preview (the PDF beside the chat) appends “看到疑问：<name>” to the open conversation’s input (never sent). The reader only marks a place; without an open conversation only the mark is created.',
      questionSaveFailed: 'The question could not be saved',
      printAction: 'Print',
      printHint: 'Print this Markdown with the browser (HTML print page, no TeX needed)',
      printTitle: 'Print preview',
      printBusy: 'Building the print page…',
      printFailed: 'The print page could not be built',
      printBlocked: 'The browser refused the print dialog; press Ctrl+P inside the preview',
      close: 'Close',
      officeArtifactHint: 'Office files are not previewed inside the plugin; open them in the DSH file preview or in Office (the file is in this chapter’s product folder)',
      officeOpening: 'Opening this file through DSH…',
      officeOpenFailed: 'DSH could not open it; open the file from this chapter’s product folder in Office',
      workflowActiveHint: 'Enabled; click this card again to return to General.',
      workspaceTitle: 'Workspace required',
      workspaceBody: 'A conversation needs a workspace. The workspace stores conversations only; it never moves, copies or deletes library files.',
      workspaceSelect: 'Choose an existing workspace',
      workspaceEmpty: 'No workspaces yet',
      workspaceNew: 'Create a workspace for the library folder',
      workspacePath: 'Workspace folder',
      workspaceCreate: 'Create and continue',
      workspaceCancel: 'Cancel',
      workspaceUnavailable: 'This DSH cannot create a workspace from the plugin; create one on the DSH Workspaces page and retry.',
      workspaceCreateFailed: 'Could not create the workspace',
      workspaceRequired: 'Choose or create a workspace before starting a conversation.',
      envDownload: 'Download TeX Live (~5 GB)',
      envHint: 'Needs TeX Live (xelatex, ctex) and Python 3; add TeX bin to PATH and restart DSH',
      updateChecking: 'Checking…',
      updateHint: 'Only contacts GitHub releases on click',
      updateLatest: 'Up to date (v{version})',
      updateNew: 'Version {version} is available (you have {current}) — update now',
      updateNow: 'Update now',
      updateDownloadOnly: 'The market does not manage this plugin; the button downloads the zip. Unzip it and update in the DSH plugin page.',
      updateMarketStarting: 'Updating through the plugin market…',
      updateMarketProgress: 'Updating: {state}',
      updateMarketDone: 'Updated to v{version}; restart DSH to apply',
      updateMarketFailed: 'Update failed: {message}',
      updateRetry: 'Retry',
      updateDownload: 'Download the new zip',
      modalClose: 'Close',
      hostUiLoaded: 'UI components: official host primitives',
      hostUiFallback: 'UI components: local fallback (host primitives not loaded)',
      updateNoRelease: 'The repository has no release yet',
      updateFailed: 'Update check failed (network or proxy) — try again later',
      pdfPassword: 'This PDF is password-protected or encrypted, so it cannot be opened yet — remove the protection first',
      pdfInvalid: 'This file is not a valid PDF (incomplete download or damaged file)',
      pdfMissing: 'The PDF file is gone — it may have been moved or deleted',
      pdfUnreachable: 'Could not read the PDF: the local service returned no file',
      shelfCount: '{n} books',
      shelfSelected: '{n} selected',
      shelfNew: 'New shelf',
      shelfName: 'Shelf name',
      shelfCreate: 'Create',
      shelfHide: 'Hide selected',
      shelfUnhide: 'Unhide selected',
      shelfTrash: 'Delete selected (to recycle bin)',
      trashSelectedConfirm: 'Delete {n} selected book(s)? Their chapter PDFs move to 回收站\\ and can be restored.',
      shelfRemove: 'Remove from shelf',
      shelfClear: 'Clear selection',
      shelfNameEmpty: 'A shelf needs a name',
      shelfEmpty: 'This shelf has no books yet',
      hiddenShelf: 'Hidden books',
      shelfDeleteConfirm: 'Delete this shelf? Its books go back to the library, nothing is hidden.',
      shelfDeleteHint: 'Right-click to delete the shelf',
      hiddenDeleteConfirm: 'Delete the “Hidden books” shelf? Every hidden book returns to the library; nothing is deleted.',
      cleanupHint: 'Archive blank sessions that were never used',
      cleanupNotice: 'Cleaned {n} unused blank session(s) (archived).',
      retryRename: 'Retry rename',
      targetMissing: 'The Workspace that owns the library could not be resolved, so a session cannot be created.',
      sessionTarget: 'Sessions are created in: {dir}',
      titleLegend: 'Book ids (shared by session titles and produced-file folders): {pairs}',
      running: 'Running',
      'mode.general': 'General',
      'mode.extract': 'Extract',
      'mode.qa': 'Q&A',
      'mode.exercise': 'Exercises',
      bookEmpty: 'This book has no displayable chapters.',
      wholeBook: 'Whole book',
      wholeBadge: 'Whole-book PDF',
      wholeHint: 'Read as one document, no chapters',
      wholeExplain: 'No splitter? Drop whole PDFs into {dir}\\整本\\ and read them here — no chapters and no per-chapter sessions, one conversation per book.',
      manualWhole: 'Cannot or will not split? Drop whole PDFs into {root}\\整本\\ (the file name is the book id): the shelf shows "Whole-book PDF" and one click reads it. The trade-off is no chapters and no per-chapter sessions.',
      sampleTitle: 'Sample library',
      sampleLoading: 'Reading the sample…',
      sampleEmpty: 'This package ships no sample book',
      sampleMeta: '{chapters} chapters · {size} total',
      sampleHint: 'A small built-in booklet, already split by chapter, for a quick try',
      sampleLoad: 'Load sample book',
      sampleBusy: 'Copying…',
      sampleLoaded: 'Sample book added to the active library ({n} files)',
      loading: 'Reading the catalog…',
      loadFailed: 'Could not read the catalog',
      timeout: 'Timed out while reading; try again.',
      saveFailed: 'The position was not saved.',
      emptyTitle: 'No recognizable book in the library',
      emptyHint: 'Put chapter-split PDFs under the library’s 分片 folder (e.g. 书名_c04_第四章_标题_p097-138.pdf), or write an 索引.json',
      sourceScan: 'Catalog derived from the split file names (no 索引.json).',
      sourceIndex: 'Catalog read from 索引.json.',
      indexIgnored: '索引.json could not be used; the catalog is derived from file names.',
      libraryAt: 'Library: {dir}',
      skipped: 'Not recognized (not chapter-named): {dir} ({n} PDFs)',
      bookUnparsed: '{title}: {n} PDFs are not chapter-named',
      partialHint: '{files} PDFs are not chapter-named and were skipped; the list is in the footer',
      problemUnreadable: 'The library could not be read (neither the split folder nor the whole-book folder exists), so no book can be listed. Check that the library is still there (an unplugged drive?), then retry.',
      'kind.preface': 'Front matter',
      'kind.appendix': 'Appendix',
      'kind.bibliography': 'Bibliography',
      artifactsTitle: 'Produced files',
      filesCount: '{n} files',
      filesCountPlus: '{n}+ files',
      filesTruncated: 'showing the first {n}',
      artifactsLoading: 'Reading produced files…',
      artifactsEmpty: 'This chapter has no produced files yet.',
      artifactsMissing: 'This directory does not exist yet. Create the folder, put the file inside, then click Reload:',
      artifactsEmptyHint: 'Put a file in this directory, then click Reload:',
      artifactsScope: 'Only files directly in this directory are listed; subfolders are not shown.',
      artifactsBookId: 'The “{id}” in the path is the book id, not the book title.',
      artifactsReload: 'Reload',
      artifactsExpand: 'Expand',
      artifactsCollapse: 'Collapse',
      renderConfirm: 'Render {name} to PDF next to the markdown file?',
      renderAction: 'To PDF',
      renderActionHint: 'Render to PDF in the same folder',
      trashAction: 'Delete',
      trashFileHint: 'Move to the library\'s 回收站\\ (restorable)',
      archiveConfirm: 'Archive this conversation? Archiving is not deleting: the workbench stops listing it and it can be restored from DSH; delete it in the DSH sidebar to remove it permanently.',
      archiveSession: 'Archive',
      renderWorking: 'Rendering PDF… (the first run can be slow)',
      renderDone: 'Created {name}',
      renderFailed: 'Render failed: needs Python and TeX Live (xelatex), see README',
      trashBookConfirm: 'Delete "{id}"? Its chapter PDFs move to 回收站\\ and can be restored by hand.',
      trashFileConfirm: 'Delete {name}? It moves to 回收站\\; the markdown stays.',
      trashDone: 'Moved to the library\'s 回收站\\ folder',
      trashFailed: 'Delete failed',
      artifactsReloadAria: 'Reload this chapter’s produced files',
      artifactsFailed: 'Could not read this chapter’s produced files',
      artifactsRetry: 'Retry',
      copyPath: 'Copy path',
      pathCopied: 'Path copied',
      copyFailed: 'Could not copy; select the path by hand.',
      previewTitle: 'Preview',
      previewClose: 'Close preview',
      previewLoading: 'Reading the file…',
      previewFailed: 'Could not read this file',
      previewRetry: 'Retry',
      previewGone: 'This file may have been moved or deleted.',
      previewUnsupported: 'This kind of file cannot be previewed here.',
      previewEmptyFile: 'This file has no text to show ({size}).',
      previewTruncatedBytes: 'first 512 KB',
      previewTruncatedLines: 'first {n} lines',
      previewEncoding: 'decoded as {encoding}',
      previewContext: '{code} · {title}',
      artifactAt: 'Produced files live in: {dir}',
      navLabel: 'PDF reading',
      pageCrashed: 'The workbench page crashed',
      pageCrashHint: 'This is a bug inside the plugin, not a problem with your data. Send me the text below.',
    }

    /** Runtime copy, replaced per apply. */
    let translate = key => key

    /** Locale service captured by `apply` for components that need to subscribe. */
    let localeService = null

    /**
     * Translate with `{ name }` interpolation.
     * @param {string} key - dictionary key.
     * @param {Record<string, string | number>} [params] - interpolation values.
     * @returns {string} the localized text.
     */
    function format(key, params) {
      const raw = translate(key)
      if (params === undefined) return raw
      return raw.replace(/\{(\w+)\}/g, (all, name) => (params[name] === undefined ? all : String(params[name])))
    }

    /**
     * Re-render a component when the active locale or dictionaries change.
     * @returns {void}
     */
    function useT() {
      const [, bump] = useState(0)
      useEffect(() => {
        const locale = localeService
        if (locale === null || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => { bump(count => count + 1) })
      }, [])
    }

    /** Panel width under which the preview covers the page instead of splitting it. */
    const NARROW_WIDTH = 760

    /**
     * Whether the panel is narrow enough that the preview is an overlay. The
     * stylesheet's container query uses the same width; this copy exists only so
     * the covered part of the page can be taken out of the tab order.
     * @param {{ current: Element | null }} ref - the page root.
     * @returns {boolean} true while the panel is at or below {@link NARROW_WIDTH}.
     */
    function useNarrow(ref) {
      const [narrow, setNarrow] = useState(false)
      useEffect(() => {
        const node = ref.current
        if (node === null || typeof ResizeObserver !== 'function') return undefined
        const apply = width => setNarrow(width > 0 && width <= NARROW_WIDTH)
        const observer = new ResizeObserver(entries => {
          apply(entries[0]?.contentRect.width ?? node.clientWidth)
        })
        observer.observe(node)
        apply(node.clientWidth)
        return () => observer.disconnect()
      }, [ref])
      return narrow
    }

    /* ----------------------------------------------------------------- api -- */

    /**
     * Call one plugin route and unwrap its `{ ok }` envelope. A call that does
     * not answer within the timeout rejects with `timeout`; long jobs (rendering
     * a whole chapter) pass their own budget.
     * @param {string} method - HTTP method.
     * @param {string} path - route suffix under `/pdfdesk/`.
     * @param {unknown} [body] - JSON body for mutations.
     * @param {number} [timeoutMs] - how long to wait, in milliseconds.
     * @returns {Promise<any>} the response payload.
     */
    /** Concurrent identical GETs share one request; nothing is cached afterwards. */
    const inflightGets = new Map()

    function request(method, path, body, timeoutMs) {
      const key = method === 'GET' && body === undefined ? path : ''
      if (key !== '' && inflightGets.has(key)) return inflightGets.get(key)
      const budget = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : REQUEST_TIMEOUT_MS
      const controller = typeof AbortController === 'function' ? new AbortController() : null
      const timer = controller === null ? null : setTimeout(() => controller.abort(), budget)
      const init = {
        method,
        credentials: 'same-origin',
        headers: body === undefined
          ? { accept: 'application/json' }
          : { accept: 'application/json', 'content-type': 'application/json' },
      }
      if (body !== undefined) init.body = JSON.stringify(body)
      if (controller !== null) init.signal = controller.signal
      const promise = fetch(ENDPOINT + path, init)
        .then(response => response.json()
          .catch(() => null)
          .then(payload => {
            if (!response.ok || payload === null || payload.ok !== true) {
              const message = payload !== null && payload.error !== undefined && payload.error.message !== undefined
                ? payload.error.message
                : `HTTP ${response.status}`
              const error = new Error(message)
              error.code = payload !== null && payload.error !== undefined && typeof payload.error.code === 'string'
                ? payload.error.code
                : `http-${response.status}`
              throw error
            }
            return payload
          }))
        .catch(error => {
          if (error !== null && error !== undefined && error.name === 'AbortError') throw new Error('timeout')
          throw error
        })
        .finally(() => {
          if (timer !== null) clearTimeout(timer)
        })
      if (key !== '') {
        inflightGets.set(key, promise)
        promise.then(() => inflightGets.delete(key), () => inflightGets.delete(key))
      }
      return promise
    }

    /**
     * Turn a thrown value into display text.
     * @param {unknown} reason - thrown value.
     * @returns {string} localized text.
     */
    function errorText(reason) {
      const name = reason !== null && reason !== undefined && typeof reason.name === 'string' ? reason.name : ''
      // pdf.js names its failures well; say what the reader can actually do about
      // them instead of dropping `PasswordException` on the page.
      if (name === 'PasswordException') return format('pdfPassword')
      if (name === 'InvalidPDFException') return format('pdfInvalid')
      if (name === 'MissingPDFException') return format('pdfMissing')
      if (name === 'UnexpectedResponseException') return format('pdfUnreachable')
      const message = String(reason !== null && reason !== undefined && reason.message !== undefined ? reason.message : reason)
      return message === 'timeout' ? format('timeout') : message
    }

    /* --------------------------------------------------------------- reader -- */

    /** The reader's pdf.js module; imported on first use and kept for the session. */
    let pdfjsModule = null

    /**
     * Import the vendored pdf.js build and point its worker at the Host route.
     * The page serves it under the same origin, so no bundler or module table is
     * involved; a failure clears the cache so Retry can try again.
     * @returns {Promise<object>} the pdf.js namespace.
     */
    function loadPdfjs() {
      if (pdfjsModule === null) {
        const base = typeof document === 'undefined' ? window.location.href : document.baseURI
        const url = new URL('pdfdesk/vendor/pdf.min.mjs', base).href
        const worker = new URL('pdfdesk/vendor/pdf.worker.min.mjs', base).href
        pdfjsModule = import(url).then(module => {
          const lib = module.GlobalWorkerOptions === undefined ? (module.default ?? module) : module
          lib.GlobalWorkerOptions.workerSrc = worker
          return lib
        }).catch(error => {
          pdfjsModule = null
          throw error
        })
      }
      return pdfjsModule
    }

    /* --------------------------------------------------------------- covers -- */

    /** pdf.js optional assets (CMaps for CJK fonts, wasm for JBIG2/JPEG2000). */
    let pdfAssets = null

    /**
     * Absolute URLs of the reader's PDF asset folders, built once per page.
     * @returns {{ cMapUrl: string, wasmUrl: string }} trailing-slash URLs.
     */
    function pdfAssetUrls() {
      if (pdfAssets === null) {
        pdfAssets = {
          cMapUrl: new URL('pdfdesk/vendor/cmaps/', document.baseURI).href,
          wasmUrl: new URL('pdfdesk/vendor/wasm/', document.baseURI).href,
        }
      }
      return pdfAssets
    }

    /** Rendered cover data URLs by book id; a null entry is "this book has none". */
    const coverCache = new Map()
    /**
     * The reader's route for one chapter PDF. Every viewer builds its URL here,
     * so a document's URL is also the key of the shared document cache below.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {{ name?: string, variant?: string, rev?: number, retry?: number }} [options] - file variant and revisions.
     * @returns {string} the absolute URL.
     */
    function chapterPdfUrl(bookId, code, options) {
      const extra = options === undefined || options === null ? {} : options
      const query = new URLSearchParams({ book: bookId, code })
      if (typeof extra.name === 'string' && extra.name !== '') query.set('name', extra.name)
      if (extra.variant === 'translated' || extra.variant === 'overlay') query.set('variant', extra.variant)
      if (typeof extra.rev === 'number' && extra.rev > 0) query.set('rev', String(extra.rev))
      if (typeof extra.retry === 'number' && extra.retry > 0) query.set('retry', String(extra.retry))
      return new URL(`pdfdesk/pdf?${query.toString()}`, document.baseURI).href
    }

    /** How long a released document waits for the other pane before it is closed. */
    const SHARED_DOC_LINGER_MS = 30000

    /** Documents kept alive at most: each one holds a parsed PDF in memory. */
    const SHARED_DOC_LIMIT = 2

    /**
     * Share one pdf.js document between the reader and the right-hand preview.
     *
     * Both panes used to open the same chapter on their own: two downloads, two
     * worker parses and two copies of the parsed file, which is why the preview
     * felt slower than the reader it duplicated. A document is keyed by its URL,
     * handed out with a release function, and kept for a moment after the last
     * viewer lets go — jumping to a session unmounts the reader right before the
     * preview mounts, and that hand-over is the case worth keeping it for.
     * @param {{ linger?: number, limit?: number }} options - how long, and how many documents.
     * @returns {{ claim: Function, releaseAll: Function, size: Function }} the cache.
     */
    function createDocumentCache(options) {
      const config = options === undefined || options === null ? {} : options
      const linger = typeof config.linger === 'number' && config.linger >= 0 ? config.linger : SHARED_DOC_LINGER_MS
      const limit = typeof config.limit === 'number' && config.limit > 0 ? config.limit : SHARED_DOC_LIMIT
      /** One document per URL, with the number of viewers currently holding it. */
      const entries = new Map()
      const close = entry => {
        if (entry.timer !== null) {
          clearTimeout(entry.timer)
          entry.timer = null
        }
        if (entry.closed) return
        entry.closed = true
        if (entry.task === null) return
        try {
          void Promise.resolve(entry.task.destroy()).catch(() => {})
        } catch {
          // a task that is already gone has nothing to close
        }
      }
      /** Keep the cache under its size limit: idle documents go first. */
      const trim = keep => {
        if (entries.size <= limit) return
        for (const [url, entry] of [...entries]) {
          if (entries.size <= limit) return
          if (url === keep || entry.refs > 0) continue
          entries.delete(url)
          close(entry)
        }
      }
      const claim = (url, create) => {
        let entry = entries.get(url)
        if (entry === undefined) {
          entry = { refs: 0, task: null, promise: null, timer: null, closed: false }
          entries.set(url, entry)
          trace('doc', 'open', url.replace(/^.*\/pdfdesk\//, ''))
          const task = create()
          entry.task = task
          entry.promise = Promise.resolve(task.promise).then(document => {
            // Everybody left while it was parsing: hand it straight back.
            if (entry.closed) close(entry)
            return document
          }, error => {
            if (entries.get(url) === entry) entries.delete(url)
            throw error
          })
        } else if (entry.timer !== null) {
          clearTimeout(entry.timer)
          entry.timer = null
          trace('doc', 'reuse', url.replace(/^.*\/pdfdesk\//, ''))
        } else {
          trace('doc', 'join', url.replace(/^.*\/pdfdesk\//, ''))
        }
        entry.refs += 1
        trim(url)
        return entry.promise.then(document => {
          let released = false
          return {
            doc: document,
            release: () => {
              if (released) return
              released = true
              entry.refs = Math.max(0, entry.refs - 1)
              if (entry.refs > 0 || entry.timer !== null) return
              entry.timer = setTimeout(() => {
                entry.timer = null
                if (entry.refs > 0) return
                if (entries.get(url) === entry) entries.delete(url)
                close(entry)
              }, linger)
            },
          }
        })
      }
      const releaseAll = () => {
        for (const entry of entries.values()) close(entry)
        entries.clear()
      }
      return { claim, releaseAll, size: () => entries.size }
    }

    /** Documents the reader and the right column share. */
    const sharedDocuments = createDocumentCache({})


    /** Recent workbench events for debugging (and `window.__pdfdeskTrace`). */
    const traceRing = []

    /**
     * Whether the console copy of `trace` is wanted. Diagnostics stay in the ring
     * buffer; printing is opt-in so normal use keeps a clean console:
     * `localStorage.setItem('pdfdesk:debug', '1')` then reload.
     * @returns {boolean} whether to print.
     */
    function traceEnabled() {
      if (typeof window === 'undefined') return false
      if (window.__pdfdeskDebug === true) return true
      try {
        return window.localStorage.getItem('pdfdesk:debug') === '1'
      } catch {
        return false
      }
    }

    /**
     * Record one diagnostic event for the workbench.
     * @param {...unknown} parts - what happened.
     * @returns {void}
     */
    function trace(...parts) {
      const line = `${new Date().toISOString().slice(11, 23)} ${parts.map(part => (
        part !== null && typeof part === 'object' ? JSON.stringify(part) : String(part)
      )).join(' ')}`
      traceRing.push(line)
      if (traceRing.length > 40) traceRing.shift()
      if (traceEnabled()) console.log('[pdfdesk]', line)
    }

    /** Covers are rendered one at a time: each one needs its whole PDF. */
    let coverQueue = Promise.resolve()

    /**
     * The address of a user-provided cover (`封面/<book id>.png` and friends).
     * @param {object} book - catalog book row.
     * @returns {string} the URL.
     */
    function coverUrlFor(book) {
      return new URL(`pdfdesk/cover?book=${encodeURIComponent(book.id)}`, document.baseURI).href
    }

    /**
     * Render a book's first page into a small JPEG. The shelf otherwise has no
     * image of the book; the split PDF is the cheapest source of one.
     * @param {object} book - catalog book row.
     * @returns {Promise<string | null>} a data URL, or null when the book has no PDF.
     */
    async function renderBookCover(book) {
      const chapters = Array.isArray(book.chapters)
        ? book.chapters.filter(chapter => typeof chapter.file === 'string' && chapter.file !== '')
        : []
      if (chapters.length === 0) return null
      const first = chapters.find(chapter => chapter.code === 'c00') ?? chapters[0]
      const lib = await loadPdfjs()
      const url = new URL(`pdfdesk/pdf?book=${encodeURIComponent(book.id)}&code=${encodeURIComponent(first.code)}`, document.baseURI).href
      const task = lib.getDocument({ url, isEvalSupported: false, ...pdfAssetUrls() })
      try {
        const doc = await task.promise
        const page = await doc.getPage(1)
        const viewport = page.getViewport({ scale: Math.min(2, Math.max(0.2, 260 / page.getViewport({ scale: 1 }).width)) })
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.floor(viewport.width))
        canvas.height = Math.max(1, Math.floor(viewport.height))
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
        return canvas.toDataURL('image/jpeg', 0.82)
      } finally {
        try { void Promise.resolve(task.destroy()).catch(() => {}) } catch { /* already gone */ }
      }
    }

    /**
     * Queue one cover render, reusing a cached result.
     * @param {object} book - catalog book row.
     * @returns {Promise<string | null>} a data URL or null.
     */
    function requestCover(book) {
      if (coverCache.has(book.id)) return Promise.resolve(coverCache.get(book.id))
      const job = coverQueue.then(async () => {
        if (coverCache.has(book.id)) return coverCache.get(book.id)
        const data = await renderBookCover(book).catch(() => null)
        coverCache.set(book.id, data)
        return data
      })
      coverQueue = job.then(() => {}, () => {})
      return job
    }

    /* ------------------------------------------------------------- sessions -- */

    /** The client root context captured by `apply`, for late service lookups. */
    let clientContext = null

    /** The Client Session service captured by `apply`. */
    let sessionsService = null

    /** The Client workspace service captured by `apply` (archive state and archiving). */
    let workspacesServiceCache = null

    /** Shared empty set so an unavailable workspace service does not allocate per render. */
    const NO_IDS = new Set()

    /**
     * Resolve the Client Session service lazily: it is a `reflect.provide`
     * service, so ordering it with `inject` is not something a plugin should
     * rely on.
     * @returns {object | null} the service, when available.
     */
    function sessionService() {
      if (sessionsService === null && clientContext !== null) {
        sessionsService = clientContext.get('sessions') ?? null
      }
      return sessionsService
    }

    /**
     * Resolve the Client workspace service lazily.
     * @returns {object | null} the service, when available.
     */
    function workspacesService() {
      if (workspacesServiceCache === null && clientContext !== null) {
        workspacesServiceCache = clientContext.get('workspaces') ?? null
      }
      return workspacesServiceCache
    }

    /**
     * Whether a session is currently held by a Client reference (the selection
     * or an open conversation).
     * @param {string} id - session id.
     * @returns {boolean} true when something on screen owns it.
     */
    function sessionIsRetained(id) {
      const sessions = sessionService()
      if (sessions === null || typeof sessions.retainInfo !== 'function') return false
      try {
        const source = sessions.retainInfo(id)
        const snapshot = source !== null && typeof source.getSnapshot === 'function' ? source.getSnapshot() : null
        return typeof snapshot?.referenceCount === 'number' && snapshot.referenceCount > 0
      } catch {
        return false
      }
    }

    /**
     * Subscribe the page to the Client Session list.
     * @returns {object | null} the current `SessionListState`, or null before the service is ready.
     */
    function useSessionList() {
      const read = () => {
        const service = sessionService()
        return service === null || service.list === undefined ? null : service.list.getSnapshot()
      }
      const [snapshot, setSnapshot] = useState(read)
      useEffect(() => {
        let cancelled = false
        let unsubscribe = null
        let timer = null
        let attempts = 0
        // The service is reflect-provided; if it is not there yet, re-check for a while.
        const attach = () => {
          if (cancelled) return
          const service = sessionService()
          if (service === null || service.list === undefined) {
            attempts += 1
            if (attempts <= 20) timer = setTimeout(attach, 500)
            return
          }
          setSnapshot(service.list.getSnapshot())
          unsubscribe = service.list.subscribe(() => setSnapshot(service.list.getSnapshot()))
        }
        attach()
        return () => {
          cancelled = true
          if (timer !== null) clearTimeout(timer)
          if (unsubscribe !== null) unsubscribe()
        }
      }, [])
      return snapshot
    }

    /**
     * Subscribe to the durable archive set, so archived sessions vanish from
     * the chapter lists the way they vanish from the sidebar.
     * @returns {Set<string>} archived session ids.
     */
    function useArchivedIds() {
      const read = () => {
        const service = workspacesService()
        if (service === null || service.list === undefined) return NO_IDS
        return new Set(service.list.getSnapshot().archivedSessionIds ?? [])
      }
      const [ids, setIds] = useState(read)
      useEffect(() => {
        let cancelled = false
        let unsubscribe = null
        let timer = null
        let attempts = 0
        const attach = () => {
          if (cancelled) return
          const service = workspacesService()
          if (service === null || service.list === undefined) {
            attempts += 1
            if (attempts <= 20) timer = setTimeout(attach, 500)
            return
          }
          setIds(new Set(service.list.getSnapshot().archivedSessionIds ?? []))
          unsubscribe = service.list.subscribe(() => {
            setIds(new Set(service.list.getSnapshot().archivedSessionIds ?? []))
          })
        }
        attach()
        return () => {
          cancelled = true
          if (timer !== null) clearTimeout(timer)
          if (unsubscribe !== null) unsubscribe()
        }
      }, [])
      return ids
    }

    /**
     * Parse one workbench session title.
     * @param {string} title - durable session title.
     * @returns {{ bookKey: string, code: string, mode: string | null } | null} the binding; `mode` is null for a bracket-shaped title with an unknown mode, and null overall when the title is not workbench-shaped.
     */
    function parseSessionTitle(title) {
      if (typeof title !== 'string') return null
      const match = SESSION_TITLE.exec(title)
      if (match === null) return null
      const rest = match[3].trim()
      let artifact = ''
      let mode = modeOf(rest)
      if (mode === null) {
        // Artifact-owned session: `[book cNN] <artifact> · <mode>`.
        const cut = rest.lastIndexOf('·')
        if (cut > 0) {
          const candidate = rest.slice(cut + 1).trim()
          const candidateMode = modeOf(candidate)
          if (candidateMode !== null) {
            artifact = rest.slice(0, cut).trim()
            mode = candidateMode
          }
        }
      }
      return { bookKey: match[1].trim(), code: match[2].toLowerCase(), mode, artifact }
    }

    /**
     * Compare two Windows paths loosely, ignoring case and trailing separators.
     * @param {string} left - first path.
     * @param {string} right - second path.
     * @returns {boolean} whether they name the same directory.
     */
    function sameDirectory(left, right) {
      const normalize = value => String(value).replace(/[\\/]+$/g, '').replace(/\//g, '\\').toLowerCase()
      return normalize(left) === normalize(right)
    }

    /** A continuation number inside a workbench title, e.g. `答疑（续 2）`. */
    const CONTINUATION = /（续\s*(\d+)）\s*$/

    /**
     * Which session in the chain a workbench title names.
     * @param {string} title - a session title.
     * @returns {number} 1 for the first one, N for `（续 N）`.
     */
    function continuationOf(title) {
      const match = CONTINUATION.exec(String(title))
      if (match === null) return 1
      return Math.max(2, Number(match[1]) || 2)
    }

    /**
     * Compare two version strings by their numeric parts.
     * @param {string} left - candidate version, `v` prefix tolerated.
     * @param {string} right - current version.
     * @returns {number} positive when left is newer, negative when older, 0 when equal.
     */
    function compareVersions(left, right) {
      const parse = value => String(value).replace(/^v/i, '').split(/[.+-]/).map(part => Number.parseInt(part, 10) || 0)
      const a = parse(left)
      const b = parse(right)
      for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
        const delta = (a[index] ?? 0) - (b[index] ?? 0)
        if (delta !== 0) return delta
      }
      return 0
    }

    /**
     * Present a byte count for the sample book line.
     * @param {number} bytes - the size.
     * @returns {string} a short human-readable size.
     */
    function formatBytes(bytes) {
      const value = Number(bytes)
      if (!Number.isFinite(value) || value <= 0) return '0 KB'
      if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
      return `${Math.max(1, Math.round(value / 1024))} KB`
    }

    /**
     * Group sessions by the chapter their title names, then add the chapters
     * their explicit links name (an imported or shared conversation), and
     * include sessions the workbench created but that have not been sent yet.
     * @param {object | null} list - `SessionListState`.
     * @param {object[]} books - catalog rows.
     * @param {string} targetPath - directory the workbench creates sessions in; empty when unknown.
     * @param {Record<string, object>} pending - created-but-unused intents by session id.
     * @param {Set<string>} archivedIds - archived session ids, hidden like in the sidebar.
     * @param {Set<string>} freshIds - pending ids created during this page visit.
     * @param {Record<string, object[]>} links - extra placements by session id.
     * @returns {{ byChapter: Map<string, { extract: object[], qa: object[], exercise: object[] }>, unresolved: number, loaded: boolean, pendingCount: number }} the index.
     */
    function buildSessionIndex(list, books, targetPath, pending, archivedIds, freshIds, links) {
      const byChapter = new Map()
      const byArtifact = new Map()
      if (list === null || list === undefined || list.phase !== 'ready' || !Array.isArray(list.ids) || list.byId === undefined) {
        return { byChapter, byArtifact, unresolved: 0, loaded: false, pendingCount: 0 }
      }
      const byId = new Map(books.map(book => [book.id, book]))
      const titleCounts = new Map()
      for (const book of books) titleCounts.set(book.title, (titleCounts.get(book.title) ?? 0) + 1)
      const seen = new Set()
      const placed = new Set()
      let unresolved = 0
      let pendingCount = 0
      const marker = (bookId, code, id) => `${bookId}|${code}|${id}`
      const push = (book, code, mode, row, artifact = '') => {
        if (artifact !== '') {
          const artifactKey = `${book.id}|${code}|${artifact}`
          const artifactGroups = byArtifact.get(artifactKey) ?? { extract: [], qa: [], exercise: [] }
          artifactGroups[mode].push(row)
          byArtifact.set(artifactKey, artifactGroups)
          placed.add(marker(book.id, code, row.id))
          return
        }
        const key = `${book.id}|${code}`
        const groups = byChapter.get(key) ?? { general: [], extract: [], qa: [], exercise: [] }
        groups[mode].push(row)
        byChapter.set(key, groups)
        placed.add(marker(book.id, code, row.id))
      }
      for (const id of list.ids) {
        const summary = list.byId[id]
        if (summary === undefined) continue
        if (archivedIds.has(id)) continue
        if (summary.origin === 'subagent') continue
        // A session attached to another workspace cannot authorize this library's files.
        if (typeof summary.cwd === 'string' && summary.cwd !== '' && targetPath !== '' && !sameDirectory(summary.cwd, targetPath)) continue
        const parsed = parseSessionTitle(summary.title)
        if (parsed === null) {
          // Bracket + code but no usable mode is still a near miss the user should see counted.
          if (typeof summary.title === 'string' && /^[\[【].+?[\s\u3000]+c\d{2,3}[\]】]/i.test(summary.title)) unresolved += 1
          continue
        }
        if (parsed.mode === null) {
          unresolved += 1
          continue
        }
        const titled = titleCounts.get(parsed.bookKey) === 1 ? books.find(book => book.title === parsed.bookKey) : undefined
        const book = byId.get(parsed.bookKey) ?? titled
        if (book === undefined || !Array.isArray(book.chapters)) {
          unresolved += 1
          continue
        }
        if (!book.chapters.some(chapter => chapter.code === parsed.code)) {
          unresolved += 1
          continue
        }
        push(book, parsed.code, parsed.mode, {
          id,
          title: typeof summary.title === 'string' ? summary.title : '',
          displayTitle: typeof summary.displayTitle === 'string' ? summary.displayTitle : '',
          bookTitle: book.title,
          chapterTitle: (book.chapters.find(chapter => chapter.code === parsed.code) ?? {}).title ?? '',
          updatedAt: typeof summary.updatedAt === 'number' ? summary.updatedAt : 0,
          running: summary.running === true,
          pending: false,
          viaLink: false,
        }, parsed.artifact)
        seen.add(id)
      }
      // Explicit placements: a conversation imported into a chapter, or one that
      // belongs to several. Its title is left alone, so it may sit under both its
      // title's chapter and any linked ones — each chapter lists it once.
      for (const [id, entries] of Object.entries(links ?? {})) {
        if (!Array.isArray(entries)) continue
        const summary = list.byId[id]
        if (summary === undefined || archivedIds.has(id) || summary.origin === 'subagent') continue
        for (const entry of entries) {
          if (entry === null || typeof entry !== 'object') continue
          const book = byId.get(entry.bookId)
          if (book === undefined || !Array.isArray(book.chapters)) continue
          const chapter = book.chapters.find(item => item.code === entry.code)
          if (chapter === undefined) continue
          if (!ALL_MODES.includes(entry.mode)) continue
          if (placed.has(marker(book.id, chapter.code, id))) continue
          push(book, chapter.code, entry.mode, {
            id,
            title: typeof summary.title === 'string' ? summary.title : '',
            displayTitle: typeof summary.displayTitle === 'string' ? summary.displayTitle : '',
            bookTitle: book.title,
            chapterTitle: chapter.title ?? '',
            updatedAt: typeof summary.updatedAt === 'number' ? summary.updatedAt : 0,
            running: summary.running === true,
            pending: false,
            viaLink: true,
            link: { bookId: book.id, code: chapter.code, mode: entry.mode },
          })
          seen.add(id)
        }
      }
      // Created but never sent: shown under its chapter with the intended title,
      // which becomes durable only when the first turn starts.
      for (const [id, entry] of Object.entries(pending ?? {})) {
        if (seen.has(id) || archivedIds.has(id)) continue
        // A pending blank the user already opened is shown by the conversation,
        // not by the workbench; hiding it avoids a row that looks kept. One
        // created in this visit stays visible so New always gives feedback.
        if (!freshIds.has(id) && sessionIsRetained(id)) continue
        const summary = list.byId[id]
        if (summary === undefined || summary.blank !== true) continue
        if (summary.origin === 'subagent') continue
        if (typeof summary.cwd === 'string' && summary.cwd !== '' && targetPath !== '' && !sameDirectory(summary.cwd, targetPath)) continue
        const book = byId.get(entry.bookId)
        if (book === undefined || !Array.isArray(book.chapters)) continue
        const chapter = book.chapters.find(item => item.code === entry.code)
        if (chapter === undefined) continue
        if (!ALL_MODES.includes(entry.mode)) continue
        push(book, entry.code, entry.mode, {
          id,
          title: entry.title,
          displayTitle: entry.title,
          bookTitle: book.title,
          chapterTitle: chapter.title ?? '',
          updatedAt: typeof entry.createdAt === 'number' ? entry.createdAt : 0,
          running: false,
          pending: true,
        })
        pendingCount += 1
        seen.add(id)
      }
      for (const groups of byChapter.values()) {
        for (const mode of ALL_MODES) groups[mode].sort((left, right) => right.updatedAt - left.updatedAt)
      }
      return { byChapter, byArtifact, unresolved, loaded: true, pendingCount }
    }

    /**
     * Count the sessions grouped under one chapter.
     * @param {{ extract?: object[], qa?: object[], exercise?: object[] } | undefined} groups - chapter groups.
     * @returns {number} the session count.
     */
    function sessionCount(groups) {
      if (groups === undefined) return 0
      return ALL_MODES.reduce((sum, mode) => sum + (Array.isArray(groups[mode]) ? groups[mode].length : 0), 0)
    }

    /**
     * Compact local time for a session row.
     * @param {number} timestamp - epoch milliseconds.
     * @returns {string} `HH:MM` today, otherwise `M/D`.
     */
    function formatTime(timestamp) {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return ''
      const date = new Date(timestamp)
      const now = new Date()
      const sameDay = date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate()
      if (sameDay) {
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      }
      return `${date.getMonth() + 1}/${date.getDate()}`
    }

    /**
     * A file size a reader can compare at a glance.
     * @param {number} bytes - size in bytes.
     * @returns {string} `812 B`, `12.4 KB`, `1.2 MB`.
     */
    function formatSize(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return ''
      if (bytes < 1024) return `${bytes} B`
      const units = ['KB', 'MB', 'GB']
      let value = bytes / 1024
      let unit = 0
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit += 1
      }
      return `${value < 10 ? value.toFixed(1) : String(Math.round(value))} ${units[unit]}`
    }

    /**
     * Full local date for a produced file.
     * @param {number} timestamp - epoch milliseconds.
     * @returns {string} `YYYY/MM/DD HH:MM`, or empty when the time is unknown.
     */
    function formatDate(timestamp) {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return ''
      const date = new Date(timestamp)
      const pad = value => String(value).padStart(2, '0')
      return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    /** Lines the preview renders before it says the view is cut. */
    const MAX_PREVIEW_LINES = 4000

    /**
     * The badge a produced file's row shows.
     * @param {object} artifact - `{ name, kind }`.
     * @returns {string} `MD`, `PDF`, … or `FILE`.
     */
    function artifactBadge(artifact) {
      const match = /\.([^.\\/]+)$/.exec(String(artifact.name))
      if (match === null) return 'FILE'
      const extension = match[1].toUpperCase()
      return extension.length > 4 ? extension.slice(0, 4) : extension
    }

    /**
     * Create one Host Session for the workbench.
     * @param {{ workspaceId?: string, cwd?: string }} payload - attach to a Workspace or a bare directory.
     * @returns {Promise<string>} the new session id.
     */
    async function createSessionId(payload) {
      const sessions = sessionService()
      if (sessions !== null && typeof sessions.create === 'function') {
        return await sessions.create(payload)
      }
      const remote = clientContext === null ? null : clientContext.get('remote')
      if (remote === null || remote === undefined || remote.session === undefined) {
        throw new Error('session service unavailable')
      }
      const result = await remote.session.create(payload)
      if (result === null || result.ok !== true) {
        throw new Error(result !== null && result.error !== undefined ? result.error.message : 'create failed')
      }
      return result.value.sessionId
    }

    /**
     * The chapter's branch session for one mode (shared-prefix design): the
     * Host prepares a hidden base session that reads the chapter once, then
     * forks this mode's own session from that boundary. Falls back to an
     * ordinary new session when the Host cannot prepare one (for example a
     * scanned chapter with no extractable text).
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {string} mode - `general` / `extract` / `qa` / `exercise`.
     * @returns {Promise<string>} the branch session id.
     */
    async function ensureSharedBranch(bookId, code, mode) {
      const payload = await request('POST', 'base-session', { book: bookId, code, mode })
      const branch = payload !== null && payload !== undefined ? payload.branch : null
      const id = branch !== null && branch !== undefined ? branch.id : ''
      if (typeof id !== 'string' || id === '') throw new Error('no branch session')
      markSharedBranch(id)
      return id
    }

    /**
     * Remember that one session is a shared-prefix branch. Its history already
     * starts with the chapter read turn, so the blank-session address seed must
     * not be pasted on top when it is opened again.
     * @param {string} sessionId - branch session id.
     * @returns {void}
     */
    function markSharedBranch(sessionId) {
      try {
        window.localStorage.setItem(`pdfdesk:shared-branch:${sessionId}`, '1')
      } catch {
        // storage unavailable: the seed may be pasted again, which is harmless
      }
    }

    /**
     * @param {string} sessionId - session id.
     * @returns {boolean} whether this session was opened as a shared-prefix branch.
     */
    function isSharedBranch(sessionId) {
      try {
        return window.localStorage.getItem(`pdfdesk:shared-branch:${sessionId}`) === '1'
      } catch {
        return false
      }
    }

    /**
     * Rename a Session and pin the title; the Client projection updates as well.
     * @param {string} sessionId - target Session.
     * @param {string} title - the workbench title.
     * @returns {Promise<void>} completion.
     */
    async function renameSession(sessionId, title) {
      const sessions = sessionService()
      if (sessions !== null && typeof sessions.retain === 'function') {
        try {
          const reference = sessions.retain(sessionId, { source: 'controllerOperation' })
          try {
            const binding = await reference.ready
            const result = await binding.session.rename(title)
            if (result !== null && result.ok === true) return
          } finally {
            reference.release()
          }
        } catch {
          // The object layer could not reach the Session; the wire path below can still rename it.
        }
      }
      const remote = clientContext === null ? null : clientContext.get('remote')
      if (remote === null || remote === undefined || remote.session === undefined) {
        throw new Error('session service unavailable')
      }
      const result = await remote.session.rename({ sessionId, title })
      if (result === null || result.ok !== true) {
        throw new Error(result !== null && result.error !== undefined ? result.error.message : 'rename failed')
      }
    }

    /**
     * Put a chapter outline into a fresh continuation's composer, where it is
     * visible and editable, instead of hiding it in the model context. Uses the
     * Conversation input API the host itself uses for new-session drafts. The
     * returned reference keeps the session's input alive until the caller opens
     * it; the caller must release it.
     * @param {string} sessionId - the session that will hold the draft.
     * @param {string} text - the outline Markdown.
     * @returns {Promise<{ applied: boolean, reference: object | null }>} the result and the held retention.
     */
    async function beginPrefill(sessionId, text, whenDraftExists = 'append') {
      const sessions = sessionService()
      const conversation = clientContext === null ? null : clientContext.get('conversation')
      if (sessions === null || sessions === undefined || conversation === null || conversation === undefined) {
        return { applied: false, reference: null }
      }
      if (typeof sessions.retain !== 'function' || conversation.input === undefined
        || typeof conversation.input.requestDraftInitialization !== 'function') {
        return { applied: false, reference: null }
      }
      let reference = null
      try {
        reference = sessions.retain(sessionId, { source: 'controllerOperation' })
        const binding = await reference.ready
        const result = conversation.input.requestDraftInitialization(binding, {
          prompt: text,
          // New sessions append, because a reused blank may hold the user's
          // draft; resuming uses keep so an existing draft is never duplicated.
          whenDraftExists,
        })
        return { applied: result === 'applied', reference }
      } catch {
        if (reference !== null) {
          try { reference.release() } catch { /* already released */ }
        }
        return { applied: false, reference: null }
      }
    }

    /**
     * Open a Session in the host Conversation, leaving the workbench.
     * @param {string} sessionId - target Session.
     * @returns {boolean} false when the workspace service is unavailable.
     */
    function openHostSession(sessionId) {
      const uiWorkspace = clientContext === null ? null : clientContext.get('uiWorkspace')
      if (uiWorkspace === null || uiWorkspace === undefined || typeof uiWorkspace.openSession !== 'function') return false
      uiWorkspace.openSession(sessionId)
      return true
    }

    /**
     * Whether the local Socratic persona is enabled (Settings → 答疑人格).
     * Missing preference means on: the file is the opt-in.
     * @returns {boolean} the setting.
     */
    function socraticEnabled() {
      try {
        return window.localStorage.getItem('pdfdesk:socratic') !== '0'
      } catch {
        return true
      }
    }

    /**
     * Put the local Socratic persona into a Q&A session that is being opened
     * again. The persona is pre-filled only when a session is created, so a
     * resumed conversation would otherwise never see it; once per session is
     * enough, and the text stays visible and editable in the input.
     * @param {string} sessionId - the Q&A session about to open.
     * @returns {Promise<void>} completion (best effort).
     */
    async function seedQaPersona(sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') return
      if (!socraticEnabled()) return
      const key = `pdfdesk:qa-persona:${sessionId}`
      try {
        if (window.localStorage.getItem(key) === '1') return
      } catch {
        // storage unavailable: still seed this time
      }
      let persona = ''
      try {
        const payload = await request('GET', 'qa-persona')
        persona = typeof payload.persona === 'string' ? payload.persona.trim() : ''
      } catch {
        return
      }
      if (persona === '') return
      const block = personaPrompt(persona)
      const prefill = await beginPrefill(sessionId, `${block}\n\n${format('sessionQuestionLead')}`)
      if (!prefill.applied) {
        if (prefill.reference !== null) {
          try { prefill.reference.release() } catch { /* already released */ }
        }
        return
      }
      try { window.localStorage.setItem(key, '1') } catch { /* storage unavailable */ }
      if (prefill.reference !== null) {
        window.setTimeout(() => {
          try { prefill.reference.release() } catch { /* already released */ }
        }, 500)
      }
    }

    /* ------------------------------------------------------------ elements -- */

    const viewerBus = { token: 0, listeners: new Set() }

    /**
     * Ask the page to repaint its single-page canvas after a view swap.
     * @returns {void}
     */
    function bumpViewer() {
      viewerBus.token += 1
      viewerBus.listeners.forEach(listener => listener(viewerBus.token))
    }

    /* --------------------------------------------------------------- side -- */

    /** The right column's tab type id: its body and its title register under this key. */
    const SIDE_TAB_ID = 'dsh-pdf-workbench/pdf'
    /** The tab kind that type opens under; one chapter is one tab. */
    const SIDE_TAB_KIND = 'pdfdesk-pdf'
    /** Every side-preview address starts here: `dsh-resource://pdfdesk/chapter/<book>/<code>`. */
    const SIDE_ADDRESS = 'dsh-resource://pdfdesk/chapter/'

    /** Whether this build has the right column and our tab type is registered in it. */
    let sideTabsReady = false

    /** The menu target family the side preview contributes to. */
    const SIDE_MENU_KIND = 'pdfdeskSide'

    /** Whether the shared context menu already holds our contribution. */
    let sideMenuReady = false

    /**
     * The live action provider of each mounted side preview, by `book:code`.
     * The menu contribution is registered once for the whole kind and forwards
     * here, so opening the menu needs no per-tab wiring.
     */
    const sideMenuProviders = new Map()

    /**
     * The side preview's address for one chapter.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {string} the resource address the right column claims.
     */
    function sideAddress(bookId, code) {
      return `${SIDE_ADDRESS}${encodeURIComponent(bookId)}/${encodeURIComponent(code)}`
    }

    /**
     * Read a side-preview address back into the chapter it names.
     * @param {string} address - a tab's content id.
     * @returns {{ bookId: string, code: string } | null} the chapter, or null for an address this type does not own.
     */
    function sideTarget(address) {
      if (typeof address !== 'string' || !address.startsWith(SIDE_ADDRESS)) return null
      const rest = address.slice(SIDE_ADDRESS.length).split('?')[0].split('/')
      if (rest.length < 2 || rest[0] === '' || rest[1] === '') return null
      try {
        return { bookId: decodeURIComponent(rest[0]), code: decodeURIComponent(rest[1]) }
      } catch {
        return null
      }
    }

    /**
     * What each end may publish. The reader owns the zoom, mode, variant and the
     * file's version counters; the side preview only shares the mode, so its zoom
     * and file revisions never travel back. The page is not published here: it
     * has a cause (a user jump or a scroll report) and goes through
     * setChapterPage / reportChapterPage below, which is the only writer.
     */
    const VIEW_PUBLISHED = {
      reader: ['scale', 'mode', 'variant', 'docRev', 'annotRev', 'questionRev'],
      side: ['mode', 'annotRev', 'questionRev'],
    }

    /** One chapter's shared view state, keyed `book:code`. */
    const viewLinks = new Map()

    /**
     * The link record for one chapter, created on first use.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {{ state: object, listeners: Set<Function> }} the shared record.
     */
    function viewLink(bookId, code) {
      const key = `${bookId}:${code}`
      let link = viewLinks.get(key)
      if (link === undefined) {
        link = { state: {}, listeners: new Set() }
        viewLinks.set(key, link)
      }
      return link
    }

    /**
     * Merge one end's view into the chapter's shared state.
     *
     * Only fields that differ are published, which is what stops an echo: an
     * end that just applied the other's change has nothing left to say.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {object} state - the publishing end's current view.
     * @param {'reader'|'side'} origin - which end publishes.
     * @returns {void}
     */
    function syncView(bookId, code, state, origin) {
      const link = viewLink(bookId, code)
      const patch = {}
      const fields = VIEW_PUBLISHED[origin] ?? []
      for (const name of fields) {
        const value = state[name]
        if (value !== undefined && link.state[name] !== value) patch[name] = value
      }
      if (Object.keys(patch).length === 0) return
      Object.assign(link.state, patch, { origin, cause: 'sync' })
      broadcastView(link)
    }

    /**
     * Hand one chapter's merged state to every listener. One broken end must not
     * break the other one.
     * @param {{ state: object, listeners: Set<Function> }} link - the chapter record.
     * @returns {void}
     */
    function broadcastView(link) {
      const snapshot = { ...link.state }
      link.listeners.forEach(listener => {
        try {
          listener(snapshot)
        } catch (error) {
          trace('side', 'listener failed', String(error))
        }
      })
    }

    /**
     * Listen for the other end's view changes.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {Function} listener - receives the merged state.
     * @returns {Function} the disposer.
     */
    function subscribeView(bookId, code, listener) {
      const link = viewLink(bookId, code)
      link.listeners.add(listener)
      return () => { link.listeners.delete(listener) }
    }

    /**
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {object} the last published state for the chapter (empty before either end publishes).
     */
    function readView(bookId, code) {
      return viewLink(bookId, code).state
    }

    /* -------------------------------------------------- translation facts -- */

    /**
     * One chapter's translation facts, shared by every end in this page: whether
     * a usable translation file exists, and whether a translation is running.
     * Keyed by `chapterKey`, held only in memory, and the single source for both
     * "叠加" entries. The durable state stays where it was: the translated file
     * on disk and the `pdfdesk:job:*` key; this cache only remembers/answers it.
     */
    const translationFacts = new Map()

    /**
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {string} the localStorage key of the chapter's translation job.
     */
    function translationJobKey(bookId, code) {
      return `pdfdesk:job:${bookId}:${code}`
    }

    /**
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {string} the persisted job id, or '' when none is stored.
     */
    function readStoredJob(bookId, code) {
      try {
        const job = window.localStorage.getItem(translationJobKey(bookId, code))
        return typeof job === 'string' ? job : ''
      } catch {
        return ''
      }
    }

    /**
     * Drop the persisted job id, so a job that cannot be verified is not
     * resumed. With a job id, only that job's key is removed: a newer job for the
     * same chapter must keep its own key.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {string} [jobId] - the job that is allowed to clear the key.
     * @returns {void}
     */
    function forgetStoredJob(bookId, code, jobId) {
      try {
        const key = translationJobKey(bookId, code)
        if (jobId !== undefined && jobId !== '' && window.localStorage.getItem(key) !== jobId) return
        window.localStorage.removeItem(key)
      } catch {
        // storage unavailable
      }
    }

    /**
     * Whether a finishing job still owns its chapter's persisted job key. An
     * empty key means no newer job replaced it; a different id means the user
     * started another translation and the old loop must not clear its state.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {string} jobId - the job asking.
     * @returns {boolean} true when writing that job's terminal facts is safe.
     */
    function ownsStoredJob(bookId, code, jobId) {
      const stored = readStoredJob(bookId, code)
      return stored === '' || stored === jobId
    }

    /**
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {{ known: boolean, exists: boolean | null, translating: boolean, version: number, pending: Promise<void> | null, listeners: Set<Function> }} the chapter record.
     */
    function translationFactsOf(bookId, code) {
      const key = chapterKey(bookId, code)
      let facts = translationFacts.get(key)
      if (facts === undefined) {
        facts = { known: false, exists: null, translating: false, version: 0, pending: null, listeners: new Set() }
        translationFacts.set(key, facts)
      }
      return facts
    }

    /**
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {{ known: boolean, exists: boolean | null, translating: boolean }} a snapshot for the UI.
     */
    function readTranslationFacts(bookId, code) {
      if (bookId === '' || code === '') return { known: false, exists: null, translating: false }
      const facts = translationFactsOf(bookId, code)
      return { known: facts.known, exists: facts.exists, translating: facts.translating }
    }

    /**
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {Function} listener - receives the new snapshot.
     * @returns {Function} the disposer.
     */
    function subscribeTranslationFacts(bookId, code, listener) {
      const facts = translationFactsOf(bookId, code)
      facts.listeners.add(listener)
      return () => { facts.listeners.delete(listener) }
    }

    /**
     * @param {{ known: boolean, exists: boolean | null, translating: boolean, listeners: Set<Function> }} facts - one chapter record.
     * @returns {void}
     */
    function broadcastTranslationFacts(facts) {
      const snapshot = { known: facts.known, exists: facts.exists, translating: facts.translating }
      facts.listeners.forEach(listener => {
        try {
          listener(snapshot)
        } catch (error) {
          trace('side', 'translation listener failed', String(error))
        }
      })
    }

    /**
     * Write one chapter's translation facts. Supplying `exists` also marks the
     * chapter as checked, so the UI leaves the "unknown" state. Every change
     * bumps `version`, which makes an older in-flight probe discard its answer.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {{ known?: boolean, exists?: boolean, translating?: boolean }} patch - fields to merge.
     * @returns {void}
     */
    function writeTranslationFacts(bookId, code, patch) {
      if (bookId === '' || code === '') return
      const facts = translationFactsOf(bookId, code)
      let changed = false
      if (patch.exists !== undefined) {
        const known = patch.known === undefined ? true : patch.known === true
        if (facts.exists !== patch.exists) { facts.exists = patch.exists; changed = true }
        if (facts.known !== known) { facts.known = known; changed = true }
      } else if (patch.known !== undefined && facts.known !== patch.known) {
        facts.known = patch.known
        changed = true
      }
      if (patch.translating !== undefined && facts.translating !== patch.translating) {
        facts.translating = patch.translating
        changed = true
      }
      if (!changed) return
      facts.version += 1
      broadcastTranslationFacts(facts)
    }

    /**
     * Ask the Host once for one chapter's translation facts and remember them.
     * A persisted job is reconciled first (running / done / lost); otherwise the
     * translated PDF is probed with HEAD, so the preview can answer without the
     * reader ever being mounted. A failed or unexpected probe keeps the record
     * unknown instead of claiming there is no translation; the next mount or
     * chapter change asks again.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {Promise<void>} resolves when this chapter's facts have been asked for.
     */
    function refreshTranslationFacts(bookId, code) {
      if (bookId === '' || code === '') return Promise.resolve()
      const facts = translationFactsOf(bookId, code)
      if (facts.pending !== null) return facts.pending
      const run = (async () => {
        const jobId = readStoredJob(bookId, code)
        if (jobId !== '') {
          try {
            const state = await request('GET', `translate-status?job=${encodeURIComponent(jobId)}`)
            // A newer job may have replaced this key while the status was read;
            // its lifecycle owns the chapter now.
            if (!ownsStoredJob(bookId, code, jobId)) return
            const status = state !== null && typeof state === 'object' ? state.status : ''
            if (status === 'running') {
              writeTranslationFacts(bookId, code, { translating: true })
              return
            }
            forgetStoredJob(bookId, code, jobId)
            if (status === 'done') {
              writeTranslationFacts(bookId, code, { translating: false, exists: true })
              return
            }
            // error, or a state this build does not know: the job is over.
            writeTranslationFacts(bookId, code, { translating: false })
          } catch {
            // The job file is gone or the route failed: it cannot be claimed as
            // running any more (review W2). Fall through to the file probe.
            if (!ownsStoredJob(bookId, code, jobId)) return
            forgetStoredJob(bookId, code, jobId)
            writeTranslationFacts(bookId, code, { translating: false })
          }
        }
        const version = facts.version
        let exists = null
        try {
          const url = chapterPdfUrl(bookId, code, { variant: 'translated' })
          const response = await fetch(url, { method: 'HEAD', credentials: 'same-origin' })
          if (response.status === 404) exists = false
          else if (response.ok) exists = true
        } catch {
          exists = null
        }
        // A job lifecycle write while the probe ran is newer than this answer.
        if (facts.version !== version) return
        if (exists === null) return
        writeTranslationFacts(bookId, code, { exists })
      })().finally(() => {
        facts.pending = null
      })
      facts.pending = run
      return run
    }

    /**
     * Live view of one chapter's translation facts. Both ends read this record;
     * neither keeps a second copy.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {{ known: boolean, exists: boolean | null, translating: boolean }} the chapter facts.
     */
    function useTranslationFacts(bookId, code) {
      const chapter = chapterKey(bookId, code)
      // The record is keyed: when the reader switches chapters, the very first
      // render must already answer for the new chapter, not show the previous
      // one's facts until an effect catches up.
      const [entry, setEntry] = useState(() => ({ chapter, facts: readTranslationFacts(bookId, code) }))
      useEffect(() => {
        setEntry({ chapter, facts: readTranslationFacts(bookId, code) })
        if (bookId === '' || code === '') return undefined
        return subscribeTranslationFacts(bookId, code, facts => setEntry({ chapter, facts }))
      }, [bookId, code])
      return entry.chapter === chapter ? entry.facts : readTranslationFacts(bookId, code)
    }

    /** How long one programmatic scroll keeps scroll reports from winning. */
    const JUMP_WINDOW_MS = 800

    /**
     * The page a chapter should show, clamped to the chapter's page count (the
     * source document's count — never the translated file's own count).
     * @param {number} page - the wanted page.
     * @param {number} count - the chapter's page count (0 while unknown).
     * @returns {number} a page number of at least 1.
     */
    function clampChapterPage(page, count) {
      const wanted = Math.max(1, Math.round(Number(page) || 1))
      return count > 0 ? Math.min(count, wanted) : wanted
    }

    /**
     * Move one chapter to a page on behalf of a user action. This is the single
     * writer of a chapter's page: the page box, both previews, the annotation
     * keys and the undo keys all derive from the same value, and a jump marks
     * the moment so the views can scroll there without their own scroll reports
     * bouncing the page back.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {'reader'|'side'} origin - which end moved.
     * @param {number} page - the wanted page.
     * @param {'navigate'|'load'} [cause] - a user jump, or a restored position.
     * @returns {number} the page that is now current.
     */
    function setChapterPage(bookId, code, origin, page, cause) {
      const link = viewLink(bookId, code)
      const next = clampChapterPage(page, Number(link.state.count) || 0)
      const reason = cause === 'load' ? 'load' : 'navigate'
      Object.assign(link.state, {
        page: next,
        jump: (Number(link.state.jump) || 0) + 1,
        cause: reason,
        origin,
        jumpUntil: Date.now() + JUMP_WINDOW_MS,
      })
      broadcastView(link)
      return next
    }

    /**
     * Report the page a view has scrolled to. A report never beats a jump that
     * is still settling: the intermediate pages crossed by a programmatic
     * scroll must not pull the chapter back to where the scroll started.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {'reader'|'side'} origin - which end scrolled.
     * @param {number} page - the page now on screen.
     * @returns {boolean} whether the report was accepted.
     */
    function reportChapterPage(bookId, code, origin, page) {
      const link = viewLink(bookId, code)
      const next = clampChapterPage(page, Number(link.state.count) || 0)
      if (Number(link.state.page) === next) return true
      if (Date.now() < (Number(link.state.jumpUntil) || 0)) return false
      Object.assign(link.state, { page: next, cause: 'report', origin })
      broadcastView(link)
      return true
    }

    /**
     * Record the chapter's page count (the source document's). A page restored
     * past the end of the file is corrected once, as a jump, so both views move
     * there together instead of each clamping to a different number.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {number} count - pages in the source document.
     * @param {'reader'|'side'} [origin] - which end vouched for the count.
     * @returns {void}
     */
    function setChapterCount(bookId, code, count, origin) {
      const link = viewLink(bookId, code)
      const total = Math.max(0, Math.round(Number(count) || 0))
      if (Number(link.state.count) === total) return
      link.state.count = total
      if (total > 0 && Number(link.state.page) > total) {
        Object.assign(link.state, {
          page: total,
          jump: (Number(link.state.jump) || 0) + 1,
          cause: 'load',
          origin: origin === 'side' ? 'side' : 'reader',
          jumpUntil: Date.now() + JUMP_WINDOW_MS,
        })
        broadcastView(link)
      }
    }

    /**
     * Live view of one chapter's shared state: the reader, the preview and the
     * diagnostic overlay all read the same record.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {object} the merged state (empty when the chapter has none yet).
     */
    function useChapterView(bookId, code) {
      const [view, setView] = useState(() => (bookId === '' || code === '' ? {} : { ...readView(bookId, code) }))
      useEffect(() => {
        if (bookId === '' || code === '') {
          setView({})
          return undefined
        }
        setView({ ...readView(bookId, code) })
        return subscribeView(bookId, code, state => setView({ ...state }))
      }, [bookId, code])
      return view
    }

    /**
     * Announce an annotation or box edit: the shared counter goes up and the
     * other end re-reads that page from storage. Both ends edit, so neither can
     * own the counter; the link does.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {'reader'|'side'} origin - which end edited.
     * @returns {number} the new counter value, for the editor to remember.
     */
    function bumpAnnotRev(bookId, code, origin) {
      const link = viewLink(bookId, code)
      const next = (Number(link.state.annotRev) || 0) + 1
      syncView(bookId, code, { annotRev: next }, origin)
      return next
    }

    /**
     * Announce a question edit: the other end (and the chapter list) re-reads
     * the chapter's marks. Like the annotation counter, the link owns it.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {'reader'|'side'} origin - which end edited.
     * @returns {number} the new counter value.
     */
    function bumpQuestionRev(bookId, code, origin) {
      const link = viewLink(bookId, code)
      const next = (Number(link.state.questionRev) || 0) + 1
      syncView(bookId, code, { questionRev: next }, origin)
      return next
    }

    /** Delay before one edited page is mirrored to the library. */
    const MIRROR_DELAY_MS = 800
    /** Pending per-page mirror timers, keyed `book:code:page`. */
    const mirrorTimers = new Map()

    /**
     * Mirror one page's annotations to the library, debounced.
     *
     * localStorage is the live store, but it dies with site data or a new
     * browser; the Host keeps `<库根>\.pdfdesk\annotations\<书>\<章>.json` so the
     * notes travel with the library and survive plugin updates.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {number} page - 1-based page number.
     * @returns {void}
     */
    function mirrorPageAnnotations(bookId, code, page) {
      if (bookId === '' || code === '' || !Number.isFinite(page) || page < 1) return
      const key = `${bookId}:${code}:${page}`
      const held = mirrorTimers.get(key)
      if (held !== undefined) window.clearTimeout(held)
      mirrorTimers.set(key, window.setTimeout(() => {
        mirrorTimers.delete(key)
        let masks = []
        let annots = []
        try {
          masks = JSON.parse(window.localStorage.getItem(`pdfdesk:masks:${bookId}:${code}:${page}`) ?? '[]')
          annots = JSON.parse(window.localStorage.getItem(`pdfdesk:annots:${bookId}:${code}:${page}`) ?? '[]')
        } catch {
          return
        }
        request('POST', 'annotations', { book: bookId, code, page, masks, annots }).catch(() => {
          // offline or a read-only library: the page stays in localStorage only
        })
      }, MIRROR_DELAY_MS))
    }

    /**
     * Every page of one chapter that this browser holds.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {Map<number, { page: number, masks: object[], annots: object[] }>} pages by number.
     */
    function localChapterPages(bookId, code) {
      const pages = new Map()
      const prefixMasks = `pdfdesk:masks:${bookId}:${code}:`
      const prefixAnnots = `pdfdesk:annots:${bookId}:${code}:`
      try {
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index)
          if (key === null) continue
          const kind = key.startsWith(prefixMasks) ? 'masks' : key.startsWith(prefixAnnots) ? 'annots' : ''
          if (kind === '') continue
          const prefix = kind === 'masks' ? prefixMasks : prefixAnnots
          const rest = key.slice(prefix.length)
          // A `:right` suffix belongs to the translated column's own ink, not to
          // this page's shared list; the page's own keys are plain numbers.
          if (!/^\d+$/.test(rest)) continue
          const page = Number(rest)
          if (!Number.isFinite(page) || page < 1) continue
          const entry = pages.get(page) ?? { page, masks: [], annots: [] }
          try {
            const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]')
            entry[kind] = Array.isArray(parsed) ? parsed : []
          } catch {
            entry[kind] = []
          }
          pages.set(page, entry)
        }
      } catch {
        // storage unavailable
      }
      return pages
    }

    /** Chapter annotation syncs already started, so both panes reuse one scan. */
    const annotationSyncs = new Map()

    /** How long one chapter's annotation sync answer is reused. */
    const ANNOT_SYNC_WINDOW_MS = 10000

    /**
     * Bring this browser and the library mirror together for one chapter:
     * pages only the mirror knows are restored locally (a cleared browser or a
     * new machine), pages only this browser knows are handed to the mirror
     * (first run after the update). A page held locally always wins.
     *
     * The reader and the right preview both ask for the same chapter when a
     * session opens; one scan of the whole chapter's storage is enough, so a
     * repeat within {@link ANNOT_SYNC_WINDOW_MS} shares the first answer.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {Promise<{ restored: number, seeded: number }>} what changed on each side.
     */
    async function syncChapterAnnotations(bookId, code) {
      const key = `${bookId}:${code}`
      const running = annotationSyncs.get(key)
      if (running !== undefined && Date.now() - running.at < ANNOT_SYNC_WINDOW_MS) return running.promise
      const promise = syncChapterAnnotationsOnce(bookId, code)
      annotationSyncs.set(key, { at: Date.now(), promise })
      promise.then(() => {}, () => { annotationSyncs.delete(key) })
      return promise
    }

    /**
     * The one scan behind {@link syncChapterAnnotations}.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {Promise<{ restored: number, seeded: number }>} what changed on each side.
     */
    async function syncChapterAnnotationsOnce(bookId, code) {
      if (bookId === '' || code === '') return { restored: 0, seeded: 0 }
      let payload = null
      try {
        payload = await request('GET', `annotations?book=${encodeURIComponent(bookId)}&code=${encodeURIComponent(code)}`)
      } catch {
        return { restored: 0, seeded: 0 }
      }
      const remote = payload !== null && payload.pages !== null && typeof payload.pages === 'object' ? payload.pages : {}
      const local = localChapterPages(bookId, code)
      let restored = 0
      for (const [key, entry] of Object.entries(remote)) {
        const page = Number.parseInt(key, 10)
        if (!Number.isFinite(page) || page < 1 || local.has(page)) continue
        try {
          window.localStorage.setItem(`pdfdesk:masks:${bookId}:${code}:${page}`, JSON.stringify(Array.isArray(entry.masks) ? entry.masks : []))
          window.localStorage.setItem(`pdfdesk:annots:${bookId}:${code}:${page}`, JSON.stringify(Array.isArray(entry.annots) ? entry.annots : []))
          restored += 1
        } catch {
          // storage unavailable
        }
      }
      const missing = []
      for (const [page, entry] of local) {
        if (remote[String(page)] === undefined) missing.push({ page, masks: entry.masks, annots: entry.annots })
      }
      let seeded = 0
      if (missing.length > 0) {
        try {
          const result = await request('POST', 'annotations-bulk', { book: bookId, code, pages: missing })
          seeded = typeof result.added === 'number' ? result.added : 0
        } catch {
          // best effort: the next edit mirrors its own page anyway
        }
      }
      return { restored, seeded }
    }

    /** A chapter the side preview asked the page to open; the page consumes it on mount. */
    let pendingDeskOpen = null
    const deskOpenListeners = new Set()

    /**
     * Ask for a chapter's reader page, switching the main panel back to the workbench.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {number} page - 1-based page.
     * @returns {void}
     */
    function requestDeskOpen(bookId, code, page) {
      const layout = clientContext === null ? null : clientContext.get('layout')
      if (layout !== null && layout !== undefined && typeof layout.selectPanel === 'function') {
        try {
          layout.selectPanel(PANEL_ID)
        } catch (error) {
          // The panel is not registered yet; the request below still reaches a
          // mounted page, and the click can simply be repeated.
          trace('side', 'selectPanel failed', String(error))
        }
      }
      const target = { bookId, code, page }
      pendingDeskOpen = target
      const listeners = [...deskOpenListeners]
      listeners.forEach(listener => {
        try {
          listener(target)
        } catch (error) {
          trace('side', 'desk open failed', String(error))
        }
      })
    }

    /* --------------------------------------------------------------- keys -- */

    /** Storage key of the user's reader shortcuts. */
    const SHORTCUTS_KEY = 'pdfdesk:shortcuts'

    /**
     * Every reader action that can take keys, with the shortcuts it has always
     * had. An action may hold several keys (`PageUp` and `←` both turn back);
     * `fallback: null` means the action ships unbound.
     *
     * The page actions are handled by the workbench (it owns the page, zoom and
     * mode); the tool actions are handled by the reader itself, because only it
     * owns the picked tool. `READER_ACTIONS` below is the split.
     */
    const SHORTCUT_ACTIONS = [
      { id: 'prevPage', labelKey: 'readerPrev', fallback: [{ key: 'ArrowLeft' }, { key: 'PageUp' }] },
      { id: 'nextPage', labelKey: 'readerNext', fallback: [{ key: 'ArrowRight' }, { key: 'PageDown' }] },
      { id: 'firstPage', labelKey: 'readerFirst', fallback: [{ key: 'Home' }] },
      { id: 'lastPage', labelKey: 'readerLast', fallback: [{ key: 'End' }] },
      { id: 'scrollUp', labelKey: 'shortcutScrollUp', fallback: [{ key: 'ArrowUp' }] },
      { id: 'scrollDown', labelKey: 'shortcutScrollDown', fallback: [{ key: 'ArrowDown' }] },
      { id: 'zoomIn', labelKey: 'readerZoomIn', fallback: [{ key: '=', ctrl: true }, { key: '+', ctrl: true }] },
      { id: 'zoomOut', labelKey: 'readerZoomOut', fallback: [{ key: '-', ctrl: true }] },
      { id: 'fitWidth', labelKey: 'readerFit', fallback: [{ key: 'f' }] },
      { id: 'toggleMode', labelKey: 'readerMode', fallback: [{ key: 't' }] },
      { id: 'jumpPage', labelKey: 'readerJumpPage', fallback: [{ key: 'g' }] },
      { id: 'handTool', labelKey: 'annotHand', fallback: [{ key: 'h' }] },
      { id: 'penTool', labelKey: 'annotPen', fallback: [{ key: 'p' }] },
      { id: 'eraseTool', labelKey: 'annotErase', fallback: [{ key: 'e' }] },
      { id: 'textTool', labelKey: 'annotText', fallback: [{ key: 'x' }] },
      { id: 'questionTool', labelKey: 'questionTool', fallback: [{ key: 'q' }] },
      { id: 'questionJump', labelKey: 'questionJump', fallback: [{ key: 'Q', shift: true }] },
      { id: 'closeReader', labelKey: 'shortcutClose', fallback: [{ key: 'Escape' }] },
    ]

    /**
     * Actions whose state lives in the reader, not the workbench: the tool
     * picker, the page box and the question jump. The workbench's keyboard
     * listener must leave them to the reader so they are not swallowed.
     */
    const READER_ACTIONS = new Set(['jumpPage', 'questionJump', 'handTool', 'penTool', 'eraseTool', 'textTool', 'questionTool'])

    /** Tool action → the rail tool it picks. */
    const TOOL_SHORTCUTS = {
      handTool: 'hand',
      penTool: 'pen',
      eraseTool: 'erase',
      textTool: 'text',
      questionTool: 'question',
    }

    /**
     * Normalize one captured keyboard event into a binding.
     * @param {KeyboardEvent} event - the captured event.
     * @returns {{ key: string, ctrl?: boolean, alt?: boolean, shift?: boolean, meta?: boolean }} the binding.
     */
    function bindingOf(event) {
      const binding = { key: event.key }
      if (event.ctrlKey) binding.ctrl = true
      if (event.altKey) binding.alt = true
      if (event.shiftKey) binding.shift = true
      if (event.metaKey) binding.meta = true
      return binding
    }

    /**
     * Normalize one stored value into a list of bindings.
     * @param {unknown} value - array, single binding, or null.
     * @returns {object[]} bindings (possibly empty).
     */
    function bindingList(value) {
      const list = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value]
      return list.filter(item => item !== null && typeof item === 'object' && typeof item.key === 'string' && item.key !== '')
    }

    /**
     * The reader's current bindings: shipped defaults, then whatever the user
     * stored (an explicit `null` keeps an action unbound).
     * @returns {Record<string, object[]>} bindings by action id.
     */
    function readShortcutBindings() {
      const bindings = {}
      for (const action of SHORTCUT_ACTIONS) bindings[action.id] = bindingList(action.fallback).map(item => ({ ...item }))
      try {
        const raw = window.localStorage.getItem(SHORTCUTS_KEY)
        if (raw !== null) {
          const parsed = JSON.parse(raw)
          const stored = parsed !== null && typeof parsed === 'object' && parsed.bindings !== null && typeof parsed.bindings === 'object'
            ? parsed.bindings
            : {}
          for (const action of SHORTCUT_ACTIONS) {
            if (!Object.prototype.hasOwnProperty.call(stored, action.id)) continue
            bindings[action.id] = bindingList(stored[action.id])
          }
        }
      } catch {
        // unreadable storage falls back to the shipped defaults
      }
      return bindings
    }

    /**
     * @param {Record<string, object[]>} bindings - bindings by action id.
     * @returns {void}
     */
    function writeShortcutBindings(bindings) {
      try {
        window.localStorage.setItem(SHORTCUTS_KEY, JSON.stringify({ version: 1, bindings }))
      } catch {
        // storage unavailable: the choice lasts for this page only
      }
    }

    /**
     * Whether one event triggers one binding. Shift is only compared for letters,
     * because punctuation that needs shift (`+`) reports the shifted character.
     * @param {object} binding - the binding.
     * @param {KeyboardEvent} event - the pressed key.
     * @returns {boolean} match.
     */
    function bindingMatches(binding, event) {
      if (binding === null || binding === undefined || typeof binding.key !== 'string') return false
      const expected = binding.key.length === 1 ? binding.key.toLowerCase() : binding.key
      const actual = event.key.length === 1 ? event.key.toLowerCase() : event.key
      if (expected !== actual) return false
      if (Boolean(binding.ctrl) !== event.ctrlKey) return false
      if (Boolean(binding.alt) !== event.altKey) return false
      if (Boolean(binding.meta) !== event.metaKey) return false
      if (/^[a-z]$/i.test(binding.key) && Boolean(binding.shift) !== event.shiftKey) return false
      return true
    }

    /**
     * @param {KeyboardEvent} event - the pressed key.
     * @returns {string} the action id it triggers, or ''.
     */
    function shortcutActionOf(event) {
      const bindings = readShortcutBindings()
      for (const action of SHORTCUT_ACTIONS) {
        if (bindings[action.id].some(binding => bindingMatches(binding, event))) return action.id
      }
      return ''
    }

    /** Printable names for the keys a reader binding usually uses. */
    const KEY_LABELS = {
      ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
      PageUp: 'PgUp', PageDown: 'PgDn', Home: 'Home', End: 'End',
      Escape: 'Esc', Enter: 'Enter', Backspace: 'Backspace', Delete: 'Del',
      ' ': 'Space', Tab: 'Tab',
    }

    /**
     * @param {object} binding - one binding.
     * @returns {string} a compact label such as `Ctrl+←`.
     */
    function oneBindingLabel(binding) {
      if (binding === null || binding === undefined || typeof binding.key !== 'string') return format('shortcutsUnbound')
      const parts = []
      if (binding.ctrl) parts.push('Ctrl')
      if (binding.alt) parts.push('Alt')
      if (binding.meta) parts.push('Meta')
      if (binding.shift && binding.key.length > 1) parts.push('Shift')
      const named = KEY_LABELS[binding.key]
      parts.push(named !== undefined ? named : (binding.key.length === 1 ? binding.key.toUpperCase() : binding.key))
      return parts.join('+')
    }

    /**
     * @param {object[]} bindings - every binding of one action.
     * @returns {string} their labels, or 未绑定.
     */
    function bindingLabel(bindings) {
      const list = bindingList(bindings)
      return list.length === 0 ? format('shortcutsUnbound') : list.map(oneBindingLabel).join(' / ')
    }

    const deskStatus = { value: 'idle', job: '', listeners: new Set() }

    /** A chapter session the side preview asked the page to resume or create. */
    let pendingDeskSession = null
    const deskSessionListeners = new Set()

    /**
     * Ask for a chapter's 提取/答疑/习题 conversation. The workbench owns session
     * creation (title, outline, workspace), so the request goes through it; the
     * panel is switched first because its page must be mounted to answer.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {'extract'|'qa'|'exercise'} mode - which conversation.
     * @returns {void}
     */
    function requestDeskSession(bookId, code, mode) {
      const layout = clientContext === null ? null : clientContext.get('layout')
      if (layout !== null && layout !== undefined && typeof layout.selectPanel === 'function') {
        try {
          layout.selectPanel(PANEL_ID)
        } catch (error) {
          trace('side', 'selectPanel failed', String(error))
        }
      }
      const target = { bookId, code, mode }
      pendingDeskSession = target
      const listeners = [...deskSessionListeners]
      listeners.forEach(listener => {
        try {
          listener(target)
        } catch (error) {
          trace('side', 'session request failed', String(error))
        }
      })
    }

    /**
     * Publish the plugin's busy/done state to the sidebar icon.
     * @param {'idle'|'busy'|'done'|'error'} next - the new state.
     * @returns {void}
     */
    function setDeskStatus(next) {
      deskStatus.value = next
    }

    /**
     * @returns {string} the current sidebar state.
     */
    function useDeskStatus() {
      const [value, setValue] = useState(deskStatus.value)
      useEffect(() => {
        deskStatus.listeners.add(setValue)
        return () => {
          deskStatus.listeners.delete(setValue)
        }
      }, [])
      return value
    }

    /**
     * The sidebar icon; `size` and `active` come from the sidebar owner. The
     * geometry matches `icon.svg`: three upright books on a shelf line.
     * @param {{ size?: number, active?: boolean }} props - presentation props.
     * @returns {import('react').ReactElement} the icon.
     */
    function DeskIcon(props) {
      const size = typeof props.size === 'number' && props.size > 0 ? props.size : 18
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        'aria-hidden': true,
        focusable: 'false',
        style: { display: 'block' },
      },
        h('path', { d: 'M2.8 6.8h4v13.6h-4z', fill: 'currentColor', opacity: 0.72 }),
        h('path', { d: 'M9.8 3.8h4v16.6h-4z', fill: 'currentColor' }),
        h('path', { d: 'M16.8 8.6h4v11.8h-4z', fill: 'currentColor', opacity: 0.86 }),
        h('path', { d: 'M2.2 21.4h19.6', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', fill: 'none' })
      )
    }

    /**
     * One book's cover: the user's image when present, otherwise the first page of
     * its first PDF as a small JPEG, otherwise the lettered placeholder.
     * @param {{ book: object }} props - the book row.
     * @returns {import('react').ReactElement} the cover box.
     */
    function CoverView(props) {
      const book = props.book
      const hasCover = props.hasCover === true
      const cached = coverCache.get(book.id)
      const mark = Array.from(String(book.title))[0] ?? '书'
      const [src, setSrc] = useState(() => cached !== undefined ? cached : (hasCover ? coverUrlFor(book) : null))
      const [fallback, setFallback] = useState(cached === null ? false : !hasCover)
      // Only render the first PDF page once the user's cover image is known to be
      // missing: rendering needs the whole PDF, so it must not happen needlessly.
      useEffect(() => {
        if (!fallback) return undefined
        let cancelled = false
        void requestCover(book).then(data => {
          if (!cancelled) setSrc(data)
        })
        return () => { cancelled = true }
      }, [book, fallback])
      return h('span', { className: 'md-cover', 'aria-hidden': true },
        h('span', { className: 'md-cover-rule' }),
        h('span', { className: 'md-cover-mark' }, mark),
        src === null
          ? null
          : h('img', {
            className: 'md-cover-img',
            alt: '',
            src,
            onError: () => {
              setSrc(null)
              setFallback(true)
            },
          })
      )
    }

    /**
     * One book card on the shelf.
     * @param {{ book: object, onOpen: (id: string) => void, registerRef: Function }} props - book row, opener, focus ref.
     * @returns {import('react').ReactElement} the card.
     */
    function BookCard(props) {
      const book = props.book
      const clickTimer = useRef(null)
      const chapters = Array.isArray(book.chapters) ? book.chapters.length : 0
      const sub = book.whole === true
        ? `${format('wholeBadge')} · ${format('wholeHint')}`
        : [book.author, format('chapters', { n: chapters })].filter(item => item !== '').join(' · ')
      return h(KitButton, {
        type: 'button',
        className: props.selected ? 'md-card md-card-selected' : 'md-card',
        onClick: () => {
          // A single click toggles selection, but wait briefly: a second click is
          // "open the book", and must not flash the selection first.
          if (clickTimer.current !== null) {
            window.clearTimeout(clickTimer.current)
            clickTimer.current = null
            props.onOpen(book.id)
            return
          }
          clickTimer.current = window.setTimeout(() => {
            clickTimer.current = null
            props.onSelect(book.id)
          }, 220)
        },
        onContextMenu: props.onContextMenu === undefined ? undefined : event => {
          event.preventDefault()
          props.onContextMenu()
        },
        title: sub === '' ? book.title : `${book.title} · ${sub}`,
        ref: node => props.registerRef(book.id, node),
      },        h(CoverView, { book, hasCover: props.hasCover }),
        h('span', { className: 'md-card-body' },
          h('span', { className: 'md-card-title' }, book.title),
          h('span', { className: 'md-card-sub' }, sub)
        ),
        props.selected ? h('span', { className: 'md-card-check', 'aria-hidden': true }, '✓') : null
      )
    }

    /**
     * A multi-file tile: the "hidden books" folder or a user-made shelf.
     * @param {{ name: string, count: number, onOpen: Function }} props - tile content and opener.
     * @returns {import('react').ReactElement} the tile.
     */
    function CollectionCard(props) {
      return h(KitButton, {
        type: 'button',
        className: 'md-collection',
        onClick: props.onOpen,
        onContextMenu: event => {
          event.preventDefault()
          props.onDelete()
        },
        title: `${props.name} · ${format('shelfCount', { n: props.count })} · ${format('shelfDeleteHint')}`,
      },
        h('span', { className: 'md-collection-stack', 'aria-hidden': true },
          h('span', { className: 'md-collection-sheet md-sheet-3' }),
          h('span', { className: 'md-collection-sheet md-sheet-2' }),
          h('span', { className: 'md-collection-sheet md-sheet-1' }),
          h('span', { className: 'md-collection-title' }, props.name)
        ),
        h('span', { className: 'md-collection-count' }, format('shelfCount', { n: props.count }))
      )
    }

    /**
     * Standalone settings page (modal) with environment, GitHub and feature switches.
     * @param {{ version: string, envTools: object, previewPdf: boolean, allowNonPdfDelete: boolean, onPreview: Function, onNonPdf: Function, onClose: Function }} props - settings state and handlers.
     * @returns {import('react').ReactElement} the dialog.
     */
    /**
     * Explain which environment a feature needs and offer the download links.
     * @param {{ kind: string, envTools: object, onClose: Function, onOpenSettings: Function }} props - feature kind and capabilities.
     * @returns {import('react').ReactElement} the dialog.
     */
    function EnvPrompt(props) {
      const kind = props.kind
      const python = props.envTools === undefined || props.envTools.python !== true
      const tex = (kind === 'render' || kind === 'translate') && (props.envTools === undefined || props.envTools.tex !== true)
      const key = kind === 'translate' && (props.envTools === undefined || props.envTools.apiKey !== true)
      const needs = [
        python ? format('envNeedPython') : '',
        tex ? format('envNeedTex') : '',
        key ? format('envNeedKey') : '',
      ].filter(Boolean)
      const useKey = kind === 'render' ? 'envUseRender' : kind === 'export' ? 'envUseExport' : 'envUseTranslate'
      const open = url => {
        try {
          window.open(url, '_blank', 'noopener')
        } catch {
          // popup blocked
        }
      }
      return h(KitModal, {
        title: format('envPromptTitle'),
        onClose: props.onClose,
        children: h('p', { className: 'md-env-body' }, format('envPromptBody', {
          needs: needs.join(' + '),
          use: format(useKey),
        })),
        footer: [
          h(KitButton, { key: 'back', variant: 'outline', onClick: props.onClose }, format('envPromptBack')),
          python ? h(KitButton, {
            key: 'python', variant: 'outline',
            onClick: () => open(PYTHON_URL),
          }, format('envPromptDownloadPython')) : null,
          tex ? h(KitButton, {
            key: 'tex', variant: 'outline',
            onClick: () => open(TEXLIVE_URL),
          }, format('envPromptDownloadTex')) : null,
          key ? h(KitButton, {
            key: 'key', variant: 'primary',
            onClick: () => {
              if (typeof props.onOpenSettings === 'function') props.onOpenSettings()
            },
          }, format('envPromptKey')) : null,
        ],
      })
    }

    /**
     * Ask the user which workspace should own the next conversation. General
     * mode never creates one silently.
     * @param {{ workspaces: object[], defaultPath: string, onPick: Function, onCreate: Function, onCancel: Function }} props - options and callbacks.
     * @returns {import('react').ReactElement} the dialog.
     */
    function WorkspacePrompt(props) {
      const [path, setPath] = React.useState(props.defaultPath ?? '')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const create = async () => {
        if (busy) return
        setBusy(true)
        setError('')
        try {
          await props.onCreate(path)
        } catch (reason) {
          setError(errorText(reason))
        } finally {
          setBusy(false)
        }
      }
      return h(KitModal, {
        title: format('workspaceTitle'),
        className: 'md-workspace-dialog',
        onClose: props.onCancel,
        children: h(React.Fragment, null,
          h('p', { className: 'md-env-body' }, format('workspaceBody')),
          h('div', { className: 'md-workspace-list' },
            h('span', { className: 'md-workspace-label' }, format('workspaceSelect')),
            props.workspaces.length === 0
              ? h('span', { className: 'md-shelf-sub' }, format('workspaceEmpty'))
              : props.workspaces.map(item => h(KitButton, {
                key: item.id,
                variant: 'outline',
                onClick: () => props.onPick(item),
              }, item.title === '' ? item.path : `${item.title} · ${item.path}`))
          ),
          h('div', { className: 'md-workspace-new' },
            h('span', { className: 'md-workspace-label' }, format('workspaceNew')),
            h('span', { className: 'md-shelf-sub' }, format('workspacePath')),
            h(KitInput, {
              className: 'md-settings-input',
              value: path,
              onChange: value => setPath(value),
              onKeyDown: event => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                void create()
              },
            })
          ),
          error === '' ? null : h('p', { className: 'md-settings-note' }, error)
        ),
        footer: [
          h(KitButton, { key: 'cancel', variant: 'ghost', onClick: props.onCancel }, format('workspaceCancel')),
          h(KitButton, {
            key: 'create',
            variant: 'primary',
            disabled: busy || path.trim() === '',
            onClick: () => { void create() },
          }, busy ? format('creating') : format('workspaceCreate')),
        ],
      })
    }

    /**
     * Button adapter: host Button when the primitives bundle is available, the
     * workbench's own button otherwise. All native button props are forwarded.
     */
    const KitButton = React.forwardRef(function KitButton(props, ref) {
      const ui = useHostUi()
      const className = typeof props.className === 'string' ? props.className : ''
      const variant = props.variant !== undefined
        ? props.variant
        : className.includes('md-btn-primary')
          ? 'primary'
          : className.includes('md-btn-ghost')
            ? 'ghost'
            : 'outline'
      // Dense workbench controls use the small host size by default.
      const size = props.size !== undefined ? props.size : 'sm'
      const hostClasses = className.split(/\s+/).filter(name => name !== ''
        && (name === 'md-btn-danger' || !name.startsWith('md-btn'))).join(' ')
      // Cards, chapter rows and picker/file rows are layout surfaces first. The
      // host Button's inline-flex chrome would flatten their internal grid, so
      // those stay on the native button while ordinary action buttons use the
      // host control.
      const nativeOnly = /(?:^|\s)(md-card|md-collection|md-row|md-picker-row|md-file|md-note-style-btn|md-note-color|md-rail-btn|md-icon-btn|md-crumb|md-crumb-current|md-btn-ghost)(?:\s|$)/.test(className)
      const { variant: _variant, size: _size, hostClassName: _hostClassName, className: _className, children, ...rest } = props
      // Every text button carries a hover hint even when the caller forgot one:
      // the aria-label wins, otherwise the visible text is the tooltip. Symbol
      // buttons keep theirs explicit (a lone "‹" is not a useful hint).
      const childText = typeof children === 'string' || typeof children === 'number' ? String(children).trim() : ''
      const hint = props.title !== undefined
        ? props.title
        : typeof props['aria-label'] === 'string' && props['aria-label'] !== ''
          ? props['aria-label']
          : childText.length > 1 ? childText : undefined
      const HostButton = ui !== null && ui !== undefined && ui.Button !== undefined
        && ui.Button !== null
        && (typeof ui.Button === 'function' || (typeof ui.Button === 'object' && ui.Button.$$typeof))
        ? ui.Button
        : null
      if (HostButton !== null && !nativeOnly) {
        return h(HostButton, {
          ...rest,
          ref,
          variant,
          size,
          className: [hostClasses, props.hostClassName].filter(Boolean).join(' '),
          disabled: props.disabled === true,
          title: hint,
          type: props.type === undefined ? 'button' : props.type,
          onClick: props.onClick,
        }, children)
      }
      return h('button', {
        ...rest,
        ref,
        type: props.type === undefined ? 'button' : props.type,
        className: props.className,
        disabled: props.disabled === true,
        title: hint,
        onClick: props.onClick,
      }, children)
    })

    /**
     * Keep the wheel scrolling the page when a pointer layer sits above the
     * scroller. The layer is a sibling of the stage (so it can cover the
     * viewport), which means the wheel would not reach the scroller by itself.
     * @param {WheelEvent} event - the wheel event.
     * @returns {void}
     */
    function forwardWheel(event) {
      const host = event.currentTarget === null || event.currentTarget === undefined ? null : event.currentTarget.parentElement
      const scroller = host === null ? null : host.querySelector('.md-reader-stage')
      if (scroller === null || typeof scroller.scrollBy !== 'function') return
      scroller.scrollBy({ top: event.deltaY, left: event.deltaX })
    }

    /**
     * The shared plane's dashed edge with one "+" square per side. Used by the
     * reader and the right preview: the plane is chapter-wide, so both panes
     * show the same edge and the same handles.
     * @param {{ margins: object, onExpand: Function }} props - the plane and the action.
     * @returns {import('react').ReactElement} the edge and its handles.
     */
    function PlaneBounds(props) {
      const margins = props.margins === undefined || props.margins === null ? PLANE_MARGINS : props.margins
      const compact = props.compact === true
      // Fixed mode renders the plane in the stage host (outside the scroller):
      // the dashed box stays visible around the page, but the two pages of
      // blank above/below never become scrollable blank space.
      const fixed = props.fixed === true
      const anchorRef = props.anchorRef
      const hostRef = props.hostRef
      const [fixedBox, setFixedBox] = useState(null)
      useLayoutEffect(() => {
        if (!fixed) return undefined
        const update = () => {
          const anchor = anchorRef === null || anchorRef === undefined ? null : anchorRef.current
          const host = hostRef === null || hostRef === undefined ? null : hostRef.current
          if (anchor === null || host === null || typeof anchor.getBoundingClientRect !== 'function') return
          const page = anchor.getBoundingClientRect()
          const frame = host.getBoundingClientRect()
          if (page.width <= 0 || page.height <= 0) return
          const next = {
            left: Math.round(page.left - frame.left - margins.left * page.width),
            top: Math.round(page.top - frame.top - margins.top * page.height),
            width: Math.round((1 + margins.left + margins.right) * page.width),
            height: Math.round((1 + margins.top + margins.bottom) * page.height),
          }
          setFixedBox(current => (current !== null && current.left === next.left && current.top === next.top
            && current.width === next.width && current.height === next.height ? current : next))
        }
        update()
        let frame = 0
        const schedule = () => {
          if (frame !== 0) return
          frame = window.requestAnimationFrame(() => { frame = 0; update() })
        }
        window.addEventListener('scroll', schedule, true)
        window.addEventListener('resize', schedule)
        let observer = null
        const anchor = anchorRef === null || anchorRef === undefined ? null : anchorRef.current
        if (typeof ResizeObserver === 'function' && anchor !== null) {
          observer = new ResizeObserver(schedule)
          observer.observe(anchor)
        }
        return () => {
          window.removeEventListener('scroll', schedule, true)
          window.removeEventListener('resize', schedule)
          if (frame !== 0) window.cancelAnimationFrame(frame)
          if (observer !== null) observer.disconnect()
        }
      }, [fixed, anchorRef, hostRef, margins.left, margins.top, margins.right, margins.bottom, props.version])
      const expand = side => {
        if (typeof props.onExpand === 'function') props.onExpand(side)
        else expandPlaneMargin(side)
      }
      const handle = (side, style) => h(KitButton, {
        key: side,
        type: 'button',
        className: 'md-plane-add md-icon-btn',
        style,
        title: format(side === 'left' ? 'planeLeft' : side === 'right' ? 'planeRight' : side === 'top' ? 'planeUp' : 'planeDown'),
        'aria-label': format(side === 'left' ? 'planeLeft' : side === 'right' ? 'planeRight' : side === 'top' ? 'planeUp' : 'planeDown'),
        onClick: () => expand(side),
        onPointerDown: event => event.stopPropagation(),
      }, '+')
      const style = fixed
        ? (fixedBox === null ? { display: 'none' } : {
          position: 'absolute',
          left: `${fixedBox.left}px`,
          top: `${fixedBox.top}px`,
          width: `${fixedBox.width}px`,
          height: `${fixedBox.height}px`,
        })
        : compact ? { inset: 0 } : {
          left: `${-margins.left * 100}%`,
          top: `${-margins.top * 100}%`,
          width: `${(1 + margins.left + margins.right) * 100}%`,
          height: `${(1 + margins.top + margins.bottom) * 100}%`,
        }
      return h('div', {
        className: 'md-plane-bounds',
        'data-fixed': fixed ? 'true' : undefined,
        'data-compact': compact ? 'true' : undefined,
        title: format('planeBoundsHint'),
        style,
      },
        handle('top', { left: '50%', top: '0%', transform: 'translate(-50%, -50%)' }),
        handle('bottom', { left: '50%', top: '100%', transform: 'translate(-50%, -50%)' }),
        handle('left', { left: '0%', top: '50%', transform: 'translate(-50%, -50%)' }),
        handle('right', { left: '100%', top: '50%', transform: 'translate(-50%, -50%)' }))
    }

    /**
     * Input adapter: host Input when available; the business onChange always
     * receives the value, never the raw event.
     */
    const KitInput = React.forwardRef(function KitInput(props, ref) {
      const ui = useHostUi()
      const controlled = props.value !== undefined
      const value = controlled && props.value !== null ? String(props.value) : ''
      const change = event => {
        if (typeof props.onChange === 'function') props.onChange(event.target.value, event)
      }
      const HostInput = ui !== null && ui !== undefined && ui.Input !== undefined
        && ui.Input !== null
        && (typeof ui.Input === 'function' || (typeof ui.Input === 'object' && ui.Input.$$typeof))
        ? ui.Input
        : null
      if (HostInput !== null) {
        return h(HostInput, {
          ref,
          ...(controlled ? { value } : { defaultValue: props.defaultValue }),
          type: props.type === undefined ? 'text' : props.type,
          placeholder: props.placeholder,
          disabled: props.disabled === true,
          readOnly: props.readOnly === true,
          autoFocus: props.autoFocus === true,
          min: props.min,
          max: props.max,
          step: props.step,
          inputMode: props.inputMode,
          title: props.title,
          'aria-label': props['aria-label'],
          onChange: change,
          onKeyDown: props.onKeyDown,
          onBlur: props.onBlur,
          className: 'md-kit-input',
        })
      }
      return h('span', { className: `md-kit-input${props.className === undefined ? '' : ` ${props.className}`}` },
        h('input', {
          ref,
          className: props.className,
          type: props.type === undefined ? 'text' : props.type,
          ...(controlled ? { value } : { defaultValue: props.defaultValue }),
          placeholder: props.placeholder,
          disabled: props.disabled === true,
          readOnly: props.readOnly === true,
          autoFocus: props.autoFocus === true,
          min: props.min,
          max: props.max,
          step: props.step,
          inputMode: props.inputMode,
          title: props.title,
          'aria-label': props['aria-label'],
          onChange: change,
          onKeyDown: props.onKeyDown,
          onBlur: props.onBlur,
        })
      )
    })

    /**
     * Modal adapter: host Modal owns the portal, focus trap, Escape and scrim;
     * the fallback keeps the workbench shell.
     */
    function KitModal(props) {
      const ui = useHostUi()
      const HostModal = ui !== null && ui !== undefined && typeof ui.Modal === 'function' ? ui.Modal : null
      if (HostModal !== null) {
        return h(HostModal, {
          open: true,
          onClose: props.onClose,
          title: props.title,
          closeLabel: format('modalClose'),
          headless: props.headless === true,
          className: props.className,
          contentClassName: props.contentClassName,
          children: props.children,
          footer: props.footer,
        })
      }
      return h('div', {
        className: 'md-env-backdrop',
        role: 'presentation',
        onClick: event => {
          if (event.target === event.currentTarget && typeof props.onClose === 'function') props.onClose()
        },
      },
        h('div', {
          className: `md-env-dialog${props.className === undefined ? '' : ` ${props.className}`}`,
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': props.title ?? '',
        },
          h('div', { className: 'md-modal-head' },
            h('h3', { className: 'md-env-title' }, props.title ?? ''),
            typeof props.onClose !== 'function'
              ? null
              : h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
                'aria-label': format('modalClose'), title: format('modalClose'),
                onClick: props.onClose,
              }, '×')
          ),
          h('div', { className: 'md-modal-body' }, props.children),
          props.footer === undefined || props.footer === null
            ? null
            : h('div', { className: 'md-modal-foot' }, props.footer)
        )
      )
    }

    /**
     * Select adapter: host Menu with a button anchor; fallback list stays local.
     * @param {{ value: string, label: string, placeholder?: string, options: object[], disabled?: boolean, onChange: Function }} props - select state.
     * @returns {import('react').ReactElement} the select.
     */
    function KitSelect(props) {
      const ui = useHostUi()
      const [open, setOpen] = React.useState(false)
      const rootRef = React.useRef(null)
      React.useEffect(() => {
        if (!open) return undefined
        const onPointer = event => {
          if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false)
        }
        const onKey = event => {
          if (event.key === 'Escape') setOpen(false)
        }
        window.addEventListener('pointerdown', onPointer)
        window.addEventListener('keydown', onKey)
        return () => {
          window.removeEventListener('pointerdown', onPointer)
          window.removeEventListener('keydown', onKey)
        }
      }, [open])
      const options = Array.isArray(props.options) ? props.options : []
      const value = props.value === undefined || props.value === null ? '' : String(props.value)
      const current = options.find(option => String(option.value) === value)
      const label = current === undefined ? (props.placeholder === undefined ? '' : props.placeholder) : current.label
      const trigger = h(KitButton, {
        className: `md-btn md-btn-small${props.className === undefined ? '' : ` ${props.className}`}`,
        variant: 'outline',
        disabled: props.disabled === true,
        title: props.title,
        onClick: () => setOpen(value => !value),
        'aria-label': props.label,
        'aria-expanded': open ? 'true' : 'false',
        'aria-haspopup': 'listbox',
      }, label)
      const HostMenu = ui !== null && ui !== undefined && ui.Menu !== undefined
        && (typeof ui.Menu === 'function' || (typeof ui.Menu === 'object' && ui.Menu.$$typeof))
        ? ui.Menu
        : null
      if (HostMenu !== null) {
        return h(HostMenu, {
          open,
          anchor: trigger,
          items: options.map(option => ({
            id: String(option.value),
            label: option.label,
            disabled: option.disabled === true,
          })),
          selectedId: value,
          onSelect: id => {
            setOpen(false)
            if (typeof props.onChange === 'function') props.onChange(id)
          },
          onClose: () => setOpen(false),
          side: 'bottom',
          align: 'start',
          portal: true,
          compact: true,
        })
      }
      return h('span', { className: 'md-kit-select', ref: rootRef },
        trigger,
        open
          ? h('div', { className: 'md-kit-select-menu', role: 'listbox', 'aria-label': props.label },
            options.map(option => h(KitButton, {
              key: String(option.value),
              type: 'button',
              className: 'md-kit-select-option',
              role: 'option',
              'aria-selected': String(option.value) === value ? 'true' : 'false',
              disabled: option.disabled === true,
              onClick: () => {
                setOpen(false)
                if (typeof props.onChange === 'function') props.onChange(String(option.value))
              },
            }, option.label)))
          : null
      )
    }

    function SettingsDialog(props) {
      const hostUi = useHostUi()
      const envTools = props.envTools ?? { python: false, tex: false, apiKey: false }
      // The dialog is paged: reading switches, the keyboard table, the toolchain
      // check, and the about/update row. Tabs keep it from becoming a long scroll.
      const [tab, setTab] = useState(props.initialTab ?? 'reading')
      const [apiKey, setApiKey] = useState('')
      const [apiKeyNote, setApiKeyNote] = useState('')
      const [bindings, setBindingsState] = useState(() => readShortcutBindings())
      // The action being recorded; a key press fills it, Escape cancels.
      const [listening, setListening] = useState('')
      // Optional handwriting font: downloaded or imported on demand.
      const [font, setFont] = useState(null)
      const [fontBusy, setFontBusy] = useState(false)
      const [fontNote, setFontNote] = useState('')
      const fontInput = useRef(null)
      useEffect(() => {
        request('GET', 'font')
          .then(payload => {
            setFont(payload !== null && typeof payload === 'object'
              ? { installed: payload.installed === true, bytes: Number(payload.bytes) || 0 }
              : { installed: false, bytes: 0 })
          })
          .catch(() => setFont({ installed: false, bytes: 0 }))
      }, [])
      const fontAction = async (action, data) => {
        setFontBusy(true)
        setFontNote('')
        try {
          const payload = await request('POST', 'font', { action, data })
          const state = {
            installed: payload !== null && payload.installed === true,
            bytes: payload === null || payload === undefined ? 0 : Number(payload.bytes) || 0,
          }
          setFont(state)
          await refreshXiaolaiFont()
          if (action === 'download' && state.installed) {
            setFontNote(format('fontDownloaded', { mb: (state.bytes / 1048576).toFixed(1) }))
          } else if (action === 'install' && state.installed) {
            setFontNote(format('fontImported'))
          } else if (action === 'remove') {
            setFontNote(format('fontRemovedNote'))
          }
        } catch (error) {
          window.alert(`${format('fontFailed')} (${error !== null && error !== undefined && error.message ? error.message : String(error)})`)
        } finally {
          setFontBusy(false)
        }
      }
      const importFont = async event => {
        const file = event.target.files !== undefined && event.target.files.length > 0 ? event.target.files[0] : null
        event.target.value = ''
        if (file === null || file === undefined) return
        setFontBusy(true)
        try {
          const data = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              const result = String(reader.result ?? '')
              resolve(result.slice(result.indexOf(',') + 1))
            }
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(file)
          })
          setFontBusy(false)
          await fontAction('install', data)
        } catch (error) {
          setFontBusy(false)
          window.alert(`${format('fontFailed')} (${error !== null && error !== undefined && error.message ? error.message : String(error)})`)
        }
      }
      // Data migration: pack on this machine, inspect/import a local ZIP path.
      const [dataBusy, setDataBusy] = useState('')
      const [dataBackup, setDataBackup] = useState(null)
      const [dataPath, setDataPath] = useState('')
      const [dataInfo, setDataInfo] = useState(null)
      const [dataRoots, setDataRoots] = useState({})
      const [dataStrategy, setDataStrategy] = useState('merge')
      const [dataReport, setDataReport] = useState(null)
      const [backupFonts, setBackupFonts] = useState(false)
      const [backupProjcache, setBackupProjcache] = useState(false)
      const [backupSettings, setBackupSettings] = useState(false)
      const dataFail = error => {
        window.alert(`${format('dataFailed')} (${error !== null && error !== undefined && error.message ? error.message : String(error)})`)
      }
      const createDataBackup = async () => {
        setDataBusy('create')
        setDataReport(null)
        try {
          const settings = {}
          if (backupSettings) {
            try {
              for (let index = 0; index < window.localStorage.length; index += 1) {
                const key = window.localStorage.key(index)
                if (typeof key === 'string' && key.startsWith('pdfdesk:')) {
                  settings[key] = window.localStorage.getItem(key) ?? ''
                }
              }
            } catch {
              // storage unavailable: the backup still covers the Host data
            }
          }
          const payload = await request('POST', 'backup', {
            action: 'create',
            include: { fonts: backupFonts, projcache: backupProjcache, settings: backupSettings },
            settings,
          })
          setDataBackup(payload)
        } catch (error) {
          dataFail(error)
        } finally {
          setDataBusy('')
        }
      }
      const inspectDataBackup = async () => {
        setDataBusy('inspect')
        setDataInfo(null)
        setDataReport(null)
        try {
          const payload = await request('POST', 'backup', { action: 'inspect', path: dataPath.trim() })
          const manifest = payload !== null && payload !== undefined ? payload.manifest : null
          setDataInfo(manifest)
          const roots = {}
          const libraries = manifest !== null && manifest.paths !== null && typeof manifest.paths === 'object'
            ? manifest.paths.libraries ?? {}
            : {}
          for (const id of Object.keys(libraries)) roots[id] = ''
          setDataRoots(roots)
        } catch (error) {
          dataFail(error)
        } finally {
          setDataBusy('')
        }
      }
      const runDataImport = async () => {
        if (dataStrategy === 'overwrite' && typeof window !== 'undefined' && typeof window.confirm === 'function'
          && !window.confirm(format('dataOverwriteConfirm'))) return
        setDataBusy('import')
        try {
          const payload = await request('POST', 'backup', {
            action: 'import',
            path: dataPath.trim(),
            strategy: dataStrategy,
            libraryRoots: dataRoots,
          })
          setDataReport(payload !== null && payload !== undefined ? payload.report : null)
        } catch (error) {
          dataFail(error)
        } finally {
          setDataBusy('')
        }
      }
      const [bookPath, setBookPath] = useState('')
      const [bookTarget, setBookTarget] = useState('fragments')
      const [bookSubdir, setBookSubdir] = useState('')
      const [bookReport, setBookReport] = useState(null)
      const runBookImport = async () => {
        if (dataStrategy === 'overwrite' && typeof window !== 'undefined' && typeof window.confirm === 'function'
          && !window.confirm(format('bookOverwriteConfirm'))) return
        setDataBusy('book')
        setBookReport(null)
        try {
          const payload = await request('POST', 'library-import', {
            path: bookPath.trim(),
            target: bookTarget,
            subdir: bookSubdir.trim(),
            strategy: dataStrategy,
          })
          setBookReport(payload !== null && payload !== undefined ? payload.report : null)
        } catch (error) {
          dataFail(error)
        } finally {
          setDataBusy('')
        }
      }
      const applyImportedSettings = async () => {
        try {
          const payload = await request('GET', 'backup/settings')
          const settings = payload !== null && payload !== undefined && payload.settings !== null && typeof payload.settings === 'object'
            ? payload.settings
            : {}
          const keys = Object.keys(settings).filter(key => key.startsWith('pdfdesk:'))
          if (keys.length === 0) {
            window.alert(format('dataNoSettings'))
            return
          }
          let applied = 0
          for (const key of keys) {
            try {
              window.localStorage.setItem(key, String(settings[key]))
              applied += 1
            } catch {
              // storage unavailable for this key
            }
          }
          window.alert(format('dataApplied', { n: applied }))
        } catch (error) {
          dataFail(error)
        }
      }
      useEffect(() => {
        request('GET', 'deepseek-key')
          .then(payload => setApiKeyNote(payload !== null && payload.configured === true ? format('apiKeyConfigured') : format('apiKeyMissing')))
          .catch(() => {})
      }, [])
      useEffect(() => {
        if (listening === '') return undefined
        const onKey = event => {
          event.preventDefault()
          event.stopPropagation()
          if (event.key === 'Escape') {
            setListening('')
            return
          }
          saveBinding(listening, [bindingOf(event)])
          setListening('')
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
      }, [listening])
      const saveBinding = (id, list) => {
        const next = { ...bindings, [id]: list }
        setBindingsState(next)
        writeShortcutBindings(next)
      }
      const saveApiKey = async () => {
        try {
          const payload = await request('POST', 'deepseek-key', { key: apiKey })
          const configured = payload !== null && payload.configured === true
          setApiKeyNote(configured ? format('apiKeyConfigured') : format('apiKeyMissing'))
          setApiKey('')
          if (typeof props.onApiKeyChange === 'function') props.onApiKeyChange(configured)
        } catch (error) {
          setApiKeyNote(error !== null && error !== undefined && error.message ? String(error.message) : String(error))
        }
      }
      const openLink = url => {
        try {
          const opened = window.open(url, '_blank', 'noopener')
          if (opened !== null && opened !== undefined) return
        } catch {
          // popup blocked: fall through to an anchor click
        }
        try {
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.target = '_blank'
          anchor.rel = 'noopener noreferrer'
          document.body.appendChild(anchor)
          anchor.click()
          anchor.remove()
        } catch {
          // truly blocked (no window): nothing else to try
        }
      }
      const tabs = [
        { id: 'reading', label: format('settingsTabReading') },
        { id: 'workflow', label: format('settingsTabWorkflow') },
        { id: 'keys', label: format('settingsTabKeys') },
        { id: 'env', label: format('settingsTabEnv') },
        { id: 'data', label: format('settingsTabData') },
        { id: 'about', label: format('settingsTabAbout') },
      ]
      const reading = h(React.Fragment, null,
        h('div', { className: 'md-settings-section' },
          h('h4', { className: 'md-settings-heading' }, format('settingsFeatures')),
          h('div', { className: 'md-settings-row' },
            h('span', null, format('previewPdf')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              onClick: props.onPreview,
            }, props.previewPdf ? format('previewOn') : format('previewOff'))
          ),
          h('div', { className: 'md-settings-row' },
            h('span', null, format('deleteNonPdf')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              onClick: props.onNonPdf,
            }, props.allowNonPdfDelete ? format('previewOn') : format('previewOff'))
          ),
          h('div', { className: 'md-settings-row' },
            h('span', { title: format('socraticHint') }, format('socraticToggle')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              title: format('socraticHint'),
              onClick: props.onSocratic,
            }, props.socratic ? format('previewOn') : format('previewOff'))
          ),
          h('div', { className: 'md-settings-row' },
            h('span', null, format('toolRail')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              onClick: props.onRailSide,
            }, props.railSide === 'left' ? format('railLeft') : format('railRight'))
          ),
          h('div', { className: 'md-settings-row' },
            h('span', null, format('sketchRoughness')),
            h('input', {
              type: 'range', min: 0, max: 2, step: 0.1,
              value: props.roughness ?? 1,
              'aria-label': format('sketchRoughness'),
              onChange: event => props.onRoughness(Number(event.target.value)),
            }),
            h('span', { className: 'md-note-size-value' }, Number(props.roughness ?? 1).toFixed(1))
          ),
          h('div', { className: 'md-settings-row' },
            h('span', { title: format('fontHint') }, format('fontTitle')),
            h('span', { className: 'md-settings-note' },
              font === null
                ? ''
                : font.installed
                  ? format('fontInstalled', { mb: (font.bytes / 1048576).toFixed(1) })
                  : format('fontMissing')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              disabled: fontBusy === true || font === null,
              onClick: () => {
                if (typeof window !== 'undefined' && typeof window.confirm === 'function'
                  && !window.confirm(format('fontDownloadConfirm'))) return
                void fontAction('download')
              },
            }, font !== null && font.installed ? format('fontRedownload') : format('fontDownload')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              disabled: fontBusy === true,
              onClick: () => { if (fontInput.current !== null) fontInput.current.click() },
            }, format('fontImport')),
            font !== null && font.installed
              ? h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small',
                disabled: fontBusy === true,
                onClick: () => fontAction('remove'),
              }, format('fontRemove'))
              : null,
            h('input', {
              ref: fontInput,
              type: 'file',
              accept: '.ttf,.otf',
              style: { display: 'none' },
              onChange: importFont,
            })
          ),
          fontNote === ''
            ? null
            : h('p', { className: 'md-settings-note', role: 'status' }, fontNote)
        ),
        h('div', { className: 'md-settings-section' },
          h('h4', { className: 'md-settings-heading' }, format('settingsNotesTitle')),
          h('p', { className: 'md-shelf-sub' }, format('settingsNotesHint')),
          h('div', { className: 'md-settings-row' },
            h('span', { title: format('sharedPrefixClearHint') }, format('sharedPrefixClear')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              title: format('sharedPrefixClearHint'),
              onClick: props.onClearSharedPrefix,
            }, format('sharedPrefixClearAction'))
          )
        )
      )
      const workflow = h(React.Fragment, null,
        h('div', { className: 'md-settings-section' },
        h('h4', { className: 'md-settings-heading' }, format('workflowTitle')),
        h('p', { className: 'md-shelf-sub' }, format('workflowHint')),
        h('div', {
          className: 'md-workflow-base',
        },
          h('span', { className: 'md-mode-pill', 'data-mode': 'general' }, format('workflowGeneral')),
          h('span', { className: 'md-shelf-sub' }, format('workflowGeneralDesc')),
          h('span', { className: 'md-workflow-always' }, format('workflowGeneralAlways'))
        ),
        WORKFLOWS.map(item => h('div', {
          key: item.id,
          className: 'md-workflow-card',
          'data-active': props.activeWorkflow === item.id ? 'true' : 'false',
          role: 'switch',
          tabIndex: 0,
          'aria-checked': props.activeWorkflow === item.id ? 'true' : 'false',
          title: props.activeWorkflow === item.id ? format('workflowActiveHint') : undefined,
          onClick: () => {
            if (typeof props.onWorkflowChange === 'function') {
              props.onWorkflowChange(props.activeWorkflow === item.id ? '' : item.id)
            }
          },
          onKeyDown: event => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            if (typeof props.onWorkflowChange === 'function') {
              props.onWorkflowChange(props.activeWorkflow === item.id ? '' : item.id)
            }
          },
        },
          h('span', {
            className: 'md-workflow-dot',
            'data-on': props.activeWorkflow === item.id ? 'true' : 'false',
            'aria-hidden': 'true',
          }),
          h('span', { className: 'md-workflow-text' },
            h('strong', null, format(item.labelKey)),
            h('span', null, format(item.descKey))
          )
        )),
        h('p', { className: 'md-shelf-sub' }, format('workflowOnlyOne'))
      ),
        h('div', { className: 'md-settings-section' },
          h('h4', { className: 'md-settings-heading' }, format('pressureTitle')),
          h('p', { className: 'md-shelf-sub' }, format('pressureHint')),
          h(PressurePad, null)
        ),
        h('div', { className: 'md-settings-section' },
          h('h4', { className: 'md-settings-heading' }, format('questionsTitle')),
          h('div', { className: 'md-settings-row' },
            h('span', { title: format('questionInjectHint') }, format('questionInjectToggle')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              title: format('questionInjectHint'),
              'aria-pressed': props.questionInject ? 'true' : 'false',
              onClick: props.onQuestionInject,
            }, props.questionInject ? format('previewOn') : format('previewOff'))
          ),
          h('p', { className: 'md-shelf-sub' }, format('questionInjectHint'))
        )
      )
      const keys = h('div', { className: 'md-settings-section' },
        h('h4', { className: 'md-settings-heading' }, format('shortcutsTitle')),
        h('p', { className: 'md-shelf-sub' }, format('shortcutsHint')),
        listening === ''
          ? null
          : h('p', { className: 'md-settings-note', role: 'status' }, format('shortcutsListening', { action: format(SHORTCUT_ACTIONS.find(item => item.id === listening)?.labelKey ?? 'shortcutsTitle') })),
        h('div', { className: 'md-shortcut-list' },
          SHORTCUT_ACTIONS.map(action => h('div', { className: 'md-settings-row md-shortcut-row', key: action.id },
            h('span', { className: 'md-shortcut-name' }, format(action.labelKey)),
            h('span', { className: 'md-shortcut-key' }, listening === action.id ? format('shortcutsRecording') : bindingLabel(bindings[action.id])),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              'aria-pressed': listening === action.id ? 'true' : 'false',
              onClick: () => setListening(listening === action.id ? '' : action.id),
            }, listening === action.id ? format('shortcutsCancel') : format('shortcutsRecord')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              disabled: bindingList(bindings[action.id]).length === 0,
              onClick: () => saveBinding(action.id, []),
            }, format('shortcutsClear'))
          ))
        ),
        h('div', { className: 'md-settings-actions' },
          h(KitButton, {
            type: 'button', className: 'md-btn md-btn-small',
            onClick: () => {
              const defaults = {}
              for (const action of SHORTCUT_ACTIONS) defaults[action.id] = bindingList(action.fallback).map(item => ({ ...item }))
              setBindingsState(defaults)
              writeShortcutBindings(defaults)
            },
          }, format('shortcutsRestore')),
          h(KitButton, {
            type: 'button', className: 'md-btn md-btn-small',
            onClick: () => {
              const empty = {}
              for (const action of SHORTCUT_ACTIONS) empty[action.id] = []
              setBindingsState(empty)
              writeShortcutBindings(empty)
            },
          }, format('shortcutsClearAll'))
        )
      )
      const env = h(React.Fragment, null,
        h('div', { className: 'md-settings-section' },
          h('h4', { className: 'md-settings-heading' }, format('envTitle')),
          h('div', { className: 'md-settings-row' },
            h('span', null, `${format('envPython')}：${envTools.python ? format('envOn') : format('envOff')}（${format('envPythonSize')}）`),
            envTools.python ? null : h(KitButton, { type: 'button', className: 'md-btn md-btn-small', onClick: () => openLink('https://www.python.org/downloads/windows/') }, format('envDownload'))
          ),
          h('div', { className: 'md-settings-row' },
            h('span', null, `${format('envTex')}：${envTools.tex ? format('envOn') : format('envOff')}（${format('envTexSize')}）`),
            envTools.tex ? null : h(KitButton, { type: 'button', className: 'md-btn md-btn-small', onClick: () => openLink(TEXLIVE_URL) }, format('envDownload'))
          ),
          h('p', { className: 'md-shelf-sub' }, format('envImpact')),
          h('p', { className: 'md-shelf-sub' }, `${format('apiKeyTitle')}：${envTools.apiKey ? format('apiKeyConfigured') : format('apiKeyMissing')}`)
        ),
        h('div', { className: 'md-settings-section' },
          h('h4', { className: 'md-settings-heading' }, format('apiKeyTitle')),
          h('p', { className: 'md-shelf-sub' }, apiKeyNote),
          h('div', { className: 'md-settings-row' },
            h(KitInput, {
              className: 'md-settings-input', type: 'password',
              value: apiKey, placeholder: 'sk-...',
              onChange: value => setApiKey(value),
            }),
            h(KitButton, { type: 'button', className: 'md-btn md-btn-small', onClick: () => { void saveApiKey() } }, format('apiKeySave'))
          )
        )
      )
      // A prefilled GitHub issue: version + system only, never files or local
      // paths. The user reviews and submits it in the browser.
      const openFeedback = () => {
        const body = [
          `### ${format('feedbackBodyVersion')}`,
          typeof props.version === 'string' ? props.version : '',
          '',
          `### ${format('feedbackBodyEnv')}`,
          typeof navigator === 'object' && navigator !== null ? String(navigator.userAgent ?? '') : '',
          '',
          `### ${format('feedbackBodyDesc')}`,
          '',
          '',
          `### ${format('feedbackBodySteps')}`,
          '1. ',
          '',
          `> ${format('feedbackBodyNote')}`,
        ].join('\n')
        openLink(`${GITHUB_URL}/issues/new?title=${encodeURIComponent(format('feedbackTitle'))}&body=${encodeURIComponent(body)}`)
      }
      const about = h('div', { className: 'md-settings-section' },
        h('h4', { className: 'md-settings-heading' }, format('githubRepo')),
        h(KitButton, {
          type: 'button', className: 'md-btn md-btn-small',
          onClick: () => openLink(GITHUB_URL),
        }, format('githubRepo')),
        h(KitButton, {
          type: 'button', className: 'md-btn md-btn-small',
          title: format('feedbackHint'),
          onClick: openFeedback,
        }, format('feedbackIssue')),
        h(KitButton, {
          className: 'md-btn md-btn-small', disabled: props.updateBusy === true,
          title: format('updateHint'),
          onClick: props.onCheckUpdate,
        }, props.updateBusy === true ? format('updateChecking') : format('updateCheck')),
        props.updateInfo === null
          ? null
          : h('div', { className: 'md-update-box' },
            h('p', { className: 'md-shelf-sub' },
              `v${props.updateInfo.current} → v${props.updateInfo.version}`),
            props.marketUpdate !== null
              ? h(KitButton, {
                className: 'md-btn md-btn-small',
                disabled: props.updateBusy === true,
                onClick: props.onInstallUpdate,
              }, format('updateNow'))
              : h('a', {
                className: 'md-btn md-btn-small',
                href: props.updateInfo.download,
                target: '_blank',
                rel: 'noreferrer',
                title: format('updateDownloadOnly'),
              }, format('updateNow')),
            h('p', { className: 'md-shelf-sub' },
              props.marketUpdate !== null ? format('updateHint') : format('updateDownloadOnly'))
          ),
        props.updateOperation === null
          ? null
          : h('p', { className: 'md-settings-note', role: 'status' }, props.updateOperation.message),
        h('p', { className: 'md-shelf-sub' }, hostUi !== null ? format('hostUiLoaded') : format('hostUiFallback'))
      )
      const data = h(React.Fragment, null,
        h('div', { className: 'md-settings-section' },
          h('h4', { className: 'md-settings-heading' }, format('dataTitle')),
          h('p', { className: 'md-shelf-sub' }, format('dataHint')),
          dataBusy === ''
            ? null
            : h('div', { className: 'md-data-progress', role: 'status', 'aria-label': format('dataWorking') },
              h('span', { className: 'md-data-progress-bar' })),
          h('div', { className: 'md-settings-row' },
            h('label', null,
              h('input', {
                type: 'checkbox',
                checked: backupFonts,
                onChange: event => setBackupFonts(event.target.checked),
              }),
              ` ${format('dataFonts')}`),
            h('label', null,
              h('input', {
                type: 'checkbox',
                checked: backupProjcache,
                onChange: event => setBackupProjcache(event.target.checked),
              }),
              ` ${format('dataProjcache')}`),
            h('label', null,
              h('input', {
                type: 'checkbox',
                checked: backupSettings,
                onChange: event => setBackupSettings(event.target.checked),
              }),
              ` ${format('dataSettings')}`)
          ),
          h('div', { className: 'md-settings-row' },
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              disabled: dataBusy === 'create',
              onClick: createDataBackup,
            }, format('dataBackup')),
            dataBackup === null
              ? null
              : h('a', {
                className: 'md-btn md-btn-small',
                href: dataBackup.download,
                download: dataBackup.name,
              }, format('dataDownload'))
          ),
          dataBackup === null
            ? null
            : h('p', { className: 'md-shelf-sub' },
              format('dataBackupCreated', {
                name: dataBackup.name,
                files: dataBackup.files,
                mb: (Number(dataBackup.bytes) / 1048576).toFixed(1),
              }))
        ),
        h('div', { className: 'md-settings-section' },
          h('h4', { className: 'md-settings-heading' }, format('dataImportTitle')),
          h('p', { className: 'md-shelf-sub' }, format('dataImportHint')),
          h('div', { className: 'md-settings-row' },
            h('input', {
              className: 'md-settings-input', type: 'text',
              value: dataPath,
              placeholder: 'D:\\backup\\dsh-workbench-backup-....zip',
              onChange: event => setDataPath(event.target.value),
            }),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              disabled: dataBusy === 'inspect' || dataPath.trim() === '',
              onClick: inspectDataBackup,
            }, format('dataInspect'))
          ),
          dataInfo === null
            ? null
            : h(React.Fragment, null,
              h('p', { className: 'md-shelf-sub' },
                `v${dataInfo.plugin !== null && dataInfo.plugin !== undefined ? dataInfo.plugin.version : '?'} · ${new Date(dataInfo.createdAt).toLocaleString()} · ${dataInfo.files} files`),
              Object.keys(dataInfo.paths !== null && typeof dataInfo.paths === 'object' && dataInfo.paths.libraries !== null && typeof dataInfo.paths.libraries === 'object' ? dataInfo.paths.libraries : {})
                .map(id => h('div', { className: 'md-settings-row', key: id },
                  h('span', null, format('dataRootHint', { id })),
                  h('input', {
                    className: 'md-settings-input', type: 'text',
                    value: dataRoots[id] ?? '',
                    onChange: event => setDataRoots(current => ({ ...current, [id]: event.target.value })),
                  })
                )),
              h('div', { className: 'md-settings-row' },
                h('span', null, format('dataStrategy')),
                h('select', {
                  className: 'md-settings-input',
                  value: dataStrategy,
                  onChange: event => setDataStrategy(event.target.value),
                },
                  h('option', { value: 'merge' }, format('dataMerge')),
                  h('option', { value: 'overwrite' }, format('dataOverwrite')),
                  h('option', { value: 'skip' }, format('dataSkip'))),
                h(KitButton, {
                  type: 'button', className: 'md-btn md-btn-small',
                  disabled: dataBusy === 'import',
                  onClick: runDataImport,
                }, format('dataImport'))
              )
            ),
          dataReport === null
            ? null
            : h('p', { className: 'md-settings-note' },
              format('dataReport', {
                imported: Array.isArray(dataReport.imported) ? dataReport.imported.length : 0,
                renamed: Array.isArray(dataReport.renamed) ? dataReport.renamed.length : 0,
                skipped: Array.isArray(dataReport.skipped) ? dataReport.skipped.length : 0,
                rewritten: Array.isArray(dataReport.rewrittenLibraries) ? dataReport.rewrittenLibraries.length : 0,
              }))
          ,
          dataReport === null
            ? null
            : h('div', { className: 'md-settings-row' },
              h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small',
                onClick: applyImportedSettings,
              }, format('dataApplySettings')))
        ),
        h('div', { className: 'md-settings-section' },
          h('h4', { className: 'md-settings-heading' }, format('dataBookTitle')),
          h('p', { className: 'md-shelf-sub' }, format('dataBookHint')),
          h('div', { className: 'md-settings-row' },
            h('input', {
              className: 'md-settings-input', type: 'text',
              value: bookPath,
              placeholder: 'D:\\books\\chapters.zip',
              onChange: event => setBookPath(event.target.value),
            }),
            h('select', {
              className: 'md-settings-input',
              value: bookTarget,
              onChange: event => setBookTarget(event.target.value),
            },
              h('option', { value: 'fragments' }, format('dataBookFragments')),
              h('option', { value: 'whole' }, format('dataBookWhole'))),
            h('input', {
              className: 'md-settings-input', type: 'text',
              value: bookSubdir,
              placeholder: format('dataBookSubdirPh'),
              onChange: event => setBookSubdir(event.target.value),
            }),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              disabled: dataBusy === 'book' || bookPath.trim() === '',
              onClick: runBookImport,
            }, format('dataBookImport'))
          ),
          bookReport === null
            ? null
            : h('p', { className: 'md-settings-note' },
              format('dataBookReport', {
                imported: Array.isArray(bookReport.imported) ? bookReport.imported.length : 0,
                renamed: Array.isArray(bookReport.renamed) ? bookReport.renamed.length : 0,
                skipped: Array.isArray(bookReport.skipped) ? bookReport.skipped.length : 0,
                warnings: Array.isArray(bookReport.warnings) ? bookReport.warnings.length : 0,
              }))
        )
      )
      return h(KitModal, {
        title: format('settings'),
        onClose: props.onClose,
        className: 'md-settings-modal',
        contentClassName: 'md-settings-content',
        children: h(React.Fragment, null,
          h('div', { className: 'md-settings-meta' },
            h('span', { className: 'md-settings-version' }, `${format('version')} ${props.version}`),
            h('span', { className: 'md-shelf-sub' }, hostUi !== null ? format('hostUiLoaded') : format('hostUiFallback'))
          ),
          h('div', { className: 'md-settings-body' },
            h('div', { className: 'md-settings-nav', role: 'tablist' },
              tabs.map(item => h(KitButton, {
                key: item.id,
                type: 'button',
                role: 'tab',
                className: 'md-btn md-btn-small md-tab-btn',
                'data-on': tab === item.id ? 'true' : 'false',
                'aria-selected': tab === item.id ? 'true' : 'false',
                onClick: () => setTab(item.id),
              }, item.label))
            ),
            h('div', { className: 'md-settings-pane' },
              tab === 'reading' ? reading : tab === 'workflow' ? workflow : tab === 'keys' ? keys : tab === 'env' ? env : tab === 'data' ? data : about
            )
          )
        ),
      })
    }

    /**
     * The library page: choose/add/switch libraries, read the format manual, and
     * start a split conversation with the toolkit already in the library.
     * @param {{ libraries: object[], activeId: string, busy: boolean, error: string, libraryDir: string, sample: object | null, sampleBusy: boolean, onUse: Function, onRemove: Function, onAdd: Function, onPick: Function, onSplit: Function, onLoadSample: Function }} props - libraries and handlers.
     * @returns {import('react').ReactElement} the page.
     */
    /**
     * The pixel whale in the library hero. A few blocky cells are enough to read
     * as the DeepSeek whale; it drifts slowly and never takes pointer events.
     * @returns {import('react').ReactElement} the background whale.
     */
    function PixelWhale() {
      const cells = [
        [4, 8, 2, 3], [6, 7, 3, 5], [9, 6, 9, 6], [18, 6, 4, 5], [22, 7, 2, 4],
        [24, 8, 2, 2], [26, 5, 2, 5], [28, 3, 2, 4], [28, 12, 2, 3],
        [6, 4, 1, 2], [5, 2, 1, 2], [7, 3, 1, 1],
        [12, 12, 4, 1], [14, 13, 2, 1],
        [2, 14, 1, 1], [9, 15, 1, 1], [20, 15, 1, 1], [27, 15, 1, 1],
      ]
      return h('svg', {
        className: 'md-hero-whale',
        viewBox: '0 0 32 18',
        'aria-hidden': 'true',
        focusable: 'false',
      },
        h('g', { fill: 'currentColor' },
          cells.map((cell, index) => h('rect', {
            key: index,
            x: cell[0],
            y: cell[1],
            width: cell[2] ?? 1,
            height: cell[3] ?? 1,
          }))))
    }

    function LibrariesPage(props) {
      const envTools = props.envTools ?? { python: false, tex: false, apiKey: false }
      const [dir, setDir] = useState('')
      const [name, setName] = useState('')
      const [confirmId, setConfirmId] = useState('')
      const [showLocalPath, setShowLocalPath] = useState(false)
      const clickTimer = useRef(null)
      const busy = props.busy
      const sectionRef = useRef(null)
      const addRef = useRef(null)
      const manualRef = useRef(null)
      const [stuck, setStuck] = useState(false)
      const [manualOpen, setManualOpen] = useState(false)
      useEffect(() => {
        const section = sectionRef.current
        const scroller = section === null ? null : section.closest('.md-body')
        if (scroller === null) return undefined
        const onScroll = () => setStuck(scroller.scrollTop > 140)
        scroller.addEventListener('scroll', onScroll, { passive: true })
        onScroll()
        return () => scroller.removeEventListener('scroll', onScroll)
      }, [])
      const scrollToAdd = () => {
        setManualOpen(false)
        addRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      const scrollToManual = () => {
        setManualOpen(true)
        window.setTimeout(() => manualRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
      }
      // A single click switches the library; a double click enters its shelf. The
      // switch waits briefly so the second click can cancel it instead of racing it.
      const scheduleSwitch = id => {
        trace('row click', id)
        if (clickTimer.current !== null) window.clearTimeout(clickTimer.current)
        clickTimer.current = window.setTimeout(() => {
          clickTimer.current = null
          props.onUse(id, { enter: false })
        }, 220)
      }
      const enterNow = id => {
        trace('row dblclick', id)
        if (clickTimer.current !== null) {
          window.clearTimeout(clickTimer.current)
          clickTimer.current = null
        }
        props.onUse(id, { enter: true })
      }
      useEffect(() => () => {
        if (clickTimer.current !== null) window.clearTimeout(clickTimer.current)
      }, [])
      return h('section', { className: 'md-libraries md-home', ref: sectionRef, 'aria-label': format('librariesTitle') },
        h(PixelWhale),
        h('div', { className: `md-home-toolbar${stuck ? ' is-stuck' : ''}` },
          h(KitButton, {
            type: 'button', className: 'md-btn md-btn-small md-btn-primary', disabled: busy,
            onClick: scrollToAdd,
          }, format('libraryAddTitle')),
          h(KitButton, { type: 'button', className: 'md-btn md-btn-small', onClick: scrollToManual }, format('manualTitle')),
          h('span', { className: 'md-home-toolbar-count' }, format('heroMeta', { n: props.libraries.length }))
        ),
        h('header', { className: 'md-hero' },
          h('p', { className: 'md-hero-eyebrow' }, format('heroEyebrow')),
          h('h1', { className: 'md-hero-title' }, format('heroTitle')),
          h('p', { className: 'md-hero-lead' }, format('heroLead')),
          h('div', { className: 'md-hero-actions' },
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-primary', disabled: busy,
              onClick: scrollToAdd,
            }, format('libraryAddTitle')),
            props.libraries.length === 0
              ? null
              : h(KitButton, {
                type: 'button', className: 'md-btn',
                disabled: props.sampleBusy || busy || props.sample?.book == null,
                onClick: props.onLoadSample,
              }, props.sampleBusy ? format('sampleBusy') : format('sampleLoad')),
            h(KitButton, { type: 'button', className: 'md-btn md-btn-ghost', onClick: scrollToManual }, format('manualTitle'))
          ),
          stuck
            ? null
            : h('p', { className: 'md-hero-meta' }, props.libraries.length === 0
              ? format('heroEmpty')
              : format('heroMeta', { n: props.libraries.length }))
        ),
        h('div', { className: 'md-shelf-head' },
          h('h2', { className: 'md-heading' }, format('librariesTitle')),
          h('p', { className: 'md-shelf-sub' }, format('librariesHint'))
        ),
        props.libraries.length === 0
          ? h('p', { className: 'md-shelf-sub' }, format('librariesHint'))
          : h('ul', { className: 'md-library-list' },
            props.libraries.map(item => h('li', {
              key: item.id,
              className: item.id === props.activeId ? 'md-library md-library-active' : 'md-library',
              onClick: () => {
                if (item.id !== props.activeId) scheduleSwitch(item.id)
              },
              onDoubleClick: () => enterNow(item.id),
            },
              h('div', { className: 'md-library-head' },
                h('span', { className: 'md-library-name' }, item.name),
                item.id === props.activeId ? h('span', { className: 'md-badge' }, format('libraryActive')) : null,
                h('span', { className: 'md-badge md-badge-quiet' }, format('modeMath'))
              ),
              h('code', { className: 'md-path' }, item.libraryDir),
              h('div', { className: 'md-library-actions' },
                h(KitButton, {
                  type: 'button', className: 'md-btn md-btn-small md-btn-ghost md-icon-btn',
                  disabled: busy,
                  title: format('libraryRemove'),
                  'aria-label': format('libraryRemove'),
                  onClick: () => {
                    if (typeof window !== 'undefined' && typeof window.confirm === 'function'
                      && !window.confirm(format('libraryRemoveConfirm'))) return
                    props.onRemove(item.id)
                  },
                }, '🗑')
              )
            ))
          ),
        h('div', { className: 'md-library-add', ref: addRef },
          h('div', { className: 'md-add-head' },
            h('h3', { className: 'md-subheading' }, format('libraryAddTitle')),
            h('p', { className: 'md-shelf-sub' }, format('libraryAddHint'))
          ),
          h('div', { className: 'md-add-row' },
            h(KitInput, {
              className: 'md-input md-add-path', value: dir, disabled: busy,
              placeholder: format('addPathPlaceholder'),
              'aria-label': format('libraryPath'),
              onChange: value => setDir(value),
            }),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small', disabled: busy,
              onClick: () => {
                void props.onPick().then(picked => {
                  if (typeof picked === 'string' && picked !== '') {
                    setDir(picked)
                    if (name.trim() === '') {
                      const base = picked.split(/[\\/]/).filter(Boolean).pop()
                      if (base !== undefined) setName(base)
                    }
                  }
                })
              },
            }, format('libraryPick')),
            h(KitInput, {
              className: 'md-input md-add-name', value: name, disabled: busy,
              placeholder: format('addNamePlaceholder'),
              'aria-label': format('libraryName'),
              onChange: value => setName(value),
            }),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small md-btn-primary md-add-submit',
              disabled: busy || dir.trim() === '',
              onClick: () => props.onAdd(dir, name),
            }, format('libraryAdd'))
          )
        ),
        props.error === '' ? null : h('div', { className: 'md-alert', role: 'alert' },
          h('span', { className: 'md-alert-text' }, props.error)
        ),
        h('details', {
          className: 'md-details md-manual', ref: manualRef, open: manualOpen,
          onToggle: event => setManualOpen(event.currentTarget.open),
          style: { order: 7 },
        },
          h('summary', { className: 'md-manual-summary' },
            h('span', { className: 'md-manual-summary-main' },
              h('span', { className: 'md-manual-title' }, format('manualTitle')),
              h('span', { className: 'md-manual-sub' }, format('manualSummary'))
            ),
            h('span', { className: 'md-manual-chevron', 'aria-hidden': true }, '⌄')
          ),
          h('div', { className: 'md-manual-body' },
            h('p', { className: 'md-manual-lead' }, format('manualLead')),
            h('ol', { className: 'md-manual-steps' },
              h('li', null, format('manualStep1')),
              h('li', null, format('manualStep2')),
              h('li', null, format('manualStep3'))
            ),
            h('section', { className: 'md-manual-block' },
              h('h4', { className: 'md-manual-heading' }, format('manualStructureTitle')),
              h('pre', { className: 'md-manual-tree' }, format('manualTree', { root: props.libraryDir || '<库根>' }))
            ),
            h('section', { className: 'md-manual-block' },
              h('h4', { className: 'md-manual-heading' }, format('manualNamingTitle')),
              h('ul', { className: 'md-manual-list' },
                h('li', null, format('manualNaming1')),
                h('li', null, format('manualNaming2')),
                h('li', null, format('manualNaming3')),
                h('li', null, format('manualSessionLine'))
              )
            ),
            h('section', { className: 'md-manual-block' },
              h('h4', { className: 'md-manual-heading' }, format('manualEnvTitle')),
              h('p', { className: 'md-manual-text' }, format('manualEnvLead')),
              h('p', { className: 'md-manual-text' }, `${format('envTitle')}：${props.canRender ? format('envReady') : format('envMissing')}`),
              h('div', { className: 'md-manual-actions' },
                props.canRender ? null : h(KitButton, {
                  type: 'button', className: 'md-btn md-btn-small',
                  onClick: () => {
                    try {
                      window.open('https://tug.org/texlive/acquire.html', '_blank', 'noopener')
                    } catch {
                      // popup blocked
                    }
                  },
                }, format('envDownload')),
                h('span', { className: 'md-manual-text' }, format('envHint'))
              ),
              h('details', { className: 'md-manual-sub' },
                h('summary', { className: 'md-manual-sub-summary' }, format('aiPromptTitle')),
                h('p', { className: 'md-manual-text' }, format('aiPromptHint')),
                h('code', { className: 'md-manual-code' }, format('aiPromptText')),
                h(KitButton, {
                  type: 'button', className: 'md-btn md-btn-small',
                  onClick: props.onCopyPrompt,
                }, format('aiPromptCopy'))
              )
            ),
            h('section', { className: 'md-manual-block' },
              h('h4', { className: 'md-manual-heading' }, format('manualSourceTitle')),
              h('div', { className: 'md-manual-path' },
                h('span', { className: 'md-manual-label' }, format('libraryPath')),
                h('code', { className: 'md-path' }, props.libraryDir)
              ),
              h('p', { className: 'md-manual-text' }, format('manualSourceHint'))
            )
          )
        ),
        h('div', { className: 'md-home-tools-head' },
          h('h2', { className: 'md-heading' }, format('homeTools')),
          h('p', { className: 'md-shelf-sub' }, format('homeToolsHint'))
        ),
        h('div', { className: 'md-library-toolcell' },
        h('div', {
          className: 'md-library-toolscroll',
          onScroll: event => {
            const node = event.currentTarget
            node.classList.add('md-scrolling')
            window.clearTimeout(node.__mdScrollTimer)
            node.__mdScrollTimer = window.setTimeout(() => node.classList.remove('md-scrolling'), 350)
          },
        },
        h('h3', { className: 'md-subheading' }, format('toolbarTitle')),
        props.libraries.length === 0
          ? null
          : h('div', { className: 'md-library-samples md-tool-card' },
            h('h3', { className: 'md-subheading' }, format('sampleTitle')),
            props.sample === null
              ? h('p', { className: 'md-shelf-sub' }, format('sampleLoading'))
              : props.sample.book === null || props.sample.book === undefined
                ? h('p', { className: 'md-shelf-sub' }, format('sampleEmpty'))
                : h(React.Fragment, null,
                  h('p', { className: 'md-shelf-sub' },
                    `${props.sample.book.title} · ${format('sampleMeta', {
                      chapters: props.sample.book.chapters,
                      size: formatBytes(props.sample.book.bytes),
                    })}`),
                  h('p', { className: 'md-shelf-sub' }, format('sampleHint')),
                  h(KitButton, {
                    type: 'button', className: 'md-btn',
                    disabled: props.sampleBusy || props.busy,
                    onClick: props.onLoadSample,
                  }, props.sampleBusy ? format('sampleBusy') : format('sampleLoad'))
                )
          ),
        h('div', { className: 'md-tool-card' },
          h('h3', { className: 'md-subheading' }, format('splitToolTitle')),
          h('p', { className: 'md-shelf-sub' }, format('splitHint')),
          h('p', { className: 'md-shelf-sub' }, `${format('splitWorkspace')}：${props.workspaceLabel === '' ? format('workspaceNotChosen') : props.workspaceLabel}`),
          h('div', { className: 'md-library-tools' },
            h(KitButton, {
              type: 'button', className: 'md-btn',
              disabled: busy || props.workspaceLabel === '',
              onClick: props.onSplit,
            }, busy ? format('libraryBusy') : format('splitStart')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              disabled: busy,
              onClick: props.onChooseWorkspace,
            }, props.workspaceLabel === '' ? format('workspaceChoose') : format('workspaceChange'))
          )
        ),
        h('div', { className: 'md-tool-card' },
          h('h3', { className: 'md-subheading' }, format('importToolTitle')),
          h('p', { className: 'md-shelf-sub' }, format('importFilesHint')),
          h(KitButton, {
            type: 'button', className: 'md-btn', disabled: busy || props.importBusy,
            onClick: props.onImport,
          }, props.importBusy ? format('importBusy') : format('importStart'))
        ),
        h('div', { className: 'md-tool-card', id: 'md-env-card' },
          h('h3', { className: 'md-subheading' }, format('envTitle')),
          h('p', { className: 'md-shelf-sub' }, `${format('envPython')}：${envTools.python ? format('envOn') : format('envOff')} · ${format('envTex')}：${envTools.tex ? format('envOn') : format('envOff')}`),
          h('div', { className: 'md-library-tools' },
            envTools.python ? null : h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              onClick: () => {
                try {
                  window.open('https://www.python.org/downloads/windows/', '_blank', 'noopener')
                } catch {
                  // popup blocked
                }
              },
            }, `${format('envPython')}（${format('envPythonSize')}）`),
            envTools.tex ? null : h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              onClick: () => {
                try {
                  window.open(TEXLIVE_URL, '_blank', 'noopener')
                } catch {
                  // popup blocked
                }
              },
            }, `${format('envTex')}（${format('envTexSize')}）`)
          )
        )
        )
        )
      )
    }

    /**
     * The shelf: every recognized book.
     * @param {{ books: object[], libraryDir: string, onOpen: Function, registerRef: Function }} props - catalog and opener.
     * @returns {import('react').ReactElement} the shelf.
     */
    function Shelf(props) {
      const surfaceRef = useRef(null)
      const startRef = useRef(null)
      const boxRef = useRef(null)
      const [box, setBox] = useState(null)
      const boundsOf = () => (surfaceRef.current === null ? null : surfaceRef.current.getBoundingClientRect())
      const onPointerDown = event => {
        if (event.button !== 0) return
        if (event.target.closest('.md-card, .md-collection, .md-btn')) return
        const bounds = boundsOf()
        if (bounds === null) return
        startRef.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, additive: event.shiftKey }
        boxRef.current = { x: startRef.current.x, y: startRef.current.y, w: 0, h: 0 }
        setBox(boxRef.current)
        try { surfaceRef.current.setPointerCapture(event.pointerId) } catch { /* pointer already gone */ }
      }
      const onPointerMove = event => {
        if (startRef.current === null || surfaceRef.current === null) return
        const bounds = boundsOf()
        if (bounds === null) return
        const x = event.clientX - bounds.left
        const y = event.clientY - bounds.top
        const start = startRef.current
        boxRef.current = {
          x: Math.min(start.x, x),
          y: Math.min(start.y, y),
          w: Math.abs(x - start.x),
          h: Math.abs(y - start.y),
        }
        setBox(boxRef.current)
      }
      const onPointerUp = () => {
        if (startRef.current === null) return
        const start = startRef.current
        startRef.current = null
        const area = boxRef.current
        boxRef.current = null
        setBox(null)
        if (area === null || start === null || surfaceRef.current === null) return
        if (area.w < 6 && area.h < 6) return
        const bounds = boundsOf()
        if (bounds === null) return
        const ids = []
        for (const [id, node] of props.cardRefs.current) {
          if (node === null || node === undefined) continue
          const rect = node.getBoundingClientRect()
          const left = rect.left - bounds.left
          const top = rect.top - bounds.top
          if (left < area.x + area.w && left + rect.width > area.x && top < area.y + area.h && top + rect.height > area.y) ids.push(id)
        }
        props.onSelect(ids, start.additive)
      }
      const empty = props.books.length === 0 && props.collections.length === 0
      return h('div', {
        className: 'md-shelf',
        ref: surfaceRef,
        onPointerDown,
        onPointerMove,
        onPointerUp,
      },
        empty
          ? h('div', { className: 'md-empty' },
            h('div', { className: 'md-empty-title' }, format('shelfEmpty')),
            h('div', { className: 'md-empty-hint' }, format('emptyHint'))
          )
          : h('div', { className: 'md-grid' },
            props.collections.map(item => h(CollectionCard, {
              key: item.id,
              name: item.name,
              count: item.count,
              onOpen: () => props.onOpenGroup(item.id),
              onDelete: () => props.onDeleteGroup(item.id),
            })),
            props.books.map(book => h(BookCard, {
              key: book.id,
              book,
              selected: props.selected.has(book.id),
              hasCover: props.covers.has(book.id),
              onSelect: props.onToggle,
              onOpen: props.onOpen,
              registerRef: props.registerRef,
            }))
          ),
        box === null
          ? null
          : h('div', {
            className: 'md-marquee',
            'aria-hidden': true,
            style: { left: box.x, top: box.y, width: box.w, height: box.h },
          }),
        props.selected.size === 0
          ? null
          : h('div', { className: 'md-shelf-actions' },
            h('span', { className: 'md-shelf-selected' }, format('shelfSelected', { n: props.selected.size })),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              onClick: props.onCreateShelf,
            }, format('shelfNew')),
            props.group === 'hidden'
              ? h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small',
                onClick: props.onUnhide,
              }, format('shelfUnhide'))
              : h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small',
                onClick: props.onHide,
              }, format('shelfHide')),
            props.group === 'hidden'
              ? h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small',
                onClick: props.onTrashSelected,
              }, format('shelfTrash'))
              : null,
            props.group !== null && props.group !== 'hidden'
              ? h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small',
                onClick: props.onRemoveFromShelf,
              }, format('shelfRemove'))
              : null,
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
              onClick: props.onClear,
            }, format('shelfClear'))
          )
      )
    }

    /**
     * Name prompt for a new shelf made from the current selection.
     * @param {{ name: string, onChange: Function, onConfirm: Function, onClose: Function, error: string }} props - the draft and handlers.
     * @returns {import('react').ReactElement} the dialog.
     */
    function ShelfNameDialog(props) {
      return h(KitModal, {
        title: format('shelfName'),
        onClose: props.onClose,
        children: h(React.Fragment, null,
          h(KitInput, {
            className: 'md-input', value: props.name, autoFocus: true,
            placeholder: format('shelfName'),
            onChange: value => props.onChange(value),
            onKeyDown: event => {
              if (event.key === 'Enter') props.onConfirm()
            },
          }),
          props.error === '' ? null : h('div', { className: 'md-state-error', role: 'alert' }, props.error)
        ),
        footer: [
          h(KitButton, { key: 'cancel', variant: 'ghost', onClick: props.onClose }, format('previewClose')),
          h(KitButton, { key: 'save', variant: 'primary', onClick: props.onConfirm }, format('shelfCreate')),
        ],
      })
    }

    /**
     * The three session groups, their per-group New and Import buttons, and the
     * inline rename/unlink actions on each row inside one chapter.
     * @param {{ chapter: object, groups: object | undefined, creatingMode: string, loaded: boolean, available: boolean, error: string, errorSession: string | null, renaming: object | null, onNewSession: Function, onOpenSession: Function, onRetryRename: Function, onImport: Function, onUnlink: Function, onStartRename: Function, onRenameInput: Function, onCommitRename: Function, onCancelRename: Function }} props - chapter and session state.
     * @returns {import('react').ReactElement} the block.
     */
    /**
     * One chapter's question marks, as a list beside the conversation groups.
     * It reads the marks itself and follows edits made in either PDF pane; a
     * row only jumps to the page, it never opens a conversation.
     * @param {{ bookId: string, code: string, onOpen: Function }} props - the chapter and the jump handler.
     * @returns {import('react').ReactElement} the group body.
     */
    function ChapterQuestions(props) {
      const [items, setItems] = useState([])
      const [loaded, setLoaded] = useState(false)
      const [revision, setRevision] = useState(0)
      const seenRev = useRef(0)
      useEffect(() => {
        let cancelled = false
        void loadChapterQuestions(props.bookId, props.code).then(payload => {
          if (cancelled) return
          setItems(payload.questions)
          setLoaded(true)
        }).catch(() => {
          if (!cancelled) setLoaded(true)
        })
        return () => { cancelled = true }
      }, [props.bookId, props.code, revision])
      useEffect(() => {
        seenRev.current = Number(readView(props.bookId, props.code).questionRev) || 0
        return subscribeView(props.bookId, props.code, state => {
          const next = Number(state.questionRev) || 0
          if (next <= seenRev.current) return
          seenRev.current = next
          setRevision(value => value + 1)
        })
      }, [props.bookId, props.code])
      if (!loaded) return h('p', { className: 'md-session-state' }, format('loading'))
      if (items.length === 0) return h('p', { className: 'md-session-state' }, format('questionsEmpty'))
      return h('ul', { className: 'md-session-list md-question-list' },
        items.map(question => h('li', { key: question.id, className: 'md-session-row' },
          h(KitButton, {
            type: 'button',
            className: 'md-session',
            title: format('questionListHint'),
            'aria-label': `${format('questionOpen')}：${question.name}`,
            onClick: () => props.onOpen(question),
          }, h('span', { className: 'md-session-name' }, question.name))
        )))
    }

    function ChapterSessions(props) {
      const busy = props.creatingMode !== ''
      const modes = Array.isArray(props.modes) ? props.modes : MODES
      const renaming = props.renaming
      const row = item => {
        const label = item.title === '' ? item.displayTitle : item.title
        const editing = renaming !== null && renaming.sessionId === item.id
        const title = [
          label,
          item.pending ? format('pendingHint') : '',
          item.viaLink ? format('linkedHint') : '',
          item.bookTitle,
          item.chapterTitle,
        ].filter(Boolean).join(' · ')
        return h('li', { key: item.id, className: 'md-session-row', 'data-via-link': item.viaLink ? 'true' : undefined },
          editing
            ? h('div', { className: 'md-session-edit' },
              h(KitInput, {
                className: 'md-session-input',
                value: renaming.value,
                'aria-label': format('rename'),
                title: format('renameHint'),
                autoFocus: true,
                onChange: value => props.onRenameInput(value),
                onKeyDown: event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    props.onCommitRename()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    props.onCancelRename()
                  }
                },
              }),
              h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small', disabled: renaming.saving,
                onClick: props.onCommitRename,
              }, format('renameSave')),
              h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small md-btn-ghost', disabled: renaming.saving,
                onClick: props.onCancelRename,
              }, format('renameCancel')),
              renaming.error === '' ? null : h('span', { className: 'md-session-edit-error', role: 'alert' }, renaming.error)
            )
            : h(KitButton, {
              type: 'button',
              className: 'md-session',
              title,
              'aria-label': label,
              onClick: () => props.onOpenSession(item.id),
            },
              h('span', { className: 'md-session-name' }, label),
              item.viaLink
                ? h('span', {
                  className: 'md-session-link',
                  role: 'img',
                  title: format('linkedHint'),
                  'aria-label': format('linkedHint'),
                }, '↪')
                : null,
              item.running ? h('span', { className: 'md-session-dot', role: 'img', 'aria-label': format('running'), title: format('running') }) : null,
              h('span', { className: 'md-session-time', 'aria-hidden': true }, formatTime(item.updatedAt))
            ),
          editing ? null : h('span', { className: 'md-session-actions' },
            item.pending
              ? null
              : h(KitButton, {
                type: 'button', className: 'md-icon-btn', title: format('rename'),
                'aria-label': `${format('rename')}：${label}`,
                onClick: () => props.onStartRename(props.chapter, item),
              }, '✎'),
            item.pending
              ? null
              : h(KitButton, {
                type: 'button', className: 'md-icon-btn md-icon-btn-text', title: `${format('archiveSession')}（不删除，可在 DSH 归档里恢复）`,
                'aria-label': `${format('archiveSession')}：${label}`,
                onClick: () => {
                  if (typeof window !== 'undefined' && typeof window.confirm === 'function'
                    && !window.confirm(format('archiveConfirm'))) return
                  props.onArchiveSession(item.id)
                },
              }, format('archiveSession')),
            item.viaLink
              ? h(KitButton, {
                type: 'button', className: 'md-icon-btn', title: format('unlink'),
                'aria-label': `${format('unlink')}：${label}`,
                onClick: () => props.onUnlink(item),
              }, '×')
              : null
          )
        )
      }
      return h('div', { className: 'md-sessions', 'aria-busy': busy ? 'true' : undefined },
        h('div', { className: 'md-sessions-head' },
          h('span', { className: 'md-sessions-title' }, format('sessionsTitle')),
          props.loaded
            ? null
            : h('span', { className: 'md-session-state' }, format(props.available ? 'sessionLoading' : 'sessionUnavailable')),
          h(KitButton, {
            type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
            onClick: props.onToggle,
          }, props.open === false ? format('artifactsExpand') : format('artifactsCollapse')),
          props.loaded && props.available
            ? h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small md-btn-ghost md-session-digest',
              title: format('digestHint'),
              'aria-label': format('digestOf'),
              onClick: () => props.onDigest(props.chapter),
            }, format('digest'))
            : null
        ),
        props.error === '' ? null : h('div', { className: 'md-alert md-alert-inline', role: 'alert' },
          h('span', { className: 'md-alert-text' }, props.error),
          props.errorSession === null ? null : h(KitButton, {
            type: 'button', className: 'md-btn md-btn-small', disabled: busy,
            onClick: props.onRetryRename,
          }, format('retryRename'))
        ),
        modes.length === 0
          ? h('p', { className: 'md-session-state' }, format('sessionsNoModes'))
          : modes.map(mode => {
          const items = props.groups !== undefined && Array.isArray(props.groups[mode]) ? props.groups[mode] : []
          return h('div', { key: mode, className: 'md-session-group' },
            h('div', { className: 'md-session-group-head' },
              h('span', { className: 'md-session-mode' }, format(`mode.${mode}`)),
              h(KitButton, {
                type: 'button',
                className: 'md-btn md-btn-small md-session-new',
                disabled: busy || !props.available,
                title: format('newSessionHint'),
                'aria-label': format('newSessionOf', { mode: format(`mode.${mode}`) }),
                onClick: () => props.onNewSession(props.chapter, mode),
              }, props.creatingMode === mode ? format('creating') : `＋ ${format('newSession')}`),
              h(KitButton, {
                type: 'button',
                className: 'md-btn md-btn-small md-btn-ghost',
                disabled: busy || !props.available,
                title: format('forceNewHint'),
                'aria-label': format('forceNewOf', { mode: format(`mode.${mode}`) }),
                onClick: () => props.onNewSession(props.chapter, mode, { forceNew: true }),
              }, format('forceNew')),
              h(KitButton, {
                type: 'button',
                className: 'md-btn md-btn-small md-btn-ghost',
                disabled: busy || !props.available,
                'aria-label': format('importOf', { mode: format(`mode.${mode}`) }),
                title: format('importHint'),
                onClick: () => props.onImport(props.chapter, mode),
              }, format('importSessions'))
            ),
            items.length === 0 ? null : h('ul', { className: 'md-session-list' }, items.map(row))
          )
        }),
        // Question marks sit beside the conversations: same row shape, but a
        // click only jumps the PDF there (no New, no Import, no session).
        h('div', { key: 'questions', className: 'md-session-group' },
          h('div', { className: 'md-session-group-head' },
            h('span', { className: 'md-session-mode' }, format('questionsTitle'))
          ),
          h(ChapterQuestions, {
            bookId: props.bookId,
            code: props.chapter.code,
            onOpen: question => props.onOpenQuestion(question),
          })
        )
      )
    }

    /**
     * The HTML print page in a modal: the Host renders Markdown to a
     * self-contained page, the browser prints it. No TeX, no temporary PDF.
     * @param {{ name: string, html: string, busy: boolean, error: string, onClose: Function }} props - the page and handlers.
     * @returns {import('react').ReactElement} the dialog.
     */
    function PrintDialog(props) {
      const frame = useRef(null)
      const [blocked, setBlocked] = useState('')
      const print = () => {
        const node = frame.current
        const win = node === null ? null : node.contentWindow
        if (win === null) {
          setBlocked(format('printBlocked'))
          return
        }
        try {
          win.focus()
          win.print()
        } catch {
          setBlocked(format('printBlocked'))
        }
      }
      return h(KitModal, {
        title: `${format('printTitle')}：${props.name}`,
        onClose: props.onClose,
        className: 'md-print-modal',
        contentClassName: 'md-print-content',
        children: h(React.Fragment, null,
          props.busy
            ? h('p', { className: 'md-shelf-sub', role: 'status' }, format('printBusy'))
            : props.error !== ''
              ? h('p', { className: 'md-alert-text', role: 'alert' }, `${format('printFailed')}（${props.error}）`)
              : h('iframe', {
                className: 'md-print-frame',
                ref: frame,
                title: props.name,
                srcDoc: props.html,
                // The page needs scripts for the optional formula renderer, and
                // modals for the print dialog. It is our own generated markup.
                sandbox: 'allow-scripts allow-modals',
              }),
          h('div', { className: 'md-settings-actions' },
            h(KitButton, {
              type: 'button', className: 'md-btn',
              disabled: props.busy || props.error !== '',
              onClick: print,
            }, format('printAction')),
            h(KitButton, { type: 'button', className: 'md-btn md-btn-ghost', onClick: props.onClose }, format('close'))
          ),
          blocked === '' ? null : h('p', { className: 'md-alert-text', role: 'alert' }, blocked)
        ),
      })
    }

    /**
     * Pick an existing conversation to place under one chapter. A modal, because
     * it replaces the page's attention: search, a list, and nothing else.
     * @param {{ target: object, candidates: object[], onPick: Function, onClose: Function }} props - the chapter to attach to, candidate rows, picker handlers.
     * @returns {import('react').ReactElement} the dialog.
     */
    function SessionPicker(props) {
      const [query, setQuery] = useState('')
      const needle = query.trim().toLowerCase()
      const filtered = needle === '' ? props.candidates : props.candidates.filter(item => item.label.toLowerCase().includes(needle))
      const shown = filtered.slice(0, 300)
      return h(KitModal, {
        title: format('importTitle'),
        onClose: props.onClose,
        children: h(React.Fragment, null,
          h('div', { className: 'md-picker-sub' },
            format('importChapter', { code: props.target.code, title: props.target.title })),
          h(KitInput, {
            className: 'md-picker-search',
            type: 'search',
            placeholder: format('importSearch'),
            'aria-label': format('importSearch'),
            value: query,
            autoFocus: true,
            onChange: value => setQuery(value),
            onKeyDown: event => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                props.onClose()
              }
            },
          }),
          filtered.length === 0
            ? h('div', { className: 'md-picker-empty' }, format('importEmpty'))
            : h('ul', { className: 'md-picker-list' },
              shown.map(item => h('li', { key: item.id },
                h(KitButton, {
                  type: 'button',
                  className: 'md-picker-row',
                  disabled: item.linked,
                  onClick: () => props.onPick(item.id, item.label),
                },
                  h('span', { className: 'md-picker-name' }, item.label),
                  item.linked
                    ? h('span', { className: 'md-picker-flag' }, format('importAlready'))
                    : item.foreign ? h('span', { className: 'md-picker-flag' }, format('importForeign')) : null,
                  h('span', { className: 'md-picker-time', 'aria-hidden': true }, formatTime(item.updatedAt))
                )
              ))
            ),
          filtered.length > shown.length
            ? h('div', { className: 'md-picker-note' }, format('importTruncated', { n: shown.length }))
            : null,
          h('div', { className: 'md-picker-note' }, format('importHint'))
        ),
        footer: [h(KitButton, { key: 'close', variant: 'ghost', onClick: props.onClose }, format('previewClose'))],
      })
    }

    /**
     * The chapter outline: one model call over the chapter's conversations.
     * @param {{ digest: object, onClose: Function, onCopy: Function }} props - the outline and handlers.
     * @returns {import('react').ReactElement} the dialog.
     */
    function DigestDialog(props) {
      const digest = props.digest
      return h(KitModal, {
        title: format('digestTitle'),
        onClose: props.onClose,
        children: h(React.Fragment, null,
          digest.phase === 'working'
            ? h('div', { className: 'md-picker-empty', role: 'status' }, format('digestWorking'))
            : digest.phase === 'error'
              ? h('div', { className: 'md-picker-empty md-state-error', role: 'alert' },
                digest.error === '' ? format('digestFailed') : digest.error)
              : h(React.Fragment, null,
                h('pre', { className: 'md-digest-text' }, digest.text),
                h('div', { className: 'md-digest-actions' },
                  h(KitButton, {
                    variant: 'outline',
                    onClick: () => props.onCopy(digest.text),
                  }, format('digestCopy')),
                  digest.path === '' ? null : h('code', { className: 'md-path' }, digest.path)
                )
              ),
          h('div', { className: 'md-picker-note' }, format('digestHint'))
        ),
        footer: [h(KitButton, { key: 'close', variant: 'ghost', onClick: props.onClose }, format('previewClose'))],
      })
    }

    /**
     * The produced files a chapter's sessions wrote, listed under its sessions.
     * @param {{ bookId: string, bookTitle: string, code: string, state: object | undefined, counts: object | undefined, onOpen: Function, onRetry: Function, onReload: Function, onCopyPath: Function, registerRef: Function }} props - book and chapter, the chapter's listing state and counts, open/retry handlers, row focus refs.
     * @returns {import('react').ReactElement} the block.
     */
    function ChapterArtifacts(props) {
      const state = props.state
      const phase = state === undefined ? 'loading' : state.phase
      const items = state !== undefined && Array.isArray(state.items) ? state.items : []
      const truncated = state !== undefined && state.truncated === true
      // Long chapters get a lot of products; collapse long lists by default.
      const [collapsed, setCollapsed] = useState(true)
      const [openArtifacts, setOpenArtifacts] = useState(() => new Set())
      const rowKey = item => `${props.bookId}|${props.code}|${item.name}`
      const artifactStem = item => String(item.name).replace(/\.(md|pdf)$/i, '')
      const row = (item, index) => {
        const groups = item.kind === 'pdf' && props.sessionIndex !== undefined && props.sessionIndex.byArtifact !== undefined
          ? props.sessionIndex.byArtifact.get(`${props.bookId}|${props.code}|${artifactStem(item)}`)
          : undefined
        return h('li', {
          key: `${index}:${item.name}`,
          className: String(item.name).includes('__') ? 'md-artifact-item md-artifact-child' : 'md-artifact-item',
        },
          h(KitButton, {
            type: 'button',
            className: 'md-file',
          onContextMenu: event => {
            if (/\.md$/i.test(item.name)) {
              event.preventDefault()
              if (props.canRender === true) props.onRender(item, props.code)
              else if (typeof props.onEnvRequired === 'function') props.onEnvRequired('render')
              return
            }
            if (item.kind === 'pdf') {
              event.preventDefault()
              props.onTrashArtifact(item, props.code)
            }
          },
          'data-kind': item.kind,
          title: [
            item.name,
            formatSize(item.size),
            formatDate(item.mtime),
            item.kind === 'pdf' ? format('openPdf') : item.kind === 'text' ? '' : format('previewUnsupported'),
          ].filter(Boolean).join(' · '),
          'aria-label': `${item.name}（${artifactBadge(item)}）`,
          ref: node => props.registerRef(rowKey(item), node),
          onClick: () => props.onOpen(item),
        },
          h('span', { className: 'md-file-kind', 'aria-hidden': true }, artifactBadge(item)),
          h('span', { className: 'md-file-name' }, item.name),
          h('span', { className: 'md-file-meta', 'aria-hidden': true },
            [formatSize(item.size), formatDate(item.mtime)].filter(Boolean).join(' · ')),
          /\.md$/i.test(item.name)
            ? h('span', {
              className: 'md-file-action', role: 'button', tabIndex: 0,
              title: format('renderActionHint'),
              onClick: event => {
                event.stopPropagation()
                if (props.canRender === true) props.onRender(item, props.code)
                else if (typeof props.onEnvRequired === 'function') props.onEnvRequired('render')
              },
              onKeyDown: event => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                if (props.canRender === true) props.onRender(item, props.code)
                else if (typeof props.onEnvRequired === 'function') props.onEnvRequired('render')
              },
            }, format('renderAction'))
            : null
          ),
          /\.md$/i.test(item.name) && typeof props.onPrint === 'function'
            ? h('span', {
              className: 'md-file-action', role: 'button', tabIndex: 0,
              title: format('printHint'),
              onClick: event => {
                event.stopPropagation()
                props.onPrint(item, props.code)
              },
              onKeyDown: event => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                props.onPrint(item, props.code)
              },
            }, format('printAction'))
            : null,
          (item.kind === 'pdf' || props.allowNonPdfDelete === true || /_export\.annots\.json$/i.test(String(item.name ?? '')))
            ? h('span', {
              className: 'md-file-action', role: 'button', tabIndex: 0,
              title: format('trashFileHint'),
              onClick: event => {
                event.stopPropagation()
                props.onTrashArtifact(item, props.code)
              },
            }, format('trashAction'))
            : null,
          props.mathMode === true ? h('div', { className: 'md-artifact-modes' },
            MODES.map(mode => h(React.Fragment, { key: mode },
              h(KitButton, {
                type: 'button',
                className: 'md-btn md-btn-small md-btn-ghost md-artifact-mode',
                onClick: event => {
                  event.stopPropagation()
                  const rows = groups === undefined ? [] : (Array.isArray(groups[mode]) ? groups[mode] : [])
                  if (rows.length > 0) {
                    props.onOpenSession(rows[0])
                    return
                  }
                  props.onArtifactSession(props.chapter, item, mode, 0)
                },
              }, format(`mode.${mode}`)),
              h(KitButton, {
                type: 'button',
                className: 'md-btn md-btn-small md-btn-ghost md-artifact-mode',
                title: format('forceNewHint'),
                onClick: event => {
                  event.stopPropagation()
                  props.onArtifactSession(props.chapter, item, mode, 0)
                },
              }, `+ ${format('forceNew')}`)
            ))
          ) : null,
          props.mathMode === true && groups !== undefined
            ? h(React.Fragment, null,
              h(KitButton, {
                type: 'button', className: 'md-artifact-session-toggle',
                onClick: event => {
                  event.stopPropagation()
                  setOpenArtifacts(previous => {
                    const next = new Set(previous)
                    if (next.has(item.name)) next.delete(item.name)
                    else next.add(item.name)
                    return next
                  })
                },
              }, `${format('sessionsTitle')} ${MODES.reduce((sum, mode) => sum + (Array.isArray(groups[mode]) ? groups[mode].length : 0), 0)} · ${openArtifacts.has(item.name) ? format('artifactsCollapse') : format('artifactsExpand')}`),
              openArtifacts.has(item.name)
                ? h('ul', { className: 'md-session-list md-artifact-sessions' },
                  MODES.flatMap(mode => (Array.isArray(groups[mode]) ? groups[mode] : []).map(entry => h('li', {
                    key: entry.id, className: 'md-session-row',
                  },
                    h(KitButton, {
                      type: 'button', className: 'md-session',
                      onClick: () => props.onOpenSession(entry),
                    }, h('span', { className: 'md-session-name' }, entry.title === '' ? entry.displayTitle : entry.title))
                  ))))
                : null
            )
            : null
        )
      }
      const ordered = [...items].sort((left, right) => {
        // `<parent>__<name>.md` groups under `<parent>` so derived files stay
        // right below the artifact their session started from.
        const base = entry => String(entry.name).replace(/\.(md|pdf)$/i, '').split('__')[0]
        const delta = base(left).localeCompare(base(right))
        if (delta !== 0) return delta
        const isChild = entry => String(entry.name).includes('__')
        if (isChild(left) !== isChild(right)) return isChild(left) ? 1 : -1
        const rank = entry => (/\.md$/i.test(entry.name) ? 0 : /\.pdf$/i.test(entry.name) ? 1 : 2)
        const byRank = rank(left) - rank(right)
        return byRank !== 0 ? byRank : left.name.localeCompare(right.name)
      })
      let body
      if (phase === 'error') {
        body = h('div', { className: 'md-alert md-alert-inline', role: 'alert' },
          h('span', { className: 'md-alert-text' }, state.error === '' ? format('artifactsFailed') : state.error),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small',
            'aria-label': format('artifactsReloadAria'),
            onClick: () => props.onRetry(props.code),
          }, format('artifactsRetry'))
        )
      } else if (phase !== 'ready') {
        body = h('div', { className: 'md-session-state', role: 'status' }, format('artifactsLoading'))
      } else if (items.length === 0) {
        body = h('div', { className: 'md-artifacts-empty' },
          h('span', null, state.missing === true ? format('artifactsMissing') : format('artifactsEmpty')),
          h('span', { className: 'md-artifacts-hint' }, format('artifactsEmptyHint')),
          h('code', { className: 'md-path' }, state.dir),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small md-btn-ghost',
            onClick: () => props.onCopyPath(state.dir),
          }, format('copyPath')),
          props.bookTitle !== '' && props.bookTitle !== props.bookId
            ? h('span', { className: 'md-artifacts-hint' }, format('artifactsBookId', { id: props.bookId }))
            : null,
          h('span', { className: 'md-artifacts-hint' }, format('artifactsScope'))
        )
      } else {
        body = h('ul', { className: 'md-file-list', 'aria-label': `${format('artifactsTitle')} · ${props.code}` }, ordered.map(row))
      }
      return h('section', {
        className: 'md-artifacts',
        'aria-label': `${props.code} ${format('artifactsTitle')}`,
        'aria-busy': phase === 'loading' ? 'true' : undefined,
      },
        h('div', { className: 'md-artifacts-head' },
          h('span', { className: 'md-artifacts-title' }, format('artifactsTitle')),
          h(KitButton, {
            type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
            onClick: () => setCollapsed(value => !value),
          }, collapsed ? format('artifactsExpand') : format('artifactsCollapse')),
          phase === 'ready' && items.length > 0 && !truncated
            ? h('span', { className: 'md-session-count' }, format('filesCount', { n: items.length }))
            : null,
          phase === 'ready' && truncated
            ? h('span', { className: 'md-session-count' }, format('filesTruncated', { n: items.length }))
            : null,
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small md-btn-ghost',
            'aria-label': format('artifactsReloadAria'),
            title: format('artifactsReloadAria'),
            onClick: () => props.onReload(props.code),
          }, format('artifactsReload'))
        ),
        collapsed ? null : body
      )
    }

    /**
     * The page's own preview of one produced file: text with line numbers, fed
     * by the Host because the browser has no filesystem access. PDFs and other
     * binaries get the same drawer, with the note instead of the text, so a
     * click always answers where it happened.
     * @param {{ preview: object, paneRef: Function, bodyRef: Function, onClose: Function, onRetry: Function }} props - the open preview and its handlers.
     * @returns {import('react').ReactElement} the pane.
     */
    function PreviewPane(props) {
      const preview = props.preview
      const ready = preview.phase === 'ready'
      const text = ready ? String(preview.text ?? '') : ''
      const lines = ready ? text.split('\n') : []
      const shown = lines.slice(0, MAX_PREVIEW_LINES)
      const cut = lines.length > shown.length
      const gutter = shown.map((line, index) => String(index + 1)).join('\n')
      const context = preview.chapterTitle === undefined || preview.chapterTitle === ''
        ? ''
        : format('previewContext', { code: preview.code, title: preview.chapterTitle })
      const notes = []
      if (ready && preview.truncated === true) notes.push(format('previewTruncatedBytes'))
      if (ready && cut) notes.push(format('previewTruncatedLines', { n: shown.length }))
      if (ready && preview.encoding !== undefined && preview.encoding !== 'utf-8') {
        notes.push(format('previewEncoding', { encoding: preview.encoding }))
      }
      let body
      if (preview.phase === 'error') {
        body = h('div', { className: 'md-preview-state md-state-error', role: 'alert' },
          h('div', null, preview.error === '' ? format('previewFailed') : preview.error),
          preview.errorCode === 'not-found' ? h('div', null, format('previewGone')) : null,
          h('div', { className: 'md-state-actions' },
            h(KitButton, { type: 'button', className: 'md-btn md-btn-small', onClick: props.onRetry }, format('previewRetry'))
          )
        )
      } else if (preview.phase === 'unsupported') {
        body = h('div', { className: 'md-preview-state', role: 'note' }, format('previewUnsupported'))
      } else if (!ready) {
        body = h('div', { className: 'md-preview-state', role: 'status' }, format('previewLoading'))
      } else {
        body = h('div', {
          className: 'md-preview-body',
          tabIndex: 0,
          role: 'document',
          'aria-label': preview.name,
          ref: props.bodyRef,
          key: `${preview.code}|${preview.name}`,
        },
          text === ''
            ? h('div', { className: 'md-preview-state' }, format('previewEmptyFile', { size: formatSize(preview.size) }))
            : h('div', { className: 'md-code-block' },
              h('pre', { className: 'md-code-gutter', 'aria-hidden': true }, gutter),
              h('pre', { className: 'md-code-text' }, shown.join('\n'))
            )
        )
      }
      return h('aside', {
        className: 'md-preview',
        'aria-label': `${format('previewTitle')}：${preview.name}`,
        'data-kind': preview.kind,
        tabIndex: -1,
        ref: props.paneRef,
      },
        h('div', { className: 'md-preview-head' },
          h('span', { className: 'md-file-kind', 'aria-hidden': true }, artifactBadge(preview)),
          h('div', { className: 'md-preview-titles' },
            h('div', { className: 'md-preview-name', title: preview.name }, preview.name),
            context === '' ? null : h('div', { className: 'md-preview-context' }, context),
            h('div', { className: 'md-preview-meta' },
              [formatSize(preview.size), formatDate(preview.mtime)].filter(Boolean).join(' · '))
          ),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small md-btn-ghost',
            'aria-label': format('previewClose'),
            title: format('previewClose'),
            onClick: props.onClose,
          }, '×')
        ),
        notes.length === 0
          ? null
          : h('div', { className: 'md-preview-notices' },
            notes.map((note, index) => h('span', { key: index, className: 'md-preview-note' }, note))),
        body
      )
    }

    /**
     * Pages kept warm around the one being read: the current page plus its two
     * neighbours fits in five, which is enough to absorb a flick.
     */
    const PAGE_PRELOAD_LIMIT = 5

    /**
     * Paint one page into a canvas; shared by single and continuous mode so the
     * DPR/canvas-size rules live in one place during the viewer rewrite.
     * @param {object} page - pdf.js page.
     * @param {HTMLCanvasElement} node - target canvas.
     * @param {number} scale - zoom.
     * @returns {object} the pdf.js render task.
     */
    function paintPageCanvas(page, node, scale) {
      const viewport = page.getViewport({ scale })
      let dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
      if (viewport.width * dpr > 8000 || viewport.height * dpr > 8000) dpr = 1
      node.width = Math.max(1, Math.floor(viewport.width * dpr))
      node.height = Math.max(1, Math.floor(viewport.height * dpr))
      node.style.width = `${Math.floor(viewport.width)}px`
      node.style.height = `${Math.floor(viewport.height)}px`
      return page.render({
        canvasContext: node.getContext('2d'),
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      })
    }

    /**
     * One stroked 16px icon for the tool row; the label lives in title/aria-label
     * so the buttons stay compact.
     * @param {string} d - SVG path data.
     * @returns {import('react').ReactElement} the icon.
     */
    function annotIcon(d) {
      return h('svg', {
        className: 'md-icon',
        viewBox: '0 0 24 24',
        width: 15,
        height: 15,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      }, h('path', { d }))
    }

    /** The font families a note can use, mapped to system stacks for now. */
    const NOTE_FONTS = {
      hand: '"Excalifont", "Xiaolai", "KaiTi", "STKaiti", "Kaiti SC", "Segoe Print", "Comic Sans MS", cursive',
      normal: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      song: '"SimSun", "Songti SC", "Noto Serif SC", serif',
      hei: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif',
    }
    /** The four text sizes, in screen pixels (the note keeps its size at any zoom). */
    const NOTE_SIZES = [14, 18, 22, 28]
    /** The note colours offered in the in-place editor. */
    const NOTE_COLORS = ['#1f1f1f', '#c0392b', '#2f6df6', '#1e8a4c', '#d9820b']
    /** Where the note font choice is remembered (global, like the reading mode). */
    const NOTE_FONT_KEY = 'pdfdesk:note-font'

    /**
     * The note font the user chose last. It is one global preference: notes on
     * every page and every book start with the same face.
     * @returns {string} a key of {@link NOTE_FONTS}.
     */
    function readNoteFont() {
      try {
        const raw = window.localStorage.getItem(NOTE_FONT_KEY)
        return typeof raw === 'string' && NOTE_FONTS[raw] !== undefined ? raw : 'normal'
      } catch {
        return 'normal'
      }
    }

    /**
     * Remember the note font for the next note.
     * @param {string} family - a key of {@link NOTE_FONTS}.
     * @returns {void}
     */
    function writeNoteFont(family) {
      if (typeof family !== 'string' || NOTE_FONTS[family] === undefined) return
      try {
        window.localStorage.setItem(NOTE_FONT_KEY, family)
      } catch {
        // storage unavailable: the choice lasts for this page visit
      }
    }

    /**
     * The style a new note starts with. The font is the remembered one; the rest
     * are the long-standing defaults.
     * @returns {{ fontSize: number, fontFamily: string, color: string, textAlign: string, fontWeight: string, fontStyle: string }} the style.
     */
    function defaultNoteStyle() {
      return {
        fontSize: NOTE_SIZES[0],
        fontFamily: readNoteFont(),
        color: '#1f1f1f',
        textAlign: 'left',
        fontWeight: 'normal',
        fontStyle: 'normal',
      }
    }
    /** The shape tools; each saves one `kind: 'shape'` entry per page. */
    const SHAPE_TOOLS = ['line', 'arrow', 'rect', 'ellipse', 'diamond']
    /** Locale label for each rail tool, used by the hover settings panel. */
    const TOOL_LABELS = {
      hand: 'annotHand',
      select: 'annotSelect',
      pen: 'annotPen',
      erase: 'annotErase',
      text: 'annotText',
      question: 'questionTool',
      mask: 'overlayToggle',
      line: 'shapeLine',
      arrow: 'shapeArrow',
      rect: 'shapeRect',
      diamond: 'shapeDiamond',
      ellipse: 'shapeEllipse',
    }
    // rough.js draws the shapes with Excalidraw's wobbly hand. It is bundled
    // under vendor/ and imported lazily: a missing file only loses the sketch.
    const ROUGH_VW = 1000
    const ROUGH_VH = 1414
    let roughLib = null
    const roughReady = import('/pdfdesk/vendor/rough/rough.mjs').then(module => {
      roughLib = module.default ?? module
    }).catch(() => {})
    /**
     * A light moving average for freehand strokes: dense pointer samples stay
     * readable instead of looking like a staircase, while the first and last
     * points (where the stroke starts and ends) do not move.
     * @param {Array<[number, number]>} points - sampled points.
     * @returns {Array<[number, number]>} the smoothed points.
     */
    function smoothStroke(points) {
      if (!Array.isArray(points) || points.length < 3) return points
      const out = [points[0]]
      for (let index = 1; index < points.length - 1; index += 1) {
        const previous = points[index - 1]
        const current = points[index]
        const next = points[index + 1]
        out.push([
          (previous[0] + current[0] * 2 + next[0]) / 4,
          (previous[1] + current[1] * 2 + next[1]) / 4,
          ((previous[2] ?? 0.5) + (current[2] ?? 0.5) * 2 + (next[2] ?? 0.5)) / 4,
        ])
      }
      out.push(points[points.length - 1])
      return out
    }
    /**
     * The page-fraction box of a text note. Notes saved before boxes existed
     * only carry x/y, so they get a stable size derived from their text; the
     * first resize writes explicit w/h without touching the text or style.
     * @param {object} entry - a stored text note.
     * @returns {{ x: number, y: number, w: number, h: number }} the box.
     */
    function noteBox(entry) {
      const text = String(entry.text ?? '')
      const fallbackWidth = Math.min(0.7, Math.max(0.18, text.length * 0.018))
      const w = Number.isFinite(entry.w) && entry.w > 0 ? entry.w : fallbackWidth
      const h = Number.isFinite(entry.h) && entry.h > 0 ? entry.h : 0.09
      return { x: entry.x, y: entry.y, w, h }
    }

    /**
     * How far marks live above/below the page, in page units. Single mode uses
     * this to unlock vertical panning only where there is actually a note; a
     * page without off-page marks stays perfectly still.
     * @param {object[]} entries - the page's marks.
     * @returns {{ top: number, bottom: number }} positive overhang in page units.
     */
    function offPageExtent(entries) {
      let minY = 0
      let maxY = 0
      const visit = value => {
        const number = Number(value)
        if (!Number.isFinite(number)) return
        if (number < minY) minY = number
        if (number > maxY) maxY = number
      }
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (entry === null || typeof entry !== 'object') continue
        if (entry.kind === 'text') {
          const box = noteBox(entry)
          visit(box.y)
          visit(box.y + box.h)
        } else if (entry.kind === 'shape') {
          if (entry.shape === 'line' || entry.shape === 'arrow') {
            visit(entry.y0)
            visit(entry.y1)
          } else {
            visit(entry.y)
            visit(Number(entry.y) + Number(entry.h))
          }
        } else if (Array.isArray(entry.points)) {
          for (const point of entry.points) visit(point[1])
        }
      }
      return { top: Math.max(0, -minY), bottom: Math.max(0, maxY - 1) }
    }

    /**
     * Axis-aligned page-unit bounds of one mark, used by marquee selection.
     * @param {object} entry - the stored mark.
     * @returns {{ x: number, y: number, w: number, h: number }} the bounds.
     */
    function entryBounds(entry) {
      if (entry === null || typeof entry !== 'object') return { x: 0, y: 0, w: 0, h: 0 }
      if (entry.kind === 'text') return noteBox(entry)
      if (entry.kind === 'shape') {
        if (entry.shape === 'line' || entry.shape === 'arrow') {
          const x = Math.min(Number(entry.x0) || 0, Number(entry.x1) || 0)
          const y = Math.min(Number(entry.y0) || 0, Number(entry.y1) || 0)
          return { x, y, w: Math.abs((Number(entry.x1) || 0) - x), h: Math.abs((Number(entry.y1) || 0) - y) }
        }
        return { x: Number(entry.x) || 0, y: Number(entry.y) || 0, w: Number(entry.w) || 0, h: Number(entry.h) || 0 }
      }
      const points = Array.isArray(entry.points) ? entry.points : []
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const point of points) {
        const x = Number(point[0])
        const y = Number(point[1])
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
      if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    }

    /**
     * @param {{ x: number, y: number, w: number, h: number }} a - first box.
     * @param {{ x: number, y: number, w: number, h: number }} b - second box.
     * @returns {boolean} whether the boxes overlap.
     */
    function boxesIntersect(a, b) {
      return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    }

    /**
     * Translate one mark, used while dragging a selection.
     * @param {object} entry - the stored mark.
     * @param {number} dx - horizontal page delta.
     * @param {number} dy - vertical page delta.
     * @returns {object} the moved copy.
     */
    function translateEntry(entry, dx, dy) {
      if (entry.kind === 'text') return { ...entry, x: entry.x + dx, y: entry.y + dy }
      if (entry.kind === 'shape') {
        if (entry.shape === 'line' || entry.shape === 'arrow') {
          return { ...entry, x0: entry.x0 + dx, y0: entry.y0 + dy, x1: entry.x1 + dx, y1: entry.y1 + dy }
        }
        return { ...entry, x: entry.x + dx, y: entry.y + dy }
      }
      return { ...entry, points: (entry.points ?? []).map(point => (point.length > 2 ? [point[0] + dx, point[1] + dy, point[2]] : [point[0] + dx, point[1] + dy])) }
    }
    /**
     * The rough.js paths for one shape, in a fixed virtual pixel space so the
     * wobble has a stable size at any zoom. `null` means "draw clean lines".
     * @param {object} entry - the shape entry.
     * @param {number} roughness - 0..2, the settings value.
     * @returns {Array<{d: string, stroke: string, strokeWidth: number}> | null} the paths.
     */
    function sketchPaths(entry, roughness) {
      if (roughLib === null || roughness <= 0) return null
      const generator = roughLib.generator()
      const width = Number.isFinite(entry.width) ? entry.width : 2
      const options = {
        stroke: entry.color ?? '#e0554a',
        strokeWidth: width,
        roughness: Math.max(0.1, 0.9 * roughness),
        bowing: 0.8 * roughness,
        seed: Number.isFinite(entry.seed) ? entry.seed : 1,
        disableMultiStroke: false,
      }
      if (typeof entry.fill === 'string' && entry.fill !== '' && entry.shape !== 'line' && entry.shape !== 'arrow') {
        options.fill = entry.fill
        options.fillStyle = entry.fillStyle === 'solid' ? 'solid' : 'hachure'
      }
      const px = value => value * ROUGH_VW
      const py = value => value * ROUGH_VH
      let drawable
      if (entry.shape === 'line' || entry.shape === 'arrow') {
        drawable = generator.line(px(entry.x0), py(entry.y0), px(entry.x1), py(entry.y1), options)
      } else if (entry.shape === 'rect') {
        drawable = generator.rectangle(px(entry.x), py(entry.y), px(entry.w), py(entry.h), options)
      } else if (entry.shape === 'diamond') {
        const centerX = entry.x + entry.w / 2
        const centerY = entry.y + entry.h / 2
        drawable = generator.polygon([
          [px(centerX), py(entry.y)],
          [px(entry.x + entry.w), py(centerY)],
          [px(centerX), py(entry.y + entry.h)],
          [px(entry.x), py(centerY)],
        ], options)
      } else {
        drawable = generator.ellipse(px(entry.x + entry.w / 2), py(entry.y + entry.h / 2), px(entry.w), py(entry.h), options)
      }
      const paths = generator.toPaths(drawable)
      if (entry.shape === 'arrow') {
        const angle = Math.atan2(py(entry.y1) - py(entry.y0), px(entry.x1) - px(entry.x0))
        const length = Math.max(10, width * 4)
        for (const side of [-1, 1]) {
          const ex = px(entry.x1) - length * Math.cos(angle + side * 0.5)
          const ey = py(entry.y1) - length * Math.sin(angle + side * 0.5)
          paths.push(...generator.toPaths(generator.line(px(entry.x1), py(entry.y1), ex, ey, options)))
        }
      }
      return paths
    }

    /**
     * Apply one saved note to a page's annotation list. Shared by the reader and
     * the side preview so both ends store a note the same way: an empty save on
     * an existing note deletes it, surrounding whitespace is dropped, and inner
     * line breaks stay. The draft's colour/size/family are written only when it
     * names them, so older notes keep their exact stored shape.
     * @param {Array<object>} list - the page's annotations.
     * @param {{ index: number, x: number, y: number, w?: number, h?: number, color?: string, fontSize?: number, fontFamily?: string, textAlign?: string }} draft - the edited note.
     * @param {string} raw - what the editor holds.
     * @returns {Array<object>} the new list (a copy; the input is untouched).
     */
    function applyNote(list, draft, raw) {
      const value = String(raw ?? '').replace(/^\s+|\s+$/g, '')
      const next = Array.isArray(list) ? [...list] : []
      const style = {}
      if (draft.color !== undefined) style.color = draft.color
      if (typeof draft.fontSize === 'number' && Number.isFinite(draft.fontSize)) style.fontSize = draft.fontSize
      if (typeof draft.fontFamily === 'string' && draft.fontFamily !== '') style.fontFamily = draft.fontFamily
      if (typeof draft.textAlign === 'string' && draft.textAlign !== '') style.textAlign = draft.textAlign
      // Bold/italic are just two more style fields; an old note without them
      // keeps whatever it had, because only an explicit choice is copied.
      if (draft.fontWeight === 'bold' || draft.fontWeight === 'normal') style.fontWeight = draft.fontWeight
      if (draft.fontStyle === 'italic' || draft.fontStyle === 'normal') style.fontStyle = draft.fontStyle
      if (Number.isFinite(draft.w) && draft.w > 0) style.w = draft.w
      if (Number.isFinite(draft.h) && draft.h > 0) style.h = draft.h
      if (draft.index >= 0 && draft.index < next.length) {
        if (value === '') next.splice(draft.index, 1)
        else next[draft.index] = { ...next[draft.index], text: value, ...style }
        return next
      }
      if (value !== '') next.push({ kind: 'text', x: draft.x, y: draft.y, text: value, ...style })
      return next
    }

    /**
     * Where a pointer event lands on a page-sized layer, in page coordinates
     * (0..1). Every annotation layer is exactly the page box, so the same
     * numbers work at any zoom and in any column.
     * @param {{ clientX: number, clientY: number }} event - the pointer event.
     * @param {Element | null} node - the page-sized element.
     * @returns {[number, number] | null} the point, or null when the box has no area.
     */
    function inkPointOf(event, node) {
      if (node === null || node === undefined || typeof node.getBoundingClientRect !== 'function') return null
      const rect = node.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      return [
        Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
        Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
      ]
    }

    /**
     * Where a pointer lands in page coordinates **without** clamping to the
     * page: the shared plane lets a mark live outside the page, so a point
     * there has to keep its sign and distance.
     * @param {{ clientX: number, clientY: number }} event - the pointer event.
     * @param {Element | null} node - the page-sized element.
     * @returns {[number, number] | null} the point, or null when the box has no area.
     */
    function inkPointOfFree(event, node) {
      if (node === null || node === undefined || typeof node.getBoundingClientRect !== 'function') return null
      const rect = node.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      return [
        (event.clientX - rect.left) / rect.width,
        (event.clientY - rect.top) / rect.height,
      ]
    }

    /**
     * How far a mark may sit outside its page, in page units. These are the
     * defaults: five page widths to each side and one page height above and
     * below. The toolbar can add a page at a time; the value is remembered.
     */
    const PLANE_MARGINS_KEY = 'pdfdesk:plane-margins'
    const PLANE_MARGINS = { left: 5, right: 5, top: 1, bottom: 1 }

    /**
     * The margins of the shared plane, as the user last widened them.
     * @returns {{ left: number, right: number, top: number, bottom: number }} page units.
     */
    function readPlaneMargins() {
      try {
        const raw = window.localStorage.getItem(PLANE_MARGINS_KEY)
        if (raw === null) return { ...PLANE_MARGINS }
        const parsed = JSON.parse(raw)
        const source = parsed !== null && typeof parsed === 'object' ? parsed : {}
        const pick = (value, fallback) => {
          const number = Math.round(Number(value))
          return Number.isFinite(number) ? Math.min(50, Math.max(0, number)) : fallback
        }
        return {
          left: pick(source.left, PLANE_MARGINS.left),
          right: pick(source.right, PLANE_MARGINS.right),
          top: pick(source.top, PLANE_MARGINS.top),
          bottom: pick(source.bottom, PLANE_MARGINS.bottom),
        }
      } catch {
        return { ...PLANE_MARGINS }
      }
    }

    /**
     * Remember the plane's margins.
     * @param {{ left: number, right: number, top: number, bottom: number }} margins - page units.
     * @returns {void}
     */
    function writePlaneMargins(margins) {
      try {
        window.localStorage.setItem(PLANE_MARGINS_KEY, JSON.stringify(margins))
      } catch {
        // storage unavailable: the wider plane lasts this visit
      }
    }

    /** Everything that shows the plane listens here, so a "+" in one pane is
     * immediately true in the other. */
    const planeMarginListeners = new Set()

    /**
     * The plane's margins, shared by every mounted pane and kept in step when
     * either pane adds a page.
     * @returns {{ left: number, right: number, top: number, bottom: number }} page units.
     */
    function usePlaneMargins() {
      const [margins, setMargins] = useState(() => readPlaneMargins())
      useEffect(() => {
        planeMarginListeners.add(setMargins)
        return () => { planeMarginListeners.delete(setMargins) }
      }, [])
      return margins
    }

    /**
     * Add one page to one side of the plane, in every pane at once.
     * @param {'left'|'right'|'top'|'bottom'} side - which edge.
     * @returns {{ left: number, right: number, top: number, bottom: number }} the new margins.
     */
    function expandPlaneMargin(side) {
      const current = readPlaneMargins()
      const next = { ...current, [side]: Math.min(50, current[side] + 1) }
      writePlaneMargins(next)
      for (const listener of [...planeMarginListeners]) {
        try { listener(next) } catch { /* a pane that is closing */ }
      }
      return next
    }

    /**
     * Keep a free pointer point inside the shared plane's margin.
     * @param {[number, number]} point - unclamped page coordinates.
     * @param {{ left: number, right: number, top: number, bottom: number }} [margins] - the plane.
     * @returns {[number, number]} the point inside the plane.
     */
    function clampInkPoint(point, margins) {
      const plane = margins === undefined || margins === null ? PLANE_MARGINS : margins
      const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
      return [
        clamp(point[0], -plane.left, 1 + plane.right),
        clamp(point[1], -plane.top, 1 + plane.bottom),
      ]
    }

    /**
     * The shared plane as one object: margins plus every geometry question both
     * panes and the viewer ask from them. Kept in one place so the reader and
     * the right preview cannot drift apart again.
     * @param {{ left: number, right: number, top: number, bottom: number }} [margins] - the plane; defaults to the stored one.
     * @returns {object} `clampPoint`, `panLimit`, `clampPan`, `pageAtPointer`.
     */
    function createPlane(margins) {
      const plane = margins === undefined || margins === null ? readPlaneMargins() : margins
      return {
        margins: plane,
        /**
         * @param {[number, number]} point - unclamped page coordinates.
         * @returns {[number, number]} the point inside the plane.
         */
        clampPoint(point) {
          return clampInkPoint(point, plane)
        },
        /**
         * How far a page may move, in pixels, at this painted size.
         * @param {{ width: number, height: number }} size - painted page size.
         * @returns {{ minX: number, maxX: number, minY: number, maxY: number }} the range.
         */
        panLimit(size) {
          const width = size.width > 0 ? size.width : 600
          const height = size.height > 0 ? size.height : 800
          return {
            minX: -Math.round(width * plane.left),
            maxX: Math.round(width * plane.right),
            minY: -Math.round(height * plane.top),
            maxY: Math.round(height * plane.bottom + 24),
          }
        },
        /**
         * @param {{ x: number, y: number }} value - the wanted pan.
         * @param {{ width: number, height: number }} size - painted page size.
         * @returns {{ x: number, y: number }} the pan clamped to the plane.
         */
        clampPan(value, size) {
          const limit = this.panLimit(size)
          return {
            x: Math.min(limit.maxX, Math.max(limit.minX, value.x)),
            y: Math.min(limit.maxY, Math.max(limit.minY, value.y)),
          }
        },
        /**
         * The page whose paper is under the pointer, nearest by vertical distance.
         * @param {MouseEvent} event - pointer event.
         * @param {Map<number, HTMLElement>} nodes - mounted page boxes by page number.
         * @returns {number | null} the page number.
         */
        pageAtPointer(event, nodes) {
          let best = null
          let distance = Number.POSITIVE_INFINITY
          for (const [page, node] of nodes) {
            if (node === null || node === undefined || node.isConnected === false) continue
            const rect = node.getBoundingClientRect()
            if (rect.width === 0 || rect.height === 0) continue
            const gap = event.clientY < rect.top
              ? rect.top - event.clientY
              : event.clientY > rect.bottom ? event.clientY - rect.bottom : 0
            if (gap < distance) {
              distance = gap
              best = page
            }
          }
          return best
        },
      }
    }

    /**
     * Whether one mark lies inside its page. Off-page marks belong to the shared
     * plane; the page views hide them so they cannot bleed over the toolbar.
     * @param {object} entry - a stored annotation.
     * @returns {boolean} true when every anchor is on the page.
     */
    /**
     * How far a hit test reaches at one box width: ~8px of slack plus half the
     * stroke's own width, in page units.
     * @param {number} widthPx - the stroke's width in pixels.
     * @param {number} boxWidth - the page box's width in pixels.
     * @returns {number} the reach in page units.
     */
    function inkReach(widthPx, boxWidth) {
      return (8 + widthPx / 2) / Math.max(1, boxWidth)
    }

    /**
     * Whether a point touches one stroke: the nearest point on any segment.
     * @param {object} stroke - a stored stroke.
     * @param {[number, number]} point - the pointer in page coordinates.
     * @param {number} reach - the tolerance in page units.
     * @returns {boolean} true when the point is within reach of the line.
     */
    function inkStrokeHits(stroke, point, reach) {
      const points = Array.isArray(stroke.points) ? stroke.points : []
      for (let index = 1; index < points.length; index += 1) {
        const [x1, y1] = points[index - 1]
        const [x2, y2] = points[index]
        const dx = x2 - x1
        const dy = y2 - y1
        const length = dx * dx + dy * dy
        const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - x1) * dx + (point[1] - y1) * dy) / length))
        const dist = Math.hypot(point[0] - (x1 + t * dx), point[1] - (y1 + t * dy))
        if (dist < reach) return true
      }
      return false
    }

    /**
     * Whether a point touches one mark: a text note's rough box, or a stroke.
     * The reach comes in as a function of stroke width, so each column keeps its
     * own eraser size while the math stays in one place.
     * @param {object} entry - a stored mark (text or stroke).
     * @param {[number, number]} point - the pointer in page coordinates.
     * @param {(widthPx: number) => number} reachForWidth - pixel width to page units.
     * @returns {boolean} true when the point hits the mark.
     */
    function inkHit(entry, point, reachForWidth) {
      if (entry.kind === 'text') {
        const reach = reachForWidth(2)
        const box = noteBox(entry)
        return point[0] >= box.x - reach && point[0] <= box.x + box.w + reach
          && point[1] >= box.y - reach && point[1] <= box.y + box.h + reach
      }
      if (entry.kind === 'shape') {
        const reach = reachForWidth(Number(entry.width) || 2) + 0.012
        if (entry.shape === 'line' || entry.shape === 'arrow') {
          const x0 = entry.x0
          const y0 = entry.y0
          const x1 = entry.x1
          const y1 = entry.y1
          const dx = x1 - x0
          const dy = y1 - y0
          const length = dx * dx + dy * dy
          const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - x0) * dx + (point[1] - y0) * dy) / length))
          return Math.hypot(point[0] - (x0 + t * dx), point[1] - (y0 + t * dy)) <= reach
        }
        return point[0] >= entry.x - reach && point[0] <= entry.x + entry.w + reach
          && point[1] >= entry.y - reach && point[1] <= entry.y + entry.h + reach
      }
      return inkStrokeHits(entry, point, reachForWidth(Number(entry.width) || 2))
    }


    /**
     * One stored shape. rough.js draws the wobbly hand when it is loaded and the
     * sketch strength is above zero; otherwise the same geometry is drawn clean.
     * @param {{ entry: object, roughness?: number }} props - the shape and the strength.
     * @returns {import('react').ReactElement} the SVG mark.
     */
    function ShapeMark(props) {
      const entry = props.entry
      const width = Number.isFinite(entry.width) ? entry.width : 2
      const paths = sketchPaths(entry, props.roughness ?? 1)
      const opacity = Number.isFinite(entry.opacity) ? entry.opacity : 1
      const dash = entry.strokeStyle === 'dashed' ? '7 5' : entry.strokeStyle === 'dotted' ? '2 4' : undefined
      if (paths !== null) {
        return h('g', { transform: 'scale(0.001 0.0007072)', opacity },
          paths.map((path, index) => {
            // Hachure fill paths are stroked with the fill colour at half the
            // stroke width; solid fills carry `fill` and no stroke. Neither
            // should inherit the outline's dashed style.
            const isFill = (path.fill !== undefined && path.fill !== 'none')
              || (typeof entry.fill === 'string' && entry.fill !== '' && path.stroke === entry.fill && (path.strokeWidth ?? 0) < width)
            return h('path', {
              key: index,
              d: path.d,
              fill: path.fill ?? 'none',
              stroke: path.stroke,
              strokeWidth: path.strokeWidth,
              strokeDasharray: isFill ? undefined : dash,
              vectorEffect: 'non-scaling-stroke',
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            })
          }))
      }
      const color = entry.color ?? '#e0554a'
      const common = {
        fill: entry.fill ?? 'none',
        stroke: color,
        strokeWidth: width,
        strokeDasharray: dash,
        opacity,
        vectorEffect: 'non-scaling-stroke',
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }
      if (entry.shape === 'rect') {
        return h('rect', { x: entry.x, y: entry.y, width: entry.w, height: entry.h, ...common })
      }
      if (entry.shape === 'diamond') {
        return h('polygon', {
          points: [
            `${entry.x + entry.w / 2},${entry.y}`,
            `${entry.x + entry.w},${entry.y + entry.h / 2}`,
            `${entry.x + entry.w / 2},${entry.y + entry.h}`,
            `${entry.x},${entry.y + entry.h / 2}`,
          ].join(' '),
          ...common,
        })
      }
      if (entry.shape === 'ellipse') {
        return h('ellipse', {
          cx: entry.x + entry.w / 2,
          cy: entry.y + entry.h / 2,
          rx: entry.w / 2,
          ry: entry.h / 2,
          ...common,
        })
      }
      const head = entry.shape === 'arrow'
        ? (() => {
          const angle = Math.atan2(entry.y1 - entry.y0, entry.x1 - entry.x0)
          const length = Math.max(0.012, width * 0.012)
          return [-0.5, 0.5].map((side, index) => h('line', {
            key: `head-${index}`,
            x1: entry.x1,
            y1: entry.y1,
            x2: entry.x1 - length * Math.cos(angle + side),
            y2: entry.y1 - length * Math.sin(angle + side),
            ...common,
          }))
        })()
        : null
      return h(React.Fragment, null,
        h('line', { x1: entry.x0, y1: entry.y0, x2: entry.x1, y2: entry.y1, ...common }),
        head
      )
    }

    /**
     * The one renderer for a page's committed marks: ink (pressure aware),
     * shapes and text boxes. The reader, the right preview and the read-only
     * per-page copies all use it, so a stroke can never look different in one
     * pane than in the other.
     * @param {{ entries: object[], roughness?: number, drag?: object, resize?: object,
     *   resizeEntry?: object, selection?: object, noteTitle?: string,
     *   onNotePointerDown?: Function, onNoteDoubleClick?: Function, drafts?: object[] }} props - the marks and the view's interaction state.
     * @returns {import('react').ReactElement} the marks.
     */
    function InkMarks(props) {
      const entries = Array.isArray(props.entries) ? props.entries : []
      const drag = props.drag === undefined ? null : props.drag
      const resize = props.resize === undefined ? null : props.resize
      const resizeEntry = props.resizeEntry === undefined ? null : props.resizeEntry
      const selection = props.selection === undefined ? null : props.selection
      const interactive = typeof props.onNoteDoubleClick === 'function' || typeof props.onNotePointerDown === 'function'
      const adjusted = (entry, index) => {
        if (resize !== null && resize.index === index && resizeEntry !== null) return resizeEntry
        if (drag !== null && drag.index === index) return translateEntry(entry, drag.dx, drag.dy)
        const group = props.dragGroup
        if (group !== null && group !== undefined && Array.isArray(group.indices) && group.indices.includes(index)) {
          return translateEntry(entry, group.dx, group.dy)
        }
        return entry
      }
      const selectedEntry = selection === null || entries[selection.index] === undefined ? null : entries[selection.index]
      const strokeNodes = []
      const shapeNodes = []
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index]
        if (entry.kind === 'text') continue
        const shown = adjusted(entry, index)
        if (entry.kind === 'shape') {
          shapeNodes.push(h(ShapeMark, { key: `shape-${index}`, entry: shown, roughness: props.roughness }))
          continue
        }
        const points = shown.points ?? []
        if (points.length < 2) continue
        if (points.some(point => point.length > 2)) {
          const base = shown.width ?? 2
          strokeNodes.push(h('g', { key: index, opacity: shown.opacity ?? 1 },
            points.slice(1).map((point, segment) => {
              const previous = points[segment]
              const pressure = point[2] ?? previous[2] ?? 0.5
              return h('line', {
                key: segment,
                x1: previous[0],
                y1: previous[1],
                x2: point[0],
                y2: point[1],
                stroke: shown.color ?? '#e0554a',
                strokeWidth: base * (0.35 + pressure * 1.2),
                vectorEffect: 'non-scaling-stroke',
                strokeLinecap: 'round',
              })
            })))
          continue
        }
        strokeNodes.push(h('polyline', {
          key: index,
          points: points.map(point => `${point[0]},${point[1]}`).join(' '),
          fill: 'none',
          stroke: shown.color ?? '#e0554a',
          strokeWidth: shown.width ?? 2,
          opacity: shown.opacity ?? 1,
          vectorEffect: 'non-scaling-stroke',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }))
      }
      // Iterating `entries` (not a filtered list) keeps the note index aligned
      // with the stored list, so editing and selection address the right entry.
      const noteNodes = entries.map((entry, index) => {
        if (entry.kind !== 'text') return null
        if (typeof props.hiddenNoteIndex === 'number' && props.hiddenNoteIndex === index) return null
        const shown = adjusted(entry, index)
        const bounds = noteBox(shown)
        const hasBox = Number.isFinite(shown.w) && shown.w > 0 && Number.isFinite(shown.h) && shown.h > 0
        return h('div', {
          key: `text-${index}`,
          className: selection !== null && selection.index === index ? 'md-annot-text md-annot-selected' : 'md-annot-text',
          title: props.noteTitle,
          style: {
            left: `${bounds.x * 100}%`,
            top: `${bounds.y * 100}%`,
            ...(hasBox ? { width: `${bounds.w * 100}%`, height: `${bounds.h * 100}%` } : { maxWidth: '70%' }),
            color: entry.color ?? '#e0554a',
            fontSize: Number.isFinite(entry.fontSize) ? `${entry.fontSize}px` : undefined,
            fontFamily: typeof entry.fontFamily === 'string' ? (NOTE_FONTS[entry.fontFamily] ?? undefined) : undefined,
            opacity: entry.opacity ?? 1,
            textAlign: typeof entry.textAlign === 'string' ? entry.textAlign : 'left',
            fontWeight: entry.fontWeight === 'bold' ? 'bold' : 'normal',
            fontStyle: entry.fontStyle === 'italic' ? 'italic' : undefined,
          },
          onPointerDown: interactive && typeof props.onNotePointerDown === 'function'
            ? event => props.onNotePointerDown(index, event)
            : undefined,
          onContextMenu: typeof props.onNoteContextMenu === 'function'
            ? event => props.onNoteContextMenu(index, event)
            : undefined,
          onDoubleClick: interactive && typeof props.onNoteDoubleClick === 'function'
            ? event => props.onNoteDoubleClick(index, event, entry)
            : undefined,
        }, entry.text)
      })
      return h(React.Fragment, null,
        h('svg', {
          className: 'md-annot-ink',
          viewBox: '0 0 1 1',
          preserveAspectRatio: 'none',
          'aria-hidden': true,
        },
          selectedEntry !== null && selectedEntry.kind !== 'text' && selectedEntry.kind !== 'shape'
            ? h('polyline', {
              key: 'selection',
              points: (selectedEntry.points ?? []).map(point => `${point[0]},${point[1]}`).join(' '),
              fill: 'none',
              stroke: '#2f6df6',
              strokeWidth: (selectedEntry.width ?? 2) + 8,
              opacity: 0.35,
              vectorEffect: 'non-scaling-stroke',
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            })
            : null,
          selectedEntry !== null && selectedEntry.kind === 'shape'
            ? h('rect', {
              key: 'selection-shape',
              x: selectedEntry.x,
              y: selectedEntry.y,
              width: selectedEntry.w,
              height: selectedEntry.h,
              fill: 'none',
              stroke: '#2f6df6',
              strokeWidth: 1.5,
              strokeDasharray: '5 4',
              vectorEffect: 'non-scaling-stroke',
            })
            : null,
          strokeNodes,
          shapeNodes,
          props.drafts === undefined ? null : props.drafts),
        noteNodes)
    }

    /**
     * The text style controls (size slider, font family, colour). They live in
     * the top toolbar's nested menu, not in the in-place editor.
     * @param {{ style: object, onChange: (patch: object) => void }} props - current style and the setter.
     * @returns {import('react').ReactElement} the control rows.
     */
    function NoteStyleControls(props) {
      const style = props.style
      const size = Number.isFinite(style.fontSize) ? style.fontSize : NOTE_SIZES[0]
      const family = typeof style.fontFamily === 'string' && NOTE_FONTS[style.fontFamily] !== undefined ? style.fontFamily : 'normal'
      const color = typeof style.color === 'string' && style.color !== '' ? style.color : NOTE_COLORS[0]
      const bold = style.fontWeight === 'bold'
      const italic = style.fontStyle === 'italic'
      const align = typeof style.textAlign === 'string' ? style.textAlign : 'left'
      return h(React.Fragment, null,
        h('div', { className: 'md-note-style-row' },
          h('span', { className: 'md-note-style-label' }, format('annotFontSize')),
          h('input', {
            type: 'range',
            className: 'md-note-size-range',
            min: 12, max: 48, step: 1,
            value: size,
            'aria-label': format('annotFontSize'),
            onChange: event => props.onChange({ fontSize: Number(event.target.value) }),
          }),
          h('span', { className: 'md-note-size-value' }, `${size}px`)
        ),
        h('div', { className: 'md-note-style-row' },
          h('span', { className: 'md-note-style-label' }, format('annotFontFamily')),
          Object.keys(NOTE_FONTS).map(key => h(KitButton, {
            key,
            type: 'button',
            className: 'md-note-style-btn',
            'data-on': family === key ? 'true' : undefined,
            onMouseDown: event => event.preventDefault(),
            onClick: () => props.onChange({ fontFamily: key }),
          }, format(`annotFont.${key}`)))
        ),
        h('div', { className: 'md-note-style-row' },
          h('span', { className: 'md-note-style-label' }, format('annotTextStyle')),
          h(KitButton, {
            type: 'button',
            className: 'md-note-style-btn md-note-style-bold',
            'data-on': bold ? 'true' : undefined,
            'aria-pressed': bold ? 'true' : 'false',
            title: format('annotBold'),
            'aria-label': format('annotBold'),
            onMouseDown: event => event.preventDefault(),
            onClick: () => props.onChange({ fontWeight: bold ? 'normal' : 'bold' }),
          }, 'B'),
          h(KitButton, {
            type: 'button',
            className: 'md-note-style-btn md-note-style-italic',
            'data-on': italic ? 'true' : undefined,
            'aria-pressed': italic ? 'true' : 'false',
            title: format('annotItalic'),
            'aria-label': format('annotItalic'),
            onMouseDown: event => event.preventDefault(),
            onClick: () => props.onChange({ fontStyle: italic ? 'normal' : 'italic' }),
          }, 'I')
        ),
        h('div', { className: 'md-note-style-row' },
          h('span', { className: 'md-note-style-label' }, format('alignTitle')),
          [['left', 'alignLeft'], ['center', 'alignCenter'], ['right', 'alignRight']].map(item => h(KitButton, {
            key: item[0],
            type: 'button',
            className: 'md-note-style-btn',
            'data-on': align === item[0] ? 'true' : undefined,
            'aria-pressed': align === item[0] ? 'true' : 'false',
            onMouseDown: event => event.preventDefault(),
            onClick: () => props.onChange({ textAlign: item[0] }),
          }, format(item[1])))
        ),
        h('div', { className: 'md-note-style-row' },
          h('span', { className: 'md-note-style-label' }, format('annotColor')),
          NOTE_COLORS.map(value => h(KitButton, {
            key: value,
            type: 'button',
            className: 'md-note-color',
            style: { background: value },
            'data-on': color === value ? 'true' : undefined,
            'aria-label': format('annotColor'),
            onMouseDown: event => event.preventDefault(),
            onClick: () => props.onChange({ color: value }),
          }))
        )
      )
    }

    /**
     * The top toolbar's "text parameters" menu: a toolbar button that opens the
     * size/family/colour rows, so the in-place editor stays a bare textarea.
     * @param {{ style: object, onChange: (patch: object) => void }} props - the style to edit.
     * @returns {import('react').ReactElement} the nested menu.
     */
    function NoteStyleMenu(props) {
      const [open, setOpen] = useState(false)
      return h('span', { className: 'md-note-style-wrap' },
        h(KitButton, {
          type: 'button',
          className: 'md-btn md-btn-small md-note-style-trigger',
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          title: format('annotTextHint'),
          onMouseDown: event => event.preventDefault(),
          onClick: () => setOpen(value => !value),
        }, `${format('annotText')} ▾`),
        open
          ? h('div', { className: 'md-note-style-popover', role: 'menu' },
            h(NoteStyleControls, { style: props.style, onChange: props.onChange }))
          : null
      )
    }

    /**
     * In-place editor for a text note. The note is typed on the page: Enter
     * saves, Shift+Enter breaks the line, Esc throws the draft away, and a blur
     * saves what is there. The style controls live in the toolbar now, so the
     * editor is only the transparent textarea with a dashed position outline.
     * @param {{ draft: { text: string, color?: string, fontSize?: number, fontFamily?: string },
     *   onChange: (text: string) => void,
     *   onSave: () => void, onCancel: () => void }} props - the open draft.
     * @returns {import('react').ReactElement} the editor.
     */
    function NoteEditor(props) {
      const draft = props.draft
      const size = Number.isFinite(draft.fontSize) ? draft.fontSize : NOTE_SIZES[0]
      const family = typeof draft.fontFamily === 'string' && NOTE_FONTS[draft.fontFamily] !== undefined ? draft.fontFamily : 'normal'
      const color = typeof draft.color === 'string' && draft.color !== '' ? draft.color : NOTE_COLORS[0]
      const [value, setValue] = useState(String(draft.text ?? ''))
      const areaRef = useRef(null)
      const editorRef = useRef(null)
      const closed = useRef(false)
      useEffect(() => {
        const node = areaRef.current
        if (node === null) return
        node.focus()
        try {
          node.setSelectionRange(node.value.length, node.value.length)
        } catch {
          // some engines refuse selection on a hidden field: focus is enough
        }
      }, [])
      const finish = save => {
        if (closed.current) return
        closed.current = true
        if (save) props.onSave()
        else props.onCancel()
      }
      // The editor is the note box itself: drag-created boxes open at their
      // exact size, and older point notes fall back to a small default box.
      // The canvas mode passes `unbounded`: the box may sit outside the page.
      const unbounded = props.unbounded === true
      const left = unbounded ? Number(draft.x) || 0 : Math.min(1, Math.max(0, draft.x))
      const top = unbounded ? Number(draft.y) || 0 : Math.min(1, Math.max(0, draft.y))
      const width = Math.max(0.04, Number.isFinite(draft.w) ? draft.w : 0.38)
      const height = Math.max(0.035, Number.isFinite(draft.h) ? draft.h : 0.09)
      const pageWidth = unbounded ? width : Math.min(1 - left, width)
      const pageHeight = unbounded ? height : Math.min(1 - top, height)
      return h('div', {
        className: 'md-note-editor',
        ref: editorRef,
        style: { left: `${left * 100}%`, top: `${top * 100}%`, width: `${pageWidth * 100}%`, height: `${pageHeight * 100}%` },
        onPointerDown: event => event.stopPropagation(),
        onPointerMove: event => event.stopPropagation(),
        onDoubleClick: event => event.stopPropagation(),
        // No native menu: this build's textarea menu is dead, so suppress it
        // rather than leave a menu whose rows cannot be clicked.
        onContextMenu: event => { event.preventDefault(); event.stopPropagation() },
      },
        h('textarea', {
          ref: areaRef,
          className: 'md-note-input',
          value,
          rows: Math.min(8, Math.max(2, value.split('\n').length)),
          spellCheck: false,
          placeholder: format('annotTextPlaceholder'),
          'aria-label': format('annotTextPrompt'),
          style: {
            fontSize: `${size}px`,
            fontFamily: NOTE_FONTS[family],
            color,
            fontStyle: draft.fontStyle === 'italic' ? 'italic' : 'normal',
            fontWeight: draft.fontWeight === 'bold' ? 'bold' : 'normal',
            textAlign: typeof draft.textAlign === 'string' ? draft.textAlign : 'left',
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            outline: 'none',
            resize: 'none',
          },
          onChange: event => {
            setValue(event.target.value)
            props.onChange(event.target.value)
          },
          onKeyDown: event => {
            event.stopPropagation()
            if (event.key === 'Escape') {
              event.preventDefault()
              finish(false)
              return
            }
            // Enter while an IME is composing confirms the candidate, not the note.
            const composing = event.nativeEvent === undefined ? false : event.nativeEvent.isComposing === true
            if (event.key === 'Enter' && !event.shiftKey && !composing) {
              event.preventDefault()
              finish(true)
            }
          },
          onBlur: event => {
            const next = event.relatedTarget
            if (next !== null && next !== undefined
              && (editorRef.current !== null && editorRef.current.contains(next)
                || (typeof next.closest === 'function' && next.closest('.md-note-style-popover, .md-note-style-trigger') !== null))) return
            finish(true)
          },
        })
      )
    }

    /**
     * A small writable pad that shows pen pressure as line width, so a user can
     * see whether their stylus reports pressure before they rely on it. It is a
     * diagnostic only: nothing is saved, uploaded, or attached to any page.
     * @returns {import('react').ReactElement} the pad.
     */
    function PressurePad() {
      const canvasRef = useRef(null)
      const stroke = useRef(null)
      const [reading, setReading] = useState(null)
      const [drawing, setDrawing] = useState(false)
      const widthOf = pressure => 2 + Math.round(pressure * 10 * 10) / 10

      // Size the bitmap to the CSS box (and the device pixel ratio), then clear
      // it: the pad is a scratch surface, not a saved drawing.
      useEffect(() => {
        const node = canvasRef.current
        if (node === null) return undefined
        const resize = () => {
          const rect = node.getBoundingClientRect()
          const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
          node.width = Math.max(1, Math.floor(rect.width * dpr))
          node.height = Math.max(1, Math.floor(rect.height * dpr))
          const context = node.getContext('2d')
          if (context !== null) {
            context.setTransform(dpr, 0, 0, dpr, 0, 0)
            context.clearRect(0, 0, rect.width, rect.height)
          }
        }
        resize()
        window.addEventListener('resize', resize)
        return () => window.removeEventListener('resize', resize)
      }, [])

      const pointOf = event => {
        const node = canvasRef.current
        if (node === null) return null
        const rect = node.getBoundingClientRect()
        return { x: event.clientX - rect.left, y: event.clientY - rect.top }
      }
      // A mouse (or a pen that reports no pressure) keeps the default width; the
      // pad shows that, so "why is my line always the same" has an answer.
      const pressureOf = event => {
        const value = Number(event.pressure)
        if (event.pointerType === 'pen' && Number.isFinite(value) && value > 0) return Math.min(1, Math.max(0.05, value))
        return null
      }
      const begin = event => {
        if (event.button !== 0) return
        const point = pointOf(event)
        if (point === null) return
        event.preventDefault()
        const pressure = pressureOf(event)
        stroke.current = { point, pressure }
        setDrawing(true)
        setReading({ pressure, width: pressure === null ? widthOf(0.5) : widthOf(pressure) })
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* capture is a nicety */ }
      }
      const move = event => {
        const current = stroke.current
        if (current === null) return
        const point = pointOf(event)
        if (point === null) return
        event.preventDefault()
        const pressure = pressureOf(event)
        const width = pressure === null ? widthOf(0.5) : widthOf(pressure)
        const node = canvasRef.current
        const context = node === null ? null : node.getContext('2d')
        if (context !== null) {
          context.strokeStyle = '#2f6df6'
          context.lineCap = 'round'
          context.lineJoin = 'round'
          context.lineWidth = width
          context.beginPath()
          context.moveTo(current.point.x, current.point.y)
          context.lineTo(point.x, point.y)
          context.stroke()
        }
        stroke.current = { point, pressure }
        setReading({ pressure, width })
      }
      const end = () => {
        if (stroke.current === null) return
        stroke.current = null
        setDrawing(false)
      }
      const clear = () => {
        const node = canvasRef.current
        const context = node === null ? null : node.getContext('2d')
        if (node !== null && context !== null) {
          const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
          context.setTransform(1, 0, 0, 1, 0, 0)
          context.clearRect(0, 0, node.width, node.height)
          // Keep the DPR mapping the next stroke expects.
          context.setTransform(dpr, 0, 0, dpr, 0, 0)
        }
        setReading(null)
      }
      return h('div', { className: 'md-pressure' },
        h('canvas', {
          className: 'md-pressure-pad',
          ref: canvasRef,
          role: 'img',
          'aria-label': format('pressurePadLabel'),
          'data-drawing': drawing ? 'true' : undefined,
          onPointerDown: begin,
          onPointerMove: move,
          onPointerUp: end,
          onPointerCancel: end,
          onPointerLeave: end,
        }),
        h('div', { className: 'md-pressure-read', role: 'status' },
          reading === null
            ? format('pressureIdle')
            : reading.pressure === null
              ? format('pressureNoPen', { width: reading.width.toFixed(1) })
              : format('pressureReading', { pressure: reading.pressure.toFixed(2), width: reading.width.toFixed(1) })
        ),
        h(KitButton, { type: 'button', className: 'md-btn md-btn-small', onClick: clear }, format('pressureClear'))
      )
    }

    /**
     * Move or resize one question rect by a page-fraction delta. The result stays
     * inside the page, and a corner drag never flips the rect.
     * @param {{ x: number, y: number, w: number, h: number }} rect - the rect before the drag.
     * @param {'move'|'nw'|'ne'|'sw'|'se'} mode - what is being dragged.
     * @param {number} dx - horizontal delta in page fractions.
     * @param {number} dy - vertical delta in page fractions.
     * @returns {{ x: number, y: number, w: number, h: number }} the new rect.
     */
    function resizeQuestionRect(rect, mode, dx, dy) {
      const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
      const MIN = 0.01
      let x = Number(rect.x) || 0
      let y = Number(rect.y) || 0
      let w = Number(rect.w) || MIN
      let h = Number(rect.h) || MIN
      if (mode === 'move') {
        return { x: clamp(x + dx, 0, 1 - w), y: clamp(y + dy, 0, 1 - h), w, h }
      }
      const right = x + w
      const bottom = y + h
      if (mode.includes('w')) {
        x = clamp(x + dx, 0, right - MIN)
        w = right - x
      }
      if (mode.includes('e')) w = clamp(w + dx, MIN, 1 - x)
      if (mode.includes('n')) {
        y = clamp(y + dy, 0, bottom - MIN)
        h = bottom - y
      }
      if (mode.includes('s')) h = clamp(h + dy, MIN, 1 - y)
      return { x, y, w, h }
    }

    /**
     * The number the next default name (`疑问 N`) should take: the smallest
     * positive number no current mark is named with. A deleted mark therefore
     * gives its number back instead of leaving a gap that the next mark skips.
     * @param {object[]} questions - the chapter's marks.
     * @returns {number} the number to use.
     */
    function nextQuestionNumber(questions) {
      const used = new Set()
      for (const item of Array.isArray(questions) ? questions : []) {
        const match = /^疑问\s*(\d+)$/.exec(String(item !== null && item !== undefined ? item.name : ''))
        if (match !== null) used.add(Number(match[1]))
      }
      let number = 1
      while (used.has(number)) number += 1
      return number
    }

    /**
     * One chapter's question undo/redo stacks, shared by the reader and the
     * right preview: deleting or moving a mark is an edit like ink is, and the
     * toolbar's undo puts it back. Memory only: it is a gesture log, not part
     * of the chapter.
     */
    const questionHistory = new Map()

    /** The last kind of edit per chapter, so undo knows which stack to use. */
    const chapterEditKind = new Map()

    /**
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {string} the chapter key both panes share.
     */
    function chapterKey(bookId, code) {
      return `${bookId}|${code}`
    }

    /**
     * @param {string} key - chapter key.
     * @param {'ink'|'question'} kind - what was edited last.
     * @returns {void}
     */
    function markEditKind(key, kind) {
      chapterEditKind.set(key, kind)
    }

    /**
     * @param {string} key - chapter key.
     * @returns {{ undo: object[], redo: object[] }} the chapter's stacks.
     */
    function questionBucket(key) {
      let bucket = questionHistory.get(key)
      if (bucket === undefined) {
        bucket = { undo: [], redo: [] }
        questionHistory.set(key, bucket)
        while (questionHistory.size > 60) {
          const oldest = questionHistory.keys().next().value
          if (oldest === key) break
          questionHistory.delete(oldest)
        }
      }
      return bucket
    }

    /**
     * @param {string} key - chapter key.
     * @returns {number} how many question steps can be undone.
     */
    function questionUndoDepth(key) {
      const bucket = questionHistory.get(key)
      return bucket === undefined ? 0 : bucket.undo.length
    }

    /**
     * @param {string} key - chapter key.
     * @returns {number} how many question steps can be redone.
     */
    function questionRedoDepth(key) {
      const bucket = questionHistory.get(key)
      return bucket === undefined ? 0 : bucket.redo.length
    }

    /**
     * File a question edit, dropping the redo branch.
     * @param {string} key - chapter key.
     * @param {{ questions: object[], next: number }} snapshot - the marks before the edit.
     * @returns {void}
     */
    function recordQuestionEdit(key, snapshot) {
      const bucket = questionBucket(key)
      bucket.undo.push(snapshot)
      if (bucket.undo.length > 50) bucket.undo.shift()
      bucket.redo.length = 0
      markEditKind(key, 'question')
    }

    /**
     * @param {string} key - chapter key.
     * @param {{ questions: object[], next: number }} current - the marks now.
     * @returns {{ questions: object[], next: number } | null} what to restore.
     */
    function undoQuestionEdit(key, current) {
      const bucket = questionBucket(key)
      const previous = bucket.undo.pop()
      if (previous === undefined) return null
      bucket.redo.push(current)
      if (bucket.redo.length > 50) bucket.redo.shift()
      markEditKind(key, 'question')
      return previous
    }

    /**
     * @param {string} key - chapter key.
     * @param {{ questions: object[], next: number }} current - the marks now.
     * @returns {{ questions: object[], next: number } | null} what to restore.
     */
    function redoQuestionEdit(key, current) {
      const bucket = questionBucket(key)
      const next = bucket.redo.pop()
      if (next === undefined) return null
      bucket.undo.push(current)
      if (bucket.undo.length > 50) bucket.undo.shift()
      markEditKind(key, 'question')
      return next
    }

    /**
     * Question marks on one page: a thin border per mark, its name on hover, and
     * the drag / resize / rename / right-click-delete gestures. The layer only
     * takes pointer events while a mark tool is picked, so drawing behind it
     * stays possible.
     * @param {{ questions: object[], active: boolean, create: boolean, flash: string, onCreate: Function, onCommit: Function, onDelete: Function, onRename: Function }} props - marks and handlers.
     * @returns {import('react').ReactElement} the layer.
     */
    function QuestionMarks(props) {
      const layer = useRef(null)
      const [draft, setDraft] = useState(null)
      const [drag, setDrag] = useState(null)
      const [editing, setEditing] = useState(null)
      const active = props.active === true
      const create = props.create === true
      // No tool picked: the page is a reading surface, so a mark may take the
      // pointer itself and a double-click on the box renames it. With a tool
      // picked the capture layer sits above, so drawing across a mark still wins.
      const reading = props.reading === true
      /**
       * Whether a pointer landed on a part of the mark that owns its gestures.
       * @param {EventTarget | null} target - the event target.
       * @param {string} selector - the part's selector.
       * @returns {boolean} true when the part (or a descendant) was hit.
       */
      const insideOf = (target, selector) => target !== null && target !== undefined
        && typeof target.closest === 'function' && target.closest(selector) !== null
      const pointOf = event => {
        const node = layer.current
        if (node === null) return null
        const rect = node.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return null
        return {
          point: [
            Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
            Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
          ],
          width: rect.width,
          height: rect.height,
        }
      }
      const beginCreate = event => {
        if (!active || !create || event.button !== 0) return
        if (event.target !== layer.current) return
        const at = pointOf(event)
        if (at === null) return
        event.preventDefault()
        setEditing(null)
        setDraft({ from: at.point, to: at.point })
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* capture is a nicety */ }
      }
      const moveCreate = event => {
        if (draft === null) return
        const at = pointOf(event)
        if (at === null) return
        event.preventDefault()
        setDraft(current => (current === null ? null : { ...current, to: at.point }))
      }
      const endCreate = event => {
        if (draft === null) return
        const at = pointOf(event)
        const to = at === null ? draft.to : at.point
        const rect = questionRect(draft.from, to)
        const width = at === null ? 0 : at.width
        const height = at === null ? 0 : at.height
        setDraft(null)
        // A click (or a tiny drag) is not a mark: the user must drag an area.
        if (rect.w * width < QUESTION_MIN_W || rect.h * height < QUESTION_MIN_H) return
        props.onCreate(rect)
      }
      const beginDrag = (event, question, mode) => {
        if (!active || event.button !== 0) return
        // The field and the name are not drag handles: a press in the field must
        // focus it, and a press on the name must leave the double-click that
        // renames it alone. Capturing the pointer here retargets the click to
        // the mark, so the label never sees the gesture.
        if (insideOf(event.target, '.md-question-input') || insideOf(event.target, '.md-question-name')) return
        event.preventDefault()
        event.stopPropagation()
        const at = pointOf(event)
        if (at === null) return
        setEditing(null)
        setDrag({ id: question.id, mode, start: at.point, origin: { ...question.rect }, delta: [0, 0] })
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* capture is a nicety */ }
      }
      const moveDrag = event => {
        if (drag === null) return
        const at = pointOf(event)
        if (at === null) return
        event.preventDefault()
        const delta = [at.point[0] - drag.start[0], at.point[1] - drag.start[1]]
        setDrag(current => (current === null ? null : { ...current, delta }))
      }
      const endDrag = () => {
        if (drag === null) return
        const rect = resizeQuestionRect(drag.origin, drag.mode, drag.delta[0], drag.delta[1])
        setDrag(null)
        // A press that did not move the mark is not an edit: it must not spend
        // an undo step either.
        if (drag.delta[0] === 0 && drag.delta[1] === 0) return
        props.onCommit(drag.id, rect)
      }
      const commitRename = () => {
        const current = editing
        if (current === null) return
        setEditing(null)
        const name = String(current.value).trim()
        if (name === '') return
        // Closing the field without changing the name is not an edit.
        const target = Array.isArray(props.questions) ? props.questions.find(item => item.id === current.id) : undefined
        if (target !== undefined && String(target.name).trim() === name) return
        props.onRename(current.id, name)
      }
      const styleOf = rect => ({
        left: `${Math.min(1, Math.max(0, rect.x)) * 100}%`,
        top: `${Math.min(1, Math.max(0, rect.y)) * 100}%`,
        width: `${Math.min(1, Math.max(0, rect.w)) * 100}%`,
        height: `${Math.min(1, Math.max(0, rect.h)) * 100}%`,
      })
      return h('div', {
        className: 'md-questions',
        'data-active': active ? 'true' : undefined,
        'data-reading': reading ? 'true' : undefined,
        ref: layer,
        onPointerDown: beginCreate,
        onPointerMove: moveCreate,
        onPointerUp: endCreate,
        onPointerCancel: () => setDraft(null),
      },
        props.questions.map(question => {
          const live = drag !== null && drag.id === question.id
            ? resizeQuestionRect(drag.origin, drag.mode, drag.delta[0], drag.delta[1])
            : question.rect
          return h('div', {
            key: question.id,
            className: 'md-question',
            style: styleOf(live),
            'data-flash': props.flash === question.id ? 'true' : undefined,
            onPointerDown: event => beginDrag(event, question, 'move'),
            onPointerMove: moveDrag,
            onPointerUp: endDrag,
            // Double-clicking the mark itself opens its name: the label above
            // the box is a small target and must not be the only way in. While a
            // tool has the pointer captured, its clicks are reported on the mark,
            // which is exactly where this handler sits.
            onDoubleClick: event => {
              if (insideOf(event.target, '.md-question-input')) return
              event.preventDefault()
              event.stopPropagation()
              setEditing({ id: question.id, value: question.name })
            },
            onContextMenu: event => {
              // A right press in the rename field belongs to the field.
              if (insideOf(event.target, '.md-question-input')) {
                event.preventDefault()
                event.stopPropagation()
                return
              }
              // Reading mode keeps the page's own menu; a mark only deletes with
              // the question tool picked.
              if (!active) return
              event.preventDefault()
              event.stopPropagation()
              props.onDelete(question.id)
            },
          },
            editing !== null && editing.id === question.id
              // The wrapper carries the class in both UI modes: the host input
              // uses its own class name, so the field has to be found by
              // something the wrapper always provides.
              ? h('div', { className: 'md-question-input' }, h(KitInput, {
                value: editing.value,
                autoFocus: true,
                'aria-label': format('questionRename'),
                onChange: value => setEditing({ id: question.id, value }),
                onKeyDown: event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitRename()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    setEditing(null)
                  }
                },
                onBlur: commitRename,
              }))
              : h('span', {
                // A label, not a handle: the double-click that renames it is
                // handled by the mark it sits on, because a captured pointer
                // reports its clicks there, not on the label.
                className: 'md-question-name',
                title: format('questionNameHint'),
              }, question.name),
            ['nw', 'ne', 'sw', 'se'].map(corner => h('span', {
              key: corner,
              className: `md-question-handle md-question-${corner}`,
              'aria-hidden': true,
              onPointerDown: event => beginDrag(event, question, corner),
              onPointerMove: moveDrag,
              onPointerUp: endDrag,
            }))
          )
        }),
        draft === null
          ? null
          : h('div', { className: 'md-question md-question-draft', style: styleOf(questionRect(draft.from, draft.to)) })
      )
    }

    /**
     * An invisible seat in the conversation composer. It sees every session the
     * host opens — including the sidebar list, which no workbench click passes
     * through — and puts the local persona into a Q&A session's input once.
     * @param {{ sessionId: string }} props - standard slot props.
     * @returns {null} nothing to draw.
     */
    function QaPersonaSeat(props) {
      const workflow = useWorkflowMode()
      const list = useSessionList()
      const summary = list === null || list.byId === undefined ? undefined : list.byId[props.sessionId]
      const title = summary === undefined ? '' : summary.title
      useEffect(() => {
        if (workflow !== 'math') return
        const parsed = parseSessionTitle(title)
        if (parsed !== null && parsed.mode === 'qa') void seedQaPersona(props.sessionId)
      }, [props.sessionId, title, workflow])
      return null
    }

    /* ------------------------------------------------------------ history -- */
    // Undo/redo per page, shared by the reader and the right column: the state
    // before every ink/box edit is pushed on a stack, so one undo takes back the
    // last action whichever pane made it.
    const HISTORY_LIMIT = 40
    const pageHistory = new Map()

    /**
     * The two lists that make up one page's marks.
     * @param {object[]} annots - strokes and notes.
     * @param {object[]} masks - translation boxes.
     * @returns {{annots: object[], masks: object[]}} a shallow copy safe to keep.
     */
    function snapshotOf(annots, masks) {
      return {
        annots: Array.isArray(annots) ? [...annots] : [],
        masks: Array.isArray(masks) ? [...masks] : [],
      }
    }

    /**
     * Same references in the same order: nothing to store, nothing to undo.
     * @param {object[]} first - current list.
     * @param {object[]} second - next list.
     * @returns {boolean} true when the edit changed nothing.
     */
    function sameList(first, second) {
      if (first === second) return true
      if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) return false
      for (let index = 0; index < first.length; index += 1) {
        if (first[index] !== second[index]) return false
      }
      return true
    }

    /**
     * Two box lists with the same geometry, within a hair. "框住本页块" uses it to
     * recognise its own boxes: a second press then takes them away instead of
     * stacking a duplicate set on top.
     * @param {object[]} first - boxes on the page.
     * @param {object[]} second - boxes the block pass produced.
     * @returns {boolean} true when every box matches in order.
     */
    function sameMasks(first, second) {
      if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) return false
      for (let index = 0; index < first.length; index += 1) {
        const a = first[index]
        const b = second[index]
        if (a === null || a === undefined || b === null || b === undefined) return false
        if (Math.abs(a.x - b.x) > 0.002 || Math.abs(a.y - b.y) > 0.002
          || Math.abs(a.w - b.w) > 0.002 || Math.abs(a.h - b.h) > 0.002) return false
      }
      return true
    }

    function historyBucket(key) {
      let bucket = pageHistory.get(key)
      if (bucket === undefined) {
        bucket = { undo: [], redo: [] }
        pageHistory.set(key, bucket)
        // A long read visits many pages; keep the map from growing forever.
        while (pageHistory.size > 60) {
          const oldest = pageHistory.keys().next().value
          if (oldest === key) break
          pageHistory.delete(oldest)
        }
      }
      return bucket
    }

    /**
     * Remember a page as it was before an edit, and drop the redo branch.
     * @param {string} key - book|code|page key.
     * @param {{annots: object[], masks: object[]}} snapshot - state before the edit.
     * @returns {void}
     */
    function recordHistory(key, snapshot) {
      const bucket = historyBucket(key)
      bucket.undo.push(snapshot)
      if (bucket.undo.length > HISTORY_LIMIT) bucket.undo.shift()
      bucket.redo.length = 0
    }

    /**
     * @param {string} key - book|code|page key.
     * @param {{annots: object[], masks: object[]}} current - state now.
     * @returns {{annots: object[], masks: object[]} | null} the previous state.
     */
    function undoHistory(key, current) {
      const bucket = historyBucket(key)
      const previous = bucket.undo.pop()
      if (previous === undefined) return null
      bucket.redo.push(snapshotOf(current.annots, current.masks))
      if (bucket.redo.length > HISTORY_LIMIT) bucket.redo.shift()
      return previous
    }

    /**
     * @param {string} key - book|code|page key.
     * @param {{annots: object[], masks: object[]}} current - state now.
     * @returns {{annots: object[], masks: object[]} | null} the state to restore.
     */
    function redoHistory(key, current) {
      const bucket = historyBucket(key)
      const next = bucket.redo.pop()
      if (next === undefined) return null
      bucket.undo.push(snapshotOf(current.annots, current.masks))
      if (bucket.undo.length > HISTORY_LIMIT) bucket.undo.shift()
      return next
    }

    /**
     * @param {string} key - book|code|page key.
     * @returns {{undo: number, redo: number}} how many steps each way.
     */
    function historyDepth(key) {
      const bucket = pageHistory.get(key)
      return bucket === undefined ? { undo: 0, redo: 0 } : { undo: bucket.undo.length, redo: bucket.redo.length }
    }

    /**
     * One chapter's page marks: where a page's ink and boxes live, what
     * "before this edit" means, and the one revision counter both ends read.
     * The reader and the right column edit the same pages, so these rules live
     * here instead of being re-derived in each component.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {'reader'|'side'} origin - which end reports its edits.
     * @returns {{ historyKeyOf: Function, readList: Function, load: Function, save: Function, restore: Function, undo: Function, redo: Function, depth: Function }} the store.
     */
    function createAnnotationStore(bookId, code, origin) {
      const storageKey = (kind, page) => `pdfdesk:${kind}:${bookId}:${code}:${page}`
      const historyKeyOf = page => `pdfdesk:history:${bookId}:${code}:${page}`
      const readList = (kind, page) => {
        try {
          const raw = window.localStorage.getItem(storageKey(kind, page))
          const parsed = raw === null ? [] : JSON.parse(raw)
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      }
      const writeList = (kind, page, list) => {
        try {
          window.localStorage.setItem(storageKey(kind, page), JSON.stringify(list))
        } catch {
          // storage unavailable: the edit stays on screen only
        }
      }
      const announce = () => bumpAnnotRev(bookId, code, origin)
      return {
        storageKey,
        historyKeyOf,
        readList,
        /**
         * Both lists of one page, as this end should show them.
         * @param {number} page - 1-based page number.
         * @returns {{annots: object[], masks: object[]}} the page's marks.
         */
        load(page) {
          return { annots: readList('annots', page), masks: readList('masks', page) }
        },
        /**
         * Commit one changed list: file the previous state, persist it, mirror
         * it and announce a new revision.
         * @param {number} page - page number.
         * @param {'annots'|'masks'} kind - which list changed.
         * @param {object[]} next - the new list.
         * @param {{annots: object[], masks: object[]}} current - state before the edit.
         * @returns {number | null} the new revision, or null when nothing changed.
         */
        save(page, kind, next, current) {
          if (sameList(next, current[kind])) return null
          recordHistory(historyKeyOf(page), snapshotOf(current.annots, current.masks))
          writeList(kind, page, next)
          mirrorPageAnnotations(bookId, code, page)
          return announce()
        },
        /**
         * Put both lists back (undo/redo) without filing another history step.
         * @param {number} page - page number.
         * @param {{annots: object[], masks: object[]}} snapshot - the state to restore.
         * @returns {number} the new revision.
         */
        restore(page, snapshot) {
          writeList('annots', page, snapshot.annots)
          writeList('masks', page, snapshot.masks)
          mirrorPageAnnotations(bookId, code, page)
          return announce()
        },
        undo(page, current) {
          return undoHistory(historyKeyOf(page), current)
        },
        redo(page, current) {
          return redoHistory(historyKeyOf(page), current)
        },
        depth(page) {
          return historyDepth(historyKeyOf(page))
        },
      }
    }

    /**
     * The write path for one chapter's page ink: save, undo, redo and depth.
     * Both panes edit the same pages, so these rules live here instead of being
     * re-implemented per pane. UI state (strokes arrays, drafts, selection) stays
     * with the pane that owns it; the callbacks let it react to a commit.
     * @param {{ inkStore: object, pageRef: object, editKey: string,
     *   onPrefetchClear?: Function, onCommit?: Function, onRestore?: Function }} options - the store, the page it writes and the listeners.
     * @returns {{ save: Function, restore: Function, undo: Function, redo: Function, depth: Function }} the write path.
     */
    function createInkEditing(options) {
      const { inkStore, pageRef, editKey } = options
      const clearPrefetch = typeof options.onPrefetchClear === 'function' ? options.onPrefetchClear : null
      const onCommit = typeof options.onCommit === 'function' ? options.onCommit : null
      const onRestore = typeof options.onRestore === 'function' ? options.onRestore : null
      const markInk = () => markEditKind(editKey, 'ink')
      return {
        /**
         * @param {'annots'|'masks'} kind - which list changed.
         * @param {object[]} next - the new list.
         * @param {{ annots: object[], masks: object[] }} current - state before the edit.
         * @returns {number | null} the new revision, or null when nothing changed.
         */
        save(kind, next, current) {
          const rev = inkStore.save(pageRef.current, kind, next, current)
          if (rev === null) return null
          if (clearPrefetch !== null) clearPrefetch()
          markInk()
          if (onCommit !== null) onCommit(kind, next, rev)
          return rev
        },
        /**
         * @param {{ annots: object[], masks: object[] }} snapshot - the state to restore.
         * @returns {number} the new revision.
         */
        restore(snapshot) {
          const rev = inkStore.restore(pageRef.current, snapshot)
          markInk()
          if (onRestore !== null) onRestore(snapshot, rev)
          return rev
        },
        /**
         * @param {{ annots: object[], masks: object[] }} current - state now.
         * @returns {{ annots: object[], masks: object[] } | null} the previous state.
         */
        undo(current) {
          return inkStore.undo(pageRef.current, current)
        },
        /**
         * @param {{ annots: object[], masks: object[] }} current - state now.
         * @returns {{ annots: object[], masks: object[] } | null} the state to restore.
         */
        redo(current) {
          return inkStore.redo(pageRef.current, current)
        },
        /**
         * @returns {number} how many steps can be undone on the current page.
         */
        depth() {
          return inkStore.depth(pageRef.current)
        },
      }
    }

    /**
     * One pane's editing state for the page ink: the lists, the in-progress
     * drafts, the selection, the note being typed and the history that goes with
     * them. The write path is `createInkEditing`; this hook is the state and the
     * small actions around it, so the reader and the preview stop declaring it
     * twice.
     * @param {{ inkStore: object, pageRef: object, editKey: string, pageNumber: number,
     *   onPrefetchClear?: Function, onRev?: Function }} options - the store, the page and the listeners.
     * @returns {object} the state, its setters and the commit/undo actions.
     */
    function useInkEditorState(options) {
      const { inkStore, pageRef, editKey } = options
      const [strokes, setStrokes] = useState([])
      const [masks, setMasks] = useState([])
      const [selection, setSelection] = useState(null)
      const [draftStroke, setDraftStroke] = useState(null)
      const [textDraft, setTextDraft] = useState(null)
      const [noteEdit, setNoteEdit] = useState(null)
      const [noteStyle, setNoteStyle] = useState(() => defaultNoteStyle())
      const [shapeDraft, setShapeDraft] = useState(null)
      const [drag, setDrag] = useState(null)
      const [resize, setResize] = useState(null)
      const [resizeEntry, setResizeEntry] = useState(null)
      const [inkRev, setInkRev] = useState(0)
      const [, bumpHistory] = useState(0)
      const strokesRef = useRef([])
      const masksRef = useRef([])
      const erasing = useRef(false)
      const snapshot = () => snapshotOf(strokesRef.current, masksRef.current)
      const inkEditing = createInkEditing({
        inkStore,
        pageRef,
        editKey,
        onPrefetchClear: options.onPrefetchClear,
        onCommit: (kind, next, rev) => {
          bumpHistory(value => value + 1)
          if (kind === 'annots') {
            strokesRef.current = next
            setStrokes(next)
          } else {
            masksRef.current = next
            setMasks(next)
          }
          setInkRev(value => value + 1)
          if (typeof options.onRev === 'function') options.onRev(rev)
        },
        onRestore: (restored, rev) => {
          strokesRef.current = restored.annots
          masksRef.current = restored.masks
          setStrokes(restored.annots)
          setMasks(restored.masks)
          setInkRev(value => value + 1)
          if (typeof options.onRev === 'function') options.onRev(rev)
        },
      })
      return {
        strokes,
        setStrokes,
        strokesRef,
        masks,
        setMasks,
        masksRef,
        selection,
        setSelection,
        draftStroke,
        setDraftStroke,
        textDraft,
        setTextDraft,
        noteEdit,
        setNoteEdit,
        noteStyle,
        setNoteStyle,
        shapeDraft,
        setShapeDraft,
        drag,
        setDrag,
        resize,
        setResize,
        resizeEntry,
        setResizeEntry,
        erasing,
        inkRev,
        setInkRev,
        bumpHistory,
        saveAnnots: next => inkEditing.save('annots', next, snapshot()),
        saveMasks: next => inkEditing.save('masks', next, snapshot()),
        restorePage: value => inkEditing.restore(value),
        undoPage: () => {
          const previous = inkEditing.undo(snapshot())
          if (previous === null) return
          inkEditing.restore(previous)
          bumpHistory(value => value + 1)
        },
        redoPage: () => {
          const next = inkEditing.redo(snapshot())
          if (next === null) return
          inkEditing.restore(next)
          bumpHistory(value => value + 1)
        },
        historyCounts: inkStore.depth(options.pageNumber),
      }
    }

    /**
     * The ink gestures both panes share: one freehand stroke and the eraser
     * sweep. Text boxes, shapes, selection and masks keep their own per-pane
     * logic for now; the raw pointer → points conversion and the commit call are
     * injected so the reader's plane-aware measurement and the preview's page
     * box both fit.
     * @param {{ tool: string, strokesRef: object, draftRef: object, erasing: object,
     *   saveAnnots: Function, setDraftStroke: Function, hitTest: Function,
     *   color: string, width: number, smooth?: boolean, sample?: Function }} options - the gesture environment.
     * @returns {{ down: Function, move: Function, up: Function }} the gestures.
     */
    function createInkGestures(options) {
      const { strokesRef, draftRef, erasing, saveAnnots, setDraftStroke, hitTest } = options
      const tool = options.tool
      const sample = typeof options.sample === 'function' ? options.sample : (_event, point) => point
      const shapeTools = Array.isArray(options.shapeTools) ? options.shapeTools : []
      const shapeRef = options.shapeDraftRef === undefined ? null : options.shapeDraftRef
      const setShapeDraft = typeof options.setShapeDraft === 'function' ? options.setShapeDraft : null
      const eraseAt = point => saveAnnots(strokesRef.current.filter(entry => !hitTest(entry, point)))
      return {
        /**
         * @param {MouseEvent} event - pointer event.
         * @param {[number, number]} point - the point on the page.
         * @returns {boolean} whether the gesture consumed the press.
         */
        down(event, point) {
          if (tool === 'erase') {
            erasing.current = true
            eraseAt(point)
            return true
          }
          if (shapeTools.includes(tool) && shapeRef !== null && setShapeDraft !== null) {
            shapeRef.current = {
              shape: tool,
              x0: point[0], y0: point[1],
              x1: point[0], y1: point[1],
              color: options.color,
              width: options.width,
            }
            setShapeDraft(shapeRef.current)
            return true
          }
          if (tool !== 'pen') return false
          draftRef.current = {
            kind: 'stroke',
            points: [sample(event, point)],
            color: options.color,
            width: options.width,
          }
          setDraftStroke(draftRef.current)
          return true
        },
        /**
         * @param {MouseEvent} event - pointer event.
         * @param {[number, number]} point - the point on the page.
         * @returns {boolean} whether the gesture consumed the move.
         */
        move(event, point) {
          if (tool === 'erase' && erasing.current) {
            eraseAt(point)
            return true
          }
          if (shapeRef !== null && shapeRef.current !== null && setShapeDraft !== null) {
            shapeRef.current = { ...shapeRef.current, x1: point[0], y1: point[1] }
            setShapeDraft(shapeRef.current)
            return true
          }
          const current = draftRef.current
          if (current === null) return false
          const next = sample(event, point)
          const last = current.points[current.points.length - 1]
          if (last !== undefined && Math.hypot(next[0] - last[0], next[1] - last[1]) < 0.0025) return true
          draftRef.current = { ...current, points: [...current.points, next] }
          setDraftStroke(draftRef.current)
          return true
        },
        /**
         * @returns {boolean} whether anything was in progress.
         */
        up() {
          const wasErasing = erasing.current
          erasing.current = false
          if (shapeRef !== null && shapeRef.current !== null && setShapeDraft !== null) {
            const draft = shapeRef.current
            shapeRef.current = null
            setShapeDraft(null)
            const x = Math.min(draft.x0, draft.x1)
            const y = Math.min(draft.y0, draft.y1)
            const w = Math.abs(draft.x1 - draft.x0)
            const h = Math.abs(draft.y1 - draft.y0)
            if (w > 0.008 || h > 0.008) {
              saveAnnots([...strokesRef.current, {
                kind: 'shape',
                shape: draft.shape,
                x, y, w, h,
                x0: draft.x0, y0: draft.y0, x1: draft.x1, y1: draft.y1,
                color: draft.color,
                width: draft.width,
                seed: Math.floor(Math.random() * 2147483647),
              }])
            }
            return true
          }
          const current = draftRef.current
          if (current === null) return wasErasing
          draftRef.current = null
          setDraftStroke(null)
          const points = options.smooth === true ? smoothStroke(current.points) : current.points
          if (points.length > 1) saveAnnots([...strokesRef.current, { ...current, points }])
          return true
        },
      }
    }

    /**
     * The chapter question list's write path, shared by the reader and the
     * preview: record the undo step, update the visible list, persist the
     * chapter JSON, then adopt what the host saved and announce it.
     * @param {{ bookId: string, code: string, origin: string, questionsRef: object, nextRef: object,
     *   setQuestions: Function, bumpQuestionEdits: Function, seenQuestionRev: object,
     *   onFailure?: Function }} options - the list, its refs and listeners.
     * @returns {{ commit: Function, editKey: string }} the write path.
     */
    function createQuestionCommitting(options) {
      const { bookId, code, origin, questionsRef, nextRef, setQuestions, bumpQuestionEdits, seenQuestionRev } = options
      const editKey = chapterKey(bookId, code)
      const fail = typeof options.onFailure === 'function' ? options.onFailure : null
      return {
        editKey,
        /**
         * @param {object[]} list - the new list.
         * @param {number} next - the next free number the host keeps.
         * @param {boolean} [record] - whether this edit joins the undo stack.
         * @returns {void}
         */
        commit(list, next, record = true) {
          if (record) {
            // The stack lives in memory: undo is a gesture log, not chapter data.
            recordQuestionEdit(editKey, { questions: questionsRef.current, next: nextRef.current })
            bumpQuestionEdits(value => value + 1)
          }
          questionsRef.current = list
          nextRef.current = next
          setQuestions(list)
          void saveChapterQuestions(bookId, code, { next, questions: list }).then(saved => {
            questionsRef.current = saved.questions
            nextRef.current = saved.next
            setQuestions(saved.questions)
            seenQuestionRev.current = bumpQuestionRev(bookId, code, origin)
          }).catch(() => {
            if (fail !== null) fail()
          })
        },
      }
    }

    /**
     * Wrap the local persona in an explicit, user-owned instruction block. The
     * workspace's default answer format outranks a bare quoted personality, so
     * the block names the user's override and its scope.
     * @param {string} persona - the qa-persona.md text.
     * @returns {string} the prompt block.
     */
    function personaPrompt(persona) {
      return [
        '【本会话答疑模式：苏格拉底式（用户明确要求，优先于工作区默认的答疑格式）】',
        '以下规则对本会话的每一次回答生效，直到我说「结束引导」：',
        persona,
      ].join('\n')
    }

    /**
     * The line that tells every new conversation to think about the whole
     * chapter. The reader's page is not injected, so this replaces the old
     * "reading position: page N" suffix and says the page is not what matters.
     */
    const WHOLE_CHAPTER_LINE = '阅读方式：整章思考（整章一起理解，不限定某一页；需要定位时我会描述具体段落）。'


    /**
     * The context line every new conversation starts with: which book, chapter
     * and PDF it belongs to. The reader's page is deliberately **not** injected:
     * a session covers the whole chapter, and a page number would make the model
     * answer about one screenful and go stale as soon as the reader turns a page.
     * The page stays a UI-only value used for jumping. With `paths`, the block
     * also names the library, the chapter's folder and the exact PDF, so the model
     * never has to search for the book. With `persona`, a Q&A session starts with
     * the local Socratic instruction in the same prompt.
     * @param {{ title: string }} bookRow - catalog book row.
     * @param {{ code: string, title: string, file: string }} chapter - catalog chapter row.
     * @param {{ pdf: string, page: number, mode: string } | null} position - the open reader when it is this chapter; only its PDF name is used.
     * @param {{ libraryDir: string, bookDir: string, pdfPath: string, artifactDir: string } | null} [paths] - the chapter's absolute locations.
     * @param {string} [persona] - the local Q&A persona, when enabled.
     * @returns {string} the header block.
     */
    function sessionSeedText(bookRow, chapter, position, paths, persona) {
      const pdf = position === null
        ? (chapter.file === '' ? '' : `${chapter.file}.pdf`)
        : position.pdf
      const parts = [
        `〔PDF阅读〕本章：${bookRow.title}`,
        `${chapter.code} ${chapter.title}`,
      ]
      if (pdf !== '') parts.push(`PDF：${pdf}`)
      const header = parts.join(' · ')
      const lines = [header, WHOLE_CHAPTER_LINE]
      const hasPaths = paths !== null && paths !== undefined
      const hasPersona = typeof persona === 'string' && persona !== ''
      if (hasPaths) {
        lines.push('路径（已给出，不要搜索或列举目录）：')
        if (paths.libraryDir !== '') lines.push(`书库：${paths.libraryDir}`)
        if (paths.bookDir !== '') lines.push(`书目录：${paths.bookDir}`)
        if (paths.pdfPath !== '') lines.push(`本章 PDF：${paths.pdfPath}`)
        if (paths.artifactDir !== '') lines.push(`产物目录：${paths.artifactDir}`)
      }
      if (hasPersona) lines.push(personaPrompt(persona))
      return lines.join('\n')
    }

    const MASK_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

    /**
     * The marks one page already committed, read synchronously. Continuous mode
     * paints a read-only copy under every page around the reader, so the copy
     * must be available in the same render as the page itself.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @param {'annots'|'masks'} kind - which list.
     * @param {number} page - 1-based page.
     * @returns {object[]} the stored list (empty when unreadable).
     */
    function readStoredList(bookId, code, kind, page) {
      try {
        const raw = window.localStorage.getItem(`pdfdesk:${kind}:${bookId}:${code}:${page}`)
        const parsed = raw === null ? [] : JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }

    /**
     * A page's committed marks, drawn read-only. Continuous mode renders one of
     * these under every page around the reader, so a page keeps its ink while the
     * reader turns: only the page being read owns the interactive layer, and the
     * others never lose their strokes for a frame (which is what made the ink
     * flicker when a page turn moved the one shared overlay).
     * @param {{ bookId: string, code: string, page: number, rev: number }} props - the page and the reload signal.
     * @returns {import('react').ReactElement | null} the layer, or null when the page has nothing.
     */
    function StaticInk(props) {
      const entries = useMemo(
        () => readStoredList(props.bookId, props.code, 'annots', props.page),
        [props.bookId, props.code, props.page, props.rev],
      )
      if (entries.length === 0) return null
      return h('div', { className: 'md-annot md-annot-static', 'data-extended': 'true', 'aria-hidden': true },
        h(InkMarks, { entries }))
    }

    /**
     * Editable translation boxes: drag a box to move it, drag one of its eight
     * handles to resize, right-click to delete (undo puts it back). The frame is
     * a clipping wrapper so the page image is cut to the box while the handles
     * may sit on the border. All boxes paint one shared page bitmap.
     * @param {{ masks: object[], image: string, onChange: Function, onDelete: Function }} props - boxes, page image and callbacks.
     * @returns {import('react').ReactElement} the boxes.
     */
    function MaskBoxes(props) {
      const root = useRef(null)
      const drag = useRef(null)
      const [preview, setPreview] = useState(null)
      const [hover, setHover] = useState(-1)
      const [cursor, setCursor] = useState('')
      const MIN_SIZE = 0.02
      // Pixel-sized marks: hit tests in normalized space need the page size.
      const HANDLE_HIT_PX = 9
      const GRIP_HIT_PX = 22

      const rectOf = () => {
        const node = root.current
        if (node === null) return null
        const rect = node.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return null
        return rect
      }
      const pointOf = (event, rect) => [
        Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
        Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
      ]
      const handleAt = (mask, point, rect) => {
        const sx = HANDLE_HIT_PX / rect.width
        const sy = HANDLE_HIT_PX / rect.height
        const left = mask.x
        const top = mask.y
        const right = mask.x + mask.w
        const bottom = mask.y + mask.h
        const middleX = mask.x + mask.w / 2
        const middleY = mask.y + mask.h / 2
        const spots = {
          nw: [left, top],
          n: [middleX, top],
          ne: [right, top],
          e: [right, middleY],
          se: [right, bottom],
          s: [middleX, bottom],
          sw: [left, bottom],
          w: [left, middleY],
        }
        for (const position of MASK_HANDLES) {
          const spot = spots[position]
          if (Math.abs(point[0] - spot[0]) <= sx && Math.abs(point[1] - spot[1]) <= sy) return position
        }
        return ''
      }
      const gripAt = (mask, point, rect) => {
        const halfWidth = (GRIP_HIT_PX / 2) / rect.width
        const top = mask.y + 6 / rect.height
        const centre = mask.x + mask.w / 2
        return Math.abs(point[0] - centre) <= halfWidth
          && point[1] >= top && point[1] <= top + GRIP_HIT_PX / rect.height
      }
      // What is under the point: a resize handle, the move grip, or just the
      // box body. Topmost box wins, so overlapping boxes behave predictably.
      const hitAt = (point, rect, altKey) => {
        for (let index = props.masks.length - 1; index >= 0; index -= 1) {
          const mask = props.masks[index]
          const handle = handleAt(mask, point, rect)
          if (handle !== '') return { index, handle }
          if (gripAt(mask, point, rect)) return { index, handle: 'move' }
          const inside = point[0] >= mask.x && point[0] <= mask.x + mask.w
            && point[1] >= mask.y && point[1] <= mask.y + mask.h
          if (inside && altKey) return { index, handle: 'move' }
          if (inside) return { index, handle: 'body' }
        }
        return null
      }
      const clamp = mask => {
        const w = Math.max(MIN_SIZE, Math.min(1, mask.w))
        const h = Math.max(MIN_SIZE, Math.min(1, mask.h))
        return { x: Math.min(1 - w, Math.max(0, mask.x)), y: Math.min(1 - h, Math.max(0, mask.y)), w, h }
      }
      // Any press that is not on a handle/grip belongs to the page: it must not
      // be swallowed here, so the layer below can draw the next box even when
      // this box covers the whole paragraph.
      const down = event => {
        const rect = rectOf()
        if (rect === null) return
        const point = pointOf(event, rect)
        const hit = hitAt(point, rect, event.altKey === true)
        if (hit === null || hit.handle === 'body') return
        event.preventDefault()
        event.stopPropagation()
        const node = root.current
        if (node !== null && typeof node.setPointerCapture === 'function') {
          try { node.setPointerCapture(event.pointerId) } catch { /* not supported */ }
        }
        const base = props.masks[hit.index]
        if (base === undefined) return
        drag.current = { index: hit.index, handle: hit.handle, startMask: { ...base }, start: point, latest: { ...base } }
        setPreview({ index: hit.index, mask: { ...base } })
      }
      const move = event => {
        const rect = rectOf()
        if (rect === null) return
        const point = pointOf(event, rect)
        const state = drag.current
        if (state === null) {
          const hit = hitAt(point, rect, false)
          const next = hit === null ? -1 : hit.index
          setHover(current => (current === next ? current : next))
          const nextCursor = hit === null ? '' : ({ nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move', body: 'crosshair' })[hit.handle] ?? ''
          setCursor(current => (current === nextCursor ? current : nextCursor))
          return
        }
        event.preventDefault()
        event.stopPropagation()
        const dx = point[0] - state.start[0]
        const dy = point[1] - state.start[1]
        const base = state.startMask
        let next
        if (state.handle === 'move') {
          next = { x: base.x + dx, y: base.y + dy, w: base.w, h: base.h }
        } else {
          let left = base.x
          let top = base.y
          let right = base.x + base.w
          let bottom = base.y + base.h
          if (state.handle.includes('w')) left = Math.min(right - MIN_SIZE, base.x + dx)
          if (state.handle.includes('e')) right = Math.max(left + MIN_SIZE, base.x + base.w + dx)
          if (state.handle.includes('n')) top = Math.min(bottom - MIN_SIZE, base.y + dy)
          if (state.handle.includes('s')) bottom = Math.max(top + MIN_SIZE, base.y + base.h + dy)
          next = { x: left, y: top, w: right - left, h: bottom - top }
        }
        state.latest = clamp(next)
        setPreview({ index: state.index, mask: state.latest })
      }
      const end = event => {
        const state = drag.current
        if (state === null) return
        drag.current = null
        const node = root.current
        if (node !== null && typeof node.releasePointerCapture === 'function') {
          try { node.releasePointerCapture(event.pointerId) } catch { /* already gone */ }
        }
        const latest = state.latest
        const base = state.startMask
        setPreview(null)
        if (Math.abs(latest.x - base.x) < 0.002 && Math.abs(latest.y - base.y) < 0.002
          && Math.abs(latest.w - base.w) < 0.002 && Math.abs(latest.h - base.h) < 0.002) return
        props.onChange(state.index, latest)
      }
      const menu = event => {
        const rect = rectOf()
        if (rect === null) return
        const point = pointOf(event, rect)
        const hit = hitAt(point, rect, false)
        if (hit === null) return
        event.preventDefault()
        event.stopPropagation()
        props.onDelete(hit.index)
      }

      return h('div', {
        className: 'md-mask-boxes',
        ref: root,
        style: cursor === '' ? undefined : { cursor },
        title: hover >= 0 ? format('maskBoxHint') : undefined,
        onPointerDown: down,
        onPointerMove: move,
        onPointerUp: end,
        onPointerCancel: end,
        onPointerLeave: () => {
          setHover(-1)
          setCursor('')
        },
        onContextMenu: menu,
      },
        props.masks.map((mask, index) => {
          const shown = preview !== null && preview.index === index ? preview.mask : mask
          const active = drag.current !== null && drag.current.index === index
          const marked = active || hover === index
          return h('div', {
            key: index,
            className: `md-mask${active ? ' md-mask-active' : ''}`,
            'data-hover': marked ? 'true' : undefined,
            style: {
              left: `${shown.x * 100}%`,
              top: `${shown.y * 100}%`,
              width: `${shown.w * 100}%`,
              height: `${shown.h * 100}%`,
            },
          },
            h('div', { className: 'md-mask-clip' },
              props.image === '' || shown.w <= 0 || shown.h <= 0
                ? null
                : h('div', {
                  className: 'md-mask-page-image',
                  style: {
                    position: 'absolute',
                    left: `${-(shown.x / shown.w) * 100}%`,
                    top: `${-(shown.y / shown.h) * 100}%`,
                    width: `${100 / shown.w}%`,
                    height: `${100 / shown.h}%`,
                    maxWidth: 'none',
                    backgroundImage: `url("${props.image}")`,
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                  },
                })),
            h('span', { className: 'md-mask-grip', 'aria-hidden': true }, annotIcon('M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3')),
            MASK_HANDLES.map(position => h('span', {
              key: position,
              className: `md-mask-handle md-mask-handle-${position}`,
              'aria-hidden': true,
            }))
          )
        })
      )
    }

    /**
     * Ink for the translated column of the bilingual view. The two columns are
     * independent (they may sit on different pages), so this column keeps its own
     * strokes under a `:right` storage suffix instead of the page's shared list;
     * the original column and the single view are unaffected. The reader's pen,
     * eraser and text tools drive it, but every edit lands only in this column.
     * @param {{ bookId: string, code: string, page: number, store: string, tool: string,
     *   color: string, width: number, onReady: Function, onHistory: Function, onActivate: Function }} props - the page and the reader's current tool.
     * @returns {import('react').ReactElement} the ink layer.
     */
    function ColumnInk(props) {
      const storageKey = `pdfdesk:annots:${props.bookId}:${props.code}:${props.page}:${props.store}`
      const [strokes, setStrokes] = useState([])
      const [draft, setDraft] = useState(null)
      const [textDraft, setTextDraft] = useState(null)
      const [note, setNote] = useState(null)
      const strokesRef = useRef([])
      const draftRef = useRef(null)
      const noteText = useRef('')
      const noteSeq = useRef(0)
      const undoStack = useRef([])
      const redoStack = useRef([])
      const erasing = useRef(false)
      const api = useRef({})
      const HIT = 0.012

      const pointOf = event => inkPointOf(event, event.currentTarget)
      const within = (entry, point) => {
        if (entry.kind === 'text') {
          const box = noteBox(entry)
          return point[0] >= box.x - HIT && point[0] <= box.x + box.w + HIT
            && point[1] >= box.y - HIT && point[1] <= box.y + box.h + HIT
        }
        // This column keeps its fixed page-unit eraser: the shared segment test
        // only needs the reach this column has always used.
        return inkStrokeHits(entry, point, HIT + (Number(entry.width) || 2) / 1000)
      }
      const persist = () => {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(strokesRef.current))
        } catch {
          // storage full or private mode: the strokes last this session only
        }
      }
      const report = () => {
        if (typeof props.onHistory === 'function') {
          props.onHistory({ undo: undoStack.current.length, redo: redoStack.current.length, count: strokesRef.current.length })
        }
      }
      const commit = next => {
        const current = strokesRef.current
        if (!Array.isArray(next) || sameList(current, next)) return
        undoStack.current.push(current.map(entry => ({ ...entry })))
        if (undoStack.current.length > 40) undoStack.current.shift()
        redoStack.current = []
        strokesRef.current = next
        setStrokes(next)
        persist()
        report()
      }
      const undo = () => {
        const previous = undoStack.current.pop()
        if (previous === undefined) return
        redoStack.current.push(strokesRef.current)
        strokesRef.current = previous
        setStrokes(previous)
        persist()
        report()
      }
      const redo = () => {
        const next = redoStack.current.pop()
        if (next === undefined) return
        undoStack.current.push(strokesRef.current)
        strokesRef.current = next
        setStrokes(next)
        persist()
        report()
      }
      api.current = {
        undo,
        redo,
        clear: () => commit([]),
        canUndo: () => undoStack.current.length > 0,
        canRedo: () => redoStack.current.length > 0,
      }
      useEffect(() => {
        if (typeof props.onReady === 'function') props.onReady(api.current)
      })
      useEffect(() => {
        let list = []
        try {
          const raw = window.localStorage.getItem(storageKey)
          const parsed = raw === null ? [] : JSON.parse(raw)
          list = Array.isArray(parsed) ? parsed : []
        } catch {
          list = []
        }
        strokesRef.current = list
        setStrokes(list)
        draftRef.current = null
        setDraft(null)
        setNote(null)
        setTextDraft(null)
        noteText.current = ''
        undoStack.current = []
        redoStack.current = []
        report()
        // The storage key covers the page: a new page replaces the whole state.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [storageKey])
      const setDraftBoth = value => {
        draftRef.current = value
        setDraft(value)
      }
      const noteRef = useRef(null)
      const setNoteBoth = value => {
        noteRef.current = value
        setNote(value)
      }
      const openNote = (point, box) => {
        const list = strokesRef.current
        const index = box === undefined ? list.findIndex(entry => entry.kind === 'text' && within(entry, point)) : -1
        noteSeq.current += 1
        const entry = index >= 0 ? list[index] : null
        noteText.current = entry === null ? '' : String(entry.text ?? '')
        const bounds = entry === null ? null : noteBox(entry)
        const fallbackWidth = Math.min(0.38, Math.max(0.18, 1 - point[0] - 0.02))
        const x = box === undefined ? Math.min(point[0], Math.max(0, 1 - fallbackWidth - 0.02)) : Math.max(0, Math.min(1 - 0.02, box.x))
        const y = box === undefined ? Math.min(point[1], 0.96) : Math.max(0, Math.min(1 - 0.02, box.y))
        const w = bounds === null ? (box === undefined ? fallbackWidth : Math.max(0.04, Math.min(1 - x, box.w))) : bounds.w
        const h = bounds === null ? (box === undefined ? 0.09 : Math.max(0.035, Math.min(1 - y, box.h))) : bounds.h
        setNoteBoth({
          id: noteSeq.current,
          index,
          x: bounds === null ? x : bounds.x,
          y: bounds === null ? y : bounds.y,
          w,
          h,
          text: noteText.current,
          color: entry === null ? props.color : (entry.color ?? props.color),
          fontSize: entry === null || !Number.isFinite(entry.fontSize) ? NOTE_SIZES[0] : entry.fontSize,
          fontFamily: entry === null || typeof entry.fontFamily !== 'string' ? 'normal' : entry.fontFamily,
        })
      }
      const saveNote = id => {
        const current = noteRef.current
        if (current === null || current.id !== id) return
        noteRef.current = null
        setNote(null)
        const text = noteText.current
        noteText.current = ''
        if (current.index < 0 && text.trim() === '') return
        commit(applyNote(strokesRef.current, { ...current, text }, text))
      }
      const cancelNote = () => {
        noteRef.current = null
        setNote(null)
        noteText.current = ''
      }
      const down = event => {
        if (props.tool === '') return
        const point = pointOf(event)
        if (point === null) return
        event.preventDefault()
        if (typeof props.onActivate === 'function') props.onActivate()
        if (props.tool === 'erase') {
          erasing.current = true
          commit(strokesRef.current.filter(entry => !within(entry, point)))
          return
        }
        if (props.tool === 'text') {
          // Drag creates the box; a click alone creates nothing.
          if (noteRef.current !== null) saveNote(noteRef.current.id)
          setTextDraft({ x0: point[0], y0: point[1], x1: point[0], y1: point[1] })
          return
        }
        setDraftBoth({ kind: 'stroke', points: [point], color: props.color, width: props.width })
      }
      const move = event => {
        if (props.tool === 'erase' && erasing.current) {
          const point = pointOf(event)
          if (point === null) return
          event.preventDefault()
          commit(strokesRef.current.filter(entry => !within(entry, point)))
          return
        }
        if (textDraft !== null) {
          const point = pointOf(event)
          if (point === null) return
          event.preventDefault()
          setTextDraft(current => (current === null ? null : { ...current, x1: point[0], y1: point[1] }))
          return
        }
        const current = draftRef.current
        if (current === null) return
        const point = pointOf(event)
        if (point === null) return
        event.preventDefault()
        const last = current.points[current.points.length - 1]
        if (last !== undefined && Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.0025) return
        setDraftBoth({ ...current, points: [...current.points, point] })
      }
      const up = () => {
        erasing.current = false
        if (textDraft !== null) {
          const box = textDraft
          setTextDraft(null)
          const x = Math.min(box.x0, box.x1)
          const y = Math.min(box.y0, box.y1)
          const w = Math.abs(box.x1 - box.x0)
          const h = Math.abs(box.y1 - box.y0)
          if (w > 0.012 && h > 0.012) openNote([x, y], { x, y, w, h })
          return
        }
        const current = draftRef.current
        if (current === null) return
        setDraftBoth(null)
        if (current.points.length > 1) commit([...strokesRef.current, current])
      }
      return h('div', {
        className: 'md-annot',
        'data-tool': props.tool,
        onPointerDown: down,
        onPointerMove: move,
        onPointerUp: up,
        onPointerLeave: up,
      },
        h(InkMarks, {
          entries: strokes,
          noteTitle: props.tool === '' ? format('annotTextEditHint') : undefined,
          hiddenNoteIndex: note === null ? -1 : note.index,
          onNotePointerDown: props.tool === ''
            ? (index, event) => event.stopPropagation()
            : undefined,
          onNoteDoubleClick: props.tool === ''
            ? (index, event, entry) => {
              event.preventDefault()
              event.stopPropagation()
              noteSeq.current += 1
              noteText.current = String(entry.text ?? '')
              const bounds = noteBox(entry)
              setNoteBoth({
                id: noteSeq.current,
                index,
                x: entry.x,
                y: entry.y,
                w: bounds.w,
                h: bounds.h,
                text: noteText.current,
                color: entry.color ?? props.color,
                fontSize: Number.isFinite(entry.fontSize) ? entry.fontSize : NOTE_SIZES[0],
                fontFamily: typeof entry.fontFamily === 'string' ? entry.fontFamily : 'normal',
                fontWeight: entry.fontWeight === 'bold' ? 'bold' : 'normal',
                fontStyle: entry.fontStyle === 'italic' ? 'italic' : 'normal',
              })
            }
            : undefined,
          drafts: [
            draft === null
              ? null
              : h('polyline', {
                key: 'draft',
                points: draft.points.map(point => `${point[0]},${point[1]}`).join(' '),
                fill: 'none',
                stroke: draft.color ?? '#e0554a',
                strokeWidth: draft.width ?? 2,
                vectorEffect: 'non-scaling-stroke',
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
              }),
            textDraft === null
              ? null
              : h('rect', {
                key: 'text-draft',
                x: Math.min(textDraft.x0, textDraft.x1),
                y: Math.min(textDraft.y0, textDraft.y1),
                width: Math.abs(textDraft.x1 - textDraft.x0),
                height: Math.abs(textDraft.y1 - textDraft.y0),
                fill: 'none',
                stroke: '#2f6df6',
                strokeWidth: 1.5,
                strokeDasharray: '5 4',
                vectorEffect: 'non-scaling-stroke',
              }),
          ],
        }),
        note === null ? null : h(NoteEditor, {
          key: `note-${note.id}`,
          draft: note,
          onChange: value => { noteText.current = value },
          onSave: () => saveNote(note.id),
          onCancel: cancelNote,
        })
      )
    }

    /**
     * Development-only readout: Ctrl+Alt+D toggles a small overlay that shows
     * which page every layer thinks it is on. The preference is persisted so a
     * reload keeps it on while a bug is being chased; end users never see it.
     * @returns {boolean} whether the overlay is on.
     */
    function useDiag() {
      const [on, setOn] = useState(() => {
        try {
          return window.localStorage.getItem('pdfdesk:diag') === '1'
        } catch {
          return false
        }
      })
      useEffect(() => {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
        const onKeyDown = event => {
          if (event.ctrlKey !== true || event.altKey !== true || String(event.key).toLowerCase() !== 'd') return
          event.preventDefault()
          event.stopPropagation()
          let now = false
          try {
            now = window.localStorage.getItem('pdfdesk:diag') === '1'
            window.localStorage.setItem('pdfdesk:diag', now ? '0' : '1')
          } catch {
            // storage unavailable: the toggle still works for this render
          }
          setOn(!now)
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [])
      return on
    }

    /**
     * The diagnostic overlay: one line per fact, in the order the views resolve
     * them. Pointer events pass through, so it can never block the page.
     * @param {{ lines: string[] }} props - the lines to show.
     * @returns {import('react').ReactElement} the readout.
     */
    function DiagPanel(props) {
      return h('pre', { className: 'md-hud', 'aria-hidden': true }, props.lines.join('\n'))
    }

    /**
     * The preview's own action list, used only when the host's shared context
     * menu service is not mounted: same rows, same callbacks, so every action
     * stays reachable instead of a dead right-click. Groups expand in place.
     * @param {{ x: number, y: number, rows: Array<object>, onClose: Function }} props - position and rows.
     * @returns {import('react').ReactElement} the menu.
     */
    function FallbackMenu(props) {
      const [openGroup, setOpenGroup] = useState('')
      useEffect(() => {
        const onKeyDown = event => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          props.onClose()
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [props.onClose])
      const view = typeof window === 'undefined' ? { width: 0, height: 0 } : { width: window.innerWidth, height: window.innerHeight }
      const left = Math.max(8, Math.min(props.x, view.width - 230))
      const top = Math.max(8, Math.min(props.y, view.height - 340))
      const run = row => {
        if (row.disabled === true || typeof row.run !== 'function') return
        props.onClose()
        row.run()
      }
      return h('div', {
        className: 'md-fallback-backdrop',
        onClick: props.onClose,
        onContextMenu: event => { event.preventDefault(); props.onClose() },
      },
        h('div', {
          className: 'md-fallback-menu',
          role: 'menu',
          style: { left: `${left}px`, top: `${top}px` },
          onClick: event => event.stopPropagation(),
        },
          props.rows.map(row => {
            if (Array.isArray(row.children) && row.children.length > 0) {
              const open = openGroup === row.id
              return h('div', { key: row.id, className: 'md-fallback-group' },
                h(KitButton, {
                  type: 'button',
                  className: 'md-fallback-row md-fallback-parent',
                  'aria-expanded': open ? 'true' : 'false',
                  onClick: () => setOpenGroup(open ? '' : row.id),
                }, `${row.label} ${open ? '▾' : '▸'}`),
                open
                  ? h('div', { className: 'md-fallback-children' }, row.children.map(child => h(KitButton, {
                    key: child.id,
                    type: 'button',
                    className: 'md-fallback-row',
                    disabled: child.disabled === true,
                    onClick: () => run(child),
                  }, child.label)))
                  : null)
            }
            return h(KitButton, {
              key: row.id,
              type: 'button',
              className: 'md-fallback-row',
              disabled: row.disabled === true,
              onClick: () => run(row),
            }, row.label)
          })))
    }

    /**
     * One page in continuous mode: renders when it comes near the viewport,
     * reports when it becomes the page a reader is looking at.
     * @param {{ doc: object, pageNumber: number, scale: number, rootRef: object, onVisible: Function, registerSlot: Function, onError: Function }} props - the document, page, zoom and callbacks.
     * @returns {import('react').ReactElement} the page slot.
     */
    function ReaderPage(props) {
      const [visible, setVisible] = useState(false)
      const [rendered, setRendered] = useState(false)
      // Page height at scale 1: reserves the real page's space before it paints.
      // Without it every unpainted page is only `min-height: 240px`, so jumping
      // to page N in continuous mode landed N*760px too high and the column
      // seemed to jump once the pages above painted.
      const [baseHeight, setBaseHeight] = useState(0)
      const holder = useRef(null)
      const canvas = useRef(null)
      const task = useRef(null)

      useEffect(() => {
        // Measure only pages near the viewport: opening a 300-page chapter used
        // to parse every page just to reserve heights. Far pages keep the
        // 240px placeholder until they come into the prefetch band.
        if (props.doc === null || props.doc === undefined || !visible) return undefined
        let cancelled = false
        void props.doc.getPage(props.pageNumber).then(page => {
          if (!cancelled) setBaseHeight(page.getViewport({ scale: 1 }).height)
        }).catch(() => {})
        return () => { cancelled = true }
      }, [props.doc, props.pageNumber, visible])

      // Render lazily: a long chapter must not paint every page up front.
      useEffect(() => {
        const node = holder.current
        if (node === null || typeof IntersectionObserver !== 'function') {
          setVisible(true)
          return undefined
        }
        const observer = new IntersectionObserver(entries => {
          for (const entry of entries) {
            if (entry.isIntersecting) setVisible(true)
            // Leaving the prefetch margin releases the canvas bitmap; scrolling
            // back repaints it. A long chapter therefore keeps only a few pages.
            else setVisible(false)
            if (entry.intersectionRatio >= 0.5) props.onVisible(props.pageNumber)
          }
        }, { root: props.rootRef.current, rootMargin: '900px 0px', threshold: [0, 0.5] })
        observer.observe(node)
        return () => observer.disconnect()
      }, [props.onVisible, props.pageNumber, props.rootRef])

      useEffect(() => {
        if (visible || canvas.current === null) return
        canvas.current.width = 1
        canvas.current.height = 1
      }, [visible])

      useEffect(() => {
        if (!visible) return undefined
        let cancelled = false
        const paint = async () => {
          try {
            const page = await props.doc.getPage(props.pageNumber)
            if (cancelled) return
            const node = canvas.current
            if (node === null) return
            const render = paintPageCanvas(page, node, props.scale)
            task.current = render
            await render.promise
            if (!cancelled) setRendered(true)
          } catch (error) {
            if (cancelled) return
            const name = error !== null && error !== undefined ? String(error.name) : ''
            if (name === 'RenderingCancelledException' || name === 'AbortException') return
            props.onError(error)
          }
        }
        void paint()
        return () => {
          cancelled = true
          if (task.current !== null) {
            try { task.current.cancel() } catch { /* already finished */ }
            task.current = null
          }
        }
      }, [props.doc, props.pageNumber, props.scale, props.onError, visible])

      return h('div', {
        className: 'md-reader-slot',
        'data-rendered': rendered ? 'true' : undefined,
        ref: node => {
          holder.current = node
          props.registerSlot(props.pageNumber, node)
          if (typeof props.onPageNode === 'function') props.onPageNode(props.pageNumber, node)
        },
      },
        h('span', { className: 'md-reader-page-no', 'aria-hidden': true }, String(props.pageNumber)),
        h('div', {
          className: 'md-reader-page-wrap',
          style: baseHeight > 0 ? { minHeight: `${Math.round(baseHeight * props.scale)}px` } : undefined,
        },
          h('canvas', { className: 'md-reader-canvas', ref: canvas }),
          // Pages painted from the outside (annotation and mask layers) belong to
          // one page, so continuous mode draws them on the current page only.
          props.overlayPage === props.pageNumber && props.overlay !== undefined && props.overlay !== null
            ? props.overlay
            : null,
          h(BlockOverlay, { bookId: props.bookId, code: props.code, pageNumber: props.pageNumber, show: props.showBlocks === true })
        )
      )
    }

    /**
     * Continuous mode: a column of lazily rendered pages.
     * @param {{ doc: object, count: number, scale: number, rootRef: object, onVisible: Function, registerSlot: Function, onError: Function }} props - the document and callbacks.
     * @returns {import('react').ReactElement} the column.
     */
    function ContinuousView(props) {
      const total = Math.max(0, Number(props.count) || 0)
      const current = total === 0 ? 1 : Math.max(1, Math.min(total, Number(props.page) || 1))
      // The plane extends to both sides of the column exactly like the single
      // page. Without symmetric padding the right overhang was scrollable but
      // the left one was clipped at scrollLeft=0, which made the page look
      // off-centre and left no paper to move into on the left.
      const columnRef = useRef(null)
      const [pageWidth, setPageWidth] = useState(0)
      useEffect(() => {
        const column = columnRef.current
        const canvas = column === null ? null : column.querySelector('.md-reader-canvas')
        if (canvas === null || canvas === undefined) return undefined
        const measure = () => setPageWidth(canvas.getBoundingClientRect().width)
        measure()
        if (typeof ResizeObserver !== 'function') return undefined
        const observer = new ResizeObserver(measure)
        observer.observe(canvas)
        return () => observer.disconnect()
      }, [props.doc, props.scale, props.page, props.count])
      const margins = props.margins === null || props.margins === undefined ? null : props.margins
      const padLeft = margins === null || pageWidth <= 0 ? 0 : Math.round(pageWidth * margins.left)
      const padRight = margins === null || pageWidth <= 0 ? 0 : Math.round(pageWidth * margins.right)
      useEffect(() => {
        if (padLeft === 0 && padRight === 0) return
        const column = columnRef.current
        const stage = column === null ? null : column.closest('.md-reader-stage')
        const canvas = column === null ? null : column.querySelector('.md-reader-canvas')
        if (stage === null || canvas === null || canvas === undefined) return
        const stageRect = stage.getBoundingClientRect()
        const pageRect = canvas.getBoundingClientRect()
        const centre = stage.scrollLeft + (pageRect.left - stageRect.left) + pageRect.width / 2
        const wanted = centre - stage.clientWidth / 2
        stage.scrollLeft = Math.max(0, Math.min(stage.scrollWidth - stage.clientWidth, wanted))
      }, [padLeft, padRight])
      // Only the pages around the one being read are mounted. A 300-page chapter
      // used to create 300 components (and 300 observers) up front; the rest stay
      // cheap ghosts until the reader approaches them.
      const from = Math.max(1, current - 12)
      const to = Math.min(total, current + 12)
      const pages = []
      // The plane's margins at the ends of the column: blank paper where the
      // reader may write above the first page and below the last one.
      const topPad = Math.max(0, Math.round(Number(props.topPad) || 0))
      const bottomPad = Math.max(0, Math.round(Number(props.bottomPad) || 0))
      if (topPad > 0) pages.push(h('div', { key: 'pad-top', className: 'md-reader-plane-pad', style: { height: `${topPad}px` } }))
      for (let page = 1; page <= total; page += 1) {
        if (page < from || page > to) {
          pages.push(h('div', { key: page, className: 'md-reader-slot md-reader-ghost' },
            h('span', { className: 'md-reader-page-no', 'aria-hidden': true }, String(page))))
          continue
        }
        // The page being read owns the interactive layer; every other painted
        // page carries its committed marks so scrolling never strips a page of
        // its ink (the old single overlay moved page to page as a flash).
        const overlay = page === props.overlayPage
          ? props.overlay
          : (typeof props.overlayFor === 'function' ? props.overlayFor(page) : null)
        pages.push(h(ReaderPage, {
          key: page,
          doc: props.doc,
          pageNumber: page,
          scale: props.scale,
          rootRef: props.rootRef,
          onVisible: props.onVisible,
          registerSlot: props.registerSlot,
          showBlocks: props.showBlocks,
          bookId: props.bookId,
          code: props.code,
          onError: props.onError,
          // Every page reports its own box: the plane measures pointers
          // against the page being read, and that page can change while the
          // reader scrolls.
          onPageNode: props.onPageNode,
          overlay,
          overlayPage: page,
        }))
      }
      if (bottomPad > 0) pages.push(h('div', { key: 'pad-bottom', className: 'md-reader-plane-pad', style: { height: `${bottomPad}px` } }))
      return h('div', {
        className: 'md-reader-continuous',
        ref: columnRef,
        style: padLeft === 0 && padRight === 0 ? undefined : { paddingLeft: `${padLeft}px`, paddingRight: `${padRight}px` },
      }, pages)
    }

    /**
     * Split one PDF page into text blocks with normalized boxes (0..1).
     * M1 debug helper: lines are merged into paragraphs by vertical gap;
     * a block whose line height clearly exceeds the median is a heading.
     * @param {object} page - a pdf.js page.
     * @returns {Promise<object[]>} blocks with id/page/kind/bbox/text.
     */
    async function parsePageBlocks(page) {
      const viewport = page.getViewport({ scale: 1 })
      const width = viewport.width
      const height = viewport.height
      const content = await page.getTextContent()
      const items = []
      for (const item of content.items) {
        if (typeof item.str !== 'string' || item.str.trim() === '') continue
        const transform = item.transform
        const fontHeight = Math.hypot(transform[2], transform[3]) || Math.abs(transform[3]) || 1
        const start = viewport.convertToViewportPoint(transform[4], transform[5])
        const finish = viewport.convertToViewportPoint(transform[4] + (item.width || 0), transform[5])
        items.push({
          text: item.str,
          x: Math.min(start[0], finish[0]),
          right: Math.max(start[0], finish[0]),
          baseline: start[1],
          h: fontHeight,
        })
      }
      if (items.length === 0) return []
      const sizes = items.map(item => item.h).sort((a, b) => a - b)
      const median = sizes[Math.floor(sizes.length / 2)] || 1
      const lines = []
      for (const item of items) {
        const line = lines.find(candidate => Math.abs(candidate.baseline - item.baseline) <= Math.max(2, item.h * 0.5))
        if (line === undefined) {
          lines.push({ baseline: item.baseline, items: [item] })
        } else {
          line.items.push(item)
          line.baseline = Math.min(line.baseline, item.baseline)
        }
      }
      for (const line of lines) {
        line.items.sort((a, b) => a.x - b.x)
        line.text = line.items.map(item => item.text).join('').replace(/\s+/g, ' ').trim()
        line.left = Math.min(...line.items.map(item => item.x))
        line.right = Math.max(...line.items.map(item => item.right))
        line.h = Math.max(...line.items.map(item => item.h))
        line.top = line.baseline - line.h
      }
      lines.sort((a, b) => a.top - b.top)
      const leftCounts = new Map()
      const rightCounts = new Map()
      for (const line of lines) {
        const left = Math.round(line.left)
        const right = Math.round(line.right)
        leftCounts.set(left, (leftCounts.get(left) ?? 0) + 1)
        rightCounts.set(right, (rightCounts.get(right) ?? 0) + 1)
      }
      const mode = counts => [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
      const bodyLeft = mode(leftCounts)
      const bodyRight = mode(rightCounts)
      const contentWidth = Math.max(1, bodyRight - bodyLeft)
      for (const line of lines) {
        const width = line.right - line.left
        line.formula = width < contentWidth * 0.95
          && (line.left - bodyLeft > line.h * 1.5 || bodyRight - line.right > line.h * 1.5)
      }
            const blocks = []
      let current = null
      for (const line of lines) {
        if (line.text === '') continue
        if (current !== null) {
          const gap = line.top - current.bottom
          const indented = line.left > current.lastLeft + Math.max(3, line.h * 0.8)
          if (line.formula === current.formula && !indented && gap <= Math.max(current.h * 0.9, line.h * 1.2) && line.left <= current.right + line.h * 1.5) {
            current.lines.push(line)
            current.bottom = Math.max(current.bottom, line.baseline)
            current.left = Math.min(current.left, line.left)
            current.right = Math.max(current.right, line.right)
            current.h = Math.max(current.h, line.h)
            current.lastLeft = line.left
            continue
          }
        }
        current = {
          lines: [line],
          top: line.top,
          bottom: line.baseline,
          left: line.left,
          right: line.right,
          h: line.h,
          lastLeft: line.left,
          formula: line.formula === true,
        }
        blocks.push(current)
      }
      return blocks.map((block, index) => {
        // Text items under-report ink: headings and the left edge need a
        // margin proportional to the line height, not a fixed 3pt.
        const pad = Math.max(2, Math.min(6, block.h * 0.3))
        return {
          id: `b-${String(page.pageNumber).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}`,
          page: page.pageNumber,
          kind: block.formula === true ? 'formula' : (block.h > median * 1.25 && (block.right - block.left) < contentWidth * 0.62 ? 'heading' : 'paragraph'),
          bbox: [
            Math.max(0, (block.left - pad) / width),
            Math.max(0, (block.top - pad) / height),
            Math.min(width, block.right - block.left + pad * 2) / width,
            Math.min(height, block.bottom - block.top + pad * 2) / height,
          ],
          text: block.lines.map(line => line.text).join(' ').slice(0, 400),
        }
      })
    }

    /**
     * Debug overlay: draw parsed blocks over one rendered page.
     * @param {{ doc: object, pageNumber: number, show: boolean }} props - document, page and visibility.
     * @returns {import('react').ReactElement | null} the overlay.
     */
    function BlockOverlay(props) {
      const [blocks, setBlocks] = useState([])
      useEffect(() => {
        if (props.show !== true) {
          setBlocks([])
          return undefined
        }
        let cancelled = false
        request('GET', `blocks?book=${encodeURIComponent(props.bookId ?? '')}&code=${encodeURIComponent(props.code ?? '')}&page=${props.pageNumber}`)
          .then(payload => {
            if (!cancelled) setBlocks(Array.isArray(payload.blocks) ? payload.blocks : [])
          })
          .catch(() => {
            if (!cancelled) setBlocks([])
          })
        return () => {
          cancelled = true
        }
      }, [props.bookId, props.code, props.pageNumber, props.show])
      if (props.show !== true || blocks.length === 0) return null
      return h('div', { className: 'md-blocklayer', 'aria-hidden': true },
        blocks.map(block => h('div', {
          key: block.id,
          className: 'md-blockbox',
          'data-kind': block.kind,
          title: block.text,
          style: {
            left: `${block.bbox[0] * 100}%`,
            top: `${block.bbox[1] * 100}%`,
            width: `${block.bbox[2] * 100}%`,
            height: `${block.bbox[3] * 100}%`,
          },
        }))
      )
    }


    /**
     * Paint one overlay/translated page into a JPEG data URL. Both editors use
     * the result as a shared CSS background for every box on that page, which is
     * what keeps a many-box page at one bitmap instead of one canvas per box.
     * @param {object} doc - the overlay or translated pdf.js document.
     * @param {number} pageNumber - 1-based page.
     * @param {number} targetWidth - preferred raster width in pixels.
     * @returns {Promise<{ url: string, hasText: boolean }>} the data URL and whether the page has a text layer.
     */
    async function maskPageImage(doc, pageNumber, targetWidth) {
      try {
        const number = Math.min(pageNumber, doc.numPages || 1)
        const page = await doc.getPage(number)
        const base = page.getViewport({ scale: 1 })
        const width = targetWidth > 0 ? targetWidth : 1200
        const viewport = page.getViewport({ scale: Math.min(2.5, Math.max(1.6, width / base.width)) })
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
        // A page with no text means the overlay PDF has nothing to reveal there.
        const text = await page.getTextContent()
        const hasText = text.items.some(item => typeof item.str === 'string' && item.str.trim() !== '')
        return { url: canvas.toDataURL('image/jpeg', 0.9), hasText }
      } catch {
        return { url: '', hasText: false }
      }
    }

    /**
     * One scrollable PDF view: the stage, the page box, the painting, and the
     * zoom value it reports back. Bilingual columns pass `variant: 'column'`
     * so the caller owns the scroll container. Extra layers (the overlay
     * masks) arrive as children so their geometry is the page box, never the
     * stage: that is what keeps a mask on the right spot at any zoom.
     * @param {{ variant: string, mode: string, doc: object, page: number, count: number, scale: number | null, fitScale: Function, stageRef: object, rootRef: object, onScale: Function, onVisible: Function, onError: Function, registerSlot: Function, showBlocks: boolean, bookId: string, code: string, children: object }} props - the document, the position and the callbacks.
     * @returns {import('react').ReactElement} the view.
     */
    function PdfViewer(props) {
      const canvas = useRef(null)
      const stage = useRef(null)
      const task = useRef(null)
      // Warm bitmaps for the pages around this one, so turning a page shows the
      // page immediately instead of a blank canvas. Cleared whenever the
      // document, the zoom or the stage size changes: a stale bitmap at another
      // scale would be worse than a short wait.
      const pageCache = useRef(new Map())
      const cacheGen = useRef(0)
      const [paintedScale, setPaintedScale] = useState(null)
      // One page's painted height, learned while continuous mode measures page
      // one. It sizes the blank plane margins above the first page and below
      // the last, where the reader may write.
      const [pageHeight, setPageHeight] = useState(0)
      // The parent keeps the same ref for keyboard scrolling and fit width, so
      // the viewer hands its stage to that ref instead of hiding it.
      const attachStage = node => {
        stage.current = node
        if (props.stageRef !== null && props.stageRef !== undefined) props.stageRef.current = node
      }
      // Coming back from the continuous column, the stage can be scrolled
      // thousands of pixels down; the single view is much shorter, and a stale
      // scroll offset leaves its one page outside the viewport (blank). Enter the
      // single view at the top.
      const lastMode = useRef(props.mode)
      useEffect(() => {
        const previous = lastMode.current
        lastMode.current = props.mode
        if (previous === props.mode || props.mode !== 'single') return
        const node = stage.current
        if (node === null) return
        node.scrollTop = 0
        node.scrollLeft = 0
      }, [props.mode])

      useEffect(() => {
        cacheGen.current += 1
        pageCache.current.clear()
      }, [props.doc, props.mode, paintedScale])

      useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const onResize = () => {
          cacheGen.current += 1
          pageCache.current.clear()
        }
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [])

      // A cached page at the current zoom: its own width resolves "fit" the same
      // way the paint would, so no getPage round trip is needed to show it.
      const cachedPaint = useCallback(pageNumber => {
        const entry = pageCache.current.get(pageNumber)
        if (entry === undefined) return null
        const used = props.scale === null ? props.fitScale(entry.baseWidth) : props.scale
        if (Math.abs(used - entry.scale) > 0.001) return null
        return { entry, used }
      }, [props.fitScale, props.scale])

      // Paint the single page. A page or zoom change cancels the previous
      // render, so a fast zoom never leaves a stale bitmap on top.
      useEffect(() => {
        if (props.mode === 'continuous' || props.doc === null || props.doc === undefined) return undefined
        const node = canvas.current
        if (node === null) return undefined
        const shot = cachedPaint(props.page)
        if (shot !== null) {
          node.width = shot.entry.canvas.width
          node.height = shot.entry.canvas.height
          node.style.width = shot.entry.cssWidth
          node.style.height = shot.entry.cssHeight
          const context = node.getContext('2d')
          if (context !== null) context.drawImage(shot.entry.canvas, 0, 0)
          if (props.scale === null) props.onScale(shot.used)
          return undefined
        }
        let cancelled = false
        void (async () => {
          try {
            const page = await props.doc.getPage(props.page)
            if (cancelled) return
            const base = page.getViewport({ scale: 1 })
            const used = props.scale === null ? props.fitScale(base.width) : props.scale
            if (task.current !== null) {
              try { task.current.cancel() } catch { /* already finished */ }
              task.current = null
            }
            const render = paintPageCanvas(page, node, used)
            task.current = render
            await render.promise
            if (cancelled) return
            setPaintedScale(current => (current === used ? current : used))
            // The document starts at "fit width", which is only known after the
            // first page's size is; record it so later zoom is relative to it.
            if (props.scale === null) props.onScale(used)
          } catch (error) {
            if (cancelled) return
            const name = error !== null && error !== undefined ? String(error.name) : ''
            if (name === 'RenderingCancelledException' || name === 'AbortException') return
            props.onError(error)
          }
        })()
        return () => {
          cancelled = true
          if (task.current !== null) {
            try { task.current.cancel() } catch { /* already finished */ }
            task.current = null
          }
        }
      }, [props.doc, props.page, props.scale, props.mode, props.fitScale, props.onScale, props.onError, cachedPaint])

      // Warm the adjacent pages while the reader is idle. A page that fails to
      // warm is simply painted on demand, as before.
      useEffect(() => {
        if (props.mode === 'continuous' || props.doc === null || props.doc === undefined || paintedScale === null) return undefined
        const generation = cacheGen.current
        const doc = props.doc
        const total = Number(props.count) || 0
        const targets = [props.page - 1, props.page + 1]
          .filter(page => page >= 1 && (total <= 0 || page <= total))
        const idle = typeof requestIdleCallback === 'function'
          ? callback => requestIdleCallback(callback, { timeout: 800 })
          : callback => setTimeout(callback, 120)
        let cancelled = false
        // A fast page flip must not leave the previous warm-up painting: each
        // pending render is cancelled when this effect is torn down.
        const pending = new Map()
        const warm = async pageNumber => {
          if (cancelled || generation !== cacheGen.current || pageCache.current.has(pageNumber)) return
          try {
            const page = await doc.getPage(pageNumber)
            if (cancelled || generation !== cacheGen.current) return
            const base = page.getViewport({ scale: 1 })
            const used = props.scale === null ? props.fitScale(base.width) : props.scale
            if (Math.abs(used - paintedScale) > 0.001) return
            const offscreen = document.createElement('canvas')
            const render = paintPageCanvas(page, offscreen, used)
            pending.set(pageNumber, render)
            await render.promise
            pending.delete(pageNumber)
            if (cancelled || generation !== cacheGen.current) return
            pageCache.current.set(pageNumber, {
              canvas: offscreen,
              baseWidth: base.width,
              scale: used,
              cssWidth: offscreen.style.width,
              cssHeight: offscreen.style.height,
            })
            while (pageCache.current.size > PAGE_PRELOAD_LIMIT) {
              const oldest = pageCache.current.keys().next().value
              pageCache.current.delete(oldest)
            }
          } catch {
            // A page that fails to warm paints normally when the reader reaches it.
            pending.delete(pageNumber)
          }
        }
        const handles = targets.map(pageNumber => idle(() => { void warm(pageNumber) }))
        return () => {
          cancelled = true
          if (typeof cancelIdleCallback === 'function') handles.forEach(handle => cancelIdleCallback(handle))
          else handles.forEach(handle => clearTimeout(handle))
          for (const render of pending.values()) {
            try { render.cancel() } catch { /* already finished */ }
          }
          pending.clear()
        }
      }, [props.doc, props.mode, props.page, props.count, props.scale, props.fitScale, paintedScale])

      // Continuous mode has no single-page paint to learn the page size from,
      // so measure page one instead of leaving the scale unknown.
      useEffect(() => {
        if (props.scale !== null || props.mode !== 'continuous' || props.doc === null || props.doc === undefined) return undefined
        let cancelled = false
        void props.doc.getPage(1).then(page => {
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const used = props.fitScale(base.width)
          props.onScale(used)
          setPageHeight(Math.round(base.height * used))
        }).catch(() => {})
        return () => { cancelled = true }
      }, [props.doc, props.mode, props.scale, props.fitScale, props.onScale])

      // Continuous mode pans nothing, so its plane margins are real blank space
      // at the ends of the column: one page above the first page and one below
      // the last. Measured pages update the height when the zoom changes.
      useEffect(() => {
        if (props.mode !== 'continuous' || props.doc === null || props.doc === undefined) return undefined
        if (props.scale === null) return undefined
        let cancelled = false
        void props.doc.getPage(1).then(page => {
          if (cancelled) return
          setPageHeight(Math.round(page.getViewport({ scale: props.scale }).height))
        }).catch(() => {})
        return () => { cancelled = true }
      }, [props.doc, props.mode, props.scale])

      // Panning the shared annotation plane. Any mode that has no room of its
      // own (continuous scrolls its own column) pans by dragging the stage; the
      // hand tool and the space bar are the only gestures that move the page, so
      // a drawing tool never fights a drag.
      const pan = props.pan !== null && props.pan !== undefined ? props.pan : null
      const panEnabled = props.panEnabled === true
      const panDrag = useRef(null)
      // The plane is finite: with the page on screen, the hand may move it by
      // the plane's margins (five page widths each side, one page height each
      // way by default). The clamp follows the zoom because it uses the painted
      // canvas size. The geometry lives in `createPlane`, the same object the
      // reader and the preview use.
      const plane = createPlane(props.margins === undefined ? null : props.margins)
      const planeMargins = plane.margins
      // Continuous mode's blank margins at the two ends of the column, in pixels.
      const padTop = Math.round(pageHeight * planeMargins.top)
      const padBottom = Math.round(pageHeight * planeMargins.bottom)
      // The top pad sits above every page, so growing it pushes the whole column
      // down. Compensate the scroll so the page being read stays where it is
      // (without this, opening a chapter scrolled to page N lands on blank paper
      // the moment the pad is measured).
      const lastPadTop = useRef(0)
      useEffect(() => {
        const node = stage.current
        const delta = padTop - lastPadTop.current
        lastPadTop.current = padTop
        if (node === null || delta === 0) return
        node.scrollTop += delta
      }, [padTop])
      const pageSize = () => {
        const node = canvas.current
        const rect = node === null ? null : node.getBoundingClientRect()
        return {
          width: rect === null ? 0 : rect.width,
          height: rect === null ? 0 : rect.height,
        }
      }
      // How far the page may move vertically. Without off-page notes the page
      // stays put (single mode reads as one page); notes above/below unlock just
      // enough room to bring them into view, plus a small breathing space.
      const verticalNeeds = props.panNeeds === null || props.panNeeds === undefined ? null : props.panNeeds
      const clampPan = value => {
        const size = pageSize()
        if (verticalNeeds === null) return plane.clampPan(value, size)
        const limit = plane.panLimit(size)
        const height = size.height > 0 ? size.height : 800
        const top = Math.max(0, Math.min(plane.margins.top, Number(verticalNeeds.top) || 0))
        const bottom = Math.max(0, Math.min(plane.margins.bottom, Number(verticalNeeds.bottom) || 0))
        const minY = top > 0 ? -(Math.round(height * top) + 24) : 0
        const maxY = bottom > 0 ? Math.round(height * bottom) + 24 : 0
        return {
          x: Math.max(limit.minX, Math.min(limit.maxX, value.x)),
          y: Math.max(minY, Math.min(maxY, value.y)),
        }
      }
      const needsKey = verticalNeeds === null ? '' : `${verticalNeeds.top}|${verticalNeeds.bottom}`
      useEffect(() => {
        if (pan === null || pan === undefined || typeof props.onPan !== 'function' || verticalNeeds === null) return
        const next = clampPan(pan)
        if (next.x !== pan.x || next.y !== pan.y) props.onPan(next)
      }, [needsKey])
      const beginPan = event => {
        if (!panEnabled || event.button !== 0) return
        panDrag.current = { start: [event.clientX, event.clientY], origin: pan ?? { x: 0, y: 0 } }
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* capture is a nicety */ }
      }
      const movePan = event => {
        if (panDrag.current === null) return
        const dx = event.clientX - panDrag.current.start[0]
        const dy = event.clientY - panDrag.current.start[1]
        if (typeof props.onPan === 'function') {
          props.onPan(clampPan({ x: panDrag.current.origin.x + dx, y: panDrag.current.origin.y + dy }))
        }
      }
      const endPan = () => { panDrag.current = null }
      // In continuous mode the page column itself scrolls, so the hand drags the
      // scroller instead of the plane.
      const scrollGrab = props.scrollGrab === true
      const scrollDrag = useRef(null)
      const beginScroll = event => {
        if (!scrollGrab || event.button !== 0) return
        const node = event.currentTarget
        scrollDrag.current = { start: [event.clientX, event.clientY], left: node.scrollLeft, top: node.scrollTop }
        try { node.setPointerCapture(event.pointerId) } catch { /* capture is a nicety */ }
      }
      const moveScroll = event => {
        if (scrollDrag.current === null) return
        const node = event.currentTarget
        node.scrollLeft = scrollDrag.current.left - (event.clientX - scrollDrag.current.start[0])
        node.scrollTop = scrollDrag.current.top - (event.clientY - scrollDrag.current.start[1])
      }
      const endScroll = () => { scrollDrag.current = null }

      // Neighbouring PDF pages stay preloaded for a seamless page turn, but
      // they are not drawn: single mode must read as one page. Off-page notes
      // still paint on this page's annotation plane.
      const content = props.mode === 'continuous'
        ? h(ContinuousView, {
          doc: props.doc,
          page: props.page,
          count: props.count,
          scale: props.scale === null ? 1 : props.scale,
          rootRef: props.rootRef === null || props.rootRef === undefined ? stage : props.rootRef,
          showBlocks: props.showBlocks,
          bookId: props.bookId,
          code: props.code,
          onVisible: props.onVisible,
          registerSlot: props.registerSlot,
          onError: props.onError,
          // The current page reports its box for pointer measurement.
          onPageNode: props.onPageNode,
          // The page being read gets the interactive layer; the others get a
          // read-only copy of their own marks, so a turn never blanks them.
          overlay: props.overlay,
          overlayFor: props.overlayFor,
          overlayPage: props.overlayPage === undefined ? props.page : props.overlayPage,
          margins: props.margins,
          // Blank plane at the two ends of the column, sized like a page.
          topPad: padTop,
          bottomPad: padBottom,
        })
        : h('div', {
          className: 'md-reader-single',
          // Relative offsets, not a transform: a transform creates a stacking
          // context, which would put the plane's "+" handles under the pointer
          // layer as soon as the page is panned (they must stay clickable).
          style: pan !== null ? { left: `${pan.x}px`, top: `${pan.y}px` } : undefined,
        },
          // The plane's outline: a dashed line where the hand and the pen stop,
          // so the edge is visible instead of guessed. It is the page box plus
          // the margins, in page units. Rendered with the page's own layers.
          h('div', {
            className: 'md-reader-single-page',
            ref: node => {
              if (typeof props.onPageNode === 'function') props.onPageNode(props.page, node)
            },
          },
            h('canvas', { className: 'md-reader-canvas', ref: canvas }),
            props.children
          ))

      if (props.variant === 'column') return content
      const stageHostRef = useRef(null)
      const planeOverlay = props.stableHost !== true || props.mode === 'continuous' || typeof props.onExpandPlane !== 'function'
        ? null
        : h(PlaneBounds, {
          fixed: true,
          anchorRef: canvas,
          hostRef: stageHostRef,
          margins: props.margins,
          onExpand: props.onExpandPlane,
          version: String(pan === null ? 0 : pan.x) + ":" + String(pan === null ? 0 : pan.y) + ":" + String(paintedScale) + ":" + String(props.page) + ":" + String(props.doc === null || props.doc === undefined ? 0 : props.doc.numPages),
        })
      const stageNode = h('div', {
        className: 'md-reader-stage',
        'data-mode': props.mode,
        'data-grab': (panEnabled || scrollGrab) && panDrag.current === null ? 'true' : undefined,
        'data-panning': panDrag.current !== null ? 'true' : undefined,
        'data-panned': pan !== null && (pan.x !== 0 || pan.y !== 0) ? 'true' : undefined,
        ref: attachStage,
        onPointerDown: panEnabled ? beginPan : scrollGrab ? beginScroll : undefined,
        onPointerMove: panEnabled ? movePan : scrollGrab ? moveScroll : undefined,
        onPointerUp: panEnabled ? endPan : scrollGrab ? endScroll : undefined,
        onPointerCancel: panEnabled ? endPan : scrollGrab ? endScroll : undefined,
        onPointerLeave: panEnabled ? endPan : scrollGrab ? endScroll : undefined,
      }, content)
      // The pointer layer must cover the *viewport*, not the scrolled content: an
      // absolutely positioned child of the scroller is laid out at the top of the
      // content, so after scrolling it no longer covers the visible page (which
      // is why continuous mode stopped accepting strokes once it was scrolled).
      // The host frame is not a scroller; the stage inside it still is.
      // Keep the same host wrapper in both modes: swapping the root between the
      // stage and a wrapper unmounts the scroller on every mode switch.
      if (props.stableHost !== true && props.captureLayer === undefined && planeOverlay === null) return stageNode
      return h('div', { className: 'md-reader-stage-host', ref: stageHostRef }, stageNode, props.captureLayer, planeOverlay)
    }
    /**
     * The full-page PDF reader: one page or a continuous column, page
     * navigation, zoom, reading-mode switch, and the chapter's three New
     * buttons (which start a session and leave for it).
     * @param {{ reader: object, doc: object, busy: boolean, forceNew: boolean, fitScale: Function, onScale: Function, stageRef: Function, paneRef: Function, onBack: Function, onShelf: Function, onPrev: Function, onNext: Function, onPage: Function, onZoomIn: Function, onZoomOut: Function, onFit: Function, onRetry: Function, onMode: Function, onNewSession: Function, onForceNew: Function, onVisible: Function }} props - the open reader and its handlers.
     * @returns {import('react').ReactElement} the reader.
     */
    function ReaderView(props) {
      const reader = props.reader
      // The chapter's shared state, for the diagnostic overlay: the page box and
      // the annotation key are read from the same record the preview uses.
      const storeView = useChapterView(reader.bookId, reader.code)
      const diag = useDiag()
      const railSide = props.railSide === 'left' ? 'left' : 'right'
      const [pageText, setPageText] = useState(String(reader.page))
      const pageInput = useRef(null)
      const [showBlocks, setShowBlocks] = useState(false)
      // The single page and its annotations sit on one shared, pannable plane:
      // marks may live outside the page, and the hand tool (or a held space)
      // moves the plane. Pan is a per-visit value and resets with the document.
      const [inkPan, setInkPan] = useState({ x: 0, y: 0 })
      // A "+" press means the user asked for room outside the page: unlock
      // vertical panning to the plane edge, even when no note lives there yet.
      const [planeExpanded, setPlaneExpanded] = useState(0)
      useEffect(() => {
        setInkPan({ x: 0, y: 0 })
        setPlaneExpanded(0)
        // A mode change gets a fresh plane: a pan left over from the previous
        // view could put the page off-screen behind a hidden-overflow stage,
        // which looks exactly like a blank viewer.
      }, [reader.bookId, reader.code, reader.name, reader.variant, reader.mode])
      // Holding the space bar switches to the hand tool for as long as it is
      // held; releasing it gives the previous tool back without a mode change.
      const [spaceHeld, setSpaceHeld] = useState(false)
      const [toolsOpen, setToolsOpen] = useState(true)
      const [overlay, setOverlay] = useState(false)
      const [maskDraft, setMaskDraft] = useState(null)
      // The boxes "框住本页块" made on this page: a second press removes them, and
      // the button stays pressed while the page still holds exactly these boxes.
      const [autoBoxes, setAutoBoxes] = useState(null)
      // Freehand annotations, one array of strokes per page, normalized so they
      // follow the page box through any zoom.
      const [annotTool, setAnnotTool] = useState('')
      // The single page is the shared annotation plane: a mark may live past the
      // page edge and stays visible, because single and continuous are two views
      // of the same notes. Continuous keeps marks inside their own page (they
      // would otherwise overlap the next page) and draws a read-only copy per
      // page instead, so no page loses its ink while the reader turns.
      const extended = reader.mode !== 'continuous'
      // The hand is the only tool that moves the plane; holding the space bar is
      // the same gesture without changing the picked tool.
      const handActive = annotTool === 'hand' || spaceHeld
      // The tools that leave marks. Only these get the stage-sized capture layer
      // (so a stroke can start outside the page); the question box keeps its own
      // page-sized layer and the mask layer keeps its own pointers.
      const inkTool = annotTool !== '' && annotTool !== 'hand' && annotTool !== 'question' && annotTool !== 'mask'
      useEffect(() => {
        if (!spaceHeld) return undefined
        // A window that loses focus never delivers the keyup: drop the hold.
        const release = () => setSpaceHeld(false)
        window.addEventListener('blur', release)
        return () => window.removeEventListener('blur', release)
      }, [spaceHeld])
      // Hold the space bar to pan. A keypress inside a field or the open note
      // editor belongs to that field, so it is ignored there.
      useEffect(() => {
        const isTyping = target => target !== null && target !== undefined
          && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable === true
            || (typeof target.closest === 'function' && target.closest('.md-note-editor') !== null))
        const down = event => {
          if (event.code !== 'Space' || event.repeat === true || isTyping(event.target)) return
          event.preventDefault()
          setSpaceHeld(true)
        }
        const up = event => {
          if (event.code !== 'Space') return
          setSpaceHeld(false)
        }
        window.addEventListener('keydown', down)
        window.addEventListener('keyup', up)
        return () => {
          window.removeEventListener('keydown', down)
          window.removeEventListener('keyup', up)
        }
      }, [])
      // Which column the undo/redo buttons act on: the original layer or the
      // translated column's own ink (see ColumnInk).
      const [activeSide, setActiveSide] = useState('main')
      const [annotColor, setAnnotColor] = useState('#1f1f1f')
      const [annotWidth, setAnnotWidth] = useState(2)
      // Which page `strokes` belongs to. The interactive layer is only drawn
      // once the list matches the page on screen; until then the page shows its
      // committed marks through a read-only copy, so a page turn never paints
      // the previous page's ink on top of the new one for a frame.
      const [inkPage, setInkPage] = useState(reader.page)
      // The page the pen writes on. It follows `reader.page` when the reader
      // moves, and in continuous mode a pointer on another page adopts that page
      // (reports are debounced, so the paper under the pen can be ahead).
      const annotPage = useRef(reader.page)
      // The plane is finite but the user may widen it a page at a time; the
      // choice is global, like the reading width.
      const planeMargins = usePlaneMargins()
      const plane = createPlane(planeMargins)
      const expandPlane = side => {
        expandPlaneMargin(side)
        setPlaneExpanded(value => value + 1)
        // Nudge the plane toward the new edge so the added room is visible
        // instead of making the "+" look inert.
        const shift = 24
        setInkPan(current => ({
          x: side === 'left' ? current.x + shift : side === 'right' ? current.x - shift : current.x,
          y: side === 'top' ? current.y + shift : side === 'bottom' ? current.y - shift : current.y,
        }))
      }
      // The text adjustment panel: opened by a right-click on a text box, never
      // by a plain selection. It floats, moves by its header, closes with its
      // button or with a press anywhere else.
      const [stylePanel, setStylePanel] = useState(null)
      const stylePanelRef = useRef(null)
      const stylePanelDrag = useRef(null)
      const [roughTick, setRoughTick] = useState(0)
      // Pointer-near-the-edge state for the rail. CSS :hover alone proved
      // unreliable once the rail sits over the scrolling stage, so the section
      // also opens it by position.
      const [railOpen, setRailOpen] = useState(false)
      const [railPanel, setRailPanel] = useState(false)
      // Vertical centre of the tool button that opened the panel, so the panel
      // sits beside that icon instead of at the middle of the page.
      const [railAnchor, setRailAnchor] = useState(null)
      // The tool the pointer is on, not the selected tool: hovering the text
      // icon must show text controls even while the pen is still selected.
      const [panelTool, setPanelTool] = useState('')
      const railPanelTimer = useRef(null)
      const railCloseTimer = useRef(null)
      const beginRailPanel = (element, toolId) => {
        if (railCloseTimer.current !== null) {
          clearTimeout(railCloseTimer.current)
          railCloseTimer.current = null
        }
        setPanelTool(toolId)
        const wrap = element.closest('.md-rail-wrap')
        if (wrap !== null) {
          const button = element.getBoundingClientRect()
          const box = wrap.getBoundingClientRect()
          setRailAnchor(button.top - box.top + button.height / 2)
        }
        if (railPanel) return
        if (railPanelTimer.current !== null) clearTimeout(railPanelTimer.current)
        railPanelTimer.current = setTimeout(() => setRailPanel(true), 400)
      }
      const leaveRail = () => {
        if (railPanelTimer.current !== null) clearTimeout(railPanelTimer.current)
        railPanelTimer.current = null
        // Keep the panel just long enough to cross the small gap and use a
        // slider, then let it go: the pointer leaving is a finished interaction.
        if (railCloseTimer.current !== null) clearTimeout(railCloseTimer.current)
        railCloseTimer.current = setTimeout(() => setRailPanel(false), 220)
      }
      useEffect(() => () => {
        if (railPanelTimer.current !== null) clearTimeout(railPanelTimer.current)
        if (railCloseTimer.current !== null) clearTimeout(railCloseTimer.current)
      }, [])
      const onRailPointer = event => {
        const rect = event.currentTarget.getBoundingClientRect()
        const fromEdge = railSide === 'right' ? rect.right - event.clientX : event.clientX - rect.left
        const open = fromEdge <= 48
        setRailOpen(current => (current === open ? current : open))
      }
      useEffect(() => {
        let alive = true
        roughReady.then(() => { if (alive) setRoughTick(value => value + 1) })
        return () => { alive = false }
      }, [])
      const noteSeq = useRef(0)
      // The editor owns the text while typing; this ref is what gets saved.
      const noteText = useRef('')
      const [translatedImage, setTranslatedImage] = useState('')
      const [overlayNote, setOverlayNote] = useState('')
      // The overlay PDF can be a whole-page reflow (a chapter translated page by
      // page). That is what the box reveal cannot line up with, and it is what
      // "realign from cached text" rebuilds, so the note carries the button.
      const [overlayReflow, setOverlayReflow] = useState(false)
      const [realigning, setRealigning] = useState(false)
      const overlaySource = useRef('')
      const overlayLayer = useRef(null)
      const overlayStart = useRef(null)
      const [translateTarget, setTranslateTarget] = useState('zh')
      // Translation facts live in the shared per-chapter cache, not in this
      // component: switching chapters must not carry the previous chapter's
      // answer along, and the preview must read the same record.
      const translation = useTranslationFacts(reader.bookId, reader.code)
      const hasTranslation = translation.exists === true
      const translating = translation.translating
      // The chapter this render shows. In-flight job callbacks compare against
      // it, so a result for the chapter the user left cannot touch this one.
      const chapterRef = useRef('')
      chapterRef.current = chapterKey(reader.bookId, reader.code)
      const [translateNote, setTranslateNote] = useState('')
      const slotRefs = useRef(new Map())
      const switchingMode = useRef(false)
      // Until this timestamp a programmatic jump is still settling: the pages it
      // crosses must not report themselves as the page being read.
      const jumpingUntil = useRef(0)
      const visibleTimer = useRef(null)
      const [dual, setDual] = useState(false)
      const [rightScale, setRightScale] = useState(null)
      const jobRef = useRef('')
      const noteKey = `pdfdesk:translate-note:${reader.bookId}:${reader.code}`
      const updateNote = value => {
        setTranslateNote(value)
        try {
          window.localStorage.setItem(noteKey, value)
        } catch {
          // storage unavailable
        }
      }
      // A finished chapter can still have empty pages; say which ones instead
      // of reporting a clean success the reader cannot trust.
      const doneNote = state => {
        const missing = Array.isArray(state.failedPages) ? state.failedPages : []
        const tokens = state.tokens !== null && typeof state.tokens === 'object' ? Number(state.tokens.total) || 0 : 0
        const suffix = tokens > 0 ? `（${format('translateTokens', { n: tokens.toLocaleString() })}）` : ''
        const base = missing.length === 0
          ? `${format('translateDone')}：${state.pdf}${suffix}`
          : format('translateDonePartial', { n: missing.length, pages: missing.join('、'), tokens: tokens.toLocaleString() })
        // The overlay can only sit on the original's text when every page came
        // from its block boxes; a page translated whole-page is a reflow.
        const reflow = Array.isArray(state.overlayReflowPages) ? state.overlayReflowPages : []
        if (reflow.length === 0) return base
        return `${base}；${format('translateBlocksFallback', { n: reflow.length, pages: reflow.join('、') })}`
      }
      const partialKey = `pdfdesk:partial:${reader.bookId}:${reader.code}`
      const [partialPages, setPartialPages] = useState([])
      // Last failed action, so a failure in export/import gets a retry button
      // instead of a dead-end message.
      const [retryAction, setRetryAction] = useState(null)
      const [exportJob, setExportJob] = useState('')
      // Bumped whenever the translated/overlay file on disk changes, so the
      // reader (and the side preview) reloads the same new bytes.
      const [docRev, setDocRev] = useState(0)
      // Annotation edits are shared: each end persists, then announces, and the
      // other end re-reads that page. `remoteAnnotRev` is this end's reload signal.
      const [remoteAnnotRev, setRemoteAnnotRev] = useState(0)
      const seenAnnotRev = useRef(0)
      // Neighbouring pages' marks, read before the reader arrives on them, so a
      // turn does not show a blank page while localStorage is read. Any edit
      // clears it: a stale copy would be worse than the tiny read it saves.
      const annotPrefetch = useRef(new Map())
      // Unsaved edits, one per page. They are deliberately not annotations: they
      // never reach the store, the disk or an export.
      const pageDrafts = useMemo(() => createPageDraftStore(), [reader.bookId, reader.code, reader.name, reader.variant])
      // Page marks live in the shared store: the side preview writes the same keys.
      const inkStore = useMemo(() => createAnnotationStore(reader.bookId, reader.code, 'reader'), [reader.bookId, reader.code])
      // One editing state for the page ink: the lists, the in-progress drafts,
      // the selection, the note being typed and the history. The write path is
      // inside the hook, so the reader and the preview cannot diverge.
      const inkEditor = useInkEditorState({
        inkStore,
        pageRef: annotPage,
        editKey: chapterKey(reader.bookId, reader.code),
        pageNumber: inkPage,
        onPrefetchClear: () => { annotPrefetch.current.clear() },
        onRev: rev => { seenAnnotRev.current = rev },
      })
      const {
        strokes, setStrokes, strokesRef,
        masks, setMasks, masksRef,
        selection, setSelection,
        draftStroke, setDraftStroke,
        textDraft, setTextDraft,
        noteEdit, setNoteEdit,
        noteStyle, setNoteStyle,
        shapeDraft, setShapeDraft,
        drag, setDrag,
        resize, setResize,
        resizeEntry, setResizeEntry,
        erasing,
        inkRev, setInkRev,
        bumpHistory,
        saveAnnots: savePageAnnots,
        saveMasks: savePageMasks,
        restorePage,
        undoPage,
        redoPage,
        historyCounts,
      } = inkEditor
      // Marquee selection: drag on empty paper with the select tool; selected
      // marks then move together on the next drag.
      const [marquee, setMarquee] = useState(null)
      const [groupSelection, setGroupSelection] = useState([])
      const [groupDrag, setGroupDrag] = useState(null)
      useEffect(() => {
        if (annotTool === 'select') return
        setMarquee(null)
        setGroupSelection([])
        setGroupDrag(null)
      }, [annotTool])
      const basePanNeeds = offPageExtent(strokes)
      const panNeeds = planeExpanded === 0
        ? basePanNeeds
        : {
          top: Math.max(basePanNeeds.top, planeMargins.top),
          bottom: Math.max(basePanNeeds.bottom, planeMargins.bottom),
        }
      // `noteEdit` lives in the shared hook; this ref mirrors it for handlers
      // that run after the render (keyboard, blur).
      const noteEditRef = useRef(null)
      noteEditRef.current = noteEdit
      useEffect(() => {
        annotPrefetch.current.clear()
      }, [inkStore])
      strokesRef.current = strokes
      masksRef.current = masks
      useEffect(() => {
        seenAnnotRev.current = Number(readView(reader.bookId, reader.code).annotRev) || 0
        return subscribeView(reader.bookId, reader.code, state => {
          if (state.origin !== 'side') return
          const next = Number(state.annotRev) || 0
          if (next <= seenAnnotRev.current) return
          seenAnnotRev.current = next
          annotPrefetch.current.clear()
          setRemoteAnnotRev(value => value + 1)
        })
      }, [reader.bookId, reader.code])
      // Every edit goes through the shared store: state, storage, the library
      // mirror and the announcement stay in step, and a page's own load never
      // writes anything back. Each commit first files the page as it was, so the
      // toolbar's undo has something to go back to.
      // Reconcile with the library mirror on open: a cleared browser gets its
      // pages back, a browser that predates the mirror hands them over.
      useEffect(() => {
        let cancelled = false
        void (async () => {
          const result = await syncChapterAnnotations(reader.bookId, reader.code)
          if (cancelled || result.restored === 0) return
          seenAnnotRev.current = bumpAnnotRev(reader.bookId, reader.code, 'reader')
          setRemoteAnnotRev(value => value + 1)
        })()
        return () => { cancelled = true }
      }, [reader.bookId, reader.code])
      useEffect(() => {
        if (docRev === 0) return
        syncView(reader.bookId, reader.code, { docRev }, 'reader')
      }, [docRev, reader.bookId, reader.code])
      const cancelExport = () => {
        if (exportJob === '') return
        void request('POST', 'export-cancel', { job: exportJob }).catch(() => {})
        setExportJob('')
        updateNote(format('exportCancelled'))
      }
      const rememberPartial = state => {
        const missing = Array.isArray(state.failedPages) ? state.failedPages : []
        setPartialPages(missing)
        try {
          if (missing.length === 0) window.localStorage.removeItem(partialKey)
          else window.localStorage.setItem(partialKey, JSON.stringify(missing))
        } catch {
          // storage unavailable
        }
      }
      useEffect(() => {
        try {
          const raw = window.localStorage.getItem(partialKey)
          setPartialPages(raw === null ? [] : JSON.parse(raw))
        } catch {
          setPartialPages([])
        }
      }, [partialKey])
      useEffect(() => {
        try {
          const raw = window.localStorage.getItem(noteKey)
          if (raw !== null) updateNote(raw)
        } catch {
          // storage unavailable
        }
      }, [noteKey])
      const cancelTranslate = () => {
        if (jobRef.current === '') return
        const jobId = jobRef.current
        request('POST', 'translate-cancel', { job: jobId }).catch(() => {})
        jobRef.current = ''
        forgetStoredJob(reader.bookId, reader.code, jobId)
        // Only the job this button cancels may reset the chapter's state; a
        // newer job for the same chapter keeps its own key.
        if (ownsStoredJob(reader.bookId, reader.code, jobId)) {
          writeTranslationFacts(reader.bookId, reader.code, { translating: false })
        }
        setDeskStatus('idle')
        updateNote(format('translateCancelled'))
      }
      const [dualDoc, setDualDoc] = useState(null)
      const rebuilt = useRef(new Set())
      const dualLeft = useRef(null)
      const dualRight = useRef(null)
      useEffect(() => setPageText(String(reader.page)), [reader.page])
      useEffect(() => {
        saveReaderPage(reader.bookId, reader.code, reader.page)
      }, [reader.bookId, reader.code, reader.page])
      useEffect(() => {
        if (!dual && !overlay) {
          overlaySource.current = ''
          setOverlayNote('')
          return undefined
        }
        let cancelled = false
        let held = null
        const load = async () => {
          try {
            // The chapter PDF is rendered from the cached page markdown. Re-render
            // it when this release changed the renderer (a marker on the Host
            // keeps it a one-off), so old `\(...\)` left-overs get fixed without
            // paying for the translation again.
            try {
              const key = `${reader.bookId}|${reader.code}|${docRev}|translated`
              if (!rebuilt.current.has(key)) {
                await request('POST', 'rebuild-translated', { book: reader.bookId, code: reader.code })
                rebuilt.current.add(key)
              }
            } catch {
              // no cached pages yet, or XeLaTeX failed: read what exists
            }
            const lib = await loadPdfjs()
            // The same URL is the same file: the right column's box reveal uses
            // the very document this pane already parsed when it asks for the
            // same variant.
            const make = async variant => {
              const url = chapterPdfUrl(reader.bookId, reader.code, { name: reader.name, variant, rev: docRev })
              return sharedDocuments.claim(url, () => lib.getDocument({ url, isEvalSupported: false, ...pdfAssetUrls() }))
            }
            let next = null
            let notice = ''
            if (overlay && reader.variant !== 'translated') {
              // Rebuild from the cached per-page blocks so an old overlay PDF
              // rendered by an earlier release cannot hide the fix.
              try {
                const key = `${reader.bookId}|${reader.code}|${docRev}|overlay`
                if (!rebuilt.current.has(key)) {
                  await request('POST', 'rebuild-overlay', { book: reader.bookId, code: reader.code })
                  rebuilt.current.add(key)
                }
              } catch {
                // keep the existing overlay if the rebuild fails
              }
              try {
                next = await make('overlay')
              } catch {
                next = null
              }
              if (next === null) {
                // No overlay layer to reveal: show the whole translation instead
                // and say so, rather than silently leaving the original.
                next = await make('translated')
                notice = format('overlayFallback')
              }
            } else if (reader.variant !== 'translated') {
              next = await make('translated')
            } else {
              next = await make('')
            }
            const doc = next.doc
            overlaySource.current = notice === '' && overlay ? 'overlay' : 'translated'
            if (cancelled) {
              next.release()
              return
            }
            held = next
            setOverlayNote(notice)
            setDualDoc(doc)
            if (doc !== null && overlay && notice === '' && !cancelled) {
              // Two-column pages position poorly: say so instead of pretending
              // the boxes line up. A later release can reflow by column.
              try {
                const payload = await request('GET',
                  `blocks?book=${encodeURIComponent(reader.bookId)}&code=${encodeURIComponent(reader.code)}&page=${reader.page}`)
                const list = Array.isArray(payload.blocks) ? payload.blocks : []
                const looksTwoColumn = list.some((first, index) => list.slice(index + 1).some(second => {
                  const a = first.bbox
                  const b = second.bbox
                  if (!Array.isArray(a) || !Array.isArray(b)) return false
                  const overlap = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1])
                  if (overlap < 0.5 * Math.min(a[3], b[3])) return false
                  const apart = a[0] + a[2] <= b[0] + 0.01 || b[0] + b[2] <= a[0] + 0.01
                  return apart && a[2] < 0.45 && b[2] < 0.45
                }))
                if (!cancelled && looksTwoColumn) setOverlayNote(format('overlayTwoColumns'))
              } catch {
                // blocks are optional here
              }
            }
          } catch {
            if (!cancelled) {
              overlaySource.current = ''
              setOverlayNote(overlay ? format('overlayMissing') : '')
              updateNote(format('translateFailed'))
              setDual(false)
            }
          }
        }
        void load()
        return () => {
          cancelled = true
          if (held !== null) {
            held.release()
            held = null
          }
        }
      }, [dual, overlay, reader.bookId, reader.code, docRev])


      // The reader keeps the shared per-chapter facts fresh while it is open;
      // the preview asks for the same facts itself when the reader is not
      // mounted, so neither end depends on the other being alive.
      useEffect(() => {
        if (reader.bookId === '' || reader.code === '') return
        void refreshTranslationFacts(reader.bookId, reader.code)
      }, [reader.bookId, reader.code])
      const maskKey = `pdfdesk:masks:${reader.bookId}:${reader.code}:${reader.page}`
      useEffect(() => {
        const prefetched = annotPrefetch.current.get(reader.page)
        const list = prefetched === undefined ? inkStore.readList('masks', reader.page) : prefetched.masks
        masksRef.current = list
        setMasks(list)
      }, [inkStore, maskKey, remoteAnnotRev])
      useEffect(() => {
        if (!overlay || dualDoc === null) {
          setTranslatedImage('')
          setOverlayReflow(false)
          return undefined
        }
        let cancelled = false
        void (async () => {
          const pageNumber = Math.min(reader.page, dualDoc.numPages || 1)
          const rendered = await maskPageImage(dualDoc, pageNumber, 1400)
          if (cancelled) return
          // A page with no text means the overlay PDF has nothing to reveal
          // there. Say it out loud: a blank reveal would just look English.
          if (rendered.url === '') {
            setTranslatedImage('')
            setOverlayReflow(false)
            if (overlaySource.current === 'overlay') setOverlayNote(format('overlayEmpty'))
            return
          }
          setTranslatedImage(rendered.url)
          // A positioned overlay is one page per page. More (or fewer) pages
          // mean it was built by reflowing whole pages, so its type size and
          // line positions do not sit on the original's: say that instead of
          // letting the box reveal look broken. The note then offers a free
          // rebuild from the cached per-page text.
          if (overlaySource.current === 'overlay') {
            const reflow = dualDoc.numPages !== reader.count
            setOverlayReflow(reflow)
            if (!rendered.hasText) setOverlayNote(format('overlayEmpty'))
            else if (reflow) setOverlayNote(format('overlayReflow'))
            else setOverlayNote('')
          } else {
            setOverlayReflow(false)
          }
        })()
        return () => {
          cancelled = true
        }
      }, [overlay, dualDoc, reader.page])

      const pointOf = event => {
        const node = overlayLayer.current
        if (node === null) return null
        const rect = node.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return null
        return {
          x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
          y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
        }
      }
      const maskDown = event => {
        if (!overlay) return
        const point = pointOf(event)
        if (point === null) return
        overlayStart.current = point
        setMaskDraft({ x: point.x, y: point.y, w: 0, h: 0 })
      }
      const maskMove = event => {
        if (overlayStart.current === null) return
        const point = pointOf(event)
        if (point === null) return
        const start = overlayStart.current
        setMaskDraft({
          x: Math.min(start.x, point.x),
          y: Math.min(start.y, point.y),
          w: Math.abs(point.x - start.x),
          h: Math.abs(point.y - start.y),
        })
      }
      const maskUp = () => {
        if (overlayStart.current === null) return
        overlayStart.current = null
        setMaskDraft(draft => {
          if (draft !== null && draft.w > 0.02 && draft.h > 0.02) savePageMasks([...masksRef.current, draft])
          return null
        })
      }
      // Masks drawn by hand clip whatever sticks out of the box, which is how a
      // translated paragraph got cut in half. This builds the boxes from the
      // page's own text blocks instead, with a little padding for descenders.
      const maskAllBlocks = async () => {
        try {
          const payload = await request('GET',
            `blocks?book=${encodeURIComponent(reader.bookId)}&code=${encodeURIComponent(reader.code)}&page=${reader.page}`)
          const list = Array.isArray(payload.blocks) ? payload.blocks : []
          const next = []
          for (const block of list) {
            if (!Array.isArray(block.bbox) || block.bbox.length < 4) continue
            if (typeof block.md === 'string' && block.md.trim() === '') continue
            const x = Number(block.bbox[0])
            const y = Number(block.bbox[1])
            const w = Number(block.bbox[2])
            const h = Number(block.bbox[3])
            if (![x, y, w, h].every(Number.isFinite)) continue
            const left = Math.max(0, x - 0.004)
            const top = Math.max(0, y - 0.004)
            const right = Math.min(1, x + w + 0.004)
            // A paragraph may borrow the gap below its block, so the box reaches
            // a line further down; the text never leaves the block horizontally.
            const bottom = Math.min(1, y + h + 0.022)
            next.push({ x: left, y: top, w: right - left, h: bottom - top })
          }
          if (next.length === 0) {
            setOverlayNote(format('overlayBlocksEmpty'))
            return
          }
          // Pressing the button on its own boxes is the cancel gesture: no
          // duplicate set, no "nothing happened" click.
          if (autoBoxes !== null && sameMasks(masksRef.current, autoBoxes)) {
            setAutoBoxes(null)
            savePageMasks([])
            return
          }
          setAutoBoxes(next)
          savePageMasks(next)
        } catch (error) {
          const message = error !== null && error !== undefined && error.message ? error.message : String(error)
          setOverlayNote(`${format('overlayBlocksFailed')}：${message}`)
        }
      }
      // Rebuild the overlay from the cached page text, placed on the original's
      // paragraphs. Zero API calls; the Host keeps the replaced overlay as
      // `.bak`. It is an approximation (a merged paragraph may come out smaller),
      // but the boxes then reveal text where the original text sits.
      const realignOverlay = async () => {
        if (realigning) return
        setRealigning(true)
        setOverlayNote(format('overlayRealignWorking'))
        updateNote(format('overlayRealignWorking'))
        try {
          await request('POST', 'realign-overlay', { book: reader.bookId, code: reader.code }, 180000)
          updateNote(format('overlayRealignDone'))
          setDocRev(value => value + 1)
        } catch (error) {
          const message = error !== null && error !== undefined && error.message ? error.message : String(error)
          setOverlayNote(`${format('overlayRealignFailed')}：${message}`)
          updateNote(`${format('overlayRealignFailed')}：${message}`)
        } finally {
          setRealigning(false)
        }
      }

      const annotKey = `pdfdesk:annots:${reader.bookId}:${reader.code}:${reader.page}`
      useEffect(() => {
        const prefetched = annotPrefetch.current.get(reader.page)
        const list = prefetched === undefined ? inkStore.readList('annots', reader.page) : prefetched.annots
        strokesRef.current = list
        annotPage.current = reader.page
        setStrokes(list)
        setInkPage(reader.page)
      }, [inkStore, annotKey, remoteAnnotRev])
      // The viewer only ever shows `reader.page`; a stale editing page (an
      // adopted continuous page whose report was rejected, or the page before a
      // mode switch) must not survive a page move or leaving continuous.
      useEffect(() => {
        annotPage.current = reader.page
        setInkPage(reader.page)
      }, [reader.page, reader.mode])
      // Load one page's ink into the editor. Used when a pointer lands on a page
      // the reader has not reported yet: continuous scrolling is debounced, so
      // the paper under the pen can be a page ahead of `reader.page`.
      const loadPageAnnots = page => {
        const list = inkStore.readList('annots', page)
        strokesRef.current = list
        annotPage.current = page
        setStrokes(list)
        setInkPage(page)
        setSelection(null)
        setGroupSelection([])
        setMarquee(null)
        setGroupDrag(null)
        setDraftStroke(null)
        setTextDraft(null)
        setDrag(null)
        setResize(null)
        setResizeEntry(null)
      }
      // Warm the neighbouring pages' marks: the reader usually turns one page,
      // and a page must not appear bare while its ink is read.
      useEffect(() => {
        const total = Number(reader.count) || 0
        const targets = [reader.page - 1, reader.page + 1]
          .filter(page => page >= 1 && (total <= 0 || page <= total))
        const idle = typeof requestIdleCallback === 'function'
          ? callback => requestIdleCallback(callback, { timeout: 800 })
          : callback => setTimeout(callback, 150)
        const handles = targets.map(page => idle(() => {
          if (annotPrefetch.current.has(page)) return
          annotPrefetch.current.set(page, {
            annots: inkStore.readList('annots', page),
            masks: inkStore.readList('masks', page),
          })
        }))
        return () => {
          if (typeof cancelIdleCallback === 'function') handles.forEach(handle => cancelIdleCallback(handle))
          else handles.forEach(handle => clearTimeout(handle))
        }
      }, [inkStore, reader.page, reader.count])
      // Turning the page moves the ink under the editor: a draft left open would
      // save itself onto the wrong page. Unsaved edits are stashed for the page
      // they belong to and restored when the reader comes back; a remote edit
      // (the same page, a new revision) still cancels the open editor.
      const lastAnnotKey = useRef(annotKey)
      // True between a mark tool's press and its release. A page report that
      // lands in between (the reader reports continuous pages on a debounce) may
      // not wipe the stroke that is being drawn.
      const drawingRef = useRef(false)
      useEffect(() => {
        const pageChanged = lastAnnotKey.current !== annotKey
        lastAnnotKey.current = annotKey
        if (!drawingRef.current) {
          if (pageChanged) {
            const draft = noteEditRef.current
            if (draft !== null) {
              const page = draft.page ?? reader.page
              pageDrafts.stash(page, { noteEdit: { ...draft, text: noteText.current }, text: noteText.current })
            }
            setNoteEdit(null)
            const restored = pageDrafts.take(reader.page)
            if (restored !== undefined) {
              noteText.current = restored.text
              setNoteEdit({ ...restored.noteEdit, page: reader.page })
            }
          } else if (noteEditRef.current !== null) {
            setNoteEdit(null)
          }
          setDraftStroke(null)
          setTextDraft(null)
          setSelection(null)
          setDrag(null)
          setResize(null)
          setResizeEntry(null)
        }
        // The block pass belongs to one page: keep its signature only while the
        // boxes on screen are still that page's.
        setAutoBoxes(null)
      }, [annotKey, remoteAnnotRev, pageDrafts, reader.page])
      // Point in page coordinates (0..1). The ink layer is exactly the page box,
      // so the same numbers work at any zoom. A stage-sized capture layer (the
      // single page, where the shared plane can be drawn outside the page) is
      // measured against the page node and does not clamp.
      const annotBox = useRef({ width: 400, height: 600 })
      // The page boxes the pointer can be measured against, by page number: in
      // continuous mode the box of the page being read changes as the reader
      // scrolls, and a stale box would put a stroke a page height off.
      const pageNodes = useRef(new Map())
      const annotPoint = event => {
        // The page's own node is the ruler in both views (the capture layer is
        // stage-sized). If it is missing, the event's own layer is page-sized
        // and works the same way.
        const candidate = pageNodes.current.get(annotPage.current)
        const usable = candidate !== null && candidate !== undefined
          && typeof candidate.getBoundingClientRect === 'function'
          && candidate.isConnected !== false && candidate.getBoundingClientRect().width > 0
        const node = usable ? candidate : event.currentTarget
        const raw = inkPointOfFree(event, node)
        if (raw === null) return null
        // The shared plane is finite: a point is clamped to the plane's margins,
        // so a stray drag can never leave a mark so far away that the page is
        // lost.
        const point = plane.clampPoint(raw)
        const rect = node.getBoundingClientRect()
        annotBox.current = { width: rect.width, height: rect.height }
        return point
      }
      // Pen pressure is 0.5 for a mouse and 0..1 for a stylus. Keep it per sample
      // so the stroke can thin out at the ends of a fast pen stroke.
      const strokePressure = event => {
        const value = Number(event.pressure)
        return Number.isFinite(value) && value > 0 ? Math.min(1, Math.max(0.05, value)) : 0.5
      }
      // Tolerance in page units: ~8px of slack plus half the stroke's own width,
      // so a thick line is as easy to hit as it looks.
      const toleranceFor = widthPx => inkReach(widthPx, annotBox.current.width)
      // A text note is hit inside its rough box; a stroke inside its reach. The
      // shared hit test keeps the reader and the other columns on one rule.
      const annotHit = (entry, point) => inkHit(entry, point, toleranceFor)
      // Notes are edited where they sit. Text that already exists under the
      // pointer is opened for editing instead of stacking a second note on top.
      // `side` says which layer opened the draft, so the editor renders in that
      // column and never in the other one.
      const openNote = (point, side, box) => {
        const list = strokesRef.current
        const found = box === undefined
          ? list.findIndex(entry => entry.kind === 'text' && annotHit(entry, point))
          : -1
        noteSeq.current += 1
        if (found >= 0) {
          const entry = list[found]
          const bounds = noteBox(entry)
          noteText.current = String(entry.text ?? '')
          setNoteEdit({
            id: noteSeq.current,
            page: annotPage.current,
            side,
            index: found,
            x: bounds.x,
            y: bounds.y,
            w: bounds.w,
            h: bounds.h,
            text: noteText.current,
            color: entry.color ?? annotColor,
            fontSize: Number.isFinite(entry.fontSize) ? entry.fontSize : NOTE_SIZES[0],
            fontFamily: typeof entry.fontFamily === 'string' ? entry.fontFamily : 'normal',
            textAlign: typeof entry.textAlign === 'string' ? entry.textAlign : 'left',
            fontWeight: entry.fontWeight === 'bold' ? 'bold' : 'normal',
            fontStyle: entry.fontStyle === 'italic' ? 'italic' : 'normal',
          })
          return
        }
        const fallbackWidth = Math.min(0.38, Math.max(0.18, 1 - point[0] - 0.02))
        // The shared plane lets a note live outside the page; continuous keeps
        // the box on the page, as page views always have.
        // A note may sit where the plane allows, in either view.
        const free = true
        const x = free
          ? (box === undefined ? point[0] : box.x)
          : (box === undefined
            ? Math.min(point[0], Math.max(0, 1 - fallbackWidth - 0.02))
            : Math.max(0, Math.min(1 - 0.02, box.x)))
        const y = free
          ? (box === undefined ? point[1] : box.y)
          : (box === undefined ? Math.min(point[1], 1 - 0.04) : Math.max(0, Math.min(1 - 0.02, box.y)))
        const w = box === undefined ? fallbackWidth : Math.max(0.04, free ? box.w : Math.min(1 - x, box.w))
        const h = box === undefined ? 0.09 : Math.max(0.035, free ? box.h : Math.min(1 - y, box.h))
        noteText.current = ''
        setNoteEdit({
          id: noteSeq.current,
          page: annotPage.current,
          side,
          index: -1,
          x,
          y,
          w,
          h,
          text: '',
          color: noteStyle.color,
          fontSize: noteStyle.fontSize,
          fontFamily: noteStyle.fontFamily,
          textAlign: noteStyle.textAlign ?? 'left',
          fontWeight: noteStyle.fontWeight === 'bold' ? 'bold' : 'normal',
          fontStyle: noteStyle.fontStyle === 'italic' ? 'italic' : 'normal',
        })
      }
      const changeNote = text => {
        noteText.current = text
      }
      const changeNoteStyle = patch => {
        // The font is a global preference: the next note of any book starts with it.
        if (typeof patch.fontFamily === 'string') writeNoteFont(patch.fontFamily)
        setNoteStyle(current => ({ ...current, ...patch }))
        setNoteEdit(current => (current === null ? current : { ...current, ...patch }))
      }
      const cancelNote = () => setNoteEdit(null)
      const saveNote = id => {
        const draft = noteEditRef.current
        if (draft === null || draft.id !== id) return
        setNoteEdit(null)
        // A blur that lands after the page moved must not write onto the new
        // page: keep the words as a draft of the page they belong to.
        const page = draft.page ?? reader.page
        if (page !== annotPage.current) {
          pageDrafts.stash(page, { noteEdit: { ...draft, text: noteText.current }, text: noteText.current })
          return
        }
        // Nothing typed into a brand-new note: nothing to store.
        if (draft.index < 0 && noteText.current.trim() === '') return
        savePageAnnots(applyNote(strokesRef.current, draft, noteText.current))
      }
      const selectedEntry = selection === null ? undefined : strokes[selection.index]
      const patchSelection = patch => {
        if (selection === null) return
        savePageAnnots(strokesRef.current.map((entry, index) => (index === selection.index ? { ...entry, ...patch } : entry)))
      }
      const deleteSelection = () => {
        if (selection === null) return
        savePageAnnots(strokesRef.current.filter((entry, index) => index !== selection.index))
        setSelection(null)
      }
      // Right-click deletes a text box (the gesture the note UI promises); the
      // page-annotation store records it, so Cmd/Ctrl+Z brings it back.
      const deleteNoteAt = (index, event) => {
        event.preventDefault()
        event.stopPropagation()
        savePageAnnots(strokesRef.current.filter((entry, item) => item !== index))
        setSelection(null)
        setGroupSelection([])
      }
      // Backspace/Delete removes the picked marks (single or marquee group) so
      // selections can be cleared without reaching for the toolbar.
      useEffect(() => {
        const onKeyDown = event => {
          if (event.key !== 'Backspace' && event.key !== 'Delete') return
          if (noteEditRef.current !== null) return
          const target = event.target
          if (target !== null && target !== undefined && typeof target.tagName === 'string'
            && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable === true)) return
          if (groupSelection.length > 0) {
            const doomed = new Set(groupSelection)
            savePageAnnots(strokesRef.current.filter((entry, index) => !doomed.has(index)))
            setGroupSelection([])
            setSelection(null)
          } else if (selection !== null) {
            deleteSelection()
          } else {
            return
          }
          event.preventDefault()
          event.stopPropagation()
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [selection, groupSelection, deleteSelection])
      const duplicateSelection = () => {
        if (selection === null) return
        const source = strokesRef.current[selection.index]
        if (source === undefined) return
        const copy = translateEntry(source, 0.02, 0.02)
        if (copy.kind === 'shape') copy.seed = Math.floor(Math.random() * 2147483647)
        const next = [...strokesRef.current, copy]
        savePageAnnots(next)
        setSelection({ index: next.length - 1, kind: copy.kind === 'text' ? 'text' : copy.kind === 'shape' ? 'shape' : 'stroke' })
      }
      const reorderSelection = toFront => {
        if (selection === null) return
        const list = [...strokesRef.current]
        const [entry] = list.splice(selection.index, 1)
        if (entry === undefined) return
        if (toFront) list.push(entry)
        else list.unshift(entry)
        savePageAnnots(list)
        setSelection({ index: toFront ? list.length - 1 : 0, kind: entry.kind === 'text' ? 'text' : entry.kind === 'shape' ? 'shape' : 'stroke' })
      }
      const clearAnnots = () => {
        if (dual && activeSide === 'right' && rightInk.current !== null) rightInk.current.clear()
        else savePageAnnots([])
        setSelection(null)
      }
      /**
       * One rail button: picking a tool toggles it, like the horizontal row did.
       * @param {string} id - tool id.
       * @param {string} labelKey - locale key for the label and tooltip.
       * @param {string} path - SVG path for `annotIcon`.
       * @param {boolean} [disabled] - whether the tool is unavailable right now.
       * @returns {import('react').ReactElement} the button.
       */
      const railTool = (id, labelKey, path, disabled) => h(KitButton, {
        type: 'button',
        className: 'md-rail-btn',
        disabled: disabled === true,
        'aria-pressed': annotTool === id ? 'true' : 'false',
        title: format(labelKey),
        'aria-label': format(labelKey),
        onPointerEnter: event => beginRailPanel(event.currentTarget, id),
        onClick: () => setAnnotTool(value => (value === id ? '' : id)),
      }, annotIcon(path))
      const strokeDraft = useRef(null)
      const shapeDraftRef = useRef(null)
      const inkGestures = createInkGestures({
        tool: annotTool,
        strokesRef,
        draftRef: strokeDraft,
        erasing,
        saveAnnots: savePageAnnots,
        setDraftStroke,
        hitTest: annotHit,
        color: annotColor,
        width: annotWidth,
        smooth: true,
        sample: (event, point) => [point[0], point[1], strokePressure(event)],
        shapeTools: SHAPE_TOOLS,
        shapeDraftRef,
        setShapeDraft,
      })
      const annotDown = (event, side) => {
        if (event.button !== 0) return
        if (annotTool === '') return
        // Continuous mode: the paper under the pen is the page being written on,
        // even when the reader's page report has not caught up yet (it is
        // debounced while scrolling). Adopt that page before the stroke starts,
        // and report it without a jump so the shared page, the preview and the
        // export all point at the page that now carries the ink.
        if (!extended) {
          const target = plane.pageAtPointer(event, pageNodes.current)
          if (target === null) return
          if (target !== annotPage.current) {
            loadPageAnnots(target)
            if (typeof props.onVisible === 'function') props.onVisible(target)
          }
        } else if (annotPage.current !== reader.page) {
          // The single page always writes on the page it shows.
          loadPageAnnots(reader.page)
        }
        // The main layer is the original page (single view or the left column).
        setActiveSide('main')
        const point = annotPoint(event)
        if (point === null) return
        drawingRef.current = true
        event.preventDefault()
        if (annotTool === 'select') {
          const list = strokesRef.current
          // A drag that starts on a selected mark moves the whole group.
          if (groupSelection.length > 0 && groupSelection.some(index => annotHit(list[index], point))) {
            setGroupDrag({ indices: [...groupSelection], start: point, dx: 0, dy: 0 })
            return
          }
          const found = list.findIndex(entry => annotHit(entry, point))
          if (found >= 0) {
            setGroupSelection([])
            setSelection({ index: found, kind: list[found].kind === 'text' ? 'text' : list[found].kind === 'shape' ? 'shape' : 'stroke' })
            setDrag({ index: found, start: point, dx: 0, dy: 0 })
            return
          }
          // Empty paper: start a marquee instead of clearing the selection.
          setSelection(null)
          setGroupSelection([])
          setMarquee({ x0: point[0], y0: point[1], x1: point[0], y1: point[1] })
          return
        }
        if (SHAPE_TOOLS.includes(annotTool)) {
          inkGestures.down(event, point)
          return
        }
        if (annotTool === 'erase') {
          inkGestures.down(event, point)
          return
        }
        if (annotTool === 'text') {
          // Only a drag creates a new text box. Starting on an existing box
          // selects and moves it instead of stacking another box on top.
          if (noteEditRef.current !== null) saveNote(noteEditRef.current.id)
          const found = strokesRef.current.findIndex(entry => entry.kind === 'text' && annotHit(entry, point))
          if (found >= 0) {
            setSelection({ index: found, kind: 'text' })
            setDrag({ index: found, start: point, dx: 0, dy: 0 })
            return
          }
          setTextDraft({ x0: point[0], y0: point[1], x1: point[0], y1: point[1], side })
          return
        }
        if (annotTool === 'pen') inkGestures.down(event, point)
      }
      const annotMove = event => {
        if (annotTool === 'erase' && erasing.current) {
          // Dragging the eraser sweeps several strokes away, not just the one
          // under the first press.
          const point = annotPoint(event)
          if (point === null) return
          event.preventDefault()
          inkGestures.move(event, point)
          return
        }
        if (textDraft !== null) {
          const point = annotPoint(event)
          if (point === null) return
          event.preventDefault()
          setTextDraft(current => (current === null ? null : { ...current, x1: point[0], y1: point[1] }))
          return
        }
        if (resize !== null) {
          const point = annotPoint(event)
          if (point === null) return
          event.preventDefault()
          const dx = point[0] - resize.start[0]
          const dy = point[1] - resize.start[1]
          const original = resize.original
          if (original.shape === 'line' || original.shape === 'arrow') {
            setResizeEntry(resize.corner === 'start'
              ? { ...original, x0: original.x0 + dx, y0: original.y0 + dy }
              : { ...original, x1: original.x1 + dx, y1: original.y1 + dy })
          } else {
            let left = original.x
            let top = original.y
            let right = original.x + original.w
            let bottom = original.y + original.h
            if (resize.corner.includes('w')) left += dx
            else right += dx
            if (resize.corner.includes('n')) top += dy
            else bottom += dy
            const width = Math.max(0.01, Math.abs(right - left))
            const height = Math.max(0.01, Math.abs(bottom - top))
            setResizeEntry({ ...original, x: Math.min(left, right), y: Math.min(top, bottom), w: width, h: height })
          }
          return
        }
        if (shapeDraftRef.current !== null) {
          const point = annotPoint(event)
          if (point === null) return
          event.preventDefault()
          inkGestures.move(event, point)
          return
        }
        if (groupDrag !== null) {
          const point = annotPoint(event)
          if (point === null) return
          event.preventDefault()
          setGroupDrag(current => (current === null ? null : { ...current, dx: point[0] - current.start[0], dy: point[1] - current.start[1] }))
          return
        }
        if (marquee !== null) {
          const point = annotPoint(event)
          if (point === null) return
          event.preventDefault()
          setMarquee(current => (current === null ? null : { ...current, x1: point[0], y1: point[1] }))
          return
        }
        if (drag !== null) {
          const point = annotPoint(event)
          if (point === null) return
          event.preventDefault()
          setDrag(current => (current === null ? null : { ...current, dx: point[0] - current.start[0], dy: point[1] - current.start[1] }))
          return
        }
        if (strokeDraft.current === null) return
        const point = annotPoint(event)
        if (point === null) return
        inkGestures.move(event, point)
      }
      const annotUp = () => {
        drawingRef.current = false
        inkGestures.up()
        if (textDraft !== null) {
          const draft = textDraft
          setTextDraft(null)
          const x = Math.min(draft.x0, draft.x1)
          const y = Math.min(draft.y0, draft.y1)
          const w = Math.abs(draft.x1 - draft.x0)
          const h = Math.abs(draft.y1 - draft.y0)
          if (w > 0.012 && h > 0.012) openNote([x, y], draft.side, { x, y, w, h })
          return
        }
        if (resizeEntry !== null && resize !== null) {
          savePageAnnots(strokesRef.current.map((entry, index) => (index === resize.index ? resizeEntry : entry)))
          setResize(null)
          setResizeEntry(null)
          return
        }
        if (groupDrag !== null) {
          const moved = groupDrag
          setGroupDrag(null)
          if (Math.hypot(moved.dx, moved.dy) > 0.003) {
            const set = new Set(moved.indices)
            savePageAnnots(strokesRef.current.map((entry, index) => (
              set.has(index) ? translateEntry(entry, moved.dx, moved.dy) : entry
            )))
          }
          return
        }
        if (marquee !== null) {
          const box = {
            x: Math.min(marquee.x0, marquee.x1),
            y: Math.min(marquee.y0, marquee.y1),
            w: Math.abs(marquee.x1 - marquee.x0),
            h: Math.abs(marquee.y1 - marquee.y0),
          }
          setMarquee(null)
          if (box.w > 0.005 || box.h > 0.005) {
            const hits = []
            strokesRef.current.forEach((entry, index) => {
              if (boxesIntersect(box, entryBounds(entry))) hits.push(index)
            })
            if (hits.length === 1) {
              const entry = strokesRef.current[hits[0]]
              setGroupSelection([])
              setSelection({ index: hits[0], kind: entry.kind === 'text' ? 'text' : entry.kind === 'shape' ? 'shape' : 'stroke' })
            } else if (hits.length > 1) {
              setSelection(null)
              setGroupSelection(hits)
            } else {
              setGroupSelection([])
            }
          }
          return
        }
        if (drag !== null) {
          const moved = drag
          setDrag(null)
          if (Math.hypot(moved.dx, moved.dy) > 0.003) {
            savePageAnnots(strokesRef.current.map((entry, index) => (
              index === moved.index ? translateEntry(entry, moved.dx, moved.dy) : entry
            )))
          }
          return
        }
      }

      // Restore masks/notes from the sidecar written by "export chapter": the
      // file lives in the chapter artifacts, so another machine (or a fresh
      // browser profile) can pick the annotations back up.
      const importAnnots = async () => {
        updateNote(format('importingAnnots'))
        try {
          const payload = await request('POST', 'import-annots', {
            book: reader.bookId,
            code: reader.code,
          })
          const list = Array.isArray(payload.pages) ? payload.pages : []
          let count = 0
          for (const item of list) {
            const page = Number(item.page)
            if (!Number.isFinite(page)) continue
            const pageMasks = Array.isArray(item.masks) ? item.masks : []
            const pageAnnots = Array.isArray(item.annots) ? item.annots : []
            try {
              window.localStorage.setItem(inkStore.storageKey('masks', page), JSON.stringify(pageMasks))
              window.localStorage.setItem(inkStore.storageKey('annots', page), JSON.stringify(pageAnnots))
            } catch {
              continue
            }
            if (page === reader.page) {
              masksRef.current = pageMasks
              strokesRef.current = pageAnnots
              setMasks(pageMasks)
              setStrokes(pageAnnots)
            }
            count += 1
          }
          updateNote(format('importAnnotsDone', { n: count }))
          setRetryAction(null)
          setDocRev(value => value + 1)
          // Every page was written straight to storage, so the editor's own save
          // helpers never ran: announce once for the whole import.
          seenAnnotRev.current = bumpAnnotRev(reader.bookId, reader.code, 'reader')
        } catch (error) {
          const message = error !== null && error !== undefined && error.message ? String(error.message) : String(error)
          updateNote(`${format('importAnnotsFailed')}：${message}`)
          setRetryAction(() => importAnnots)
        }
      }

      // Whole chapter: pages without masks or notes stay the plain original; the
      // sidecar JSON keeps the normalized data next to the PDF.
      const exportChapter = async () => {
        if (props.canExport !== true) {
          if (typeof props.onEnvRequired === 'function') props.onEnvRequired('export')
          return
        }
        updateNote(format('exportingChapter'))
        try {
          const total = reader.count > 0 ? reader.count : 1
          const pages = []
          for (let page = 1; page <= total; page += 1) {
            const pageMasks = inkStore.readList('masks', page)
            const pageAnnots = inkStore.readList('annots', page)
            const hasMasks = pageMasks.length > 0
            const hasAnnots = pageAnnots.length > 0
            if (hasMasks || hasAnnots) pages.push({ page, masks: pageMasks, annots: pageAnnots })
          }
          const started = await request('POST', 'export-chapter', {
            book: reader.bookId,
            code: reader.code,
            pages,
          })
          setExportJob(started.jobId)
          let finished = false
          for (;;) {
            await new Promise(resolve => setTimeout(resolve, 700))
            const state = await request('GET', `export-status?job=${encodeURIComponent(started.jobId)}`)
            if (state.status === 'done') {
              updateNote(`${format('exportDone')}：${started.pdf}（${format('exportAnnotatedPages', { n: started.pages })}，附 ${started.json}）`)
              setRetryAction(null)
              if (typeof props.onExported === 'function') props.onExported()
              finished = true
              break
            }
            if (state.status === 'cancelled') {
              updateNote(format('exportCancelled'))
              finished = true
              break
            }
            if (state.status === 'error') throw new Error(state.error === '' || state.error === undefined ? '导出失败' : state.error)
            const percent = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0
            updateNote(`${format('exportingChapter')} ${percent}%`)
          }
          setExportJob('')
        } catch (error) {
          const message = error !== null && error !== undefined && error.message ? String(error.message) : String(error)
          setExportJob('')
          updateNote(`${format('exportFailed')}：${message}`)
          setRetryAction(() => exportChapter)
        }
      }

      // Compose the current page on the Host: original page, the revealed parts
      // of the overlay PDF, and the annotations. Saved into the chapter's
      // produced files so it can be opened from the shelf like any artifact.
      const exportPage = async () => {
        if (props.canExport !== true) {
          if (typeof props.onEnvRequired === 'function') props.onEnvRequired('export')
          return
        }
        updateNote(format('exporting'))
        try {
          const payload = await request('POST', 'export-page', {
            book: reader.bookId,
            code: reader.code,
            page: reader.page,
            masks,
            annots: strokes,
          })
          updateNote(`${format('exportDone')}：${payload.pdf}`)
          setRetryAction(null)
          // The new PDF lands in the chapter's artifact list; refresh it so the
          // file shows up as soon as the reader closes instead of on reopen.
          if (typeof props.onExported === 'function') props.onExported()
        } catch (error) {
          const message = error !== null && error !== undefined && error.message ? String(error.message) : String(error)
          updateNote(`${format('exportFailed')}：${message}`)
          setRetryAction(() => exportPage)
        }
      }

      // A chapter translation runs on the Host; reopening the reader resumes
      // watching it instead of losing the progress. The facts it learns belong to
      // the chapter that started the job, even if the reader has moved on or is
      // gone: only this chapter's UI reacts to them.
      useEffect(() => {
        let cancelled = false
        const bookId = reader.bookId
        const code = reader.code
        const key = chapterKey(bookId, code)
        const jobId = readStoredJob(bookId, code)
        if (jobId === '') return undefined
        const mine = () => chapterRef.current === key
        const owns = () => ownsStoredJob(bookId, code, jobId)
        if (deskStatus.job === '') deskStatus.job = jobId
        writeTranslationFacts(bookId, code, { translating: true })
        const tick = async () => {
          try {
            const state = await request('GET', `translate-status?job=${encodeURIComponent(jobId)}`)
            const owned = owns()
            if (state.status === 'done') {
              if (owned) forgetStoredJob(bookId, code, jobId)
              writeTranslationFacts(bookId, code, owned
                ? { translating: false, exists: true }
                : { exists: true })
              if (deskStatus.job === jobId) deskStatus.job = ''
              if (cancelled || !mine()) return
              setDeskStatus('done')
              setTimeout(() => setDeskStatus('idle'), 8000)
              rememberPartial(state)
              setDocRev(value => value + 1)
              updateNote(doneNote(state))
              return
            }
            if (state.status === 'error') {
              if (!owned) return
              forgetStoredJob(bookId, code, jobId)
              writeTranslationFacts(bookId, code, { translating: false })
              // A finished job may still have left an older usable artifact:
              // ask the file once so the entries can recover.
              void refreshTranslationFacts(bookId, code)
              if (deskStatus.job === jobId) deskStatus.job = ''
              if (cancelled || !mine()) return
              setDeskStatus('error')
              setTimeout(() => setDeskStatus('idle'), 8000)
              updateNote(`${format('translateFailed')}：${state.error}`)
              return
            }
            if (state.status !== 'running') throw new Error('翻译状态不可用')
            if (!owned) return
            if (cancelled || !mine()) return
            updateNote(`${format('translating')} ${state.done}/${state.total}`)
            setTimeout(() => { void tick() }, 2000)
          } catch {
            // The job file may be gone or the route failed. It cannot be verified,
            // so stop claiming it is running and stop resuming it (review W2).
            if (!owns()) return
            forgetStoredJob(bookId, code, jobId)
            writeTranslationFacts(bookId, code, { translating: false })
            // Recover the availability from the file itself (an older artifact
            // may still be usable) instead of leaving the entries locked.
            void refreshTranslationFacts(bookId, code)
            if (deskStatus.job === jobId) deskStatus.job = ''
            if (cancelled || !mine()) return
            setDeskStatus('error')
            setTimeout(() => setDeskStatus('idle'), 8000)
            updateNote(format('translateFailed'))
          }
        }
        void tick()
        return () => {
          cancelled = true
        }
      }, [reader.bookId, reader.code])

      const registerSlot = useCallback((page, node) => {
        if (node === null) slotRefs.current.delete(page)
        else slotRefs.current.set(page, node)
      }, [])

      // Scrolling to a page before the column knows every page height lands on
      // the wrong offset, so repeat once after the placeholders settle.
      const scrollToPage = useCallback(page => {
        const jump = () => {
          const stage = props.stageRef === null || props.stageRef === undefined ? null : props.stageRef.current
          const node = slotRefs.current.get(page)
          if (stage === null || stage === undefined || node === null || node === undefined) return
          // A delayed retry from the view we already left must not scroll the
          // single page back out of view.
          if (stage.getAttribute('data-mode') !== 'continuous') return
          // Scroll the stage itself. `scrollIntoView` also scrolls an outer
          // ancestor while the stage is still measuring, which left the reader
          // on a blank area after a mode switch.
          const top = node.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop
          stage.scrollTop = Math.max(0, top)
        }
        jump()
        for (const delay of [80, 240, 600, 1000]) window.setTimeout(jump, delay)
      }, [props.stageRef])

      // The same callback instance for every page: a new one on each render
      // recreated every IntersectionObserver and made scrolling jittery.
      const notifyVisible = useCallback(page => {
        if (switchingMode.current) return
        if (Date.now() < jumpingUntil.current) return
        if (visibleTimer.current !== null) clearTimeout(visibleTimer.current)
        visibleTimer.current = setTimeout(() => { props.onVisible(page) }, 350)
      }, [props.onVisible])
      // The translated column is independent: it keeps its own page (so the two
      // columns may sit on different pages) and its own ink, and never drives
      // the reader's page. Page numbers are not synchronised.
      const rightSlots = useRef(new Map())
      const registerRightSlot = useCallback((page, node) => { rightSlots.current.set(page, node) }, [])
      const [dualRightPage, setDualRightPage] = useState(reader.page)
      // Per-column fit: in the bilingual view each column is its own viewport, so
      // "auto" must fit both the width and the height of that column, not the
      // whole stage (which made 100% pages overflow sideways).
      const [dualFit, setDualFit] = useState({ left: null, right: null })
      // Auto fit is **width only**: the page fills the column's width and the rest
      // scrolls vertically. Each column keeps its own zoom (null = automatic), so
      // the two columns never share a scale and the button is just "back to auto".
      const [dualLeftScale, setDualLeftScale] = useState(null)
      useEffect(() => {
        if (!dual || dualDoc === null) return undefined
        const leftDoc = reader.variant === 'translated' ? dualDoc : props.doc
        const rightDoc = reader.variant === 'translated' ? props.doc : dualDoc
        if (leftDoc === null || leftDoc === undefined || rightDoc === null || rightDoc === undefined) return undefined
        let cancelled = false
        let observer = null
        let leftBase = null
        let rightBase = null
        const fitOf = (column, base) => {
          if (column === null || base === null || base.width === 0) return null
          return Math.max(0.15, Math.min(3, (column.clientWidth - 24) / base.width))
        }
        const measure = () => {
          if (cancelled) return
          setDualFit(current => {
            const next = {
              left: fitOf(dualLeft.current, leftBase),
              right: fitOf(dualRight.current, rightBase),
            }
            return current.left === next.left && current.right === next.right ? current : next
          })
        }
        void (async () => {
          try {
            const [leftPage, rightPage] = await Promise.all([leftDoc.getPage(1), rightDoc.getPage(1)])
            if (cancelled) return
            leftBase = leftPage.getViewport({ scale: 1 })
            rightBase = rightPage.getViewport({ scale: 1 })
            measure()
            if (typeof ResizeObserver === 'function') {
              observer = new ResizeObserver(measure)
              if (dualLeft.current !== null) observer.observe(dualLeft.current)
              if (dualRight.current !== null) observer.observe(dualRight.current)
            }
          } catch {
            // keep 1:1 when the page cannot be measured
          }
        })()
        return () => {
          cancelled = true
          if (observer !== null) observer.disconnect()
        }
      }, [dual, dualDoc, reader.variant, props.doc])
      // The columns always start automatic; toggling the bilingual view resets any
      // manual zoom so a fresh open fits the width again.
      useEffect(() => {
        setDualLeftScale(null)
        setRightScale(null)
      }, [dual])
      useEffect(() => {
        setDualRightPage(reader.page)
        // The right column starts on the reader's page but then keeps its own; it
        // deliberately does not watch reader.page, or scrolling the left column
        // would drag it along.
      }, [reader.bookId, reader.code, dual])
      const onVisibleRight = useCallback(page => {
        setDualRightPage(current => (current === page ? current : page))
      }, [])
      // Undo/redo for the translated column is local to that column; the toolbar
      // targets whichever column was used last.
      const rightInk = useRef(null)
      const [rightHistory, setRightHistory] = useState({ undo: 0, redo: 0, count: 0 })
      const onRightReady = useCallback(api => { rightInk.current = api }, [])
      const onRightHistory = useCallback(counts => {
        setRightHistory(current => (
          current.undo === counts.undo && current.redo === counts.redo && current.count === counts.count
            ? current
            : counts
        ))
      }, [])
      const onRightActivate = useCallback(() => { setActiveSide('right') }, [])
      // Entering the bilingual view lands both columns on the page being read
      // (a one-time jump, not synchronised scrolling): the page's ink layer only
      // exists on that page, and the columns start at the top otherwise.
      useEffect(() => {
        if (!dual || dualDoc === null) return undefined
        const jump = () => {
          const pairs = [[dualLeft.current, slotRefs.current], [dualRight.current, rightSlots.current]]
          for (const [column, slots] of pairs) {
            if (column === null) continue
            const node = slots.get(reader.page)
            if (node === null || node === undefined) continue
            const top = node.getBoundingClientRect().top - column.getBoundingClientRect().top + column.scrollTop
            if (Math.abs(column.scrollTop - top) > 4) column.scrollTop = Math.max(0, top)
          }
        }
        jump()
        const timers = [120, 420, 900].map(ms => setTimeout(jump, ms))
        return () => timers.forEach(timer => clearTimeout(timer))
        // reader.page is read at entry; later scrolling stays independent.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [dual, dualDoc])
      // The pager and the page box still move the original column; the translated
      // column keeps its own position, so the two stay independent after entry.
      useEffect(() => {
        if (!dual || dualDoc === null) return
        const column = dualLeft.current
        const node = slotRefs.current.get(reader.page)
        if (column === null || node === null || node === undefined) return
        const top = node.getBoundingClientRect().top - column.getBoundingClientRect().top + column.scrollTop
        if (Math.abs(column.scrollTop - top) > 4) column.scrollTop = Math.max(0, top)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [reader.jump])

      // A jump scrolls the column programmatically. The pages it crosses in
      // between must not report themselves as "where the reader is", or the
      // preview would drag the reader back to the page it just left.
      useEffect(() => {
        jumpingUntil.current = Date.now() + 700
      }, [reader.jump])

      // Explicit page changes (buttons, the page box, restore) scroll the
      // continuous column; pages reported by scrolling itself do not, so this
      // deliberately ignores `reader.page` unless a jump asked for it.
      useEffect(() => {
        if (reader.mode !== 'continuous' || reader.phase !== 'ready') return
        scrollToPage(reader.page)
        // `reader.page` is intentionally read but not watched: pages reported by
        // scrolling itself must not scroll the column again.
      }, [reader.jump, reader.mode, reader.phase, scrollToPage])

      // Switching back to a single page starts that page at the top of the stage.
      useEffect(() => {
        if (reader.mode !== 'single') return undefined
        const reset = () => {
          const stage = props.stageRef.current
          if (stage !== null) {
            stage.scrollTop = 0
            stage.scrollLeft = 0
          }
        }
        reset()
        const timer = window.setTimeout(reset, 80)
        return () => window.clearTimeout(timer)
      }, [reader.mode, props.stageRef])
      // Entering continuous mode keeps the page you were reading instead of
      // starting at the top of the chapter. Only a real single->continuous
      // switch scrolls: a remount while already in continuous mode must not
      // yank the reader back to the page start.
      const previousMode = useRef(reader.mode)
      useEffect(() => {
        switchingMode.current = true
        // A report queued by the view we are leaving must not rename the page
        // after the switch.
        if (visibleTimer.current !== null) {
          clearTimeout(visibleTimer.current)
          visibleTimer.current = null
        }
        const timer = setTimeout(() => { switchingMode.current = false }, 600)
        const from = previousMode.current
        previousMode.current = reader.mode
        if (reader.mode === 'continuous' && from !== 'continuous') {
          scrollToPage(reader.page)
        }
        return () => {
          switchingMode.current = false
          clearTimeout(timer)
        }
      }, [reader.mode])
      // Zooming changes every page's pixel height, so keep the page being read
      // at the top of the column instead of whatever scrollTop lands on after
      // the heights change.
      const lastScale = useRef(reader.scale)
      useEffect(() => {
        const changed = lastScale.current !== reader.scale
        lastScale.current = reader.scale
        if (!changed || reader.mode !== 'continuous' || reader.phase !== 'ready') return
        scrollToPage(reader.page)
      }, [reader.mode, reader.scale, reader.phase, scrollToPage])
      // Scroll mode: derive the page from the slot nearest the stage top, so
      // the page indicator matches what the reader actually sees.
      useEffect(() => {
        if (reader.mode !== 'continuous') return undefined
        const stage = props.stageRef.current
        if (stage === null || stage === undefined) return undefined
        let timer = null
        const onScroll = () => {
          if (timer !== null) clearTimeout(timer)
          timer = setTimeout(() => {
            const stageTop = stage.getBoundingClientRect().top
            let best = null
            let bestDistance = Number.POSITIVE_INFINITY
            slotRefs.current.forEach((node, page) => {
              if (node === null || node === undefined) return
              const distance = Math.abs(node.getBoundingClientRect().top - stageTop - 24)
              if (distance < bestDistance) {
                bestDistance = distance
                best = page
              }
            })
            if (best !== null && best !== reader.page) props.onVisible(best)
          }, 180)
        }
        stage.addEventListener('scroll', onScroll, { passive: true })
        return () => {
          stage.removeEventListener('scroll', onScroll)
          if (timer !== null) clearTimeout(timer)
        }
      }, [reader.mode, reader.page, props.stageRef])

      const commitPage = () => {
        const value = Number.parseInt(pageText, 10)
        if (!Number.isFinite(value)) {
          setPageText(String(reader.page))
          return
        }
        props.onPage(value)
      }
      const runTranslate = async (resume = false) => {
        if (props.canTranslate !== true) {
          if (typeof props.onEnvRequired === 'function') props.onEnvRequired('translate')
          return
        }
        if (translating || reader.phase !== 'ready') return
        const bookId = reader.bookId
        const code = reader.code
        const key = chapterKey(bookId, code)
        const mine = () => chapterRef.current === key
        let jobId = ''
        const owns = () => (jobId === '' ? true : ownsStoredJob(bookId, code, jobId))
        writeTranslationFacts(bookId, code, { translating: true })
        setDeskStatus('busy')
        updateNote(format(resume ? 'translatingResume' : 'translating'))
        try {
          const started = await request('POST', 'translate-chapter', {
            book: bookId,
            code,
            target: translateTarget,
            resume,
          })
          if (started === null || typeof started.jobId !== 'string') throw new Error('翻译任务没有启动')
          jobId = started.jobId
          jobRef.current = jobId
          deskStatus.job = jobId
          try {
            window.localStorage.setItem(translationJobKey(bookId, code), jobId)
          } catch {
            // storage unavailable
          }
          for (;;) {
            await new Promise(resolve => setTimeout(resolve, 2000))
            const state = await request('GET', `translate-status?job=${encodeURIComponent(jobId)}`)
            const owned = owns()
            if (state.status === 'done') {
              if (owned) forgetStoredJob(bookId, code, jobId)
              // The artifact now exists for the chapter that started the job.
              writeTranslationFacts(bookId, code, owned
                ? { translating: false, exists: true }
                : { exists: true })
              if (!owned || !mine()) break
              rememberPartial(state)
              setDocRev(value => value + 1)
              updateNote(doneNote(state))
              break
            }
            if (state.status === 'error') throw new Error(state.error === '' ? '翻译失败' : state.error)
            if (state.status !== 'running') throw new Error('翻译状态不可用')
            // Still watch the job after the reader moved to another chapter, but
            // never write its progress onto that chapter's note.
            if (!owned || !mine()) continue
            updateNote(`${format('translating')} ${state.done}/${state.total}`)
          }
        } catch (error) {
          const message = error !== null && error !== undefined && error.message ? String(error.message) : String(error)
          // A status this build cannot read is not a running job: clear the key
          // that would resume it, and let the entries recover (review W2). A
          // newer job for the same chapter keeps its own key and state.
          if (owns()) {
            forgetStoredJob(bookId, code, jobId)
            writeTranslationFacts(bookId, code, { translating: false })
            // An older artifact may still be usable; ask the file once.
            void refreshTranslationFacts(bookId, code)
            if (mine()) {
              setDeskStatus('error')
              setTimeout(() => setDeskStatus('idle'), 8000)
              updateNote(`${format('translateFailed')}：${message}`)
            }
          }
        } finally {
          if (jobId !== '' && jobRef.current === jobId) jobRef.current = ''
          if (jobId !== '' && deskStatus.job === jobId) deskStatus.job = ''
          if (owns()) writeTranslationFacts(bookId, code, { translating: false })
        }
      }
      const label = reader.name === '' ? `${reader.fileName}.pdf` : reader.name
      const ready = reader.phase === 'ready'
      // The page this document can paint. The chapter's page stays the source of
      // truth; a translated file with a different page count only clamps here.
      const visiblePage = reader.count > 0 ? Math.min(reader.page, reader.count) : reader.page
      // The bilingual left column paints the original, or the translated file
      // when that variant is open; its own count clamps the page it draws.
      const leftCount = reader.variant === 'translated' ? (dualDoc === null ? 0 : dualDoc.numPages || 0) : reader.count
      const leftPage = leftCount > 0 ? Math.min(reader.page, leftCount) : reader.page
      const sub = [reader.bookTitle, `${reader.code} ${reader.title}`].filter(item => typeof item === 'string' && item !== '').join(' · ')
      const modeOf = mode => reader.mode === mode
      // The block button is a toggle: pressed while the page still holds exactly
      // the boxes it made, plain when the user has moved or added their own.
      const autoBoxed = autoBoxes !== null && sameMasks(masks, autoBoxes)
      // "叠加" frames reveal the translated page, so it needs this chapter's
      // translation artifact. The preview computes the very same condition from
      // the same per-chapter facts, so the two buttons cannot disagree.
      const overlayUnavailable = !hasTranslation || translating
      // In the bilingual view the translated column keeps its own undo stack;
      // the toolbar acts on the column that was used last. Question marks share
      // one chapter-wide stack, and the last kind of edit picks the stack: a
      // deleted mark comes back from the question stack, a stroke from ink.
      const editKey = chapterKey(reader.bookId, reader.code)
      const [, bumpQuestionEdits] = useState(0)
      const questionUndoCount = questionUndoDepth(editKey)
      const questionRedoCount = questionRedoDepth(editKey)
      const questionKindActive = annotTool === 'question' || (chapterEditKind.get(editKey) ?? 'ink') === 'question'
      const undoAvailable = dual
        ? (activeSide === 'right' ? rightHistory.undo : historyCounts.undo)
        : questionKindActive ? questionUndoCount : historyCounts.undo
      const redoAvailable = dual
        ? (activeSide === 'right' ? rightHistory.redo : historyCounts.redo)
        : questionKindActive ? questionRedoCount : historyCounts.redo
      const undoEither = () => {
        if (questionKindActive && questionUndoCount > 0) {
          const snapshot = undoQuestionEdit(editKey, { questions: questionsRef.current, next: questionsNext.current })
          if (snapshot !== null) {
            commitQuestions(snapshot.questions, snapshot.next, false)
            return
          }
        }
        if (dual && activeSide === 'right' && rightInk.current !== null) rightInk.current.undo()
        else undoPage()
      }
      const redoEither = () => {
        if (questionKindActive && questionRedoCount > 0) {
          const snapshot = redoQuestionEdit(editKey, { questions: questionsRef.current, next: questionsNext.current })
          if (snapshot !== null) {
            commitQuestions(snapshot.questions, snapshot.next, false)
            return
          }
        }
        if (dual && activeSide === 'right' && rightInk.current !== null) rightInk.current.redo()
        else redoPage()
      }
      // Standard editor shortcuts for annotation history. Inputs and the note
      // editor keep their native text undo.
      useEffect(() => {
        const onKeyDown = event => {
          if (!(event.ctrlKey === true || event.metaKey === true) || event.altKey === true) return
          const key = String(event.key).toLowerCase()
          if (key !== 'z' && key !== 'y') return
          const target = event.target
          if (target !== null && target !== undefined && typeof target.tagName === 'string'
            && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable === true)) return
          if (noteEditRef.current !== null) return
          const redo = key === 'y' || (key === 'z' && event.shiftKey === true)
          if (redo ? redoAvailable === 0 : undoAvailable === 0) return
          event.preventDefault()
          event.stopPropagation()
          if (redo) redoEither()
          else undoEither()
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [undoAvailable, redoAvailable, activeSide, dual])
      // Each mask paints the translated page into its own canvas, sized as a
      // whole page and shifted by -mask origin. The canvas has no width/height
      // style of its own, so the browser scales the bitmap to exactly the page
      // box: no aspect guess, no SVG clip path, no stretched text.
      // Freehand layer: SVG in page coordinates, above the masks. It only takes
      // pointer events while a tool is picked, so masks and the page stay usable.
      // One layer per view: the single page uses "main", the bilingual columns
      // use one each. The left column edits the page's shared notes; the
      // translated column has its own store (ColumnInk), so a note made beside
      // the translation does not travel back to the original. The draft
      // remembers which column opened it and only that column shows the editor.
      // Notes are edited where they sit; the canvas captures pointers on a
      // stage-sized layer, so both entry points share this one double-click.
      const editNoteAt = (event, side) => {
        if (annotTool !== '' && annotTool !== 'text' && annotTool !== 'select') return
        const point = annotPoint(event)
        if (point === null) return
        const found = strokesRef.current.findIndex(entry => entry.kind === 'text' && annotHit(entry, point))
        if (found < 0) return
        event.preventDefault()
        event.stopPropagation()
        const entry = strokesRef.current[found]
        const bounds = noteBox(entry)
        noteSeq.current += 1
        noteText.current = String(entry.text ?? '')
        setSelection({ index: found, kind: 'text' })
        setNoteEdit({
          id: noteSeq.current,
          page: annotPage.current,
          side,
          index: found,
          x: bounds.x,
          y: bounds.y,
          w: bounds.w,
          h: bounds.h,
          text: noteText.current,
          color: entry.color ?? annotColor,
          fontSize: Number.isFinite(entry.fontSize) ? entry.fontSize : NOTE_SIZES[0],
          fontFamily: typeof entry.fontFamily === 'string' ? entry.fontFamily : 'normal',
          textAlign: typeof entry.textAlign === 'string' ? entry.textAlign : 'left',
          fontWeight: entry.fontWeight === 'bold' ? 'bold' : 'normal',
          fontStyle: entry.fontStyle === 'italic' ? 'italic' : 'normal',
        })
      }

      // The adjustment panel is a right-click gesture: a plain press must stay a
      // press (select, move, edit), so a click on a text box never pops a panel
      // under the pointer. The panel floats over the reader, moves by its
      // header, and any press outside it leaves the adjustment.
      const openStylePanelAt = (event, index) => {
        const entry = strokesRef.current[index]
        if (entry === undefined || entry.kind !== 'text') return
        event.preventDefault()
        event.stopPropagation()
        setSelection({ index, kind: 'text' })
        const pane = props.paneRef === null || props.paneRef === undefined ? null : props.paneRef.current
        const box = pane === null ? null : pane.getBoundingClientRect()
        const width = 300
        const height = 280
        const left = box === null
          ? 220
          : Math.min(Math.max(8, event.clientX - box.left - 24), Math.max(8, box.width - width - 8))
        const top = box === null
          ? 120
          : Math.min(Math.max(8, event.clientY - box.top + 14), Math.max(8, box.height - height - 8))
        setStylePanel({ x: left, y: top })
      }
      const openStylePanelOnLayer = event => {
        event.preventDefault()
        if (annotTool !== '' && annotTool !== 'text' && annotTool !== 'select') return
        const point = annotPoint(event)
        if (point === null) return
        const found = strokesRef.current.findIndex(entry => entry.kind === 'text' && annotHit(entry, point))
        if (found >= 0) openStylePanelAt(event, found)
      }
      const beginStylePanelDrag = event => {
        if (stylePanel === null || event.button !== 0) return
        // The close button lives in the header too; a press on it must not drag.
        if (event.target !== null && event.target !== undefined && typeof event.target.closest === 'function'
          && event.target.closest('.md-selection-close') !== null) return
        event.preventDefault()
        stylePanelDrag.current = { from: [event.clientX, event.clientY], x: stylePanel.x, y: stylePanel.y }
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* capture is a nicety */ }
      }
      const moveStylePanel = event => {
        const drag = stylePanelDrag.current
        if (drag === null) return
        event.preventDefault()
        setStylePanel({
          x: drag.x + (event.clientX - drag.from[0]),
          y: drag.y + (event.clientY - drag.from[1]),
        })
      }
      const endStylePanelDrag = () => { stylePanelDrag.current = null }
      useEffect(() => {
        if (stylePanel === null) return undefined
        const onDown = event => {
          const node = stylePanelRef.current
          if (node !== null && node.contains(event.target)) return
          setStylePanel(null)
        }
        window.addEventListener('pointerdown', onDown)
        return () => window.removeEventListener('pointerdown', onDown)
      }, [stylePanel])
      // The panel belongs to one note on one page: turning the page or a remote
      // edit puts it away instead of letting it edit a mark it no longer shows.
      useEffect(() => { setStylePanel(null) }, [annotKey])

      const annotLayer = side => h('div', {
        className: 'md-annot',
        'data-tool': annotTool,
        // Both views share one annotation plane: a mark may live past the page
        // edge and stays visible, so the same notes show in single and
        // continuous. Six page widths and three page heights are the bounds.
        'data-extended': 'true',
        // In the single page a stage-sized capture layer (below) owns the
        // pointers while a mark tool is picked, because off-page marks need
        // coordinates outside the page box; otherwise this layer takes them.
        onPointerDown: event => annotDown(event, side),
        onPointerMove: annotMove,
        onPointerUp: annotUp,
        onPointerLeave: annotUp,
        onDoubleClick: event => editNoteAt(event, side),
        onContextMenu: openStylePanelOnLayer,
      },
        h(InkMarks, {
          entries: strokes,
          roughness: props.roughness,
          hiddenNoteIndex: noteEdit === null ? -1 : noteEdit.index,
          drag,
          dragGroup: groupDrag === null ? null : { indices: groupDrag.indices, dx: groupDrag.dx, dy: groupDrag.dy },
          resize,
          resizeEntry,
          selection,
          noteTitle: annotTool === '' ? format('annotTextEditHint') : undefined,
          onNotePointerDown: annotTool === '' ? (index, event) => event.stopPropagation() : undefined,
          onNoteContextMenu: (index, event) => deleteNoteAt(index, event),
          onNoteDoubleClick: annotTool === ''
            ? (index, event, entry) => {
              event.preventDefault()
              event.stopPropagation()
              const bounds = noteBox(entry)
              noteSeq.current += 1
              noteText.current = String(entry.text ?? '')
              setNoteEdit({
                id: noteSeq.current,
                page: annotPage.current,
                side,
                index,
                x: bounds.x,
                y: bounds.y,
                w: bounds.w,
                h: bounds.h,
                text: noteText.current,
                color: entry.color ?? annotColor,
                fontSize: Number.isFinite(entry.fontSize) ? entry.fontSize : NOTE_SIZES[0],
                fontFamily: typeof entry.fontFamily === 'string' ? entry.fontFamily : 'normal',
                textAlign: typeof entry.textAlign === 'string' ? entry.textAlign : 'left',
                fontWeight: entry.fontWeight === 'bold' ? 'bold' : 'normal',
                fontStyle: entry.fontStyle === 'italic' ? 'italic' : 'normal',
              })
            }
            : undefined,
          drafts: [
            textDraft === null
              ? null
              : h('rect', {
                key: 'text-draft',
                x: Math.min(textDraft.x0, textDraft.x1),
                y: Math.min(textDraft.y0, textDraft.y1),
                width: Math.abs(textDraft.x1 - textDraft.x0),
                height: Math.abs(textDraft.y1 - textDraft.y0),
                fill: 'none',
                stroke: '#2f6df6',
                strokeWidth: 1.5,
                strokeDasharray: '5 4',
                vectorEffect: 'non-scaling-stroke',
              }),
            shapeDraft === null
              ? null
              : h('g', { key: 'shape-draft', opacity: 0.8 },
                h(ShapeMark, {
                  entry: {
                    kind: 'shape',
                    ...shapeDraft,
                    x: Math.min(shapeDraft.x0, shapeDraft.x1),
                    y: Math.min(shapeDraft.y0, shapeDraft.y1),
                    w: Math.abs(shapeDraft.x1 - shapeDraft.x0),
                    h: Math.abs(shapeDraft.y1 - shapeDraft.y0),
                  },
                  roughness: props.roughness,
                })),
            draftStroke === null
              ? null
              : h('polyline', {
                key: 'draft-stroke',
                points: draftStroke.points.map(point => `${point[0]},${point[1]}`).join(' '),
                fill: 'none',
                stroke: draftStroke.color ?? '#e0554a',
                strokeWidth: draftStroke.width ?? 2,
                vectorEffect: 'non-scaling-stroke',
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
              }),
          ],
        }),
        (() => {
          if (marquee === null) return null
          const box = {
            x: Math.min(marquee.x0, marquee.x1),
            y: Math.min(marquee.y0, marquee.y1),
            w: Math.abs(marquee.x1 - marquee.x0),
            h: Math.abs(marquee.y1 - marquee.y0),
          }
          return h('div', {
            className: 'md-marquee',
            style: { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` },
          })
        })(),
        (() => {
          const indices = groupSelection.length > 0
            ? groupSelection
            : selection === null ? [] : [selection.index]
          if (indices.length === 0) return null
          const dx = groupDrag === null ? 0 : groupDrag.dx
          const dy = groupDrag === null ? 0 : groupDrag.dy
          return indices.map(index => {
            if (strokes[index] !== undefined && strokes[index].kind === 'text') return null
            const box = entryBounds(strokes[index])
            if (box.w <= 0 && box.h <= 0) return null
            return h('div', {
              key: `selection-${index}`,
              className: 'md-selection-outline',
              style: {
                left: `${(box.x + dx) * 100}%`,
                top: `${(box.y + dy) * 100}%`,
                width: `${Math.max(box.w, 0.008) * 100}%`,
                height: `${Math.max(box.h, 0.008) * 100}%`,
              },
            })
          })
        })(),
        selection !== null && selectedEntry !== undefined && (selectedEntry.kind === 'shape' || selectedEntry.kind === 'text')
          && (annotTool === 'select' || (annotTool === 'text' && selectedEntry.kind === 'text'))
          ? (() => {
            const live = resizeEntry !== null && resize !== null && resize.index === selection.index ? resizeEntry : selectedEntry
            const box = live.kind === 'text' ? noteBox(live) : live
            return h('div', { className: 'md-shape-handles' },
              (selectedEntry.kind === 'shape' && (selectedEntry.shape === 'line' || selectedEntry.shape === 'arrow')
                ? [['start', box.x0, box.y0], ['end', box.x1, box.y1]]
                : [
                  ['nw', box.x, box.y],
                  ['ne', box.x + box.w, box.y],
                  ['sw', box.x, box.y + box.h],
                  ['se', box.x + box.w, box.y + box.h],
                ]).map(item => h('div', {
                key: item[0],
                className: 'md-shape-handle',
                style: { left: `${item[1] * 100}%`, top: `${item[2] * 100}%` },
                onPointerDown: event => {
                  event.preventDefault()
                  event.stopPropagation()
                  const annot = event.currentTarget.closest('.md-annot')?.getBoundingClientRect()
                  if (annot === undefined || annot === null) return
                  const raw = [
                    (event.clientX - annot.left) / annot.width,
                    (event.clientY - annot.top) / annot.height,
                  ]
                  // Handles use the annot layer's own rect: the plane lets a
                  // mark sit outside the page in both views, so no clamping.
                  const point = raw
                  const original = selectedEntry.kind === 'text' ? { ...selectedEntry, ...box } : box
                  setResize({ index: selection.index, corner: item[0], start: point, original })
                  setResizeEntry(original)
                },
              })))
          })()
          : null,
        noteEdit === null || noteEdit.side !== side
          ? null
          : h(NoteEditor, {
            key: `note-${noteEdit.id}`,
            draft: noteEdit,
            // The shared plane lets a note box live off the page; continuous
            // keeps it on the page.
            unbounded: true,
            onChange: changeNote,
            onSave: () => saveNote(noteEdit.id),
            onCancel: cancelNote,
          })
      )

      // Reader-local shortcuts: the tools, the page box and the question jump.
      // The workbench handles page/zoom/mode/close; these belong here because
      // only the reader owns the picked tool. The workbench listener lets these
      // actions through untouched (see READER_ACTIONS).
      useEffect(() => {
        const onKeyDown = event => {
          const target = event.target
          if (target !== null && target !== undefined && typeof target.closest === 'function'
            && target.closest('.md-note-editor') !== null) return
          const typing = target !== null && target !== undefined
            && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable === true)
          if (typing) return
          const action = shortcutActionOf(event)
          if (action === '') return
          if (action === 'jumpPage') {
            event.preventDefault()
            const node = pageInput.current
            if (node !== null && node !== undefined) {
              node.focus()
              if (typeof node.select === 'function') node.select()
            }
            return
          }
          if (action === 'questionJump') {
            event.preventDefault()
            const pane = props.paneRef === null || props.paneRef === undefined ? null : props.paneRef.current
            const trigger = pane === null ? null : pane.querySelector('.md-question-jump')
            if (trigger !== null && typeof trigger.focus === 'function') trigger.focus()
            return
          }
          const tool = TOOL_SHORTCUTS[action]
          if (tool === undefined) return
          event.preventDefault()
          setAnnotTool(current => (current === tool ? '' : tool))
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [props.paneRef])

      // Question marks: page positions shared with the right preview and the
      // chapter's question list. `questionsNext` is the number the next default
      // name takes; the Host keeps it ahead of hand-edited names.
      const [questions, setQuestions] = useState([])
      const questionsRef = useRef([])
      const questionsNext = useRef(1)
      const [questionFlash, setQuestionFlash] = useState('')
      const [questionRev, setQuestionRev] = useState(0)
      const seenQuestionRev = useRef(0)
      questionsRef.current = questions
      useEffect(() => {
        let cancelled = false
        void loadChapterQuestions(reader.bookId, reader.code).then(payload => {
          if (cancelled) return
          questionsRef.current = payload.questions
          questionsNext.current = payload.next
          setQuestions(payload.questions)
        }).catch(() => {
          // A chapter with no readable questions file simply has none.
        })
        return () => { cancelled = true }
      }, [reader.bookId, reader.code, questionRev])
      useEffect(() => {
        seenQuestionRev.current = Number(readView(reader.bookId, reader.code).questionRev) || 0
        return subscribeView(reader.bookId, reader.code, state => {
          if (state.origin !== 'side') return
          const rev = Number(state.questionRev) || 0
          if (rev <= seenQuestionRev.current) return
          seenQuestionRev.current = rev
          setQuestionRev(value => value + 1)
        })
      }, [reader.bookId, reader.code])
      // A chapter-list click asks the reader to show one mark: jump happens in
      // the workbench, the highlight lives here for a moment.
      useEffect(() => {
        const focus = typeof reader.questionFocus === 'string' ? reader.questionFocus : ''
        if (focus === '') return undefined
        setQuestionFlash(focus)
        const timer = window.setTimeout(() => setQuestionFlash(''), 1800)
        return () => window.clearTimeout(timer)
      }, [reader.questionFocus])
      /**
       * Replace the chapter's marks, on screen first and on disk right after.
       * @param {object[]} list - the marks to keep.
       * @param {number} next - the next default number.
       * @returns {void}
       */
      const questionCommitting = createQuestionCommitting({
        bookId: reader.bookId,
        code: reader.code,
        origin: 'reader',
        questionsRef,
        nextRef: questionsNext,
        setQuestions,
        bumpQuestionEdits,
        seenQuestionRev,
      })
      const commitQuestions = (list, next, record = true) => { questionCommitting.commit(list, next, record) }
      const createQuestion = rect => {
        // Fill the smallest free number: deleting 疑问 1 makes the next mark
        // 疑问 1 again instead of continuing at a later number.
        const number = nextQuestionNumber(questionsRef.current)
        const question = {
          id: createQuestionId(),
          name: `疑问 ${number}`,
          page: inkPage,
          rect,
          createdAt: Date.now(),
        }
        commitQuestions([...questionsRef.current, question], Math.max(questionsNext.current, number + 1))
        // Reading mode never writes into a conversation: only the right preview
        // (the PDF next to the chat) announces a new mark. Here the mark is just
        // a position on the page.
      }
      const commitQuestionRect = (id, rect) => {
        commitQuestions(questionsRef.current.map(item => (item.id === id ? { ...item, rect } : item)), questionsNext.current)
      }
      const deleteQuestion = id => {
        commitQuestions(questionsRef.current.filter(item => item.id !== id), questionsNext.current)
      }
      const renameQuestion = (id, name) => {
        commitQuestions(questionsRef.current.map(item => (item.id === id ? { ...item, name } : item)), questionsNext.current)
      }

      const masksLayer = overlay
        ? h('div', {
          className: 'md-overlay-layer',
          ref: overlayLayer,
          onPointerDown: maskDown,
          onPointerMove: maskMove,
          onPointerUp: maskUp,
          onPointerLeave: maskUp,
        },
          h(MaskBoxes, {
            masks,
            image: translatedImage,
            onChange: (index, mask) => savePageMasks(masksRef.current.map((item, position) => (position === index ? mask : item))),
            onDelete: index => savePageMasks(masksRef.current.filter((item, position) => position !== index)),
          }),
          maskDraft === null
            ? null
            : h('div', {
              className: 'md-mask md-mask-draft',
              style: {
                left: `${maskDraft.x * 100}%`,
                top: `${maskDraft.y * 100}%`,
                width: `${maskDraft.w * 100}%`,
                height: `${maskDraft.h * 100}%`,
              },
            })
        )
        : null
      const pageQuestions = questions.filter(item => Number(item.page) === inkPage)
      const questionLayer = h(QuestionMarks, {
        questions: pageQuestions,
        active: annotTool === 'question',
        create: annotTool === 'question',
        reading: annotTool === '',
        flash: questionFlash,
        onCreate: rect => createQuestion(rect),
        onCommit: (id, rect) => commitQuestionRect(id, rect),
        onDelete: id => deleteQuestion(id),
        onRename: (id, name) => renameQuestion(id, name),
      })
      // Both views let a mark start outside the page: a stage-sized layer takes
      // the pointers while a mark tool is picked, and the point is measured
      // against the page being read (continuous mode keeps the page association
      // simple; a mark drawn far from the page is still that page's mark).
      // Questions stay page-area marks, the mask tool keeps its own pointer
      // handling, and the open note editor needs the pointer for itself.
      const captureInk = inkTool && noteEdit === null
      const canvasCapture = captureInk
        ? h('div', {
          className: 'md-canvas-capture',
          'data-tool': annotTool,
          onPointerDown: event => annotDown(event, 'main'),
          onWheel: forwardWheel,
          onPointerMove: annotMove,
          onPointerUp: annotUp,
          onPointerLeave: annotUp,
          onPointerCancel: annotUp,
          onDoubleClick: event => editNoteAt(event, 'main'),
          onContextMenu: event => {
            const point = annotPoint(event)
            const found = point === null ? -1 : strokesRef.current.findIndex(entry => entry.kind === 'text' && annotHit(entry, point))
            if (found >= 0) { deleteNoteAt(found, event); return }
            openStylePanelOnLayer(event)
          },
        })
        : null
      // The plane's outline: the page box plus its margins, with one "+" square
      // per edge. The right preview renders the same component, so both panes
      // show the same plane and the same handles.
      const planeBoundsLayer = h(PlaneBounds, { margins: planeMargins, onExpand: expandPlane })
      return h('section', {
        className: 'md-reader',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': `${format('openPdf')}：${label}`,
        'data-phase': reader.phase,
        'data-mode': reader.mode,
        'data-rail': railSide,
        tabIndex: -1,
        ref: props.paneRef,
        onPointerMove: onRailPointer,
        onPointerLeave: () => setRailOpen(false),
      },
        h('div', { className: 'md-reader-bar' },
          h(KitButton, {
            type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
            title: format('readerShelfHint'), 'aria-label': format('readerShelf'),
            onClick: props.onShelf,
          }, `⌂ ${format('readerShelf')}`),
          h(KitButton, { type: 'button', className: 'md-btn md-btn-small md-btn-ghost', title: format('readerBackHint'), 'aria-label': format('readerBack'), onClick: props.onBack }, `‹ ${format('readerBack')}`),
          h('div', { className: 'md-reader-titles' },
            h('span', { className: 'md-reader-name', title: label }, label),
            sub === '' ? null : h('span', { className: 'md-reader-sub', title: sub }, sub)
          ),
          h('div', { className: 'md-reader-tools' },
            h('div', { className: 'md-reader-pager' },
              h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small',
                disabled: reader.page <= 1, title: format('readerFirstHint'), 'aria-label': format('readerFirst'),
                onClick: () => props.onPage(1),
              }, '⇤'),
              h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small',
                disabled: reader.page <= 1, title: format('readerPrev'), 'aria-label': format('readerPrev'),
                onClick: props.onPrev,
              }, '‹'),
              h(KitInput, {
                className: 'md-reader-page',
                ref: pageInput,
                type: 'number', min: 1, max: reader.count > 0 ? reader.count : undefined,
                value: pageText,
                title: format('readerPageHint'),
                'aria-label': format('readerPage'),
                onChange: value => setPageText(value),
                onKeyDown: event => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  commitPage()
                },
                onBlur: commitPage,
              }),
              h('span', { className: 'md-reader-of' }, format('readerOf', { n: reader.count > 0 ? reader.count : '?' })),
              h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small',
                disabled: reader.count === 0 || reader.page >= reader.count,
                title: format('readerNext'), 'aria-label': format('readerNext'),
                onClick: props.onNext,
              }, '›')
            ),
            h('span', { className: 'md-reader-sep', 'aria-hidden': true }),
            h(KitButton, {
              type: 'button', className: `md-btn md-btn-small${dual ? ' md-hidden' : ''}`, disabled: !ready,
              title: format('readerZoomOut'), 'aria-label': format('readerZoomOut'),
              onClick: props.onZoomOut,
            }, '−'),
            h(KitButton, {
              type: 'button', className: `md-btn md-btn-small${dual ? ' md-hidden' : ''}`, disabled: !ready,
              title: format('readerFit'),
              onClick: props.onFit,
            }, format('readerFit')),
            h(KitButton, {
              type: 'button', className: `md-btn md-btn-small${dual ? ' md-hidden' : ''}`, disabled: !ready,
              title: format('readerZoomIn'), 'aria-label': format('readerZoomIn'),
              onClick: props.onZoomIn,
            }, '＋'),
            h('span', { className: `md-reader-scale${dual ? ' md-hidden' : ''}`, 'aria-hidden': true }, `${Math.round((reader.scale ?? 1) * 100)}%`)
          ),
          h(KitButton, {
            type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
            'aria-label': format('toolsToggle'), title: format('toolsToggle'),
            onClick: () => setToolsOpen(value => !value),
          }, toolsOpen ? '⌃' : '⌄'),
          h(KitButton, {
            type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
            'aria-label': format('previewClose'), title: format('previewClose'),
            onClick: props.onBack,
          }, '×')
        ),
        h('div', { className: 'md-reader-subbar', style: toolsOpen ? undefined : { display: 'none' } },
          h(KitButton, {
            type: 'button', className: 'md-btn md-btn-small',
            disabled: props.busy,
            title: format('generalSessionHint'),
            onClick: () => {
              if (typeof props.onGeneralSession === 'function') props.onGeneralSession()
            },
          }, format('generalSession')),
          h(KitSelect, {
            className: 'md-question-jump',
            value: '',
            label: format('questionJump'),
            placeholder: questions.length === 0 ? format('questionJumpEmpty') : format('questionJump'),
            title: questions.length === 0 ? format('questionJumpEmpty') : questions.map(item => item.name).join(' / '),
            disabled: questions.length === 0,
            options: questions.map(item => ({ value: item.id, label: `${item.name} · 第 ${item.page} 页` })),
            onChange: id => {
              const found = questionsRef.current.find(item => item.id === id)
              if (found === undefined) return
              props.onPage(found.page)
              setQuestionFlash(found.id)
            },
          }),
          h('span', { className: 'md-reader-sep', 'aria-hidden': true }),
          h('span', { className: 'md-reader-modes', role: 'group', 'aria-label': format('readerMode') },
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small', 'aria-pressed': modeOf('single') ? 'true' : 'false',
              title: format('readerModeSingleHint'),
              onClick: () => props.onMode('single'),
            }, format('readerModeSingle')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small', 'aria-pressed': modeOf('continuous') ? 'true' : 'false',
              title: format('readerModeContinuousHint'),
              onClick: () => props.onMode('continuous'),
            }, format('readerModeContinuous')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
              title: format('canvasCenterHint'),
              onClick: () => {
                setInkPan({ x: 0, y: 0 })
                if (reader.mode !== 'continuous') return
                const stage = props.stageRef === null || props.stageRef === undefined ? null : props.stageRef.current
                const canvas = stage === null ? null : stage.querySelector('.md-reader-canvas')
                if (stage === null || canvas === null) return
                const stageRect = stage.getBoundingClientRect()
                const pageRect = canvas.getBoundingClientRect()
                const wanted = stage.scrollLeft + (pageRect.left - stageRect.left) + pageRect.width / 2 - stage.clientWidth / 2
                stage.scrollLeft = Math.max(0, Math.min(stage.scrollWidth - stage.clientWidth, wanted))
              },
            }, format('canvasCenter')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small', 'aria-pressed': showBlocks ? 'true' : 'false',
              title: format('blocksHint'),
              onClick: () => setShowBlocks(value => !value),
            }, format('blocksToggle')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small', 'aria-pressed': dual ? 'true' : 'false',
              title: format('dualHint'),
              onClick: () => {
                if (!hasTranslation) {
                  if (props.canTranslate !== true) {
                    if (typeof props.onEnvRequired === 'function') props.onEnvRequired('translate')
                    return
                  }
                  if (typeof window !== 'undefined' && typeof window.confirm === 'function'
                    && window.confirm(format('dualNeedsTranslation'))) {
                    void runTranslate()
                  }
                  return
                }
                setOverlay(false)
                setTimeout(bumpViewer, 80)
                setDual(value => {
                  if (value) {
                    setDualDoc(null)
                    setOverlay(false)
                  }
                  return !value
                })
              },
            }, format('dualToggle')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small', 'aria-pressed': overlay ? 'true' : 'false',
              title: format('overlayHint'),
              onClick: () => {
                if (reader.variant === 'translated') return
                if (!overlay && !hasTranslation) {
                  if (props.canTranslate !== true) {
                    if (typeof props.onEnvRequired === 'function') props.onEnvRequired('translate')
                    return
                  }
                  if (typeof window !== 'undefined' && typeof window.confirm === 'function'
                    && window.confirm(format('dualNeedsTranslation'))) {
                    void runTranslate()
                  }
                  return
                }
                if (reader.mode !== 'single') props.onMode('single')
                if (dual) {
                  setDual(false)
                  setDualDoc(null)
                }
                setTimeout(bumpViewer, 80)
                setOverlay(value => !value)
              },
            }, format('overlayToggle')),
            overlay
              ? h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small md-blocks-toggle',
                'aria-pressed': autoBoxed ? 'true' : 'false',
                title: format(autoBoxed ? 'overlayBlocksCancelHint' : 'overlayBlocksHint'),
                onClick: () => { void maskAllBlocks() },
              }, autoBoxed ? format('overlayBlocksCancel') : format('overlayBlocks'))
              : null,
            h(KitSelect, {
              className: 'md-reader-lang md-reader-export',
              value: '',
              title: format('exportGroupHint'),
              label: format('exportGroup'),
              placeholder: format('exportGroup'),
              options: [
                { value: 'page', label: format('exportPage') },
                { value: 'chapter', label: format('exportChapter') },
                { value: 'import', label: format('importAnnots') },
              ],
              onChange: action => {
                if (action === 'page') void exportPage()
                else if (action === 'chapter') void exportChapter()
                else if (action === 'import') void importAnnots()
              },
            }),
            h('span', { className: 'md-reader-sep', 'aria-hidden': true }),
            h(KitSelect, {
              className: 'md-reader-lang',
              value: translateTarget,
              title: format('translateHint'),
              label: format('translateFor'),
              options: [
                { value: 'zh', label: format('langZh') },
                { value: 'en', label: format('langEn') },
              ],
              onChange: value => setTranslateTarget(value),
            }),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              disabled: translating || reader.phase !== 'ready',
              title: format('translateHint'),
              onClick: () => {
                if (props.canTranslate !== true) {
                  if (typeof props.onEnvRequired === 'function') props.onEnvRequired('translate')
                  return
                }
                if (!window.confirm(format('translateCostConfirm'))) return
                if (hasTranslation && !window.confirm(format('translateOverwriteConfirm'))) return
                void runTranslate()
              },
            }, translating ? format('translating') : format('translateChapterAction'))
          ),
          props.mathMode !== true
            ? null
            : h(React.Fragment, null,
              h('span', { className: 'md-reader-sep', 'aria-hidden': true }),
              h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small',
                'aria-pressed': props.forceNew ? 'true' : 'false',
                title: format('forceNewHint'),
                onClick: () => props.onForceNew(!props.forceNew),
              }, format('forceNew')),
              h('span', { className: 'md-reader-newlabel' }, format('readerNewLabel')),
              MODES.map(mode => h(KitButton, {
                key: mode,
                type: 'button',
                className: 'md-btn md-btn-small',
                disabled: props.busy,
                title: format('readerNewHint'),
                'aria-label': format('newSessionOf', { mode: format(`mode.${mode}`) }),
                onClick: () => props.onNewSession(mode),
              }, `＋ ${format(`mode.${mode}`)}`))
            )
        ),
        translateNote === '' ? null : h('div', { className: 'md-reader-note-reveal' },
          h('div', { className: 'md-reader-note', role: 'status' },
          h('span', null, translateNote),
          translating ? h(KitButton, {
            type: 'button', className: 'md-btn md-btn-small',
            onClick: cancelTranslate,
          }, format('translateCancel')) : null,
          !translating && partialPages.length > 0 && props.canTranslate === true
            ? h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              title: format('translateResumeHint'),
              onClick: () => { void runTranslate(true) },
            }, format('translateResume'))
            : null,
          exportJob !== ''
            ? h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              onClick: cancelExport,
            }, format('exportCancel'))
            : null,
          !translating && retryAction !== null
            ? h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              onClick: () => {
                const run = retryAction
                setRetryAction(null)
                void run()
              },
            }, format('retryAction'))
            : null
        )),
        // While a tool is picked in the bilingual view, say where the ink goes:
        // both columns write the same page, so a note stays with that page.
        dual && annotTool !== '' && noteEdit === null
          ? h('div', { className: 'md-reader-note' }, format('annotDualHint'))
          : annotTool === 'text' && noteEdit === null
            ? h('div', { className: 'md-reader-note' }, format('annotTextActiveHint'))
            : null,
        overlay && (overlayNote !== '' || translatedImage === '')
          ? h('div', { className: 'md-reader-note md-reader-note-overlay', role: 'status' },
            overlayNote === '' ? format('overlayLoading') : overlayNote,
            // The button disappears while the rebuild runs; the note itself
            // carries the progress, so there is no button label to explain.
            overlayReflow && !realigning
              ? h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small',
                title: format('overlayRealignHint'),
                onClick: () => { void realignOverlay() },
              }, format('overlayRealign'))
              : null)
          : null,
        dual && dualDoc === null
          ? h('div', { className: 'md-reader-stage' },
            h('div', { className: 'md-reader-state', role: 'status' }, format('readerLoading')))
          : dual && dualDoc !== null
          ? h('div', { className: 'md-reader-stage' },
            h('div', { className: 'md-reader-dual' },
              h('div', { className: 'md-reader-column', ref: dualLeft },
                h('div', { className: 'md-reader-colhead' },
                  h('span', { className: 'md-reader-coltitle' }, format('dualOriginal')),
                  h(KitButton, {
                    type: 'button', className: 'md-btn md-btn-small',
                    onClick: () => setDualLeftScale(value => Math.max(0.2, (value ?? dualFit.left ?? 1) / 1.2)),
                  }, '−'),
                  h('span', { className: 'md-reader-scale' }, String(Math.round((dualLeftScale ?? dualFit.left ?? 1) * 100)) + '%'),
                  h(KitButton, {
                    type: 'button', className: 'md-btn md-btn-small',
                    onClick: () => setDualLeftScale(value => Math.min(3, (value ?? dualFit.left ?? 1) * 1.2)),
                  }, '+'),
                  h(KitButton, {
                    type: 'button', className: 'md-btn md-btn-small',
                    onClick: () => setDualLeftScale(null),
                  }, format('readerFitScreen'))
                ),
                h(ContinuousView, {
                  doc: reader.variant === 'translated' ? dualDoc : props.doc,
                  showBlocks,
                  bookId: reader.bookId,
                  code: reader.code,
                  count: reader.variant === 'translated' ? (dualDoc === null ? 0 : dualDoc.numPages || 0) : reader.count,
                  page: leftPage,
                  scale: dualLeftScale ?? dualFit.left ?? 1,
                  rootRef: dualLeft,
                  onVisible: notifyVisible,
                  registerSlot,
                  onError: props.onError,
                  overlay: annotLayer('left'),
                  overlayPage: leftPage,
                })
              ),
              h('div', { className: 'md-reader-column', ref: dualRight },
                h('div', { className: 'md-reader-colhead' },
                  h('span', { className: 'md-reader-coltitle' }, format('dualTranslated')),
                  h('span', { className: 'md-reader-scale' }, format('dualPage', { n: dualRightPage })),
                  h(KitButton, {
                    type: 'button', className: 'md-btn md-btn-small',
                    onClick: () => setRightScale(value => Math.max(0.5, (value ?? dualFit.right ?? 1) - 0.1)),
                  }, '−'),
                  h('span', { className: 'md-reader-scale' }, String(Math.round((rightScale ?? dualFit.right ?? 1) * 100)) + '%'),
                  h(KitButton, {
                    type: 'button', className: 'md-btn md-btn-small',
                    onClick: () => setRightScale(value => Math.min(3, (value ?? dualFit.right ?? 1) + 0.1)),
                  }, '+'),
                  h(KitButton, {
                    type: 'button', className: 'md-btn md-btn-small',
                    onClick: () => setRightScale(null),
                  }, format('readerFitScreen'))
                ),
                h(ContinuousView, {
                  doc: reader.variant === 'translated' ? props.doc : dualDoc,
                  showBlocks: false,
                  bookId: reader.bookId,
                  code: reader.code,
                  count: reader.variant === 'translated' ? reader.count : (dualDoc.numPages || 0),
                  page: dualRightPage,
                  scale: rightScale ?? dualFit.right ?? 1,
                  rootRef: dualRight,
                  onVisible: onVisibleRight,
                  registerSlot: registerRightSlot,
                  onError: props.onError,
                  overlay: h(ColumnInk, {
                    bookId: reader.bookId,
                    code: reader.code,
                    page: dualRightPage,
                    store: 'right',
                    tool: annotTool,
                    color: annotColor,
                    width: annotWidth,
                    onReady: onRightReady,
                    onHistory: onRightHistory,
                    onActivate: onRightActivate,
                  }),
                  overlayPage: dualRightPage,
                })
              )
            ))
            : reader.phase === 'loading'
            ? h('div', { className: 'md-reader-stage' },
              h('div', { className: 'md-reader-state', role: 'status' }, format('readerLoading')))
            : reader.phase === 'error'
              ? h('div', { className: 'md-reader-stage' },
                h('div', { className: 'md-reader-state md-state-error', role: 'alert' },
                  h('div', null, reader.error === '' ? format('readerFailed') : reader.error),
                  h('div', { className: 'md-state-actions' },
                    h(KitButton, { type: 'button', className: 'md-btn md-btn-small', onClick: props.onRetry }, format('readerRetry'))
                  )
                ))
              : h(PdfViewer, {
                variant: 'stage',
                mode: reader.mode,
                doc: props.doc,
                page: visiblePage,
                count: reader.count,
                scale: reader.scale,
                fitScale: props.fitScale,
                stageRef: props.stageRef,
                onScale: props.onScale,
                showBlocks,
                bookId: reader.bookId,
                code: reader.code,
                onVisible: notifyVisible,
                registerSlot,
                onError: props.onError,
                pan: extended ? inkPan : null,
                panNeeds,
                margins: planeMargins,
                onPan: setInkPan,
                panEnabled: extended && handActive && noteEdit === null,
                scrollGrab: reader.mode === 'continuous' && handActive && noteEdit === null,
                captureLayer: canvasCapture,
                stableHost: true,
                onExpandPlane: expandPlane,
                onPageNode: (page, node) => {
                  if (node === null || node === undefined) pageNodes.current.delete(page)
                  else pageNodes.current.set(page, node)
                },
                children: [
                  masksLayer,
                  annotLayer('main'),
                  questionLayer,
                  h(BlockOverlay, { key: 'blocks', bookId: reader.bookId, code: reader.code, pageNumber: reader.page, show: showBlocks }),
                ],
                // The editing page owns the interactive layer. In continuous
                // mode that is the page under the pen (`inkPage`), which can be
                // ahead of the debounced reader page; every other page shows its
                // committed marks read-only, so a page turn never paints the
                // previous page's ink on the new page for a frame and never
                // leaves a page bare.
                overlay: masksLayer === null
                  ? [planeBoundsLayer, annotLayer('main'), questionLayer]
                  : [planeBoundsLayer, masksLayer, annotLayer('main'), questionLayer],
                // Every other page keeps a read-only copy of its own marks, so a
                // page turn never shows a page bare or drags the previous page's
                // ink onto it for a frame.
                overlayFor: page => h(StaticInk, {
                  key: `ink-${page}`,
                  bookId: reader.bookId,
                  code: reader.code,
                  page,
                  rev: remoteAnnotRev + inkRev,
                }),
                overlayPage: inkPage,
              }),
        diag
          ? h(DiagPanel, {
            lines: [
              `book   ${reader.bookId}/${reader.code}${reader.name === '' ? '' : ` · ${reader.name}`}`,
              `view   ${reader.variant === 'translated' ? 'translated' : 'source'} · ${reader.mode} · ${reader.phase}`,
              `page   ${reader.page} / ${reader.count} · jump ${reader.jump ?? 0} · ${Math.round((reader.scale ?? 1) * 100)}%`,
              `shared ${storeView.page ?? '—'} / ${storeView.count ?? '—'} · jump ${storeView.jump ?? 0} · ${storeView.cause ?? '—'} @${storeView.origin ?? '—'}`,
              `dual   right ${dualRightPage} · tool ${annotTool || '—'} · side ${activeSide}`,
              `annot  ${annotKey}`,
            ],
          })
          : null,
        railOpen
          ? null
          : h('div', { className: 'md-rail-tab', 'data-side': railSide, 'aria-hidden': true },
            railSide === 'right' ? '‹' : '›'),
        h('div', {
          className: 'md-rail-wrap',
          'data-side': railSide,
          onPointerLeave: leaveRail,
        },
          h('div', { className: 'md-rail', 'data-open': railOpen ? 'true' : undefined, role: 'toolbar', 'aria-label': format('annotTools') },
            railTool('hand', 'annotHand', 'M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'),
            railTool('select', 'annotSelect', 'M5 3l7 17 2-7 7-2z'),
            railTool('pen', 'annotPen', 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'),
            railTool('erase', 'annotErase', 'm7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21M22 21H7M5 11l9 9'),
            railTool('text', 'annotText', 'M4 6h16M12 6v13M9 19h6'),
            railTool('question', 'questionTool', 'M4 4h16v16H4zM9.6 9.6a2.4 2.4 0 1 1 3.3 2.2c-.7.3-1 .8-1 1.4v.4M12 16.6h.01'),
            railTool('line', 'shapeLine', 'M4 20 20 4'),
            railTool('arrow', 'shapeArrow', 'M4 20 20 4M10 4h10v10'),
            railTool('rect', 'shapeRect', 'M4 5h16v14H4z'),
            railTool('diamond', 'shapeDiamond', 'M12 3 21 12 12 21 3 12z'),
            railTool('ellipse', 'shapeEllipse', 'M12 5c5 0 8 3 8 7s-3 7-8 7-8-3-8-7 3-7 8-7z'),
            railTool('mask', 'overlayToggle', 'M4 4h16v16H4zM8 4v16M16 4v16', overlayUnavailable),
            h('span', { className: 'md-rail-sep', 'aria-hidden': true }),
            h(KitButton, {
              type: 'button', className: 'md-rail-btn',
              disabled: undoAvailable === 0,
              title: format('undoHint'), 'aria-label': format('undo'),
              onClick: undoEither,
            }, annotIcon('M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3')),
            h(KitButton, {
              type: 'button', className: 'md-rail-btn',
              disabled: redoAvailable === 0,
              title: format('redoHint'), 'aria-label': format('redo'),
              onClick: redoEither,
            }, annotIcon('M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3')),
            h(KitButton, {
              type: 'button', className: 'md-rail-btn',
              title: format('annotClearHint'), 'aria-label': format('annotClear'),
              onClick: clearAnnots,
            }, annotIcon('M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14'))
          ),
          railPanel && selection === null && panelTool !== ''
            ? h('div', { className: 'md-rail-panel', 'data-side': railSide, style: railAnchor === null ? undefined : { top: `${railAnchor}px` } },
              h('div', { className: 'md-rail-panel-title' },
                `${format('toolSettings')} · ${format(TOOL_LABELS[panelTool] ?? 'annotPen')}`),
              panelTool === 'text'
                ? h(NoteStyleControls, { style: noteEdit ?? noteStyle, onChange: changeNoteStyle })
                : panelTool === 'hand'
                  ? h('p', { className: 'md-rail-panel-hint' }, format('handPanelHint'))
                  : panelTool === 'question'
                  ? h('p', { className: 'md-rail-panel-hint' }, format('questionPanelHint'))
                  : panelTool === 'select'
                  ? h('p', { className: 'md-rail-panel-hint' }, format('toolPanelSelectHint'))
                  : panelTool === 'mask'
                    ? h('p', { className: 'md-rail-panel-hint' }, format('toolPanelMaskHint'))
                    : panelTool === 'erase'
                      ? h('p', { className: 'md-rail-panel-hint' }, format('annotEraseHint'))
                      : h(React.Fragment, null,
                        h('div', { className: 'md-note-style-row' },
                          h('span', { className: 'md-note-style-label' }, format('annotColor')),
                          ['#1f1f1f', '#e0554a', '#2f6df6', '#2ecc71'].map(color => h(KitButton, {
                            key: color,
                            type: 'button',
                            className: 'md-note-color',
                            style: { background: color },
                            'data-on': annotColor === color ? 'true' : undefined,
                            'aria-label': color,
                            onMouseDown: event => event.preventDefault(),
                            onClick: () => setAnnotColor(color),
                          }))
                        ),
                        h('div', { className: 'md-note-style-row' },
                          h('span', { className: 'md-note-style-label' }, format('annotWidthHint')),
                          h('input', {
                            type: 'range', min: 1, max: 10, step: 1,
                            value: annotWidth,
                            'aria-label': format('annotWidthHint'),
                            onChange: event => setAnnotWidth(Number(event.target.value) || 2),
                          }),
                          h('span', { className: 'md-note-size-value' }, `${annotWidth}px`)
                        )
                      )
            )
            : null
        ),
        selection === null || selectedEntry === undefined || stylePanel === null
          ? null
          : h('div', {
            className: 'md-selection-panel',
            ref: stylePanelRef,
            style: { left: `${stylePanel.x}px`, top: `${stylePanel.y}px` },
          },
            h('div', {
              className: 'md-selection-head',
              title: format('selectionPanelDragHint'),
              onPointerDown: beginStylePanelDrag,
              onPointerMove: moveStylePanel,
              onPointerUp: endStylePanelDrag,
              onPointerCancel: endStylePanelDrag,
            },
              h('span', null, format('selectionTitle')),
              h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small md-btn-ghost md-selection-close',
                'aria-label': format('previewClose'), title: format('previewClose'),
                onClick: () => { setStylePanel(null); setSelection(null) },
              }, '×')
            ),
            selectedEntry.kind === 'text'
              ? h(NoteStyleControls, { style: selectedEntry, onChange: patchSelection })
              : h(React.Fragment, null,
                h('div', { className: 'md-note-style-row' },
                  h('span', { className: 'md-note-style-label' }, format('annotColor')),
                  ['#1f1f1f', '#e0554a', '#2f6df6', '#2ecc71'].map(color => h(KitButton, {
                    key: color,
                    type: 'button',
                    className: 'md-note-color',
                    style: { background: color },
                    'data-on': (selectedEntry.color ?? '#e0554a') === color ? 'true' : undefined,
                    'aria-label': color,
                    onClick: () => patchSelection({ color }),
                  }))
                ),
                h('div', { className: 'md-note-style-row' },
                  h('span', { className: 'md-note-style-label' }, format('annotWidthHint')),
                  h('input', {
                    type: 'range', min: 1, max: 10, step: 1,
                    value: selectedEntry.width ?? 2,
                    'aria-label': format('annotWidthHint'),
                    onChange: event => patchSelection({ width: Number(event.target.value) || 2 }),
                  })
                ),
                selectedEntry.kind === 'shape'
                  ? h(React.Fragment, null,
                    h('div', { className: 'md-note-style-row' },
                      h('span', { className: 'md-note-style-label' }, format('fillTitle')),
                      h(KitButton, {
                        type: 'button', className: 'md-note-style-btn',
                        'data-on': selectedEntry.fill === undefined || selectedEntry.fill === '' ? 'true' : undefined,
                        onClick: () => patchSelection({ fill: '' }),
                      }, format('fillNone')),
                      ['#f2c94c', '#f28b82', '#aecbfa', '#b7e1cd'].map(color => h(KitButton, {
                        key: color,
                        type: 'button',
                        className: 'md-note-color',
                        style: { background: color },
                        'data-on': selectedEntry.fill === color ? 'true' : undefined,
                        'aria-label': color,
                        onClick: () => patchSelection({ fill: color }),
                      }))
                    ),
                    h('div', { className: 'md-note-style-row' },
                      h('span', { className: 'md-note-style-label' }, format('fillStyleTitle')),
                      h(KitButton, {
                        type: 'button', className: 'md-note-style-btn',
                        'data-on': selectedEntry.fillStyle !== 'solid' ? 'true' : undefined,
                        onClick: () => patchSelection({ fillStyle: 'hachure' }),
                      }, format('fillHachure')),
                      h(KitButton, {
                        type: 'button', className: 'md-note-style-btn',
                        'data-on': selectedEntry.fillStyle === 'solid' ? 'true' : undefined,
                        onClick: () => patchSelection({ fillStyle: 'solid' }),
                      }, format('fillSolid'))
                    ),
                    h('div', { className: 'md-note-style-row' },
                      h('span', { className: 'md-note-style-label' }, format('strokeStyleTitle')),
                      h(KitButton, {
                        type: 'button', className: 'md-note-style-btn',
                        'data-on': (selectedEntry.strokeStyle ?? 'solid') === 'solid' ? 'true' : undefined,
                        onClick: () => patchSelection({ strokeStyle: 'solid' }),
                      }, format('styleSolid')),
                      h(KitButton, {
                        type: 'button', className: 'md-note-style-btn',
                        'data-on': selectedEntry.strokeStyle === 'dashed' ? 'true' : undefined,
                        onClick: () => patchSelection({ strokeStyle: 'dashed' }),
                      }, format('styleDashed')),
                      h(KitButton, {
                        type: 'button', className: 'md-note-style-btn',
                        'data-on': selectedEntry.strokeStyle === 'dotted' ? 'true' : undefined,
                        onClick: () => patchSelection({ strokeStyle: 'dotted' }),
                      }, format('styleDotted'))
                    )
                  )
                  : null
              ),
            h('div', { className: 'md-note-style-row' },
              h('span', { className: 'md-note-style-label' }, format('opacityTitle')),
              h('input', {
                type: 'range', min: 0.2, max: 1, step: 0.05,
                value: selectedEntry.opacity ?? 1,
                'aria-label': format('opacityTitle'),
                onChange: event => patchSelection({ opacity: Number(event.target.value) }),
              }),
              h('span', { className: 'md-note-size-value' }, `${Math.round((selectedEntry.opacity ?? 1) * 100)}%`)
            ),
            h('div', { className: 'md-selection-actions' },
              h(KitButton, { type: 'button', className: 'md-btn md-btn-small', onClick: duplicateSelection }, format('duplicateSelection')),
              h(KitButton, { type: 'button', className: 'md-btn md-btn-small', onClick: () => reorderSelection(true) }, format('bringFront')),
              h(KitButton, { type: 'button', className: 'md-btn md-btn-small', onClick: () => reorderSelection(false) }, format('sendBack'))
            ),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small md-selection-delete',
              onClick: deleteSelection,
            }, format('selectionDelete'))
          )
      )
    }


    /**
     * One chapter row plus its expanded detail.
     * @param {{ bookId: string, bookTitle: string, chapter: object, open: boolean, groups: object | undefined, artifacts: object | undefined, counts: object | undefined, cache: object | undefined, creatingMode: string, createError: string, errorSession: string | null, loaded: boolean, available: boolean, onClick: Function, onOpenPdf: Function, onNewSession: Function, onOpenSession: Function, onRetryRename: Function, onOpenArtifact: Function, onRetryArtifacts: Function, onReloadArtifacts: Function, onLoadCache: Function, onRebuildCache: Function, onCopyPath: Function, registerRef: Function, registerFileRef: Function }} props - chapter state and handlers.
     * @returns {import('react').ReactElement} the row.
     */
    function ChapterRow(props) {
      const chapter = props.chapter
      const [sessionsOpen, setSessionsOpen] = useState(false)
      const [translatedPdf, setTranslatedPdf] = useState('')
      // Where the reader last stopped in this chapter; no record means no hint.
      const lastPage = readStoredPage(props.bookId, chapter.code)
      // Attachments: listed once per open, then refreshed after an upload or
      // delete. The file is read in the browser and copied by the Host.
      const [attachments, setAttachments] = useState(null)
      const [attachBusy, setAttachBusy] = useState(false)
      const attachInput = useRef(null)
      const reloadAttachments = () => setAttachments(null)
      useEffect(() => {
        if (!props.open || attachments !== null) return undefined
        let cancelled = false
        request('GET', `attachments?book=${encodeURIComponent(props.bookId)}&code=${encodeURIComponent(chapter.code)}`)
          .then(payload => {
            if (!cancelled) setAttachments(Array.isArray(payload.items) ? payload.items : [])
          })
          .catch(() => {
            if (!cancelled) setAttachments([])
          })
        return () => { cancelled = true }
      }, [props.open, attachments, props.bookId, chapter.code])
      const uploadAttachment = async event => {
        const file = event.target.files !== undefined && event.target.files.length > 0 ? event.target.files[0] : null
        event.target.value = ''
        if (file === null || file === undefined) return
        if (file.size > 50 * 1024 * 1024) {
          window.alert(format('attachTooLarge'))
          return
        }
        setAttachBusy(true)
        try {
          const data = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              const result = String(reader.result ?? '')
              resolve(result.slice(result.indexOf(',') + 1))
            }
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(file)
          })
          await request('POST', 'attachments', { book: props.bookId, code: chapter.code, name: file.name, data })
          reloadAttachments()
        } catch (error) {
          window.alert(`${format('attachFailed')} (${error !== null && error !== undefined && error.message ? error.message : String(error)})`)
        } finally {
          setAttachBusy(false)
        }
      }
      const deleteAttachment = async name => {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function'
          && !window.confirm(format('attachDeleteConfirm'))) return
        try {
          await request('POST', 'attachments/remove', { book: props.bookId, code: chapter.code, name })
          reloadAttachments()
        } catch (error) {
          window.alert(`${format('attachFailed')} (${error !== null && error !== undefined && error.message ? error.message : String(error)})`)
        }
      }
      const attachmentUrl = name => `/pdfdesk/attachments/file?book=${encodeURIComponent(props.bookId)}&code=${encodeURIComponent(chapter.code)}&name=${encodeURIComponent(name)}`
      useEffect(() => {
        if (!props.open || chapter.file === '') {
          setTranslatedPdf('')
          return undefined
        }
        let cancelled = false
        request('GET', `translated-info?book=${encodeURIComponent(props.bookId)}&code=${encodeURIComponent(chapter.code)}&name=${encodeURIComponent(`${chapter.file}.pdf`)}`)
          .then(payload => {
            if (!cancelled && payload !== null && payload.exists === true) setTranslatedPdf(String(payload.pdf))
          })
          .catch(() => {})
        return () => {
          cancelled = true
        }
      }, [props.open, chapter.file, props.bookId])
      const open = props.open
      const detailId = `md-detail-${encodeURIComponent(props.bookId)}-${chapter.code}`
      const kindKey = chapter.kind !== undefined && chapter.kind !== 'chapter' ? `kind.${chapter.kind}` : ''
      const kindText = kindKey !== '' && translate(kindKey) !== kindKey ? format(kindKey) : ''
      const count = sessionCount(props.groups)
      const loadedFiles = props.artifacts !== undefined && Array.isArray(props.artifacts.items) ? props.artifacts.items.length : undefined
      const counted = props.counts !== undefined && typeof props.counts === 'object' ? props.counts[chapter.code] : undefined
      const files = loadedFiles === undefined ? (typeof counted?.n === 'number' ? counted.n : 0) : loadedFiles
      const filesMore = loadedFiles === undefined ? counted?.truncated === true : props.artifacts.truncated === true
      const counts = [
        count === 0 ? '' : format('sessionsCount', { n: count }),
        files === 0 ? '' : format(filesMore ? 'filesCountPlus' : 'filesCount', { n: files }),
      ].filter(Boolean).join(' · ')
      return h('li', { className: 'md-chapter', 'data-open': open ? 'true' : undefined },
        h(KitButton, {
          type: 'button',
          className: 'md-row',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': open ? detailId : undefined,
          ref: node => props.registerRef(chapter.code, node),
          onClick: event => props.onClick(event, chapter),
        },
          h('span', { className: 'md-code' }, chapter.code),
          h('span', { className: 'md-ch-title' }, chapter.title === '' ? format('untitled', { code: chapter.code }) : chapter.title),
          counts === '' ? null : h('span', { className: 'md-session-count' }, counts),
          kindText === '' ? null : h('span', { className: 'md-kind' }, kindText),
          chapter.pages === '' ? null : h('span', { className: 'md-pages' }, format('pages', { range: chapter.pages })),
          lastPage === null || lastPage <= 1
            ? null
            : h('span', { className: 'md-last-page', title: format('lastPageHint') }, format('lastPageAt', { n: lastPage })),
          h('span', { className: 'md-chevron', 'aria-hidden': true })
        ),
        open ? h('div', { className: 'md-detail', id: detailId },
          chapter.file === '' ? null : h('div', { className: 'md-detail-line' },
            h('span', { className: 'md-detail-key' }, format('pdfLabel')),
            h('span', { className: 'md-detail-value' }, `${chapter.file}.pdf`),
            typeof chapter.pdfPath === 'string' && chapter.pdfPath !== ''
              ? h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small',
                title: chapter.pdfPath,
                onClick: () => props.onCopyPath(chapter.pdfPath),
              }, format('copyPath'))
              : null,
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small md-detail-open',
              onClick: () => props.onOpenPdf(chapter),
            }, format('openPdf'))
          ),
          translatedPdf === '' ? null : h('div', { className: 'md-detail-line' },
            h('span', { className: 'md-detail-key' }, format('translatedLabel')),
            h('span', { className: 'md-detail-value' }, translatedPdf),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small md-detail-open',
              onClick: () => props.onOpenPdf(chapter, 'translated'),
            }, format('openPdf')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              onClick: async () => {
                if (typeof window !== 'undefined' && typeof window.confirm === 'function'
                  && !window.confirm(format('translatedDeleteConfirm'))) return
                try {
                  await request('POST', 'trash-translated', { book: props.bookId, code: chapter.code, name: `${chapter.file}.pdf` })
                  setTranslatedPdf('')
                } catch (error) {
                  window.alert(error !== null && error !== undefined && error.message ? error.message : String(error))
                }
              },
            }, format('translatedDelete'))
          ),
          h('div', { className: 'md-detail-line md-attach-line' },
            h('span', { className: 'md-detail-key' }, format('attachLabel')),
            h(KitButton, {
              type: 'button', className: 'md-btn md-btn-small',
              disabled: attachBusy,
              title: format('attachHint'),
              onClick: () => { if (attachInput.current !== null) attachInput.current.click() },
            }, format('attachAdd')),
            attachments === null
              ? null
              : attachments.length === 0
                ? h('span', { className: 'md-shelf-sub' }, format('attachEmpty'))
                : attachments.map(item => h('span', { key: item.name, className: 'md-attach-item' },
                  h('a', {
                    className: 'md-attach-link',
                    href: attachmentUrl(item.name),
                    target: '_blank',
                    rel: 'noreferrer',
                    title: item.name,
                  }, item.name),
                  h('button', {
                    type: 'button', className: 'md-attach-del',
                    title: format('attachDelete'),
                    onClick: () => deleteAttachment(item.name),
                  }, '×')
                ))
          ),
          h('input', {
            ref: attachInput,
            type: 'file',
            accept: '.pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.ppt,.pptx',
            style: { display: 'none' },
            onChange: uploadAttachment,
          }),
          lastPage === null
            ? null
            : h('div', { className: 'md-detail-line' },
              h('span', { className: 'md-detail-key' }, format('lastPageLabel')),
              h('span', { className: 'md-detail-value' }, format('lastPageAt', { n: lastPage })),
              h(KitButton, {
                type: 'button', className: 'md-btn md-btn-small',
                title: format('lastPageHint'),
                onClick: () => props.onOpenPdf(chapter),
              }, format('lastPageResume'))
            ),
          h('div', {
            className: 'md-sessions-wrap',
            'data-collapsed': sessionsOpen ? 'false' : 'true',
          }, h(ChapterSessions, {
            bookId: props.bookId,
            onOpenQuestion: question => props.onOpenQuestion(chapter, question),
            open: sessionsOpen,
            onToggle: () => setSessionsOpen(value => !value),
            chapter,
            modes: sessionModesFor(typeof props.workflow === 'string' ? props.workflow : (props.mathMode === true ? 'math' : '')),
            groups: props.groups,
            creatingMode: props.creatingMode,
            loaded: props.loaded,
            available: props.available,
            error: props.createError,
            errorSession: props.errorSession,
            renaming: props.renaming,
            onNewSession: props.onNewSession,
            onOpenSession: props.onOpenSession,
            onArchiveSession: props.onArchiveSession,
            onRetryRename: props.onRetryRename,
            onDigest: props.onDigest,
            onImport: props.onImport,
            onUnlink: props.onUnlink,
            onStartRename: props.onStartRename,
            onRenameInput: props.onRenameInput,
            onCommitRename: props.onCommitRename,
            onCancelRename: props.onCancelRename,
          })),
          h(ChapterArtifacts, {
            bookId: props.bookId,
            bookTitle: props.bookTitle,
            chapter,
            code: chapter.code,
            sessionIndex: props.sessionIndex,
            canRender: props.canRender,
            mathMode: props.mathMode,
            onEnvRequired: props.onEnvRequired,
            onArtifactSession: props.onArtifactSession,
            allowNonPdfDelete: props.allowNonPdfDelete,
            onOpenSession: props.onOpenSession,
            state: props.artifacts,
            onOpen: item => props.onOpenArtifact(chapter, item),
            onRetry: props.onRetryArtifacts,
            onReload: props.onReloadArtifacts,
            onRender: (item, code) => props.onRenderArtifact(item, code),
            onPrint: (item, code) => props.onPrint(item, code),
            onTrashArtifact: (item, code) => props.onTrashArtifact(item, code),
            onCopyPath: props.onCopyPath,
            registerRef: props.registerFileRef,
          })
        ) : null
      )
    }

    /**
     * One book's chapter list.
     * @param {{ book: object, expanded: string[], sessionIndex: object, artifacts: object, counts: object, caches: object, onLoadCache: Function, onRebuildCache: Function, creatingKey: string, creatingMode: string, createError: object | null, onClickRow: Function, onOpenPdf: Function, onNewSession: Function, onOpenSession: Function, onRetryRename: Function, onOpenArtifact: Function, onRetryArtifacts: Function, onReloadArtifacts: Function, onCopyPath: Function, registerChapterRef: Function, registerFileRef: Function }} props - book, expanded codes, session and artifact state, handlers.
     * @returns {import('react').ReactElement} the book sheet.
     */
    function BookSheet(props) {
      const book = props.book
      const chapters = Array.isArray(book.chapters) ? book.chapters : []
      // A 300-chapter book used to mount every row (with its observers) at once.
      // Render a window and grow it when the sentinel comes near the viewport.
      const WINDOW = 40
      const [visible, setVisible] = useState(WINDOW)
      const sentinel = useRef(null)
      useEffect(() => { setVisible(WINDOW) }, [book.id])
      useEffect(() => {
        const node = sentinel.current
        if (node === null || typeof IntersectionObserver !== 'function' || visible >= chapters.length) return undefined
        const observer = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) {
            setVisible(count => Math.min(chapters.length, count + WINDOW))
          }
        }, { rootMargin: '600px 0px' })
        observer.observe(node)
        return () => observer.disconnect()
      }, [visible, chapters.length, book.id])
      const shown = chapters.slice(0, visible)
      const errorForChapter = chapter => props.createError !== null
        && props.createError.bookId === book.id
        && props.createError.code === chapter.code
        ? props.createError
        : null
      return h('div', { className: 'md-book' },
        h('div', { className: 'md-book-head' },
          h('h2', { className: 'md-book-title', tabIndex: -1, ref: props.headingRef }, book.title),
          h('div', { className: 'md-book-meta' },
            book.author === '' ? null : h('span', { className: 'md-book-author' }, book.author),
            h('span', { className: 'md-book-count' }, format('chapters', { n: chapters.length }))
          )
        ),
        chapters.length === 0
          ? h('div', { className: 'md-empty' }, h('div', { className: 'md-empty-title' }, format('bookEmpty')))
          : h('ul', { className: 'md-chapters' },
            shown.map(chapter => {
              const key = `${book.id}|${chapter.code}`
              const error = errorForChapter(chapter)
              return h(ChapterRow, {
                key: chapter.code,
                bookId: book.id,
                bookTitle: book.title,
                chapter,
                open: props.expanded.includes(chapter.code),
                groups: props.sessionIndex.byChapter.get(key),
                sessionIndex: props.sessionIndex,
                onArtifactSession: props.onArtifactSession,
                canRender: props.canRender,
                mathMode: props.mathMode,
                onEnvRequired: props.onEnvRequired,
                allowNonPdfDelete: props.allowNonPdfDelete,
                artifacts: props.artifacts[key],
                counts: props.counts,
                onOpenQuestion: props.onOpenQuestion,
                creatingMode: props.creatingKey === key ? props.creatingMode : '',
                createError: error === null ? '' : error.message,
                errorSession: error !== null && typeof error.sessionId === 'string' ? error.sessionId : null,
                loaded: props.sessionIndex.loaded,
                available: props.sessionAvailable,
                onClick: props.onClickRow,
                onOpenPdf: props.onOpenPdf,
                onNewSession: props.onNewSession,
                onOpenSession: props.onOpenSession,
                onArchiveSession: props.onArchiveSession,
                onRetryRename: props.onRetryRename,
                onDigest: props.onDigest,
                onOpenArtifact: props.onOpenArtifact,
                onRenderArtifact: props.onRenderArtifact,
                onTrashArtifact: props.onTrashArtifact,
                onPrint: props.onPrint,
                onRetryArtifacts: props.onRetryArtifacts,
                onReloadArtifacts: props.onReloadArtifacts,
                onCopyPath: props.onCopyPath,
                renaming: props.renaming === null || props.renaming === undefined
                  ? null
                  : props.renaming.bookId === book.id && props.renaming.code === chapter.code
                    ? props.renaming
                    : null,
                onImport: props.onImport,
                onUnlink: props.onUnlink,
                onStartRename: props.onStartRename,
                onRenameInput: props.onRenameInput,
                onCommitRename: props.onCommitRename,
                onCancelRename: props.onCancelRename,
                registerRef: props.registerChapterRef,
                registerFileRef: props.registerFileRef,
              })
            }),
            visible < chapters.length
              ? h('li', { key: '__more', className: 'md-chapters-more', ref: sentinel },
                h(KitButton, {
                  type: 'button',
                  className: 'md-btn md-btn-small',
                  onClick: () => setVisible(count => Math.min(chapters.length, count + WINDOW)),
                }, format('chaptersMore', { n: chapters.length - visible })))
              : null
          )
      )
    }

    /**
     * Footer diagnostics: how the catalog was obtained, what was skipped, where
     * sessions are created, the book-id legend, and titles that matched nothing.
     * @param {{ catalog: object, books: object[], unresolved: number }} props - catalog, rows, unmatched titles.
     * @returns {import('react').ReactElement} the footer.
     */
    function Diagnostics(props) {
      const catalog = props.catalog
      const lines = []
      lines.push(catalog.source === 'index.json' ? format('sourceIndex') : format('sourceScan'))
      if (catalog.indexIgnored) lines.push(format('indexIgnored'))
      lines.push(format('libraryAt', { dir: catalog.libraryDir }))
      if (typeof catalog.artifactDir === 'string' && catalog.artifactDir !== '') {
        lines.push(format('artifactAt', { dir: catalog.artifactDir }))
      }
      if (catalog.target.cwd !== '') lines.push(format('sessionTarget', { dir: catalog.target.cwd }))
      for (const book of props.books) {
        if (typeof book.unparsed === 'number' && book.unparsed > 0) {
          lines.push(format('bookUnparsed', { title: book.title, n: book.unparsed }))
        }
      }
      for (const item of catalog.skipped) lines.push(format('skipped', { dir: item.dir, n: item.pdfCount }))
      const legend = props.books
        .filter(book => book.id !== book.title)
        .map(book => `${book.id} = ${book.title}`)
        .join('；')
      if (legend !== '') lines.push(format('titleLegend', { pairs: legend }))
      for (const warning of catalog.warnings) lines.push(warning)
      if (props.unresolved > 0) lines.push(format('sessionUnresolved', { n: props.unresolved }))
      return h('div', { className: 'md-diag' },
        lines.map((line, index) => h('p', { key: index, className: 'md-diag-line' }, line))
      )
    }

    /* ----------------------------------------------------------------- css -- */

    const CSS = `
/* Excalidraw's hand-drawn text face (SIL OFL 1.1, see vendor/fonts/excalifont/OFL.txt).
   Served by the Host, split into the same unicode-range subsets as upstream. */
@font-face { font-family: 'Excalifont'; src: url('/pdfdesk/vendor/fonts/excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; unicode-range: U+20-7e,U+a0-a3,U+a5-a6,U+a8-ab,U+ad-b1,U+b4,U+b6-b8,U+ba-ff,U+131,U+152-153,U+2bc,U+2c6,U+2da,U+2dc,U+304,U+308,U+2013-2014,U+2018-201a,U+201c-201e,U+2020,U+2022,U+2024-2026,U+2030,U+2039-203a,U+20ac,U+2122,U+2212; }
@font-face { font-family: 'Excalifont'; src: url('/pdfdesk/vendor/fonts/excalifont/Excalifont-Regular-be310b9bcd4f1a43f571c46df7809174.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; unicode-range: U+100-130,U+132-137,U+139-149,U+14c-151,U+154-17e,U+192,U+1fc-1ff,U+218-21b,U+237,U+1e80-1e85,U+1ef2-1ef3,U+2113; }
@font-face { font-family: 'Excalifont'; src: url('/pdfdesk/vendor/fonts/excalifont/Excalifont-Regular-b9dcf9d2e50a1eaf42fc664b50a3fd0d.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; unicode-range: U+400-45f,U+490-491,U+2116; }
@font-face { font-family: 'Excalifont'; src: url('/pdfdesk/vendor/fonts/excalifont/Excalifont-Regular-41b173a47b57366892116a575a43e2b6.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; unicode-range: U+37e,U+384-38a,U+38c,U+38e-393,U+395-3a1,U+3a3-3a8,U+3aa-3cf,U+3d7; }
@font-face { font-family: 'Excalifont'; src: url('/pdfdesk/vendor/fonts/excalifont/Excalifont-Regular-3f2c5db56cc93c5a6873b1361d730c16.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; unicode-range: U+2c7,U+2d8-2d9,U+2db,U+2dd,U+302,U+306-307,U+30a-30c,U+326-328,U+212e,U+2211,U+fb01-fb02; }
@font-face { font-family: 'Excalifont'; src: url('/pdfdesk/vendor/fonts/excalifont/Excalifont-Regular-349fac6ca4700ffec595a7150a0d1e1d.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; unicode-range: U+462-463,U+472-475,U+4d8-4d9,U+4e2-4e3,U+4e6-4e9,U+4ee-4ef; }
@font-face { font-family: 'Excalifont'; src: url('/pdfdesk/vendor/fonts/excalifont/Excalifont-Regular-623ccf21b21ef6b3a0d87738f77eb071.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; unicode-range: U+300-301,U+303; }
.md-root { position: relative; flex: 1 1 auto; height: 100%; min-height: 0; display: flex; box-sizing: border-box; container-type: inline-size; container-name: pdfdesk; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); font-size: 14px; line-height: 1.5; }
.md-inner { height: 100%; width: 100%; max-width: 1040px; margin: 0 auto; padding: 0 clamp(18px, 4cqw, 40px); box-sizing: border-box; display: flex; flex-direction: column; min-width: 0; }
.md-head { flex: none; display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 28px 0 14px; }
.md-title { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: .01em; }
.md-subtitle { margin: 4px 0 0; font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.md-mode-pill { display: inline-flex; align-items: center; align-self: flex-start; margin-top: 6px; padding: 1px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; font-size: 11px; line-height: 18px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-1); }
.md-mode-pill[data-mode='math'] { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.md-workflow-base { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; }
.md-workflow-always { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.md-workflow-base .md-mode-pill { margin-top: 0; }
.md-workflow-card { display: flex; align-items: flex-start; gap: 9px; padding: 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; cursor: pointer; }
.md-workflow-card:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.md-workflow-dot { flex: 0 0 auto; width: 9px; height: 9px; margin-top: 4px; border-radius: 50%; background: var(--dsw-alias-label-secondary); opacity: .45; }
.md-workflow-dot[data-on='true'] { background: var(--dsw-alias-state-success-primary); opacity: 1; }
.md-workflow-text { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.md-workflow-text strong { font-size: 13px; color: var(--dsw-alias-label-primary); }
.md-env-backdrop { position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; padding: 20px; background: color-mix(in srgb, var(--dsw-static-neutral-bluish-1000) 28%, transparent); }
.md-env-dialog { width: min(380px, 100%); display: flex; flex-direction: column; gap: 12px; padding: 18px; border: .5px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1); box-shadow: var(--dsw-elevation-prominent); }
.md-env-title { margin: 0; font-size: 15px; }
.md-env-body { margin: 0; font-size: 13px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.md-env-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.md-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.md-modal-body { display: flex; flex-direction: column; gap: 12px; }
.md-modal-foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.md-workspace-dialog { width: min(520px, 100%); }
.md-workspace-list { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow: auto; }
.md-workspace-label { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.md-workspace-item { display: flex; flex-direction: column; gap: 3px; width: 100%; padding: 8px 10px; text-align: left; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); cursor: pointer; }
.md-workspace-item:hover { border-color: var(--dsw-alias-brand-primary); }
.md-workspace-item strong { font-size: 12.5px; }
.md-workspace-item span { font-size: 11.5px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; }
.md-workspace-new { display: flex; flex-direction: column; gap: 4px; }
.md-workspace-new .md-settings-input { width: 100%; box-sizing: border-box; }
.md-head-actions { display: flex; align-items: center; gap: 8px; }
.md-settings { position: relative; }
.md-settings-version { padding: 4px 8px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.md-settings-section { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l2); }
.md-settings-heading { margin: 0; font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.md-settings-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12.5px; }
.md-settings-input { flex: 1 1 auto; min-width: 0; font: inherit; font-size: 12px; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.md-kit-input { flex: 1 1 auto; min-width: 0; }
.md-kit-input input { font: inherit; }
.md-kit-select { position: relative; display: inline-flex; flex-direction: column; }
.md-kit-select-menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 20; min-width: 140px; padding: 4px; display: flex; flex-direction: column; gap: 2px; background: var(--dsw-alias-bg-layer-1); border: .5px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-md); box-shadow: var(--dsw-elevation-prominent); }
.md-kit-select-option { display: flex; align-items: center; min-height: 30px; padding: 0 8px; border: 0; border-radius: var(--dsw-radius-sm); background: transparent; color: var(--dsw-alias-label-primary); text-align: left; cursor: pointer; }
.md-kit-select-option:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.md-kit-select-option:disabled { opacity: .4; cursor: not-allowed; }
.md-settings-tabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 0 6px; }
.md-settings-body { display: flex; gap: 16px; align-items: flex-start; min-height: 240px; }
.md-settings-nav { display: flex; flex-direction: column; gap: 6px; flex: 0 0 116px; position: sticky; top: 0; }
.md-settings-nav .md-tab-btn { justify-content: flex-start; width: 100%; }
.md-settings-pane { flex: 1 1 auto; min-width: 0; max-height: min(64vh, 620px); overflow: auto; padding-right: 4px; }
@media (max-width: 640px) { .md-settings-body { flex-direction: column; } .md-settings-nav { flex-direction: row; flex-wrap: wrap; flex-basis: auto; position: static; } .md-settings-pane { max-height: none; } }
.md-tab-btn[data-on='true'] { background: var(--dsw-alias-interactive-bg-hover); border-color: var(--dsw-alias-brand-primary); font-weight: 600; }
.md-settings-note { margin: 0; font-size: 12px; color: var(--dsw-alias-brand-primary); }
.md-settings-actions { display: flex; gap: 8px; padding-top: 4px; }
.md-update-box { display: flex; flex-direction: column; gap: 6px; padding: 10px; border: .5px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1); }
.md-update-box .md-btn { align-self: flex-start; }
.md-settings-modal { width: min(720px, 92vw); max-height: 86vh; }
.md-settings-modal .md-modal-body { max-height: calc(86vh - 110px); overflow-y: auto; }
.md-settings-content { max-height: calc(86vh - 110px); overflow-y: auto; }
.md-settings-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 4px; }
.md-shortcut-list { display: flex; flex-direction: column; gap: 4px; }
.md-shortcut-row { gap: 8px; }
.md-shortcut-name { flex: 1 1 auto; min-width: 0; }
.md-shortcut-key { flex: 0 0 auto; min-width: 88px; padding: 2px 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; text-align: center; white-space: nowrap; }
.md-shortcut-row .md-btn { flex: 0 0 auto; }
.md-btn { font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 6px 12px; cursor: pointer; transition: background .12s ease, border-color .12s ease; }
.md-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); border-color: var(--dsw-alias-border-l3); }
.md-btn:disabled { opacity: .55; cursor: default; }
.md-btn-small { font-size: 12px; padding: 4px 10px; }
.md-btn { border-radius: 9px; }
.md-btn:active:not(:disabled) { transform: translateY(0.5px); }
.md-btn:focus-visible, .md-icon-btn:focus-visible, .md-rail-btn:focus-visible, .md-side-goto:focus-visible, .md-reader-page:focus-visible, .md-reader-lang:focus-visible { outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); outline-offset: 1px; }
.md-btn[aria-pressed="true"]:not(.md-btn-ghost) { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 38%, var(--dsw-alias-border-l2)); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, var(--dsw-alias-bg-layer-2)); }
.md-btn-ghost { background: transparent; border-color: transparent; }
.md-btn-ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); border-color: transparent; }
.md-crumbs { flex: none; display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--dsw-alias-label-secondary); padding-bottom: 14px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.md-crumb { font: inherit; font-size: 13px; color: var(--dsw-alias-label-secondary); background: none; border: 0; padding: 2px 4px; border-radius: 6px; cursor: pointer; }
.md-crumb:hover:not(:disabled) { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
.md-crumb-sep { opacity: .5; }
.md-crumb-current { color: var(--dsw-alias-label-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46ch; }
.md-notice { flex: none; margin-top: 12px; padding: 8px 12px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); font-size: 13px; }
.md-alert { flex: none; display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 8px 12px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, var(--dsw-alias-bg-base)); border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 34%, transparent); color: var(--dsw-alias-label-primary); font-size: 13px; }
.md-alert-text { flex: 1; min-width: 0; }
.md-hint { flex: none; margin-top: 12px; padding: 8px 12px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, var(--dsw-alias-bg-base)); border-left: 3px solid var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-label-secondary); font-size: 12.5px; }
.md-body { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 0 40px; scrollbar-width: thin; scrollbar-color: transparent transparent; scrollbar-gutter: stable; }
.md-body.md-scrolling { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--dsw-alias-border-l4) 55%, transparent) transparent; }
.md-body::-webkit-scrollbar { width: 8px; height: 8px; }
.md-body::-webkit-scrollbar-track { background: transparent; }
.md-body::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
.md-body.md-scrolling::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--dsw-alias-border-l3) 70%, transparent); }
.md-content { flex: 1 1 auto; min-height: 0; display: flex; align-items: stretch; }
.md-preview { flex: 0 0 clamp(300px, 42%, 560px); min-width: 0; min-height: 0; display: flex; flex-direction: column; margin: 12px 0 0; padding: 12px 0 24px 18px; border-left: 1px solid var(--dsw-alias-border-l2); }
.md-preview-backdrop { display: none; }
.md-preview:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.md-preview-head { flex: none; display: flex; align-items: flex-start; gap: 8px; padding-bottom: 10px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.md-preview-titles { flex: 1 1 auto; min-width: 0; }
.md-preview-name { font-size: 13px; line-height: 1.4; color: var(--dsw-alias-label-primary); word-break: break-all; }
.md-preview-context { margin-top: 2px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-preview-meta { margin-top: 2px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.md-preview-state { padding: 14px 0; font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.md-preview-notices { flex: none; display: flex; flex-wrap: wrap; gap: 6px; padding-top: 8px; }
.md-preview-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 6px; padding-top: 10px; overflow: auto; }
.md-preview-note { flex: none; font-size: 11px; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; padding: 1px 8px; background: var(--dsw-alias-bg-layer-2); }
.md-code-block { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; overflow-x: auto; }
.md-code-gutter { position: sticky; left: 0; flex: none; margin: 0; padding-right: 2px; background: var(--dsw-alias-bg-layer-2); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary); text-align: right; font-variant-numeric: tabular-nums; user-select: none; }
.md-code-text { flex: 1 1 auto; min-width: 0; margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-primary); white-space: pre; }
.md-artifacts { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; padding-top: 10px; border-top: 1px dashed var(--dsw-alias-border-l2); }
.md-artifacts-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-start; }
.md-artifacts-head .md-btn { margin-left: 0; }
.md-artifacts-head .md-btn:last-child { margin-left: auto; }
.md-artifacts-title { font-size: 12.5px; color: var(--dsw-alias-label-primary); }
.md-artifacts-empty { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.md-artifacts-empty .md-btn { align-self: flex-start; }
.md-path { align-self: flex-start; max-width: 100%; box-sizing: border-box; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--dsw-alias-label-primary); word-break: break-all; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; padding: 3px 6px; }
.md-file-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
.md-file { display: flex; align-items: center; gap: 10px; width: 100%; box-sizing: border-box; padding: 4px 6px; font: inherit; font-size: 12.5px; color: var(--dsw-alias-label-primary); text-align: left; background: none; border: 0; border-radius: 6px; cursor: pointer; }
.md-file:hover { background: var(--dsw-alias-interactive-bg-hover); }
.md-file-kind { flex: none; min-width: 34px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5px; letter-spacing: .03em; text-align: center; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l3); border-radius: 4px; padding: 0 4px; }
.md-file[data-kind="text"] .md-file-kind { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 34%, transparent); }
.md-file-name { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-artifact-modes { display: flex; gap: 6px; padding: 2px 0 4px 52px; }
.md-artifact-sessions { padding-left: 52px; }
.md-artifact-child { padding-left: 40px; }
.md-artifact-session-toggle { display: block; margin: 0 0 2px 52px; padding: 0; font: inherit; font-size: 11.5px; color: var(--dsw-alias-label-secondary); background: none; border: 0; cursor: pointer; }
.md-artifact-session-toggle:hover { color: var(--dsw-alias-label-primary); }
.md-file-meta { flex: none; font-size: 11.5px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.md-file-action { flex: none; font-size: 11.5px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l3); color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-base); cursor: pointer; }
.md-file-action:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l4); }
.md-print-modal { width: min(980px, 96vw); }
.md-print-content { display: flex; flex-direction: column; gap: 10px; }
.md-print-frame { width: 100%; height: min(70vh, 720px); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: #fff; }
.md-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 16px; }
.md-card { display: flex; flex-direction: column; gap: 10px; padding: 10px 10px 12px; text-align: left; font: inherit; color: inherit; background: transparent; border: 1px solid transparent; border-radius: 12px; cursor: pointer; transition: border-color .14s ease, background .14s ease, transform .14s ease; position: relative; }
.md-card-selected { border-color: var(--dsw-alias-brand-primary); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); }
.md-card-check { position: absolute; top: 14px; right: 14px; width: 22px; height: 22px; border-radius: 50%; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-foreground); display: flex; align-items: center; justify-content: center; font-size: 13px; line-height: 1; }
.md-shelf { position: relative; display: flex; flex-direction: column; gap: 16px; }
.md-shelf-head { display: flex; align-items: baseline; gap: 10px; }
.md-collection-row { display: flex; flex-wrap: wrap; gap: 16px; }
.md-collection { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 10px 10px 12px; text-align: left; font: inherit; color: inherit; background: transparent; border: 1px solid transparent; border-radius: 12px; cursor: pointer; }
.md-collection:hover { background: var(--dsw-alias-interactive-bg-hover); border-color: transparent; transform: translateY(-2px); }
.md-collection-stack { position: relative; display: block; aspect-ratio: 3 / 4; }
.md-collection-sheet { position: absolute; inset: 0; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-layer-2); }
.md-collection-sheet.md-sheet-1 { background: linear-gradient(160deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, var(--dsw-alias-bg-layer-2)), var(--dsw-alias-bg-layer-2) 72%); }
.md-collection-sheet.md-sheet-2 { transform: translate(-6px, 6px) rotate(-2deg); opacity: .8; }
.md-collection-sheet.md-sheet-3 { transform: translate(-12px, 12px) rotate(-4deg); opacity: .55; }
.md-collection-name { font-size: 13px; font-weight: 550; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md-collection-count { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.md-collection-title { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 14px; text-align: center; font-size: 15px; font-weight: 600; line-height: 1.4; color: var(--dsw-alias-label-primary); word-break: break-word; }
.md-marquee { position: absolute; z-index: 3; border: 1px solid var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); border-radius: 4px; pointer-events: none; }
.md-shelf-actions { position: sticky; bottom: 0; z-index: 4; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 10px; }
.md-shelf-selected { font-size: 12.5px; color: var(--dsw-alias-label-secondary); margin-right: 4px; }
.md-card:hover { background: var(--dsw-alias-interactive-bg-hover); border-color: transparent; transform: translateY(-2px); }
.md-card:active { transform: translateY(1px); }
.md-cover { position: relative; display: block; aspect-ratio: 3 / 4; border-radius: 8px; background: linear-gradient(160deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, var(--dsw-alias-bg-layer-2)), var(--dsw-alias-bg-layer-2) 72%); border: 1px solid var(--dsw-alias-border-l2); overflow: hidden; }
.md-cover-img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; }
.md-cover-rule { position: absolute; left: 12%; right: 12%; top: 14%; height: 1px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, transparent); }
.md-cover-mark { position: absolute; left: 12%; bottom: 10%; font-size: 34px; font-weight: 600; line-height: 1; color: var(--dsw-alias-brand-primary); opacity: .9; font-family: ui-serif, "Songti SC", "SimSun", serif; }
.md-card-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.md-card-title { font-size: 14px; font-weight: 550; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.md-card-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-shelf-head { display: flex; flex-direction: column; gap: 4px; }
.md-heading { margin: 0; font-size: 17px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.md-shelf-sub { margin: 0; font-size: 12.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.md-libraries { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: stretch; max-width: none; }
.md-libraries > .md-shelf-head, .md-libraries > .md-library-list, .md-libraries > .md-alert, .md-libraries > p, .md-libraries > .md-details, .md-libraries > .md-library-tools { grid-column: 1 / -1; }
.md-libraries > .md-shelf-head { grid-row: 1; }
.md-libraries > .md-library-list, .md-libraries > .md-alert, .md-libraries > p { grid-row: 2; grid-column: 1 / -1; }
.md-libraries > .md-library-add { grid-column: 1; grid-row: 3; }
.md-libraries > .md-library-toolcell { grid-column: 2; grid-row: 3; }
.md-libraries > .md-details { grid-row: 4; }
.md-library-toolcell { position: relative; height: 100%; }
.md-library-toolscroll { position: absolute; inset: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 14px; background: var(--dsw-alias-bg-layer-2); scrollbar-width: thin; scrollbar-color: transparent transparent; }
.md-library-toolscroll::-webkit-scrollbar { width: 6px; }
.md-library-toolscroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px; }
.md-library-toolscroll.md-scrolling { scrollbar-color: var(--dsw-alias-border-l4) transparent; }
.md-library-toolscroll.md-scrolling::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l4); }
.md-library-toolscroll:hover { scrollbar-color: var(--dsw-alias-border-l4) transparent; }
.md-library-toolscroll:hover::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l4); }
.md-tool-card { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 14px; background: var(--dsw-alias-bg-layer-2); }
.md-libraries > .md-library-samples { grid-column: 2; }
.md-library-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.md-library { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 14px; background: var(--dsw-alias-bg-layer-2); cursor: pointer; transition: background .15s ease, border-color .15s ease, box-shadow .15s ease; }
.md-library:hover { background: var(--dsw-alias-interactive-bg-hover); }
.md-library-active { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, var(--dsw-alias-border-l3)); box-shadow: inset 3px 0 0 var(--dsw-alias-brand-primary); }
.md-library-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.md-library-name { font-size: 16px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.md-libraries .md-path { font-size: 12.5px; }
.md-libraries .md-shelf-sub { font-size: 13.5px; line-height: 1.65; }
.md-badge { font-size: 11px; line-height: 1.6; padding: 0 7px; border-radius: 999px; color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 13%, transparent); border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 30%, transparent); }
.md-badge-quiet { color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l3); }
.md-library-actions { display: flex; gap: 8px; justify-content: flex-end; }
.md-library-actions .md-icon-btn { font-size: 18px; line-height: 1.2; padding: 0 8px; }
.md-subheading { margin: 0; font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.md-library-form { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.md-field { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); flex: 1 1 200px; min-width: 0; }
.md-input { font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 7px; padding: 6px 8px; }
.md-input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.md-library-manual { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1px dashed var(--dsw-alias-border-l3); border-radius: 10px; }
.md-details { padding: 12px 16px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 14px; background: var(--dsw-alias-bg-layer-2); }
.md-details-summary { cursor: pointer; font-size: 13px; font-weight: 550; color: var(--dsw-alias-label-primary); }
.md-details[open] .md-details-summary { margin-bottom: 6px; }
.md-library-samples { display: flex; flex-direction: column; gap: 8px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 14px; background: var(--dsw-alias-bg-layer-2); }
.md-manual-path { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.md-manual-label { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.md-library-tools { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.md-library-add { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 14px; background: var(--dsw-alias-bg-layer-2); }
/* Library landing: generous whitespace, a pixel whale in the hero, and a sticky
   action bar that only appears once the hero has scrolled away. */
.md-home { position: relative; display: flex; flex-direction: column; gap: 0; max-width: 1120px; margin: 0 auto; padding: 0 28px 72px; box-sizing: border-box; }
.md-home > .md-shelf-head { order: 2; margin: 4px 0 18px; }
.md-home > .md-library-list, .md-home > .md-alert, .md-home > p { order: 3; }
.md-home > .md-library-add { order: 4; margin-top: 32px; }
.md-home > .md-home-tools-head { order: 5; margin-top: 44px; }
.md-home > .md-library-toolcell { order: 5; }
.md-home > .md-details { order: 7; margin-top: 48px; }
.md-home-toolbar { position: sticky; top: 0; z-index: 20; height: 48px; box-sizing: border-box; margin: 0 -28px -48px; padding: 0 28px; display: flex; align-items: center; gap: 8px; opacity: 0; visibility: hidden; transform: translateY(-6px); pointer-events: none; transition: opacity .18s ease, transform .18s ease, background .18s ease, visibility .18s; background: color-mix(in srgb, var(--dsw-alias-bg-base) 86%, transparent); backdrop-filter: blur(14px); border-bottom: 1px solid transparent; }
.md-home-toolbar.is-stuck { opacity: 1; visibility: visible; transform: none; pointer-events: auto; border-bottom-color: var(--dsw-alias-border-l2); }
.md-home-toolbar-count { margin-left: auto; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.md-hero { position: relative; order: 0; padding: 68px 0 8px; max-width: 740px; }
.md-hero-eyebrow { margin: 0; font-size: 11px; font-weight: 650; letter-spacing: .14em; text-transform: uppercase; color: var(--dsw-alias-brand-primary); }
.md-hero-title { margin: 16px 0 18px; font-size: 40px; line-height: 1.12; letter-spacing: -.035em; font-weight: 650; color: var(--dsw-alias-label-primary); }
.md-hero-lead { margin: 0; max-width: 560px; font-size: 15px; line-height: 1.85; color: var(--dsw-alias-label-secondary); }
.md-hero-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 30px; }
.md-hero-meta { margin: 22px 0 0; font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.md-hero-whale { position: absolute; top: 30px; right: 12px; width: 340px; height: auto; color: var(--dsw-alias-brand-primary); opacity: .1; pointer-events: none; animation: md-whale 16s ease-in-out infinite alternate; }
@keyframes md-whale { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(-20px, 10px, 0); } }
.md-btn-primary { color: var(--dsw-alias-label-primary-foreground); background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.md-btn-primary:hover { filter: brightness(1.06); }
.md-home .md-shelf-head .md-heading { font-size: 18px; }
.md-home .md-library-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.md-home .md-library-list:empty { display: none; }
.md-home .md-library { position: relative; padding: 20px 22px 18px; border-radius: 16px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
.md-home .md-library:hover { transform: translateY(-1px); border-color: var(--dsw-alias-border-l4); box-shadow: var(--dsw-elevation-soft); }
.md-home .md-library-active { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, var(--dsw-alias-bg-layer-2)); }
.md-home .md-library-name { font-size: 15.5px; font-weight: 600; letter-spacing: -.01em; }
.md-home .md-library .md-path { margin-top: 10px; font-size: 12px; }
.md-home .md-library-actions { position: absolute; top: 14px; right: 14px; opacity: 0; transition: opacity .16s ease; }
.md-home .md-library:hover .md-library-actions, .md-home .md-library:focus-within .md-library-actions { opacity: 1; }
.md-home .md-library-add { max-width: none; width: 100%; box-sizing: border-box; padding: 14px 16px; border-radius: 16px; gap: 10px; background: transparent; border: 1px solid var(--dsw-alias-border-l2); }
.md-add-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.md-add-head .md-subheading { margin: 0; font-size: 14px; font-weight: 600; }
.md-add-head .md-shelf-sub { font-size: 11.5px; }
.md-add-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.md-add-row .md-input { height: 34px; box-sizing: border-box; font-size: 12.5px; }
.md-add-path { flex: 1 1 320px; min-width: 200px; }
.md-add-name { flex: 0 1 150px; width: 150px; }
.md-add-row .md-btn { height: 34px; }
.md-add-submit { margin-left: auto; }
.md-home-tools-head { display: flex; flex-direction: column; gap: 4px; }
.md-home .md-library-toolcell { position: static; height: auto; }
.md-home .md-library-toolscroll { position: static; display: flex; flex-direction: row; gap: 14px; overflow-x: auto; overflow-y: hidden; padding: 2px 2px 16px; scroll-snap-type: x mandatory; scrollbar-width: thin; scrollbar-color: transparent transparent; }
.md-home .md-library-toolscroll::-webkit-scrollbar { height: 8px; background: transparent; }
.md-home .md-library-toolscroll::-webkit-scrollbar-track { background: transparent; border-radius: 4px; }
.md-home .md-library-toolscroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
.md-home .md-library-toolscroll.md-scrolling { scrollbar-color: color-mix(in srgb, var(--dsw-alias-border-l4) 55%, transparent) transparent; }
.md-home .md-library-toolscroll.md-scrolling::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--dsw-alias-border-l3) 70%, transparent); }
.md-home .md-library-toolscroll:hover { scrollbar-color: color-mix(in srgb, var(--dsw-alias-border-l4) 55%, transparent) transparent; }
.md-home .md-library-toolscroll:hover::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--dsw-alias-border-l3) 70%, transparent); }
.md-home .md-library-toolscroll > .md-subheading { display: none; }
.md-home .md-tool-card { flex: 0 0 300px; scroll-snap-align: start; display: flex; flex-direction: column; gap: 8px; padding: 18px 20px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 16px; background: var(--dsw-alias-bg-layer-2); }
.md-home .md-tool-card .md-btn { align-self: flex-start; margin-top: auto; }
.md-home .md-manual { border-radius: 18px; padding: 0; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2); background: transparent; }
.md-manual-summary { list-style: none; display: flex; align-items: center; gap: 16px; padding: 18px 22px; cursor: pointer; }
.md-manual-summary::-webkit-details-marker { display: none; }
.md-manual-summary-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.md-manual-title { font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.md-manual-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.md-manual-chevron { margin-left: auto; font-size: 16px; line-height: 1; color: var(--dsw-alias-label-secondary); transition: transform .18s ease; }
.md-manual[open] .md-manual-chevron { transform: rotate(180deg); }
.md-manual-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 40px; padding: 18px 22px 26px; border-top: 1px solid var(--dsw-alias-border-l2); }
.md-manual-group { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.md-manual-body { display: flex; flex-direction: column; gap: 24px; padding: 20px 22px 28px; border-top: 1px solid var(--dsw-alias-border-l2); max-width: 880px; }
.md-manual-lead { margin: 0; font-size: 14px; line-height: 1.85; color: var(--dsw-alias-label-primary); }
.md-manual-steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; counter-reset: mdstep; }
.md-manual-steps li { position: relative; padding-left: 34px; font-size: 14px; line-height: 1.75; color: var(--dsw-alias-label-secondary); }
.md-manual-steps li::before { counter-increment: mdstep; content: counter(mdstep); position: absolute; left: 0; top: 3px; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 650; color: var(--dsw-alias-label-primary-foreground); background: var(--dsw-alias-brand-primary); }
.md-manual-block { display: flex; flex-direction: column; gap: 10px; padding-top: 22px; border-top: 1px solid var(--dsw-alias-border-l2); }
.md-manual-heading { margin: 0; font-size: 13px; font-weight: 600; letter-spacing: .01em; color: var(--dsw-alias-label-primary); }
.md-manual-text { margin: 0; font-size: 13.5px; line-height: 1.8; color: var(--dsw-alias-label-secondary); }
.md-manual-list { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; line-height: 1.8; color: var(--dsw-alias-label-secondary); }
.md-manual-tree { margin: 0; padding: 14px 16px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; overflow: auto; white-space: pre; }
.md-manual-sub { margin-top: 4px; padding: 10px 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; }
.md-manual-sub-summary { cursor: pointer; font-size: 12.5px; font-weight: 550; color: var(--dsw-alias-label-primary); }
.md-manual-sub[open] .md-manual-sub-summary { margin-bottom: 8px; }
.md-manual-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.md-manual-code { display: block; max-height: 130px; overflow: auto; margin: 0; padding: 10px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; line-height: 1.6; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; white-space: pre-wrap; word-break: break-all; }
.md-manual-path { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.md-book-head { display: flex; flex-direction: column; gap: 6px; padding: 4px 4px 16px; }
.md-book-title { margin: 0; font-size: 18px; font-weight: 600; }
.md-book-title:focus-visible { outline-offset: 4px; }
.md-book-meta { display: flex; gap: 10px; font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.md-chapters { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--dsw-alias-border-l2); }
.md-chapters-more { display: flex; justify-content: center; padding: 10px 0; }
.md-chapter { border-bottom: 1px solid var(--dsw-alias-border-l2); }
.md-row { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto auto auto 18px; align-items: center; gap: 10px; width: 100%; box-sizing: border-box; padding: 11px 8px; font: inherit; color: inherit; text-align: left; background: none; border: 0; border-radius: 8px; cursor: pointer; transition: background .15s ease, transform .12s ease; }
.md-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.md-row:active { transform: scale(.998); }
.md-detail { animation: md-detail-in .16s ease-out; }
@keyframes md-detail-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.md-code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--dsw-alias-label-secondary); letter-spacing: .02em; }
.md-ch-title { font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-session-count { font-size: 11.5px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.md-kind { font-size: 11px; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l3); border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
.md-pages { font-size: 11.5px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.md-last-page { font-size: 11.5px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.md-chevron { position: relative; width: 18px; height: 18px; }
.md-chevron::before { content: ""; position: absolute; top: 50%; left: 40%; width: 6px; height: 6px; border-right: 1.5px solid var(--dsw-alias-label-secondary); border-bottom: 1.5px solid var(--dsw-alias-label-secondary); transform: translate(0, -50%) rotate(-45deg); transition: transform .16s ease; }
.md-chapter[data-open="true"] .md-chevron::before { transform: translate(0, -50%) rotate(45deg); }
.md-detail { display: flex; flex-direction: column; gap: 8px; padding: 2px 8px 16px 70px; font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.md-tips { margin-top: 22px; }
.md-tips-line { font-size: 13px; line-height: 1.7; color: var(--dsw-alias-label-secondary); }
.md-detail-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.md-attach-item { display: inline-flex; align-items: center; gap: 4px; max-width: 46%; }
.md-attach-link { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-brand-primary, #2f6df6); text-decoration: none; }
.md-attach-link:hover { text-decoration: underline; }
.md-attach-del { border: none; background: transparent; color: var(--dsw-alias-label-tertiary, #888); cursor: pointer; font-size: 14px; line-height: 1; padding: 2px 4px; }
.md-attach-del:hover { color: var(--dsw-alias-state-warning-primary, #d9534f); }
.md-detail-open { margin-left: auto; }
.md-detail-key { color: var(--dsw-alias-label-secondary); }
.md-detail-value { color: var(--dsw-alias-label-primary); word-break: break-all; }
.md-detail-actions { display: flex; gap: 8px; }
.md-section-bar { display: flex; align-items: center; gap: 12px; }
.md-detail-empty { color: var(--dsw-alias-label-secondary); }
.md-sessions { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; padding-top: 10px; border-top: 1px dashed var(--dsw-alias-border-l2); }
.md-sessions-head { display: flex; align-items: center; justify-content: flex-start; gap: 10px; flex-wrap: wrap; }
.md-session-digest { margin-left: auto; }
.md-sessions-wrap[data-collapsed="true"] .md-session-group { display: none; }
.md-sessions-title { font-size: 12.5px; color: var(--dsw-alias-label-primary); }
.md-session-state { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.md-session-group { display: flex; flex-direction: column; gap: 2px; }
.md-session-group-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.md-session-mode { flex: none; min-width: 44px; white-space: nowrap; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.md-session-new { padding: 2px 8px; font-size: 11.5px; }
.md-session-list { list-style: none; margin: 0; padding: 0 0 0 52px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.md-session-row { display: flex; align-items: center; gap: 2px; min-width: 0; border-radius: 6px; }
.md-session-row:hover, .md-session-row:focus-within { background: var(--dsw-alias-interactive-bg-hover); }
.md-session { display: flex; align-items: center; gap: 8px; flex: 1 1 auto; min-width: 0; font: inherit; font-size: 12.5px; color: var(--dsw-alias-label-primary); text-align: left; background: none; border: 0; border-radius: 6px; padding: 3px 6px; cursor: pointer; }
.md-session-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-session-link { flex: none; font-size: 10.5px; line-height: 1.3; color: var(--dsw-alias-brand-primary); border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 34%, transparent); border-radius: 4px; padding: 0 4px; }
.md-session-actions { flex: none; display: flex; gap: 2px; padding-right: 4px; opacity: 0; transition: opacity .1s ease; }
.md-session-row:hover .md-session-actions, .md-session-row:focus-within .md-session-actions { opacity: 1; }
.md-icon-btn { font: inherit; font-size: 12px; line-height: 1.4; color: var(--dsw-alias-label-secondary); background: none; border: 0; border-radius: 4px; padding: 1px 5px; cursor: pointer; }
.md-icon-btn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
.md-icon-btn-text { font-size: 11px; }
.md-session-edit { flex: 1 1 auto; display: flex; align-items: center; gap: 6px; min-width: 0; padding: 2px 4px; }
.md-session-input { flex: 1 1 auto; min-width: 0; font: inherit; font-size: 12.5px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 6px; padding: 2px 6px; }
.md-session-edit-error { flex: none; font-size: 11.5px; color: var(--dsw-alias-state-error-primary); }
.md-picker-backdrop { position: absolute; inset: 0; z-index: 8; background: color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent); }
.md-picker { position: absolute; z-index: 9; left: 50%; top: 10%; transform: translateX(-50%); width: min(600px, 94%); max-height: 74%; display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; padding: 16px 16px 12px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l3); border-radius: 12px; }
.md-picker-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.md-picker-title { font-size: 14px; font-weight: 550; }
.md-picker-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.md-picker-search { font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 8px; padding: 6px 10px; }
.md-picker-list { list-style: none; margin: 0; padding: 0; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
.md-picker-row { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; font: inherit; font-size: 12.5px; text-align: left; color: var(--dsw-alias-label-primary); background: none; border: 0; border-radius: 6px; padding: 5px 6px; cursor: pointer; }
.md-picker-row:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.md-picker-row:disabled { opacity: .55; cursor: default; }
.md-picker-name { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-picker-flag { flex: none; font-size: 10.5px; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; padding: 0 6px; }
.md-picker-time { flex: none; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.md-picker-note { flex: none; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.md-picker-empty { padding: 24px 4px; font-size: 13px; color: var(--dsw-alias-label-secondary); }
.md-digest { width: min(760px, 94%); }
.md-digest-text { flex: 1 1 auto; min-height: 0; overflow: auto; margin: 0; padding: 12px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.55; color: var(--dsw-alias-label-primary); }
.md-digest-actions { flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.md-refs-row { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
.md-refs-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.md-refs-select { font: inherit; font-size: 12.5px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 6px; padding: 4px 6px; min-width: 160px; max-width: 100%; }
.md-refs-item { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 4px 6px; border-radius: 6px; }
.md-refs-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.md-refs-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; color: var(--dsw-alias-label-primary); }
.md-refs-actions { display: flex; justify-content: flex-end; }
.md-reader { position: absolute; inset: 0; z-index: 10; display: flex; flex-direction: column; background: var(--dsw-alias-bg-base); }
.md-reader-bar { flex: none; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.md-reader-titles { display: flex; flex-direction: column; gap: 2px; flex: 1 1 220px; min-width: 0; }
.md-reader-name { font-size: 13.5px; font-weight: 550; color: var(--dsw-alias-label-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-reader-sub { font-size: 11.5px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-reader-tools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.md-reader-tools .md-btn { white-space: nowrap; flex: 0 0 auto; }
.md-reader-pager { display: inline-flex; align-items: center; gap: 1px; padding: 2px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.md-reader-pager .md-btn { border: 0; background: transparent; height: 26px; min-width: 26px; padding: 0 6px; border-radius: 7px; color: var(--dsw-alias-label-secondary); box-shadow: none; }
.md-reader-pager .md-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.md-reader-pager .md-reader-page { width: 46px; height: 26px; border: 0; background: transparent; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
.md-reader-pager .md-reader-page:hover, .md-reader-pager .md-reader-page:focus { background: var(--dsw-alias-bg-layer-2); }
.md-reader-of { padding-right: 6px; font-size: 11px; }
.md-reader-page { width: 64px; font: inherit; font-size: 12.5px; text-align: center; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 6px; padding: 3px 6px; }
.md-reader-of { font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.md-reader-scale { min-width: 40px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); text-align: right; font-variant-numeric: tabular-nums; }
.md-reader-sep { width: 1px; height: 18px; background: var(--dsw-alias-border-l2); }
.md-reader-stage { position: relative; flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; align-items: flex-start; justify-content: safe center; padding: 20px 24px 32px; }
/* The stage scrolls; this frame does not. The pointer layer lives here so it
   always covers what is on screen, at any scroll offset. */
.md-reader-stage-host { position: relative; flex: 1 1 auto; min-height: 0; display: flex; overflow: hidden; }
.md-reader-stage-host > .md-reader-stage { flex: 1 1 auto; min-height: 0; }
.md-reader-stage[data-mode="continuous"] { flex-direction: column; align-items: flex-start; justify-content: flex-start; }
.md-reader-continuous { width: max-content; min-width: 100%; }
/* The single page rides on the shared annotation plane: the hand tool (or a
   held space) pans it, and a stage-sized capture layer takes the pointer while
   a mark tool is picked so a stroke may continue outside the page. */
/* The hand moves the page, so the stage must not also scroll under it: a
   transformed page would otherwise add scrollbars at the plane's edges. */
.md-reader-stage[data-grab="true"], .md-reader-stage[data-panned="true"] { overflow: hidden; }
.md-reader-stage[data-grab="true"] { cursor: grab; }
.md-reader-stage[data-grab="true"]:active { cursor: grabbing; }
.md-reader-stage[data-panning="true"] { cursor: grabbing; }
.md-canvas-capture { position: absolute; inset: 0; z-index: 20; touch-action: none; }
/* The stage-sized layer sits above the page, so it has to show the tool's own
   cursor or picking a pen would look like nothing happened. */
.md-canvas-capture[data-tool="pen"], .md-canvas-capture[data-tool="text"] { cursor: crosshair; }
.md-canvas-capture[data-tool="line"], .md-canvas-capture[data-tool="arrow"], .md-canvas-capture[data-tool="rect"], .md-canvas-capture[data-tool="diamond"], .md-canvas-capture[data-tool="ellipse"] { cursor: crosshair; }
.md-canvas-capture[data-tool="erase"] { cursor: cell; }
.md-canvas-capture[data-tool="select"] { cursor: default; }
.md-hand-capture { cursor: grab; }
.md-hand-capture:active { cursor: grabbing; }
.md-annot[data-extended="true"] .md-annot-ink { overflow: visible; }
.md-annot-static { pointer-events: none; }
.md-canvas-hint { font-size: 11.5px; line-height: 1.4; color: var(--dsw-alias-label-secondary); }
.md-reader-single { position: relative; display: flex; justify-content: safe center; flex: 0 0 auto; width: max-content; margin: 0 auto; }
/* The neighbours sit on the plane above and below the page, so the page keeps
   the stage's own centring and does not shift when they mount. */
.md-reader-neighbour { position: absolute; left: 50%; transform: translateX(-50%); }
.md-reader-neighbour-before { bottom: calc(100% + 24px); }
.md-reader-neighbour-after { top: calc(100% + 24px); }
/* Blank paper at the plane's top and bottom edges in continuous mode. */
.md-reader-plane-pad { flex: 0 0 auto; width: 100%; }
/* The edge of the plane: where the hand and the pen stop. Each edge carries a
   small "+" square, so adding a page is a gesture on the paper itself. */
.md-plane-bounds { position: absolute; z-index: 30; pointer-events: none; border: 1px dashed color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent); border-radius: 4px; }
.md-plane-add { position: absolute; width: 18px; height: 18px; min-width: 18px; padding: 0; display: inline-flex; align-items: center; justify-content: center; font: inherit; font-size: 13px; line-height: 1; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-base); border: 1px dashed color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent); border-radius: 4px; box-shadow: var(--dsw-elevation-soft); cursor: pointer; pointer-events: auto; opacity: .8; }
.md-plane-add:hover { opacity: 1; color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.md-reader-note { padding: 6px 10px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
/* The "已生成 …pdf（共 N tokens）" line is reference noise and used to steal a
   row from the page. It now takes no layout height at all: the note floats as an
   overlay above the top of the stage and only fades in while the reader bar, the
   tool row, or the note itself is hovered. Reading area stays maximal. */
.md-reader-note-reveal { position: relative; height: 0; z-index: 3; }
.md-reader-note-reveal > .md-reader-note {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 94%, transparent);
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
  transition: opacity .18s ease, transform .18s ease;
}
.md-reader-bar:hover ~ .md-reader-note-reveal > .md-reader-note,
.md-reader-subbar:hover ~ .md-reader-note-reveal > .md-reader-note,
.md-reader-note-reveal:hover > .md-reader-note {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.md-reader-lang-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.md-reader-lang { font: inherit; font-size: 12px; padding: 2px 4px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.md-reader-single-page { position: relative; display: inline-block; line-height: 0; }
.md-overlay-layer { position: absolute; inset: 0; z-index: 4; cursor: crosshair; }
.md-mask-page-image { display: block; }
.md-annot { position: absolute; inset: 0; z-index: 6; pointer-events: none; touch-action: none; overflow: visible; }
.md-annot-readonly { overflow: visible; }
.md-marquee { position: absolute; z-index: 7; border: 1px dashed color-mix(in srgb, var(--dsw-alias-brand-primary) 70%, transparent); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent); border-radius: 2px; pointer-events: none; }
.md-marquee-group { border-style: solid; border-width: 1.5px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
.md-selection-outline { position: absolute; z-index: 7; border: 1.5px dashed color-mix(in srgb, var(--dsw-alias-brand-primary) 85%, transparent); border-radius: 3px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent); pointer-events: none; }
.md-plane-bounds[data-compact="true"] { border-color: transparent; }
.md-annot[data-tool="pen"], .md-annot[data-tool="erase"], .md-annot[data-tool="text"] { pointer-events: auto; }
.md-annot[data-tool="line"], .md-annot[data-tool="arrow"], .md-annot[data-tool="rect"], .md-annot[data-tool="diamond"], .md-annot[data-tool="ellipse"] { pointer-events: auto; cursor: crosshair; }
.md-annot[data-tool="select"] { pointer-events: auto; cursor: default; }
/* Question marks: a thin border on the page, the name only while hovered. The
   layer is inert unless the question (or select) tool is picked, so drawing
   behind a mark stays possible. */
.md-questions { position: absolute; inset: 0; z-index: 7; pointer-events: none; touch-action: none; }
/* The mark tool owns the page while it is picked: the layer itself must take
   the pointer, otherwise a drag-to-create can never start on empty paper. */
.md-questions[data-active="true"] { pointer-events: auto; cursor: crosshair; }
.md-question { position: absolute; box-sizing: border-box; border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 70%, transparent); border-radius: 2px; pointer-events: none; }
.md-questions[data-active="true"] .md-question { pointer-events: auto; cursor: move; }
.md-questions[data-reading="true"] .md-question { pointer-events: auto; touch-action: pan-y; cursor: default; }
.md-question[data-flash="true"] { border-width: 2px; animation: md-question-flash 1.8s ease-out; }
@keyframes md-question-flash { 0% { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, transparent); } 100% { background: transparent; } }
.md-question-name { position: absolute; left: -1px; bottom: 100%; transform: translateY(-3px); max-width: 240px; padding: 1px 6px; font-size: 11px; line-height: 1.45; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 4px; box-shadow: var(--dsw-elevation-soft); opacity: 0; transition: opacity .12s ease; pointer-events: auto; }
.md-question:hover .md-question-name, .md-question[data-flash="true"] .md-question-name, .md-question:focus-within .md-question-name { opacity: 1; }
.md-question-handle { position: absolute; width: 9px; height: 9px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-brand-primary); border-radius: 2px; opacity: 0; pointer-events: auto; z-index: 2; }
.md-questions[data-active="true"] .md-question:hover .md-question-handle, .md-questions[data-active="true"] .md-question[data-flash="true"] .md-question-handle { opacity: 1; }
.md-question-nw { left: -5px; top: -5px; cursor: nwse-resize; }
.md-question-ne { right: -5px; top: -5px; cursor: nesw-resize; }
.md-question-sw { left: -5px; bottom: -5px; cursor: nesw-resize; }
.md-question-se { right: -5px; bottom: -5px; cursor: nwse-resize; }
.md-question-draft { border-style: dashed; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); pointer-events: none; }
/* The rename field paints its own surface. The adapter's wrapper is only
   opaque while the host primitives bundle is in use, so the field must not
   depend on it: this wrapper supplies the background in both UI modes, and the
   adapter's own box is flattened inside it so exactly one surface shows. */
.md-question-input { position: absolute; top: -2px; left: -1px; min-width: 130px; z-index: 3; pointer-events: auto; padding: 2px 7px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 6px; }
.md-question-input:focus-within { border-color: var(--dsw-alias-brand-primary); }
.md-question-input .md-kit-input { display: block; height: auto; padding: 0; background: transparent; border: 0; border-radius: 0; }
.md-question-input input { box-sizing: border-box; width: 100%; min-width: 130px; padding: 0; background: transparent; color: var(--dsw-alias-label-primary); border: 0; outline: none; font: inherit; font-size: 12px; line-height: 18px; }
.md-questions[data-active="true"] .md-question-name { cursor: text; }
.md-question-jump { min-width: 240px; max-width: min(420px, 56vw); }
.md-question-jump .md-btn { min-width: 240px; max-width: min(420px, 56vw); justify-content: flex-start; text-align: left; overflow: hidden; text-overflow: ellipsis; }
.md-annot-text.md-annot-selected { outline: none; border-radius: 0; }
.md-annot-text.md-annot-selected { cursor: move; }
/* The vertical tool rail: collected PDF tools, revealed only while the pointer
   is on the page edge, with a short fade/slide so it does not pop. */
.md-rail-wrap { position: absolute; top: 0; bottom: 0; z-index: 40; width: 30px; display: flex; align-items: center; justify-content: center; pointer-events: auto; }
.md-rail-tab { position: absolute; top: 50%; transform: translateY(-50%); width: 18px; height: 58px; border-radius: 6px 0 0 6px; display: flex; align-items: center; justify-content: center; font-size: 15px; line-height: 1; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-right: none; box-shadow: var(--dsw-elevation-soft); opacity: .9; z-index: 39; pointer-events: none; transition: opacity .18s ease; }
.md-rail-tab[data-side="right"] { right: 0; }
.md-rail-tab[data-side="left"] { left: 0; border-radius: 0 6px 6px 0; border-right: 1px solid var(--dsw-alias-border-l3); border-left: none; }
.md-rail-wrap[data-side="right"] { right: 0; }
.md-rail-wrap[data-side="left"] { left: 0; }
.md-rail { display: flex; flex-direction: column; gap: 4px; padding: 6px 4px; max-height: 78vh; overflow-y: auto; background: color-mix(in srgb, var(--dsw-alias-bg-base) 92%, transparent); border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; box-shadow: var(--dsw-elevation-prominent); opacity: 0; transform: translateX(10px); transition: opacity .18s ease, transform .18s ease; pointer-events: none; }
.md-rail-wrap[data-side="left"] .md-rail { transform: translateX(-10px); }
.md-rail-wrap:hover .md-rail, .md-rail:hover, .md-rail:focus-within, .md-rail[data-open="true"] { opacity: 1; transform: none; pointer-events: auto; }
.md-rail-btn { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.md-rail-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.md-rail-btn { width: 34px; height: 34px; border-radius: 10px; transition: background .15s ease, color .15s ease, box-shadow .15s ease; }
.md-rail-btn[aria-pressed="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent); color: var(--dsw-alias-brand-primary); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-brand-primary) 32%, transparent); }
.md-rail-btn:hover { box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l3); }
.md-rail-btn:disabled { opacity: .35; cursor: default; }
.md-rail-sep { height: 1px; margin: 3px 4px; background: var(--dsw-alias-border-l2); }
.md-selection-panel { position: absolute; z-index: 30; width: min(280px, 86vw); display: flex; flex-direction: column; gap: 8px; padding: 10px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 10px; box-shadow: var(--dsw-elevation-prominent); }
.md-selection-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 550; color: var(--dsw-alias-label-primary); cursor: grab; user-select: none; touch-action: none; }
.md-selection-head:active { cursor: grabbing; }
.md-selection-close { cursor: pointer; }
.md-selection-delete { align-self: flex-start; color: var(--dsw-alias-state-error-primary); }
.md-selection-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.md-reader[data-rail="right"] .md-reader-stage { padding-right: 58px; }
.md-reader[data-rail="left"] .md-reader-stage { padding-left: 58px; }
.md-rail-panel { position: absolute; top: 50%; transform: translateY(-50%); width: 260px; max-height: calc(100vh - 110px); overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; background: color-mix(in srgb, var(--dsw-alias-bg-base) 96%, transparent); backdrop-filter: blur(10px); border: 1px solid var(--dsw-alias-border-l3); border-radius: 12px; box-shadow: var(--dsw-elevation-prominent); z-index: 42; pointer-events: auto; }
.md-rail-panel[data-side="right"] { right: 28px; }
.md-rail-panel[data-side="left"] { left: 28px; }
.md-rail-panel-title { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); padding-bottom: 8px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.md-rail-panel-hint { margin: 0; font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-secondary); }
/* The right-side preview gets the same edge rail, but only its core tools. */
.md-side-rail-wrap { top: 44px; bottom: 0; }
.md-side-rail-tab { top: calc(50% + 22px); }
.md-shape-handles { position: absolute; inset: 0; pointer-events: none; }
.md-shape-handle { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; background: var(--dsw-alias-bg-base); border: 1.5px solid var(--dsw-alias-brand-primary); border-radius: 2px; pointer-events: auto; cursor: nwse-resize; }
.md-annot[data-tool="pen"] { cursor: crosshair; }
.md-annot[data-tool="text"] { cursor: crosshair; }
.md-annot[data-tool="erase"] { cursor: cell; }
.md-annot-ink { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
/* A text note is transparent: it sits straight on the page, and a faint outline
   appears only on hover, when it can be double-clicked for editing. */
.md-annot-text { position: absolute; box-sizing: border-box; font-size: 14px; line-height: 1.35; white-space: pre-wrap; overflow-wrap: anywhere; overflow: hidden; pointer-events: none; padding: 2px 4px; border: 1px solid transparent; border-radius: 0; user-select: text; -webkit-user-select: text; }
/* With no tool picked, a note is clickable so a double-click can edit it. */
.md-annot[data-tool=""] .md-annot-text { pointer-events: auto; cursor: text; user-select: text; -webkit-user-select: text; }
.md-annot[data-tool=""] .md-annot-text:hover { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); }
/* The in-place editor is transparent too: only the text and the caret show.
   The style row never takes focus, so changing a font cannot blur-save. */
.md-note-editor { position: absolute; z-index: 8; box-sizing: border-box; display: flex; flex-direction: column; gap: 2px; min-width: 0; min-height: 0; padding: 1px; border: 1px dashed color-mix(in srgb, var(--dsw-alias-brand-primary) 42%, transparent); border-radius: 0; pointer-events: auto; }
.md-note-style { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; padding: 0; background: transparent; box-shadow: none; }
/* Text parameters now live in the toolbar: a nested menu, not a box on the page. */
.md-note-style-wrap { position: relative; display: inline-flex; align-items: center; }
.md-note-style-popover { position: absolute; top: calc(100% + 6px); right: 0; z-index: 30; width: min(280px, 82vw); display: flex; flex-direction: column; gap: 8px; padding: 10px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 10px; box-shadow: var(--dsw-elevation-prominent); }
.md-note-style-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.md-note-style-label { min-width: 34px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.md-note-style-btn { min-width: 20px; height: 20px; padding: 0 4px; font: inherit; font-size: 11px; line-height: 1; color: var(--dsw-alias-label-secondary); background: transparent; border: 1px solid transparent; border-radius: 4px; cursor: pointer; text-shadow: 0 1px 2px color-mix(in srgb, var(--dsw-alias-bg-base) 90%, transparent); }
.md-note-style-btn:hover { background: color-mix(in srgb, var(--dsw-alias-bg-base) 70%, transparent); }
.md-note-style-btn[data-on="true"] { color: var(--dsw-alias-label-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); }
.md-note-size-range { width: 74px; height: 16px; margin: 0; padding: 0; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }
.md-note-size-value { min-width: 30px; font-size: 10px; line-height: 1; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px color-mix(in srgb, var(--dsw-alias-bg-base) 90%, transparent); }
.md-note-style-sep { width: 1px; height: 14px; margin: 0 2px; background: color-mix(in srgb, var(--dsw-alias-border-l3) 70%, transparent); }
.md-note-style-bold { font-weight: 700; }
.md-note-style-italic { font-style: italic; }
.md-pressure { display: flex; flex-direction: column; gap: 8px; }
.md-pressure-pad { width: 100%; height: 160px; box-sizing: border-box; touch-action: none; cursor: crosshair; background: var(--dsw-alias-bg-base); border: 1px dashed var(--dsw-alias-border-l3); border-radius: 8px; }
.md-pressure-pad[data-drawing="true"] { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 60%, transparent); }
.md-pressure-read { font-size: 12px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.md-note-color { width: 14px; height: 14px; padding: 0; border: 1px solid var(--dsw-alias-border-l3); border-radius: 50%; cursor: pointer; }
.md-note-color[data-on="true"] { box-shadow: 0 0 0 2px var(--dsw-alias-bg-base), 0 0 0 3px var(--dsw-alias-brand-primary); }
.md-note-input { box-sizing: border-box; width: 100%; height: 100%; min-height: 0; max-height: none; overflow: auto; line-height: 1.35; padding: 2px; border-radius: 0; border: none; background: transparent; box-shadow: none; outline: none; caret-color: currentColor; resize: none; }
.md-note-input::placeholder { color: var(--dsw-alias-label-secondary); opacity: 0.85; }
.md-note-hint { align-self: flex-start; font-size: 11px; line-height: 1.4; padding: 0 2px; color: var(--dsw-alias-label-secondary); text-shadow: 0 1px 2px color-mix(in srgb, var(--dsw-alias-bg-base) 90%, transparent); }
.md-icon-btn { display: inline-flex; align-items: center; justify-content: center; padding: 3px 6px; }
/* A picked tool must look picked: these are icon-only buttons outside the
   mode group, and without this the text tool read as a dead click. */
.md-reader-subbar .md-icon-btn[aria-pressed="true"], .md-side-bar .md-icon-btn[aria-pressed="true"] { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 60%, transparent); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }
.md-icon { display: block; }
.md-annot-swatch { width: 16px; height: 16px; min-width: 16px; padding: 0; border-radius: 50%; border: 1px solid var(--dsw-alias-border-l3); }
.md-annot-swatch[aria-pressed="true"] { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 1px; }
.md-annot-width { display: inline-flex; align-items: center; gap: 5px; padding: 0 2px; }
.md-annot-width input[type="range"] { width: 68px; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }
.md-annot-width-value { min-width: 28px; font-size: 11px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.md-reader-note-overlay { color: var(--dsw-alias-state-warn-primary, var(--dsw-alias-label-secondary)); }
.md-mask { position: absolute; box-sizing: border-box; overflow: visible; border: 1px dashed color-mix(in srgb, var(--dsw-alias-brand-primary) 90%, transparent); }
/* The image is clipped by the inner wrapper, so the handles on the border are
   not cut off. */
.md-mask-clip { position: absolute; inset: 0; overflow: hidden; }
.md-mask img { position: absolute; max-width: none; user-select: none; pointer-events: none; }
.md-mask-boxes { position: absolute; inset: 0; pointer-events: auto; }
.md-mask-boxes .md-mask { pointer-events: none; }
.md-mask-boxes .md-mask-active { border-style: solid; }
.md-mask-handle { position: absolute; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 2px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-brand-primary); box-shadow: var(--dsw-elevation-soft); pointer-events: auto; opacity: 0; transition: opacity .12s ease; }
.md-mask[data-hover='true'] .md-mask-handle, .md-mask-active .md-mask-handle, .md-annot-edit .md-mask-handle { opacity: 1; }
.md-mask-handle-nw { left: 0; top: 0; cursor: nwse-resize; }
.md-mask-handle-n { left: 50%; top: 0; cursor: ns-resize; }
.md-mask-handle-ne { left: 100%; top: 0; cursor: nesw-resize; }
.md-mask-handle-e { left: 100%; top: 50%; cursor: ew-resize; }
.md-mask-handle-se { left: 100%; top: 100%; cursor: nwse-resize; }
.md-mask-handle-s { left: 50%; top: 100%; cursor: ns-resize; }
.md-mask-handle-sw { left: 0; top: 100%; cursor: nesw-resize; }
.md-mask-handle-w { left: 0; top: 50%; cursor: ew-resize; }
/* A drag on the box body draws the next box, so moving has its own grip: it
   appears on hover and is the only target that starts a move besides Alt+drag. */
.md-mask-grip { position: absolute; left: 50%; top: 6px; transform: translateX(-50%); display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 5px; background: color-mix(in srgb, var(--dsw-alias-bg-base) 92%, transparent); border: 1px solid var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); cursor: move; pointer-events: auto; opacity: 0; transition: opacity .12s ease; }
.md-mask[data-hover='true'] .md-mask-grip, .md-mask-active .md-mask-grip, .md-annot-edit .md-mask-grip { opacity: 1; }
.md-mask-grip .md-icon { width: 12px; height: 12px; }
.md-mask-draft { border-style: solid; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }
.md-reader-dual { display: flex; gap: 12px; width: 100%; height: 100%; }
.md-reader-column { flex: 1 1 0; min-width: 0; overflow: auto; }
.md-reader-colhead { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: color-mix(in srgb, var(--dsw-alias-bg-base) 82%, transparent); border-bottom: 1px solid var(--dsw-alias-border-l2); opacity: .82; transition: opacity .18s ease; }
.md-reader-colhead:hover { opacity: 1; }
/* The zoom controls and the page hint only appear when the header is hovered (or
   focused from the keyboard); the title stays so the column is identifiable. */
.md-reader-colhead > :not(.md-reader-coltitle) {
  opacity: 0;
  transform: translateY(-3px);
  pointer-events: none;
  transition: opacity .18s ease, transform .18s ease;
}
.md-reader-colhead:hover > :not(.md-reader-coltitle),
.md-reader-colhead:focus-within > :not(.md-reader-coltitle) {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.md-hidden { display: none; }
.md-desk-mark { position: absolute; right: -4px; top: -2px; width: 7px; height: 7px; border-radius: 50%; }
.md-desk-done { background: var(--dsw-alias-state-success-primary); }
.md-desk-error { background: var(--dsw-alias-state-error-primary); }
.md-desk-spin { background: transparent; border: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 35%, transparent); border-top-color: var(--dsw-alias-brand-primary); width: 8px; height: 8px; animation: md-desk-spin .8s linear infinite; }
@keyframes md-desk-spin { to { transform: rotate(360deg); } }
.md-reader-coltitle { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-right: auto; }
.md-reader-page-wrap { position: relative; display: inline-block; max-width: 100%; }
.md-blocklayer { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
.md-blockbox { position: absolute; box-sizing: border-box; border: 1px dashed color-mix(in srgb, var(--dsw-alias-state-error-primary) 85%, transparent); background: transparent; }
.md-blockbox[data-kind="heading"] { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 95%, transparent); background: transparent; }
.md-blockbox[data-kind="formula"] { border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 95%, transparent); background: transparent; }
.md-reader-continuous { display: flex; flex-direction: column; align-items: safe center; gap: 18px; width: 100%; }
.md-reader-slot { display: flex; flex-direction: column; align-items: safe center; min-height: 240px; position: relative; }
.md-reader-ghost { justify-content: center; opacity: .55; }
.md-reader-page-no { padding-bottom: 4px; font-size: 11px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.md-reader-subbar { flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 16px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.md-reader-modes { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; padding: 2px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.md-reader-modes .md-btn { border: 0; background: transparent; height: 26px; padding: 0 9px; border-radius: 7px; color: var(--dsw-alias-label-secondary); }
.md-reader-modes .md-btn[aria-pressed="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); color: var(--dsw-alias-brand-primary); box-shadow: none; }
.md-reader-subbar .md-btn { white-space: nowrap; flex: 0 0 auto; }
.md-reader-export { min-width: 92px; font-size: 12px; }
.md-reader-modes .md-btn[aria-pressed="true"] { border-color: var(--dsw-alias-border-l4); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
/* The block-box button stays pressed while its own boxes are on the page; the
   next press is the cancel. */
.md-btn[aria-pressed="true"].md-blocks-toggle { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 60%, transparent); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); color: var(--dsw-alias-brand-primary); }
.md-reader-newlabel { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.md-reader-canvas { display: block; flex: none; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l2); }
.md-reader-state { margin: 48px auto; font-size: 13px; color: var(--dsw-alias-label-secondary); }
.md-session-dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-success-primary); }
.md-session-time { flex: none; margin-left: auto; padding-left: 8px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.md-alert-inline { margin-top: 2px; }
.md-state { padding: 40px 4px; color: var(--dsw-alias-label-secondary); }
.md-state-error { color: var(--dsw-alias-state-error-primary); }
.md-state-detail { margin: 8px 0 0; font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.md-state-actions { margin-top: 14px; }
.md-empty { display: flex; flex-direction: column; gap: 8px; padding: 40px 4px; color: var(--dsw-alias-label-secondary); }
.md-empty-title { font-size: 15px; color: var(--dsw-alias-label-primary); }
.md-empty-path { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; color: var(--dsw-alias-label-primary); word-break: break-all; }
.md-diag { display: flex; flex-direction: column; gap: 4px; margin-top: 28px; padding-top: 14px; border-top: 1px dashed var(--dsw-alias-border-l2); }
.md-diag-line { margin: 0; font-size: 12px; color: var(--dsw-alias-label-secondary); word-break: break-word; }
/* The right column's chapter preview: the reader's stage, in a narrow pane. */
.md-side { position: relative; display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; height: 100%; background: var(--dsw-alias-bg-base); }
.md-side-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l3); }
.md-side-bar .md-btn { white-space: nowrap; flex: 0 0 auto; padding: 3px 8px; font-size: 12px; }
.md-side-pager { display: inline-flex; align-items: center; gap: 1px; padding: 2px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.md-side-pager .md-btn { border: 0; background: transparent; height: 26px; min-width: 26px; padding: 0 6px; border-radius: 7px; font-size: 12px; }
.md-side-pager .md-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.md-side-pager .md-side-count { min-width: 64px; font-size: 11.5px; }
.md-side-pager .md-side-goto { width: 56px; height: 24px; }
.md-side-count { font-size: 12px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
/* The page number doubles as the "go to page" input: a button that turns into
   a box on click, so the jump never depends on window.prompt. */
.md-side-bar .md-side-count { padding: 3px 7px; border: 1px solid transparent; }
.md-side-bar .md-side-count:hover { border-color: var(--dsw-alias-border-l3); }
.md-side-goto { width: 56px; padding: 3px 5px; font: inherit; font-size: 12px; text-align: center; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-brand-primary); border-radius: 6px; outline: none; }
.md-side-zoom { min-width: 38px; font-size: 12px; color: var(--dsw-alias-label-secondary); text-align: right; font-variant-numeric: tabular-nums; }
.md-side-more { font-size: 15px; line-height: 1; padding: 2px 9px; }
/* With the toolbar hidden, the handle fades in on hover and sits in the stage's
   top padding so it never covers the page itself. */
.md-side-handle { position: absolute; top: 6px; right: 8px; z-index: 7; opacity: 0; transition: opacity .12s ease; font-size: 15px; line-height: 1; padding: 2px 9px; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 90%, transparent); }
.md-side:hover .md-side-handle, .md-side-handle:focus-visible { opacity: 1; }
.md-side[data-toolbar='hidden'] .md-side-body .md-reader-stage { padding-top: 32px; }
.md-side-gap { flex: 1 1 auto; }
.md-side-body { position: relative; flex: 1 1 auto; min-height: 0; display: flex; }
/* Horizontal padding must stay in step with the width minus twenty in
   SidePdfView's measurement; the stable gutter keeps that measurement from
   moving when the page grows a scrollbar. */
.md-side-body .md-reader-stage { padding: 8px 10px 16px; scrollbar-gutter: stable; }
.md-side-body > .md-reader-stage-host { flex: 1 1 auto; min-height: 0; display: flex; }
.md-side .md-side-body .md-reader-stage { padding-right: 40px; }
/* The developer readout (Ctrl+Alt+D): one small overlay, never takes a click. */
.md-hud { position: absolute; left: 8px; bottom: 8px; z-index: 60; margin: 0; padding: 6px 8px; max-width: calc(100% - 16px); overflow: hidden; white-space: pre-wrap; font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base)); border: 1px solid var(--dsw-alias-border-l3); border-radius: 6px; pointer-events: none; opacity: 0.94; }
/* The preview's action list when the shared context menu service is absent. */
.md-fallback-backdrop { position: fixed; inset: 0; z-index: 80; }
.md-fallback-menu { position: fixed; min-width: 190px; max-width: 240px; max-height: 70vh; overflow: auto; padding: 4px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l3); border-radius: 8px; box-shadow: var(--dsw-elevation-prominent); }
.md-fallback-row { display: block; width: 100%; padding: 6px 10px; font: inherit; font-size: 13px; text-align: left; color: var(--dsw-alias-label-primary); background: transparent; border: 0; border-radius: 6px; cursor: pointer; }
.md-fallback-row:hover:not(:disabled), .md-fallback-row:focus-visible { background: var(--dsw-alias-interactive-bg-hover); outline: none; }
.md-fallback-row:disabled { opacity: 0.45; cursor: default; }
.md-fallback-parent { font-weight: 600; }
.md-fallback-children { padding-left: 10px; }
.md-side .md-reader-state { margin: 16px; }
/* While the reader is in use, the floating balance widget fades so the page and
   its translation boxes stay readable underneath. The selector belongs to
   dsh-whale-widget-bowl; with that plugin absent the rule matches nothing. */
body[data-pdfdesk-reading='1'] .dshwv-root { opacity: .28; }
.md-annot-readonly { pointer-events: none; }
.md-annot-readonly .md-annot-text { pointer-events: auto; cursor: text; }
/* The side preview's own ink: only the tool layer takes pointer events. */
.md-annot-edit { pointer-events: auto; cursor: crosshair; touch-action: none; }
.md-annot-edit[data-tool='erase'] { cursor: cell; }
.md-annot-edit[data-tool='mask'] { cursor: copy; }
/* The reader's overlay boxes, read-only: below the ink, above the page. */
.md-masks-readonly { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
.md-masks-readonly .md-mask { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); }
.md-root :focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
html[data-platform='darwin'] .md-head { padding-top: calc(var(--dsh-frame-top-clearance, 48px) + 4px); }
@container pdfdesk (max-width: 620px) {
  .md-head { flex-direction: column; align-items: flex-start; gap: 10px; }
  .md-head-actions { align-self: flex-end; }
  .md-row { grid-template-columns: 44px minmax(0, 1fr) auto 18px; }
  .md-pages, .md-kind { display: none; }
  .md-detail { padding-left: 52px; }
  .md-session-list { padding-left: 0; }
  .md-crumb-current { max-width: 24ch; }
}
@container pdfdesk (max-width: 760px) {
  .md-preview { position: absolute; top: 0; right: 0; bottom: 0; z-index: 5; width: min(94%, 460px); margin: 0; padding: 14px 16px 20px 18px; background: var(--dsw-alias-bg-base); border-left: 1px solid var(--dsw-alias-border-l3); }
  .md-preview-backdrop { display: block; position: absolute; inset: 0; z-index: 4; background: color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent); }
  .md-preview-body { border-radius: 8px; }
}
@container pdfdesk (max-width: 620px) {
  .md-file-meta { display: none; }
}
@container pdfdesk (max-width: 520px) {
  .md-session-time { display: none; }
}
.md-data-progress { height: 3px; margin: 12px 0 2px; border-radius: 999px; overflow: hidden; background: var(--dsw-alias-border-l2); }
.md-data-progress-bar { display: block; width: 38%; height: 100%; border-radius: inherit; background: var(--dsw-alias-brand-primary); animation: md-data-progress 1.1s ease-in-out infinite alternate; }
@keyframes md-data-progress { from { transform: translateX(-30%); } to { transform: translateX(230%); } }

/* Add-library page: the old heavy focus boxes were louder than the form. */
.md-library, .md-library:focus, .md-library:focus-visible { outline: none; }
.md-library-active { border-color: transparent; box-shadow: inset 3px 0 0 var(--dsw-alias-brand-primary); }
.md-add-row input:focus, .md-add-row input:focus-visible, .md-add-row .md-input:focus, .md-add-row .md-input:focus-visible { outline: none; box-shadow: none; border-color: transparent; }
.md-add-row input, .md-add-row .md-input { border-color: var(--dsw-alias-border-l2); }
`

    /* ------------------------------------------------------------ side view -- */

    /**
     * One chapter in the right column: the same document the workbench reader
     * shows, with the reader's page and reading mode, and the page's freehand
     * annotations drawn read-only. Zoom stays local because the column is much
     * narrower than the page.
     * @param {{ useTabInfo: Function }} props - the slot's tab information hook.
     * @returns {import('react').ReactElement} the preview.
     */
    function SidePdfView(props) {
      useT()
      const mathMode = useWorkflowMode() === 'math'
      const info = props.useTabInfo()
      const target = sideTarget(info.tab.contentId)
      // A restored tab record may carry no navigation yet.
      const navigation = info.tab.navigation ?? {}
      const params = navigation.params
      const variant = params !== null && typeof params === 'object' && params.variant === 'translated' ? 'translated' : ''
      const bookId = target === null ? '' : target.bookId
      const code = target === null ? '' : target.code
      // The chapter's shared state, for the diagnostic overlay.
      const storeView = useChapterView(bookId, code)
      const diag = useDiag()
      // Page marks live in one shared store: the reader writes the same keys.
      const inkStore = useMemo(() => createAnnotationStore(bookId, code, 'side'), [bookId, code])
      const revision = navigation.revision ?? 0
      // The chapter's conversations, for the 提取/答疑/习题 jumps.
      const sessionList = useSessionList()
      const archivedIds = useArchivedIds()
      const [doc, setDoc] = useState(null)
      const [count, setCount] = useState(0)
      const [page, setPage] = useState(1)
      const [jump, setJump] = useState(0)
      const [mode, setMode] = useState(() => (readGlobalMode() === 'continuous' ? 'continuous' : 'single'))
      // The shared mode this column last adopted. The reader's canvas mode is
      // shown here as one page, and is not written back as `single`.
      const modeAdopted = useRef(null)
      // One writer for the reading mode: the global preference follows every
      // change, so single/continuous is the same in the reader and this column.
      const changeMode = next => {
        if (next !== 'single' && next !== 'continuous') return
        modeAdopted.current = next
        writeGlobalMode(next)
        setMode(next)
      }
      // Zoom: the column auto-fits by default and follows its own width. A manual
      // zoom (buttons or menu) leaves auto-fit, and following the reader's zoom is
      // an explicit third mode; all three resolve to one concrete scale.
      const [autoFit, setAutoFit] = useState(true)
      const [follow, setFollow] = useState(false)
      const [manualScale, setManualScale] = useState(null)
      const [followScale, setFollowScale] = useState(null)
      // Page-1 width at scale 1 and the stage's content width: the fit inputs.
      const [baseWidth, setBaseWidth] = useState(0)
      const [stageWidth, setStageWidth] = useState(0)
      // What the tab was opened with, then what the reader switched to. The
      // chapter's shared view already knows, so the first load is the right
      // file instead of loading the source and reloading a moment later.
      const [shownVariant, setShownVariant] = useState(() => {
        const shared = bookId === '' || code === '' ? {} : readView(bookId, code)
        return shared.variant === 'translated' || variant === 'translated' ? 'translated' : ''
      })
      const [phase, setPhase] = useState('loading')
      const [error, setError] = useState('')
      // A rebuild the reader already announced is part of the first load: the
      // preview must not fetch the old file and reload a moment later.
      const [docRev, setDocRev] = useState(() => {
        const shared = bookId === '' || code === '' ? {} : readView(bookId, code)
        return typeof shared.docRev === 'number' && shared.docRev > 0 ? shared.docRev : 0
      })
      const [annotRev, setAnnotRev] = useState(0)
      // The overlay/translated page the boxes reveal; loaded only when a box exists.
      const [maskDoc, setMaskDoc] = useState(null)
      const maskClaim = useRef(null)
      // Which `book|code|rev` the mask document belongs to, so a page change does
      // not reload it; `maskLoading` marks the same key while its load is running.
      const maskReady = useRef('')
      const maskLoading = useRef('')
      // Publishing starts only after the opening view has been adopted, so the
      // first render cannot push a default page 1 over the reader's page.
      const [started, setStarted] = useState(false)
      // The toolbar can be hidden for a cleaner page: the preference is global
      // (this is about looks, not about one chapter).
      const [toolsHidden, setToolsHidden] = useState(() => {
        try {
          return window.localStorage.getItem('pdfdesk:side-toolbar') === '0'
        } catch {
          return false
        }
      })
      const toggleTools = () => {
        setToolsHidden(current => {
          const next = !current
          try {
            window.localStorage.setItem('pdfdesk:side-toolbar', next ? '0' : '1')
          } catch {
            // storage unavailable: the choice lasts for this tab only
          }
          return next
        })
      }
      // Annotation and box editing: this end edits too, so both the tool and the
      // in-progress shapes live here and the shared counter tells the reader.
      const [tool, setTool] = useState('')
      // The shared plane is the same object in both panes: same margins, same
      // edge, same "+" handles, same writable area outside the page.
      const planeMargins = usePlaneMargins()
      const plane = createPlane(planeMargins)
      const [sidePan, setSidePan] = useState({ x: 0, y: 0 })
      const [sideExpanded, setSideExpanded] = useState(0)
      useEffect(() => { setSidePan({ x: 0, y: 0 }); setSideExpanded(0) }, [bookId, code, shownVariant, mode])
      const expandSidePlane = side => {
        expandPlaneMargin(side)
        setSideExpanded(value => value + 1)
        const shift = 24
        setSidePan(current => ({
          x: side === 'left' ? current.x + shift : side === 'right' ? current.x - shift : current.x,
          y: side === 'top' ? current.y + shift : side === 'bottom' ? current.y - shift : current.y,
        }))
      }
      // Question marks: the same chapter data the reader and the chapter list
      // show. Creating one here saves it and (optionally) appends the line to
      // the conversation this column belongs to.
      const [questions, setQuestions] = useState([])
      const questionsRef = useRef([])
      const questionsNext = useRef(1)
      // The reader writes the same chapter stack; a redraw after an undo is
      // what keeps this pane's toolbar in step with it.
      const [, bumpQuestionEdits] = useState(0)
      const [questionRev, setQuestionRev] = useState(0)
      const [questionFlash, setQuestionFlash] = useState('')
      const seenQuestionRev = useRef(0)
      // The page number turns into an input on click: `window.prompt` does not
      // exist in DSH Desktop, so the menu's "go to page" used to do nothing.
      const [gotoOpen, setGotoOpen] = useState(false)
      // The in-panel fallback menu, at a viewport point, used only when the
      // shared context menu service is not available.
      const [fallbackMenu, setFallbackMenu] = useState(null)
      const gotoInput = useRef(null)
      useEffect(() => {
        if (!gotoOpen) return
        const node = gotoInput.current
        if (node === null) return
        node.focus()
        try {
          node.select()
        } catch {
          // focus alone is enough
        }
      }, [gotoOpen])
      const [maskDraft, setMaskDraft] = useState(null)
      // The note being typed in the preview; `index` is its slot in `strokes`,
      // or -1 for one that does not exist yet. The text itself stays inside the
      // editor until saved (`noteText` is what a save reads).
      // Defaults for the next note; the toolbar's text menu edits this, or the
      // open draft when there is one.
      // Tool defaults and the hover settings panel for the side rail.
      const [sideColor, setSideColor] = useState('#1f1f1f')
      const [sideWidth, setSideWidth] = useState(2)
      const [sidePanel, setSidePanel] = useState(false)
      const [sidePanelTool, setSidePanelTool] = useState('')
      const [sideAnchor, setSideAnchor] = useState(null)
      const sidePanelTimer = useRef(null)
      const sideCloseTimer = useRef(null)
      const beginSidePanel = (element, toolId) => {
        if (sideCloseTimer.current !== null) {
          clearTimeout(sideCloseTimer.current)
          sideCloseTimer.current = null
        }
        setSidePanelTool(toolId)
        const wrap = element.closest('.md-rail-wrap')
        if (wrap !== null) {
          const button = element.getBoundingClientRect()
          const box = wrap.getBoundingClientRect()
          setSideAnchor(button.top - box.top + button.height / 2)
        }
        if (sidePanel) return
        if (sidePanelTimer.current !== null) clearTimeout(sidePanelTimer.current)
        sidePanelTimer.current = setTimeout(() => setSidePanel(true), 400)
      }
      const leaveSidePanel = () => {
        if (sidePanelTimer.current !== null) clearTimeout(sidePanelTimer.current)
        sidePanelTimer.current = null
        if (sideCloseTimer.current !== null) clearTimeout(sideCloseTimer.current)
        sideCloseTimer.current = setTimeout(() => setSidePanel(false), 700)
      }
      useEffect(() => () => {
        if (sidePanelTimer.current !== null) clearTimeout(sidePanelTimer.current)
        if (sideCloseTimer.current !== null) clearTimeout(sideCloseTimer.current)
      }, [])
      const sideRailTool = (id, labelKey, path, disabled) => h(KitButton, {
        type: 'button',
        className: 'md-rail-btn',
        disabled: disabled === true,
        'aria-pressed': tool === id ? 'true' : 'false',
        title: format(labelKey),
        'aria-label': format(labelKey),
        onPointerEnter: event => beginSidePanel(event.currentTarget, id),
        onClick: () => toggleTool(id),
      }, annotIcon(path))
      const noteSeq = useRef(0)
      const noteText = useRef('')
      const draftRef = useRef(null)
      const maskDraftRef = useRef(null)
      const maskStartRef = useRef(null)
      const boxRef = useRef(null)
      const boxSize = useRef({ width: 400, height: 600 })
      const seenAnnotRev = useRef(0)
      const sideRoot = useRef(null)
      const stage = useRef(null)
      const slots = useRef(new Map())
      const visibleTimer = useRef(null)
      const jumping = useRef(false)
      const pageRef = useRef(1)
      // The page the document can paint, read by the subscription which runs in
      // a stale-count closure otherwise.
      const countRef = useRef(0)
      pageRef.current = page
      // The same editing state the reader uses: lists, drafts, the note and the
      // history. The write path is inside the hook.
      const inkEditor = useInkEditorState({
        inkStore,
        pageRef,
        editKey: chapterKey(bookId, code),
        pageNumber: page,
        onRev: rev => { seenAnnotRev.current = rev },
      })
      const {
        strokes, setStrokes, strokesRef,
        masks, setMasks, masksRef,
        selection, setSelection,
        draftStroke, setDraftStroke,
        shapeDraft, setShapeDraft,
        noteEdit, setNoteEdit,
        noteStyle, setNoteStyle,
        erasing: erasingRef,
        inkRev,
        bumpHistory,
        saveAnnots: commitStrokes,
        saveMasks: commitMasks,
        restorePage,
        undoPage,
        redoPage,
        historyCounts,
      } = inkEditor
      // Preview selection: the same hand/pen tools as the reader, plus a
      // marquee that picks a mark on this page so it can be moved or deleted.
      const [sideDrag, setSideDrag] = useState(null)
      const [sideMarquee, setSideMarquee] = useState(null)
      const [sideTextDraft, setSideTextDraft] = useState(null)
      const sideBasePanNeeds = offPageExtent(strokes)
      const sidePanNeeds = sideExpanded === 0
        ? sideBasePanNeeds
        : {
          top: Math.max(sideBasePanNeeds.top, planeMargins.top),
          bottom: Math.max(sideBasePanNeeds.bottom, planeMargins.bottom),
        }
      const noteEditRef = useRef(null)
      noteEditRef.current = noteEdit
      strokesRef.current = strokes
      masksRef.current = masks
      countRef.current = count
      // What this document can paint: the chapter's page stays the source of
      // truth, a translated file with a different count only clamps the render.
      const displayPage = count > 0 ? Math.min(count, page) : page
      const displayPageRef = useRef(displayPage)
      displayPageRef.current = displayPage
      const sessionListRef = useRef(sessionList)
      const archivedRef = useRef(archivedIds)
      sessionListRef.current = sessionList
      archivedRef.current = archivedIds

      // Start where the reader is; the opener's page is the fallback for a tab
      // restored before either end has published anything.
      useEffect(() => {
        const shared = bookId === '' || code === '' ? {} : readView(bookId, code)
        const wanted = params !== null && typeof params === 'object' ? Number(params.page) : NaN
        const fromBus = typeof shared.page === 'number' && shared.page > 0 ? shared.page : NaN
        const start = Number.isFinite(fromBus)
          ? fromBus
          : Number.isFinite(wanted) && wanted > 0 ? Math.round(wanted) : 1
        setPage(Math.max(1, start))
        setJump(value => value + 1)
        if (typeof shared.scale === 'number') setFollowScale(shared.scale)
        if (shared.mode === 'single' || shared.mode === 'continuous') setMode(shared.mode)
        if (typeof shared.docRev === 'number' && shared.docRev > 0) setDocRev(shared.docRev)
        setShownVariant(shared.variant === 'translated' || variant === 'translated' ? 'translated' : '')
        setStarted(true)
      }, [revision, bookId, code])

      // The document itself: the reader's route, the reader's revision.
      useEffect(() => {
        if (bookId === '' || code === '') {
          setPhase('error')
          setError(format('sideForeign'))
          return undefined
        }
        let cancelled = false
        let claim = null
        setPhase('loading')
        setError('')
        void (async () => {
          try {
            const lib = await loadPdfjs()
            if (cancelled) return
            // The chapter's URL is the reader's URL: when the reader still has
            // this file open, the preview joins its document (no second
            // download, no second worker, no second parse).
            const url = chapterPdfUrl(bookId, code, { variant: shownVariant, rev: docRev })
            claim = await sharedDocuments.claim(url, () => lib.getDocument({ url, isEvalSupported: false, ...pdfAssetUrls() }))
            if (cancelled) {
              claim.release()
              claim = null
              return
            }
            const loaded = claim.doc
            setDoc(loaded)
            setCount(loaded.numPages || 0)
            // The page is the chapter's, not this file's: a translated file with
            // fewer pages must not shrink the chapter's page (the render clamps
            // to what this document actually has). A source file may vouch for
            // the chapter's page count when the reader has not loaded yet.
            if (shownVariant !== 'translated' && bookId !== '' && code !== '') {
              setChapterCount(bookId, code, loaded.numPages || 0, 'side')
            }
            setPhase('ready')
          } catch (failure) {
            if (cancelled) return
            const name = failure !== null && failure !== undefined ? String(failure.name) : ''
            if (name === 'AbortException' || name === 'RenderingCancelledException') return
            setPhase('error')
            setError(errorText(failure))
          }
        })()
        return () => {
          cancelled = true
          if (claim !== null) {
            claim.release()
            claim = null
          }
        }
      }, [bookId, code, shownVariant, docRev])

      // The page's annotations: the reader's storage is the single source.
      useEffect(() => {
        if (bookId === '' || code === '') return
        setStrokes(inkStore.readList('annots', page))
      }, [inkStore, bookId, code, page, annotRev])

      // The page's overlay boxes: same storage, same keys as the reader. A box
      // is only useful with the translated page inside it, so the second
      // document is loaded on demand (below) and never for a page without boxes.
      useEffect(() => {
        if (bookId === '' || code === '') return
        setMasks(inkStore.readList('masks', page).filter(mask => Number(mask.w) > 0 && Number(mask.h) > 0))
      }, [inkStore, bookId, code, page, annotRev])

      // A new file version or another chapter invalidates the translated page.
      // Declared before the loader below: its setup clears the ready marker the
      // loader checks, so a re-render in the same commit still reloads.
      useEffect(() => {
        maskReady.current = ''
        maskLoading.current = ''
        setMaskDoc(null)
        return () => {
          const claim = maskClaim.current
          maskClaim.current = null
          if (claim !== null) claim.release()
        }
      }, [bookId, code, docRev])

      // The boxes reveal the overlay (or translated) page, the same documents the
      // reader uses for the same job. Loaded once per file version, and only when
      // the current page actually has boxes.
      const wantsMaskDoc = (masks.length > 0 || tool === 'mask') && shownVariant !== 'translated'
      useEffect(() => {
        if (!wantsMaskDoc || bookId === '' || code === '') return undefined
        const key = `${bookId}|${code}|${docRev}`
        if (maskReady.current === key || maskLoading.current === key) return undefined
        maskLoading.current = key
        let cancelled = false
        void (async () => {
          try {
            const lib = await loadPdfjs()
            for (const name of ['overlay', 'translated']) {
              if (cancelled) return
              const url = chapterPdfUrl(bookId, code, { variant: name, rev: docRev })
              try {
                const claim = await sharedDocuments.claim(url, () => lib.getDocument({ url, isEvalSupported: false, ...pdfAssetUrls() }))
                if (cancelled) {
                  claim.release()
                  return
                }
                const previous = maskClaim.current
                maskClaim.current = claim
                if (previous !== null) previous.release()
                maskReady.current = key
                maskLoading.current = ''
                setMaskDoc(claim.doc)
                return
              } catch {
                // this variant is not produced yet: try the next one
              }
            }
          } catch {
            // no translation yet: the boxes simply stay empty
          }
          // Nothing to load (or the build vanished): allow a later retry.
          if (maskLoading.current === key) maskLoading.current = ''
        })()
        return () => {
          cancelled = true
          if (maskLoading.current === key) maskLoading.current = ''
        }
      }, [wantsMaskDoc, bookId, code, docRev])

      /* ------------------------------------------------------- editing -- */
      // Both ends write the same keys through the shared annotation store, so
      // every local edit persists first and then announces itself.

      // A draft belongs to the page it was started on: a page change (or the
      // reader's edit) would otherwise save it into the new page's list. An
      // in-flight stroke or box is dropped for the same reason.
      useEffect(() => {
        setNoteEdit(null)
        draftRef.current = null
        setDraftStroke(null)
        maskStartRef.current = null
        maskDraftRef.current = null
        setMaskDraft(null)
      }, [page, annotRev, shownVariant])

      // Point in page coordinates (0..1 plus the plane's margins). Measured
      // against the editing layer, which is exactly the page box at any zoom;
      // the box width is remembered so the eraser's pixel tolerance can become
      // page units.
      const pointOf = event => {
        const node = boxRef.current
        if (node === null) return null
        const raw = inkPointOfFree(event, node)
        if (raw === null) return null
        const rect = node.getBoundingClientRect()
        boxSize.current = { width: rect.width, height: rect.height }
        return plane.clampPoint(raw)
      }
      const toleranceFor = widthPx => inkReach(widthPx, boxSize.current.width)
      const hitTest = (entry, point) => inkHit(entry, point, toleranceFor)
      const openNote = (point, box) => {
        const list = strokesRef.current
        const found = box === undefined
          ? list.findIndex(entry => entry.kind === 'text' && hitTest(entry, point))
          : -1
        noteSeq.current += 1
        if (found >= 0) {
          const entry = list[found]
          noteText.current = String(entry.text ?? '')
          setNoteEdit({
            id: noteSeq.current,
            index: found,
            x: entry.x,
            y: entry.y,
            text: noteText.current,
            color: entry.color ?? '#1f1f1f',
            fontSize: Number.isFinite(entry.fontSize) ? entry.fontSize : NOTE_SIZES[0],
            fontFamily: typeof entry.fontFamily === 'string' ? entry.fontFamily : 'normal',
            textAlign: typeof entry.textAlign === 'string' ? entry.textAlign : 'left',
            fontWeight: entry.fontWeight === 'bold' ? 'bold' : 'normal',
            fontStyle: entry.fontStyle === 'italic' ? 'italic' : 'normal',
          })
          return
        }
        noteText.current = ''
        // A drag-created box opens at exactly the dragged size, like the reader's
        // note: the press point alone is only the fallback for a plain click.
        const fallbackWidth = Math.min(0.38, Math.max(0.18, 1 - point[0] - 0.02))
        const x = box === undefined ? point[0] : box.x
        const y = box === undefined ? point[1] : box.y
        const w = box === undefined ? fallbackWidth : Math.max(0.04, box.w)
        const h = box === undefined ? 0.09 : Math.max(0.035, box.h)
        setNoteEdit({
          id: noteSeq.current,
          index: -1,
          x,
          y,
          w,
          h,
          text: '',
          color: noteStyle.color,
          fontSize: noteStyle.fontSize,
          fontFamily: noteStyle.fontFamily,
          textAlign: noteStyle.textAlign ?? 'left',
          fontWeight: noteStyle.fontWeight === 'bold' ? 'bold' : 'normal',
          fontStyle: noteStyle.fontStyle === 'italic' ? 'italic' : 'normal',
        })
      }
      const changeNote = text => {
        noteText.current = text
      }
      const changeNoteStyle = patch => {
        // The font is a global preference: the next note of any book starts with it.
        if (typeof patch.fontFamily === 'string') writeNoteFont(patch.fontFamily)
        setNoteStyle(current => ({ ...current, ...patch }))
        setNoteEdit(current => (current === null ? current : { ...current, ...patch }))
      }
      const cancelNote = () => setNoteEdit(null)
      const saveNote = id => {
        const draft = noteEditRef.current
        if (draft === null || draft.id !== id) return
        // Clear first: a blur that lands after this save must not save (or
        // delete) the same note a second time.
        noteEditRef.current = null
        setNoteEdit(null)
        if (draft.index < 0 && noteText.current.trim() === '') return
        commitStrokes(applyNote(strokesRef.current, draft, noteText.current))
      }
      const shapeDraftRef = useRef(null)
      const sideGestures = createInkGestures({
        tool,
        strokesRef,
        draftRef,
        erasing: erasingRef,
        saveAnnots: commitStrokes,
        setDraftStroke,
        hitTest,
        color: sideColor,
        width: sideWidth,
        shapeTools: SHAPE_TOOLS,
        shapeDraftRef,
        setShapeDraft,
      })
      const editDown = event => {
        if (tool === '') return
        const point = pointOf(event)
        if (point === null) return
        event.preventDefault()
        event.stopPropagation()
        if (tool === 'select') {
          const list = strokesRef.current
          const found = list.findIndex(entry => annotHit(entry, point))
          if (found >= 0) {
            const entry = list[found]
            setSelection({ index: found, kind: entry.kind === 'text' ? 'text' : entry.kind === 'shape' ? 'shape' : 'stroke' })
            setSideDrag({ index: found, start: point, dx: 0, dy: 0 })
            return
          }
          setSelection(null)
          setSideMarquee({ x0: point[0], y0: point[1], x1: point[0], y1: point[1] })
          return
        }
        if (tool === 'erase') {
          sideGestures.down(event, point)
          return
        }
        if (tool === 'mask') {
          maskStartRef.current = point
          maskDraftRef.current = { x: point[0], y: point[1], w: 0, h: 0 }
          setMaskDraft(maskDraftRef.current)
          return
        }
        if (tool === 'text') {
          // Match the reader: a drag creates the box; a click on an existing
          // note selects and moves it instead of stacking another one.
          if (noteEditRef.current !== null) saveNote(noteEditRef.current.id)
          const found = strokesRef.current.findIndex(entry => entry.kind === 'text' && annotHit(entry, point))
          if (found >= 0) {
            setSelection({ index: found, kind: 'text' })
            setSideDrag({ index: found, start: point, dx: 0, dy: 0 })
            return
          }
          setSideTextDraft({ x0: point[0], y0: point[1], x1: point[0], y1: point[1] })
          return
        }
        if (SHAPE_TOOLS.includes(tool)) {
          sideGestures.down(event, point)
          return
        }
        if (tool === 'pen') sideGestures.down(event, point)
      }
      const editMove = event => {
        if (sideDrag !== null) {
          const point = pointOf(event)
          if (point === null) return
          event.preventDefault()
          setSideDrag(current => (current === null ? null : { ...current, dx: point[0] - current.start[0], dy: point[1] - current.start[1] }))
          return
        }
        if (sideMarquee !== null) {
          const point = pointOf(event)
          if (point === null) return
          event.preventDefault()
          setSideMarquee(current => (current === null ? null : { ...current, x1: point[0], y1: point[1] }))
          return
        }
        if (sideTextDraft !== null) {
          const point = pointOf(event)
          if (point === null) return
          event.preventDefault()
          setSideTextDraft(current => (current === null ? null : { ...current, x1: point[0], y1: point[1] }))
          return
        }
        if (tool === 'erase' && erasingRef.current) {
          const point = pointOf(event)
          if (point === null) return
          event.preventDefault()
          sideGestures.move(event, point)
          return
        }
        if (tool === 'mask' && maskStartRef.current !== null) {
          const point = pointOf(event)
          if (point === null) return
          const start = maskStartRef.current
          maskDraftRef.current = {
            x: Math.min(start[0], point[0]),
            y: Math.min(start[1], point[1]),
            w: Math.abs(point[0] - start[0]),
            h: Math.abs(point[1] - start[1]),
          }
          setMaskDraft(maskDraftRef.current)
          return
        }
        if (shapeDraftRef.current !== null) {
          const point = pointOf(event)
          if (point === null) return
          sideGestures.move(event, point)
          return
        }
        if (draftRef.current === null) return
        const point = pointOf(event)
        if (point === null) return
        sideGestures.move(event, point)
      }
      const editUp = () => {
        if (sideTextDraft !== null) {
          const draft = sideTextDraft
          setSideTextDraft(null)
          const x = Math.min(draft.x0, draft.x1)
          const y = Math.min(draft.y0, draft.y1)
          const w = Math.abs(draft.x1 - draft.x0)
          const h = Math.abs(draft.y1 - draft.y0)
          if (w > 0.012 && h > 0.012) openNote([x, y], { x, y, w, h })
          return
        }
        if (sideDrag !== null) {
          const moved = sideDrag
          setSideDrag(null)
          if (Math.hypot(moved.dx, moved.dy) > 0.003) {
            commitStrokes(strokesRef.current.map((entry, index) => (
              index === moved.index ? translateEntry(entry, moved.dx, moved.dy) : entry
            )))
          }
          return
        }
        if (sideMarquee !== null) {
          const box = {
            x: Math.min(sideMarquee.x0, sideMarquee.x1),
            y: Math.min(sideMarquee.y0, sideMarquee.y1),
            w: Math.abs(sideMarquee.x1 - sideMarquee.x0),
            h: Math.abs(sideMarquee.y1 - sideMarquee.y0),
          }
          setSideMarquee(null)
          if (box.w > 0.005 || box.h > 0.005) {
            const found = strokesRef.current.findIndex(entry => boxesIntersect(box, entryBounds(entry)))
            if (found >= 0) {
              const entry = strokesRef.current[found]
              setSelection({ index: found, kind: entry.kind === 'text' ? 'text' : entry.kind === 'shape' ? 'shape' : 'stroke' })
            }
          }
          return
        }
        sideGestures.up()
        if (tool === 'mask') {
          const start = maskStartRef.current
          const draft = maskDraftRef.current
          maskStartRef.current = null
          maskDraftRef.current = null
          setMaskDraft(null)
          if (draft === null || start === null) return
          // A drag small enough to be a click draws nothing; boxes are deleted
          // with a right-click now, not by tapping them.
          if (draft.w > 0.02 && draft.h > 0.02) commitMasks([...masksRef.current, draft])
          return
        }
      }
      const toggleTool = name => setTool(current => (current === name ? '' : name))
      useEffect(() => {
        if (selection === null) return undefined
        const onKeyDown = event => {
          if (event.key !== 'Backspace' && event.key !== 'Delete') return
          const target = event.target
          if (target !== null && target !== undefined && typeof target.tagName === 'string'
            && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable === true)) return
          commitStrokes(strokesRef.current.filter((entry, index) => index !== selection.index))
          setSelection(null)
          event.preventDefault()
          event.stopPropagation()
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [selection])

      // A chapter's conversation for one mode, newest first, from the session list.
      const findSession = mode => {
        const list = sessionListRef.current
        if (list === null || list === undefined || list.phase !== 'ready' || !Array.isArray(list.ids)) return null
        let found = null
        for (const id of list.ids) {
          if (archivedRef.current.has(id)) continue
          const summary = list.byId === undefined ? undefined : list.byId[id]
          if (summary === undefined || summary.origin === 'subagent') continue
          const parsed = parseSessionTitle(summary.title)
          if (parsed === null || parsed.mode !== mode) continue
          if (parsed.bookKey !== bookId || parsed.code !== code) continue
          if (found === null || (Number(summary.updatedAt) || 0) > (Number(found.updatedAt) || 0)) {
            found = { id, updatedAt: summary.updatedAt }
          }
        }
        return found === null ? null : found.id
      }

      // The translated page as one image: every box reads it through CSS, so a
      // page with ten boxes holds one decoded bitmap instead of ten canvases.
      const [maskImage, setMaskImage] = useState('')
      const maskImageCache = useRef(new Map())
      const wantMaskImage = maskDoc !== null && (masks.length > 0 || tool === 'mask') && shownVariant !== 'translated'
      useEffect(() => {
        if (!wantMaskImage) return undefined
        // The translated page is painted from this document's own pages.
        const pageNumber = displayPageRef.current
        const key = `${pageNumber}|${docRev}`
        const cached = maskImageCache.current.get(key)
        if (cached !== undefined) {
          setMaskImage(cached)
          return undefined
        }
        let cancelled = false
        void (async () => {
          const doc = maskDoc
          if (doc === null) return
          const rendered = await maskPageImage(doc, pageNumber, 1200)
          if (cancelled) return
          if (rendered.url === '') {
            setMaskImage('')
            return
          }
          const cache = maskImageCache.current
          cache.set(key, rendered.url)
          // Keep only the pages just looked at: the string is a full page.
          while (cache.size > 2) {
            const oldest = cache.keys().next().value
            cache.delete(oldest)
          }
          setMaskImage(rendered.url)
        })()
        return () => { cancelled = true }
      }, [wantMaskImage, maskDoc, page, docRev])

      // One page fits the column: page 1's width at scale 1 against the stage's
      // content width. Recomputed whenever either side of that ratio changes, so
      // resizing the pane, the window or the dock refits on its own. `stageWidth`
      // is already the content width (the stage's horizontal padding removed).
      const autoScale = baseWidth > 0 && stageWidth > 0
        ? Math.max(0.2, Math.min(3, Math.round(stageWidth / baseWidth * 100) / 100))
        : 1
      const renderScale = follow && typeof followScale === 'number'
        ? followScale
        : autoFit
          ? autoScale
          : (manualScale === null ? autoScale : manualScale)
      const shown = renderScale
      // Zoom buttons work from what is on screen; a ref keeps their callbacks
      // identity-stable across renders.
      const renderScaleRef = useRef(renderScale)
      renderScaleRef.current = renderScale

      const zoomTo = useCallback(value => {
        const next = Math.max(0.2, Math.min(4, Math.round(value * 100) / 100))
        setFollow(false)
        setAutoFit(false)
        setManualScale(next)
      }, [])
      const fitToColumn = useCallback(() => {
        setFollow(false)
        setAutoFit(true)
        setManualScale(null)
      }, [])
      // The toggles read the current mode from refs: a setState updater must stay
      // pure, and entering a mode needs the other two writes decided up front.
      const modeRef = useRef({ autoFit, follow })
      modeRef.current = { autoFit, follow }
      const toggleAutoFit = useCallback(() => {
        const next = !modeRef.current.autoFit
        setFollow(false)
        setAutoFit(next)
        // Leaving auto-fit keeps the size the reader is looking at.
        setManualScale(next ? null : renderScaleRef.current)
      }, [])
      const toggleFollow = useCallback(() => {
        const next = !modeRef.current.follow
        setFollow(next)
        if (next) setAutoFit(false)
      }, [])

      // Page 1's intrinsic width: the denominator of every fit.
      useEffect(() => {
        if (doc === null) return undefined
        let cancelled = false
        void doc.getPage(1).then(page => {
          if (!cancelled) setBaseWidth(page.getViewport({ scale: 1 }).width)
        }).catch(() => {
          // A document whose first page cannot be read still gets a scale, so the
          // paint below can report the real failure instead of waiting forever.
          if (!cancelled) setBaseWidth(current => (current > 0 ? current : 600))
        })
        return () => { cancelled = true }
      }, [doc])

      const noopScale = useCallback(() => {}, [])
      const onError = useCallback(failure => {
        setPhase('error')
        setError(errorText(failure))
      }, [])
      // The dock gives the tab its real width only after the first layout, and the
      // stage only exists once the document may paint, so wait for the node rather
      // than depending on an effect that ran before it appeared.
      useEffect(() => {
        if (phase !== 'ready') return undefined
        let cancelled = false
        let frames = 0
        let observer = null
        const apply = width => {
          const content = Math.max(0, width - 20)
          if (content > 0) setStageWidth(current => (Math.abs(current - content) <= 1 ? current : content))
        }
        const bind = () => {
          if (cancelled) return
          const node = stage.current
          if (node === null) {
            frames += 1
            if (frames < 120) requestAnimationFrame(bind)
            return
          }
          if (typeof ResizeObserver === 'function') {
            observer = new ResizeObserver(entries => {
              apply(entries[0] !== undefined && entries[0].contentRect !== undefined
                ? entries[0].contentRect.width
                : node.clientWidth)
            })
            observer.observe(node)
          }
          apply(node.clientWidth)
        }
        bind()
        return () => {
          cancelled = true
          cancelAnimationFrame(frames)
          if (observer !== null) observer.disconnect()
        }
      }, [phase])
      const registerSlot = useCallback((number, node) => {
        if (node === null) slots.current.delete(number)
        else slots.current.set(number, node)
      }, [])
      const goPage = useCallback(number => {
        if (bookId === '' || code === '') return
        // The chapter owns the page: this end only asks for the move.
        setChapterPage(bookId, code, 'side', number, 'navigate')
      }, [bookId, code])

      // Scrolling reports a page; it must not echo back as a programmatic jump.
      const onVisible = useCallback(number => {
        if (visibleTimer.current !== null) clearTimeout(visibleTimer.current)
        visibleTimer.current = setTimeout(() => {
          if (jumping.current) return
          reportChapterPage(bookId, code, 'side', number)
        }, 350)
      }, [bookId, code])

      const scrollToPage = useCallback(number => {
        jumping.current = true
        const jumpTo = () => {
          const node = slots.current.get(number)
          const scrollport = stage.current
          if (node === null || node === undefined || scrollport === null || scrollport === undefined) return
          if (scrollport.getAttribute('data-mode') !== 'continuous') return
          const top = node.getBoundingClientRect().top - scrollport.getBoundingClientRect().top + scrollport.scrollTop
          scrollport.scrollTop = Math.max(0, top)
        }
        jumpTo()
        for (const delay of [80, 240, 600]) setTimeout(jumpTo, delay)
        setTimeout(() => { jumping.current = false }, 900)
      }, [])

      useEffect(() => {
        if (mode !== 'continuous' || phase !== 'ready') return
        scrollToPage(displayPageRef.current)
        // The page is read but not watched: pages reported by scrolling must not
        // scroll the column again. `jump` marks the explicit moves.
      }, [jump, mode, phase, scrollToPage])

      // A mode switch invalidates any report the view being left had queued:
      // that report would otherwise rename the shared page right after the
      // switch, so the toolbar number and the page on screen disagree.
      const lastSideMode = useRef(mode)
      useEffect(() => {
        const from = lastSideMode.current
        lastSideMode.current = mode
        if (from === mode) return
        if (visibleTimer.current !== null) {
          clearTimeout(visibleTimer.current)
          visibleTimer.current = null
        }
        jumping.current = true
        if (mode === 'single') {
          const scrollport = stage.current
          if (scrollport !== null && scrollport !== undefined) {
            scrollport.scrollTop = 0
            scrollport.scrollLeft = 0
          }
        }
        const timer = setTimeout(() => { jumping.current = false }, 700)
        return () => clearTimeout(timer)
      }, [mode])

      // Where this preview is, for the reader; its zoom never travels back. The
      // page does not travel this way: it moves through setChapterPage. A
      // preview always shows one page, so it never publishes a mode of its own.
      useEffect(() => {
        if (!started || bookId === '' || code === '') return
        syncView(bookId, code, { mode }, 'side')
      }, [started, bookId, code, mode])

      // The reader's page and mode come back here; its zoom never does. A page
      // the reader moved to carries a jump, so this column scrolls there.
      useEffect(() => {
        if (bookId === '' || code === '') return undefined
        return subscribeView(bookId, code, state => {
          if (typeof state.page === 'number') {
            const jumpTo = state.cause === 'navigate' || state.cause === 'load' || state.origin !== 'side'
            const wanted = Math.max(1, Math.round(state.page))
            const next = countRef.current > 0 ? Math.min(countRef.current, wanted) : wanted
            setPage(current => (current === next ? current : next))
            if (jumpTo) setJump(value => value + 1)
          }
          if (state.scale === null || typeof state.scale === 'number') setFollowScale(state.scale)
          if (state.mode === 'single' || state.mode === 'continuous') {
            modeAdopted.current = state.mode
            setMode(state.mode)
          }
          if (state.variant === '' || state.variant === 'translated') setShownVariant(state.variant)
          if (typeof state.docRev === 'number') setDocRev(current => (state.docRev > current ? state.docRev : current))
          const annot = Number(state.annotRev) || 0
          if (annot > seenAnnotRev.current) {
            seenAnnotRev.current = annot
            setAnnotRev(annot)
          }
          const marks = Number(state.questionRev) || 0
          if (marks > seenQuestionRev.current) {
            seenQuestionRev.current = marks
            setQuestionRev(value => value + 1)
          }
        })
      }, [bookId, code])

      useEffect(() => () => {
        if (visibleTimer.current !== null) clearTimeout(visibleTimer.current)
      }, [])

      // Reconcile with the library mirror on open, so a cleared browser gets the
      // notes back even when this panel is the first thing to load them.
      useEffect(() => {
        if (bookId === '' || code === '') return undefined
        let cancelled = false
        void (async () => {
          const result = await syncChapterAnnotations(bookId, code)
          if (cancelled || result.restored === 0) return
          seenAnnotRev.current = bumpAnnotRev(bookId, code, 'side')
          setAnnotRev(seenAnnotRev.current)
        })()
        return () => { cancelled = true }
      }, [bookId, code])

      // While the pointer is over the preview, any floating desktop widget that
      // paints above the page fades out of the way (the balance widget's root is
      // `.dshwv-root`); the rule is inert when that plugin is absent.
      useEffect(() => {
        const node = sideRoot.current
        if (node === null || typeof document === 'undefined' || document.body === undefined) return undefined
        const enter = () => { document.body.dataset.pdfdeskReading = '1' }
        const leave = () => { delete document.body.dataset.pdfdeskReading }
        node.addEventListener('pointerenter', enter)
        node.addEventListener('pointerleave', leave)
        return () => {
          node.removeEventListener('pointerenter', enter)
          node.removeEventListener('pointerleave', leave)
          delete document.body.dataset.pdfdeskReading
        }
      }, [])

      // The reader's annotation layer without its pointer handlers: this side
      // only shows what the workbench holds.
      const shapeRoughness = (() => {
        try {
          const value = Number(window.localStorage.getItem('pdfdesk:roughness'))
          return Number.isFinite(value) ? value : 1
        } catch {
          return 1
        }
      })()
      // Both panes share one annotation plane, so off-page marks are shown here
      // too instead of being filtered out (that is what made the preview look
      // out of sync with the reader). The marks themselves are drawn by the same
      // renderer as the reader's.
      const annotLayer = h('div', { className: 'md-annot md-annot-readonly', 'data-extended': 'true', 'aria-hidden': true },
        h(InkMarks, {
          entries: strokes,
          roughness: shapeRoughness,
          hiddenNoteIndex: noteEdit === null ? -1 : noteEdit.index,
          drag: sideDrag,
          onNoteContextMenu: (index, event) => {
            event.preventDefault()
            event.stopPropagation()
            commitStrokes(strokesRef.current.filter((entry, item) => item !== index))
            setSelection(null)
          },
        }),
        selection === null
          ? null
          : (() => {
            if (strokes[selection.index] !== undefined && strokes[selection.index].kind === 'text') return null
            const box = entryBounds(strokes[selection.index])
            const dx = sideDrag === null ? 0 : sideDrag.dx
            const dy = sideDrag === null ? 0 : sideDrag.dy
            if (box.w <= 0 && box.h <= 0) return null
            return h('div', {
              className: 'md-selection-outline',
              style: {
                left: `${(box.x + dx) * 100}%`,
                top: `${(box.y + dy) * 100}%`,
                width: `${Math.max(box.w, 0.008) * 100}%`,
                height: `${Math.max(box.h, 0.008) * 100}%`,
              },
            })
          })(),
        sideMarquee === null
          ? null
          : (() => {
            const box = {
              x: Math.min(sideMarquee.x0, sideMarquee.x1),
              y: Math.min(sideMarquee.y0, sideMarquee.y1),
              w: Math.abs(sideMarquee.x1 - sideMarquee.x0),
              h: Math.abs(sideMarquee.y1 - sideMarquee.y0),
            }
            return h('div', {
              className: 'md-marquee',
              style: { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` },
            })
          })())

      // The boxes: each one clips the translated page to its own region, exactly
      // as the reader's overlay layer does. The frame shows as soon as a box
      // exists, even while the translated page is still loading. With the box
      // tool picked the editable copy in the edit layer takes over instead.
      const masksLayer = masks.length === 0 || shownVariant === 'translated' || tool === 'mask'
        ? null
        : h('div', { className: 'md-masks-readonly', 'aria-hidden': true },
          masks.map((mask, index) => h('div', {
            key: `${mask.x}-${mask.y}-${index}`,
            className: 'md-mask',
            style: {
              left: `${mask.x * 100}%`,
              top: `${mask.y * 100}%`,
              width: `${mask.w * 100}%`,
              height: `${mask.h * 100}%`,
            },
          },
            h('div', { className: 'md-mask-clip' },
              maskImage === '' ? null : h('div', {
                className: 'md-mask-page-image',
                style: {
                  position: 'absolute',
                  left: `${-(mask.x / mask.w) * 100}%`,
                  top: `${-(mask.y / mask.h) * 100}%`,
                  width: `${100 / mask.w}%`,
                  height: `${100 / mask.h}%`,
                  maxWidth: 'none',
                  backgroundImage: `url("${maskImage}")`,
                  backgroundSize: '100% 100%',
                  backgroundRepeat: 'no-repeat',
                },
              })))))

      // The editing surface: an invisible page-sized layer that only takes pointer
      // events while a tool is picked, so scrolling stays untouched otherwise.
      const editLayer = tool === '' || tool === 'hand'
        ? null
        : h('div', {
          className: 'md-annot md-annot-edit',
          'data-extended': 'true',
          'data-tool': tool,
          ref: boxRef,
          onPointerDown: editDown,
          onWheel: forwardWheel,
          onPointerMove: editMove,
          onPointerUp: editUp,
          onPointerLeave: editUp,
          onPointerCancel: editUp,
        },
          draftStroke === null
            ? null
            : h('svg', {
              className: 'md-annot-ink',
              viewBox: '0 0 1 1',
              preserveAspectRatio: 'none',
              'aria-hidden': true,
            }, h('polyline', {
              points: draftStroke.points.map(point => `${point[0]},${point[1]}`).join(' '),
              fill: 'none',
              stroke: draftStroke.color,
              strokeWidth: draftStroke.width,
              vectorEffect: 'non-scaling-stroke',
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            })),
          shapeDraft === null
            ? null
            : h('svg', {
              className: 'md-annot-ink',
              viewBox: '0 0 1 1',
              preserveAspectRatio: 'none',
              'aria-hidden': true,
            }, h(ShapeMark, {
              entry: {
                kind: 'shape',
                ...shapeDraft,
                x: Math.min(shapeDraft.x0, shapeDraft.x1),
                y: Math.min(shapeDraft.y0, shapeDraft.y1),
                w: Math.abs(shapeDraft.x1 - shapeDraft.x0),
                h: Math.abs(shapeDraft.y1 - shapeDraft.y0),
              },
              roughness: shapeRoughness,
            })),
          // The same dashed box the reader draws while a text area is dragged:
          // without it the drag looks like a dead click until the release.
          sideTextDraft === null
            ? null
            : h('svg', {
              className: 'md-annot-ink',
              viewBox: '0 0 1 1',
              preserveAspectRatio: 'none',
              'aria-hidden': true,
            }, h('rect', {
              className: 'md-text-draft',
              x: Math.min(sideTextDraft.x0, sideTextDraft.x1),
              y: Math.min(sideTextDraft.y0, sideTextDraft.y1),
              width: Math.abs(sideTextDraft.x1 - sideTextDraft.x0),
              height: Math.abs(sideTextDraft.y1 - sideTextDraft.y0),
              fill: 'none',
              stroke: '#2f6df6',
              strokeWidth: 1.5,
              strokeDasharray: '5 4',
              vectorEffect: 'non-scaling-stroke',
            })),
          maskDraft === null
            ? null
            : h('div', {
              className: 'md-mask md-mask-draft',
              style: {
                left: `${maskDraft.x * 100}%`,
                top: `${maskDraft.y * 100}%`,
                width: `${maskDraft.w * 100}%`,
                height: `${maskDraft.h * 100}%`,
              },
            }),
          // With the box tool picked the boxes move and resize in place, and a
          // right-click deletes one (undo brings it back).
          tool === 'mask'
            ? h(MaskBoxes, {
              masks,
              image: maskImage,
              onChange: (index, mask) => commitMasks(masksRef.current.map((item, position) => (position === index ? mask : item))),
              onDelete: index => commitMasks(masksRef.current.filter((item, position) => position !== index)),
            })
            : null,
          noteEdit === null
            ? null
            : h(NoteEditor, {
              key: `note-${noteEdit.id}`,
              draft: noteEdit,
              unbounded: true,
              onChange: changeNote,
              onSave: () => saveNote(noteEdit.id),
              onCancel: cancelNote,
            }))

      // The chapter's question marks: loaded here, saved here, shared with the
      // reader through the chapter's view link.
      useEffect(() => {
        let cancelled = false
        void loadChapterQuestions(bookId, code).then(payload => {
          if (cancelled) return
          questionsRef.current = payload.questions
          questionsNext.current = payload.next
          setQuestions(payload.questions)
        }).catch(() => {
          // A chapter with no readable questions file simply has none.
        })
        return () => { cancelled = true }
      }, [bookId, code, questionRev])
      const questionCommitting = createQuestionCommitting({
        bookId,
        code,
        origin: 'side',
        questionsRef,
        nextRef: questionsNext,
        setQuestions,
        bumpQuestionEdits,
        seenQuestionRev,
        onFailure: () => { notifySide(format('questionSaveFailed')) },
      })
      const commitQuestions = (list, next, record = true) => { questionCommitting.commit(list, next, record) }
      const createQuestion = rect => {
        // Same gap-filling number as the reader: one numbering rule for both.
        const number = nextQuestionNumber(questionsRef.current)
        const question = {
          id: createQuestionId(),
          name: `疑问 ${number}`,
          page: displayPage,
          rect,
          createdAt: Date.now(),
        }
        commitQuestions([...questionsRef.current, question], Math.max(questionsNext.current, number + 1))
        // This column is the PDF beside the conversation, so this is where a new
        // mark is announced: one line into the open chat box, never sent.
        void injectQuestionLine(bookId, code, question)
      }
      const flashQuestion = id => {
        setQuestionFlash(id)
        window.setTimeout(() => setQuestionFlash(current => (current === id ? '' : current)), 1800)
      }
      // Undo follows the last kind of edit, like the reader: a deleted mark is
      // restored from the chapter's question stack, ink from the page's stack.
      const editKey = chapterKey(bookId, code)
      const questionUndoCount = questionUndoDepth(editKey)
      const questionRedoCount = questionRedoDepth(editKey)
      const questionKindActive = tool === 'question' || (chapterEditKind.get(editKey) ?? 'ink') === 'question'
      const undoCount = questionKindActive ? questionUndoCount : historyCounts.undo
      const redoCount = questionKindActive ? questionRedoCount : historyCounts.redo
      const undoOne = () => {
        if (questionKindActive && questionUndoCount > 0) {
          const snapshot = undoQuestionEdit(editKey, { questions: questionsRef.current, next: questionsNext.current })
          if (snapshot !== null) {
            commitQuestions(snapshot.questions, snapshot.next, false)
            return
          }
        }
        undoPage()
      }
      const redoOne = () => {
        if (questionKindActive && questionRedoCount > 0) {
          const snapshot = redoQuestionEdit(editKey, { questions: questionsRef.current, next: questionsNext.current })
          if (snapshot !== null) {
            commitQuestions(snapshot.questions, snapshot.next, false)
            return
          }
        }
        redoPage()
      }
      useEffect(() => {
        const onKeyDown = event => {
          // With the full reader open, its handler owns Ctrl+Z/Y; this one only
          // serves the standalone right-column preview.
          if (typeof document !== 'undefined' && document.querySelector('.md-reader') !== null) return
          if (!(event.ctrlKey === true || event.metaKey === true) || event.altKey === true) return
          const key = String(event.key).toLowerCase()
          if (key !== 'z' && key !== 'y') return
          const target = event.target
          if (target !== null && target !== undefined && typeof target.tagName === 'string'
            && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable === true)) return
          if (noteEditRef.current !== null) return
          const redo = key === 'y' || (key === 'z' && event.shiftKey === true)
          if (redo ? redoCount === 0 : undoCount === 0) return
          event.preventDefault()
          event.stopPropagation()
          if (redo) redoOne()
          else undoOne()
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [undoCount, redoCount])

      const questionLayer = h(QuestionMarks, {
        questions: questions.filter(item => Number(item.page) === displayPage),
        active: tool === 'question',
        create: tool === 'question',
        reading: tool === '',
        flash: questionFlash,
        onCreate: rect => createQuestion(rect),
        onCommit: (id, rect) => commitQuestions(questionsRef.current.map(item => (item.id === id ? { ...item, rect } : item)), questionsNext.current),
        onDelete: id => commitQuestions(questionsRef.current.filter(item => item.id !== id), questionsNext.current),
        onRename: (id, name) => commitQuestions(questionsRef.current.map(item => (item.id === id ? { ...item, name } : item)), questionsNext.current),
      })
      // The same plane edge as the reader, with the same "+" squares: the plane
      // is shared, so widening it in one pane is immediately true in the other.
      const sideBounds = h(PlaneBounds, { margins: planeMargins, onExpand: expandSidePlane })
      // The pointer layer covers the preview's viewport so a mark may start
      // outside the page, exactly like the reader. PdfViewer wraps it outside
      // the scroller, so scrolling cannot uncover it.
      const sideMarkTool = tool !== '' && tool !== 'hand' && tool !== 'question'
      const sideCapture = sideMarkTool
        ? h('div', {
          className: 'md-canvas-capture',
          'data-tool': tool,
          onPointerDown: editDown,
          onWheel: forwardWheel,
          onPointerMove: editMove,
          onPointerUp: editUp,
          onPointerLeave: editUp,
          onPointerCancel: editUp,
          onContextMenu: event => {
            event.preventDefault()
            const point = pointOf(event)
            const found = point === null ? -1 : strokesRef.current.findIndex(entry => entry.kind === 'text' && hitTest(entry, point))
            if (found < 0) return
            event.preventDefault()
            event.stopPropagation()
            commitStrokes(strokesRef.current.filter((entry, index) => index !== found))
            setSelection(null)
          },
        })
        : null

      // Feedback from a menu action that runs outside a component message line.
      const notifySide = text => {
        const menus = clientContext === null ? null : clientContext.get('contextMenus')
        if (menus !== null && menus !== undefined && typeof menus.notify === 'function') menus.notify(text)
      }

      // The preview's actions live in the shared context menu. It is registered
      // once for the whole target kind and asks the mounted preview for actions,
      // so the menu always reflects the live page, mode and zoom.
      const menuState = useRef(null)
      menuState.current = {
        page, count, mode, autoFit, follow, phase, bookId, code, target, tool, toolsHidden,
        strokes: strokes.length, masks: masks.length,
        undo: undoCount, redo: redoCount,
        tabActions: info.tab.actions,
      }
      // The menu resolves once per target kind; reading the actions from a ref
      // keeps it from capturing a stale page's undo stack.
      const historyActions = useRef({ undo: undoPage, redo: redoPage })
      // The hidden-toolbar menu captures its actions through this ref; point it
      // at the same routing the visible buttons use.
      historyActions.current = { undo: undoOne, redo: redoOne }
      const menuActions = useCallback(() => {
        const state = menuState.current
        if (state === null) return []
        const ready = state.phase === 'ready'
        const check = on => (on ? '✓ ' : '')
        // Grouped like pages of a tiny menu: paging, tools, zoom, mode, sessions,
        // and a preview group for the housekeeping rows. Seven root rows beat
        // fourteen, and submenus only open when asked for.
        return [
          {
            id: 'paging',
            label: format('sideMenuPaging'),
            children: [
              { id: 'prev', label: format('readerPrev'), disabled: !ready || state.page <= 1, run: () => goPage(state.page - 1) },
              { id: 'next', label: format('readerNext'), disabled: !ready || state.count === 0 || state.page >= state.count, run: () => goPage(state.page + 1) },
              { id: 'first', label: format('readerFirst'), disabled: !ready || state.page <= 1, run: () => goPage(1) },
              {
                id: 'goto',
                label: format('sideMenuGoto'),
                disabled: !ready || state.count === 0,
                run: () => {
                  // The input lives in the toolbar, so a hidden toolbar comes
                  // back for the jump (the saved preference is untouched).
                  setToolsHidden(false)
                  setGotoOpen(true)
                },
              },
            ],
          },
          {
            id: 'tools',
            label: format('sideMenuTools'),
            children: [
              { id: 'pen', label: `${check(state.tool === 'pen')}${format('annotPen')}`, run: () => toggleTool('pen') },
              { id: 'hand', label: `${check(state.tool === 'hand')}${format('annotHand')}`, run: () => toggleTool('hand') },
              { id: 'erase', label: `${check(state.tool === 'erase')}${format('annotErase')}`, run: () => toggleTool('erase') },
              { id: 'text', label: `${check(state.tool === 'text')}${format('annotText')}`, run: () => toggleTool('text') },
              { id: 'mask', label: `${check(state.tool === 'mask')}${format('overlayToggle')}`, disabled: state.overlayUnavailable === true, run: () => toggleTool('mask') },
              {
                id: 'undo',
                label: format('undo'),
                disabled: state.undo === 0,
                separatorBefore: true,
                run: () => historyActions.current.undo(),
              },
              {
                id: 'redo',
                label: format('redo'),
                disabled: state.redo === 0,
                run: () => historyActions.current.redo(),
              },
              {
                id: 'clear-annots',
                label: format('sideMenuClearAnnots'),
                disabled: state.strokes === 0,
                separatorBefore: true,
                run: () => commitStrokes([]),
              },
              {
                id: 'clear-masks',
                label: format('sideMenuClearMasks'),
                disabled: state.masks === 0,
                run: () => commitMasks([]),
              },
            ],
          },
          {
            id: 'zoom',
            label: format('sideMenuZoom'),
            children: [
              { id: 'zoom-in', label: format('readerZoomIn'), run: () => zoomTo(renderScaleRef.current * 1.2) },
              { id: 'zoom-out', label: format('readerZoomOut'), run: () => zoomTo(renderScaleRef.current / 1.2) },
              { id: 'fit', label: format('readerFit'), run: () => fitToColumn() },
              { id: 'auto-fit', label: `${check(state.autoFit)}${format('sideMenuAutoFit')}`, run: () => toggleAutoFit() },
              {
                id: 'follow',
                label: `${check(state.follow)}${format('sideMenuFollowReader')}`,
                separatorBefore: true,
                run: () => toggleFollow(),
              },
              {
                id: 'center-plane',
                label: format('canvasCenter'),
                run: () => setSidePan({ x: 0, y: 0 }),
              },
            ],
          },
          {
            id: 'mode',
            label: format(state.mode === 'single' ? 'readerModeContinuous' : 'readerModeSingle'),
            separatorBefore: true,
            run: () => changeMode(state.mode === 'single' ? 'continuous' : 'single'),
          },
          {
            id: 'sessions',
            label: format('sideMenuSessions'),
            children: MODES.map(mode => {
              const found = findSession(mode)
              return {
                id: `session-${mode}`,
                label: `${found === null ? '＋ ' : ''}${format(`mode.${mode}`)}`,
                run: () => {
                  if (found !== null) {
                    if (mode === 'qa') void seedQaPersona(found)
                    if (!openHostSession(found)) notifySide(format('sessionUnavailable'))
                    return
                  }
                  requestDeskSession(bookId, code, mode)
                },
              }
            }),
          },
          {
            id: 'desk',
            label: format('sideOpenInDesk'),
            disabled: state.target === null,
            run: () => requestDeskOpen(state.bookId, state.code, state.page),
          },
          {
            id: 'preview',
            label: format('sideMenuPreview'),
            separatorBefore: true,
            children: [
              { id: 'reload', label: format('sideMenuReload'), run: () => setDocRev(value => value + 1) },
              { id: 'toolbar', label: format(state.toolsHidden ? 'sideShowToolbar' : 'sideHideToolbar'), run: () => toggleTools() },
              {
                id: 'close',
                label: format('sideMenuClose'),
                separatorBefore: true,
                run: () => {
                  const actions = state.tabActions
                  if (actions !== null && actions !== undefined && typeof actions.close === 'function') actions.close()
                },
              },
            ],
          },
        ].filter(item => mathMode || item.id !== 'sessions')
        // The action bodies read `menuState`, so only the constructors matter.
      }, [fitToColumn, goPage, mathMode, toggleAutoFit, toggleFollow, zoomTo])

      const openSideMenu = useCallback(event => {
        if (event !== null && event !== undefined) {
          event.preventDefault()
          event.stopPropagation()
        }
        const node = event !== null && event !== undefined && event.currentTarget !== undefined ? event.currentTarget : null
        const rect = node !== null && typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null
        const blank = event === null || event === undefined || (event.clientX === 0 && event.clientY === 0)
        const point = blank && rect !== null
          ? { x: rect.left + 8, y: rect.bottom - 2 }
          : { x: event.clientX, y: event.clientY }
        const menus = clientContext === null ? null : clientContext.get('contextMenus')
        if (menus === null || menus === undefined || typeof menus.open !== 'function') {
          // No shared menu in this build: show the same rows in the panel, so a
          // right-click is never a dead end.
          setFallbackMenu({ x: point.x, y: point.y })
          return
        }
        setFallbackMenu(null)
        try {
          menus.open({ kind: SIDE_MENU_KIND, value: { bookId, code, page } }, point)
        } catch (error) {
          // A mounted service that refuses to open must not eat the gesture.
          trace('side', 'menu open failed', String(error))
          setFallbackMenu({ x: point.x, y: point.y })
        }
      }, [bookId, code, page])

      // The shared menu closes from a document-level pointerdown listener. The
      // preview's own page surfaces stop propagation while a tool or a question
      // mark owns the press, so that listener never saw a click on the PDF and
      // the menu stayed open. Close it here first, before any tool consumes the
      // press: the dismiss click must not draw or select under the menu.
      // Right presses are left to the menu's own repeated-gesture handling.
      useEffect(() => {
        const node = sideRoot.current
        if (node === null) return undefined
        const onDown = event => {
          if (event.button === 2 || fallbackMenu !== null) return
          if (!(event.target instanceof Element) || event.target.closest('.md-side-body') === null) return
          const menus = clientContext === null ? null : clientContext.get('contextMenus')
          if (menus === null || menus === undefined || typeof menus.close !== 'function') return
          const active = menus.active === null || menus.active === undefined || typeof menus.active.getSnapshot !== 'function'
            ? null
            : menus.active.getSnapshot()
          if (active === null || active === undefined) return
          menus.close()
          event.preventDefault()
          event.stopPropagation()
        }
        node.addEventListener('pointerdown', onDown, true)
        return () => node.removeEventListener('pointerdown', onDown, true)
      }, [fallbackMenu])

      useEffect(() => {
        if (bookId === '' || code === '') return undefined
        const key = `${bookId}:${code}`
        const provider = () => menuActions()
        sideMenuProviders.set(key, provider)
        return () => {
          if (sideMenuProviders.get(key) === provider) sideMenuProviders.delete(key)
        }
      }, [bookId, code, menuActions])

      // The top bar's "叠加" frames the translated page, so it needs this
      // chapter's translation facts. It reads the shared per-chapter cache and,
      // when the reader is not mounted (restored tab, preview only), asks the
      // Host itself; an unknown answer keeps the button disabled until a query
      // fills it, so a reader-less preview does not stay locked (review W3).
      const translation = useTranslationFacts(bookId, code)
      const overlayUnavailable = translation.exists !== true || translation.translating === true
      // menuActions reads the live gates through menuState; the translation
      // facts it needs are resolved here, after that ref's literal was built.
      menuState.current.overlayUnavailable = overlayUnavailable
      useEffect(() => {
        if (bookId === '' || code === '' || translation.known) return undefined
        void refreshTranslationFacts(bookId, code)
        return undefined
      }, [bookId, code, translation.known])

      const body = target === null
        ? h('div', { className: 'md-reader-state', role: 'alert' }, format('sideForeign'))
        : phase === 'error'
          ? h('div', { className: 'md-reader-state md-state-error', role: 'alert' },
            h('div', null, error === '' ? format('readerFailed') : error),
            h('div', { className: 'md-state-actions' },
              h(KitButton, {
                type: 'button',
                className: 'md-btn md-btn-small',
                onClick: () => setDocRev(value => value + 1),
              }, format('readerRetry'))))
          : doc === null || baseWidth === 0
            ? h('div', { className: 'md-reader-state', role: 'status' }, format('readerLoading'))
            : h(PdfViewer, {
              variant: 'stage',
              mode,
              doc,
              page: displayPage,
              count,
              scale: renderScale,
              fitScale: noopScale,
              stageRef: stage,
              onScale: noopScale,
              showBlocks: false,
              bookId,
              code,
              onVisible,
              registerSlot,
              onError,
              pan: mode === 'single' ? sidePan : null,
              panNeeds: null,
              margins: planeMargins,
              onPan: setSidePan,
              panEnabled: tool === 'hand' && mode === 'single',
              scrollGrab: mode === 'continuous' && tool === 'hand',
              children: [sideBounds, masksLayer, annotLayer, editLayer, questionLayer].filter(Boolean),
              // Continuous mode has no single page box: the same layers ride on
              // the page being read, so drawing and boxes work there too.
              overlay: [sideBounds, masksLayer, annotLayer, editLayer, questionLayer].filter(Boolean),
              overlayPage: displayPage,
              // Neighbour pages carry their own committed marks, exactly like
              // the reader, so panning the preview shows the same plane.
              overlayFor: page => h(StaticInk, {
                key: `side-ink-${page}`,
                bookId,
                code,
                page,
                rev: annotRev + inkRev,
              }),
            })

      return h('div', {
        className: 'md-side',
        ref: sideRoot,
        'data-mode': mode,
        'data-toolbar': toolsHidden ? 'hidden' : 'shown',
        onContextMenu: openSideMenu,
      },
        toolsHidden
          // The way back to the toolbar: a handle that appears when the pointer
          // is over the preview, without taking any layout space.
          ? h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small md-side-handle',
            title: format('sideShowToolbar'),
            'aria-label': format('sideShowToolbar'),
            'aria-haspopup': 'menu',
            disabled: target === null,
            onClick: event => openSideMenu(event),
          }, '⋯')
          : null,
        toolsHidden ? null : h('div', { className: 'md-side-bar' },
          h('div', { className: 'md-side-pager' },
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small',
            title: format('readerPrev'),
            'aria-label': format('readerPrev'),
            disabled: page <= 1 || phase !== 'ready',
            onClick: () => goPage(page - 1),
          }, '‹'),
          gotoOpen
            ? h(KitInput, {
              key: 'goto',
              ref: gotoInput,
              className: 'md-side-goto',
              type: 'text',
              inputMode: 'numeric',
              defaultValue: String(page),
              'aria-label': format('sideGotoPrompt'),
              title: format('sideGotoPrompt'),
              onKeyDown: event => {
                event.stopPropagation()
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setGotoOpen(false)
                  return
                }
                if (event.key !== 'Enter') return
                event.preventDefault()
                const wanted = Number.parseInt(event.currentTarget.value, 10)
                setGotoOpen(false)
                if (Number.isFinite(wanted)) goPage(wanted)
              },
              onBlur: () => setGotoOpen(false),
            })
            : h(KitButton, {
              type: 'button',
              className: 'md-btn md-btn-small md-side-count',
              title: format('sideGotoHint'),
              'aria-label': format('sideMenuGoto'),
              disabled: count === 0 || phase !== 'ready',
              onClick: () => setGotoOpen(true),
            }, count === 0 ? String(page) : `${page} / ${count}`),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small',
            title: format('readerNext'),
            'aria-label': format('readerNext'),
            disabled: count === 0 || page >= count || phase !== 'ready',
            onClick: () => goPage(page + 1),
          }, '›'),
          ),
          // The page number stays between its two arrows; the question jump
          // comes after them instead of splitting the pair.
          h(KitSelect, {
            className: 'md-question-jump',
            value: '',
            label: format('questionJump'),
            placeholder: questions.length === 0 ? format('questionJumpEmpty') : format('questionJump'),
            title: questions.length === 0 ? format('questionJumpEmpty') : questions.map(item => item.name).join(' / '),
            disabled: questions.length === 0,
            options: questions.map(item => ({ value: item.id, label: `${item.name} · 第 ${item.page} 页` })),
            onChange: id => {
              const found = questionsRef.current.find(item => item.id === id)
              if (found === undefined) return
              goPage(found.page)
              flashQuestion(found.id)
            },
          }),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small',
            title: format('readerMode'),
            'aria-label': format('readerMode'),
            'aria-pressed': mode === 'continuous' ? 'true' : 'false',
            onClick: () => changeMode(mode === 'single' ? 'continuous' : 'single'),
          }, mode === 'single' ? format('readerModeSingle') : format('readerModeContinuous')),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small',
            title: format('readerZoomOut'),
            'aria-label': format('readerZoomOut'),
            disabled: phase !== 'ready',
            onClick: () => zoomTo(renderScale / 1.2),
          }, '−'),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small',
            title: format('readerFit'),
            'aria-label': format('readerFit'),
            disabled: phase !== 'ready',
            onClick: () => fitToColumn(),
          }, '⤢'),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small',
            title: format('readerZoomIn'),
            'aria-label': format('readerZoomIn'),
            disabled: phase !== 'ready',
            onClick: () => zoomTo(renderScale * 1.2),
          }, '+'),
          h(KitButton, {
            type: 'button', className: 'md-btn md-btn-small',
            title: format('canvasCenterHint'),
            'aria-label': format('canvasCenter'),
            onClick: () => {
              setSidePan({ x: 0, y: 0 })
              if (mode === 'continuous') scrollToPage(page)
            },
          }, format('canvasCenter')),
          h('span', { className: 'md-side-gap' }),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small md-icon-btn',
            'aria-pressed': tool === 'select' ? 'true' : 'false',
            title: format('annotSelect'),
            'aria-label': format('annotSelect'),
            onClick: () => toggleTool('select'),
          }, annotIcon('M5 3l7 17 2-7 7-2z')),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small md-icon-btn',
            'aria-pressed': tool === 'hand' ? 'true' : 'false',
            title: format('annotHand'),
            'aria-label': format('annotHand'),
            onClick: () => toggleTool('hand'),
          }, annotIcon('M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15')),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small md-icon-btn',
            'aria-pressed': tool === 'pen' ? 'true' : 'false',
            title: format('annotHint'),
            'aria-label': format('annotPen'),
            onClick: () => toggleTool('pen'),
          }, annotIcon('M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z')),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small md-icon-btn',
            'aria-pressed': tool === 'erase' ? 'true' : 'false',
            title: format('annotEraseHint'),
            'aria-label': format('annotErase'),
            onClick: () => toggleTool('erase'),
          }, annotIcon('m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21M22 21H7M5 11l9 9')),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small md-icon-btn',
            'aria-pressed': tool === 'text' ? 'true' : 'false',
            title: format('annotTextHint'),
            'aria-label': format('annotText'),
            onClick: () => toggleTool('text'),
          }, annotIcon('M4 6h16M12 6v13M9 19h6')),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small md-icon-btn',
            disabled: overlayUnavailable,
            'aria-pressed': tool === 'mask' ? 'true' : 'false',
            title: format('overlayHint'),
            'aria-label': format('overlayToggle'),
            onClick: () => toggleTool('mask'),
          }, annotIcon('M4 4h16v16H4zM8 4v16M16 4v16')),
          h('span', { className: 'md-side-gap' }),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small md-icon-btn',
            disabled: undoCount === 0,
            title: format('undoHint'),
            'aria-label': format('undo'),
            onClick: () => undoOne(),
          }, annotIcon('M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3')),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small md-icon-btn',
            disabled: redoCount === 0,
            title: format('redoHint'),
            'aria-label': format('redo'),
            onClick: () => redoOne(),
          }, annotIcon('M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3')),
          h('span', { className: 'md-side-gap' }),
          h('span', { className: 'md-side-zoom', title: format(autoFit ? 'sideAutoFitOn' : 'sideMenuZoom') },
            `${Math.round(shown * 100)}%`),
          h(KitButton, {
            type: 'button',
            className: 'md-btn md-btn-small md-side-more',
            title: format('sideMenuHint'),
            'aria-label': format('sideMenuMore'),
            'aria-haspopup': 'menu',
            disabled: target === null,
            onClick: event => openSideMenu(event),
          }, '⋯')),
        // The pointer layer lives beside the scroller, not inside it: it must
        // cover the visible preview at any scroll offset, and it must not be
        // pushed around by the stage's own positioning.
        h('div', { className: 'md-side-body' }, body, sideCapture),
        h('div', { className: 'md-rail-tab md-side-rail-tab', 'data-side': 'right', 'aria-hidden': true }, '‹'),
        h('div', {
          className: 'md-rail-wrap md-side-rail-wrap',
          'data-side': 'right',
          onPointerLeave: leaveSidePanel,
        },
          h('div', { className: 'md-rail md-side-rail' },
            sideRailTool('select', 'annotSelect', 'M5 3l7 17 2-7 7-2z'),
            sideRailTool('hand', 'annotHand', 'M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'),
            sideRailTool('pen', 'annotPen', 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'),
            sideRailTool('erase', 'annotErase', 'm7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21M22 21H7M5 11l9 9'),
            sideRailTool('text', 'annotText', 'M4 6h16M12 6v13M9 19h6'),
            sideRailTool('question', 'questionTool', 'M4 4h16v16H4zM9.6 9.6a2.4 2.4 0 1 1 3.3 2.2c-.7.3-1 .8-1 1.4v.4M12 16.6h.01'),
            sideRailTool('line', 'shapeLine', 'M4 20 20 4'),
            sideRailTool('arrow', 'shapeArrow', 'M4 20 20 4M10 4h10v10'),
            sideRailTool('rect', 'shapeRect', 'M4 5h16v14H4z'),
            sideRailTool('diamond', 'shapeDiamond', 'M12 3 21 12 12 21 3 12z'),
            sideRailTool('ellipse', 'shapeEllipse', 'M12 5c5 0 8 3 8 7s-3 7-8 7-8-3-8-7 3-7 8-7z'),
            sideRailTool('mask', 'overlayToggle', 'M4 4h16v16H4zM8 4v16M16 4v16', overlayUnavailable),
            h('span', { className: 'md-rail-sep', 'aria-hidden': true }),
            h(KitButton, {
              type: 'button', className: 'md-rail-btn',
              disabled: undoCount === 0,
              title: format('undoHint'), 'aria-label': format('undo'),
              onClick: () => undoOne(),
            }, annotIcon('M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3')),
            h(KitButton, {
              type: 'button', className: 'md-rail-btn',
              disabled: redoCount === 0,
              title: format('redoHint'), 'aria-label': format('redo'),
              onClick: () => redoOne(),
            }, annotIcon('M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3'))
          ),
          sidePanel && sidePanelTool !== ''
            ? h('div', {
              className: 'md-rail-panel',
              'data-side': 'right',
              style: sideAnchor === null ? undefined : { top: `${sideAnchor}px` },
            },
              h('div', { className: 'md-rail-panel-title' },
                `${format('toolSettings')} · ${format(TOOL_LABELS[sidePanelTool] ?? 'annotPen')}`),
              sidePanelTool === 'text'
                ? h(NoteStyleControls, { style: noteEdit ?? noteStyle, onChange: changeNoteStyle })
                : sidePanelTool === 'question'
                  ? h('p', { className: 'md-rail-panel-hint' }, format('questionPanelHint'))
                  : sidePanelTool === 'mask'
                  ? h('p', { className: 'md-rail-panel-hint' }, format('toolPanelMaskHint'))
                  : sidePanelTool === 'erase'
                    ? h('p', { className: 'md-rail-panel-hint' }, format('annotEraseHint'))
                    : h(React.Fragment, null,
                      h('div', { className: 'md-note-style-row' },
                        h('span', { className: 'md-note-style-label' }, format('annotColor')),
                        ['#1f1f1f', '#e0554a', '#2f6df6', '#2ecc71'].map(color => h(KitButton, {
                          key: color,
                          type: 'button',
                          className: 'md-note-color',
                          style: { background: color },
                          'data-on': sideColor === color ? 'true' : undefined,
                          'aria-label': color,
                          onMouseDown: event => event.preventDefault(),
                          onClick: () => setSideColor(color),
                        }))
                      ),
                      h('div', { className: 'md-note-style-row' },
                        h('span', { className: 'md-note-style-label' }, format('annotWidthHint')),
                        h('input', {
                          type: 'range', min: 1, max: 10, step: 1,
                          value: sideWidth,
                          'aria-label': format('annotWidthHint'),
                          onChange: event => setSideWidth(Number(event.target.value) || 2),
                        }),
                        h('span', { className: 'md-note-size-value' }, `${sideWidth}px`)
                      )
                    )
            )
            : null
        ),
        diag
          ? h(DiagPanel, {
            lines: [
              `book   ${bookId}/${code} · ${shownVariant === 'translated' ? 'translated' : 'source'} · ${mode}`,
              `page   ${page} / ${count} · display ${displayPage} · jump ${jump} · ${Math.round(shown * 100)}%`,
              `shared ${storeView.page ?? '—'} / ${storeView.count ?? '—'} · jump ${storeView.jump ?? 0} · ${storeView.cause ?? '—'} @${storeView.origin ?? '—'}`,
              `tool   ${tool || '—'} · ${autoFit ? 'auto' : follow ? 'follow' : 'manual'}`,
              `annot  pdfdesk:annots:${bookId}:${code}:${page}`,
            ],
          })
          : null,
        fallbackMenu === null
          ? null
          : h(FallbackMenu, {
            x: fallbackMenu.x,
            y: fallbackMenu.y,
            rows: menuActions(),
            onClose: () => setFallbackMenu(null),
          }))
    }

    /**
     * The tab chip: the chapter this preview shows.
     * @param {{ useTabInfo: Function }} props - the slot's tab information hook.
     * @returns {import('react').ReactNode} the chip text.
     */
    function SideTitle(props) {
      useT()
      const info = props.useTabInfo()
      const target = sideTarget(info.tab.contentId)
      if (target === null) return format('sideForeign')
      return format('sideTabTitle', { book: target.bookId, code: target.code })
    }

    /**
     * Contribute the side preview: a tab type that claims math desk chapter
     * addresses, its body, and its chip title. A build without the right column
     * never calls back, and the reader keeps opening the plain file tab.
     * @param {import('@deepseek-ai/cordis').Context} ctx - client root context.
     * @returns {void}
     */
    function registerSidePreview(ctx) {
      const start = scope => {
        if (sideTabsReady) return
        // The slot service must be read as a property so the registration's
        // effect lands in this scope's fiber; the tab registry is a plain object
        // whose own disposer we keep instead.
        const tabs = typeof scope.get === 'function' ? scope.get('sidebarRightTabs') : undefined
        if (tabs === null || tabs === undefined) return
        const slots = scope.slots
        if (slots === null || slots === undefined) return
        scope.effect(() => tabs.register({
          id: SIDE_TAB_ID,
          kind: SIDE_TAB_KIND,
          patterns: [`${SIDE_ADDRESS}**`],
          keepMounted: true,
          title: address => {
            const target = sideTarget(address)
            return target === null
              ? format('sideForeign')
              : format('sideTabTitle', { book: target.bookId, code: target.code })
          },
        }), 'pdfdesk: side preview type')
        scope.effect(() => slots.inject('sidebar.right.pane.tab', () => slots.register({
          name: 'sidebar.right.pane.tab',
          key: SIDE_TAB_ID,
        }, SidePdfView)), 'pdfdesk: side preview body')
        scope.effect(() => slots.inject('sidebar.right.pane.tab.title', () => slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: SIDE_TAB_ID,
        }, SideTitle)), 'pdfdesk: side preview title')
        sideTabsReady = true
        trace('side', 'tab type registered')
        // The preview's actions live in the shared context menu, contributed once
        // for the whole target kind; a build without that menu still previews.
        const menusUp = host => {
          if (sideMenuReady) return true
          const menus = typeof host.get === 'function' ? host.get('contextMenus') : undefined
          if (menus === null || menus === undefined || typeof menus.register !== 'function') return false
          host.effect(() => menus.register({
            id: 'math-desk-side',
            target: SIDE_MENU_KIND,
            order: 20,
            resolve: target => {
              if (target === null || typeof target !== 'object') return []
              const provider = sideMenuProviders.get(`${target.bookId}:${target.code}`)
              return provider === undefined ? [] : provider()
            },
          }), 'pdfdesk: side menu')
          sideMenuReady = true
          trace('side', 'menu contribution registered')
          return true
        }
        const menusHere = menusUp(scope)
        if (!menusHere && typeof ctx.inject === 'function') {
          try {
            ctx.inject(['contextMenus'], host => { menusUp(host) })
          } catch (error) {
            trace('side', 'menu inject failed', String(error))
          }
        }
      }
      // Take it now when the column is already up, and again when it arrives.
      start(ctx)
      if (typeof ctx.inject === 'function') {
        try {
          ctx.inject(['sidebarRightTabs', 'slots'], start)
        } catch (error) {
          trace('side', 'inject failed', String(error))
        }
      }
    }

    /* ----------------------------------------------------------------- page -- */

    /**
     * The workbench page.
     * @returns {import('react').ReactElement} the page.
     */
    function WorkbenchPage() {
      useT()
      // The handwriting face is optional: ask once, then inject its @font-face
      // only when the Host has the file.
      useEffect(() => { void refreshXiaolaiFont() }, [])
      const [catalog, setCatalog] = useState(null)
      const [work, setWork] = useState(null)
      const [phase, setPhase] = useState('loading')
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const activeWorkflow = useWorkflowMode()
      const mathMode = activeWorkflow === 'math'
      const [envPrompt, setEnvPrompt] = useState('')
      const [workspaces, setWorkspaces] = useState([])
      const [workspacePrompt, setWorkspacePrompt] = useState(null)
      const workspaceTarget = useRef(null)
      const workspaceRequest = useRef(null)
      const inFlightSessions = useRef(new Set())
      const [reloadKey, setReloadKey] = useState(0)
      // A chapter the right column asked to open, held until the catalog knows it.
      const [deskRequest, setDeskRequest] = useState(null)
      // A 提取/答疑/习题 conversation the right column asked for, same deal.
      const [sessionRequest, setSessionRequest] = useState(null)
      const saveTimer = useRef(null)
      const noticeTimer = useRef(null)
      const bodyRef = useRef(null)
      const headingRef = useRef(null)
      const cardRefs = useRef(new Map())
      const chapterRefs = useRef(new Map())
      const pendingFocus = useRef('')
      const clickGuardRef = useRef(0)
      const workRef = useRef(null)

      const pendingSave = useRef(null)
      // Warm the vendored pdf.js (module + worker) while the page settles, so the
      // first "open PDF" does not pay for the download.
      useEffect(() => {
        const warm = () => { loadPdfjs().catch(() => {}) }
        if (typeof requestIdleCallback === 'function') {
          const handle = requestIdleCallback(warm, { timeout: 4000 })
          return () => {
            if (typeof cancelIdleCallback === 'function') cancelIdleCallback(handle)
          }
        }
        const timer = window.setTimeout(warm, 1500)
        return () => window.clearTimeout(timer)
      }, [])
      const freshPending = useRef(new Set())
      const creatingRef = useRef(false)
      const createSessionRef = useRef(null)
      const fileRefs = useRef(new Map())
      const previewRef = useRef(null)
      const previewToken = useRef(0)
      const previewPane = useRef(null)
      const previewBody = useRef(null)
      const pendingFileFocus = useRef('')
      const rootRef = useRef(null)
      const [artifacts, setArtifacts] = useState({})
      const artifactsRef = useRef({})
      const artifactsGen = useRef(0)
      const artifactsToken = useRef(new Map())
      const [counts, setCounts] = useState({})
      const countsRef = useRef({})
      const countsState = useRef({ pending: new Set(), tried: new Set() })
      const [preview, setPreview] = useState(null)
      const [reader, setReader] = useState(null)
      const [readerForceNew, setReaderForceNew] = useState(false)
      const readerRef = useRef(null)
      const readerDoc = useRef(null)
      const [viewToken, setViewToken] = useState(0)
      useEffect(() => {
        viewerBus.listeners.add(setViewToken)
        return () => {
          viewerBus.listeners.delete(setViewToken)
        }
      }, [])
      const readerStage = useRef(null)
      const readerPane = useRef(null)
      const pendingReaderFocus = useRef('')
      const [links, setLinks] = useState({})
      const linksRef = useRef({})
      const [renaming, setRenaming] = useState(null)
      const [picker, setPicker] = useState(null)
      // The HTML print page of one produced Markdown file (built on demand).
      const [printPage, setPrintPage] = useState(null)
      const [digest, setDigest] = useState(null)
      const [libs, setLibs] = useState({ items: [], activeId: '' })
      const [library, setLibrary] = useState(null)
      const [libBusy, setLibBusy] = useState(false)
      const [libError, setLibError] = useState('')
      const [updateBusy, setUpdateBusy] = useState(false)
      const [updateInfo, setUpdateInfo] = useState(null)
      const [marketUpdate, setMarketUpdate] = useState(null)
      const [updateOperation, setUpdateOperation] = useState(null)
      const [previewPdf, setPreviewPdf] = useState(() => {
        try {
          return window.localStorage.getItem('pdfdesk:preview-pdf') !== '0'
        } catch {
          return true
        }
      })
      const [allowNonPdfDelete, setAllowNonPdfDelete] = useState(() => {
        try {
          return window.localStorage.getItem('pdfdesk:delete-non-pdf') === '1'
        } catch {
          return false
        }
      })
      const [settingsOpen, setSettingsOpen] = useState(false)
      const [settingsTab, setSettingsTab] = useState('reading')
      // Which edge the vertical tool rail sits on; a page reload keeps the choice.
      const [railSide, setRailSide] = useState(() => {
        try {
          return window.localStorage.getItem('pdfdesk:rail-side') === 'left' ? 'left' : 'right'
        } catch {
          return 'right'
        }
      })
      // rough.js hand-drawn strength for shapes; 0 draws clean geometry.
      const [roughness, setRoughness] = useState(() => {
        try {
          const value = Number(window.localStorage.getItem('pdfdesk:roughness'))
          return Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1
        } catch {
          return 1
        }
      })
      const [socratic, setSocratic] = useState(() => socraticEnabled())
      const [questionInject, setQuestionInject] = useState(() => questionInjectEnabled())
      const [envTools, setEnvTools] = useState({ python: false, tex: false, apiKey: false })
      useEffect(() => {
        if (!settingsOpen) return undefined
        const onDown = event => {
          if (event.target instanceof Element && event.target.closest('.md-settings, .md-settings-modal, .md-settings-content, .md-settings-page, .md-picker') !== null) return
          setSettingsOpen(false)
        }
        const onKey = event => {
          if (event.key === 'Escape') setSettingsOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        window.addEventListener('keydown', onKey, true)
        return () => {
          document.removeEventListener('mousedown', onDown)
          window.removeEventListener('keydown', onKey, true)
        }
      }, [settingsOpen])
      const [sample, setSample] = useState(null)
      const [sampleBusy, setSampleBusy] = useState(false)
      const [importBusy, setImportBusy] = useState(false)
      const importInput = useRef(null)
      const [shelfGroups, setShelfGroups] = useState({ hidden: [], shelves: [] })
      const [group, setGroup] = useState(null)
      const groupRef = useRef(null)
      groupRef.current = group
      const [selected, setSelected] = useState(() => new Set())
      const [shelfName, setShelfName] = useState(null)
      const [marquee, setMarquee] = useState(null)
      const bootstrapSeq = useRef(0)
      const digestRef = useRef(false)
      const pendingDrafts = useRef(new Map())
      const pendingView = useRef('')
      const renameRef = useRef(null)
      const narrow = useNarrow(rootRef)
      const sessionList = useSessionList()
      const archivedIds = useArchivedIds()
      const [pending, setPending] = useState({})
      const pendingRef = useRef({})
      const [creatingKey, setCreatingKey] = useState('')
      const [creatingMode, setCreatingMode] = useState('')
      const [createError, setCreateError] = useState(null)

      useEffect(() => { workRef.current = work }, [work])
      useEffect(() => { pendingRef.current = pending }, [pending])
      useEffect(() => { artifactsRef.current = artifacts }, [artifacts])
      useEffect(() => { countsRef.current = counts }, [counts])
      useEffect(() => { previewRef.current = preview }, [preview])
      useEffect(() => { linksRef.current = links }, [links])
      useEffect(() => { renameRef.current = renaming }, [renaming])
      useEffect(() => { readerRef.current = reader }, [reader])

      const showNotice = useCallback(text => {
        setNotice(text)
        if (noticeTimer.current !== null) clearTimeout(noticeTimer.current)
        noticeTimer.current = setTimeout(() => {
          noticeTimer.current = null
          setNotice('')
        }, NOTICE_MS)
      }, [])

      /**
       * Write one position. `report` asks for the transient failure notice; a
       * teardown flush stays silent. The reader's last page rides along, so
       * leaving for a conversation and coming back reopens the same page.
       */
      const persist = useCallback((next, report) => {
        const shown = readerRef.current
        return request('PUT', 'state', {
          view: next.view,
          bookId: next.bookId,
          activeChapter: next.activeChapter,
          expandedByBook: next.expandedByBook,
          reader: shown === null || next.view !== 'book' ? null : {
            bookId: shown.bookId,
            code: shown.code,
            name: shown.name,
            page: shown.page,
            mode: shown.mode,
            scale: shown.scale,
          },
        }).catch(() => {
          if (report === true) showNotice(format('saveFailed'))
        })
      }, [showNotice])

      const save = useCallback(next => {
        pendingSave.current = next
        if (saveTimer.current !== null) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null
          const payload = pendingSave.current
          pendingSave.current = null
          if (payload !== null) void persist(payload, true)
        }, SAVE_DELAY_MS)
      }, [persist])

      // Unmounting (switching to a conversation) must not drop the last click.
      useEffect(() => () => {
        if (noticeTimer.current !== null) clearTimeout(noticeTimer.current)
        if (saveTimer.current !== null) {
          clearTimeout(saveTimer.current)
          saveTimer.current = null
        }
        const payload = pendingSave.current
        pendingSave.current = null
        if (payload !== null) void persist(payload, false)
      }, [persist])

      // A pending debounce would otherwise lose the last click on page close.
      useEffect(() => {
        const flush = () => {
          const current = pendingSave.current ?? workRef.current
          if (current === null) return
          if (saveTimer.current !== null) {
            clearTimeout(saveTimer.current)
            saveTimer.current = null
          }
          pendingSave.current = null
          const shown = readerRef.current
          try {
            fetch(ENDPOINT + 'state', {
              method: 'PUT',
              keepalive: true,
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                view: current.view,
                bookId: current.bookId,
                activeChapter: current.activeChapter,
                expandedByBook: current.expandedByBook,
                reader: shown === null || current.view !== 'book' ? null : {
                  bookId: shown.bookId,
                  code: shown.code,
                  name: shown.name,
                  page: shown.page,
                  mode: shown.mode,
                  scale: shown.scale,
                },
              }),
            })
          } catch {
            // Closing the page is not a place to report a failed save.
          }
        }
        window.addEventListener('pagehide', flush)
        return () => window.removeEventListener('pagehide', flush)
      }, [])

      const commit = useCallback(next => {
        setWork(next)
        save(next)
      }, [save])

      // Refresh must not re-read a state the debounce has not written yet.
      const flushSave = useCallback(() => {
        if (saveTimer.current !== null) {
          clearTimeout(saveTimer.current)
          saveTimer.current = null
        }
        const pending = pendingSave.current
        pendingSave.current = null
        const current = pending ?? workRef.current
        if (current === null) return Promise.resolve()
        return persist(current, false)
      }, [persist])

      const reload = useCallback(() => {
        setPreview(null)
        void flushSave().then(() => setReloadKey(key => key + 1))
      }, [flushSave])

      /**
       * Read one chapter's produced files. A chapter already read (or being
       * read) is left alone unless `force` asks again. A response that arrives
       * after a reload generation change is dropped.
       * @param {string} bookId - catalog book id.
       * @param {string} code - chapter code.
       * @param {boolean} [force] - re-read even when a listing is cached.
       * @returns {void}
       */
      const loadArtifacts = useCallback((bookId, code, force) => {
        const key = `${bookId}|${code}`
        const current = artifactsRef.current[key]
        if (force !== true && current !== undefined && current.phase !== 'error') return
        const generation = artifactsGen.current
        const token = (artifactsToken.current.get(key) ?? 0) + 1
        artifactsToken.current.set(key, token)
        const settle = entry => {
          if (artifactsGen.current !== generation) return
          if (artifactsToken.current.get(key) !== token) return
          artifactsRef.current = { ...artifactsRef.current, [key]: entry }
          setArtifacts(artifactsRef.current)
        }
        settle({ phase: 'loading', items: [], dir: current === undefined ? '' : current.dir ?? '', truncated: false, error: '' })
        const query = `artifacts?book=${encodeURIComponent(bookId)}&code=${encodeURIComponent(code)}`
        request('GET', query).then(data => {
          settle({
            phase: 'ready',
            items: Array.isArray(data.artifacts) ? data.artifacts : [],
            dir: typeof data.dir === 'string' ? data.dir : '',
            missing: data.missing === true,
            truncated: data.truncated === true,
            error: '',
          })
        }).catch(reason => {
          settle({ phase: 'error', items: [], dir: '', truncated: false, error: errorText(reason) })
        })
      }, [])

      /**
       * Read how many produced files each chapter of one book has, so a
       * collapsed row can say so without being opened first.
       * @param {string} bookId - catalog book id.
       * @param {number} generation - artifacts generation the answer belongs to.
       * @returns {void}
       */
      const loadCounts = useCallback((bookId, generation) => {
        const state = countsState.current
        if (state.pending.has(bookId)) return
        state.pending.add(bookId)
        state.tried.add(bookId)
        request('GET', `artifact-counts?book=${encodeURIComponent(bookId)}`).then(data => {
          if (artifactsGen.current !== generation) return
          const counts = data.counts !== null && typeof data.counts === 'object' ? data.counts : {}
          countsRef.current = { ...countsRef.current, [bookId]: counts }
          setCounts(countsRef.current)
        }).catch(() => {
          // Counts are a hint; the chapter still lists its files when opened.
        }).finally(() => {
          state.pending.delete(bookId)
        })
      }, [])

      const closePreview = useCallback(() => {
        const current = previewRef.current
        previewToken.current += 1
        // Focus is restored by the effect below, after the drawer is gone: in
        // the narrow overlay the list is inert until this render commits, and
        // focusing an inert element silently does nothing.
        pendingFileFocus.current = current === null
          ? ''
          : `${current.bookId}|${current.code}|${current.name}`
        setPreview(null)
      }, [])

      const registerFileRef = useCallback((key, node) => {
        if (node === null) fileRefs.current.delete(key)
        else fileRefs.current.set(key, node)
      }, [])

      const books = catalog === null ? [] : catalog.books
      const book = work !== null && work.view === 'book' ? books.find(item => item.id === work.bookId) ?? null : null
      const expanded = work !== null && work.bookId !== null && Array.isArray(work.expandedByBook[work.bookId])
        ? work.expandedByBook[work.bookId]
        : []
      const sessionIndex = buildSessionIndex(
        sessionList,
        books,
        catalog === null ? '' : catalog.target.cwd,
        pending,
        archivedIds,
        freshPending.current,
        links,
      )
      const sessionAvailable = sessionService() !== null

      const retryArtifacts = useCallback(code => {
        if (book === null) return
        loadArtifacts(book.id, code, true)
      }, [book, loadArtifacts])

      const reloadArtifacts = useCallback(code => {
        if (book === null) return
        loadArtifacts(book.id, code, true)
        countsState.current.tried.delete(book.id)
        loadCounts(book.id, artifactsGen.current)
      }, [book, loadArtifacts, loadCounts])

      const copyPath = useCallback(dir => {
        const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
        if (clipboard === undefined || typeof clipboard.writeText !== 'function') {
          showNotice(format('copyFailed'))
          return
        }
        void clipboard.writeText(dir)
          .then(() => showNotice(format('pathCopied')))
          .catch(() => showNotice(format('copyFailed')))
      }, [showNotice])

      /**
       * Open the in-page PDF reader for a chapter PDF or a produced PDF. Opening
       * the same document again keeps its page and zoom; `force` reloads it.
       * @param {{ bookId: string, code: string, title: string, fileName: string, name?: string, bookTitle?: string, page?: number }} target - what to open, optionally at a page.
       * @param {boolean} [force] - reload even when it is already open.
       * @returns {void}
       */
      const openReader = useCallback((target, force) => {
        pendingReaderFocus.current = target.code
        setPreview(null)
        setPicker(null)
        setRenaming(null)
        const name = target.name ?? ''
        const wanted = Number(target.page)
        const page = Number.isFinite(wanted) && wanted > 0 ? Math.round(wanted) : readReaderPage(target.bookId, target.code)
        // The width belongs to the book and the reading mode to everyone: both
        // are remembered across reader closes and app restarts.
        const rememberedWidth = readBookScale(target.bookId)
        const rememberedMode = readGlobalMode()
        // The chapter PDF shares one page with its right-column preview. A
        // produced PDF is a document of its own, so it keeps its page locally.
        // Only a real difference is announced: re-opening the same document must
        // not scroll both views back to the top of the page.
        if (name === '' && Number(readView(target.bookId, target.code).page) !== page) {
          setChapterPage(target.bookId, target.code, 'reader', page, 'load')
        }
        setReader(previous => {
          const same = previous !== null && previous.bookId === target.bookId
            && previous.code === target.code && previous.name === name
            && previous.variant === (target.variant ?? '')
          const focus = typeof target.questionFocus === 'string' ? target.questionFocus : ''
          if (same && force !== true && previous.phase !== 'error') {
            const limit = previous.count > 0 ? previous.count : page
            const next = Math.max(1, Math.min(limit, page))
            if (next === previous.page) {
              return { ...previous, title: target.title, bookTitle: target.bookTitle ?? previous.bookTitle, questionFocus: focus }
            }
            return {
              ...previous,
              title: target.title,
              bookTitle: target.bookTitle ?? previous.bookTitle,
              page: next,
              questionFocus: focus,
              jump: (previous.jump ?? 0) + 1,
            }
          }
          return {
            bookId: target.bookId,
            code: target.code,
            title: target.title,
            bookTitle: target.bookTitle ?? '',
            fileName: target.fileName ?? '',
            name,
            variant: target.variant ?? '',
            page,
            count: 0,
            scale: rememberedWidth === null ? null : rememberedWidth.scale,
            mode: rememberedMode ?? (target.mode === 'continuous' ? 'continuous' : 'single'),
            jump: 0,
            questionFocus: focus,
            phase: 'loading',
            error: '',
            attempt: same ? previous.attempt + 1 : 0,
          }
        })
      }, [])

      // Loading one document: the pdf.js build first, then its bytes from the
      // Host. The document is shared with the right column, so opening the
      // preview of the chapter being read reuses this parse instead of paying
      // for it a second time.
      useEffect(() => {
        if (reader === null) return undefined
        let cancelled = false
        let claim = null
        const load = async () => {
          try {
            const lib = await loadPdfjs()
            if (cancelled) return
            // The revision the other pane already adopted is part of the URL:
            // a rebuild and the preview then agree on which file they mean.
            const rev = Number(readView(reader.bookId, reader.code).docRev) || 0
            const url = chapterPdfUrl(reader.bookId, reader.code, {
              name: reader.name,
              variant: reader.variant === 'translated' ? 'translated' : '',
              rev,
              // A retry is a new attempt: it must not pick up the document it
              // just failed with.
              retry: reader.attempt,
            })
            claim = await sharedDocuments.claim(url, () => lib.getDocument({ url, isEvalSupported: false, ...pdfAssetUrls() }))
            if (cancelled) {
              claim.release()
              claim = null
              return
            }
            const doc = claim.doc
            readerDoc.current = doc
            // Only the source document owns the chapter's page count. A
            // translated file may have a different count; letting it publish one
            // would shrink the chapter's page (the render clamps instead).
            const sourceDoc = reader.name === '' && reader.variant !== 'translated'
            setReader(previous => previous === null ? null : {
              ...previous,
              page: sourceDoc ? Math.max(1, Math.min(doc.numPages || 1, previous.page || 1)) : previous.page,
              count: doc.numPages || 0,
              phase: 'ready',
              error: '',
            })
            if (sourceDoc) setChapterCount(reader.bookId, reader.code, doc.numPages || 0)
          } catch (error) {
            if (cancelled) return
            const name = error !== null && error !== undefined ? String(error.name) : ''
            if (name === 'AbortException' || name === 'RenderingCancelledException') return
            setReader(previous => previous === null ? null : { ...previous, phase: 'error', error: errorText(error) })
          }
        }
        void load()
        return () => {
          cancelled = true
          readerDoc.current = null
          if (claim !== null) {
            claim.release()
            claim = null
          }
        }
      }, [reader === null ? '' : `${reader.bookId}|${reader.code}|${reader.name}|${reader.attempt}`])

      /**
       * The scale that fits one page to the stage, clamped to sane zoom levels.
       * @param {number} baseWidth - the page's width at scale 1.
       * @returns {number} the scale to use.
       */
      const fitScale = useCallback(baseWidth => {
        const stage = readerStage.current
        const available = stage === null ? 0 : Math.max(0, stage.clientWidth - 48)
        const scale = available > 0 && baseWidth > 0 ? available / baseWidth : 1
        return Math.max(0.3, Math.min(3, Math.round(scale * 100) / 100))
      }, [])

      // The viewer paints pages itself; the workbench only records the scale a
      // fresh document settled on, so the toolbar shows the fit width as 100%.
      const readerScale = useCallback(scale => {
        setReader(previous => previous === null || previous.scale !== null ? previous : { ...previous, scale })
      }, [])

      // Every page move of a chapter PDF goes through the chapter's shared
      // page, so the preview, the page box, the annotation keys and the undo
      // keys can never be on different pages. A produced PDF is not a chapter,
      // so it keeps its page to itself.
      const readerPage = useCallback(page => {
        const shown = readerRef.current
        if (shown === null) return
        if (shown.name === '') {
          setChapterPage(shown.bookId, shown.code, 'reader', page, 'navigate')
          return
        }
        setReader(previous => {
          if (previous === null) return null
          const limit = previous.count > 0 ? previous.count : 1
          const next = Math.max(1, Math.min(limit, Math.round(page)))
          if (next === previous.page) return previous
          return { ...previous, page: next, jump: (previous.jump ?? 0) + 1 }
        })
      }, [])

      const readerPrev = useCallback(() => {
        const shown = readerRef.current
        if (shown === null || shown.page <= 1) return
        readerPage(shown.page - 1)
      }, [readerPage])

      const readerNext = useCallback(() => {
        const shown = readerRef.current
        if (shown === null) return
        const limit = shown.count > 0 ? shown.count : shown.page
        if (shown.page >= limit) return
        readerPage(shown.page + 1)
      }, [readerPage])

      /** A page scrolled into view in continuous mode: a report, never a jump. */
      const readerVisible = useCallback(page => {
        const shown = readerRef.current
        if (shown === null) return
        if (shown.name === '') {
          reportChapterPage(shown.bookId, shown.code, 'reader', page)
          return
        }
        setReader(previous => (previous === null || previous.page === page ? previous : { ...previous, page }))
      }, [])

      const readerMode = useCallback(mode => {
        // Two modes only: single and continuous are two views of the same notes.
        const next = mode === 'continuous' ? 'continuous' : 'single'
        writeGlobalMode(next)
        setReader(previous => previous === null
          ? null
          : { ...previous, mode: next, jump: (previous.jump ?? 0) + 1 })
      }, [])

      /** A continuous page failed to paint: surface it like a document error. */
      const readerError = useCallback(error => {
        setReader(previous => previous === null ? null : { ...previous, phase: 'error', error: errorText(error) })
      }, [])

      const readerZoom = useCallback(factor => {
        setReader(previous => {
          if (previous === null) return null
          const current = previous.scale ?? 1
          const scale = Math.max(0.3, Math.min(4, Math.round(current * factor * 100) / 100))
          writeBookScale(previous.bookId, scale)
          return { ...previous, scale }
        })
      }, [])

      const readerFit = useCallback(() => {
        setReader(previous => {
          if (previous === null) return null
          // "Fit" is a width choice of its own: remember it as fit, not as the
          // number a particular window size produced.
          writeBookScale(previous.bookId, null)
          return { ...previous, scale: null }
        })
      }, [])

      const closeReader = useCallback(() => setReader(null), [])

      // The right column follows this reader's zoom, mode and variant. The page
      // does not travel this way: it goes through setChapterPage /
      // reportChapterPage, which remember why it moved.
      const readerViewKey = reader === null
        ? ''
        : `${reader.bookId}|${reader.code}|${reader.scale}|${reader.mode}|${reader.variant}`
      useEffect(() => {
        const shown = readerRef.current
        if (shown === null) return
        syncView(shown.bookId, shown.code, {
          scale: shown.scale,
          mode: shown.mode,
          variant: shown.variant,
        }, 'reader')
      }, [readerViewKey])

      // The preview's page and reading mode come back here; its zoom never does.
      // A page this reader moved to is already on screen; one the preview moved
      // to carries a jump, so the reader scrolls there before anything is drawn
      // on the wrong page.
      const readerLinkKey = reader === null ? '' : `${reader.bookId}|${reader.code}`
      useEffect(() => {
        const shown = readerRef.current
        if (shown === null) return undefined
        return subscribeView(shown.bookId, shown.code, state => {
          if (typeof state.page === 'number') {
            const jumpTo = state.cause === 'navigate' || state.cause === 'load' || state.origin !== 'reader'
            setReader(previous => {
              if (previous === null) return null
              const wanted = Math.max(1, Math.round(state.page))
              const next = previous.count > 0 ? Math.min(previous.count, wanted) : wanted
              if (next === previous.page && !jumpTo) return previous
              return { ...previous, page: next, jump: jumpTo ? (previous.jump ?? 0) + 1 : (previous.jump ?? 0) }
            })
          }
          if (state.mode === 'single' || state.mode === 'continuous') {
            setReader(previous => (previous === null || previous.mode === state.mode
              ? previous
              : { ...previous, mode: state.mode, jump: (previous.jump ?? 0) + 1 }))
          }
        })
      }, [readerLinkKey])

      // Reader keyboard: every binding comes from the user's shortcut table
      // (Settings → 快捷键), whose defaults are the keys this reader has always
      // used. A text field keeps its own keys, except for the close gesture.
      useEffect(() => {
        if (reader === null) return undefined
        const stage = readerStage
        const onKeyDown = event => {
          const target = event.target
          // The in-place note editor owns Escape (cancel) and every other key
          // it types, in the reader and in the right column alike. This
          // listener runs in the capture phase on window, so it would otherwise
          // close the reader out from under an open note.
          if (target !== null && target !== undefined && typeof target.closest === 'function'
            && target.closest('.md-note-editor') !== null) return
          const action = shortcutActionOf(event)
          if (action === '') return
          const typing = target !== null && target !== undefined
            && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable === true)
          if (typing && action !== 'closeReader') return
          // Tool and page-box keys belong to the reader, which owns their state;
          // leaving them alone here lets that listener run unswallowed.
          if (READER_ACTIONS.has(action)) return
          event.preventDefault()
          if (action === 'closeReader') event.stopPropagation()
          if (action === 'closeReader') closeReader()
          else if (action === 'firstPage') readerPage(1)
          else if (action === 'lastPage') {
            const shown = readerRef.current
            if (shown !== null && shown.count > 0) readerPage(shown.count)
          } else if (action === 'prevPage') readerPrev()
          else if (action === 'nextPage') readerNext()
          else if (action === 'scrollUp' || action === 'scrollDown') {
            const node = stage === undefined ? null : stage.current
            if (node !== null) node.scrollBy({ top: action === 'scrollDown' ? 96 : -96, behavior: 'auto' })
          } else if (action === 'zoomIn') readerZoom(1.2)
          else if (action === 'zoomOut') readerZoom(1 / 1.2)
          else if (action === 'fitWidth') readerFit()
          else if (action === 'toggleMode') readerMode(reader.mode === 'single' ? 'continuous' : 'single')
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [closeReader, reader, readerFit, readerMode, readerNext, readerPage, readerPrev, readerZoom])

      // Opening the reader moves focus into it; closing returns it to the chapter.
      useEffect(() => {
        if (reader !== null) {
          if (readerPane.current !== null) readerPane.current.focus({ preventScroll: true })
          return
        }
        const code = pendingReaderFocus.current
        pendingReaderFocus.current = ''
        if (code === '') return
        const row = chapterRefs.current.get(code)
        if (row !== undefined) row.focus()
      }, [reader === null ? '' : `${reader.bookId}|${reader.code}|${reader.name}`])

      // Persist the reading position (open document, page, mode, zoom) with the
      // workbench position; `persist` reads the live reader at flush time.
      useEffect(() => {
        const current = workRef.current
        if (current === null) return
        save(current)
      }, [save, reader])


      /**
       * Open one produced file. Text opens the page's preview; a PDF opens the
       * reader; other binaries get the preview's note.
       * @param {object} chapter - the chapter the file belongs to.
       * @param {object} item - `{ name, kind, size, mtime }`.
       * @returns {void}
       */
      /** Right-click a .md artifact: render it to PDF next to the md. */
      const renderArtifact = useCallback(async (item, code) => {
        if (work === null || work.bookId === null) return
        if (!window.confirm(format('renderConfirm', { name: item.name }))) return
        showNotice(format('renderWorking'))
        try {
          await request('POST', 'render', { book: work.bookId, code, name: item.name })
          showNotice(format('renderDone', { name: item.name.replace(/\.md$/i, '.pdf') }))
          await reloadArtifacts(code)
        } catch (error) {
          showNotice(error !== null && error !== undefined && typeof error.message === 'string' && error.message !== ''
            ? error.message.slice(0, 240)
            : format('renderFailed'))
        }
      }, [reloadArtifacts, showNotice, work])

      /** Right-click a PDF artifact: move it to the library recycle bin. */
      const trashArtifact = useCallback(async (item, code) => {
        if (work === null || work.bookId === null) return
        if (!window.confirm(format('trashFileConfirm', { name: item.name }))) return
        try {
          await request('POST', 'trash-artifact', { book: work.bookId, code, name: item.name })
          showNotice(format('trashDone'))
          await reloadArtifacts(code)
        } catch (error) {
          showNotice(error !== undefined && error !== null && typeof error.message === 'string' ? error.message.slice(0, 200) : format('trashFailed'))
        }
      }, [reloadArtifacts, showNotice, work])

      /**
       * Build a printable HTML page for one Markdown product and show it. The
       * Host does the conversion; no TeX is involved and no PDF is written.
       * @param {object} item - `{ name, kind }`.
       * @param {string} code - chapter code.
       * @returns {void}
       */
      const printArtifact = useCallback((item, code) => {
        if (work === null || work.bookId === null || item === null || item === undefined) return
        if (!/\.md$/i.test(String(item.name ?? ''))) return
        const bookId = work.bookId
        const name = String(item.name)
        setPrintPage({ name, html: '', busy: true, error: '' })
        void request('POST', 'print-page', { book: bookId, code, name })
          .then(payload => {
            setPrintPage(current => (current === null || current.name !== name
              ? current
              : { ...current, html: typeof payload.html === 'string' ? payload.html : '', busy: false, error: '' }))
          })
          .catch(reason => {
            setPrintPage(current => (current === null || current.name !== name
              ? current
              : { ...current, html: '', busy: false, error: errorText(reason) }))
          })
      }, [work])

      /** Right-click a hidden book: move its chapter PDFs to the recycle bin. */
      const trashBook = useCallback(async bookId => {
        if (!window.confirm(format('trashBookConfirm', { id: bookId }))) return
        try {
          await request('POST', 'trash-book', { book: bookId })
          saveShelfGroups({
            hidden: shelfGroups.hidden.filter(id => id !== bookId),
            shelves: shelfGroups.shelves.map(shelf => ({ ...shelf, books: shelf.books.filter(id => id !== bookId) })),
          })
          showNotice(format('trashDone'))
          setGroup(null)
          setReloadKey(key => key + 1)
        } catch (error) {
          showNotice(error !== undefined && error !== null && typeof error.message === 'string' ? error.message.slice(0, 200) : format('trashFailed'))
        }
      }, [shelfGroups, showNotice])

      /** Button in the hidden shelf: trash every selected book, keep recoverable. */
      const trashSelected = useCallback(async () => {
        if (selected.size === 0) return
        if (!window.confirm(format('trashSelectedConfirm', { n: selected.size }))) return
        const ids = new Set(selected)
        const trashed = new Set()
        for (const id of selected) {
          try {
            await request('POST', 'trash-book', { book: id })
            trashed.add(id)
          } catch {
            // failed ones stay hidden instead of popping back into the library
          }
        }
        if (trashed.size === 0) {
          showNotice(format('trashFailed'))
          return
        }
        saveShelfGroups({
          hidden: shelfGroups.hidden.filter(id => !trashed.has(id)),
          shelves: shelfGroups.shelves.map(shelf => ({ ...shelf, books: shelf.books.filter(id => !trashed.has(id)) })),
        })
        showNotice(format('trashDone'))
        setSelected(new Set())
        setGroup('hidden')
        setWork(previous => previous === null ? previous : { ...previous, view: 'shelf', bookId: null, activeChapter: null })
        setReloadKey(key => key + 1)
      }, [selected, shelfGroups, showNotice])

      /** New session owned by one artifact file (M7.2). */
      const newArtifactSession = useCallback((chapter, item, mode, continuation) => {
        const stem = String(item.name).replace(/\.(md|pdf)$/i, '')
        const create = createSessionRef.current
        if (typeof create !== 'function') {
          showNotice('M7.2: session creator not ready')
          return
        }
        void create(chapter, mode, {
          jump: true,
          continuation: Number.isFinite(continuation) && continuation >= 2 ? continuation : 0,
          artifact: stem,
          skipPdf: true,
        })
      }, [showNotice])

      const chapterSessionId = (bookId, code) => {
        const groups = sessionIndex.byChapter.get(`${bookId}|${code}`)
        if (groups === undefined || groups === null) return ''
        for (const list of [groups.qa, groups.extract, groups.exercise, groups.general]) {
          if (Array.isArray(list) && list.length > 0 && typeof list[0].id === 'string') return list[0].id
        }
        return ''
      }

      const openArtifact = useCallback((chapter, item) => {
        if (book === null) return
        if (item.kind === 'pdf') {
          openReader({
            bookId: book.id,
            code: chapter.code,
            title: chapter.title,
            fileName: '',
            name: item.name,
            bookTitle: book.title,
          })
          return
        }
        // Word documents go to DSH's own document preview: the preview tab
        // speaks dsh-resource session addresses, and the chapter's existing
        // conversation gives us a session that can resolve the artifact path.
        if (item.kind === 'office') {
          const sessionId = chapterSessionId(book.id, chapter.code)
          if (sessionId === '') {
            showNotice(format('officeArtifactHint'))
            return
          }
          showNotice(format('officeOpening'))
          const query = new URLSearchParams({ book: book.id, code: chapter.code, name: item.name })
          void request('GET', `artifact-ref?${query.toString()}`).then(payload => {
            const rel = payload !== null && payload !== undefined && typeof payload.rel === 'string' ? payload.rel : ''
            const sidebar = clientContext === null ? null : clientContext.get('sidebarRight')
            if (rel === '' || sidebar === null || sidebar === undefined || typeof sidebar.openResource !== 'function') {
              showNotice(format('officeOpenFailed'))
              return
            }
            const path = rel.split('/').map(segment => encodeURIComponent(segment)).join('/')
            try {
              sidebar.openResource(`dsh-resource://file/session/${encodeURIComponent(sessionId)}/${path}`, { destination: 'sidebar' })
            } catch {
              showNotice(format('officeOpenFailed'))
            }
          }).catch(() => showNotice(format('officeOpenFailed')))
          return
        }
        const token = previewToken.current + 1
        previewToken.current = token
        const base = {
          bookId: book.id,
          code: chapter.code,
          chapterTitle: chapter.title,
          name: item.name,
          kind: item.kind,
          size: item.size,
          mtime: item.mtime,
          truncated: false,
          encoding: 'utf-8',
          error: '',
          errorCode: '',
        }
        if (item.kind !== 'text') {
          setPreview({ ...base, phase: 'unsupported', text: '' })
          return
        }
        setPreview({ ...base, phase: 'loading', text: '' })
        const query = `artifact?book=${encodeURIComponent(book.id)}&code=${encodeURIComponent(chapter.code)}&name=${encodeURIComponent(item.name)}`
        request('GET', query).then(data => {
          if (previewToken.current !== token) return
          setPreview(previous => previous === null ? null : {
            ...previous,
            kind: typeof data.kind === 'string' ? data.kind : previous.kind,
            phase: 'ready',
            text: typeof data.text === 'string' ? data.text : '',
            size: typeof data.size === 'number' ? data.size : previous.size,
            mtime: typeof data.mtime === 'number' ? data.mtime : previous.mtime,
            truncated: data.truncated === true,
            encoding: typeof data.encoding === 'string' ? data.encoding : 'utf-8',
            error: '',
            errorCode: '',
          })
        }).catch(reason => {
          if (previewToken.current !== token) return
          setPreview(previous => previous === null ? null : {
            ...previous,
            phase: 'error',
            error: errorText(reason),
            errorCode: typeof reason?.code === 'string' ? reason.code : '',
          })
        })
      }, [book, openReader, showNotice])

      const retryPreview = useCallback(() => {
        const current = previewRef.current
        if (current === null) return
        openArtifact({ code: current.code, title: current.chapterTitle }, {
          name: current.name,
          kind: current.kind,
          size: current.size,
          mtime: current.mtime,
        })
      }, [openArtifact])

      // Escape is the drawer's second way out; the row underneath keeps focus.
      // Capture phase, so a host shortcut cannot take the key first.
      useEffect(() => {
        if (preview === null) return undefined
        const onKeyDown = event => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          closePreview()
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [closePreview, preview])

      // The import dialog is modal; Escape closes it wherever focus is.
      useEffect(() => {
        if (picker === null) return undefined
        const onKeyDown = event => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          setPicker(null)
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [picker])

      // The outline dialog is modal too.
      useEffect(() => {
        if (digest === null) return undefined
        const onKeyDown = event => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          setDigest(null)
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [digest])

      // The shelf-name dialog is modal too.
      useEffect(() => {
        if (shelfName === null) return undefined
        const onKeyDown = event => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          setShelfName(null)
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [shelfName])


      // Opening a preview moves focus into the scrollable text so PageDown and
      // arrow keys work; closing puts it back on the row that opened it.
      useEffect(() => {
        if (preview === null) {
          const key = pendingFileFocus.current
          pendingFileFocus.current = ''
          const node = key === '' ? undefined : fileRefs.current.get(key)
          if (node !== undefined) node.focus()
          return
        }
        if (previewBody.current !== null) previewBody.current.focus({ preventScroll: true })
        else if (previewPane.current !== null) previewPane.current.focus({ preventScroll: true })
      }, [preview === null ? '' : `${preview.code}|${preview.name}`, preview === null ? '' : preview.phase])

      // Every expanded chapter of the open book is listed, so its row can say
      // how many files it has without being opened first; one scan of the book's
      // directories covers the collapsed rows.
      useEffect(() => {
        if (work === null || work.view !== 'book' || work.bookId === null) return
        const bookId = work.bookId
        const codes = Array.isArray(work.expandedByBook[bookId]) ? work.expandedByBook[bookId] : []
        for (const code of codes) loadArtifacts(bookId, code)
        if (countsRef.current[bookId] === undefined && !countsState.current.tried.has(bookId)) {
          loadCounts(bookId, artifactsGen.current)
        }
      }, [loadArtifacts, loadCounts, work])


      // Load the catalog and the stored position; `reloadKey` re-runs it.
      useEffect(() => {
        let alive = true
        // A reload after a library switch must not flash the loading state, and a
        // stale response from an earlier switch must not win the race.
        setPhase(previous => previous === 'ready' ? previous : 'loading')
        setError('')
        const sequence = bootstrapSeq.current + 1
        bootstrapSeq.current = sequence
        const forcedView = pendingView.current
        pendingView.current = ''
        request('GET', 'bootstrap').then(data => {
          if (!alive || sequence !== bootstrapSeq.current) return
          const books = Array.isArray(data.books) ? data.books : []
          const stored = data.state !== null && typeof data.state === 'object' ? data.state : {}
          const expandedByBook = {}
          const rawMap = stored.expandedByBook !== null && typeof stored.expandedByBook === 'object' ? stored.expandedByBook : {}
          for (const [id, codes] of Object.entries(rawMap)) {
            if (Array.isArray(codes)) expandedByBook[id] = codes.filter(code => typeof code === 'string')
          }
          const known = typeof stored.bookId === 'string' && books.some(book => book.id === stored.bookId)
          const libraryId = data.library !== null && typeof data.library === 'object' && typeof data.library.id === 'string' ? data.library.id : ''
          const storedWorkspace = readStoredWorkspace(libraryId)
          const storedWorkspaceEntry = storedWorkspace !== null && Array.isArray(data.workspaces)
            ? data.workspaces.find(item => item !== null && typeof item === 'object' && item.id === storedWorkspace.workspaceId)
            : null
          if (storedWorkspace !== null && storedWorkspaceEntry === undefined) clearStoredWorkspace(libraryId)
          const effectiveTarget = storedWorkspaceEntry !== null && storedWorkspaceEntry !== undefined
            ? { workspaceId: storedWorkspaceEntry.id, cwd: typeof storedWorkspaceEntry.path === 'string' ? storedWorkspaceEntry.path : storedWorkspace.cwd }
            : data.target !== null && typeof data.target === 'object'
              ? {
                workspaceId: typeof data.target.workspaceId === 'string' && data.target.workspaceId !== '' ? data.target.workspaceId : null,
                cwd: typeof data.target.cwd === 'string' ? data.target.cwd : '',
              }
              : { workspaceId: null, cwd: '' }
          workspaceTarget.current = effectiveTarget.workspaceId === null ? null : effectiveTarget
          setCatalog({
            books,
            skipped: Array.isArray(data.skipped) ? data.skipped : [],
            warnings: Array.isArray(data.warnings) ? data.warnings : [],
            source: data.source === 'index.json' ? 'index.json' : 'scan',
            indexIgnored: data.indexIgnored === true,
            problem: data.problem !== null && typeof data.problem === 'object' ? data.problem : null,
            version: typeof data.version === 'string' ? data.version : '0.0.0',
            libraryId: data.library !== null && typeof data.library === 'object' && typeof data.library.id === 'string' ? data.library.id : '',
            covers: new Set(Array.isArray(data.covers) ? data.covers : []),
            libraryDir: typeof data.libraryDir === 'string' ? data.libraryDir : '',
            fragmentDir: typeof data.fragmentDir === 'string' ? data.fragmentDir : '',
            artifactDir: typeof data.artifactDir === 'string' ? data.artifactDir : '',
            resumeRatio: typeof data.resumeRatio === 'number' ? data.resumeRatio : 0.85,
            target: effectiveTarget,
          })
          setLibs(data.libraries !== null && typeof data.libraries === 'object' && Array.isArray(data.libraries.items)
            ? { items: data.libraries.items, activeId: typeof data.libraries.activeId === 'string' ? data.libraries.activeId : '' }
            : { items: [], activeId: '' })
          setLibrary(data.library !== null && typeof data.library === 'object' ? data.library : null)
          const groups = data.shelves !== null && typeof data.shelves === 'object' ? data.shelves : {}
          const hidden = Array.isArray(groups.hidden) ? groups.hidden.filter(id => typeof id === 'string') : []
          const shelves = Array.isArray(groups.shelves)
            ? groups.shelves.filter(item => item !== null && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string')
            : []
          setEnvTools(data.environment !== null && typeof data.environment === 'object' ? { python: data.environment.python === true, tex: data.environment.tex === true, apiKey: data.environment.apiKey === true } : { python: false, tex: false, apiKey: false })
          setWorkspaces(Array.isArray(data.workspaces)
            ? data.workspaces.filter(item => item !== null && typeof item === 'object'
              && typeof item.id === 'string' && typeof item.path === 'string')
            : [])
          setShelfGroups({ hidden, shelves })
          // Refresh re-reads data; it must not lose the shelf you are looking at.
          setGroup(previous => {
            if (previous === null) return previous
            if (previous === 'hidden') return hidden.length === 0 ? null : 'hidden'
            return shelves.some(shelf => shelf.id === previous) ? previous : null
          })
          setSelected(new Set())
          const emptyLibrary = books.length === 0
          const forced = forcedView
          const nextView = emptyLibrary
            ? 'libraries'
            : forced === 'shelf'
              ? 'shelf'
              : forced === 'libraries'
                ? 'libraries'
                : workRef.current !== null
                  ? (workRef.current.view === 'book' && !known ? 'shelf' : workRef.current.view)
                  : stored.view === 'book' && known
                    ? 'book'
                    : stored.view === 'libraries'
                      ? 'libraries'
                      : 'shelf'
          trace('bootstrap', 'forced=', forced, 'stored=', stored.view, 'books=', books.length, 'view=', nextView)
          setWork({
            view: nextView,
            bookId: nextView === 'book'
              ? (workRef.current !== null && typeof workRef.current.bookId === 'string' && known ? workRef.current.bookId : stored.bookId)
              : null,
            activeChapter: typeof stored.activeChapter === 'string' ? stored.activeChapter : null,
            expandedByBook,
          })
          setPending(data.pending !== null && typeof data.pending === 'object' ? data.pending : {})
          setLinks(data.links !== null && typeof data.links === 'object' ? data.links : {})
          // Reopen the reader where it was left (the last visit was a chapter
          // page with a PDF open), so returning from a conversation lands back
          // in the same page.
          const storedReader = stored.reader !== null && typeof stored.reader === 'object' ? stored.reader : null
          if (storedReader !== null && stored.view === 'book' && known) {
            const restoreBook = books.find(item => item.id === storedReader.bookId)
            const restoreChapter = restoreBook === undefined || !Array.isArray(restoreBook.chapters)
              ? undefined
              : restoreBook.chapters.find(item => item.code === storedReader.code)
            if (restoreBook !== undefined && restoreChapter !== undefined) {
              const rememberedWidth = readBookScale(restoreBook.id)
              setReader({
                bookId: restoreBook.id,
                code: restoreChapter.code,
                title: restoreChapter.title ?? '',
                bookTitle: restoreBook.title,
                fileName: restoreChapter.file ?? '',
                name: typeof storedReader.name === 'string' ? storedReader.name : '',
                page: typeof storedReader.page === 'number' ? storedReader.page : 1,
                count: 0,
                // The book's own width and the global mode outrank the last
                // position: they are the reader's standing choice.
                scale: rememberedWidth !== null
                  ? rememberedWidth.scale
                  : (typeof storedReader.scale === 'number' ? storedReader.scale : null),
                mode: readGlobalMode() ?? (storedReader.mode === 'continuous' ? 'continuous' : 'single'),
                jump: 0,
                phase: 'loading',
                error: '',
                attempt: 0,
              })
            }
          }
          // A refresh re-reads produced files instead of trusting the old cache;
          // requests still in flight belong to the previous generation.
          artifactsGen.current += 1
          artifactsRef.current = {}
          artifactsToken.current = new Map()
          countsRef.current = {}
          countsState.current = { pending: new Set(), tried: new Set() }
          setArtifacts({})
          setCounts({})
          setPhase('ready')
        }).catch(reason => {
          if (!alive) return
          setPhase('error')
          setError(errorText(reason))
        })
        return () => { alive = false }
      }, [reloadKey])

      const openBook = useCallback(id => {
        pendingFocus.current = 'heading'
        setCreateError(null)
        setPreview(null)
        // Rapid taps that opened the book must not fall through onto the chapter
        // rows that appear under the cursor on the next screen.
        clickGuardRef.current = Date.now() + 400
        const expandedByBook = work === null ? {} : work.expandedByBook
        commit({ view: 'book', bookId: id, activeChapter: null, expandedByBook })
      }, [commit, work])

      const backToShelf = useCallback(() => {
        if (work !== null && work.bookId !== null) pendingFocus.current = `card:${work.bookId}`
        setCreateError(null)
        setPreview(null)
        commit({ view: 'shelf', bookId: null, activeChapter: null, expandedByBook: work === null ? {} : work.expandedByBook })
      }, [commit, work])

      const toggleChapter = useCallback(code => {
        if (work === null || work.bookId === null) return
        const expandedByBook = { ...work.expandedByBook }
        const current = Array.isArray(expandedByBook[work.bookId]) ? expandedByBook[work.bookId] : []
        const opening = !current.includes(code)
        const next = opening ? current.concat([code]) : current.filter(item => item !== code)
        if (next.length === 0) delete expandedByBook[work.bookId]
        else expandedByBook[work.bookId] = next
        commit({ view: 'book', bookId: work.bookId, activeChapter: code, expandedByBook })
        if (opening) {
          loadArtifacts(work.bookId, code)
          return
        }
        // Collapsing the chapter whose file is open would leave the drawer with
        // no row to return focus to, so close it here and land on the chapter.
        const shown = previewRef.current
        if (shown !== null && shown.bookId === work.bookId && shown.code === code) {
          previewToken.current += 1
          pendingFileFocus.current = ''
          setPreview(null)
          const row = chapterRefs.current.get(code)
          if (row !== undefined) row.focus()
        }
      }, [commit, loadArtifacts, work])

      const openPdf = useCallback((chapter, variant) => {
        if (work === null || work.bookId === null) return
        const current = Array.isArray(work.expandedByBook[work.bookId]) ? work.expandedByBook[work.bookId] : []
        if (!current.includes(chapter.code)) {
          commit({
            view: 'book',
            bookId: work.bookId,
            activeChapter: chapter.code,
            expandedByBook: { ...work.expandedByBook, [work.bookId]: current.concat([chapter.code]) },
          })
        }
        openReader({
          bookId: work.bookId,
          code: chapter.code,
          title: chapter.title,
          fileName: chapter.file,
          variant: variant === 'translated' ? 'translated' : '',
          bookTitle: book === null ? '' : book.title,
        })
      }, [book, commit, openReader, work])

      /**
       * Jump to one question mark: open the chapter's PDF at its page and flash
       * the rectangle. This never opens, creates or switches a conversation.
       * @param {object} chapter - catalog chapter row.
       * @param {object} question - the mark to show.
       * @returns {void}
       */
      const openQuestionRow = useCallback((chapter, question) => {
        if (book === null || catalog === null || question === null || question === undefined) return
        const entry = catalog.books.find(candidate => candidate.id === book.id)
        openReader({
          bookId: book.id,
          code: chapter.code,
          title: chapter.title ?? '',
          fileName: chapter.file ?? '',
          bookTitle: entry === undefined ? '' : entry.title,
          page: Math.max(1, Math.round(Number(question.page) || 1)),
          questionFocus: String(question.id ?? ''),
        })
      }, [book, catalog, openReader])

      /**
       * Open the chapter the right column asked for: switch the page to its book
       * when needed, so 返回章节 lands next to it, then open the reader at the
       * requested page.
       * @param {{ bookId: string, code: string, page: number }} target - the request.
       * @returns {void}
       */
      const openFromSide = useCallback(target => {
        if (catalog === null) return
        const entry = catalog.books.find(candidate => candidate.id === target.bookId)
        const chapter = entry === undefined
          ? undefined
          : (entry.chapters ?? []).find(candidate => candidate.code === target.code)
        if (entry === undefined || chapter === undefined) {
          showNotice(format('sideForeign'))
          return
        }
        if (workRef.current === null || workRef.current.bookId !== target.bookId) openBook(target.bookId)
        openReader({
          bookId: target.bookId,
          code: chapter.code,
          title: chapter.title ?? '',
          fileName: chapter.file ?? '',
          bookTitle: entry.title ?? '',
          page: target.page,
        })
      }, [catalog, openBook, openReader, showNotice])

      // The right column's 在工作台打开 arrives here; a request made while the
      // catalog was still loading is replayed once it lands.
      useEffect(() => {
        const listener = target => setDeskRequest(target)
        deskOpenListeners.add(listener)
        if (pendingDeskOpen !== null) {
          const target = pendingDeskOpen
          pendingDeskOpen = null
          listener(target)
        }
        return () => { deskOpenListeners.delete(listener) }
      }, [])
      useEffect(() => {
        if (deskRequest === null || catalog === null) return
        setDeskRequest(null)
        openFromSide(deskRequest)
      }, [catalog, deskRequest, openFromSide])

      // The right column's 跳到会话 arrives on the same pattern; the request is
      // processed after resumeOrCreate is defined below, because it needs it.
      useEffect(() => {
        const listener = target => setSessionRequest(target)
        deskSessionListeners.add(listener)
        if (pendingDeskSession !== null) {
          const target = pendingDeskSession
          pendingDeskSession = null
          listener(target)
        }
        return () => { deskSessionListeners.delete(listener) }
      }, [])

      // A double click's first click already toggled the row; `detail > 1` is its second click.
      const onClickRow = useCallback((event, chapter) => {
        if (Date.now() < clickGuardRef.current) return
        toggleChapter(chapter.code)
      }, [toggleChapter])

      const openSessionRow = useCallback(id => {
        const outline = pendingDrafts.current.get(id)
        if (outline === undefined) {
          // A resumed Q&A session never saw the Socratic persona (it is only
          // pre-filled at creation); put it back before the host conversation
          // opens, once per session.
          const summary = sessionList === null || sessionList.byId === undefined ? undefined : sessionList.byId[id]
          const parsed = summary === undefined ? null : parseSessionTitle(summary.title)
          if (parsed !== null && parsed.mode === 'qa') void seedQaPersona(id)
          if (!openHostSession(id)) showNotice(format('sessionUnavailable'))
          return
        }
        // A continuation created from the chapter page carries its outline only as
        // a remembered string; apply it now, while the session is about to open.
        // (It was already seeded with the persona at creation, if it is a Q&A one.)
        pendingDrafts.current.delete(id)
        void (async () => {
          const prefill = await beginPrefill(id, outline)
          if (!openHostSession(id)) showNotice(format('sessionUnavailable'))
          if (prefill.applied) showNotice(format('sessionWithOutline'))
          if (prefill.reference !== null) {
            window.setTimeout(() => {
              try { prefill.reference.release() } catch { /* already released */ }
            }, 500)
          }
        })()
      }, [sessionList, showNotice])

      const refreshSessions = useCallback(() => {
        const sessions = sessionService()
        if (sessions !== null && typeof sessions.refresh === 'function') void sessions.refresh().catch(() => {})
      }, [])

      /**
       * Open the import dialog for one chapter's mode group.
       * @param {object} chapter - the chapter to attach to.
       * @param {string} mode - the group's mode.
       * @returns {void}
       */
      const openImport = useCallback((chapter, mode) => {
        if (work === null || work.bookId === null) return
        setPreview(null)
        setRenaming(null)
        setPicker({ bookId: work.bookId, code: chapter.code, title: chapter.title ?? '', mode })
      }, [work])

      const closeImport = useCallback(() => setPicker(null), [])

      /**
       * Attach one existing session to the chapter the dialog was opened for.
       * @param {string} sessionId - the chosen session.
       * @param {string} label - its title, for the confirmation notice.
       * @returns {void}
       */
      const importSession = useCallback((sessionId, label) => {
        const target = picker
        if (target === null) return
        setPicker(null)
        request('POST', 'links', { sessionId, bookId: target.bookId, code: target.code, mode: target.mode })
          .then(payload => {
            if (payload.links !== null && typeof payload.links === 'object') setLinks(payload.links)
            refreshSessions()
            showNotice(format('importDone', { title: label }))
          })
          .catch(reason => showNotice(`${format('importFailed')} (${errorText(reason)})`))
      }, [picker, refreshSessions, showNotice])

      /**
       * Detach one chapter from a linked session; its title and other chapters
       * are left alone.
       * @param {object} row - the session row, carrying its link.
       * @returns {void}
       */
      const unlinkSession = useCallback(row => {
        const link = row.link
        if (link === undefined) return
        request('POST', 'links/remove', { sessionId: row.id, bookId: link.bookId, code: link.code })
          .then(payload => {
            if (payload.links !== null && typeof payload.links === 'object') setLinks(payload.links)
            showNotice(format('unlinkDone'))
          })
          .catch(reason => showNotice(`${format('importFailed')} (${errorText(reason)})`))
      }, [showNotice])

      /**
       * Start editing one session row's title, in the chapter it was clicked in.
       * @param {object} chapter - the chapter the row is shown under.
       * @param {object} row - the session row.
       * @returns {void}
       */
      const startRename = useCallback((chapter, row) => {
        if (work === null || work.bookId === null) return
        setPreview(null)
        setPicker(null)
        setRenaming({
          sessionId: row.id,
          bookId: work.bookId,
          code: chapter.code,
          value: row.title === '' ? row.displayTitle : row.title,
          saving: false,
          error: '',
        })
      }, [work])

      const renameInput = useCallback(value => {
        setRenaming(previous => previous === null ? null : { ...previous, value, error: '' })
      }, [])

      const cancelRename = useCallback(() => setRenaming(null), [])

      const commitRename = useCallback(async () => {
        const current = renameRef.current
        if (current === null || current.saving) return
        const title = String(current.value).trim()
        if (title === '') {
          setRenaming({ ...current, error: format('renameEmpty') })
          return
        }
        setRenaming({ ...current, saving: true, error: '' })
        try {
          await renameSession(current.sessionId, title)
          setRenaming(null)
          refreshSessions()
          showNotice(format('renameDone'))
        } catch (reason) {
          setRenaming(previous => previous === null ? null : {
            ...previous,
            saving: false,
            error: `${format('renameFailed')} (${errorText(reason)})`,
          })
        }
      }, [refreshSessions, showNotice])

      const removePendingRecord = useCallback(async id => {
        freshPending.current.delete(id)
        setPending(previous => {
          if (!(id in previous)) return previous
          const next = { ...previous }
          delete next[id]
          return next
        })
        try {
          const payload = await request('POST', 'pending/remove', { sessionId: id })
          if (payload.pending !== null && typeof payload.pending === 'object') setPending(payload.pending)
        } catch {
          // The local removal above is enough; a stale record expires on the next settle.
        }
      }, [])

      const registerPending = useCallback(async record => {
        freshPending.current.add(record.sessionId)
        const payload = await request('POST', 'pending', record)
        if (payload.pending !== null && typeof payload.pending === 'object') setPending(payload.pending)
      }, [])

      /** Bring the workbench panel back if archiving a selected session cleared it. */
      const restorePanel = useCallback(() => {
        const layout = clientContext === null ? null : clientContext.get('layout')
        if (layout === null || layout === undefined || typeof layout.selectPanel !== 'function') return
        const info = layout.panelInfo
        const active = info !== undefined && typeof info.getSnapshot === 'function'
          ? info.getSnapshot().activePanelId
          : PANEL_ID
        if (active !== PANEL_ID) layout.selectPanel(PANEL_ID)
      }, [])

      const archiveSessionRow = useCallback(async id => {
        const workspaces = workspacesService()
        if (workspaces === null || typeof workspaces.archiveSession !== 'function') return false
        try {
          await workspaces.archiveSession(id)
          return true
        } catch {
          return false
        } finally {
          restorePanel()
        }
      }, [restorePanel])

      /**
       * Resolve every session the workbench started but nobody used: a started
       * one gets its workbench title; an unused blank is archived and forgotten.
       * Legacy titled blanks from earlier versions are archived too. `keepId` is
       * the blank about to be reused by the current New and is left alone.
       * @param {string | null | undefined} keepId - a blank to leave alone.
       * @param {boolean} [force] - also archive the currently selected blank (explicit cleanup).
       */
      const settlePending = useCallback(async (keepId, force) => {
        const sessions = sessionService()
        if (sessions === null || sessions.list === undefined) return
        const list = sessions.list.getSnapshot()
        // Only settle against a complete list; a pending phase would look like "session gone".
        if (list === null || list.phase !== 'ready' || list.byId === undefined) return
        const targetPath = catalog === null ? '' : catalog.target.cwd
        const pending = pendingRef.current
        let archived = 0
        for (const [id, entry] of Object.entries(pending)) {
          if (id === keepId) continue
          const summary = list.byId[id]
          if (summary === undefined) {
            await removePendingRecord(id)
            continue
          }
          if (summary.blank === true) {
            // The selected blank must not be archived automatically: that would
            // clear the main selection and pull the page into the Conversation.
            if (force !== true && sessionIsRetained(id)) continue
            if (await archiveSessionRow(id)) archived += 1
            await removePendingRecord(id)
            continue
          }
          try {
            await renameSession(id, entry.title)
            await removePendingRecord(id)
          } catch {
            // Try again on the next mount or creation.
          }
        }
        // Blanks left by earlier versions already carry a workbench title.
        const workspaces = workspacesService()
        const archivedIds = workspaces === null || workspaces.list === undefined
          ? NO_IDS
          : new Set(workspaces.list.getSnapshot().archivedSessionIds ?? [])
        for (const id of list.ids) {
          if (id === keepId || id in pending || archivedIds.has(id)) continue
          const summary = list.byId[id]
          if (summary === undefined || summary.blank !== true || summary.origin === 'subagent') continue
          if (pendingDrafts.current.has(id)) continue
          if (typeof summary.cwd === 'string' && summary.cwd !== '' && targetPath !== '' && !sameDirectory(summary.cwd, targetPath)) continue
          if (parseSessionTitle(summary.title) === null) continue
          if (force !== true && sessionIsRetained(id)) continue
          if (await archiveSessionRow(id)) archived += 1
        }
        if (archived > 0) {
          refreshSessions()
          showNotice(format('cleanupNotice', { n: archived }))
        }
      }, [archiveSessionRow, catalog, refreshSessions, removePendingRecord, showNotice])

      /**
       * Find an existing untitled blank in the target Workspace, so New reuses
       * the workspace's blank instead of leaving another corpse behind. Titled
       * blanks are never reused: their stale title would stick to the session.
       * @returns {string | null} the blank session id.
       */
      const findReusableBlank = useCallback(() => {
        const sessions = sessionService()
        const workspaces = workspacesService()
        if (sessions === null || sessions.list === undefined || catalog === null) return null
        const list = sessions.list.getSnapshot()
        if (list === null || list.phase !== 'ready' || list.byId === undefined) return null
        const target = catalog.target
        const archivedIds = workspaces === null || workspaces.list === undefined
          ? NO_IDS
          : new Set(workspaces.list.getSnapshot().archivedSessionIds ?? [])
        // A split conversation holds the split preset as its composer draft while
        // it is still blank; adopting it would hand that preset to a chapter.
        const splitIds = storedSplitSessionIds()
        const workspace = target.workspaceId !== null && workspaces !== null && workspaces.list !== undefined
          ? workspaces.list.getSnapshot().items.find(item => item.workspaceId === target.workspaceId)
          : undefined
        for (const id of list.ids) {
          if (archivedIds.has(id)) continue
          if (splitIds.has(id)) continue
          const summary = list.byId[id]
          if (summary === undefined || summary.blank !== true || summary.origin === 'subagent') continue
          // A workbench-created pending blank already carries one preset prompt
          // (or is about to). Reusing it for another mode would append the next
          // preset to that draft; leave it for cleanup instead.
          if (id in (pendingRef.current ?? {}) || freshPending.current.has(id)) continue
          if (pendingDrafts.current.has(id)) continue
          if (typeof summary.title === 'string' && summary.title !== '') continue
          if (typeof summary.cwd === 'string' && summary.cwd !== '' && target.cwd !== '' && !sameDirectory(summary.cwd, target.cwd)) continue
          if (workspace !== undefined && Array.isArray(workspace.sessionIds) && !workspace.sessionIds.includes(id)) continue
          return id
        }
        return null
      }, [catalog])

      /**
       * The session a chapter's mode group should continue, if any: the newest
       * titled session for that chapter and mode, or a pending blank created but
       * never sent. Linked (imported) placements are deliberately not candidates:
       * a conversation keeps the chapter its own title names.
       * @param {string} bookId - catalog book id.
       * @param {string} code - chapter code.
       * @param {string} mode - the group.
       * @returns {{ id: string, pending: boolean } | null} the session to continue.
       */
      const findCurrentSession = useCallback((bookId, code, mode) => {
        for (const [id, entry] of Object.entries(pendingRef.current ?? {})) {
          if (entry.bookId !== bookId || entry.code !== code || entry.mode !== mode) continue
          const summary = sessionList === null || sessionList.byId === undefined ? undefined : sessionList.byId[id]
          if (summary !== undefined && summary.blank !== true) continue
          if (archivedIds.has(id)) continue
          return { id, pending: true, blank: true }
        }
        if (sessionList === null || sessionList === undefined || sessionList.phase !== 'ready' || !Array.isArray(sessionList.ids)) return null
        let best = null
        for (const id of sessionList.ids) {
          const summary = sessionList.byId[id]
          if (summary === undefined || archivedIds.has(id) || summary.origin === 'subagent') continue
          const parsed = parseSessionTitle(summary.title)
          if (parsed === null || parsed.code !== code || parsed.mode !== mode) continue
          const book = books.find(item => item.id === parsed.bookKey)
            ?? books.find(item => item.title === parsed.bookKey)
          if (book === undefined || book.id !== bookId) continue
          const updatedAt = typeof summary.updatedAt === 'number' ? summary.updatedAt : 0
          if (best === null || updatedAt > best.updatedAt) best = { id, updatedAt, blank: summary.blank === true }
        }
        return best === null ? null : { id: best.id, pending: false, blank: best.blank }
      }, [archivedIds, books, sessionList])

      /**
       * The next chain number for one chapter and mode (0 when the first
       * session is still missing).
       * @param {string} bookId - catalog book id.
       * @param {string} code - chapter code.
       * @param {string} mode - the group.
       * @returns {number} the number a continuation title should carry.
       */
      const nextContinuation = useCallback((bookId, code, mode) => {
        if (sessionList === null || sessionList === undefined || !Array.isArray(sessionList.ids)) return 0
        let max = 0
        for (const id of sessionList.ids) {
          const summary = sessionList.byId[id]
          if (summary === undefined || archivedIds.has(id) || summary.origin === 'subagent') continue
          const parsed = parseSessionTitle(summary.title)
          if (parsed === null || parsed.code !== code || parsed.mode !== mode) continue
          const book = books.find(item => item.id === parsed.bookKey)
            ?? books.find(item => item.title === parsed.bookKey)
          if (book === undefined || book.id !== bookId) continue
          max = Math.max(max, continuationOf(summary.title))
        }
        return max === 0 ? 0 : max + 1
      }, [archivedIds, books, sessionList])

      /**
       * Read the chapter outline saved by the digest, if one exists.
       * @param {string} bookId - catalog book id.
       * @param {string} code - chapter code.
       * @returns {Promise<string>} the outline Markdown, or an empty string.
       */
      const loadOutline = useCallback(async (bookId, code) => {
        try {
          const payload = await request('GET', `artifact?book=${encodeURIComponent(bookId)}&code=${encodeURIComponent(code)}&name=${encodeURIComponent('提纲-all.md')}`)
          return typeof payload.text === 'string' ? payload.text : ''
        } catch {
          return ''
        }
      }, [])

      /**
       * The context line every new conversation starts with: which book, chapter
       * and PDF it belongs to. The open reader only contributes the PDF name it
       * shows; its page is UI state and is never injected.
       * @param {object} bookRow - catalog book row.
       * @param {object} chapter - catalog chapter row.
       * @returns {string} the header line.
       */
      const seedFor = useCallback((bookRow, chapter, paths, persona) => {
        const shown = readerRef.current
        const sameChapter = shown !== null && shown.bookId === bookRow.id && shown.code === chapter.code
        const position = sameChapter
          ? {
            pdf: shown.name === '' ? `${shown.fileName}.pdf` : shown.name,
            page: shown.page,
            mode: shown.mode,
          }
          : null
        return sessionSeedText(bookRow, chapter, position, paths ?? null, typeof persona === 'string' ? persona : '')
      }, [])

      /**
       * Restore the address seed when a blank session's draft is empty, without
       * appending it to a draft the user is already editing.
       * @param {string} sessionId - the session about to open.
       * @param {object} chapter - catalog chapter row.
       * @param {string} mode - session type.
       * @returns {Promise<void>} completion (best effort).
       */
      const seedExistingSession = useCallback(async (sessionId, chapter, mode) => {
        if (book === null || catalog === null) return
        const paths = {
          libraryDir: typeof catalog.libraryDir === 'string' ? catalog.libraryDir : '',
          bookDir: typeof catalog.fragmentDir === 'string' && catalog.fragmentDir !== ''
            && typeof book.dir === 'string' && book.dir !== ''
            ? `${catalog.fragmentDir}\\${book.dir}`
            : '',
          pdfPath: typeof chapter.pdfPath === 'string' ? chapter.pdfPath : '',
          artifactDir: typeof catalog.artifactDir === 'string' && catalog.artifactDir !== ''
            ? `${catalog.artifactDir}\\${book.id}\\${chapter.code}\\`
            : '',
        }
        let persona = ''
        if (mode === 'qa' && socraticEnabled()) {
          try {
            const payload = await request('GET', 'qa-persona')
            persona = typeof payload.persona === 'string' ? payload.persona.trim() : ''
          } catch {
            // The context seed is still useful without the optional persona.
          }
        }
        // The shared-prefix base session already read this chapter; no brief is
        // injected into the conversation any more.
        const cachePart = ''
        const draft = mode === GENERAL_MODE
          ? [
            `${format('generalSeedBook')}：${book.title === '' ? book.id : `${book.title}（${book.id}）`}`,
            `${format('generalSeedLibrary')}：${paths.libraryDir}`,
            paths.bookDir === '' ? '' : `${format('generalSeedBookDir')}：${paths.bookDir}`,
            paths.pdfPath === '' ? '' : `${format('generalSeedPdf')}：${paths.pdfPath}`,
            cachePart,
          ].filter(Boolean).join('\n')
          : [seedFor(book, chapter, paths, persona), cachePart, format('sessionQuestionLead')].filter(Boolean).join('\n\n')
        const prefill = await beginPrefill(sessionId, draft, 'keep')
        if (prefill.applied && persona !== '') {
          try { window.localStorage.setItem(`pdfdesk:qa-persona:${sessionId}`, '1') } catch { /* storage unavailable */ }
        }
        if (prefill.reference !== null) {
          try { prefill.reference.release() } catch { /* already released */ }
        }
      }, [beginPrefill, book, catalog, seedFor])

      /**
       * Whether the right column would open our own chapter tab. An address no
       * type claims would throw inside `openResource`, so ask the registry first.
       * @param {string} address - the chapter address.
       * @returns {boolean} true when our tab type is in force.
       */
      const sideTabAvailable = address => {
        const tabs = clientContext === null ? null : clientContext.get('sidebarRightTabs')
        if (tabs === null || tabs === undefined) return false
        if (typeof tabs.candidates === 'function') {
          try {
            return tabs.candidates(address).length > 0
          } catch {
            return false
          }
        }
        if (typeof tabs.claim === 'function') {
          try {
            tabs.claim(address)
            return true
          } catch {
            return false
          }
        }
        return false
      }

      /**
       * After leaving for a conversation, show the chapter PDF in that session's
       * right column. The column only accepts an open once the conversation's
       * seat has mounted, so this waits for it briefly instead of failing.
       * @param {string} sessionId - the session just opened.
       * @returns {Promise<void>} completion (best effort).
       */
      const openPdfInSession = useCallback(async sessionId => {
        const shown = readerRef.current
        if (shown === null) return
        const params = new URLSearchParams({ book: shown.bookId, code: shown.code })
        if (shown.name !== '') params.set('name', shown.name)
        let rel = ''
        try {
          const payload = await request('GET', `pdf-ref?${params.toString()}`)
          rel = typeof payload.rel === 'string' ? payload.rel : ''
        } catch {
          return
        }
        if (rel === '') return
        const sidebar = clientContext === null ? null : clientContext.get('sidebarRight')
        if (sidebar === null || sidebar === undefined || typeof sidebar.openResource !== 'function') return
        // Our own tab type has the reader's page navigation and follows it; the
        // plain file tab stays as the fallback for a build without that column.
        const own = sideAddress(shown.bookId, shown.code)
        const useOwn = sideTabsReady && sideTabAvailable(own)
        const address = useOwn ? own : `dsh-resource://file/session/${sessionId}/${rel}`
        const options = useOwn
          ? {
            destination: 'sidebar',
            params: { page: shown.page, variant: shown.variant === 'translated' ? 'translated' : '' },
          }
          : { destination: 'sidebar' }
        let attempts = 0
        const tryOpen = () => {
          attempts += 1
          const mounted = sidebar.mounted !== undefined && typeof sidebar.mounted.getSnapshot === 'function'
            ? sidebar.mounted.getSnapshot()
            : undefined
          if (mounted === sessionId) {
            try {
              sidebar.openResource(address, options)
              return
            } catch {
              // The seat is mounted but not adopted yet; try again.
            }
          }
          if (attempts < 40) {
            window.setTimeout(tryOpen, 100)
            return
          }
          showNotice(format('readerInSessionFailed'))
        }
        window.setTimeout(tryOpen, 80)
      }, [showNotice])

      const createSession = useCallback(async (chapter, mode, options) => {
        if (book === null || catalog === null || creatingRef.current) return
        const target = options !== undefined && options.target !== undefined ? options.target : catalog.target
        if (target.workspaceId === null || target.workspaceId === '') {
          setCreateError({ bookId: book.id, code: chapter.code, message: format('workspaceRequired') })
          return
        }
        creatingRef.current = true
        const continuation = options !== undefined && Number(options.continuation) >= 2 ? Number(options.continuation) : 0
        const artifact = options !== undefined && typeof options.artifact === 'string' ? options.artifact.trim() : ''
        const title = `[${book.id} ${chapter.code}] ${artifact === '' ? TITLE_MODE[mode] : `${artifact} · ${TITLE_MODE[mode]}`}${continuation === 0 ? '' : `（续 ${continuation}）`}`
        setCreatingKey(`${book.id}|${chapter.code}`)
        setCreatingMode(mode)
        setCreateError(null)
        try {
          // The shared-prefix branch: the chapter is read once by a hidden base
          // session and every mode talks in its own fork of that prefix. A
          // chapter the Host cannot extract (scanned) falls back to an ordinary
          // session that reads the PDF itself.
          let sessionId = ''
          try {
            sessionId = await ensureSharedBranch(book.id, chapter.code, mode === GENERAL_MODE ? 'general' : mode)
          } catch {
            sessionId = ''
          }
          if (sessionId === '') {
            // Reuse the workspace blank when there is one; settle everything else.
            const reuseId = findReusableBlank()
            await settlePending(reuseId)
            const base = target.workspaceId !== null ? { workspaceId: target.workspaceId } : { cwd: target.cwd }
            try {
              sessionId = await createSessionId(reuseId === null ? base : { ...base, sessionId: reuseId })
            } catch (error) {
              // A refused reuse (cwd, membership, preset) falls back to a fresh session.
              if (reuseId === null) {
                setCreateError({
                  bookId: book.id,
                  code: chapter.code,
                  message: `${format('sessionCreateFailed')} (${errorText(error)})`,
                })
                return
              }
              try {
                sessionId = await createSessionId(base)
              } catch (fallbackError) {
                setCreateError({
                  bookId: book.id,
                  code: chapter.code,
                  message: `${format('sessionCreateFailed')} (${errorText(fallbackError)})`,
                })
                return
              }
            }
          }
          try {
            await registerPending({ sessionId, bookId: book.id, code: chapter.code, mode, title })
          } catch {
            // Without a pending record the session would stay unclassified; name it now.
            try {
              await renameSession(sessionId, title)
            } catch (error) {
              setCreateError({
                bookId: book.id,
                code: chapter.code,
                message: `${format('sessionRenameFailed')} (${errorText(error)})`,
                sessionId,
                title,
              })
              refreshSessions()
              return
            }
          }
          refreshSessions()
          showNotice(format('sessionCreated', { title }))
          // Every new conversation starts knowing which book, chapter and PDF it
          // belongs to, and where that file sits on disk; a continuation also
          // starts from the chapter outline.
          const paths = catalog === null
            ? null
            : {
              libraryDir: typeof catalog.libraryDir === 'string' ? catalog.libraryDir : '',
              bookDir: typeof catalog.fragmentDir === 'string' && catalog.fragmentDir !== ''
                && typeof book.dir === 'string' && book.dir !== ''
                ? `${catalog.fragmentDir}\\${book.dir}`
                : '',
              pdfPath: typeof chapter.pdfPath === 'string' ? chapter.pdfPath : '',
              artifactDir: typeof catalog.artifactDir === 'string' && catalog.artifactDir !== ''
                ? `${catalog.artifactDir}\\${book.id}\\${chapter.code}\\`
                : '',
            }
          let persona = ''
          let personaFailed = false
          let hasOutline = false
          // The chapter's shared brief: a ready one replaces reading the PDF
          // again; otherwise this session is asked to build it. General sessions
          // take it too, because they are still chapter-scoped.
          const pdfPath = paths === null || typeof paths.pdfPath !== 'string' ? '' : paths.pdfPath
          // The shared-prefix base session already read this chapter; no brief is
          // injected into the conversation any more.
          const cachePart = ''
          let draft
          if (mode === GENERAL_MODE) {
            // The universal session carries only addresses: no persona, no
            // outline, no question lead and no purpose prompt.
            const bookDir = paths !== null && typeof paths.bookDir === 'string' ? paths.bookDir : ''
            draft = [
              `${format('generalSeedBook')}：${book.title === '' ? book.id : `${book.title}（${book.id}）`}`,
              `${format('generalSeedLibrary')}：${paths === null ? '' : paths.libraryDir}`,
              bookDir === '' ? '' : `${format('generalSeedBookDir')}：${bookDir}`,
              pdfPath === '' ? '' : `${format('generalSeedPdf')}：${pdfPath}`,
              cachePart,
            ].filter(Boolean).join('\n')
          } else {
            // The Q&A persona is part of the same initial prompt as the paths:
            // one block the model reads before the user's question, gated by Settings.
            if (mode === 'qa' && socraticEnabled()) {
              try {
                const payload = await request('GET', 'qa-persona')
                persona = typeof payload.persona === 'string' ? payload.persona.trim() : ''
              } catch {
                personaFailed = true
              }
            }
            const parts = [seedFor(book, chapter, paths, persona)]
            if (cachePart !== '') parts.push(cachePart)
            if (artifact !== '') parts.push(`产物：${artifact}（本章产物区里的这个文件）`)
            if (continuation >= 2) {
              const outline = await loadOutline(book.id, chapter.code)
              if (outline !== '') {
                parts.push(outline)
                hasOutline = true
              }
            }
            // End every preset prompt with a lead-in: some hosts mishandle a prompt
            // that ends without a separator, and this line gives the user a cursor.
            draft = `${parts.join('\n\n')}\n\n${format('sessionQuestionLead')}`
          }
          let draftReference = null
          const prefill = await beginPrefill(sessionId, draft)
          if (prefill.applied) {
            showNotice(format(personaFailed ? 'personaFailed' : (hasOutline ? 'sessionWithOutline' : 'sessionWithContext')))
            if (persona !== '') {
              // Mark it: opening this session again must not append the persona
              // a second time.
              try { window.localStorage.setItem(`pdfdesk:qa-persona:${sessionId}`, '1') } catch { /* storage unavailable */ }
            }
          }
          if (options !== undefined && options.jump === true) {
            draftReference = prefill.reference
          } else {
            // Without a jump the draft may not survive until the row is opened,
            // so remember it and apply it again when that happens.
            pendingDrafts.current.set(sessionId, draft)
            if (prefill.reference !== null) {
              try { prefill.reference.release() } catch { /* already released */ }
            }
          }
          // The reader's New buttons leave for the new conversation directly, and
          // take the PDF with them into the session's right column.
          if (options !== undefined && options.jump === true) {
            await flushSave()
            openHostSession(sessionId)
            if (previewPdf) void openPdfInSession(sessionId)
          }
          if (draftReference !== null) {
            try { draftReference.release() } catch { /* already released */ }
          }
          return sessionId
        } finally {
          creatingRef.current = false
          setCreatingKey('')
          setCreatingMode('')
        }
      }, [book, catalog, findReusableBlank, flushSave, loadOutline, openPdfInSession, previewPdf, refreshSessions, registerPending, seedFor, settlePending, showNotice])
      createSessionRef.current = createSession

      /** The reader's three New buttons: create the session, leave for it. */
      /**
       * "New" for one chapter and mode: continue that chapter's existing
       * conversation while it has room, and start a numbered continuation once
       * its context is nearly full. A conversation's native chapter is its title
       * prefix, so a continuation stays with the chapter it belongs to.
       * @param {object} chapter - the chapter.
       * @param {string} mode - the group.
       * @param {{ jumpOnCreate?: boolean, forceNew?: boolean }} [options] - `jumpOnCreate`
       *   leaves immediately when a new session had to be created (the reader
       *   does; the chapter page does not); `forceNew` skips continuing on purpose.
       * @returns {Promise<void>} completion.
       */
      const resolveWorkspacePrompt = useCallback(target => {
        workspaceRequest.current = null
        setWorkspacePrompt(current => {
          if (current !== null) current.resolve(target)
          return null
        })
      }, [])

      /**
       * Open the workspace picker even when one is already remembered, so the
       * choice shown on the split-tool card can be changed explicitly.
       * @returns {void}
       */
      const chooseWorkspace = useCallback(() => {
        if (workspaceRequest.current !== null) return
        const request = new Promise(resolve => setWorkspacePrompt({ resolve }))
        workspaceRequest.current = request
      }, [])

      /**
       * A session needs an explicit workspace. Never silently fall back to a
       * cwd: when the library has no owning workspace, ask the user.
       * @returns {Promise<{ workspaceId: string, cwd: string } | null>} the chosen target, or null when cancelled.
       */
      const ensureWorkspaceTarget = useCallback(async () => {
        const chosen = workspaceTarget.current
        if (chosen !== null && typeof chosen.workspaceId === 'string' && chosen.workspaceId !== '') return chosen
        if (workspaceRequest.current !== null) return await workspaceRequest.current
        if (catalog !== null && catalog.target !== null && typeof catalog.target.workspaceId === 'string' && catalog.target.workspaceId !== '') {
          return { workspaceId: catalog.target.workspaceId, cwd: typeof catalog.target.cwd === 'string' ? catalog.target.cwd : '' }
        }
        const request = new Promise(resolve => setWorkspacePrompt({ resolve }))
        workspaceRequest.current = request
        return await request
      }, [catalog])

      const createWorkspace = useCallback(async path => {
        const service = clientContext === null || clientContext === undefined ? null : clientContext.get('workspaces')
        if (service === null || service === undefined || typeof service.create !== 'function') {
          throw new Error(format('workspaceUnavailable'))
        }
        let view
        try {
          view = await service.create({ path })
        } catch (error) {
          throw new Error(`${format('workspaceCreateFailed')} (${errorText(error)})`)
        }
        const target = { workspaceId: String(view.id), cwd: typeof view.path === 'string' ? view.path : path }
        workspaceTarget.current = target
        if (library !== null) writeStoredWorkspace(library.id, target)
        setCatalog(current => current === null ? current : { ...current, target })
        setWorkspaces(current => {
          const entry = { id: target.workspaceId, title: typeof view.title === 'string' ? view.title : '', path: target.cwd }
          return [entry, ...current.filter(item => item.id !== entry.id)]
        })
        resolveWorkspacePrompt(target)
        return target
      }, [library, resolveWorkspacePrompt])

      const pickWorkspace = useCallback(workspace => {
        const target = { workspaceId: String(workspace.id), cwd: workspace.path }
        workspaceTarget.current = target
        if (library !== null) writeStoredWorkspace(library.id, target)
        setCatalog(current => current === null ? current : { ...current, target })
        resolveWorkspacePrompt(target)
      }, [library, resolveWorkspacePrompt])

      const resumeOrCreate = useCallback(async (chapter, mode, options) => {
        if (book === null || catalog === null || creatingRef.current) return
        const key = `${book.id}|${chapter.code}|${mode}`
        if (inFlightSessions.current.has(key)) return
        inFlightSessions.current.add(key)
        try {
        const limit = typeof catalog.resumeRatio === 'number' ? catalog.resumeRatio : 0.85
        const current = options !== undefined && options.forceNew === true
          ? null
          : findCurrentSession(book.id, chapter.code, mode)
        if (current !== null) {
          let ratio = 0
          let known = current.pending !== true
          if (current.pending !== true) {
            try {
              const payload = await request('GET', `context?session=${encodeURIComponent(current.id)}`)
              const context = payload.context
              if (context !== null && context !== undefined && typeof context.ratio === 'number') ratio = context.ratio
              else known = false
            } catch {
              known = false
            }
          }
          if (ratio < limit) {
            // A blank session whose draft was deleted gets its address block back.
            // A non-empty draft is preserved because beginPrefill uses `keep`.
            if ((current.pending === true || current.blank === true) && !isSharedBranch(current.id)) {
              await seedExistingSession(current.id, chapter, mode)
            }
            await flushSave()
            openHostSession(current.id)
            if (previewPdf) void openPdfInSession(current.id)
            showNotice(format('sessionResumed', {
              mode: format(`mode.${mode}`),
              pct: known ? Math.round(ratio * 100) : '?',
            }))
            return
          }
          const continuation = nextContinuation(book.id, chapter.code, mode)
          const target = await ensureWorkspaceTarget()
          if (target === null) return
          showNotice(format('sessionContinued', { pct: Math.round(ratio * 100) }))
          await createSession(chapter, mode, {
            jump: options !== undefined && options.jumpOnCreate === true,
            continuation,
            target,
          })
          return
        }
        // No session to continue (or the caller asked for a fresh one): number the
        // new session after whatever chain the chapter already has.
        const target = await ensureWorkspaceTarget()
        if (target === null) return
        await createSession(chapter, mode, {
          jump: options !== undefined && options.jumpOnCreate === true,
          continuation: nextContinuation(book.id, chapter.code, mode),
          target,
        })
        } finally {
          inFlightSessions.current.delete(key)
        }
      }, [book, catalog, createSession, ensureWorkspaceTarget, findCurrentSession, flushSave, nextContinuation, openPdfInSession, previewPdf, seedExistingSession, showNotice])

      /**
       * The toolbar's universal session: a tracked chapter session of the
       * general type, carrying only the book address.
       * @returns {Promise<void>} completion.
       */
      const openGeneralSession = useCallback(async () => {
        if (book === null || reader === null || creatingRef.current) return
        const chapter = Array.isArray(book.chapters)
          ? book.chapters.find(item => item !== null && typeof item === 'object' && item.code === reader.code)
          : null
        if (chapter === undefined) {
          showNotice(format('targetMissing'))
          return
        }
        await resumeOrCreate(chapter, GENERAL_MODE, { jumpOnCreate: true })
      }, [book, reader, resumeOrCreate, showNotice])

      // A 提取/答疑/习题 request from the right column: switch the page to that
      // book first, then let this effect run again with the chapter list in hand.
      useEffect(() => {
        if (sessionRequest === null || catalog === null) return
        const entry = catalog.books.find(candidate => candidate.id === sessionRequest.bookId)
        const chapter = entry === undefined
          ? undefined
          : (entry.chapters ?? []).find(candidate => candidate.code === sessionRequest.code)
        if (entry === undefined || chapter === undefined) {
          setSessionRequest(null)
          showNotice(format('sideForeign'))
          return
        }
        if (book === null || book.id !== sessionRequest.bookId) {
          if (workRef.current === null || workRef.current.bookId !== sessionRequest.bookId) {
            openBook(sessionRequest.bookId)
          }
          return
        }
        setSessionRequest(null)
        void resumeOrCreate(chapter, sessionRequest.mode, { jumpOnCreate: true })
      }, [book, catalog, openBook, resumeOrCreate, sessionRequest, showNotice])

      /**
       * Summarize one chapter's conversations into an outline file.
       * @param {object} chapter - the chapter.
       * @returns {Promise<void>} completion.
       */
      const generateDigest = useCallback(async chapter => {
        if (book === null || digestRef.current) return
        const groups = sessionIndex.byChapter.get(`${book.id}|${chapter.code}`)
        const ids = []
        if (groups !== undefined) {
          for (const mode of MODES) {
            for (const row of Array.isArray(groups[mode]) ? groups[mode] : []) {
              if (row.pending === true || ids.includes(row.id)) continue
              ids.push(row.id)
            }
          }
        }
        if (ids.length === 0) {
          showNotice(format('digestEmpty'))
          return
        }
        digestRef.current = true
        setDigest({ chapter, phase: 'working', text: '', path: '', error: '' })
        try {
          const payload = await request('POST', 'digest', { bookId: book.id, code: chapter.code, sessionIds: ids })
          setDigest({
            chapter,
            phase: 'ready',
            text: typeof payload.text === 'string' ? payload.text : '',
            path: typeof payload.path === 'string' ? payload.path : '',
            error: '',
          })
          loadArtifacts(book.id, chapter.code, true)
          showNotice(format('digestDone'))
        } catch (reason) {
          setDigest({ chapter, phase: 'error', text: '', path: '', error: errorText(reason) })
        } finally {
          digestRef.current = false
        }
      }, [book, loadArtifacts, sessionIndex, showNotice])

      const closeDigest = useCallback(() => setDigest(null), [])

      const copyDigest = useCallback(text => {
        const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
        if (clipboard === undefined || typeof clipboard.writeText !== 'function') {
          showNotice(format('copyFailed'))
          return
        }
        void clipboard.writeText(text)
          .then(() => showNotice(format('digestCopied')))
          .catch(() => showNotice(format('copyFailed')))
      }, [showNotice])

      /** Ask GitHub Releases whether a newer version exists (only on click). */
      const checkUpdates = useCallback(async () => {
        if (updateBusy) return
        setUpdateBusy(true)
        setUpdateOperation(null)
        try {
          // The Host performs the request: it can follow a local proxy, while the
          // Electron renderer cannot.
          const payload = await request('GET', 'update')
          const current = catalog !== null && typeof catalog.version === 'string' ? catalog.version : '0.0.0'
          if (payload === null || payload.ok !== true) {
            showNotice(format('updateFailed'))
            return
          }
          const latest = typeof payload.latest === 'string' ? payload.latest : ''
          if (latest === '') {
            setUpdateInfo(null)
            showNotice(format('updateNoRelease'))
            return
          }
          const version = typeof payload.version === 'string' && payload.version !== ''
            ? payload.version
            : latest.replace(/^v/i, '')
          const download = typeof payload.download === 'string' ? payload.download : ''
          const comparison = compareVersions(latest, current)
          if (comparison <= 0) {
            setUpdateInfo(null)
            setMarketUpdate(null)
            showNotice(format('updateLatest', { version: current }))
            return
          }
          setUpdateInfo({ latest, version, current, download, url: typeof payload.url === 'string' ? payload.url : '' })
          setMarketUpdate(await discoverMarketUpdate(current))
          showNotice(format('updateNew', { version, current }))
        } catch {
          showNotice(format('updateFailed'))
        } finally {
          setUpdateBusy(false)
        }
      }, [catalog, showNotice, updateBusy])

      /**
       * Discover whether dshmarket can update this installed package.
       * @param {string} current - installed version.
       * @returns {Promise<object | null>} market update info, or null.
       */
      const discoverMarketUpdate = useCallback(async current => {
        try {
          const capabilityResponse = await window.fetch('/dsh-market/api/v1/capabilities', { credentials: 'same-origin' })
          if (!capabilityResponse.ok) return null
          const capabilities = await capabilityResponse.json()
          if (capabilities === null || typeof capabilities !== 'object'
            || capabilities.features === undefined || capabilities.features.update !== true
            || capabilities.endpoints === undefined || typeof capabilities.endpoints.updates !== 'string') return null
          const url = new URL(capabilities.endpoints.updates, window.location.origin)
          url.searchParams.set('name', 'dsh-pdf-workbench')
          url.searchParams.set('force', '1')
          const response = await window.fetch(url, { credentials: 'same-origin' })
          if (!response.ok) return null
          const payload = await response.json()
          const item = payload !== null && typeof payload === 'object' ? payload.package : null
          if (item === null || typeof item !== 'object' || item.updateAvailable !== true) return null
          if (compareVersions(String(item.latestVersion ?? ''), current) <= 0) return null
          return { item, endpoints: capabilities.endpoints, restart: capabilities.restart }
        } catch {
          return null
        }
      }, [])

      /** Start the one-click update: market operation when managed, otherwise download. */
      const installUpdate = useCallback(async () => {
        if (updateInfo === null || updateBusy) return
        if (marketUpdate !== null && typeof marketUpdate.endpoints?.updates === 'string') {
          setUpdateBusy(true)
          setUpdateOperation({ state: 'starting', message: format('updateMarketStarting') })
          try {
            const response = await window.fetch(marketUpdate.endpoints.updates, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ packageName: 'dsh-pdf-workbench' }),
            })
            if (!response.ok) {
              setUpdateOperation({ state: 'failed', message: format('updateMarketFailed', { message: `HTTP ${response.status}` }) })
              return
            }
            const started = await response.json()
            const operationId = typeof started.operationId === 'string' ? started.operationId : ''
            if (operationId === '') {
              setUpdateOperation({ state: 'failed', message: format('updateMarketFailed', { message: 'no operationId' }) })
              return
            }
            const terminal = new Set(['succeeded', 'failed', 'cancelled', 'rolled-back'])
            for (let attempt = 0; attempt < 180; attempt += 1) {
              await new Promise(resolve => window.setTimeout(resolve, 1000))
              const pollUrl = new URL(marketUpdate.endpoints.operations, window.location.origin)
              pollUrl.searchParams.set('operationId', operationId)
              const pollResponse = await window.fetch(pollUrl, { credentials: 'same-origin' })
              if (!pollResponse.ok) continue
              const pollPayload = await pollResponse.json()
              const operation = pollPayload !== null && typeof pollPayload === 'object' && pollPayload.operation !== undefined
                ? pollPayload.operation
                : pollPayload
              const state = operation !== null && typeof operation === 'object' && typeof operation.state === 'string' ? operation.state : ''
              setUpdateOperation({ state, message: format('updateMarketProgress', { state: state === '' ? '…' : state }) })
              if (!terminal.has(state)) continue
              if (state === 'succeeded') {
                const version = typeof operation.installedVersion === 'string' && operation.installedVersion !== ''
                  ? operation.installedVersion
                  : updateInfo.version
                setUpdateInfo(null)
                setMarketUpdate(null)
                setUpdateOperation({ state, message: format('updateMarketDone', { version }) })
              } else {
                const message = typeof operation.message === 'string' && operation.message !== '' ? operation.message : state
                setUpdateOperation({ state, message: format('updateMarketFailed', { message }) })
              }
              return
            }
            setUpdateOperation({ state: 'failed', message: format('updateMarketFailed', { message: 'timeout' }) })
          } catch (error) {
            setUpdateOperation({ state: 'failed', message: format('updateMarketFailed', { message: errorText(error) }) })
          } finally {
            setUpdateBusy(false)
          }
          return
        }
        if (updateInfo.download !== '') {
          try {
            window.open(updateInfo.download, '_blank', 'noopener')
          } catch {
            // popup blocked
          }
        }
      }, [format, marketUpdate, updateBusy, updateInfo])

      /** Persist hidden books / shelves for the active library. */
      const saveShelfGroups = useCallback(next => {
        setShelfGroups(next)
        void request('POST', 'shelves', next).catch(() => {})
      }, [])

      const toggleSelect = useCallback(id => {
        setSelected(previous => {
          const next = new Set(previous)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }, [])

      const selectMany = useCallback((ids, additive) => {
        setSelected(previous => {
          const next = additive ? new Set(previous) : new Set()
          for (const id of ids) next.add(id)
          return next
        })
      }, [])

      const clearSelection = useCallback(() => setSelected(new Set()), [])

      const openGroup = useCallback(id => {
        setGroup(id)
        setSelected(new Set())
        setReader(null)
        readerRef.current = null
        setPreview(null)
        setWork(previous => previous === null ? previous : {
          ...previous,
          view: 'shelf',
          bookId: null,
          activeChapter: null,
        })
      }, [])

      const createShelf = useCallback(() => {
        const title = String(shelfName ?? '').trim()
        if (title === '') {
          showNotice(format('shelfNameEmpty'))
          return
        }
        if (selected.size === 0) return
        const current = groupRef.current
        const shelf = {
          id: `g-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
          name: title.slice(0, 60),
          books: [...selected],
          ...(current === null ? {} : { parent: current }),
        }
        saveShelfGroups({ hidden: shelfGroups.hidden, shelves: [...shelfGroups.shelves, shelf] })
        setShelfName(null)
        setSelected(new Set())
      }, [group, saveShelfGroups, selected, shelfGroups, shelfName, showNotice])

      const hideSelected = useCallback(() => {
        if (selected.size === 0) return
        const hidden = [...new Set([...shelfGroups.hidden, ...selected])]
        saveShelfGroups({ hidden, shelves: shelfGroups.shelves })
        setSelected(new Set())
      }, [saveShelfGroups, selected, shelfGroups])

      const unhideSelected = useCallback(() => {
        if (selected.size === 0) return
        const hidden = shelfGroups.hidden.filter(id => !selected.has(id))
        saveShelfGroups({ hidden, shelves: shelfGroups.shelves })
        setSelected(new Set())
      }, [saveShelfGroups, selected, shelfGroups])

      const removeFromShelf = useCallback(() => {
        if (group === null || group === 'hidden' || selected.size === 0) return
        const shelves = shelfGroups.shelves.map(shelf => (shelf.id === group
          ? { ...shelf, books: shelf.books.filter(id => !selected.has(id)) }
          : shelf))
        saveShelfGroups({ hidden: shelfGroups.hidden, shelves })
        setSelected(new Set())
      }, [group, saveShelfGroups, selected, shelfGroups])

      const deleteShelf = useCallback(id => {
        if (id === 'hidden') {
          if (typeof window !== 'undefined' && typeof window.confirm === 'function'
            && !window.confirm(format('hiddenDeleteConfirm'))) return
          // "Deleting" the hidden shelf just releases every hidden book back to
          // the library; shelves nested under it move to the root.
          const released = shelfGroups.shelves.map(shelf => (shelf.parent === 'hidden'
            ? { id: shelf.id, name: shelf.name, books: shelf.books }
            : shelf))
          saveShelfGroups({ hidden: [], shelves: released })
          if (group === 'hidden') setGroup(null)
          setSelected(new Set())
          return
        }
        if (typeof window !== 'undefined' && typeof window.confirm === 'function'
          && !window.confirm(format('shelfDeleteConfirm'))) return
        // Removing a shelf must also remove its nested shelves, otherwise their
        // parent id points at nothing and their books never return to the library.
        const doomed = new Set([id])
        let grew = true
        while (grew) {
          grew = false
          for (const shelf of shelfGroups.shelves) {
            if (!doomed.has(shelf.id) && typeof shelf.parent === 'string' && doomed.has(shelf.parent)) {
              doomed.add(shelf.id)
              grew = true
            }
          }
        }
        saveShelfGroups({
          hidden: shelfGroups.hidden,
          shelves: shelfGroups.shelves.filter(shelf => !doomed.has(shelf.id)),
        })
        if (group !== null && doomed.has(group)) setGroup(null)
        setSelected(new Set())
      }, [group, saveShelfGroups, shelfGroups])

      const goShelf = useCallback(() => {
        // Breadcrumb navigation must not depend on the book-specific focus/restore
        // path: set the view directly and drop everything the chapter page opened.
        setReader(null)
        readerRef.current = null
        setPreview(null)
        setGroup(null)
        setSelected(new Set())
        setCreateError(null)
        setWork(previous => previous === null ? previous : {
          ...previous,
          view: 'shelf',
          bookId: null,
          activeChapter: null,
        })
      }, [])

      /** Load the bundled sample library's manifest once the libraries page opens. */      useEffect(() => {
        if (work === null || work.view !== 'libraries' || sample !== null) return undefined
        let alive = true
        void request('GET', 'samples')
          .then(payload => {
            if (alive) setSample(payload)
          })
          .catch(() => {
            if (alive) setSample({ book: null })
          })
        return () => { alive = false }
      }, [sample, work])

      /** Copy browser-selected files into the active library's 导入 folder. */
      const importFiles = useCallback(async event => {
        const files = Array.from(event.target.files ?? [])
        event.target.value = ''
        if (files.length === 0) return
        setImportBusy(true)
        let copied = 0
        for (const file of files) {
          try {
            const response = await fetch(`${ENDPOINT}import?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file })
            if (response.ok) copied += 1
          } catch {
            // A failed file is skipped; the notice reports how many landed.
          }
        }
        setImportBusy(false)
        showNotice(format('importFilesDone', { n: copied }))
        setReloadKey(key => key + 1)
      }, [showNotice])

      /** Copy the AI prompt to the clipboard (falls back to showing it). */
      const copyAiPrompt = useCallback(async () => {
        const text = format('aiPromptText')
        try {
          await navigator.clipboard.writeText(text)
          showNotice(format('aiPromptCopied'))
        } catch {
          showNotice(text)
        }
      }, [showNotice])

      /** Copy the bundled sample book into the active library. */
      const installSample = useCallback(async () => {        if (sampleBusy) return
        setSampleBusy(true)
        setLibError('')
        try {
          const payload = await request('POST', 'samples/install', {})
          showNotice(format('sampleLoaded', { n: Number(payload.copied) || 0 }))
          setReloadKey(key => key + 1)
        } catch (reason) {
          setLibError(`${format('libraryFailed')} (${errorText(reason)})`)
        } finally {
          setSampleBusy(false)
        }
      }, [sampleBusy, showNotice])

      /** Apply a libraries response to the page's list state. */
      const applyLibraryList = useCallback(payload => {
        if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.items)) return
        setLibs({
          items: payload.items,
          activeId: typeof payload.activeId === 'string' ? payload.activeId : '',
        })
      }, [])

      const activateLibrary = useCallback(async (id, options) => {
        const enter = options !== undefined && options.enter === true
        trace('library click', id, enter, 'busy=', libBusy)
        if (libBusy) return
        setLibBusy(true)
        setLibError('')
        // Double-click navigates first; the switch request only needs to land for
        // the catalog and the toolkit target. Waiting for it made the click feel
        // like a flash with no navigation when the request raced the reload.
        if (enter) {
          pendingView.current = 'shelf'
          if (work !== null) {
            const nextWork = { ...work, view: 'shelf', bookId: null, activeChapter: null }
            trace('enter shelf', id)
            setWork(nextWork)
            void persist(nextWork)
          }
        }
        try {
          const payload = await request('POST', 'libraries/active', { id })
          trace('activated', payload.activeId)
          applyLibraryList(payload)
          const next = Array.isArray(payload.items)
            ? payload.items.find(item => item.id === payload.activeId) ?? null
            : null
          if (next !== null) setLibrary(next)
          if (!enter) {
            // Single click: only switch, and stay on the libraries page.
            pendingView.current = 'libraries'
          }
          setReloadKey(key => key + 1)
        } catch (reason) {
          trace('activate failed', String(reason))
          if (!enter) pendingView.current = 'libraries'
          setLibError(`${format('libraryFailed')} (${errorText(reason)})`)
        } finally {
          setLibBusy(false)
        }
      }, [applyLibraryList, libBusy, persist, work])

      const addLibrary = useCallback(async (dir, name) => {
        const libraryDir = String(dir).trim()
        if (libraryDir === '' || libBusy) return
        setLibBusy(true)
        setLibError('')
        try {
          applyLibraryList(await request('POST', 'libraries/add', { libraryDir, name: String(name).trim() }))
          await flushSave()
          setWork(previous => previous === null ? previous : { ...previous, view: 'shelf', bookId: null, activeChapter: null })
          setReloadKey(key => key + 1)
        } catch (reason) {
          setLibError(`${format('libraryFailed')} (${errorText(reason)})`)
        } finally {
          setLibBusy(false)
        }
      }, [applyLibraryList, flushSave, libBusy])

      const removeLibrary = useCallback(async id => {
        if (libBusy) return
        setLibBusy(true)
        setLibError('')
        try {
          applyLibraryList(await request('POST', 'libraries/remove', { id }))
          setReloadKey(key => key + 1)
        } catch (reason) {
          setLibError(`${format('libraryFailed')} (${errorText(reason)})`)
        } finally {
          setLibBusy(false)
        }
      }, [applyLibraryList, libBusy])

      const pickLibraryDir = useCallback(async () => {
        const uiWorkspace = clientContext === null ? null : clientContext.get('uiWorkspace')
        if (uiWorkspace === null || uiWorkspace === undefined || typeof uiWorkspace.pickDirectory !== 'function') return null
        try {
          const picked = await uiWorkspace.pickDirectory({ title: format('libraryPick') })
          return typeof picked === 'string' ? picked : null
        } catch {
          return null
        }
      }, [])

      /**
       * Copy the split toolkit into the active library and open a conversation
       * with a prepared prompt — the workflow the library was built with.
       * @returns {Promise<void>} completion.
       */
      const startSplitSession = useCallback(async () => {
        if (libBusy || catalog === null) return
        setLibBusy(true)
        setLibError('')
        try {
          const target = await ensureWorkspaceTarget()
          if (target === null) return
          const libraryId = library === null ? catalog.libraryId : library.id
          const stored = readStoredSplitSession(libraryId)
          if (stored !== null && stored.workspaceId === target.workspaceId) {
            const sessions = sessionService()
            const list = sessions === null || sessions.list === undefined ? null : sessions.list.getSnapshot()
            const workspaces = workspacesService()
            const archived = workspaces === null || workspaces.list === undefined
              ? new Set()
              : new Set(workspaces.list.getSnapshot().archivedSessionIds ?? [])
            const known = list === null || list.phase !== 'ready' ? undefined : list.byId?.[stored.sessionId]
            if (!archived.has(stored.sessionId) && (known !== undefined || list === null || list.phase !== 'ready')) {
              if (openHostSession(stored.sessionId)) {
                showNotice(format('splitReopened'))
                return
              }
            }
          }
          try {
            await request('POST', 'toolkit/install', {})
          } catch {
            // Without the copy the conversation can still guide the user.
          }
          const base = { workspaceId: target.workspaceId, cwd: target.cwd }
          const sessionId = await createSessionId(base)
          writeStoredSplitSession(libraryId, sessionId, target.workspaceId)
          const prefill = await beginPrefill(sessionId, format('splitPrompt', {
            dir: library === null ? catalog.libraryDir : library.libraryDir,
          }))
          if (!openHostSession(sessionId)) {
            showNotice(format('splitFailed'))
            if (prefill.reference !== null) prefill.reference.release()
            return
          }
          if (prefill.reference !== null) {
            window.setTimeout(() => {
              try { prefill.reference.release() } catch { /* already released */ }
            }, 500)
          }
        } catch (reason) {
          setLibError(`${format('splitFailed')} (${errorText(reason)})`)
        } finally {
          setLibBusy(false)
        }
      }, [catalog, ensureWorkspaceTarget, libBusy, library, showNotice])

      const backToLibraries = useCallback(() => {
        setReader(null)
        readerRef.current = null
        setPreview(null)
        setGroup(null)
        setSelected(new Set())
        pendingFocus.current = ''
        setWork(previous => previous === null ? previous : { ...previous, view: 'libraries', bookId: null, activeChapter: null })
      }, [])

      /** The reader's three New buttons: continue or start, then leave for it. */
      const readerNewSession = useCallback((mode, forceNew) => {
        if (reader === null || book === null || book.id !== reader.bookId) return
        setReaderForceNew(false)
        // Use the catalog row so the new conversation also gets the chapter's
        // PDF path; the reader only knows the title.
        const entry = catalog === null ? undefined : catalog.books.find(candidate => candidate.id === reader.bookId)
        const chapter = entry === undefined
          ? { code: reader.code, title: reader.title }
          : ((entry.chapters ?? []).find(candidate => candidate.code === reader.code)
            ?? { code: reader.code, title: reader.title })
        void resumeOrCreate(chapter, mode, {
          jumpOnCreate: true,
          forceNew: forceNew === true,
        })
      }, [book, catalog, reader, resumeOrCreate])

      const retryRename = useCallback(async () => {
        if (createError === null || typeof createError.sessionId !== 'string' || creatingRef.current) return
        creatingRef.current = true
        setCreatingKey(`${createError.bookId}|${createError.code}`)
        setCreatingMode('retry')
        try {
          await renameSession(createError.sessionId, createError.title)
          setCreateError(null)
          refreshSessions()
          showNotice(format('sessionCreated', { title: createError.title }))
        } catch (error) {
          setCreateError({ ...createError, message: `${format('sessionRenameFailed')} (${errorText(error)})` })
        } finally {
          creatingRef.current = false
          setCreatingKey('')
          setCreatingMode('')
        }
      }, [createError, refreshSessions, showNotice])

      // On every mount, resolve intents a previous workbench visit left behind:
      // name a started session, archive an unused blank, and remove archived
      // blank records nobody can otherwise delete.
      const purgeBlanks = useCallback(async () => {
        try {
          const payload = await request('POST', 'purge')
          if (typeof payload.purged === 'number' && payload.purged > 0) {
            refreshSessions()
            showNotice(format('cleanupNotice', { n: payload.purged }))
          }
        } catch (reason) {
          // Cleanup is best effort; the next visit tries again.
          trace('purge failed', errorText(reason))
        }
      }, [refreshSessions, showNotice])

      const reconciled = useRef(false)
      useEffect(() => {
        if (reconciled.current || catalog === null || sessionIndex.loaded !== true) return
        reconciled.current = true
        void settlePending().then(purgeBlanks)
      }, [catalog, purgeBlanks, sessionIndex.loaded, settlePending])

      const cleanupNow = useCallback(async () => {
        if (creatingRef.current) return
        creatingRef.current = true
        try {
          await settlePending(null, true)
          await purgeBlanks()
        } finally {
          creatingRef.current = false
        }
      }, [purgeBlanks, settlePending])

      const registerRef = useCallback((id, node) => {
        if (node === null) cardRefs.current.delete(id)
        else cardRefs.current.set(id, node)
      }, [])

      const registerChapterRef = useCallback((code, node) => {
        if (node === null) chapterRefs.current.delete(code)
        else chapterRefs.current.set(code, node)
      }, [])

      // Reset the scroller and restore focus when the view changes, so keyboard
      // users are not dropped to <body> after opening a book or going back. A
      // restored position (no pending user navigation) scrolls to the chapter
      // that was last used instead of the top.
      useEffect(() => {
        if (bodyRef.current !== null) bodyRef.current.scrollTop = 0
        const target = pendingFocus.current
        pendingFocus.current = ''
        if (typeof target !== 'string') return
        if (target === 'heading') {
          if (headingRef.current !== null) headingRef.current.focus()
          return
        }
        if (target.startsWith('card:')) {
          const node = cardRefs.current.get(target.slice(5))
          if (node !== undefined) node.focus()
          return
        }
        if (work !== null && work.view === 'book' && typeof work.activeChapter === 'string') {
          const node = chapterRefs.current.get(work.activeChapter)
          if (node !== undefined) node.scrollIntoView({ block: 'center' })
        }
      }, [work === null ? '' : work.view, work === null ? '' : work.bookId])

      const busy = phase === 'loading'
      const totalChapters = books.reduce((sum, item) => sum + (Array.isArray(item.chapters) ? item.chapters.length : 0), 0)
      const problemText = catalog !== null && catalog.problem !== null
        ? (catalog.problem.code === 'fragment-dir-unreadable'
          ? `${format('problemUnreadable')} ${catalog.problem.message === '' ? '' : `(${catalog.problem.message})`}`.trim()
          : String(catalog.problem.message))
        : ''
      const blockingError = catalog === null ? error : problemText
      const inlineError = catalog !== null && error !== '' && problemText === '' ? error : ''
      const skippedFiles = catalog === null ? 0 : catalog.skipped.reduce((sum, item) => sum + (Number(item.pdfCount) || 0), 0)
      const unparsedFiles = books.reduce((sum, item) => sum + (Number(item.unparsed) || 0), 0)
      const partialFiles = skippedFiles + unparsedFiles
      const canRender = envTools.python && envTools.tex
      const canTranslate = canRender && envTools.apiKey === true
      const canExport = envTools.python
      const activeWorkspace = catalog === null || catalog.target === null || catalog.target === undefined
        || catalog.target.workspaceId === null || catalog.target.workspaceId === undefined || catalog.target.workspaceId === ''
        ? undefined
        : workspaces.find(item => String(item.id) === String(catalog.target.workspaceId))
      const workspaceLabel = activeWorkspace === undefined
        ? (catalog !== null && catalog.target !== null && catalog.target !== undefined
          && catalog.target.workspaceId !== null && catalog.target.workspaceId !== undefined && catalog.target.workspaceId !== ''
          ? (typeof catalog.target.cwd === 'string' ? catalog.target.cwd : '')
          : '')
        : (activeWorkspace.title === '' ? activeWorkspace.path : activeWorkspace.title)
      let body
      if (blockingError !== '' && (catalog === null || work === null)) {
        body = h('div', { className: 'md-state md-state-error', role: 'alert' },
          h('div', { className: 'md-empty-title' }, format('loadFailed')),
          h('p', { className: 'md-state-detail' }, blockingError),
          h('div', { className: 'md-state-actions' },
            h(KitButton, { type: 'button', className: 'md-btn', onClick: reload }, format('retry'))
          )
        )
      } else if (catalog === null || work === null) {
        body = h('div', { className: 'md-state', role: 'status' }, format('loading'))
      } else if (work.view === 'libraries' || (problemText !== '' && book === null)) {
        // An unreadable library is not a dead end: keep the libraries page, show
        // its path and the reason, and let the user add or pick another root.
        body = h(LibrariesPage, {
          libraries: libs.items,
          activeId: libs.activeId,
          envTools,
          canRender,
          busy: libBusy,
          error: libError !== '' ? libError : problemText,
          onUse: activateLibrary,
          onRemove: removeLibrary,
          onAdd: addLibrary,
          onPick: pickLibraryDir,
          onSplit: startSplitSession,
          onChooseWorkspace: chooseWorkspace,
          workspaceLabel,
          sample,
          sampleBusy,
          importBusy,
          onImport: () => importInput.current?.click(),
          onLoadSample: installSample,
          onCopyPrompt: copyAiPrompt,
          libraryDir: library === null ? (catalog === null ? '' : catalog.libraryDir) : library.libraryDir,
        })
      } else if (blockingError !== '') {
        body = h('div', { className: 'md-state md-state-error', role: 'alert' },
          h('div', { className: 'md-empty-title' }, format('loadFailed')),
          h('p', { className: 'md-state-detail' }, blockingError),
          h('div', { className: 'md-state-actions' },
            h(KitButton, { type: 'button', className: 'md-btn', onClick: reload }, format('retry'))
          )
        )
      } else if (book !== null) {
        body = h(BookSheet, {
          book,
          expanded,
          headingRef,
          sessionIndex,
          sessionAvailable,
          mathMode,
          workflow: activeWorkflow,
          onEnvRequired: setEnvPrompt,
          artifacts,
          libraryDir: catalog.libraryDir,
          counts: counts[book.id],
          onOpenQuestion: openQuestionRow,
          creatingKey,
          creatingMode,
          createError,
          onClickRow,
          onOpenPdf: openPdf,
          onNewSession: (chapter, mode, opts) => {
            void resumeOrCreate(chapter, mode, {
              jumpOnCreate: false,
              forceNew: opts !== undefined && opts.forceNew === true,
            })
          },
          onOpenSession: openSessionRow,
          onArchiveSession: archiveSessionRow,
          onRetryRename: retryRename,
          onDigest: generateDigest,
          onOpenArtifact: openArtifact,
          onArtifactSession: newArtifactSession,
          canRender,
          allowNonPdfDelete,
          onRenderArtifact: renderArtifact,
          onTrashArtifact: trashArtifact,
          onPrint: printArtifact,
          onRetryArtifacts: retryArtifacts,
          onReloadArtifacts: reloadArtifacts,
          onCopyPath: copyPath,
          renaming: renaming === null ? null : renaming,
          onImport: openImport,
          onUnlink: unlinkSession,
          onStartRename: startRename,
          onRenameInput: renameInput,
          onCommitRename: commitRename,
          onCancelRename: cancelRename,
          registerChapterRef,
          registerFileRef,
        })
      } else {
        const hiddenSet = new Set(shelfGroups.hidden)
        const shelved = new Set()
        for (const shelf of shelfGroups.shelves) for (const id of shelf.books) shelved.add(id)
        const activeShelf = group === null || group === 'hidden'
          ? null
          : shelfGroups.shelves.find(shelf => shelf.id === group) ?? null
        const visibleBooks = group === 'hidden'
          ? books.filter(item => hiddenSet.has(item.id))
          : activeShelf !== null
            ? books.filter(item => activeShelf.books.includes(item.id))
            : books.filter(item => !hiddenSet.has(item.id) && !shelved.has(item.id))
        const groupNameForShelf = group === 'hidden'
          ? format('hiddenShelf')
          : activeShelf === null ? null : activeShelf.name
        const collections = [
          ...(group !== null || shelfGroups.hidden.length === 0
            ? []
            : [{ id: 'hidden', name: format('hiddenShelf'), count: shelfGroups.hidden.filter(id => books.some(book => book.id === id)).length }]),
          ...shelfGroups.shelves
            .filter(shelf => (shelf.parent ?? null) === group)
            .map(shelf => ({ id: shelf.id, name: shelf.name, count: shelf.books.filter(id => books.some(book => book.id === id)).length })),
        ]
        body = h(Shelf, {
          books: visibleBooks,
          covers: catalog.covers,
          group,
          groupName: groupNameForShelf,
          collections,
          selected,
          cardRefs,
          onSelect: selectMany,
          onToggle: toggleSelect,
          onOpen: openBook,
          registerRef,
          onOpenGroup: openGroup,
          onDeleteGroup: deleteShelf,
          onTrashBook: trashBook,
          onTrashSelected: trashSelected,
          onCreateShelf: () => setShelfName(''),
          onHide: hideSelected,
          onUnhide: unhideSelected,
          onRemoveFromShelf: removeFromShelf,
          onClear: clearSelection,
        })
      }

      // In the narrow overlay the page underneath is covered: it must not take
      // clicks or Tab stops while the drawer is open. The import dialog and the
      // reader are modal at every width, so they cover the page the same way.
      const covered = (narrow && preview !== null) || picker !== null || reader !== null || digest !== null || shelfName !== null || settingsOpen
      // The crumbs render before the catalog arrives; `work` is still null then.
      const librariesView = work !== null && work.view === 'libraries'
      const groupName = group === 'hidden'
        ? format('hiddenShelf')
        : group === null
          ? null
          : (shelfGroups.shelves.find(shelf => shelf.id === group) ?? { name: null }).name
      const libraryName = library === null || typeof library.name !== 'string' || library.name === ''
        ? format('shelf')
        : library.name

      // Candidates for the import dialog: every real conversation, minus the
      // ones this chapter already shows, most recent first.
      let pickerCandidates = []
      if (picker !== null && sessionList !== null && Array.isArray(sessionList.ids) && sessionList.byId !== undefined) {
        const groups = sessionIndex.byChapter.get(`${picker.bookId}|${picker.code}`)
        const present = new Set()
        if (groups !== undefined) {
          for (const mode of MODES) {
            for (const item of Array.isArray(groups[mode]) ? groups[mode] : []) present.add(item.id)
          }
        }
        for (const id of sessionList.ids) {
          const summary = sessionList.byId[id]
          if (summary === undefined || summary.origin === 'subagent') continue
          if (archivedIds.has(id)) continue
          if (summary.blank === true) continue
          pickerCandidates.push({
            id,
            label: (typeof summary.title === 'string' && summary.title !== '' ? summary.title : summary.displayTitle) || id,
            linked: present.has(id),
            foreign: typeof summary.cwd === 'string' && summary.cwd !== '' && catalog !== null
              && catalog.target.cwd !== '' && !sameDirectory(summary.cwd, catalog.target.cwd),
            updatedAt: typeof summary.updatedAt === 'number' ? summary.updatedAt : 0,
          })
        }
        pickerCandidates.sort((left, right) => right.updatedAt - left.updatedAt)
      }

      return h('div', { className: 'md-root', 'data-preview': preview === null ? undefined : 'open', ref: rootRef },
        h('style', null, CSS),
        h('input', {
          type: 'file', multiple: true, ref: importInput,
          style: { display: 'none' }, onChange: importFiles,
        }),
        h('div', { className: 'md-inner' },
          h('header', { className: 'md-head', inert: covered ? '' : undefined },
            h('div', {
              className: 'md-head-titles',
              title: format('librariesTitleHint'),
              onDoubleClick: () => backToLibraries(),
            },
              h('h1', { className: 'md-title' }, format('title')),
              h('p', { className: 'md-subtitle' }, format('subtitle', { books: books.length, chapters: totalChapters })),
              h('span', {
                className: 'md-mode-pill',
                'data-mode': mathMode ? 'math' : 'general',
                title: format('workflowHint'),
              }, format(mathMode ? 'workflowMath' : 'workflowGeneral'))
            ),
            h('div', { className: 'md-head-actions' },
              book === null ? null : h(KitButton, {
                type: 'button', className: 'md-btn md-btn-ghost', onClick: backToShelf,
              }, `‹ ${format('back')}`),
              h('div', { className: 'md-settings' },
                h(KitButton, {
                  type: 'button', className: 'md-btn md-btn-ghost',
                  'aria-haspopup': 'dialog', 'aria-expanded': settingsOpen ? 'true' : 'false',
                  onClick: () => setSettingsOpen(value => !value),
                }, `⚙ ${format('settings')}`)
              ),
              h(KitButton, {
                type: 'button', className: 'md-btn', disabled: busy || creatingKey !== '',
                title: format('cleanupHint'),
                onClick: cleanupNow,
              }, format('cleanup')),
              h(KitButton, {
                type: 'button', className: 'md-btn', disabled: busy,
                onClick: reload,
              }, busy ? format('refreshing') : format('refresh'))
            )
          ),
          h('nav', { className: 'md-crumbs', 'aria-label': format('crumbsLabel'), inert: covered ? '' : undefined },
            h(KitButton, {
              type: 'button',
              className: librariesView ? 'md-crumb-current' : 'md-crumb',
              disabled: librariesView,
              onClick: backToLibraries,
            }, format('libraries')),
            librariesView ? null : h('span', { className: 'md-crumb-sep', 'aria-hidden': true }, '/'),
            librariesView
              ? null
              : book === null && groupName === null
                ? h('span', { className: 'md-crumb-current', 'aria-current': 'page' }, libraryName)
                : h(KitButton, {
                  type: 'button', className: 'md-crumb',
                  onClick: goShelf,
                }, libraryName),
            groupName === null ? null : h('span', { className: 'md-crumb-sep', 'aria-hidden': true }, '/'),
            groupName === null
              ? null
              : book === null
                ? h('span', { className: 'md-crumb-current', 'aria-current': 'page' }, groupName)
                : h(KitButton, {
                  type: 'button', className: 'md-crumb',
                  onClick: () => openGroup(group),
                }, groupName),
            book === null || librariesView ? null : h('span', { className: 'md-crumb-sep', 'aria-hidden': true }, '/'),
            book === null || librariesView ? null : h('span', { className: 'md-crumb-current', 'aria-current': 'page' }, book.title)
          ),
          inlineError === '' ? null : h('div', { className: 'md-alert', role: 'alert', inert: covered ? '' : undefined },
            h('span', { className: 'md-alert-text' }, inlineError),
            h(KitButton, { type: 'button', className: 'md-btn md-btn-small', onClick: reload }, format('retry'))
          ),
          notice === '' ? null : h('div', { className: 'md-notice', role: 'status', inert: covered ? '' : undefined }, notice),
          catalog === null || blockingError !== '' || partialFiles === 0 ? null : h('div', { className: 'md-hint', inert: covered ? '' : undefined },
            format('partialHint', { files: partialFiles })
          ),
          h('div', { className: 'md-content' },
            h('div', {
              className: 'md-body',
              ref: bodyRef,
              inert: covered ? '' : undefined,
              onScroll: event => {
                const node = event.currentTarget
                node.classList.add('md-scrolling')
                window.clearTimeout(node.__mdScrollbarTimer)
                node.__mdScrollbarTimer = window.setTimeout(() => node.classList.remove('md-scrolling'), 420)
              },
            },
              body,
              work === null || (work.view !== 'shelf' && work.view !== 'book') ? null : h('details', { className: 'md-details md-tips' },
                h('summary', { className: 'md-details-summary' }, format('tipsTitle')),
                h('div', { className: 'md-tips-line' }, format('tipsLeftClick')),
                h('div', { className: 'md-tips-line' }, format('tipsRightClick'))
              ),
              catalog === null || blockingError !== '' || work === null || work.view === 'libraries' ? null : h('details', { className: 'md-details', style: { order: 4 } },
                h('summary', { className: 'md-details-summary' }, format('diagnosticsTitle')),
                h(Diagnostics, { catalog, books, unresolved: sessionIndex.unresolved })
              )
            ),
            preview === null
              ? null
              : h(PreviewPane, {
                preview,
                paneRef: previewPane,
                bodyRef: previewBody,
                onClose: closePreview,
                onRetry: retryPreview,
              }),
            preview !== null && narrow
              ? h('div', { className: 'md-preview-backdrop', 'aria-hidden': true, onClick: closePreview })
              : null
          )
        ),
        picker === null
          ? null
          : h(SessionPicker, {
            target: picker,
            candidates: pickerCandidates,
            onPick: importSession,
            onClose: closeImport,
          }),
        digest === null
          ? null
          : h(DigestDialog, {
            digest,
            onClose: closeDigest,
            onCopy: copyDigest,
          }),
        printPage === null
          ? null
          : h(PrintDialog, {
            name: printPage.name,
            html: printPage.html,
            busy: printPage.busy,
            error: printPage.error,
            onClose: () => setPrintPage(null),
          }),
        settingsOpen
          ? h(SettingsDialog, {
            version: catalog === null ? '' : catalog.version,
            envTools,
            initialTab: settingsTab,
            activeWorkflow,
            onWorkflowChange: value => writeWorkflowMode(value),
            onApiKeyChange: configured => setEnvTools(current => ({ ...current, apiKey: configured === true })),
            updateBusy,
            updateInfo,
            marketUpdate,
            updateOperation,
            onInstallUpdate: installUpdate,
            onCheckUpdate: checkUpdates,
            previewPdf,
            allowNonPdfDelete,
            socratic,
            onSocratic: () => setSocratic(value => {
              const next = !value
              try {
                window.localStorage.setItem('pdfdesk:socratic', next ? '1' : '0')
              } catch {
                // storage unavailable
              }
              return next
            }),
            railSide,
            onRailSide: () => setRailSide(value => {
              const next = value === 'right' ? 'left' : 'right'
              try {
                window.localStorage.setItem('pdfdesk:rail-side', next)
              } catch {
                // storage unavailable
              }
              return next
            }),
            roughness,
            onRoughness: value => {
              const next = Math.max(0, Math.min(2, Number(value) || 0))
              setRoughness(next)
              try {
                window.localStorage.setItem('pdfdesk:roughness', String(next))
              } catch {
                // storage unavailable
              }
            },
            onClearSharedPrefix: () => {
              if (typeof window !== 'undefined' && typeof window.confirm === 'function'
                && !window.confirm(format('sharedPrefixClearHint'))) return
              void (async () => {
                try {
                  const result = await request('POST', 'shared-prefix', { action: 'clear' })
                  const removed = Number(result === null || result === undefined ? 0 : result.removed)
                  showNotice(format('sharedPrefixCleared', { n: Number.isFinite(removed) ? removed : 0 }))
                } catch (reason) {
                  showNotice(`${format('sharedPrefixFailed')} (${errorText(reason)})`)
                }
              })()
            },
            onPreview: () => setPreviewPdf(value => {
              const next = !value
              try {
                window.localStorage.setItem('pdfdesk:preview-pdf', next ? '1' : '0')
              } catch {
                // storage unavailable
              }
              return next
            }),
            onNonPdf: () => setAllowNonPdfDelete(value => {
              const next = !value
              try {
                window.localStorage.setItem('pdfdesk:delete-non-pdf', next ? '1' : '0')
              } catch {
                // storage unavailable
              }
              return next
            }),
            questionInject,
            onQuestionInject: () => setQuestionInject(value => {
              const next = !value
              writeQuestionInject(next)
              return next
            }),
            onClose: () => setSettingsOpen(false),
          })
          : null,
        shelfName === null
          ? null
          : h(ShelfNameDialog, {
            name: shelfName,
            error: '',
            onChange: setShelfName,
            onConfirm: createShelf,
            onClose: () => setShelfName(null),
          }),
        reader === null
          ? null
          : h(ReaderView, {
            reader,
            railSide,
            roughness,
            canTranslate,
            canExport,
            mathMode,
            onEnvRequired: setEnvPrompt,
            onGeneralSession: openGeneralSession,
            doc: readerDoc.current,
            busy: creatingKey !== '',
            forceNew: readerForceNew,
            wholeBook: book !== null && book.whole === true,
            fitScale,
            onScale: readerScale,
            stageRef: readerStage,
            paneRef: readerPane,
            onBack: closeReader,
            onShelf: () => {
              closeReader()
              backToShelf()
            },
            onPrev: readerPrev,
            onNext: readerNext,
            onPage: readerPage,
            onZoomIn: () => readerZoom(1.2),
            onZoomOut: () => readerZoom(1 / 1.2),
            onFit: readerFit,
            onMode: readerMode,
            onNewSession: mode => readerNewSession(mode, readerForceNew),
            onForceNew: setReaderForceNew,
            onVisible: readerVisible,
            onError: readerError,
            onRetry: () => openReader({
              bookId: reader.bookId,
              code: reader.code,
              title: reader.title,
              fileName: reader.fileName,
              name: reader.name,
              bookTitle: reader.bookTitle,
            }, true),
            onExported: () => { void loadArtifacts(reader.bookId, reader.code, true) },
          }),
        envPrompt === ''
          ? null
          : h(EnvPrompt, {
            kind: envPrompt,
            envTools,
            onClose: () => setEnvPrompt(''),
            onOpenSettings: () => {
              setEnvPrompt('')
              setSettingsTab('env')
              setSettingsOpen(true)
            },
          }),
        workspacePrompt === null
          ? null
          : h(WorkspacePrompt, {
            workspaces,
            defaultPath: catalog === null ? '' : catalog.libraryDir,
            onPick: pickWorkspace,
            onCreate: createWorkspace,
            onCancel: () => resolveWorkspacePrompt(null),
          })
      )
    }

    /* --------------------------------------------------------------- plugin -- */

    /**
     * Last-resort error panel: a render bug in this page must not blank the
     * whole workbench (a blank panel looks like broken data). React's error
     * boundaries need a class component; this is the only one in the plugin.
     */
    class PageBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
        this.retry = this.retry.bind(this)
      }

      /**
       * @param {Error} error - what the render threw.
       * @returns {{ error: Error }} the fallback state.
       */
      static getDerivedStateFromError(error) {
        return { error }
      }

      /**
       * @param {Error} error - what the render threw.
       * @param {{ componentStack?: string }} info - React's component trace.
       * @returns {void}
       */
      componentDidCatch(error, info) {
        console.error('pdfdesk: page crashed', error, info)
      }

      /** Let the user try the same page again after a transient failure. */
      retry() {
        this.setState({ error: null })
      }

      /**
       * @returns {import('react').ReactElement} the page, or the fallback.
       */
      render() {
        if (this.state.error === null) return this.props.children
        const message = this.state.error !== null && this.state.error !== undefined && this.state.error.message !== undefined
          ? String(this.state.error.message)
          : String(this.state.error)
        return h('div', { className: 'md-root' },
          h('style', null, CSS),
          h('div', { className: 'md-inner' },
            h('div', { className: 'md-state md-state-error', role: 'alert' },
              h('div', { className: 'md-empty-title' }, format('pageCrashed')),
              h('p', { className: 'md-state-detail' }, format('pageCrashHint')),
              h('pre', { className: 'md-state-detail' }, message),
              h('div', { className: 'md-state-actions' },
                h(KitButton, { type: 'button', className: 'md-btn', onClick: this.retry }, format('retry'))
              )
            )
          )
        )
      }
    }

    /**
     * The slot component: the boundary owns any render failure of the page.
     * @returns {import('react').ReactElement} the guarded page.
     */
    function WorkbenchRoot() {
      return h(PageBoundary, null, h(WorkbenchPage))
    }

    /**
     * Browser plugin body: copy, the sidebar entry, and the page.
     * @param {import('@deepseek-ai/cordis').Context} ctx - client root context.
     * @returns {void}
     */
    function apply(ctx) {
      clientContext = ctx
      if (typeof window !== 'undefined') window.__pdfdeskTrace = traceRing
      localeService = ctx.get('locale') ?? null
      sessionsService = ctx.get('sessions') ?? null
      translate = localeService === null ? key => key : localeService.bind(NS)
      ctx.effect(() => {
        const disposers = []
        disposers.push(ctx.locale.register(NS, 'zh', zh))
        disposers.push(ctx.locale.register(NS, 'en', en))
        return () => { for (const dispose of disposers) dispose() }
      }, 'pdfdesk: dictionaries')

      // The right column's preview is visible while this page is not mounted, so
      // the stylesheet lives in the document head for the plugin's lifetime; the
      // page keeps its own copy for the frames before this effect runs.
      ctx.effect(() => {
        if (typeof document === 'undefined' || document.head === undefined) return () => {}
        const style = document.createElement('style')
        style.dataset.pdfdesk = 'stylesheet'
        style.textContent = CSS
        document.head.appendChild(style)
        return () => { style.remove() }
      }, 'pdfdesk: stylesheet')

      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 30,
        label: () => format('navLabel'),
      }, DeskIcon)), 'pdfdesk: sidebar entry')

      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
      }, WorkbenchRoot)), 'pdfdesk: page')

      // The Q&A persona must reach sessions opened from the sidebar too, where no
      // workbench click happens. This seat lives in the composer for every
      // session and seeds only Q&A ones, once each.
      ctx.effect(() => ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'pdfdesk-qa-persona',
        order: 40,
      }, QaPersonaSeat)), 'pdfdesk: qa persona seat')

      // The right column's chapter tab. It is optional wiring: without that
      // column the reader keeps opening the plain file tab instead.
      try {
        registerSidePreview(ctx)
      } catch (error) {
        trace('side', 'registration failed', String(error))
      }
    }

    return {
      name: 'dsh-pdf-workbench',
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
