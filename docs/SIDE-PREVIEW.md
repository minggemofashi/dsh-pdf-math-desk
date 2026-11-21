# 右侧文档预览接入 PdfViewer（实现手册）

> 目标：点「提取 / 答疑 / 习题」跳转会话后，右侧栏里的 PDF 预览是**数学工作台自己的阅读器**（翻页、缩放、单页/连续、只读标注），并与插件阅读器**同步页码、阅读模式、译文版本**。
>
> 状态：v0.61.0 实现第一步（自建标签页 + 阅读器 + 页码/模式/版本同步 + 只读标注 + 「在工作台打开」），v0.61.2 补上只读遮罩。本文记录最终采用的接入方式、契约与后续步骤。

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
1. 右侧用 `PdfViewer` 渲染本章 PDF：翻页、缩放、适应栏宽、单页/连续；
2. 页码、阅读模式双向同步；译文版本（`docRev`）与标注（`annotRev`）单向从阅读器流向右侧；
3. 标注在右侧**只读**可见（同一份 localStorage）；
4. 芯片标题显示「书名 · 章代码」，标签页可长期驻留（`keepMounted`）；
5. 「在工作台打开」从右侧跳回阅读器同一页。

**非目标**
- 右侧不做翻译、导出、开会话、画标注；
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
  side:   ['page', 'mode'],
}
```

总线是模块级 `viewLinks: Map<"book:code", { state, listeners }>`：

- `syncView(bookId, code, state, origin)`：只发布**与共享状态不同**的字段（差值发布），因此「A 应用了 B 的变更」不会回弹；
- `subscribeView(bookId, code, listener)` 返回 disposer；`readView(bookId, code)` 供新挂载的一端取初值。

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

## 6. 组件

### 6.1 `SidePdfView`

- `SidePdfView` 状态：`doc / count / page / scale(见 5.2) / mode / phase / error / docRev / annotRev / strokes / masks / shownVariant`；
- 加载：`loadPdfjs()` + `getDocument({ url, isEvalSupported:false, ...pdfAssetUrls() })`，卸载或换版时 `task.destroy()`；
- 渲染：复用 `PdfViewer`（`variant:'stage'`），单页模式挂只读遮罩层与标注层，连续模式走 `ContinuousView` 的窗口化挂载；
- 工具条只留 `‹ 页码 ›`、缩放百分比、`⋯`；其余动作见 6.4 的右键菜单；
- 只读标注：`mathdesk:annots:<书>:<章>:<页>` → `.md-annot-readonly`（`pointer-events:none`），`annotRev` 变化时重读；
- 只读遮罩：`mathdesk:masks:<书>:<章>:<页>` → `.md-masks-readonly`（`z-index:4`，标注之下），每个框用 `OverlayMaskPage` 把**译文页**画进框里；`annotRev` 变化时重读。

### 6.1.1 遮罩的第二份文档

框里要显示译文，所以除了当前页面的文档，还需要一份「叠加/译文」文档：

- **按需加载**：只有当前页 `masks.length > 0` 才取；先试 `variant=overlay`，失败退 `variant=translated`，都失败就保持空框（说明还没翻译）；
- **按版本缓存**：`maskReady` 记住 `book|code|docRev`，翻页不重复取；`docRev` 变（翻译/补译完成）时销毁旧文档并重新取；
- **几何**：框 div 用 `left/top/width/height` 百分比定位在页面盒上，内层 canvas 反向偏移 `-x/w`、宽度 `100/w%`，与阅读器的叠加层同一套算法；
- **层序**：页面 → 框层（z-index 4）→ 手写标注（z-index 6）；框层 `pointer-events:none`。
- 阅读器切到「译文」版时右侧不画框（与阅读器规则一致）。

### 6.2 阅读器侧改动

- `ReaderView` 里的 `docRev` / `annotRev` 变成两个可发布计数器：翻译/补译/导入标注后 bump `docRev`；标注或遮罩真正被编辑时 bump `annotRev`（每页第一次写回是「加载回写」，不算编辑）；
- `WorkbenchPage`：`readerViewKey` 字符串变化 → `syncView(..., 'reader')`；订阅右栏的 `page/mode`，用 `readerPage` 与已判重的 setState 应用；
- `openReader(target)` 新增 `target.page`，供「在工作台打开」精确落页。

### 6.3 「在工作台打开」

`requestDeskOpen(bookId, code, page)`：`ctx.layout.selectPanel('mathdesk')` + 通过 `deskOpenListeners` 广播；`WorkbenchPage` 收到后从 `catalog.books` 找到章（含 `title/file`），必要时先 `openBook`，再 `openReader({ ..., page })`。加载中收到的请求会暂存到 `pendingDeskOpen`，catalog 到位后重放。

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
- 菜单项：上一页/下一页/首页/跳页…｜缩放 ▸（放大、缩小、适应宽度、☑ 自动适应栏宽、☑ 跟随阅读器缩放）｜单页↔连续｜重新加载文件｜在工作台打开｜关闭预览；置灰与 ☑ 由当前状态决定。
- 降级：没有 context menu 服务的构建里 `⋯` 不做事，阅读功能照常（工具条只留翻页）。

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
| 9 | 关闭时的状态清理 / 侧栏浮动面板下的适配回归 | ⏳ 可选 |

## 8. 验收矩阵

| 场景 | 期望 |
| --- | --- |
| 阅读器翻到第 5 页 | 右侧跟到第 5 页 |
| 右侧翻页 | 阅读器跟到同页，不抖动 |
| 拖动侧栏宽度 / 改窗口大小 | 右侧自动重新按栏宽排版，不需要点「适应宽度」 |
| 阅读器放大到 200% | 右侧仍自动适应栏宽；勾「跟随阅读器缩放」后右侧才跟着变 200% |
| 右键页面任意处 / 点 ⋯ | 弹出同一个菜单，项按当前状态置灰/打勾 |
| 菜单里跳页、切单页/连续、重新加载 | 与工具条等效，阅读器同步跟随页码与模式 |
| 画一笔标注 | 右侧 350ms 内出现同一笔；右侧不能编辑 |
| 画一个叠加框 | 右侧同一位置出现框，框内是译文；右侧不能改框 |
| 翻译完成 / 补译 | 两侧都换到新 `_translated.pdf`，框内译文也跟着换 |
| 关闭右侧标签 | 阅读器不受影响，总线监听清理 |
| 无右栏的构建 | 退回 DSH 原生文件标签页，不报错 |

## 9. 风险与已知问题

- **dispatch 依赖内部契约**：`sidebarRightTabs` / `sidebar.right.pane.tab` / `contextMenus` 是 DSH 的扩展点，但字段名随版本可能变；`start()` 里对服务与返回值都做了存在性判断，异常只记 trace 并降级。
- **自定义 target kind**：`ContextMenuTargetMap` 是 TS 声明合并表，运行时不校验 kind，外部插件自定义 kind 属于预期用法；但若将来 DSH 加了运行时校验，菜单会静默不弹（阅读功能不受影响）。
- **样式注入**：`document.head` 里多一份样式表；与页面内 `<style>` 内容相同，重复无害。
- **标注与遮罩只在单页模式可见**：`PdfViewer` 只在单页模式渲染 `children`；连续模式的图层需要另做（与阅读器现状一致）。
- **遮罩的内存代价**：每个框内是一张整页 canvas（`max(2, zoom*2)` 倍），和阅读器同一实现；一页框很多时右栏会多占几十 MB，属已知取舍。
- **框的可见性不跟随阅读器的「叠加」开关**：只要该页存在框，右侧就画出来（框是页面数据，不是开关状态）。
- **自动适应与滚动条**：`ResizeObserver` 测内容盒宽度，理论上「刚好不再出竖滚动条」的边界可能来回一次，差值 ≤1px 时忽略。
- **同一章多个标签**：地址即内容 id，同一章在同一栏只有一张标签；重复打开是「指向同页」而不是新标签。
- **跨书跳转**：`openFromSide` 会先切书页再开阅读器，避免「返回章节」落到旧书。

## 10. 关键代码位置（`client.js`）

| 用途 | 位置 |
| --- | --- |
| 地址与同步总线 | `sideAddress` / `sideTarget` / `syncView` / `subscribeView` / `readView` |
| 「在工作台打开」请求 | `requestDeskOpen` / `deskOpenListeners` / `pendingDeskOpen` |
| 右键菜单 | `SIDE_MENU_KIND` / `sideMenuProviders` / `registerSidePreview` 里的 `menus.register` / 组件内 `menuActions` / `openSideMenu` |
| 自动适应 | `autoScale` / `renderScale` / `stageWidth` / `baseWidth` / `zoomTo` / `fitToColumn` |
| 右侧组件 | `SidePdfView` / `SideTitle` |
| 注册 | `registerSidePreview(ctx)`（`apply` 末尾调用） |
| 打开右侧 | `openPdfInSession`（`sideTabAvailable` 判定后走自建地址） |
| 阅读器同步 | `WorkbenchPage` 的 `readerViewKey` / `readerLinkKey` 两个 effect、`ReaderView` 的 `docRev`/`annotRev` |
| 取数路由 | `src/host/routes.js` 的 `/pdf`（`variant`、`rev`） |
| 样式 | `CSS` 里的 `.md-side*`、`.md-annot-readonly` |
