# 数学工作台 · dsh-pdf-math-desk

[![npm](https://img.shields.io/npm/v/dsh-pdf-math-desk)](https://www.npmjs.com/package/dsh-pdf-math-desk)
[![dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-blue)](https://github.com/topics/dsh-plugin)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

> 面向数学书阅读的 DSH 插件：以「书 → 章」为骨架，把 **PDF 阅读、章节会话、产物管理** 放进同一个整页工作台。

<p align="center">
  <img src="./icon.svg" width="96" alt="math workbench icon" />
</p>

## 为什么

读数学书是学数学最好的方式之一，但“摘抄—提问—对答案—做笔记”这条链路很费时间。这个插件把它收进一个界面：

- **提取**：公式转成 `$...$` / `$$...$$`，直接贴进 Obsidian；
- **答疑**：会话自带书名、章名、PDF 与页码，跟着你读到的位置问；
- **习题**：做本章习题、对答案；
- 产物（md / 渲染 PDF）留在章节目录里，随读随查。

## 功能一览

| 模块 | 能力 |
| --- | --- |
| 书库 | 多书库、单击切换、🗑 移除（确认）；分片 / 整本两种模式 |
| 书架 | 单击选中、双击进章节、拖拽框选；隐藏书籍、自定义书架（可嵌套）、删除释放 |
| 章节 | 会话（提取/答疑/习题）、导入已有会话、重命名、整理提纲 |
| 产物 | 行内预览、md → PDF、产物会话、按需折叠、移入回收站 |
| 阅读器 | pdf.js，单页/连续、翻页、页码、缩放、键盘操作、右栏预览开关 |
| 设置 | ⚙ 菜单：版本号、右侧预览、非 PDF 删除保护、GitHub 入口 |
| 清理 | 会话归档；产物删除进 `<库根>\回收站\`，可恢复 |

## 安装

### DSH 插件市场 / Discover
搜索 `dsh-pdf-math-desk` 安装（收录后）。

### npm

```bash
dsh plugin add dsh-pdf-math-desk@0.35.3
```

### 本地目录
DSH → Plugins → Add plugin → 选择本目录。

## 开始使用

1. 打开左侧栏的工作台图标；
2. 书库页「添加书库」，选择库根（内含 `分片\` 或 `整本\`）；
3. 进入书架 → 双击一本书 → 展开章节 → 打开 PDF 或新建会话。

### 拆分与命名

- 一章一个 PDF，**保留目录**；文件名带页码范围或 `cNN` 即可，工作台自动编号；
- **书 id = 书目名 / 分片名前缀，添加后不要重命名该目录**（旧会话和产物靠它关联）；
- 不想拆：整本 PDF 放 `<库根>\整本\`，会作为一整本书（只有一章）。

### 给 AI 的提示词

> 给我一份报告，用 markdown 格式，数学公式行内用 $ 格式，行间用 $$ 格式，不要出现 \[ 和 \( 格式

生成的 md 放进当前章的 `产物` 目录，即可预览、转 PDF。

## 配置

- `libraries`：库目录（默认 `~\数学书库`）；
- `resumeRatio`：上下文占用达到多少时续开会话（默认 0.85）；
- `updateProxy`：检查更新所用代理（可选）。

运行时数据在 `~/.dsh/mathdesk/`：`libraries.json`、`state.json`、`links.json`、`pending.json`、`pressure.json`、`shelves.json`。

## 隐私

- 无遥测，不收集数据；
- 唯一外部请求：点击「检查更新」时访问 GitHub Releases；
- 书库只读；删除只移动到 `<库根>\回收站\`。

## 限制

- 面向数学书工作流；阅读器只读，无标注/笔记；
- Markdown→PDF 需本机 Python + TeX Live（xelatex），插件运行时不依赖；
- 书 id 由目录/文件名推导，改名会使旧会话/产物失联；
- 界面显示本机真实路径，跨机器需重新添加书库；
- 客户端改动需重启 DSH 生效。

## 开发

```bash
node --check client.js
node --check index.js
node --check src/host/routes.js
```

目录：`index.js` + `src/host/*`（Host，仅 Node 内置模块）、`client.js`（浏览器）、`tools/`（拆分工具、`md2tex.py`）、`samples/`（示例书）。

## 作者想说

详见 [docs/DETAIL.md](./docs/DETAIL.md) 底部。一句话：这是为**自己学习数学的工作流**做的插件——让 AI 参与答疑、标答与笔记，把摘抄交给工具；它不是必须的，只是一条被走过、现在整理成插件的工作流。

## 许可

[MIT](./LICENSE)
