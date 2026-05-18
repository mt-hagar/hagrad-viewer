#!/usr/bin/env python3

from __future__ import annotations

import argparse
import pathlib
import shutil
import subprocess
import sys
import zipfile


ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_VERSION = "v0.9.0-research-preview"
PACKAGE_PREFIX = "hagrad-viewer"
PLATFORM_ASSETS = (
    "HAGRad-Viewer-macOS.zip",
    "HAGRad-Viewer-Windows.zip",
)


def run(command: list[str], cwd: pathlib.Path | None = None, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        check=True,
        text=True,
        capture_output=capture,
    )


def tool_path(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise SystemExit(
            f"Missing required command: {name}\n\n"
            "Install GitHub CLI and authenticate first:\n"
            "  gh --version\n"
            "  gh auth login\n"
        )
    return path


def validate_repo_name(repo: str) -> str:
    normalized = repo.strip().strip("/")
    if "/" not in normalized or normalized.count("/") != 1:
        raise SystemExit("Repository must be in OWNER/REPOSITORY form, for example mt-hagar/hagrad-viewer.")
    owner, name = normalized.split("/", 1)
    if not owner or not name:
        raise SystemExit("Repository must be in OWNER/REPOSITORY form, for example mt-hagar/hagrad-viewer.")
    return normalized


def ensure_release_bundles(version: str) -> list[pathlib.Path]:
    build_script = ROOT / "scripts" / "build_release_bundle.py"
    run([sys.executable, str(build_script), "--version", version, "--platform", "all"], cwd=ROOT)

    bundle = ROOT / "dist" / f"{PACKAGE_PREFIX}-{version}.zip"
    if not bundle.exists():
        raise SystemExit(f"Expected release bundle was not created: {bundle}")

    assets = [bundle]
    for asset_name in PLATFORM_ASSETS:
        asset = ROOT / "dist" / asset_name
        if not asset.exists():
            raise SystemExit(f"Expected release asset was not created: {asset}")
        assets.append(asset)

    return assets


def extract_clean_source(bundle: pathlib.Path, version: str) -> pathlib.Path:
    work_root = ROOT / ".release_work"
    package_dir = work_root / f"{PACKAGE_PREFIX}-{version.lstrip('v')}"

    if package_dir.exists():
        shutil.rmtree(package_dir)
    work_root.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(bundle, "r") as archive:
        archive.extractall(work_root)

    if not package_dir.exists():
        raise SystemExit(f"Could not find extracted package directory: {package_dir}")

    return package_dir


def ensure_github_ready() -> None:
    tool_path("git")
    tool_path("gh")
    try:
        run(["gh", "auth", "status"], capture=True)
    except subprocess.CalledProcessError as exc:
        output = (exc.stdout or "") + (exc.stderr or "")
        raise SystemExit(
            "GitHub CLI is installed but not authenticated.\n\n"
            "Please run:\n"
            "  gh auth login\n\n"
            f"GitHub CLI reported:\n{output.strip()}"
        ) from exc


def repo_exists(repo: str) -> bool:
    try:
        run(["gh", "repo", "view", repo, "--json", "nameWithOwner"], capture=True)
        return True
    except subprocess.CalledProcessError:
        return False


def create_repo_if_needed(repo: str, visibility: str) -> None:
    if repo_exists(repo):
        return

    visibility_flag = "--public" if visibility == "public" else "--private"
    run(
        [
            "gh",
            "repo",
            "create",
            repo,
            visibility_flag,
            "--description",
            "HAGRad Viewer research-preview cardiovascular imaging analysis suite.",
            "--disable-wiki",
        ]
    )


def remote_has_branches(repo: str) -> bool:
    remote_url = f"https://github.com/{repo}.git"
    result = run(["git", "ls-remote", "--heads", remote_url], capture=True)
    return bool(result.stdout.strip())


def prepare_git_source(package_dir: pathlib.Path, version: str) -> None:
    run(["git", "init"], cwd=package_dir)
    run(["git", "checkout", "-B", "main"], cwd=package_dir)
    run(["git", "config", "user.name", "HAGRad Release Builder"], cwd=package_dir)
    run(["git", "config", "user.email", "hagrad-release@example.local"], cwd=package_dir)
    run(["git", "add", "-A"], cwd=package_dir)
    run(["git", "commit", "-m", f"Release {version}"], cwd=package_dir)
    run(["git", "tag", "-a", version, "-m", f"HAGRad Viewer {version}"], cwd=package_dir)


def push_source(package_dir: pathlib.Path, repo: str) -> None:
    remote_url = f"https://github.com/{repo}.git"
    run(["git", "remote", "add", "origin", remote_url], cwd=package_dir)
    run(["git", "push", "-u", "origin", "main"], cwd=package_dir)
    run(["git", "push", "origin", "--tags"], cwd=package_dir)


def create_release(repo: str, version: str, assets: list[pathlib.Path], package_dir: pathlib.Path) -> None:
    try:
        run(["gh", "release", "view", version, "--repo", repo], capture=True)
        raise SystemExit(f"Release {version} already exists in {repo}. Please delete it manually or choose a new version.")
    except subprocess.CalledProcessError:
        pass

    notes_file = package_dir / "RELEASE_NOTES.md"
    run(
        [
            "gh",
            "release",
            "create",
            version,
            *(str(asset) for asset in assets),
            "--repo",
            repo,
            "--title",
            "HAGRad Viewer v0.9.0 Research Preview",
            "--notes-file",
            str(notes_file),
            "--prerelease",
        ],
        cwd=package_dir,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish the clean HAGRad research-preview bundle to GitHub.")
    parser.add_argument("--repo", required=True, help="GitHub repository in OWNER/REPOSITORY form.")
    parser.add_argument("--visibility", choices=["public", "private"], default="public")
    parser.add_argument("--version", default=DEFAULT_VERSION)
    args = parser.parse_args()

    repo = validate_repo_name(args.repo)
    version = str(args.version).strip() or DEFAULT_VERSION

    ensure_github_ready()
    assets = ensure_release_bundles(version)
    bundle = assets[0]
    package_dir = extract_clean_source(bundle, version)

    create_repo_if_needed(repo, args.visibility)
    if remote_has_branches(repo):
        raise SystemExit(
            f"Refusing to overwrite non-empty repository: {repo}\n\n"
            "Create a new empty repository or publish manually after reviewing the existing history."
        )

    prepare_git_source(package_dir, version)
    push_source(package_dir, repo)
    create_release(repo, version, assets, package_dir)

    print("")
    print("GitHub release created successfully.")
    print(f"Repository: https://github.com/{repo}")
    print(f"Release:    https://github.com/{repo}/releases/tag/{version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
