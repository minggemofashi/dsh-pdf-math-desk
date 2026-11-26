"""Split one PDF into chapter files named the way the workbench reads them.

Local tool (T-10): no OCR, no encryption, no watermark — only the split the
plugin actually needs. Output names follow the workbench rule
`<id>_cNN_<title>_p<from>-<to>.pdf`, where the page numbers are 1-based physical
pages and `cNN` is the chapter code the reader sorts by.

Usage:
  py split_pdf.py <input.pdf> <out-dir> --ranges "1-10,11-17,18-32" --id 书名
  py split_pdf.py <input.pdf> <out-dir> --breaks "10,17" --id 书名
  py split_pdf.py <input.pdf> <out-dir> --bookmarks --id 书名

`--breaks` means "cut after these pages": 10,17 gives 1-10, 11-17, 18-end.
`--bookmarks` reads the level-1 outline; each entry becomes one chapter and its
title is reused when the range has a single bookmark.
Ranges win over breaks, breaks win over bookmarks.
"""
import argparse
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

try:
    import fitz
except ImportError:  # pragma: no cover - PyMuPDF is a plugin dependency
    raise SystemExit("需要 PyMuPDF：py -m pip install pymupdf")


def safe_title(text, fallback):
    """A file-name-safe chapter title; the workbench only splits on `_`."""
    cleaned = re.sub(r"[\\/:*?\"<>|\r\n\t_]+", " ", str(text or "")).strip()
    cleaned = re.sub(r"\s+", "", cleaned)
    return cleaned[:40] if cleaned else fallback


def parse_ranges(spec, page_count):
    """`1-10,11-17` -> [(1, 10), (11, 17)], clamped to the document."""
    ranges = []
    for piece in str(spec).split(","):
        piece = piece.strip()
        if piece == "":
            continue
        match = re.fullmatch(r"(\d+)\s*(?:-\s*(\d+))?", piece)
        if match is None:
            raise SystemExit("看不懂的页码范围：%s（例：1-10,11-17）" % piece)
        start = int(match.group(1))
        end = int(match.group(2) or start)
        if start < 1 or end < start or end > page_count:
            raise SystemExit("页码范围超出文档：%s（共 %d 页）" % (piece, page_count))
        ranges.append((start, end))
    if ranges == []:
        raise SystemExit("没有可拆分的页码范围")
    return ranges


def ranges_from_breaks(spec, page_count):
    """`10,17` -> 1-10, 11-17, 18-end (a trailing zero-length range is dropped)."""
    cuts = []
    for piece in str(spec).split(","):
        piece = piece.strip()
        if piece == "":
            continue
        if not piece.isdigit():
            raise SystemExit("断点必须是页码：%s" % piece)
        cuts.append(int(piece))
    cuts = sorted({cut for cut in cuts if 0 < cut < page_count})
    if cuts == []:
        raise SystemExit("断点必须落在 1..%d 之内" % (page_count - 1))
    ranges = []
    start = 1
    for cut in cuts:
        ranges.append((start, cut))
        start = cut + 1
    if start <= page_count:
        ranges.append((start, page_count))
    return ranges


def ranges_from_bookmarks(doc):
    """Level-1 outline entries -> chapter ranges plus their titles."""
    entries = [(title, page) for level, title, page in doc.get_toc(simple=False) if level == 1 and page > 0]
    if entries == []:
        raise SystemExit("这本 PDF 没有一级书签，改用 --ranges 或 --breaks")
    entries.sort(key=lambda item: item[1])
    ranges = []
    for index, (title, page) in enumerate(entries):
        end = entries[index + 1][1] - 1 if index + 1 < len(entries) else doc.page_count
        start = max(1, page)
        if end < start:
            continue
        ranges.append((start, end, title))
    return ranges


def write_parts(input_path, out_dir, parts, book_id):
    """parts: [(from, to, title)] -> written file paths."""
    os.makedirs(out_dir, exist_ok=True)
    source = fitz.open(input_path)
    written = []
    try:
        for index, (start, end, title) in enumerate(parts):
            code = "c%02d" % index
            name = "%s_%s_%s_p%03d-%03d.pdf" % (
                safe_title(book_id, "book"), code, safe_title(title, "未命名"), start, end)
            target = os.path.join(out_dir, name)
            part = fitz.open()
            try:
                part.insert_pdf(source, from_page=start - 1, to_page=end - 1)
                part.save(target, garbage=3, deflate=True)
            finally:
                part.close()
            written.append({"code": code, "from": start, "to": end, "title": title, "path": target})
            print("%s  %d-%d  %s" % (code, start, end, name))
    finally:
        source.close()
    manifest = os.path.join(out_dir, "拆分清单.json")
    with open(manifest, "w", encoding="utf-8") as handle:
        json.dump({"input": os.path.abspath(input_path), "parts": written}, handle, ensure_ascii=False, indent=1)
    return written, manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description="把一本 PDF 按章节拆成书库可读的分片")
    parser.add_argument("input", help="整本 PDF")
    parser.add_argument("outdir", help="输出目录（通常是 <书库>/分片/<书id>）")
    parser.add_argument("--id", default="", help="书 id，用于文件名前缀；缺省取输入文件名")
    parser.add_argument("--ranges", default="", help="页码范围：1-10,11-17")
    parser.add_argument("--breaks", default="", help="断点：10,17（= 在第 10、17 页后切开）")
    parser.add_argument("--bookmarks", action="store_true", help="按一级书签切章")
    args = parser.parse_args(argv)

    if not os.path.isfile(args.input):
        raise SystemExit("找不到输入文件：%s" % args.input)
    source = fitz.open(args.input)
    try:
        page_count = source.page_count
        if args.ranges:
            parts = [(start, end, "") for start, end in parse_ranges(args.ranges, page_count)]
        elif args.breaks:
            parts = [(start, end, "") for start, end in ranges_from_breaks(args.breaks, page_count)]
        elif args.bookmarks:
            parts = ranges_from_bookmarks(source)
        else:
            raise SystemExit("请给出 --ranges、--breaks 或 --bookmarks 之一")
        book_id = args.id or os.path.splitext(os.path.basename(args.input))[0]
        written, manifest = write_parts(args.input, args.outdir, parts, book_id)
        print("共 %d 份，清单：%s" % (len(written), manifest))
        return 0
    finally:
        source.close()


if __name__ == "__main__":
    sys.exit(main())
