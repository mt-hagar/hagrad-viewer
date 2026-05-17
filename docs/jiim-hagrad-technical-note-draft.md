# HAGRad: A Locally Hosted Browser-Based DICOM Research Viewer for Workflow-Oriented Cardiovascular Image Analysis

**Manuscript type:** Technical Note / Experience Report  
**Target journal:** Journal of Imaging Informatics in Medicine  
**Draft status:** Pre-submission working draft for `v0.9.0-research-preview`  

## Title Page

**Title:** HAGRad: A Locally Hosted Browser-Based DICOM Research Viewer for Workflow-Oriented Cardiovascular Image Analysis

**Short title:** HAGRad DICOM Research Viewer

**Authors:** [Author names, degrees]

**Affiliations:** [Departments, institutions, city, country]

**Corresponding author:** [Name, email, ORCID]

## Abstract

**Background:** Cardiovascular imaging research frequently requires quantitative workflows that are difficult to implement in routine clinical picture archiving and communication systems or closed vendor workstations. Research groups often need local, modifiable tools that combine DICOM review, multiplanar reformation, task-specific measurement, and structured export.

**Methods:** We developed HAGRad, a locally hosted browser-based DICOM research platform for cardiovascular image review and workflow-specific quantitative analysis. The software uses local DICOM file loading, metadata extraction, window/level control, pan/zoom, fast slice navigation, annotations, measurements, multiplanar reformations, and modular workflow pages for cardiac CT, coronary CTA image quality, epicardial adipose tissue, calcium scoring, stent/plaque interface analysis, angiographic QCA prototyping, and square-ROI noise analysis. Exports are structured as CSV and PNG outputs with study identifiers and DICOM-derived metadata.

**Results:** HAGRad provides a unified research workstation for local DICOM visualization, workflow-specific measurement, iterative annotation, and downstream statistical export. The platform emphasizes reproducible measurement metadata, study-level export indexing, user-editable shortcuts, and local data handling. The current release is intended as a research-preview implementation, not as a diagnostic medical device.

**Conclusion:** HAGRad demonstrates a practical architecture for rapidly developing cardiovascular imaging research workflows around a common local viewer backbone. Its planned public release may support reproducible research, method development, education, and citable software use.

**Keywords:** DICOM; imaging informatics; cardiovascular imaging; research software; web-based viewer; quantitative imaging

## Background

Medical imaging research increasingly depends on software that can bridge routine image review, task-specific measurement, and reproducible data export. DICOM is the international standard for medical images and related information, and its metadata-rich structure allows imaging data to carry acquisition, reconstruction, spatial, and patient/study information that are essential for research interpretation [1]. However, routine clinical viewers and PACS environments are primarily optimized for clinical interpretation, reporting, and enterprise workflow. Research studies frequently require additional functionality: cohort-level export, reproducible region-of-interest measurements, custom quantitative tools, side-by-side comparison of reconstructions, editable annotations, and structured outputs for statistical analysis.

Open-source imaging informatics has a long history in radiology. Nagy described open-source software as an important contributor to DICOM adoption and as a practical resource for imaging informaticists, PACS administrators, researchers, and educators [2]. Mature platforms such as 3D Slicer have shown how open, extensible software can support image visualization, segmentation, registration, and quantitative imaging research [3]. Fiji/ImageJ similarly illustrates the scientific value of open, scriptable image-analysis ecosystems outside radiology [4]. More recently, OHIF demonstrated the feasibility of an extensible, browser-based medical imaging platform that supports image review, measurements, multiplanar reformation, and integration into research environments [5]. Orthanc and DICOMweb-focused work have further highlighted the importance of programmable, standards-based infrastructure for medical imaging workflows [6,7].

Despite these advances, there remains a practical niche for smaller, locally hosted research workstations tailored to a laboratory's evolving imaging questions. Cardiovascular CT and angiographic imaging research often involves multiple reconstructions of the same patient, image-quality comparisons, coronary plaque or stent-specific measurements, calcium scoring, epicardial adipose tissue quantification, and figure generation. These tasks may be difficult to perform reproducibly in general-purpose viewers without custom extensions or manual spreadsheet work.

HAGRad was developed to address this need. The goal was not to replace mature clinical viewers, PACS systems, or general platforms such as OHIF or 3D Slicer. Instead, HAGRad was designed as a local, modifiable, workflow-oriented research platform for cardiovascular image analysis. This technical note describes the software concept, architecture, implemented workflows, export strategy, and limitations of the `v0.9.0-research-preview` release.

## Methods

### Design Objectives

HAGRad was designed according to five practical requirements derived from cardiovascular imaging research workflows:

1. **Local data handling:** DICOM files should be loaded from local files or folders without requiring upload to an external server.
2. **Common viewer backbone:** Basic tools such as window/level, pan, zoom, fast scrolling, measurements, annotations, and MPR should behave consistently across workflows.
3. **Workflow-specific modules:** Specialized tools should be available for tasks such as coronary CTA image-quality analysis, epicardial adipose tissue segmentation, calcium scoring, stent/plaque interface profiling, and angiographic QCA prototyping.
4. **Structured export:** Measurements should be exportable as CSV tables with study identifiers and relevant DICOM metadata, accompanied by PNG images when useful for review or publication.
5. **Research transparency:** The software should expose assumptions and limitations and should be versioned so results can be linked to a specific software release.

### Software Architecture

HAGRad is implemented as a locally hosted browser-based application served over HTTPS. The current codebase consists primarily of HTML, CSS, JavaScript modules, shared JavaScript utility files, local vendor imaging libraries, and a Python HTTPS backend used for serving files and handling export persistence. The local server hosts the application under `https://localhost:3020`.

The viewer architecture includes:

- a main HAGRad Viewer shell for general DICOM review and measurement;
- modular workflow pages for EAT, CCTA IQ, QCA, CalcScorer, Contrast CalcScorer, Stent Viewer, NoiseLab, PlaqueQuant, and PointGuard;
- shared JavaScript utilities for DICOM parsing, image geometry, profile analysis, overlay styling, and export study handling;
- a Python backend for local HTTPS serving, export saving, export indexing, and selected workflow backends;
- a local `exports_outbox` model for storing generated CSV/PNG exports outside the source-code release.

At the time of this draft, the source includes approximately 50,000 lines across major viewer, workflow, shared, and server files. This estimate is provided only to characterize implementation scale and will be updated before final submission.

### DICOM Loading and Image Model

HAGRad reads local DICOM files in the browser using DICOM parsing libraries and groups records into series based on series-level identifiers and metadata. The shared DICOM loader extracts metadata including patient and study identifiers, study/series descriptions, protocol name, modality, series number, SOP instance UID, frame of reference UID, rows, columns, pixel spacing, slice thickness, image orientation, image position, window center/width, rescale slope/intercept, rescale type, and transfer syntax.

Image sorting uses image position projected along the slice-normal vector when available, with instance number and filename as fallback sorting keys. Slice spacing is estimated from image-position differences when possible and falls back to slice thickness when necessary. Source pixel data are interpreted with rescale slope and intercept when calibrated CT attenuation values are required.

The current local-file approach differs from DICOMweb-first architectures. DICOMweb enables standardized web retrieval and integration with enterprise image archives [7], but HAGRad intentionally prioritizes a lightweight local research environment for de-identified files and retrospective studies. Future versions may add archive connectors or DICOMweb support.

### Viewer Interaction Model

The core interaction model includes window/level adjustment, user-editable window presets, pan, zoom, fast right-button slice scrolling, command/control-scroll zooming toward cursor position, mouse-wheel navigation, measurement selection, undo/redo, and escape-to-default behavior. Shortcuts are user-editable and persist across sessions. Tool buttons display assigned shortcuts to reduce cognitive load.

The main viewer supports both a single presentation viewport and a four-panel MPR mode. MPR interactions include linked axial, coronal, sagittal, and presentation planes, crosshair navigation, plane rotation, double-click enlargement, focus view, and controls to reset plane orientation and image centering. Focus view expands the active viewing area while keeping essential workflow controls accessible as floating elements.

### Measurement and Annotation Tools

HAGRad implements general and task-specific measurements:

- length measurement;
- probe measurement;
- arrows and text labels;
- circular and freehand ROIs;
- ROI editing, moving, copying, and deletion;
- line profile analysis;
- square profile analysis;
- stent-lumen interface profile tools;
- calcified and non-calcified plaque-lumen interface profile tools;
- square noise ROI tools in NoiseLab.

Profile analysis is implemented using source image samples rather than screen pixels when source data are available. The shared profile-analysis module computes profile-derived values such as peak attenuation, FWHM-related widths, edge-rise metrics, derivative-based edge spread, kurtosis, and user-adjustable guide positions for selected tools. For stent and plaque interface workflows, these measurements are designed as research metrics and require further validation before interpretation as biomarkers.

### Workflow Modules

#### HAGRad Viewer

The main viewer provides general cardiac CT review, presentation-mode navigation, four-up MPR, annotation, measurement, profile analysis, metadata overlay, export, and focus view. It functions as the shared interaction baseline for other workflows.

#### EAT Workflow

The EAT workflow supports epicardial adipose tissue analysis using slice-limit definition, contouring, HU thresholding, rubber correction, optional automated/AI-assisted segmentation, multi-reconstruction transfer, overlay review, and quantitative export of volume and density metrics.

#### CCTA IQ

The CCTA IQ workflow targets objective and subjective image-quality assessment in coronary CTA. Objective measurements include predefined coronary vessel ROI targets, muscle-background measurements, aortic-root noise estimation, signal/noise/background aggregation, SNR and CNR calculation, and reconstruction-level comparison. Subjective assessment uses structured Likert ratings for noise, sharpness, motion artifact, and overall image quality.

#### CalcScorer and Contrast CalcScorer

CalcScorer provides research-oriented coronary calcium scoring using threshold-based candidate detection, editable lesions, total and category-specific Agatston-style values, volume, and equivalent mass. Contrast CalcScorer extends this concept to contrast-enhanced CT and CTA using reference ROI sampling and contrast-suppressed calcification estimation. Both modules are explicitly research prototypes.

#### QCA

The QCA workflow is designed for invasive coronary angiography research prototyping. It supports cine or frame-series loading, still-frame selection, anchor-based vessel segmentation, diameter profiling, stenosis review, and export. This module is intentionally separated from the CT viewer because angiographic measurement assumptions differ from CT-based analysis.

#### Stent and Plaque Interface Analysis

Stent-related tools quantify stent-lumen interface profiles, including line and square profile measurements. Plaque-lumen interface tools distinguish calcified and non-calcified plaque scenarios and compute interface-related profile metrics. These tools were motivated by research questions involving spatial resolution, blooming, reconstruction kernels, photon-counting CT, and attenuation-dependent sharpness metrics.

#### NoiseLab

NoiseLab is a dedicated square-ROI noise-analysis app. It supports exact square ROI placement, pixel-square versus physical-square modes, ROI statistics, profile extraction, histogram export, residual noise analysis, and manuscript-oriented export bundles.

### Export Architecture

Structured export is a central design element. HAGRad exports CSV and PNG files for measurements and workflow outputs. Exports can include user-entered research study IDs and patient study IDs, enabling separation of research projects and patient-level export folders. CSV exports can include DICOM-derived metadata such as patient/study identifiers, series description, series number, kernel, slice thickness, increment, pixel spacing, matrix size, acquisition date/time, and workflow-specific measurement columns.

The backend export handler stores exported files in workflow-specific folders and rebuilds study-level index files:

- `_study_export_summary.csv`;
- `_study_export_rollup.csv`.

The summary file provides one row per export file, while the rollup file combines measurement rows across CSV exports while preserving tool-specific columns and adding index metadata. The export model is intended to make downstream analysis in R, Python, GraphPad, Excel, or statistical software more direct.

### Software Citation and Release Plan

The planned public release is `v0.9.0-research-preview`. Following software-citation principles, the final manuscript should cite a fixed software version with a persistent identifier, ideally a Zenodo or Figshare DOI linked to the corresponding GitHub release [8]. The release should include a clean repository, citation metadata, license/disclaimer, documentation, and example workflow outputs.

### Ethical and Regulatory Positioning

HAGRad is intended for research, education, technical development, and retrospective image analysis. It is not intended for primary clinical diagnosis, treatment planning, procedural planning, or patient management. No patient-identifiable DICOM data, local certificates, generated exports, local tool caches, or private project lists should be included in the public repository.

### Literature Review Method

We searched official journal pages, SIIM guidance, Springer submission guidance, PubMed/PMC where available, SpringerLink, DICOM standard resources, and web-accessible publication pages for literature on DICOM viewers, browser-based imaging, open-source imaging informatics, reproducible research software, software citation, and research software FAIR principles. Search terms included combinations of "Journal of Imaging Informatics in Medicine", "DICOM viewer", "web-based DICOM viewer", "OHIF", "Cornerstone", "3D Slicer", "Orthanc", "DICOMweb", "open source imaging informatics", "research software citation", and "FAIR research software".

## Results

### Implemented Software Capabilities

The current HAGRad research-preview implementation provides a local cardiovascular imaging workstation with a common viewer backbone and multiple workflow-specific modules. Table 1 summarizes the implemented applications and outputs.

**Table 1. HAGRad modules and primary research outputs.**

| Module | Primary input | Main tools | Structured outputs |
|---|---|---|---|
| HAGRad Viewer | CT DICOM series | Presentation view, MPR, measurements, profiles, metadata overlay | Measurement CSV/PNG, baseline-characteristics CSV |
| EAT | Cardiac CT | Contours, HU thresholding, rubber correction, transfer | EAT volume/density CSV, PNG report |
| CCTA IQ | Coronary CTA | Vessel/background/noise ROIs, subjective scoring | Objective, subjective, metadata exports |
| CalcScorer | Non-contrast cardiac CT | Threshold candidates, editable lesions | Agatston-style score, volume, mass CSV/PNG |
| Contrast CalcScorer | Contrast-enhanced CT/CTA | Reference ROI, contrast-suppressed candidates | Category-specific research outputs |
| QCA | Invasive coronary angiography | Still-frame selection, anchors, diameter profile | Stenosis and vessel-analysis CSV/PNG |
| Stent Viewer | Coronary CTA | MPR, stent profiles, Likert scores | Per-stent measurements and image exports |
| NoiseLab | CT/grayscale DICOM | Exact square ROIs, histograms, profiles | ROI summary, pixels, profiles, histograms, figures |
| PlaqueQuant | Coronary CTA | Plaque-oriented prototype tools | Prototype plaque quantification outputs |
| PointGuard | Coronary CTA/cardiac CT reporting | Structured reporting workspace | Draft structured report outputs |

### Workflow Consistency

Across major viewer-based workflows, HAGRad provides a consistent set of basic controls: window/level, zoom, pan, fast scroll, reset windowing, reset zoom/center, focus view, undo/redo, shortcut display, editable shortcut preferences, local DICOM/folder loading, drag-and-drop loading, and export prompts requiring study identifiers. This consistency is intended to reduce relearning between modules and make specialized workflows feel like extensions of a common workstation rather than isolated tools.

### Export Structure

CSV outputs are designed as analysis-friendly tables with explicit identifiers, units, and workflow-specific columns. For workflows using the shared export backend, exported files are stored under workflow and study folders, with patient-level subfolders when a patient study ID is assigned. Study-level summary and rollup CSV files are rebuilt after export so that repeated patients in the same research project can be analyzed continuously.

### Comparison with Existing Platforms

HAGRad occupies a narrower but complementary niche compared with established imaging platforms. OHIF provides a broad extensible web viewer ecosystem with DICOMweb support and integration into multiple research platforms [5]. 3D Slicer provides a mature, cross-platform medical image-computing environment with extensive segmentation, registration, and visualization capabilities [3]. Orthanc provides a programmable DICOM server and ecosystem for archive, routing, and integration workflows [6]. HAGRad is smaller and less mature than these platforms, but its development goal is different: rapid local deployment of cardiovascular research workflows with integrated structured exports and user-driven workflow iteration.

## Discussion

HAGRad demonstrates how a local browser-based viewer backbone can support multiple cardiovascular imaging research workflows without requiring a full enterprise PACS integration. The design reflects a practical middle ground between mature general-purpose platforms and ad hoc manual analysis. By combining local DICOM loading, consistent viewer controls, MPR, measurements, ROI tools, profile analysis, workflow-specific modules, and structured export indexing, HAGRad aims to reduce friction in retrospective imaging studies and early method development.

### Relationship to Prior Work

Prior imaging informatics work has emphasized the value of open-source tools, standards, and web-based viewers [2,5,7]. HAGRad builds on this tradition but focuses on a specific laboratory use case: cardiovascular image-analysis workflows that are repeatedly adjusted in response to emerging research questions. The iterative development model is closer to research-workstation prototyping than to enterprise viewer development. This is especially relevant for studies involving multiple CT reconstructions, stent imaging, plaque-lumen interfaces, coronary CTA image quality, EAT quantification, and calcium scoring, where the measurement question may evolve during protocol development.

### Structured Export as a Design Priority

Many imaging tools allow screenshots or isolated measurements, but downstream research often requires patient-level and study-level tabular exports. HAGRad therefore treats export as part of the core workflow rather than as an afterthought. User-entered study identifiers, metadata-enriched CSV rows, patient-level export folders, and rollup files are intended to reduce manual spreadsheet merging and improve traceability. This aligns with general research-computing recommendations to use structured, analysis-friendly data, explicit identifiers, version control, and citable software releases [8-10].

### Research Use and Validation

The current release should be interpreted as a research-preview platform. Individual tools, especially advanced profile metrics, contrast calcium estimation, plaque quantification, and QCA segmentation, require task-specific validation before use as quantitative biomarkers. This manuscript does not claim diagnostic performance, equivalence to commercial workstations, or regulatory clearance. Instead, it describes the software architecture and workflow capabilities as a foundation for future validation studies.

### Limitations

This work has several limitations. First, HAGRad is currently locally hosted and optimized for desktop browser use; broader packaging and operating-system support remain future tasks. Second, the present release focuses on local files and does not yet implement a full DICOMweb/PACS integration pathway. Third, no formal multi-reader usability study or multi-institution benchmark is included in this draft. Fourth, workflow-specific algorithms are heterogeneous in maturity; some are functional research tools, whereas others are prototypes. Fifth, browser-based performance may vary with hardware, browser, DICOM transfer syntax, image matrix size, and volume length. Sixth, clinical deployment would require regulatory, cybersecurity, privacy, and quality-management steps beyond the scope of the current project.

### Future Work

Future work will include public release hygiene, software DOI archiving, improved documentation, example de-identified or synthetic datasets, automated tests for geometry and export schemas, broader workflow validation, DICOMweb integration, packaging for easier installation, and quantitative reproducibility studies. A subsequent validation manuscript could evaluate measurement repeatability, inter-reader agreement, export fidelity, and runtime performance using defined cardiovascular CT tasks.

## Conclusion

HAGRad is a locally hosted browser-based DICOM research viewer and workflow platform for cardiovascular imaging analysis. It combines a common viewer interaction model with specialized modules for quantitative research tasks and structured exports. The `v0.9.0-research-preview` release is best positioned as a citable research software artifact and technical foundation for subsequent validation studies, not as a clinical diagnostic product.

## Figure Legends

**Figure 1. HAGRad platform overview.** Schematic showing local DICOM files/folders, browser-based viewer modules, shared DICOM and measurement engines, workflow-specific analysis pages, and structured CSV/PNG export.

**Figure 2. Main HAGRad Viewer interface.** Presentation and MPR modes with window/level, measurement, annotation, metadata overlay, and focus view controls.

**Figure 3. Workflow examples.** Representative screenshots of EAT, CCTA IQ, QCA, NoiseLab, and plaque/stent profile analysis modules using anonymized or synthetic data.

**Figure 4. Export structure.** Example research study folder containing study-level summary and rollup CSV files plus patient-level subfolders with measurement CSV/PNG outputs.

## Tables

**Table 1. HAGRad modules and primary research outputs.** Included above.

**Table 2. Suggested verification matrix for final manuscript.**

| Area | Verification item | Status for final submission |
|---|---|---|
| Loading | Local DICOM file loading | To document |
| Loading | Drag-and-drop folder loading | To document |
| Viewer | Window/level, pan, zoom, fast scroll | To document |
| MPR | Axial/coronal/sagittal reformat display | To document |
| MPR | Plane reset and focus view | To document |
| Export | Measurement CSV/PNG with Study ID | To document |
| Export | Metadata-enriched rows | To document |
| Export | Study rollup/summary generation | To document |
| Reproducibility | Release tag and DOI | Pending |
| Privacy | Public repository excludes DICOM and exports | Pending |

## Declarations

### Funding

[Insert funding statement. If none: The authors received no specific funding for this work.]

### Competing Interests

[Insert competing-interest statement.]

### Ethics Approval

This manuscript describes software development. If no patient data are included in figures, state: No human participant data are included in this technical note. If screenshots from real clinical data are used, include institutional review board/ethics approval or waiver details and confirmation that images were de-identified.

### Consent to Participate

Not applicable for a software technical note without human-subject data. Revise if clinical screenshots or user-study data are added.

### Consent to Publish

Not applicable if no identifiable participant information is included. Revise if patient images or identifying details are included.

### Data Availability

No patient-level imaging data are included in the public release. Example datasets for demonstration will use de-identified public data or synthetic data where possible. [Update with dataset DOI or TCIA/public dataset reference if used.]

### Code Availability

The HAGRad source code will be made available at [GitHub URL] under [license] as release `v0.9.0-research-preview`. The release will be archived at [Zenodo/Figshare DOI] before final publication if possible.

### Author Contributions

[Use CRediT roles. Example: Conceptualization: ...; Software: ...; Methodology: ...; Validation: ...; Writing - original draft: ...; Writing - review and editing: ...; Supervision: ...]

### AI-Assisted Development and Writing Disclosure

OpenAI ChatGPT/Codex was used as an AI-assisted software development and manuscript drafting tool during development of HAGRad and preparation of this draft. The human authors reviewed, edited, and remain accountable for all software, analyses, claims, citations, and manuscript content. The AI system is not listed as an author.

## References

1. National Electrical Manufacturers Association. Digital Imaging and Communications in Medicine (DICOM) Standard. Available at: https://www.dicomstandard.org/.

2. Nagy P. Open Source in Imaging Informatics. Journal of Digital Imaging. 2007;20:1-10. doi:10.1007/s10278-007-9056-1.

3. Fedorov A, Beichel R, Kalpathy-Cramer J, Finet J, Fillion-Robin JC, Pujol S, et al. 3D Slicer as an image computing platform for the Quantitative Imaging Network. Magnetic Resonance Imaging. 2012;30:1323-1341. doi:10.1016/j.mri.2012.05.001.

4. Schindelin J, Arganda-Carreras I, Frise E, Kaynig V, Longair M, Pietzsch T, et al. Fiji: an open-source platform for biological-image analysis. Nature Methods. 2012;9:676-682. doi:10.1038/nmeth.2019.

5. Ziegler E, Urban T, Brown D, Petts J, Pieper SD, Lewis R, Hafey C, Harris GJ. Open Health Imaging Foundation Viewer: An Extensible Open-Source Framework for Building Web-Based Imaging Applications to Support Cancer Research. JCO Clinical Cancer Informatics. 2020;4:336-345. doi:10.1200/CCI.19.00131.

6. Jodogne S. The Orthanc Ecosystem for Medical Imaging. Journal of Digital Imaging. 2018;31:341-352. doi:10.1007/s10278-018-0082-y.

7. Genereaux BW, Dennison DK, Ho K, Horn R, Silver EL, O'Donnell K, et al. DICOMweb: Background and Application of the Web Standard for Medical Imaging. Journal of Digital Imaging. 2018;31:321-326. doi:10.1007/s10278-018-0073-z.

8. Smith AM, Katz DS, Niemeyer KE, FORCE11 Software Citation Working Group. Software Citation Principles. PeerJ Computer Science. 2016;2:e86. doi:10.7717/peerj-cs.86.

9. Barker M, Chue Hong NP, Katz DS, Lamprecht AL, Martinez-Ortiz C, Psomopoulos F, et al. Introducing the FAIR Principles for research software. Scientific Data. 2022;9:622. doi:10.1038/s41597-022-01710-x.

10. Wilson G, Bryan J, Cranston K, Kitzes J, Nederbragt L, Teal TK. Good enough practices in scientific computing. PLOS Computational Biology. 2017;13:e1005510. doi:10.1371/journal.pcbi.1005510.

11. Pereira H, Romero L, Faria PM. Web-Based DICOM Viewers: A Survey and a Performance Classification. Journal of Imaging Informatics in Medicine. 2025;38:1304-1322. doi:10.1007/s10278-024-01216-5.

12. Society for Imaging Informatics in Medicine. Journal of Imaging Informatics in Medicine: About the Journal and Submission Guidance. Available at: https://siim.org/resources/publications/journal-of-imaging-informatics/.

