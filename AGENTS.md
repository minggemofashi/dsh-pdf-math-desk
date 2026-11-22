# 给 Agent 的约定（dsh-pdf-math-desk）

这个仓库是 **DSH 插件 `dsh-pdf-math-desk`**（“数学工作台”）。以下规则适用于本目录；用户明确要求时以用户为准。

## 每次修改插件，必须做一次 git 存档

任何一次功能、修复、文档或打包改动，收尾时按顺序做：

1. **跑检查**（在仓库根目录执行，Node 用 DSH 自带运行时或系统 Node）：
   - `node --check client.js`
   - `node --check index.js`
   - 逐个 `node --check src/host/*.js`
   - 仓库外若有 `.dsh-scratch/host-test.mjs` / `check-deps.mjs` / `check-keys.mjs`，也一并跑；测试失败不得提交。
2. **升版本号**：改 `package.json` 的 `version`（修复/文档 = 补丁位 +1，新功能 = 次版本位 +1）。
3. **更新文档**：在 `CHANGELOG.md` 顶部加一条；同步更新 `README.md` 里受影响的说明；`安装与分发.md` 只在安装方式变化时改。
4. **提交**：
   - `git add -A`
   - `git commit -m "vX.Y.Z: <一句话摘要>"`
   - `git tag vX.Y.Z`
   - `git push && git push --tags`
5. **要对外分发时**：重新打 `dist/dsh-pdf-math-desk-<version>.zip`（说明见下），挂到 GitHub Releases，不要提交 `dist/`。完整发布流程（GitHub Release / npm staged 2FA / 市场索引顺序 / 隐私要求）见 `docs/RELEASE.md`。

提交信息风格：`v0.13.2: 修复整本库没有分片目录时报错`，一行说清“改了什么、为什么”。

## 仓库边界

- **进 git**：`index.js`、`client.js`、`src/`、`locale/`、`vendor/`（pdf.js + LICENSE）、`tools/`（拆分工具与规范）、`samples/`（内置示例书库 PDF + manifest）、`README.md`、`安装与分发.md`、`CHANGELOG.md`、`package.json`、`cordis.patch.yml`、`icon.svg`、本文件。
- **不进 git**：`node_modules/`、`dist/`（构建产物）、`.dsh-scratch/`、临时文件、任何带本机绝对路径或凭据的文件。
- `cordis.patch.yml` 必须保持**中性**：不写具体书库路径，示例只放在注释里。真实书库列表由运行时的 `~/.dsh/mathdesk/libraries.json` 管理。
- 不要提交任何**个人目录的绝对路径**（真实书库路径只放在运行时的 `~/.dsh/mathdesk/libraries.json`，仓库里一律用示例 `D:\数学书库`）、API key、token 等；提交前 `git diff --cached` 检查一遍。

## 打包与分发

- 分发副本放在仓库外的 `dist/`，由“复制插件目录 + 把 `cordis.patch.yml` 换成中性版 + 替换文档里的本机路径”生成；文件名 `dsh-pdf-math-desk-<version>.zip`。
- 安装方式见 `安装与分发.md`：DSH → Plugins → Add plugin 选目录；或 `plugin_manager install_bundle` 绝对路径。
- 版本号必须与 tag、zip 文件名、CHANGELOG 一致。

## 代码注意

- 客户端插件是 Host + 浏览器两半；Host 只依赖 Node 内置模块，浏览器侧用 `window.__ModuleLoader__` 注册 slot。
- 不要在 Host 里直接访问未声明 inject 的 `ctx.<service>`；用 `ctx.get('<service>')`，否则会抛 `cannot get property ... without inject`。
- 不要用 PowerShell 的 `Get-Content`/`Set-Content` 读写含中文的 UTF-8 文件（会按 GBK 解码损坏）；用编辑器/Node/本仓库的读写工具。
- 客户端改动无法热更新：改完要重启 DSH 验证；不要承诺 HMR。
