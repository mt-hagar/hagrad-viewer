# HAGRad

**HAGRad** is an open-source framework for advanced cardiac CT research. It provides a local, browser-based DICOM research environment for cardiac CT review, multi-planar reformation, quantitative measurements, image-quality assessment, and workflow prototyping.

HAGRad is designed for retrospective scientific analysis and technical development. It is not a clinical product, not a medical device, and not intended for diagnosis, treatment decisions, procedural planning, or patient care.

## Current Modules

- **HAGRad Viewer**: Core DICOM viewer for local cardiac CT review, window/level, pan, zoom, measurements, MPR, vessel profile, blooming/stenosis diameter tools, structured exports, and research workflow navigation.
- **CCTA IQ**: Coronary CT angiography image-quality workflow for objective ROI measurements and subjective reader scoring.
- **EAT**: Epicardial adipose tissue workflow for contouring, threshold-based quantification, multi-reconstruction review, and structured export.
- **QCA**: Quantitative coronary angiography prototype for invasive angiography frame selection, vessel segmentation workflow, stenosis measurements, and export bundles.
- **Noise Power**: CT phantom physics workflow for square ROI noise statistics, circular NPS placement, multi-reconstruction NPS comparison, TTF/NPS reporting, and reproducible ZIP export.

## CCTA IQ Functionality

The CCTA IQ module is intended for structured coronary CTA image-quality research. It supports:

- Local DICOM loading and review.
- Objective ROI placement for coronary signal, background, and noise measurements.
- Editable image-quality protocols and ROI target definitions.
- Subjective reader scoring with configurable Likert scales and categories.
- Derived image-quality metrics such as signal, noise, SNR, and CNR.
- Multi-reconstruction comparison and structured export for downstream statistical analysis.

## Installation Status

HAGRad is moving from a script-based research preview to app-style desktop packages.

Current packaging targets:

- macOS: `HAGRad-Viewer-macOS.dmg` containing one `HAGRad Viewer.app`.
- Windows: `HAGRad-Viewer-Windows.zip` containing one obvious `HAGRad Viewer.exe`, built on Windows.
- The app/exe launcher embeds the Python runtime with PyInstaller, starts the local HAGRad server internally, and opens the viewer in the default browser.
- No normal user should need to run `python3`, install Apple Command Line Developer Tools, install OpenSSL, or choose between workflow-specific launchers.
- The public launcher opens the main HAGRad Viewer. Image Quality / CCTA IQ, EAT, and QCA remain available from inside the HAGRad Viewer interface.
- Local HTTP fallback is used at `http://localhost:3020` when no local HTTPS certificate is available. DICOM files still remain on the user's computer.
- macOS Developer ID signing and notarization are documented in `packaging/macos/README.md`. Unsigned developer builds are possible but can still trigger Gatekeeper warnings.
- Legacy `.command` and `.bat` launchers remain for source/developer workflows while app packaging matures.
- GitHub Pages documentation is served from `/docs`.

Latest release:

[HAGRad Viewer v0.9.0 Research Preview](https://github.com/mt-hagar/hagrad-viewer/releases/tag/v0.9.0-research-preview)

## Running Locally

For packaged macOS builds:

1. Open `HAGRad-Viewer-macOS.dmg`.
2. Double-click `HAGRad Viewer.app`.
3. First launch only: if macOS says the developer cannot be verified, Control-click the app, choose Open, then confirm Open.
4. The app starts the bundled local server and opens HAGRad Viewer in the browser.

For packaged Windows builds:

1. Right-click `HAGRad-Viewer-Windows.zip` and choose **Extract All**.
2. Open the extracted folder, then double-click `HAGRad Viewer.exe`.
3. First launch only: if Windows SmartScreen appears, choose More info, then Run anyway if you downloaded it from the official release page.
4. The executable starts the bundled local server and opens HAGRad Viewer in the browser.

For source/developer workflows:

```bash
python3 scripts/serve_https.py
```

or use the legacy platform launchers in the repository root.

Build package artifacts:

```bash
packaging/macos/build-hagrad-viewer-app.sh
powershell -ExecutionPolicy Bypass -File packaging/windows/build-hagrad-viewer-exe.ps1
```

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
