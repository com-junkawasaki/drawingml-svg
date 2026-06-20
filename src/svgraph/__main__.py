from __future__ import annotations

import sys

from .cli import main


sys.argv[0] = "svgraph"
raise SystemExit(main())
