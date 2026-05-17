# HAGRad Viewer

HAGRad Viewer is a local research-use cardiovascular image-analysis environment.

The `v0.9.0-research-preview` GitHub release is prepared as a bundled HAGRad suite. A downloader should receive the main Viewer plus the core companion workflows:

- HAGRad Image Quality / CCTA IQ
- HAGRad EAT Workflow
- HAGRad QCA

The release bundle also includes the current companion prototypes that live in the same local codebase. See `RELEASE_NOTES.md`, `DISCLAIMER.md`, and `LICENSE.md` before public distribution or use.

This project is currently best used as a local browser-based DICOM viewer served from your own computer.

The repository now also contains a static public website draft in `website/`. It is meant as the
future `hagrad.org` landing page with workflow descriptions, research-use language, and macOS/Windows
download buttons that can point to GitHub release assets once platform-specific packages are uploaded.

It also includes a separate HAGRad Viewer – EAT Workflow for epicardial adipose tissue review.
It now also includes a separate HAGRad Viewer – Coronary Workflow for exploratory coronary CTA
workflow development.
It now also includes a separate HAGRad CalcScorer workflow for research-oriented coronary artery
calcium scoring on cardiac CT.
It now also includes a separate HAGRad Contrast CalcScorer workflow for research-oriented
post-contrast calcification estimation on coronary CTA and contrast-enhanced cardiac CT.
It now also includes a separate HAGRad CCTA IQ workflow for research-oriented objective and
subjective coronary CTA image-quality analysis.
It now also includes a separate HAGRad Stent Viewer prototype for research-oriented coronary stent
review with editable vessel tracking and stent-focused MPR.
It now also includes a separate HAGRad PointGuard reporting workspace for coronary CTA and cardiac CT
dictation-to-structured-report drafting.

## What it does

- Loads a local stack of DICOM slices
- Builds a large presentation stack viewport for live scrolling and cine playback
- Builds synchronized linked comparison viewports
- Supports window/level presets and manual WW/WL sliders
- Supports pan and zoom
- Supports measurements with length, probe, and rectangle ROI tools
- Exports the current viewport as PNG
- Exports a 4-up comparison image as PNG
- Exports the whole stack as a cine clip
- Shows orientation labels for all viewports
- Lets you switch between a large single-view presentation mode and a 4-up MPR mode
- Includes a separate HAGRad Viewer – EAT Workflow for top/bottom slice selection, pericardial contouring,
  adjustable HU thresholding with `-190` to `-30` HU defaults, slice-by-slice correction,
  multi-reconstruction transfer, heuristic and AI-assisted auto-segmentation, side-by-side
  comparison, undo/redo, session save/load, project case lists with appended measurements CSV export,
  local reference-standard feedback for AI contour learning, and final volume/HU export
- Includes a separate HAGRad CalcScorer research prototype for calcium-scoring CT series selection,
  threshold-based editable lesion detection, total Agatston/volume/equivalent-mass calculation,
  CSV export, and overlay PNG export
- Includes a separate HAGRad Contrast CalcScorer research prototype for post-contrast CTA series
  selection, reference ROI sampling, contrast-suppressed calcium estimation, editable lesion masks,
  per-category export, and explicit research-only method reporting
- Includes a separate HAGRad CCTA IQ research prototype for coronary CTA image-quality review with
  axial and MPR viewing, predefined vessel/background/noise ROI targets, subjective 1-4 scoring,
  derived signal/background/noise metrics, reconstruction-to-reconstruction measurement transfer,
  and CSV or PNG export
- Includes a separate HAGRad Stent Viewer prototype for cardiac CT / CCTA review with 4-up MPR,
  editable vessel centerlines, curved and straightened reformats, orthogonal cross-sections,
  multi-stent workflow, stent profile metrics, Study ID export, and per-stent Likert scoring
- Includes a separate HAGRad PointGuard app for coronary CTA and cardiac CT dictation capture,
  CAD-RADS 2.0-aware report structuring, missing-information prompts, editable report sections,
  and finished-report drafting

## Project files

- `manifest.xml`: PowerPoint add-in manifest
- `src/viewer.html`: main HAGRad Viewer shell
- `src/viewer.css`: viewer layout and visual styling
- `src/viewer.js`: DICOM viewer logic, Cornerstone wiring, and UI state
- `src/eat.html`: standalone HAGRad Viewer – EAT Workflow shell
- `src/eat.css`: standalone HAGRad Viewer – EAT Workflow styling
- `src/eat.js`: DICOM loading, contouring, thresholding, and export logic for EAT review
- `src/coronary/index.html`: standalone HAGRad Viewer – Coronary Workflow shell
- `src/coronary/coronary.css`: coronary workflow styling
- `src/coronary/coronary.js`: coronary centerline, segmentation, and reformat workflow logic
- `src/calcscorer/index.html`: standalone HAGRad CalcScorer shell
- `src/calcscorer/calcscorer.css`: CalcScorer styling
- `src/calcscorer/calcscorer.js`: calcium-scoring DICOM loading, detection, editing, and export logic
- `src/calcscorer/README.md`: CalcScorer methodology, phase plan, and research references
- `src/contrast-calcscorer/index.html`: standalone HAGRad Contrast CalcScorer shell
- `src/contrast-calcscorer/contrast-calcscorer.css`: contrast-research workflow styling
- `src/contrast-calcscorer/constants.js`: workflow, label, and reference definitions
- `src/contrast-calcscorer/dicom.js`: CTA-focused DICOM loading, series ranking, and spectral/VNC detection
- `src/contrast-calcscorer/estimation.js`: reference ROI sampling, candidate-map generation, editing composition, and scoring
- `src/contrast-calcscorer/main.js`: UI state, rendering, exports, and finish-close flow
- `src/contrast-calcscorer/README.md`: method note, limitations, and supporting references
- `src/ccta-iq/index.html`: standalone HAGRad CCTA IQ shell
- `src/ccta-iq/ccta-iq.css`: CCTA IQ workflow styling
- `src/ccta-iq/ccta-iq.js`: CCTA IQ viewer, ROI analysis, subjective scoring, and export logic
- `src/stent/index.html`: standalone HAGRad Stent Viewer shell
- `src/stent/stent.css`: HAGRad Stent Viewer styling
- `src/stent/stent.js`: editable coronary/stent MPR, profile tools, multi-stent workflow, and export logic
- `src/pointguard/index.html`: standalone HAGRad PointGuard reporting workspace shell
- `src/pointguard/pointguard.css`: PointGuard styling
- `src/pointguard/pointguard.js`: realtime-aware dictation handling, coronary parsing, CAD-RADS logic, and report drafting
- `.env.pointguard.example`: example environment file for PointGuard medical dictation backend setup
- `open-eat.command`: opens the dedicated EAT workflow in your browser
- `open-coronary.command`: opens the dedicated coronary workflow in your browser
- `open-calcscorer.command`: opens the dedicated CalcScorer workflow in your browser
- `open-contrast-calcscorer.command`: opens the dedicated Contrast CalcScorer workflow in your browser
- `open-ccta-iq.command`: opens the dedicated HAGRad CCTA IQ workflow in your browser
- `open-stent.command`: opens the dedicated HAGRad Stent Viewer prototype in your browser
- `open-pointguard.command`: opens the dedicated HAGRad PointGuard reporting workspace in your browser
- `start-coronary-server.command`: starts the separate local HTTPS server for the coronary workflow

## Runtime model

This version serves the viewer from `https://localhost:3020` and loads the viewer libraries from the local `vendor/` folder.

That means:

- no `esm.sh` dependency
- no Node build step
- the browser viewer is the recommended way to run it on your Mac

## How to run it

You need to host this folder on a local HTTPS server at `https://localhost:3020`.

The manifest currently points to:

- `https://localhost:3020/src/viewer.html`

Then open the viewer in your browser:

1. Double-click `open-viewer.command`.
2. Your browser should open the viewer page.
3. Drag your DICOM files into the viewer or use `Load DICOM Series`.

To open the dedicated EAT workflow:

1. Double-click `open-eat.command`.
2. Load one axial CT series or drag a study folder into the page.
3. Use `Add Recon Files` or `Add Recon Folder` when you want to compare additional reconstructions
   from the same patient, including separate acquisitions when you want a best-effort transfer.
4. Follow the guided workflow panel to keep track of the next recommended step.
5. Use the grouped collapsible sidebar sections to focus on `Workflow`, `Segmentation`,
   `Display & Review`, or `Export & Study` as needed.
6. Keyboard shortcuts cover the main EAT workflow: `C` contour, `E` adjust, `R` rubber, `M` pan,
   `Z` zoom, `G` anchor-based segment, `A` Automatic EAT, `I` Model Assist, `K` Store Reference,
   `T` transfer, `V` compare, `O` overlay, `[`/`]` top-bottom, and `,`/`.` copy previous-next.
7. Set the top and bottom slices for the shared EAT slab.
8. Either trace a few anchor slices for semi-automatic propagation, jump straight to `Automatic EAT`
   for a fully automatic browser heuristic pass, or use `Model Assist` when you want the local
   Python backend to run a trained heart localization model first.
9. Use `Let's Go Segment` when you want anchor-based propagation, `Automatic EAT` when you want
   the slab contoured without anchors in-browser, or `Model Assist` when you want the local
   model-assisted pass, then adjust any slice you want manually.
10. Use `Rubber` on any slice when you want to exclude a round region from the EAT count without
   changing the contour.
11. Use `Store Reference` after you finish manual corrections when you want to store that case as
    a local reference standard and update the contour profile used by future `Model Assist` runs.
12. Use `Pan (M)` to move the image and `Zoom (Z)` to zoom with drag or mouse wheel when you want
    finer navigation.
13. Enable compare mode if you want to review a second reconstruction side by side at the same
   slice and zoom level.
14. Use `Copy To Other Recons` to copy the contour set to all loaded reconstructions. Matching
    stacks receive a direct transfer, while separate-occasion or mismatched stacks receive a
    best-effort mapped transfer that you can still adjust afterward.
15. Use undo/redo while you work, and save a session JSON if you want to resume the same study
    later.
16. Export a PNG report and CSV for simultaneous EAT volume, mean density, and density SD results across the loaded
   reconstructions.

## Suggested presentation workflow

1. Export or copy one axial CT series to a folder.
2. Double-click `open-viewer.command`.
3. Load the DICOM files or drag the folder contents into the viewer.
4. Use presentation mode for live case discussion.
5. Switch to `4-up Linked` mode when you want four synchronized panels.
6. Use the export buttons to save PowerPoint-ready PNGs or a cine clip.

## Suggested EAT workflow

1. Double-click `open-eat.command`.
2. Load one axial cardiac CT reconstruction as your contouring reference.
3. Add any other reconstructions you want to compare, such as different VMI keV levels or the
   same patient scanned on a different occasion.
4. Use the guide section to see which workflow step is currently recommended.
5. Use the grouped sidebar to open the part of the workflow you need without keeping every control
   visible at once.
6. Use the shortcut keys when helpful: `C`, `E`, `R`, `M`, `Z`, `G`, `A`, `I`, `K`, `T`, `V`, `O`,
   `[`/`]`, `,`/`.`, `X`, `Shift+X`, `-`, `+`, and `0`.
7. Use the current slice controls to define the superior and inferior limits.
8. Choose between three segmentation starts: draw several representative anchor slices and use
   `Let's Go Segment`, run `Automatic EAT` for a fully automatic heuristic first pass, or run
   `Model Assist` for a local model-assisted heart-first contour proposal.
9. Review and adjust any auto-generated slice as needed. Rerunning any segmentation mode keeps
   your manual and rubber-corrected slices protected.
10. `Model Assist` uses the local Python backend on `https://localhost:3020/api/eat/backend/*`.
    It prefers a licensed high-resolution TotalSegmentator heart task when configured, otherwise it
    falls back to the open cardiac ROI model and imports editable contours back into the same EAT UI.
11. Use `Store Reference (K)` once you have manually corrected slices you trust. It stores the
    active reconstruction and confirmed manual contours locally under `.tooling/eat_training_feedback`.
    If the AI backend is ready it also updates the learned contour profile used by future
    `Model Assist` runs; if the AI backend is offline, the reference-standard case is still stored
    locally for later learning.
12. Use `Rubber` to remove unwanted thresholded regions from the EAT tally on any slice while
    keeping the contour intact.
13. Review the threshold overlay using your chosen HU range. The defaults are `-190` to `-30` HU.
14. Use `Pan (M)` to move the view and `Zoom (Z)` for zoom-focused review.
15. Turn on compare mode when you want synchronized side-by-side review of another reconstruction.
16. Use `Copy To Other Recons` to copy the contour set to the other reconstructions. Exact
    matches get a direct transfer, and different stack geometries get a best-effort mapped
    contour set for review.
17. Choose or create the `Research Study` in the export popup when you finish a case. The EAT
    workflow mirrors PNG and CSV exports into the same study outbox structure used by the other apps.
18. Use undo/redo for fast correction and save a session JSON if you want to reopen the same study
    state later.
19. Repeat model-assist runs and reference submissions reuse a local backend study cache when the same
    reconstruction is loaded again, which avoids re-uploading the full DICOM stack each time.
20. Export prompts for a required `Study ID`, writes it into the PNG report and CSV output, and
    mirrors both files into the selected research-study outbox when you choose one.
21. Use `Finish & Close` when you want the app to export both PNG and CSV together and then clear
    the current patient from the viewer for the next case.

To open the dedicated coronary workflow:

1. Double-click `open-coronary.command`.
2. Load one coronary CTA series or drag a series folder into the page.
3. Use `Auto Segment Coronary Tree` when you have a local segmentation backend installed, or use
   `Coronary Click` as the current in-browser fallback.
4. If you use the click workflow, finish the draft to build a heuristic centerline, lumen contour
   profile, and curved/straightened reformats.
5. Refine the active cross-section with the contour buttons or by dragging in the orthogonal panel.
6. The coronary prototype runs from its own HTTPS server on `https://localhost:3010` so its backend
   API does not affect the general viewer.

To open HAGRad CalcScorer:

1. Double-click `open-calcscorer.command`.
2. Load a study or DICOM series folder.
3. Choose the best non-contrast ECG-gated cardiac CT series when multiple series are listed.
4. Run Phase 1 calcium detection, review the editable lesion mask, and export CSV or PNG.
5. Treat the output as research-only until further validation and vessel-labeling phases are built.

To open HAGRad Contrast CalcScorer:

1. Double-click `open-contrast-calcscorer.command`.
2. Load a post-contrast coronary CTA or contrast-enhanced cardiac CT study.
3. Choose the most appropriate contrast-enhanced series, especially when spectral or VNC-derived
   reconstructions are present.
4. Set the analysis slab, pick the required reference ROIs, and run the research estimate.
5. Treat conventional CTA outputs as post-contrast research estimates rather than standard
   Agatston scores.

To open HAGRad CCTA IQ:

1. Double-click `open-ccta-iq.command`.
2. Load one coronary CTA series as the active reconstruction, then optionally add other reconstructions for comparison.
3. Use the compact workflow sidebar to move through ROI placement, subjective 1-4 reader scoring, reconstruction transfer, and export.
4. Treat the current output as a research workstation prototype for coronary CTA image-quality review and export.

To open HAGRad Stent Viewer:

1. Double-click `open-stent.command`.
2. Load one cardiac CT / CCTA series as the reference reconstruction.
3. Add other reconstructions for the same patient when you want synchronized comparison and per-reconstruction export.
4. Build the vessel path with anchor clicks, refine the centerline in the orthogonal cross-section, and drag the stent endpoints in the curved or straightened views.
5. Add line or square profiles for stent metrics, save each stent with `Next Stent`, and use `Finish Patient` for Study ID, per-stent Likert scoring, and final PNG/CSV export.

To open HAGRad PointGuard:

1. Double-click `open-pointguard.command`.
2. For premium medical dictation, create `.env.pointguard` in the repo root and add `OPENAI_API_KEY=...` before starting the local server. PointGuard then prefers realtime WebRTC dictation with `gpt-4o-mini-transcribe`, falls back to upload transcription with `gpt-4o-transcribe`, and otherwise falls back to browser speech when available.
3. Dictate into the live transcript field or type/paste a colloquial coronary CTA or cardiac CT draft.
4. Use `Space` to start or stop dictation and `Enter` to stop dictation and run `Go Ahead!`.
5. Use `Go Ahead!` to structure the dictated text into an editable report draft.
6. Review the CAD-RADS 2.0 block, vessel table, and missing-information prompts.
7. Edit the structured report blocks and copy the finished report text when you are happy with it.

For a local PointGuard regression sweep while refactoring:

- Run `python3 scripts/pointguard_regression_check.py`
- The fixture corpus lives in `src/pointguard/fixtures/regression-cases.json`

## Controls

- Mouse wheel: scroll slices
- Arrow keys / `Page Up` / `Page Down`: scroll the focused viewport
- Space: play or pause cine
- `W`: WW/WL tool
- `P`: pan tool
- `Z`: zoom tool
- `L`: length tool
- `B`: probe tool
- `R`: rectangle ROI tool
- `M`: toggle layout

You can also type exact numeric values for `window width` and `window level` in the sidebar.

## References used while building

- [Cornerstone examples](https://www.cornerstonejs.org/live-examples/)
- [Cornerstone tutorials](https://www.cornerstonejs.org/docs/tutorials/)
- [Cornerstone tool concepts](https://www.cornerstonejs.org/docs/concepts/cornerstone-tools/tools/)
- [Office Add-in requirements](https://learn.microsoft.com/en-us/office/dev/add-ins/concepts/requirements-for-running-office-add-ins)
- [PowerPoint add-in quickstart](https://learn.microsoft.com/en-us/office/dev/add-ins/quickstarts/powerpoint-quickstart)
- [If localhost fails inside Office](https://learn.microsoft.com/en-us/office/troubleshoot/office-suite-issues/cannot-open-add-in-from-localhost)

## Important limitation

This is a presentation viewer, not a validated diagnostic viewer. It is currently a linked-stack browser viewer, not a true 3D MPR workstation.
