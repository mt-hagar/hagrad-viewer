# GitHub Release Checklist

## Target Release

- Version: `v0.9.0-research-preview`
- Release title: `HAGRad Viewer v0.9.0 Research Preview`
- Release type: pre-release / research preview

## Required Release Asset

Create the clean downloadable bundle:

```bash
python3 scripts/build_release_bundle.py
```

Expected output:

```text
dist/hagrad-viewer-v0.9.0-research-preview.zip
```

## One-Command GitHub Publish Helper

After installing and logging into GitHub CLI, publish the clean source snapshot and attach the release bundle:

```bash
python3 scripts/publish_github_release.py --repo OWNER/REPOSITORY --visibility public
```

For example:

```bash
python3 scripts/publish_github_release.py --repo YOUR_GITHUB_NAME/hagrad-viewer --visibility public
```

The helper creates the GitHub repository if it does not exist, refuses to overwrite a non-empty repository, pushes the clean release source, tags `v0.9.0-research-preview`, and creates a GitHub pre-release with the zip bundle attached.

## What The Bundle Includes

- Main HAGRad Viewer.
- HAGRad Image Quality / CCTA IQ.
- HAGRad EAT Workflow.
- HAGRad QCA.
- Companion research workflows currently present in the codebase.
- Shared assets, local vendor libraries, launcher commands, documentation, and backend scripts required for local operation.

## What The Bundle Excludes

- Local patient exports: `exports_outbox/`.
- Local project/session data: `project_lists/`.
- Local HTTPS certificates: `.cert/`.
- AI tooling, local Python environments, and model caches: `.tooling/`.
- Python caches and OS metadata.
- Local secrets such as `.env`, `.env.local`, and `.env.pointguard`.

## Suggested GitHub Release Body

Use the contents of `RELEASE_NOTES.md` as the release text.

## Before Publishing

- Confirm there is no identifiable patient data in the repository.
- Confirm local output folders are not committed.
- Confirm the zip bundle opens and contains `README.md`, `DISCLAIMER.md`, `LICENSE.md`, `start-server.command`, and the workflow launchers.
- Confirm `python3 scripts/serve_https.py` starts without syntax errors.
- Confirm GitHub CLI is installed: `gh --version`.
- Confirm GitHub CLI is logged in: `gh auth status`.
- Mark the release as a pre-release unless you decide it is ready for a stable public release.

## Suggested Tag

```text
v0.9.0-research-preview
```
