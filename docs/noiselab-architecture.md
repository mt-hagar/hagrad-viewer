# HAGRad NoiseLab Architecture Note

## Positioning

HAGRad NoiseLab is a separate HAGRad app that shares only low-risk infrastructure:

- local HTTPS serving on `https://localhost:3020`
- vendor DICOM decoding libraries already used elsewhere
- shared helper modules under `src/shared`
- mirrored export outbox behavior

It does not modify the existing HAGRad Viewer, CCTA IQ, CalcScorer, Coronary, QCA, Stent, EAT, or PointGuard runtime paths.

## Current Modules

- `src/shared/hagrad-dicom.js`
  - DICOM header parsing
  - source pixel decoding
  - series grouping
  - volume assembly
  - patient/local coordinate helpers
- `src/noiselab/noiselab-core.js`
  - square ROI geometry
  - pixel extraction from source data
  - statistical summaries
  - square-to-profile visualization data models
  - concentric NPS ROI generation
  - source-pixel 2D FFT NPS analysis and radial averaging
  - reconstruction-comparison grouping for copied ROIs and copied NPS sets
  - CSV and JSON bundle serialization
- `src/noiselab/noiselab-export.js`
  - source-data-based overlay figure generation
  - scientific canvas renderers for profile plots, histograms, ROI matrices, and derived signal strips
  - PNG export helpers for overlay, histogram, profile, characterization, radial NPS, 2D NPS, and reconstruction-comparison figures
- `src/noiselab/noiselab.js`
  - UI state
  - viewport interaction
  - separate Viewer and Figures workspace pages so figure rendering does not shift the DICOM viewport
  - ROI editing workflow
  - ROI context-menu actions for exact editing, duplication, deletion, and reconstruction transfer
  - selected-ROI analysis visualization orchestration
  - copied-ROI reconstruction-comparison visualization
  - concentric NPS tool orchestration
  - active NPS set regeneration from explicit center, ROI size, ring count, ROI count, and ring spacing inputs
  - NPS click-drag placement: user selects the center and draws the intended phantom/ring radius before ROIs are generated
  - NPS layout validation that prevents accepting source-image-boundary-crossing NPS squares
  - export orchestration

## Coordinate Model

- UI interactions are converted into image coordinates measured at pixel centers.
- Integer image coordinates correspond to pixel centers.
- Half-integer image coordinates correspond to pixel edges.
- Pixel-square ROIs are constrained in pixel space.
- Physical-square ROIs are constrained in millimeters using Pixel Spacing.
- ROI placement, movement, resizing, and numeric edits are constrained to the source image matrix; the rendered source boundary is shown in the viewport.
- ROI analysis never samples screen pixels when source pixels are available.
- Multi-series ROI transfer uses DICOM patient-space center coordinates and nearest patient-position slice matching when metadata are available. It falls back to proportional/image-space mapping only when required metadata are absent.
- Reconstruction comparison is dataset-aware: each ROI is analyzed against the source pixel matrix of its own loaded reconstruction, then copied ROI groups are compared by baseline deltas and ratios.

## Export Model

- Export is bundle-first, not screenshot-first.
- Raw pixel tables and matrix JSON are serialized directly from the source pixel matrix.
- Overlay, histogram, profile, and characterization PNGs are supplemental figure exports derived from the same source-pixel analysis objects used for the numeric results.
- NPS exports include `nps_summary.csv`, `nps_radial.csv`, `nps_matrix.json`, a radial NPS curve PNG, and a 2D NPS heatmap PNG per NPS set.
- Reconstruction comparison exports include ROI SD/variance deltas and ratios, lowest/highest noise summaries, copied NPS set comparisons, comparison metadata, and a summary PNG.
- When multiple loaded series contain ROIs, per-series raw bundle files are prefixed by series index and reconstruction label so files from different reconstructions do not overwrite each other.
- Files are mirrored into `exports_outbox/noiselab/<research_study_ID>/<patient_study_ID>/...`.

## Testing Model

- Pure geometry/stat/export logic is exposed through `src/noiselab/noiselab-core.js`.
- JXA and Python harnesses run deterministic synthetic tests without introducing Node or a build step.
- The NPS test checks a synthetic sinusoidal square ROI and verifies integrated NPS closes to ROI variance.
- The reconstruction-comparison test uses two synthetic reconstructions where the copied ROI has exactly doubled SD, verifying exported noise ratios.

## Planned Phase 2

- structured histogram exports
- structured profile exports
- detrending and residual metrics
- ROI contamination warnings beyond boundary and size checks

## Planned Phase 3

- optional profile spectral analysis
- optional composite paper figure panels
- optional rigorous 2D NPS workflow if implemented as a separate validated path
