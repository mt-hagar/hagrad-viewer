#!/usr/bin/env python3

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
JXA_TEST = ROOT / "scripts" / "test_noisepower_core.jxa"
CORE_JS = ROOT / "src" / "noisepower" / "noisepower-core.js"
APP_JS = ROOT / "src" / "noisepower" / "noisepower.js"
EXPORT_JS = ROOT / "src" / "noisepower" / "noisepower-export.js"
HTML = ROOT / "src" / "noisepower" / "index.html"
CSS = ROOT / "src" / "noisepower" / "noisepower.css"


def run_static_contract() -> dict:
    html = HTML.read_text(encoding="utf-8")
    js = APP_JS.read_text(encoding="utf-8")
    core = CORE_JS.read_text(encoding="utf-8")
    export = EXPORT_JS.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")

    html_ids = set(re.findall(r'id="([^"]+)"', html))
    js_ids = set(re.findall(r'getElementById\("([^"]+)"\)', js))
    dynamic_ids = {"np-selected-label"}
    missing = sorted(js_ids - html_ids - dynamic_ids)
    if missing:
      raise RuntimeError("Noise Power UI contract failed. Missing ids: " + ", ".join(missing))

    required_markers = [
        "ROI_noise_square",
        "Noise_Power_circle",
        "NPS_ROI_TYPE",
        "NPS_2D(fx,fy) = dx * dy / (Nx * Ny)",
        "noise_power_data.xls",
        "Square ROI Summary",
        "Square ROI Profiles",
        "TTF Metrics",
        "TTF Curves",
        "NPS ROI Summary",
        "NPS Curve 1D",
        "NPS Metrics",
        "buildSpreadsheetWorkbookXml",
        "nps_2d_matrix.json",
        "analysis_metadata.json",
        "README.txt",
        'option value="24"',
        "workspace-page-tabs",
        "collapse-toggle",
        "np-series-controls",
        "np-report-table",
        "np-show-nps-labels",
        "np-profile-series-controls",
        "np-ttf-esf-canvas",
        "np-ttf-curve-canvas",
        "TTFxy".lower(),
        "squareProfileSeriesFromModels",
        "series-order-control",
        "series-order-button",
        "bindSeriesListOrderControls",
        "syncReconstructionPrefsForModels",
        "seriesOrderDrag",
        "moveSeriesKey",
        "moveSeriesByDelta",
        "getRelatedNpsCircles",
        "getCircleGroupRootId",
        "getRoiGroupRootId",
        "findRelatedObjectForDataset",
        "series-color-palette",
        "normalizePlotColor",
        "np-dicom-toggle-button",
        "np-grid-toggle-button",
        "drawGridOverlay",
        "showGridOverlay",
        "cancelTransientViewportInteraction",
        "Move or resize the circle to edit the layout",
        "TTFxy not valid",
        "TTF square ROI comparison",
        "np-nps-analysis-status",
        "focusAnalysisForSelection",
        "updateNpsAnalysisStatus",
        "Could not render NPS series controls",
        "20260524-analysis-labels",
        "Noise Power",
        "CT phantom square ROI",
        "np-sidebar-tabs",
        "data-np-sidebar-jump",
        "installSidebarJumpTabs",
        "frequencyAtPeakFractionTail",
        "f10_tail_mm_minus_1",
        "f10 tail",
        "rho10_lp_cm",
        "rho_max_lp_cm",
        "rhoMax = Nyquist",
        "kernel_rho10_reference_lp_cm",
        "kernel_rho50_reference_lp_cm",
        "kernel_rho02_reference_lp_cm",
        "Kernel MTF references",
        "roi_count_total",
        "copySourceSetId",
        "Synced",
        "valid squares",
        "drawOverviewNpsHeatmap",
        "per-reconstruction 2D NPS heatmaps",
        "npsModelFigureToken",
        "sharedNpsHeatmapColorMax",
        "fcols [1/mm]",
        "frows [1/mm]",
        'String(safeString(value) || "").trim()',
        "buildCachedNpsModels",
        "HAGRadWorkflowGuardState",
        "allowWorkflowSwitch",
        "beforeunload",
        "hagrad-workflow-switcher.js",
        "scheduleAnalysisRefresh",
        "all_reconstructions_roi_summary_panel.png",
        "drawReconstructionOverviewPanel",
        "Appendix A: All Reconstructions ROI Review Board",
        "object-fit: contain",
        "@page { size: A4",
        "np-print-report-button",
        "buildPrintReportHtml",
        "createCanvasDataUrl",
        "reconstruction_label",
        "series_number",
        'option value="42"',
        "isEditableEventTarget",
        "cmd/Ctrl".lower(),
    ]
    combined = "\n".join([html, js, core, export, css]).lower()
    missing_markers = [marker for marker in required_markers if marker.lower() not in combined]
    if missing_markers:
        raise RuntimeError("Noise Power feature contract failed. Missing markers: " + ", ".join(missing_markers))

    behavior_markers = [
        "Cmd/Ctrl + wheel zooms",
        "Right drag scrolls",
        "generateNpsRoisForCircle",
        "copyCurrentSliceAnalysisToAllRecons",
        "mapSquareRoiToTarget",
        "mapCircleToTarget",
        "buildMandatoryExportFiles",
        "createNoisePowerPngFiles",
        "undo()",
        "redo()",
    ]
    missing_behavior = [marker for marker in behavior_markers if marker not in "\n".join([html, js, core, export])]
    if missing_behavior:
        raise RuntimeError("Noise Power behavior contract failed. Missing markers: " + ", ".join(missing_behavior))

    if ".viewport-stage" not in css or "touch-action: none" not in css:
        raise RuntimeError("Noise Power canvas styling contract failed.")

    return {"htmlIds": len(html_ids), "jsIds": len(js_ids)}


def run_jxa() -> dict:
    completed = subprocess.run(
        ["osascript", "-l", "JavaScript", str(JXA_TEST)],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        message = completed.stderr.strip() or completed.stdout.strip() or "Noise Power JXA test failed."
        raise RuntimeError(message)
    output = "\n".join(part for part in [completed.stdout.strip(), completed.stderr.strip()] if part).strip()
    match = re.search(r"\{[\s\S]*\}", output)
    if not match:
        raise RuntimeError(f"Could not parse Noise Power JXA output:\n{output}")
    return json.loads(match.group(0))


def main() -> int:
    try:
        static = run_static_contract()
        result = run_jxa()
    except RuntimeError as exc:
        print(str(exc))
        return 1

    print("Noise Power core regression test passed.")
    print(f"- UI ids referenced: {static['jsIds']} / {static['htmlIds']}")
    print(f"- ROI pixels: {result['roiPixels']}")
    print(f"- NPS layout ROIs: {result['npsRois']}")
    print(f"- Integrated NPS: {result['npsIntegrated']}")
    print(f"- Mapped edge px: {result['mappedEdgePx']}")
    print(f"- Mandatory export files: {result['exportFiles']}")
    print(f"- NPS curve rows: {result['curveRows']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
