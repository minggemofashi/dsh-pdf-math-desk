# 右侧文档预览接入 PdfViewer（详细设计 / 实施手册）

> 目标：点「提取 / 答疑 / 习题」跳转会话后，右侧文档标签页里的 PDF 预览用数学工作台自己的 `PdfViewer` 渲染，并与插件阅读器**同步页码、缩放、模式、遮罩、标注和文件版本**。
>
> 状态：设计已定稿；实施按第 6 节顺序推进，每步可独立验收。当前版本 v0.60.x。

---

## 1. 现状与结论

- 右侧预览**不是插件面板**。插件在点击三个会话按钮后调用：

  ```js
  sidebar.openResource(`dsh-resource://file/session/${sessionId}/${rel}`, { destination: 'sidebar' })
  ```

  由 DSH 的文档标签页渲染（见 `client.js` 的 `openPdfInSession`）。
- 插件自身的 `PreviewPane` 只用于左侧书架/章节里的产物预览，与右侧无关。
- 已查证的客户端 Slot（`cordis_inspect_query` → client/Slots）：

  | Slot | kind | scope | 用途 | replaceRisk |
  | --- | --- | --- | --- | --- |
  | `sidebar.right.tab.document.office.pdf` | keyed | session | PDF 呈现（“PDF presentation supplied with Office-owned converted bytes”） | none |
  | `sidebar.right.tab.document` | keyed | session | 文档标签页主体 | shadows-shipped-ui |
  | `sidebar.right.tab.document.actions` | list | session | 文档标签页动作区（可加“在数学工作台打开”） | none |
  | `sidebar.right.pane.tab` | keyed | session | 右侧面板候选标签 | shadows-shipped-ui |

- `sidebar.right.tab.document.office.pdf` 的 `keyDomain` 是 **open**（owner 派发任意键），目前 `none are taken yet`——需要运行时探测实际 key。

---

## 2. 目标 / 非目标

**目标**
1. 右侧预览 PDF 用 `PdfViewer` 渲染：缩放、翻页、连续/单页、适应宽度；
2. 右侧与插件阅读器状态互通（第 3 节契约）；
3. 遮罩（叠加框）与标注在右侧只读可见，数据来自同一份 localStorage；
4. 译文/叠加文件变化后两侧同时换新（`docRev`）；
5. 标签页动作区提供“在数学工作台打开”，回到插件阅读器对应页。

**非目标**
- 右侧不做翻译、导出、会话创建；
- 不做双栏页叠加（已决定停掉）；
- 不改 DSH 对 docx/xlsx 等其它文档类型的呈现。

---

## 3. 同步契约

### 3.1 状态形状

```ts
type ViewerKey = `${string}:${string}`          // bookId:code
interface ViewerState {
  page: number                                   // 1-based
  scale: number | null                           // null = 适应宽度
  mode: 'single' | 'continuous'
  docRev: number                                 // 文件版本（mtimeMs 或递增计数）
  annotRev: number                               // 遮罩/标注变更计数
  origin: 'reader' | 'side'                      // 广播来源，接收方忽略同源消息
}
```

### 3.2 同步规则

| 事件 | 广播 | 接收方行为 |
| --- | --- | --- |
| 翻页（按钮/页码框/滚动） | `page` | `scrollToPage(page)`；`origin` 相同则忽略 |
| 缩放、适应宽度 | `scale` | 设为本视图缩放；窄容器允许再按宽度适配，但百分比显示一致 |
| 单页/连续切换 | `mode` | 切换布局，保留当前页 |
| 遮罩/标注写入 | `annotRev+1` | 重新读 localStorage 对应页，重画图层 |
| 译文/叠加文件变化 | `docRev+1` | 带 `&rev=` 重新 `getDocument` |

### 3.3 总线实现（复用现有 `viewerBus`）

`client.js` 顶部已有 `viewerBus`（`bumpViewer` 用于强制重绘）。扩展为按 key 分发的最小总线：

```js
const viewers = new Map()            // ViewerKey -> { state, listeners:Set, publish }
function viewerFor(key) { /* get or create */ }
function publish(key, patch, origin) // 合并 state → 通知所有 listeners（跳过同源）
function subscribe(key, listener)    // 返回 dispose
```

- 阅读器挂载时 `subscribe(bookId+':'+code, ...)`，卸载时 dispose；
- 总线只存“视图状态”，**不存数组**（遮罩/标注仍在 localStorage，避免双份真相）。

---

## 4. 资源取数

右侧拿到的是 `dsh-resource://file/session/<session>/<rel>` 地址，pdf.js 无法直接读。两条路：

### 4.1 方案 A（推荐）：Host 代理

`GET /mathdesk/resource-proxy?session=<id>&rel=<relative path>`

- 校验：`rel` 必须是 PDF 后缀、规范化后位于该会话工作目录内（`path.relative` 不以 `..` 开头）；
- 响应：`sendBytes(..., 'application/pdf')`，`cache-control: no-store`（复用 `http.js` 的 `sendBytes`）；
- 失败码：`bad-path` / `missing` / `too-large`（沿用 `readPdf` 的限制）；
- 客户端把它拼成 pdf.js 的 `url`，并附 `&rev=<docRev>`。

### 4.2 方案 B：Slot props 直读

若 slot renderer 收到的 props 里已带 `bytes` / `blob` / 可直接 `fetch` 的 `url`，则跳过代理，直接把数据给 `PdfViewer`（`doc` 参数已支持传入 pdf.js 文档）。

> 实施第 1 步就是探测：注册临时 renderer 打印 props 形状，决定走 A 还是 B。

---

## 5. 客户端接入形态

### 5.1 注册（与现有 slot 注册同风格）

```js
ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document.office.pdf', () => ctx.slots.register({
  name: 'sidebar.right.tab.document.office.pdf',
  key: DISCOVERED_KEY,          // 第 1 步探测到的 key
}, SidePdfView)), 'mathdesk: side pdf viewer')
```

### 5.2 `SidePdfView` 组件

- 只渲染：`PdfViewer`（`variant: 'column'` 复用同组件）+ 只读 `masksLayer` + 只读 `annotLayer`；
- 工具栏最小化：页码“第 x / y 页”、`− 适应宽度 +`、单页/连续切换；
- 状态来自总线；`onVisible` / `onScale` 回写总线（带 `origin: 'side'`）；
- 数据：`masks`/`annots` 从 `mathdesk:masks|annots:<书>:<章>:<页>` 读，`annotRev` 变化时重读；
- 文件：`docRev` 变化时重新 `getDocument`（URL 带 `rev`）。

### 5.3 阅读器侧改动

- `ReaderView` 在 `page/scale/mode` 变化时 `publish(key, {...}, 'reader')`；
- 订阅总线，收到 `side` 来源时只更新自身滚动/缩放，不再回发；
- 已有 `docRev`（v0.60.0 引入）接入总线，翻译完成时 `publish(..., { docRev+1 })`。

### 5.4 标签页动作

`sidebar.right.tab.document.actions` 注册一个按钮“在数学工作台打开”：

```js
ctx.slots.register({ name: 'sidebar.right.tab.document.actions', key: ... }, OpenInDeskButton)
```

点击：`openResource` 关闭 + 面板切到 `main`（`PANEL_ID`）+ `openReader({bookId, code, page})`。

---

## 6. 实施顺序（每步验收）

1. **探测 slot**：临时 renderer 打印 `key`/`props`；确认是否需要代理。验收：控制台出现一次真实 key 与 props 形状。
2. **边路打通**：在 `main` 面板里渲染一个“测试侧预览”组件，用 `resource-proxy` 打开当前章 PDF。验收：能翻页/缩放。
3. **抽 `SidePdfView`**：复用 `PdfViewer`；只读遮罩/标注。验收：右侧打开同一章，页码与阅读器一致（单向）。
4. **双向总线**：翻页/缩放/模式双向同步，`origin` 防回声。验收：任一侧翻页另一侧跟随，不抖动。
5. **标注/遮罩同步**：一侧新增/删除，另一侧 100ms 内重画。验收：画一笔，右侧出现；右侧无编辑入口。
6. **文件版本同步**：触发「补译缺失页」/重新翻译，两侧自动换新。验收：不重开阅读器即可看到新译文。
7. **动作区按钮**：右侧“在数学工作台打开”跳到对应页。验收：页码一致。

## 7. 验收矩阵

| 场景 | 期望 |
| --- | --- |
| 阅读器翻到第 5 页 | 右侧跟到第 5 页 |
| 右侧翻页 | 阅读器跟到同页，页面不跳动 |
| 阅读器放大到 200% | 右侧同样 200%（容器窄出现横向滚动） |
| 画一笔标注 | 右侧出现同一笔；点击右侧不能编辑 |
| 翻译完成 | 两侧都显示新 `_translated.pdf` |
| 关闭右侧标签 | 阅读器不受影响，总线监听清理 |

## 8. 风险与开放问题

- **dispatch key 未知**：key 域 open，可能随文档类型变化；需要兜底（key 不符则不注册，退回 DSH 原生呈现）。
- **`dsh-resource://` 能否 fetch**：若 DSH 内部有专用 loader，方案 A 的 `resource-proxy` 必须落到真实文件路径（会话工作目录下）；需要确认会话目录映射（`sessions` service 是否暴露目录）。
- **两侧同时为活动滚动源**：必须靠 `origin` + 150ms 去抖，否则会互相拖拽。
- **性能**：右侧容器窄，`PdfViewer` 的 `fitScale` 会得到较小值，属预期；连续模式窗口化（v0.58.0）已复用。
- **不改变现有行为**：若 slot 探测失败，插件保持现状（DSH 原生 PDF 预览），不阻塞其它功能。

## 9. 关键代码位置

| 用途 | 位置 |
| --- | --- |
| 当前打开右侧预览 | `client.js` `openPdfInSession` |
| 阅读器与 PdfViewer | `client.js` `ReaderView` / `PdfViewer` |
| 遮罩/标注数据键 | `mathdesk:masks|annots:<书>:<章>:<页>` |
| 文件路由与 `rev` | `src/host/routes.js` `/pdf`（`variant`、`rev`） |
| 现有 slot 注册范例 | `client.js` `apply()` 里的 `ctx.slots.inject('sidebar.panellist' | 'main')` |
| 新代理路由落点 | `src/host/routes.js` `/mathdesk/resource-proxy` |
