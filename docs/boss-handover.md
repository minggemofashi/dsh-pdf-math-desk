# boss 交接文档

> **状态：初始版本（尚未发生换届）。**
> 本文件在 boss 出现换届信号时更新并落盘；没有换届时不要伪造交接记录。
> 接手者先读本文件，再读 `AGENTS.md`、`docs/decisions.md`、`docs/todo.md` 和 `docs/roles/boss.md`。

## 1. 当前角色清单与文档位置

| 角色 | 类型 | 文档位置 | 触发条件 |
| --- | --- | --- | --- |
| 审计员 `auditor` | 常驻入口 | `docs/roles/auditor.md` | 新需求、范围或验收不清 |
| boss | 常驻 | `docs/roles/boss.md` | 路由、规则、拆解、发布规模归类 |
| 组织反馈整理员 `feedback-collector` | 常驻入口 | `docs/roles/feedback-collector.md` | 用户反馈角色体系问题 |
| 程序员 `programmer` | 常驻执行 | `docs/roles/programmer.md` | 有已拆好的执行单元 |
| 代码审查者 `code-reviewer` | 常驻独立审查 | `docs/roles/code-reviewer.md` | programmer 提交 diff 后 |
| 测试者 `tester` | 常驻独立验收 | `docs/roles/tester.md` | review 无 Critical 后 |
| 更新推送员 `release-manager` | 常驻发布 | `docs/roles/release-manager.md` | 用户明确要求发布，且评审/测试已通过 |
| 功能盘点员 `feature-inventory` | 闲职 | `docs/roles/feature-inventory.md` | 仅 major |
| 界面与文案规范员 `ui-copywriter` | 闲职/横切 | `docs/roles/ui-copywriter.md` | 需求阶段定文案规范；或测试通过且代码冻结后全项目审计 |

## 2. 待办及优先级

- 权威来源：`docs/todo.md`。
- 当前状态：**队列为空**，没有已拆解的执行单元；等待新的需求规格或用户直接指令。
- 当前优先级：无 P0/P1 登记项。
- 若接手时队列非空，按 `docs/todo.md` 的 P0 → P1 → P2 顺序处理，并核对每个单元的验收来源和依赖。

## 3. 最近决策及原因

| 决策 | 日期 | 原因摘要 |
| --- | --- | --- |
| DEC-0001 维护体系九条设计原则 | 2026-11-24 | 生成/审查/发布需独立上下文；项目记忆必须从会话搬进文件 |
| DEC-0002 Host/浏览器双半架构 | 2026-11-24（补录） | Host 只依赖 Node 内置模块；客户端不热更新 |
| DEC-0003 `client.js` 组装层与固定模块边界 | 2026-11-24（补录） | 防止继续出现第二/第三套页状态与菜单动作 |
| DEC-0004 本地优先的数据布局 | 2026-11-24（补录） | 书库和标注留在本机，不上传、不收集遥测 |
| DEC-0005 发布门禁 | 2026-11-24（补录） | 用户显式触发、独立评审/测试、npm 由用户批准 |

完整上下文、被否决方案和隐性契约见 `docs/decisions.md`。

## 4. 未决问题

1. **CI / Trusted Publishing 尚未启用**：仓库当前没有 `.github/workflows`，npm 仍是本地 staged publish + 用户批准。是否迁移到 tag 触发的 CI / Trusted Publishing，需要用户确认；迁移前不要写一个“看起来已启用”的工作流。详见 `docs/ci.md`。
2. **旧发布/测试文档的归属**：`docs/RELEASE.md` 继续作为详细历史 runbook，`docs/ci.md` 是体系入口；`docs/TESTING.md` 继续作为干净环境测试矩阵。是否把它们进一步并入角色文档尚未决定，目前不影响执行。
3. **新体系尚未经过真实任务试跑**：第一次实际使用后，由 feedback-collector 收集“哪个角色交接不清楚/哪份文档没被读”的证据，再决定是否微调；不要先凭想象加角色或改规则。
4. **双语页码文档不一致**：README 写“两栏共享页码与翻页”，既有 AGENTS / `docs/decisions.md` 记录“双语两栏页码不同步（v0.72.5）”。当前按既有约束执行；下次 major 由 feature-inventory 核对实现并修正 README，不要静默二选一。

## 5. 换届记录

发生换届时，由旧 boss 填写；没有发生换届时保留空白，不预填。

### 本次换届

- 日期：
- 触发信号：
- 旧会话：
- 接手会话：
- 当前版本/分支：
- 未完成的执行单元：
- 正在等待的用户确认：
- 已写入但尚未验证的结论：

### 接手检查单

- [ ] 已读 `AGENTS.md` 和 `docs/decisions.md`
- [ ] 已读 `docs/todo.md`，确认没有重复拆解
- [ ] 已读全部角色文档，确认没有忘记已存在角色
- [ ] 已确认当前没有与角色文档矛盾的规划
- [ ] 已把本次接手需要用户确认的问题列出，未自行拍板
- [ ] 若继续原任务，已从明确的执行单元开始；没有重新做已完成的组织设计
