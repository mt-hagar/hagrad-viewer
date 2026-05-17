#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import pathlib
import zipfile


ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_VERSION = "v0.9.0-research-preview"

EXCLUDED_DIR_NAMES = {
    ".cert",
    ".git",
    ".idea",
    ".tooling",
    ".vscode",
    "__pycache__",
    "dist",
    "exports_outbox",
    "project_lists",
}

EXCLUDED_FILE_NAMES = {
    ".DS_Store",
    ".env",
    ".env.local",
    ".env.pointguard",
    ".Rhistory",
}

EXCLUDED_SUFFIXES = {
    ".pyc",
    ".pyo",
}


def should_include(path: pathlib.Path) -> bool:
    relative = path.relative_to(ROOT)
    parts = relative.parts

    if any(part in EXCLUDED_DIR_NAMES for part in parts[:-1]):
        return False

    if path.is_dir():
        return path.name not in EXCLUDED_DIR_NAMES

    if path.name in EXCLUDED_FILE_NAMES:
        return False

    if path.suffix in EXCLUDED_SUFFIXES:
        return False

    return True


def iter_release_files() -> list[pathlib.Path]:
    files: list[pathlib.Path] = []
    for path in ROOT.rglob("*"):
        if path.is_dir():
            continue
        if should_include(path):
            files.append(path)
    return sorted(files, key=lambda item: item.relative_to(ROOT).as_posix())


def write_zip(version: str, output: pathlib.Path) -> pathlib.Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    package_root = f"hagrad-viewer-{version.lstrip('v')}"
    files = iter_release_files()

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            relative = path.relative_to(ROOT)
            arcname = pathlib.PurePosixPath(package_root, relative.as_posix()).as_posix()
            info = zipfile.ZipInfo.from_file(path, arcname)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (path.stat().st_mode & 0xFFFF) << 16
            with path.open("rb") as file_handle:
                archive.writestr(info, file_handle.read(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

    return output


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a clean HAGRad GitHub release zip bundle.")
    parser.add_argument("--version", default=DEFAULT_VERSION, help="Release version or tag.")
    parser.add_argument("--output", default=None, help="Optional output zip path.")
    args = parser.parse_args()

    version = str(args.version).strip() or DEFAULT_VERSION
    output = pathlib.Path(args.output).expanduser() if args.output else ROOT / "dist" / f"hagrad-viewer-{version}.zip"
    if not output.is_absolute():
        output = ROOT / output

    release_path = write_zip(version, output)
    files = iter_release_files()
    size_mb = release_path.stat().st_size / (1024 * 1024)

    print(f"Created {release_path}")
    print(f"Included {len(files)} files")
    print(f"Bundle size {size_mb:.1f} MB")
    print("Excluded local exports, project lists, certificates, caches, tooling, and secrets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
