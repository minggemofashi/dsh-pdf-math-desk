"""Rasterize every page of a PDF to PNG files with PyMuPDF.

Usage: python pdf_raster.py <input.pdf> <output-dir> [dpi]

The translation job uses this so the Host owns the image pipeline: leaving the
reader no longer interrupts a running chapter translation.
"""
import os
import sys

import fitz

pdf_path, out_dir = sys.argv[1], sys.argv[2]
dpi = float(sys.argv[3]) if len(sys.argv) > 3 else 140.0

os.makedirs(out_dir, exist_ok=True)
document = fitz.open(pdf_path)
for index, page in enumerate(document):
    pixmap = page.get_pixmap(dpi=dpi)
    pixmap.save(os.path.join(out_dir, f"p{index + 1:04d}.png"))
print(len(document))
