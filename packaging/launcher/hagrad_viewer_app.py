from __future__ import annotations

import base64  # noqa: F401
import ctypes
import csv  # noqa: F401
import email.parser  # noqa: F401
import email.policy  # noqa: F401
import http.server  # noqa: F401
import json  # noqa: F401
import os
import re  # noqa: F401
import runpy
import shutil  # noqa: F401
import socket
import ssl
import subprocess
import sys
import tempfile  # noqa: F401
import time
import traceback
import urllib.error  # noqa: F401
import urllib.parse  # noqa: F401
import urllib.request
import uuid  # noqa: F401
import webbrowser
from datetime import datetime, timezone  # noqa: F401
from pathlib import Path


APP_NAME = "HAGRad Viewer"
PORT = 3020
HEALTH_PATH = "/api/export-studies"
VIEWER_PATH = "/src/viewer.html"


def is_truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def is_runtime_root(path: Path) -> bool:
    return (
        (path / "src" / "viewer.html").exists()
        and (path / "scripts" / "serve_https.py").exists()
        and (path / "vendor" / "cornerstone.min.js").exists()
    )


def runtime_root() -> Path:
    candidates: list[Path] = []

    configured = os.environ.get("HAGRAD_RUNTIME_ROOT") or os.environ.get("HAGRAD_APP_ROOT")
    if configured:
        candidates.append(Path(configured).expanduser())

    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass))

    executable = Path(sys.executable).resolve()
    candidates.extend(
        [
            executable.parent,
            executable.parent / "HAGRad_Runtime",
            executable.parent.parent / "Resources",
            executable.parent.parent / "Resources" / "HAGRad_Runtime",
        ]
    )

    source_path = Path(__file__).resolve()
    candidates.extend([source_path.parents[2], source_path.parents[1], source_path.parent])

    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if is_runtime_root(resolved):
            return resolved

    searched = "\n".join(f"- {candidate}" for candidate in candidates)
    raise FileNotFoundError(f"Could not find bundled HAGRad runtime files. Searched:\n{searched}")


def user_documents_dir() -> Path:
    documents = Path.home() / "Documents"
    return documents if documents.exists() else Path.home()


def platform_dirs() -> dict[str, Path]:
    if sys.platform == "darwin":
        state_root = Path.home() / "Library" / "Application Support" / APP_NAME
        log_root = Path.home() / "Library" / "Logs" / APP_NAME
    elif os.name == "nt":
        local_app_data = os.environ.get("LOCALAPPDATA")
        state_root = Path(local_app_data) / APP_NAME if local_app_data else Path.home() / "AppData" / "Local" / APP_NAME
        log_root = state_root / "logs"
    else:
        state_root = Path.home() / ".hagrad-viewer"
        log_root = state_root / "logs"

    exports_root = user_documents_dir() / APP_NAME / "exports_outbox"
    dirs = {
        "state_root": state_root,
        "log_root": log_root,
        "exports_root": exports_root,
        "cert_root": state_root / ".cert",
        "backend_root": state_root / "backend",
        "training_root": state_root / "eat_training_feedback",
        "project_root": state_root / "project_lists",
    }
    for path in dirs.values():
        path.mkdir(parents=True, exist_ok=True)
    return dirs


def has_https_cert(cert_root: Path) -> bool:
    return (cert_root / "localhost.pem").exists() and (cert_root / "localhost-key.pem").exists()


def server_environment(root: Path, dirs: dict[str, Path]) -> dict[str, str]:
    env = os.environ.copy()
    env.update(
        {
            "HAGRAD_RUNTIME_ROOT": str(root),
            "HAGRAD_STATE_ROOT": str(dirs["state_root"]),
            "HAGRAD_PROJECTS_ROOT": str(dirs["project_root"]),
            "HAGRAD_EXPORTS_OUTBOX": str(dirs["exports_root"]),
            "HAGRAD_CERT_DIR": str(dirs["cert_root"]),
            "HAGRAD_BACKEND_ROOT": str(dirs["backend_root"]),
            "HAGRAD_TRAINING_ROOT": str(dirs["training_root"]),
            "PYTHONUNBUFFERED": "1",
        }
    )
    if not has_https_cert(dirs["cert_root"]) and not is_truthy(env.get("HAGRAD_FORCE_HTTP")):
        env["HAGRAD_ALLOW_HTTP"] = "1"
    return env


def child_server_environment(root: Path, dirs: dict[str, Path]) -> dict[str, str]:
    env = server_environment(root, dirs)

    if os.name == "nt" and getattr(sys, "frozen", False) and getattr(sys, "_MEIPASS", None):
        # A Windows one-file build extracts again for the --server child. Let the
        # child use its own live extraction dir instead of the launcher's temp dir.
        for key in ["HAGRAD_RUNTIME_ROOT", "HAGRAD_APP_ROOT", "HAGRAD_ROOT"]:
            env.pop(key, None)

    return env


def launcher_log_path(dirs: dict[str, Path]) -> Path:
    return dirs["log_root"] / "hagrad-launcher.log"


def server_log_path(dirs: dict[str, Path]) -> Path:
    return dirs["log_root"] / "hagrad-server.log"


def append_log(path: Path, message: str) -> None:
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as log:
        log.write(f"[{timestamp}] {message}\n")


def applescript_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def show_error(title: str, message: str) -> None:
    if sys.platform == "darwin":
        script = (
            "display dialog "
            f"{applescript_quote(message)} "
            'buttons {"OK"} default button "OK" '
            f"with title {applescript_quote(title)} with icon caution"
        )
        subprocess.run(["osascript", "-e", script], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return

    if os.name == "nt":
        ctypes.windll.user32.MessageBoxW(None, message, title, 0x10)  # type: ignore[attr-defined]
        return

    print(f"{title}: {message}", file=sys.stderr)


def url_for(scheme: str, path: str) -> str:
    return f"{scheme}://localhost:{PORT}{path}"


def candidate_schemes(cert_root: Path) -> list[str]:
    preferred = "https" if has_https_cert(cert_root) and not is_truthy(os.environ.get("HAGRAD_FORCE_HTTP")) else "http"
    alternate = "http" if preferred == "https" else "https"
    return [preferred, alternate]


def is_port_open() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", PORT), timeout=0.5):
            return True
    except OSError:
        return False


def server_ready(scheme: str) -> bool:
    context = ssl._create_unverified_context()
    try:
        with urllib.request.urlopen(url_for(scheme, HEALTH_PATH), timeout=2, context=context):
            return True
    except Exception:
        return False


def ready_scheme(cert_root: Path) -> str | None:
    for scheme in candidate_schemes(cert_root):
        if server_ready(scheme):
            return scheme
    return None


def launcher_command() -> list[str]:
    if getattr(sys, "frozen", False):
        return [sys.executable, "--server"]
    return [sys.executable, str(Path(__file__).resolve()), "--server"]


def popen_flags() -> int:
    if os.name != "nt":
        return 0
    flags = 0
    flags |= getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return flags


def start_server(root: Path, dirs: dict[str, Path], env: dict[str, str]) -> subprocess.Popen[bytes]:
    log_path = server_log_path(dirs)
    append_log(log_path, "")
    append_log(log_path, f"{APP_NAME} server start")
    append_log(log_path, f"Runtime root: {root}")
    append_log(log_path, f"State root: {dirs['state_root']}")
    append_log(log_path, f"Exports root: {dirs['exports_root']}")

    log_handle = log_path.open("ab")
    try:
        return subprocess.Popen(
            launcher_command(),
            cwd=str(root),
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            start_new_session=(os.name != "nt"),
            creationflags=popen_flags(),
        )
    finally:
        log_handle.close()


def wait_for_ready(cert_root: Path, process: subprocess.Popen[bytes] | None, seconds: int = 45) -> str | None:
    deadline = time.time() + seconds
    while time.time() < deadline:
        scheme = ready_scheme(cert_root)
        if scheme:
            return scheme
        if process is not None and process.poll() is not None:
            return None
        time.sleep(0.5)
    return None


def open_viewer(scheme: str) -> None:
    webbrowser.open(url_for(scheme, VIEWER_PATH))


def run_server_mode() -> int:
    root = runtime_root()
    dirs = platform_dirs()
    env = server_environment(root, dirs)
    os.environ.update(env)
    os.chdir(root)
    runpy.run_path(str(root / "scripts" / "serve_https.py"), run_name="__main__")
    return 0


def run_launcher() -> int:
    root = runtime_root()
    dirs = platform_dirs()
    env = child_server_environment(root, dirs)
    launch_log = launcher_log_path(dirs)

    append_log(launch_log, "")
    append_log(launch_log, f"{APP_NAME} launch")
    append_log(launch_log, f"Runtime root: {root}")
    append_log(launch_log, f"State root: {dirs['state_root']}")
    append_log(launch_log, f"Exports root: {dirs['exports_root']}")
    append_log(launch_log, f"Server log: {server_log_path(dirs)}")

    scheme = ready_scheme(dirs["cert_root"])
    if scheme:
        append_log(launch_log, f"Existing server is ready at {url_for(scheme, VIEWER_PATH)}")
        open_viewer(scheme)
        return 0

    if is_port_open():
        message = (
            "Something is already using localhost port 3020, but it did not answer like HAGRad.\n\n"
            "Close the other local server using port 3020, then open HAGRad Viewer again.\n\n"
            f"Launcher log:\n{launch_log}"
        )
        append_log(launch_log, "ERROR: Port 3020 is open, but HAGRad health checks failed.")
        show_error(APP_NAME, message)
        return 1

    process = start_server(root, dirs, env)
    scheme = wait_for_ready(dirs["cert_root"], process)
    if scheme:
        append_log(launch_log, f"Server became ready at {url_for(scheme, VIEWER_PATH)}")
        open_viewer(scheme)
        return 0

    exit_code = process.poll()
    detail = f"The local server exited with code {exit_code}." if exit_code is not None else "The local server did not become ready in time."
    append_log(launch_log, f"ERROR: {detail}")
    message = (
        f"{detail}\n\n"
        "HAGRad Viewer could not finish starting. No DICOM files were uploaded or sent anywhere.\n\n"
        f"Launcher log:\n{launch_log}\n\n"
        f"Server log:\n{server_log_path(dirs)}"
    )
    show_error(APP_NAME, message)
    return 1


def main() -> int:
    if "--server" in sys.argv[1:]:
        return run_server_mode()
    try:
        return run_launcher()
    except Exception:  # noqa: BLE001
        try:
            dirs = platform_dirs()
            log_path = launcher_log_path(dirs)
            append_log(log_path, "ERROR: Unhandled launcher exception")
            append_log(log_path, traceback.format_exc())
            message = f"HAGRad Viewer could not start.\n\nLauncher log:\n{log_path}"
        except Exception:
            message = "HAGRad Viewer could not start, and the launcher log could not be written."
        show_error(APP_NAME, message)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
