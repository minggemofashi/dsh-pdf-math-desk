"""Print page sizes of a PDF as JSON [[width_pt, height_pt], ...]."""
import json
import sys

import fitz

document = fitz.open(sys.argv[1])
print(json.dumps([[page.rect.width, page.rect.height] for page in document]))
