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

    const PANEL_ID = 'pdfdesk'
    const NS = 'pdfDesk'
    const ENDPOINT = 'pdfdesk/'
    const REQUEST_TIMEOUT_MS = 12000
    const SAVE_DELAY_MS = 180
    const NOTICE_MS = 5000

    /** Session modes, in the order the chapter shows them. */
    const MODES = ['extract', 'qa', 'exercise']

    /** The mode word written into a session title (data, not UI copy). */
    const TITLE_MODE = { extract: '提取', qa: '答疑', exercise: '习题' }
    const GITHUB_URL = 'https://github.com/minggemofashi/dsh-pdf-workbench'
    const TEXLIVE_URL = 'https://tug.org/texlive/acquire.html'

    /**
     * Last page read for one chapter, so leaving the reader does not reset it.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {number} a positive page number, or 1.
     */
    function readReaderPage(bookId, code) {
      try {
        const raw = window.localStorage.getItem(`pdfdesk:page:${bookId}:${code}`)
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
        window.localStorage.setItem(`pdfdesk:page:${bookId}:${code}`, String(page))
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
      manualEnvLead: 'Markdown 转 PDF 需要 Python 3 + TeX（xelatex、ctex）。没装只是不显示「转 PDF」，阅读、会话和预览不受影响。',
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
      readerShelf: '书架',
      readerShelfHint: '回到书架',
      readerOf: '/ {n}',
      readerMode: '阅读模式',
      readerModeSingle: '单页',
      readerModeContinuous: '连续',
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
      annotSelect: '选择',
      shapeLine: '直线',
      shapeArrow: '箭头',
      shapeRect: '矩形',
      shapeDiamond: '菱形',
      shapeEllipse: '椭圆',
      selectionTitle: '已选中',
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
      settingsTabKeys: '快捷键',
      settingsTabEnv: '环境',
      settingsTabAbout: '关于',
      settingsNotesTitle: '笔记与备份',
      settingsNotesHint: '标注与框选会自动镜像到 <库根>\\.pdfdesk\\annotations\\；清浏览器数据或换机器后，打开该章自动恢复',
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
      envReady: '已就绪：md 可转 PDF',
      envMissing: '未安装：md→PDF 按钮已隐藏，其余功能正常',
      envDownload: '下载 TeX Live（约 5 GB）',
      envHint: '需要 TeX Live（xelatex、ctex）与 Python 3；装好后把 TeX 的 bin 加进 PATH 并重启 DSH',
      updateChecking: '检查中…',
      updateHint: '只在你点击时访问 GitHub releases',
      updateLatest: '已是最新版本（v{version}）',
      updateNew: '发现新版本 {version}（当前 {current}），到 GitHub Releases 下载',
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
      manualEnvLead: 'Markdown-to-PDF needs Python 3 + TeX (xelatex, ctex). Without it the PDF button is hidden; reading, conversations and preview still work.',
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
      readerShelf: 'Shelf',
      readerShelfHint: 'Back to the shelf (the book list)',
      readerOf: '/ {n}',
      readerMode: 'Reading mode',
      readerModeSingle: 'Single page',
      readerModeContinuous: 'Continuous',
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
      annotSelect: 'Select',
      shapeLine: 'Line',
      shapeArrow: 'Arrow',
      shapeRect: 'Rectangle',
      shapeDiamond: 'Diamond',
      shapeEllipse: 'Ellipse',
      selectionTitle: 'Selected',
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
      settingsTabKeys: 'Shortcuts',
      settingsTabEnv: 'Toolchain',
      settingsTabAbout: 'About',
      settingsNotesTitle: 'Notes and backup',
      settingsNotesHint: 'Ink and boxes are mirrored into <library>\\.pdfdesk\\annotations\\ automatically and travel with the library; a cleared browser or a new machine gets them back on open.',
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
      envReady: 'ready: md can render to PDF',
      envMissing: 'missing: md-to-PDF buttons are hidden, everything else works',
      envDownload: 'Download TeX Live (~5 GB)',
      envHint: 'Needs TeX Live (xelatex, ctex) and Python 3; add TeX bin to PATH and restart DSH',
      updateChecking: 'Checking…',
      updateHint: 'Only contacts GitHub releases on click',
      updateLatest: 'Up to date (v{version})',
      updateNew: 'Version {version} is available (you have {current}) — see GitHub Releases',
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
    function request(method, path, body, timeoutMs) {
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
      reader: ['scale', 'mode', 'variant', 'docRev', 'annotRev'],
      side: ['mode', 'annotRev'],
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

    /**
     * Bring this browser and the library mirror together for one chapter:
     * pages only the mirror knows are restored locally (a cleared browser or a
     * new machine), pages only this browser knows are handed to the mirror
     * (first run after the update). A page held locally always wins.
     * @param {string} bookId - book id.
     * @param {string} code - chapter code.
     * @returns {Promise<{ restored: number, seeded: number }>} what changed on each side.
     */
    async function syncChapterAnnotations(bookId, code) {
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
     */
    const SHORTCUT_ACTIONS = [
      { id: 'prevPage', labelKey: 'readerPrev', fallback: [{ key: 'ArrowLeft' }, { key: 'PageUp' }] },
      { id: 'nextPage', labelKey: 'readerNext', fallback: [{ key: 'ArrowRight' }, { key: 'PageDown' }] },
      { id: 'firstPage', labelKey: 'readerFirst', fallback: [{ key: 'Home' }] },
      { id: 'scrollUp', labelKey: 'shortcutScrollUp', fallback: [{ key: 'ArrowUp' }] },
      { id: 'scrollDown', labelKey: 'shortcutScrollDown', fallback: [{ key: 'ArrowDown' }] },
      { id: 'zoomIn', labelKey: 'readerZoomIn', fallback: [{ key: '=' }, { key: '+' }] },
      { id: 'zoomOut', labelKey: 'readerZoomOut', fallback: [{ key: '-' }] },
      { id: 'toggleMode', labelKey: 'readerMode', fallback: null },
      { id: 'closeReader', labelKey: 'shortcutClose', fallback: [{ key: 'Escape' }] },
    ]

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
      // The dialog is paged: reading switches, the keyboard table, the toolchain
      // check, and the about/update row. Tabs keep it from becoming a long scroll.
      const [tab, setTab] = useState('reading')
      const [apiKey, setApiKey] = useState('')
      const [apiKeyNote, setApiKeyNote] = useState('')
      const [bindings, setBindingsState] = useState(() => readShortcutBindings())
      // The action being recorded; a key press fills it, Escape cancels.
      const [listening, setListening] = useState('')
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
          setApiKeyNote(payload !== null && payload.configured === true ? format('apiKeyConfigured') : format('apiKeyMissing'))
          setApiKey('')
        } catch (error) {
          setApiKeyNote(error !== null && error !== undefined && error.message ? String(error.message) : String(error))
        }
      }
      const openLink = url => {
        try {
          window.open(url, '_blank', 'noopener')
        } catch {
          // popup blocked
        }
      }
      const tabs = [
        { id: 'reading', label: format('settingsTabReading') },
        { id: 'keys', label: format('settingsTabKeys') },
        { id: 'env', label: format('settingsTabEnv') },
        { id: 'about', label: format('settingsTabAbout') },
      ]
      const reading = h(React.Fragment, null,
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
          ),
          h('div', { className: 'md-settings-row' },
            h('span', { title: format('socraticHint') }, format('socraticToggle')),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small',
              title: format('socraticHint'),
              onClick: props.onSocratic,
            }, props.socratic ? format('previewOn') : format('previewOff'))
          ),
          h('div', { className: 'md-settings-row' },
            h('span', null, format('toolRail')),
            h('button', {
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
          )
        ),
        h('div', { className: 'md-settings-section' },
          h('h4', { className: 'md-settings-heading' }, format('settingsNotesTitle')),
          h('p', { className: 'md-shelf-sub' }, format('settingsNotesHint'))
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
            h('button', {
              type: 'button', className: 'md-btn md-btn-small',
              'aria-pressed': listening === action.id ? 'true' : 'false',
              onClick: () => setListening(listening === action.id ? '' : action.id),
            }, listening === action.id ? format('shortcutsCancel') : format('shortcutsRecord')),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small',
              disabled: bindingList(bindings[action.id]).length === 0,
              onClick: () => saveBinding(action.id, []),
            }, format('shortcutsClear'))
          ))
        ),
        h('div', { className: 'md-settings-actions' },
          h('button', {
            type: 'button', className: 'md-btn md-btn-small',
            onClick: () => {
              const defaults = {}
              for (const action of SHORTCUT_ACTIONS) defaults[action.id] = bindingList(action.fallback).map(item => ({ ...item }))
              setBindingsState(defaults)
              writeShortcutBindings(defaults)
            },
          }, format('shortcutsRestore')),
          h('button', {
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
        )
      )
      const about = h('div', { className: 'md-settings-section' },
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
      )
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
          h('div', { className: 'md-settings-tabs', role: 'tablist' },
            tabs.map(item => h('button', {
              key: item.id,
              type: 'button',
              role: 'tab',
              className: 'md-btn md-btn-small md-tab-btn',
              'data-on': tab === item.id ? 'true' : 'false',
              'aria-selected': tab === item.id ? 'true' : 'false',
              onClick: () => setTab(item.id),
            }, item.label))
          ),
          tab === 'reading' ? reading : tab === 'keys' ? keys : tab === 'env' ? env : about
        )
      )
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
      const envTools = props.envTools ?? { python: false, tex: false }
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
          h('button', {
            type: 'button', className: 'md-btn md-btn-small md-btn-primary', disabled: busy,
            onClick: scrollToAdd,
          }, format('libraryAddTitle')),
          h('button', { type: 'button', className: 'md-btn md-btn-small', onClick: scrollToManual }, format('manualTitle')),
          h('span', { className: 'md-home-toolbar-count' }, format('heroMeta', { n: props.libraries.length }))
        ),
        h('header', { className: 'md-hero' },
          h('p', { className: 'md-hero-eyebrow' }, format('heroEyebrow')),
          h('h1', { className: 'md-hero-title' }, format('heroTitle')),
          h('p', { className: 'md-hero-lead' }, format('heroLead')),
          h('div', { className: 'md-hero-actions' },
            h('button', {
              type: 'button', className: 'md-btn md-btn-primary', disabled: busy,
              onClick: scrollToAdd,
            }, format('libraryAddTitle')),
            h('button', {
              type: 'button', className: 'md-btn',
              disabled: props.sampleBusy || busy || props.sample?.book == null,
              onClick: props.onLoadSample,
            }, props.sampleBusy ? format('sampleBusy') : format('sampleLoad')),
            h('button', { type: 'button', className: 'md-btn md-btn-ghost', onClick: scrollToManual }, format('manualTitle'))
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
        h('div', { className: 'md-library-add', ref: addRef },
          h('div', { className: 'md-add-head' },
            h('h3', { className: 'md-subheading' }, format('libraryAddTitle')),
            h('p', { className: 'md-shelf-sub' }, format('libraryAddHint'))
          ),
          h('div', { className: 'md-add-row' },
            h('input', {
              className: 'md-input md-add-path', value: dir, disabled: busy,
              placeholder: format('addPathPlaceholder'),
              'aria-label': format('libraryPath'),
              onChange: event => setDir(event.target.value),
            }),
            h('button', {
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
            h('input', {
              className: 'md-input md-add-name', value: name, disabled: busy,
              placeholder: format('addNamePlaceholder'),
              'aria-label': format('libraryName'),
              onChange: event => setName(event.target.value),
            }),
            h('button', {
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
                props.canRender ? null : h('button', {
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
                h('button', {
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
    /** The shape tools; each saves one `kind: 'shape'` entry per page. */
    const SHAPE_TOOLS = ['line', 'arrow', 'rect', 'ellipse', 'diamond']
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
     * @param {{ index: number, x: number, y: number, color?: string, fontSize?: number, fontFamily?: string }} draft - the edited note.
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
        const width = Math.min(0.9, Math.max(0.08, String(entry.text ?? '').length * 0.018))
        return point[0] >= entry.x - reach && point[0] <= entry.x + width + reach
          && point[1] >= entry.y - 0.02 - reach && point[1] <= entry.y + 0.035 + reach
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
          Object.keys(NOTE_FONTS).map(key => h('button', {
            key,
            type: 'button',
            className: 'md-note-style-btn',
            'data-on': family === key ? 'true' : undefined,
            onMouseDown: event => event.preventDefault(),
            onClick: () => props.onChange({ fontFamily: key }),
          }, format(`annotFont.${key}`)))
        ),
        h('div', { className: 'md-note-style-row' },
          h('span', { className: 'md-note-style-label' }, format('annotColor')),
          NOTE_COLORS.map(value => h('button', {
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
        h('button', {
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
      // The editor sits on the PDF page: keep the box inside the page even when
      // the click lands near the right edge (the note itself stays at its point).
      const left = Math.min(0.66, Math.max(0, draft.x)) * 100
      return h('div', {
        className: 'md-note-editor',
        ref: editorRef,
        style: { left: `${left}%`, top: `${Math.max(0, draft.y) * 100}%`, maxWidth: `calc(100% - ${left}% - 6px)` },
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
     * An invisible seat in the conversation composer. It sees every session the
     * host opens — including the sidebar list, which no workbench click passes
     * through — and puts the local persona into a Q&A session's input once.
     * @param {{ sessionId: string }} props - standard slot props.
     * @returns {null} nothing to draw.
     */
    function QaPersonaSeat(props) {
      const list = useSessionList()
      const summary = list === null || list.byId === undefined ? undefined : list.byId[props.sessionId]
      const title = summary === undefined ? '' : summary.title
      useEffect(() => {
        const parsed = parseSessionTitle(title)
        if (parsed !== null && parsed.mode === 'qa') void seedQaPersona(props.sessionId)
      }, [props.sessionId, title])
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
     * The context line every new conversation starts with: which book, chapter
     * and PDF it belongs to, and where the reader is. With `paths`, it also names
     * the library, the chapter's folder and the exact PDF, so the model never
     * has to search for the book. With `persona`, a Q&A session starts with the
     * local Socratic instruction in the same prompt.
     * @param {{ title: string }} bookRow - catalog book row.
     * @param {{ code: string, title: string, file: string }} chapter - catalog chapter row.
     * @param {{ pdf: string, page: number, mode: string } | null} position - the open reader when it is this chapter.
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
      const suffix = position === null
        ? ''
        : ` · 阅读位置：第 ${position.page} 页（${position.mode === 'continuous' ? '连续' : '单页'}）`
      const header = `${parts.join(' · ')}${suffix}`
      const hasPaths = paths !== null && paths !== undefined
      const hasPersona = typeof persona === 'string' && persona !== ''
      if (!hasPaths && !hasPersona) return header
      const lines = [header]
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
          const width = Math.min(0.9, Math.max(0.08, String(entry.text ?? '').length * 0.018))
          return point[0] >= entry.x - HIT && point[0] <= entry.x + width + HIT
            && point[1] >= entry.y - 0.02 - HIT && point[1] <= entry.y + 0.035 + HIT
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
      const openNote = point => {
        const list = strokesRef.current
        const index = list.findIndex(entry => entry.kind === 'text' && within(entry, point))
        noteSeq.current += 1
        const entry = index >= 0 ? list[index] : null
        noteText.current = entry === null ? '' : String(entry.text ?? '')
        setNoteBoth({
          id: noteSeq.current,
          index,
          x: entry === null ? point[0] : entry.x,
          y: entry === null ? point[1] : entry.y,
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
          // A click always starts a note where it lands: an editor left open is
          // saved first, so a page can hold as many notes as the reader places.
          if (noteRef.current !== null) saveNote(noteRef.current.id)
          openNote(point)
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
        const current = draftRef.current
        if (current === null) return
        setDraftBoth(null)
        if (current.points.length > 1) commit([...strokesRef.current, current])
      }
      const notes = strokes.filter(entry => entry.kind === 'text')
      return h('div', {
        className: 'md-annot',
        'data-tool': props.tool,
        onPointerDown: down,
        onPointerMove: move,
        onPointerUp: up,
        onPointerLeave: up,
      },
        h('svg', {
          className: 'md-annot-ink',
          viewBox: '0 0 1 1',
          preserveAspectRatio: 'none',
          'aria-hidden': true,
        },
          strokes.filter(entry => entry.kind !== 'text').map((entry, index) => h('polyline', {
            key: `stroke-${index}`,
            points: (entry.points ?? []).map(point => `${point[0]},${point[1]}`).join(' '),
            fill: 'none',
            stroke: entry.color ?? '#e0554a',
            strokeWidth: entry.width ?? 2,
            vectorEffect: 'non-scaling-stroke',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          })),
          draft === null ? null : h('polyline', {
            points: draft.points.map(point => `${point[0]},${point[1]}`).join(' '),
            fill: 'none',
            stroke: draft.color ?? '#e0554a',
            strokeWidth: draft.width ?? 2,
            vectorEffect: 'non-scaling-stroke',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          })
        ),
        notes.map((entry, index) => h('div', {
          key: `note-${index}`,
          className: 'md-annot-text',
          title: props.tool === '' ? format('annotTextEditHint') : undefined,
          style: {
            left: `${entry.x * 100}%`,
            top: `${entry.y * 100}%`,
            color: entry.color ?? '#e0554a',
            fontSize: Number.isFinite(entry.fontSize) ? `${entry.fontSize}px` : undefined,
            fontFamily: typeof entry.fontFamily === 'string' ? (NOTE_FONTS[entry.fontFamily] ?? undefined) : undefined,
          },
          onPointerDown: props.tool === '' ? event => event.stopPropagation() : undefined,
          onDoubleClick: props.tool === ''
            ? event => {
              event.preventDefault()
              event.stopPropagation()
              noteSeq.current += 1
              noteText.current = String(entry.text ?? '')
              setNoteBoth({
                id: noteSeq.current,
                index: strokesRef.current.indexOf(entry),
                x: entry.x,
                y: entry.y,
                text: noteText.current,
                color: entry.color ?? props.color,
                fontSize: Number.isFinite(entry.fontSize) ? entry.fontSize : NOTE_SIZES[0],
                fontFamily: typeof entry.fontFamily === 'string' ? entry.fontFamily : 'normal',
              })
            }
            : undefined,
        }, entry.text)),
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
                h('button', {
                  type: 'button',
                  className: 'md-fallback-row md-fallback-parent',
                  'aria-expanded': open ? 'true' : 'false',
                  onClick: () => setOpenGroup(open ? '' : row.id),
                }, `${row.label} ${open ? '▾' : '▸'}`),
                open
                  ? h('div', { className: 'md-fallback-children' }, row.children.map(child => h('button', {
                    key: child.id,
                    type: 'button',
                    className: 'md-fallback-row',
                    disabled: child.disabled === true,
                    onClick: () => run(child),
                  }, child.label)))
                  : null)
            }
            return h('button', {
              key: row.id,
              type: 'button',
              className: 'md-fallback-row',
              disabled: row.disabled === true,
              onClick: () => run(row),
            }, row.label)
          })))
    }

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
      // Only the pages around the one being read are mounted. A 300-page chapter
      // used to create 300 components (and 300 observers) up front; the rest stay
      // cheap ghosts until the reader approaches them.
      const from = Math.max(1, current - 12)
      const to = Math.min(total, current + 12)
      const pages = []
      for (let page = 1; page <= total; page += 1) {
        if (page < from || page > to) {
          pages.push(h('div', { key: page, className: 'md-reader-slot md-reader-ghost' },
            h('span', { className: 'md-reader-page-no', 'aria-hidden': true }, String(page))))
          continue
        }
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
          overlay: props.overlay,
          overlayPage: props.overlayPage,
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
      // The parent keeps the same ref for keyboard scrolling and fit width, so
      // the viewer hands its stage to that ref instead of hiding it.
      const attachStage = node => {
        stage.current = node
        if (props.stageRef !== null && props.stageRef !== undefined) props.stageRef.current = node
      }

      // Paint the single page. A page or zoom change cancels the previous
      // render, so a fast zoom never leaves a stale bitmap on top.
      useEffect(() => {
        if (props.mode !== 'single' || props.doc === null || props.doc === undefined) return undefined
        const node = canvas.current
        if (node === null) return undefined
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
      }, [props.doc, props.page, props.scale, props.mode, props.fitScale, props.onScale, props.onError])

      // Continuous mode has no single-page paint to learn the page size from,
      // so measure page one instead of leaving the scale unknown.
      useEffect(() => {
        if (props.scale !== null || props.mode !== 'continuous' || props.doc === null || props.doc === undefined) return undefined
        let cancelled = false
        void props.doc.getPage(1).then(page => {
          if (cancelled) return
          props.onScale(props.fitScale(page.getViewport({ scale: 1 }).width))
        }).catch(() => {})
        return () => { cancelled = true }
      }, [props.doc, props.mode, props.scale, props.fitScale, props.onScale])

      const content = props.mode === 'single'
        ? h('div', { className: 'md-reader-single' },
          h('div', { className: 'md-reader-single-page' },
            h('canvas', { className: 'md-reader-canvas', ref: canvas }),
            props.children
          ))
        : h(ContinuousView, {
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
          // Continuous mode paints many pages; a layer passed from outside can
          // only belong to the page being read, so it lands there.
          overlay: props.overlay,
          overlayPage: props.overlayPage === undefined ? props.page : props.overlayPage,
        })

      if (props.variant === 'column') return content
      return h('div', {
        className: 'md-reader-stage',
        'data-mode': props.mode,
        ref: attachStage,
      }, content)
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
      const [showBlocks, setShowBlocks] = useState(false)
      const [toolsOpen, setToolsOpen] = useState(true)
      const [overlay, setOverlay] = useState(false)
      const [masks, setMasks] = useState([])
      const [maskDraft, setMaskDraft] = useState(null)
      // The boxes "框住本页块" made on this page: a second press removes them, and
      // the button stays pressed while the page still holds exactly these boxes.
      const [autoBoxes, setAutoBoxes] = useState(null)
      // Freehand annotations, one array of strokes per page, normalized so they
      // follow the page box through any zoom.
      const [annotTool, setAnnotTool] = useState('')
      // Which column the undo/redo buttons act on: the original layer or the
      // translated column's own ink (see ColumnInk).
      const [activeSide, setActiveSide] = useState('main')
      const [annotColor, setAnnotColor] = useState('#1f1f1f')
      const [annotWidth, setAnnotWidth] = useState(2)
      const [strokes, setStrokes] = useState([])
      const [draftStroke, setDraftStroke] = useState(null)
      // The note being typed in place: `index` is its slot in `strokes`, or -1
      // for one that does not exist yet. `id` keeps a stale save (a blur that
      // lands after the draft was replaced) from touching the next note.
      const [noteEdit, setNoteEdit] = useState(null)
      // Defaults for the next note; the toolbar's text menu edits this, or the
      // open draft when there is one.
      const [noteStyle, setNoteStyle] = useState({ fontSize: NOTE_SIZES[0], fontFamily: 'normal', color: '#1f1f1f', textAlign: 'left' })
      // Which existing mark the select tool has picked (index into `strokes`).
      const [selection, setSelection] = useState(null)
      // A shape being dragged out, and a selected mark being moved.
      const [shapeDraft, setShapeDraft] = useState(null)
      const [drag, setDrag] = useState(null)
      const [resize, setResize] = useState(null)
      const [resizeEntry, setResizeEntry] = useState(null)
      const [roughTick, setRoughTick] = useState(0)
      // Pointer-near-the-edge state for the rail. CSS :hover alone proved
      // unreliable once the rail sits over the scrolling stage, so the section
      // also opens it by position.
      const [railOpen, setRailOpen] = useState(false)
      const [railPanel, setRailPanel] = useState(false)
      // Vertical centre of the tool button that opened the panel, so the panel
      // sits beside that icon instead of at the middle of the page.
      const [railAnchor, setRailAnchor] = useState(null)
      const railPanelTimer = useRef(null)
      const beginRailPanel = element => {
        const wrap = element.closest('.md-rail-wrap')
        if (wrap !== null) {
          const button = element.getBoundingClientRect()
          const box = wrap.getBoundingClientRect()
          setRailAnchor(button.top - box.top + button.height / 2)
        }
        if (railPanel) return
        if (railPanelTimer.current !== null) clearTimeout(railPanelTimer.current)
        railPanelTimer.current = setTimeout(() => setRailPanel(true), 550)
      }
      const leaveRail = () => {
        if (railPanelTimer.current !== null) clearTimeout(railPanelTimer.current)
        railPanelTimer.current = null
        setRailPanel(false)
      }
      useEffect(() => () => {
        if (railPanelTimer.current !== null) clearTimeout(railPanelTimer.current)
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
      const noteEditRef = useRef(null)
      noteEditRef.current = noteEdit
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
      const [translating, setTranslating] = useState(false)
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
      const strokesRef = useRef([])
      const masksRef = useRef([])
      // Page marks live in the shared store: the side preview writes the same keys.
      const inkStore = useMemo(() => createAnnotationStore(reader.bookId, reader.code, 'reader'), [reader.bookId, reader.code])
      strokesRef.current = strokes
      masksRef.current = masks
      useEffect(() => {
        seenAnnotRev.current = Number(readView(reader.bookId, reader.code).annotRev) || 0
        return subscribeView(reader.bookId, reader.code, state => {
          if (state.origin !== 'side') return
          const next = Number(state.annotRev) || 0
          if (next <= seenAnnotRev.current) return
          seenAnnotRev.current = next
          setRemoteAnnotRev(value => value + 1)
        })
      }, [reader.bookId, reader.code])
      // Every edit goes through the shared store: state, storage, the library
      // mirror and the announcement stay in step, and a page's own load never
      // writes anything back. Each commit first files the page as it was, so the
      // toolbar's undo has something to go back to.
      const historyKeyOf = inkStore.historyKeyOf
      const [, bumpHistory] = useState(0)
      const savePageAnnots = next => {
        const rev = inkStore.save(reader.page, 'annots', next, currentSnapshot())
        if (rev === null) return
        bumpHistory(value => value + 1)
        strokesRef.current = next
        setStrokes(next)
        seenAnnotRev.current = rev
      }
      const savePageMasks = next => {
        const rev = inkStore.save(reader.page, 'masks', next, currentSnapshot())
        if (rev === null) return
        bumpHistory(value => value + 1)
        masksRef.current = next
        setMasks(next)
        seenAnnotRev.current = rev
      }
      // Undo/redo restore both lists at once: one step is one action, even when
      // it touched ink and boxes together.
      const restorePage = snapshot => {
        strokesRef.current = snapshot.annots
        masksRef.current = snapshot.masks
        setStrokes(snapshot.annots)
        setMasks(snapshot.masks)
        seenAnnotRev.current = inkStore.restore(reader.page, snapshot)
      }
      const currentSnapshot = () => snapshotOf(strokesRef.current, masksRef.current)
      const undoPage = () => {
        const previous = inkStore.undo(reader.page, currentSnapshot())
        if (previous === null) return
        restorePage(previous)
        bumpHistory(value => value + 1)
      }
      const redoPage = () => {
        const next = inkStore.redo(reader.page, currentSnapshot())
        if (next === null) return
        restorePage(next)
        bumpHistory(value => value + 1)
      }
      const historyCounts = inkStore.depth(reader.page)
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
        request('POST', 'translate-cancel', { job: jobRef.current }).catch(() => {})
        jobRef.current = ''
        setTranslating(false)
        setDeskStatus('idle')
        updateNote(format('translateCancelled'))
      }
      const [hasTranslation, setHasTranslation] = useState(false)
      const [dualDoc, setDualDoc] = useState(null)
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
        const load = async () => {
          try {
            // The chapter PDF is rendered from the cached page markdown. Re-render
            // it when this release changed the renderer (a marker on the Host
            // keeps it a one-off), so old `\(...\)` left-overs get fixed without
            // paying for the translation again.
            try {
              await request('POST', 'rebuild-translated', { book: reader.bookId, code: reader.code })
            } catch {
              // no cached pages yet, or XeLaTeX failed: read what exists
            }
            const lib = await loadPdfjs()
            const make = variant => {
              const params = new URLSearchParams({ book: reader.bookId, code: reader.code })
              if (variant !== '') params.set('variant', variant)
              // A fresh translation or overlay rebuild must be fetched again; the
              // revision defeats any document cache inside pdf.js or the browser.
              if (docRev > 0) params.set('rev', String(docRev))
              const url = new URL(`pdfdesk/pdf?${params.toString()}`, document.baseURI).href
              return lib.getDocument({ url, isEvalSupported: false, ...pdfAssetUrls() })
            }
            let doc = null
            let notice = ''
            if (overlay && reader.variant !== 'translated') {
              // Rebuild from the cached per-page blocks so an old overlay PDF
              // rendered by an earlier release cannot hide the fix.
              try {
                await request('POST', 'rebuild-overlay', { book: reader.bookId, code: reader.code })
              } catch {
                // keep the existing overlay if the rebuild fails
              }
              try {
                doc = await make('overlay').promise
              } catch {
                doc = null
              }
              if (doc === null) {
                // No overlay layer to reveal: show the whole translation instead
                // and say so, rather than silently leaving the original.
                doc = await make('translated').promise
                notice = format('overlayFallback')
              }
            } else if (reader.variant !== 'translated') {
              doc = await make('translated').promise
            } else {
              doc = await make('').promise
            }
            overlaySource.current = doc !== null && notice === '' && overlay ? 'overlay' : 'translated'
            if (!cancelled) {
              setOverlayNote(notice)
              setDualDoc(doc)
            }
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
        }
      }, [dual, overlay, reader.bookId, reader.code, docRev])


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
      const maskKey = `pdfdesk:masks:${reader.bookId}:${reader.code}:${reader.page}`
      useEffect(() => {
        const list = inkStore.readList('masks', reader.page)
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
        const list = inkStore.readList('annots', reader.page)
        strokesRef.current = list
        setStrokes(list)
      }, [inkStore, annotKey, remoteAnnotRev])
      // Turning the page (or taking the other end's edit) moves the ink under
      // the editor: a draft left open would save itself onto the wrong page.
      // An in-flight stroke is dropped for the same reason.
      useEffect(() => {
        setNoteEdit(null)
        setDraftStroke(null)
        setSelection(null)
        setDrag(null)
        setResize(null)
        setResizeEntry(null)
        // The block pass belongs to one page: keep its signature only while the
        // boxes on screen are still that page's.
        setAutoBoxes(null)
      }, [annotKey, remoteAnnotRev])
      // Point in page coordinates (0..1). The SVG layer is exactly the page box,
      // so the same numbers work at any zoom. The box width is remembered so the
      // eraser can turn its pixel tolerance into page units.
      const annotBox = useRef({ width: 400, height: 600 })
      const annotPoint = event => {
        const point = inkPointOf(event, event.currentTarget)
        if (point === null) return null
        const rect = event.currentTarget.getBoundingClientRect()
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
      const openNote = (point, side) => {
        const list = strokesRef.current
        const found = list.findIndex(entry => entry.kind === 'text' && annotHit(entry, point))
        noteSeq.current += 1
        if (found >= 0) {
          const entry = list[found]
          noteText.current = String(entry.text ?? '')
          setNoteEdit({
            id: noteSeq.current,
            side,
            index: found,
            x: entry.x,
            y: entry.y,
            text: noteText.current,
            color: entry.color ?? annotColor,
            fontSize: Number.isFinite(entry.fontSize) ? entry.fontSize : NOTE_SIZES[0],
            fontFamily: typeof entry.fontFamily === 'string' ? entry.fontFamily : 'normal',
            textAlign: typeof entry.textAlign === 'string' ? entry.textAlign : 'left',
          })
          return
        }
        noteText.current = ''
        setNoteEdit({
          id: noteSeq.current,
          side,
          index: -1,
          x: point[0],
          y: point[1],
          text: '',
          color: noteStyle.color,
          fontSize: noteStyle.fontSize,
          fontFamily: noteStyle.fontFamily,
          textAlign: noteStyle.textAlign ?? 'left',
        })
      }
      const changeNote = text => {
        noteText.current = text
      }
      const changeNoteStyle = patch => {
        setNoteStyle(current => ({ ...current, ...patch }))
        setNoteEdit(current => (current === null ? current : { ...current, ...patch }))
      }
      const cancelNote = () => setNoteEdit(null)
      const saveNote = id => {
        const draft = noteEditRef.current
        if (draft === null || draft.id !== id) return
        setNoteEdit(null)
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
       * @returns {import('react').ReactElement} the button.
       */
      const railTool = (id, labelKey, path) => h('button', {
        type: 'button',
        className: 'md-rail-btn',
        'aria-pressed': annotTool === id ? 'true' : 'false',
        title: format(labelKey),
        'aria-label': format(labelKey),
        onPointerEnter: event => beginRailPanel(event.currentTarget),
        onClick: () => setAnnotTool(value => (value === id ? '' : id)),
      }, annotIcon(path))
      const erasing = useRef(false)
      const annotDown = (event, side) => {
        if (annotTool === '') return
        // The main layer is the original page (single view or the left column).
        setActiveSide('main')
        const point = annotPoint(event)
        if (point === null) return
        event.preventDefault()
        if (annotTool === 'select') {
          const found = strokesRef.current.findIndex(entry => annotHit(entry, point))
          setSelection(found < 0
            ? null
            : { index: found, kind: strokesRef.current[found].kind === 'text' ? 'text' : strokesRef.current[found].kind === 'shape' ? 'shape' : 'stroke' })
          if (found >= 0) setDrag({ index: found, start: point, dx: 0, dy: 0 })
          return
        }
        if (SHAPE_TOOLS.includes(annotTool)) {
          setShapeDraft({
            shape: annotTool,
            x0: point[0], y0: point[1],
            x1: point[0], y1: point[1],
            color: annotColor,
            width: annotWidth,
          })
          return
        }
        if (annotTool === 'erase') {
          erasing.current = true
          savePageAnnots(strokesRef.current.filter(entry => !annotHit(entry, point)))
          return
        }
        if (annotTool === 'text') {
          // A click always starts a note where it lands: an open editor is saved
          // first, so a page can hold as many notes as the reader places.
          if (noteEditRef.current !== null) saveNote(noteEditRef.current.id)
          openNote(point, side)
          return
        }
        setDraftStroke({ kind: 'stroke', points: [[point[0], point[1], strokePressure(event)]], color: annotColor, width: annotWidth })
      }
      const annotMove = event => {
        if (annotTool === 'erase' && erasing.current) {
          // Dragging the eraser sweeps several strokes away, not just the one
          // under the first press.
          const point = annotPoint(event)
          if (point === null) return
          event.preventDefault()
          savePageAnnots(strokesRef.current.filter(entry => !annotHit(entry, point)))
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
        if (shapeDraft !== null) {
          const point = annotPoint(event)
          if (point === null) return
          event.preventDefault()
          setShapeDraft(current => (current === null ? null : { ...current, x1: point[0], y1: point[1] }))
          return
        }
        if (drag !== null) {
          const point = annotPoint(event)
          if (point === null) return
          event.preventDefault()
          setDrag(current => (current === null ? null : { ...current, dx: point[0] - current.start[0], dy: point[1] - current.start[1] }))
          return
        }
        if (draftStroke === null) return
        const point = annotPoint(event)
        if (point === null) return
        setDraftStroke(current => {
          if (current === null) return null
          const last = current.points[current.points.length - 1]
          if (last !== undefined && Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.0025) return current
          return { ...current, points: [...current.points, [point[0], point[1], strokePressure(event)]] }
        })
      }
      const annotUp = () => {
        erasing.current = false
        if (resizeEntry !== null && resize !== null) {
          savePageAnnots(strokesRef.current.map((entry, index) => (index === resize.index ? resizeEntry : entry)))
          setResize(null)
          setResizeEntry(null)
          return
        }
        if (shapeDraft !== null) {
          const draft = shapeDraft
          setShapeDraft(null)
          const x = Math.min(draft.x0, draft.x1)
          const y = Math.min(draft.y0, draft.y1)
          const w = Math.abs(draft.x1 - draft.x0)
          const h = Math.abs(draft.y1 - draft.y0)
          if (w > 0.008 || h > 0.008) {
            savePageAnnots([...strokesRef.current, {
              kind: 'shape',
              shape: draft.shape,
              x, y, w, h,
              x0: draft.x0, y0: draft.y0, x1: draft.x1, y1: draft.y1,
              color: draft.color,
              width: draft.width,
              seed: Math.floor(Math.random() * 2147483647),
            }])
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
        if (draftStroke === null) return
        if (draftStroke.points.length > 1) {
          savePageAnnots([...strokesRef.current, { ...draftStroke, points: smoothStroke(draftStroke.points) }])
        }
        setDraftStroke(null)
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
      // watching it instead of losing the progress.
      useEffect(() => {
        let cancelled = false
        const key = `pdfdesk:job:${reader.bookId}:${reader.code}`
        let jobId = ''
        try {
          jobId = window.localStorage.getItem(key) ?? ''
        } catch {
          jobId = ''
        }
        if (jobId === '') return undefined
        deskStatus.job = jobId
        setTranslating(true)
        const tick = async () => {
          try {
            const state = await request('GET', `translate-status?job=${encodeURIComponent(jobId)}`)
            if (cancelled) return
            if (state.status === 'done') {
              setHasTranslation(true)
              setTranslating(false)
              deskStatus.job = ''
              setDeskStatus('done')
              setTimeout(() => setDeskStatus('idle'), 8000)
              rememberPartial(state)
              setDocRev(value => value + 1)
              updateNote(doneNote(state))
              window.localStorage.removeItem(key)
              return
            }
            if (state.status === 'error') {
              setTranslating(false)
              deskStatus.job = ''
              setDeskStatus('error')
              setTimeout(() => setDeskStatus('idle'), 8000)
              updateNote(`${format('translateFailed')}：${state.error}`)
              window.localStorage.removeItem(key)
              return
            }
            updateNote(`${format('translating')} ${state.done}/${state.total}`)
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

      // Scrolling to a page before the column knows every page height lands on
      // the wrong offset, so repeat once after the placeholders settle.
      const scrollToPage = useCallback(page => {
        const jump = () => {
          const node = slotRefs.current.get(page)
          if (node !== undefined && node !== null && typeof node.scrollIntoView === 'function') {
            node.scrollIntoView({ block: 'start' })
          }
        }
        jump()
        setTimeout(jump, 320)
      }, [])

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
        if (translating || reader.phase !== 'ready') return
        setTranslating(true)
        setDeskStatus('busy')
        updateNote(format(resume ? 'translatingResume' : 'translating'))
        try {
          const started = await request('POST', 'translate-chapter', {
            book: reader.bookId,
            code: reader.code,
            target: translateTarget,
            resume,
          })
          if (started === null || typeof started.jobId !== 'string') throw new Error('翻译任务没有启动')
          const jobId = started.jobId
          jobRef.current = jobId
          deskStatus.job = jobId
          try {
            window.localStorage.setItem(`pdfdesk:job:${reader.bookId}:${reader.code}`, jobId)
          } catch {
            // storage unavailable
          }
          for (;;) {
            await new Promise(resolve => setTimeout(resolve, 2000))
            const state = await request('GET', `translate-status?job=${encodeURIComponent(jobId)}`)
            if (state.status === 'done' || state.status === 'error') {
              try {
                window.localStorage.removeItem(`pdfdesk:job:${reader.bookId}:${reader.code}`)
              } catch {
                // storage unavailable
              }
            }
            if (state.status === 'done') {
              rememberPartial(state)
              setDocRev(value => value + 1)
              updateNote(doneNote(state))
              break
            }
            if (state.status === 'error') throw new Error(state.error === '' ? '翻译失败' : state.error)
            updateNote(`${format('translating')} ${state.done}/${state.total}`)
          }
        } catch (error) {
          const message = error !== null && error !== undefined && error.message ? String(error.message) : String(error)
          setDeskStatus('error')
          setTimeout(() => setDeskStatus('idle'), 8000)
          updateNote(`${format('translateFailed')}：${message}`)
        } finally {
          jobRef.current = ''
          deskStatus.job = ''
          setTranslating(false)
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
      // In the bilingual view the translated column keeps its own undo stack;
      // the toolbar acts on the column that was used last.
      const undoAvailable = dual
        ? (activeSide === 'right' ? rightHistory.undo : historyCounts.undo)
        : historyCounts.undo
      const redoAvailable = dual
        ? (activeSide === 'right' ? rightHistory.redo : historyCounts.redo)
        : historyCounts.redo
      const undoEither = () => {
        if (dual && activeSide === 'right' && rightInk.current !== null) rightInk.current.undo()
        else undoPage()
      }
      const redoEither = () => {
        if (dual && activeSide === 'right' && rightInk.current !== null) rightInk.current.redo()
        else redoPage()
      }
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
      const annotLayer = side => h('div', {
        className: 'md-annot',
        'data-tool': annotTool,
        onPointerDown: event => annotDown(event, side),
        onPointerMove: annotMove,
        onPointerUp: annotUp,
        onPointerLeave: annotUp,
      },
        h('svg', {
          className: 'md-annot-ink',
          viewBox: '0 0 1 1',
          preserveAspectRatio: 'none',
          'aria-hidden': true,
        },
          selection !== null && selectedEntry !== undefined && selectedEntry.kind !== 'text' && selectedEntry.kind !== 'shape'
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
          selection !== null && selectedEntry !== undefined && selectedEntry.kind === 'shape'
            ? h('rect', {
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
          strokes.map((stroke, index) => {
            if (stroke.kind === 'text' || stroke.kind === 'shape') return null
            const shown = drag !== null && drag.index === index ? translateEntry(stroke, drag.dx, drag.dy) : stroke
            const points = shown.points ?? []
            if (points.some(point => point.length > 2)) {
              const base = shown.width ?? 2
              return h('g', { key: index, opacity: shown.opacity ?? 1 },
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
                }))
            }
            return h('polyline', {
              key: index,
              points: points.map(point => `${point[0]},${point[1]}`).join(' '),
              fill: 'none',
              stroke: shown.color ?? '#e0554a',
              strokeWidth: shown.width ?? 2,
              opacity: shown.opacity ?? 1,
              vectorEffect: 'non-scaling-stroke',
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            })
          }),
          strokes.map((entry, index) => (entry.kind === 'shape'
            ? h(ShapeMark, {
              key: `shape-${index}`,
              entry: resizeEntry !== null && resize !== null && resize.index === index
                ? resizeEntry
                : drag !== null && drag.index === index ? translateEntry(entry, drag.dx, drag.dy) : entry,
              roughness: props.roughness,
            })
            : null)),
          shapeDraft === null
            ? null
            : h('g', { opacity: 0.8 },
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
              points: draftStroke.points.map(point => `${point[0]},${point[1]}`).join(' '),
              fill: 'none',
              stroke: draftStroke.color ?? '#e0554a',
              strokeWidth: draftStroke.width ?? 2,
              vectorEffect: 'non-scaling-stroke',
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            })
        ),
        // Iterating `strokes` (not the filtered notes) keeps the index aligned
        // with the stored list, so a double-click edits the right entry.
        strokes.map((entry, index) => (entry.kind === 'text'
          ? h('div', {
            key: `text-${index}`,
            className: selection !== null && selection.index === index ? 'md-annot-text md-annot-selected' : 'md-annot-text',
            title: annotTool === '' ? format('annotTextEditHint') : undefined,
            style: {
              left: `${entry.x * 100}%`,
              top: `${entry.y * 100}%`,
              color: entry.color ?? '#e0554a',
              fontSize: Number.isFinite(entry.fontSize) ? `${entry.fontSize}px` : undefined,
              fontFamily: typeof entry.fontFamily === 'string' ? (NOTE_FONTS[entry.fontFamily] ?? undefined) : undefined,
              opacity: entry.opacity ?? 1,
              textAlign: typeof entry.textAlign === 'string' ? entry.textAlign : 'left',
            },
            onPointerDown: annotTool === '' ? event => event.stopPropagation() : undefined,
            onDoubleClick: annotTool === ''
              ? event => {
                event.preventDefault()
                event.stopPropagation()
                noteSeq.current += 1
                noteText.current = String(entry.text ?? '')
                setNoteEdit({
                  id: noteSeq.current,
                  side,
                  index,
                  x: entry.x,
                  y: entry.y,
                  text: noteText.current,
                  color: entry.color ?? annotColor,
                  fontSize: Number.isFinite(entry.fontSize) ? entry.fontSize : NOTE_SIZES[0],
                  fontFamily: typeof entry.fontFamily === 'string' ? entry.fontFamily : 'normal',
                })
              }
              : undefined,
          }, entry.text)
          : null)),
        selection !== null && selectedEntry !== undefined && selectedEntry.kind === 'shape' && annotTool === 'select'
          ? h('div', { className: 'md-shape-handles' },
            (selectedEntry.shape === 'line' || selectedEntry.shape === 'arrow'
              ? [['start', selectedEntry.x0, selectedEntry.y0], ['end', selectedEntry.x1, selectedEntry.y1]]
              : [
                ['nw', selectedEntry.x, selectedEntry.y],
                ['ne', selectedEntry.x + selectedEntry.w, selectedEntry.y],
                ['sw', selectedEntry.x, selectedEntry.y + selectedEntry.h],
                ['se', selectedEntry.x + selectedEntry.w, selectedEntry.y + selectedEntry.h],
              ]).map(item => h('div', {
              key: item[0],
              className: 'md-shape-handle',
              style: { left: `${item[1] * 100}%`, top: `${item[2] * 100}%` },
              onPointerDown: event => {
                event.preventDefault()
                event.stopPropagation()
                const box = event.currentTarget.closest('.md-annot')?.getBoundingClientRect()
                if (box === undefined || box === null) return
                const point = [
                  Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
                  Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
                ]
                setResize({ index: selection.index, corner: item[0], start: point, original: selectedEntry })
                setResizeEntry(selectedEntry)
              },
            })))
          : null,
        noteEdit === null || noteEdit.side !== side
          ? null
          : h(NoteEditor, {
            key: `note-${noteEdit.id}`,
            draft: noteEdit,
            onChange: changeNote,
            onSave: () => saveNote(noteEdit.id),
            onCancel: cancelNote,
          })
      )

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
              type: 'button', className: `md-btn md-btn-small${dual ? ' md-hidden' : ''}`, disabled: !ready,
              title: format('readerZoomOut'), 'aria-label': format('readerZoomOut'),
              onClick: props.onZoomOut,
            }, '−'),
            h('button', {
              type: 'button', className: `md-btn md-btn-small${dual ? ' md-hidden' : ''}`, disabled: !ready,
              title: format('readerFit'),
              onClick: props.onFit,
            }, format('readerFit')),
            h('button', {
              type: 'button', className: `md-btn md-btn-small${dual ? ' md-hidden' : ''}`, disabled: !ready,
              title: format('readerZoomIn'), 'aria-label': format('readerZoomIn'),
              onClick: props.onZoomIn,
            }, '＋'),
            h('span', { className: `md-reader-scale${dual ? ' md-hidden' : ''}`, 'aria-hidden': true }, `${Math.round((reader.scale ?? 1) * 100)}%`)
          ),
          h('button', {
            type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
            'aria-label': format('toolsToggle'), title: format('toolsToggle'),
            onClick: () => setToolsOpen(value => !value),
          }, toolsOpen ? '⌃' : '⌄'),
          h('button', {
            type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
            'aria-label': format('previewClose'), title: format('previewClose'),
            onClick: props.onBack,
          }, '×')
        ),
        h('div', { className: 'md-reader-subbar', style: toolsOpen ? undefined : { display: 'none' } },
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
            h('button', {
              type: 'button', className: 'md-btn md-btn-small', 'aria-pressed': overlay ? 'true' : 'false',
              title: format('overlayHint'),
              onClick: () => {
                if (reader.variant === 'translated') return
                if (!overlay && !hasTranslation) {
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
              ? h('button', {
                type: 'button', className: 'md-btn md-btn-small md-blocks-toggle',
                'aria-pressed': autoBoxed ? 'true' : 'false',
                title: format(autoBoxed ? 'overlayBlocksCancelHint' : 'overlayBlocksHint'),
                onClick: () => { void maskAllBlocks() },
              }, autoBoxed ? format('overlayBlocksCancel') : format('overlayBlocks'))
              : null,
            h('select', {
              className: 'md-reader-lang md-reader-export',
              value: '',
              title: format('exportGroupHint'),
              'aria-label': format('exportGroup'),
              onChange: event => {
                const action = event.target.value
                event.target.value = ''
                if (action === 'page') void exportPage()
                else if (action === 'chapter') void exportChapter()
                else if (action === 'import') void importAnnots()
              },
            },
              h('option', { value: '' }, format('exportGroup')),
              h('option', { value: 'page' }, format('exportPage')),
              h('option', { value: 'chapter' }, format('exportChapter')),
              h('option', { value: 'import' }, format('importAnnots'))
            ),
            h('span', { className: 'md-reader-sep', 'aria-hidden': true }),
            h('select', {
              className: 'md-reader-lang',
              value: translateTarget,
              title: format('translateHint'),
              'aria-label': format('translateFor'),
              onChange: event => setTranslateTarget(event.target.value),
            },
              h('option', { value: 'zh' }, format('langZh')),
              h('option', { value: 'en' }, format('langEn'))
            ),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small',
              disabled: translating || reader.phase !== 'ready',
              title: format('translateHint'),
              onClick: () => {
                if (!window.confirm(format('translateCostConfirm'))) return
                if (hasTranslation && !window.confirm(format('translateOverwriteConfirm'))) return
                void runTranslate()
              },
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
        translateNote === '' ? null : h('div', { className: 'md-reader-note-reveal' },
          h('div', { className: 'md-reader-note', role: 'status' },
          h('span', null, translateNote),
          translating ? h('button', {
            type: 'button', className: 'md-btn md-btn-small',
            onClick: cancelTranslate,
          }, format('translateCancel')) : null,
          !translating && partialPages.length > 0
            ? h('button', {
              type: 'button', className: 'md-btn md-btn-small',
              title: format('translateResumeHint'),
              onClick: () => { void runTranslate(true) },
            }, format('translateResume'))
            : null,
          exportJob !== ''
            ? h('button', {
              type: 'button', className: 'md-btn md-btn-small',
              onClick: cancelExport,
            }, format('exportCancel'))
            : null,
          !translating && retryAction !== null
            ? h('button', {
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
              ? h('button', {
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
                  h('button', {
                    type: 'button', className: 'md-btn md-btn-small',
                    onClick: () => setDualLeftScale(value => Math.max(0.2, (value ?? dualFit.left ?? 1) / 1.2)),
                  }, '−'),
                  h('span', { className: 'md-reader-scale' }, String(Math.round((dualLeftScale ?? dualFit.left ?? 1) * 100)) + '%'),
                  h('button', {
                    type: 'button', className: 'md-btn md-btn-small',
                    onClick: () => setDualLeftScale(value => Math.min(3, (value ?? dualFit.left ?? 1) * 1.2)),
                  }, '+'),
                  h('button', {
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
                  h('button', {
                    type: 'button', className: 'md-btn md-btn-small',
                    onClick: () => setRightScale(value => Math.max(0.5, (value ?? dualFit.right ?? 1) - 0.1)),
                  }, '−'),
                  h('span', { className: 'md-reader-scale' }, String(Math.round((rightScale ?? dualFit.right ?? 1) * 100)) + '%'),
                  h('button', {
                    type: 'button', className: 'md-btn md-btn-small',
                    onClick: () => setRightScale(value => Math.min(3, (value ?? dualFit.right ?? 1) + 0.1)),
                  }, '+'),
                  h('button', {
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
                    h('button', { type: 'button', className: 'md-btn md-btn-small', onClick: props.onRetry }, format('readerRetry'))
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
                children: [
                  masksLayer,
                  annotLayer('main'),
                  h(BlockOverlay, { key: 'blocks', bookId: reader.bookId, code: reader.code, pageNumber: reader.page, show: showBlocks }),
                ],
                // Continuous mode paints the same layers on the page being read.
                overlay: masksLayer === null
                  ? annotLayer('main')
                  : [masksLayer, annotLayer('main')],
                overlayPage: visiblePage,
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
            railTool('select', 'annotSelect', 'M5 3l7 17 2-7 7-2z'),
            railTool('pen', 'annotPen', 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'),
            railTool('erase', 'annotErase', 'm7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21M22 21H7M5 11l9 9'),
            railTool('text', 'annotText', 'M4 6h16M12 6v13M9 19h6'),
            railTool('line', 'shapeLine', 'M4 20 20 4'),
            railTool('arrow', 'shapeArrow', 'M4 20 20 4M10 4h10v10'),
            railTool('rect', 'shapeRect', 'M4 5h16v14H4z'),
            railTool('diamond', 'shapeDiamond', 'M12 3 21 12 12 21 3 12z'),
            railTool('ellipse', 'shapeEllipse', 'M12 5c5 0 8 3 8 7s-3 7-8 7-8-3-8-7 3-7 8-7z'),
            railTool('mask', 'overlayToggle', 'M4 4h16v16H4zM8 4v16M16 4v16'),
            h('span', { className: 'md-rail-sep', 'aria-hidden': true }),
            h('button', {
              type: 'button', className: 'md-rail-btn',
              disabled: undoAvailable === 0,
              title: format('undoHint'), 'aria-label': format('undo'),
              onClick: undoEither,
            }, annotIcon('M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3')),
            h('button', {
              type: 'button', className: 'md-rail-btn',
              disabled: redoAvailable === 0,
              title: format('redoHint'), 'aria-label': format('redo'),
              onClick: redoEither,
            }, annotIcon('M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3')),
            h('button', {
              type: 'button', className: 'md-rail-btn',
              title: format('annotClearHint'), 'aria-label': format('annotClear'),
              onClick: clearAnnots,
            }, annotIcon('M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14'))
          ),
          railPanel && selection === null
            ? h('div', { className: 'md-rail-panel', 'data-side': railSide, style: railAnchor === null ? undefined : { top: `${railAnchor}px` } },
              h('div', { className: 'md-rail-panel-title' }, format('toolSettings')),
              annotTool === 'text'
                ? h(NoteStyleControls, { style: noteEdit ?? noteStyle, onChange: changeNoteStyle })
                : h(React.Fragment, null,
                  h('div', { className: 'md-note-style-row' },
                    h('span', { className: 'md-note-style-label' }, format('annotColor')),
                    ['#1f1f1f', '#e0554a', '#2f6df6', '#2ecc71'].map(color => h('button', {
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
        selection === null || selectedEntry === undefined
          ? null
          : h('div', { className: 'md-selection-panel', 'data-side': railSide },
            h('div', { className: 'md-selection-head' },
              h('span', null, format('selectionTitle')),
              h('button', {
                type: 'button', className: 'md-btn md-btn-small md-btn-ghost',
                'aria-label': format('previewClose'), onClick: () => setSelection(null),
              }, '×')
            ),
            selectedEntry.kind === 'text'
              ? h(React.Fragment, null,
                h(NoteStyleControls, { style: selectedEntry, onChange: patchSelection }),
                h('div', { className: 'md-note-style-row' },
                  h('span', { className: 'md-note-style-label' }, format('alignTitle')),
                  [['left', 'alignLeft'], ['center', 'alignCenter'], ['right', 'alignRight']].map(item => h('button', {
                    key: item[0],
                    type: 'button',
                    className: 'md-note-style-btn',
                    'data-on': (selectedEntry.textAlign ?? 'left') === item[0] ? 'true' : undefined,
                    onClick: () => patchSelection({ textAlign: item[0] }),
                  }, format(item[1])))
                )
              )
              : h(React.Fragment, null,
                h('div', { className: 'md-note-style-row' },
                  h('span', { className: 'md-note-style-label' }, format('annotColor')),
                  ['#1f1f1f', '#e0554a', '#2f6df6', '#2ecc71'].map(color => h('button', {
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
                      h('button', {
                        type: 'button', className: 'md-note-style-btn',
                        'data-on': selectedEntry.fill === undefined || selectedEntry.fill === '' ? 'true' : undefined,
                        onClick: () => patchSelection({ fill: '' }),
                      }, format('fillNone')),
                      ['#f2c94c', '#f28b82', '#aecbfa', '#b7e1cd'].map(color => h('button', {
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
                      h('button', {
                        type: 'button', className: 'md-note-style-btn',
                        'data-on': selectedEntry.fillStyle !== 'solid' ? 'true' : undefined,
                        onClick: () => patchSelection({ fillStyle: 'hachure' }),
                      }, format('fillHachure')),
                      h('button', {
                        type: 'button', className: 'md-note-style-btn',
                        'data-on': selectedEntry.fillStyle === 'solid' ? 'true' : undefined,
                        onClick: () => patchSelection({ fillStyle: 'solid' }),
                      }, format('fillSolid'))
                    ),
                    h('div', { className: 'md-note-style-row' },
                      h('span', { className: 'md-note-style-label' }, format('strokeStyleTitle')),
                      h('button', {
                        type: 'button', className: 'md-note-style-btn',
                        'data-on': (selectedEntry.strokeStyle ?? 'solid') === 'solid' ? 'true' : undefined,
                        onClick: () => patchSelection({ strokeStyle: 'solid' }),
                      }, format('styleSolid')),
                      h('button', {
                        type: 'button', className: 'md-note-style-btn',
                        'data-on': selectedEntry.strokeStyle === 'dashed' ? 'true' : undefined,
                        onClick: () => patchSelection({ strokeStyle: 'dashed' }),
                      }, format('styleDashed')),
                      h('button', {
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
              h('button', { type: 'button', className: 'md-btn md-btn-small', onClick: duplicateSelection }, format('duplicateSelection')),
              h('button', { type: 'button', className: 'md-btn md-btn-small', onClick: () => reorderSelection(true) }, format('bringFront')),
              h('button', { type: 'button', className: 'md-btn md-btn-small', onClick: () => reorderSelection(false) }, format('sendBack'))
            ),
            h('button', {
              type: 'button', className: 'md-btn md-btn-small md-selection-delete',
              onClick: deleteSelection,
            }, format('selectionDelete'))
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
            typeof chapter.pdfPath === 'string' && chapter.pdfPath !== ''
              ? h('button', {
                type: 'button', className: 'md-btn md-btn-small',
                title: chapter.pdfPath,
                onClick: () => props.onCopyPath(chapter.pdfPath),
              }, format('copyPath'))
              : null,
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
            }),
            visible < chapters.length
              ? h('li', { key: '__more', className: 'md-chapters-more', ref: sentinel },
                h('button', {
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
@font-face { font-family: 'Xiaolai'; src: url('/pdfdesk/vendor/fonts/zhhand/Xiaolai-Regular.ttf') format('truetype'); font-weight: 400; font-style: normal; font-display: swap; }
.md-root { position: relative; flex: 1 1 auto; height: 100%; min-height: 0; display: flex; box-sizing: border-box; container-type: inline-size; container-name: pdfdesk; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); font-size: 14px; line-height: 1.5; }
.md-inner { height: 100%; width: 100%; max-width: 1040px; margin: 0 auto; padding: 0 clamp(18px, 4cqw, 40px); box-sizing: border-box; display: flex; flex-direction: column; min-width: 0; }
.md-head { flex: none; display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 28px 0 14px; }
.md-title { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: .01em; }
.md-subtitle { margin: 4px 0 0; font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.md-head-actions { display: flex; align-items: center; gap: 8px; }
.md-settings { position: relative; }
.md-settings-version { padding: 4px 8px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.md-settings-section { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l2); }
.md-settings-heading { margin: 0; font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.md-settings-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12.5px; }
.md-settings-input { flex: 1 1 auto; min-width: 0; font: inherit; font-size: 12px; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.md-settings-tabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 0 6px; }
.md-tab-btn[data-on='true'] { background: var(--dsw-alias-interactive-bg-hover); border-color: var(--dsw-alias-brand-primary); font-weight: 600; }
.md-settings-note { margin: 0; font-size: 12px; color: var(--dsw-alias-brand-primary); }
.md-settings-actions { display: flex; gap: 8px; padding-top: 4px; }
.md-shortcut-list { display: flex; flex-direction: column; gap: 4px; }
.md-shortcut-row { gap: 8px; }
.md-shortcut-name { flex: 1 1 auto; min-width: 0; }
.md-shortcut-key { flex: 0 0 auto; min-width: 88px; padding: 2px 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-card-fill); border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; text-align: center; white-space: nowrap; }
.md-shortcut-row .md-btn { flex: 0 0 auto; }
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
.md-btn-primary { color: var(--dsw-alias-label-inverse, #fff); background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.md-btn-primary:hover { filter: brightness(1.06); }
.md-home .md-shelf-head .md-heading { font-size: 18px; }
.md-home .md-library-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.md-home .md-library-list:empty { display: none; }
.md-home .md-library { position: relative; padding: 20px 22px 18px; border-radius: 16px; background: var(--dsw-alias-card-fill); border: 1px solid var(--dsw-alias-border-l2); transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
.md-home .md-library:hover { transform: translateY(-1px); border-color: var(--dsw-alias-border-l4); box-shadow: 0 10px 28px rgba(0, 0, 0, .06); }
.md-home .md-library-active { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, var(--dsw-alias-card-fill)); }
.md-home .md-library-name { font-size: 15.5px; font-weight: 600; letter-spacing: -.01em; }
.md-home .md-library .md-path { margin-top: 10px; font-size: 12px; }
.md-home .md-library-actions { position: absolute; top: 14px; right: 14px; opacity: 0; transition: opacity .16s ease; }
.md-home .md-library:hover .md-library-actions, .md-home .md-library:focus-within .md-library-actions { opacity: 1; }
.md-home .md-library-add { max-width: none; width: 100%; padding: 14px 16px; border-radius: 16px; gap: 10px; background: transparent; border: 1px solid var(--dsw-alias-border-l2); }
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
.md-home .md-library-toolscroll { position: static; display: flex; flex-direction: row; gap: 14px; overflow-x: auto; overflow-y: hidden; padding: 2px 2px 16px; scroll-snap-type: x mandatory; scrollbar-width: thin; scrollbar-color: var(--dsw-alias-border-l4) transparent; }
.md-home .md-library-toolscroll::-webkit-scrollbar { height: 8px; }
.md-home .md-library-toolscroll::-webkit-scrollbar-track { background: var(--dsw-alias-interactive-bg-hover-solid); border-radius: 4px; }
.md-home .md-library-toolscroll::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l4); border-radius: 4px; }
.md-home .md-library-toolscroll > .md-subheading { display: none; }
.md-home .md-tool-card { flex: 0 0 300px; scroll-snap-align: start; display: flex; flex-direction: column; gap: 8px; padding: 18px 20px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 16px; background: var(--dsw-alias-card-fill); }
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
.md-manual-steps li::before { counter-increment: mdstep; content: counter(mdstep); position: absolute; left: 0; top: 3px; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 650; color: var(--dsw-alias-label-inverse, #fff); background: var(--dsw-alias-brand-primary); }
.md-manual-block { display: flex; flex-direction: column; gap: 10px; padding-top: 22px; border-top: 1px solid var(--dsw-alias-border-l2); }
.md-manual-heading { margin: 0; font-size: 13px; font-weight: 600; letter-spacing: .01em; color: var(--dsw-alias-label-primary); }
.md-manual-text { margin: 0; font-size: 13.5px; line-height: 1.8; color: var(--dsw-alias-label-secondary); }
.md-manual-list { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; line-height: 1.8; color: var(--dsw-alias-label-secondary); }
.md-manual-tree { margin: 0; padding: 14px 16px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover-solid); border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; overflow: auto; white-space: pre; }
.md-manual-sub { margin-top: 4px; padding: 10px 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; }
.md-manual-sub-summary { cursor: pointer; font-size: 12.5px; font-weight: 550; color: var(--dsw-alias-label-primary); }
.md-manual-sub[open] .md-manual-sub-summary { margin-bottom: 8px; }
.md-manual-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.md-manual-code { display: block; max-height: 130px; overflow: auto; margin: 0; padding: 10px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; line-height: 1.6; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover-solid); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; white-space: pre-wrap; word-break: break-all; }
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
.md-reader-tools .md-btn { white-space: nowrap; flex: 0 0 auto; }
.md-reader-page { width: 64px; font: inherit; font-size: 12.5px; text-align: center; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 6px; padding: 3px 6px; }
.md-reader-of { font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.md-reader-scale { min-width: 40px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); text-align: right; font-variant-numeric: tabular-nums; }
.md-reader-sep { width: 1px; height: 18px; background: var(--dsw-alias-border-l2); }
.md-reader-stage { flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; align-items: flex-start; justify-content: safe center; padding: 20px 24px 32px; }
.md-reader-stage[data-mode="continuous"] { flex-direction: column; align-items: center; justify-content: flex-start; }
.md-reader-single { display: flex; justify-content: safe center; flex: 0 0 auto; width: max-content; margin: 0 auto; }
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
.md-annot { position: absolute; inset: 0; z-index: 6; pointer-events: none; touch-action: none; }
.md-annot[data-tool="pen"], .md-annot[data-tool="erase"], .md-annot[data-tool="text"] { pointer-events: auto; }
.md-annot[data-tool="line"], .md-annot[data-tool="arrow"], .md-annot[data-tool="rect"], .md-annot[data-tool="diamond"], .md-annot[data-tool="ellipse"] { pointer-events: auto; cursor: crosshair; }
.md-annot[data-tool="select"] { pointer-events: auto; cursor: default; }
.md-annot-text.md-annot-selected { outline: 2px solid #2f6df6; outline-offset: 3px; border-radius: 3px; }
/* The vertical tool rail: collected PDF tools, revealed only while the pointer
   is on the page edge, with a short fade/slide so it does not pop. */
.md-rail-wrap { position: absolute; top: 0; bottom: 0; z-index: 40; width: 30px; display: flex; align-items: center; justify-content: center; pointer-events: auto; }
.md-rail-tab { position: absolute; top: 50%; transform: translateY(-50%); width: 18px; height: 58px; border-radius: 6px 0 0 6px; display: flex; align-items: center; justify-content: center; font-size: 15px; line-height: 1; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-right: none; box-shadow: 0 2px 10px rgba(0, 0, 0, .08); opacity: .9; z-index: 39; pointer-events: none; transition: opacity .18s ease; }
.md-rail-tab[data-side="right"] { right: 0; }
.md-rail-tab[data-side="left"] { left: 0; border-radius: 0 6px 6px 0; border-right: 1px solid var(--dsw-alias-border-l3); border-left: none; }
.md-rail-wrap[data-side="right"] { right: 0; }
.md-rail-wrap[data-side="left"] { left: 0; }
.md-rail { display: flex; flex-direction: column; gap: 4px; padding: 6px 4px; max-height: 78vh; overflow-y: auto; background: color-mix(in srgb, var(--dsw-alias-bg-base) 92%, transparent); border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; box-shadow: 0 8px 24px rgba(0, 0, 0, .12); opacity: 0; transform: translateX(10px); transition: opacity .18s ease, transform .18s ease; pointer-events: none; }
.md-rail-wrap[data-side="left"] .md-rail { transform: translateX(-10px); }
.md-rail-wrap:hover .md-rail, .md-rail:hover, .md-rail:focus-within, .md-rail[data-open="true"] { opacity: 1; transform: none; pointer-events: auto; }
.md-rail-btn { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.md-rail-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.md-rail-btn[aria-pressed="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent); color: var(--dsw-alias-brand-primary); }
.md-rail-btn:disabled { opacity: .35; cursor: default; }
.md-rail-sep { height: 1px; margin: 3px 4px; background: var(--dsw-alias-border-l2); }
.md-selection-panel { position: absolute; top: 64px; z-index: 15; width: min(280px, 86vw); display: flex; flex-direction: column; gap: 8px; padding: 10px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 10px; box-shadow: 0 10px 30px rgba(0, 0, 0, .18); }
.md-selection-panel[data-side="right"] { right: 58px; }
.md-selection-panel[data-side="left"] { left: 58px; }
.md-selection-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 550; color: var(--dsw-alias-label-primary); }
.md-selection-delete { align-self: flex-start; color: var(--dsw-alias-label-error, #c0392b); }
.md-selection-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.md-reader[data-rail="right"] .md-reader-stage { padding-right: 58px; }
.md-reader[data-rail="left"] .md-reader-stage { padding-left: 58px; }
.md-rail-panel { position: absolute; top: 50%; transform: translateY(-50%); width: 260px; display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; background: color-mix(in srgb, var(--dsw-alias-bg-base) 96%, transparent); backdrop-filter: blur(10px); border: 1px solid var(--dsw-alias-border-l3); border-radius: 12px; box-shadow: 0 12px 34px rgba(0, 0, 0, .16); z-index: 42; pointer-events: auto; }
.md-rail-panel[data-side="right"] { right: 44px; }
.md-rail-panel[data-side="left"] { left: 44px; }
.md-rail-panel-title { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); padding-bottom: 8px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
/* The right-side preview gets the same edge rail, but only its core tools. */
.md-side-rail-wrap { top: 44px; bottom: 0; }
.md-side-rail-tab { top: calc(50% + 22px); }
.md-shape-handles { position: absolute; inset: 0; pointer-events: none; }
.md-shape-handle { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; background: var(--dsw-alias-bg-base); border: 1.5px solid #2f6df6; border-radius: 2px; pointer-events: auto; cursor: nwse-resize; }
.md-annot[data-tool="pen"] { cursor: crosshair; }
.md-annot[data-tool="text"] { cursor: text; }
.md-annot[data-tool="erase"] { cursor: cell; }
.md-annot-ink { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
/* A text note is transparent: it sits straight on the page, and a faint outline
   appears only on hover, when it can be double-clicked for editing. */
.md-annot-text { position: absolute; max-width: 70%; font-size: 14px; font-weight: 600; line-height: 1.35; white-space: pre-wrap; pointer-events: none; padding: 0 2px; border-radius: 4px; }
/* With no tool picked, a note is clickable so a double-click can edit it. */
.md-annot[data-tool=""] .md-annot-text { pointer-events: auto; cursor: text; }
.md-annot[data-tool=""] .md-annot-text:hover { box-shadow: 0 0 0 1px color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); }
/* The in-place editor is transparent too: only the text and the caret show.
   The style row never takes focus, so changing a font cannot blur-save. */
.md-note-editor { position: absolute; z-index: 8; display: flex; flex-direction: column; gap: 2px; width: 280px; min-width: 160px; padding: 2px; border: 1px dashed color-mix(in srgb, var(--dsw-alias-brand-primary) 42%, transparent); border-radius: 6px; pointer-events: auto; }
.md-note-style { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; padding: 0; background: transparent; box-shadow: none; }
/* Text parameters now live in the toolbar: a nested menu, not a box on the page. */
.md-note-style-wrap { position: relative; display: inline-flex; align-items: center; }
.md-note-style-popover { position: absolute; top: calc(100% + 6px); right: 0; z-index: 30; width: min(280px, 82vw); display: flex; flex-direction: column; gap: 8px; padding: 10px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l3); border-radius: 10px; box-shadow: 0 10px 30px rgba(0, 0, 0, .18); }
.md-note-style-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.md-note-style-label { min-width: 34px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.md-note-style-btn { min-width: 20px; height: 20px; padding: 0 4px; font: inherit; font-size: 11px; line-height: 1; color: var(--dsw-alias-label-secondary); background: transparent; border: 1px solid transparent; border-radius: 4px; cursor: pointer; text-shadow: 0 1px 2px color-mix(in srgb, var(--dsw-alias-bg-base) 90%, transparent); }
.md-note-style-btn:hover { background: color-mix(in srgb, var(--dsw-alias-bg-base) 70%, transparent); }
.md-note-style-btn[data-on="true"] { color: var(--dsw-alias-label-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); }
.md-note-size-range { width: 74px; height: 16px; margin: 0; padding: 0; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }
.md-note-size-value { min-width: 30px; font-size: 10px; line-height: 1; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px color-mix(in srgb, var(--dsw-alias-bg-base) 90%, transparent); }
.md-note-style-sep { width: 1px; height: 14px; margin: 0 2px; background: color-mix(in srgb, var(--dsw-alias-border-l3) 70%, transparent); }
.md-note-color { width: 14px; height: 14px; padding: 0; border: 1px solid color-mix(in srgb, #000 25%, transparent); border-radius: 50%; cursor: pointer; }
.md-note-color[data-on="true"] { box-shadow: 0 0 0 2px var(--dsw-alias-bg-base), 0 0 0 3px var(--dsw-alias-brand-primary); }
.md-note-input { box-sizing: border-box; width: 100%; min-height: 28px; max-height: 240px; overflow: auto; line-height: 1.35; padding: 2px; border-radius: 4px; border: none; background: transparent; box-shadow: none; outline: none; caret-color: currentColor; }
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
.md-reader-note-overlay { color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-label-secondary)); }
.md-mask { position: absolute; box-sizing: border-box; overflow: visible; border: 1px dashed rgba(40, 140, 235, .9); }
/* The image is clipped by the inner wrapper, so the handles on the border are
   not cut off. */
.md-mask-clip { position: absolute; inset: 0; overflow: hidden; }
.md-mask img { position: absolute; max-width: none; user-select: none; pointer-events: none; }
.md-mask-boxes { position: absolute; inset: 0; pointer-events: auto; }
.md-mask-boxes .md-mask { pointer-events: none; }
.md-mask-boxes .md-mask-active { border-style: solid; }
.md-mask-handle { position: absolute; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 2px; background: var(--dsw-alias-bg-base); border: 1px solid rgba(40, 140, 235, .95); box-shadow: 0 1px 2px rgba(0, 0, 0, .18); pointer-events: auto; opacity: 0; transition: opacity .12s ease; }
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
.md-mask-grip { position: absolute; left: 50%; top: 6px; transform: translateX(-50%); display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 5px; background: color-mix(in srgb, var(--dsw-alias-bg-base) 92%, transparent); border: 1px solid rgba(40, 140, 235, .9); color: rgba(40, 140, 235, .95); cursor: move; pointer-events: auto; opacity: 0; transition: opacity .12s ease; }
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
.md-desk-done { background: #2ecc71; }
.md-desk-error { background: #e74c3c; }
.md-desk-spin { background: transparent; border: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 35%, transparent); border-top-color: var(--dsw-alias-brand-primary); width: 8px; height: 8px; animation: md-desk-spin .8s linear infinite; }
@keyframes md-desk-spin { to { transform: rotate(360deg); } }
.md-reader-coltitle { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-right: auto; }
.md-reader-page-wrap { position: relative; display: inline-block; max-width: 100%; }
.md-blocklayer { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
.md-blockbox { position: absolute; box-sizing: border-box; border: 1px dashed rgba(235, 70, 70, .85); background: transparent; }
.md-blockbox[data-kind="heading"] { border-color: rgba(60, 130, 235, .95); background: transparent; }
.md-blockbox[data-kind="formula"] { border-color: rgba(40, 160, 90, .95); background: transparent; }
.md-reader-continuous { display: flex; flex-direction: column; align-items: safe center; gap: 18px; width: 100%; }
.md-reader-slot { display: flex; flex-direction: column; align-items: safe center; min-height: 240px; position: relative; }
.md-reader-ghost { justify-content: center; opacity: .55; }
.md-reader-page-no { padding-bottom: 4px; font-size: 11px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.md-reader-subbar { flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 16px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.md-reader-modes { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.md-reader-subbar .md-btn { white-space: nowrap; flex: 0 0 auto; }
.md-reader-export { min-width: 92px; font-size: 12px; }
.md-reader-modes .md-btn[aria-pressed="true"] { border-color: var(--dsw-alias-border-l4); background: var(--dsw-alias-interactive-bg-hover-solid); color: var(--dsw-alias-label-primary); }
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
.md-side-handle { position: absolute; top: 6px; right: 8px; z-index: 7; opacity: 0; transition: opacity .12s ease; font-size: 15px; line-height: 1; padding: 2px 9px; background: color-mix(in srgb, var(--dsw-alias-card-fill) 90%, transparent); }
.md-side:hover .md-side-handle, .md-side-handle:focus-visible { opacity: 1; }
.md-side[data-toolbar='hidden'] .md-side-body > .md-reader-stage { padding-top: 32px; }
.md-side-gap { flex: 1 1 auto; }
.md-side-body { flex: 1 1 auto; min-height: 0; display: flex; }
/* Horizontal padding must stay in step with the width minus twenty in
   SidePdfView's measurement; the stable gutter keeps that measurement from
   moving when the page grows a scrollbar. */
.md-side-body > .md-reader-stage { padding: 8px 10px 16px; scrollbar-gutter: stable; }
.md-side .md-side-body > .md-reader-stage { padding-right: 40px; }
/* The developer readout (Ctrl+Alt+D): one small overlay, never takes a click. */
.md-hud { position: absolute; left: 8px; bottom: 8px; z-index: 60; margin: 0; padding: 6px 8px; max-width: calc(100% - 16px); overflow: hidden; white-space: pre-wrap; font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-card-fill, var(--dsw-alias-bg-base)); border: 1px solid var(--dsw-alias-border-l3); border-radius: 6px; pointer-events: none; opacity: 0.94; }
/* The preview's action list when the shared context menu service is absent. */
.md-fallback-backdrop { position: fixed; inset: 0; z-index: 80; }
.md-fallback-menu { position: fixed; min-width: 190px; max-width: 240px; max-height: 70vh; overflow: auto; padding: 4px; background: var(--dsw-alias-card-fill, var(--dsw-alias-bg-base)); border: 1px solid var(--dsw-alias-border-l3); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16); }
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
/* The side preview's own ink: only the tool layer takes pointer events. */
.md-annot-edit { pointer-events: auto; cursor: crosshair; touch-action: none; }
.md-annot-edit[data-tool='erase'] { cursor: cell; }
.md-annot-edit[data-tool='mask'] { cursor: copy; }
/* The reader's overlay boxes, read-only: below the ink, above the page. */
.md-masks-readonly { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
.md-masks-readonly .md-mask { border-color: color-mix(in srgb, rgb(40, 140, 235) 55%, transparent); }
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
      const [mode, setMode] = useState('single')
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
      // What the tab was opened with, then what the reader switched to.
      const [shownVariant, setShownVariant] = useState(variant)
      const [phase, setPhase] = useState('loading')
      const [error, setError] = useState('')
      const [docRev, setDocRev] = useState(0)
      const [annotRev, setAnnotRev] = useState(0)
      const [strokes, setStrokes] = useState([])
      const [masks, setMasks] = useState([])
      // The overlay/translated page the boxes reveal; loaded only when a box exists.
      const [maskDoc, setMaskDoc] = useState(null)
      const maskTask = useRef(null)
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
      const [draftStroke, setDraftStroke] = useState(null)
      const [shapeDraft, setShapeDraft] = useState(null)
      const [maskDraft, setMaskDraft] = useState(null)
      // The note being typed in the preview; `index` is its slot in `strokes`,
      // or -1 for one that does not exist yet. The text itself stays inside the
      // editor until saved (`noteText` is what a save reads).
      const [noteEdit, setNoteEdit] = useState(null)
      // Defaults for the next note; the toolbar's text menu edits this, or the
      // open draft when there is one.
      const [noteStyle, setNoteStyle] = useState({ fontSize: NOTE_SIZES[0], fontFamily: 'normal', color: '#1f1f1f', textAlign: 'left' })
      const noteEditRef = useRef(null)
      noteEditRef.current = noteEdit
      const noteSeq = useRef(0)
      const noteText = useRef('')
      const strokesRef = useRef(strokes)
      const masksRef = useRef(masks)
      strokesRef.current = strokes
      masksRef.current = masks
      const draftRef = useRef(null)
      const maskDraftRef = useRef(null)
      const maskStartRef = useRef(null)
      const erasingRef = useRef(false)
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
        let task = null
        setPhase('loading')
        setError('')
        void (async () => {
          try {
            const lib = await loadPdfjs()
            if (cancelled) return
            const query = new URLSearchParams({ book: bookId, code })
            if (shownVariant !== '') query.set('variant', shownVariant)
            if (docRev > 0) query.set('rev', String(docRev))
            const url = new URL(`pdfdesk/pdf?${query.toString()}`, document.baseURI).href
            task = lib.getDocument({ url, isEvalSupported: false, ...pdfAssetUrls() })
            const loaded = await task.promise
            if (cancelled) {
              try { void Promise.resolve(task.destroy()).catch(() => {}) } catch { /* already gone */ }
              return
            }
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
          if (task !== null) {
            try { void Promise.resolve(task.destroy()).catch(() => {}) } catch { /* already gone */ }
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
          const task = maskTask.current
          maskTask.current = null
          if (task !== null) {
            try { void Promise.resolve(task.destroy()).catch(() => {}) } catch { /* already gone */ }
          }
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
              const query = new URLSearchParams({ book: bookId, code, variant: name })
              if (docRev > 0) query.set('rev', String(docRev))
              const url = new URL(`pdfdesk/pdf?${query.toString()}`, document.baseURI).href
              const task = lib.getDocument({ url, isEvalSupported: false, ...pdfAssetUrls() })
              try {
                const loaded = await task.promise
                if (cancelled) {
                  try { void Promise.resolve(task.destroy()).catch(() => {}) } catch { /* already gone */ }
                  return
                }
                maskTask.current = task
                maskReady.current = key
                maskLoading.current = ''
                setMaskDoc(loaded)
                return
              } catch {
                try { void Promise.resolve(task.destroy()).catch(() => {}) } catch { /* already gone */ }
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
      const historyKeyOf = inkStore.historyKeyOf
      const [, bumpHistory] = useState(0)
      const commitStrokes = next => {
        const rev = inkStore.save(pageRef.current, 'annots', next, currentSnapshot())
        if (rev === null) return
        bumpHistory(value => value + 1)
        strokesRef.current = next
        setStrokes(next)
        seenAnnotRev.current = rev
      }
      const commitMasks = next => {
        const rev = inkStore.save(pageRef.current, 'masks', next, currentSnapshot())
        if (rev === null) return
        bumpHistory(value => value + 1)
        masksRef.current = next
        setMasks(next)
        seenAnnotRev.current = rev
      }
      // Undo/redo restore ink and boxes together, then announce once.
      const restorePage = snapshot => {
        strokesRef.current = snapshot.annots
        masksRef.current = snapshot.masks
        setStrokes(snapshot.annots)
        setMasks(snapshot.masks)
        seenAnnotRev.current = inkStore.restore(pageRef.current, snapshot)
      }
      const currentSnapshot = () => snapshotOf(strokesRef.current, masksRef.current)
      const undoPage = () => {
        const previous = inkStore.undo(pageRef.current, currentSnapshot())
        if (previous === null) return
        restorePage(previous)
        bumpHistory(value => value + 1)
      }
      const redoPage = () => {
        const next = inkStore.redo(pageRef.current, currentSnapshot())
        if (next === null) return
        restorePage(next)
        bumpHistory(value => value + 1)
      }
      const historyCounts = inkStore.depth(page)

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

      // Point in page coordinates (0..1), measured against the editing layer,
      // which is exactly the page box at any zoom. The box width is remembered so
      // the eraser's pixel tolerance can become page units.
      const pointOf = event => {
        const node = boxRef.current
        const point = inkPointOf(event, node)
        if (point === null) return null
        const rect = node.getBoundingClientRect()
        boxSize.current = { width: rect.width, height: rect.height }
        return point
      }
      const toleranceFor = widthPx => inkReach(widthPx, boxSize.current.width)
      const hitTest = (entry, point) => inkHit(entry, point, toleranceFor)
      const eraseAt = point => {
        const next = strokesRef.current.filter(entry => !hitTest(entry, point))
        if (next.length !== strokesRef.current.length) commitStrokes(next)
      }
      const openNote = point => {
        const list = strokesRef.current
        const found = list.findIndex(entry => entry.kind === 'text' && hitTest(entry, point))
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
          })
          return
        }
        noteText.current = ''
        setNoteEdit({
          id: noteSeq.current,
          index: -1,
          x: point[0],
          y: point[1],
          text: '',
          color: noteStyle.color,
          fontSize: noteStyle.fontSize,
          fontFamily: noteStyle.fontFamily,
          textAlign: noteStyle.textAlign ?? 'left',
        })
      }
      const changeNote = text => {
        noteText.current = text
      }
      const changeNoteStyle = patch => {
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
      const editDown = event => {
        if (tool === '') return
        const point = pointOf(event)
        if (point === null) return
        event.preventDefault()
        event.stopPropagation()
        if (tool === 'erase') {
          erasingRef.current = true
          eraseAt(point)
          return
        }
        if (tool === 'mask') {
          maskStartRef.current = point
          maskDraftRef.current = { x: point[0], y: point[1], w: 0, h: 0 }
          setMaskDraft(maskDraftRef.current)
          return
        }
        if (tool === 'text') {
          // A click always starts a note where it lands: an editor left open is
          // saved first, so a page can hold as many notes as the reader places.
          if (noteEditRef.current !== null) saveNote(noteEditRef.current.id)
          openNote(point)
          return
        }
        if (SHAPE_TOOLS.includes(tool)) {
          setShapeDraft({
            shape: tool,
            x0: point[0], y0: point[1], x1: point[0], y1: point[1],
            color: '#1f1f1f',
            width: 2,
          })
          return
        }
        draftRef.current = { kind: 'stroke', points: [point], color: '#1f1f1f', width: 2 }
        setDraftStroke(draftRef.current)
      }
      const editMove = event => {
        if (tool === 'erase' && erasingRef.current) {
          const point = pointOf(event)
          if (point === null) return
          event.preventDefault()
          eraseAt(point)
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
        if (shapeDraft !== null) {
          const point = pointOf(event)
          if (point === null) return
          setShapeDraft(current => (current === null ? null : { ...current, x1: point[0], y1: point[1] }))
          return
        }
        if (draftRef.current === null) return
        const point = pointOf(event)
        if (point === null) return
        const current = draftRef.current
        const last = current.points[current.points.length - 1]
        if (last !== undefined && Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.0025) return
        draftRef.current = { ...current, points: [...current.points, point] }
        setDraftStroke(draftRef.current)
      }
      const editUp = () => {
        erasingRef.current = false
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
        if (shapeDraft !== null) {
          const draft = shapeDraft
          setShapeDraft(null)
          const x = Math.min(draft.x0, draft.x1)
          const y = Math.min(draft.y0, draft.y1)
          const w = Math.abs(draft.x1 - draft.x0)
          const h = Math.abs(draft.y1 - draft.y0)
          if (w > 0.008 || h > 0.008) {
            commitStrokes([...strokesRef.current, {
              kind: 'shape',
              shape: draft.shape,
              x, y, w, h,
              x0: draft.x0, y0: draft.y0, x1: draft.x1, y1: draft.y1,
              color: draft.color,
              width: draft.width,
              seed: Math.floor(Math.random() * 2147483647),
            }])
          }
          return
        }
        const draft = draftRef.current
        draftRef.current = null
        setDraftStroke(null)
        if (draft !== null && draft.points.length > 1) commitStrokes([...strokesRef.current, draft])
      }
      const toggleTool = name => setTool(current => (current === name ? '' : name))

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
          if (node !== undefined && node !== null && typeof node.scrollIntoView === 'function') {
            node.scrollIntoView({ block: 'start' })
          }
        }
        jumpTo()
        setTimeout(jumpTo, 320)
        setTimeout(() => { jumping.current = false }, 700)
      }, [])

      useEffect(() => {
        if (mode !== 'continuous' || phase !== 'ready') return
        scrollToPage(displayPageRef.current)
        // The page is read but not watched: pages reported by scrolling must not
        // scroll the column again. `jump` marks the explicit moves.
      }, [jump, mode, phase, scrollToPage])

      // Where this preview is, for the reader; its zoom never travels back. The
      // page does not travel this way: it moves through setChapterPage.
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
          if (state.mode === 'single' || state.mode === 'continuous') setMode(state.mode)
          if (state.variant === '' || state.variant === 'translated') setShownVariant(state.variant)
          if (typeof state.docRev === 'number') setDocRev(current => (state.docRev > current ? state.docRev : current))
          const annot = Number(state.annotRev) || 0
          if (annot > seenAnnotRev.current) {
            seenAnnotRev.current = annot
            setAnnotRev(annot)
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
      const ink = strokes.filter(entry => entry.kind !== 'text' && entry.kind !== 'shape')
      const shapes = strokes.filter(entry => entry.kind === 'shape')
      const notes = strokes.filter(entry => entry.kind === 'text')
      const annotLayer = h('div', { className: 'md-annot md-annot-readonly', 'aria-hidden': true },
        h('svg', {
          className: 'md-annot-ink',
          viewBox: '0 0 1 1',
          preserveAspectRatio: 'none',
        },
          ink.map((stroke, index) => h('polyline', {
            key: index,
            points: (stroke.points ?? []).map(point => `${point[0]},${point[1]}`).join(' '),
            fill: 'none',
            stroke: stroke.color ?? '#e0554a',
            strokeWidth: stroke.width ?? 2,
            opacity: stroke.opacity ?? 1,
            vectorEffect: 'non-scaling-stroke',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          })),
          shapes.map((entry, index) => h(ShapeMark, {
            key: `shape-${index}`,
            entry,
            roughness: shapeRoughness,
          }))),
        notes.map((entry, index) => h('div', {
          key: `text-${index}`,
          className: 'md-annot-text',
          style: {
            left: `${entry.x * 100}%`,
            top: `${entry.y * 100}%`,
            color: entry.color ?? '#e0554a',
            fontSize: Number.isFinite(entry.fontSize) ? `${entry.fontSize}px` : undefined,
            fontFamily: typeof entry.fontFamily === 'string' ? (NOTE_FONTS[entry.fontFamily] ?? undefined) : undefined,
            textAlign: typeof entry.textAlign === 'string' ? entry.textAlign : 'left',
            opacity: entry.opacity ?? 1,
          },
        }, entry.text)))

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
      const editLayer = tool === ''
        ? null
        : h('div', {
          className: 'md-annot md-annot-edit',
          'data-tool': tool,
          ref: boxRef,
          onPointerDown: editDown,
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
              onChange: changeNote,
              onSave: () => saveNote(noteEdit.id),
              onCancel: cancelNote,
            }))

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
        undo: historyCounts.undo, redo: historyCounts.redo,
        tabActions: info.tab.actions,
      }
      // The menu resolves once per target kind; reading the actions from a ref
      // keeps it from capturing a stale page's undo stack.
      const historyActions = useRef({ undo: undoPage, redo: redoPage })
      historyActions.current = { undo: undoPage, redo: redoPage }
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
              { id: 'erase', label: `${check(state.tool === 'erase')}${format('annotErase')}`, run: () => toggleTool('erase') },
              { id: 'text', label: `${check(state.tool === 'text')}${format('annotText')}`, run: () => toggleTool('text') },
              { id: 'mask', label: `${check(state.tool === 'mask')}${format('overlayToggle')}`, run: () => toggleTool('mask') },
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
            ],
          },
          {
            id: 'mode',
            label: format(state.mode === 'single' ? 'readerModeContinuous' : 'readerModeSingle'),
            separatorBefore: true,
            run: () => setMode(state.mode === 'single' ? 'continuous' : 'single'),
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
        ]
        // The action bodies read `menuState`, so only the constructors matter.
      }, [fitToColumn, goPage, toggleAutoFit, toggleFollow, zoomTo])

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

      useEffect(() => {
        if (bookId === '' || code === '') return undefined
        const key = `${bookId}:${code}`
        const provider = () => menuActions()
        sideMenuProviders.set(key, provider)
        return () => {
          if (sideMenuProviders.get(key) === provider) sideMenuProviders.delete(key)
        }
      }, [bookId, code, menuActions])

      const body = target === null
        ? h('div', { className: 'md-reader-state', role: 'alert' }, format('sideForeign'))
        : phase === 'error'
          ? h('div', { className: 'md-reader-state md-state-error', role: 'alert' },
            h('div', null, error === '' ? format('readerFailed') : error),
            h('div', { className: 'md-state-actions' },
              h('button', {
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
              children: masksLayer === null
                ? (editLayer === null ? annotLayer : [annotLayer, editLayer])
                : (editLayer === null ? [masksLayer, annotLayer] : [masksLayer, annotLayer, editLayer]),
              // Continuous mode has no single page box: the same layers ride on
              // the page being read, so drawing and boxes work there too.
              overlay: masksLayer === null
                ? (editLayer === null ? annotLayer : [annotLayer, editLayer])
                : (editLayer === null ? [masksLayer, annotLayer] : [masksLayer, annotLayer, editLayer]),
              overlayPage: displayPage,
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
          ? h('button', {
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
          h('button', {
            type: 'button',
            className: 'md-btn md-btn-small',
            title: format('readerPrev'),
            'aria-label': format('readerPrev'),
            disabled: page <= 1 || phase !== 'ready',
            onClick: () => goPage(page - 1),
          }, '‹'),
          gotoOpen
            ? h('input', {
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
            : h('button', {
              type: 'button',
              className: 'md-btn md-btn-small md-side-count',
              title: format('sideGotoHint'),
              'aria-label': format('sideMenuGoto'),
              disabled: count === 0 || phase !== 'ready',
              onClick: () => setGotoOpen(true),
            }, count === 0 ? String(page) : `${page} / ${count}`),
          h('button', {
            type: 'button',
            className: 'md-btn md-btn-small',
            title: format('readerNext'),
            'aria-label': format('readerNext'),
            disabled: count === 0 || page >= count || phase !== 'ready',
            onClick: () => goPage(page + 1),
          }, '›'),
          h('button', {
            type: 'button',
            className: 'md-btn md-btn-small',
            title: format('readerMode'),
            'aria-label': format('readerMode'),
            'aria-pressed': mode === 'continuous' ? 'true' : 'false',
            onClick: () => setMode(mode === 'single' ? 'continuous' : 'single'),
          }, mode === 'single' ? format('readerModeSingle') : format('readerModeContinuous')),
          h('button', {
            type: 'button',
            className: 'md-btn md-btn-small',
            title: format('readerZoomOut'),
            'aria-label': format('readerZoomOut'),
            disabled: phase !== 'ready',
            onClick: () => zoomTo(renderScale / 1.2),
          }, '−'),
          h('button', {
            type: 'button',
            className: 'md-btn md-btn-small',
            title: format('readerFit'),
            'aria-label': format('readerFit'),
            disabled: phase !== 'ready',
            onClick: () => fitToColumn(),
          }, '⤢'),
          h('button', {
            type: 'button',
            className: 'md-btn md-btn-small',
            title: format('readerZoomIn'),
            'aria-label': format('readerZoomIn'),
            disabled: phase !== 'ready',
            onClick: () => zoomTo(renderScale * 1.2),
          }, '+'),
          h('span', { className: 'md-side-gap' }),
          h('button', {
            type: 'button',
            className: 'md-btn md-btn-small md-icon-btn',
            'aria-pressed': tool === 'pen' ? 'true' : 'false',
            title: format('annotHint'),
            'aria-label': format('annotPen'),
            onClick: () => toggleTool('pen'),
          }, annotIcon('M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z')),
          h('button', {
            type: 'button',
            className: 'md-btn md-btn-small md-icon-btn',
            'aria-pressed': tool === 'erase' ? 'true' : 'false',
            title: format('annotEraseHint'),
            'aria-label': format('annotErase'),
            onClick: () => toggleTool('erase'),
          }, annotIcon('m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21M22 21H7M5 11l9 9')),
          h('button', {
            type: 'button',
            className: 'md-btn md-btn-small md-icon-btn',
            'aria-pressed': tool === 'text' ? 'true' : 'false',
            title: format('annotTextHint'),
            'aria-label': format('annotText'),
            onClick: () => toggleTool('text'),
          }, annotIcon('M4 6h16M12 6v13M9 19h6')),
          h(NoteStyleMenu, { style: noteEdit ?? noteStyle, onChange: changeNoteStyle }),
          h('button', {
            type: 'button',
            className: 'md-btn md-btn-small md-icon-btn',
            'aria-pressed': tool === 'mask' ? 'true' : 'false',
            title: format('overlayHint'),
            'aria-label': format('overlayToggle'),
            onClick: () => toggleTool('mask'),
          }, annotIcon('M4 4h16v16H4zM8 4v16M16 4v16')),
          h('span', { className: 'md-side-gap' }),
          h('button', {
            type: 'button',
            className: 'md-btn md-btn-small md-icon-btn',
            disabled: historyCounts.undo === 0,
            title: format('undoHint'),
            'aria-label': format('undo'),
            onClick: () => undoPage(),
          }, annotIcon('M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3')),
          h('button', {
            type: 'button',
            className: 'md-btn md-btn-small md-icon-btn',
            disabled: historyCounts.redo === 0,
            title: format('redoHint'),
            'aria-label': format('redo'),
            onClick: () => redoPage(),
          }, annotIcon('M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3')),
          h('span', { className: 'md-side-gap' }),
          h('span', { className: 'md-side-zoom', title: format(autoFit ? 'sideAutoFitOn' : 'sideMenuZoom') },
            `${Math.round(shown * 100)}%`),
          h('button', {
            type: 'button',
            className: 'md-btn md-btn-small md-side-more',
            title: format('sideMenuHint'),
            'aria-label': format('sideMenuMore'),
            'aria-haspopup': 'menu',
            disabled: target === null,
            onClick: event => openSideMenu(event),
          }, '⋯')),
        h('div', { className: 'md-side-body' }, body),
        h('div', { className: 'md-rail-tab md-side-rail-tab', 'data-side': 'right', 'aria-hidden': true }, '‹'),
        h('div', { className: 'md-rail-wrap md-side-rail-wrap', 'data-side': 'right' },
          h('div', { className: 'md-rail md-side-rail' },
            h('button', {
              type: 'button', className: 'md-rail-btn',
              'aria-pressed': tool === 'pen' ? 'true' : 'false',
              title: format('annotHint'), 'aria-label': format('annotPen'),
              onClick: () => toggleTool('pen'),
            }, annotIcon('M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z')),
            h('button', {
              type: 'button', className: 'md-rail-btn',
              'aria-pressed': tool === 'erase' ? 'true' : 'false',
              title: format('annotEraseHint'), 'aria-label': format('annotErase'),
              onClick: () => toggleTool('erase'),
            }, annotIcon('m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21M22 21H7M5 11l9 9')),
            h('button', {
              type: 'button', className: 'md-rail-btn',
              'aria-pressed': tool === 'text' ? 'true' : 'false',
              title: format('annotTextHint'), 'aria-label': format('annotText'),
              onClick: () => toggleTool('text'),
            }, annotIcon('M4 6h16M12 6v13M9 19h6')),
            h('button', {
              type: 'button', className: 'md-rail-btn',
              'aria-pressed': tool === 'line' ? 'true' : 'false',
              title: format('shapeLine'), 'aria-label': format('shapeLine'),
              onClick: () => toggleTool('line'),
            }, annotIcon('M4 20 20 4')),
            h('button', {
              type: 'button', className: 'md-rail-btn',
              'aria-pressed': tool === 'arrow' ? 'true' : 'false',
              title: format('shapeArrow'), 'aria-label': format('shapeArrow'),
              onClick: () => toggleTool('arrow'),
            }, annotIcon('M4 20 20 4M10 4h10v10')),
            h('button', {
              type: 'button', className: 'md-rail-btn',
              'aria-pressed': tool === 'rect' ? 'true' : 'false',
              title: format('shapeRect'), 'aria-label': format('shapeRect'),
              onClick: () => toggleTool('rect'),
            }, annotIcon('M4 5h16v14H4z')),
            h('button', {
              type: 'button', className: 'md-rail-btn',
              'aria-pressed': tool === 'diamond' ? 'true' : 'false',
              title: format('shapeDiamond'), 'aria-label': format('shapeDiamond'),
              onClick: () => toggleTool('diamond'),
            }, annotIcon('M12 3 21 12 12 21 3 12z')),
            h('button', {
              type: 'button', className: 'md-rail-btn',
              'aria-pressed': tool === 'ellipse' ? 'true' : 'false',
              title: format('shapeEllipse'), 'aria-label': format('shapeEllipse'),
              onClick: () => toggleTool('ellipse'),
            }, annotIcon('M12 5c5 0 8 3 8 7s-3 7-8 7-8-3-8-7 3-7 8-7z')),
            h('button', {
              type: 'button', className: 'md-rail-btn',
              'aria-pressed': tool === 'mask' ? 'true' : 'false',
              title: format('overlayHint'), 'aria-label': format('overlayToggle'),
              onClick: () => toggleTool('mask'),
            }, annotIcon('M4 4h16v16H4zM8 4v16M16 4v16')),
            h('span', { className: 'md-rail-sep', 'aria-hidden': true }),
            h('button', {
              type: 'button', className: 'md-rail-btn',
              disabled: historyCounts.undo === 0,
              title: format('undoHint'), 'aria-label': format('undo'),
              onClick: () => undoPage(),
            }, annotIcon('M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3')),
            h('button', {
              type: 'button', className: 'md-rail-btn',
              disabled: historyCounts.redo === 0,
              title: format('redoHint'), 'aria-label': format('redo'),
              onClick: () => redoPage(),
            }, annotIcon('M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3'))
          )
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
      const [catalog, setCatalog] = useState(null)
      const [work, setWork] = useState(null)
      const [phase, setPhase] = useState('loading')
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
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
      const readerTask = useRef(null)
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
      const [digest, setDigest] = useState(null)
      const [libs, setLibs] = useState({ items: [], activeId: '' })
      const [library, setLibrary] = useState(null)
      const [libBusy, setLibBusy] = useState(false)
      const [libError, setLibError] = useState('')
      const [updateBusy, setUpdateBusy] = useState(false)
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
          if (same && force !== true && previous.phase !== 'error') {
            const limit = previous.count > 0 ? previous.count : page
            const next = Math.max(1, Math.min(limit, page))
            if (next === previous.page) return { ...previous, title: target.title, bookTitle: target.bookTitle ?? previous.bookTitle }
            return {
              ...previous,
              title: target.title,
              bookTitle: target.bookTitle ?? previous.bookTitle,
              page: next,
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
            const url = new URL(`pdfdesk/pdf?${params.toString()}`, document.baseURI).href
            const task = lib.getDocument({ url, isEvalSupported: false, ...pdfAssetUrls() })
            readerTask.current = task
            const doc = await task.promise
            if (cancelled) {
              // pdf.js 6 has no document.destroy(); the loading task owns teardown.
              try { void Promise.resolve(task.destroy()).catch(() => {}) } catch { /* already gone */ }
              return
            }
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
          event.preventDefault()
          if (action === 'closeReader') event.stopPropagation()
          if (action === 'closeReader') closeReader()
          else if (action === 'firstPage') readerPage(1)
          else if (action === 'prevPage') readerPrev()
          else if (action === 'nextPage') readerNext()
          else if (action === 'scrollUp' || action === 'scrollDown') {
            const node = stage === undefined ? null : stage.current
            if (node !== null) node.scrollBy({ top: action === 'scrollDown' ? 96 : -96, behavior: 'auto' })
          } else if (action === 'zoomIn') readerZoom(1.2)
          else if (action === 'zoomOut') readerZoom(1 / 1.2)
          else if (action === 'toggleMode') readerMode(reader.mode === 'single' ? 'continuous' : 'single')
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [closeReader, reader, readerMode, readerNext, readerPage, readerPrev, readerZoom])

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
            fragmentDir: typeof data.fragmentDir === 'string' ? data.fragmentDir : '',
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
          // The Q&A persona is part of the same initial prompt as the paths: one
          // block the model reads before the user's question, gated by Settings.
          let persona = ''
          let personaFailed = false
          if (mode === 'qa' && socraticEnabled()) {
            try {
              const payload = await request('GET', 'qa-persona')
              persona = typeof payload.persona === 'string' ? payload.persona.trim() : ''
            } catch {
              personaFailed = true
            }
          }
          const parts = [seedFor(book, chapter, paths, persona)]
          if (artifact !== '') parts.push(`产物：${artifact}（本章产物区里的这个文件）`)
          let hasOutline = false
          if (continuation >= 2) {
            const outline = await loadOutline(book.id, chapter.code)
            if (outline !== '') {
              parts.push(outline)
              hasOutline = true
            }
          }
          // End every preset prompt with a lead-in: some hosts mishandle a prompt
          // that ends without a separator, and this line gives the user a cursor.
          const draft = `${parts.join('\n\n')}\n\n${format('sessionQuestionLead')}`
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
            if (mode === 'qa') await seedQaPersona(current.id)
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

      let body
      if (blockingError !== '' && (catalog === null || work === null)) {
        body = h('div', { className: 'md-state md-state-error', role: 'alert' },
          h('div', { className: 'md-empty-title' }, format('loadFailed')),
          h('p', { className: 'md-state-detail' }, blockingError),
          h('div', { className: 'md-state-actions' },
            h('button', { type: 'button', className: 'md-btn', onClick: reload }, format('retry'))
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
          canRender: envTools.python && envTools.tex,
          busy: libBusy,
          error: libError !== '' ? libError : problemText,
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
      } else if (blockingError !== '') {
        body = h('div', { className: 'md-state md-state-error', role: 'alert' },
          h('div', { className: 'md-empty-title' }, format('loadFailed')),
          h('p', { className: 'md-state-detail' }, blockingError),
          h('div', { className: 'md-state-actions' },
            h('button', { type: 'button', className: 'md-btn', onClick: reload }, format('retry'))
          )
        )
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
                  'aria-haspopup': 'dialog', 'aria-expanded': settingsOpen ? 'true' : 'false',
                  onClick: () => setSettingsOpen(value => !value),
                }, `⚙ ${format('settings')}`)
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
        settingsOpen
          ? h(SettingsDialog, {
            version: catalog === null ? '' : catalog.version,
            envTools,
            updateBusy,
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
