# HAGRad Architecture Refactor Plan

## Goal

Raise the app from a strong prototype into a more maintainable platform without adding a build step.

The browser apps should continue to run as static HTTPS pages served from `localhost`, with plain
script tags loaded in order.

## Current Pain Points

- `src/viewer.js` is a large monolith that mixes state, UI, DICOM ingestion, rendering, geometry,
  annotations, export, and workflow behavior.
- `src/coronary/coronary.js` repeats many of the same helper layers and has grown into its own
  monolith.
- Shared logic is duplicated across the main viewer and workflow apps.
- There is no stable contract layer between frontend workflow logic and backend payload import.
- There is no visible automated test harness yet for geometry, measurements, or backend contracts.

## Target File Boundaries

### Shared browser core

- `src/shared/hagrad-core.js`
  - pure helpers used by multiple apps
  - string, numeric, vector, date/time, and timing helpers
- `src/shared/hagrad-dicom.js`
  - DICOM header parsing helpers
  - volume geometry helpers
  - world/voxel conversion helpers
- `src/shared/hagrad-render.js`
  - shared viewport rendering utilities
  - overlay primitives
  - export helpers
- `src/shared/hagrad-annotations.js`
  - annotation model helpers
  - cloning, hit-testing primitives, geometry helpers

### Main viewer modules

- `src/viewer/app-state.js`
- `src/viewer/viewer-dicom.js`
- `src/viewer/viewer-render.js`
- `src/viewer/viewer-annotations.js`
- `src/viewer/viewer-projects.js`
- `src/viewer/viewer-events.js`
- `src/viewer/viewer-bootstrap.js`

### Coronary workflow modules

- `src/coronary/coronary-state.js`
- `src/coronary/coronary-backend.js`
- `src/coronary/coronary-segmentation.js`
- `src/coronary/coronary-analysis.js`
- `src/coronary/coronary-render.js`
- `src/coronary/coronary-events.js`
- `src/coronary/coronary-bootstrap.js`

### Backend modules

- `scripts/coronary_backend/tooling.py`
- `scripts/coronary_backend/http_api.py`
- `scripts/coronary_backend/jobs.py`
- `scripts/coronary_backend/pipeline.py`
- `scripts/coronary_backend/vmtk_utils.py`

## Refactor Sequence

### Phase 1: Shared core extraction

1. Extract duplicated pure helpers into `src/shared/hagrad-core.js`.
2. Load the shared core before `src/viewer.js` and `src/coronary/coronary.js`.
3. Replace duplicated helper implementations in both apps with shared imports.
4. Keep runtime behavior unchanged.

### Phase 2: Shared DICOM and geometry extraction

1. Move world/voxel transforms and volume geometry helpers into `src/shared/hagrad-dicom.js`.
2. Move common viewport math into `src/shared/hagrad-render.js`.
3. Update the main viewer and coronary workflow to consume those modules.

### Phase 3: Coronary workflow split

1. Break `src/coronary/coronary.js` into state, backend, segmentation, analysis, render, and events files.
2. Keep `src/coronary/index.html` on ordered script tags instead of introducing bundling.
3. Add a small `coronary-bootstrap.js` that wires the modules together.

### Phase 4: Viewer split

1. Apply the same ordered-script split to the main viewer.
2. Extract annotation and export helpers into shared layers where stable.

### Phase 5: Reliability

1. Add backend smoke tests for the JSON payload contract.
2. Add frontend geometry and measurement unit tests.
3. Add at least one browser smoke test for the 2-point coronary workflow.

## Started In This Pass

- Added `src/shared/hagrad-core.js`
- Began consuming it from:
  - `src/viewer.js`
  - `src/coronary/coronary.js`
- Added ordered script loading for the shared core in:
  - `src/viewer.html`
  - `src/coronary/index.html`

This is intentionally the lowest-risk starting point for the architecture cleanup.
