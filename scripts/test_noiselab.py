#!/usr/bin/env python3

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
JXA_TEST = ROOT / "scripts" / "test_noiselab_core.jxa"
NOISELAB_JS = ROOT / "src" / "noiselab" / "noiselab.js"
NOISELAB_HTML = ROOT / "src" / "noiselab" / "index.html"
NOISELAB_CSS = ROOT / "src" / "noiselab" / "noiselab.css"


def run_static_ui_contract_test() -> dict:
    js = NOISELAB_JS.read_text(encoding="utf-8")
    html = NOISELAB_HTML.read_text(encoding="utf-8")
    css = NOISELAB_CSS.read_text(encoding="utf-8")
    html_ids = set(re.findall(r'id="([^"]+)"', html))
    js_ids = set(re.findall(r'getElementById\("([^"]+)"\)', js))
    dynamic_ids = {
        "noiselab-roi-label-input",
        "noiselab-roi-visible-input",
        "noiselab-roi-center-x",
        "noiselab-roi-center-y",
        "noiselab-roi-edge-px",
        "noiselab-roi-edge-mm",
    }
    missing = sorted(js_ids - html_ids - dynamic_ids)
    if missing:
        raise RuntimeError(f"NoiseLab UI contract failed. Missing HTML ids referenced by JS: {', '.join(missing)}")

    menu_actions = set(re.findall(r'data-roi-menu-action="([^"]+)"', html))
    handled_actions = set(re.findall(r'action === "([^"]+)"', js))
    missing_actions = sorted(menu_actions - handled_actions)
    if missing_actions:
        raise RuntimeError(
            "NoiseLab ROI context menu contract failed. Missing handlers for: "
            + ", ".join(missing_actions)
        )

    priority_markers = [
        'if (hit && !forceToolPlacement)',
        'if (state.activeTool === "npsConcentric")',
        'if (state.activeTool === "squareRoi")',
    ]
    missing_priority_markers = [marker for marker in priority_markers if marker not in js]
    if missing_priority_markers:
        raise RuntimeError(
            "NoiseLab ROI edit-priority contract failed. Missing markers: "
            + ", ".join(missing_priority_markers)
        )
    if not (
        js.index('if (hit && !forceToolPlacement)')
        < js.index('if (state.activeTool === "npsConcentric")')
        < js.index('if (state.activeTool === "squareRoi")')
    ):
        raise RuntimeError(
            "NoiseLab ROI edit-priority contract failed. Existing ROI hit-testing must run before "
            "NPS or square-ROI tool placement."
        )

    zip_export_markers = [
        "function createZipBlob",
        "function downloadBlob",
        "noiselab-export-mirror-outbox",
        "Download Noise Analysis ZIP",
        "Primary export downloads one ZIP file",
    ]
    missing_zip_markers = [marker for marker in zip_export_markers if marker not in f"{js}\n{html}"]
    if missing_zip_markers:
        raise RuntimeError(
            "NoiseLab ZIP export contract failed. Missing markers: "
            + ", ".join(missing_zip_markers)
        )

    roi_list_markers = [
        "data-roi-delete-id",
        'card.addEventListener("dblclick"',
        'setActiveTool("select")',
        "function deleteRoiById",
        "function handleCanvasContextMenu",
        "function isContextMenuGesture",
        "startedByContextGesture",
        "Drag the ROI body to move it; drag corner handles to resize",
        "function getCanvasClientScale",
        "function scheduleRender",
        "function roiGeometryCacheSignature",
        "ResizeObserver",
        "rgba(0, 0, 0, 0.92)",
        'options.openViewer !== false',
        "function revealPlacedRoi",
        "suppressSliceWheelUntil",
        "placed and selected",
        "function buildBoundedNpsLayout",
        "function computeMaxNpsRingSpacing",
        "function clipToSourceImage",
        "function revealNpsLayout",
        "function isRoiFullyInsideSource",
        "The NPS radius you placed would extend outside the CT image",
        "NoiseLab will not silently relocate it",
        "function createConcentricNpsRoisExact",
        "function buildNpsDraftPreview",
        "function handleCanvasDoubleClick",
        "NPS center set. Move the mouse to size the circle, then double-click",
        "function clearCurrentSliceNpsSets",
        "staleRoiIds",
        "function getNpsRingSpacingForBoundaryRadius",
        "function getDefaultContainedNpsRingSpacing",
        "The NPS circle you placed is too small",
        "function startNpsSetEditDrag",
        "function updateMovedNpsSet",
        "function updateResizedNpsSet",
        "NPS ROIs remain locked to the concentric set",
        "Individual geometry is locked",
        "NPS ROI geometry is locked to the concentric set",
    ]
    missing_roi_list_markers = [marker for marker in roi_list_markers if marker not in js]
    if missing_roi_list_markers:
        raise RuntimeError(
            "NoiseLab ROI list interaction contract failed. Missing markers: "
            + ", ".join(missing_roi_list_markers)
        )

    focused_viewer_layout_markers = [
        ".noiselab-app",
        "height: 100dvh",
        "grid-template-rows: auto minmax(0, 1fr)",
        ".workspace",
        "overflow: hidden",
        ".viewport-stage",
        "min-height: 0",
        ".analysis-workspace",
        "overflow: auto",
    ]
    missing_layout_markers = [marker for marker in focused_viewer_layout_markers if marker not in css]
    if missing_layout_markers:
        raise RuntimeError(
            "NoiseLab focused viewer layout contract failed. Missing markers: "
            + ", ".join(missing_layout_markers)
        )

    return {
        "referencedIds": len(js_ids),
        "htmlIds": len(html_ids),
        "menuActions": len(menu_actions),
    }


def run_jxa_test() -> dict:
    completed = subprocess.run(
        ["osascript", "-l", "JavaScript", str(JXA_TEST)],
        capture_output=True,
        text=True,
        check=False,
    )

    if completed.returncode != 0:
        message = completed.stderr.strip() or completed.stdout.strip() or "NoiseLab JXA test failed."
        raise RuntimeError(message)

    combined = "\n".join(part for part in [completed.stdout.strip(), completed.stderr.strip()] if part).strip()
    match = re.search(r"\{[\s\S]*\}", combined)
    if not match:
        raise RuntimeError(f"Could not parse NoiseLab JXA output:\n{combined}")

    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Could not parse NoiseLab JXA output:\n{combined}") from exc


def main() -> int:
    try:
        ui_contract = run_static_ui_contract_test()
        result = run_jxa_test()
    except RuntimeError as exc:
        print(str(exc))
        return 1

    print("NoiseLab core regression test passed.")
    print(f"- UI id contract references: {ui_contract['referencedIds']}")
    print(f"- ROI analyses: {result['roiCount']}")
    print(f"- Extracted pixels: {result['extractedPixels']}")
    print(f"- Mean: {result['mean']}")
    print(f"- Reconstruction comparison rows: {result['comparison']['rows']}")
    print(
        f"- Physical-square selected matrix: {result['physicalSquareSelected']['rows']} rows x "
        f"{result['physicalSquareSelected']['cols']} cols"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
