# HAGRad Viewer v0.9.0-research-preview

## Release Type

Research preview for local, non-commercial scientific use.

This release is intended to make HAGRad citable, downloadable, and testable by collaborators while keeping the research-use-only status explicit.

## Current Build Update

This build refreshes the HAGRad Viewer workflow shell and adds new research tools:

- Adds vessel profile and vascular diameter tools to the main HAGRad Viewer.
- Adds blooming and stenosis diameter measurements for coronary research workflows.
- Speeds up large DICOM/patient-study loading with guarded header and volume workers plus browser-safe fallbacks.
- Adds HAGRad Noise Power for CT phantom square ROI statistics, TTF metrics, circular NPS placement, multi-reconstruction NPS comparison, print-ready reporting, and reproducible ZIP export.
- Improves HAGRad Noise Power reconstruction ordering with drag handles and synchronized display/export order.
- Exports per-reconstruction 2D NPS heatmaps with shared color scaling and clearer figure names.
- Adds a Noise Power workflow-switch/unload guard so users are warned before leaving an open Noise Power study.
- Refines low-CNR TTFxy handling so measurable edge responses can still report available TTF metrics while carrying the TG-233 caution.
- Adds a shared HAGRad workflow switcher across the main Viewer, Image Quality / CCTA IQ, EAT, and QCA pages.
- Adds guard behavior before moving between workflows when a study appears to be open.
- Tightens immersive focus-shell spacing across the viewer and companion workflows.
- Hides native browser DICOM file inputs behind the polished HAGRad load buttons for a cleaner user-facing app.
- Refines the QCA presentation viewport for a cleaner, more balanced analysis workspace.
- Adds compact in-viewport controls for reset, focus, overlay labels, grid overlays, and applicable Presentation / 4-up MPR switching across the HAGRad workflows.
- Improves QCA presentation behavior with slimmer header controls, clearer viewport guidance, fixed overlay visibility behavior, and a simplified frame-lock workflow.
- Restores and fixes Noise Power reconstruction/series labels across analysis controls, reports, and exports.
- Streamlines Noise Power and workflow toolbar sizing so analysis controls stay readable in tighter viewports.
- Adds selectable Noise Power NPS heatmap series and fixes Noise Power series reorder/preferences behavior.
- Redesigns the EAT workflow sidebar and export report workspace with separate reconstruction controls, faster export previews, cleaner contour editing, and improved contour transfer/copy-to-reconstruction behavior.
- Adds EAT report radiation dose fields for research documentation.
- Aligns the EAT report color picker interaction with the Noise Power reporting workflow.
- Adds Image Quality / CCTA IQ series removal controls for cleaner multi-series review.
- Removes the extra left scrollbar gutter from Viewer and CCTA IQ layouts for cleaner horizontal alignment.
- Updates the public website positioning, support, and credits content.
- Updates public download guidance for macOS Gatekeeper and Windows SmartScreen prompts while the research-preview builds remain unsigned.

## Public Website Draft

This release bundle includes a static `website/` folder for a future HAGRad public landing page. The
page contains workflow summaries, research-use-only language, citation positioning, and configurable
macOS/Windows download buttons that can be connected to GitHub release assets.

## Included Apps

The downloadable release bundle includes the HAGRad local research suite, with the following core workflows available from the same local codebase:

- HAGRad Viewer
- HAGRad Image Quality / CCTA IQ
- HAGRad Noise Power
- HAGRad EAT Workflow
- HAGRad QCA

Older prototype launchers are not advertised as public entry points. They are retained only as developer legacy references under `legacy_launchers/retired_prototypes`.

## How To Run

On macOS:

1. Download `HAGRad-Viewer-macOS.dmg`.
2. Open the DMG.
3. Double-click `HAGRad Viewer.app`.
4. HAGRad starts the bundled local server and opens the main viewer in your browser.

On Windows:

1. Download and unzip `HAGRad-Viewer-Windows.zip`.
2. Double-click `HAGRad Viewer.exe`.
3. HAGRad starts the bundled local server and opens the main viewer in your browser.

The main HAGRad Viewer contains the workflow buttons for Image Quality / CCTA IQ, Noise Power, EAT, and QCA. The old per-workflow launchers are intentionally not included as public app entry points.

## Important Notes

- HAGRad runs locally.
- DICOM files are loaded from the user's computer.
- Packaged builds use `http://localhost:3020` when no local HTTPS certificate is available, so normal users do not need OpenSSL.
- Packaged builds do not require users to install Python.
- Exports are written into local user storage after use.
- The release bundle intentionally does not include local patient exports, project lists, certificates, caches, Python virtual environments, or AI model/tooling folders.

## Research-Use Notice

HAGRad is provided for research, education, technical development, and retrospective image analysis only. It is not a clinical product, not a medical device, and not intended for diagnosis, treatment decisions, or patient care.

See `DISCLAIMER.md` and `LICENSE.md` before use.

## Suggested Software Citation

HAGRad Viewer, version 0.9.0-research-preview. HAGRad contributors, 2026. Research-use software for local cardiovascular image analysis.

## Known Limitations

- Research preview, not clinically validated.
- macOS developer builds can be unsigned. Public macOS distribution should use Developer ID signing and notarization.
- Some companion workflows are prototypes and may change between releases.
- Users remain responsible for anonymization, local data governance, and institutional approval.
