"""Rebuild a translation overlay from cached page Markdown, aligned by paragraph.

Why this exists: a chapter translated page by page (no `page-NNN.blocks.json`)
can only be overlaid as a whole-page reflow, so its type size and position do
not match the original. This tool re-splits the cached translation into
paragraphs and puts each paragraph at the matching original text block, using
the block bboxes from `pdf_blocks`. It costs no API calls; it is an
approximation, not a block-level translation.

Usage: python realign_overlay.py <source.pdf> <cache-dir> <out.pdf> <tools-dir>
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys

import fitz

# The Host picks the engine; the overlay renderer name arrives in the env.
OVERLAY_SCRIPT = os.environ.get("MATH_DESK_OVERLAY_SCRIPT", "").strip() or "md2overlay.py"


def page_markdown(page_number, cache_dir):
    path = os.path.join(cache_dir, "page-%03d.md" % page_number)
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    except OSError:
        return ""


def segments_of(markdown):
    """Split a page's Markdown into paragraph-sized pieces.

    Blank lines are the only reliable separator the model gives us; a piece that
    is just the printed page number is not a paragraph."""
    parts = [part.strip() for part in re.split(r"\n\s*\n", markdown) if part.strip()]
    return [part for part in parts if not re.fullmatch(r"[\d\s]+", part)]


def font_class_of(document):
    sizes = []
    for page in document:
        for block in page.get_text("dict").get("blocks", []):
            if block.get("type", 0) != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    value = span.get("size", 0)
                    if value > 0:
                        sizes.append(value)
    sizes.sort()
    median = sizes[len(sizes) // 2] if sizes else 11.0
    return "12pt" if median >= 12.5 else "11pt" if median >= 11.2 else "10pt" if median >= 10 else "9pt"


def merge_boxes(first, second):
    x0 = min(first[0], second[0])
    y0 = min(first[1], second[1])
    x1 = max(first[0] + first[2], second[0] + second[2])
    y1 = max(first[1] + first[3], second[1] + second[3])
    return [x0, y0, x1 - x0, y1 - y0]


def drop_fragments(blocks, segments):
    """Drop tiny formula fragments that carry no paragraph of their own.

    PyMuPDF splits a displayed formula into two or three boxes ("n_i" and
    "s∈G" on their own). The translation puts the whole formula in one
    paragraph, so keeping the fragment as a separate block shifts every
    following paragraph by one block. Dropping the shortest formula fragments
    keeps the rest aligned; the fragment's symbols are already in the formula
    that precedes it.
    """
    kept = list(blocks)
    while len(kept) > len(segments):
        candidates = []
        for index, block in enumerate(kept):
            text = (block.get("text") or "").strip()
            height = float(block["bbox"][3])
            if block.get("kind") == "formula" and len(text) <= 12 and height < 0.022:
                candidates.append((len(text), index))
        if not candidates:
            break
        candidates.sort()
        kept.pop(candidates[0][1])
    return kept


def align(segments, blocks):
    """Line paragraphs and blocks up in reading order.

    Counts usually match; when they do not, merge the pair with the smallest gap
    (fewer blocks than paragraphs) or the two shortest neighbours (more
    paragraphs than blocks) so the rest keeps its own position."""
    segs = list(segments)
    blks = [dict(block) for block in blocks]
    while len(segs) > len(blks) and len(segs) > 1:
        best = min(range(len(segs) - 1), key=lambda index: len(segs[index]) + len(segs[index + 1]))
        segs[best:best + 2] = [segs[best] + "\n\n" + segs[best + 1]]
    while len(blks) > len(segs) and len(blks) > 1:
        best = None
        for index in range(len(blks) - 1):
            first, second = blks[index], blks[index + 1]
            gap = second["bbox"][1] - (first["bbox"][1] + first["bbox"][3])
            first_center = first["bbox"][0] + first["bbox"][2] / 2
            second_center = second["bbox"][0] + second["bbox"][2] / 2
            # A display formula split over two boxes sits right under its own
            # first half and shares its centre line; a paragraph followed by a
            # formula does not. Choosing by gap alone merged the wrong pair and
            # shifted every following translation by one block.
            score = abs(gap) + abs(first_center - second_center) * 0.5
            if best is None or score < best[0]:
                best = (score, index)
        if best is None:
            break
        index = best[1]
        first, second = blks[index], blks[index + 1]
        merged = {
            "bbox": merge_boxes(first["bbox"], second["bbox"]),
            "size": max(first.get("size", 1.0), second.get("size", 1.0)),
            "kind": "paragraph",
        }
        blks[index:index + 2] = [merged]
    return segs, blks


def estimate_height(text, width_pt, font_pt):
    """Rough height in points a paragraph needs at this width and body size."""
    plain = re.sub(r"\$\$.*?\$\$", " ", text, flags=re.S)
    per_line = max(8, int(width_pt / (font_pt * 1.05)))
    lines = 0
    for line in plain.split("\n"):
        stripped = line.strip()
        if stripped == "":
            continue
        lines += max(1, math.ceil(len(stripped) / per_line))
    formulas = text.count("$$") // 2
    return lines * font_pt * 1.25 + formulas * font_pt * 2.2


def display_gap(text):
    """Offset just before the first display formula that starts its own line."""
    match = re.search(r"\n\s*\$\$", text)
    return -1 if match is None else match.start()


def balance_dense(pairs, width_pt, height_pt, font_pt):
    """Give a packed paragraph a second block instead of shrinking it to 4pt.

    The whole-page translation merges the original's paragraphs differently, so
    one segment can carry a paragraph plus the formula and sentence of the block
    below. When that segment needs much more room than its own box, split it
    before the display formula and let the next block start with that formula.
    """
    result = []
    index = 0
    while index < len(pairs):
        block, text = pairs[index]
        if index + 1 < len(pairs):
            x, y, w, h = block["bbox"]
            room = (pairs[index + 1][0]["bbox"][1] - y) * height_pt
            gap_at = display_gap(text)
            if gap_at > 0 and room > 0 and estimate_height(text, w * width_pt, font_pt) > room * 1.35:
                head = text[:gap_at].strip()
                tail = text[gap_at:].strip()
                if head and tail:
                    next_block, next_text = pairs[index + 1]
                    result.append((block, head))
                    result.append((next_block, tail + "\n\n" + next_text))
                    index += 2
                    continue
        result.append((block, text))
        index += 1
    return result


def page_pdf(page_number, size, blocks, segments, font_class, work, tools_dir):
    """Render one page with md2overlay; returns the page PDF path or None."""
    if not segments or not blocks:
        return None
    font_pt = float(font_class.replace("pt", ""))
    pairs = balance_dense(list(zip(blocks, segments)), size[0], size[1], font_pt)
    synthetic = []
    for index, (block, text) in enumerate(pairs):
        synthetic.append({
            "id": "r-%04d-%02d" % (page_number, index + 1),
            "page": page_number,
            "bbox": block["bbox"],
            "size": block.get("size", 1.0),
            "kind": block.get("kind", "paragraph"),
            "md": text,
        })
    blocks_path = os.path.join(work, "page-%03d.blocks.json" % page_number)
    with open(blocks_path, "w", encoding="utf-8") as handle:
        json.dump(synthetic, handle, ensure_ascii=False)
    page_path = os.path.join(work, "page-%03d.pdf" % page_number)
    subprocess.run(
        [sys.executable, os.path.join(tools_dir, OVERLAY_SCRIPT), blocks_path, page_path,
         str(size[0]), str(size[1]), font_class],
        check=True,
    )
    return page_path if os.path.exists(page_path) else None


def run(source, cache_dir, out_path, tools_dir):
    sys.path.insert(0, tools_dir)
    from pdf_blocks import blocks_for_page

    document = fitz.open(source)
    font_class = font_class_of(document)
    work = out_path + ".work"
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work, exist_ok=True)
    merged = fitz.open()
    placed = 0
    try:
        for index, page in enumerate(document):
            number = index + 1
            size = [page.rect.width, page.rect.height]
            segments = segments_of(page_markdown(number, cache_dir))
            blocks = blocks_for_page(source, number)
            blocks = drop_fragments(blocks, segments)
            segments, blocks = align(segments, blocks)
            page_path = page_pdf(number, size, blocks, segments, font_class, work, tools_dir)
            if page_path is None:
                merged.new_page(width=size[0], height=size[1])
                continue
            merged.insert_pdf(fitz.open(page_path))
            placed += 1
        if merged.page_count == 0:
            raise SystemExit("no cached translation to realign")
        temporary = out_path + ".tmp.pdf"
        merged.save(temporary)
        os.replace(temporary, out_path)
        print(json.dumps({"pages": merged.page_count, "aligned": placed}, ensure_ascii=False))
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main():
    if len(sys.argv) < 5:
        raise SystemExit("usage: realign_overlay.py <source.pdf> <cache-dir> <out.pdf> <tools-dir>")
    run(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])


if __name__ == "__main__":
    main()
