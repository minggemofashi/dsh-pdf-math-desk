# 待办 · 最小可执行单元

> **维护者：队长/用户**。programmer 只按“状态”规则更新自己单元的状态，不改范围、验收标准或增删单元。
> 这里只放已经拆好的执行单元；未拆清的需求留在对话/任务里，不进入本文件。
> **2026-11-25 组织收缩（DEC-0012）**：只剩 `requirements` / `programmer` / `ci` 三张身份卡，默认单会话；本文件下方历史记录中出现的 boss / auditor / code-reviewer / tester / release-manager 等角色名保留原样，仅作历史，不再生效。
> **2026-11-24 试跑例外**：本批 5 条用户实测候选均登记在本文件；U2/U3 为阻塞项，未拆清前不得进入 programmer。本批验收口径来自用户直接指令，已写入各单元详情。

## 入队规则

一个单元必须满足：

- **一件事**：一个会话可以完成，且只有一个用户可感知的结果。
- **有边界**：写明涉及的文件/模块；预计超过 2 个文件时，执行前必须另出计划等确认。
- **有验收来源**：只能引用 `docs/requirements/` 的具体小节或 `AGENTS.md` 的硬约束，不能写“看起来正常”。
- **有依赖**：前置单元、环境、数据或用户确认写清楚；依赖未满足不标为可执行。
- **不打包**：不把“顺便修一下”“顺手重构”塞进同一单元；同类但独立的修复拆成独立单元。
- **不重复拆解**：同一个结果被拆成多个会话反复规划时，boss 必须退回原因，不再继续切碎。

## 状态与报告

| 状态 | 含义 | 谁写入 |
| --- | --- | --- |
| `待执行` | 已拆好，等待 programmer | 队长 |
| `进行中` | 当前会话正在做 | programmer |
| `待用户验收` | programmer 自查完成，等用户手测 | programmer |
| `退回执行` | 用户手测不通过，回到 programmer | 用户/队长 |
| `阻塞` | 缺依赖/需要用户确认；必须写明阻塞原因 | 当前环节 |
| `完成` | 用户手测通过；是否发布另见 `CHANGELOG.md` / Release | 用户/队长 |
| `已关闭` | 用户确认无需修复/取消，或现象不再出现；**不等于发布** | 用户/队长 |

状态只能按 `待执行 → 进行中 → 待用户验收 → 完成` 前进；用户手测不通过用 `退回执行`。`已关闭` 是终态，与发布无关。当前环节只改状态列，不改执行单元、验收来源、影响范围、依赖。队长负责新增、拆解、优先级、验收来源和关闭；不追每次交接。

证据规则：不再新写 `docs/reviews/` / `docs/tests/` 报告；证据留在 programmer 的任务结果或对话里（命令、退出码、文件:行号、未覆盖）。历史报告保留不删；“报告”列保留给历史单元，新单元留空。

## 优先级

- `P0`：阻断性 bug、数据损坏、安全问题，或正在阻断发布。
- `P1`：明确的用户可见缺陷或已承诺的功能。
- `P2`：体验优化、文档补齐、非阻断清理。

## 当前队列（2026-11-24）

> **本轮试跑**：用户实测 5 条产品 bug（项目 v1.4.0）。这些是已报 bug，不是需求访谈；按用户指令直达 programmer，不走 auditor / feedback-collector。
> **本轮只派发 `T-20261124-01`（U1）**；U2/U3 为阻塞候选，补齐复现/预期后再拆；U4/U5 为后续独立单元，本轮不执行。5 条不得合并成一个“右栏修复”单元。
> **验收来源**：本批为用户 2026-11-24 直接指令（U1 验收 1–4，U4/U5 现状/预期/验收），已写入单元详情；用户当前指令优先于一般“验收来源只能引用 `docs/requirements/` 或 `AGENTS.md`”的规则。programmer 不得自定或放宽验收标准。
> **优先级**：P1 的 U2/U3 因缺复现而阻塞，所以首轮先派 P2 的 U1；执行顺序不等于优先级。
> **发布**：本轮不发布；5 项均为 bug 修复，按 patch 级，实际发布须用户另行明确指令。

| ID | 优先级 | 执行单元 | 影响范围 | 验收来源 | 依赖 | 承接角色 | 状态 | 报告 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-20261124-01 | P2 | 无翻译件或翻译中时，主阅读器右侧竖排工具条与右侧预览顶部工具条的“叠加”入口同时禁用 | `client.js`：`ReaderView` 竖排工具条 + `SidePdfView` 顶部工具条；翻译可用性/翻译中状态的单一来源 | 用户 2026-11-24 指令 U1 验收 1–4 + W3 补充裁决（详见单元详情） | 先复现；≥3 文件或触碰共享状态契约须先出计划等确认 | programmer | 完成 | docs/tests/T-20261124-01.md |
| T-20261124-02 | P1 | 右侧预览 PDF 疑问框功能不可用（已关闭） | `client.js`：`SidePdfView` 疑问工具/疑问层 | 用户 2026-11-24 报告 U2；2026-11-24 用户确认现象自行恢复正常，取消修复 | 已关闭：无代码改动；若在同一 commit 或其后台复现，重开并附最小复现 | programmer | 已关闭 | — |
| T-20261124-03 | P1（暂定） | 右侧预览连续模式手形工具无法平移页面 | 待复现：`SidePdfView` 手形/`scrollGrab`/连续视图事件接线 | 用户 2026-11-24 报告 U3（报为 bug，视为预期应可用；若复现证明仅设计如此，停下交 boss/用户） | 先复现再最小修复；不得与 U2 合并 | programmer | 完成 | docs/tests/T-20261124-03.md |
| T-20261124-04 | P2 | 右侧预览 PDF 右键菜单点击外部不关闭 | 待复现：`SidePdfView` 右键菜单/`SIDE_MENU_KIND`/DSH `contextMenus` 或插件 `FallbackMenu` | 用户 2026-11-24 指令 U4 现状/预期/验收 | 独立单元；后续派发，本轮不执行 | programmer | 完成 | docs/tests/T-20261124-04.md |
| T-20261124-05 | P2 | 重命名疑问的输入框透明 | 待复现：疑问重命名输入框（`client.js` `.md-question-input` 附近） | 用户 2026-11-24 指令 U5 现状/预期/验收 | 独立单元；后续派发，本轮不执行 | programmer | 完成 | docs/tests/T-20261124-05.md |
| T-20261124-06 | P2 | 把 U1 最终设计写入 SIDE-PREVIEW 契约文档（chapterKey 翻译事实缓存、右栏自查询、`VIEW_PUBLISHED` 未扩展） | `docs/SIDE-PREVIEW.md` §5.1/§5.2（若涉及）、§6.1.4；对照 `client.js:3241–3474`、`:3154–3157`、`:15875–15886` | DEC-0009（已接受）；`docs/reviews/T-20261124-01.md` Round 2 Suggestion 1 | 解除：设计已定稿；不涉代码，随下次文档批次派发，本轮不派发 | programmer（只改文档） | 待执行 | — |
| T-20261124-07 | P2 | 右栏竖排“框选/叠加”与右键菜单同名项在无译文时未禁用（与 U1 门控一致） | `client.js`：`SidePdfView` 竖排工具条与右键菜单同名项（约 `:15894`、`:15465`） | 用户 2026-11-24 报告（右栏右部工具栏无译文时框选按钮未禁用）；`docs/reviews/T-20261124-01.md` Suggestion 1；DEC-0009 | 复用 DEC-0009 共享事实；先复现四态；与 T-08 分开 | programmer | 完成 | docs/tests/T-20261124-07.md |
| T-20261124-08 | P2 | 右栏文本框拖动创建失效（变为点击式生成） | `client.js`：`SidePdfView` 文本工具创建路径（待复现细化） | 用户 2026-11-24 报告（与主阅读器行为不一致） | 先复现再最小修复；≥3 文件或契约先出计划 | programmer | 完成 | docs/tests/T-20261124-08.md |
| T-20261124-09 | P2 | 主阅读器竖排“叠加/框选译文”按钮点击无反应、完全拖不出框 | `client.js`：`ReaderView` 竖排 `mask` 工具激活与拖拽创建路径（待复现细化） | 用户 2026-11-24 报告（有译文时仍点了没反应/拖不出框；无译文按 U1 语义禁用） | 先复现，区分“U1 禁用语义误伤”与“工具断线”；≥3 文件或契约先出计划 | programmer | 完成 | docs/tests/T-20261124-09.md |
| T-20261124-10 | P2 | 框选译文的框无法删除（右栏预览可复现；右键弹菜单但删不掉） | `client.js`：mask 框命中/右键菜单/删除路径与 `SidePdfView` mask 层事件（待复现细化） | 用户 2026-11-24 报告（框选译文的框均不可删除，右键会跳出菜单） | 先复现；优先右栏；不与 T-09/T-08 合并 | programmer | 完成 | docs/tests/T-20261124-10.md |

> 队列非空也不代表所有单元都可领取：U1/U3/U4/U5 已随 v1.4.1 发布（U2 已关闭）；T-07/T-08/T-09/T-10 已修完、过审并经用户 2026-11-24 批量实测通过、已随 v1.4.1 发布（tester 已备案，见 `docs/tests/`）；2026-11-24 用户裁决：审查发现的边角限制统一接受并记录在 DEC-0010（U1 R1–R3、首击观察、T-07/T-09 pressed 与取消语义、译文 PDF 叠加、T-10 无工具右键），不修，遇到相关 bug 再开单元；T-06 随文档批次。
> 仓库外旧计划的 triage 结论原在 `docs/boss-handover.md` §2.1；该文件已随 DEC-0012 退役，历史内容见 git `d8a20d4`。

## 当前队列（2026-11-25 · v1.5 改进）

> **排序已由用户 2026-11-25 确认**：先清可验证的软件缺陷 → 不依赖硬件的功能 → 等数位板复现/视觉判定的项 → 独立项目。执行顺序 ≠ 优先级：#1/#5B 是 P1 但要等复现；#4 用户已定必做，但要先测基线。9 项均无 P0（无数据损坏/安全问题）。
> **2026-11-25 18:20 重排**：T-12（#10 AI 模型）延后，先做更简单的 T-04（#3 书库范围放宽）；T-12 的 S1+S2 已在工作树，S3 待接。当前顺序见《PDF阅读插件-1.5-进度与统计-2026-11-25.md》§5。
> **2026-11-25 19:35 交接**：换会话前的新接手入口是《PDF阅读插件-1.5-交接-2026-11-25.md》（工作区根），含改动清单、陷阱、手测清单与剩余队列。工作树 7 个文件未提交。
> 需求原文与现状证据见 `docs/requirements/2026-11-25-v1.5改进需求.md`（历史记录，不再新增）。DEC-0012 后没有队长角色：本表由用户口头确认、programmer 落盘；范围与验收仍以需求规格为准。

| ID | 优先级 | 执行单元 | 影响范围 | 验收来源 | 依赖 | 承接 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-20261125-01 | P1 | 单页模式翻页落点：上一页停新页底部、下一页停顶部 | `client.js` 落点区 | 需求 §8.3 + Q8-1…4 = A | 7 条手测已由用户 2026-11-25 通过 | programmer | 完成（未提交） |
| T-20261125-02 | P1 | 右栏顶栏 `⋯` 不再被竖排工具栏截获 | `client.js` `.md-side-bar` 右内边距 | 需求 §6.3 验收 1/2 | 用户 2026-11-25 手测通过（窄栏可点、布局未变） | programmer | 完成（未提交） |
| T-20261125-03 | P1 | 连续模式疑问框不重复加载、PDF 不闪 | `client.js` 疑问加载与疑问层 | 需求 §7.3 | 用户 2026-11-25 手测通过（往回滚不白页）；请求去重未动 | programmer | 完成（未提交；Q7-2 未定） |
| T-20261125-04 | P1 | 书库可读未按命名改造的 PDF，用户可选显示/隐藏 | `src/host/index-source.js`、`src/host/pdf-source.js` + 书库 UI | 需求 §3.3、§3.7 | 用户 2026-11-25 手测通过（两个开关、提示可关、`分片/` 整本 PDF 可读） | programmer | 完成（未提交） |
| T-20261125-05 | P1 | 阅读器与右栏上方工具条（含右栏疑问按钮） | `client.js` 顶栏 | 需求 §5.3 验收 4/5 | Q5-1“书本”、Q5-2“撤回撤回”、Q5-4/Q5-5；复用 DEC-0003 单一动作源 | programmer | 待执行 |
| T-20261125-06 | P1 | 笔/橡皮与光标对齐 | `client.js` 坐标换算与光标 | 需求 §1.3 | 数位板复现（Q1-4）+ Q1-1/Q1-2/Q1-5 | programmer | 阻塞：待复现 |
| T-20261125-07 | P1 | 数位板手移不动、笔/橡皮抬笔消失 | `client.js` pan 与指针手势 | 需求 §5.3 验收 1–3 | 同 T-06 复现；与 T-06 同片代码，复现一次覆盖两单元 | programmer | 阻塞：待复现 |
| T-20261125-08 | P2 | 启动/上下文基线 + 其它 API 兼容 | 度量 + 配置 | 需求 §4.3 | Q4-1 由 T-12 回答（复用 DSH 已配置模型）；Q4-2/Q4-3 先测基线再定目标 | programmer | 待执行 |
| T-20261125-09 | P2 | 翻译覆盖层文字对齐（不裁字/不重叠/基线/字号下限） | `tools/pdf_blocks.py`、`tools/md2overlay.py`、`src/host/routes.js`、`client.js` | 需求 §9.3 | A（几何闭环）+E（翻译质量）2026-11-25 20:20 落码；B 21:10 落码、**21:58 修基线假达标**（标记另起一行/缩进/单位）；C/D 2026-11-25 21:40 已拍板（C 内置 KaTeX；D 先做公式转换 spike；导出仍走 LaTeX） | programmer | 待用户验收（A+E+B） |
| T-20261125-13 | P2 | 设置页一键清除翻译缓存（逐页 md/blocks/layout/job），正在进行的任务跳过 | `src/host/routes.js`（`POST /pdfdesk/clear-translation-cache`）、`client.js` 设置 → 数据 | 用户 2026-11-25 20:07 指令 | 无 | programmer | 待用户验收 |
| T-20261125-14 | P2 | 右侧预览与 PDF 页页码统一 | `client.js`：`SidePdfView` 页码 vs 主阅读器页码 | 用户 2026-11-25 20:49 指令（**暂不执行**） | 待复现：两处页码当前口径（预览页号 / PDF 物理页号 / 是否有偏移） | programmer | 待执行 |
| T-20261125-15 | P2 | 右侧预览单页模式滚轮无法滑到空白处（与 PDF 页同步） | `client.js`：`SidePdfView` 单页滚动容器 | 用户 2026-11-25 20:49 指令（**暂不执行**） | 待复现：单页模式滚轮是否被截断；对照主阅读器单页滚动范围 | programmer | 待执行 |
| T-20261125-16 | P1 | 叠加层改浏览器文本层（C）——任意缩放清晰、可即时修订 | 新渲染路径（`client.js` 叠加层）+ Host 输出 layout JSON + 公式 KaTeX | 需求 §9.3 第 5 条；用户 2026-11-25 21:10 拍板排入下一轮 | Q9-5=引入已拍板；B 的 `layout.json` 契约已就绪；KaTeX 已 vendor | programmer | **主阅读器 + 右栏预览已落码；用户 2026-11-25 手测正常**；文本选中入口待做 |
| T-20261125-17 | P1 | 排版引擎换 Typst（D）——`measure()` 精排、免 TeX Live、编译提速 | `tools/md2tex.py`/`md2overlay.py` 的排版内核 | 需求 §9.3 全量 + 产物兼容；用户 2026-11-25 21:10 拍板排入下一轮 | 用户 2026-11-25 23:35 拍板“全面替换”（叠加 + 读版 + 导出全走 Typst）：**已落码，待重启手测**；分发=按需下载+已装优先（DEC-0013） | programmer | 完成（2026-11-26 手测通过；未发布） |
| T-20261125-10 | P2 | PDF 拆分小包（独立仓库/产品） | 新仓库 | 需求 §2.3 | Q2-1…Q2-7；>1MB 不集成进插件 | programmer | 待执行 |
| T-20261125-11 | P1 | 连续模式页码跟视口顶边走：上一页完全移出才切换 | `client.js` 连续模式页码上报 | 用户 2026-11-25 报告 + 需求 §7.3 | 用户 2026-11-25 手测通过 | programmer | 完成（未提交） |
| T-20261125-12 | P1 | 设置页可选每个 AI 环节使用的 DSH 模型，默认跟随 DSH 默认 | `src/host/`（AI 调用）+ 设置页 UI + locale | 需求 §10.3（Q4-1 的实际答案） | 用户 2026-11-25 手测：自检通过，但**会话改走 Host 后丢工作区归属**（工作区重选、预填失效）→ 已改回浏览器建会话，Host 路径改为默认关闭的实验开关 `pdfdesk:ai-session-host=1` | programmer | 待用户验收（S3 翻译通道已接；会话行仍待补工作区归属） |

**T-20261125-02 证据（2026-11-25，第二版：布局零改动）**

- 第一版给顶栏加 40px 右内边距，用户实测判定“右侧工具栏布局被改”并要求回调 → 已回滚为原 `padding: 6px 8px`。
- 根因不变：`.md-side-bar`（`client.js:14317`）`flex-wrap: wrap`，末行 `⋯` 被 `.md-side-gap`（`flex:1`）推到最右；竖排栏 `.md-rail-wrap`（`:14151`）占最右 30px、`z-index:40`、`pointer-events:auto`，右栏变体 `.md-side-rail-wrap`（`:14181`）从 `top:44px` 起。顶栏换行后 `⋯` 落在竖条里，指针一进去就被竖排栏接走。
- 修复（第二版）：只给 `.md-side-more`（`:14331`）加 `position: relative; z-index: 41`，高于竖排栏的 40；布局属性一个没动。
- 验证：`node --check client.js` / `src/host/*.js` exit 0；`issue6-side-bar-rail-clearance-test.mjs` exit 0（10 条断言 + 去掉 z-index 的负向对照）；`issue6-rail-hit-test.mjs` exit 0（无头 Edge，12 个宽度：`⋯` 矩形与改前逐宽度相同＝布局未变，`elementFromPoint` 12/12 落在 `⋯`；去掉 z-index 后 11/12 被 `md-rail-wrap` 接走）。该脚本需 danger-full-access——Chromium Mojo 命名管道在受限沙箱下 0x5 拒绝启动。
- 待用户手测：右栏拉窄到工具条换行 → 指针移向右上角 `⋯` → 点开菜单；显示/隐藏两态各一次；同时确认工具栏布局与改前一致。

**T-20261125-11 证据（2026-11-25，连续模式页码）**

- 用户报告：连续模式滚到半页页码就变（理想是上一页完全移出视口才切），疑问工具随后无法使用。
- 根因两处：① `ReaderPage` 的 IntersectionObserver 用 `entry.intersectionRatio >= 0.5` 上报页码（`client.js:9497`），而它的根带 `rootMargin: '900px 0px'` 预取边距（`:9499`）——比例按“视口＋900px”算，下一页还在屏幕外就已“半可见”。② 滚动兜底按“页顶离视口顶最近”取页（`Math.abs(node.top - stageTop - 24)`）：页高大于视口时，页 3 的页顶早就比页 4 的页顶离视口顶更远，于是页 3 还铺满屏幕，页码就翻到 4。
- 修复：主阅读器连续模式不再由观察者上报（`onVisible: null`，`:12968`；`ReaderPage` 只在有处理函数时上报），改为滚动落定后按“视口顶边所在页”取页（`:11857` 起：`top <= stageTop + 24`，无匹配时退到最上面的已挂载页），沿用 180ms 去抖；补 `switchingMode` / `jumpingUntil` 保护，跳页等程序性滚动不发布页码。
- 验证：`node --check client.js` exit 0；`continuous-page-indicator-test.mjs` exit 0（7 条断言 + 还原“最近页顶”负向对照失败 2 条）。
- 待用户手测：连续模式滚过一整页——页 3 未完全移出前页码保持 3；移出后变 4；往回滚一小段页码不来回跳。

**T-20261125-03 证据（2026-11-25，闪烁部分）**

- 用户报告（重启后）：“闪烁仍然存在，建议增加预加载，或者至少让加载的范围长一些（比如上下两页）”。
- 根因两处，都在 `ReaderPage`：① 页高只在“进入 900px 预取带”时才测量（原 `client.js:9476` 的 `if (... || !visible) return`），未测量的页只靠 canvas 默认 150px，页被接近时长高、整列内容下移；② 离开预取带就把 canvas 重置成 1×1（原 `:9504–9508`），往回滚时先是白页、再等重绘。
- 修复：① 页高改为**挂载即测**并按文档缓存（`pageHeightCache`，WeakMap，`:9457` 起 + `ReaderPage` 高度 effect），同一页只 `getPage` 一次；② 画布保留范围改为**当前页上下各 2 页**（`currentPage` 由 `ContinuousView` 传入，`painted = visible || near`，`:9524–9536`），超出才释放。最多 5 张常驻画布，避免整章 300 页都占内存。
- 验证：`node --check client.js` / `index.js` / `src/host/*.js` exit 0；`continuous-preload-test.mjs` exit 0（9 条断言 + 去掉邻页窗口的负向对照失败 1 条）。
- 待用户手测：连续模式上下快速滚过 3–5 页，重点看**往回滚**时是否还有白页；以及滚入新页时页内容是否还会上下跳。
- 未做：Q7-2（是否所有已渲染页都显示疑问框）、请求去重；若白页仍在，下一步是把位图转存到离屏缓存（内存换时间），需要用户确认内存取舍。

**T-20261125-12 证据（2026-11-25，S1 只读目录）**

- 计划：`PDF阅读插件-1.5-AI模型选择-计划-2026-11-25.md`（工作区根）。
- S1 改动：`src/host/routes.js` 新增 `GET /pdfdesk/ai-catalog`（列入 libraryFree，缺能力时退化为空列表）；`index.js` 新增只读 `aiCatalog()`（`llm.listProviders` + `listModels` + `agentDefaultModel.currentSelection`，单 provider 失败进 `failures`）；`client.js` 设置页新增「AI 模型」页签，打开才请求一次，只展示当前默认与各供应商模型。
- 行为零变化：路由只读，不调用 `saveSelection` / `selectModel`；设置页不写任何存储；翻译与会话路径未动。
- 验证：`node --check client.js / index.js / src/host/*.js` exit 0；`check-keys` / `check-deps` / `host-test` exit 0；`ai-catalog-route-test.mjs` exit 0（8 条断言：200、字段回显、模态、退化、无需书库、POST 405）。
- 下一步 S2：先做**不改代码**的 spike，验证 Host `agents.create(agentOptions)` 建出的会话与浏览器建的等价（列表可见、预设、可续聊、重启可恢复），再改 `createSessionId`。

**T-20261125-12 证据（2026-11-25，S2 会话选模型）**

- 设置页：三行（整章翻译 / 阅读器会话 / 其它），每行「跟随 DSH 默认 开/关」+ 按供应商分组的下拉；选择存 `pdfdesk:ai:*`（每功能一个键），只存本机，不写 DSH。
- Host：`POST /pdfdesk/ai-session` → `agents.create({ sessionId, meta: { cwd }, agentOptions: { provider, model } })`。与仓库既有 `ensureBaseSession` 同一调用形状，模型只作为创建参数。
- 自检：`POST /pdfdesk/ai-probe` → 读默认 → 用所选模型建临时会话 → 再读默认 → 归档并 dispose → 返回 `before/after/same`；设置页直接显示"全局默认未变"或标红。
- 客户端：`createSessionId` 先请求 `ai-session`，失败才退回原来的 `remote.session.create`（退回时 `console.warn`，会话仍能建但不保证模型）。
- 隔离：全仓不调用 `agentDefaultModel.saveSelection`、不调用 `remote.session.selectModel`。
- 验证：`node --check` 三项 exit 0；`check-keys` / `check-deps` / `host-test` exit 0；`ai-catalog-route-test.mjs` 8 条断言、`ai-session-route-test.mjs` 13 条断言全通过。
- 待用户手测（重启后）：① 选一个明显不同的模型 → 新建章节会话 → 会话里显示的模型应是它；② 回 DSH 新建普通会话 → 仍是原默认；③ 点「运行自检」→ 显示"创建成功；全局默认未变"。
- 未做：S3 翻译通道切换（`translate.js` 仍直连 DeepSeek）；翻译行现在可选但尚未生效。

**T-20261125-12 证据（2026-11-25 19:25，S3 翻译换 DSH 通道）**

- 范围：只换传输层。提示词、`balanceMath`/`parseJson` 解析、缓存键（`page-NNN.md`、`.blocks.json`）、产物（`_translated.pdf`、`_overlay.pdf`）、断点续译、job JSON 形状全部不动；`apiKey` → `ai` 通道。
- Host：`index.js` 新增 `aiTranslate(choice)`——`resolveChoice`（follow 实时读 DSH 默认 / pinned 用所选）→ `llm.resolveModelInfo` 校验 `inputModalities` 含 `image` → 返回 `{ label, image(bytes), chat({prompt, image, signal, onUsage}) }`；页图经 `ctx.attachments.saveImage` 存一份，块翻译与整页兜底共用同一附件；`chat` 消费 `llm.stream`（`text-delta` 拼接、`usage` 汇总、`finish.reason` 为 `error/aborted` 时抛错），错误一律带 `provider / model`。只读 `agentDefaultModel`，全仓仍无 `saveSelection` / `selectModel`。
- 路由：`translate-chapter`、`translate-page` 请求体新增可选 `ai`（缺省 = follow，旧客户端不受影响）；任务启动**前**解析模型——`model-cannot-read-image` → 422、`no-model`/`no-llm`/`model-missing` → 503，不再让任务跑完 0 页。`translate-page` 的 data URL 只接受 png/jpeg/webp。
- 客户端：阅读器翻译/叠加入口改为按「整章翻译」行的模型是否支持读图 gate（`canTranslate = python && tex && 模型可读图`）；`translate-chapter` 带 `ai: readAiChoice('translate')`；设置页改选后通知外壳重读目录；模型缺失时 `EnvPrompt` 新增 `translate-model` 种类，直接跳到设置 → AI 模型页签；DeepSeek Key 行保留但标注"不再需要"。
- 文案：zh/en 各新增 `envNeedTranslateModel`、`envPromptAiModels`、`apiKeyDeprecated`，改写 `envImpact`、`settingsAiPending`（翻译行已接、会话行仍等）。
- 验证（全部 exit 0）：`node --check client.js`、`index.js`、`src/host/*.js`；`check-keys`（zh/en 无缺）；`check-deps`（457 条声明、无前向引用）；`host-test`；`ai-catalog-route-test`（8）；`ai-session-route-test`（13）；`loose-books-test`（18）；**新增** `translate-ai-route-test.mjs`（20 条：选择透传、data URL 解码、附件引用、`$$` 闭合、旧客户端无 `ai`、422/503/400/502 映射、无宿主能力降级）；**新增** `translate-job-test.mjs`（7 条：任务记录模型、栅格化 1 页、1 张图、整页提示词、`page-001.md` 缓存、产物写出）——该脚本要 spawn Python，workspace-write 下 `spawn EPERM`，需 danger-full-access 跑。
- 未覆盖：真实模型调用与真实附件体积（140 DPI 实测 212–356 KB/页，1158×1638）；断网/无权限供应商的真机报错；会话行的工作区归属（S2 遗留）。
- 2026-11-25 19:50 用户追加：① `\[ … \]` 要按 `$$ … $$` 处理 —— `balanceMath` 的 `'$$'` 替换在 JS 里等价于单个 `$`，已改成函数替换（`src/host/translate.js`），补两条断言；② 翻译前提示要说明附件占用 —— 确认框加 `translateStorageHint`（约 0.3 MB/页，按本章页数估算），设置页 AI 页签加 `settingsAiStorage`；③ 旧缓存已按用户指令清空（`~/.dsh/pdfdesk/translation` 30 文件、`translate-jobs` 20 文件）。
- 2026-11-25 20:30 真机首跑失败（用户报告"所有页面都没有返回译文"）：job JSON 的 `blockErrors` 显示真实原因 `400 {"type":"MissingSessionID","message":"Request is missing x-opencode-session …"}`。根因：OpenCode 渠道要求每个请求带 `x-opencode-session` 头，DSH 的 opencode 适配器只从 `GenerateOptions.sessionId` 填它（asar 里 `withSessionHeader`），而插件的后台翻译不是 Agent Session，没传 `sessionId` → 每一页都被上游 400。
  - 修：`index.js` 的 `aiTranslate` 生成一次"每次运行固定"的路由键 `session-pdfdesk-<uuid>` 并随 `llm.stream` 传入；`src/host/digest.js` 的提纲调用同一个坑，一并补 `session-pdfdesk-digest-<uuid>`。
  - 顺带修可观测性：`translate-job.js` 整页兜底失败时把原因记进 `state.blockErrors`，全灭时把第一条原因带进 `state.error`（之前只显示"请检查模型与网络"）。
  - 验证：新增 `ai-translate-wiring-test.mjs`（10 条：走真实 `apply()` → 路由 → `aiTranslate`，断言 `sessionId`、ImageBlock、默认/钉住模型、无图模型 422）exit 0；`translate-ai-route-test`、`host-test`、`check-keys` 全绿。**待用户重启后重测**。

**T-20261125-09 证据（2026-11-25 21:10，B：基线锚定 + 字号分级）**
- 用户 20:49 指令："B 现在做"，并接受三个判定值（正文 ≥9pt、首行基线 ≤2pt、允许扩框到相邻留白）。
- `tools/pdf_blocks.py`：每块新增 `firstBaseline`（首个基线，按页高归一）、`leading`（印刷行距）、`align`（left/center/right/justify，按行首/行尾/中心漂移判定）、`font`（主字体）、`lines`；`size` 改为**按字符数加权的正文主字号** ÷ 中位数（不再是块内最大字号）。
- `tools/md2overlay.py`：`[t]` minipage 的参考点就是首行基线，因此 `textblock` 的 y 直接取印刷基线（旧代码把 y 当"盒子上沿"，每块都高出约一个字身——这就是"对不齐"的主因）；行距用原文 leading（夹在 1.15–1.6×字号）；对齐按原文 `align`；去掉窄块 ×0.8 与 `adjustbox` 整体缩放（它是"字号忽大忽小"与 4–6pt 的来源），改用 `room_right` 先借右侧留白；超高时按实测高度只缩到 9pt 下限，仍溢出记 `overflow`。
- 测量：每块首行放一个零宽白色 1pt 标记（`MDnnn`），按标记做**精确**归属——两处重叠块曾被并成一组，导致一框吞掉另一块文字；正文以显示公式开头的块不放标记，按几何归属。layout 增加 `renderPt`、`baselineDelta`、`overflow`、`scale`，`fontPt` 改为"请求的正文字号"（公式的 script 字号不再触发下限误判）。
- 验证：`translate-job-test` 13 条 exit 0——`max baselineDelta = 1.69pt`（≤2pt 判定值）、`min fontPt = 9.0`、layout 24 行 dst 全合法；`overlay-probe.mjs` 在样张第 1 页逐块打印 target/got/delta（26 块，24 行有测量）。
- 未覆盖：两处重叠块在样张封面上仍拿不到测量（客户端回退到原 bbox 画框）；页底审计漂移最大 1.7pt（仍在上限内）；C/D 未动。
- 待手测：重新翻译一章 → 叠加 → 框选整页，看首行是否与原文同高、字号是否基本一致。

**T-20261125-09 证据（2026-11-25 21:58，B 基线修正：标记另起一行 + 缩进 + 单位）**

- 真机手测前的自检发现 B 的“首行基线 ≤2pt”是假达标：`layout.json` 的 `baselineDelta` 量的是**白标记**，PDF 里正文实际低 3.9–26.6pt（真实页 13/14 块低约一行）。三处根因都在 `tools/md2overlay.py`：
  1. minipage 开头处于垂直模式，`\hbox{…MDnnn}` **自占一行**，正文从第二行开始（最小复现 `marker.tex`：标记基线 100.3 / 正文 115.9）；
  2. ctexart 的 `\parindent=2em` 没清零，首行缩进 20pt 并越过块宽 20pt（贴页边时被裁）；
  3. `[t]` minipage 的参考点是**盒顶**不是首行基线（10pt 时基线在 y+7.6pt），“y 即基线”的前提不成立；另有单位问题：`TPHorizModule` 用 1pt 而页面/测量用 bp，越靠右漂移越大（约 2bp）。
- 修法：`\leavevmode` 让标记留在首行；导言区 `\parindent=0pt`；`TPHorizModule/TPVertModule` 改 1bp；第二遍编译按实测基线做 **y 校正**（不再只缩字号）；inline/display 公式判定用未缩放字号，避免两遍之间翻转；标记存在但文字被邻块抢走时仍记基线用于校正，不写 dst。
- `layout.json` **追加** `box`（放置框，归一）、`baseline`、`leadingPt`、`align`（原有字段不改语义）；`GET /pdfdesk/blocks` 把这几项一并交给阅读器，作为 C 文本层的数据。
- 验证：新增 `.dsh-scratch/overlay-baseline-test.py`（26 块样页）**max 基线偏差 0.75pt、max 首行缩进 0.01pt**、layout 与实测一致；`translate-job-test` 14 条 exit 0（max baselineDelta **0.88pt**、min fontPt 9.0、dst 合法）；`translate-ai-route-test` 29 条 exit 0（新增“text-layer geometry reaches the reader”）；`host-test`、`check-keys`、`check-deps`、`ai-translate-wiring-test` 全绿；`overlay-probe` 逐块 delta 0.00–0.01。
- 未覆盖：样页 4 个“文字被邻块抢走”的块没有 dst（回退原 bbox）；C/D 未动。
- 待手测：重启 → 重新翻译一章 → 叠加 → 框选整页：首行与原文同基线、右侧不再被裁、行距随原文。
**T-20261125-09 证据（2026-11-25 20:20，A+E 子集）**

- 用户 20:07 指令："A+E 试试看"。用户已看过《PDF阅读插件-1.5-叠加对齐-方案对比-2026-11-25.md》，本轮先做几何闭环（A）与翻译质量低垂果实（E），B/C/D 未动。
- **A 几何闭环**：`tools/md2overlay.py` 编译后用 PyMuPDF 回读，按"块放置矩形"把每段文字归到来源块，写出 `page-NNN.layout.json`（`id / dst / fontPt / lines`；`dst` = 译文实际占据的归一化矩形）；`src/host/routes.js` 的 `GET /pdfdesk/blocks` 读到该文件就把 `dst`/`fontPt` 附着到对应块；`client.js` 的"框选整页"优先用 `dst` 画框，没有记录时退回原来的 bbox+padding。旧译文没有 layout → 行为不变。
- **E1**：`tools/pdf_blocks.py` 的块文本上限 400 → 4000 字符（长段落不再只把前半段发给模型）。
- **E2**：`src/host/translate-blocks.js` 缺块不再静默——先整页请求，缺的 id 单独再请求一次；仍缺则标 `missing: true`。`src/host/translate-job.js` 把缺块页记进 `state.blockErrors`，客户端 `doneNote` 显示"有 N 页存在没译出来的块"。
- **E3**：块翻译提示词增加"不得合并/拆分块；空块返回空串；变量与定理号不译"。
- 验证（全 exit 0）：`node --check` client/index/src/host/*；两个 Python 脚本 `ast.parse`；`check-keys`；`check-deps`；`host-test`；`translate-ai-route-test` 28 条（新增清缓存 4 条 + layout 合并 2 条，无沙箱时后者 SKIP）；`translate-job-test` 13 条（新增：块 JSON 缓存、叠加 PDF、layout 26 行、dst 合法、fontPt > 0，需 danger-full-access）。
- 未覆盖：B（基线/字号分级）、C/D；真实模型下的缺块重试效果；字号不一与首行基线仍未解决（A 只管框，B 才管字）。
- 待手测：重新翻译一章 → 叠加 →「框选整页」→ 框应贴住译文而不是原文段落，末行不再被切；缺块页会在完成提示里点名。

**T-20261125-16 证据（2026-11-25 22:20，C：浏览器文本层，主阅读器已落码）**

- 用户 21:40 拍板：C 引入（Q9-5=A）、公式内置 KaTeX、导出仍走 LaTeX。
- Host：`GET /pdfdesk/blocks` 追加返回 `page: {width,height}`（layout 的实测纸型）与每块 `box / baseline / leadingPt / align / overflow`（B 修正已写入 layout.json；旧 sidecar 缺字段 → 客户端自动回退位图）。vendor 白名单新增 `katex/katex.min.js`、`katex.min.css`、`katex/fonts/*.woff2`（KaTeX 0.19.1 浏览器构建 + 20 个 woff2 子集，约 546KB）。
- 客户端：新增 `OverlayTextLayer`——叠加页从“1400px 位图 + 框裁切”改为 DOM 文本层：
  - 块位置用 `box`（页比例），字号 `fontPt`、行距 `leadingPt` 按层高换算 px，首行基线用 canvas 的 `fontBoundingBoxAscent` 反推 line box 的 top；框（mask）变成文本层的 `clipPath`（多个框合成一个 SVG clipPath），不再有位图背景。
  - 公式：KaTeX 按需加载（首个公式时注入 script；CSS **fetch 后内联**并把字体 URL 改绝对——Web 端 CSP 只允许 inline style、不允许外链样式表，和 host-ui.css 同一套路），`$…$` 行内、`$$…$$` 行间；加载失败或语法错误退回 LaTeX 源码，不阻塞正文；粗体/行内代码保留。
  - 性能：块内容（含 KaTeX 排版）按页面内容签名 memo，框拖拽/缩放不再重复排版公式；放不下按 3% 步长缩到 9pt 下限，仍溢出标 `data-overflow`；KaTeX 到达后重置缩放重新量。
  - 布局记录按页取（`page`、翻页重新请求）；行间公式是 block 元素、CSS 基线不可靠，按 layout 的 `dst` 顶对齐，正文仍按 `baseline`。
  - 「框住整页」在文本层就绪时直接取每个块的 `getBoundingClientRect` 生成框——框与字同源，不再“框比字小”。
  - 无 layout / 旧译文 / 整页重排 → 继续走原位图路径；右栏预览同样接文本层（只读框 + 框工具时随框实时更新）；文本层 `pointer-events:none`，框选/画笔手势不变，文本选中留到下一步。
- 验证（全 exit 0）：`overlay-text-layer-test.mjs`（页面资格、对齐映射、基线几何、markdown→节点、KaTeX 退化、组件渲染树的 clipPath/块定位/空块/无框全隐；**另用 u3-home 缓存的 85 块真实模型译文验证解析，61 块含公式全部生成节点**）；`overlay-text-layer-dom-test.mjs`（无头 Edge：块 top/left/字号/行距、行内与行间 KaTeX、框内命中框外不可见、层不吃指针事件）；`overlay-katex-csp-test.mjs`（按 Web 端 CSP 起页面：脚本同源加载、样式内联且字体 URL 绝对、公式可渲染；该策略会挡字体文件，故记录 fallback）；`host-test`（KaTeX 三条 + 路径逃逸）、`translate-ai-route-test` 30 条（新增 page 尺寸）、`translate-job-test`、`overlay-baseline-test`、`overlay-real-pages-test`、`mask-boxes-test`、`dual-overlay-test`、`ai-translate-wiring-test`；`node --check` 全过。
- 未覆盖/下一步：文本选中/复制入口（需要新的交互入口，不与框选抢指针）；缺 `box` 的旧 layout 只回退位图；真机首测。若 Web 端 CSP 挡了 `font-src`，KaTeX 会退到系统字体（公式仍可读、字形不如 KaTeX 字体），必要时再加 Cambria Math 回退。
- 待手测：重启 → 有译文的一章 → 开叠加 →「框住整页」：文字应清晰（200% 不糊）、框贴字、首行与原文同基线；公式正常；无 layout 的旧译文仍按原位图显示。

**T-20261125-17 证据（2026-11-25 22:30，D：LaTeX→Typst 数学转换器 spike）**

- 用户 21:40 拍板“先做转换器 spike”。扫描工作区 123 个 Markdown、13,969 行，抽出 **358 条真实公式**（去重；1,190 次出现），另含 50 条补充构造与 14 条能力探针；用 Typst 0.15.1 逐条编译。
- 结果：真实干净 **354/354 转换+编译（100%）**；真实全部 357/358（唯一失败是文档散文被 `$...$` 误抽）；补充集 50/50；探针 11/14；全语料 418/422（99.1%）。**已转换的 418 条全部编译成功**，没有“转换成功但编译失败”。
- 4 条明确不可转换：`\color`、`\phantom`、`rcases`、1 条误抽散文；没有静默吞错。
- Top 缺口：环境结构（array 列格式/`\hline`/`\Vmatrix`/`rcases`）、定界符尺寸（`\big/\Big/\middle` 塌成普通符号）、重音与多行脚标（`\substack`/`\overset`/`\widehat`）、文本字体（`\text{中文}` 依赖 fallback、`\textsc` 无 smallcaps）、编号/颜色/宏（`\tag/\label/\eqref` 忽略，扩展包宏未展开）。
- 关键限制：真实语料只有 1 个 pmatrix、1 个公式环境，没有 cases/array/binom/substack，88 条是单符号；**100% 是语法/编译覆盖，不等于排版保真**。D 的下一步是“保真语料 2.0 + 视觉/尺寸断言 + 52MB 二进制分发决定”，不宜直接替换内核。
- 产物：`.dsh-scratch/typst-convert/REPORT.md`（含失败分类与 5 个观感风险样例）、`out/gallery.pdf`；复现 `py -3 .dsh-scratch\typst-convert\extract_corpus.py → latex2typst.py → validate.py`。

**T-20261125-09 证据（2026-11-25 22:45，叠加归属改用抽取顺序）**

- 用真实译文页（`.dsh-scratch/u3-home/pdfdesk/translation/Serre表示论/c01`，85 块真实模型译文）跑 `md2overlay.py` 时发现：长译文越到下块时，旧的“最近标记”归属会把溢出的行判给下一块——85 块里 1 块无测量、17 块 `lines`/`dst` 被邻块污染，`overflow` 虚报 58 块。
- 修法：`measure_page` 改为**按抽取顺序归属**（textpos 按块顺序写内容流，标记之后的 span 属于该块直到下一个标记）；无标记的“行间公式开头”块仍先按几何矩形认领。仍是 1 个文件。
- 验证（新增 `overlay-real-pages-test.py`）：真实 7 页 **85/85 块全部有 layout**、`overflow` 58→17、max 基线偏差 1.25pt、min font 9.00；`overlay-baseline-test` 1.17pt/0.01pt；`translate-job-test` 0.82pt；`overlay-probe` 26/26 块（含两个公式块）delta 0～-0.01。

**T-20261125-17 证据（2026-11-26 00:30，D：全面替换落码）**

- 用户 2026-11-25 23:35 拍板“全面替换”（叠加 + 读版 + 导出全走 Typst，C 手测正常）。
- 新增模块：`tools/latex_to_typst.py`（spike 转换器产品化）、`tools/typst_runtime.py`（找/跑 Typst）、`tools/overlay_layout.py`（两引擎共享的放置/测量/layout.json 契约）、`tools/md2overlay_typst.py`（Typst 叠加内核）、`tools/md2typst.py`（Typst 读版 PDF）、`src/host/engine.js`（引擎解析）。
- `tools/md2overlay.py` 改为共享契约；行间公式块用“不可见标记单独一行 + 累积式三遍校正”，基线精度提到 0.01pt；`measure_page` 改为按内容流顺序归属、按行统计、按基线取首行、裁掉 Typst 数学 span 的夸张字体框。
- 接线：`index.js` 启动时 `resolveTypeset()`（有 Typst 就用 typst，否则 LaTeX；`MATH_DESK_ENGINE=latex` 可强制）；`routes.js`/`translate-job.js` 传 `overlayScript`/`typstEnv`；`runTool`/`toolOutput`/`renderMarkdown` 支持 env；`.render-version` 标记改为 `版本-引擎`，切引擎会自动重渲读版 PDF；`rebuild_overlay.py`/`realign_overlay.py` 认 `MATH_DESK_OVERLAY_SCRIPT`。
- 验证（全 exit 0）：`overlay-engines-compare.py` 真实 85 块两引擎都 85/85 行，Typst 基线 max 0.58pt（LaTeX 0.67）、字号均值差 0.13pt、**快 9.5×**（10.5s vs 99s），Typst 多 6 块 overflow；`overlay-baseline-test` 0.01pt；`translate-job-test`（LaTeX）与 `translate-job-typst-test`（Typst，26 行 layout、delta 0.01）都过；`md2typst-test` 41/41；`rebuild-overlay` 带 Typst env 重建出 PDF 且 layout 更新；`host-test`；`node --check` 全部。
- 本机 Typst 安装：`tools/typst/typst.exe`（52MB，已进 `.gitignore`，`build-dist.ps1` 打包时剔除）。分发方式（按需下载/用户自装/随包）仍未拍板。
- 已知差异：Typst 叠加比 LaTeX 多 6 块 overflow（Serre 85 块）；CJK-Latin 间距/断行导致行数、字号略有差异；读版 PDF 与 md2tex 有已知观感差异（行距换算、NO_TITLE 优先级、标题、表格降级）。
- 待办：重启手测（双语读版 + 叠加 + 新翻译）；全量测试重跑；docs/CHANGELOG/README；52MB 分发决策；文本选中入口。

**T-20261125-17 证据（2026-11-26 00:50，D 收尾拍板与下一窗口顺序）**

- 用户 2026-11-26 00:45 拍板：① 分发 = **按需下载 + 已装优先**（DEC-0013）；② 提交 = **手测通过后一次性提交**；③ 用户先重启手测（重启会关 DSH），之后程序员接手。
- 基线自查（00:42–00:45，全 exit 0）：`node --check` client/index/`src/host/*`；`check-keys`（zh/en 无缺）；`check-deps`（457 条、无前向引用）；`host-test`（含 KaTeX vendor 三条 200、路径逃逸拒绝）；`resolveTypeset()` 实测 `typst` + `md2overlay_typst.py` + `md2typst.py`，`typst.exe` 52,487,680 B。
- 未跑：其余 9 个全量脚本（含 3 个需 danger-full-access），已列入交接 §7.2 步骤 0。
- 手测清单与分发 5 行草案见《PDF阅读插件-1.5-D-全面替换-交接-2026-11-26.md》§7.3/§7.4。

**T-20261125-17 证据（2026-11-26 08:20，手测失败与 P0 根因）**

- 用户 08:07 手测：翻译 c04 失败，`md2typst.py` 报 `typst failed: failed to write PDF file (拒绝访问 os error 5)`；叠加文字字号不一/对不齐；深色模式下叠加框、疑问框、选中框不可见；叠加框内无法拖拽其它框。
- **P0 根因**：`tools/typst/typst.exe` 位于工作区（Low 完整性标签 `Mandatory Label\Low`），Windows 以 Low 运行该进程；Low 不能写 Medium 目录，而 `%TEMP%` 与 `分片\Serre表示论` 均为 Medium。`xelatex.exe` 装在 Medium 目录，所以 LaTeX 路径不犯。验证：同一命令写 `D:\长期文件\数学文件拆分稿\`（Low）成功、写 `%TEMP%` 失败；把 typst 复制到 `%LOCALAPPDATA%\dsh-pdf-workbench\typst\` 并 `icacls /setintegritylevel Medium` 后，两处都成功（各 155,614 B）。
- **修复**：删除 Low 副本 `tools/typst/`，`resolveTypeset()` 现解析到 `%LOCALAPPDATA%\dsh-pdf-workbench\typst\typst.exe`；`typst_runtime.py` 对 `failed to write PDF file` 追加可操作提示（完整性级别/只读/回退 LaTeX）。
- **框的修复**：叠加/疑问/选中框改用页内固定色 `#2563eb` + 白色描边（PDF 页恒为白底，界面令牌在深色主题变浅会消失）；`.md-overlay-layer` 只在 `annotTool === 'mask'` 时接管指针（此前一直吞掉手势），`.md-mask-boxes` 同步；选中文本框补可见边框。
- 验证：`node --check client.js` exit 0；`typst_runtime.py` `ast.parse` 通过；`resolveTypeset()` 输出 `typst C:\Users\18346\AppData\Local\dsh-pdf-workbench\typst\typst.exe`。未提交。
- 待手测：重启后重译 c04；深色模式框可见性；非 mask 工具下其它框可拖拽；字号/基线不一待定位（疑似 Typst 多 6 块 overflow 触发缩放）。

**T-20261125-17 证据（2026-11-26 09:20，手测回归修复与全量回归）**

- 用户 08:11 / 09:06 手测：P0（typst 写 PDF 被拒）已修；追加报告叠加层字号不一、深色模式框不可见、框内拖不出框、翻译按钮点了没反应。
- 修复：叠加/疑问/选中框改页内固定色 `#2563eb` + 白描边；隐形缩放手柄与握把改为仅在可见时 `pointer-events: auto`（这才是「框内拖不出框」的真因）；误加的 `.md-overlay-layer` 指针门控已回退（它导致十字光标消失）；翻译的成本/覆盖确认改用 `KitModal`（沙箱宿主会静默吞掉原生 `window.confirm`）。
- 全量回归（全部 exit 0）：`node --check` ×3；`check-keys`；`check-deps`（460 条）；`host-test`；`translate-ai-route-test`（1 条 SKIP：无宿主能力）；`translate-job-test`（LaTeX）；`translate-job-typst-test`（Typst，TEMP 指到工作区）；`overlay-baseline-test`（0.01pt）；`overlay-real-pages-test`（真实页基线）；`md2typst-test`（41/41）；`overlay-text-layer-test`；`overlay-text-layer-dom-test`；`overlay-katex-csp-test`；`overlay-engines-compare`（两引擎 `layout.json` 契约一致）。
- 字号不一的证据：`overlay-engines-compare` 逐块显示两引擎差异（例：`b-0005-02` 9.0pt/11 行 vs 10.0pt/7 行），说明差异来自排版层适配，而非客户端渲染；已把叠加层字体改为与页面一致的衬线栈并让它优先借用下方空隙再缩字号。
- 文档：`CHANGELOG.md` 新增 v1.5（未发布）小节；`README.md` 环境要求改为「Typst 推荐、TeX Live 回退」。
- 分发落地（2026-11-26 10:40）：`src/host/typst-install.js`（钉 v0.15.1 + SHA256、下载→校验→解压→`icacls /setintegritylevel Medium`、幂等、非 Windows 报 `unsupported`）；`engine.js` 新增 `locateTypst()`（来源 env/tools/local/path）与 `typstVersion`/`typstSource`；`GET|POST /pdfdesk/engine`（进 libraryFree，POST 同源校验，错误 400/502）；设置 → 环境 新增「排版引擎」行 + 下载按钮 + zh/en 9 个文案键。验证：`node --check` 四文件 0、`check-keys` 0、`check-deps`（460）0、`host-test` 0、版本探测实测 `0.15.1`（装到 `%LOCALAPPDATA%\dsh-pdf-workbench\typst`）。文档：`docs/RELEASE.md` §7、`安装与分发.md` 新增 Typst 说明。未覆盖：POST 的真实下载未跑（22 MB + 联网 + 写 `%LOCALAPPDATA%`），待 UI 手测。

**T-20261125-13 证据（2026-11-25 20:20，清翻译缓存按钮）**

- 路由：`POST /pdfdesk/clear-translation-cache`（libraryFree），删除 `dataDir/translation/**` 与 `dataDir/translate-jobs/*`；`status === 'running'` 的 job JSON 跳过，避免打断正在跑的翻译。返回 `{ removed, skipped }`。
- 客户端：设置 → 数据 → "翻译缓存"一节，按钮 + 二次确认 + 结果提示；文案说明产物 PDF 不会被删除。
- 验证：`translate-ai-route-test` 4 条断言（200、逐页文件清空、running job 保留且 skipped=1、GET 405）。
- 待手测：设置 → 数据 → 清除翻译缓存 → 提示"已清除 N 项"；翻译中的章节不会被清掉。

**T-20261125-04 证据（2026-11-25，W3 书库范围放宽）**

- 用户 2026-11-25 18:20 指令：先做简单功能，接着做 W3 书库放宽。五项未决按早期默认执行（默认隐藏 + 书库开关、每 PDF 一章、仅 `分片/` 目录、混合目录排在标准章后）。
- Host：`src/host/index-source.js` 里不合命名规则的 PDF 从"只计数"改为保留——分配 `cNN`（排在既有章之后、不覆盖）并标记 `loose: true`；整本都是未识别文件的目录不再进 `skipped`，而是成为 `loose: true` 的书。文件名排序用码位比较（`第一章` 在 `第二章` 前，拼音排序会反过来）。
- 客户端：书库顶部出现「显示未识别书籍 / 隐藏未识别书籍」开关（存 `pdfdesk:show-loose`）；默认隐藏，隐藏时显示"有 N 本未识别书籍，仍可打开"。
- 不写盘：`索引.json` 与磁盘文件名一律不动，`loose` 只存在于内存目录。
- 验证：`node --check` 三项 exit 0；`check-keys`/`check-deps`/`host-test` exit 0；`loose-books-test.mjs` exit 0（14 条断言：未改造目录成书、标记、两个 PDF 都读、标题、编号、不再 skipped、正常书不受影响、翻译产物不进章、混合目录两类共存、编号不冲突）。
- 待手测：书库里放一本未改名的书 → 默认不出现 → 点开关 → 出现且能打开、能翻页。
- 用户 2026-11-25 18:45 补充：① 未识别书籍**也要包括整本未拆分的 PDF**；② 开关改成**两个独立按钮**——「整本书：显示/隐藏」与「未按命名拆分：显示/隐藏」，**默认都显示**，各自存本机（`pdfdesk:show-whole` / `pdfdesk:show-loose`）；③ 混合目录的 loose 章**保持直接显示**（Q3-5 = B）。
- 说明：`整本/` 目录里的书一直能显示；不显示的是"整本 PDF 放进 `分片/` 或名字不带 `cNN`"——旧逻辑会把整个目录跳过，W3 补上这个缺口。
- 用户 2026-11-25 19:05 追加问题与根因（已修）：
  - **整本书没识别**：`分片/` 根目录下直接放的 PDF 从未进入目录——`scanFragments` 只遍历子目录（`if (!entry.isDirectory() && !entry.isSymbolicLink()) continue`），`scanWholeBooks` 只读 `整本/` 与库根。修：`scanWholeBooks` 增加第三个来源 `分片/`（`wholeAt: 'fragment'`），`pdf-source.js` 的 `chapterPdfPath` 支持该位置。实测用户库：该书进入目录，`whole=true`，路径解析到 `分片\\<文件>.pdf`。
  - **按钮点了没反应**：书架的框选层用 `event.target.closest('.md-card, .md-collection, .md-btn')` 判断"按在控件上"，但 `KitButton` 渲染宿主按钮时会剥掉 `md-*` 类名，按到按钮被当成空白区 → `setPointerCapture` 抢走指针 → click 到不了按钮。修：判断里补上 `button, a, [role="button"], input, select`。
- 用户 2026-11-25 19:20 拍板：`ppt/` 这类目录 = **一本多章**（22 个 PDF = 一本 22 章），不拆成 22 本书；顶部黄色提示**自动淡出**（7 秒开始淡、7.8 秒移除，文案变化会重新出现）**且可点击关闭**。
- 未做：隐藏书籍/书架分组对 loose 书的兼容未单独验证；`loose` 书加入书架分组的入口未测。

## 单元详情（2026-11-24）

### T-20261124-01 · U1 无翻译件/翻译中时，两个“叠加”入口禁用

- 状态：完成（v1.4.1 已发布；Round 2 测试通过：验收 1–4 + W3/W2；review Round 2 的 3 Warning 仅记录，发布前回应）
- Round 2 Warning 处置（boss 2026-11-24）：R1–R3 **仅记录、发布前回应**，本轮不修复、不阻塞 tester；R6 与 Suggestion 3 接受为已知残余；详见 `docs/reviews/T-20261124-01.md` Round 2。tester Round 2 另记录一个观察项：reload 后约 7 s 的首击未触发、二次成功（未归因，发布前与上述 Warning 一并回应）。
- 承接角色：programmer
- 用户可感知的结果：
  1. 未检测到本章翻译件时，①主阅读器右侧竖排工具条里的“叠加”按钮、②右侧预览顶部工具条里的“叠加”按钮均为灰色禁用，点击无动作；
  2. 翻译完成、翻译件可用后，两个入口都恢复可用，且状态始终一致；
  3. 翻译任务进行中（含已有旧翻译件、正在重译）两个入口均禁用；
  4. “翻译”入口始终保持正常，不受影响。
- 不做什么：
  - 不改主阅读器**顶部横向**工具栏的“叠加”按钮现状（用户已确认不在本次范围）；
  - 不改“翻译”按钮、翻译流程或文案；
  - 不为两个入口各造一套“是否有翻译件/是否翻译中”的状态；
  - 不顺手处理 U2–U5 或其它右栏问题；
  - 不把右栏竖排工具条、右栏右键菜单里的同名“叠加”项擅自纳入；若复现发现同样会误点，只记录并交 boss/用户裁决。
- 影响范围：
  - `client.js`：`ReaderView` 的竖排工具条 `railTool('mask', ...)`（约 12738 行）与 `hasTranslation` / `translating`；
  - `client.js`：`SidePdfView` 顶部 `.md-side-bar` 的 `mask` 按钮（约 15802–15809 行）；右栏目前没有“本章是否有翻译件/是否翻译中”的状态，需要接同一来源；
  - 单一来源：复用或抽取“本章翻译件是否存在 + 是否翻译中”的共享查询/模块级状态，禁止两个组件各存一份；若需要新增共享状态、改 `VIEW_PUBLISHED` 等契约，先出计划等用户确认；
  - 可能涉及现有 `GET translated-info` 与 `docRev` 刷新；不改 Host 存储、路由或 sidecar 结构。
- 验收来源：用户 2026-11-24 指令 U1 现状/期望/验收 1–4；用户已确认：两个入口 = 主阅读器右侧竖排工具条 + 右侧预览顶部工具条；翻译进行中 = 禁用。参考 `docs/TRANSLATION.md` §2.4/§4.4（叠加依赖翻译件）与 `docs/SIDE-PREVIEW.md` §6.1.4（右栏叠加框按需加载译文）。
- **用户 2026-11-24 补充裁决（W3，追加验收来源）**：
  - 阅读器未挂载时，右栏 tab 仍是独立 PDF 预览，应能按需加载译文；**reader 是否挂载不得改变右栏“叠加”的可用性**。
  - 本章有可用翻译件 → 右栏“叠加”可用且点击能加载译文；无翻译件 → 禁用；翻译中 → 禁用；查询中/状态未知 → 先禁用或显示加载，**不得把“未知”当永久禁用**。
  - 修法：把翻译事实提升为按 `bookId:code` 键控的共享查询/缓存；reader 在时更新，reader 不在时右栏也能取到；不得让右栏另存一份。
  - W3 属 U1 边界缺陷（不是已知限制）；tester 验收须加入“重启后只恢复右栏 tab、reader 未挂载”场景；复现为禁用则 U1 不通过 → `退回执行`。
  - 返修约定：W1/W2/W3 合并为一次 U1 返修，走 Round 2 审查与重测，不拆多个窗口。
- 验证方式：
  - 手动验收 1–3：未翻译章节（两入口灰、点击无动作）、翻译完成（两入口恢复且一致）、翻译中（两入口灰）；“翻译”按钮始终可用；
  - 覆盖单页/连续、右栏顶部工具条显示/隐藏（`⋯` 手柄）两种状态，确认没有出现第三处同名入口不一致；
  - `node --check client.js`；若改动 `src/client/` 或 vendor UI，跑 `npm run build:host-ui`；按 `AGENTS.md` §4 跑受影响 smoke（至少 `side-smoke.mjs`，涉及翻译/叠加时跑 `dual-overlay-test.mjs`）；客户端改动需重启 DSH 验证，不承诺 HMR。
- 依赖/风险：
  - 先复现并定位根因；没有稳定复现不改代码；
  - 用户预计可能涉及两个组件；若根因跨组件、改动 ≥3 文件或触碰受保护契约，**先出计划并等用户确认**，不得直接改；
  - 翻译中状态目前只在主阅读器本地（`translating`），右栏要禁用需接同一信号；不得用轮询、延时或遮罩掩盖；
  - 右栏顶部工具条可隐藏（`⋯` 手柄），隐藏态下入口不可见，不要求额外入口。
- 报告：`docs/reviews/T-20261124-01.md`（Round 1/2）· `docs/tests/T-20261124-01.md`（Round 1/2）
- 发布规模：patch（发布时按实际影响复核）

### T-20261124-02 · U2 右侧预览疑问框不可用

- 状态：已关闭（2026-11-24 用户报告现象自行恢复正常，取消修复计划；未改代码、未定位根因；若在 HEAD `460ebbb` 或其后复现，重开单元并附最小复现）
- 2026-11-24 复现结论（programmer）：HEAD 未复现；静态证据显示右栏疑问工具/疑问层/创建保存撤销路径均存在（工具 `client.js:16164`、层 `:15634–15644`、创建 `:8007–8035`、提交 `:15552–15578`、撤销 `:15583–15610`）；组件级 harness（真实 `client.js` + React/ReactDOM + jsdom + 假 pdf.js/Host）通过。证据：`.dsh-scratch/u2-repro-evidence.md`（仓库外）。真机 Edge 在本会话被沙箱阻止，真实集成未覆盖。
- 承接角色：programmer
- 用户可感知的结果：右栏疑问框与主阅读器一致——能选中工具、能落框、能保存、刷新/切页后还在、能撤销/删除；若复现证明右栏设计为只读，本单元转“记录现状”交 boss/用户裁决。
- 不做什么：
  - 先复现再改代码；复现不稳定只做根因定位，不提交猜测性修复；
  - 不扩大为右栏其它工具修复；不改 U1 已验收的两处“叠加”门控；
  - 不与 U3 合并（独立单元）。
- 影响范围（待复现后细化）：`client.js` 右栏 `SidePdfView` 的疑问工具/疑问层；可能涉及 `src/host/questions.js` 与共享批注存储；若需改受保护契约（questions 路由/存储键/共享事件），先出计划等用户确认。
- 验收来源：用户 2026-11-24 报告 U2（右侧预览疑问框不可用），报为 bug 即视为预期应可用；参考主阅读器同章行为与 `docs/SIDE-PREVIEW.md` 的右侧预览能力约定。若复现证明右栏设计为只读，停止并交 boss/用户，不自行改需求。
- 复现清单（programmer 先自查，结果写进诊断）：工具能否选中；能否在页上拖出/点出疑问框；是否保存；刷新/切页后是否还在；单页/连续是否都异常；主阅读器同章是否正常；右栏是否只读。
- 验证方式：`node --check client.js`；按 `AGENTS.md` §4 跑受影响 smoke；客户端改动需重启 DSH 验证；真机复现证据放 `.dsh-scratch/`。
- 依赖/风险：先复现再修；≥3 文件或触碰受保护契约先出计划等确认；不得用“看起来应该支持”代替证据。
- 报告：`docs/reviews/T-20261124-02.md`（Round 1）· `docs/tests/T-20261124-02.md`（Round 1）
- 发布规模：无（已关闭，无代码改动）

### T-20261124-03 · U3 右侧预览连续模式手形工具无法移动页面

- 状态：完成（v1.4.1 已发布；2026-11-24 tester Round 2：依据用户桌面 DSH 实测通过——“连续模式手形拖动可滚动、松手不回弹；单页手形平移正常；换其它工具后不误滚”；tester 本环境无浏览器（沙箱 Mojo 0x5），未独立复验；详见 `docs/tests/T-20261124-03.md`）
- 2026-11-24 boss 裁决：不重派同一无浏览器环境；U4/U5 修完后由用户在桌面 DSH 一次性实测 U3/U4/U5，tester 据用户实测证据与自动化证据落盘，报告注明“用户实测、tester 无法独立复验”。
- 承接角色：programmer
- 用户可感知的结果：连续模式下，右栏手形工具拖动应能平移/滚动页面；不触发选择、标注或页面跳转；单页模式保持正常。
- 不做什么：
  - 不与 U2 合并；若后续确认与 U2 是同一处事件接线问题，由 programmer 提出合并，由 boss/用户裁决；
  - 不写代码直到复现稳定；不靠特判、延时或遮罩掩盖；不改 U1 已验收的门控。
- 影响范围（待复现后细化）：`client.js` 右栏 `SidePdfView` 的 `tool === 'hand'`、`scrollGrab`、`onPan`/`setSidePan`、连续视图事件处理；可能涉及 `PdfViewer`/`ContinuousView` 的手形接线。
- 验收来源：用户 2026-11-24 报告 U3（右侧预览连续模式手形工具无法平移），报为 bug 即视为预期应可用；参考主阅读器连续模式的手形行为与 `docs/SIDE-PREVIEW.md` 的右侧预览能力约定。
- 复现清单（programmer 先自查，结果写进诊断）：手形工具是否正常选中；拖动时完全不动/抖动/回弹/只动一点；单页是否正常；是否仅连续模式异常；缩放/适应栏宽是否影响。
- 验证方式：`node --check client.js`；按 `AGENTS.md` §4 跑受影响 smoke；客户端改动需重启 DSH 验证；真机复现证据放 `.dsh-scratch/`。
- 依赖/风险：先复现再修；若根因跨视图/触碰受保护契约，先出计划等确认；不改 `side-smoke`。
- 报告：`docs/reviews/T-20261124-03.md`（Round 1）· `docs/tests/T-20261124-03.md`（Round 1 阻塞 / Round 2 用户实测通过）
- 发布规模：patch

### T-20261124-04 · U4 右侧预览右键菜单点击外部不关闭

- 状态：完成（v1.4.1 已发布；2026-11-24 tester Round 1：依据用户桌面 DSH 实测通过——“右键菜单点外关闭、点菜单项执行并关闭、别处右键切换不叠加”；review Round 1 无 Critical、3 条 Suggestion 仅记录；tester 本环境无浏览器（沙箱 Mojo 0x5），未独立复验；详见 `docs/tests/T-20261124-04.md`）
- 2026-11-24 boss 裁决：3 条 Suggestion 仅记录、不修（收窄阅读态 / click 与 dblclick / `context-menu-trigger` 对等性）；真机项随 U3/U4/U5 一次性桌面验收。
- 承接角色：programmer
- 用户可感知的结果：
  - 右栏 PDF 上弹出右键菜单后，左键点击菜单外任何区域，菜单关闭；
  - 点菜单内正常项后关闭；
  - 在别处重新右键时，旧菜单关闭或切换，不叠加；
  - 不误触底层按钮、页面或标注；不出现多个菜单同时存在；Esc 若已有行为需保持。
- 不做什么：不改菜单项内容/动作；不改右键菜单以外的交互；不并入 U1；不把“菜单不关”用全局遮罩层临时掩盖（先定位根因）。
- 影响范围（待复现后细化）：`client.js` 右栏 `SidePdfView` 的 `openSideMenu`、`SIDE_MENU_KIND`、`registerSidePreview`；若走 DSH `contextMenus` 服务，需确认外部点击关闭是宿主行为还是插件注册行为；插件降级路径 `FallbackMenu` 也需核对。根因可能在宿主侧时，先报告，不改 DSH 宿主。
- 验收来源：用户 2026-11-24 指令 U4 现状/预期/验收；参考 `docs/SIDE-PREVIEW.md` §6.4（右键菜单契约）。
- 验证方式：手动覆盖页面右键/工具条 `⋯` 两种打开点、菜单内/外点击、别处右键、Esc；确认不误触底层；按 `AGENTS.md` §4 跑 `node --check` 与受影响 smoke；客户端改动需重启 DSH 验证。
- 依赖/风险：独立单元；排在 U1 之后由用户/boss 派发；若根因在 DSH 共享菜单，需另定方案（不能改宿主）。
- 报告：`docs/reviews/T-20261124-04.md`（Round 1）· `docs/tests/T-20261124-04.md`（Round 1）
- 发布规模：patch

### T-20261124-05 · U5 重命名疑问的输入框透明

- 状态：完成（v1.4.1 已发布；2026-11-24 tester Round 1：依据用户桌面 DSH 实测通过——“重命名输入框有不透明背景，浅/深色页面可读，Enter/Esc 正常”；review Round 1 无 Critical、2 条 Suggestion 仅记录；tester 本环境无浏览器（沙箱 Mojo 0x5），未独立复验；详见 `docs/tests/T-20261124-05.md`）
- 2026-11-24 boss 裁决：2 条 Suggestion 仅记录、不修；U5 真机项并入 U3/U4/U5 一次性桌面验收。
- 承接角色：programmer
- 用户可感知的结果：
  - 重命名疑问时，输入框有正常的不透明背景，与现有输入框/对话框样式一致；
  - 在白色、深色或其他页面内容上背景都清晰可读；
  - 输入、确认、取消、Esc 行为正常；不改变重命名业务逻辑；不影响背后的标注和页面。
- 不做什么：不改重命名业务逻辑/快捷键；不顺手改其它弹窗/输入框；不新增工具条按钮；不并入 U1。
- 影响范围（待复现后细化）：`client.js` 疑问重命名输入框（`.md-question-input` 附近，约 7901/13821 行）；背景可能来自 `KitInput`/主题 token；若需改 `locale` 或 vendor 样式，先确认是否受保护。
- 验收来源：用户 2026-11-24 指令 U5 现状/预期/验收。
- 验证方式：手动在浅色/深色页面背景上触发重命名，检查背景不透明度、文字可读性、确认/取消/Esc；按 `AGENTS.md` §4 跑 `node --check`；客户端改动需重启 DSH 验证。
- 依赖/风险：独立单元；后续派发；样式修复不得改变重命名数据流。
- 报告：`docs/reviews/T-20261124-05.md`（Round 1）· `docs/tests/T-20261124-05.md`（Round 1）
- 发布规模：patch

### T-20261124-06 · 把 U1 最终设计写入 SIDE-PREVIEW 契约文档

- 状态：待执行（设计已定稿为 DEC-0009；不涉代码，随下次文档批次派发，本轮不派发）
- 承接角色：programmer（只改文档）
- 用户可感知的结果：无用户可见变化；维护者读到的契约与实现一致。
- 不做什么：不改代码、不改字段语义或行为；不与 U1 代码改动混在同一提交；不改 README/features。
- 影响范围：`docs/SIDE-PREVIEW.md` §5.1/§5.2（确认为原 `VIEW_PUBLISHED` 字段集、无需扩展）、§6.1.4（右栏按需加载译文）；记录 chapterKey 翻译事实缓存与右栏自查询；对照 `client.js:3241–3474`、`:3154–3157`、`:15875–15886`。
- 验收来源：DEC-0009（已接受）；`docs/reviews/T-20261124-01.md` Round 2 Suggestion 1；用户 2026-11-24 W3 裁决。
- 验证方式：逐字段对照实现与文档；文档-only 改动检查链接、文件名与引用路径（`AGENTS.md` §4）。
- 依赖/风险：设计已定稿，不再阻塞；若发现文档与实现不符，停止并交 boss/用户。
- 报告：`docs/reviews/T-20261124-06.md`（Round 1）· `docs/tests/T-20261124-06.md`（Round 1）
- 发布规模：patch（文档，随下次发布）

### T-20261124-07 · 右栏其余同名“叠加/框选”入口与 U1 门控一致

- 状态：完成（v1.4.1 已发布；2026-11-24 tester Round 1：依据用户桌面 DSH 实测通过——“无译文章节右栏竖排/右键菜单‘叠加/框选’灰色、点不动；有译文可用；翻译中灰”；review Round 1 无 Critical、0 Warning、3 条 Suggestion 仅记录；tester 本环境无浏览器（沙箱 Mojo 0x5），未独立复验；详见 `docs/tests/T-20261124-07.md`）
- 2026-11-24 boss 裁决：3 条 Suggestion 仅记录、不修；T-07 真机项并入 T-07/T-08/T-09/T-10 批量桌面实测。
- 承接角色：programmer
- 用户可感知的结果：右栏竖排工具条与右键菜单里的同名“叠加/框选”项，在“无翻译件 / 翻译中 / 有翻译件 / reader 未挂载”四态下与 U1 两处入口语义一致；无译文时禁用。
- 不做什么：不并入 U1；不改 U1 已验收的两处入口；不顺手改菜单其它项或其它工具；不与 T-08 合并。
- 影响范围：`client.js` 右栏竖排工具条（约 15894 行）与右键菜单（约 15465 行）中的同名“叠加/框选”项；复用 DEC-0009 的 chapterKey 共享事实，不另造状态。
- 验收来源：用户 2026-11-24 报告（右栏右部工具栏无译文时框选按钮未禁用）；`docs/reviews/T-20261124-01.md` Suggestion 1；DEC-0009。
- 验证方式：先复现四态下两入口行为，再定最小修法；按 `AGENTS.md` §4 验证；真机由用户桌面一次性实测（沙箱无浏览器）。
- 依赖/风险：复用 W3 共享门控；若无法直接复用或需改契约，先停下交 boss。
- 报告：`docs/reviews/T-20261124-07.md`（Round 1）· `docs/tests/T-20261124-07.md`（Round 1）
- 发布规模：patch

### T-20261124-08 · 右栏文本框拖动创建失效（点击式生成）

- 状态：完成（v1.4.1 已发布；2026-11-24 tester Round 1：依据用户桌面 DSH 实测通过——“右栏文本工具拖动建框为拖拽大小、有虚线草稿；空白单击仍默认尺寸”；review Round 3 无 Critical、0 Warning、1 条 Suggestion 仅记录；tester 本环境无浏览器（沙箱 Mojo 0x5），未独立复验；详见 `docs/tests/T-20261124-08.md`）
- 2026-11-24 boss 裁决：1 条 Suggestion 仅记录、不修；T-08 真机项并入 T-07/T-08/T-09/T-10 批量桌面实测。
- 承接角色：programmer
- 用户可感知的结果：右栏预览 PDF 上按住拖动创建文本框时，应按拖拽语义生成，而不是松手时在点击处生成默认尺寸文本框；与主阅读器同章行为一致。
- 不做什么：不改主阅读器已正常的文本框创建；不改其它工具；不改 U1/U3/U4/U5 的改动；不与 T-07 合并。
- 影响范围（待复现后细化）：`client.js` 右栏 `SidePdfView` 的文本工具指针处理（创建/提交路径）与主阅读器对应实现；可能涉及共享 `createPlane`/坐标换算。
- 验收来源：用户 2026-11-24 报告（右栏文本框拖动生成失效，与 PDF 页功能不一致）。
- 复现清单：主阅读器同章拖动是否正常；右栏拖动时是否有虚线/草稿；松手后文本框位置/尺寸是否为点击式默认值；单页/连续是否都异常。
- 验证方式：node --check；受影响的 `.dsh-scratch/*test*.mjs`；真机由用户桌面一次性实测（沙箱无浏览器）。
- 依赖/风险：先复现再修；若需改共享契约/≥3 文件先出计划。
- 报告：`docs/reviews/T-20261124-08.md`（Round 1–3）· `docs/tests/T-20261124-08.md`（Round 1）
- 发布规模：patch

### T-20261124-09 · 主阅读器竖排“叠加/框选译文”按钮点击无反应、完全拖不出框

- 状态：完成（v1.4.1 已发布；2026-11-24 tester Round 1：依据用户桌面 DSH 实测通过——“主阅读器（原文 PDF、有译文）竖排‘叠加’点击后选中并出现叠加层，能拖出框保存”；review Round 1 无 Critical、2 Warning、1 Suggestion 仅记录/发布前回应；tester 本环境无浏览器（沙箱 Mojo 0x5），未独立复验；详见 `docs/tests/T-20261124-09.md`）
- 2026-11-24 boss 裁决：Warning 1–2 仅记录、发布前回应；Warning 2（译文 PDF 上竖排 mask 仍启用但无叠加层）需用户确认产品预期，若实际是在译文 PDF 上点击则另开单元；T-09 真机项汇入 T-07/T-08/T-09/T-10 批量实测。
- 承接角色：programmer
- 用户可感知的结果：本章有可用翻译件时，主阅读器右侧竖排“叠加/框选译文”按钮应可选中，并在页面上拖出框选译文框；不得出现“看起来可用但点击无反应/完全拖不出框”。无译文时按 U1 语义保持禁用并可见禁用态。
- 不做什么：不改 U1 已验收的“无译文禁用”语义；不改右栏；不改其它工具；不与 T-10 合并（若根因确为同一处，由 programmer 提出、boss/用户裁决）。
- 影响范围（待复现细化）：`client.js` `ReaderView` 竖排 `mask` 工具激活、mask 拖拽创建路径与 `translationFacts` 门控。
- 验收来源：用户 2026-11-24 报告（主阅读器叠加按钮点了没反应、完全拖不出框）。
- 复现清单：按钮在有无译文时的 disabled/选中态；点击后工具是否激活；页面上拖动是否有草稿/框；右栏同工具是否正常；判断是 U1 门控误伤（有译文仍禁用）还是工具本身断线。
- 验证方式：`node --check`；跑受影响的 `.dsh-scratch/*test*.mjs`；真机由用户桌面一次性实测（沙箱无浏览器）。
- 依赖/风险：先复现再修；若需改共享契约/≥3 文件先出计划。
- 报告：`docs/reviews/T-20261124-09.md`（Round 1）· `docs/tests/T-20261124-09.md`（Round 1）
- 发布规模：patch

### T-20261124-10 · 框选译文的框无法删除（右栏预览可复现）

- 状态：完成（v1.4.1 已发布；2026-11-24 tester Round 1：依据用户桌面 DSH 实测通过——“右栏选中‘叠加/框选译文’后右键已有框立即消失、不弹页面菜单、Ctrl+Z 可撤回；拖动/改大小/空白新建正常”；review Round 1 无 Critical、0 Warning、3 条 Suggestion 仅记录；tester 本环境无浏览器（沙箱 Mojo 0x5），未独立复验；详见 `docs/tests/T-20261124-10.md`）
- 2026-11-24 boss 裁决：3 条 Suggestion 仅记录、不修（含“未选 mask 工具时右键只弹页面菜单”的已知残余——与疑问“先选工具再右键删除”惯例一致；若要“无工具删除”另行开单元）；T-10 真机项并入批量实测。
- 承接角色：programmer
- 用户可感知的结果：对已存在的框选译文框，应能按既定交互删除（右键菜单含删除项/Delete 键等），删除后立即消失并持久化；不得出现“右键只弹菜单、无删除或删除无效”。
- 不做什么：不改 U1 门控；不改其它标注类型的删除；不与 T-09/T-08 合并；不把删除失败用遮罩掩盖。
- 影响范围（待复现细化）：`client.js` mask 框命中/右键菜单/删除路径、`SidePdfView` 的 mask 层事件与共享存储写路径。
- 验收来源：用户 2026-11-24 报告（框选译文的框均不可删除，右键会跳出菜单）。
- 复现清单：框在右栏/主阅读器是否存在；右键菜单是否含删除项；点删除后 DOM 与存储是否变化；Delete 键；刷新后是否复活；是否受 U4 菜单关闭修复影响。
- 验证方式：`node --check`；跑受影响的 `.dsh-scratch/*test*.mjs`；真机由用户桌面一次性实测。
- 依赖/风险：先复现再修；优先在右栏复现（主阅读器受 T-09 影响暂不可测）。
- 报告：`docs/reviews/T-20261124-10.md`（Round 1）· `docs/tests/T-20261124-10.md`（Round 1）
- 发布规模：patch

## 待拆解入口

- 新需求规格：`docs/requirements/`
- 角色调整提案：`docs/feedback/`
- 用户直接指令：由用户在对话中给出，boss 拆解后写入本表

## 单元模板

```markdown
| T-YYYYMMDD-NN | P? | <一句话结果> | <文件/模块> | `docs/requirements/<file>.md#<section>` 或 `AGENTS.md#<section>` | <前置单元/用户确认/环境> | <角色> | 待执行 | — |
```

### 单元详情模板

```markdown
## T-YYYYMMDD-NN · <标题>

- 状态：待执行
- 承接角色：
- 用户可感知的结果：
- 不做什么：
- 影响范围：
- 验收来源：
- 验证方式：
- 依赖/风险：
- 报告：`docs/reviews/<ID>.md`（Round N）· `docs/tests/<ID>.md`（Round N）
- 发布规模：patch / minor / major / 待定
```
