# Agent 硬约束（dsh-pdf-workbench）

仓库：本文件所在目录，DSH 插件 **dsh-pdf-workbench**（“PDF 阅读”）。
本文件只放硬约束、改完必跑的验证命令和文档指针；教程、任务流转、发布与 CI 细节放 `docs/`。
用户当前明确指令优先于本文件；不确定时停下来问，不猜。

## 1. 角色与会话

- **单会话单任务**：一个会话只做一个阶段的一件事；按任务阶段切分，不按时间或 bug 数量切分。
- **写审分离**：同一会话不得既写业务代码又做审查/验收；审查和测试必须在独立上下文中完成。
- 只有 **programmer** 可以修改业务代码（含 `locale/*.json` 等纯字符串值）。其他角色只读代码，或只写自己角色文档规定的输出。
- 角色文档是行为边界。开工前先读 `docs/roles/<你的角色>.md`；不得越出其中“禁止”一节。
- 任何角色文档的变更（含自己的）必须经用户明确确认后才落盘；确认前只写提案。每个角色一次最多提 2 条规则变更。
- 新增角色必须经用户确认；不要为了覆盖单个问题临时扩张角色体系。
- 上下文出现稀释信号（重复确认过的事、忘记文件位置、规则自相矛盾、压缩后丢失未落盘的结论）时，按角色文档交接并换会话，不靠感觉硬撑。
- 会话结束前，值得保留的结论必须写进指定文件；未落盘视为丢弃。
- **会话预算**：单会话超过 300–500 步必须交接换新会话；按波次（3–5 个单元）开工，不按周开巨会话；只读相关文件，不整本读 `client.js` 或全量历史。详见 `docs/decisions.md` DEC-0011。

## 2. 代码修改

- 先复现、再定位根因，**先定位后修**；没有稳定复现不改代码，不用特判、延时、遮罩掩盖症状。
- **最小修复**：只修根因，不重构、不重命名、不清理无关逻辑、不顺手改行为/文案/默认值。
- 改动超过 2 个文件（3 个及以上）必须先出计划并等用户确认。
- 公共接口、事件名、配置结构、数据 schema、受保护文件不得擅自改动；需要动时先出计划并等用户确认。
- 受保护契约至少包括：公开包接口与 `package.json` 的 `exports` / `engines` / `dsh` 配置、`cordis.patch.yml`、`/pdfdesk/*` 路由、locale 键结构、Host/浏览器共享的事件名、`~/.dsh/pdfdesk/` 与 `.pdfdesk/` 的存储键和 sidecar 结构。
- **纯文案通道**：只改纯字符串值（`locale/*.json` 的值、独立文案常量）的 diff 仍由 programmer 落地；不得改 key、层级、占位符、条件分支或逻辑；必须过语法校验与构建，并跑受影响的 smoke，不重复完整功能测试。内联字符串、prompt、错误分支、危险操作流程按正常代码变更走审查与测试。
- 验收标准只能来自 `docs/requirements/` 中的需求规格或本文件；实现者不得自定、放宽验收标准，也不得自行判定“通过”。
- 测试子 Agent 的验收标准必须来自需求规格或本文件，不得由 programmer 自定。
- 模块化边界检查属于 code-reviewer，不属于 programmer；programmer 只负责不继续扩大耦合。
- **先联动再动手**：改动前列出并检查对主阅读器/右侧预览、单页/连续/双语/叠加、工具/撤销/导出/打印、快捷键/设置、localStorage/Host 存储、旧数据兼容的影响；只改当前入口视为未完成。
- **交互功能先确认参照**：开始交互类功能前向用户确认可模仿的目标产品/截图；用户说没有时按主流产品取舍并写进计划，不再逐项追问。
- **跨视图同步默认不新增**：先写原因、影响视图、回退方式并请用户确认；程序性滚动/回填不得发布页码（回声抑制）。
- `client.js` 是组装层，不是功能仓库。不得出现第三份页状态、第三套 `annotDown/annotUp`、第三套菜单动作；模块边界见 `docs/decisions.md`。
- Host 不得直接访问未声明 inject 的 `ctx.<service>`，用 `ctx.get('<service>')`。
- 不新增工具条按钮；用户明确要求除外。
- 客户端改动不能热更新，改完需重启验证；不要向用户承诺 HMR。
- 不向用户索要 2FA 码、密码或 token；不把 token 打印到日志或对话。
- 不用 PowerShell 的 `Get-Content` / `Set-Content` 读写含中文的 UTF-8 文本；用编辑器、Node 或本仓库的读写工具。

## 3. 仓库与发布边界

- **默认只本地提交通档，不发版**：只有用户明确说「发布 / 发版 / 更新 / 推送」时，才可以升版本、打 tag、push、创建 GitHub Release、发 npm 或改市场条目；不要每轮追问“要不要发布”。
- 发布只能由 **release-manager** 执行，且必须已读 `docs/reviews/<单元ID>.md` 与 `docs/tests/<单元ID>.md` 的**最新一轮**，结论分别无 Critical / 通过；发布细节见 `docs/ci.md`。
- release-manager 不改 `src/`、不改测试；构建失败时停止并退回 programmer，不通过改代码“修构建”。
- 不自动修改 CI 配置；需要新建或修改 CI / Trusted Publishing 时，先由用户确认方案。
- `cordis.patch.yml` 必须保持中性，不写具体书库路径；真实书库由运行时的 `~/.dsh/pdfdesk/libraries.json` 管理。
- 不进 git：`node_modules/`、`dist/`、`.dsh-scratch/`、临时文件、任何带本机绝对路径或凭据的文件。
- 不提交个人目录绝对路径、API Key、token、密码；提交前用 `git diff --cached` 检查。
- 仓库里允许并应持久化的项目记忆：`docs/requirements/`、`docs/roles/`、`docs/todo.md`、`docs/decisions.md`、`docs/feedback/`、`docs/boss-handover.md`、`docs/features.md`、`docs/copy/`、`docs/reviews/`、`docs/tests/`、`CHANGELOG.md`。临时草稿和含个人信息的诊断仍放仓库外。
- CI 细节、发布命令和历史坑只在 `docs/ci.md` / `docs/RELEASE.md`，不要搬回本文件。

## 4. 改完必跑的验证

在仓库根目录执行：

```powershell
node --check client.js
node --check index.js
Get-ChildItem src\host\*.js | ForEach-Object { node --check $_.FullName }
```

- 改了 `src/client/` 或 vendor UI 后，再跑 `npm run build:host-ui`；失败就停下排查，**不要改构建链掩盖失败**。
- 发布或验收前的分发构建：`powershell -ExecutionPolicy Bypass -File .\build-dist.ps1`。
- 仓库外测试脚本在仓库上一级工作区执行（存在才跑，改动相关项必跑；发版跑与改动相关的全部 `*test*.mjs`）：

```powershell
# 先 cd 到仓库上一级工作区
node .dsh-scratch\check-keys.mjs
node .dsh-scratch\check-deps.mjs
node .dsh-scratch\host-test.mjs
```

- 失败不提交，不判通过。`node --check` 通过不等于审查或验收通过。
- 文档-only 改动不强制跑上述命令；必须检查链接、文件名与引用路径。

## 5. 文档指针

| 要做的事 | 先读 |
| --- | --- |
| 判断当前该谁做、拆几个会话、发布规模 | `docs/roles/boss.md` |
| 把模糊需求写成需求规格 | `docs/roles/auditor.md`，输出到 `docs/requirements/` |
| 实现一个执行单元 | `docs/todo.md` + `docs/roles/programmer.md` |
| 独立审查 diff | `docs/roles/code-reviewer.md`，输出到 `docs/reviews/<单元ID>.md` |
| 独立验收 | `docs/roles/tester.md` + `docs/TESTING.md`，输出到 `docs/tests/<单元ID>.md` |
| 发布 | `docs/roles/release-manager.md` + `docs/ci.md` |
| 反馈角色体系的问题 | `docs/roles/feedback-collector.md`，输出到 `docs/feedback/` |
| 查已定架构/被否决方案/隐性契约 | `docs/decisions.md` |
| major 版本盘点功能 / 更新 README | `docs/roles/feature-inventory.md` + `docs/features.md` |
| 统一术语、错误提示、危险确认文案 | `docs/roles/ui-copywriter.md` + `docs/copy/` |
| 用户可见的版本变化 | `CHANGELOG.md` |

## 6. 文档冲突

优先级从高到低：**用户当前明确指令 → 本文件 → `docs/decisions.md` → `docs/roles/*.md` → 其他文档**。
发现文档互相矛盾时，停止执行，向用户说明冲突点；不要自行选一个解释继续做。
