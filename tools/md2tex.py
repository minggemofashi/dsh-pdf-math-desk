"""Render the CRT markdown with LaTeX (XeLaTeX + ctex) into one PDF per chapter."""
import json
import os
import re
import shutil
import subprocess
import sys

SRC = ""
BOOK = "中国剩余定理"
OUT = os.path.join("samples", "分片", BOOK)
WORK = os.path.join("build", "tex")
MANIFEST = os.path.join("samples", "manifest.json")
XELATEX = os.environ.get("XELATEX") or shutil.which("xelatex") or "xelatex"

CHAPTERS = [
    ("c01", "第0章_导读", "0. 导读：先看四张面孔"),
    ("c02", "第1章_古题_孙子算经到秦九韶", "1. 一道古题：从《孙子算经》到秦九韶"),
    ("c03", "第2章_整数版本", "2. 整数版本"),
    ("c04", "第3章_环论版本", "3. 环论版本：《代数学基础》§2.4"),
    ("c05", "第4章_多项式版本", "4. 多项式版本：《高等代数学》§5.3"),
    ("c06", "第5章_群论版本", "5. 群论版本"),
    ("c07", "第6章_统一结构", "6. 统一的结构：CRT 到底在说什么"),
    ("c08", "第7章_回望", "7. 回望：从“物不知数”到“单位分解”"),
    ("c90", "附录_教材页码符号表自测", "附录 A　教材页码与定理编号"),
]

def font_size():
    raw = os.environ.get("MATH_DESK_FONTSIZE", "").strip()
    return raw if raw in ("9pt", "10pt", "11pt", "12pt") else "11pt"


def page_options():
    raw = os.environ.get("MATH_DESK_PAPER", "").strip()
    if "," in raw:
        width, height = raw.split(",", 1)
        return f"paperwidth={float(width):.3f}in,paperheight={float(height):.3f}in,margin=1.2cm"
    return "margin=2.4cm"


PREAMBLE = r"""\documentclass[UTF8,11pt,a4paper]{ctexart}
\usepackage[%s]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{booktabs,tabularx,array}
\usepackage{fancyvrb}
\usepackage{enumitem}
\usepackage{xcolor}
\usepackage[hidelinks]{hyperref}
\setlength{\parindent}{2em}
\setlength{\parskip}{0.35em}
\linespread{1.32}
\setlist{itemsep=2pt,topsep=4pt,leftmargin=2em}
\pagestyle{plain}
\begin{document}
"""


def escape(text):
    text = text.replace("\\", r"\textbackslash{}")
    for old, new in (("&", r"\&"), ("%", r"\%"), ("#", r"\#"), ("_", r"\_"),
                     ("{", r"\{"), ("}", r"\}"), ("~", r"\textasciitilde{}"),
                     ("^", r"\textasciicircum{}")):
        text = text.replace(old, new)
    return text


MATH = re.compile(r"(\$\$.*?\$\$|\$[^$]+?\$)", re.S)


def inline(text):
    """Escape prose but keep inline/display math exactly as written."""
    pieces = []
    for part in MATH.split(text):
        if part == "":
            continue
        if part.startswith("$"):
            pieces.append(part)
            continue
        part = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", part)
        part = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", part)
        slots = []

        def hold(latex):
            slots.append(latex)
            return "\x01%d\x01" % (len(slots) - 1)

        part = re.sub(r"\*\*([^*]+)\*\*", lambda m: hold(r"\textbf{%s}" % escape(m.group(1))), part)
        part = re.sub(r"__([^_]+)__", lambda m: hold(r"\textbf{%s}" % escape(m.group(1))), part)
        part = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", lambda m: hold(r"\emph{%s}" % escape(m.group(1))), part)
        part = re.sub(r"`([^`]*)`", lambda m: hold(r"\texttt{%s}" % escape(m.group(1))), part)
        part = escape(part)
        for index, latex in enumerate(slots):
            part = part.replace("\x01%d\x01" % index, latex)
        pieces.append(part)
    return "".join(pieces)


def heading(text, level):
    command = {1: "section", 2: "subsection", 3: "subsubsection"}.get(level, "subsubsection")
    return "\\%s*{%s}\n" % (command, inline(text))


def split_groups(lines):
    starts = []
    for index, line in enumerate(lines):
        match = re.match(r"^##\s+(.+)$", line)
        if match:
            starts.append((index, match.group(1).strip()))
    groups = []
    for pos, (index, title) in enumerate(starts):
        end = starts[pos + 1][0] if pos + 1 < len(starts) else len(lines)
        groups.append((title, lines[index:end]))
    return groups


def convert(lines, chapter_title):
    out = []
    if chapter_title:
        out.append("\\section*{%s}\n" % inline(chapter_title))
    i = 1 if lines and re.match(r"^##\s", lines[0]) else 0
    buffer = []
    list_kind = None
    list_items = []

    def flush_paragraph():
        if buffer:
            text = " ".join(p.strip() for p in buffer if p.strip())
            if text:
                out.append(inline(text) + "\n\n")
            buffer.clear()

    def flush_list():
        nonlocal list_kind, list_items
        if list_kind is not None and list_items:
            env = "itemize" if list_kind == "ul" else "enumerate"
            out.append("\\begin{%s}\n" % env)
            for item in list_items:
                out.append("  \\item %s\n" % inline(item))
            out.append("\\end{%s}\n\n" % env)
        list_kind = None
        list_items = []

    while i < len(lines):
        raw = lines[i].rstrip("\n")
        if raw.startswith("```"):
            flush_paragraph()
            flush_list()
            i += 1
            block = []
            while i < len(lines) and not lines[i].startswith("```"):
                block.append(lines[i].rstrip("\n"))
                i += 1
            out.append("\\begin{Verbatim}[fontsize=\\small,frame=single]\n")
            out.extend(row + "\n" for row in block)
            out.append("\\end{Verbatim}\n\n")
            i += 1
            continue
        if not raw.strip():
            flush_paragraph()
            flush_list()
            i += 1
            continue
        if re.match(r"^\s*\|.*\|\s*$", raw) and i + 1 < len(lines) and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]):
            flush_paragraph()
            flush_list()
            rows = []
            while i < len(lines) and re.match(r"^\s*\|.*\|\s*$", lines[i]):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not re.match(r"^[\s:|-]+$", "".join(cells)):
                    rows.append(cells)
                i += 1
            if rows:
                cols = max(len(row) for row in rows)
                out.append("\\begin{center}\n\\begin{tabularx}{\\linewidth}{@{}%s@{}}\n\\toprule\n" % ("X" * cols))
                for r_index, row in enumerate(rows):
                    cells = [inline(row[c]) if c < len(row) else "" for c in range(cols)]
                    out.append(" & ".join(cells) + r" \\" + "\n")
                    if r_index == 0:
                        out.append("\\midrule\n")
                out.append("\\bottomrule\n\\end{tabularx}\n\\end{center}\n\n")
            continue
        heading_match = re.match(r"^(#{1,6})\s+(.*)$", raw)
        if heading_match:
            flush_paragraph()
            flush_list()
            level = min(max(len(heading_match.group(1)) - 1, 1), 3)
            out.append(heading(heading_match.group(2).strip(), level) + "\n")
            i += 1
            continue
        list_match = re.match(r"^\s*([-*+]|\d+\.)\s+(.*)$", raw)
        if list_match:
            flush_paragraph()
            kind = "ol" if re.match(r"^\s*\d+\.", raw) else "ul"
            if list_kind is not None and list_kind != kind:
                flush_list()
            list_kind = kind
            list_items.append(list_match.group(2))
            i += 1
            continue
        if raw.startswith(">"):
            flush_paragraph()
            flush_list()
            quote = []
            while i < len(lines) and lines[i].startswith(">"):
                quote.append(lines[i].lstrip("> ").strip())
                i += 1
            out.append("\\begin{quote}\n%s\n\\end{quote}\n\n" % inline(" ".join(quote)))
            continue
        if raw.strip() in ("---", "***", "___"):
            flush_paragraph()
            flush_list()
            out.append("\\par\\noindent\\rule{\\linewidth}{0.4pt}\\par\\medskip\n")
            i += 1
            continue
        if raw.strip() in ("\\newpage", "<!-- pagebreak -->"):
            flush_paragraph()
            flush_list()
            out.append("\\newpage\n\n")
            i += 1
            continue
        if raw.strip().startswith("$$"):
            flush_paragraph()
            flush_list()
            block = [raw.strip()]
            i += 1
            while i < len(lines) and "$$" not in lines[i]:
                block.append(lines[i].strip())
                i += 1
            if i < len(lines):
                block.append(lines[i].strip())
                i += 1
            body = " ".join(block).replace("$$", "").strip()
            out.append("\\[\n%s\n\\]\n\n" % body)
            continue
        buffer.append(raw)
        i += 1
    flush_paragraph()
    flush_list()
    return "".join(out)


def write_tex(path, body):
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(PREAMBLE.replace("11pt", font_size(), 1) % page_options())
        handle.write(body)
        handle.write("\\end{document}\n")


def compile_tex(tex_path, pdf_path):
    for _ in range(2):
        result = subprocess.run(
            [XELATEX, "-interaction=nonstopmode", "-halt-on-error", os.path.basename(tex_path)],
            cwd=os.path.dirname(tex_path),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode != 0:
            log = os.path.splitext(tex_path)[0] + ".log"
            tail = ""
            if os.path.exists(log):
                with open(log, encoding="utf-8", errors="replace") as handle:
                    tail = "".join(handle.readlines()[-25:])
            raise SystemExit("xelatex failed:\n" + result.stdout[-2000:] + "\n" + tail)
    shutil.copyfile(os.path.splitext(tex_path)[0] + ".pdf", pdf_path)


def cover_tex():
    entries = "\n".join("\\item %s" % inline(title) for _key, _file, title in CHAPTERS)
    return (
        "\\begin{center}\n"
        "{\\Huge\\bfseries 中国剩余定理}\\\\[0.6em]\n"
        "{\\Large 从《孙子算经》到环、多项式与群}\\\\[1.2em]\n"
        "\\rule{0.6\\linewidth}{0.4pt}\\\\[0.8em]\n"
        "{\\small 示例书库 · 由 dsh-pdf-math-desk 生成}\n"
        "\\end{center}\n\\vspace{2em}\n"
        "\\section*{目录}\n\\begin{itemize}\n" + entries + "\n\\end{itemize}\n"
    )


def sanitize_display_math(text):
    """Normalize display math before conversion.

    The translation model sometimes mixes inline math into a display block or
    puts prose after the closing `$$` on the same line, which makes XeLaTeX
    abort with "Display math should end with $$". Display blocks are rebuilt on
    their own lines, with inner single `$` removed; trailing prose stays prose.
    """
    text = text.replace("\\[", "$$").replace("\\]", "$$")
    text = text.replace("\\(", "$").replace("\\)", "$")
    parts = text.split("$$")
    if len(parts) % 2 == 0:
        parts.append("")
    rebuilt = []
    for index, part in enumerate(parts):
        if index % 2 == 1:
            body = part.replace("$", "")
            rebuilt.append("\n\n$$\n" + body.strip() + "\n$$\n\n")
        else:
            rebuilt.append(part)
    return "".join(rebuilt)


def main():
    os.makedirs(OUT, exist_ok=True)
    if os.path.isdir(WORK):
        shutil.rmtree(WORK)
    os.makedirs(WORK, exist_ok=True)
    with open(SRC, encoding="utf-8") as handle:
        lines = handle.read().split("\n")
    groups = split_groups(lines)
    made = []

    cover_tex_path = os.path.join(WORK, "cover.tex")
    write_tex(cover_tex_path, cover_tex())
    cover_pdf = os.path.join(OUT, f"{BOOK}_c00_前置_封面目录.pdf")
    compile_tex(cover_tex_path, cover_pdf)
    made.append(os.path.basename(cover_pdf))

    for key, file_title, heading_text in CHAPTERS:
        if heading_text.startswith("附录"):
            body = []
            for group_title, group_lines in groups:
                if group_title.startswith("附录"):
                    body.extend(group_lines)
        else:
            body = None
            prefix = heading_text.split("：")[0].strip()
            for group_title, group_lines in groups:
                if group_title.startswith(prefix):
                    body = group_lines
                    break
        if body is None:
            raise SystemExit("missing chapter: " + heading_text)
        tex_path = os.path.join(WORK, key + ".tex")
        write_tex(tex_path, convert(body, heading_text))
        name = f"{BOOK}_{key}_{file_title}.pdf"
        compile_tex(tex_path, os.path.join(OUT, name))
        made.append(name)

    entries = []
    total = 0
    for name in made:
        size = os.path.getsize(os.path.join(OUT, name))
        total += size
        entries.append({"name": name, "bytes": size})
    with open(MANIFEST, "w", encoding="utf-8") as handle:
        json.dump({
            "version": 1,
            "book": {
                "id": BOOK,
                "title": "中国剩余定理",
                "subtitle": "从《孙子算经》到环、多项式与群",
                "chapters": len(made),
                "bytes": total,
            },
            "files": entries,
        }, handle, ensure_ascii=False, indent=2)
    print(json.dumps({"chapters": len(made), "bytes": total}, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) >= 3:
        import tempfile
        src, out = sys.argv[1], sys.argv[2]
        title = sys.argv[3] if len(sys.argv) > 3 else os.path.splitext(os.path.basename(src))[0]
        with open(src, encoding="utf-8") as handle:
            lines = sanitize_display_math(handle.read()).split("\n")
        work = tempfile.mkdtemp(prefix="md2tex-")
        tex = os.path.join(work, "doc.tex")
        write_tex(tex, convert(lines, title))
        compile_tex(tex, out)
        print(out)
    else:
        main()
