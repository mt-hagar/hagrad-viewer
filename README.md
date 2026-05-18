# HAGRad

**HAGRad** is an open-source framework for advanced cardiac CT research. It provides a local, browser-based DICOM research environment for cardiac CT review, multi-planar reformation, quantitative measurements, image-quality assessment, and workflow prototyping.

HAGRad is designed for retrospective scientific analysis and technical development. It is not a clinical product, not a medical device, and not intended for diagnosis, treatment decisions, procedural planning, or patient care.

## Current Modules

- **HAGRad Viewer**: Core DICOM viewer for local cardiac CT review, window/level, pan, zoom, measurements, MPR, profile analysis, structured exports, and research workflow navigation.
- **CCTA IQ**: Coronary CT angiography image-quality workflow for objective ROI measurements and subjective reader scoring.
- **EAT**: Epicardial adipose tissue workflow for contouring, threshold-based quantification, multi-reconstruction review, and structured export.
- **QCA**: Quantitative coronary angiography prototype for invasive angiography frame selection, vessel segmentation workflow, stenosis measurements, and export bundles.
- **Additional research prototypes**: CalcScorer, Contrast CalcScorer, Stent Viewer, NoiseLab, PlaqueQuant, PointGuard, and exploratory coronary workflow modules.

## CCTA IQ Functionality

The CCTA IQ module is intended for structured coronary CTA image-quality research. It supports:

- Local DICOM loading and review.
- Objective ROI placement for coronary signal, background, and noise measurements.
- Editable image-quality protocols and ROI target definitions.
- Subjective reader scoring with configurable Likert scales and categories.
- Derived image-quality metrics such as signal, noise, SNR, and CNR.
- Multi-reconstruction comparison and structured export for downstream statistical analysis.

## Installation Status

HAGRad is currently distributed as a **research-preview local web application**. The GitHub release contains the full source tree and a downloadable ZIP package.

Current status:

- macOS launcher scripts are included.
- Windows packaging is planned but not yet a polished installer.
- The viewer currently runs through a local Python HTTPS server and a browser.
- GitHub Pages documentation is served from `/docs`.

Latest release:

[HAGRad Viewer v0.9.0 Research Preview](https://github.com/mt-hagar/hagrad-viewer/releases/tag/v0.9.0-research-preview)

## Running Locally

On macOS:

1. Download and unzip the release package.
2. Run `make-local-cert.command` once if local HTTPS certificates are missing.
3. Run `start-server.command`.
4. Open `open-viewer.command`, or one of the workflow launchers such as `open-ccta-iq.command`, `open-eat.command`, or `open-qca.command`.

## Research Use Only

HAGRad is provided for research, education, and technical development only. It has not been clinically validated and must not be used as the sole basis for diagnosis, treatment selection, procedural planning, or other patient-care decisions.

Users are responsible for anonymization, institutional approvals, privacy compliance, and validation of all outputs before scientific use.

## Citation

A formal citation and manuscript reference will be added after publication.

Suggested placeholder citation:

> Hagar T. HAGRad: Open-Source Framework for Advanced Cardiac CT Research. Version 0.9.0 research preview. 2026.

See [`CITATION.cff`](CITATION.cff) for machine-readable citation metadata.

## License

This project is released under the MIT License. See [`LICENSE`](LICENSE).

## Repository

GitHub: [https://github.com/mt-hagar/hagrad-viewer](https://github.com/mt-hagar/hagrad-viewer)
