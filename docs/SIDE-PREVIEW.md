# 右侧文档预览接入 PdfViewer（实现手册）

> 目标：点「提取 / 答疑 / 习题」跳转会话后，右侧栏里的 PDF 预览是**PDF阅读自己的阅读器**（翻页、缩放、单页/连续、只读标注），并与插件阅读器**同步页码、阅读模式、译文版本**。
>
> 状态：v0.61.0 自建标签页 + 阅读器 + 页码/模式/版本同步 + 「在工作台打开」；v0.61.2 只读遮罩；v0.62.0 动作进右键菜单 + 自动适应栏宽；v0.63.0 右栏可直接写标注/框选并跳到会话。本文记录最终采用的接入方式、契约与后续步骤。

---

## 1. 结论：用**自己的标签类型**，不替换 DSH 的 PDF 呈现

先查清了 DSH 右侧栏的两层扩展点（`cordis_inspect_query` → client / Slots，并核对了 `@deepseek-ai/dsh-client-ui-sidebar-right` 源码）：

| 层 | 事实 | 结论 |
| --- | --- | --- |
| 标签类型 `ctx.sidebarRightTabs.register()` | `{ id, kind, patterns, priority, canOpen, title, keepMounted, multiple }`；地址按 glob 认领；`extension` 优先于 `builtin` | **可采用**：注册新 kind，只认领 `dsh-resource://pdfdesk/**` |
| 文档呈现 `sidebar.right.tab.document`（keyed） | 键就是实现 id（`…/documentpreview/pdf` 等 8 个自带实现）；`documentPreviews.register()` 按**扩展名**匹配，外部实现排在自带实现之前 | **不采用**：按 `pdf` 后缀匹配会接管全部 PDF 预览，丢失文字选择等 DSH 原生能力 |

因此最终方案是**并列**而不是劫持：DSH 继续负责别人的 PDF，我们的章节 PDF 走自己的地址与组件。

## 2. 目标 / 非目标

**目标**
1. 右侧用 `PdfViewer` 渲染本章 PDF：翻页、缩放、自动适应栏宽、单页/连续；
2. 页码、阅读模式双向同步；译文版本（`docRev`）从阅读器流向右侧；标注/框选**双向**同步；
3. 标注与框选在右侧可**编辑**（笔、擦除、文本框、框选露翻译、清空），写回同一份 localStorage；
4. 芯片标题显示「书名 · 章代码」，标签页可长期驻留（`keepMounted`）；
5. 「在工作台打开」从右侧跳回阅读器同一页；「跳到会话」直达该章的提取/答疑/习题。

**非目标**
- 右侧不做翻译、导出；
- 右侧不自己写会话创建逻辑（新建会话交给工作台）；
- 不做双栏页叠加（已决定停掉），不做跨页段落合并；
- 不改 DSH 对 docx / xlsx / 普通 PDF 的呈现。

## 3. 地址与注册

```
dsh-resource://pdfdesk/chapter/<encodeURIComponent(bookId)>/<encodeURIComponent(code)>
```

- `sideAddress(bookId, code)` 生成；`sideTarget(address)` 反解；
- 导航参数 `{ page, variant }`：页码给「刚打开时停在哪页」兜底，`variant` 为 `'translated'` 表示右侧显示译文版；
- 注册（`client.js` → `registerSidePreview(ctx)`）：

```js
ctx.sidebarRightTabs.register({
  id: 'dsh-pdf-workbench/pdf',
  kind: 'pdfdesk-pdf',
  patterns: ['dsh-resource://pdfdesk/chapter/**'],
  keepMounted: true,
  title: address => `${book} · ${code}`,
})
ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name, key: id }, SidePdfView))
ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({ name, key: id }, SideTitle))
```

**降级路径**：右栏服务不可用（或注册抛错）时 `sideTabsReady` 保持 false，`openPdfInSession` 退回原来的 `dsh-resource://file/session/<session>/<相对路径>` 文本标签页——功能不阻塞。

**样式**：右栏在离开工作台页后仍然显示，而页面内的 `<style>` 会随页面卸载消失，所以 `apply()` 里把同一份 `CSS` 插到 `document.head`（`<style data-pdfdesk="stylesheet">`，插件卸载时移除）。

## 4. 取数：直接走自己的 Host 路由

不新增代理路由。右侧与阅读器用的是同一条 `/pdfdesk/pdf`：

```
pdfdesk/pdf?book=<id>&code=<code>[&variant=translated][&rev=<docRev>]
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

两端都能写同一份 `pdfdesk:annots|masks:*`，所以不用各自的计数器（会互相盖掉），而是**共享一个**：

- 编辑者先落盘，再 `bumpAnnotRev(bookId, code, 'reader'|'side')`，把 `viewLink.state.annotRev` 加一发出去；
- 另一端收到更高值 → 把该页两组数据从 localStorage 重读（`remoteAnnotRev` / `seenAnnotRev`）；
- **写入只发生在用户操作处**：两端都是「显式保存」——`savePageAnnots`/`savePageMasks`（阅读器）与 `commitStrokes`/`commitMasks`（右栏），页面加载只读不写。这样翻页时不会把上一页的内容写进新页，也不需要「内容相同算重读」这种启发式判断；
- 导入 sidecar 是整章批量写存储，完成后显式广播一次。

## 6. 组件

### 6.1 `SidePdfView`

- `SidePdfView` 状态：`doc / count / page / renderScale(见 5.2) / mode / phase / error / docRev / strokes / masks / tool / shownVariant`；
- 加载：`loadPdfjs()` + `getDocument({ url, isEvalSupported:false, ...pdfAssetUrls() })`，卸载或换版时 `task.destroy()`；
- 渲染：复用 `PdfViewer`（`variant:'stage'`），单页模式把图层放进页面盒，连续模式把同一组图层交给 `ContinuousView`，由 `ReaderPage` 画在当前页；
- 工具条：`‹ 页码 ›`、笔/擦/文本框/框选四个图标、缩放百分比、`⋯`；**页码可以点**，就地变成输入框（Enter 跳页、Esc 取消；`v0.69.0`，不再用 `window.prompt`）；可在菜单里**隐藏**（`v0.64.0`），隐藏时右上角悬浮一个鼠标移入才出现的 `⋯` 作为入口，舞台顶部留 32px 让它不压页面；其余动作见 6.4 的右键菜单；
- 标注层：`pdfdesk:annots:<书>:<章>:<页>` → `.md-annot-readonly`（`pointer-events:none`）；编辑层只在选了工具时出现（`.md-annot-edit`）；
- 遮罩层：`pdfdesk:masks:<书>:<章>:<页>` → `.md-masks-readonly`（`z-index:4`，标注之下），每个框用 `OverlayMaskPage` 把**译文页**画进框里；框本身先出现、译文随后填进来。

### 6.1.1 右侧编辑（`v0.63.0`）

- 工具：笔（黑色 2px 折线）、擦除（`(8 + 半笔宽) / 页宽` 容差，按住可连擦）、文本框（点页面就地输入，见 6.1.3）、框选（拖出框即露译文；**拖顶部圆点移动、八个把手改大小、右键删除**；在框上直接拖仍是画新框，Alt+拖动也能移动；撤销/重做见 6.1.5）；
- 菜单动作：撤销、重做、清除本页标注、清空本页框选；
- 持久化：`commitStrokes` / `commitMasks` 写同一条 localStorage 键，然后 `bumpAnnotRev`；
- 单页、连续都能用（`v0.70.0`）：`PdfViewer` 把 `children` 交给 `ContinuousView`，`ReaderPage` 只在**当前页**的页面盒里渲染它，所以连续模式下图层跟着阅读位置走；跨页连续画不支持，翻页时草稿会关掉；
- 阅读器双语模式：左右两栏各挂一个可写图层，**两栏各自独立**——原文栏用主页图层（`pdfdesk:annots:<book>:<code>:<page>`，与单页/译文视图共用），译文栏用独立的 `ColumnInk`（`…:<page>:right` 后缀），两栏可以停在不同页、各写各的；
- 框选模式下会**提前加载**叠加/译文文档（`wantsMaskDoc` 把 `tool === 'mask'` 也算进去），这样画完第一框马上能看到译文。

### 6.1.3 文本框就地编辑（`v0.69.0`）

阅读器和右栏共用一个 `NoteEditor`：在页面上点一下，文本框出现在点击处，Enter 保存、Shift+Enter 换行、Esc 取消、失焦保存（空白新框不落盘；清空已有框再保存等于删除）。

- **起因**：`v0.68.1` 及以前用 `window.prompt` 取文字，而 DSH Desktop（Electron）不实现 `prompt`，点了工具再点页面毫无反应；同理右栏菜单「跳页…」也调 `prompt`，一起改成页码就地输入；
- **数据流**：文字先留在编辑器自己的 `useState` 里，只通过 `onChange` 写进 owner 的 ref —— 每敲一个字不会重渲染整章页面；保存时 owner 用 `applyNote(list, draft, ref.current)` 得到新数组（阅读器 `savePageAnnots`、右栏 `commitStrokes`），带 `id` 的草稿让迟到的 blur 不会写到下一张草稿上；
- **编辑已有框**：选中文本工具时点已有框就是改它；没选工具时**双击**框也能改（此时标注层 `pointer-events:none`，只有 `.md-annot-text` 自己可点）；
- **翻页即关**：页、`annotRev`（另一端改过）、译文版本变化时关掉草稿，避免存进新页。

### 6.1.4 遮罩的第二份文档

框里要显示译文，所以除了当前页面的文档，还需要一份「叠加/译文」文档：

- **按需加载**：当前页有框、或正在用框选工具时才取；先试 `variant=overlay`，失败退 `variant=translated`，都失败就保持空框（说明还没翻译）；
- **按版本缓存**：`maskReady` 记住 `book|code|docRev`，翻页不重复取；`docRev` 变（翻译/补译完成）时销毁旧文档并重新取；
- **几何**：框 div 用 `left/top/width/height` 百分比定位在页面盒上，内层 canvas 反向偏移 `-x/w`、宽度 `100/w%`，与阅读器的叠加层同一套算法；
- **层序**：页面 → 框层（z-index 4）→ 手写标注（z-index 6）→ 编辑层（只在选中工具时）；
- 阅读器切到「译文」版时右侧不画框（与阅读器规则一致）。

### 6.1.5 可编辑的框 + 撤销/重做（v0.71.0）

- **几何**：框的外框只负责虚线边与摆放，内部的 `.md-mask-clip` 负责裁切页面位图，所以边框上的八个把手不会被裁掉；
- **交互层（v0.72.3）**：框本身 `pointer-events: none`，只做显示；上面盖一层铺满整页的 `.md-mask-boxes` 负责命中测试。普通按下**不拦截**（直接冒泡给下层画新框），只有点在八个把手、顶部圆点，或按住 Alt 在框体上时，这一层才接管并 `setPointerCapture`；这样一页被大框盖满时也不会“怎么拖都不出新框”；
- **移动/改大小**：拖顶部圆点（或 Alt+拖动框体）平移，拖 `nw/n/ne/e/se/s/sw/w` 八个把手改大小；归一化坐标、最小 2% 边长，拖动过程只改本地预览，松手才写存储（一次拖动 = 一步撤销）；把手/圆点在指针移到框上时显示（交互层把命中的框标成 `data-hover`）；
- **删除**：右键框删除（左键/单击不再删除）；删错了用 ↶ 撤销；
- **撤销/重做**：工具栏 ↶/↷ 按钮（阅读器与右栏都有，右栏菜单「工具 ▸」也有），按 `book|code|page` 记录 `{annots, masks}` 快照，上限 40 步；两栏共用同一个栈，撤销后另一端通过 `annotRev` 自动重读。
- **只在框选工具下可编辑（右栏）**：右栏没有单独的「框层编辑」状态，选中框选工具时用编辑层里的 `MaskBoxes` 替换只读框层，避免两套框叠在一起；阅读器的「叠加」本身就是编辑状态，没选画笔/文本框时框可移动/改大小（选了工具时标注层在上面，笔优先）。

### 6.2 阅读器侧改动

- `ReaderView`：`docRev` 由翻译/补译/导入标注递增并发布；标注/框选编辑走 `savePageAnnots`/`savePageMasks`（写存储 + 广播 `annotRev`），页面加载只读；订阅 `origin === 'side'` 的 `annotRev`，收到后把当前页两组数据从 localStorage 重读；
- `WorkbenchPage`：`readerViewKey` 字符串变化 → `syncView(..., 'reader')`；订阅右栏的 `page/mode`，用 `readerPage` 与已判重的 setState 应用；
- `openReader(target)` 新增 `target.page`，供「在工作台打开」精确落页。

### 6.3 「在工作台打开」

`requestDeskOpen(bookId, code, page)`：`ctx.layout.selectPanel('pdfdesk')` + 通过 `deskOpenListeners` 广播；`WorkbenchPage` 收到后从 `catalog.books` 找到章（含 `title/file`），必要时先 `openBook`，再 `openReader({ ..., page })`。加载中收到的请求会暂存到 `pendingDeskOpen`，catalog 到位后重放。

### 6.3.1 「跳到会话」（`v0.63.0`）

右键菜单 **跳到会话 ▸ 提取 / 答疑 / 习题**：

- **已有会话**：`useSessionList()` + `parseSessionTitle()` 按 `书名/章代码/模式` 找最近更新的一条，`openHostSession(id)` 直接跳过去；菜单标签不带前缀；
- **还没有**：标签显示 `＋ 提取`，动作走 `requestDeskSession(bookId, code, mode)` → `selectPanel('pdfdesk')` + `deskSessionListeners` 广播；工作台页收到后（必要时先 `openBook`）调用它自己的 `resumeOrCreate(chapter, mode, { jumpOnCreate: true })`，标题、提纲、续聊编号全部复用工作台逻辑，右栏不重复实现；请求在 catalog 未就绪时暂存 `pendingDeskSession`，到位后重放。

### 6.4 右键菜单（`v0.62.0`）

DSH 的菜单是**按 target kind 贡献动作**的共享弹窗（`ctx.contextMenus.register({ target, order, resolve })` + `open(target, point)`），所以我们注册一个自己的 target family：

```js
ctx.contextMenus.register({
  id: 'math-desk-side',
  target: 'pdfdeskSide',            // 运行时不校验 kind 集合，扩展方可自定义
  order: 20,
  resolve: target => sideMenuProviders.get(`${target.bookId}:${target.code}`)?.() ?? [],
})
```

- target 值只放 JSON 安全数据 `{ bookId, code, page }`（`menuTargetKey` 会 `JSON.stringify` 它做「同点重复手势关闭」判定，不能放函数）；
- 动作本身来自**已挂载组件**：每个 `SidePdfView` 在挂载时把 `() => 动作数组` 登记进 `sideMenuProviders`（键 `书:章`），卸载时撤销；动作读 `menuState` ref，所以菜单永远反映当前页/模式/缩放；
- 打开方式两种：页面 `onContextMenu`（右键）与工具条 `⋯` 按钮（用按钮矩形算弹出点）；
- 菜单项（`v0.66.0` 起分组成 7 行根菜单，其余收进二级）：**翻页 ▸**（上一页/下一页/首页/跳页…→ 页码就地输入）｜**工具 ▸**（笔、擦除、文本框、框选、撤销、重做、清除本页标注、清空本页框选）｜**缩放 ▸**（放大、缩小、适应宽度、☑ 自动适应栏宽、☑ 跟随阅读器缩放）｜单页↔连续｜**跳到会话 ▸**（提取/答疑/习题）｜在工作台打开｜**预览 ▸**（重新加载文件、隐藏/显示工具条、关闭预览）；置灰与 ☑ 由当前状态决定。
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
| 9 | 右侧可写：笔 / 擦除 / 文本框 / 框选 / 清空 + 共享 `annotRev` 双向同步 | ✅ v0.63.0（文本框 v0.69.0） |
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
- **标注与遮罩画在当前页上（v0.70.0）**：`PdfViewer` 把 `children` 交给 `ContinuousView`，`ReaderPage` 只在当前页的页面盒里渲染，所以连续/双语也能写；跨页连续画仍不支持（图层跟着当前页走），翻页时未保存的草稿会关闭。
- **双语两栏各自独立（v0.72.5）**：两栏分别跟踪自己的可见页（左栏 `reader.page`、右栏 `dualRightPage`），**不做页码同步**；进入双语时只做一次“落到当前页”的定位（每栏 slot 表算 `scrollTop`，120/420/900ms 重试），之后各滚各的。原文栏沿用主页图层（与单页/译文共用 `pdfdesk:annots:<book>:<code>:<page>`）；译文栏用 `ColumnInk` 组件，数据存在 `…:<page>:right` 后缀的键里，自带笔迹、橡皮、文字框和本地撤销栈；工具栏 ↶/↷ 跟着最后动过的那一栏（`activeSide`），两栏的栈互不影响。
- **译文栏笔记不导出**：`localChapterPages` 只把纯数字页码的键当作页面数据（`/^\d+$/`），`…:right` 的键不会并进导出/镜像；这是有意为之——译文栏是独立的一份笔记。
- **双语两栏自动适应（v0.72.9）**：只按**宽度**适应——`dualFit.left/right` 用栏宽和第一页 `scale:1` 宽度算出比例，页面填满栏宽，高度超出就上下滚；打开双语自动使用，`ResizeObserver` 在栏宽变化时重算。两栏各自的缩放是本地状态（`dualLeftScale`/`rightScale`，null = 自动），不再借用共享的 `reader.scale`/`onFit`；表头「适应屏幕」把它们清回 null（恢复自动），单页模式仍用原来的 `fitScale`。
- **表头悬停显示（v0.72.10）**：`.md-reader-colhead > :not(.md-reader-coltitle)` 默认 `opacity:0`、`pointer-events:none`，`transform: translateY(-3px)`；表头 `:hover`/`:focus-within` 时恢复，过渡 0.18s。标题始终可见，隐藏时不会误触按钮。
- **翻译状态行悬停显示（v0.72.12）**：`translateNote` 外面是 `.md-reader-note-reveal`，**高度为 0**，注记本身 `position:absolute` 悬浮在页面上方——平时完全不占阅读面积；`.md-reader-bar:hover ~`、`.md-reader-subbar:hover ~` 或该行自身 hover 时淡入并轻微下落复位（过渡 0.18s），悬停期间只覆盖页面顶部一小条，不改变布局。
- **文本框可连续放多个（v0.72.6）**：在任意一栏的文本框编辑中点击页面另一处，先保存当前草稿再在新位置开一个；空的新草稿不落盘（`index < 0` 且无文字），已有草稿清空保存等于删除。
- **跳过会话的新建会闪一下工作台**：新建走 `selectPanel('pdfdesk')` + 工作台自己的 `resumeOrCreate`，创建后立刻切到会话；已有会话直接跳，不闪。
- **撤销/重做按页记录两端的编辑**（v0.71.0）：`pageHistory` 是 `book|code|page` 为键的模块级栈（上限 40 步），阅读器和右栏共用，所以哪一栏写的都能被另一栏的 ↶ 撤回；一次撤销同时恢复笔迹与框选。
- **遮罩的内存代价（v0.68.0 已降）**：整页只栅格化一次，所有框共用同一张位图（阅读器复用已有的整页 JPEG；右侧预览按页缓存最近两张）。以前是每个框一张整页 canvas。
- **框的可见性不跟随阅读器的「叠加」开关**：只要该页存在框，右侧就画出来（框是页面数据，不是开关状态）。
- **自动适应与滚动条**：`ResizeObserver` 测内容盒宽度，理论上「刚好不再出竖滚动条」的边界可能来回一次，差值 ≤1px 时忽略。
- **同一章多个标签**：地址即内容 id，同一章在同一栏只有一张标签；重复打开是「指向同页」而不是新标签。
- **跨书跳转**：`openFromSide` 会先切书页再开阅读器，避免「返回章节」落到旧书。
- **桌面挂件遮挡**：`dsh-whale-widget-bowl` 的根节点是 `.dshwv-root`（`position:fixed; z-index:9999`，本身 `pointer-events:none`），跨插件无法把它压到页面下方，所以做成**悬停淡化**：指针进入预览时给 `body` 打 `data-pdfdesk-reading`，注入的样式把它淡到 28%；该插件不在时规则匹配不到元素。若以后挂件类名变了，淡化失效但不影响阅读功能。

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
