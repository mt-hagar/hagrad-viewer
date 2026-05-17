# HAGRad CalcScorer

HAGRad CalcScorer is a separate research prototype for coronary artery calcium (CAC) scoring on
cardiac CT.

It is intentionally isolated from the current HAGRad Viewer runtime and should be treated as an
exploratory workstation, not a clinically validated product.

## Intended Input

- Preferred input: non-contrast ECG-gated cardiac CT for calcium scoring
- Supported Phase 1 input: a DICOM CT series with axial images and usable pixel spacing
- If multiple series are loaded, the app ranks likely CAC candidates and explains why one series is
  recommended

## Phase Plan

### Phase 1

- Study and series loading
- Series suitability ranking for calcium-scoring CT
- Axial slice review
- Automatic browser-side calcium scoring immediately after the selected series loads
- Editable lesion mask workflow
- EAT-inspired heart ROI anchors with contour drawing and anchor interpolation between slices
- Total score outputs:
  - Agatston score
  - calcium volume
  - equivalent mass
- CSV export with `UNASSIGNED` and `TOTAL` rows
- Review overlay PNG export

### Phase 2

- Vessel assignment for LAD, LCx, and RCA, with optional LM
- Editable vessel relabeling
- Per-vessel summary table and exports
- Stronger heuristics for coronary-versus-aortic/valvular separation

### Phase 3

- Sidecar AI inference for lesion and vessel attribution when the validation path is realistic
- Better QA checks and review summaries
- More robust lesion-vessel attribution
- Cleaner follow-up workflow for research datasets

## Phase 1 Method

Phase 1 deliberately uses transparent scoring logic instead of promising production-grade
automation.

### Detection

- Threshold-based candidate detection with a default threshold of `130 HU`
- Automatic first-pass scoring immediately after series load
- EAT-inspired heart ROI workflow:
  - draw contour anchors on key slices
  - interpolate ROI contours between anchors
  - rerun automatic calcium scoring inside the heart ROI
- Fallback central cardiac search region when ROI contours are not yet defined
- User-adjustable fallback search region and threshold
- Slice-level connected-component cleanup using a minimum lesion area threshold
- Fully editable final binary lesion mask

### Editing

- Draw or redraw heart ROI contours on selected slices
- Use anchor slices to constrain the heart ROI like the EAT workflow
- Inspect lesion
- Exclude entire lesion
- Brush add on the current slice
- Brush erase on the current slice
- Grow or shrink a lesion on the current slice
- Re-run detection after threshold or search-region changes

### Agatston logic

The implementation follows the standard Agatston-style slice-based workflow:

- include pixels at or above the selected threshold
- identify connected lesions on each slice
- keep lesions with area `>= 1 mm2`
- compute lesion area in `mm2`
- assign density factor by peak HU:
  - `130-199 HU -> 1`
  - `200-299 HU -> 2`
  - `300-399 HU -> 3`
  - `>= 400 HU -> 4`
- lesion Agatston score = `area_mm2 * density_factor`
- total Agatston score = sum of slice lesion scores

### Volume logic

- `volume_mm3 = counted_voxels * voxel_volume_mm3`

### Equivalent mass logic

Phase 1 reports an **equivalent mass** rather than a phantom-calibrated absolute calcium mass.

- default calibration factor: `0.81`
- formula:
  - `equivalent_mass_mg = calibration_factor * sum(HU * voxel_volume_mm3) / 1000`

This is an approximation intended for research iteration. It should not be interpreted as a
phantom-validated clinical mass score unless a proper calibration workflow is added.

## Why Phase 1 Stops Short Of Vessel Scoring

Public references are helpful for scoring engines and research inference pipelines, but I did not
find a ready-made public workstation that cleanly provides:

- non-contrast CAC detection
- interactive lesion editing
- reliable LAD/LCx/RCA attribution
- browser-native review tools

That is why Phase 1 focuses on a solid editable total-score prototype first.

## Relevant References

- Agatston-style scoring origin:
  [Quantification of coronary artery calcium using ultrafast computed tomography](https://pubmed.ncbi.nlm.nih.gov/2407762/)
- CAC-DRS primer with vessel examples, `130 HU` threshold, and a shown mass calibration factor of
  `0.81`:
  [Coronary Artery Calcium Data and Reporting System (CAC-DRS): A Primer](https://pubmed.ncbi.nlm.nih.gov/36693339/)
- DeepCAC research pipeline:
  [DeepHeartRO / DeepCAC GitHub repository](https://github.com/AIM-Harvard/DeepHeartRO)
- Julia calcium scoring library:
  [CalciumScoring.jl](https://github.com/MolloiLab/CalciumScoring.jl)
- Segment-level non-contrast CAC model and code:
  [SEGMENT-CACS GitHub repository](https://github.com/Berni1557/SEGMENT-CACS/tree/main)
- CCTA paper showing per-vessel automated CAC quantification after deep-learning coronary
  segmentation:
  [An automated quantification method for the Agatston coronary artery calcium score on coronary computed tomography angiography](https://pubmed.ncbi.nlm.nih.gov/35284280/)
