"""Whole PDF text as one markdown file (PyMuPDF).

Usage:
  python pdf_text.py <input.pdf>

Prints JSON:
  {"pages": [{"page": 1, "text": "..."}, ...], "chars": 12345, "pageCount": 42}

The Host keeps the result in `.pdfdesk/cache/<book>/<chapter>/text.md` so the
hidden base session can read a chapter once instead of re-reading the PDF for
every mode.
"""
import json
import sys

import fitz


def whole_text(pdf_path):
    document = fitz.open(pdf_path)
    pages = []
    chars = 0
    for index, page in enumerate(document, start=1):
        text = page.get_text("text").strip()
        chars += len(text)
        pages.append({"page": index, "text": text})
    return {"pages": pages, "chars": chars, "pageCount": len(pages)}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: pdf_text.py <input.pdf>", file=sys.stderr)
        sys.exit(2)
    print(json.dumps(whole_text(sys.argv[1]), ensure_ascii=False))
