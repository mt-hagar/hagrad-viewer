#!/usr/bin/env python3

from __future__ import annotations

import http.server
import json
import os
import pathlib
import shutil
import ssl
import subprocess
import sys
import tempfile
import uuid
from email import policy
from email.parser import BytesParser
from urllib.parse import unquote, urlparse


ROOT = pathlib.Path(__file__).resolve().parent.parent
CERT_DIR = ROOT / ".cert"
CERT_FILE = CERT_DIR / "localhost.pem"
KEY_FILE = CERT_DIR / "localhost-key.pem"
PORT = 3010
BACKEND_ROOT = pathlib.Path(tempfile.gettempdir()) / "hagrad_coronary_backend"
BACKEND_ROOT.mkdir(parents=True, exist_ok=True)

CORONARY_ENV_ROOT = ROOT / ".tooling" / "envs" / "coronary-tools"
CORONARY_ENV_BIN = CORONARY_ENV_ROOT / "bin"
CORONARY_ENV_PYTHON = CORONARY_ENV_BIN / "python"
CORONARY_TOTALSEG = CORONARY_ENV_BIN / "TotalSegmentator"
CORONARY_TOTALSEG_SET_LICENSE = CORONARY_ENV_BIN / "totalseg_set_license"
CORONARY_VMTK = CORONARY_ENV_BIN / "vmtkcenterlines"
CORONARY_PIPELINE = ROOT / "scripts" / "run_coronary_backend_pipeline.py"
TOTALSEG_HOME_DIR = ROOT / ".tooling" / "totalsegmentator-home"

BACKEND_TIMEOUT_SECONDS = 60 * 60
LOG_TAIL_CHARS = 8000


def command_path(name: str, preferred: pathlib.Path | None = None) -> str | None:
    if preferred and preferred.exists():
        return str(preferred)
    return shutil.which(name)


def read_json_file(path: pathlib.Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def detect_totalseg_license() -> dict:
    config_path = TOTALSEG_HOME_DIR / "config.json"
    config = read_json_file(config_path)
    if config is None:
        return {
            "status": "missing_config",
            "message": f"No TotalSegmentator config was found at {config_path}.",
            "configPath": str(config_path),
            "configured": False,
        }

    raw_license = str(config.get("license_number", "") or "").strip()
    if not raw_license:
        return {
            "status": "missing_license",
            "message": "TotalSegmentator is installed, but no coronary task license number is configured yet.",
            "configPath": str(config_path),
            "configured": True,
            "licenseHint": "Set an academic or commercial TotalSegmentator license before running coronary_arteries.",
        }

    if raw_license.startswith("aca_") and len(raw_license) == 18:
        return {
            "status": "ready",
            "message": "A TotalSegmentator coronary task license is configured locally.",
            "configPath": str(config_path),
            "configured": True,
            "maskedLicense": f"{raw_license[:4]}...{raw_license[-4:]}",
        }

    return {
        "status": "invalid_license",
        "message": "The configured TotalSegmentator license number does not match the expected coronary task format.",
        "configPath": str(config_path),
        "configured": True,
        "maskedLicense": f"{raw_license[:4]}...{raw_license[-4:]}" if len(raw_license) >= 8 else raw_license,
    }


def detect_backend_tools() -> dict:
    total_segmentator = command_path("TotalSegmentator", CORONARY_TOTALSEG)
    vmtkcenterlines = command_path("vmtkcenterlines", CORONARY_VMTK)
    slicer = command_path("Slicer")
    dcm2niix = command_path("dcm2niix")
    available_tools: list[str] = []

    if total_segmentator:
        available_tools.append("TotalSegmentator")
    if vmtkcenterlines:
        available_tools.append("VMTK")
    if slicer:
        available_tools.append("Slicer")
    if dcm2niix:
        available_tools.append("dcm2niix")

    license_info = detect_totalseg_license() if total_segmentator else {
        "status": "unavailable",
        "message": "TotalSegmentator is not installed.",
        "configured": False,
    }
    coronary_ready = bool(total_segmentator and vmtkcenterlines and license_info["status"] == "ready")

    if coronary_ready:
        pipeline = "totalsegmentator_vmtk"
        message = "TotalSegmentator, VMTK, and a local coronary task license were detected. Automatic coronary tree extraction is ready."
    elif total_segmentator and vmtkcenterlines:
        pipeline = "totalsegmentator_vmtk_needs_license"
        message = (
            "TotalSegmentator and VMTK were detected, but the licensed TotalSegmentator coronary task is not enabled yet. "
            "Configure a local coronary task license to unlock one-click auto-tree segmentation."
        )
    elif total_segmentator and license_info["status"] == "ready":
        pipeline = "totalsegmentator_only"
        message = (
            "TotalSegmentator is ready for coronary masks, but VMTK was not detected. "
            "Install VMTK to extract branch centerlines for per-vessel reformats."
        )
    elif total_segmentator:
        pipeline = "totalsegmentator_only_needs_license"
        message = (
            "TotalSegmentator is installed, but coronary auto-segmentation still needs both a configured coronary task license "
            "and the VMTK post-processing stage."
        )
    else:
        pipeline = "none"
        message = "No supported coronary backend tools were detected. Install TotalSegmentator first, then VMTK for centerline extraction."

    return {
        "availableTools": available_tools,
        "recommendedPipeline": pipeline,
        "message": message,
        "details": {
            "totalsegmentator": {
                "available": bool(total_segmentator),
                "command": total_segmentator,
                "python": str(CORONARY_ENV_PYTHON) if CORONARY_ENV_PYTHON.exists() else None,
                "homeDir": str(TOTALSEG_HOME_DIR),
                "configPath": str(TOTALSEG_HOME_DIR / "config.json"),
                "license": license_info,
                "coronaryTaskReady": coronary_ready,
            },
            "vmtkcenterlines": {
                "available": bool(vmtkcenterlines),
                "command": vmtkcenterlines,
            },
            "slicer": {
                "available": bool(slicer),
                "command": slicer,
            },
            "dcm2niix": {
                "available": bool(dcm2niix),
                "command": dcm2niix,
            },
            "pipelineScript": {
                "available": CORONARY_PIPELINE.exists(),
                "path": str(CORONARY_PIPELINE),
            },
        },
        "installHints": [
            f"TOTALSEG_HOME_DIR={TOTALSEG_HOME_DIR} {CORONARY_TOTALSEG_SET_LICENSE} -l aca_XXXXXXXXXXXXXX",
            f"{CORONARY_TOTALSEG} -i <dicom_folder> -o <output_dir> -ta coronary_arteries -d cpu",
            "Keep VMTK installed so the backend can split the coronary mask into branch-wise centerlines.",
        ],
    }


def json_bytes(payload: dict) -> bytes:
    return json.dumps(payload, indent=2).encode("utf-8")


def safe_relative_path(filename: str, fallback: str) -> pathlib.Path:
    normalized = filename.replace("\\", "/")
    candidate = pathlib.PurePosixPath(normalized)
    clean_parts = [part for part in candidate.parts if part not in ("", ".", "..")]
    if not clean_parts:
        clean_parts = [fallback]
    return pathlib.Path(*clean_parts)


def parse_multipart_form(headers, body: bytes) -> tuple[dict[str, list[str]], list[dict]]:
    content_type = headers.get("Content-Type", "")
    message_bytes = (
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8") + body
    )
    message = BytesParser(policy=policy.default).parsebytes(message_bytes)
    fields: dict[str, list[str]] = {}
    files: list[dict] = []

    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        filename = part.get_filename()
        payload = part.get_payload(decode=True) or b""
        if filename is not None:
            files.append(
                {
                    "field": name or "file",
                    "filename": filename,
                    "content_type": part.get_content_type(),
                    "payload": payload,
                }
            )
        else:
            charset = part.get_content_charset() or "utf-8"
            value = payload.decode(charset, errors="replace")
            fields.setdefault(name or "field", []).append(value)

    return fields, files


def save_uploaded_files(job_input_dir: pathlib.Path, files: list[dict]) -> list[str]:
    saved_paths: list[str] = []
    for index, entry in enumerate(files):
        relative_path = safe_relative_path(entry["filename"], f"file_{index:04d}.dcm")
        target_path = job_input_dir / relative_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(entry["payload"])
        saved_paths.append(str(relative_path))
    return saved_paths


def list_artifacts(job_id: str, base_dir: pathlib.Path) -> list[dict]:
    artifacts: list[dict] = []
    if not base_dir.exists():
        return artifacts
    for path in sorted(base_dir.rglob("*")):
        if path.is_dir():
            continue
        relative_path = path.relative_to(base_dir).as_posix()
        artifacts.append(
            {
                "name": path.name,
                "relativePath": relative_path,
                "sizeBytes": path.stat().st_size,
                "url": f"/api/coronary/backend/artifacts/{job_id}/{relative_path}",
            }
        )
    return artifacts


def write_manifest(job_dir: pathlib.Path, payload: dict) -> None:
    (job_dir / "manifest.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")


def build_backend_env() -> dict[str, str]:
    path_prefixes = [str(CORONARY_ENV_BIN)] if CORONARY_ENV_BIN.exists() else []
    existing_path = os.environ.get("PATH", "")
    merged_path = os.pathsep.join([*path_prefixes, existing_path]) if path_prefixes else existing_path
    return {
        **os.environ,
        "PATH": merged_path,
        "PYTHONUNBUFFERED": "1",
        "TOTALSEG_HOME_DIR": str(TOTALSEG_HOME_DIR),
        "OMP_NUM_THREADS": "1",
        "OPENBLAS_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1",
    }


def trim_text(value: str) -> str:
    return value[-LOG_TAIL_CHARS:] if value else ""


class CoronaryHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return

    def send_json(self, status_code: int, payload: dict) -> None:
        encoded = json_bytes(payload)
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/coronary/backend/status":
            tools = detect_backend_tools()
            self.send_json(
                200,
                {
                    **tools,
                    "server": {"port": PORT},
                },
            )
            return

        if parsed.path.startswith("/api/coronary/backend/artifacts/"):
            self.serve_artifact(parsed.path)
            return

        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/coronary/backend/segment":
            self.handle_segment_request()
            return

        self.send_json(404, {"message": "Unknown coronary backend endpoint."})

    def serve_artifact(self, request_path: str) -> None:
        prefix = "/api/coronary/backend/artifacts/"
        relative = request_path[len(prefix) :]
        parts = [part for part in pathlib.PurePosixPath(unquote(relative)).parts if part not in ("", ".", "..")]
        if len(parts) < 2:
            self.send_json(404, {"message": "Artifact not found."})
            return
        job_id = parts[0]
        artifact_relative = pathlib.Path(*parts[1:])
        artifact_path = BACKEND_ROOT / job_id / "output" / artifact_relative
        if not artifact_path.exists() or not artifact_path.is_file():
            self.send_json(404, {"message": "Artifact not found."})
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(artifact_path.stat().st_size))
        self.end_headers()
        with artifact_path.open("rb") as handle:
            shutil.copyfileobj(handle, self.wfile)

    def handle_segment_request(self) -> None:
        tools = detect_backend_tools()
        content_type = self.headers.get("Content-Type", "")
        content_length = int(self.headers.get("Content-Length", "0") or "0")
        if "multipart/form-data" not in content_type or content_length <= 0:
            self.send_json(400, {"message": "Expected multipart/form-data with DICOM files.", "tools": tools})
            return

        body = self.rfile.read(content_length)
        fields, files = parse_multipart_form(self.headers, body)
        dicom_files = [entry for entry in files if entry["field"] == "dicom_file"]
        if not dicom_files:
            self.send_json(400, {"message": "No DICOM files were uploaded for coronary auto-segmentation.", "tools": tools})
            return

        options_raw = fields.get("options", ["{}"])[0]
        try:
            options = json.loads(options_raw)
        except json.JSONDecodeError:
            options = {}

        job_id = uuid.uuid4().hex[:12]
        job_dir = BACKEND_ROOT / job_id
        input_dir = job_dir / "input"
        output_dir = job_dir / "output"
        input_dir.mkdir(parents=True, exist_ok=True)
        output_dir.mkdir(parents=True, exist_ok=True)
        saved_files = save_uploaded_files(input_dir, dicom_files)

        total_segmentator_available = tools["details"]["totalsegmentator"]["available"]
        license_status = tools["details"]["totalsegmentator"]["license"]["status"]

        if not total_segmentator_available:
            payload = {
                "status": "missing_tools",
                "message": "Automatic coronary tree segmentation requires a local TotalSegmentator installation.",
                "tools": tools,
                "jobId": job_id,
                "savedFiles": saved_files,
            }
            write_manifest(job_dir, payload)
            self.send_json(501, payload)
            return

        if license_status != "ready":
            payload = {
                "status": "needs_license",
                "message": (
                    "TotalSegmentator and VMTK are installed, but the licensed TotalSegmentator coronary task is not enabled yet. "
                    f"Use `{tools['installHints'][0]}` before retrying auto coronary tree segmentation."
                ),
                "tools": tools,
                "jobId": job_id,
                "savedFiles": saved_files,
            }
            write_manifest(job_dir, payload)
            self.send_json(412, payload)
            return

        if not CORONARY_PIPELINE.exists():
            payload = {
                "status": "failed",
                "message": "The coronary backend pipeline script is missing from this prototype.",
                "tools": tools,
                "jobId": job_id,
                "savedFiles": saved_files,
            }
            write_manifest(job_dir, payload)
            self.send_json(500, payload)
            return

        result_json_path = output_dir / "pipeline-result.json"
        task = str(options.get("task", "coronary_arteries") or "coronary_arteries")
        command = [
            str(CORONARY_ENV_PYTHON if CORONARY_ENV_PYTHON.exists() else pathlib.Path(sys.executable)),
            str(CORONARY_PIPELINE),
            "--input-dir",
            str(input_dir),
            "--output-dir",
            str(output_dir),
            "--result-json",
            str(result_json_path),
            "--totalsegmentator-command",
            tools["details"]["totalsegmentator"]["command"] or "TotalSegmentator",
            "--task",
            task,
            "--input-coordinate-system",
            "las",
        ]

        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=False,
                timeout=BACKEND_TIMEOUT_SECONDS,
                env=build_backend_env(),
            )
        except subprocess.TimeoutExpired:
            payload = {
                "status": "failed",
                "message": "The coronary backend timed out while processing the uploaded CTA series.",
                "tools": tools,
                "jobId": job_id,
                "savedFiles": saved_files,
                "command": command,
            }
            write_manifest(job_dir, payload)
            self.send_json(504, payload)
            return
        except Exception as error:  # pragma: no cover - defensive runtime path
            payload = {
                "status": "failed",
                "message": f"Coronary backend execution failed before segmentation could start: {error}",
                "tools": tools,
                "jobId": job_id,
                "savedFiles": saved_files,
                "command": command,
            }
            write_manifest(job_dir, payload)
            self.send_json(500, payload)
            return

        result_payload = read_json_file(result_json_path) or {}
        artifacts = list_artifacts(job_id, output_dir)
        status = result_payload.get("status") or ("completed" if completed.returncode == 0 else "failed")
        message = result_payload.get("message") or (
            "Automatic coronary backend processing completed."
            if completed.returncode == 0
            else "Automatic coronary backend processing failed."
        )

        payload = {
            "status": status,
            "message": message,
            "pipeline": result_payload.get("pipeline") or tools["recommendedPipeline"],
            "tools": tools,
            "jobId": job_id,
            "savedFiles": saved_files,
            "command": command,
            "artifacts": artifacts,
            "stdout": trim_text(completed.stdout),
            "stderr": trim_text(completed.stderr),
            "vessels": result_payload.get("vessels", []),
            "metrics": result_payload.get("metrics", {}),
        }

        if "mask" in result_payload:
            payload["mask"] = result_payload["mask"]
        if "warnings" in result_payload:
            payload["warnings"] = result_payload["warnings"]

        write_manifest(job_dir, payload)
        if completed.returncode != 0 or status == "failed":
            self.send_json(500, payload)
            return

        self.send_json(200, payload)


def main() -> None:
    if not CERT_FILE.exists() or not KEY_FILE.exists():
        raise SystemExit("Missing certificate files.\nRun ./make-local-cert.command first.")

    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), CoronaryHandler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=str(CERT_FILE), keyfile=str(KEY_FILE))
    server.socket = context.wrap_socket(server.socket, server_side=True)

    print(f"Serving coronary prototype from {ROOT} at https://localhost:{PORT}")
    print("Leave this window open while the coronary prototype is running.")
    server.serve_forever()


if __name__ == "__main__":
    main()
