# HAGRad JIIM Literature Research Memo

Prepared for a prospective manuscript submission to the Journal of Imaging Informatics in Medicine (JIIM).

## Proposed Submission Category

The strongest fit is a **Technical Note** or **Experience Report**.

JIIM explicitly considers hypothesis-driven research, experience reports, technical notes/tutorials, and reviews. SIIM's submission guidance emphasizes that manuscripts reporting validation and implementation of imaging informatics technologies and tools are favored over purely descriptive algorithm papers. For HAGRad, the most defensible framing is therefore:

> A workflow-oriented technical note describing the design, implementation, and research-use deployment of a locally hosted, browser-based DICOM platform for cardiovascular imaging research.

This is stronger than presenting HAGRad as a clinical diagnostic viewer or as a fully validated quantitative biomarker engine. The paper should clearly state that HAGRad is a research prototype, not a cleared medical device.

## Journal Fit

JIIM is the official peer-reviewed journal of the Society for Imaging Informatics in Medicine (SIIM). Its scope includes medical imaging informatics, machine learning, engineering, information technologies, and clinical/research settings. The journal publishes online-first articles, which SIIM states are fully citable before print publication.

The manuscript should follow the Technical Note structure recommended by Springer/JIIM:

- Abstract
- Background
- Methods
- Results
- Discussion
- Conclusion
- Acknowledgements

The abstract should be 150-250 words, and the manuscript should include standard Springer declarations such as funding, conflicts of interest, ethics, consent, data availability, code availability, and author contributions. JIIM uses double-blind peer review, so a blinded manuscript version will also be needed.

## Literature Themes

### 1. Open-source imaging informatics is a recognized scholarly contribution

Nagy's 2007 Journal of Digital Imaging article positioned open-source imaging informatics as an important driver of DICOM adoption, interoperability, education, clinical troubleshooting, and research innovation. This older paper is still useful because it shows that JIIM/JDI has a long editorial tradition of publishing work about imaging informatics tools and open-source ecosystems.

Implication for HAGRad:

- Frame HAGRad as a contribution to the imaging informatics tool ecosystem.
- Emphasize transparency, modifiability, reproducible exports, and local institutional use.
- Avoid vague "viewer" language only; describe the specific unmet workflow need.

### 2. Web-based and zero-footprint viewers are established, but often general-purpose

OHIF is the strongest comparator. The OHIF Viewer paper describes a browser-based, extensible open-source framework with image manipulation, measurements, MPR, extension points, and DICOMweb-oriented architecture. OHIF is designed as a general platform for broad imaging applications and cancer research infrastructure.

Implication for HAGRad:

- Do not claim HAGRad is the first browser-based DICOM viewer.
- Differentiate HAGRad as a locally hosted, cardiovascular research-workflow platform that combines viewer interaction, measurement tools, per-workflow modules, and structured exports.
- Mention that HAGRad prioritizes rapid lab-specific workflow iteration rather than replacing mature enterprise viewers.

### 3. Research platforms need flexible image workflows outside standard PACS

The XNAT-OHIF integration paper notes that research studies often have visualization and data-handling requirements not well served by routine PACS. Orthanc similarly highlights the need for flexible medical imaging infrastructure and programmable interfaces in research and hospital environments.

Implication for HAGRad:

- Position HAGRad as a local workstation for retrospective research cohorts, observer studies, quantitative image-quality analysis, and method prototyping.
- Emphasize the benefit of keeping DICOM processing local while exporting structured CSV/PNG outputs for downstream statistics.

### 4. DICOM metadata and standards matter

DICOM is the international standard for medical images and related information. DICOMweb has extended DICOM into modern web-based workflows, enabling new modes of image retrieval, display, and analytics.

Implication for HAGRad:

- Explain that HAGRad reads DICOM metadata and pixel data locally.
- Describe rescale slope/intercept, pixel spacing, slice spacing, study/series identifiers, and reconstruction metadata as central to export reproducibility.
- Be transparent that HAGRad currently focuses on local files rather than PACS/DICOMweb archive integration.

### 5. Quantitative imaging demands reproducibility, structured outputs, and software citation

QIBA, FAIR4RS, and software-citation literature support the idea that research software should expose versioned methods, clear metadata, structured outputs, and persistent identifiers. The FORCE11 software citation principles specifically recommend citing software with version, authorship, repository, release date, and persistent identifier.

Implication for HAGRad:

- Release HAGRad as `v0.9.0-research-preview`.
- Archive the release via Zenodo/Figshare before final submission if possible.
- Include `CITATION.cff`, a license/disclaimer, and stable documentation.
- Cite the exact release version in the manuscript.

### 6. Good research software practices strengthen the manuscript

"Good enough practices in scientific computing" emphasizes project organization, documentation, version control, explicit dependencies, changelog, software citation, and reproducible data outputs. These map directly onto what HAGRad needs before public release.

Implication for HAGRad:

- Add a clean `.gitignore` before GitHub publication.
- Keep generated exports, DICOM files, local certificates, tool caches, and patient-like identifiers out of GitHub.
- Provide a user guide, export schema, and changelog.
- Include small synthetic/example data or instructions for using de-identified public data.

## Key References to Use in the Paper

1. Nagy P. Open Source in Imaging Informatics. Journal of Digital Imaging. 2007;20:1-10. doi:10.1007/s10278-007-9056-1.

2. Ziegler E, Urban T, Brown D, Petts J, Pieper SD, Lewis R, Hafey C, Harris GJ. Open Health Imaging Foundation Viewer: An Extensible Open-Source Framework for Building Web-Based Imaging Applications to Support Cancer Research. JCO Clinical Cancer Informatics. 2020;4:336-345. doi:10.1200/CCI.19.00131.

3. Jodogne S. The Orthanc Ecosystem for Medical Imaging. Journal of Digital Imaging. 2018;31:341-352. doi:10.1007/s10278-018-0082-y.

4. Genereaux BW, Dennison DK, Ho K, Horn R, Silver EL, O'Donnell K, Kahn CE Jr. DICOMweb: Background and Application of the Web Standard for Medical Imaging. Journal of Digital Imaging. 2018;31:321-326. doi:10.1007/s10278-018-0073-z.

5. Pereira H, Romero L, Faria PM. Web-Based DICOM Viewers: A Survey and a Performance Classification. Journal of Imaging Informatics in Medicine. 2025;38:1304-1322. doi:10.1007/s10278-024-01216-5.

6. Fedorov A, Beichel R, Kalpathy-Cramer J, et al. 3D Slicer as an image computing platform for the Quantitative Imaging Network. Magnetic Resonance Imaging. 2012;30:1323-1341. doi:10.1016/j.mri.2012.05.001.

7. Schindelin J, Arganda-Carreras I, Frise E, et al. Fiji: an open-source platform for biological-image analysis. Nature Methods. 2012;9:676-682. doi:10.1038/nmeth.2019.

8. Smith AM, Katz DS, Niemeyer KE, FORCE11 Software Citation Working Group. Software Citation Principles. PeerJ Computer Science. 2016;2:e86. doi:10.7717/peerj-cs.86.

9. Barker M, Chue Hong NP, Katz DS, et al. Introducing the FAIR Principles for research software. Scientific Data. 2022;9:622. doi:10.1038/s41597-022-01710-x.

10. Wilson G, Bryan J, Cranston K, Kitzes J, Nederbragt L, Teal TK. Good enough practices in scientific computing. PLOS Computational Biology. 2017;13:e1005510. doi:10.1371/journal.pcbi.1005510.

11. National Electrical Manufacturers Association. Digital Imaging and Communications in Medicine (DICOM) Standard. Available at: https://www.dicomstandard.org/.

12. Society for Imaging Informatics in Medicine. Journal of Imaging Informatics in Medicine: About the Journal and Submission Guidance. Available at: https://siim.org/resources/publications/journal-of-imaging-informatics/.

## Suggested Narrative Gap

Existing platforms have established the feasibility and value of open-source and web-based medical image viewing. However, cardiovascular imaging research groups often need a smaller, locally modifiable tool that couples standard DICOM review, MPR, specific quantitative workflows, and structured tabular exports without requiring institutional PACS integration or a complex extension ecosystem.

HAGRad addresses this gap by providing a locally hosted, browser-based research workstation with dedicated modules for general cardiac CT viewing, EAT analysis, CCTA image quality, calcium scoring, contrast calcification estimation, QCA prototyping, stent/plaque interface profiling, NoiseLab, and structured export indexing.

## Manuscript Risk Points

These should be handled explicitly:

- HAGRad is not a certified medical device.
- No clinical diagnostic claims should be made.
- A formal multi-reader usability study has not yet been performed.
- Quantitative algorithms are workflow-specific and require validation before use as clinical biomarkers.
- Public GitHub release must exclude patient data, local exports, certificates, and local environment folders.
- Some modules are mature enough for technical description, while others should be labeled as research prototypes.

## What Would Strengthen Submission Before Final Upload

1. Public GitHub repository with clean release `v0.9.0-research-preview`.
2. DOI archived release on Zenodo/Figshare.
3. License/disclaimer and code availability statement.
4. Two to four anonymized screenshots or schematic screenshots.
5. One figure showing software architecture.
6. One table listing each module, input, tools, quantitative outputs, and export files.
7. A small verification table showing tested browsers/OS and major workflows.
8. Example export bundle generated from de-identified or synthetic data.
9. A blinded manuscript version without author-identifying details.

