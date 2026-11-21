# 右侧文档预览接入 PdfViewer（实现手册）

> 目标：点「提取 / 答疑 / 习题」跳转会话后，右侧栏里的 PDF 预览是**数学工作台自己的阅读器**（翻页、缩放、单页/连续、只读标注），并与插件阅读器**同步页码、阅读模式、译文版本**。
>
> 状态：v0.61.0 自建标签页 + 阅读器 + 页码/模式/版本同步 + 「在工作台打开」；v0.61.2 只读遮罩；v0.62.0 动作进右键菜单 + 自动适应栏宽；v0.63.0 右栏可直接写标注/框选并跳到会话。本文记录最终采用的接入方式、契约与后续步骤。

---

## 1. 结论：用**自己的标签类型**，不替换 DSH 的 PDF 呈现

先查清了 DSH 右侧栏的两层扩展点（`cordis_inspect_query` → client / Slots，并核对了 `@deepseek-ai/dsh-client-ui-sidebar-right` 源码）：

| 层 | 事实 | 结论 |
| --- | --- | --- |
| 标签类型 `ctx.sidebarRightTabs.register()` | `{ id, kind, patterns, priority, canOpen, title, keepMounted, multiple }`；地址按 glob 认领；`extension` 优先于 `builtin` | **可采用**：注册新 kind，只认领 `dsh-resource://mathdesk/**` |
| 文档呈现 `sidebar.right.tab.document`（keyed） | 键就是实现 id（`…/documentpreview/pdf` 等 8 个自带实现）；`documentPreviews.register()` 按**扩展名**匹配，外部实现排在自带实现之前 | **不采用**：按 `pdf` 后缀匹配会接管全部 PDF 预览，丢失文字选择等 DSH 原生能力 |

因此最终方案是**并列**而不是劫持：DSH 继续负责别人的 PDF，我们的章节 PDF 走自己的地址与组件。

## 2. 目标 / 非目标

**目标**
1. 右侧用 `PdfViewer` 渲染本章 PDF：翻页、缩放、自动适应栏宽、单页/连续；
2. 页码、阅读模式双向同步；译文版本（`docRev`）从阅读器流向右侧；标注/框选**双向**同步；
3. 标注与框选在右侧可**编辑**（笔、擦除、框选露翻译、清空），写回同一份 localStorage；
4. 芯片标题显示「书名 · 章代码」，标签页可长期驻留（`keepMounted`）；
5. 「在工作台打开」从右侧跳回阅读器同一页；「跳到会话」直达该章的提取/答疑/习题。

**非目标**
- 右侧不做翻译、导出；
- 右侧不自己写会话创建逻辑（新建会话交给工作台）；
- 不做双栏页叠加（已决定停掉），不做跨页段落合并；
- 不改 DSH 对 docx / xlsx / 普通 PDF 的呈现。

## 3. 地址与注册

```
dsh-resource://mathdesk/chapter/<encodeURIComponent(bookId)>/<encodeURIComponent(code)>
```

- `sideAddress(bookId, code)` 生成；`sideTarget(address)` 反解；
- 导航参数 `{ page, variant }`：页码给「刚打开时停在哪页」兜底，`variant` 为 `'translated'` 表示右侧显示译文版；
- 注册（`client.js` → `registerSidePreview(ctx)`）：

```js
ctx.sidebarRightTabs.register({
  id: 'dsh-pdf-math-desk/pdf',
  kind: 'mathdesk-pdf',
  patterns: ['dsh-resource://mathdesk/chapter/**'],
  keepMounted: true,
  title: address => `${book} · ${code}`,
})
ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name, key: id }, SidePdfView))
ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({ name, key: id }, SideTitle))
```

**降级路径**：右栏服务不可用（或注册抛错）时 `sideTabsReady` 保持 false，`openPdfInSession` 退回原来的 `dsh-resource://file/session/<session>/<相对路径>` 文本标签页——功能不阻塞。

**样式**：右栏在离开工作台页后仍然显示，而页面内的 `<style>` 会随页面卸载消失，所以 `apply()` 里把同一份 `CSS` 插到 `document.head`（`<style data-mathdesk="stylesheet">`，插件卸载时移除）。

## 4. 取数：直接走自己的 Host 路由

不新增代理路由。右侧与阅读器用的是同一条 `/mathdesk/pdf`：

```
mathdesk/pdf?book=<id>&code=<code>[&variant=translated][&rev=<docRev>]
```

`rev` 是文件版本计数器，用来击穿 pdf.js 与浏览器的文档缓存（翻译完成、补译、导入标注后递增）。

## 5. 同步契约

### 5.1 键与字段

```js
const VIEW_PUBLISHED = {
  reader: ['page', 'scale', 'mode', 'variant', 'docRev', 'annotRev'],
  side:   ['page', 'mode', 'annotRev'],
}
```

总线是模块级 `viewLinks: Map<"book:code", { state, listeners }>`：

- `syncView(bookId, code, state, origin)`：只发布**与共享状态不同**的字段（差值发布），因此「A 应用了 B 的变更」不会回弹；
- `subscribeView(bookId, code, listener)` 返回 disposer；`readView(bookId, code)` 供新挂载的一端取初值。
- `bumpAnnotRev(bookId, code, origin)`：标注/框选的**共享计数器**（见 5.4）。

### 5.2 缩放：默认自动适应，跟随是可选模式

右侧默认**持续跟随栏宽**：`autoScale = (栏内容宽 - 2) / 第 1 页宽`，窗口/侧栏/浮窗尺寸一变就重算（`ResizeObserver` → `stageWidth`），所以不需要再点「适应宽度」。三种模式：

| 模式 | 触发 | 实际缩放 |
| --- | --- | --- |
| 自动适应栏宽（默认） | ⋯ → 缩放 → ☑ 自动适应栏宽 | `autoScale` |
| 手动 | 放大/缩小/跳页后 | `manualScale`（离开自动适应时以当前显示值为起点） |
| 跟随阅读器 | ⋯ → 缩放 → ☑ 跟随阅读器缩放 | 阅读器通过总线发来的 `scale` |

- 阅读器的缩放只在「跟随阅读器」模式下生效，否则被忽略——这是为了不让两侧栏宽差把对方的排版改坏；
- 右侧**从不发布**缩放，`VIEW_PUBLISHED.side` 只有 `page`/`mode`。

### 5.3 防回声的三个细节

1. **差值发布**：`syncView` 只发不同字段；
2. **首帧不发布**：右侧挂载后先「吸收」阅读器状态（`started` 门闩），否则第一次渲染会用默认第 1 页把阅读器拽回去；
3. **滚动不算跳页**：右侧连续模式滚动上报页码时不触发「跳页滚动」，程序跳页用 `scrollToPage()` 并加 700ms 的 `jumping` 门闩。

### 5.4 标注/框选的双向同步

两端都能写同一份 `mathdesk:annots|masks:*`，所以不用各自的计数器（会互相盖掉），而是**共享一个**：

- 编辑者先落盘，再 `bumpAnnotRev(bookId, code, 'reader'|'side')`，把 `viewLink.state.annotRev` 加一发出去；
- 另一端收到更高值 → 把该页两组数据从 localStorage 重读（`remoteAnnotRev` / `seenAnnotRev`）；
- **写入只发生在用户操作处**：两端都是「显式保存」——`savePageAnnots`/`savePageMasks`（阅读器）与 `commitStrokes`/`commitMasks`（右栏），页面加载只读不写。这样翻页时不会把上一页的内容写进新页，也不需要「内容相同算重读」这种启发式判断；
- 导入 sidecar 是整章批量写存储，完成后显式广播一次。

## 6. 组件

### 6.1 `SidePdfView`

- `SidePdfView` 状态：`doc / count / page / renderScale(见 5.2) / mode / phase / error / docRev / strokes / masks / tool / shownVariant`；
- 加载：`loadPdfjs()` + `getDocument({ url, isEvalSupported:false, ...pdfAssetUrls() })`，卸载或换版时 `task.destroy()`；
- 渲染：复用 `PdfViewer`（`variant:'stage'`），单页模式挂遮罩层、标注层与编辑层，连续模式走 `ContinuousView` 的窗口化挂载；
- 工具条：`‹ 页码 ›`、笔/擦/框三个图标、缩放百分比、`⋯`；可在菜单里**隐藏**（`v0.64.0`），隐藏时右上角悬浮一个鼠标移入才出现的 `⋯` 作为入口，舞台顶部留 32px 让它不压页面；其余动作见 6.4 的右键菜单；
- 标注层：`mathdesk:annots:<书>:<章>:<页>` → `.md-annot-readonly`（`pointer-events:none`）；编辑层只在选了工具时出现（`.md-annot-edit`）；
- 遮罩层：`mathdesk:masks:<书>:<章>:<页>` → `.md-masks-readonly`（`z-index:4`，标注之下），每个框用 `OverlayMaskPage` 把**译文页**画进框里；框本身先出现、译文随后填进来。

### 6.1.1 右侧编辑（`v0.63.0`）

- 工具：笔（黑色 2px 折线）、擦除（`(8 + 半笔宽) / 页宽` 容差，按住可连擦）、框选（拖出框即露译文；**点一下已有的框删除**）；
- 菜单动作：清除本页标注、清空本页框选；
- 持久化：`commitStrokes` / `commitMasks` 写同一条 localStorage 键，然后 `bumpAnnotRev`；
- 只在**单页模式**可用：连续模式没有单页页面盒，工具按钮与菜单项置灰；
- 框选模式下会**提前加载**叠加/译文文档（`wantsMaskDoc` 把 `tool === 'mask'` 也算进去），这样画完第一框马上能看到译文。

### 6.1.2 遮罩的第二份文档

框里要显示译文，所以除了当前页面的文档，还需要一份「叠加/译文」文档：

- **按需加载**：当前页有框、或正在用框选工具时才取；先试 `variant=overlay`，失败退 `variant=translated`，都失败就保持空框（说明还没翻译）；
- **按版本缓存**：`maskReady` 记住 `book|code|docRev`，翻页不重复取；`docRev` 变（翻译/补译完成）时销毁旧文档并重新取；
- **几何**：框 div 用 `left/top/width/height` 百分比定位在页面盒上，内层 canvas 反向偏移 `-x/w`、宽度 `100/w%`，与阅读器的叠加层同一套算法；
- **层序**：页面 → 框层（z-index 4）→ 手写标注（z-index 6）→ 编辑层（只在选中工具时）；
- 阅读器切到「译文」版时右侧不画框（与阅读器规则一致）。

### 6.2 阅读器侧改动

- `ReaderView`：`docRev` 由翻译/补译/导入标注递增并发布；标注/框选编辑走 `savePageAnnots`/`savePageMasks`（写存储 + 广播 `annotRev`），页面加载只读；订阅 `origin === 'side'` 的 `annotRev`，收到后把当前页两组数据从 localStorage 重读；
- `WorkbenchPage`：`readerViewKey` 字符串变化 → `syncView(..., 'reader')`；订阅右栏的 `page/mode`，用 `readerPage` 与已判重的 setState 应用；
- `openReader(target)` 新增 `target.page`，供「在工作台打开」精确落页。

### 6.3 「在工作台打开」

`requestDeskOpen(bookId, code, page)`：`ctx.layout.selectPanel('mathdesk')` + 通过 `deskOpenListeners` 广播；`WorkbenchPage` 收到后从 `catalog.books` 找到章（含 `title/file`），必要时先 `openBook`，再 `openReader({ ..., page })`。加载中收到的请求会暂存到 `pendingDeskOpen`，catalog 到位后重放。

### 6.3.1 「跳到会话」（`v0.63.0`）

右键菜单 **跳到会话 ▸ 提取 / 答疑 / 习题**：

- **已有会话**：`useSessionList()` + `parseSessionTitle()` 按 `书名/章代码/模式` 找最近更新的一条，`openHostSession(id)` 直接跳过去；菜单标签不带前缀；
- **还没有**：标签显示 `＋ 提取`，动作走 `requestDeskSession(bookId, code, mode)` → `selectPanel('mathdesk')` + `deskSessionListeners` 广播；工作台页收到后（必要时先 `openBook`）调用它自己的 `resumeOrCreate(chapter, mode, { jumpOnCreate: true })`，标题、提纲、续聊编号全部复用工作台逻辑，右栏不重复实现；请求在 catalog 未就绪时暂存 `pendingDeskSession`，到位后重放。

### 6.4 右键菜单（`v0.62.0`）

DSH 的菜单是**按 target kind 贡献动作**的共享弹窗（`ctx.contextMenus.register({ target, order, resolve })` + `open(target, point)`），所以我们注册一个自己的 target family：

```js
ctx.contextMenus.register({
  id: 'math-desk-side',
  target: 'mathdeskSide',            // 运行时不校验 kind 集合，扩展方可自定义
  order: 20,
  resolve: target => sideMenuProviders.get(`${target.bookId}:${target.code}`)?.() ?? [],
})
```

- target 值只放 JSON 安全数据 `{ bookId, code, page }`（`menuTargetKey` 会 `JSON.stringify` 它做「同点重复手势关闭」判定，不能放函数）；
- 动作本身来自**已挂载组件**：每个 `SidePdfView` 在挂载时把 `() => 动作数组` 登记进 `sideMenuProviders`（键 `书:章`），卸载时撤销；动作读 `menuState` ref，所以菜单永远反映当前页/模式/缩放；
- 打开方式两种：页面 `onContextMenu`（右键）与工具条 `⋯` 按钮（用按钮矩形算弹出点）；
- 菜单项（`v0.66.0` 起分组成 7 行根菜单，其余收进二级）：**翻页 ▸**（上一页/下一页/首页/跳页…）｜**工具 ▸**（笔、擦除、框选、清除本页标注、清空本页框选）｜**缩放 ▸**（放大、缩小、适应宽度、☑ 自动适应栏宽、☑ 跟随阅读器缩放）｜单页↔连续｜**跳到会话 ▸**（提取/答疑/习题）｜在工作台打开｜**预览 ▸**（重新加载文件、隐藏/显示工具条、关闭预览）；置灰与 ☑ 由当前状态决定。
- 降级：没有 context menu 服务的构建里 `⋯` 不做事，阅读功能照常（工具条仍有翻页与三个工具按钮）。

## 7. 实施顺序与状态

| # | 步骤 | 状态 |
| --- | --- | --- |
| 1 | 探测接入点（Slots / documentPreviews / 标签类型注册） | ✅ v0.61.0 |
| 2 | 自建标签类型 + 地址 + 芯片标题 | ✅ v0.61.0 |
| 3 | `SidePdfView` 复用 `PdfViewer`（翻页/缩放/模式） | ✅ v0.61.0 |
| 4 | 页码/模式/译文版本同步（`origin` 防回声） | ✅ v0.61.0 |
| 5 | 标注只读上屏（`annotRev`） | ✅ v0.61.0 |
| 6 | 「在工作台打开」 | ✅ v0.61.0 |
| 7 | 遮罩（叠加框）只读上屏：按需加载叠加/译文文档 | ✅ v0.61.2 |
| 8 | 动作收进右键菜单 + 自动适应栏宽 | ✅ v0.62.0 |
| 9 | 右侧可写：笔 / 擦除 / 框选 / 清空 + 共享 `annotRev` 双向同步 | ✅ v0.63.0 |
| 10 | 「跳到会话」：已有直跳，缺失交给工作台新建 | ✅ v0.63.0 |
| 11 | 关闭时的状态清理 / 侧栏浮动面板下的适配回归 | ⏳ 可选 |

## 8. 验收矩阵

| 场景 | 期望 |
| --- | --- |
| 阅读器翻到第 5 页 | 右侧跟到第 5 页 |
| 右侧翻页 | 阅读器跟到同页，不抖动 |
| 拖动侧栏宽度 / 改窗口大小 | 右侧自动重新按栏宽排版，不需要点「适应宽度」 |
| 阅读器放大到 200% | 右侧仍自动适应栏宽；勾「跟随阅读器缩放」后右侧才跟着变 200% |
| 右键页面任意处 / 点 ⋯ | 弹出同一个菜单，项按当前状态置灰/打勾 |
| 菜单里跳页、切单页/连续、重新加载 | 与工具条等效，阅读器同步跟随页码与模式 |
| 画一笔标注 | 两侧 0.35 秒内互相出现同一笔；两栏都能编辑 |
| 画一个叠加框 | 两侧同一位置出现框，框内是译文；右侧可画可删，点击已有框删除 |
| 右侧清除本页标注 / 清空本页框选 | 阅读器对应页同步清空 |
| 翻译完成 / 补译 | 两侧都换到新 `_translated.pdf`，框内译文也跟着换 |
| 跳到会话 → 提取（已有） | 直接切到该章最近的那条会话 |
| 跳到会话 → 习题（还没有） | 工作台按原有流程新建会话并跳过去 |
| 关闭右侧标签 | 阅读器不受影响，总线监听清理 |
| 无右栏的构建 | 退回 DSH 原生文件标签页，不报错 |

## 9. 风险与已知问题

- **dispatch 依赖内部契约**：`sidebarRightTabs` / `sidebar.right.pane.tab` / `contextMenus` 是 DSH 的扩展点，但字段名随版本可能变；`start()` 里对服务与返回值都做了存在性判断，异常只记 trace 并降级。
- **自定义 target kind**：`ContextMenuTargetMap` 是 TS 声明合并表，运行时不校验 kind，外部插件自定义 kind 属于预期用法；但若将来 DSH 加了运行时校验，菜单会静默不弹（阅读功能不受影响）。
- **样式注入**：`document.head` 里多一份样式表；与页面内 `<style>` 内容相同，重复无害。
- **标注与遮罩只在单页模式可见/可编辑**：`PdfViewer` 只在单页模式渲染 `children`；连续模式的图层需要另做（与阅读器现状一致），所以右侧工具在此模式下置灰。
- **跳过会话的新建会闪一下工作台**：新建走 `selectPanel('mathdesk')` + 工作台自己的 `resumeOrCreate`，创建后立刻切到会话；已有会话直接跳，不闪。
- **没有撤销**：两端的笔都没有 undo，清空是整页清空（与阅读器一致）。
- **遮罩的内存代价（v0.68.0 已降）**：整页只栅格化一次，所有框共用同一张位图（阅读器复用已有的整页 JPEG；右侧预览按页缓存最近两张）。以前是每个框一张整页 canvas。
- **框的可见性不跟随阅读器的「叠加」开关**：只要该页存在框，右侧就画出来（框是页面数据，不是开关状态）。
- **自动适应与滚动条**：`ResizeObserver` 测内容盒宽度，理论上「刚好不再出竖滚动条」的边界可能来回一次，差值 ≤1px 时忽略。
- **同一章多个标签**：地址即内容 id，同一章在同一栏只有一张标签；重复打开是「指向同页」而不是新标签。
- **跨书跳转**：`openFromSide` 会先切书页再开阅读器，避免「返回章节」落到旧书。
- **桌面挂件遮挡**：`dsh-whale-widget-bowl` 的根节点是 `.dshwv-root`（`position:fixed; z-index:9999`，本身 `pointer-events:none`），跨插件无法把它压到页面下方，所以做成**悬停淡化**：指针进入预览时给 `body` 打 `data-mathdesk-reading`，注入的样式把它淡到 28%；该插件不在时规则匹配不到元素。若以后挂件类名变了，淡化失效但不影响阅读功能。

## 10. 关键代码位置（`client.js`）

| 用途 | 位置 |
| --- | --- |
| 地址与同步总线 | `sideAddress` / `sideTarget` / `syncView` / `subscribeView` / `readView` / `bumpAnnotRev` |
| 「在工作台打开」请求 | `requestDeskOpen` / `deskOpenListeners` / `pendingDeskOpen` |
| 「跳到会话」请求 | `requestDeskSession` / `deskSessionListeners` / `pendingDeskSession`（工作台侧 `resumeOrCreate`） |
| 右侧编辑 | 组件内 `commitStrokes` / `commitMasks` / `editDown/Move/Up` / `hitTest` / `findSession` |
| 右键菜单 | `SIDE_MENU_KIND` / `sideMenuProviders` / `registerSidePreview` 里的 `menus.register` / 组件内 `menuActions` / `openSideMenu` |
| 自动适应 | `autoScale` / `renderScale` / `stageWidth` / `baseWidth` / `zoomTo` / `fitToColumn` |
| 右侧组件 | `SidePdfView` / `SideTitle` |
| 注册 | `registerSidePreview(ctx)`（`apply` 末尾调用） |
| 打开右侧 | `openPdfInSession`（`sideTabAvailable` 判定后走自建地址） |
| 阅读器同步 | `WorkbenchPage` 的 `readerViewKey` / `readerLinkKey`；`ReaderView` 的 `docRev`、`remoteAnnotRev` 与写回判据 |
| 取数路由 | `src/host/routes.js` 的 `/pdf`（`variant`、`rev`） |
| 样式 | `CSS` 里的 `.md-side*`、`.md-annot-readonly`、`.md-annot-edit` |
