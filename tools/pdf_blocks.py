"""One PDF page's layout blocks as JSON (PyMuPDF).

Usage:
  python pdf_blocks.py <input.pdf> <page-index-1-based>

The parsing is also importable: `blocks_for_page(path, number)` returns the same
list, which is what the paragraph realigner uses instead of spawning this script
(no pipes, no second interpreter).

Besides the paragraph box and its text, each block reports what the overlay needs
to sit the translation where the original sits: the first baseline, the printed
line spacing, the text alignment and the dominant font. The font size is the
character-weighted body size, not the largest span, so a heading inside a
paragraph cannot inflate the whole block.
"""
import json
import sys

import fitz

# Long paragraphs used to be cut at 400 characters, so the model only saw the
# first part of a paragraph and guessed the tail from the page image. The cap is
# now only a request-size guard.
MAX_BLOCK_CHARS = 4000


def _align_of(line_boxes):
    """How a block's lines line up: left / center / right / justify."""
    if len(line_boxes) < 2:
        return "left"
    lefts = [box[0] for box in line_boxes]
    rights = [box[2] for box in line_boxes]
    centers = [(box[0] + box[2]) / 2 for box in line_boxes]
    left_var = max(lefts) - min(lefts)
    right_var = max(rights) - min(rights)
    center_var = max(centers) - min(centers)
    if left_var < 3.0 and right_var < 3.0:
        return "justify"
    if left_var < 3.0:
        return "left"
    if center_var < 3.0:
        return "center"
    if right_var < 3.0:
        return "right"
    return "left"


def blocks_for_page(pdf_path, page_number):
    """Return the page's blocks: bbox, body size, text, baseline and alignment."""
    document = fitz.open(pdf_path)
    page = document[page_number - 1]
    width, height = page.rect.width, page.rect.height
    data = page.get_text("dict")

    items = []
    for block in data.get("blocks", []):
        if block.get("type", 0) != 0:
            continue
        lines = block.get("lines", [])
        text = []
        weight = 0.0
        chars = 0
        line_boxes = []
        baselines = []
        fonts = {}
        for line in lines:
            spans = [span for span in line.get("spans", []) if span.get("text", "").strip() != ""]
            if not spans:
                continue
            line_boxes.append(line["bbox"])
            # The baseline comes from the largest span on the line: a superscript
            # riding on the same line must not define the paragraph's baseline.
            main = max(spans, key=lambda span: float(span.get("size") or 0.0))
            origin = main.get("origin") or (0.0, line["bbox"][3])
            baselines.append(float(origin[1]))
            for span in spans:
                size = float(span.get("size") or 0.0)
                piece = span.get("text", "").strip()
                count = max(1, len(piece))
                weight += size * count
                chars += count
                text.append(span.get("text", ""))
                name = str(span.get("font") or "")
                fonts[name] = fonts.get(name, 0) + count
        content = " ".join(part.strip() for part in text if part.strip())
        if content == "":
            continue
        bbox = block["bbox"]
        body_size = weight / chars if chars > 0 else 0.0
        items.append({
            "bbox": [
                bbox[0] / width,
                bbox[1] / height,
                (bbox[2] - bbox[0]) / width,
                (bbox[3] - bbox[1]) / height,
            ],
            "size": body_size,
            "text": content[:MAX_BLOCK_CHARS],
            "_lineBoxes": line_boxes,
            "_baselines": baselines,
            "_fonts": fonts,
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
        nearest["text"] = f"{nearest['text']} {small['text']}".strip()[:MAX_BLOCK_CHARS]
        nearest["_lineBoxes"] = nearest["_lineBoxes"] + small["_lineBoxes"]
        nearest["_baselines"] = nearest["_baselines"] + small["_baselines"]
        for name, count in small["_fonts"].items():
            nearest["_fonts"][name] = nearest["_fonts"].get(name, 0) + count
    items = keep

    ordered = sorted(item["size"] for item in items)
    median = ordered[len(ordered) // 2] if ordered else 1.0
    for index, item in enumerate(items):
        line_boxes = item.pop("_lineBoxes")
        baselines = sorted(item.pop("_baselines"))
        fonts = item.pop("_fonts")
        item["id"] = f"b-{page_number:04d}-{index + 1:02d}"
        item["page"] = page_number
        left, top, width_n, height_n = item["bbox"]
        if top < 0.09 and width_n < 0.7:
            item["kind"] = "heading"
        elif width_n < 0.62 and left > 0.12 and left + width_n < 0.9 and height_n < 0.05:
            item["kind"] = "formula"
        else:
            item["kind"] = "paragraph"
        item["size"] = item["size"] / median if median > 0 else 1.0
        # Where the printed text sits: the overlay anchors the translation on this
        # baseline instead of on the top edge of the box.
        item["lines"] = len(baselines)
        item["firstBaseline"] = baselines[0] / height if baselines else top + height_n
        item["leading"] = (
            (baselines[-1] - baselines[0]) / (len(baselines) - 1) / height
            if len(baselines) > 1 else 0.0
        )
        item["align"] = _align_of(line_boxes)
        item["font"] = max(fonts, key=fonts.get) if fonts else ""

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
