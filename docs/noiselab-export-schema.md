# HAGRad NoiseLab Export Schema

## `roi_summary.csv`

Required Phase 1 fields:

- `research_study_id`
- `patient_study_id`
- `study_id`
- `series_id`
- `sop_instance_uid`
- `slice_index`
- `roi_id`
- `roi_label`
- `roi_type`
- `square_mode`
- `copied_from_roi_id`
- `copied_from_dataset_id`
- `copy_mapping_method`
- `copy_slice_mapping_method`
- `copy_slice_distance_mm`
- `copy_size_mapping_method`
- `roi_center_x_img`
- `roi_center_y_img`
- `roi_x_min_img`
- `roi_y_min_img`
- `roi_x_max_img`
- `roi_y_max_img`
- `roi_edge_px`
- `roi_edge_mm`
- `pixel_spacing_x_mm`
- `pixel_spacing_y_mm`
- `area_px`
- `area_mm2`
- `mean_raw`
- `mean_calibrated`
- `sd_raw`
- `sd_calibrated`
- `median_raw`
- `median_calibrated`
- `iqr_raw`
- `iqr_calibrated`
- `min_raw`
- `min_calibrated`
- `max_raw`
- `max_calibrated`
- `range_raw`
- `range_calibrated`
- `coefficient_of_variation`
- `mad`
- `skewness`
- `kurtosis`
- `touches_boundary_flag`
- `too_small_flag`
- `high_gradient_overlap_flag`
- `heterogeneity_warning_flag`
- `homogeneity_score`
- `analysis_timestamp`
- `app_version`
- `export_version`

Additional Phase 1 clarifying fields:

- `roi_edge_px_x`
- `roi_edge_px_y`
- `roi_edge_mm_x`
- `roi_edge_mm_y`
- `selected_rows`
- `selected_cols`
- `patient_x_mm`
- `patient_y_mm`
- `patient_z_mm`
- `calibrated_units`

## `roi_pixels.csv`

- `roi_id`
- `roi_label`
- `slice_index`
- `row_in_roi`
- `col_in_roi`
- `image_x`
- `image_y`
- `physical_x_mm`
- `physical_y_mm`
- `stored_pixel_value`
- `rescaled_value`
- `calibrated_value`
- `units`
- `patient_x_mm`
- `patient_y_mm`
- `patient_z_mm`

## `roi_pixels_matrix.json`

For each ROI:

- geometry
- spacing
- rescale slope/intercept
- units
- stored value matrix
- rescaled value matrix
- calibrated value matrix

## `analysis_metadata.json`

- app identity and export timestamp
- active dataset identifiers
- DICOM metadata relevant to analysis
- spacing and rescale definitions
- square-mode definitions
- warnings and current limitations

## Exported Figure Files

- `roi_<id>_overlay.png`
  - whole-slice image with the exported ROI overlay
- `roi_<id>_histogram.png`
  - histogram of calibrated ROI pixel values
- `roi_<id>_profile_horizontal_center.png`
- `roi_<id>_profile_vertical_center.png`
- `roi_<id>_profile_horizontal_mean.png`
- `roi_<id>_profile_vertical_mean.png`
  - baseline profile-curve figures exported from the same ROI pixel matrix used for numeric analysis
- `roi_<id>_characterization_horizontal_center.png`
- `roi_<id>_characterization_vertical_center.png`
- `roi_<id>_characterization_horizontal_mean.png`
- `roi_<id>_characterization_vertical_mean.png`
  - paired characterization figures showing both the exact square ROI sampling pattern and the ordered signal actually characterized

## NPS Export Files

- `nps_summary.csv`
  - one row per concentric NPS set
  - includes ROI counts, power-of-two edge size, pixel spacing, Nyquist frequencies, integrated NPS, mean ROI variance, variance closure ratio, peak frequency, centroid frequency, high-frequency fraction, units, and method notes
- `nps_radial.csv`
  - one row per radial frequency bin per NPS set
  - includes bin frequency bounds, frequency center, NPS value, sample count, and NPS units
- `nps_matrix.json`
  - structured 2D NPS matrix export
  - includes NPS set geometry, ROI membership, rejected ROI notes, method, normalization, radial bins, 2D NPS values, and derived metrics
- `nps_<set>_curve.png`
  - radial 1D NPS curve
- `nps_<set>_heatmap.png`
  - log-scaled 2D NPS heatmap

## NPS Method

NoiseLab computes 2D NPS from complete square ROI matrices using calibrated source pixel values. Each ROI is mean-subtracted, transformed with a 2D FFT, converted to power, shifted to center zero frequency, normalized by `pixel_spacing_x_mm * pixel_spacing_y_mm / (N_x * N_y)`, averaged across ROIs, and radially averaged into the 1D NPS curve.

## Reconstruction Comparison Export Files

When ROIs or NPS sets are copied to other loaded series, NoiseLab exports comparison tables across reconstructions of the same patient or phantom.

- `reconstruction_noise_comparison.csv`
  - one row per copied ROI group per reconstruction
  - includes dataset/reconstruction labels, ROI geometry, calibrated mean, SD, variance, median, IQR, MAD, CV, boundary flags, baseline flag, delta SD, percent delta SD, noise ratio, and variance ratio versus baseline
- `reconstruction_noise_comparison_summary.csv`
  - one row per copied ROI group
  - identifies baseline, lowest-SD reconstruction, highest-SD reconstruction, SD range, SD percent range, mean range, and high/low variance ratio
- `reconstruction_nps_comparison.csv`
  - one row per copied NPS set per reconstruction
  - includes valid/rejected ROI counts, integrated NPS, mean ROI variance, variance closure ratio, peak frequency, peak NPS, centroid frequency, high-frequency power fraction, and baseline deltas/ratios
- `reconstruction_nps_comparison_summary.csv`
  - one row per copied NPS set group
  - identifies lowest/highest integrated NPS reconstructions and peak-frequency range
- `reconstruction_comparison_metadata.json`
  - documents dataset identifiers, baseline rules, comparison metric definitions, and limitations
- `reconstruction_noise_comparison.png`
  - bar-style summary figure of ROI SD across loaded reconstructions

Baseline rule: a copied ROI is grouped by `copied_from_roi_id`, and the original uncopied ROI is the baseline when available. If the original is absent, the earliest loaded reconstruction in that group is used as baseline. Copied NPS sets use the same rule with `copied_from_nps_set_id`.

For multi-series exports, per-series raw bundle files are prefixed as `series_<index>_<reconstruction_label>_<filename>` to keep each reconstruction's raw data and figures distinct in the same patient outbox.
