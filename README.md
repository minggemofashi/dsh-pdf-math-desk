# PDF 阅读 · 随时问答

> DSH 插件 **dsh-pdf-workbench**：把一本 PDF 读成一张可批注、可提问、可回看的整页工作台。

[![GitHub release](https://img.shields.io/github/v/release/minggemofashi/dsh-pdf-workbench)](https://github.com/minggemofashi/dsh-pdf-workbench/releases)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-Windows-0078D6)](#平台说明)
[![dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-blue)](https://github.com/topics/dsh-plugin)

<p align="center"><img src="./assets/screenshot-hero.jpg" alt="书库首页：欢迎区、像素鲸与本地书库" width="920" /></p>

普通 PDF 阅读器只负责“看”。真正读一本书时，你还要在阅读器、笔记、聊天窗口和文件管理器之间来回切换：这一章讲到哪里了？上次的标注还在吗？想摘一段、问一句，还得复制书名、章名和页码；译文和原文对不上时，只能框一段看一段。

**PDF 阅读 · 随时问答** 把“书 → 章”做成骨架，把阅读、标注、双语、问答和产物放进同一个整页工作台。界面跟随 DSH 主题：颜色、描边和阴影使用 `--dsw-*` token，深色模式无需另装皮肤。

## 它适合谁

- **读数学书、教材、讲义的人**：按章拆 PDF，每章独立会话、独立标注；公式、定理和习题都能就地提问。
- **需要边读边写的人**：手写、文本、形状、框选和疑问标记都在同一张页面上，缩放、翻页、换机器都不跑位。
- **想读原文又需要译文的人**：整章翻译后可左右并排，也可以在原文页上框出区域，只让框里显示译文。
- **不想把整本书塞进模型的人**：书库、书架、阅读、标注和普通预览都不进上下文；只有你主动新建会话时，才发送当前章的必要信息。

## 核心能力

| 模块 | 能力 |
| --- | --- |
| 书库 | 多个书库；`分片/<书 id>/` 一章一个 PDF，或 `整本/` 放整本书；单击切换、双击进入书架 |
| 书架 | 封面、作者、章节数；单击选中、双击进书、空白拖拽框选；书架分组、隐藏书籍、回收站 |
| 章节 | 提取 / 答疑 / 习题三种会话；导入已有会话、重命名、取消挂载；产物按章归档 |
| 阅读器 | 内置 pdf.js；单页 / 连续、适应宽度、缩放、页码跳转、键盘翻页；右侧可开同章预览 |
| 画布 | 页面 + 页外可写区域；手写、文本、形状、框选、疑问标记；笔压、手绘风格、撤销 / 重做 |
| 选择 | 单击选中、拖拽移动；选择工具支持框选多个元素；Backspace / Delete 删除；形状四角缩放 |
| 双语 | 整章翻译后左右并排；框选区域只显示框内译文；原文栏与译文栏各自保存标注 |
| 问答 | 会话自带书名 / 章名 / PDF / 阅读位置 / 产物目录；支持苏格拉底式答疑人格 |
| 附件 | 章节详情内添加 PDF / 图片；PPT 可自动转 PDF（需本机 Office 或 LibreOffice） |
| 数据 | 整机迁移包：会话、工作区登记、插件状态、各书库 `.pdfdesk`；可选字体 / 投影缓存 / 浏览器设置 |
| 设置 | 阅读、模式、快捷键、环境、数据、关于；GitHub 反馈入口；可选手写字体下载 / 导入 / 删除 |

## 第一次使用

首次启动**不会自动生成书库**。打开插件会直接进入书库页：

1. 点「添加书库」，选择库根目录；库根里至少要有 `分片` 或 `整本` 之一；
2. `分片/<书 id>/` 下放按章拆好的 PDF，文件名带页码范围即可（如 `概率论_积分和数学期望_97-138.pdf`），工作台会按页序自动编号；
3. 也可以把整本书 PDF 放进 `整本/`，作为一本“整本书”阅读；
4. 进入书架，双击书，再展开章节：打开 PDF，或从「提取 / 答疑 / 习题」新建会话。

可选：`产物/<书 id>/<章号>/` 存放该章生成的笔记与文档；`封面/` 可放自定义封面。

> 按章拆分推荐用任意 PDF 工具手动完成。插件不做自动章节识别；拆书与命名规则见 [`tools/`](tools/)。

## 阅读与画布

<p align="center"><img src="./assets/screenshot-reader.jpg" alt="单页阅读器：手写、文本框、形状与右侧工具条" width="920" /></p>

- **单页 / 连续**：单页一次专注一页，连续沿章节纵向滚动；模式全局记忆，所有书一致。
- **共享画布**：单页和连续共用同一层页面注释，页外坐标允许越出 `0..1`；切换视图不丢笔记。
- **页外边界**：画布有边界，四条边各有一个「+」方块，每按一次向外扩一页；边界在单页是不参与滚动的覆盖层，不会凭空多出空白。
- **工具**：手、选择、笔、橡皮、文本、疑问、直线、箭头、矩形、菱形、椭圆、框选；工具条在页面边缘竖排，不额外占阅读区。
- **选择与删除**：选择工具可框选多个元素，拖动实时移动，Backspace / Delete 删除；一次撤销可整体还原。
- **页外笔记**：页外只画笔记，不渲染相邻页 PDF；连续模式同样可以在页面外侧起笔。
- **快捷键**：`←/→` 或 `PageUp/PageDown` 翻页，`Home/End` 首末页，`Ctrl +=/-` 缩放，`F` 适应宽度，`T` 切换单页/连续，`G` 跳页，`H` 或按住空格临时切手，`P/E/X` 笔/橡皮/文本，`Q` 疑问框，`Shift+Q` 疑问跳转，`Esc` 关闭阅读器。设置 → 快捷键可改。

## 章节会话与共享前缀

每章的三类会话是“提取 / 答疑 / 习题”。第一次打开某章时，Host 会把该章 `text.md` 读一次，生成一个**隐藏的基础会话**并归档；之后每种模式从这段前缀 fork 出自己的分支。效果是：

- 同一章的多个模式不必反复读同一份章节文本；
- 基础会话不出现在侧栏，也不会混进你的对话列表；
- 分支之间上下文互不污染；扫描件无法提取文本时，自动回退为普通会话。

会话标题形如 `[书 id c04] 答疑`；会话自带书名、章名、PDF、产物目录和阅读位置，不需要每次重新解释“我在读哪本书”。

<p align="center"><img src="./assets/screenshot-qa.jpg" alt="答疑会话：左侧对话，右侧同章 PDF 预览" width="920" /></p>

## 双语与覆盖层

<p align="center"><img src="./assets/screenshot-bilingual.jpg" alt="双语对照：原文与译文两栏" width="920" /></p>

- 整章翻译后可以左右并排；两栏共享页码与翻页，但各有自己的标注层。
- 也可以在原文页上框出区域，只让框内露出译文；框选结果保存在本章 sidecar 中，可导出 / 导入。
- 翻译按页缓存，支持断点续译；需要本机 **Python 3** 与 **DeepSeek API Key**。

<p align="center"><img src="./assets/screenshot-overlay.jpg" alt="在原文页上框选区域，框内显示译文" width="920" /></p>

## 附件、产物与打印

- **附件**：章节详情里添加 PDF / 图片，点击可在阅读器中打开；重名、删除、目录内手工文件都有处理。
- **PPT → PDF**：优先本机 PowerPoint COM，失败再尝试 LibreOffice；没有转换器时给出明确提示，不卡住。
- **产物**：`产物/<书 id>/<章号>/` 下的文本类文件可在右侧预览；Markdown 可以一键生成打印页，用浏览器打印，不落临时 PDF。
- **Office 文件**：DOCX/DOC 不强行在插件内渲染；点击时通过 DSH 官方文档预览打开（需要该章至少有一个会话提供文件地址），失败会提示用 Office 打开。

<p align="center"><img src="./assets/screenshot-attachments.jpg" alt="章节详情：PDF、译文与附件行" width="920" /></p>

## 数据与迁移

整机迁移包默认采集：

- DSH 会话（投影缓存为可选项）；
- 工作区登记 `workspace.json`；
- 插件状态（`libraries.json`、`state.json`、`pending.json`、`links.json`、`pressure.json`、`shelves.json`、`qa-persona.md`）；
- 各书库 `.pdfdesk/` 下的笔记、疑问、缓存与附件清单。

**不会打包**：书籍 PDF、API Key、凭据。可选包含手写字体（约 22 MB）、投影缓存、浏览器 `pdfdesk:*` 设置。

导入前会先全量校验 manifest 的逐文件 sha256；冲突策略：

- `merge`：永不覆盖，同名改为 `*.imported-<时间>`；
- `overwrite`：先做 `pre-import-*` 快照（保留 3 份）再覆盖；
- `skip`：跳过同名文件。

只重写 `libraries.json` 的旧库根前缀；会话 `cwd` / 工作区路径只报告、不擅自改。打包优先使用 Python `zipfile`，解释器不可用时自动回退 Node。

## 设置与反馈

设置页分左侧页签：**阅读 / 模式 / 快捷键 / 环境 / 数据 / 关于**。

- **阅读**：页宽、右侧预览开关、手绘强度、笔压测试、手写字体（下载 / 导入 / 删除）；
- **模式**：数学模式开关（提取 / 答疑 / 习题与数学提示词）；
- **快捷键**：录制、清除；
- **环境**：Python、TeX、API Key 状态与安装入口；
- **数据**：迁移包创建 / 下载 / 导入，书籍包导入，应用导入的浏览器设置；
- **关于**：版本、GitHub、反馈入口（预填版本与系统信息，不含本机路径）。

<p align="center"><img src="./assets/screenshot-settings-reading.jpg" alt="设置 → 阅读：右侧预览、手绘强度、手写字体与备份入口" width="920" /></p>

<p align="center"><img src="./assets/screenshot-settings-data.jpg" alt="设置 → 数据：迁移包、导入迁移包与书籍包导入" width="920" /></p>

## 数据与隐私

- 书库列表与插件设置：`~/.dsh/pdfdesk/`；
- 标注镜像：书库内 `.pdfdesk/annotations/`；疑问、附件、缓存也在 `.pdfdesk/`；
- 会话：由 DSH 保存在本机；
- 不收集遥测，不需要账号，不上传书库；
- **问答与整章翻译**会调用你在 DSH 里配置的模型 API；发送的是会话上下文和必要的页面文本，是否发送由你发起；
- 迁移包不包含书籍 PDF 与凭据。

## 环境要求

- **平台**：Windows 10 / 11（x64）优先适配；macOS / Linux 未适配、未测试。
- **DSH**：插件版本要求见 `package.json` 的 `engines.dsh`。
- **可选环境**：
  - Python 3：整章翻译、扫描件文本提取、迁移包 Python 打包；
  - TeX Live（xelatex、ctex）：Markdown → PDF；
  - 本机 PowerPoint 或 LibreOffice：PPT → PDF；
  - 手写字体可在线下载（约 22 MB）或本地导入，不装时回退系统楷体。

## 安装

### 插件市场 / DSH 插件页（推荐）

DSH → **Plugins → Add plugin** → 选择插件目录或市场条目 → 重启 DSH。

### npm

```bash
dsh plugin add dsh-pdf-workbench
```

### 本地目录（开发）

DSH → **Plugins → Add plugin** → 选择本仓库目录 → 重启 DSH。客户端改动不会热更新，需要重启。

## 常见问题

**支持扫描版 PDF 吗？**  
支持打开、翻页、缩放、手写 / 形状标注和框选。插件本身不做 OCR；文本选择、整章翻译和问答质量取决于所选模型能否直接读页面图像。

**可以自动拆书吗？**  
不自动识别章节。插件提供拆分工具和命名规则，推荐按目录手动拆成“一章一个 PDF”。

**为什么整本书会话很贵？**  
整本书会一次性进入上下文；只适合小文件或论文。按章拆分的成本和定位都更好。

**手写字体下载失败？**  
字体源是上游 OFL 发布资产；网络不可达时可在设置里用「导入本地字体」，删除后回退系统楷体。

**翻译按钮没反应？**  
检查设置 → 环境里的 Python 与 DeepSeek API Key；缺环境时按钮会弹出说明和安装入口。

**会同步到云端吗？**  
不会。需要备份时用设置 → 数据里的迁移包。

**macOS / Linux 能用吗？**  
未适配、未测试；路径分隔符、Python/TeX 检测都按 Windows 编写。

## 开发

- 设计、数据布局、模块边界：[`docs/`](docs/)
- 版本变化：[`CHANGELOG.md`](CHANGELOG.md)
- 安装与分发：[`安装与分发.md`](安装与分发.md)
- 页面截图：`assets/screenshot-*.jpg`，展示文件见 [`screenshots.json`](screenshots.json)

## 许可与致谢

- 插件代码：MIT
- [pdf.js](https://mozilla.github.io/pdf.js/)：Apache-2.0
- [rough.js](https://roughjs.com/)：MIT（手绘形状）
- [Excalifont](https://github.com/excalidraw/excalidraw)：SIL OFL 1.1（拉丁手写）
- [Xiaolai（小赖字体）](https://github.com/lxgw/kose-font)：SIL OFL 1.1（中文手写）

字体与第三方许可文件随包放在 `vendor/` 下。
