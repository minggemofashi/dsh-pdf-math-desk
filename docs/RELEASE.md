# 发布流程（GitHub / npm / 插件市场）

本文件是 `dsh-pdf-math-desk` 的**固定发布流程**。每次发版按这里的顺序做，不要临时改顺序；`AGENTS.md` 的收尾要求与本文件一致，冲突时以本文件为准。

发布面一共四处，必须一起更新：

1. GitHub 代码与 tag；
2. GitHub Release（带 zip 附件，「检查更新」读的就是它）；
3. npm（staged publishing + 2FA 批准）；
4. 插件市场索引 `market/index.json` 与 README 安装示例。

---

## 0. 隐私与安全（先读）

- **不提交** token、密码、真实书库路径、个人目录。真实书库只存在 `~/.dsh/mathdesk/libraries.json`；仓库里的示例统一用 `D:\数学书库`。
- **GitHub 凭据**由 Git Credential Manager 缓存，命令里不要写 token；需要临时取用时用 `git credential fill`，只在变量里使用，不打印、不写入仓库。
- **npm token** 只放 `%USERPROFILE%\.npmrc`（或 `$HOME/.npmrc`）；不要出现在命令历史、日志、issue、聊天里。需要贴日志时把 token 打码。
- **分发 zip 放仓库外**的 `dist/`，不提交；构建前在 `dist` 副本里再 grep 一次个人路径（见第 3 步）。
- npm 的浏览器 2FA 链接/`authId` 只在本机浏览器完成，不转发、不入库。
- 截图、错误日志里出现路径或 token 时先打码再贴。

---

## 1. 准备（全部通过才继续）

1. 工作区干净：`git status --short` 输出为空。
2. 跑检查（在仓库根目录）：
   - `node --check client.js`
   - `node --check index.js`
   - 逐个 `node --check src/host/*.js`
   - 仓库外若有 `.dsh-scratch/`，一并跑：`host-test.mjs`、`check-deps.mjs`、`check-keys.mjs`、`notes-test.mjs`、`blocks-json-test.mjs`、`history-test.mjs`、`mask-boxes-test.mjs`、`side-smoke.mjs`、`annotations-test.mjs`、`dual-overlay-test.mjs`、`column-ink-test.mjs`（按实际存在项）。
3. 升版本号：`package.json` 的 `version`（修复/文档 +补丁位，新功能 +次版本位）。
4. 更新文档：
   - `CHANGELOG.md` 顶部加 `## vX.Y.Z`（一行说清改了什么、为什么）；
   - `README.md` 受影响的说明；
   - 涉及验收的更新 `docs/TESTING.md`。

> 不要提交 `dist/`、`node_modules/`、`.dsh-scratch/`；`package.json` 必须无 BOM（首字节 `7b 0a`）。

---

## 2. 提交与 tag

```bash
git add -A
git diff --cached          # 看一眼，确认没有个人路径/token
git commit -m "vX.Y.Z: <一句话摘要>"
git tag vX.Y.Z
git push origin main
git push --tags origin
```

验证：

```bash
git rev-parse HEAD
git ls-remote origin refs/heads/main      # 与本地 HEAD 一致
git ls-remote --tags origin | tail        # 含 vX.Y.Z
```

推送失败先查代理：

```bash
git config --get http.proxy
```

- 代理没启动（例如 `127.0.0.1:7890` 拒绝连接）→ 先启动代理，或临时直连：
  `git -c http.proxy= -c https.proxy= push origin main`；
- 沙箱/受限终端在 TLS 握手时报 `SEC_E_NO_CREDENTIALS` → 用全权限执行该次推送。

---

## 3. 构建分发包（Release 附件）

在仓库**外**建 staging 目录（路径用变量，不要把用户名写进文档）：

```powershell
$root  = (Resolve-Path '.').Path          # 仓库根（math-desk）
$dist  = Join-Path (Split-Path $root) 'dist'
$stage = Join-Path $dist 'dsh-pdf-math-desk-X.Y.Z'
$zip   = Join-Path $dist 'dsh-pdf-math-desk-X.Y.Z.zip'
```

复制插件目录，排除 `.git`、`node_modules`、`dist`、`.dsh-scratch`；然后检查：

1. `cordis.patch.yml` 保持中性（示例 `D:\数学书库`，无真实书库）；
2. 在 staging 里 grep 个人路径，应为空：
   `D:\\长期文件`、`C:\\Users\\<用户名>`、`E:\\app`；
3. `package.json` 无 BOM；版本号正确；
4. 压缩时**根目录直接是插件文件**（不要多套一层目录）：

```powershell
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
```

---

## 4. GitHub Release（**必须做**，否则「检查更新」看不到）

方式 A（装了 `gh` 且已登录）：

```bash
gh release create vX.Y.Z "$DIST/dsh-pdf-math-desk-X.Y.Z.zip" \
  -t "vX.Y.Z" -n "vX.Y.Z — <摘要>"
```

方式 B（无 `gh`，用 GitHub API + 缓存的 GCM 凭据）：

1. 取 token（只在变量里，不打印）：

```powershell
$in = "protocol=https`nhost=github.com`n`n"
$t  = ($in | git credential fill 2>$null | Select-String '^password=(.*)$').Matches.Groups[1].Value
$h  = @{ Authorization = "token $t"; 'User-Agent' = 'dsh-release' }
```

2. 创建 release（`tag_name` 必须已推送）：

```powershell
$body = @{ tag_name = 'vX.Y.Z'; name = 'vX.Y.Z'; body = $notes;
           draft = $false; prerelease = $false } | ConvertTo-Json -Depth 3
$rel = Invoke-RestMethod -Method Post -Headers $h -ContentType 'application/json' `
       -Body $body -Uri 'https://api.github.com/repos/<owner>/<repo>/releases'
```

3. 上传附件：

```powershell
Invoke-RestMethod -Method Post -Headers $h -ContentType 'application/zip' -InFile $zip `
  -Uri "https://uploads.github.com/repos/<owner>/<repo>/releases/$($rel.id)/assets?name=dsh-pdf-math-desk-X.Y.Z.zip"
```

验证：

```powershell
$latest = Invoke-RestMethod -Headers $h -Uri 'https://api.github.com/repos/<owner>/<repo>/releases/latest'
$latest.tag_name
$latest.assets | Select-Object name, size, state   # state=uploaded
```

> 插件「检查更新」读 `releases/latest`；只推 tag、不建 Release，用户就会一直看到旧版本。

---

## 5. npm 发布（staged + 2FA）

1. 确认账号：

```bash
npm whoami          # 应输出你的 npm 账号
```

失效时重新登录（不要把 token 贴到任何地方）：

```bash
npm login
```

或手动更新 `%USERPROFILE%\.npmrc`：

```
//registry.npmjs.org/:_authToken=<新token>
```

2. 发布：

```bash
npm publish --access public
```

3. 如果返回 `E_STAGE_REQUIRED` / “can only publish to a staging area”：

```bash
npm stage publish --access public
npm stage list                 # 记下 stage id，例如 d29098a6-...
```

4. 用 2FA 批准（二选一）：

- **网页**：打开 `https://www.npmjs.com/package/dsh-pdf-math-desk?activeTab=staged`
  （或包页 → **Staged Packages** 标签）→ 找到 `X.Y.Z` → **Approve** → 浏览器 2FA；
- **终端**：`npm stage approve <stage-id>`（交互式浏览器 2FA；或 `--otp <6 位验证码>`）。

> 状态 `validating`（恶意软件扫描）时 Approve 不可点，等几十秒再刷新。

5. 验证：

```bash
npm view dsh-pdf-math-desk version        # 必须等于 vX.Y.Z
npm view dsh-pdf-math-desk maintainers    # 确认是你的账号
```

注意事项：

- npm 11.20+ 默认 **staged publishing**；绕过 2FA 的 token 会被限制，不要用。
- 发布失败不要反复重试到锁账号；先看错误码：`E401`（token 失效）、`E403/E404`（无权限/不是包主）、`E_STAGE_REQUIRED`（走 stage）、`EOTP`（需要 2FA）。

---

## 6. 市场索引与 README（**npm 成功之后**）

顺序很重要：npm 没成功前，市场/README 必须保持旧版本，否则用户装到不存在的版本。

1. `market/index.json`：

```json
"versions": [
  { "version": "X.Y.Z", "publishTimestamp": <当前 Unix 秒>, "source": { "type": "npm" },
    "engines": { "dsh": ">=0.2.2-rc.5" } }
]
```

`publishTimestamp` 可用：

```powershell
[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
```

2. `README.md` 安装示例：

```bash
dsh plugin add dsh-pdf-math-desk@X.Y.Z
```

3. 提交（这类发布元数据按历史惯例单独提交，不升版本）：

```bash
git add README.md market/index.json
git commit -m "market: point index and README at published X.Y.Z"
git push origin main
```

---

## 7. 用最终工作树重打附件并替换

市场/README/文档改完后，**重新构建一次 zip**（第 3 步），替换 Release 上的同名附件：

```powershell
# 删除旧 asset（asset_id 从 releases/tags/vX.Y.Z 的 assets 里取）
Invoke-RestMethod -Method Delete -Headers $h `
  -Uri "https://api.github.com/repos/<owner>/<repo>/releases/assets/<asset_id>"
# 再上传新 zip（同第 4 步的上传命令）
```

---

## 8. 最终一致性检查（缺一不可）

| 位置 | 检查 |
| --- | --- |
| npm | `npm view dsh-pdf-math-desk version` = `X.Y.Z` |
| GitHub Release | `releases/latest` 的 `tag_name` = `vX.Y.Z`，zip 附件 `state=uploaded` |
| 市场索引 | `market/index.json` 的 `version` = `X.Y.Z` |
| README | 安装示例 = `X.Y.Z` |
| 远程代码 | `git ls-remote origin refs/heads/main` = 本地 `HEAD` |
| 插件内更新检查 | 打开工作台「检查更新」，应提示 `X.Y.Z` |

---

## 9. 常见卡点速查

- **git 推送连不上**：`http.proxy` 指向的代理没启动；启动代理或临时 `-c http.proxy= -c https.proxy=` 直连。
- **TLS `SEC_E_NO_CREDENTIALS`**：受限沙箱拿不到凭据；该次命令用全权限执行。
- **`npm.ps1` 被执行策略拦截**：用 `npm.cmd`，或在 `cmd /c` 里跑。
- **npm E401**：token 过期/被撤 → `npm login` 或换 token。
- **npm E403/E404**：不是包主或 token 无 publish 权限；确认 `npm view dsh-pdf-math-desk maintainers`。
- **E_STAGE_REQUIRED**：走 `npm stage publish` + 网页/CLI 2FA 批准。
- **EOTP**：网页 Staged Packages 批准，或 `--otp`。
- **Release 有 tag 没附件**：用户能收到更新提示但下载失败；必须上传 zip。
- **市场/README 指到未发布版本**：先回退到 npm 上的旧版本，npm 成功后再更新。
- **版本号不一致**：发布前全仓 grep `0\.\d+\.\d+`，确认 package.json、CHANGELOG、README、market 一致。
- **BOM**：`package.json` 被写成 UTF-8 BOM 会让 DSH 读不到插件；保存为无 BOM。

---

## 10. 一页命令清单（替换占位符即可）

```bash
# 1) 准备
git status --short
node --check client.js && node --check index.js

# 2) 提交与推送
git add -A && git commit -m "vX.Y.Z: <摘要>"
git tag vX.Y.Z
git push origin main && git push --tags origin

# 3) 打 zip（在仓库外 dist/，排除 .git node_modules dist .dsh-scratch）
#    Compress-Archive -Path "$stage\*" -DestinationPath "$zip"

# 4) GitHub Release（gh 或 API；上传 zip；验证 releases/latest）

# 5) npm
npm whoami
npm publish --access public            # 或 npm stage publish --access public
npm stage list                         # 需要时
npm stage approve <stage-id>           # 或网页 Staged Packages + 2FA
npm view dsh-pdf-math-desk version

# 6) 市场与 README（npm 成功后）
#    market/index.json version + publishTimestamp；README 安装示例
git add README.md market/index.json
git commit -m "market: point index and README at published X.Y.Z"
git push origin main

# 7) 用最终工作树重打 zip，替换 Release 附件

# 8) 一致性：npm / releases/latest / market / README / 远程 main
```
