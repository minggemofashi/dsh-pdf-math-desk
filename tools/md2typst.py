"""把整章译文 markdown 排成 Typst 文档并编译成读版 PDF（v1.5 D 的读版内核）。

    py -3 tools/md2typst.py <src.md> <out.pdf> [title]

环境变量（与 tools/md2tex.py 对齐）：

    MATH_DESK_TYPST      typst 可执行文件（解析顺序见 tools/typst_runtime.py）
    MATH_DESK_FONTSIZE   9 / 10 / 11 / 12pt，默认 11pt
    MATH_DESK_PAPER      "宽,高"（英寸）；缺省 A4，页边距 2.4cm
    MATH_DESK_NO_TITLE   1 = 文首不排标题（即使命令行给了 title）
    MATH_DESK_CJKFONT    中文字体家族，默认 Microsoft YaHei

数学：每个 `$…$` / `$$…$$` 都交给 tools/latex_to_typst.py 转成 Typst 数学。
转换器明确拒绝的构造（\\color、\\phantom、\\vspace 等）不会让整章失败：原始
LaTeX 以等宽字体照排，并向 stderr 打一条
`warning: formula not converted at line N (display math): …`。
一章里有坏公式，读者看到的是那一行 LaTeX，而不是打不开的 PDF。

和 tools/md2tex.py 的关系：CLI、环境变量、markdown 覆盖、正文观感都对齐它，
但排版内核换成 Typst（无需 TeX 发行版，字体走系统字体）。两处有意的差异：

  * `MATH_DESK_NO_TITLE=1` 优先于命令行给的 title（md2tex 里显式 title 优先）；
  * 文首的 `##` 标题不再丢弃（md2tex 会丢，避免和 title 重复；读版 PDF 宁可多
    一行，也不吞掉译文）。

降级都不会静默，一律带一条 `warning:`：
  * 公式转换失败 -> 原始 LaTeX 等宽照排（不中断整章）；
  * 表格超过 12 列 -> 逐行文本；
  * 整篇第一次编译失败 -> 不排强调（`*`/`_`）重排一次；
  * 环境变量写错 -> 退回默认纸张/字号。
"""
import os
import re
import shutil
import sys
from collections import deque

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import typst_runtime
from latex_to_typst import convert_latex

# A4 与 2.4cm 页边距，和 md2tex 的 geometry 一致（1in = 72pt，1cm = 28.35pt）。
A4_WIDTH = 595.28
A4_HEIGHT = 841.89
MARGIN = 68.03
DEFAULT_PT = 11.0
FONT_SIZES = (9.0, 10.0, 11.0, 12.0)

# 行距：xelatex 的 \linespread{1.32} 在 ctexart 11pt 下实测基线间距 17.88pt、
# 字号 10.91pt（≈1.64em）。Typst 的 par.leading 是行高之外的额外空隙（基础行高
# 在 11pt / Microsoft YaHei 下是 8.32pt），0.87em 得到 8.32+9.57≈17.9pt，和
# md2tex 的读版观感一致。直接写 leading: 1.32em 会比 md2tex 松 5pt。
LEADING_EM = 0.87

FENCE_RE = re.compile(r"^\s*```")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
LIST_RE = re.compile(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$")
ROW_RE = re.compile(r"^\s*\|.*\|\s*$")
SEPARATOR_CELLS_RE = re.compile(r"^[\s:|-]+$")
LINK_OR_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\([^)]*\)|\[([^\]]+)\]\([^)]*\)")

RULE_LINES = ("---", "***", "___")
PAGEBREAK_LINES = ("\\newpage", "<!-- pagebreak -->")
# 中文收尾标点：既不能出现在行首（Typst 在行内公式/代码这种「对象」之后允许
# 断行，会把它们顶到下一行行首），也要跟着行间公式走（`$$…$$。` 的句号）。
CLOSING_PUNCTUATION = "，、。；：？！）》」』】”’"
# Typst markup 里要转义的字符：反斜线、代码/数学/强调/标签/引用起始符，以及
# 会提前闭合 content block 的方括号（本模块把正文放进 [...] 里排版）。
SPECIAL_MARKUP = set("\\#$*_`<>@~[]")
# 表格超过这个列数就没法在读版页面上排了，降级成逐行文本并 warning。
MAX_TABLE_COLUMNS = 12

USAGE = (
    "用法：py -3 tools/md2typst.py <src.md> <out.pdf> [title]\n"
    "\n"
    "把一章 markdown 译文排成 Typst 文档并编译成读版 PDF（v1.5 D）。\n"
    "环境变量：MATH_DESK_TYPST、MATH_DESK_FONTSIZE（9/10/11/12pt，默认 11）、\n"
    "          MATH_DESK_PAPER（\"宽,高\" 英寸）、MATH_DESK_NO_TITLE=1、MATH_DESK_CJKFONT\n"
)


# ---------------------------------------------------------------- 环境与版式
def warn(message):
    """降级路径的唯一出口：stderr + `warning:` 前缀，测试按这个前缀计数。"""
    print("warning: " + message, file=sys.stderr)


def font_size():
    raw = os.environ.get("MATH_DESK_FONTSIZE", "").strip()
    if raw == "":
        return DEFAULT_PT
    value = raw[:-2].strip() if raw.lower().endswith("pt") else raw
    try:
        size = float(value)
    except ValueError:
        warn("MATH_DESK_FONTSIZE=%r 不是字号，改用 %.0fpt" % (raw, DEFAULT_PT))
        return DEFAULT_PT
    if size not in FONT_SIZES:
        warn("MATH_DESK_FONTSIZE=%r 不在 9/10/11/12pt 里，改用 %.0fpt" % (raw, DEFAULT_PT))
        return DEFAULT_PT
    return size


def paper_size():
    """(宽, 高)，单位 pt。MATH_DESK_PAPER 用英寸，和 md2tex 的 geometry 一致。"""
    raw = os.environ.get("MATH_DESK_PAPER", "").strip()
    if "," in raw:
        width_text, _, height_text = raw.partition(",")
        try:
            width = float(width_text) * 72.0
            height = float(height_text) * 72.0
        except ValueError:
            warn("MATH_DESK_PAPER=%r 不是 \"宽,高\" 英寸数值，改用 A4" % raw)
            return A4_WIDTH, A4_HEIGHT
        # 2in–40in：再小排不下一个中文字，再大基本是把单位写错了。
        if 144.0 <= width <= 2880.0 and 144.0 <= height <= 2880.0:
            return width, height
        warn("MATH_DESK_PAPER=%r 超出 2–40 英寸，改用 A4" % raw)
    elif raw != "":
        warn("MATH_DESK_PAPER=%r 不是 \"宽,高\" 形式，改用 A4" % raw)
    return A4_WIDTH, A4_HEIGHT


def cjk_font():
    """中文正文字体。SimSun 在显示器上太细，默认用 Windows 自带的雅黑。"""
    raw = os.environ.get("MATH_DESK_CJKFONT", "").strip()
    return raw if raw != "" else "Microsoft YaHei"


def typst_string(text):
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def preamble():
    """Typst 文档设置，对应 md2tex 的 PREAMBLE（观感逐项对齐）。"""
    width, height = paper_size()
    size = font_size()
    lines = [
        "// 由 tools/md2typst.py 生成（v1.5 D：Typst 读版 PDF）。",
        "// 要改版式请改工具里的 preamble()，不要手改这个临时文件。",
        "#set page(",
        "  width: %.2fpt," % width,
        "  height: %.2fpt," % height,
        "  margin: %.2fpt," % MARGIN,
        "  numbering: \"1\",",
        ")",
        "#set text(font: (%s, \"New Computer Modern\"), lang: \"zh\", size: %.2fpt)"
        % (typst_string(cjk_font()), size),
        "#set par(",
        "  justify: true,",
        "  leading: %gem," % LEADING_EM,
        "  spacing: 0.35em,",
        "  first-line-indent: (amount: 2em, all: true),",
        ")",
        "#set heading(numbering: none)",
        "#show heading.where(level: 1): it => block(",
        "  above: 1.15em, below: 0.65em,",
        ")[#text(size: 1.28em, weight: \"bold\", it.body)]",
        "#show heading.where(level: 2): it => block(",
        "  above: 1em, below: 0.55em,",
        ")[#text(size: 1.14em, weight: \"bold\", it.body)]",
        "#show heading.where(level: 3): it => block(",
        "  above: 0.9em, below: 0.5em,",
        ")[#text(size: 1.04em, weight: \"bold\", it.body)]",
        "#set list(indent: 1.4em, body-indent: 0.6em, spacing: 0.45em)",
        "#set enum(indent: 1.4em, body-indent: 0.6em, spacing: 0.45em)",
        "#show quote.where(block: true): it => block(",
        "  width: 100%,",
        "  stroke: (left: 2pt + luma(180)),",
        "  inset: (left: 10pt, top: 2pt, bottom: 2pt),",
        "  above: 0.6em, below: 0.6em,",
        ")[#text(style: \"normal\", it.body)]",
        "#show raw.where(block: true): it => block(",
        "  width: 100%,",
        "  inset: 8pt,",
        "  stroke: 0.5pt + luma(200),",
        "  radius: 2pt,",
        "  fill: luma(250),",
        "  above: 0.7em, below: 0.7em,",
        ")[#text(size: 0.9em, it)]",
        "#show math.equation.where(block: true): set block(above: 0.8em, below: 0.8em)",
        "#show table: set text(size: 0.95em)",
    ]
    return "\n".join(lines)


# ------------------------------------------------------------------ 行内排版
def escape_markup(text):
    """把一段纯文本变成 Typst markup 文本（`*`、`$`、`#` 之类都转义）。"""
    out = []
    index = 0
    length = len(text)
    while index < length:
        char = text[index]
        # `//` 在 markup 里是行注释起始（前面有空格时会把整行后半段吃掉），
        # 所以成对的斜线逐个转义；单个 `/` 不是特殊字符，保持原样。
        if char == "/" and text[index + 1:index + 2] == "/":
            out.append("\\/\\/")
            index += 2
            continue
        if char in SPECIAL_MARKUP:
            out.append("\\" + char)
        else:
            out.append(char)
        index += 1
    return "".join(out)


def raw_inline(text, collapse=True):
    """等宽照排一段文字（转换失败的公式、行内代码）。"""
    if collapse:
        text = " ".join(text.split())
    ticks = max((len(run) for run in re.findall(r"`+", text)), default=0)
    fence = "`" * (ticks + 1)
    pad = " " if text.startswith("`") or text.endswith("`") else ""
    return fence + pad + text + pad + fence


def describe_failure(result):
    if result.error:
        category = str(result.error.get("category") or "error")
        message = str(result.error.get("message") or "").strip()
        return "%s: %s" % (category, message) if message else category
    return "转换结果为空"


def formula(latex, line, display, suffix=""):
    """一个公式 -> Typst 数学；转换不出来就等宽照排 + warning，不中断整章。"""
    body = latex.replace("$", "").strip()
    result = convert_latex(body, display=display)
    typst = (result.typst or "").strip()
    if typst == "":
        warn(
            "formula not converted at line %d (%s): %s"
            % (line, "display math" if display else "inline math", describe_failure(result))
        )
        return raw_inline(body) + escape_markup(suffix)
    if display:
        if suffix:
            # 句末标点放进公式里，跟着居中的行间公式走，不在页面左边留一行「。」
            return '$ %s "%s" $' % (typst, suffix)
        return "$ %s $" % typst
    return "$%s$" % typst


def glue_closing_punctuation(rendered, text, index):
    """把紧跟行内对象的中文收尾标点并进同一个不可断行盒子。

    `$x$；` 这种位置 Typst 允许断行，实测会把「；」顶到下一行行首（中文排版
    不该出现的行首标点）。#box 让公式和标点成为不可分割的一格。

    `#box[…]` 是代码表达式，后面紧跟 `(`、`[`、`.` 会被 Typst 当成函数调用或
    字段访问（"expected function, found content"），这种位置退回不 box：宁可
    偶尔一个标点顶到行首，也不要整章编译失败。
    """
    start = index
    while index < len(text) and text[index] in CLOSING_PUNCTUATION:
        index += 1
    if index == start:
        return rendered, start
    if index < len(text) and text[index] in "([.":
        return rendered, start
    return "#box[%s%s]" % (rendered, text[start:index]), index


def render_inline(text, line, depth=0, plain=False):
    """markdown 行内语法 -> Typst markup（数学单独走 formula()）。

    `plain=True` 是兜底模式：不排粗体/斜体，把 `*`、`_` 全部当普通字符转义。
    只在整个文档第一次编译失败时用（见 render()），保证再怪的强调写法也不会
    让一章打不开——数学、代码、表格、列表照旧。
    """
    slots = []

    def hold(rendered):
        slots.append(rendered)
        return "\x01%d\x01" % (len(slots) - 1)

    # 图片整段丢弃（md2tex 也丢）；链接只留文字，`![…](…)` 之后不再参与转义。
    if "[" in text:
        text = LINK_OR_IMAGE_RE.sub(
            lambda match: hold(
                "" if match.group(0).startswith("!")
                else render_inline(match.group(2), line, plain=plain)
            ),
            text,
        )

    out = []
    buffer = []

    def flush():
        if buffer:
            out.append(escape_markup("".join(buffer)))
            buffer.clear()

    index = 0
    length = len(text)
    while index < length:
        char = text[index]
        if char == "$":
            if text.startswith("$$", index):
                end = text.find("$$", index + 2)
                if end < 0:
                    buffer.append(text[index:index + 2])
                    index += 2
                    continue
                flush()
                warn("display math inside a paragraph at line %d: 已按行内公式排版" % line)
                out.append(formula(text[index + 2:end], line, display=False))
                index = end + 2
                continue
            end = text.find("$", index + 1)
            if end < 0:
                buffer.append(char)
                index += 1
                continue
            body = text[index + 1:end]
            if body.strip() == "":
                buffer.append(text[index:end + 1])
                index = end + 1
                continue
            flush()
            piece, index = glue_closing_punctuation(formula(body, line, display=False), text, end + 1)
            out.append(piece)
            continue
        if char == "`":
            end = text.find("`", index + 1)
            if end < 0:
                buffer.append(char)
                index += 1
                continue
            flush()
            piece, index = glue_closing_punctuation(
                raw_inline(text[index + 1:end], collapse=False), text, end + 1
            )
            out.append(piece)
            continue
        # 强调只认「内容里没有同类记号、首尾不是空白」的成对标记（和 md2tex
        # 的正则、Typst 的强调边界都一致）：`***粗斜体***`、`2*3*4` 这类含糊
        # 写法宁可原样转义，也不要让一个落单的 `*` 去段落末尾找配对——那会生成
        # 无法编译的 markup，或者把半段话变成斜体。
        if not plain and depth == 0 and text.startswith("**", index):
            end = text.find("**", index + 2)
            if end > index + 2 and "*" not in text[index + 2:end] \
                    and not text[index + 2].isspace() and not text[end - 1].isspace():
                flush()
                inner = render_inline(text[index + 2:end], line, depth + 1, plain)
                out.append("*" + inner + "*")
                index = end + 2
                continue
        if not plain and depth == 0 and text.startswith("__", index):
            end = text.find("__", index + 2)
            if end > index + 2 and "_" not in text[index + 2:end] \
                    and not text[index + 2].isspace() and not text[end - 1].isspace():
                flush()
                inner = render_inline(text[index + 2:end], line, depth + 1, plain)
                out.append("*" + inner + "*")
                index = end + 2
                continue
        if not plain and depth == 0 and char == "*":
            end = text.find("*", index + 1)
            if end > index + 1 and not text.startswith("**", index + 1) \
                    and not text.startswith("**", end) \
                    and not text[index + 1].isspace() and not text[end - 1].isspace():
                flush()
                inner = render_inline(text[index + 1:end], line, depth + 1, plain)
                out.append("_" + inner + "_")
                index = end + 1
                continue
        buffer.append(char)
        index += 1
    flush()
    rendered = "".join(out)
    for slot, value in enumerate(slots):
        rendered = rendered.replace("\x01%d\x01" % slot, value)
    return rendered


def text_block(text, line, plain=False):
    """一行块级文字 -> Typst markup，避开行首会被当成结构标记的字符。"""
    rendered = render_inline(text, line, plain=plain)
    if rendered[:1] in ("=", "/"):
        rendered = "\\" + rendered
    return rendered


# -------------------------------------------------------------- 数学定界归一
def normalize_math_delimiters(line):
    """把模型爱用的 \\(…\\) 和 \\[…\\] 归一成 $…$ 和 $$…$$（同 md2tex）。"""
    line = re.sub(r"(?<!\\)\\\(", "$", line)
    line = re.sub(r"(?<!\\)\\\)", "$", line)
    line = re.sub(r"(?<!\\)\\\[", "$$", line)
    line = re.sub(r"(?<!\\)\\\]", "$$", line)
    return line


def split_tail_punctuation(tail):
    """`$$…$$。` 里紧跟公式的句末标点：它属于公式，不属于下一段。"""
    end = 0
    while end < len(tail) and tail[end] in CLOSING_PUNCTUATION:
        end += 1
    return tail[:end], tail[end:]


def tokenize(lines):
    """把源行切成四元组 ("text", 行, 行号, "") / ("display", 公式, 行号, 句末标点)。

    行间公式连同它跨的若干行被单独提出来，前后文各自成段；代码块里的 `$$`
    和 `\\(` 原样保留，不动（样板里的代码不该被数学归一化改写）。多行行间公式
    遇到空行就收手：宁可留一条 warning，也不要让一个没闭合的 `$$` 吞掉整章。
    """
    tokens = []
    in_code = False
    queue = deque((index, line) for index, line in enumerate(lines))
    while queue:
        index, line = queue.popleft()
        line_number = index + 1
        if FENCE_RE.match(line):
            in_code = not in_code
            tokens.append(("text", line, line_number, ""))
            continue
        if in_code:
            tokens.append(("text", line, line_number, ""))
            continue
        line = normalize_math_delimiters(line)
        if "$$" not in line:
            tokens.append(("text", line, line_number, ""))
            continue
        start = line.find("$$")
        prefix = line[:start]
        if prefix.strip():
            tokens.append(("text", prefix, line_number, ""))
        rest = line[start + 2:]
        end = rest.find("$$")
        if end >= 0:
            suffix, tail = split_tail_punctuation(rest[end + 2:])
            tokens.append(("display", rest[:end].strip(), line_number, suffix))
            if tail.strip():
                queue.appendleft((index, tail))
            continue
        parts = [rest]
        closed = False
        suffix = ""
        while queue:
            next_index, next_line = queue.popleft()
            if FENCE_RE.match(next_line):
                parts.append(next_line)
                continue
            if next_line.strip() == "":
                break
            next_line = normalize_math_delimiters(next_line)
            position = next_line.find("$$")
            if position < 0:
                parts.append(next_line)
                continue
            parts.append(next_line[:position])
            closed = True
            suffix, tail = split_tail_punctuation(next_line[position + 2:])
            if tail.strip():
                queue.appendleft((next_index, tail))
            break
        if not closed:
            warn("unclosed display math at line %d: 已按到空行为止收尾" % line_number)
        body = " ".join(part.strip() for part in parts if part.strip())
        tokens.append(("display", body, line_number, suffix))
    return tokens


# ------------------------------------------------------------------ 块级排版
def next_list_item(tokens, start):
    """松散列表：空行之后若还是列表项，就不算断开。"""
    index = start
    while index < len(tokens):
        kind, value, _line, _suffix = tokens[index]
        if kind != "text":
            return None
        if value.strip() == "":
            index += 1
            continue
        return LIST_RE.match(value)
    return None


def longest_backtick_run(lines):
    longest = 0
    for line in lines:
        for run in re.findall(r"`+", line):
            longest = max(longest, len(run))
    return longest


def code_block(tokens, index):
    _kind, value, _line, _suffix = tokens[index]
    info = value.strip()[3:].strip()
    body = []
    index += 1
    while index < len(tokens):
        kind, value, _line, _suffix = tokens[index]
        if kind == "text" and FENCE_RE.match(value):
            index += 1
            break
        body.append(value.rstrip())
        index += 1
    fence = "`" * max(3, longest_backtick_run(body) + 1)
    language = ""
    if info:
        language = re.sub(r"[^A-Za-z0-9_+.-]", "", info.split()[0])
    text = "\n".join(body)
    return "%s%s\n%s\n%s" % (fence, language, text, fence), index


def split_cells(line):
    text = line.strip()
    if text.startswith("|"):
        text = text[1:]
    if text.endswith("|") and not text.endswith("\\|"):
        text = text[:-1]
    cells = []
    current = []
    escaped = False
    for char in text:
        if escaped:
            # `\|` 原样留在单元格里：数学里的 \| 是范数记号，不能当表格分隔符。
            current.append(char)
            escaped = False
            continue
        if char == "\\":
            current.append(char)
            escaped = True
            continue
        if char == "|":
            cells.append("".join(current).strip())
            current = []
            continue
        current.append(char)
    cells.append("".join(current).strip())
    return cells


def table_block(tokens, index, plain=False):
    """管道表格 -> Typst table（booktabs 风格横线）；太宽就降级并 warning。"""
    rows = []
    start_line = tokens[index][2]
    while index < len(tokens):
        kind, value, line, _suffix = tokens[index]
        if kind != "text" or not ROW_RE.match(value):
            break
        cells = split_cells(value)
        if not SEPARATOR_CELLS_RE.match("".join(cells)):
            rows.append((cells, line))
        index += 1
    if not rows:
        warn("table at line %d has no rows; 已丢弃" % start_line)
        return "", index
    columns = max(len(cells) for cells, _line in rows)
    if columns > MAX_TABLE_COLUMNS:
        warn(
            "table at line %d has %d columns (max %d); 已降级为逐行文本"
            % (start_line, columns, MAX_TABLE_COLUMNS)
        )
        paragraphs = []
        for cells, line in rows:
            paragraphs.append(text_block(" ｜ ".join(cells), line, plain))
        return "\n\n".join(paragraphs), index
    lines = [
        "#table(",
        "  columns: (%s)," % ", ".join(["1fr"] * columns),
        "  align: left,",
        "  stroke: none,",
        "  inset: (x: 6pt, y: 4pt),",
        "  table.hline(stroke: 0.7pt),",
    ]
    for row_index, (cells, line) in enumerate(rows):
        padded = cells + [""] * (columns - len(cells))
        rendered = ", ".join("[" + text_block(cell, line, plain) + "]" for cell in padded[:columns])
        if row_index == 0:
            lines.append("  table.header(%s)," % rendered)
            lines.append("  table.hline(stroke: 0.4pt),")
        else:
            lines.append("  %s," % rendered)
    lines.append("  table.hline(stroke: 0.7pt),")
    lines.append(")")
    return "\n".join(lines), index


def quote_block(tokens, index, plain=False):
    line_number = tokens[index][2]
    parts = []
    while index < len(tokens):
        kind, value, _line, _suffix = tokens[index]
        if kind != "text" or not value.lstrip().startswith(">"):
            break
        parts.append(value.lstrip(">").strip())
        index += 1
    text = " ".join(part for part in parts if part)
    return "#quote(block: true)[%s]" % text_block(text, line_number, plain), index


def add_list_item(levels, lines, indent_text, marker, item, line, plain=False):
    """列表项入栈：按缩进算层数，Typst 用两个空格表示一层。"""
    width = len(indent_text.expandtabs(4))
    kind = "ol" if marker[0].isdigit() else "ul"
    while levels and width < levels[-1][0]:
        levels.pop()
    if not levels or width > levels[-1][0]:
        levels.append([width, kind])
    elif levels[-1][1] != kind:
        levels[-1][1] = kind
        # 同一层换了种类，Typst 会另起一个列表；空一行让它重新编号。
        lines.append("")
    depth = len(levels) - 1
    lines.append("  " * depth + ("+" if kind == "ol" else "-") + " " + text_block(item, line, plain))


def render_blocks(tokens, plain=False):
    out = []
    paragraph = []
    paragraph_line = 0
    list_levels = []
    list_lines = []

    def flush_paragraph():
        nonlocal paragraph, paragraph_line
        if paragraph:
            text = " ".join(part.strip() for part in paragraph if part.strip())
            paragraph = []
            if text:
                out.append(text_block(text, paragraph_line, plain))

    def flush_list():
        nonlocal list_lines, list_levels
        if list_lines:
            out.append("\n".join(list_lines))
        list_lines = []
        list_levels = []

    index = 0
    while index < len(tokens):
        kind, value, line, suffix = tokens[index]
        if kind == "display":
            flush_paragraph()
            flush_list()
            out.append(formula(value, line, display=True, suffix=suffix))
            index += 1
            continue
        stripped = value.strip()
        if stripped == "":
            if list_levels and next_list_item(tokens, index + 1) is not None:
                index += 1
                continue
            flush_paragraph()
            flush_list()
            index += 1
            continue
        if FENCE_RE.match(value):
            flush_paragraph()
            flush_list()
            block, index = code_block(tokens, index)
            out.append(block)
            continue
        if ROW_RE.match(value) and index + 1 < len(tokens) \
                and tokens[index + 1][0] == "text" and ROW_RE.match(tokens[index + 1][1]) \
                and SEPARATOR_CELLS_RE.match("".join(split_cells(tokens[index + 1][1]))):
            flush_paragraph()
            flush_list()
            block, index = table_block(tokens, index, plain)
            if block:
                out.append(block)
            continue
        heading = HEADING_RE.match(value)
        if heading:
            flush_paragraph()
            flush_list()
            # md2tex 的层级映射：`#`/`##` 都是 section，`###` 起往下才细分。
            level = min(max(len(heading.group(1)) - 1, 1), 3)
            out.append("=" * level + " " + text_block(heading.group(2).strip(), line, plain))
            index += 1
            continue
        item = LIST_RE.match(value)
        if item:
            flush_paragraph()
            add_list_item(list_levels, list_lines, item.group(1), item.group(2),
                          item.group(3), line, plain)
            index += 1
            continue
        if value.lstrip().startswith(">"):
            flush_paragraph()
            flush_list()
            block, index = quote_block(tokens, index, plain)
            out.append(block)
            continue
        if stripped in RULE_LINES:
            flush_paragraph()
            flush_list()
            out.append(
                "#block(above: 0.8em, below: 0.8em)["
                "#line(length: 100%, stroke: 0.5pt + luma(150))]"
            )
            index += 1
            continue
        if stripped in PAGEBREAK_LINES:
            flush_paragraph()
            flush_list()
            out.append("#pagebreak()")
            index += 1
            continue
        if list_lines:
            flush_list()
        if not paragraph:
            paragraph_line = line
        paragraph.append(value)
        index += 1
    flush_paragraph()
    flush_list()
    return "\n\n".join(out)


# ---------------------------------------------------------------- 文档与编译
def title_block(title, plain=False):
    """文首标题，对应 md2tex 的 \\section*{title}（比正文大一号、加粗）。"""
    return (
        '#block(above: 0em, below: 0.9em)[#text(size: 1.42em, weight: "bold")[%s]]'
        % text_block(title, 0, plain)
    )


def convert(markdown, plain=False):
    """markdown 全文 -> Typst 正文（不含文档设置）。"""
    return render_blocks(tokenize(markdown.split("\n")), plain)


def build_document(markdown, title, plain=False):
    pieces = [preamble()]
    if title.strip():
        pieces.append(title_block(title, plain))
    body = convert(markdown, plain).strip()
    if body:
        pieces.append(body)
    return "\n\n".join(pieces) + "\n"


def write_typ(path, document):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(document)


def compile_document(typ_path, work, target, document):
    """写 .typ、编译、把 PDF 拷到目标位置。编译失败抛 SystemExit（带 stderr 尾部）。"""
    write_typ(typ_path, document)
    produced = os.path.join(work, "doc.pdf")
    typst_runtime.run_typst(["compile", typ_path, produced], cwd=work)
    if not os.path.isfile(produced):
        raise SystemExit("typst 没有生成 PDF：%s" % produced)
    shutil.copyfile(produced, target)


def render(src, out_path, title):
    """读 md、生成 .typ、交给 typst 编译，临时目录收尾删除。

    第一次编译失败时会用 plain 模式（不排强调）重排一次并 warning：模型偶尔
    写出 `***粗斜体***`、`2*3*4` 这种让人误解的强调，宁可少一点粗体，也不要
    整章打不开。第二次仍失败才把 typst 的报错抛出去。
    """
    with open(src, encoding="utf-8-sig") as handle:
        markdown = handle.read()
    target = os.path.abspath(out_path)
    parent = os.path.dirname(target)
    if parent:
        os.makedirs(parent, exist_ok=True)
    # 临时文件放在输出旁边（`out.pdf.work`），不用 mkdtemp：和 md2overlay 一样，
    # 某些受限环境只允许往目标目录写。
    work = target + ".work"
    os.makedirs(work, exist_ok=True)
    typ_path = os.path.join(work, "doc.typ")
    try:
        try:
            compile_document(typ_path, work, target, build_document(markdown, title))
        except SystemExit as first:
            if not typst_runtime.typst_available():
                # 没装 typst 不是排版问题：把安装提示原样抛出去，不重试。
                raise
            warn(
                "typst 首次编译失败，改用不排强调的纯文本模式重排：%s"
                % str(first).replace("\n", " ")[:200]
            )
            compile_document(typ_path, work, target, build_document(markdown, title, plain=True))
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main(argv):
    if len(argv) < 3:
        print(USAGE, file=sys.stderr)
        return 2
    src, out = argv[1], argv[2]
    no_title = os.environ.get("MATH_DESK_NO_TITLE") == "1"
    if len(argv) > 3 and not no_title:
        title = argv[3]
    elif no_title:
        title = ""
    else:
        title = os.path.splitext(os.path.basename(src))[0]
    if not os.path.isfile(src):
        raise SystemExit("找不到输入文件：%s" % src)
    render(src, out, title)
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
