from __future__ import annotations

import os
import socket
import ssl
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path
from tkinter import messagebox


PORT = 3020


def server_url(root: Path) -> str:
    scheme = "https" if has_https_cert(root) else "http"
    return f"{scheme}://localhost:{PORT}"


def health_url(root: Path) -> str:
    return f"{server_url(root)}/api/export-studies"


def viewer_url(root: Path) -> str:
    return f"{server_url(root)}/src/viewer.html"


def app_root() -> Path:
    if getattr(sys, "frozen", False):
        base = Path(sys.executable).resolve().parent
    else:
        base = Path(__file__).resolve().parents[2]

    for runtime_name in ("HAGRad_support_files", "HAGRad_Runtime"):
        runtime = base / runtime_name
        if runtime.exists():
            return runtime
    return base


def has_https_cert(root: Path) -> bool:
    cert = root / ".cert" / "localhost.pem"
    cert_key = root / ".cert" / "localhost-key.pem"
    return cert.exists() and cert_key.exists()


def is_port_open() -> bool:
    try:
        with socket.create_connection(("localhost", PORT), timeout=0.5):
            return True
    except OSError:
        return False


def server_ready(root: Path) -> bool:
    context = ssl._create_unverified_context()
    try:
        with urllib.request.urlopen(health_url(root), timeout=2, context=context):
            return True
    except Exception:
        return False


def run_batch(path: Path) -> subprocess.Popen[bytes]:
    return subprocess.Popen(
        ["cmd", "/c", "start", "", str(path)],
        cwd=str(app_root()),
        shell=False,
    )


def wait_for_server(seconds: int = 40) -> bool:
    root = app_root()
    deadline = time.time() + seconds
    while time.time() < deadline:
        if server_ready(root):
            return True
        time.sleep(1)
    return False


def main() -> int:
    root = app_root()
    os.chdir(root)

    if not has_https_cert(root):
        os.environ["HAGRAD_ALLOW_HTTP"] = "1"

    if not is_port_open() or not server_ready(root):
        start_server = root / "start-server.bat"
        if not start_server.exists():
            messagebox.showerror("HAGRad Viewer", f"Could not find {start_server}")
            return 1
        run_batch(start_server)

    if wait_for_server():
        webbrowser.open(viewer_url(root))
        return 0

    messagebox.showerror(
        "HAGRad Viewer",
        "HAGRad Viewer did not become ready. Try running start-server.bat manually.",
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
