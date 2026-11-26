"""Shared placement/measurement contract for the overlay engines (LaTeX and Typst).

Both kernels decide the same geometry — where a block may sit (`start_x`,
`room_right`, `room_below`), what size/leading it gets, and what the sidecar
`page-NNN.layout.json` records — so those decisions live here instead of being
duplicated per renderer. The measurement is engine-agnostic: both engines print
a zero-width white `MDnnn` marker on a block's first line, and the file is read
back with PyMuPDF in content order.
"""
import json

import fitz


def layout_target(blocks_path, out_path):
    """Where the per-page layout record goes: beside the block cache."""
    if blocks_path.endswith(".blocks.json"):
        return blocks_path[: -len(".blocks.json")] + ".layout.json"
    return out_path + ".layout.json"


def overlaps_x(left, right):
    """True when two blocks share horizontal space, i.e. stack vertically."""
    return not (left[0] + left[2] <= right[0] or right[0] + right[2] <= left[0])


def same_line(first, second):
    """True when two boxes really share a printed line."""
    first_top, first_bottom = float(first[1]), float(first[1]) + float(first[3])
    second_top, second_bottom = float(second[1]), float(second[1]) + float(second[3])
    overlap = min(first_bottom, second_bottom) - max(first_top, second_top)
    return overlap > 0.5 * min(float(first[3]), float(second[3]))


def room_below(block, blocks, page_height, font_pt):
    """Points available from this block's top to the next block under it."""
    x, y, width, height = [float(value) for value in block.get("bbox") or [0, 0, 1, 1]]
    limit = page_height - y * page_height - 4.0
    for other in blocks:
        if other is block:
            continue
        other_box = other.get("bbox") or [0, 0, 1, 1]
        if not overlaps_x([x, y, width], other_box):
            continue
        gap = (float(other_box[1]) - y) * page_height
        if max(2.0, font_pt * 0.6) < gap < limit:
            limit = gap
    return max(6.0, limit)


def room_right(block, blocks):
    """Normalized right edge this block may use when the space beside it is free."""
    x, y, width, height = [float(value) for value in block.get("bbox") or [0, 0, 1, 1]]
    right = x + width
    limit = 0.985
    for other in blocks:
        if other is block:
            continue
        other_box = other.get("bbox") or [0, 0, 1, 1]
        if not same_line(block.get("bbox") or [0, 0, 1, 1], other_box):
            continue
        start = float(other_box[0])
        if start > right + 0.005:
            limit = min(limit, start - 0.004)
    return max(x + 0.08, limit)


def inline_formula(md):
    """Turn a standalone `$$...$$` block into one inline math run."""
    body = md.strip()
    if body.startswith("$$") and body.endswith("$$") and body.count("$$") == 2:
        return "$%s$" % " ".join(body[2:-2].split())
    return ""


def start_x(block, blocks):
    """Left edge to use, pushed right past a same-line neighbour it would overlap."""
    x, y, width, height = [float(value) for value in block.get("bbox") or [0, 0, 1, 1]]
    for other in blocks:
        if other is block:
            continue
        other_box = other.get("bbox") or [0, 0, 1, 1]
        if not same_line(block.get("bbox") or [0, 0, 1, 1], other_box):
            continue
        other_left, other_right = float(other_box[0]), float(other_box[0]) + float(other_box[2])
        if other_left < x - 0.002 and other_right > x + 0.01:
            x = min(0.9, other_right + 0.006)
    return x


def baseline_of(block, page_height, font_pt):
    """The block's first printed baseline, in points from the page top."""
    first = block.get("firstBaseline")
    if first is None or float(first) <= 0:
        bbox = block.get("bbox") or [0, 0, 1, 1]
        return float(bbox[1]) * page_height + font_pt * float(block.get("size") or 1.0)
    return float(first) * page_height


def leading_of(block, body_pt, page_height):
    """Line spacing in points: the printed leading, kept readable."""
    leading = float(block.get("leading") or 0.0)
    if leading <= 0.0:
        return body_pt * 1.25
    return max(body_pt * 1.15, min(body_pt * 1.6, leading * page_height))


def alignment_of(block):
    """The alignment command the LaTeX block's minipage should carry."""
    align = block.get("align")
    if align == "center":
        return "\\centering"
    if align == "right":
        return "\\raggedleft"
    if align == "justify":
        return ""
    return "\\raggedright"


def align_name(block):
    """The printed alignment as a semantic name for the sidecar and the DOM layer."""
    align = block.get("align")
    if align == "center":
        return "center"
    if align == "right":
        return "right"
    if align == "justify":
        return "justify"
    return "left"


def floor_pt(font_pt, min_pt):
    """The smallest body size the overlay may use on this chapter's page."""
    return min(font_pt, min_pt)


def body_of(block, adjustments, font_pt, min_pt):
    """The rendered font size for one block: printed size, then the fit scale."""
    ratio = max(0.95, min(1.5, float(block.get("size") or 1.0)))
    adjustment = adjustments.get(str(block.get("id") or "")) or {}
    scale = float(adjustment.get("scale", 1.0))
    return max(floor_pt(font_pt, min_pt), font_pt * ratio * scale)


def measure_page(pdf_path, placed):
    """Where each placed block's text actually landed, in points.

    Both engines write one block after another, so the extraction order *is* the
    block order: every span after a block's marker belongs to that block until
    the next marker. That is exact even when a long translation runs past the
    following block. Blocks whose body starts with display math carry no marker;
    they are claimed by their reserved rectangle first.
    """
    document = fitz.open(pdf_path)
    try:
        spans = []
        line_number = 0
        for block in document[0].get_text("dict").get("blocks", []):
            for line in block.get("lines", []):
                line_number += 1
                for span in line.get("spans", []):
                    text = span.get("text", "")
                    if text == "":
                        continue
                    origin = span.get("origin") or (0.0, 0.0)
                    size = float(span.get("size") or 0.0)
                    baseline = float(origin[1])
                    raw = fitz.Rect(span["bbox"])
                    # Typst maths spans carry the whole font box (a 10pt symbol
                    # can report 66pt of height), which would inflate every
                    # block's `dst` and its overflow flag. Clamp the vertical
                    # extent to what a glyph can actually ink around its baseline.
                    top = max(raw.y0, baseline - size * 1.25) if size > 0 else raw.y0
                    bottom = min(raw.y1, baseline + size * 0.55) if size > 0 else raw.y1
                    if bottom <= top:
                        bottom = top + 1.0
                    spans.append({
                        "text": text,
                        "rect": fitz.Rect(raw.x0, top, raw.x1, bottom),
                        "size": size,
                        "baseline": baseline,
                        "line": line_number,
                    })
        marker_index = {item["marker"]: index for index, item in enumerate(placed) if item["marker"] is not None}
        marker_at = {}
        for position, span in enumerate(spans):
            for marker, index in marker_index.items():
                if marker in span["text"]:
                    marker_at[position] = index
                    break
        groups = [[] for _ in placed]
        assigned = set()
        for index, item in enumerate(placed):
            if item["marker"] is not None:
                continue
            left, top, right, bottom = item["rect"]
            for position, span in enumerate(spans):
                if position in assigned or position in marker_at:
                    continue
                rect = span["rect"]
                # A display equation can be wider than the box reserved for it
                # (it does not wrap) and its tall parts reach above the box, so
                # the claim uses the baseline band and a wider horizontal reach
                # instead of the ink box.
                if not (left - 40 <= rect.x0 <= right + 40):
                    continue
                if not (item["target"] - 20 <= span["baseline"] <= item["target"] + item["room"] + 20):
                    continue
                groups[index].append(span)
                assigned.add(position)
        current = None
        for position, span in enumerate(spans):
            if position in marker_at:
                current = marker_at[position]
                continue
            if position in assigned or current is None:
                continue
            groups[current].append(span)
            assigned.add(position)
        anchors = {}
        for span in spans:
            for marker, index in marker_index.items():
                if marker in span["text"]:
                    anchors[index] = span
                    break
        measured = []
        for index, own in enumerate(groups):
            text_spans = [span for span in own if span["text"] not in marker_index]
            anchor = anchors.get(index)
            if anchor is None and not text_spans:
                measured.append(None)
                continue
            if not text_spans:
                # The marker was found but its own text produced no spans: the
                # baseline is exact, but there is no ink rectangle to report.
                measured.append({
                    "bounds": None,
                    "size": 0.0,
                    "baseline": anchor["baseline"],
                    "lines": 0,
                })
                continue
            bounds = text_spans[0]["rect"]
            for span in text_spans[1:]:
                bounds = bounds | span["rect"]
            sizes = sorted(span["size"] for span in text_spans if span["size"] > 0)
            # The first printed line's baseline: the largest span on that line.
            # A superscript shares the line but reports a higher origin, and a
            # display equation's marker sits at the placement top rather than on
            # the equation, so neither the marker nor min(baseline) is right.
            first_line = min(span["line"] for span in text_spans)
            line_spans = [span for span in text_spans if span["line"] == first_line]
            first_baseline = max(line_spans, key=lambda span: span["size"])["baseline"]
            measured.append({
                "bounds": bounds,
                "size": sizes[len(sizes) // 2] if sizes else 0.0,
                "baseline": first_baseline,
                # Count extracted lines, not span tops: a superscript on a line
                # is not a second line.
                "lines": len({span["line"] for span in text_spans}),
            })
        return measured
    finally:
        document.close()


def plan_adjustments(placed, measured, font_pt, min_pt):
    """Second-pass correction per block: vertical origin, then font size."""
    adjustments = {}
    limit = floor_pt(font_pt, min_pt)
    for entry, row in zip(placed, measured):
        if row is None:
            continue
        adjustment = {}
        delta = row["baseline"] - entry["target"]
        if abs(delta) > 0.05:
            adjustment["y"] = max(0.0, entry["y"] - delta)
        height = row["bounds"].height if row["bounds"] is not None else 0.0
        if height > entry["room"] + 0.5 and entry["body"] > limit + 0.01:
            scale = max(limit / font_pt, entry["room"] / height)
            if scale < 0.999:
                adjustment["scale"] = scale
        if adjustment:
            adjustments[entry["id"]] = adjustment
    return adjustments


def write_layout(placed, measured, target, page_width, page_height, font_pt):
    """Record where each block's translation landed, for the reader's boxes.

    `box`/`baseline`/`leadingPt`/`align` are what a DOM text layer needs to put
    the same text on the same printed line; `dst` stays the ink rectangle the
    drawn frames use. The fields are additive: older sidecars simply lack them.
    """
    rows = []
    for entry, row in zip(placed, measured):
        if row is None or row["bounds"] is None:
            continue
        bounds = row["bounds"]
        left, top, right, bottom = entry["rect"]
        rows.append({
            "id": entry["id"],
            "dst": [
                bounds.x0 / page_width,
                bounds.y0 / page_height,
                (bounds.x1 - bounds.x0) / page_width,
                (bounds.y1 - bounds.y0) / page_height,
            ],
            # Where the block was placed: left/top/width of the text box in page
            # fractions, and the printed baseline it was anchored to.
            "box": [left / page_width, top / page_height,
                    (right - left) / page_width, (bottom - top) / page_height],
            "baseline": round(entry["target"] / page_height, 5),
            "leadingPt": round(entry["leading"], 2),
            "align": entry["align"],
            # The size the block was asked to render at; formulas legitimately use
            # smaller script sizes, so the readable-size floor is checked against
            # this rather than against the smallest glyph on the page.
            "fontPt": round(entry["body"], 1),
            "renderPt": round(row["size"], 1),
            "lines": row["lines"],
            "baselineDelta": round(row["baseline"] - entry["target"], 2),
            "overflow": bool(bounds.height > entry["room"] + 0.5),
            "scale": round(entry["body"] / font_pt, 3) if font_pt > 0 else 0.0,
        })
    try:
        with open(target, "w", encoding="utf-8") as handle:
            json.dump({"page": {"width": page_width, "height": page_height}, "blocks": rows},
                      handle, ensure_ascii=False)
        return True
    except Exception:
        return False
