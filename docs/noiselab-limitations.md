# HAGRad NoiseLab Limitations and Future Work

## Current Limitations

- Multi-frame DICOM is not supported.
- Copy-to-all-series transfers ROIs by matching slice index and image-space geometry. It does not yet perform DICOM orientation/position-based slice matching or registration-aware transfer.
- In-app histogram and baseline profile visualization are implemented, and PNG figure export is implemented, but histogram/profile CSV export is not implemented yet.
- 2D NPS is implemented for complete power-of-two square ROIs in a single slice. It is not a 3D NPS workflow.
- NPS stationarity must be judged by the user; the app does not yet automatically reject structured or edge-contaminated NPS ROIs.
- Detrending and residual-profile metrics are not implemented yet.
- Advanced contamination warnings are not implemented yet.
- Overlay export is currently a whole-slice PNG with ROI overlay; dedicated zoom/composite manuscript panels are not implemented yet.

## Planned Next Steps

- Phase 2:
  - structured histogram exports
  - structured profile exports
  - NPS ROI contamination and stationarity checks
  - residual/detrended profile metrics
  - defensible heterogeneity and gradient warnings
- Phase 3:
  - optional profile spectral analysis
  - optional composite manuscript panels
  - optional homogeneous-ROI suggestions
  - optional multi-series comparison workflow
  - optional validated 2D noise power spectrum workflow
