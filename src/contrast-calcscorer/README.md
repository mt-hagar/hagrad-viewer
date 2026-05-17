# HAGRad Contrast CalcScorer

HAGRad Contrast CalcScorer is a separate research prototype for estimating calcified plaque burden
from post-contrast coronary CTA or contrast-enhanced cardiac CT.

It is intentionally isolated from the current HAGRad Viewer runtime and from the current
noncontrast HAGRad CalcScorer workflow.

## Clinical Honesty

- Standard Agatston scoring is defined on dedicated noncontrast calcium-scoring CT.
- This prototype is **not clinically validated**.
- On conventional single-energy CTA, calcium and iodine overlap in attenuation and cannot be
  perfectly separated by simple thresholding.
- For ordinary single-energy post-contrast CTA, outputs should be treated as
  **post-contrast research calcium score estimates** and **Agatston-style scores**, not standard
  Agatston scores.
- If the loaded series appears spectral, dual-energy, photon-counting, or VNC-like, the app can
  expose a more defensible **spectral/VNC-aware research branch**, but it is still labeled
  research-only unless independently validated.

## What Phase 1 Does

1. Load one study or folder of DICOM CT images.
2. Rank candidate series for post-contrast coronary CTA or cardiac CT review.
3. Show whether the series appears spectral, dual-energy, or VNC-capable from metadata and series
   text heuristics.
4. Let the user define the superior and inferior z-slices for the analysis slab.
5. Let the user pick reference ROIs on the image with circular sampling.
6. Let the user draw reference ROIs directly on the slice when a click-based circular ROI is not ideal.
7. Keep reference ROIs tied to the specific slice where they were sampled rather than scrolling through the stack.
8. Build a first-pass contrast-suppressed calcification candidate map.
9. Keep the resulting lesion mask fully editable with persistent manual overrides.
10. Show a synthetic iodine-suppressed research preview to visualize what the suppression model is trying to do.
11. Export a review PNG and CSV with per-category totals plus method metadata.

## Why Post-Contrast Calcium Scoring Is Difficult

Dedicated CAC scoring works because the acquisition is noncontrast and the classic thresholding
assumptions are reasonably well defined.

Post-contrast CTA is different:

- coronary lumen is intentionally bright because of iodine
- calcified plaque can be adjacent to or mixed with bright iodine
- fixed global thresholds do not generalize well across protocols, contrast timing, kV, iterative
  reconstruction, spectral reconstructions, and noise levels
- direct substitution of CTA thresholds for noncontrast Agatston rules can create both false
  positives and false negatives

That is why this prototype uses a transparent, reference-driven heuristic rather than claiming a
solved noncontrast-equivalent workflow on ordinary CTA.

## Phase 1 Method

### Conventional single-energy CTA branch

Phase 1 uses a heuristic contrast-suppressed candidate model:

- required references:
  - Aortic Root Contrast
  - Pulmonary Trunk Contrast
  - LM Coronary Lumen
  - Calcified Plaque Reference
- optional references:
  - Myocardium / Soft Tissue Background
  - Fat / Low-attenuation Background
  - Ascending Aorta Wall
  - Blood Pool Generic Reference
  - Noise Reference
- derive reference means and SD values from user-picked ROIs
- support both click-based circular ROIs and drawn polygon ROIs for references
- estimate a central cardiac search ROI automatically from body bounds
- inside the chosen z-slab, keep pixels only when they are:
  - above an adaptive intensity floor
  - sufficiently above contrast references
  - sufficiently above the local neighborhood
  - plausibly closer to the plaque reference than to the lumen reference
- remove very small connected components
- assign a first-pass vessel/category label heuristically
- preserve all manual relabel and exclusion edits after re-estimation

The exported `agatston_style_score` is intentionally not named standard Agatston for this branch.
It uses research-oriented density-factor bins on post-contrast residual intensity rather than
pretending that standard noncontrast density bins directly apply to ordinary CTA.

The exported `equivalent_mass_mg` is also approximate. In the conventional branch it is based on a
residual intensity integral above contrast background, not a phantom-validated clinical calcium mass.

### Synthetic iodine-suppressed preview

After estimation, the viewer can show a `Suppressed Preview` display mode.

- this is a synthetic research visualization, not a validated VNC image
- lumen-like iodine is pushed toward soft-tissue intensity
- pixels assigned to calcification are kept bright so the user can visually understand the residual model
- the review PNG includes a small inset of this preview

### Spectral / VNC-aware branch

If the selected series appears VNC-like or strongly spectral from metadata:

- the app labels the active branch explicitly
- the adaptive floor can be closer to VNC-style logic
- the confidence note becomes less pessimistic than ordinary CTA

Even then, the output remains research-only in this prototype.

## Editing Model

Phase 1 keeps the editing fast and simple:

- left click in `Assign / Draw` mode:
  - select/reassign an existing lesion
  - or add a manual lesion from a bright seed
- right click:
  - remove the clicked lesion or candidate
- left-drag in `Assign / Draw` mode:
  - include or relabel everything inside the drawn region
- left-drag in `Erase` mode:
  - erase everything inside the drawn region
- manual overrides persist across re-estimation

## Export

CSV export includes:

- `study_id`
- `vessel`
- `volume_mm3`
- `equivalent_mass_mg`
- `agatston_style_score`
- `method_type`
- `spectral_or_conventional`
- `confidence_note`
- serialized reference summary
- serialized residual parameters
- research warning text

The review PNG includes:

- the active axial image
- lesion overlay
- reference overlays
- per-category results
- method branch and research warning text

## Architecture

The prototype is kept separate under `src/contrast-calcscorer/` and is split into these layers:

- `constants.js`
  - workflow steps, labels, reference definitions, display presets, warnings
- `dicom.js`
  - DICOM header parsing, series grouping, CTA-focused candidate ranking, spectral/VNC detection,
    and pixel volume assembly
- `estimation.js`
  - ROI sampling, candidate map generation, override composition, connected components, and scoring
- `main.js`
  - UI state, rendering, interaction tools, workflow guidance, exports, and finish-close flow

## Public References That Informed The Prototype

### Primary literature

- Agatston et al. 1990
  - https://pubmed.ncbi.nlm.nih.gov/2407762/
- Bischoff et al. 2012, contrast-enhanced coronary CTA calcium quantification
  - https://pubmed.ncbi.nlm.nih.gov/22166591/
- Schuhbaeck et al. 2015, semiautomated standardized method on contrast CTA
  - https://pubmed.ncbi.nlm.nih.gov/26169700/
- Choi et al. 2016, dual-energy spectral CT virtual noncontrast feasibility for CAC
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC4842852/
- Wang et al. 2022, automated Agatston quantification on CCTA after deep-learning coronary
  segmentation
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC8899961/
- Yang et al. 2023, dual-layer spectral detector CT VNC CAC study
  - https://pubmed.ncbi.nlm.nih.gov/36937907/
- Black et al. 2024, dual-energy material decomposition calcium quantification simulation study
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC11258084/
- Sakuma 2024, editorial on photon-counting virtual noncontrast CAC
  - https://pubmed.ncbi.nlm.nih.gov/38530180/

### GitHub / open-source references reviewed

- DeepCAC
  - https://github.com/AIM-Harvard/DeepCAC
- CalciumScoring.jl
  - https://github.com/MolloiLab/CalciumScoring.jl
- SEGMENT-CACS
  - https://github.com/Berni1557/SEGMENT-CACS

## What I Did Not Find

I did **not** find a robust open-source ready-made workstation that already combines all of the
following in a clean browser workflow:

- post-contrast CTA series selection
- spectral/VNC-aware branch switching
- ROI reference cards with click-on-image sampling
- editable lesion masks
- vessel/category relabeling
- exportable research summaries

Public code exists for calcium scoring libraries and deep learning research pipelines, but not as a
drop-in interactive workstation for this exact workflow. That is why Phase 1 here stays grounded in
transparent heuristics plus strong manual editing.
