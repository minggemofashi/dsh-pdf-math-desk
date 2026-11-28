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
| T-20261125-05 | P1 | 阅读器与右栏上方工具条（含右栏疑问按钮） | `client.js` 顶栏 | 需求 §5.3 验收 4/5 | Q5-1「书本」经用户确认是笔误、已取消；Q5-2→撤销/重做、Q5-4 放副栏、Q5-5 沿用现有按钮尺寸；复用 DEC-0003 单一动作源 | programmer | 完成（用户 2026-11-26 16:47 手测「可以」） |
| T-20261125-06 | P1 | 笔/橡皮与光标对齐 | `client.js` 坐标换算与光标 | 需求 §1.3 | 数位板复现（Q1-4）+ Q1-1/Q1-2/Q1-5 | programmer | 阻塞：待复现 |
| T-20261125-07 | P1 | 数位板手移不动、笔/橡皮抬笔消失 | `client.js` pan 与指针手势 | 需求 §5.3 验收 1–3 | 同 T-06 复现；与 T-06 同片代码，复现一次覆盖两单元 | programmer | 阻塞：待复现 |
| T-20261125-08 | P2 | 启动/上下文基线 + 其它 API 兼容 | 度量 + 配置 | 需求 §4.3 | Q4-1 由 T-12 回答（复用 DSH 已配置模型）；Q4-2/Q4-3 先测基线再定目标 | programmer | 进行中（基线已测，待拍板目标值） |
| T-20261125-09 | P2 | 翻译覆盖层文字对齐（不裁字/不重叠/基线/字号下限） | `tools/pdf_blocks.py`、`tools/md2overlay.py`、`src/host/routes.js`、`client.js` | 需求 §9.3 | A（几何闭环）+E（翻译质量）2026-11-25 20:20 落码；B 21:10 落码、**21:58 修基线假达标**（标记另起一行/缩进/单位）；C/D 2026-11-25 21:40 已拍板（C 内置 KaTeX；D 先做公式转换 spike；导出仍走 LaTeX） | programmer | 完成（用户 2026-11-26 16:47 手测「可以」） |
| T-20261125-13 | P2 | 设置页一键清除翻译缓存（逐页 md/blocks/layout/job），正在进行的任务跳过 | `src/host/routes.js`（`POST /pdfdesk/clear-translation-cache`）、`client.js` 设置 → 数据 | 用户 2026-11-25 20:07 指令 | 无 | programmer | 完成（用户 2026-11-26 16:47 手测「可以」） |
| T-20261125-14 | P2 | 右侧预览与 PDF 页页码统一 | `client.js`：`SidePdfView` 页码 vs 主阅读器页码 | 用户 2026-11-25 20:49 指令（**暂不执行**） | 待复现：两处页码当前口径（预览页号 / PDF 物理页号 / 是否有偏移） | programmer | 待执行 |
| T-20261125-15 | P2 | 右侧预览单页模式滚轮无法滑到空白处（与 PDF 页同步） | `client.js`：`SidePdfView` 单页滚动容器 | 用户 2026-11-25 20:49 指令（**暂不执行**） | 待复现：单页模式滚轮是否被截断；对照主阅读器单页滚动范围 | programmer | 待执行 |
| T-20261125-16 | P1 | 叠加层改浏览器文本层（C）——任意缩放清晰、可即时修订 | 新渲染路径（`client.js` 叠加层）+ Host 输出 layout JSON + 公式 KaTeX | 需求 §9.3 第 5 条；用户 2026-11-25 21:10 拍板排入下一轮 | Q9-5=引入已拍板；B 的 `layout.json` 契约已就绪；KaTeX 已 vendor | programmer | **主阅读器 + 右栏预览已落码；用户 2026-11-25 手测正常**；复制/Alt 划选整组 2026-11-26 11:50 按用户要求**撤下**（补发 md 会让文本层真正绘出、叠加显示错乱），文本层代码保留但休眠 |
| T-20261125-17 | P1 | 排版引擎换 Typst（D）——`measure()` 精排、免 TeX Live、编译提速 | `tools/md2tex.py`/`md2overlay.py` 的排版内核 | 需求 §9.3 全量 + 产物兼容；用户 2026-11-25 21:10 拍板排入下一轮 | 用户 2026-11-25 23:35 拍板“全面替换”（叠加 + 读版 + 导出全走 Typst）：**已落码，待重启手测**；分发=按需下载+已装优先（DEC-0013） | programmer | 完成（2026-11-26 手测通过；未发布） |
| T-20261125-10 | P2 | PDF 拆分小包（独立仓库/产品） | 新仓库 | 需求 §2.3 | Q2-1…Q2-7；>1MB 不集成进插件 | programmer | 完成（用户 2026-11-26 16:47 手测「可以」；`工具/` 复制收尾按用户 2026-11-26 17:19 **取消**：该功能有严重 bug 且可有可无） |
| T-20261125-11 | P1 | 连续模式页码跟视口顶边走：上一页完全移出才切换 | `client.js` 连续模式页码上报 | 用户 2026-11-25 报告 + 需求 §7.3 | 用户 2026-11-25 手测通过 | programmer | 完成（未提交） |
| T-20261125-12 | P1 | 设置页可选每个 AI 环节使用的 DSH 模型，默认跟随 DSH 默认 | `src/host/`（AI 调用）+ 设置页 UI + locale | 需求 §10.3（Q4-1 的实际答案） | 用户 2026-11-25 手测：自检通过，但**会话改走 Host 后丢工作区归属**（工作区重选、预填失效）→ 已改回浏览器建会话，Host 路径改为默认关闭的实验开关 `pdfdesk:ai-session-host=1` | programmer | 完成（用户 2026-11-26 16:47 手测「可以」；会话归属仍为已知限制，Host 通道默认关闭） |

## 当前队列（2026-11-26 · 导入导出统一）

> 用户 2026-11-26 12:20 起提出、12:35 拍板（DEC-0014）。**下一会话入口**：工作区根《PDF阅读插件-导入导出统一-交接-2026-11-26.md》（含现状盘点、风险、分期与验证命令）。本表由 programmer 落盘，范围与验收以 DEC-0014 与交接文档为准。

| ID | 优先级 | 执行单元 | 影响范围 | 验收来源 | 依赖/备注 | 承接 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-20261126-01 | P1 | 统一导入管线：`src/host/imports.js` + `POST /pdfdesk/imports`（magic bytes、拒快捷方式/假 PDF/0 字节、统一 `-2` 命名、同内容去重、统一报告、原子落盘） | 新模块 + 路由 + 测试 | DEC-0014 §1；用户"快捷方式不许进、减少重复文件" | 旧 `/import`、`/library-import` 保留一版做薄包装；新增 `imports-test.mjs` ≥15 条 | programmer | 完成（v1.5.0 已发布）（16:15 手测通过校验/去重/拒收；同日按用户确认追加「.lnk 定位目标再导入」，见 T-12 证据） |
| T-20261126-02 | P1 | 三个导入入口改走统一管线：封面「+」、书库「导入文件」、「导入书籍包」改为**上传 ZIP**（不再手输路径）；迁移包导入同样上传 | `client.js` + 路由 | DEC-0014 §1；用户"手输路径用户拿不到" | 依赖 T-01；报告统一展示 | programmer | 完成（v1.5.0 已发布）（16:15 手测「可以」+ 追加两项已补：打包记录🗑删除、书库卡片「进入书库」「📂打开目录」，见 T-13 证据） |
| T-20261126-03 | P2 | 文件布局标准 + 设置页只读「数据位置」 | 新 `docs/LAYOUT.md`；`client.js` 设置页；`bootstrap` 加 `dataDir` | DEC-0014 §2、§4；用户"路径要说明、不允许改" | 目录名不改；`bootstrap` 只增字段 | programmer | 完成（用户 2026-11-26 16:15 手测「可以」） |
| T-20261126-04 | P2 | 译文缓存迁入 `<书库>/.pdfdesk/translation/` + 一次性迁移 | `routes.js:958/1128/1186/1660/1684/1721`、`translate-job` 的 `cacheDir`、迁移脚本 | DEC-0014 §5（用户本轮已拍板） | 受保护存储键变更：先出计划再动手；迁移不删旧数据 | programmer | 完成（用户 2026-11-26 16:15 手测「可以」：已译章节叠加/双语正常、缓存已在书库内） |
| T-20261126-05 | P2 | 「导出书库包」（索引 + `.pdfdesk` + 可选产物，**不含 PDF**） | 新路由 + 设置页按钮 + 文档 | DEC-0014 §3（备份不含 PDF：版权） | 复用 `zip.js`/`backup.js` 打包与 manifest | programmer | 完成（用户 2026-11-26 16:15 手测「可以」：书库包/PDF 包内容与命名正确） |
| T-20261126-06 | P3 | 缓存与重复文件治理：`translate-jobs`/`backup`/`回收站` 保留期与一键清理、缓存占用显示、pdf.js 位图缓存上限设置 | `src/host/` + 设置页 | DEC-0014；用户"优化存储但不降质量" | 只删可重建物；永不自动删 PDF/标注/产物 | programmer | 完成（v1.5.0 已发布）（a/b/c/d 四项全部落码，2026-11-26 17:10，见 T-06b/c/d 证据） |
| T-20261126-06a | P2 | 存储占用面板：`GET /storage` 分区统计（译文缓存/遗留/任务/临时/中间目录/快照/打包/回收站）+ 「清理可重建缓存」「清空回收站」（均需确认） | 新 `src/host/storage.js`、`routes.js`、`client.js` | DEC-0014 §4（缓存占用只读展示）+ §7 R7（回收站一键清空）；用户 2026-11-26 15:47 确认先做本单元 | 不放 bootstrap，打开数据页按需统计；只删可重建物，回收站只在点击时清 | programmer | 完成（v1.5.0 已发布）（16:15 手测「可以看见」；同日按用户提问增补会话/字体/缓存三个分区 + 打包体积提示，见 T-14 证据） |
| T-20261126-06b | P2 | 保留期清理：回收站「N 天前」、译文缓存「N 天未用」、过期任务状态；**不自动删、每个动作都要确认** | `src/host/storage.js`、`routes.js`（`POST /storage/prune`）、`client.js` | DEC-0014 §7 R7；用户"优化存储但不降质量" | 只删可重建物；保留期 30/90/180 天可选并记忆 | programmer | 完成（v1.5.0 已发布）（2026-11-26 17:00 落码，见证据） |
| T-20261126-06c | P3 | 页面位图缓存上限做成设置项（2/3/5/8 页，默认 5），改完不用重开书 | `client.js` | 用户"运行内存做成设置项"（原 `PAGE_PRELOAD_LIMIT = 5`） | 只读 localStorage，不动渲染管线 | programmer | 完成（v1.5.0 已发布）（2026-11-26 16:58 落码，见证据） |
| T-20261126-06d | P3 | 同内容旧文件报告：按大小 + SHA-256 分组，只报告不删 | `src/host/storage.js`、`routes.js`（`GET /duplicates`）、`client.js` | DEC-0014 §7；用户"减少重复文件" | 先按大小分组再哈希；大文件流式哈希 | programmer | 完成（v1.5.0 已发布）（2026-11-26 17:05 落码，见证据） |
| T-20261126-07 | P2 | 开发版侧栏标识：配置 `label` → `bootstrap` → 侧栏/页面标题显示「PDF阅读开发版」 | `index.js`/`routes.js`（bootstrap）+ `client.js` + `pdfdev` 档配置 | 用户"左侧功能栏加一行 PDF阅读开发版" | 不能同 DSH 装两份（路由前缀冲突） | programmer | 已关闭（用户 2026-11-26 17:25 拍板取消：两个 DSH 档已能区分开发版与正式版，不值得为侧栏标签改导航注册与 profile 配置） |
| T-20261126-08 | P1 | 打包数据/导出书库包改为**后台任务**；设置 → 数据 新增「打包记录」（类型/时间/大小/下载/📂打开位置）；文件被移走或删除后记录自动消失；记录不随迁移包迁移 | 新 `src/host/exports.js`、`routes.js`、`client.js`、测试 | 用户 2026-11-26 14:45：打包数据报「Failed to fetch」+ 记录/打开位置/自动清理要求 | 旧同步 `create` 与同步导出保留做兼容；一次只允许一个打包任务 | programmer | 完成（v1.5.0 已发布）（16:15 手测「可以」；同日答「为什么这么大」并加体积提示行，见 T-14 证据） |
| T-20261126-09 | P1 | 导入向导：PDF 包必选、笔记包可选；逐本勾选要导入的书与数据；书库已有相同 PDF 的书自动勾选并置灰，并询问是否覆盖笔记；笔迹不做重复判断；大文件（64 MB）两次提醒后允许导入 | `src/host/book-wizard.js`、`routes.js`、`client.js`、测试 | 用户 2026-11-26 14:45 四条要求 + 15:10 回答 | 分组：子目录=拆分书，散装整本 PDF 也可单独选；笔记包兼容书库包与整机迁移包 | programmer | 完成（v1.5.0 已发布）（16:15 手测「可以」但判定界面太丑 → 退回执行；同日重做为专用大面板，见 T-20261126-09 证据 16:45） |
| T-20261126-10 | P2 | 导入时「选择 PDF 包 / 数据包」的 UI 优化（本轮按用户要求**不做**，仅记录） | `client.js` 向导面板 | 用户 2026-11-26 15:32 | 用户口述：入口与包选择界面需要优化；等下一轮细化 | programmer | 已关闭（并入 T-20261126-09 的界面重做：分步大面板 + 拖放 + 已选文件显示） |
| T-20261126-11 | P1 | 拆分工具页面异常、无法正常拆分（待复现） | `client.js` 的 `SplitDialog` / `SplitStart` | 用户 2026-11-26 15:32 报告 | 用户 15:52 描述：操作页面太小、什么都点不到 | programmer | 完成（v1.5.0 已发布）（16:15 退回 ⇒ 16:40 竖排大图 + 虚线剪刀 ⇒ 16:52 按用户要求改为**每行 4 页 + 竖向虚线剪刀**，见证据） |
| T-20261126-12 | P1 | 导入时 `.lnk` 解析目标路径并导入目标 PDF（.lnk 本身永不入库；网络路径/目标丢失/非 PDF 明确拒绝） | 新 `src/host/shortcut.js`、`imports.js`、`client.js`（accept + 文案） | 用户 2026-11-26 16:20「快捷方式不能直接定位其背后的文件吗」→ 选择「支持定位目标再导入」 | 只收本地目标；`.url/.desktop` 仍拒绝 | programmer | 完成（v1.5.0 已发布）（16:35 落码，见证据） |
| T-20261126-13 | P2 | 打包记录逐条删除；书库卡片新增「进入书库」与「📂 打开书库目录」 | `routes.js`（`/exports/delete`、`/library/reveal`）、`exports.js`、`client.js` | 用户 2026-11-26 16:20「需要增加删除这些包的按钮」「书库上增加一个进入书库按钮」（选项＝两个都要） | 删除只删 `backup/` 内插件命名的包 | programmer | 完成（v1.5.0 已发布）（16:40 落码，见证据） |
| T-20261126-14 | P3 | 迁移包体积可视化：存储面板增加 DSH 会话/字体/会话缓存三分区，数据页显示「体积主要来自会话」提示 | `src/host/storage.js`、`client.js` | 用户 2026-11-26 16:20「为什么这么大」 | 保留默认含会话（用户已选）；不改变打包内容 | programmer | 完成（v1.5.0 已发布）（16:45 落码，见证据） |
| T-20261126-15 | P1 | 删除书后目录/拆分列表仍出现「幽灵书」 | `routes.js`（`invalidateCatalog` + 7 处写操作）、`index-source.js`（校验索引条目） | 用户 2026-11-26 17:05 报告 | 已复现两个根因：目录缓存 2 秒未失效、索引死条目未校验 | programmer | 完成（v1.5.0 已发布）（17:15 落码，见证据） |
| T-20261126-16 | P2 | 拆分方案按书记忆，误关/崩溃后可恢复 | `client.js` 的 `SplitDialog` | 用户 2026-11-26 17:05「最好能记住我们对一本书的拆分方式」 | localStorage `pdfdesk:split-cuts:<书id>`；只恢复小于总页数的拆点 | programmer | 完成（v1.5.0 已发布）（17:15 落码，见证据） |
| T-20261126-17 | P3 | 封面缩略图加 ETag + 短缓存（原来 `no-store`，书架每次渲染都重下） | `src/host/http.js`、`routes.js` 的 `/cover` | 用户 2026-11-26 17:19「只要缩略图不会重复下载问题就不大——可以记一下」 | 只在 `/cover` 生效，其它响应仍是 `no-store` | programmer | 完成（17:30 落码；`cover-cache-test` 9 条全过） |
| T-20261126-18 | P2 | 删除旧导入接口 `/import`、`/library-import`（兼容期结束） | `routes.js`、删 `src/host/book-import.js`、测试迁移 | 用户 2026-11-26 17:29「现在就是大更新了，可以试着删」 | 客户端已全部走 `/imports`；测试改用新路由并断言旧路由 404 | programmer | 完成（v1.5.0 已发布）（17:40 落码；两条旧路由已 404，见证据） |
| T-20261126-19 | P1 | 导入改为流式解包（不再整包读进内存） | `src/host/zip.js`、`imports.js`、`book-wizard.js` | 用户 2026-11-26 17:29「这个能增强稳定性，建议现在修」 | 中央目录 + 逐条流式；CRC/大小校验；纯函数签名不变 | programmer | 完成（v1.5.0 已发布）（18:05 落码；45 条断言 + 36 个回归脚本全过） |
| T-20261126-20 | P1 | 两种 AI 模式：日常（简短、像网页端）/ 高质（可长篇推导），设置里切换；两种都读整章 | `client.js`（种子文案、设置页） | 用户 2026-11-26 17:35 + 17:44 + 18:00 三次拍板 | 只影响新会话；思考深度由 DSH 模型决定，插件不覆盖 | programmer | 完成（v1.5.0 已发布）（17:52 落码、18:00 更正语义，见证据） |
| T-20261126-21 | P1 | 笔/橡皮光标对齐真正的笔尖/橡皮头 | `client.js` 的 `.md-canvas-capture` 光标规则 | 用户 2026-11-26 17:35「笔的笔尖位置，橡皮的橡皮头位置」 | CSS 自定义 SVG 光标 + 热点；保留 crosshair/cell 回退 | programmer | 完成（v1.5.0 已发布）（18:20 落码；`pen-cursor-test` 8 条全过） |
| T-20261126-22 | P1 | 迁移包打包与读取流式化（`backup.js` 仍整包内存） | `src/host/zip.js`、`backup.js` | 用户 2026-11-26 18:15「都改吧」 | 复用已完成的流式 ZIP API；包格式与 manifest 不变 | programmer | 完成（v1.5.0 已发布）（18:40 落码；`backup-stream-test` 37 条 + 37 个回归脚本全过） |


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
- 验证：`node --check client.js` exit 0；`typst_runtime.py` `ast.parse` 通过；`resolveTypeset()` 输出 `typst %LOCALAPPDATA%\dsh-pdf-workbench\typst\typst.exe`。未提交。
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

**T-20261125-05 证据（2026-11-26 10:45，上方工具条 + 右栏疑问按钮）**

- 阅读器副栏（`md-reader-subbar`）新增绘制工具组：手、笔、橡皮、疑问、文本框、撤销、重做；图标与竖排/右栏同源，按下态复用 `annotTool`，撤销/重做复用 `undoEither`/`redoEither` 与 `undoAvailable`/`redoAvailable`（DEC-0003，单一动作源）。
- 取值：Q5-1「书本」**经用户 2026-11-26 确认为笔误，已从副栏移除**；Q5-2 = 撤销/重做；Q5-4 放副栏；Q5-5 沿用 `md-btn-small` 尺寸，手测后再定是否放大。
- 右栏预览顶部 `.md-side-bar` 在文本框之后新增疑问按钮（`toggleTool('question')`），与竖排疑问入口同一状态。
- 验证：`node --check client.js` 0；`check-keys` 0；`host-test` 0；新增 `.dsh-scratch/t05-toolbar-test.mjs`（20 条接线断言：副栏 8 个入口、图标与竖排逐一对齐、右栏疑问入口、drawbar 布局）exit 0。
- 待手测：副栏按钮逐个有按下态且与竖排同动作；右栏疑问可落框、刷新/切页后仍在、可撤销/删除；竖排工具条与快捷键无回归。

**T-20261125-08 证据（2026-11-26 10:55，成本基线）**

- **启动体积**：`client.js` 1,080,918 B（`package.json` 的 `dsh.client.immediately = true`，每次 DSH 启动都要加载解析）；Host `src/host/` 37 文件 / 355,716 B，`/pdfdesk/*` 路由 85 条；`vendor/katex` 273 KB 仅叠加层首个公式时加载。
- **启动耗时**：`index.js` 新增 `startup.json` 记录（每次 apply 落一条 `{at, applyMs, engine}`，保留 30 条）；数据在 `~/.dsh/pdfdesk/startup.json`，需要用户重启 3 次启用 + 3 次禁用才能给出中位数，目前**尚无数据**。
- **上下文 token**：`~/.dsh/pdfdesk/pressure.json` 实测，新建章节会话最小 **11,521** tokens、常见 **20k–40k**（window 1,000,000–1,048,576）；`sessionSeedText` 本身只有几百字符，成本主体是整章文本前缀（基础会话）。
- **其它 API**：翻译/会话已走 DSH 已配置模型（T-12 S3）；错误路径有测试覆盖（`translate-ai-route-test` 的 422/503/502、无图模型 422）。
- 验证：`node --check index.js` 0；`host-test` 0。
- 待拍板：Q4-2 启动目标（建议 apply ≤ 300 ms）、Q4-3 首条 token 上限（建议 ≤ 15,000，或改为「整章前缀按需注入」）、Q4-4 关闭方式（建议整插件禁用、数据保留）。
- 2026-11-26 11:25 补测「其它 API」可读错误：`ai-translate-wiring-test` 新增 3 条断言——provider 失败返回 502、消息包含模型名、保留上游原因；全部通过，实际消息为「翻译调用失败（opencode-go / deepseek-v4.1-flash）：401 unauthorized」，满足 §4.3-1 的「可读 + 指明功能与供应商/模型」。
- 2026-11-26 11:35 关闭安全核验（只读，未实际禁用）：用户数据全部在插件**外部**——`~/.dsh/pdfdesk/`（8 个状态文件 + translation/jobs，35 文件 / 22.29 MB）与书库的 `.pdfdesk/`（`annotations/`、`cache/`、`questions/`，19 文件 / 85,311 B）；插件目录内没有任何 `.pdfdesk`/`libraries.json`/`state.json`（只有 `package.json`、`package-lock.json`、`screenshots.json`）。profile 里是 `link:C:/…/math-desk` 依赖，禁用=删依赖项，不会碰外部目录 → 重新启用后 `libraries.json`/`state.json`/`.pdfdesk` 原样可读。§4.3-4 的「关闭状态重启后保持」属 DSH 插件管理行为，插件侧无需改动。

**T-20261125-16 证据（2026-11-26 11:00，叠加层复制入口）**

- 叠加工具栏新增「复制译文」：按 `box[1]` 纵向排序把本页块的 `md` 拼成文本写入剪贴板（`navigator.clipboard`，不可用时 `document.execCommand('copy')` 降级）；空页提示「这一页没有可框的文本块」。
- 复制的是文本层正在画的那份块，不重新解析 PDF；**不改任何指针手势**，因此与框选/画笔/疑问不冲突。
- 验证：`node --check client.js` 0；`check-keys` 0；新增 `.dsh-scratch/c-copy-test.mjs`（14 条断言）exit 0。
- 未做：叠加层内划选/选中复制（会与框选手势抢指针，待用户拍板手势后再实现）。
- **已知坏点（2026-11-26 14:10，用户手测）**：「复制译文」在部分页面仍提示「这一页没有可框的文本块」。`copyPageTranslation` 取的是 `GET /pdfdesk/blocks` 返回的 `overlayTextBlocks`，而「显示」与「复制」可能不是同一来源：无 `layout.json` 的页走位图回退仍能显示文字，但块上的 `md` 为空 → 复制为空。修法：复制在块拼不出文本时回退到页级译文（让 `/blocks` 在无 layout 时也返回 `md`，或新增只读 `pageMd`），不要依赖 layout。详见 `PDF阅读插件-v1.5-后续-交接-2026-11-26.md` §3。→ **2026-11-26 11:40 按此落码，11:45 用户手测判定「叠加层显示错乱」；11:50 整组按用户要求撤下，见下方结论。**
- **待做（2026-11-26 用户追加）**：双语模式也要支持复制。双语右栏是 pdf.js 渲染的 `_translated.pdf`，没有 DOM 文本，需在双语列头加「复制译文」按钮（或复用副栏按钮），数据源同样走页级译文缓存，公式按设置定界符输出。→ **随整组一起取消（2026-11-26 11:50）。**

**T-20261125-16 结论（2026-11-26 11:50，复制 / 划选整组撤下）**

- 用户手测（重启后）：叠加层**显示错乱**，判定「完全坏掉了」，指令「取消这个复制的功能」；确认范围 = **整组都删**（两个复制入口 + Alt 划选/「选字」+ 设置里的「公式复制格式」），叠加回到位图显示。
- 根因（说明为什么这次一定会看见）：`/pdfdesk/blocks` 以前只发 PDF 原文块 + 版面几何，客户端按 `md` 非空过滤，`overlayTextReady` 永远为 false → v1.5 的 DOM 文本层**从未真正绘出**，叠加一直走位图层（这层是用户已经认可的显示）。补发 `md` 后文本层第一次真正生效，真机上的字体/行距/位置与位图不一致，于是「显示错乱」。**结论：复制功能的前提（让客户端拿到每块译文）与当前叠加显示方案冲突，先不修显示，直接撤功能。**
- 已撤（`git diff` 只留 D 的 Typst 与上一波未提交功能）：
  - `src/host/routes.js` `/pdfdesk/blocks`：恢复只发 `{ ok, blocks, page }`，不再读 `blocks.json` / `page-NNN.md`，不返回 `pageMd`。
  - `client.js`：删 `copyPageTranslation` / `copyDualTranslation` / `translationTextOf` / `writeClipboard` / `selectionLatex` / `mathForCopy` / `readCopyMathFormat` / `writeCopyMathFormat` / `COPY_MATH_FORMAT`；删叠加副栏「复制译文」「选字」按钮与 Alt 划选提示、双语列头「复制译文」按钮与结果行、`altSelect`/`selectMode` 状态与 Alt 监听、`maskDown` 的 Alt 拦截、`OverlayTextLayer` 的 `selectable`/`data-select`/`onCopy`/`data-latex`、`.md-overlay-text[data-select]` 两条 CSS；删 zh/en 的 `copyTranslation*`、`overlaySelect*`、`translatePrefsMath*` 共 9 对文案键与设置里的公式格式下拉。
  - 保留：v1.5 的文本层组件与 fit/overflow 代码原样保留（休眠，`md` 不到即不绘出）；`overlayBlocksEmpty` 文案仍给「框住本页块」用。
- 测试处置：删掉只测已撤功能的 `alt-select-test.mjs`、`c-copy-test.mjs`、`copy-translation-test.mjs`（`peek-copy.mjs` 临时诊断一并删）；新增 `.dsh-scratch/copy-removed-test.mjs`（18 条守卫：路由不发 md/pageMd、两个入口与文案不在、划选管线不在、文本层仍按 md 过滤保持休眠）。
- 验证（exit 0）：`copy-removed-test.mjs` 18 条；`node --check client.js / index.js / src/host/*.js`；`check-keys`、`check-deps`、`host-test`、`translate-ai-route-test`、`overlay-text-layer-test`、`t05-toolbar-test`、`fit-cap-test`、`translate-prefs-test`、`split-ui-test`、`env-guide-test`、`dual-overlay-test`。
- 未提交；需要用户重启手测：叠加应回到「位图 + 框」的原样显示，且界面里不再有复制/选字入口。
- 遗留：若要重做复制，必须先解决「文本层与位图的显示一致性」，否则会重演这次错乱；届时先删 `copy-removed-test.mjs`。

**T-20261125-17 证据（2026-11-26 11:05，两引擎排版差异量化）**

- `overlay-engines-compare`（真实 85 块）：字号 |Δ| 最大 **1.20pt**、均值 **0.13pt**；行数差 **−4..+2**；Typst 多 **6 块** overflow；耗时 **70.68s vs 7.94s（8.9×）**；逐页基线最大偏差 LaTeX ≤0.67pt、Typst ≤0.58pt。
- 最大差异样本：`b-0005-02`（9.0pt/11 行 vs 10.0pt/7 行）、`b-0004-13`（10.5/14 vs 9.7/10）、`b-0004-09`（9.9/10 vs 9.8/7）——共同点是「LaTeX 行数明显多于 Typst」。
- 判断：字号不一致的主因是两端断行不同触发的自适应缩放，不在客户端；下一步先确认 LaTeX 的 `lines` 是否把测量标记行计入（若是，差异被高估），再决定调 Typst 断行/行距还是调上限。单开调优单元，不在 D 收尾里硬调。
- 2026-11-26 11:15 归因（新增 `.dsh-scratch/inspect-block.py`、`inspect-page.py`）：`b-0005-02` 两引擎的放置 `box` **完全相同**（宽 375.4pt、高 0.1308），但 LaTeX 测到 11 行 9.0pt 且 `dst` 越出 box（dstW 0.8554 > box 右缘、dstH 0.1335 > box 高），Typst 测到 7 行 10.0pt 且 `dst` 落在 box 内（0.8282 / 0.0683）。同一页其余块行数一致（1/5/1/5/6），只有这一块差 4 行 —— 说明差异集中在「长段 + 行内公式多」的块，是**断行策略/行内公式宽度**不同，不是测量标记行（+4 行不可能来自 1 行标记）。
- 2026-11-26 11:45 再归因：两引擎的 `w_pt` 计算**逐字相同**（`room_right` → `max(40, min((right-left)*页宽, 页宽-x-4))`）。该块译文 256 字符，375pt 宽、9pt CJK 本应约 41 字/行（≈7 行），LaTeX 却排了 11 行 ≈ 23 字/行 —— 等于段内实际字形约 16pt，说明 LaTeX 的 `\fontsize` 没有作用到 CJK 字体（混排字号不一致），这才是 "C 时代看起来对不齐/字号不一" 的来源；Typst 的 7 行才是忠实结果。→ 结论修正：**优先做方案 B**（给 Typst 的 6 个 overflow 块加「最多缩 6% + 溢出标记」，保证整页视觉一致），LaTeX 侧的混排字号问题已随 D 移除，不再修。
- 2026-11-26 12:20 实施方案 B（客户端自适应）：单块缩到 **0.94** 即停（`current > 0.945` 守卫），停止后保留字号并标 `data-overflow`（红虚线）；标记同时来自排版器的 `block.overflow` 与客户端上限 `overflow?.has?.(id)`，用 `overflowSig` 去重避免重复渲染。仍在收缩前借用下方空隙，尽量不触发上限。验证：`node --check client.js` 0、`overlay-text-layer-test` 0、新增 `.dsh-scratch/fit-cap-test.mjs`（8 条断言）0。可回退：只改 `client.js` 的 fit 段与一处渲染属性。

**T-20261125-10 预研（2026-11-26 12:00，只读）**

- 依赖：本机 **PyMuPDF 1.20.2** 已在（插件本就依赖），`pypdf` 未装 —— 拆分工具可以零新增依赖。
- 体量两条路线：
  - **A 复用 pdf.js 缩略图网格**：`pdf.min.mjs` 458,705 B + worker 1,265,413 B ≈ **1.7 MB**，交互最好（缩略图选页、点页间加拆点），符合需求「>1 MB → 独立仓库、不集成」；
  - **B PyMuPDF 预生成缩略图**：只输出缩略图 + 一个轻 HTML，**<100 KB**，但缩放/重排交互弱。
- 建议：独立仓 `pdf-split`，单个 `split.py`（outline 按章切 + 页码范围命名 `<书id>_cNN_<章名>_p起-止.pdf`，输出到 `分片\<书id>\`）+ 单个 HTML；默认 A，B 作为极简变体。
- 待用户定：仓库名/许可、只要「书签按章切」还是也要「缩略图手选」（Q2 各项）。

**「Alt+拖选 + 复制公式格式」证据（2026-11-26 13:20，用户拍板）**

- 用户拍板：支持 **Alt+拖选**，但必须有**明显提示**；复制数学公式必须是 **LaTeX 格式**，并让用户自选 **`$…$`/`$$…$$`** 或 **`\(…\)`/`\[…\]`**。
- 实现：① 叠加层在按住 Alt 时切到可选文本（`data-select="true"` → `pointer-events:auto; user-select:text`），同时 `maskDown` 对 `altKey` 直接返回，不画框；② 公式节点带 `data-latex`，`copy` 事件用选区克隆 + LaTeX 重建写剪贴板（否则复制到的是 `x2` 这种渲染字形）；③ 复制格式偏好 `pdfdesk:copy-math-format`（默认 `$`，可选 `\(`），「复制译文」按钮与 Alt+Ctrl+C 都遵守；④ 副栏常驻提示「Alt+拖选 可选中译文，Ctrl+C 复制（公式保持 LaTeX）」；⑤ 设置 → 数据 → 翻译偏好 增加「复制的公式格式」下拉。
- 验证：`node --check client.js` 0、`check-keys` 0、`.dsh-scratch/alt-select-test.mjs` **16 条断言全过**（含 7 条纯函数行为断言：`$` 原样、`\(` 转换、先块级后行内、纯文本不动）。
- 待手测：Alt+拖选出现蓝色选区；Ctrl+C 粘贴到笔记里公式是 LaTeX；切到 `\(` 后两种复制都变 `\(…\)`。

**「翻译减少重复操作」证据（2026-11-26 12:55，用户新指令）**

- 用户原话：「翻译要尽可能减少用户的重复操作」。
- 三处减少：① 成本/附件确认弹窗里可勾「以后不再询问」，勾后每章直接开跑（**覆盖已有译文的确认保留**，因为不可逆）；② 目标语言存本机（`pdfdesk:translate-target`），重开阅读器不再回到 `zh`；③ 翻译完成后**自动打开叠加**（`pdfdesk:translate-auto-overlay`，默认开，可在 设置 → 数据 → 翻译偏好 关掉）。
- 设置新增「翻译偏好」区块（两个开关）；弹窗新增「以后不再询问」；zh/en 各 6 个文案键。
- 验证：`node --check client.js` 0、`check-keys` 0、新增 `.dsh-scratch/translate-prefs-test.mjs`（12 条断言）0。
- 待手测：勾「以后不再询问」→ 下一章点翻译应直接开始；翻译完应自动进叠加；设置里关掉自动叠加后不再自动打开。

**T-20261125-10 证据（2026-11-26 12:40，拆分器核心）**

- 用户 12:30 定范围：**页间剪刀手选 + 自定义页码范围**、只要普通 PDF、按插件命名写进 `分片/`、支持多文件拆分、**先不公开（本地脚本）**、「只做对我们插件有帮助的功能」。
- 新增 `tools/split_pdf.py`：`--ranges "1-10,11-17"` / `--breaks "10,17"` / `--bookmarks` 三种输入，输出 `<id>_cNN_<标题>_p起-止.pdf`（标题缺省 `未命名`，非法字符清理）到指定目录，并写 `拆分清单.json`；越界、缺模式、无书签都明确报错，不猜。
- 验证：`.dsh-scratch/split-pdf-test.py` **10 条断言全过**（真实 3 页章节：ranges 出 2 份、breaks 出 3 份、命名合规、清单完整、越界/无模式拒绝、无书签提示）。
- 待做：缩略图 + 页间剪刀 UI（复用插件已 vendor 的 pdf.js，**不新增体积**）、多选区一次导出、接「拆分工具」把 `pdfsplit` 复制进书库 `工具/`。
- 2026-11-26 13:40 UI 已落码：整本书书页右上角「拆分为章节」→ `SplitDialog`（`md-split` 网格）：缩略图按 `IntersectionObserver` 懒渲染（124 页不一次性画）、页间剪刀点一下加拆点/再点取消、右侧实时显示范围与输出文件名预览、`开始拆分` 走 `POST /pdfdesk/split`；Host 侧解析整本 PDF → `runTool('split_pdf.py', …)` 写进 `分片/<书id>/`，完成后自动 `reload()` 书库。验证：`node --check` 三处 0、`check-keys` 0、`host-test` 0、新增 `.dsh-scratch/split-ui-test.mjs`（17 条接线断言）0；`split-pdf-test.py` 10 条仍全过。

**「环境引导正常化 + 开发者模式收口」证据（2026-11-26 11:55）**

- 用户指令：① 调试期「每次启动都弹环境清单」的做法取消，改成正常要求；② 开发者模式相关的东西不许随发布包上传，上传前必须检查。
- 改动（`client.js`）：删 `ENV_GUIDE_ALWAYS`（原值 `true`，导致每次启动都弹）；正常门控改为 **缺项 且 没点过「不再提示」** 才自动出现；开发者模式（`pdfdesk:dev-mode`，仅本机）仍可重放新用户清单（忽略缺项与确认状态）。
- **设置 → 环境** 新增「重新打开『开始前检查』」入口 + 说明（`guideForced` 强制打开，关闭后恢复常规门控）——这补上了交接 §4.4 的待办。
- 引导脚注文案从「调试期每次启动都会显示；正式版只弹一次」改为「缺项时自动出现；点过『不再提示』后，可在 设置 → 环境 重新打开」。
- 开发者模式收口为 `const DEV_MODE_SUPPORTED = true`（状态初始化与 `Ctrl+Shift+D` 监听都由它门控）；徽标与快捷键监听用 `// pdfdesk:dev-only-start` … `// pdfdesk:dev-only-end` 标出，供打包时删除。
- **发布闸门（2026-11-26 12:15 用户拍板后落码）**：新增 `scripts/prepare-release-client.mjs`——把 `DEV_MODE_SUPPORTED` 改成 `false`、删掉所有 `pdfdesk:dev-only-*` 块、拒绝 `ENV_GUIDE_ALWAYS` 回归、改写后 `node --check`；`build-dist.ps1` 在拷贝完成后调用它，失败即中止；`docs/ci.md` §3 发布前清单加一条。
- 验证（exit 0）：`env-guide-test.mjs` 25 条（含「没有 ENV_GUIDE_ALWAYS」「缺项才弹」「不再提示生效」「设置可重开」「DEV_MODE_SUPPORTED 可编译关闭」）；新增 `.dsh-scratch/release-guard-test.mjs` 13 条（正常改写、徽标/快捷键被删、状态编译成常量、相关文案不进包、清理后可解析、`ENV_GUIDE_ALWAYS` 回归拒绝、标记不成对拒绝、开关缺失拒绝、重复清理幂等）；`node --check client.js` 0；`check-keys` 0；`check-deps` 0；**真跑了一次 `build-dist.ps1`**（1.4.1）：guard 输出「developer mode removed」，泄漏检查通过，zip 6,038,971 B；解包核对分发版 `client.js` = `DEV_MODE_SUPPORTED = false`、无 `pdfdesk:dev-only` 标记、无 `devModeBadge` / `devModeHint` / `Ctrl+Shift+D` / `pdfdesk:dev-mode` / `setDevMode`、`devMode` 已成常量 `false`、`node --check` 0，仓库源码仍保留开发者模式；核对后已把测试产物删除并还原原 `dist\`。
- 顺带修：`docs/todo.md` 两处本机绝对路径（会触发 `build-dist.ps1` 的泄漏检查）。
- 使用方式（拆实例，不拆版本）：桌面版留市场版；开发用独立档 `dsh web --profile pdfdev` + `dsh plugin --profile pdfdev add link:<repo>`，插件数据用 `cordis.patch.yml` 的 `dataDir`/`libraryDir` 指到测试目录。操作手册与启动脚本在工作区根：`PDF阅读插件-开发实例与发布闸门-2026-11-26.md`、`dsh-pdfdev.ps1`（不放进仓库，含本机路径）。

**「每次打开都提示环境」修复证据（2026-11-26 13:55）**

- 用户报告：环境引导「开始前检查」每次打开都出现，要求先修好。
- 复现/定位（本机只读核对）：Chromium localStorage 的 origin 是 `dsh-app://app`（Desktop 壳的稳定 origin，**不是** `http://127.0.0.1:<随机端口>`），所以偏好本身能跨启动保留；`pdfdesk:env-onboarded` 已存为 `1`（用户点过「不再提示」）。正常门控下不会再弹，唯一绕过它的是**开发者模式**：旧代码 `if (!guideForced && !devMode && ...)` 让开发者模式每次启动都重放清单；本机 leveldb 里存在 `pdfdesk:dev-mode` 键（至少切换过一次），结合「点过不再提示仍每次弹」判定该开关仍开着。
- 修复（`client.js`）：① 开发者模式不再在每次启动重放清单；改成**切换开启时重放一次**（`devReplay` state，不持久化，关掉清单即清除）。② 「知道了」现在也算确认：把当前缺项类别记进 `pdfdesk:env-guide-seen`，同一类缺项下次不再自动弹；装了东西（缺项变少）保持安静，出现**新的**缺项类别才再提醒一次。③ 「不再提示」仍长期静默；`设置 → 环境 → 重新打开『开始前检查』` 仍可随时手动重放。徽标提示与清单脚注同步。
- 验证（exit 0）：`node --check client.js`；`env-guide-test.mjs` 改断言（门控用 `devReplay`、`env-guide-seen` 规则、`知道了` 写 seen、启动不受开发者模式影响）；`release-guard-test.mjs` 仍通过（dev-only 块可整体删除、`DEV_MODE_SUPPORTED` 可编译成 false）；`check-keys`、`check-deps`、`split-entries-test`、`host-test` 全过。
- 未覆盖：真机视觉（徽标/清单出现时机）需重启手测；用户当前那份 localStorage 里 `pdfdesk:env-onboarded` 已是 1，重启后不应再出现清单；若想彻底关掉开发者模式按 `Ctrl+Shift+D`。旧数据兼容：`env-guide-seen` 缺失时按空数组处理，不影响已有 `env-onboarded`。
- → 2026-11-26 14:05 用户拍板：开发者模式只能重放清单、模拟不了新用户，**整体删除**；见下条证据。

**「删除开发者模式」证据（2026-11-26 14:05）**

- 用户判断：开发者模式只能换出「开始前检查」提示，模拟不了空书库/新用户环境，"可以删掉了，我还是跑虚拟机吧"。
- 删除（`client.js`）：`DEV_MODE_SUPPORTED` 常量、`devMode`/`devReplay` 状态、`Ctrl+Shift+D` 监听、右下角徽标、`devModeBadge`/`devModeHint` 中英文案、`.md-dev-badge` 样式、`pdfdesk:dev-mode` 键；环境清单门控回到「缺项类别 + 已确认 + 不再提示」，不再有开发调试旁路。
- 发布闸门（`scripts/prepare-release-client.mjs`）：保留 dev-only 标记块删除与 `ENV_GUIDE_ALWAYS` 拒绝，新增拒绝 `DEV_MODE_SUPPORTED` / `Ctrl+Shift+D` / `pdfdesk:dev-mode` / `devModeBadge` / `devModeHint` 残留，改写后 `node --check`；`docs/ci.md` 发布前检查同步。
- 验证（exit 0）：`node --check client.js`、`node --check scripts/prepare-release-client.mjs`；`env-guide-test.mjs`（含「developer mode removed」断言）；`release-guard-test.mjs` 11 条（正常清理、解析、无 dev-only/无开发者模式残留、`ENV_GUIDE_ALWAYS` 拒绝、标记不成对拒绝、字样残留拒绝、dev-only 块被删、幂等）；`check-keys`、`check-deps`、`host-test`。
- 兼容性：旧 localStorage 里残留的 `pdfdesk:dev-mode` 不再被任何代码读取，无害；`env-onboarded` / `env-guide-seen` 不受影响。

**T-20261126-03 证据（2026-11-26 14:20，布局标准 + 只读数据位置）**

- 新增 `docs/LAYOUT.md`：PDF 区（`分片/`、`整本/`）与数据区（`产物/`、`封面/`、`.pdfdesk/`、`回收站/`、`工具/`、`索引.json`）的归属、谁写谁读、可删性；全局 `%DSH_HOME%/pdfdesk/` 各文件用途与可删性；写明**目录名不改**、备份/导出不含 PDF、只删可重建项。目录名一个没动。
- Host：`GET /pdfdesk/bootstrap` 两个分支（有书库/无书库）都新增只读字段 `dataDir`，只增不改，客户端不提交它。
- 客户端：`catalog` 读取 `data.dataDir`；`SettingsDialog` 新增 `libraryDir` / `dataDir` 两个 props；设置 → 数据 顶部新增只读区块「数据位置」（书库目录、插件数据目录 + 说明「由 profile 配置决定，不能在设置里修改」+ PDF 区/数据区一句话）；中英文案各 6 键。
- 缓存占用**不在本单元**：todo 表把「缓存占用显示」列在 T-06，且 bootstrap 里递归统计大缓存会拖慢每次加载；T-06 再做（可在需要时按需计算）。
- 验证（exit 0）：新增 `.dsh-scratch/layout-test.mjs` **26 条**（文档存在与目录登记、无书库时 bootstrap 仍返回 `dataDir`、有书库时 `dataDir`+`libraryDir`、客户端读取与传参、只读区块存在、没有写回入口、6 个文案键中英各一份、Host 两分支都发字段）；回归 `check-keys`、`check-deps`、`env-guide-test`、`release-guard-test`、`split-entries-test`、`split-ui-test`、`host-test`、`imports-test`、`book-import-test`、`routes-e2e-test`；`node --check` 全部源文件。
- 未覆盖：设置页视觉与长路径换行需真机手测；路径只读展示不阻止用户去资源管理器改目录（文档已写清后果）。

**T-20261126-04 证据（2026-11-26 14:30，译文缓存迁入书库）**

- 用户 2026-11-26 14:05 确认按计划做 T-04（DEC-0014 §5）。
- 新增 `src/host/translation-cache.js`：`translationRoot(library)` / `chapterCacheDir(library, book, code)`（`<库>/.pdfdesk/translation/<书id>/<章>`）、`legacyTranslationRoot(dataDir)`，以及 `migrateTranslationCache({ dataDir, libraries })`：
  - 只搬**归属唯一**的书：书 id 只在恰好一个已登记书库的 `分片/<id>/` 或 `整本/<id>.pdf` 中出现；
  - 一个书库都没有、或多个书库都有同名书 → **不猜**，旧缓存原地保留并计入 `skipped`；
  - 跨卷（插件数据在 C:、书库在 D:）`rename` 失败时复制 + 校验大小后删源；失败保留旧数据并告警；
  - 目标已存在同名文件：大小相同视为重复、删旧；大小不同保留两边、告警（不覆盖）；
  - 写 `<书book>/.migrated-from-global` 标记；旧目录清空后删除；重复运行无副作用（幂等）。
- `index.js`：启动时创建迁移 Promise（无登记书库时用 profile 的 fallback 书库），`ctx.logger` 记录告警，并把 `translationMigration` 注入路由；迁移失败只告警、不阻塞插件。
- `routes.js`：`/blocks`、`/translate-chapter`、三个 rebuild（overlay/realign/translated）改用 `chapterCacheDir(...)`；六条涉及缓存的路由在分发前 `await ensureTranslationCache()`（等待迁移，异常吞掉不影响路由）；「清除翻译缓存」改为清**每个已登记书库**的 `.pdfdesk/translation` + 旧全局目录 + `translate-jobs`（仍在跑的 job 跳过）。
- `backup.js`：书库数据改为按条目复制并**排除 `.pdfdesk/translation`**——迁移包继续不含译文缓存（手稿 §3.1 的承诺；缓存可重建、跨库变大后也不该进包）。
- `docs/LAYOUT.md`：登记 `<库>/.pdfdesk/translation/<书id>/<章>/`，并把全局 `translation/` 标为「已迁入书库，仅剩无法判断归属的旧数据」。
- 验证（exit 0）：新增 `.dsh-scratch/translation-cache-test.mjs` **29 条**（路径助手；唯一归属搬迁 + 标记 + 旧目录删除；同名书跳过且两边都不建新缓存；幂等；删掉另一个书库后重跑才搬；路由无旧全局路径、5 个读写点用新助手、6 条路由等待迁移；`index.js` 注入；清除缓存清各库且先等迁移；迁移包保留标注、排除译文缓存）；`translate-ai-route-test.mjs` 夹具改到 `<库>/.pdfdesk/translation`（`libraries.list()` 返回登记项）；回归 `check-keys`、`check-deps`、`layout-test`、`env-guide-test`、`release-guard-test`、`host-test`、`imports-test`、`book-import-test`、`split-import-test`、`split-entries-test`、`split-ui-test`、`backup-test`、`backup-create-test`、`backup-import-test`、`translate-ai-route-test`；`node --check` 全部源文件。
- 未覆盖 / 需手测：**真实跨卷迁移**（用户 `dataDir` 在 C:、书库在 D:，重启后 `Serre表示论` 的 18 个缓存文件会走 copy+校验+删源，测试机同卷只覆盖 rename 分支）；旧译文在迁移后能否继续叠加/重建（需打开已译章节看叠加与双语）；迁移期间不要开新翻译（启动瞬间完成，窗口极小）。
- 兼容性：旧全局 `translation/` 只保留无法判断归属的内容；插件不再从旧路径读（不做回退，避免再次串缓存）。

**T-20261126-05 证据（2026-11-26 14:40，导出书库包）**

- 新增 `src/host/library-export.js`：把 `索引.json` + `.pdfdesk/`（**排除 `translation/`**）+ 可选 `产物/` 复制到临时目录，`packDirectory` 打包到 `%DSH_HOME%/pdfdesk/backup/library-export-<UTC时间>.zip`；manifest 写 `format: 'pdfdesk-library-export'`（故意不用迁移包的 `1`，避免被「导入迁移包」误认）、`kind`、`note`（写明不含 PDF）、`library`、`included: { index, libraryData, artifacts, pdf: false }` 与逐文件 sha256。
- `backup.js`：`buildManifest`/`packDirectory` 增加可选 `format` 透传（默认仍是迁移包格式 `1`，旧调用不变）。
- `routes.js`：新增 `POST /pdfdesk/library-export`（same-origin + JSON：`{ includeArtifacts }`，无书库 409，失败 500）；`/pdfdesk/backup/file` 的合法文件名放宽为 `dsh-workbench-backup-*.zip | library-export-*.zip`（仍禁止路径穿越）。
- `client.js`：设置 → 数据 新增「导出书库包」区块：说明（不含 PDF，要 PDF 自己压缩 `分片/`、`整本/`）、复选框「包含产物」、开始打包、生成后下载链接与大小；中英各 7 个键。
- `docs/LAYOUT.md`：把「导出书库包」从待做改为已实现，并写清内容与 manifest。
- 验证（exit 0）：新增 `.dsh-scratch/library-export-test.mjs` **25 条**（200、文件名、下载地址、报告 `pdf:false`；ZIP 内有 `索引.json`/标注、无 `translation/`、无 `分片/`、无 `整本/`、包内无任何 `.pdf`；manifest kind/format/note/文件清单/书库；`includeArtifacts` 时产物进包；下载内容一致、非法名 400；迁移包下载仍可用且可 `readBackup`；无书库 409）；回归 `check-keys`、`check-deps`、`layout-test`、`translation-cache-test`、`env-guide-test`、`release-guard-test`、`host-test`、`imports-test`、`book-import-test`、`split-import-test`、`backup-test`、`backup-create-test`、`backup-import-test`、`translate-ai-route-test`、`split-entries-test`、`split-ui-test`；`node --check` 全部源文件。
- 未覆盖 / 需手测：设置页按钮与下载视觉；真实库（索引 + 标注 + 产物）打包体积与耗时；「包含产物」时大 PDF 的打包内存（`packDirectory` 走 Python zip 优先，无 Python 时 Node 全内存）；导出的包在另一台机器手工解压后的合并（目前没有「导入书库包」入口，属后续单元）。
- 兼容性：迁移包格式与下载路径不变；新增文件名前缀只放宽了下载校验。

**T-20261126-08 证据（2026-11-26 15:05，后台打包 + 打包记录 + 打开位置）**

- 用户报告：点「打包数据」弹「迁移操作失败 (Failed to fetch)」。定位：本机真数据打包需要 7.5s / 126 MB（会话 121 MB 占大头），而客户端通用请求超时是 12s；长请求一旦被传输层掐断，前端只看到 `Failed to fetch`。结论：把打包从同步请求改成后台任务，而不是继续调超时。
- 新增 `src/host/exports.js`：`listExports(dataDir)` 直接扫 `backup/` 得到两类包（`dsh-workbench-backup-*.zip` / `library-export-*.zip`），按时间倒序；文件被移走或删除后自然消失（没有会过期的索引文件）；`startExportJob(kind, run)` 同一时间只允许一个任务，完成/失败留在内存 job 列表；`revealInFileManager(path)` 用资源管理器选中文件（macOS `open -R`、Linux `xdg-open`）。
- `routes.js`：`POST /backup` 新增 `action: 'create-async'`（返回 job；旧 `create` 保留兼容）；`POST /library-export` 支持 `async: true`；新增 `GET /exports`（记录 + job 列表，免书库）与 `POST /reveal {name}`（只接受插件的包名、文件必须存在、回调路径固定在 `backup/` 内；测试可注入 `revealFile`）。
- `client.js`：打包数据 / 导出书库包都改为「立即返回 job → 每 1.5s 轮询 `/exports`」；新增「打包记录」区块：类型 · 时间 · 大小 +「下载」+ 📂「打开文件位置」；运行中/完成/失败状态行；两个按钮共用同一 busy（一次只能打一个包）。旧同步响应字段与下载逻辑删除。
- 记录不进迁移包：迁移包只收 `PLUGIN_STATE_FILES` + 书库 `.pdfdesk`，`backup/` 目录本来就不在包内；记录又是扫描得出，无需排除逻辑。
- 验证（exit 0）：新增 `.dsh-scratch/exports-test.mjs` **22 条**（两类包都出现、忽略 `staging-`/`pre-import-`、倒序、删除文件后记录消失、`create-async` 立即返回 running → 轮询 done → 记录出现且可下载、书库包 async 同样、`reveal` 只在 backup 内且校验名字/存在、并发打包 409、没有额外索引文件）；`library-export-test`、`backup-create-test`、`backup-import-test`、`backup-test`、`imports-test`、`translation-cache-test`、`layout-test`、`host-test`、`routes-e2e-test`、`check-keys`、`check-deps`、`env-guide-test`、`release-guard-test` 全过；`node --check` 全部源文件。
- 兼容性：旧客户端仍可调同步 `create`/同步导出；新客户端不再使用它们。
- 未覆盖 / 需手测：真实 126 MB 打包在设置页的等待体验（可离开面板再回来）、📂 是否按预期在资源管理器中选中文件、打包中关闭面板/刷新页面后的记录恢复（job 只在内存，完成后记录从目录扫出来）。

**T-20261126-09 需求与进度（2026-11-26 15:20）**

- 用户 15:10 回答：① **PDF 包分组**：有拆分的按子目录成书，未拆分的整本 PDF 也可单独选；② **笔记包**：兼容「导出书库包」与「整机迁移包」；③ **阈值 64 MB**；④ **入口**：设置 → 数据「导入书籍包」与书库「+」共用同一向导。
- 已落码（15:20）：**大文件两次提醒**。客户端导入 PDF 前检查 `file.size > 64 MB`：第一次弹「文件较大，建议拆分（说明上下文/花费代价）」，选「仍然导入」后再弹一次后果确认，确认后请求带 `allowLarge=1`；取消则跳过该文件并提示。Host `/imports` 与旧 `/import` 的 pdf 分支只在 `allowLarge=1` 时把上限放宽到 2 GB（`MAX_ARCHIVE_FILE_BYTES`），md/txt 仍为 64 MB；`importSingle` 支持 `maxBytes`。中英文案各 7 键。
- 验证：`imports-test.mjs` 增至 **38 条**（新增「确认后允许导入超过 64 MB 的整本 PDF」；原来拒绝 65 MB 的断言保留）；`check-keys`、`node --check` 通过。
- 大文件提醒已落码（见下）；导入向导也已落码（2026-11-26 15:40），证据见下条。
- 设计假设（实现时按此，若不同意再改）：书 id 取子目录名；散装整本 PDF 的书 id 取文件名 stem；已有书判定用「大小 + sha256」对比该库 `整本/` 与 `分片/` 下的 PDF；笔记包中按 `.pdfdesk/annotations|questions|attachments/<书id>` 匹配，同名书跨多个迁移书库 id 时取并集并提示。

**T-20261126-09 实现证据（2026-11-26 15:40，导入向导）**

- 新增 `src/host/book-wizard.js`：
  - `booksFromPdfEntries`：ZIP 里 `<书id>/<章>.pdf`（忽略开头 `分片/`）= 分片书；散装 `<书名>.pdf`（忽略开头 `整本/`）= 整本书；非 PDF / 假 PDF 跳过并告警；书 id 合法性校验。
  - `notesFromEntries`：同时接受「导出书库包」（`.pdfdesk/annotations|questions|attachments/<书id>/…`）与「整机迁移包」（`libraries/<libId>/.pdfdesk/…`）。
  - `inspectBookPack`：逐本给出文件清单、大小、`existing`（对书库 `整本/` + `分片/` 按大小 + sha256 比对）、`notes` 统计、`warnings`。
  - `applyBookPack`：只处理勾选的书；已存在的书**不复制 PDF**；分片书写进 `分片/<书id>/`（同名同内容算重复、不同内容 `-2`），整本书写进 `整本/`；笔记按每本 `merge`（缺则补）/`overwrite`（覆盖）/`skip` 写入 `.pdfdesk/<类别>/<书id>/…`；全部临时文件 + rename 原子落盘。
- `routes.js`：新增 `POST /imports/stage`（原始字节暂存为 `stage-<uuid>.zip`，只收合法 ZIP，两小时未用自动清理）、`POST /book-import/inspect`、`POST /book-import/apply`；令牌严格校验格式与存在性，apply 后删除暂存包；无书库 409、坏包 400、过期 404。
- `client.js`：新增 `BookImportWizard` 面板（选 PDF 包 / 可选笔记包「导出书库包或整机迁移包」→ 逐本勾选 → 开始导入 → 报告）；已有书自动勾选并置灰（PDF 不重复导入），笔记列可选合并/覆盖/跳过；两个入口共用：设置 → 数据「导入书籍包」、书库「+」（文件框同时接受 `.pdf` 与 `.zip`，ZIP 走向导，单 PDF 走原快速导入 + 拆分询问）。旧的「导入书籍包」直传 UI 删除（Host 旧路由保留兼容）。
- 验证（exit 0）：新增 `.dsh-scratch/book-wizard-test.mjs` **26 条**（暂存/坏 ZIP、分组两种书、跳过非 PDF/假 PDF、已有书标记、书库包与迁移包笔记识别、只导入勾选书、已有书不重复复制、笔记 merge/overwrite、apply 删暂存、坏令牌/过期令牌、ZIP 穿越拒绝）；`split-entries-test`（文件框接受 zip + 向导接线）、`book-import-test`（改断言到向导）更新；回归 20 个脚本全过；`node --check` 全部源文件。
- 未覆盖 / 需手测：向导的视觉与交互（无头浏览器断言不具备）；真实大包、同名不同内容、笔记包与书 id 不匹配时的提示；`+` 入口选 PDF 与选 ZIP 两条路径；导入后书库刷新与「顺便拆分」提示的先后。
- 兼容性：旧 `/library-import` 路由与 `book-import.js` 仍保留（无 UI 入口）；大文件两次提醒与 `allowLarge` 逻辑不变。

**2026-11-26 15:45 修复与新增（打包失败根因、书库名、PDF 包）**

- **`net::ERR_UNEXPECTED` 根因**：`POST /pdfdesk/backup` 的 JSON 体上限是 16 KB；客户端「包含浏览器设置」把全部 `pdfdesk:*`（含逐页 `masks/annots/page` 缓存）装进 `settings`，一旦超过 16 KB，Host 的 `readJson` 直接 `request.destroy()`，Chromium 侧就是 `ERR_UNEXPECTED`（不是超时，也不是路由异常）。修法：① Host `mutationBody` 支持可选上限，`/backup` 放宽到 16 MB；② 客户端新增 `isPortableSetting()`，只迁移真正的偏好键，排除 `masks/annots/page/partial/translate-job/shared-branch/diag/debug/dev-mode`；③ 应用导入设置时同样过滤。
- **书库包带书库名**：`library-export-<书库名>-<时间>.zip`；历史记录解析出 `library` 字段，设置页显示「书库包 · 书库名 · 时间 · 大小」。旧的无名包仍能被识别与下载。
- **新增 PDF 包导出**：`POST /pdfdesk/pdf-export`（`scope: fragments|whole|both`，支持 `async`），打包 `分片/`、`整本/` 的 PDF，manifest `kind: pdf-pack`、`included.pdf: true`、不含 `.pdfdesk`；命名 `pdf-pack-<书库名>-<时间>.zip`，与书库包/迁移包分开；设置 → 数据 新增「导出 PDF 包」区块；历史记录新增「PDF 包」类型。
- 验证：`exports-test` 24 条（含「>16 KB 设置体能受理」「客户端只迁移便携偏好」）、`library-export-test` 32 条（含书库名、PDF 包内容/manifest）全过；`check-keys`、`node --check` 通过。
- 发现但未修：**拆分工具页面异常**（T-20261126-11）——需用户描述具体症状后复现；导入包选择 UI 优化（T-20261126-10）——按用户要求本轮只记录不做。

**T-20261126-11 证据（2026-11-26 15:58，拆分面板太小）**

- 用户描述：拆分弹窗「操作页面太小了，什么都点不到」。
- 根因：拆分面板借用 `KitModal`，并用 `className: 'md-split-modal'` 想放大，但项目里**没有任何 `.md-split-modal` 样式**，宿主 Modal 按默认窄宽度渲染；`.md-split` 是「缩略图网格 + 260px 侧栏」的宽布局，在窄面板里被压扁，缩略图/剪刀/开始按钮都挤到点不到。
- 修复（`client.js`）：拆分面板不再走 `KitModal`，改为专用全屏覆盖层：`md-split-backdrop` + `md-split-panel`（`width: min(1180px, 96vw)`、`height: min(840px, 92vh)`、头部标题+关闭、body 内部滚动）；`.md-split` 高度撑满、窄屏（≤860px）自动改单列并把范围栏放前面；点遮罩关闭、`Esc` 关闭；标题、缩略图、剪刀、范围预览、开始/关闭按钮都留在面板内。
- 验证：`node --check client.js`；`split-ui-test` 通过（面板类名与关键接线）；回归待跑。
- 未覆盖：真机视觉与点击（需手测：弹窗应接近全屏，缩略图能滚动，页间剪刀可点，范围实时更新，开始拆分可用）。

**T-20261126-06a 证据（2026-11-26 15:52，存储占用面板）**

- 用户 15:47 确认：先做 T-06a（只读占用 + 清理可重建缓存 + 清空回收站），T-06b/c/d 留后续；本轮不改保留期、不做位图上限、不做重复文件报告。
- 新增 `src/host/storage.js`：
  - `measureStorage({ dataDir, libraries })` 只读扫描并按区域返回 `{keys, bytes, files, safe}`：`translation`（各库 `.pdfdesk/translation`）、`legacy`（旧全局 `translation/`）、`jobs`（`translate-jobs` + `export-jobs`）、`tmp`、`staging`（`backup/staging-*`）、`preImport`、`packages`（`backup/*.zip`，用 `exports.js` 的 `isExportName` 认）、`trash`（各库 `回收站`）；`safe: 'rebuild' | 'manual'` 区分可重建与需用户确认；符号链接一律跳过，不跟随到库外。
  - `cleanTemporary({ dataDir, busy })`：只删 `tmp/` 的过期项（`stage-*.zip` 2 小时、其余 1 小时，与导入向导的暂存期一致）与 `staging-*`；`busy`（有打包任务在跑）时**完全不碰** `backup/`。打包文件、导入前快照、译文缓存、产物一律不动。
  - `emptyTrash(library)`：只清当前库 `回收站/` 顶层条目；目录缺失返回 0。
- `routes.js`：`GET /storage`（免书库）、`POST /storage/clean`（同源 + 405）、`POST /trash/empty`（同源 + 无书库 409）；`/storage` 只加进免书库白名单。**只增不改**，既有路由与存储结构一个没动。
- `client.js`：设置 → 数据「数据位置」下方新增「存储占用」：各区域 MB（0 不显示）+ 合计 +「刷新」「清理可重建缓存」「清空回收站」（两个删除动作都先 `window.confirm` 才发请求）；统计在切到数据页时按需读取（`tab !== 'data' || storage !== null` 才跳过），**不进 bootstrap**——与 T-03 证据里「缓存占用按 T-06 处理」一致；中英各 20 个文案键。
- 验证（全绿，exit 0）：`node --check client.js / index.js / src/host/*.js`（42 个模块）；新增 `.dsh-scratch/storage-test.mjs` **44 条**（八区统计与合计、测量只读、过期/新鲜临时文件与暂存包、`busy` 时跳过 staging、打包文件/快照/译文缓存不动、回收站清空且不动 `分片/`、`/storage` 免书库 200、`/storage/clean` 免书库 200、POST 405、跨源 403、`/trash/empty` 无书库 409、客户端按需读取与两处确认、中英文案）；回归 **27 个脚本全 exit 0**（`host-test`、`imports-test`、`book-wizard-test`、`exports-test`、`library-export-test`、`translation-cache-test`、`layout-test`、`split-ui/-entries/-import`、`book-import-test`、`backup-*`、`routes-e2e-test`、`check-keys`、`check-deps`、`env-guide-test`、`release-guard-test` 等）；`docs/LAYOUT.md` 与 `CHANGELOG.md` 同步。
- 未覆盖 / 需手测：设置页视觉与长列表换行；真实书库（`Serre表示论`）的占用数字是否与资源管理器一致；清空回收站后书架/书库是否立即刷新；打包进行中点「清理可重建缓存」应只报「没有可清理的临时文件」（Host 已跳过 staging）。
- 未做（留给 T-06b/c/d）：保留期自动清理、`translation` 的「清理 N 天未用」、pdf.js 页面位图上限设置（`client.js` 的 `PAGE_PRELOAD_LIMIT = 5`）、同内容旧文件报告；`封面/` 缩略图未纳入统计。

**2026-11-26 18:40 迁移包流式化 + 笔/橡皮光标（T-20261126-21/22 证据）**

- 用户 18:15「都改吧」：迁移包也流式化 + 笔/橡皮光标按拍板做（笔尖 / 橡皮头）。
- **T-21 光标**（`client.js`）：`.md-canvas-capture[data-tool="pen"]` 改为自定义 SVG 笔形光标，热点 `3 24`（笔尖）；`[data-tool="erase"]` 改为橡皮头光标，热点 `3 21`；两者都保留 `crosshair` / `cell` 作为系统回退，其它工具不变。测试 `pen-cursor-test` **8 条**（含「SVG 已 URL 编码」与「其它工具仍十字」）。
- **T-22 迁移包流式**（`src/host/zip.js` + `backup.js`）：
  - `zip.js` 新增 `writeZipFile()`：顺序写本地头 → 数据（`createReadStream` / Buffer，deflate 走 `createDeflateRaw`）→ 中央目录 + EOCD；CRC 与压缩/原始大小在数据落盘后按 offset 回填（不用 data descriptor，产物与 `writeZip` 同构）；条目数/大小越过 ZIP32 边界抛 `zip64`；失败删半成品。
  - `backup.js`：`packDirectory` 不再预读文件，Node 回退改 `writeZipFile`（**Python 可用时也先不读内存**了）；`inspectBackup`/`readBackup` 改 `listZipEntries` + `readZipEntryBuffer`（单条 >512 MB 抛 `too-large`）；`importBackup` 改为「先全量流式校验（含清单外条目）→ 逐条 `pipeZipEntry` 到 `.import-<uuid>.tmp` → 比 sha256/bytes → rename」，失败删临时文件。包名、manifest 字段、pre-import 快照、merge/overwrite/skip 语义与错误码均未改。
  - 一致性补丁（我复核时加的）：`importBackup` 入口也按 `MAX_BACKUP_ENTRY_BYTES` 拒绝超大条目，避免「inspect 拒绝、import 却接受」。
- 验证（exit 0）：新增 `.dsh-scratch/backup-stream-test.mjs` **37 条**（`writeZipFile` 产物被 `readZip`/`listZipEntries`/Python `zipfile` 三方交叉验证；store/deflate/中文名/嵌套/空文件；清空 PATH 走 Node 回退且无 `.tmp` 残留；`readBackup` 形状与篡改包报错；512 MB `too-large`；`createBackup` 端到端；`importBackup` merge 改名不覆盖、逐文件 sha256、无 `.import-` 残留）；**回归 37 个脚本全过**；`node --check` client / index / 43 个 host 模块全 0。
- 内存实测（40 MB 假会话文件）：`writeZipFile` store/deflate 打包与 `importBackup` 导入的 `arrayBuffers` 增量均为 **0**（采样点强制 GC；不强制时会看到 17–40 MB 的已死读块噪声）。
- 未覆盖：zip64（>4 GB / >65535 条目）只抛错不写入；真实 >512 MB 条目用改目录大小模拟、没有实体文件；本沙箱下 Python 打包分支（`execFile` 管道被禁）未端到端跑，真机仍优先 Python；`inspect` 仍按条目缓冲（126 MB 包 inspect 峰值≈包内总和，单条封顶 512 MB），要彻底流式需改 `readBackup` 返回形状，影响 routes 与既有测试，建议另开单元；强制杀进程时可能残留 `.import-*.tmp`（正常路径会删）。

**2026-11-26 18:05 删旧导入接口 + 流式解包（T-20261126-18/19 证据）**

- 用户 17:29 拍板：旧接口「现在就是大更新了，可以试着删」；流式化「能增强稳定性，建议现在修」。
- **T-18 删除旧接口**：`routes.js` 移除 `POST /pdfdesk/import` 与 `POST /pdfdesk/library-import` 两个薄包装，`src/host/book-import.js` 整文件删除（仅这两个路由引用）。客户端早已全部走 `/imports`，删除对用户无感；测试同步：`imports-test` 改为断言两条旧路由 **404** 且 `/imports` 仍是入口，`split-import-test` 的四个调用迁到 `/imports?kind=pdf`，`routes-e2e-test` 的书包导入改为向 `/imports?kind=book-zip&target=fragment` 发原始字节（`fakeRequest` 补 async iterator），`book-import-test` 重写为直接验证 `importArchive()` 并断言旧路由/旧模块已不存在。
- **T-19 流式解包**：`zip.js` 新增 `listZipEntries()`（只读中央目录 + 每条本地头定位 `dataStart`，拒绝 zip64/加密/分卷/截断）、`pipeZipEntry()`（按数据区间 `createReadStream`，deflate 经 `createInflateRaw`，`pipeline` + 计量 Transform 统计字节/CRC32/sha256，写完校验大小与 CRC）、`readZipEntryHead()`、`readZipEntryBuffer()`；`imports.js` 的 `importArchive()` 与 `book-wizard.js` 的 `inspectBookPack()`/`applyBookPack()` 改为「列目录 → 逐条流式落临时文件 → 校验 → rename」，不再 `readFile` 整包或整份 PDF。`booksFromPdfEntries`/`notesFromEntries` 的纯函数签名保持不变（`book-wizard-test` 仍直接单测它们）。
- 验证（exit 0）：新增 `.dsh-scratch/zip-stream-test.mjs` **45 条**（store/deflate/中文名/嵌套目录、与 `readZip` 交叉验证字节与 sha256、截断/CRC 损坏/非 ZIP/zip64/加密/穿越路径的可读错误码、`readZipEntryBuffer` 超限、30 MB store 与 deflate 各导入一次、向导 inspect 的内存、损坏条目不留临时文件、`bytes` 入参兼容）；回归 **36 个脚本全过**；`node --check` client / index / 43 个 host 模块全 0。
- 内存实测（30 MB 条目）：堆增量 +1~2 MB、buffer 峰值 +23 MB（store）/ +7 MB（deflate）/ +14 MB（向导 inspect）——相对于旧实现「整包 + 全部条目同时在内存」已经是数量级差别；buffer 峰值含 V8 未及时回收的流块，故断言口径取「小于条目大小」。
- 未覆盖：zip64（>4 GB 或 >65535 条目）明确拒绝而非支持；加密 ZIP 只报错；真实 GB 级包未实测（测试用 30 MB，避免拖慢）；`backup.js` 的迁移包读取/打包仍是整包内存（126 MB 级别，未纳入本单元）。

**2026-11-26 17:52 两种思考模式（T-20261126-20 证据）**

- 用户 17:35 提需求（会话/模型性能要分档），17:44 拍板两条口径：**日常模式不带整章，只带当前页/选中内容**；**默认日常**。
- 实现（`client.js`）：
  - 偏好 `pdfdesk:ai-mode`（`'quality'` 才走高质，其余一律日常）；`readAiMode()` / `writeAiMode()`。
  - **两种模式都走整章共享前缀**（用户 18:00 更正：「前缀仍然跑全章，不然效果不好」）；差别只在种子里的回答风格要求。
  - 种子文案：`DAILY_READING_LINE`（「整章已读过；回答像网页聊天：先给结论，3–5 句说清」）+ 当前页号；高质 `WHOLE_CHAPTER_LINE`（明确允许长篇推导与证明）。
  - 设置 → AI 顶部新增「思考模式」两个按钮（日常/高质）与两段说明，写清「只影响之后新建的会话」；中英各 6 个文案键。
  - **风格提示词可编辑**（用户 18:50「提示词给用户改的空间也不赖」）：同样的两句风格要求抽成 `DEFAULT_STYLE` 常量，设置 → AI 增加两个文本框（`pdfdesk:ai-style:daily|quality`），失焦即保存、清空后「恢复默认」；种子改用 `readStylePrompt(mode)`，用户自填优先。中英各 4 个文案键。
- 验证（exit 0）：新增 `.dsh-scratch/ai-mode-test.mjs` **18 条**（默认值与只接受两值、日常跳过共享前缀、种子文案与当前页、设置页按钮与两段说明、中英文案、只影响新会话）；`node --check client.js`、`check-keys`、`check-deps` 全 0。
- 未覆盖 / 需手测：真实会话的 token 对比（日常应只有几百 token，高质仍是 1–4 万）；日常模式下「提取/习题」的提示词是否仍假设整章（种子已声明只看给定内容，但提示词模板未改，可能先抱怨看不到整章）——这是本单元最大风险，请手测一种模式各开一次会话确认语气。

**2026-11-26 17:19 用户拍板（不做/关闭）与封面缓存（T-20261126-17 证据）**

- 用户拍板：**T-20261126-07 取消**（两个 DSH 档已能区分开发版/正式版）；**「只含最近 N 天会话」不做**（迁移包体积只做提示）；**`工具/` 复制收尾不做**（用户认为该功能有严重 bug 且可有可无）；**封面缩略图"可以记一下"，前提是不要重复下载**。
- 核对结论：封面确实**每次都重新下载** —— `/cover` 走 `sendBytes`，响应头是 `cache-control: no-store`、没有 ETag。→ 已修。
- 修改：`http.js` 的 `sendBytes` 接受可选 `cache: { etag, maxAge }`（只改响应头，默认行为仍是 `no-store`）；新增 `sendNotModified()`；`routes.js` 的 `/cover` 改为按文件 `size + mtime` 生成 ETag、命中 `If-None-Match` 回 **304**、否则回 200 带 `etag` 与 `private, max-age=300`。换封面后 ETag 变化，浏览器会重新取一张，不会卡在旧图。
- 验证（exit 0）：新增 `.dsh-scratch/cover-cache-test.mjs` **9 条**（200 + ETag + `max-age`、带 `If-None-Match` 回 304 且不发图片字节、过期 ETag 仍回 200、换图后 ETag 变、无封面仍 404）。
- 未覆盖：真实浏览器对 `<img>` 的 `If-None-Match` 行为（Chromium 会带，但不同 WebView 可能不带）。

**2026-11-26 17:10 幽灵书修复 + 拆分方案记忆（T-20261126-15/16 证据）**

- 用户报告：拆分目标里出现「书库里已经删除的书」；并希望记住一本书的拆分方案（怕误退）。
- **T-20261126-15 幽灵书**，两个独立根因（都已复现）：
  1. **目录缓存 2 秒未失效**（`routes.js` 的 `catalog()` + `CATALOG_TTL_MS = 2000`）：删除成功→客户端立刻拉 `/bootstrap`→命中的是删除前的缓存，于是书架和拆分下拉继续显示已删的书，直到下一次手动刷新。修法：新增 `invalidateCatalog()`，在**所有会改变书列表的写操作**后调用——`/trash-book`、`/split`、`/imports`（pdf/md 与 book-zip）、旧 `/import`、旧 `/library-import`、`/book-import/apply`、`/samples/install`。
  2. **索引是缓存却无人校验**（`index-source.js`）：删除只把文件搬进 `回收站/`，`索引.json` 里的死条目仍在，`loadCatalog` 无条件信任它。修法：新增 `bookStillPresent()` / `dropMissingBooks()`，逐个校验 `整本/<file>.pdf`、根目录 `<file>.pdf`、`分片/<file>.pdf` 或 `分片/<dir>` 是否存在；不存在的条目丢弃，并给出「索引里有 N 本已经不存在的书，已忽略」的提示（覆盖在资源管理器里手动删文件的情况）。
  - 真实库核对（只读）：两个书库 `source=scan`、无死条目；本机没有 `索引.json` 的库同样受益于 (1)。
- **T-20261126-16 拆分方案记忆**（`client.js` 的 `SplitDialog`）：拆点按书存 `pdfdesk:split-cuts:<书id>`（localStorage），打开面板时恢复（只恢复 `< 总页数` 的拆点），面板里显示「已恢复上次的 N 个拆点」与「清除记录」；每次加减拆点立即写入。误关/崩溃重开不再丢方案。
- 验证（exit 0）：新增 `.dsh-scratch/ghost-book-test.mjs` **14 条**（删除后立刻取目录已不含该书、其它书仍在、整本书列表干净、索引死条目被忽略且给提示、拆点持久化与清除的中英文案）；`node --check` client / 44 个 host 模块；`check-keys`、`check-deps` 全过。
- 未覆盖：真实书库里复现删除→立即刷新的时序（测试用临时库，时序等价但窗口更短）；多书库时删除非当前库的书（缓存按 `library.id` 比对，未单测）。

**2026-11-26 16:47 §3 全过 + 16:52 拆分面板最终态 + T-06b/c/d 证据**

- 用户 16:47：T-20261125-05/09/10/12/13 全部「可以」→ 五条置**完成**；本轮到此 v1.5 遗留队列清零（只剩数位板两项待复现）。
- **T-11 最终态**（用户 16:52：「面板太大，每行保留 4 页比较合理；另外虚线是竖着的」）：
  - `.md-split-pages` 由竖向大图列表改为 **每行 4 页** 网格（1100px 三列、820px 两列）；页宽随格子，缩略图仍按 CSS 宽 × DPR 渲染、每页只画一次。
  - 剪刀改**竖向**：贴在每页**右边缘**的竖虚线 + 圆形 ✂（`border-left`，不再 `border-top`）；已切开变红实线，页码变红底白字（`md-split-num-on`），`aria-pressed` 保留。
  - `split-ui-test` 同步断言：每行 4 页、竖虚线、2/3 列降级、DPR、paint-once、单 observer。
- **T-06b 保留期**（`storage.js` + `routes.js` + `client.js`）：`pruneTrash`（回收站按「最近文件 mtime 超过 N 天」）、`pruneTranslationIdle`（各库 `.pdfdesk/translation/<书>/<章>`）、`pruneStaleJobs`（`translate-jobs` / `export-jobs` 里非 running 且过期）；`POST /storage/prune {target, days}`（同源、坏 target 400、无书库清回收站 409、jobs 不需要书库）；设置页保留期下拉 30/90/180 天（`pdfdesk:storage-keep-days`）+ 两个按钮，均二次确认。**没有任何定时删除**。
- **T-06c 位图上限**：删除 `PAGE_PRELOAD_LIMIT` 常量，改为 `readPageCacheLimit()`（默认 5、夹 2–8、键 `pdfdesk:page-cache-limit`）在驱逐点实时读取，设置里改完立即生效；设置 → 阅读 增加 2/3/5/8 下拉与说明。
- **T-06d 重复 PDF**：`scanDuplicates({ library })` 扫 `整本/` 与 `分片/<书>/`，先按大小分组、再对同组流式 SHA-256，返回 `{ scanned, wasted, groups:[{ size, count, wasted, files }] }`；`GET /duplicates` 只读；设置页「重复 PDF」区块显示「N 组、多占 X MB」与分组清单，**不提供删除**。
- 验证（exit 0）：`node --check` client / index / 44 个 host 模块；新增 `.dsh-scratch/retention-test.mjs` **38 条**（回收站保留期、译文缓存闲置、任务状态、三种 target 路由 + 坏 target/跨源/409、保留期下拉与确认、位图上限默认/夹取/读取点/设置项、重复分组与改内容后不再重复、客户端接线）；`storage-test` 46 条、`split-ui-test`、`split-entries-test` 等**回归 31 个脚本全过**。
- 未覆盖 / 需手测：真实大书库重复扫描耗时（按钮等待，最长 180s 超时）；保留期按钮在真库上的实际删除清单；位图上限调到 2 页时连续模式的回滚观感。

**T-20261126-12 证据（2026-11-26 16:35，.lnk 解析目标后导入）**

- 用户 16:20 问「快捷方式不能直接定位其背后的文件吗」，确认选「支持定位目标再导入」。
- 新增 `src/host/shortcut.js`（238 行，纯函数 `resolveShortcutTarget(bytes)`）：校验 HeaderSize `0x4C` / LinkCLSID / HasLinkInfo；**必须先跳过 LinkTargetIDList**（`0x4C + 2 + IDListSize` 才是 LinkInfo —— 实测 `WScript.Shell` 生成的 .lnk 都带 IDList，按字面从 0x4C 读会全部解析失败）；LocalBasePath 的 Unicode 字段优先，缺失时 ANSI 按 UTF-8 → GBK → latin1 解码（中文 Windows 的 `LinkInfoHeaderSize` 常为 `0x1C`，根本没有 Unicode 字段）；网络路径读 `CommonNetworkRelativeLink` 的 NetName；全部偏移做边界检查，异常一律返回 null。
- `src/host/imports.js`：`kind === 'pdf'` 且名字是 `.lnk` 时走新分支 → 解析目标 → 分类（本地/网络）→ stat → 校验扩展名 `.pdf` 与大小 → 复制到 staging → **复用既有导入流程**（magic bytes、去重、`-2` 命名、原子落盘），落盘名用目标文件名，报告项加 `source: 'shortcut'` 与原目标路径；`.lnk` 本身永不入库，暂存副本 finally 删除。`.url/.desktop/desktop.ini/Thumbs.db` 与 `kind=md` 收到 .lnk 的拒绝行为未变。
- 错误码：`shortcut-network`（UNC / `\\?\UNC\`）、`shortcut-missing`（目标不存在或读不到）、`shortcut-type`（不是 `.pdf` 或不是普通文件）、`shortcut-bad`（头/IDList/LinkInfo 损坏、非绝对路径）；超限仍走 `too-large`，内容不是 PDF 仍走 `fake-pdf`。文案统一带「请直接拖原 PDF 到书库」。
- 客户端：封面「+」文件框 accept 加 `.lnk`（按 `kind=pdf` 上传）；书库「导入文件」提示补一句「快捷方式会按它指向的 PDF 导入，快捷方式本身不会入库」。
- 验证（exit 0）：`node --check` 全部源文件（44 个 host 模块）；新增 `.dsh-scratch/lnk-test.mjs` **32 条**（真 COM 生成的 .lnk，中文目标；落盘名=目标文件名、库内递归无 `.lnk`、同目标 duplicate、目标丢失→`shortcut-missing`、`.txt`→`shortcut-type`、文件夹→`shortcut-type`、超限不复制且清临时、截断/0 字节/无 LinkInfo/大写 `.LNK`→`shortcut-bad`、`kind=md` 仍是可读拒绝，**0 SKIP**）；`imports-test` 38 条（旧「.lnk 一律拒绝」断言按新行为改成 `shortcut-bad`，其余未动）；回归 28 个脚本全过。
- 未覆盖：真 SMB 共享（只做了合成字节；实测**不可达** UNC 目标的 .lnk 根本不写 LinkInfo，会落到 `shortcut-bad` 而不是 `shortcut-network`）、OneDrive 未水合文件（映射成 `shortcut-missing`）、junction/symlink 目标（`stat` 跟随链接）、盘符漂移（只校验存在 + 扩展名 + 大小，不校验 VolumeID）、多级快捷方式（按「不是 PDF」拒绝）。

**2026-11-26 16:15 手测反馈处理（T-11 返工 / T-09 重做 / T-13 / T-14 证据）**

- 用户手测结论：T-03、T-04、T-05 通过；T-06a「可以看见」；T-01、T-02、T-08 通过但有追加项；T-09「可以，但页面真的太丑了」；T-11「缩略图加载太慢、很模糊看不清，切开的箭头太不显眼」。
- **T-11 返工**（`client.js`）：
  - 根因①「模糊」：`paintSplitThumb` 固定按 132px 出图，`.md-split-page` 也是 132px，HiDPI 下再被放大到 264 物理像素；而且 132px 的整页 PDF 本来就读不清。→ 改为按 **CSS 宽度 × `devicePixelRatio`（上限 2）** 出图，页宽 `min(620px, 100%)`。
  - 根因②「慢」：`register(number)` 每次渲染返回新闭包 → React 每次都 detach/attach 全部 canvas，每次 attach 又新建一个 `IntersectionObserver` 并重画；点一次剪刀就等于整列缩略图重绘。→ 改为 **按页码缓存 ref 回调 + 单个 observer + `dataset.painted` 只画一次**，`rootMargin` 600px。
  - 根因③「剪刀不显眼」：旧样式宽 12px、`opacity .4`、贴在右边缘。→ 改成 WPS 同款：页间**整行虚线** + 居中圆形 ✂ 按钮，悬停变蓝、已切开变红实线并显示「已切开」，带 `aria-pressed`。
  - 测试：`split-ui-test` 的旧断言「存在 `.md-split-grid`」换成新设计断言（竖向列表、虚线、✂、DPR、paint-once、单 observer、aria），改版依据写进脚本注释。
- **T-09 界面重做**（`client.js`）：旧版借用宿主窄弹窗，两个长按钮被挤到截断（用户截图里「选择 PDF」「选择笔记包（可…」都被切）。→ 专用大面板 `min(860px, 94vw)`：① PDF 包 ② 笔记包 ③ 要导入的书 三步卡片，每步有虚线拖放区（拖 ZIP 即可）+ 已选文件名与大小 +「重新选择」；书列表独立滚动；底部固定操作栏。新增文案键中英各 6 个。
- **T-13**：`POST /exports/delete`（同源、只认插件命名的包、只删 `backup/` 内文件）+ 打包记录行 🗑（二次确认后刷新）；`POST /library/reveal` + `exports.js` 的 `revealDirectory()`（explorer 打开目录）+ 书库卡片「进入书库」「📂 打开书库目录」。
- **T-14**：`measureStorage` 增 `sessions`（`dirname(dataDir)/sessions`，与 `collectBackup` 同一推导）、`fonts`、`projcache` 三区；设置 → 数据 增加一句体积提示（会话约 X MB / 字体约 Y MB），保留默认含会话。
- 验证（exit 0）：`node --check client.js / src/host/{routes,exports,storage}.js`；`storage-test` **46 条**、`exports-test` **33 条**、`split-ui-test`、`split-entries-test`、`book-wizard-test`、`host-test`、`routes-e2e-test`、`layout-test`、`library-export-test`、`imports-test`、`check-keys`、`check-deps`、`env-guide-test`、`release-guard-test` 全过。
- 未覆盖 / 需手测：缩略图真机清晰度与滚动流畅度、虚线剪刀的命中区、向导拖放、书库卡片两个按钮、删除包后的记录刷新。

**T-20261125-10 证据（2026-11-26 11:50，三处拆分入口 + 书库封面「+」导入）**

- 用户 11:50 拍板范围：**整套**（三个拆分入口 + 封面「+」导入 + 导入后问「要顺便拆分吗」）；交互按主流（库末尾「+」磁贴），新增 17 对中英文案。
- 入口：① 书库页工具区新增「按页拆分整本 PDF」卡片：整本书下拉 + 「打开拆分面板」+「导入 PDF 并拆分」；② 书本页原有的「拆分为章节」不变；③ 设置 → 数据 新增同名区块（`SplitStart` 共用同一选书块，点开始先关设置再开面板，避免两层模态叠着）；④ 书库封面网格末尾新增「+」磁贴（仅默认书架；空书架给一个导入按钮）。
- 导入链路：`POST /pdfdesk/import` 把 PDF 写进 `整本/` 并返回落盘路径（重名自动 `-2`）；客户端用返回文件的 stem 在 catalog 里找 `whole === true` 且 `chapters[0].file === stem` 的整本书，找到才弹「《X》已导入 整本/。现在按页拆分成章吗？」（应用内 `KitModal`，`以后再说` / `现在拆分`）；找不到就不问、只报导入成功，不猜。
- 关键坑：整本书的 `file` 在 **`c00` 章节对象**上，`book.file` 不存在——第一版按 `book.file` 匹配永远匹配不到，被下面的真实路由测试抓出并改掉。
- 文案：旧「拆分工具」卡片原借用读版文案（`splitHint` 重复键被后者覆盖，显示成「在这个整本 PDF 上按页切开」）→ 改用 `splitToolStart` / `splitToolCardHint`，并删掉 zh 里被覆盖的重复键；新增键中英各一份（`check-keys` 无缺）。
- 验证（全绿，exit 0）：`node --check client.js / index.js / src/host/*.js`；新增 `.dsh-scratch/split-entries-test.mjs`（24 条：纯函数 9 条 + 接线 15 条）与 `.dsh-scratch/split-import-test.mjs`（12 条真实路由 + 临时书库：导入落到 `整本/`、catalog 出现整本 `c00`、重名 `-2` 对上、非 pdf 400、分片书不算拆分对象）；`check-keys`、`check-deps`、`host-test`、`translate-ai-route-test`、`overlay-text-layer-test`、`t05-toolbar-test`、`copy-removed-test`、`fit-cap-test`、`translate-prefs-test`、`split-ui-test`、`env-guide-test`、`dual-overlay-test`、`split-pdf-test.py`。
- 未覆盖：视觉（新卡片排版、「+」磁贴尺寸、设置里区块）没有无头浏览器断言，需用户手测；导入大文件（>64 MB 会被 Host 拒）未实测。
- 未提交（等手测通过后一次性提交）。

**T-20261126-01 / -02 证据（2026-11-26 13:30，统一导入管线 + 三入口改上传）**

- 用户本轮确认范围：T-01 + T-02 一起做（2026-11-26 13:14 在对话里选定），其余 T-03…07 不动。
- 新增 `src/host/imports.js`：`sanitizeName`（去目录、非法字符→`_`、隐藏/`desktop.ini`/`Thumbs.db`/`.lnk`/`.url`/`.desktop`/保留名拒绝、160 字截断）→ `checkMagic`（PDF `%PDF-`、ZIP `PK\x03\x04`、md/txt 必须 UTF-8 且无 NUL）→ 大小常量（单文件 64 MB / 包内单文件 2 GB / 包总量 4 GB）→ `receiveUpload` 流式写 `dataDir/tmp` → `importSingle`/`importArchive` 去重（size + sha256，同内容 `duplicate` 不写盘）→ 统一 `-2, -3…` 命名 → 原子 `rename` 落盘（跨卷回退 copy + 目标目录内 rename）→ 统一报告 `{ targetDir, imported, duplicates, renamed, skipped, rejected }`。
- 新路由 `POST /pdfdesk/imports`（原始字节；`kind=pdf|md|book-zip|migration`；`target=whole|fragment`、`subdir`、`strategy=merge|overwrite|skip`）：pdf/md 进 `整本/`；book-zip 进 `分片/` 或 `整本/`；migration 先校验 ZIP 头 + manifest + 校验和，把临时路径与 manifest 返回给设置页，再由 `/backup` 完成导入并在成功后删除临时包。
- 兼容：`POST /pdfdesk/import` 改为薄包装（旧响应 `path/pdf/bytes` 保留，重复时 `duplicate:true`）；`/pdfdesk/library-import` 仍走 `book-import.js`，该模块改为委托 `importArchive` 并保留旧报告形状（一版后删）；`/backup` 的 JSON `inspect/import` 不变（路径型仍可用）。
- 客户端（`client.js`）：书库「导入文件」（多文件，md/txt 自动走 `kind=md`）、封面「+」与拆分卡的「导入 PDF 并拆分」、设置 → 数据「导入书籍包」、设置 → 数据「导入迁移包」全部改浏览器上传，不再有任何手输路径；报告统一为「新增 / 重复跳过 / 改名 / 拒绝（原因）」。迁移包选完后按本机同 id 已登记书库自动预填 `dataRoots`（不同 id 不猜，仍需手填），仍可手改。
- 验证（全绿，exit 0）：`node --check client.js / index.js / src/host/*.js`；新增 `.dsh-scratch/imports-test.mjs` **37 条**（有效 PDF、同内容去重、同名 `-2`、假 PDF、0 字节、`.lnk`、改名快捷方式、隐藏/系统/保留名、非法字符、大写扩展名、65 MB 超限、md 无引擎 503、非 UTF-8、书籍包 2 本 + 非 PDF/假 PDF 拒绝、整包重复全 duplicate、ZIP 穿越 400 且未越界、merge/skip/overwrite、迁移包无 manifest 400、真迁移包上传 → 临时路径 + manifest → `/backup` 检查/导入 → 临时包删除、旧 `/import` 兼容）；`book-import-test`（改为 `-2` + 去重）、`split-import-test`（改为不同内容测 `-2` + 同内容 duplicate）、`routes-e2e-test`（书包夹具改真 `%PDF-` 头）同步更新；回归 `check-keys`、`check-deps`、`host-test`、`translate-ai-route-test`、`overlay-text-layer-test`、`t05-toolbar-test`、`copy-removed-test`、`fit-cap-test`、`translate-prefs-test`、`split-ui-test`、`split-entries-test`、`env-guide-test`、`release-guard-test`、`zip-test`、`backup-test`、`backup-create-test`、`backup-import-test` 全过。
- 未覆盖 / 需手测：设置页与书库导入的视觉效果、真实 ZIP 上传（几 MB 到 GB 级）、迁移包从「选择」到「开始导入」的整条链路（含自动预填书库根）、md 上传在装有 Python/TeX 的机器上渲染、大包内存占用（`importArchive` 仍把 Zip 读进内存，沿用旧行为）。
- 未提交（等手测通过后一次性提交）。

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

## 2026-11-27 拆分路由修复（用户报告）

- 用户报告：拆分工具里“明明有书”，点「开始拆分」仍提示「没有这本书」；F12 里 `POST /pdfdesk/split` 返回 404。活动书库与插件配置的库（profile 未配置时是默认的 `~/数学书库`）不是同一个，后者没有 `分片/`、`整本/`。
- 根因①（404 的直接原因）：`src/host/routes.js` 的 `/split` 用 `loadCatalog(config)` 查书，`config` 是启动时的默认库；书架/拆分下拉来自 `catalog()`（活动书库）。两者不是同一个库时，任何书都查不到，所以“有书也提示没有这本书”。修法：改用 `catalog(true)`（活动书库、强制重扫）。
- 根因②（修掉 ① 后的下一个失败）：`runTool('split_pdf.py', …)` 用相对脚本名；Host 进程 cwd 是工作区根，Python 报 `can't open file '…\split_pdf.py'`（`runTool` 会把这类失败吞成「没有可用的 Python」）。修法：`runTool(join(config.toolsDir, 'split_pdf.py'), …)`，与导出/叠加等其它工具调用一致。
- 改动：仅 `src/host/routes.js`（2 处 + 3 行注释）；未动 `/pdfdesk/*` 路由形状、配置结构、数据 schema、locale。
- 验证（exit 0）：新增 `.dsh-scratch/split-active-library-test.mjs`（9 条：默认库与活动库分离 → `/imports` 导入进活动库 → bootstrap 能看到书 → `/split` 200 → 分片写进活动库；默认库无写入）；该脚本要 spawn Python，workspace-write 下 `spawn EPERM`，用 danger-full-access 跑；`split-ui-test`（断言更新为绝对工具路径 + 活动书库目录）、`host-test`、`split-import-test`、`split-entries-test`、`ghost-book-test`、`routes-e2e-test`、`base-route-test`、`empty-library-test`、`loose-books-test`、`book-wizard-test`、`imports-test` 全过；`node --check` client/index/全部 host 模块 0；`check-keys`、`check-deps` 0。
- 未覆盖 / 需用户手测：真实 DSH 重启后，在真实书库任选一本整本书点「开始拆分」，确认缩略图、开始拆分、拆分后书库刷新的完整链路；未改 `client.js`，拆分面板视觉与交互不变。
- 同批修复（用户 2026-11-27 明确要求）：`/render`、`/trash-book` 改用活动书库目录；`runTool` 在解释器存在但脚本失败时回报真实 stderr，不再吞成「没有可用的 Python」。详见下一节。
- 状态：待用户验收

## 2026-11-27 活动书库路由补齐 + 工具错误（用户报告）

- 用户引用上一轮“同类未修”后要求修复。
- `/render`：`loadCatalog(config)` → `catalog()`；并修正 `resolveChapter` 的返回判断（它返回 `{ok:false}` 而不是 `null`，旧代码会把失败当成章继续去查产物文件，把“书/章不存在”误报成“文件不存在”）。
- `/trash-book`：`loadCatalog(config)` → `catalog()`，书 id 与目录名不同时也能按活动书库的 `row.dir` 找到并移走。
- `runTool`：保留 `python`→`py` 回退；只有全部候选都 ENOENT 才报「没有可用的 Python」，否则把最后一次真实 stderr（截 2000 字）抛给路由。
- 验证（exit 0）：新增 `.dsh-scratch/active-library-routes-test.mjs` 9 条（活动库与默认库分离；render 到 missing-file 而非 no-chapter；未知书仍 no-chapter；split 非法范围返回“页码范围超出文档”而不是“没有可用的 Python”；trash 按目录名移走并进回收站）；`split-active-library-test`、`split-ui-test`、`split-import-test`、`split-entries-test`、`host-test`、`routes-e2e-test`、`base-route-test`、`empty-library-test`、`loose-books-test`、`book-wizard-test`、`imports-test`、`question-seed-test`、`question-ui-test`、`questions-test`、`ai-mode-test`、`ai-session-route-test`、`chapter-sessions-test` 全过；`node --check` client/index/全部 host 模块 0；`check-keys`、`check-deps` 0。
- 未覆盖 / 需用户手测：真实书库里的「产物转 PDF」（render 成功路径需要真实排版引擎）、删除一本目录名与 id 不同的书；`runTool` 的 `py` 回退在 Windows Store Python 别名环境下未实测。
- 状态：待用户验收

## 2026-11-27 疑问标记对 AI 不可见（用户报告）

- 用户报告：使用「疑问」功能后问「看到疑问一」，AI 在章节正文、`产物\...\c18\` 里搜不到，回「没有标着疑问一的东西，这个编号应该是你自己记的」。实际标记在 `<书库>\.pdfdesk\questions\卓里奇数分二\c18.json`（疑问 1，第 13 页）。
- 根因：疑问标记只存隐藏的 `.pdfdesk/questions`；会话 seed 只给书库/书目录/PDF/产物路径，没有标记列表；右侧预览新建时注入的 `看到疑问：<名称>` 也没有页码。AI 的 grep 看不到隐藏目录，正文/产物里又没有这个词，于是把标记当成用户虚构的编号。
- 修法（`client.js`）：新增 `questionsSeedText` / `chapterQuestionsBrief`，新会话与恢复空白会话的 seed 增加本章疑问标记（名称 + 页码）；新增 `question-crop` / `question-crops` Host 路由，把每个标记的 `{page, rect}` 渲染成**无损 WebP**，seed 带图片绝对路径；右侧预览新建疑问时先截图，注入行带 `图片（框选区域）：<path>` 和 `请先 read_image` 指令。通用会话仍只给地址，不塞章节标记。
- 验证（exit 0）：`question-seed-test` 13 条（空列表、缺页码、单/多标记、图片路径、真实 `readQuestions` 存取、seed 接线、注入行页码）；`question-ui-test`、`questions-test`、`ai-mode-test`、`ai-session-route-test`、`chapter-sessions-test`、`host-test`、`split-ui-test`、`split-active-library-test`、`question-crop-test`（单个/批量截图、真实 WebP、越界失败）全过；`node --check` client/index/全部 host 模块 0；`check-keys`、`check-deps` 0。
- 未覆盖 / 需用户手测：真实 c18 的「疑问 1」在第 13 页；已用 `crop_question.py` 对真实 PDF 渲染出 1401×349 的**无损 WebP（84 KB；同图 PNG 167 KB）**，肉眼确认正是「命题…完备的充要条件」那一段。重启后新建疑问或从右侧「疑问跳转」选已有疑问，确认注入行带图片路径且 AI 会 `read_image`。**已经开过的会话**若没注入过图片，需重新选一次疑问或新开会话；seed 在创建时固定。
- 已知无关失败：`.dsh-scratch/session-seed-test.mjs` 在 v1.5.0 删掉 `WHOLE_CHAPTER_LINE` 后未更新，测试自身过期（并非本次改动引入）。
- 状态：待用户验收

## 2026-11-27 右侧预览疑问工具无效（用户报告）

- 用户报告：右侧预览点疑问框后光标不变、不能在 PDF 上框选；并指出页码实际与显示不一致。
- 根因①：疑问层用 `displayPage`（翻译件页数不足时 `min(count, page)` 的 clamp 结果）作为过滤/落盘页号；标注用章节页 `page`。两者不一致时，右侧显示页、工具栏页码和标记归属页错位，疑问层可能落在不是用户正在看的那一页，表现为光标不变、拖不出框。
- 根因②：右侧预览在 `tool === 'question'` 时仍挂载整页 `editLayer`（`md-annot-edit`），它的 `editDown` 对 question 也执行 `preventDefault/stopPropagation`；主阅读器早已把 question 排除在编辑层外。不同 WebView/缩放下不能依赖层叠顺序来绕开它，已按主阅读器移除。
- 修法（`client.js`）：`editLayer` 条件加 `tool === 'question'`；`createQuestion` 的 `page` 改用章节页 `page`；`questionLayer` 过滤改用 `page`。`PdfViewer` 仍用 `displayPage` 渲染，`overlayPage` 仍为 `displayPage`。
- 验证（exit 0）：新增 `.dsh-scratch/side-question-tool-test.mjs` 7 条；`question-ui-test`、`questions-test`、`question-seed-test`、`ai-mode-test`、`ai-session-route-test`、`chapter-sessions-test`、`node --check client.js` 全过。
- 未覆盖 / 需用户手测：右侧预览单页/连续、源文件/翻译件、页码一致/不一致四种组合下点疑问框 → 光标变十字 → 拖出框 → 保存 → 主阅读器同页出现；以及右侧已有疑问的拖动/缩放/右键删除。无头环境无法模拟真实指针拖拽，需桌面手测。
- 状态：待用户验收

## 2026-11-27 右侧预览页码差一页（用户报告）

- 用户报告：右侧预览页码乱飘，总定位到上一页/下一页。
- 根因：连续模式靠 `ReaderPage` 的 `IntersectionObserver` 50% 可见比例发布页码；页面高过视口时，下一页刚过半就报下一页，而视口顶部还在上一页。主阅读器已改用“视口顶部 + 24px 所在页”，右侧仍用 50% 规则，差一页。
- 修法（`client.js`）：右侧不再把 `onVisible` 交给观察者；新增连续模式滚动监听，按与主阅读器相同的“视口顶部 + 24px”规则发布 `reportChapterPage`，180 ms 去抖，程序化滚动（`jumping`）期间不发布。双语右栏保留观察者规则（它有自己的列）。
- 验证（exit 0）：新增 `.dsh-scratch/side-page-drift-test.mjs` 9 条；`question-ui-test`、`questions-test`、`question-seed-test`、`side-question-tool-test`、`host-test`、`split-ui-test`、`check-keys`、`check-deps` 全过；`node --check client.js` 0。
- 未覆盖 / 需手测：右侧预览单页/连续、源文件/翻译件、滚动/翻页/点疑问跳转，确认页码与视口顶部页一致，不再差一页。无头环境无法模拟真实滚动。
- 状态：待用户验收

## 2026-11-27 拆分完成后的两个选择（用户需求）

- 用户要求：整本拆完后询问「是否移除整本形式的书？」与「是否打开拆分后的书？」并让功能真实可用。
- 客户端（`client.js`）：`SplitDialog` 成功后不再直接关面板，改为保留 `splitResult` 并弹出 `SplitResultDialog`；两个复选框（移除整本默认不勾、打开拆分后的书默认勾）+「完成 / 以后再说」；移除调用 `POST /pdfdesk/trash-book { book, file, whole: true }`，成功后 `reload()`；打开调用 `openBook(book.id)` 进入章节列表。
- Host（`routes.js`）：`/trash-book` 新增可选 `whole: true` + `file`；只在 `整本/`、库根、`分片/` 里找**单个** `<file>.pdf` 并移进 `回收站`，绝不碰同名的 `分片/<书id>/` 目录；`file` 缺省回退书 id；移动后 `invalidateCatalog()`。
- 验证（exit 0）：新增 `.dsh-scratch/split-result-route-test.mjs` 7 条（`book` 为 `id@hash` 时按 `file` 找到原 PDF；整本移走、同名分片保留；重复移除 404；缺 file 回退）；新增 `.dsh-scratch/split-result-ui-test.mjs` 14 条（两个问题、实际动作、默认值、中英键）；`split-ui`、`split-import`、`split-entries`、`ghost-book`、`host-test`、`routes-e2e`、`active-library-routes`、`check-keys`、`check-deps` 全过。
- 未覆盖 / 需手测：真实整本拆分后两个复选框的实际效果；移除后回收站可恢复；打开后章节列表出现；无头环境无法点真实弹窗。
- 状态：待用户验收

## 2026-11-27 疑问框选区域截图给 AI（用户需求）

- 用户澄清：不要“给疑问起问题名”的功能，要 AI 精确看到被框住的地方。
- 做法：Host 新增 `tools/crop_question.py`（PyMuPDF 渲染 + Pillow 编码为无损 WebP）和 `/pdfdesk/question-crop`（单个）、`/pdfdesk/question-crops`（批量）路由；图片存 `<书库>/.pdfdesk/questions/<书>/<章>/crops/<疑问id>.webp`。
- 新建疑问：右侧预览先调 `/question-crop` 截取框选区域，再注入 `看到疑问：名称（第 N 页）\n图片（框选区域）：<绝对路径>\n请先 read_image 这张图片…`。
- 已有疑问：从右侧「疑问跳转」选中某个疑问时会补截图并注入；新会话 seed 会批量给所有疑问补图（最多 40 个，缓存复用）。
- 验证（exit 0）：`question-crop-test` 8 条（单个 200、写入 crops、.webp、真实 WebP、批量包含已有疑问、批量落盘、越界失败）；`question-seed-test`（seed 带图片路径）、`question-ui-test`、`side-question-tool-test`、`side-page-drift-test`、`split-result-ui`、`check-keys`、`check-deps`、`node --check` 全过。
- 已用真实 c18「疑问 1」验证：`crop_question.py` 输出 1401×349 无损 WebP（84 KB；同图 PNG 167 KB），内容正是第 13 页「命题…完备的充要条件」那一段。
- 未覆盖 / 需手测：重启后新建疑问 → 注入行带图片路径 → AI 调 `read_image` 能读到；已有疑问从「疑问跳转」选一次 → 当前会话注入；新会话 seed 的图片路径；翻译件/旋转页的框选坐标（当前按源 PDF 页面渲染，旋转页未单测）。
- 状态：待用户验收

## 2026-11-27 拆分提示：手动拆分仍属整本（用户需求）

- 用户要求：给拆分增加提示——手动拆开的文件仍属于整本，只有在拆分会话里处理之后才有章节名和分片显示。
- 文案（中英各一条，`splitStaysWhole`）：显示在书库「拆分会话」卡片和「拆分与命名」指南；未改任何拆分/目录/会话逻辑。
- 验证（exit 0）：`check-keys`、`split-ui-test`（新增 3 条：中英文案、两处显示）、`node --check client.js` 全过。
- 状态：待用户验收

## 2026-11-27 书库使用提示：删除 PDF（用户需求）

- 用户要求：在书库页的「使用提示」里写清楚如何删除 PDF。
- 文案（中英各一条，`tipsDelete`）：显示在书库/书本页底部的「使用提示」详情；路径为 单击书卡选中 →「隐藏所选」→ 打开「隐藏书籍」→ 选中该书 →「删除所选（移入回收站）」；彻底删除去 设置 → 数据 → 清空回收站。
- 未改删除逻辑；只补可发现性。
- 验证（exit 0）：`check-keys`、新增 `.dsh-scratch/library-tips-test.mjs` 10 条、`node --check client.js` 全过。
- 状态：待用户验收

## 2026-11-27 拆分结果回到书架 + 导入拆分记忆 + 右侧工具栏让开滚动条 + 连续模式远滚空白

- 用户报告四事：拆分后的 PDF 不出现在书架；导入后的「是否拆分」要能记住；右侧竖排工具栏压住滚动条；连续模式下滑过多后一片空白（主阅读器与右侧预览都有）。
- **拆分不出现在书架**：根因是旧版 `/pdfdesk/trash-book` 忽略 `whole`，在「拆分完成 → 移除整本形式的书」时把同名的 `分片/<书id>/` 目录移进回收站，整本 PDF 却留在原地；目录没了，书架自然只剩整本。现场：`回收站/1795744134213-Abstract…`（23 个分片）、`1795745088343`、`1795745114557-Asymptotic…` 全是拆分产物，`分片/` 里没有同名目录。Host 修复（`whole:true` + `file` 只移原始整本 PDF）前一会话已落码，但当时运行的 Host 是 08:40 起动的旧模块。本次复核该修复（`split-result-route-test` 7 条 + 新增 `split-catalog-flow-test` 16 条），把被误删的 Abstract 拆分目录移回 `分片/`（Asymptotic 已在 10:21 重新拆分，未重复恢复）；「打开拆分后的书」改为按目录名解析分片书，不再打开整本。
- **导入后是否拆分带记忆**：`pdfdesk:import-split` 存 `ask|split|later`；对话框新增「记住这个选择」，选「现在拆分」→ 以后导入直接开拆分面板，选「以后再说」→ 不再弹窗；设置 → 阅读新增「导入后是否拆分」下拉，可改回每次询问。中英文案各 5 条。
- **右侧工具栏压滚动条**：`.md-rail-wrap/.md-rail-tab[data-side=right]` 内移 20px（Windows 原生滚动条 17px），面板右距 28→48，右侧预览阅读区 padding-right 40→48；主阅读器 58px 不变。栅格断言见 `rail-scrollbar-test`；本会话沙箱禁止 Chromium（mojo 拒绝访问），未生成截图，需重启后手测。
- **连续模式远滚空白**：两个叠加根因——(1) 挂载窗口 ±12 外的幽灵槽只有 240px，窗口移动时离开窗口的页塌陷，把列高拉走几千像素；(2) 窗口只跟已挂载页的 observer 报告走，滚动条拖拽/甩动落到带外后没有任何页报告，窗口永不跟。修法：幽灵槽按已量到的真实页高预留（`pageHeightCache` + 量到后触发重渲）；连续列在视口离开挂载带时按“顶边上方/下方”的页数发布目标页（`onFollow`，右侧预览经 `reportSide` 接住）；翻页/切模式/缩放这类程序化滚动期间用 `isSettling` 静默。
- 验证（exit 0）：`node --check` client/index/全部 host 模块；`check-keys`、`check-deps`、`host-test`；新增 `continuous-far-scroll-test`（12+3）、`import-split-memory-test`（14+3）、`rail-scrollbar-test`（7+反证）、`split-catalog-flow-test`（16）、`split-after-import-test`（环境限制，见下）；`split-ui`、`split-result-ui`（按新解析改断言）、`split-result-route`、`continuous-preload`、`continuous-page-indicator`、`ghost-book`、`library-tips` 全过。
- 环境限制：本会话沙箱内 Node 子进程管道被拒（`spawn EPERM`），`split-active-library-test`、`active-library-routes-test` 中真正执行 `split_pdf.py` 的两条断言无法在会话内跑；Chromium 无法启动（mojo 命名管道拒绝），UI 截图改由栅格断言 + 手测覆盖。
- 未覆盖 / 需用户手测：重启 DSH 后——(1) 书架出现 Abstract（23 章）与 Asymptotic（11 章）两本分片书；(2) 导入一本 PDF，勾「记住这个选择」选一次，再导入确认不再按原样询问、设置项可恢复；(3) 左右两种工具栏位置下拖动主阅读器与右侧预览的滚动条；(4) 连续模式用滚动条一路拖到底/顶、滚轮连甩，确认不再空白。
- 状态：待用户验收

## 2026-11-27 整本显示按书设置 + 拆分出的书归入「未按命名拆分」

- 用户要求：(1) 整本是否显示要能对「选中的书」单独设置，入口和「隐藏所选」同位置，避免一开整本书总开关就冒出一堆重复卡片；**全局「整本书」开关保留**。(2) 拆分后的书应归到「未按命名拆分」（用户先写「未重命名的书」，随后明确为「未按拆分命名」）。
- **修正（同日第二轮）**：第一版做成「不显示整本」黑名单被用户否决——一旦隐藏就选不中，没法改回来；且「隐藏书籍」里的书不应再被整本/未按命名开关过滤。改成**白名单**：默认跟随全局开关，选中的书可设「一直显示整本」，卡片始终可见、随时可取消。
- **整本按书显示（白名单）**：`pdfdesk:whole-always:<书库id>` 存 base id 列表（视图偏好，localStorage，**不动 `shelves.json` 的 hidden 结构**）。选中后工具条「隐藏所选」右侧出现「一直显示整本 / 取消一直显示」：整本卡与分片卡经 `wholeFormKey`（整本取自身 id、分片取 `dir`，都去掉 `@hash` 后缀）归一到同一个 key；选中里没有整本 PDF 的书时按钮置灰。全局「整本书显示/隐藏」只管未被固定的整本（`(n)` 也按这个数）；切换行在有固定项时多一个「取消固定整本（{n}）」全部清除。
- **隐藏书籍页永远全部显示**：`group === 'hidden'` 时跳过整本/未按命名两个过滤器，并隐藏那排开关（那一页是你主动去的地方，放进去的书不该再被开关藏掉）。
- **拆分后归入未按命名拆分**：`src/host/index-source.js` 新增占位标题判定 `UNRENAMED_TITLE = /^(?:未命名|untitled)$/i`；一本分片书的每一章都还是占位标题 ⇒ `loose: true`（`bookRow` 接受书级 loose），即落入书架默认隐藏的「未按命名拆分」开关。章名有真实标题、或只改了一部分的书不受影响；切分工具按书签命名（`--bookmarks`）的书也照旧正常显示。
- 验证（exit 0）：`shelf-whole-form-test` 23 条（白名单/隐藏页/置灰，含 pin、hidden-bypass、toggle、reset、disable 五条反证）、`split-unrenamed-loose-test` 9 条（真实 PDF 目录：全占位/已命名/只改一章/英文 Untitled）；`loose-books-test`、`empty-library-test`、`ghost-book-test`、`library-tips-test`、`split-*`、`host-test`、`routes-e2e-test`、连续模式三套、`check-keys`、`check-deps`、`node --check` client/index/全部 host 模块全过。
- 另：真实书库现有 4 本分片书因章名仍是「未命名」被判为未按命名（Abstract 23、Asymptotic 11、do Carmo 8、ppt 22——ppt 原本就是 loose）；10:42/10:44 的「移除整本」已只移动 `.pdf` 到回收站、分片目录保留，说明上一轮 Host 修复在真机生效。
- 未覆盖 / 需用户手测：重启 DSH 后——(1) 选中一本已拆分的书（或它的整本卡）→「一直显示整本」→ 关掉整本书总开关，确认它仍在；再选中它「取消一直显示」后随总开关消失；「取消固定整本（n）」清空。(2) 打开「隐藏书籍」，确认里面的整本/未命名书都显示、没有被开关藏掉。(3) 新拆一本书，确认它出现在「未按命名拆分」开关下而不是主书架；在拆分会话里改名后回到主书架。
- 状态：待用户验收

## 2026-11-27 拆分面板页码跳转 + 加入书架 + 书架内添加 PDF

- 用户要求：(1) 拆分面板右侧「拆分结果」那行的页码可点击跳转（先问效果，用户选：滚到该页 + 短暂高亮）；(2) 选中书后除「新建书架」外还能「加入书架」；(3) 自定义书架内部也要有外面书库页同款「添加 PDF」（用户选：顶部常驻开关，按书架记忆；书架内导入自动加入当前书架）。
- **拆分面板页码跳转**：`SplitDialog` 新增 `jumpToPage(number)`——夹到 1..总页数，按 `attach` 里的画布节点算偏移，`scrollTo({ behavior: 'smooth' })` 到该页顶部，`flashPage` 状态让该页描边 1.2 秒后自动消失；时长期间再点会重置计时器，卸载时清计时器。范围行改成「每个页码一个按钮」（单页范围也只有一个按钮），`splitJumpTo` 提供 `跳到第 {n} 页` 的无障碍标题。不动任何切点。
- **加入书架**：新增 `ShelfPickDialog`（复用 `md-picker-list/md-picker-row`），列出现有书架及各自本数；选中工具条「新建书架」右侧加「加入书架」，没有书架时置灰并在标题说明，隐藏书籍页不提供。加入时按 `Set` 去重，只把真正新增的书报进提示，已全在书架里则提示「已经有这些书」，成功后关闭选择器并清空选中。
- **书架内添加 PDF**：`Shelf.importTile` 从「仅主书架」改为「主书架，或开关打开的自定义书架」；顶部面包屑行右端加常驻开关「添加 PDF：开/关」（`aria-pressed`，按书架记忆，存 `pdfdesk:shelf-add-pdf-off:<书库id>`）；空书架的空态也给同一个添加入口。书架内导入成功后把新书 id（文件 stem）并入当前书架（文件本身仍落 `整本\`），重复导入同一个文件也会并入；隐藏书籍页不提供该卡片。
- 验证（exit 0）：新增 `split-jump-test`（16 条 + 3 条反证）、`shelf-add-to-test`（16 条 + 3 条反证）、`shelf-add-pdf-test`（18 条 + 3 条反证）；`split-ui`、`split-result-*`、`shelf-whole-form`、`split-unrenamed-loose`、`loose-books`、`empty-library`、`ghost-book`、`library-tips`、`import-split-memory`、`rail-scrollbar`、连续模式三套、`host-test`、`routes-e2e-test`、`check-keys`、`check-deps`、`node --check` client/index/全部 host 模块全过。
- 未覆盖 / 需用户手测：重启 DSH 后——(1) 打开拆分面板，点右侧范围内的页码（含首尾页）确认滚到该页并亮一下、切点未变；(2) 选中几本书 →「加入书架」→ 选一个书架，确认书进入且计数正确，再加一次提示「已经有这些书」；(3) 进入「高等代数学」，顶部开关关掉后加号卡片消失、重进仍记住，打开后恢复；在书架内导入一本 PDF，确认它自动出现在当前书架，同时 整本\ 里有文件。
- 状态：待用户验收

## 2026-11-27 上线前检查：导入功能归属、版权声明、外部依赖声明

- 用户提问：(1) 导入 PDF 的功能是不是只有本机有；(2) 可以上线，但要补版权风险声明；(3) 检查有没有需要单独安装却没声明、没下载渠道的东西（如 Typst）。
- **导入功能归属**：是正式功能，不是本机独有。v1.5.0 的「导入导出统一」与 v1.5.1 已发布：`git show v1.5.1:src/host/imports.js` 存在，`git show v1.5.1:client.js` 有 `importTileTitle` 与 `/pdfdesk/imports`；npm `dsh-pdf-workbench@1.5.1` 已上线（370 个文件）。本机多出来的是工作树里**尚未提交**的这批改进（疑问截图、拆分结果对话框、整本固定、拆分跳转、加入书架、书架内添加 PDF、导入拆分记忆等），它们还没有发版。
- **版权声明（新增，三处）**：README 新增「使用与版权声明」（不提供/不内置/不分发书籍内容、不破解 DRM、只处理有权文件、结果仅个人学习、PDF 仅本机处理、MIT 与侵权联系渠道）；`安装与分发.md` 新增「版权」一节（分发包不含书籍 PDF、演示截图也要用自有文件、Typst 不随包分发）；插件内「设置 → 关于」与书库「使用提示」各一条中英文声明（`aboutCopyright` / `tipsCopyright`）。
- **依赖声明与渠道盘点**：
  - **PyMuPDF（fitz）**：拆分/取文字/栅格化/叠加都依赖，此前**完全没声明**。README 环境要求与 `安装与分发.md` 新增 `py -m pip install pymupdf pillow` 与 PyMuPDF 安装链接；环境检查与设置页提示补上包名（中英）。
  - **Pillow**：此前只在安装文档给 `pdfkit.py` 提过一句；现在与 PyMuPDF 一起声明，覆盖 `crop_question.py`。
  - **缺包提示归到 Host 一处**：`routes.js` 新增 `dependencyHint()`，`runTool` / `toolOutput` 把 `ModuleNotFoundError: No module named 'fitz' / 'PIL'` 映射成「请运行 py -m pip install …」；`toolOutput` 遇到缺包不再重试解释器后误报「没有可用的 Python」。
  - 已确认有声明和渠道的：Python（python.org）、Typst（设置页一键下载，`TYPST_VERSION` 0.15.1 + SHA-256 + GitHub Release；文档另给 `winget install --id Typst.Typst`）、TeX Live（可选，tug.org；装了 Typst 就不需要）、PowerPoint/LibreOffice（补了 libreoffice.org 链接）、手写字体（插件内下载/导入）、pdf.js / KaTeX / rough.js / 两款 OFL 字体（随包，`vendor/` 与 README 致谢）。
  - **未做**：没有在启动时真正探测 PyMuPDF/Pillow 是否可导入（环境检查仍只判断 python 是否存在）；缺包时由工具执行路径给出 pip 提示。若要做成「环境页显示 PyMuPDF ✓/✗」需要一次 Python 子进程探测，留待下一轮。
- 验证（exit 0）：新增 `missing-package-hint-test` 9 条（真实 `dependencyHint` 映射 + 两处接线 + 单一来源）、`copyright-and-deps-test` 19 条（三处声明、pip 命令与链接、Typst/Python/TeX/LibreOffice 渠道；含 3 条反证）；`check-keys`、`check-deps`、`split-*`、`shelf-*`、连续模式三套、`host-test`、`routes-e2e-test`、`node --check` client/index/全部 host 模块全过。
- 发布边界：版本号、tag、push、npm、市场条目仍归 ci；本轮没有改版本号，也没有提交。
- 状态：待用户验收

## 2026-11-27 环境安装项在选择书库页与设置里齐备

- 用户追问：需要安装的环境和东西，选择书库页与设置菜单都要有。此前状态：设置 → 环境已有 Python / Typst（一键安装）/ TeX / API Key；选择书库页的「环境」卡片只有 Python / TeX 两行状态与下载入口，**两处都没有 PyMuPDF + Pillow**，选择书库页也没有 Typst 状态与安装入口。
- 改动（`client.js`）：新增共享组件 `PipPackagesRow()`——显示 `py -m pip install pymupdf pillow`、一句用途说明（拆分/翻译/导出需要，只阅读不需要 Python）与「复制命令」按钮（复制失败时把命令直接显示出来）。两处入口都渲染它：
  - **选择书库页**（LibrariesPage 的「环境」卡片）：pip 行 + `EngineStatusRow`（Typst 状态与一键下载）+ 原有 Python / TeX 下载按钮；
  - **设置 → 环境**：pip 行插在 Python 与 TeX 之间，其余（Typst 一键安装、检查入口）不变。
- 文案：中英各 5 条（`envPipPackages` / `envPipHint` / `envPipCommand` / `envPipCopy` / `envPipCopied`）。
- 验证（exit 0）：新增 `env-surfaces-test` 12 条（两处入口、共享行、复制回退、Typst 一键安装；含 library/settings/copy 三条反证）；`copyright-and-deps-test`、`missing-package-hint-test`、`split-*`、`shelf-*`、连续模式三套、`host-test`、`routes-e2e-test`、`check-keys`、`check-deps`、`node --check` client/index/全部 host 模块全过。
- 未覆盖 / 需用户手测：重启 DSH 后——(1) 选择书库页（没有书库或点「书库」面包屑）的「环境」卡片能看到 Python、PyMuPDF+Pillow 命令与复制、Typst 状态与「下载 Typst」、TeX 入口；(2) 设置 → 环境同样有 PyMuPDF+Pillow 行，「开始前检查」仍可重开。
- 状态：待用户验收

## 2026-11-27 书架隐藏 / 拆分回当前书架 / 拆分会话 + 勾选记忆

- 用户直接指令：自定义书架内的书无法隐藏（近世代数基础可复现）；拆分后的书不自动进入当前书架（傅里叶分析）；拆分结果框的「打开拆分后的书」没有作用，功能应改为打开最初的「拆分文件」对话；这里需要记忆功能。用户拍板：**记忆 = 记住结果框两个勾选**；**没有拆分会话时自动新建**；**本轮只修 bug，重构下一轮**。
- 根因：
  - 自定义书架分支只按 `activeShelf.books` 取书，没有减去 `shelves.json.hidden`；隐藏只写 `hidden`，不把书移出书架，所以书继续显示。
  - `/pdfdesk/split` 只写 `分片/<书id>/`，不写书架；拆分书 id 由拆分文件名截断产生（傅里叶为 `FourierAnalysis(T.W.Körner)(z-library.sk`），与整本 id 不同；且章节全为「未命名」使书为 `loose`，即使加入书架也会被「未按命名拆分」开关藏掉。
  - 结果框用旧的 `books` 快照找拆分书，`reload()` 不等刷新完成；刷新未完成时 target 为空，点击只关闭弹窗。
  - 两个勾选是 `useState` 默认值，没有存储。
- 改动（只 `client.js`）：
  - 自定义书架成员先排除 hidden；自定义/隐藏书架作为「显式位置」不再被整本/未命名开关二次过滤（否则刚加入的拆分书仍不可见）；集合卡计数同步排除 hidden。
  - `reload()` 返回刷新后的书目（`reloadWaiters`）；拆分完成后等刷新，按 `dir === 整本书id && whole !== true` 找新书并 `await saveShelfGroups` 加入拆分时所在的自定义书架。
  - `SplitResultDialog` 第二项改为「打开拆分会话」，调用 `startSplitSession()`；没有会话时自动新建；失败留在弹窗提示。`startSplitSession` 返回 boolean，`saveShelfGroups` 返回写入 Promise。
  - 新增 `pdfdesk:split-result` 记忆两个勾选；点「完成」写入，「以后再说」不写。默认「不移除整本 / 打开拆分会话」。
- 文案：zh/en 改写 `splitResultOpenAsk` / `splitResultOpenHint`，新增 `splitResultOpenFailed`；locale 键结构不变。
- 契约：无新路由、无 `shelves.json` schema 变化、无 `package.json`/接口变化；新增 localStorage 键。
- 验证（全部 exit 0）：`node --check client.js` / `index.js` / `src/host/*.js`；`check-keys`；`check-deps`（531 条）；`host-test`；新增 `shelf-visibility-test`、`split-result-flow-test`；更新并跑 `split-result-ui-test`、`shelf-whole-form-test`、`shelf-add-pdf-test`、`shelf-add-to-test`、`split-ui-test`、`split-session-test`、`split-jump-test`、`split-unrenamed-loose-test`、`loose-books-test`、`empty-library-test`、`ghost-book-test`、`library-tips-test`、`import-split-memory-test`、`split-result-route-test`、`split-import-test`、`split-entries-test`、`split-catalog-flow-test`。
- 未覆盖 / 需手测：`split-active-library-test`、`split-after-import-test` 在本会话沙箱内 `spawn EPERM`（真实 Python 拆分未跑）；重启 DSH 后手测——自定义书架隐藏/取消隐藏、傅里叶拆分后自动出现在「数学分析」、结果框打开/新建拆分会话、两个勾选记忆。
- 状态：待用户验收

## 当前队列（2026-11-28 · 拆分预览 / 荧光笔 / 书架嵌套 / 不重要缓存）

> 用户 2026-11-28 直接指令（三项一起提出）；开工前已出计划并由用户确认：建子书架＝**移入**，荧光笔＝**笔面板里切「笔/荧光笔」+ 四色**。
> 同日追加：预览大图按用户选择**保留缓存 + 一键清理**（方案 B），并入设置里的「不重要缓存」；两条历史失败按现状修正测试断言。
> 本表由 programmer 落盘，范围与验收以本节为准；改动记录见 `docs/changes/next.md`。
> 客户端不能热更：四项都要**重启 DSH** 后手测。

| ID | 优先级 | 执行单元 | 影响范围 | 验收来源 | 依赖/备注 | 承接 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-20261128-01 | P1 | 拆分面板双击缩略图整页预览（低质量扫描件看清章号） | `client.js`（`SplitPagePreview` / `SplitDialog`）、`src/host/routes.js`、`tools/pdf_thumbs.py` | 用户 2026-11-28 指令 1 | 宽度上限 480→1600；Host 单页 1200、pdf.js 回退大画布；Esc 先关预览；拆点与滚动位置不变 | programmer | 完成（v1.6.0 已发布） |
| T-20261128-02 | P1 | 笔的荧光笔形态（主阅读器 + 右栏预览） | `client.js`（`PenStyleControls`、两栏笔设置、`createInkGestures`） | 用户 2026-11-28 指令 2；用户确认四色 + 笔型切换 | 22px、38% 透明、四色；笔画多一个可选 `opacity`，旧数据按 1 渲染；不新增工具条按钮 | programmer | 完成（v1.6.0 已发布） |
| T-20261128-03 | P1 | 书架内新建书架＝嵌套：选中的书移入新书架 | `client.js`（`shelfCreateFromSelection` / `createShelf`） | 用户 2026-11-28 指令 3；用户确认「移入新书架」 | 只动当前书架；其它书架保留同一本书；子书架可继续往下嵌套 | programmer | 完成（v1.6.0 已发布） |
| T-20261128-04 | P1 | 预览大图并入「不重要缓存」一键清理，存储面板显示缩略图占用 | `client.js`、`src/host/routes.js`、`src/host/storage.js` | 用户 2026-11-28 追加指令（方案 B：保留缓存 + 清理按钮） | 不改路由形状；`clear-translation-cache` 多清 `thumbs/` 并在响应里单列 `thumbs`；不做定时静默删除（DEC-0014） | programmer | 完成（v1.6.0 已发布） |
| T-20261128-05 | P2 | 纠正两条历史失败：`t08-test` 断言写在 pointerdown、`ui-polish-test` 断言过期 | 仓库外 `.dsh-scratch/t08-test.mjs`、`ui-polish-test.mjs` | 用户 2026-11-28「已知bug可以先修一下」 | 只改测试断言，不改产品行为；`t08` 实际点击选中、拖拽新建，与主阅读器一致 | programmer | 完成（v1.6.0 已发布） |

**T-20261128-01 证据（2026-11-28）**

- 根因：`SplitDialog` 的缩略图框只有剪刀按钮有点击，页面本身没有打开动作；Host 缩略图宽度上限写死 480（`routes.js` `THUMB_WIDTH_MAX`、`pdf_thumbs.py` `WIDTH_MAX`），240px 的格子对低质量扫描件就是看不清章号。
- 修：新增 `SplitPagePreview` 与 `SPLIT_PREVIEW_WIDTH = 1200`；双击页框打开大图，Host 走 `/pdfdesk/pdf-layout` 单页请求并用响应里的 `width`/`v` 拼图（旧 Host 截到 480 也能显示）；pdf.js 回退按 window×DPR 画大画布；Esc 逐层关闭（`previewPageRef`），点暗处关闭。上限 480→1600。
- 验证：`node --check client.js` exit 0；`split-page-preview-test.mjs` 21 条 exit 0；`split-thumbs-route-test.mjs`（含 1600/1200 新用例）、`split-thumbs-client-test.mjs`、`split-ui-test.mjs` exit 0；`py -3 tools/pdf_thumbs.py … 1200 1 1` exit 0（478 ms、166 KB）。
- 待手测：重启 → 拆分面板 → 双击缩略图 → 大图可读；Esc 只关大图；拆点/滚动位置不变。

**T-20261128-02 证据（2026-11-28）**

- 根因：`createInkGestures` 只写 `color/width`，两栏笔面板只有 1–10px 实心色；没有半透明高亮这种「很粗的标记笔」。
- 修：新增 `HIGHLIGHT_COLORS/HIGHLIGHT_WIDTH/HIGHLIGHT_OPACITY` 与共用 `PenStyleControls`；笔画新增可选 `opacity`，`flat` 提交时去掉压感（避免高亮带忽粗忽细）；两栏草稿与 `InkMarks` 按 `opacity` 渲染，旧笔画缺省 1；选中面板粗细上限 10→40。
- 验证：`ink-gestures-test.mjs` exit 0；新增 `highlight-pen-test.mjs` 21 条 exit 0（含负向对照）；`note-style-test`、`column-ink-test`、`history-test`、`canvas-test`、`u1-test`、`t05`、`t07`、`t10`、`page-store-test` exit 0。
- 待手测：主阅读器与右栏各一次：笔面板切「荧光笔」→ 选颜色 → 整行拖一条；切回「笔」恢复原设置；刷新后荧光笔仍在。

**T-20261128-03 证据（2026-11-28）**

- 根因：`createShelf` 新建时只做 `books: [...selected]` 的复制，从不从当前书架移除；主书架之所以看起来「消失」，是因为主视图用 `!shelved` 过滤，两处语义不一致。
- 修：新增纯函数 `shelfCreateFromSelection`，`createShelf` 改走它；当前是真实书架时把选中的书从该书架移入新书架（其它书架不动），`parent` 仍按原规则记录；嵌套创建提示「已加入「X」：N 本」。
- 验证：新增 `shelf-nested-create-test.mjs` 25 条 exit 0（含负向对照：根/嵌套/再嵌套/隐藏/去重、父书架只交出选中的书、其它书架不动）；`shelf-add-to-test`、`shelf-visibility-test`、`shelf-view-single-source-test`、`split-completion-test` exit 0。
- 待手测：书架 → 选中几本 → 新建书架 → 原书架不再列出这几本、新子书架出现；子书架里再建一层仍可嵌套；其它书架里的同一本书不受影响。

**T-20261128-04 证据（2026-11-28，用户选方案 B）**

- 现状：预览大图（1200px）与网格缩略图（240px）都在 `~/.dsh/pdfdesk/thumbs/<key>/<宽>/`，只能靠手动找目录清；设置里的存储面板也不统计它。
- 修：`measureStorage` 新增 `thumbs` 分区（12 区，`safe: 'rebuild'`）；`POST /pdfdesk/clear-translation-cache` 在清翻译缓存后逐个删除 `thumbs/<key>/`，响应新增 `thumbs` 计数（`removed`/`skipped` 语义不变）；设置 → 数据里该区块改名「不重要缓存」，按钮「清理不重要缓存」，确认/说明写明翻译缓存 + 缩略图/预览大图；存储面板新增「拆分缩略图与预览大图」。按用户选择保留缓存，**不做定时静默删除**（DEC-0014）。
- 验证：新增 `unimportant-cache-test.mjs` 21 条 exit 0（分区统计、一次清两类缓存、`thumbs` 计数、幂等、GET 405、文案/接线）；`storage-test.mjs` 46 条 exit 0（11→12 区）；`retention-test`、`translation-cache-test`、`translate-ai-route-test`、`host-test` exit 0；`check-keys`/`check-deps` exit 0。
- 代价：清空后第一次打开拆分面板要重新渲染首屏缩略图（约几百毫秒）；清理时若有渲染在跑，可能写回少量文件，再点一次即可。
- 待手测：设置 → 数据 → 看到「拆分缩略图与预览大图」占用 → 点「清理不重要缓存」→ 确认/结果提示正确 → 再开拆分面板，缩略图重建、双击预览仍可用。

**T-20261128-05 证据（2026-11-28，两条历史失败）**

- `t08-test.mjs`：不是产品 bug。断言写在 `pointerdown`，要求「按下即选中 + sideDrag」；实际实现（与主阅读器一致）是「按下保留草稿，松开未移动才选中旧框」。这样在旧框上直接拖拽仍能新建框。已把断言改成两段：按下有草稿/未选中；松开后选中 index 0、kind text、不开编辑器。
- `ui-polish-test.mjs`：两条断言过期——`.md-reader-modes` 的 gap 自 `695cc00` 起是 4px（断言写 2px）；`bookOverwriteConfirm` 键已随旧导入弹窗移除，只保留 `dataOverwriteConfirm`。已改成现状。
- 验证：`t08-test.mjs` exit 0（全部场景）、`ui-polish-test.mjs` exit 0；产品代码未改。
- 事故备注：修 `storage-test.mjs` 时用 PowerShell 读写中文 UTF-8 导致该文件编码损坏；已按原逻辑重建（46 条断言，未放宽），事故只影响仓库外测试脚本，未触碰仓库文件或用户数据。

## 当前队列（2026-11-28 · 反色阅读）

> 用户 2026-11-28 拍板（方案见工作区根《PDF阅读插件-反色阅读-方案-2026-11-28.md》）：跟随 DSH 深色主题自动反色 + 手动覆盖；`invert(1) hue-rotate(180deg)`；黑/白合并成一个随模式切换的「单色墨」；普通模式框保持品牌蓝、反色模式框变白；白色只用于单色墨与形状填充，荧光笔不加白。
> 本批只改 `client.js`（样式 + 渲染 + 本机偏好），不碰 Host / 路由 / 存储 schema / `shelves.json`；客户端不能热更，需重启 DSH 手测。不升版本、不提交、不发布。

| ID | 优先级 | 执行单元 | 影响范围 | 验收来源 | 依赖/备注 | 承接 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-20261128-06 | P1 | 反色阅读（夜间黑纸）：跟随深色主题 + 手动覆盖；只反纸面；单色墨；框/把手/输入框适配 | `client.js`（`usePaperMode`、`PaperInvertProvider`、`paperInkColor`/palette、主阅读器/右栏/设置入口、CSS） | 用户 2026-11-28 拍板 + 方案 §1 验收口径 | 不升版本；重启 DSH 手测；方案要求 6 张真机截图 | programmer | 完成（v1.6.0 已发布） |

**T-20261128-06 证据（2026-11-28）**

- 根因/需求：阅读器没有纸面显示模式；DSH 深色主题下 PDF 仍是白纸，夜间刺眼；标注墨色在反色后需要自动对比，旧黑色笔迹不能消失。
- 实现：新增 `pdfdesk:paper-mode`（`auto`/`on`/`off`）+ `usePaperMode()`；`body[data-ds-dark-theme]` 存在性 + MutationObserver + `storage`/CustomEvent 同步；主阅读器/右栏根节点 `data-paper`，CSS 只对 `.md-reader-canvas`、`.md-overlay-text`、`.md-mask-page-image` 加 `invert(1) hue-rotate(180deg)`；`paperInkColor`/`monoInk`/`isMonoInk`/`penPalette`/`notePalette` 映射；固定色改 `--annot-ui-ink/bg/halo`；顶栏 ☾/☀ 按钮、右栏 `⋯` 菜单行、设置三档；中英 6 条文案。
- 验证（exit 0）：`node --check client.js` / `index.js` / `src/host/*.js`；`check-keys`；`check-deps`（532 条）；`host-test`；新增 `paper-invert-test` 48 条（含 3 条负向对照）；`note-style`、`column-ink`、`notes`、`ink-gestures`、`highlight-pen`、`history`、`canvas`、`u1`、`t05`、`t07`、`t08`、`t10`、`pen-cursor`、`ui-polish`；`split-page-preview`、`split-thumbs-*`、`split-ui`、`split-jump`、`split-entries`、`split-completion`、`split-*-flow`、`storage`、`unimportant-cache`、`release-guard`、`change-record`。
- 测试注入：`column-ink-test` / `notes-test` 因新增 `usePaperInvert`/`paperInkColor`/`notePalette`/`isMonoInk` 依赖，只更新测试桩；未改产品行为。`split-active-library-test`、`split-after-import-test` 本轮尝试时在真实拆分接口处因沙箱 `spawn EPERM` 失败（Python 拆分进程，非反色代码）。
- 未覆盖 / 需手测：重启 DSH 后——(1) 深色主题自动反色、顶栏按钮覆盖、设置三档、刷新/重启保持、右栏同步；(2) 单页/连续/双语/译文/叠加/右栏；(3) 纯文字/彩色插图/扫描页、200%/300% 缩放；(4) 旧黑/旧彩色/新单色/荧光笔/形状描边与填充/文本笔记占位符与光标；(5) marquee/文字框/遮罩框/问号框/把手/选中描边；(6) 拆分面板/封面/导出不反色。未做真机截图（重启会结束当前会话）。

## 当前队列（2026-11-28 · 阅读交互四项）

> 用户 2026-11-28 直接指令；已在对话确认：荧光笔＝笔迹粗细 12–40px、对比度＝反色按钮旁弹层 100–200%、触控板＝主阅读器与右栏都支持。
> 本批只改 `client.js` + 文档；客户端不能热更，需重启 DSH 手测；不升版本、不提交、不发布。

| ID | 优先级 | 执行单元 | 影响范围 | 验收来源 | 依赖/备注 | 承接 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-20261128-07 | P1 | 荧光笔笔迹粗细可调（12–40px，默认 22，两栏共用本机记忆） | `client.js`：`HIGHLIGHT_WIDTH_*`、`useHighlightWidth`、`PenStyleControls`、两栏 marker | 用户 2026-11-28 指令 + 对话确认 | 旧笔画不迁移；滑杆只在荧光笔形态出现 | programmer | 完成（v1.6.0 已发布） |
| T-20261128-08 | P1 | 左右工具条悬停设置面板在指针移入时不再消失 | `client.js`：`keepRailPanel`/`keepSidePanel`、面板 `onPointerEnter`、关闭宽限、面板间距/桥接 CSS | 用户 2026-11-28 报告「悬停菜单会消失」 | 不新增按钮；主阅读器与右栏一致 | programmer | 完成（v1.6.0 已发布） |
| T-20261128-09 | P1 | 章节对比度 100–200%（依赖反色、按书+章记忆、两栏同步） | `client.js`：`useChapterContrast`、`--paper-contrast`、滤镜 `contrast()`、主阅读器弹层、右栏 `⋯` 子菜单 | 用户 2026-11-28 指令 + 对话确认 | 只反色纸面生效；普通模式不变；不碰 Host | programmer | 已关闭（用户 2026-11-28 判定「对比度效果不好」，由 T-20261128-16 文字增强整体替换；旧实现已删除，不留两套） |
| T-20261128-10 | P1 | 触控板双指捏合缩放（主阅读器 + 右栏） | `client.js`：两处 `wheel` 监听、`onZoomBy`、侧栏 `zoomTo` | 用户 2026-11-28 指令 + 对话确认 | 普通双指滚动不变；主阅读器双栏不拦截 | programmer | 完成（v1.6.0 已发布） |

**T-20261128-07…10 证据（2026-11-28）**

- 荧光笔：新增 `pdfdesk:highlight-width`（12–40，默认 22）+ `useHighlightWidth`，两栏共用；`PenStyleControls` 荧光笔分支增加滑杆与 `annotHighlightSize`；旧笔画宽度不变。`highlight-pen-test` 25 条 exit 0。
- 悬停：面板 `onPointerEnter` 取消关闭；关闭宽限 600/800ms；`right 48→34px`、`left 28→32px` 把空隙压到 2px。`rail-hover-test` 9 条 exit 0；`note-style-test` 旧 220ms 断言按新需求更新后 exit 0。
- 对比度：`pdfdesk:contrast:<book>:<code>` + `useChapterContrast`；主阅读器 `▾` 弹层 100–200%（step 5，重置），右栏 `⋯` 五档；CSS 只对三层纸面加 `contrast(var(--paper-contrast, 1))`；普通模式无滤镜。`chapter-contrast-test` 15 条 exit 0。
- 触控板：主阅读器 `props.paneRef`、右栏 `sideRoot` 原生 `wheel`（`passive:false`，`ctrlKey` + `.md-reader-stage`）；`exp(-delta*0.0025)` 单次 0.67–1.5；主阅读器走 `onZoomBy: readerZoom`，右栏走 `zoomTo`。`trackpad-zoom-test` 11 条 exit 0。
- 回归：`paper-invert`、`column-ink`、`notes`、`ink-gestures`、`history`、`canvas`、`u1`、`t05`、`t07`、`t08`、`t10`、`pen-cursor`、`ui-polish`、`split-page-preview`、`split-thumbs-client`、`split-ui`、`split-jump`、`storage`、`unimportant-cache`、`release-guard` 等 25 个脚本 exit 0；`check-keys`/`check-deps` exit 0。
- 环境/历史失败同前：`split-active-library`/`split-after-import` 的 `spawn EPERM`；`overlay-text-layer-dom` 的 Edge 调试端口；`side-page-drift`、`reading-memory`、`dual-overlay`、`copyright-and-deps` 的改动前已有失败。
- 待手测：重启 DSH 后——荧光笔 12/22/40 + 重启记忆；左右工具条移入面板不消失、移出 0.6–0.8s 关闭；反色章节 100/150/200%、切章/重启记忆、右栏同步；触控板捏合两栏缩放、普通滚动不变、Ctrl+滚轮缩放、双栏不缩放。未做真机截图（重启会结束当前会话）。

## 当前队列（2026-11-28 · 阅读器 UI 三项）

> 用户 2026-11-28 指令「先解决 UI 问题」；范围按工作区根《PDF阅读插件-UI与文字增强-方案-2026-11-28.md》§1 取阅读器这一屏三项，用户在对话中选定：先做 UI-1/2/3，书架面包屑 UI-4 下一轮；窄宽度允许隐藏 `⇤` 首页 / `适应宽度` / 缩放百分比以保顶栏单行。
> 本批只改 `client.js` + 文档；客户端不能热更，需重启 DSH 手测；不升版本、不提交、不发布。

| ID | 优先级 | 执行单元 | 影响范围 | 验收来源 | 依赖/备注 | 承接 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-20261128-11 | P1 | 竖排工具条框与图标对齐（左右栏 + 右栏预览） | `client.js`：`.md-rail` 的 `flex: none`、`.md-rail-wrap` 44px、面板 46px、三条工具栏 z-index 41 | 用户 2026-11-28「右栏竖排工具条框/图标错位」+ 方案 §1 UI-1 | 不新增按钮；滚动条车道仍留 20px；悬停面板仍在框边 2px | programmer | 完成（v1.6.0 已发布） |
| T-20261128-12 | P1 | 窄宽度顶栏保单行（书名让位；必要时收起首页/适应宽度/缩放百分比） | `client.js`：`md-reader-first`/`md-reader-fit`、`pdfdesk-reader` 容器查询、`.md-reader-titles` flex | 用户 2026-11-28「顶部变两行挤压阅读区」+ 方案 §1 UI-2 + 对话确认可隐藏 | Home/F 仍可达；双栏 `md-hidden` 不变；不新增按钮 | programmer | 完成（v1.6.0 已发布） |
| T-20261128-13 | P1 | 右侧预览新增反色按钮（与主阅读器同步） | `client.js`：`.md-side-bar` 的 `md-side-paper` + 其 CSS | 用户 2026-11-28「右栏预览缺反色按钮」+ 方案 §1 UI-3 | 复用 `paperInvert`/`paperInvertHint`，不新增 locale 键；不新增依赖 | programmer | 完成（v1.6.0 已发布） |

**T-20261128-11…13 证据（2026-11-28）**

- 根因：`.md-rail` 是被 30px `.md-rail-wrap` 压缩的 flex 项——44px 的框被压到 30px，34px 按钮溢出框外、图标相对框中心右偏；`.md-reader-bar` / `.md-side-bar` 没有层级，`md-rail-wrap`（`top:0;bottom:0;z-index:40`）盖住顶栏右侧的 `×` 与反色按钮（静态画廊 `elementFromPoint` 实测落在 `md-rail-wrap`）；顶栏换行是 flex 断行按 `.md-reader-titles` 的 260px basis 算的，标题本可收缩却被提前挤到第二行。
- 修法：`.md-rail { flex: none }`；wrap 30→44、面板 34/32→46；三条工具栏 z-index 41；`.md-reader` 加容器查询 `pdfdesk-reader`（≤740px 隐藏 `⇤`/`适应宽度`/百分比）；`.md-reader-titles` basis 0；右栏新增 `md-side-paper` 28px 按钮。
- 证据：`reader-ui-geometry-test` 22 条 exit 0（4 条负向对照）；静态画廊（真实 `client.js` CSS）全宽 1280/1600/1920 × 明暗 6 张 + 分栏 6 张——框宽 44、框右缘距边 20、`×` 命中自身、全宽顶栏均单行、分栏 619px 时顶栏仍单行；`issue6-rail-hit-test` 12 个宽度命中测试 exit 0，负向对照 11/12 复现旧 bug。
- 回归：`rail-hover`、`issue6-side-bar-rail-clearance`、`ui-polish`、`t05`、`t07`、`t08`、`t10`、`u1`、`note-style`、`layout`、`paper-invert`、`trackpad-zoom`、`highlight-pen`、`chapter-contrast`、`split-ui`、`split-page-preview`、`unimportant-cache`、`storage`（46）、`release-guard`、`change-record`、`host-test` 均 exit 0；`check-keys` / `check-deps` exit 0。
- 待手测：重启 DSH 后——① 左/右竖排框完整、图标居中、不压滚动条、鼠标移入设置面板不消失；② 1280 全宽与打开右侧预览时顶栏单行、`×` 可点、Home/F 仍生效；③ 右栏 ☾ 与主阅读器同步、重启后保持。
- 未做/风险：书架面包屑 UI-4 留待下一轮；fit 宽度下竖排框仍会压住纸右缘约 40px（既有 `fitScale` 用 `clientWidth - 48`，没算竖排车道；改前约 33px），若要「框绝不上纸」需下一轮改 fit 计算（会使适应宽度下的页面窄 44px，需用户拍板）。

## 当前队列（2026-11-28 · 竖排条让位 + 书架面包屑）

> 用户 2026-11-28 手测反馈「PDF 页顶部工具栏将工具条遮挡了，其它没有问题」（T-14），并指令「接着做面包屑」（T-15，方案 §1 UI-4）。
> 只改 `client.js` + 文档；客户端不能热更，需重启 DSH 手测；不升版本、不提交、不发布。

| ID | 优先级 | 执行单元 | 影响范围 | 验收来源 | 依赖/备注 | 承接 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-20261128-14 | P1 | 竖排工具条从顶栏/工具行下方开始（主阅读器 + 右栏预览） | `client.js`：两处 `ResizeObserver`、`--pdf-reader-rail-top`/`--pdf-side-rail-top`、`.md-rail` 的 `max-height`/`scrollbar-width` | 用户 2026-11-28 手测反馈 | 工具行折行/收起都成立；保留工具栏 z-index 41 兜底；不新增按钮 | programmer | 完成（v1.6.0 已发布） |
| T-20261128-15 | P1 | 面包屑显示多级书架链路（点祖先返回；hidden 一级；父缺失/成环截断） | `client.js`：`shelfChain`、`crumbChain.map`、`.md-crumb-ancestor`/`.md-crumbs` CSS | 用户 2026-11-28 指令 + 方案 §1 UI-4 | 只读 `shelves[].parent`，不改 schema/路由；长名省略、窄屏换行 | programmer | 完成（v1.6.0 已发布） |

**T-20261128-14…15 证据（2026-11-28）**

- T-14 根因：上一轮把顶栏/工具行抬到竖排条之上后，竖排条仍在阅读器里垂直居中（`top:0`），工具行折行时条顶钻到工具栏下面。修法：`ReaderView`/`SidePdfView` 用 `ResizeObserver` 把工具栏高度写进 CSS 变量，`.md-rail-wrap`/`.md-side-rail-wrap` 的 `top` 跟随；`.md-rail` 高度上限改为车道高度并隐藏内部滚动条。画廊量测：工具行底到条顶 25.5–72.5px，全为正。
- T-15 根因：面包屑只读当前 `shelfPage.groupName`，不读 `shelves[].parent`。修法：纯函数 `shelfChain`（root→current，hidden 一级，缺失父/环/20 层截断）+ `crumbChain.map` 渲染（祖先与书页所属书架可点，`openGroup(id)`）；`.md-crumbs` 可换行、祖先名 16ch 省略。
- 验证：`shelf-breadcrumb-test` 20 条、`reader-ui-geometry-test` 28 条、`issue6-side-bar-rail-clearance` 10 条、`rail-hover` 8 条、`issue6-rail-hit-test`（无头 Edge）均 exit 0；`shelf-view-single-source`、`shelf-*`、`split-result-route`、`library-tips`、`change-record`、`release-guard`、`check-keys`/`check-deps` exit 0。
- 待手测：重启后——① 竖排条顶端不再压住顶栏/工具行（工具行收起再打开、窗口变矮也看一次）；② 3 层书架面包屑、点祖先返回、hidden 链路、书页书名后点中间层返回、悬空父/成环不白屏。
- 未做/风险：`--pdf-reader-rail-top` 首帧为 0（ResizeObserver 回调前竖排条会在旧位置一帧）；窄屏折行时分隔符可能落在行尾；未做真机截图。

## 当前队列（2026-11-28 · 文字增强 FUNC-1）

> 用户 2026-11-28 拍板：对比度效果不好，改用三档「文字增强」；对话确认：三档（柔和/清晰/黑白）、**所有档只处理近灰像素**（彩色插图保留原色）、入口＝右栏 `⋯` 子菜单 + 主阅读器 `⌄` 子栏下拉（顶栏不再放 `▾`）。
> 只改 `client.js` + 文档；客户端不能热更，需重启 DSH 手测；不升版本、不提交、不发布。

| ID | 优先级 | 执行单元 | 影响范围 | 验收来源 | 依赖/备注 | 承接 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-20261128-16 | P1 | 文字增强替换对比度（按章记忆的三档 S 曲线、只作用反色、只处理近灰像素、两栏同步） | `client.js`：`useChapterEnhance`/`ENHANCE_*`、`EnhanceDefs` SVG 滤镜、`--pdf-enh`、`⌄` 子栏下拉、右栏 `⋯` 子菜单；删除 contrast 全套 | 用户 2026-11-28 指令 + 方案 §2 FUNC-1 + 三项对话确认 | 不新增依赖/按钮；普通纸面不变；旧 `pdfdesk:contrast*` 键不读不迁移 | programmer | 完成（v1.6.0 已发布） |

**T-20261128-16 证据（2026-11-28）**

- 根因：`contrast()` 围绕中灰做线性拉伸，灰纸与灰字一起动，扫描件反而更糊。改为 SVG `feComponentTransfer` **线性增益**（柔和 1.3 / 清晰 1.9 / 黑白 2.8，黑点 0.02）：同一条滤镜里先反色 + 色相回正，再用 `|base − gray|` 色度遮罩把彩色像素排除（`feComposite out/over`），所以四个档位都不动彩色插图。
- **两轮按用户实测回调**：① 第一版（1.65/−0.33）对卓里奇类浅灰书「效果不大」——实测该页反色后纸 0.004、字核 0.427，被算成 0.414（比关闭更暗）。② 中间试过带趾部的 table 曲线，字变亮了，但用户反馈「字边缘不锐利、认不清」：趾部把抗锯齿边像素压到 0，只剩字芯。③ 最终**回退为线性 + 黑点 0.02**：边像素等比保留，只抬增益；clear 把 0.427→≈0.77、ink→1.0，纸 0→0。真实页 CSS 探针（真实插件 CSS + 真实滤镜）放大核对：字更白且边缘连续。
- 入口：主阅读器 `⌄` 子栏末尾一个紧凑下拉（4 档；未反色时禁用并提示「反色后生效」）；右栏 `⋯` 新增「文字增强」子菜单（同样 4 档、反色门控、勾选当前档）。顶栏对比度 `▾`、弹层、右栏对比度子菜单、`useChapterContrast`/`--paper-contrast`/`paperContrast*` 文案全部删除，未留两套。
- 存储：`pdfdesk:enhance:<book>:<code>`（off 时删键），`pdfdesk:enhance` 广播 + `storage` 监听，两栏同一档；不动 Host、路由、locale 键结构。
- 验证：`paper-enhance-test` 27 条（含 4 条负向对照）exit 0；`paper-invert-test` 按新滤镜语法更新后 48 条 exit 0；`check-keys` / `check-deps`（534） / `node --check` 全 0；`reader-ui-geometry`、`ui-polish`、`t05`、`highlight-pen`、`note-style`、`layout`、`rail-hover`、`issue6-*` 全 0。
- 渲染证据：真实 `EnhanceDefs` + 真实插件 CSS 渲染卓里奇页：关闭/清晰/黑白三档对比，清晰与黑白字明显更白、笔画连续；合成页（纸 #f4f4f4、正文 #3e3e3e、浅灰行 #8f8f8f、红/蓝块）四档纸近黑、正文逐档变白，红/蓝块 RGB 与色度四档完全一致。
- 待手测：重启后选**卓里奇**一章与一本原本就清楚的书各看一次（反色 → 柔和/清晰/黑白）；彩色插图页确认颜色保留；切章/重启记忆；右栏 `⋯` 与主阅读器同步；关闭档回到原反色。
- 未做/风险：线性无趾部，纸不是纯白（反色后 >0.1）的旧复印会把纸与噪点一起提亮（本库实测纸面均为 0.0）；色度阈值 0.10 仍是经验值；`feBlend difference` / `feComposite` 依赖 Chromium 的 SVG 滤镜实现（DSH 桌面为 Chromium，风险低）；未在真实扫描件上量过 200%/300% 缩放下的观感与性能。

## 待拆解入口

- 新需求规格：`docs/requirements/`
- 角色调整提案：`docs/feedback/`
- 用户直接指令：由用户在对话中给出，boss 拆解后写入本表
- **（2026-11-27 用户指令，未拆解）改「书 id」后书架归属丢失**：`分片\<书 id>` 的目录名、或章文件名前缀一改，`~/.dsh/pdfdesk/shelves.json` 里记的还是旧 id → 旧 id 悬空，书从原书架里掉出去；`state.json` 的 `bookId` / `expandedByBook` 同样指向旧 id，原来打开的那本书也打不开。实测 2026-11-27 19:01–19:18 一批 11 本改名后，三个书架 26 条记录里 **14 条对不上**（数学分析 11、抽象代数 3），用外部脚本按 `缓存\重命名记录` 的 old→new 反推才修回来（修好 2/2、13/13、7/7，悬空 0）。
  - 【需求】改书 id 后，书仍留在原来那个书架里。
  - 【现状】书架归属只按书 id 字符串记（`shelves[].books`、`hidden`），改名只动文件系统，两个 json 不跟着改，无处提示。
  - 【期望】改名入口做一次原子迁移：同步 `shelves[].books`、`hidden`、`state.bookId`、`expandedByBook`；外部改名的书，刷新后也能被认回原位（保守匹配，认不准就不动并提示）。
  - 【验收】① 改一本分片书的 id 后刷新，它仍在原书架、书架计数不变；② `state.bookId` 不再指向不存在的 id（原书能打开，或回落到书架）；③ 未改名的书、整本卡、`hidden` 行为不变；④ 迁移只改 id 字符串，`shelves.json` 结构 / `version` 不变，可回退。
  - 【不做】不改书架结构、不改 `hidden` 语义、不新增常驻按钮。
  - 【未决】改名入口做进工作台（可原子同步），还是只接受外部命令行改名（只能启动时迁移）？后者要定匹配策略——长书名在章文件名里会被截成 40 字前缀（如 `AbstractAlgebra,ThirdEdition(DavidS.Dumm`），歧义时不得猜。
  - 参考实现：外部脚本 `D:\长期文件\数学文件拆分稿\工具\sync_shelves.py`（读 `缓存\重命名记录\` 的 old→new 反推旧 id→新 id，写前备份到 `~/.dsh/pdfdesk/backup/`，可 dry-run）。本次修复的原始数据备份：`~/.dsh/pdfdesk/backup/shelves-20261127-192616.json.bak`。
  - 状态（2026-11-27）：**待拆解**，拆成单元前不派发。用户要求「加入下次更新」。
- **下一轮（2026-11-27 用户指令，未拆解）**：大文件拆分面板性能——打开慢、滚动卡、有闪退风险；需虚拟化/释放缩略图位图/简略模式兜底。规格与验收待拍板项见 [`docs/requirements/2026-11-27-大文件拆分性能.md`](requirements/2026-11-27-大文件拆分性能.md)。
  - **状态（2026-11-27）：待用户验收**。用户选方案 B（WPS 式 Host 缩略图）并批准新增路由/缓存；已实现 `/pdfdesk/pdf-layout`、`/pdfdesk/pdf-thumb`、`tools/pdf_thumbs.py` 与拆分面板图片网格（pdf.js 降级保留）。记录见 `docs/changes/next.md` 第一、二节（拆分预览 / 不重要缓存）；未提交、未发布。
- **重构（2026-11-27 用户拍板，下一轮）**：先只修 bug，重构不与本轮同批；下轮抽出 `shelfView`（主/自定义/隐藏书架的成员与计数单一来源）和拆分收尾流程（等待刷新、按目录定位拆分书、加入书架、打开拆分会话），纯重构不得改行为，并补回归测试。
  - **状态（2026-11-27）：待用户验收**。已抽出 `shelfView` / `shelfAddBooks` / `splitShelfTarget` / `splitBookIds` / `fileSplitBooks`（`client.js`），行为等价对照与回归测试见 `docs/changes/next.md`；未提交、未发布。

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
