"""Render page thumbnails for the split panel, and report the page layout.

usage: pdf_thumbs.py <pdf> <cache-dir> <width> <from> <to>

`cache-dir` is the per-file cache root (the caller keys it by PDF identity);
page images land in `<cache-dir>/<width>/pNNNN.jpg` and the page geometry in
`<cache-dir>/info.json`. Pages already present are left alone, so a scroll that
re-asks an overlapping range costs almost nothing. JSON on stdout:

    {"pages": 340, "pageWidth": 495.0, "pageHeight": 718.0, "rendered": [1, 2]}

PyMuPDF renders a page at thumbnail size in a few milliseconds; Pillow writes
the JPEG (a few KB) because PyMuPDF's own `save` always emits PNG here.
"""
import json
import os
import sys
from pathlib import Path

import fitz
from PIL import Image

WIDTH_MIN = 80
WIDTH_MAX = 480


def main() -> int:
    if len(sys.argv) < 6:
        print("usage: pdf_thumbs.py <pdf> <cache-dir> <width> <from> <to>", file=sys.stderr)
        return 2
    pdf_path = sys.argv[1]
    cache_root = Path(sys.argv[2])
    width = max(WIDTH_MIN, min(WIDTH_MAX, int(float(sys.argv[3]))))
    first = max(1, int(sys.argv[4]))
    last = max(first, int(sys.argv[5]))

    document = fitz.open(pdf_path)
    pages = document.page_count
    if pages <= 0:
        raise SystemExit("PDF 没有页面")
    first = min(first, pages)
    last = min(last, pages)
    first_page = document[0]
    info = {
        "pages": pages,
        "pageWidth": round(first_page.rect.width, 2),
        "pageHeight": round(first_page.rect.height, 2),
    }
    cache_root.mkdir(parents=True, exist_ok=True)
    info_path = cache_root / "info.json"
    info_tmp = cache_root / "info.json.tmp"
    info_tmp.write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")
    os.replace(info_tmp, info_path)

    page_dir = cache_root / str(width)
    page_dir.mkdir(parents=True, exist_ok=True)
    rendered = []
    for number in range(first, last + 1):
        target = page_dir / f"p{number:04d}.jpg"
        if target.is_file() and target.stat().st_size > 0:
            rendered.append(number)
            continue
        page = document[number - 1]
        scale = width / page.rect.width
        pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False, colorspace=fitz.csRGB)
        image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        temporary = page_dir / f"p{number:04d}.tmp"
        image.save(str(temporary), "JPEG", quality=80, optimize=True)
        os.replace(temporary, target)
        rendered.append(number)

    document.close()
    print(json.dumps({**info, "rendered": rendered, "thumbWidth": width}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
