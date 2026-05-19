from __future__ import annotations

import runpy
from pathlib import Path


LAUNCHER = Path(__file__).resolve().parents[1] / "launcher" / "hagrad_viewer_app.py"
runpy.run_path(str(LAUNCHER), run_name="__main__")
