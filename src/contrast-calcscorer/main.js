import {
  VIEW_PRESETS,
  TOOLS,
  LABELS,
  LABELS_BY_CODE,
  REFERENCE_DEFINITIONS,
  WORKFLOW_STEPS,
  COLORS,
  RESEARCH_WARNING_LINES,
} from "./constants.js";
import { parseDicomFiles, buildSeriesCandidates, buildVolume } from "./dicom.js";
import {
  sampleCircularRoi,
  samplePolygonRoi,
  composeLabelSlices,
  rebuildAnalysisOutputs,
  runContrastEstimation,
  growThresholdComponentFromSeed,
  getSliceHuValue,
  getComponentSummaryRows,
  normalizeContourPoints,
  polygonArea,
  pointInPolygon,
  hasRequiredReferences,
  getSuppressedPreviewHu,
} from "./estimation.js";

(function () {
  "use strict";

  const sharedCore = window.HAGRadCore;
  if (!sharedCore) {
    throw new Error("Missing shared core script: /src/shared/hagrad-core.js");
  }

  const { clamp, sanitizeFilePart, collectDroppedFiles } = sharedCore;
  const VIEWER_MODE_LABELS = {
    edit: "Edit",
    windowLevel: "Window",
    pan: "Pan",
    zoom: "Zoom",
  };
  const VIEWER_MODE_CURSORS = {
    edit: "crosshair",
    windowLevel: "crosshair",
    pan: "grab",
    zoom: "zoom-in",
  };

  const state = {
    studyRecords: [],
    seriesCandidates: [],
    selectedSeriesId: null,
    activeSeriesId: null,
    activeVolume: null,
    activeRecords: [],
    activeSliceIndex: 0,
    currentPreset: "contrast",
    workflowStep: "series",
    tool: "tapLabel",
    selectedLabelCode: 1,
    overlayVisible: true,
    referenceOverlayVisible: true,
    referenceSamplingTarget: null,
    referenceRoiRadiusPx: 7,
    renderQueued: false,
    canvasGeometry: null,
    view: createInitialViewState(),
    pointer: {
      imageX: null,
      imageY: null,
      pixelIndex: null,
      hu: null,
      inside: false,
    },
    dragging: null,
    finishModalOpen: false,
    exportStudy: {
      currentStudyId: "",
      studies: [],
    },
    history: {
      entries: [],
      index: -1,
      restoring: false,
      limit: 40,
    },
    references: createInitialReferenceStore(),
    analysis: {
      minAreaMm2: 0.8,
      massCalibrationFactor: 0.81,
      minResidualHu: 35,
      localResidualHu: 18,
      scoringSlices: {
        top: 0,
        bottom: 0,
      },
      autoLabelSlices: [],
      overrideLabelSlices: new Map(),
      labelSlices: [],
      componentLookupBySlice: [],
      components: [],
      activeComponentId: null,
      results: null,
      detectionStamp: 0,
      methodSummary: null,
    },
  };

  const els = {};
  const exportStudyApi = window.HAGRadExportStudies || null;

  function createInitialReferenceStore() {
    return Object.fromEntries(
      REFERENCE_DEFINITIONS.map((definition) => [definition.key, { picks: [] }])
    );
  }

  function createInitialViewState() {
    return {
      zoom: 1,
      panX: 0,
      panY: 0,
      interactionMode: "edit",
      customVoiByPreset: {},
    };
  }

  function cloneReferencePick(pick) {
    return {
      ...pick,
      points: Array.isArray(pick?.points)
        ? pick.points.map((point) => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 }))
        : undefined,
    };
  }

  function cloneReferenceStore(referenceStore) {
    return Object.fromEntries(
      REFERENCE_DEFINITIONS.map((definition) => [
        definition.key,
        {
          picks: (referenceStore?.[definition.key]?.picks || []).map(cloneReferencePick),
        },
      ])
    );
  }

  function cloneOverrideLabelSlicesMap(source) {
    const next = new Map();
    if (!(source instanceof Map)) {
      return next;
    }
    source.forEach((pixelMap, sliceIndex) => {
      next.set(Number(sliceIndex), new Map(pixelMap instanceof Map ? pixelMap.entries() : []));
    });
    return next;
  }

  function serializeOverrideLabelSlices(source) {
    if (!(source instanceof Map)) {
      return [];
    }
    return Array.from(source.entries())
      .map(([sliceIndex, pixelMap]) => [
        Number(sliceIndex),
        Array.from(pixelMap instanceof Map ? pixelMap.entries() : []).sort((left, right) => left[0] - right[0]),
      ])
      .sort((left, right) => left[0] - right[0]);
  }

  function serializeReferenceStore(referenceStore) {
    return REFERENCE_DEFINITIONS.map((definition) => ({
      key: definition.key,
      picks: (referenceStore?.[definition.key]?.picks || []).map((pick) => ({
        shape: pick.shape || "circle",
        sliceIndex: Number(pick.sliceIndex) || 0,
        centerX: Number(pick.centerX) || 0,
        centerY: Number(pick.centerY) || 0,
        radiusPx: Number(pick.radiusPx) || 0,
        pixelCount: Number(pick.pixelCount) || 0,
        areaMm2: Number(pick.areaMm2) || 0,
        meanHu: Number(pick.meanHu) || 0,
        sdHu: Number(pick.sdHu) || 0,
        peakHu: Number(pick.peakHu) || 0,
        points: Array.isArray(pick.points)
          ? pick.points.map((point) => [Number(point.x) || 0, Number(point.y) || 0])
          : [],
      })),
    }));
  }

  function serializeHistoryState() {
    return {
      activeSliceIndex: state.activeSliceIndex,
      workflowStep: state.workflowStep,
      tool: state.tool,
      selectedLabelCode: state.selectedLabelCode,
      referenceSamplingTarget: state.referenceSamplingTarget,
      detectionStamp: state.analysis.detectionStamp,
      scoringSlices: {
        top: state.analysis.scoringSlices.top,
        bottom: state.analysis.scoringSlices.bottom,
      },
      config: {
        minAreaMm2: state.analysis.minAreaMm2,
        massCalibrationFactor: state.analysis.massCalibrationFactor,
        minResidualHu: state.analysis.minResidualHu,
        localResidualHu: state.analysis.localResidualHu,
      },
      activeComponentId: state.analysis.activeComponentId,
      references: serializeReferenceStore(state.references),
      overrideLabelSlices: serializeOverrideLabelSlices(state.analysis.overrideLabelSlices),
    };
  }

  function captureHistorySnapshot() {
    return {
      activeSliceIndex: state.activeSliceIndex,
      workflowStep: state.workflowStep,
      tool: state.tool,
      selectedLabelCode: state.selectedLabelCode,
      referenceSamplingTarget: state.referenceSamplingTarget,
      autoLabelSlices: state.analysis.autoLabelSlices,
      methodSummary: state.analysis.methodSummary,
      detectionStamp: state.analysis.detectionStamp,
      scoringSlices: {
        top: state.analysis.scoringSlices.top,
        bottom: state.analysis.scoringSlices.bottom,
      },
      config: {
        minAreaMm2: state.analysis.minAreaMm2,
        massCalibrationFactor: state.analysis.massCalibrationFactor,
        minResidualHu: state.analysis.minResidualHu,
        localResidualHu: state.analysis.localResidualHu,
      },
      activeComponentId: state.analysis.activeComponentId,
      references: cloneReferenceStore(state.references),
      overrideLabelSlices: cloneOverrideLabelSlicesMap(state.analysis.overrideLabelSlices),
    };
  }

  function resetHistory() {
    state.history.entries = [];
    state.history.index = -1;
  }

  function pushHistorySnapshot(label) {
    if (state.history.restoring || !state.activeVolume) {
      return;
    }
    const snapshot = captureHistorySnapshot();
    const signature = JSON.stringify(serializeHistoryState());
    const current = state.history.entries[state.history.index];
    if (current?.signature === signature) {
      return;
    }

    state.history.entries = state.history.entries.slice(0, state.history.index + 1);
    state.history.entries.push({
      label: label || "Update",
      signature,
      snapshot,
    });
    if (state.history.entries.length > state.history.limit) {
      state.history.entries.shift();
    }
    state.history.index = state.history.entries.length - 1;
  }

  function applyHistorySnapshot(snapshot) {
    if (!snapshot) {
      return;
    }
    state.activeSliceIndex = clamp(
      Number.isFinite(snapshot.activeSliceIndex) ? snapshot.activeSliceIndex : state.activeSliceIndex,
      0,
      Math.max(0, (state.activeVolume?.depth || 1) - 1)
    );
    state.workflowStep = snapshot.workflowStep || "series";
    state.tool = snapshot.tool || "tapLabel";
    state.selectedLabelCode = Number(snapshot.selectedLabelCode) || 1;
    state.referenceSamplingTarget = snapshot.referenceSamplingTarget || null;
    state.references = cloneReferenceStore(snapshot.references);
    state.analysis.autoLabelSlices = snapshot.autoLabelSlices || [];
    state.analysis.methodSummary = snapshot.methodSummary || null;
    state.analysis.detectionStamp = Number.isFinite(snapshot.detectionStamp) ? snapshot.detectionStamp : 0;
    state.analysis.scoringSlices = {
      top: Number.isFinite(snapshot.scoringSlices?.top) ? snapshot.scoringSlices.top : 0,
      bottom: Number.isFinite(snapshot.scoringSlices?.bottom) ? snapshot.scoringSlices.bottom : 0,
    };
    state.analysis.minAreaMm2 = Number.isFinite(snapshot.config?.minAreaMm2)
      ? Number(snapshot.config.minAreaMm2)
      : state.analysis.minAreaMm2;
    state.analysis.massCalibrationFactor = Number.isFinite(snapshot.config?.massCalibrationFactor)
      ? Number(snapshot.config.massCalibrationFactor)
      : state.analysis.massCalibrationFactor;
    state.analysis.minResidualHu = Number.isFinite(snapshot.config?.minResidualHu)
      ? Number(snapshot.config.minResidualHu)
      : state.analysis.minResidualHu;
    state.analysis.localResidualHu = Number.isFinite(snapshot.config?.localResidualHu)
      ? Number(snapshot.config.localResidualHu)
      : state.analysis.localResidualHu;
    state.analysis.overrideLabelSlices = cloneOverrideLabelSlicesMap(snapshot.overrideLabelSlices);
    state.analysis.activeComponentId = snapshot.activeComponentId ?? null;
    composeLabelSlicesFromState();
    rebuildOutputsFromState();
    refreshDerivedUi();
    requestRender();
  }

  function restoreHistorySnapshot(targetIndex) {
    const entry = state.history.entries[targetIndex];
    if (!entry) {
      return;
    }
    state.history.restoring = true;
    try {
      applyHistorySnapshot(entry.snapshot);
      state.history.index = targetIndex;
    } finally {
      state.history.restoring = false;
    }
  }

  function undoHistory() {
    if (state.history.index <= 0) {
      return;
    }
    restoreHistorySnapshot(state.history.index - 1);
    setStatus("Undid the last workflow edit.");
  }

  function redoHistory() {
    if (state.history.index >= state.history.entries.length - 1) {
      return;
    }
    restoreHistorySnapshot(state.history.index + 1);
    setStatus("Redid the workflow edit.");
  }

  function cacheElements() {
    els.dicomInput = document.getElementById("dicom-input");
    els.dicomFolderInput = document.getElementById("dicom-folder-input");
    els.dicomAddInput = document.getElementById("dicom-add-input");
    els.clearButton = document.getElementById("clear-button");
    els.finishCloseButton = document.getElementById("finish-close-button");
    els.statusPill = document.getElementById("status-pill");

    els.workflowNote = document.getElementById("workflow-note");
    els.guideProgressFill = document.getElementById("guide-progress-fill");
    els.guideStepList = document.getElementById("guide-step-list");
    els.guideActionTitle = document.getElementById("guide-action-title");
    els.guideActionCopy = document.getElementById("guide-action-copy");
    els.workflowButtons = Array.from(document.querySelectorAll("[data-workflow-step]"));

    els.seriesSummary = document.getElementById("series-summary");
    els.seriesList = document.getElementById("series-list");
    els.loadSelectedSeriesButton = document.getElementById("load-selected-series-button");

    els.rangeSummary = document.getElementById("range-summary");
    els.scoreRangeReadout = document.getElementById("score-range-readout");
    els.scoreTopSliceInput = document.getElementById("score-top-slice-input");
    els.scoreBottomSliceInput = document.getElementById("score-bottom-slice-input");
    els.setScoreTopButton = document.getElementById("set-score-top-button");
    els.setScoreBottomButton = document.getElementById("set-score-bottom-button");
    els.useFullScoreRangeButton = document.getElementById("use-full-score-range-button");

    els.referencesSummary = document.getElementById("references-summary");
    els.referenceRadiusSlider = document.getElementById("reference-radius-slider");
    els.referenceRadiusReadout = document.getElementById("reference-radius-readout");
    els.referenceCardGrid = document.getElementById("reference-card-grid");

    els.methodBanner = document.getElementById("method-banner");
    els.methodBranchReadout = document.getElementById("method-branch-readout");
    els.estimateNote = document.getElementById("estimate-note");
    els.minAreaSlider = document.getElementById("min-area-slider");
    els.minAreaReadout = document.getElementById("min-area-readout");
    els.massFactorInput = document.getElementById("mass-factor-input");
    els.minResidualSlider = document.getElementById("min-residual-slider");
    els.minResidualReadout = document.getElementById("min-residual-readout");
    els.localResidualSlider = document.getElementById("local-residual-slider");
    els.localResidualReadout = document.getElementById("local-residual-readout");
    els.runDetectionButton = document.getElementById("run-detection-button");
    els.restoreAutoButton = document.getElementById("restore-auto-button");

    els.activeLabelSelect = document.getElementById("active-label-select");
    els.labelLegend = document.getElementById("label-legend");
    els.editingNote = document.getElementById("editing-note");
    els.toolButtons = Array.from(document.querySelectorAll("[data-tool]"));
    els.toggleOverlayButton = document.getElementById("toggle-overlay-button");
    els.toggleReferenceOverlayButton = document.getElementById("toggle-reference-overlay-button");
    els.clearSelectionButton = document.getElementById("clear-selection-button");

    els.resultsNote = document.getElementById("results-note");
    els.metricCoronaryVolume = document.getElementById("metric-coronary-volume");
    els.metricTotalVolume = document.getElementById("metric-total-volume");
    els.metricMass = document.getElementById("metric-mass");
    els.metricAgatstonStyle = document.getElementById("metric-agatston-style");
    els.resultsTableBody = document.getElementById("results-table-body");
    els.exportCsvButton = document.getElementById("export-csv-button");
    els.exportPngButton = document.getElementById("export-png-button");

    els.viewerTitle = document.getElementById("viewer-title");
    els.viewerSubtitle = document.getElementById("viewer-subtitle");
    els.sliceBadge = document.getElementById("slice-badge");
    els.toolBadge = document.getElementById("tool-badge");
    els.pointerBadge = document.getElementById("pointer-badge");
    els.canvasWrap = document.getElementById("canvas-wrap");
    els.presentationResetWindowButton = document.getElementById("presentation-reset-window-button");
    els.presentationResetFitButton = document.getElementById("presentation-reset-fit-button");
    els.imageCanvas = document.getElementById("image-canvas");
    els.overlayCanvas = document.getElementById("overlay-canvas");
    els.canvasOverlayMessage = document.getElementById("canvas-overlay-message");
    els.sliceSlider = document.getElementById("slice-slider");
    els.selectionReadout = document.getElementById("selection-readout");
    els.interactionReadout = document.getElementById("interaction-readout");
    els.presetButtons = Array.from(document.querySelectorAll("[data-preset]"));
    els.viewerModeButtons = Array.from(document.querySelectorAll("[data-viewer-mode]"));
    els.resetViewButton = document.getElementById("reset-view-button");
    els.resetWindowButton = document.getElementById("reset-window-button");
    els.viewReadout = document.getElementById("view-readout");

    els.lesionNote = document.getElementById("lesion-note");
    els.lesionList = document.getElementById("lesion-list");
    els.metadataNote = document.getElementById("metadata-note");
    els.metadataList = document.getElementById("metadata-list");

    els.finishModal = document.getElementById("finish-modal");
    els.finishStudyIdInput = document.getElementById("finish-study-id-input");
    els.finishModalError = document.getElementById("finish-modal-error");
    els.finishCancelButton = document.getElementById("finish-cancel-button");
    els.finishConfirmButton = document.getElementById("finish-confirm-button");
    els.exportStudySelect = document.getElementById("export-study-select");
    els.exportStudyCreateInput = document.getElementById("export-study-create-input");
    els.exportStudyCreateButton = document.getElementById("export-study-create-button");
    els.exportStudyTargetNote = document.getElementById("export-study-target-note");
  }

  function getActiveSeries() {
    return state.seriesCandidates.find((candidate) => candidate.id === state.activeSeriesId) || null;
  }

  function getSelectedSeries() {
    return state.seriesCandidates.find((candidate) => candidate.id === state.selectedSeriesId) || null;
  }

  function getScoringSliceRange() {
    if (!state.activeVolume) {
      return null;
    }
    const top = clamp(
      Math.min(state.analysis.scoringSlices.top, state.analysis.scoringSlices.bottom),
      0,
      Math.max(0, state.activeVolume.depth - 1)
    );
    const bottom = clamp(
      Math.max(state.analysis.scoringSlices.top, state.analysis.scoringSlices.bottom),
      0,
      Math.max(0, state.activeVolume.depth - 1)
    );
    return { top, bottom };
  }

  function initializeScoringSliceRange(volume) {
    if (!volume) {
      return;
    }
    const defaultTop = clamp(Math.floor(volume.depth * 0.12), 0, Math.max(0, volume.depth - 1));
    const defaultBottom = clamp(Math.ceil(volume.depth * 0.88) - 1, defaultTop, Math.max(0, volume.depth - 1));
    state.analysis.scoringSlices = { top: defaultTop, bottom: defaultBottom };
  }

  function applyScoringSliceInputs() {
    if (!state.activeVolume) {
      return;
    }
    const maxSlice = Math.max(1, state.activeVolume.depth);
    const top = clamp((Number.parseInt(els.scoreTopSliceInput.value, 10) || 1) - 1, 0, maxSlice - 1);
    const bottom = clamp((Number.parseInt(els.scoreBottomSliceInput.value, 10) || maxSlice) - 1, 0, maxSlice - 1);
    state.analysis.scoringSlices.top = top;
    state.analysis.scoringSlices.bottom = bottom;
  }

  function getDefaultVoiForPreset(presetName = state.currentPreset) {
    const preset = VIEW_PRESETS[presetName] || VIEW_PRESETS.contrast;
    return {
      width: preset.width,
      center: preset.center,
    };
  }

  function getCurrentVoi(presetName = state.currentPreset) {
    const custom = state.view.customVoiByPreset?.[presetName];
    if (custom && Number.isFinite(custom.width) && Number.isFinite(custom.center)) {
      return {
        width: custom.width,
        center: custom.center,
      };
    }
    return getDefaultVoiForPreset(presetName);
  }

  function applyWindowing(nextVoi, options = {}) {
    const defaultVoi = getDefaultVoiForPreset();
    const rawWidth = Number(nextVoi?.width);
    const rawCenter = Number(nextVoi?.center);
    const width = clamp(Number.isFinite(rawWidth) ? rawWidth : defaultVoi.width, 1, 4000);
    const center = clamp(Number.isFinite(rawCenter) ? rawCenter : defaultVoi.center, -1500, 3000);
    state.view.customVoiByPreset[state.currentPreset] = { width, center };
    if (!options.silent) {
      setStatus(`Window updated to W ${Math.round(width)} / L ${Math.round(center)}.`);
    }
    syncControlsFromState();
    requestRender();
  }

  function resetCurrentWindowing(options = {}) {
    delete state.view.customVoiByPreset[state.currentPreset];
    if (!options.silent) {
      const voi = getCurrentVoi();
      setStatus(`Window reset to W ${Math.round(voi.width)} / L ${Math.round(voi.center)}.`);
    }
    syncControlsFromState();
    requestRender();
  }

  function setViewerMode(mode, options = {}) {
    const nextMode = VIEWER_MODE_LABELS[mode] ? mode : "edit";
    state.view.interactionMode = nextMode;
    syncControlsFromState();
    updateSelectionUi();
    requestRender();
    if (!options.silent) {
      setStatus(
        nextMode === "edit"
          ? `Returned to edit mode using ${TOOLS[state.tool] || "Assign / Draw"}.`
          : `${VIEWER_MODE_LABELS[nextMode]} mode active.`
      );
    }
  }

  function returnToPrimaryTool(options = {}) {
    state.tool = "tapLabel";
    setViewerMode("edit", { silent: true });
    refreshDerivedUi();
    if (!options.silent) {
      setStatus(`Returned to edit mode using ${TOOLS[state.tool] || "Assign / Draw"}.`);
    }
  }

  function resetViewTransform(options = {}) {
    state.view.zoom = 1;
    state.view.panX = 0;
    state.view.panY = 0;
    syncControlsFromState();
    requestRender();
    if (!options.silent) {
      setStatus("View reset to fit.");
    }
  }

  function getCanvasPointFromEvent(event) {
    const rect = els.overlayCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (event.clientX - rect.left) * dpr,
      y: (event.clientY - rect.top) * dpr,
    };
  }

  function setZoom(nextZoom, focusCanvasPoint) {
    const clampedZoom = clamp(Number(nextZoom) || 1, 0.35, 8);
    if (!state.activeVolume) {
      state.view.zoom = clampedZoom;
      syncControlsFromState();
      requestRender();
      return;
    }

    const previousGeometry = state.canvasGeometry || computeCanvasGeometry(
      els.imageCanvas,
      state.activeVolume.columns,
      state.activeVolume.rows
    );
    const focusImagePoint =
      focusCanvasPoint && previousGeometry
        ? {
            x: (focusCanvasPoint.x - previousGeometry.drawX) / previousGeometry.scale,
            y: (focusCanvasPoint.y - previousGeometry.drawY) / previousGeometry.scale,
          }
        : null;

    state.view.zoom = clampedZoom;

    if (
      focusImagePoint &&
      Number.isFinite(focusImagePoint.x) &&
      Number.isFinite(focusImagePoint.y) &&
      focusImagePoint.x >= 0 &&
      focusImagePoint.x <= state.activeVolume.columns - 1 &&
      focusImagePoint.y >= 0 &&
      focusImagePoint.y <= state.activeVolume.rows - 1
    ) {
      const nextGeometry = computeCanvasGeometry(
        els.imageCanvas,
        state.activeVolume.columns,
        state.activeVolume.rows
      );
      const projectedPoint = {
        x: nextGeometry.drawX + focusImagePoint.x * nextGeometry.scale,
        y: nextGeometry.drawY + focusImagePoint.y * nextGeometry.scale,
      };
      state.view.panX += focusCanvasPoint.x - projectedPoint.x;
      state.view.panY += focusCanvasPoint.y - projectedPoint.y;
    }

    syncControlsFromState();
    requestRender();
  }

  function changeZoom(factor, focusCanvasPoint) {
    setZoom(state.view.zoom * factor, focusCanvasPoint);
  }

  function setCurrentSliceIndex(nextIndex) {
    if (!state.activeVolume) {
      return;
    }
    const clampedIndex = clamp(
      Number.isFinite(nextIndex) ? Math.round(nextIndex) : state.activeSliceIndex,
      0,
      Math.max(0, state.activeVolume.depth - 1)
    );
    if (clampedIndex === state.activeSliceIndex) {
      return;
    }
    state.activeSliceIndex = clampedIndex;
    syncControlsFromState();
    updateSelectionUi();
    requestRender();
  }

  function createEmptyOverrideSlices() {
    return new Map();
  }

  function setOverrideValue(sliceIndex, pixelIndex, value) {
    if (!(state.analysis.overrideLabelSlices instanceof Map)) {
      state.analysis.overrideLabelSlices = createEmptyOverrideSlices();
    }
    let sliceOverrides = state.analysis.overrideLabelSlices.get(sliceIndex);
    if (!sliceOverrides) {
      sliceOverrides = new Map();
      state.analysis.overrideLabelSlices.set(sliceIndex, sliceOverrides);
    }
    sliceOverrides.set(pixelIndex, value);
  }

  function clearOverrideSlices() {
    state.analysis.overrideLabelSlices = createEmptyOverrideSlices();
  }

  function composeLabelSlicesFromState() {
    if (!state.activeVolume) {
      state.analysis.labelSlices = [];
      return;
    }
    const composed = composeLabelSlices({
      volume: state.activeVolume,
      autoLabelSlices: state.analysis.autoLabelSlices,
      overrideLabelSlices: state.analysis.overrideLabelSlices,
      slabRange: state.analysis.scoringSlices,
    });
    state.analysis.labelSlices = composed.labelSlices;
  }

  function getUserFacingErrorMessage(error, fallbackMessage) {
    const message = String(error?.message || "").trim();
    if (
      error instanceof RangeError ||
      /array buffer allocation failed|invalid array length|out of memory|allocation failed/i.test(message)
    ) {
      return "The selected CTA stack is too large for the current browser memory budget. Try narrowing the z-range first, or reload a smaller or thinner series before estimating.";
    }
    return message || fallbackMessage;
  }

  function rebuildOutputsFromState() {
    if (!state.activeVolume || !state.analysis.methodSummary) {
      state.analysis.componentLookupBySlice = [];
      state.analysis.components = [];
      state.analysis.results = null;
      refreshDerivedUi();
      requestRender();
      return;
    }

    const rebuilt = rebuildAnalysisOutputs({
      volume: state.activeVolume,
      labelSlices: state.analysis.labelSlices,
      methodSummary: state.analysis.methodSummary,
      config: state.analysis,
    });
    state.analysis.componentLookupBySlice = rebuilt.componentLookupBySlice;
    state.analysis.components = rebuilt.components;
    state.analysis.results = rebuilt.results;
    if (
      state.analysis.activeComponentId != null &&
      !state.analysis.components.some((component) => component.id === state.analysis.activeComponentId)
    ) {
      state.analysis.activeComponentId = null;
    }
    refreshDerivedUi();
    requestRender();
  }

  function formatNumber(value, decimals = 1) {
    return Number.isFinite(value) ? value.toFixed(decimals).replace(/\.?0+$/, "") : "-";
  }

  function formatMm3(value) {
    return Number.isFinite(value) ? `${formatNumber(value, 1)} mm3` : "-";
  }

  function formatMg(value) {
    return Number.isFinite(value) ? `${formatNumber(value, 2)} mg` : "-";
  }

  function formatScore(value) {
    return Number.isFinite(value) ? formatNumber(value, 1) : "-";
  }

  function formatMm(value) {
    return Number.isFinite(value) ? `${formatNumber(value, 2)} mm` : "-";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function setStatus(message, tone) {
    els.statusPill.textContent = message;
    els.statusPill.dataset.tone = tone || "";
  }

  function closeFinishModal() {
    state.finishModalOpen = false;
    if (els.finishModal) {
      els.finishModal.hidden = true;
    }
  }

  function openFinishModal() {
    if (!state.analysis.results) {
      return;
    }
    state.finishModalOpen = true;
    els.finishModal.hidden = false;
    els.finishModalError.hidden = true;
    refreshExportStudyOptions().catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not load export studies.", "error");
    });
    els.finishStudyIdInput.focus();
    els.finishStudyIdInput.select();
  }

  function clearPointer() {
    state.pointer = {
      imageX: null,
      imageY: null,
      pixelIndex: null,
      hu: null,
      inside: false,
    };
    updateSelectionUi();
    requestRender();
  }

  function clearStudy(options) {
    resetHistory();
    state.studyRecords = [];
    state.seriesCandidates = [];
    state.selectedSeriesId = null;
    state.activeSeriesId = null;
    state.activeVolume = null;
    state.activeRecords = [];
    state.activeSliceIndex = 0;
    state.currentPreset = "contrast";
    state.workflowStep = "series";
    state.tool = "tapLabel";
    state.selectedLabelCode = 1;
    state.overlayVisible = true;
    state.referenceOverlayVisible = true;
    state.referenceSamplingTarget = null;
    state.referenceRoiRadiusPx = 7;
    state.view = createInitialViewState();
    state.dragging = null;
    state.finishModalOpen = false;
    state.references = createInitialReferenceStore();
    state.analysis = {
      minAreaMm2: 0.8,
      massCalibrationFactor: 0.81,
      minResidualHu: 35,
      localResidualHu: 18,
      scoringSlices: { top: 0, bottom: 0 },
      autoLabelSlices: [],
      overrideLabelSlices: new Map(),
      labelSlices: [],
      componentLookupBySlice: [],
      components: [],
      activeComponentId: null,
      results: null,
      detectionStamp: 0,
      methodSummary: null,
    };
    if (els.finishStudyIdInput) {
      els.finishStudyIdInput.value = "";
    }
    closeFinishModal();
    clearPointer();
    refreshDerivedUi();
    updateSeriesListUi();
    requestRender();
    if (!options?.silent) {
      setStatus("Ready for a post-contrast coronary CTA or cardiac CT series.");
    }
  }

  async function importStudyFiles(fileList, options = {}) {
    const files = Array.from(fileList || []).filter((file) => file.size > 0);
    if (!files.length) {
      return;
    }

    setStatus(`Reading ${files.length} files...`);
    const records = await parseDicomFiles(files);
    if (!records.length) {
      throw new Error("No readable DICOM files were found.");
    }

    state.studyRecords = options.append ? state.studyRecords.concat(records) : records;
    state.seriesCandidates = buildSeriesCandidates(state.studyRecords);
    state.selectedSeriesId = state.seriesCandidates[0]?.id || null;
    state.workflowStep = "series";

    if (!options.append) {
      resetHistory();
      state.activeSeriesId = null;
      state.activeVolume = null;
      state.activeRecords = [];
      state.references = createInitialReferenceStore();
      state.analysis.autoLabelSlices = [];
      state.analysis.overrideLabelSlices = createEmptyOverrideSlices();
      state.analysis.labelSlices = [];
      state.analysis.components = [];
      state.analysis.componentLookupBySlice = [];
      state.analysis.results = null;
      state.analysis.methodSummary = null;
    }

    updateSeriesListUi();
    refreshDerivedUi();
    setStatus(
      `Loaded ${state.seriesCandidates.length} candidate series.${options.append ? " Added to the current study list." : ""}`
    );
  }

  async function loadSeriesById(seriesId) {
    const candidate = state.seriesCandidates.find((entry) => entry.id === seriesId);
    if (!candidate) {
      return;
    }
    state.selectedSeriesId = seriesId;
    updateSeriesListUi();

    if (!candidate.volume) {
      candidate.volume = await buildVolume(candidate.records, {
        onProgress(message) {
          setStatus(message);
        },
      });
    }

    state.activeSeriesId = candidate.id;
    state.activeVolume = candidate.volume;
    state.activeRecords = candidate.records;
    state.activeSliceIndex = Math.floor(candidate.volume.depth / 2);
    initializeScoringSliceRange(candidate.volume);
    state.references = createInitialReferenceStore();
    state.referenceSamplingTarget = null;
    state.view = createInitialViewState();
    state.analysis.autoLabelSlices = [];
    state.analysis.overrideLabelSlices = createEmptyOverrideSlices();
    state.analysis.labelSlices = [];
    state.analysis.componentLookupBySlice = [];
    state.analysis.components = [];
    state.analysis.activeComponentId = null;
    state.analysis.results = null;
    state.analysis.methodSummary = null;
    state.analysis.detectionStamp = 0;
    state.workflowStep = "range";

    refreshDerivedUi();
    requestRender();
    resetHistory();
    pushHistorySnapshot("Loaded series");
    setStatus(
      `Loaded ${candidate.label}. Confirm the slab, pick references, and run the research estimate.`
    );
  }

  function commitRange(statusMessage) {
    const range = getScoringSliceRange();
    if (!range || !state.activeVolume) {
      return;
    }
    state.activeSliceIndex = clamp(state.activeSliceIndex, range.top, range.bottom);
    state.workflowStep = "references";
    refreshDerivedUi();
    requestRender();
    if (state.analysis.detectionStamp > 0) {
      runEstimation({ preserveOverrides: true }).catch((error) => {
        console.error(error);
        setStatus(getUserFacingErrorMessage(error, "Re-estimation failed after range change."), "error");
      });
      return;
    }
    pushHistorySnapshot("Updated z-range");
    setStatus(statusMessage || "Updated the analysis slab. Pick references when ready.");
  }

  function addReferencePick(referenceKey, point) {
    if (!state.activeVolume) {
      return;
    }
    const sample = sampleCircularRoi(
      state.activeVolume,
      state.activeSliceIndex,
      point.imageX,
      point.imageY,
      state.referenceRoiRadiusPx
    );
    if (!sample) {
      setStatus("Reference sampling failed at the selected location.", "warning");
      return;
    }
    state.references[referenceKey].picks.push(sample);
    state.workflowStep = hasRequiredReferences(state.references) ? "estimate" : "references";
    refreshDerivedUi();
    requestRender();
    pushHistorySnapshot("Added reference ROI");
    setStatus(`Added ${getReferenceLabel(referenceKey)} sample on slice ${state.activeSliceIndex + 1}.`);
  }

  function addReferenceDrawnPick(referenceKey, points) {
    if (!state.activeVolume) {
      return;
    }
    const sample = samplePolygonRoi(state.activeVolume, state.activeSliceIndex, points);
    if (!sample) {
      setStatus("Draw a larger closed ROI for reference sampling.", "warning");
      return;
    }
    state.references[referenceKey].picks.push(sample);
    state.workflowStep = hasRequiredReferences(state.references) ? "estimate" : "references";
    refreshDerivedUi();
    requestRender();
    pushHistorySnapshot("Added drawn reference ROI");
    setStatus(`Added drawn ${getReferenceLabel(referenceKey)} ROI on slice ${state.activeSliceIndex + 1}.`);
  }

  function clearReference(referenceKey) {
    state.references[referenceKey].picks = [];
    if (state.referenceSamplingTarget === referenceKey) {
      state.referenceSamplingTarget = null;
    }
    refreshDerivedUi();
    requestRender();
    pushHistorySnapshot("Cleared reference ROI");
    setStatus(`Cleared ${getReferenceLabel(referenceKey)} samples.`);
  }

  function getReferenceLabel(referenceKey) {
    return REFERENCE_DEFINITIONS.find((definition) => definition.key === referenceKey)?.label || "Reference";
  }

  async function runEstimation(options = {}) {
    if (!state.activeVolume) {
      throw new Error("Load a series before estimating calcification.");
    }
    try {
      const candidate = getActiveSeries();
      const estimation = runContrastEstimation({
        volume: state.activeVolume,
        slabRange: state.analysis.scoringSlices,
        seriesCandidate: candidate,
        referenceStore: state.references,
        config: state.analysis,
      });

      state.analysis.autoLabelSlices = estimation.autoLabelSlices;
      state.analysis.methodSummary = estimation.methodSummary;
      if (
        !options.preserveOverrides ||
        !(state.analysis.overrideLabelSlices instanceof Map) ||
        !state.analysis.overrideLabelSlices.size
      ) {
        clearOverrideSlices();
      }
      composeLabelSlicesFromState();
      state.analysis.activeComponentId = null;
      state.analysis.detectionStamp += 1;
      state.workflowStep = "review";
      rebuildOutputsFromState();
      pushHistorySnapshot("Estimated calcification");

      const branchCopy = state.analysis.methodSummary.usesVncLikeImage
        ? "Used the spectral/VNC-like research branch."
        : state.analysis.methodSummary.spectralAware
          ? "Used the spectral-aware post-contrast research branch."
          : "Used the conventional single-energy post-contrast research branch.";
      setStatus(
        `${branchCopy} Manual label and erase overrides remain active after re-estimation.`
      );
    } catch (error) {
      throw new Error(getUserFacingErrorMessage(error, "Estimation failed."));
    }
  }

  function restoreAutoEstimate() {
    if (!state.activeVolume || !state.analysis.methodSummary) {
      return;
    }
    clearOverrideSlices();
    composeLabelSlicesFromState();
    state.analysis.activeComponentId = null;
    rebuildOutputsFromState();
    state.workflowStep = "review";
    pushHistorySnapshot("Restored automatic estimate");
    setStatus("Restored the automatic research estimate and cleared manual overrides.");
  }

  function selectComponentAt(pixelIndex) {
    const lookup = state.analysis.componentLookupBySlice[state.activeSliceIndex];
    const componentId = lookup?.get(pixelIndex) || null;
    state.analysis.activeComponentId = componentId;
    updateSelectionUi();
    requestRender();
    return componentId;
  }

  function relabelComponent(componentId, labelCode) {
    const component = state.analysis.components.find((entry) => entry.id === componentId);
    if (!component) {
      return;
    }
    component.pixelsBySlice.forEach((pixels, sliceIndex) => {
      pixels.forEach((pixelIndex) => {
        setOverrideValue(sliceIndex, pixelIndex, labelCode);
      });
    });
    composeLabelSlicesFromState();
    rebuildOutputsFromState();
    pushHistorySnapshot("Relabeled lesion");
    setStatus(`Assigned lesion ${componentId} to ${getLabelName(labelCode)}.`);
  }

  function selectExistingComponent(point) {
    const componentId = selectComponentAt(point.pixelIndex);
    if (componentId != null) {
      setStatus(`Selected lesion ${componentId}. Change the active category to relabel it.`);
      return true;
    }
    return false;
  }

  function excludeComponent(componentId) {
    const component = state.analysis.components.find((entry) => entry.id === componentId);
    if (!component) {
      return;
    }
    component.pixelsBySlice.forEach((pixels, sliceIndex) => {
      pixels.forEach((pixelIndex) => {
        setOverrideValue(sliceIndex, pixelIndex, -1);
      });
    });
    state.analysis.activeComponentId = null;
    composeLabelSlicesFromState();
    rebuildOutputsFromState();
    pushHistorySnapshot("Excluded lesion");
    setStatus(`Excluded lesion ${componentId}.`);
  }

  function manuallyLabelSeedComponent(pixelIndex, labelCode) {
    const pixels = growThresholdComponentFromSeed(
      state.activeVolume,
      state.activeSliceIndex,
      pixelIndex,
      state.analysis.methodSummary
    );
    if (!pixels.length) {
      setStatus("Click a bright candidate or draw a region to add a manual lesion.", "warning");
      return;
    }
    pixels.forEach((currentIndex) => {
      setOverrideValue(state.activeSliceIndex, currentIndex, labelCode);
    });
    composeLabelSlicesFromState();
    rebuildOutputsFromState();
    pushHistorySnapshot("Added manual lesion");
    setStatus(`Added a manual ${getLabelName(labelCode)} lesion on slice ${state.activeSliceIndex + 1}.`);
  }

  function eraseSeedComponent(pixelIndex) {
    const componentId = selectComponentAt(pixelIndex);
    if (componentId != null) {
      excludeComponent(componentId);
      return;
    }
    const pixels = growThresholdComponentFromSeed(
      state.activeVolume,
      state.activeSliceIndex,
      pixelIndex,
      state.analysis.methodSummary
    );
    if (!pixels.length) {
      setStatus("Erase over a candidate you want to exclude.", "warning");
      return;
    }
    pixels.forEach((currentIndex) => {
      setOverrideValue(state.activeSliceIndex, currentIndex, -1);
    });
    composeLabelSlicesFromState();
    rebuildOutputsFromState();
    pushHistorySnapshot("Erased manual lesion");
    setStatus(`Excluded a manual candidate on slice ${state.activeSliceIndex + 1}.`);
  }

  function applyPolygonEditOnCurrentSlice(points, mode, labelCode) {
    if (!state.activeVolume || !state.analysis.methodSummary) {
      return;
    }
    const normalized = normalizeContourPoints(points, state.activeVolume);
    if (normalized.length < 3 || polygonArea(normalized) < 20) {
      setStatus("Draw a larger closed region.", "warning");
      return;
    }

    let changedCount = 0;
    for (let y = 0; y < state.activeVolume.rows; y += 1) {
      for (let x = 0; x < state.activeVolume.columns; x += 1) {
        if (!pointInPolygon(normalized, x + 0.5, y + 0.5)) {
          continue;
        }
        const pixelIndex = y * state.activeVolume.columns + x;
        if (mode === "erase") {
          setOverrideValue(state.activeSliceIndex, pixelIndex, -1);
          changedCount += 1;
          continue;
        }
        const hu = getSliceHuValue(state.activeVolume, state.activeSliceIndex, pixelIndex);
        if (Number.isFinite(hu) && hu >= state.analysis.methodSummary.manualSeedThresholdHu) {
          setOverrideValue(state.activeSliceIndex, pixelIndex, labelCode);
          changedCount += 1;
        }
      }
    }

    composeLabelSlicesFromState();
    rebuildOutputsFromState();
    if (changedCount) {
      pushHistorySnapshot(mode === "erase" ? "Erased drawn region" : "Added drawn region");
    }
    setStatus(
      mode === "erase"
        ? `Erased everything inside the drawn region on slice ${state.activeSliceIndex + 1}.`
        : `Assigned everything inside the drawn region on slice ${state.activeSliceIndex + 1} to ${getLabelName(labelCode)}.`,
      changedCount ? null : "warning"
    );
  }

  function updateControlStates() {
    const hasSelectedSeries = Boolean(getSelectedSeries());
    const hasVolume = Boolean(state.activeVolume);
    const hasResults = Boolean(state.analysis.results);
    const maxSliceValue = Math.max(1, state.activeVolume?.depth || 1);
    const hasRequiredRefs = hasRequiredReferences(state.references);

    els.loadSelectedSeriesButton.disabled = !hasSelectedSeries;
    els.scoreTopSliceInput.disabled = !hasVolume;
    els.scoreBottomSliceInput.disabled = !hasVolume;
    els.scoreTopSliceInput.max = String(maxSliceValue);
    els.scoreBottomSliceInput.max = String(maxSliceValue);
    els.setScoreTopButton.disabled = !hasVolume;
    els.setScoreBottomButton.disabled = !hasVolume;
    els.useFullScoreRangeButton.disabled = !hasVolume;
    els.referenceRadiusSlider.disabled = !hasVolume;
    els.minAreaSlider.disabled = !hasVolume;
    els.massFactorInput.disabled = !hasVolume;
    els.minResidualSlider.disabled = !hasVolume;
    els.localResidualSlider.disabled = !hasVolume;
    els.runDetectionButton.disabled = !hasVolume || !hasRequiredRefs;
    els.restoreAutoButton.disabled = !state.analysis.methodSummary;
    els.finishCloseButton.disabled = !hasResults;
    els.activeLabelSelect.disabled = !hasVolume;
    els.toggleOverlayButton.disabled = !hasResults;
    els.toggleReferenceOverlayButton.disabled = !hasVolume;
    els.clearSelectionButton.disabled = !state.analysis.activeComponentId;
    els.exportCsvButton.disabled = !hasResults;
    els.exportPngButton.disabled = !hasVolume;
    els.sliceSlider.disabled = !hasVolume;
    els.sliceSlider.max = String(Math.max(0, maxSliceValue - 1));
    els.viewerModeButtons.forEach((button) => {
      button.disabled = !hasVolume;
    });
    els.resetViewButton.disabled = !hasVolume;
    els.resetWindowButton.disabled = !hasVolume;
    els.toolButtons.forEach((button) => {
      button.disabled = !hasResults;
    });
    els.referenceCardGrid.querySelectorAll("button").forEach((button) => {
      button.disabled = !hasVolume && button.dataset.referencePick;
    });
  }

  function syncControlsFromState() {
    const scoringRange = getScoringSliceRange();
    const voi = getCurrentVoi();
    els.scoreRangeReadout.textContent = scoringRange
      ? `Slices ${scoringRange.top + 1} to ${scoringRange.bottom + 1}`
      : "Slices - to -";
    els.scoreTopSliceInput.value = String((scoringRange?.top ?? 0) + 1);
    els.scoreBottomSliceInput.value = String((scoringRange?.bottom ?? 0) + 1);
    els.referenceRadiusSlider.value = String(state.referenceRoiRadiusPx);
    els.referenceRadiusReadout.textContent = `${state.referenceRoiRadiusPx} px`;
    els.minAreaSlider.value = String(state.analysis.minAreaMm2);
    els.minAreaReadout.textContent = `${state.analysis.minAreaMm2.toFixed(1)} mm2`;
    els.massFactorInput.value = String(state.analysis.massCalibrationFactor);
    els.minResidualSlider.value = String(state.analysis.minResidualHu);
    els.minResidualReadout.textContent = `${state.analysis.minResidualHu} HU`;
    els.localResidualSlider.value = String(state.analysis.localResidualHu);
    els.localResidualReadout.textContent = `${state.analysis.localResidualHu} HU`;
    els.activeLabelSelect.value = String(state.selectedLabelCode);
    els.sliceSlider.value = String(state.activeSliceIndex || 0);
    els.toggleOverlayButton.classList.toggle("is-active", state.overlayVisible);
    els.toggleReferenceOverlayButton.classList.toggle("is-active", state.referenceOverlayVisible);
    els.toggleOverlayButton.textContent = `Lesion Overlay${state.overlayVisible ? "" : " Off"}`;
    els.toggleReferenceOverlayButton.textContent = `Reference Overlay${state.referenceOverlayVisible ? "" : " Off"}`;
    els.toolButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tool === state.tool);
    });
    els.presetButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.preset === state.currentPreset);
    });
    els.viewerModeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.viewerMode === state.view.interactionMode);
    });
    els.viewReadout.textContent = `WW ${Math.round(voi.width)} / WL ${Math.round(voi.center)} • Zoom ${Math.round(state.view.zoom * 100)}% • Right-drag scroll`;
    renderLabelLegend();
    updateCanvasCursor();
  }

  function renderLabelLegend() {
    els.labelLegend.innerHTML = LABELS.map(
      (label) =>
        `<span class="label-chip${label.code === state.selectedLabelCode ? " is-active" : ""}" data-label-chip="${label.code}" style="--label-stroke:${label.stroke};">
          <span class="label-swatch" style="background:${label.stroke};"></span>${escapeHtml(label.label)}
        </span>`
    ).join("");
  }

  function updateGuideUi() {
    const currentIndex = WORKFLOW_STEPS.findIndex((step) => step.key === state.workflowStep);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const activeStep = WORKFLOW_STEPS[safeIndex];
    els.workflowNote.textContent = activeStep.detail;
    els.guideProgressFill.style.width = `${((safeIndex + 1) / WORKFLOW_STEPS.length) * 100}%`;
    els.guideActionTitle.textContent = activeStep.title;
    els.guideActionCopy.textContent = activeStep.detail;
    els.guideStepList.innerHTML = "";
    WORKFLOW_STEPS.forEach((step, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "guide-step";
      if (index < safeIndex) {
        button.classList.add("is-done");
      }
      if (index === safeIndex) {
        button.classList.add("is-current");
      }
      button.dataset.workflowStep = step.key;
      button.innerHTML = `
        <span class="guide-step-index">${step.number}</span>
        <span class="guide-step-copy">
          <strong>${escapeHtml(step.title)}</strong>
          <span>${escapeHtml(step.detail)}</span>
        </span>
        <span class="guide-step-jump" aria-hidden="true">›</span>
      `;
      els.guideStepList.appendChild(button);
    });
  }

  function updateSeriesListUi() {
    els.seriesSummary.textContent = `${state.seriesCandidates.length} candidate series loaded`;
    if (!state.seriesCandidates.length) {
      els.seriesList.innerHTML = '<p class="empty-copy">Load DICOM files to rank candidate post-contrast CTA series.</p>';
      return;
    }

    els.seriesList.innerHTML = "";
    state.seriesCandidates.forEach((candidate, index) => {
      const card = document.createElement("article");
      const selected = candidate.id === state.selectedSeriesId;
      const active = candidate.id === state.activeSeriesId;
      card.className = `series-card${selected ? " is-selected" : ""}${active ? " is-active" : ""}`;
      const characterization = candidate.characterization || {};
      const thickness = Number.isFinite(candidate.meta?.sliceThickness)
        ? `${formatNumber(candidate.meta.sliceThickness, 2)} mm`
        : "-";
      const spacing =
        candidate.meta?.pixelSpacing?.length >= 2
          ? `${formatNumber(candidate.meta.pixelSpacing[0], 2)} x ${formatNumber(candidate.meta.pixelSpacing[1], 2)}`
          : "-";
      const why = candidate.reasons.length ? candidate.reasons.join(" • ") : "No ranking reasons";
      const caution = candidate.cautions.length ? candidate.cautions.join(" • ") : "No obvious cautions";
      const tags = [
        characterization.contrastLikely ? "Contrast CTA" : null,
        characterization.spectralCapable ? "Spectral" : null,
        characterization.vncLike ? "VNC-like" : null,
      ].filter(Boolean);
      card.innerHTML = `
        <div class="series-card-header">
          <div>
            <strong>${escapeHtml(candidate.label)}</strong>
            <small>${escapeHtml(candidate.studyLabel)} • ${escapeHtml(candidate.acquisitionLabel || "Unknown acquisition")}</small>
          </div>
          <span class="series-badge">${index === 0 ? "Recommended" : "Candidate"} • ${candidate.score}</span>
        </div>
        <div class="series-meta">
          <div><span>Slices</span><strong>${candidate.recordCount}</strong></div>
          <div><span>Thickness</span><strong>${escapeHtml(thickness)}</strong></div>
          <div><span>Spacing</span><strong>${escapeHtml(spacing)}</strong></div>
          <div><span>Kernel</span><strong>${escapeHtml(candidate.meta?.convolutionKernel || "-")}</strong></div>
        </div>
        <div class="series-tags">${tags.map((tag) => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join("")}</div>
        <div class="series-summary"><strong>Why:</strong> ${escapeHtml(why)}</div>
        <div class="series-summary"><strong>Caution:</strong> ${escapeHtml(caution)}</div>
        <div class="series-card-actions">
          <button class="button tertiary" type="button" data-series-select="${escapeHtml(candidate.id)}">Select</button>
          <button class="button tertiary" type="button" data-series-load="${escapeHtml(candidate.id)}">Load</button>
        </div>
      `;
      els.seriesList.appendChild(card);
    });
  }

  function updateReferencesUi() {
    const summaries = REFERENCE_DEFINITIONS.map((definition) => {
      const picks = state.references[definition.key]?.picks || [];
      if (!picks.length) {
        return { definition, summary: null, picks };
      }
      const meanHu =
        picks.reduce((sum, pick) => sum + pick.meanHu * Math.max(1, pick.pixelCount || 1), 0) /
        Math.max(1, picks.reduce((sum, pick) => sum + Math.max(1, pick.pixelCount || 1), 0));
      const sdHu = picks.reduce((sum, pick) => sum + (pick.sdHu || 0), 0) / Math.max(1, picks.length);
      const areaMm2 = picks.reduce((sum, pick) => sum + (pick.areaMm2 || 0), 0) / Math.max(1, picks.length);
      return {
        definition,
        picks,
        summary: {
          meanHu,
          sdHu,
          areaMm2,
          lastSlice: picks[picks.length - 1]?.sliceIndex ?? null,
        },
      };
    });

    const requiredDone = summaries.filter((entry) => entry.definition.required && entry.summary).length;
    const requiredTotal = summaries.filter((entry) => entry.definition.required).length;
    els.referencesSummary.textContent = `${requiredDone} / ${requiredTotal} required references ready`;

    els.referenceCardGrid.innerHTML = summaries
      .map(({ definition, summary, picks }) => {
        const isActive = state.referenceSamplingTarget === definition.key;
        const readout = summary
          ? `${picks.length} pick${picks.length === 1 ? "" : "s"} • mean ${Math.round(summary.meanHu)} HU • SD ${formatNumber(summary.sdHu, 1)} • area ${formatNumber(summary.areaMm2, 1)} mm2 • last slice ${summary.lastSlice + 1}`
          : `${definition.hint} Click for a circular ROI or drag to draw one on the current slice.`;
        return `
          <article class="reference-card${isActive ? " is-active" : ""}">
            <div class="reference-label-row">
              <span class="reference-label">${escapeHtml(definition.label)}</span>
              <span class="reference-badge${definition.required ? " is-required" : ""}">${definition.required ? "Required" : "Optional"}</span>
            </div>
            <div class="reference-row">
              <div class="reference-swatch" style="background:${escapeHtml(definition.swatch)};"></div>
              <div class="reference-actions">
                <button class="button tertiary" type="button" data-reference-pick="${escapeHtml(definition.key)}">${isActive ? "Stop Picking" : "Pick / Draw On Image"}</button>
                <button class="button tertiary" type="button" data-reference-clear="${escapeHtml(definition.key)}"${picks.length ? "" : " disabled"}>Clear</button>
              </div>
            </div>
            <small class="reference-readout">${escapeHtml(readout)}</small>
          </article>
        `;
      })
      .join("");
  }

  function updateMetadataUi() {
    const candidate = getActiveSeries();
    const volume = state.activeVolume;
    if (!candidate || !candidate.meta || !volume) {
      els.metadataNote.textContent = "Metadata will update when a series is loaded.";
      els.metadataList.innerHTML =
        '<div class="meta-row"><dt>Status</dt><dd>Load DICOM files to inspect CTA metadata.</dd></div>';
      els.viewerTitle.textContent = "No series loaded";
      els.viewerSubtitle.textContent =
        "Research-only post-contrast calcification estimation with reference-guided manual editing.";
      return;
    }

    const meta = candidate.meta;
    const methodSummary = state.analysis.methodSummary;
    const characterization = candidate.characterization || {};
    els.metadataNote.textContent = "Series metadata and method branch for the active research run.";
    els.viewerTitle.textContent = candidate.label;
    els.viewerSubtitle.textContent = methodSummary
      ? `${candidate.studyLabel} • ${methodSummary.methodType.replaceAll("_", " ")}${state.currentPreset === "suppressed" ? " • synthetic iodine-suppressed preview" : ""}`
      : `${candidate.studyLabel} • Post-contrast research estimate pending`;

    const rows = [
      ["Patient", meta.patientName || meta.patientId || "-"],
      ["Study / Time", candidate.acquisitionLabel || "-"],
      ["Series", candidate.label || "-"],
      ["Description", meta.seriesDescription || meta.protocolName || "-"],
      ["Method Branch", methodSummary ? methodSummary.methodType : "Not estimated yet"],
      ["Spectral / VNC", characterization.spectralCapable || characterization.vncLike ? "Detected" : "Not obvious"],
      ["Contrast", meta.acquisitionContrast || meta.contrastBolusAgent || "Metadata not explicit"],
      [
        "Spacing",
        `${formatNumber(volume.rowSpacing, 2)} x ${formatNumber(volume.columnSpacing, 2)} x ${formatNumber(volume.sliceSpacing, 2)} mm`,
      ],
      ["Slice Thickness", formatMm(meta.sliceThickness)],
      ["Kernel", meta.convolutionKernel || "-"],
      ["Multienergy Tag", meta.multienergyCtAcquisition || "-"],
    ];

    els.metadataList.innerHTML = rows
      .map(
        ([label, value]) =>
          `<div class="meta-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
      )
      .join("");
  }

  function updateSelectionUi() {
    const modeLabel = VIEWER_MODE_LABELS[state.view.interactionMode] || "Edit";
    els.toolBadge.textContent =
      state.view.interactionMode === "edit"
        ? `Mode: ${modeLabel} / ${TOOLS[state.tool] || "Inspect"}`
        : `Mode: ${modeLabel}`;
    els.pointerBadge.textContent = `HU: ${Number.isFinite(state.pointer.hu) ? Math.round(state.pointer.hu) : "-"}`;
    const component = state.analysis.components.find((entry) => entry.id === state.analysis.activeComponentId) || null;
    els.selectionReadout.textContent = component
      ? `Lesion ${component.id} • ${component.labelName} • ${component.minSlice + 1}-${component.maxSlice + 1} • ${formatMm3(component.volumeMm3)}`
      : "None";

    const toolHint =
      state.referenceSamplingTarget
        ? `Reference picker active: click for a circular ROI or drag to draw ${getReferenceLabel(state.referenceSamplingTarget)} on this slice. Press Esc to stop picking.`
        : state.view.interactionMode === "windowLevel"
          ? "Window mode: left-drag to adjust width and level for the current preset. Press E to return to edit."
          : state.view.interactionMode === "pan"
            ? "Pan mode: left-drag to move the image. Press E to return to edit."
            : state.view.interactionMode === "zoom"
              ? "Zoom mode: left-drag vertically or use the mouse wheel to zoom. Press E to return to edit."
              : state.tool === "tapLabel"
                ? `Edit mode: left click selects or adds to ${getLabelName(state.selectedLabelCode)}. Change the active category to relabel the selected lesion. Right click removes, right-drag scrolls quickly through slices, and left-drag draws an inclusion region.`
                : "Erase mode: left click removes a lesion, left-drag erases everything inside the drawn region, and right-drag scrolls quickly through slices.";

    if (component) {
      els.editingNote.textContent = `Lesion ${component.id} selected as ${component.labelName}. Change the active category to relabel it, or right click to exclude it.`;
      els.interactionReadout.textContent = toolHint;
    } else if (state.referenceSamplingTarget) {
      els.editingNote.textContent = "Reference sampling is active. Click for a circular ROI or drag to draw one on the current slice.";
      els.interactionReadout.textContent = toolHint;
    } else if (state.view.interactionMode !== "edit") {
      els.editingNote.textContent = `${VIEWER_MODE_LABELS[state.view.interactionMode] || "Viewer"} mode is active. Press E to return to lesion editing.`;
      els.interactionReadout.textContent = toolHint;
    } else if (state.analysis.results) {
      els.editingNote.textContent = "Use Assign / Draw for inclusion and relabeling, or Erase for manual exclusion.";
      els.interactionReadout.textContent = toolHint;
    } else {
      els.editingNote.textContent = "Pick the required reference ROIs, then run the research estimate.";
      els.interactionReadout.textContent = state.activeVolume
        ? "Set the slab and sample the required references."
        : "Load a series to begin.";
    }
  }

  function updateResultsUi() {
    const results = state.analysis.results;
    const methodSummary = state.analysis.methodSummary;
    if (!results || !methodSummary) {
      els.resultsNote.textContent = "No research estimate yet.";
      els.metricCoronaryVolume.textContent = "-";
      els.metricTotalVolume.textContent = "-";
      els.metricMass.textContent = "-";
      els.metricAgatstonStyle.textContent = "-";
      els.methodBranchReadout.textContent = "No active branch";
      els.methodBanner.innerHTML = RESEARCH_WARNING_LINES.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
      els.resultsTableBody.innerHTML =
        '<tr><td colspan="6" class="empty-cell">Run the estimate to generate results.</td></tr>';
      return;
    }

    els.resultsNote.textContent = methodSummary.confidenceNote;
    els.metricCoronaryVolume.textContent = formatMm3(results.coronaryVolumeMm3);
    els.metricTotalVolume.textContent = formatMm3(results.totalVolumeMm3);
    els.metricMass.textContent = formatMg(results.equivalentMassMg);
    els.metricAgatstonStyle.textContent = formatScore(results.agatstonStyleScore);
    els.methodBranchReadout.textContent = methodSummary.methodType.replaceAll("_", " ");
    els.methodBanner.innerHTML = [
      ...RESEARCH_WARNING_LINES,
      `Method branch: ${methodSummary.methodType.replaceAll("_", " ")}.`,
      `Contrast mean ${Math.round(methodSummary.contrastMean)} HU; adaptive floor ${Math.round(methodSummary.adaptiveMinHu)} HU; residual floor ${Math.round(methodSummary.residualFloorHu)} HU.`,
    ]
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join("");

    els.resultsTableBody.innerHTML = results.rows
      .map(
        (row) => `
        <tr${row.isTotal ? ' class="is-total-row"' : ""}>
          <td>${escapeHtml(row.vessel)}</td>
          <td>${escapeHtml(String(row.volume_mm3))}</td>
          <td>${escapeHtml(String(row.equivalent_mass_mg))}</td>
          <td>${escapeHtml(String(row.agatston_style_score))}</td>
          <td>${escapeHtml(row.method_type)}</td>
          <td>${escapeHtml(row.confidence_note)}</td>
        </tr>`
      )
      .join("");
  }

  function updateComponentListUi() {
    const summaries = getComponentSummaryRows(state.analysis.components, state.analysis.results);
    if (!summaries.length) {
      els.lesionNote.textContent = "No active vessel or category summary.";
      els.lesionList.innerHTML = '<p class="empty-copy">Run the estimate to see per-category summaries.</p>';
      return;
    }

    els.lesionNote.textContent = `${summaries.length} category buckets. Click a card to activate that label.`;
    els.lesionList.innerHTML = "";
    summaries.forEach((summary) => {
      const card = document.createElement("article");
      card.className = `lesion-card${summary.row.labelCode === state.selectedLabelCode ? " is-selected" : ""}`;
      card.innerHTML = `
        <div class="lesion-card-header">
          <div>
            <strong>${escapeHtml(summary.row.vessel)}</strong>
            <small>${summary.minSlice != null ? `Slices ${summary.minSlice + 1} to ${summary.maxSlice + 1}` : "No assigned components yet"} • ${summary.componentCount} connected component${summary.componentCount === 1 ? "" : "s"}</small>
          </div>
          <span class="lesion-badge" style="border-color:${escapeHtml(summary.labelMeta?.stroke || "#a6b8c2")}">${formatMm3(summary.row.volume_mm3)}</span>
        </div>
        <div class="lesion-meta">
          <div><span>Eq. Mass</span><strong>${formatMg(summary.row.equivalent_mass_mg)}</strong></div>
          <div><span>Agatston-style</span><strong>${formatScore(summary.row.agatston_style_score)}</strong></div>
        </div>
        <div class="series-card-actions">
          <button class="button tertiary" type="button" data-label-select="${summary.row.labelCode}">Activate</button>
          <button class="button tertiary" type="button" data-label-jump="${summary.row.labelCode}" ${summary.minSlice == null ? "disabled" : ""}>Jump</button>
        </div>
      `;
      els.lesionList.appendChild(card);
    });
  }

  function refreshDerivedUi() {
    updateControlStates();
    syncControlsFromState();
    updateGuideUi();
    updateReferencesUi();
    updateMetadataUi();
    updateSelectionUi();
    updateResultsUi();
    updateComponentListUi();
    const range = getScoringSliceRange();
    els.rangeSummary.textContent = range ? `${range.bottom - range.top + 1} slices selected` : "No study loaded";
  }

  function resizeCanvas(canvas) {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function computeCanvasGeometry(canvas, imageWidth, imageHeight) {
    const padding = 24 * (window.devicePixelRatio || 1);
    const availableWidth = Math.max(1, canvas.width - padding * 2);
    const availableHeight = Math.max(1, canvas.height - padding * 2);
    const fitScale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
    const scale = fitScale * state.view.zoom;
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const drawX = (canvas.width - drawWidth) / 2 + state.view.panX;
    const drawY = (canvas.height - drawHeight) / 2 + state.view.panY;
    return { drawX, drawY, drawWidth, drawHeight, scale };
  }

  function buildSliceCanvas(sliceIndex, options = {}) {
    if (!state.activeVolume) {
      return null;
    }
    const volume = state.activeVolume;
    const slice = volume.slices[sliceIndex];
    const offscreen = document.createElement("canvas");
    offscreen.width = volume.columns;
    offscreen.height = volume.rows;
    const ctx = offscreen.getContext("2d");
    const imageData = ctx.createImageData(volume.columns, volume.rows);
    const presetName = options.preset || state.currentPreset;
    const voi = getCurrentVoi(presetName);
    const ww = voi.width;
    const wc = voi.center;
    const min = wc - ww / 2;
    const max = wc + ww / 2;
    const labelSlice = state.analysis.labelSlices[sliceIndex];

    for (let index = 0; index < slice.pixels.length; index += 1) {
      let hu = slice.pixels[index] * slice.slope + slice.intercept;
      if (presetName === "suppressed" && state.analysis.methodSummary) {
        hu = getSuppressedPreviewHu(volume, sliceIndex, index, labelSlice, state.analysis.methodSummary);
      }
      let intensity = Math.round(((hu - min) / (max - min)) * 255);
      intensity = clamp(intensity, 0, 255);
      const offset = index * 4;
      imageData.data[offset] = intensity;
      imageData.data[offset + 1] = intensity;
      imageData.data[offset + 2] = intensity;
      imageData.data[offset + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    return offscreen;
  }

  function buildMaskCanvas(sliceIndex) {
    const volume = state.activeVolume;
    const labelSlice = state.analysis.labelSlices[sliceIndex];
    if (!volume || !labelSlice) {
      return null;
    }

    const selected =
      state.analysis.components.find((component) => component.id === state.analysis.activeComponentId) || null;
    const selectedPixels = selected?.pixelsBySlice.get(sliceIndex) || [];
    const selectedLookup = new Set(selectedPixels);

    const offscreen = document.createElement("canvas");
    offscreen.width = volume.columns;
    offscreen.height = volume.rows;
    const ctx = offscreen.getContext("2d");
    const imageData = ctx.createImageData(volume.columns, volume.rows);

    for (let pixelIndex = 0; pixelIndex < labelSlice.length; pixelIndex += 1) {
      const labelCode = labelSlice[pixelIndex];
      if (!labelCode) {
        continue;
      }
      const offset = pixelIndex * 4;
      const labelMeta = LABELS_BY_CODE.get(labelCode) || LABELS_BY_CODE.get(8);
      const baseColor = labelMeta?.color || [166, 184, 194, 148];
      const color = selectedLookup.has(pixelIndex) ? COLORS.selected : baseColor;
      imageData.data[offset] = color[0];
      imageData.data[offset + 1] = color[1];
      imageData.data[offset + 2] = color[2];
      imageData.data[offset + 3] = color[3];
    }

    ctx.putImageData(imageData, 0, 0);
    return offscreen;
  }

  function drawReferenceOverlays(ctx, geometry) {
    if (!state.referenceOverlayVisible || !state.activeVolume) {
      return;
    }

    REFERENCE_DEFINITIONS.forEach((definition) => {
      const picks = (state.references[definition.key]?.picks || []).filter(
        (pick) => pick.sliceIndex === state.activeSliceIndex
      );
      picks.forEach((pick, index) => {
        ctx.save();
        if (pick.shape === "polygon" && pick.points?.length) {
          ctx.beginPath();
          pick.points.forEach((point, pointIndex) => {
            const canvasX = geometry.drawX + ((point.x + 0.5) / state.activeVolume.columns) * geometry.drawWidth;
            const canvasY = geometry.drawY + ((point.y + 0.5) / state.activeVolume.rows) * geometry.drawHeight;
            if (pointIndex === 0) {
              ctx.moveTo(canvasX, canvasY);
            } else {
              ctx.lineTo(canvasX, canvasY);
            }
          });
          ctx.closePath();
          ctx.fillStyle = `${definition.swatch}22`;
          ctx.strokeStyle = definition.swatch;
          ctx.lineWidth = 2;
          ctx.fill();
          ctx.stroke();
        } else {
          const canvasX = geometry.drawX + ((pick.centerX + 0.5) / state.activeVolume.columns) * geometry.drawWidth;
          const canvasY = geometry.drawY + ((pick.centerY + 0.5) / state.activeVolume.rows) * geometry.drawHeight;
          const radiusCanvas = (pick.radiusPx / state.activeVolume.columns) * geometry.drawWidth;
          ctx.beginPath();
          ctx.arc(canvasX, canvasY, Math.max(5, radiusCanvas), 0, Math.PI * 2);
          ctx.fillStyle = `${definition.swatch}22`;
          ctx.strokeStyle = definition.swatch;
          ctx.lineWidth = 2;
          ctx.fill();
          ctx.stroke();
        }
        if (index === picks.length - 1) {
          const canvasX = geometry.drawX + ((pick.centerX + 0.5) / state.activeVolume.columns) * geometry.drawWidth;
          const canvasY = geometry.drawY + ((pick.centerY + 0.5) / state.activeVolume.rows) * geometry.drawHeight;
          ctx.font = "600 13px Aptos, sans-serif";
          ctx.fillStyle = "#eff7fb";
          ctx.fillText(definition.shortLabel, canvasX + 10, canvasY - 6);
        }
        ctx.restore();
      });
    });
  }

  function drawDraftPolygon(ctx, geometry, points, color) {
    if (!points?.length || !state.activeVolume) {
      return;
    }
    ctx.save();
    ctx.beginPath();
    points.forEach((point, index) => {
      const canvasX = geometry.drawX + ((point.x + 0.5) / state.activeVolume.columns) * geometry.drawWidth;
      const canvasY = geometry.drawY + ((point.y + 0.5) / state.activeVolume.rows) * geometry.drawHeight;
      if (index === 0) {
        ctx.moveTo(canvasX, canvasY);
      } else {
        ctx.lineTo(canvasX, canvasY);
      }
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function updateCanvasCursor() {
    if (!els.overlayCanvas) {
      return;
    }
    if (state.dragging?.type === "pan") {
      els.overlayCanvas.style.cursor = "grabbing";
      return;
    }
    if (state.dragging?.type === "sliceScroll") {
      els.overlayCanvas.style.cursor = "ns-resize";
      return;
    }
    if (state.referenceSamplingTarget) {
      els.overlayCanvas.style.cursor = "crosshair";
      return;
    }
    if (state.view.interactionMode !== "edit") {
      els.overlayCanvas.style.cursor = VIEWER_MODE_CURSORS[state.view.interactionMode] || "default";
      return;
    }
    els.overlayCanvas.style.cursor = state.tool === "erase" ? "cell" : "crosshair";
  }

  function render() {
    resizeCanvas(els.imageCanvas);
    resizeCanvas(els.overlayCanvas);

    const imageCtx = els.imageCanvas.getContext("2d");
    const overlayCtx = els.overlayCanvas.getContext("2d");
    imageCtx.clearRect(0, 0, els.imageCanvas.width, els.imageCanvas.height);
    overlayCtx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);

    if (!state.activeVolume) {
      els.canvasOverlayMessage.hidden = false;
      els.canvasOverlayMessage.textContent = "Load a contrast-enhanced CTA or cardiac CT series to begin.";
      return;
    }

    els.canvasOverlayMessage.hidden = true;
    state.canvasGeometry = computeCanvasGeometry(
      els.imageCanvas,
      state.activeVolume.columns,
      state.activeVolume.rows
    );
    const geometry = state.canvasGeometry;
    const imageCanvas = buildSliceCanvas(state.activeSliceIndex);
    const maskCanvas = buildMaskCanvas(state.activeSliceIndex);

    imageCtx.drawImage(imageCanvas, geometry.drawX, geometry.drawY, geometry.drawWidth, geometry.drawHeight);
    if (maskCanvas && state.overlayVisible) {
      overlayCtx.drawImage(maskCanvas, geometry.drawX, geometry.drawY, geometry.drawWidth, geometry.drawHeight);
    }
    drawReferenceOverlays(overlayCtx, geometry);

    if (state.dragging?.type === "labelDraw" || state.dragging?.type === "eraseDraw" || state.dragging?.type === "referenceDraw") {
      const referenceColor = getActiveReferenceDefinition()?.swatch || "#6ee4ff";
      drawDraftPolygon(
        overlayCtx,
        geometry,
        state.dragging.points,
        state.dragging.type === "eraseDraw" ? "#ffd07a" : state.dragging.type === "referenceDraw" ? referenceColor : "#6ee4ff"
      );
    }

    if (
      state.pointer.inside &&
      ((state.tool === "erase" && state.dragging?.type !== "eraseDraw") || state.referenceSamplingTarget)
    ) {
      const radiusCanvas = state.referenceRoiRadiusPx * (geometry.drawWidth / state.activeVolume.columns);
      overlayCtx.save();
      overlayCtx.beginPath();
      overlayCtx.arc(
        geometry.drawX + ((state.pointer.imageX + 0.5) / state.activeVolume.columns) * geometry.drawWidth,
        geometry.drawY + ((state.pointer.imageY + 0.5) / state.activeVolume.rows) * geometry.drawHeight,
        Math.max(5, radiusCanvas),
        0,
        Math.PI * 2
      );
      overlayCtx.strokeStyle = state.referenceSamplingTarget ? getActiveReferenceDefinition()?.swatch || COLORS.brush : COLORS.brush;
      overlayCtx.lineWidth = 2;
      overlayCtx.stroke();
      overlayCtx.restore();
    }

    const range = getScoringSliceRange();
    els.sliceBadge.textContent = `Slice ${state.activeSliceIndex + 1} / ${state.activeVolume.depth}${range && (state.activeSliceIndex < range.top || state.activeSliceIndex > range.bottom) ? " • out of slab" : ""}`;
  }

  function requestRender() {
    if (state.renderQueued) {
      return;
    }
    state.renderQueued = true;
    window.requestAnimationFrame(() => {
      state.renderQueued = false;
      render();
    });
  }

  function eventToImageCoordinates(clientX, clientY) {
    if (!state.activeVolume || !state.canvasGeometry) {
      return null;
    }
    const rect = els.overlayCanvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (window.devicePixelRatio || 1);
    const y = (clientY - rect.top) * (window.devicePixelRatio || 1);
    const geometry = state.canvasGeometry;
    if (
      x < geometry.drawX ||
      y < geometry.drawY ||
      x > geometry.drawX + geometry.drawWidth ||
      y > geometry.drawY + geometry.drawHeight
    ) {
      return null;
    }

    const imageX = clamp(
      Math.floor(((x - geometry.drawX) / geometry.drawWidth) * state.activeVolume.columns),
      0,
      state.activeVolume.columns - 1
    );
    const imageY = clamp(
      Math.floor(((y - geometry.drawY) / geometry.drawHeight) * state.activeVolume.rows),
      0,
      state.activeVolume.rows - 1
    );
    return {
      imageX,
      imageY,
      pixelIndex: imageY * state.activeVolume.columns + imageX,
    };
  }

  function updatePointerFromEvent(event) {
    const point = eventToImageCoordinates(event.clientX, event.clientY);
    if (!point) {
      clearPointer();
      return null;
    }
    state.pointer = {
      imageX: point.imageX,
      imageY: point.imageY,
      pixelIndex: point.pixelIndex,
      hu: getSliceHuValue(state.activeVolume, state.activeSliceIndex, point.pixelIndex),
      inside: true,
    };
    updateSelectionUi();
    requestRender();
    return point;
  }

  function handlePointerDown(event) {
    if (!state.activeVolume) {
      return;
    }
    const point = updatePointerFromEvent(event);
    const canvasPoint = getCanvasPointFromEvent(event);

    if (event.button === 1) {
      event.preventDefault();
      state.dragging = {
        type: "pan",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: state.view.panX,
        startPanY: state.view.panY,
        source: "middleMouse",
      };
      els.overlayCanvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      return;
    }

    if (event.button === 2) {
      state.dragging = {
        type: "secondaryPending",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startSliceIndex: state.activeSliceIndex,
      };
      els.overlayCanvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      return;
    }

    if (state.referenceSamplingTarget) {
      if (!point) {
        return;
      }
      if (event.button !== 0) {
        return;
      }
      state.dragging = {
        type: "referenceDraw",
        pointerId: event.pointerId,
        sliceIndex: state.activeSliceIndex,
        referenceKey: state.referenceSamplingTarget,
        points: [{ x: point.imageX, y: point.imageY }],
      };
      els.overlayCanvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (state.view.interactionMode === "windowLevel") {
      const voi = getCurrentVoi();
      state.dragging = {
        type: "windowLevel",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startWidth: voi.width,
        startCenter: voi.center,
      };
      els.overlayCanvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      return;
    }

    if (state.view.interactionMode === "pan") {
      state.dragging = {
        type: "pan",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: state.view.panX,
        startPanY: state.view.panY,
      };
      els.overlayCanvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      return;
    }

    if (state.view.interactionMode === "zoom") {
      state.dragging = {
        type: "zoom",
        pointerId: event.pointerId,
        startClientY: event.clientY,
        startZoom: state.view.zoom,
        focusCanvasPoint: canvasPoint,
      };
      els.overlayCanvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      return;
    }

    if (!point) {
      return;
    }

    if (!state.analysis.results) {
      return;
    }

    if (state.tool === "erase") {
      state.dragging = {
        type: "eraseDraw",
        pointerId: event.pointerId,
        sliceIndex: state.activeSliceIndex,
        points: [{ x: point.imageX, y: point.imageY }],
      };
      els.overlayCanvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      return;
    }

    state.dragging = {
      type: "labelDraw",
      pointerId: event.pointerId,
      sliceIndex: state.activeSliceIndex,
      points: [{ x: point.imageX, y: point.imageY }],
    };
    els.overlayCanvas.setPointerCapture?.(event.pointerId);
    updateCanvasCursor();
  }

  function handlePointerMove(event) {
    const point = updatePointerFromEvent(event);
    if (!state.dragging || (state.dragging.pointerId != null && state.dragging.pointerId !== event.pointerId)) {
      return;
    }

    if (state.dragging.type === "secondaryPending") {
      const movement = Math.max(
        Math.abs(event.clientX - state.dragging.startClientX),
        Math.abs(event.clientY - state.dragging.startClientY)
      );
      if (movement >= 5) {
        state.dragging = {
          type: "sliceScroll",
          pointerId: event.pointerId,
          startClientY: state.dragging.startClientY,
          startSliceIndex: state.dragging.startSliceIndex,
        };
        updateCanvasCursor();
      }
      return;
    }

    if (state.dragging.type === "sliceScroll") {
      const sliceDelta = Math.round((state.dragging.startClientY - event.clientY) / 5);
      setCurrentSliceIndex(state.dragging.startSliceIndex + sliceDelta);
      return;
    }

    if (state.dragging.type === "windowLevel") {
      applyWindowing(
        {
          width: state.dragging.startWidth + (event.clientX - state.dragging.startClientX) * 4,
          center: state.dragging.startCenter + (state.dragging.startClientY - event.clientY) * 2,
        },
        { silent: true }
      );
      return;
    }

    if (state.dragging.type === "pan") {
      const dpr = window.devicePixelRatio || 1;
      state.view.panX = state.dragging.startPanX + (event.clientX - state.dragging.startClientX) * dpr;
      state.view.panY = state.dragging.startPanY + (event.clientY - state.dragging.startClientY) * dpr;
      requestRender();
      return;
    }

    if (state.dragging.type === "zoom") {
      const deltaY = state.dragging.startClientY - event.clientY;
      setZoom(state.dragging.startZoom * Math.exp(deltaY / 180), state.dragging.focusCanvasPoint);
      return;
    }

    if (!point || state.dragging.sliceIndex !== state.activeSliceIndex) {
      return;
    }

    if (
      state.dragging.type === "labelDraw" ||
      state.dragging.type === "eraseDraw" ||
      state.dragging.type === "referenceDraw"
    ) {
      state.dragging.points.push({ x: point.imageX, y: point.imageY });
      requestRender();
    }
  }

  function handlePointerUp(event) {
    const point = updatePointerFromEvent(event);
    if (!state.dragging) {
      if (
        event.button === 0 &&
        point &&
        !state.referenceSamplingTarget &&
        state.view.interactionMode === "edit" &&
        state.analysis.results
      ) {
        if (state.tool === "erase") {
          eraseSeedComponent(point.pixelIndex);
        } else {
          if (!selectExistingComponent(point)) {
            manuallyLabelSeedComponent(point.pixelIndex, state.selectedLabelCode);
          }
        }
      }
      return;
    }

    const drag = state.dragging;
    if (drag.pointerId != null && event.pointerId != null && drag.pointerId !== event.pointerId) {
      return;
    }
    state.dragging = null;
    els.overlayCanvas.releasePointerCapture?.(event.pointerId);
    updateCanvasCursor();
    if (drag.type === "secondaryPending") {
      if (point && state.analysis.results && state.view.interactionMode === "edit" && !state.referenceSamplingTarget) {
        eraseSeedComponent(point.pixelIndex);
      }
      return;
    }

    if (
      drag.type === "sliceScroll" ||
      drag.type === "windowLevel" ||
      drag.type === "pan" ||
      drag.type === "zoom"
    ) {
      updateSelectionUi();
      return;
    }

    if (drag.type === "referenceDraw") {
      if ((drag.points || []).length >= 3 && polygonArea(drag.points) >= 20) {
        addReferenceDrawnPick(drag.referenceKey, drag.points);
        return;
      }
      if (point) {
        addReferencePick(drag.referenceKey, point);
      }
      return;
    }

    if (drag.type === "labelDraw") {
      if ((drag.points || []).length >= 3 && polygonArea(drag.points) >= 20) {
        applyPolygonEditOnCurrentSlice(drag.points, "include", state.selectedLabelCode);
        return;
      }
      if (point) {
        if (!selectExistingComponent(point)) {
          manuallyLabelSeedComponent(point.pixelIndex, state.selectedLabelCode);
        }
      }
      return;
    }

    if (drag.type === "eraseDraw") {
      if ((drag.points || []).length >= 3 && polygonArea(drag.points) >= 20) {
        applyPolygonEditOnCurrentSlice(drag.points, "erase");
        return;
      }
      if (point) {
        eraseSeedComponent(point.pixelIndex);
      }
    }
  }

  function handleCanvasWheel(event) {
    if (!state.activeVolume) {
      return;
    }
    event.preventDefault();
    if (event.ctrlKey || event.metaKey || state.view.interactionMode === "zoom") {
      changeZoom(event.deltaY < 0 ? 1.1 : 0.9, getCanvasPointFromEvent(event));
      return;
    }
    setCurrentSliceIndex(state.activeSliceIndex + (event.deltaY > 0 ? 1 : -1));
  }

  function handleDocumentKeyDown(event) {
    if (state.finishModalOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFinishModal();
      }
      return;
    }

    const tagName = event.target?.tagName;
    if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const lowerKey = event.key.toLowerCase();
      if (lowerKey === "z" && event.shiftKey) {
        event.preventDefault();
        redoHistory();
        return;
      }
      if (lowerKey === "z") {
        event.preventDefault();
        undoHistory();
        return;
      }
      if (lowerKey === "y") {
        event.preventDefault();
        redoHistory();
        return;
      }
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const lowerKey = event.key.toLowerCase();
    if (!state.activeVolume) {
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      setCurrentSliceIndex(state.activeSliceIndex - 1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      setCurrentSliceIndex(state.activeSliceIndex + 1);
      return;
    }
    if (event.key === "=" || event.key === "+") {
      event.preventDefault();
      changeZoom(1.1);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      changeZoom(0.9);
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      resetViewTransform();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (state.referenceSamplingTarget) {
        state.referenceSamplingTarget = null;
        refreshDerivedUi();
        requestRender();
        setStatus("Reference picker stopped.");
        return;
      }
      if (state.view.interactionMode !== "edit" || state.tool !== "tapLabel") {
        returnToPrimaryTool({ silent: false });
      }
      return;
    }

    if (lowerKey === "w") {
      event.preventDefault();
      setViewerMode("windowLevel");
      return;
    }
    if (lowerKey === "m" || lowerKey === "p") {
      event.preventDefault();
      setViewerMode("pan");
      return;
    }
    if (lowerKey === "z") {
      event.preventDefault();
      setViewerMode("zoom");
      return;
    }
    if (lowerKey === "e") {
      event.preventDefault();
      setViewerMode("edit");
      return;
    }
    if (lowerKey === "a" && state.analysis.results) {
      event.preventDefault();
      state.tool = "tapLabel";
      setViewerMode("edit", { silent: true });
      refreshDerivedUi();
      setStatus(`Edit mode using ${TOOLS[state.tool]}.`);
      return;
    }
    if (lowerKey === "r" && state.analysis.results) {
      event.preventDefault();
      state.tool = "erase";
      setViewerMode("edit", { silent: true });
      refreshDerivedUi();
      setStatus(`Edit mode using ${TOOLS[state.tool]}.`);
    }
  }

  function handleSeriesListClick(event) {
    const selectButton = event.target.closest("[data-series-select]");
    if (selectButton) {
      state.selectedSeriesId = selectButton.dataset.seriesSelect;
      updateSeriesListUi();
      updateControlStates();
      return;
    }
    const loadButton = event.target.closest("[data-series-load]");
    if (loadButton) {
      loadSeriesById(loadButton.dataset.seriesLoad).catch((error) => {
        console.error(error);
        setStatus(error.message || "Series load failed.", "error");
      });
    }
  }

  function handleReferenceGridClick(event) {
    const pickButton = event.target.closest("[data-reference-pick]");
    if (pickButton) {
      const key = pickButton.dataset.referencePick;
      state.referenceSamplingTarget = state.referenceSamplingTarget === key ? null : key;
      if (state.referenceSamplingTarget) {
        setViewerMode("edit", { silent: true });
      }
      refreshDerivedUi();
      requestRender();
      if (state.referenceSamplingTarget) {
        setStatus(`Reference picker ready: click or drag on the image to sample ${getReferenceLabel(key)}.`);
      }
      return;
    }
    const clearButton = event.target.closest("[data-reference-clear]");
    if (clearButton) {
      clearReference(clearButton.dataset.referenceClear);
    }
  }

  function handleLesionListClick(event) {
    const labelButton = event.target.closest("[data-label-select]");
    if (labelButton) {
      state.selectedLabelCode = Number.parseInt(labelButton.dataset.labelSelect, 10) || 1;
      updateSelectionUi();
      syncControlsFromState();
      updateComponentListUi();
      return;
    }
    const jumpButton = event.target.closest("[data-label-jump]");
    if (jumpButton) {
      const labelCode = Number.parseInt(jumpButton.dataset.labelJump, 10);
      const components = state.analysis.components.filter((component) => component.labelCode === labelCode);
      if (components.length) {
        state.activeSliceIndex = components[0].minSlice;
        state.analysis.activeComponentId = components[0].id;
        refreshDerivedUi();
        requestRender();
      }
    }
  }

  function handleLabelLegendClick(event) {
    const chip = event.target.closest("[data-label-chip]");
    if (!chip) {
      return;
    }
    state.selectedLabelCode = Number.parseInt(chip.dataset.labelChip, 10) || 1;
    refreshDerivedUi();
  }

  function jumpToWorkflowStep(stepKey) {
    const step = WORKFLOW_STEPS.find((entry) => entry.key === stepKey);
    if (!step) {
      return;
    }
    const target = document.getElementById(step.sectionId);
    if (!target) {
      return;
    }
    target.open = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setStatus(`Jumped to ${step.title}.`);
  }

  function getLabelName(labelCode) {
    return LABELS_BY_CODE.get(labelCode)?.label || "Other";
  }

  function getActiveReferenceDefinition() {
    return REFERENCE_DEFINITIONS.find((definition) => definition.key === state.referenceSamplingTarget) || null;
  }

  function buildExportBaseNameWithStudyId(studyId) {
    const candidate = getActiveSeries();
    const meta = candidate?.meta || {};
    const study = sanitizeFilePart(studyId || "", "");
    const patient = sanitizeFilePart(meta.patientName || meta.patientId || "patient", "patient");
    const series = sanitizeFilePart(candidate?.label || meta.seriesDescription || "contrast_calcscorer", "contrast_calcscorer");
    return study ? `${study}_${patient}_${series}` : `${patient}_${series}`;
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
    URL.revokeObjectURL(url);
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
          workflow: "contrast-calcscorer",
          filename,
          contentBase64,
          mimeType: blob.type || "application/octet-stream",
          studyId: state.exportStudy.currentStudyId || "",
          patientStudyId: String(options?.patientStudyId || "").trim(),
        }),
      });
    } catch (error) {
      console.warn("Could not mirror the export into the local outbox.", error);
    }
  }

  function buildReferenceSummaryForExport() {
    return JSON.stringify(
      REFERENCE_DEFINITIONS.map((definition) => {
        const picks = state.references[definition.key]?.picks || [];
        return {
          key: definition.key,
          label: definition.label,
          required: definition.required,
          picks: picks.map((pick) => ({
            shape: pick.shape || "circle",
            mean_hu: roundTo(pick.meanHu, 1),
            sd_hu: roundTo(pick.sdHu, 1),
            area_mm2: roundTo(pick.areaMm2, 1),
            slice: pick.sliceIndex + 1,
          })),
        };
      })
    );
  }

  function buildResidualSummaryForExport() {
    const method = state.analysis.methodSummary;
    if (!method) {
      return "";
    }
    return JSON.stringify({
      adaptive_min_hu: roundTo(method.adaptiveMinHu, 1),
      residual_floor_hu: roundTo(method.residualFloorHu, 1),
      local_residual_floor_hu: roundTo(method.localResidualFloorHu, 1),
      contrast_mean_hu: roundTo(method.contrastMean, 1),
      soft_mean_hu: roundTo(method.softMean, 1),
      calcium_reference_hu: roundTo(method.calciumMean, 1),
    });
  }

  function exportCsv(options = {}) {
    const results = state.analysis.results;
    const method = state.analysis.methodSummary;
    if (!results || !method) {
      return false;
    }
    const studyId = String(options.studyId || "").trim();
    const researchStudy = getSelectedExportStudyMetadata();
    const referenceSummary = buildReferenceSummaryForExport();
    const residualSummary = buildResidualSummaryForExport();
    const warningText = RESEARCH_WARNING_LINES.join(" ");
    const lines = [
      [
        "study_id",
        "research_study_id",
        "research_study_label",
        "vessel",
        "volume_mm3",
        "equivalent_mass_mg",
        "agatston_style_score",
        "method_type",
        "spectral_or_conventional",
        "confidence_note",
        "reference_summary",
        "residual_parameters",
        "warning_text",
      ].join(","),
      ...results.rows.map((row) =>
        [
          studyId,
          researchStudy.id,
          researchStudy.label,
          row.vessel,
          row.volume_mm3,
          row.equivalent_mass_mg,
          row.agatston_style_score,
          row.method_type,
          row.spectral_or_conventional,
          row.confidence_note,
          referenceSummary,
          residualSummary,
          warningText,
        ]
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `${buildExportBaseNameWithStudyId(studyId)}_contrast_calcscorer_results.csv`, { patientStudyId: studyId });
    if (!options.suppressStatus) {
      setStatus(studyId ? `Exported CSV for Study ID ${studyId}.` : "Exported research results CSV.");
    }
    return true;
  }

  function exportReviewPng(options = {}) {
    if (!state.activeVolume) {
      return Promise.resolve(false);
    }
    const studyId = String(options.studyId || "").trim();
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = 1600;
    exportCanvas.height = 1180;
    const ctx = exportCanvas.getContext("2d");
    ctx.fillStyle = "#081119";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    const imageCanvas = buildSliceCanvas(state.activeSliceIndex);
    const maskCanvas = buildMaskCanvas(state.activeSliceIndex);
    const suppressedCanvas = state.analysis.methodSummary
      ? buildSliceCanvas(state.activeSliceIndex, { preset: "suppressed" })
      : null;
    const drawWidth = 860;
    const drawHeight = Math.round((state.activeVolume.rows / state.activeVolume.columns) * drawWidth);
    const drawX = 46;
    const drawY = 154;
    ctx.drawImage(imageCanvas, drawX, drawY, drawWidth, drawHeight);
    if (maskCanvas && state.overlayVisible) {
      ctx.drawImage(maskCanvas, drawX, drawY, drawWidth, drawHeight);
    }

    const geometry = {
      drawX,
      drawY,
      drawWidth,
      drawHeight,
    };
    drawReferenceOverlays(ctx, geometry);

    if (suppressedCanvas) {
      const insetWidth = 248;
      const insetHeight = Math.round((state.activeVolume.rows / state.activeVolume.columns) * insetWidth);
      const insetX = drawX + drawWidth - insetWidth - 18;
      const insetY = drawY + drawHeight - insetHeight - 18;
      ctx.fillStyle = "#071018";
      ctx.fillRect(insetX - 3, insetY - 28, insetWidth + 6, insetHeight + 31);
      ctx.drawImage(suppressedCanvas, insetX, insetY, insetWidth, insetHeight);
      ctx.fillStyle = "#eff7fb";
      ctx.font = "600 13px Aptos, sans-serif";
      ctx.fillText("Synthetic iodine-suppressed research preview", insetX, insetY - 8);
    }

    ctx.fillStyle = "#eff7fb";
    ctx.font = "700 34px Aptos, sans-serif";
    ctx.fillText("HAGRad Contrast CalcScorer Review", 46, 58);
    ctx.font = "500 18px Aptos, sans-serif";
    ctx.fillStyle = "#a9bcc8";
    const candidate = getActiveSeries();
    ctx.fillText(
      `${candidate?.studyLabel || "Unknown patient"} • ${candidate?.label || "Series"} • Slice ${state.activeSliceIndex + 1}/${state.activeVolume.depth}${studyId ? ` • Study ID ${studyId}` : ""}${getSelectedExportStudyMetadata().displayLabel ? ` • Research Study ${getSelectedExportStudyMetadata().displayLabel}` : ""}`,
      46,
      94
    );

    const infoX = 960;
    ctx.fillStyle = "#eff7fb";
    ctx.font = "700 22px Aptos, sans-serif";
    ctx.fillText("Research Summary", infoX, 170);
    ctx.font = "600 17px Aptos, sans-serif";
    const results = state.analysis.results;
    const method = state.analysis.methodSummary;
    [
      `Method: ${method?.methodType || "-"}`,
      `Branch: ${method?.spectralOrConventional || "-"}`,
      `Coronary volume: ${results ? formatMm3(results.coronaryVolumeMm3) : "-"}`,
      `Total volume: ${results ? formatMm3(results.totalVolumeMm3) : "-"}`,
      `Equivalent mass: ${results ? formatMg(results.equivalentMassMg) : "-"}`,
      `Agatston-style: ${results ? formatScore(results.agatstonStyleScore) : "-"}`,
      `Contrast mean: ${method ? `${Math.round(method.contrastMean)} HU` : "-"}`,
      `Adaptive floor: ${method ? `${Math.round(method.adaptiveMinHu)} HU` : "-"}`,
      `Display preset: ${state.currentPreset === "suppressed" ? "suppressed preview" : state.currentPreset}`,
    ].forEach((line, index) => {
      ctx.fillText(line, infoX, 208 + index * 32);
    });

    ctx.fillStyle = "#ffd07a";
    ctx.font = "600 16px Aptos, sans-serif";
    RESEARCH_WARNING_LINES.forEach((line, index) => {
      ctx.fillText(line, infoX, 500 + index * 24);
    });

    ctx.fillStyle = "#eff7fb";
    ctx.font = "700 20px Aptos, sans-serif";
    ctx.fillText("Per-Category Results", infoX, 640);
    ctx.font = "600 13px Aptos, sans-serif";
    const headings = ["Vessel", "Volume", "Eq. Mass", "Agatston-style"];
    const colX = [infoX, infoX + 180, infoX + 320, infoX + 500];
    headings.forEach((heading, index) => {
      ctx.fillText(heading, colX[index], 672);
    });
    results?.rows?.forEach((row, index) => {
      const y = 702 + index * 24;
      const labelMeta = LABELS_BY_CODE.get(row.labelCode);
      if (labelMeta && !row.isTotal) {
        ctx.fillStyle = labelMeta.stroke;
        ctx.fillRect(infoX, y - 10, 10, 10);
      }
      ctx.fillStyle = row.isTotal ? "#eff7fb" : "#a9bcc8";
      ctx.fillText(row.vessel, infoX + 18, y);
      ctx.fillText(String(row.volume_mm3), colX[1], y);
      ctx.fillText(String(row.equivalent_mass_mg), colX[2], y);
      ctx.fillText(String(row.agatston_style_score), colX[3], y);
    });

    const filename = `${buildExportBaseNameWithStudyId(studyId)}_contrast_calcscorer_review.png`;
    return new Promise((resolve) => {
      exportCanvas.toBlob((blob) => {
        if (!blob) {
          resolve(false);
          return;
        }
        downloadBlob(blob, filename, { patientStudyId: studyId });
        if (!options.suppressStatus) {
          setStatus(studyId ? `Exported review PNG for Study ID ${studyId}.` : "Exported review PNG.");
        }
        resolve(true);
      }, "image/png");
    });
  }

  function getTrimmedStudyId() {
    return String(els.finishStudyIdInput.value || "").trim();
  }

  function getExportStudyDirectoryLabel(studyId) {
    const study = state.exportStudy.studies.find((entry) => String(entry?.id || "").trim() === String(studyId || "").trim()) || null;
    if (study?.slug) {
      return `exports_outbox/contrast-calcscorer/${study.slug}`;
    }
    return "exports_outbox/contrast-calcscorer";
  }

  function getSelectedExportStudyMetadata() {
    const currentStudyId = String(state.exportStudy.currentStudyId || "").trim();
    const study = state.exportStudy.studies.find((entry) => String(entry?.id || "").trim() === currentStudyId) || null;
    return {
      id: String(study?.id || "").trim(),
      label: String(study?.label || "").trim(),
      slug: String(study?.slug || "").trim(),
      displayLabel: String(study?.label || study?.id || "").trim(),
    };
  }

  function updateExportStudyTargetNote() {
    if (!els.exportStudyTargetNote) {
      return;
    }
    const currentStudyId = String(state.exportStudy.currentStudyId || "").trim();
    const study = state.exportStudy.studies.find((entry) => String(entry?.id || "").trim() === currentStudyId) || null;
    if (study) {
      els.exportStudyTargetNote.textContent = `Mirrored exports will also be saved to ${getExportStudyDirectoryLabel(study.id)}.`;
      return;
    }
    els.exportStudyTargetNote.textContent = "Mirrored exports will also be saved to exports_outbox/contrast-calcscorer until a study is selected.";
  }

  function applyExportStudyPayload(payload) {
    state.exportStudy.studies = Array.isArray(payload?.studies) ? payload.studies : [];
    state.exportStudy.currentStudyId = String(payload?.currentStudyId || "").trim();
    if (els.exportStudySelect) {
      exportStudyApi?.populateSelect(els.exportStudySelect, state.exportStudy.studies, state.exportStudy.currentStudyId, "No study selected");
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
    state.exportStudy.currentStudyId = String(payload?.id || "").trim();
    await refreshExportStudyOptions();
  }

  async function createExportStudyFromDialog() {
    if (!exportStudyApi || !els.exportStudyCreateInput) {
      return;
    }
    const label = String(els.exportStudyCreateInput.value || "").trim();
    if (!label) {
      setStatus("Enter a study name first.", "warning");
      els.exportStudyCreateInput.focus();
      return;
    }
    const created = await exportStudyApi.create(label);
    els.exportStudyCreateInput.value = "";
    state.exportStudy.currentStudyId = String(created?.id || "").trim();
    await refreshExportStudyOptions();
    setStatus(`Selected export study ${created?.label || state.exportStudy.currentStudyId}.`, null);
  }

  async function finishAndClosePatient() {
    const studyId = getTrimmedStudyId();
    if (!studyId) {
      els.finishModalError.hidden = false;
      els.finishStudyIdInput.focus();
      return;
    }
    els.finishModalError.hidden = true;
    exportCsv({ studyId, suppressStatus: true });
    const pngOk = await exportReviewPng({ studyId, suppressStatus: true });
    if (!pngOk) {
      setStatus("Failed to export the review PNG.", "error");
      return;
    }
    closeFinishModal();
    clearStudy({ silent: true });
    setStatus(`Exported CSV and PNG for Study ID ${studyId} and cleared the current patient.`);
  }

  function roundTo(value, decimals) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const scale = 10 ** decimals;
    return Math.round(value * scale) / scale;
  }

  function bindEvents() {
    els.dicomInput.addEventListener("change", async (event) => {
      try {
        await importStudyFiles(event.target.files);
      } catch (error) {
        console.error(error);
        setStatus(error.message || "DICOM file load failed.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.dicomFolderInput.addEventListener("change", async (event) => {
      try {
        await importStudyFiles(event.target.files);
      } catch (error) {
        console.error(error);
        setStatus(error.message || "DICOM folder load failed.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.dicomAddInput.addEventListener("change", async (event) => {
      try {
        await importStudyFiles(event.target.files, { append: true });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Additional DICOM load failed.", "error");
      } finally {
        event.target.value = "";
      }
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      els.canvasWrap.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.canvasWrap.classList.add("is-dragging");
      });
    });

    ["dragleave", "dragend", "drop"].forEach((eventName) => {
      els.canvasWrap.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.canvasWrap.classList.remove("is-dragging");
      });
    });

    els.canvasWrap.addEventListener("drop", async (event) => {
      try {
        const droppedFiles =
          (await collectDroppedFiles?.(event.dataTransfer)) ||
          Array.from(event.dataTransfer?.files || []);
        await importStudyFiles(droppedFiles, { append: false });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Dropped DICOM files failed to load.", "error");
      }
    });

    els.clearButton.addEventListener("click", () => clearStudy());
    els.finishCloseButton.addEventListener("click", openFinishModal);
    els.loadSelectedSeriesButton.addEventListener("click", () => {
      loadSeriesById(state.selectedSeriesId).catch((error) => {
        console.error(error);
        setStatus(error.message || "Series load failed.", "error");
      });
    });
    els.seriesList.addEventListener("click", handleSeriesListClick);
    els.referenceCardGrid.addEventListener("click", handleReferenceGridClick);
    els.lesionList.addEventListener("click", handleLesionListClick);
    els.labelLegend.addEventListener("click", handleLabelLegendClick);

    els.workflowButtons.forEach((button) => {
      button.addEventListener("click", () => {
        jumpToWorkflowStep(button.dataset.workflowStep);
      });
    });
    els.guideStepList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-workflow-step]");
      if (!button) {
        return;
      }
      jumpToWorkflowStep(button.dataset.workflowStep);
    });

    els.scoreTopSliceInput.addEventListener("change", () => {
      applyScoringSliceInputs();
      commitRange();
    });
    els.scoreBottomSliceInput.addEventListener("change", () => {
      applyScoringSliceInputs();
      commitRange();
    });
    els.setScoreTopButton.addEventListener("click", () => {
      state.analysis.scoringSlices.top = state.activeSliceIndex;
      commitRange(`Set the top slice to ${state.activeSliceIndex + 1}.`);
    });
    els.setScoreBottomButton.addEventListener("click", () => {
      state.analysis.scoringSlices.bottom = state.activeSliceIndex;
      commitRange(`Set the bottom slice to ${state.activeSliceIndex + 1}.`);
    });
    els.useFullScoreRangeButton.addEventListener("click", () => {
      state.analysis.scoringSlices.top = 0;
      state.analysis.scoringSlices.bottom = state.activeVolume.depth - 1;
      commitRange("Using the full stack for analysis.");
    });

    els.referenceRadiusSlider.addEventListener("input", () => {
      state.referenceRoiRadiusPx = Number.parseInt(els.referenceRadiusSlider.value, 10) || 7;
      syncControlsFromState();
      requestRender();
    });
    els.minAreaSlider.addEventListener("input", () => {
      state.analysis.minAreaMm2 = Number.parseFloat(els.minAreaSlider.value) || 0.8;
      syncControlsFromState();
    });
    els.massFactorInput.addEventListener("change", () => {
      state.analysis.massCalibrationFactor = Number.parseFloat(els.massFactorInput.value) || 0.81;
      if (state.analysis.methodSummary) {
        rebuildOutputsFromState();
      }
    });
    els.minResidualSlider.addEventListener("input", () => {
      state.analysis.minResidualHu = Number.parseInt(els.minResidualSlider.value, 10) || 35;
      syncControlsFromState();
    });
    els.localResidualSlider.addEventListener("input", () => {
      state.analysis.localResidualHu = Number.parseInt(els.localResidualSlider.value, 10) || 18;
      syncControlsFromState();
    });
    els.runDetectionButton.addEventListener("click", () => {
      runEstimation({ preserveOverrides: true }).catch((error) => {
        console.error(error);
        setStatus(error.message || "Estimation failed.", "error");
      });
    });
    els.restoreAutoButton.addEventListener("click", restoreAutoEstimate);

    els.activeLabelSelect.addEventListener("change", () => {
      state.selectedLabelCode = Number.parseInt(els.activeLabelSelect.value, 10) || 1;
      if (state.analysis.activeComponentId != null && state.analysis.results) {
        relabelComponent(state.analysis.activeComponentId, state.selectedLabelCode);
        return;
      }
      refreshDerivedUi();
    });
    els.toolButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.tool = button.dataset.tool || "tapLabel";
        setViewerMode("edit", { silent: true });
        refreshDerivedUi();
        requestRender();
      });
    });
    els.viewerModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setViewerMode(button.dataset.viewerMode || "edit");
      });
    });
    els.presentationResetWindowButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetCurrentWindowing({ silent: true });
    });
    els.presentationResetFitButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetViewTransform({ silent: true });
    });
    els.resetViewButton.addEventListener("click", () => {
      resetViewTransform();
    });
    els.resetWindowButton.addEventListener("click", () => {
      resetCurrentWindowing();
    });
    els.toggleOverlayButton.addEventListener("click", () => {
      state.overlayVisible = !state.overlayVisible;
      syncControlsFromState();
      requestRender();
    });
    els.toggleReferenceOverlayButton.addEventListener("click", () => {
      state.referenceOverlayVisible = !state.referenceOverlayVisible;
      syncControlsFromState();
      requestRender();
    });
    els.clearSelectionButton.addEventListener("click", () => {
      state.analysis.activeComponentId = null;
      refreshDerivedUi();
      requestRender();
    });
    els.exportCsvButton.addEventListener("click", () => exportCsv());
    els.exportPngButton.addEventListener("click", () => {
      exportReviewPng().catch((error) => {
        console.error(error);
        setStatus(error.message || "PNG export failed.", "error");
      });
    });

    els.presetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.currentPreset = button.dataset.preset || "contrast";
        syncControlsFromState();
        requestRender();
      });
    });
    els.sliceSlider.addEventListener("input", () => {
      setCurrentSliceIndex(Number.parseInt(els.sliceSlider.value, 10) || 0);
    });

    els.overlayCanvas.addEventListener("pointerdown", handlePointerDown);
    els.overlayCanvas.addEventListener("pointermove", handlePointerMove);
    els.overlayCanvas.addEventListener("pointerleave", clearPointer);
    els.overlayCanvas.addEventListener("wheel", handleCanvasWheel, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    els.overlayCanvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    document.querySelectorAll("[data-modal-close='true']").forEach((element) => {
      element.addEventListener("click", closeFinishModal);
    });
    els.finishCancelButton.addEventListener("click", closeFinishModal);
    els.finishConfirmButton.addEventListener("click", () => {
      finishAndClosePatient().catch((error) => {
        console.error(error);
        setStatus(error.message || "Finish and close failed.", "error");
      });
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
    els.finishStudyIdInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        finishAndClosePatient().catch((error) => {
          console.error(error);
          setStatus(error.message || "Finish and close failed.", "error");
        });
      } else if (event.key === "Escape") {
        closeFinishModal();
      }
    });

    window.addEventListener("resize", requestRender);
    document.addEventListener("keydown", handleDocumentKeyDown);
  }

  function init() {
    cacheElements();
    bindEvents();
    refreshExportStudyOptions().catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not load export studies.", "error");
    });
    clearStudy({ silent: true });
    render();
    setStatus("Ready for a post-contrast coronary CTA or cardiac CT series.");
  }

  init();
})();
