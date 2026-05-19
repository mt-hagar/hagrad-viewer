# HAGRad Viewer v0.9.0-research-preview

## Release Type

Research preview for local, non-commercial scientific use.

This release is intended to make HAGRad citable, downloadable, and testable by collaborators while keeping the research-use-only status explicit.

## Public Website Draft

This release bundle includes a static `website/` folder for a future HAGRad public landing page. The
page contains workflow summaries, research-use-only language, citation positioning, and configurable
macOS/Windows download buttons that can be connected to GitHub release assets.

## Included Apps

The downloadable release bundle includes the HAGRad local research suite, with the following core workflows available from the same local codebase:

- HAGRad Viewer
- HAGRad Image Quality / CCTA IQ
- HAGRad EAT Workflow
- HAGRad QCA

Older prototype launchers are not advertised as public entry points. They are retained only as developer legacy references under `legacy_launchers/retired_prototypes`.

## How To Run

On macOS:

1. Download and unzip the release bundle.
2. Open the folder.
3. Double-click `open-viewer-mac.command`.
4. HAGRad creates or refreshes a `HAGRad Viewer.app` Desktop launcher with the HAGRad icon.

On Windows:

1. Download and unzip the release bundle.
2. Open the folder.
3. Double-click `open-viewer-windows.bat`.
4. HAGRad creates or refreshes a `HAGRad Viewer` Desktop shortcut with the HAGRad icon.

The platform ZIP root contains only this opener plus the `HAGRad_support_files` folder. The main HAGRad Viewer contains the workflow buttons for Image Quality, EAT, and QCA. The old per-workflow launchers are intentionally not included in platform ZIP packages to avoid parallel app entry points.

## Important Notes

- HAGRad runs locally.
- DICOM files are loaded from the user's computer.
- Exports are written into the local `exports_outbox/` folder after use.
- The release bundle intentionally does not include local patient exports, project lists, certificates, caches, Python virtual environments, or AI model/tooling folders.

## Research-Use Notice

HAGRad is provided for research, education, technical development, and retrospective image analysis only. It is not a clinical product, not a medical device, and not intended for diagnosis, treatment decisions, or patient care.

See `DISCLAIMER.md` and `LICENSE.md` before use.

## Suggested Software Citation

HAGRad Viewer, version 0.9.0-research-preview. HAGRad contributors, 2026. Research-use software for local cardiovascular image analysis.

## Known Limitations

- Research preview, not clinically validated.
- Desktop/local browser workflow, not yet packaged as a signed standalone macOS app.
- Some companion workflows are prototypes and may change between releases.
- Users remain responsible for anonymization, local data governance, and institutional approval.
