"""Merge single-page PDFs into one.

Usage: python pdf_merge.py <output.pdf> <page-1.pdf> <page-2.pdf> ...
"""
import sys

import fitz

output = sys.argv[1]
merged = fitz.open()
for path in sys.argv[2:]:
    page_doc = fitz.open(path)
    merged.insert_pdf(page_doc)
merged.save(output)
print(output)
