# Radiology: Cardiothoracic Imaging Submission Strategy for HAGRad

Target journal: Radiology: Cardiothoracic Imaging  
Target manuscript category: Technical Development  
Working release: HAGRad `v0.9.0-research-preview`

## Why This Version Needs a Different Angle

The JIIM version is an imaging-informatics software paper. That is still useful, but Radiology: Cardiothoracic Imaging has a more modality- and organ-system-focused readership. The strongest RSNA framing is not "we built a viewer," but:

> We developed and technically evaluated a locally hosted cardiovascular CT research workstation that standardizes cardiac CT/CCTA review, MPR, image-quality measurements, stent/plaque interface profiling, calcium-scoring research outputs, and metadata-enriched export.

For this journal, the manuscript should be narrower, more cardiac CT/CCTA focused, and more results-oriented.

## Relevant Journal Requirements

Radiology: Cardiothoracic Imaging states that the journal emphasizes research advances and technical developments in medical imaging that drive cardiothoracic medicine. Technical Developments provide a brief description and results of new imaging techniques, procedures, or equipment and are typically exploratory feasibility studies.

For Technical Developments, the journal requires:

- word count: no more than 2000 words from Introduction through Discussion
- structured abstract: no more than 250 words
- references: no more than 25
- figures: no more than 6
- tables: no more than 2
- required summary statement
- key points with summary data
- applicable checklist for human studies
- anonymized manuscript for double-anonymized peer review

The manuscript sections should be:

- Abbreviated title page
- Abstract
- Introduction
- Materials and Methods
- Results
- Discussion
- References
- Figure legends
- Tables

## What RSNA Will Likely Expect

The current software description alone may be too broad. To make this competitive as a Technical Development, we should add a small technical feasibility evaluation.

Recommended minimum evaluation:

1. Loadability and workflow completion on a set of de-identified cardiac CT/CCTA studies.
2. Successful export of measurements, metadata, PNGs, and study rollups.
3. Timing metrics, for example loading time, export time, and workflow completion time.
4. Reproducibility check for repeated exports or repeated ROI/profile measurements.
5. Optional reader task: one or two trained readers perform a defined image-quality/profile workflow.

This does not need to be a large clinical validation study, but it should produce quantitative results for the abstract and key points.

## Recommended Dataset for the Paper

Use one of these approaches:

1. De-identified institutional cardiac CT/CCTA cohort with IRB approval or waiver.
2. Public de-identified cardiac CT/CCTA datasets if suitable.
3. Synthetic/phantom DICOM data for technical verification plus de-identified clinical screenshots for demonstration.

Best RSNA option:

- `[N]` de-identified cardiac CT/CCTA examinations
- multiple reconstruction types when available, for example standard, sharp kernel, VMI, UHR, or denoised reconstructions
- one defined workflow set: viewer/MPR, CCTA IQ, stent/plaque profile, calcium scoring, metadata export

## Recommended Primary and Secondary Outcomes

Primary outcome:

- successful completion of predefined HAGRad workflows with complete CSV/PNG export.

Secondary outcomes:

- export completeness
- metadata completeness
- load/export time
- repeated-measurement variability for selected ROI/profile measurements
- number of modules successfully exercised
- user-correctable failure modes

## Suggested Figures

1. Software workflow schematic: local DICOM input, viewer/MPR, cardiac CT workflow modules, structured export.
2. Main viewer and MPR focus view screenshot.
3. CCTA image-quality ROI module screenshot.
4. Plaque/stent interface profile analysis screenshot.
5. Export-folder/indexing schematic.
6. Optional timing/completeness chart.

## Suggested Tables

Table 1: Workflow modules, cardiac CT task, measurement outputs, and export files.  
Table 2: Technical feasibility results across `[N]` de-identified studies.

## Tone and Claims

Use:

- "developed"
- "implemented"
- "technically evaluated"
- "research workstation"
- "feasibility"
- "structured export"
- "cardiovascular CT research"

Avoid:

- "first"
- "novel"
- "ground-breaking"
- "diagnostic"
- "clinical decision support"
- "validated biomarker"

## References That Fit This Journal Better

1. Radiology: Cardiothoracic Imaging Instructions for Authors. https://pubs.rsna.org/page/cardiothoracic/author-instructions.
2. Takafuji M, Kitagawa K, Mizutani S, et al. Super-Resolution Deep Learning Reconstruction for Improved Image Quality of Coronary CT Angiography. Radiology: Cardiothoracic Imaging. 2023;5(4):e230085. doi:10.1148/ryct.230085.
3. Ihdayhid AR, Tzimas G, Peterson K, et al. Diagnostic Performance of AI-enabled Plaque Quantification from Coronary CT Angiography Compared with Intravascular Ultrasound. Radiology: Cardiothoracic Imaging. 2024;6(6):e230312. doi:10.1148/ryct.230312.
4. Kwan AC, Pourmorteza A, Stutman D, Bluemke DA, Lima JAC. Next-Generation Hardware Advances in CT: Cardiac Applications. Radiology. 2021;298(1):3-17. doi:10.1148/radiol.2020192791.
5. Landsmann A, Sartoretti T, Mergen V, et al. Multi-Energy Low-Kiloelectron Volt versus Single-Energy Low-Kilovolt Images for Endoleak Detection at CT Angiography of the Aorta. Radiology: Cardiothoracic Imaging. 2024;6(2):e230217. doi:10.1148/ryct.230217.
6. Ziegler E, Urban T, Brown D, et al. Open Health Imaging Foundation Viewer: An Extensible Open-Source Framework for Building Web-Based Imaging Applications to Support Cancer Research. JCO Clinical Cancer Informatics. 2020;4:336-345. doi:10.1200/CCI.19.00131.
7. Jodogne S. The Orthanc Ecosystem for Medical Imaging. Journal of Digital Imaging. 2018;31:341-352. doi:10.1007/s10278-018-0082-y.
8. Genereaux BW, Dennison DK, Ho K, et al. DICOMweb: Background and Application of the Web Standard for Medical Imaging. Journal of Digital Imaging. 2018;31:321-326. doi:10.1007/s10278-018-0073-z.
9. Smith AM, Katz DS, Niemeyer KE, FORCE11 Software Citation Working Group. Software Citation Principles. PeerJ Computer Science. 2016;2:e86. doi:10.7717/peerj-cs.86.

## Submission Readiness Gap

Before actual submission, we should generate real values for every `[placeholder]` in the draft:

- number of cases
- date range
- age/sex if human data
- IRB/ethics language
- number of reconstructions
- technical success rate
- loading/export timing
- measurement repeatability
- GitHub release URL
- DOI/archive URL

