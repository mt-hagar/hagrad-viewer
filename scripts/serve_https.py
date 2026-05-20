#!/usr/bin/env python3

from __future__ import annotations

import http.server
import json
import os
import pathlib
import csv
import re
import shutil
import ssl
import subprocess
import tempfile
import uuid
import base64
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import urlparse


def resolve_runtime_root() -> pathlib.Path:
    configured = (
        os.environ.get("HAGRAD_RUNTIME_ROOT")
        or os.environ.get("HAGRAD_APP_ROOT")
        or os.environ.get("HAGRAD_ROOT")
    )
    if configured:
        return pathlib.Path(configured).expanduser().resolve()
    return pathlib.Path(__file__).resolve().parent.parent


def resolve_path_env(name: str, default: pathlib.Path, *, create: bool = False) -> pathlib.Path:
    configured = os.environ.get(name)
    path = pathlib.Path(configured).expanduser() if configured else default
    if not path.is_absolute():
        path = ROOT / path
    if create:
        path.mkdir(parents=True, exist_ok=True)
    return path


ROOT = resolve_runtime_root()
STATE_ROOT_CONFIGURED = bool(os.environ.get("HAGRAD_STATE_ROOT"))
STATE_ROOT = resolve_path_env("HAGRAD_STATE_ROOT", ROOT)
CERT_DIR = resolve_path_env("HAGRAD_CERT_DIR", ROOT / ".cert")
CERT_FILE = CERT_DIR / "localhost.pem"
KEY_FILE = CERT_DIR / "localhost-key.pem"
PORT = 3020

BACKEND_ROOT = resolve_path_env(
    "HAGRAD_BACKEND_ROOT",
    pathlib.Path(tempfile.gettempdir()) / "hagrad_eat_backend",
    create=True,
)
BACKEND_ROOT.mkdir(parents=True, exist_ok=True)
EAT_STUDY_CACHE_ROOT = BACKEND_ROOT / "study_cache"
EAT_STUDY_CACHE_ROOT.mkdir(parents=True, exist_ok=True)
PROJECTS_ROOT = resolve_path_env("HAGRAD_PROJECTS_ROOT", STATE_ROOT / "project_lists", create=True)
PROJECTS_ROOT.mkdir(parents=True, exist_ok=True)
PROJECT_STATE_FILE = PROJECTS_ROOT / "_state.json"
EXPORTS_OUTBOX_ROOT = pathlib.Path(
    os.environ.get("HAGRAD_EXPORTS_OUTBOX") or str(STATE_ROOT / "exports_outbox")
).expanduser()
EXPORTS_OUTBOX_ROOT.mkdir(parents=True, exist_ok=True)
EXPORT_STUDIES_FILE = EXPORTS_OUTBOX_ROOT / "_export_studies.json"
EXPORT_WORKFLOW_FOLDERS = [
    "viewer",
    "eat",
    "coronary",
    "ccta-iq",
    "stent",
    "calcscorer",
    "contrast-calcscorer",
    "qca",
    "noiselab",
]
EXPORT_INDEX_SUMMARY_FILENAME = "_study_export_summary.csv"
EXPORT_INDEX_ROLLUP_FILENAME = "_study_export_rollup.csv"
EXPORT_INDEX_FILENAMES = {
    EXPORT_INDEX_SUMMARY_FILENAME,
    EXPORT_INDEX_ROLLUP_FILENAME,
}
for workflow_folder in EXPORT_WORKFLOW_FOLDERS:
    (EXPORTS_OUTBOX_ROOT / workflow_folder).mkdir(parents=True, exist_ok=True)

EAT_ENV_ROOT = ROOT / ".tooling" / "envs" / "coronary-tools"
EAT_ENV_BIN = EAT_ENV_ROOT / "bin"
EAT_ENV_PYTHON = EAT_ENV_BIN / "python"
EAT_TOTALSEG = EAT_ENV_BIN / "TotalSegmentator"
EAT_PIPELINE = ROOT / "scripts" / "run_eat_backend_pipeline.py"
TOTALSEG_HOME_DIR = resolve_path_env("HAGRAD_TOTALSEG_HOME", ROOT / ".tooling" / "totalsegmentator-home")
TOTALSEG_WEIGHTS_DIR = TOTALSEG_HOME_DIR / "nnunet" / "results"
DEFAULT_TRAINING_ROOT = STATE_ROOT / "eat_training_feedback" if STATE_ROOT_CONFIGURED else ROOT / ".tooling" / "eat_training_feedback"
TRAINING_ROOT = resolve_path_env("HAGRAD_TRAINING_ROOT", DEFAULT_TRAINING_ROOT, create=True)
TRAINING_CASES_ROOT = TRAINING_ROOT / "cases"
TRAINING_PROFILE_PATH = TRAINING_ROOT / "profile.json"
TRAINING_CASES_ROOT.mkdir(parents=True, exist_ok=True)

LOG_TAIL_CHARS = 8000
BACKEND_TIMEOUT_SECONDS = 60 * 60

TOTALSEG_TOTAL_WEIGHT_DIRS = [
    "Dataset291_TotalSegmentator_part1_organs_1559subj",
    "Dataset292_TotalSegmentator_part2_vertebrae_1532subj",
    "Dataset293_TotalSegmentator_part3_cardiac_1559subj",
    "Dataset294_TotalSegmentator_part4_muscles_1559subj",
    "Dataset295_TotalSegmentator_part5_ribs_1559subj",
]
TOTALSEG_HIGHRES_WEIGHT_DIR = "Dataset301_heart_highres_1559subj"


def load_local_env_files() -> None:
    for env_path in [ROOT / ".env.pointguard", ROOT / ".env.local", ROOT / ".env"]:
        if not env_path.exists():
            continue
        try:
            lines = env_path.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue

        for raw_line in lines:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            env_key = key.strip()
            env_value = value.strip().strip("'").strip('"')
            if env_key and env_key not in os.environ:
                os.environ[env_key] = env_value


load_local_env_files()

POINTGUARD_TRANSCRIPTION_MODEL = str(os.environ.get("POINTGUARD_TRANSCRIPTION_MODEL") or "gpt-4o-transcribe").strip() or "gpt-4o-transcribe"
POINTGUARD_REALTIME_TRANSCRIPTION_MODEL = str(
    os.environ.get("POINTGUARD_REALTIME_TRANSCRIPTION_MODEL") or "gpt-4o-mini-transcribe"
).strip() or "gpt-4o-mini-transcribe"
POINTGUARD_OPENAI_API_BASE = str(os.environ.get("OPENAI_API_BASE") or "https://api.openai.com/v1").rstrip("/")
POINTGUARD_TRANSCRIPTION_TIMEOUT_SECONDS = 90
POINTGUARD_REALTIME_TIMEOUT_SECONDS = 30
POINTGUARD_MAX_AUDIO_BYTES = 25 * 1024 * 1024


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


def write_json_file(path: pathlib.Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def json_bytes(payload: dict) -> bytes:
    return json.dumps(payload, indent=2).encode("utf-8")


def trim_text(value: str) -> str:
    return value[-LOG_TAIL_CHARS:] if value else ""


def slugify_export_segment(value: str, fallback: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9._-]+", "_", str(value or "").strip()).strip("._-")
    return text or fallback


def ensure_unique_path(path: pathlib.Path) -> pathlib.Path:
    if not path.exists():
        return path

    stem = path.stem
    suffix = path.suffix
    counter = 1
    while True:
        candidate = path.with_name(f"{stem}_{counter:02d}{suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def ensure_export_suffix(filename: str) -> str:
    path = pathlib.Path(str(filename or "").strip())
    stem = path.stem or "export"
    suffix = path.suffix
    if not stem.lower().endswith("_export"):
        stem = f"{stem}_export"
    return f"{stem}{suffix}"


def load_export_study_state() -> dict:
    payload = read_json_file(EXPORT_STUDIES_FILE) or {}
    studies = payload.get("studies")
    if not isinstance(studies, list):
        studies = []
    normalized = []
    for raw_study in studies:
        if not isinstance(raw_study, dict):
            continue
        slug = slugify_project_name(raw_study.get("slug") or raw_study.get("id") or raw_study.get("label") or "")
        if not slug:
            continue
        normalized.append(
            {
                "id": slug,
                "slug": slug,
                "label": str(raw_study.get("label") or slug).strip() or slug,
                "createdAt": str(raw_study.get("createdAt") or now_iso()),
            }
        )
    return {
        "currentStudyId": str(payload.get("currentStudyId") or "").strip(),
        "studies": normalized,
    }


def save_export_study_state(payload: dict) -> None:
    write_json_file(EXPORT_STUDIES_FILE, payload)


def list_export_studies_payload() -> dict:
    state = load_export_study_state()
    studies = []
    for study in state["studies"]:
        studies.append(
            {
                **study,
                "exportPath": str(EXPORTS_OUTBOX_ROOT / study["slug"]),
            }
        )
    return {
        "studies": studies,
        "currentStudyId": str(state.get("currentStudyId") or "").strip(),
    }


def create_export_study(label: str) -> dict:
    text = str(label or "").strip()
    if not text:
        raise ValueError("Study name is required.")

    state = load_export_study_state()
    base_slug = slugify_project_name(text)
    slug = base_slug
    suffix = 2
    existing_slugs = {study["slug"] for study in state["studies"]}
    while slug in existing_slugs:
        slug = f"{base_slug}_{suffix:02d}"
        suffix += 1

    study = {
        "id": slug,
        "slug": slug,
        "label": text,
        "createdAt": now_iso(),
    }
    state["studies"].append(study)
    state["currentStudyId"] = slug
    save_export_study_state(state)
    (EXPORTS_OUTBOX_ROOT / slug).mkdir(parents=True, exist_ok=True)
    return {
        **study,
        "exportPath": str(EXPORTS_OUTBOX_ROOT / slug),
    }


def select_export_study(study_id: str) -> dict:
    target_id = slugify_project_name(study_id)
    state = load_export_study_state()
    if not target_id or str(study_id or "").strip() == "":
        state["currentStudyId"] = ""
        save_export_study_state(state)
        return {
            "id": "",
            "slug": "",
            "label": "",
            "exportPath": str(EXPORTS_OUTBOX_ROOT),
        }
    study = next((entry for entry in state["studies"] if entry["id"] == target_id), None)
    if not study:
        raise ValueError("Selected study does not exist.")
    state["currentStudyId"] = study["id"]
    save_export_study_state(state)
    return {
        **study,
        "exportPath": str(EXPORTS_OUTBOX_ROOT / study["slug"]),
    }


def resolve_export_study(study_id: str) -> dict | None:
    target_id = slugify_project_name(study_id)
    if not target_id:
        return None
    state = load_export_study_state()
    return next((entry for entry in state["studies"] if entry["id"] == target_id), None)


def resolve_export_target_dir(workflow_slug: str, study: dict | None) -> pathlib.Path:
    base_dir = EXPORTS_OUTBOX_ROOT / workflow_slug
    if study:
        return base_dir / study["slug"]
    return base_dir


def get_export_index_context(folder: pathlib.Path) -> dict[str, str] | None:
    try:
        relative_parts = folder.relative_to(EXPORTS_OUTBOX_ROOT).parts
    except ValueError:
        return None

    if len(relative_parts) == 1 and relative_parts[0] in EXPORT_WORKFLOW_FOLDERS:
        return {
            "workflow": str(relative_parts[0]).strip(),
            "research_study_id": "",
            "layout": "workflow-root",
        }
    if len(relative_parts) == 2 and relative_parts[0] in EXPORT_WORKFLOW_FOLDERS:
        return {
            "workflow": str(relative_parts[0]).strip(),
            "research_study_id": str(relative_parts[1]).strip(),
            "layout": "workflow-study",
        }
    if len(relative_parts) == 2 and relative_parts[1] in EXPORT_WORKFLOW_FOLDERS:
        return {
            "workflow": str(relative_parts[1]).strip(),
            "research_study_id": str(relative_parts[0]).strip(),
            "layout": "legacy-study-workflow",
        }
    return None


def sanitize_patient_export_folder(value: str) -> str:
    return slugify_export_segment(value, "study")


def save_export_copy(
    workflow: str,
    filename: str,
    content_base64: str,
    mime_type: str,
    study_id: str = "",
    patient_study_id: str = "",
) -> dict:
    workflow_slug = slugify_export_segment(workflow, "general")
    safe_filename = pathlib.Path(str(filename or "")).name
    safe_filename = ensure_export_suffix(safe_filename)
    safe_filename = slugify_export_segment(safe_filename, f"{workflow_slug}_export")
    study = resolve_export_study(study_id)
    study_root = resolve_export_target_dir(workflow_slug, study)
    patient_folder = sanitize_patient_export_folder(patient_study_id) if study and patient_study_id else ""
    target_dir = study_root / patient_folder if patient_folder else study_root
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = ensure_unique_path(target_dir / safe_filename)

    try:
        payload = base64.b64decode(str(content_base64 or ""), validate=True)
    except Exception as error:  # noqa: BLE001
        raise ValueError("Export file payload is not valid base64.") from error

    target_path.write_bytes(payload)
    index_result = None
    if target_path.suffix.lower() == ".csv":
        index_result = rebuild_export_indexes_for_folder(study_root)
    return {
        "workflow": workflow_slug,
        "studyId": study["id"] if study else "",
        "studyLabel": study["label"] if study else "",
        "patientStudyId": str(patient_study_id or "").strip(),
        "patientFolder": patient_folder,
        "filename": target_path.name,
        "path": str(target_path),
        "directory": str(target_dir),
        "indexDirectory": str(study_root),
        "mimeType": str(mime_type or "application/octet-stream"),
        "savedAt": now_iso(),
        "indexing": index_result,
    }


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def slugify_project_name(value: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9]+", "_", (value or "").strip().lower()).strip("_")
    return text or "project"


def project_dir(project_id: str) -> pathlib.Path:
    return PROJECTS_ROOT / project_id


def load_current_project_id() -> str | None:
    payload = read_json_file(PROJECT_STATE_FILE) or {}
    project_id = str(payload.get("currentProjectId") or "").strip()
    return project_id or None


def save_current_project_id(project_id: str | None) -> None:
    write_json_file(PROJECT_STATE_FILE, {"currentProjectId": project_id or ""})


def read_csv_rows(path: pathlib.Path) -> tuple[list[str], list[dict[str, str]]]:
    if not path.exists():
        return [], []

    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        return list(reader.fieldnames or []), rows


def write_csv_rows(path: pathlib.Path, headers: list[str], rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({header: row.get(header, "") for header in headers})


def append_csv_rows(path: pathlib.Path, headers: list[str], rows: list[dict[str, object]]) -> None:
    existing_headers, existing_rows = read_csv_rows(path)
    if not existing_headers:
        write_csv_rows(path, headers, rows)
        return

    merged_headers = list(existing_headers)
    for header in headers:
        if header not in merged_headers:
            merged_headers.append(header)

    if merged_headers != existing_headers:
        combined_rows = existing_rows + rows
        write_csv_rows(path, merged_headers, combined_rows)
        return

    with path.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=existing_headers, extrasaction="ignore")
        for row in rows:
            writer.writerow({header: row.get(header, "") for header in existing_headers})


def normalize_csv_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")


def extract_row_value(row: dict[str, str], aliases: list[str]) -> str:
    normalized = {normalize_csv_header(key): str(value or "").strip() for key, value in row.items()}
    for alias in aliases:
        value = normalized.get(normalize_csv_header(alias), "")
        if value:
            return value
    return ""


def extract_folder_research_study_id(folder: pathlib.Path) -> str:
    context = get_export_index_context(folder)
    return str(context.get("research_study_id") or "").strip() if context else ""


def extract_folder_workflow(folder: pathlib.Path) -> str:
    context = get_export_index_context(folder)
    return str(context.get("workflow") or "").strip() if context else ""


def infer_export_type(filename: str) -> str:
    stem = pathlib.Path(str(filename or "")).stem
    if stem.lower().endswith("_export"):
        stem = stem[:-7]
    return stem


def format_export_timestamp(path: pathlib.Path) -> str:
    stat = path.stat()
    return datetime.fromtimestamp(stat.st_mtime, timezone.utc).astimezone().isoformat(timespec="seconds")


def list_source_export_csvs(folder: pathlib.Path) -> list[pathlib.Path]:
    context = get_export_index_context(folder)
    if not context:
        return []

    paths = []
    search_iterable = folder.rglob("*.csv") if context["research_study_id"] else folder.glob("*.csv")
    for candidate in search_iterable:
        if candidate.name in EXPORT_INDEX_FILENAMES:
            continue
        if candidate.name.startswith("._"):
            continue
        if not candidate.is_file():
            continue
        paths.append(candidate)
    paths.sort(key=lambda path: (path.stat().st_mtime, str(path.relative_to(folder)).lower()))
    return paths


def build_export_summary_row(folder: pathlib.Path, path: pathlib.Path, rows: list[dict[str, str]]) -> dict[str, object]:
    relative_export_file = str(path.relative_to(folder)).replace(os.sep, "/")
    first_row = rows[0] if rows else {}
    timestamp = format_export_timestamp(path)
    exported_dt = datetime.fromisoformat(timestamp)
    study_id = extract_row_value(first_row, ["study_id", "study id", "research_study_id", "research study id"])
    patient_id = extract_row_value(first_row, ["patient_id", "patient id"])
    return {
        "research_study_id": extract_folder_research_study_id(folder),
        "workflow": extract_folder_workflow(folder),
        "exported_at": timestamp,
        "export_date": exported_dt.date().isoformat(),
        "export_time": exported_dt.strftime("%H:%M:%S"),
        "export_file": relative_export_file,
        "export_type": infer_export_type(path.name),
        "row_count": len(rows),
        "study_id": study_id,
        "patient_id": patient_id,
    }


def rollup_sort_key(row: dict[str, object]) -> tuple[str, str, str, str, int]:
    patient_id = str(row.get("index_patient_id") or "").strip().lower()
    study_id = str(row.get("index_study_id") or "").strip().lower()
    primary_id = patient_id or study_id or "\uffff"
    exported_at = str(row.get("index_exported_at") or "")
    export_file = str(row.get("index_export_file") or "").lower()
    try:
        source_row_index = int(row.get("index_source_row_index") or 0)
    except (TypeError, ValueError):
        source_row_index = 0
    return (primary_id, study_id or "\uffff", exported_at, export_file, source_row_index)


def rebuild_export_indexes_for_folder(folder: pathlib.Path) -> dict | None:
    context = get_export_index_context(folder)
    if not context:
        return None

    source_csvs = list_source_export_csvs(folder)
    if not source_csvs:
        return None

    summary_headers = [
        "research_study_id",
        "workflow",
        "exported_at",
        "export_date",
        "export_time",
        "export_file",
        "export_type",
        "row_count",
        "study_id",
        "patient_id",
    ]
    rollup_headers = [
        "index_research_study_id",
        "index_workflow",
        "index_exported_at",
        "index_export_date",
        "index_export_time",
        "index_export_file",
        "index_export_type",
        "index_source_row_index",
        "index_study_id",
        "index_patient_id",
    ]
    summary_rows: list[dict[str, object]] = []
    rollup_rows: list[dict[str, object]] = []

    for path in source_csvs:
        headers, rows = read_csv_rows(path)
        summary_row = build_export_summary_row(folder, path, rows)
        summary_rows.append(summary_row)
        exported_at = str(summary_row["exported_at"])
        export_date = str(summary_row["export_date"])
        export_time = str(summary_row["export_time"])
        study_id = str(summary_row["study_id"] or "")
        patient_id = str(summary_row["patient_id"] or "")
        for header in headers:
            if header not in rollup_headers:
                rollup_headers.append(header)
        for index, row in enumerate(rows, start=1):
            row_study_id = extract_row_value(row, ["study_id", "study id", "research_study_id", "research study id"]) or study_id
            row_patient_id = extract_row_value(row, ["patient_id", "patient id"]) or patient_id
            rollup_rows.append(
                {
                    "index_research_study_id": summary_row["research_study_id"],
                    "index_workflow": summary_row["workflow"],
                    "index_exported_at": exported_at,
                    "index_export_date": export_date,
                    "index_export_time": export_time,
                    "index_export_file": summary_row["export_file"],
                    "index_export_type": summary_row["export_type"],
                    "index_source_row_index": index,
                    "index_study_id": row_study_id,
                    "index_patient_id": row_patient_id,
                    **row,
                }
            )

    summary_rows.sort(key=lambda row: (str(row.get("exported_at") or ""), str(row.get("export_file") or "").lower()))
    rollup_rows.sort(key=rollup_sort_key)

    write_csv_rows(folder / EXPORT_INDEX_SUMMARY_FILENAME, summary_headers, summary_rows)
    write_csv_rows(folder / EXPORT_INDEX_ROLLUP_FILENAME, rollup_headers, rollup_rows)

    return {
        "folder": str(folder),
        "sourceCsvCount": len(source_csvs),
        "summaryPath": str(folder / EXPORT_INDEX_SUMMARY_FILENAME),
        "rollupPath": str(folder / EXPORT_INDEX_ROLLUP_FILENAME),
        "rollupRowCount": len(rollup_rows),
    }


def rebuild_all_export_indexes() -> dict[str, object]:
    rebuilt = []
    for folder in sorted(EXPORTS_OUTBOX_ROOT.rglob("*")):
        if not folder.is_dir():
            continue
        result = rebuild_export_indexes_for_folder(folder)
        if result:
            rebuilt.append(result)
    return {
        "folderCount": len(rebuilt),
        "folders": rebuilt,
    }


def project_meta_path(project_id: str) -> pathlib.Path:
    return project_dir(project_id) / "project.json"


def load_project_meta(project_id: str) -> dict | None:
    payload = read_json_file(project_meta_path(project_id))
    if not payload:
        return None
    payload["id"] = project_id
    payload["slug"] = project_id
    payload["path"] = str(project_dir(project_id))
    return payload


def compute_next_case_id(project_id: str) -> str:
    path = project_dir(project_id) / "cases.csv"
    _headers, rows = read_csv_rows(path)
    pattern = re.compile(rf"^{re.escape(project_id)}_(\d+)$", re.IGNORECASE)
    max_number = 0
    for row in rows:
        case_id = str(row.get("case_id") or "").strip()
        match = pattern.match(case_id)
        if match:
            max_number = max(max_number, int(match.group(1)))
    return f"{project_id}_{max_number + 1:03d}"


def count_project_cases(project_id: str) -> int:
    path = project_dir(project_id) / "cases.csv"
    _headers, rows = read_csv_rows(path)
    return len(rows)


def normalize_match_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def case_session_path(project_id: str, case_id: str) -> pathlib.Path:
    safe_case_id = re.sub(r"[^a-zA-Z0-9_]+", "_", str(case_id or "").strip()).strip("_") or "case"
    return project_dir(project_id) / "sessions" / f"{safe_case_id}.json"


def list_project_cases(project_id: str) -> list[dict[str, object]]:
    path = project_dir(project_id) / "cases.csv"
    _headers, rows = read_csv_rows(path)
    _export_headers, export_rows = read_csv_rows(project_dir(project_id) / "exports_log.csv")

    export_counts: dict[str, int] = {}
    last_export_at: dict[str, str] = {}
    for row in export_rows:
        case_id = str(row.get("case_id") or "").strip()
        if not case_id:
            continue
        export_counts[case_id] = export_counts.get(case_id, 0) + 1
        timestamp = str(row.get("export_timestamp") or "").strip()
        if timestamp and timestamp > last_export_at.get(case_id, ""):
            last_export_at[case_id] = timestamp

    enriched: list[dict[str, object]] = []
    for row in rows:
        case_id = str(row.get("case_id") or "").strip()
        session_path = case_session_path(project_id, case_id)
        session_payload = read_json_file(session_path) if session_path.exists() else None
        enriched.append(
            {
                **row,
                "has_session": session_path.exists(),
                "session_saved_at": str((session_payload or {}).get("savedAt") or ""),
                "export_count": export_counts.get(case_id, 0),
                "last_export_at": last_export_at.get(case_id, ""),
            }
        )

    return sorted(
        enriched,
        key=lambda row: (
            str(row.get("updated_at") or ""),
            str(row.get("created_at") or ""),
            str(row.get("case_id") or ""),
        ),
        reverse=True,
    )


def get_project_case(project_id: str, case_id: str) -> dict[str, object] | None:
    normalized_case_id = str(case_id or "").strip()
    if not normalized_case_id:
        return None
    return next(
        (row for row in list_project_cases(project_id) if str(row.get("case_id") or "").strip() == normalized_case_id),
        None,
    )


def find_project_case_matches(project_id: str, case_payload: dict) -> list[dict[str, object]]:
    candidate_study_uid = normalize_match_text(case_payload.get("studyInstanceUID"))
    candidate_patient_id = normalize_match_text(case_payload.get("patientId"))
    candidate_accession = normalize_match_text(case_payload.get("accessionNumber"))
    candidate_patient_name = normalize_match_text(case_payload.get("patientName"))
    candidate_birth_date = normalize_match_text(case_payload.get("patientBirthDate"))
    candidate_datetime = normalize_match_text(case_payload.get("studyDateTime"))
    candidate_case_id = normalize_match_text(case_payload.get("caseId"))

    matches: list[dict[str, object]] = []
    for case_row in list_project_cases(project_id):
        score = 0
        reasons: list[str] = []

        case_study_uid = normalize_match_text(case_row.get("study_instance_uid"))
        case_patient_id = normalize_match_text(case_row.get("patient_id"))
        case_accession = normalize_match_text(case_row.get("accession_number"))
        case_patient_name = normalize_match_text(case_row.get("patient_name"))
        case_birth_date = normalize_match_text(case_row.get("patient_birth_date"))
        case_datetime = normalize_match_text(case_row.get("study_datetime"))
        case_row_id = normalize_match_text(case_row.get("case_id"))

        if candidate_case_id and case_row_id and candidate_case_id == case_row_id:
            score += 140
            reasons.append("same case ID")
        if candidate_study_uid and case_study_uid and candidate_study_uid == case_study_uid:
            score += 100
            reasons.append("same Study Instance UID")
        if candidate_patient_id and case_patient_id and candidate_patient_id == case_patient_id:
            score += 45
            reasons.append("same patient ID")
        if candidate_accession and case_accession and candidate_accession == case_accession:
            score += 25
            reasons.append("same accession number")
        if candidate_patient_name and case_patient_name and candidate_patient_name == case_patient_name:
            score += 16
            reasons.append("same patient name")
        if candidate_birth_date and case_birth_date and candidate_birth_date == case_birth_date:
            score += 12
            reasons.append("same birth date")
        if candidate_datetime and case_datetime and candidate_datetime == case_datetime:
            score += 8
            reasons.append("same study date/time")
        if (
            candidate_patient_name
            and case_patient_name
            and candidate_birth_date
            and case_birth_date
            and candidate_patient_name == case_patient_name
            and candidate_birth_date == case_birth_date
        ):
            score += 20
            reasons.append("same patient name + birth date")

        if score <= 0:
            continue

        matches.append(
            {
                **case_row,
                "match_score": score,
                "match_reasons": reasons,
            }
        )

    return sorted(
        matches,
        key=lambda row: (
            int(row.get("match_score") or 0),
            str(row.get("updated_at") or ""),
            str(row.get("case_id") or ""),
        ),
        reverse=True,
    )


def list_projects() -> list[dict]:
    projects: list[dict] = []
    for child in sorted(PROJECTS_ROOT.iterdir()):
        if not child.is_dir() or child.name.startswith(".") or child.name.startswith("_"):
            continue
        meta = load_project_meta(child.name)
        if not meta:
            continue
        meta["caseCount"] = count_project_cases(child.name)
        meta["nextCaseId"] = compute_next_case_id(child.name)
        projects.append(meta)
    return projects


def create_project(name: str, slug: str | None = None) -> dict:
    clean_name = str(name or "").strip()
    if not clean_name:
        raise ValueError("Project name is required.")

    base_slug = slugify_project_name(slug or clean_name)
    candidate = base_slug
    suffix = 2
    while project_dir(candidate).exists():
        candidate = f"{base_slug}_{suffix}"
        suffix += 1

    target_dir = project_dir(candidate)
    target_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "name": clean_name,
        "slug": candidate,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    write_json_file(project_meta_path(candidate), payload)
    save_current_project_id(candidate)
    return {
        **payload,
        "id": candidate,
        "path": str(target_dir),
        "caseCount": 0,
        "nextCaseId": compute_next_case_id(candidate),
    }


def require_project(project_id: str) -> dict:
    meta = load_project_meta(project_id)
    if not meta:
        raise FileNotFoundError("Project was not found.")
    meta["caseCount"] = count_project_cases(project_id)
    meta["nextCaseId"] = compute_next_case_id(project_id)
    return meta


def update_project_timestamp(project_id: str) -> None:
    meta = load_project_meta(project_id)
    if not meta:
        return
    meta["updatedAt"] = now_iso()
    write_json_file(project_meta_path(project_id), meta)


def upsert_case(project_id: str, case_payload: dict) -> dict:
    path = project_dir(project_id) / "cases.csv"
    headers, rows = read_csv_rows(path)
    default_headers = [
        "internal_case_uuid",
        "project_id",
        "project_name",
        "case_id",
        "case_label",
        "patient_name",
        "patient_id",
        "patient_birth_date",
        "patient_sex",
        "patient_age_dicom",
        "patient_age_years",
        "accession_number",
        "study_instance_uid",
        "study_datetime",
        "created_at",
        "updated_at",
    ]
    headers = headers or default_headers

    case_id = str(case_payload.get("caseId") or "").strip()
    if not case_id:
        raise ValueError("Case ID is required.")

    project_meta = require_project(project_id)
    existing = next((row for row in rows if str(row.get("case_id") or "").strip() == case_id), None)
    timestamp = now_iso()

    merged = {
        "internal_case_uuid": (existing or {}).get("internal_case_uuid") or uuid.uuid4().hex,
        "project_id": project_id,
        "project_name": project_meta.get("name", project_id),
        "case_id": case_id,
        "case_label": str(case_payload.get("caseLabel") or "").strip(),
        "patient_name": str(case_payload.get("patientName") or "").strip(),
        "patient_id": str(case_payload.get("patientId") or "").strip(),
        "patient_birth_date": str(case_payload.get("patientBirthDate") or "").strip(),
        "patient_sex": str(case_payload.get("patientSex") or "").strip(),
        "patient_age_dicom": str(case_payload.get("patientAgeDicom") or "").strip(),
        "patient_age_years": str(case_payload.get("patientAgeYears") or "").strip(),
        "accession_number": str(case_payload.get("accessionNumber") or "").strip(),
        "study_instance_uid": str(case_payload.get("studyInstanceUID") or "").strip(),
        "study_datetime": str(case_payload.get("studyDateTime") or "").strip(),
        "created_at": (existing or {}).get("created_at") or timestamp,
        "updated_at": timestamp,
    }

    if existing:
        rows = [merged if str(row.get("case_id") or "").strip() == case_id else row for row in rows]
    else:
        rows.append(merged)

    write_csv_rows(path, headers, rows)
    update_project_timestamp(project_id)
    return merged


def safe_relative_path(filename: str, fallback: str) -> pathlib.Path:
    normalized = str(filename or "").replace("\\", "/")
    candidate = pathlib.PurePosixPath(normalized)
    clean_parts = [
        part
        for part in candidate.parts
        if part not in ("", ".", "..", "/") and not part.endswith(":")
    ]
    if not clean_parts:
        clean_parts = [fallback]
    return pathlib.Path(*clean_parts)


def parse_multipart_form(headers, body: bytes) -> tuple[dict[str, list[str]], list[dict]]:
    content_type = headers.get("Content-Type", "")
    message_bytes = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8") + body
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
            fields.setdefault(name or "field", []).append(payload.decode(charset, errors="replace"))

    return fields, files


def save_uploaded_files(job_input_dir: pathlib.Path, files: list[dict]) -> list[str]:
    saved_paths: list[str] = []
    base_dir = job_input_dir.resolve()
    for index, entry in enumerate(files):
        relative_path = safe_relative_path(entry["filename"], f"file_{index:04d}.dcm")
        target_path = (base_dir / relative_path).resolve()
        if not target_path.is_relative_to(base_dir):
            relative_path = pathlib.Path(f"file_{index:04d}.dcm")
            target_path = base_dir / relative_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(entry["payload"])
        saved_paths.append(str(relative_path))
    return saved_paths


def sanitize_cache_key(value: object) -> str | None:
    text = re.sub(r"[^a-z0-9_-]+", "", str(value or "").strip().lower())
    if not text:
        return None
    return text[:96]


def eat_study_cache_dir(cache_key: str) -> pathlib.Path:
    return EAT_STUDY_CACHE_ROOT / cache_key


def eat_study_cache_input_dir(cache_key: str) -> pathlib.Path:
    return eat_study_cache_dir(cache_key) / "input"


def eat_study_cache_manifest_path(cache_key: str) -> pathlib.Path:
    return eat_study_cache_dir(cache_key) / "manifest.json"


def list_relative_files(root: pathlib.Path) -> list[str]:
    if not root.exists():
        return []
    return sorted(str(path.relative_to(root)) for path in root.rglob("*") if path.is_file())


def read_eat_study_cache_manifest(cache_key: str | None) -> dict | None:
    normalized_key = sanitize_cache_key(cache_key)
    if not normalized_key:
        return None

    input_dir = eat_study_cache_input_dir(normalized_key)
    files = list_relative_files(input_dir)
    if not files:
        return None

    payload = read_json_file(eat_study_cache_manifest_path(normalized_key)) or {}
    created_at = str(payload.get("createdAt") or payload.get("updatedAt") or payload.get("lastUsedAt") or now_iso())
    updated_at = str(payload.get("updatedAt") or payload.get("lastUsedAt") or created_at)
    last_used_at = str(payload.get("lastUsedAt") or updated_at)
    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}

    return {
        "cacheKey": normalized_key,
        "available": True,
        "inputDir": str(input_dir),
        "fileCount": len(files),
        "files": files,
        "createdAt": created_at,
        "updatedAt": updated_at,
        "lastUsedAt": last_used_at,
        "metadata": metadata,
    }


def write_eat_study_cache_manifest(cache_key: str, payload: dict) -> dict:
    normalized_key = sanitize_cache_key(cache_key)
    if not normalized_key:
        raise ValueError("A valid cache key is required.")

    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}

    manifest = {
        "cacheKey": normalized_key,
        "createdAt": str(payload.get("createdAt") or now_iso()),
        "updatedAt": str(payload.get("updatedAt") or now_iso()),
        "lastUsedAt": str(payload.get("lastUsedAt") or payload.get("updatedAt") or now_iso()),
        "fileCount": int(payload.get("fileCount") or 0),
        "files": list(payload.get("files") or []),
        "metadata": metadata,
    }
    write_json_file(eat_study_cache_manifest_path(normalized_key), manifest)
    manifest["available"] = bool(manifest["fileCount"])
    manifest["inputDir"] = str(eat_study_cache_input_dir(normalized_key))
    return manifest


def touch_eat_study_cache(cache_key: str, metadata: dict | None = None) -> dict | None:
    existing = read_eat_study_cache_manifest(cache_key)
    if not existing:
        return None

    timestamp = now_iso()
    next_metadata = dict(existing.get("metadata") or {})
    if isinstance(metadata, dict):
        next_metadata.update({key: value for key, value in metadata.items() if value not in (None, "")})

    return write_eat_study_cache_manifest(
        existing["cacheKey"],
        {
            **existing,
            "updatedAt": timestamp,
            "lastUsedAt": timestamp,
            "metadata": next_metadata,
        },
    )


def summarize_eat_study_cache() -> dict:
    entry_count = 0
    file_count = 0
    last_used_at = ""

    if EAT_STUDY_CACHE_ROOT.exists():
        for child in EAT_STUDY_CACHE_ROOT.iterdir():
            if not child.is_dir():
                continue
            manifest = read_eat_study_cache_manifest(child.name)
            if not manifest:
                continue
            entry_count += 1
            file_count += int(manifest.get("fileCount") or 0)
            if str(manifest.get("lastUsedAt") or "") > last_used_at:
                last_used_at = str(manifest.get("lastUsedAt") or "")

    return {
        "root": str(EAT_STUDY_CACHE_ROOT),
        "entryCount": entry_count,
        "fileCount": file_count,
        "lastUsedAt": last_used_at,
    }


def resolve_eat_study_input(
    fallback_input_dir: pathlib.Path,
    files: list[dict],
    cache_key: str | None = None,
    metadata: dict | None = None,
) -> tuple[pathlib.Path, list[str], dict]:
    normalized_key = sanitize_cache_key(cache_key)
    metadata = metadata if isinstance(metadata, dict) else {}

    if normalized_key:
        cached = read_eat_study_cache_manifest(normalized_key)
        if cached:
            cached = touch_eat_study_cache(normalized_key, metadata) or cached
            return eat_study_cache_input_dir(normalized_key), list(cached.get("files") or []), {
                **cached,
                "hit": True,
                "stored": False,
                "source": "cache",
            }

        if not files:
            raise FileNotFoundError("The requested study is not available in the local backend cache yet.")

        cache_input_dir = eat_study_cache_input_dir(normalized_key)
        if cache_input_dir.exists():
            shutil.rmtree(cache_input_dir)
        cache_input_dir.mkdir(parents=True, exist_ok=True)
        saved_paths = save_uploaded_files(cache_input_dir, files)
        timestamp = now_iso()
        manifest = write_eat_study_cache_manifest(
            normalized_key,
            {
                "createdAt": timestamp,
                "updatedAt": timestamp,
                "lastUsedAt": timestamp,
                "fileCount": len(saved_paths),
                "files": saved_paths,
                "metadata": metadata,
            },
        )
        return cache_input_dir, saved_paths, {
            **manifest,
            "hit": False,
            "stored": True,
            "source": "upload",
        }

    if not files:
        raise ValueError("No uploaded files were received.")

    saved_paths = save_uploaded_files(fallback_input_dir, files)
    return fallback_input_dir, saved_paths, {
        "cacheKey": None,
        "available": False,
        "fileCount": len(saved_paths),
        "files": saved_paths,
        "hit": False,
        "stored": False,
        "source": "upload",
    }


def count_training_cases() -> int:
    if not TRAINING_CASES_ROOT.exists():
        return 0
    return sum(1 for child in TRAINING_CASES_ROOT.iterdir() if child.is_dir())


def detect_training_corpus() -> dict:
    profile = read_json_file(TRAINING_PROFILE_PATH) or {}
    global_margin = profile.get("globalMarginMmMean")
    blend_weight = profile.get("blendWeight")
    return {
        "root": str(TRAINING_ROOT),
        "casesRoot": str(TRAINING_CASES_ROOT),
        "profilePath": str(TRAINING_PROFILE_PATH),
        "caseCount": count_training_cases(),
        "learnedCaseCount": int(profile.get("learnedCaseCount") or 0),
        "confirmedSliceCount": int(profile.get("confirmedSliceCount") or 0),
        "updatedAt": str(profile.get("updatedAt") or ""),
        "profile": {
            "globalMarginMmMean": float(global_margin) if isinstance(global_margin, (int, float)) else None,
            "blendWeight": float(blend_weight) if isinstance(blend_weight, (int, float)) else 0.0,
            "providerCounts": profile.get("providerCounts") or {},
        },
    }


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
            "message": "No TotalSegmentator commercial heart-task license is configured.",
            "configPath": str(config_path),
            "configured": True,
        }

    if len(raw_license) == 18:
        return {
            "status": "ready",
            "message": "A TotalSegmentator heart-task license is configured locally.",
            "configPath": str(config_path),
            "configured": True,
            "maskedLicense": f"{raw_license[:4]}...{raw_license[-4:]}",
        }

    return {
        "status": "invalid_license",
        "message": "The configured TotalSegmentator license number does not match the expected offline format.",
        "configPath": str(config_path),
        "configured": True,
        "maskedLicense": f"{raw_license[:4]}...{raw_license[-4:]}" if len(raw_license) >= 8 else raw_license,
    }


def detect_weight_status() -> dict:
    total_ready = all((TOTALSEG_WEIGHTS_DIR / part).exists() for part in TOTALSEG_TOTAL_WEIGHT_DIRS)
    highres_ready = (TOTALSEG_WEIGHTS_DIR / TOTALSEG_HIGHRES_WEIGHT_DIR).exists()
    return {
        "weightsRoot": str(TOTALSEG_WEIGHTS_DIR),
        "totalReady": total_ready,
        "heartHighresReady": highres_ready,
    }


def detect_eat_backend_tools() -> dict:
    training_corpus = detect_training_corpus()
    cache_info = summarize_eat_study_cache()
    total_segmentator = command_path("TotalSegmentator", EAT_TOTALSEG)
    license_info = detect_totalseg_license() if total_segmentator else {
        "status": "unavailable",
        "message": "TotalSegmentator is not installed in the local backend environment.",
        "configured": False,
    }
    weight_info = detect_weight_status() if total_segmentator else {
        "weightsRoot": str(TOTALSEG_WEIGHTS_DIR),
        "totalReady": False,
        "heartHighresReady": False,
    }
    highres_ready = bool(total_segmentator and license_info["status"] == "ready")
    ready = bool(total_segmentator and EAT_PIPELINE.exists())

    if highres_ready:
        recommended_pipeline = "totalsegmentator_heartchambers_highres"
        message = (
            "AI Auto Segment can use the licensed high-resolution heart model. "
            "The first run may download missing weights if they are not cached yet."
        )
    elif ready:
        recommended_pipeline = "totalsegmentator_total_roi"
        message = (
            "AI Auto Segment can use the open TotalSegmentator cardiac ROI model. "
            "This gives a trained heart localization step and then builds an editable pericardial starting contour."
        )
    else:
        recommended_pipeline = "none"
        message = "No EAT AI backend is ready. Install or restore the local TotalSegmentator environment first."

    return {
        "ready": ready,
        "canStoreFeedback": True,
        "availableTools": ["TotalSegmentator"] if total_segmentator else [],
        "recommendedPipeline": recommended_pipeline,
        "message": message,
        "trainingCorpus": training_corpus,
        "cache": cache_info,
        "details": {
            "totalsegmentator": {
                "available": bool(total_segmentator),
                "command": total_segmentator,
                "python": str(EAT_ENV_PYTHON) if EAT_ENV_PYTHON.exists() else None,
                "homeDir": str(TOTALSEG_HOME_DIR),
                "license": license_info,
                "weights": weight_info,
            },
            "pipelineScript": {
                "available": EAT_PIPELINE.exists(),
                "path": str(EAT_PIPELINE),
            },
        },
        "installHints": [
            f"{EAT_ENV_BIN / 'totalseg_download_weights'} --task total",
            f"{EAT_ENV_BIN / 'totalseg_set_license'} -l aca_XXXXXXXXXXXXXX",
            "Keep using the browser editor afterward for review, rubber exclusions, and HU threshold-based EAT quantification.",
        ],
    }


def build_backend_env() -> dict[str, str]:
    path_prefixes = [str(EAT_ENV_BIN)] if EAT_ENV_BIN.exists() else []
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
        "KMP_USE_SHM": "0",
    }


def detect_pointguard_backend() -> dict:
    api_key = str(os.environ.get("OPENAI_API_KEY") or "").strip()
    ready = bool(api_key)
    if ready:
        message = (
            "Medical dictation backend ready. PointGuard can use OpenAI Realtime transcription "
            f"with {POINTGUARD_REALTIME_TRANSCRIPTION_MODEL} and fall back to upload transcription "
            f"with {POINTGUARD_TRANSCRIPTION_MODEL}."
        )
        status = "ready"
    else:
        message = (
            "Medical dictation backend is not configured yet. Set OPENAI_API_KEY before starting "
            "the local HTTPS server, and PointGuard will keep browser speech as fallback."
        )
        status = "missing_api_key"

    return {
        "ready": ready,
        "configured": ready,
        "status": status,
        "provider": "openai",
        "model": POINTGUARD_REALTIME_TRANSCRIPTION_MODEL,
        "preferredMode": "realtime_webrtc" if ready else "browser_speech",
        "apiBase": POINTGUARD_OPENAI_API_BASE,
        "message": message,
        "fallback": "browser_speech",
        "maxAudioBytes": POINTGUARD_MAX_AUDIO_BYTES,
        "recommendedFormats": ["webm", "mp4", "m4a", "wav", "ogg"],
        "realtime": {
            "ready": ready,
            "transport": "webrtc_unified",
            "model": POINTGUARD_REALTIME_TRANSCRIPTION_MODEL,
        },
        "upload": {
            "ready": ready,
            "model": POINTGUARD_TRANSCRIPTION_MODEL,
        },
    }


def detect_plaquequant_engines() -> dict:
    nnunet_command = command_path("nnUNetv2_predict", EAT_ENV_BIN / "nnUNetv2_predict")
    seqseg_command = command_path("seqseg", EAT_ENV_BIN / "seqseg")
    vmtk_centerlines = command_path("vmtkcenterlines", EAT_ENV_BIN / "vmtkcenterlines")
    vmtk_surface = command_path("vmtksurfacereader", EAT_ENV_BIN / "vmtksurfacereader")

    nnunet_results = str(
        os.environ.get("PLAQUEQUANT_NNUNET_RESULTS")
        or os.environ.get("nnUNet_results")
        or ""
    ).strip()
    plaque_model_dir = str(os.environ.get("PLAQUEQUANT_PLAQUE_MODEL_DIR") or "").strip()
    seqseg_weights = str(os.environ.get("PLAQUEQUANT_SEQSEG_WEIGHTS") or "").strip()

    nnunet_model_ready = bool(
        nnunet_command
        and (
            (nnunet_results and pathlib.Path(nnunet_results).expanduser().exists())
            or (plaque_model_dir and pathlib.Path(plaque_model_dir).expanduser().exists())
        )
    )
    seqseg_ready = bool(
        seqseg_command
        and (not seqseg_weights or pathlib.Path(seqseg_weights).expanduser().exists())
    )
    vmtk_ready = bool(vmtk_centerlines or vmtk_surface or command_path("vmtk", EAT_ENV_BIN / "vmtk"))

    engines = [
        {
            "id": "mm_dhm_nnunet_plaque",
            "name": "MM-DHM nnU-Net plaque segmentation",
            "ready": nnunet_model_ready,
            "command": nnunet_command,
            "modelPath": plaque_model_dir or nnunet_results,
            "message": (
                "nnU-Net command and plaque model path are configured."
                if nnunet_model_ready
                else "Install nnU-Net v2 and set PLAQUEQUANT_NNUNET_RESULTS or PLAQUEQUANT_PLAQUE_MODEL_DIR after downloading the model weights."
            ),
            "source": "https://github.com/MM-DHM/nnUNet-Coronary-CTA-Segmentation",
            "license": "Apache-2.0",
            "integrationLevel": "status_bridge",
        },
        {
            "id": "seqseg_coronary",
            "name": "SeqSeg coronary lumen/tree tracking",
            "ready": seqseg_ready,
            "command": seqseg_command,
            "modelPath": seqseg_weights,
            "message": (
                "SeqSeg command is available; configure coronary weights for production runs."
                if seqseg_ready
                else "Install seqseg and configure coronary nnU-Net weights for vessel-tree guidance."
            ),
            "source": "https://github.com/numisveinsson/SeqSeg",
            "license": "Apache-2.0",
            "integrationLevel": "status_bridge",
        },
        {
            "id": "vmtk",
            "name": "VMTK centerline tools",
            "ready": vmtk_ready,
            "command": vmtk_centerlines or vmtk_surface or command_path("vmtk", EAT_ENV_BIN / "vmtk"),
            "message": (
                "VMTK command-line tools are available for future centerline/cross-section processing."
                if vmtk_ready
                else "Install VMTK to enable local centerline and vessel-surface processing."
            ),
            "source": "https://github.com/vmtk/vmtk",
            "license": "BSD-style open source",
            "integrationLevel": "status_bridge",
        },
        {
            "id": "coronary_cta_prediction",
            "name": "European Radiology 2022 plaque model",
            "ready": False,
            "command": None,
            "message": "Available as a reference implementation, but it requires legacy MeVisLab/QAngioCT contour preprocessing and is not wired for direct axial DICOM inference.",
            "source": "https://github.com/balinthomonnay/coronary_cta_prediciton",
            "license": "Apache-2.0",
            "integrationLevel": "reference_only",
        },
    ]

    return {
        "ready": any(engine["ready"] for engine in engines),
        "engines": engines,
        "message": "PlaqueQuant checked local open-source engine hooks. Browser fallback remains available.",
        "installHints": [
            "MM-DHM plaque model: install nnunetv2, download the external model folder, and set PLAQUEQUANT_NNUNET_RESULTS or PLAQUEQUANT_PLAQUE_MODEL_DIR before starting the server.",
            "SeqSeg coronary tree: install seqseg, download coronary weights, and set PLAQUEQUANT_SEQSEG_WEIGHTS if the weights are outside the default nnU-Net results folder.",
            "VMTK: install vmtk command-line tools for centerline extraction once a vessel mask is available.",
        ],
    }


def build_pointguard_prompt(context: dict[str, str]) -> str:
    exam_type = str(context.get("examType") or "").strip()
    indication = str(context.get("indication") or "").strip()
    presentation = str(context.get("presentationContext") or "").strip()
    transcript_tail = str(context.get("transcriptTail") or "").strip()

    prompt_parts = [
        "You are transcribing radiology dictation for cardiac CT and coronary CTA reporting.",
        "Transcribe faithfully and do not invent findings.",
        "Prefer medically plausible terminology when the audio supports it.",
        "Do not substitute unrelated everyday words when a specialized radiology or cardiology term is likely intended.",
        (
            "Expect vocabulary such as coronary CTA, cardiac CT, calcium score CT, CAD-RADS, "
            "SCCT segments 1 through 18, left main, LAD, LCx, circumflex, RCA, ramus intermedius, "
            "D1, D2, OM1, OM2, PDA, PLB, PLV, proximal, mid, distal, dominant circulation, "
            "calcified plaque, noncalcified plaque, mixed plaque, stenosis percentages, patent, "
            "occluded, stent, CABG, positive remodeling, napkin-ring sign, low-attenuation plaque, "
            "pericardial effusion, pleural effusion, aortic root, pulmonary arteries, Agatston score, "
            "coronary calcium score, CT-FFR, hepatic segment II, liver segment 2, cystic lesion, "
            "and myocardial bridging."
        ),
        "Output only the dictated words as transcript text.",
    ]

    if exam_type:
        prompt_parts.append(f"Exam context: {exam_type}.")
    if indication:
        prompt_parts.append(f"Clinical indication context: {indication}.")
    if presentation:
        prompt_parts.append(f"Clinical pathway context: {presentation}.")
    if transcript_tail:
        prompt_parts.append(f"Continue from prior transcript context if helpful: {trim_text(transcript_tail)}")

    return " ".join(prompt_parts)


def build_pointguard_realtime_session(context: dict[str, str]) -> dict:
    language = str(context.get("language") or "en").strip() or "en"
    return {
        "type": "transcription",
        "audio": {
            "input": {
                "noise_reduction": {
                    "type": "near_field",
                },
                "transcription": {
                    "model": POINTGUARD_REALTIME_TRANSCRIPTION_MODEL,
                    "prompt": build_pointguard_prompt(context),
                    "language": language,
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.45,
                    "prefix_padding_ms": 400,
                    "silence_duration_ms": 450,
                    "create_response": False,
                    "interrupt_response": False,
                },
            }
        },
    }


def encode_multipart_form(fields: list[tuple[str, str]], files: list[dict]) -> tuple[bytes, str]:
    boundary = f"----PointGuardBoundary{uuid.uuid4().hex}"
    body = bytearray()

    for name, value in fields:
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        body.extend(str(value).encode("utf-8"))
        body.extend(b"\r\n")

    for file_entry in files:
        field_name = str(file_entry.get("field") or "file")
        filename = str(file_entry.get("filename") or "audio.webm")
        content_type = str(file_entry.get("content_type") or "application/octet-stream")
        payload = file_entry.get("payload") or b""
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            (
                f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'
                f"Content-Type: {content_type}\r\n\r\n"
            ).encode("utf-8")
        )
        body.extend(payload)
        body.extend(b"\r\n")

    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    return bytes(body), boundary


def build_openai_headers(*, content_type: str | None = None, accept: str | None = None) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {os.environ['OPENAI_API_KEY'].strip()}",
    }
    if content_type:
        headers["Content-Type"] = content_type
    if accept:
        headers["Accept"] = accept

    openai_project = str(os.environ.get("OPENAI_PROJECT") or "").strip()
    if openai_project:
        headers["OpenAI-Project"] = openai_project
    openai_org = str(os.environ.get("OPENAI_ORG_ID") or "").strip()
    if openai_org:
        headers["OpenAI-Organization"] = openai_org
    return headers


def perform_openai_request(endpoint: str, *, data: bytes, headers: dict[str, str], timeout_seconds: int) -> bytes:
    request = urllib_request.Request(
        f"{POINTGUARD_OPENAI_API_BASE}{endpoint}",
        data=data,
        headers=headers,
        method="POST",
    )

    try:
        with urllib_request.urlopen(request, timeout=timeout_seconds) as response:
            return response.read()
    except urllib_error.HTTPError as error:
        error_payload = error.read()
        message = f"OpenAI request failed with status {error.code}."
        if error_payload:
            try:
                parsed_error = json.loads(error_payload.decode("utf-8"))
                api_message = str(((parsed_error.get("error") or {}).get("message")) or "").strip()
                if api_message:
                    message = api_message
            except (UnicodeDecodeError, json.JSONDecodeError):
                message = trim_text(error_payload.decode("utf-8", errors="replace")) or message
        raise RuntimeError(message) from error
    except urllib_error.URLError as error:
        raise RuntimeError(f"Could not reach the OpenAI service: {error.reason}") from error


def create_pointguard_realtime_session(offer_sdp: str, context: dict[str, str]) -> dict:
    backend = detect_pointguard_backend()
    if not backend["ready"]:
        raise RuntimeError(backend["message"])

    offer_text = str(offer_sdp or "").strip()
    if not offer_text:
        raise ValueError("The browser did not provide an SDP offer for the realtime session.")

    session_payload = build_pointguard_realtime_session(context)
    request_body, boundary = encode_multipart_form(
        [
            ("sdp", offer_text),
            ("session", json.dumps(session_payload)),
        ],
        [],
    )
    raw_response = perform_openai_request(
        "/realtime/calls",
        data=request_body,
        headers=build_openai_headers(
            content_type=f"multipart/form-data; boundary={boundary}",
            accept="application/sdp",
        ),
        timeout_seconds=POINTGUARD_REALTIME_TIMEOUT_SECONDS,
    )

    answer_sdp = raw_response.decode("utf-8", errors="replace").strip()
    if not answer_sdp:
        raise RuntimeError("OpenAI returned an empty SDP answer for the realtime transcription session.")

    return {
        "sdp": answer_sdp,
        "session": session_payload,
        "model": POINTGUARD_REALTIME_TRANSCRIPTION_MODEL,
    }


def transcribe_pointguard_audio(audio_file: dict, context: dict[str, str]) -> dict:
    backend = detect_pointguard_backend()
    if not backend["ready"]:
        raise RuntimeError(backend["message"])

    payload = audio_file.get("payload") or b""
    if len(payload) > POINTGUARD_MAX_AUDIO_BYTES:
        raise ValueError(
            f"The uploaded audio is too large for the transcription endpoint ({len(payload)} bytes)."
        )

    fields = [
        ("model", POINTGUARD_TRANSCRIPTION_MODEL),
        ("language", str(context.get("language") or "en").strip() or "en"),
        ("response_format", "json"),
        ("temperature", "0"),
        ("prompt", build_pointguard_prompt(context)),
    ]
    request_body, boundary = encode_multipart_form(
        fields,
        [
            {
                "field": "file",
                "filename": audio_file.get("filename") or "pointguard-audio.webm",
                "content_type": audio_file.get("content_type") or "application/octet-stream",
                "payload": payload,
            }
        ],
    )

    headers = {
        **build_openai_headers(
            content_type=f"multipart/form-data; boundary={boundary}",
            accept="application/json",
        ),
    }

    raw_response = perform_openai_request(
        "/audio/transcriptions",
        data=request_body,
        headers=headers,
        timeout_seconds=POINTGUARD_TRANSCRIPTION_TIMEOUT_SECONDS,
    )

    try:
        parsed = json.loads(raw_response.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("The transcription backend returned an unreadable response.") from error

    transcript = str(parsed.get("text") or "").strip()
    if not transcript:
        raise RuntimeError("The transcription backend returned an empty transcript.")

    return {
        "text": transcript,
        "duration": parsed.get("duration"),
        "usage": parsed.get("usage"),
        "language": parsed.get("language") or context.get("language") or "en",
    }


def read_json_body(handler: http.server.BaseHTTPRequestHandler) -> dict:
    try:
        content_length = int(handler.headers.get("Content-Length", "0") or 0)
    except ValueError:
        content_length = 0
    if content_length <= 0:
        return {}
    body = handler.rfile.read(content_length)
    if not body:
        return {}
    return json.loads(body.decode("utf-8"))


def append_project_export(project_id: str, export_type: str, headers: list[str], rows: list[dict], case_payload: dict) -> dict:
    if not headers:
        raise ValueError("Export headers are required.")
    if not rows:
        raise ValueError("Export rows are required.")

    project = require_project(project_id)
    case_record = upsert_case(project_id, case_payload)
    export_timestamp = now_iso()
    export_batch_id = uuid.uuid4().hex[:12]

    if export_type == "measurements":
        filename = "measurements.csv"
    elif export_type == "baseline_characteristics":
        filename = "baseline_characteristics.csv"
    else:
        raise ValueError("Unsupported export type.")

    target_path = project_dir(project_id) / filename
    prefixed_headers = [
        "project_id",
        "project_name",
        "case_id",
        "case_label",
        "internal_case_uuid",
        "export_type",
        "export_timestamp",
        "export_batch_id",
        *headers,
    ]
    prefixed_rows = []
    for row in rows:
        prefixed_rows.append(
            {
                "project_id": project_id,
                "project_name": project.get("name", project_id),
                "case_id": case_record["case_id"],
                "case_label": case_record.get("case_label", ""),
                "internal_case_uuid": case_record["internal_case_uuid"],
                "export_type": export_type,
                "export_timestamp": export_timestamp,
                "export_batch_id": export_batch_id,
                **row,
            }
        )

    append_csv_rows(target_path, prefixed_headers, prefixed_rows)

    log_headers = [
        "export_timestamp",
        "export_batch_id",
        "project_id",
        "project_name",
        "case_id",
        "case_label",
        "internal_case_uuid",
        "export_type",
        "row_count",
        "target_file",
    ]
    append_csv_rows(
        project_dir(project_id) / "exports_log.csv",
        log_headers,
        [
            {
                "export_timestamp": export_timestamp,
                "export_batch_id": export_batch_id,
                "project_id": project_id,
                "project_name": project.get("name", project_id),
                "case_id": case_record["case_id"],
                "case_label": case_record.get("case_label", ""),
                "internal_case_uuid": case_record["internal_case_uuid"],
                "export_type": export_type,
                "row_count": len(prefixed_rows),
                "target_file": filename,
            }
        ],
    )

    update_project_timestamp(project_id)
    return {
        "project": require_project(project_id),
        "case": case_record,
        "exportType": export_type,
        "rowCount": len(prefixed_rows),
        "targetFile": str(target_path),
        "exportBatchId": export_batch_id,
        "exportTimestamp": export_timestamp,
    }


def save_project_session(project_id: str, case_payload: dict, session_payload: dict) -> dict:
    if not isinstance(session_payload, dict) or not session_payload:
        raise ValueError("Session payload is required.")

    project = require_project(project_id)
    case_record = upsert_case(project_id, case_payload)
    saved_at = now_iso()
    payload = {
        **session_payload,
        "savedAt": saved_at,
        "projectId": project_id,
        "projectName": project.get("name", project_id),
        "caseId": case_record["case_id"],
        "caseLabel": case_record.get("case_label", ""),
    }
    write_json_file(case_session_path(project_id, case_record["case_id"]), payload)
    update_project_timestamp(project_id)
    return {
        "project": require_project(project_id),
        "case": get_project_case(project_id, case_record["case_id"]) or case_record,
        "savedAt": saved_at,
        "hasSession": True,
    }


def load_project_session(project_id: str, case_id: str) -> dict:
    project = require_project(project_id)
    case_record = get_project_case(project_id, case_id)
    if not case_record:
        raise FileNotFoundError("Case was not found.")

    session_path = case_session_path(project_id, case_id)
    session_payload = read_json_file(session_path) if session_path.exists() else None
    return {
        "project": project,
        "case": case_record,
        "hasSession": bool(session_payload),
        "session": session_payload,
    }


class HagradHandler(http.server.SimpleHTTPRequestHandler):
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
        if parsed.path == "/api/projects":
            current_project_id = load_current_project_id()
            self.send_json(
                200,
                {
                    "projects": list_projects(),
                    "currentProjectId": current_project_id,
                },
            )
            return

        if parsed.path == "/api/export-studies":
            self.send_json(200, list_export_studies_payload())
            return

        if parsed.path == "/api/exports/folder":
            self.send_json(
                200,
                {
                    "root": str(EXPORTS_OUTBOX_ROOT),
                },
            )
            return

        if parsed.path == "/api/eat/backend/status":
            tools = detect_eat_backend_tools()
            self.send_json(
                200,
                {
                    **tools,
                    "server": {"port": PORT},
                },
            )
            return

        if parsed.path == "/api/plaquequant/engines":
            self.send_json(200, detect_plaquequant_engines())
            return

        if parsed.path == "/api/pointguard/backend/status":
            backend = detect_pointguard_backend()
            self.send_json(
                200,
                {
                    **backend,
                    "server": {"port": PORT},
                },
            )
            return

        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/export-studies/create":
            self.handle_export_study_create()
            return
        if parsed.path == "/api/export-studies/select":
            self.handle_export_study_select()
            return
        if parsed.path == "/api/projects/create":
            self.handle_project_create()
            return
        if parsed.path == "/api/projects/select":
            self.handle_project_select()
            return
        if parsed.path == "/api/projects/cases":
            self.handle_project_cases()
            return
        if parsed.path == "/api/projects/find-duplicates":
            self.handle_project_find_duplicates()
            return
        if parsed.path == "/api/projects/next-case-id":
            self.handle_project_next_case_id()
            return
        if parsed.path == "/api/projects/append-export":
            self.handle_project_append_export()
            return
        if parsed.path == "/api/projects/session/save":
            self.handle_project_session_save()
            return
        if parsed.path == "/api/projects/session/load":
            self.handle_project_session_load()
            return
        if parsed.path == "/api/exports/save":
            self.handle_export_save()
            return
        if parsed.path == "/api/eat/backend/segment":
            self.handle_eat_segment_request()
            return
        if parsed.path == "/api/eat/backend/cache/lookup":
            self.handle_eat_cache_lookup()
            return
        if parsed.path == "/api/eat/backend/feedback":
            self.handle_eat_feedback_request()
            return
        if parsed.path == "/api/pointguard/backend/transcribe":
            self.handle_pointguard_transcribe_request()
            return
        if parsed.path == "/api/pointguard/backend/realtime/session":
            self.handle_pointguard_realtime_session_request()
            return

        self.send_json(404, {"message": "Unknown endpoint."})

    def handle_project_create(self) -> None:
        try:
            payload = read_json_body(self)
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Project payload must be valid JSON."})
            return

        try:
            project = create_project(payload.get("name"), payload.get("slug"))
        except ValueError as error:
            self.send_json(400, {"message": str(error)})
            return

        self.send_json(
            200,
            {
                "project": project,
                "projects": list_projects(),
                "currentProjectId": project["id"],
            },
        )

    def handle_project_select(self) -> None:
        try:
            payload = read_json_body(self)
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Project selection payload must be valid JSON."})
            return

        project_id = str(payload.get("projectId") or "").strip()
        if not project_id:
            save_current_project_id(None)
            self.send_json(200, {"project": None, "projects": list_projects(), "currentProjectId": None})
            return

        try:
            project = require_project(project_id)
        except FileNotFoundError:
            self.send_json(404, {"message": "Project not found."})
            return

        save_current_project_id(project_id)
        self.send_json(
            200,
            {
                "project": project,
                "projects": list_projects(),
                "currentProjectId": project_id,
            },
        )

    def handle_project_cases(self) -> None:
        try:
            payload = read_json_body(self)
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Case-list payload must be valid JSON."})
            return

        project_id = str(payload.get("projectId") or load_current_project_id() or "").strip()
        if not project_id:
            self.send_json(200, {"project": None, "cases": []})
            return

        try:
            project = require_project(project_id)
        except FileNotFoundError:
            self.send_json(404, {"message": "Project not found."})
            return

        self.send_json(200, {"project": project, "cases": list_project_cases(project_id)})

    def handle_project_find_duplicates(self) -> None:
        try:
            payload = read_json_body(self)
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Duplicate-check payload must be valid JSON."})
            return

        project_id = str(payload.get("projectId") or load_current_project_id() or "").strip()
        if not project_id:
            self.send_json(200, {"project": None, "matches": []})
            return

        try:
            project = require_project(project_id)
        except FileNotFoundError:
            self.send_json(404, {"message": "Project not found."})
            return

        matches = find_project_case_matches(project_id, payload.get("case") or {})
        self.send_json(200, {"project": project, "matches": matches})

    def handle_project_next_case_id(self) -> None:
        try:
            payload = read_json_body(self)
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Next-case payload must be valid JSON."})
            return

        project_id = str(payload.get("projectId") or load_current_project_id() or "").strip()
        if not project_id:
            self.send_json(400, {"message": "Choose a project first."})
            return

        try:
            project = require_project(project_id)
        except FileNotFoundError:
            self.send_json(404, {"message": "Project not found."})
            return

        self.send_json(
            200,
            {
                "project": project,
                "caseId": compute_next_case_id(project_id),
            },
        )

    def handle_project_append_export(self) -> None:
        try:
            payload = read_json_body(self)
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Export payload must be valid JSON."})
            return

        project_id = str(payload.get("projectId") or "").strip()
        export_type = str(payload.get("exportType") or "").strip()
        headers = [str(value) for value in (payload.get("headers") or []) if str(value).strip()]
        rows = payload.get("rows") or []
        case_payload = payload.get("case") or {}

        if not project_id:
            self.send_json(400, {"message": "Project ID is required."})
            return

        try:
            result = append_project_export(project_id, export_type, headers, rows, case_payload)
        except FileNotFoundError:
            self.send_json(404, {"message": "Project not found."})
            return
        except ValueError as error:
            self.send_json(400, {"message": str(error)})
            return
        except Exception as error:  # noqa: BLE001
            self.send_json(500, {"message": f"Could not append export to the project files: {error}"})
            return

        self.send_json(200, result)

    def handle_project_session_save(self) -> None:
        try:
            payload = read_json_body(self)
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Session payload must be valid JSON."})
            return

        project_id = str(payload.get("projectId") or "").strip()
        if not project_id:
            self.send_json(400, {"message": "Project ID is required."})
            return

        try:
            result = save_project_session(project_id, payload.get("case") or {}, payload.get("session") or {})
        except FileNotFoundError:
            self.send_json(404, {"message": "Project not found."})
            return
        except ValueError as error:
            self.send_json(400, {"message": str(error)})
            return
        except Exception as error:  # noqa: BLE001
            self.send_json(500, {"message": f"Could not save the project session: {error}"})
            return

        self.send_json(200, result)

    def handle_project_session_load(self) -> None:
        try:
            payload = read_json_body(self)
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Session load payload must be valid JSON."})
            return

        project_id = str(payload.get("projectId") or "").strip()
        case_id = str(payload.get("caseId") or "").strip()
        if not project_id or not case_id:
            self.send_json(400, {"message": "Project ID and case ID are required."})
            return

        try:
            result = load_project_session(project_id, case_id)
        except FileNotFoundError as error:
            self.send_json(404, {"message": str(error)})
            return

        self.send_json(200, result)

    def handle_export_save(self) -> None:
        try:
            payload = read_json_body(self)
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Export-save payload must be valid JSON."})
            return

        workflow = str(payload.get("workflow") or "").strip()
        filename = str(payload.get("filename") or "").strip()
        content_base64 = str(payload.get("contentBase64") or "").strip()
        mime_type = str(payload.get("mimeType") or "").strip()
        study_id = str(payload.get("studyId") or "").strip()
        patient_study_id = str(payload.get("patientStudyId") or "").strip()

        if not filename or not content_base64:
            self.send_json(400, {"message": "Both filename and contentBase64 are required."})
            return

        try:
            result = save_export_copy(workflow, filename, content_base64, mime_type, study_id, patient_study_id)
        except ValueError as error:
            self.send_json(400, {"message": str(error)})
            return
        except OSError as error:
            self.send_json(500, {"message": f"Could not write the export copy: {error}"})
            return

        self.send_json(200, result)

    def handle_export_study_create(self) -> None:
        try:
            payload = read_json_body(self)
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Export-study payload must be valid JSON."})
            return

        label = str(payload.get("label") or "").strip()
        try:
            study = create_export_study(label)
        except ValueError as error:
            self.send_json(400, {"message": str(error)})
            return

        self.send_json(
            200,
            {
                "study": study,
                **list_export_studies_payload(),
            },
        )

    def handle_export_study_select(self) -> None:
        try:
            payload = read_json_body(self)
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Export-study payload must be valid JSON."})
            return

        study_id = str(payload.get("studyId") or "").strip()
        try:
            study = select_export_study(study_id)
        except ValueError as error:
            self.send_json(400, {"message": str(error)})
            return

        self.send_json(
            200,
            {
                "study": study,
                **list_export_studies_payload(),
            },
        )

    def handle_eat_segment_request(self) -> None:
        tools = detect_eat_backend_tools()
        if not tools["ready"]:
            self.send_json(
                503,
                {
                    "message": tools["message"],
                    "tools": tools,
                },
            )
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0") or 0)
        except ValueError:
            content_length = 0
        if content_length <= 0:
            self.send_json(400, {"message": "No uploaded files were received.", "tools": tools})
            return

        body = self.rfile.read(content_length)
        fields, files = parse_multipart_form(self.headers, body)

        options = {}
        raw_options = (fields.get("options") or [None])[0]
        if raw_options:
            try:
                options = json.loads(raw_options)
            except json.JSONDecodeError:
                self.send_json(400, {"message": "The backend options payload is not valid JSON.", "tools": tools})
                return
        if not files and not sanitize_cache_key(options.get("cacheKey")):
            self.send_json(400, {"message": "No DICOM files were uploaded.", "tools": tools})
            return

        job_id = uuid.uuid4().hex[:12]
        job_dir = BACKEND_ROOT / job_id
        job_output_dir = job_dir / "output"
        job_result_path = job_dir / "result.json"
        job_output_dir.mkdir(parents=True, exist_ok=True)
        cache_metadata = {
            "patientId": options.get("patientId"),
            "studyInstanceUID": options.get("studyInstanceUID"),
            "seriesInstanceUID": options.get("seriesInstanceUID"),
            "frameOfReferenceUID": options.get("frameOfReferenceUID"),
            "reconstructionLabel": options.get("reconstructionLabel"),
            "sliceCount": options.get("sliceCount"),
        }
        try:
            input_dir, saved_files, cache_info = resolve_eat_study_input(
                job_dir / "input",
                files,
                options.get("cacheKey"),
                cache_metadata,
            )
        except FileNotFoundError as error:
            self.send_json(
                409,
                {
                    "message": str(error),
                    "tools": tools,
                    "cache": {
                        "cacheKey": sanitize_cache_key(options.get("cacheKey")),
                        "available": False,
                        "requested": True,
                    },
                },
            )
            return
        command = [
            str(EAT_ENV_PYTHON) if EAT_ENV_PYTHON.exists() else "python3",
            str(EAT_PIPELINE),
            "--input-dir",
            str(input_dir),
            "--output-dir",
            str(job_output_dir),
            "--result-json",
            str(job_result_path),
            "--profile-json",
            str(TRAINING_PROFILE_PATH),
            "--totalsegmentator-command",
            command_path("TotalSegmentator", EAT_TOTALSEG) or "TotalSegmentator",
            "--provider",
            str(options.get("provider") or "auto"),
            "--top-slice-index",
            str(int(options.get("topSliceIndex", 0) or 0)),
            "--bottom-slice-index",
            str(int(options.get("bottomSliceIndex", -1) or -1)),
            "--threshold-min-hu",
            str(float(options.get("thresholdMinHu", -190) or -190)),
            "--threshold-max-hu",
            str(float(options.get("thresholdMaxHu", -30) or -30)),
        ]

        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=False,
                env=build_backend_env(),
                timeout=BACKEND_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            self.send_json(
                504,
                {
                    "message": "AI Auto Segment timed out before the local model pipeline finished.",
                    "jobId": job_id,
                    "uploadedFiles": saved_files,
                    "tools": tools,
                    "cache": cache_info,
                },
            )
            return
        except Exception as error:
            self.send_json(
                500,
                {
                    "message": f"Could not launch the local EAT backend: {error}",
                    "jobId": job_id,
                    "uploadedFiles": saved_files,
                    "tools": tools,
                    "cache": cache_info,
                },
            )
            return

        payload = read_json_file(job_result_path)
        if completed.returncode != 0 or payload is None:
            self.send_json(
                500,
                {
                    "message": trim_text(completed.stderr) or trim_text(completed.stdout) or "AI Auto Segment failed before returning a result.",
                    "jobId": job_id,
                    "uploadedFiles": saved_files,
                    "tools": tools,
                    "cache": cache_info,
                    "logs": {
                        "stdout": trim_text(completed.stdout),
                        "stderr": trim_text(completed.stderr),
                    },
                },
            )
            return

        payload["jobId"] = job_id
        payload["uploadedFiles"] = saved_files
        payload["cache"] = cache_info
        payload["tools"] = detect_eat_backend_tools()
        payload.setdefault(
            "message",
            "AI Auto Segment completed and returned editable pericardial starting contours.",
        )
        self.send_json(200, payload)

    def handle_eat_cache_lookup(self) -> None:
        try:
            payload = read_json_body(self)
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Cache lookup payload must be valid JSON."})
            return

        cache_key = sanitize_cache_key(payload.get("cacheKey"))
        if not cache_key:
            self.send_json(400, {"message": "A cache key is required for study lookup."})
            return

        cache = read_eat_study_cache_manifest(cache_key)
        self.send_json(
            200,
            {
                "cache": cache
                or {
                    "cacheKey": cache_key,
                    "available": False,
                    "fileCount": 0,
                    "files": [],
                },
                "tools": detect_eat_backend_tools(),
            },
        )

    def handle_eat_feedback_request(self) -> None:
        tools = detect_eat_backend_tools()

        try:
            content_length = int(self.headers.get("Content-Length", "0") or 0)
        except ValueError:
            content_length = 0
        if content_length <= 0:
            self.send_json(400, {"message": "No uploaded files were received.", "tools": tools})
            return

        body = self.rfile.read(content_length)
        fields, files = parse_multipart_form(self.headers, body)

        raw_annotations = (fields.get("annotations") or [None])[0]
        if not raw_annotations:
            self.send_json(400, {"message": "The training annotation payload is missing.", "tools": tools})
            return

        try:
            annotations = json.loads(raw_annotations)
        except json.JSONDecodeError:
            self.send_json(400, {"message": "The training annotation payload is not valid JSON.", "tools": tools})
            return

        confirmed_slice_count = int(((annotations.get("summary") or {}).get("confirmedSliceCount")) or 0)
        if confirmed_slice_count <= 0:
            self.send_json(
                400,
                {
                    "message": "At least one manual or rubber-corrected slice is required before sending training feedback.",
                    "tools": tools,
                },
            )
            return

        options = {}
        raw_options = (fields.get("options") or [None])[0]
        if raw_options:
            try:
                options = json.loads(raw_options)
            except json.JSONDecodeError:
                self.send_json(400, {"message": "The backend options payload is not valid JSON.", "tools": tools})
                return
        if not files and not sanitize_cache_key(options.get("cacheKey")):
            self.send_json(400, {"message": "No DICOM files were uploaded.", "tools": tools})
            return

        timestamp = datetime.now(timezone.utc).astimezone().strftime("%Y%m%d_%H%M%S")
        patient_label = slugify_project_name(str(options.get("patientId") or annotations.get("patientId") or "anon"))
        reconstruction_label = slugify_project_name(
            str(options.get("reconstructionLabel") or annotations.get("reconstructionLabel") or "series")
        )
        case_id = f"{timestamp}_{patient_label}_{reconstruction_label}_{uuid.uuid4().hex[:6]}"
        case_dir = TRAINING_CASES_ROOT / case_id
        cache_metadata = {
            "patientId": options.get("patientId") or annotations.get("patientId"),
            "studyInstanceUID": options.get("studyInstanceUID") or annotations.get("studyInstanceUID"),
            "seriesInstanceUID": options.get("seriesInstanceUID") or annotations.get("seriesInstanceUID"),
            "frameOfReferenceUID": annotations.get("frameOfReferenceUID"),
            "reconstructionLabel": options.get("reconstructionLabel") or annotations.get("reconstructionLabel"),
            "sliceCount": ((annotations.get("range") or {}).get("count")),
        }
        try:
            input_dir, saved_files, cache_info = resolve_eat_study_input(
                case_dir / "input",
                files,
                options.get("cacheKey"),
                cache_metadata,
            )
        except FileNotFoundError as error:
            self.send_json(
                409,
                {
                    "message": str(error),
                    "tools": tools,
                    "cache": {
                        "cacheKey": sanitize_cache_key(options.get("cacheKey")),
                        "available": False,
                        "requested": True,
                    },
                },
            )
            return

        case_output_dir = case_dir / "output"
        case_result_path = case_dir / "training-result.json"
        annotations_path = case_dir / "annotations.json"
        manifest_path = case_dir / "manifest.json"
        case_dir.mkdir(parents=True, exist_ok=True)
        case_output_dir.mkdir(parents=True, exist_ok=True)
        write_json_file(annotations_path, annotations)
        write_json_file(
            manifest_path,
            {
                "caseId": case_id,
                "submittedAt": now_iso(),
                "uploadedFiles": saved_files,
                "options": options,
                "annotationSummary": annotations.get("summary") or {},
                "patientId": annotations.get("patientId") or options.get("patientId") or "",
                "patientName": annotations.get("patientName") or options.get("patientName") or "",
                "studyInstanceUID": annotations.get("studyInstanceUID") or options.get("studyInstanceUID") or "",
                "seriesInstanceUID": annotations.get("seriesInstanceUID") or options.get("seriesInstanceUID") or "",
                "reconstructionLabel": annotations.get("reconstructionLabel") or options.get("reconstructionLabel") or "",
                "backendCacheKey": cache_info.get("cacheKey"),
                "usedCachedStudy": bool(cache_info.get("hit")),
                "inputSource": cache_info.get("source"),
            },
        )

        if not tools["ready"]:
            self.send_json(
                200,
                {
                    "ok": True,
                    "profileUpdated": False,
                    "bundleStored": True,
                    "caseId": case_id,
                    "uploadedFiles": saved_files,
                    "cache": cache_info,
                    "message": "Stored the local training reference bundle, but the AI backend is not ready yet so the learning profile was not updated.",
                    "tools": detect_eat_backend_tools(),
                },
            )
            return

        command = [
            str(EAT_ENV_PYTHON) if EAT_ENV_PYTHON.exists() else "python3",
            str(EAT_PIPELINE),
            "--mode",
            "feedback",
            "--input-dir",
            str(input_dir),
            "--output-dir",
            str(case_output_dir),
            "--result-json",
            str(case_result_path),
            "--annotations-json",
            str(annotations_path),
            "--profile-json",
            str(TRAINING_PROFILE_PATH),
            "--totalsegmentator-command",
            command_path("TotalSegmentator", EAT_TOTALSEG) or "TotalSegmentator",
            "--provider",
            str(options.get("provider") or "auto"),
        ]

        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=False,
                env=build_backend_env(),
                timeout=BACKEND_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            self.send_json(
                200,
                {
                    "ok": True,
                    "profileUpdated": False,
                    "bundleStored": True,
                    "caseId": case_id,
                    "uploadedFiles": saved_files,
                    "cache": cache_info,
                    "message": "Stored the local training reference bundle, but the profile update timed out before the backend finished learning from it.",
                    "tools": detect_eat_backend_tools(),
                },
            )
            return
        except Exception as error:
            self.send_json(
                200,
                {
                    "ok": True,
                    "profileUpdated": False,
                    "bundleStored": True,
                    "caseId": case_id,
                    "uploadedFiles": saved_files,
                    "cache": cache_info,
                    "message": f"Stored the local training reference bundle, but the backend could not launch the learning step: {error}",
                    "tools": detect_eat_backend_tools(),
                },
            )
            return

        payload = read_json_file(case_result_path)
        if completed.returncode != 0 or payload is None:
            self.send_json(
                200,
                {
                    "ok": True,
                    "profileUpdated": False,
                    "bundleStored": True,
                    "caseId": case_id,
                    "uploadedFiles": saved_files,
                    "cache": cache_info,
                    "message": trim_text(completed.stderr)
                    or trim_text(completed.stdout)
                    or "Stored the local training reference bundle, but the AI contour profile could not be updated from it.",
                    "tools": detect_eat_backend_tools(),
                    "logs": {
                        "stdout": trim_text(completed.stdout),
                        "stderr": trim_text(completed.stderr),
                    },
                },
            )
            return

        payload["caseId"] = case_id
        payload["uploadedFiles"] = saved_files
        payload["bundleStored"] = True
        payload["cache"] = cache_info
        payload["tools"] = detect_eat_backend_tools()
        payload.setdefault(
            "message",
            "Stored the local training reference bundle and updated the AI contour profile for future runs.",
        )
        self.send_json(200, payload)

    def handle_pointguard_transcribe_request(self) -> None:
        backend = detect_pointguard_backend()
        if not backend["ready"]:
            self.send_json(
                503,
                {
                    "message": backend["message"],
                    "backend": backend,
                },
            )
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0") or 0)
        except ValueError:
            content_length = 0
        if content_length <= 0:
            self.send_json(400, {"message": "No microphone audio was uploaded.", "backend": backend})
            return

        body = self.rfile.read(content_length)
        fields, files = parse_multipart_form(self.headers, body)
        if not files:
            self.send_json(400, {"message": "No audio file was uploaded for transcription.", "backend": backend})
            return

        audio_file = next((entry for entry in files if entry.get("field") in {"audio", "file"}), files[0])
        if len(audio_file.get("payload") or b"") <= 0:
            self.send_json(400, {"message": "The uploaded audio file was empty.", "backend": backend})
            return

        context = {
            "examType": (fields.get("examType") or [""])[0],
            "indication": (fields.get("indication") or [""])[0],
            "presentationContext": (fields.get("presentationContext") or [""])[0],
            "transcriptTail": (fields.get("transcriptTail") or [""])[0],
            "language": (fields.get("language") or ["en"])[0],
        }

        try:
            transcript = transcribe_pointguard_audio(audio_file, context)
        except ValueError as error:
            self.send_json(400, {"message": str(error), "backend": backend})
            return
        except RuntimeError as error:
            self.send_json(502, {"message": str(error), "backend": backend})
            return
        except Exception as error:  # noqa: BLE001
            self.send_json(500, {"message": f"PointGuard transcription failed: {error}", "backend": backend})
            return

        self.send_json(
            200,
            {
                "ok": True,
                "text": transcript["text"],
                "language": transcript.get("language") or "en",
                "duration": transcript.get("duration"),
                "usage": transcript.get("usage"),
                "backend": backend,
                "message": "Medical dictation audio transcribed successfully.",
            },
        )

    def handle_pointguard_realtime_session_request(self) -> None:
        backend = detect_pointguard_backend()
        if not backend["ready"]:
            self.send_json(
                503,
                {
                    "message": backend["message"],
                    "backend": backend,
                },
            )
            return

        try:
            payload = read_json_body(self)
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Realtime session payload must be valid JSON.", "backend": backend})
            return

        offer_sdp = str(payload.get("offerSdp") or "").strip()
        context = {
            "examType": str(payload.get("examType") or "").strip(),
            "indication": str(payload.get("indication") or "").strip(),
            "presentationContext": str(payload.get("presentationContext") or "").strip(),
            "language": str(payload.get("language") or "en").strip() or "en",
        }

        try:
            session = create_pointguard_realtime_session(offer_sdp, context)
        except ValueError as error:
            self.send_json(400, {"message": str(error), "backend": backend})
            return
        except RuntimeError as error:
            self.send_json(502, {"message": str(error), "backend": backend})
            return
        except Exception as error:  # noqa: BLE001
            self.send_json(
                500,
                {
                    "message": f"Could not establish the realtime transcription session: {error}",
                    "backend": backend,
                },
            )
            return

        self.send_json(
            200,
            {
                "ok": True,
                "sdp": session["sdp"],
                "model": session["model"],
                "backend": backend,
                "message": "Realtime transcription session is ready.",
            },
        )


def main() -> None:
    allow_http_fallback = str(os.environ.get("HAGRAD_ALLOW_HTTP") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    force_http = str(os.environ.get("HAGRAD_FORCE_HTTP") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    use_https = CERT_FILE.exists() and KEY_FILE.exists() and not force_http

    if not use_https and not (allow_http_fallback or force_http):
        raise SystemExit(
            "Missing certificate files.\n"
            "Run ./make-local-cert.command first, or set HAGRAD_ALLOW_HTTP=1 "
            "to run the local research viewer over http://localhost."
        )

    try:
        reindex_result = rebuild_all_export_indexes()
    except Exception as error:  # noqa: BLE001
        print(f"Export index rebuild skipped due to error: {error}")
    else:
        if reindex_result["folderCount"]:
            print(
                "Export index rebuild complete for "
                f"{reindex_result['folderCount']} folder"
                f"{'' if reindex_result['folderCount'] == 1 else 's'}."
            )

    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), HagradHandler)

    if use_https:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=str(CERT_FILE), keyfile=str(KEY_FILE))
        server.socket = context.wrap_socket(server.socket, server_side=True)

    scheme = "https" if use_https else "http"
    print(f"Serving {ROOT} at {scheme}://localhost:{PORT}")
    if not use_https:
        print("Local HTTP fallback active because no HTTPS certificate files were found.")
    print(f"Viewer + EAT AI backend available on the same local {scheme.upper()} server.")
    server.serve_forever()


if __name__ == "__main__":
    main()
