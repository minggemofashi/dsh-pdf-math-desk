# -*- coding: utf-8 -*-
"""按「章映射表」重命名分片文件，保留页码，可 dry-run，可回滚。

用法：
    python rename_chapters.py <书目录> <mapping.json> [--dry-run]

mapping.json：
{
  "book": "概率论",
  "chapters": [
    {"from": 1,   "to": 8,   "code": "c00", "label": "前置"},
    {"from": 9,   "to": 40,  "code": "c01", "label": "第一章_概率空间和随机事件"}
  ]
}

规则：按分片文件名里的 `_A-B` 找到起始页 A，命中 chapters 里 from<=A<=to 的条目，
重命名为 `<book>_<code>_<label>_p<A:03d>-<B>.pdf`。
执行前把 old->new 写进 缓存/重命名记录/<时间>-<book>.json，回滚用它。
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

RANGE = re.compile(r"(?:^|[_\-\s（(]|(?<=p))(\d+)\s*[-\u2013\u2014~]\s*(\d+)(?!\d)")
ROOT = Path(r"D:\数学书库")


def chunk_range(p: Path):
    m = RANGE.search(p.stem)
    if not m:
        return None
    s, e = int(m.group(1)), int(m.group(2))
    return (1, e) if s == 0 else (s, e)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    book_dir, map_path = Path(args[0]), Path(args[1])

    spec = json.loads(map_path.read_text(encoding="utf-8"))
    book = spec["book"]
    chapters = spec["chapters"]

    plan, problems = [], []
    for f in sorted(book_dir.glob("*.pdf")):
        rng = chunk_range(f)
        if not rng:
            problems.append(f"文件名里没有页码，跳过：{f.name}")
            continue
        s, e = rng
        hit = next((c for c in chapters if c["from"] <= s <= c["to"]), None)
        if not hit:
            problems.append(f"第 {s} 页不在映射表任何区间内：{f.name}")
            continue
        new = f"{book}_{hit['code']}_{hit['label']}_p{s:03d}-{e:03d}.pdf"
        plan.append((f, new))

    targets = {}
    for f, new in plan:
        targets.setdefault(new, []).append(f.name)
    dup = {k: v for k, v in targets.items() if len(v) > 1}
    for k, v in dup.items():
        problems.append(f"重名冲突 {k} <- {v}")

    for f, new in plan:
        print(f"{'[dry] ' if dry else ''}{f.name}\n    -> {new}")
    if problems:
        print("\n!! 问题：")
        for p in problems:
            print("  -", p)

    if dry or problems:
        print(f"\n计划 {len(plan)} 个，问题 {len(problems)} 个"
              f"{'（有问题，未执行）' if problems else '（dry-run，未执行）'}")
        return 1 if problems else 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    rec = ROOT / "缓存" / "重命名记录" / f"{stamp}-{book}.json"
    rec.parent.mkdir(parents=True, exist_ok=True)
    rec.write_text(json.dumps(
        [{"dir": str(book_dir), "old": f.name, "new": new} for f, new in plan],
        ensure_ascii=False, indent=2), encoding="utf-8")

    for f, new in plan:
        f.rename(f.with_name(new))
    print(f"\n已重命名 {len(plan)} 个；回滚记录：{rec}")
    return 0


sys.exit(main())
