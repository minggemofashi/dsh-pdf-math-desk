"""Print one PDF page's layout blocks as JSON (PyMuPDF).

Usage: python pdf_blocks.py <input.pdf> <page-index-1-based>
"""
import json
import sys

import fitz

sys.stdout.reconfigure(encoding="utf-8")

pdf_path = sys.argv[1]
page_number = int(sys.argv[2])

document = fitz.open(pdf_path)
page = document[page_number - 1]
width, height = page.rect.width, page.rect.height
data = page.get_text("dict")

items = []
for block in data.get("blocks", []):
    if block.get("type", 0) != 0:
        continue
    lines = block.get("lines", [])
    sizes = []
    text = []
    for line in lines:
        for span in line.get("spans", []):
            sizes.append(span.get("size", 0))
            text.append(span.get("text", ""))
    content = " ".join(part.strip() for part in text if part.strip())
    if content == "":
        continue
    bbox = block["bbox"]
    items.append({
        "bbox": [
            bbox[0] / width,
            bbox[1] / height,
            (bbox[2] - bbox[0]) / width,
            (bbox[3] - bbox[1]) / height,
        ],
        "size": max(sizes) if sizes else 0,
        "text": content[:400],
    })

ordered = sorted(item["size"] for item in items)
median = ordered[len(ordered) // 2] if ordered else 1.0
for index, item in enumerate(items):
    item["id"] = f"b-{page_number:04d}-{index + 1:02d}"
    item["page"] = page_number
    left, top, width, height = item["bbox"]
    if top < 0.09 and width < 0.7:
        item["kind"] = "heading"
    elif width < 0.62 and left > 0.12 and left + width < 0.9 and height < 0.05:
        item["kind"] = "formula"
    else:
        item["kind"] = "paragraph"
    item["size"] = item["size"] / median if median > 0 else 1.0

print(json.dumps(items, ensure_ascii=False))
