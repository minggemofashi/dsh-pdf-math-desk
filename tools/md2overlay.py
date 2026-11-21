"""Render one page's translated blocks at their original bbox positions.

Usage:
  python md2overlay.py <blocks.json> <out.pdf> <page-width-pt> <page-height-pt> <font-class>
"""
import json
import os
import shutil
import subprocess
import sys

from md2tex import cjk_font, convert, sanitize_display_math

blocks_path, out_path = sys.argv[1], sys.argv[2]
page_width = float(sys.argv[3])
page_height = float(sys.argv[4])
font_class = sys.argv[5] if len(sys.argv) > 5 else "10pt"
font_pt = float(font_class.replace("pt", ""))

with open(blocks_path, encoding="utf-8") as handle:
    blocks = json.load(handle)


def overlaps_x(left, right):
    """True when two blocks share horizontal space, i.e. stack vertically."""
    return not (left[0] + left[2] <= right[0] or right[0] + right[2] <= left[0])


def same_line(first, second):
    """True when two boxes really share a printed line.

    Boxes that merely touch by a fraction of a point must not count: a paragraph
    and the heading right under it were treated as one line, and the heading got
    pushed to the page edge."""
    first_top, first_bottom = float(first[1]), float(first[1]) + float(first[3])
    second_top, second_bottom = float(second[1]), float(second[1]) + float(second[3])
    overlap = min(first_bottom, second_bottom) - max(first_top, second_top)
    return overlap > 0.5 * min(float(first[3]), float(second[3]))


def room_below(block):
    """Points available from this block's top to the next block that sits under
    it. Text may use the page's white space but must never run into a neighbour;
    that balance is what keeps a tightened paragraph readable instead of 3pt."""
    x, y, width, height = [float(value) for value in block.get("bbox") or [0, 0, 1, 1]]
    limit = page_height - y * page_height - 4.0
    for other in blocks:
        if other is block:
            continue
        other_box = other.get("bbox") or [0, 0, 1, 1]
        if not overlaps_x([x, y, width], other_box):
            continue
        gap = (float(other_box[1]) - y) * page_height
        # A box that starts barely below this one is a fragment on the same
        # line, not something underneath: counting it squeezed blocks to 4pt.
        if max(2.0, font_pt * 0.6) < gap < limit:
            limit = gap
    return max(6.0, limit)


def room_right(block):
    """Normalized right edge this block may use: its own width or the start of
    the next block beside it. Short blocks such as "if dim V = n." were forced
    into two lines by their narrow box and then shrank to 4pt; letting them use
    the empty space beside them keeps them one readable line."""
    x, y, width, height = [float(value) for value in block.get("bbox") or [0, 0, 1, 1]]
    right = x + width
    limit = 0.985
    for other in blocks:
        if other is block:
            continue
        other_box = other.get("bbox") or [0, 0, 1, 1]
        if not same_line(block.get("bbox") or [0, 0, 1, 1], other_box):
            continue
        start = float(other_box[0])
        if start > right + 0.005:
            limit = min(limit, start - 0.004)
    return max(x + 0.08, limit)


def inline_formula(md):
    """Turn a standalone `$$...$$` block into one inline math run.

    A formula block's box is one line tall in the original, while a display
    equation needs about twice that; rendering it as display forced adjustbox to
    shrink it to 6pt. Inline keeps it the same optical size as the body text."""
    body = md.strip()
    if body.startswith("$$") and body.endswith("$$") and body.count("$$") == 2:
        return "$%s$" % " ".join(body[2:-2].split())
    return ""


def start_x(block):
    """Left edge to use, pushed right past a same-line neighbour it would overlap.

    PyMuPDF sometimes splits one printed line into two boxes whose x ranges
    overlap ("p⁰ = …" and "（g 为 G 的阶）。"). Drawn at their own x the two runs
    collide, because the Chinese formula is wider than the English one; starting
    the right-hand run after the left run keeps the line readable."""
    x, y, width, height = [float(value) for value in block.get("bbox") or [0, 0, 1, 1]]
    for other in blocks:
        if other is block:
            continue
        other_box = other.get("bbox") or [0, 0, 1, 1]
        if not same_line(block.get("bbox") or [0, 0, 1, 1], other_box):
            continue
        other_left, other_right = float(other_box[0]), float(other_box[0]) + float(other_box[2])
        if other_left < x - 0.002 and other_right > x + 0.01:
            x = min(0.9, other_right + 0.006)
    return x


parts = []
for block in blocks:
    md = (block.get("md") or "").strip()
    if md == "":
        continue
    bbox = block.get("bbox") or [0, 0, 1, 1]
    x, y, width, _height = [float(value) for value in bbox]
    room = room_below(block)
    body = ""
    left = start_x(block)
    x_pt = max(0.0, left * page_width)
    y_pt = max(0.0, y * page_height)
    # Keep every block inside its own box width. Borrowing the space to the
    # right made the translation wider than the box the reader draws around the
    # original text, so the reveal clipped whole words; wrapping (and, when
    # really tight, scaling) stays inside the block instead.
    w_pt = max(40.0, min(width * page_width, page_width - x_pt - 4.0))
    # Very narrow boxes ("if dim V = n.") cannot hold one Chinese line at body
    # size and used to collapse to 4pt after wrapping. A slightly smaller face
    # keeps them on one line and inside the box. The block's own printed size
    # (pdf_blocks reports it relative to the page's body text) keeps headings
    # and titles at their larger look instead of shrinking them to body size.
    block_scale = float(block.get("size") or 1.0)
    block_scale = max(0.85, min(1.6, block_scale))
    body_pt = font_pt * block_scale * (0.8 if w_pt < 90.0 else 1.0)
    if room < body_pt * 2.6 and "$$" in md:
        # Too little room for a display equation: keep the math inline, including
        # prose that carries an inline `$$...$$` fragment.
        body = inline_formula(md)
        if body == "":
            body = convert(md.replace("$$", "$").split("\n"), "", drop_leading_heading=False)
    if body == "":
        # Same normalization the reading PDF gets: display math rebuilt on its own
        # lines. Without it, a one-line `$$...$$` swallowed the prose after it and
        # the paragraph came out as broken math.
        body = convert(sanitize_display_math(md).split("\n"), "", drop_leading_heading=False)
    if body.strip() == "":
        continue
    # Cap the block at the white space below it: a Chinese paragraph is often
    # taller than the English it replaces. Text may borrow a paragraph gap but
    # never runs into the next block, and adjustbox only shrinks when the text
    # still exceeds that room, so most blocks keep their natural size.
    h_pt = room
    parts.append(
        "\\begin{textblock}{%.2f}(%.2f,%.2f)\n"
        "\\begin{adjustbox}{max width=%.2fpt,max totalheight=%.2fpt}\n"
        "\\begin{minipage}[t]{%.2fpt}\\raggedright\\fontsize{%.1f}{%.1f}\\selectfont\n%s\n\\end{minipage}\n"
        "\\end{adjustbox}\n"
        "\\end{textblock}\n"
        % (w_pt, x_pt, y_pt, w_pt, h_pt, w_pt, body_pt, body_pt * 1.25, body)
    )

tex = r"""\documentclass[UTF8,%s]{ctexart}
\usepackage[paperwidth=%.4fin,paperheight=%.4fin,margin=0pt]{geometry}
\usepackage{fontspec}
\setCJKmainfont{%s}
\usepackage{amsmath,amssymb}
\usepackage[absolute,overlay]{textpos}
\usepackage{adjustbox}
\setlength{\TPHorizModule}{1pt}
\setlength{\TPVertModule}{1pt}
\pagestyle{empty}
\begin{document}
%s
\end{document}
""" % (font_class, page_width / 72.0, page_height / 72.0, cjk_font(), "\n".join(parts))

# Build next to the output instead of a fresh temp directory: some sandboxes
# allow writes in the destination directory but not in a mkdtemp directory.
work = os.path.abspath(out_path) + ".work"
os.makedirs(work, exist_ok=True)
tex_path = os.path.join(work, "doc.tex")
pdf_path = os.path.join(work, "doc.pdf")
try:
    with open(tex_path, "w", encoding="utf-8") as handle:
        handle.write(tex)

    result = subprocess.run(
        ["xelatex", "-interaction=nonstopmode", "doc.tex"],
        cwd=work, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180,
    )
    if not os.path.exists(pdf_path):
        raise SystemExit("xelatex failed: " + (result.stdout or "")[-800:])

    os.replace(pdf_path, out_path)
finally:
    shutil.rmtree(work, ignore_errors=True)
print(out_path)
