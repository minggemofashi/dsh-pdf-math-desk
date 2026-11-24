# 发版流程（固定版）

> 用户说「更新 / 发版 / 发布」时，**按本文执行**，不要重新设计流程。
> 日常修改仍然只本地提交；本流程只在明确发版时启动。

## 0. 发版前

1. 确认 `package.json` 版本：修复 +补丁位，新功能 +次版本位。
2. `CHANGELOG.md` 顶部新增 `## vX.Y.Z`，写清改了什么。
3. 如果界面有变化：更新 `README.md` 截图与 `screenshots.json`（市场从仓库读取，不需要为截图提 PR）。
4. 跑检查：

```powershell
cd math-desk
node --check client.js
node --check index.js
Get-ChildItem src\host\*.js | ForEach-Object { node --check $_.FullName }
cd ..
node .dsh-scratch\check-keys.mjs
node .dsh-scratch\check-deps.mjs
node .dsh-scratch\side-smoke.mjs
node .dsh-scratch\notes-test.mjs
node .dsh-scratch\session-seed-test.mjs
node .dsh-scratch\page-store-test.mjs
node .dsh-scratch\annotation-store-test.mjs
node .dsh-scratch\host-test.mjs
```

## 1. GitHub Release（默认渠道）

先构建宿主 primitives 产物（构建依赖只在开发时安装，不随插件安装）：

```powershell
cd math-desk
npm install
npm run build:host-ui
```

然后构建 zip：

```powershell
powershell -ExecutionPolicy Bypass -File .\build-dist.ps1
# 产出 ..\dist\dsh-pdf-workbench-X.Y.Z.zip

git add -A
git commit -m "vX.Y.Z: <一句话>"
git tag vX.Y.Z
git push origin main
git push --tags origin
```

> **默认交付，不碰用户凭据。** Agent 环境没有可用 GitHub/npm 凭据时，不要索要 2FA 码、密码或 token，也不要停在“等凭据”。保留本地提交和 tag，按下面的「本地交付格式」把文件和网址交给用户，由用户本机 push / 上传 / 登录。

创建 GitHub Release `vX.Y.Z`，上传：

- `dsh-pdf-workbench-X.Y.Z.zip`（必须）
- 可选 `dsh-pdf-workbench-X.Y.Z.tgz`（干净 worktree 里 `npm pack`，作为市场 npm 失败时的回退）

Release 说明直接复制 `CHANGELOG` 的该版本条目。

## 1.5 本地交付格式（固定）

每次发版，Agent 最终回复必须包含以下三类信息，短而可复制：

**1. 本地文件（绝对路径）**

```text
<workspace>\dist\dsh-pdf-workbench-X.Y.Z.zip
<workspace>\dist\dsh-pdf-workbench-X.Y.Z.tgz   # 有则给
```

**2. GitHub Release 新建网址**

```text
https://github.com/minggemofashi/dsh-pdf-workbench/releases/new?tag=vX.Y.Z
```

用户在该页选择/上传 zip，Release 标题填 `vX.Y.Z`，正文粘贴 CHANGELOG 对应条目。

**3. npm 包网址与安装命令**

```text
https://www.npmjs.com/package/dsh-pdf-workbench
dsh plugin add dsh-pdf-workbench@X.Y.Z
```

**可选：市场条目修正**

只有需要回退 tarball 或改仓库/包名/分类/描述时，才给本地 YAML 文件路径和 PR 正文；正常 npm 发版不需要为版本提市场 PR。

Agent **不负责**代替用户输入 2FA、登录 GitHub/npm、上传 Release 资产；这些由用户在本机浏览器或交互终端完成。若用户明确要求且环境已有凭据，Agent 才可以尝试 push/上传。

## 2. npm

npm 包名固定 **`dsh-pdf-workbench`**。必须从**干净 worktree / 干净 clone**发布，避免带上本机 `tools/py.cmd`、`tools/node.cmd`、`__pycache__`：

```powershell
cd <工作区>\math-desk
git worktree add ..\dist\npm-release vX.Y.Z
cd ..\dist\npm-release
npm login --auth-type=web
npm stage publish --access public
```

> 登录和 2FA 由用户在本机交互完成；Agent 不索要 2FA 码。若 Agent 环境没有已登录的 npm 会话，直接交付 npm 包网址和发布命令，不阻塞本地发版。

然后批准：

- 网页：https://www.npmjs.com/settings/minggemofashi/staged
- 或：`npm stage approve <stage-id>`（真实 6 位 OTP）

批准后验证：

```powershell
npm view dsh-pdf-workbench@X.Y.Z version
```

清理：

```powershell
cd <工作区>
git -C math-desk worktree remove ..\dist\npm-release
```

> 注意：npm 的 granular token 不能代替 2FA 发布；必须交互登录。不要用字面量 `你的6位验证码`。

## 3. 插件市场

首次上架：向 `awesome-dsh-plugin` 提交 `data/plugins/<owner>__<repo>.yml`；本插件条目已提交（PR 保留）。

首次之后：

- npm 包 `repository` 指向同一仓库时，dsh-market 自动做 npm 映射，**版本更新不需要再提 PR**；
- 只有改仓库地址、包名、分类或描述时才改 awesome 条目；
- 截图换图只需更新仓库 `screenshots.json`；
- 若 npm 发布失败，才回退到 tarball：上传新版本 `.tgz` 并更新条目的 `tarball` 字段（需要 PR）。

## 4. 一致性检查

- `package.json` 版本 = tag = GitHub Release = npm 版本；
- Release 的 zip / tgz 能下载；
- `README.md` 安装命令版本正确；
- 远程 `main` 包含发版提交；
- npm 页面可见，market 能搜到（缓存可能有延迟）。

## 5. 旧包处理（已完成）

旧包 `dsh-pdf-math-desk` 已从 npm 删除（`npm view` 返回 404），无需再处理；不要重新发布这个名称。

## 6. 不要做

- 不重新引入 `market/index.json`（收录由 awesome 列表负责）；
- 不发 npm 前不更新市场条目的 npm 映射；
- 不用本机工作目录直接 `npm publish`（会带上未跟踪的包装脚本/pycache）；
- 不在用户没说“发版”时升版本/tag/push/Release/npm。
