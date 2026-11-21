# 右侧文档预览接入 PdfViewer（设计稿）

> 目标：点「提取 / 答疑 / 习题」后，DSH 右侧文档标签页里的 PDF 预览，用数学工作台自己的 `PdfViewer` 渲染，并与插件阅读器**同步状态与文件版本**。

## 1. 结论（已查证）

- 右侧预览不是插件面板，是 DSH 自带的文档标签页：插件调用 `sidebarRight.openResource('dsh-resource://file/session/<session>/<rel>', { destination: 'sidebar' })` 交给 DSH。
- DSH 留有 PDF 呈现扩展点（客户端 Slot 树查得）：

  | Slot | kind | scope | 说明 |
  | --- | --- | --- | --- |
  | `sidebar.right.tab.document.office.pdf` | keyed | session | 「PDF presentation supplied with Office-owned converted bytes」，`replaceRisk: none`，key 域 open，**目前无人占用** |

- 同族还有 `sidebar.right.tab.document`、`.action(s)`、`sidebar.right.pane.tab` 等，可用于在标签页里加「在数学工作台打开」入口。

## 2. 待解决的三件事

1. **dispatch key**：该 Slot 是 keyed，键由文档标签页的 owner 派发（key 域开放）。需要运行时探测：注册一个临时 renderer，打印收到的 key，确认是 `pdf` 还是别的。
2. **资源取数**：预览资源是 `dsh-resource://` 地址。pdf.js 需要 HTTP 可取的数据，两条路：
   - a. Host 代理：`GET /mathdesk/resource-proxy?path=<rel>&session=<id>` → 读文件字节返回（只允许该会话目录内、pdf 后缀）；
   - b. 若 Slot 渲染器直接拿到 Blob/ArrayBuffer，则无需代理。
3. **共享状态**：阅读器与右侧预览共用一份状态，见第 3 节。

## 3. 同步契约

键：`<bookId>:<code>`，字段：

```ts
{ page: number; scale: number | null; mode: 'single' | 'continuous'; docRev: number }
```

- **页码**：任一视图翻页 → 广播 `page`；接收方 `scrollToPage(page)`，不反向触发（防回声，用 `origin` 标记）。
- **缩放/模式**：广播 `scale`/`mode`；右侧窄，允许按容器宽度再适配一次，但显示百分比一致。
- **遮罩/标注**：不广播数组，双方都读同一份 `mathdesk:masks|annots:<书>:<章>:<页>`，任何写入方 `localStorage.setItem` 后广播 `annotRev`，对方重读。
- **文件版本**：`docRev` 递增即表示 `_translated.pdf` / `_overlay.pdf` 已变（翻译完成、补译、`/rebuild-translated`、`/rebuild-overlay`）；两边都带 `&rev=` 重新 `getDocument`，避免 pdf.js/浏览器缓存旧文件。

实现：复用 `client.js` 里已有的 `viewerBus`（`bumpViewer`），扩展成按 `book:code` 分组的轻量总线，避免两套 React 状态各写一份。

## 4. 步骤（每步可验收）

1. 注册临时 renderer 到 `sidebar.right.tab.document.office.pdf`，确认 dispatch key 与收到的 props（是否带 `url`/`bytes`）。
2. 若需要代理：Host 加 `resource-proxy` 路由（限定会话目录、`application/pdf`、no-store），客户端用该 URL 喂 pdf.js。
3. 抽出 `SidePdfView`：同一个 `PdfViewer` + `masksLayer` + `annotLayer`，不显示工具栏（右侧窄），页码/缩放由总线驱动。
4. 接通总线：阅读器广播/接收、右侧广播/接收；标注写入后广播 `annotRev`。
5. 文件版本：Host 的 `translated-info`/`rebuild-*` 返回 mtime 作为 `docRev`，两边监听后重载。
6. 标签页里加「在数学工作台打开」按钮（`sidebar.right.tab.document.actions`）。

## 5. 不做什么

- 不在右侧做翻译/导出/会话创建，只做「读」；
- 不做双栏页叠加（已决定）；
- 不动 DSH 自带的其它文档类型（docx/xlsx）呈现。
