"""One PDF page's layout blocks as JSON (PyMuPDF).

Usage:
  python pdf_blocks.py <input.pdf> <page-index-1-based>

The parsing is also importable: `blocks_for_page(path, number)` returns the same
list, which is what the paragraph realigner uses instead of spawning this script
(no pipes, no second interpreter).
"""
import json
import sys

import fitz


def blocks_for_page(pdf_path, page_number):
    """Return the page's blocks: normalized bbox, relative size, kind and text."""
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

    def center(item):
        return (item["bbox"][0] + item["bbox"][2] / 2, item["bbox"][1] + item["bbox"][3] / 2)

    # Superscripts/subscripts often arrive as their own tiny block. Merge them into
    # the nearest real block instead of dropping them, so the paragraph box covers
    # the small glyph too.
    tiny = [item for item in items if item["bbox"][3] < 0.028 and len(item["text"]) <= 8]
    keep = [item for item in items if item not in tiny]
    for small in tiny:
        sx, sy = center(small)
        nearest = None
        best = 0.035
        for candidate in keep:
            cx, cy = center(candidate)
            distance = abs(sy - cy)
            if distance < best:
                best = distance
                nearest = candidate
        if nearest is None:
            keep.append(small)
            continue
        x0 = min(nearest["bbox"][0], small["bbox"][0])
        y0 = min(nearest["bbox"][1], small["bbox"][1])
        x1 = max(nearest["bbox"][0] + nearest["bbox"][2], small["bbox"][0] + small["bbox"][2])
        y1 = max(nearest["bbox"][1] + nearest["bbox"][3], small["bbox"][1] + small["bbox"][3])
        nearest["bbox"] = [x0, y0, x1 - x0, y1 - y0]
        nearest["text"] = f"{nearest['text']} {small['text']}".strip()[:400]
    items = keep

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

    # Page numbers / footers: tiny blocks in the bottom margin carry no paragraph
    # content and were being misread as formulas.
    items = [
        item for item in items
        if not (item["bbox"][1] > 0.9 and item["bbox"][3] < 0.03 and item["bbox"][2] < 0.12)
    ]

    return items


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    pdf_path = sys.argv[1]
    page_number = int(sys.argv[2])
    print(json.dumps(blocks_for_page(pdf_path, page_number), ensure_ascii=False))


if __name__ == "__main__":
    main()
