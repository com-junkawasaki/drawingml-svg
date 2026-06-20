from __future__ import annotations

import sys

from drawingml_svg.cli import main

__all__ = ["main"]


if __name__ == "__main__":
    sys.argv[0] = "svgraph"
    raise SystemExit(main())
