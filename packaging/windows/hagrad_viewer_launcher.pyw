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
SERVER_URL = f"https://localhost:{PORT}"
HEALTH_URL = f"{SERVER_URL}/api/export-studies"
VIEWER_URL = f"{SERVER_URL}/src/viewer.html"


def app_root() -> Path:
    if getattr(sys, "frozen", False):
        base = Path(sys.executable).resolve().parent
    else:
        base = Path(__file__).resolve().parents[2]

    runtime = base / "HAGRad_Runtime"
    if runtime.exists():
        return runtime
    return base


def is_port_open() -> bool:
    try:
        with socket.create_connection(("localhost", PORT), timeout=0.5):
            return True
    except OSError:
        return False


def server_ready() -> bool:
    context = ssl._create_unverified_context()
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=2, context=context):
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
    deadline = time.time() + seconds
    while time.time() < deadline:
        if server_ready():
            return True
        time.sleep(1)
    return False


def main() -> int:
    root = app_root()
    os.chdir(root)

    cert = root / ".cert" / "localhost.pem"
    cert_key = root / ".cert" / "localhost-key.pem"
    if not cert.exists() or not cert_key.exists():
        make_cert = root / "make-local-cert.bat"
        if not make_cert.exists():
            messagebox.showerror("HAGRad Viewer", f"Could not find {make_cert}")
            return 1
        subprocess.call([str(make_cert)], cwd=str(root))

    if not is_port_open() or not server_ready():
        start_server = root / "start-server.bat"
        if not start_server.exists():
            messagebox.showerror("HAGRad Viewer", f"Could not find {start_server}")
            return 1
        run_batch(start_server)

    if wait_for_server():
        webbrowser.open(VIEWER_URL)
        return 0

    messagebox.showerror(
        "HAGRad Viewer",
        "HAGRad Viewer did not become ready. Try running start-server.bat manually.",
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
