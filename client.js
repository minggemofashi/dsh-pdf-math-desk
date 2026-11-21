/**
 * Browser half of dsh-pdf-math-desk: the full-page workbench.
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
  id: 'dsh-pdf-math-desk',
  factory(require) {
    'use strict'

    const React = require('react')
    const h = React.createElement
    const useState = React.useState
    const useEffect = React.useEffect
    const useCallback = React.useCallback
    const useRef = React.useRef

    const PANEL_ID = 'mathdesk'
    const NS = 'mathDesk'
    const ENDPOINT = 'mathdesk/'
    const REQUEST_TIMEOUT_MS = 12000
    const SAVE_DELAY_MS = 180
    const NOTICE_MS = 5000

    /** Session modes, in the order the chapter shows them. */
    const MODES = ['extract', 'qa', 'exercise']

    /** The mode word written into a session title (data, not UI copy). */
    const TITLE_MODE = { extract: '提取', qa: '答疑', exercise: '习题' }
    const GITHUB_URL = 'https://github.com/minggemofashi/dsh-pdf-math-desk'
    const TEXLIVE_URL = 'https://tug.org/texlive/acquire.html'

    /**
     * Last page read for one chapter, so leaving the reader does not reset it.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {number} a positive page number, or 1.
     */
    function readReaderPage(bookId, code) {
      try {
        const raw = window.localStorage.getItem(`mathdesk:page:${bookId}:${code}`)
        const value = Number.parseInt(raw ?? '', 10)
        return Number.isFinite(value) && value > 0 ? value : 1
      } catch {
        return 1
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
        window.localStorage.setItem(`mathdesk:page:${bookId}:${code}`, String(page))
      } catch {
        // storage unavailable
      }
    }

    /** A workbench session title: `[<book> cNN] <mode>`, half- or full-width brackets. */
    const SESSION_TITLE = /^[\[【](.+?)[\s\u3000]+(c\d{2,3})[\]】][\s\u3000]*(.+?)[\s\u3000]*$/i

    /** Mode word (Chinese canonical, English alias) → mode key; tolerant of a suffix such as `答疑（续）`. */
    const MODE_OF = [
      ['提取', 'extract'],
      ['答疑', 'qa'],
      ['习题', 'exercise'],
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
      title: '数学工作台',
      subtitle: '{books} 本书 · {chapters} 章',
      shelf: '书架',
      libraries: '书库',
      librariesTitle: '书库',
      librariesHint: '数学书库：单击切换为当前书库，双击直接进入它的书架。目前只支持数学布局（分片 / 产物 / 封面 / 索引）。',
      libraryActive: '当前',
      libraryUse: '切换',
      libraryRemove: '移除',
      libraryRemoveConfirm: '再点一次移除',
      libraryAddTitle: '添加书库',
      libraryAddHint: '选择库根目录（里面应有 分片\\ 或 整本\\；两者可以同时存在）。',
      libraryName: '名称',
      libraryPath: '目录',
      libraryPick: '选择目录…',
      libraryAdd: '添加书库',
      libraryBusy: '处理中…',
      libraryFailed: '书库操作失败',
      libraryBooks: '{n} 本',
      modeMath: '数学',
      manualTitle: '书库说明书',
      manualWhy: '「分片」= 把书**按章节**切成小 PDF：一章一个文件，每个会话只读一章，上下文小、定位也清楚。**先由你手动按章节拆**（每章从哪页到哪页看目录），工具负责按规则重命名与校验；不要整本拆（整本拆=整本 OCR，贵且容易撑爆上下文）。**目录必须有**（放进 c00，它是定位各章的索引）。只适合读数学书；阅读器只读，不做标注/笔记。',
      manualStructure: '放法：{root}\\分片\\<书 id>\\ 下，一章一个 PDF，保留目录。文件名带页码范围（如 概率论_积分和数学期望_97-138.pdf）即可，工作台会按页序自动编号；也可以写成 <书 id>_cNN_章名_p起-止.pdf。产物\\ 与 封面\\ 可选。',
      manualIdNote: '书 id 就是书目名/分片名前缀，添加书库后不要再改名：会话标题与产物目录都按它关联，改名会让旧会话和产物对不上（书名可以改显示，目录名请保持稳定）。',
      manualSplit: '拆分：任意 PDF 工具按章节切开、保留目录，放进 分片\\<书 id>\\ 即可；不需要自己编号，页码范围会自动排序（目录/前言归 c00，附录 c90+）。',
      manualSession: '拆分会话：点下面的按钮，工具会复制到当前书库的 工具\\，并新开一个会话，提示词里已经写好当前书库的路径、目标目录和命名规则。',
      aiPromptHint: '让 AI 直接产出可用的 Markdown（复制下面这句发给它）：',
      aiPromptText: '给我一份报告，用 markdown 格式，数学公式行内用 $ 格式，行间用 $$ 格式，不要出现 \\[ 和 \\( 格式',
      aiPromptCopy: '复制提示词',
      aiPromptCopied: '提示词已复制',
      splitStart: '拆分工具：开一个会话',
      splitHint: '把工具复制到当前书库的 工具\\，并新建一个带预设提示词的会话。',
      importStart: '导入文件',
      importBusy: '导入中…',
      importFilesHint: '导入 md/txt/pdf：md/txt 自动渲染为 PDF 放进当前书库的 整本\\（当作整本书）；PDF 直接放进 整本\\。',
      importFilesDone: '已导入 {n} 个文件到 库根\\整本\\',
      splitPrompt: '你是数学书库整理助手。**拆分由用户手动作，按章节拆**（一章一个 PDF，页范围看目录）；你的工作是按命名规则重命名、校验、整理目录，不要整本 OCR/拆分。\n书库根目录：{dir}\n目标目录：{dir}\\分片\\<书 id>\\（书 id 是这本书的简写，例如 概率论）\n工具：{dir}\\工具\\ 下的 rename_chapters.py（批量改名）、pdfkit.py（split/verify/render）、auto_chapters.py；规则：{dir}\\工具\\README.md 与 {dir}\\工具\\规范\\。\n要点：目录页必须在 c00；一章一个 PDF，命名 <书 id>_cNN_第X章_章名_p起-止.pdf；缺目录就先请用户补，不要自己猜。\n流程：确认书 id 与已有分片 → 改名/校验 → 报告结果和缺的章。',
      splitFailed: '拆分工具启动失败',
      librariesTitleHint: '双击标题回到书库',
      back: '返回',
      refresh: '刷新',
      refreshing: '刷新中…',
      retry: '重试',
      crumbsLabel: '位置',
      chapters: '{n} 章',
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
      readerFirstHint: '回到第一页',
      readerPage: '页码',
      readerZoomIn: '放大',
      readerZoomOut: '缩小',
      readerFit: '适应宽度',
      readerBack: '返回章节',
      readerShelf: '书架',
      readerShelfHint: '回到书架（书的列表页）',
      readerOf: '/ {n}',
      readerMode: '阅读模式',
      readerModeSingle: '单页',
      readerModeContinuous: '连续',
      blocksToggle: '块',
      blocksHint: '显示/隐藏文本块边框（调试）',
      dualToggle: '双语',
      dualHint: '原文与译文并排显示（需要先生成译文）',
      dualNeedsTranslation: '还没有译文。是否现在翻译本章？会消耗 token，并需要先在设置里填写 DeepSeek API Key。',
      dualOriginal: '原文',
      dualTranslated: '译文',
      translateAction: '翻译本页',
      translateChapterAction: '翻译本章',
      translating: '翻译中…',
      translateDone: '已生成',
      translateFailed: '翻译失败',
      translateHint: '把当前页翻译成另一种语言；需要 DeepSeek API Key',
      translateFor: '翻译为：',
      langZh: '中文',
      langEn: 'English',
      translateToEn: '译为英文',
      translateToZh: '译为中文',
      translatedLabel: '译文',
      translatedDelete: '删除译文',
      translatedDeleteConfirm: '删除这份译文？原 PDF 不会被改动，译文会移动到 回收站\\译文\\，可恢复。',
      readerNewLabel: '从这一章开始：',
      readerNewHint: '接着本章该分组的会话并跳过去；快满时自动另起续会话；本章 PDF 会自动开在会话右侧',
      readerInSessionFailed: '会话已建好，但右侧 PDF 没打开（可能不在库工作区）。',
      sessionsTitle: '会话',
      newSession: '新建',
      newSessionOf: '新建{mode}会话',
      newSessionHint: '优先接着本章这个分组的会话；快满时自动另起一个续会话',
      forceNew: '另起',
      forceNewOf: '另起一个新的{mode}会话（不续接）',
      forceNewHint: '跳过续接，直接开一个新的续会话（编号接着往下排）',
      digest: '整理提纲',
      digestOf: '把本章会话整理成提纲',
      digestWorking: '正在整理…（一次模型调用，稍等）',
      digestFailed: '整理提纲失败',
      digestDone: '提纲已保存到本章产物',
      digestTitle: '本章提纲',
      digestCopy: '复制',
      digestCopied: '已复制提纲',
      digestEmpty: '这一章还没有可总结的会话',
      digestHint: '由当前默认模型总结本章所有会话；结果存到 产物/<书>/<章>/提纲-all.md，再点「重新读取」就能在产物里看到。',
      sessionWithOutline: '本章提纲已放进新会话的输入框，可直接改或发送',
      sessionWithContext: '已把本章与 PDF 信息放进新会话的输入框',
      creating: '正在新建…',
      sessionsCount: '{n} 个会话',
      sessionLoading: '正在读取会话…',
      sessionUnresolved: '{n} 个会话标题没对上书或章',
      sessionUnavailable: '会话服务不可用。',
      sessionCreated: '已新建：{title}',
      sessionResumed: '接着本章的「{mode}」会话（上下文 {pct}%）',
      sessionContinued: '上一段上下文已用 {pct}%，已另起一个续会话',
      sessionCreateFailed: '新建会话失败',
      sessionRenameFailed: '会话已创建，但标题没写成约定格式。',
      pendingHint: '发送第一条消息后写入会话标题；没发送的不会保留。',
      importSessions: '导入',
      importOf: '导入已有会话到{mode}组',
      importHint: '把一个已有会话挂到本章；不会改它的标题。',
      importTitle: '导入已有会话',
      importChapter: '挂到 {code} · {title}',
      importSearch: '搜索标题…',
      importEmpty: '没有可导入的会话。',
      importAlready: '已在本章',
      importForeign: '不在库工作区',
      importTruncated: '只显示前 {n} 个',
      importDone: '已挂到本章：{title}',
      importFailed: '挂载失败',
      linkedHint: '挂载到本章',
      unlink: '取消挂载',
      unlinkDone: '已从本章移除（对话本身没动）',
      rename: '重命名',
      renameSave: '保存',
      renameCancel: '取消',
      renameEmpty: '标题不能为空',
      renameHint: '工作台按标题 `[书 cNN] 模式` 归类；改掉前缀会从章节里移出。',
      renameDone: '已重命名',
      renameFailed: '重命名失败',
      cleanup: '清理空会话',
      updateCheck: '检查更新',
      previewPdf: '右侧预览',
      previewOn: '开',
      previewOff: '关',
      previewPdfHint: '创建会话时自动在右栏显示本章 PDF（只是预览，不进入上下文）',
      deleteNonPdf: '非PDF删除',
      deleteNonPdfHint: '开启后，md/txt 等非 PDF 产物也会显示「删除」按钮；关闭时只允许删除 PDF',
      settings: '设置',
      version: '版本',
      githubRepo: 'GitHub 仓库',
      aiPromptTitle: 'AI 生成 Markdown',
      libraryPathsTitle: '书库路径与书 id',
      libraryPathHint: '这里统一显示为 {root}：绝对路径只在本机有效，不随插件或仓库迁移。',
      readLocalPath: '读取本机路径',
      hideLocalPath: '隐藏本机路径',
      tipsLeftClick: '左键：单击书卡＝选中/取消选中，双击＝打开书本；单击章节名＝展开/收起。',
      tipsRightClick: '右键：书卡与章节没有右键操作；产物（转 PDF / 删除）与会话（归档）支持右键。',
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
      apiKeyTitle: 'DeepSeek API Key（翻译用）',
      apiKeyConfigured: '已配置',
      apiKeyMissing: '未配置',
      apiKeySave: '保存',
      envReady: '已就绪：md 可转 PDF',
      envMissing: '未安装：md→PDF 按钮已隐藏，其余功能正常',
      envDownload: '下载 TeX Live（约 5 GB）',
      envHint: '需 TeX Live（含 xelatex、ctex）与 Python 3；安装后把 TeX 的 bin 加入 PATH，重启 DSH 生效。',
      updateChecking: '检查中…',
      updateHint: '只在你点击时访问 GitHub 的 releases 接口，不会自动联网',
      updateLatest: '已是最新版本（v{version}）',
      updateNew: '发现新版本 {version}（当前 {current}），到 GitHub Releases 下载',
      updateNoRelease: '仓库还没有发布版本',
      updateFailed: '检查更新失败（网络或代理问题），可稍后重试',
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
      cleanupHint: '归档没说话的空会话；工作台自己留下的空白记录会被删除',
      cleanupNotice: '已清理 {n} 个没说话的空白会话（归档）。',
      retryRename: '重试改名',
      targetMissing: '找不到库目录所属的工作区，无法新建会话。',
      sessionTarget: '会话建在：{dir}',
      titleLegend: '书 id（会话标题与产物目录共用）：{pairs}',
      running: '运行中',
      'mode.extract': '提取',
      'mode.qa': '答疑',
      'mode.exercise': '习题',
      bookEmpty: '这本书还没有可显示的章。',
      wholeBook: '整本',
      wholeBadge: '整本 PDF',
      wholeHint: '可直接阅读，不分章',
      wholeExplain: '不会拆分？把整本 PDF 放进 {dir}\\整本\\ 也能直接读：点上面的按钮就开始读整本。代价是没有分章、没有按章会话，产物也只按整本。',
      manualWhole: '不想拆 / 不会拆？把整本 PDF 直接放进 {root}\\整本\\（文件名就是书 id）：书架会出现「整本 PDF」，点开就能读整本。代价是没有分章、没有按章会话，只有一个整本阅读。',
      sampleTitle: '示例书库',
      sampleLoading: '正在读取示例书…',
      sampleEmpty: '插件没有附带示例书',
      sampleMeta: '{chapters} 章 · 共 {size}',
      sampleHint: '内置的一本小册子，已经按章拆好；加载后书架立即可见，用来试用章节会话与阅读器。',
      sampleLoad: '加载示例书',
      sampleBusy: '正在复制…',
      sampleLoaded: '示例书已加入当前书库（{n} 个文件）',
      loading: '正在读取书目…',
      loadFailed: '读取书目失败',
      timeout: '读取超时，请重试。',
      saveFailed: '位置没有保存成功。',
      emptyTitle: '书库里还没有可识别的书',
      emptyHint: '把按章切好的 PDF 放进库目录的「分片」文件夹（文件名形如 书名_c04_第四章_标题_p097-138.pdf），或写一份 索引.json。',
      sourceScan: '目录来自分片文件名（没有 索引.json）。',
      sourceIndex: '目录来自 索引.json。',
      indexIgnored: '索引.json 读取失败，已改为按文件名推导。',
      libraryAt: '库目录：{dir}',
      skipped: '未识别（未按章命名）：{dir}（{n} 个 PDF）',
      bookUnparsed: '{title}：{n} 个 PDF 未按章命名',
      partialHint: '有 {files} 个 PDF 没按章命名，已跳过；完整清单位于页脚。',
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
      artifactsEmptyHint: '把文件放进这个目录，然后点「重新读取」：',
      artifactsScope: '只列这一层的文件；子文件夹不会显示。',
      artifactsBookId: '路径里的「{id}」是书 id，不是书名。',
      artifactsReload: '重新读取',
      artifactsExpand: '展开',
      artifactsCollapse: '收起',
      renderConfirm: '把 {name} 渲染为 PDF？会生成同名 PDF 放在 md 旁边。',
      renderAction: '转 PDF',
      renderActionHint: '渲染为 PDF，与 md 同目录',
      trashAction: '删除',
      trashFileHint: '移到 回收站\\（可恢复）',
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
      navLabel: '数学工作台',
      pageCrashed: '工作台页面出错了',
      pageCrashHint: '这是插件内部的错误，不是你的数据问题。把下面的信息发给我就能定位。',
    }

    const en = {
      title: 'Math workbench',
      subtitle: '{books} books · {chapters} chapters',
      shelf: 'Books',
      libraries: 'Libraries',
      librariesTitle: 'Libraries',
      librariesHint: 'Math libraries: click to switch the active one, double-click to open its bookshelf. Only the math layout is supported (分片 / 产物 / 封面 / 索引).',
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
      libraryFailed: 'Library operation failed',
      libraryBooks: '{n} books',
      modeMath: 'Math',
      manualTitle: 'Library manual',
      manualWhy: '"分片" = the book cut into one PDF **per chapter**: each conversation reads one chapter, so its context stays small and the chapter is easy to locate. **You split manually, chapter by chapter** (page ranges from the contents); the tools rename and verify. Never split the whole book (whole-book splitting means whole-book OCR: expensive and context-blowing). The **table of contents must stay in c00** — it is the index that locates chapters. Math books only; the reader is read-only: no annotations or notes.',
      manualStructure: 'Put one PDF per chapter under {root}\\分片\\<book id>\\, keep the contents. Page ranges in the name (e.g. 概率论_积分和数学期望_97-138.pdf) are enough — the workbench numbers chapters by page order; explicit <book id>_cNN_章名_p起-止.pdf also works. 产物\\ and 封面\\ optional.',
      manualSplit: 'Split with any PDF tool by chapter, keep the contents, and drop the files into 分片\\<book id>\\. No manual numbering: page ranges sort the chapters (contents/preface become c00, appendices c90+).',
      manualSession: 'Split session: the button below copies the toolkit into 工具\\ of this library and opens a conversation whose prompt already names the library path, the target folder, and the naming rules.',
      aiPromptHint: 'Ask the AI for usable Markdown (copy the sentence below):',
      aiPromptText: 'Give me a report in markdown; inline math with $...$, display math with $$...$$, never use \\[ or \\( forms.',
      aiPromptCopy: 'Copy prompt',
      aiPromptCopied: 'Prompt copied',
      splitStart: 'Split a book (opens a conversation)',
      splitHint: 'Copy the toolkit into 工具\\ of the active library and open a conversation with a prepared prompt.',
      importStart: 'Import files',
      importBusy: 'Importing…',
      importFilesHint: 'Import md/txt/pdf: md/txt are rendered to PDF in this library\'s 整本\\ as a whole book; PDFs go there directly.',
      importFilesDone: 'Imported {n} file(s) into the library\'s 整本\\ folder',
      splitPrompt: 'You organize a math library. **The user splits by hand, one chapter per PDF** (page ranges from the contents); your job is renaming, verifying and organizing — never OCR or split the whole book.\nLibrary root: {dir}\nTarget: {dir}\\分片\\<book id>\\ (a short id like 概率论)\nTools: {dir}\\工具\\ with rename_chapters.py (batch rename), pdfkit.py (split/verify/render), auto_chapters.py; rules: {dir}\\工具\\README.md and {dir}\\工具\\规范\\.\nPoints: the contents must be in c00; one PDF per chapter, named <book id>_cNN_第X章_章名_p起-止.pdf; if the contents are missing, ask the user — do not guess.\nFlow: confirm the book id and existing splits → rename/verify → report the result and missing chapters.',
      splitFailed: 'Could not start the split conversation',
      librariesTitleHint: 'Double-click the title for the libraries',
      back: 'Back',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      retry: 'Retry',
      crumbsLabel: 'Location',
      chapters: '{n} chapters',
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
      readerBack: 'Back to the chapter',
      readerShelf: 'Shelf',
      readerShelfHint: 'Back to the shelf (the book list)',
      readerOf: '/ {n}',
      readerMode: 'Reading mode',
      readerModeSingle: 'Single page',
      readerModeContinuous: 'Continuous',
      blocksToggle: 'Blocks',
      blocksHint: 'Show or hide text block boxes (debug)',
      dualToggle: 'Bilingual',
      dualHint: 'Show the original and the translation side by side (translate the chapter first)',
      dualNeedsTranslation: 'No translation yet. Translate this chapter now? It costs tokens and needs a DeepSeek API key in Settings.',
      dualOriginal: 'Original',
      dualTranslated: 'Translation',
      translateAction: 'Translate page',
      translateChapterAction: 'Translate chapter',
      translating: 'Translating…',
      translateDone: 'Created',
      translateFailed: 'Translation failed',
      translateHint: 'Translate the current page; needs a DeepSeek API key',
      translateFor: 'Translate to:',
      langZh: 'Chinese',
      langEn: 'English',
      translateToEn: 'to English',
      translateToZh: 'to Chinese',
      translatedLabel: 'Translation',
      translatedDelete: 'Delete translation',
      translatedDeleteConfirm: 'Delete this translation? The original PDF is untouched; the translation moves to 回收站\\译文\\ and can be restored.',
      readerNewLabel: 'Start from this chapter:',
      readerNewHint: 'Continues this chapter’s conversation in this group and goes there; starts a continuation when it fills up. The chapter PDF opens on the session’s right.',
      readerInSessionFailed: 'The session was created, but the PDF could not open on its right side.',
      sessionsTitle: 'Sessions',
      newSession: 'New',
      newSessionOf: 'New {mode} session',
      newSessionHint: 'Continues this chapter’s conversation in this group; starts a continuation when it fills up',
      forceNew: 'Start new',
      forceNewOf: 'Start a new {mode} session without continuing',
      forceNewHint: 'Skip continuing and start a fresh continuation (the chain number keeps counting)',
      digest: 'Outline',
      digestOf: 'Summarize this chapter’s conversations into an outline',
      digestWorking: 'Summarizing… (one model call, a moment)',
      digestFailed: 'Could not build the outline',
      digestDone: 'The outline was saved beside the chapter’s produced files',
      digestTitle: 'Chapter outline',
      digestCopy: 'Copy',
      digestCopied: 'Outline copied',
      digestEmpty: 'This chapter has no conversation to summarize yet',
      digestHint: 'The default model summarizes every conversation under this chapter; the result is saved as 产物/<book>/<cNN>/提纲-all.md and appears after Reload.',
      sessionWithOutline: 'The chapter outline is in the new conversation’s composer — edit or send it',
      sessionWithContext: 'The chapter and PDF are in the new conversation’s composer',
      creating: 'Creating…',
      sessionsCount: '{n} sessions',
      sessionLoading: 'Reading sessions…',
      sessionUnresolved: '{n} session titles matched no book or chapter',
      sessionUnavailable: 'The session service is unavailable.',
      sessionCreated: 'Created: {title}',
      sessionResumed: 'Continuing this chapter’s "{mode}" conversation (context {pct}%)',
      sessionContinued: 'The previous context was {pct}% full, so a continuation was started',
      sessionCreateFailed: 'Could not create the session',
      sessionRenameFailed: 'The session was created, but its title was not written.',
      pendingHint: 'The title is written when you send the first message; unsent ones are not kept.',
      importSessions: 'Import',
      importOf: 'Import an existing session into the {mode} group',
      importHint: 'Attach an existing session to this chapter; its title is not changed.',
      importTitle: 'Import an existing session',
      importChapter: 'Attach to {code} · {title}',
      importSearch: 'Search titles…',
      importEmpty: 'No session to import.',
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
      renameHint: 'The workbench classifies by the title `[<book> cNN] <mode>`; changing the prefix moves it out of the chapter.',
      renameDone: 'Renamed',
      renameFailed: 'Could not rename',
      cleanup: 'Clean unused',
      updateCheck: 'Check for updates',
      previewPdf: 'Side preview',
      previewOn: 'on',
      previewOff: 'off',
      previewPdfHint: 'Automatically show this chapter\'s PDF in the side column when creating a session (preview only, not context)',
      deleteNonPdf: 'Delete non-PDF',
      deleteNonPdfHint: 'When on, md/txt artifacts also show a Delete button; when off, only PDFs can be deleted',
      settings: 'Settings',
      version: 'Version',
      githubRepo: 'GitHub repository',
      manualIdNote: 'A book id is its folder name / filename prefix. Do not rename it after adding the library: session titles and artifact folders key off it, so renaming breaks old sessions and artifacts (display names may change; keep the folder stable).',
      aiPromptTitle: 'AI-generated Markdown',
      libraryPathsTitle: 'Library paths and book ids',
      libraryPathHint: 'Shown as {root} here: absolute paths are local to this machine and never travel with the plugin.',
      readLocalPath: 'Read local path',
      hideLocalPath: 'Hide local path',
      tipsLeftClick: 'Left click: a book cover selects/deselects, double click opens the book; a chapter row expands/collapses.',
      tipsRightClick: 'Right click: books and chapters have no menu; artifacts (To PDF / Delete) and sessions (Archive) do.',
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
      apiKeyTitle: 'DeepSeek API key (translation)',
      apiKeyConfigured: 'configured',
      apiKeyMissing: 'not configured',
      apiKeySave: 'Save',
      envReady: 'ready: md can render to PDF',
      envMissing: 'missing: md-to-PDF buttons are hidden, everything else works',
      envDownload: 'Download TeX Live (~5 GB)',
      envHint: 'Needs TeX Live (xelatex, ctex) and Python 3; add TeX bin to PATH, then restart DSH.',
      updateChecking: 'Checking…',
      updateHint: 'Only contacts GitHub releases when you click; never polls',
      updateLatest: 'Up to date (v{version})',
      updateNew: 'Version {version} is available (you have {current}) — see GitHub Releases',
      updateNoRelease: 'The repository has no release yet',
      updateFailed: 'Update check failed (network or proxy) — try again later',
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
      cleanupHint: 'Archive unused blank sessions; empty records the workbench itself left behind are deleted.',
      cleanupNotice: 'Cleaned {n} unused blank session(s) (archived).',
      retryRename: 'Retry rename',
      targetMissing: 'The Workspace that owns the library could not be resolved, so a session cannot be created.',
      sessionTarget: 'Sessions are created in: {dir}',
      titleLegend: 'Book ids (shared by session titles and produced-file folders): {pairs}',
      running: 'Running',
      'mode.extract': 'Extract',
      'mode.qa': 'Q&A',
      'mode.exercise': 'Exercises',
      bookEmpty: 'This book has no displayable chapters.',
      wholeBook: 'Whole book',
      wholeBadge: 'Whole-book PDF',
      wholeHint: 'Readable as one document, no chapters',
      wholeExplain: 'No splitter? Drop whole PDFs into {dir}\\整本\\ and read them here — no chapters and no per-chapter sessions, one conversation per book.',
      manualWhole: 'Cannot or will not split? Drop whole PDFs into {root}\\整本\\ (the file name is the book id): the shelf shows "Whole-book PDF" and one click reads it. The trade-off is no chapters and no per-chapter sessions.',
      sampleTitle: 'Sample library',
      sampleLoading: 'Reading the sample…',
      sampleEmpty: 'This package ships no sample book',
      sampleMeta: '{chapters} chapters · {size} total',
      sampleHint: 'A small built-in booklet, already split by chapter; loading it makes the shelf usable immediately so you can try chapters, sessions and the reader.',
      sampleLoad: 'Load sample book',
      sampleBusy: 'Copying…',
      sampleLoaded: 'Sample book added to the active library ({n} files)',
      loading: 'Reading the catalog…',
      loadFailed: 'Could not read the catalog',
      timeout: 'Timed out while reading; try again.',
      saveFailed: 'The position was not saved.',
      emptyTitle: 'No recognizable book in the library',
      emptyHint: 'Put chapter-split PDFs under the library’s 分片 folder (names like 书名_c04_第四章_标题_p097-138.pdf), or write an 索引.json.',
      sourceScan: 'Catalog derived from the split file names (no 索引.json).',
      sourceIndex: 'Catalog read from 索引.json.',
      indexIgnored: '索引.json could not be used; the catalog is derived from file names.',
      libraryAt: 'Library: {dir}',
      skipped: 'Not recognized (not chapter-named): {dir} ({n} PDFs)',
      bookUnparsed: '{title}: {n} PDFs are not chapter-named',
      partialHint: '{files} PDFs are not chapter-named and were skipped; the full list is in the footer.',
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
      navLabel: 'Math workbench',
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
     * not answer within {@link REQUEST_TIMEOUT_MS} rejects with `timeout`.
     * @param {string} method - HTTP method.
     * @param {string} path - route suffix under `/mathdesk/`.
     * @param {unknown} [body] - JSON body for mutations.
     * @returns {Promise<any>} the response payload.
     */
    function request(method, path, body) {
      const controller = typeof AbortController === 'function' ? new AbortController() : null
      const timer = controller === null ? null : setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      const init = {
        method,
        credentials: 'same-origin',
        headers: body === undefined
          ? { accept: 'application/json' }
          : { accept: 'application/json', 'content-type': 'application/json' },
      }
      if (body !== undefined) init.body = JSON.stringify(body)
      if (controller !== null) init.signal = controller.signal
      return fetch(ENDPOINT + path, init)
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
    }

    /**
     * Turn a thrown value into display text.
     * @param {unknown} reason - thrown value.
     * @returns {string} localized text.
     */
    function errorText(reason) {
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
        const url = new URL('mathdesk/vendor/pdf.min.mjs', base).href
        const worker = new URL('mathdesk/vendor/pdf.worker.min.mjs', base).href
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
          cMapUrl: new URL('mathdesk/vendor/cmaps/', document.baseURI).href,
          wasmUrl: new URL('mathdesk/vendor/wasm/', document.baseURI).href,
        }
      }
      return pdfAssets
    }

    /** Rendered cover data URLs by book id; a null entry is "this book has none". */
    const coverCache = new Map()

    /** Recent workbench events for debugging (and `window.__mathdeskTrace`). */
    const traceRing = []

    /**
     * Whether the console copy of `trace` is wanted. Diagnostics stay in the ring
     * buffer; printing is opt-in so normal use keeps a clean console:
     * `localStorage.setItem('mathdesk:debug', '1')` then reload.
     * @returns {boolean} whether to print.
     */
    function traceEnabled() {
      if (typeof window === 'undefined') return false
      if (window.__mathdeskDebug === true) return true
      try {
        return window.localStorage.getItem('mathdesk:debug') === '1'
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
      if (traceEnabled()) console.log('[mathdesk]', line)
    }

    /** Covers are rendered one at a time: each one needs its whole PDF. */
    let coverQueue = Promise.resolve()

    /**
     * The address of a user-provided cover (`封面/<book id>.png` and friends).
     * @param {object} book - catalog book row.
     * @returns {string} the URL.
     */
    function coverUrlFor(book) {
      return new URL(`mathdesk/cover?book=${encodeURIComponent(book.id)}`, document.baseURI).href
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
      const url = new URL(`mathdesk/pdf?book=${encodeURIComponent(book.id)}&code=${encodeURIComponent(first.code)}`, document.baseURI).href
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
        const groups = byChapter.get(key) ?? { extract: [], qa: [], exercise: [] }
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
          if (!MODES.includes(entry.mode)) continue
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
        if (!MODES.includes(entry.mode)) continue
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
        for (const mode of MODES) groups[mode].sort((left, right) => right.updatedAt - left.updatedAt)
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
      return MODES.reduce((sum, mode) => sum + (Array.isArray(groups[mode]) ? groups[mode].length : 0), 0)
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
    async function beginPrefill(sessionId, text) {
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
          // Append rather than replace: a reused blank may already hold the user's
          // own draft, and losing that would be worse than an extra header line.
          whenDraftExists: 'append',
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

    /* ------------------------------------------------------------ elements -- */

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
      return h('button', {
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
      return h('button', {
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
    function SettingsDialog(props) {
      const envTools = props.envTools ?? { python: false, tex: false }
      const [apiKey, setApiKey] = useState('')
      const [apiKeyNote, setApiKeyNote] = useState('')
      useEffect(() => {
        request('GET', 'deepseek-key')
          .then(payload => setApiKeyNote(payload !== null && payload.configured === true ? format('apiKeyConfigured') : format('apiKeyMissing')))
          .catch(() => {})
      }, [])
      const saveApiKey = async () => {
        try {
          const payload = await request('POST', 'deepseek-key', { key: apiKey })
          setApiKeyNote(payload !== null && payload.configured === true ? format('apiKeyConfigured') : format('apiKeyMissing'))
          setApiKey('')
        } catch (error) {
          setApiKeyNote(error !== null && error !== undefined && error.message ? String(error.message) : String(error))
        }
      }
      const ready = envTools.python === true && envTools.tex === true
      const openLink = url => {
        try {
          window.open(url, '_blank', 'noopener')
        } catch {
          // popup blocked
        }
      }
      return h(React.Fragment, null,
        h('div', { className: 'md-picker-backdrop', 'aria-hidden': true, onClick: props.onClose }),
        h('div', { className: 'md-picker md-settings-page', role: 'dialog', 'aria-modal': 'true', 'aria-label': format('settings') },
          h('div', { className: 'md-picker-head' },
            h('span', { className: 'md-picker-title' }, format('settings')),
            h('span', { className: 'md-settings-version' }, `${format('version')} ${props.version}`),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
              'aria-label': format('previewClose'), onClick: props.onClose,
            }, '×')
          ),
          h('div', { className: 'md-settings-section' },
            h('h4', { className: 'md-settings-heading' }, format('envTitle')),
            h('p', { className: 'md-shelf-sub' }, `${format('envPython')}：${envTools.python ? format('envOn') : format('envOff')} · ${format('envTex')}：${envTools.tex ? format('envOn') : format('envOff')}`),
            h('div', { className: 'md-settings-row' },
              h('span', null, `${format('envPython')}：${envTools.python ? format('envOn') : format('envOff')}（${format('envPythonSize')}）`),
              envTools.python ? null : h('button', { type: 'button', className: 'md-btn md-btn-small', onClick: () => openLink('https://www.python.org/downloads/windows/') }, format('envDownload'))
            ),
            h('div', { className: 'md-settings-row' },
              h('span', null, `${format('envTex')}：${envTools.tex ? format('envOn') : format('envOff')}（${format('envTexSize')}）`),
              envTools.tex ? null : h('button', { type: 'button', className: 'md-btn md-btn-small', onClick: () => openLink(TEXLIVE_URL) }, format('envDownload'))
            )
          ),
          h('div', { className: 'md-settings-section' },
            h('h4', { className: 'md-settings-heading' }, format('apiKeyTitle')),
            h('p', { className: 'md-shelf-sub' }, apiKeyNote),
            h('div', { className: 'md-settings-row' },
              h('input', {
                className: 'md-settings-input', type: 'password',
                value: apiKey, placeholder: 'sk-...',
                onChange: event => setApiKey(event.target.value),
              }),
              h('button', { type: 'button', className: 'md-btn md-btn-small', onClick: () => { void saveApiKey() } }, format('apiKeySave'))
            )
          ),
          h('div', { className: 'md-settings-section' },
            h('h4', { className: 'md-settings-heading' }, format('githubRepo')),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small',
              onClick: () => openLink(GITHUB_URL),
            }, format('githubRepo')),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small', disabled: props.updateBusy === true,
              title: format('updateHint'),
              onClick: props.onCheckUpdate,
            }, props.updateBusy === true ? format('updateChecking') : format('updateCheck'))
          ),
          h('div', { className: 'md-settings-section' },
            h('h4', { className: 'md-settings-heading' }, format('settingsFeatures')),
            h('div', { className: 'md-settings-row' },
              h('span', null, format('previewPdf')),
              h('button', {
                type: 'button', className: 'md-btn md-btn-small',
                onClick: props.onPreview,
              }, props.previewPdf ? format('previewOn') : format('previewOff'))
            ),
            h('div', { className: 'md-settings-row' },
              h('span', null, format('deleteNonPdf')),
              h('button', {
                type: 'button', className: 'md-btn md-btn-small',
                onClick: props.onNonPdf,
              }, props.allowNonPdfDelete ? format('previewOn') : format('previewOff'))
            )
          )
        )
      )
    }

    /**
     * The library page: choose/add/switch libraries, read the format manual, and
     * start a split conversation with the toolkit already in the library.
     * @param {{ libraries: object[], activeId: string, busy: boolean, error: string, libraryDir: string, sample: object | null, sampleBusy: boolean, onUse: Function, onRemove: Function, onAdd: Function, onPick: Function, onSplit: Function, onLoadSample: Function }} props - libraries and handlers.
     * @returns {import('react').ReactElement} the page.
     */
    function LibrariesPage(props) {
      const envTools = props.envTools ?? { python: false, tex: false }
      const [dir, setDir] = useState('')
      const [name, setName] = useState('')
      const [confirmId, setConfirmId] = useState('')
      const [showLocalPath, setShowLocalPath] = useState(false)
      const clickTimer = useRef(null)
      const busy = props.busy
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
      return h('section', { className: 'md-libraries', 'aria-label': format('librariesTitle') },
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
                h('button', {
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
        h('div', { className: 'md-library-add' },
          h('h3', { className: 'md-subheading' }, format('libraryAddTitle')),
          h('p', { className: 'md-shelf-sub' }, format('libraryAddHint')),
          h('div', { className: 'md-library-form' },
            h('label', { className: 'md-field' },
              h('span', null, format('libraryPath')),
              h('input', {
                className: 'md-input', value: dir, disabled: busy,
                placeholder: 'D:\\数学书库',
                onChange: event => setDir(event.target.value),
              })
            ),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small', disabled: busy,
              onClick: () => {
                void props.onPick().then(picked => {
                  if (typeof picked === 'string' && picked !== '') setDir(picked)
                })
              },
            }, format('libraryPick')),
            h('label', { className: 'md-field' },
              h('span', null, format('libraryName')),
              h('input', {
                className: 'md-input', value: name, disabled: busy,
                placeholder: '数学',
                onChange: event => setName(event.target.value),
              })
            ),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small', disabled: busy || dir.trim() === '',
              onClick: () => props.onAdd(dir, name),
            }, format('libraryAdd'))
          )
        ),
        props.error === '' ? null : h('div', { className: 'md-alert', role: 'alert' },
          h('span', { className: 'md-alert-text' }, props.error)
        ),
        h('details', { className: 'md-details', style: { order: 4 } },
          h('summary', { className: 'md-details-summary' }, format('manualTitle')),
          h('p', { className: 'md-shelf-sub' }, format('manualWhy')),
          h('p', { className: 'md-shelf-sub' }, format('manualStructure', { root: props.libraryDir })),
          h('p', { className: 'md-shelf-sub' }, format('manualIdNote')),
          h('p', { className: 'md-shelf-sub' }, format('manualSplit')),
          h('p', { className: 'md-shelf-sub' }, format('manualWhole', { root: props.libraryDir })),
          h('p', { className: 'md-shelf-sub' }, format('manualSession')),
          h('p', { className: 'md-shelf-sub' }, `${format('envTitle')}：${props.canRender ? format('envReady') : format('envMissing')}`),
          h('div', { className: 'md-library-tools' },
            h('button', {
              type: 'button', className: 'md-btn md-btn-small',
              onClick: () => {
                try {
                  window.open('https://tug.org/texlive/acquire.html', '_blank', 'noopener')
                } catch {
                  // popup blocked
                }
              },
            }, format('envDownload')),
            h('span', { className: 'md-shelf-sub' }, format('envHint'))
          ),
          h('p', { className: 'md-shelf-sub' }, format('aiPromptHint')),
          h('code', { className: 'md-path' }, format('aiPromptText')),
          h('button', {
            type: 'button', className: 'md-btn md-btn-small',
            onClick: props.onCopyPrompt,
          }, format('aiPromptCopy')),
          h('div', { className: 'md-manual-path' },
            h('span', { className: 'md-manual-label' }, format('libraryPath')),
            h('code', { className: 'md-path' }, props.libraryDir)
          )
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
        h('div', { className: 'md-library-samples md-tool-card' },
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
                h('button', {
                  type: 'button', className: 'md-btn',
                  disabled: props.sampleBusy || props.busy,
                  onClick: props.onLoadSample,
                }, props.sampleBusy ? format('sampleBusy') : format('sampleLoad'))
              )
        ),
        h('div', { className: 'md-tool-card' },
          h('h3', { className: 'md-subheading' }, format('splitToolTitle')),
          h('p', { className: 'md-shelf-sub' }, format('splitHint')),
          h('button', {
            type: 'button', className: 'md-btn', disabled: busy,
            onClick: props.onSplit,
          }, busy ? format('libraryBusy') : format('splitStart'))
        ),
        h('div', { className: 'md-tool-card' },
          h('h3', { className: 'md-subheading' }, format('importToolTitle')),
          h('p', { className: 'md-shelf-sub' }, format('importFilesHint')),
          h('button', {
            type: 'button', className: 'md-btn', disabled: busy || props.importBusy,
            onClick: props.onImport,
          }, props.importBusy ? format('importBusy') : format('importStart'))
        ),
        h('div', { className: 'md-tool-card', id: 'md-env-card' },
          h('h3', { className: 'md-subheading' }, format('envTitle')),
          h('p', { className: 'md-shelf-sub' }, `${format('envPython')}：${envTools.python ? format('envOn') : format('envOff')} · ${format('envTex')}：${envTools.tex ? format('envOn') : format('envOff')}`),
          h('div', { className: 'md-library-tools' },
            envTools.python ? null : h('button', {
              type: 'button', className: 'md-btn md-btn-small',
              onClick: () => {
                try {
                  window.open('https://www.python.org/downloads/windows/', '_blank', 'noopener')
                } catch {
                  // popup blocked
                }
              },
            }, `${format('envPython')}（${format('envPythonSize')}）`),
            envTools.tex ? null : h('button', {
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
            h('button', {
              type: 'button', className: 'md-btn md-btn-small',
              onClick: props.onCreateShelf,
            }, format('shelfNew')),
            props.group === 'hidden'
              ? h('button', {
                type: 'button', className: 'md-btn md-btn-small',
                onClick: props.onUnhide,
              }, format('shelfUnhide'))
              : h('button', {
                type: 'button', className: 'md-btn md-btn-small',
                onClick: props.onHide,
              }, format('shelfHide')),
            props.group === 'hidden'
              ? h('button', {
                type: 'button', className: 'md-btn md-btn-small',
                onClick: props.onTrashSelected,
              }, format('shelfTrash'))
              : null,
            props.group !== null && props.group !== 'hidden'
              ? h('button', {
                type: 'button', className: 'md-btn md-btn-small',
                onClick: props.onRemoveFromShelf,
              }, format('shelfRemove'))
              : null,
            h('button', {
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
      return h(React.Fragment, null,
        h('div', { className: 'md-picker-backdrop', 'aria-hidden': true, onClick: props.onClose }),
        h('div', { className: 'md-picker', role: 'dialog', 'aria-modal': 'true', 'aria-label': format('shelfName') },
          h('div', { className: 'md-picker-head' },
            h('span', { className: 'md-picker-title' }, format('shelfName')),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
              'aria-label': format('previewClose'), onClick: props.onClose,
            }, '×')
          ),
          h('input', {
            className: 'md-input', value: props.name, autoFocus: true,
            placeholder: format('shelfName'),
            onChange: event => props.onChange(event.target.value),
            onKeyDown: event => {
              if (event.key === 'Enter') props.onConfirm()
            },
          }),
          props.error === '' ? null : h('div', { className: 'md-state-error', role: 'alert' }, props.error),
          h('div', { className: 'md-library-tools', style: { order: 3 } },
            h('button', { type: 'button', className: 'md-btn', onClick: props.onConfirm }, format('shelfCreate')),
            h('button', { type: 'button', className: 'md-btn md-btn-ghost', onClick: props.onClose }, format('previewClose'))
          )
        )
      )
    }

    /**
     * The three session groups, their per-group New and Import buttons, and the
     * inline rename/unlink actions on each row inside one chapter.
     * @param {{ chapter: object, groups: object | undefined, creatingMode: string, loaded: boolean, available: boolean, error: string, errorSession: string | null, renaming: object | null, onNewSession: Function, onOpenSession: Function, onRetryRename: Function, onImport: Function, onUnlink: Function, onStartRename: Function, onRenameInput: Function, onCommitRename: Function, onCancelRename: Function }} props - chapter and session state.
     * @returns {import('react').ReactElement} the block.
     */
    function ChapterSessions(props) {
      const busy = props.creatingMode !== ''
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
              h('input', {
                className: 'md-session-input',
                value: renaming.value,
                'aria-label': format('rename'),
                title: format('renameHint'),
                autoFocus: true,
                onChange: event => props.onRenameInput(event.target.value),
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
              h('button', {
                type: 'button', className: 'md-btn md-btn-small', disabled: renaming.saving,
                onClick: props.onCommitRename,
              }, format('renameSave')),
              h('button', {
                type: 'button', className: 'md-btn md-btn-small md-btn-ghost', disabled: renaming.saving,
                onClick: props.onCancelRename,
              }, format('renameCancel')),
              renaming.error === '' ? null : h('span', { className: 'md-session-edit-error', role: 'alert' }, renaming.error)
            )
            : h('button', {
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
              : h('button', {
                type: 'button', className: 'md-icon-btn', title: format('rename'),
                'aria-label': `${format('rename')}：${label}`,
                onClick: () => props.onStartRename(props.chapter, item),
              }, '✎'),
            item.pending
              ? null
              : h('button', {
                type: 'button', className: 'md-icon-btn md-icon-btn-text', title: `${format('archiveSession')}（不删除，可在 DSH 归档里恢复）`,
                'aria-label': `${format('archiveSession')}：${label}`,
                onClick: () => {
                  if (typeof window !== 'undefined' && typeof window.confirm === 'function'
                    && !window.confirm(format('archiveConfirm'))) return
                  props.onArchiveSession(item.id)
                },
              }, format('archiveSession')),
            item.viaLink
              ? h('button', {
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
          h('button', {
            type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
            onClick: props.onToggle,
          }, props.open === false ? format('artifactsExpand') : format('artifactsCollapse')),
          props.loaded && props.available
            ? h('button', {
              type: 'button', className: 'md-btn md-btn-small md-btn-ghost md-session-digest',
              title: format('digestHint'),
              'aria-label': format('digestOf'),
              onClick: () => props.onDigest(props.chapter),
            }, format('digest'))
            : null
        ),
        props.error === '' ? null : h('div', { className: 'md-alert md-alert-inline', role: 'alert' },
          h('span', { className: 'md-alert-text' }, props.error),
          props.errorSession === null ? null : h('button', {
            type: 'button', className: 'md-btn md-btn-small', disabled: busy,
            onClick: props.onRetryRename,
          }, format('retryRename'))
        ),
        MODES.map(mode => {
          const items = props.groups !== undefined && Array.isArray(props.groups[mode]) ? props.groups[mode] : []
          return h('div', { key: mode, className: 'md-session-group' },
            h('div', { className: 'md-session-group-head' },
              h('span', { className: 'md-session-mode' }, format(`mode.${mode}`)),
              h('button', {
                type: 'button',
                className: 'md-btn md-btn-small md-session-new',
                disabled: busy || !props.available,
                title: format('newSessionHint'),
                'aria-label': format('newSessionOf', { mode: format(`mode.${mode}`) }),
                onClick: () => props.onNewSession(props.chapter, mode),
              }, props.creatingMode === mode ? format('creating') : `＋ ${format('newSession')}`),
              h('button', {
                type: 'button',
                className: 'md-btn md-btn-small md-btn-ghost',
                disabled: busy || !props.available,
                title: format('forceNewHint'),
                'aria-label': format('forceNewOf', { mode: format(`mode.${mode}`) }),
                onClick: () => props.onNewSession(props.chapter, mode, { forceNew: true }),
              }, format('forceNew')),
              h('button', {
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
        })
      )
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
      return h(React.Fragment, null,
        h('div', { className: 'md-picker-backdrop', 'aria-hidden': true, onClick: props.onClose }),
        h('div', { className: 'md-picker', role: 'dialog', 'aria-modal': 'true', 'aria-label': format('importTitle') },
          h('div', { className: 'md-picker-head' },
            h('span', { className: 'md-picker-title' }, format('importTitle')),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
              'aria-label': format('previewClose'), title: format('previewClose'),
              onClick: props.onClose,
            }, '×')
          ),
          h('div', { className: 'md-picker-sub' },
            format('importChapter', { code: props.target.code, title: props.target.title })),
          h('input', {
            className: 'md-picker-search',
            type: 'search',
            placeholder: format('importSearch'),
            'aria-label': format('importSearch'),
            value: query,
            autoFocus: true,
            onChange: event => setQuery(event.target.value),
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
                h('button', {
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
        )
      )
    }

    /**
     * The chapter outline: one model call over the chapter's conversations.
     * @param {{ digest: object, onClose: Function, onCopy: Function }} props - the outline and handlers.
     * @returns {import('react').ReactElement} the dialog.
     */
    function DigestDialog(props) {
      const digest = props.digest
      return h(React.Fragment, null,
        h('div', { className: 'md-picker-backdrop', 'aria-hidden': true, onClick: props.onClose }),
        h('div', { className: 'md-picker md-digest', role: 'dialog', 'aria-modal': 'true', 'aria-label': format('digestTitle') },
          h('div', { className: 'md-picker-head' },
            h('span', { className: 'md-picker-title' }, format('digestTitle')),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
              'aria-label': format('previewClose'), title: format('previewClose'),
              onClick: props.onClose,
            }, '×')
          ),
          digest.phase === 'working'
            ? h('div', { className: 'md-picker-empty', role: 'status' }, format('digestWorking'))
            : digest.phase === 'error'
              ? h('div', { className: 'md-picker-empty md-state-error', role: 'alert' },
                digest.error === '' ? format('digestFailed') : digest.error)
              : h(React.Fragment, null,
                h('pre', { className: 'md-digest-text' }, digest.text),
                h('div', { className: 'md-digest-actions' },
                  h('button', {
                    type: 'button', className: 'md-btn md-btn-small',
                    onClick: () => props.onCopy(digest.text),
                  }, format('digestCopy')),
                  digest.path === '' ? null : h('code', { className: 'md-path' }, digest.path)
                )
              ),
          h('div', { className: 'md-picker-note' }, format('digestHint'))
        )
      )
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
          h('button', {
            type: 'button',
            className: 'md-file',
          onContextMenu: event => {
            if (/\.md$/i.test(item.name)) {
              event.preventDefault()
              props.onRender(item, props.code)
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
          /\.md$/i.test(item.name) && props.canRender === true
            ? h('span', {
              className: 'md-file-action', role: 'button', tabIndex: 0,
              title: format('renderActionHint'),
              onClick: event => {
                event.stopPropagation()
                props.onRender(item, props.code)
              },
              onKeyDown: event => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                props.onRender(item, props.code)
              },
            }, format('renderAction'))
            : null
          ),
          (item.kind === 'pdf' || props.allowNonPdfDelete === true)
            ? h('span', {
              className: 'md-file-action', role: 'button', tabIndex: 0,
              title: format('trashFileHint'),
              onClick: event => {
                event.stopPropagation()
                props.onTrashArtifact(item, props.code)
              },
            }, format('trashAction'))
            : null,
          h('div', { className: 'md-artifact-modes' },
            MODES.map(mode => h(React.Fragment, { key: mode },
              h('button', {
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
              h('button', {
                type: 'button',
                className: 'md-btn md-btn-small md-btn-ghost md-artifact-mode',
                title: format('forceNewHint'),
                onClick: event => {
                  event.stopPropagation()
                  props.onArtifactSession(props.chapter, item, mode, 0)
                },
              }, `+ ${format('forceNew')}`)
            ))
          ),
          groups === undefined
            ? null
            : h(React.Fragment, null,
              h('button', {
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
                    h('button', {
                      type: 'button', className: 'md-session',
                      onClick: () => props.onOpenSession(entry),
                    }, h('span', { className: 'md-session-name' }, entry.title === '' ? entry.displayTitle : entry.title))
                  ))))
                : null
            )
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
          h('button', {
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
          h('button', {
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
          h('button', {
            type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
            onClick: () => setCollapsed(value => !value),
          }, collapsed ? format('artifactsExpand') : format('artifactsCollapse')),
          phase === 'ready' && items.length > 0 && !truncated
            ? h('span', { className: 'md-session-count' }, format('filesCount', { n: items.length }))
            : null,
          phase === 'ready' && truncated
            ? h('span', { className: 'md-session-count' }, format('filesTruncated', { n: items.length }))
            : null,
          h('button', {
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
            h('button', { type: 'button', className: 'md-btn md-btn-small', onClick: props.onRetry }, format('previewRetry'))
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
          h('button', {
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
     * One page in continuous mode: renders when it comes near the viewport,
     * reports when it becomes the page a reader is looking at.
     * @param {{ doc: object, pageNumber: number, scale: number, rootRef: object, onVisible: Function, registerSlot: Function, onError: Function }} props - the document, page, zoom and callbacks.
     * @returns {import('react').ReactElement} the page slot.
     */
    function ReaderPage(props) {
      const [visible, setVisible] = useState(false)
      const [rendered, setRendered] = useState(false)
      const holder = useRef(null)
      const canvas = useRef(null)
      const task = useRef(null)

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
            const viewport = page.getViewport({ scale: props.scale })
            const node = canvas.current
            if (node === null) return
            let dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
            if (viewport.width * dpr > 8000 || viewport.height * dpr > 8000) dpr = 1
            node.width = Math.max(1, Math.floor(viewport.width * dpr))
            node.height = Math.max(1, Math.floor(viewport.height * dpr))
            node.style.width = `${Math.floor(viewport.width)}px`
            node.style.height = `${Math.floor(viewport.height)}px`
            if (task.current !== null) {
              try { task.current.cancel() } catch { /* already finished */ }
              task.current = null
            }
            const render = page.render({
              canvasContext: node.getContext('2d'),
              viewport,
              transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
            })
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
        },
      },
        h('span', { className: 'md-reader-page-no', 'aria-hidden': true }, String(props.pageNumber)),
        h('div', { className: 'md-reader-page-wrap' },
          h('canvas', { className: 'md-reader-canvas', ref: canvas }),
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
      const pages = []
      for (let page = 1; page <= props.count; page += 1) {
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
        }))
      }
      return h('div', { className: 'md-reader-continuous' }, pages)
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
     * The full-page PDF reader: one page or a continuous column, page
     * navigation, zoom, reading-mode switch, and the chapter's three New
     * buttons (which start a session and leave for it).
     * @param {{ reader: object, doc: object, busy: boolean, forceNew: boolean, canvasRef: Function, stageRef: Function, paneRef: Function, onBack: Function, onShelf: Function, onPrev: Function, onNext: Function, onPage: Function, onZoomIn: Function, onZoomOut: Function, onFit: Function, onRetry: Function, onMode: Function, onNewSession: Function, onForceNew: Function, onVisible: Function }} props - the open reader and its handlers.
     * @returns {import('react').ReactElement} the reader.
     */
    function ReaderView(props) {
      const reader = props.reader
      const [pageText, setPageText] = useState(String(reader.page))
      const [showBlocks, setShowBlocks] = useState(false)
      const [translateTarget, setTranslateTarget] = useState('zh')
      const [translating, setTranslating] = useState(false)
      const [translateNote, setTranslateNote] = useState('')
      const slotRefs = useRef(new Map())
      const switchingMode = useRef(false)
      const visibleTimer = useRef(null)
      const [dual, setDual] = useState(false)
      const [rightScale, setRightScale] = useState(null)
      const [hasTranslation, setHasTranslation] = useState(false)
      const [dualDoc, setDualDoc] = useState(null)
      const dualLeft = useRef(null)
      const dualRight = useRef(null)
      useEffect(() => setPageText(String(reader.page)), [reader.page])
      useEffect(() => {
        saveReaderPage(reader.bookId, reader.code, reader.page)
      }, [reader.bookId, reader.code, reader.page])
      useEffect(() => {
        if (dual && rightScale === null) setRightScale(reader.scale ?? 1)
      }, [dual, reader.scale, rightScale])
      useEffect(() => {
        if (!dual) return undefined
        let cancelled = false
        const load = async () => {
          try {
            const lib = await loadPdfjs()
            const params = new URLSearchParams({ book: reader.bookId, code: reader.code })
            if (reader.variant !== 'translated') params.set('variant', 'translated')
            const url = new URL(`mathdesk/pdf?${params.toString()}`, document.baseURI).href
            const task = lib.getDocument({ url, isEvalSupported: false, ...pdfAssetUrls() })
            const doc = await task.promise
            if (!cancelled) setDualDoc(doc)
          } catch {
            if (!cancelled) {
              setTranslateNote(format('translateFailed'))
              setDual(false)
            }
          }
        }
        void load()
        return () => {
          cancelled = true
        }
      }, [dual, reader.bookId, reader.code])

      // Keep the two columns scrolled to the same relative position.
      useEffect(() => {
        if (!dual || dualDoc === null) return undefined
        const left = dualLeft.current
        const right = dualRight.current
        if (left === null || right === null) return undefined
        let locked = false
        const sync = (from, to) => {
          if (locked) return
          locked = true
          const span = Math.max(1, from.scrollHeight - from.clientHeight)
          const ratio = from.scrollTop / span
          to.scrollTop = ratio * Math.max(0, to.scrollHeight - to.clientHeight)
          locked = false
        }
        const onLeft = () => sync(left, right)
        const onRight = () => sync(right, left)
        left.addEventListener('scroll', onLeft, { passive: true })
        right.addEventListener('scroll', onRight, { passive: true })
        return () => {
          left.removeEventListener('scroll', onLeft)
          right.removeEventListener('scroll', onRight)
        }
      }, [dual, dualDoc])

      useEffect(() => {
        let cancelled = false
        request('GET', `translated-info?book=${encodeURIComponent(reader.bookId)}&code=${encodeURIComponent(reader.code)}&name=${encodeURIComponent(`${reader.fileName}.pdf`)}`)
          .then(payload => {
            if (!cancelled && payload !== null) setHasTranslation(payload.exists === true)
          })
          .catch(() => {})
        return () => {
          cancelled = true
        }
      }, [reader.bookId, reader.code, reader.fileName])
      // A chapter translation runs on the Host; reopening the reader resumes
      // watching it instead of losing the progress.
      useEffect(() => {
        let cancelled = false
        const key = `mathdesk:job:${reader.bookId}:${reader.code}`
        let jobId = ''
        try {
          jobId = window.localStorage.getItem(key) ?? ''
        } catch {
          jobId = ''
        }
        if (jobId === '') return undefined
        const tick = async () => {
          try {
            const state = await request('GET', `translate-status?job=${encodeURIComponent(jobId)}`)
            if (cancelled) return
            if (state.status === 'done') {
              setHasTranslation(true)
              setTranslateNote(`${format('translateDone')}：${state.pdf}`)
              window.localStorage.removeItem(key)
              return
            }
            if (state.status === 'error') {
              setTranslateNote(`${format('translateFailed')}：${state.error}`)
              window.localStorage.removeItem(key)
              return
            }
            setTranslateNote(`${format('translating')} ${state.done}/${state.total}`)
            setTimeout(() => { void tick() }, 2000)
          } catch {
            // job file may be gone; stop watching
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

      // Explicit page changes (buttons, the page box, restore) scroll the
      // continuous column; pages reported by scrolling itself do not, so this
      // deliberately ignores `reader.page` unless a jump asked for it.
      useEffect(() => {
        if (reader.mode !== 'continuous' || reader.phase !== 'ready') return
        const node = slotRefs.current.get(reader.page)
        if (node !== undefined && node !== null) node.scrollIntoView({ block: 'start' })
      }, [reader.jump, reader.mode, reader.phase])

      // Switching back to a single page starts that page at the top of the stage.
      useEffect(() => {
        if (reader.mode !== 'single') return
        const stage = props.stageRef.current
        if (stage !== null) {
          stage.scrollTop = 0
          stage.scrollLeft = 0
        }
      }, [reader.mode, props.stageRef])
      // Entering continuous mode keeps the page you were reading instead of
      // starting at the top of the chapter. Only a real single->continuous
      // switch scrolls: a remount while already in continuous mode must not
      // yank the reader back to the page start.
      const previousMode = useRef(reader.mode)
      useEffect(() => {
        switchingMode.current = true
        const timer = setTimeout(() => { switchingMode.current = false }, 600)
        const from = previousMode.current
        previousMode.current = reader.mode
        if (reader.mode === 'continuous' && from !== 'continuous') {
          const node = slotRefs.current.get(reader.page)
          if (node !== undefined && node !== null && typeof node.scrollIntoView === 'function') {
            node.scrollIntoView({ block: 'start' })
          }
        }
        return () => {
          switchingMode.current = false
          clearTimeout(timer)
        }
      }, [reader.mode])
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
            if (best !== null && best !== reader.page) props.onPage(best)
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
      const runTranslate = async () => {
        if (translating || reader.phase !== 'ready') return
        setTranslating(true)
        setTranslateNote(format('translating'))
        try {
          const started = await request('POST', 'translate-chapter', {
            book: reader.bookId,
            code: reader.code,
            target: translateTarget,
          })
          if (started === null || typeof started.jobId !== 'string') throw new Error('翻译任务没有启动')
          const jobId = started.jobId
          try {
            window.localStorage.setItem(`mathdesk:job:${reader.bookId}:${reader.code}`, jobId)
          } catch {
            // storage unavailable
          }
          for (;;) {
            await new Promise(resolve => setTimeout(resolve, 2000))
            const state = await request('GET', `translate-status?job=${encodeURIComponent(jobId)}`)
            if (state.status === 'done' || state.status === 'error') {
              try {
                window.localStorage.removeItem(`mathdesk:job:${reader.bookId}:${reader.code}`)
              } catch {
                // storage unavailable
              }
            }
            if (state.status === 'done') {
              setTranslateNote(`${format('translateDone')}：${state.pdf}`)
              break
            }
            if (state.status === 'error') throw new Error(state.error === '' ? '翻译失败' : state.error)
            setTranslateNote(`${format('translating')} ${state.done}/${state.total}`)
          }
        } catch (error) {
          const message = error !== null && error !== undefined && error.message ? String(error.message) : String(error)
          setTranslateNote(`${format('translateFailed')}：${message}`)
        } finally {
          setTranslating(false)
        }
      }
      const label = reader.name === '' ? `${reader.fileName}.pdf` : reader.name
      const ready = reader.phase === 'ready'
      const sub = [reader.bookTitle, `${reader.code} ${reader.title}`].filter(item => typeof item === 'string' && item !== '').join(' · ')
      const modeOf = mode => reader.mode === mode
      return h('section', {
        className: 'md-reader',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': `${format('openPdf')}：${label}`,
        'data-phase': reader.phase,
        'data-mode': reader.mode,
        tabIndex: -1,
        ref: props.paneRef,
      },
        h('div', { className: 'md-reader-bar' },
          h('button', {
            type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
            title: format('readerShelfHint'), 'aria-label': format('readerShelf'),
            onClick: props.onShelf,
          }, `⌂ ${format('readerShelf')}`),
          h('button', { type: 'button', className: 'md-btn md-btn-small md-btn-ghost', onClick: props.onBack }, `‹ ${format('readerBack')}`),
          h('div', { className: 'md-reader-titles' },
            h('span', { className: 'md-reader-name', title: label }, label),
            sub === '' ? null : h('span', { className: 'md-reader-sub' }, sub)
          ),
          h('div', { className: 'md-reader-tools' },
            h('button', {
              type: 'button', className: 'md-btn md-btn-small',
              disabled: reader.page <= 1, title: format('readerFirstHint'), 'aria-label': format('readerFirst'),
              onClick: () => props.onPage(1),
            }, '⇤'),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small',
              disabled: reader.page <= 1, title: format('readerPrev'), 'aria-label': format('readerPrev'),
              onClick: props.onPrev,
            }, '‹'),
            h('input', {
              className: 'md-reader-page',
              type: 'number', min: 1, max: reader.count > 0 ? reader.count : undefined,
              value: pageText,
              'aria-label': format('readerPage'),
              onChange: event => setPageText(event.target.value),
              onKeyDown: event => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                commitPage()
              },
              onBlur: commitPage,
            }),
            h('span', { className: 'md-reader-of' }, format('readerOf', { n: reader.count > 0 ? reader.count : '?' })),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small',
              disabled: reader.count === 0 || reader.page >= reader.count,
              title: format('readerNext'), 'aria-label': format('readerNext'),
              onClick: props.onNext,
            }, '›'),
            h('span', { className: 'md-reader-sep', 'aria-hidden': true }),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small', disabled: !ready,
              title: format('readerZoomOut'), 'aria-label': format('readerZoomOut'),
              onClick: props.onZoomOut,
            }, '−'),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small', disabled: !ready,
              title: format('readerFit'),
              onClick: props.onFit,
            }, format('readerFit')),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small', disabled: !ready,
              title: format('readerZoomIn'), 'aria-label': format('readerZoomIn'),
              onClick: props.onZoomIn,
            }, '＋'),
            h('span', { className: 'md-reader-scale', 'aria-hidden': true }, `${Math.round((reader.scale ?? 1) * 100)}%`)
          ),
          h('button', {
            type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
            'aria-label': format('previewClose'), title: format('previewClose'),
            onClick: props.onBack,
          }, '×')
        ),
        h('div', { className: 'md-reader-subbar' },
          h('span', { className: 'md-reader-modes', role: 'group', 'aria-label': format('readerMode') },
            h('button', {
              type: 'button', className: 'md-btn md-btn-small', 'aria-pressed': modeOf('single') ? 'true' : 'false',
              onClick: () => props.onMode('single'),
            }, format('readerModeSingle')),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small', 'aria-pressed': modeOf('continuous') ? 'true' : 'false',
              onClick: () => props.onMode('continuous'),
            }, format('readerModeContinuous')),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small', 'aria-pressed': showBlocks ? 'true' : 'false',
              title: format('blocksHint'),
              onClick: () => setShowBlocks(value => !value),
            }, format('blocksToggle')),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small', 'aria-pressed': dual ? 'true' : 'false',
              title: format('dualHint'),
              onClick: () => {
                if (!hasTranslation) {
                  if (typeof window !== 'undefined' && typeof window.confirm === 'function'
                    && window.confirm(format('dualNeedsTranslation'))) {
                    void runTranslate()
                  }
                  return
                }
                setDual(value => !value)
              },
            }, format('dualToggle')),
            h('span', { className: 'md-reader-sep', 'aria-hidden': true }),
            h('span', { className: 'md-reader-lang-label' }, format('translateFor')),
            h('select', {
              className: 'md-reader-lang',
              value: translateTarget,
              title: format('translateHint'),
              onChange: event => setTranslateTarget(event.target.value),
            },
              h('option', { value: 'zh' }, format('langZh')),
              h('option', { value: 'en' }, format('langEn'))
            ),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small',
              disabled: translating || reader.phase !== 'ready',
              title: format('translateHint'),
              onClick: () => { void runTranslate() },
            }, translating ? format('translating') : format('translateChapterAction'))
          ),
          false
            ? null
            : h(React.Fragment, null,
              h('span', { className: 'md-reader-sep', 'aria-hidden': true }),
              h('button', {
                type: 'button', className: 'md-btn md-btn-small',
                'aria-pressed': props.forceNew ? 'true' : 'false',
                title: format('forceNewHint'),
                onClick: () => props.onForceNew(!props.forceNew),
              }, format('forceNew')),
              h('span', { className: 'md-reader-newlabel' }, format('readerNewLabel')),
              MODES.map(mode => h('button', {
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
        translateNote === '' ? null : h('div', { className: 'md-reader-note', role: 'status' }, translateNote),
        h('div', { className: 'md-reader-stage', ref: props.stageRef, 'data-mode': reader.mode },
          dual && dualDoc !== null
            ? h('div', { className: 'md-reader-dual' },
              h('div', { className: 'md-reader-column', ref: dualLeft },
                h('div', { className: 'md-reader-colhead' },
                  h('span', { className: 'md-reader-coltitle' }, format('dualOriginal')),
                  h('button', { type: 'button', className: 'md-btn md-btn-small', onClick: props.onZoomOut }, '−'),
                  h('span', { className: 'md-reader-scale' }, String(Math.round((reader.scale ?? 1) * 100)) + '%'),
                  h('button', { type: 'button', className: 'md-btn md-btn-small', onClick: props.onZoomIn }, '+'),
                  h('button', { type: 'button', className: 'md-btn md-btn-small', onClick: props.onFit }, format('readerFit'))
                ),
                h(ContinuousView, {
                  doc: reader.variant === 'translated' ? dualDoc : props.doc,
                  showBlocks,
                  bookId: reader.bookId,
                  code: reader.code,
                  count: reader.variant === 'translated' ? (dualDoc.numPages || 0) : reader.count,
                  scale: reader.scale ?? 1,
                  rootRef: dualLeft,
                  onVisible: page => {
                    if (switchingMode.current) return
                    if (visibleTimer.current !== null) clearTimeout(visibleTimer.current)
                    visibleTimer.current = setTimeout(() => { props.onVisible(page) }, 350)
                  },
                  registerSlot,
                  onError: props.onError,
                })
              ),
              h('div', { className: 'md-reader-column', ref: dualRight },
                h('div', { className: 'md-reader-colhead' },
                  h('span', { className: 'md-reader-coltitle' }, format('dualTranslated')),
                  h('button', {
                    type: 'button', className: 'md-btn md-btn-small',
                    onClick: () => setRightScale(value => Math.max(0.5, (value ?? reader.scale ?? 1) - 0.1)),
                  }, '−'),
                  h('span', { className: 'md-reader-scale' }, String(Math.round((rightScale ?? reader.scale ?? 1) * 100)) + '%'),
                  h('button', {
                    type: 'button', className: 'md-btn md-btn-small',
                    onClick: () => setRightScale(value => Math.min(3, (value ?? reader.scale ?? 1) + 0.1)),
                  }, '+')
                ),
                h(ContinuousView, {
                  doc: reader.variant === 'translated' ? props.doc : dualDoc,
                  showBlocks: false,
                  bookId: reader.bookId,
                  code: reader.code,
                  count: reader.variant === 'translated' ? reader.count : (dualDoc.numPages || 0),
                  scale: rightScale ?? reader.scale ?? 1,
                  rootRef: dualRight,
                  onVisible: () => {},
                  registerSlot: () => {},
                  onError: props.onError,
                })
              )
            )
            : reader.phase === 'loading'
            ? h('div', { className: 'md-reader-state', role: 'status' }, format('readerLoading'))
            : reader.phase === 'error'
              ? h('div', { className: 'md-reader-state md-state-error', role: 'alert' },
                h('div', null, reader.error === '' ? format('readerFailed') : reader.error),
                h('div', { className: 'md-state-actions' },
                  h('button', { type: 'button', className: 'md-btn md-btn-small', onClick: props.onRetry }, format('readerRetry'))
                )
              )
              : reader.mode === 'continuous'
                ? h(ContinuousView, {
                  doc: props.doc,
                  showBlocks,
                  bookId: reader.bookId,
                  code: reader.code,
                  count: reader.count,
                  scale: reader.scale ?? 1,
                  rootRef: props.stageRef,
                  onVisible: page => {
                    if (switchingMode.current) return
                    if (visibleTimer.current !== null) clearTimeout(visibleTimer.current)
                    visibleTimer.current = setTimeout(() => { props.onVisible(page) }, 350)
                  },
                  registerSlot,
                  onError: props.onError,
                })
                : h('div', { className: 'md-reader-single' },
                  h('div', { className: 'md-reader-single-page' },
                    h('canvas', { className: 'md-reader-canvas', ref: props.canvasRef }),
                    h(BlockOverlay, { bookId: reader.bookId, code: reader.code, pageNumber: reader.page, show: showBlocks })
                  ))
        )
      )
    }

    /**
     * One chapter row plus its expanded detail.
     * @param {{ bookId: string, bookTitle: string, chapter: object, open: boolean, groups: object | undefined, artifacts: object | undefined, counts: object | undefined, creatingMode: string, createError: string, errorSession: string | null, loaded: boolean, available: boolean, onClick: Function, onOpenPdf: Function, onNewSession: Function, onOpenSession: Function, onRetryRename: Function, onOpenArtifact: Function, onRetryArtifacts: Function, onReloadArtifacts: Function, onCopyPath: Function, registerRef: Function, registerFileRef: Function }} props - chapter state and handlers.
     * @returns {import('react').ReactElement} the row.
     */
    function ChapterRow(props) {
      const chapter = props.chapter
      const [sessionsOpen, setSessionsOpen] = useState(false)
      const [translatedPdf, setTranslatedPdf] = useState('')
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
        h('button', {
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
          h('span', { className: 'md-chevron', 'aria-hidden': true })
        ),
        open ? h('div', { className: 'md-detail', id: detailId },
          chapter.file === '' ? null : h('div', { className: 'md-detail-line' },
            h('span', { className: 'md-detail-key' }, format('pdfLabel')),
            h('span', { className: 'md-detail-value' }, `${chapter.file}.pdf`),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small md-detail-open',
              onClick: () => props.onOpenPdf(chapter),
            }, format('openPdf'))
          ),
          translatedPdf === '' ? null : h('div', { className: 'md-detail-line' },
            h('span', { className: 'md-detail-key' }, format('translatedLabel')),
            h('span', { className: 'md-detail-value' }, translatedPdf),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small md-detail-open',
              onClick: () => props.onOpenPdf(chapter, 'translated'),
            }, format('openPdf')),
            h('button', {
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
          h('div', {
            className: 'md-sessions-wrap',
            'data-collapsed': sessionsOpen ? 'false' : 'true',
          }, h(ChapterSessions, {
            open: sessionsOpen,
            onToggle: () => setSessionsOpen(value => !value),
            chapter,
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
            onArtifactSession: props.onArtifactSession,
            allowNonPdfDelete: props.allowNonPdfDelete,
            onOpenSession: props.onOpenSession,
            state: props.artifacts,
            onOpen: item => props.onOpenArtifact(chapter, item),
            onRetry: props.onRetryArtifacts,
            onReload: props.onReloadArtifacts,
            onRender: (item, code) => props.onRenderArtifact(item, code),
            onTrashArtifact: (item, code) => props.onTrashArtifact(item, code),
            onCopyPath: props.onCopyPath,
            registerRef: props.registerFileRef,
          })
        ) : null
      )
    }

    /**
     * One book's chapter list.
     * @param {{ book: object, expanded: string[], sessionIndex: object, artifacts: object, counts: object, creatingKey: string, creatingMode: string, createError: object | null, onClickRow: Function, onOpenPdf: Function, onNewSession: Function, onOpenSession: Function, onRetryRename: Function, onOpenArtifact: Function, onRetryArtifacts: Function, onReloadArtifacts: Function, onCopyPath: Function, registerChapterRef: Function, registerFileRef: Function }} props - book, expanded codes, session and artifact state, handlers.
     * @returns {import('react').ReactElement} the book sheet.
     */
    function BookSheet(props) {
      const book = props.book
      const chapters = Array.isArray(book.chapters) ? book.chapters : []
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
            chapters.map(chapter => {
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
                allowNonPdfDelete: props.allowNonPdfDelete,
                artifacts: props.artifacts[key],
                counts: props.counts,
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
            })
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
.md-root { position: relative; flex: 1 1 auto; height: 100%; min-height: 0; display: flex; box-sizing: border-box; container-type: inline-size; container-name: mathdesk; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); font-size: 14px; line-height: 1.5; }
.md-inner { height: 100%; width: 100%; max-width: 1040px; margin: 0 auto; padding: 0 clamp(18px, 4cqw, 40px); box-sizing: border-box; display: flex; flex-direction: column; min-width: 0; }
.md-head { flex: none; display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 28px 0 14px; }
.md-title { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: .01em; }
.md-subtitle { margin: 4px 0 0; font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.md-head-actions { display: flex; align-items: center; gap: 8px; }
.md-settings { position: relative; }
.md-settings-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 190px; padding: 6px; display: flex; flex-direction: column; gap: 4px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, .12); }
.md-settings-version { padding: 4px 8px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.md-settings-item { padding: 6px 8px; text-align: left; font: inherit; font-size: 12.5px; color: var(--dsw-alias-label-primary); background: none; border: 0; border-radius: 6px; cursor: pointer; }
.md-settings-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.md-settings-section { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l2); }
.md-settings-heading { margin: 0; font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.md-settings-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12.5px; }
.md-settings-input { flex: 1 1 auto; min-width: 0; font: inherit; font-size: 12px; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.md-btn { font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-card-fill); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 6px 12px; cursor: pointer; transition: background .12s ease, border-color .12s ease; }
.md-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); border-color: var(--dsw-alias-border-l3); }
.md-btn:disabled { opacity: .55; cursor: default; }
.md-btn-small { font-size: 12px; padding: 4px 10px; }
.md-btn-ghost { background: transparent; border-color: transparent; }
.md-btn-ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); border-color: transparent; }
.md-crumbs { flex: none; display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--dsw-alias-label-secondary); padding-bottom: 14px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.md-crumb { font: inherit; font-size: 13px; color: var(--dsw-alias-label-secondary); background: none; border: 0; padding: 2px 4px; border-radius: 6px; cursor: pointer; }
.md-crumb:hover:not(:disabled) { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
.md-crumb-sep { opacity: .5; }
.md-crumb-current { color: var(--dsw-alias-label-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46ch; }
.md-notice { flex: none; margin-top: 12px; padding: 8px 12px; border-radius: 8px; background: var(--dsw-alias-interactive-bg-hover-solid); border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); font-size: 13px; }
.md-alert { flex: none; display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 8px 12px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, var(--dsw-alias-bg-base)); border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 34%, transparent); color: var(--dsw-alias-label-primary); font-size: 13px; }
.md-alert-text { flex: 1; min-width: 0; }
.md-hint { flex: none; margin-top: 12px; padding: 8px 12px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, var(--dsw-alias-bg-base)); border-left: 3px solid var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-label-secondary); font-size: 12.5px; }
.md-body { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 0 40px; scrollbar-width: thin; scrollbar-color: transparent transparent; }
.md-body:hover { scrollbar-color: var(--dsw-alias-border-l4) transparent; }
.md-body::-webkit-scrollbar { width: 8px; }
.md-body::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
.md-body:hover::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l3); }
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
.md-preview-note { flex: none; font-size: 11px; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; padding: 1px 8px; background: var(--dsw-alias-interactive-bg-hover-solid); }
.md-code-block { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; background: var(--dsw-alias-interactive-bg-hover-solid); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; overflow-x: auto; }
.md-code-gutter { position: sticky; left: 0; flex: none; margin: 0; padding-right: 2px; background: var(--dsw-alias-interactive-bg-hover-solid); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary); text-align: right; font-variant-numeric: tabular-nums; user-select: none; }
.md-code-text { flex: 1 1 auto; min-width: 0; margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-primary); white-space: pre; }
.md-artifacts { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; padding-top: 10px; border-top: 1px dashed var(--dsw-alias-border-l2); }
.md-artifacts-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-start; }
.md-artifacts-head .md-btn { margin-left: 0; }
.md-artifacts-head .md-btn:last-child { margin-left: auto; }
.md-artifacts-title { font-size: 12.5px; color: var(--dsw-alias-label-primary); }
.md-artifacts-empty { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.md-artifacts-empty .md-btn { align-self: flex-start; }
.md-path { align-self: flex-start; max-width: 100%; box-sizing: border-box; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--dsw-alias-label-primary); word-break: break-all; background: var(--dsw-alias-interactive-bg-hover-solid); border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; padding: 3px 6px; }
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
.md-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 16px; }
.md-card { display: flex; flex-direction: column; gap: 10px; padding: 10px 10px 12px; text-align: left; font: inherit; color: inherit; background: transparent; border: 1px solid transparent; border-radius: 12px; cursor: pointer; transition: border-color .14s ease, background .14s ease, transform .14s ease; position: relative; }
.md-card-selected { border-color: var(--dsw-alias-brand-primary); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); }
.md-card-check { position: absolute; top: 14px; right: 14px; width: 22px; height: 22px; border-radius: 50%; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-inverse, #fff); display: flex; align-items: center; justify-content: center; font-size: 13px; line-height: 1; }
.md-shelf { position: relative; display: flex; flex-direction: column; gap: 16px; }
.md-shelf-head { display: flex; align-items: baseline; gap: 10px; }
.md-collection-row { display: flex; flex-wrap: wrap; gap: 16px; }
.md-collection { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 10px 10px 12px; text-align: left; font: inherit; color: inherit; background: transparent; border: 1px solid transparent; border-radius: 12px; cursor: pointer; }
.md-collection:hover { background: var(--dsw-alias-interactive-bg-hover); border-color: transparent; transform: translateY(-2px); }
.md-collection-stack { position: relative; display: block; aspect-ratio: 3 / 4; }
.md-collection-sheet { position: absolute; inset: 0; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-card-fill); }
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
.md-library-toolscroll { position: absolute; inset: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 14px; background: var(--dsw-alias-card-fill); scrollbar-width: thin; scrollbar-color: transparent transparent; }
.md-library-toolscroll::-webkit-scrollbar { width: 6px; }
.md-library-toolscroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px; }
.md-library-toolscroll.md-scrolling { scrollbar-color: var(--dsw-alias-border-l4) transparent; }
.md-library-toolscroll.md-scrolling::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l4); }
.md-tool-card { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 14px; background: var(--dsw-alias-card-fill); }
.md-libraries > .md-library-samples { grid-column: 2; }
.md-library-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.md-library { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 14px; background: var(--dsw-alias-card-fill); cursor: pointer; transition: background .15s ease, border-color .15s ease, box-shadow .15s ease; }
.md-library:hover { background: var(--dsw-alias-interactive-bg-hover); }
.md-library-active { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, var(--dsw-alias-border-l3)); box-shadow: inset 3px 0 0 var(--dsw-alias-brand-primary); }
.md-library-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.md-library-name { font-size: 16px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.md-libraries .md-path { font-size: 12.5px; }
.md-libraries .md-shelf-sub { font-size: 13.5px; line-height: 1.65; }
.md-badge { font-size: 11px; line-height: 1.6; padding: 0 7px; border-radius: 999px; color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 13%, transparent); border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 30%, transparent); }
.md-badge-quiet { color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-interactive-bg-hover-solid); border-color: var(--dsw-alias-border-l3); }
.md-library-actions { display: flex; gap: 8px; justify-content: flex-end; }
.md-library-actions .md-icon-btn { font-size: 18px; line-height: 1.2; padding: 0 8px; }
.md-subheading { margin: 0; font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.md-library-form { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.md-field { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); flex: 1 1 200px; min-width: 0; }
.md-input { font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 7px; padding: 6px 8px; }
.md-input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.md-library-manual { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1px dashed var(--dsw-alias-border-l3); border-radius: 10px; }
.md-details { padding: 12px 16px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 14px; background: var(--dsw-alias-card-fill); }
.md-details-summary { cursor: pointer; font-size: 13px; font-weight: 550; color: var(--dsw-alias-label-primary); }
.md-details[open] .md-details-summary { margin-bottom: 6px; }
.md-library-samples { display: flex; flex-direction: column; gap: 8px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 14px; background: var(--dsw-alias-card-fill); }
.md-manual-path { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.md-manual-label { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.md-library-tools { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.md-library-add { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 14px; background: var(--dsw-alias-card-fill); }
.md-book-head { display: flex; flex-direction: column; gap: 6px; padding: 4px 4px 16px; }
.md-book-title { margin: 0; font-size: 18px; font-weight: 600; }
.md-book-title:focus-visible { outline-offset: 4px; }
.md-book-meta { display: flex; gap: 10px; font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.md-chapters { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--dsw-alias-border-l2); }
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
.md-chevron { position: relative; width: 18px; height: 18px; }
.md-chevron::before { content: ""; position: absolute; top: 50%; left: 40%; width: 6px; height: 6px; border-right: 1.5px solid var(--dsw-alias-label-secondary); border-bottom: 1.5px solid var(--dsw-alias-label-secondary); transform: translate(0, -50%) rotate(-45deg); transition: transform .16s ease; }
.md-chapter[data-open="true"] .md-chevron::before { transform: translate(0, -50%) rotate(45deg); }
.md-detail { display: flex; flex-direction: column; gap: 8px; padding: 2px 8px 16px 70px; font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.md-tips { margin-top: 22px; }
.md-tips-line { font-size: 13px; line-height: 1.7; color: var(--dsw-alias-label-secondary); }
.md-detail-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
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
.md-icon-btn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover-solid); }
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
.md-digest-text { flex: 1 1 auto; min-height: 0; overflow: auto; margin: 0; padding: 12px; background: var(--dsw-alias-interactive-bg-hover-solid); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.55; color: var(--dsw-alias-label-primary); }
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
.md-reader-page { width: 64px; font: inherit; font-size: 12.5px; text-align: center; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 6px; padding: 3px 6px; }
.md-reader-of { font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.md-reader-scale { min-width: 40px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); text-align: right; font-variant-numeric: tabular-nums; }
.md-reader-sep { width: 1px; height: 18px; background: var(--dsw-alias-border-l2); }
.md-reader-stage { flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; align-items: flex-start; justify-content: center; padding: 20px 24px 32px; }
.md-reader-stage[data-mode="continuous"] { flex-direction: column; align-items: center; justify-content: flex-start; }
.md-reader-single { display: flex; justify-content: center; margin: 0 auto; }
.md-reader-note { padding: 6px 10px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.md-reader-lang-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.md-reader-lang { font: inherit; font-size: 12px; padding: 2px 4px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.md-reader-single-page { position: relative; display: inline-block; max-width: 100%; }
.md-reader-dual { display: flex; gap: 12px; width: 100%; height: 100%; }
.md-reader-column { flex: 1 1 0; min-width: 0; overflow: auto; }
.md-reader-colhead { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: var(--dsw-alias-bg-base); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.md-reader-coltitle { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-right: auto; }
.md-reader-page-wrap { position: relative; display: inline-block; max-width: 100%; }
.md-blocklayer { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
.md-blockbox { position: absolute; box-sizing: border-box; border: 1px dashed rgba(235, 70, 70, .85); background: transparent; }
.md-blockbox[data-kind="heading"] { border-color: rgba(60, 130, 235, .95); background: transparent; }
.md-blockbox[data-kind="formula"] { border-color: rgba(40, 160, 90, .95); background: transparent; }
.md-reader-continuous { display: flex; flex-direction: column; align-items: center; gap: 18px; width: 100%; }
.md-reader-slot { display: flex; flex-direction: column; align-items: center; min-height: 240px; position: relative; }
.md-reader-page-no { padding-bottom: 4px; font-size: 11px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.md-reader-subbar { flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 16px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.md-reader-modes { display: flex; align-items: center; gap: 4px; }
.md-reader-modes .md-btn[aria-pressed="true"] { border-color: var(--dsw-alias-border-l4); background: var(--dsw-alias-interactive-bg-hover-solid); color: var(--dsw-alias-label-primary); }
.md-reader-newlabel { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.md-reader-canvas { flex: none; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l2); }
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
.md-root :focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
html[data-platform='darwin'] .md-head { padding-top: calc(var(--dsh-frame-top-clearance, 48px) + 4px); }
@container mathdesk (max-width: 620px) {
  .md-head { flex-direction: column; align-items: flex-start; gap: 10px; }
  .md-head-actions { align-self: flex-end; }
  .md-row { grid-template-columns: 44px minmax(0, 1fr) auto 18px; }
  .md-pages, .md-kind { display: none; }
  .md-detail { padding-left: 52px; }
  .md-session-list { padding-left: 0; }
  .md-crumb-current { max-width: 24ch; }
}
@container mathdesk (max-width: 760px) {
  .md-preview { position: absolute; top: 0; right: 0; bottom: 0; z-index: 5; width: min(94%, 460px); margin: 0; padding: 14px 16px 20px 18px; background: var(--dsw-alias-bg-base); border-left: 1px solid var(--dsw-alias-border-l3); }
  .md-preview-backdrop { display: block; position: absolute; inset: 0; z-index: 4; background: color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent); }
  .md-preview-body { border-radius: 8px; }
}
@container mathdesk (max-width: 620px) {
  .md-file-meta { display: none; }
}
@container mathdesk (max-width: 520px) {
  .md-session-time { display: none; }
}
`

    /* ----------------------------------------------------------------- page -- */

    /**
     * The workbench page.
     * @returns {import('react').ReactElement} the page.
     */
    function WorkbenchPage() {
      useT()
      const [catalog, setCatalog] = useState(null)
      const [work, setWork] = useState(null)
      const [phase, setPhase] = useState('loading')
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [reloadKey, setReloadKey] = useState(0)
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
      const readerTask = useRef(null)
      const readerRender = useRef(null)
      const readerCanvas = useRef(null)
      const readerStage = useRef(null)
      const readerPane = useRef(null)
      const pendingReaderFocus = useRef('')
      const [links, setLinks] = useState({})
      const linksRef = useRef({})
      const [renaming, setRenaming] = useState(null)
      const [picker, setPicker] = useState(null)
      const [digest, setDigest] = useState(null)
      const [libs, setLibs] = useState({ items: [], activeId: '' })
      const [library, setLibrary] = useState(null)
      const [libBusy, setLibBusy] = useState(false)
      const [libError, setLibError] = useState('')
      const [updateBusy, setUpdateBusy] = useState(false)
      const [previewPdf, setPreviewPdf] = useState(() => {
        try {
          return window.localStorage.getItem('mathdesk:preview-pdf') !== '0'
        } catch {
          return true
        }
      })
      const [allowNonPdfDelete, setAllowNonPdfDelete] = useState(() => {
        try {
          return window.localStorage.getItem('mathdesk:delete-non-pdf') === '1'
        } catch {
          return false
        }
      })
      const [settingsOpen, setSettingsOpen] = useState(false)
      const [envTools, setEnvTools] = useState({ python: false, tex: false })
      useEffect(() => {
        if (!settingsOpen) return undefined
        const onDown = event => {
          if (event.target instanceof Element && event.target.closest('.md-settings, .md-settings-page, .md-picker') !== null) return
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
       * @param {{ bookId: string, code: string, title: string, fileName: string, name?: string, bookTitle?: string }} target - what to open.
       * @param {boolean} [force] - reload even when it is already open.
       * @returns {void}
       */
      const openReader = useCallback((target, force) => {
        pendingReaderFocus.current = target.code
        setPreview(null)
        setPicker(null)
        setRenaming(null)
        const name = target.name ?? ''
        setReader(previous => {
          const same = previous !== null && previous.bookId === target.bookId
            && previous.code === target.code && previous.name === name
            && previous.variant === (target.variant ?? '')
          if (same && force !== true && previous.phase !== 'error') {
            return { ...previous, title: target.title, bookTitle: target.bookTitle ?? previous.bookTitle }
          }
          return {
            bookId: target.bookId,
            code: target.code,
            title: target.title,
            bookTitle: target.bookTitle ?? '',
            fileName: target.fileName ?? '',
            name,
            variant: target.variant ?? '',
            page: readReaderPage(target.bookId, target.code),
            count: 0,
            scale: null,
            mode: target.mode === 'continuous' ? 'continuous' : 'single',
            jump: 0,
            phase: 'loading',
            error: '',
            attempt: same ? previous.attempt + 1 : 0,
          }
        })
      }, [])

      // Loading one document: the pdf.js build first, then its bytes from the Host.
      useEffect(() => {
        if (reader === null) return undefined
        let cancelled = false
        const load = async () => {
          try {
            const lib = await loadPdfjs()
            if (cancelled) return
            const params = new URLSearchParams({ book: reader.bookId, code: reader.code })
            if (reader.name !== '') params.set('name', reader.name)
            if (reader.variant === 'translated') params.set('variant', 'translated')
            const url = new URL(`mathdesk/pdf?${params.toString()}`, document.baseURI).href
            const task = lib.getDocument({ url, isEvalSupported: false, ...pdfAssetUrls() })
            readerTask.current = task
            const doc = await task.promise
            if (cancelled) {
              // pdf.js 6 has no document.destroy(); the loading task owns teardown.
              try { void Promise.resolve(task.destroy()).catch(() => {}) } catch { /* already gone */ }
              return
            }
            readerDoc.current = doc
            setReader(previous => previous === null ? null : {
              ...previous,
              page: Math.max(1, Math.min(doc.numPages || 1, previous.page || 1)),
              count: doc.numPages || 0,
              phase: 'ready',
              error: '',
            })
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
          const task = readerTask.current
          readerTask.current = null
          readerDoc.current = null
          if (task !== null) { try { void Promise.resolve(task.destroy()).catch(() => {}) } catch { /* already gone */ } }
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

      // Painting one page in single mode. A page or zoom change cancels the
      // previous render; continuous mode paints each page in its own slot.
      useEffect(() => {
        if (reader === null || reader.phase !== 'ready' || reader.mode !== 'single') return undefined
        const doc = readerDoc.current
        const canvas = readerCanvas.current
        if (doc === null || canvas === null) return undefined
        let cancelled = false
        const paint = async () => {
          try {
            const page = await doc.getPage(reader.page)
            if (cancelled) return
            const base = page.getViewport({ scale: 1 })
            const scale = reader.scale ?? fitScale(base.width)
            const viewport = page.getViewport({ scale })
            let dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
            // An oversized canvas paints nothing; trade sharpness for a visible page.
            if (viewport.width * dpr > 8000 || viewport.height * dpr > 8000) dpr = 1
            canvas.width = Math.max(1, Math.floor(viewport.width * dpr))
            canvas.height = Math.max(1, Math.floor(viewport.height * dpr))
            canvas.style.width = `${Math.floor(viewport.width)}px`
            canvas.style.height = `${Math.floor(viewport.height)}px`
            if (readerRender.current !== null) {
              try { readerRender.current.cancel() } catch { /* already finished */ }
              readerRender.current = null
            }
            const task = page.render({
              canvasContext: canvas.getContext('2d'),
              viewport,
              transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
            })
            readerRender.current = task
            await task.promise
            if (cancelled) return
            // A fresh document starts at "fit width", which is only known after
            // the first page's size is; record it so zoom is relative to it.
            if (readerRef.current !== null && readerRef.current.scale === null) {
              setReader(previous => previous === null ? null : { ...previous, scale })
            }
          } catch (error) {
            if (cancelled) return
            const name = error !== null && error !== undefined ? String(error.name) : ''
            if (name === 'RenderingCancelledException' || name === 'AbortException') return
            setReader(previous => previous === null ? null : { ...previous, phase: 'error', error: errorText(error) })
          }
        }
        void paint()
        return () => {
          cancelled = true
          if (readerRender.current !== null) {
            try { readerRender.current.cancel() } catch { /* already finished */ }
            readerRender.current = null
          }
        }
      }, [fitScale, reader === null ? '' : `${reader.page}|${reader.scale}|${reader.phase}|${reader.mode}`])

      // Continuous mode starts at fit width too: without a single-page paint to
      // learn the page size from, measure page one here.
      useEffect(() => {
        if (reader === null || reader.phase !== 'ready' || reader.mode !== 'continuous' || reader.scale !== null) return undefined
        const doc = readerDoc.current
        if (doc === null) return undefined
        let cancelled = false
        void doc.getPage(1).then(page => {
          if (cancelled) return
          const scale = fitScale(page.getViewport({ scale: 1 }).width)
          setReader(previous => previous === null || previous.scale !== null ? previous : { ...previous, scale })
        }).catch(() => {})
        return () => { cancelled = true }
      }, [fitScale, reader === null ? '' : `${reader.mode}|${reader.scale}|${reader.phase}`])

      const readerPage = useCallback(page => {
        setReader(previous => {
          if (previous === null) return null
          const limit = previous.count > 0 ? previous.count : 1
          const next = Math.max(1, Math.min(limit, Math.round(page)))
          if (next === previous.page) return previous
          return { ...previous, page: next, jump: (previous.jump ?? 0) + 1 }
        })
      }, [])

      const readerPrev = useCallback(() => {
        setReader(previous => previous === null || previous.page <= 1
          ? previous
          : { ...previous, page: previous.page - 1, jump: (previous.jump ?? 0) + 1 })
      }, [])

      const readerNext = useCallback(() => {
        setReader(previous => {
          if (previous === null) return null
          const limit = previous.count > 0 ? previous.count : previous.page
          if (previous.page >= limit) return previous
          return { ...previous, page: previous.page + 1, jump: (previous.jump ?? 0) + 1 }
        })
      }, [])

      /** A page scrolled into view in continuous mode: no jump, no re-scroll. */
      const readerVisible = useCallback(page => {
        setReader(previous => previous === null || previous.page === page ? previous : { ...previous, page })
      }, [])

      const readerMode = useCallback(mode => {
        setReader(previous => previous === null
          ? null
          : { ...previous, mode, jump: (previous.jump ?? 0) + 1 })
      }, [])

      /** A continuous page failed to paint: surface it like a document error. */
      const readerError = useCallback(error => {
        setReader(previous => previous === null ? null : { ...previous, phase: 'error', error: errorText(error) })
      }, [])

      const readerZoom = useCallback(factor => {
        setReader(previous => {
          if (previous === null) return null
          const current = previous.scale ?? 1
          return { ...previous, scale: Math.max(0.3, Math.min(4, Math.round(current * factor * 100) / 100)) }
        })
      }, [])

      const readerFit = useCallback(() => {
        setReader(previous => previous === null ? null : { ...previous, scale: null })
      }, [])

      const closeReader = useCallback(() => setReader(null), [])

      // Reader keyboard: ↑/↓ scroll the page, ←/→ and PageUp/PageDown turn pages,
      // +/- zoom, Escape out. A text field keeps its own keys.
      useEffect(() => {
        if (reader === null) return undefined
        const stage = readerStage
        const onKeyDown = event => {
          const target = event.target
          const typing = target !== null && target !== undefined
            && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable === true)
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            closeReader()
            return
          }
          if (typing) return
          if (event.key === 'Home') {
            event.preventDefault()
            readerPage(1)
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const node = stage === undefined ? null : stage.current
            if (node !== null) node.scrollBy({ top: event.key === 'ArrowDown' ? 96 : -96, behavior: 'auto' })
          } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
            event.preventDefault()
            readerNext()
          } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
            event.preventDefault()
            readerPrev()
          } else if (event.key === '+' || event.key === '=') {
            event.preventDefault()
            readerZoom(1.2)
          } else if (event.key === '-') {
            event.preventDefault()
            readerZoom(1 / 1.2)
          }
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [closeReader, reader, readerNext, readerPage, readerPrev, readerZoom])

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
      }, [book, openReader])

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
          setCatalog({
            books,
            skipped: Array.isArray(data.skipped) ? data.skipped : [],
            warnings: Array.isArray(data.warnings) ? data.warnings : [],
            source: data.source === 'index.json' ? 'index.json' : 'scan',
            indexIgnored: data.indexIgnored === true,
            problem: data.problem !== null && typeof data.problem === 'object' ? data.problem : null,
            version: typeof data.version === 'string' ? data.version : '0.0.0',
            covers: new Set(Array.isArray(data.covers) ? data.covers : []),
            libraryDir: typeof data.libraryDir === 'string' ? data.libraryDir : '',
            artifactDir: typeof data.artifactDir === 'string' ? data.artifactDir : '',
            resumeRatio: typeof data.resumeRatio === 'number' ? data.resumeRatio : 0.85,
            target: data.target !== null && typeof data.target === 'object'
              ? {
                workspaceId: typeof data.target.workspaceId === 'string' && data.target.workspaceId !== '' ? data.target.workspaceId : null,
                cwd: typeof data.target.cwd === 'string' ? data.target.cwd : '',
              }
              : { workspaceId: null, cwd: '' },
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
          setEnvTools(data.environment !== null && typeof data.environment === 'object' ? { python: data.environment.python === true, tex: data.environment.tex === true } : { python: false, tex: false })
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
              setReader({
                bookId: restoreBook.id,
                code: restoreChapter.code,
                title: restoreChapter.title ?? '',
                bookTitle: restoreBook.title,
                fileName: restoreChapter.file ?? '',
                name: typeof storedReader.name === 'string' ? storedReader.name : '',
                page: typeof storedReader.page === 'number' ? storedReader.page : 1,
                count: 0,
                scale: typeof storedReader.scale === 'number' ? storedReader.scale : null,
                mode: storedReader.mode === 'continuous' ? 'continuous' : 'single',
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

      // A double click's first click already toggled the row; `detail > 1` is its second click.
      const onClickRow = useCallback((event, chapter) => {
        if (Date.now() < clickGuardRef.current) return
        toggleChapter(chapter.code)
      }, [toggleChapter])

      const openSessionRow = useCallback(id => {
        const outline = pendingDrafts.current.get(id)
        if (outline === undefined) {
          if (!openHostSession(id)) showNotice(format('sessionUnavailable'))
          return
        }
        // A continuation created from the chapter page carries its outline only as
        // a remembered string; apply it now, while the session is about to open.
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
      }, [showNotice])

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
        const workspace = target.workspaceId !== null && workspaces !== null && workspaces.list !== undefined
          ? workspaces.list.getSnapshot().items.find(item => item.workspaceId === target.workspaceId)
          : undefined
        for (const id of list.ids) {
          if (archivedIds.has(id)) continue
          const summary = list.byId[id]
          if (summary === undefined || summary.blank !== true || summary.origin === 'subagent') continue
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
          if (summary === undefined || summary.blank !== true) continue
          if (archivedIds.has(id)) continue
          return { id, pending: true }
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
          if (best === null || updatedAt > best.updatedAt) best = { id, updatedAt }
        }
        return best === null ? null : { id: best.id, pending: false }
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
       * and PDF it belongs to, and where the reader is. Without it a conversation
       * has no idea what it is looking at.
       * @param {object} bookRow - catalog book row.
       * @param {object} chapter - catalog chapter row.
       * @returns {string} the header line.
       */
      const seedFor = useCallback((bookRow, chapter) => {
        const shown = readerRef.current
        const sameChapter = shown !== null && shown.bookId === bookRow.id && shown.code === chapter.code
        const pdf = sameChapter
          ? (shown.name === '' ? `${shown.fileName}.pdf` : shown.name)
          : (chapter.file === '' ? '' : `${chapter.file}.pdf`)
        const position = sameChapter
          ? ` · 阅读位置：第 ${shown.page} 页（${shown.mode === 'continuous' ? '连续' : '单页'}）`
          : ''
        const parts = [
          `〔数学工作台〕本章：${bookRow.title}`,
          `${chapter.code} ${chapter.title}`,
        ]
        if (pdf !== '') parts.push(`PDF：${pdf}`)
        return `${parts.join(' · ')}${position}`
      }, [])

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
        const address = `dsh-resource://file/session/${sessionId}/${rel}`
        let attempts = 0
        const tryOpen = () => {
          attempts += 1
          const mounted = sidebar.mounted !== undefined && typeof sidebar.mounted.getSnapshot === 'function'
            ? sidebar.mounted.getSnapshot()
            : undefined
          if (mounted === sessionId) {
            try {
              sidebar.openResource(address, { destination: 'sidebar' })
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
        const target = catalog.target
        if (target.workspaceId === null && target.cwd === '') {
          setCreateError({ bookId: book.id, code: chapter.code, message: format('targetMissing') })
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
          // Reuse the workspace blank when there is one; settle everything else.
          const reuseId = findReusableBlank()
          await settlePending(reuseId)
          const base = target.workspaceId !== null ? { workspaceId: target.workspaceId } : { cwd: target.cwd }
          let sessionId
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
          // belongs to; a continuation also starts from the chapter outline.
          const parts = [seedFor(book, chapter)]
          if (artifact !== '') parts.push(`产物：${artifact}（本章产物区里的这个文件）`)
          if (catalog !== null && typeof catalog.libraryDir === 'string' && catalog.libraryDir !== '') {
            parts.push(`产物目录：${catalog.libraryDir}\\产物\\${book.id}\\${chapter.code}\\`)
          }
          let hasOutline = false
          if (continuation >= 2) {
            const outline = await loadOutline(book.id, chapter.code)
            if (outline !== '') {
              parts.push(outline)
              hasOutline = true
            }
          }
          const draft = parts.join('\n\n')
          let draftReference = null
          const prefill = await beginPrefill(sessionId, draft)
          if (prefill.applied) {
            showNotice(format(hasOutline ? 'sessionWithOutline' : 'sessionWithContext'))
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
      const resumeOrCreate = useCallback(async (chapter, mode, options) => {
        if (book === null || catalog === null || creatingRef.current) return
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
          showNotice(format('sessionContinued', { pct: Math.round(ratio * 100) }))
          await createSession(chapter, mode, {
            jump: options !== undefined && options.jumpOnCreate === true,
            continuation,
          })
          return
        }
        // No session to continue (or the caller asked for a fresh one): number the
        // new session after whatever chain the chapter already has.
        await createSession(chapter, mode, {
          jump: options !== undefined && options.jumpOnCreate === true,
          continuation: nextContinuation(book.id, chapter.code, mode),
        })
      }, [book, catalog, createSession, findCurrentSession, flushSave, nextContinuation, openPdfInSession, previewPdf, showNotice])

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
            showNotice(format('updateNoRelease'))
            return
          }
          showNotice(compareVersions(latest, current) > 0
            ? format('updateNew', { version: latest.replace(/^v/i, ''), current })
            : format('updateLatest', { version: current }))
        } catch {
          showNotice(format('updateFailed'))
        } finally {
          setUpdateBusy(false)
        }
      }, [catalog, showNotice, updateBusy])

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
          try {
            await request('POST', 'toolkit/install', {})
          } catch {
            // Without the copy the conversation can still guide the user.
          }
          const base = catalog.target.workspaceId !== null ? { workspaceId: catalog.target.workspaceId } : { cwd: catalog.target.cwd }
          const sessionId = await createSessionId(base)
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
      }, [catalog, libBusy, library, showNotice])

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
        void resumeOrCreate({ code: reader.code, title: reader.title }, mode, {
          jumpOnCreate: true,
          forceNew: forceNew === true,
        })
      }, [book, reader, resumeOrCreate])

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

      let body
      if (blockingError !== '') {
        body = h('div', { className: 'md-state md-state-error', role: 'alert' },
          h('div', { className: 'md-empty-title' }, format('loadFailed')),
          h('p', { className: 'md-state-detail' }, blockingError),
          h('div', { className: 'md-state-actions' },
            h('button', { type: 'button', className: 'md-btn', onClick: reload }, format('retry'))
          )
        )
      } else if (catalog === null || work === null) {
        body = h('div', { className: 'md-state', role: 'status' }, format('loading'))
      } else if (work.view === 'libraries') {
        body = h(LibrariesPage, {
          libraries: libs.items,
          activeId: libs.activeId,
          envTools,
          canRender: envTools.python && envTools.tex,
          busy: libBusy,
          error: libError,
          onUse: activateLibrary,
          onRemove: removeLibrary,
          onAdd: addLibrary,
          onPick: pickLibraryDir,
          onSplit: startSplitSession,
          sample,
          sampleBusy,
          importBusy,
          onImport: () => importInput.current?.click(),
          onLoadSample: installSample,
          onCopyPrompt: copyAiPrompt,
          libraryDir: library === null ? (catalog === null ? '' : catalog.libraryDir) : library.libraryDir,
        })
      } else if (book !== null) {
        body = h(BookSheet, {
          book,
          expanded,
          headingRef,
          sessionIndex,
          sessionAvailable,
          artifacts,
          libraryDir: catalog.libraryDir,
          counts: counts[book.id],
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
          canRender: envTools.python && envTools.tex,
          allowNonPdfDelete,
          onRenderArtifact: renderArtifact,
          onTrashArtifact: trashArtifact,
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
              h('p', { className: 'md-subtitle' }, format('subtitle', { books: books.length, chapters: totalChapters }))
            ),
            h('div', { className: 'md-head-actions' },
              book === null ? null : h('button', {
                type: 'button', className: 'md-btn md-btn-ghost', onClick: backToShelf,
              }, `‹ ${format('back')}`),
              h('button', {
                type: 'button', className: 'md-btn md-btn-ghost',
                title: GITHUB_URL,
                onClick: () => {
                  try {
                    window.open(GITHUB_URL, '_blank', 'noopener')
                  } catch {
                    // popup blocked: ignore
                  }
                },
              }, 'GitHub'),
              h('div', { className: 'md-settings' },
                h('button', {
                  type: 'button', className: 'md-btn md-btn-ghost',
                  'aria-haspopup': 'menu', 'aria-expanded': settingsOpen ? 'true' : 'false',
                  onClick: () => setSettingsOpen(value => !value),
                }, `⚙ ${format('settings')}`),
                false
                  ? h('div', { className: 'md-settings-menu', role: 'menu' },
                    h('div', { className: 'md-settings-version' }, `${format('version')} ${catalog === null ? '' : catalog.version}`),
                    h('button', {
                      type: 'button', className: 'md-settings-item',
                      onClick: () => {
                        try {
                          window.open(GITHUB_URL, '_blank', 'noopener')
                        } catch {
                          // popup blocked: ignore
                        }
                      },
                    }, format('githubRepo')),
                    h('button', {
                      type: 'button', className: 'md-settings-item',
                      onClick: () => {
                        backToLibraries()
                        window.setTimeout(() => {
                          const node = document.getElementById('md-env-card')
                          if (node !== null) node.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }, 150)
                      },
                    }, `${format('envTitle')}：${envTools.python && envTools.tex ? format('envOn') : format('envOff')}`),
                    h('button', {
                      type: 'button', className: 'md-settings-item', role: 'menuitemcheckbox',
                      'aria-checked': previewPdf ? 'true' : 'false',
                      onClick: () => {
                        setPreviewPdf(value => {
                          const next = !value
                          try {
                            window.localStorage.setItem('mathdesk:preview-pdf', next ? '1' : '0')
                          } catch {
                            // storage unavailable
                          }
                          return next
                        })
                      },
                    }, `${format('previewPdf')}：${previewPdf ? format('previewOn') : format('previewOff')}`),
                    h('button', {
                      type: 'button', className: 'md-settings-item', role: 'menuitemcheckbox',
                      'aria-checked': allowNonPdfDelete ? 'true' : 'false',
                      onClick: () => {
                        setAllowNonPdfDelete(value => {
                          const next = !value
                          try {
                            window.localStorage.setItem('mathdesk:delete-non-pdf', next ? '1' : '0')
                          } catch {
                            // storage unavailable
                          }
                          return next
                        })
                      },
                    }, `${format('deleteNonPdf')}：${allowNonPdfDelete ? format('previewOn') : format('previewOff')}`)
                  )
                  : null
              ),
              h('button', {
                type: 'button', className: 'md-btn', disabled: busy || creatingKey !== '',
                title: format('cleanupHint'),
                onClick: cleanupNow,
              }, format('cleanup')),
              h('button', {
                type: 'button', className: 'md-btn', disabled: busy,
                onClick: reload,
              }, busy ? format('refreshing') : format('refresh'))
            )
          ),
          h('nav', { className: 'md-crumbs', 'aria-label': format('crumbsLabel'), inert: covered ? '' : undefined },
            h('button', {
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
                : h('button', {
                  type: 'button', className: 'md-crumb',
                  onClick: goShelf,
                }, libraryName),
            groupName === null ? null : h('span', { className: 'md-crumb-sep', 'aria-hidden': true }, '/'),
            groupName === null
              ? null
              : book === null
                ? h('span', { className: 'md-crumb-current', 'aria-current': 'page' }, groupName)
                : h('button', {
                  type: 'button', className: 'md-crumb',
                  onClick: () => openGroup(group),
                }, groupName),
            book === null || librariesView ? null : h('span', { className: 'md-crumb-sep', 'aria-hidden': true }, '/'),
            book === null || librariesView ? null : h('span', { className: 'md-crumb-current', 'aria-current': 'page' }, book.title)
          ),
          inlineError === '' ? null : h('div', { className: 'md-alert', role: 'alert', inert: covered ? '' : undefined },
            h('span', { className: 'md-alert-text' }, inlineError),
            h('button', { type: 'button', className: 'md-btn md-btn-small', onClick: reload }, format('retry'))
          ),
          notice === '' ? null : h('div', { className: 'md-notice', role: 'status', inert: covered ? '' : undefined }, notice),
          catalog === null || blockingError !== '' || partialFiles === 0 ? null : h('div', { className: 'md-hint', inert: covered ? '' : undefined },
            format('partialHint', { files: partialFiles })
          ),
          h('div', { className: 'md-content' },
            h('div', { className: 'md-body', ref: bodyRef, inert: covered ? '' : undefined },
              body,
              work === null || (work.view !== 'shelf' && work.view !== 'book') ? null : h('details', { className: 'md-details md-tips' },
                h('summary', { className: 'md-details-summary' }, format('tipsTitle')),
                h('div', { className: 'md-tips-line' }, format('tipsLeftClick')),
                h('div', { className: 'md-tips-line' }, format('tipsRightClick'))
              ),
              catalog === null || blockingError !== '' ? null : h('details', { className: 'md-details', style: { order: 4 } },
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
        settingsOpen
          ? h(SettingsDialog, {
            version: catalog === null ? '' : catalog.version,
            envTools,
            updateBusy,
            onCheckUpdate: checkUpdates,
            previewPdf,
            allowNonPdfDelete,
            onPreview: () => setPreviewPdf(value => {
              const next = !value
              try {
                window.localStorage.setItem('mathdesk:preview-pdf', next ? '1' : '0')
              } catch {
                // storage unavailable
              }
              return next
            }),
            onNonPdf: () => setAllowNonPdfDelete(value => {
              const next = !value
              try {
                window.localStorage.setItem('mathdesk:delete-non-pdf', next ? '1' : '0')
              } catch {
                // storage unavailable
              }
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
            doc: readerDoc.current,
            busy: creatingKey !== '',
            forceNew: readerForceNew,
            wholeBook: book !== null && book.whole === true,
            canvasRef: readerCanvas,
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
        console.error('mathdesk: page crashed', error, info)
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
                h('button', { type: 'button', className: 'md-btn', onClick: this.retry }, format('retry'))
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
      if (typeof window !== 'undefined') window.__mathdeskTrace = traceRing
      localeService = ctx.get('locale') ?? null
      sessionsService = ctx.get('sessions') ?? null
      translate = localeService === null ? key => key : localeService.bind(NS)
      ctx.effect(() => {
        const disposers = []
        disposers.push(ctx.locale.register(NS, 'zh', zh))
        disposers.push(ctx.locale.register(NS, 'en', en))
        return () => { for (const dispose of disposers) dispose() }
      }, 'mathdesk: dictionaries')

      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 30,
        label: () => format('navLabel'),
      }, DeskIcon)), 'mathdesk: sidebar entry')

      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
      }, WorkbenchRoot)), 'mathdesk: page')
    }

    return {
      name: 'dsh-pdf-math-desk',
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
