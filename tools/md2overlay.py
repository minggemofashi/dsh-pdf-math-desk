"""Render one page's translated blocks at their original bbox positions.

Usage:
  python md2overlay.py <blocks.json> <out.pdf> <page-width-pt> <page-height-pt> <font-class>
"""
import json
import os
import subprocess
import sys
import tempfile

from md2tex import convert

blocks_path, out_path = sys.argv[1], sys.argv[2]
page_width = float(sys.argv[3])
page_height = float(sys.argv[4])
font_class = sys.argv[5] if len(sys.argv) > 5 else "10pt"
font_pt = float(font_class.replace("pt", ""))

with open(blocks_path, encoding="utf-8") as handle:
    blocks = json.load(handle)

parts = []
for block in blocks:
    md = (block.get("md") or "").strip()
    if md == "":
        continue
    bbox = block.get("bbox") or [0, 0, 1, 1]
    x, y, width, _height = [float(value) for value in bbox]
    body = convert(md.split("\n"), "")
    if body.strip() == "":
        continue
    x_pt = max(0.0, x * page_width)
    y_pt = max(0.0, y * page_height)
    w_pt = max(40.0, width * page_width)
    parts.append(
        "\\begin{textblock}{%.2f}(%.2f,%.2f)\n"
        "\\begin{minipage}[t]{%.2fpt}\\raggedright\\fontsize{%.1f}{%.1f}\\selectfont\n%s\n\\end{minipage}\n"
        "\\end{textblock}\n"
        % (w_pt, x_pt, y_pt, w_pt, font_pt, font_pt * 1.25, body)
    )

tex = r"""\documentclass[UTF8,%s]{ctexart}
\usepackage[paperwidth=%.4fin,paperheight=%.4fin,margin=0pt]{geometry}
\usepackage{amsmath,amssymb}
\usepackage[absolute,overlay]{textpos}
\setlength{\TPHorizModule}{1pt}
\setlength{\TPVertModule}{1pt}
\pagestyle{empty}
\begin{document}
%s
\end{document}
""" % (font_class, page_width / 72.0, page_height / 72.0, "\n".join(parts))

work = tempfile.mkdtemp(prefix="md2overlay-")
tex_path = os.path.join(work, "doc.tex")
pdf_path = os.path.join(work, "doc.pdf")
with open(tex_path, "w", encoding="utf-8") as handle:
    handle.write(tex)

result = subprocess.run(
    ["xelatex", "-interaction=nonstopmode", "doc.tex"],
    cwd=work, capture_output=True, text=True, timeout=180,
)
if not os.path.exists(pdf_path):
    raise SystemExit("xelatex failed: " + (result.stdout or "")[-800:])

os.replace(pdf_path, out_path)
print(out_path)
