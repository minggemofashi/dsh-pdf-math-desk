#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pdfkit.py —— 数学课本工作流的 PDF 处理小工具

依赖：poppler（pdftotext / pdftoppm / pdfinfo，已在 PATH）+ Pillow（校验缩略图与分带）
不联网、不写缓存目录以外的地方。

子命令
  info    <pdf>                              报告页数、页面尺寸、文字层状况、是否扫描版
  text    <pdf> --out DIR [--pages 12-14]    逐页导出文字层 txt（定位用，非成品）
  render  <pdf> --out DIR --pages 12-14 ...  逐页渲染 PNG，可横向分带；已存在则跳过
  sheet   <pdf> --out FILE --pages 1-24      缩略图拼版（扫描版快速找页码用）
  find    <pdf> 关键词 [关键词...]            在文字层里检索，返回命中页码
  verify  <文件> [--tex]                     格式自检：禁用结构 / $ 配对 / LaTeX 可编译
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


# ---------------------------------------------------------------- 基础工具

def die(msg, code=2):
    print(f"[pdfkit] 错误: {msg}", file=sys.stderr)
    sys.exit(code)


def need(tool):
    if shutil.which(tool) is None:
        die(f"找不到 {tool}，请确认 poppler 已加入 PATH")


def run(cmd, **kw):
    return subprocess.run(
        [str(c) for c in cmd],
        capture_output=True, text=True, encoding="utf-8", errors="replace", **kw
    )


def pdf_pages(pdf):
    need("pdfinfo")
    r = run(["pdfinfo", pdf])
    m = re.search(r"^Pages:\s+(\d+)", r.stdout or "", re.M)
    if not m:
        die(f"pdfinfo 读不到页数：{pdf}（{r.returncode} {r.stderr[:200]}）")
    return int(m.group(1))


def parse_pages(spec, total):
    """'12-14,20' -> [12,13,14,20]；空 -> 全部"""
    if not spec or not spec.strip():
        return list(range(1, total + 1))
    out = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        m = re.fullmatch(r"(\d+)\s*-\s*(\d*)", part)
        if m:
            a = int(m.group(1))
            b = int(m.group(2)) if m.group(2) else total
            if b < a:
                die(f"页码范围倒序: {part}")
            out.extend(range(a, b + 1))
        elif part.isdigit():
            out.append(int(part))
        else:
            die(f"看不懂的页码片段: {part!r}")
    pages = [p for p in dict.fromkeys(out) if 1 <= p <= total]
    if not pages:
        die(f"页码范围 {spec!r} 在 1-{total} 内没有任何有效页")
    return pages


def whole_text(pdf):
    """整本文字层，按 \\f 切页。无文字层时返回 ['', '', ...]"""
    need("pdftotext")
    out = scratch("text") / "all.txt"
    run(["pdftotext", "-layout", "-enc", "UTF-8", pdf, out])
    raw = out.read_text(encoding="utf-8", errors="replace") if out.exists() else ""
    chunks = raw.split("\f")
    while chunks and not chunks[-1].strip():
        chunks.pop()
    return chunks


def nospace_len(s):
    return len(re.sub(r"\s+", "", s or ""))


def read_text_any(path):
    """容忍 UTF-8 / UTF-8-BOM / UTF-16(带 BOM) / GB18030 —— Windows 上重定向出来的文件常是 UTF-16"""
    raw = Path(path).read_bytes()
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16", errors="replace")
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw.decode("utf-8-sig", errors="replace")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("gb18030", errors="replace")


# 临时产物一律落在工作区内的缓存目录（沙箱下系统 %TEMP% 的清理会被拒绝），
# 按进程号隔离，多个窗口并发跑同一个 PDF 也不会互相覆盖。
CACHE_ROOT = Path(__file__).resolve().parent.parent / "缓存"
SCRATCH = CACHE_ROOT / "_scratch"


def scratch(*parts):
    d = SCRATCH.joinpath(f"run{os.getpid()}", *parts)
    d.mkdir(parents=True, exist_ok=True)
    return d


def default_out(pdf, kind):
    """缓存按『书名/用途』分目录。多本书共用一个工作区时，靠这个避免 p0001.png 串书。"""
    stem = re.sub(r'[<>:"/\\|?*]', "_", Path(pdf).stem).strip() or "book"
    d = CACHE_ROOT / stem / kind
    d.mkdir(parents=True, exist_ok=True)
    return d


def dir_size(p):
    p = Path(p)
    if p.is_file():
        return p.stat().st_size
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())


# ---------------------------------------------------------------- info

def cmd_info(a):
    pdf = Path(a.pdf)
    if not pdf.exists():
        die(f"文件不存在: {pdf}")
    total = pdf_pages(pdf)
    r = run(["pdfinfo", pdf])
    meta = {}
    for line in (r.stdout or "").splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    counts = [nospace_len(c) for c in whole_text(pdf)]
    counts += [0] * (total - len(counts))
    counts = counts[:total]
    med = sorted(counts)[len(counts) // 2] if counts else 0
    withtext = sum(1 for c in counts if c >= 30)
    is_scan = withtext < total * 0.5 or med < 30
    if is_scan:
        rec = "扫描/图片版：文字层不可用于转写。用 sheet 定位页码、render 出图后逐页读图转写。"
    elif med < 400:
        rec = "疑似带 OCR 文字层：文字层可用于关键词定位（find），转写仍以页面图为准。"
    else:
        rec = "文字版：可用 text/find 快速定位并粗读；公式仍以页面图为准做结构化转写。"
    print(json.dumps({
        "pdf": str(pdf),
        "pages": total,
        "page_size": meta.get("Page size", ""),
        "producer": meta.get("Producer", ""),
        "has_text_layer": not is_scan,
        "is_scan": is_scan,
        "median_chars_per_page": med,
        "pages_with_text": withtext,
        "chars_per_page_head": counts[:12],
        "recommendation": rec,
    }, ensure_ascii=False, indent=2))


# ---------------------------------------------------------------- text

def cmd_text(a):
    pdf = Path(a.pdf)
    total = pdf_pages(pdf)
    pages = parse_pages(a.pages, total)
    outdir = Path(a.out) if a.out else default_out(pdf, "txt")
    outdir.mkdir(parents=True, exist_ok=True)
    written = []
    for p in pages:
        dst = outdir / f"p{p:04d}.txt"
        if dst.exists() and not a.force:
            written.append(str(dst))
            continue
        r = run(["pdftotext", "-layout", "-enc", "UTF-8",
                 "-f", p, "-l", p, pdf, dst])
        if r.returncode != 0 or not dst.exists():
            dst.write_text("", encoding="utf-8")
        written.append(str(dst))
    print(json.dumps({"ok": True, "pages": pages, "files": written},
                     ensure_ascii=False, indent=2))


# ---------------------------------------------------------------- render

def cmd_render(a):
    need("pdftoppm")
    pdf = Path(a.pdf)
    total = pdf_pages(pdf)
    pages = parse_pages(a.pages, total)
    outdir = Path(a.out) if a.out else default_out(pdf, "pages")
    outdir.mkdir(parents=True, exist_ok=True)
    bands = max(1, a.bands)
    overlap = min(0.3, max(0.0, a.overlap))

    def targets_for(p):
        base = outdir / f"p{p:04d}"
        if bands == 1:
            return [outdir / f"p{p:04d}.png"]
        return [outdir / f"p{p:04d}-{i + 1}.png" for i in range(bands)]

    produced, skipped = [], []
    for p in pages:
        tg = targets_for(p)
        if all(t.exists() for t in tg) and not a.force:
            skipped.append(p)
            continue
        with_tmp = scratch("render")
        raw = with_tmp / f"raw_p{p:04d}"
        r = run(["pdftoppm", "-r", str(a.dpi), "-f", p, "-l", p,
                 "-png", "-singlefile", pdf, raw])
        if r.returncode != 0 or not raw.with_suffix(".png").exists():
            die(f"第 {p} 页渲染失败: {(r.stderr or '')[:300]}")
        if bands == 1 and not a.gray:
            shutil.copyfile(raw.with_suffix(".png"), tg[0])
            produced.append(str(tg[0]))
            continue
        from PIL import Image
        im = Image.open(raw.with_suffix(".png"))
        if a.gray:
            im = im.convert("L")
        w, h = im.size
        if bands == 1:
            im.save(tg[0])
            produced.append(str(tg[0]))
            continue
        bh = -(-h // bands)
        ov = int(bh * overlap)
        for i in range(bands):
            top = max(0, i * bh - (ov if i else 0))
            bot = min(h, (i + 1) * bh + (ov if i < bands - 1 else 0))
            im.crop((0, top, w, bot)).save(tg[i])
            produced.append(str(tg[i]))
    print(json.dumps({
        "ok": True, "dpi": a.dpi, "bands": bands,
        "produced": produced, "skipped_existing": skipped,
        "note": "bands>1 时每页切成上下多带，按 -1/-2 顺序交给读图工具，接缝有重叠。",
    }, ensure_ascii=False, indent=2))


# ---------------------------------------------------------------- sheet

def cmd_sheet(a):
    need("pdftoppm")
    from PIL import Image, ImageDraw
    try:
        from PIL import ImageFont
        font = ImageFont.load_default(size=17)
    except Exception:
        font = None
    pdf = Path(a.pdf)
    total = pdf_pages(pdf)
    pages = parse_pages(a.pages, total)
    cols = max(1, a.cols)
    thumbs = []
    td = scratch("sheet")
    for p in pages:
        raw = td / f"p{p}"
        r = run(["pdftoppm", "-r", str(a.dpi), "-f", p, "-l", p,
                 "-png", "-singlefile", pdf, raw])
        if r.returncode != 0 or not raw.with_suffix(".png").exists():
            die(f"第 {p} 页渲染失败: {(r.stderr or '')[:300]}")
        thumbs.append((p, Image.open(raw.with_suffix(".png")).convert("RGB").copy()))
    cw = max(im.width for _, im in thumbs)
    ch = max(im.height for _, im in thumbs)
    pad, lab = 8, 22
    rows = -(-len(thumbs) // cols)
    W = cols * (cw + pad) + pad
    H = rows * (ch + lab + pad) + pad
    sheet = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(sheet)
    for i, (p, im) in enumerate(thumbs):
        cx = pad + (i % cols) * (cw + pad)
        cy = pad + (i // cols) * (ch + lab + pad)
        d.rectangle([cx, cy, cx + cw, cy + lab], fill="#e8e8e8")
        d.text((cx + 4, cy + 3), f"p.{p}", fill="black", font=font)
        sheet.paste(im, (cx, cy + lab))
    out = Path(a.out) if a.out else default_out(pdf, "sheets")
    if out.suffix.lower() not in (".png", ".jpg", ".jpeg"):
        out.mkdir(parents=True, exist_ok=True)
        out = out / f"sheet_p{pages[0]:04d}-{pages[-1]:04d}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(json.dumps({
        "ok": True, "file": str(out), "pages": pages,
        "size": [W, H], "cell": [cw, ch],
        "note": "低分辨率拼版，只用于辨认页码与章节标题；公式细节务必再 render 高清图。",
    }, ensure_ascii=False, indent=2))


# ---------------------------------------------------------------- find

def cmd_find(a):
    pdf = Path(a.pdf)
    chunks = whole_text(pdf)
    if not any(c.strip() for c in chunks):
        die("这本 PDF 没有可用文字层（扫描版），find 无法检索；改用 sheet 缩略图定位页码。", 3)
    result = {}
    for kw in a.keywords:
        hits = []
        for i, c in enumerate(chunks, start=1):
            n = c.count(kw)
            if n:
                hits.append({"page": i, "count": n})
        result[kw] = hits
    print(json.dumps({"pdf": str(pdf), "hits": result,
                      "note": "命中来自文字层，可能有 OCR 错字导致漏检；未命中不等于没有。"},
                     ensure_ascii=False, indent=2))
    if a.context:
        print("\n--- 上下文 ---")
        for kw in a.keywords:
            for h in result[kw][:a.context]:
                c = chunks[h["page"] - 1]
                for line in c.splitlines():
                    if kw in line:
                        print(f"[p.{h['page']}] {line.strip()[:160]}")


# ---------------------------------------------------------------- verify

FORBIDDEN = [
    (r"(?<!\\)\\\[", "\\[  （行间公式必须用 $$…$$）"),
    (r"(?<!\\)\\\]", "\\]  （行间公式必须用 $$…$$）"),
    (r"(?<!\\)\\\(", "\\("),
    (r"(?<!\\)\\\)", "\\)"),
]
WARN_ENVS = ["equation", "align", "gather", "eqnarray", "displaymath", "multline", "math"]


def math_segments(text):
    """粗切 $...$ / $$...$$，跳过 \\$ 转义"""
    disp, inline = [], []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch == "\\" and i + 1 < n:
            i += 2
            continue
        if text.startswith("$$", i):
            j = text.find("$$", i + 2)
            if j == -1:
                break
            disp.append(text[i + 2:j])
            i = j + 2
            continue
        if ch == "$":
            j = i + 1
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == "$":
                    break
                j += 1
            if j >= n:
                break
            inline.append(text[i + 1:j])
            i = j + 1
            continue
        i += 1
    return disp, inline


def cmd_verify(a):
    src = Path(a.file)
    if not src.exists():
        die(f"文件不存在: {src}")
    text = read_text_any(src)
    errors, warns = [], []

    for pat, name in FORBIDDEN:
        for m in re.finditer(pat, text):
            line = text.count("\n", 0, m.start()) + 1
            errors.append(f"第 {line} 行出现禁用结构 {name}")

    for env in WARN_ENVS:
        for m in re.finditer(r"\\begin\{" + env + r"\}", text):
            line = text.count("\n", 0, m.start()) + 1
            warns.append(f"第 {line} 行 \\begin{{{env}}}：建议改写为 $$…$$（课本转写统一用 $/$$）")

    # $ 配对（跳过 \$）
    i, n, single, dbl = 0, len(text), 0, 0
    while i < n:
        if text[i] == "\\":
            i += 2
            continue
        if text.startswith("$$", i):
            dbl += 1
            i += 2
            continue
        if text[i] == "$":
            single += 1
        i += 1
    if single % 2:
        errors.append(f"$ 未配对：单个 $ 出现 {single} 次（应为偶数），行内公式缺了收尾符")
    if dbl % 2:
        errors.append(f"$$ 未配对：$$ 出现 {dbl} 次（应为偶数）")

    disp, inline = math_segments(text)
    result = {
        "file": str(src),
        "ok": not errors,
        "errors": errors,
        "warnings": warns[:20],
        "math": {"display": len(disp), "inline": len(inline)},
        "size_chars": len(text),
    }

    if a.tex and (disp or inline) and not errors:
        need("xelatex")
        body = []
        for s in disp:
            body.append("\\[\n" + s.strip() + "\n\\]")
        for s in inline:
            body.append("$" + s.strip() + "$")
        tex = ("\\documentclass[12pt]{article}\n"
               "\\usepackage{amsmath,amssymb,amsfonts,bm}\n"
               "\\usepackage{ctex}\n\\pagestyle{empty}\n"
               "\\begin{document}\n" + "\n".join(body) + "\n\\end{document}\n")
        td = scratch("texverify")
        (td / "v.tex").write_text(tex, encoding="utf-8")
        env = os.environ.copy()
        env["TEXMFVAR"] = str(td / "tv")
        env["TEXMFCACHE"] = str(td / "tv")
        # 关键：cwd 切到目录、只传相对文件名。TeX 在 Windows 上处理含中文的
        # 命令行路径会按本地代码页解码，中文路径直接编译失败。
        r = run(["xelatex", "-interaction=nonstopmode", "-halt-on-error", "v.tex"],
                cwd=td, env=env, timeout=180)
        log = td / "v.log"
        logtext = read_text_any(log) if log.exists() else ""
        lerrs = [ln for ln in logtext.splitlines() if ln.startswith("! ")]
        ctx = []
        for ln in logtext.splitlines():
            if ln.startswith("l."):
                ctx.append(ln[:160])
        result["tex_compile"] = {
            "ok": r.returncode == 0 and not lerrs,
            "errors": (lerrs[:8] if lerrs else ([f"xelatex 返回码 {r.returncode}"] if r.returncode != 0 else [])),
            "lines": ctx[:8],
            "stderr_tail": (r.stderr or "")[-400:] if r.returncode != 0 else "",
        }
        if not result["tex_compile"]["ok"]:
            result["ok"] = False

    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result["ok"] else 1)


# ---------------------------------------------------------------- prune

def cmd_prune(a):
    import time
    if not CACHE_ROOT.exists():
        print(json.dumps({"ok": True, "removed": [], "freed_bytes": 0,
                          "remaining_bytes": 0, "note": "缓存目录还不存在"},
                         ensure_ascii=False, indent=2))
        return
    now = time.time()
    entries = [p for p in CACHE_ROOT.iterdir() if p.name != "api_files.json"]
    if a.all:
        targets = entries
    elif a.days > 0:
        cutoff = now - a.days * 86400
        targets = [p for p in entries if p.stat().st_mtime < cutoff]
    else:
        targets = []
    freed = sum(dir_size(p) for p in targets)
    removed = []
    for p in targets:
        try:
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)
            else:
                p.unlink(missing_ok=True)
            removed.append(p.name)
        except Exception:
            pass
    remaining = sum(dir_size(p) for p in CACHE_ROOT.iterdir() if p.name != "api_files.json")
    print(json.dumps({
        "ok": True,
        "removed": removed,
        "freed_mb": round(freed / 1048576, 2),
        "remaining_mb": round(remaining / 1048576, 2),
        "note": "days=0 只统计不删；--all 全清；缓存内容都是可重建的渲染图。",
    }, ensure_ascii=False, indent=2))


# ---------------------------------------------------------------- split

BOOK_DIR = Path(__file__).resolve().parent.parent / "分片"


def split_ranges(spec, total):
    """'1-36,37-80' -> [(1,36),(37,80)]"""
    out = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        m = re.fullmatch(r"(\d+)\s*-\s*(\d+)", part)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
        elif part.isdigit():
            a = b = int(part)
        else:
            die(f"看不懂的页范围: {part!r}")
        if not (1 <= a <= b <= total):
            die(f"页范围 {part} 超出本书 1-{total} 页")
        out.append((a, b))
    if not out:
        die("没有有效的页范围")
    return out


def cmd_split(a):
    """按页范围切成一章一个文件，命名 <前缀>_cNN_p起-止[_章名].pdf。
    产物落到 分片/<书名>/；已存在则跳过（加 --force 覆盖）。"""
    need("pdftocairo")
    pdf = Path(a.pdf)
    total = pdf_pages(pdf)
    groups = split_ranges(a.ranges, total)
    if a.titles:
        titles = [t.strip() for t in a.titles.split(",")]
        if len(titles) != len(groups):
            die(f"--titles 给了 {len(titles)} 个，页范围却有 {len(groups)} 个")
    else:
        titles = [""] * len(groups)

    outdir = Path(a.out) if a.out else (BOOK_DIR / re.sub(r'[<>:"/\\|?*]', "_", pdf.stem))
    outdir.mkdir(parents=True, exist_ok=True)
    prefix = a.prefix or pdf.stem
    made = []
    for i, ((s, e), title) in enumerate(zip(groups, titles), 1):
        name = f"{prefix}_c{i:02d}_p{s}-{e}" + (f"_{title}" if title else "") + ".pdf"
        dst = outdir / name
        if dst.exists() and not a.force:
            made.append({"file": str(dst), "from": s, "to": e, "skipped": "已存在"})
            continue
        # pdftocairo 在 Windows 上无法接受「含中文的绝对输出路径」：
        # 切到目标目录 + 纯 ASCII 相对文件名就正常，最后再用 Python 改名成中文。
        tmpname = f"__part{i:03d}.pdf"
        tmp = outdir / tmpname
        r = run(["pdftocairo", "-pdf", "-f", s, "-l", e, pdf, tmpname], cwd=outdir)
        if r.returncode != 0 or not tmp.exists():
            die(f"第 {i} 段 ({s}-{e}) 拆分失败: {(r.stderr or '')[:300]}")
        os.replace(tmp, dst)
        made.append({"file": str(dst), "from": s, "to": e,
                     "pages": pdf_pages(dst), "expect": e - s + 1})
    bad = [m for m in made if m.get("pages") and m["pages"] != m["expect"]]
    print(json.dumps({
        "ok": not bad, "source": str(pdf), "total_pages": total,
        "outdir": str(outdir), "chunks": made,
        "note": "命名已带页码，resolve 可直接用；页数与预期不符的会列在上面。",
    }, ensure_ascii=False, indent=2))
    if bad:
        sys.exit(1)


# ---------------------------------------------------------------- resolve

RANGE_RE = re.compile(r"(?:^|[_\-\s（(]|(?<=p))(\d+)\s*[-\u2013\u2014~]\s*(\d+)(?!\d)")


def cmd_resolve(a):
    """把「书第 N 页」解析成「哪个分片文件 + 片内第几页」。
    页码范围从文件名里的 _A-B 推断（A 为 0 视为 0 基，即从第 1 页算起）。"""
    d = Path(a.dir)
    if not d.is_dir():
        die(f"不是目录: {d}")
    pdfs = sorted(p for p in d.rglob("*.pdf") if p.is_file())
    if not pdfs:
        die(f"目录里没有 PDF: {d}")

    items = []
    for f in pdfs:
        m = RANGE_RE.search(f.stem)
        try:
            npages = pdf_pages(f)
        except SystemExit:
            npages = None
        if m:
            s, e = int(m.group(1)), int(m.group(2))
            start, end = (1, e) if s == 0 else (s, e)
            items.append({"name": f.name, "file": str(f), "from": start, "to": end,
                          "declared_pages": end - start + 1, "actual_pages": npages})
        else:
            items.append({"name": f.name, "file": str(f), "from": None, "to": None,
                          "actual_pages": npages})

    ranged = sorted([i for i in items if i["from"]], key=lambda x: x["from"])
    no_range = [i["name"] for i in items if not i["from"]]
    issues = []
    for prev, cur in zip(ranged, ranged[1:]):
        if cur["from"] > prev["to"] + 1:
            issues.append(f"缺页：{prev['to'] + 1}-{cur['from'] - 1} 无分片覆盖")
        elif cur["from"] <= prev["to"]:
            issues.append(f"重叠：{prev['name']} 与 {cur['name']}")
    for i in ranged:
        if i["actual_pages"] and i["actual_pages"] != i["declared_pages"]:
            issues.append(f"页数不符：{i['name']} 声明 {i['declared_pages']} 页 / 实际 {i['actual_pages']} 页")

    out = {"dir": str(d), "chunks": len(pdfs), "ranged": ranged,
           "no_range": no_range, "issues": issues}
    if a.page:
        hit = next((i for i in ranged if i["from"] <= a.page <= i["to"]), None)
        out["page"] = a.page
        if hit:
            local = a.page - hit["from"] + 1
            out["result"] = {"file": hit["file"], "name": hit["name"], "local_page": local,
                             "chunk_range": [hit["from"], hit["to"]]}
            if hit["actual_pages"] and not (1 <= local <= hit["actual_pages"]):
                out["warning"] = f"片内第 {local} 页超出该文件实际页数 {hit['actual_pages']}"
        else:
            out["result"] = None
            out["error"] = f"第 {a.page} 页没有被任何分片覆盖"
    print(json.dumps(out, ensure_ascii=False, indent=2))
    if out.get("error"):
        sys.exit(1)


# ---------------------------------------------------------------- lookup

BOOKS_SPLIT = Path(__file__).resolve().parent.parent / "分片"
BOOKS_FULL = Path(__file__).resolve().parent.parent / "书库"
SPLIT_MARK = "拆分后常用课本"          # 全本库会递归看到它，检索时要排除

_CN = {"零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
       "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def cn2int(s):
    """'四' -> 4, '十二' -> 12, '4' -> 4, 'XIII' -> 13"""
    s = s.strip()
    if s.isdigit():
        return int(s)
    u = s.upper()
    if re.fullmatch(r"[IVXLC]+", u):
        vals = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}
        total, prev = 0, 0
        for ch in reversed(u):
            v = vals[ch]
            total = total - v if v < prev else total + v
            prev = max(prev, v)
        return total
    if "十" in s:
        a, _, b = s.partition("十")
        tens = _CN.get(a, 1) if a else 1
        ones = _CN.get(b, 0) if b else 0
        return tens * 10 + ones
    return _CN.get(s)


def _norm(s):
    return re.sub(r"[\s_\-（）()【】\[\].,、·]+", "", s.lower())


def _chunk_range(f):
    m = RANGE_RE.search(f.stem)
    if not m:
        return None, None
    s, e = int(m.group(1)), int(m.group(2))
    return (1, e) if s == 0 else (s, e)


def _book_chunks(d):
    out = []
    for f in sorted(Path(d).glob("*.pdf")):
        s, e = _chunk_range(f)
        code = chapter = label = None
        m = re.search(r"_(c\d{2})_(.+?)(?:_p\d+-\d+)?$", f.stem)
        if m:
            code = m.group(1)
            label = m.group(2)
            cm = re.search(r"第([零〇一二三四五六七八九十]{1,3})章", label)
            if cm:
                chapter = cn2int(cm.group(1))
            elif code in ("c00", "c99"):
                chapter = 0 if code == "c00" else 99
        out.append({"name": f.name, "file": str(f), "from": s, "to": e,
                    "code": code, "chapter": chapter, "label": label,
                    "pages": pdf_pages(f)})
    return out


def cmd_lookup(a):
    """先查 分片（拆分后的常用课本），查不到再查 书库（全本）。"""
    kws = a.words or []

    def hit(name):
        n = _norm(name)
        return all(_norm(k) in n for k in kws)

    split_books, seen = [], set()
    if BOOKS_SPLIT.is_dir():
        for d in sorted(p for p in BOOKS_SPLIT.iterdir() if p.is_dir()):
            if not kws or hit(d.name):
                split_books.append(d); seen.add(str(d))
        for f in sorted(BOOKS_SPLIT.rglob("*.pdf")):
            if kws and hit(f.name) and str(f.parent) not in seen:
                split_books.append(f.parent); seen.add(str(f.parent))

    result = {"query": " ".join(kws), "split_root": str(BOOKS_SPLIT),
              "split_books": [], "full_books": [], "advice": ""}
    for d in split_books[:4]:
        chunks = _book_chunks(d)
        ranged = sorted([c for c in chunks if c["from"]], key=lambda c: c["from"])
        issues = []
        for prev, cur in zip(ranged, ranged[1:]):
            if cur["from"] > prev["to"] + 1:
                issues.append(f"缺页 {prev['to'] + 1}-{cur['from'] - 1}")
            elif cur["from"] <= prev["to"]:
                issues.append(f"重叠 {prev['name']} / {cur['name']}")
        no_range = [c["name"] for c in chunks if not c["from"]]
        result["split_books"].append({
            "book": d.name, "dir": str(d), "chunks": len(chunks),
            "ranged": ranged, "all": chunks, "no_range": no_range, "issues": issues,
        })

    if not split_books and BOOKS_FULL.is_dir():
        for f in sorted(BOOKS_FULL.rglob("*.pdf")):
            if SPLIT_MARK in str(f):
                continue
            if hit(f.name):
                result["full_books"].append({"name": f.name, "file": str(f),
                                             "pages": pdf_pages(f)})
                if len(result["full_books"]) >= 10:
                    break

    if a.chapter is not None:
        n = cn2int(str(a.chapter)) if not str(a.chapter).isdigit() else int(a.chapter)
        res = {"chapter": a.chapter, "chapter_num": n}
        if n is None:
            res["error"] = f"看不懂的章号：{a.chapter}（给 4 或 四）"
        else:
            hits = []
            for b in result["split_books"]:
                chunks_all = b.get("all") or b.get("ranged", [])
                for c in chunks_all:
                    if c.get("chapter") == n:
                        hits.append((b, c, "chapter"))
                        break
            if not hits:
                for b in result["split_books"]:
                    for c in (b.get("all") or b.get("ranged", [])):
                        if c.get("code") == f"c{n:02d}":
                            hits.append((b, c, "code"))
                            break
            if len(hits) == 1:
                b, c, _ = hits[0]
                res["result"] = {"book": b["book"], "file": c["file"], "name": c["name"],
                                 "pages": c["pages"],
                                 "chunk_range": [c["from"], c["to"]] if c["from"] else None}
            elif len(hits) > 1:
                res["result"] = None
                res["candidates"] = [{"book": b["book"], "name": c["name"], "file": c["file"]}
                                     for b, c, _ in hits]
                res["error"] = (f"{len(hits)} 本书都命中，无法确定是哪本；"
                                "让用户补一个能区分的词（如「白皮书」「第四版」）。")
            else:
                res["result"] = None
                res["error"] = ("分片里没有这一章。可能这本还没按章重命名"
                                "（看 split_books 里各片的 code/chapter 字段）。")
        result["chapter_lookup"] = res

    if a.page:
        target = next((b for b in result["split_books"] if b["ranged"]), None)
        result["page"] = a.page
        if target:
            c = next((x for x in target["ranged"] if x["from"] <= a.page <= x["to"]), None)
            if c:
                result["result"] = {"book": target["book"], "file": c["file"],
                                    "name": c["name"], "local_page": a.page - c["from"] + 1,
                                    "chunk_range": [c["from"], c["to"]]}
            else:
                result["result"] = None
                result["error"] = f"第 {a.page} 页没被这本的分片覆盖（见 issues）"
        elif result["split_books"]:
            result["result"] = None
            result["error"] = "这本的分片文件名里没有页码（章节式命名），无法按原书页码定位；改用章名，或先看该章首页的印刷页码。"
        else:
            result["result"] = None
            result["error"] = "分片库里没有匹配的书，见 full_books：只有全本，需要先 split。"

    if result["split_books"]:
        result["advice"] = "优先用 split_books：这些是已拆好的常用课本。"
    elif result["full_books"]:
        result["advice"] = "分片库没有，退回 full_books（全本）；要按章工作就先 split 这本。"
    else:
        result["advice"] = "两个库都没有匹配；换个关键词（作者、书名片段）再试。"

    print(json.dumps(result, ensure_ascii=False, indent=2))


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="数学课本工作流 PDF 工具")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("info")
    p.add_argument("pdf")
    p.set_defaults(fn=cmd_info)

    p = sub.add_parser("text")
    p.add_argument("pdf")
    p.add_argument("--out", default="")
    p.add_argument("--pages", default="")
    p.add_argument("--force", action="store_true")
    p.set_defaults(fn=cmd_text)

    p = sub.add_parser("render")
    p.add_argument("pdf")
    p.add_argument("--out", default="")
    p.add_argument("--pages", default="")
    p.add_argument("--dpi", type=int, default=200)
    p.add_argument("--bands", type=int, default=1)
    p.add_argument("--overlap", type=float, default=0.06)
    p.add_argument("--gray", action="store_true")
    p.add_argument("--force", action="store_true")
    p.set_defaults(fn=cmd_render)

    p = sub.add_parser("sheet")
    p.add_argument("pdf")
    p.add_argument("--out", default="")
    p.add_argument("--pages", default="")
    p.add_argument("--cols", type=int, default=4)
    p.add_argument("--dpi", type=int, default=70)
    p.set_defaults(fn=cmd_sheet)

    p = sub.add_parser("find")
    p.add_argument("pdf")
    p.add_argument("keywords", nargs="+")
    p.add_argument("--context", type=int, default=0)
    p.set_defaults(fn=cmd_find)

    p = sub.add_parser("verify")
    p.add_argument("file")
    p.add_argument("--tex", action="store_true")
    p.set_defaults(fn=cmd_verify)

    p = sub.add_parser("prune")
    p.add_argument("--days", type=int, default=0, help="删掉超过 N 天没动过的缓存；0 表示只统计")
    p.add_argument("--all", action="store_true", help="删掉全部缓存（api_files.json 除外）")
    p.set_defaults(fn=cmd_prune)

    p = sub.add_parser("resolve")
    p.add_argument("dir", help="装分片 PDF 的目录")
    p.add_argument("--page", type=int, default=0, help="书的页码，解析成「哪个分片 + 片内第几页」")
    p.set_defaults(fn=cmd_resolve)

    p = sub.add_parser("split")
    p.add_argument("pdf")
    p.add_argument("--ranges", required=True, help="如 1-36,37-80（一章一段）")
    p.add_argument("--out", default="")
    p.add_argument("--prefix", default="", help="文件名前缀，默认用原书名")
    p.add_argument("--titles", default="", help="章名，逗号分隔，与页范围一一对应")
    p.add_argument("--force", action="store_true")
    p.set_defaults(fn=cmd_split)

    p = sub.add_parser("lookup")
    p.add_argument("words", nargs="*", help="书名 / 作者关键词，可多个（同时满足）")
    p.add_argument("--page", type=int, default=0, help="顺带解析原书页码")
    p.add_argument("--chapter", default=None, help="按章号取，如 4 或 四")
    p.set_defaults(fn=cmd_lookup)

    a = ap.parse_args()
    try:
        a.fn(a)
    finally:
        # 每次运行结束清掉本次的临时目录，避免缓存里堆一堆 run<pid>
        shutil.rmtree(SCRATCH / f"run{os.getpid()}", ignore_errors=True)


if __name__ == "__main__":
    main()
