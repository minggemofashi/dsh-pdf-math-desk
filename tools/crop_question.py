"""Render one normalized rectangle of a PDF page to a lossless WebP.

Used by the workbench's question marks: the model gets a picture of exactly the
framed region, which works for scanned pages that have no text layer. Lossless
WebP keeps the pixels exact while halving the size of an equivalent PNG.

Usage:
  py crop_question.py <pdf> <page> <x> <y> <w> <h> <out.webp>

The rectangle is normalized to the page box (0..1), the same coordinates the
browser stores for a question mark.
"""
import argparse
import io
import os
import sys

try:
    import fitz
except ImportError:  # pragma: no cover - PyMuPDF is a plugin dependency
    raise SystemExit("需要 PyMuPDF：py -m pip install pymupdf")

try:
    from PIL import Image
except ImportError:  # pragma: no cover - Pillow ships with the PDF tools
    raise SystemExit("需要 Pillow：py -m pip install pillow")


def clamp(value):
    return max(0.0, min(1.0, float(value)))


def main(argv=None):
    parser = argparse.ArgumentParser(description="把 PDF 的一页框选区域渲染成无损 WebP")
    parser.add_argument("pdf")
    parser.add_argument("page", type=int)
    parser.add_argument("x", type=float)
    parser.add_argument("y", type=float)
    parser.add_argument("w", type=float)
    parser.add_argument("h", type=float)
    parser.add_argument("out")
    args = parser.parse_args(argv)

    doc = fitz.open(args.pdf)
    try:
        if args.page < 1 or args.page > doc.page_count:
            raise SystemExit("页码超出文档")
        page = doc.load_page(args.page - 1)
        box = page.rect
        x = clamp(args.x)
        y = clamp(args.y)
        w = max(0.001, min(1.0 - x, clamp(args.w)))
        h = max(0.001, min(1.0 - y, clamp(args.h)))
        clip = fitz.Rect(
            box.x0 + x * box.width,
            box.y0 + y * box.height,
            box.x0 + (x + w) * box.width,
            box.y0 + (y + h) * box.height,
        )
        if clip.is_empty:
            raise SystemExit("框选区域为空")
        # Enough pixels to read a small band, capped so a full-page box does not
        # produce a huge image.
        scale = max(2.0, min(8.0, 1400.0 / max(1.0, clip.width)))
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip, alpha=False)
        image = Image.open(io.BytesIO(pix.tobytes("png")))
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGB")
        target = os.path.abspath(args.out)
        if not target.lower().endswith(".webp"):
            target += ".webp"
        os.makedirs(os.path.dirname(target), exist_ok=True)
        # Lossless: exact pixels, roughly half of PNG's size for this kind of scan.
        image.save(target, format="WEBP", lossless=True, quality=100, method=6)
        print(target)
        return 0
    finally:
        doc.close()


if __name__ == "__main__":
    sys.exit(main())
