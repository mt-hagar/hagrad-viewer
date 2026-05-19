(function () {
  "use strict";

  const DEFAULT_HU_THRESHOLD = { min: -190, max: -30 };
  const SESSION_EXPORT_VERSION = 2;
  const GUIDE_STEPS = ["Load", "Range", "Start", "Review", "Transfer", "Export"];
  const GUIDE_STEP_TARGETS = {
    0: {
      groupId: "sidebar-group-workflow",
      sectionId: "sidebar-section-reconstructions",
      label: "Reconstructions",
    },
    1: {
      groupId: "sidebar-group-segmentation",
      sectionId: "sidebar-section-range",
      label: "Slice Range",
    },
    2: {
      groupId: "sidebar-group-segmentation",
      sectionId: "sidebar-section-eat-mode",
      label: "EAT Mode",
    },
    3: {
      groupId: "sidebar-group-review",
      sectionId: "sidebar-section-slice-review",
      label: "Slice Review",
    },
    4: {
      groupId: "sidebar-group-workflow",
      sectionId: "sidebar-section-reconstructions",
      label: "Reconstructions",
    },
    5: {
      groupId: "sidebar-group-export",
      sectionId: "sidebar-section-export-summary",
      label: "Export Summary",
    },
  };
  const EatShared = window.HagradEatShared || {};
  const ERASE_BRUSH_PRESETS = {
    normal: 12,
    big: 28,
  };
  const VOI_PRESETS = {
    cardiac: { width: 450, center: 50 },
    fat: { width: 260, center: -90 },
    wide: { width: 900, center: 100 },
  };
  const TOOL_CURSORS = {
    contour: "crosshair",
    edit: "default",
    erase: "crosshair",
    windowLevel: "crosshair",
    pan: "grab",
    zoom: "zoom-in",
  };
  const SUPPORTED_TRANSFER_SYNTAXES = new Set([
    "1.2.840.10008.1.2",
    "1.2.840.10008.1.2.1",
  ]);
  const RESAMPLED_CONTOUR_POINTS = 96;
  const HANDLE_TARGET_COUNT = 24;
  const AUTO_EAT_SETTINGS = {
    bodyHuThreshold: -350,
    coreHuMin: -40,
    coreHuMax: 450,
    coreMinAreaMm2: 250,
    coreMaxAreaMm2: 28000,
    angleSamples: 96,
    fatMarginMm: 28,
    contourPaddingMm: 3,
    minimumEnvelopeMm: 6,
    maxSearchRadiusMm: 90,
    radiusSmoothingWindow: 2,
    radiusSmoothingPasses: 2,
  };

  const state = {
    reconstructions: [],
    activeReconstructionId: null,
    volume: null,
    records: [],
    seriesLabel: null,
    currentSliceIndex: 0,
    topSliceIndex: 0,
    bottomSliceIndex: 0,
    rangeConfigured: false,
    activeTool: "contour",
    currentVOI: { ...VOI_PRESETS.cardiac },
    currentPreset: "cardiac",
    presentationFocus: false,
    focusSidebarOpen: false,
    focusReturnScroll: { x: 0, y: 0 },
    activeFocusGroupId: "sidebar-group-workflow",
    huThreshold: { ...DEFAULT_HU_THRESHOLD },
    showThresholdOverlay: true,
    compareMode: false,
    compareReconstructionId: null,
    contours: new Map(),
    exclusionMasks: new Map(),
    metricsCache: new Map(),
    contourRevisionSequence: 0,
    renderQueued: false,
    dragging: null,
    eraseBrushRadius: 12,
    hoverImagePoint: null,
    view: {
      zoom: 1,
      panX: 0,
      panY: 0,
    },
    decoderFallbackReady: false,
    imageBufferCanvas: null,
    historyEntries: [],
    historyIndex: -1,
    restoringHistory: false,
    backend: {
      checking: false,
      aiSegmenting: false,
      trainingSubmitting: false,
      status: null,
      lastResult: null,
    },
    project: {
      loading: false,
      creating: false,
      appendingExport: false,
      savingSession: false,
      projects: [],
      currentProjectId: null,
      currentProject: null,
      cases: [],
      caseId: "",
      caseLabel: "",
    },
    export: {
      promptOpen: false,
      action: null,
      studyId: "",
      currentStudyId: "",
      studies: [],
      busy: false,
    },
  };

  window.HAGRadWorkflowGuardState = {
    hasOpenStudy() {
      return state.reconstructions.length > 0;
    },
  };

  const els = {};
  const exportStudyApi = window.HAGRadExportStudies || null;
  let guideTargetHighlightTimer = null;

  function cacheElements() {
    els.app = document.querySelector(".app");
    els.sidebar = document.getElementById("sidebar");
    els.dicomInput = document.getElementById("dicom-input");
    els.reconInput = document.getElementById("recon-input");
    els.dicomFolderInput = document.getElementById("dicom-folder-input");
    els.reconFolderInput = document.getElementById("recon-folder-input");
    els.sessionInput = document.getElementById("session-input");
    els.clearButton = document.getElementById("clear-button");
    els.statusPill = document.getElementById("status-pill");
    els.guideStepReadout = document.getElementById("guide-step-readout");
    els.guideProgressFill = document.getElementById("guide-progress-fill");
    els.guideStepList = document.getElementById("guide-step-list");
    els.guideActionTitle = document.getElementById("guide-action-title");
    els.guideActionCopy = document.getElementById("guide-action-copy");
    els.undoButton = document.getElementById("undo-button");
    els.redoButton = document.getElementById("redo-button");
    els.saveSessionButton = document.getElementById("save-session-button");
    els.reconstructionSummary = document.getElementById("reconstruction-summary");
    els.transferReconstructionsButton = document.getElementById("transfer-recons-button");
    els.reconstructionList = document.getElementById("reconstruction-list");
    els.compareToggleButton = document.getElementById("compare-toggle-button");
    els.compareSelect = document.getElementById("compare-select");
    els.compareStatusNote = document.getElementById("compare-status-note");
    els.topSliceInput = document.getElementById("top-slice-input");
    els.bottomSliceInput = document.getElementById("bottom-slice-input");
    els.setTopButton = document.getElementById("set-top-button");
    els.setBottomButton = document.getElementById("set-bottom-button");
    els.rangeResetButton = document.getElementById("range-reset-button");
    els.nextPendingButton = document.getElementById("next-pending-button");
    els.rangeSummary = document.getElementById("range-summary");
    els.toolButtons = Array.from(document.querySelectorAll("[data-tool]"));
    els.presetButtons = Array.from(document.querySelectorAll("[data-preset]"));
    els.copyPrevButton = document.getElementById("copy-prev-button");
    els.copyNextButton = document.getElementById("copy-next-button");
    els.segmentButton = document.getElementById("segment-button");
    els.autoEatButton = document.getElementById("auto-eat-button");
    els.aiSegmentButton = document.getElementById("ai-segment-button");
    els.sendTrainingButton = document.getElementById("send-training-button");
    els.aiBackendRefreshButton = document.getElementById("ai-backend-refresh-button");
    els.aiBackendMetrics = document.getElementById("ai-backend-metrics");
    els.aiBackendStatus = document.getElementById("ai-backend-status");
    els.aiBackendMode = document.getElementById("ai-backend-mode");
    els.aiBackendTraining = document.getElementById("ai-backend-training");
    els.clearContourButton = document.getElementById("clear-contour-button");
    els.eraseRadiusInput = document.getElementById("erase-radius-input");
    els.erasePresetButtons = Array.from(document.querySelectorAll("[data-erase-preset]"));
    els.clearEraseButton = document.getElementById("clear-erase-button");
    els.thresholdMinInput = document.getElementById("threshold-min-input");
    els.thresholdMaxInput = document.getElementById("threshold-max-input");
    els.thresholdDefaultsButton = document.getElementById("threshold-defaults-button");
    els.thresholdToggleButton = document.getElementById("threshold-toggle-button");
    els.windowWidthInput = document.getElementById("window-width-input");
    els.windowCenterInput = document.getElementById("window-center-input");
    els.zoomOutButton = document.getElementById("zoom-out-button");
    els.zoomInButton = document.getElementById("zoom-in-button");
    els.resetViewButton = document.getElementById("reset-view-button");
    els.presentationResetWindowButton = document.getElementById("presentation-reset-window-button");
    els.presentationResetFitButton = document.getElementById("presentation-reset-fit-button");
    els.presentationFocusToggleButton = document.getElementById("presentation-focus-toggle-button");
    els.presentationFocusExitButton = document.getElementById("presentation-focus-exit-button");
    els.focusWorkflowButtons = Array.from(document.querySelectorAll("[data-focus-sidebar-group]"));
    els.focusFinishCloseButton = document.getElementById("focus-finish-close-button");
    els.zoomReadout = document.getElementById("zoom-readout");
    els.currentSliceStatus = document.getElementById("current-slice-status");
    els.currentSliceMetrics = document.getElementById("current-slice-metrics");
    els.summaryCoverage = document.getElementById("summary-coverage");
    els.summaryMetrics = document.getElementById("summary-metrics");
    els.sliceReviewCount = document.getElementById("slice-review-count");
    els.sliceList = document.getElementById("slice-list");
    els.metaPatient = document.getElementById("meta-patient");
    els.metaPatientId = document.getElementById("meta-patient-id");
    els.metaSeries = document.getElementById("meta-series");
    els.metaSlices = document.getElementById("meta-slices");
    els.metaMatrix = document.getElementById("meta-matrix");
    els.metaSpacing = document.getElementById("meta-spacing");
    els.metaThickness = document.getElementById("meta-thickness");
    els.metaTime = document.getElementById("meta-time");
    els.sliceSummary = document.getElementById("slice-summary");
    els.presentationFastScrollSlider = document.getElementById("presentation-fast-scroll-slider");
    els.presentationFastScrollValue = document.getElementById("presentation-fast-scroll-value");
    els.toolHud = document.getElementById("eat-tool-hud");
    els.activeReconstructionReadout = document.getElementById("active-reconstruction-readout");
    els.compareReadout = document.getElementById("compare-readout");
    els.thresholdReadout = document.getElementById("threshold-readout");
    els.toolSummary = document.getElementById("tool-summary");
    els.emptyState = document.getElementById("empty-state");
    els.finishCloseButton = document.getElementById("finish-close-button");
    els.exportImageButton = document.getElementById("export-image-button");
    els.exportCsvButton = document.getElementById("export-csv-button");
    els.exportDialogBackdrop = document.getElementById("export-dialog-backdrop");
    els.exportDialog = document.getElementById("export-dialog");
    els.exportDialogTitle = document.getElementById("export-dialog-title");
    els.exportDialogCopy = document.getElementById("export-dialog-copy");
    els.exportDialogHint = document.getElementById("export-dialog-hint");
    els.exportStudyIdInput = document.getElementById("export-study-id-input");
    els.exportStudySelect = document.getElementById("export-study-select");
    els.exportStudyCreateInput = document.getElementById("export-study-create-input");
    els.exportStudyCreateButton = document.getElementById("export-study-create-button");
    els.exportStudyTargetNote = document.getElementById("export-study-target-note");
    els.exportDialogConfirm = document.getElementById("export-dialog-confirm");
    els.exportDialogCancel = document.getElementById("export-dialog-cancel");
    els.projectSummary = document.getElementById("project-summary");
    els.projectSelect = document.getElementById("project-select");
    els.projectRefreshButton = document.getElementById("project-refresh-button");
    els.projectNextCaseButton = document.getElementById("project-next-case-button");
    els.projectNameInput = document.getElementById("project-name-input");
    els.projectCreateButton = document.getElementById("project-create-button");
    els.projectSaveSessionButton = document.getElementById("project-save-session-button");
    els.projectCaseIdInput = document.getElementById("project-case-id-input");
    els.projectCaseLabelInput = document.getElementById("project-case-label-input");
    els.projectStatusNote = document.getElementById("project-status-note");
    els.projectCaseList = document.getElementById("project-case-list");
    els.viewerGrid = document.getElementById("viewer-grid");
    els.primaryPanelLabel = document.getElementById("primary-panel-label");
    els.comparePanel = document.getElementById("compare-panel");
    els.comparePanelLabel = document.getElementById("compare-panel-label");
    els.canvasShell = document.getElementById("canvas-shell");
    els.canvas = document.getElementById("eat-canvas");
    els.compareShell = document.getElementById("compare-shell");
    els.compareCanvas = document.getElementById("compare-canvas");
    els.compareEmptyState = document.getElementById("compare-empty-state");
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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getThresholdLabel() {
    return `${state.huThreshold.min} to ${state.huThreshold.max} HU`;
  }

  function normalizeSourceDetails(sourceDetails) {
    if (Number.isFinite(sourceDetails)) {
      return {
        sourceSliceIndex: sourceDetails,
        sourceLabel: null,
      };
    }

    if (sourceDetails && typeof sourceDetails === "object") {
      return {
        sourceSliceIndex: Number.isFinite(sourceDetails.sourceSliceIndex) ? sourceDetails.sourceSliceIndex : null,
        sourceLabel: safeString(sourceDetails.sourceLabel),
      };
    }

    return {
      sourceSliceIndex: null,
      sourceLabel: null,
    };
  }

  function safeString(value) {
    if (typeof EatShared.safeString === "function") {
      return EatShared.safeString(value);
    }
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  }

  function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function parseNumericArray(value) {
    if (!value) {
      return [];
    }

    return String(value)
      .split("\\")
      .map((part) => Number.parseFloat(part))
      .filter(Number.isFinite);
  }

  function parseFirstNumber(value) {
    const first = parseNumericArray(value)[0];
    return Number.isFinite(first) ? first : null;
  }

  function prettifyPatientName(value) {
    if (typeof EatShared.prettifyPatientName === "function") {
      return EatShared.prettifyPatientName(value);
    }
    return safeString(value)?.replace(/\^+/g, " ") ?? null;
  }

  function formatDimension(value, suffix) {
    return Number.isFinite(value) ? `${value.toFixed(3).replace(/\.?0+$/, "")} ${suffix || "mm"}` : "-";
  }

  function formatSpacing(spacing) {
    if (!Array.isArray(spacing) || spacing.length < 2) {
      return "-";
    }

    return `${spacing[0].toFixed(3).replace(/\.?0+$/, "")} x ${spacing[1]
      .toFixed(3)
      .replace(/\.?0+$/, "")} mm`;
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) {
      return "-";
    }
    return Number(value)
      .toFixed(digits ?? 2)
      .replace(/\.?0+$/, "");
  }

  function formatDicomDate(value) {
    if (typeof EatShared.formatDicomDate === "function") {
      return EatShared.formatDicomDate(value);
    }
    const text = safeString(value);
    if (!text || text.length !== 8) {
      return null;
    }
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }

  function formatDicomTime(value) {
    if (typeof EatShared.formatDicomTime === "function") {
      return EatShared.formatDicomTime(value);
    }
    const text = safeString(value);
    if (!text) {
      return null;
    }

    const compact = text.split(".")[0];
    const hh = compact.slice(0, 2).padEnd(2, "0");
    const mm = compact.slice(2, 4).padEnd(2, "0");
    const ss = compact.slice(4, 6).padEnd(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function combineDateTime(record) {
    if (typeof EatShared.combineDateTime === "function") {
      return EatShared.combineDateTime(record);
    }
    const date =
      formatDicomDate(record.acquisitionDate) ||
      formatDicomDate(record.contentDate) ||
      formatDicomDate(record.studyDate);
    const time =
      formatDicomTime(record.acquisitionTime) ||
      formatDicomTime(record.contentTime) ||
      formatDicomTime(record.studyTime);

    if (date && time) {
      return `${date} ${time}`;
    }
    return date || time || "-";
  }

  function sanitizeFilePart(value, fallback) {
    const cleaned = String(value || "")
      .trim()
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "");
    return cleaned || fallback;
  }

  function buildBackendStudyCacheKey(reconstruction) {
    if (typeof EatShared.buildBackendStudyCacheKey === "function") {
      return EatShared.buildBackendStudyCacheKey(reconstruction);
    }

    const records = Array.isArray(reconstruction?.records) ? reconstruction.records : [];
    const firstRecord = records[0] || {};
    const file = firstRecord.file || {};
    return (
      safeString(firstRecord.seriesInstanceUID) ||
      safeString(firstRecord.studyInstanceUID) ||
      safeString(file.name) ||
      null
    );
  }

  function buildExportFilename(prefix, extension, studyId) {
    const firstRecord = state.records[0] || {};
    const study = sanitizeFilePart(safeString(studyId), "");
    const patient = sanitizeFilePart(firstRecord.patientName || firstRecord.patientId, "patient");
    const seriesBase =
      state.reconstructions.length > 1
        ? "multi_reconstruction"
        : state.seriesLabel || firstRecord.seriesDescription || "series";
    const series = sanitizeFilePart(seriesBase, "series");
    const parts = [prefix];
    if (study) {
      parts.push(study);
    }
    parts.push(patient, series);
    return `${parts.join("_")}.${extension}`;
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
          workflow: "eat",
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

  function getSuggestedStudyId() {
    const firstRecord = getFirstLoadedRecord();
    return (
      safeString(state.export.studyId) ||
      safeString(firstRecord.patientId) ||
      safeString(firstRecord.studyInstanceUID) ||
      ""
    );
  }

  function buildUniqueLabel(baseLabel, existingLabels) {
    const normalizedBase = safeString(baseLabel) || "Reconstruction";
    if (!existingLabels.has(normalizedBase)) {
      return normalizedBase;
    }

    let copyIndex = 2;
    let candidate = `${normalizedBase} (${copyIndex})`;
    while (existingLabels.has(candidate)) {
      copyIndex += 1;
      candidate = `${normalizedBase} (${copyIndex})`;
    }
    return candidate;
  }

  function getDefaultRangeState(volume) {
    return {
      topSliceIndex: 0,
      bottomSliceIndex: Math.max(0, (volume?.depth || 1) - 1),
      rangeConfigured: false,
    };
  }

  function normalizeRangeState(rangeState, volume) {
    const defaults = getDefaultRangeState(volume);
    if (!volume) {
      return defaults;
    }

    const maxSliceIndex = Math.max(0, volume.depth - 1);
    return {
      topSliceIndex: clamp(
        Number.isFinite(rangeState?.topSliceIndex) ? Number(rangeState.topSliceIndex) : defaults.topSliceIndex,
        0,
        maxSliceIndex
      ),
      bottomSliceIndex: clamp(
        Number.isFinite(rangeState?.bottomSliceIndex) ? Number(rangeState.bottomSliceIndex) : defaults.bottomSliceIndex,
        0,
        maxSliceIndex
      ),
      rangeConfigured: Boolean(rangeState?.rangeConfigured),
    };
  }

  function getRangeStateFromState() {
    return normalizeRangeState(
      {
        topSliceIndex: state.topSliceIndex,
        bottomSliceIndex: state.bottomSliceIndex,
        rangeConfigured: state.rangeConfigured,
      },
      state.volume
    );
  }

  function getRangeStateForReconstruction(reconstruction) {
    return normalizeRangeState(reconstruction, reconstruction?.volume);
  }

  function applyRangeStateToState(rangeState, volume) {
    const normalized = normalizeRangeState(rangeState, volume);
    state.topSliceIndex = normalized.topSliceIndex;
    state.bottomSliceIndex = normalized.bottomSliceIndex;
    state.rangeConfigured = normalized.rangeConfigured;
  }

  function storeRangeStateOnReconstruction(reconstruction, rangeState) {
    if (!reconstruction) {
      return;
    }
    const normalized = normalizeRangeState(rangeState, reconstruction.volume);
    reconstruction.topSliceIndex = normalized.topSliceIndex;
    reconstruction.bottomSliceIndex = normalized.bottomSliceIndex;
    reconstruction.rangeConfigured = normalized.rangeConfigured;
  }

  function persistActiveReconstructionRange() {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return;
    }
    storeRangeStateOnReconstruction(reconstruction, getRangeStateFromState());
  }

  function getIndexRatio(index, depth) {
    if (!Number.isFinite(index) || !Number.isFinite(depth) || depth <= 1) {
      return 0;
    }
    return clamp(index / (depth - 1), 0, 1);
  }

  function mapIndexByDepthRatio(index, sourceDepth, targetDepth) {
    if (!Number.isFinite(targetDepth) || targetDepth <= 1) {
      return 0;
    }
    return clamp(Math.round(getIndexRatio(index, sourceDepth) * (targetDepth - 1)), 0, targetDepth - 1);
  }

  function getSliceRatioWithinBounds(sliceIndex, bounds) {
    if (!bounds || bounds.count <= 1) {
      return 0;
    }
    return clamp((sliceIndex - bounds.start) / (bounds.count - 1), 0, 1);
  }

  function mapSliceIndexBetweenReconstructions(sourceReconstruction, targetReconstruction, sourceSliceIndex) {
    if (!sourceReconstruction?.volume || !targetReconstruction?.volume) {
      return 0;
    }

    const sourceRangeState = getRangeStateForReconstruction(sourceReconstruction);
    const targetRangeState = getRangeStateForReconstruction(targetReconstruction);
    const sourceBounds = getSliceBoundsForRangeState(sourceRangeState, sourceReconstruction.volume);
    const targetBounds = getSliceBoundsForRangeState(targetRangeState, targetReconstruction.volume);

    if (
      sourceRangeState.rangeConfigured &&
      targetRangeState.rangeConfigured &&
      sourceBounds &&
      targetBounds &&
      sourceSliceIndex >= sourceBounds.start &&
      sourceSliceIndex <= sourceBounds.end
    ) {
      return clamp(
        Math.round(targetBounds.start + getSliceRatioWithinBounds(sourceSliceIndex, sourceBounds) * Math.max(0, targetBounds.count - 1)),
        0,
        targetReconstruction.volume.depth - 1
      );
    }

    return mapIndexByDepthRatio(sourceSliceIndex, sourceReconstruction.volume.depth, targetReconstruction.volume.depth);
  }

  function createReconstructionEntry(label, records, volume) {
    const rangeState = getDefaultRangeState(volume);
    return {
      id: `${sanitizeFilePart(label, "reconstruction")}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label,
      records,
      volume,
      contours: new Map(),
      exclusionMasks: new Map(),
      metricsCache: new Map(),
      transferSourceId: null,
      transferSourceLabel: null,
      transferMode: "local",
      transferWarning: null,
      backendCache: null,
      topSliceIndex: rangeState.topSliceIndex,
      bottomSliceIndex: rangeState.bottomSliceIndex,
      rangeConfigured: rangeState.rangeConfigured,
    };
  }

  function getReconstructionById(reconstructionId) {
    return state.reconstructions.find((reconstruction) => reconstruction.id === reconstructionId) || null;
  }

  function getActiveReconstruction() {
    return getReconstructionById(state.activeReconstructionId);
  }

  function syncActiveReconstructionAliases(reconstruction) {
    state.records = reconstruction?.records || [];
    state.volume = reconstruction?.volume || null;
    state.seriesLabel = reconstruction?.label || null;
    state.contours = reconstruction?.contours || new Map();
    state.exclusionMasks = reconstruction?.exclusionMasks || new Map();
    state.metricsCache = reconstruction?.metricsCache || new Map();
    applyRangeStateToState(reconstruction, reconstruction?.volume || null);
  }

  function clampCurrentSliceToActiveVolume() {
    if (!state.volume) {
      state.currentSliceIndex = 0;
      applyRangeStateToState(null, null);
      return;
    }

    state.currentSliceIndex = clamp(state.currentSliceIndex, 0, state.volume.depth - 1);
    applyRangeStateToState(getRangeStateFromState(), state.volume);
  }

  function activateReconstruction(reconstructionId, options) {
    const reconstruction = getReconstructionById(reconstructionId);
    if (!reconstruction) {
      return false;
    }

    const previousReconstruction = getActiveReconstruction();
    persistActiveReconstructionRange();

    if (
      previousReconstruction?.id &&
      previousReconstruction.id !== reconstruction.id &&
      previousReconstruction.volume &&
      reconstruction.volume &&
      options?.preserveAnatomicalSlice !== false
    ) {
      state.currentSliceIndex = mapSliceIndexBetweenReconstructions(
        previousReconstruction,
        reconstruction,
        state.currentSliceIndex
      );
    }

    state.activeReconstructionId = reconstruction.id;
    state.dragging = null;
    state.hoverImagePoint = null;
    syncActiveReconstructionAliases(reconstruction);
    clampCurrentSliceToActiveVolume();
    ensureValidCompareSelection();

    if (options?.resetView) {
      state.view.zoom = 1;
      state.view.panX = 0;
      state.view.panY = 0;
    }

    if (options?.refresh !== false) {
      refreshUi();
      requestRender();
    }

    if (options?.statusMessage) {
      setStatus(options.statusMessage);
    }

    return true;
  }

  function captureActiveReconstructionContext() {
    return {
      activeReconstructionId: state.activeReconstructionId,
      volume: state.volume,
      records: state.records,
      seriesLabel: state.seriesLabel,
      currentSliceIndex: state.currentSliceIndex,
      topSliceIndex: state.topSliceIndex,
      bottomSliceIndex: state.bottomSliceIndex,
      rangeConfigured: state.rangeConfigured,
      contours: state.contours,
      exclusionMasks: state.exclusionMasks,
      metricsCache: state.metricsCache,
    };
  }

  function restoreActiveReconstructionContext(snapshot) {
    state.activeReconstructionId = snapshot.activeReconstructionId;
    state.volume = snapshot.volume;
    state.records = snapshot.records;
    state.seriesLabel = snapshot.seriesLabel;
    state.currentSliceIndex = snapshot.currentSliceIndex;
    state.topSliceIndex = snapshot.topSliceIndex;
    state.bottomSliceIndex = snapshot.bottomSliceIndex;
    state.rangeConfigured = snapshot.rangeConfigured;
    state.contours = snapshot.contours;
    state.exclusionMasks = snapshot.exclusionMasks;
    state.metricsCache = snapshot.metricsCache;
  }

  async function withReconstructionContext(reconstruction, callback) {
    const snapshot = captureActiveReconstructionContext();
    persistActiveReconstructionRange();
    state.activeReconstructionId = reconstruction.id;
    syncActiveReconstructionAliases(reconstruction);
    clampCurrentSliceToActiveVolume();
    try {
      return await callback();
    } finally {
      restoreActiveReconstructionContext(snapshot);
    }
  }

  function cloneContourRecordForTransfer(contourRecord) {
    return {
      points: contourRecord.points.map((point) => ({ x: point.x, y: point.y })),
      status: contourRecord.status,
      sourceSliceIndex: contourRecord.sourceSliceIndex,
      sourceLabel: contourRecord.sourceLabel,
      revision: ++state.contourRevisionSequence,
    };
  }

  function cloneContourMapForTransfer(contours) {
    const cloned = new Map();
    contours.forEach((contourRecord, sliceIndex) => {
      cloned.set(sliceIndex, cloneContourRecordForTransfer(contourRecord));
    });
    return cloned;
  }

  function cloneExclusionMasksForTransfer(exclusionMasks) {
    const cloned = new Map();
    exclusionMasks.forEach((mask, sliceIndex) => {
      const copy = new Uint8Array(mask.length);
      copy.set(mask);
      cloned.set(sliceIndex, copy);
    });
    return cloned;
  }

  function hasTransferredSegmentation(reconstruction) {
    return Boolean(reconstruction?.contours?.size);
  }

  function nearlyEqual(left, right, tolerance) {
    return Math.abs(Number(left) - Number(right)) <= (tolerance ?? 0.001);
  }

  function hasTransferGeometry(record) {
    return Boolean(
      record &&
        Array.isArray(record.imagePositionPatient) &&
        record.imagePositionPatient.length >= 3 &&
        Array.isArray(record.rowDirection) &&
        record.rowDirection.length >= 3 &&
        Array.isArray(record.columnDirection) &&
        record.columnDirection.length >= 3 &&
        Array.isArray(record.pixelSpacing) &&
        record.pixelSpacing.length >= 2
    );
  }

  function getSlicePositionCoordinate(record) {
    if (!record?.normalVector || record.imagePositionPatient.length < 3) {
      return null;
    }
    return dot(record.imagePositionPatient, record.normalVector);
  }

  function canUsePatientGeometryForTransfer(source, target) {
    const sourceFrame = safeString(source?.records?.[0]?.frameOfReferenceUID);
    const targetFrame = safeString(target?.records?.[0]?.frameOfReferenceUID);
    if (!sourceFrame || !targetFrame || sourceFrame !== targetFrame) {
      return false;
    }

    return Boolean(
      source.records?.some(hasTransferGeometry) &&
        target.records?.some(hasTransferGeometry)
    );
  }

  function getReconstructionCompatibility(reference, candidate) {
    if (!reference || !candidate) {
      return {
        compatible: false,
        transferMode: "blocked",
        reason: "No reconstruction loaded",
        detail: "Load a reconstruction first",
      };
    }

    if (reference.id === candidate.id) {
      return {
        compatible: true,
        transferMode: "active",
        reason: "Active reconstruction",
        detail: "Currently selected",
      };
    }

    if (!reference.volume || !candidate.volume) {
      return {
        compatible: false,
        transferMode: "blocked",
        reason: "Volume not available",
        detail: "Missing decoded volume",
      };
    }

    const mismatchReasons = [];
    if (reference.volume.rows !== candidate.volume.rows || reference.volume.columns !== candidate.volume.columns) {
      mismatchReasons.push("Matrix mismatch");
    }

    if (reference.volume.depth !== candidate.volume.depth) {
      mismatchReasons.push("Slice count mismatch");
    }

    if (
      !nearlyEqual(reference.volume.rowSpacing, candidate.volume.rowSpacing, 0.01) ||
      !nearlyEqual(reference.volume.columnSpacing, candidate.volume.columnSpacing, 0.01) ||
      !nearlyEqual(reference.volume.sliceSpacing, candidate.volume.sliceSpacing, 0.2)
    ) {
      mismatchReasons.push("Voxel spacing mismatch");
    }

    let slicePositionsDiffer = false;
    for (let sliceIndex = 0; sliceIndex < reference.records.length; sliceIndex += 1) {
      const referencePosition = getSlicePositionCoordinate(reference.records[sliceIndex]);
      const candidatePosition = getSlicePositionCoordinate(candidate.records[sliceIndex]);
      if (referencePosition == null || candidatePosition == null) {
        continue;
      }
      if (!nearlyEqual(referencePosition, candidatePosition, 0.75)) {
        slicePositionsDiffer = true;
        break;
      }
    }

    if (slicePositionsDiffer) {
      mismatchReasons.push("Different acquisition geometry");
    }

    if (!mismatchReasons.length) {
      return {
        compatible: true,
        transferMode: "aligned",
        reason: hasTransferredSegmentation(candidate) ? "Aligned transfer" : "Aligned",
        detail: "Direct contour transfer",
      };
    }

    return {
      compatible: true,
      transferMode: "approximate",
      reason: "Best-effort mapping",
      detail: mismatchReasons.join(", "),
      usesPatientGeometry: canUsePatientGeometryForTransfer(reference, candidate),
    };
  }

  function getExportableReconstructions() {
    return state.reconstructions.filter((reconstruction) => hasTransferredSegmentation(reconstruction));
  }

  function waitForAnimationFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(resolve));
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

  async function canvasToPngBlob(canvas) {
    if (window.HAGRadZip?.canvasToPngBlob) {
      return window.HAGRadZip.canvasToPngBlob(canvas);
    }
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to create image export."));
            return;
          }
          resolve(blob);
        },
        "image/png",
        1
      );
    });
  }

  async function downloadExportBundle(files, zipFilename, options) {
    const validFiles = (files || []).filter((file) => file?.blob);
    if (!validFiles.length) {
      throw new Error("No export files were available.");
    }
    if (!window.HAGRadZip?.downloadBundle) {
      validFiles.forEach((file) => downloadBlob(file.blob, file.filename, options));
      return { filename: zipFilename, fileCount: validFiles.length };
    }
    return window.HAGRadZip.downloadBundle(validFiles, zipFilename, {
      persistFile: persistBlobToExportOutbox,
      persistZip: persistBlobToExportOutbox,
      fileOptions: options,
      zipOptions: options,
    });
  }

  function downloadText(text, filename, mimeType, options) {
    const blob = new Blob([text], { type: mimeType || "text/plain;charset=utf-8" });
    downloadBlob(blob, filename, options);
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload || {}),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Request failed.");
    }
    return data;
  }

  async function downloadCanvas(canvas, filename, options) {
    const blob = await canvasToPngBlob(canvas);
    return downloadExportBundle(
      [{ filename, blob }],
      window.HAGRadZip?.zipNameFrom ? window.HAGRadZip.zipNameFrom(filename) : filename.replace(/\.[^.]+$/, ".zip"),
      options
    );
  }

  function getFirstLoadedRecord() {
    return state.reconstructions[0]?.records?.[0] || state.records[0] || {};
  }

  function parseDicomAgeToYears(value) {
    if (typeof EatShared.parseDicomAgeToYears === "function") {
      return EatShared.parseDicomAgeToYears(value);
    }
    const match = String(value || "").trim().match(/^(\d{1,3})([DWMY])$/i);
    if (!match) {
      return null;
    }

    const quantity = Number(match[1]);
    const unit = match[2].toUpperCase();
    if (!Number.isFinite(quantity)) {
      return null;
    }
    if (unit === "Y") {
      return quantity;
    }
    if (unit === "M") {
      return quantity / 12;
    }
    if (unit === "W") {
      return quantity / 52;
    }
    if (unit === "D") {
      return quantity / 365.25;
    }
    return null;
  }

  function getReconstructionSessionKey(reconstruction) {
    const firstRecord = reconstruction?.records?.[0] || {};
    return firstRecord.seriesInstanceUID || reconstruction?.label || "reconstruction";
  }

  function encodeMaskRuns(mask) {
    if (!(mask instanceof Uint8Array)) {
      return [];
    }

    const runs = [];
    let index = 0;
    while (index < mask.length) {
      if (!mask[index]) {
        index += 1;
        continue;
      }

      const start = index;
      while (index < mask.length && mask[index]) {
        index += 1;
      }
      runs.push([start, index - start]);
    }
    return runs;
  }

  function decodeMaskRuns(runs, length) {
    const mask = new Uint8Array(length);
    (runs || []).forEach((run) => {
      const start = clamp(Math.round(Number(run?.[0] ?? 0)), 0, Math.max(0, length - 1));
      const count = clamp(Math.round(Number(run?.[1] ?? 0)), 0, length - start);
      for (let offset = 0; offset < count; offset += 1) {
        mask[start + offset] = 1;
      }
    });
    return mask;
  }

  function serializeContourMap(contours) {
    return Array.from(contours.entries()).map(([sliceIndex, contourRecord]) => ({
      sliceIndex,
      status: contourRecord.status,
      sourceSliceIndex: contourRecord.sourceSliceIndex,
      sourceLabel: contourRecord.sourceLabel,
      points: contourRecord.points.map((point) => ({
        x: Number(point.x),
        y: Number(point.y),
      })),
    }));
  }

  function serializeExclusionMap(exclusionMasks) {
    return Array.from(exclusionMasks.entries()).map(([sliceIndex, mask]) => ({
      sliceIndex,
      runs: encodeMaskRuns(mask),
    }));
  }

  function deserializeContourMap(items) {
    const contours = new Map();
    (items || []).forEach((item) => {
      const points = Array.isArray(item?.points)
        ? item.points
            .map((point) => ({
              x: Number(point?.x),
              y: Number(point?.y),
            }))
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
        : [];
      if (!points.length) {
        return;
      }
      contours.set(Number(item.sliceIndex), createContourRecord(points, item.status, {
        sourceSliceIndex: Number.isFinite(item.sourceSliceIndex) ? Number(item.sourceSliceIndex) : null,
        sourceLabel: safeString(item.sourceLabel),
      }));
    });
    return contours;
  }

  function deserializeExclusionMap(items, volume) {
    const exclusionMasks = new Map();
    const expectedLength = (volume?.rows || 0) * (volume?.columns || 0);
    (items || []).forEach((item) => {
      if (!expectedLength) {
        return;
      }
      exclusionMasks.set(Number(item.sliceIndex), decodeMaskRuns(item.runs, expectedLength));
    });
    return exclusionMasks;
  }

  function serializeMutableState() {
    return {
      activeReconstructionId: state.activeReconstructionId,
      compareMode: state.compareMode,
      compareReconstructionId: state.compareReconstructionId,
      currentSliceIndex: state.currentSliceIndex,
      topSliceIndex: state.topSliceIndex,
      bottomSliceIndex: state.bottomSliceIndex,
      rangeConfigured: state.rangeConfigured,
      activeTool: state.activeTool,
      currentVOI: {
        width: state.currentVOI.width,
        center: state.currentVOI.center,
      },
      currentPreset: state.currentPreset,
      huThreshold: {
        min: state.huThreshold.min,
        max: state.huThreshold.max,
      },
      showThresholdOverlay: state.showThresholdOverlay,
      eraseBrushRadius: state.eraseBrushRadius,
      reconstructions: state.reconstructions.map((reconstruction) => ({
        id: reconstruction.id,
        transferSourceId: reconstruction.transferSourceId || null,
        transferSourceLabel: reconstruction.transferSourceLabel || null,
        transferMode: reconstruction.transferMode || "local",
        transferWarning: reconstruction.transferWarning || null,
        range: getRangeStateForReconstruction(reconstruction),
        contours: serializeContourMap(reconstruction.contours),
        exclusionMasks: serializeExclusionMap(reconstruction.exclusionMasks),
      })),
    };
  }

  function createHistorySignature(snapshot) {
    return JSON.stringify(snapshot);
  }

  function resetHistory() {
    state.historyEntries = [];
    state.historyIndex = -1;
  }

  function updateHistoryUi() {
    els.undoButton.disabled = state.historyIndex <= 0;
    els.redoButton.disabled = state.historyIndex < 0 || state.historyIndex >= state.historyEntries.length - 1;
    els.saveSessionButton.disabled = !state.reconstructions.length;
  }

  function pushHistorySnapshot(label) {
    if (state.restoringHistory || !state.reconstructions.length) {
      updateHistoryUi();
      return;
    }

    const snapshot = serializeMutableState();
    const signature = createHistorySignature(snapshot);
    const current = state.historyEntries[state.historyIndex];
    if (current?.signature === signature) {
      updateHistoryUi();
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
    updateHistoryUi();
  }

  function applyMutableStateSnapshot(snapshot) {
    const reconstructionMap = new Map(state.reconstructions.map((reconstruction) => [reconstruction.id, reconstruction]));

    state.reconstructions.forEach((reconstruction) => {
      reconstruction.contours = new Map();
      reconstruction.exclusionMasks = new Map();
      reconstruction.metricsCache = new Map();
      reconstruction.transferSourceId = null;
      reconstruction.transferSourceLabel = null;
      reconstruction.transferMode = "local";
      reconstruction.transferWarning = null;
      storeRangeStateOnReconstruction(reconstruction, null);
    });

    (snapshot?.reconstructions || []).forEach((savedReconstruction) => {
      const reconstruction = reconstructionMap.get(savedReconstruction.id);
      if (!reconstruction) {
        return;
      }
      reconstruction.contours = withReconstructionSync(reconstruction, () =>
        deserializeContourMap(savedReconstruction.contours)
      );
      reconstruction.exclusionMasks = deserializeExclusionMap(savedReconstruction.exclusionMasks, reconstruction.volume);
      reconstruction.metricsCache = new Map();
      reconstruction.transferSourceId = savedReconstruction.transferSourceId || null;
      reconstruction.transferSourceLabel = savedReconstruction.transferSourceLabel || null;
      reconstruction.transferMode = savedReconstruction.transferMode || "local";
      reconstruction.transferWarning = safeString(savedReconstruction.transferWarning);
      storeRangeStateOnReconstruction(reconstruction, savedReconstruction.range);
    });

    state.compareMode = Boolean(snapshot?.compareMode);
    state.compareReconstructionId = safeString(snapshot?.compareReconstructionId);
    state.currentSliceIndex = Number.isFinite(snapshot?.currentSliceIndex) ? Number(snapshot.currentSliceIndex) : 0;
    state.topSliceIndex = Number.isFinite(snapshot?.topSliceIndex) ? Number(snapshot.topSliceIndex) : 0;
    state.bottomSliceIndex = Number.isFinite(snapshot?.bottomSliceIndex) ? Number(snapshot.bottomSliceIndex) : 0;
    state.rangeConfigured = Boolean(snapshot?.rangeConfigured);
    state.activeTool = safeString(snapshot?.activeTool) || "contour";
    state.currentVOI = {
      width: Number(snapshot?.currentVOI?.width) || VOI_PRESETS.cardiac.width,
      center: Number(snapshot?.currentVOI?.center) || VOI_PRESETS.cardiac.center,
    };
    state.currentPreset = snapshot?.currentPreset ?? null;
    state.huThreshold = {
      min: Number.isFinite(snapshot?.huThreshold?.min) ? Number(snapshot.huThreshold.min) : DEFAULT_HU_THRESHOLD.min,
      max: Number.isFinite(snapshot?.huThreshold?.max) ? Number(snapshot.huThreshold.max) : DEFAULT_HU_THRESHOLD.max,
    };
    state.showThresholdOverlay = snapshot?.showThresholdOverlay !== false;
    state.eraseBrushRadius = Number.isFinite(snapshot?.eraseBrushRadius) ? Number(snapshot.eraseBrushRadius) : 12;

    const nextActiveReconstruction = getReconstructionById(snapshot?.activeReconstructionId) || state.reconstructions[0] || null;
    state.activeReconstructionId = nextActiveReconstruction?.id || null;
    syncActiveReconstructionAliases(nextActiveReconstruction);
    clampCurrentSliceToActiveVolume();
    ensureValidCompareSelection();
    refreshUi();
    requestRender();
  }

  function restoreHistorySnapshot(targetIndex) {
    const entry = state.historyEntries[targetIndex];
    if (!entry) {
      return;
    }

    state.restoringHistory = true;
    try {
      applyMutableStateSnapshot(entry.snapshot);
      state.historyIndex = targetIndex;
    } finally {
      state.restoringHistory = false;
      updateHistoryUi();
    }
  }

  function undoHistory() {
    if (state.historyIndex <= 0) {
      return;
    }
    restoreHistorySnapshot(state.historyIndex - 1);
    setStatus("Reverted the last workflow edit.");
  }

  function redoHistory() {
    if (state.historyIndex >= state.historyEntries.length - 1) {
      return;
    }
    restoreHistorySnapshot(state.historyIndex + 1);
    setStatus("Reapplied the workflow edit.");
  }

  function buildSessionExport() {
    const firstRecord = getFirstLoadedRecord();
    return {
      version: SESSION_EXPORT_VERSION,
      saved_at: new Date().toISOString(),
      patient_id: firstRecord.patientId || "",
      patient_name: firstRecord.patientName || "",
      study_instance_uid: firstRecord.studyInstanceUID || "",
      ui: {
        currentSliceIndex: state.currentSliceIndex,
        topSliceIndex: state.topSliceIndex,
        bottomSliceIndex: state.bottomSliceIndex,
        rangeConfigured: state.rangeConfigured,
        activeTool: state.activeTool,
        currentVOI: {
          width: state.currentVOI.width,
          center: state.currentVOI.center,
        },
        currentPreset: state.currentPreset,
        huThreshold: {
          min: state.huThreshold.min,
          max: state.huThreshold.max,
        },
        showThresholdOverlay: state.showThresholdOverlay,
        eraseBrushRadius: state.eraseBrushRadius,
        compareMode: state.compareMode,
        activeReconstructionKey: getReconstructionSessionKey(getActiveReconstruction()),
        compareReconstructionKey: getReconstructionSessionKey(getCompareReconstruction()),
      },
      reconstructions: state.reconstructions.map((reconstruction) => ({
        session_key: getReconstructionSessionKey(reconstruction),
        series_instance_uid: reconstruction.records?.[0]?.seriesInstanceUID || "",
        label: reconstruction.label,
        transfer_source_key: reconstruction.transferSourceId
          ? getReconstructionSessionKey(getReconstructionById(reconstruction.transferSourceId))
          : "",
        transfer_source_label: reconstruction.transferSourceLabel || "",
        transfer_mode: reconstruction.transferMode || "local",
        transfer_warning: reconstruction.transferWarning || "",
        range: getRangeStateForReconstruction(reconstruction),
        contours: serializeContourMap(reconstruction.contours),
        exclusionMasks: serializeExclusionMap(reconstruction.exclusionMasks),
      })),
    };
  }

  function findReconstructionForSession(savedReconstruction) {
    const preferredUid = safeString(savedReconstruction?.series_instance_uid);
    const preferredKey = safeString(savedReconstruction?.session_key);
    const preferredLabel = safeString(savedReconstruction?.label);

    return (
      state.reconstructions.find((reconstruction) => {
        const firstRecord = reconstruction.records?.[0] || {};
        return (
          (preferredUid && firstRecord.seriesInstanceUID === preferredUid) ||
          (preferredKey && getReconstructionSessionKey(reconstruction) === preferredKey) ||
          (preferredLabel && reconstruction.label === preferredLabel)
        );
      }) || null
    );
  }

  function loadSessionFromObject(sessionData) {
    if (!state.reconstructions.length) {
      throw new Error("Load the study reconstructions before loading a saved session.");
    }

    const firstRecord = getFirstLoadedRecord();
    if (
      sessionData?.study_instance_uid &&
      firstRecord.studyInstanceUID &&
      sessionData.study_instance_uid !== firstRecord.studyInstanceUID
    ) {
      throw new Error("This session file belongs to a different study. Load the matching study first.");
    }

    const matchedReconstructions = new Map();
    state.reconstructions.forEach((reconstruction) => {
      reconstruction.contours = new Map();
      reconstruction.exclusionMasks = new Map();
      reconstruction.metricsCache = new Map();
      reconstruction.transferSourceId = null;
      reconstruction.transferSourceLabel = null;
      reconstruction.transferMode = "local";
      reconstruction.transferWarning = null;
      storeRangeStateOnReconstruction(reconstruction, null);
    });

    (sessionData?.reconstructions || []).forEach((savedReconstruction) => {
      const reconstruction = findReconstructionForSession(savedReconstruction);
      if (!reconstruction) {
        return;
      }
      reconstruction.contours = withReconstructionSync(reconstruction, () =>
        deserializeContourMap(savedReconstruction.contours)
      );
      reconstruction.exclusionMasks = deserializeExclusionMap(savedReconstruction.exclusionMasks, reconstruction.volume);
      reconstruction.metricsCache = new Map();
      reconstruction.transferSourceLabel = safeString(savedReconstruction.transfer_source_label);
      reconstruction.transferMode = safeString(savedReconstruction.transfer_mode) || "local";
      reconstruction.transferWarning = safeString(savedReconstruction.transfer_warning);
      storeRangeStateOnReconstruction(reconstruction, savedReconstruction.range);
      matchedReconstructions.set(savedReconstruction.session_key, reconstruction);
    });

    (sessionData?.reconstructions || []).forEach((savedReconstruction) => {
      const reconstruction = findReconstructionForSession(savedReconstruction);
      if (!reconstruction) {
        return;
      }
      const sourceReconstruction = matchedReconstructions.get(savedReconstruction.transfer_source_key);
      reconstruction.transferSourceId = sourceReconstruction?.id || null;
      reconstruction.transferSourceLabel =
        reconstruction.transferSourceLabel || sourceReconstruction?.label || null;
    });

    if (!matchedReconstructions.size) {
      throw new Error("This session file does not match any of the currently loaded reconstructions.");
    }

    const ui = sessionData?.ui || {};
    state.compareMode = Boolean(ui.compareMode);
    state.currentSliceIndex = Number.isFinite(ui.currentSliceIndex) ? Number(ui.currentSliceIndex) : state.currentSliceIndex;
    state.topSliceIndex = Number.isFinite(ui.topSliceIndex) ? Number(ui.topSliceIndex) : state.topSliceIndex;
    state.bottomSliceIndex = Number.isFinite(ui.bottomSliceIndex) ? Number(ui.bottomSliceIndex) : state.bottomSliceIndex;
    state.rangeConfigured = Boolean(ui.rangeConfigured);
    state.activeTool = safeString(ui.activeTool) || "contour";
    state.currentVOI = {
      width: Number(ui.currentVOI?.width) || state.currentVOI.width,
      center: Number(ui.currentVOI?.center) || state.currentVOI.center,
    };
    state.currentPreset = ui.currentPreset ?? null;
    state.huThreshold = {
      min: Number.isFinite(ui.huThreshold?.min) ? Number(ui.huThreshold.min) : state.huThreshold.min,
      max: Number.isFinite(ui.huThreshold?.max) ? Number(ui.huThreshold.max) : state.huThreshold.max,
    };
    state.showThresholdOverlay = ui.showThresholdOverlay !== false;
    state.eraseBrushRadius = Number.isFinite(ui.eraseBrushRadius) ? Number(ui.eraseBrushRadius) : state.eraseBrushRadius;

    const activeReconstruction =
      state.reconstructions.find((reconstruction) => getReconstructionSessionKey(reconstruction) === ui.activeReconstructionKey) ||
      state.reconstructions[0] ||
      null;
    state.activeReconstructionId = activeReconstruction?.id || null;
    if (activeReconstruction && !sessionData?.reconstructions?.some((saved) => findReconstructionForSession(saved)?.id === activeReconstruction.id && saved.range)) {
      storeRangeStateOnReconstruction(activeReconstruction, {
        topSliceIndex: ui.topSliceIndex,
        bottomSliceIndex: ui.bottomSliceIndex,
        rangeConfigured: ui.rangeConfigured,
      });
    }
    syncActiveReconstructionAliases(activeReconstruction);

    const compareReconstruction =
      state.reconstructions.find((reconstruction) => getReconstructionSessionKey(reconstruction) === ui.compareReconstructionKey) ||
      null;
    state.compareReconstructionId = compareReconstruction?.id || null;

    clampCurrentSliceToActiveVolume();
    ensureValidCompareSelection();
    refreshUi();
    requestRender();

    resetHistory();
    pushHistorySnapshot("Loaded session");
    setStatus(`Loaded saved session for ${matchedReconstructions.size} reconstruction${matchedReconstructions.size === 1 ? "" : "s"}.`);
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function subtractVectors(a, b) {
    return [(a[0] || 0) - (b[0] || 0), (a[1] || 0) - (b[1] || 0), (a[2] || 0) - (b[2] || 0)];
  }

  function vectorLength(vector) {
    return Math.sqrt(dot(vector, vector));
  }

  function normalize(vector) {
    const length = vectorLength(vector);
    if (!length) {
      return [0, 0, 0];
    }
    return [vector[0] / length, vector[1] / length, vector[2] / length];
  }

  function getNormalVector(imageOrientationPatient) {
    if (!Array.isArray(imageOrientationPatient) || imageOrientationPatient.length !== 6) {
      return null;
    }

    const row = normalize(imageOrientationPatient.slice(0, 3));
    const column = normalize(imageOrientationPatient.slice(3, 6));
    return normalize(cross(row, column));
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
        patientBirthDate: safeString(dataSet.string("x00100030")),
        patientSex: safeString(dataSet.string("x00100040")),
        patientAge: safeString(dataSet.string("x00101010")),
        studyDate: safeString(dataSet.string("x00080020")),
        studyTime: safeString(dataSet.string("x00080030")),
        acquisitionDate: safeString(dataSet.string("x00080022")),
        acquisitionTime: safeString(dataSet.string("x00080032")),
        contentDate: safeString(dataSet.string("x00080023")),
        contentTime: safeString(dataSet.string("x00080033")),
        modality: safeString(dataSet.string("x00080060")),
        accessionNumber: safeString(dataSet.string("x00080050")),
        seriesDescription: safeString(dataSet.string("x0008103e")),
        sopInstanceUID: safeString(dataSet.string("x00080018")),
        studyInstanceUID: safeString(dataSet.string("x0020000d")),
        seriesInstanceUID: safeString(dataSet.string("x0020000e")),
        frameOfReferenceUID: safeString(dataSet.string("x00200052")),
        instanceNumber: parseFirstNumber(dataSet.string("x00200013")),
        numberOfFrames: parseFirstNumber(dataSet.string("x00280008")),
        rows: parseFirstNumber(dataSet.string("x00280010")),
        columns: parseFirstNumber(dataSet.string("x00280011")),
        pixelSpacing: parseNumericArray(dataSet.string("x00280030")),
        sliceThickness: parseFirstNumber(dataSet.string("x00180050")),
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
      throw new Error("Multi-frame DICOM is not supported in this prototype.");
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

    return {
      rows,
      columns,
      depth: slices.length,
      rowSpacing,
      columnSpacing,
      sliceSpacing,
      slices,
      skippedCount,
    };
  }

  function isSameStudyAsLoadedStudy(record) {
    const existing = state.reconstructions[0]?.records?.[0];
    if (!existing || !record) {
      return true;
    }

    if (existing.studyInstanceUID && record.studyInstanceUID) {
      return existing.studyInstanceUID === record.studyInstanceUID;
    }

    if (existing.patientId && record.patientId) {
      return existing.patientId === record.patientId;
    }

    return true;
  }

  function isDuplicateSeries(record) {
    return state.reconstructions.some((reconstruction) => {
      const existing = reconstruction.records?.[0];
      if (!existing || !record) {
        return false;
      }
      if (existing.seriesInstanceUID && record.seriesInstanceUID) {
        return existing.seriesInstanceUID === record.seriesInstanceUID;
      }
      return (
        existing.seriesDescription === record.seriesDescription &&
        existing.instanceNumber === record.instanceNumber &&
        reconstruction.volume?.depth === record.numberOfFrames
      );
    });
  }

  async function importReconstructionsFromFiles(fileList, options) {
    const files = Array.from(fileList || []).filter((file) => file.size > 0);
    if (!files.length) {
      return;
    }

    const mode = options?.mode === "append" ? "append" : "replace";
    setStatus(`Reading ${files.length} files...`);
    const records = await parseDicomFiles(files);
    if (!records.length) {
      throw new Error("No readable DICOM files were found.");
    }

    const groups = groupSeries(records).filter((group) => group.pixelCount);
    if (!groups.length) {
      throw new Error("No readable image series were found in the selected files.");
    }

    const nextReconstructions = mode === "append" ? state.reconstructions.slice() : [];
    const existingLabels = new Set(nextReconstructions.map((reconstruction) => reconstruction.label));
    let skippedSeries = 0;
    let skippedDifferentStudy = 0;
    let skippedDuplicateSeries = 0;
    let skippedFiles = 0;
    const importedReconstructions = [];

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const imageRecords = groups[groupIndex].records.filter((record) => record.hasPixelData);
      if (!imageRecords.length) {
        skippedSeries += 1;
        continue;
      }

      const firstRecord = imageRecords[0];
      if (mode === "append" && !isSameStudyAsLoadedStudy(firstRecord)) {
        skippedDifferentStudy += 1;
        continue;
      }

      if (mode === "append" && isDuplicateSeries(firstRecord)) {
        skippedDuplicateSeries += 1;
        continue;
      }

      setStatus(`Loading reconstruction ${groupIndex + 1} / ${groups.length}...`);
      let volume;
      try {
        volume = await buildVolume(imageRecords);
      } catch (error) {
        skippedSeries += 1;
        continue;
      }

      skippedFiles += volume.skippedCount || 0;
      const label = buildUniqueLabel(
        firstRecord.seriesDescription || `Reconstruction ${nextReconstructions.length + importedReconstructions.length + 1}`,
        existingLabels
      );
      existingLabels.add(label);
      const reconstruction = createReconstructionEntry(label, imageRecords, volume);
      importedReconstructions.push(reconstruction);
      nextReconstructions.push(reconstruction);

      await waitForAnimationFrame();
    }

    if (!importedReconstructions.length) {
      if (mode === "append" && skippedDifferentStudy) {
        throw new Error("The added reconstruction files belong to a different study or patient. Clear the study first if you want to switch patients.");
      }
      if (mode === "append" && skippedDuplicateSeries) {
        throw new Error("Those reconstruction series are already loaded.");
      }
      throw new Error("No new readable reconstructions could be loaded from the selected files.");
    }

    state.reconstructions = nextReconstructions;
    state.dragging = null;
    state.hoverImagePoint = null;

    const activeReconstruction =
      mode === "replace"
        ? importedReconstructions[0]
        : getActiveReconstruction() || state.reconstructions[0] || importedReconstructions[0];

    if (mode === "replace") {
      state.currentSliceIndex = Math.floor((activeReconstruction?.volume?.depth || 1) / 2);
      state.topSliceIndex = 0;
      state.bottomSliceIndex = Math.max(0, (activeReconstruction?.volume?.depth || 1) - 1);
      state.rangeConfigured = false;
      state.contourRevisionSequence = 0;
      state.compareMode = false;
      state.compareReconstructionId = null;
      state.view.zoom = 1;
      state.view.panX = 0;
      state.view.panY = 0;
      resetHistory();
    }

    activateReconstruction(activeReconstruction.id, {
      refresh: false,
    });

    ensureValidCompareSelection();
    refreshUi();
    requestRender();

    const loadedCount = importedReconstructions.length;
    const loadedMessage =
      mode === "append"
        ? `Added ${loadedCount} reconstruction${loadedCount === 1 ? "" : "s"}.`
        : `Loaded ${loadedCount} reconstruction${loadedCount === 1 ? "" : "s"} for this study.`;
    const extraNotes = [];
    if (skippedDuplicateSeries) {
      extraNotes.push(`${skippedDuplicateSeries} duplicate series skipped`);
    }
    if (skippedDifferentStudy) {
      extraNotes.push(`${skippedDifferentStudy} different-study series skipped`);
    }
    if (skippedSeries) {
      extraNotes.push(`${skippedSeries} unreadable series skipped`);
    }
    if (skippedFiles) {
      extraNotes.push(`${skippedFiles} file${skippedFiles === 1 ? "" : "s"} skipped during decoding`);
    }

    const message = extraNotes.length ? `${loadedMessage} ${extraNotes.join("; ")}.` : loadedMessage;
    setStatus(message, extraNotes.length ? "warning" : null);
    if (mode === "replace" && state.project.currentProjectId) {
      if (!state.project.caseLabel) {
        state.project.caseLabel = buildDefaultProjectCaseLabel();
      }
      if (!state.project.caseId) {
        requestNextProjectCaseId({ silent: true }).catch(() => {});
      } else {
        updateProjectUi();
      }
    }
    if (mode === "replace") {
      pushHistorySnapshot("Loaded study");
    }
  }

  function clearStudy() {
    persistActiveReconstructionRange();
    state.reconstructions = [];
    state.activeReconstructionId = null;
    state.volume = null;
    state.records = [];
    state.seriesLabel = null;
    state.currentSliceIndex = 0;
    state.topSliceIndex = 0;
    state.bottomSliceIndex = 0;
    state.rangeConfigured = false;
    state.contours.clear();
    state.exclusionMasks.clear();
    state.metricsCache.clear();
    state.compareMode = false;
    state.compareReconstructionId = null;
    state.dragging = null;
    state.hoverImagePoint = null;
    state.view.zoom = 1;
    state.view.panX = 0;
    state.view.panY = 0;
    state.backend.aiSegmenting = false;
    state.backend.lastResult = null;
    state.project.caseId = "";
    state.project.caseLabel = "";
    state.export.promptOpen = false;
    state.export.action = null;
    state.export.studyId = "";
    state.export.busy = false;
    resetHistory();
    setStatus("Ready for axial CT reconstructions");
    refreshUi();
    requestRender();
  }

  function getSliceCount() {
    return state.volume?.depth || 0;
  }

  function getSliceBoundsForRangeState(rangeState, volume) {
    const sliceCount = volume?.depth || 0;
    if (!sliceCount) {
      return null;
    }
    const normalized = normalizeRangeState(rangeState, volume);
    const start = clamp(Math.min(normalized.topSliceIndex, normalized.bottomSliceIndex), 0, sliceCount - 1);
    const end = clamp(Math.max(normalized.topSliceIndex, normalized.bottomSliceIndex), 0, sliceCount - 1);
    return { start, end, count: end - start + 1 };
  }

  function getSliceBounds() {
    return getSliceBoundsForRangeState(getRangeStateFromState(), state.volume);
  }

  function isSliceInRange(sliceIndex) {
    const bounds = getSliceBounds();
    return Boolean(bounds && sliceIndex >= bounds.start && sliceIndex <= bounds.end);
  }

  function setCurrentSliceIndex(index) {
    if (!state.volume) {
      return;
    }
    state.currentSliceIndex = clamp(Math.round(index), 0, state.volume.depth - 1);
    updateSliceNavigationUi();
    updateCurrentSliceUi();
    renderSliceList();
    requestRender();
  }

  function applyRangeInputs() {
    if (!state.volume) {
      return;
    }
    const maxSlice = state.volume.depth;
    const top = clamp((Number.parseInt(els.topSliceInput.value, 10) || 1) - 1, 0, maxSlice - 1);
    const bottom = clamp((Number.parseInt(els.bottomSliceInput.value, 10) || maxSlice) - 1, 0, maxSlice - 1);
    state.topSliceIndex = top;
    state.bottomSliceIndex = bottom;
    commitRangeSelection({ markConfigured: true });
  }

  function commitRangeSelection(options) {
    const bounds = getSliceBounds();
    if (bounds) {
      state.currentSliceIndex = clamp(state.currentSliceIndex, bounds.start, bounds.end);
    }
    if (options?.markConfigured) {
      state.rangeConfigured = true;
    }
    persistActiveReconstructionRange();

    updateGuideUi();
    updateRangeUi();
    updateSliceNavigationUi();
    updateCurrentSliceUi();
    updateSummaryUi();
    renderSliceList();
    requestRender();
    if (options?.markConfigured) {
      pushHistorySnapshot("Updated slice range");
    }
  }

  function useFullStackRange() {
    if (!state.volume) {
      return;
    }
    state.topSliceIndex = 0;
    state.bottomSliceIndex = state.volume.depth - 1;
    commitRangeSelection({ markConfigured: true });
  }

  function setActiveTool(tool) {
    state.activeTool =
      tool === "edit" || tool === "pan" || tool === "erase" || tool === "zoom" || tool === "windowLevel"
        ? tool
        : "contour";
    if (state.activeTool !== "erase") {
      state.hoverImagePoint = null;
    }
    updateToolButtons();
    requestRender();
  }

  function returnToPrimaryTool() {
    if (state.activeTool !== "contour") {
      setActiveTool("contour");
    }
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

  function scheduleFocusLayoutRender() {
    requestRender();
    window.requestAnimationFrame(() => {
      requestRender();
      window.setTimeout(requestRender, 180);
      window.setTimeout(requestRender, 380);
    });
  }

  function updatePresentationFocusUi() {
    document.body.classList.toggle("is-presentation-focus", state.presentationFocus);
    document.body.classList.toggle("is-focus-sidebar-open", state.presentationFocus && state.focusSidebarOpen);
    els.app?.classList.toggle("is-presentation-focus", state.presentationFocus);
    els.app?.classList.toggle("is-focus-sidebar-open", state.presentationFocus && state.focusSidebarOpen);
    if (els.presentationFocusToggleButton) {
      els.presentationFocusToggleButton.classList.toggle("is-active", state.presentationFocus);
      els.presentationFocusToggleButton.textContent = state.presentationFocus ? "×" : "⤢";
      els.presentationFocusToggleButton.title = state.presentationFocus
        ? "Exit immersive focus view"
        : "Immersive focus view";
      els.presentationFocusToggleButton.setAttribute(
        "aria-label",
        state.presentationFocus ? "Exit immersive focus view" : "Enter immersive EAT focus view"
      );
    }
    els.focusWorkflowButtons?.forEach((button) => {
      const groupId = button.dataset.focusSidebarGroup;
      button.classList.toggle(
        "is-active",
        state.presentationFocus && state.focusSidebarOpen && groupId === state.activeFocusGroupId
      );
    });
  }

  function setFocusSidebarOpen(open) {
    state.focusSidebarOpen = Boolean(open) && state.presentationFocus;
    updatePresentationFocusUi();
  }

  function setPresentationFocus(enabled) {
    const nextFocus = Boolean(enabled);
    if (state.presentationFocus === nextFocus && !nextFocus) {
      return;
    }
    state.presentationFocus = nextFocus;
    if (!state.presentationFocus) {
      state.focusSidebarOpen = false;
      const returnScroll = state.focusReturnScroll || { x: 0, y: 0 };
      window.requestAnimationFrame(() => {
        window.scrollTo(returnScroll.x || 0, returnScroll.y || 0);
      });
    } else {
      state.focusSidebarOpen = false;
      state.focusReturnScroll = { x: window.scrollX || 0, y: window.scrollY || 0 };
      window.scrollTo(0, 0);
      focusWithoutScrolling(els.canvasShell);
    }
    updatePresentationFocusUi();
    scheduleFocusLayoutRender();
  }

  function togglePresentationFocus() {
    setPresentationFocus(!state.presentationFocus);
  }

  function handleFocusSidebarGroup(groupId) {
    const group = document.getElementById(groupId);
    const normalizedGroupId = group?.classList?.contains("sidebar-group") ? groupId : "sidebar-group-workflow";
    const shouldClose =
      state.presentationFocus && state.focusSidebarOpen && state.activeFocusGroupId === normalizedGroupId;
    state.activeFocusGroupId = normalizedGroupId;
    const activeGroup = document.getElementById(normalizedGroupId);
    if (activeGroup) {
      activeGroup.open = true;
    }
    if (state.presentationFocus) {
      setFocusSidebarOpen(!shouldClose);
      window.requestAnimationFrame(() => {
        activeGroup?.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
      });
      scheduleFocusLayoutRender();
    }
  }

  function applyPreset(presetKey) {
    const preset = VOI_PRESETS[presetKey];
    if (!preset) {
      return;
    }
    state.currentPreset = presetKey;
    state.currentVOI = { ...preset };
    updateVoiUi();
    requestRender();
  }

  function applyVoiFromInputs() {
    state.currentPreset = null;
    state.currentVOI = {
      width: clamp(Number.parseFloat(els.windowWidthInput.value) || VOI_PRESETS.cardiac.width, 1, 4000),
      center: clamp(Number.parseFloat(els.windowCenterInput.value) || VOI_PRESETS.cardiac.center, -1200, 3000),
    };
    updateVoiUi();
    requestRender();
  }

  function invalidateAllMetrics() {
    state.metricsCache.clear();
  }

  function setHuThresholds(minValue, maxValue, options) {
    const parsedMin = clamp(Math.round(Number(minValue)), -1024, 3071);
    const parsedMax = clamp(Math.round(Number(maxValue)), -1024, 3071);
    if (!Number.isFinite(parsedMin) || !Number.isFinite(parsedMax)) {
      throw new Error("Threshold values must be valid HU numbers.");
    }

    const nextMin = Math.min(parsedMin, parsedMax);
    const nextMax = Math.max(parsedMin, parsedMax);
    const changed = nextMin !== state.huThreshold.min || nextMax !== state.huThreshold.max;

    state.huThreshold = {
      min: nextMin,
      max: nextMax,
    };

    updateThresholdUi();
    if (!changed) {
      return;
    }

    invalidateAllMetrics();
    updateCurrentSliceUi();
    updateSummaryUi();
    renderSliceList();
    requestRender();
    pushHistorySnapshot("Updated threshold");

    if (options?.announce) {
      setStatus(`Threshold updated to ${getThresholdLabel()}.`);
    }
  }

  function updateToolButtons() {
    els.toolButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tool === state.activeTool);
    });
    els.toolSummary.textContent =
      state.activeTool === "edit"
        ? "Adjust"
        : state.activeTool === "windowLevel"
          ? "WW/WL"
        : state.activeTool === "pan"
          ? "Pan"
          : state.activeTool === "zoom"
            ? "Zoom"
          : state.activeTool === "erase"
            ? "Rubber"
            : "Contour";
    updateCanvasCursor();
  }

  function updatePresetButtons() {
    els.presetButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.preset === state.currentPreset);
    });
  }

  function updateVoiUi() {
    els.windowWidthInput.value = String(Math.round(state.currentVOI.width));
    els.windowCenterInput.value = String(Math.round(state.currentVOI.center));
    updatePresetButtons();
  }

  function updateThresholdUi() {
    els.thresholdMinInput.value = String(state.huThreshold.min);
    els.thresholdMaxInput.value = String(state.huThreshold.max);
    els.thresholdReadout.textContent = getThresholdLabel();
    els.thresholdToggleButton.classList.toggle("is-active", state.showThresholdOverlay);
    els.thresholdToggleButton.textContent = `Threshold Overlay (O): ${state.showThresholdOverlay ? "On" : "Off"}`;
  }

  function getActiveErasePreset() {
    return (
      Object.entries(ERASE_BRUSH_PRESETS).find(([, radius]) => radius === Math.round(state.eraseBrushRadius))?.[0] || null
    );
  }

  function updateEraseUi() {
    els.eraseRadiusInput.value = String(Math.round(state.eraseBrushRadius));
    const activePreset = getActiveErasePreset();
    els.erasePresetButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.erasePreset === activePreset);
    });
  }

  function setEraseRadius(value) {
    const parsed = clamp(Math.round(Number(value)), 2, 80);
    if (!Number.isFinite(parsed)) {
      throw new Error("Rubber radius must be a valid number.");
    }
    state.eraseBrushRadius = parsed;
    updateEraseUi();
    requestRender();
  }

  function updateZoomUi() {
    els.zoomReadout.textContent = `Zoom ${Math.round(state.view.zoom * 100)}%`;
  }

  function getCompareCandidates() {
    return state.reconstructions.filter((reconstruction) => reconstruction.id !== state.activeReconstructionId);
  }

  function getCompareReconstruction() {
    if (!state.compareMode) {
      return null;
    }
    return getReconstructionById(state.compareReconstructionId);
  }

  function ensureValidCompareSelection() {
    const candidates = getCompareCandidates();
    if (!candidates.length) {
      state.compareMode = false;
      state.compareReconstructionId = null;
      return null;
    }

    if (!state.compareMode) {
      return getReconstructionById(state.compareReconstructionId) || null;
    }

    const selected = getReconstructionById(state.compareReconstructionId);
    if (selected && selected.id !== state.activeReconstructionId) {
      return selected;
    }

    state.compareReconstructionId = candidates[0].id;
    return candidates[0];
  }

  function getGuideState() {
    const bounds = getSliceBounds();
    const summary = buildStudySummary();
    let anchorCount = 0;
    let autoCount = 0;
    if (bounds) {
      for (let sliceIndex = bounds.start; sliceIndex <= bounds.end; sliceIndex += 1) {
        const contour = getStoredContour(sliceIndex);
        if (isSegmentationAnchorSlice(sliceIndex, contour)) {
          anchorCount += 1;
        } else if (isAutoContour(contour)) {
          autoCount += 1;
        }
      }
    }

    const recommendedAnchors = bounds ? Math.min(3, bounds.count) : 0;
    const reconReadyCount = getExportableReconstructions().length;
    const needsTransfer = state.reconstructions.length > 1 && reconReadyCount < state.reconstructions.length;
    let currentStepIndex = 0;
    let title = "Load reconstructions";
    let copy =
      "Start by loading one axial cardiac CT reconstruction. You can add additional matching or best-effort reconstructions afterward for comparison.";

    if (!state.volume) {
      currentStepIndex = 0;
    } else if (!state.rangeConfigured) {
      currentStepIndex = 1;
      title = "Confirm the slice range";
      copy = "Set the top and bottom of the shared EAT slab, or use the full stack if that is your intended range.";
    } else if (!summary.reviewed) {
      currentStepIndex = 2;
      title = "Choose a starting mode";
      copy = `Draw ${recommendedAnchors || 1} anchor contour${recommendedAnchors === 1 ? "" : "s"} for Let's Go Segment, run Automatic EAT for an image-only first pass, or use Model Assist when the local model backend is available.`;
    } else if (summary.reviewed < summary.rangeCount) {
      currentStepIndex = 3;
      title = "Run or review segmentation";
      copy = `${summary.missing} slice${summary.missing === 1 ? "" : "s"} still need contours. Use Let's Go Segment for anchor-driven propagation, Automatic EAT for the browser heuristic pass, or Model Assist for the local model-assisted pass, then review the result.`;
    } else if (needsTransfer) {
      currentStepIndex = 4;
      title = "Copy to the other reconstructions";
      copy = `Copy the contour set to the other reconstructions so export includes all ${state.reconstructions.length} series, even when the stacks only allow best-effort matching.`;
    } else {
      currentStepIndex = 5;
      title = "Export the results";
      copy =
        state.reconstructions.length > 1
          ? "The workflow is ready for simultaneous multi-reconstruction export."
          : "The workflow is ready for final PNG and CSV export.";
    }

    const steps = GUIDE_STEPS.map((label, index) => ({
      label,
      index,
      isCurrent: index === currentStepIndex,
      isDone: index < currentStepIndex,
      detail:
        index === 0
          ? `${state.reconstructions.length} loaded`
          : index === 1
            ? state.rangeConfigured
              ? `${bounds?.count || 0} slices selected`
              : "Waiting for confirmation"
            : index === 2
              ? summary.reviewed
                ? `${anchorCount} anchors • ${summary.reviewed} started`
                : "Anchors or Automatic EAT"
              : index === 3
                ? `${summary.reviewed} / ${summary.rangeCount} reviewed`
                : index === 4
                  ? `${reconReadyCount} / ${state.reconstructions.length} ready`
                  : `${state.reconstructions.length ? "Ready" : "Waiting"}`,
    }));

    return {
      currentStepIndex,
      title,
      copy,
      steps,
      progressPercent: ((currentStepIndex + (state.volume ? 0.35 : 0)) / GUIDE_STEPS.length) * 100,
      autoCount,
    };
  }

  function updateGuideUi() {
    const guide = getGuideState();
    els.guideStepReadout.textContent = `Step ${guide.currentStepIndex + 1} of ${GUIDE_STEPS.length}`;
    els.guideProgressFill.style.width = `${Math.max(0, Math.min(100, guide.progressPercent))}%`;
    els.guideActionTitle.textContent = guide.title;
    els.guideActionCopy.textContent = guide.copy;
    els.guideStepList.innerHTML = "";

    guide.steps.forEach((step) => {
      const target = GUIDE_STEP_TARGETS[step.index] || null;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "guide-step";
      if (step.isDone) {
        row.classList.add("is-done");
      }
      if (step.isCurrent) {
        row.classList.add("is-current");
        row.setAttribute("aria-current", "step");
      }
      if (target?.label) {
        row.title = `Jump to ${target.label}`;
        row.setAttribute("aria-label", `${step.label}. ${step.detail}. Jump to ${target.label}.`);
        row.addEventListener("click", () => {
          jumpToGuideStep(step.index);
        });
      }

      const index = document.createElement("span");
      index.className = "guide-step-index";
      index.textContent = String(step.index + 1);

      const copy = document.createElement("div");
      copy.className = "guide-step-copy";
      const title = document.createElement("strong");
      title.textContent = step.label;
      const detail = document.createElement("span");
      detail.textContent = step.detail;
      copy.appendChild(title);
      copy.appendChild(detail);

      row.appendChild(index);
      row.appendChild(copy);
      if (target) {
        const jump = document.createElement("span");
        jump.className = "guide-step-jump";
        jump.setAttribute("aria-hidden", "true");
        jump.textContent = "›";
        row.appendChild(jump);
      }
      els.guideStepList.appendChild(row);
    });
  }

  function jumpToGuideStep(stepIndex) {
    const target = GUIDE_STEP_TARGETS[stepIndex];
    if (!target) {
      return;
    }

    const group = document.getElementById(target.groupId);
    const section = document.getElementById(target.sectionId);
    if (!group || !section) {
      return;
    }

    group.open = true;
    window.requestAnimationFrame(() => {
      section.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
      if (els.sidebar && typeof section.offsetTop === "number") {
        const sectionTop = Math.max(0, section.offsetTop - 12);
        els.sidebar.scrollTo({
          top: sectionTop,
          behavior: "smooth",
        });
      }
      section.classList.add("is-guide-target");
      if (guideTargetHighlightTimer) {
        window.clearTimeout(guideTargetHighlightTimer);
      }
      guideTargetHighlightTimer = window.setTimeout(() => {
        section.classList.remove("is-guide-target");
      }, 1300);
    });
    setStatus(`Jumped to ${target.label}.`);
  }

  function getEatBackendPipelineLabel(source) {
    const pipeline = safeString(source?.pipeline) || safeString(source?.recommendedPipeline);
    if (pipeline === "totalsegmentator_heartchambers_highres") {
      return "High-res heart model";
    }
    if (pipeline === "totalsegmentator_total_roi") {
      return "Cardiac ROI model";
    }
    return "Unavailable";
  }

  function describeEatBackendReadiness(status) {
    if (!status) {
      return {
        note: "Checking whether the local model-assist backend is available.",
        mode: "Waiting",
      };
    }

    if (status.recommendedPipeline === "totalsegmentator_heartchambers_highres") {
      return {
        note: "Licensed high-resolution heart localization is ready for model assist.",
        mode: "High-res heart model",
      };
    }

    if (status.recommendedPipeline === "totalsegmentator_total_roi") {
      return {
        note: "Open TotalSegmentator cardiac ROI localization is ready for model assist.",
        mode: "Cardiac ROI model",
      };
    }

    return {
      note: status.message || "No supported AI backend was detected.",
      mode: "Unavailable",
    };
  }

  function getTrainingEligibleContourSummary(reconstruction, bounds) {
    const summary = {
      annotatedSliceCount: 0,
      confirmedSliceCount: 0,
      contours: [],
    };

    if (!reconstruction || !bounds) {
      return summary;
    }

    for (let sliceIndex = bounds.start; sliceIndex <= bounds.end; sliceIndex += 1) {
      const contour = reconstruction.contours.get(sliceIndex) || null;
      if (!contour) {
        continue;
      }

      const exclusionMask = reconstruction.exclusionMasks.get(sliceIndex) || null;
      const confirmedForTraining = isAnchorContour(contour) || Boolean(exclusionMask);
      summary.annotatedSliceCount += 1;
      if (confirmedForTraining) {
        summary.confirmedSliceCount += 1;
      }

      summary.contours.push({
        sliceIndex,
        status: contour.status,
        sourceSliceIndex: contour.sourceSliceIndex,
        sourceLabel: contour.sourceLabel,
        confirmedForTraining,
        hasExclusions: Boolean(exclusionMask),
        points: contour.points.map((point) => ({
          x: Number(point.x),
          y: Number(point.y),
        })),
        exclusionRuns: exclusionMask ? encodeMaskRuns(exclusionMask) : [],
      });
    }

    return summary;
  }

  function getReconstructionBackendCacheEntry(reconstruction) {
    if (!reconstruction) {
      return null;
    }

    const cacheKey = buildBackendStudyCacheKey(reconstruction);
    if (!cacheKey) {
      reconstruction.backendCache = null;
      return null;
    }

    const existing = reconstruction.backendCache;
    if (!existing || existing.cacheKey !== cacheKey) {
      reconstruction.backendCache = {
        cacheKey,
        available: false,
        checked: false,
        fileCount: 0,
        files: [],
        source: null,
        lastUsedAt: "",
      };
    }
    return reconstruction.backendCache;
  }

  function applyReconstructionBackendCacheEntry(reconstruction, cachePayload) {
    const existing = getReconstructionBackendCacheEntry(reconstruction);
    if (!existing) {
      return null;
    }

    reconstruction.backendCache = {
      ...existing,
      ...(cachePayload || {}),
      cacheKey: safeString(cachePayload?.cacheKey) || existing.cacheKey,
      available: Boolean(cachePayload?.available),
      checked: true,
      files: Array.isArray(cachePayload?.files) ? cachePayload.files.slice() : existing.files,
    };
    return reconstruction.backendCache;
  }

  async function ensureEatBackendCacheEntry(reconstruction, options) {
    const cacheEntry = getReconstructionBackendCacheEntry(reconstruction);
    if (!cacheEntry) {
      return null;
    }

    if (cacheEntry.checked && !options?.force) {
      return cacheEntry;
    }

    try {
      const payload = await postJson("/api/eat/backend/cache/lookup", {
        cacheKey: cacheEntry.cacheKey,
      });
      if (payload.tools) {
        state.backend.status = payload.tools;
      }
      updateAiBackendUi();
      return applyReconstructionBackendCacheEntry(reconstruction, payload.cache);
    } catch (error) {
      reconstruction.backendCache = {
        ...cacheEntry,
        available: false,
        checked: true,
        lookupError: error.message || "Cache lookup failed.",
      };
      return reconstruction.backendCache;
    }
  }

  function buildEatBackendRequestOptions(reconstruction, bounds, provider) {
    const firstRecord = reconstruction?.records?.[0] || {};
    return {
      provider: provider || "auto",
      topSliceIndex: bounds.start,
      bottomSliceIndex: bounds.end,
      thresholdMinHu: state.huThreshold.min,
      thresholdMaxHu: state.huThreshold.max,
      cacheKey: buildBackendStudyCacheKey(reconstruction),
      reconstructionLabel: reconstruction?.label,
      patientId: firstRecord.patientId || "",
      studyInstanceUID: firstRecord.studyInstanceUID || "",
      seriesInstanceUID: firstRecord.seriesInstanceUID || "",
      frameOfReferenceUID: firstRecord.frameOfReferenceUID || "",
      sliceCount: reconstruction?.records?.length || 0,
    };
  }

  function appendReconstructionFilesToFormData(formData, reconstruction) {
    reconstruction.records.forEach((record, index) => {
      const file = record?.file;
      if (!file) {
        return;
      }
      const relativePath = safeString(file.webkitRelativePath) || file.name || `slice_${index + 1}.dcm`;
      formData.append("dicom_file", file, relativePath);
    });
  }

  function describeTrainingCorpus(trainingCorpus) {
    if (!trainingCorpus) {
      return "No local reference-standard cases have been stored yet.";
    }

    const storedCaseCount = Math.max(0, Number(trainingCorpus.caseCount) || 0);
    const learnedSliceCount = Math.max(0, Number(trainingCorpus.confirmedSliceCount) || 0);
    const globalMarginMm = Number(trainingCorpus.profile?.globalMarginMmMean);
    const blendWeight = Number(trainingCorpus.profile?.blendWeight);

    if (!storedCaseCount && !learnedSliceCount) {
      return "No local reference-standard cases have been stored yet.";
    }

    const parts = [`${storedCaseCount} case${storedCaseCount === 1 ? "" : "s"}`];
    if (learnedSliceCount) {
      parts.push(`${learnedSliceCount} learned slice${learnedSliceCount === 1 ? "" : "s"}`);
    }
    if (Number.isFinite(globalMarginMm)) {
      parts.push(`${formatNumber(globalMarginMm, 1)} mm learned envelope`);
    }
    if (Number.isFinite(blendWeight) && blendWeight > 0) {
      parts.push(`${Math.round(blendWeight * 100)}% profile blend`);
    }
    return parts.join(" • ");
  }

  function updateAiBackendUi() {
    const status = state.backend.status;
    const readiness = describeEatBackendReadiness(status);
    const providerLabel = getEatBackendPipelineLabel(status || state.backend.lastResult);
    const activeReconstruction = getActiveReconstruction();
    const bounds = getSliceBounds();
    const trainingSummary = getTrainingEligibleContourSummary(activeReconstruction, bounds);
    const trainingReady = Boolean(trainingSummary.confirmedSliceCount);
    const canStoreFeedback = status ? status.canStoreFeedback !== false : true;
    const cacheEntry = getReconstructionBackendCacheEntry(activeReconstruction);

    if (state.backend.checking) {
      els.aiBackendStatus.textContent = "Checking local AI backend...";
    } else if (state.backend.trainingSubmitting) {
      els.aiBackendStatus.textContent = "Storing reference-standard case for local contour learning...";
    } else if (state.backend.aiSegmenting) {
      els.aiBackendStatus.textContent = "Local model assist running...";
    } else {
      els.aiBackendStatus.textContent = readiness.note;
    }

    if (state.backend.lastResult?.summary?.processingSeconds != null) {
      els.aiBackendMode.textContent = `${providerLabel} • Last run ${formatNumber(
        state.backend.lastResult.summary.processingSeconds,
        1
      )} s`;
    } else if (readiness.mode === "Unavailable" && canStoreFeedback) {
      els.aiBackendMode.textContent =
        "Model assist is offline, but reference-standard cases can still be stored locally for later learning.";
    } else {
      els.aiBackendMode.textContent =
        readiness.mode === "Unavailable"
          ? "Model assist will stay disabled until the local model backend is reachable."
          : `${readiness.mode} • Imports editable contours back into the EAT workflow.`;
    }

    if (state.backend.trainingSubmitting) {
      els.aiBackendTraining.textContent = `Uploading ${trainingSummary.confirmedSliceCount} confirmed slice${
        trainingSummary.confirmedSliceCount === 1 ? "" : "s"
      } for local contour-profile learning...`;
    } else if (activeReconstruction && trainingReady && !status?.ready && canStoreFeedback) {
      const cacheCopy = cacheEntry?.available ? " The active study is already cached locally." : "";
      els.aiBackendTraining.textContent = `${describeTrainingCorpus(
        status?.trainingCorpus
      )} Model assist is unavailable right now, but this corrected slab can still be stored as a reference-standard case.${cacheCopy}`;
    } else if (activeReconstruction && state.volume && !trainingReady) {
      els.aiBackendTraining.textContent = `${describeTrainingCorpus(
        status?.trainingCorpus
      )} Add at least 1 manual or rubber-corrected slice in the active slab to store a reference case.`;
    } else if (cacheEntry?.available) {
      els.aiBackendTraining.textContent = `${describeTrainingCorpus(
        status?.trainingCorpus
      )} Active study cached locally for faster repeat model-assist runs and reference submissions.`;
    } else {
      els.aiBackendTraining.textContent = describeTrainingCorpus(status?.trainingCorpus);
    }

    els.aiSegmentButton.disabled =
      !activeReconstruction ||
      !state.volume ||
      state.backend.trainingSubmitting ||
      state.backend.aiSegmenting ||
      state.backend.checking ||
      !status?.ready;
    els.aiSegmentButton.textContent = state.backend.aiSegmenting ? "Model Assist: Running..." : "Model Assist (I)";
    els.sendTrainingButton.disabled =
      !activeReconstruction ||
      !state.volume ||
      !trainingReady ||
      state.backend.trainingSubmitting ||
      state.backend.aiSegmenting ||
      state.backend.checking ||
      !canStoreFeedback;
    els.sendTrainingButton.textContent = state.backend.trainingSubmitting
      ? "Store Reference: Uploading..."
      : "Store Reference (K)";
    if (els.aiBackendRefreshButton) {
      els.aiBackendRefreshButton.disabled =
        state.backend.checking || state.backend.aiSegmenting || state.backend.trainingSubmitting;
      els.aiBackendRefreshButton.textContent = state.backend.checking ? "Refreshing Model Status..." : "Refresh Model Status";
    }
  }

  async function refreshEatBackendStatus(options) {
    if (state.backend.checking) {
      return state.backend.status;
    }

    state.backend.checking = true;
    updateAiBackendUi();
    try {
      const response = await fetch("/api/eat/backend/status", {
        headers: { Accept: "application/json" },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || "Failed to read AI backend status.");
      }
      state.backend.status = payload;
      updateAiBackendUi();
      if (!options?.silent) {
        setStatus(payload.message || "AI backend status refreshed.");
      }
      return payload;
    } catch (error) {
      state.backend.status = {
        ready: false,
        canStoreFeedback: false,
        availableTools: [],
        recommendedPipeline: "none",
        message: error.message || "AI backend status unavailable.",
        trainingCorpus: null,
        cache: null,
      };
      updateAiBackendUi();
      if (!options?.silent) {
        setStatus(state.backend.status.message, "warning");
      }
      return state.backend.status;
    } finally {
      state.backend.checking = false;
      updateAiBackendUi();
    }
  }

  function buildTrainingSubmissionPayload(reconstruction, bounds) {
    const firstRecord = reconstruction?.records?.[0] || {};
    const contourSummary = getTrainingEligibleContourSummary(reconstruction, bounds);

    if (!contourSummary.annotatedSliceCount) {
      throw new Error("Draw at least one contour inside the selected slab before storing a reference-standard case.");
    }

    if (!contourSummary.confirmedSliceCount) {
      throw new Error(
        "Store Reference only uses manual or rubber-corrected slices. Adjust at least one slice in the selected slab first."
      );
    }

    return {
      version: 1,
      submittedAt: new Date().toISOString(),
      patientName: firstRecord.patientName || "",
      patientId: firstRecord.patientId || "",
      studyInstanceUID: firstRecord.studyInstanceUID || "",
      seriesInstanceUID: firstRecord.seriesInstanceUID || "",
      frameOfReferenceUID: firstRecord.frameOfReferenceUID || "",
      seriesDescription: firstRecord.seriesDescription || "",
      reconstructionLabel: reconstruction?.label || firstRecord.seriesDescription || "Series 1",
      acquired: combineDateTime(firstRecord),
      range: {
        topSliceIndex: bounds.start,
        bottomSliceIndex: bounds.end,
        count: bounds.count,
      },
      thresholds: {
        min: state.huThreshold.min,
        max: state.huThreshold.max,
      },
      summary: {
        annotatedSliceCount: contourSummary.annotatedSliceCount,
        confirmedSliceCount: contourSummary.confirmedSliceCount,
      },
      contours: contourSummary.contours,
    };
  }

  function getCurrentProject() {
    return state.project.currentProject || null;
  }

  function mergeProjectRecord(project) {
    if (!project?.id) {
      return;
    }

    const existingIndex = state.project.projects.findIndex((item) => item.id === project.id);
    if (existingIndex >= 0) {
      state.project.projects.splice(existingIndex, 1, project);
    } else {
      state.project.projects.push(project);
      state.project.projects.sort((left, right) => naturalCompare(left.name || left.id, right.name || right.id));
    }
    state.project.currentProjectId = project.id;
    state.project.currentProject = project;
  }

  function buildDefaultProjectCaseLabel() {
    const firstRecord = getFirstLoadedRecord();
    const parts = [];
    if (firstRecord.patientId || firstRecord.patientName) {
      parts.push(firstRecord.patientId || firstRecord.patientName);
    }
    const acquired = combineDateTime(firstRecord);
    if (acquired) {
      parts.push(acquired);
    }
    return parts.join(" - ");
  }

  function buildProjectCasePayload() {
    const firstRecord = getFirstLoadedRecord();
    const rawAge = firstRecord.patientAge || "";
    const ageYears = parseDicomAgeToYears(rawAge);
    const caseId = safeString(state.project.caseId) || "";
    return {
      caseId,
      caseLabel: safeString(state.project.caseLabel) || buildDefaultProjectCaseLabel(),
      patientName: firstRecord.patientName || "",
      patientId: firstRecord.patientId || "",
      patientBirthDate: firstRecord.patientBirthDate || "",
      patientSex: firstRecord.patientSex || "",
      patientAgeDicom: rawAge,
      patientAgeYears: ageYears != null ? formatNumber(ageYears, 2) : "",
      accessionNumber: firstRecord.accessionNumber || "",
      studyInstanceUID: firstRecord.studyInstanceUID || "",
      studyDateTime: combineDateTime(firstRecord),
    };
  }

  function renderProjectCaseList() {
    if (!els.projectCaseList) {
      return;
    }
    els.projectCaseList.innerHTML = "";

    if (state.project.loading) {
      const note = document.createElement("div");
      note.className = "hint";
      note.textContent = "Loading project cases...";
      els.projectCaseList.appendChild(note);
      return;
    }

    const currentProject = getCurrentProject();
    if (!currentProject) {
      const note = document.createElement("div");
      note.className = "hint";
      note.textContent = "Create or select a project to build your lab study list.";
      els.projectCaseList.appendChild(note);
      return;
    }

    if (!state.project.cases.length) {
      const note = document.createElement("div");
      note.className = "hint";
      note.textContent = "No project cases yet. The next CSV export will start the list.";
      els.projectCaseList.appendChild(note);
      return;
    }

    state.project.cases.forEach((caseRow) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slice-row";
      if (safeString(caseRow.case_id) === safeString(state.project.caseId)) {
        button.classList.add("is-active");
      }

      const countBadge = document.createElement("span");
      countBadge.className = "badge";
      countBadge.textContent = `${Number(caseRow.export_count) || 0} export${Number(caseRow.export_count) === 1 ? "" : "s"}`;

      const copy = document.createElement("div");
      copy.className = "row-copy";
      const title = document.createElement("strong");
      title.textContent = safeString(caseRow.case_id) || "Case";
      const meta = document.createElement("span");
      meta.className = "slice-meta";
      const label = safeString(caseRow.case_label) || safeString(caseRow.patient_name) || safeString(caseRow.patient_id) || "Unnamed case";
      const sessionLabel = caseRow.has_session ? "Saved session" : "No saved session";
      const exportLabel = caseRow.last_export_at ? `Last export ${caseRow.last_export_at}` : "No exports yet";
      meta.textContent = `${label} • ${sessionLabel} • ${exportLabel}`;
      copy.appendChild(title);
      copy.appendChild(meta);

      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = caseRow.has_session ? "Loadable" : "Select";

      button.appendChild(countBadge);
      button.appendChild(copy);
      button.appendChild(badge);
      button.addEventListener("click", () => {
        state.project.caseId = safeString(caseRow.case_id);
        state.project.caseLabel = safeString(caseRow.case_label) || buildDefaultProjectCaseLabel();
        updateProjectUi();
        if (caseRow.has_session && state.reconstructions.length) {
          loadProjectCaseSession(caseRow.case_id).catch((error) => {
            console.error(error);
            setStatus(error.message || "Project session load failed.", "error");
          });
          return;
        }
        setStatus(
          caseRow.has_session
            ? `Selected ${caseRow.case_id}. Load the study first if you want to restore its saved session.`
            : `Selected ${caseRow.case_id} for the active project export.`
        );
      });
      els.projectCaseList.appendChild(button);
    });
  }

  function updateProjectUi() {
    const exportBusy = state.project.appendingExport || state.project.savingSession || state.export.busy;
    const disableExports = exportBusy || !state.reconstructions.length;
    els.finishCloseButton.disabled = disableExports;
    els.finishCloseButton.textContent = state.export.busy && state.export.action === "finish-close" ? "Finishing..." : "Finish & Close";
    els.exportCsvButton.disabled = disableExports;
    els.exportImageButton.disabled = disableExports;

    const exportStudy = getSelectedExportStudyMetadata();
    if (els.projectSummary) {
      els.projectSummary.textContent = exportStudy.displayLabel || "General outbox";
    }
    if (els.projectStatusNote) {
      els.projectStatusNote.textContent = exportStudy.id
        ? `Finish & Close will also mirror PNG and CSV exports into ${getExportStudyDirectoryLabel(exportStudy.id)}.`
        : "Choose or create the research study in the Finish & Close popup to mirror exports into a dedicated outbox folder.";
    }
  }

  async function refreshProjectCases(options) {
    const projectId = safeString(state.project.currentProjectId);
    if (!projectId) {
      state.project.currentProject = null;
      state.project.cases = [];
      updateProjectUi();
      return null;
    }

    const payload = await postJson("/api/projects/cases", { projectId });
    mergeProjectRecord(payload.project);
    state.project.cases = Array.isArray(payload.cases) ? payload.cases : [];
    if (!state.project.caseId) {
      state.project.caseId = safeString(payload.project?.nextCaseId);
    }
    if (!state.project.caseLabel && state.reconstructions.length) {
      state.project.caseLabel = buildDefaultProjectCaseLabel();
    }
    updateProjectUi();
    if (!options?.silent) {
      setStatus(`Loaded ${state.project.cases.length} project case${state.project.cases.length === 1 ? "" : "s"}.`);
    }
    return payload;
  }

  async function refreshProjectCatalog(options) {
    if (state.project.loading) {
      return null;
    }

    state.project.loading = true;
    updateProjectUi();
    try {
      const response = await fetch("/api/projects", {
        headers: { Accept: "application/json" },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || "Failed to load project list.");
      }

      state.project.projects = Array.isArray(payload.projects) ? payload.projects : [];
      state.project.currentProjectId = safeString(payload.currentProjectId);
      state.project.currentProject =
        state.project.projects.find((project) => project.id === state.project.currentProjectId) || null;
      if (state.project.currentProjectId) {
        await refreshProjectCases({ silent: true });
      } else {
        state.project.cases = [];
      }

      if (!options?.silent) {
        setStatus(
          state.project.currentProject
            ? `Project list refreshed. Active project: ${state.project.currentProject.name}.`
            : "Project list refreshed."
        );
      }
      return payload;
    } catch (error) {
      if (!options?.silent) {
        setStatus(error.message || "Project list refresh failed.", "error");
      }
      throw error;
    } finally {
      state.project.loading = false;
      updateProjectUi();
    }
  }

  async function requestNextProjectCaseId(options) {
    const currentProject = getCurrentProject();
    if (!currentProject?.id) {
      throw new Error("Select a project first.");
    }

    const payload = await postJson("/api/projects/next-case-id", { projectId: currentProject.id });
    mergeProjectRecord(payload.project);
    state.project.caseId = safeString(payload.caseId);
    if (!state.project.caseLabel && state.reconstructions.length) {
      state.project.caseLabel = buildDefaultProjectCaseLabel();
    }
    updateProjectUi();
    if (!options?.silent) {
      setStatus(`Case ID set to ${state.project.caseId}.`);
    }
    return payload;
  }

  async function selectProject(projectId) {
    state.project.loading = true;
    updateProjectUi();
    try {
      const payload = await postJson("/api/projects/select", { projectId: projectId || "" });
      state.project.projects = Array.isArray(payload.projects) ? payload.projects : [];
      state.project.currentProjectId = safeString(payload.currentProjectId);
      state.project.currentProject = payload.project || null;
      state.project.cases = [];
      state.project.caseId = "";
      state.project.caseLabel = state.project.currentProject && state.reconstructions.length ? buildDefaultProjectCaseLabel() : "";
      if (state.project.currentProject) {
        await refreshProjectCases({ silent: true });
        if (!state.project.caseId) {
          state.project.caseId = safeString(state.project.currentProject.nextCaseId);
        }
        setStatus(`Project set to ${state.project.currentProject.name}.`);
      } else {
        setStatus("Project selection cleared.");
      }
      return payload;
    } finally {
      state.project.loading = false;
      updateProjectUi();
    }
  }

  async function createProjectFromInput() {
    const name = safeString(els.projectNameInput.value) || "";
    if (!name) {
      throw new Error("Enter a project name first.");
    }

    state.project.creating = true;
    updateProjectUi();
    try {
      const payload = await postJson("/api/projects/create", { name });
      state.project.projects = Array.isArray(payload.projects) ? payload.projects : [];
      state.project.currentProjectId = safeString(payload.currentProjectId);
      state.project.currentProject = payload.project || null;
      state.project.cases = [];
      state.project.caseId = safeString(payload.project?.nextCaseId);
      state.project.caseLabel = state.reconstructions.length ? buildDefaultProjectCaseLabel() : "";
      els.projectNameInput.value = "";
      updateProjectUi();
      setStatus(`Created project ${payload.project?.name || name}.`);
      return payload;
    } finally {
      state.project.creating = false;
      updateProjectUi();
    }
  }

  async function saveProjectSessionToServer(options) {
    const currentProject = getCurrentProject();
    if (!currentProject?.id) {
      throw new Error("Select a project first.");
    }
    if (!state.reconstructions.length) {
      throw new Error("Load a study before saving a project session.");
    }
    if (!state.project.caseId) {
      await requestNextProjectCaseId({ silent: true });
    }

    state.project.savingSession = true;
    updateProjectUi();
    try {
      const payload = await postJson("/api/projects/session/save", {
        projectId: currentProject.id,
        case: buildProjectCasePayload(),
        session: buildSessionExport(),
      });
      mergeProjectRecord(payload.project);
      state.project.caseId = safeString(payload.case?.case_id) || state.project.caseId;
      state.project.caseLabel = safeString(payload.case?.case_label) || state.project.caseLabel;
      await refreshProjectCases({ silent: true });
      if (!options?.silent) {
        setStatus(`Saved session to ${payload.project.name} / ${payload.case.case_id}.`);
      }
      return payload;
    } finally {
      state.project.savingSession = false;
      updateProjectUi();
    }
  }

  async function loadProjectCaseSession(caseId) {
    const currentProject = getCurrentProject();
    if (!currentProject?.id) {
      throw new Error("Select a project first.");
    }

    const payload = await postJson("/api/projects/session/load", {
      projectId: currentProject.id,
      caseId,
    });
    mergeProjectRecord(payload.project);
    state.project.caseId = safeString(payload.case?.case_id) || safeString(caseId);
    state.project.caseLabel = safeString(payload.case?.case_label) || state.project.caseLabel;
    await refreshProjectCases({ silent: true });

    if (payload.hasSession && payload.session) {
      loadSessionFromObject(payload.session);
      setStatus(`Loaded saved session for ${payload.case.case_id}.`);
      return payload;
    }

    updateProjectUi();
    setStatus(`Selected ${payload.case.case_id}. No saved session was found for that case.`, "warning");
    return payload;
  }

  function buildProjectMeasurementExport(reportSet) {
    const headers = [
      "study_id",
      "reference_reconstruction",
      "reconstruction",
      "transfer_source",
      "transfer_mode",
      "acquired",
      "total_slices",
      "top_slice",
      "bottom_slice",
      "reviewed_slices",
      "missing_slices",
      "threshold_min_hu",
      "threshold_max_hu",
      "total_eat_volume_ml",
      "total_rubber_excluded_volume_ml",
      "mean_eat_density_hu",
      "sd_eat_density_hu",
    ];

    const rows = reportSet.reports.map((report) => ({
      study_id: reportSet.studyId || "",
      reference_reconstruction: reportSet.referenceReport.reconstruction_label,
      reconstruction: report.reconstruction_label,
      transfer_source: report.transfer_source || "",
      transfer_mode: report.transfer_mode || "",
      acquired: report.summary.acquired || "",
      total_slices: report.summary.total_slices ?? "",
      top_slice: report.summary.top_slice ?? "",
      bottom_slice: report.summary.bottom_slice ?? "",
      reviewed_slices: report.summary.reviewed_slices ?? "",
      missing_slices: report.summary.missing_slices ?? "",
      threshold_min_hu: report.summary.threshold_min_hu ?? "",
      threshold_max_hu: report.summary.threshold_max_hu ?? "",
      total_eat_volume_ml: report.summary.total_eat_volume_ml ?? "",
      total_rubber_excluded_volume_ml: report.summary.total_rubber_excluded_volume_ml ?? "",
      mean_eat_density_hu: report.summary.mean_eat_density_hu ?? "",
      sd_eat_density_hu: report.summary.sd_eat_density_hu ?? "",
    }));

    return { headers, rows };
  }

  async function appendProjectMeasurementExport(reportSet) {
    const currentProject = getCurrentProject();
    if (!currentProject?.id) {
      return null;
    }
    if (!state.project.caseId) {
      await requestNextProjectCaseId({ silent: true });
    }

    state.project.appendingExport = true;
    updateProjectUi();
    try {
      const measurementExport = buildProjectMeasurementExport(reportSet);
      const payload = await postJson("/api/projects/append-export", {
        projectId: currentProject.id,
        exportType: "measurements",
        headers: measurementExport.headers,
        rows: measurementExport.rows,
        case: buildProjectCasePayload(),
      });
      mergeProjectRecord(payload.project);
      state.project.caseId = safeString(payload.case?.case_id) || state.project.caseId;
      state.project.caseLabel = safeString(payload.case?.case_label) || state.project.caseLabel;
      await refreshProjectCases({ silent: true });
      return payload;
    } finally {
      state.project.appendingExport = false;
      updateProjectUi();
    }
  }

  function updateCompareUi() {
    const candidates = getCompareCandidates();
    const compareReconstruction = ensureValidCompareSelection();
    els.compareSelect.innerHTML = "";
    if (!candidates.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Load another reconstruction";
      els.compareSelect.appendChild(option);
    }
    candidates.forEach((candidate) => {
      const option = document.createElement("option");
      option.value = candidate.id;
      option.textContent = candidate.label;
      els.compareSelect.appendChild(option);
    });

    els.compareSelect.disabled = !candidates.length || !state.compareMode;
    if (compareReconstruction) {
      els.compareSelect.value = compareReconstruction.id;
    }

    const compareEnabled = Boolean(state.compareMode && compareReconstruction);
    els.compareToggleButton.classList.toggle("is-active", compareEnabled);
    els.compareToggleButton.disabled = !candidates.length;
    els.compareToggleButton.textContent = `Compare (V): ${compareEnabled ? "On" : "Off"}`;
    els.compareStatusNote.textContent = compareEnabled ? compareReconstruction.label : candidates.length ? "Ready" : "Need another series";
    els.compareReadout.textContent = compareEnabled ? compareReconstruction.label : "Off";
    els.viewerGrid.classList.toggle("is-compare", compareEnabled);
    els.comparePanel.classList.toggle("is-hidden", !compareEnabled);
    els.comparePanelLabel.textContent = compareEnabled ? compareReconstruction.label : "-";
    els.compareEmptyState.classList.toggle("is-hidden", compareEnabled);
  }

  function getReconstructionBadge(reconstruction) {
    const activeReconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return {
        label: "Pending",
        className: "is-pending-recon",
      };
    }

    if (activeReconstruction?.id === reconstruction.id) {
      return {
        label: "Active",
        className: "is-active-recon",
      };
    }

    const compatibility = getReconstructionCompatibility(activeReconstruction, reconstruction);
    if (!compatibility.compatible) {
      return {
        label: "Unavailable",
        className: "is-incompatible",
      };
    }

    if (compatibility.transferMode === "approximate") {
      return {
        label: "Best effort",
        className: "is-best-effort",
      };
    }

    if (hasTransferredSegmentation(reconstruction)) {
      return {
        label: "Ready",
        className: "is-ready",
      };
    }

    return {
      label: "Pending",
      className: "is-pending-recon",
    };
  }

  function updateReconstructionUi() {
    const activeReconstruction = getActiveReconstruction();
    els.activeReconstructionReadout.textContent = activeReconstruction?.label || "-";
    els.primaryPanelLabel.textContent = activeReconstruction?.label || "-";
    els.reconstructionSummary.textContent = `${state.reconstructions.length} loaded`;
    els.transferReconstructionsButton.disabled =
      !activeReconstruction || state.reconstructions.length < 2 || !hasTransferredSegmentation(activeReconstruction);
  }

  function updateRangeUi() {
    const sliceCount = getSliceCount();
    const hasVolume = Boolean(state.volume);
    els.topSliceInput.disabled = !hasVolume;
    els.bottomSliceInput.disabled = !hasVolume;
    if (els.sliceSlider) {
      els.sliceSlider.disabled = !hasVolume;
    }
    if (els.sliceNumberInput) {
      els.sliceNumberInput.disabled = !hasVolume;
    }
    els.clearEraseButton.disabled = !hasVolume;

    if (!hasVolume) {
      els.topSliceInput.value = "1";
      els.bottomSliceInput.value = "1";
      els.rangeSummary.textContent = "No study loaded";
      els.sliceReviewCount.textContent = "0 slices";
      if (els.sliceSlider) {
        els.sliceSlider.min = "0";
        els.sliceSlider.max = "0";
        els.sliceSlider.value = "0";
      }
      if (els.sliceNumberInput) {
        els.sliceNumberInput.value = "1";
      }
      return;
    }

    const bounds = getSliceBounds();
    els.topSliceInput.max = String(sliceCount);
    els.bottomSliceInput.max = String(sliceCount);
    els.topSliceInput.value = String(state.topSliceIndex + 1);
    els.bottomSliceInput.value = String(state.bottomSliceIndex + 1);
    els.rangeSummary.textContent = `Slices ${bounds.start + 1}-${bounds.end + 1} (${bounds.count} total)`;
    els.sliceReviewCount.textContent = `${bounds.count} slice${bounds.count === 1 ? "" : "s"}`;
    if (els.sliceSlider) {
      els.sliceSlider.min = "0";
      els.sliceSlider.max = String(sliceCount - 1);
      els.sliceSlider.value = String(state.currentSliceIndex);
    }
    if (els.sliceNumberInput) {
      els.sliceNumberInput.max = String(sliceCount);
      els.sliceNumberInput.value = String(state.currentSliceIndex + 1);
    }
  }

  function updateSliceNavigationUi() {
    const sliceCount = getSliceCount();
    if (!sliceCount) {
      els.sliceSummary.textContent = "0 / 0";
      if (els.presentationFastScrollSlider) {
        els.presentationFastScrollSlider.disabled = true;
        els.presentationFastScrollSlider.max = "0";
        els.presentationFastScrollSlider.value = "0";
      }
      if (els.presentationFastScrollValue) {
        els.presentationFastScrollValue.textContent = "0 / 0";
      }
      return;
    }

    const label = `${state.currentSliceIndex + 1} / ${sliceCount}`;
    els.sliceSummary.textContent = label;
    if (els.sliceSlider) {
      els.sliceSlider.value = String(state.currentSliceIndex);
    }
    if (els.presentationFastScrollSlider) {
      els.presentationFastScrollSlider.disabled = false;
      els.presentationFastScrollSlider.max = String(sliceCount - 1);
      els.presentationFastScrollSlider.value = String(state.currentSliceIndex);
    }
    if (els.presentationFastScrollValue) {
      els.presentationFastScrollValue.textContent = label;
    }
    if (els.sliceNumberInput) {
      els.sliceNumberInput.value = String(state.currentSliceIndex + 1);
    }
  }

  function renderDefinitionRows(container, rows) {
    container.innerHTML = "";
    rows.forEach((row) => {
      const wrapper = document.createElement("div");
      wrapper.className = "meta-row";

      const term = document.createElement("dt");
      term.textContent = row.label;

      const detail = document.createElement("dd");
      detail.textContent = row.value;

      wrapper.appendChild(term);
      wrapper.appendChild(detail);
      container.appendChild(wrapper);
    });
  }

  function updateStudyMetadataUi() {
    const firstRecord = state.records[0];
    const volume = state.volume;
    if (!firstRecord || !volume) {
      els.metaPatient.textContent = "No study loaded";
      els.metaPatientId.textContent = "-";
      els.metaSeries.textContent = "-";
      els.metaSlices.textContent = "-";
      els.metaMatrix.textContent = "-";
      els.metaSpacing.textContent = "-";
      els.metaThickness.textContent = "-";
      els.metaTime.textContent = "-";
      return;
    }

    els.metaPatient.textContent = firstRecord.patientName || "Anonymous";
    els.metaPatientId.textContent = firstRecord.patientId || "-";
    els.metaSeries.textContent = state.seriesLabel || firstRecord.seriesDescription || "-";
    els.metaSlices.textContent = String(volume.depth);
    els.metaMatrix.textContent = `${volume.columns} x ${volume.rows} x ${volume.depth}`;
    els.metaSpacing.textContent = `${formatSpacing(firstRecord.pixelSpacing)} / ${formatDimension(volume.sliceSpacing)}`;
    els.metaThickness.textContent = formatDimension(firstRecord.sliceThickness);
    els.metaTime.textContent = combineDateTime(firstRecord);
  }

  function renderReconstructionList() {
    els.reconstructionList.innerHTML = "";
    if (!state.reconstructions.length) {
      return;
    }

    const activeReconstruction = getActiveReconstruction();
    state.reconstructions.forEach((reconstruction, reconstructionIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slice-row";
      if (activeReconstruction?.id === reconstruction.id) {
        button.classList.add("is-active");
      }
      button.addEventListener("click", () => {
        const compatibility = getReconstructionCompatibility(activeReconstruction, reconstruction);
        activateReconstruction(reconstruction.id, {
          statusMessage:
            activeReconstruction?.id !== reconstruction.id && compatibility.transferMode === "approximate"
              ? `Active reconstruction set to ${reconstruction.label}. Best-effort matching is being used across the two acquisitions.`
              : `Active reconstruction set to ${reconstruction.label}.`,
        });
      });

      const indexLabel = document.createElement("strong");
      indexLabel.textContent = `R${reconstructionIndex + 1}`;

      const meta = document.createElement("span");
      meta.className = "slice-meta";
      const compatibility = getReconstructionCompatibility(activeReconstruction, reconstruction);
      const labels = [`${reconstruction.volume.depth} slices`];
      if (activeReconstruction?.id !== reconstruction.id) {
        labels.push(compatibility.detail || compatibility.reason);
      }
      if (reconstruction.transferSourceLabel && reconstruction.transferSourceId !== reconstruction.id) {
        labels.push(`From ${reconstruction.transferSourceLabel}`);
      } else if (hasTransferredSegmentation(reconstruction)) {
        labels.push("Local contours");
      } else {
        labels.push("No transferred segmentation");
      }
      if (reconstruction.transferWarning) {
        labels.push("Review transfer");
      }
      meta.textContent = labels.join(" • ");

      const copy = document.createElement("div");
      copy.className = "row-copy";

      const title = document.createElement("strong");
      title.textContent = reconstruction.label;
      copy.appendChild(title);
      copy.appendChild(meta);

      const badgeInfo = getReconstructionBadge(reconstruction);
      const badge = document.createElement("span");
      badge.className = `badge ${badgeInfo.className}`.trim();
      badge.textContent = badgeInfo.label;

      button.appendChild(indexLabel);
      button.appendChild(copy);
      button.appendChild(badge);
      els.reconstructionList.appendChild(button);
    });
  }

  function getStoredContour(sliceIndex) {
    return state.contours.get(sliceIndex) || null;
  }

  function getDraftContourForSlice(sliceIndex) {
    if (!state.dragging || state.dragging.sliceIndex !== sliceIndex) {
      return null;
    }
    if (state.dragging.type === "draw") {
      return state.dragging.points;
    }
    if (state.dragging.type === "handle" || state.dragging.type === "translate") {
      return state.dragging.previewPoints;
    }
    return null;
  }

  function getRenderableContour(sliceIndex) {
    const draftPoints = getDraftContourForSlice(sliceIndex);
    if (draftPoints && draftPoints.length >= 3) {
      return {
        points: draftPoints,
        status: state.dragging.type === "draw" ? "draft" : "edited",
        revision: -1,
      };
    }

    return getStoredContour(sliceIndex);
  }

  function describeContourStatus(contour) {
    if (!contour) {
      return { label: "Pending", className: "is-missing" };
    }
    if (contour.status === "auto") {
      return { label: "Auto", className: "is-auto" };
    }
    if (contour.status === "copied-prev" || contour.status === "copied-next") {
      return { label: "Copied", className: "is-copied" };
    }
    if (contour.status === "edited") {
      return { label: "Edited", className: "is-edited" };
    }
    if (contour.status === "transferred") {
      return { label: "Transferred", className: "is-copied" };
    }
    if (contour.status === "draft") {
      return { label: "Draft", className: "" };
    }
    return { label: "Drawn", className: "" };
  }

  function isAutoContour(contour) {
    return contour?.status === "auto";
  }

  function isAnchorContour(contour) {
    return Boolean(contour) && !isAutoContour(contour);
  }

  function isSegmentationAnchorSlice(sliceIndex, contour) {
    const resolvedContour = contour || getStoredContour(sliceIndex);
    if (!resolvedContour) {
      return false;
    }
    return isAnchorContour(resolvedContour) || state.exclusionMasks.has(sliceIndex);
  }

  function getContourSourceText(contour) {
    if (!contour) {
      return "-";
    }
    if (contour.sourceLabel) {
      return contour.sourceLabel;
    }
    if (contour.sourceSliceIndex != null) {
      return `Slice ${contour.sourceSliceIndex + 1}`;
    }
    return "Current slice";
  }

  function polygonArea(points) {
    if (!Array.isArray(points) || points.length < 3) {
      return 0;
    }
    let sum = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      sum += current.x * next.y - next.x * current.y;
    }
    return Math.abs(sum) / 2;
  }

  function pointInPolygon(points, x, y) {
    let inside = false;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
      const xi = points[index].x;
      const yi = points[index].y;
      const xj = points[previous].x;
      const yj = points[previous].y;

      const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
      if (intersects) {
        inside = !inside;
      }
    }
    return inside;
  }

  function cloneContourPoints(points) {
    return points.map((point) => ({ x: point.x, y: point.y }));
  }

  function distanceBetweenPoints(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function getContourBounds(points) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    points.forEach((point) => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
    return { minX, minY, maxX, maxY };
  }

  function getAveragePixelSpacing(volume) {
    if (!volume) {
      return 1;
    }
    return Math.max(0.01, ((Number(volume.rowSpacing) || 1) + (Number(volume.columnSpacing) || 1)) / 2);
  }

  function millimetersToPixels(valueMm, volume) {
    return Math.max(0, Number(valueMm) || 0) / getAveragePixelSpacing(volume);
  }

  function getContourMeanPoint(points) {
    if (!Array.isArray(points) || !points.length) {
      return null;
    }

    let sumX = 0;
    let sumY = 0;
    points.forEach((point) => {
      sumX += point.x;
      sumY += point.y;
    });

    return {
      x: sumX / points.length,
      y: sumY / points.length,
    };
  }

  function getContourMeanRadius(points, centerPoint) {
    if (!Array.isArray(points) || !points.length) {
      return 0;
    }

    const center = centerPoint || getContourMeanPoint(points);
    if (!center) {
      return 0;
    }

    let total = 0;
    points.forEach((point) => {
      total += Math.hypot(point.x - center.x, point.y - center.y);
    });
    return total / points.length;
  }

  function buildCenterOutSliceOrder(bounds) {
    if (!bounds) {
      return [];
    }

    const order = [];
    const midpoint = Math.round((bounds.start + bounds.end) / 2);
    for (let offset = 0; offset < bounds.count; offset += 1) {
      const lower = midpoint - offset;
      const upper = midpoint + offset;
      if (offset === 0) {
        if (lower >= bounds.start && lower <= bounds.end) {
          order.push(lower);
        }
        continue;
      }
      if (lower >= bounds.start) {
        order.push(lower);
      }
      if (upper <= bounds.end) {
        order.push(upper);
      }
    }
    return order;
  }

  function smoothCircularValues(values, windowRadius, passes) {
    let smoothed = values.slice();
    const radius = Math.max(1, Math.round(windowRadius || 1));
    for (let pass = 0; pass < (passes || 0); pass += 1) {
      smoothed = smoothed.map((_, index) => {
        let sum = 0;
        let count = 0;
        for (let offset = -radius; offset <= radius; offset += 1) {
          const sample = smoothed[(index + offset + smoothed.length) % smoothed.length];
          if (!Number.isFinite(sample)) {
            continue;
          }
          sum += sample;
          count += 1;
        }
        return count ? sum / count : smoothed[index];
      });
    }
    return smoothed;
  }

  function clampPointToVolume(point, volume) {
    if (!volume) {
      return {
        x: point.x,
        y: point.y,
      };
    }

    return {
      x: clamp(point.x, 0, volume.columns - 1),
      y: clamp(point.y, 0, volume.rows - 1),
    };
  }

  function clampPointToImage(point) {
    return clampPointToVolume(point, state.volume);
  }

  function dedupeContourPoints(points) {
    const deduped = [];
    points.forEach((point) => {
      const nextPoint = clampPointToImage(point);
      if (!deduped.length || distanceBetweenPoints(deduped[deduped.length - 1], nextPoint) > 0.4) {
        deduped.push(nextPoint);
      }
    });
    if (deduped.length >= 2 && distanceBetweenPoints(deduped[0], deduped[deduped.length - 1]) < 0.8) {
      deduped.pop();
    }
    return deduped;
  }

  function resampleClosedPolygon(points, targetCount) {
    if (!Array.isArray(points) || points.length < 3) {
      return [];
    }

    const cleaned = dedupeContourPoints(points);
    if (cleaned.length < 3) {
      return [];
    }

    const segments = [];
    let perimeter = 0;
    for (let index = 0; index < cleaned.length; index += 1) {
      const current = cleaned[index];
      const next = cleaned[(index + 1) % cleaned.length];
      const length = distanceBetweenPoints(current, next);
      segments.push(length);
      perimeter += length;
    }

    if (!perimeter) {
      return cleaned;
    }

    const resampled = [];
    const step = perimeter / targetCount;
    let segmentIndex = 0;
    let segmentStart = cleaned[0];
    let segmentEnd = cleaned[1 % cleaned.length];
    let segmentLength = segments[0];
    let accumulated = 0;

    for (let sampleIndex = 0; sampleIndex < targetCount; sampleIndex += 1) {
      const targetDistance = sampleIndex * step;
      while (accumulated + segmentLength < targetDistance && segmentIndex < cleaned.length - 1) {
        accumulated += segmentLength;
        segmentIndex += 1;
        segmentStart = cleaned[segmentIndex];
        segmentEnd = cleaned[(segmentIndex + 1) % cleaned.length];
        segmentLength = segments[segmentIndex];
      }

      const localDistance = targetDistance - accumulated;
      const ratio = segmentLength ? localDistance / segmentLength : 0;
      resampled.push(
        clampPointToImage({
          x: segmentStart.x + (segmentEnd.x - segmentStart.x) * ratio,
          y: segmentStart.y + (segmentEnd.y - segmentStart.y) * ratio,
        })
      );
    }

    return resampled;
  }

  function smoothClosedPolygon(points, passes) {
    let smoothed = cloneContourPoints(points);
    for (let pass = 0; pass < (passes || 0); pass += 1) {
      smoothed = smoothed.map((point, index) => {
        const previous = smoothed[(index + smoothed.length - 1) % smoothed.length];
        const next = smoothed[(index + 1) % smoothed.length];
        return clampPointToImage({
          x: previous.x * 0.25 + point.x * 0.5 + next.x * 0.25,
          y: previous.y * 0.25 + point.y * 0.5 + next.y * 0.25,
        });
      });
    }
    return smoothed;
  }

  function normalizeContourPoints(points) {
    const cleaned = dedupeContourPoints(points);
    if (cleaned.length < 3 || polygonArea(cleaned) < 12) {
      return [];
    }
    return smoothClosedPolygon(resampleClosedPolygon(cleaned, RESAMPLED_CONTOUR_POINTS), 1);
  }

  function rotateContourPoints(points, offset) {
    if (!points.length) {
      return [];
    }
    const rotated = [];
    for (let index = 0; index < points.length; index += 1) {
      rotated.push(points[(index + offset + points.length) % points.length]);
    }
    return rotated;
  }

  function polygonSignedArea(points) {
    if (!Array.isArray(points) || points.length < 3) {
      return 0;
    }

    let sum = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      sum += current.x * next.y - next.x * current.y;
    }
    return sum / 2;
  }

  function getContourAlignmentCost(referencePoints, candidatePoints, offset) {
    const sampleStep = Math.max(1, Math.floor(referencePoints.length / 24));
    let cost = 0;
    for (let index = 0; index < referencePoints.length; index += sampleStep) {
      const referencePoint = referencePoints[index];
      const candidatePoint = candidatePoints[(index + offset) % candidatePoints.length];
      const dx = candidatePoint.x - referencePoint.x;
      const dy = candidatePoint.y - referencePoint.y;
      cost += dx * dx + dy * dy;
    }
    return cost;
  }

  function alignContourToReference(referencePoints, candidatePoints) {
    if (!Array.isArray(referencePoints) || !Array.isArray(candidatePoints) || !referencePoints.length || !candidatePoints.length) {
      return cloneContourPoints(candidatePoints || []);
    }

    let alignedCandidate = cloneContourPoints(candidatePoints);
    if ((polygonSignedArea(referencePoints) >= 0) !== (polygonSignedArea(alignedCandidate) >= 0)) {
      alignedCandidate = cloneContourPoints(alignedCandidate).reverse();
    }

    let bestOffset = 0;
    let bestCost = Infinity;
    for (let offset = 0; offset < alignedCandidate.length; offset += 1) {
      const cost = getContourAlignmentCost(referencePoints, alignedCandidate, offset);
      if (cost < bestCost) {
        bestCost = cost;
        bestOffset = offset;
      }
    }

    return rotateContourPoints(alignedCandidate, bestOffset);
  }

  function interpolateContourPoints(leftPoints, rightPoints, ratio) {
    const alignedRightPoints = alignContourToReference(leftPoints, rightPoints);
    return normalizeContourPoints(
      leftPoints.map((point, index) => ({
        x: point.x + (alignedRightPoints[index].x - point.x) * ratio,
        y: point.y + (alignedRightPoints[index].y - point.y) * ratio,
      }))
    );
  }

  function invalidateSliceMetrics(sliceIndex) {
    state.metricsCache.delete(sliceIndex);
  }

  function createContourRecord(points, status, sourceDetails) {
    const normalized = normalizeContourPoints(points);
    if (normalized.length < 3) {
      throw new Error("Contour needs at least three points.");
    }

    const normalizedSource = normalizeSourceDetails(sourceDetails);
    return {
      points: normalized,
      status: status || "drawn",
      sourceSliceIndex: normalizedSource.sourceSliceIndex,
      sourceLabel: normalizedSource.sourceLabel,
      revision: ++state.contourRevisionSequence,
    };
  }

  function storeContourRecord(sliceIndex, contourRecord) {
    state.contours.set(sliceIndex, contourRecord);
    invalidateSliceMetrics(sliceIndex);
  }

  function refreshContourOutputs() {
    updateGuideUi();
    updateReconstructionUi();
    updateCurrentSliceUi();
    updateSummaryUi();
    renderReconstructionList();
    renderSliceList();
    requestRender();
  }

  function setContour(sliceIndex, points, status, sourceDetails) {
    storeContourRecord(sliceIndex, createContourRecord(points, status, sourceDetails));
    refreshContourOutputs();
    pushHistorySnapshot("Updated contour");
  }

  function clearContour(sliceIndex) {
    state.contours.delete(sliceIndex);
    invalidateSliceMetrics(sliceIndex);
    refreshContourOutputs();
    pushHistorySnapshot("Cleared contour");
  }

  function getSliceExclusionMask(sliceIndex, createIfMissing) {
    let mask = state.exclusionMasks.get(sliceIndex) || null;
    if (!mask && createIfMissing && state.volume) {
      mask = new Uint8Array(state.volume.rows * state.volume.columns);
      state.exclusionMasks.set(sliceIndex, mask);
    }
    return mask;
  }

  function clearSliceExclusions(sliceIndex) {
    if (!state.exclusionMasks.has(sliceIndex)) {
      return false;
    }
    state.exclusionMasks.delete(sliceIndex);
    invalidateSliceMetrics(sliceIndex);
    return true;
  }

  function applyEraseBrushAtPoint(sliceIndex, imagePoint, radius) {
    const volume = state.volume;
    if (!volume) {
      return false;
    }

    const mask = getSliceExclusionMask(sliceIndex, true);
    const clampedRadius = clamp(radius, 2, 80);
    const radiusSquared = clampedRadius * clampedRadius;
    const minX = clamp(Math.floor(imagePoint.x - clampedRadius), 0, volume.columns - 1);
    const maxX = clamp(Math.ceil(imagePoint.x + clampedRadius), 0, volume.columns - 1);
    const minY = clamp(Math.floor(imagePoint.y - clampedRadius), 0, volume.rows - 1);
    const maxY = clamp(Math.ceil(imagePoint.y + clampedRadius), 0, volume.rows - 1);
    let changed = false;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x + 0.5 - imagePoint.x;
        const dy = y + 0.5 - imagePoint.y;
        if (dx * dx + dy * dy > radiusSquared) {
          continue;
        }

        const pixelIndex = y * volume.columns + x;
        if (!mask[pixelIndex]) {
          mask[pixelIndex] = 1;
          changed = true;
        }
      }
    }

    if (changed) {
      invalidateSliceMetrics(sliceIndex);
    }
    return changed;
  }

  function applyEraseBrushStroke(sliceIndex, startPoint, endPoint, radius) {
    const distance = distanceBetweenPoints(startPoint, endPoint);
    const step = Math.max(1, radius * 0.35);
    const samples = Math.max(1, Math.ceil(distance / step));
    let changed = false;

    for (let sampleIndex = 0; sampleIndex <= samples; sampleIndex += 1) {
      const ratio = samples ? sampleIndex / samples : 0;
      changed =
        applyEraseBrushAtPoint(sliceIndex, {
          x: startPoint.x + (endPoint.x - startPoint.x) * ratio,
          y: startPoint.y + (endPoint.y - startPoint.y) * ratio,
        }, radius) || changed;
    }

    return changed;
  }

  function getSliceHuValue(sliceIndex, pixelIndex) {
    const slice = state.volume?.slices?.[sliceIndex];
    if (!slice) {
      return null;
    }
    return slice.pixels[pixelIndex] * slice.slope + slice.intercept;
  }

  function extractConnectedComponents(mask, width, height) {
    if (!(mask instanceof Uint8Array) || !width || !height) {
      return [];
    }

    const components = [];
    const visited = new Uint8Array(mask.length);

    for (let index = 0; index < mask.length; index += 1) {
      if (!mask[index] || visited[index]) {
        continue;
      }

      const queue = [index];
      visited[index] = 1;
      const pixelIndices = [];
      let sumX = 0;
      let sumY = 0;
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;

      while (queue.length) {
        const current = queue.pop();
        const x = current % width;
        const y = (current - x) / width;
        pixelIndices.push(current);
        sumX += x + 0.5;
        sumY += y + 0.5;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) {
              continue;
            }
            const nextX = x + dx;
            const nextY = y + dy;
            if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
              continue;
            }
            const nextIndex = nextY * width + nextX;
            if (!mask[nextIndex] || visited[nextIndex]) {
              continue;
            }
            visited[nextIndex] = 1;
            queue.push(nextIndex);
          }
        }
      }

      components.push({
        pixelIndices,
        pixelCount: pixelIndices.length,
        centerX: sumX / Math.max(1, pixelIndices.length),
        centerY: sumY / Math.max(1, pixelIndices.length),
        minX,
        minY,
        maxX,
        maxY,
      });
    }

    return components;
  }

  function growBinaryMask(mask, width, height, maxSteps) {
    if (!(mask instanceof Uint8Array) || !mask.length) {
      return new Uint8Array(0);
    }

    const stepLimit = Math.max(0, Math.round(maxSteps || 0));
    if (!stepLimit) {
      const copy = new Uint8Array(mask.length);
      copy.set(mask);
      return copy;
    }

    const grown = new Uint8Array(mask.length);
    const distance = new Int16Array(mask.length);
    distance.fill(-1);
    const queue = [];

    for (let index = 0; index < mask.length; index += 1) {
      if (!mask[index]) {
        continue;
      }
      grown[index] = 1;
      distance[index] = 0;
      queue.push(index);
    }

    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      const currentDistance = distance[current];
      if (currentDistance >= stepLimit) {
        continue;
      }

      const x = current % width;
      const y = (current - x) / width;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) {
            continue;
          }
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
            continue;
          }
          const nextIndex = nextY * width + nextX;
          if (distance[nextIndex] !== -1) {
            continue;
          }
          distance[nextIndex] = currentDistance + 1;
          grown[nextIndex] = 1;
          queue.push(nextIndex);
        }
      }
    }

    return grown;
  }

  function buildSliceBodyReference(sliceIndex) {
    const volume = state.volume;
    if (!volume) {
      return null;
    }

    const mask = new Uint8Array(volume.rows * volume.columns);
    for (let pixelIndex = 0; pixelIndex < mask.length; pixelIndex += 1) {
      const hu = getSliceHuValue(sliceIndex, pixelIndex);
      if (hu != null && hu > AUTO_EAT_SETTINGS.bodyHuThreshold) {
        mask[pixelIndex] = 1;
      }
    }

    const components = extractConnectedComponents(mask, volume.columns, volume.rows);
    if (!components.length) {
      return null;
    }

    const imageCenterX = volume.columns / 2;
    const imageCenterY = volume.rows / 2;
    const chosen = components.reduce((best, component) => {
      const distanceToCenter = Math.hypot(component.centerX - imageCenterX, component.centerY - imageCenterY);
      const score =
        component.pixelCount -
        distanceToCenter * 14 +
        (component.minX <= imageCenterX &&
        component.maxX >= imageCenterX &&
        component.minY <= imageCenterY &&
        component.maxY >= imageCenterY
          ? component.pixelCount * 0.18
          : 0);
      if (!best || score > best.score) {
        return { score, component };
      }
      return best;
    }, null)?.component;

    if (!chosen) {
      return null;
    }

    const bodyMask = new Uint8Array(mask.length);
    chosen.pixelIndices.forEach((pixelIndex) => {
      bodyMask[pixelIndex] = 1;
    });

    return {
      mask: bodyMask,
      pixelCount: chosen.pixelCount,
      bounds: {
        minX: chosen.minX,
        minY: chosen.minY,
        maxX: chosen.maxX,
        maxY: chosen.maxY,
      },
      center: {
        x: chosen.centerX,
        y: chosen.centerY,
      },
    };
  }

  function getResolvedContourNeighbors(sliceIndex, resolvedContours) {
    let left = null;
    let right = null;
    resolvedContours.forEach((contour, candidateSliceIndex) => {
      if (!contour || candidateSliceIndex === sliceIndex) {
        return;
      }
      if (candidateSliceIndex < sliceIndex) {
        if (!left || candidateSliceIndex > left.sliceIndex) {
          left = {
            sliceIndex: candidateSliceIndex,
            contour,
          };
        }
      } else if (!right || candidateSliceIndex < right.sliceIndex) {
        right = {
          sliceIndex: candidateSliceIndex,
          contour,
        };
      }
    });
    return { left, right };
  }

  function findNearestResolvedContour(sliceIndex, resolvedContours) {
    const neighbors = getResolvedContourNeighbors(sliceIndex, resolvedContours);
    if (neighbors.left && neighbors.right) {
      return sliceIndex - neighbors.left.sliceIndex <= neighbors.right.sliceIndex - sliceIndex
        ? neighbors.left
        : neighbors.right;
    }
    return neighbors.left || neighbors.right || null;
  }

  function clearAutoContoursInRange(bounds, protectedSliceIndices) {
    if (!bounds) {
      return;
    }

    for (let sliceIndex = bounds.start; sliceIndex <= bounds.end; sliceIndex += 1) {
      if (protectedSliceIndices?.has(sliceIndex)) {
        continue;
      }
      if (isAutoContour(getStoredContour(sliceIndex))) {
        state.contours.delete(sliceIndex);
        invalidateSliceMetrics(sliceIndex);
      }
    }
  }

  function buildAutomaticEatContourForSlice(sliceIndex, priorResolution) {
    const volume = state.volume;
    if (!volume) {
      return null;
    }

    const bodyReference = buildSliceBodyReference(sliceIndex);
    if (!bodyReference) {
      return null;
    }

    const priorContour = priorResolution?.contour || null;
    const priorCenter = priorContour ? getContourMeanPoint(priorContour.points) : null;
    const bodyWidth = bodyReference.bounds.maxX - bodyReference.bounds.minX + 1;
    const bodyHeight = bodyReference.bounds.maxY - bodyReference.bounds.minY + 1;
    const minimumEnvelopePx = Math.max(6, millimetersToPixels(AUTO_EAT_SETTINGS.minimumEnvelopeMm, volume));
    const paddingPx = millimetersToPixels(AUTO_EAT_SETTINGS.contourPaddingMm, volume);
    const maxSearchRadiusPx = Math.max(
      minimumEnvelopePx * 3,
      millimetersToPixels(AUTO_EAT_SETTINGS.maxSearchRadiusMm, volume)
    );
    const expectedCenter = priorCenter || {
      x: bodyReference.center.x,
      y: bodyReference.center.y,
    };
    const baseRadiusPx = clamp(
      priorContour
        ? getContourMeanRadius(priorContour.points, priorCenter)
        : Math.min(bodyWidth, bodyHeight) * 0.17,
      minimumEnvelopePx * 1.5,
      maxSearchRadiusPx * 0.72
    );
    const searchRadiusPx = clamp(
      Math.max(baseRadiusPx * 1.9, minimumEnvelopePx * 2.8),
      minimumEnvelopePx * 2.4,
      maxSearchRadiusPx
    );
    const roi = {
      minX: clamp(Math.floor(expectedCenter.x - searchRadiusPx), 0, volume.columns - 1),
      maxX: clamp(Math.ceil(expectedCenter.x + searchRadiusPx), 0, volume.columns - 1),
      minY: clamp(Math.floor(expectedCenter.y - searchRadiusPx), 0, volume.rows - 1),
      maxY: clamp(Math.ceil(expectedCenter.y + searchRadiusPx), 0, volume.rows - 1),
    };
    const roiWidth = roi.maxX - roi.minX + 1;
    const roiHeight = roi.maxY - roi.minY + 1;
    const candidateMask = new Uint8Array(roiWidth * roiHeight);
    const pixelAreaMm2 = volume.rowSpacing * volume.columnSpacing;
    const expectedCoreAreaMm2 = Math.PI * (baseRadiusPx * 0.78) ** 2 * pixelAreaMm2;

    for (let y = roi.minY; y <= roi.maxY; y += 1) {
      for (let x = roi.minX; x <= roi.maxX; x += 1) {
        const dx = x + 0.5 - expectedCenter.x;
        const dy = y + 0.5 - expectedCenter.y;
        if (Math.hypot(dx, dy) > searchRadiusPx * 1.05) {
          continue;
        }
        const fullIndex = y * volume.columns + x;
        if (!bodyReference.mask[fullIndex]) {
          continue;
        }
        const hu = getSliceHuValue(sliceIndex, fullIndex);
        if (hu == null || hu < AUTO_EAT_SETTINGS.coreHuMin || hu > AUTO_EAT_SETTINGS.coreHuMax) {
          continue;
        }
        candidateMask[(y - roi.minY) * roiWidth + (x - roi.minX)] = 1;
      }
    }

    const candidateComponents = extractConnectedComponents(candidateMask, roiWidth, roiHeight);
    const bestCandidate = candidateComponents.reduce((best, component) => {
      const areaMm2 = component.pixelCount * pixelAreaMm2;
      if (areaMm2 < AUTO_EAT_SETTINGS.coreMinAreaMm2 || areaMm2 > AUTO_EAT_SETTINGS.coreMaxAreaMm2) {
        return best;
      }

      const centerX = roi.minX + component.centerX;
      const centerY = roi.minY + component.centerY;
      const distanceToExpected = Math.hypot(centerX - expectedCenter.x, centerY - expectedCenter.y);
      const areaSimilarity = expectedCoreAreaMm2
        ? Math.min(areaMm2, expectedCoreAreaMm2) / Math.max(areaMm2, expectedCoreAreaMm2)
        : 1;
      const widthPx = component.maxX - component.minX + 1;
      const heightPx = component.maxY - component.minY + 1;
      const aspectRatio = Math.max(widthPx, heightPx) / Math.max(1, Math.min(widthPx, heightPx));
      const containsExpectedCenter =
        centerX - widthPx / 2 <= expectedCenter.x &&
        centerX + widthPx / 2 >= expectedCenter.x &&
        centerY - heightPx / 2 <= expectedCenter.y &&
        centerY + heightPx / 2 >= expectedCenter.y;
      const score =
        areaSimilarity * 44 +
        Math.max(0, 1 - distanceToExpected / Math.max(10, searchRadiusPx)) * 40 +
        (containsExpectedCenter ? 12 : 0) +
        (priorContour && pointInPolygon(priorContour.points, centerX, centerY) ? 12 : 0) -
        Math.max(0, aspectRatio - 2.8) * 10;

      if (!best || score > best.score) {
        return {
          score,
          component,
        };
      }
      return best;
    }, null);

    if (!bestCandidate?.component) {
      return null;
    }

    const coreMask = new Uint8Array(roiWidth * roiHeight);
    bestCandidate.component.pixelIndices.forEach((pixelIndex) => {
      coreMask[pixelIndex] = 1;
    });

    const grownMask = growBinaryMask(
      coreMask,
      roiWidth,
      roiHeight,
      clamp(Math.round(millimetersToPixels(AUTO_EAT_SETTINGS.fatMarginMm, volume)), 4, Math.round(searchRadiusPx))
    );
    const componentCenter = {
      x: roi.minX + bestCandidate.component.centerX,
      y: roi.minY + bestCandidate.component.centerY,
    };
    const center = priorCenter
      ? {
          x: componentCenter.x * 0.72 + priorCenter.x * 0.28,
          y: componentCenter.y * 0.72 + priorCenter.y * 0.28,
        }
      : {
          x: componentCenter.x,
          y: componentCenter.y,
        };
    const angleSamples = AUTO_EAT_SETTINGS.angleSamples;
    const coreRadii = new Array(angleSamples).fill(Number.NaN);
    const supportRadii = new Array(angleSamples).fill(Number.NaN);

    for (let localIndex = 0; localIndex < grownMask.length; localIndex += 1) {
      if (!grownMask[localIndex]) {
        continue;
      }

      const localX = localIndex % roiWidth;
      const localY = (localIndex - localX) / roiWidth;
      const x = roi.minX + localX;
      const y = roi.minY + localY;
      const fullIndex = y * volume.columns + x;
      if (!bodyReference.mask[fullIndex]) {
        continue;
      }

      const dx = x + 0.5 - center.x;
      const dy = y + 0.5 - center.y;
      const radius = Math.hypot(dx, dy);
      if (radius > maxSearchRadiusPx) {
        continue;
      }

      const angle = Math.atan2(dy, dx);
      const bucket = Math.min(
        angleSamples - 1,
        Math.max(0, Math.floor(((angle + Math.PI) / (Math.PI * 2)) * angleSamples))
      );

      if (coreMask[localIndex]) {
        coreRadii[bucket] = Number.isFinite(coreRadii[bucket]) ? Math.max(coreRadii[bucket], radius) : radius;
      }

      const hu = getSliceHuValue(sliceIndex, fullIndex);
      if (hu == null || hu < state.huThreshold.min || hu > AUTO_EAT_SETTINGS.coreHuMax) {
        continue;
      }
      supportRadii[bucket] = Number.isFinite(supportRadii[bucket])
        ? Math.max(supportRadii[bucket], radius)
        : radius;
    }

    const fallbackRadiusPx = clamp(baseRadiusPx + paddingPx, minimumEnvelopePx * 2, maxSearchRadiusPx * 0.92);
    const radii = supportRadii.map((radius, index) => {
      const coreRadius = coreRadii[index];
      let resolvedRadius = radius;
      if (!Number.isFinite(resolvedRadius) && Number.isFinite(coreRadius)) {
        resolvedRadius = coreRadius + minimumEnvelopePx;
      }
      if (!Number.isFinite(resolvedRadius)) {
        resolvedRadius = fallbackRadiusPx;
      } else if (Number.isFinite(coreRadius)) {
        resolvedRadius = Math.max(resolvedRadius + paddingPx, coreRadius + minimumEnvelopePx);
      } else {
        resolvedRadius += paddingPx;
      }
      return clamp(resolvedRadius, minimumEnvelopePx * 1.5, maxSearchRadiusPx);
    });

    const smoothedRadii = smoothCircularValues(
      radii,
      AUTO_EAT_SETTINGS.radiusSmoothingWindow,
      AUTO_EAT_SETTINGS.radiusSmoothingPasses
    );
    const points = smoothedRadii.map((radius, index) => {
      const angle = (index / angleSamples) * Math.PI * 2 - Math.PI;
      return clampPointToVolume(
        {
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
        },
        volume
      );
    });
    const normalized = normalizeContourPoints(points);
    if (normalized.length < 3) {
      return null;
    }

    if (!priorContour) {
      return normalized;
    }

    const blended = interpolateContourPoints(priorContour.points, normalized, 0.72);
    return blended.length >= 3 ? blended : normalized;
  }

  function computeHuStandardDeviation(pixelCount, huSum, huSquaredSum) {
    if (!pixelCount) {
      return null;
    }
    const mean = huSum / pixelCount;
    const variance = Math.max(0, huSquaredSum / pixelCount - mean * mean);
    return Math.sqrt(variance);
  }

  function computeSliceMetricsForPoints(sliceIndex, points, options) {
    const volume = state.volume;
    if (!volume || !Array.isArray(points) || points.length < 3) {
      return null;
    }

    const rows = volume.rows;
    const columns = volume.columns;
    const pixelAreaMm2 = volume.rowSpacing * volume.columnSpacing;
    const bounds = getContourBounds(points);
    const minX = clamp(Math.floor(bounds.minX), 0, columns - 1);
    const maxX = clamp(Math.ceil(bounds.maxX), 0, columns - 1);
    const minY = clamp(Math.floor(bounds.minY), 0, rows - 1);
    const maxY = clamp(Math.ceil(bounds.maxY), 0, rows - 1);
    const exclusionMask = getSliceExclusionMask(sliceIndex, false);
    const createOverlay = options?.createOverlay !== false;
    let overlayCanvas = null;
    let overlayImageData = null;
    let overlayPixels = null;

    if (createOverlay) {
      overlayCanvas = document.createElement("canvas");
      overlayCanvas.width = columns;
      overlayCanvas.height = rows;
      const overlayCtx = overlayCanvas.getContext("2d");
      overlayImageData = overlayCtx.createImageData(columns, rows);
      overlayPixels = overlayImageData.data;
    }

    let contourPixelCount = 0;
    let fatPixelCount = 0;
    let fatHuSum = 0;
    let fatHuSquaredSum = 0;
    let fatHuMin = Infinity;
    let fatHuMax = -Infinity;
    let excludedPixelCount = 0;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (!pointInPolygon(points, x + 0.5, y + 0.5)) {
          continue;
        }

        contourPixelCount += 1;
        const pixelIndex = y * columns + x;
        const hu = getSliceHuValue(sliceIndex, pixelIndex);
        const isExcluded = Boolean(exclusionMask?.[pixelIndex]);
        if (hu == null || hu < state.huThreshold.min || hu > state.huThreshold.max) {
          continue;
        }

        if (isExcluded) {
          excludedPixelCount += 1;
          if (overlayPixels) {
            const offset = pixelIndex * 4;
            overlayPixels[offset] = 255;
            overlayPixels[offset + 1] = 120;
            overlayPixels[offset + 2] = 96;
            overlayPixels[offset + 3] = 180;
          }
          continue;
        }

        fatPixelCount += 1;
        fatHuSum += hu;
        fatHuSquaredSum += hu * hu;
        fatHuMin = Math.min(fatHuMin, hu);
        fatHuMax = Math.max(fatHuMax, hu);

        if (overlayPixels) {
          const offset = pixelIndex * 4;
          overlayPixels[offset] = 247;
          overlayPixels[offset + 1] = 200;
          overlayPixels[offset + 2] = 127;
          overlayPixels[offset + 3] = 170;
        }
      }
    }

    if (overlayCanvas && overlayImageData) {
      overlayCanvas.getContext("2d").putImageData(overlayImageData, 0, 0);
    }

    const contourAreaMm2 = polygonArea(points) * pixelAreaMm2;
    const fatAreaMm2 = fatPixelCount * pixelAreaMm2;
    const fatVolumeMm3 = fatAreaMm2 * volume.sliceSpacing;
    const excludedAreaMm2 = excludedPixelCount * pixelAreaMm2;
    const excludedVolumeMm3 = excludedAreaMm2 * volume.sliceSpacing;

    return {
      sliceIndex,
      contourPixelCount,
      contourAreaMm2,
      fatPixelCount,
      fatAreaMm2,
      fatVolumeMm3,
      fatVolumeMl: fatVolumeMm3 / 1000,
      excludedPixelCount,
      excludedAreaMm2,
      excludedVolumeMm3,
      excludedVolumeMl: excludedVolumeMm3 / 1000,
      fatHuSum,
      fatHuSquaredSum,
      meanHu: fatPixelCount ? fatHuSum / fatPixelCount : null,
      stdDevHu: computeHuStandardDeviation(fatPixelCount, fatHuSum, fatHuSquaredSum),
      minHu: fatPixelCount ? fatHuMin : null,
      maxHu: fatPixelCount ? fatHuMax : null,
      overlayCanvas,
    };
  }

  function getSliceMetrics(sliceIndex) {
    const contour = getStoredContour(sliceIndex);
    if (!contour) {
      return null;
    }

    const cached = state.metricsCache.get(sliceIndex);
    if (cached && cached.revision === contour.revision) {
      return cached.metrics;
    }

    const metrics = computeSliceMetricsForPoints(sliceIndex, contour.points, { createOverlay: false });
    state.metricsCache.set(sliceIndex, {
      revision: contour.revision,
      metrics,
    });
    return metrics;
  }

  function buildStudySummary() {
    const bounds = getSliceBounds();
    if (!bounds) {
      return {
        reviewed: 0,
        missing: 0,
        rangeCount: 0,
        totalVolumeMl: 0,
        totalExcludedVolumeMl: 0,
        meanHu: null,
        stdDevHu: null,
        totalFatPixels: 0,
      };
    }

    let reviewed = 0;
    let totalFatPixels = 0;
    let totalHuSum = 0;
    let totalHuSquaredSum = 0;
    let totalVolumeMm3 = 0;
    let totalExcludedVolumeMm3 = 0;

    for (let sliceIndex = bounds.start; sliceIndex <= bounds.end; sliceIndex += 1) {
      const contour = getStoredContour(sliceIndex);
      if (!contour) {
        continue;
      }

      reviewed += 1;
      const metrics = getSliceMetrics(sliceIndex);
      if (!metrics) {
        continue;
      }

      totalFatPixels += metrics.fatPixelCount;
      totalHuSum += metrics.fatHuSum;
      totalHuSquaredSum += metrics.fatHuSquaredSum;
      totalVolumeMm3 += metrics.fatVolumeMm3;
      totalExcludedVolumeMm3 += metrics.excludedVolumeMm3;
    }

    return {
      reviewed,
      missing: bounds.count - reviewed,
      rangeCount: bounds.count,
      totalVolumeMl: totalVolumeMm3 / 1000,
      totalExcludedVolumeMl: totalExcludedVolumeMm3 / 1000,
      meanHu: totalFatPixels ? totalHuSum / totalFatPixels : null,
      stdDevHu: computeHuStandardDeviation(totalFatPixels, totalHuSum, totalHuSquaredSum),
      totalFatPixels,
    };
  }

  function updateCurrentSliceUi() {
    if (!state.volume) {
      els.currentSliceStatus.textContent = "No slice selected";
      renderDefinitionRows(els.currentSliceMetrics, [{ label: "Contour", value: "Load a study to begin." }]);
      return;
    }

    const contour = getStoredContour(state.currentSliceIndex);
    const metrics = contour ? getSliceMetrics(state.currentSliceIndex) : null;
    const outsideRange = !isSliceInRange(state.currentSliceIndex);
    const statusInfo = describeContourStatus(contour);
    const rangeLabel = outsideRange ? "Outside export range" : statusInfo.label;
    const sourceLabel = getContourSourceText(contour);

    els.currentSliceStatus.textContent = rangeLabel;
    renderDefinitionRows(els.currentSliceMetrics, [
      { label: "Contour", value: contour ? statusInfo.label : "Pending" },
      { label: "Source", value: sourceLabel },
      { label: "Contour Area", value: metrics ? `${formatNumber(metrics.contourAreaMm2, 1)} mm²` : "-" },
      { label: "EAT Area", value: metrics ? `${formatNumber(metrics.fatAreaMm2, 1)} mm²` : "-" },
      { label: "EAT Volume", value: metrics ? `${formatNumber(metrics.fatVolumeMl, 3)} mL` : "-" },
      { label: "Rubber Excluded", value: metrics ? `${formatNumber(metrics.excludedVolumeMl, 3)} mL` : "-" },
      { label: "Mean Density", value: metrics?.meanHu != null ? formatNumber(metrics.meanHu, 1) : "-" },
      { label: "Density SD", value: metrics?.stdDevHu != null ? formatNumber(metrics.stdDevHu, 1) : "-" },
      { label: "Density Range", value: metrics?.minHu != null ? `${formatNumber(metrics.minHu, 0)} to ${formatNumber(metrics.maxHu, 0)}` : "-" },
    ]);
  }

  function updateSummaryUi() {
    const summary = buildStudySummary();
    const exportableReconstructions = getExportableReconstructions();
    els.summaryCoverage.textContent = `${summary.reviewed} / ${summary.rangeCount} reviewed`;
    renderDefinitionRows(els.summaryMetrics, [
      { label: "Total EAT Volume", value: summary.rangeCount ? `${formatNumber(summary.totalVolumeMl, 3)} mL` : "-" },
      { label: "Mean Density", value: summary.meanHu != null ? formatNumber(summary.meanHu, 1) : "-" },
      { label: "Density SD", value: summary.stdDevHu != null ? formatNumber(summary.stdDevHu, 1) : "-" },
      { label: "Rubber Excluded", value: summary.rangeCount ? `${formatNumber(summary.totalExcludedVolumeMl, 3)} mL` : "-" },
      { label: "Reviewed", value: `${summary.reviewed}` },
      { label: "Missing", value: `${summary.missing}` },
      { label: "Recon Ready", value: `${exportableReconstructions.length} / ${state.reconstructions.length}` },
      { label: "Threshold", value: getThresholdLabel() },
    ]);
  }

  function renderSliceList() {
    els.sliceList.innerHTML = "";
    const bounds = getSliceBounds();
    if (!bounds) {
      return;
    }

    for (let sliceIndex = bounds.start; sliceIndex <= bounds.end; sliceIndex += 1) {
      const contour = getStoredContour(sliceIndex);
      const metrics = contour ? getSliceMetrics(sliceIndex) : null;
      const statusInfo = describeContourStatus(contour);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slice-row";
      if (sliceIndex === state.currentSliceIndex) {
        button.classList.add("is-active");
      }
      if (!contour) {
        button.classList.add("is-missing");
      }
      button.addEventListener("click", () => {
        setCurrentSliceIndex(sliceIndex);
      });

      const indexLabel = document.createElement("strong");
      indexLabel.textContent = `#${sliceIndex + 1}`;

      const meta = document.createElement("span");
      meta.className = "slice-meta";
      const labels = [];
      if (sliceIndex === bounds.start) {
        labels.push("Top");
      }
      if (sliceIndex === bounds.end) {
        labels.push("Bottom");
      }
      if (metrics) {
        labels.push(`${formatNumber(metrics.fatVolumeMl, 3)} mL`);
        labels.push(metrics.meanHu != null ? `${formatNumber(metrics.meanHu, 1)} HU` : "No thresholded fat");
      } else {
        labels.push("No contour");
      }
      meta.textContent = labels.join(" • ");

      const textGroup = document.createElement("div");
      textGroup.appendChild(meta);

      const badge = document.createElement("span");
      badge.className = `badge ${statusInfo.className}`.trim();
      badge.textContent = statusInfo.label;

      button.appendChild(indexLabel);
      button.appendChild(textGroup);
      button.appendChild(badge);
      els.sliceList.appendChild(button);
    }
  }

  function updateEmptyState() {
    els.emptyState.classList.toggle("is-hidden", Boolean(state.volume));
  }

  function refreshUi() {
    updateGuideUi();
    updateAiBackendUi();
    updateProjectUi();
    updateReconstructionUi();
    updateCompareUi();
    updateToolButtons();
    updatePresetButtons();
    updateVoiUi();
    updateThresholdUi();
    updateEraseUi();
    updateZoomUi();
    updateRangeUi();
    updateSliceNavigationUi();
    updateCurrentSliceUi();
    updateSummaryUi();
    renderReconstructionList();
    renderSliceList();
    updateStudyMetadataUi();
    updateEmptyState();
    updateHistoryUi();
    updateExportPromptUi();
  }

  function withReconstructionSync(reconstruction, callback) {
    const snapshot = captureActiveReconstructionContext();
    persistActiveReconstructionRange();
    state.activeReconstructionId = reconstruction?.id || null;
    syncActiveReconstructionAliases(reconstruction || null);
    clampCurrentSliceToActiveVolume();
    try {
      return callback();
    } finally {
      restoreActiveReconstructionContext(snapshot);
    }
  }

  function getCanvasContext(canvas) {
    return canvas.getContext("2d");
  }

  function resizeCanvasToDisplaySize(canvas, shell) {
    const rect = shell.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
    const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const ctx = getCanvasContext(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return {
      width: rect.width,
      height: rect.height,
    };
  }

  function getViewportGeometry(viewportSize, volume) {
    if (!volume) {
      return null;
    }

    const margin = 24;
    const fitScale = Math.min(
      Math.max(10, viewportSize.width - margin * 2) / volume.columns,
      Math.max(10, viewportSize.height - margin * 2) / volume.rows
    );
    const scale = fitScale * state.view.zoom;
    const drawWidth = volume.columns * scale;
    const drawHeight = volume.rows * scale;
    const availableVerticalSlack = Math.max(0, viewportSize.height - drawHeight);
    const defaultVerticalOffset = Math.min(28, availableVerticalSlack * 0.12);
    return {
      scale,
      drawWidth,
      drawHeight,
      originX: (viewportSize.width - drawWidth) / 2 + state.view.panX,
      originY: (viewportSize.height - drawHeight) / 2 + defaultVerticalOffset + state.view.panY,
    };
  }

  function imageToCanvasPoint(point, geometry) {
    return {
      x: geometry.originX + point.x * geometry.scale,
      y: geometry.originY + point.y * geometry.scale,
    };
  }

  function eventToCanvasPoint(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function canvasToImagePoint(canvasPoint, geometry, volume) {
    if (!volume || !geometry) {
      return null;
    }

    const x = (canvasPoint.x - geometry.originX) / geometry.scale;
    const y = (canvasPoint.y - geometry.originY) / geometry.scale;
    return {
      x,
      y,
      inside: x >= 0 && x <= volume.columns - 1 && y >= 0 && y <= volume.rows - 1,
    };
  }

  function voiToByte(value) {
    const width = Math.max(1, state.currentVOI.width);
    const center = state.currentVOI.center;
    const low = center - width / 2;
    const high = center + width / 2;
    if (value <= low) {
      return 0;
    }
    if (value >= high) {
      return 255;
    }
    return Math.round((((value - low) / width) * 255));
  }

  function ensureImageBuffer() {
    if (!state.imageBufferCanvas) {
      state.imageBufferCanvas = document.createElement("canvas");
    }
    return state.imageBufferCanvas;
  }

  function renderSlicePixels(sliceIndex, volume) {
    if (!volume) {
      return null;
    }

    const bufferCanvas = ensureImageBuffer();
    if (bufferCanvas.width !== volume.columns || bufferCanvas.height !== volume.rows) {
      bufferCanvas.width = volume.columns;
      bufferCanvas.height = volume.rows;
    }

    const ctx = bufferCanvas.getContext("2d");
    const imageData = ctx.createImageData(volume.columns, volume.rows);
    const pixels = imageData.data;
    const slice = volume.slices[sliceIndex];

    let offset = 0;
    for (let index = 0; index < slice.pixels.length; index += 1) {
      const hu = slice.pixels[index] * slice.slope + slice.intercept;
      const gray = voiToByte(hu);
      pixels[offset] = gray;
      pixels[offset + 1] = gray;
      pixels[offset + 2] = gray;
      pixels[offset + 3] = 255;
      offset += 4;
    }

    ctx.putImageData(imageData, 0, 0);
    return bufferCanvas;
  }

  function getHandleIndices(points) {
    if (!points.length) {
      return [];
    }
    const count = Math.min(HANDLE_TARGET_COUNT, points.length);
    const step = points.length / count;
    const indices = [];
    for (let index = 0; index < count; index += 1) {
      indices.push(Math.round(index * step) % points.length);
    }
    return Array.from(new Set(indices));
  }

  function findHandleHit(points, imagePoint, geometry) {
    const threshold = 12 / geometry.scale;
    const handleIndices = getHandleIndices(points);
    let best = null;

    handleIndices.forEach((pointIndex) => {
      const distance = distanceBetweenPoints(points[pointIndex], imagePoint);
      if (distance <= threshold && (!best || distance < best.distance)) {
        best = { pointIndex, distance };
      }
    });

    return best;
  }

  function translateContourPoints(points, delta) {
    return points.map((point) =>
      clampPointToImage({
        x: point.x + delta.x,
        y: point.y + delta.y,
      })
    );
  }

  function moveContourHandle(points, targetIndex, delta) {
    const spread = Math.max(5, Math.round(points.length / 18));
    return points.map((point, index) => {
      const linearDistance = Math.abs(index - targetIndex);
      const circularDistance = Math.min(linearDistance, points.length - linearDistance);
      if (circularDistance > spread) {
        return { x: point.x, y: point.y };
      }
      const weight = Math.cos((circularDistance / (spread + 1)) * (Math.PI / 2)) ** 2;
      return clampPointToImage({
        x: point.x + delta.x * weight,
        y: point.y + delta.y * weight,
      });
    });
  }

  function drawContour(ctx, geometry, contour) {
    if (!contour?.points?.length) {
      return;
    }

    ctx.save();
    ctx.beginPath();
    contour.points.forEach((point, index) => {
      const canvasPoint = imageToCanvasPoint(point, geometry);
      if (index === 0) {
        ctx.moveTo(canvasPoint.x, canvasPoint.y);
      } else {
        ctx.lineTo(canvasPoint.x, canvasPoint.y);
      }
    });
    ctx.closePath();
    ctx.fillStyle = contour.status === "draft" ? "rgba(110, 228, 255, 0.10)" : "rgba(110, 228, 255, 0.07)";
    ctx.strokeStyle = contour.status === "draft" ? "rgba(110, 228, 255, 0.7)" : "#6ee4ff";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawThresholdOverlay(ctx, geometry, metrics) {
    if (!metrics?.overlayCanvas) {
      return;
    }

    ctx.save();
    ctx.globalAlpha = 0.84;
    ctx.drawImage(metrics.overlayCanvas, geometry.originX, geometry.originY, geometry.drawWidth, geometry.drawHeight);
    ctx.restore();
  }

  function drawContourHandles(ctx, geometry, contour) {
    if (!contour?.points?.length) {
      return;
    }

    const handleIndices = getHandleIndices(contour.points);
    ctx.save();
    handleIndices.forEach((pointIndex) => {
      const canvasPoint = imageToCanvasPoint(contour.points[pointIndex], geometry);
      ctx.beginPath();
      ctx.arc(canvasPoint.x, canvasPoint.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#081018";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#f7c87f";
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawEraseBrushPreview(ctx, geometry) {
    if (state.activeTool !== "erase" || !state.hoverImagePoint) {
      return;
    }

    const canvasPoint = imageToCanvasPoint(state.hoverImagePoint, geometry);
    const canvasRadius = state.eraseBrushRadius * geometry.scale;
    ctx.save();
    ctx.beginPath();
    ctx.arc(canvasPoint.x, canvasPoint.y, canvasRadius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 120, 96, 0.12)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = "rgba(255, 144, 120, 0.92)";
    ctx.stroke();
    ctx.restore();
  }

  function drawCanvasOverlayLabels(ctx, viewportSize, reconstruction, sliceIndex) {
    if (!reconstruction?.volume) {
      return;
    }

    const currentSliceIndex = clamp(
      Number.isFinite(sliceIndex) ? Number(sliceIndex) : state.currentSliceIndex,
      0,
      reconstruction.volume.depth - 1
    );
    const labels = [];
    const bounds = getSliceBoundsForRangeState(getRangeStateForReconstruction(reconstruction), reconstruction.volume);
    if (bounds && currentSliceIndex === bounds.start) {
      labels.push("Top");
    }
    if (bounds && currentSliceIndex === bounds.end) {
      labels.push("Bottom");
    }
    if (!bounds || currentSliceIndex < bounds.start || currentSliceIndex > bounds.end) {
      labels.push("Outside Range");
    }

    if (!labels.length) {
      return;
    }

    ctx.save();
    ctx.font = "600 12px Aptos, Segoe UI, sans-serif";
    ctx.textBaseline = "top";
    let x = 18;
    labels.forEach((label) => {
      const width = ctx.measureText(label).width + 18;
      ctx.fillStyle = "rgba(6, 12, 16, 0.78)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      drawRoundedRectPath(ctx, x, 18, width, 28, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f4f8fb";
      ctx.fillText(label, x + 9, 26);
      x += width + 8;
    });
    ctx.restore();
  }

  function drawRoundedRectPath(ctx, x, y, width, height, radius) {
    const clampedRadius = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + clampedRadius, y);
    ctx.lineTo(x + width - clampedRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
    ctx.lineTo(x + width, y + height - clampedRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
    ctx.lineTo(x + clampedRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
    ctx.lineTo(x, y + clampedRadius);
    ctx.quadraticCurveTo(x, y, x + clampedRadius, y);
  }

  function renderViewport(canvas, shell, reconstruction, options) {
    const viewportSize = resizeCanvasToDisplaySize(canvas, shell);
    const ctx = getCanvasContext(canvas);
    ctx.clearRect(0, 0, viewportSize.width, viewportSize.height);

    if (!reconstruction?.volume) {
      return;
    }

    const requestedSliceIndex = Number.isFinite(options?.sliceIndex) ? Number(options.sliceIndex) : state.currentSliceIndex;
    const currentSliceIndex = clamp(requestedSliceIndex, 0, reconstruction.volume.depth - 1);
    const geometry = getViewportGeometry(viewportSize, reconstruction.volume);
    const sliceCanvas = withReconstructionSync(reconstruction, () =>
      renderSlicePixels(currentSliceIndex, reconstruction.volume)
    );
    ctx.save();
    ctx.fillStyle = "#04090d";
    ctx.fillRect(0, 0, viewportSize.width, viewportSize.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sliceCanvas, geometry.originX, geometry.originY, geometry.drawWidth, geometry.drawHeight);
    ctx.restore();

    const renderableContour = withReconstructionSync(reconstruction, () =>
      options?.interactive ? getRenderableContour(currentSliceIndex) : reconstruction.contours.get(currentSliceIndex) || null
    );
    let metrics = null;
    if (state.showThresholdOverlay && renderableContour?.points?.length >= 3 && state.dragging?.type !== "draw") {
      metrics = withReconstructionSync(reconstruction, () =>
        computeSliceMetricsForPoints(currentSliceIndex, renderableContour.points, { createOverlay: true })
      );
      drawThresholdOverlay(ctx, geometry, metrics);
    }

    if (renderableContour?.points?.length) {
      drawContour(ctx, geometry, renderableContour);
      if (options?.interactive && state.activeTool === "edit" && state.dragging?.type !== "draw") {
        drawContourHandles(ctx, geometry, renderableContour);
      }
    }

    if (options?.interactive) {
      drawEraseBrushPreview(ctx, geometry);
    }
    drawCanvasOverlayLabels(ctx, viewportSize, reconstruction, currentSliceIndex);
  }

  function render() {
    const activeReconstruction = getActiveReconstruction();
    renderViewport(els.canvas, els.canvasShell, activeReconstruction, {
      interactive: true,
    });

    const compareReconstruction = getCompareReconstruction();
    if (state.compareMode && compareReconstruction) {
      const compareSliceIndex = activeReconstruction
        ? mapSliceIndexBetweenReconstructions(activeReconstruction, compareReconstruction, state.currentSliceIndex)
        : state.currentSliceIndex;
      renderViewport(els.compareCanvas, els.compareShell, compareReconstruction, {
        interactive: false,
        sliceIndex: compareSliceIndex,
      });
    } else if (els.compareCanvas && els.compareShell) {
      const viewportSize = resizeCanvasToDisplaySize(els.compareCanvas, els.compareShell);
      const ctx = getCanvasContext(els.compareCanvas);
      ctx.clearRect(0, 0, viewportSize.width, viewportSize.height);
    }
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

  function updateCanvasCursor() {
    const draggingType = state.dragging?.type;
    if (draggingType === "pan") {
      els.canvas.style.cursor = "grabbing";
      return;
    }
    if (draggingType === "sliceScroll") {
      els.canvas.style.cursor = "ns-resize";
      return;
    }
    if (draggingType === "handle" || draggingType === "translate") {
      els.canvas.style.cursor = "move";
      return;
    }
    els.canvas.style.cursor = TOOL_CURSORS[state.activeTool] || "default";
  }

  function resetView() {
    state.view.zoom = 1;
    state.view.panX = 0;
    state.view.panY = 0;
    updateZoomUi();
    requestRender();
  }

  function resetPresentationWindowing() {
    if (!state.volume) {
      return;
    }
    applyPreset("cardiac");
  }

  function setZoom(nextZoom, focusCanvasPoint) {
    const clampedZoom = clamp(nextZoom, 0.5, 6);
    if (!state.volume) {
      state.view.zoom = clampedZoom;
      updateZoomUi();
      requestRender();
      return;
    }

    const viewportSize = {
      width: els.canvasShell.clientWidth,
      height: els.canvasShell.clientHeight,
    };
    const previousGeometry = getViewportGeometry(viewportSize, state.volume);
    const focusImagePoint =
      focusCanvasPoint && previousGeometry ? canvasToImagePoint(focusCanvasPoint, previousGeometry, state.volume) : null;

    state.view.zoom = clampedZoom;

    if (focusImagePoint?.inside) {
      const nextGeometry = getViewportGeometry(viewportSize, state.volume);
      const projectedPoint = imageToCanvasPoint(focusImagePoint, nextGeometry);
      state.view.panX += focusCanvasPoint.x - projectedPoint.x;
      state.view.panY += focusCanvasPoint.y - projectedPoint.y;
    }

    updateZoomUi();
    requestRender();
  }

  function changeZoom(factor, focusCanvasPoint) {
    setZoom(state.view.zoom * factor, focusCanvasPoint);
  }

  function copyContourFrom(direction) {
    if (!state.volume) {
      throw new Error("Load a study before copying contours.");
    }

    const bounds = getSliceBounds();
    if (!bounds) {
      throw new Error("No slice range is active.");
    }

    let sliceIndex = state.currentSliceIndex + direction;
    while (sliceIndex >= bounds.start && sliceIndex <= bounds.end) {
      const sourceContour = getStoredContour(sliceIndex);
      if (sourceContour) {
        setContour(
          state.currentSliceIndex,
          sourceContour.points,
          direction < 0 ? "copied-prev" : "copied-next",
          sliceIndex
        );
        setActiveTool("edit");
        setStatus(`Copied contour from slice ${sliceIndex + 1}.`);
        return;
      }
      sliceIndex += direction;
    }

    throw new Error(`No ${direction < 0 ? "previous" : "next"} contoured slice was found in the current range.`);
  }

  function jumpToNextPendingSlice() {
    const bounds = getSliceBounds();
    if (!bounds) {
      return;
    }

    for (let index = state.currentSliceIndex + 1; index <= bounds.end; index += 1) {
      if (!getStoredContour(index)) {
        setCurrentSliceIndex(index);
        return;
      }
    }
    for (let index = bounds.start; index <= state.currentSliceIndex; index += 1) {
      if (!getStoredContour(index)) {
        setCurrentSliceIndex(index);
        return;
      }
    }

    setStatus("Every slice in the selected range already has a contour.");
  }

  async function autoSegmentSelectedRange() {
    if (!state.volume) {
      throw new Error("Load a study before auto-segmenting.");
    }

    const bounds = getSliceBounds();
    if (!bounds) {
      throw new Error("No slice range is active.");
    }

    const anchors = [];
    const protectedSliceIndices = new Set();
    for (let sliceIndex = bounds.start; sliceIndex <= bounds.end; sliceIndex += 1) {
      const contour = getStoredContour(sliceIndex);
      if (isSegmentationAnchorSlice(sliceIndex, contour)) {
        anchors.push({
          sliceIndex,
          contour,
        });
        protectedSliceIndices.add(sliceIndex);
      }
    }

    if (!anchors.length) {
      throw new Error("Draw or adjust at least one contour before running auto-segmentation.");
    }

    setStatus(
      `Running anchor-driven segmentation across ${bounds.count} slices from ${anchors.length} protected slice${anchors.length === 1 ? "" : "s"}, including your latest contour and rubber corrections...`
    );

    clearAutoContoursInRange(bounds, protectedSliceIndices);

    let autoCount = 0;
    const firstAnchor = anchors[0];
    for (let sliceIndex = bounds.start; sliceIndex < firstAnchor.sliceIndex; sliceIndex += 1) {
      storeContourRecord(
        sliceIndex,
        createContourRecord(firstAnchor.contour.points, "auto", {
          sourceSliceIndex: firstAnchor.sliceIndex,
          sourceLabel: `Auto from slice ${firstAnchor.sliceIndex + 1}`,
        })
      );
      autoCount += 1;
    }

    for (let anchorIndex = 0; anchorIndex < anchors.length - 1; anchorIndex += 1) {
      const leftAnchor = anchors[anchorIndex];
      const rightAnchor = anchors[anchorIndex + 1];
      const gap = rightAnchor.sliceIndex - leftAnchor.sliceIndex;
      if (gap <= 1) {
        continue;
      }

      for (let sliceIndex = leftAnchor.sliceIndex + 1; sliceIndex < rightAnchor.sliceIndex; sliceIndex += 1) {
        const ratio = (sliceIndex - leftAnchor.sliceIndex) / gap;
        const interpolatedPoints = interpolateContourPoints(leftAnchor.contour.points, rightAnchor.contour.points, ratio);
        storeContourRecord(
          sliceIndex,
          createContourRecord(interpolatedPoints, "auto", {
            sourceLabel: `Auto from slices ${leftAnchor.sliceIndex + 1}-${rightAnchor.sliceIndex + 1}`,
          })
        );
        autoCount += 1;
      }

      if ((anchorIndex + 1) % 4 === 0) {
        await waitForAnimationFrame();
      }
    }

    const lastAnchor = anchors[anchors.length - 1];
    for (let sliceIndex = lastAnchor.sliceIndex + 1; sliceIndex <= bounds.end; sliceIndex += 1) {
      storeContourRecord(
        sliceIndex,
        createContourRecord(lastAnchor.contour.points, "auto", {
          sourceSliceIndex: lastAnchor.sliceIndex,
          sourceLabel: `Auto from slice ${lastAnchor.sliceIndex + 1}`,
        })
      );
      autoCount += 1;
    }

    refreshContourOutputs();
    pushHistorySnapshot("Anchor-segmented slab");
    setStatus(
      autoCount
        ? `Let's Go Segment refreshed ${autoCount} slice${autoCount === 1 ? "" : "s"} using your latest contour and rubber anchors.`
        : "Every slice in the selected range is already acting as an anchor from your latest corrections."
    );
  }

  async function runAutomaticEatSegmentation() {
    if (!state.volume) {
      throw new Error("Load a study before running Automatic EAT.");
    }

    const bounds = getSliceBounds();
    if (!bounds) {
      throw new Error("No slice range is active.");
    }
    const activeReconstruction = getActiveReconstruction();
    const previousContours = new Map(state.contours);

    try {
      const protectedSliceIndices = new Set();
      const resolvedContours = new Map();
      for (let sliceIndex = bounds.start; sliceIndex <= bounds.end; sliceIndex += 1) {
        const contour = getStoredContour(sliceIndex);
        if (!isSegmentationAnchorSlice(sliceIndex, contour)) {
          continue;
        }
        protectedSliceIndices.add(sliceIndex);
        resolvedContours.set(sliceIndex, contour);
      }

      clearAutoContoursInRange(bounds, protectedSliceIndices);
      setStatus(
        `Running Automatic EAT across ${bounds.count} slices${protectedSliceIndices.size ? ` while preserving ${protectedSliceIndices.size} protected correction${protectedSliceIndices.size === 1 ? "" : "s"}` : ""}...`
      );

      const unresolvedSliceIndices = [];
      let generatedCount = 0;
      const sliceOrder = buildCenterOutSliceOrder(bounds);
      for (let orderIndex = 0; orderIndex < sliceOrder.length; orderIndex += 1) {
        const sliceIndex = sliceOrder[orderIndex];
        if (protectedSliceIndices.has(sliceIndex)) {
          continue;
        }

        const priorResolution = findNearestResolvedContour(sliceIndex, resolvedContours);
        const points = buildAutomaticEatContourForSlice(sliceIndex, priorResolution);
        if (points?.length >= 3) {
          const contourRecord = createContourRecord(points, "auto", {
            sourceSliceIndex: priorResolution?.sliceIndex ?? null,
            sourceLabel: priorResolution
              ? `Automatic EAT with slice ${priorResolution.sliceIndex + 1} guidance`
              : "Automatic EAT from image cues",
          });
          storeContourRecord(sliceIndex, contourRecord);
          resolvedContours.set(sliceIndex, contourRecord);
          generatedCount += 1;
        } else {
          unresolvedSliceIndices.push(sliceIndex);
        }

        if ((orderIndex + 1) % 4 === 0) {
          await waitForAnimationFrame();
        }
      }

      let fallbackCount = 0;
      unresolvedSliceIndices
        .slice()
        .sort((left, right) => left - right)
        .forEach((sliceIndex) => {
          const { left, right } = getResolvedContourNeighbors(sliceIndex, resolvedContours);
          let contourRecord = null;

          if (left && right) {
            const ratio = (sliceIndex - left.sliceIndex) / Math.max(1, right.sliceIndex - left.sliceIndex);
            const interpolatedPoints = interpolateContourPoints(left.contour.points, right.contour.points, ratio);
            if (interpolatedPoints.length >= 3) {
              contourRecord = createContourRecord(interpolatedPoints, "auto", {
                sourceLabel: `Automatic EAT fallback from slices ${left.sliceIndex + 1}-${right.sliceIndex + 1}`,
              });
            }
          } else if (left || right) {
            const neighbor = left || right;
            contourRecord = createContourRecord(neighbor.contour.points, "auto", {
              sourceSliceIndex: neighbor.sliceIndex,
              sourceLabel: `Automatic EAT fallback from slice ${neighbor.sliceIndex + 1}`,
            });
          }

          if (!contourRecord) {
            return;
          }

          storeContourRecord(sliceIndex, contourRecord);
          resolvedContours.set(sliceIndex, contourRecord);
          fallbackCount += 1;
        });

      const totalAutoCount = generatedCount + fallbackCount;
      if (!totalAutoCount && !protectedSliceIndices.size) {
        throw new Error("Automatic EAT could not identify a usable cardiac envelope. Try a smaller slab or add a few anchor contours.");
      }

      refreshContourOutputs();
      pushHistorySnapshot("Automatic EAT segmented slab");

      setStatus(
        totalAutoCount
          ? `Automatic EAT updated ${totalAutoCount} slice${totalAutoCount === 1 ? "" : "s"}${fallbackCount ? `, including ${fallbackCount} fallback interpolation${fallbackCount === 1 ? "" : "s"}` : ""}. Review and adjust as needed.`
          : "Automatic EAT kept the existing protected slices; no additional slices needed updating."
      );
    } catch (error) {
      if (activeReconstruction) {
        activeReconstruction.contours = new Map(previousContours);
        activeReconstruction.metricsCache = new Map();
        if (state.activeReconstructionId === activeReconstruction.id) {
          state.contours = activeReconstruction.contours;
          state.metricsCache = activeReconstruction.metricsCache;
        }
        refreshContourOutputs();
      }
      throw error;
    }
  }

  function applyBackendEatResult(payload) {
    const bounds = getSliceBounds();
    if (!bounds) {
      throw new Error("No slice range is active.");
    }

    const contourRows = Array.isArray(payload?.contours) ? payload.contours : [];
    if (!contourRows.length) {
      throw new Error("The AI backend did not return any contours for this reconstruction.");
    }

    const protectedSliceIndices = new Set();
    for (let sliceIndex = bounds.start; sliceIndex <= bounds.end; sliceIndex += 1) {
      const contour = getStoredContour(sliceIndex);
      if (isSegmentationAnchorSlice(sliceIndex, contour)) {
        protectedSliceIndices.add(sliceIndex);
      }
    }

    clearAutoContoursInRange(bounds, protectedSliceIndices);

    let importedCount = 0;
    let skippedProtectedCount = 0;
    contourRows.forEach((row) => {
      const sliceIndex = Number(row?.sliceIndex);
      const points = Array.isArray(row?.points)
        ? row.points
            .map((point) => ({
              x: Number(point?.x),
              y: Number(point?.y),
            }))
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
        : [];
      if (!Number.isFinite(sliceIndex) || points.length < 3) {
        return;
      }
      if (sliceIndex < bounds.start || sliceIndex > bounds.end) {
        return;
      }
      if (protectedSliceIndices.has(sliceIndex)) {
        skippedProtectedCount += 1;
        return;
      }

      const providerLabel = safeString(payload?.providerLabel) || getEatBackendPipelineLabel(payload);
      storeContourRecord(
        sliceIndex,
        createContourRecord(points, "auto", {
          sourceSliceIndex: null,
          sourceLabel: `AI ${providerLabel}`,
        })
      );
      importedCount += 1;
    });

    if (!importedCount && !protectedSliceIndices.size) {
      throw new Error("The AI backend returned no importable contours inside the selected slab.");
    }

    refreshContourOutputs();
    pushHistorySnapshot("AI auto-segmented slab");

    const summary = payload?.summary || {};
    const processingSeconds = Number.isFinite(summary.processingSeconds) ? formatNumber(summary.processingSeconds, 1) : null;
    setStatus(
      importedCount
        ? `Model Assist imported ${importedCount} slice${importedCount === 1 ? "" : "s"}${skippedProtectedCount ? ` and kept ${skippedProtectedCount} protected correction${skippedProtectedCount === 1 ? "" : "s"}` : ""}${processingSeconds ? ` in ${processingSeconds}s` : ""}.`
        : "Model Assist left the protected manual slices in place; no additional slices needed importing."
    );
  }

  async function runAiAutoSegmentation() {
    if (state.backend.aiSegmenting) {
      return;
    }

    const activeReconstruction = getActiveReconstruction();
    if (!activeReconstruction?.records?.length) {
      throw new Error("Load an active reconstruction before running Model Assist.");
    }

    const status = state.backend.status || (await refreshEatBackendStatus({ silent: true }));
    if (!status?.ready) {
      throw new Error(status?.message || "The AI backend is not ready yet. Refresh the backend or keep using Automatic EAT.");
    }

    const bounds = getSliceBounds();
    if (!bounds) {
      throw new Error("No slice range is active.");
    }

    state.backend.aiSegmenting = true;
    updateAiBackendUi();
    const cacheEntry = await ensureEatBackendCacheEntry(activeReconstruction);
    const usingCachedStudy = Boolean(cacheEntry?.available);
    setStatus(
      usingCachedStudy
        ? "Reusing the cached study for AI auto segmentation..."
        : `Uploading ${activeReconstruction.records.length} source slice${
            activeReconstruction.records.length === 1 ? "" : "s"
          } for AI auto segmentation...`
    );

    try {
      const formData = new FormData();
      formData.append("options", JSON.stringify(buildEatBackendRequestOptions(activeReconstruction, bounds, status.recommendedPipeline || "auto")));
      if (!usingCachedStudy) {
        appendReconstructionFilesToFormData(formData, activeReconstruction);
      }

      await waitForAnimationFrame();
      const response = await fetch("/api/eat/backend/segment", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      state.backend.lastResult = payload;
      if (payload.tools) {
        state.backend.status = payload.tools;
      }
      if (payload.cache) {
        applyReconstructionBackendCacheEntry(activeReconstruction, payload.cache);
      }
      updateAiBackendUi();
      if (!response.ok) {
        throw new Error(payload.message || "AI auto segmentation failed.");
      }
      applyBackendEatResult(payload);
      return payload;
    } finally {
      state.backend.aiSegmenting = false;
      updateAiBackendUi();
    }
  }

  async function sendTrainingFeedback() {
    if (state.backend.trainingSubmitting) {
      return;
    }

    const activeReconstruction = getActiveReconstruction();
    if (!activeReconstruction?.records?.length) {
      throw new Error("Load an active reconstruction before storing a reference-standard case.");
    }

    const status = state.backend.status || (await refreshEatBackendStatus({ silent: true }));
    if (status && status.canStoreFeedback === false) {
      throw new Error(status.message || "The local server is not ready to receive reference-standard cases.");
    }

    const bounds = getSliceBounds();
    if (!bounds) {
      throw new Error("No slice range is active.");
    }

    const trainingPayload = buildTrainingSubmissionPayload(activeReconstruction, bounds);

    state.backend.trainingSubmitting = true;
    updateAiBackendUi();
    const cacheEntry = await ensureEatBackendCacheEntry(activeReconstruction);
    const usingCachedStudy = Boolean(cacheEntry?.available);
    setStatus(
      usingCachedStudy
        ? `Storing ${trainingPayload.summary.confirmedSliceCount} confirmed slice${
            trainingPayload.summary.confirmedSliceCount === 1 ? "" : "s"
          } as a cached local reference-standard case...`
        : `Uploading ${trainingPayload.summary.confirmedSliceCount} confirmed slice${
            trainingPayload.summary.confirmedSliceCount === 1 ? "" : "s"
          } as a local reference-standard case...`
    );

    try {
      const formData = new FormData();
      formData.append(
        "options",
        JSON.stringify({
          ...buildEatBackendRequestOptions(activeReconstruction, bounds, status?.recommendedPipeline || "auto"),
          patientName: trainingPayload.patientName,
          patientId: trainingPayload.patientId,
          studyInstanceUID: trainingPayload.studyInstanceUID,
          seriesInstanceUID: trainingPayload.seriesInstanceUID,
          acquired: trainingPayload.acquired,
        })
      );
      formData.append("annotations", JSON.stringify(trainingPayload));

      if (!usingCachedStudy) {
        appendReconstructionFilesToFormData(formData, activeReconstruction);
      }

      await waitForAnimationFrame();
      const response = await fetch("/api/eat/backend/feedback", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (payload.tools) {
        state.backend.status = payload.tools;
      }
      if (payload.cache) {
        applyReconstructionBackendCacheEntry(activeReconstruction, payload.cache);
      }
      updateAiBackendUi();
      if (!response.ok) {
        throw new Error(payload.message || "Reference-standard submission failed.");
      }

      setStatus(
        payload.message ||
          `Stored ${trainingPayload.summary.confirmedSliceCount} confirmed slice${
            trainingPayload.summary.confirmedSliceCount === 1 ? "" : "s"
          } as a local reference-standard case.`,
        payload.profileUpdated === false ? "warning" : undefined
      );
      return payload;
    } finally {
      state.backend.trainingSubmitting = false;
      updateAiBackendUi();
    }
  }

  function transferSegmentationToCompatibleReconstructions() {
    const sourceReconstruction = getActiveReconstruction();
    if (!sourceReconstruction || !state.volume) {
      throw new Error("Load a study before transferring segmentation.");
    }

    if (!hasTransferredSegmentation(sourceReconstruction)) {
      throw new Error("Draw or segment at least one contour before transferring to other reconstructions.");
    }

    function imagePointToPatientPoint(record, point) {
      if (!hasTransferGeometry(record) || !point) {
        return null;
      }

      const rowSpacing = Number(record.pixelSpacing?.[0]) || 1;
      const columnSpacing = Number(record.pixelSpacing?.[1]) || 1;
      return [
        record.imagePositionPatient[0] +
          record.rowDirection[0] * point.x * columnSpacing +
          record.columnDirection[0] * point.y * rowSpacing,
        record.imagePositionPatient[1] +
          record.rowDirection[1] * point.x * columnSpacing +
          record.columnDirection[1] * point.y * rowSpacing,
        record.imagePositionPatient[2] +
          record.rowDirection[2] * point.x * columnSpacing +
          record.columnDirection[2] * point.y * rowSpacing,
      ];
    }

    function patientPointToImagePoint(record, patientPoint) {
      if (!hasTransferGeometry(record) || !Array.isArray(patientPoint) || patientPoint.length < 3) {
        return null;
      }

      const offset = subtractVectors(patientPoint, record.imagePositionPatient);
      const rowSpacing = Number(record.pixelSpacing?.[0]) || 1;
      const columnSpacing = Number(record.pixelSpacing?.[1]) || 1;
      return {
        x: dot(offset, record.rowDirection) / columnSpacing,
        y: dot(offset, record.columnDirection) / rowSpacing,
      };
    }

    function mapContourPointsByPatientGeometry(sourceRecord, targetRecord, points, targetVolume) {
      if (!hasTransferGeometry(sourceRecord) || !hasTransferGeometry(targetRecord) || !targetVolume) {
        return null;
      }

      let insideCount = 0;
      const mappedPoints = points
        .map((point) => {
          const patientPoint = imagePointToPatientPoint(sourceRecord, point);
          const imagePoint = patientPointToImagePoint(targetRecord, patientPoint);
          if (!imagePoint || !Number.isFinite(imagePoint.x) || !Number.isFinite(imagePoint.y)) {
            return null;
          }
          if (
            imagePoint.x >= -0.5 &&
            imagePoint.x <= targetVolume.columns - 0.5 &&
            imagePoint.y >= -0.5 &&
            imagePoint.y <= targetVolume.rows - 0.5
          ) {
            insideCount += 1;
          }
          return clampPointToVolume(imagePoint, targetVolume);
        })
        .filter(Boolean);

      if (mappedPoints.length < 3 || insideCount / mappedPoints.length < 0.55 || polygonArea(mappedPoints) < 12) {
        return null;
      }

      return mappedPoints;
    }

    function mapContourPointsByCenteredScaling(sourceVolume, targetVolume, points) {
      if (!sourceVolume || !targetVolume) {
        return cloneContourPoints(points || []);
      }

      const sourceCenterX = (sourceVolume.columns - 1) / 2;
      const sourceCenterY = (sourceVolume.rows - 1) / 2;
      const targetCenterX = (targetVolume.columns - 1) / 2;
      const targetCenterY = (targetVolume.rows - 1) / 2;
      const sourceRowSpacing = Number(sourceVolume.rowSpacing) || 1;
      const sourceColumnSpacing = Number(sourceVolume.columnSpacing) || 1;
      const targetRowSpacing = Number(targetVolume.rowSpacing) || 1;
      const targetColumnSpacing = Number(targetVolume.columnSpacing) || 1;

      return points.map((point) =>
        clampPointToVolume(
          {
            x: targetCenterX + ((point.x - sourceCenterX) * sourceColumnSpacing) / targetColumnSpacing,
            y: targetCenterY + ((point.y - sourceCenterY) * sourceRowSpacing) / targetRowSpacing,
          },
          targetVolume
        )
      );
    }

    function getSortedContourSliceIndices(reconstruction, bounds) {
      return Array.from(reconstruction?.contours?.keys?.() || [])
        .map((sliceIndex) => Number(sliceIndex))
        .filter(
          (sliceIndex) => Number.isFinite(sliceIndex) && (!bounds || (sliceIndex >= bounds.start && sliceIndex <= bounds.end))
        )
        .sort((left, right) => left - right);
    }

    function getSliceRatioWithinBounds(sliceIndex, bounds) {
      if (!bounds || bounds.count <= 1) {
        return 0;
      }
      return clamp((sliceIndex - bounds.start) / (bounds.count - 1), 0, 1);
    }

    function buildTransferSourceLabel(leftSliceIndex, rightSliceIndex, transferMode) {
      const prefix = transferMode === "approximate" ? "Best-effort from" : "Transferred from";
      if (leftSliceIndex === rightSliceIndex) {
        return `${prefix} ${sourceReconstruction.label} slice ${leftSliceIndex + 1}`;
      }
      return `${prefix} ${sourceReconstruction.label} slices ${leftSliceIndex + 1}-${rightSliceIndex + 1}`;
    }

    function getContourSampleForSlicePosition(reconstruction, slicePosition, bounds, sortedSliceIndices) {
      const contourSliceIndices = sortedSliceIndices?.length ? sortedSliceIndices : getSortedContourSliceIndices(reconstruction, bounds);
      if (!contourSliceIndices.length) {
        return null;
      }

      const roundedSliceIndex = clamp(
        Math.round(slicePosition),
        bounds?.start ?? 0,
        bounds?.end ?? Math.max(0, (reconstruction?.volume?.depth || 1) - 1)
      );
      const exactContour = reconstruction.contours.get(roundedSliceIndex);
      if (exactContour) {
        return {
          points: cloneContourPoints(exactContour.points),
          leftSliceIndex: roundedSliceIndex,
          rightSliceIndex: roundedSliceIndex,
          sourceSliceIndex: roundedSliceIndex,
        };
      }

      let leftSliceIndex = contourSliceIndices[0];
      let rightSliceIndex = contourSliceIndices[contourSliceIndices.length - 1];

      for (let index = 0; index < contourSliceIndices.length; index += 1) {
        const contourSliceIndex = contourSliceIndices[index];
        if (contourSliceIndex <= slicePosition) {
          leftSliceIndex = contourSliceIndex;
        }
        if (contourSliceIndex >= slicePosition) {
          rightSliceIndex = contourSliceIndex;
          break;
        }
      }

      const leftContour = reconstruction.contours.get(leftSliceIndex);
      const rightContour = reconstruction.contours.get(rightSliceIndex);
      if (!leftContour && !rightContour) {
        return null;
      }
      if (!leftContour) {
        return {
          points: cloneContourPoints(rightContour.points),
          leftSliceIndex: rightSliceIndex,
          rightSliceIndex,
          sourceSliceIndex: rightSliceIndex,
        };
      }
      if (!rightContour || leftSliceIndex === rightSliceIndex) {
        return {
          points: cloneContourPoints(leftContour.points),
          leftSliceIndex,
          rightSliceIndex: leftSliceIndex,
          sourceSliceIndex: leftSliceIndex,
        };
      }

      const ratio = (slicePosition - leftSliceIndex) / Math.max(1, rightSliceIndex - leftSliceIndex);
      return {
        points: interpolateContourPoints(leftContour.points, rightContour.points, ratio),
        leftSliceIndex,
        rightSliceIndex,
        sourceSliceIndex: clamp(Math.round(slicePosition), leftSliceIndex, rightSliceIndex),
      };
    }

    function mapRangeStateBetweenReconstructions(targetReconstruction) {
      if (!sourceReconstruction?.volume || !targetReconstruction?.volume) {
        return getDefaultRangeState(targetReconstruction?.volume);
      }

      const sourceRangeState = getRangeStateForReconstruction(sourceReconstruction);
      if (!sourceRangeState.rangeConfigured) {
        return getDefaultRangeState(targetReconstruction.volume);
      }

      return normalizeRangeState(
        {
          topSliceIndex: mapIndexByDepthRatio(
            sourceRangeState.topSliceIndex,
            sourceReconstruction.volume.depth,
            targetReconstruction.volume.depth
          ),
          bottomSliceIndex: mapIndexByDepthRatio(
            sourceRangeState.bottomSliceIndex,
            sourceReconstruction.volume.depth,
            targetReconstruction.volume.depth
          ),
          rangeConfigured: true,
        },
        targetReconstruction.volume
      );
    }

    function buildApproximateTransferredContours(targetReconstruction, compatibility) {
      const sourceRangeState = getRangeStateForReconstruction(sourceReconstruction);
      const targetRangeState = mapRangeStateBetweenReconstructions(targetReconstruction);
      const sourceBounds = getSliceBoundsForRangeState(sourceRangeState, sourceReconstruction.volume);
      const targetBounds = getSliceBoundsForRangeState(targetRangeState, targetReconstruction.volume);
      const contourSliceIndices = getSortedContourSliceIndices(sourceReconstruction, sourceBounds);

      if (!sourceBounds || !targetBounds || !contourSliceIndices.length) {
        return {
          contours: new Map(),
          rangeState: targetRangeState,
        };
      }

      const prefersPatientGeometry = Boolean(compatibility?.usesPatientGeometry);
      const contours = withReconstructionSync(targetReconstruction, () => {
        const mappedContours = new Map();
        for (let targetSliceIndex = targetBounds.start; targetSliceIndex <= targetBounds.end; targetSliceIndex += 1) {
          const sliceRatio = getSliceRatioWithinBounds(targetSliceIndex, targetBounds);
          const sourceSlicePosition = sourceBounds.start + sliceRatio * Math.max(0, sourceBounds.count - 1);
          const sampledContour = getContourSampleForSlicePosition(
            sourceReconstruction,
            sourceSlicePosition,
            sourceBounds,
            contourSliceIndices
          );
          if (!sampledContour?.points?.length) {
            continue;
          }

          const sourceRecord =
            sourceReconstruction.records[sampledContour.sourceSliceIndex] ||
            sourceReconstruction.records[sampledContour.leftSliceIndex] ||
            null;
          const targetRecord = targetReconstruction.records[targetSliceIndex] || null;
          const mappedPoints =
            (prefersPatientGeometry
              ? mapContourPointsByPatientGeometry(sourceRecord, targetRecord, sampledContour.points, targetReconstruction.volume)
              : null) ||
            mapContourPointsByCenteredScaling(sourceReconstruction.volume, targetReconstruction.volume, sampledContour.points);

          mappedContours.set(
            targetSliceIndex,
            createContourRecord(mappedPoints, "transferred", {
              sourceSliceIndex: sampledContour.sourceSliceIndex,
              sourceLabel: buildTransferSourceLabel(
                sampledContour.leftSliceIndex,
                sampledContour.rightSliceIndex,
                "approximate"
              ),
            })
          );
        }
        return mappedContours;
      });

      return {
        contours,
        rangeState: targetRangeState,
      };
    }

    const targets = state.reconstructions.filter((reconstruction) => {
      if (reconstruction.id === sourceReconstruction.id) {
        return false;
      }
      return getReconstructionCompatibility(sourceReconstruction, reconstruction).compatible;
    });

    if (!targets.length) {
      throw new Error("No additional reconstructions are available for transfer.");
    }

    let alignedCount = 0;
    let approximateCount = 0;
    let skippedExclusionTargets = 0;
    const sourceRangeState = getRangeStateForReconstruction(sourceReconstruction);

    targets.forEach((target) => {
      const compatibility = getReconstructionCompatibility(sourceReconstruction, target);
      if (compatibility.transferMode === "aligned") {
        target.contours = cloneContourMapForTransfer(sourceReconstruction.contours);
        target.exclusionMasks = cloneExclusionMasksForTransfer(sourceReconstruction.exclusionMasks);
        storeRangeStateOnReconstruction(target, sourceRangeState);
        target.transferMode = "aligned";
        target.transferWarning = null;
        alignedCount += 1;
      } else {
        const mappedTransfer = buildApproximateTransferredContours(target, compatibility);
        target.contours = mappedTransfer.contours;
        target.exclusionMasks = new Map();
        storeRangeStateOnReconstruction(target, mappedTransfer.rangeState);
        target.transferMode = "approximate";
        target.transferWarning = sourceReconstruction.exclusionMasks.size
          ? "Best-effort contour transfer skipped the rubber exclusions. Review and adjust on this reconstruction."
          : "Best-effort contour transfer completed. Review and adjust on this reconstruction.";
        approximateCount += 1;
        if (sourceReconstruction.exclusionMasks.size) {
          skippedExclusionTargets += 1;
        }
      }

      target.metricsCache = new Map();
      target.transferSourceId = sourceReconstruction.id;
      target.transferSourceLabel = sourceReconstruction.label;
    });

    if (state.activeReconstructionId === sourceReconstruction.id) {
      syncActiveReconstructionAliases(sourceReconstruction);
    }

    refreshUi();
    requestRender();
    pushHistorySnapshot("Transferred segmentation");
    const segments = [];
    if (alignedCount) {
      segments.push(`${alignedCount} aligned`);
    }
    if (approximateCount) {
      segments.push(`${approximateCount} best-effort`);
    }
    const suffix = skippedExclusionTargets
      ? " Rubber exclusions were not copied to best-effort reconstructions."
      : "";
    setStatus(
      `Transferred segmentation from ${sourceReconstruction.label} to ${targets.length} reconstruction${targets.length === 1 ? "" : "s"} (${segments.join(", ")}).${suffix}`
    );
  }

  function getExportActionConfig(action) {
    if (action === "image") {
      return {
        title: "Export PNG Report",
        copy: "Assign a Study ID to print on the PNG report before the export starts.",
        hint: "The Study ID is shown on the report header and in the export parameters.",
        confirmLabel: "Export PNG",
        busyLabel: "Exporting PNG...",
      };
    }
    if (action === "csv") {
      return {
        title: "Export CSV",
        copy: "Assign a Study ID to prepend to the CSV rows before the export starts.",
        hint: "The Study ID becomes the first CSV column for reconstruction and slice measurements.",
        confirmLabel: "Export CSV",
        busyLabel: "Exporting CSV...",
      };
    }
    return {
      title: "Finish & Close",
      copy: "Assign a Study ID, export the PNG report and CSV together, then clear the current patient from the viewer.",
      hint: "Finish & Close exports both files, mirrors them into the selected research study outbox when chosen, and resets the viewer for the next patient.",
      confirmLabel: "Finish & Close",
      busyLabel: "Finishing...",
    };
  }

  function getExportStudyDirectoryLabel(studyId) {
    const study = state.export.studies.find((entry) => safeString(entry.id) === safeString(studyId)) || null;
    if (study?.slug) {
      return `exports_outbox/eat/${study.slug}`;
    }
    return "exports_outbox/eat";
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
    els.exportStudyTargetNote.textContent = "Mirrored exports will also be saved to exports_outbox/eat until a study is selected.";
  }

  function applyExportStudyPayload(payload) {
    state.export.studies = Array.isArray(payload?.studies) ? payload.studies : [];
    state.export.currentStudyId = safeString(payload?.currentStudyId) || "";
    if (els.exportStudySelect) {
      exportStudyApi?.populateSelect(els.exportStudySelect, state.export.studies, state.export.currentStudyId, "No study selected");
    }
    updateExportStudyTargetNote();
    updateProjectUi();
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

  async function createExportStudyFromPrompt() {
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

  function updateExportPromptUi() {
    if (!els.exportDialogBackdrop) {
      return;
    }

    const isOpen = Boolean(state.export.promptOpen);
    const isBusy = Boolean(state.export.busy);
    const config = getExportActionConfig(state.export.action);

    document.body.classList.toggle("is-modal-open", isOpen);
    els.exportDialogBackdrop.classList.toggle("is-hidden", !isOpen);
    els.exportDialogBackdrop.setAttribute("aria-hidden", isOpen ? "false" : "true");
    els.exportDialogTitle.textContent = config.title;
    els.exportDialogCopy.textContent = config.copy;
    els.exportDialogHint.textContent = config.hint;

    const nextStudyId = state.export.studyId || "";
    if (els.exportStudyIdInput.value !== nextStudyId) {
      els.exportStudyIdInput.value = nextStudyId;
    }
    if (els.exportStudySelect) {
      exportStudyApi?.populateSelect(els.exportStudySelect, state.export.studies, state.export.currentStudyId, "No study selected");
      els.exportStudySelect.disabled = isBusy;
    }
    if (els.exportStudyCreateInput) {
      els.exportStudyCreateInput.disabled = isBusy;
    }
    if (els.exportStudyCreateButton) {
      els.exportStudyCreateButton.disabled = isBusy;
    }
    updateExportStudyTargetNote();
    els.exportStudyIdInput.disabled = isBusy;
    els.exportDialogCancel.disabled = isBusy;
    els.exportDialogConfirm.disabled = isBusy || !safeString(state.export.studyId);
    els.exportDialogConfirm.textContent = isBusy ? config.busyLabel : config.confirmLabel;
  }

  function openExportPrompt(action) {
    if (!state.reconstructions.length) {
      setStatus("Load a study before exporting.", "warning");
      return;
    }

    state.export.action = action || "image";
    if (!safeString(state.export.studyId)) {
      state.export.studyId = getSuggestedStudyId();
    }
    state.export.promptOpen = true;
    updateExportPromptUi();
    refreshExportStudyOptions().catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not load export studies.", "error");
    });
    window.requestAnimationFrame(() => {
      els.exportStudyIdInput?.focus();
      els.exportStudyIdInput?.select();
    });
  }

  function closeExportPrompt() {
    if (state.export.busy) {
      return;
    }
    state.export.promptOpen = false;
    state.export.action = null;
    updateExportPromptUi();
  }

  async function confirmExportPrompt() {
    const studyId = safeString(state.export.studyId);
    if (!studyId) {
      setStatus("Study ID is required before exporting.", "warning");
      updateExportPromptUi();
      els.exportStudyIdInput?.focus();
      return;
    }

    state.export.busy = true;
    updateExportPromptUi();
    try {
      await runExportAction(state.export.action || "image", studyId);
      state.export.promptOpen = false;
      state.export.action = null;
    } finally {
      state.export.busy = false;
      updateExportPromptUi();
    }
  }

  async function buildActiveExportReport() {
    if (!state.volume) {
      throw new Error("Load a study before exporting.");
    }

    const bounds = getSliceBounds();
    if (!bounds) {
      throw new Error("No export slice range is defined.");
    }

    const firstRecord = state.records[0] || {};
    const rows = [];
    let totalFatPixels = 0;
    let totalHuSum = 0;
    let totalHuSquaredSum = 0;
    let totalVolumeMm3 = 0;
    let totalExcludedVolumeMm3 = 0;
    let reviewed = 0;

    for (let sliceIndex = bounds.start; sliceIndex <= bounds.end; sliceIndex += 1) {
      const contour = getStoredContour(sliceIndex);
      const metrics = contour ? getSliceMetrics(sliceIndex) : null;
      if (contour) {
        reviewed += 1;
      }
      if (metrics) {
        totalFatPixels += metrics.fatPixelCount;
        totalHuSum += metrics.fatHuSum;
        totalHuSquaredSum += metrics.fatHuSquaredSum;
        totalVolumeMm3 += metrics.fatVolumeMm3;
        totalExcludedVolumeMm3 += metrics.excludedVolumeMm3;
      }

      rows.push({
        slice_number: sliceIndex + 1,
        status: describeContourStatus(contour).label,
        contour_source: contour ? getContourSourceText(contour) : "",
        contour_area_mm2: metrics?.contourAreaMm2 ?? null,
        eat_area_mm2: metrics?.fatAreaMm2 ?? null,
        eat_volume_ml: metrics?.fatVolumeMl ?? null,
        eat_pixel_count: metrics?.fatPixelCount ?? null,
        rubber_excluded_area_mm2: metrics?.excludedAreaMm2 ?? null,
        rubber_excluded_volume_ml: metrics?.excludedVolumeMl ?? null,
        rubber_excluded_pixel_count: metrics?.excludedPixelCount ?? null,
        mean_density_hu: metrics?.meanHu ?? null,
        density_sd_hu: metrics?.stdDevHu ?? null,
        min_density_hu: metrics?.minHu ?? null,
        max_density_hu: metrics?.maxHu ?? null,
      });

      if ((sliceIndex - bounds.start + 1) % 10 === 0) {
        await waitForAnimationFrame();
      }
    }

    const activeReconstruction = getActiveReconstruction();

    return {
      reconstruction_id: activeReconstruction?.id || "",
      reconstruction_label: activeReconstruction?.label || state.seriesLabel || firstRecord.seriesDescription || "Series 1",
      transfer_source: activeReconstruction?.transferSourceLabel || "",
      transfer_mode: activeReconstruction?.transferMode || "local",
      transfer_warning: activeReconstruction?.transferWarning || "",
      summary: {
        patient_name: firstRecord.patientName || "Anonymous",
        patient_id: firstRecord.patientId || "",
        series: state.seriesLabel || firstRecord.seriesDescription || "Series 1",
        acquired: combineDateTime(firstRecord),
        total_slices: state.volume.depth,
        top_slice: bounds.start + 1,
        bottom_slice: bounds.end + 1,
        reviewed_slices: reviewed,
        missing_slices: bounds.count - reviewed,
        slice_spacing_mm: state.volume.sliceSpacing,
        row_spacing_mm: state.volume.rowSpacing,
        column_spacing_mm: state.volume.columnSpacing,
        threshold_min_hu: state.huThreshold.min,
        threshold_max_hu: state.huThreshold.max,
        total_eat_volume_ml: totalVolumeMm3 / 1000,
        total_rubber_excluded_volume_ml: totalExcludedVolumeMm3 / 1000,
        mean_eat_density_hu: totalFatPixels ? totalHuSum / totalFatPixels : null,
        sd_eat_density_hu: computeHuStandardDeviation(totalFatPixels, totalHuSum, totalHuSquaredSum),
      },
      slices: rows,
    };
  }

  async function buildCombinedExportReportSet(options) {
    if (!state.reconstructions.length) {
      throw new Error("Load a study before exporting.");
    }

    const exportableReconstructions = getExportableReconstructions();
    if (!exportableReconstructions.length) {
      throw new Error("Transfer or draw segmentation on at least one reconstruction before exporting.");
    }

    const currentActiveReconstruction = getActiveReconstruction();
    const reports = [];

    for (let index = 0; index < exportableReconstructions.length; index += 1) {
      const reconstruction = exportableReconstructions[index];
      setStatus(`Preparing export ${index + 1} / ${exportableReconstructions.length}...`);
      const report = await withReconstructionContext(reconstruction, () => buildActiveExportReport());
      reports.push(report);
      await waitForAnimationFrame();
    }

    const researchStudy = getSelectedExportStudyMetadata();
    return {
      studyId: safeString(options?.studyId) || safeString(state.export.studyId) || "",
      researchStudyId: researchStudy.id || "",
      researchStudyLabel: researchStudy.label || "",
      researchStudyDisplay: researchStudy.displayLabel || "",
      reports,
      referenceReport:
        reports.find((report) => report.reconstruction_id === currentActiveReconstruction?.id) || reports[0],
    };
  }

  function buildCombinedCsv(reportSet) {
    const referenceSummary = reportSet.referenceReport.summary;
    const summaryLines = [
      ["Study ID", reportSet.studyId || ""],
      ["Research Study ID", reportSet.researchStudyId || ""],
      ["Research Study Label", reportSet.researchStudyLabel || ""],
      ["Patient Name", referenceSummary.patient_name],
      ["Patient ID", referenceSummary.patient_id],
      ["Reconstructions Exported", reportSet.reports.length],
      ["Top Slice", referenceSummary.top_slice],
      ["Bottom Slice", referenceSummary.bottom_slice],
      ["Threshold Min HU", referenceSummary.threshold_min_hu],
      ["Threshold Max HU", referenceSummary.threshold_max_hu],
      ["Mean EAT Density HU", referenceSummary.mean_eat_density_hu ?? ""],
      ["SD EAT Density HU", referenceSummary.sd_eat_density_hu ?? ""],
      [],
    ];

    const reconstructionHeader = [
      "study_id",
      "research_study_id",
      "research_study_label",
      "reconstruction",
      "transfer_source",
      "transfer_mode",
      "acquired",
      "total_slices",
      "top_slice",
      "bottom_slice",
      "reviewed_slices",
      "missing_slices",
      "total_eat_volume_ml",
      "total_rubber_excluded_volume_ml",
      "mean_eat_density_hu",
      "sd_eat_density_hu",
    ];
    const sliceHeader = [
      "study_id",
      "research_study_id",
      "research_study_label",
      "reconstruction",
      "transfer_source",
      "transfer_mode",
      "slice_number",
      "status",
      "contour_source",
      "contour_area_mm2",
      "eat_area_mm2",
      "eat_volume_ml",
      "eat_pixel_count",
      "rubber_excluded_area_mm2",
      "rubber_excluded_volume_ml",
      "rubber_excluded_pixel_count",
      "mean_density_hu",
      "density_sd_hu",
      "min_density_hu",
      "max_density_hu",
    ];

    const lines = summaryLines.map((row) => row.map(csvEscape).join(","));
    lines.push(reconstructionHeader.join(","));
    reportSet.reports.forEach((report) => {
      lines.push(
        reconstructionHeader
          .map((key) => {
            if (key === "study_id") {
              return csvEscape(reportSet.studyId || "");
            }
            if (key === "research_study_id") {
              return csvEscape(reportSet.researchStudyId || "");
            }
            if (key === "research_study_label") {
              return csvEscape(reportSet.researchStudyLabel || "");
            }
            if (key === "reconstruction") {
              return csvEscape(report.reconstruction_label);
            }
            if (key === "transfer_source") {
              return csvEscape(report.transfer_source || "");
            }
            if (key === "transfer_mode") {
              return csvEscape(report.transfer_mode || "");
            }
            return csvEscape(report.summary[key] == null ? "" : report.summary[key]);
          })
          .join(",")
      );
    });
    lines.push("");
    lines.push(sliceHeader.join(","));
    reportSet.reports.forEach((report) => {
      report.slices.forEach((slice) => {
        lines.push(
          sliceHeader
            .map((key) => {
              if (key === "study_id") {
                return csvEscape(reportSet.studyId || "");
              }
              if (key === "research_study_id") {
                return csvEscape(reportSet.researchStudyId || "");
              }
              if (key === "research_study_label") {
                return csvEscape(reportSet.researchStudyLabel || "");
              }
              if (key === "reconstruction") {
                return csvEscape(report.reconstruction_label);
              }
              if (key === "transfer_source") {
                return csvEscape(report.transfer_source || "");
              }
              if (key === "transfer_mode") {
                return csvEscape(report.transfer_mode || "");
              }
              return csvEscape(slice[key] == null ? "" : slice[key]);
            })
            .join(",")
        );
      });
    });
    return lines.join("\n");
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (!/[,"\n]/.test(text)) {
      return text;
    }
    return `"${text.replace(/"/g, '""')}"`;
  }

  function formatTransferModeLabel(transferMode) {
    if (transferMode === "aligned") {
      return "Aligned";
    }
    if (transferMode === "approximate") {
      return "Best effort";
    }
    return "Local";
  }

  function getRepresentativeSliceIndices() {
    const bounds = getSliceBounds();
    if (!bounds) {
      return [];
    }

    const candidates = [bounds.start, Math.round((bounds.start + bounds.end) / 2), bounds.end];
    const unique = [];
    candidates.forEach((sliceIndex) => {
      if (!unique.includes(sliceIndex)) {
        unique.push(sliceIndex);
      }
    });
    return unique;
  }

  function getReportRowForSlice(report, sliceIndex) {
    return report.slices.find((row) => row.slice_number === sliceIndex + 1) || null;
  }

  function drawReportCard(ctx, x, y, width, height, label, value, accent) {
    ctx.save();
    ctx.beginPath();
    drawRoundedRectPath(ctx, x, y, width, height, 24);
    ctx.fillStyle = "rgba(11, 19, 26, 0.86)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = accent || "#5ed6c3";
    ctx.font = "600 13px Aptos, Segoe UI, sans-serif";
    ctx.fillText(label, x + 20, y + 24);

    ctx.fillStyle = "#f4f8fb";
    ctx.font = "700 28px Aptos Display, Aptos, Segoe UI, sans-serif";
    ctx.fillText(value, x + 20, y + 62);
    ctx.restore();
  }

  function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    let line = "";
    let offsetY = 0;

    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + offsetY);
        line = word;
        offsetY += lineHeight;
      } else {
        line = test;
      }
    });

    if (line) {
      ctx.fillText(line, x, y + offsetY);
      offsetY += lineHeight;
    }

    return offsetY;
  }

  function drawExportSlicePanel(ctx, report, sliceIndex, x, y, width, height) {
    const row = getReportRowForSlice(report, sliceIndex);
    const contour = getStoredContour(sliceIndex);
    const panelPadding = 18;
    const titleY = y + 22;

    ctx.save();
    ctx.beginPath();
    drawRoundedRectPath(ctx, x, y, width, height, 24);
    ctx.fillStyle = "rgba(10, 17, 24, 0.9)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#f4f8fb";
    ctx.font = "700 18px Aptos, Segoe UI, sans-serif";
    ctx.fillText(`Slice ${sliceIndex + 1}`, x + panelPadding, titleY);

    ctx.fillStyle = "#9fb6c7";
    ctx.font = "500 12px Aptos, Segoe UI, sans-serif";
    ctx.fillText(row?.status || "Pending", x + panelPadding, titleY + 22);

    const imageAreaX = x + panelPadding;
    const imageAreaY = y + 66;
    const imageAreaWidth = width - panelPadding * 2;
    const imageAreaHeight = Math.min(height - 170, width - panelPadding * 2);
    const scale = Math.min(imageAreaWidth / state.volume.columns, imageAreaHeight / state.volume.rows);
    const drawWidth = state.volume.columns * scale;
    const drawHeight = state.volume.rows * scale;
    const geometry = {
      originX: imageAreaX + (imageAreaWidth - drawWidth) / 2,
      originY: imageAreaY + (imageAreaHeight - drawHeight) / 2,
      drawWidth,
      drawHeight,
      scale,
    };

    ctx.fillStyle = "#020609";
    ctx.fillRect(imageAreaX, imageAreaY, imageAreaWidth, imageAreaHeight);

    const sliceCanvas = renderSlicePixels(sliceIndex, state.volume);
    ctx.drawImage(sliceCanvas, geometry.originX, geometry.originY, geometry.drawWidth, geometry.drawHeight);

    if (contour?.points?.length) {
      const metrics = computeSliceMetricsForPoints(sliceIndex, contour.points, { createOverlay: true });
      drawThresholdOverlay(ctx, geometry, metrics);
      drawContour(ctx, geometry, contour);
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.font = "600 15px Aptos, Segoe UI, sans-serif";
      const emptyText = "No contour on this slice";
      const textWidth = ctx.measureText(emptyText).width;
      ctx.fillText(emptyText, imageAreaX + (imageAreaWidth - textWidth) / 2, imageAreaY + imageAreaHeight / 2);
    }

    const metricsY = imageAreaY + imageAreaHeight + 26;
    ctx.fillStyle = "#dbe6ec";
    ctx.font = "600 13px Aptos, Segoe UI, sans-serif";
    ctx.fillText(
      `EAT Volume: ${row?.eat_volume_ml != null ? `${formatNumber(row.eat_volume_ml, 3)} mL` : "-"}`,
      x + panelPadding,
      metricsY
    );
    ctx.fillText(
      `Mean Density: ${row?.mean_density_hu != null ? `${formatNumber(row.mean_density_hu, 1)} HU` : "-"}`,
      x + panelPadding,
      metricsY + 22
    );
    ctx.fillStyle = "#95adbc";
    ctx.font = "500 12px Aptos, Segoe UI, sans-serif";
    ctx.fillText(
      `Density SD: ${row?.density_sd_hu != null ? `${formatNumber(row.density_sd_hu, 1)} HU` : "-"}`,
      x + panelPadding,
      metricsY + 44
    );
    ctx.fillText(
      `Thresholded Area: ${row?.eat_area_mm2 != null ? `${formatNumber(row.eat_area_mm2, 1)} mm²` : "-"}`,
      x + panelPadding,
      metricsY + 66
    );
    ctx.fillText(
      `Rubber Excluded: ${row?.rubber_excluded_volume_ml != null ? `${formatNumber(row.rubber_excluded_volume_ml, 3)} mL` : "-"}`,
      x + panelPadding,
      metricsY + 88
    );
    ctx.restore();
  }

  function drawReconstructionSummaryTable(ctx, reportSet, x, y, width) {
    const headerHeight = 38;
    const rowHeight = 34;
    const columnX = {
      reconstruction: x + 20,
      volume: x + Math.round(width * 0.5),
      density: x + Math.round(width * 0.68),
      reviewed: x + Math.round(width * 0.82),
      source: x + Math.round(width * 0.91),
    };

    ctx.save();
    ctx.beginPath();
    drawRoundedRectPath(ctx, x, y, width, headerHeight + rowHeight * reportSet.reports.length + 18, 28);
    ctx.fillStyle = "rgba(11, 19, 26, 0.82)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.stroke();

    ctx.fillStyle = "#f4f8fb";
    ctx.font = "700 18px Aptos, Segoe UI, sans-serif";
    ctx.fillText("Reconstruction Results", x + 20, y + 28);

    ctx.fillStyle = "#95adbc";
    ctx.font = "600 12px Aptos, Segoe UI, sans-serif";
    ctx.fillText("Reconstruction", columnX.reconstruction, y + headerHeight + 6);
    ctx.fillText("Volume", columnX.volume, y + headerHeight + 6);
    ctx.fillText("Density", columnX.density, y + headerHeight + 6);
    ctx.fillText("Reviewed", columnX.reviewed, y + headerHeight + 6);
    ctx.fillText("Transfer", columnX.source, y + headerHeight + 6);

    reportSet.reports.forEach((report, rowIndex) => {
      const top = y + headerHeight + 16 + rowIndex * rowHeight;
      if (rowIndex > 0) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
        ctx.beginPath();
        ctx.moveTo(x + 18, top - 10);
        ctx.lineTo(x + width - 18, top - 10);
        ctx.stroke();
      }

      ctx.fillStyle = report.reconstruction_id === reportSet.referenceReport.reconstruction_id ? "#f4f8fb" : "#d8e5ec";
      ctx.font = "600 13px Aptos, Segoe UI, sans-serif";
      ctx.fillText(report.reconstruction_label, columnX.reconstruction, top + 8);

      ctx.fillStyle = "#d8e5ec";
      ctx.font = "500 13px Aptos, Segoe UI, sans-serif";
      ctx.fillText(`${formatNumber(report.summary.total_eat_volume_ml, 3)} mL`, columnX.volume, top + 8);
      ctx.fillText(
        report.summary.mean_eat_density_hu != null
          ? `${formatNumber(report.summary.mean_eat_density_hu, 1)} ± ${formatNumber(report.summary.sd_eat_density_hu, 1)} HU`
          : "-",
        columnX.density,
        top + 8
      );
      ctx.fillText(
        `${report.summary.reviewed_slices} / ${report.summary.reviewed_slices + report.summary.missing_slices}`,
        columnX.reviewed,
        top + 8
      );
      ctx.fillText(formatTransferModeLabel(report.transfer_mode), columnX.source, top + 8);
    });
    ctx.restore();

    return headerHeight + rowHeight * reportSet.reports.length + 18;
  }

  function buildReportImage(reportSet) {
    const report = reportSet.referenceReport;
    const canvas = document.createElement("canvas");
    const width = 1600;
    const summaryTableHeight = 72 + reportSet.reports.length * 34;
    const parameterBoxHeight = 204;
    const panelY = 546 + summaryTableHeight;
    const panelHeight = 620;
    const height = panelY + panelHeight + 60;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#101a22");
    gradient.addColorStop(1, "#071015");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#f7c87f";
    ctx.font = "700 14px Aptos, Segoe UI, sans-serif";
    ctx.fillText("HAGRad Viewer - EAT Report", 52, 56);

    ctx.fillStyle = "#f4f8fb";
    ctx.font = "700 34px Aptos Display, Aptos, Segoe UI, sans-serif";
    ctx.fillText("Epicardial Adipose Tissue Summary", 52, 96);

    ctx.fillStyle = "#a9bdca";
    ctx.font = "500 15px Aptos, Segoe UI, sans-serif";
    const subtitle = [
      reportSet.studyId ? `Study ID: ${reportSet.studyId}` : "",
      reportSet.researchStudyDisplay ? `Research Study: ${reportSet.researchStudyDisplay}` : "",
      report.summary.patient_name || "Anonymous",
      report.summary.series,
      report.summary.acquired || "Date unavailable",
    ]
      .filter(Boolean)
      .join("  •  ");
    drawWrappedText(ctx, subtitle, 52, 126, 920, 22);

    drawReportCard(ctx, 52, 176, 328, 110, "Total EAT Volume", `${formatNumber(report.summary.total_eat_volume_ml, 3)} mL`, "#5ed6c3");
    drawReportCard(
      ctx,
      398,
      176,
      328,
      110,
      "Mean EAT Density",
      report.summary.mean_eat_density_hu != null ? `${formatNumber(report.summary.mean_eat_density_hu, 1)} HU` : "-",
      "#ffd27f"
    );
    drawReportCard(
      ctx,
      744,
      176,
      328,
      110,
      "Density SD",
      report.summary.sd_eat_density_hu != null ? `${formatNumber(report.summary.sd_eat_density_hu, 1)} HU` : "-",
      "#6ee4ff"
    );
    drawReportCard(
      ctx,
      1090,
      176,
      458,
      110,
      "Review Coverage",
      `${report.summary.reviewed_slices} / ${report.summary.reviewed_slices + report.summary.missing_slices}`,
      "#f58f84"
    );

    const tableHeight = drawReconstructionSummaryTable(ctx, reportSet, 52, 320, width - 104);
    const parameterBoxY = 338 + tableHeight;

    ctx.save();
    ctx.beginPath();
    drawRoundedRectPath(ctx, 52, parameterBoxY, width - 104, parameterBoxHeight, 28);
    ctx.fillStyle = "rgba(11, 19, 26, 0.82)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.stroke();
    ctx.fillStyle = "#f4f8fb";
    ctx.font = "700 18px Aptos, Segoe UI, sans-serif";
    ctx.fillText("Export Parameters", 76, 374 + tableHeight);
    ctx.fillStyle = "#a9bdca";
    ctx.font = "500 14px Aptos, Segoe UI, sans-serif";
    ctx.fillText(`Study ID: ${reportSet.studyId || "-"}`, 76, 406 + tableHeight);
    ctx.fillText(`Research Study: ${reportSet.researchStudyDisplay || "-"}`, 76, 432 + tableHeight);
    ctx.fillText(`Threshold: ${report.summary.threshold_min_hu} to ${report.summary.threshold_max_hu} HU`, 76, 458 + tableHeight);
    ctx.fillText(`Voxel Size: ${formatNumber(report.summary.row_spacing_mm, 3)} x ${formatNumber(report.summary.column_spacing_mm, 3)} x ${formatNumber(report.summary.slice_spacing_mm, 3)} mm`, 76, 484 + tableHeight);
    ctx.fillText(`Rubber Excluded: ${formatNumber(report.summary.total_rubber_excluded_volume_ml, 3)} mL`, 76, 510 + tableHeight);
    ctx.fillText(`Reference Reconstruction: ${report.reconstruction_label}`, 550, 406 + tableHeight);
    ctx.fillText(`Density SD: ${report.summary.sd_eat_density_hu != null ? `${formatNumber(report.summary.sd_eat_density_hu, 1)} HU` : "-"}`, 550, 432 + tableHeight);
    ctx.fillText(`Transfer Mode: ${formatTransferModeLabel(report.transfer_mode)}`, 900, 432 + tableHeight);
    ctx.fillText(
      report.transfer_warning || "Use the CSV export for the full slice-by-slice measurement table across all reconstructions.",
      550,
      458 + tableHeight
    );
    ctx.restore();

    const sliceIndices = getRepresentativeSliceIndices();
    const gap = 24;
    const panelWidth = Math.floor((width - 104 - gap * (sliceIndices.length - 1)) / Math.max(1, sliceIndices.length));

    sliceIndices.forEach((sliceIndex, panelIndex) => {
      const panelX = 52 + panelIndex * (panelWidth + gap);
      drawExportSlicePanel(ctx, report, sliceIndex, panelX, panelY, panelWidth, panelHeight);
    });

    ctx.fillStyle = "#859baa";
    ctx.font = "500 12px Aptos, Segoe UI, sans-serif";
    ctx.fillText("Workflow support only. Not a validated diagnostic reporting tool.", 52, height - 36);

    return canvas;
  }

  async function exportReportImage(reportSet) {
    const referenceReconstruction = getReconstructionById(reportSet.referenceReport.reconstruction_id);
    const canvas = referenceReconstruction
      ? await withReconstructionContext(referenceReconstruction, () => Promise.resolve(buildReportImage(reportSet)))
      : buildReportImage(reportSet);
    const filename = buildExportFilename("hagrad_viewer_eat_workflow_report", "png", reportSet.studyId);
    return { filename, blob: await canvasToPngBlob(canvas) };
  }

  async function exportReportCsv(reportSet) {
    return {
      filename: buildExportFilename("hagrad_eat", "csv", reportSet.studyId),
      blob: new Blob([buildCombinedCsv(reportSet)], { type: "text/csv;charset=utf-8" }),
    };
  }

  async function exportImage(studyId, options) {
    setStatus("Preparing PNG report...");
    const reportSet = options?.reportSet || (await buildCombinedExportReportSet({ studyId }));
    const imageFile = await exportReportImage(reportSet);
    await downloadExportBundle([imageFile], buildExportFilename("hagrad_viewer_eat_workflow_report", "zip", studyId), {
      patientStudyId: studyId,
    });
    if (!options?.silent) {
      setStatus(`PNG report ZIP export complete for Study ID ${studyId}.`);
    }
    return reportSet;
  }

  async function exportCsv(studyId, options) {
    setStatus("Preparing CSV export...");
    const reportSet = options?.reportSet || (await buildCombinedExportReportSet({ studyId }));
    const csvFile = await exportReportCsv(reportSet);
    await downloadExportBundle([csvFile], buildExportFilename("hagrad_eat", "zip", studyId), {
      patientStudyId: studyId,
    });
    if (!options?.silent) {
      setStatus(`CSV ZIP export complete for Study ID ${studyId}.`);
    }
    return { reportSet };
  }

  async function runExportAction(action, studyId) {
    state.export.studyId = studyId;

    if (action === "image") {
      await exportImage(studyId);
      return;
    }
    if (action === "csv") {
      await exportCsv(studyId);
      return;
    }

    setStatus("Preparing PNG and CSV export...");
    const reportSet = await buildCombinedExportReportSet({ studyId });
    const imageFile = await exportReportImage(reportSet);
    const csvFile = await exportReportCsv(reportSet);
    await downloadExportBundle(
      [imageFile, csvFile],
      buildExportFilename("hagrad_eat_finish_close", "zip", studyId),
      { patientStudyId: studyId }
    );
    clearStudy();
    setStatus(`Finished Study ID ${studyId}. ZIP bundle exported, and the current patient was closed.`);
  }

  async function exportSession() {
    if (!state.reconstructions.length) {
      throw new Error("Load a study before saving a session.");
    }

    const payload = JSON.stringify(buildSessionExport(), null, 2);
    const filename = buildExportFilename("hagrad_eat_session", "json");
    await downloadExportBundle(
      [{ filename, blob: new Blob([payload], { type: "application/json;charset=utf-8" }) }],
      window.HAGRadZip?.zipNameFrom ? window.HAGRadZip.zipNameFrom(filename) : buildExportFilename("hagrad_eat_session", "zip")
    );
    setStatus("Session ZIP export complete.");
  }

  function finalizePointerInteraction() {
    if (!state.dragging) {
      return;
    }

    const drag = state.dragging;
    state.dragging = null;
    updateCanvasCursor();

    if (drag.type === "draw") {
      if (drag.points.length < 6 || polygonArea(drag.points) < 30) {
        setStatus("Contour was too small to save. Trace a larger closed loop.", "warning");
        requestRender();
        return;
      }
      setContour(state.currentSliceIndex, drag.points, getStoredContour(state.currentSliceIndex) ? "edited" : "drawn");
      setStatus(`Saved contour for slice ${state.currentSliceIndex + 1}.`);
      return;
    }

    if ((drag.type === "handle" || drag.type === "translate") && drag.previewPoints?.length) {
      setContour(state.currentSliceIndex, drag.previewPoints, "edited");
      setStatus(`Updated contour for slice ${state.currentSliceIndex + 1}.`);
      return;
    }

    if (drag.type === "erase") {
      if (drag.changed) {
        refreshContourOutputs();
        pushHistorySnapshot("Updated rubber exclusions");
        setStatus(`Rubber exclusions updated for slice ${state.currentSliceIndex + 1}.`);
      } else {
        requestRender();
      }
      return;
    }

    requestRender();
  }

  function handleCanvasPointerDown(event) {
    if (!state.volume) {
      return;
    }

    const viewportSize = {
      width: els.canvasShell.clientWidth,
      height: els.canvasShell.clientHeight,
    };
    const geometry = getViewportGeometry(viewportSize, state.volume);
    const canvasPoint = eventToCanvasPoint(event, els.canvas);
    const imagePoint = canvasToImagePoint(canvasPoint, geometry, state.volume);

    if (event.button === 2) {
      state.dragging = {
        type: "secondaryPending",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startSliceIndex: state.currentSliceIndex,
      };
      els.canvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      return;
    }

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
      els.canvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (state.activeTool === "windowLevel") {
      state.dragging = {
        type: "windowLevel",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startWidth: state.currentVOI.width,
        startCenter: state.currentVOI.center,
      };
      els.canvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      return;
    }

    if (state.activeTool === "pan") {
      state.dragging = {
        type: "pan",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: state.view.panX,
        startPanY: state.view.panY,
      };
      els.canvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      return;
    }

    if (state.activeTool === "zoom") {
      state.dragging = {
        type: "zoom",
        pointerId: event.pointerId,
        startClientY: event.clientY,
        startZoom: state.view.zoom,
        focusCanvasPoint: canvasPoint,
      };
      els.canvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      return;
    }

    if (!imagePoint?.inside) {
      return;
    }

    state.hoverImagePoint = clampPointToImage(imagePoint);

    if (state.activeTool === "erase") {
      if (!getStoredContour(state.currentSliceIndex)) {
        setStatus("Copy, segment, or draw a contour before using the Rubber tool.", "warning");
        return;
      }

      const startPoint = clampPointToImage(imagePoint);
      const changed = applyEraseBrushStroke(
        state.currentSliceIndex,
        startPoint,
        startPoint,
        state.eraseBrushRadius
      );
      state.dragging = {
        type: "erase",
        pointerId: event.pointerId,
        sliceIndex: state.currentSliceIndex,
        lastImagePoint: startPoint,
        changed,
      };
      els.canvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      requestRender();
      return;
    }

    if (state.activeTool === "contour") {
      state.dragging = {
        type: "draw",
        pointerId: event.pointerId,
        sliceIndex: state.currentSliceIndex,
        points: [clampPointToImage(imagePoint)],
      };
      els.canvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      requestRender();
      return;
    }

    if (state.activeTool === "edit") {
      const contour = getStoredContour(state.currentSliceIndex);
      if (!contour) {
        setStatus("Copy a neighbor contour or draw one before adjusting.", "warning");
        return;
      }

      const handleHit = findHandleHit(contour.points, imagePoint, geometry);
      if (handleHit) {
        state.dragging = {
          type: "handle",
          pointerId: event.pointerId,
          sliceIndex: state.currentSliceIndex,
          startImagePoint: clampPointToImage(imagePoint),
          pointIndex: handleHit.pointIndex,
          originalPoints: cloneContourPoints(contour.points),
          previewPoints: cloneContourPoints(contour.points),
        };
        els.canvas.setPointerCapture?.(event.pointerId);
        updateCanvasCursor();
        requestRender();
        return;
      }

      if (pointInPolygon(contour.points, imagePoint.x, imagePoint.y)) {
        state.dragging = {
          type: "translate",
          pointerId: event.pointerId,
          sliceIndex: state.currentSliceIndex,
          startImagePoint: clampPointToImage(imagePoint),
          originalPoints: cloneContourPoints(contour.points),
          previewPoints: cloneContourPoints(contour.points),
        };
        els.canvas.setPointerCapture?.(event.pointerId);
        updateCanvasCursor();
        requestRender();
      }
    }
  }

  function handleCanvasPointerMove(event) {
    const viewportSize = {
      width: els.canvasShell.clientWidth,
      height: els.canvasShell.clientHeight,
    };
    const geometry = getViewportGeometry(viewportSize, state.volume);
    const canvasPoint = eventToCanvasPoint(event, els.canvas);
    const rawImagePoint = canvasToImagePoint(canvasPoint, geometry, state.volume);
    state.hoverImagePoint = rawImagePoint?.inside ? clampPointToImage(rawImagePoint) : null;

    if (!state.dragging || state.dragging.pointerId !== event.pointerId) {
      if (state.activeTool === "erase") {
        requestRender();
      }
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
      state.currentPreset = null;
      state.currentVOI = {
        width: clamp(state.dragging.startWidth + (event.clientX - state.dragging.startClientX) * 4, 1, 4000),
        center: clamp(state.dragging.startCenter + (state.dragging.startClientY - event.clientY) * 2, -1200, 3000),
      };
      updateVoiUi();
      requestRender();
      return;
    }

    if (state.dragging.type === "pan") {
      state.view.panX = state.dragging.startPanX + (event.clientX - state.dragging.startClientX);
      state.view.panY = state.dragging.startPanY + (event.clientY - state.dragging.startClientY);
      requestRender();
      return;
    }

    if (state.dragging.type === "zoom") {
      const deltaY = state.dragging.startClientY - event.clientY;
      const factor = Math.exp(deltaY / 180);
      setZoom(state.dragging.startZoom * factor, state.dragging.focusCanvasPoint);
      return;
    }

    if (!rawImagePoint?.inside) {
      return;
    }

    const imagePoint = clampPointToImage(rawImagePoint);

    if (state.dragging.type === "erase") {
      const changed = applyEraseBrushStroke(
        state.dragging.sliceIndex,
        state.dragging.lastImagePoint,
        imagePoint,
        state.eraseBrushRadius
      );
      state.dragging.lastImagePoint = imagePoint;
      state.dragging.changed = state.dragging.changed || changed;
      requestRender();
      return;
    }

    if (state.dragging.type === "draw") {
      const lastPoint = state.dragging.points[state.dragging.points.length - 1];
      if (!lastPoint || distanceBetweenPoints(lastPoint, imagePoint) >= 0.8) {
        state.dragging.points.push(imagePoint);
        requestRender();
      }
      return;
    }

    if (state.dragging.type === "handle") {
      const delta = {
        x: imagePoint.x - state.dragging.startImagePoint.x,
        y: imagePoint.y - state.dragging.startImagePoint.y,
      };
      state.dragging.previewPoints = moveContourHandle(state.dragging.originalPoints, state.dragging.pointIndex, delta);
      requestRender();
      return;
    }

    if (state.dragging.type === "translate") {
      const delta = {
        x: imagePoint.x - state.dragging.startImagePoint.x,
        y: imagePoint.y - state.dragging.startImagePoint.y,
      };
      state.dragging.previewPoints = translateContourPoints(state.dragging.originalPoints, delta);
      requestRender();
    }
  }

  function handleCanvasPointerUp(event) {
    if (!state.dragging || state.dragging.pointerId !== event.pointerId) {
      return;
    }
    els.canvas.releasePointerCapture?.(event.pointerId);
    finalizePointerInteraction();
  }

  function handleCanvasPointerLeave() {
    if (state.activeTool === "erase" && !state.dragging) {
      state.hoverImagePoint = null;
      requestRender();
    }
  }

  function handleCanvasWheel(event) {
    if (!state.volume) {
      return;
    }
    event.preventDefault();
    if (event.ctrlKey || event.metaKey || state.activeTool === "zoom") {
      changeZoom(event.deltaY < 0 ? 1.1 : 0.9, eventToCanvasPoint(event, els.canvas));
      return;
    }
    const direction = event.deltaY > 0 ? 1 : -1;
    setCurrentSliceIndex(state.currentSliceIndex + direction);
  }

  function bindStaticEvents() {
    const toggleCompareMode = () => {
      if (!getCompareCandidates().length) {
        setStatus("Load at least one additional reconstruction to enable compare mode.", "warning");
        return;
      }
      state.compareMode = !state.compareMode;
      ensureValidCompareSelection();
      refreshUi();
      requestRender();
      pushHistorySnapshot("Updated compare mode");
      setStatus(`Compare mode ${state.compareMode ? "enabled" : "disabled"}.`);
    };

    const transferSegmentationWithFeedback = () => {
      try {
        transferSegmentationToCompatibleReconstructions();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Segmentation transfer failed.", "error");
      }
    };

    const setCurrentSliceAsTop = () => {
      if (!state.volume) {
        return;
      }
      state.topSliceIndex = state.currentSliceIndex;
      commitRangeSelection({ markConfigured: true });
      setStatus(`Top slice set to ${state.currentSliceIndex + 1}.`);
    };

    const setCurrentSliceAsBottom = () => {
      if (!state.volume) {
        return;
      }
      state.bottomSliceIndex = state.currentSliceIndex;
      commitRangeSelection({ markConfigured: true });
      setStatus(`Bottom slice set to ${state.currentSliceIndex + 1}.`);
    };

    const copyContourWithFeedback = (direction) => {
      try {
        copyContourFrom(direction);
      } catch (error) {
        console.error(error);
        setStatus(error.message || `Could not copy ${direction < 0 ? "previous" : "next"} contour.`, "error");
      }
    };

    const runAutoSegmentationWithFeedback = () => {
      autoSegmentSelectedRange().catch((error) => {
        console.error(error);
        setStatus(error.message || "Auto-segmentation failed.", "error");
      });
    };

    const runAutomaticEatWithFeedback = () => {
      runAutomaticEatSegmentation().catch((error) => {
        console.error(error);
        setStatus(error.message || "Automatic EAT failed.", "error");
      });
    };

    const runAiAutoSegmentationWithFeedback = () => {
      runAiAutoSegmentation().catch((error) => {
        console.error(error);
        setStatus(error.message || "AI auto segmentation failed.", "error");
      });
    };

    const sendTrainingFeedbackWithFeedback = () => {
      sendTrainingFeedback().catch((error) => {
        console.error(error);
        setStatus(error.message || "Training feedback submission failed.", "error");
      });
    };

    const refreshProjectsWithFeedback = () => {
      refreshProjectCatalog().catch((error) => {
        console.error(error);
        setStatus(error.message || "Project refresh failed.", "error");
      });
    };

    const createProjectWithFeedback = () => {
      createProjectFromInput().catch((error) => {
        console.error(error);
        setStatus(error.message || "Project creation failed.", "error");
      });
    };

    const saveProjectSessionWithFeedback = () => {
      saveProjectSessionToServer().catch((error) => {
        console.error(error);
        setStatus(error.message || "Project session save failed.", "error");
      });
    };

    const clearCurrentSliceExclusions = () => {
      if (!state.volume) {
        return;
      }
      if (!clearSliceExclusions(state.currentSliceIndex)) {
        setStatus(`No rubber exclusions to clear on slice ${state.currentSliceIndex + 1}.`, "warning");
        return;
      }
      refreshContourOutputs();
      pushHistorySnapshot("Cleared rubber exclusions");
      setStatus(`Cleared rubber exclusions for slice ${state.currentSliceIndex + 1}.`);
    };

    const clearCurrentSliceContour = () => {
      if (!state.volume) {
        return;
      }
      if (!getStoredContour(state.currentSliceIndex)) {
        setStatus(`No contour to clear on slice ${state.currentSliceIndex + 1}.`, "warning");
        return;
      }
      clearContour(state.currentSliceIndex);
      setStatus(`Cleared contour for slice ${state.currentSliceIndex + 1}.`);
    };

    const toggleThresholdOverlay = () => {
      state.showThresholdOverlay = !state.showThresholdOverlay;
      updateThresholdUi();
      requestRender();
      pushHistorySnapshot("Toggled threshold overlay");
      setStatus(`Threshold overlay ${state.showThresholdOverlay ? "enabled" : "disabled"}.`);
    };

    els.dicomInput.addEventListener("change", async (event) => {
      try {
        await importReconstructionsFromFiles(event.target.files, { mode: "replace" });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Failed to load DICOM files.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.reconInput.addEventListener("change", async (event) => {
      try {
        await importReconstructionsFromFiles(event.target.files, { mode: "append" });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Failed to add reconstruction files.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.dicomFolderInput.addEventListener("change", async (event) => {
      try {
        await importReconstructionsFromFiles(event.target.files, { mode: "replace" });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Failed to load DICOM folder.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.reconFolderInput.addEventListener("change", async (event) => {
      try {
        await importReconstructionsFromFiles(event.target.files, { mode: "append" });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Failed to add reconstruction folder.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.clearButton.addEventListener("click", clearStudy);
    els.undoButton.addEventListener("click", undoHistory);
    els.redoButton.addEventListener("click", redoHistory);
    els.saveSessionButton.addEventListener("click", async () => {
      try {
        await exportSession();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Session export failed.", "error");
      }
    });
    els.sessionInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        loadSessionFromObject(parsed);
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Session import failed.", "error");
      } finally {
        event.target.value = "";
      }
    });
    els.projectRefreshButton?.addEventListener("click", refreshProjectsWithFeedback);
    els.projectSelect?.addEventListener("change", () => {
      selectProject(els.projectSelect.value).catch((error) => {
        console.error(error);
        setStatus(error.message || "Project selection failed.", "error");
      });
    });
    els.projectNextCaseButton?.addEventListener("click", () => {
      requestNextProjectCaseId().catch((error) => {
        console.error(error);
        setStatus(error.message || "Could not assign the next case ID.", "error");
      });
    });
    els.projectNameInput?.addEventListener("input", updateProjectUi);
    els.projectCreateButton?.addEventListener("click", createProjectWithFeedback);
    els.projectSaveSessionButton?.addEventListener("click", saveProjectSessionWithFeedback);
    ["change", "blur"].forEach((eventName) => {
      els.projectCaseIdInput?.addEventListener(eventName, () => {
        state.project.caseId = safeString(els.projectCaseIdInput.value) || "";
        updateProjectUi();
      });
      els.projectCaseLabelInput?.addEventListener(eventName, () => {
        state.project.caseLabel = safeString(els.projectCaseLabelInput.value) || "";
        updateProjectUi();
      });
    });
    els.compareToggleButton.addEventListener("click", toggleCompareMode);
    els.compareSelect.addEventListener("change", () => {
      state.compareReconstructionId = safeString(els.compareSelect.value);
      ensureValidCompareSelection();
      refreshUi();
      requestRender();
      pushHistorySnapshot("Changed comparison reconstruction");
      const compareReconstruction = getCompareReconstruction();
      if (compareReconstruction) {
        setStatus(`Comparison reconstruction set to ${compareReconstruction.label}.`);
      }
    });
    els.transferReconstructionsButton.addEventListener("click", transferSegmentationWithFeedback);
    els.setTopButton.addEventListener("click", setCurrentSliceAsTop);
    els.setBottomButton.addEventListener("click", setCurrentSliceAsBottom);
    els.rangeResetButton.addEventListener("click", useFullStackRange);
    els.nextPendingButton.addEventListener("click", jumpToNextPendingSlice);

    ["change", "blur"].forEach((eventName) => {
      els.topSliceInput.addEventListener(eventName, applyRangeInputs);
      els.bottomSliceInput.addEventListener(eventName, applyRangeInputs);
      els.eraseRadiusInput.addEventListener(eventName, () => {
        try {
          setEraseRadius(els.eraseRadiusInput.value);
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Invalid rubber radius.", "error");
          updateEraseUi();
        }
      });
      els.thresholdMinInput.addEventListener(eventName, () => {
        try {
          setHuThresholds(els.thresholdMinInput.value, els.thresholdMaxInput.value, { announce: true });
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Invalid threshold values.", "error");
          updateThresholdUi();
        }
      });
      els.thresholdMaxInput.addEventListener(eventName, () => {
        try {
          setHuThresholds(els.thresholdMinInput.value, els.thresholdMaxInput.value, { announce: true });
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Invalid threshold values.", "error");
          updateThresholdUi();
        }
      });
      els.windowWidthInput.addEventListener(eventName, applyVoiFromInputs);
      els.windowCenterInput.addEventListener(eventName, applyVoiFromInputs);
      els.sliceNumberInput?.addEventListener(eventName, () => {
        if (!state.volume) {
          return;
        }
        setCurrentSliceIndex((Number.parseInt(els.sliceNumberInput.value, 10) || 1) - 1);
      });
    });

    [
      els.windowWidthInput,
      els.windowCenterInput,
      els.sliceNumberInput,
      els.topSliceInput,
      els.bottomSliceInput,
      els.eraseRadiusInput,
      els.thresholdMinInput,
      els.thresholdMaxInput,
      els.projectCaseIdInput,
      els.projectCaseLabelInput,
      els.projectNameInput,
    ]
      .filter(Boolean)
      .forEach((input) => {
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (input === els.projectNameInput) {
              createProjectWithFeedback();
              return;
            }
            input.blur();
          }
        });
      });

    els.exportStudyIdInput.addEventListener("input", () => {
      state.export.studyId = safeString(els.exportStudyIdInput.value) || "";
      updateExportPromptUi();
    });
    els.exportStudyIdInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        confirmExportPrompt().catch((error) => {
          console.error(error);
          setStatus(error.message || "Export failed.", "error");
        });
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeExportPrompt();
      }
    });
    els.exportStudySelect?.addEventListener("change", () => {
      handleExportStudySelectionChange().catch((error) => {
        console.error(error);
        setStatus(error.message || "Could not change export study.", "error");
      });
    });
    els.exportStudyCreateButton?.addEventListener("click", () => {
      createExportStudyFromPrompt().catch((error) => {
        console.error(error);
        setStatus(error.message || "Could not create export study.", "error");
      });
    });
    els.exportStudyCreateInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        createExportStudyFromPrompt().catch((error) => {
          console.error(error);
          setStatus(error.message || "Could not create export study.", "error");
        });
      }
    });

    els.toolButtons.forEach((button) => {
      button.addEventListener("click", () => setActiveTool(button.dataset.tool));
    });

    els.presetButtons.forEach((button) => {
      button.addEventListener("click", () => applyPreset(button.dataset.preset));
    });
    els.erasePresetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const presetRadius = ERASE_BRUSH_PRESETS[button.dataset.erasePreset];
        if (!Number.isFinite(presetRadius)) {
          return;
        }
        setEraseRadius(presetRadius);
        setStatus(`Rubber size set to ${button.textContent.trim().toLowerCase()} (${presetRadius}px).`);
      });
    });

    els.copyPrevButton.addEventListener("click", () => copyContourWithFeedback(-1));
    els.copyNextButton.addEventListener("click", () => copyContourWithFeedback(1));
    els.segmentButton.addEventListener("click", runAutoSegmentationWithFeedback);
    els.autoEatButton.addEventListener("click", runAutomaticEatWithFeedback);
    els.aiSegmentButton.addEventListener("click", runAiAutoSegmentationWithFeedback);
    els.sendTrainingButton.addEventListener("click", sendTrainingFeedbackWithFeedback);
    els.aiBackendRefreshButton?.addEventListener("click", () => {
      refreshEatBackendStatus().catch((error) => {
        console.error(error);
        setStatus(error.message || "AI backend refresh failed.", "error");
      });
    });
    els.clearEraseButton.addEventListener("click", clearCurrentSliceExclusions);
    els.clearContourButton.addEventListener("click", clearCurrentSliceContour);
    els.thresholdDefaultsButton.addEventListener("click", () => {
      setHuThresholds(DEFAULT_HU_THRESHOLD.min, DEFAULT_HU_THRESHOLD.max, { announce: false });
      setStatus(`Threshold reset to ${getThresholdLabel()}.`);
    });
    els.thresholdToggleButton.addEventListener("click", toggleThresholdOverlay);

    els.zoomOutButton.addEventListener("click", () => changeZoom(0.9));
    els.zoomInButton.addEventListener("click", () => changeZoom(1.1));
    els.resetViewButton.addEventListener("click", resetView);
    els.presentationResetWindowButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetPresentationWindowing();
    });
    els.presentationResetFitButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetView();
    });
    els.presentationFocusToggleButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      togglePresentationFocus();
    });
    els.presentationFocusExitButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setPresentationFocus(false);
    });
    els.focusWorkflowButtons?.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleFocusSidebarGroup(button.dataset.focusSidebarGroup);
      });
    });
    els.focusFinishCloseButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openExportPrompt("finish-close");
    });

    els.sliceSlider?.addEventListener("input", () => {
      setCurrentSliceIndex(Number(els.sliceSlider.value));
    });

    els.presentationFastScrollSlider?.addEventListener("input", () => {
      setCurrentSliceIndex(Number(els.presentationFastScrollSlider.value));
    });

    els.finishCloseButton.addEventListener("click", () => openExportPrompt("finish-close"));
    els.exportImageButton.addEventListener("click", () => openExportPrompt("image"));
    els.exportCsvButton.addEventListener("click", () => openExportPrompt("csv"));
    els.exportDialogCancel.addEventListener("click", closeExportPrompt);
    els.exportDialogConfirm.addEventListener("click", () => {
      confirmExportPrompt().catch((error) => {
        console.error(error);
        setStatus(error.message || "Export failed.", "error");
      });
    });
    els.exportDialogBackdrop.addEventListener("click", (event) => {
      if (event.target === els.exportDialogBackdrop) {
        closeExportPrompt();
      }
    });

    els.canvas.addEventListener("pointerdown", handleCanvasPointerDown);
    els.canvas.addEventListener("pointermove", handleCanvasPointerMove);
    els.canvas.addEventListener("pointerleave", handleCanvasPointerLeave);
    els.canvas.addEventListener("pointerup", handleCanvasPointerUp);
    els.canvas.addEventListener("pointercancel", handleCanvasPointerUp);
    els.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    els.canvas.addEventListener("wheel", handleCanvasWheel, { passive: false });

    ["dragenter", "dragover"].forEach((eventName) => {
      els.canvasShell.addEventListener(eventName, (event) => {
        event.preventDefault();
      });
    });

    els.canvasShell.addEventListener("drop", async (event) => {
      event.preventDefault();
      try {
        const droppedFiles =
          (await window.HAGRadCore?.collectDroppedFiles?.(event.dataTransfer)) ||
          Array.from(event.dataTransfer?.files || []);
        await importReconstructionsFromFiles(droppedFiles, { mode: "replace" });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Failed to load dropped DICOM files.", "error");
      }
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (
        state.presentationFocus &&
        state.focusSidebarOpen &&
        !els.sidebar?.contains(target) &&
        !target.closest?.(".presentation-focus-dock") &&
        !target.closest?.(".viewport-mini-actions")
      ) {
        setFocusSidebarOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (state.export.promptOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeExportPrompt();
        }
        return;
      }

      const tagName = event.target?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
        return;
      }

      if (event.key === "Escape") {
        if (state.focusSidebarOpen) {
          event.preventDefault();
          setFocusSidebarOpen(false);
          return;
        }
        if (state.presentationFocus && state.activeTool === "contour") {
          event.preventDefault();
          setPresentationFocus(false);
          return;
        }
      }

      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "z" && event.shiftKey) {
          event.preventDefault();
          redoHistory();
          return;
        }
        if (key === "z") {
          event.preventDefault();
          undoHistory();
          return;
        }
        if (key === "y") {
          event.preventDefault();
          redoHistory();
          return;
        }
      }

      if (!state.volume) {
        return;
      }

      const key = event.key;
      const lowerKey = key.toLowerCase();

      if (key === "ArrowUp" || key === "ArrowLeft" || key === "PageUp") {
        event.preventDefault();
        setCurrentSliceIndex(state.currentSliceIndex - 1);
      } else if (key === "ArrowDown" || key === "ArrowRight" || key === "PageDown") {
        event.preventDefault();
        setCurrentSliceIndex(state.currentSliceIndex + 1);
      } else if (lowerKey === "w") {
        setActiveTool("windowLevel");
      } else if (lowerKey === "c") {
        setActiveTool("contour");
      } else if (lowerKey === "e") {
        setActiveTool("edit");
      } else if (lowerKey === "r") {
        setActiveTool("erase");
      } else if (lowerKey === "m" || lowerKey === "p") {
        setActiveTool("pan");
      } else if (lowerKey === "z") {
        setActiveTool("zoom");
      } else if (key === "," || key === "<") {
        event.preventDefault();
        copyContourWithFeedback(-1);
      } else if (key === "." || key === ">") {
        event.preventDefault();
        copyContourWithFeedback(1);
      } else if (key === "[") {
        event.preventDefault();
        setCurrentSliceAsTop();
      } else if (key === "]") {
        event.preventDefault();
        setCurrentSliceAsBottom();
      } else if (lowerKey === "f") {
        event.preventDefault();
        useFullStackRange();
      } else if (lowerKey === "g") {
        event.preventDefault();
        runAutoSegmentationWithFeedback();
      } else if (lowerKey === "a") {
        event.preventDefault();
        runAutomaticEatWithFeedback();
      } else if (lowerKey === "i") {
        event.preventDefault();
        runAiAutoSegmentationWithFeedback();
      } else if (lowerKey === "k") {
        event.preventDefault();
        sendTrainingFeedbackWithFeedback();
      } else if (lowerKey === "t") {
        event.preventDefault();
        transferSegmentationWithFeedback();
      } else if (lowerKey === "v") {
        event.preventDefault();
        toggleCompareMode();
      } else if (lowerKey === "o") {
        event.preventDefault();
        toggleThresholdOverlay();
      } else if (lowerKey === "n") {
        event.preventDefault();
        jumpToNextPendingSlice();
      } else if (lowerKey === "x" && event.shiftKey) {
        event.preventDefault();
        clearCurrentSliceExclusions();
      } else if (lowerKey === "x" || key === "Delete" || key === "Backspace") {
        event.preventDefault();
        clearCurrentSliceContour();
      } else if (key === "-" || key === "_") {
        event.preventDefault();
        changeZoom(0.9);
      } else if (key === "=" || key === "+") {
        event.preventDefault();
        changeZoom(1.1);
      } else if (key === "0") {
        event.preventDefault();
        resetView();
      } else if (key === "Escape") {
        event.preventDefault();
        if (state.presentationFocus && state.activeTool === "contour") {
          setPresentationFocus(false);
        } else {
          returnToPrimaryTool();
        }
      }
    });

    window.addEventListener("resize", requestRender);
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => requestRender());
      observer.observe(els.canvasShell);
    }
  }

  function initialize() {
    cacheElements();
    initializeDecoderFallback();
    bindStaticEvents();
    updatePresentationFocusUi();
    refreshUi();
    setStatus("Ready for axial CT reconstructions");
    refreshEatBackendStatus({ silent: true }).catch(() => {});
    refreshExportStudyOptions().catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not load export studies.", "error");
    });
    requestRender();
  }

  window.addEventListener("DOMContentLoaded", initialize);
})();
