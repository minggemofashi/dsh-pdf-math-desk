# -*- coding: utf-8 -*-
"""整本上传 → 问出章节起始页 → 生成映射 → 调用 rename_chapters.py 改名。

用法：
    python auto_chapters.py --jobs jobs.json [--apply]

jobs.json：
[
  {"book": "概率论", "dir": "D:\\...\\分片\\概率论(1)", "full": "D:\\...\\书库\\xx.pdf"}
]
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(r"D:\数学书库")
NODE = ROOT / "工具" / "node.cmd"
DSFILE = ROOT / "工具" / "dsfile.mjs"
RENAMER = ROOT / "工具" / "rename_chapters.py"
PY = ROOT / "工具" / "py.cmd"

PROMPT = """这本书是教材。请只输出各章（以及前置、附录、习题答案等独立部分）的起始页。
严格按下面格式，每行一条，不要表头、不要解释、不要 markdown 表格：

起始页|章号|标题

要求：
- 起始页是该部分在本文档中的物理页（PDF 第几页，从 1 开始数），不是书上的印刷页码。
- 章号写成「第一章」这种；书前面的封面/目录/前言合并成一行写「前置」；书后的附录/答案/索引写「附录」。
- 按起始页从小到大排列，一条都不要漏。"""


def run(cmd):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return r.stdout


def pdf_pages(pdf):
    out = run(["pdfinfo", str(pdf)])
    m = re.search(r"^Pages:\s+(\d+)", out, re.M)
    return int(m.group(1)) if m else None


def parse(text, total):
    items = []
    for raw in text.splitlines():
        line = raw.strip().strip("|").replace("｜", "|")
        m = re.match(r"^(\d+)\s*\|([^|]+)\|(.+)$", line)
        if not m:
            continue
        start = int(m.group(1))
        num = m.group(2).strip()
        title = re.sub(r"[\s`*]+", " ", m.group(3)).strip()
        if 1 <= start <= total:
            items.append({"start": start, "num": num, "title": title})
    # 去重 + 排序
    seen, uniq = set(), []
    for it in sorted(items, key=lambda x: x["start"]):
        if it["start"] in seen:
            continue
        seen.add(it["start"])
        uniq.append(it)
    if not uniq:
        return []
    if uniq[0]["start"] > 1:
        uniq.insert(0, {"start": 1, "num": "前置", "title": "封面目录"})
    for i, it in enumerate(uniq):
        it["end"] = (uniq[i + 1]["start"] - 1) if i + 1 < len(uniq) else total
    return uniq


def code_for(i, it):
    if "前置" in it["num"]:
        return "c00"
    if any(k in it["num"] + it["title"] for k in ("附录", "答案", "索引", "参考")):
        return f"c9{9 - (i % 10)}"
    return f"c{i:02d}" if i < 100 else "c50"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    jobs = json.loads(Path(a.jobs).read_text(encoding="utf-8"))
    for job in jobs:
        book, bdir, full = job["book"], Path(job["dir"]), Path(job["full"])
        total = pdf_pages(full)
        print(f"\n===== {book}  ({total} 页)  {full.name}")
        out = run([NODE, DSFILE, "run", full, "--purpose", "text_recognition",
                   "--prompt", PROMPT])
        chs = parse(out, total)
        if not chs:
            print("  !! 没能解析出章节，原文如下：")
            print("\n".join("  " + l for l in out.splitlines()[:25]))
            continue
        chapters, used = [], set()
        for i, it in enumerate(chs, 1):
            code = code_for(i, it)
            while code in used:
                code = f"c{i:02d}x"
            used.add(code)
            label = f"{it['num']}_{it['title']}".replace("|", "_")
            chapters.append({"from": it["start"], "to": it["end"],
                             "code": code, "label": label})
            print(f"  {code}  p{it['start']:>3}-{it['end']:<3}  {it['num']} {it['title']}")
        mapping = ROOT / "缓存" / "章映射" / f"{book}.json"
        mapping.parent.mkdir(parents=True, exist_ok=True)
        mapping.write_text(json.dumps({"book": book, "chapters": chapters},
                                      ensure_ascii=False, indent=2), encoding="utf-8")
        cmd = [PY, RENAMER, bdir, mapping]
        if not a.apply:
            cmd.append("--dry-run")
        print(run(cmd))


main()
