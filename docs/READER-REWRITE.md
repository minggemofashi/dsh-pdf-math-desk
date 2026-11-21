# 阅读器重写设计稿（PdfViewer）

> 目标：保留现有全部功能，把“单页 / 连续 / 双语 / 叠加 / 标注”从各写一套 canvas 逻辑，重写为一个统一 PDF 视图组件，消除缩放、滚动、切换模式时的坐标与重绘类 bug。

## 1. 目标（必须保留的功能）

- 原 PDF 阅读：单页 / 连续、页码、缩放、适应宽度；
- 双语并排：左原文右译文，两栏**独立缩放与滚动**，栏头控件；
- 叠加：译文按块 bbox 对齐，框选露底，框可保存/删除；
- 块调试：标题/段落/公式虚线框（PyMuPDF 块）；
- 翻译：整章任务、进度持久化、取消、按块 JSON 翻译、overlay 生成/重建；
- 标注（后续）：笔、橡皮、文本框，矢量存储；
- 右侧预览复用同一视图组件；
- 所有状态在切换模式/重挂载时不丢失。

## 2. 非目标

- 不改翻译管线（Host 任务、DeepSeek 调用、md2tex）；
- 不改书库/书架/会话/产物；
- 不追求像素级段落对齐与双栏/跨页支持。

## 3. 架构

```
<PdfViewer
  layers={[
    { kind: 'source', doc, page },
    { kind: 'translation', doc, page },
    { kind: 'annotation', data },
  ]}
  mode="single" | "continuous" | "dual" | "overlay"
  zoom={..}  // 每个实例独立
  onPageChange
/>
```

- 一个 `renderPage(pageNumber, layer)` 函数负责画到该 layer 的 canvas；
- 页面容器统一 `position: relative`，所有层共用同一页面尺寸；
- 缩放/滚动状态属于 Viewer，而不是分散在 ReaderView/页面组件；
- 模式只决定“渲染哪些 layer、布局是单栏还是双栏”，不改变渲染逻辑；
- 双语 = 两个 Viewer 实例并排；叠加 = 同一个 Viewer 多一层；
- 页面尺寸变化（缩放）只触发一次 resize + repaint，不重建 canvas。

## 4. 关键规则（针对已踩过的坑）

1. **超宽时不能居中溢出**：容器用 `justify-content: safe center` / `align-items: safe center`，保证放大后左侧可滚动到；
2. **canvas 重挂载必须重绘**：页面绘制由 Viewer 的 `pageVersion + zoom + layer` 驱动，不依赖 DOM 挂载时序；
3. **叠加几何**：整页译文只渲染成一张图，放在页面盒子里；每个框只是一条 `clipPath` 矩形（v0.49.2 起不再按框单独渲染 canvas，也不再用局部 100%）；
4. **overlay 失败要显式提示**（加载/重建），不能静默回退成“看起来是原文”；
5. **滚动更新页码是静默的**，不触发跳页；
6. **模式切换是状态机**：single/dual/overlay 互斥，切换时保存/恢复各自滚动位置与缩放；
7. 标注坐标一律归一化 0–1，缩放无关。

## 5. 数据契约

- 块：`{ id, page, bbox, kind, text, md }`（来自 `/blocks` + 缓存 blocks.json）；
- overlay PDF：`<原名>_overlay.pdf`，页面尺寸与原文一致，页数 1:1；
- 译文：`<原名>_translated.pdf`；块缓存：`~/.dsh/mathdesk/translation/<书>/<章>/page-NNN.blocks.json`；
- 遮罩/标注：`{ page, x, y, w, h }`，按书/章/页存 localStorage（迁移到 sidecar 可选）。

## 6. 迁移步骤（每步可独立验收）

1. **抽出 `PageCanvas`**：把当前单页绘制逻辑封装为纯组件（props: doc/page/scale/layer），连续模式与单页共用；
2. **抽出 `PdfViewer`**：管理缩放、滚动、页码、safe-center；
3. **双语改用两个 Viewer**：每栏独立 zoom/scroll，保留栏头；
4. **叠加改用 Viewer + mask 层**：mask 内 canvas 使用统一页面几何；
5. **块调试层**接入；
6. **右侧预览**复用 Viewer；
7. **标注层**接入。

每步完成都跑：单页/连续/双语/叠加四条回归路径 + 缩放 200% 后左右滚动可达。

### 进度

- [x] 第 1 步 `PageCanvas`：抽出 `paintPageCanvas`，单页/连续共用（v0.49.1）。
- [x] 第 2 步 `PdfViewer`：`client.js` 内新增 `PdfViewer`，接管舞台、页面盒子、单页绘制、适配宽度测量与页码上报；`WorkbenchPage` 的两段旧 effect 删除。叠加同时改为「整页译文图 + clipPath 裁剪矩形」，失败显式提示（v0.49.2）。
- [ ] 第 3 步 双语改用两个 Viewer（当前仍是 `ContinuousView` 两栏，各自独立缩放/滚动已可用）。
- [ ] 第 4 步 叠加改用 Viewer 的 mask 层（已实际落地：mask 层作为 `PdfViewer` 的 children，几何跟随页面盒子）。
- [ ] 第 5 步 块调试层接入（已随 children 接入）。
- [ ] 第 6 步 右侧预览复用 Viewer。
- [ ] 第 7 步 标注层接入。

## 7. 验收标准

- 放大到 300% 时，单栏与双栏都能水平滚动到最左侧；
- 切换 single→dual→overlay→single 不空白、不跳页、缩放保持；
- 叠加框内显示译文，加载失败有明确提示；
- 翻译进度与取消在切页后仍可用；
- 现有书库/会话/产物功能不受影响。

## 8. 回退策略

- 新组件放在 `src/client/viewer/`（构建时合并进 client.js）；
- 旧渲染路径保留一个版本周期，用 `?viewer=legacy` 开关切换；
- 验收通过后删除旧路径。
