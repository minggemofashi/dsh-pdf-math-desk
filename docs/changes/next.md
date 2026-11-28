# 待发布批次（2026-11-28）

> 状态：**未提交、未发版**。供 ci 对照 `git diff` 审阅，并据此写 CHANGELOG 与 Release 说明。
> 本批改动文件：`client.js`、`src/host/routes.js`、`src/host/storage.js`、`tools/pdf_thumbs.py`、`docs/todo.md`、`docs/changes/next.md`。
> 仓库外新增/更新的验证脚本在 `.dsh-scratch/`（不进 git）：`split-page-preview-test.mjs`、`highlight-pen-test.mjs`、`shelf-nested-create-test.mjs`、`unimportant-cache-test.mjs`；更新 `split-thumbs-route-test.mjs`、`storage-test.mjs`、`t08-test.mjs`、`ui-polish-test.mjs`、`change-record-test.mjs`。
> **2026-11-28 追加（反色阅读）**：只改 `client.js` 与 `docs/todo.md`/本节；新增仓库外 `paper-invert-test.mjs`，并因新 React 依赖更新 `column-ink-test.mjs`、`notes-test.mjs` 的测试注入（不改产品行为）。本文第八节为该项记录。
> **2026-11-28 追加（阅读交互四项）**：荧光笔粗细、悬停面板、章节对比度、触控板缩放；新增 `rail-hover-test.mjs`、`chapter-contrast-test.mjs`、`trackpad-zoom-test.mjs`，更新 `highlight-pen-test.mjs`、`note-style-test.mjs`。本文第九节为该项记录。
> **2026-11-28 追加（阅读器 UI 三项）**：竖排工具条框/图标对齐、窄宽顶栏单行、右栏反色按钮；只改 `client.js` 与文档。新增仓库外 `reader-ui-geometry-test.mjs` 与静态画廊 `reader-gallery.mjs`；更新 `rail-hover-test.mjs`、`issue6-side-bar-rail-clearance-test.mjs`、`issue6-rail-hit-test.mjs` 的过期几何断言（未放宽检查）。本文第十节为该项记录。
> **2026-11-28 追加（竖排条让位 + 书架面包屑）**：用户手测反馈「PDF 页顶部工具栏把竖排工具条遮住了」，并要求继续做面包屑。只改 `client.js` 与文档；新增 `shelf-breadcrumb-test.mjs`、`ui-probe/crumb-gallery.mjs`，`reader-ui-geometry-test` 增到 28 条，更新 `issue6-side-bar-rail-clearance-test.mjs`、`shelf-view-single-source-test.mjs`。本文第十一节为该项记录。
> **2026-11-28 追加（文字增强 FUNC-1）**：用户拍板「对比度效果不好」，改为三档文字增强；对话确认三档、所有档只处理近灰像素、入口为右栏 `⋯` + 主阅读器 `⌄` 子栏。只改 `client.js` 与文档；新增 `paper-enhance-test.mjs`、`ui-probe/enhance-gallery.mjs`；删除 `chapter-contrast-test.mjs`（旧功能已移除），按新滤镜语法更新 `paper-invert-test.mjs`。本文第十二节为该项记录。

## 一、用户可感知的变化（CHANGELOG 取这一段）

1. **拆分面板双击看整页大图**：按页拆分时，双击任意页的缩略图会打开同页大图，低质量扫描件也能看清章号/标题；点暗处、按 Esc 或右上角 × 关闭。Esc 只关预览、不关拆分面板，已排好的拆点不会丢。
2. **笔新增「荧光笔」形态**：主阅读器和右侧预览的笔设置里可以在「笔 / 荧光笔」之间切换；荧光笔很粗（22px）、半透明（38%），有黄/绿/粉/蓝四色，用来整行标记；粗细与透明度固定，不用每次调。没有新增工具条按钮。
3. **书架内新建书架＝真正的嵌套**：在一个书架里选中书 → 「新建书架」，这些书会**移入**新书架，原书架不再重复列出它们；其它书架里的同一本书保留不动。新建出的子书架还能继续这样往下嵌套；嵌套创建时会提示「已加入「新书架」：N 本」。
4. **「不重要缓存」统一清理**：设置 → 数据里原来只清翻译缓存的区块改名为「不重要缓存」，一次清掉逐页翻译缓存 + 拆分面板的缩略图（240px）与预览大图（1200px）；存储占用面板新增「拆分缩略图与预览大图」一行，能先看到占了多少再清。**不会**重新翻译、不会删译文 PDF、标注、书架或回收站；缩略图下次打开拆分面板时重建。

## 二、内部与契约变化（不写进 CHANGELOG）

- `client.js`
  - **拆分预览**：新增 `SPLIT_PREVIEW_WIDTH = 1200` 与 `SplitPagePreview`（Host：`POST /pdfdesk/pdf-layout` 单页 `w=1200`，用响应里的 `width`/`v` 拼 `pdf-thumb` URL；pdf.js 回退：按 window 宽度 × DPR 画大画布）；`SplitDialog` 新增 `previewPage`、缩略图 `onDoubleClick`、Esc 分层关闭（`previewPageRef`）；新增 CSS `.md-split-lightbox*`；新增 locale `splitPreviewHint` / `splitPreviewTitle` / `splitPreviewFailed`。
  - **荧光笔**：新增常量 `HIGHLIGHT_COLORS`（4 色）、`HIGHLIGHT_WIDTH = 22`、`HIGHLIGHT_OPACITY = 0.38`；新增共用组件 `PenStyleControls`（主阅读器 `annot*` 与右栏 `side*` 各自的状态传入）；`createInkGestures` 新增可选 `opacity`（写进笔画）与 `flat`（提交时去掉压感，保证高亮带宽度均匀）；两个视图各加 `markerPen` / `sideMarkerPen`（`highlight && tool === 'pen'`），所以笔设成荧光笔时选形状工具仍画普通形状；两栏草稿与 `InkMarks` 按 `entry.opacity` 渲染，缺省仍是 1；选中面板的笔画粗细滑杆上限 10→40；新增 locale `annotPenKind` / `annotPenPlain` / `annotHighlight` / `annotHighlightHint` / `annotHighlightColor`。
  - **书架嵌套**：新增纯函数 `shelfCreateFromSelection(groups, parent, name, ids)`，`createShelf` 改走它；父书架为真实书架时从中移除选中的书，`parent === 'hidden'` 时维持原有「挂在隐藏下、不动书架」的行为。
  - **不重要缓存**：存储面板 `storageLabel` 新增 `thumbs: 'storageThumbs'`；`clearTranslationCache` 读取响应里的 `thumbs` 计数并拼进结果提示（`dataCacheThumbs`）；区块标题/说明/确认/按钮文案改为「不重要缓存」；`storageCleanConfirm` 的「不受影响」清单补上拆分缩略图。
- `src/host/storage.js`：`measureStorage` 新增 `thumbs` 分区（`<dataDir>/thumbs`，`safe: 'rebuild'`），报告从 11 区变 12 区；模块头「可重建」清单补上缩略图/预览图。
- `src/host/routes.js`：`POST /pdfdesk/clear-translation-cache` 在清完翻译缓存后，再逐个删除 `<dataDir>/thumbs/<缓存 key>/`，响应新增 `thumbs` 计数；`removed` / `skipped` 语义不变。`/pdfdesk/pdf-layout` 的 `THUMB_WIDTH_MAX` 480 → 1600（网格仍 240；预览 1200）。
- `tools/pdf_thumbs.py`：`WIDTH_MAX` 480 → 1600，与 Host 一致。
- 回归脚本：
  - **新增** `unimportant-cache-test.mjs`（21 条）：`measureStorage` 的 thumbs 分区、按钮路由一次清翻译缓存+缩略图、响应 `thumbs` 计数、重复点击幂等、GET 405、客户端文案/接线。
  - `storage-test.mjs`：分区计数 11→12、可重建清单加入 `thumbs`。该文件在一次 PowerShell 编码事故中损坏，已按原逻辑重建（46 条断言，未放宽任何检查），事故只影响这份仓库外测试脚本，未触碰仓库或用户数据。
  - `t08-test.mjs`：把「按下即选中」的过期断言改成实际行为——按下保留草稿（可在旧框上拖出新框），松开未移动才选中旧框且不开编辑器。
  - `ui-polish-test.mjs`：`md-reader-modes` 的 gap 断言 2px→4px（提交代码自 `695cc00` 起就是 4px）；删除对已不存在的 `bookOverwriteConfirm` 的断言。
  - `change-record-test.mjs` 的「本批已改文件」清单刷新为本批（旧清单是 v1.5.2 归档后遗留）。

## 三、受保护契约核对

| 契约 | 是否改动 | 说明 |
| --- | --- | --- |
| `package.json` 的 `exports` / `engines` / `dsh` | 未改 | — |
| `cordis.patch.yml` | 未改 | — |
| `/pdfdesk/*` 路由 | 未新增/删除 | `pdf-layout` 可接受宽度 480→1600；`clear-translation-cache` 的删除范围扩大（多清 `thumbs/`），响应新增可选 `thumbs` 字段，`removed`/`skipped` 与调用方式不变，GET 仍 405 |
| Host/浏览器共享事件名 | 未改 | — |
| locale 键结构 | 只新增/改值 | 新增 `dataCacheThumbs`、`storageThumbs`；改值 `dataCacheTitle/Hint/Clear/Confirm`、`storageCleanConfirm`；中英成对，`check-keys` 通过 |
| `~/.dsh/pdfdesk/` 与 `.pdfdesk/` 存储键 | 未改 | 新增删除目标 `~/.dsh/pdfdesk/thumbs/`（本就可重建）；笔画多一个可选 `opacity`，旧笔画按 1 渲染 |
| `shelves.json` 结构 | 未改 | 只改 `shelves[].books` 的内容；`hidden`、`version`、`parent` 语义不变 |
| 目录结构（分片/整本/产物/封面/索引） | 未改 | 预览图与网格缩略图共用 `thumbs/<缓存 key>/<宽>/`（新增可清理，不新增目录） |

## 四、验证记录（全部退出码 0，除注明）

- 语法：`node --check client.js`、`node --check index.js`、`src/host/*.js` 全部 `node --check` → 0。
- 文本/依赖：`check-keys.mjs`（missing zh/en: none）、`check-deps.mjs`（533 条声明、无前向引用）→ 0。
- Host 与拆分：`host-test.mjs`、`split-thumbs-route-test.mjs`（含 1600 上限与 1200 预览用例）、`split-thumbs-client-test.mjs`、`split-ui-test.mjs`、`split-jump-test.mjs`、`split-entries-test.mjs`、`split-completion-test.mjs`、`split-catalog-flow-test.mjs`、`split-result-flow-test.mjs` → 0。
- 笔与标注：`ink-gestures-test.mjs`、**新增** `highlight-pen-test.mjs`（21 条，含负向对照）、`note-style-test.mjs`、`column-ink-test.mjs`、`history-test.mjs`、`canvas-test.mjs`、`u1-test.mjs`（58 条）、`t05-toolbar-test.mjs`、`t07-test.mjs`、`t10-test.mjs`、`page-store-test.mjs` → 0。
- 书架：`shelf-add-to-test.mjs`、`shelf-visibility-test.mjs`、`shelf-view-single-source-test.mjs`、**新增** `shelf-nested-create-test.mjs`（25 条，含负向对照）→ 0。
- **新增** `split-page-preview-test.mjs`（21 条）→ 0。
- 缓存与存储：**新增** `unimportant-cache-test.mjs`（21 条）→ 0；`storage-test.mjs`（重建后 46 条）→ 0；`retention-test.mjs`、`translation-cache-test.mjs`、`translate-ai-route-test.mjs` → 0。
- 两条历史失败已纠正：`t08-test.mjs` → 0（断言改为实际行为）；`ui-polish-test.mjs` → 0（gap 4px、去掉不存在的 key）。`t08` 的改动只是测试：实现与主阅读器一致，按下拖动＝新建框、按下即松开＝选中。
- 真实渲染冒烟：`py -3 tools/pdf_thumbs.py <样张> <tmp> 1200 1 1` → 0；478 ms、166 KB JPEG（含解释器启动）。
- 发布闸门：`release-guard-test.mjs` → 0；`change-record-test.mjs` → 0。

## 五、未覆盖 / 风险 / 需要手测

- **客户端不能热更**：以上四项都必须**重启 DSH** 后手测；未重启时 Host 仍按 480 上限返回，双击预览能开但不够大。
- 未做真实界面截图（重启会结束当前会话）；新样式只在静态检查里核对 token 与尺寸，布局需手测。
- 手测项：
  1. 拆分面板双击缩略图 → 大图出现、能看清章号；Esc 只关大图；再按 Esc 才关面板；拆点与滚动位置不变。
  2. 主阅读器与右栏分别悬停笔 → 「荧光笔」→ 选颜色 → 拖动：一条宽度均匀的半透明色带；切回「笔」后恢复原粗细/颜色；重开页面后荧光笔仍在。
  3. 书架里选中几本 → 新建书架：原书架不再列出这几本，新子书架里出现；在子书架里再建一层仍可嵌套；其它书架里的同一本书不受影响。
  4. 设置 → 数据：存储占用出现「拆分缩略图与预览大图」；点「清理不重要缓存」→ 确认文案写明翻译缓存与缩略图 → 完成后提示「已清除 N 项缓存（其中 M 项是缩略图缓存）」；再打开拆分面板缩略图重新生成、预览大图仍可双击。
- 未覆盖 / 风险：
  - **不做定时静默删除**（DEC-0014：保留期清理是按钮，不是定时器）。按用户选择保留预览缓存，靠「不重要缓存」按钮清；如果长期不点，1200px 预览图会继续占用磁盘。
  - 清理时若正好有一个缩略图渲染在跑，它完成后可能重新写回少量文件；再点一次即可（不阻塞、不报错）。
  - 清空缩略图后第一次打开拆分面板要重新渲染首屏，约几百毫秒；不影响 PDF、标注与拆点记忆。
  - A0 等超大页首次 1200px 渲染耗时与缓存体积未测。
  - 荧光笔固定 22px/38%，不提供单独调粗细；选中已有荧光笔画后可在选择面板改颜色/粗细/透明度（粗细上限已放宽到 40）。
  - 从「隐藏书籍」里新建书架仍沿用现状：新书架挂在隐藏下、不从任何书架移书（未在本次范围内改）。
  - 删除父书架会连带删除其子书架（既有逻辑，未改）。

## 六、版本建议与 CHANGELOG 草稿

- 版本建议：**minor**（`1.6.0`，四项都是用户可感知的新增能力）；是否发布由用户明确指令，本批不发布。
- CHANGELOG 草稿：
  - 拆分面板：双击页码缩略图可看整页大图，扫描质量差的书也能核对章号；Esc 先关预览、再关面板，拆点不丢。
  - 标注：笔新增荧光笔形态（22px、半透明、四色），主阅读器与右侧预览一致，适合整行标记。
  - 书架：书架内新建书架会把选中的书移入新书架，子书架可继续嵌套，不再只是复制一份留在原书架。
  - 存储：设置 → 数据的「不重要缓存」一次清掉翻译缓存、拆分缩略图与预览大图，存储面板先显示缩略图占用；不会动译文 PDF、标注、书架和回收站。

## 七、给 ci 的审阅清单

- [ ] `git diff` 只含 `client.js`、`src/host/routes.js`、`src/host/storage.js`、`tools/pdf_thumbs.py`、`docs/todo.md`、`docs/changes/next.md`；`.dsh-scratch/` 不进 git。
- [ ] 改动对应 `SplitPagePreview`/`SplitDialog`、`PenStyleControls`/`createInkGestures`、`shelfCreateFromSelection`/`createShelf`、`clearTranslationCache`/`measureStorage`；没有新增工具条按钮、没有第三份页状态/标注监听。
- [ ] 契约表逐项对照：路由只放宽宽度上限并扩大一个清理动作的删除范围、locale 只加键/改值、`shelves.json` 结构未改、笔画只多一个可选字段。
- [ ] 验证命令与退出码与第四节一致；两条历史失败已纠正为测试断言（不是产品行为变化）。
- [ ] 版本号、tag、push、npm、Release 均未动；发布前请用户先完成第五节手测。

## 八、反色阅读（2026-11-28 追加，未提交）

> 方案：工作区根《PDF阅读插件-反色阅读-方案-2026-11-28.md》。只改 `client.js`；不碰 Host/路由/存储 schema/locale 结构。
> 客户端不能热更，本节功能需重启 DSH 手测。

### 8.1 用户可感知的变化（CHANGELOG 取这一段）

1. **反色阅读（夜间黑纸）**：主阅读器顶栏和右栏 `⋯` 菜单各有一个「反色阅读」开关；设置 → 阅读可选「跟随深色主题 / 始终开 / 始终关」。跟随深色主题时，DSH 切到深色自动变成黑底白字，切回浅色恢复白纸；手动开关会记住本机，重启后保持，两处表面实时同步。
2. **只反纸面**：PDF 原文/译文页、叠加模式的 DOM 译文层、遮罩里的译文页位图变黑底白字；彩色插图/图表保留色相。工具栏、右栏、书架、设置、拆分面板、封面、缩略图、导出/打印不反色。
3. **单色墨**：黑/白合并成一个随纸面切换的墨色。旧黑色笔迹/文本笔记在反色下自动显示白色，关掉反色变回黑色；红/蓝/绿等彩色笔与荧光笔保持原色；白色不会在反色下变成黑色。形状填充新增白色（字面色，不做模式映射）。
4. **框与输入框**：框选、文字框/遮罩框拖拽虚线、遮罩框、问号框、选中描边、缩放把手与遮罩 grip 在反色下统一变白（深色晕）；文本笔记的占位符、光标和输入文字也是白色。普通模式仍为品牌蓝 + 白色晕。

### 8.2 内部与契约变化（不写进 CHANGELOG）

- **原因**：DSH 深色主题只改 shell token，PDF canvas 仍是白纸，夜间阅读刺眼；若只翻转纸面，旧黑色笔迹/文本在黑色纸面上会消失，所以需要单色墨映射和一套随纸面切换的框色变量。
- `client.js`
  - **状态**：新增 `PAPER_MODE_KEY = 'pdfdesk:paper-mode'`、`PAPER_MODE_EVENT`、`PAPER_MODES = ['auto','on','off']`、`readPaperMode`/`writePaperMode`、`readThemeDark`、`usePaperMode`；`writePaperMode` 写 localStorage 并广播 CustomEvent，`storage` 事件兜底跨窗口；`usePaperMode` 监听 `body[data-ds-dark-theme]` 的 MutationObserver、`data-ds-theme-source` 与 `prefers-color-scheme` 兜底，返回 `{ mode, inverted, setMode }`。
  - **主题标记**：核对当前安装的 DSH `app.asar` 中 `ThemePresenter.apply()` 源码：深色执行 `body.setAttribute('data-ds-dark-theme', '')`，浅色 `removeAttribute`；因此用存在性判断，不依赖属性值。
  - **纸面滤镜**：新增 `PaperInvertContext`（在宿主提供 `React.createContext` 时创建；静态测试桩没有该 API 时降级为非反色树）、`usePaperInvert`、`PaperInvertProvider`；主阅读器与右栏根节点按 `data-paper="invert"` 加 CSS `filter: invert(1) hue-rotate(180deg)`，只落在 `.md-reader-canvas`、`.md-overlay-text`、`.md-mask-page-image`，`.md-annot`/`.md-reader-page-wrap` 不带滤镜；canvas 底 `#fff`、page-wrap 底 `#000` 防闪。`#000/#fff` 只作纸张色并在 CSS 注释说明。
  - **单色墨**：新增 `MONO_DARK/MONO_LIGHT`、`PEN_COLORS`、`normalizeHex`/`hexLuminance`/`paperInkColor`/`monoInk`/`isMonoInk`/`penPalette`/`notePalette`；`InkMarks`、`ShapeMark`、`NoteEditor`、`ColumnInk`、两栏草稿与 `StaticInk` 走映射；形状填充（rough 与 clean 两条路径）只映射描边，填充保持字面值；荧光笔四色不变。
  - **固定色 → 变量**：`.md-reader, .md-side` 新增 `--annot-ui-ink`（`--pdf-accent` 回退 blue-600）、`--annot-ui-bg`、`--annot-ui-halo`/`--annot-ui-halo-invert`；反色块把 ink 改 `#fff`、bg 改 `#000`、halo 改深色。marquee/selection/question/mask/note editor/shape handle/mask grip/note grip/只读遮罩全部改用变量；选中 SVG 描边与三处文字框草稿改用 `style={{ stroke: 'var(--annot-ui-ink, #2f6df6)' }}`；`NOTE_COLORS` 保留数组，文本首项用 `notePalette`；四处笔色板统一走 `penPalette`。**取舍**：方案原文写 `--dsw-alias-brand-primary`，但当前 DSH 的 brand-primary 在浅色近黑、深色近白，不是蓝色；按方案“普通模式框保持品牌蓝”改用插件 `--pdf-accent`（light blue-600 / dark blue-400），否则问号/遮罩框会从蓝变黑/白。
  - **入口**：主阅读器顶栏 `md-paper-toggle`（32px 图标，`aria-pressed`，☾/☀）；右栏 `menuActions` 新根行 `id: 'paper'`（带 ✓）；设置 → 阅读新增三档 `select`（直接 `usePaperMode()`，不新增 props）。
  - **文案**：新增 `paperInvert`、`paperInvertHint`、`paperInvertAuto`、`paperInvertOn`、`paperInvertOff`、`paperInvertSettingHint`，中英成对。
- 回归脚本：新增 `paper-invert-test.mjs`（48 条，含三条负向对照）；`column-ink-test.mjs`/`notes-test.mjs` 只更新测试注入（新增 `usePaperInvert`/`paperInkColor`/`notePalette`/`isMonoInk` 桩），不改变产品行为。

### 8.3 受保护契约核对

| 契约 | 是否改动 | 说明 |
| --- | --- | --- |
| `package.json` 的 `exports` / `engines` / `dsh` | 未改 | — |
| `cordis.patch.yml` | 未改 | — |
| `/pdfdesk/*` 路由 | 未改 | 不新增/删除路由 |
| Host/浏览器共享事件名 | 未改 | 新增的 `pdfdesk:paper-mode` 只是本机 `window` 广播，不跨 Host |
| locale 键结构 | 只新增 | 6 个键中英成对，`check-keys` 通过 |
| `~/.dsh/pdfdesk/` 与 `.pdfdesk/` 存储键 | 未改 | 新增浏览器 localStorage `pdfdesk:paper-mode`（显示偏好，不进 Host 数据） |
| `shelves.json` / 标注数据 schema | 未改 | 白色作为合法颜色值写入；旧数据不迁移，渲染时映射 |

### 8.4 验证记录（全部退出码 0）

- 语法：`node --check client.js`、`node --check index.js`、`src/host/*.js` 全部 `node --check` → 0。
- 文本/依赖：`check-keys.mjs`（missing zh/en: none）→ 0；`check-deps.mjs`（532 条声明、无前向引用）→ 0；`host-test.mjs` → 0。
- **新增** `paper-invert-test.mjs`：48 条（纯函数、CSS 三层滤镜范围、单色墨、三入口、文案、负向对照）→ 0。
- 标注/阅读器：`note-style-test.mjs`、`column-ink-test.mjs`、`notes-test.mjs`、`ink-gestures-test.mjs`、`highlight-pen-test.mjs`、`history-test.mjs`、`canvas-test.mjs`、`u1-test.mjs`、`t05-toolbar-test.mjs`、`t07-test.mjs`、`t08-test.mjs`、`t10-test.mjs`、`pen-cursor-test.mjs`、`ui-polish-test.mjs` → 0。
- 拆分/存储/发布闸门：`split-page-preview-test.mjs`、`split-thumbs-route-test.mjs`、`split-thumbs-client-test.mjs`、`split-ui-test.mjs`、`split-jump-test.mjs`、`split-entries-test.mjs`、`split-completion-test.mjs`、`split-catalog-flow-test.mjs`、`split-result-flow-test.mjs`、`storage-test.mjs`、`unimportant-cache-test.mjs`、`release-guard-test.mjs`、`change-record-test.mjs` → 0。
- `split-active-library-test.mjs`、`split-after-import-test.mjs` 本轮尝试时在真实拆分接口处因沙箱 `spawn EPERM` 失败；失败点是 Python 拆分进程，不是反色阅读代码。
- 环境/历史失败（已用改动前 `client.js` 备份复跑确认与本次无关）：`overlay-text-layer-dom-test.mjs` 因本机 Edge 调试端口 9444 未起来而失败；`side-page-drift-test.mjs` 断言 `chosen` 与现状 `page` 不符；`reading-memory-test.mjs` 的 preload cache 断言、`dual-overlay-test.mjs` 的测试桩缺 `useCallback`、`copyright-and-deps-test.mjs` 的 README PyMuPDF/TeX 文案，均为本次改动前已存在的失败，按“范围外只记录”处理。

### 8.5 未覆盖 / 风险 / 需要手测

- **客户端不能热更**：必须重启 DSH 后才能看到按钮、三档设置与纸面反色；重启结束当前会话，因此本批未做真实界面截图。
- **主题标记**：已从当前安装的 DSH `app.asar` 核对 `ThemePresenter.apply()`（深色 set empty、浅色 remove）与 MutationObserver 用法；仍需真机切一次深/浅主题确认 MutationObserver 即时生效。
- **叠加模式双层文字**：DOM 译文层是透明层压在原文页上，两层都会各自反色；真机需核对是否出现「双层文字」。若出现，优先给文本层加随模式纸色底或只反原文层，不做延时/遮罩。
- **连续模式性能**：5 页常驻、200%/300% 缩放、大页滚动时滤镜开销未实测；若明显掉帧，按方案缩小到当前页，不加延时。
- **旧数据**：不迁移；关掉反色后完全恢复原色。白色值在普通模式下按「单色墨」显示为黑（不是不可见）。
- **彩色墨在黑色纸上可能偏暗**：红/蓝/绿不自动提亮（与原方案一致），需要更亮时用户手动换色；不为此改存储或自动调色。
- 手测矩阵（重启 DSH 后）：
  1. 触发：深色主题自动开/关；顶栏按钮强制开/关；设置三档；刷新/重启保持；右栏 `⋯` 与主阅读器同步。
  2. 视图：单页、连续、双语、译文、叠加、右栏。
  3. 纸面：纯文字页、彩色插图页、扫描页、200%/300% 缩放、连续滚动。
  4. 标注：旧黑/旧彩色、新单色/新彩色、荧光笔、形状描边/填充、选中重设色、文本笔记/占位符/光标。
  5. 框：marquee、文字框、遮罩框、问号框、把手、选中描边。
  6. 非范围：拆分面板、封面、导出/打印保持原样。
- 截图说明：方案要求 1280/1600/1920 × 明暗 6 张；因重启会结束会话，本批未截真机，留给用户重启后的手测会话。

### 8.6 版本建议与 CHANGELOG 草稿

- 版本建议：**minor**（与同批 1.6.0 合并；不单独升版本）。是否发布由用户明确指令，本批不发布。
- CHANGELOG 草稿：阅读器新增「反色阅读」：跟随 DSH 深色主题自动黑底白字，也可在顶栏/右栏菜单手动开关，设置里可恢复跟随；只反 PDF 纸面，彩色插图、标注、工具栏不变；旧黑色笔迹自动显示白色，单色墨与白色形状填充随模式切换。

### 8.7 给 ci 的审阅清单

- [ ] 本项（反色阅读）diff 只含 `client.js`、`docs/todo.md`、`docs/changes/next.md`；同批前四项的 `src/host/`、`tools/` 改动另见第一至七节；`package.json`、`cordis.patch.yml` 未动；`.dsh-scratch/` 不进 git。
- [ ] 改动对应 `usePaperMode`/`PaperInvertProvider`、`paperInkColor`/`penPalette`/`notePalette`、主阅读器顶栏 `md-paper-toggle`、右栏 `menuActions` 的 `paper` 行、设置三档；没有第三份页状态/标注监听。
- [ ] 没有新增依赖/UI 库；没有改 DOM 结构（只给阅读器/右栏根节点加 `data-paper`，新增一个工具条图标按钮，用户明确要求）。
- [ ] 验证命令与退出码与 8.4 一致；两条测试注入更新不改变产品行为。
- [ ] 版本号、tag、push、npm、Release 均未动；发布前请用户先完成 8.5 手测。

## 九、阅读交互四项（2026-11-28 追加，未提交）

> 用户 2026-11-28 直接指令：荧光笔加字号、右栏悬停菜单不能消失、章节对比度、触控板捏合缩放。
> 已在对话中确认：荧光笔＝笔迹粗细 12–40px；对比度＝反色按钮旁弹层 100–200%；触控板＝两栏都支持。
> 本批仍只改 `client.js` + 文档；不升版本、不提交、不发布。

### 9.1 用户可感知的变化（CHANGELOG 取这一段）

1. **荧光笔可调大小**：主阅读器和右侧预览的笔设置里，切到「荧光笔」后多一条 12–40px 的滑杆（默认 22px），主阅读器与右栏共用同一个本机记忆；旧荧光笔画保持原宽度。
2. **悬停设置面板不再消失**：鼠标从左右工具条移到弹出的设置面板时，面板会等指针进入并停住；离开面板后才会关闭。面板与工具条之间的空隙也缩短并加了透明过渡区。
3. **章节对比度（依赖反色）**：反色状态下，顶栏反色按钮旁的 `▾` 弹出 100–200% 对比度滑杆（每 5% 一档，可重置）；右栏 `⋯` 菜单也提供 100/125/150/175/200% 五档。设置按「书 + 章」记忆，只影响反色纸面；主阅读器与右栏同步，普通纸面不受影响。
4. **触控板捏合缩放**：主阅读器和右栏都能用双指捏合放大/缩小；普通双指滚动仍然滚动，Ctrl+滚轮也按缩放处理。主阅读器双栏模式不缩放（两栏有各自的适应比例），但也不会把 DSH 整页缩放掉。

### 9.2 内部与契约变化（不写进 CHANGELOG）

- `client.js`
  - **荧光笔大小**：新增 `HIGHLIGHT_WIDTH_MIN/MAX = 12/40`、`HIGHLIGHT_WIDTH_KEY = 'pdfdesk:highlight-width'`、`HIGHLIGHT_WIDTH_EVENT`、`clampHighlightWidth`/`readHighlightWidth`/`writeHighlightWidth`/`useHighlightWidth`；主阅读器 `annotHighlightWidth` 与右栏 `sideHighlightWidth` 都走同一个 hook；`markerPen` 的 `width` 改为当前值；`PenStyleControls` 的荧光笔分支新增 12–40px 滑杆和 `annotHighlightSize` 文案（中英）。
  - **悬停面板**：主/右栏各新增 `keepRailPanel`/`keepSidePanel`，面板 `onPointerEnter` 取消关闭计时；关闭宽限 220→600ms（主）、700→800ms（右）；面板水平距离 `right 48→34px`、`left 28→32px`，把空隙压到 2px；不新增按钮。
  - **章节对比度**：新增 `CONTRAST_KEY_PREFIX = 'pdfdesk:contrast:'`、`CONTRAST_EVENT`、`chapterContrastKey(bookId, code)`、`clampContrast`（1–2）、`read/writeChapterContrast`、`useChapterContrast(bookId, code)`；主阅读器根 `--paper-contrast` + 顶栏 `md-paper-control`/`md-paper-contrast-btn`/`md-paper-popover`（100–200%，step 5，重置）；右栏根同步 `--paper-contrast`，`menuActions` 增加 `contrast` 子菜单（100/125/150/175/200%），`disabled: state.paper !== true`。CSS 三层滤镜追加 `contrast(var(--paper-contrast, 1))`；普通模式没有滤镜，因此不生效。
  - **触控板缩放**：主阅读器在 `props.paneRef` 上、右栏在 `sideRoot` 上加原生 `wheel` 监听（`{ passive: false, capture: true }`），只在 `ctrlKey === true` 且目标位于 `.md-reader-stage` 时拦截；`deltaMode` 归一化后 `factor = exp(-delta * 0.0025)`，单次限制 0.67–1.5；主阅读器调用新增的 `props.onZoomBy`（Workbench 传 `readerZoom`），右栏调用现有 `zoomTo(renderScaleRef.current * factor)`。普通 wheel 不拦截；双栏主阅读器跳过缩放但仍阻止 DSH 页面缩放。
- 回归脚本：
  - 新增 `rail-hover-test.mjs`（9 条）、`chapter-contrast-test.mjs`（15 条）、`trackpad-zoom-test.mjs`（11 条，含负向对照）。
  - 更新 `highlight-pen-test.mjs`（25 条：宽度 clamp、共享 key/hook、两栏接线、滑杆、文案）。
  - 更新 `note-style-test.mjs`：旧断言「面板 220ms 内关闭」与本次需求冲突，改为「关闭宽限 400–1000ms 且面板 enter 会取消关闭」。
  - `paper-invert-test.mjs` 仍为 48 条，未放宽。

### 9.3 受保护契约核对

| 契约 | 是否改动 | 说明 |
| --- | --- | --- |
| `package.json` / `cordis.patch.yml` | 未改 | — |
| `/pdfdesk/*` 路由 | 未改 | 不新增/删除路由 |
| Host/浏览器共享事件名 | 未改 | 新增 `pdfdesk:highlight-width`、`pdfdesk:contrast` 只是本机 window 广播 |
| locale 键结构 | 只新增 | `annotHighlightSize`、`paperContrast`、`paperContrastHint`、`paperContrastReset` 中英成对 |
| `~/.dsh/pdfdesk/` / `.pdfdesk/` 存储 | 未改 | 新增浏览器 localStorage `pdfdesk:highlight-width` 与 `pdfdesk:contrast:<book>:<code>` |
| 标注/笔记 schema | 未改 | 荧光笔宽度仍写在原有 `width` 字段；旧笔画不迁移 |
| `shelves.json` | 未改 | — |

### 9.4 验证记录（本批命令退出码 0）

- 语法：`node --check client.js` / `index.js` / `src/host/*.js` → 0。
- 文本/依赖：`check-keys.mjs`（missing zh/en: none）、`check-deps.mjs`（532 条）→ 0。
- 新增/更新测试：`highlight-pen-test` 25 条、`rail-hover-test` 9 条、`chapter-contrast-test` 15 条、`trackpad-zoom-test` 11 条、`note-style-test` → 0。
- 回归（25 个脚本 → 0）：`paper-invert`、`column-ink`、`notes`、`ink-gestures`、`history`、`canvas`、`u1`、`t05`、`t07`、`t08`、`t10`、`pen-cursor`、`ui-polish`、`split-page-preview`、`split-thumbs-client`、`split-ui`、`split-jump`、`storage`、`unimportant-cache`、`release-guard` 等。
- 仍存在的环境/历史失败（改动前备份已复现，与这四项无关）：`split-active-library`/`split-after-import` 的 `spawn EPERM`；`overlay-text-layer-dom` 的 Edge 调试端口；`side-page-drift`、`reading-memory`、`dual-overlay`、`copyright-and-deps` 的历史断言。

### 9.5 未覆盖 / 风险 / 需要手测

- **客户端不能热更**：以上四项都必须重启 DSH 后手测；本批仍无真机截图（重启结束当前会话）。
- 荧光笔：主/右栏各切一次荧光笔，拖动滑杆 12/22/40，画一条、切回笔再切回荧光笔确认记忆；重启后仍保留。
- 悬停面板：分别从左/右工具条慢慢移入设置面板，面板不能消失；在面板里拖滑杆/点颜色；移出面板后应在 0.6–0.8s 内关闭；确认面板没有挡住工具条按钮的点击。
- 对比度：选一本灰色扫描章节 → 反色 → 打开 `▾` 调 100/150/200%，看字是否更黑白分明；切到另一章应恢复该章的值；重启后保持；右栏 `⋯` 五档与主阅读器同步；普通模式不生效。
- 触控板：主阅读器/右栏各捏合放大缩小；确认普通双指滚动仍滚动、不会触发缩放；Ctrl+滚轮也缩放；双栏模式不缩放；缩放后页码/滚动位置可接受（当前按页面原点缩放，未做光标锚点）。
- 风险：对比度 >150% 对部分 PDF 可能产生断笔/糊边；面板与工具条的 2px 间距在极慢移动时仍可能触发关闭；捏合灵敏度 0.0025 与逐事件重绘的流畅度需真机微调；主阅读器与右栏对比度同步依赖同章 bookId+code，跨章不串值。
- 未做：触控板平移/旋转、缩放手势的指针锚定、鼠标中键缩放。

### 9.6 版本建议与 CHANGELOG 草稿

- 版本建议：与同批 **minor 1.6.0** 合并；不单独升版本，是否发布由用户明确指令。
- CHANGELOG 草稿：
  - 标注：荧光笔新增 12–40px 大小滑杆，主阅读器与右栏共用记忆。
  - 阅读器：左右工具条的悬停设置面板现在会等鼠标移入，不再在跨过空隙时消失。
  - 阅读器：反色纸面可按章节调 100–200% 对比度，灰色扫描件更易读；设置只影响反色并记在本机。
  - 手势：主阅读器和右栏支持触控板双指捏合缩放，普通双指滚动保持不变。

### 9.7 给 ci 的审阅清单

- [ ] 本项 diff 只含 `client.js`、`docs/todo.md`、`docs/changes/next.md`；`src/host/`、`tools/`、`package.json`、`cordis.patch.yml` 未动；`.dsh-scratch/` 不进 git。
- [ ] 改动对应 `useHighlightWidth`/`PenStyleControls`、`keepRailPanel`/`keepSidePanel`/面板桥、`useChapterContrast`/`paperContrast`/`md-paper-popover`、两处 `wheel` 监听与 `onZoomBy`；没有第三份页状态/标注监听。
- [ ] 没有新增依赖/UI 库；新增的唯一工具条控件是反色旁的对比度 `▾`（用户明确要求），悬停修复不新增按钮。
- [ ] 验证命令与退出码与 9.4 一致；`note-style-test` 的旧 220ms 断言按新需求更新，未放宽其它检查。
- [ ] 版本号、tag、push、npm、Release 均未动；发布前请用户先完成 9.5 手测。

## 十、阅读器 UI 三项（2026-11-28 追加，未提交）

> 用户 2026-11-28 指令“先解决 UI 问题”，范围按工作区根《PDF阅读插件-UI与文字增强-方案-2026-11-28.md》确定为阅读器这一屏的三项：竖排框错位、顶栏两行、右栏缺反色按钮；书架面包屑（UI-4）按用户选择留到下一轮。
> 对话中已确认：窄宽度允许隐藏 ⇤ 首页 / 适应宽度 / 缩放百分比以保顶栏单行。
> 本批只改 `client.js` + 文档；不升版本、不提交、不发布。

### 10.1 用户可感知的变化（CHANGELOG 取这一段）

1. **竖排工具条框正了**：左侧/右侧/右栏预览的竖排工具条现在是一个完整的 44px 圆角框，图标在框内水平居中，按钮不再探出框外；框离右边缘 20px，不再压住滚动条。悬停设置面板仍停在工具条旁边 2px。
2. **顶栏不再被挤成两行**：阅读区变窄（右侧预览打开或窗口较小）时，顶栏优先保住单行——先让书名收缩，仍不够才隐藏 `⇤` 首页、`适应宽度`、缩放百分比三个低频控件；缩放 −/＋、页码、反色、关闭始终在。Home 键仍回首页，F 仍适应宽度。
3. **右侧预览有了反色按钮**：预览工具条第 2 行 `⋯` 前新增 ☾/☀ 按钮，尺寸 28px，与主阅读器同一个偏好、同一组图标；点它主阅读器同步变化，反色时呈按下态。

### 10.2 内部与契约变化（不写进 CHANGELOG）

- `client.js` CSS
  - `.md-rail`（`client.js:19392`）：新增 `flex: none`。根因是它作为旧 30px `.md-rail-wrap` 的 flex 项默认会收缩，44px 的框被压成 30px，34px 按钮溢出框外、图标相对框中心右偏。
  - `.md-rail-wrap`（`:19380`）：宽 30 → **44**，与框同宽；右侧仍 `right: 20px`，框右缘正好落在滚动条车道边界，不占车道。左栏取 `left: 0`。
  - `.md-rail-panel[data-side]`（`:19411`–`:19412`）：右 34 → **46**、左 32 → **46**，保持面板与框之间 2px。
  - `.md-reader-bar { z-index: 41 }`（`:19207`）、`.md-reader-subbar { z-index: 41 }`、`.md-side-bar { z-index: 41 }`（`:19658`）：竖排 wrap 是 `top:0;bottom:0;z-index:40`，原来会盖住顶栏最右侧的 `×` / 反色按钮（`elementFromPoint` 落在 `md-rail-wrap` 上）；抬高整条工具栏，而不是只抬单个按钮。
  - `.md-reader`（`:19202`）：新增 `container-type: inline-size` + `container-name: pdfdesk-reader`，让断点跟随真正变窄的阅读区（分栏时 `.md-root` 仍很宽）。
  - @container `pdfdesk-reader (max-width: 740px)`（`:19230`）：隐藏 `.md-reader-first` / `.md-reader-fit` / `.md-reader-scale`。
  - `.md-reader-titles`（`:19220`）：`flex: 1 1 260px` → `flex: 1 1 0`。顶栏换行是 flex 断行按 basis 260px 算的，标题本可收缩却被提前挤到第二行。
  - `.md-side-bar .md-side-paper`（`:19660`–`:19661`）：28px 图标按钮，按下态复用 `--pdf-accent` 的描边/底色。
- `client.js` JSX
  - 主阅读器 `⇤`（`:17486`）加 `md-reader-first`，`适应宽度`（`:17525`）加 `md-reader-fit`（`md-hidden` 仍保留给双栏）。
  - 右栏 `.md-side-bar`（`:21789`）：`.md-side-zoom` 之后、`⋯` 之前新增 `md-side-paper`，`aria-pressed` 取 `inverted`，点击 `paper.setMode(inverted ? 'off' : 'on')`，图标复用 `PAPER_ICON_MOON`/`PAPER_ICON_SUN`，`title`/`aria-label` 复用 `paperInvertHint`/`paperInvert`（无新增 locale 键）。
- 仓库外脚本：新增 `reader-ui-geometry-test.mjs`（22 条，含 4 条负向对照）与静态画廊 `ui-probe/reader-gallery.mjs`；`rail-hover-test.mjs` 的面板偏移断言改为“wrap 宽 + 2px”；`issue6-side-bar-rail-clearance-test.mjs` 的 30px/无 z-index 断言改为 44px/整条栏高于竖排条；`issue6-rail-hit-test.mjs` 的 CSS 抽取改为按括号配对（旧的逐行抽取会被反色那批的多行规则截断样式表），负向对照同时撤掉整条栏的 z-index。

### 10.3 受保护契约核对

| 契约 | 是否改动 | 说明 |
| --- | --- | --- |
| `package.json` / `cordis.patch.yml` | 未改 | — |
| `/pdfdesk/*` 路由 | 未改 | — |
| Host/浏览器共享事件名 | 未改 | 反色仍走既有 `pdfdesk:paper-mode` 本机广播 |
| locale 键结构 | 未改 | 右栏按钮复用 `paperInvert` / `paperInvertHint` |
| 存储键 | 未改 | 反色偏好仍是原有 `pdfdesk:paper-mode` |
| 标注/笔记 schema | 未改 | — |

### 10.4 验证记录（本批命令退出码 0）

- 语法：`node --check client.js` / `index.js` / `src/host/*.js` → 0。
- 文本/依赖：`check-keys`（missing zh/en: none）、`check-deps`（532 条）→ 0。
- 新增：`reader-ui-geometry-test` 22 条（4 条负向对照）→ 0。
- 更新后回归：`rail-hover`（8）、`issue6-side-bar-rail-clearance`（10，含负向对照）、`issue6-rail-hit-test`（无头 Edge，12 个宽度命中测试 + 负向对照 11/12 复现旧 bug）→ 0。
- 其余回归：`ui-polish`、`t05-toolbar`、`t07`、`t08`、`t10`、`u1`、`note-style`、`layout`、`paper-invert`、`trackpad-zoom`、`highlight-pen`、`chapter-contrast`、`split-ui`、`split-page-preview`、`unimportant-cache`、`storage`（46）、`release-guard`、`change-record`、`host-test` → 0。
- 静态画廊：真实 `client.js` CSS + 与 React 输出同构的 DOM，1280/1600/1920 × 明暗共 6 张（全宽）+ 6 张（分栏）；量测：框宽 44、框右缘距边 20、图标居中、`×` 命中自身、全宽 1280/1600/1920 顶栏高 60（单行）、分栏 619 宽时顶栏仍单行。

### 10.5 未覆盖 / 风险 / 需要手测

- **客户端不能热更**：必须重启 DSH 后手测；本轮无真机截图（静态画廊用的是真实 CSS，但主题 token 是本机近似值）。
- 竖排框：左/右栏各悬停一次，确认框完整、图标居中、不压滚动条；鼠标从框移到设置面板不应消失；点框最下方的撤销/重做/清空。
- 顶栏：1280 全宽 + 打开右侧预览各看一次，顶栏应单行、书名省略号、`×` 可点；把窗宽再缩到 ~1000 看隐藏 `⇤/适应宽度/148%` 后是否仍单行；Home/F 仍可用。
- 右栏反色：点 ☾ 应主阅读器一起反色；再点恢复；反色时按钮为按下态；重启后保持。
- 风险：竖排框现在离页面更近 7px（fit 宽度下框会压住纸的右边缘约 40px，改前约 33px）；这是既有 fit 计算（`client.js` 的 `fitScale` 用 `clientWidth - 48`）没把竖排车道算进去导致的，本批按“最小修复”未动页面缩放，若用户要求“框绝不上纸”，下一轮把 fit 减到 `- 92`。
- 未做：书架面包屑 UI-4；右栏 `⋯` 菜单里的对比度子菜单未同步到新按钮旁（仍走菜单）；竖排框内部滚动条（窗口极矮时）未做去滚动条处理。

### 10.6 版本建议与 CHANGELOG 草稿

- 版本建议：与同批 **minor 1.6.0** 合并；是否发布由用户明确指令。
- CHANGELOG 草稿：
  - 阅读器：左右竖排工具条改为完整 44px 框，图标居中、不压滚动条；悬停设置面板仍在框边。
  - 阅读器：顶栏在窄宽度下优先单行，书名让位，必要时收起首页/适应宽度/缩放百分比；以 Home、F 仍可到达。
  - 预览：右侧预览新增反色按钮，与主阅读器同步。

### 10.7 给 ci 的审阅清单

- [ ] 本项 diff 只含 `client.js`、`docs/todo.md`、`docs/changes/next.md`；`src/host/`、`tools/`、`package.json`、`cordis.patch.yml` 未动。
- [ ] 改动对应 `.md-rail` 的 `flex: none`、`.md-rail-wrap` 44px、面板 46px、三条工具栏的 z-index 41、`pdfdesk-reader` 容器查询与 `md-reader-first`/`md-reader-fit`/`md-reader-titles`、右栏 `md-side-paper` 与其 CSS；没有新增依赖/UI 库。
- [ ] 工具条按钮集合：主阅读器未增删；右栏新增 1 个反色按钮（用户明确要求）。
- [ ] 验证命令与退出码与 10.4 一致；三个历史脚本的过期断言是按新布局更新，不是放宽（负向对照仍在且通过）。
- [ ] 版本号、tag、push、npm、Release 均未动。

## 十一、竖排条让位 + 书架面包屑（2026-11-28 追加，未提交）

> 用户 2026-11-28 手测反馈：「PDF 页顶部工具栏将工具条遮挡了，其它没有问题」；同时指令「接着做面包屑」（方案 §1 UI-4）。
> 两项都只改 `client.js` + 文档；不升版本、不提交、不发布。

### 11.1 用户可感知的变化（CHANGELOG 取这一段）

1. **竖排工具条不再被顶栏遮住**：阅读器顶栏与工具行、右栏预览的工具条都会先量出自己的高度，竖排工具条从它们下面开始排列；工具行折成两三行、窗口变矮时也不会钻到工具栏底下。框内滚动条改为不可见，滚轮仍可滚动，图标保持居中。
2. **面包屑显示完整书架链路**：进入第二/第三层子书架时显示「书库 › 数学分析 › 分析 › 实变」，点任一祖先层回到该层；挂在隐藏书架下的子书架显示「书库 › 隐藏 › 子书架」；打开一本书时链路后接书名，点中间层能回到那一层。过长的祖先名与书名用省略号，窄屏整行换行、不横向溢出。

### 11.2 内部与契约变化（不写进 CHANGELOG）

- `client.js` 竖排条让位
  - `ReaderView`（`client.js:14850` 附近）：新增 `barRef`/`subbarRef`，用 `ResizeObserver` 把「顶栏 + 工具行」的 `offsetHeight` 写进 `--pdf-reader-rail-top`；`.md-rail-wrap` 的 `top` 改为 `var(--pdf-reader-rail-top, 0px)`。
  - `SidePdfView`（`client.js:20030` 附近）：同样测量 `.md-side-bar` 写入 `--pdf-side-rail-top`；`.md-side-rail-wrap` 的 `top` 改为 `var(--pdf-side-rail-top, 44px)`（工具行隐藏时用 44，避开 `⋯` 手柄）。
  - `.md-rail`：`max-height: 78vh` → `calc(100% - 24px)`（跟随车道高度）；`scrollbar-width: none`，避免内部滚动条把图标挤偏。
  - 上一轮的三条工具栏 `z-index: 41` 保留：测量晚一帧时顶栏也不会被竖排条抢走点击。
- `client.js` 面包屑
  - 新增纯函数 `shelfChain(groups, group, hiddenLabel)`（`client.js:548`）：沿 `parent` 回溯，返回 root→current `{ id, name }[]`；`hidden` 作为一级；缺失父 id / 成环 / 超过 20 层即停止，不猜。
  - 面包屑渲染（`client.js:25668` 附近）改为 `crumbChain.map(...)`：祖先层与「书页所属书架」是按钮，走既有 `openGroup(item.id)`；当前层为 `aria-current="page"` 文本；`librariesView` 时不渲染链路；主书架仍回落为「书库 > 书库名」。
  - CSS：`.md-crumbs` 增加 `flex-wrap: wrap` 与 `row-gap: 4px`；新增 `.md-crumb-ancestor`（`max-width: 16ch` 省略，≤620px 容器 10ch）。
- 仓库外：新增 `shelf-breadcrumb-test.mjs`（20 条）、`ui-probe/crumb-gallery.mjs`；`reader-ui-geometry-test.mjs` 增 5 条（共 28）；`issue6-side-bar-rail-clearance-test.mjs` 的车道断言改为读取测量变量；`shelf-view-single-source-test.mjs` 的「不再复制书架名」改为校验 `shelfChain`。

### 11.3 受保护契约核对

| 契约 | 是否改动 | 说明 |
| --- | --- | --- |
| `package.json` / `cordis.patch.yml` | 未改 | — |
| `/pdfdesk/*` 路由 | 未改 | — |
| Host/浏览器共享事件名 | 未改 | — |
| locale 键结构 | 未改 | 全部复用既有 `hiddenShelf` / `libraries` / `crumbsLabel` |
| 存储键 / `shelves.json` 结构 | 未改 | 只读 `shelves[].parent`，不写、不迁移 |
| 标注/笔记 schema | 未改 | — |

### 11.4 验证记录（全部退出码 0）

- 语法：`node --check client.js` / `index.js` / `src/host/*.js` → 0；`check-keys`（missing zh/en: none）、`check-deps`（532 条）→ 0。
- 新增：`shelf-breadcrumb-test` 20 条（含 4 条负向对照）→ 0；`reader-ui-geometry-test` 28 条（含 5 条负向对照）→ 0。
- 更新后回归：`shelf-view-single-source`、`shelf-nested-create`、`shelf-add-pdf`、`shelf-add-to`、`shelf-visibility`、`shelf-whole-form`、`rail-hover`、`issue6-side-bar-rail-clearance`、`issue6-rail-hit-test`（无头 Edge）→ 0。
- 其余：`split-result-route`、`library-tips`、`change-record`、`release-guard`、`ui-polish`、`t05`、`t07`、`t08`、`t10`、`u1`、`note-style`、`layout`、`paper-invert`、`trackpad-zoom`、`highlight-pen`、`chapter-contrast`、`split-ui`、`split-page-preview`、`unimportant-cache`、`storage`、`host-test` → 0。
- 静态画廊：阅读器（带工具行）全宽/分栏 1280/1600/1920 × 明暗，竖排条顶端距工具行底 25.5–72.5px（全为正），框宽 44、右缘距边 20；面包屑 3 层书架页 1280/900/620 均单行不溢出，书页 620 折成两行且长名省略、不横向溢出。

### 11.5 未覆盖 / 风险 / 需要手测

- **客户端不能热更**：重启 DSH 后手测。
- 竖排条：确认顶端不再压在顶栏/工具行下面；工具行收起（⌄）再打开、窗口变矮时也成立；鼠标沿右缘移入仍能唤起，滚动条仍可拖动。
- 面包屑：建 3 层书架（书库 > A > B > C），进 B/C 看完整链路；点 A/B 回到对应层且计数/选中态正确；挂在隐藏下的子书架显示「隐藏」并可点回；打开一本书后点中间层回到该书架；父书架被删/`parent` 悬空/成环时不白屏。
- 风险：`--pdf-reader-rail-top` 在首帧（ResizeObserver 回调前）为 0，竖排条会先出现在旧位置再归位一帧；窄屏面包屑折行时分隔符可能落在行尾；未做真机截图（重启会结束当前会话）。

### 11.6 版本建议与 CHANGELOG 草稿

- 版本建议：并入同批 minor 1.6.0；是否发布由用户明确指令。
- CHANGELOG 草稿：
  - 阅读器：左右竖排工具条从顶栏与工具行下方开始，不再被工具栏遮住。
  - 书架：面包屑显示完整嵌套链路，可点回任意上层；长名省略、窄屏换行。

### 11.7 给 ci 的审阅清单

- [ ] 本项 diff 只含 `client.js`、`docs/todo.md`、`docs/changes/next.md`；`src/host/`、`tools/`、`package.json`、`cordis.patch.yml` 未动。
- [ ] 改动对应两处 `ResizeObserver` 与 `--pdf-reader-rail-top`/`--pdf-side-rail-top`、`.md-rail` 的 `max-height`/`scrollbar-width`、`shelfChain` 与 `crumbChain.map`、`.md-crumb-ancestor` 与 `.md-crumbs` 换行；没有新增依赖/UI 库、没有新增按钮。
- [ ] `shelves.json`/`parent` 只读，未改 schema；`shelfView` 仍是成员/计数的单一来源（面包屑只读链路）。
- [ ] 验证命令与退出码与 11.4 一致；`shelf-view-single-source-test` 的断言按新的面包屑来源更新，负向对照仍在。
- [ ] 版本号、tag、push、npm、Release 均未动。

## 十二、文字增强替换对比度（2026-11-28 追加，未提交）

> 用户 2026-11-28 判定「对比度效果不好」，拍板改用文字增强（方案 §2 FUNC-1）；对话确认：三档（柔和/清晰/黑白）、**所有档只处理近灰像素**（彩色插图保留原色）、入口＝右栏 `⋯` 子菜单 + 主阅读器 `⌄` 子栏下拉。
> 只改 `client.js` + 文档；不升版本、不提交、不发布。

### 12.1 用户可感知的变化（CHANGELOG 取这一段）

1. **对比度换成「文字增强」**：反色纸上原来的「对比度 ▾」没了，改成三档 S 曲线——**柔和**（轻度）、**清晰**（纸推黑、字推白）、**黑白**（更陡，扫描字最清楚）。四档都只处理近灰像素，**彩色插图在每一档都保留颜色**，不会被整页灰阶化。
2. **入口**：主阅读器 `⌄` 工具行末尾一个紧凑下拉（关闭/柔和/清晰/黑白），反色后可用；右侧预览的 `⋯` 菜单里也有同一组四档。两栏同步，按「书 + 章」记忆，重启保持。
3. **关闭档完全回到原来的反色**（只有 invert + 色相回正），普通纸面完全不受影响。

### 12.2 内部与契约变化（不写进 CHANGELOG）

- `client.js`
  - 存储与 hook：删除 `CONTRAST_*`/`useChapterContrast`（`client.js:12632` 起整段）；新增 `ENHANCE_KEY_PREFIX = 'pdfdesk:enhance:'`、`ENHANCE_EVENT = 'pdfdesk:enhance'`、`ENHANCE_LEVELS`、`normalizeEnhance`、`enhActive`、`chapterEnhanceKey`、`read/writeChapterEnhance`、`useChapterEnhance`；off 时删除键，不迁移旧 `pdfdesk:contrast*`。
  - 滤镜：`ENHANCE_BLACK = 0.02` 与 `ENHANCE_CURVES`（**线性增益** soft 1.3 / clear 1.9 / ink 2.8，`intercept = -slope × 0.02`）、`enhanceTransfer(level)` 与 `EnhanceDefs` 组件：每条滤镜 `feColorMatrix`（反色矩阵）→ `feColorMatrix hueRotate 180` → `feColorMatrix saturate 0` → `feComponentTransfer`（三通道 `type="linear"`）→ `feBlend difference`（与灰版求色度差）→ `feColorMatrix`（差→alpha，`3 3 3 0 -0.10`）→ `feComposite out` → `feComposite over`。阅读器与右栏各渲染一份 `md-enh-defs`。
    - **两轮实测调整**：① 用户反馈「卓里奇类书效果不大」→ 实测该页反色后纸 **0.004**、字核 **0.427**，原 clear（1.65/−0.33）把字核压到 **0.414**（纸已全黑，线性曲线只剩把字往下压）。② 先改成带趾部的 table 曲线，字核升到 ≈0.54，但用户实测「字边缘不锐利、认不清」——趾部把抗锯齿边像素压到 0，只剩字芯，笔画断裂。③ 最终回退为**线性 + 黑点 0.02**：边像素保持等比（不裁不啃），只提高增益；clear 把 0.427 → **≈0.77**、ink → 1.0，纸 0 → 0。真实页 CSS 探针（`ui-probe/enhance-css-probe.mjs`）截图为证。
  - 应用：`.md-reader`/`.md-side` 增加 `data-enh`（仅反色且非 off）；三层纸面的 `filter` 改为 `var(--pdf-enh, invert(1) hue-rotate(180deg))`，三档各自把 `--pdf-enh` 设成 `url(#pdfdesk-enh-*)`。
  - UI：顶栏删除 `md-paper-contrast-btn` 与 `md-paper-popover`、`contrastOpen`/`paperControl` 状态与点击外部关闭的 effect；`⌄` 工具行末尾新增 `md-reader-enh`（`select.md-reader-lang`，4 个 option，未反色时 disabled，`order: 3` 排到工具行末尾）；右栏 `⋯` 的 contrast 子菜单换成 enhance 子菜单（4 档、`disabled: state.paper !== true`、勾选当前档）。
  - 文案：删除 `paperContrast`/`paperContrastHint`/`paperContrastReset`，新增 `paperEnhance`/`paperEnhanceHint`/`paperEnhanceOff`/`paperEnhanceSoft`/`paperEnhanceClear`/`paperEnhanceInk`/`paperEnhanceNeedsInvert`（中英成对）。
- 仓库外：新增 `paper-enhance-test.mjs`（27 条，含 4 条负向）与 `ui-probe/enhance-gallery.mjs`（用真实 `EnhanceDefs` 渲染合成灰扫描页并采样像素）；`paper-invert-test.mjs` 的 CSS 断言改为新滤镜语法（负向对照同步更新）；删除 `chapter-contrast-test.mjs`（功能已移除）。

### 12.3 受保护契约核对

| 契约 | 是否改动 | 说明 |
| --- | --- | --- |
| `package.json` / `cordis.patch.yml` | 未改 | — |
| `/pdfdesk/*` 路由 | 未改 | — |
| Host/浏览器共享事件名 | 未改 | 新增 `pdfdesk:enhance` 只是本机 window 广播 |
| locale 键结构 | 只删/增值 | 删除 3 个 contrast 键，新增 7 个 enhance 键，中英成对；层级与命名规则不变 |
| 存储键 | 改浏览器键 | 新增 `pdfdesk:enhance:<book>:<code>`；旧 `pdfdesk:contrast:<book>:<code>` 不再读写（不迁移、不删用户数据） |
| 标注/笔记 schema、`shelves.json` | 未改 | — |

### 12.4 验证记录（本批命令退出码 0）

- 语法：`node --check client.js` / `index.js` / `src/host/*.js` → 0。
- 文本/依赖：`check-keys`（missing zh/en: none）、`check-deps`（534 条）→ 0。
- 新增：`paper-enhance-test` 27 条（4 条负向）→ 0；`enhance-gallery` 用**真实 `EnhanceDefs`** 渲染合成页（纸 #f4f4f4、正文 #3e3e3e、另有一行浅灰 #8f8f8f 模拟浅灰印刷）并采样：四档纸都保持近黑（≤0.06）、正文与浅灰行逐档变白；红/蓝块 RGB 与色度四档不变（彩色插图未被灰阶化）。
- **真实页探针（真实插件 CSS + 真实滤镜，`ui-probe/enhance-css-probe.mjs`）**：卓里奇第三章 p40 的 140 DPI 渲染图，关闭档为灰字；清晰/黑白档字明显更白且**边缘保持连续**（放大截图核对，无断笔/糊边）——table 趾部版本会把边缘压断，已回退。
- **数值（PyMuPDF + 同链模拟）**：该页反色后纸 0.004、字核 0.427；原 clear 0.414（越增强越暗）、趾部版 0.54 但断边；最终线性 clear ≈ **0.77**、ink → 1.0，纸 0 → 0。华师 p10（字核 0.404）clear ≈ 0.73。Serre 封面（字核 1.0）四档一致。
- 更新：`paper-invert-test` 48 条 → 0（滤镜断言改为 `var(--pdf-enh, invert(...))`，负向对照同步）。
- 回归：`reader-ui-geometry` 28、`ui-polish`、`t05`、`highlight-pen`、`note-style`、`layout`、`rail-hover`、`issue6-side-bar-rail-clearance`、`shelf-*`、`split-*`、`storage`、`host-test`、`change-record`、`release-guard` → 0。

### 12.5 未覆盖 / 风险 / 需要手测

- **客户端不能热更**：重启 DSH 后手测。
- 手测：反色后依次柔和/清晰/黑白；**卓里奇**一类的浅灰印刷书应比上一版更清楚、字边连续可读；原本就清楚的书不应发虚或过曝；彩色插图页确认颜色保留；切章/重启后档位保持；右栏 `⋯` 与主阅读器同步；关闭档回到原反色；普通（非反色）模式看不到变化。
- 风险：线性增益没有「趾部」，纸张不是纯白（反色后 >0.1，如旧复印/带底纹扫描）时会把纸和噪点一起提亮——本库实测纸面均为 0.0，若遇到灰底扫描可用「柔和」；色度阈值 0.10 仍是经验值；SVG 滤镜在 200%/300% 缩放下由 GPU 合成，未量过真实扫描件的性能；旧 contrast localStorage 键保留在用户浏览器里但不读取。

### 12.6 版本建议与 CHANGELOG 草稿

- 版本建议：并入同批 minor 1.6.0；是否发布由用户明确指令。
- CHANGELOG 草稿：
  - 阅读器：反色纸面的「对比度」改为三档「文字增强」（柔和/清晰/黑白），灰纸灰字更清楚；只处理近灰像素，彩色插图保留颜色。
  - 阅读器：文字增强入口在工具栏下拉与右侧预览 `⋯` 菜单，按「书 + 章」记忆。

### 12.7 给 ci 的审阅清单

- [ ] 本项 diff 只含 `client.js`、`docs/todo.md`、`docs/changes/next.md`；`src/host/`、`tools/`、`package.json`、`cordis.patch.yml` 未动。
- [ ] contrast 全套已删除（`useChapterContrast`、`--paper-contrast`、`md-paper-contrast-btn`、`md-paper-popover`、`paperContrast*`），没有两套并存；旧 localStorage 键不在代码中引用。
- [ ] 滤镜只挂在 `.md-reader-canvas`/`.md-overlay-text`/`.md-mask-page-image` 三个纸面层，注释层与页面框不受影响；反色门控 `data-enh` 只在 `data-paper=invert` 时出现。
- [ ] 验证命令与退出码与 12.4 一致；`chapter-contrast-test.mjs` 的删除是因为功能被替换，新的 `paper-enhance-test.mjs` 覆盖更多（含负向对照）。
- [ ] 版本号、tag、push、npm、Release 均未动。


