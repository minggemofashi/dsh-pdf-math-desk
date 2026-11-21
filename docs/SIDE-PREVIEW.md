# 右侧文档预览接入 PdfViewer（实现手册）

> 目标：点「提取 / 答疑 / 习题」跳转会话后，右侧栏里的 PDF 预览是**数学工作台自己的阅读器**（翻页、缩放、单页/连续、只读标注），并与插件阅读器**同步页码、阅读模式、译文版本**。
>
> 状态：v0.61.0 已实现第一步（自建标签页 + 阅读器 + 页码/模式/版本同步 + 只读标注上屏 + 「在工作台打开」）。本文记录最终采用的接入方式、契约与后续步骤。

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

### 5.2 为什么缩放单向

`reader.scale` 是**绝对** pdf.js 缩放（工具栏百分比＝`scale×100%`），右栏容器窄得多。若双向同步，两侧会互相把对方的「适应宽度」当成自己的绝对缩放来回改写。所以：

- 阅读器改缩放 → 右侧跟随（图省事的绝对值，栏窄就横向滚动）；
- 右侧自己的 `− / 适应宽度 / +` 只影响右侧。

### 5.3 防回声的三个细节

1. **差值发布**：`syncView` 只发不同字段；
2. **首帧不发布**：右侧挂载后先「吸收」阅读器状态（`started` 门闩），否则第一次渲染会用默认第 1 页把阅读器拽回去；
3. **滚动不算跳页**：右侧连续模式滚动上报页码时不触发「跳页滚动」，程序跳页用 `scrollToPage()` 并加 700ms 的 `jumping` 门闩。

## 6. 组件

### 6.1 `SidePdfView`

- 状态：`doc / count / page / scale(null=适应) / mode / phase / error / docRev / annotRev / strokes / shownVariant`；
- 加载：`loadPdfjs()` + `getDocument({ url, isEvalSupported:false, ...pdfAssetUrls() })`，卸载或换版时 `task.destroy()`；
- 渲染：复用 `PdfViewer`（`variant:'stage'`），单页模式挂只读标注层，连续模式走 `ContinuousView` 的窗口化挂载；
- 工具条：`‹ 页码 ›`、`− / 适应宽度 / + / 百分比`、`单页↔连续`、`在工作台打开`；
- 只读标注：`mathdesk:annots:<书>:<章>:<页>` → `.md-annot-readonly`（`pointer-events:none`），`annotRev` 变化时重读。

### 6.2 阅读器侧改动

- `ReaderView` 里的 `docRev` / `annotRev` 变成两个可发布计数器：翻译/补译/导入标注后 bump `docRev`；标注或遮罩真正被编辑时 bump `annotRev`（每页第一次写回是「加载回写」，不算编辑）；
- `WorkbenchPage`：`readerViewKey` 字符串变化 → `syncView(..., 'reader')`；订阅右栏的 `page/mode`，用 `readerPage` 与已判重的 setState 应用；
- `openReader(target)` 新增 `target.page`，供「在工作台打开」精确落页。

### 6.3 「在工作台打开」

`requestDeskOpen(bookId, code, page)`：`ctx.layout.selectPanel('mathdesk')` + 通过 `deskOpenListeners` 广播；`WorkbenchPage` 收到后从 `catalog.books` 找到章（含 `title/file`），必要时先 `openBook`，再 `openReader({ ..., page })`。加载中收到的请求会暂存到 `pendingDeskOpen`，catalog 到位后重放。

## 7. 实施顺序与状态

| # | 步骤 | 状态 |
| --- | --- | --- |
| 1 | 探测接入点（Slots / documentPreviews / 标签类型注册） | ✅ v0.61.0 |
| 2 | 自建标签类型 + 地址 + 芯片标题 | ✅ v0.61.0 |
| 3 | `SidePdfView` 复用 `PdfViewer`（翻页/缩放/模式） | ✅ v0.61.0 |
| 4 | 页码/模式/译文版本同步（`origin` 防回声） | ✅ v0.61.0 |
| 5 | 标注只读上屏（`annotRev`） | ✅ v0.61.0 |
| 6 | 「在工作台打开」 | ✅ v0.61.0 |
| 7 | 遮罩（叠加框）只读上屏：需要叠加层文档一起加载 | ⏳ 下一步 |
| 8 | 右侧右键菜单 / 关闭时的状态清理 | ⏳ 可选 |

## 8. 验收矩阵

| 场景 | 期望 |
| --- | --- |
| 阅读器翻到第 5 页 | 右侧跟到第 5 页 |
| 右侧翻页 | 阅读器跟到同页，不抖动 |
| 阅读器放大到 200% | 右侧显示 200%（栏窄则横向滚动）；右侧自己缩放不影响阅读器 |
| 阅读器切单页/连续 | 右侧同步切换布局并停在同页 |
| 画一笔标注 | 右侧 350ms 内出现同一笔；右侧不能编辑 |
| 翻译完成 / 补译 | 两侧都换到新 `_translated.pdf` |
| 关闭右侧标签 | 阅读器不受影响，总线监听清理 |
| 无右栏的构建 | 退回 DSH 原生文件标签页，不报错 |

## 9. 风险与已知问题

- **dispatch 依赖内部契约**：`sidebarRightTabs` / `sidebar.right.pane.tab` 是 DSH 的扩展点，但字段名随版本可能变；`start()` 里对服务与返回值都做了存在性判断，异常只记 trace 并降级。
- **样式注入**：`document.head` 里多一份样式表；与页面内 `<style>` 内容相同，重复无害。
- **标注只在单页模式可见**：`PdfViewer` 只在单页模式渲染 `children`；连续模式的遮罩/标注需要另做（与阅读器现状一致）。
- **同一章多个标签**：地址即内容 id，同一章在同一栏只有一张标签；重复打开是「指向同页」而不是新标签。
- **跨书跳转**：`openFromSide` 会先切书页再开阅读器，避免「返回章节」落到旧书。

## 10. 关键代码位置（`client.js`）

| 用途 | 位置 |
| --- | --- |
| 地址与同步总线 | `sideAddress` / `sideTarget` / `syncView` / `subscribeView` / `readView` |
| 「在工作台打开」请求 | `requestDeskOpen` / `deskOpenListeners` / `pendingDeskOpen` |
| 右侧组件 | `SidePdfView` / `SideTitle` |
| 注册 | `registerSidePreview(ctx)`（`apply` 末尾调用） |
| 打开右侧 | `openPdfInSession`（`sideTabAvailable` 判定后走自建地址） |
| 阅读器同步 | `WorkbenchPage` 的 `readerViewKey` / `readerLinkKey` 两个 effect、`ReaderView` 的 `docRev`/`annotRev` |
| 取数路由 | `src/host/routes.js` 的 `/pdf`（`variant`、`rev`） |
| 样式 | `CSS` 里的 `.md-side*`、`.md-annot-readonly` |
