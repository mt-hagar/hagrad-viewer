# HAGRad NoiseLab User Guide

## Current Workflow

1. Open NoiseLab with `open-noiselab.command`.
2. Load one DICOM series or drop a study folder onto the viewport.
3. Confirm the correct series is active in the `Study` panel. Click a series card, or use `Cmd/Ctrl + ↑/↓`, to switch between loaded reconstructions.
4. Navigate slices with the slider, arrow keys, mouse wheel, or right-mouse drag scrub.
5. Use HAGRad viewer mouse handling:
   - mouse wheel scrolls slices
   - `Cmd/Ctrl + wheel` zooms toward the cursor
   - click-and-hold the mouse scroll button / middle button to pan
   - right-mouse drag fast-scrolls through the stack
6. Use:
   - `W` for window/level
   - `Z` for zoom
   - `M` for pan
   - `R` for square ROI placement
   - `Esc` to return to `Select`
7. Choose `pixel-square` or `physical-square`.
8. Place ROIs with click-drag or one-click fixed placement.
9. Select an ROI, or right-click/right-drag an ROI, to inspect and edit geometry, move it, resize from handles, and review statistics.
10. In `Analysis Visuals`, choose one of the baseline profile representations:
   - horizontal center line
   - vertical center line
   - mean horizontal profile
   - mean vertical profile
11. Open the `Figures` page to review all generated analysis visuals collectively:
   - the line plot for the selected profile
   - the full-ROI histogram
   - the square ROI inclusion map
   - the derived strip showing the exact ordered signal and its mean-centered deviations
12. Use `NPS Rings` when a 2D noise power spectrum is required:
   - choose a power-of-two square ROI edge such as 32, 64, or 128 pixels
   - choose ring count, ROIs per ring, and equal ring spacing
   - choose `NPS Rings`, click the phantom center, drag outward to draw the ring radius, and release to generate concentric square NPS ROIs
   - `Use Image Center` remains available for a quick centered default layout
   - edit the active NPS center or ring settings and use `Regenerate Active Set` when the phantom diameter or placement needs adjustment
   - NoiseLab rejects NPS layouts where any NPS square would extend outside the source image
   - review the radial NPS curve, 2D NPS heatmap, variance closure, peak frequency, centroid frequency, and high-frequency fraction
13. If several reconstructions are loaded, use `Copy To All Series` to transfer the active-slice ROI geometry to every loaded series for reconstruction comparison.
14. Open the `Figures` page and review `Reconstruction Comparison`:
   - copied ROI groups are summarized across all loaded reconstructions
   - baseline is the source ROI when available
   - the comparison plot shows ROI SD per reconstruction
   - green bars indicate lower SD and amber bars indicate higher SD versus baseline
   - copied NPS sets are summarized in the export tables when valid NPS data exist
15. Enter both `research_study_ID` and `patient_study_ID`.
16. Export the Noise Analysis Bundle.

## Phase 1 ROI Notes

- Pixel-square mode keeps equal pixel counts in x and y.
- Physical-square mode requires Pixel Spacing and keeps equal edge length in mm.
- On anisotropic spacing, a physical square can produce a non-square pixel matrix.
- The ROI details panel allows exact numeric edits for center and size.
- Right-clicking a ROI opens direct edit, duplicate, delete, and copy-to-series actions.
- Right-dragging a ROI body moves it; right-dragging a ROI handle resizes it while preserving square geometry.
- NoiseLab blocks outside-source-image ROI placement and clamps edited ROIs to the visible source-image border so overlays and sampled pixels stay aligned.
- Copy-to-series uses DICOM patient-space center and nearest patient-position slice matching when geometry metadata are available. If metadata are incomplete, it falls back to proportional/image-space mapping and records that fallback in the copied ROI metadata.
- Reconstruction comparison is a source-pixel comparison, not a registration algorithm. It assumes copied ROIs refer to the same object or phantom location after user verification.
- Viewer mini-controls match the HAGRad interaction style: `↺` resets windowing and `⛶` recenters/fits the source image.

## Current Export Contents

- `roi_summary.csv`
- `roi_pixels.csv`
- `roi_pixels_matrix.json`
- `analysis_metadata.json`
- `README.md`
- one overlay PNG per ROI
- one histogram PNG per ROI
- one profile-curve PNG per baseline profile type per ROI
- one characterization PNG per baseline profile type per ROI
- `nps_summary.csv`
- `nps_radial.csv`
- `nps_matrix.json`
- one radial NPS curve PNG per NPS set
- one 2D NPS heatmap PNG per NPS set
- `reconstruction_noise_comparison.csv`
- `reconstruction_noise_comparison_summary.csv`
- `reconstruction_nps_comparison.csv`
- `reconstruction_nps_comparison_summary.csv`
- `reconstruction_comparison_metadata.json`
- `reconstruction_noise_comparison.png`

When multiple loaded series contain ROIs, per-series bundle files are prefixed with the series number and reconstruction label so raw pixel exports from different reconstructions do not overwrite each other.

## Current Limitations

- Multi-frame DICOM is not supported in this phase.
- In-app histogram and profile visualization are available, and the corresponding PNG figures are exported. Structured histogram/profile CSV export and detrending export are still planned follow-up work.
- NPS is implemented as a 2D single-slice local square-ROI workflow. It is not a 3D NPS workflow.
- NPS requires Pixel Spacing and complete power-of-two square ROI matrices.
- Advanced contamination warnings are not implemented yet.
