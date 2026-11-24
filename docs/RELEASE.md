# 发版流程（2026-11-24 实测固定版）

> 用户说「更新 / 发版 / 发布」时，严格按本文执行；本文**取代**之前只做本地交付的旧流程。
> 日常修改仍然只本地提交；只有明确发版才升版本、打 tag、push、Release、npm。

## 0. 发版前

1. 确认 `package.json` 版本：修复 + 补丁位，新功能 + 次版本位。
2. `CHANGELOG.md` 顶部新增 `## vX.Y.Z`。
3. 同步 `package-lock.json` 根版本、`README.md` 安装命令里的版本。
4. 界面有变化时更新截图与 `screenshots.json`。
5. 跑检查：

```powershell
cd math-desk
node --check client.js
node --check index.js
Get-ChildItem src\host\*.js | ForEach-Object { node --check $_.FullName }
cd ..
node .dsh-scratch\check-keys.mjs
node .dsh-scratch\check-deps.mjs
```

再跑仓库外的全部 `.dsh-scratch/*test*.mjs`；失败不提交。

6. 构建分发 zip：

```powershell
cd math-desk
powershell -ExecutionPolicy Bypass -File .\build-dist.ps1
# ..\dist\dsh-pdf-workbench-X.Y.Z.zip
```

> `npm run build:host-ui` 在当前沙箱可能因 esbuild 启动 `EPERM` 失败；如果 `vendor/host-ui.*` 本次没有改动，直接使用已有产物，并在记录里注明。不要为了跳过失败而改写构建链。

7. 提交并打 tag：

```powershell
git add -A
git commit -m "vX.Y.Z: <一句话>"
git tag vX.Y.Z
```

## 1. GitHub：实测可用流程

### 1.1 网络与凭据预检

```powershell
git -C <工作区绝对路径>\math-desk ls-remote origin refs/heads/main
```

- 本机 git 配置了代理 `127.0.0.1:7890`；代理不通时先让用户连 VPN/代理。
- Git 使用 **schannel** 时会报 `SEC_E_NO_CREDENTIALS`；改用 OpenSSL 后端即可：

```powershell
git -C <工作区绝对路径>\math-desk -c http.sslBackend=openssl ls-remote origin refs/heads/main
```

- 本机使用 **Git Credential Manager**。沙箱可能拦截它的凭据管道（`couldn't create signal pipe` / `could not read Username`）。此时对**同一条 push 命令**申请最小范围的沙箱升级；批准后 GCM 才能取到已保存的 GitHub 账号。不要把 token 打印出来。

### 1.2 push main

```powershell
git -C <工作区绝对路径>\math-desk -c http.sslBackend=openssl push origin main
```

如果只看到 `To https://github.com/...` 和 `old..new main -> main`，即使 PowerShell 因 stderr 返回非零，也算 push 成功；必须用 GitHub API 或网页复核。

### 1.3 修正 tag

历史坑：远程 `vX.Y.Z` 可能已在网页上创建，指向的是旧提交（例如 v1.3.4），此时普通 push tag 会被拒绝或留下错误 tag。确认本地 tag 正确后强制更新：

```powershell
git -C <工作区绝对路径>\math-desk -c http.sslBackend=openssl push --force origin vX.Y.Z
```

如果此前已经建了错误的 GitHub Release，先删除旧 Release，再基于正确 tag 重建。

### 1.4 创建 Release 并上传 zip

有 GCM 凭据时，Agent 可以代劳：

1. 从 GCM 读取当前 GitHub 凭据，**只在进程内使用，绝不打印/写入仓库**；
2. 调 GitHub API 创建 `vX.Y.Z` Release（`draft=false`, `prerelease=false`），正文按第 1.6 节生成；
3. 上传 `dist\dsh-pdf-workbench-X.Y.Z.zip`；
4. 输出 Release URL 和 asset URL。

实测注意：

- API 刚创建后可能短暂 404；用 `releases` 列表或 `releases/latest` 复核，必要时重试。
- Release 的正文不要使用 PowerShell 的 `Get-Content -Raw` 拼 JSON（中文可能变乱码/变成文件对象）；用 Node 以 UTF-8 读入并直接发请求。

无凭据或用户要求纯手动时，交付这三项：

```text
本地文件：<工作区>\dist\dsh-pdf-workbench-X.Y.Z.zip
Release 新建：https://github.com/minggemofashi/dsh-pdf-workbench/releases/new?tag=vX.Y.Z
npm：https://www.npmjs.com/package/dsh-pdf-workbench
```

### 1.5 验证 GitHub

- main 最新提交 = 本地 HEAD；
- `vX.Y.Z` tag 指向版本提交；
- Release 页面存在且 zip 可下载。

## 1.6 Release 说明格式（固定，给用户复制）

每次发版同时给出 **标题**、**说明**、**上传文件** 三段。说明来自 `CHANGELOG` 的该版本条目，整理成用户可读版本；不要写本机路径、用户名、token 或内部流程。

**标题**

```text
vX.Y.Z
```

**说明骨架**

```markdown
## vX.Y.Z

一句话概括本次更新。

### 阅读与画布
- 只写本次实际改动的条目

### 标注
- 只写本次实际改动的条目

### 疑问与会话
- 只写本次实际改动的条目

### 双语 / 覆盖层
- 双语是否稳定、覆盖层是否实验，要如实写

### 附件与输出
- 只写本次实际改动的条目

### 设置与数据
- 只写本次实际改动的条目
- 迁移未实测时必须写明

### 安全与性能
- 只写本次实际改动的条目

### 已知问题
- 实验功能、未实测功能、仍存在的明显问题

### 安装
下载 `dsh-pdf-workbench-X.Y.Z.zip`，解压后在 DSH 里 Plugins → Add plugin 选择目录并重启；或：

```powershell
dsh plugin add dsh-pdf-workbench@X.Y.Z
```

完整说明见 [README](https://github.com/minggemofashi/dsh-pdf-workbench#readme)。
```

**上传文件**

```text
<工作区>\dist\dsh-pdf-workbench-X.Y.Z.zip
```

## 2. npm：Agent 到 staged，用户批准

npm 包名固定 **`dsh-pdf-workbench`**。必须从**干净 worktree**发布，避免带上 `tools/py.cmd`、`tools/node.cmd`、`__pycache__`。

### 2.1 建干净 worktree

```powershell
cd <工作区>\math-desk
git worktree add ..\dist\npm-release vX.Y.Z
cd ..\dist\npm-release
node -e "console.log(require('./package.json').version)"
```

### 2.2 登录（用户完成 2FA）

历史坑：npm 默认写 `C:\Users\<用户>\.npmrc`，当前沙箱会 `EPERM`。把 userconfig/cache 放到工作区：

```powershell
npm login --auth-type=web --userconfig "<工作区>\.dsh-scratch\npmrc" --cache "<工作区>\.dsh-scratch\npm-cache"
```

- Agent 只输出登录 URL；用户打开并完成 2FA。
- **永远不要向用户索要 2FA 码、密码或 token。**
- 登录进程可能显示 `Logged in on https://registry.npmjs.org/.` 却以退出码 1 结束；**必须以 `npm whoami` 为准**。

### 2.3 staged publish

```powershell
npm stage publish --access public --userconfig "<工作区>\.dsh-scratch\npmrc" --cache "<工作区>\.dsh-scratch\npm-cache"
```

成功输出形如：

```text
+ dsh-pdf-workbench@X.Y.Z (staged with id <stage-id>)
```

把 staged 批准网址发给用户：

```text
https://www.npmjs.com/settings/minggemofashi/staged
```

用户批准并输入 2FA；Agent 不接触验证码。

### 2.4 验证与清理

```powershell
npm view dsh-pdf-workbench@X.Y.Z version --userconfig "<工作区>\.dsh-scratch\npmrc" --cache "<工作区>\.dsh-scratch\npm-cache"
```

输出 `X.Y.Z` 才算成功。然后：

```powershell
cd <工作区>
git -C math-desk worktree remove ..\dist\npm-release
```

## 3. 插件市场

- 正常 npm 发版后，dsh-market 按 npm 版本自动映射；**版本更新不需要提 PR**。
- 当前条目把 `tarball` 固定在旧版本（v1.3.0），所以实际上会装旧版。npm 新版本可见后，把 `tarball` 改为：

```yaml
tarball: https://registry.npmjs.org/dsh-pdf-workbench/-/dsh-pdf-workbench-X.Y.Z.tgz
```

- 只有改仓库地址、包名、分类、描述或回退 tarball 时才改 `awesome-dsh-plugin` 条目。
- 截图只用仓库里的 `screenshots.json`，不需要为截图提 PR。

## 4. 一致性检查

- `package.json` 版本 = `package-lock.json` 根版本 = tag = GitHub Release = npm 版本；
- README 安装命令版本正确；
- Release 的 zip 能下载；
- 远程 main 包含发版提交；
- npm 页面可见；
- 市场条目 tarball 指向正确版本。

## 5. 历史问题速查（已踩过）

| 现象 | 根因 | 处理 |
| --- | --- | --- |
| `fatal: cannot change to 'math-desk'` | 在 Desktop 等目录用了相对路径 | `git -C` 用绝对路径 |
| `SEC_E_NO_CREDENTIALS` | schannel + GCM 凭据不可用 | 加 `-c http.sslBackend=openssl` |
| `couldn't create signal pipe` / 读不到用户名 | 沙箱拦截 GCM 凭据管道 | 对同一条 push 申请最小范围沙箱升级 |
| 远程 tag 指向旧提交 | 网页先建过 tag/Release | 确认本地 tag 后 `push --force`，删除重建 Release |
| GitHub API 创建后 404 | API 短暂一致性 | 用 releases 列表/latest 复核并重试 |
| npm `.npmrc` EPERM | npm 写用户目录被沙箱拒绝 | `--userconfig/--cache` 放工作区 |
| npm login 退出码 1 | 登录成功但 stderr 告警 | 以 `npm whoami` 为准 |
| `npm pack` EPERM | 沙箱限制 | GitHub zip 已够；tgz 可选，必要时在用户本机生成 |
| `npm run build:host-ui` EPERM | esbuild 启子进程被沙箱拦截 | vendor 未变时跳过，不要改构建链掩盖 |
| 市场仍装旧版 | 条目 `tarball` 固定旧版本 | 改成 npm 新版本 tarball |

## 6. 不要做

- 不重新引入 `market/index.json`；
- 不在 npm 新版本可见前更新市场 tarball；
- 不从脏工作目录直接发布 npm；
- 不把 2FA 码、密码、token 发到对话或写入仓库；
- 不在用户没说“发版”时升版本、tag、push、Release、npm。
