# HAGRad: A Locally Hosted Browser-Based Workstation for Cardiovascular CT Research Workflows

**Target journal:** Radiology: Cardiothoracic Imaging  
**Manuscript type:** Technical Development  
**Draft status:** RSNA-focused pre-submission draft for `v0.9.0-research-preview`  

## Abbreviated Title Page

**Title:** HAGRad: A Locally Hosted Browser-Based Workstation for Cardiovascular CT Research Workflows

**Article type:** Technical Development

**Keywords:** Cardiac CT; Coronary CT Angiography; DICOM; Image Quality; Research Software

**Abbreviations:** AI = artificial intelligence; CCTA = coronary CT angiography; CT = computed tomography; DICOM = Digital Imaging and Communications in Medicine; EAT = epicardial adipose tissue; HU = Hounsfield unit; MPR = multiplanar reformation; QCA = quantitative coronary angiography; ROI = region of interest; SNR = signal-to-noise ratio.

**Summary statement:** HAGRad enabled local cardiovascular CT review, MPR, workflow-specific measurements, and metadata-enriched CSV/PNG export in a technical feasibility evaluation.

**Key points:**

- HAGRad completed predefined cardiovascular CT research workflows in `[successful workflows]/[total workflows]` attempts across `[N]` de-identified examinations.
- Structured export generated `[N]` measurement CSV files, `[N]` image files, and study-level rollup files with `[percentage]%` metadata-column completeness.
- Repeated ROI/profile measurements showed `[metric]` variability of `[value]`, supporting technical reproducibility for defined research tasks.

## Abstract

**Purpose:** To develop and technically evaluate HAGRad, a locally hosted browser-based workstation for cardiovascular CT research workflows.

**Materials and Methods:** This retrospective technical development study evaluated HAGRad version `v0.9.0-research-preview` using `[N]` de-identified cardiac CT or CCTA examinations acquired from `[month year]` to `[month year]`. HAGRad was implemented as a local HTTPS browser application with DICOM loading, metadata extraction, window/level adjustment, pan/zoom, fast slice navigation, MPR, annotation, ROI measurement, profile analysis, and workflow-specific modules for CCTA image quality, EAT, calcium scoring, stent/plaque interface analysis, and structured export. Primary outcome was successful completion of predefined workflows with complete CSV/PNG export. Secondary outcomes included metadata completeness, export indexing, loading/export time, and repeated measurement variability. Descriptive statistics were used.

**Results:** HAGRad completed `[successful workflows]/[total workflows]` predefined workflow attempts across `[N]` examinations. Export generated `[N]` measurement CSV files, `[N]` PNG files, and study-level summary and rollup CSV files. Required study identifiers were present in `[percentage]%` of exported rows, and DICOM-derived metadata fields were complete in `[percentage]%`. Median loading time was `[value]` seconds (IQR, `[value]-[value]`), and median export time was `[value]` seconds (IQR, `[value]-[value]`). Repeated ROI/profile measurements showed `[repeatability result]`.

**Conclusion:** HAGRad provided a local cardiovascular CT research workstation for image review, MPR, task-specific measurement, and structured export in this technical feasibility evaluation.

## Introduction

Cardiovascular CT research increasingly relies on quantitative tasks that extend beyond routine clinical image review. Coronary CT angiography (CCTA) studies may compare multiple reconstruction kernels, virtual monoenergetic images, denoising strategies, or ultrahigh-resolution acquisitions. These comparisons often require repeated image-quality ROI measurements, vessel or stent profile analysis, calcium scoring, structured metadata extraction, and reproducible export for statistical analysis. Recent Radiology: Cardiothoracic Imaging studies have evaluated CCTA image noise, signal-to-noise ratio, edge sharpness, and full width at half maximum as technical endpoints in reconstruction research, highlighting the need for reproducible measurement workflows in cardiac CT (1).

Mature image-analysis platforms and web-based DICOM viewers support many research tasks, but cardiothoracic research groups may still require a lightweight local workstation that can be modified rapidly for evolving CCTA, stent, plaque, image-quality, and calcium-scoring protocols. General-purpose systems such as OHIF, Orthanc, and DICOMweb-based infrastructure are important for scalable imaging ecosystems, but they may require additional integration work before supporting a laboratory-specific cardiac CT measurement protocol (2-4).

HAGRad was developed as a local browser-based workstation for cardiovascular CT research. The purpose of this technical development study was to describe HAGRad and evaluate whether it could complete predefined local cardiac CT/CCTA research workflows with structured CSV/PNG export.

## Materials and Methods

### Study Design and Dataset

This retrospective technical development study evaluated HAGRad version `v0.9.0-research-preview`. Institutional review board approval was `[obtained/waived/not applicable]`, and informed consent was `[obtained/waived/not applicable]`. The evaluation used `[N]` de-identified cardiac CT or CCTA examinations acquired from `[month year]` to `[month year]`. Inclusion criteria were availability of axial DICOM image series suitable for cardiovascular CT review and at least one workflow-relevant task: CCTA image quality, coronary stent or plaque interface assessment, EAT analysis, or calcium scoring. Exclusion criteria were incomplete DICOM pixel data, unsupported transfer syntax, or missing image geometry required for MPR.

### Software Implementation

HAGRad was implemented as a locally hosted HTTPS browser application served from a Python backend. The browser client uses HTML, CSS, JavaScript, local imaging libraries, and shared HAGRad modules for DICOM parsing, image geometry, profile analysis, overlay styling, and export handling. DICOM files or folders are loaded locally. Extracted metadata include patient/study identifiers, series description, series number, acquisition time, slice thickness, pixel spacing, matrix size, reconstruction kernel, window center/width, rescale slope/intercept, and image position/orientation when available.

Core viewer functions include window/level presets and manual adjustment, pan, zoom, fast scrolling, command/control-scroll zoom toward the cursor, annotation tools, length and ROI measurements, undo/redo, editable shortcuts, metadata overlay, and single-view or four-panel MPR display. Focus view expands the active image workspace while preserving essential controls.

Workflow modules evaluated in this study were the main HAGRad Viewer, CCTA IQ, EAT, CalcScorer, Contrast CalcScorer, QCA, NoiseLab, and stent/plaque interface profiling. CCTA IQ includes predefined vessel, muscle-background, and aortic-root noise ROI targets with SNR and contrast-to-noise ratio export. Profile tools compute HU profile metrics including peak values, full width at half maximum, edge-rise slope, derivative-based edge spread, and kurtosis. NoiseLab supports exact square ROI noise analysis with pixel-level and profile-level export.

### Workflow Evaluation

For each examination, predefined workflow tasks were attempted by `[number]` reader(s) with `[experience]` years of cardiovascular CT experience. Tasks included loading local DICOM files/folders, navigating the axial series, activating MPR, placing measurements or ROIs, performing one workflow-specific analysis, entering research study and patient study identifiers, and exporting CSV/PNG outputs. The primary outcome was workflow completion with complete export. Secondary outcomes were metadata completeness, creation of study summary and rollup CSV files, loading time, export time, and repeated-measurement variability for selected ROI/profile measurements.

### Statistical Analysis

Descriptive statistics were used. Continuous variables are reported as mean +/- SD or median and IQR, as appropriate. Categorical variables are reported as counts and percentages. Repeated measurement variability was summarized as `[coefficient of variation / intraclass correlation coefficient / mean absolute difference]`. Analyses were performed with `[software and version]`.

## Results

### Technical Feasibility

The evaluation included `[N]` de-identified examinations with `[N]` total DICOM series and `[N]` reconstruction sets. Workflow completion was achieved in `[successful workflows]/[total workflows]` attempts (`[percentage]%`). Successful workflows included local DICOM/folder loading, presentation navigation, MPR activation, measurement placement, workflow-specific analysis, and CSV/PNG export.

### Export Completeness

HAGRad generated `[N]` CSV exports and `[N]` PNG exports. Study-level `_study_export_summary.csv` and `_study_export_rollup.csv` files were generated for `[N]` studies. Required user-entered study identifiers were present in `[percentage]%` of exported rows. DICOM-derived metadata columns were complete in `[percentage]%` of rows for series description, `[percentage]%` for series number, `[percentage]%` for slice thickness, `[percentage]%` for pixel spacing, and `[percentage]%` for reconstruction kernel.

### Runtime and Repeated Measurements

Median DICOM loading time was `[value]` seconds (IQR, `[value]-[value]`). Median export time was `[value]` seconds (IQR, `[value]-[value]`). For repeated ROI/profile measurements, `[metric]` was `[value]` for attenuation, `[value]` for noise, and `[value]` for profile width metrics. Failures occurred in `[N]` attempts and were related to `[unsupported transfer syntax / missing metadata / incomplete series / other]`.

## Discussion

This technical development study describes HAGRad, a locally hosted browser-based workstation for cardiovascular CT research workflows. In the feasibility evaluation, HAGRad completed predefined local CT/CCTA workflows and generated structured CSV/PNG exports with study-level indexing. The software was designed to address a practical research need: repeated, traceable, and modifiable image-analysis tasks in cardiac CT without requiring enterprise PACS integration or manual spreadsheet assembly.

The workflow emphasis differs from large imaging ecosystems. OHIF provides an extensible web-based viewer framework, Orthanc provides DICOM archive and routing infrastructure, and DICOMweb enables standards-based image access (2-4). HAGRad instead prioritizes local file handling, cardiovascular CT-specific measurement workflows, and export-ready outputs. This narrower scope may be useful for laboratories evaluating reconstruction techniques, CCTA image quality, stent/plaque interface visibility, calcium-scoring strategies, or noise behavior across reconstructions.

HAGRad also aligns with current technical needs in cardiac CT. Studies of reconstruction methods in CCTA have reported image noise, SNR, edge sharpness, and full width at half maximum as relevant endpoints (1). Emerging cardiac CT technologies such as ultrahigh-resolution and photon-counting CT intensify the need for reproducible measurement tools that can compare spatial resolution, blooming, attenuation, and noise across reconstructions (5). HAGRad was built to support these tasks while preserving DICOM-derived metadata and user-defined research identifiers in exported files.

Limitations include the research-preview status of the software, the absence of regulatory clearance, and the need for formal validation before using workflow-specific measurements as clinical biomarkers. The current version is optimized for local desktop browser use and does not yet provide full DICOMweb/PACS integration. Some modules remain exploratory, and browser performance may vary with hardware, series size, and DICOM transfer syntax. The present study evaluates technical feasibility rather than diagnostic accuracy.

In conclusion, HAGRad provided a local cardiovascular CT research workstation for DICOM review, MPR, task-specific measurement, and structured export in this technical feasibility evaluation. A citable public release may support reproducible cardiovascular CT research workflows and future validation studies.

## Figure Legends

**Figure 1. HAGRad workflow architecture.** Local DICOM files are loaded into a browser-based workstation served by a local HTTPS backend. Shared viewer, DICOM, measurement, profile-analysis, and export modules support workflow-specific applications for cardiovascular CT research. CSV = comma-separated values; DICOM = Digital Imaging and Communications in Medicine; MPR = multiplanar reformation.

**Figure 2. Main viewer and MPR interface.** Representative de-identified CCTA images show the single-view presentation mode and four-panel MPR mode with window/level, pan, zoom, crosshair navigation, and focus-view controls. CCTA = coronary CT angiography; MPR = multiplanar reformation.

**Figure 3. CCTA image-quality workflow.** Vessel, background, and noise ROIs are placed in predefined coronary and reference locations. Objective outputs include attenuation, noise, SNR, and contrast-to-noise ratio. ROI = region of interest; SNR = signal-to-noise ratio.

**Figure 4. Stent and plaque interface profile analysis.** A line profile across a coronary stent or plaque-lumen interface generates attenuation, full width at half maximum, edge-rise, edge-spread, and kurtosis metrics for reconstruction comparison.

**Figure 5. Export structure.** Research study and patient study identifiers determine the export folder structure. Measurement CSV and PNG files are stored in patient-level folders, while study-level summary and rollup CSV files aggregate outputs for downstream analysis.

## Tables

**Table 1. HAGRad cardiovascular CT workflows and exported outputs**

| Workflow | Primary task | Key measurements | Exported files |
|---|---|---|---|
| HAGRad Viewer | CT review and MPR | Length, ROI, profile, metadata | Measurement CSV, PNG, baseline CSV |
| CCTA IQ | Image-quality assessment | HU, SD, SNR, CNR, subjective scores | Objective CSV, subjective CSV, metadata CSV/PNG |
| EAT | Epicardial fat analysis | Volume, mean HU, SD HU | CSV, PNG report |
| CalcScorer | Calcium scoring research | Agatston-style score, volume, mass | CSV, PNG overlay |
| Stent/plaque profile | Interface analysis | FWHM, edge-rise, edge-spread, kurtosis | Measurement CSV, graph/viewport PNG |
| NoiseLab | Square ROI noise analysis | Mean, SD, histogram, profile residuals | ROI summary, pixel table, profiles, figures |

**Table 2. Technical feasibility results**

| Metric | Result |
|---|---|
| Examinations evaluated | `[N]` |
| DICOM series evaluated | `[N]` |
| Workflow attempts | `[N]` |
| Completed workflows | `[N] ([percentage]%)` |
| CSV exports generated | `[N]` |
| PNG exports generated | `[N]` |
| Study rollup files generated | `[N]` |
| Median loading time | `[value] seconds (IQR, [value]-[value])` |
| Median export time | `[value] seconds (IQR, [value]-[value])` |
| Repeated-measurement variability | `[metric and value]` |

## References

1. Takafuji M, Kitagawa K, Mizutani S, Akane H, Kisou R, Iio K, et al. Super-Resolution Deep Learning Reconstruction for Improved Image Quality of Coronary CT Angiography. Radiol Cardiothorac Imaging 2023;5(4):e230085. doi:10.1148/ryct.230085.

2. Ziegler E, Urban T, Brown D, Petts J, Pieper SD, Lewis R, et al. Open Health Imaging Foundation Viewer: An Extensible Open-Source Framework for Building Web-Based Imaging Applications to Support Cancer Research. JCO Clin Cancer Inform 2020;4:336-345. doi:10.1200/CCI.19.00131.

3. Jodogne S. The Orthanc Ecosystem for Medical Imaging. J Digit Imaging 2018;31(3):341-352. doi:10.1007/s10278-018-0082-y.

4. Genereaux BW, Dennison DK, Ho K, Horn R, Silver EL, O'Donnell K, et al. DICOMweb: Background and Application of the Web Standard for Medical Imaging. J Digit Imaging 2018;31(3):321-326. doi:10.1007/s10278-018-0073-z.

5. Kwan AC, Pourmorteza A, Stutman D, Bluemke DA, Lima JAC. Next-Generation Hardware Advances in CT: Cardiac Applications. Radiology 2021;298(1):3-17. doi:10.1148/radiol.2020192791.

6. Ihdayhid AR, Tzimas G, Peterson K, Ng N, Mirza S, Maehara A, et al. Diagnostic Performance of AI-enabled Plaque Quantification from Coronary CT Angiography Compared with Intravascular Ultrasound. Radiol Cardiothorac Imaging 2024;6(6):e230312. doi:10.1148/ryct.230312.

7. Landsmann A, Sartoretti T, Mergen V, Jungblut L, Eberhard M, Kobe A, et al. Multi-Energy Low-Kiloelectron Volt versus Single-Energy Low-Kilovolt Images for Endoleak Detection at CT Angiography of the Aorta. Radiol Cardiothorac Imaging 2024;6(2):e230217. doi:10.1148/ryct.230217.

8. Smith AM, Katz DS, Niemeyer KE, FORCE11 Software Citation Working Group. Software Citation Principles. PeerJ Comput Sci 2016;2:e86. doi:10.7717/peerj-cs.86.

9. National Electrical Manufacturers Association. Digital Imaging and Communications in Medicine (DICOM) Standard. https://www.dicomstandard.org/. Accessed `[date]`.

10. Radiology: Cardiothoracic Imaging Instructions for Authors. Radiological Society of North America. https://pubs.rsna.org/page/cardiothoracic/author-instructions. Accessed `[date]`.

## Submission To-Do List

- Replace all bracketed placeholders with real feasibility data.
- Confirm IRB/ethics wording before using any clinical DICOM screenshots.
- Prepare anonymized manuscript and separate full title page.
- Create 300-dpi figures with no patient identifiers.
- Keep tables to two and references to 25 or fewer.
- Add GitHub release URL and software DOI once `v0.9.0-research-preview` is released.
- Add a STROBE checklist if the feasibility dataset uses human subjects.

