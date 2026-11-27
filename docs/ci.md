# CI 与发布流程

> **执行者：ci**。本文是发布细节的体系入口；`docs/RELEASE.md` 是 2026-11-24 实测的详细 runbook（含历史坑）。两者冲突时，先停下请用户确认，不自行选一个执行。
>
> **当前状态（2026-11-25）：仓库没有 `.github/workflows`，发布仍由 ci 在本地手动执行；Trusted Publishing 尚未启用。** 不要因为读了本文就假设 CI 已经在跑。

## 1. 启动门禁

发布不是日常提交的一部分。必须同时满足：

- 用户明确说「发布 / 发版 / 更新 / 推送」；
- programmer 的任务结果与证据齐全：diff 范围、根因、验证命令与退出码、未覆盖项；
- 用户已手测通过，或明确表示接受当前结果（把原话记进发布记录）；
- 发布规模已按本文第 2 节归类；
- major 已由用户/队长更新 `docs/features.md` 与 README；没有更新就停，不能假装有专职盘点角色。

缺一项就停，交回用户/队长；ci 不补测试、不补自查、不代替 programmer 修代码。

### 1.1 变更记录（`docs/changes/next.md`）

- **programmer 必须写**：每个执行单元收尾更新 `docs/changes/next.md`（格式见 `docs/changes/README.md`），包含用户可感知变化、入口、根因/需求、契约影响、验证命令与退出码、风险与未覆盖、可直接进 CHANGELOG 的草稿。
- **ci 必须审**：逐条对照 `git diff`（文件、行为、契约），确认记录与 diff 一致；对不上就退回 programmer，不自行脑补更新说明。
- **CHANGELOG 从记录起草，以 diff 为准**：只取“用户可感知变化”一节，去掉内部实现与文件名；内部变化只用于核对，不写进面向用户的说明。
- **归档**：发布完成后把 `next.md` 改名为 `docs/changes/vX.Y.Z.md`，并新建空的 `next.md`（标题写明“自 vX.Y.Z 起”）。

## 2. 版本号与发布规模

| 规模 | 语义 | 版本 bump | 额外要求 |
| --- | --- | --- | --- |
| patch | 修复 bug，不新增用户可见能力 | `1.4.x` → `1.4.x+1` | CHANGELOG 写清修复内容 |
| minor | 向后兼容的新能力 | `1.4.x` → `1.5.0` | ci 整理“用户可见变更摘要” |
| major | 破坏性变更、数据迁移、需要用户改变使用方式的大版本 | `1.x.y` → `2.0.0` | 用户/队长确认 features/README 已更新；ci 不自行补盘点 |

无法判断时停下问用户，不自行降级。版本号必须同时出现在：

- `package.json` 的 `version`；
- `package-lock.json` 根 `version` 与 `packages[""].version`；
- git tag `vX.Y.Z`；
- GitHub Release 标题；
- npm 包版本；
- 分发包 `dsh-pdf-workbench-X.Y.Z.zip`；
- README 中若写死了版本，必须同步。

## 3. 发布前验证

在仓库根目录：

```powershell
node --check client.js
node --check index.js
Get-ChildItem src\host\*.js | ForEach-Object { node --check $_.FullName }
```

- 改了 `src/client/` 或 vendor UI 时：`npm run build:host-ui`。当前沙箱可能因 esbuild 启动 `EPERM` 失败；如果 `vendor/host-ui.*` 本次没有改动，可使用已有产物并在发布记录注明。不要为了跳过失败而改写构建链。
- 至少跑仓库外现有的 `check-keys.mjs`、`check-deps.mjs`、`host-test.mjs`；再跑与本次改动相关的全部 `.dsh-scratch/*test*.mjs`。失败不发布。
- 用户可见交互变更按 `docs/TESTING.md` 的干净环境矩阵补做必要验收；真机结论以用户手测为准，不能只看脚本。
- **开发者模式已删除（2026-11-26 用户要求）**：`client.js` 不得再出现 `DEV_MODE_SUPPORTED`、`Ctrl+Shift+D`、`pdfdesk:dev-mode`、`devModeBadge` 等字样。`build-dist.ps1` 仍会调用 `scripts/prepare-release-client.mjs`：删除 `pdfdesk:dev-only-*` 标记块（留给以后的本机代码）、拒绝 `ENV_GUIDE_ALWAYS` 与上述开发者模式残留、`node --check`；任一步失败即中止打包。发布前可手动验证：
  ```powershell
  Select-String -Path ..\dist\dsh-pdf-workbench-*\client.js -Pattern 'DEV_MODE_SUPPORTED','Ctrl\+Shift\+D','pdfdesk:dev-mode','pdfdesk:dev-only'
  ```
  结果必须无命中；另跑 `.dsh-scratch/release-guard-test.mjs`。
- 分发构建：

```powershell
powershell -ExecutionPolicy Bypass -File .\build-dist.ps1
# 产物：..\dist\dsh-pdf-workbench-X.Y.Z.zip
```

## 4. CHANGELOG 与提交

1. 在 `CHANGELOG.md` 顶部新增 `## vX.Y.Z`，面向用户写“改了什么、为什么”；不写本机路径、token、内部流程。
2. 更新 `package.json` / `package-lock` 版本、README 中固定版本（如有）、界面截图（如界面有变化）。
3. 检查没有个人绝对路径、API Key、token、`.dsh-scratch` 内容进入提交。
4. 提交并打本地 tag：

```powershell
git add -A
git commit -m "vX.Y.Z: <一句话>"
git tag vX.Y.Z
```

## 5. GitHub Release

详细命令与历史坑见 `docs/RELEASE.md` 第 1 节。关键顺序：

1. 确认代理/VPN 与 GCM 凭据可用；schannel 报 `SEC_E_NO_CREDENTIALS` 时使用 `-c http.sslBackend=openssl`。
2. 沙箱拦截 GCM 凭据管道时，对**同一条 push 命令**申请最小范围升级；不打印 token。
3. push main；若远程 tag 指向旧提交，确认本地 tag 正确后强制更新。
4. 创建 `vX.Y.Z` GitHub Release，上传 zip；正文按 `docs/RELEASE.md` 的固定格式，来自 CHANGELOG 的用户可读版本。
5. 复核：main 最新提交 = 本地 HEAD；tag 指向版本提交；Release 存在且 zip 可下载。

## 6. npm

npm 包名固定 **`dsh-pdf-workbench`**。必须从干净 worktree 发布，避免工具包装脚本、`__pycache__` 等进入包。

```powershell
# 从 tag 建干净 worktree（路径按当前工作区调整）
git worktree add ..\dist\npm-release vX.Y.Z
cd ..\dist\npm-release

# 登录：userconfig/cache 放工作区，避免写用户目录被沙箱拒绝
npm login --auth-type=web --userconfig "<工作区>\.dsh-scratch\npmrc" --cache "<工作区>\.dsh-scratch\npm-cache"
```

- Agent 只给用户登录 URL；用户自己完成 2FA。
- **永远不索要、代填或打印 2FA 码、密码、token。**
- 登录命令即使退出码非 0，也必须用 `npm whoami` 复核；不能只看退出码。

```powershell
npm stage publish --access public --userconfig "<工作区>\.dsh-scratch\npmrc" --cache "<工作区>\.dsh-scratch\npm-cache"
```

- 成功后把 staged 批准网址发给用户，由用户批准。
- 批准后用 `npm view dsh-pdf-workbench@X.Y.Z version ...` 实际验证；输出 `X.Y.Z` 才算成功。
- 清理 worktree；不把 npm 凭据留在仓库。

## 7. 市场索引

- npm 新版本可见后，同步市场条目；当前条目若把 `tarball` 固定在旧版本，必须改成：

```yaml
tarball: https://registry.npmjs.org/dsh-pdf-workbench/-/dsh-pdf-workbench-X.Y.Z.tgz
```

- 只有仓库地址、包名、分类、描述或回退 tarball 变化时才改市场条目。
- 市场 tarball 未指向新版本时，不算发布完成。

## 8. 发布后一致性检查

逐项确认，不用“应该可以”代替：

- [ ] `package.json` 版本 = `package-lock.json` 根版本；
- [ ] 本地 tag、远程 tag、GitHub Release 标题一致，且指向版本提交；
- [ ] zip 文件名与版本一致，可下载；
- [ ] npm 页面可见，`npm view` 返回正确版本；
- [ ] 市场条目 tarball 指向新版本；
- [ ] README 安装命令与截图没有过期；
- [ ] CHANGELOG 已包含该版本；
- [ ] 实验/未实测功能仍如实标记；
- [ ] 远程 main 包含发版提交。

## 9. CI / Trusted Publishing（尚未启用）

当前状态：**无 CI 工作流，无 npm Trusted Publisher 配置。** 以下是未来迁移方案，不是已实现事实；新增或修改 CI 需要用户确认（见 `AGENTS.md`）。

迁移到 GitHub Actions + npm Trusted Publishing 时，目标形态：

- **触发**：push tag `v*`（tag 仍只由 ci 在用户明确发版后创建），或 `workflow_dispatch` 做发布演练；不要在每个 merge 上自动发布。
- **权限**：`permissions: contents: write`（创建 GitHub Release）和 `id-token: write`（npm OIDC）；不要长期保存 `NPM_TOKEN`。
- **npm 侧**：在 npm 包设置中配置 Trusted Publisher：GitHub 仓库 `minggemofashi/dsh-pdf-workbench` + workflow 文件名（例如 `.github/workflows/release.yml`）+ 允许的环境（如 `npm-publish`）。具体字段以 npm 当前文档为准。
- **工作流步骤**：checkout tag → 校验 tag 与 `package.json` 版本一致 → 跑本文第 3 节检查 → 构建 zip → `npm publish --provenance --access public` → 创建 GitHub Release / 上传资产。
- **人工批准**：若仍使用 staged publish，保留用户批准步骤；CI 不索取 2FA，不在日志打印凭据。
- **前置条件**：Workflow 文件、npm 配置、仓库权限三者必须同时真实存在；只写文档或只加 workflow 而未配置 npm 侧，不能对外宣称“已启用 Trusted Publishing”。

迁移完成前，按本文第 3–8 节的手动流程执行；迁移后，ci 仍需检查发布结果与市场同步。

## 10. 失败处理

- 构建/检查失败：停止，退回 programmer；ci 不改代码、不改测试来“修好”。
- 已打 tag 但 Release 失败：记录状态，核对 tag 与提交，再重试或重建；不要在错误 tag 上继续。
- npm 发布后发现严重问题：不要覆盖已发布版本；按补丁版本修复后重新发布。需要撤回/弃用版本时先问用户。
- 任一渠道状态不明：停在“未完成”，逐项复核；不把部分成功说成发布成功。

## 11. 不要做

- 不在用户没明确要求时升版本、打 tag、push、发 Release、发 npm 或改市场条目。
- 不从脏工作目录发布 npm。
- 不把 2FA 码、密码、token 写进对话、日志或仓库。
- 不在构建失败时改业务代码“修好构建”。
- 不在 npm 版本可见前更新市场 tarball。
- 不把 `docs/RELEASE.md` 的历史命令删掉或重新设计流程；要改先问用户。
