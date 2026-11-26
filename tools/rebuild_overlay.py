"""Rebuild an overlay PDF from cached per-page block translations.

Usage: python rebuild_overlay.py <source.pdf> <cache-dir> <out.pdf> <tools-dir>
"""
import json
import os
import subprocess
import sys
import tempfile

import fitz

source, cache_dir, out_path, tools_dir = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
# The Host picks the engine; the overlay renderer name arrives in the env.
overlay_script = os.environ.get("MATH_DESK_OVERLAY_SCRIPT", "").strip() or "md2overlay.py"

document = fitz.open(source)
sizes = [[page.rect.width, page.rect.height] for page in document]

span_sizes = []
for page in document:
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type", 0) != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                value = span.get("size", 0)
                if value > 0:
                    span_sizes.append(value)
span_sizes.sort()
median = span_sizes[len(span_sizes) // 2] if span_sizes else 11.0
font_class = "12pt" if median >= 12.5 else "11pt" if median >= 11.2 else "10pt" if median >= 10 else "9pt"

merged = fitz.open()
with tempfile.TemporaryDirectory(prefix="rebuild-overlay-") as work:
    for index, size in enumerate(sizes):
        blocks_path = os.path.join(cache_dir, "page-%03d.blocks.json" % (index + 1))
        if not os.path.exists(blocks_path):
            continue
        page_pdf = os.path.join(work, "page-%03d.pdf" % (index + 1))
        result = subprocess.run(
            [sys.executable, os.path.join(tools_dir, overlay_script), blocks_path, page_pdf,
             str(size[0]), str(size[1]), font_class],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180,
        )
        if os.path.exists(page_pdf):
            merged.insert_pdf(fitz.open(page_pdf))
        elif result.stdout or result.stderr:
            sys.stderr.write((result.stdout or "") + (result.stderr or ""))
            sys.exit(1)

if merged.page_count == 0:
    sys.exit("no cached block pages")
temp_path = out_path + ".tmp.pdf"
merged.save(temp_path)
os.replace(temp_path, out_path)
print(out_path)
