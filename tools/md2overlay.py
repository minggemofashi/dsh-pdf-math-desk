"""Render one page's translated blocks where the original printed them.

Usage:
  python md2overlay.py <blocks.json> <out.pdf> <page-width-pt> <page-height-pt> <font-class>

Placement is baseline-anchored, not box-top anchored: xelatex is run twice — the
first pass finds where each block's text really landed, the second pass shifts it
back onto the printed baseline and (for blocks that do not fit) shrinks it. The
measured result is written next to the block cache as `page-NNN.layout.json`,
which is what the reader's boxes use. The geometry and the sidecar contract are
shared with the Typst engine (`overlay_layout.py`).
"""
import json
import os
import shutil
import subprocess
import sys

from md2tex import cjk_font, convert, sanitize_display_math
from overlay_layout import (
    align_name,
    alignment_of,
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

blocks_path, out_path = sys.argv[1], sys.argv[2]
page_width = float(sys.argv[3])
page_height = float(sys.argv[4])
font_class = sys.argv[5] if len(sys.argv) > 5 else "10pt"
font_pt = float(font_class.replace("pt", ""))

# Translated body text may not fall below this size (the requirement's "no
# unreadable 4–6pt text"). A block that still does not fit at the floor keeps the
# floor and is marked `overflow` instead of being squeezed further.
MIN_PT = 9.0

with open(blocks_path, encoding="utf-8") as handle:
    blocks = json.load(handle)


def build_run(adjustments):
    """One xelatex input: textblocks and the boxes they were placed in."""
    parts = []
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
        # Use the white space beside a short block before shrinking the text: a
        # Chinese translation is wider than the English it replaces.
        w_pt = max(40.0, min((right - left) * page_width, page_width - x_pt - 4.0))
        adjustment = adjustments.get(str(block.get("id") or "")) or {}
        body_pt = body_of(block, adjustments, font_pt, MIN_PT)
        lead_pt = leading_of(block, body_pt, page_height)
        target = baseline_of(block, page_height, font_pt)
        y_pt = max(0.0, float(adjustment.get("y", target)))
        h_pt = max(6.0, min(room, page_height - y_pt - 4.0))
        body = ""
        # The inline/display decision must not flip between the two passes: the
        # unshrunk size decides.
        if room < body_of(block, {}, font_pt, MIN_PT) * 2.6 and "$$" in md:
            body = inline_formula(md)
            if body == "":
                body = convert(md.replace("$$", "$").split("\n"), "", drop_leading_heading=False)
        if body == "":
            body = convert(sanitize_display_math(md).split("\n"), "", drop_leading_heading=False)
        if body.strip() == "":
            continue
        # A zero-width, white, 1pt marker on the block's first line. `\leavevmode`
        # is load-bearing: a minipage starts in vertical mode, so a bare `\hbox`
        # would open a line of its own and push the translation one baseline down.
        # A block whose body starts with display math would put the marker on an
        # empty line, so those are measured geometrically instead.
        # `convert()` emits display maths as `\[…\]`, not `$$…$$`. A marker in
        # front of it would open a line of its own and shift the equation, so
        # those blocks carry no marker and are claimed by their reserved
        # rectangle in measure_page.
        stripped_body = body.lstrip()
        display_first = stripped_body.startswith("$$") or stripped_body.startswith("\\[")
        marker_number = block_index
        marker = "MD%03d" % marker_number
        prefix = "\\leavevmode\\hbox to 0pt{\\color{white}\\fontsize{1pt}{1pt}\\selectfont %s}" % marker
        if display_first:
            # The marker ends its line so the display equation keeps its own; the
            # second pass puts the equation back on the printed baseline, and the
            # marker line above it is invisible.
            prefix += "\\par"
        parts.append(
            "\\begin{textblock}{%.2f}(%.2f,%.2f)\n"
            "\\begin{minipage}[t]{%.2fpt}%s\\fontsize{%.1f}{%.1f}\\selectfont\n%s%s\n\\end{minipage}\n"
            "\\end{textblock}\n"
            % (w_pt, x_pt, y_pt, w_pt, alignment_of(block), body_pt, lead_pt, prefix, body)
        )
        placed.append({
            "id": str(block.get("id") or ""),
            "marker": marker,
            "rect": (x_pt, y_pt, x_pt + w_pt, y_pt + h_pt),
            "target": target,
            "room": h_pt,
            "body": body_pt,
            "leading": lead_pt,
            "align": align_name(block),
            "y": y_pt,
        })
    return parts, placed


def compile_page(parts, work, out_pdf):
    """Write the page's TeX and compile it; returns the PDF path."""
    tex = r"""\documentclass[UTF8,%s]{ctexart}
\usepackage[paperwidth=%.4fin,paperheight=%.4fin,margin=0pt]{geometry}
\usepackage{fontspec}
\usepackage{xcolor}
\setCJKmainfont{%s}
\usepackage{amsmath,amssymb}
\usepackage[absolute,overlay]{textpos}
\usepackage{adjustbox}
%% Positions and widths are handed over in PDF big points (bp, 1/72in) because
%% that is what the page rect and PyMuPDF use; with 1pt modules every placement
%% drifted by 0.375 percent (2bp at the right edge) and `box` in layout.json was
%% where the text actually printed.
\setlength{\TPHorizModule}{1bp}
\setlength{\TPVertModule}{1bp}
%% A positioned block is not a paragraph: ctexart's 2em first-line indent pushed
%% the first line 2em past the placed box (and clipped it at the page edge).
\setlength{\parindent}{0pt}
\pagestyle{empty}
\begin{document}
%s
\end{document}
""" % (font_class, page_width / 72.0, page_height / 72.0, cjk_font(), "\n".join(parts))
    tex_path = os.path.join(work, "doc.tex")
    pdf_path = os.path.join(work, "doc.pdf")
    if os.path.exists(pdf_path):
        os.remove(pdf_path)
    with open(tex_path, "w", encoding="utf-8") as handle:
        handle.write(tex)
    result = subprocess.run(
        ["xelatex", "-interaction=nonstopmode", "doc.tex"],
        cwd=work, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180,
    )
    if not os.path.exists(pdf_path):
        raise SystemExit("xelatex failed: " + (result.stdout or "")[-800:])
    return pdf_path


# Build next to the output instead of a fresh temp directory: some sandboxes
# allow writes in the destination directory but not in a mkdtemp directory.
work = os.path.abspath(out_path) + ".work"
os.makedirs(work, exist_ok=True)
try:
    applied = {}
    parts, placed = build_run(applied)
    pdf_path = compile_page(parts, work, out_path)
    measured = measure_page(pdf_path, placed)
    # Corrections accumulate: a display equation's first placement can be a line
    # off, and a block without a new step keeps the placement it already earned.
    for _attempt in range(3):
        step = plan_adjustments(placed, measured, font_pt, MIN_PT)
        changed = False
        for block_id, adjustment in step.items():
            current = applied.setdefault(block_id, {})
            if "y" in adjustment and current.get("y") != adjustment["y"]:
                current["y"] = adjustment["y"]
                changed = True
            if "scale" in adjustment and current.get("scale") != adjustment["scale"]:
                current["scale"] = adjustment["scale"]
                changed = True
        if not changed:
            break
        parts, placed = build_run(applied)
        pdf_path = compile_page(parts, work, out_path)
        measured = measure_page(pdf_path, placed)
    os.replace(pdf_path, out_path)
    write_layout(placed, measured, layout_target(blocks_path, out_path),
                 page_width, page_height, font_pt)
finally:
    shutil.rmtree(work, ignore_errors=True)
print(out_path)
