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
DEFAULT_PORT = 3020
PORT_CANDIDATES = tuple(range(DEFAULT_PORT, DEFAULT_PORT + 6))
HEALTH_PATH = "/api/export-studies"
VIEWER_PATH = "/src/viewer.html"
RUNTIME_COPY_ITEMS = (
    "src",
    "vendor",
    "assets",
    "scripts",
    "README.md",
    "DISCLAIMER.md",
    "LICENSE",
    "LICENSE.md",
    "CITATION.cff",
    "RELEASE_NOTES.md",
    "help.html",
)


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


def server_environment(root: Path, dirs: dict[str, Path], port: int = DEFAULT_PORT) -> dict[str, str]:
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
            "HAGRAD_PORT": str(port),
            "PYTHONUNBUFFERED": "1",
        }
    )
    if not has_https_cert(dirs["cert_root"]) and not is_truthy(env.get("HAGRAD_FORCE_HTTP")):
        env["HAGRAD_ALLOW_HTTP"] = "1"
    return env


def same_path(left: Path, right: str | Path) -> bool:
    try:
        return left.resolve() == Path(right).resolve()
    except Exception:
        return str(left) == str(right)


def child_server_environment(root: Path, dirs: dict[str, Path], port: int = DEFAULT_PORT) -> dict[str, str]:
    env = server_environment(root, dirs, port=port)

    meipass = getattr(sys, "_MEIPASS", None)
    if os.name == "nt" and getattr(sys, "frozen", False) and meipass and same_path(root, meipass):
        # A Windows one-file build extracts again for the --server child. Let the
        # child use its own live extraction dir instead of the launcher's temp dir.
        for key in ["HAGRAD_RUNTIME_ROOT", "HAGRAD_APP_ROOT", "HAGRAD_ROOT"]:
            env.pop(key, None)

    return env


def durable_runtime_root(root: Path, dirs: dict[str, Path]) -> Path:
    if os.name != "nt" or not getattr(sys, "frozen", False) or not getattr(sys, "_MEIPASS", None):
        return root

    target = dirs["state_root"] / f"runtime-{int(time.time())}-{os.getpid()}"
    target.mkdir(parents=True, exist_ok=True)
    for item_name in RUNTIME_COPY_ITEMS:
        source = root / item_name
        if not source.exists():
            continue
        destination = target / item_name
        if source.is_dir():
            shutil.copytree(source, destination, dirs_exist_ok=True)
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
    if not is_runtime_root(target):
        raise FileNotFoundError(f"Durable HAGRad runtime copy is incomplete: {target}")
    return target


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


def url_for(scheme: str, path: str, port: int = DEFAULT_PORT) -> str:
    return f"{scheme}://localhost:{port}{path}"


def candidate_schemes(cert_root: Path) -> list[str]:
    preferred = "https" if has_https_cert(cert_root) and not is_truthy(os.environ.get("HAGRAD_FORCE_HTTP")) else "http"
    alternate = "http" if preferred == "https" else "https"
    return [preferred, alternate]


def is_port_open(port: int = DEFAULT_PORT) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False


def url_available(scheme: str, path: str, port: int = DEFAULT_PORT) -> bool:
    context = ssl._create_unverified_context()
    try:
        with urllib.request.urlopen(url_for(scheme, path, port=port), timeout=2, context=context) as response:
            return 200 <= response.status < 400
    except Exception:
        return False


def server_ready(scheme: str, port: int = DEFAULT_PORT) -> bool:
    return url_available(scheme, HEALTH_PATH, port=port) and url_available(scheme, VIEWER_PATH, port=port)


def ready_scheme(cert_root: Path, port: int = DEFAULT_PORT) -> str | None:
    for scheme in candidate_schemes(cert_root):
        if server_ready(scheme, port=port):
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


def start_server(root: Path, dirs: dict[str, Path], env: dict[str, str], port: int = DEFAULT_PORT) -> subprocess.Popen[bytes]:
    log_path = server_log_path(dirs)
    append_log(log_path, "")
    append_log(log_path, f"{APP_NAME} server start on port {port}")
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


def wait_for_ready(
    cert_root: Path,
    process: subprocess.Popen[bytes] | None,
    port: int = DEFAULT_PORT,
    seconds: int = 45,
) -> str | None:
    deadline = time.time() + seconds
    while time.time() < deadline:
        scheme = ready_scheme(cert_root, port=port)
        if scheme:
            return scheme
        if process is not None and process.poll() is not None:
            return None
        time.sleep(0.5)
    return None


def open_viewer(scheme: str, port: int = DEFAULT_PORT) -> None:
    webbrowser.open(url_for(scheme, VIEWER_PATH, port=port))


def run_server_mode() -> int:
    root = runtime_root()
    dirs = platform_dirs()
    port = int(os.environ.get("HAGRAD_PORT") or str(DEFAULT_PORT))
    env = server_environment(root, dirs, port=port)
    os.environ.update(env)
    os.chdir(root)
    runpy.run_path(str(root / "scripts" / "serve_https.py"), run_name="__main__")
    return 0


def run_launcher() -> int:
    root = runtime_root()
    dirs = platform_dirs()
    launch_log = launcher_log_path(dirs)

    append_log(launch_log, "")
    append_log(launch_log, f"{APP_NAME} launch")
    append_log(launch_log, f"Bundled runtime root: {root}")
    append_log(launch_log, f"State root: {dirs['state_root']}")
    append_log(launch_log, f"Exports root: {dirs['exports_root']}")
    append_log(launch_log, f"Server log: {server_log_path(dirs)}")

    for port in PORT_CANDIDATES:
        scheme = ready_scheme(dirs["cert_root"], port=port)
        if scheme:
            append_log(launch_log, f"Existing server is ready at {url_for(scheme, VIEWER_PATH, port=port)}")
            open_viewer(scheme, port=port)
            return 0

    root = durable_runtime_root(root, dirs)
    append_log(launch_log, f"Server runtime root: {root}")

    blocked_ports: list[int] = []
    for port in PORT_CANDIDATES:
        if is_port_open(port):
            blocked_ports.append(port)
            append_log(launch_log, f"Port {port} is occupied but did not pass HAGRad readiness checks.")
            continue

        env = child_server_environment(root, dirs, port=port)
        process = start_server(root, dirs, env, port=port)
        scheme = wait_for_ready(dirs["cert_root"], process, port=port)
        if scheme:
            append_log(launch_log, f"Server became ready at {url_for(scheme, VIEWER_PATH, port=port)}")
            open_viewer(scheme, port=port)
            return 0

        exit_code = process.poll()
        detail = (
            f"The local server on port {port} exited with code {exit_code}."
            if exit_code is not None
            else f"The local server on port {port} did not become ready in time."
        )
        append_log(launch_log, f"ERROR: {detail}")
        message = (
            f"{detail}\n\n"
            "HAGRad Viewer could not finish starting. No DICOM files were uploaded or sent anywhere.\n\n"
            f"Launcher log:\n{launch_log}\n\n"
            f"Server log:\n{server_log_path(dirs)}"
        )
        show_error(APP_NAME, message)
        return 1

    ports = ", ".join(str(port) for port in blocked_ports)
    detail = f"Local ports {ports} are already in use, but none answered like HAGRad."
    append_log(launch_log, f"ERROR: {detail}")
    message = (
        f"{detail}\n\n"
        "Close old HAGRad browser/server windows or restart Windows, then open HAGRad Viewer again.\n\n"
        f"Launcher log:\n{launch_log}"
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
