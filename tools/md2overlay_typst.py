"""Render one page's translated blocks with Typst (v1.5 D engine).

Usage:
  python md2overlay_typst.py <blocks.json> <out.pdf> <page-width-pt> <page-height-pt> <font-class>

Same contract as `md2overlay.py`: the page's blocks are placed at their printed
positions, the first pass measures where the text really landed, the second pass
puts it on the printed baseline and shrinks what still does not fit, and the
measured result is written beside the block cache as `page-NNN.layout.json` —
the same shape the reader's DOM text layer already consumes.

The difference is the engine: Typst `place()`/`measure()` (one binary) instead of
xelatex + textpos. Text and maths are converted from the cached LaTeX markdown by
`latex_to_typst.py`.
"""
import json
import os
import re
import shutil
import sys

from latex_to_typst import convert_latex
from md2tex import cjk_font, sanitize_display_math
from overlay_layout import (
    align_name,
    baseline_of,
    body_of,
    inline_formula,
    layout_target,
    leading_of,
    measure_page,
    plan_adjustments,
    room_below,
    room_right,
    start_x,
    write_layout,
)
from typst_runtime import run_typst

blocks_path, out_path = sys.argv[1], sys.argv[2]
page_width = float(sys.argv[3])
page_height = float(sys.argv[4])
font_class = sys.argv[5] if len(sys.argv) > 5 else "10pt"
font_pt = float(font_class.replace("pt", ""))

MIN_PT = 9.0

# Typst's line pitch with `top-edge: "ascender", bottom-edge: "descender"` is
# (ascender + descender) + par leading. The ratios are the measured metrics of
# the product's CJK face (Microsoft YaHei); another face changes the pitch by a
# few percent, while the printed baseline itself is corrected by measurement.
ASCENT_RATIO = 0.81201
DESCENT_RATIO = 0.25342

with open(blocks_path, encoding="utf-8") as handle:
    blocks = json.load(handle)

MATH_SPLIT = re.compile(r"(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)")
LIST_LINE = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+(.*)$")
HEADING_LINE = re.compile(r"^\s*#{1,6}\s+(.*)$")
TABLE_LINE = re.compile(r"^\s*\|.*\|\s*$")

WARNINGS = []


def warn(message):
    if message not in WARNINGS:
        WARNINGS.append(message)


def escape_typst(text):
    """Escape prose for Typst markup; maths is inserted separately."""
    out = []
    for char in text:
        if char in "#$[]*_<>@~`":
            out.append("\\" + char)
        elif char == "\\":
            out.append("#sym.backslash")
        else:
            out.append(char)
    return "".join(out)


def inline_style(text):
    """Bold/italic/inline-code inside one prose run, escaped piece by piece."""
    nodes = []
    for piece in re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text):
        if piece == "":
            continue
        if piece.startswith("**") and piece.endswith("**") and len(piece) >= 4:
            nodes.append("*" + escape_typst(piece[2:-2]) + "*")
        elif piece.startswith("`") and piece.endswith("`") and len(piece) >= 2:
            nodes.append("`" + piece[1:-1].replace("`", "") + "`")
        else:
            nodes.append(escape_typst(piece))
    return "".join(nodes)


def math_to_typst(latex, display):
    """One formula as Typst markup; a failed conversion stays visible."""
    result = convert_latex(latex, display=display)
    if result.typst is None:
        reason = result.error["message"] if result.error else "unknown"
        warn("formula left as source (%s): %s" % (reason, latex[:60]))
        return "#text(fill: rgb(\"#b03a2e\"))[%s]" % escape_typst(latex)
    for item in result.warnings:
        warn("formula downgraded (%s): %s" % (item.get("code", ""), item.get("message", "")))
    body = result.typst.strip()
    if display:
        return "$ " + body + " $"
    return "$" + body + "$"


def prose_block(text):
    """A run of prose lines as one Typst paragraph or list."""
    lines = [line for line in text.split("\n") if line.strip() != ""]
    matches = [LIST_LINE.match(line) for line in lines]
    if lines and all(match is not None for match in matches):
        return "\n".join("- " + inline_style(match.group(1)) for match in matches)
    return inline_style(" ".join(line.strip() for line in lines))


def md_to_typst(md, inline_formulas):
    """Translated block markdown -> Typst markup (prose, maths, small structure)."""
    text = sanitize_display_math(md).strip()
    if inline_formulas:
        # A block too short for a display equation gets it inline, with its line
        # breaks collapsed — Typst inline maths cannot span lines.
        text = re.sub(r"\$\$([\s\S]*?)\$\$",
                      lambda match: "$" + " ".join(match.group(1).split()) + "$",
                      text)
    parts = MATH_SPLIT.split(text)
    output = []
    prose = []
    inline_math = {}
    for part in parts:
        if part == "":
            continue
        if part.startswith("$$") and part.endswith("$$") and part.count("$$") >= 2:
            if prose:
                output.append(prose_block("".join(prose)))
                prose = []
            output.append(math_to_typst(part[2:-2].strip(), True))
            continue
        if part.startswith("$") and part.endswith("$") and len(part) >= 2:
            # A placeholder survives prose escaping; the maths is swapped in after
            # the prose is clean, so its backslashes are not mistaken for markup.
            key = "zMt%dZ" % len(inline_math)
            inline_math[key] = part[1:-1].strip()
            prose.append(key)
            continue
        prose.append(part)
    if prose:
        output.append(prose_block("".join(prose)))
    content = "\n\n".join(piece for piece in output if piece.strip() != "")

    def restore(match):
        latex = inline_math.get(match.group(0))
        return match.group(0) if latex is None else math_to_typst(latex, False)

    return re.sub(r"zMt\d+Z", restore, content)


def build_page(adjustments):
    """One Typst document: placed textblocks and the boxes reserved for them."""
    font = cjk_font()
    parts = [
        "#set page(width: %.4fpt, height: %.4fpt, margin: 0pt)" % (page_width, page_height),
        '#set text(font: ("%s", "New Computer Modern"), lang: "zh")' % font,
        "#set par(justify: false)",
    ]
    placed = []
    for block_index, block in enumerate(blocks, start=1):
        md = (block.get("md") or "").strip()
        if md == "":
            continue
        bbox = block.get("bbox") or [0, 0, 1, 1]
        x, y, width, _height = [float(value) for value in bbox]
        room = room_below(block, blocks, page_height, font_pt)
        left = start_x(block, blocks)
        right = room_right(block, blocks)
        x_pt = max(0.0, left * page_width)
        w_pt = max(40.0, min((right - left) * page_width, page_width - x_pt - 4.0))
        adjustment = adjustments.get(str(block.get("id") or "")) or {}
        body_pt = body_of(block, adjustments, font_pt, MIN_PT)
        lead_pt = leading_of(block, body_pt, page_height) * float(adjustment.get("leading", 1.0))
        # Even a tightened leading stays a line, not a squeeze.
        lead_pt = max(body_pt * 1.02, lead_pt)
        target = baseline_of(block, page_height, font_pt)
        y_pt = max(0.0, float(adjustment.get("y", target)))
        h_pt = max(6.0, min(room, page_height - y_pt - 4.0))
        base_pt = body_of(block, {}, font_pt, MIN_PT)
        inline_formulas = room < base_pt * 2.6 and "$$" in md
        text = sanitize_display_math(md).strip()
        display_only = (not inline_formulas) and re.fullmatch(r"\$\$[\s\S]*\$\$", text) is not None \
            and text.count("$$") == 2
        if not display_only and not inline_formulas and "$$" in text:
            # Typst ignores a block equation placed inside a paragraph, so a
            # display formula mixed with prose is set inline and reported.
            warn("display formula inside a paragraph rendered inline")
        content = md_to_typst(md, inline_formulas or (not display_only and "$$" in text))
        if content.strip() == "":
            continue
        marker_number = len(placed) + 1
        marker = "MD%03d" % marker_number
        # The marker is its own absolutely placed element, written just before the
        # block in the content stream. It costs no layout (unlike an inline box,
        # which made a following `(` a function call) and it lets the sequence
        # attribution find every block, display equations included.
        parts.append("#place(dx: %.2fpt, dy: %.2fpt, text(size: 1pt, fill: white)[%s])" %
                     (x_pt, y_pt, marker))
        align = align_name(block)
        if display_only:
            # A block equation is a block element: it must not sit inside `par`,
            # which would make Typst drop it. It is centred like the LaTeX one.
            inner = "align(center)[#text(size: %.2fpt)[%s]]" % (body_pt, content)
        else:
            justify = align == "justify"
            paragraph = "par(leading: %.3fpt, justify: %s)[#text(size: %.2fpt, top-edge: \"ascender\", bottom-edge: \"descender\")[%s]]" % (
                max(0.0, lead_pt - (ASCENT_RATIO + DESCENT_RATIO) * body_pt),
                "true" if justify else "false",
                body_pt,
                content,
            )
            if align == "center":
                inner = "align(center)[%s]" % paragraph
            elif align == "right":
                inner = "align(right)[%s]" % paragraph
            else:
                inner = paragraph
        parts.append("#place(dx: %.2fpt, dy: %.2fpt, block(width: %.2fpt, %s))" % (x_pt, y_pt, w_pt, inner))
        placed.append({
            "id": str(block.get("id") or ""),
            "marker": marker,
            "rect": (x_pt, y_pt, x_pt + w_pt, y_pt + h_pt),
            "target": target,
            "room": h_pt,
            "body": body_pt,
            "leading": lead_pt,
            "align": align,
            "y": y_pt,
        })
    return "\n".join(parts) + "\n", placed


def compile_page(document, work, out_pdf):
    """Write the page's Typst source and compile it; returns the PDF path."""
    typ_path = os.path.join(work, "doc.typ")
    pdf_path = os.path.join(work, "doc.pdf")
    if os.path.exists(pdf_path):
        os.remove(pdf_path)
    with open(typ_path, "w", encoding="utf-8") as handle:
        handle.write(document)
    run_typst(["compile", "doc.typ", "doc.pdf"], cwd=work, timeout=120)
    if not os.path.exists(pdf_path):
        raise SystemExit("typst did not produce a PDF")
    return pdf_path


work = os.path.abspath(out_path) + ".work"
os.makedirs(work, exist_ok=True)
try:
    applied = {}
    document, placed = build_page(applied)
    pdf_path = compile_page(document, work, out_path)
    measured = measure_page(pdf_path, placed)
    # Typst's line box can grow on the first line when it contains a tall formula,
    # so one correction pass is not always enough. Corrections accumulate: a
    # block without a new step keeps the placement it already earned, instead of
    # snapping back to the printed baseline estimate.
    # Typst's line box can grow on the first line when it contains a tall formula,
    # so one correction pass is not always enough. Corrections accumulate: a
    # block without a new step keeps the placement it already earned, instead of
    # snapping back to the printed baseline estimate.
    limit = min(font_pt, MIN_PT)
    for _attempt in range(3):
        step = plan_adjustments(placed, measured, font_pt, MIN_PT)
        changed = bool(step)
        for block_id, adjustment in step.items():
            current = applied.setdefault(block_id, {})
            if "y" in adjustment:
                current["y"] = adjustment["y"]
            if "scale" in adjustment:
                current["scale"] = adjustment["scale"]
        # A block already at the size floor cannot shrink any more; tightening its
        # leading is the remaining way to keep the paragraph inside its room.
        for entry, row in zip(placed, measured):
            if row is None or row["bounds"] is None:
                continue
            height = row["bounds"].height
            if height <= entry["room"] + 0.5 or entry["body"] > limit + 0.01:
                continue
            factor = max(0.85, entry["room"] / height)
            current = applied.setdefault(entry["id"], {})
            previous = float(current.get("leading", 1.0))
            following = max(0.85, previous * factor)
            if following < previous - 0.002:
                current["leading"] = following
                changed = True
        if not changed:
            break
        document, placed = build_page(applied)
        pdf_path = compile_page(document, work, out_path)
        measured = measure_page(pdf_path, placed)
    os.replace(pdf_path, out_path)
    write_layout(placed, measured, layout_target(blocks_path, out_path),
                 page_width, page_height, font_pt)
finally:
    shutil.rmtree(work, ignore_errors=True)
for message in WARNINGS:
    print("warning: " + message, file=sys.stderr)
print(out_path)
