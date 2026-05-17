# HAGRad PointGuard Week 1 Refactor Plan

## Week 1 Goal

Make PointGuard safer to change without changing its clinical-facing behavior.

This week is intentionally about structure and validation first:

1. add repeatable regression coverage
2. create stable developer hooks for the report engine
3. define the file boundaries for the later module split

## Current PointGuard Files

- `src/pointguard/index.html`
  - standalone PointGuard shell
- `src/pointguard/pointguard.css`
  - full PointGuard presentation layer
- `src/pointguard/pointguard.js`
  - currently the main monolith:
    - DOM wiring
    - dictation workflow
    - speech fallback logic
    - coronary parsing
    - CAD-RADS logic
    - recommendation logic
    - report assembly
    - rendering
- `scripts/serve_https.py`
  - local HTTPS host plus PointGuard dictation backend routes

## Pain Points To Reduce In Week 1

- `pointguard.js` is still the single concentration point for nearly all application behavior.
- There is no repeatable regression command protecting report wording and CAD-RADS outputs.
- There is no explicit developer-facing harness for fixed dictation examples.

## Files Added In This Pass

- `src/pointguard/fixtures/regression-cases.json`
  - de-identified regression corpus for PointGuard report generation
- `scripts/pointguard_regression_check.py`
  - local macOS regression harness that runs PointGuard against the fixed fixtures

## Safe Step Added In This Pass

- `src/pointguard/pointguard.js`
  - installs `window.__POINTGUARD_DEV__`
  - exposes:
    - `analyzeCase(...)`
    - `getSnapshot()`
    - `getSampleCases()`

This keeps the user-facing app unchanged while giving the refactor a stable evaluation hook.

## Week 1 File-By-File Implementation Sequence

### Step 1: Lock behavior with fixtures

- `src/pointguard/fixtures/regression-cases.json`
  - keep adding canonical cases
  - include normal, nonobstructive, obstructive, nondiagnostic, stent, CABG, anomaly, and noisy-dictation examples
- `scripts/pointguard_regression_check.py`
  - run before and after each refactor slice
  - keep assertions focused on:
    - CAD-RADS label
    - plaque burden
    - major section wording
    - leakage of colloquial/noisy transcript text

### Step 2: Split pure analysis from UI orchestration

Create these future browser files under `src/pointguard/app/`:

- `src/pointguard/app/pointguard-config.js`
  - exam types
  - vessel configs
  - SCCT segment maps
  - static label libraries

- `src/pointguard/app/pointguard-text.js`
  - text normalization
  - clause splitting
  - sentence cleanup
  - formatting helpers

- `src/pointguard/app/pointguard-analysis.js`
  - `buildAnalysis(...)`
  - stenosis extraction
  - plaque burden derivation
  - modifier extraction
  - CAD-RADS assembly

- `src/pointguard/app/pointguard-report.js`
  - section builders
  - impression assembly
  - recommendation wording
  - final report formatting

### Step 3: Split workflow and rendering

Create these future browser files under `src/pointguard/app/`:

- `src/pointguard/app/pointguard-dictation.js`
  - realtime dictation
  - upload transcription fallback
  - browser speech fallback

- `src/pointguard/app/pointguard-render.js`
  - summary cards
  - tables
  - structured section rendering
  - final report output sync

- `src/pointguard/app/pointguard-dom.js`
  - DOM caching
  - event binding
  - keyboard shortcuts

- `src/pointguard/app/pointguard-bootstrap.js`
  - app startup and wiring

### Step 4: Split backend responsibilities

Create these future backend files under `scripts/pointguard_backend/`:

- `scripts/pointguard_backend/config.py`
  - OpenAI and PointGuard configuration
- `scripts/pointguard_backend/openai_client.py`
  - transcription and realtime API calls
- `scripts/pointguard_backend/http_api.py`
  - PointGuard HTTP request handlers

The short-term goal is to move PointGuard-specific backend code out of the larger `serve_https.py` file without changing the local server model.

## Week 1 Success Criteria

- PointGuard has a repeatable regression command.
- At least one stable developer API exists for exercising the report engine.
- The future module boundaries are defined clearly enough that extraction can happen incrementally.
- Refactors can be checked against known cardiac CT fixture cases before and after each change.
