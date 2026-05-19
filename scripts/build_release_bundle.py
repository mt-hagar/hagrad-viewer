#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import pathlib
import zipfile


ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_VERSION = "v0.9.0-research-preview"
PACKAGE_PREFIX = "hagrad-viewer"

PLATFORM_PACKAGES = {
    "macos": {
        "filename": "HAGRad-Viewer-macOS.zip",
        "package_suffix": "macOS",
        "visible_launcher": "open-viewer-mac.command",
        "launcher_source": "HAGRad Viewer.command",
        "exclude_suffixes": {".bat", ".ico", ".ps1"},
        "exclude_names": {"README_WINDOWS.md"},
        "exclude_prefixes": {("legacy_launchers",), ("packaging", "windows")},
    },
    "windows": {
        "filename": "HAGRad-Viewer-Windows.zip",
        "package_suffix": "Windows",
        "visible_launcher": "open-viewer-windows.bat",
        "launcher_source": "HAGRad Viewer.bat",
        "exclude_suffixes": {".command", ".icns"},
        "exclude_names": set(),
        "exclude_prefixes": {("legacy_launchers",)},
    },
}

SUPPORT_DIR_NAME = "HAGRad_support_files"

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

LEGACY_PLATFORM_LAUNCHER_PREFIXES = (
    "open-",
)

EXCLUDED_SUFFIXES = {
    ".pyc",
    ".pyo",
}


def should_include(path: pathlib.Path, platform: str | None = None) -> bool:
    relative = path.relative_to(ROOT)
    parts = relative.parts

    if any(part in EXCLUDED_DIR_NAMES for part in parts[:-1]):
        return False

    if path.is_dir():
        return path.name not in EXCLUDED_DIR_NAMES

    if path.name in EXCLUDED_FILE_NAMES:
        return False

    if platform and path.name.startswith(LEGACY_PLATFORM_LAUNCHER_PREFIXES):
        return False

    if path.suffix in EXCLUDED_SUFFIXES:
        return False

    if platform:
        package = PLATFORM_PACKAGES[platform]
        if any(parts[: len(prefix)] == prefix for prefix in package["exclude_prefixes"]):
            return False
        if path.name in package["exclude_names"]:
            return False
        if path.suffix in package["exclude_suffixes"]:
            return False

    return True


def iter_release_files(platform: str | None = None) -> list[pathlib.Path]:
    files: list[pathlib.Path] = []
    for path in ROOT.rglob("*"):
        if path.is_dir():
            continue
        if should_include(path, platform=platform):
            files.append(path)
    return sorted(files, key=lambda item: item.relative_to(ROOT).as_posix())


def write_zip(version: str, output: pathlib.Path, platform: str | None = None) -> pathlib.Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    suffix = f"-{PLATFORM_PACKAGES[platform]['package_suffix']}" if platform else ""
    package_root = f"{PACKAGE_PREFIX}-{version.lstrip('v')}{suffix}"
    files = iter_release_files(platform=platform)

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        if platform:
            package = PLATFORM_PACKAGES[platform]
            launcher_source = ROOT / str(package["launcher_source"])
            launcher_name = str(package["visible_launcher"])
            arcname = pathlib.PurePosixPath(package_root, launcher_name).as_posix()
            info = zipfile.ZipInfo.from_file(launcher_source, arcname)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (launcher_source.stat().st_mode & 0xFFFF) << 16
            with launcher_source.open("rb") as file_handle:
                archive.writestr(info, file_handle.read(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

        for path in files:
            relative = path.relative_to(ROOT)
            if platform:
                relative = pathlib.PurePosixPath(SUPPORT_DIR_NAME, relative.as_posix())
            arcname = pathlib.PurePosixPath(package_root, relative.as_posix()).as_posix()
            info = zipfile.ZipInfo.from_file(path, arcname)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (path.stat().st_mode & 0xFFFF) << 16
            with path.open("rb") as file_handle:
                archive.writestr(info, file_handle.read(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

    return output


def default_output(version: str, platform: str | None = None) -> pathlib.Path:
    if platform:
        return ROOT / "dist" / PLATFORM_PACKAGES[platform]["filename"]
    return ROOT / "dist" / f"{PACKAGE_PREFIX}-{version}.zip"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build clean HAGRad GitHub release zip bundles.")
    parser.add_argument("--version", default=DEFAULT_VERSION, help="Release version or tag.")
    parser.add_argument("--output", default=None, help="Optional output zip path.")
    parser.add_argument(
        "--platform",
        choices=["source", *PLATFORM_PACKAGES.keys(), "all"],
        default="source",
        help="Bundle type to build.",
    )
    args = parser.parse_args()

    version = str(args.version).strip() or DEFAULT_VERSION

    if args.output and args.platform == "all":
        raise SystemExit("--output can only be used when building one bundle.")

    platforms: list[str | None]
    if args.platform == "all":
        platforms = [None, "macos", "windows"]
    elif args.platform == "source":
        platforms = [None]
    else:
        platforms = [args.platform]

    for platform in platforms:
        output = pathlib.Path(args.output).expanduser() if args.output else default_output(version, platform=platform)
        if not output.is_absolute():
            output = ROOT / output

        release_path = write_zip(version, output, platform=platform)
        files = iter_release_files(platform=platform)
        included_count = len(files) + (1 if platform else 0)
        size_mb = release_path.stat().st_size / (1024 * 1024)
        label = platform or "source"

        print(f"Created {release_path}")
        print(f"Bundle type {label}")
        print(f"Included {included_count} files")
        print(f"Bundle size {size_mb:.1f} MB")

    print("Excluded local exports, project lists, certificates, caches, tooling, and secrets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
