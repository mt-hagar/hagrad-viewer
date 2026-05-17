(function () {
  "use strict";

  const sharedCore = window.HAGRadCore;
  if (!sharedCore) {
    throw new Error("Missing shared core script: /src/shared/hagrad-core.js");
  }

  const {
    safeString,
    naturalCompare,
    parseNumericArray,
    parseFirstNumber,
    prettifyPatientName,
    dot,
    normalize,
    getNormalVector,
    combineDateTime,
    sanitizeFilePart,
    collectDroppedFiles,
    waitForAnimationFrame,
  } = sharedCore;

  const SUPPORTED_TRANSFER_SYNTAXES = new Set([
    "1.2.840.10008.1.2",
    "1.2.840.10008.1.2.1",
    "1.2.840.10008.1.2.2",
  ]);

  const VOI_PRESETS = {
    calcium: { width: 650, center: 200 },
    soft: { width: 400, center: 40 },
    bone: { width: 1800, center: 350 },
  };

  const TOOLS = {
    roiAdjust: "ROI Adjust",
    roiContour: "ROI Draw",
    tapLabel: "Tap Label",
    voiDraw: "VOI Draw",
    inspect: "Inspect",
    exclude: "Exclude Lesion",
    add: "Add Brush",
    erase: "Erase Brush",
    grow: "Grow",
    shrink: "Shrink",
  };
  const VIEWER_MODE_LABELS = {
    edit: "Edit",
    windowLevel: "WW/WL",
    pan: "Pan",
    zoom: "Zoom",
  };
  const VIEWER_MODE_CURSORS = {
    edit: "crosshair",
    windowLevel: "crosshair",
    pan: "grab",
    zoom: "zoom-in",
  };

  const LABELS = [
    { code: 1, key: "LAD", label: "LAD", coronary: true, color: [255, 113, 122, 148], stroke: "#ff717a" },
    { code: 2, key: "LCX", label: "LCx", coronary: true, color: [92, 214, 255, 148], stroke: "#5cd6ff" },
    { code: 3, key: "RCA", label: "RCA", coronary: true, color: [247, 200, 127, 152], stroke: "#f7c87f" },
    { code: 4, key: "LM", label: "LM", coronary: true, color: [143, 230, 171, 152], stroke: "#8fe6ab" },
    { code: 5, key: "AORTIC_VALVE", label: "Aortic Valve", coronary: false, color: [216, 138, 255, 150], stroke: "#d88aff" },
    { code: 6, key: "MITRAL_VALVE", label: "Mitral Valve", coronary: false, color: [255, 111, 201, 150], stroke: "#ff6fc9" },
    { code: 7, key: "AORTIC_ROOT", label: "Aortic Root", coronary: false, color: [255, 154, 98, 150], stroke: "#ff9a62" },
    { code: 8, key: "OTHER", label: "Other", coronary: false, color: [161, 179, 191, 148], stroke: "#a1b3bf" },
  ];
  const LABELS_BY_CODE = new Map(LABELS.map((entry) => [entry.code, entry]));
  const CORONARY_LABEL_CODES = LABELS.filter((entry) => entry.coronary).map((entry) => entry.code);

  const COLORS = {
    selected: [255, 186, 99, 190],
    roi: "rgba(240, 197, 114, 0.86)",
    roiFill: "rgba(240, 197, 114, 0.06)",
    voi: "rgba(255, 154, 98, 0.92)",
    brush: "rgba(255, 186, 99, 0.92)",
    outline: "rgba(255, 255, 255, 0.22)",
    text: "#eff7fb",
    muted: "#a7bcc8",
  };

  const state = {
    studyRecords: [],
    seriesCandidates: [],
    selectedSeriesId: null,
    activeSeriesId: null,
    activeVolume: null,
    activeRecords: [],
    activeSeriesMeta: null,
    activeSliceIndex: 0,
    roiContours: new Map(),
    currentPreset: "calcium",
    currentVOI: { ...VOI_PRESETS.calcium },
    workflowStep: "series",
    overlayVisible: true,
    roiVisible: true,
    tool: "tapLabel",
    view: {
      zoom: 1,
      panX: 0,
      panY: 0,
      interactionMode: "edit",
    },
    selectedLabelCode: 1,
    voiAction: "include",
    slabRange: {
      start: 0,
      end: 0,
    },
    voiDraftPoints: [],
    brushRadiusPx: 12,
    renderQueued: false,
    canvasGeometry: null,
    pointer: {
      imageX: null,
      imageY: null,
      pixelIndex: null,
      hu: null,
      inside: false,
    },
    dragging: null,
    decoderFallbackReady: false,
    finishModalOpen: false,
    exportStudy: {
      currentStudyId: "",
      studies: [],
    },
    analysis: {
      thresholdHu: 130,
      minAreaMm2: 1,
      massCalibrationFactor: 0.81,
      roi: {
        centerXPercent: 50,
        centerYPercent: 48,
        widthPercent: 56,
        heightPercent: 44,
        angleDeg: 0,
        showAdvancedHandles: false,
      },
      scoringSlices: {
        top: 0,
        bottom: 0,
      },
      autoMaskSlices: [],
      autoLabelSlices: [],
      overrideLabelSlices: [],
      labelSlices: [],
      maskSlices: [],
      componentLookupBySlice: [],
      components: [],
      activeComponentId: null,
      results: null,
      detectionStamp: 0,
    },
  };

  const RESAMPLED_CONTOUR_POINTS = 48;
  const WORKFLOW_CONFIG = {
    series: { sectionKey: "seriesSection" },
    score: { sectionKey: "detectionSection" },
    roi: { sectionKey: "roiSection", tool: "roiAdjust" },
    label: { sectionKey: "labelSection", tool: "tapLabel" },
    edit: { sectionKey: "editingSection", tool: "tapLabel" },
    export: { sectionKey: "resultsSection" },
  };

  const els = {};
  const exportStudyApi = window.HAGRadExportStudies || null;

  function cacheElements() {
    els.dicomInput = document.getElementById("dicom-input");
    els.dicomFolderInput = document.getElementById("dicom-folder-input");
    els.dicomAddInput = document.getElementById("dicom-add-input");
    els.clearButton = document.getElementById("clear-button");
    els.finishCloseButton = document.getElementById("finish-close-button");
    els.statusPill = document.getElementById("status-pill");
    els.workflowNote = document.getElementById("workflow-note");
    els.workflowButtons = Array.from(document.querySelectorAll("[data-workflow-step]"));
    els.seriesSummary = document.getElementById("series-summary");
    els.seriesList = document.getElementById("series-list");
    els.loadSelectedSeriesButton = document.getElementById("load-selected-series-button");
    els.detectionNote = document.getElementById("detection-note");
    els.thresholdSlider = document.getElementById("threshold-slider");
    els.thresholdReadout = document.getElementById("threshold-readout");
    els.minAreaSlider = document.getElementById("min-area-slider");
    els.minAreaReadout = document.getElementById("min-area-readout");
    els.massFactorInput = document.getElementById("mass-factor-input");
    els.scoreRangeReadout = document.getElementById("score-range-readout");
    els.scoreTopSliceInput = document.getElementById("score-top-slice-input");
    els.scoreBottomSliceInput = document.getElementById("score-bottom-slice-input");
    els.setScoreTopButton = document.getElementById("set-score-top-button");
    els.setScoreBottomButton = document.getElementById("set-score-bottom-button");
    els.useFullScoreRangeButton = document.getElementById("use-full-score-range-button");
    els.roiXSlider = document.getElementById("roi-x-slider");
    els.roiYSlider = document.getElementById("roi-y-slider");
    els.roiWidthSlider = document.getElementById("roi-width-slider");
    els.roiHeightSlider = document.getElementById("roi-height-slider");
    els.runDetectionButton = document.getElementById("run-detection-button");
    els.restoreAutoButton = document.getElementById("restore-auto-button");
    els.editingNote = document.getElementById("editing-note");
    els.roiAnchorReadout = document.getElementById("roi-anchor-readout");
    els.segmentRoiButton = document.getElementById("segment-roi-button");
    els.clearRoiSliceButton = document.getElementById("clear-roi-slice-button");
    els.activeLabelSelect = document.getElementById("active-label-select");
    els.labelLegend = document.getElementById("label-legend");
    els.labelNote = document.getElementById("label-note");
    els.voiActionSelect = document.getElementById("voi-action-select");
    els.slabStartInput = document.getElementById("slab-start-input");
    els.slabEndInput = document.getElementById("slab-end-input");
    els.setSlabStartButton = document.getElementById("set-slab-start-button");
    els.setSlabEndButton = document.getElementById("set-slab-end-button");
    els.applyVoiButton = document.getElementById("apply-voi-button");
    els.clearVoiButton = document.getElementById("clear-voi-button");
    els.toolButtons = Array.from(document.querySelectorAll("[data-tool]"));
    els.brushSlider = document.getElementById("brush-slider");
    els.brushReadout = document.getElementById("brush-readout");
    els.toggleOverlayButton = document.getElementById("toggle-overlay-button");
    els.toggleRoiButton = document.getElementById("toggle-roi-button");
    els.clearSelectionButton = document.getElementById("clear-selection-button");
    els.resultsNote = document.getElementById("results-note");
    els.metricLesions = document.getElementById("metric-lesions");
    els.metricVolume = document.getElementById("metric-volume");
    els.metricMass = document.getElementById("metric-mass");
    els.metricAgatston = document.getElementById("metric-agatston");
    els.resultsTableBody = document.getElementById("results-table-body");
    els.exportCsvButton = document.getElementById("export-csv-button");
    els.exportPngButton = document.getElementById("export-png-button");
    els.viewerTitle = document.getElementById("viewer-title");
    els.viewerSubtitle = document.getElementById("viewer-subtitle");
    els.sliceBadge = document.getElementById("slice-badge");
    els.toolBadge = document.getElementById("tool-badge");
    els.pointerBadge = document.getElementById("pointer-badge");
    els.presetButtons = Array.from(document.querySelectorAll("[data-preset]"));
    els.canvasWrap = document.getElementById("canvas-wrap");
    els.presentationResetWindowButton = document.getElementById("presentation-reset-window-button");
    els.presentationResetFitButton = document.getElementById("presentation-reset-fit-button");
    els.imageCanvas = document.getElementById("image-canvas");
    els.overlayCanvas = document.getElementById("overlay-canvas");
    els.canvasOverlayMessage = document.getElementById("canvas-overlay-message");
    els.sliceSlider = document.getElementById("slice-slider");
    els.selectionReadout = document.getElementById("selection-readout");
    els.interactionReadout = document.getElementById("interaction-readout");
    els.lesionList = document.getElementById("lesion-list");
    els.lesionNote = document.getElementById("lesion-note");
    els.metadataList = document.getElementById("metadata-list");
    els.metadataNote = document.getElementById("metadata-note");
    els.seriesSection = document.getElementById("series-section");
    els.detectionSection = document.getElementById("detection-section");
    els.roiSection = document.getElementById("roi-section");
    els.labelSection = document.getElementById("label-section");
    els.editingSection = document.getElementById("editing-section");
    els.resultsSection = document.getElementById("results-section");
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

  function setStatus(message, tone) {
    els.statusPill.textContent = message;
    els.statusPill.classList.toggle("is-warning", tone === "warning");
    els.statusPill.classList.toggle("is-error", tone === "error");
  }

  function getTrimmedStudyId() {
    return String(els.finishStudyIdInput?.value || "").trim();
  }

  function getExportStudyDirectoryLabel(studyId) {
    const study = state.exportStudy.studies.find((entry) => safeString(entry.id) === safeString(studyId)) || null;
    if (study?.slug) {
      return `exports_outbox/calcscorer/${study.slug}`;
    }
    return "exports_outbox/calcscorer";
  }

  function getSelectedExportStudyMetadata() {
    const study = state.exportStudy.studies.find((entry) => safeString(entry.id) === safeString(state.exportStudy.currentStudyId)) || null;
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
    const currentStudyId = safeString(state.exportStudy.currentStudyId);
    const study = state.exportStudy.studies.find((entry) => safeString(entry.id) === currentStudyId) || null;
    if (study) {
      els.exportStudyTargetNote.textContent = `Mirrored exports will also be saved to ${getExportStudyDirectoryLabel(study.id)}.`;
      return;
    }
    els.exportStudyTargetNote.textContent = "Mirrored exports will also be saved to exports_outbox/calcscorer until a study is selected.";
  }

  function applyExportStudyPayload(payload) {
    state.exportStudy.studies = Array.isArray(payload?.studies) ? payload.studies : [];
    state.exportStudy.currentStudyId = safeString(payload?.currentStudyId) || "";
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
    state.exportStudy.currentStudyId = safeString(payload?.id) || "";
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
    state.exportStudy.currentStudyId = safeString(created?.id) || "";
    await refreshExportStudyOptions();
    setStatus(`Selected export study ${created?.label || state.exportStudy.currentStudyId}.`, null);
  }

  function openFinishModal() {
    if (!els.finishModal) {
      return;
    }
    state.finishModalOpen = true;
    els.finishModal.hidden = false;
    if (els.finishModalError) {
      els.finishModalError.hidden = true;
    }
    refreshExportStudyOptions().catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not load export studies.", "error");
    });
    window.requestAnimationFrame(() => {
      els.finishStudyIdInput?.focus();
      els.finishStudyIdInput?.select();
    });
  }

  function closeFinishModal() {
    if (!els.finishModal) {
      return;
    }
    state.finishModalOpen = false;
    els.finishModal.hidden = true;
    if (els.finishModalError) {
      els.finishModalError.hidden = true;
    }
  }

  function roundTo(value, decimals) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatMm(value) {
    return Number.isFinite(value) ? `${roundTo(value, 1).toFixed(1)} mm` : "-";
  }

  function formatMm2(value) {
    return Number.isFinite(value) ? `${roundTo(value, 1).toFixed(1)} mm2` : "-";
  }

  function formatMm3(value) {
    return Number.isFinite(value) ? `${roundTo(value, 1).toFixed(1)} mm3` : "-";
  }

  function formatMg(value) {
    return Number.isFinite(value) ? `${roundTo(value, 2).toFixed(2)} mg` : "-";
  }

  function formatScore(value) {
    return Number.isFinite(value) ? `${roundTo(value, 1).toFixed(1)}` : "-";
  }

  function setActiveTool(tool, options) {
    if (!TOOLS[tool]) {
      return;
    }
    state.tool = tool;
    if (options?.preserveViewerMode !== true) {
      state.view.interactionMode = "edit";
    }
    if (options?.sync !== false) {
      syncControlsFromState();
      updateSelectionUi();
      updateCanvasCursor();
      requestRender();
    }
  }

  function setViewerMode(mode, options) {
    if (!VIEWER_MODE_LABELS[mode]) {
      return;
    }
    state.view.interactionMode = mode;
    if (options?.sync !== false) {
      updateSelectionUi();
      updateCanvasCursor();
      requestRender();
    }
  }

  function getWorkflowSection(step) {
    const config = WORKFLOW_CONFIG[step];
    return config ? els[config.sectionKey] : null;
  }

  function setWorkflowStep(step, options) {
    if (!WORKFLOW_CONFIG[step]) {
      return;
    }
    state.workflowStep = step;
    if (options?.adoptTool && WORKFLOW_CONFIG[step].tool) {
      state.tool = WORKFLOW_CONFIG[step].tool;
      state.view.interactionMode = "edit";
    }

    const section = getWorkflowSection(step);
    if (section && typeof section.open === "boolean") {
      section.open = true;
    }

    syncControlsFromState();
    updateSelectionUi();
    if (options?.scroll && section) {
      window.requestAnimationFrame(() => {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    requestRender();
  }

  function getPrimaryToolForCurrentStep() {
    return WORKFLOW_CONFIG[state.workflowStep]?.tool || state.tool || "tapLabel";
  }

  function returnToPrimaryTool() {
    const primaryTool = getPrimaryToolForCurrentStep();
    state.tool = primaryTool;
    state.view.interactionMode = "edit";
    syncControlsFromState();
    updateSelectionUi();
    updateCanvasCursor();
    requestRender();
  }

  function resetViewTransform(options = {}) {
    state.view.zoom = 1;
    state.view.panX = 0;
    state.view.panY = 0;
    syncControlsFromState();
    updateSelectionUi();
    requestRender();
    if (!options.silent) {
      setStatus("View reset to fit.", null);
    }
  }

  function resetCurrentWindowing(options = {}) {
    state.currentPreset = "calcium";
    state.currentVOI = { ...VOI_PRESETS.calcium };
    syncControlsFromState();
    updateSelectionUi();
    requestRender();
    if (!options.silent) {
      setStatus("Window reset to the calcium preset.", null);
    }
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
      return new Uint8Array(values);
    }
    return new Uint8Array(values || []);
  }

  function cloneMaskSlices(maskSlices) {
    return (maskSlices || []).map((slice) => {
      const copy = new Uint8Array(slice.length);
      copy.set(slice);
      return copy;
    });
  }

  function cloneLabelSlices(labelSlices) {
    return (labelSlices || []).map((slice) => {
      const copy = new Int16Array(slice.length);
      copy.set(slice);
      return copy;
    });
  }

  function getLabelMeta(code) {
    return LABELS_BY_CODE.get(Number(code)) || null;
  }

  function getLabelName(code) {
    return getLabelMeta(code)?.label || "Unknown";
  }

  function createEmptyLabelSlices(value) {
    const volume = state.activeVolume;
    const initialValue = Number.isFinite(value) ? value : 0;
    return Array.from({ length: volume.depth }, () => {
      const slice = new Int16Array(volume.rows * volume.columns);
      if (initialValue) {
        slice.fill(initialValue);
      }
      return slice;
    });
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
    if (!Array.isArray(points) || points.length < 3) {
      return false;
    }
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

  function distanceBetweenPoints(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  function cloneContourPoints(points) {
    return (points || []).map((point) => ({ x: point.x, y: point.y }));
  }

  function clampPointToVolume(point, volume) {
    if (!volume) {
      return { x: point.x, y: point.y };
    }
    return {
      x: clamp(point.x, 0, volume.columns - 1),
      y: clamp(point.y, 0, volume.rows - 1),
    };
  }

  function dedupeContourPoints(points, volume) {
    const deduped = [];
    (points || []).forEach((point) => {
      const nextPoint = clampPointToVolume(point, volume);
      if (!deduped.length || distanceBetweenPoints(deduped[deduped.length - 1], nextPoint) > 0.6) {
        deduped.push(nextPoint);
      }
    });
    if (deduped.length >= 2 && distanceBetweenPoints(deduped[0], deduped[deduped.length - 1]) < 1.2) {
      deduped.pop();
    }
    return deduped;
  }

  function resampleClosedPolygon(points, targetCount, volume) {
    const cleaned = dedupeContourPoints(points, volume);
    if (cleaned.length < 3) {
      return [];
    }

    const segmentLengths = [];
    let perimeter = 0;
    for (let index = 0; index < cleaned.length; index += 1) {
      const current = cleaned[index];
      const next = cleaned[(index + 1) % cleaned.length];
      const length = distanceBetweenPoints(current, next);
      segmentLengths.push(length);
      perimeter += length;
    }

    if (!perimeter) {
      return cleaned;
    }

    const step = perimeter / targetCount;
    const resampled = [];
    let segmentIndex = 0;
    let accumulated = 0;
    let segmentStart = cleaned[0];
    let segmentEnd = cleaned[1 % cleaned.length];
    let segmentLength = segmentLengths[0];

    for (let sampleIndex = 0; sampleIndex < targetCount; sampleIndex += 1) {
      const targetDistance = sampleIndex * step;
      while (accumulated + segmentLength < targetDistance && segmentIndex < cleaned.length - 1) {
        accumulated += segmentLength;
        segmentIndex += 1;
        segmentStart = cleaned[segmentIndex];
        segmentEnd = cleaned[(segmentIndex + 1) % cleaned.length];
        segmentLength = segmentLengths[segmentIndex];
      }

      const localDistance = targetDistance - accumulated;
      const ratio = segmentLength ? localDistance / segmentLength : 0;
      resampled.push(
        clampPointToVolume(
          {
            x: segmentStart.x + (segmentEnd.x - segmentStart.x) * ratio,
            y: segmentStart.y + (segmentEnd.y - segmentStart.y) * ratio,
          },
          volume
        )
      );
    }

    return resampled;
  }

  function smoothClosedPolygon(points, passes, volume) {
    let smoothed = cloneContourPoints(points);
    for (let pass = 0; pass < (passes || 0); pass += 1) {
      smoothed = smoothed.map((point, index) => {
        const previous = smoothed[(index + smoothed.length - 1) % smoothed.length];
        const next = smoothed[(index + 1) % smoothed.length];
        return clampPointToVolume(
          {
            x: previous.x * 0.25 + point.x * 0.5 + next.x * 0.25,
            y: previous.y * 0.25 + point.y * 0.5 + next.y * 0.25,
          },
          volume
        );
      });
    }
    return smoothed;
  }

  function normalizeContourPoints(points, volume) {
    const cleaned = dedupeContourPoints(points, volume);
    if (cleaned.length < 3 || polygonArea(cleaned) < 16) {
      return [];
    }
    return smoothClosedPolygon(resampleClosedPolygon(cleaned, RESAMPLED_CONTOUR_POINTS, volume), 1, volume);
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
    if (!referencePoints?.length || !candidatePoints?.length) {
      return cloneContourPoints(candidatePoints || []);
    }

    let aligned = cloneContourPoints(candidatePoints);
    if ((polygonSignedArea(referencePoints) >= 0) !== (polygonSignedArea(aligned) >= 0)) {
      aligned = aligned.reverse();
    }

    let bestOffset = 0;
    let bestCost = Infinity;
    for (let offset = 0; offset < aligned.length; offset += 1) {
      const cost = getContourAlignmentCost(referencePoints, aligned, offset);
      if (cost < bestCost) {
        bestCost = cost;
        bestOffset = offset;
      }
    }
    return rotateContourPoints(aligned, bestOffset);
  }

  function interpolateContourPoints(leftPoints, rightPoints, ratio, volume) {
    const alignedRight = alignContourToReference(leftPoints, rightPoints);
    return normalizeContourPoints(
      leftPoints.map((point, index) => ({
        x: point.x + (alignedRight[index].x - point.x) * ratio,
        y: point.y + (alignedRight[index].y - point.y) * ratio,
      })),
      volume
    );
  }

  function createRoiContourRecord(points, status, sourceLabel) {
    const normalized = normalizeContourPoints(points, state.activeVolume);
    if (normalized.length < 3) {
      throw new Error("ROI contour needs at least three points.");
    }
    return {
      points: normalized,
      status: status || "anchor",
      sourceLabel: sourceLabel || "",
    };
  }

  function getStoredRoiContour(sliceIndex) {
    return state.roiContours.get(sliceIndex) || null;
  }

  function isManualRoiContour(contour) {
    return Boolean(contour) && contour.status !== "auto";
  }

  function countRoiAnchors() {
    let count = 0;
    state.roiContours.forEach((contour) => {
      if (isManualRoiContour(contour)) {
        count += 1;
      }
    });
    return count;
  }

  function getRecordText(record) {
    return [
      record.seriesDescription,
      record.protocolName,
      record.imageType,
      record.convolutionKernel,
      record.acquisitionContrast,
      record.contrastBolusAgent,
    ]
      .map((value) => String(safeString(value) || "").toLowerCase())
      .filter(Boolean)
      .join(" ");
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
        protocolName: safeString(dataSet.string("x00181030")),
        imageType: safeString(dataSet.string("x00080008")),
        studyInstanceUID: safeString(dataSet.string("x0020000d")),
        seriesInstanceUID: safeString(dataSet.string("x0020000e")),
        frameOfReferenceUID: safeString(dataSet.string("x00200052")),
        seriesNumber: parseFirstNumber(dataSet.string("x00200011")),
        instanceNumber: parseFirstNumber(dataSet.string("x00200013")),
        numberOfFrames: parseFirstNumber(dataSet.string("x00280008")),
        rows: parseFirstNumber(dataSet.string("x00280010")),
        columns: parseFirstNumber(dataSet.string("x00280011")),
        pixelSpacing: parseNumericArray(dataSet.string("x00280030")),
        sliceThickness: parseFirstNumber(dataSet.string("x00180050")),
        reconstructionDiameter: parseFirstNumber(dataSet.string("x00181100")),
        kvp: parseFirstNumber(dataSet.string("x00180060")),
        convolutionKernel: safeString(dataSet.string("x00181210")),
        contrastBolusAgent: safeString(dataSet.string("x00180010")),
        acquisitionContrast: safeString(dataSet.string("x00089209")),
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
        } catch (_error) {
          return null;
        }
      })
    );
    return parsed.filter(Boolean);
  }

  function compareDicomRecords(left, right, normalVector) {
    if (normalVector && left.imagePositionPatient.length >= 3 && right.imagePositionPatient.length >= 3) {
      const positionLeft = dot(left.imagePositionPatient, normalVector);
      const positionRight = dot(right.imagePositionPatient, normalVector);
      if (positionLeft !== positionRight) {
        return positionLeft - positionRight;
      }
    }

    if (
      Number.isFinite(left.instanceNumber) &&
      Number.isFinite(right.instanceNumber) &&
      left.instanceNumber !== right.instanceNumber
    ) {
      return left.instanceNumber - right.instanceNumber;
    }

    return naturalCompare(left.file.name, right.file.name);
  }

  function groupSeries(records) {
    const grouped = new Map();
    records.forEach((record) => {
      const key =
        record.seriesInstanceUID ||
        `${record.studyInstanceUID || "study"}::${record.seriesDescription || "unnamed"}::${record.frameOfReferenceUID || "for"}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(record);
    });

    return Array.from(grouped.entries()).map(([key, group]) => {
      const normalVector = group.find((entry) => entry.normalVector)?.normalVector ?? null;
      group.sort((left, right) => compareDicomRecords(left, right, normalVector));
      const imageRecords = group.filter((record) => record.hasPixelData);
      return {
        key,
        records: group,
        imageRecords,
        pixelCount: imageRecords.length,
      };
    });
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

  function rankSeriesCandidate(group) {
    const first = group.imageRecords[0] || group.records[0];
    const text = getRecordText(first);
    const reasons = [];
    const cautions = [];
    let score = 0;

    if (first?.modality === "CT") {
      score += 25;
      reasons.push("CT modality");
    } else {
      score -= 50;
      cautions.push("not CT modality");
    }

    if (/(calcium|cac|cacs|score)/i.test(text)) {
      score += 42;
      reasons.push("series text suggests calcium scoring");
    }

    if (/(cardiac|heart|coronary)/i.test(text)) {
      score += 18;
      reasons.push("cardiac/coronary wording");
    }

    if (/(non.?contrast|without contrast)/i.test(text)) {
      score += 18;
      reasons.push("non-contrast wording");
    }

    if (first?.acquisitionContrast === "NONE" || !safeString(first?.contrastBolusAgent)) {
      score += 12;
      reasons.push("no contrast metadata seen");
    } else {
      score -= 22;
      cautions.push("contrast metadata present");
    }

    if (/(cta|angi|contrast)/i.test(text)) {
      score -= 30;
      cautions.push("CTA/contrast wording");
    }

    if (/(lung|chest|abd|pelvis|bone|trauma|aorta)/i.test(text)) {
      score -= 14;
      cautions.push("generic chest/body wording");
    }

    if (Number.isFinite(first?.sliceThickness)) {
      if (first.sliceThickness >= 2 && first.sliceThickness <= 3.5) {
        score += 12;
        reasons.push("slice thickness matches common CAC recon");
      } else if (first.sliceThickness > 4.5) {
        score -= 10;
        cautions.push("slice thickness is relatively thick");
      } else if (first.sliceThickness < 1.2) {
        score -= 8;
        cautions.push("very thin recon may be CTA-oriented");
      }
    }

    if ((group.imageRecords?.length || 0) >= 40) {
      score += 8;
      reasons.push("enough slices for a dedicated cardiac stack");
    }

    if (first?.rows >= 256 && first?.columns >= 256) {
      score += 4;
      reasons.push("diagnostic matrix size");
    }

    return {
      score,
      reasons,
      cautions,
    };
  }

  function buildSeriesCandidates(records) {
    return groupSeries(records)
      .filter((group) => group.pixelCount)
      .map((group, index) => {
        const first = group.imageRecords[0];
        const rank = rankSeriesCandidate(group);
        return {
          id: group.key,
          seriesKey: group.key,
          label: first?.seriesDescription || first?.protocolName || `Series ${index + 1}`,
          records: group.imageRecords,
          allRecords: group.records,
          recordCount: group.imageRecords.length,
          studyLabel: first?.patientName || first?.patientId || "Unknown patient",
          acquisitionLabel: combineDateTime(first || {}),
          score: rank.score,
          reasons: rank.reasons,
          cautions: rank.cautions,
          meta: first || null,
          volume: null,
        };
      })
      .sort((left, right) => right.score - left.score || right.recordCount - left.recordCount);
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
      throw new Error("Multi-frame DICOM is not supported in this CalcScorer prototype.");
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
      } catch (_error) {
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

  function getActiveSeries() {
    return state.seriesCandidates.find((candidate) => candidate.id === state.activeSeriesId) || null;
  }

  function getSelectedSeries() {
    return state.seriesCandidates.find((candidate) => candidate.id === state.selectedSeriesId) || null;
  }

  function getVoxelVolumeMm3(volume) {
    return volume.rowSpacing * volume.columnSpacing * volume.sliceSpacing;
  }

  function getPixelAreaMm2(volume) {
    return volume.rowSpacing * volume.columnSpacing;
  }

  function getSliceHuValue(sliceIndex, pixelIndex) {
    const slice = state.activeVolume?.slices?.[sliceIndex];
    if (!slice) {
      return null;
    }
    return slice.pixels[pixelIndex] * slice.slope + slice.intercept;
  }

  function densityFactorForPeakHu(peakHu) {
    if (!Number.isFinite(peakHu) || peakHu < state.analysis.thresholdHu) {
      return 0;
    }
    if (peakHu < 200) {
      return 1;
    }
    if (peakHu < 300) {
      return 2;
    }
    if (peakHu < 400) {
      return 3;
    }
    return 4;
  }

  function extractConnectedComponents2D(mask, width, height, options) {
    if (!(mask instanceof Uint8Array) || !width || !height) {
      return [];
    }

    const visited = new Uint8Array(mask.length);
    const components = [];

    for (let pixelIndex = 0; pixelIndex < mask.length; pixelIndex += 1) {
      if (!mask[pixelIndex] || visited[pixelIndex]) {
        continue;
      }

      const queue = [pixelIndex];
      visited[pixelIndex] = 1;
      const pixels = [];
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      let peakHu = -Infinity;
      let sumHu = 0;
      let sumX = 0;
      let sumY = 0;

      while (queue.length) {
        const current = queue.pop();
        const x = current % width;
        const y = (current - x) / width;
        pixels.push(current);
        sumX += x + 0.5;
        sumY += y + 0.5;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        const hu = options?.sliceIndex != null ? getSliceHuValue(options.sliceIndex, current) : null;
        if (Number.isFinite(hu)) {
          peakHu = Math.max(peakHu, hu);
          sumHu += hu;
        }

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
        pixels,
        pixelCount: pixels.length,
        peakHu,
        meanHu: pixels.length ? sumHu / pixels.length : null,
        minX,
        minY,
        maxX,
        maxY,
        centerX: sumX / Math.max(1, pixels.length),
        centerY: sumY / Math.max(1, pixels.length),
      });
    }

    return components;
  }

  function estimateBodyBounds(volume) {
    if (!volume?.slices?.length) {
      return null;
    }
    const sliceIndex = Math.floor(volume.depth / 2);
    const mask = new Uint8Array(volume.rows * volume.columns);
    for (let pixelIndex = 0; pixelIndex < mask.length; pixelIndex += 1) {
      const hu = getSliceHuValue(sliceIndex, pixelIndex);
      if (hu != null && hu > -300) {
        mask[pixelIndex] = 1;
      }
    }

    const components = extractConnectedComponents2D(mask, volume.columns, volume.rows, { sliceIndex });
    if (!components.length) {
      return null;
    }

    const imageCenterX = volume.columns / 2;
    const imageCenterY = volume.rows / 2;
    const chosen = components.reduce((best, component) => {
      const distanceToCenter = Math.hypot(component.centerX - imageCenterX, component.centerY - imageCenterY);
      const score = component.pixelCount - distanceToCenter * 18;
      if (!best || score > best.score) {
        return { score, component };
      }
      return best;
    }, null)?.component;

    return chosen || null;
  }

  function seedAnalysisRegionFromVolume(volume) {
    const body = estimateBodyBounds(volume);
    if (!body) {
      state.analysis.roi = {
        centerXPercent: 50,
        centerYPercent: 48,
        widthPercent: 56,
        heightPercent: 44,
        angleDeg: 0,
        showAdvancedHandles: false,
      };
      return;
    }

    const bodyWidth = body.maxX - body.minX + 1;
    const bodyHeight = body.maxY - body.minY + 1;
    state.analysis.roi = {
      centerXPercent: clamp((body.centerX / volume.columns) * 100, 24, 76),
      centerYPercent: clamp(((body.centerY - bodyHeight * 0.06) / volume.rows) * 100, 24, 76),
      widthPercent: clamp((bodyWidth / volume.columns) * 62, 32, 76),
      heightPercent: clamp((bodyHeight / volume.rows) * 48, 22, 64),
      angleDeg: 0,
      showAdvancedHandles: false,
    };
  }

  function setRoiContour(sliceIndex, points, status, sourceLabel) {
    state.roiContours.set(sliceIndex, createRoiContourRecord(points, status, sourceLabel));
    refreshDerivedUi();
    requestRender();
  }

  function clearRoiContour(sliceIndex) {
    state.roiContours.delete(sliceIndex);
    refreshDerivedUi();
    requestRender();
  }

  function clearAutoRoiContours() {
    Array.from(state.roiContours.entries()).forEach(([sliceIndex, contour]) => {
      if (contour?.status === "auto") {
        state.roiContours.delete(sliceIndex);
      }
    });
  }

  async function segmentRoiBetweenAnchors() {
    const volume = state.activeVolume;
    if (!volume) {
      throw new Error("Load a CT series before segmenting the ROI.");
    }

    const anchors = Array.from(state.roiContours.entries())
      .filter(([, contour]) => isManualRoiContour(contour))
      .map(([sliceIndex, contour]) => ({ sliceIndex, contour }))
      .sort((left, right) => left.sliceIndex - right.sliceIndex);

    if (!anchors.length) {
      throw new Error("Draw at least one heart ROI contour before segmenting between anchors.");
    }

    clearAutoRoiContours();

    const firstAnchor = anchors[0];
    for (let sliceIndex = 0; sliceIndex < firstAnchor.sliceIndex; sliceIndex += 1) {
      state.roiContours.set(
        sliceIndex,
        createRoiContourRecord(firstAnchor.contour.points, "auto", `ROI auto from slice ${firstAnchor.sliceIndex + 1}`)
      );
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
        const points = interpolateContourPoints(
          leftAnchor.contour.points,
          rightAnchor.contour.points,
          ratio,
          volume
        );
        if (points.length >= 3) {
          state.roiContours.set(
            sliceIndex,
            createRoiContourRecord(
              points,
              "auto",
              `ROI auto from slices ${leftAnchor.sliceIndex + 1}-${rightAnchor.sliceIndex + 1}`
            )
          );
        }
      }
      if ((anchorIndex + 1) % 4 === 0) {
        await waitForAnimationFrame();
      }
    }

    const lastAnchor = anchors[anchors.length - 1];
    for (let sliceIndex = lastAnchor.sliceIndex + 1; sliceIndex < volume.depth; sliceIndex += 1) {
      state.roiContours.set(
        sliceIndex,
        createRoiContourRecord(lastAnchor.contour.points, "auto", `ROI auto from slice ${lastAnchor.sliceIndex + 1}`)
      );
    }

    refreshDerivedUi();
    requestRender();
    runAutoDetection();
    setStatus("Segmented heart ROI between anchor slices and re-ran automatic calcium scoring.", null);
  }

  function getAnalysisRegionInPixels() {
    const volume = state.activeVolume;
    if (!volume) {
      return null;
    }
    const roi = state.analysis.roi;
    const angleDeg = Number.isFinite(roi.angleDeg) ? roi.angleDeg : 0;
    return {
      centerX: (roi.centerXPercent / 100) * volume.columns,
      centerY: (roi.centerYPercent / 100) * volume.rows,
      radiusX: (roi.widthPercent / 100) * volume.columns * 0.5,
      radiusY: (roi.heightPercent / 100) * volume.rows * 0.5,
      angleDeg,
      angleRad: (angleDeg * Math.PI) / 180,
      sliceStart: Math.floor(volume.depth * 0.12),
      sliceEnd: Math.ceil(volume.depth * 0.9) - 1,
    };
  }

  function getScoringSliceRange() {
    const volume = state.activeVolume;
    if (!volume) {
      return null;
    }
    const top = clamp(
      Math.min(state.analysis.scoringSlices.top, state.analysis.scoringSlices.bottom),
      0,
      Math.max(0, volume.depth - 1)
    );
    const bottom = clamp(
      Math.max(state.analysis.scoringSlices.top, state.analysis.scoringSlices.bottom),
      0,
      Math.max(0, volume.depth - 1)
    );
    return { top, bottom };
  }

  function initializeScoringSliceRange(volume) {
    if (!volume) {
      return;
    }
    const defaultTop = clamp(Math.floor(volume.depth * 0.12), 0, Math.max(0, volume.depth - 1));
    const defaultBottom = clamp(Math.ceil(volume.depth * 0.9) - 1, defaultTop, Math.max(0, volume.depth - 1));
    state.analysis.scoringSlices = {
      top: defaultTop,
      bottom: defaultBottom,
    };
  }

  function applyScoringSliceInputs() {
    const volume = state.activeVolume;
    if (!volume) {
      return;
    }
    const maxSlice = Math.max(1, volume.depth);
    const top = clamp((Number.parseInt(els.scoreTopSliceInput.value, 10) || 1) - 1, 0, maxSlice - 1);
    const bottom = clamp((Number.parseInt(els.scoreBottomSliceInput.value, 10) || maxSlice) - 1, 0, maxSlice - 1);
    state.analysis.scoringSlices.top = top;
    state.analysis.scoringSlices.bottom = bottom;
  }

  function useFullScoringSliceRange() {
    const volume = state.activeVolume;
    if (!volume) {
      return;
    }
    state.analysis.scoringSlices.top = 0;
    state.analysis.scoringSlices.bottom = volume.depth - 1;
  }

  function isSliceInsideScoringRange(sliceIndex) {
    const range = getScoringSliceRange();
    return Boolean(range) && sliceIndex >= range.top && sliceIndex <= range.bottom;
  }

  function commitScoringSliceRange(statusMessage) {
    const range = getScoringSliceRange();
    if (!range || !state.activeVolume) {
      return;
    }
    state.activeSliceIndex = clamp(state.activeSliceIndex, range.top, range.bottom);
    state.workflowStep = "score";
    syncControlsFromState();
    requestRender();
    if (state.analysis.detectionStamp > 0) {
      runAutoDetection();
    }
    setStatus(
      statusMessage ||
        (state.analysis.detectionStamp > 0
          ? "Updated the scoring slice range and reapplied automatic quantification."
          : "Updated the scoring slice range. Click Let's Go Segment to start automatic quantification."),
      null
    );
  }

  function pointInsideSliceDetectionMask(sliceIndex, x, y, region) {
    const contour = getStoredRoiContour(sliceIndex);
    if (contour?.points?.length >= 3) {
      return pointInPolygon(contour.points, x + 0.5, y + 0.5);
    }
    return pointInsideAnalysisRegion(x, y, region);
  }

  function pointInsideAnalysisRegion(x, y, region) {
    const offsetX = x + 0.5 - region.centerX;
    const offsetY = y + 0.5 - region.centerY;
    const cosTheta = Math.cos(-(region.angleRad || 0));
    const sinTheta = Math.sin(-(region.angleRad || 0));
    const localX = offsetX * cosTheta - offsetY * sinTheta;
    const localY = offsetX * sinTheta + offsetY * cosTheta;
    const dx = localX / Math.max(region.radiusX, 1);
    const dy = localY / Math.max(region.radiusY, 1);
    return dx * dx + dy * dy <= 1;
  }

  function rotateOffset(offsetX, offsetY, angleRad) {
    const cosTheta = Math.cos(angleRad || 0);
    const sinTheta = Math.sin(angleRad || 0);
    return {
      x: offsetX * cosTheta - offsetY * sinTheta,
      y: offsetX * sinTheta + offsetY * cosTheta,
    };
  }

  function getFallbackRegionHandles(region) {
    const handles = [
      { mode: "move", offsetX: 0, offsetY: 0 },
      { mode: "left", offsetX: -region.radiusX, offsetY: 0 },
      { mode: "right", offsetX: region.radiusX, offsetY: 0 },
      { mode: "top", offsetX: 0, offsetY: -region.radiusY },
      { mode: "bottom", offsetX: 0, offsetY: region.radiusY },
    ];

    if (state.analysis.roi.showAdvancedHandles) {
      handles.push(
        { mode: "topLeft", offsetX: -region.radiusX * 0.7, offsetY: -region.radiusY * 0.7 },
        { mode: "topRight", offsetX: region.radiusX * 0.7, offsetY: -region.radiusY * 0.7 },
        { mode: "bottomLeft", offsetX: -region.radiusX * 0.7, offsetY: region.radiusY * 0.7 },
        { mode: "bottomRight", offsetX: region.radiusX * 0.7, offsetY: region.radiusY * 0.7 },
        { mode: "rotate", offsetX: 0, offsetY: -(region.radiusY + 28) }
      );
    }

    return handles.map((handle) => {
      const rotated = rotateOffset(handle.offsetX, handle.offsetY, region.angleRad || 0);
      return {
        mode: handle.mode,
        x: region.centerX + rotated.x,
        y: region.centerY + rotated.y,
      };
    });
  }

  function getRoiAdjustTolerancePx() {
    const scale = state.canvasGeometry?.scale || 1;
    return Math.max(4, 14 / Math.max(scale, 0.001));
  }

  function getRoiAdjustHit(point) {
    const region = getAnalysisRegionInPixels();
    if (!region) {
      return null;
    }

    const tolerance = getRoiAdjustTolerancePx();
    const handles = getFallbackRegionHandles(region);
    for (const handle of handles) {
      if (Math.hypot(point.imageX + 0.5 - handle.x, point.imageY + 0.5 - handle.y) <= tolerance) {
        return { mode: handle.mode, region };
      }
    }

    if (pointInsideAnalysisRegion(point.imageX, point.imageY, region)) {
      return { mode: "move", region };
    }

    return null;
  }

  function setAnalysisRegionFromPixels(regionPixels) {
    const volume = state.activeVolume;
    if (!volume) {
      return;
    }

    const minRadiusX = Math.max(24, volume.columns * 0.05);
    const minRadiusY = Math.max(22, volume.rows * 0.05);
    let radiusX = clamp(regionPixels.radiusX, minRadiusX, volume.columns / 2 - 2);
    let radiusY = clamp(regionPixels.radiusY, minRadiusY, volume.rows / 2 - 2);
    let centerX = clamp(regionPixels.centerX, radiusX + 1, volume.columns - radiusX - 1);
    let centerY = clamp(regionPixels.centerY, radiusY + 1, volume.rows - radiusY - 1);

    if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || !Number.isFinite(radiusX) || !Number.isFinite(radiusY)) {
      return;
    }

    state.analysis.roi = {
      centerXPercent: clamp((centerX / volume.columns) * 100, 4, 96),
      centerYPercent: clamp((centerY / volume.rows) * 100, 4, 96),
      widthPercent: clamp(((radiusX * 2) / volume.columns) * 100, 10, 98),
      heightPercent: clamp(((radiusY * 2) / volume.rows) * 100, 10, 98),
      angleDeg: state.analysis.roi.angleDeg || 0,
      showAdvancedHandles: Boolean(state.analysis.roi.showAdvancedHandles),
    };
  }

  function applyFallbackRegionDrag(point) {
    const volume = state.activeVolume;
    const drag = state.dragging;
    if (!volume || !drag || drag.type !== "roiAdjust") {
      return;
    }

    const start = drag.startRegion;
    const dx = point.imageX - drag.startPoint.x;
    const dy = point.imageY - drag.startPoint.y;
    let left = start.centerX - start.radiusX;
    let right = start.centerX + start.radiusX;
    let top = start.centerY - start.radiusY;
    let bottom = start.centerY + start.radiusY;
    const minWidth = Math.max(48, volume.columns * 0.1);
    const minHeight = Math.max(44, volume.rows * 0.1);
    const startAngleRad = ((start.angleDeg || 0) * Math.PI) / 180;

    if (drag.mode === "move") {
      setAnalysisRegionFromPixels({
        centerX: start.centerX + dx,
        centerY: start.centerY + dy,
        radiusX: start.radiusX,
        radiusY: start.radiusY,
      });
      return;
    }

    if (drag.mode === "rotate") {
      const startAngle = Math.atan2(drag.startPoint.y - start.centerY, drag.startPoint.x - start.centerX);
      const nextAngle = Math.atan2(point.imageY - start.centerY, point.imageX - start.centerX);
      state.analysis.roi.angleDeg = (start.angleDeg || 0) + ((nextAngle - startAngle) * 180) / Math.PI;
      return;
    }

    const startLocal = rotateOffset(drag.startPoint.x - start.centerX, drag.startPoint.y - start.centerY, -startAngleRad);
    const currentLocal = rotateOffset(point.imageX - start.centerX, point.imageY - start.centerY, -startAngleRad);
    const localDx = currentLocal.x - startLocal.x;
    const localDy = currentLocal.y - startLocal.y;

    if (drag.mode === "left" || drag.mode === "topLeft" || drag.mode === "bottomLeft") {
      left = clamp(left + localDx, -Infinity, right - minWidth);
    }
    if (drag.mode === "right" || drag.mode === "topRight" || drag.mode === "bottomRight") {
      right = clamp(right + localDx, left + minWidth, Infinity);
    }
    if (drag.mode === "top" || drag.mode === "topLeft" || drag.mode === "topRight") {
      top = clamp(top + localDy, -Infinity, bottom - minHeight);
    }
    if (drag.mode === "bottom" || drag.mode === "bottomLeft" || drag.mode === "bottomRight") {
      bottom = clamp(bottom + localDy, top + minHeight, Infinity);
    }

    const localCenter = {
      x: (left + right) / 2 - start.centerX,
      y: (top + bottom) / 2 - start.centerY,
    };
    const rotatedCenter = rotateOffset(localCenter.x, localCenter.y, startAngleRad);
    setAnalysisRegionFromPixels({
      centerX: start.centerX + rotatedCenter.x,
      centerY: start.centerY + rotatedCenter.y,
      radiusX: (right - left) / 2,
      radiusY: (bottom - top) / 2,
    });
  }

  function createEmptyMaskSlices() {
    const volume = state.activeVolume;
    return Array.from({ length: volume.depth }, () => new Uint8Array(volume.rows * volume.columns));
  }

  function composeActiveLabelSlices() {
    const volume = state.activeVolume;
    if (!volume) {
      state.analysis.labelSlices = [];
      state.analysis.maskSlices = [];
      return;
    }
    const scoringRange = getScoringSliceRange();

    const autoLabelSlices = state.analysis.autoLabelSlices.length
      ? state.analysis.autoLabelSlices
      : createEmptyLabelSlices(0);
    const overrideLabelSlices = state.analysis.overrideLabelSlices.length
      ? state.analysis.overrideLabelSlices
      : createEmptyLabelSlices(0);

    const labelSlices = createEmptyLabelSlices(0);
    const maskSlices = createEmptyMaskSlices();

    for (let sliceIndex = 0; sliceIndex < volume.depth; sliceIndex += 1) {
      const autoSlice = autoLabelSlices[sliceIndex];
      const overrideSlice = overrideLabelSlices[sliceIndex];
      const labelSlice = labelSlices[sliceIndex];
      const maskSlice = maskSlices[sliceIndex];
      const includeSlice = !scoringRange || (sliceIndex >= scoringRange.top && sliceIndex <= scoringRange.bottom);
      if (!includeSlice) {
        continue;
      }
      for (let pixelIndex = 0; pixelIndex < labelSlice.length; pixelIndex += 1) {
        const overrideValue = overrideSlice[pixelIndex];
        const nextLabel =
          overrideValue > 0 ? overrideValue : overrideValue < 0 ? 0 : autoSlice[pixelIndex] || 0;
        labelSlice[pixelIndex] = nextLabel;
        if (nextLabel > 0) {
          maskSlice[pixelIndex] = 1;
        }
      }
    }

    state.analysis.labelSlices = labelSlices;
    state.analysis.maskSlices = maskSlices;
  }

  function getOverrideValue(sliceIndex, pixelIndex) {
    return state.analysis.overrideLabelSlices?.[sliceIndex]?.[pixelIndex] ?? 0;
  }

  function setOverrideValue(sliceIndex, pixelIndex, value) {
    const slice = state.analysis.overrideLabelSlices?.[sliceIndex];
    if (!slice) {
      return;
    }
    slice[pixelIndex] = value;
  }

  function clearOverrideSlices() {
    state.analysis.overrideLabelSlices = createEmptyLabelSlices(0);
  }

  function estimateAutoLabelForPoint(x, y, region) {
    const normalizedX = (x + 0.5 - region.centerX) / Math.max(region.radiusX, 1);
    const normalizedY = (y + 0.5 - region.centerY) / Math.max(region.radiusY, 1);

    if (normalizedX > 0.2 && normalizedY < 0.12) {
      return 1;
    }
    if (normalizedX > 0.05) {
      return 2;
    }
    if (normalizedX < -0.18) {
      return 3;
    }
    if (normalizedY < -0.22) {
      return 4;
    }
    return normalizedX >= 0 ? 1 : 3;
  }

  function removeSmallComponentsFromSliceMask(mask, sliceIndex, minAreaMm2) {
    const volume = state.activeVolume;
    const minPixels = Math.max(1, Math.ceil(minAreaMm2 / Math.max(getPixelAreaMm2(volume), 1e-6)));
    const components = extractConnectedComponents2D(mask, volume.columns, volume.rows, { sliceIndex });
    components.forEach((component) => {
      if (component.pixelCount >= minPixels) {
        return;
      }
      component.pixels.forEach((pixelIndex) => {
        mask[pixelIndex] = 0;
      });
    });
  }

  function runAutoDetection() {
    const volume = state.activeVolume;
    if (!volume) {
      throw new Error("Load a CT series before running detection.");
    }

    const region = getAnalysisRegionInPixels();
    const scoringRange = getScoringSliceRange();
    const autoLabelSlices = createEmptyLabelSlices(0);

    if (!scoringRange) {
      throw new Error("No scoring slice range is available.");
    }

    for (let sliceIndex = scoringRange.top; sliceIndex <= scoringRange.bottom; sliceIndex += 1) {
      const workingMask = new Uint8Array(volume.rows * volume.columns);
      for (let y = 0; y < volume.rows; y += 1) {
        for (let x = 0; x < volume.columns; x += 1) {
          if (!pointInsideSliceDetectionMask(sliceIndex, x, y, region)) {
            continue;
          }
          const pixelIndex = y * volume.columns + x;
          const hu = getSliceHuValue(sliceIndex, pixelIndex);
          if (hu != null && hu >= state.analysis.thresholdHu) {
            workingMask[pixelIndex] = 1;
          }
        }
      }
      removeSmallComponentsFromSliceMask(workingMask, sliceIndex, state.analysis.minAreaMm2);

      const components = extractConnectedComponents2D(workingMask, volume.columns, volume.rows, { sliceIndex });
      const labelSlice = autoLabelSlices[sliceIndex];
      components.forEach((component) => {
        const labelCode = estimateAutoLabelForPoint(component.centerX, component.centerY, region);
        component.pixels.forEach((pixelIndex) => {
          labelSlice[pixelIndex] = labelCode;
        });
      });
    }

    state.analysis.autoLabelSlices = cloneLabelSlices(autoLabelSlices);
    state.analysis.autoMaskSlices = cloneMaskSlices(
      autoLabelSlices.map((labelSlice) => {
        const mask = new Uint8Array(labelSlice.length);
        for (let pixelIndex = 0; pixelIndex < labelSlice.length; pixelIndex += 1) {
          if (labelSlice[pixelIndex] > 0) {
            mask[pixelIndex] = 1;
          }
        }
        return mask;
      })
    );
    if (!state.analysis.overrideLabelSlices.length) {
      clearOverrideSlices();
    }
    composeActiveLabelSlices();
    state.analysis.activeComponentId = null;
    state.analysis.detectionStamp += 1;
    state.workflowStep = "label";
    rebuildAnalysisOutputs();
    setStatus(
      countRoiAnchors()
        ? "Automatic calcium scoring updated using the current heart ROI anchors."
        : "Automatic calcium scoring updated using the current fallback search region.",
      null
    );
  }

  function rebuildAnalysisOutputs() {
    const volume = state.activeVolume;
    const labelSlices = state.analysis.labelSlices;
    if (!volume || !labelSlices.length) {
      state.analysis.componentLookupBySlice = [];
      state.analysis.components = [];
      state.analysis.results = null;
      refreshDerivedUi();
      requestRender();
      return;
    }

    const components = [];
    const lookup = Array.from({ length: volume.depth }, () => new Map());
    const visited = labelSlices.map((slice) => new Uint8Array(slice.length));
    let nextId = 1;

    for (let sliceIndex = 0; sliceIndex < volume.depth; sliceIndex += 1) {
      const labelSlice = labelSlices[sliceIndex];
      for (let pixelIndex = 0; pixelIndex < labelSlice.length; pixelIndex += 1) {
        const labelCode = labelSlice[pixelIndex];
        if (!labelCode || visited[sliceIndex][pixelIndex]) {
          continue;
        }

        const queue = [[sliceIndex, pixelIndex]];
        visited[sliceIndex][pixelIndex] = 1;
        const pixelsBySlice = new Map();
        let voxelCount = 0;
        let sumHu = 0;
        let peakHu = -Infinity;
        let minSlice = sliceIndex;
        let maxSlice = sliceIndex;
        const componentLabelCode = labelCode;

        while (queue.length) {
          const [currentSlice, currentIndex] = queue.pop();
          const x = currentIndex % volume.columns;
          const y = (currentIndex - x) / volume.columns;
          voxelCount += 1;
          minSlice = Math.min(minSlice, currentSlice);
          maxSlice = Math.max(maxSlice, currentSlice);
          if (!pixelsBySlice.has(currentSlice)) {
            pixelsBySlice.set(currentSlice, []);
          }
          pixelsBySlice.get(currentSlice).push(currentIndex);
          lookup[currentSlice].set(currentIndex, nextId);

          const hu = getSliceHuValue(currentSlice, currentIndex);
          if (Number.isFinite(hu)) {
            sumHu += hu;
            peakHu = Math.max(peakHu, hu);
          }

          for (let dz = -1; dz <= 1; dz += 1) {
            const nextSlice = currentSlice + dz;
            if (nextSlice < 0 || nextSlice >= volume.depth) {
              continue;
            }
            for (let dy = -1; dy <= 1; dy += 1) {
              const nextY = y + dy;
              if (nextY < 0 || nextY >= volume.rows) {
                continue;
              }
              for (let dx = -1; dx <= 1; dx += 1) {
                const nextX = x + dx;
                if (nextX < 0 || nextX >= volume.columns) {
                  continue;
                }
                if (!dx && !dy && !dz) {
                  continue;
                }
                const nextIndex = nextY * volume.columns + nextX;
                if (labelSlices[nextSlice][nextIndex] !== componentLabelCode || visited[nextSlice][nextIndex]) {
                  continue;
                }
                visited[nextSlice][nextIndex] = 1;
                queue.push([nextSlice, nextIndex]);
              }
            }
          }
        }

        components.push({
          id: nextId,
          voxelCount,
          volumeMm3: voxelCount * getVoxelVolumeMm3(volume),
          peakHu,
          meanHu: voxelCount ? sumHu / voxelCount : null,
          minSlice,
          maxSlice,
          labelCode: componentLabelCode,
          labelName: getLabelName(componentLabelCode),
          pixelsBySlice,
        });
        nextId += 1;
      }
    }

    state.analysis.componentLookupBySlice = lookup;
    state.analysis.components = components.sort((left, right) => right.volumeMm3 - left.volumeMm3);

    if (
      state.analysis.activeComponentId != null &&
      !state.analysis.components.some((component) => component.id === state.analysis.activeComponentId)
    ) {
      state.analysis.activeComponentId = null;
    }

    state.analysis.results = computeResults();
    refreshDerivedUi();
    requestRender();
  }

  function computeResults() {
    const volume = state.activeVolume;
    const labelSlices = state.analysis.labelSlices;
    if (!volume || !labelSlices.length) {
      return null;
    }

    const voxelVolumeMm3 = getVoxelVolumeMm3(volume);
    const pixelAreaMm2 = getPixelAreaMm2(volume);
    const perLabel = new Map(
      LABELS.map((label) => [
        label.code,
        {
          labelCode: label.code,
          vessel: label.label,
          lesions: 0,
          voxelCount: 0,
          volumeMm3: 0,
          integratedHuVolume: 0,
          agatstonScore: 0,
          coronary: label.coronary,
        },
      ])
    );

    for (let sliceIndex = 0; sliceIndex < volume.depth; sliceIndex += 1) {
      const labelSlice = labelSlices[sliceIndex];
      for (let pixelIndex = 0; pixelIndex < labelSlice.length; pixelIndex += 1) {
        const labelCode = labelSlice[pixelIndex];
        if (!labelCode) {
          continue;
        }
        const bucket = perLabel.get(labelCode);
        if (!bucket) {
          continue;
        }
        bucket.voxelCount += 1;
        const hu = getSliceHuValue(sliceIndex, pixelIndex);
        if (Number.isFinite(hu) && hu > 0) {
          bucket.integratedHuVolume += hu * voxelVolumeMm3;
        }
      }

      LABELS.forEach((label) => {
        const mask = new Uint8Array(labelSlice.length);
        let hasPixels = false;
        for (let pixelIndex = 0; pixelIndex < labelSlice.length; pixelIndex += 1) {
          if (labelSlice[pixelIndex] === label.code) {
            mask[pixelIndex] = 1;
            hasPixels = true;
          }
        }
        if (!hasPixels) {
          return;
        }
        const sliceComponents = extractConnectedComponents2D(mask, volume.columns, volume.rows, { sliceIndex });
        sliceComponents.forEach((component) => {
          const areaMm2 = component.pixelCount * pixelAreaMm2;
          if (areaMm2 < state.analysis.minAreaMm2) {
            return;
          }
          const densityFactor = densityFactorForPeakHu(component.peakHu);
          if (!densityFactor) {
            return;
          }
          perLabel.get(label.code).agatstonScore += areaMm2 * densityFactor;
        });
      });
    }

    state.analysis.components.forEach((component) => {
      const bucket = perLabel.get(component.labelCode);
      if (bucket) {
        bucket.lesions += 1;
      }
    });

    const rawRows = LABELS.map((label) => {
      const bucket = perLabel.get(label.code);
      bucket.volumeMm3 = bucket.voxelCount * voxelVolumeMm3;
      bucket.equivalentMassMg = (state.analysis.massCalibrationFactor * bucket.integratedHuVolume) / 1000;
      return {
        labelCode: label.code,
        vessel: bucket.vessel,
        lesions: bucket.lesions,
        volume_mm3: roundTo(bucket.volumeMm3, 1),
        equivalent_mass_mg: roundTo(bucket.equivalentMassMg, 2),
        agatston_score: roundTo(bucket.agatstonScore, 1),
        coronary: bucket.coronary,
      };
    });

    const rows = rawRows.filter((row) => row.coronary || row.lesions || row.volume_mm3 || row.agatston_score);

    const coronaryRows = rows.filter((row) => row.coronary);
    const totalRow = rows.reduce(
      (accumulator, row) => {
        accumulator.lesions += row.lesions;
        accumulator.volume_mm3 += Number(row.volume_mm3) || 0;
        accumulator.equivalent_mass_mg += Number(row.equivalent_mass_mg) || 0;
        accumulator.agatston_score += Number(row.agatston_score) || 0;
        return accumulator;
      },
      { vessel: "Total Calcification", lesions: 0, volume_mm3: 0, equivalent_mass_mg: 0, agatston_score: 0 }
    );
    const coronaryTotalRow = coronaryRows.reduce(
      (accumulator, row) => {
        accumulator.lesions += row.lesions;
        accumulator.volume_mm3 += Number(row.volume_mm3) || 0;
        accumulator.equivalent_mass_mg += Number(row.equivalent_mass_mg) || 0;
        accumulator.agatston_score += Number(row.agatston_score) || 0;
        return accumulator;
      },
      { vessel: "Total Coronary", lesions: 0, volume_mm3: 0, equivalent_mass_mg: 0, agatston_score: 0 }
    );

    const formattedRows = [
      ...rows.map((row) => ({
        labelCode: row.labelCode,
        vessel: row.vessel,
        volume_mm3: roundTo(row.volume_mm3, 1),
        equivalent_mass_mg: roundTo(row.equivalent_mass_mg, 2),
        agatston_score: roundTo(row.agatston_score, 1),
        lesions: row.lesions,
        coronary: row.coronary,
        isTotal: false,
      })),
      {
        labelCode: 0,
        vessel: coronaryTotalRow.vessel,
        volume_mm3: roundTo(coronaryTotalRow.volume_mm3, 1),
        equivalent_mass_mg: roundTo(coronaryTotalRow.equivalent_mass_mg, 2),
        agatston_score: roundTo(coronaryTotalRow.agatston_score, 1),
        lesions: coronaryTotalRow.lesions,
        coronary: true,
        isTotal: true,
      },
      {
        labelCode: 0,
        vessel: totalRow.vessel,
        volume_mm3: roundTo(totalRow.volume_mm3, 1),
        equivalent_mass_mg: roundTo(totalRow.equivalent_mass_mg, 2),
        agatston_score: roundTo(totalRow.agatston_score, 1),
        lesions: totalRow.lesions,
        coronary: false,
        isTotal: true,
      },
    ];

    return {
      lesionCount: state.analysis.components.length,
      totalVolumeMm3: totalRow.volume_mm3,
      equivalentMassMg: totalRow.equivalent_mass_mg,
      agatstonScore: totalRow.agatston_score,
      coronaryVolumeMm3: coronaryTotalRow.volume_mm3,
      rows: formattedRows,
    };
  }

  function refreshDerivedUi() {
    updateControlStates();
    syncControlsFromState();
    updateResultsUi();
    updateLesionListUi();
    updateMetadataUi();
    updateSelectionUi();
  }

  function updateControlStates() {
    const hasStudy = state.seriesCandidates.length > 0;
    const hasSelectedSeries = Boolean(getSelectedSeries());
    const hasVolume = Boolean(state.activeVolume);
    const hasMask = state.analysis.maskSlices.length > 0;
    const hasSelection = state.analysis.activeComponentId != null;
    const hasVoiDraft = Boolean(state.voiDraftPoints?.length);
    const maxSliceValue = Math.max(1, state.activeVolume?.depth || 1);

    els.loadSelectedSeriesButton.disabled = !hasSelectedSeries;
    els.thresholdSlider.disabled = !hasVolume;
    els.minAreaSlider.disabled = !hasVolume;
    els.massFactorInput.disabled = !hasVolume;
    if (els.scoreTopSliceInput) {
      els.scoreTopSliceInput.disabled = !hasVolume;
      els.scoreTopSliceInput.min = "1";
      els.scoreTopSliceInput.max = String(maxSliceValue);
    }
    if (els.scoreBottomSliceInput) {
      els.scoreBottomSliceInput.disabled = !hasVolume;
      els.scoreBottomSliceInput.min = "1";
      els.scoreBottomSliceInput.max = String(maxSliceValue);
    }
    if (els.setScoreTopButton) {
      els.setScoreTopButton.disabled = !hasVolume;
    }
    if (els.setScoreBottomButton) {
      els.setScoreBottomButton.disabled = !hasVolume;
    }
    if (els.useFullScoreRangeButton) {
      els.useFullScoreRangeButton.disabled = !hasVolume;
    }
    els.roiXSlider.disabled = !hasVolume;
    els.roiYSlider.disabled = !hasVolume;
    els.roiWidthSlider.disabled = !hasVolume;
    els.roiHeightSlider.disabled = !hasVolume;
    if (els.activeLabelSelect) {
      els.activeLabelSelect.disabled = !hasVolume;
    }
    if (els.voiActionSelect) {
      els.voiActionSelect.disabled = !hasVolume;
    }
    if (els.slabStartInput) {
      els.slabStartInput.disabled = !hasVolume;
      els.slabStartInput.min = "1";
      els.slabStartInput.max = String(maxSliceValue);
    }
    if (els.slabEndInput) {
      els.slabEndInput.disabled = !hasVolume;
      els.slabEndInput.min = "1";
      els.slabEndInput.max = String(maxSliceValue);
    }
    if (els.setSlabStartButton) {
      els.setSlabStartButton.disabled = !hasVolume;
    }
    if (els.setSlabEndButton) {
      els.setSlabEndButton.disabled = !hasVolume;
    }
    if (els.applyVoiButton) {
      els.applyVoiButton.disabled = !hasVolume || !hasVoiDraft;
    }
    if (els.clearVoiButton) {
      els.clearVoiButton.disabled = !(state.dragging?.type === "voiDraw" || hasVoiDraft);
    }
    els.runDetectionButton.disabled = !hasVolume;
    els.restoreAutoButton.disabled = !hasMask;
    if (els.brushSlider) {
      els.brushSlider.disabled = !hasMask;
    }
    els.segmentRoiButton.disabled = !hasVolume;
    els.clearRoiSliceButton.disabled = !getStoredRoiContour(state.activeSliceIndex);
    els.toggleOverlayButton.disabled = !hasVolume;
    els.toggleRoiButton.disabled = !hasVolume;
    els.clearSelectionButton.disabled = !hasSelection;
    els.exportCsvButton.disabled = !state.analysis.results;
    els.exportPngButton.disabled = !hasVolume;
    if (els.finishCloseButton) {
      els.finishCloseButton.disabled = !state.analysis.results;
    }
    els.sliceSlider.disabled = !hasVolume;
    els.toolButtons.forEach((button) => {
      if (button.dataset.tool === "roiContour" || button.dataset.tool === "roiAdjust") {
        button.disabled = !hasVolume;
        return;
      }
      if (button.dataset.tool === "tapLabel" || button.dataset.tool === "voiDraw") {
        button.disabled = !hasVolume;
        return;
      }
      button.disabled = !hasMask && button.dataset.tool !== "inspect";
    });

    els.workflowNote.textContent = hasStudy
      ? hasVolume
        ? hasMask
          ? "Automatic scoring is ready. Refine ROI if needed, then label, edit, and export."
          : "Series loaded. Set the top and bottom slices, then click Let's Go Segment."
        : "Choose the best calcium-scoring series and load it."
      : "Load a cardiac CT study to begin.";
  }

  function updateSeriesListUi() {
    els.seriesSummary.textContent = `${state.seriesCandidates.length} candidate series loaded`;
    if (!state.seriesCandidates.length) {
      els.seriesList.innerHTML = '<p class="empty-copy">Load DICOM files to rank candidate calcium-scoring series.</p>';
      return;
    }

    els.seriesList.innerHTML = "";
    state.seriesCandidates.forEach((candidate, index) => {
      const card = document.createElement("article");
      card.className = `series-card${candidate.id === state.selectedSeriesId ? " is-selected" : ""}`;

      const recommendationTone = candidate.score >= 40 ? "good" : candidate.score >= 10 ? "warning" : "";
      const why = candidate.reasons.length ? candidate.reasons.join(", ") : "no strong calcium-scoring hints";
      const caution = candidate.cautions.length ? candidate.cautions.join(", ") : "no major caution flags";
      const thickness = Number.isFinite(candidate.meta?.sliceThickness)
        ? `${roundTo(candidate.meta.sliceThickness, 1).toFixed(1)} mm`
        : "-";
      const spacing =
        candidate.meta?.pixelSpacing?.length >= 2
          ? `${roundTo(candidate.meta.pixelSpacing[0], 2).toFixed(2)} x ${roundTo(candidate.meta.pixelSpacing[1], 2).toFixed(2)}`
          : "-";

      card.innerHTML = `
        <div class="series-card-header">
          <div>
            <strong>${escapeHtml(candidate.label)}</strong>
            <small>${escapeHtml(candidate.studyLabel)} • ${escapeHtml(candidate.acquisitionLabel || "Unknown acquisition")}</small>
          </div>
          <span class="series-badge${recommendationTone ? ` is-${recommendationTone}` : ""}">
            ${index === 0 ? "Recommended" : "Candidate"} • ${candidate.score}
          </span>
        </div>
        <div class="series-meta">
          <div>
            <span>Slices</span>
            <strong>${candidate.recordCount}</strong>
          </div>
          <div>
            <span>Thickness</span>
            <strong>${escapeHtml(thickness)}</strong>
          </div>
          <div>
            <span>Spacing</span>
            <strong>${escapeHtml(spacing)}</strong>
          </div>
          <div>
            <span>Kernel</span>
            <strong>${escapeHtml(candidate.meta?.convolutionKernel || "-")}</strong>
          </div>
        </div>
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

  function updateSelectionUi() {
    els.toolBadge.textContent = `Tool: ${TOOLS[state.tool] || "Inspect"} • ${VIEWER_MODE_LABELS[state.view.interactionMode] || "Edit"}`;
    els.pointerBadge.textContent = `HU: ${Number.isFinite(state.pointer.hu) ? Math.round(state.pointer.hu) : "-"}`;
    els.roiAnchorReadout.textContent = `${countRoiAnchors()} anchor slice${countRoiAnchors() === 1 ? "" : "s"}`;
    if (els.labelNote) {
      els.labelNote.textContent = `Active label: ${getLabelName(state.selectedLabelCode)}. Tap lesions or apply a slab VOI to classify calcium.`;
    }
    const component = state.analysis.components.find((entry) => entry.id === state.analysis.activeComponentId) || null;
    els.selectionReadout.textContent = component
      ? `Lesion ${component.id} • ${component.labelName} • ${component.minSlice + 1}-${component.maxSlice + 1} • ${formatMm3(component.volumeMm3)}`
      : "None";

    const toolHint =
      state.tool === "roiAdjust"
        ? "Drag the fallback heart ROI directly on the image. Right click reveals more handles and rotation."
        : state.tool === "roiContour"
        ? "Draw a closed heart ROI on the current slice. That slice becomes an anchor."
        : state.tool === "tapLabel"
          ? `Left click assigns a lesion to ${getLabelName(state.selectedLabelCode)}, right click removes it, and left-drag draws a freehand inclusion region on the current slice.`
          : state.tool === "voiDraw"
            ? "Draw a VOI polygon, then apply it across the selected slice slab."
        : state.tool === "inspect"
        ? "Click a lesion to inspect it."
        : state.tool === "exclude"
          ? "Click a lesion to exclude it from the score."
        : state.tool === "add"
            ? "Drag to add threshold-eligible calcium pixels on this slice."
            : state.tool === "erase"
              ? "Press E for erase. Left click removes a lesion, and left-drag erases everything inside your drawn region."
              : state.tool === "grow"
                ? "Click a lesion to grow it on the current slice."
                : "Click a lesion to shrink it on the current slice.";

    const viewerHint =
      state.view.interactionMode === "windowLevel"
        ? "WW/WL mode: left-drag to change window width and level. Right-drag scrubs quickly through slices."
        : state.view.interactionMode === "pan"
          ? "Pan mode: left-drag to move the image. Right-drag scrubs quickly through slices."
          : state.view.interactionMode === "zoom"
            ? "Zoom mode: left-drag vertically to zoom. Right-drag scrubs quickly through slices."
            : null;

    if (viewerHint && state.activeVolume) {
      els.interactionReadout.textContent = viewerHint;
      return;
    }

    if (component) {
      els.editingNote.textContent = `Lesion ${component.id} selected as ${component.labelName}. Use exclude, relabel, grow, shrink, or brush edits on the current slice.`;
      els.interactionReadout.textContent = `${toolHint} Active selection: lesion ${component.id}.`;
    } else if (state.tool === "roiAdjust" && state.activeVolume) {
      els.editingNote.textContent = "Drag the fallback heart ROI ellipse directly. Right click on it for more handles and rotation when you need finer adjustment.";
      els.interactionReadout.textContent = toolHint;
    } else if (state.tool === "roiContour" && state.activeVolume) {
      els.editingNote.textContent = "Draw heart ROI anchors on a few slices, then segment between anchors and rerun auto score.";
      els.interactionReadout.textContent = toolHint;
    } else if (state.tool === "tapLabel" && state.activeVolume) {
      els.editingNote.textContent = "Choose the vessel first, then left click to add/select, right click to remove, or left-drag to include everything inside your freehand region.";
      els.interactionReadout.textContent = toolHint;
    } else if (state.tool === "erase" && state.activeVolume) {
      els.editingNote.textContent = "Erase mode removes calcifications from being counted. Left click removes a lesion, and left-drag erases inside your drawn region.";
      els.interactionReadout.textContent = toolHint;
    } else if (state.tool === "voiDraw" && state.activeVolume) {
      els.editingNote.textContent = "Draw one VOI polygon, then apply it across the selected slice slab.";
      els.interactionReadout.textContent = toolHint;
    } else if (state.analysis.maskSlices.length) {
      els.editingNote.textContent = "Select a lesion or use a brush to refine the mask.";
      els.interactionReadout.textContent = toolHint;
    } else {
      els.editingNote.textContent = "Select a lesion or use a brush to refine the mask.";
      els.interactionReadout.textContent = state.activeVolume
        ? "Run detection to create an editable lesion mask."
        : "Load a series to review.";
    }
  }

  function updateResultsUi() {
    const results = state.analysis.results;
    const anchorCount = countRoiAnchors();
    const scoringRange = getScoringSliceRange();
    if (!results) {
      els.resultsNote.textContent = "No calcium score yet.";
      els.detectionNote.textContent = state.activeVolume
        ? anchorCount
          ? `Choose slices ${scoringRange.top + 1}-${scoringRange.bottom + 1}, review any ROI anchors, then click Let's Go Segment.`
          : `Choose the scoring slices ${scoringRange.top + 1}-${scoringRange.bottom + 1}, then click Let's Go Segment.`
        : "Load a series to begin automatic calcium scoring.";
      els.metricLesions.textContent = "-";
      els.metricVolume.textContent = "-";
      els.metricMass.textContent = "-";
      els.metricAgatston.textContent = "-";
      els.resultsTableBody.innerHTML =
        '<tr><td colspan="4" class="empty-cell">Run detection to generate results.</td></tr>';
      return;
    }

    const thresholdLabel =
      state.analysis.thresholdHu === 130
        ? "Vessel and category summary ready."
        : `Threshold adjusted to ${state.analysis.thresholdHu} HU; results are no longer standard Agatston.`;
    els.resultsNote.textContent = thresholdLabel;
    els.detectionNote.textContent = anchorCount
      ? `Auto score used slices ${scoringRange.top + 1}-${scoringRange.bottom + 1}, ${anchorCount} ROI anchor slice${anchorCount === 1 ? "" : "s"}, and interpolated heart ROI contours.`
      : `Auto score used slices ${scoringRange.top + 1}-${scoringRange.bottom + 1} inside the fallback cardiac search region. Draw ROI anchors if you want an EAT-like heart-constrained rerun.`;
    els.metricLesions.textContent = formatMm3(results.coronaryVolumeMm3);
    els.metricVolume.textContent = formatMm3(results.totalVolumeMm3);
    els.metricMass.textContent = formatMg(results.equivalentMassMg);
    els.metricAgatston.textContent = formatScore(results.agatstonScore);
    els.resultsTableBody.innerHTML = results.rows
      .map(
        (row) => `
        <tr${row.isTotal ? ' class="is-total-row"' : ""}>
          <td>${escapeHtml(row.vessel)}</td>
          <td>${escapeHtml(String(row.volume_mm3))}</td>
          <td>${escapeHtml(String(row.equivalent_mass_mg))}</td>
          <td>${escapeHtml(String(row.agatston_score))}</td>
        </tr>`
      )
      .join("");
  }

  function buildLabelSummaries() {
    const results = state.analysis.results;
    if (!results) {
      return [];
    }

    return results.rows
      .filter((row) => !row.isTotal)
      .map((row) => {
        const components = state.analysis.components.filter((component) => component.labelCode === row.labelCode);
        if (!components.length && !row.coronary && !row.volume_mm3 && !row.agatston_score) {
          return null;
        }
        const minSlice = components.length ? Math.min(...components.map((component) => component.minSlice)) : null;
        const maxSlice = components.length ? Math.max(...components.map((component) => component.maxSlice)) : null;
        const labelMeta = getLabelMeta(row.labelCode);
        return {
          row,
          labelMeta,
          componentCount: components.length,
          minSlice,
          maxSlice,
        };
      })
      .filter(Boolean);
  }

  function updateLesionListUi() {
    const summaries = buildLabelSummaries();
    if (!summaries.length) {
      els.lesionNote.textContent = "No active vessel or category summary.";
      els.lesionList.innerHTML = '<p class="empty-copy">Run detection to see vessel and category summaries.</p>';
      return;
    }

    els.lesionNote.textContent = `${summaries.length} summarized vessel or category bucket${summaries.length === 1 ? "" : "s"}. Tap the image for individual component review.`;
    els.lesionList.innerHTML = "";
    summaries.forEach((summary) => {
      const card = document.createElement("article");
      card.className = `lesion-card${summary.row.labelCode === state.selectedLabelCode ? " is-selected" : ""}`;
      const labelMeta = summary.labelMeta;
      card.innerHTML = `
        <div class="lesion-card-header">
          <div>
            <strong>${escapeHtml(summary.row.vessel)}</strong>
            <small>${summary.minSlice != null ? `Slices ${summary.minSlice + 1} to ${summary.maxSlice + 1}` : "No assigned components yet"} • ${summary.componentCount} connected component${summary.componentCount === 1 ? "" : "s"}</small>
          </div>
          <span class="lesion-badge" style="border-color:${escapeHtml(labelMeta?.stroke || "#a1b3bf")}">${formatMm3(summary.row.volume_mm3)}</span>
        </div>
        <div class="lesion-meta">
          <div>
            <span>Eq. Mass</span>
            <strong>${formatMg(summary.row.equivalent_mass_mg)}</strong>
          </div>
          <div>
            <span>Agatston</span>
            <strong>${formatScore(summary.row.agatston_score)}</strong>
          </div>
        </div>
        <div class="series-card-actions">
          <button class="button tertiary" type="button" data-label-select="${summary.row.labelCode}">Activate</button>
          <button class="button tertiary" type="button" data-label-jump="${summary.row.labelCode}" ${summary.minSlice == null ? "disabled" : ""}>Jump</button>
        </div>
      `;
      els.lesionList.appendChild(card);
    });
  }

  function updateMetadataUi() {
    const candidate = getActiveSeries();
    const volume = state.activeVolume;
    if (!candidate || !candidate.meta || !volume) {
      els.metadataNote.textContent = "Metadata will update when a series is loaded.";
      els.metadataList.innerHTML =
        '<div class="meta-row"><dt>Status</dt><dd>Load DICOM files to inspect metadata.</dd></div>';
      els.viewerTitle.textContent = "No series loaded";
      els.viewerSubtitle.textContent =
        "Automatic vessel-style calcium scoring with manual vessel and custom-label review.";
      return;
    }

    const meta = candidate.meta;
    els.metadataNote.textContent = "Series metadata for the active calcium-scoring run.";
    els.viewerTitle.textContent = candidate.label;
    els.viewerSubtitle.textContent = `${candidate.studyLabel} • ${candidate.acquisitionLabel || "Unknown acquisition"}`;
    els.metadataList.innerHTML = [
      ["Patient", meta.patientName || meta.patientId || "-"],
      ["Study / Time", combineDateTime(meta) || "-"],
      ["Series", candidate.label || "-"],
      ["Modality", meta.modality || "-"],
      ["Description", meta.seriesDescription || meta.protocolName || "-"],
      ["Slices", String(volume.depth)],
      [
        "Spacing",
        `${roundTo(volume.rowSpacing, 2).toFixed(2)} x ${roundTo(volume.columnSpacing, 2).toFixed(2)} x ${roundTo(volume.sliceSpacing, 2).toFixed(2)} mm`,
      ],
      ["Slice Thickness", formatMm(meta.sliceThickness)],
      ["Kernel", meta.convolutionKernel || "-"],
      ["Contrast", meta.acquisitionContrast || meta.contrastBolusAgent || "None seen"],
    ]
      .map(
        ([label, value]) =>
          `<div class="meta-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
      )
      .join("");
  }

  function renderLabelLegend() {
    if (!els.labelLegend) {
      return;
    }
    els.labelLegend.innerHTML = LABELS.map(
      (label) =>
        `<span class="label-chip${label.code === state.selectedLabelCode ? " is-active" : ""}" data-label-chip="${label.code}" style="--label-stroke:${label.stroke};">
          <span class="label-swatch" style="background:${label.stroke};"></span>${escapeHtml(label.label)}
        </span>`
    ).join("");
  }

  function syncControlsFromState() {
    const scoringRange = getScoringSliceRange();
    els.thresholdSlider.value = String(state.analysis.thresholdHu);
    els.thresholdReadout.textContent = `${state.analysis.thresholdHu} HU`;
    els.minAreaSlider.value = String(state.analysis.minAreaMm2);
    els.minAreaReadout.textContent = `${state.analysis.minAreaMm2.toFixed(1)} mm2`;
    els.massFactorInput.value = String(state.analysis.massCalibrationFactor);
    if (els.scoreRangeReadout) {
      els.scoreRangeReadout.textContent = scoringRange
        ? `Slices ${scoringRange.top + 1} to ${scoringRange.bottom + 1}`
        : "Slices - to -";
    }
    if (els.scoreTopSliceInput) {
      els.scoreTopSliceInput.value = String((scoringRange?.top ?? 0) + 1);
    }
    if (els.scoreBottomSliceInput) {
      els.scoreBottomSliceInput.value = String((scoringRange?.bottom ?? 0) + 1);
    }
    els.roiXSlider.value = String(Math.round(state.analysis.roi.centerXPercent));
    els.roiYSlider.value = String(Math.round(state.analysis.roi.centerYPercent));
    els.roiWidthSlider.value = String(Math.round(state.analysis.roi.widthPercent));
    els.roiHeightSlider.value = String(Math.round(state.analysis.roi.heightPercent));
    if (els.activeLabelSelect) {
      els.activeLabelSelect.value = String(state.selectedLabelCode);
    }
    if (els.voiActionSelect) {
      els.voiActionSelect.value = state.voiAction;
    }
    if (els.slabStartInput) {
      els.slabStartInput.value = String((state.slabRange.start || 0) + 1);
    }
    if (els.slabEndInput) {
      els.slabEndInput.value = String((state.slabRange.end || 0) + 1);
    }
    if (els.brushSlider) {
      els.brushSlider.value = String(state.brushRadiusPx);
    }
    if (els.brushReadout) {
      els.brushReadout.textContent = `${state.brushRadiusPx} px`;
    }
    els.toggleOverlayButton.classList.toggle("is-active", state.overlayVisible);
    els.toggleRoiButton.classList.toggle("is-active", state.roiVisible);
    els.toggleOverlayButton.textContent = `Lesion Overlay${state.overlayVisible ? "" : " Off"}`;
    els.toggleRoiButton.textContent = `ROI Overlay${state.roiVisible ? "" : " Off"}`;
    els.toolButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tool === state.tool);
    });
    els.workflowButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.workflowStep === state.workflowStep);
    });
    els.presetButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.preset === state.currentPreset);
    });
    updateCanvasCursor();
    renderLabelLegend();
  }

  function resizeCanvas(canvas) {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return ratio;
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
    return { drawX, drawY, drawWidth, drawHeight, scale, fitScale };
  }

  function getCurrentVoi() {
    return state.currentVOI || VOI_PRESETS[state.currentPreset] || VOI_PRESETS.calcium;
  }

  function applyWindowing(nextVoi, options) {
    const width = clamp(Number(nextVoi?.width) || VOI_PRESETS.calcium.width, 1, 4000);
    const center = clamp(Number(nextVoi?.center) || VOI_PRESETS.calcium.center, -1200, 3000);
    state.currentPreset = null;
    state.currentVOI = { width, center };
    if (!options?.silent) {
      setStatus(`Window updated to WW ${Math.round(width)} / WL ${Math.round(center)}.`, null);
    }
    requestRender();
  }

  function setZoom(nextZoom, focusCanvasPoint) {
    const clampedZoom = clamp(nextZoom, 0.5, 6);
    if (!state.activeVolume || !state.canvasGeometry || !focusCanvasPoint) {
      state.view.zoom = clampedZoom;
      requestRender();
      return;
    }

    const previousGeometry = state.canvasGeometry;
    const focusImagePoint = eventToImageCoordinatesFromCanvasPoint(
      focusCanvasPoint.x,
      focusCanvasPoint.y,
      previousGeometry,
      state.activeVolume
    );

    state.view.zoom = clampedZoom;

    if (focusImagePoint) {
      const nextGeometry = computeCanvasGeometry(els.imageCanvas, state.activeVolume.columns, state.activeVolume.rows);
      const projectedPoint = {
        x: nextGeometry.drawX + ((focusImagePoint.imageX + 0.5) / state.activeVolume.columns) * nextGeometry.drawWidth,
        y: nextGeometry.drawY + ((focusImagePoint.imageY + 0.5) / state.activeVolume.rows) * nextGeometry.drawHeight,
      };
      state.view.panX += focusCanvasPoint.x - projectedPoint.x;
      state.view.panY += focusCanvasPoint.y - projectedPoint.y;
    }

    requestRender();
  }

  function changeZoom(factor, focusCanvasPoint) {
    setZoom(state.view.zoom * factor, focusCanvasPoint);
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
    if (state.view.interactionMode !== "edit") {
      els.overlayCanvas.style.cursor = VIEWER_MODE_CURSORS[state.view.interactionMode] || "default";
      return;
    }
    els.overlayCanvas.style.cursor = state.tool === "erase" ? "cell" : "crosshair";
  }

  function buildSliceCanvas(sliceIndex, options) {
    const volume = state.activeVolume;
    if (!volume) {
      return null;
    }
    const slice = volume.slices[sliceIndex];
    const offscreen = document.createElement("canvas");
    offscreen.width = volume.columns;
    offscreen.height = volume.rows;
    const ctx = offscreen.getContext("2d");
    const imageData = ctx.createImageData(volume.columns, volume.rows);
    const preset = options?.preset ? VOI_PRESETS[options.preset] || getCurrentVoi() : getCurrentVoi();
    const ww = preset.width;
    const wc = preset.center;
    const min = wc - ww / 2;
    const max = wc + ww / 2;

    for (let index = 0; index < slice.pixels.length; index += 1) {
      const hu = slice.pixels[index] * slice.slope + slice.intercept;
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

    const selected = state.analysis.components.find((component) => component.id === state.analysis.activeComponentId) || null;
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
      const labelMeta = getLabelMeta(labelCode);
      const baseColor = labelMeta?.color || [161, 179, 191, 148];
      const color = selectedLookup.has(pixelIndex) ? COLORS.selected : baseColor;
      imageData.data[offset] = color[0];
      imageData.data[offset + 1] = color[1];
      imageData.data[offset + 2] = color[2];
      imageData.data[offset + 3] = color[3];
    }

    ctx.putImageData(imageData, 0, 0);
    return offscreen;
  }

  function getDraftRoiContourForSlice(sliceIndex) {
    if (state.dragging?.type !== "roiDraw" || state.dragging.sliceIndex !== sliceIndex) {
      return null;
    }
    return state.dragging.points || null;
  }

  function getRenderableVoiContour(sliceIndex) {
    if (state.dragging?.type === "voiDraw" && state.dragging.sliceIndex === sliceIndex) {
      return state.dragging.points || null;
    }
    return state.voiDraftPoints?.length ? state.voiDraftPoints : null;
  }

  function getRenderableEditContour(sliceIndex) {
    if (
      (state.dragging?.type === "labelDraw" || state.dragging?.type === "eraseDraw") &&
      state.dragging.sliceIndex === sliceIndex &&
      state.dragging.moved
    ) {
      return state.dragging.points || null;
    }
    return null;
  }

  function clearVoiDraft() {
    state.voiDraftPoints = [];
    if (state.dragging?.type === "voiDraw") {
      state.dragging = null;
    }
    updateControlStates();
    syncControlsFromState();
    requestRender();
  }

  function applyVoiToSlab() {
    const volume = state.activeVolume;
    if (!volume) {
      throw new Error("Load a CT series before applying a VOI.");
    }
    if (!state.voiDraftPoints?.length || polygonArea(state.voiDraftPoints) < 20) {
      throw new Error("Draw a VOI polygon first.");
    }

    const start = clamp(Math.min(state.slabRange.start, state.slabRange.end), 0, volume.depth - 1);
    const end = clamp(Math.max(state.slabRange.start, state.slabRange.end), 0, volume.depth - 1);
    let changedCount = 0;
    for (let sliceIndex = start; sliceIndex <= end; sliceIndex += 1) {
      for (let y = 0; y < volume.rows; y += 1) {
        for (let x = 0; x < volume.columns; x += 1) {
          if (!pointInPolygon(state.voiDraftPoints, x + 0.5, y + 0.5)) {
            continue;
          }
          const pixelIndex = y * volume.columns + x;
          if (state.voiAction === "erase") {
            setOverrideValue(sliceIndex, pixelIndex, -1);
            changedCount += 1;
            continue;
          }
          const hu = getSliceHuValue(sliceIndex, pixelIndex);
          if (hu != null && hu >= state.analysis.thresholdHu) {
            setOverrideValue(sliceIndex, pixelIndex, state.selectedLabelCode);
            changedCount += 1;
          }
        }
      }
    }

    composeActiveLabelSlices();
    state.workflowStep = state.voiAction === "erase" ? "edit" : "label";
    rebuildAnalysisOutputs();
    setStatus(
      state.voiAction === "erase"
        ? `Erased calcification inside the VOI from slices ${start + 1}-${end + 1}.`
        : `Applied ${getLabelName(state.selectedLabelCode)} labeling inside the VOI across slices ${start + 1}-${end + 1}.`,
      changedCount ? null : "warning"
    );
  }

  function getRenderableRoiContour(sliceIndex) {
    const draft = getDraftRoiContourForSlice(sliceIndex);
    if (draft?.length >= 3) {
      return {
        points: draft,
        status: "draft",
      };
    }
    return getStoredRoiContour(sliceIndex);
  }

  function drawRoiContour(ctx, geometry, contour, volume, style) {
    if (!contour?.points?.length) {
      return;
    }

    const fillStyle =
      style?.fill ||
      (contour.status === "draft" ? "rgba(110, 228, 255, 0.12)" : "rgba(110, 228, 255, 0.08)");
    const strokeStyle = style?.stroke || (contour.status === "draft" ? "rgba(110, 228, 255, 0.86)" : "#6ee4ff");

    ctx.save();
    ctx.beginPath();
    contour.points.forEach((point, index) => {
      const canvasX = geometry.drawX + ((point.x + 0.5) / volume.columns) * geometry.drawWidth;
      const canvasY = geometry.drawY + ((point.y + 0.5) / volume.rows) * geometry.drawHeight;
      if (index === 0) {
        ctx.moveTo(canvasX, canvasY);
      } else {
        ctx.lineTo(canvasX, canvasY);
      }
    });
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(1.5, (window.devicePixelRatio || 1) * 1.2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawFallbackAnalysisRegion(ctx, geometry, region, volume, options) {
    if (!region || !volume) {
      return;
    }

    const centerCanvasX = geometry.drawX + (region.centerX / volume.columns) * geometry.drawWidth;
    const centerCanvasY = geometry.drawY + (region.centerY / volume.rows) * geometry.drawHeight;
    const radiusCanvasX = (region.radiusX / volume.columns) * geometry.drawWidth;
    const radiusCanvasY = (region.radiusY / volume.rows) * geometry.drawHeight;
    const showHandles = Boolean(options?.showHandles);

    ctx.save();
    if (options?.dashed) {
      ctx.setLineDash([10, 8]);
    }
    ctx.strokeStyle = COLORS.roi;
    ctx.fillStyle = options?.fill === false ? "transparent" : COLORS.roiFill;
    ctx.lineWidth = Math.max(1.5, (window.devicePixelRatio || 1) * 1.4);
    ctx.beginPath();
    ctx.ellipse(centerCanvasX, centerCanvasY, radiusCanvasX, radiusCanvasY, region.angleRad || 0, 0, Math.PI * 2);
    if (options?.fill !== false) {
      ctx.fill();
    }
    ctx.stroke();
    ctx.restore();

    if (!showHandles) {
      return;
    }

    const handleRadius = Math.max(5, (window.devicePixelRatio || 1) * 4.2);
    const handles = getFallbackRegionHandles(region);
    ctx.save();
    handles.forEach((handle) => {
      const canvasX = geometry.drawX + (handle.x / volume.columns) * geometry.drawWidth;
      const canvasY = geometry.drawY + (handle.y / volume.rows) * geometry.drawHeight;
      ctx.beginPath();
      ctx.arc(canvasX, canvasY, handleRadius, 0, Math.PI * 2);
      ctx.fillStyle = handle.mode === "move" ? "rgba(240, 197, 114, 0.95)" : "rgba(255, 255, 255, 0.95)";
      ctx.strokeStyle = "#0c1318";
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function render() {
    const imageRatio = resizeCanvas(els.imageCanvas);
    resizeCanvas(els.overlayCanvas);
    const imageCtx = els.imageCanvas.getContext("2d");
    const overlayCtx = els.overlayCanvas.getContext("2d");
    imageCtx.clearRect(0, 0, els.imageCanvas.width, els.imageCanvas.height);
    overlayCtx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);

    if (!state.activeVolume) {
      state.canvasGeometry = null;
      els.canvasOverlayMessage.hidden = false;
      els.canvasOverlayMessage.textContent = "Load a calcium-scoring CT series to begin axial review.";
      els.sliceBadge.textContent = "Slice 0 / 0";
      return;
    }

    const volume = state.activeVolume;
    const sliceIndex = clamp(state.activeSliceIndex, 0, Math.max(0, volume.depth - 1));
    state.activeSliceIndex = sliceIndex;
    state.canvasGeometry = computeCanvasGeometry(els.imageCanvas, volume.columns, volume.rows);
    const geometry = state.canvasGeometry;
    const imageCanvas = buildSliceCanvas(sliceIndex);
    if (imageCanvas) {
      imageCtx.drawImage(imageCanvas, geometry.drawX, geometry.drawY, geometry.drawWidth, geometry.drawHeight);
    }

    if (state.overlayVisible) {
      const maskCanvas = buildMaskCanvas(sliceIndex);
      if (maskCanvas) {
        overlayCtx.drawImage(maskCanvas, geometry.drawX, geometry.drawY, geometry.drawWidth, geometry.drawHeight);
      }
    }

    if (state.roiVisible) {
      const region = getAnalysisRegionInPixels();
      const contour = getRenderableRoiContour(sliceIndex);
      const showFallbackEditor = state.tool === "roiAdjust";
      if (contour?.points?.length >= 3) {
        drawRoiContour(overlayCtx, geometry, contour, volume);
      }
      if (!contour?.points?.length || showFallbackEditor) {
        drawFallbackAnalysisRegion(overlayCtx, geometry, region, volume, {
          fill: !contour?.points?.length,
          dashed: Boolean(contour?.points?.length && showFallbackEditor),
          showHandles: showFallbackEditor,
        });
      }
    }

    const voiContour = getRenderableVoiContour(sliceIndex);
    if (voiContour?.length >= 2) {
      drawRoiContour(
        overlayCtx,
        geometry,
        {
          points: voiContour,
          status: "draft",
        },
        volume
      );
    }

    const editContour = getRenderableEditContour(sliceIndex);
    if (editContour?.length >= 2) {
      drawRoiContour(
        overlayCtx,
        geometry,
        {
          points: editContour,
          status: "draft",
        },
        volume,
        state.dragging?.type === "eraseDraw"
          ? { stroke: "rgba(255, 158, 147, 0.94)", fill: "rgba(255, 158, 147, 0.12)" }
          : { stroke: getLabelMeta(state.selectedLabelCode)?.stroke || "rgba(110, 228, 255, 0.86)", fill: "rgba(110, 228, 255, 0.12)" }
      );
    }

    if (state.pointer.inside && state.tool === "erase" && state.dragging?.type !== "eraseDraw") {
      const radiusCanvas = state.brushRadiusPx * (geometry.drawWidth / volume.columns);
      overlayCtx.save();
      overlayCtx.strokeStyle = COLORS.brush;
      overlayCtx.lineWidth = Math.max(1.5, imageRatio * 1.3);
      overlayCtx.beginPath();
      overlayCtx.arc(
        geometry.drawX + ((state.pointer.imageX + 0.5) / volume.columns) * geometry.drawWidth,
        geometry.drawY + ((state.pointer.imageY + 0.5) / volume.rows) * geometry.drawHeight,
        Math.max(radiusCanvas, 3),
        0,
        Math.PI * 2
      );
      overlayCtx.stroke();
      overlayCtx.restore();
    }

    els.canvasOverlayMessage.hidden = true;
    els.sliceBadge.textContent = `Slice ${sliceIndex + 1} / ${volume.depth}${isSliceInsideScoringRange(sliceIndex) ? "" : " • out of score range"}`;
    els.sliceSlider.max = String(Math.max(0, volume.depth - 1));
    els.sliceSlider.value = String(sliceIndex);
    if (els.clearRoiSliceButton) {
      els.clearRoiSliceButton.disabled = !getStoredRoiContour(sliceIndex);
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function eventToImageCoordinates(clientX, clientY) {
    const volume = state.activeVolume;
    const geometry = state.canvasGeometry;
    if (!volume || !geometry) {
      return null;
    }

    const rect = els.overlayCanvas.getBoundingClientRect();
    const x = (clientX - rect.left) * ((window.devicePixelRatio || 1));
    const y = (clientY - rect.top) * ((window.devicePixelRatio || 1));

    return eventToImageCoordinatesFromCanvasPoint(x, y, geometry, volume);
  }

  function eventToImageCoordinatesFromCanvasPoint(x, y, geometry, volume) {
    if (!volume || !geometry) {
      return null;
    }

    if (
      x < geometry.drawX ||
      y < geometry.drawY ||
      x > geometry.drawX + geometry.drawWidth ||
      y > geometry.drawY + geometry.drawHeight
    ) {
      return null;
    }

    const imageX = clamp(Math.floor(((x - geometry.drawX) / geometry.drawWidth) * volume.columns), 0, volume.columns - 1);
    const imageY = clamp(Math.floor(((y - geometry.drawY) / geometry.drawHeight) * volume.rows), 0, volume.rows - 1);
    return {
      imageX,
      imageY,
      pixelIndex: imageY * volume.columns + imageX,
    };
  }

  function selectComponentAt(pixelIndex) {
    const lookup = state.analysis.componentLookupBySlice[state.activeSliceIndex];
    const componentId = lookup?.get(pixelIndex) || null;
    state.analysis.activeComponentId = componentId;
    updateSelectionUi();
    requestRender();
    return componentId;
  }

  function updatePointerFromEvent(event) {
    const point = eventToImageCoordinates(event.clientX, event.clientY);
    if (!point) {
      state.pointer = {
        imageX: null,
        imageY: null,
        pixelIndex: null,
        hu: null,
        inside: false,
      };
    } else {
      state.pointer = {
        imageX: point.imageX,
        imageY: point.imageY,
        pixelIndex: point.pixelIndex,
        hu: getSliceHuValue(state.activeSliceIndex, point.pixelIndex),
        inside: true,
      };
    }
    updateSelectionUi();
    requestRender();
    return point;
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

  function applyBrushAt(imageX, imageY, mode) {
    const volume = state.activeVolume;
    const radius = state.brushRadiusPx;
    const radiusSquared = radius * radius;
    const activeLabel = state.selectedLabelCode;

    for (let dy = -radius; dy <= radius; dy += 1) {
      const y = imageY + dy;
      if (y < 0 || y >= volume.rows) {
        continue;
      }
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = imageX + dx;
        if (x < 0 || x >= volume.columns) {
          continue;
        }
        if (dx * dx + dy * dy > radiusSquared) {
          continue;
        }
        const pixelIndex = y * volume.columns + x;
        if (mode === "erase") {
          setOverrideValue(state.activeSliceIndex, pixelIndex, -1);
          continue;
        }
        const hu = getSliceHuValue(state.activeSliceIndex, pixelIndex);
        if (hu != null && hu >= state.analysis.thresholdHu) {
          setOverrideValue(state.activeSliceIndex, pixelIndex, activeLabel);
        }
      }
    }
  }

  function growThresholdComponentFromSeed(sliceIndex, seedPixelIndex) {
    const volume = state.activeVolume;
    if (!volume) {
      return [];
    }
    const seedHu = getSliceHuValue(sliceIndex, seedPixelIndex);
    if (!Number.isFinite(seedHu) || seedHu < state.analysis.thresholdHu) {
      return [];
    }

    const visited = new Uint8Array(volume.rows * volume.columns);
    const queue = [seedPixelIndex];
    const pixels = [];
    visited[seedPixelIndex] = 1;

    while (queue.length) {
      const current = queue.pop();
      pixels.push(current);
      const x = current % volume.columns;
      const y = (current - x) / volume.columns;
      for (let dy = -1; dy <= 1; dy += 1) {
        const nextY = y + dy;
        if (nextY < 0 || nextY >= volume.rows) {
          continue;
        }
        for (let dx = -1; dx <= 1; dx += 1) {
          const nextX = x + dx;
          if (nextX < 0 || nextX >= volume.columns) {
            continue;
          }
          if (!dx && !dy) {
            continue;
          }
          const nextIndex = nextY * volume.columns + nextX;
          if (visited[nextIndex]) {
            continue;
          }
          visited[nextIndex] = 1;
          const hu = getSliceHuValue(sliceIndex, nextIndex);
          if (Number.isFinite(hu) && hu >= state.analysis.thresholdHu) {
            queue.push(nextIndex);
          }
        }
      }
    }

    return pixels;
  }

  function manuallyLabelSeedComponent(pixelIndex, labelCode) {
    const pixels = growThresholdComponentFromSeed(state.activeSliceIndex, pixelIndex);
    if (!pixels.length) {
      setStatus("Tap thresholded calcium or draw a VOI to add a manual label.", "warning");
      return;
    }
    pixels.forEach((currentIndex) => {
      setOverrideValue(state.activeSliceIndex, currentIndex, labelCode);
    });
    composeActiveLabelSlices();
    state.workflowStep = "label";
    rebuildAnalysisOutputs();
    setStatus(
      `Added a manual ${getLabelName(labelCode)} component on slice ${state.activeSliceIndex + 1}.`,
      null
    );
  }

  function eraseSeedComponent(pixelIndex) {
    const componentId = selectComponentAt(pixelIndex);
    if (componentId != null) {
      excludeComponent(componentId);
      return;
    }
    const pixels = growThresholdComponentFromSeed(state.activeSliceIndex, pixelIndex);
    if (!pixels.length) {
      setStatus("Right click or erase over a calcification you want to exclude.", "warning");
      return;
    }
    pixels.forEach((currentIndex) => {
      setOverrideValue(state.activeSliceIndex, currentIndex, -1);
    });
    composeActiveLabelSlices();
    state.workflowStep = "edit";
    rebuildAnalysisOutputs();
    setStatus(`Excluded a manually chosen calcification on slice ${state.activeSliceIndex + 1}.`, null);
  }

  function applyPolygonEditOnCurrentSlice(points, mode, labelCode) {
    const volume = state.activeVolume;
    if (!volume) {
      return;
    }
    const normalized = normalizeContourPoints(points, volume);
    if (normalized.length < 3 || polygonArea(normalized) < 20) {
      setStatus("Draw a larger closed region.", "warning");
      return;
    }

    let changedCount = 0;
    for (let y = 0; y < volume.rows; y += 1) {
      for (let x = 0; x < volume.columns; x += 1) {
        if (!pointInPolygon(normalized, x + 0.5, y + 0.5)) {
          continue;
        }
        const pixelIndex = y * volume.columns + x;
        if (mode === "erase") {
          setOverrideValue(state.activeSliceIndex, pixelIndex, -1);
          changedCount += 1;
          continue;
        }
        const hu = getSliceHuValue(state.activeSliceIndex, pixelIndex);
        if (hu != null && hu >= state.analysis.thresholdHu) {
          setOverrideValue(state.activeSliceIndex, pixelIndex, labelCode);
          changedCount += 1;
        }
      }
    }

    composeActiveLabelSlices();
    state.workflowStep = mode === "erase" ? "edit" : "label";
    rebuildAnalysisOutputs();
    setStatus(
      mode === "erase"
        ? `Erased everything inside the drawn region on slice ${state.activeSliceIndex + 1}.`
        : `Assigned everything inside the drawn region on slice ${state.activeSliceIndex + 1} to ${getLabelName(labelCode)}.`,
      changedCount ? null : "warning"
    );
  }

  function finalizeBrushEdit(statusMessage) {
    state.dragging = null;
    composeActiveLabelSlices();
    state.workflowStep = "edit";
    rebuildAnalysisOutputs();
    setStatus(statusMessage, null);
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
    composeActiveLabelSlices();
    state.workflowStep = "edit";
    rebuildAnalysisOutputs();
    setStatus(`Excluded lesion ${componentId}.`, null);
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
    composeActiveLabelSlices();
    state.workflowStep = "label";
    rebuildAnalysisOutputs();
    setStatus(`Assigned lesion ${componentId} to ${getLabelName(labelCode)}.`, null);
  }

  function morphSelectedComponent(componentId, mode) {
    const volume = state.activeVolume;
    const component = state.analysis.components.find((entry) => entry.id === componentId);
    if (!volume || !component) {
      return;
    }
    const pixels = component.pixelsBySlice.get(state.activeSliceIndex);
    if (!pixels?.length) {
      setStatus("The selected lesion is not present on this slice.", "warning");
      return;
    }

    const labelSlice = state.analysis.labelSlices[state.activeSliceIndex];
    const working = new Uint8Array(labelSlice.length);
    pixels.forEach((pixelIndex) => {
      working[pixelIndex] = 1;
    });
    const next = new Uint8Array(labelSlice.length);
    const componentLabelCode = component.labelCode;

    if (mode === "grow") {
      for (let pixelIndex = 0; pixelIndex < working.length; pixelIndex += 1) {
        if (!working[pixelIndex]) {
          continue;
        }
        const x = pixelIndex % volume.columns;
        const y = (pixelIndex - x) / volume.columns;
        for (let dy = -1; dy <= 1; dy += 1) {
          const nextY = y + dy;
          if (nextY < 0 || nextY >= volume.rows) {
            continue;
          }
          for (let dx = -1; dx <= 1; dx += 1) {
            const nextX = x + dx;
            if (nextX < 0 || nextX >= volume.columns) {
              continue;
            }
            const nextIndex = nextY * volume.columns + nextX;
            const hu = getSliceHuValue(state.activeSliceIndex, nextIndex);
            if (hu != null && hu >= state.analysis.thresholdHu) {
              next[nextIndex] = 1;
            }
          }
        }
      }
    } else {
      for (let pixelIndex = 0; pixelIndex < working.length; pixelIndex += 1) {
        if (!working[pixelIndex]) {
          continue;
        }
        const x = pixelIndex % volume.columns;
        const y = (pixelIndex - x) / volume.columns;
        let keep = true;
        for (let dy = -1; dy <= 1 && keep; dy += 1) {
          const nextY = y + dy;
          if (nextY < 0 || nextY >= volume.rows) {
            keep = false;
            break;
          }
          for (let dx = -1; dx <= 1; dx += 1) {
            const nextX = x + dx;
            if (nextX < 0 || nextX >= volume.columns) {
              keep = false;
              break;
            }
            const nextIndex = nextY * volume.columns + nextX;
            if (!working[nextIndex]) {
              keep = false;
              break;
            }
          }
        }
        if (keep) {
          next[pixelIndex] = 1;
        }
      }
    }

    component.pixelsBySlice.forEach((slicePixels, sliceIndex) => {
      if (sliceIndex !== state.activeSliceIndex) {
        return;
      }
      slicePixels.forEach((pixelIndex) => {
        setOverrideValue(sliceIndex, pixelIndex, -1);
      });
    });
    for (let pixelIndex = 0; pixelIndex < next.length; pixelIndex += 1) {
      if (next[pixelIndex]) {
        setOverrideValue(state.activeSliceIndex, pixelIndex, componentLabelCode);
      }
    }
    composeActiveLabelSlices();
    state.workflowStep = "edit";
    rebuildAnalysisOutputs();
    setStatus(`${mode === "grow" ? "Expanded" : "Shrank"} lesion ${componentId} on the current slice.`, null);
  }

  function resetAnalysisState() {
    state.analysis.scoringSlices = { top: 0, bottom: 0 };
    state.analysis.autoMaskSlices = [];
    state.analysis.autoLabelSlices = [];
    state.analysis.overrideLabelSlices = [];
    state.analysis.labelSlices = [];
    state.analysis.maskSlices = [];
    state.analysis.componentLookupBySlice = [];
    state.analysis.components = [];
    state.analysis.activeComponentId = null;
    state.analysis.results = null;
  }

  function resetRoiState() {
    state.roiContours = new Map();
  }

  function clearStudy(options) {
    state.studyRecords = [];
    state.seriesCandidates = [];
    state.selectedSeriesId = null;
    state.activeSeriesId = null;
    state.activeVolume = null;
    state.activeRecords = [];
    state.activeSeriesMeta = null;
    state.activeSliceIndex = 0;
    state.tool = "tapLabel";
    state.selectedLabelCode = 1;
    state.voiAction = "include";
    state.slabRange = { start: 0, end: 0 };
    state.voiDraftPoints = [];
    state.workflowStep = "series";
    state.currentPreset = "calcium";
    state.currentVOI = { ...VOI_PRESETS.calcium };
    state.view.zoom = 1;
    state.view.panX = 0;
    state.view.panY = 0;
    state.view.interactionMode = "edit";
    state.overlayVisible = true;
    state.roiVisible = true;
    state.dragging = null;
    state.finishModalOpen = false;
    clearPointer();
    resetRoiState();
    resetAnalysisState();
    closeFinishModal();
    if (els.finishStudyIdInput) {
      els.finishStudyIdInput.value = "";
    }
    syncControlsFromState();
    refreshDerivedUi();
    updateSeriesListUi();
    requestRender();
    if (!options?.silent) {
      setStatus("Ready for a calcium-scoring CT series", null);
    }
  }

  async function importStudyFiles(fileList, options) {
    const files = Array.from(fileList || []).filter((file) => file.size > 0);
    if (!files.length) {
      return;
    }

    setStatus(`Reading ${files.length} files...`);
    const records = await parseDicomFiles(files);
    if (!records.length) {
      throw new Error("No readable DICOM files were found.");
    }

    state.studyRecords = options?.append ? state.studyRecords.concat(records) : records;
    state.seriesCandidates = buildSeriesCandidates(state.studyRecords);
    state.selectedSeriesId = state.seriesCandidates[0]?.id || null;
    state.workflowStep = "series";
    if (!options?.append) {
      state.activeSeriesId = null;
      state.activeVolume = null;
      state.activeRecords = [];
      resetRoiState();
      resetAnalysisState();
    }
    updateSeriesListUi();
    syncControlsFromState();
    refreshDerivedUi();
    setStatus(
      `Loaded ${state.seriesCandidates.length} candidate series.${options?.append ? " Added to the current study list." : ""}`,
      null
    );
    syncControlsFromState();
  }

  async function loadSeriesById(seriesId) {
    const candidate = state.seriesCandidates.find((entry) => entry.id === seriesId);
    if (!candidate) {
      return;
    }
    state.selectedSeriesId = seriesId;
    updateSeriesListUi();

    if (!candidate.volume) {
      setStatus(`Preparing ${candidate.label}...`);
      candidate.volume = await buildVolume(candidate.records);
    }

    state.activeSeriesId = candidate.id;
    state.activeVolume = candidate.volume;
    state.activeRecords = candidate.records;
    state.activeSeriesMeta = candidate.meta;
    state.activeSliceIndex = Math.floor(candidate.volume.depth / 2);
    state.slabRange = {
      start: Math.max(0, state.activeSliceIndex - 1),
      end: Math.min(candidate.volume.depth - 1, state.activeSliceIndex + 1),
    };
    state.voiDraftPoints = [];
    state.workflowStep = "score";
    resetRoiState();
    resetAnalysisState();
    seedAnalysisRegionFromVolume(candidate.volume);
    initializeScoringSliceRange(candidate.volume);
    clearOverrideSlices();
    syncControlsFromState();
    refreshDerivedUi();
    requestRender();
    setStatus(`Loaded ${candidate.label}. Set the top and bottom slices, then click Let's Go Segment.`, null);
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
          workflow: "calcscorer",
          filename,
          contentBase64,
          mimeType: blob.type || "application/octet-stream",
          studyId: state.exportStudy.currentStudyId || "",
          patientStudyId: safeString(options?.patientStudyId || ""),
        }),
      });
    } catch (error) {
      console.warn("Could not mirror the export into the local outbox.", error);
    }
  }

  function buildExportBaseName() {
    return buildExportBaseNameWithStudyId("");
  }

  function buildExportBaseNameWithStudyId(studyId) {
    const candidate = getActiveSeries();
    const meta = candidate?.meta || {};
    const study = sanitizeFilePart(studyId || "", "");
    const patient = sanitizeFilePart(meta.patientName || meta.patientId || "patient", "patient");
    const series = sanitizeFilePart(candidate?.label || meta.seriesDescription || "calcscorer", "calcscorer");
    return study ? `${study}_${patient}_${series}` : `${patient}_${series}`;
  }

  function exportCsv(options) {
    const results = state.analysis.results;
    if (!results) {
      return false;
    }
    const studyId = String(options?.studyId || "").trim();
    const researchStudy = getSelectedExportStudyMetadata();
    const lines = [
      ["study_id", "research_study_id", "research_study_label", "vessel", "volume_mm3", "equivalent_mass_mg", "agatston_score"].join(","),
      ...results.rows.map((row) =>
        [studyId, researchStudy.id, researchStudy.label, row.vessel, row.volume_mm3, row.equivalent_mass_mg, row.agatston_score]
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `${buildExportBaseNameWithStudyId(studyId)}_calcscorer_results.csv`, { patientStudyId: studyId });
    if (!options?.suppressStatus) {
      setStatus(studyId ? `Exported CSV for Study ID ${studyId}.` : "Exported vessel and total CSV.", null);
    }
    return true;
  }

  function exportReviewPng(options) {
    const volume = state.activeVolume;
    if (!volume) {
      return Promise.resolve(false);
    }
    const studyId = String(options?.studyId || "").trim();

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = 1500;
    exportCanvas.height = 1100;
    const ctx = exportCanvas.getContext("2d");
    ctx.fillStyle = "#091218";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    ctx.fillStyle = COLORS.text;
    ctx.font = "700 34px Aptos, sans-serif";
    ctx.fillText("HAGRad CalcScorer Review", 48, 62);

    const candidate = getActiveSeries();
    const results = state.analysis.results;
    const researchStudy = getSelectedExportStudyMetadata();
    const subtitle = `${candidate?.studyLabel || "Unknown patient"} • ${candidate?.label || "Series"} • Slice ${state.activeSliceIndex + 1}/${volume.depth}${studyId ? ` • Study ID ${studyId}` : ""}${researchStudy.displayLabel ? ` • Research Study ${researchStudy.displayLabel}` : ""}`;
    ctx.fillStyle = COLORS.muted;
    ctx.font = "500 20px Aptos, sans-serif";
    ctx.fillText(subtitle, 48, 96);

    const imageCanvas = buildSliceCanvas(state.activeSliceIndex, { preset: state.currentPreset });
    const maskCanvas = buildMaskCanvas(state.activeSliceIndex);
    const drawWidth = 860;
    const drawHeight = Math.round((volume.rows / volume.columns) * drawWidth);
    const drawX = 48;
    const drawY = 148;
    ctx.fillStyle = "#02070a";
    ctx.fillRect(drawX - 2, drawY - 2, drawWidth + 4, drawHeight + 4);
    ctx.drawImage(imageCanvas, drawX, drawY, drawWidth, drawHeight);
    if (maskCanvas && state.overlayVisible) {
      ctx.drawImage(maskCanvas, drawX, drawY, drawWidth, drawHeight);
    }

    if (state.roiVisible) {
      const contour = getStoredRoiContour(state.activeSliceIndex);
      if (contour?.points?.length >= 3) {
        ctx.save();
        ctx.beginPath();
        contour.points.forEach((point, index) => {
          const canvasX = drawX + ((point.x + 0.5) / volume.columns) * drawWidth;
          const canvasY = drawY + ((point.y + 0.5) / volume.rows) * drawHeight;
          if (index === 0) {
            ctx.moveTo(canvasX, canvasY);
          } else {
            ctx.lineTo(canvasX, canvasY);
          }
        });
        ctx.closePath();
        ctx.fillStyle = "rgba(110, 228, 255, 0.08)";
        ctx.strokeStyle = "#6ee4ff";
        ctx.lineWidth = 3;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else {
        const region = getAnalysisRegionInPixels();
        ctx.save();
        ctx.strokeStyle = COLORS.roi;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(
          drawX + (region.centerX / volume.columns) * drawWidth,
          drawY + (region.centerY / volume.rows) * drawHeight,
          (region.radiusX / volume.columns) * drawWidth,
          (region.radiusY / volume.rows) * drawHeight,
          region.angleRad || 0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
      }
    }

    const infoX = 960;
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 24px Aptos, sans-serif";
    ctx.fillText("Results", infoX, 170);
    ctx.font = "600 18px Aptos, sans-serif";
    const metrics = [
      `Coronary volume: ${results ? formatMm3(results.coronaryVolumeMm3) : "-"}`,
      `Total volume: ${results ? formatMm3(results.totalVolumeMm3) : "-"}`,
      `Equivalent mass: ${results ? formatMg(results.equivalentMassMg) : "-"}`,
      `Agatston: ${results ? formatScore(results.agatstonScore) : "-"}`,
      `Threshold: ${state.analysis.thresholdHu} HU`,
      `Min area: ${state.analysis.minAreaMm2.toFixed(1)} mm2`,
      `Mass factor: ${state.analysis.massCalibrationFactor.toFixed(2)}`,
    ];
    metrics.forEach((line, index) => {
      ctx.fillText(line, infoX, 216 + index * 36);
    });

    ctx.fillStyle = COLORS.muted;
    ctx.font = "500 17px Aptos, sans-serif";
    const methodLines = [
      "Research-only prototype. Not clinically validated.",
      "Automatic vessel labeling is heuristic and editable.",
      "Manual VOI and brush edits can include non-coronary labels.",
      "Agatston is slice-based with density factors 1-4.",
      "Equivalent mass is approximate and calibration-dependent.",
    ];
    methodLines.forEach((line, index) => {
      ctx.fillText(line, infoX, 520 + index * 28);
    });

    if (results?.rows?.length) {
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 22px Aptos, sans-serif";
      ctx.fillText("Per-Vessel / Category", infoX, 670);
      const tableTop = 708;
      const colX = [infoX, infoX + 175, infoX + 330, infoX + 500];
      ctx.font = "600 14px Aptos, sans-serif";
      ["Vessel", "Volume", "Eq. Mass", "Agatston"].forEach((heading, index) => {
        ctx.fillText(heading, colX[index], tableTop);
      });
      results.rows.forEach((row, index) => {
        const y = tableTop + 34 + index * 28;
        const labelMeta = getLabelMeta(row.labelCode);
        if (labelMeta && !row.isTotal) {
          ctx.fillStyle = labelMeta.stroke;
          ctx.fillRect(infoX, y - 12, 10, 10);
        }
        ctx.fillStyle = row.isTotal ? COLORS.text : COLORS.muted;
        ctx.fillText(row.vessel, infoX + 18, y);
        ctx.fillText(String(row.volume_mm3), colX[1], y);
        ctx.fillText(String(row.equivalent_mass_mg), colX[2], y);
        ctx.fillText(String(row.agatston_score), colX[3], y);
      });
    }

    const filename = `${buildExportBaseNameWithStudyId(studyId)}_calcscorer_review.png`;
    return new Promise((resolve) => {
      exportCanvas.toBlob((blob) => {
        if (!blob) {
          resolve(false);
          return;
        }
        downloadBlob(blob, filename, { patientStudyId: studyId });
        if (!options?.suppressStatus) {
          setStatus(studyId ? `Exported review PNG for Study ID ${studyId}.` : "Exported review PNG.", null);
        }
        resolve(true);
      }, "image/png");
    });
  }

  async function finishAndClosePatient() {
    const studyId = getTrimmedStudyId();
    if (!studyId) {
      if (els.finishModalError) {
        els.finishModalError.hidden = false;
      }
      els.finishStudyIdInput?.focus();
      return;
    }

    if (els.finishModalError) {
      els.finishModalError.hidden = true;
    }

    exportCsv({ studyId, suppressStatus: true });
    const pngOk = await exportReviewPng({ studyId, suppressStatus: true });
    if (!pngOk) {
      setStatus("Failed to export the review PNG.", "error");
      return;
    }

    closeFinishModal();
    clearStudy({ silent: true });
    if (els.finishStudyIdInput) {
      els.finishStudyIdInput.value = "";
    }
    setStatus(`Exported CSV and PNG for Study ID ${studyId} and closed the current patient.`, null);
  }

  function handleSeriesCardClick(event) {
    const selectId = event.target.closest("[data-series-select]")?.dataset.seriesSelect;
    if (selectId) {
      state.selectedSeriesId = selectId;
      state.workflowStep = "series";
      updateSeriesListUi();
      refreshDerivedUi();
      return;
    }

    const loadId = event.target.closest("[data-series-load]")?.dataset.seriesLoad;
    if (loadId) {
      loadSeriesById(loadId).catch((error) => {
        setStatus(error.message || "Failed to load the selected series.", "error");
      });
    }
  }

  function handleLesionCardClick(event) {
    const labelSelect = event.target.closest("[data-label-select]")?.dataset.labelSelect;
    if (labelSelect) {
      state.selectedLabelCode = Number.parseInt(labelSelect, 10) || state.selectedLabelCode;
      state.analysis.activeComponentId = null;
      setWorkflowStep("label", { adoptTool: true, scroll: false });
      return;
    }

    const labelJump = event.target.closest("[data-label-jump]")?.dataset.labelJump;
    if (labelJump) {
      const labelCode = Number.parseInt(labelJump, 10);
      const components = state.analysis.components.filter((entry) => entry.labelCode === labelCode);
      if (!components.length) {
        return;
      }
      const targetSlice = Math.min(...components.map((component) => component.minSlice));
      state.selectedLabelCode = labelCode;
      state.analysis.activeComponentId = components[0].id;
      state.activeSliceIndex = targetSlice;
      setWorkflowStep("label", { adoptTool: true, scroll: false });
    }
  }

  function handleOverlayPointerDown(event) {
    const point = updatePointerFromEvent(event);
    if (!point || !state.activeVolume) {
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
      els.overlayCanvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      return;
    }

    if (state.tool === "roiAdjust") {
      if (event.button === 2) {
        const region = getAnalysisRegionInPixels();
        if (!region || !pointInsideAnalysisRegion(point.imageX, point.imageY, region)) {
          return;
        }
        state.analysis.roi.showAdvancedHandles = true;
        syncControlsFromState();
        requestRender();
        setStatus("Enabled advanced ROI handles, including rotation.", null);
        return;
      }
      const hit = getRoiAdjustHit(point);
      if (!hit) {
        return;
      }
      state.analysis.activeComponentId = null;
      state.dragging = {
        type: "roiAdjust",
        mode: hit.mode,
        pointerId: event.pointerId,
        startPoint: { x: point.imageX, y: point.imageY },
        startRegion: {
          centerX: hit.region.centerX,
          centerY: hit.region.centerY,
          radiusX: hit.region.radiusX,
          radiusY: hit.region.radiusY,
          angleDeg: hit.region.angleDeg || 0,
        },
      };
      els.overlayCanvas.setPointerCapture?.(event.pointerId);
      requestRender();
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
      const rect = els.overlayCanvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      state.dragging = {
        type: "zoom",
        pointerId: event.pointerId,
        startClientY: event.clientY,
        startZoom: state.view.zoom,
        focusCanvasPoint: {
          x: (event.clientX - rect.left) * dpr,
          y: (event.clientY - rect.top) * dpr,
        },
      };
      els.overlayCanvas.setPointerCapture?.(event.pointerId);
      updateCanvasCursor();
      return;
    }

    if (state.tool === "roiContour") {
      state.analysis.activeComponentId = null;
      state.dragging = {
        type: "roiDraw",
        sliceIndex: state.activeSliceIndex,
        pointerId: event.pointerId,
        points: [{ x: point.imageX, y: point.imageY }],
      };
      els.overlayCanvas.setPointerCapture?.(event.pointerId);
      requestRender();
      return;
    }

    if (state.tool === "voiDraw") {
      state.analysis.activeComponentId = null;
      state.dragging = {
        type: "voiDraw",
        sliceIndex: state.activeSliceIndex,
        pointerId: event.pointerId,
        points: [{ x: point.imageX, y: point.imageY }],
      };
      els.overlayCanvas.setPointerCapture?.(event.pointerId);
      requestRender();
      return;
    }

    if (state.tool === "tapLabel") {
      state.analysis.activeComponentId = null;
      state.dragging = {
        type: "labelDraw",
        sliceIndex: state.activeSliceIndex,
        pointerId: event.pointerId,
        startPixelIndex: point.pixelIndex,
        startPoint: { x: point.imageX, y: point.imageY },
        points: [{ x: point.imageX, y: point.imageY }],
        moved: false,
      };
      els.overlayCanvas.setPointerCapture?.(event.pointerId);
      return;
    }

    if (state.tool === "erase") {
      state.analysis.activeComponentId = null;
      state.dragging = {
        type: "eraseDraw",
        sliceIndex: state.activeSliceIndex,
        pointerId: event.pointerId,
        startPixelIndex: point.pixelIndex,
        startPoint: { x: point.imageX, y: point.imageY },
        points: [{ x: point.imageX, y: point.imageY }],
        moved: false,
      };
      els.overlayCanvas.setPointerCapture?.(event.pointerId);
      requestRender();
      return;
    }

    if (state.tool === "inspect") {
      selectComponentAt(point.pixelIndex);
      return;
    }

    if (state.tool === "exclude") {
      const componentId = selectComponentAt(point.pixelIndex);
      if (componentId != null) {
        excludeComponent(componentId);
      }
      return;
    }

    if (state.tool === "grow" || state.tool === "shrink") {
      const componentId = selectComponentAt(point.pixelIndex);
      if (componentId != null) {
        morphSelectedComponent(componentId, state.tool);
      }
      return;
    }

    if (state.tool === "add") {
      state.analysis.activeComponentId = null;
      applyBrushAt(point.imageX, point.imageY, state.tool);
      state.dragging = {
        type: "brush",
        mode: state.tool,
      };
      els.overlayCanvas.setPointerCapture?.(event.pointerId);
      requestRender();
    }
  }

  function handleOverlayPointerMove(event) {
    const point = updatePointerFromEvent(event);
    if (!state.dragging) {
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
      state.activeSliceIndex = clamp(state.dragging.startSliceIndex + sliceDelta, 0, Math.max(0, state.activeVolume.depth - 1));
      requestRender();
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
    if (!point) {
      return;
    }
    if (state.dragging.type === "roiAdjust") {
      applyFallbackRegionDrag(point);
      syncControlsFromState();
      requestRender();
      return;
    }
    if (state.dragging.type === "labelDraw" || state.dragging.type === "eraseDraw") {
      const nextPoint = { x: point.imageX, y: point.imageY };
      const lastPoint = state.dragging.points[state.dragging.points.length - 1];
      if (!state.dragging.moved) {
        state.dragging.moved = distanceBetweenPoints(state.dragging.startPoint, nextPoint) >= 2.2;
      }
      if (state.dragging.moved && (!lastPoint || distanceBetweenPoints(lastPoint, nextPoint) >= 0.8)) {
        state.dragging.points.push(nextPoint);
      }
      requestRender();
      return;
    }
    if (state.dragging.type === "brush") {
      applyBrushAt(point.imageX, point.imageY, state.dragging.mode);
      requestRender();
      return;
    }
    if (state.dragging.type === "voiDraw") {
      const lastPoint = state.dragging.points[state.dragging.points.length - 1];
      const nextPoint = { x: point.imageX, y: point.imageY };
      if (!lastPoint || distanceBetweenPoints(lastPoint, nextPoint) >= 0.8) {
        state.dragging.points.push(nextPoint);
        requestRender();
      }
      return;
    }
    if (state.dragging.type === "roiDraw") {
      const lastPoint = state.dragging.points[state.dragging.points.length - 1];
      const nextPoint = { x: point.imageX, y: point.imageY };
      if (!lastPoint || distanceBetweenPoints(lastPoint, nextPoint) >= 0.8) {
        state.dragging.points.push(nextPoint);
        requestRender();
      }
    }
  }

  function handleOverlayPointerUp(event) {
    const point = updatePointerFromEvent(event);
    const drag = state.dragging;
    if (!drag) {
      return;
    }

    if (drag.pointerId != null && event.pointerId != null && drag.pointerId !== event.pointerId) {
      return;
    }

    state.dragging = null;
    els.overlayCanvas.releasePointerCapture?.(event.pointerId);
    updateCanvasCursor();

    if (drag.type === "secondaryPending") {
      if (
        point &&
        state.view.interactionMode === "edit" &&
        (state.tool === "tapLabel" || state.tool === "erase")
      ) {
        eraseSeedComponent(point.pixelIndex);
      }
      return;
    }

    if (drag.type === "sliceScroll" || drag.type === "windowLevel" || drag.type === "pan" || drag.type === "zoom") {
      updateSelectionUi();
      return;
    }

    if (drag.type === "roiAdjust") {
      syncControlsFromState();
      state.workflowStep = "roi";
      runAutoDetection();
      setStatus("Adjusted the fallback heart ROI and reran automatic calcium scoring.", null);
      return;
    }
    if (drag.type === "labelDraw") {
      if (drag.moved && drag.points.length >= 6 && polygonArea(drag.points) >= 30) {
        applyPolygonEditOnCurrentSlice(drag.points, "include", state.selectedLabelCode);
      } else {
        const componentId = selectComponentAt(drag.startPixelIndex);
        if (componentId != null) {
          relabelComponent(componentId, state.selectedLabelCode);
        } else {
          manuallyLabelSeedComponent(drag.startPixelIndex, state.selectedLabelCode);
        }
      }
      return;
    }
    if (drag.type === "eraseDraw") {
      if (drag.moved && drag.points.length >= 6 && polygonArea(drag.points) >= 30) {
        applyPolygonEditOnCurrentSlice(drag.points, "erase");
      } else {
        eraseSeedComponent(drag.startPixelIndex);
      }
      return;
    }
    if (drag.type === "brush") {
      finalizeBrushEdit("Updated lesion mask.");
      return;
    }
    if (drag.type === "roiDraw") {
      if (drag.points.length < 6 || polygonArea(drag.points) < 30) {
        setStatus("Heart ROI contour was too small to save. Draw a larger closed loop.", "warning");
        requestRender();
        return;
      }
      state.workflowStep = "roi";
      setRoiContour(state.activeSliceIndex, drag.points, "anchor", `Manual ROI anchor on slice ${state.activeSliceIndex + 1}`);
      setStatus(`Saved heart ROI anchor for slice ${state.activeSliceIndex + 1}. Re-run auto score when ready.`, null);
      return;
    }
    if (drag.type === "voiDraw") {
      if (drag.points.length < 6 || polygonArea(drag.points) < 30) {
        setStatus("VOI was too small to save. Draw a larger closed loop.", "warning");
        requestRender();
        return;
      }
      state.voiDraftPoints = normalizeContourPoints(drag.points, state.activeVolume);
      state.workflowStep = "label";
      updateControlStates();
      syncControlsFromState();
      requestRender();
      setStatus(
        `Saved VOI on slice ${state.activeSliceIndex + 1}. Apply it across slices ${state.slabRange.start + 1}-${state.slabRange.end + 1}.`,
        null
      );
      return;
    }
  }

  function bindEvents() {
    els.dicomInput.addEventListener("change", async (event) => {
      try {
        await importStudyFiles(event.target.files, { append: false });
      } catch (error) {
        setStatus(error.message || "Failed to read DICOM files.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.dicomFolderInput.addEventListener("change", async (event) => {
      try {
        await importStudyFiles(event.target.files, { append: false });
      } catch (error) {
        setStatus(error.message || "Failed to read the DICOM folder.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.dicomAddInput.addEventListener("change", async (event) => {
      try {
        await importStudyFiles(event.target.files, { append: true });
      } catch (error) {
        setStatus(error.message || "Failed to add DICOM files.", "error");
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

    els.clearButton.addEventListener("click", () => {
      clearStudy();
    });

    els.finishCloseButton?.addEventListener("click", () => {
      openFinishModal();
    });

    els.finishCancelButton?.addEventListener("click", () => {
      closeFinishModal();
    });

    els.finishConfirmButton?.addEventListener("click", () => {
      finishAndClosePatient().catch((error) => {
        setStatus(error.message || "Failed to finish and close the current patient.", "error");
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

    els.finishStudyIdInput?.addEventListener("input", () => {
      if (els.finishModalError) {
        els.finishModalError.hidden = getTrimmedStudyId().length > 0;
      }
    });

    els.finishModal?.addEventListener("click", (event) => {
      if (event.target?.dataset?.modalClose === "true") {
        closeFinishModal();
      }
    });

    els.workflowButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setWorkflowStep(button.dataset.workflowStep, { adoptTool: true, scroll: true });
      });
    });

    els.seriesList.addEventListener("click", handleSeriesCardClick);
    els.lesionList.addEventListener("click", handleLesionCardClick);
    els.loadSelectedSeriesButton.addEventListener("click", () => {
      loadSeriesById(state.selectedSeriesId).catch((error) => {
        setStatus(error.message || "Failed to load the selected series.", "error");
      });
    });

    els.thresholdSlider.addEventListener("input", () => {
      state.analysis.thresholdHu = Number.parseInt(els.thresholdSlider.value, 10);
      els.thresholdReadout.textContent = `${state.analysis.thresholdHu} HU`;
    });

    els.minAreaSlider.addEventListener("input", () => {
      state.analysis.minAreaMm2 = Number.parseFloat(els.minAreaSlider.value);
      els.minAreaReadout.textContent = `${state.analysis.minAreaMm2.toFixed(1)} mm2`;
    });

    els.massFactorInput.addEventListener("change", () => {
      const value = Number.parseFloat(els.massFactorInput.value);
      if (!Number.isFinite(value) || value < 0) {
        els.massFactorInput.value = String(state.analysis.massCalibrationFactor);
        return;
      }
      state.analysis.massCalibrationFactor = value;
      if (state.analysis.maskSlices.length) {
        rebuildAnalysisOutputs();
      }
    });

    if (els.scoreTopSliceInput) {
      els.scoreTopSliceInput.addEventListener("change", () => {
        applyScoringSliceInputs();
        commitScoringSliceRange("Updated the scoring top and bottom slice range.");
      });
    }

    if (els.scoreBottomSliceInput) {
      els.scoreBottomSliceInput.addEventListener("change", () => {
        applyScoringSliceInputs();
        commitScoringSliceRange("Updated the scoring top and bottom slice range.");
      });
    }

    if (els.setScoreTopButton) {
      els.setScoreTopButton.addEventListener("click", () => {
        state.analysis.scoringSlices.top = state.activeSliceIndex;
        commitScoringSliceRange(`Set scoring top slice to ${state.activeSliceIndex + 1}.`);
      });
    }

    if (els.setScoreBottomButton) {
      els.setScoreBottomButton.addEventListener("click", () => {
        state.analysis.scoringSlices.bottom = state.activeSliceIndex;
        commitScoringSliceRange(`Set scoring bottom slice to ${state.activeSliceIndex + 1}.`);
      });
    }

    if (els.useFullScoreRangeButton) {
      els.useFullScoreRangeButton.addEventListener("click", () => {
        useFullScoringSliceRange();
        commitScoringSliceRange("Using the full axial stack for scoring.");
      });
    }

    if (els.activeLabelSelect) {
      els.activeLabelSelect.addEventListener("change", () => {
        state.selectedLabelCode = Number.parseInt(els.activeLabelSelect.value, 10) || state.selectedLabelCode;
        setWorkflowStep("label", { adoptTool: false, scroll: false });
      });
    }

    if (els.labelLegend) {
      els.labelLegend.addEventListener("click", (event) => {
        const code = Number.parseInt(event.target.closest("[data-label-chip]")?.dataset.labelChip || "", 10);
        if (!Number.isFinite(code)) {
          return;
        }
        state.selectedLabelCode = code;
        setWorkflowStep("label", { adoptTool: false, scroll: false });
      });
    }

    if (els.voiActionSelect) {
      els.voiActionSelect.addEventListener("change", () => {
        state.voiAction = els.voiActionSelect.value === "erase" ? "erase" : "include";
        setWorkflowStep("label", { adoptTool: false, scroll: false });
      });
    }

    if (els.slabStartInput) {
      els.slabStartInput.addEventListener("change", () => {
        if (!state.activeVolume) {
          return;
        }
        const nextValue = clamp(
          (Number.parseInt(els.slabStartInput.value, 10) || 1) - 1,
          0,
          Math.max(0, state.activeVolume.depth - 1)
        );
        state.slabRange.start = nextValue;
        syncControlsFromState();
      });
    }

    if (els.slabEndInput) {
      els.slabEndInput.addEventListener("change", () => {
        if (!state.activeVolume) {
          return;
        }
        const nextValue = clamp(
          (Number.parseInt(els.slabEndInput.value, 10) || 1) - 1,
          0,
          Math.max(0, state.activeVolume.depth - 1)
        );
        state.slabRange.end = nextValue;
        syncControlsFromState();
      });
    }

    if (els.setSlabStartButton) {
      els.setSlabStartButton.addEventListener("click", () => {
        state.slabRange.start = state.activeSliceIndex;
        syncControlsFromState();
        setStatus(`Set slab start to slice ${state.activeSliceIndex + 1}.`, null);
      });
    }

    if (els.setSlabEndButton) {
      els.setSlabEndButton.addEventListener("click", () => {
        state.slabRange.end = state.activeSliceIndex;
        syncControlsFromState();
        setStatus(`Set slab end to slice ${state.activeSliceIndex + 1}.`, null);
      });
    }

    if (els.applyVoiButton) {
      els.applyVoiButton.addEventListener("click", () => {
        try {
          applyVoiToSlab();
        } catch (error) {
          setStatus(error.message || "Failed to apply the VOI.", "error");
        }
      });
    }

    if (els.clearVoiButton) {
      els.clearVoiButton.addEventListener("click", () => {
        clearVoiDraft();
        setStatus("Cleared the current VOI draft.", null);
      });
    }

    [els.roiXSlider, els.roiYSlider, els.roiWidthSlider, els.roiHeightSlider].forEach((input) => {
      input.addEventListener("input", () => {
        state.analysis.roi.centerXPercent = Number.parseFloat(els.roiXSlider.value);
        state.analysis.roi.centerYPercent = Number.parseFloat(els.roiYSlider.value);
        state.analysis.roi.widthPercent = Number.parseFloat(els.roiWidthSlider.value);
        state.analysis.roi.heightPercent = Number.parseFloat(els.roiHeightSlider.value);
        requestRender();
      });
    });

    els.runDetectionButton.addEventListener("click", () => {
      try {
        runAutoDetection();
      } catch (error) {
        setStatus(error.message || "Failed to run calcium detection.", "error");
      }
    });

    els.restoreAutoButton.addEventListener("click", () => {
      if (!state.analysis.autoLabelSlices.length) {
        return;
      }
      clearOverrideSlices();
      state.analysis.activeComponentId = null;
      composeActiveLabelSlices();
      state.workflowStep = "label";
      rebuildAnalysisOutputs();
      setStatus("Restored the automatic label mask and cleared manual edits.", null);
    });

    els.segmentRoiButton.addEventListener("click", () => {
      segmentRoiBetweenAnchors().catch((error) => {
        setStatus(error.message || "Failed to segment the heart ROI between anchors.", "error");
      });
    });

    els.clearRoiSliceButton.addEventListener("click", () => {
      if (!getStoredRoiContour(state.activeSliceIndex)) {
        return;
      }
      clearRoiContour(state.activeSliceIndex);
      setStatus(`Cleared heart ROI contour for slice ${state.activeSliceIndex + 1}.`, null);
    });

    els.toolButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const nextTool = button.dataset.tool;
        const step =
          nextTool === "roiContour" || nextTool === "roiAdjust"
            ? "roi"
            : nextTool === "tapLabel" || nextTool === "voiDraw"
              ? "label"
              : "edit";
        state.workflowStep = step;
        setActiveTool(nextTool);
      });
    });

    if (els.brushSlider) {
      els.brushSlider.addEventListener("input", () => {
        state.brushRadiusPx = Number.parseInt(els.brushSlider.value, 10);
        if (els.brushReadout) {
          els.brushReadout.textContent = `${state.brushRadiusPx} px`;
        }
        requestRender();
      });
    }

    els.toggleOverlayButton.addEventListener("click", () => {
      state.overlayVisible = !state.overlayVisible;
      syncControlsFromState();
      requestRender();
    });

    els.toggleRoiButton.addEventListener("click", () => {
      state.roiVisible = !state.roiVisible;
      syncControlsFromState();
      requestRender();
    });

    els.clearSelectionButton.addEventListener("click", () => {
      state.analysis.activeComponentId = null;
      updateSelectionUi();
      requestRender();
    });

    els.exportCsvButton.addEventListener("click", exportCsv);
    els.exportPngButton.addEventListener("click", exportReviewPng);
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

    els.presetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.currentPreset = button.dataset.preset;
        state.currentVOI = { ...(VOI_PRESETS[state.currentPreset] || VOI_PRESETS.calcium) };
        syncControlsFromState();
        updateSelectionUi();
        requestRender();
      });
    });

    els.sliceSlider.addEventListener("input", () => {
      state.activeSliceIndex = Number.parseInt(els.sliceSlider.value, 10) || 0;
      updateControlStates();
      syncControlsFromState();
      requestRender();
    });

    els.overlayCanvas.addEventListener("pointerdown", handleOverlayPointerDown);
    els.overlayCanvas.addEventListener("pointermove", handleOverlayPointerMove);
    els.overlayCanvas.addEventListener("pointerleave", clearPointer);
    els.overlayCanvas.addEventListener("pointerup", handleOverlayPointerUp);
    els.overlayCanvas.addEventListener("pointercancel", handleOverlayPointerUp);
    els.overlayCanvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    els.overlayCanvas.addEventListener(
      "wheel",
      (event) => {
        if (!state.activeVolume) {
          return;
        }
        event.preventDefault();
        if (event.ctrlKey || event.metaKey || state.view.interactionMode === "zoom") {
          const rect = els.overlayCanvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          changeZoom(state.activeVolume ? (event.deltaY < 0 ? 1.1 : 0.9) : 1, {
            x: (event.clientX - rect.left) * dpr,
            y: (event.clientY - rect.top) * dpr,
          });
          return;
        }
        const delta = event.deltaY > 0 ? 1 : -1;
        state.activeSliceIndex = clamp(state.activeSliceIndex + delta, 0, Math.max(0, state.activeVolume.depth - 1));
        requestRender();
      },
      { passive: false }
    );

    window.addEventListener("keydown", (event) => {
      if (state.finishModalOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeFinishModal();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          finishAndClosePatient().catch((error) => {
            setStatus(error.message || "Failed to finish and close the current patient.", "error");
          });
          return;
        }
      }
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest("input") || target.closest("textarea") || target.closest("select"))
      ) {
        return;
      }
      if (!state.activeVolume) {
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        state.activeSliceIndex = clamp(state.activeSliceIndex - 1, 0, Math.max(0, state.activeVolume.depth - 1));
        requestRender();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        state.activeSliceIndex = clamp(state.activeSliceIndex + 1, 0, Math.max(0, state.activeVolume.depth - 1));
        requestRender();
        return;
      }
      if (event.key === "w" || event.key === "W") {
        event.preventDefault();
        setViewerMode("windowLevel");
        return;
      }
      if (event.key === "m" || event.key === "M" || event.key === "p" || event.key === "P") {
        event.preventDefault();
        setViewerMode("pan");
        return;
      }
      if (event.key === "z" || event.key === "Z") {
        event.preventDefault();
        setViewerMode("zoom");
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        resetViewTransform({ silent: true });
        return;
      }
      if (event.key === "e" || event.key === "E") {
        event.preventDefault();
        state.workflowStep = "edit";
        setActiveTool("erase");
        setViewerMode("edit", { sync: false });
        updateSelectionUi();
        updateCanvasCursor();
        requestRender();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        returnToPrimaryTool();
      }
    });

    window.addEventListener("resize", requestRender);
  }

  cacheElements();
  bindEvents();
  refreshExportStudyOptions().catch((error) => {
    console.error(error);
    setStatus(error.message || "Could not load export studies.", "error");
  });
  syncControlsFromState();
  clearStudy({ silent: true });
  setStatus("Ready for a calcium-scoring CT series", null);
})();
