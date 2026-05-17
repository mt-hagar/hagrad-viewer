(function () {
  "use strict";

  const VIEWPORT_CONFIG = {
    presentation: { plane: "axial", title: "Presentation (Axial)", readoutLabel: "Axial" },
    axial: { plane: "coronal", title: "Coronal", readoutLabel: "Coronal" },
    sagittal: { plane: "axial", title: "Axial", readoutLabel: "Axial" },
    coronal: { plane: "sagittal", title: "Sagittal", readoutLabel: "Sagittal" },
  };

  const VIEWPORT_IDS = Object.keys(VIEWPORT_CONFIG);
  const PROFILE_TYPES = new Set(["lineProfile", "squareProfile"]);
  const MEASUREMENT_TYPES = new Set(["length", "probe", "freehandRoi", "brushRoi", "lineProfile", "squareProfile"]);
  const POLYGON_DRAFT_TOOLS = new Set(["freehandRoi", "segmentationRoi"]);
  const CIRCULAR_ROI_SEGMENTS = 48;
  const ROI_HANDLE_LIMIT = 10;
  const DEFAULT_CIRCULAR_ROI_RADIUS_MM = 4;
  const MIN_CIRCULAR_ROI_DIAMETER_MM = 0.5;
  const FREEHAND_ROI_SAMPLE_DISTANCE_MM = 0.65;

  const VOI_PRESETS = {
    coronary: { width: 800, center: 250 },
    softTissue: { width: 400, center: 40 },
    lung: { width: 1500, center: -500 },
    bone: { width: 2000, center: 300 },
  };

  const MPR_LINE_COLORS = {
    axial: "#ffb000",
    coronal: "#d96cff",
    sagittal: "#34b8ff",
  };

  const PROFILE_GUIDE_STYLES = {
    leftOutsideIndex: { color: "#57c8ff", label: "Outer L" },
    leftPeakIndex: { color: "#7af4a8", label: "Peak L" },
    lumenMinIndex: { color: "#f6f7f9", label: "Lumen" },
    rightPeakIndex: { color: "#7af4a8", label: "Peak R" },
    rightOutsideIndex: { color: "#57c8ff", label: "Outer R" },
  };

  const CORONARY_LABEL_OPTIONS = [
    "Auto",
    "LM",
    "LAD",
    "LCx",
    "RCA",
    "Diagonal",
    "Septal",
    "OM",
    "Ramus",
    "PDA",
    "PLV",
    "Branch",
  ];

  const CORONARY_COLORS = [
    "#ff7a6b",
    "#ffd166",
    "#67e8f9",
    "#7af4a8",
    "#c792ff",
    "#f59e0b",
    "#fb7185",
    "#60a5fa",
  ];

  const CORONARY_DEFAULTS = {
    lumenThresholdHu: 180,
    searchRadiusMm: 3.2,
    sampleStepMm: 0.8,
    maxRadiusMm: 4.5,
    contourAngles: 24,
    crossSectionHalfSizeMm: 7,
    reformatHalfHeightMm: 9,
    reformatSlabHalfThicknessMm: 1.2,
    quickSegmentMinLengthMm: 2,
    quickSegmentMaxLengthMm: 80,
  };
  const RIGHT_CLICK_DOUBLE_MS = 320;
  const RIGHT_DRAG_SCRUB_HEIGHT_FACTOR = 0.9;
  const ROI_TOOL_KEYS = ["circularRoi", "freehandRoi", "segmentationRoi", "brushRoi", "contourCorrect", "eraser"];
  const ROI_TOOL_LABELS = {
    circularRoi: "ROI Circle",
    freehandRoi: "ROI Draw",
    segmentationRoi: "ROI Multiple Click",
    brushRoi: "ROI Brush",
    contourCorrect: "Adjust ROI",
    eraser: "Eraser",
  };
  const TOOL_SHORTCUT_LABELS = {
    coronarySeed: "G",
    mprCursor: "X",
    windowLevel: "W",
    pan: "M",
    zoom: "Z",
    length: "L",
    probe: "B",
    lineProfile: "Q",
    squareProfile: "S",
    freehandRoi: "R",
    circularRoi: "C",
    contourCorrect: "A",
    eraser: "E",
    arrow: "Y",
    text: "T",
  };

  const VOXEL_NEIGHBORS = (() => {
    const neighbors = [];
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0 && dz === 0) {
            continue;
          }
          neighbors.push({ dx, dy, dz });
        }
      }
    }
    return neighbors;
  })();

  const TOOL_CURSORS = {
    coronarySeed: "crosshair",
    edit: "default",
    mprCursor: "move",
    windowLevel: "crosshair",
    pan: "grab",
    zoom: "zoom-in",
    length: "crosshair",
    probe: "copy",
    lineProfile: "crosshair",
    squareProfile: "crosshair",
    freehandRoi: "crosshair",
    circularRoi: "crosshair",
    segmentationRoi: "crosshair",
    brushRoi: "crosshair",
    contourCorrect: "crosshair",
    eraser: "crosshair",
    arrow: "crosshair",
    text: "text",
  };

  const SUPPORTED_TRANSFER_SYNTAXES = new Set([
    "1.2.840.10008.1.2",
    "1.2.840.10008.1.2.1",
  ]);

  const LOCAL_PLANE_BASES = {
    axial: {
      u: [1, 0, 0],
      v: [0, 1, 0],
      n: [0, 0, 1],
    },
    coronal: {
      u: [1, 0, 0],
      v: [0, 0, -1],
      n: [0, 1, 0],
    },
    sagittal: {
      u: [0, 1, 0],
      v: [0, 0, -1],
      n: [1, 0, 0],
    },
  };

  const state = {
    reconstructions: [],
    sourceFiles: [],
    activeReconId: null,
    referenceBasis: null,
    decoderFallbackReady: false,
    activeViewportId: "presentation",
    activeToolKey: "windowLevel",
    layout: "presentation",
    currentVOI: { ...VOI_PRESETS.coronary },
    currentPreset: "coronary",
    syncMprTransforms: true,
    cineFps: 8,
    cineTimerId: null,
    dragging: null,
    polygonDraft: null,
    contourCorrectionDraft: null,
    renderQueued: false,
    annotationSequence: 1,
    roiClipboard: null,
    selectedAnnotationId: null,
    selectedProfileAnnotationId: null,
    profileChartState: null,
    mpr: {
      centerWorld: null,
      overlayVisible: true,
      rotations: {
        axial: 0,
        coronal: 0,
        sagittal: 0,
      },
    },
    maximizedViewportId: null,
    rightClick: {
      lastTap: null,
    },
    brushRoi: {
      minHu: -200,
      maxHu: 1200,
      sizeMm: 6,
    },
    eraser: {
      sizeMm: 6,
      preview: null,
    },
    coronary: {
      vessels: [],
      activeVesselId: null,
      nextVesselSequence: 1,
      draftSeedPoints: [],
      draftViewportId: null,
      draftFrame: null,
      quickSegmentMode: true,
      activeSampleIndex: 0,
      settings: {
        lumenThresholdHu: CORONARY_DEFAULTS.lumenThresholdHu,
        searchRadiusMm: CORONARY_DEFAULTS.searchRadiusMm,
      },
      crossSectionView: {
        halfSizeMm: CORONARY_DEFAULTS.crossSectionHalfSizeMm,
      },
      lastCrossSectionGeometry: null,
    },
    backend: {
      checking: false,
      autoSegmenting: false,
      phase: "idle",
      status: null,
      lastResult: null,
    },
    export: {
      dialogOpen: false,
      pendingAction: "export",
      lastStudyId: "",
      currentStudyId: "",
      studies: [],
    },
    historyEntries: [],
    historyIndex: -1,
    restoringHistory: false,
    viewports: {},
  };

  const els = {};
  const sharedCore = window.HAGRadCore;
  if (!sharedCore) {
    throw new Error("Missing shared core script: /src/shared/hagrad-core.js");
  }
  const {
    clamp,
    normalizeAngleDegrees,
    safeString,
    naturalCompare,
    parseNumericArray,
    parseFirstNumber,
    prettifyPatientName,
    cross,
    dot,
    vectorLength,
    normalize,
    addVectors,
    subtractVectors,
    scaleVector,
    cloneVector,
    getNormalVector,
    formatDimension,
    formatSpacing,
    formatDicomDate,
    formatDicomTime,
    combineDateTime,
    sanitizeFilePart,
    waitForAnimationFrame,
    wait,
  } = sharedCore;
  const sharedProfileAnalysis = window.HAGRadProfileAnalysis;
  if (!sharedProfileAnalysis) {
    throw new Error("Missing profile analysis script: /src/shared/hagrad-profile-analysis.js");
  }
  const {
    averageFinite,
    smoothSeries,
    sanitizeStentGuideIndices,
    analyzeProfileSamples,
  } = sharedProfileAnalysis;
  const exportStudyApi = window.HAGRadExportStudies || null;
  const overlayStyle = window.HAGRadOverlayStyle || null;

  function cacheElements() {
    els.app = document.querySelector(".app");
    els.workflowSteps = Array.from(document.querySelectorAll("[data-workflow-step]"));
    els.coronaryWorkflowHint = document.getElementById("coronary-workflow-hint");
    els.dicomInput = document.getElementById("dicom-input");
    els.dicomFolderInput = document.getElementById("dicom-folder-input");
    els.dicomAddInput = document.getElementById("dicom-add-input");
    els.clearButton = document.getElementById("clear-button");
    els.statusPill = document.getElementById("status-pill");
    els.layoutButtons = Array.from(document.querySelectorAll("[data-layout]"));
    els.toolButtons = Array.from(document.querySelectorAll("[data-tool]"));
    els.roiToolTrigger = document.getElementById("roi-tool-trigger");
    els.roiToolMenu = document.getElementById("roi-tool-menu");
    els.roiToolActiveLabel = document.getElementById("roi-tool-active-label");
    els.toolScopedGroups = Array.from(document.querySelectorAll("[data-tool-scope]"));
    els.presetButtons = Array.from(document.querySelectorAll("[data-preset]"));
    els.resetButton = document.getElementById("reset-button");
    els.presentationResetWindowButton = document.getElementById("presentation-reset-window-button");
    els.presentationResetFitButton = document.getElementById("presentation-reset-fit-button");
    els.resetMprButton = document.getElementById("reset-mpr-button");
    els.syncMprButton = document.getElementById("sync-mpr-button");
    els.mprOverlayToggleButton = document.getElementById("mpr-overlay-toggle-button");
    els.clearMeasurementsButton = document.getElementById("clear-measurements-button");
    els.brushMinInput = document.getElementById("brush-min-input");
    els.brushMaxInput = document.getElementById("brush-max-input");
    els.brushSizeInput = document.getElementById("brush-size-input");
    els.eraserSizeInput = document.getElementById("eraser-size-input");
    els.copyRoiButton = document.getElementById("copy-roi-button");
    els.pasteRoiButton = document.getElementById("paste-roi-button");
    els.syncMeasurementsButton = document.getElementById("sync-measurements-button");
    els.windowWidthSlider = document.getElementById("window-width-slider");
    els.windowCenterSlider = document.getElementById("window-center-slider");
    els.windowWidthInput = document.getElementById("window-width-input");
    els.windowCenterInput = document.getElementById("window-center-input");
    els.mprAxialSlider = document.getElementById("mpr-axial-rotation");
    els.mprCoronalSlider = document.getElementById("mpr-coronal-rotation");
    els.mprSagittalSlider = document.getElementById("mpr-sagittal-rotation");
    els.mprAxialInput = document.getElementById("mpr-axial-input");
    els.mprCoronalInput = document.getElementById("mpr-coronal-input");
    els.mprSagittalInput = document.getElementById("mpr-sagittal-input");
    els.reconstructionSummary = document.getElementById("reconstruction-summary");
    els.reconstructionList = document.getElementById("reconstruction-list");
    els.voiReadout = document.getElementById("voi-readout");
    els.exportCurrentButton = document.getElementById("export-current-button");
    els.exportGridButton = document.getElementById("export-grid-button");
    els.exportCineButton = document.getElementById("export-cine-button");
    els.exportMeasurementsButton = document.getElementById("export-measurements-button");
    els.finishCloseButton = document.getElementById("finish-close-button");
    els.exportDialog = document.getElementById("export-dialog");
    els.exportDialogKicker = document.getElementById("export-dialog-kicker");
    els.exportDialogTitle = document.getElementById("export-dialog-title");
    els.exportDialogCopy = document.getElementById("export-dialog-copy");
    els.exportDialogInput = document.getElementById("export-study-id-input");
    els.exportDialogError = document.getElementById("export-dialog-error");
    els.exportDialogCloseButton = document.getElementById("export-dialog-close-button");
    els.exportDialogCancelButton = document.getElementById("export-dialog-cancel-button");
    els.exportDialogConfirmButton = document.getElementById("export-dialog-confirm-button");
    els.exportStudySelect = document.getElementById("export-study-select");
    els.exportStudyCreateInput = document.getElementById("export-study-create-input");
    els.exportStudyCreateButton = document.getElementById("export-study-create-button");
    els.exportStudyTargetNote = document.getElementById("export-study-target-note");
    els.profileStatus = document.getElementById("profile-status");
    els.profileChart = document.getElementById("profile-chart");
    els.profileResetAutoButton = document.getElementById("profile-reset-auto-button");
    els.profileMetrics = document.getElementById("profile-metrics");
    els.coronaryWorkflowStatus = document.getElementById("coronary-workflow-status");
    els.coronaryAutoSegmentButton = document.getElementById("coronary-auto-segment-button");
    els.coronaryBackendRefreshButton = document.getElementById("coronary-backend-refresh-button");
    els.coronaryBackendMetrics = document.getElementById("coronary-backend-metrics");
    els.coronaryBackendStatus = document.getElementById("coronary-backend-status");
    els.coronaryBackendMode = document.getElementById("coronary-backend-mode");
    els.coronaryThresholdInput = document.getElementById("coronary-threshold-input");
    els.coronarySearchRadiusInput = document.getElementById("coronary-search-radius-input");
    els.coronaryStartButton = document.getElementById("coronary-start-button");
    els.coronaryFinishButton = document.getElementById("coronary-finish-button");
    els.coronaryQuickSegmentButton = document.getElementById("coronary-quick-segment-button");
    els.coronaryClearDraftButton = document.getElementById("coronary-clear-draft-button");
    els.coronaryResegmentButton = document.getElementById("coronary-resegment-button");
    els.coronaryVesselSummary = document.getElementById("coronary-vessel-summary");
    els.coronaryVesselList = document.getElementById("coronary-vessel-list");
    els.coronaryResultsSummary = document.getElementById("coronary-results-summary");
    els.coronaryResultsBody = document.getElementById("coronary-results-body");
    els.coronaryResultsNote = document.getElementById("coronary-results-note");
    els.coronaryProgressSummary = document.getElementById("coronary-progress-summary");
    els.coronaryProgressSteps = document.getElementById("coronary-progress-steps");
    els.coronaryQcBanner = document.getElementById("coronary-qc-banner");
    els.coronaryQcMetrics = document.getElementById("coronary-qc-metrics");
    els.coronaryArtifactsSummary = document.getElementById("coronary-artifacts-summary");
    els.coronaryArtifactsStatus = document.getElementById("coronary-artifacts-status");
    els.coronaryArtifactList = document.getElementById("coronary-artifact-list");
    els.coronaryActiveStatus = document.getElementById("coronary-active-status");
    els.coronaryLabelSelect = document.getElementById("coronary-label-select");
    els.coronarySampleSlider = document.getElementById("coronary-sample-slider");
    els.coronarySampleInput = document.getElementById("coronary-sample-input");
    els.coronaryRadiusMinusButton = document.getElementById("coronary-radius-minus-button");
    els.coronaryRadiusPlusButton = document.getElementById("coronary-radius-plus-button");
    els.coronaryThresholdMinusButton = document.getElementById("coronary-threshold-minus-button");
    els.coronaryThresholdPlusButton = document.getElementById("coronary-threshold-plus-button");
    els.coronarySnapCenterButton = document.getElementById("coronary-snap-center-button");
    els.coronaryDeleteVesselButton = document.getElementById("coronary-delete-vessel-button");
    els.coronaryMetrics = document.getElementById("coronary-metrics");
    els.coronaryPanelStatus = document.getElementById("coronary-panel-status");
    els.coronaryCurvedCanvas = document.getElementById("coronary-curved-canvas");
    els.coronaryStraightenedCanvas = document.getElementById("coronary-straightened-canvas");
    els.coronaryCrossSectionCanvas = document.getElementById("coronary-cross-section-canvas");
    els.coronaryCurvedReadout = document.getElementById("coronary-curved-readout");
    els.coronaryStraightenedReadout = document.getElementById("coronary-straightened-readout");
    els.coronaryCrossSectionReadout = document.getElementById("coronary-cross-section-readout");
    els.coronaryPanel = document.querySelector(".coronary-panel");
    els.coronaryReviewKicker = document.getElementById("coronary-review-kicker");
    els.coronaryReviewTitle = document.getElementById("coronary-review-title");
    els.coronaryReviewSummary = document.getElementById("coronary-review-summary");
    els.coronaryReviewReference = document.getElementById("coronary-review-reference");
    els.coronaryReviewMld = document.getElementById("coronary-review-mld");
    els.coronaryReviewMla = document.getElementById("coronary-review-mla");
    els.coronaryReviewDs = document.getElementById("coronary-review-ds");
    els.coronaryReviewAs = document.getElementById("coronary-review-as");
    els.coronaryReviewQuality = document.getElementById("coronary-review-quality");
    els.coronaryJumpLesionButton = document.getElementById("coronary-jump-lesion-button");
    els.coronaryOpenMprButton = document.getElementById("coronary-open-mpr-button");
    els.measurementCount = document.getElementById("measurement-count");
    els.metaPatient = document.getElementById("meta-patient");
    els.metaPatientId = document.getElementById("meta-patient-id");
    els.metaSeries = document.getElementById("meta-series");
    els.metaModality = document.getElementById("meta-modality");
    els.metaSlices = document.getElementById("meta-slices");
    els.metaMatrix = document.getElementById("meta-matrix");
    els.metaSpacing = document.getElementById("meta-spacing");
    els.metaThickness = document.getElementById("meta-thickness");
    els.metaTime = document.getElementById("meta-time");
    els.metaPosition = document.getElementById("meta-position");
    els.emptyState = document.getElementById("empty-state");
    els.viewportGrid = document.getElementById("viewport-grid");
    els.stage = document.querySelector(".stage");
    els.viewportPanels = Array.from(document.querySelectorAll(".viewport-panel"));
    els.toolHuds = Array.from(document.querySelectorAll("[data-tool-hud]"));
    els.viewports = {
      presentation: document.getElementById("viewport-presentation"),
      axial: document.getElementById("viewport-axial"),
      sagittal: document.getElementById("viewport-sagittal"),
      coronal: document.getElementById("viewport-coronal"),
    };
    els.readouts = {
      presentation: document.getElementById("presentation-readout"),
      axial: document.getElementById("axial-readout"),
      sagittal: document.getElementById("sagittal-readout"),
      coronal: document.getElementById("coronal-readout"),
    };
    els.sliceSlider = document.getElementById("slice-slider");
    els.sliceSummary = document.getElementById("slice-summary");
    els.presentationFastScrollSlider = document.getElementById("presentation-fast-scroll-slider");
    els.presentationFastScrollValue = document.getElementById("presentation-fast-scroll-value");
    els.cineSpeedSlider = document.getElementById("cine-speed-slider");
    els.cineSpeedReadout = document.getElementById("cine-speed-readout");
    els.cineButton = document.getElementById("cine-button");
  }

  function setStatus(message, tone) {
    els.statusPill.textContent = message;
    els.statusPill.classList.remove("is-warning", "is-error");
    if (tone === "warning") {
      els.statusPill.classList.add("is-warning");
    }
    if (tone === "error") {
      els.statusPill.classList.add("is-error");
    }
  }

  function formatPercent(value, digits) {
    if (!Number.isFinite(value)) {
      return "-";
    }
    return `${value.toFixed(digits ?? 0).replace(/\.?0+$/, "")} %`;
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) {
      return "-";
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  }

  function buildExportFilename(prefix, extension, options) {
    const reconstruction = getActiveReconstruction();
    const record = reconstruction?.records?.[0] || {};
    const studyId = safeString(options?.studyId);
    const patient = sanitizeFilePart(record.patientName || record.patientId, "patient");
    const series = sanitizeFilePart(reconstruction?.label || record.seriesDescription || "series", "series");
    const parts = [prefix];
    if (studyId) {
      parts.push(sanitizeFilePart(studyId, "study"));
    }
    parts.push(patient, series);
    return `${parts.join("_")}.${extension}`;
  }

  function downloadBlob(blob, filename, options) {
    persistBlobToExportOutbox(blob, filename, options);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function persistBlobToExportOutbox(blob, filename, options) {
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Failed to read export blob."));
        reader.readAsDataURL(blob);
      });
      const contentBase64 = String(dataUrl).split(",", 2)[1] || "";
      if (!contentBase64) {
        return;
      }
      await fetch("/api/exports/save", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflow: "coronary",
          filename,
          contentBase64,
          mimeType: blob.type || "application/octet-stream",
          studyId: state.export.currentStudyId || "",
          patientStudyId: safeString(options?.patientStudyId || ""),
        }),
      });
    } catch (error) {
      console.warn("Could not mirror the export into the local outbox.", error);
    }
  }

  function downloadCanvas(canvas, filename, options) {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setStatus("Failed to create image export.", "error");
          return;
        }
        downloadBlob(blob, filename, options);
      },
      "image/png",
      1
    );
  }

  function getActiveReconstruction() {
    return state.reconstructions.find((reconstruction) => reconstruction.id === state.activeReconId) || null;
  }

  function getReferenceReconstruction() {
    return state.reconstructions[0] || null;
  }

  function getActiveAnnotations() {
    return getActiveReconstruction()?.annotations || [];
  }

  function getActiveProfileAnnotation() {
    const annotations = getActiveAnnotations();
    return annotations.find((annotation) => annotation.id === state.selectedProfileAnnotationId) || null;
  }

  function getSelectedAnnotation() {
    const annotations = getActiveAnnotations();
    return annotations.find((annotation) => annotation.id === state.selectedAnnotationId) || null;
  }

  function getActiveCoronaryVessel() {
    return state.coronary.vessels.find((vessel) => vessel.id === state.coronary.activeVesselId) || null;
  }

  function getActiveCoronarySample() {
    const vessel = getActiveCoronaryVessel();
    if (!vessel?.centerline?.length) {
      return null;
    }
    return vessel.centerline[clamp(state.coronary.activeSampleIndex, 0, vessel.centerline.length - 1)] || null;
  }

  function getDisplayedCoronaryLabel(vessel) {
    if (!vessel) {
      return "No vessel";
    }
    if (vessel.label && vessel.label !== "Auto") {
      return vessel.label;
    }
    return vessel.suggestedLabel || "Auto";
  }

  function getCoronarySortRank(vessel) {
    const label = getDisplayedCoronaryLabel(vessel);
    const order = ["LM", "LAD", "LCx", "RCA", "Diagonal", "Septal", "OM", "Ramus", "PDA", "PLV", "Branch", "Auto"];
    const index = order.indexOf(label);
    return index === -1 ? order.length : index;
  }

  function getSortedCoronaryVessels() {
    return [...state.coronary.vessels].sort((a, b) => {
      const rankDelta = getCoronarySortRank(a) - getCoronarySortRank(b);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      const lengthDelta = (b.totalLengthMm || 0) - (a.totalLengthMm || 0);
      if (lengthDelta !== 0) {
        return lengthDelta;
      }
      return naturalCompare(a.id, b.id);
    });
  }

  function getCoronarySourceLabel(vessel) {
    return vessel?.backendSource ? "Auto" : "Manual";
  }

  function getCoronaryMeanRadiusMm(vessel) {
    if (!vessel?.centerline?.length) {
      return null;
    }
    return averageFinite(vessel.centerline.map((sample) => sample.meanRadiusMm));
  }

  function getCoronaryCoverageFraction(vessel) {
    if (!vessel?.centerline?.length) {
      return null;
    }
    return averageFinite(vessel.centerline.map((sample) => sample.coverage));
  }

  function getCoronaryTrackingSummaryText(vessel) {
    if (!vessel) {
      return "No tracking summary";
    }
    if (vessel.backendSource) {
      return "Automatic branch centerline";
    }
    const trackedSegments = Number.isFinite(vessel.trackedSegmentCount) ? vessel.trackedSegmentCount : 0;
    const fallbackSegments = Number.isFinite(vessel.fallbackSegmentCount) ? vessel.fallbackSegmentCount : 0;
    const totalSegments = Math.max(
      0,
      Number.isFinite(vessel.totalTrackedSegments) ? vessel.totalTrackedSegments : trackedSegments + fallbackSegments
    );
    if (totalSegments <= 0) {
      return "Manual vessel trace";
    }
    if (fallbackSegments > 0) {
      return `${trackedSegments}/${totalSegments} tracked sections • ${fallbackSegments} fallback`;
    }
    if (totalSegments === 1) {
      return "Directional minimal-path segment";
    }
    return `${totalSegments} tracked control-point sections`;
  }

  function describeCoronaryBuildMode(vessel) {
    if (!vessel) {
      return "-";
    }
    if (vessel.backendSource) {
      return "Backend auto tree";
    }
    switch (vessel.buildMode) {
      case "two_point_directional_path":
        return "2-point tracked segment";
      case "two_point_fallback":
        return "2-point fallback segment";
      case "multi_point_directional_path":
        return "Multi-point tracked vessel";
      case "multi_point_mixed_path":
        return "Multi-point tracked + fallback";
      default:
        return "Manual vessel trace";
    }
  }

  function getCoronaryQcMeta(vessel) {
    if (!vessel?.centerline?.length) {
      return {
        label: "No Data",
        tone: "warning",
        detail: "No usable centerline samples were available.",
      };
    }

    const coverage = getCoronaryCoverageFraction(vessel);
    if (!vessel.backendSource) {
      const trackingDetail = getCoronaryTrackingSummaryText(vessel);
      const coverageSuffix = Number.isFinite(coverage)
        ? ` • ${Math.round(coverage * 100)}% contour coverage`
        : "";
      if ((vessel.fallbackSegmentCount || 0) > 0) {
        return {
          label: "Review",
          tone: "warning",
          detail: `${trackingDetail}${coverageSuffix}`,
        };
      }
      if (Number.isFinite(coverage) && coverage < 0.72) {
        return {
          label: "Review",
          tone: "warning",
          detail: `${trackingDetail}${coverageSuffix}`,
        };
      }
      return {
        label: "Tracked",
        tone: Number.isFinite(coverage) && coverage >= 0.85 ? "good" : "neutral",
        detail: `${trackingDetail}${coverageSuffix}`,
      };
    }

    if (!Number.isFinite(coverage)) {
      return {
        label: "Review",
        tone: "warning",
        detail: "Contour coverage is unavailable, so manual review is recommended.",
      };
    }

    const coveragePercent = `${Math.round(coverage * 100)}% contour coverage`;
    if (coverage >= 0.85) {
      return {
        label: "Good",
        tone: "good",
        detail: coveragePercent,
      };
    }

    if (coverage >= 0.7) {
      return {
        label: "Review",
        tone: "warning",
        detail: coveragePercent,
      };
    }

    return {
      label: "Edit",
      tone: "warning",
      detail: coveragePercent,
    };
  }

  function summarizeCoronaryQc(vessels) {
    return vessels.reduce(
      (summary, vessel) => {
        const qc = getCoronaryQcMeta(vessel);
        if (!vessel.backendSource) {
          summary.manualCount += 1;
        } else {
          summary.autoCount += 1;
        }
        if (qc.tone === "good") {
          summary.goodCount += 1;
        }
        if (qc.tone === "warning") {
          summary.reviewCount += 1;
        }
        return summary;
      },
      {
        autoCount: 0,
        manualCount: 0,
        goodCount: 0,
        reviewCount: 0,
      }
    );
  }

  function renderMetaRows(container, rows) {
    if (!container) {
      return;
    }
    container.innerHTML = "";
    rows.forEach((row) => {
      const wrapper = document.createElement("div");
      wrapper.className = "meta-row";

      const term = document.createElement("dt");
      term.textContent = row.label;
      wrapper.appendChild(term);

      const description = document.createElement("dd");
      description.textContent = row.value;
      wrapper.appendChild(description);

      container.appendChild(wrapper);
    });
  }

  function setWorkflowStepState(stepKey, stateName, note) {
    const card = els.workflowSteps?.find((entry) => entry.dataset.workflowStep === stepKey);
    if (!card) {
      return;
    }
    card.classList.remove("is-pending", "is-active", "is-running", "is-complete");
    card.classList.add(`is-${stateName}`);
    const noteNode = card.querySelector("span:last-child");
    if (noteNode && typeof note === "string") {
      noteNode.textContent = note;
    }
  }

  function describeBackendReadiness(status) {
    if (!status) {
      return {
        state: "pending",
        note: "Refresh backend to confirm local tool availability.",
      };
    }

    if (status.recommendedPipeline === "totalsegmentator_vmtk") {
      return {
        state: "complete",
        note: "TotalSegmentator, VMTK, and the licensed coronary task are ready.",
      };
    }

    if (status.recommendedPipeline === "totalsegmentator_vmtk_needs_license") {
      return {
        state: "warning",
        note: "Backend tools are installed, but the coronary task still needs a valid license.",
      };
    }

    if (status.recommendedPipeline === "totalsegmentator_only") {
      return {
        state: "warning",
        note: "TotalSegmentator is ready, but VMTK post-processing is still needed for full branch CPR support.",
      };
    }

    if (status.recommendedPipeline === "totalsegmentator_only_needs_license") {
      return {
        state: "warning",
        note: "TotalSegmentator is installed, but the coronary task is not yet enabled and VMTK is still missing.",
      };
    }

    return {
      state: "failed",
      note: status.message || "No supported coronary backend tools were detected.",
    };
  }

  function getBackendPipelineLabel(result) {
    const pipeline = safeString(result?.pipeline) || safeString(state.backend.status?.recommendedPipeline);
    if (pipeline === "totalsegmentator_vmtk") {
      return "TotalSegmentator + VMTK";
    }
    if (pipeline === "totalsegmentator_vmtk_needs_license") {
      return "TotalSegmentator + VMTK (license needed)";
    }
    if (pipeline === "totalsegmentator_only") {
      return "TotalSegmentator only";
    }
    if (pipeline === "totalsegmentator_only_needs_license") {
      return "TotalSegmentator only (license needed)";
    }
    return pipeline || "Local coronary backend";
  }

  function inferBackendFailureStage(result) {
    const message = safeString(result?.message) || "";
    if (/license/i.test(message) || /tool/i.test(message) || /backend/i.test(message) && /before/i.test(message)) {
      return "backend";
    }
    if (/TotalSegmentator did not finish/i.test(message) || /coronary mask/i.test(message) || /segmented coronary/i.test(message)) {
      return "mask";
    }
    if (/centerline/i.test(message) || /VMTK/i.test(message)) {
      return "centerline";
    }
    return "unknown";
  }

  function renderCoronaryProgressPanel() {
    if (!els.coronaryProgressSummary || !els.coronaryProgressSteps || !els.coronaryQcBanner || !els.coronaryQcMetrics) {
      return;
    }

    const result = state.backend.lastResult;
    const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
    const vessels = getSortedCoronaryVessels();
    const qcSummary = summarizeCoronaryQc(vessels);
    const readiness = describeBackendReadiness(state.backend.status);
    const rows = [];
    const steps = [];
    let summary = "Waiting for auto segmentation";
    let bannerText = "Auto coronary tree extraction has not run for this study yet.";
    let bannerTone = "";

    const appendStep = (title, stepState, note) => {
      steps.push({ title, state: stepState, note });
    };

    if (state.backend.autoSegmenting) {
      summary = state.backend.phase === "uploading" ? "Uploading CTA to backend" : "Automatic segmentation running";
      bannerText = state.backend.phase === "uploading"
        ? `Preparing ${state.sourceFiles.length} DICOM file${state.sourceFiles.length === 1 ? "" : "s"} for local backend processing.`
        : "The local backend is segmenting the coronary mask and will extract centerlines next. Live substep streaming is not available yet.";
      bannerTone = "running";

      appendStep("Backend Ready", readiness.state === "failed" ? "warning" : readiness.state === "pending" ? "pending" : "complete", readiness.note);
      appendStep(
        "Upload CTA",
        state.backend.phase === "uploading" ? "running" : "complete",
        `${state.sourceFiles.length} source file${state.sourceFiles.length === 1 ? "" : "s"} queued for the local coronary pipeline.`
      );
      appendStep("Coronary Mask", "running", "TotalSegmentator is processing the axial CTA stack.");
      appendStep("Centerlines & CPR", "pending", "Branch centerlines and reformats will appear when the mask stage finishes.");

      rows.push(
        { label: "Pipeline", value: getBackendPipelineLabel(result) },
        { label: "Files", value: `${state.sourceFiles.length}` },
        { label: "Review", value: "Pending" }
      );
    } else if (result) {
      const hasMask = Boolean(result.mask);
      const failureStage = inferBackendFailureStage(result);
      const branchCount = Number.isFinite(result?.metrics?.vesselCount)
        ? result.metrics.vesselCount
        : result?.vessels?.length || 0;
      const componentCount = Number.isFinite(result?.metrics?.componentCount)
        ? result.metrics.componentCount
        : null;
      const reviewNotes = [];
      if (qcSummary.reviewCount) {
        reviewNotes.push(`${qcSummary.reviewCount} vessel${qcSummary.reviewCount === 1 ? "" : "s"} flagged for contour review`);
      }
      if (warnings.length) {
        reviewNotes.push(`${warnings.length} backend warning${warnings.length === 1 ? "" : "s"}`);
      }

      appendStep("Backend Ready", readiness.state === "failed" ? "warning" : "complete", readiness.note);

      if (result.status === "failed" && (failureStage === "mask" || (!hasMask && branchCount === 0))) {
        appendStep("Coronary Mask", "failed", result.message || "The coronary mask could not be generated.");
        appendStep("Centerlines & CPR", "pending", "Centerline extraction did not start because the mask stage failed.");
        appendStep("QC Review", "pending", "Repeat the run after the mask stage succeeds.");
      } else {
        appendStep(
          "Coronary Mask",
          hasMask || result.status === "completed" || result.status === "partial" ? "complete" : "warning",
          hasMask
            ? "A coronary mask was generated successfully from the axial CTA stack."
            : result.message || "Mask generation completed without a stored mask summary."
        );

        if (result.status === "failed" && failureStage === "centerline") {
          appendStep("Centerlines & CPR", "failed", result.message || "Centerline extraction failed after mask generation.");
        } else if (branchCount > 0) {
          appendStep(
            "Centerlines & CPR",
            "complete",
            `${branchCount} branch centerline${branchCount === 1 ? "" : "s"} extracted for coronary review.`
          );
        } else {
          appendStep(
            "Centerlines & CPR",
            "warning",
            "The coronary mask was generated, but no branch centerlines could be extracted automatically."
          );
        }

        const reviewState = warnings.length || qcSummary.reviewCount ? "warning" : branchCount > 0 ? "complete" : "pending";
        appendStep(
          "QC Review",
          reviewState,
          reviewNotes.length
            ? reviewNotes.join(" • ")
            : branchCount > 0
              ? "No review flags are currently raised for the visible vessels."
              : "No branch review is available yet because no centerlines were returned."
        );
      }

      if (result.status === "failed") {
        summary = "Segmentation failed";
        bannerText = result.message || "The automatic coronary pipeline did not finish successfully.";
        bannerTone = "failed";
      } else if (warnings.length || qcSummary.reviewCount || result.status === "partial") {
        summary = "Manual review recommended";
        bannerText = result.message
          ? reviewNotes.length
            ? `${result.message} ${reviewNotes.join(" • ")}`
            : result.message
          : reviewNotes.join(" • ");
        bannerTone = "warning";
      } else if (branchCount > 0) {
        summary = "Ready for vessel review";
        bannerText = `${result.message || "Automatic coronary tree extraction completed successfully."} Select a vessel to open its CPR and cross-section editor.`;
        bannerTone = "good";
      } else {
        summary = "Mask ready, centerlines incomplete";
        bannerText = result.message || "The coronary mask was generated, but no branch centerlines were returned.";
        bannerTone = "warning";
      }

      rows.push(
        { label: "Pipeline", value: getBackendPipelineLabel(result) },
        { label: "Branches", value: `${branchCount}` },
        { label: "Components", value: componentCount != null ? `${componentCount}` : "-" },
        { label: "Warnings", value: `${warnings.length}` },
        { label: "Review", value: qcSummary.reviewCount ? `${qcSummary.reviewCount} vessel${qcSummary.reviewCount === 1 ? "" : "s"}` : "None flagged" }
      );
    } else {
      appendStep("Backend Ready", readiness.state, readiness.note);
      appendStep("Coronary Mask", "pending", "Run Auto Segment Coronary Tree to generate a coronary mask.");
      appendStep("Centerlines & CPR", "pending", "Branch extraction and per-vessel reformats will appear after the backend run.");
      appendStep(
        "QC Review",
        vessels.length ? "warning" : "pending",
        vessels.length
          ? "Manual vessels are available, but the automatic whole-tree pass has not been run for this study yet."
          : "Automatic QC prompts will appear after the first backend segmentation."
      );

      if (vessels.length) {
        summary = "Manual vessels ready";
        bannerText = "Manual vessels are available now. Run auto segmentation when you want a whole-tree backend pass and QC summary.";
      }

      rows.push(
        { label: "Pipeline", value: getBackendPipelineLabel(result) },
        { label: "Manual Vessels", value: `${vessels.length}` },
        { label: "Auto Run", value: "Not started" }
      );
    }

    els.coronaryProgressSummary.textContent = summary;
    els.coronaryProgressSteps.innerHTML = "";
    steps.forEach((step) => {
      const card = document.createElement("div");
      card.className = `progress-step is-${step.state}`;

      const header = document.createElement("div");
      header.className = "progress-step-header";

      const title = document.createElement("div");
      title.className = "progress-step-title";
      title.textContent = step.title;
      header.appendChild(title);

      const statePill = document.createElement("span");
      statePill.className = "progress-step-state";
      statePill.textContent = step.state;
      header.appendChild(statePill);

      card.appendChild(header);

      const note = document.createElement("div");
      note.className = "progress-step-note";
      note.textContent = step.note;
      card.appendChild(note);

      els.coronaryProgressSteps.appendChild(card);
    });

    els.coronaryQcBanner.textContent = bannerText;
    els.coronaryQcBanner.classList.remove("is-good", "is-running", "is-warning", "is-failed");
    if (bannerTone) {
      els.coronaryQcBanner.classList.add(`is-${bannerTone}`);
    }

    renderMetaRows(els.coronaryQcMetrics, rows);
  }

  function allocateCoronaryColor(index) {
    return CORONARY_COLORS[index % CORONARY_COLORS.length];
  }

  function resetCoronaryTracking(options) {
    const preserveSettings = options?.preserveSettings !== false;
    const settings = preserveSettings
      ? { ...state.coronary.settings }
      : {
          lumenThresholdHu: CORONARY_DEFAULTS.lumenThresholdHu,
          searchRadiusMm: CORONARY_DEFAULTS.searchRadiusMm,
        };
    state.coronary.vessels = [];
    state.coronary.activeVesselId = null;
    state.coronary.nextVesselSequence = 1;
    state.coronary.draftSeedPoints = [];
    state.coronary.draftViewportId = null;
    state.coronary.draftFrame = null;
    state.coronary.activeSampleIndex = 0;
    state.coronary.lastCrossSectionGeometry = null;
    state.coronary.settings = settings;
  }

  function getPreferredCoronarySampleIndex(vessel) {
    if (!vessel?.centerline?.length) {
      return 0;
    }
    return Math.floor((vessel.centerline.length - 1) / 2);
  }

  function spotlightCoronaryPanel() {
    if (!els.coronaryPanel) {
      return;
    }
    els.coronaryPanel.classList.remove("is-spotlight");
    void els.coronaryPanel.offsetWidth;
    els.coronaryPanel.classList.add("is-spotlight");
    window.clearTimeout(spotlightCoronaryPanel.timeoutId);
    spotlightCoronaryPanel.timeoutId = window.setTimeout(() => {
      els.coronaryPanel?.classList.remove("is-spotlight");
    }, 1200);
  }

  function setActiveCoronaryVessel(vesselId, options) {
    const vessel = state.coronary.vessels.find((item) => item.id === vesselId) || null;
    const previousSampleIndex = state.coronary.activeSampleIndex;
    state.coronary.activeVesselId = vessel?.id || null;

    let nextSampleIndex = 0;
    if (vessel?.centerline?.length) {
      if (Number.isFinite(options?.sampleIndex)) {
        nextSampleIndex = clamp(Math.round(options.sampleIndex), 0, vessel.centerline.length - 1);
      } else if (options?.keepSampleIndex) {
        nextSampleIndex = clamp(previousSampleIndex, 0, vessel.centerline.length - 1);
      } else if (options?.preferMidpoint !== false) {
        nextSampleIndex = getPreferredCoronarySampleIndex(vessel);
      }
    }
    state.coronary.activeSampleIndex = nextSampleIndex;

    if (vessel?.centerline?.length && options?.skipCenterSync !== true) {
      const targetSample = vessel.centerline[nextSampleIndex] || vessel.centerline[0];
      state.mpr.centerWorld = cloneVector(targetSample.world);
    }
    if (options?.autoPresentation) {
      setLayout("presentation");
    }
    if (options?.focusViewport) {
      setActiveViewport("presentation");
    }
    updateSidebarUi();
    requestRenderAll();
    if (options?.scrollCoronaryPanel && els.coronaryPanel?.scrollIntoView) {
      els.coronaryPanel.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
    if (options?.spotlightCoronaryPanel) {
      spotlightCoronaryPanel();
    }
  }

  function setActiveCoronarySampleIndex(index, options) {
    const vessel = getActiveCoronaryVessel();
    if (!vessel?.centerline?.length) {
      state.coronary.activeSampleIndex = 0;
      return;
    }
    state.coronary.activeSampleIndex = clamp(Math.round(index), 0, vessel.centerline.length - 1);
    if (options?.skipCenterSync !== true) {
      state.mpr.centerWorld = cloneVector(vessel.centerline[state.coronary.activeSampleIndex].world);
    }
    updateSidebarUi();
    requestRenderAll();
  }

  function getImageCount() {
    return getActiveReconstruction()?.volume.depth || 0;
  }

  function initializeDecoderFallback() {
    if (state.decoderFallbackReady) {
      return;
    }

    if (!window.cornerstone || !window.cornerstoneWADOImageLoader || !window.dicomParser) {
      return;
    }

    cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
    cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
    state.decoderFallbackReady = true;
  }

  function updateLayoutButtons() {
    els.layoutButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.layout === state.layout);
    });
  }

  function isRoiAnnotationType(type) {
    return type === "freehandRoi" || type === "brushRoi";
  }

  function isPolygonDraftTool(toolKey) {
    return POLYGON_DRAFT_TOOLS.has(toolKey);
  }

  function isCircularRoiAnnotation(annotation) {
    return Boolean(annotation?.type === "freehandRoi" && annotation?.roiSourceTool === "circularRoi");
  }

  function getToolActionLabel(toolKey) {
    return ROI_TOOL_LABELS[toolKey] || formatMeasurementType(toolKey);
  }

  function updateViewportToolHuds() {
    if (!els.toolHuds?.length) {
      return;
    }
    const label = getToolActionLabel(state.activeToolKey);
    const shortcut = TOOL_SHORTCUT_LABELS[state.activeToolKey] || "";
    const context =
      state.activeToolKey === "windowLevel"
        ? "drag left button for WW/WL"
        : state.activeToolKey === "pan"
          ? "middle mouse also pans"
          : state.activeToolKey === "zoom"
            ? "Cmd/Ctrl + scroll zooms to cursor"
            : state.activeToolKey === "mprCursor"
              ? "drag center or colored line"
              : "right click edits";
    els.toolHuds.forEach((hud) => {
      hud.textContent = `${label}${shortcut ? ` [${shortcut}]` : ""} · ${context}`;
    });
  }

  function updateToolButtons() {
    els.toolButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tool === state.activeToolKey);
      const shortcut = TOOL_SHORTCUT_LABELS[button.dataset.tool] || "";
      if (shortcut) {
        button.dataset.shortcut = shortcut;
      } else {
        delete button.dataset.shortcut;
      }
    });
    if (els.roiToolTrigger) {
      const activeRoiTool = ROI_TOOL_KEYS.includes(state.activeToolKey);
      const menuOpen = !els.roiToolMenu?.classList.contains("is-hidden");
      els.roiToolTrigger.classList.toggle("is-active", activeRoiTool || menuOpen);
      els.roiToolTrigger.setAttribute("aria-expanded", String(!els.roiToolMenu?.classList.contains("is-hidden")));
    }
    if (els.roiToolActiveLabel) {
      els.roiToolActiveLabel.textContent = ROI_TOOL_LABELS[state.activeToolKey] || "Open ROI Tools";
    }
    els.roiToolMenu?.querySelectorAll("[data-tool]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tool === state.activeToolKey);
    });
    updateViewportToolHuds();
    updateToolOptionsUi();
  }

  function scopeMatchesTool(scopeText, toolKey) {
    return (scopeText || "")
      .split(/\s+/)
      .filter(Boolean)
      .includes(toolKey);
  }

  function updateToolOptionsUi() {
    const toolKey = state.activeToolKey;
    els.toolScopedGroups?.forEach((group) => {
      group.classList.toggle("is-hidden", !scopeMatchesTool(group.dataset.toolScope, toolKey));
    });
  }

  function cloneCoronarySample(sample) {
    return {
      ...sample,
      world: cloneVector(sample.world),
      tangent: cloneVector(sample.tangent),
      normal: cloneVector(sample.normal),
      binormal: cloneVector(sample.binormal),
      radiiMm: Array.isArray(sample.radiiMm) ? sample.radiiMm.slice() : [],
      contourWorldPoints: cloneWorldPoints(sample.contourWorldPoints || []),
    };
  }

  function cloneCoronaryVessel(vessel) {
    return {
      ...vessel,
      analysis: vessel.analysis ? JSON.parse(JSON.stringify(vessel.analysis)) : null,
      seedPoints: cloneWorldPoints(vessel.seedPoints || []),
      curvedPlaneNormal: cloneVector(vessel.curvedPlaneNormal),
      centerline: (vessel.centerline || []).map(cloneCoronarySample),
    };
  }

  function serializeMutableState() {
    return {
      layout: state.layout,
      activeToolKey: state.activeToolKey,
      activeViewportId: state.activeViewportId,
      activeReconId: state.activeReconId,
      currentVOI: { ...state.currentVOI },
      currentPreset: state.currentPreset || null,
      syncMprTransforms: state.syncMprTransforms !== false,
      cineFps: state.cineFps,
      annotationSequence: state.annotationSequence,
      selectedAnnotationId: state.selectedAnnotationId,
      selectedProfileAnnotationId: state.selectedProfileAnnotationId,
      maximizedViewportId: state.maximizedViewportId || null,
      mpr: {
        centerWorld: state.mpr.centerWorld ? cloneVector(state.mpr.centerWorld) : null,
        overlayVisible: state.mpr.overlayVisible !== false,
        rotations: { ...state.mpr.rotations },
      },
      viewports: VIEWPORT_IDS.reduce((accumulator, viewportId) => {
        const viewportState = state.viewports[viewportId];
        accumulator[viewportId] = {
          zoom: viewportState?.zoom ?? 1,
          panX: viewportState?.panX ?? 0,
          panY: viewportState?.panY ?? 0,
        };
        return accumulator;
      }, {}),
      reconstructions: state.reconstructions.map((reconstruction) => ({
        id: reconstruction.id,
        annotations: reconstruction.annotations.map((annotation) => cloneAnnotation(annotation)),
      })),
      coronary: {
        vessels: state.coronary.vessels.map(cloneCoronaryVessel),
        activeVesselId: state.coronary.activeVesselId || null,
        nextVesselSequence: state.coronary.nextVesselSequence,
        draftSeedPoints: cloneWorldPoints(state.coronary.draftSeedPoints || []),
        draftViewportId: state.coronary.draftViewportId || null,
        draftFrame: state.coronary.draftFrame ? cloneFrame(state.coronary.draftFrame) : null,
        quickSegmentMode: state.coronary.quickSegmentMode !== false,
        activeSampleIndex: state.coronary.activeSampleIndex || 0,
        settings: { ...state.coronary.settings },
      },
    };
  }

  function createHistorySignature(snapshot) {
    return JSON.stringify(snapshot);
  }

  function resetHistory() {
    state.historyEntries = [];
    state.historyIndex = -1;
  }

  function pushHistorySnapshot(label) {
    if (state.restoringHistory || !state.reconstructions.length) {
      return;
    }

    const snapshot = serializeMutableState();
    const signature = createHistorySignature(snapshot);
    const current = state.historyEntries[state.historyIndex];
    if (current?.signature === signature) {
      return;
    }

    state.historyEntries = state.historyEntries.slice(0, state.historyIndex + 1);
    state.historyEntries.push({
      label: safeString(label) || "Update",
      signature,
      snapshot,
    });
    if (state.historyEntries.length > 40) {
      state.historyEntries.shift();
    }
    state.historyIndex = state.historyEntries.length - 1;
  }

  function applyMutableStateSnapshot(snapshot) {
    stopCine();
    state.dragging = null;
    state.polygonDraft = null;

    state.layout = snapshot?.layout === "mpr" ? "mpr" : "presentation";
    state.activeToolKey = snapshot?.activeToolKey || "windowLevel";
    state.activeViewportId = snapshot?.activeViewportId || "presentation";
    state.currentVOI = snapshot?.currentVOI
      ? {
          width: clamp(Number(snapshot.currentVOI.width) || VOI_PRESETS.coronary.width, 1, 4000),
          center: clamp(Number(snapshot.currentVOI.center) || VOI_PRESETS.coronary.center, -1200, 3000),
        }
      : { ...VOI_PRESETS.coronary };
    state.currentPreset = snapshot?.currentPreset || null;
    state.syncMprTransforms = snapshot?.syncMprTransforms !== false;
    state.cineFps = Number.isFinite(snapshot?.cineFps) ? Number(snapshot.cineFps) : 8;
    state.annotationSequence = Number.isFinite(snapshot?.annotationSequence)
      ? Number(snapshot.annotationSequence)
      : 1;
    state.maximizedViewportId = safeString(snapshot?.maximizedViewportId) || null;
    state.mpr.centerWorld = Array.isArray(snapshot?.mpr?.centerWorld)
      ? cloneVector(snapshot.mpr.centerWorld)
      : null;
    state.mpr.overlayVisible = snapshot?.mpr?.overlayVisible !== false;
    state.mpr.rotations = {
      axial: normalizeAngleDegrees(Number(snapshot?.mpr?.rotations?.axial) || 0),
      coronal: normalizeAngleDegrees(Number(snapshot?.mpr?.rotations?.coronal) || 0),
      sagittal: normalizeAngleDegrees(Number(snapshot?.mpr?.rotations?.sagittal) || 0),
    };

    resetViewportTransforms();
    VIEWPORT_IDS.forEach((viewportId) => {
      const viewportSnapshot = snapshot?.viewports?.[viewportId];
      const viewportState = state.viewports[viewportId];
      if (!viewportSnapshot || !viewportState) {
        return;
      }
      viewportState.zoom = clamp(Number(viewportSnapshot.zoom) || 1, 0.2, 12);
      viewportState.panX = Number(viewportSnapshot.panX) || 0;
      viewportState.panY = Number(viewportSnapshot.panY) || 0;
    });

    const savedReconstructions = new Map((snapshot?.reconstructions || []).map((entry) => [entry.id, entry]));
    state.reconstructions.forEach((reconstruction) => {
      const saved = savedReconstructions.get(reconstruction.id);
      reconstruction.annotations = saved
        ? saved.annotations.map((annotation) => {
            const clone = cloneAnnotation(annotation);
            clone.frame = cloneAnnotationFrameForReconstruction(clone, reconstruction);
            return clone;
          })
        : [];
    });
    const maxAnnotationId = state.reconstructions.reduce((maximum, reconstruction) => {
      return Math.max(maximum, ...reconstruction.annotations.map((annotation) => annotation.id));
    }, 0);
    state.annotationSequence = Math.max(state.annotationSequence, maxAnnotationId + 1);

    state.activeReconId = state.reconstructions.some((reconstruction) => reconstruction.id === snapshot?.activeReconId)
      ? snapshot.activeReconId
      : state.reconstructions[0]?.id || null;

    state.coronary.vessels = (snapshot?.coronary?.vessels || []).map(cloneCoronaryVessel);
    state.coronary.activeVesselId = state.coronary.vessels.some((vessel) => vessel.id === snapshot?.coronary?.activeVesselId)
      ? snapshot.coronary.activeVesselId
      : null;
    state.coronary.nextVesselSequence = Math.max(
      Number(snapshot?.coronary?.nextVesselSequence) || 1,
      state.coronary.vessels.length + 1
    );
    state.coronary.draftSeedPoints = cloneWorldPoints(snapshot?.coronary?.draftSeedPoints || []);
    state.coronary.draftViewportId = safeString(snapshot?.coronary?.draftViewportId) || null;
    state.coronary.draftFrame = snapshot?.coronary?.draftFrame ? cloneFrame(snapshot.coronary.draftFrame) : null;
    state.coronary.quickSegmentMode = snapshot?.coronary?.quickSegmentMode !== false;
    state.coronary.activeSampleIndex = Number(snapshot?.coronary?.activeSampleIndex) || 0;
    state.coronary.settings = {
      lumenThresholdHu: Number(snapshot?.coronary?.settings?.lumenThresholdHu) || CORONARY_DEFAULTS.lumenThresholdHu,
      searchRadiusMm: Number(snapshot?.coronary?.settings?.searchRadiusMm) || CORONARY_DEFAULTS.searchRadiusMm,
    };
    state.coronary.lastCrossSectionGeometry = null;

    const activeAnnotations = getActiveAnnotations();
    state.selectedAnnotationId = activeAnnotations.some((annotation) => annotation.id === snapshot?.selectedAnnotationId)
      ? snapshot.selectedAnnotationId
      : null;
    state.selectedProfileAnnotationId = activeAnnotations.some(
      (annotation) => annotation.id === snapshot?.selectedProfileAnnotationId
    )
      ? snapshot.selectedProfileAnnotationId
      : null;

    const activeVessel = getActiveCoronaryVessel();
    if (activeVessel?.centerline?.length) {
      state.coronary.activeSampleIndex = clamp(state.coronary.activeSampleIndex, 0, activeVessel.centerline.length - 1);
    } else {
      state.coronary.activeSampleIndex = 0;
    }

    if (!Array.isArray(state.mpr.centerWorld) || state.mpr.centerWorld.length !== 3) {
      state.mpr.centerWorld = cloneVector(
        getActiveReconstruction()?.volume?.centerWorld || state.reconstructions[0]?.volume?.centerWorld || [0, 0, 0]
      );
    }

    els.viewportGrid.classList.toggle("layout-mpr", state.layout === "mpr");
    els.viewportGrid.classList.toggle("layout-presentation", state.layout !== "mpr");
    els.cineSpeedReadout.textContent = `${state.cineFps} fps`;
    updateLayoutButtons();
    updateToolButtons();
    updateVoiUi();
    updateMprUi();
    updateSyncButton();
    updateViewportFocusUi();
    updateEmptyState();
    updateSidebarUi();
    setActiveViewport(state.activeViewportId);
    updateViewportCursors();
    requestRenderAll();
  }

  function restoreHistorySnapshot(targetIndex) {
    const entry = state.historyEntries[targetIndex];
    if (!entry) {
      return false;
    }

    state.restoringHistory = true;
    try {
      applyMutableStateSnapshot(entry.snapshot);
      state.historyIndex = targetIndex;
    } finally {
      state.restoringHistory = false;
    }
    return true;
  }

  function undoHistory() {
    if (state.historyIndex <= 0) {
      return false;
    }
    restoreHistorySnapshot(state.historyIndex - 1);
    setStatus("Undid the last coronary edit.");
    return true;
  }

  function redoHistory() {
    if (state.historyIndex >= state.historyEntries.length - 1) {
      return false;
    }
    restoreHistorySnapshot(state.historyIndex + 1);
    setStatus("Redid the coronary edit.");
    return true;
  }

  function updatePresetButtons() {
    els.presetButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.preset === state.currentPreset);
    });
  }

  function updateSyncButton() {
    els.syncMprButton.classList.toggle("is-active", state.syncMprTransforms);
    els.syncMprButton.textContent = `Sync Zoom/Pan: ${state.syncMprTransforms ? "On" : "Off"}`;
  }

  function updateVoiUi() {
    els.windowWidthSlider.value = String(Math.round(state.currentVOI.width));
    els.windowCenterSlider.value = String(Math.round(state.currentVOI.center));
    els.windowWidthInput.value = String(Math.round(state.currentVOI.width));
    els.windowCenterInput.value = String(Math.round(state.currentVOI.center));
    els.voiReadout.textContent = `W ${Math.round(state.currentVOI.width)} / L ${Math.round(
      state.currentVOI.center
    )}`;
    updatePresetButtons();
  }

  function updateMprUi() {
    const { axial, coronal, sagittal } = state.mpr.rotations;
    els.mprAxialSlider.value = String(Math.round(axial));
    els.mprCoronalSlider.value = String(Math.round(coronal));
    els.mprSagittalSlider.value = String(Math.round(sagittal));
    els.mprAxialInput.value = String(Math.round(axial));
    els.mprCoronalInput.value = String(Math.round(coronal));
    els.mprSagittalInput.value = String(Math.round(sagittal));
    if (els.mprOverlayToggleButton) {
      const visible = state.mpr.overlayVisible !== false;
      els.mprOverlayToggleButton.textContent = visible ? "Hide Crosses" : "Show Crosses";
      els.mprOverlayToggleButton.classList.toggle("is-active", visible);
    }
  }

  function setLayout(layout) {
    state.layout = layout === "mpr" ? "mpr" : "presentation";
    if (state.layout !== "mpr") {
      state.maximizedViewportId = null;
    }
    els.viewportGrid.classList.toggle("layout-mpr", state.layout === "mpr");
    els.viewportGrid.classList.toggle("layout-presentation", state.layout !== "mpr");
    updateViewportFocusUi();
    if (els.coronaryOpenMprButton) {
      els.coronaryOpenMprButton.textContent = state.layout === "mpr" ? "Show Axial View" : "Open 4-up MPR";
    }
    updateLayoutButtons();
    requestRenderAll();
  }

  function setActiveViewport(viewportId) {
    state.activeViewportId = viewportId;
    els.viewportPanels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.viewportId === viewportId);
    });
  }

  function focusWithoutScrolling(element) {
    if (!element) {
      return;
    }
    try {
      element.focus({ preventScroll: true });
    } catch (_error) {
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      element.focus();
      window.scrollTo(scrollX, scrollY);
    }
  }

  function updateViewportFocusUi() {
    const focusedViewportId = state.layout === "mpr" ? state.maximizedViewportId : null;
    els.viewportGrid.classList.toggle("is-viewport-maximized", Boolean(focusedViewportId));
    els.viewportPanels.forEach((panel) => {
      panel.classList.toggle("is-maximized", panel.dataset.viewportId === focusedViewportId);
    });
  }

  function toggleViewportFocus(viewportId) {
    if (state.layout !== "mpr") {
      return false;
    }
    state.maximizedViewportId = state.maximizedViewportId === viewportId ? null : viewportId;
    updateViewportFocusUi();
    requestRenderAll();
    return true;
  }

  function cancelPolygonDraft() {
    if (!state.polygonDraft) {
      return;
    }
    state.polygonDraft = null;
    requestRenderAll();
  }

  function openRoiToolMenu() {
    if (!els.roiToolMenu || !els.roiToolTrigger) {
      return;
    }
    els.roiToolMenu.classList.remove("is-hidden");
    els.roiToolTrigger.setAttribute("aria-expanded", "true");
    updateToolButtons();
  }

  function closeRoiToolMenu() {
    if (!els.roiToolMenu || !els.roiToolTrigger) {
      return;
    }
    els.roiToolMenu.classList.add("is-hidden");
    els.roiToolTrigger.setAttribute("aria-expanded", "false");
    updateToolButtons();
  }

  function toggleRoiToolMenu() {
    if (!els.roiToolMenu || els.roiToolMenu.classList.contains("is-hidden")) {
      openRoiToolMenu();
    } else {
      closeRoiToolMenu();
    }
  }

  function returnToPrimaryTool() {
    if (state.coronary.draftSeedPoints.length) {
      clearCoronaryDraft({ keepTool: true });
    }
    cancelPolygonDraft();
    if (state.activeToolKey !== "windowLevel") {
      setActiveTool("windowLevel");
    }
  }

  function setActiveTool(toolKey) {
    if (!isPolygonDraftTool(toolKey)) {
      state.polygonDraft = null;
    }
    if (toolKey !== "contourCorrect") {
      state.contourCorrectionDraft = null;
    }
    if (toolKey !== "eraser") {
      state.eraser.preview = null;
    }
    state.activeToolKey = toolKey;
    closeRoiToolMenu();
    updateToolButtons();
    updateViewportCursors();
    requestRenderAll();
  }

  function clampBrushSizeMm(value) {
    return clamp(Number.isFinite(value) ? value : state.brushRoi.sizeMm, 0.5, 40);
  }

  function normalizeBrushThresholds(minHu, maxHu) {
    const numericMin = Number.isFinite(minHu) ? minHu : state.brushRoi.minHu;
    const numericMax = Number.isFinite(maxHu) ? maxHu : state.brushRoi.maxHu;
    return numericMin <= numericMax
      ? { minHu: numericMin, maxHu: numericMax }
      : { minHu: numericMax, maxHu: numericMin };
  }

  function applyBrushRoiInputs() {
    if (!els.brushMinInput || !els.brushMaxInput || !els.brushSizeInput) {
      return;
    }
    const thresholds = normalizeBrushThresholds(Number(els.brushMinInput.value), Number(els.brushMaxInput.value));
    state.brushRoi.minHu = thresholds.minHu;
    state.brushRoi.maxHu = thresholds.maxHu;
    state.brushRoi.sizeMm = clampBrushSizeMm(Number(els.brushSizeInput.value));
    els.brushMinInput.value = String(Math.round(state.brushRoi.minHu));
    els.brushMaxInput.value = String(Math.round(state.brushRoi.maxHu));
    els.brushSizeInput.value = String(state.brushRoi.sizeMm);
  }

  function applyEraserInputs() {
    if (!els.eraserSizeInput) {
      return;
    }
    const parsed = clampBrushSizeMm(Number(els.eraserSizeInput.value));
    state.eraser.sizeMm = parsed;
    els.eraserSizeInput.value = String(parsed);
  }

  function countAnnotations() {
    return getActiveAnnotations().length;
  }

  function updateMeasurementCount() {
    const count = countAnnotations();
    els.measurementCount.textContent = `${count} annotation${count === 1 ? "" : "s"}`;
  }

  function setSelectedAnnotation(annotationId) {
    const annotation = getActiveAnnotations().find((item) => item.id === annotationId) || null;
    state.selectedAnnotationId = annotation?.id || null;
    if (annotation && PROFILE_TYPES.has(annotation.type)) {
      state.selectedProfileAnnotationId = annotation.id;
    }
    if (!annotation && state.selectedProfileAnnotationId === annotationId) {
      state.selectedProfileAnnotationId = null;
    }
  }

  function ensureSelectedProfileAnnotation() {
    const profile = getActiveProfileAnnotation();
    if (profile) {
      return profile;
    }

    const fallback = getActiveAnnotations()
      .filter((annotation) => PROFILE_TYPES.has(annotation.type))
      .sort((left, right) => right.id - left.id)[0] || null;

    state.selectedProfileAnnotationId = fallback?.id || null;
    return fallback;
  }

  function updateEmptyState() {
    els.emptyState.classList.toggle("is-hidden", Boolean(getActiveReconstruction()));
  }

  function renderReconstructionButtons() {
    els.reconstructionList.innerHTML = "";
    state.reconstructions.forEach((reconstruction) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "recon-button";
      button.classList.toggle("is-active", reconstruction.id === state.activeReconId);
      button.innerHTML = `<strong>${reconstruction.label}</strong><span>${reconstruction.volume.depth} slices</span>`;
      button.addEventListener("click", () => {
        setActiveReconstruction(reconstruction.id);
      });
      els.reconstructionList.appendChild(button);
    });
    els.reconstructionSummary.textContent = `${state.reconstructions.length} loaded`;
  }

  function updateMetadata() {
    const reconstruction = getActiveReconstruction();
    const record = reconstruction?.records?.[0];
    const volume = reconstruction?.volume;
    if (!record || !volume) {
      els.metaPatient.textContent = "No study loaded";
      els.metaPatientId.textContent = "-";
      els.metaSeries.textContent = "-";
      els.metaModality.textContent = "-";
      els.metaSlices.textContent = "-";
      els.metaMatrix.textContent = "-";
      els.metaSpacing.textContent = "-";
      els.metaThickness.textContent = "-";
      els.metaTime.textContent = "-";
      els.metaPosition.textContent = "-";
      return;
    }

    els.metaPatient.textContent = record.patientName || "Anonymous";
    els.metaPatientId.textContent = record.patientId || "-";
    els.metaSeries.textContent = reconstruction.label;
    els.metaModality.textContent = record.modality || "-";
    els.metaSlices.textContent = String(volume.depth);
    els.metaMatrix.textContent = `${volume.columns} x ${volume.rows} x ${volume.depth}`;
    els.metaSpacing.textContent = `${formatSpacing(record.pixelSpacing)} / ${formatDimension(volume.sliceSpacing)}`;
    els.metaThickness.textContent = formatDimension(record.sliceThickness);
    els.metaTime.textContent = combineDateTime(record);
    els.metaPosition.textContent = record.patientPosition || "-";
  }

  function renderCoronaryVesselButtons() {
    if (!els.coronaryVesselList) {
      return;
    }

    els.coronaryVesselList.innerHTML = "";
    getSortedCoronaryVessels().forEach((vessel) => {
      const item = document.createElement("div");
      item.className = "vessel-item";
      const isActive = vessel.id === state.coronary.activeVesselId;
      const qcMeta = getCoronaryQcMeta(vessel);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "vessel-button";
      button.classList.toggle("is-active", isActive);
      button.style.borderLeft = `4px solid ${vessel.color}`;
      const label = getDisplayedCoronaryLabel(vessel);
      const sourceText = getCoronarySourceLabel(vessel);
      button.innerHTML = `<strong>${label}</strong><span>${formatDimension(vessel.totalLengthMm)} • ${vessel.centerline.length} samples • ${sourceText}</span>`;
      button.addEventListener("click", () => {
        setActiveCoronaryVessel(vessel.id, {
          keepSampleIndex: isActive,
          preferMidpoint: !isActive,
          autoPresentation: true,
          focusViewport: true,
          scrollCoronaryPanel: true,
          spotlightCoronaryPanel: true,
        });
      });
      item.appendChild(button);

      const actions = document.createElement("div");
      actions.className = "vessel-actions";

      const note = document.createElement("p");
      note.className = "vessel-quick-note";
      note.textContent = Number.isFinite(vessel.analysis?.diameterStenosisPercent)
        ? `${qcMeta.detail} • prototype DS ${formatPercent(vessel.analysis.diameterStenosisPercent, 0)}`
        : qcMeta.detail;
      actions.appendChild(note);

      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.className = "button tertiary";
      actionButton.textContent = "Open CPR";
      actionButton.addEventListener("click", (event) => {
        event.stopPropagation();
        openCoronaryCpr(vessel.id);
      });
      actions.appendChild(actionButton);

      item.appendChild(actions);
      els.coronaryVesselList.appendChild(item);
    });

    if (state.coronary.draftSeedPoints.length) {
      const draft = document.createElement("button");
      draft.type = "button";
      draft.className = "vessel-button is-draft";
      draft.innerHTML = `<strong>Draft Vessel</strong><span>${state.coronary.draftSeedPoints.length} seed points</span>`;
      draft.addEventListener("click", () => {
        setActiveTool("coronarySeed");
      });
      els.coronaryVesselList.appendChild(draft);
    }
  }

  function renderCoronaryResultsTable() {
    if (!els.coronaryResultsBody || !els.coronaryResultsSummary || !els.coronaryResultsNote) {
      return;
    }

    const vessels = getSortedCoronaryVessels();
    const backendResult = state.backend.lastResult;
    els.coronaryResultsBody.innerHTML = "";

    if (!vessels.length) {
      els.coronaryResultsSummary.textContent = backendResult?.status
        ? `Last run: ${backendResult.status}`
        : "No results yet";
      els.coronaryResultsNote.textContent = backendResult?.message
        || "Run auto segmentation or build a vessel manually to populate the summary.";
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "No vessels are currently available for review.";
      row.appendChild(cell);
      els.coronaryResultsBody.appendChild(row);
      return;
    }

    const backendCount = Number.isFinite(backendResult?.metrics?.vesselCount)
      ? backendResult.metrics.vesselCount
      : null;
    els.coronaryResultsSummary.textContent = backendCount != null
      ? `${backendCount} backend branch${backendCount === 1 ? "" : "es"} • ${vessels.length} visible`
      : `${vessels.length} vessel${vessels.length === 1 ? "" : "s"} ready`;
    els.coronaryResultsNote.textContent = backendResult?.message
      || "Click a vessel row to open its CPR and center the cross-section editor on that vessel.";

    vessels.forEach((vessel) => {
      const row = document.createElement("tr");
      row.classList.add("is-selectable");
      row.classList.toggle("is-active", vessel.id === state.coronary.activeVesselId);
      row.addEventListener("click", () => {
        setActiveCoronaryVessel(vessel.id, {
          keepSampleIndex: vessel.id === state.coronary.activeVesselId,
          preferMidpoint: vessel.id !== state.coronary.activeVesselId,
          autoPresentation: true,
          focusViewport: true,
          scrollCoronaryPanel: true,
          spotlightCoronaryPanel: true,
        });
      });
      const qcMeta = getCoronaryQcMeta(vessel);

      const vesselCell = document.createElement("td");
      vesselCell.innerHTML = `<strong>${getDisplayedCoronaryLabel(vessel)}</strong><br><span>${vessel.centerline.length} samples</span>`;
      row.appendChild(vesselCell);

      const sourceCell = document.createElement("td");
      const sourcePill = document.createElement("span");
      sourcePill.className = "table-pill";
      if (!vessel.backendSource) {
        sourcePill.classList.add("is-manual");
      } else {
        sourcePill.classList.add("is-neutral");
      }
      sourcePill.textContent = getCoronarySourceLabel(vessel);
      sourceCell.appendChild(sourcePill);
      row.appendChild(sourceCell);

      const lengthCell = document.createElement("td");
      lengthCell.textContent = formatDimension(vessel.totalLengthMm);
      row.appendChild(lengthCell);

      const radiusCell = document.createElement("td");
      radiusCell.textContent = formatDimension(getCoronaryMeanRadiusMm(vessel));
      row.appendChild(radiusCell);

      const qcCell = document.createElement("td");
      const qcPill = document.createElement("span");
      qcPill.className = `table-pill is-${qcMeta.tone}`;
      qcPill.textContent = qcMeta.label;
      qcPill.title = qcMeta.detail;
      qcCell.appendChild(qcPill);
      row.appendChild(qcCell);

      const actionCell = document.createElement("td");
      actionCell.className = "actions-cell";
      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.className = "button tertiary";
      actionButton.textContent = "Open CPR";
      actionButton.addEventListener("click", (event) => {
        event.stopPropagation();
        openCoronaryCpr(vessel.id);
      });
      actionCell.appendChild(actionButton);
      row.appendChild(actionCell);

      els.coronaryResultsBody.appendChild(row);
    });
  }

  function renderBackendArtifactsPanel() {
    if (!els.coronaryArtifactsSummary || !els.coronaryArtifactsStatus || !els.coronaryArtifactList) {
      return;
    }

    const result = state.backend.lastResult;
    const artifacts = Array.isArray(result?.artifacts) ? result.artifacts : [];
    const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
    const artifactCount = artifacts.length;
    els.coronaryArtifactsSummary.textContent = artifactCount
      ? `${artifactCount} file${artifactCount === 1 ? "" : "s"}`
      : "No artifacts";

    if (!result) {
      els.coronaryArtifactsStatus.textContent =
        "The backend will list masks, centerlines, JSON summaries, and warnings here after an automatic run.";
      els.coronaryArtifactList.innerHTML = "";
      return;
    }

    const pipeline = safeString(result.pipeline) || safeString(state.backend.status?.recommendedPipeline) || "backend";
    const metricParts = [];
    if (Number.isFinite(result?.metrics?.componentCount)) {
      metricParts.push(`${result.metrics.componentCount} component${result.metrics.componentCount === 1 ? "" : "s"}`);
    }
    if (Number.isFinite(result?.metrics?.vesselCount)) {
      metricParts.push(`${result.metrics.vesselCount} branch${result.metrics.vesselCount === 1 ? "" : "es"}`);
    }
    const statusParts = [
      `Status: ${result.status || "unknown"}`,
      `Pipeline: ${pipeline}`,
      ...metricParts,
    ];
    els.coronaryArtifactsStatus.textContent = `${result.message || "Backend run available."} ${statusParts.join(" • ")}`;
    els.coronaryArtifactList.innerHTML = "";

    if (!artifacts.length && !warnings.length) {
      const empty = document.createElement("div");
      empty.className = "artifact-card";
      empty.innerHTML = "<div><strong>No downloadable backend files</strong><span>The last run did not expose any artifact URLs yet.</span></div>";
      els.coronaryArtifactList.appendChild(empty);
      return;
    }

    warnings.forEach((warningText) => {
      const warningCard = document.createElement("div");
      warningCard.className = "artifact-card is-warning";
      warningCard.innerHTML = `<div><strong>Backend Warning</strong><span>${warningText}</span></div>`;
      els.coronaryArtifactList.appendChild(warningCard);
    });

    artifacts.forEach((artifact) => {
      const card = document.createElement("div");
      card.className = "artifact-card";

      const details = document.createElement("div");
      details.innerHTML = `<strong>${artifact.name || "artifact"}</strong><span>${artifact.relativePath || ""} • ${formatFileSize(artifact.sizeBytes)}</span>`;
      card.appendChild(details);

      if (safeString(artifact.url)) {
        const link = document.createElement("a");
        link.className = "button tertiary";
        link.href = artifact.url;
        link.textContent = "Download";
        link.target = "_blank";
        link.rel = "noreferrer";
        card.appendChild(link);
      } else {
        const unavailable = document.createElement("span");
        unavailable.className = "vessel-quick-note";
        unavailable.textContent = "No link";
        card.appendChild(unavailable);
      }

      els.coronaryArtifactList.appendChild(card);
    });
  }

  function describeBackendMode(status) {
    if (!status) {
      return "Auto segmentation will use a local Python service when available.";
    }
    const licenseStatus = status.details?.totalsegmentator?.license?.status || "unknown";
    if (status.recommendedPipeline === "totalsegmentator_vmtk") {
      return "TotalSegmentator + VMTK are ready, and the licensed coronary task is enabled. Auto tree segmentation can return branch centerlines for curved and straightened reformats.";
    }
    if (status.recommendedPipeline === "totalsegmentator_vmtk_needs_license") {
      return "TotalSegmentator + VMTK are installed, but the coronary task is still license-gated on this machine. Configure the local TotalSegmentator license to unlock one-click full-tree segmentation.";
    }
    if (status.recommendedPipeline === "totalsegmentator_only") {
      return "TotalSegmentator can generate a coronary mask, but VMTK still needs to be available for automatic branch centerlines and per-vessel reformats.";
    }
    if (status.recommendedPipeline === "totalsegmentator_only_needs_license") {
      return "TotalSegmentator is installed, but the coronary task still needs a configured license and the VMTK post-processing stage is not yet ready.";
    }
    if (licenseStatus === "missing_license" || licenseStatus === "missing_config" || licenseStatus === "invalid_license") {
      return status.message || "The coronary backend is installed, but the licensed coronary segmentation task is not yet enabled.";
    }
    return "No coronary backend tools detected yet. Install TotalSegmentator first, then add VMTK for centerlines and CPR generation.";
  }

  function updateBackendUi() {
    const status = state.backend.status;
    if (state.backend.checking) {
      els.coronaryBackendStatus.textContent = "Checking local backend...";
      els.coronaryBackendMode.textContent = "Querying local tool availability.";
    } else if (!status) {
      els.coronaryBackendStatus.textContent = "Backend not checked yet.";
      els.coronaryBackendMode.textContent = "Auto segmentation will use a local Python service when available.";
    } else {
      const available = Array.isArray(status.availableTools) ? status.availableTools : [];
      const licenseStatus = status.details?.totalsegmentator?.license?.status || null;
      const licenseSuffix = licenseStatus && licenseStatus !== "ready" && available.includes("TotalSegmentator")
        ? " • coronary task not enabled"
        : "";
      els.coronaryBackendStatus.textContent = available.length
        ? `Available: ${available.join(", ")}${licenseSuffix}`
        : "No supported backend tools detected.";
      els.coronaryBackendMode.textContent = describeBackendMode(status);
    }

    els.coronaryAutoSegmentButton.disabled = state.backend.autoSegmenting || state.backend.checking;
    els.coronaryBackendRefreshButton.disabled = state.backend.autoSegmenting || state.backend.checking;
    els.coronaryAutoSegmentButton.textContent = state.backend.autoSegmenting
      ? state.backend.phase === "uploading"
        ? "Uploading CTA..."
        : "Segmenting CTA..."
      : "Auto Segment Coronary Tree";
    renderCoronaryProgressPanel();
  }

  function applyBackendCoronaryResult(payload) {
    if (!payload || !Array.isArray(payload.vessels) || !payload.vessels.length) {
      return 0;
    }

    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return 0;
    }

    let importedCount = 0;
    let lastImportedId = null;
    payload.vessels.forEach((entry) => {
      if (!Array.isArray(entry.points) || entry.points.length < 2) {
        return;
      }
      const points = entry.points
        .map((point) =>
          Array.isArray(point) && point.length >= 3
            ? [Number(point[0]), Number(point[1]), Number(point[2])]
            : null
        )
        .filter((point) => point && point.every(Number.isFinite));
      if (points.length < 2) {
        return;
      }

      const seedFrame = {
        plane: "axial",
        nWorld: cloneVector(state.referenceBasis?.normal || reconstruction.volume.normalDirection),
      };
      const vessel = buildCoronaryVesselModel(reconstruction, points, seedFrame, {
        thresholdHu: Number.isFinite(entry.thresholdHu) ? entry.thresholdHu : state.coronary.settings.lumenThresholdHu,
        searchRadiusMm: Number.isFinite(entry.searchRadiusMm) ? entry.searchRadiusMm : state.coronary.settings.searchRadiusMm,
      });
      vessel.label = CORONARY_LABEL_OPTIONS.includes(entry.label) ? entry.label : "Auto";
      vessel.suggestedLabel = safeString(entry.suggestedLabel) || vessel.suggestedLabel;
      vessel.backendSource = payload.pipeline || "backend";
      vessel.backendMetrics = {
        lengthMm: Number.isFinite(entry.lengthMm) ? entry.lengthMm : null,
        pointCount: Number.isFinite(entry.pointCount) ? entry.pointCount : points.length,
        meanRadiusMm: Number.isFinite(entry.meanRadiusMm) ? entry.meanRadiusMm : null,
      };
      state.coronary.vessels.push(vessel);
      lastImportedId = vessel.id;
      importedCount += 1;
    });

    if (importedCount && lastImportedId) {
      setActiveCoronaryVessel(lastImportedId, {
        preferMidpoint: true,
        autoPresentation: true,
        focusViewport: true,
        scrollCoronaryPanel: true,
        spotlightCoronaryPanel: true,
      });
    }

    return importedCount;
  }

  async function refreshBackendStatus(options) {
    if (state.backend.checking) {
      return state.backend.status;
    }

    state.backend.checking = true;
    updateBackendUi();
    try {
      const response = await fetch("/api/coronary/backend/status", {
        headers: { Accept: "application/json" },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || "Failed to read coronary backend status.");
      }
      state.backend.status = payload;
      updateBackendUi();
      if (!options?.silent) {
        setStatus(payload.message || "Coronary backend status refreshed.");
      }
      return payload;
    } catch (error) {
      state.backend.status = {
        availableTools: [],
        recommendedPipeline: "none",
        message: error.message || "Coronary backend status unavailable.",
      };
      updateBackendUi();
      if (!options?.silent) {
        setStatus(state.backend.status.message, "warning");
      }
      return state.backend.status;
    } finally {
      state.backend.checking = false;
      updateBackendUi();
    }
  }

  async function autoSegmentCoronaryTree() {
    if (state.backend.autoSegmenting) {
      return;
    }
    if (!state.sourceFiles.length) {
      throw new Error("Load a coronary CTA series first so the backend has axial source images to process.");
    }

    state.backend.autoSegmenting = true;
    state.backend.phase = "uploading";
    updateBackendUi();
    setStatus(`Uploading ${state.sourceFiles.length} source files for automatic coronary segmentation...`);

    try {
      const formData = new FormData();
      const options = {
        lumenThresholdHu: state.coronary.settings.lumenThresholdHu,
        searchRadiusMm: state.coronary.settings.searchRadiusMm,
        task: "coronary_arteries",
      };
      formData.append("options", JSON.stringify(options));
      state.sourceFiles.forEach((file) => {
        const relativePath = safeString(file.webkitRelativePath) || file.name;
        formData.append("dicom_file", file, relativePath);
      });

      await waitForAnimationFrame();
      const responsePromise = fetch("/api/coronary/backend/segment", {
        method: "POST",
        body: formData,
      });
      state.backend.phase = "processing";
      updateBackendUi();
      const response = await responsePromise;
      const payload = await response.json();
      state.backend.lastResult = payload;
      if (payload.tools) {
        state.backend.status = {
          ...(state.backend.status || {}),
          ...payload.tools,
          availableTools: payload.tools.availableTools || state.backend.status?.availableTools || [],
          recommendedPipeline: payload.tools.recommendedPipeline || state.backend.status?.recommendedPipeline || "none",
          message: payload.message || state.backend.status?.message || "",
        };
      }
      updateBackendUi();
      updateSidebarUi();
      if (!response.ok) {
        throw new Error(payload.message || "Automatic coronary segmentation failed.");
      }

      const imported = applyBackendCoronaryResult(payload);
      if (imported > 0) {
        setStatus(`Imported ${imported} backend vessel${imported === 1 ? "" : "s"} into the coronary prototype.`);
      } else {
        setStatus(payload.message || "Backend segmentation completed, but no vessel centerlines were returned yet.", "warning");
      }
    } finally {
      state.backend.autoSegmenting = false;
      state.backend.phase = "idle";
      updateBackendUi();
    }
  }

  function updateCoronaryUi() {
    const reconstruction = getActiveReconstruction();
    const vessel = getActiveCoronaryVessel();
    const draftCount = state.coronary.draftSeedPoints.length;
    const thresholdHu = Math.round(state.coronary.settings.lumenThresholdHu);
    const searchRadiusMm = state.coronary.settings.searchRadiusMm;
    const sampleCount = vessel?.centerline?.length || 0;
    const sample = getActiveCoronarySample();
    const qcMeta = vessel ? getCoronaryQcMeta(vessel) : null;
    const analysis = vessel?.analysis || null;
    const sampleDiameterMm = getCoronarySampleDiameterMm(sample);
    const analysisSummary = Number.isFinite(analysis?.diameterStenosisPercent)
      ? `${formatPercent(analysis.diameterStenosisPercent, 0)} diameter stenosis`
      : qcMeta?.label || "Review";
    const quickSegmentDistanceMm = draftCount >= 2
      ? vectorLength(subtractVectors(
          state.coronary.draftSeedPoints[draftCount - 1],
          state.coronary.draftSeedPoints[0]
        ))
      : null;
    const hasStudy = Boolean(reconstruction);
    const hasVessels = state.coronary.vessels.length > 0;
    const measurementCount = countAnnotations();
    const lesionReady = Number.isFinite(analysis?.lesionSampleIndex);
    const reviewQualityText = vessel
      ? `${qcMeta?.label || "Review"}${Number.isFinite(sample?.coverage) ? ` • ${Math.round(sample.coverage * 100)}%` : ""}`
      : "-";

    els.app?.classList.toggle("is-study-loaded", hasStudy);
    els.app?.classList.toggle("is-reviewing-vessel", Boolean(vessel));

    els.coronaryThresholdInput.value = String(thresholdHu);
    els.coronarySearchRadiusInput.value = searchRadiusMm.toFixed(1);
    els.coronaryQuickSegmentButton.textContent = state.coronary.quickSegmentMode ? "2-Point Track: On" : "2-Point Track: Off";
    els.coronaryQuickSegmentButton.classList.toggle("is-active", state.coronary.quickSegmentMode);
    els.coronaryWorkflowStatus.textContent = state.backend.autoSegmenting
      ? "Auto segmentation running"
      : draftCount
        ? Number.isFinite(quickSegmentDistanceMm) && draftCount >= 2
          ? `${draftCount} draft clicks • ${formatDimension(quickSegmentDistanceMm)} span`
          : `${draftCount} draft click${draftCount === 1 ? "" : "s"}`
        : vessel
          ? `Reviewing ${getDisplayedCoronaryLabel(vessel)}`
          : state.coronary.vessels.length
            ? `${state.coronary.vessels.length} vessel${state.coronary.vessels.length === 1 ? "" : "s"} ready`
            : "Ready to start";
    els.coronaryVesselSummary.textContent = `${state.coronary.vessels.length} vessel${state.coronary.vessels.length === 1 ? "" : "s"}`;
    els.coronaryActiveStatus.textContent = vessel
      ? `${getDisplayedCoronaryLabel(vessel)} • ${analysisSummary}`
      : "No vessel selected";
    els.coronaryPanelStatus.textContent = vessel
      ? `${getDisplayedCoronaryLabel(vessel)} • sample ${state.coronary.activeSampleIndex + 1} / ${sampleCount}`
      : "No active vessel";
    els.coronaryCurvedReadout.textContent = vessel
      ? analysis?.mode === "two_point_short_segment"
        ? `${formatDimension(vessel.totalLengthMm)} short segment`
        : `${formatDimension(vessel.totalLengthMm)} centerline`
      : "Waiting for vessel";
    els.coronaryStraightenedReadout.textContent = vessel
      ? Number.isFinite(analysis?.minimalLuminalDiameterMm) && Number.isFinite(analysis?.diameterStenosisPercent)
        ? `MLD ${formatMetricValue(analysis.minimalLuminalDiameterMm, "mm", 2)} • DS ${formatPercent(analysis.diameterStenosisPercent, 0)}`
        : `Threshold ${Math.round(vessel.thresholdHu)} HU`
      : "Rotation-minimizing frame";
    els.coronaryCrossSectionReadout.textContent = sample
      ? `Diam ${formatMetricValue(sampleDiameterMm, "mm", 2)} • Area ${formatMetricValue(sample.areaMm2, "mm2", 1)}`
      : "Editable contour";

    els.coronarySampleSlider.disabled = !sampleCount;
    els.coronarySampleSlider.max = String(Math.max(0, sampleCount - 1));
    els.coronarySampleSlider.value = String(sampleCount ? state.coronary.activeSampleIndex : 0);
    els.coronarySampleInput.disabled = !sampleCount;
    els.coronarySampleInput.max = String(Math.max(1, sampleCount));
    els.coronarySampleInput.value = String(sampleCount ? state.coronary.activeSampleIndex + 1 : 1);
    els.coronaryLabelSelect.value = vessel?.label || "Auto";

    const actionDisabled = !vessel;
    els.coronaryFinishButton.disabled = draftCount < 2;
    els.coronaryClearDraftButton.disabled = draftCount === 0;
    els.coronaryResegmentButton.disabled = actionDisabled;
    els.coronaryRadiusMinusButton.disabled = actionDisabled;
    els.coronaryRadiusPlusButton.disabled = actionDisabled;
    els.coronaryThresholdMinusButton.disabled = actionDisabled;
    els.coronaryThresholdPlusButton.disabled = actionDisabled;
    els.coronarySnapCenterButton.disabled = !sample;
    els.coronaryDeleteVesselButton.disabled = actionDisabled;
    if (els.coronaryJumpLesionButton) {
      els.coronaryJumpLesionButton.disabled = !lesionReady;
    }
    if (els.coronaryOpenMprButton) {
      els.coronaryOpenMprButton.disabled = !hasStudy;
      els.coronaryOpenMprButton.textContent = state.layout === "mpr" ? "Show Axial View" : "Open 4-up MPR";
    }

    const suggestedText = vessel?.suggestedLabel && vessel.suggestedLabel !== vessel.label
      ? `${vessel.suggestedLabel} suggested`
      : "-";
    const sampleText = sample
      ? `${state.coronary.activeSampleIndex + 1} / ${sampleCount} • ${formatDimension(sample.distanceMm)}`
      : "-";
    const radiusText = sample
      ? `${formatDimension(sample.minRadiusMm)} to ${formatDimension(sample.maxRadiusMm)}`
      : "-";
    const qualityText = sample
      ? `${Math.round((sample.coverage || 0) * 100)}% contour coverage`
      : "-";
    const modeText = vessel ? describeCoronaryBuildMode(vessel) : "-";

    if (els.coronaryWorkflowHint) {
      els.coronaryWorkflowHint.textContent = !hasStudy
        ? "Load a coronary CTA to begin"
        : state.backend.autoSegmenting
          ? "Automatic coronary segmentation is running"
          : vessel
            ? `Reviewing ${getDisplayedCoronaryLabel(vessel)}`
            : hasVessels
              ? "Select the next vessel to review"
              : "Auto tree first, or start a manual vessel trace on MPR";
    }
    setWorkflowStepState("load", hasStudy ? "complete" : "active", hasStudy ? `${reconstruction.volume.depth} slices loaded` : "Load a coronary CTA");
    setWorkflowStepState(
      "segment",
      state.backend.autoSegmenting ? "running" : hasVessels || state.backend.lastResult ? "complete" : hasStudy ? "active" : "pending",
      state.backend.autoSegmenting
        ? "Backend processing"
        : hasVessels
          ? `${state.coronary.vessels.length} vessel${state.coronary.vessels.length === 1 ? "" : "s"} available`
          : "Auto tree or manual trace"
    );
    setWorkflowStepState(
      "select",
      vessel ? "complete" : hasVessels ? "active" : "pending",
      vessel ? getDisplayedCoronaryLabel(vessel) : hasVessels ? "Choose the vessel to review" : "Waiting for vessels"
    );
    setWorkflowStepState(
      "review",
      vessel ? "active" : "pending",
      vessel
        ? lesionReady
          ? `${formatPercent(analysis.diameterStenosisPercent, 0)} DS prototype`
          : `${sampleCount} sample${sampleCount === 1 ? "" : "s"} ready`
        : "CPR and cross-section review"
    );
    setWorkflowStepState(
      "export",
      hasStudy && (hasVessels || measurementCount) ? "active" : "pending",
      hasStudy && (hasVessels || measurementCount)
        ? "PNG, cine, and measurements ready"
        : "Export becomes useful after review"
    );

    if (els.coronaryReviewKicker) {
      els.coronaryReviewKicker.textContent = !hasStudy
        ? "Getting Started"
        : vessel
          ? "Active Vessel"
          : hasVessels
            ? "Next Step"
            : "Segmentation";
    }
    if (els.coronaryReviewTitle) {
      els.coronaryReviewTitle.textContent = !hasStudy
        ? "Load a coronary CTA"
        : vessel
          ? `${getDisplayedCoronaryLabel(vessel)} review`
          : hasVessels
            ? "Choose a vessel from the navigator"
            : "Create the first vessel";
    }
    if (els.coronaryReviewSummary) {
      els.coronaryReviewSummary.textContent = !hasStudy
        ? "Load a gated CTA stack first. Once a study is open, run auto tree segmentation or trace a vessel in MPR with start/end control points."
        : vessel
          ? lesionReady
            ? `Editing the contour or centerline updates the prototype stenosis live. Use Jump To Lesion to return to the tightest point, or open 4-up MPR when you need more spatial context.`
            : `This vessel is open for CPR and cross-section review. The clicked control points were rebuilt into a 3D tracked path, and you can still adjust the contour, recenter the lumen, or re-track with a new threshold.`
          : hasVessels
            ? "The study is ready. Pick a vessel from the navigator to bring its reformats and stenosis summary into focus."
            : "Run Auto Segment Coronary Tree for a full pass, or start a manual vessel trace. In many cases a start and end point are enough; add more control points only where the vessel is difficult.";
    }
    if (els.coronaryReviewReference) {
      els.coronaryReviewReference.textContent = analysis
        ? `${formatMetricValue(analysis.referenceDiameterMm, "mm", 2)} / ${formatMetricValue(analysis.referenceAreaMm2, "mm2", 1)}`
        : "-";
    }
    if (els.coronaryReviewMld) {
      els.coronaryReviewMld.textContent = analysis
        ? formatMetricValue(analysis.minimalLuminalDiameterMm, "mm", 2)
        : "-";
    }
    if (els.coronaryReviewMla) {
      els.coronaryReviewMla.textContent = analysis
        ? formatMetricValue(analysis.minimalLuminalAreaMm2, "mm2", 1)
        : "-";
    }
    if (els.coronaryReviewDs) {
      els.coronaryReviewDs.textContent = analysis
        ? formatPercent(analysis.diameterStenosisPercent, 0)
        : "-";
    }
    if (els.coronaryReviewAs) {
      els.coronaryReviewAs.textContent = analysis
        ? formatPercent(analysis.areaStenosisPercent, 0)
        : "-";
    }
    if (els.coronaryReviewQuality) {
      els.coronaryReviewQuality.textContent = reviewQualityText;
      els.coronaryReviewQuality.title = qcMeta?.detail || "";
    }

    els.coronaryMetrics.innerHTML = `
      <div class="meta-row">
        <dt>Label</dt>
        <dd>${vessel ? getDisplayedCoronaryLabel(vessel) : "No vessel selected"}</dd>
      </div>
      <div class="meta-row">
        <dt>Suggested</dt>
        <dd>${vessel ? suggestedText : "-"}</dd>
      </div>
      <div class="meta-row">
        <dt>Length</dt>
        <dd>${vessel ? formatDimension(vessel.totalLengthMm) : "-"}</dd>
      </div>
      <div class="meta-row">
        <dt>Mode</dt>
        <dd>${modeText}</dd>
      </div>
      <div class="meta-row">
        <dt>Seeds</dt>
        <dd>${vessel ? vessel.seedPoints.length : 0}</dd>
      </div>
      <div class="meta-row">
        <dt>Sample</dt>
        <dd>${sampleText}</dd>
      </div>
      <div class="meta-row">
        <dt>Radius</dt>
        <dd>${radiusText}</dd>
      </div>
      <div class="meta-row">
        <dt>Threshold</dt>
        <dd>${vessel ? `${Math.round(vessel.thresholdHu)} HU / ${vessel.searchRadiusMm.toFixed(1)} mm` : "-"}</dd>
      </div>
      <div class="meta-row">
        <dt>Contour</dt>
        <dd>${qualityText}</dd>
      </div>
      <div class="meta-row">
        <dt>Reference</dt>
        <dd>${analysis ? `${formatMetricValue(analysis.referenceDiameterMm, "mm", 2)} / ${formatMetricValue(analysis.referenceAreaMm2, "mm2", 1)}` : "-"}</dd>
      </div>
      <div class="meta-row">
        <dt>MLD</dt>
        <dd>${analysis ? formatMetricValue(analysis.minimalLuminalDiameterMm, "mm", 2) : "-"}</dd>
      </div>
      <div class="meta-row">
        <dt>MLA</dt>
        <dd>${analysis ? formatMetricValue(analysis.minimalLuminalAreaMm2, "mm2", 1) : "-"}</dd>
      </div>
      <div class="meta-row">
        <dt>Dia Stenosis</dt>
        <dd>${analysis ? formatPercent(analysis.diameterStenosisPercent, 0) : "-"}</dd>
      </div>
      <div class="meta-row">
        <dt>Area Stenosis</dt>
        <dd>${analysis ? formatPercent(analysis.areaStenosisPercent, 0) : "-"}</dd>
      </div>
      <div class="meta-row">
        <dt>Estimate</dt>
        <dd>${analysis?.note || "-"}</dd>
      </div>
    `;

    renderCoronaryVesselButtons();
    updateBackendUi();
  }

  function updateSidebarUi() {
    updateVoiUi();
    updateMprUi();
    updateSyncButton();
    updateMeasurementCount();
    updateMetadata();
    updateCoronaryUi();
    renderCoronaryResultsTable();
    renderBackendArtifactsPanel();
    renderReconstructionButtons();
    updateProfilePanel();
    updateReadouts();
  }

  function openCoronaryCpr(vesselId) {
    setActiveCoronaryVessel(vesselId, {
      preferMidpoint: true,
      autoPresentation: true,
      focusViewport: true,
      scrollCoronaryPanel: true,
      spotlightCoronaryPanel: true,
    });
  }

  function setActiveReconstruction(reconstructionId) {
    const reconstruction = state.reconstructions.find((item) => item.id === reconstructionId);
    if (!reconstruction) {
      return;
    }

    state.activeReconId = reconstructionId;
    if (!reconstruction.annotations.some((annotation) => annotation.id === state.selectedAnnotationId)) {
      state.selectedAnnotationId = null;
    }
    if (!state.mpr.centerWorld) {
      state.mpr.centerWorld = cloneVector(reconstruction.volume.centerWorld);
    }

    updateSidebarUi();
    requestRenderAll();
  }

  function resetMprState() {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return;
    }

    state.mpr.centerWorld = cloneVector(reconstruction.volume.centerWorld);
    state.mpr.overlayVisible = true;
    state.mpr.rotations = {
      axial: 0,
      coronal: 0,
      sagittal: 0,
    };
    state.polygonDraft = null;
    updateMprUi();
    requestRenderAll();
  }

  function resetViewportTransforms() {
    VIEWPORT_IDS.forEach((viewportId) => {
      const viewportState = state.viewports[viewportId];
      viewportState.zoom = 1;
      viewportState.panX = 0;
      viewportState.panY = 0;
      viewportState.lastGeometry = null;
      viewportState.lastFrame = null;
    });
  }

  function resetPresentationViewportTransform() {
    const viewportState = state.viewports.presentation;
    if (!viewportState) {
      return;
    }
    viewportState.zoom = 1;
    viewportState.panX = 0;
    viewportState.panY = 0;
    viewportState.lastGeometry = null;
    viewportState.lastFrame = null;
    requestRenderAll();
  }

  function resetPresentationWindowing() {
    if (!getActiveReconstruction()) {
      return;
    }
    applyPreset("coronary");
  }

  function setViewportTransform(viewportId, transform, options) {
    const targetIds = options?.sync && state.syncMprTransforms ? VIEWPORT_IDS : [viewportId];
    targetIds.forEach((targetId) => {
      const viewportState = state.viewports[targetId];
      if (!viewportState) {
        return;
      }
      if (transform.zoom != null) {
        viewportState.zoom = transform.zoom;
      }
      if (transform.panX != null) {
        viewportState.panX = transform.panX;
      }
      if (transform.panY != null) {
        viewportState.panY = transform.panY;
      }
    });
  }

  function zoomViewportAtClientPoint(viewportId, clientX, clientY, nextZoom) {
    const viewportState = state.viewports[viewportId];
    const geometry = viewportState?.lastGeometry;
    const canvas = viewportState?.canvas;
    if (!viewportState || !canvas) {
      return false;
    }

    const currentZoom = Number(viewportState.zoom) || 1;
    const clampedZoom = clamp(nextZoom, 0.2, 12);
    if (Math.abs(clampedZoom - currentZoom) < 0.0001) {
      return false;
    }

    if (!geometry) {
      setViewportTransform(viewportId, { zoom: clampedZoom }, { sync: true });
      return true;
    }

    const rect = canvas.getBoundingClientRect();
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;
    const centerX = geometry.originX + geometry.drawWidth / 2;
    const centerY = geometry.originY + geometry.drawHeight / 2;
    const zoomFactor = clampedZoom / currentZoom;

    setViewportTransform(
      viewportId,
      {
        zoom: clampedZoom,
        panX: viewportState.panX + (canvasX - centerX) * (1 - zoomFactor),
        panY: viewportState.panY + (canvasY - centerY) * (1 - zoomFactor),
      },
      { sync: true }
    );
    return true;
  }

  function syncAllViewportTransformsFrom(sourceViewportId) {
    const source = state.viewports[sourceViewportId];
    if (!source) {
      return;
    }
    setViewportTransform(sourceViewportId, {
      zoom: source.zoom,
      panX: source.panX,
      panY: source.panY,
    }, { sync: true });
  }

  function setSyncMprTransforms(enabled) {
    state.syncMprTransforms = Boolean(enabled);
    if (state.syncMprTransforms) {
      syncAllViewportTransformsFrom(state.activeViewportId || "presentation");
    }
    updateSyncButton();
    requestRenderAll();
  }

  function setMprRotations(nextRotations) {
    state.mpr.rotations = {
      axial: normalizeAngleDegrees(nextRotations.axial),
      coronal: normalizeAngleDegrees(nextRotations.coronal),
      sagittal: normalizeAngleDegrees(nextRotations.sagittal),
    };
    state.polygonDraft = null;
    updateMprUi();
    requestRenderAll();
  }

  function applyPreset(presetKey) {
    const preset = VOI_PRESETS[presetKey];
    if (!preset) {
      return;
    }
    state.currentPreset = presetKey;
    applyVoi(preset);
  }

  function applyVoi(voi, options) {
    const resetPreset = options?.resetPreset === true;
    state.currentVOI = {
      width: clamp(Math.round(voi.width), 1, 4000),
      center: clamp(Math.round(voi.center), -1200, 3000),
    };
    if (resetPreset) {
      state.currentPreset = null;
    }
    updateVoiUi();
    requestRenderAll();
  }

  function applyVoiFromInputs() {
    const widthValue = Number.parseFloat(els.windowWidthInput.value);
    const centerValue = Number.parseFloat(els.windowCenterInput.value);
    const width = clamp(Number.isFinite(widthValue) ? widthValue : state.currentVOI.width, 1, 4000);
    const center = clamp(Number.isFinite(centerValue) ? centerValue : state.currentVOI.center, -1200, 3000);
    applyVoi({ width, center }, { resetPreset: true });
  }

  function determineInitialVoi(records) {
    const candidate = records.find(
      (record) => Number.isFinite(record.windowWidth) && record.windowWidth > 0 && Number.isFinite(record.windowCenter)
    );
    if (candidate) {
      return {
        width: clamp(candidate.windowWidth, 1, 4000),
        center: clamp(candidate.windowCenter, -1200, 3000),
      };
    }
    return { ...VOI_PRESETS.coronary };
  }

  function getViewportPlane(viewportId) {
    return VIEWPORT_CONFIG[viewportId].plane;
  }

  function getPlaneMetrics(volume, plane) {
    if (!volume) {
      return null;
    }

    if (plane === "axial") {
      return {
        sampleWidth: volume.columns,
        sampleHeight: volume.rows,
        spacingX: volume.columnSpacing,
        spacingY: volume.rowSpacing,
        spacingNormal: volume.sliceSpacing,
        count: volume.depth,
      };
    }

    if (plane === "coronal") {
      return {
        sampleWidth: volume.columns,
        sampleHeight: volume.depth,
        spacingX: volume.columnSpacing,
        spacingY: volume.sliceSpacing,
        spacingNormal: volume.rowSpacing,
        count: volume.rows,
      };
    }

    return {
      sampleWidth: volume.rows,
      sampleHeight: volume.depth,
      spacingX: volume.rowSpacing,
      spacingY: volume.sliceSpacing,
      spacingNormal: volume.columnSpacing,
      count: volume.columns,
    };
  }

  function worldDirectionFromLocal(localVector) {
    if (!state.referenceBasis) {
      return cloneVector(localVector);
    }

    return normalize(
      addVectors(
        addVectors(
          scaleVector(state.referenceBasis.row, localVector[0]),
          scaleVector(state.referenceBasis.column, localVector[1])
        ),
        scaleVector(state.referenceBasis.normal, localVector[2])
      )
    );
  }

  function rotateLocalVector(localVector) {
    const ax = (state.mpr.rotations.axial * Math.PI) / 180;
    const ay = (state.mpr.rotations.coronal * Math.PI) / 180;
    const az = (state.mpr.rotations.sagittal * Math.PI) / 180;
    let [x, y, z] = localVector;

    let nextY = y * Math.cos(az) - z * Math.sin(az);
    let nextZ = y * Math.sin(az) + z * Math.cos(az);
    y = nextY;
    z = nextZ;

    let nextX = x * Math.cos(ay) + z * Math.sin(ay);
    nextZ = -x * Math.sin(ay) + z * Math.cos(ay);
    x = nextX;
    z = nextZ;

    nextX = x * Math.cos(ax) - y * Math.sin(ax);
    nextY = x * Math.sin(ax) + y * Math.cos(ax);
    x = nextX;
    y = nextY;

    return normalize([x, y, z]);
  }

  function getCurrentPlaneFrame(plane, reconstruction) {
    const activeReconstruction = reconstruction || getActiveReconstruction();
    const volume = activeReconstruction?.volume;
    if (!volume) {
      return null;
    }

    const metrics = getPlaneMetrics(volume, plane);
    const base = LOCAL_PLANE_BASES[plane];
    const uWorld = worldDirectionFromLocal(rotateLocalVector(base.u));
    const vWorld = worldDirectionFromLocal(rotateLocalVector(base.v));
    const nWorld = worldDirectionFromLocal(rotateLocalVector(base.n));

    return {
      plane,
      reconstructionId: activeReconstruction.id,
      centerWorld: cloneVector(state.mpr.centerWorld || volume.centerWorld),
      uWorld,
      vWorld,
      nWorld,
      metrics: {
        sampleWidth: metrics.sampleWidth,
        sampleHeight: metrics.sampleHeight,
        spacingX: metrics.spacingX,
        spacingY: metrics.spacingY,
        spacingNormal: metrics.spacingNormal,
        count: metrics.count,
      },
    };
  }

  function cloneFrame(frame) {
    return {
      plane: frame.plane,
      reconstructionId: frame.reconstructionId,
      centerWorld: cloneVector(frame.centerWorld),
      uWorld: cloneVector(frame.uWorld),
      vWorld: cloneVector(frame.vWorld),
      nWorld: cloneVector(frame.nWorld),
      metrics: { ...frame.metrics },
    };
  }

  function worldToVolumeCoordinates(volume, world) {
    const offset = subtractVectors(world, volume.originWorld);
    return {
      x: dot(offset, volume.rowDirection) / volume.columnSpacing,
      y: dot(offset, volume.columnDirection) / volume.rowSpacing,
      z: dot(offset, volume.normalDirection) / volume.sliceSpacing,
    };
  }

  function getNearestVoxelValue(volume, coordinates) {
    const x = Math.round(coordinates.x);
    const y = Math.round(coordinates.y);
    const z = Math.round(coordinates.z);
    if (x < 0 || x >= volume.columns || y < 0 || y >= volume.rows || z < 0 || z >= volume.depth) {
      return null;
    }

    const slice = volume.slices[z];
    const raw = slice.pixels[y * volume.columns + x];
    return raw * slice.slope + slice.intercept;
  }

  function sampleVolumeAtWorld(volume, world) {
    if (!volume) {
      return null;
    }
    return getNearestVoxelValue(volume, worldToVolumeCoordinates(volume, world));
  }

  function lerpVector(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }

  function averageVectors(points) {
    if (!points.length) {
      return [0, 0, 0];
    }
    const sum = points.reduce((accumulator, point) => {
      accumulator[0] += point[0];
      accumulator[1] += point[1];
      accumulator[2] += point[2];
      return accumulator;
    }, [0, 0, 0]);
    return scaleVector(sum, 1 / points.length);
  }

  function offsetWorld(origin, axisA, amountA, axisB, amountB, axisC, amountC) {
    let next = cloneVector(origin);
    if (axisA && amountA) {
      next = addVectors(next, scaleVector(axisA, amountA));
    }
    if (axisB && amountB) {
      next = addVectors(next, scaleVector(axisB, amountB));
    }
    if (axisC && amountC) {
      next = addVectors(next, scaleVector(axisC, amountC));
    }
    return next;
  }

  function volumeCoordinatesToWorld(volume, coordinates) {
    return addVectors(
      addVectors(
        addVectors(
          cloneVector(volume.originWorld),
          scaleVector(volume.rowDirection, coordinates.x * volume.columnSpacing)
        ),
        scaleVector(volume.columnDirection, coordinates.y * volume.rowSpacing)
      ),
      scaleVector(volume.normalDirection, coordinates.z * volume.sliceSpacing)
    );
  }

  function clampVolumeCoordinates(volume, coordinates) {
    return {
      x: clamp(Math.round(coordinates.x), 0, volume.columns - 1),
      y: clamp(Math.round(coordinates.y), 0, volume.rows - 1),
      z: clamp(Math.round(coordinates.z), 0, volume.depth - 1),
    };
  }

  function getVoxelValue(volume, x, y, z) {
    if (x < 0 || x >= volume.columns || y < 0 || y >= volume.rows || z < 0 || z >= volume.depth) {
      return null;
    }
    const slice = volume.slices[z];
    const raw = slice.pixels[y * volume.columns + x];
    return raw * slice.slope + slice.intercept;
  }

  function distancePointToSegmentWorld(point, start, end) {
    const segment = subtractVectors(end, start);
    const lengthSquared = dot(segment, segment);
    if (lengthSquared <= 1e-6) {
      return vectorLength(subtractVectors(point, start));
    }
    const t = clamp(dot(subtractVectors(point, start), segment) / lengthSquared, 0, 1);
    return vectorLength(subtractVectors(point, lerpVector(start, end, t)));
  }

  class MinPriorityQueue {
    constructor() {
      this.items = [];
    }

    push(node) {
      this.items.push(node);
      this.bubbleUp(this.items.length - 1);
    }

    pop() {
      if (!this.items.length) {
        return null;
      }
      const first = this.items[0];
      const last = this.items.pop();
      if (this.items.length && last) {
        this.items[0] = last;
        this.bubbleDown(0);
      }
      return first;
    }

    bubbleUp(index) {
      let nextIndex = index;
      while (nextIndex > 0) {
        const parentIndex = Math.floor((nextIndex - 1) / 2);
        if (this.items[parentIndex].priority <= this.items[nextIndex].priority) {
          break;
        }
        [this.items[parentIndex], this.items[nextIndex]] = [this.items[nextIndex], this.items[parentIndex]];
        nextIndex = parentIndex;
      }
    }

    bubbleDown(index) {
      let nextIndex = index;
      while (true) {
        const leftIndex = nextIndex * 2 + 1;
        const rightIndex = leftIndex + 1;
        let smallestIndex = nextIndex;
        if (
          leftIndex < this.items.length &&
          this.items[leftIndex].priority < this.items[smallestIndex].priority
        ) {
          smallestIndex = leftIndex;
        }
        if (
          rightIndex < this.items.length &&
          this.items[rightIndex].priority < this.items[smallestIndex].priority
        ) {
          smallestIndex = rightIndex;
        }
        if (smallestIndex === nextIndex) {
          break;
        }
        [this.items[smallestIndex], this.items[nextIndex]] = [this.items[nextIndex], this.items[smallestIndex]];
        nextIndex = smallestIndex;
      }
    }

    get length() {
      return this.items.length;
    }
  }

  function filterCloseWorldPoints(points, minimumDistanceMm) {
    const filtered = [];
    points.forEach((point) => {
      if (!filtered.length || vectorLength(subtractVectors(point, filtered[filtered.length - 1])) >= minimumDistanceMm) {
        filtered.push(cloneVector(point));
      }
    });
    return filtered;
  }

  function buildDirectionalMinimalPathSegment(volume, startWorld, endWorld, thresholdHu, searchRadiusMm) {
    const endpointDistanceMm = vectorLength(subtractVectors(endWorld, startWorld));
    if (!Number.isFinite(endpointDistanceMm) || endpointDistanceMm < 1.5 || endpointDistanceMm > 90) {
      return null;
    }

    const startVoxel = clampVolumeCoordinates(volume, worldToVolumeCoordinates(volume, startWorld));
    const endVoxel = clampVolumeCoordinates(volume, worldToVolumeCoordinates(volume, endWorld));
    const segmentDirection = normalize(subtractVectors(endWorld, startWorld));
    const marginMm = clamp(searchRadiusMm * 4.8 + endpointDistanceMm * 0.34, 8, 24);
    const bounds = {
      minX: clamp(Math.floor(Math.min(startVoxel.x, endVoxel.x) - marginMm / volume.columnSpacing), 0, volume.columns - 1),
      maxX: clamp(Math.ceil(Math.max(startVoxel.x, endVoxel.x) + marginMm / volume.columnSpacing), 0, volume.columns - 1),
      minY: clamp(Math.floor(Math.min(startVoxel.y, endVoxel.y) - marginMm / volume.rowSpacing), 0, volume.rows - 1),
      maxY: clamp(Math.ceil(Math.max(startVoxel.y, endVoxel.y) + marginMm / volume.rowSpacing), 0, volume.rows - 1),
      minZ: clamp(Math.floor(Math.min(startVoxel.z, endVoxel.z) - marginMm / volume.sliceSpacing), 0, volume.depth - 1),
      maxZ: clamp(Math.ceil(Math.max(startVoxel.z, endVoxel.z) + marginMm / volume.sliceSpacing), 0, volume.depth - 1),
    };

    const sizeX = bounds.maxX - bounds.minX + 1;
    const sizeY = bounds.maxY - bounds.minY + 1;
    const sizeZ = bounds.maxZ - bounds.minZ + 1;
    const totalNodes = sizeX * sizeY * sizeZ;
    if (totalNodes <= 0 || totalNodes > 260000) {
      return null;
    }

    const localIndex = (x, y, z) => (z - bounds.minZ) * sizeX * sizeY + (y - bounds.minY) * sizeX + (x - bounds.minX);
    const worldFromLocalIndex = (index) => {
      const zOffset = Math.floor(index / (sizeX * sizeY));
      const remaining = index - zOffset * sizeX * sizeY;
      const yOffset = Math.floor(remaining / sizeX);
      const xOffset = remaining - yOffset * sizeX;
      return {
        x: bounds.minX + xOffset,
        y: bounds.minY + yOffset,
        z: bounds.minZ + zOffset,
      };
    };

    const startIndex = localIndex(startVoxel.x, startVoxel.y, startVoxel.z);
    const endIndex = localIndex(endVoxel.x, endVoxel.y, endVoxel.z);
    const gScore = new Float32Array(totalNodes);
    gScore.fill(Number.POSITIVE_INFINITY);
    const cameFrom = new Int32Array(totalNodes);
    cameFrom.fill(-1);
    const closed = new Uint8Array(totalNodes);
    const cachedTravelCost = new Float32Array(totalNodes);
    const cachedTravelCostReady = new Uint8Array(totalNodes);
    const open = new MinPriorityQueue();
    const softThreshold = Math.max(70, thresholdHu - 220);
    const tunnelRadiusMm = clamp(Math.max(searchRadiusMm * 2.9, endpointDistanceMm * 0.2), 5.5, 16);
    const endpointSlackMm = Math.max(searchRadiusMm * 2.1, 5);
    const maxExpansions = Math.min(200000, totalNodes * 7);
    let expansionCount = 0;
    let bestIndex = startIndex;
    let bestHeuristic = endpointDistanceMm;
    const supportNeighbors = [
      { dx: 1, dy: 0, dz: 0 },
      { dx: -1, dy: 0, dz: 0 },
      { dx: 0, dy: 1, dz: 0 },
      { dx: 0, dy: -1, dz: 0 },
      { dx: 0, dy: 0, dz: 1 },
      { dx: 0, dy: 0, dz: -1 },
    ];

    function getTravelCost(nextIndex, nextX, nextY, nextZ) {
      if (cachedTravelCostReady[nextIndex]) {
        return cachedTravelCost[nextIndex];
      }

      const hu = getVoxelValue(volume, nextX, nextY, nextZ);
      if (!Number.isFinite(hu)) {
        cachedTravelCost[nextIndex] = Number.POSITIVE_INFINITY;
        cachedTravelCostReady[nextIndex] = 1;
        return cachedTravelCost[nextIndex];
      }

      let supportSumHu = 0;
      let supportCount = 0;
      supportNeighbors.forEach((neighbor) => {
        const neighborHu = getVoxelValue(volume, nextX + neighbor.dx, nextY + neighbor.dy, nextZ + neighbor.dz);
        if (!Number.isFinite(neighborHu)) {
          return;
        }
        supportSumHu += neighborHu;
        supportCount += 1;
      });
      const supportMeanHu = supportCount ? supportSumHu / supportCount : hu;
      const intensityNorm = clamp(
        (hu - softThreshold) / Math.max(130, thresholdHu + 430 - softThreshold),
        0,
        1
      );
      const supportNorm = clamp(
        (supportMeanHu - softThreshold) / Math.max(140, thresholdHu + 360 - softThreshold),
        0,
        1
      );
      const localContrastNorm = clamp((hu - supportMeanHu + 120) / 280, 0, 1);
      let travelCost = hu >= softThreshold
        ? 1.34 - intensityNorm * 0.78 - supportNorm * 0.18 - localContrastNorm * 0.08
        : 1.95 + clamp((softThreshold - hu) / 165, 0, 2);
      travelCost = clamp(travelCost, 0.28, 5.2);
      cachedTravelCost[nextIndex] = travelCost;
      cachedTravelCostReady[nextIndex] = 1;
      return travelCost;
    }

    gScore[startIndex] = 0;
    open.push({ index: startIndex, priority: endpointDistanceMm });

    while (open.length && expansionCount < maxExpansions) {
      const current = open.pop();
      if (!current || closed[current.index]) {
        continue;
      }
      closed[current.index] = 1;
      expansionCount += 1;

      if (current.index === endIndex) {
        bestIndex = current.index;
        break;
      }

      const currentVoxel = worldFromLocalIndex(current.index);
      const currentWorld = volumeCoordinatesToWorld(volume, currentVoxel);

      VOXEL_NEIGHBORS.forEach((neighbor) => {
        const nextX = currentVoxel.x + neighbor.dx;
        const nextY = currentVoxel.y + neighbor.dy;
        const nextZ = currentVoxel.z + neighbor.dz;
        if (
          nextX < bounds.minX || nextX > bounds.maxX ||
          nextY < bounds.minY || nextY > bounds.maxY ||
          nextZ < bounds.minZ || nextZ > bounds.maxZ
        ) {
          return;
        }

        const nextIndex = localIndex(nextX, nextY, nextZ);
        if (closed[nextIndex]) {
          return;
        }

        const nextWorld = volumeCoordinatesToWorld(volume, { x: nextX, y: nextY, z: nextZ });
        const lineDistanceMm = distancePointToSegmentWorld(nextWorld, startWorld, endWorld);
        const distanceToEndpointsMm = Math.min(
          vectorLength(subtractVectors(nextWorld, startWorld)),
          vectorLength(subtractVectors(nextWorld, endWorld))
        );
        if (lineDistanceMm > tunnelRadiusMm && distanceToEndpointsMm > endpointSlackMm) {
          return;
        }

        const intensityCost = getTravelCost(nextIndex, nextX, nextY, nextZ);
        if (!Number.isFinite(intensityCost)) {
          return;
        }

        const stepDistanceMm = Math.hypot(
          neighbor.dx * volume.columnSpacing,
          neighbor.dy * volume.rowSpacing,
          neighbor.dz * volume.sliceSpacing
        );
        const stepDirection = normalize(subtractVectors(nextWorld, currentWorld));
        const targetDirection = normalize(subtractVectors(endWorld, currentWorld));
        const alignmentPenalty = 1 + clamp((0.15 - dot(stepDirection, targetDirection)) * 0.48, 0, 0.4);
        const segmentDirectionPenalty = 1 + clamp((0.1 - dot(stepDirection, segmentDirection)) * 0.24, 0, 0.18);
        let turnPenalty = 1;
        if (cameFrom[current.index] >= 0) {
          const previousVoxel = worldFromLocalIndex(cameFrom[current.index]);
          const previousWorld = volumeCoordinatesToWorld(volume, previousVoxel);
          const previousDirection = normalize(subtractVectors(currentWorld, previousWorld));
          turnPenalty += clamp((0.2 - dot(previousDirection, stepDirection)) * 0.4, 0, 0.35);
        }
        const linePenalty = 1 + Math.pow(lineDistanceMm / Math.max(1, tunnelRadiusMm), 2) * 0.82;
        const tentativeScore =
          gScore[current.index] +
          stepDistanceMm * intensityCost * linePenalty * alignmentPenalty * segmentDirectionPenalty * turnPenalty;

        if (tentativeScore >= gScore[nextIndex]) {
          return;
        }

        cameFrom[nextIndex] = current.index;
        gScore[nextIndex] = tentativeScore;
        const heuristic = vectorLength(subtractVectors(nextWorld, endWorld)) * 0.76;
        if (heuristic < bestHeuristic) {
          bestHeuristic = heuristic;
          bestIndex = nextIndex;
        }
        open.push({
          index: nextIndex,
          priority: tentativeScore + heuristic,
        });
      });
    }

    if (bestIndex === startIndex && cameFrom[bestIndex] < 0) {
      return null;
    }

    const path = [];
    let currentIndex = bestIndex;
    while (currentIndex >= 0) {
      const voxel = worldFromLocalIndex(currentIndex);
      path.push(volumeCoordinatesToWorld(volume, voxel));
      currentIndex = cameFrom[currentIndex];
    }
    path.reverse();
    if (path.length < 2) {
      return null;
    }

    path[0] = cloneVector(startWorld);
    path[path.length - 1] = cloneVector(endWorld);
    const resampled = resamplePolylineWorld(path, Math.max(0.4, CORONARY_DEFAULTS.sampleStepMm * 0.8));
    return smoothPolylineWorld(resampled, 0.32, 1);
  }

  function buildFallbackStraightPolyline(startWorld, endWorld) {
    return resamplePolylineWorld(
      [cloneVector(startWorld), cloneVector(endWorld)],
      Math.max(0.45, CORONARY_DEFAULTS.sampleStepMm * 0.9)
    );
  }

  function refineTrackedPolylineSegment(volume, points, planeNormal, thresholdHu, searchRadiusMm) {
    if (!points?.length) {
      return [];
    }
    const pinnedStart = cloneVector(points[0]);
    const pinnedEnd = cloneVector(points[points.length - 1]);
    let workingPoints = resamplePolylineWorld(points, CORONARY_DEFAULTS.sampleStepMm);
    if (workingPoints.length < 2) {
      return workingPoints;
    }

    for (let pass = 0; pass < 2; pass += 1) {
      const frames = buildStableFrames(workingPoints, planeNormal);
      workingPoints = workingPoints.map((point, index) => {
        if (index === 0) {
          return cloneVector(pinnedStart);
        }
        if (index === workingPoints.length - 1) {
          return cloneVector(pinnedEnd);
        }
        return snapPointToCrossSection(
          volume,
          point,
          frames[index].tangent,
          planeNormal,
          thresholdHu,
          searchRadiusMm
        );
      });
      workingPoints = smoothPolylineWorld(workingPoints, 0.22, 1);
      workingPoints[0] = cloneVector(pinnedStart);
      workingPoints[workingPoints.length - 1] = cloneVector(pinnedEnd);
      workingPoints = resamplePolylineWorld(workingPoints, CORONARY_DEFAULTS.sampleStepMm);
      workingPoints[0] = cloneVector(pinnedStart);
      workingPoints[workingPoints.length - 1] = cloneVector(pinnedEnd);
    }

    return workingPoints;
  }

  function mergeTrackedSegmentPolylines(segmentPolylines) {
    const merged = [];
    segmentPolylines.forEach((segment, segmentIndex) => {
      segment.forEach((point, pointIndex) => {
        if (segmentIndex > 0 && pointIndex === 0) {
          return;
        }
        merged.push(cloneVector(point));
      });
    });
    return filterCloseWorldPoints(merged, 0.18);
  }

  function getCoronaryBuildMode(trackingSummary) {
    const controlPointCount = trackingSummary?.controlPointCount || 0;
    const fallbackSegments = trackingSummary?.fallbackSegments || 0;
    if (controlPointCount <= 2) {
      return fallbackSegments > 0 ? "two_point_fallback" : "two_point_directional_path";
    }
    return fallbackSegments > 0 ? "multi_point_mixed_path" : "multi_point_directional_path";
  }

  function buildTrackedControlPointPath(volume, controlPoints, planeNormal, thresholdHu, searchRadiusMm) {
    if (!controlPoints?.length || controlPoints.length < 2) {
      return null;
    }

    const segmentPolylines = [];
    let trackedSegments = 0;
    let fallbackSegments = 0;

    for (let index = 0; index < controlPoints.length - 1; index += 1) {
      const startWorld = controlPoints[index];
      const endWorld = controlPoints[index + 1];
      const trackedSegment = buildDirectionalMinimalPathSegment(
        volume,
        startWorld,
        endWorld,
        thresholdHu,
        searchRadiusMm
      );
      const baseSegment = trackedSegment?.length >= 2
        ? trackedSegment
        : buildFallbackStraightPolyline(startWorld, endWorld);
      if (trackedSegment?.length >= 2) {
        trackedSegments += 1;
      } else {
        fallbackSegments += 1;
      }
      const refinedSegment = refineTrackedPolylineSegment(
        volume,
        baseSegment,
        planeNormal,
        thresholdHu,
        searchRadiusMm
      );
      if (refinedSegment?.length >= 2) {
        segmentPolylines.push(refinedSegment);
      }
    }

    if (!segmentPolylines.length) {
      return null;
    }

    const mergedPoints = mergeTrackedSegmentPolylines(segmentPolylines);
    return {
      points: mergedPoints,
      trackedSegments,
      fallbackSegments,
      controlPointCount: controlPoints.length,
      totalSegments: Math.max(0, controlPoints.length - 1),
    };
  }

  function resamplePolylineWorld(points, stepMm) {
    const filtered = filterCloseWorldPoints(points, Math.max(0.2, stepMm * 0.35));
    if (filtered.length < 2) {
      return filtered;
    }

    const result = [cloneVector(filtered[0])];
    for (let index = 0; index < filtered.length - 1; index += 1) {
      const start = filtered[index];
      const end = filtered[index + 1];
      const length = vectorLength(subtractVectors(end, start));
      if (length <= 1e-4) {
        continue;
      }
      const steps = Math.max(1, Math.ceil(length / stepMm));
      for (let sampleIndex = 1; sampleIndex <= steps; sampleIndex += 1) {
        const point = lerpVector(start, end, sampleIndex / steps);
        if (
          sampleIndex === steps ||
          vectorLength(subtractVectors(point, result[result.length - 1])) >= stepMm * 0.45
        ) {
          result.push(point);
        }
      }
    }
    return result;
  }

  function smoothPolylineWorld(points, strength, passes) {
    let current = points.map((point) => cloneVector(point));
    const smoothStrength = clamp(strength, 0, 1);
    const passCount = Math.max(1, Math.round(passes || 1));
    for (let pass = 0; pass < passCount; pass += 1) {
      const next = current.map((point, index) => {
        if (index === 0 || index === current.length - 1) {
          return cloneVector(point);
        }
        const midpoint = scaleVector(addVectors(current[index - 1], current[index + 1]), 0.5);
        return lerpVector(point, midpoint, smoothStrength);
      });
      current = next;
    }
    return current;
  }

  function computePolylineLength(points) {
    let length = 0;
    for (let index = 1; index < points.length; index += 1) {
      length += vectorLength(subtractVectors(points[index], points[index - 1]));
    }
    return length;
  }

  function computePointTangent(points, index) {
    if (points.length === 1) {
      return [1, 0, 0];
    }
    if (index === 0) {
      return normalize(subtractVectors(points[1], points[0]));
    }
    if (index === points.length - 1) {
      return normalize(subtractVectors(points[index], points[index - 1]));
    }
    return normalize(subtractVectors(points[index + 1], points[index - 1]));
  }

  function pickOrthogonalVector(tangent, hintVector) {
    let candidate = hintVector
      ? subtractVectors(hintVector, scaleVector(tangent, dot(hintVector, tangent)))
      : null;
    if (!candidate || vectorLength(candidate) < 1e-3) {
      candidate = cross(tangent, [1, 0, 0]);
    }
    if (vectorLength(candidate) < 1e-3) {
      candidate = cross(tangent, [0, 1, 0]);
    }
    if (vectorLength(candidate) < 1e-3) {
      candidate = cross(tangent, [0, 0, 1]);
    }
    return normalize(candidate);
  }

  function buildStableFrames(points, planeNormalHint) {
    const frames = [];
    let previousNormal = null;
    points.forEach((point, index) => {
      const tangent = computePointTangent(points, index);
      let normal = previousNormal
        ? subtractVectors(previousNormal, scaleVector(tangent, dot(previousNormal, tangent)))
        : pickOrthogonalVector(tangent, planeNormalHint || state.referenceBasis?.normal || [0, 0, 1]);
      if (vectorLength(normal) < 1e-3) {
        normal = pickOrthogonalVector(tangent, planeNormalHint || [0, 0, 1]);
      }
      normal = normalize(normal);
      let binormal = normalize(cross(tangent, normal));
      if (vectorLength(binormal) < 1e-3) {
        binormal = pickOrthogonalVector(tangent, [1, 0, 0]);
      }
      normal = normalize(cross(binormal, tangent));
      frames.push({ tangent, normal, binormal });
      previousNormal = normal;
    });
    return frames;
  }

  function getSearchStepMm(volume, searchRadiusMm) {
    const baseSpacing = Math.min(volume.rowSpacing || 1, volume.columnSpacing || 1, volume.sliceSpacing || 1);
    return clamp(Math.min(baseSpacing, searchRadiusMm / 3), 0.5, 1);
  }

  function searchLocalPeak(volume, world, thresholdHu, searchRadiusMm) {
    const softenedThreshold = Math.max(110, thresholdHu - 120);
    const step = getSearchStepMm(volume, searchRadiusMm);
    let bestWorld = cloneVector(world);
    let bestHu = sampleVolumeAtWorld(volume, world) ?? -1024;
    const weightedPoints = [];
    const row = volume.rowDirection;
    const column = volume.columnDirection;
    const normal = volume.normalDirection;

    for (let xMm = -searchRadiusMm; xMm <= searchRadiusMm + 1e-6; xMm += step) {
      for (let yMm = -searchRadiusMm; yMm <= searchRadiusMm + 1e-6; yMm += step) {
        for (let zMm = -searchRadiusMm; zMm <= searchRadiusMm + 1e-6; zMm += step) {
          const distanceMm = Math.hypot(xMm, yMm, zMm);
          if (distanceMm > searchRadiusMm) {
            continue;
          }
          const sampleWorld = offsetWorld(world, row, xMm, column, yMm, normal, zMm);
          const hu = sampleVolumeAtWorld(volume, sampleWorld);
          if (hu == null) {
            continue;
          }
          if (hu > bestHu) {
            bestHu = hu;
            bestWorld = sampleWorld;
          }
          if (hu >= softenedThreshold) {
            const weight = (hu - softenedThreshold + 1) / (1 + distanceMm * distanceMm * 0.25);
            weightedPoints.push(scaleVector(sampleWorld, weight));
            weightedPoints.totalWeight = (weightedPoints.totalWeight || 0) + weight;
          }
        }
      }
    }

    if (weightedPoints.length && weightedPoints.totalWeight) {
      const weightedAverage = scaleVector(
        weightedPoints.reduce((accumulator, point) => addVectors(accumulator, point), [0, 0, 0]),
        1 / weightedPoints.totalWeight
      );
      return lerpVector(bestWorld, weightedAverage, 0.7);
    }
    return bestWorld;
  }

  function snapPointToCrossSection(volume, world, tangent, planeNormalHint, thresholdHu, searchRadiusMm) {
    const softenedThreshold = Math.max(110, thresholdHu - 90);
    const step = clamp(searchRadiusMm / 5.5, 0.35, 0.8);
    let bestWorld = cloneVector(world);
    let bestHu = sampleVolumeAtWorld(volume, world) ?? -1024;
    const normal = pickOrthogonalVector(tangent, planeNormalHint || state.referenceBasis?.normal || [0, 0, 1]);
    const binormal = normalize(cross(tangent, normal));
    let weightSum = 0;
    let weightedWorld = [0, 0, 0];

    for (let xMm = -searchRadiusMm; xMm <= searchRadiusMm + 1e-6; xMm += step) {
      for (let yMm = -searchRadiusMm; yMm <= searchRadiusMm + 1e-6; yMm += step) {
        const distanceMm = Math.hypot(xMm, yMm);
        if (distanceMm > searchRadiusMm) {
          continue;
        }
        const sampleWorld = offsetWorld(world, normal, xMm, binormal, yMm, null, 0);
        const hu = sampleVolumeAtWorld(volume, sampleWorld);
        if (hu == null) {
          continue;
        }
        if (hu > bestHu) {
          bestHu = hu;
          bestWorld = sampleWorld;
        }
        if (hu >= softenedThreshold) {
          const weight = (hu - softenedThreshold + 1) / (1 + distanceMm * distanceMm * 0.35);
          weightedWorld = addVectors(weightedWorld, scaleVector(sampleWorld, weight));
          weightSum += weight;
        }
      }
    }

    if (weightSum > 0) {
      const averageWorld = scaleVector(weightedWorld, 1 / weightSum);
      return lerpVector(bestWorld, averageWorld, 0.72);
    }
    return bestWorld;
  }

  function measurePolygonArea2d(points) {
    if (points.length < 3) {
      return 0;
    }
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area) * 0.5;
  }

  function rebuildContourGeometry(sample) {
    const pointCount = sample.radiiMm.length;
    const contour2d = [];
    sample.contourWorldPoints = sample.radiiMm.map((radius, index) => {
      const angle = (index / pointCount) * Math.PI * 2;
      const xMm = Math.cos(angle) * radius;
      const yMm = Math.sin(angle) * radius;
      contour2d.push({ x: xMm, y: yMm });
      return offsetWorld(sample.world, sample.normal, xMm, sample.binormal, yMm, null, 0);
    });
    sample.minRadiusMm = Math.min(...sample.radiiMm);
    sample.maxRadiusMm = Math.max(...sample.radiiMm);
    sample.meanRadiusMm = sample.radiiMm.reduce((sum, value) => sum + value, 0) / sample.radiiMm.length;
    sample.areaMm2 = measurePolygonArea2d(contour2d);
  }

  function estimateCrossSectionContour(volume, centerWorld, frame, thresholdHu, maxRadiusMm) {
    const softenedThreshold = Math.max(110, thresholdHu - 60);
    const radialStepMm = clamp(maxRadiusMm / 18, 0.2, 0.45);
    const radii = [];
    let supportedAngles = 0;

    for (let angleIndex = 0; angleIndex < CORONARY_DEFAULTS.contourAngles; angleIndex += 1) {
      const angle = (angleIndex / CORONARY_DEFAULTS.contourAngles) * Math.PI * 2;
      const direction = addVectors(
        scaleVector(frame.normal, Math.cos(angle)),
        scaleVector(frame.binormal, Math.sin(angle))
      );
      let lastAboveRadius = 0;
      for (let radiusMm = radialStepMm; radiusMm <= maxRadiusMm + 1e-6; radiusMm += radialStepMm) {
        const hu = sampleVolumeAtWorld(volume, offsetWorld(centerWorld, direction, radiusMm, null, 0, null, 0));
        if (hu != null && hu >= softenedThreshold) {
          lastAboveRadius = radiusMm;
        } else if (lastAboveRadius > 0) {
          break;
        }
      }
      if (lastAboveRadius > 0) {
        supportedAngles += 1;
      }
      radii.push(lastAboveRadius || Math.min(maxRadiusMm, 0.9));
    }

    const smoothedRadii = radii.map((radius, index) => {
      const previous = radii[(index - 1 + radii.length) % radii.length];
      const next = radii[(index + 1) % radii.length];
      return clamp((previous + radius * 2 + next) / 4, 0.6, maxRadiusMm);
    });

    return {
      radiiMm: smoothedRadii,
      coverage: supportedAngles / CORONARY_DEFAULTS.contourAngles,
    };
  }

  function refreshCoronaryDerivedGeometry(vessel) {
    const points = vessel.centerline.map((sample) => sample.world);
    const frames = buildStableFrames(points, vessel.curvedPlaneNormal);
    let distanceMm = 0;
    vessel.centerline.forEach((sample, index) => {
      if (index > 0) {
        distanceMm += vectorLength(subtractVectors(sample.world, vessel.centerline[index - 1].world));
      }
      sample.tangent = frames[index].tangent;
      sample.normal = frames[index].normal;
      sample.binormal = frames[index].binormal;
      sample.distanceMm = distanceMm;
      rebuildContourGeometry(sample);
    });
    vessel.totalLengthMm = distanceMm;
    vessel.analysis = computeCoronarySegmentAnalysis(vessel);
  }

  function getCoronarySampleDiameterMm(sample) {
    if (!sample || !Number.isFinite(sample.meanRadiusMm)) {
      return null;
    }
    return sample.meanRadiusMm * 2;
  }

  function averageTopFinite(values, fraction) {
    const finite = (values || [])
      .filter(Number.isFinite)
      .sort((left, right) => right - left);
    if (!finite.length) {
      return null;
    }
    const ratio = clamp(Number.isFinite(fraction) ? fraction : 0.5, 0.1, 1);
    const count = Math.max(1, Math.round(finite.length * ratio));
    return averageFinite(finite.slice(0, count));
  }

  function findMinimumFiniteIndex(values) {
    let bestIndex = null;
    let bestValue = Number.POSITIVE_INFINITY;
    values.forEach((value, index) => {
      if (!Number.isFinite(value) || value >= bestValue) {
        return;
      }
      bestValue = value;
      bestIndex = index;
    });
    return bestIndex;
  }

  function computeCoronarySegmentAnalysis(vessel) {
    if (!vessel?.centerline?.length) {
      return null;
    }

    const diametersMm = vessel.centerline.map((sample) => getCoronarySampleDiameterMm(sample));
    const areasMm2 = vessel.centerline.map((sample) => (Number.isFinite(sample.areaMm2) ? sample.areaMm2 : null));
    const smoothedDiametersMm = smoothSeries(diametersMm, 1);
    const smoothedAreasMm2 = smoothSeries(areasMm2, 1);
    let lesionSampleIndex = findMinimumFiniteIndex(smoothedDiametersMm);
    if (!Number.isFinite(lesionSampleIndex)) {
      lesionSampleIndex = findMinimumFiniteIndex(smoothedAreasMm2);
    }
    if (!Number.isFinite(lesionSampleIndex)) {
      lesionSampleIndex = findMinimumFiniteIndex(diametersMm);
    }
    if (!Number.isFinite(lesionSampleIndex)) {
      lesionSampleIndex = findMinimumFiniteIndex(areasMm2);
    }
    if (!Number.isFinite(lesionSampleIndex)) {
      return null;
    }

    const sampleCount = vessel.centerline.length;
    const windowSize = clamp(Math.round(sampleCount * 0.22), 2, Math.min(sampleCount, 8));
    const proximalDiametersMm = diametersMm.slice(0, windowSize);
    const distalDiametersMm = diametersMm.slice(Math.max(0, sampleCount - windowSize));
    const proximalAreasMm2 = areasMm2.slice(0, windowSize);
    const distalAreasMm2 = areasMm2.slice(Math.max(0, sampleCount - windowSize));
    const proximalReferenceDiameterMm = averageTopFinite(proximalDiametersMm, 0.5);
    const distalReferenceDiameterMm = averageTopFinite(distalDiametersMm, 0.5);
    const proximalReferenceAreaMm2 = averageTopFinite(proximalAreasMm2, 0.5);
    const distalReferenceAreaMm2 = averageTopFinite(distalAreasMm2, 0.5);
    const referenceDiameterMm = averageFinite([proximalReferenceDiameterMm, distalReferenceDiameterMm]);
    const referenceAreaMm2 = averageFinite([proximalReferenceAreaMm2, distalReferenceAreaMm2]);
    const minimalLuminalDiameterMm = diametersMm[lesionSampleIndex];
    const minimalLuminalAreaMm2 = areasMm2[lesionSampleIndex];
    const diameterStenosisPercent = referenceDiameterMm > 0 && minimalLuminalDiameterMm > 0
      ? clamp((1 - minimalLuminalDiameterMm / referenceDiameterMm) * 100, 0, 99.9)
      : null;
    const areaStenosisPercent = referenceAreaMm2 > 0 && minimalLuminalAreaMm2 > 0
      ? clamp((1 - minimalLuminalAreaMm2 / referenceAreaMm2) * 100, 0, 99.9)
      : null;

    return {
      mode: vessel.seedPoints?.length === 2 ? "two_point_short_segment" : "tracked_vessel",
      lesionSampleIndex,
      lesionDistanceMm: vessel.centerline[lesionSampleIndex]?.distanceMm ?? null,
      referenceDiameterMm,
      referenceAreaMm2,
      proximalReferenceDiameterMm,
      distalReferenceDiameterMm,
      minimalLuminalDiameterMm,
      minimalLuminalAreaMm2,
      diameterStenosisPercent,
      areaStenosisPercent,
      meanDiameterMm: averageFinite(diametersMm),
      meanAreaMm2: averageFinite(areasMm2),
      meanCoverage: averageFinite(vessel.centerline.map((sample) => sample.coverage)),
      note: vessel.seedPoints?.length === 2
        ? "Prototype short-segment estimate from the editable two-point tracked path."
        : "Prototype centerline-derived estimate from the editable control-point vessel track.",
    };
  }

  function suggestCoronaryLabel(points, centerWorld) {
    if (points.length < 2) {
      return "Branch";
    }
    const start = points[0];
    const end = points[points.length - 1];
    const delta = subtractVectors(end, start);
    const relativeX = start[0] - centerWorld[0];
    const relativeY = start[1] - centerWorld[1];
    const lengthMm = computePolylineLength(points);
    if (relativeX < -14) {
      return "RCA";
    }
    if (Math.abs(relativeX) < 10 && lengthMm < 24) {
      return "LM";
    }
    if (relativeY > 6) {
      return "LCx";
    }
    if (delta[1] < -4 || delta[2] < -6) {
      return "LAD";
    }
    return relativeX > 8 ? "LCx" : "LAD";
  }

  function buildCoronaryVesselModel(reconstruction, seedPoints, draftFrame, options) {
    const volume = reconstruction.volume;
    const thresholdHu = clamp(
      options?.thresholdHu ?? state.coronary.settings.lumenThresholdHu,
      80,
      1200
    );
    const searchRadiusMm = clamp(
      options?.searchRadiusMm ?? state.coronary.settings.searchRadiusMm,
      1.5,
      8
    );
    const planeNormal = cloneVector(draftFrame?.nWorld || state.referenceBasis?.normal || volume.normalDirection);
    const snappedSeedPoints = filterCloseWorldPoints(
      seedPoints.map((point) => searchLocalPeak(volume, point, thresholdHu, searchRadiusMm)),
      0.35
    );
    if (snappedSeedPoints.length < 2) {
      throw new Error("Add at least two coronary clicks to build a vessel.");
    }

    const trackedPath = buildTrackedControlPointPath(
      volume,
      snappedSeedPoints,
      planeNormal,
      thresholdHu,
      searchRadiusMm
    );
    let workingPoints = trackedPath?.points?.length >= 2
      ? trackedPath.points
      : snappedSeedPoints.map((point) => cloneVector(point));
    if (workingPoints.length < 2) {
      throw new Error("The clicked coronary control points could not be converted into a usable 3D path.");
    }

    workingPoints[0] = cloneVector(snappedSeedPoints[0]);
    workingPoints[workingPoints.length - 1] = cloneVector(snappedSeedPoints[snappedSeedPoints.length - 1]);

    const frames = buildStableFrames(workingPoints, planeNormal);
    const centerline = workingPoints.map((world, index) => {
      const contour = estimateCrossSectionContour(volume, world, frames[index], thresholdHu, searchRadiusMm);
      return {
        world,
        tangent: frames[index].tangent,
        normal: frames[index].normal,
        binormal: frames[index].binormal,
        radiiMm: contour.radiiMm,
        coverage: contour.coverage,
        contourWorldPoints: [],
        distanceMm: 0,
        minRadiusMm: 0,
        maxRadiusMm: 0,
        meanRadiusMm: 0,
        areaMm2: 0,
      };
    });

    const vessel = {
      id: `coronary_${state.coronary.nextVesselSequence++}`,
      color: allocateCoronaryColor(state.coronary.vessels.length),
      label: "Auto",
      suggestedLabel: suggestCoronaryLabel(workingPoints, reconstruction.volume.centerWorld),
      thresholdHu,
      searchRadiusMm,
      seedPoints: cloneWorldPoints(seedPoints),
      seedPlane: draftFrame?.plane || "axial",
      curvedPlaneNormal: planeNormal,
      buildMode: getCoronaryBuildMode(
        trackedPath || {
          controlPointCount: snappedSeedPoints.length,
          trackedSegments: 0,
          fallbackSegments: Math.max(0, snappedSeedPoints.length - 1),
          totalSegments: Math.max(0, snappedSeedPoints.length - 1),
        }
      ),
      controlPointCount: trackedPath?.controlPointCount || snappedSeedPoints.length,
      trackedSegmentCount: trackedPath?.trackedSegments || 0,
      fallbackSegmentCount: trackedPath?.fallbackSegments || Math.max(0, snappedSeedPoints.length - 1),
      totalTrackedSegments: trackedPath?.totalSegments || Math.max(0, snappedSeedPoints.length - 1),
      centerline,
      totalLengthMm: 0,
      analysis: null,
    };
    refreshCoronaryDerivedGeometry(vessel);
    return vessel;
  }

  function clearCoronaryDraft(options) {
    state.coronary.draftSeedPoints = [];
    state.coronary.draftViewportId = null;
    state.coronary.draftFrame = null;
    if (options?.keepTool !== true && state.activeToolKey === "coronarySeed") {
      setActiveTool("edit");
      return;
    }
    updateSidebarUi();
    requestRenderAll();
  }

  function startCoronaryDraft() {
    state.coronary.draftSeedPoints = [];
    state.coronary.draftViewportId = null;
    state.coronary.draftFrame = null;
    setActiveTool("coronarySeed");
    setStatus(
      state.coronary.quickSegmentMode
        ? "Manual vessel tracing enabled. Click the vessel center in MPR, scroll distally, then click a second point. The app will build a tracked 3D short segment."
        : "Control-point vessel tracing enabled. Place start and distal points first, then add more control points only where the vessel needs help."
    );
  }

  function addCoronarySeedPoint(viewportId, frame, worldPoint) {
    if (!frame || !worldPoint) {
      return;
    }
    if (!state.coronary.draftFrame) {
      state.coronary.draftFrame = cloneFrame(frame);
      state.coronary.draftViewportId = viewportId;
      state.coronary.draftSeedPoints = [cloneVector(worldPoint)];
    } else {
      const previousPoint = state.coronary.draftSeedPoints[state.coronary.draftSeedPoints.length - 1];
      if (!previousPoint || vectorLength(subtractVectors(worldPoint, previousPoint)) >= 0.35) {
        state.coronary.draftSeedPoints.push(cloneVector(worldPoint));
      }
    }

    if (state.coronary.quickSegmentMode && state.coronary.draftSeedPoints.length === 2) {
      const endpointDistanceMm = vectorLength(
        subtractVectors(state.coronary.draftSeedPoints[1], state.coronary.draftSeedPoints[0])
      );
      if (endpointDistanceMm < CORONARY_DEFAULTS.quickSegmentMinLengthMm) {
        setStatus("Move the second click a little farther along the vessel so a short segment can be built.", "warning");
      } else if (endpointDistanceMm > CORONARY_DEFAULTS.quickSegmentMaxLengthMm) {
        setStatus(
          `The two clicks are ${formatDimension(endpointDistanceMm)} apart. Short-segment auto mode is tuned for nearby points, so switch to control-point tracing and add an intermediate click.`,
          "warning"
        );
      } else {
        try {
          finishCoronaryDraft({ preferLesionSample: true, autoMode: "two_point" });
          return;
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Two-point coronary segmentation failed.", "error");
          return;
        }
      }
    }

    updateSidebarUi();
    requestRenderAll();
  }

  function finishCoronaryDraft(options) {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      throw new Error("Load a coronary CTA series before building a vessel.");
    }
    if (state.coronary.draftSeedPoints.length < 2) {
      throw new Error("Add at least two coronary clicks before finishing the vessel.");
    }

    const vessel = buildCoronaryVesselModel(
      reconstruction,
      state.coronary.draftSeedPoints,
      state.coronary.draftFrame,
      state.coronary.settings
    );
    state.coronary.vessels.push(vessel);
    state.coronary.draftSeedPoints = [];
    state.coronary.draftViewportId = null;
    state.coronary.draftFrame = null;
    const preferLesionSample = options?.preferLesionSample !== false
      && vessel.analysis?.mode === "two_point_short_segment"
      && Number.isFinite(vessel.analysis?.lesionSampleIndex);
    const selectionOptions = {
      autoPresentation: true,
      focusViewport: true,
      scrollCoronaryPanel: true,
      spotlightCoronaryPanel: true,
    };
    if (preferLesionSample) {
      selectionOptions.sampleIndex = vessel.analysis.lesionSampleIndex;
      selectionOptions.preferMidpoint = false;
    } else {
      selectionOptions.preferMidpoint = true;
    }
    setActiveCoronaryVessel(vessel.id, selectionOptions);
    const stenosisSuffix = Number.isFinite(vessel.analysis?.diameterStenosisPercent)
      ? ` Prototype diameter stenosis ${formatPercent(vessel.analysis.diameterStenosisPercent, 0)}.`
      : "";
    setStatus(
      `Built ${getDisplayedCoronaryLabel(vessel)} with ${vessel.centerline.length} samples from ${getCoronaryTrackingSummaryText(vessel)}.${stenosisSuffix}`
    );
    pushHistorySnapshot("Build coronary vessel");
  }

  function replaceCoronaryVessel(vesselId, nextVessel) {
    const vesselIndex = state.coronary.vessels.findIndex((item) => item.id === vesselId);
    if (vesselIndex < 0) {
      return null;
    }
    const previous = state.coronary.vessels[vesselIndex];
    nextVessel.id = previous.id;
    nextVessel.color = previous.color;
    nextVessel.label = previous.label;
    state.coronary.vessels.splice(vesselIndex, 1, nextVessel);
    state.coronary.activeVesselId = nextVessel.id;
    return nextVessel;
  }

  function resegmentActiveCoronaryVessel(options) {
    const reconstruction = getActiveReconstruction();
    const vessel = getActiveCoronaryVessel();
    if (!reconstruction || !vessel) {
      return;
    }
    const sampleRatio = vessel.centerline.length > 1 ? state.coronary.activeSampleIndex / (vessel.centerline.length - 1) : 0;
    const nextVessel = buildCoronaryVesselModel(reconstruction, vessel.seedPoints, { plane: vessel.seedPlane, nWorld: vessel.curvedPlaneNormal }, {
      thresholdHu: options?.thresholdHu ?? vessel.thresholdHu,
      searchRadiusMm: options?.searchRadiusMm ?? vessel.searchRadiusMm,
    });
    replaceCoronaryVessel(vessel.id, nextVessel);
    nextVessel.label = vessel.label;
    nextVessel.thresholdHu = options?.thresholdHu ?? vessel.thresholdHu;
    nextVessel.searchRadiusMm = options?.searchRadiusMm ?? vessel.searchRadiusMm;
    setActiveCoronarySampleIndex(Math.round(sampleRatio * Math.max(0, nextVessel.centerline.length - 1)));
    setStatus(`Re-segmented ${getDisplayedCoronaryLabel(nextVessel)} using ${Math.round(nextVessel.thresholdHu)} HU.`);
    pushHistorySnapshot("Resegment vessel");
  }

  function clampContourRadii(radiiMm, maxRadiusMm) {
    return radiiMm.map((radius) => clamp(radius, 0.4, maxRadiusMm));
  }

  function nudgeActiveCoronaryRadius(deltaMm) {
    const vessel = getActiveCoronaryVessel();
    const sample = getActiveCoronarySample();
    if (!vessel || !sample) {
      return;
    }
    sample.radiiMm = clampContourRadii(
      sample.radiiMm.map((radius) => radius + deltaMm),
      vessel.searchRadiusMm * 1.35
    );
    refreshCoronaryDerivedGeometry(vessel);
    updateSidebarUi();
    requestRenderAll();
    pushHistorySnapshot("Adjust vessel contour");
  }

  function adjustActiveCoronaryThreshold(deltaHu) {
    const vessel = getActiveCoronaryVessel();
    if (!vessel) {
      return;
    }
    const nextThreshold = clamp(vessel.thresholdHu + deltaHu, 80, 1200);
    state.coronary.settings.lumenThresholdHu = nextThreshold;
    resegmentActiveCoronaryVessel({ thresholdHu: nextThreshold, searchRadiusMm: vessel.searchRadiusMm });
  }

  function snapActiveCoronaryCenter() {
    const reconstruction = getActiveReconstruction();
    const vessel = getActiveCoronaryVessel();
    const sample = getActiveCoronarySample();
    if (!reconstruction || !vessel || !sample) {
      return;
    }
    sample.world = snapPointToCrossSection(
      reconstruction.volume,
      sample.world,
      sample.tangent,
      vessel.curvedPlaneNormal,
      vessel.thresholdHu,
      vessel.searchRadiusMm
    );
    const contour = estimateCrossSectionContour(
      reconstruction.volume,
      sample.world,
      sample,
      vessel.thresholdHu,
      vessel.searchRadiusMm
    );
    sample.radiiMm = contour.radiiMm;
    sample.coverage = contour.coverage;
    refreshCoronaryDerivedGeometry(vessel);
    updateSidebarUi();
    requestRenderAll();
    pushHistorySnapshot("Snap vessel center");
  }

  function deleteActiveCoronaryVessel() {
    const vessel = getActiveCoronaryVessel();
    if (!vessel) {
      return;
    }
    state.coronary.vessels = state.coronary.vessels.filter((item) => item.id !== vessel.id);
    const nextVessel = state.coronary.vessels[0] || null;
    if (nextVessel) {
      setActiveCoronaryVessel(nextVessel.id, {
        preferMidpoint: true,
        autoPresentation: true,
        focusViewport: true,
        spotlightCoronaryPanel: true,
      });
    } else {
      state.coronary.activeVesselId = null;
      state.coronary.activeSampleIndex = 0;
      updateSidebarUi();
      requestRenderAll();
    }
    pushHistorySnapshot("Delete coronary vessel");
  }

  function updateActiveCoronaryLabel(label) {
    const vessel = getActiveCoronaryVessel();
    if (!vessel) {
      return;
    }
    vessel.label = CORONARY_LABEL_OPTIONS.includes(label) ? label : "Auto";
    updateSidebarUi();
    requestRenderAll();
    pushHistorySnapshot("Rename vessel");
  }

  function getReadoutIndex(reconstruction, plane) {
    if (!reconstruction || !state.mpr.centerWorld) {
      return 0;
    }

    const coordinates = worldToVolumeCoordinates(reconstruction.volume, state.mpr.centerWorld);
    if (plane === "axial") {
      return clamp(Math.round(coordinates.z), 0, reconstruction.volume.depth - 1);
    }
    if (plane === "coronal") {
      return clamp(Math.round(coordinates.y), 0, reconstruction.volume.rows - 1);
    }
    return clamp(Math.round(coordinates.x), 0, reconstruction.volume.columns - 1);
  }

  function getViewportSummary(viewportId) {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return viewportId === "presentation" ? "0 / 0" : `${VIEWPORT_CONFIG[viewportId].readoutLabel} -`;
    }

    const plane = getViewportPlane(viewportId);
    const metrics = getPlaneMetrics(reconstruction.volume, plane);
    const index = getReadoutIndex(reconstruction, plane);
    if (viewportId === "presentation") {
      return `${index + 1} / ${metrics.count}`;
    }
    return `${VIEWPORT_CONFIG[viewportId].readoutLabel} ${index + 1} / ${metrics.count}`;
  }

  function updateReadouts() {
    const reconstruction = getActiveReconstruction();
    const axialMetrics = reconstruction ? getPlaneMetrics(reconstruction.volume, "axial") : null;
    const axialIndex = reconstruction ? getReadoutIndex(reconstruction, "axial") : 0;
    const summary = axialMetrics ? `${axialIndex + 1} / ${axialMetrics.count}` : "0 / 0";

    els.sliceSlider.disabled = !axialMetrics;
    els.sliceSlider.max = String(Math.max(0, (axialMetrics?.count ?? 1) - 1));
    els.sliceSlider.value = String(axialIndex);
    els.sliceSummary.textContent = summary;
    if (els.presentationFastScrollSlider) {
      els.presentationFastScrollSlider.disabled = !axialMetrics;
      els.presentationFastScrollSlider.max = String(Math.max(0, (axialMetrics?.count ?? 1) - 1));
      els.presentationFastScrollSlider.value = String(axialIndex);
    }
    if (els.presentationFastScrollValue) {
      els.presentationFastScrollValue.textContent = summary;
    }
    els.readouts.presentation.textContent = summary;
    els.readouts.axial.textContent = getViewportSummary("axial");
    els.readouts.sagittal.textContent = getViewportSummary("sagittal");
    els.readouts.coronal.textContent = getViewportSummary("coronal");
  }

  function ensureCanvasSize(viewportId) {
    const viewportState = state.viewports[viewportId];
    const canvas = viewportState.canvas;
    const rect = canvas.getBoundingClientRect();
    const logicalWidth = Math.max(1, Math.round(rect.width));
    const logicalHeight = Math.max(1, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(logicalWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(logicalHeight * dpr));

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    viewportState.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    viewportState.ctx.imageSmoothingEnabled = false;

    return {
      width: logicalWidth,
      height: logicalHeight,
    };
  }

  function getRenderGeometry(viewportState, frame, canvasWidth, canvasHeight) {
    const widthMm = frame.metrics.sampleWidth * frame.metrics.spacingX;
    const heightMm = frame.metrics.sampleHeight * frame.metrics.spacingY;
    const fitScale = Math.min(canvasWidth / widthMm, canvasHeight / heightMm);
    const scale = fitScale * viewportState.zoom;
    const drawWidth = widthMm * scale;
    const drawHeight = heightMm * scale;
    const originX = (canvasWidth - drawWidth) / 2 + viewportState.panX;
    const originY = (canvasHeight - drawHeight) / 2 + viewportState.panY;

    return {
      scale,
      drawWidth,
      drawHeight,
      originX,
      originY,
      halfWidthMm: widthMm / 2,
      halfHeightMm: heightMm / 2,
    };
  }

  function voiToByte(value) {
    const width = Math.max(1, state.currentVOI.width);
    const center = state.currentVOI.center;
    const lower = center - 0.5 - (width - 1) / 2;
    const upper = center - 0.5 + (width - 1) / 2;
    if (value <= lower) {
      return 0;
    }
    if (value > upper) {
      return 255;
    }
    return Math.round((((value - (center - 0.5)) / (width - 1)) + 0.5) * 255);
  }

  function renderPlanePixelsToCanvas(bufferCanvas, reconstruction, frame) {
    const metrics = frame.metrics;
    if (bufferCanvas.width !== metrics.sampleWidth || bufferCanvas.height !== metrics.sampleHeight) {
      bufferCanvas.width = metrics.sampleWidth;
      bufferCanvas.height = metrics.sampleHeight;
    }

    const ctx = bufferCanvas.getContext("2d");
    const imageData = ctx.createImageData(metrics.sampleWidth, metrics.sampleHeight);
    const pixels = imageData.data;
    const halfX = (metrics.sampleWidth - 1) / 2;
    const halfY = (metrics.sampleHeight - 1) / 2;

    let offset = 0;
    for (let y = 0; y < metrics.sampleHeight; y += 1) {
      for (let x = 0; x < metrics.sampleWidth; x += 1) {
        const xMm = (x - halfX) * metrics.spacingX;
        const yMm = (y - halfY) * metrics.spacingY;
        const world = addVectors(
          addVectors(frame.centerWorld, scaleVector(frame.uWorld, xMm)),
          scaleVector(frame.vWorld, yMm)
        );
        const hu = sampleVolumeAtWorld(reconstruction.volume, world);
        const gray = voiToByte(hu == null ? -1024 : hu);
        pixels[offset] = gray;
        pixels[offset + 1] = gray;
        pixels[offset + 2] = gray;
        pixels[offset + 3] = 255;
        offset += 4;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function planeMmToCanvasPoint(geometry, xMm, yMm) {
    return {
      x: geometry.originX + geometry.drawWidth / 2 + xMm * geometry.scale,
      y: geometry.originY + geometry.drawHeight / 2 + yMm * geometry.scale,
    };
  }

  function worldToPlaneCoordinates(frame, world) {
    const offset = subtractVectors(world, frame.centerWorld);
    return {
      xMm: dot(offset, frame.uWorld),
      yMm: dot(offset, frame.vWorld),
      distanceMm: dot(offset, frame.nWorld),
    };
  }

  function canvasToWorldPoint(viewportId, clientX, clientY) {
    const planePoint = canvasToPlanePoint(viewportId, clientX, clientY);
    const viewportState = state.viewports[viewportId];
    const frame = viewportState?.lastFrame;
    if (!planePoint || !planePoint.inside || !frame) {
      return null;
    }

    return addVectors(
      addVectors(frame.centerWorld, scaleVector(frame.uWorld, planePoint.xMm)),
      scaleVector(frame.vWorld, planePoint.yMm)
    );
  }

  function canvasToPlanePoint(viewportId, clientX, clientY) {
    const viewportState = state.viewports[viewportId];
    const geometry = viewportState.lastGeometry;
    const frame = viewportState.lastFrame;
    const rect = viewportState.canvas.getBoundingClientRect();
    if (!geometry || !frame) {
      return null;
    }

    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;
    const xMm = (canvasX - (geometry.originX + geometry.drawWidth / 2)) / geometry.scale;
    const yMm = (canvasY - (geometry.originY + geometry.drawHeight / 2)) / geometry.scale;
    return {
      canvasX,
      canvasY,
      xMm,
      yMm,
      inside: Math.abs(xMm) <= geometry.halfWidthMm && Math.abs(yMm) <= geometry.halfHeightMm,
    };
  }

  function getPatientDirectionLabel(vector) {
    const [x, y, z] = vector;
    const absValues = [Math.abs(x), Math.abs(y), Math.abs(z)];
    const maxValue = Math.max(...absValues);
    if (maxValue === absValues[0]) {
      return x >= 0 ? "L" : "R";
    }
    if (maxValue === absValues[1]) {
      return y >= 0 ? "P" : "A";
    }
    return z >= 0 ? "S" : "I";
  }

  function getOrientationLabels(frame) {
    return {
      top: getPatientDirectionLabel(scaleVector(frame.vWorld, -1)),
      bottom: getPatientDirectionLabel(frame.vWorld),
      left: getPatientDirectionLabel(scaleVector(frame.uWorld, -1)),
      right: getPatientDirectionLabel(frame.uWorld),
    };
  }

  function updateOrientationOverlayForViewport(viewportId, frame) {
    const panel = els.viewportPanels.find((item) => item.dataset.viewportId === viewportId);
    const labels = getOrientationLabels(frame);
    panel.querySelector(".orientation-label.top").textContent = labels.top;
    panel.querySelector(".orientation-label.bottom").textContent = labels.bottom;
    panel.querySelector(".orientation-label.left").textContent = labels.left;
    panel.querySelector(".orientation-label.right").textContent = labels.right;
  }

  function drawHeaderBar(ctx, x, y, width, title, subtitle) {
    if (overlayStyle?.drawMprLine) {
      overlayStyle.drawMprLine(ctx, start, end, color);
      return;
    }

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
    ctx.fillRect(x, y, width, 56);
    ctx.fillStyle = "#f3f8fb";
    ctx.font = "600 20px Aptos, Segoe UI, sans-serif";
    ctx.fillText(title, x + 16, y + 24);
    ctx.fillStyle = "#ffcf66";
    ctx.font = "600 18px Aptos, Segoe UI, sans-serif";
    const subtitleWidth = ctx.measureText(subtitle).width;
    ctx.fillText(subtitle, x + width - subtitleWidth - 16, y + 24);
    ctx.restore();
  }

  function drawOrientationLabels(ctx, x, y, width, height, labels) {
    const entries = [
      { text: labels.top, px: x + width / 2, py: y + 74, align: "center", baseline: "middle" },
      { text: labels.bottom, px: x + width / 2, py: y + height - 22, align: "center", baseline: "middle" },
      { text: labels.left, px: x + 26, py: y + height / 2, align: "center", baseline: "middle" },
      { text: labels.right, px: x + width - 26, py: y + height / 2, align: "center", baseline: "middle" },
    ];

    ctx.save();
    ctx.font = "700 15px Aptos, Segoe UI, sans-serif";
    entries.forEach((entry) => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
      ctx.fillRect(entry.px - 16, entry.py - 14, 32, 28);
      ctx.fillStyle = "#f7fbff";
      ctx.textAlign = entry.align;
      ctx.textBaseline = entry.baseline;
      ctx.fillText(entry.text, entry.px, entry.py + 1);
    });
    ctx.restore();
  }

  function drawPlaneLine(ctx, frame, geometry, directionWorld, color) {
    const xMm = dot(directionWorld, frame.uWorld);
    const yMm = dot(directionWorld, frame.vWorld);
    const magnitude = Math.hypot(xMm, yMm);
    if (magnitude < 1e-4) {
      return;
    }

    const ux = xMm / magnitude;
    const uy = yMm / magnitude;
    const extent = Math.max(geometry.halfWidthMm, geometry.halfHeightMm) * 2.8;
    const start = planeMmToCanvasPoint(geometry, -ux * extent, -uy * extent);
    const end = planeMmToCanvasPoint(geometry, ux * extent, uy * extent);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.7;
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  function buildMprOverlayModel(reconstruction, frame, geometry) {
    const planeNames = ["axial", "coronal", "sagittal"].filter((planeName) => planeName !== frame.plane);
    const lines = planeNames.flatMap((planeName) => {
      const otherFrame = getCurrentPlaneFrame(planeName, reconstruction);
      if (!otherFrame) {
        return [];
      }
      const lineDirection = normalize(cross(frame.nWorld, otherFrame.nWorld));
      if (vectorLength(lineDirection) < 1e-4) {
        return [];
      }
      const xMm = dot(lineDirection, frame.uWorld);
      const yMm = dot(lineDirection, frame.vWorld);
      const magnitude = Math.hypot(xMm, yMm);
      if (magnitude < 1e-4) {
        return [];
      }
      return [{
        planeName,
        color: MPR_LINE_COLORS[planeName],
        ux: xMm / magnitude,
        uy: yMm / magnitude,
      }];
    });

    return {
      center: planeMmToCanvasPoint(geometry, 0, 0),
      lines,
    };
  }

  function drawMprCoordinateOverlay(ctx, reconstruction, frame, geometry) {
    const overlay = buildMprOverlayModel(reconstruction, frame, geometry);
    overlay.lines.forEach((line) => {
      drawPlaneLine(ctx, frame, geometry, addVectors(scaleVector(frame.uWorld, line.ux), scaleVector(frame.vWorld, line.uy)), line.color);
    });

    const center = overlay.center;
    if (overlayStyle?.drawMprCenter) {
      overlayStyle.drawMprCenter(ctx, center);
    } else {
      ctx.save();
      ctx.fillStyle = "#f5fbff";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    return overlay;
  }

  function getMprOverlayHit(viewportId, clientX, clientY) {
    if (state.mpr.overlayVisible === false) {
      return null;
    }
    const reconstruction = getActiveReconstruction();
    const viewportState = state.viewports[viewportId];
    const geometry = viewportState?.lastGeometry;
    const frame = viewportState?.lastFrame;
    const planePoint = canvasToPlanePoint(viewportId, clientX, clientY);
    if (!reconstruction || !geometry || !frame || !planePoint?.inside) {
      return null;
    }

    const overlay = buildMprOverlayModel(reconstruction, frame, geometry);
    const centerDistPx = Math.hypot(planePoint.canvasX - overlay.center.x, planePoint.canvasY - overlay.center.y);
    if (centerDistPx <= 10) {
      return {
        type: "center",
        planePoint,
      };
    }

    let bestLine = null;
    overlay.lines.forEach((line) => {
      const distanceMm = Math.abs(planePoint.xMm * line.uy - planePoint.yMm * line.ux);
      const distancePx = distanceMm * geometry.scale;
      const radialPx = Math.hypot(planePoint.xMm, planePoint.yMm) * geometry.scale;
      if (radialPx < 12 || distancePx > 10) {
        return;
      }
      if (!bestLine || distancePx < bestLine.distancePx) {
        bestLine = {
          type: "line",
          planeName: line.planeName,
          planePoint,
          angleRadians: Math.atan2(planePoint.yMm, planePoint.xMm),
          distancePx,
        };
      }
    });

    return bestLine;
  }

  function getViewportCanvas(viewportId) {
    return state.viewports[viewportId]?.canvas ?? null;
  }

  function getViewportTitle(viewportId) {
    return VIEWPORT_CONFIG[viewportId]?.title || "Viewport";
  }

  function drawLabelChip(ctx, text, x, y, fill, options = {}) {
    if (overlayStyle?.drawLabel) {
      return overlayStyle.drawLabel(ctx, text, x, y, fill, options);
    }
    ctx.save();
    ctx.font = "600 13px Aptos, Segoe UI, sans-serif";
    const textWidth = ctx.measureText(text).width;
    const width = textWidth + 16;
    const height = 24;
    const px = x + 10;
    const py = y - height - 10;
    ctx.fillStyle = fill;
    ctx.fillRect(px, py, width, height);
    ctx.fillStyle = "#061117";
    ctx.textBaseline = "middle";
    ctx.fillText(text, px + 8, py + height / 2 + 1);
    ctx.restore();
    return { x: px, y: py, width, height };
  }

  function getLabelChipBounds(ctx, text, x, y, options = {}) {
    if (overlayStyle?.layoutLabel) {
      return overlayStyle.layoutLabel(ctx, text, x, y, options);
    }
    ctx.save();
    ctx.font = "600 13px Aptos, Segoe UI, sans-serif";
    const textWidth = ctx.measureText(text).width;
    ctx.restore();
    const width = textWidth + 16;
    const height = 24;
    return {
      x: x + 10,
      y: y - height - 10,
      width,
      height,
    };
  }

  function drawSelectionHandle(ctx, point, radiusPx, color) {
    if (overlayStyle?.drawHandle) {
      overlayStyle.drawHandle(ctx, point, { radius: radiusPx, color });
      return;
    }
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#0a1015";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function pointToSegmentDistancePx(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 1e-6) {
      return Math.hypot(point.x - start.x, point.y - start.y);
    }
    let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
    t = clamp(t, 0, 1);
    const projectionX = start.x + t * dx;
    const projectionY = start.y + t * dy;
    return Math.hypot(point.x - projectionX, point.y - projectionY);
  }

  function planePointToWorld(frame, xMm, yMm) {
    return addVectors(
      addVectors(frame.centerWorld, scaleVector(frame.uWorld, xMm)),
      scaleVector(frame.vWorld, yMm)
    );
  }

  function drawArrowLine(ctx, from, to, color) {
    if (overlayStyle?.drawArrow) {
      overlayStyle.drawArrow(ctx, from, to, color);
      return;
    }
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const headLength = 16;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headLength * Math.cos(angle - Math.PI / 6), to.y - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(to.x - headLength * Math.cos(angle + Math.PI / 6), to.y - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawPolygonShape(ctx, points, strokeStyle, fillStyle, dashed) {
    if (points.length < 2) {
      return;
    }

    if (overlayStyle?.drawPolygon) {
      overlayStyle.drawPolygon(ctx, points, strokeStyle, {
        fill: fillStyle,
        fillAlpha: fillStyle ? undefined : 0,
        dashed: Boolean(dashed),
      });
      return;
    }

    ctx.save();
    if (dashed) {
      ctx.setLineDash([7, 5]);
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index].x, points[index].y);
    }
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function cloneWorldPoints(points) {
    return points.map((point) => cloneVector(point));
  }

  function cloneBrushMask(mask) {
    if (!mask) {
      return null;
    }
    return {
      originXmm: mask.originXmm,
      originYmm: mask.originYmm,
      stepMm: mask.stepMm,
      width: mask.width,
      height: mask.height,
      cells: mask.cells.slice(),
    };
  }

  function cloneAnnotation(annotation) {
    const clone = {
      ...annotation,
      frame: cloneFrame(annotation.frame),
      worldPoints: cloneWorldPoints(annotation.worldPoints),
    };
    if (annotation.ellipse) {
      clone.ellipse = { ...annotation.ellipse };
    }
    if (annotation.mask) {
      clone.mask = cloneBrushMask(annotation.mask);
    }
    if (annotation.thresholds) {
      clone.thresholds = { ...annotation.thresholds };
    }
    if (annotation.profileGuideAdjustments) {
      clone.profileGuideAdjustments = { ...annotation.profileGuideAdjustments };
    }
    return clone;
  }

  function cloneAnnotationFrameForReconstruction(annotation, reconstruction) {
    const metrics = getPlaneMetrics(reconstruction.volume, annotation.plane);
    const frame = cloneFrame(annotation.frame);
    frame.reconstructionId = reconstruction.id;
    frame.metrics = {
      sampleWidth: metrics.sampleWidth,
      sampleHeight: metrics.sampleHeight,
      spacingX: metrics.spacingX,
      spacingY: metrics.spacingY,
      spacingNormal: metrics.spacingNormal,
      count: metrics.count,
    };
    return frame;
  }

  function cloneMeasurementToReconstruction(annotation, reconstruction) {
    const clone = cloneAnnotation(annotation);
    clone.id = state.annotationSequence++;
    clone.frame = cloneAnnotationFrameForReconstruction(annotation, reconstruction);
    return clone;
  }

  function addAnnotation(annotation) {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return;
    }
    reconstruction.annotations.push(annotation);
    state.selectedAnnotationId = annotation.id;
    if (PROFILE_TYPES.has(annotation.type)) {
      state.selectedProfileAnnotationId = annotation.id;
    }
    updateMeasurementCount();
    updateProfilePanel();
    requestRenderAll();
    pushHistorySnapshot(`Add ${annotation.type}`);
  }

  function createAnnotationBase(type, frame) {
    return {
      id: state.annotationSequence++,
      type,
      plane: frame.plane,
      frame: cloneFrame(frame),
      worldPoints: [],
    };
  }

  function isAnnotationVisible(annotation, frame) {
    if (annotation.plane !== frame.plane) {
      return false;
    }

    if (dot(annotation.frame.nWorld, frame.nWorld) < 0.992) {
      return false;
    }

    const distance = Math.abs(dot(subtractVectors(annotation.frame.centerWorld, frame.centerWorld), frame.nWorld));
    return distance <= frame.metrics.spacingNormal * 0.75;
  }

  function projectWorldPointToCanvas(frame, geometry, worldPoint) {
    const coordinates = worldToPlaneCoordinates(frame, worldPoint);
    return planeMmToCanvasPoint(geometry, coordinates.xMm, coordinates.yMm);
  }

  function getLengthLabel(annotation) {
    const a = annotation.worldPoints[0];
    const b = annotation.worldPoints[1];
    const distance = vectorLength(subtractVectors(a, b));
    return `${distance.toFixed(1)} mm`;
  }

  function getProbeLabel(annotation, reconstruction) {
    const value = sampleVolumeAtWorld(reconstruction.volume, annotation.worldPoints[0]);
    return value == null ? "Probe" : `${Math.round(value)} HU`;
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
      const xi = polygon[index].x;
      const yi = polygon[index].y;
      const xj = polygon[previous].x;
      const yj = polygon[previous].y;
      const intersects = yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-6) + xi;
      if (intersects) {
        inside = !inside;
      }
    }
    return inside;
  }

  function getFreehandPlanePoints(annotation) {
    return annotation.worldPoints.map((worldPoint) => {
      const coordinates = worldToPlaneCoordinates(annotation.frame, worldPoint);
      return { x: coordinates.xMm, y: coordinates.yMm };
    });
  }

  function getPolygonAreaMm2(points) {
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area / 2);
  }

  function getFreehandStats(annotation, reconstruction) {
    const planePoints = getFreehandPlanePoints(annotation);
    if (planePoints.length < 3) {
      return null;
    }

    const minX = Math.floor(Math.min(...planePoints.map((point) => point.x)));
    const maxX = Math.ceil(Math.max(...planePoints.map((point) => point.x)));
    const minY = Math.floor(Math.min(...planePoints.map((point) => point.y)));
    const maxY = Math.ceil(Math.max(...planePoints.map((point) => point.y)));
    const sampleStep = Math.max(0.6, Math.min(annotation.frame.metrics.spacingX, annotation.frame.metrics.spacingY));

    let count = 0;
    let sum = 0;
    let sumSquares = 0;

    for (let y = minY; y <= maxY; y += sampleStep) {
      for (let x = minX; x <= maxX; x += sampleStep) {
        if (!pointInPolygon({ x, y }, planePoints)) {
          continue;
        }

        const world = addVectors(
          addVectors(annotation.frame.centerWorld, scaleVector(annotation.frame.uWorld, x)),
          scaleVector(annotation.frame.vWorld, y)
        );
        const value = sampleVolumeAtWorld(reconstruction.volume, world);
        if (value == null) {
          continue;
        }

        count += 1;
        sum += value;
        sumSquares += value * value;
      }
    }

    if (!count) {
      return null;
    }

    const mean = sum / count;
    const variance = Math.max(0, sumSquares / count - mean * mean);
    return {
      mean,
      sd: Math.sqrt(variance),
      areaMm2: getPolygonAreaMm2(planePoints),
      vertexCount: planePoints.length,
    };
  }

  function getFreehandLabel(annotation, reconstruction) {
    const stats = getFreehandStats(annotation, reconstruction);
    return stats
      ? `Mean ${Math.round(stats.mean)} HU / SD ${stats.sd.toFixed(1)} / Area ${stats.areaMm2.toFixed(1)} mm2`
      : "ROI";
  }

  function getBrushMaskStepMm(frame) {
    return clamp(Math.min(frame.metrics.spacingX, frame.metrics.spacingY) * 2, 0.4, 1);
  }

  function brushMaskIndex(mask, x, y) {
    return y * mask.width + x;
  }

  function getBrushMaskCellCenter(mask, x, y) {
    return {
      xMm: mask.originXmm + (x + 0.5) * mask.stepMm,
      yMm: mask.originYmm + (y + 0.5) * mask.stepMm,
    };
  }

  function countBrushMaskCells(mask) {
    if (!mask?.cells?.length) {
      return 0;
    }
    let count = 0;
    mask.cells.forEach((value) => {
      if (value) {
        count += 1;
      }
    });
    return count;
  }

  function createBrushMaskAroundPoint(frame, point, radiusMm) {
    const stepMm = getBrushMaskStepMm(frame);
    const paddingMm = stepMm * 2;
    const minX = point.xMm - radiusMm - paddingMm;
    const maxX = point.xMm + radiusMm + paddingMm;
    const minY = point.yMm - radiusMm - paddingMm;
    const maxY = point.yMm + radiusMm + paddingMm;
    const width = Math.max(1, Math.ceil((maxX - minX) / stepMm));
    const height = Math.max(1, Math.ceil((maxY - minY) / stepMm));
    return {
      originXmm: minX,
      originYmm: minY,
      stepMm,
      width,
      height,
      cells: new Array(width * height).fill(0),
    };
  }

  function ensureBrushMaskBounds(mask, minXmm, maxXmm, minYmm, maxYmm) {
    const paddingMm = mask.stepMm * 2;
    const currentMaxX = mask.originXmm + mask.width * mask.stepMm;
    const currentMaxY = mask.originYmm + mask.height * mask.stepMm;
    const targetMinX = Math.min(mask.originXmm, minXmm - paddingMm);
    const targetMinY = Math.min(mask.originYmm, minYmm - paddingMm);
    const targetMaxX = Math.max(currentMaxX, maxXmm + paddingMm);
    const targetMaxY = Math.max(currentMaxY, maxYmm + paddingMm);
    if (
      targetMinX === mask.originXmm &&
      targetMinY === mask.originYmm &&
      targetMaxX === currentMaxX &&
      targetMaxY === currentMaxY
    ) {
      return mask;
    }

    const width = Math.max(1, Math.ceil((targetMaxX - targetMinX) / mask.stepMm));
    const height = Math.max(1, Math.ceil((targetMaxY - targetMinY) / mask.stepMm));
    const cells = new Array(width * height).fill(0);
    const offsetX = Math.round((mask.originXmm - targetMinX) / mask.stepMm);
    const offsetY = Math.round((mask.originYmm - targetMinY) / mask.stepMm);

    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        const sourceIndex = brushMaskIndex(mask, x, y);
        if (!mask.cells[sourceIndex]) {
          continue;
        }
        const targetIndex = (y + offsetY) * width + (x + offsetX);
        cells[targetIndex] = 1;
      }
    }

    mask.originXmm = targetMinX;
    mask.originYmm = targetMinY;
    mask.width = width;
    mask.height = height;
    mask.cells = cells;
    return mask;
  }

  function trimBrushMask(mask) {
    if (!mask?.cells?.length) {
      return mask;
    }
    let minX = mask.width;
    let minY = mask.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if (!mask.cells[brushMaskIndex(mask, x, y)]) {
          continue;
        }
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) {
      mask.width = 1;
      mask.height = 1;
      mask.cells = [0];
      return mask;
    }

    const padding = 1;
    const targetMinX = Math.max(0, minX - padding);
    const targetMinY = Math.max(0, minY - padding);
    const targetMaxX = Math.min(mask.width - 1, maxX + padding);
    const targetMaxY = Math.min(mask.height - 1, maxY + padding);
    const width = targetMaxX - targetMinX + 1;
    const height = targetMaxY - targetMinY + 1;
    const cells = new Array(width * height).fill(0);

    for (let y = targetMinY; y <= targetMaxY; y += 1) {
      for (let x = targetMinX; x <= targetMaxX; x += 1) {
        const value = mask.cells[brushMaskIndex(mask, x, y)];
        cells[(y - targetMinY) * width + (x - targetMinX)] = value;
      }
    }

    mask.originXmm += targetMinX * mask.stepMm;
    mask.originYmm += targetMinY * mask.stepMm;
    mask.width = width;
    mask.height = height;
    mask.cells = cells;
    return mask;
  }

  function getBrushMaskCentroid(annotation) {
    const mask = annotation.mask;
    if (!mask?.cells?.length) {
      return { xMm: 0, yMm: 0 };
    }

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if (!mask.cells[brushMaskIndex(mask, x, y)]) {
          continue;
        }
        const point = getBrushMaskCellCenter(mask, x, y);
        sumX += point.xMm;
        sumY += point.yMm;
        count += 1;
      }
    }

    return count ? { xMm: sumX / count, yMm: sumY / count } : { xMm: 0, yMm: 0 };
  }

  function getBrushMaskBounds(annotation) {
    const mask = annotation.mask;
    if (!mask?.cells?.length) {
      return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if (!mask.cells[brushMaskIndex(mask, x, y)]) {
          continue;
        }
        const point = getBrushMaskCellCenter(mask, x, y);
        minX = Math.min(minX, point.xMm - mask.stepMm / 2);
        minY = Math.min(minY, point.yMm - mask.stepMm / 2);
        maxX = Math.max(maxX, point.xMm + mask.stepMm / 2);
        maxY = Math.max(maxY, point.yMm + mask.stepMm / 2);
      }
    }

    if (!Number.isFinite(minX)) {
      return null;
    }
    return { minX, minY, maxX, maxY };
  }

  function pointInBrushMask(annotation, xMm, yMm) {
    const mask = annotation.mask;
    if (!mask?.cells?.length) {
      return false;
    }
    const cellX = Math.floor((xMm - mask.originXmm) / mask.stepMm);
    const cellY = Math.floor((yMm - mask.originYmm) / mask.stepMm);
    if (cellX < 0 || cellY < 0 || cellX >= mask.width || cellY >= mask.height) {
      return false;
    }
    return Boolean(mask.cells[brushMaskIndex(mask, cellX, cellY)]);
  }

  function createBrushRoiAnnotation(frame, planePoint) {
    return {
      ...createAnnotationBase("brushRoi", frame),
      thresholds: normalizeBrushThresholds(state.brushRoi.minHu, state.brushRoi.maxHu),
      brushSizeMm: state.brushRoi.sizeMm,
      mask: createBrushMaskAroundPoint(frame, planePoint, state.brushRoi.sizeMm / 2),
    };
  }

  function paintBrushStamp(annotation, reconstruction, planePoint) {
    if (!annotation.mask) {
      annotation.mask = createBrushMaskAroundPoint(annotation.frame, planePoint, annotation.brushSizeMm / 2);
    }

    const radiusMm = clampBrushSizeMm(annotation.brushSizeMm || state.brushRoi.sizeMm) / 2;
    ensureBrushMaskBounds(
      annotation.mask,
      planePoint.xMm - radiusMm,
      planePoint.xMm + radiusMm,
      planePoint.yMm - radiusMm,
      planePoint.yMm + radiusMm
    );

    const mask = annotation.mask;
    const thresholds = normalizeBrushThresholds(annotation.thresholds?.minHu, annotation.thresholds?.maxHu);
    const minCellX = clamp(Math.floor((planePoint.xMm - radiusMm - mask.originXmm) / mask.stepMm), 0, mask.width - 1);
    const maxCellX = clamp(Math.ceil((planePoint.xMm + radiusMm - mask.originXmm) / mask.stepMm), 0, mask.width - 1);
    const minCellY = clamp(Math.floor((planePoint.yMm - radiusMm - mask.originYmm) / mask.stepMm), 0, mask.height - 1);
    const maxCellY = clamp(Math.ceil((planePoint.yMm + radiusMm - mask.originYmm) / mask.stepMm), 0, mask.height - 1);

    for (let y = minCellY; y <= maxCellY; y += 1) {
      for (let x = minCellX; x <= maxCellX; x += 1) {
        const cellCenter = getBrushMaskCellCenter(mask, x, y);
        if (Math.hypot(cellCenter.xMm - planePoint.xMm, cellCenter.yMm - planePoint.yMm) > radiusMm) {
          continue;
        }
        const world = planePointToWorld(annotation.frame, cellCenter.xMm, cellCenter.yMm);
        const value = sampleVolumeAtWorld(reconstruction.volume, world);
        if (value == null || value < thresholds.minHu || value > thresholds.maxHu) {
          continue;
        }
        mask.cells[brushMaskIndex(mask, x, y)] = 1;
      }
    }
  }

  function paintBrushStroke(annotation, reconstruction, startPoint, endPoint) {
    const radiusMm = clampBrushSizeMm(annotation.brushSizeMm || state.brushRoi.sizeMm) / 2;
    const distanceMm = startPoint ? Math.hypot(endPoint.xMm - startPoint.xMm, endPoint.yMm - startPoint.yMm) : 0;
    const stepMm = Math.max(annotation.mask?.stepMm || getBrushMaskStepMm(annotation.frame), radiusMm * 0.45);
    const stepCount = Math.max(1, Math.ceil(distanceMm / stepMm));
    for (let index = 0; index <= stepCount; index += 1) {
      const t = stepCount ? index / stepCount : 1;
      const point = {
        xMm: startPoint ? startPoint.xMm + (endPoint.xMm - startPoint.xMm) * t : endPoint.xMm,
        yMm: startPoint ? startPoint.yMm + (endPoint.yMm - startPoint.yMm) * t : endPoint.yMm,
      };
      paintBrushStamp(annotation, reconstruction, point);
    }
  }

  function getBrushStats(annotation, reconstruction) {
    const mask = annotation.mask;
    if (!mask?.cells?.length) {
      return null;
    }

    let count = 0;
    let sum = 0;
    let sumSquares = 0;

    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if (!mask.cells[brushMaskIndex(mask, x, y)]) {
          continue;
        }
        const point = getBrushMaskCellCenter(mask, x, y);
        const world = planePointToWorld(annotation.frame, point.xMm, point.yMm);
        const value = sampleVolumeAtWorld(reconstruction.volume, world);
        if (value == null) {
          continue;
        }
        count += 1;
        sum += value;
        sumSquares += value * value;
      }
    }

    if (!count) {
      return null;
    }

    const mean = sum / count;
    const variance = Math.max(0, sumSquares / count - mean * mean);
    return {
      mean,
      sd: Math.sqrt(variance),
      areaMm2: count * mask.stepMm * mask.stepMm,
      sampleCount: count,
    };
  }

  function getBrushLabel(annotation, reconstruction) {
    const stats = getBrushStats(annotation, reconstruction);
    return stats
      ? `Avg ${Math.round(stats.mean)} HU / SD ${stats.sd.toFixed(1)} / Area ${stats.areaMm2.toFixed(1)} mm2`
      : "ROI Brush";
  }

  function resampleClosedPlanePoints(points, stepMm) {
    if (!points?.length) {
      return [];
    }
    const samples = [];
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      const segmentLength = Math.hypot(next.x - current.x, next.y - current.y);
      const segmentSteps = Math.max(1, Math.ceil(segmentLength / stepMm));
      for (let step = 0; step < segmentSteps; step += 1) {
        const t = step / segmentSteps;
        samples.push({
          x: current.x + (next.x - current.x) * t,
          y: current.y + (next.y - current.y) * t,
        });
      }
    }
    return samples;
  }

  function simplifyPlanePoints(points, minimumDistanceMm) {
    const simplified = [];
    points.forEach((point) => {
      const last = simplified[simplified.length - 1];
      if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= minimumDistanceMm) {
        simplified.push(point);
      }
    });

    if (simplified.length > 2) {
      const first = simplified[0];
      const last = simplified[simplified.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) < minimumDistanceMm * 0.8) {
        simplified.pop();
      }
    }
    return simplified;
  }

  function getFreehandSampleDistanceMm(frame) {
    return Math.max(
      FREEHAND_ROI_SAMPLE_DISTANCE_MM,
      Math.min(frame?.metrics?.spacingX || FREEHAND_ROI_SAMPLE_DISTANCE_MM, frame?.metrics?.spacingY || FREEHAND_ROI_SAMPLE_DISTANCE_MM)
    );
  }

  function getMinimumCircularRoiRadiusMm(frame) {
    const spacingX = Number(frame?.metrics?.spacingX) || 0;
    const spacingY = Number(frame?.metrics?.spacingY) || 0;
    const spacingFloor = spacingX > 0 || spacingY > 0 ? Math.max(spacingX, spacingY) : 0;
    return Math.max(MIN_CIRCULAR_ROI_DIAMETER_MM / 2, spacingFloor);
  }

  function createEllipseWorldPoints(frame, centerPlanePoint, radiusXmm, radiusYmm, segmentCount) {
    const count = Math.max(8, Number(segmentCount) || CIRCULAR_ROI_SEGMENTS);
    const minRadiusMm = getMinimumCircularRoiRadiusMm(frame);
    const safeRadiusX = Math.max(minRadiusMm, Math.abs(radiusXmm));
    const safeRadiusY = Math.max(minRadiusMm, Math.abs(radiusYmm));
    return Array.from({ length: count }, (_value, index) => {
      const angle = (index / count) * Math.PI * 2;
      const xMm = centerPlanePoint.xMm + Math.cos(angle) * safeRadiusX;
      const yMm = centerPlanePoint.yMm + Math.sin(angle) * safeRadiusY;
      return planePointToWorld(frame, xMm, yMm);
    });
  }

  function getCircularRoiGeometry(annotation) {
    if (!annotation || annotation.type !== "freehandRoi") {
      return null;
    }
    if (annotation.ellipse) {
      const minRadiusMm = getMinimumCircularRoiRadiusMm(annotation.frame);
      return {
        centerXmm: Number(annotation.ellipse.centerXmm) || 0,
        centerYmm: Number(annotation.ellipse.centerYmm) || 0,
        radiusXmm: Math.max(minRadiusMm, Math.abs(Number(annotation.ellipse.radiusXmm) || minRadiusMm)),
        radiusYmm: Math.max(minRadiusMm, Math.abs(Number(annotation.ellipse.radiusYmm) || minRadiusMm)),
      };
    }
    const points = getFreehandPlanePoints(annotation);
    if (!points.length) {
      return null;
    }
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      centerXmm: (minX + maxX) / 2,
      centerYmm: (minY + maxY) / 2,
      radiusXmm: Math.max(getMinimumCircularRoiRadiusMm(annotation.frame), (maxX - minX) / 2),
      radiusYmm: Math.max(getMinimumCircularRoiRadiusMm(annotation.frame), (maxY - minY) / 2),
    };
  }

  function setCircularRoiGeometry(annotation, geometry) {
    if (!annotation || annotation.type !== "freehandRoi" || !geometry) {
      return;
    }
    annotation.ellipse = {
      centerXmm: Number(geometry.centerXmm) || 0,
      centerYmm: Number(geometry.centerYmm) || 0,
      radiusXmm: Math.max(getMinimumCircularRoiRadiusMm(annotation.frame), Math.abs(Number(geometry.radiusXmm) || 0)),
      radiusYmm: Math.max(getMinimumCircularRoiRadiusMm(annotation.frame), Math.abs(Number(geometry.radiusYmm) || 0)),
    };
    annotation.worldPoints = createEllipseWorldPoints(
      annotation.frame,
      {
        xMm: annotation.ellipse.centerXmm,
        yMm: annotation.ellipse.centerYmm,
      },
      annotation.ellipse.radiusXmm,
      annotation.ellipse.radiusYmm,
      CIRCULAR_ROI_SEGMENTS
    );
  }

  function fitCircularRoiToPlanePoints(annotation, planePoints) {
    if (!annotation || annotation.type !== "freehandRoi" || !planePoints?.length) {
      return false;
    }
    const xs = planePoints.map((point) => point.x);
    const ys = planePoints.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    setCircularRoiGeometry(annotation, {
      centerXmm: (minX + maxX) / 2,
      centerYmm: (minY + maxY) / 2,
      radiusXmm: Math.max(getMinimumCircularRoiRadiusMm(annotation.frame), (maxX - minX) / 2),
      radiusYmm: Math.max(getMinimumCircularRoiRadiusMm(annotation.frame), (maxY - minY) / 2),
    });
    annotation.roiSourceTool = "circularRoi";
    return true;
  }

  function getCircularRoiHandlePlanePoint(annotation) {
    const geometry = getCircularRoiGeometry(annotation);
    if (!geometry) {
      return null;
    }
    return {
      x: geometry.centerXmm + geometry.radiusXmm,
      y: geometry.centerYmm,
    };
  }

  function getEditableRoiHandleIndices(annotation) {
    const planePoints = getFreehandPlanePoints(annotation);
    if (planePoints.length <= 1) {
      return [0];
    }
    if (isCircularRoiAnnotation(annotation)) {
      return [0];
    }
    const desiredCount = Math.min(ROI_HANDLE_LIMIT, Math.max(4, Math.round(planePoints.length / 6)));
    const step = planePoints.length / desiredCount;
    const indices = [];
    for (let index = 0; index < desiredCount; index += 1) {
      indices.push(Math.round(index * step) % planePoints.length);
    }
    return Array.from(new Set(indices)).sort((left, right) => left - right);
  }

  function chaikinSmoothClosedPlanePoints(points, iterations) {
    let current = (points || []).map((point) => ({ x: point.x, y: point.y }));
    const count = Math.max(0, Number(iterations) || 0);
    for (let iteration = 0; iteration < count && current.length >= 3; iteration += 1) {
      const next = [];
      for (let index = 0; index < current.length; index += 1) {
        const currentPoint = current[index];
        const nextPoint = current[(index + 1) % current.length];
        next.push({
          x: currentPoint.x * 0.75 + nextPoint.x * 0.25,
          y: currentPoint.y * 0.75 + nextPoint.y * 0.25,
        });
        next.push({
          x: currentPoint.x * 0.25 + nextPoint.x * 0.75,
          y: currentPoint.y * 0.25 + nextPoint.y * 0.75,
        });
      }
      current = next;
    }
    return current;
  }

  function buildSegmentationRoiWorldPoints(frame, worldPoints) {
    const planePoints = worldPoints.map((worldPoint) => {
      const coordinates = worldToPlaneCoordinates(frame, worldPoint);
      return { x: coordinates.xMm, y: coordinates.yMm };
    });
    const simplified = simplifyPlanePoints(planePoints, 0.75);
    const smoothed = chaikinSmoothClosedPlanePoints(simplified, 3);
    const resampled = simplifyPlanePoints(resampleClosedPlanePoints(smoothed, 0.9), 0.55);
    const finalPoints = resampled.length >= 3 ? resampled : simplified;
    return finalPoints.map((point) => planePointToWorld(frame, point.x, point.y));
  }

  function buildFreehandRoiWorldPoints(frame, worldPoints) {
    const planePoints = worldPoints.map((worldPoint) => {
      const coordinates = worldToPlaneCoordinates(frame, worldPoint);
      return { x: coordinates.xMm, y: coordinates.yMm };
    });
    const simplified = simplifyPlanePoints(planePoints, getFreehandSampleDistanceMm(frame));
    const finalPoints = simplified.length >= 3 ? simplified : planePoints;
    return finalPoints.map((point) => planePointToWorld(frame, point.x, point.y));
  }

  function getWrappedContourIndexDistance(indexA, indexB, count) {
    if (!Number.isFinite(indexA) || !Number.isFinite(indexB) || !count) {
      return Number.POSITIVE_INFINITY;
    }
    const rawDistance = Math.abs(indexA - indexB);
    return Math.min(rawDistance, count - rawDistance);
  }

  function reshapeSegmentationRoiFromHandle(annotation, sourceAnnotation, pointIndex, planePoint) {
    if (
      !annotation ||
      annotation.type !== "freehandRoi" ||
      !sourceAnnotation ||
      sourceAnnotation.type !== "freehandRoi" ||
      sourceAnnotation.roiSourceTool !== "segmentationRoi" ||
      !planePoint
    ) {
      return false;
    }

    const sourcePlanePoints = getFreehandPlanePoints(sourceAnnotation);
    if (sourcePlanePoints.length < 6 || pointIndex < 0 || pointIndex >= sourcePlanePoints.length) {
      return false;
    }

    const anchorPoint = sourcePlanePoints[pointIndex];
    const deltaX = planePoint.xMm - anchorPoint.x;
    const deltaY = planePoint.yMm - anchorPoint.y;
    const influenceRadius = Math.max(
      5,
      Math.min(Math.floor(sourcePlanePoints.length / 2), Math.round(sourcePlanePoints.length * 0.42))
    );

    const reshaped = sourcePlanePoints.map((point, index) => {
      const contourDistance = getWrappedContourIndexDistance(index, pointIndex, sourcePlanePoints.length);
      const normalized = clamp(1 - contourDistance / influenceRadius, 0, 1);
      const weight = normalized > 0 ? normalized * normalized * (3 - 2 * normalized) : 0;
      return {
        x: point.x + deltaX * weight,
        y: point.y + deltaY * weight,
      };
    });

    reshaped[pointIndex] = {
      x: planePoint.xMm,
      y: planePoint.yMm,
    };

    const smoothed = simplifyPlanePoints(reshaped, 0.35);
    const finalPoints = smoothed.length >= 3 ? smoothed : reshaped;
    annotation.worldPoints = finalPoints.map((point) => planePointToWorld(annotation.frame, point.x, point.y));
    delete annotation.ellipse;
    annotation.roiSourceTool = sourceAnnotation.roiSourceTool;
    return true;
  }

  function findClosestPlanePointIndex(points, targetPoint) {
    if (!points?.length || !targetPoint) {
      return -1;
    }
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    points.forEach((point, index) => {
      const distance = Math.hypot(point.x - targetPoint.x, point.y - targetPoint.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function collectWrappedPlanePoints(points, startIndex, endIndex) {
    const collected = [];
    if (!points?.length) {
      return collected;
    }
    let index = startIndex;
    collected.push(points[index]);
    while (index !== endIndex) {
      index = (index + 1) % points.length;
      collected.push(points[index]);
    }
    return collected;
  }

  function applyContourCorrection(annotation, draftPlanePoints) {
    if (!annotation || annotation.type !== "freehandRoi" || !draftPlanePoints?.length) {
      return false;
    }
    const wasCircular = isCircularRoiAnnotation(annotation);
    const original = getFreehandPlanePoints(annotation);
    if (original.length < 4) {
      return false;
    }

    const startIndex = findClosestPlanePointIndex(original, draftPlanePoints[0]);
    const endIndex = findClosestPlanePointIndex(original, draftPlanePoints[draftPlanePoints.length - 1]);
    if (startIndex < 0 || endIndex < 0 || startIndex === endIndex) {
      return false;
    }

    const forwardCount = (endIndex - startIndex + original.length) % original.length;
    const backwardCount = (startIndex - endIndex + original.length) % original.length;
    const correctionPoints = forwardCount <= backwardCount ? draftPlanePoints : draftPlanePoints.slice().reverse();
    const retainedArc =
      forwardCount <= backwardCount
        ? collectWrappedPlanePoints(original, endIndex, startIndex)
        : collectWrappedPlanePoints(original, startIndex, endIndex);

    const merged = simplifyPlanePoints(resampleClosedPlanePoints([...correctionPoints, ...retainedArc], 0.65), 0.45);
    if (merged.length < 3) {
      return false;
    }

    if (wasCircular) {
      return fitCircularRoiToPlanePoints(annotation, merged);
    }

    annotation.worldPoints = merged.map((point) => planePointToWorld(annotation.frame, point.x, point.y));
    delete annotation.ellipse;
    annotation.roiSourceTool = "contourCorrect";
    return true;
  }

  function removeAnnotationRecord(reconstruction, annotation) {
    reconstruction.annotations = reconstruction.annotations.filter((item) => item.id !== annotation.id);
    if (state.selectedAnnotationId === annotation.id) {
      state.selectedAnnotationId = null;
    }
    if (state.selectedProfileAnnotationId === annotation.id) {
      state.selectedProfileAnnotationId = null;
    }
  }

  function eraseBrushRoiAtPoint(annotation, planePoint, radiusMm) {
    const mask = annotation.mask;
    if (!mask?.cells?.length) {
      return false;
    }

    const minCellX = clamp(Math.floor((planePoint.xMm - radiusMm - mask.originXmm) / mask.stepMm), 0, mask.width - 1);
    const maxCellX = clamp(Math.ceil((planePoint.xMm + radiusMm - mask.originXmm) / mask.stepMm), 0, mask.width - 1);
    const minCellY = clamp(Math.floor((planePoint.yMm - radiusMm - mask.originYmm) / mask.stepMm), 0, mask.height - 1);
    const maxCellY = clamp(Math.ceil((planePoint.yMm + radiusMm - mask.originYmm) / mask.stepMm), 0, mask.height - 1);

    let changed = false;
    for (let y = minCellY; y <= maxCellY; y += 1) {
      for (let x = minCellX; x <= maxCellX; x += 1) {
        const cellCenter = getBrushMaskCellCenter(mask, x, y);
        if (Math.hypot(cellCenter.xMm - planePoint.xMm, cellCenter.yMm - planePoint.yMm) > radiusMm) {
          continue;
        }
        const index = brushMaskIndex(mask, x, y);
        if (mask.cells[index]) {
          mask.cells[index] = 0;
          changed = true;
        }
      }
    }

    if (changed) {
      trimBrushMask(mask);
    }
    return changed;
  }

  function eraseFreehandRoiAtPoint(annotation, planePoint, radiusMm) {
    const planePoints = getFreehandPlanePoints(annotation);
    if (planePoints.length < 3) {
      return false;
    }

    const sampled = resampleClosedPlanePoints(
      planePoints,
      Math.max(0.5, Math.min(annotation.frame.metrics.spacingX, annotation.frame.metrics.spacingY))
    );
    const kept = simplifyPlanePoints(
      sampled.filter((point) => Math.hypot(point.x - planePoint.xMm, point.y - planePoint.yMm) > radiusMm),
      Math.max(0.8, Math.min(annotation.frame.metrics.spacingX, annotation.frame.metrics.spacingY))
    );

    if (kept.length < 3) {
      delete annotation.ellipse;
      annotation.worldPoints = [];
      return true;
    }

    delete annotation.ellipse;
    annotation.worldPoints = kept.map((point) => planePointToWorld(annotation.frame, point.x, point.y));
    return true;
  }

  function annotationTouchedByEraser(annotation, planePoint, radiusMm) {
    if (annotation.type === "probe" || annotation.type === "text") {
      const point = worldToPlaneCoordinates(annotation.frame, annotation.worldPoints[0]);
      return Math.hypot(point.xMm - planePoint.xMm, point.yMm - planePoint.yMm) <= radiusMm;
    }

    if (annotation.type === "length" || annotation.type === "arrow" || annotation.type === "lineProfile") {
      const start = worldToPlaneCoordinates(annotation.frame, annotation.worldPoints[0]);
      const end = worldToPlaneCoordinates(annotation.frame, annotation.worldPoints[1]);
      const distancePx = pointToSegmentDistancePx(
        { x: planePoint.xMm, y: planePoint.yMm },
        { x: start.xMm, y: start.yMm },
        { x: end.xMm, y: end.yMm }
      );
      return distancePx <= radiusMm;
    }

    if (annotation.type === "squareProfile") {
      const box = getSquareProfilePlaneBox(annotation);
      const polygon = getSquareProfileCorners(box).map((corner) => ({ x: corner.xMm, y: corner.yMm }));
      if (pointInPolygon({ x: planePoint.xMm, y: planePoint.yMm }, polygon)) {
        return true;
      }
      let minDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < polygon.length; index += 1) {
        const current = polygon[index];
        const next = polygon[(index + 1) % polygon.length];
        minDistance = Math.min(
          minDistance,
          pointToSegmentDistancePx(
            { x: planePoint.xMm, y: planePoint.yMm },
            { x: current.x, y: current.y },
            { x: next.x, y: next.y }
          )
        );
      }
      return minDistance <= radiusMm;
    }

    if (annotation.type === "freehandRoi") {
      const polygon = getFreehandPlanePoints(annotation);
      if (pointInPolygon({ x: planePoint.xMm, y: planePoint.yMm }, polygon)) {
        return true;
      }
      return polygon.some((point) => Math.hypot(point.x - planePoint.xMm, point.y - planePoint.yMm) <= radiusMm);
    }

    if (annotation.type === "brushRoi") {
      return pointInBrushMask(annotation, planePoint.xMm, planePoint.yMm);
    }

    return false;
  }

  function eraseAtPoint(viewportId, reconstruction, frame, planePoint, radiusMm) {
    const visible = getVisibleAnnotationsForFrame(reconstruction, frame).slice().sort((left, right) => right.id - left.id);
    let changed = false;

    visible.forEach((annotation) => {
      if (annotation.type === "brushRoi") {
        if (eraseBrushRoiAtPoint(annotation, planePoint, radiusMm)) {
          changed = true;
          if (!countBrushMaskCells(annotation.mask)) {
            removeAnnotationRecord(reconstruction, annotation);
          }
        }
        return;
      }

      if (annotation.type === "freehandRoi") {
        if (eraseFreehandRoiAtPoint(annotation, planePoint, radiusMm)) {
          changed = true;
          if (annotation.worldPoints.length < 3) {
            removeAnnotationRecord(reconstruction, annotation);
          }
        }
        return;
      }

      if (annotationTouchedByEraser(annotation, planePoint, radiusMm)) {
        removeAnnotationRecord(reconstruction, annotation);
        changed = true;
      }
    });

    if (changed) {
      updateMeasurementCount();
      updateProfilePanel();
      requestRenderAll();
    }
    return changed;
  }

  function eraseStroke(viewportId, reconstruction, frame, startPoint, endPoint, radiusMm) {
    const stepMm = Math.max(0.8, radiusMm * 0.45);
    const distanceMm = startPoint ? Math.hypot(endPoint.xMm - startPoint.xMm, endPoint.yMm - startPoint.yMm) : 0;
    const steps = Math.max(1, Math.ceil(distanceMm / stepMm));
    let changed = false;

    for (let index = 0; index <= steps; index += 1) {
      const t = steps ? index / steps : 1;
      const point = {
        xMm: startPoint ? startPoint.xMm + (endPoint.xMm - startPoint.xMm) * t : endPoint.xMm,
        yMm: startPoint ? startPoint.yMm + (endPoint.yMm - startPoint.yMm) * t : endPoint.yMm,
      };
      changed = eraseAtPoint(viewportId, reconstruction, frame, point, radiusMm) || changed;
    }

    return changed;
  }

  function updateEraserPreview(viewportId, clientX, clientY) {
    const reconstruction = getActiveReconstruction();
    const viewportState = state.viewports[viewportId];
    const frame = viewportState?.lastFrame || getViewportFrame(viewportId, reconstruction);
    const point = canvasToPlanePoint(viewportId, clientX, clientY);
    if (!reconstruction || !frame || !point) {
      state.eraser.preview = null;
      return;
    }
    state.eraser.preview = {
      viewportId,
      plane: frame.plane,
      frame: cloneFrame(frame),
      point: { xMm: point.xMm, yMm: point.yMm },
    };
  }

  function getSquareProfileCorners(box) {
    return [
      { xMm: box.minX, yMm: box.minY },
      { xMm: box.maxX, yMm: box.minY },
      { xMm: box.maxX, yMm: box.maxY },
      { xMm: box.minX, yMm: box.maxY },
    ];
  }

  function getAnnotationHit(viewportId, clientX, clientY) {
    const reconstruction = getActiveReconstruction();
    const viewportState = state.viewports[viewportId];
    const geometry = viewportState?.lastGeometry;
    const frame = viewportState?.lastFrame;
    const planePoint = canvasToPlanePoint(viewportId, clientX, clientY);
    if (!reconstruction || !geometry || !frame || !planePoint) {
      return null;
    }

    const handleRadiusPx = 10;
    const bodyRadiusPx = 12;
    const annotations = getVisibleAnnotationsForFrame(reconstruction, frame).slice().sort((left, right) => right.id - left.id);

    let best = null;
    const considerHit = (hit) => {
      if (!hit) {
        return;
      }
      if (!best || hit.priority < best.priority || (hit.priority === best.priority && hit.distancePx < best.distancePx)) {
        best = hit;
      }
    };

    annotations.forEach((annotation) => {
      if (annotation.type === "probe" || annotation.type === "text") {
        const point = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
        const pointDistancePx = Math.hypot(planePoint.canvasX - point.x, planePoint.canvasY - point.y);
        considerHit(
          pointDistancePx <= handleRadiusPx
            ? { annotation, mode: "move", priority: 0, distancePx: pointDistancePx }
            : null
        );
        if (annotation.type === "text") {
          const bounds = getLabelChipBounds(viewportState.ctx, annotation.text, point.x, point.y);
          const insideLabel =
            planePoint.canvasX >= bounds.x &&
            planePoint.canvasX <= bounds.x + bounds.width &&
            planePoint.canvasY >= bounds.y &&
            planePoint.canvasY <= bounds.y + bounds.height;
          considerHit(
            insideLabel
              ? { annotation, mode: "move", priority: 1, distancePx: 0 }
              : null
          );
        }
        return;
      }

      if (annotation.type === "length" || annotation.type === "arrow" || annotation.type === "lineProfile") {
        const start = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
        const end = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[1]);
        const startDistancePx = Math.hypot(planePoint.canvasX - start.x, planePoint.canvasY - start.y);
        const endDistancePx = Math.hypot(planePoint.canvasX - end.x, planePoint.canvasY - end.y);
        considerHit(
          startDistancePx <= handleRadiusPx
            ? { annotation, mode: "point", pointIndex: 0, priority: 0, distancePx: startDistancePx }
            : null
        );
        considerHit(
          endDistancePx <= handleRadiusPx
            ? { annotation, mode: "point", pointIndex: 1, priority: 0, distancePx: endDistancePx }
            : null
        );
        const lineDistancePx = pointToSegmentDistancePx(
          { x: planePoint.canvasX, y: planePoint.canvasY },
          start,
          end
        );
        considerHit(
          lineDistancePx <= bodyRadiusPx
            ? { annotation, mode: "move", priority: 1, distancePx: lineDistancePx }
            : null
        );
        return;
      }

      if (annotation.type === "squareProfile") {
        const box = getSquareProfilePlaneBox(annotation);
        getSquareProfileCorners(box).forEach((corner, cornerIndex) => {
          const cornerPoint = planeMmToCanvasPoint(geometry, corner.xMm, corner.yMm);
          const cornerDistancePx = Math.hypot(planePoint.canvasX - cornerPoint.x, planePoint.canvasY - cornerPoint.y);
          considerHit(
            cornerDistancePx <= handleRadiusPx
              ? { annotation, mode: "squareCorner", cornerIndex, priority: 0, distancePx: cornerDistancePx }
              : null
          );
        });
        const insideBox =
          planePoint.xMm >= box.minX &&
          planePoint.xMm <= box.maxX &&
          planePoint.yMm >= box.minY &&
          planePoint.yMm <= box.maxY;
        considerHit(
          insideBox
            ? { annotation, mode: "move", priority: 2, distancePx: 0 }
            : null
        );
        return;
      }

      if (annotation.type === "brushRoi") {
        const bounds = getBrushMaskBounds(annotation);
        if (!bounds) {
          return;
        }
        const insideMask = pointInBrushMask(annotation, planePoint.xMm, planePoint.yMm);
        let borderDistancePx = Number.POSITIVE_INFINITY;
        const minX = planeMmToCanvasPoint(geometry, bounds.minX, bounds.minY).x;
        const maxX = planeMmToCanvasPoint(geometry, bounds.maxX, bounds.maxY).x;
        const minY = planeMmToCanvasPoint(geometry, bounds.minX, bounds.maxY).y;
        const maxY = planeMmToCanvasPoint(geometry, bounds.maxX, bounds.minY).y;
        const boxPoints = [
          { x: minX, y: maxY },
          { x: maxX, y: maxY },
          { x: maxX, y: minY },
          { x: minX, y: minY },
        ];
        for (let index = 0; index < boxPoints.length; index += 1) {
          const current = boxPoints[index];
          const next = boxPoints[(index + 1) % boxPoints.length];
          borderDistancePx = Math.min(
            borderDistancePx,
            pointToSegmentDistancePx({ x: planePoint.canvasX, y: planePoint.canvasY }, current, next)
          );
        }
        considerHit(
          insideMask || borderDistancePx <= bodyRadiusPx
            ? { annotation, mode: "move", priority: insideMask ? 2 : 1, distancePx: insideMask ? 0 : borderDistancePx }
            : null
        );
        return;
      }

      if (annotation.type === "freehandRoi") {
        const planePoints = getFreehandPlanePoints(annotation);
        const handleIndices = isCircularRoiAnnotation(annotation)
          ? []
          : getEditableRoiHandleIndices(annotation);
        handleIndices.forEach((pointIndex) => {
          const point = planePoints[pointIndex];
          const canvasPoint = planeMmToCanvasPoint(geometry, point.x, point.y);
          const distancePx = Math.hypot(planePoint.canvasX - canvasPoint.x, planePoint.canvasY - canvasPoint.y);
          considerHit(
            distancePx <= handleRadiusPx
              ? { annotation, mode: "roiVertex", pointIndex, priority: 0, distancePx }
              : null
          );
        });
        if (isCircularRoiAnnotation(annotation)) {
          const handlePoint = getCircularRoiHandlePlanePoint(annotation);
          if (handlePoint) {
            const canvasPoint = planeMmToCanvasPoint(geometry, handlePoint.x, handlePoint.y);
            const distancePx = Math.hypot(planePoint.canvasX - canvasPoint.x, planePoint.canvasY - canvasPoint.y);
            considerHit(
              distancePx <= handleRadiusPx
                ? { annotation, mode: "circleRadius", priority: 0, distancePx }
                : null
            );
          }
        }
        let borderDistancePx = Number.POSITIVE_INFINITY;
        for (let index = 0; index < planePoints.length; index += 1) {
          const current = planeMmToCanvasPoint(geometry, planePoints[index].x, planePoints[index].y);
          const nextPoint = planePoints[(index + 1) % planePoints.length];
          const next = planeMmToCanvasPoint(geometry, nextPoint.x, nextPoint.y);
          borderDistancePx = Math.min(
            borderDistancePx,
            pointToSegmentDistancePx({ x: planePoint.canvasX, y: planePoint.canvasY }, current, next)
          );
        }
        const insidePolygon = pointInPolygon({ x: planePoint.xMm, y: planePoint.yMm }, planePoints);
        considerHit(
          insidePolygon || borderDistancePx <= bodyRadiusPx
            ? { annotation, mode: "move", priority: insidePolygon ? 2 : 1, distancePx: insidePolygon ? 0 : borderDistancePx }
            : null
        );
      }
    });

    return best;
  }

  function getAdjustableRoiNearPlanePoint(viewportId, planePoint) {
    const reconstruction = getActiveReconstruction();
    const viewportState = state.viewports[viewportId];
    const geometry = viewportState?.lastGeometry;
    const frame = viewportState?.lastFrame;
    if (!reconstruction || !geometry || !frame || !planePoint) {
      return null;
    }

    const maxBorderDistancePx = 18;
    const annotations = getVisibleAnnotationsForFrame(reconstruction, frame)
      .filter((annotation) => annotation.type === "freehandRoi")
      .slice()
      .sort((left, right) => right.id - left.id);

    let best = null;
    annotations.forEach((annotation) => {
      const planePoints = getFreehandPlanePoints(annotation);
      if (planePoints.length < 3) {
        return;
      }
      let borderDistancePx = Number.POSITIVE_INFINITY;
      for (let index = 0; index < planePoints.length; index += 1) {
        const current = planeMmToCanvasPoint(geometry, planePoints[index].x, planePoints[index].y);
        const nextPoint = planePoints[(index + 1) % planePoints.length];
        const next = planeMmToCanvasPoint(geometry, nextPoint.x, nextPoint.y);
        borderDistancePx = Math.min(
          borderDistancePx,
          pointToSegmentDistancePx({ x: planePoint.canvasX, y: planePoint.canvasY }, current, next)
        );
      }
      const insidePolygon = pointInPolygon({ x: planePoint.xMm, y: planePoint.yMm }, planePoints);
      if (!insidePolygon && borderDistancePx > maxBorderDistancePx) {
        return;
      }
      const candidate = {
        annotation,
        priority: insidePolygon ? 0 : 1,
        distancePx: insidePolygon ? 0 : borderDistancePx,
      };
      if (
        !best ||
        candidate.priority < best.priority ||
        (candidate.priority === best.priority && candidate.distancePx < best.distancePx)
      ) {
        best = candidate;
      }
    });

    return best?.annotation || null;
  }

  function drawSelectedAnnotationOverlay(ctx, annotation, reconstruction, frame, geometry) {
    if (!annotation || !isAnnotationVisible(annotation, frame)) {
      return;
    }

    const handleRadiusPx = 5.5;
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 4]);

    if (annotation.type === "probe" || annotation.type === "text") {
      const point = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
      if (annotation.type === "text") {
        const bounds = getLabelChipBounds(ctx, annotation.text, point.x, point.y);
        ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      }
      drawSelectionHandle(ctx, point, handleRadiusPx);
      ctx.restore();
      return;
    }

    if (annotation.type === "length" || annotation.type === "arrow" || annotation.type === "lineProfile") {
      const start = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
      const end = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[1]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      drawSelectionHandle(ctx, start, handleRadiusPx);
      drawSelectionHandle(ctx, end, handleRadiusPx);
      ctx.restore();
      return;
    }

    if (annotation.type === "squareProfile") {
      const box = getSquareProfilePlaneBox(annotation);
      const corners = getSquareProfileCorners(box).map((corner) => planeMmToCanvasPoint(geometry, corner.xMm, corner.yMm));
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      corners.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.stroke();
      corners.forEach((point) => drawSelectionHandle(ctx, point, handleRadiusPx));
      ctx.restore();
      return;
    }

    if (annotation.type === "brushRoi") {
      const bounds = getBrushMaskBounds(annotation);
      if (bounds) {
        const topLeft = planeMmToCanvasPoint(geometry, bounds.minX, bounds.maxY);
        const bottomRight = planeMmToCanvasPoint(geometry, bounds.maxX, bounds.minY);
        ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
        const centroid = getBrushMaskCentroid(annotation);
        drawSelectionHandle(ctx, planeMmToCanvasPoint(geometry, centroid.xMm, centroid.yMm), handleRadiusPx);
      }
      ctx.restore();
      return;
    }

    if (annotation.type === "freehandRoi") {
      const points = annotation.worldPoints.map((worldPoint) => projectWorldPointToCanvas(frame, geometry, worldPoint));
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.stroke();
      if (isCircularRoiAnnotation(annotation)) {
        const geometryValues = getCircularRoiGeometry(annotation);
        const handlePoint = getCircularRoiHandlePlanePoint(annotation);
        if (geometryValues && handlePoint) {
          const center = planeMmToCanvasPoint(geometry, geometryValues.centerXmm, geometryValues.centerYmm);
          const handle = planeMmToCanvasPoint(geometry, handlePoint.x, handlePoint.y);
          ctx.beginPath();
          ctx.moveTo(center.x, center.y);
          ctx.lineTo(handle.x, handle.y);
          ctx.stroke();
          drawSelectionHandle(ctx, handle, handleRadiusPx);
        }
      } else {
        getEditableRoiHandleIndices(annotation)
          .map((index) => points[index])
          .filter(Boolean)
          .forEach((point) => drawSelectionHandle(ctx, point, handleRadiusPx));
      }
      ctx.restore();
    }
  }

  function sampleLineProfile(annotation, reconstruction) {
    const start = annotation.worldPoints[0];
    const end = annotation.worldPoints[1];
    const vector = subtractVectors(end, start);
    const lengthMm = vectorLength(vector);
    if (!Number.isFinite(lengthMm) || lengthMm <= 0) {
      return null;
    }

    const stepMm = Math.max(0.2, Math.min(annotation.frame.metrics.spacingX, annotation.frame.metrics.spacingY) / 2);
    const sampleCount = Math.max(24, Math.ceil(lengthMm / stepMm) + 1);
    const distancesMm = [];
    const valuesHu = [];

    for (let index = 0; index < sampleCount; index += 1) {
      const t = index / (sampleCount - 1);
      const world = addVectors(start, scaleVector(vector, t));
      distancesMm.push(lengthMm * t);
      valuesHu.push(sampleVolumeAtWorld(reconstruction.volume, world));
    }

    return {
      mode: "line",
      lengthMm,
      sampleCount,
      distancesMm,
      valuesHu,
    };
  }

  function getSquareProfilePlaneBox(annotation) {
    const first = worldToPlaneCoordinates(annotation.frame, annotation.worldPoints[0]);
    const second = worldToPlaneCoordinates(annotation.frame, annotation.worldPoints[1]);
    return {
      minX: Math.min(first.xMm, second.xMm),
      maxX: Math.max(first.xMm, second.xMm),
      minY: Math.min(first.yMm, second.yMm),
      maxY: Math.max(first.yMm, second.yMm),
      widthMm: Math.abs(second.xMm - first.xMm),
      heightMm: Math.abs(second.yMm - first.yMm),
    };
  }

  function sampleSquareProfile(annotation, reconstruction) {
    const box = getSquareProfilePlaneBox(annotation);
    const widthMm = Math.max(box.widthMm, 0.1);
    const heightMm = Math.max(box.heightMm, 0.1);
    const sampleStepMm = Math.max(0.25, Math.min(annotation.frame.metrics.spacingX, annotation.frame.metrics.spacingY) / 2);
    const horizontal = widthMm >= heightMm;
    const primaryLengthMm = horizontal ? widthMm : heightMm;
    const secondaryLengthMm = horizontal ? heightMm : widthMm;
    const primaryCount = Math.max(24, Math.ceil(primaryLengthMm / sampleStepMm) + 1);
    const secondaryCount = Math.max(3, Math.ceil(secondaryLengthMm / sampleStepMm) + 1);
    const distancesMm = [];
    const valuesHu = [];

    for (let primaryIndex = 0; primaryIndex < primaryCount; primaryIndex += 1) {
      const primaryMm = (primaryIndex / (primaryCount - 1)) * primaryLengthMm;
      const samples = [];

      for (let secondaryIndex = 0; secondaryIndex < secondaryCount; secondaryIndex += 1) {
        const secondaryMm =
          secondaryCount === 1 ? 0 : (secondaryIndex / (secondaryCount - 1)) * secondaryLengthMm;
        const xMm = horizontal ? box.minX + primaryMm : box.minX + secondaryMm;
        const yMm = horizontal ? box.minY + secondaryMm : box.minY + primaryMm;
        const world = addVectors(
          addVectors(annotation.frame.centerWorld, scaleVector(annotation.frame.uWorld, xMm)),
          scaleVector(annotation.frame.vWorld, yMm)
        );
        const value = sampleVolumeAtWorld(reconstruction.volume, world);
        if (Number.isFinite(value)) {
          samples.push(value);
        }
      }

      distancesMm.push(primaryMm);
      valuesHu.push(samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : Number.NaN);
    }

    return {
      mode: "square",
      axis: horizontal ? "horizontal" : "vertical",
      lengthMm: primaryLengthMm,
      widthMm: secondaryLengthMm,
      sampleCount: primaryCount,
      distancesMm,
      valuesHu,
      box,
    };
  }

  function buildProfileAnalysis(annotation, reconstruction) {
    const base =
      annotation.type === "lineProfile"
        ? sampleLineProfile(annotation, reconstruction)
        : annotation.type === "squareProfile"
          ? sampleSquareProfile(annotation, reconstruction)
          : null;
    return analyzeProfileSamples(base, annotation.profileGuideAdjustments || null);
  }

  function prepareProfileChartCanvas(canvas, widthOverride, heightOverride) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const width = widthOverride || canvas.clientWidth || 320;
    const height = heightOverride || canvas.clientHeight || 180;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx, width, height };
  }

  function drawEmptyProfileChartOnCanvas(canvas, message, options) {
    const { ctx, width, height } = prepareProfileChartCanvas(canvas, options?.width, options?.height);
    ctx.fillStyle = "#081016";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(145, 181, 201, 0.18)";
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    ctx.fillStyle = "#aac0cf";
    ctx.font = "13px Aptos, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message, width / 2, height / 2);
    return null;
  }

  function drawProfileChartOnCanvas(canvas, profile, options) {
    if (!profile) {
      return drawEmptyProfileChartOnCanvas(canvas, "Draw a profile to see the curve.", options);
    }

    const { ctx, width, height } = prepareProfileChartCanvas(canvas, options?.width, options?.height);
    ctx.fillStyle = "#081016";
    ctx.fillRect(0, 0, width, height);

    const plot = {
      x: 34,
      y: 14,
      width: width - 48,
      height: height - 34,
    };

    const finiteValues = [...profile.valuesHu, ...profile.smoothHu].filter(Number.isFinite);
    if (!finiteValues.length) {
      return drawEmptyProfileChartOnCanvas(canvas, "No valid HU samples in this profile.", options);
    }

    let minHu = Math.min(...finiteValues);
    let maxHu = Math.max(...finiteValues);
    if (minHu === maxHu) {
      minHu -= 1;
      maxHu += 1;
    }

    const maxDistance = profile.distancesMm[profile.distancesMm.length - 1] || 1;
    const xAt = (distanceMm) => plot.x + (distanceMm / maxDistance) * plot.width;
    const yAt = (hu) => plot.y + plot.height - ((hu - minHu) / (maxHu - minHu)) * plot.height;

    ctx.strokeStyle = "rgba(145, 181, 201, 0.16)";
    ctx.lineWidth = 1;
    for (let row = 0; row <= 4; row += 1) {
      const y = plot.y + (plot.height / 4) * row;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(145, 181, 201, 0.28)";
    ctx.strokeRect(plot.x, plot.y, plot.width, plot.height);

    ctx.beginPath();
    let rawStarted = false;
    profile.valuesHu.forEach((value, index) => {
      if (!Number.isFinite(value)) {
        return;
      }
      const x = xAt(profile.distancesMm[index]);
      const y = yAt(value);
      if (!rawStarted) {
        ctx.moveTo(x, y);
        rawStarted = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = "rgba(87, 200, 255, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    let started = false;
    profile.smoothHu.forEach((value, index) => {
      if (!Number.isFinite(value)) {
        return;
      }
      const x = xAt(profile.distancesMm[index]);
      const y = yAt(value);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = "#ffcf66";
    ctx.lineWidth = 2.2;
    ctx.stroke();

    const guideHandles = [];

    if (profile.stent) {
      const horizontalGuides = [
        { hu: profile.stent.lumenBaseHu, color: "rgba(145, 181, 201, 0.75)", dashed: true },
        { hu: profile.stent.meanHalfMaximumHu, color: "rgba(255, 207, 102, 0.85)", dashed: true },
        { hu: profile.stent.meanPeakHu, color: "rgba(145, 181, 201, 0.75)", dashed: true },
      ].filter((entry) => Number.isFinite(entry.hu));

      horizontalGuides.forEach((guide) => {
        ctx.save();
        ctx.setLineDash(guide.dashed ? [6, 4] : []);
        ctx.strokeStyle = guide.color;
        ctx.lineWidth = 1.1;
        const y = yAt(guide.hu);
        ctx.beginPath();
        ctx.moveTo(plot.x, y);
        ctx.lineTo(plot.x + plot.width, y);
        ctx.stroke();
        ctx.restore();
      });

      const drawBar = (startMm, endMm, hu, color, lineWidth) => {
        if (!Number.isFinite(startMm) || !Number.isFinite(endMm) || !Number.isFinite(hu)) {
          return;
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(xAt(startMm), yAt(hu));
        ctx.lineTo(xAt(endMm), yAt(hu));
        ctx.stroke();
      };

      drawBar(
        profile.stent.leftPeak?.leftHalfDistanceMm,
        profile.stent.leftPeak?.rightHalfDistanceMm,
        profile.stent.leftPeak?.halfMaximumHu,
        "#7af4a8",
        4
      );
      drawBar(
        profile.stent.rightPeak?.leftHalfDistanceMm,
        profile.stent.rightPeak?.rightHalfDistanceMm,
        profile.stent.rightPeak?.halfMaximumHu,
        "#7af4a8",
        4
      );
      drawBar(
        profile.stent.leftPeak?.innerHalfDistanceMm,
        profile.stent.rightPeak?.innerHalfDistanceMm,
        averageFinite([profile.stent.leftPeak?.halfMaximumHu, profile.stent.rightPeak?.halfMaximumHu]),
        "#ff9a46",
        5
      );

      const lowerEdge = profile.stent.lowerSteepEdge;
      if (lowerEdge) {
        ctx.strokeStyle = "#f6f7f9";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(xAt(lowerEdge.threshold10DistanceMm), yAt(lowerEdge.threshold10Hu));
        ctx.lineTo(xAt(lowerEdge.threshold90DistanceMm), yAt(lowerEdge.threshold90Hu));
        ctx.stroke();
      }

      if (options?.showManualGuides !== false) {
        Object.entries(profile.stent.guideIndices || {}).forEach(([key, index]) => {
          const style = PROFILE_GUIDE_STYLES[key];
          const distanceMm = profile.distancesMm[index];
          if (!style || !Number.isFinite(distanceMm)) {
            return;
          }
          const x = xAt(distanceMm);
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = style.color;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x, plot.y);
          ctx.lineTo(x, plot.y + plot.height);
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.fillStyle = style.color;
          ctx.beginPath();
          ctx.arc(x, plot.y + 8, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#d2e0e9";
          ctx.font = "11px Aptos, Segoe UI, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(style.label, x, plot.y + plot.height + 14);
          ctx.restore();

          guideHandles.push({
            key,
            index,
            distanceMm,
            x,
            y: plot.y + 8,
            radiusPx: 8,
          });
        });
      }
    }

    ctx.fillStyle = "#d2e0e9";
    ctx.font = "12px Aptos, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${Math.round(maxHu)} HU`, 4, plot.y + 10);
    ctx.fillText(`${Math.round(minHu)} HU`, 4, plot.y + plot.height);
    ctx.textAlign = "right";
    ctx.fillText(`${maxDistance.toFixed(1)} mm`, plot.x + plot.width, height - 6);
    ctx.textAlign = "left";
    ctx.fillText("0", plot.x, height - 6);

    return {
      canvas,
      profile,
      plot,
      width,
      height,
      minHu,
      maxHu,
      maxDistance,
      guideHandles,
    };
  }

  function drawEmptyProfileChart(message) {
    state.profileChartState = drawEmptyProfileChartOnCanvas(els.profileChart, message);
    return state.profileChartState;
  }

  function drawProfileChart(profile) {
    state.profileChartState = drawProfileChartOnCanvas(els.profileChart, profile, { showManualGuides: true });
    return state.profileChartState;
  }

  function getProfileChartGuideHit(clientX, clientY) {
    const chartState = state.profileChartState;
    const rect = els.profileChart.getBoundingClientRect();
    if (!chartState || !rect.width || !rect.height) {
      return null;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best = null;
    chartState.guideHandles.forEach((handle) => {
      const distance = Math.hypot(x - handle.x, y - handle.y);
      if (distance <= handle.radiusPx + 4 && (!best || distance < best.distancePx)) {
        best = {
          key: handle.key,
          distancePx: distance,
        };
      }
    });
    return best;
  }

  function findNearestProfileDistanceIndex(distancesMm, targetDistanceMm) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    distancesMm.forEach((distanceMm, index) => {
      const delta = Math.abs(distanceMm - targetDistanceMm);
      if (delta < bestDistance) {
        bestDistance = delta;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function setProfileGuideAdjustment(annotation, guideKey, targetIndex, sampleCount, currentGuides) {
    const current = sanitizeStentGuideIndices(sampleCount, annotation.profileGuideAdjustments || currentGuides, currentGuides);
    if (!current) {
      return;
    }
    const next = { ...current };
    next[guideKey] = targetIndex;
    annotation.profileGuideAdjustments = sanitizeStentGuideIndices(sampleCount, next, current);
  }

  function resetSelectedProfileAuto() {
    const annotation = getActiveProfileAnnotation();
    if (!annotation || !PROFILE_TYPES.has(annotation.type)) {
      throw new Error("Select a profile annotation first.");
    }
    delete annotation.profileGuideAdjustments;
    updateProfilePanel();
    requestRenderAll();
    setStatus("Profile analysis reset to automatic cutoffs.");
  }

  function formatMetricValue(value, suffix, digits) {
    if (!Number.isFinite(value)) {
      return "-";
    }
    const precision = digits ?? 1;
    return `${value.toFixed(precision)}${suffix ? ` ${suffix}` : ""}`;
  }

  function updateProfilePanel() {
    const reconstruction = getActiveReconstruction();
    const annotation = ensureSelectedProfileAnnotation();
    if (!reconstruction || !annotation) {
      state.profileChartState = null;
      els.profileStatus.textContent = "No profile selected";
      els.profileMetrics.innerHTML = `
        <div class="meta-row">
          <dt>Selection</dt>
          <dd>Draw a line or square profile to see the curve and edge metrics here.</dd>
        </div>
      `;
      drawEmptyProfileChart("Draw a profile to see the curve.");
      return;
    }

    const analysis = buildProfileAnalysis(annotation, reconstruction);
    if (!analysis) {
      state.profileChartState = null;
      els.profileStatus.textContent = "Profile unavailable";
      els.profileMetrics.innerHTML = `
        <div class="meta-row">
          <dt>Status</dt>
          <dd>This profile could not be sampled from the current reconstruction.</dd>
        </div>
      `;
      drawEmptyProfileChart("This profile could not be sampled.");
      return;
    }

    const stent = analysis.stent || null;
    const adjustmentMode = stent?.adjustmentMode === "manual" ? "manual" : "auto";
    els.profileStatus.textContent = `${formatMeasurementType(annotation.type)} • ${analysis.sampleCount} samples${stent ? ` • ${adjustmentMode}` : " • no stent model found"}`;
    const leftEdge = stent?.leftOuterEdge || null;
    const rightEdge = stent?.rightOuterEdge || null;
    const lowerEdge = stent?.lowerSteepEdge || null;
    const meanKurtosis = averageFinite([leftEdge?.kurtosis, rightEdge?.kurtosis]);
    els.profileMetrics.innerHTML = `
      <div class="meta-row">
        <dt>Length</dt>
        <dd>${formatMetricValue(analysis.lengthMm, "mm", 2)}</dd>
      </div>
      <div class="meta-row">
        <dt>Width</dt>
        <dd>${analysis.mode === "square" ? formatMetricValue(analysis.widthMm, "mm", 2) : "-"}</dd>
      </div>
      <div class="meta-row">
        <dt>Axis / Samples</dt>
        <dd>${analysis.mode === "square" ? analysis.axis : "line"} / ${analysis.sampleCount}</dd>
      </div>
      <div class="meta-row">
        <dt>Cutoff Mode</dt>
        <dd>${stent ? adjustmentMode : "-"}</dd>
      </div>
      <div class="meta-row">
        <dt>Peaks / Lumen</dt>
        <dd>P1 ${formatMetricValue(stent?.leftPeak?.peakHu, "HU", 0)} | P2 ${formatMetricValue(stent?.rightPeak?.peakHu, "HU", 0)} | Lumen ${formatMetricValue(stent?.lumenBaseHu, "HU", 0)}</dd>
      </div>
      <div class="meta-row">
        <dt>FWHM Stent</dt>
        <dd>Left ${formatMetricValue(stent?.leftPeak?.fwhmMm, "mm", 2)} | Right ${formatMetricValue(stent?.rightPeak?.fwhmMm, "mm", 2)} | Mean ${formatMetricValue(stent?.stentFwhmMeanMm, "mm", 2)}</dd>
      </div>
      <div class="meta-row">
        <dt>FWHM Lumen</dt>
        <dd>${formatMetricValue(stent?.lumenFwhmMm, "mm", 2)}</dd>
      </div>
      <div class="meta-row">
        <dt>Edge Sharpness</dt>
        <dd>Left 10-90 ${formatMetricValue(leftEdge?.riseDistanceMm, "mm", 2)} / ${formatMetricValue(leftEdge?.slopeHuPerMm, "HU/mm", 1)}</dd>
      </div>
      <div class="meta-row">
        <dt>Edge Sharpness 2</dt>
        <dd>Right 10-90 ${formatMetricValue(rightEdge?.riseDistanceMm, "mm", 2)} / ${formatMetricValue(rightEdge?.slopeHuPerMm, "HU/mm", 1)}</dd>
      </div>
      <div class="meta-row">
        <dt>Lower Steep</dt>
        <dd>${lowerEdge?.label || "-"} | 10-90 ${formatMetricValue(lowerEdge?.riseDistanceMm, "mm", 2)} | Slope ${formatMetricValue(lowerEdge?.slopeHuPerMm, "HU/mm", 1)}</dd>
      </div>
      <div class="meta-row">
        <dt>Kurtosis</dt>
        <dd>Left ${formatMetricValue(leftEdge?.kurtosis, "", 2)} | Right ${formatMetricValue(rightEdge?.kurtosis, "", 2)} | Mean ${formatMetricValue(meanKurtosis, "", 2)}</dd>
      </div>
    `;
    drawProfileChart(analysis);
  }

  function getMeasurementSummary(annotation, reconstruction) {
    if (annotation.type === "length") {
      const lengthMm = vectorLength(subtractVectors(annotation.worldPoints[0], annotation.worldPoints[1]));
      return { lengthMm };
    }
    if (annotation.type === "probe") {
      return { hu: sampleVolumeAtWorld(reconstruction.volume, annotation.worldPoints[0]) };
    }
    if (annotation.type === "freehandRoi") {
      return getFreehandStats(annotation, reconstruction) || {};
    }
    if (annotation.type === "brushRoi") {
      return getBrushStats(annotation, reconstruction) || {};
    }
    if (PROFILE_TYPES.has(annotation.type)) {
      const analysis = buildProfileAnalysis(annotation, reconstruction);
      const edge1 = analysis?.edges?.[0] || null;
      const edge2 = analysis?.edges?.[1] || null;
      const lowerEdge = analysis?.lowerSlopeEdge || null;
      const stent = analysis?.stent || null;
      const lowerEdgePeakFwhm =
        lowerEdge?.label === "Left outer edge"
          ? stent?.leftPeak?.fwhmMm
          : lowerEdge?.label === "Right outer edge"
            ? stent?.rightPeak?.fwhmMm
            : null;
      return {
        profileLengthMm: analysis?.lengthMm,
        profileWidthMm: analysis?.widthMm,
        profileAxis: analysis?.axis,
        sampleCount: analysis?.sampleCount,
        profileAdjustmentMode: stent?.adjustmentMode || "",
        peak1Hu: stent?.leftPeak?.peakHu,
        peak2Hu: stent?.rightPeak?.peakHu,
        lumenBaselineHu: stent?.lumenBaseHu,
        leftOuterAnchorMm: stent?.guideDistancesMm?.leftOutsideMm,
        leftPeakAnchorMm: stent?.guideDistancesMm?.leftPeakMm,
        lumenAnchorMm: stent?.guideDistancesMm?.lumenMm,
        rightPeakAnchorMm: stent?.guideDistancesMm?.rightPeakMm,
        rightOuterAnchorMm: stent?.guideDistancesMm?.rightOutsideMm,
        stentFwhmLeftMm: stent?.leftPeak?.fwhmMm,
        stentFwhmRightMm: stent?.rightPeak?.fwhmMm,
        stentFwhmMeanMm: stent?.stentFwhmMeanMm,
        lumenFwhmMm: stent?.lumenFwhmMm,
        edgeLeftRise10To90Mm: stent?.leftOuterEdge?.riseDistanceMm,
        edgeLeftSlopeHuPerMm: stent?.leftOuterEdge?.slopeHuPerMm,
        edgeLeftKurtosis: stent?.leftOuterEdge?.kurtosis,
        edgeRightRise10To90Mm: stent?.rightOuterEdge?.riseDistanceMm,
        edgeRightSlopeHuPerMm: stent?.rightOuterEdge?.slopeHuPerMm,
        edgeRightKurtosis: stent?.rightOuterEdge?.kurtosis,
        edge1FwhmMm: stent?.leftPeak?.fwhmMm ?? edge1?.fwhmMm,
        edge1Rise10To90Mm: stent?.leftOuterEdge?.riseDistanceMm ?? edge1?.riseDistanceMm,
        edge1SlopeHuPerMm: stent?.leftOuterEdge?.slopeHuPerMm ?? edge1?.slopeHuPerMm,
        edge1Kurtosis: stent?.leftOuterEdge?.kurtosis ?? edge1?.kurtosis,
        edge2FwhmMm: stent?.rightPeak?.fwhmMm ?? edge2?.fwhmMm,
        edge2Rise10To90Mm: stent?.rightOuterEdge?.riseDistanceMm ?? edge2?.riseDistanceMm,
        edge2SlopeHuPerMm: stent?.rightOuterEdge?.slopeHuPerMm ?? edge2?.slopeHuPerMm,
        edge2Kurtosis: stent?.rightOuterEdge?.kurtosis ?? edge2?.kurtosis,
        lowerSlopeEdgeLabel: lowerEdge?.label || (lowerEdge === edge1 ? "Edge 1" : lowerEdge === edge2 ? "Edge 2" : ""),
        lowerSlopeFwhmMm: lowerEdgePeakFwhm ?? lowerEdge?.fwhmMm,
        lowerSlopeRise10To90Mm: lowerEdge?.riseDistanceMm,
        lowerSlopeHuPerMm: lowerEdge?.slopeHuPerMm,
        lowerSlopeKurtosis: lowerEdge?.kurtosis,
      };
    }
    return {};
  }

  function formatMeasurementType(typeOrAnnotation) {
    const annotation = typeof typeOrAnnotation === "object" && typeOrAnnotation ? typeOrAnnotation : null;
    const type = annotation?.type || typeOrAnnotation;
    if (type === "lineProfile") {
      return "Line Profile";
    }
    if (type === "squareProfile") {
      return "Square Profile";
    }
    if (type === "freehandRoi") {
      if (annotation?.roiSourceTool === "circularRoi") {
        return "ROI Circle";
      }
      if (annotation?.roiSourceTool === "segmentationRoi") {
        return "ROI Multiple Click";
      }
      if (annotation?.roiSourceTool === "contourCorrect") {
        return "Adjust ROI";
      }
      return "ROI";
    }
    if (type === "brushRoi") {
      return "ROI Brush";
    }
    if (type === "probe") {
      return "Probe";
    }
    if (type === "length") {
      return "Length";
    }
    if (type === "arrow") {
      return "Arrow";
    }
    if (type === "text") {
      return "Text Label";
    }
    return type;
  }

  function drawAnnotation(ctx, annotation, reconstruction, frame, geometry) {
    if (!isAnnotationVisible(annotation, frame)) {
      return;
    }

    if (annotation.type === "text") {
      const point = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
      drawLabelChip(ctx, annotation.text, point.x, point.y, "rgba(255, 207, 102, 0.94)");
      return;
    }

    if (annotation.type === "probe") {
      const point = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
      ctx.save();
      ctx.strokeStyle = "#57c8ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(point.x - 8, point.y);
      ctx.lineTo(point.x + 8, point.y);
      ctx.moveTo(point.x, point.y - 8);
      ctx.lineTo(point.x, point.y + 8);
      ctx.stroke();
      ctx.restore();
      drawLabelChip(ctx, getProbeLabel(annotation, reconstruction), point.x, point.y, "rgba(87, 200, 255, 0.94)");
      return;
    }

    if (annotation.type === "length") {
      const start = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
      const end = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[1]);
      ctx.save();
      ctx.strokeStyle = "#ffcf66";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.restore();
      drawLabelChip(ctx, getLengthLabel(annotation), end.x, end.y, "rgba(255, 207, 102, 0.94)");
      return;
    }

    if (annotation.type === "lineProfile") {
      const start = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
      const end = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[1]);
      ctx.save();
      ctx.strokeStyle = "#7af4a8";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.restore();
      drawLabelChip(ctx, "Profile", end.x, end.y, "rgba(122, 244, 168, 0.96)");
      return;
    }

    if (annotation.type === "squareProfile") {
      const box = getSquareProfilePlaneBox(annotation);
      const points = [
        planeMmToCanvasPoint(geometry, box.minX, box.minY),
        planeMmToCanvasPoint(geometry, box.maxX, box.minY),
        planeMmToCanvasPoint(geometry, box.maxX, box.maxY),
        planeMmToCanvasPoint(geometry, box.minX, box.maxY),
      ];
      drawPolygonShape(ctx, points, "#9cf06b", "rgba(156, 240, 107, 0.10)");
      drawLabelChip(ctx, "Square Profile", points[1].x, points[1].y, "rgba(156, 240, 107, 0.96)");
      return;
    }

    if (annotation.type === "arrow") {
      const start = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
      const end = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[1]);
      drawArrowLine(ctx, start, end, "#ff8b7d");
      return;
    }

    if (annotation.type === "brushRoi") {
      const mask = annotation.mask;
      if (!mask?.cells?.length) {
        return;
      }
      const cellRadiusPx = Math.max(1.6, mask.stepMm * geometry.scale * 0.58);
      ctx.save();
      ctx.fillStyle = "rgba(87, 200, 255, 0.14)";
      ctx.strokeStyle = "#57c8ff";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let y = 0; y < mask.height; y += 1) {
        for (let x = 0; x < mask.width; x += 1) {
          if (!mask.cells[brushMaskIndex(mask, x, y)]) {
            continue;
          }
          const point = getBrushMaskCellCenter(mask, x, y);
          const canvasPoint = planeMmToCanvasPoint(geometry, point.xMm, point.yMm);
          ctx.moveTo(canvasPoint.x + cellRadiusPx, canvasPoint.y);
          ctx.arc(canvasPoint.x, canvasPoint.y, cellRadiusPx, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      const centroid = getBrushMaskCentroid(annotation);
      const anchor = planeMmToCanvasPoint(geometry, centroid.xMm, centroid.yMm);
      drawLabelChip(ctx, getBrushLabel(annotation, reconstruction), anchor.x, anchor.y, "rgba(87, 200, 255, 0.94)");
      return;
    }

    if (annotation.type === "freehandRoi") {
      const points = annotation.worldPoints.map((worldPoint) => projectWorldPointToCanvas(frame, geometry, worldPoint));
      drawPolygonShape(ctx, points, "#57c8ff", "rgba(87, 200, 255, 0.12)");
      const anchor = points.reduce((best, point) => (point.y < best.y ? point : best), points[0]);
      drawLabelChip(ctx, getFreehandLabel(annotation, reconstruction), anchor.x, anchor.y, "rgba(87, 200, 255, 0.94)");
    }
  }

  function drawFreehandPreview(ctx, draft, frame, geometry) {
    if (!draft || draft.plane !== frame.plane) {
      return;
    }

    if (dot(draft.frame.nWorld, frame.nWorld) < 0.992) {
      return;
    }

    const points = draft.worldPoints.map((worldPoint) => projectWorldPointToCanvas(frame, geometry, worldPoint));
    if (draft.hoverWorld) {
      points.push(projectWorldPointToCanvas(frame, geometry, draft.hoverWorld));
    }
    drawPolygonShape(ctx, points, "#57c8ff", null, true);
  }

  function drawContourCorrectionPreview(ctx, frame, geometry) {
    const draft = state.contourCorrectionDraft;
    if (!draft || draft.plane !== frame.plane || draft.planePoints.length < 1) {
      return;
    }
    if (dot(draft.frame.nWorld, frame.nWorld) < 0.992) {
      return;
    }

    const points = draft.planePoints.map((point) => planeMmToCanvasPoint(geometry, point.x, point.y));
    ctx.save();
    ctx.strokeStyle = "#ffd27f";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.stroke();
    ctx.restore();
  }

  function drawEraserPreview(ctx, frame, geometry) {
    const preview = state.eraser.preview;
    if (state.activeToolKey !== "eraser" || !preview || preview.plane !== frame.plane) {
      return;
    }
    if (dot(preview.frame.nWorld, frame.nWorld) < 0.992) {
      return;
    }

    const center = planeMmToCanvasPoint(geometry, preview.point.xMm, preview.point.yMm);
    const radiusPx = Math.max(3, (state.eraser.sizeMm / 2) * geometry.scale);
    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 120, 96, 0.12)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = "rgba(255, 144, 120, 0.92)";
    ctx.stroke();
    ctx.restore();
  }

  function drawCoronaryPolyline(ctx, frame, geometry, worldPoints, color, lineWidth, dashed) {
    if (worldPoints.length < 2) {
      return;
    }
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (dashed) {
      ctx.setLineDash([7, 5]);
    }
    ctx.beginPath();
    worldPoints.forEach((worldPoint, index) => {
      const point = projectWorldPointToCanvas(frame, geometry, worldPoint);
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawCoronaryPointMarker(ctx, frame, geometry, worldPoint, color, radiusPx) {
    const point = projectWorldPointToCanvas(frame, geometry, worldPoint);
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(4, 10, 15, 0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return point;
  }

  function drawCoronaryOverlay(ctx, frame, geometry) {
    state.coronary.vessels.forEach((vessel) => {
      const isActive = vessel.id === state.coronary.activeVesselId;
      drawCoronaryPolyline(
        ctx,
        frame,
        geometry,
        vessel.centerline.map((sample) => sample.world),
        isActive ? vessel.color : `${vessel.color}cc`,
        isActive ? 2.8 : 1.8,
        false
      );
      const anchor = drawCoronaryPointMarker(ctx, frame, geometry, vessel.centerline[0].world, vessel.color, isActive ? 4.8 : 3.8);
      if (isActive) {
        drawLabelChip(ctx, getDisplayedCoronaryLabel(vessel), anchor.x, anchor.y, vessel.color);
      }

      if (!isActive) {
        return;
      }

      if (!vessel.backendSource && vessel.seedPoints?.length) {
        vessel.seedPoints.forEach((worldPoint, pointIndex) => {
          const renderWorldPoint =
            state.dragging?.type === "coronaryControlPointEdit" &&
            state.dragging.vesselId === vessel.id &&
            state.dragging.pointIndex === pointIndex &&
            state.dragging.pendingWorldPoint
              ? state.dragging.pendingWorldPoint
              : worldPoint;
          drawCoronaryPointMarker(ctx, frame, geometry, renderWorldPoint, "#9ae7ff", 3.4);
        });
      }

      const sample = getActiveCoronarySample();
      if (!sample) {
        return;
      }

      sample.contourWorldPoints?.length && drawPolygonShape(
        ctx,
        sample.contourWorldPoints.map((worldPoint) => projectWorldPointToCanvas(frame, geometry, worldPoint)),
        vessel.color,
        "rgba(255, 255, 255, 0.04)"
      );
      drawCoronaryPointMarker(ctx, frame, geometry, sample.world, "#ffffff", 4.2);
    });

    if (state.coronary.draftSeedPoints.length) {
      drawCoronaryPolyline(
        ctx,
        frame,
        geometry,
        state.coronary.draftSeedPoints,
        "rgba(255, 255, 255, 0.92)",
        2,
        true
      );
      state.coronary.draftSeedPoints.forEach((worldPoint) => {
        drawCoronaryPointMarker(ctx, frame, geometry, worldPoint, "#f6f7f9", 3.6);
      });
    }
  }

  function getVisibleAnnotationsForFrame(reconstruction, frame) {
    return reconstruction.annotations.filter((annotation) => isAnnotationVisible(annotation, frame));
  }

  function drawPlaneScene(ctx, reconstruction, frame, canvasWidth, canvasHeight, viewportState, options) {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    if (!reconstruction) {
      return;
    }

    const geometry = getRenderGeometry(viewportState, frame, canvasWidth, canvasHeight);
    const bufferCanvas = viewportState.bufferCanvas || document.createElement("canvas");
    viewportState.bufferCanvas = bufferCanvas;
    renderPlanePixelsToCanvas(bufferCanvas, reconstruction, frame);
    ctx.drawImage(bufferCanvas, geometry.originX, geometry.originY, geometry.drawWidth, geometry.drawHeight);

    if (options?.storeGeometry !== false) {
      viewportState.lastGeometry = geometry;
      viewportState.lastFrame = cloneFrame(frame);
      viewportState.lastOverlay = options?.showMprOverlay ? buildMprOverlayModel(reconstruction, frame, geometry) : null;
    }

    if (options?.showMprOverlay) {
      drawMprCoordinateOverlay(ctx, reconstruction, frame, geometry);
    }

    if (options?.includeAnnotations !== false) {
      const annotations = options?.annotationList || getVisibleAnnotationsForFrame(reconstruction, frame);
      annotations.forEach((annotation) => drawAnnotation(ctx, annotation, reconstruction, frame, geometry));
      if (!options?.annotationList) {
        const selectedAnnotation = getSelectedAnnotation();
        if (selectedAnnotation) {
          drawSelectedAnnotationOverlay(ctx, selectedAnnotation, reconstruction, frame, geometry);
        }
      }
      if (state.polygonDraft && state.polygonDraft.reconstructionId === reconstruction.id) {
        drawFreehandPreview(ctx, state.polygonDraft, frame, geometry);
      }
      drawContourCorrectionPreview(ctx, frame, geometry);
      drawEraserPreview(ctx, frame, geometry);
      if (options?.previewAnnotation) {
        drawAnnotation(ctx, options.previewAnnotation, reconstruction, frame, geometry);
      }
      drawCoronaryOverlay(ctx, frame, geometry);
    }
  }

  function getViewportFrame(viewportId, reconstruction) {
    return getCurrentPlaneFrame(getViewportPlane(viewportId), reconstruction);
  }

  function renderViewport(viewportId) {
    const reconstruction = getActiveReconstruction();
    const viewportState = state.viewports[viewportId];
    const size = ensureCanvasSize(viewportId);
    const frame = getViewportFrame(viewportId, reconstruction);

    if (!reconstruction || !frame) {
      viewportState.ctx.clearRect(0, 0, size.width, size.height);
      return;
    }

    updateOrientationOverlayForViewport(viewportId, frame);
    drawPlaneScene(viewportState.ctx, reconstruction, frame, size.width, size.height, viewportState, {
      includeAnnotations: true,
      showMprOverlay: state.mpr.overlayVisible !== false && (state.layout === "mpr" || state.activeToolKey === "mprCursor"),
      previewAnnotation: state.dragging?.type === "annotation" &&
        state.dragging.viewportId === viewportId &&
        state.dragging.annotation
          ? state.dragging.annotation
          : null,
    });
  }

  function ensureAuxCanvasSize(canvas) {
    const rect = canvas.getBoundingClientRect();
    const logicalWidth = Math.max(1, Math.round(rect.width || canvas.width || 320));
    const logicalHeight = Math.max(1, Math.round(rect.height || canvas.height || 220));
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(logicalWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(logicalHeight * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    return { ctx, width: logicalWidth, height: logicalHeight };
  }

  function drawEmptyCoronaryCanvas(canvas, title, subtitle) {
    const { ctx, width, height } = ensureAuxCanvasSize(canvas);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#f4f8fb";
    ctx.font = "600 16px Aptos, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, width / 2, height / 2 - 12);
    ctx.fillStyle = "#9fb6c7";
    ctx.font = "13px Aptos, Segoe UI, sans-serif";
    ctx.fillText(subtitle, width / 2, height / 2 + 14);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  function renderCoronaryLongitudinalCanvas(canvas, vessel, mode) {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction || !vessel?.centerline?.length) {
      drawEmptyCoronaryCanvas(
        canvas,
        mode === "curved" ? "Curved CPR unavailable" : "Straightened view unavailable",
        "Build a coronary vessel first."
      );
      return;
    }

    const { ctx, width, height } = ensureAuxCanvasSize(canvas);
    const bufferCanvas = document.createElement("canvas");
    bufferCanvas.width = width;
    bufferCanvas.height = height;
    const bufferCtx = bufferCanvas.getContext("2d");
    const imageData = bufferCtx.createImageData(width, height);
    const pixels = imageData.data;
    const sampleCount = vessel.centerline.length;
    const halfHeightMm = Math.max(CORONARY_DEFAULTS.reformatHalfHeightMm, vessel.searchRadiusMm * 1.5);
    const slabHalfThicknessMm = CORONARY_DEFAULTS.reformatSlabHalfThicknessMm;
    let offset = 0;

    for (let y = 0; y < height; y += 1) {
      const offsetMm = ((height / 2 - y) / Math.max(1, height - 1)) * halfHeightMm * 2;
      for (let x = 0; x < width; x += 1) {
        const sampleIndex = clamp(Math.round((x / Math.max(1, width - 1)) * (sampleCount - 1)), 0, sampleCount - 1);
        const sample = vessel.centerline[sampleIndex];
        const curvedLateral = normalize(cross(vessel.curvedPlaneNormal, sample.tangent));
        const lateral =
          mode === "curved" && vectorLength(curvedLateral) > 1e-3 ? curvedLateral : sample.normal;
        const slabAxis = mode === "curved" ? vessel.curvedPlaneNormal : sample.binormal;
        const slabOffsets = [-slabHalfThicknessMm, 0, slabHalfThicknessMm];
        let hu = -1024;
        slabOffsets.forEach((slabOffset) => {
          const world = offsetWorld(sample.world, lateral, offsetMm, slabAxis, slabOffset, null, 0);
          const value = sampleVolumeAtWorld(reconstruction.volume, world);
          if (value != null) {
            hu = Math.max(hu, value);
          }
        });
        const gray = voiToByte(hu);
        pixels[offset] = gray;
        pixels[offset + 1] = gray;
        pixels[offset + 2] = gray;
        pixels[offset + 3] = 255;
        offset += 4;
      }
    }

    bufferCtx.putImageData(imageData, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(bufferCanvas, 0, 0, width, height);

    const cursorX = (state.coronary.activeSampleIndex / Math.max(1, sampleCount - 1)) * width;
    ctx.save();
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(cursorX, 0);
    ctx.lineTo(cursorX, height);
    ctx.stroke();
    ctx.restore();
  }

  function renderCoronaryCrossSectionCanvas(canvas, vessel) {
    const reconstruction = getActiveReconstruction();
    const sample = getActiveCoronarySample();
    if (!reconstruction || !vessel || !sample) {
      drawEmptyCoronaryCanvas(canvas, "Orthogonal cross-section unavailable", "Select a vessel sample first.");
      state.coronary.lastCrossSectionGeometry = null;
      return;
    }

    const { ctx, width, height } = ensureAuxCanvasSize(canvas);
    const bufferCanvas = document.createElement("canvas");
    bufferCanvas.width = width;
    bufferCanvas.height = height;
    const bufferCtx = bufferCanvas.getContext("2d");
    const imageData = bufferCtx.createImageData(width, height);
    const pixels = imageData.data;
    const halfSizeMm = Math.max(state.coronary.crossSectionView.halfSizeMm, vessel.searchRadiusMm * 1.55);
    let offset = 0;

    for (let y = 0; y < height; y += 1) {
      const yMm = ((height / 2 - y) / Math.max(1, height - 1)) * halfSizeMm * 2;
      for (let x = 0; x < width; x += 1) {
        const xMm = ((x - width / 2) / Math.max(1, width - 1)) * halfSizeMm * 2;
        const world = offsetWorld(sample.world, sample.normal, xMm, sample.binormal, yMm, null, 0);
        const hu = sampleVolumeAtWorld(reconstruction.volume, world);
        const gray = voiToByte(hu == null ? -1024 : hu);
        pixels[offset] = gray;
        pixels[offset + 1] = gray;
        pixels[offset + 2] = gray;
        pixels[offset + 3] = 255;
        offset += 4;
      }
    }

    bufferCtx.putImageData(imageData, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(bufferCanvas, 0, 0, width, height);

    const scale = Math.min(width, height) / (halfSizeMm * 2);
    const centerX = width / 2;
    const centerY = height / 2;
    const contourPoints = sample.radiiMm.map((radius, index) => {
      const angle = (index / sample.radiiMm.length) * Math.PI * 2;
      return {
        x: centerX + Math.cos(angle) * radius * scale,
        y: centerY - Math.sin(angle) * radius * scale,
      };
    });
    drawPolygonShape(ctx, contourPoints, vessel.color, "rgba(255, 255, 255, 0.06)");
    drawSelectionHandle(ctx, { x: centerX, y: centerY }, 6);
    const radiusHandle = {
      x: centerX + sample.meanRadiusMm * scale,
      y: centerY,
    };
    drawSelectionHandle(ctx, radiusHandle, 5);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    ctx.restore();

    state.coronary.lastCrossSectionGeometry = {
      width,
      height,
      scale,
      centerX,
      centerY,
      halfSizeMm,
      radiusHandleX: radiusHandle.x,
      radiusHandleY: radiusHandle.y,
    };
  }

  function renderCoronaryPanels() {
    const vessel = getActiveCoronaryVessel();
    renderCoronaryLongitudinalCanvas(els.coronaryCurvedCanvas, vessel, "curved");
    renderCoronaryLongitudinalCanvas(els.coronaryStraightenedCanvas, vessel, "straightened");
    renderCoronaryCrossSectionCanvas(els.coronaryCrossSectionCanvas, vessel);
  }

  function renderAll() {
    VIEWPORT_IDS.forEach(renderViewport);
    renderCoronaryPanels();
    updateReadouts();
  }

  function requestRenderAll() {
    if (state.renderQueued) {
      return;
    }

    state.renderQueued = true;
    window.requestAnimationFrame(() => {
      state.renderQueued = false;
      renderAll();
    });
  }

  function updateViewportCursors() {
    VIEWPORT_IDS.forEach((viewportId) => {
      const viewportState = state.viewports[viewportId];
      if (!viewportState?.canvas) {
        return;
      }

      let cursor = TOOL_CURSORS[state.activeToolKey] || "default";
      if (state.dragging?.type === "rightScroll" && state.dragging.viewportId === viewportId) {
        cursor = "ns-resize";
      } else if (state.dragging?.type === "pan" && state.dragging.viewportId === viewportId) {
        cursor = "grabbing";
      } else if (state.dragging && state.dragging.viewportId === viewportId && state.activeToolKey === "mprCursor") {
        cursor = "grabbing";
      } else if (state.dragging && state.dragging.viewportId === viewportId && state.activeToolKey === "edit") {
        cursor = "grabbing";
      }

      viewportState.canvas.style.cursor = cursor;
    });
  }

  function stopCine() {
    if (state.cineTimerId) {
      window.clearInterval(state.cineTimerId);
      state.cineTimerId = null;
    }
    els.cineButton.textContent = "Play Cine";
  }

  function scrollPlaneBy(plane, delta) {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return;
    }

    stopCine();
    const frame = getCurrentPlaneFrame(plane, reconstruction);
    state.mpr.centerWorld = addVectors(
      state.mpr.centerWorld || reconstruction.volume.centerWorld,
      scaleVector(frame.nWorld, delta * frame.metrics.spacingNormal)
    );
    state.polygonDraft = null;
    updateReadouts();
    requestRenderAll();
  }

  function setPlaneIndex(plane, targetIndex) {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return;
    }

    const currentIndex = getReadoutIndex(reconstruction, plane);
    const metrics = getPlaneMetrics(reconstruction.volume, plane);
    const clampedIndex = clamp(targetIndex, 0, metrics.count - 1);
    const delta = clampedIndex - currentIndex;
    if (!delta) {
      return;
    }

    scrollPlaneBy(plane, delta);
  }

  function startCine() {
    if (!getActiveReconstruction()) {
      return;
    }
    stopCine();
    state.cineTimerId = window.setInterval(() => {
      scrollPlaneBy("axial", 1);
    }, 1000 / state.cineFps);
    els.cineButton.textContent = "Pause Cine";
  }

  function toggleCine() {
    if (state.cineTimerId) {
      stopCine();
    } else {
      startCine();
    }
  }

  function getSupportedCineFormat() {
    if (!window.MediaRecorder) {
      return null;
    }

    const candidates = [
      { mimeType: "video/mp4;codecs=h264", extension: "mp4" },
      { mimeType: "video/mp4", extension: "mp4" },
      { mimeType: "video/webm;codecs=vp9", extension: "webm" },
      { mimeType: "video/webm;codecs=vp8", extension: "webm" },
      { mimeType: "video/webm", extension: "webm" },
    ];

    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType)) || null;
  }

  function drawViewportToCanvas(ctx, viewportId, x, y, width, height) {
    const reconstruction = getActiveReconstruction();
    const sourceCanvas = getViewportCanvas(viewportId);
    const frame = getViewportFrame(viewportId, reconstruction);
    if (!sourceCanvas || !frame) {
      throw new Error("Viewport canvas is not ready yet.");
    }

    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, width, height);
    ctx.drawImage(sourceCanvas, x, y, width, height);
    drawHeaderBar(ctx, x, y, width, getViewportTitle(viewportId), getViewportSummary(viewportId));
    drawOrientationLabels(ctx, x, y, width, height, getOrientationLabels(frame));
  }

  async function exportCurrentViewportPng() {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      throw new Error("Load a DICOM series first.");
    }

    const exportViewportId =
      state.layout === "presentation" && state.activeViewportId !== "presentation"
        ? "presentation"
        : state.activeViewportId;
    const sourceCanvas = getViewportCanvas(exportViewportId);
    if (!sourceCanvas) {
      throw new Error("The current viewport is not ready yet.");
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = sourceCanvas.width;
    exportCanvas.height = sourceCanvas.height;
    const ctx = exportCanvas.getContext("2d");
    drawViewportToCanvas(ctx, exportViewportId, 0, 0, exportCanvas.width, exportCanvas.height);
    downloadCanvas(exportCanvas, buildExportFilename(`current_${exportViewportId}`, "png"));
    setStatus("Current viewport exported as PNG.");
  }

  async function exportFourUpPng() {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      throw new Error("Load a DICOM series first.");
    }

    const frame = getCurrentPlaneFrame("axial", reconstruction);
    const currentIndex = getReadoutIndex(reconstruction, "axial");
    const count = frame.metrics.count;
    const tileCount = Math.min(4, count);
    const startIndex = clamp(currentIndex, 0, Math.max(0, count - tileCount));
    const tileIndices = Array.from({ length: tileCount }, (_, offset) => startIndex + offset);
    const sourceCanvas = getViewportCanvas("presentation");
    if (!sourceCanvas) {
      throw new Error("The viewer is not ready for export yet.");
    }

    const tileWidth = sourceCanvas.width;
    const tileHeight = sourceCanvas.height;
    const gap = 20;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = tileWidth * 2 + gap * 3;
    exportCanvas.height = tileHeight * 2 + gap * 3;
    const ctx = exportCanvas.getContext("2d");
    ctx.fillStyle = "#05080b";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    const positions = [
      { x: gap, y: gap },
      { x: tileWidth + gap * 2, y: gap },
      { x: gap, y: tileHeight + gap * 2 },
      { x: tileWidth + gap * 2, y: tileHeight + gap * 2 },
    ];

    tileIndices.forEach((sliceIndex, tileIndex) => {
      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = tileWidth;
      tileCanvas.height = tileHeight;
      const tileCtx = tileCanvas.getContext("2d");
      const viewportState = {
        zoom: 1,
        panX: 0,
        panY: 0,
        bufferCanvas: document.createElement("canvas"),
      };
      const tileFrame = cloneFrame(frame);
      const offset = (sliceIndex - currentIndex) * frame.metrics.spacingNormal;
      tileFrame.centerWorld = addVectors(frame.centerWorld, scaleVector(frame.nWorld, offset));
      drawPlaneScene(tileCtx, reconstruction, tileFrame, tileWidth, tileHeight, viewportState, {
        includeAnnotations: false,
        storeGeometry: false,
      });
      const position = positions[tileIndex];
      ctx.drawImage(tileCanvas, position.x, position.y, tileWidth, tileHeight);
      drawHeaderBar(
        ctx,
        position.x,
        position.y,
        tileWidth,
        `Slice ${sliceIndex + 1}`,
        `${sliceIndex + 1} / ${count}`
      );
      drawOrientationLabels(ctx, position.x, position.y, tileWidth, tileHeight, getOrientationLabels(tileFrame));
    });

    downloadCanvas(exportCanvas, buildExportFilename("comparison_4up", "png"));
    setStatus("4-up comparison exported as successive slices PNG.");
  }

  async function exportCineClip() {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      throw new Error("Load a DICOM series first.");
    }

    const cineFormat = getSupportedCineFormat();
    if (!cineFormat) {
      throw new Error("This browser cannot export cine clips. Try Chrome or Safari.");
    }

    stopCine();
    setStatus("Exporting cine clip...");

    const sourceCanvas = getViewportCanvas("presentation");
    if (!sourceCanvas) {
      throw new Error("The presentation viewport is not ready yet.");
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = sourceCanvas.width;
    exportCanvas.height = sourceCanvas.height;
    const ctx = exportCanvas.getContext("2d");
    const stream = exportCanvas.captureStream(state.cineFps);
    const recorder = new MediaRecorder(stream, { mimeType: cineFormat.mimeType });
    const chunks = [];
    const baseFrame = getCurrentPlaneFrame("axial", reconstruction);
    const baseIndex = getReadoutIndex(reconstruction, "axial");

    const finished = new Promise((resolve, reject) => {
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      });
      recorder.addEventListener("stop", resolve, { once: true });
      recorder.addEventListener("error", () => reject(new Error("The browser could not finish the cine export.")), {
        once: true,
      });
    });

    recorder.start();
    for (let index = 0; index < reconstruction.volume.depth; index += 1) {
      const frame = cloneFrame(baseFrame);
      frame.centerWorld = addVectors(
        baseFrame.centerWorld,
        scaleVector(baseFrame.nWorld, (index - baseIndex) * baseFrame.metrics.spacingNormal)
      );
      const viewportState = {
        zoom: 1,
        panX: 0,
        panY: 0,
        bufferCanvas: document.createElement("canvas"),
      };
      drawPlaneScene(ctx, reconstruction, frame, exportCanvas.width, exportCanvas.height, viewportState, {
        includeAnnotations: false,
        storeGeometry: false,
      });
      drawHeaderBar(ctx, 0, 0, exportCanvas.width, "Cine Export", `${index + 1} / ${reconstruction.volume.depth}`);
      drawOrientationLabels(ctx, 0, 0, exportCanvas.width, exportCanvas.height, getOrientationLabels(frame));
      await wait(Math.max(30, 1000 / state.cineFps));
    }

    recorder.stop();
    await finished;
    const blob = new Blob(chunks, { type: cineFormat.mimeType });
    downloadBlob(blob, buildExportFilename("cine", cineFormat.extension));
    setStatus(`Cine clip exported as ${cineFormat.extension.toUpperCase()}.`);
  }

  function csvEscape(value) {
    if (value == null || value === "") {
      return "";
    }
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function buildMeasurementEntriesForReconstruction(reconstruction) {
    return reconstruction.annotations
      .filter((annotation) => MEASUREMENT_TYPES.has(annotation.type))
      .sort((left, right) => left.id - right.id)
      .map((annotation, index) => ({
        label: `M${String(index + 1).padStart(3, "0")}`,
        order: index + 1,
        reconstruction,
        annotation,
        summary: getMeasurementSummary(annotation, reconstruction),
      }));
  }

  function buildMeasurementEntries() {
    return state.reconstructions.flatMap((reconstruction) => buildMeasurementEntriesForReconstruction(reconstruction));
  }

  function buildMeasurementsCsv(entries, options) {
    const studyId = safeString(options?.studyId);
    const researchStudy = getSelectedExportStudyMetadata();
    const headers = [
      "Study_ID",
      "Research_Study_ID",
      "Research_Study_Label",
      "label",
      "order",
      "annotation_id",
      "type",
      "plane",
      "reconstruction",
      "length_mm",
      "probe_hu",
      "mean_hu",
      "sd_hu",
      "area_mm2",
      "vertex_count",
      "profile_length_mm",
      "profile_width_mm",
      "profile_axis",
      "profile_samples",
      "profile_adjustment_mode",
      "left_outer_anchor_mm",
      "left_peak_anchor_mm",
      "lumen_anchor_mm",
      "right_peak_anchor_mm",
      "right_outer_anchor_mm",
      "peak1_hu",
      "peak2_hu",
      "lumen_baseline_hu",
      "stent_fwhm_left_mm",
      "stent_fwhm_right_mm",
      "stent_fwhm_mean_mm",
      "lumen_fwhm_mm",
      "edge_left_rise_10_90_mm",
      "edge_left_slope_hu_per_mm",
      "edge_left_kurtosis",
      "edge_right_rise_10_90_mm",
      "edge_right_slope_hu_per_mm",
      "edge_right_kurtosis",
      "edge1_fwhm_mm",
      "edge1_rise_10_90_mm",
      "edge1_slope_hu_per_mm",
      "edge1_kurtosis",
      "edge2_fwhm_mm",
      "edge2_rise_10_90_mm",
      "edge2_slope_hu_per_mm",
      "edge2_kurtosis",
      "lower_slope_edge",
      "lower_slope_fwhm_mm",
      "lower_slope_rise_10_90_mm",
      "lower_slope_hu_per_mm",
      "lower_slope_kurtosis",
    ];

    const rows = entries.map((entry) => [
      studyId,
      researchStudy.id,
      researchStudy.label,
      entry.label,
      entry.order,
      entry.annotation.id,
      formatMeasurementType(entry.annotation.type),
      entry.annotation.plane,
      entry.reconstruction?.label || "",
      entry.summary.lengthMm != null ? entry.summary.lengthMm.toFixed(2) : "",
      entry.summary.hu != null ? Math.round(entry.summary.hu) : "",
      entry.summary.mean != null ? entry.summary.mean.toFixed(2) : "",
      entry.summary.sd != null ? entry.summary.sd.toFixed(2) : "",
      entry.summary.areaMm2 != null ? entry.summary.areaMm2.toFixed(2) : "",
      entry.summary.vertexCount != null ? entry.summary.vertexCount : "",
      entry.summary.profileLengthMm != null ? entry.summary.profileLengthMm.toFixed(2) : "",
      entry.summary.profileWidthMm != null ? entry.summary.profileWidthMm.toFixed(2) : "",
      entry.summary.profileAxis || "",
      entry.summary.sampleCount != null ? entry.summary.sampleCount : "",
      entry.summary.profileAdjustmentMode || "",
      entry.summary.leftOuterAnchorMm != null ? entry.summary.leftOuterAnchorMm.toFixed(3) : "",
      entry.summary.leftPeakAnchorMm != null ? entry.summary.leftPeakAnchorMm.toFixed(3) : "",
      entry.summary.lumenAnchorMm != null ? entry.summary.lumenAnchorMm.toFixed(3) : "",
      entry.summary.rightPeakAnchorMm != null ? entry.summary.rightPeakAnchorMm.toFixed(3) : "",
      entry.summary.rightOuterAnchorMm != null ? entry.summary.rightOuterAnchorMm.toFixed(3) : "",
      entry.summary.peak1Hu != null ? entry.summary.peak1Hu.toFixed(1) : "",
      entry.summary.peak2Hu != null ? entry.summary.peak2Hu.toFixed(1) : "",
      entry.summary.lumenBaselineHu != null ? entry.summary.lumenBaselineHu.toFixed(1) : "",
      entry.summary.stentFwhmLeftMm != null ? entry.summary.stentFwhmLeftMm.toFixed(3) : "",
      entry.summary.stentFwhmRightMm != null ? entry.summary.stentFwhmRightMm.toFixed(3) : "",
      entry.summary.stentFwhmMeanMm != null ? entry.summary.stentFwhmMeanMm.toFixed(3) : "",
      entry.summary.lumenFwhmMm != null ? entry.summary.lumenFwhmMm.toFixed(3) : "",
      entry.summary.edgeLeftRise10To90Mm != null ? entry.summary.edgeLeftRise10To90Mm.toFixed(3) : "",
      entry.summary.edgeLeftSlopeHuPerMm != null ? entry.summary.edgeLeftSlopeHuPerMm.toFixed(3) : "",
      entry.summary.edgeLeftKurtosis != null ? entry.summary.edgeLeftKurtosis.toFixed(3) : "",
      entry.summary.edgeRightRise10To90Mm != null ? entry.summary.edgeRightRise10To90Mm.toFixed(3) : "",
      entry.summary.edgeRightSlopeHuPerMm != null ? entry.summary.edgeRightSlopeHuPerMm.toFixed(3) : "",
      entry.summary.edgeRightKurtosis != null ? entry.summary.edgeRightKurtosis.toFixed(3) : "",
      entry.summary.edge1FwhmMm != null ? entry.summary.edge1FwhmMm.toFixed(3) : "",
      entry.summary.edge1Rise10To90Mm != null ? entry.summary.edge1Rise10To90Mm.toFixed(3) : "",
      entry.summary.edge1SlopeHuPerMm != null ? entry.summary.edge1SlopeHuPerMm.toFixed(3) : "",
      entry.summary.edge1Kurtosis != null ? entry.summary.edge1Kurtosis.toFixed(3) : "",
      entry.summary.edge2FwhmMm != null ? entry.summary.edge2FwhmMm.toFixed(3) : "",
      entry.summary.edge2Rise10To90Mm != null ? entry.summary.edge2Rise10To90Mm.toFixed(3) : "",
      entry.summary.edge2SlopeHuPerMm != null ? entry.summary.edge2SlopeHuPerMm.toFixed(3) : "",
      entry.summary.edge2Kurtosis != null ? entry.summary.edge2Kurtosis.toFixed(3) : "",
      entry.summary.lowerSlopeEdgeLabel || "",
      entry.summary.lowerSlopeFwhmMm != null ? entry.summary.lowerSlopeFwhmMm.toFixed(3) : "",
      entry.summary.lowerSlopeRise10To90Mm != null ? entry.summary.lowerSlopeRise10To90Mm.toFixed(3) : "",
      entry.summary.lowerSlopeHuPerMm != null ? entry.summary.lowerSlopeHuPerMm.toFixed(3) : "",
      entry.summary.lowerSlopeKurtosis != null ? entry.summary.lowerSlopeKurtosis.toFixed(3) : "",
    ]);

    return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  }

  function drawMeasurementTag(ctx, label) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 207, 102, 0.96)";
    ctx.fillRect(18, 70, 74, 28);
    ctx.fillStyle = "#0a1015";
    ctx.font = "700 15px Aptos, Segoe UI, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 28, 84);
    ctx.restore();
  }

  function buildProfileExportSummaryLines(analysis) {
    const stent = analysis?.stent || null;
    const leftEdge = stent?.leftOuterEdge || null;
    const rightEdge = stent?.rightOuterEdge || null;
    const lowerEdge = stent?.lowerSteepEdge || null;
    return [
      `Mode: ${stent?.adjustmentMode || "-"}`,
      `Peaks/Lumen: ${formatMetricValue(stent?.leftPeak?.peakHu, "HU", 0)} / ${formatMetricValue(stent?.rightPeak?.peakHu, "HU", 0)} / ${formatMetricValue(stent?.lumenBaseHu, "HU", 0)}`,
      `Stent FWHM: L ${formatMetricValue(stent?.leftPeak?.fwhmMm, "mm", 2)} | R ${formatMetricValue(stent?.rightPeak?.fwhmMm, "mm", 2)} | Mean ${formatMetricValue(stent?.stentFwhmMeanMm, "mm", 2)}`,
      `Lumen FWHM: ${formatMetricValue(stent?.lumenFwhmMm, "mm", 2)}`,
      `Left 10-90: ${formatMetricValue(leftEdge?.riseDistanceMm, "mm", 2)} | ${formatMetricValue(leftEdge?.slopeHuPerMm, "HU/mm", 1)}`,
      `Right 10-90: ${formatMetricValue(rightEdge?.riseDistanceMm, "mm", 2)} | ${formatMetricValue(rightEdge?.slopeHuPerMm, "HU/mm", 1)}`,
      `Lower steep: ${lowerEdge?.label || "-"} | ${formatMetricValue(lowerEdge?.riseDistanceMm, "mm", 2)} | ${formatMetricValue(lowerEdge?.slopeHuPerMm, "HU/mm", 1)}`,
      `Kurtosis: L ${formatMetricValue(leftEdge?.kurtosis, "", 2)} | R ${formatMetricValue(rightEdge?.kurtosis, "", 2)} | Mean ${formatMetricValue(averageFinite([leftEdge?.kurtosis, rightEdge?.kurtosis]), "", 2)}`,
    ];
  }

  function drawProfileExportSummary(ctx, analysis, x, y, width) {
    const lines = buildProfileExportSummaryLines(analysis);
    ctx.save();
    ctx.fillStyle = "#d2e0e9";
    ctx.font = "15px Aptos, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    lines.forEach((line, index) => {
      ctx.fillText(line, x, y + index * 22, width);
    });
    ctx.restore();
  }

  function drawMeasurementsExportHeader(ctx, width, studyId) {
    const reconstruction = getActiveReconstruction();
    const record = reconstruction?.records?.[0] || {};
    const patient = record.patientName || record.patientId || "Unknown patient";
    const series = reconstruction?.label || record.seriesDescription || "Current series";
    const researchStudy = getSelectedExportStudyMetadata();
    const studyLine = [
      studyId ? `Study ID: ${studyId}` : "",
      researchStudy.displayLabel ? `Research Study: ${researchStudy.displayLabel}` : "",
    ]
      .filter(Boolean)
      .join(" • ");

    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    ctx.fillRect(0, 0, width, 96);
    ctx.fillStyle = "#f4f8fb";
    ctx.font = "700 26px Aptos, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Measurement Export", 22, 18);
    ctx.fillStyle = "#ffd27f";
    ctx.font = "700 17px Aptos, Segoe UI, sans-serif";
    ctx.fillText(studyLine || "Study ID: -", 22, 52);
    ctx.fillStyle = "#d2e0e9";
    ctx.font = "15px Aptos, Segoe UI, sans-serif";
    ctx.fillText(`${patient} • ${series}`, 22, 74);
    ctx.restore();
  }

  function exportMeasurementsPng(entries, options) {
    const studyId = safeString(options?.studyId);
    const hasProfileEntries = entries.some((entry) => PROFILE_TYPES.has(entry.annotation.type));
    const tileWidth = hasProfileEntries ? 1320 : 960;
    const tileHeight = 960;
    const columns = entries.length === 1 ? 1 : entries.length <= 4 ? 2 : 3;
    const rows = Math.ceil(entries.length / columns);
    const gap = 22;
    const headerHeight = 96;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = columns * tileWidth + (columns + 1) * gap;
    exportCanvas.height = rows * tileHeight + (rows + 1) * gap + headerHeight;
    const ctx = exportCanvas.getContext("2d");
    ctx.fillStyle = "#05080b";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    drawMeasurementsExportHeader(ctx, exportCanvas.width, studyId);

    entries.forEach((entry, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = gap + column * (tileWidth + gap);
      const y = headerHeight + gap + row * (tileHeight + gap);
      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = tileWidth;
      tileCanvas.height = tileHeight;
      const tileCtx = tileCanvas.getContext("2d");
      tileCtx.fillStyle = "#000000";
      tileCtx.fillRect(0, 0, tileWidth, tileHeight);
      const isProfileEntry = PROFILE_TYPES.has(entry.annotation.type);
      const imageWidth = isProfileEntry ? 840 : tileWidth;
      const chartWidth = tileWidth - imageWidth - 36;
      const viewportState = {
        zoom: 1,
        panX: 0,
        panY: 0,
        bufferCanvas: document.createElement("canvas"),
      };
      drawPlaneScene(tileCtx, entry.reconstruction, entry.annotation.frame, imageWidth, tileHeight, viewportState, {
        includeAnnotations: true,
        annotationList: [entry.annotation],
        storeGeometry: false,
      });
      if (isProfileEntry) {
        const analysis = buildProfileAnalysis(entry.annotation, entry.reconstruction);
        const chartCanvas = document.createElement("canvas");
        drawProfileChartOnCanvas(chartCanvas, analysis, {
          width: chartWidth,
          height: 270,
          showManualGuides: true,
        });
        tileCtx.drawImage(chartCanvas, imageWidth + 20, 74, chartWidth, 270);
        drawProfileExportSummary(tileCtx, analysis, imageWidth + 20, 366, chartWidth - 8);
      }
      ctx.drawImage(tileCanvas, x, y, tileWidth, tileHeight);
      drawHeaderBar(
        ctx,
        x,
        y,
        tileWidth,
        `${entry.label} • ${formatMeasurementType(entry.annotation.type)} • ${entry.annotation.plane}`,
        entry.reconstruction.label
      );
      drawOrientationLabels(ctx, x, y, tileWidth, tileHeight, getOrientationLabels(entry.annotation.frame));
      ctx.save();
      ctx.translate(x, y);
      drawMeasurementTag(ctx, entry.label);
      ctx.restore();
    });

    downloadCanvas(exportCanvas, buildExportFilename("measurements", "png", { studyId }), { patientStudyId: studyId });
  }

  function exportMeasurementsReport(options) {
    const studyId = safeString(options?.studyId).trim();
    const entries = buildMeasurementEntries();
    if (!entries.length) {
      throw new Error("Create at least one measurement first.");
    }
    if (!studyId) {
      throw new Error("Study ID is required before export.");
    }

    exportMeasurementsPng(entries, { studyId });
    const csv = buildMeasurementsCsv(entries, { studyId });
    downloadBlob(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      buildExportFilename("measurements", "csv", { studyId }),
      { patientStudyId: studyId }
    );
    const reconstructionCount = new Set(entries.map((entry) => entry.reconstruction.id)).size;
    if (options?.clearAfterExport) {
      clearStudy({
        statusMessage: `Finished case ${studyId}. Exported ${entries.length} measurements from ${reconstructionCount} reconstruction${reconstructionCount === 1 ? "" : "s"} as PNG and CSV.`,
      });
      return;
    }
    setStatus(
      `Exported ${entries.length} measurements from ${reconstructionCount} reconstruction${reconstructionCount === 1 ? "" : "s"} as PNG and CSV for Study ID ${studyId}.`
    );
  }

  function getExportStudyDirectoryLabel(studyId) {
    const study = state.export.studies.find((entry) => safeString(entry.id) === safeString(studyId)) || null;
    if (study?.slug) {
      return `exports_outbox/coronary/${study.slug}`;
    }
    return "exports_outbox/coronary";
  }

  function getSelectedExportStudyMetadata() {
    const study = state.export.studies.find((entry) => safeString(entry.id) === safeString(state.export.currentStudyId)) || null;
    return {
      id: safeString(study?.id) || "",
      label: safeString(study?.label) || "",
      slug: safeString(study?.slug) || "",
      displayLabel: safeString(study?.label) || safeString(study?.id) || "",
    };
  }

  function updateExportStudyTargetNote() {
    if (!els.exportStudyTargetNote) {
      return;
    }
    const currentStudyId = safeString(state.export.currentStudyId);
    const study = state.export.studies.find((entry) => safeString(entry.id) === currentStudyId) || null;
    if (study) {
      els.exportStudyTargetNote.textContent = `Mirrored exports will also be saved to ${getExportStudyDirectoryLabel(study.id)}.`;
      return;
    }
    els.exportStudyTargetNote.textContent = "Mirrored exports will also be saved to exports_outbox/coronary until a study is selected.";
  }

  function applyExportStudyPayload(payload) {
    state.export.studies = Array.isArray(payload?.studies) ? payload.studies : [];
    state.export.currentStudyId = safeString(payload?.currentStudyId) || "";
    if (els.exportStudySelect) {
      exportStudyApi?.populateSelect(els.exportStudySelect, state.export.studies, state.export.currentStudyId, "No study selected");
    }
    updateExportStudyTargetNote();
  }

  async function refreshExportStudyOptions() {
    if (!exportStudyApi || !els.exportStudySelect) {
      updateExportStudyTargetNote();
      return;
    }
    const payload = await exportStudyApi.load();
    applyExportStudyPayload(payload);
  }

  async function handleExportStudySelectionChange() {
    if (!exportStudyApi || !els.exportStudySelect) {
      return;
    }
    const payload = await exportStudyApi.select(els.exportStudySelect.value || "");
    state.export.currentStudyId = safeString(payload?.id) || "";
    await refreshExportStudyOptions();
  }

  async function createExportStudyFromDialog() {
    if (!exportStudyApi || !els.exportStudyCreateInput) {
      return;
    }
    const label = safeString(els.exportStudyCreateInput.value);
    if (!label) {
      setStatus("Enter a study name first.", "warning");
      els.exportStudyCreateInput.focus();
      return;
    }
    const created = await exportStudyApi.create(label);
    els.exportStudyCreateInput.value = "";
    state.export.currentStudyId = safeString(created?.id) || "";
    await refreshExportStudyOptions();
    setStatus(`Selected export study ${created?.label || state.export.currentStudyId}.`);
  }

  function openExportDialog(action) {
    if (!buildMeasurementEntries().length) {
      throw new Error("Create at least one measurement first.");
    }
    const isFinishClose = action === "finishClose";
    state.export.dialogOpen = true;
    state.export.pendingAction = isFinishClose ? "finishClose" : "export";
    els.exportDialog.hidden = false;
    document.body.classList.add("is-modal-open");
    els.exportDialogKicker.textContent = isFinishClose ? "Finish case" : "Measurement export";
    els.exportDialogTitle.textContent = isFinishClose ? "Finish & Close Study" : "Assign Study ID";
    els.exportDialogCopy.textContent = isFinishClose
      ? "Enter the Study ID to place into the exported PNG and CSV, then the current study will close."
      : "Enter the Study ID to place into the exported PNG and as the first CSV column.";
    els.exportDialogConfirmButton.textContent = isFinishClose ? "Export & Close" : "Export";
    els.exportDialogError.hidden = true;
    els.exportDialogInput.value = state.export.lastStudyId;
    refreshExportStudyOptions().catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not load export studies.", "error");
    });
    window.requestAnimationFrame(() => {
      els.exportDialogInput.focus();
      els.exportDialogInput.select();
    });
  }

  function closeExportDialog() {
    if (!els.exportDialog || els.exportDialog.hidden) {
      return;
    }
    const returnButton =
      state.export.pendingAction === "finishClose" ? els.finishCloseButton : els.exportMeasurementsButton;
    state.export.dialogOpen = false;
    state.export.pendingAction = "export";
    els.exportDialog.hidden = true;
    els.exportDialogError.hidden = true;
    document.body.classList.remove("is-modal-open");
    returnButton?.focus();
  }

  function confirmExportDialog() {
    const studyId = safeString(els.exportDialogInput.value).trim();
    if (!studyId) {
      els.exportDialogError.hidden = false;
      els.exportDialogInput.focus();
      els.exportDialogInput.select();
      return;
    }

    state.export.lastStudyId = studyId;
    exportMeasurementsReport({
      studyId,
      clearAfterExport: state.export.pendingAction === "finishClose",
    });
    closeExportDialog();
  }

  function copyLatestRoi() {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      throw new Error("Load a reconstruction first.");
    }

    const frame = state.viewports[state.activeViewportId]?.lastFrame || getViewportFrame(state.activeViewportId, reconstruction);
    const visibleRois = reconstruction.annotations
      .filter((annotation) => annotation.type === "freehandRoi")
      .filter((annotation) => isAnnotationVisible(annotation, frame));
    const roi = visibleRois[visibleRois.length - 1] || reconstruction.annotations.filter((item) => item.type === "freehandRoi").slice(-1)[0];

    if (!roi) {
      throw new Error("Draw an ROI first.");
    }

    state.roiClipboard = {
      plane: frame.plane,
      pointsMm: roi.worldPoints.map((worldPoint) => {
        const coordinates = worldToPlaneCoordinates(roi.frame, worldPoint);
        return { xMm: coordinates.xMm, yMm: coordinates.yMm };
      }),
    };
    setStatus("ROI copied. Switch reconstruction and paste when ready.");
  }

  function pasteCopiedRoi() {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      throw new Error("Load a reconstruction first.");
    }

    if (!state.roiClipboard?.pointsMm?.length) {
      throw new Error("Copy an ROI first.");
    }

    const frame = state.viewports[state.activeViewportId]?.lastFrame || getViewportFrame(state.activeViewportId, reconstruction);
    const worldPoints = state.roiClipboard.pointsMm.map((point) =>
      addVectors(
        addVectors(frame.centerWorld, scaleVector(frame.uWorld, point.xMm)),
        scaleVector(frame.vWorld, point.yMm)
      )
    );

    addAnnotation({
      ...createAnnotationBase("freehandRoi", frame),
      worldPoints,
    });
    setStatus(`ROI pasted into ${reconstruction.label}.`);
  }

  function translateAnnotationInPlane(annotation, sourceAnnotation, deltaXmm, deltaYmm) {
    if (sourceAnnotation.type === "brushRoi" && sourceAnnotation.mask) {
      annotation.mask = cloneBrushMask(sourceAnnotation.mask);
      annotation.mask.originXmm += deltaXmm;
      annotation.mask.originYmm += deltaYmm;
      annotation.worldPoints = sourceAnnotation.worldPoints.map((point) =>
        planePointToWorld(
          annotation.frame,
          worldToPlaneCoordinates(sourceAnnotation.frame, point).xMm + deltaXmm,
          worldToPlaneCoordinates(sourceAnnotation.frame, point).yMm + deltaYmm
        )
      );
      return;
    }

    if (isCircularRoiAnnotation(sourceAnnotation)) {
      const sourceGeometry = getCircularRoiGeometry(sourceAnnotation);
      if (sourceGeometry) {
        setCircularRoiGeometry(annotation, {
          centerXmm: sourceGeometry.centerXmm + deltaXmm,
          centerYmm: sourceGeometry.centerYmm + deltaYmm,
          radiusXmm: sourceGeometry.radiusXmm,
          radiusYmm: sourceGeometry.radiusYmm,
        });
        annotation.roiSourceTool = sourceAnnotation.roiSourceTool;
        return;
      }
    }

    const translation = addVectors(
      scaleVector(sourceAnnotation.frame.uWorld, deltaXmm),
      scaleVector(sourceAnnotation.frame.vWorld, deltaYmm)
    );
    annotation.worldPoints = sourceAnnotation.worldPoints.map((point) => addVectors(point, translation));
  }

  function setSquareProfileCorner(annotation, sourceAnnotation, cornerIndex, planePoint) {
    const sourceBox = getSquareProfilePlaneBox(sourceAnnotation);
    const corners = getSquareProfileCorners(sourceBox);
    const oppositeIndex = (cornerIndex + 2) % 4;
    const dragged = { xMm: planePoint.xMm, yMm: planePoint.yMm };
    const opposite = corners[oppositeIndex];
    annotation.worldPoints = [
      planePointToWorld(annotation.frame, dragged.xMm, dragged.yMm),
      planePointToWorld(annotation.frame, opposite.xMm, opposite.yMm),
    ];
  }

  function deleteSelectedAnnotation() {
    const reconstruction = getActiveReconstruction();
    const annotation = getSelectedAnnotation();
    if (!reconstruction || !annotation) {
      return false;
    }

    reconstruction.annotations = reconstruction.annotations.filter((item) => item.id !== annotation.id);
    if (state.selectedProfileAnnotationId === annotation.id) {
      state.selectedProfileAnnotationId = null;
    }
    state.selectedAnnotationId = null;
    updateMeasurementCount();
    updateProfilePanel();
    requestRenderAll();
    setStatus("Annotation deleted.");
    pushHistorySnapshot("Delete annotation");
    return true;
  }

  function syncMeasurementsToAllReconstructions() {
    const sourceReconstruction = getActiveReconstruction();
    if (!sourceReconstruction) {
      throw new Error("Load a reconstruction first.");
    }

    if (state.reconstructions.length < 2) {
      throw new Error("Load at least two reconstructions first.");
    }

    const sourceMeasurements = sourceReconstruction.annotations.filter((annotation) => MEASUREMENT_TYPES.has(annotation.type));
    if (!sourceMeasurements.length) {
      throw new Error("Create at least one measurement first.");
    }

    let updatedCount = 0;
    state.reconstructions.forEach((reconstruction) => {
      if (reconstruction.id === sourceReconstruction.id) {
        return;
      }

      const preservedAnnotations = reconstruction.annotations.filter((annotation) => !MEASUREMENT_TYPES.has(annotation.type));
      const syncedMeasurements = sourceMeasurements.map((annotation) =>
        cloneMeasurementToReconstruction(annotation, reconstruction)
      );
      reconstruction.annotations = [...preservedAnnotations, ...syncedMeasurements];
      updatedCount += 1;
    });

    updateMeasurementCount();
    updateProfilePanel();
    requestRenderAll();
    setStatus(`Copied ${sourceMeasurements.length} measurement${sourceMeasurements.length === 1 ? "" : "s"} from ${sourceReconstruction.label} to ${updatedCount} other reconstruction${updatedCount === 1 ? "" : "s"}.`);
    pushHistorySnapshot("Sync measurements");
  }

  function clearMeasurements() {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return;
    }
    state.dragging = null;
    state.polygonDraft = null;
    reconstruction.annotations = [];
    state.selectedAnnotationId = null;
    state.selectedProfileAnnotationId = null;
    updateMeasurementCount();
    updateProfilePanel();
    updateViewportCursors();
    requestRenderAll();
    pushHistorySnapshot("Clear measurements");
  }

  function clearStudy(options) {
    stopCine();
    state.reconstructions = [];
    state.sourceFiles = [];
    state.activeReconId = null;
    state.referenceBasis = null;
    state.dragging = null;
    state.polygonDraft = null;
    state.roiClipboard = null;
    state.selectedAnnotationId = null;
    state.selectedProfileAnnotationId = null;
    state.annotationSequence = 1;
    state.export.dialogOpen = false;
    state.export.pendingAction = "export";
    state.export.lastStudyId = "";
    state.backend.lastResult = null;
    state.backend.phase = "idle";
    resetCoronaryTracking({ preserveSettings: false });
    state.mpr.centerWorld = null;
    state.mpr.overlayVisible = true;
    state.mpr.rotations = {
      axial: 0,
      coronal: 0,
      sagittal: 0,
    };
    resetHistory();
    state.maximizedViewportId = null;
    state.currentVOI = { ...VOI_PRESETS.coronary };
    state.currentPreset = "coronary";
    setActiveViewport("presentation");
    resetViewportTransforms();
    updateEmptyState();
    updateSidebarUi();
    requestRenderAll();
    if (els.exportDialog) {
      els.exportDialog.hidden = true;
    }
    if (els.exportDialogError) {
      els.exportDialogError.hidden = true;
    }
    document.body.classList.remove("is-modal-open");
    setStatus(options?.statusMessage || "Ready for a coronary CTA stack");
  }

  function parseDicomHeader(file) {
    return file.arrayBuffer().then((buffer) => {
      const byteArray = new Uint8Array(buffer);
      const dataSet = dicomParser.parseDicom(byteArray, { untilTag: "x7fe00010" });
      const imageOrientationPatient = parseNumericArray(dataSet.string("x00200037"));
      const pixelDataElement = dataSet.elements.x7fe00010 || dataSet.elements.x7fe00008;

      return {
        file,
        transferSyntaxUID: safeString(dataSet.string("x00020010")),
        patientName: prettifyPatientName(dataSet.string("x00100010")),
        patientId: safeString(dataSet.string("x00100020")),
        studyDate: safeString(dataSet.string("x00080020")),
        studyTime: safeString(dataSet.string("x00080030")),
        acquisitionDate: safeString(dataSet.string("x00080022")),
        acquisitionTime: safeString(dataSet.string("x00080032")),
        contentDate: safeString(dataSet.string("x00080023")),
        contentTime: safeString(dataSet.string("x00080033")),
        modality: safeString(dataSet.string("x00080060")),
        seriesDescription: safeString(dataSet.string("x0008103e")),
        studyInstanceUID: safeString(dataSet.string("x0020000d")),
        seriesInstanceUID: safeString(dataSet.string("x0020000e")),
        frameOfReferenceUID: safeString(dataSet.string("x00200052")),
        instanceNumber: parseFirstNumber(dataSet.string("x00200013")),
        numberOfFrames: parseFirstNumber(dataSet.string("x00280008")),
        rows: parseFirstNumber(dataSet.string("x00280010")),
        columns: parseFirstNumber(dataSet.string("x00280011")),
        pixelSpacing: parseNumericArray(dataSet.string("x00280030")),
        sliceThickness: parseFirstNumber(dataSet.string("x00180050")),
        patientPosition: safeString(dataSet.string("x00185100")),
        imagePositionPatient: parseNumericArray(dataSet.string("x00200032")),
        imageOrientationPatient,
        rowDirection: normalize(imageOrientationPatient.slice(0, 3)),
        columnDirection: normalize(imageOrientationPatient.slice(3, 6)),
        normalVector: getNormalVector(imageOrientationPatient),
        windowCenter: parseFirstNumber(dataSet.string("x00281050")),
        windowWidth: parseFirstNumber(dataSet.string("x00281051")),
        rescaleIntercept: parseFirstNumber(dataSet.string("x00281052")),
        rescaleSlope: parseFirstNumber(dataSet.string("x00281053")),
        hasPixelData: Boolean(pixelDataElement),
      };
    });
  }

  async function parseDicomFiles(files) {
    const parsed = await Promise.all(
      files.map(async (file) => {
        try {
          return await parseDicomHeader(file);
        } catch (error) {
          return null;
        }
      })
    );
    return parsed.filter(Boolean);
  }

  function compareDicomRecords(a, b, normalVector) {
    if (normalVector && a.imagePositionPatient.length >= 3 && b.imagePositionPatient.length >= 3) {
      const positionA = dot(a.imagePositionPatient, normalVector);
      const positionB = dot(b.imagePositionPatient, normalVector);
      if (positionA !== positionB) {
        return positionA - positionB;
      }
    }

    if (Number.isFinite(a.instanceNumber) && Number.isFinite(b.instanceNumber) && a.instanceNumber !== b.instanceNumber) {
      return a.instanceNumber - b.instanceNumber;
    }

    return naturalCompare(a.file.name, b.file.name);
  }

  function groupSeries(records) {
    const grouped = new Map();
    records.forEach((record) => {
      const key =
        record.seriesInstanceUID ||
        `${record.seriesDescription || "unnamed-series"}::${record.frameOfReferenceUID || "unknown-for"}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(record);
    });

    return Array.from(grouped.entries())
      .map(([key, group]) => {
        const normalVector = group.find((item) => item.normalVector)?.normalVector ?? null;
        group.sort((left, right) => compareDicomRecords(left, right, normalVector));
        const pixelCount = group.filter((item) => item.hasPixelData).length;
        return { key, records: group, pixelCount };
      })
      .sort((left, right) => right.pixelCount - left.pixelCount || right.records.length - left.records.length);
  }

  function estimateSliceSpacing(records) {
    const normalVector = records.find((record) => record.normalVector)?.normalVector;
    const positions = normalVector
      ? records
          .map((record) =>
            record.imagePositionPatient.length >= 3 ? dot(record.imagePositionPatient, normalVector) : null
          )
          .filter(Number.isFinite)
      : [];

    if (positions.length >= 2) {
      const differences = [];
      for (let index = 1; index < positions.length; index += 1) {
        const delta = Math.abs(positions[index] - positions[index - 1]);
        if (delta > 0) {
          differences.push(delta);
        }
      }
      if (differences.length) {
        return differences.reduce((sum, value) => sum + value, 0) / differences.length;
      }
    }

    return records[0]?.sliceThickness || 1;
  }

  function cloneTypedArray(values) {
    if (values instanceof Int16Array) {
      return new Int16Array(values);
    }
    if (values instanceof Uint16Array) {
      return new Uint16Array(values);
    }
    if (values instanceof Int8Array) {
      return new Int16Array(values);
    }
    if (values instanceof Uint8Array) {
      return new Uint16Array(values);
    }
    return new Uint16Array(values || []);
  }

  async function decodePixelDataWithCornerstone(record) {
    initializeDecoderFallback();
    if (!state.decoderFallbackReady) {
      throw new Error("Compressed DICOM decoding is not available in this viewer build.");
    }

    const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(record.file);
    try {
      const image = await cornerstone.loadAndCacheImage(imageId);
      const pixelData = image.getPixelData?.();
      if (!pixelData || !Number.isFinite(image.rows) || !Number.isFinite(image.columns)) {
        throw new Error("The selected file could not be decoded into image pixels.");
      }
      if (image.color) {
        throw new Error("Only monochrome DICOM images are supported.");
      }

      return {
        rows: image.rows,
        columns: image.columns,
        pixels: cloneTypedArray(pixelData),
        slope: Number.isFinite(image.slope) ? image.slope : record.rescaleSlope ?? 1,
        intercept: Number.isFinite(image.intercept) ? image.intercept : record.rescaleIntercept ?? 0,
      };
    } finally {
      cornerstoneWADOImageLoader.wadouri.fileManager.remove?.(imageId);
    }
  }

  async function parsePixelData(record) {
    const byteArray = new Uint8Array(await record.file.arrayBuffer());
    const dataSet = dicomParser.parseDicom(byteArray);
    const transferSyntaxUID = safeString(dataSet.string("x00020010"));

    if (Number.isFinite(record.numberOfFrames) && record.numberOfFrames > 1) {
      throw new Error("Multi-frame DICOM is not supported in this local MPR viewer yet.");
    }

    const rows = parseFirstNumber(dataSet.string("x00280010"));
    const columns = parseFirstNumber(dataSet.string("x00280011"));
    const samplesPerPixel = parseFirstNumber(dataSet.string("x00280002")) || 1;
    const bitsAllocated = parseFirstNumber(dataSet.string("x00280100")) || 16;
    const pixelRepresentation = parseFirstNumber(dataSet.string("x00280103")) || 0;
    const pixelDataElement = dataSet.elements.x7fe00010;

    if (!SUPPORTED_TRANSFER_SYNTAXES.has(transferSyntaxUID || "") || pixelDataElement?.fragments?.length) {
      return decodePixelDataWithCornerstone(record);
    }

    if (samplesPerPixel !== 1) {
      throw new Error("Only monochrome DICOM images are supported.");
    }

    if (!pixelDataElement || !Number.isFinite(rows) || !Number.isFinite(columns)) {
      return decodePixelDataWithCornerstone(record);
    }

    const sampleCount = rows * columns;
    const byteOffset = byteArray.byteOffset + pixelDataElement.dataOffset;
    let pixels;

    if (bitsAllocated === 16) {
      const view =
        pixelRepresentation === 1
          ? new Int16Array(byteArray.buffer, byteOffset, sampleCount)
          : new Uint16Array(byteArray.buffer, byteOffset, sampleCount);
      pixels = pixelRepresentation === 1 ? new Int16Array(sampleCount) : new Uint16Array(sampleCount);
      pixels.set(view);
    } else if (bitsAllocated === 8) {
      const view =
        pixelRepresentation === 1
          ? new Int8Array(byteArray.buffer, byteOffset, sampleCount)
          : new Uint8Array(byteArray.buffer, byteOffset, sampleCount);
      pixels = pixelRepresentation === 1 ? new Int16Array(sampleCount) : new Uint16Array(sampleCount);
      for (let index = 0; index < sampleCount; index += 1) {
        pixels[index] = view[index];
      }
    } else {
      throw new Error(`Unsupported Bits Allocated value: ${bitsAllocated}`);
    }

    return {
      rows,
      columns,
      pixels,
      slope: parseFirstNumber(dataSet.string("x00281053")) ?? record.rescaleSlope ?? 1,
      intercept: parseFirstNumber(dataSet.string("x00281052")) ?? record.rescaleIntercept ?? 0,
    };
  }

  async function buildVolume(records) {
    const slices = [];
    let skippedCount = 0;
    const rowSpacing = records[0]?.pixelSpacing?.[0] || 1;
    const columnSpacing = records[0]?.pixelSpacing?.[1] || 1;
    const sliceSpacing = estimateSliceSpacing(records);
    let rows = null;
    let columns = null;

    for (let index = 0; index < records.length; index += 1) {
      if (index === 0 || index === records.length - 1 || index % 10 === 0) {
        setStatus(`Loading volume ${index + 1} / ${records.length}...`);
      }

      let slice;
      try {
        slice = await parsePixelData(records[index]);
      } catch (error) {
        skippedCount += 1;
        continue;
      }

      rows = rows ?? slice.rows;
      columns = columns ?? slice.columns;
      if (slice.rows !== rows || slice.columns !== columns) {
        skippedCount += 1;
        continue;
      }

      slices.push(slice);
      if ((index + 1) % 8 === 0) {
        await waitForAnimationFrame();
      }
    }

    if (!slices.length) {
      throw new Error("No usable image slices could be decoded from the selected files.");
    }

    const firstRecord = records[0];
    const originWorld =
      firstRecord.imagePositionPatient.length >= 3 ? cloneVector(firstRecord.imagePositionPatient) : [0, 0, 0];
    const rowDirection = normalize(firstRecord.rowDirection || [1, 0, 0]);
    const columnDirection = normalize(firstRecord.columnDirection || [0, 1, 0]);
    const normalDirection = normalize(firstRecord.normalVector || [0, 0, 1]);

    const centerWorld = addVectors(
      addVectors(
        addVectors(originWorld, scaleVector(rowDirection, columnSpacing * (columns - 1) / 2)),
        scaleVector(columnDirection, rowSpacing * (rows - 1) / 2)
      ),
      scaleVector(normalDirection, sliceSpacing * (slices.length - 1) / 2)
    );

    return {
      rows,
      columns,
      depth: slices.length,
      rowSpacing,
      columnSpacing,
      sliceSpacing,
      slices,
      rowDirection,
      columnDirection,
      normalDirection,
      originWorld,
      centerWorld,
      skippedCount,
    };
  }

  function makeReconstructionId(seriesKey, offset) {
    return `${sanitizeFilePart(seriesKey, "series")}_${offset}`;
  }

  function buildReconstructionLabel(records, offset) {
    const first = records[0];
    const base = first.seriesDescription || `Series ${offset + 1}`;
    return base;
  }

  async function loadReconstructionsFromFiles(fileList, options) {
    const files = Array.from(fileList || []).filter((file) => file.size > 0);
    if (!files.length) {
      return;
    }

    stopCine();
    setStatus(`Reading ${files.length} files...`);
    const records = await parseDicomFiles(files);
    if (!records.length) {
      throw new Error("No readable DICOM files were found.");
    }

    const groups = groupSeries(records);
    const existingKeys = new Set(state.reconstructions.map((reconstruction) => reconstruction.seriesKey));
    const nextReconstructions = [];

    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      if (!group.pixelCount) {
        continue;
      }

      if (options?.append && existingKeys.has(group.key)) {
        continue;
      }

      const imageRecords = group.records.filter((record) => record.hasPixelData);
      const volume = await buildVolume(imageRecords);
      nextReconstructions.push({
        id: makeReconstructionId(group.key, state.reconstructions.length + index),
        seriesKey: group.key,
        label: buildReconstructionLabel(imageRecords, state.reconstructions.length + index),
        records: imageRecords,
        volume,
        annotations: [],
      });
    }

    if (!nextReconstructions.length) {
      throw new Error("No usable reconstructions were found in the selected files.");
    }

    if (!options?.append) {
      state.reconstructions = [];
      state.sourceFiles = files.slice();
      state.referenceBasis = null;
      state.annotationSequence = 1;
      state.roiClipboard = null;
      state.selectedAnnotationId = null;
      state.backend.lastResult = null;
      state.backend.phase = "idle";
      resetCoronaryTracking({ preserveSettings: true });
    } else {
      state.sourceFiles.push(...files);
    }

    state.reconstructions.push(...nextReconstructions);
    if (!state.referenceBasis) {
      const referenceVolume = state.reconstructions[0].volume;
      state.referenceBasis = {
        row: cloneVector(referenceVolume.rowDirection),
        column: cloneVector(referenceVolume.columnDirection),
        normal: cloneVector(referenceVolume.normalDirection),
      };
    }

    if (!state.mpr.centerWorld) {
      state.mpr.centerWorld = cloneVector(state.reconstructions[0].volume.centerWorld);
    }

    if (!state.activeReconId) {
      state.activeReconId = state.reconstructions[0].id;
    }

    if (options?.append) {
      setActiveReconstruction(nextReconstructions[0].id);
      setStatus(`Added ${nextReconstructions.length} reconstruction${nextReconstructions.length === 1 ? "" : "s"}.`);
    } else {
      setActiveReconstruction(state.reconstructions[0].id);
      state.currentVOI = determineInitialVoi(state.reconstructions[0].records);
      state.currentPreset = null;
      updateSidebarUi();
      setStatus(`Loaded ${state.reconstructions.length} reconstruction${state.reconstructions.length === 1 ? "" : "s"} for this patient.`);
    }

    updateEmptyState();
    requestRenderAll();
    if (!options?.append) {
      resetHistory();
    }
    pushHistorySnapshot(options?.append ? "Add reconstruction" : "Load study");
  }

  function pointsAreNear(left, right, toleranceMm) {
    return vectorLength(subtractVectors(left, right)) <= toleranceMm;
  }

  function finalizePolygonDraft(viewportId, worldPoint) {
    if (!state.polygonDraft || state.polygonDraft.viewportId !== viewportId) {
      return;
    }

    let points = state.polygonDraft.worldPoints.slice();
    const lastPoint = points[points.length - 1];
    if (worldPoint && !pointsAreNear(lastPoint, worldPoint, 0.75)) {
      points.push(worldPoint);
    }

    if (points.length >= 3) {
      const sourceTool = state.polygonDraft.sourceTool || "freehandRoi";
      if (sourceTool === "segmentationRoi") {
        points = buildSegmentationRoiWorldPoints(state.polygonDraft.frame, points);
      } else if (sourceTool === "freehandRoi") {
        points = buildFreehandRoiWorldPoints(state.polygonDraft.frame, points);
      }
      addAnnotation({
        ...createAnnotationBase("freehandRoi", state.polygonDraft.frame),
        roiSourceTool: sourceTool,
        worldPoints: points,
      });
    }

    state.polygonDraft = null;
    requestRenderAll();
  }

  function handleProfileChartPointerMovePreview(event) {
    if (state.dragging?.type === "profileGuide") {
      els.profileChart.style.cursor = "ew-resize";
      return;
    }
    const hit = getProfileChartGuideHit(event.clientX, event.clientY);
    els.profileChart.style.cursor = hit ? "ew-resize" : "default";
  }

  function handleProfileChartPointerDown(event) {
    const annotation = getActiveProfileAnnotation();
    const chartState = state.profileChartState;
    const hit = getProfileChartGuideHit(event.clientX, event.clientY);
    if (!annotation || !chartState?.profile?.stent || !hit) {
      return;
    }

    event.preventDefault();
    els.profileChart.setPointerCapture?.(event.pointerId);
    state.dragging = {
      type: "profileGuide",
      pointerId: event.pointerId,
      annotationId: annotation.id,
      guideKey: hit.key,
    };
    els.profileChart.style.cursor = "ew-resize";
  }

  function getCanvasLocalPoint(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      width: rect.width || canvas.width || 1,
      height: rect.height || canvas.height || 1,
    };
  }

  function handleCoronaryLongitudinalPointerDown(event) {
    const vessel = getActiveCoronaryVessel();
    if (!vessel?.centerline?.length) {
      return;
    }
    const local = getCanvasLocalPoint(event.currentTarget, event.clientX, event.clientY);
    const ratio = clamp(local.x / Math.max(1, local.width), 0, 1);
    setActiveCoronarySampleIndex(ratio * (vessel.centerline.length - 1));
  }

  function getCoronaryControlPointHit(viewportId, clientX, clientY) {
    const reconstruction = getActiveReconstruction();
    const vessel = getActiveCoronaryVessel();
    const viewportState = state.viewports[viewportId];
    if (!reconstruction || !vessel || vessel.backendSource || !vessel.seedPoints?.length || !viewportState?.lastGeometry) {
      return null;
    }

    const frame = viewportState.lastFrame || getViewportFrame(viewportId, reconstruction);
    if (!frame) {
      return null;
    }

    const local = getCanvasLocalPoint(viewportState.canvas, clientX, clientY);
    let bestHit = null;
    vessel.seedPoints.forEach((worldPoint, pointIndex) => {
      const renderWorldPoint =
        state.dragging?.type === "coronaryControlPointEdit" &&
        state.dragging.vesselId === vessel.id &&
        state.dragging.pointIndex === pointIndex &&
        state.dragging.pendingWorldPoint
          ? state.dragging.pendingWorldPoint
          : worldPoint;
      const projected = projectWorldPointToCanvas(frame, viewportState.lastGeometry, renderWorldPoint);
      const distancePx = Math.hypot(local.x - projected.x, local.y - projected.y);
      if (distancePx > 12 && (!bestHit || distancePx >= bestHit.distancePx)) {
        return;
      }
      if (!bestHit || distancePx < bestHit.distancePx) {
        bestHit = {
          vessel,
          pointIndex,
          distancePx,
          worldPoint: cloneVector(worldPoint),
        };
      }
    });
    return bestHit && bestHit.distancePx <= 12 ? bestHit : null;
  }

  function getCrossSectionPointerPoint(clientX, clientY) {
    const geometry = state.coronary.lastCrossSectionGeometry;
    if (!geometry || !els.coronaryCrossSectionCanvas) {
      return null;
    }
    const local = getCanvasLocalPoint(els.coronaryCrossSectionCanvas, clientX, clientY);
    const xMm = (local.x - geometry.centerX) / geometry.scale;
    const yMm = (geometry.centerY - local.y) / geometry.scale;
    return {
      localX: local.x,
      localY: local.y,
      xMm,
      yMm,
      radiusMm: Math.hypot(xMm, yMm),
      geometry,
    };
  }

  function handleCoronaryCrossSectionPointerDown(event) {
    const vessel = getActiveCoronaryVessel();
    const sample = getActiveCoronarySample();
    const point = getCrossSectionPointerPoint(event.clientX, event.clientY);
    if (!vessel || !sample || !point) {
      return;
    }

    const centerDistancePx = Math.hypot(
      point.localX - point.geometry.centerX,
      point.localY - point.geometry.centerY
    );
    const radiusDistancePx = Math.hypot(
      point.localX - point.geometry.radiusHandleX,
      point.localY - point.geometry.radiusHandleY
    );

    if (centerDistancePx <= 14) {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      state.dragging = {
        type: "coronaryCenterEdit",
        pointerId: event.pointerId,
        vesselId: vessel.id,
        sampleIndex: state.coronary.activeSampleIndex,
        startPoint: point,
        sourceWorld: cloneVector(sample.world),
        sourceNormal: cloneVector(sample.normal),
        sourceBinormal: cloneVector(sample.binormal),
      };
      return;
    }

    if (radiusDistancePx <= 14 || Math.abs(point.radiusMm - sample.meanRadiusMm) <= 1.1) {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      state.dragging = {
        type: "coronaryRadiusEdit",
        pointerId: event.pointerId,
        vesselId: vessel.id,
        sampleIndex: state.coronary.activeSampleIndex,
        startRadiusMm: point.radiusMm,
        sourceRadiiMm: sample.radiiMm.slice(),
      };
    }
  }

  function handleViewportPointerMovePreview(event) {
    if (state.dragging?.type === "freehandRoi") {
      return;
    }

    if (!state.polygonDraft || state.activeToolKey !== "segmentationRoi") {
      if (state.activeToolKey === "eraser") {
        const viewportId = event.currentTarget.dataset.viewportId;
        updateEraserPreview(viewportId, event.clientX, event.clientY);
        requestRenderAll();
      }
      if (state.activeToolKey === "edit" && !state.dragging) {
        const viewportId = event.currentTarget.dataset.viewportId;
        const viewportState = state.viewports[viewportId];
        const controlPointHit = getCoronaryControlPointHit(viewportId, event.clientX, event.clientY);
        const hit = getAnnotationHit(viewportId, event.clientX, event.clientY);
        viewportState.canvas.style.cursor =
          controlPointHit
            ? "move"
            : hit?.mode === "move"
            ? "move"
            : hit?.mode === "circleRadius"
              ? "ew-resize"
            : hit?.mode === "point" || hit?.mode === "roiVertex" || hit?.mode === "squareCorner"
              ? "crosshair"
              : "default";
        return;
      }
      if (state.activeToolKey === "circularRoi" && !state.dragging) {
        const viewportId = event.currentTarget.dataset.viewportId;
        const viewportState = state.viewports[viewportId];
        const hit = getAnnotationHit(viewportId, event.clientX, event.clientY);
        viewportState.canvas.style.cursor =
          hit?.annotation && isCircularRoiAnnotation(hit.annotation)
            ? hit.mode === "circleRadius"
              ? "ew-resize"
              : "move"
            : "crosshair";
        return;
      }
      if (state.activeToolKey === "mprCursor" && !state.dragging) {
        const viewportId = event.currentTarget.dataset.viewportId;
        const viewportState = state.viewports[viewportId];
        const hit = getMprOverlayHit(viewportId, event.clientX, event.clientY);
        viewportState.canvas.style.cursor = hit?.type === "line" ? "alias" : hit?.type === "center" ? "move" : "grab";
      }
      return;
    }

    const viewportId = event.currentTarget.dataset.viewportId;
    if (state.polygonDraft.viewportId !== viewportId) {
      return;
    }

    const worldPoint = canvasToWorldPoint(viewportId, event.clientX, event.clientY);
    if (!worldPoint) {
      return;
    }

    state.polygonDraft.hoverWorld = worldPoint;
    requestRenderAll();
  }

  function handleViewportClick(event) {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction || state.activeToolKey !== "segmentationRoi") {
      return;
    }

    const viewportId = event.currentTarget.dataset.viewportId;
    const frame = state.viewports[viewportId]?.lastFrame || getViewportFrame(viewportId, reconstruction);
    const worldPoint = canvasToWorldPoint(viewportId, event.clientX, event.clientY);
    if (!worldPoint || !frame) {
      return;
    }

    setActiveViewport(viewportId);
    if (
      !state.polygonDraft ||
      state.polygonDraft.viewportId !== viewportId ||
      state.polygonDraft.reconstructionId !== reconstruction.id ||
      state.polygonDraft.plane !== frame.plane ||
      dot(state.polygonDraft.frame.nWorld, frame.nWorld) < 0.992
    ) {
      state.polygonDraft = {
        viewportId,
        reconstructionId: reconstruction.id,
        plane: frame.plane,
        frame: cloneFrame(frame),
        sourceTool: "segmentationRoi",
        worldPoints: [worldPoint],
        hoverWorld: worldPoint,
      };
    } else if (!pointsAreNear(state.polygonDraft.worldPoints[state.polygonDraft.worldPoints.length - 1], worldPoint, 0.5)) {
      state.polygonDraft.worldPoints.push(worldPoint);
      state.polygonDraft.hoverWorld = worldPoint;
    }

    requestRenderAll();
  }

  function handleViewportDoubleClick(event) {
    const viewportId = event.currentTarget.dataset.viewportId;
    if (state.activeToolKey === "coronarySeed" && state.coronary.draftSeedPoints.length >= 2) {
      event.preventDefault();
      try {
        finishCoronaryDraft();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Coronary segmentation failed.", "error");
      }
      return;
    }

    if (state.activeToolKey === "edit") {
      const hit = getAnnotationHit(viewportId, event.clientX, event.clientY);
      const annotation = hit?.annotation || getSelectedAnnotation();
      if (annotation?.type === "text") {
        event.preventDefault();
        setSelectedAnnotation(annotation.id);
        const updatedText = window.prompt("Edit text label", annotation.text || "");
        if (updatedText && updatedText.trim()) {
          annotation.text = updatedText.trim();
          updateProfilePanel();
          requestRenderAll();
          setStatus("Text label updated.");
          pushHistorySnapshot("Edit text label");
        }
        return;
      }
    }

    if (state.activeToolKey !== "segmentationRoi" || !state.polygonDraft) {
      if (toggleViewportFocus(viewportId)) {
        event.preventDefault();
      }
      return;
    }

    event.preventDefault();
    const worldPoint = canvasToWorldPoint(viewportId, event.clientX, event.clientY);
    finalizePolygonDraft(viewportId, worldPoint);
  }

  function isValidDragAnnotation(annotation) {
    if (!annotation) {
      return false;
    }
    if (annotation.type === "brushRoi") {
      return countBrushMaskCells(annotation.mask) > 0;
    }
    if (annotation.type === "length" || annotation.type === "arrow" || annotation.type === "lineProfile") {
      return vectorLength(subtractVectors(annotation.worldPoints[0], annotation.worldPoints[1])) > 0.5;
    }
    if (annotation.type === "squareProfile") {
      const box = getSquareProfilePlaneBox(annotation);
      return box.widthMm > 0.5 && box.heightMm > 0.5;
    }
    if (annotation.type === "freehandRoi") {
      const planePoints = getFreehandPlanePoints(annotation);
      return planePoints.length >= 3 && getPolygonAreaMm2(planePoints) > 0.8;
    }
    return true;
  }

  function registerRightClickTap(context) {
    const previousTap = state.rightClick.lastTap;
    const now = performance.now();
    state.rightClick.lastTap = {
      viewportId: context.viewportId,
      time: now,
      clientX: context.clientX,
      clientY: context.clientY,
    };
    return Boolean(
      previousTap &&
      previousTap.viewportId === context.viewportId &&
      now - previousTap.time <= RIGHT_CLICK_DOUBLE_MS &&
      Math.hypot(context.clientX - previousTap.clientX, context.clientY - previousTap.clientY) <= 18
    );
  }

  function toggleMprOverlayVisibility(forceVisible) {
    const nextVisible =
      typeof forceVisible === "boolean" ? forceVisible : state.mpr.overlayVisible === false;
    state.mpr.overlayVisible = nextVisible;
    updateMprUi();
    requestRenderAll();
    setStatus(nextVisible ? "MPR coordinate crosses shown." : "MPR coordinate crosses hidden.");
  }

  function handleViewportPointerDown(event) {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return;
    }

    const viewportId = event.currentTarget.dataset.viewportId;
    const viewportState = state.viewports[viewportId];
    const frame = viewportState.lastFrame || getViewportFrame(viewportId, reconstruction);
    const worldPoint = canvasToWorldPoint(viewportId, event.clientX, event.clientY);

    setActiveViewport(viewportId);
    focusWithoutScrolling(event.currentTarget.closest(".viewport-panel"));

    if (event.button === 2) {
      const isDoubleRightTap = registerRightClickTap({
        viewportId,
        clientX: event.clientX,
        clientY: event.clientY,
      });
      if (state.layout === "mpr" && isDoubleRightTap) {
        event.preventDefault();
        toggleMprOverlayVisibility();
        return;
      }
      const plane = getViewportPlane(viewportId);
      const metrics = getPlaneMetrics(reconstruction.volume, plane);
      viewportState.pointerId = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      state.dragging = {
        type: "rightScroll",
        viewportId,
        plane,
        startClientY: event.clientY,
        startIndex: getReadoutIndex(reconstruction, plane),
        maxIndex: Math.max(0, (metrics?.count ?? 1) - 1),
        scrubHeightPx: Math.max(80, event.currentTarget.getBoundingClientRect().height * RIGHT_DRAG_SCRUB_HEIGHT_FACTOR),
      };
      updateViewportCursors();
      return;
    }

    if (event.button === 1) {
      viewportState.pointerId = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      state.dragging = {
        type: "pan",
        viewportId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: viewportState.panX,
        startPanY: viewportState.panY,
        source: "middleMouse",
      };
      updateViewportCursors();
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (state.activeToolKey === "coronarySeed") {
      if (!worldPoint || !frame) {
        return;
      }
      addCoronarySeedPoint(viewportId, frame, worldPoint);
      return;
    }

    if (state.activeToolKey === "edit") {
      const controlPointHit = getCoronaryControlPointHit(viewportId, event.clientX, event.clientY);
      if (controlPointHit) {
        viewportState.pointerId = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const activeSampleRatio = controlPointHit.vessel.centerline.length > 1
          ? state.coronary.activeSampleIndex / (controlPointHit.vessel.centerline.length - 1)
          : 0;
        state.dragging = {
          type: "coronaryControlPointEdit",
          viewportId,
          vesselId: controlPointHit.vessel.id,
          pointIndex: controlPointHit.pointIndex,
          sourceSeedPoints: cloneWorldPoints(controlPointHit.vessel.seedPoints),
          pendingWorldPoint: cloneVector(controlPointHit.worldPoint),
          activeSampleRatio,
        };
        setStatus("Drag the coronary control point, then release to rebuild the vessel track.");
        requestRenderAll();
        return;
      }
      const hit = getAnnotationHit(viewportId, event.clientX, event.clientY);
      if (!hit) {
        setSelectedAnnotation(null);
        updateProfilePanel();
        requestRenderAll();
        return;
      }

      setSelectedAnnotation(hit.annotation.id);
      viewportState.pointerId = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      state.dragging = {
        type: "editAnnotation",
        viewportId,
        annotationId: hit.annotation.id,
        mode: hit.mode,
        pointIndex: hit.pointIndex,
        cornerIndex: hit.cornerIndex,
        startPlanePoint: canvasToPlanePoint(viewportId, event.clientX, event.clientY),
        sourceAnnotation: cloneAnnotation(hit.annotation),
      };
      updateProfilePanel();
      updateViewportCursors();
      requestRenderAll();
      return;
    }

    if (state.activeToolKey === "circularRoi") {
      const hit = getAnnotationHit(viewportId, event.clientX, event.clientY);
      if (hit?.annotation && isCircularRoiAnnotation(hit.annotation)) {
        setSelectedAnnotation(hit.annotation.id);
        viewportState.pointerId = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        state.dragging = {
          type: "editAnnotation",
          viewportId,
          annotationId: hit.annotation.id,
          mode: hit.mode,
          pointIndex: hit.pointIndex,
          cornerIndex: hit.cornerIndex,
          startPlanePoint: canvasToPlanePoint(viewportId, event.clientX, event.clientY),
          sourceAnnotation: cloneAnnotation(hit.annotation),
        };
        updateProfilePanel();
        updateViewportCursors();
        requestRenderAll();
        return;
      }
      const planePoint = canvasToPlanePoint(viewportId, event.clientX, event.clientY);
      if (!planePoint) {
        return;
      }
      viewportState.pointerId = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      const minRadiusMm = getMinimumCircularRoiRadiusMm(frame);
      state.dragging = {
        type: "circularRoi",
        viewportId,
        frame: cloneFrame(frame),
        centerPlanePoint: planePoint,
        startClientX: event.clientX,
        startClientY: event.clientY,
        maxPointerDistancePx: 0,
        annotation: {
          ...createAnnotationBase("freehandRoi", frame),
          roiSourceTool: "circularRoi",
          ellipse: {
            centerXmm: planePoint.xMm,
            centerYmm: planePoint.yMm,
            radiusXmm: minRadiusMm,
            radiusYmm: minRadiusMm,
          },
          worldPoints: createEllipseWorldPoints(frame, planePoint, minRadiusMm, minRadiusMm, CIRCULAR_ROI_SEGMENTS),
        },
      };
      requestRenderAll();
      return;
    }

    if (state.activeToolKey === "probe") {
      if (!worldPoint) {
        return;
      }

      addAnnotation({
        ...createAnnotationBase("probe", frame),
        worldPoints: [worldPoint],
      });
      return;
    }

    if (state.activeToolKey === "text") {
      if (!worldPoint) {
        return;
      }

      const text = window.prompt("Enter the text label");
      if (!text || !text.trim()) {
        return;
      }

      addAnnotation({
        ...createAnnotationBase("text", frame),
        worldPoints: [worldPoint],
        text: text.trim(),
      });
      return;
    }

    if (state.activeToolKey === "freehandRoi") {
      if (!worldPoint) {
        return;
      }
      viewportState.pointerId = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      state.polygonDraft = {
        viewportId,
        reconstructionId: reconstruction.id,
        plane: frame.plane,
        frame: cloneFrame(frame),
        sourceTool: "freehandRoi",
        worldPoints: [worldPoint],
        hoverWorld: null,
      };
      state.dragging = {
        type: "freehandRoi",
        viewportId,
        sampleDistanceMm: getFreehandSampleDistanceMm(frame),
      };
      requestRenderAll();
      return;
    }

    if (isPolygonDraftTool(state.activeToolKey)) {
      return;
    }

    if (state.activeToolKey === "contourCorrect") {
      const planePoint = canvasToPlanePoint(viewportId, event.clientX, event.clientY);
      let annotation = getSelectedAnnotation();
      if ((!annotation || annotation.type !== "freehandRoi" || !isAnnotationVisible(annotation, frame)) && planePoint) {
        const hit = getAnnotationHit(viewportId, event.clientX, event.clientY);
        if (hit?.annotation?.type === "freehandRoi") {
          annotation = hit.annotation;
          setSelectedAnnotation(annotation.id);
        } else {
          annotation = getAdjustableRoiNearPlanePoint(viewportId, planePoint);
          if (annotation) {
            setSelectedAnnotation(annotation.id);
          }
        }
      }
      if (!annotation || annotation.type !== "freehandRoi" || !planePoint) {
        return;
      }
      viewportState.pointerId = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      state.contourCorrectionDraft = {
        annotationId: annotation.id,
        viewportId,
        plane: frame.plane,
        frame: cloneFrame(frame),
        planePoints: [{ x: planePoint.xMm, y: planePoint.yMm }],
      };
      state.dragging = {
        type: "contourCorrect",
        viewportId,
        annotationId: annotation.id,
      };
      requestRenderAll();
      return;
    }

    if (state.activeToolKey === "brushRoi") {
      const planePoint = canvasToPlanePoint(viewportId, event.clientX, event.clientY);
      if (!planePoint) {
        return;
      }

      let annotation = null;
      const hit = getAnnotationHit(viewportId, event.clientX, event.clientY);
      if (hit?.annotation?.type === "brushRoi") {
        annotation = hit.annotation;
      } else {
        const selected = getSelectedAnnotation();
        if (selected?.type === "brushRoi" && isAnnotationVisible(selected, frame) && pointInBrushMask(selected, planePoint.xMm, planePoint.yMm)) {
          annotation = selected;
        }
      }

      if (!annotation) {
        annotation = createBrushRoiAnnotation(frame, planePoint);
        addAnnotation(annotation);
      }

      annotation.thresholds = normalizeBrushThresholds(state.brushRoi.minHu, state.brushRoi.maxHu);
      annotation.brushSizeMm = clampBrushSizeMm(state.brushRoi.sizeMm);
      paintBrushStroke(annotation, reconstruction, planePoint, planePoint);
      setSelectedAnnotation(annotation.id);
      viewportState.pointerId = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      state.dragging = {
        type: "brushRoiPaint",
        viewportId,
        annotationId: annotation.id,
        lastPlanePoint: planePoint,
      };
      requestRenderAll();
      return;
    }

    if (state.activeToolKey === "eraser") {
      const planePoint = canvasToPlanePoint(viewportId, event.clientX, event.clientY);
      if (!planePoint) {
        return;
      }
      updateEraserPreview(viewportId, event.clientX, event.clientY);
      viewportState.pointerId = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      eraseStroke(viewportId, reconstruction, frame, planePoint, planePoint, state.eraser.sizeMm / 2);
      state.dragging = {
        type: "eraser",
        viewportId,
        frame: cloneFrame(frame),
        lastPlanePoint: planePoint,
      };
      requestRenderAll();
      return;
    }

    if (
      (state.activeToolKey === "length" ||
        state.activeToolKey === "arrow" ||
        state.activeToolKey === "lineProfile" ||
        state.activeToolKey === "squareProfile") &&
      !worldPoint
    ) {
      return;
    }

    if (state.activeToolKey === "mprCursor") {
      const hit = getMprOverlayHit(viewportId, event.clientX, event.clientY);
      if (hit?.type === "line") {
        viewportState.pointerId = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        state.dragging = {
          type: "mprRotate",
          viewportId,
          planeName: hit.planeName,
          referenceLinePlaneName: hit.planeName,
          startAngleRadians: hit.angleRadians,
          startRotation: state.mpr.rotations[hit.planeName],
        };
        updateViewportCursors();
        return;
      }

      if (!worldPoint) {
        return;
      }

      viewportState.pointerId = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const startCenterWorld = cloneVector(state.mpr.centerWorld || worldPoint);
      state.dragging = {
        type: "mprCenter",
        viewportId,
        centerOffsetWorld: subtractVectors(startCenterWorld, worldPoint),
      };
      updateViewportCursors();
      requestRenderAll();
      return;
    }

    viewportState.pointerId = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();

    if (state.activeToolKey === "windowLevel") {
      state.dragging = {
        type: "windowLevel",
        viewportId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startVOI: { ...state.currentVOI },
      };
      return;
    }

    if (state.activeToolKey === "pan") {
      state.dragging = {
        type: "pan",
        viewportId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: viewportState.panX,
        startPanY: viewportState.panY,
      };
      updateViewportCursors();
      return;
    }

    if (state.activeToolKey === "zoom") {
      state.dragging = {
        type: "zoom",
        viewportId,
        startClientY: event.clientY,
        startZoom: viewportState.zoom,
      };
      return;
    }

    if (
      state.activeToolKey === "length" ||
      state.activeToolKey === "arrow" ||
      state.activeToolKey === "lineProfile" ||
      state.activeToolKey === "squareProfile"
    ) {
      state.dragging = {
        type: "annotation",
        viewportId,
        annotation: {
          ...createAnnotationBase(state.activeToolKey, frame),
          worldPoints: [worldPoint, worldPoint],
        },
      };
      requestRenderAll();
    }
  }

  function handleGlobalPointerMove(event) {
    if (!state.dragging) {
      return;
    }

    if (state.dragging.type === "rightScroll") {
      const dragDeltaY = event.clientY - state.dragging.startClientY;
      const normalized = dragDeltaY / state.dragging.scrubHeightPx;
      const targetIndex = clamp(
        Math.round(state.dragging.startIndex + normalized * state.dragging.maxIndex),
        0,
        state.dragging.maxIndex
      );
      setPlaneIndex(state.dragging.plane, targetIndex);
      return;
    }

    if (state.dragging.type === "circularRoi") {
      const planePoint = canvasToPlanePoint(state.dragging.viewportId, event.clientX, event.clientY);
      if (!planePoint) {
        return;
      }
      const deltaX = event.clientX - state.dragging.startClientX;
      const deltaY = event.clientY - state.dragging.startClientY;
      state.dragging.maxPointerDistancePx = Math.max(
        state.dragging.maxPointerDistancePx || 0,
        Math.hypot(deltaX, deltaY)
      );
      const radiusMm = Math.max(
        getMinimumCircularRoiRadiusMm(state.dragging.frame),
        Math.hypot(
          planePoint.xMm - state.dragging.centerPlanePoint.xMm,
          planePoint.yMm - state.dragging.centerPlanePoint.yMm
        )
      );
      state.dragging.annotation.worldPoints = createEllipseWorldPoints(
        state.dragging.frame,
        state.dragging.centerPlanePoint,
        radiusMm,
        radiusMm,
        CIRCULAR_ROI_SEGMENTS
      );
      state.dragging.annotation.ellipse = {
        centerXmm: state.dragging.centerPlanePoint.xMm,
        centerYmm: state.dragging.centerPlanePoint.yMm,
        radiusXmm: radiusMm,
        radiusYmm: radiusMm,
      };
      requestRenderAll();
      return;
    }

    if (state.dragging.type === "freehandRoi") {
      const draft = state.polygonDraft;
      const worldPoint = canvasToWorldPoint(state.dragging.viewportId, event.clientX, event.clientY);
      if (!draft || draft.viewportId !== state.dragging.viewportId || !worldPoint) {
        return;
      }
      const lastPoint = draft.worldPoints[draft.worldPoints.length - 1];
      if (!lastPoint || !pointsAreNear(lastPoint, worldPoint, state.dragging.sampleDistanceMm || FREEHAND_ROI_SAMPLE_DISTANCE_MM)) {
        draft.worldPoints.push(worldPoint);
      }
      draft.hoverWorld = null;
      requestRenderAll();
      return;
    }

    if (state.dragging.type === "eraser") {
      const reconstruction = getActiveReconstruction();
      const planePoint = canvasToPlanePoint(state.dragging.viewportId, event.clientX, event.clientY);
      if (!reconstruction || !planePoint) {
        return;
      }
      updateEraserPreview(state.dragging.viewportId, event.clientX, event.clientY);
      eraseStroke(
        state.dragging.viewportId,
        reconstruction,
        state.dragging.frame,
        state.dragging.lastPlanePoint,
        planePoint,
        state.eraser.sizeMm / 2
      );
      state.dragging.lastPlanePoint = planePoint;
      requestRenderAll();
      return;
    }

    if (state.dragging.type === "windowLevel") {
      const deltaX = event.clientX - state.dragging.startClientX;
      const deltaY = event.clientY - state.dragging.startClientY;
      applyVoi(
        {
          width: state.dragging.startVOI.width + deltaX * 4,
          center: state.dragging.startVOI.center - deltaY * 4,
        },
        { resetPreset: true }
      );
      return;
    }

    if (state.dragging.type === "pan") {
      const viewportState = state.viewports[state.dragging.viewportId];
      setViewportTransform(
        state.dragging.viewportId,
        {
          panX: state.dragging.startPanX + (event.clientX - state.dragging.startClientX),
          panY: state.dragging.startPanY + (event.clientY - state.dragging.startClientY),
        },
        { sync: true }
      );
      requestRenderAll();
      return;
    }

    if (state.dragging.type === "zoom") {
      const deltaY = state.dragging.startClientY - event.clientY;
      setViewportTransform(
        state.dragging.viewportId,
        {
          zoom: clamp(state.dragging.startZoom * Math.exp(deltaY * 0.01), 0.2, 12),
        },
        { sync: true }
      );
      requestRenderAll();
      return;
    }

    if (state.dragging.type === "mprCenter") {
      const worldPoint = canvasToWorldPoint(state.dragging.viewportId, event.clientX, event.clientY);
      if (!worldPoint) {
        return;
      }
      state.mpr.centerWorld = addVectors(
        worldPoint,
        state.dragging.centerOffsetWorld || [0, 0, 0]
      );
      requestRenderAll();
      return;
    }

    if (state.dragging.type === "mprRotate") {
      const planePoint = canvasToPlanePoint(state.dragging.viewportId, event.clientX, event.clientY);
      if (!planePoint?.inside) {
        return;
      }

      const currentAngle = Math.atan2(planePoint.yMm, planePoint.xMm);
      let deltaDegrees = ((currentAngle - state.dragging.startAngleRadians) * 180) / Math.PI;
      deltaDegrees = normalizeAngleDegrees(deltaDegrees);
      setMprRotations({
        ...state.mpr.rotations,
        [state.dragging.planeName]: state.dragging.startRotation + deltaDegrees,
      });
      return;
    }

    if (state.dragging.type === "profileGuide") {
      const annotation = getActiveProfileAnnotation();
      const chartState = state.profileChartState;
      if (!annotation || !chartState?.profile?.stent || annotation.id !== state.dragging.annotationId) {
        return;
      }

      const rect = els.profileChart.getBoundingClientRect();
      const localX = clamp(event.clientX - rect.left, chartState.plot.x, chartState.plot.x + chartState.plot.width);
      const distanceMm = ((localX - chartState.plot.x) / chartState.plot.width) * chartState.maxDistance;
      const targetIndex = findNearestProfileDistanceIndex(chartState.profile.distancesMm, distanceMm);
      setProfileGuideAdjustment(
        annotation,
        state.dragging.guideKey,
        targetIndex,
        chartState.profile.distancesMm.length,
        chartState.profile.stent.guideIndices
      );
      updateProfilePanel();
      return;
    }

    if (state.dragging.type === "brushRoiPaint") {
      const reconstruction = getActiveReconstruction();
      const annotation = getSelectedAnnotation();
      const planePoint = canvasToPlanePoint(state.dragging.viewportId, event.clientX, event.clientY);
      if (!reconstruction || !annotation || annotation.id !== state.dragging.annotationId || !planePoint) {
        return;
      }

      paintBrushStroke(annotation, reconstruction, state.dragging.lastPlanePoint, planePoint);
      state.dragging.lastPlanePoint = planePoint;
      requestRenderAll();
      return;
    }

    if (state.dragging.type === "contourCorrect") {
      const draft = state.contourCorrectionDraft;
      const annotation = getSelectedAnnotation();
      const planePoint = canvasToPlanePoint(state.dragging.viewportId, event.clientX, event.clientY);
      if (!draft || !annotation || annotation.id !== state.dragging.annotationId || !planePoint) {
        return;
      }
      const last = draft.planePoints[draft.planePoints.length - 1];
      if (!last || Math.hypot(planePoint.xMm - last.x, planePoint.yMm - last.y) >= 0.35) {
        draft.planePoints.push({ x: planePoint.xMm, y: planePoint.yMm });
        requestRenderAll();
      }
      return;
    }

    if (state.dragging.type === "coronaryCenterEdit") {
      const vessel = getActiveCoronaryVessel();
      const sample = getActiveCoronarySample();
      const point = getCrossSectionPointerPoint(event.clientX, event.clientY);
      if (!vessel || !sample || !point || vessel.id !== state.dragging.vesselId) {
        return;
      }
      const deltaXmm = point.xMm - state.dragging.startPoint.xMm;
      const deltaYmm = point.yMm - state.dragging.startPoint.yMm;
      sample.world = offsetWorld(
        state.dragging.sourceWorld,
        state.dragging.sourceNormal,
        deltaXmm,
        state.dragging.sourceBinormal,
        deltaYmm,
        null,
        0
      );
      refreshCoronaryDerivedGeometry(vessel);
      state.mpr.centerWorld = cloneVector(sample.world);
      updateSidebarUi();
      requestRenderAll();
      return;
    }

    if (state.dragging.type === "coronaryControlPointEdit") {
      const vessel = getActiveCoronaryVessel();
      const worldPoint = canvasToWorldPoint(state.dragging.viewportId, event.clientX, event.clientY);
      if (!vessel || vessel.id !== state.dragging.vesselId || !worldPoint) {
        return;
      }
      state.dragging.pendingWorldPoint = cloneVector(worldPoint);
      requestRenderAll();
      return;
    }

    if (state.dragging.type === "coronaryRadiusEdit") {
      const vessel = getActiveCoronaryVessel();
      const sample = getActiveCoronarySample();
      const point = getCrossSectionPointerPoint(event.clientX, event.clientY);
      if (!vessel || !sample || !point || vessel.id !== state.dragging.vesselId) {
        return;
      }
      const deltaMm = point.radiusMm - state.dragging.startRadiusMm;
      sample.radiiMm = clampContourRadii(
        state.dragging.sourceRadiiMm.map((radius) => radius + deltaMm),
        vessel.searchRadiusMm * 1.35
      );
      refreshCoronaryDerivedGeometry(vessel);
      updateSidebarUi();
      requestRenderAll();
      return;
    }

    if (state.dragging.type === "annotation") {
      const worldPoint = canvasToWorldPoint(state.dragging.viewportId, event.clientX, event.clientY);
      if (!worldPoint) {
        return;
      }

      state.dragging.annotation.worldPoints[1] = worldPoint;
      requestRenderAll();
      return;
    }

    if (state.dragging.type === "editAnnotation") {
      const reconstruction = getActiveReconstruction();
      const annotation = getSelectedAnnotation();
      if (!reconstruction || !annotation || annotation.id !== state.dragging.annotationId) {
        return;
      }

      const planePoint = canvasToPlanePoint(state.dragging.viewportId, event.clientX, event.clientY);
      const worldPoint = canvasToWorldPoint(state.dragging.viewportId, event.clientX, event.clientY);
      if (!planePoint) {
        return;
      }

      if (state.dragging.mode === "move") {
        const deltaXmm = planePoint.xMm - state.dragging.startPlanePoint.xMm;
        const deltaYmm = planePoint.yMm - state.dragging.startPlanePoint.yMm;
        translateAnnotationInPlane(annotation, state.dragging.sourceAnnotation, deltaXmm, deltaYmm);
      } else if (state.dragging.mode === "point" && worldPoint) {
        annotation.worldPoints[state.dragging.pointIndex] = worldPoint;
      } else if (state.dragging.mode === "circleRadius") {
        const sourceGeometry = getCircularRoiGeometry(state.dragging.sourceAnnotation);
        if (!sourceGeometry) {
          return;
        }
        const radiusMm = Math.max(
          getMinimumCircularRoiRadiusMm(annotation.frame),
          Math.hypot(planePoint.xMm - sourceGeometry.centerXmm, planePoint.yMm - sourceGeometry.centerYmm)
        );
        setCircularRoiGeometry(annotation, {
          centerXmm: sourceGeometry.centerXmm,
          centerYmm: sourceGeometry.centerYmm,
          radiusXmm: radiusMm,
          radiusYmm: radiusMm,
        });
      } else if (state.dragging.mode === "roiVertex" && worldPoint) {
        delete annotation.ellipse;
        if (!reshapeSegmentationRoiFromHandle(annotation, state.dragging.sourceAnnotation, state.dragging.pointIndex, planePoint)) {
          annotation.worldPoints[state.dragging.pointIndex] = worldPoint;
        }
      } else if (state.dragging.mode === "squareCorner") {
        setSquareProfileCorner(annotation, state.dragging.sourceAnnotation, state.dragging.cornerIndex, planePoint);
      }

      requestRenderAll();
    }
  }

  function releasePointer(viewportId) {
    const viewportState = state.viewports[viewportId];
    if (!viewportState?.pointerId) {
      return;
    }
    els.viewports[viewportId].releasePointerCapture?.(viewportState.pointerId);
    viewportState.pointerId = null;
  }

  function handleGlobalPointerUp() {
    if (!state.dragging) {
      return;
    }

    const dragging = state.dragging;
    if (dragging.type === "profileGuide") {
      els.profileChart.releasePointerCapture?.(dragging.pointerId);
      els.profileChart.style.cursor = "default";
    } else if (dragging.type === "coronaryCenterEdit" || dragging.type === "coronaryRadiusEdit") {
      els.coronaryCrossSectionCanvas.releasePointerCapture?.(dragging.pointerId);
    } else {
      releasePointer(dragging.viewportId);
    }

    if (dragging.type === "annotation" && isValidDragAnnotation(dragging.annotation)) {
      addAnnotation(dragging.annotation);
    } else if (dragging.type === "circularRoi") {
      if ((dragging.maxPointerDistancePx || 0) < 4) {
        setCircularRoiGeometry(dragging.annotation, {
          centerXmm: dragging.centerPlanePoint.xMm,
          centerYmm: dragging.centerPlanePoint.yMm,
          radiusXmm: DEFAULT_CIRCULAR_ROI_RADIUS_MM,
          radiusYmm: DEFAULT_CIRCULAR_ROI_RADIUS_MM,
        });
      }
      if (isValidDragAnnotation(dragging.annotation)) {
        addAnnotation(dragging.annotation);
      }
    } else if (dragging.type === "freehandRoi") {
      finalizePolygonDraft(dragging.viewportId, null);
    } else if (dragging.type === "contourCorrect") {
      const annotation = getSelectedAnnotation();
      const draft = state.contourCorrectionDraft;
      if (annotation && draft && annotation.id === dragging.annotationId) {
        if (applyContourCorrection(annotation, draft.planePoints)) {
          setStatus("ROI contour corrected.");
          pushHistorySnapshot("Adjust ROI");
        }
      }
      state.contourCorrectionDraft = null;
    } else if (dragging.type === "brushRoiPaint") {
      const reconstruction = getActiveReconstruction();
      const annotation = getSelectedAnnotation();
      if (reconstruction && annotation?.id === dragging.annotationId && countBrushMaskCells(annotation.mask) <= 0) {
        reconstruction.annotations = reconstruction.annotations.filter((item) => item.id !== annotation.id);
        state.selectedAnnotationId = null;
      }
      updateMeasurementCount();
      updateProfilePanel();
      pushHistorySnapshot("Paint ROI brush");
    } else if (dragging.type === "editAnnotation") {
      const annotation = getSelectedAnnotation();
      if (annotation && annotation.id === dragging.annotationId && !isValidDragAnnotation(annotation)) {
        Object.assign(annotation, cloneAnnotation(dragging.sourceAnnotation));
      }
      updateMeasurementCount();
      updateProfilePanel();
      pushHistorySnapshot("Edit annotation");
    } else if (dragging.type === "profileGuide") {
      updateProfilePanel();
      pushHistorySnapshot("Adjust profile guides");
    } else if (dragging.type === "coronaryControlPointEdit") {
      const reconstruction = getActiveReconstruction();
      const vessel = state.coronary.vessels.find((item) => item.id === dragging.vesselId);
      if (reconstruction && vessel && dragging.pendingWorldPoint) {
        try {
          const nextSeedPoints = cloneWorldPoints(dragging.sourceSeedPoints);
          nextSeedPoints[dragging.pointIndex] = cloneVector(dragging.pendingWorldPoint);
          const nextVessel = buildCoronaryVesselModel(
            reconstruction,
            nextSeedPoints,
            { plane: vessel.seedPlane, nWorld: vessel.curvedPlaneNormal },
            {
              thresholdHu: vessel.thresholdHu,
              searchRadiusMm: vessel.searchRadiusMm,
            }
          );
          replaceCoronaryVessel(vessel.id, nextVessel);
          nextVessel.label = vessel.label;
          nextVessel.thresholdHu = vessel.thresholdHu;
          nextVessel.searchRadiusMm = vessel.searchRadiusMm;
          setActiveCoronarySampleIndex(
            Math.round((dragging.activeSampleRatio || 0) * Math.max(0, nextVessel.centerline.length - 1))
          );
          setStatus(`Rebuilt ${getDisplayedCoronaryLabel(nextVessel)} through the updated control point.`);
          pushHistorySnapshot("Edit coronary control point");
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Failed to rebuild the coronary vessel through the edited control point.", "error");
        }
      }
    } else if (dragging.type === "coronaryCenterEdit" || dragging.type === "coronaryRadiusEdit") {
      pushHistorySnapshot("Edit coronary cross-section");
    }

    state.dragging = null;
    if (dragging.type === "eraser") {
      pushHistorySnapshot("Erase annotation");
    }
    updateViewportCursors();
    requestRenderAll();
  }

  function handleViewportWheel(event) {
    if (!getActiveReconstruction()) {
      return;
    }

    event.preventDefault();
    const viewportId = event.currentTarget.dataset.viewportId;
    setActiveViewport(viewportId);
    if (event.metaKey || event.ctrlKey) {
      const viewportState = state.viewports[viewportId];
      const nextZoom = (Number(viewportState?.zoom) || 1) * Math.exp(-event.deltaY * 0.0015);
      if (zoomViewportAtClientPoint(viewportId, event.clientX, event.clientY, nextZoom)) {
        requestRenderAll();
      }
      return;
    }
    scrollPlaneBy(getViewportPlane(viewportId), event.deltaY > 0 ? 1 : -1);
  }

  function initializeViewportCanvases() {
    VIEWPORT_IDS.forEach((viewportId) => {
      const element = els.viewports[viewportId];
      const canvas = document.createElement("canvas");
      canvas.className = "viewport-canvas";
      canvas.setAttribute("aria-label", getViewportTitle(viewportId));
      element.dataset.viewportId = viewportId;
      element.appendChild(canvas);

      state.viewports[viewportId] = {
        id: viewportId,
        canvas,
        ctx: canvas.getContext("2d"),
        zoom: 1,
        panX: 0,
        panY: 0,
        lastGeometry: null,
        lastFrame: null,
        bufferCanvas: null,
        pointerId: null,
      };

      element.addEventListener("pointerdown", handleViewportPointerDown);
      element.addEventListener("pointermove", handleViewportPointerMovePreview);
      element.addEventListener("pointerleave", () => {
        if (state.activeToolKey === "eraser" && !state.dragging) {
          state.eraser.preview = null;
          requestRenderAll();
        }
      });
      element.addEventListener("click", handleViewportClick);
      element.addEventListener("dblclick", handleViewportDoubleClick);
      element.addEventListener("contextmenu", (event) => event.preventDefault());
      element.addEventListener("wheel", handleViewportWheel, { passive: false });
    });

    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => requestRenderAll());
      els.viewportPanels.forEach((panel) => observer.observe(panel));
    }

    updateViewportCursors();
  }

  function parseMprInputsAndApply() {
    setMprRotations({
      axial: Number.parseFloat(els.mprAxialInput.value) || 0,
      coronal: Number.parseFloat(els.mprCoronalInput.value) || 0,
      sagittal: Number.parseFloat(els.mprSagittalInput.value) || 0,
    });
  }

  function bindStaticEvents() {
    els.dicomInput.addEventListener("change", async (event) => {
      try {
        await loadReconstructionsFromFiles(event.target.files, { append: false });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Failed to load DICOM series.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.dicomFolderInput.addEventListener("change", async (event) => {
      try {
        await loadReconstructionsFromFiles(event.target.files, { append: false });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Failed to load DICOM folder.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.dicomAddInput.addEventListener("change", async (event) => {
      try {
        await loadReconstructionsFromFiles(event.target.files, { append: true });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Failed to add reconstructions.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.clearButton.addEventListener("click", clearStudy);
    els.coronaryAutoSegmentButton.addEventListener("click", async () => {
      try {
        await autoSegmentCoronaryTree();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Automatic coronary segmentation failed.", "error");
      }
    });
    els.coronaryBackendRefreshButton.addEventListener("click", async () => {
      await refreshBackendStatus();
    });
    els.coronaryStartButton.addEventListener("click", () => {
      startCoronaryDraft();
    });
    els.coronaryFinishButton.addEventListener("click", () => {
      try {
        finishCoronaryDraft();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Coronary segmentation failed.", "error");
      }
    });
    els.coronaryQuickSegmentButton.addEventListener("click", () => {
      state.coronary.quickSegmentMode = !state.coronary.quickSegmentMode;
      updateSidebarUi();
      setStatus(
        state.coronary.quickSegmentMode
          ? "Two-point auto mode enabled. The second click will build a tracked 3D short segment."
          : "Two-point auto mode disabled. You can place start/end points plus extra control points, then finish when ready."
      );
    });
    els.coronaryClearDraftButton.addEventListener("click", () => {
      clearCoronaryDraft({ keepTool: true });
      setStatus("Coronary draft cleared.");
    });
    els.coronaryResegmentButton.addEventListener("click", () => {
      try {
        resegmentActiveCoronaryVessel({
          thresholdHu: state.coronary.settings.lumenThresholdHu,
          searchRadiusMm: state.coronary.settings.searchRadiusMm,
        });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Coronary re-segmentation failed.", "error");
      }
    });
    els.coronaryThresholdInput.addEventListener("change", () => {
      state.coronary.settings.lumenThresholdHu = clamp(
        Number.parseFloat(els.coronaryThresholdInput.value) || CORONARY_DEFAULTS.lumenThresholdHu,
        80,
        1200
      );
      updateSidebarUi();
    });
    els.coronarySearchRadiusInput.addEventListener("change", () => {
      state.coronary.settings.searchRadiusMm = clamp(
        Number.parseFloat(els.coronarySearchRadiusInput.value) || CORONARY_DEFAULTS.searchRadiusMm,
        1.5,
        8
      );
      updateSidebarUi();
    });
    els.coronarySampleSlider.addEventListener("input", () => {
      setActiveCoronarySampleIndex(Number.parseInt(els.coronarySampleSlider.value, 10) || 0);
    });
    els.coronarySampleInput.addEventListener("change", () => {
      setActiveCoronarySampleIndex((Number.parseInt(els.coronarySampleInput.value, 10) || 1) - 1);
    });
    els.coronaryLabelSelect.addEventListener("change", () => {
      updateActiveCoronaryLabel(els.coronaryLabelSelect.value);
    });
    els.coronaryRadiusMinusButton.addEventListener("click", () => {
      nudgeActiveCoronaryRadius(-0.15);
    });
    els.coronaryRadiusPlusButton.addEventListener("click", () => {
      nudgeActiveCoronaryRadius(0.15);
    });
    els.coronaryThresholdMinusButton.addEventListener("click", () => {
      adjustActiveCoronaryThreshold(-10);
    });
    els.coronaryThresholdPlusButton.addEventListener("click", () => {
      adjustActiveCoronaryThreshold(10);
    });
    els.coronarySnapCenterButton.addEventListener("click", () => {
      snapActiveCoronaryCenter();
    });
    els.coronaryDeleteVesselButton.addEventListener("click", () => {
      deleteActiveCoronaryVessel();
    });
    els.coronaryJumpLesionButton.addEventListener("click", () => {
      const vessel = getActiveCoronaryVessel();
      if (!vessel || !Number.isFinite(vessel.analysis?.lesionSampleIndex)) {
        return;
      }
      setActiveCoronarySampleIndex(vessel.analysis.lesionSampleIndex);
      setStatus(`Jumped to the prototype lesion sample in ${getDisplayedCoronaryLabel(vessel)}.`);
    });
    els.coronaryOpenMprButton.addEventListener("click", () => {
      if (!getActiveReconstruction()) {
        return;
      }
      const nextLayout = state.layout === "mpr" ? "presentation" : "mpr";
      setLayout(nextLayout);
      setStatus(nextLayout === "mpr" ? "Switched to 4-up MPR for vessel review." : "Returned to axial presentation view.");
    });
    els.coronaryCurvedCanvas.addEventListener("pointerdown", handleCoronaryLongitudinalPointerDown);
    els.coronaryStraightenedCanvas.addEventListener("pointerdown", handleCoronaryLongitudinalPointerDown);
    els.coronaryCrossSectionCanvas.addEventListener("pointerdown", handleCoronaryCrossSectionPointerDown);
    els.resetButton.addEventListener("click", () => {
      resetViewportTransforms();
      requestRenderAll();
    });
    els.presentationResetWindowButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetPresentationWindowing();
    });
    els.presentationResetFitButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetPresentationViewportTransform();
    });
    els.syncMprButton.addEventListener("click", () => {
      setSyncMprTransforms(!state.syncMprTransforms);
    });
    els.resetMprButton.addEventListener("click", resetMprState);
    els.clearMeasurementsButton.addEventListener("click", clearMeasurements);
    els.copyRoiButton.addEventListener("click", () => {
      try {
        copyLatestRoi();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "ROI copy failed.", "error");
      }
    });
    els.pasteRoiButton.addEventListener("click", () => {
      try {
        pasteCopiedRoi();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "ROI paste failed.", "error");
      }
    });
    els.syncMeasurementsButton.addEventListener("click", () => {
      try {
        syncMeasurementsToAllReconstructions();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Measurement sync failed.", "error");
      }
    });

    els.layoutButtons.forEach((button) => {
      button.addEventListener("click", () => setLayout(button.dataset.layout));
    });

    els.toolButtons.forEach((button) => {
      button.addEventListener("click", () => setActiveTool(button.dataset.tool));
    });
    els.roiToolTrigger?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleRoiToolMenu();
    });
    els.roiToolMenu?.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    document.addEventListener("click", (event) => {
      if (!els.roiToolMenu || !els.roiToolTrigger) {
        return;
      }
      const target = event.target;
      if (els.roiToolMenu.contains(target) || els.roiToolTrigger.contains(target)) {
        return;
      }
      closeRoiToolMenu();
    });

    els.presetButtons.forEach((button) => {
      button.addEventListener("click", () => applyPreset(button.dataset.preset));
    });

    els.windowWidthSlider.addEventListener("input", () => {
      applyVoi({ width: Number(els.windowWidthSlider.value), center: state.currentVOI.center }, { resetPreset: true });
    });
    els.windowCenterSlider.addEventListener("input", () => {
      applyVoi({ width: state.currentVOI.width, center: Number(els.windowCenterSlider.value) }, { resetPreset: true });
    });

    ["change", "blur"].forEach((eventName) => {
      els.windowWidthInput.addEventListener(eventName, applyVoiFromInputs);
      els.windowCenterInput.addEventListener(eventName, applyVoiFromInputs);
      els.mprAxialInput.addEventListener(eventName, parseMprInputsAndApply);
      els.mprCoronalInput.addEventListener(eventName, parseMprInputsAndApply);
      els.mprSagittalInput.addEventListener(eventName, parseMprInputsAndApply);
      els.brushMinInput?.addEventListener(eventName, applyBrushRoiInputs);
      els.brushMaxInput?.addEventListener(eventName, applyBrushRoiInputs);
      els.brushSizeInput?.addEventListener(eventName, applyBrushRoiInputs);
      els.eraserSizeInput?.addEventListener(eventName, applyEraserInputs);
    });

    [
      els.windowWidthInput,
      els.windowCenterInput,
      els.mprAxialInput,
      els.mprCoronalInput,
      els.mprSagittalInput,
      els.brushMinInput,
      els.brushMaxInput,
      els.brushSizeInput,
      els.eraserSizeInput,
    ].filter(Boolean).forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (input.id.startsWith("mpr-")) {
            parseMprInputsAndApply();
          } else if (input.id.startsWith("brush-")) {
            applyBrushRoiInputs();
          } else if (input.id.startsWith("eraser-")) {
            applyEraserInputs();
          } else {
            applyVoiFromInputs();
          }
        }
      });
    });

    [
      [els.mprAxialSlider, "axial"],
      [els.mprCoronalSlider, "coronal"],
      [els.mprSagittalSlider, "sagittal"],
    ].forEach(([slider, axis]) => {
      slider.addEventListener("input", () => {
        setMprRotations({
          ...state.mpr.rotations,
          [axis]: Number(slider.value),
        });
      });
    });

    els.sliceSlider.addEventListener("input", () => {
      setPlaneIndex("axial", Number(els.sliceSlider.value));
    });

    els.presentationFastScrollSlider?.addEventListener("input", () => {
      setPlaneIndex("axial", Number(els.presentationFastScrollSlider.value));
    });

    els.mprOverlayToggleButton?.addEventListener("click", () => {
      toggleMprOverlayVisibility();
    });

    els.cineSpeedSlider.addEventListener("input", () => {
      state.cineFps = Number(els.cineSpeedSlider.value);
      els.cineSpeedReadout.textContent = `${state.cineFps} fps`;
      if (state.cineTimerId) {
        startCine();
      }
    });

    els.cineButton.addEventListener("click", toggleCine);

    els.exportCurrentButton.addEventListener("click", async () => {
      try {
        await exportCurrentViewportPng();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Current PNG export failed.", "error");
      }
    });

    els.exportGridButton.addEventListener("click", async () => {
      try {
        await exportFourUpPng();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "4-up PNG export failed.", "error");
      }
    });

    els.exportCineButton.addEventListener("click", async () => {
      try {
        await exportCineClip();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Cine export failed.", "error");
      }
    });

    els.exportMeasurementsButton.addEventListener("click", () => {
      try {
        openExportDialog("export");
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Measurement export failed.", "error");
      }
    });
    els.finishCloseButton.addEventListener("click", () => {
      try {
        openExportDialog("finishClose");
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Finish & close failed.", "error");
      }
    });
    els.exportDialog.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.hasAttribute("data-export-dialog-close")) {
        closeExportDialog();
      }
    });
    els.exportDialogCloseButton.addEventListener("click", closeExportDialog);
    els.exportDialogCancelButton.addEventListener("click", closeExportDialog);
    els.exportDialogConfirmButton.addEventListener("click", () => {
      try {
        confirmExportDialog();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Measurement export failed.", "error");
      }
    });
    els.exportDialogInput.addEventListener("input", () => {
      els.exportDialogError.hidden = true;
    });
    els.exportStudySelect?.addEventListener("change", () => {
      handleExportStudySelectionChange().catch((error) => {
        console.error(error);
        setStatus(error.message || "Could not change export study.", "error");
      });
    });
    els.exportStudyCreateButton?.addEventListener("click", () => {
      createExportStudyFromDialog().catch((error) => {
        console.error(error);
        setStatus(error.message || "Could not create export study.", "error");
      });
    });
    els.exportStudyCreateInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        createExportStudyFromDialog().catch((error) => {
          console.error(error);
          setStatus(error.message || "Could not create export study.", "error");
        });
      }
    });
    els.exportDialogInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        try {
          confirmExportDialog();
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Measurement export failed.", "error");
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeExportDialog();
      }
    });
    els.profileResetAutoButton.addEventListener("click", () => {
      try {
        resetSelectedProfileAuto();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Profile reset failed.", "error");
      }
    });
    els.profileChart.addEventListener("pointerdown", handleProfileChartPointerDown);
    els.profileChart.addEventListener("pointermove", handleProfileChartPointerMovePreview);
    els.profileChart.addEventListener("pointerleave", () => {
      if (state.dragging?.type !== "profileGuide") {
        els.profileChart.style.cursor = "default";
      }
    });

    els.viewportPanels.forEach((panel) => {
      const viewportId = panel.dataset.viewportId;

      panel.addEventListener("click", () => {
        setActiveViewport(viewportId);
        focusWithoutScrolling(panel);
      });

      panel.addEventListener("keydown", (event) => {
        if (state.export.dialogOpen) {
          return;
        }
        if (!getActiveReconstruction()) {
          return;
        }

        const plane = getViewportPlane(viewportId);
        if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
          event.preventDefault();
          scrollPlaneBy(plane, -1);
        } else if (["ArrowDown", "ArrowRight", "PageDown"].includes(event.key)) {
          event.preventDefault();
          scrollPlaneBy(plane, 1);
        } else if (event.key === " ") {
          event.preventDefault();
          toggleCine();
        }
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.export.dialogOpen) {
        event.preventDefault();
        closeExportDialog();
      }
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      els.stage.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.stage.classList.add("is-dragging");
      });
    });

    ["dragleave", "dragend", "drop"].forEach((eventName) => {
      els.stage.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.stage.classList.remove("is-dragging");
      });
    });

    els.stage.addEventListener("drop", async (event) => {
      try {
        const droppedFiles =
          (await window.HAGRadCore?.collectDroppedFiles?.(event.dataTransfer)) ||
          Array.from(event.dataTransfer?.files || []);
        await loadReconstructionsFromFiles(droppedFiles, { append: false });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Failed to load dropped DICOM files.", "error");
      }
    });

    document.addEventListener("keydown", (event) => {
      if (state.export.dialogOpen) {
        return;
      }
      const tagName = event.target?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA") {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) {
            redoHistory();
          } else {
            undoHistory();
          }
          return;
        }
        if (key === "y") {
          event.preventDefault();
          redoHistory();
          return;
        }
      }

      if ((event.metaKey || event.ctrlKey) && (event.key === "c" || event.key === "C")) {
        event.preventDefault();
        copyLatestRoi();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === "v" || event.key === "V")) {
        event.preventDefault();
        pasteCopiedRoi();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (deleteSelectedAnnotation()) {
          event.preventDefault();
        }
        return;
      }

      if (event.key === "e" || event.key === "E") {
        setActiveTool("eraser");
      } else if (event.key === "g" || event.key === "G") {
        setActiveTool("coronarySeed");
      } else if (event.key === "w" || event.key === "W") {
        setActiveTool("windowLevel");
      } else if (event.key === "x" || event.key === "X") {
        setActiveTool("mprCursor");
      } else if (event.key === "q" || event.key === "Q") {
        setActiveTool("segmentationRoi");
      } else if (event.key === "s" || event.key === "S") {
        setActiveTool("squareProfile");
      } else if (event.key === "m" || event.key === "M") {
        setActiveTool("pan");
      } else if (event.key === "z" || event.key === "Z") {
        setActiveTool("zoom");
      } else if (event.key === "l" || event.key === "L") {
        setActiveTool("length");
      } else if (event.key === "b" || event.key === "B") {
        setActiveTool("probe");
      } else if (event.key === "r" || event.key === "R") {
        setActiveTool("freehandRoi");
      } else if (event.key === "a" || event.key === "A") {
        setActiveTool("contourCorrect");
      } else if (event.key === "t" || event.key === "T") {
        setActiveTool("text");
      } else if (event.key === "c" || event.key === "C") {
        setActiveTool("circularRoi");
      } else if (event.key === "v" || event.key === "V") {
        exportCineClip().catch((error) => {
          console.error(error);
          setStatus(error.message || "Cine export failed.", "error");
        });
      } else if (event.key === "p" || event.key === "P") {
        setActiveTool("lineProfile");
      } else if (event.key === "y" || event.key === "Y") {
        setActiveTool("arrow");
      } else if (event.key === "1") {
        applyPreset("coronary");
      } else if (event.key === "2") {
        applyPreset("softTissue");
      } else if (event.key === "3") {
        applyPreset("lung");
      } else if (event.key === "4") {
        applyPreset("bone");
      } else if (event.key === "Enter") {
        if (state.activeToolKey === "coronarySeed" && state.coronary.draftSeedPoints.length >= 2) {
          try {
            finishCoronaryDraft();
          } catch (error) {
            console.error(error);
            setStatus(error.message || "Coronary segmentation failed.", "error");
          }
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        returnToPrimaryTool();
      }
    });

    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerUp);
    window.addEventListener("resize", requestRenderAll);
  }

  function initialize() {
    cacheElements();
    initializeDecoderFallback();
    initializeViewportCanvases();
    bindStaticEvents();
    updateLayoutButtons();
    updateToolButtons();
    updateSidebarUi();
    updateEmptyState();
    els.cineSpeedReadout.textContent = `${state.cineFps} fps`;
    setStatus("Ready for a coronary CTA stack");
    refreshBackendStatus({ silent: true });
    refreshExportStudyOptions().catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not load export studies.", "error");
    });
    applyBrushRoiInputs();
    applyEraserInputs();
    requestRenderAll();
  }

  window.addEventListener("DOMContentLoaded", initialize);
})();
