"""Print the median body font size (pt) of a PDF."""
import json
import sys

import fitz

document = fitz.open(sys.argv[1])
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
print(json.dumps(median))
