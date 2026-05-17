# HAGRad QCA

QCA here means quantitative coronary angiography.

## Scope

HAGRad QCA is a separate research prototype for invasive coronary angiography.
It is intentionally isolated from the current HAGRad Viewer runtime and focuses on one workflow:

1. Load an XA cine or frame series from DICOM.
2. Scroll through frames and lock the best still frame.
3. Calibrate the selected frame with a known object when trustworthy absolute diameters matter.
4. Place vessel anchor points on that still frame.
5. Run semi-automatic vessel centerline and border detection.
6. Manually edit centerline, borders, and lesion limits.
7. Export the analyzed still image and QCA result table.

It is not a validated commercial QCA system and is not trying to replace 3Mensio, CAAS, or Medis.

## Phase Plan

### Phase 1

- DICOM cine and image-series loading
- Frame scrubbing and still-frame selection
- Manual same-frame calibration using a known object
- User-guided single-vessel segmentation on one frame
- Editable centerline and vessel borders
- Heuristic 2D QCA outputs:
  - minimal lumen diameter
  - reference diameter
  - percent diameter stenosis
  - lesion length
- PNG and CSV export

### Phase 2

- More robust centerline tracking across difficult bends and overlap
- Better border refinement and contour regularization
- Branch and bifurcation handling
- Stronger study labeling and export structure
- Optional frame-to-frame similarity guidance for better still-frame picking

### Phase 3

- Optional AI-assisted vessel segmentation if the dataset, licensing, and validation path are realistic
- Sidecar inference mode rather than embedding a fragile dependency into the browser app
- Evaluation against public XCA datasets before clinical-style claims

## Architecture

### App shell

- Separate browser app under `src/qca/`
- Served by the same static HTTPS server as the other HAGRad apps
- No shared mutable runtime with `src/viewer.js`

### Runtime layers

1. DICOM ingestion
   - Parse headers locally with `dicomParser`
   - Group by series
   - Support single-file multi-frame runs and multi-file single-frame series
   - Decode frames lazily so scrubbing remains responsive

2. Analysis state
   - Keep preview frame and locked analysis frame separate
   - Store vessel anchors, centerline controls, border controls, lesion limits, and measurements in one frame-bound state object

3. Render and interaction
   - One base image canvas plus one overlay canvas
   - One lesion profile canvas for diameter review and lesion-limit editing
   - Export merged image and CSV directly in-browser

### Phase 1 segmentation approach

Phase 1 intentionally uses a classical semi-automatic approach instead of promising a production-grade AI system:

- user-defined proximal and distal anchors, with optional intermediate anchor points
- shortest-path centerline between anchors on an anchor-guided intensity cost map
- profile-based border detection along normals to the centerline
- manual editing of centerline and border control points afterward

This keeps the first version explainable, editable, and realistic for research iteration.

## Most Relevant Open References

1. AngioPy Segmentation
   - Paper: https://doi.org/10.1016/j.ijcard.2024.132598
   - Code: https://gitlab.com/epfl-center-for-imaging/angiopy/angiopy-segmentation
   - Why it matters: closest public example of user-guided coronary angiography vessel segmentation for QCA-style measurements

2. AngioNet
   - Paper: https://doi.org/10.1038/s41598-021-97355-8
   - Code: https://github.com/kritiyer/AngioNet
   - Why it matters: strong open deep-learning baseline for X-ray angiography vessel segmentation

3. ARCADE dataset
   - Scientific Data descriptor: https://doi.org/10.1038/s41597-023-02871-z
   - Dataset record: https://doi.org/10.5281/zenodo.10390295
   - Why it matters: public benchmark for X-ray coronary angiography learning and evaluation work

These are most useful for later AI-assisted phases and benchmarking. Phase 1 remains a transparent, user-correctable classical prototype.
