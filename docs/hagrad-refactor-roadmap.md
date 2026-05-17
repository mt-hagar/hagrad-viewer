# HAGRad Refactor Roadmap

## Current Snapshot

- Total application source size inspected: about `46k` lines across `src/` and `scripts/`
- Largest frontend files:
  - `src/viewer.js`: `9178` lines
  - `src/coronary/coronary.js`: `8173` lines
  - `src/eat.js`: `7186` lines
  - `src/qca/qca.js`: `6128` lines
  - `src/pointguard/pointguard.js`: `3866` lines
- Backend files:
  - `scripts/serve_https.py`: `1840` lines
  - `scripts/serve_coronary_https.py`: `518` lines
  - `scripts/run_eat_backend_pipeline.py`: `853` lines
  - `scripts/run_coronary_backend_pipeline.py`: `527` lines
- Tooling status:
  - no test suite found
  - no lint config found
  - no build config found
  - browser apps are currently served as plain local files over HTTPS

## Current Score

- `76/100` overall
- `83/100` as a custom research prototype
- `67/100` as a maintainable codebase
- `35/100` as a production-grade clinical product

## Why The Score Is Not Higher

- The product scope is strong, but the code is concentrated in several very large monolithic files.
- Rendering, UI state, annotation state, export logic, and DICOM handling are heavily interwoven.
- There is no automated test layer protecting measurement logic or export schemas.
- The application now has enough features that regressions are likely unless structure improves.

## Goal: Move From 76 To 90

The main strategy is:

1. reduce monolith size
2. isolate pure logic
3. protect core calculations with lightweight tests
4. stabilize rendering and layout behavior
5. make export schemas explicit and durable

## Phase 1: Safe Structural Refactor

This phase should improve maintainability without changing the visual product too much.

### Status

- In progress
- Completed first slice on 2026-03-29:
  - extracted shared profile-analysis logic to `src/shared/hagrad-profile-analysis.js`
  - rewired both `src/viewer.js` and `src/coronary/coronary.js` to use the shared module
  - added a repeatable smoke check at `scripts/smoke_profile_analysis.jxa`

### 1. Extract Pure Utility Modules First

Start with code that is mostly pure and low-risk:

- `src/viewer-lib/math.js`
  - vector math
  - angle helpers
  - clamp / interpolation helpers
  - geometry helpers used by viewer overlays

- `src/viewer-lib/format.js`
  - text formatting
  - display names
  - measurement type labels
  - metric formatting helpers

- `src/viewer-lib/profile-analysis.js`
  - profile sampling helpers that do not touch the DOM directly
  - smoothing
  - derivative construction
  - stent model analysis
  - FWHM and 10-90 calculations

- `src/viewer-lib/export-schema.js`
  - measurement CSV header definitions
  - baseline CSV header definitions
  - row builders
  - CSV serialization helpers

### 2. Keep The Browser Entry Files Thin

Target shape:

- `src/viewer.js`
  - DOM wiring
  - event bindings
  - top-level state transitions
  - render scheduling

- `src/eat.js`
  - EAT workflow orchestration only

- `src/coronary/coronary.js`
  - coronary workflow orchestration only

- `src/qca/qca.js`
  - QCA workflow orchestration only

The detailed analysis logic should move out of these entry files.

### 3. Create A Small Shared Library Folder

Add:

- `src/shared/`
  - DICOM helper parsing
  - file grouping helpers
  - common CSV download helpers
  - common annotation cloning helpers where reuse makes sense

This should reduce duplication between viewer, EAT, coronary, and QCA.

### 4. Add Lightweight Regression Checks

Because there is no build pipeline, the first test layer should be simple and local:

- a small Python or browser-compatible smoke check for:
  - syntax parsing of the main JS files
  - export schema stability
  - profile-analysis correctness on fixed synthetic inputs

Minimum first tests:

- line-profile analysis returns separate results for separate annotations
- FWHM and 10-90 metrics stay stable for a known synthetic curve
- measurement CSV contains one row per annotation
- annotation clone helpers preserve custom fields such as guide adjustments

### 5. Normalize Export Schemas

Make explicit schemas for:

- measurements
- baseline characteristics
- EAT exports
- QCA exports

Each schema should have:

- a fixed header order
- one row per entity
- stable field names
- documented units

## Phase 2: Rendering And State Stabilization

### 1. Split Image Rendering From Overlay Rendering

Goal:

- image canvas updates only when image state changes
- overlay canvas updates when annotations or crosshairs change

This should reduce redraw work and make interaction smoother.

### 2. Separate State Domains

Recommended domains:

- image/volume state
- viewport state
- annotation state
- export state
- sidebar/UI state

This will make layout bugs and sidebar-induced viewport changes much easier to control.

### 3. Stabilize Resize Behavior

Define clear rules for:

- when zoom should stay fixed
- when fit-to-window should rerun
- when sidebar changes must not affect canvas transform

## Phase 3: Product Hardening

### 1. Add Real Dev Tooling

- lint config
- formatting rules
- scriptable smoke checks
- optional small build step if modules grow further

### 2. Add More Durable Testing

- export regression tests
- annotation manipulation tests
- profile-analysis tests
- selected workflow smoke tests for viewer, EAT, coronary, and QCA

### 3. Standardize Shared UX Patterns

- same shortcut behavior style across apps
- same annotation naming rules
- same export button behavior
- same sidebar/section behavior

## Best First Implementation Slice

The most practical first slice is:

1. extract `profile-analysis`
2. extract `format/export schema helpers`
3. add a small smoke test for those pure modules

Why this slice first:

- it improves correctness
- it reduces the biggest viewer.js risk area
- it protects measurement logic, which is core to research use

## Success Criteria For Phase 1

- `viewer.js` is materially smaller
- at least one pure analysis module exists outside the entry file
- at least one export schema module exists outside the entry file
- a repeatable smoke/test command exists
- no visible workflow regressions for core viewer tasks
