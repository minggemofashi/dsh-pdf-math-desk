"""Compose one exported PDF page: original + revealed translation + annotations.

Usage:
  python export_page.py <source.pdf> <overlay.pdf|-> <page> <masks.json|-> <annots.json|-> <out.pdf>

`overlay.pdf` is the bbox-positioned translation (`<stem>_overlay.pdf`); each mask
is a normalized `{x,y,w,h}` window that reveals that region of the overlay page.
Annotations are normalized strokes (`{kind:'stroke', points:[[x,y]...], color,
width}`) and text notes (`{kind:'text', x, y, text, color}`).
"""
import json
import os
import sys

import fitz


def rgb(value, fallback=(0.12, 0.12, 0.12)):
    text = str(value or "").strip().lstrip("#")
    if len(text) == 3:
        text = "".join(char * 2 for char in text)
    if len(text) != 6:
        return fallback
    try:
        return tuple(int(text[index:index + 2], 16) / 255.0 for index in (0, 2, 4))
    except ValueError:
        return fallback


source_path, overlay_path, page_number, masks_path, annots_path, out_path = sys.argv[1:7]
index = max(0, int(page_number) - 1)
masks = []
if masks_path != "-":
    with open(masks_path, encoding="utf-8") as handle:
        masks = json.load(handle)
annots = []
if annots_path != "-":
    with open(annots_path, encoding="utf-8") as handle:
        annots = json.load(handle)

source = fitz.open(source_path)
index = min(index, source.page_count - 1)
doc = fitz.open()
page = doc.new_page(width=source[0].rect.width, height=source[index].rect.height)
box = page.rect
page.show_pdf_page(box, source, index)

if overlay_path != "-" and os.path.exists(overlay_path):
    overlay = fitz.open(overlay_path)
    if index < overlay.page_count:
        for mask in masks:
            try:
                rect = fitz.Rect(
                    float(mask["x"]) * box.width,
                    float(mask["y"]) * box.height,
                    (float(mask["x"]) + float(mask["w"])) * box.width,
                    (float(mask["y"]) + float(mask["h"])) * box.height,
                )
            except (KeyError, TypeError, ValueError):
                continue
            if rect.is_empty or rect.width <= 1 or rect.height <= 1:
                continue
            # Same page size on both sides, so the clip equals the target rect.
            page.show_pdf_page(rect, overlay, index, clip=rect)

for entry in annots:
    color = rgb(entry.get("color"))
    if entry.get("kind") == "text":
        text = str(entry.get("text") or "")
        if text.strip() == "":
            continue
        x = float(entry.get("x", 0)) * box.width
        y = float(entry.get("y", 0)) * box.height
        for offset, line in enumerate(text.split("\n")):
            page.insert_text((x, y + 14 + offset * 18), line, fontsize=14,
                             fontname="china-s", color=color)
        continue
    points = [
        fitz.Point(float(point[0]) * box.width, float(point[1]) * box.height)
        for point in entry.get("points") or []
        if isinstance(point, (list, tuple)) and len(point) >= 2
    ]
    if len(points) < 2:
        continue
    page.draw_polyline(points, color=color, width=float(entry.get("width") or 2),
                       lineCap=1, lineJoin=1, overlay=True)

tmp = out_path + ".tmp.pdf"
doc.save(tmp)
os.replace(tmp, out_path)
print(out_path)
