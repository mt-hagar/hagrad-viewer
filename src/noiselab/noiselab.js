(function () {
  "use strict";

  const sharedCore = window.HAGRadCore;
  const dicomApi = window.HAGRadDicom;
  const exportStudyApi = window.HAGRadExportStudies || null;
  const core = window.HAGRadNoiseLabCore;
  const exportApi = window.HAGRadNoiseLabExport;

  if (!sharedCore || !dicomApi || !core || !exportApi) {
    throw new Error("NoiseLab dependencies are missing.");
  }

  const { clamp, collectDroppedFiles, formatSpacing, formatDimension, safeString } = sharedCore;
  const {
    APP_NAME,
    APP_VERSION,
    SQUARE_MODE_PIXEL,
    SQUARE_MODE_PHYSICAL,
    DEFAULT_FIXED_PIXEL_EDGES,
    DEFAULT_FIXED_PHYSICAL_EDGE_MM,
    DEFAULT_NPS_EDGE_PX,
    DEFAULT_NPS_RING_COUNT,
    DEFAULT_NPS_ROIS_PER_RING,
    DEFAULT_NPS_RING_SPACING_PX,
    NPS_ROI_TYPE,
    buildRoiProfileAnalysis,
    buildNpsAnalysisForRois,
    createSquareRoi,
    cloneRoi,
    resolveSquareGeometry,
    extractSquareRoiPixels,
    buildExportBundle,
    buildReconstructionComparisonBundle,
    roundForDisplay,
    patientPointToImageCoord,
    findNearestSliceIndexForPatientPoint,
  } = core;

  const state = {
    datasets: [],
    activeDatasetId: "",
    activeSliceIndex: 0,
    activeTool: "select",
    viewport: {
      zoom: 1,
      panX: 0,
      panY: 0,
      windowWidth: 400,
      windowCenter: 40,
    },
    roiMode: {
      squareMode: SQUARE_MODE_PIXEL,
      placementMode: "drag",
      fixedPixelEdge: DEFAULT_FIXED_PIXEL_EDGES[1],
      fixedMmEdge: DEFAULT_FIXED_PHYSICAL_EDGE_MM,
      centerScale: false,
    },
    analysisView: {
      profileType: "horizontal-center",
      histogramBins: 24,
    },
    activePage: "viewer",
    sidebarSections: {},
    nps: {
      edgePx: DEFAULT_NPS_EDGE_PX,
      ringCount: DEFAULT_NPS_RING_COUNT,
      roisPerRing: DEFAULT_NPS_ROIS_PER_RING,
      ringSpacingPx: DEFAULT_NPS_RING_SPACING_PX,
      includeCenter: true,
      activeSetId: "",
      draft: null,
      sets: [],
      sequence: 1,
      cache: new Map(),
    },
    rois: [],
    selectedRoiId: "",
    roiSequence: 1,
    dragging: null,
    suppressContextMenuUntil: 0,
    suppressSliceWheelUntil: 0,
    analysisCache: new Map(),
    export: {
      studies: [],
      currentStudyId: "",
    },
    renderFrame: 0,
  };

  const els = {};

  function syncCanvasSize(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return { width, height, ratio };
  }

  function getCurrentCanvasSize() {
    return syncCanvasSize(els.canvas);
  }

  function getCanvasClientScale() {
    const rect = els.canvas.getBoundingClientRect();
    const canvasSize = getCurrentCanvasSize();
    return {
      rect,
      canvasSize,
      ratioX: canvasSize.width / Math.max(1, rect.width),
      ratioY: canvasSize.height / Math.max(1, rect.height),
    };
  }

  function getActiveDataset() {
    return state.datasets.find((dataset) => dataset.id === state.activeDatasetId) || null;
  }

  function getActiveVolume() {
    return getActiveDataset()?.volume || null;
  }

  function getCurrentSlice() {
    return getActiveVolume()?.slices?.[state.activeSliceIndex] || null;
  }

  function getActiveRecord() {
    return getCurrentSlice()?.record || getActiveDataset()?.meta || null;
  }

  function getCurrentWindowDefaults() {
    const record = getActiveRecord();
    const slice = getCurrentSlice();
    return {
      windowWidth: Number(record?.windowWidth) || (slice ? Math.max(1, (slice.slope || 1) * 400) : 400),
      windowCenter: Number(record?.windowCenter) || (slice ? slice.intercept + 40 : 40),
    };
  }

  function getVisibleRois() {
    return state.rois.filter(
      (roi) => roi.datasetId === state.activeDatasetId && roi.sliceIndex === state.activeSliceIndex && roi.visible !== false
    );
  }

  function getActiveNpsSet() {
    const active = state.nps.sets.find(
      (set) =>
        set.id === state.nps.activeSetId &&
        set.datasetId === state.activeDatasetId &&
        set.sliceIndex === state.activeSliceIndex
    );
    if (active) {
      return active;
    }
    const fallback =
      state.nps.sets.find((set) => set.datasetId === state.activeDatasetId && set.sliceIndex === state.activeSliceIndex) ||
      null;
    state.nps.activeSetId = fallback?.id || "";
    return fallback;
  }

  function getNpsSetForRoi(roi) {
    if (!roi?.npsSetId) {
      return null;
    }
    return state.nps.sets.find((set) => set.id === roi.npsSetId) || null;
  }

  function getNpsSequenceStartForSet(setId) {
    const indices = state.rois
      .filter((roi) => roi.npsSetId === setId)
      .map((roi) => Number(String(roi.id || "").match(/\d+$/)?.[0]))
      .filter(Number.isFinite);
    return indices.length ? Math.max(1, Math.min(...indices)) : state.nps.sequence;
  }

  function getActiveNpsRois() {
    const set = getActiveNpsSet();
    if (!set) {
      return [];
    }
    return state.rois.filter(
      (roi) =>
        roi.datasetId === state.activeDatasetId &&
        roi.sliceIndex === state.activeSliceIndex &&
        roi.npsSetId === set.id &&
        roi.visible !== false
    );
  }

  function getSelectedRoi() {
    return state.rois.find((roi) => roi.id === state.selectedRoiId) || null;
  }

  function syncSliceScopedState() {
    const selected = getSelectedRoi();
    if (selected && (selected.datasetId !== state.activeDatasetId || selected.sliceIndex !== state.activeSliceIndex)) {
      state.selectedRoiId = "";
    }
    getActiveNpsSet();
  }

  function setActiveSliceIndex(sliceIndex) {
    const volume = getActiveVolume();
    if (!volume) {
      return;
    }
    state.activeSliceIndex = clamp(Number(sliceIndex) || 0, 0, volume.depth - 1);
    syncSliceScopedState();
  }

  function setStatus(message, level) {
    els.statusPill.textContent = message;
    els.statusPill.dataset.level = level || "";
  }

  function fitViewport() {
    state.viewport.zoom = 1;
    state.viewport.panX = 0;
    state.viewport.panY = 0;
    render();
  }

  function setActivePage(page) {
    state.activePage = page === "figures" ? "figures" : "viewer";
    if (els.viewerPanel && els.figuresPanel) {
      els.viewerPanel.classList.toggle("is-hidden", state.activePage !== "viewer");
      els.figuresPanel.classList.toggle("is-hidden", state.activePage !== "figures");
    }
    document.querySelectorAll("[data-page]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.page === state.activePage);
    });
    if (state.activePage === "viewer") {
      render();
    } else {
      renderAnalysisVisuals();
      renderNpsVisuals();
      renderComparisonVisuals();
    }
  }

  const DEFAULT_COLLAPSED_SIDEBAR_SECTIONS = new Set(["square-roi", "nps-rings", "roi-details", "export", "metadata"]);

  function sidebarSectionStorageKey(sectionId) {
    return `hagrad.noiselab.sidebar.${sectionId}`;
  }

  function getSidebarSectionId(section, index) {
    if (section.dataset.sectionId) {
      return section.dataset.sectionId;
    }
    const title = safeString(section.querySelector("h2")?.textContent) || `section-${index + 1}`;
    return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `section-${index + 1}`;
  }

  function setSidebarSectionCollapsed(sectionId, collapsed) {
    state.sidebarSections[sectionId] = Boolean(collapsed);
    try {
      window.localStorage?.setItem(sidebarSectionStorageKey(sectionId), collapsed ? "1" : "0");
    } catch (_error) {
      // Sidebar collapse state is helpful but not scientifically relevant.
    }
    updateSidebarSections();
  }

  function updateSidebarSections() {
    document.querySelectorAll(".sidebar-section[data-section-id]").forEach((section) => {
      const sectionId = section.dataset.sectionId;
      const collapsed = Boolean(state.sidebarSections[sectionId]);
      section.classList.toggle("is-collapsed", collapsed);
      const toggle = section.querySelector("[data-sidebar-section-toggle]");
      if (toggle) {
        toggle.textContent = collapsed ? "+" : "-";
        toggle.setAttribute("aria-expanded", String(!collapsed));
      }
    });
  }

  function initializeSidebarSections() {
    document.querySelectorAll(".sidebar-section").forEach((section, index) => {
      const sectionId = getSidebarSectionId(section, index);
      section.dataset.sectionId = sectionId;
      let collapsed = DEFAULT_COLLAPSED_SIDEBAR_SECTIONS.has(sectionId);
      try {
        const stored = window.localStorage?.getItem(sidebarSectionStorageKey(sectionId));
        if (stored === "0" || stored === "1") {
          collapsed = stored === "1";
        }
      } catch (_error) {
        // Ignore local storage failures.
      }
      state.sidebarSections[sectionId] = collapsed;
      const header = section.querySelector(".section-header");
      if (header && !header.querySelector("[data-sidebar-section-toggle]")) {
        const button = document.createElement("button");
        button.className = "section-toggle";
        button.type = "button";
        button.dataset.sidebarSectionToggle = sectionId;
        button.setAttribute("aria-label", `Toggle ${section.querySelector("h2")?.textContent || "section"}`);
        header.appendChild(button);
      }
    });
    updateSidebarSections();
  }

  function clearStudy() {
    state.datasets = [];
    state.activeDatasetId = "";
    state.activeSliceIndex = 0;
    state.rois = [];
    state.selectedRoiId = "";
    state.roiSequence = 1;
    state.analysisCache.clear();
    state.nps.activeSetId = "";
    state.nps.sets = [];
    state.nps.sequence = 1;
    state.nps.cache.clear();
    const defaults = getCurrentWindowDefaults();
    state.viewport.windowWidth = defaults.windowWidth;
    state.viewport.windowCenter = defaults.windowCenter;
    updateUi();
    render();
    setStatus("Ready for scientific image review");
  }

  function invalidateRoiCache(roiId) {
    if (!roiId) {
      state.analysisCache.clear();
      return;
    }
    Array.from(state.analysisCache.keys()).forEach((key) => {
      if (key.startsWith(`${roiId}::`)) {
        state.analysisCache.delete(key);
      }
    });
    state.nps.cache.clear();
  }

  function invalidateNpsCache() {
    state.nps.cache.clear();
  }

  function roiGeometryCacheSignature(roi, dataset) {
    const geometry = resolveSquareGeometry(roi, dataset?.volume || getActiveVolume());
    if (!geometry || geometry.error) {
      return [
        roi?.squareMode || "",
        roi?.centerXImg,
        roi?.centerYImg,
        roi?.edgePx,
        roi?.edgeMm,
      ].join(":");
    }
    return [
      geometry.squareMode,
      geometry.centerXImg,
      geometry.centerYImg,
      geometry.xMinBoundaryImg,
      geometry.yMinBoundaryImg,
      geometry.xMaxBoundaryImg,
      geometry.yMaxBoundaryImg,
      geometry.columnStart,
      geometry.rowStart,
      geometry.columnEnd,
      geometry.rowEnd,
      geometry.nominalEdgePx,
      geometry.nominalEdgeMm,
    ].join(":");
  }

  function analysisCacheKey(roi, dataset) {
    return `${roi.id}::${dataset?.id || roi.datasetId || ""}::${roi.sliceIndex}::${roiGeometryCacheSignature(roi, dataset)}`;
  }

  function getAnalysisForDatasetRoi(dataset, roi) {
    if (!dataset || !roi) {
      return { error: "No dataset or ROI selected." };
    }
    const key = analysisCacheKey(roi, dataset);
    if (state.analysisCache.has(key)) {
      return state.analysisCache.get(key);
    }
    const analysis = extractSquareRoiPixels(dataset.volume, roi.sliceIndex, roi);
    state.analysisCache.set(key, analysis);
    return analysis;
  }

  function getAnalysisForRoi(roi) {
    const dataset = state.datasets.find((entry) => entry.id === roi?.datasetId) || getActiveDataset();
    return getAnalysisForDatasetRoi(dataset, roi);
  }

  function getDatasetSliceRecord(dataset, sliceIndex) {
    return dataset?.volume?.slices?.[sliceIndex]?.record || dataset?.records?.[sliceIndex] || null;
  }

  function getPatientPointForImageCoord(dataset, sliceIndex, xImg, yImg) {
    const record = getDatasetSliceRecord(dataset, sliceIndex);
    return dicomApi.pixelCenterToPatient ? dicomApi.pixelCenterToPatient(record, xImg, yImg) : null;
  }

  function getProportionalSliceIndex(sourceDataset, sourceSliceIndex, targetDataset) {
    const sourceDepth = Math.max(1, sourceDataset?.volume?.depth || 1);
    const targetDepth = Math.max(1, targetDataset?.volume?.depth || 1);
    if (sourceDepth <= 1 || targetDepth <= 1) {
      return 0;
    }
    const fraction = clamp(Number(sourceSliceIndex) / Math.max(1, sourceDepth - 1), 0, 1);
    return clamp(Math.round(fraction * (targetDepth - 1)), 0, targetDepth - 1);
  }

  function findTargetSliceForSourcePoint(sourceDataset, sourceSliceIndex, targetDataset, sourcePoint) {
    const fallback = getProportionalSliceIndex(sourceDataset, sourceSliceIndex, targetDataset);
    return findNearestSliceIndexForPatientPoint(targetDataset?.volume, sourcePoint, fallback);
  }

  function setActiveDataset(datasetId, options = {}) {
    const previousDataset = getActiveDataset();
    const previousSliceIndex = state.activeSliceIndex;
    const previousVolume = previousDataset?.volume || null;
    const previousPoint =
      previousDataset && previousVolume
        ? getPatientPointForImageCoord(
            previousDataset,
            previousSliceIndex,
            previousVolume.columns / 2 - 0.5,
            previousVolume.rows / 2 - 0.5
          )
        : null;
    const dataset = state.datasets.find((entry) => entry.id === datasetId) || null;
    if (!dataset) {
      return;
    }
    state.activeDatasetId = dataset.id;
    if (Number.isFinite(options.sliceIndex)) {
      state.activeSliceIndex = clamp(Math.round(options.sliceIndex), 0, Math.max(0, dataset.volume.depth - 1));
    } else if (previousDataset && previousDataset.id !== dataset.id) {
      state.activeSliceIndex = findTargetSliceForSourcePoint(
        previousDataset,
        previousSliceIndex,
        dataset,
        previousPoint
      ).index;
    } else {
      state.activeSliceIndex = clamp(state.activeSliceIndex, 0, Math.max(0, dataset.volume.depth - 1));
    }
    syncSliceScopedState();
    const defaults = {
      windowWidth: Number(dataset.meta?.windowWidth) || state.viewport.windowWidth,
      windowCenter: Number(dataset.meta?.windowCenter) || state.viewport.windowCenter,
    };
    state.viewport.windowWidth = defaults.windowWidth;
    state.viewport.windowCenter = defaults.windowCenter;
    fitViewport();
    setStatus(`Loaded ${dataset.label}`);
    updateUi();
    render();
  }

  function getActiveDatasetIndex() {
    return state.datasets.findIndex((dataset) => dataset.id === state.activeDatasetId);
  }

  function setActiveDatasetByIndex(index) {
    if (!state.datasets.length) {
      return;
    }
    const clampedIndex = clamp(Math.round(Number(index) || 0), 0, state.datasets.length - 1);
    setActiveDataset(state.datasets[clampedIndex].id);
  }

  function activateSeriesCard(card, event) {
    const rawIndex = Number(card?.dataset?.seriesIndex);
    if (!Number.isFinite(rawIndex)) {
      return;
    }
    event?.preventDefault?.();
    event?.stopPropagation?.();
    try {
      setActiveDatasetByIndex(rawIndex);
    } catch (error) {
      setStatus(error?.message || "Could not switch reconstruction.", "error");
    }
  }

  function centerViewportOnRoi(roi) {
    const volume = getActiveVolume();
    if (!roi || !volume) {
      return;
    }
    const geometry = resolveSquareGeometry(roi, volume);
    if (!geometry || geometry.error) {
      return;
    }
    const canvasSize = getCurrentCanvasSize();
    const fitScale = Math.min(canvasSize.width / volume.columns, canvasSize.height / volume.rows);
    const scale = fitScale * (Number(state.viewport.zoom) || 1);
    const centeredOffsetX = (canvasSize.width - volume.columns * scale) / 2;
    const centeredOffsetY = (canvasSize.height - volume.rows * scale) / 2;
    state.viewport.panX = canvasSize.width / 2 - centeredOffsetX - (geometry.centerXImg + 0.5) * scale;
    state.viewport.panY = canvasSize.height / 2 - centeredOffsetY - (geometry.centerYImg + 0.5) * scale;
  }

  function selectRoiAndNavigate(roiId, options = {}) {
    const roi = state.rois.find((entry) => entry.id === roiId) || null;
    if (!roi) {
      return;
    }
    if (roi.datasetId !== state.activeDatasetId) {
      setActiveDataset(roi.datasetId, { sliceIndex: roi.sliceIndex });
    } else if (roi.sliceIndex !== state.activeSliceIndex) {
      setActiveSliceIndex(roi.sliceIndex);
    }
    state.selectedRoiId = roi.id;
    if (options.center !== false) {
      centerViewportOnRoi(roi);
    }
    if (options.openViewer !== false && state.activePage !== "viewer") {
      setActivePage("viewer");
    }
    updateUi();
    render();
    setStatus(`${roi.label || roi.id} selected${options.center === false ? "" : " and centered"}.`);
  }

  function stepActiveDataset(delta) {
    if (state.datasets.length < 2) {
      return;
    }
    const currentIndex = Math.max(0, getActiveDatasetIndex());
    const nextIndex = clamp(currentIndex + delta, 0, state.datasets.length - 1);
    if (nextIndex === currentIndex) {
      return;
    }
    setActiveDatasetByIndex(nextIndex);
  }

  async function loadFiles(files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) {
      return;
    }

    setStatus(`Reading ${list.length} DICOM file${list.length === 1 ? "" : "s"}...`);
    const records = await dicomApi.parseDicomFiles(list);
    if (!records.length) {
      throw new Error("No DICOM images were recognized in the selected files.");
    }

    const candidates = dicomApi.buildSeriesCandidates(records);
    if (!candidates.length) {
      throw new Error("No image series with pixel data were found.");
    }

    state.datasets = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      setStatus(`Building series ${index + 1} / ${candidates.length}...`);
      candidate.volume = await dicomApi.buildVolume(candidate.records, {
        statusCallback(current, total) {
          if (current === 1 || current === total || current % 10 === 0) {
            setStatus(`Loading ${candidate.label}: ${current} / ${total}`);
          }
        },
      });
      state.datasets.push(candidate);
    }

    state.rois = [];
    state.analysisCache.clear();
    state.nps.activeSetId = "";
    state.nps.sets = [];
    state.nps.sequence = 1;
    state.nps.cache.clear();
    state.selectedRoiId = "";
    state.roiSequence = 1;
    setActiveDataset(state.datasets[0].id);
    updateUi();
    render();
  }

  function getViewportTransform(canvasSize = getCurrentCanvasSize()) {
    const volume = getActiveVolume();
    if (!volume) {
      return {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        width: canvasSize.width,
        height: canvasSize.height,
      };
    }

    const fitScale = Math.min(canvasSize.width / volume.columns, canvasSize.height / volume.rows);
    const scale = fitScale * state.viewport.zoom;
    const offsetX = (canvasSize.width - volume.columns * scale) / 2 + state.viewport.panX;
    const offsetY = (canvasSize.height - volume.rows * scale) / 2 + state.viewport.panY;
    return {
      scale,
      offsetX,
      offsetY,
      width: canvasSize.width,
      height: canvasSize.height,
    };
  }

  function imageCoordToCanvas(coord, transform) {
    return transform.offsetX + (coord + 0.5) * transform.scale;
  }

  function canvasToImageCoord(clientX, clientY) {
    const { rect, canvasSize, ratioX, ratioY } = getCanvasClientScale();
    const x = (clientX - rect.left) * ratioX;
    const y = (clientY - rect.top) * ratioY;
    const transform = getViewportTransform(canvasSize);
    return {
      xImg: (x - transform.offsetX) / transform.scale - 0.5,
      yImg: (y - transform.offsetY) / transform.scale - 0.5,
      canvasX: x,
      canvasY: y,
      transform,
    };
  }

  function isImagePointInsideSource(xImg, yImg) {
    const volume = getActiveVolume();
    if (!volume) {
      return false;
    }
    return xImg >= -0.5 && xImg <= volume.columns - 0.5 && yImg >= -0.5 && yImg <= volume.rows - 0.5;
  }

  function normalizeNpsEdgePx(edgePx) {
    const rawEdge = Math.max(2, Math.round(Number(edgePx) || DEFAULT_NPS_EDGE_PX));
    return core.isPowerOfTwo(rawEdge) ? rawEdge : core.nextPowerOfTwo(rawEdge);
  }

  function getNpsSquareHalfDiagonalPx(edgePx) {
    return (Math.max(1, Number(edgePx) || 1) * Math.SQRT2) / 2;
  }

  function getNpsRingSpacingForBoundaryRadius(boundaryRadiusPx, edgePx, ringCount) {
    const count = Math.max(1, Math.round(Number(ringCount) || 1));
    return (Math.max(0, Number(boundaryRadiusPx) || 0) - getNpsSquareHalfDiagonalPx(edgePx)) / count;
  }

  function getMinimumPackedNpsRingSpacingPx(edgePx, roisPerRing) {
    const edge = Math.max(1, Number(edgePx) || 1);
    const count = Math.max(1, Math.round(Number(roisPerRing) || 1));
    if (count <= 1) {
      return edge;
    }
    return Math.max(edge, edge / Math.max(1e-6, 2 * Math.sin(Math.PI / count)));
  }

  function getDefaultContainedNpsRingSpacing(centerXImg, centerYImg, edgePx, ringCount, roisPerRing, volume) {
    const fit = computeMaxNpsRingSpacing(centerXImg, centerYImg, edgePx, ringCount, roisPerRing, volume);
    if (!fit.ok || !Number.isFinite(fit.maxRingSpacingPx)) {
      return Math.max(edgePx, DEFAULT_NPS_RING_SPACING_PX);
    }
    const packedSpacing = getMinimumPackedNpsRingSpacingPx(edgePx, roisPerRing);
    return clamp(packedSpacing, edgePx, Math.max(edgePx, fit.maxRingSpacingPx));
  }

  function createConcentricNpsRoisExact(options) {
    const centerXImg = Number(options?.centerXImg) || 0;
    const centerYImg = Number(options?.centerYImg) || 0;
    const edgePx = normalizeNpsEdgePx(options?.edgePx);
    const ringCount = Math.max(0, Math.round(Number(options?.ringCount) || DEFAULT_NPS_RING_COUNT));
    const roisPerRing = Math.max(1, Math.round(Number(options?.roisPerRing) || DEFAULT_NPS_ROIS_PER_RING));
    const ringSpacingPx = Math.max(0, Number(options?.ringSpacingPx) || DEFAULT_NPS_RING_SPACING_PX);
    const includeCenter = options?.includeCenter !== false;
    const setId = safeString(options?.setId) || `nps_${Date.now()}`;
    const datasetId = safeString(options?.datasetId) || "";
    const sliceIndex = Number.isFinite(options?.sliceIndex) ? Math.round(options.sliceIndex) : 0;
    let sequence = Math.max(1, Math.round(Number(options?.sequenceStart) || 1));
    const rois = [];

    function addRoi(x, y, ringIndex, angleIndex, angleRadians, radiusPx) {
      const roi = createSquareRoi({
        sequence,
        datasetId,
        sliceIndex,
        squareMode: SQUARE_MODE_PIXEL,
        centerXImg: x,
        centerYImg: y,
        edgePx,
      });
      roi.type = NPS_ROI_TYPE;
      roi.id = `nps_${String(sequence).padStart(3, "0")}`;
      roi.label = ringIndex === 0 ? `NPS center ${String(sequence).padStart(2, "0")}` : `NPS r${ringIndex} a${angleIndex + 1}`;
      roi.npsSetId = setId;
      roi.npsRingIndex = ringIndex;
      roi.npsAngleIndex = angleIndex;
      roi.npsAngleRadians = angleRadians;
      roi.npsRadiusPx = radiusPx;
      roi.updatedAt = new Date().toISOString();
      rois.push(roi);
      sequence += 1;
    }

    if (includeCenter) {
      addRoi(centerXImg, centerYImg, 0, 0, 0, 0);
    }

    for (let ringIndex = 1; ringIndex <= ringCount; ringIndex += 1) {
      const radiusPx = ringIndex * ringSpacingPx;
      for (let angleIndex = 0; angleIndex < roisPerRing; angleIndex += 1) {
        const angleRadians = (2 * Math.PI * angleIndex) / roisPerRing;
        addRoi(
          centerXImg + Math.cos(angleRadians) * radiusPx,
          centerYImg + Math.sin(angleRadians) * radiusPx,
          ringIndex,
          angleIndex,
          angleRadians,
          radiusPx
        );
      }
    }

    return {
      setId,
      centerXImg,
      centerYImg,
      edgePx,
      ringCount,
      roisPerRing,
      ringSpacingPx,
      includeCenter,
      rois,
      nextSequence: sequence,
    };
  }

  function getPixelSquareSafeCenterLimits(volume, edgePx) {
    const edge = Math.max(1, Number(edgePx) || 1);
    const half = edge / 2;
    return {
      minX: -0.5 + half,
      maxX: Number(volume?.columns || 0) - 0.5 - half,
      minY: -0.5 + half,
      maxY: Number(volume?.rows || 0) - 0.5 - half,
    };
  }

  function isPointInsideLimits(xImg, yImg, limits) {
    return (
      Number.isFinite(xImg) &&
      Number.isFinite(yImg) &&
      xImg >= limits.minX &&
      xImg <= limits.maxX &&
      yImg >= limits.minY &&
      yImg <= limits.maxY
    );
  }

  function maxRadiusAlongAngle(centerXImg, centerYImg, angleRadians, limits) {
    const cos = Math.cos(angleRadians);
    const sin = Math.sin(angleRadians);
    let radius = Number.POSITIVE_INFINITY;
    if (cos > 1e-9) {
      radius = Math.min(radius, (limits.maxX - centerXImg) / cos);
    } else if (cos < -1e-9) {
      radius = Math.min(radius, (limits.minX - centerXImg) / cos);
    }
    if (sin > 1e-9) {
      radius = Math.min(radius, (limits.maxY - centerYImg) / sin);
    } else if (sin < -1e-9) {
      radius = Math.min(radius, (limits.minY - centerYImg) / sin);
    }
    return Math.max(0, radius);
  }

  function computeMaxNpsRingSpacing(centerXImg, centerYImg, edgePx, ringCount, roisPerRing, volume) {
    const limits = getPixelSquareSafeCenterLimits(volume, edgePx);
    if (limits.minX > limits.maxX || limits.minY > limits.maxY) {
      return {
        ok: false,
        message: "NPS ROI edge is larger than the source image. Reduce ROI Edge before generating NPS rings.",
        limits,
        maxRingSpacingPx: 0,
      };
    }
    if (!isPointInsideLimits(centerXImg, centerYImg, limits)) {
      return {
        ok: false,
        message:
          "NPS center is too close to, or outside, the source image boundary for the selected ROI edge. Move the center inside the CT image.",
        limits,
        maxRingSpacingPx: 0,
      };
    }
    if (ringCount <= 0) {
      return {
        ok: true,
        limits,
        maxRingSpacingPx: Number.POSITIVE_INFINITY,
      };
    }

    let maxOuterRadiusPx = Number.POSITIVE_INFINITY;
    for (let angleIndex = 0; angleIndex < roisPerRing; angleIndex += 1) {
      const angleRadians = (2 * Math.PI * angleIndex) / roisPerRing;
      maxOuterRadiusPx = Math.min(maxOuterRadiusPx, maxRadiusAlongAngle(centerXImg, centerYImg, angleRadians, limits));
    }
    return {
      ok: Number.isFinite(maxOuterRadiusPx) && maxOuterRadiusPx > 0,
      limits,
      maxRingSpacingPx: Math.max(0, maxOuterRadiusPx / Math.max(1, ringCount)),
    };
  }

  function captureRoiGeometry(roi) {
    return {
      centerXImg: roi.centerXImg,
      centerYImg: roi.centerYImg,
      edgePx: roi.edgePx,
      edgeMm: roi.edgeMm,
      label: roi.label,
      visible: roi.visible,
    };
  }

  function restoreRoiGeometry(roi, snapshot) {
    if (!roi || !snapshot) {
      return;
    }
    roi.centerXImg = snapshot.centerXImg;
    roi.centerYImg = snapshot.centerYImg;
    roi.edgePx = snapshot.edgePx;
    roi.edgeMm = snapshot.edgeMm;
    roi.label = snapshot.label;
    roi.visible = snapshot.visible;
  }

  function getRoiSourceFit(roi, volume = getActiveVolume()) {
    if (!roi || !volume) {
      return {
        ok: false,
        message: "Load a source image before placing an ROI.",
        geometry: null,
      };
    }
    const geometry = resolveSquareGeometry(roi, volume);
    if (!geometry || geometry.error) {
      return {
        ok: false,
        message: geometry?.error || "ROI geometry could not be resolved.",
        geometry,
      };
    }
    const clipped =
      geometry.selectedColumnCount !== geometry.intendedSelectedColumnCount ||
      geometry.selectedRowCount !== geometry.intendedSelectedRowCount;
    if (geometry.touchesBoundary || clipped || !geometry.selectedColumnCount || !geometry.selectedRowCount) {
      return {
        ok: false,
        message:
          `${roi.label || "ROI"} would extend outside the source image. ` +
          "Move the mouse inward or reduce the ROI size; NoiseLab will not silently relocate it.",
        geometry,
      };
    }
    return { ok: true, message: "", geometry };
  }

  function isRoiFullyInsideSource(roi, volume = getActiveVolume()) {
    return getRoiSourceFit(roi, volume).ok;
  }

  function zoomViewportAtClientPoint(clientX, clientY, nextZoom) {
    const volume = getActiveVolume();
    if (!volume) {
      return false;
    }
    const pointer = canvasToImageCoord(clientX, clientY);
    const currentZoom = Number(state.viewport.zoom) || 1;
    const clampedZoom = clamp(nextZoom, 0.2, 30);
    if (Math.abs(clampedZoom - currentZoom) < 0.0001) {
      return false;
    }
    state.viewport.zoom = clampedZoom;
    const nextTransform = getViewportTransform();
    const projectedX = imageCoordToCanvas(pointer.xImg, nextTransform);
    const projectedY = nextTransform.offsetY + (pointer.yImg + 0.5) * nextTransform.scale;
    state.viewport.panX += pointer.canvasX - projectedX;
    state.viewport.panY += pointer.canvasY - projectedY;
    return true;
  }

  function findRoiHit(xImg, yImg) {
    const visible = getVisibleRois();
    const transform = getViewportTransform();
    const imageTolerance = Math.max(0.75, 10 / Math.max(0.001, transform.scale));
    for (let index = visible.length - 1; index >= 0; index -= 1) {
      const roi = visible[index];
      const geometry = resolveSquareGeometry(roi, getActiveVolume());
      if (!geometry || geometry.error) {
        continue;
      }
      const corners = [
        { name: "nw", x: geometry.xMinBoundaryImg, y: geometry.yMinBoundaryImg },
        { name: "ne", x: geometry.xMaxBoundaryImg, y: geometry.yMinBoundaryImg },
        { name: "se", x: geometry.xMaxBoundaryImg, y: geometry.yMaxBoundaryImg },
        { name: "sw", x: geometry.xMinBoundaryImg, y: geometry.yMaxBoundaryImg },
      ];
      const handle = corners.find((corner) => Math.hypot(corner.x - xImg, corner.y - yImg) <= imageTolerance);
      if (handle) {
        return {
          roi,
          geometry,
          hitType: "handle",
          handleName: handle.name,
        };
      }
      const withinX = xImg >= geometry.xMinBoundaryImg && xImg <= geometry.xMaxBoundaryImg;
      const withinY = yImg >= geometry.yMinBoundaryImg && yImg <= geometry.yMaxBoundaryImg;
      if (!withinX || !withinY) {
        continue;
      }
      return {
        roi,
        geometry,
        hitType: "body",
        handleName: "",
      };
    }
    return null;
  }

  function cursorForRoiHit(hit) {
    if (!hit) {
      return "";
    }
    if (hit.hitType === "handle") {
      return hit.handleName === "nw" || hit.handleName === "se" ? "nwse-resize" : "nesw-resize";
    }
    return "move";
  }

  function cursorForActiveTool() {
    if (state.activeTool === "pan") {
      return "grab";
    }
    if (state.activeTool === "windowLevel") {
      return "crosshair";
    }
    if (state.activeTool === "zoom") {
      return "zoom-in";
    }
    if (state.activeTool === "squareRoi" || state.activeTool === "npsConcentric") {
      return "crosshair";
    }
    return "";
  }

  function updateCanvasCursor(event) {
    if (!els.canvas) {
      return;
    }
    if (!getActiveVolume()) {
      els.canvas.style.cursor = "";
      return;
    }
    if (state.dragging?.type === "move-roi") {
      els.canvas.style.cursor = "move";
      return;
    }
    if (state.dragging?.type === "resize-roi") {
      els.canvas.style.cursor = cursorForRoiHit({ hitType: "handle", handleName: state.dragging.handleName });
      return;
    }
    if (state.dragging?.type === "move-nps-set") {
      els.canvas.style.cursor = "move";
      return;
    }
    if (state.dragging?.type === "resize-nps-set") {
      els.canvas.style.cursor = "nwse-resize";
      return;
    }
    if (state.dragging?.type === "pan") {
      els.canvas.style.cursor = "grabbing";
      return;
    }
    if (event) {
      const pointer = canvasToImageCoord(event.clientX, event.clientY);
      const hit = findRoiHit(pointer.xImg, pointer.yImg);
      if (hit && !event.shiftKey) {
        els.canvas.style.cursor = cursorForRoiHit(hit);
        return;
      }
    }
    els.canvas.style.cursor = cursorForActiveTool();
  }

  function setActiveTool(toolName) {
    const nextTool = toolName || "select";
    if (state.activeTool === "npsConcentric" && nextTool !== "npsConcentric") {
      state.nps.draft = null;
      render();
    }
    state.activeTool = nextTool;
    document.querySelectorAll("[data-tool]").forEach((candidate) => {
      candidate.classList.toggle("is-active", candidate.dataset.tool === state.activeTool);
    });
    updateCanvasCursor();
  }

  function renderBaseImage(ctx, transform) {
    const volume = getActiveVolume();
    const slice = getCurrentSlice();
    if (!volume || !slice) {
      ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
      ctx.fillStyle = "#0d141b";
      ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
      return;
    }

    const imageData = exportApi.buildOverlayFigureSpec(
      volume,
      createSquareRoi({
        id: "temp",
        label: "temp",
        datasetId: state.activeDatasetId,
        sliceIndex: state.activeSliceIndex,
        centerXImg: volume.columns / 2 - 0.5,
        centerYImg: volume.rows / 2 - 0.5,
        edgePx: 1,
      }),
      state.viewport,
      { title: "" }
    )?.image;

    const offscreen = renderBaseImage.offscreen || (renderBaseImage.offscreen = document.createElement("canvas"));
    offscreen.width = volume.columns;
    offscreen.height = volume.rows;
    const offscreenCtx = offscreen.getContext("2d");
    const browserImageData = new ImageData(imageData.data, imageData.width, imageData.height);
    offscreenCtx.putImageData(browserImageData, 0, 0);

    ctx.save();
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    ctx.fillStyle = "#0d141b";
    ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      offscreen,
      transform.offsetX,
      transform.offsetY,
      volume.columns * transform.scale,
      volume.rows * transform.scale
    );
    ctx.strokeStyle = "rgba(139, 171, 190, 0.34)";
    ctx.lineWidth = Math.max(1, window.devicePixelRatio || 1);
    ctx.strokeRect(transform.offsetX, transform.offsetY, volume.columns * transform.scale, volume.rows * transform.scale);
    ctx.restore();
  }

  function drawRoi(ctx, roi, selected, transform) {
    const geometry = resolveSquareGeometry(roi, getActiveVolume());
    if (!geometry || geometry.error) {
      return;
    }

    const left = imageCoordToCanvas(geometry.xMinBoundaryImg, transform);
    const top = imageCoordToCanvas(geometry.yMinBoundaryImg, transform);
    const right = imageCoordToCanvas(geometry.xMaxBoundaryImg, transform);
    const bottom = imageCoordToCanvas(geometry.yMaxBoundaryImg, transform);
    const width = right - left;
    const height = bottom - top;
    const handleRadius = Math.max(4, 4 + transform.scale * 0.015);
    const isNpsRoi = roi.type === NPS_ROI_TYPE;

    ctx.save();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.92)";
    ctx.lineWidth = selected ? 5 : 4;
    ctx.strokeRect(left, top, width, height);
    ctx.fillStyle = isNpsRoi ? "rgba(240, 197, 114, 0.08)" : "rgba(255, 211, 95, 0.1)";
    ctx.fillRect(left, top, width, height);
    ctx.strokeStyle = selected ? "#fff1a6" : isNpsRoi ? "#f0c572" : "#ffd35f";
    ctx.lineWidth = selected ? 2.4 : 1.8;
    ctx.strokeRect(left, top, width, height);

    if (!isNpsRoi || selected) {
      const analysis = getAnalysisForRoi(roi);
      const sd = analysis.statsCalibrated?.sd;
      const badge = Number.isFinite(sd) ? `SD ${roundForDisplay(sd, 2)} ${analysis.units}` : roi.label;
      const label = `${roi.label} · ${badge}`;
      ctx.font = `${Math.max(11, 12 * (window.devicePixelRatio || 1))}px Menlo, monospace`;
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(0, 0, 0, 0.74)";
      ctx.fillRect(left + 4, Math.max(0, top - 26), textWidth + 14, 20);
      ctx.fillStyle = "#fff9dc";
      ctx.fillText(label, left + 10, Math.max(12, top - 12));
    }

    if (selected) {
      [
        [left, top],
        [right, top],
        [right, bottom],
        [left, bottom],
      ].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#5a4b11";
        ctx.arc(x, y, handleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }

    ctx.restore();
  }

  function drawNpsLayout(ctx, transform) {
    const set = getActiveNpsSet();
    if (!set || set.datasetId !== state.activeDatasetId || set.sliceIndex !== state.activeSliceIndex) {
      return;
    }

    const centerX = imageCoordToCanvas(set.centerXImg, transform);
    const centerY = imageCoordToCanvas(set.centerYImg, transform);
    ctx.save();
    ctx.strokeStyle = "rgba(240, 197, 114, 0.48)";
    ctx.fillStyle = "rgba(240, 197, 114, 0.86)";
    ctx.lineWidth = 1.2;
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([6, 6]);
    }
    for (let ringIndex = 1; ringIndex <= set.ringCount; ringIndex += 1) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, ringIndex * set.ringSpacingPx * transform.scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(4, 4 * (window.devicePixelRatio || 1)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function buildNpsDraftPreview(draft) {
    if (!draft) {
      return null;
    }
    const edgePx = normalizeNpsEdgePx(state.nps.edgePx);
    const ringCount = Math.max(1, Math.round(Number(state.nps.ringCount) || DEFAULT_NPS_RING_COUNT));
    const radiusPx = Math.max(0, Math.abs(Number(draft.radiusPx) || 0));
    const ringSpacingPx = getNpsRingSpacingForBoundaryRadius(radiusPx, edgePx, ringCount);
    const layout = createConcentricNpsRoisExact({
      setId: "nps_draft",
      datasetId: draft.datasetId,
      sliceIndex: draft.sliceIndex,
      centerXImg: draft.centerXImg,
      centerYImg: draft.centerYImg,
      edgePx,
      ringCount,
      roisPerRing: state.nps.roisPerRing,
      ringSpacingPx,
      includeCenter: state.nps.includeCenter,
      sequenceStart: state.nps.sequence,
    });
    const spacingValid = ringSpacingPx >= edgePx - 1e-6;
    const validation = spacingValid
      ? validateNpsLayoutInsideImage(layout, getActiveVolume())
      : { ok: false, message: "NPS ring radius is smaller than the ROI edge." };
    return {
      layout,
      validation,
      radiusPx,
      ringSpacingPx,
      ok: Boolean(validation.ok),
    };
  }

  function drawDraftRoiBox(ctx, roi, transform, ok) {
    const geometry = resolveSquareGeometry(roi, getActiveVolume());
    if (!geometry || geometry.error) {
      return;
    }
    const left = imageCoordToCanvas(geometry.xMinBoundaryImg, transform);
    const top = imageCoordToCanvas(geometry.yMinBoundaryImg, transform);
    const right = imageCoordToCanvas(geometry.xMaxBoundaryImg, transform);
    const bottom = imageCoordToCanvas(geometry.yMaxBoundaryImg, transform);
    ctx.save();
    ctx.fillStyle = ok ? "rgba(240, 197, 114, 0.08)" : "rgba(255, 99, 99, 0.1)";
    ctx.strokeStyle = ok ? "rgba(240, 197, 114, 0.95)" : "rgba(255, 99, 99, 0.95)";
    ctx.lineWidth = Math.max(1.4, 1.4 * (window.devicePixelRatio || 1));
    ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.restore();
  }

  function drawNpsDraft(ctx, transform) {
    const draft = state.nps.draft;
    if (!draft || draft.datasetId !== state.activeDatasetId || draft.sliceIndex !== state.activeSliceIndex) {
      return;
    }
    const preview = buildNpsDraftPreview(draft);
    const centerX = imageCoordToCanvas(draft.centerXImg, transform);
    const centerY = imageCoordToCanvas(draft.centerYImg, transform);
    const radius = Math.max(1, Math.abs(draft.radiusPx || 0) * transform.scale);
    const ok = preview?.ok !== false;
    ctx.save();
    ctx.strokeStyle = ok ? "rgba(240, 197, 114, 0.9)" : "rgba(255, 99, 99, 0.95)";
    ctx.fillStyle = ok ? "rgba(240, 197, 114, 0.08)" : "rgba(255, 99, 99, 0.08)";
    ctx.lineWidth = Math.max(1, window.devicePixelRatio || 1);
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([8, 5]);
    }
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([]);
    }
    preview?.layout?.rois?.forEach((roi) => drawDraftRoiBox(ctx, roi, transform, ok));
    ctx.fillStyle = ok ? "#f0c572" : "#ff6363";
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(4, 4 * (window.devicePixelRatio || 1)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function clipToSourceImage(ctx, transform, draw) {
    const volume = getActiveVolume();
    if (!volume) {
      draw();
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(transform.offsetX, transform.offsetY, volume.columns * transform.scale, volume.rows * transform.scale);
    ctx.clip();
    draw();
    ctx.restore();
  }

  function render() {
    if (!els.canvas) {
      return;
    }
    const ctx = els.canvas.getContext("2d");
    const transform = getViewportTransform();
    renderBaseImage(ctx, transform);
    clipToSourceImage(ctx, transform, () => {
      drawNpsLayout(ctx, transform);
      drawNpsDraft(ctx, transform);
      getVisibleRois().forEach((roi) => {
        drawRoi(ctx, roi, roi.id === state.selectedRoiId, transform);
      });
    });
  }

  function scheduleRender() {
    if (state.renderFrame) {
      return;
    }
    state.renderFrame = window.requestAnimationFrame(() => {
      state.renderFrame = 0;
      render();
    });
  }

  function formatRoiMetric(value, suffix, digits) {
    if (!Number.isFinite(value)) {
      return "-";
    }
    return `${roundForDisplay(value, digits)}${suffix ? ` ${suffix}` : ""}`;
  }

  function sanitizeExportPart(value, fallback) {
    const cleaned = String(value || "")
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "_")
      .replace(/^_+|_+$/g, "");
    return cleaned || fallback || "export";
  }

  function prefixExportFile(file, prefix) {
    if (!prefix || !file?.name) {
      return file;
    }
    return {
      ...file,
      name: `${prefix}_${file.name}`,
    };
  }

  function encodeTextBase64(text) {
    const bytes = new TextEncoder().encode(String(text || ""));
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  function decodeBase64ToBytes(base64) {
    const binary = atob(String(base64 || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function exportFileToBytes(file) {
    if (typeof file?.contentBase64 === "string") {
      return decodeBase64ToBytes(file.contentBase64);
    }
    return new TextEncoder().encode(String(file?.content || ""));
  }

  function makeZipPath(...parts) {
    return parts
      .filter(Boolean)
      .map((part) =>
        String(part)
          .trim()
          .replace(/\\/g, "/")
          .split("/")
          .map((segment) => sanitizeExportPart(segment, "file"))
          .filter(Boolean)
          .join("/")
      )
      .filter(Boolean)
      .join("/");
  }

  let crc32Table = null;

  function getCrc32Table() {
    if (crc32Table) {
      return crc32Table;
    }
    crc32Table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crc32Table[index] = value >>> 0;
    }
    return crc32Table;
  }

  function crc32(bytes) {
    const table = getCrc32Table();
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
      crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function zipDateTime(date) {
    const value = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    const dosTime = (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2);
    const dosDate = ((value.getFullYear() - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate();
    return { dosTime, dosDate };
  }

  function makeZipHeader(length) {
    return {
      bytes: new Uint8Array(length),
      view: null,
    };
  }

  function writeZipHeader(header, values) {
    const view = header.view || new DataView(header.bytes.buffer);
    header.view = view;
    values.forEach(([offset, size, value]) => {
      if (size === 2) {
        view.setUint16(offset, value, true);
      } else {
        view.setUint32(offset, value >>> 0, true);
      }
    });
    return header.bytes;
  }

  function concatBytes(chunks, totalLength) {
    const output = new Uint8Array(totalLength);
    let offset = 0;
    chunks.forEach((chunk) => {
      output.set(chunk, offset);
      offset += chunk.length;
    });
    return output;
  }

  async function createZipBlob(files) {
    const encoder = new TextEncoder();
    const timestamp = zipDateTime(new Date());
    const localChunks = [];
    const centralChunks = [];
    const records = [];
    let offset = 0;

    for (const file of files || []) {
      const name = makeZipPath(file?.name || "file");
      if (!name) {
        continue;
      }
      const nameBytes = encoder.encode(name);
      const dataBytes = exportFileToBytes(file);
      if (nameBytes.length > 0xffff || dataBytes.length > 0xffffffff || offset > 0xffffffff) {
        throw new Error("The export bundle is too large for browser ZIP export.");
      }
      const checksum = crc32(dataBytes);
      const localHeader = writeZipHeader(makeZipHeader(30), [
        [0, 4, 0x04034b50],
        [4, 2, 20],
        [6, 2, 0x0800],
        [8, 2, 0],
        [10, 2, timestamp.dosTime],
        [12, 2, timestamp.dosDate],
        [14, 4, checksum],
        [18, 4, dataBytes.length],
        [22, 4, dataBytes.length],
        [26, 2, nameBytes.length],
        [28, 2, 0],
      ]);
      localChunks.push(localHeader, nameBytes, dataBytes);
      records.push({ nameBytes, dataBytes, checksum, localOffset: offset });
      offset += localHeader.length + nameBytes.length + dataBytes.length;
    }

    const centralOffset = offset;
    if (records.length > 0xffff) {
      throw new Error("The export bundle has too many files for browser ZIP export.");
    }
    records.forEach((record) => {
      const centralHeader = writeZipHeader(makeZipHeader(46), [
        [0, 4, 0x02014b50],
        [4, 2, 20],
        [6, 2, 20],
        [8, 2, 0x0800],
        [10, 2, 0],
        [12, 2, timestamp.dosTime],
        [14, 2, timestamp.dosDate],
        [16, 4, record.checksum],
        [20, 4, record.dataBytes.length],
        [24, 4, record.dataBytes.length],
        [28, 2, record.nameBytes.length],
        [30, 2, 0],
        [32, 2, 0],
        [34, 2, 0],
        [36, 2, 0],
        [38, 4, 0],
        [42, 4, record.localOffset],
      ]);
      centralChunks.push(centralHeader, record.nameBytes);
      offset += centralHeader.length + record.nameBytes.length;
    });

    const centralSize = offset - centralOffset;
    if (centralSize > 0xffffffff || centralOffset > 0xffffffff || offset + 22 > 0xffffffff) {
      throw new Error("The export bundle is too large for browser ZIP export.");
    }
    const endHeader = writeZipHeader(makeZipHeader(22), [
      [0, 4, 0x06054b50],
      [4, 2, 0],
      [6, 2, 0],
      [8, 2, records.length],
      [10, 2, records.length],
      [12, 4, centralSize],
      [16, 4, centralOffset],
      [20, 2, 0],
    ]);
    const chunks = [...localChunks, ...centralChunks, endHeader];
    return new Blob([concatBytes(chunks, offset + endHeader.length)], { type: "application/zip" });
  }

  function downloadBlob(blob, filename) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function buildExportArchiveName(researchStudyId, patientStudyId, timestamp) {
    const stamp = String(timestamp || new Date().toISOString()).replace(/[:.]/g, "-");
    return makeZipPath("HAGRad_NoiseLab", researchStudyId, patientStudyId, stamp).replace(/\//g, "_");
  }

  function clearAnalysisCanvas(canvas, message) {
    if (!canvas) {
      return;
    }
    const { width, height } = syncCanvasSize(canvas);
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#607083";
    ctx.font = `${Math.max(12, 12 * (window.devicePixelRatio || 1))}px 'SF Pro Text', 'Segoe UI', sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(message || "No analysis available", 16, height / 2);
    ctx.restore();
  }

  function getSelectedProfileVisualization(roi, analysis) {
    const visualization = buildRoiProfileAnalysis(analysis, {
      histogramBins: state.analysisView.histogramBins,
    });
    if (!visualization) {
      return null;
    }
    const profile =
      visualization.profilesByType?.[state.analysisView.profileType] ||
      visualization.profiles?.[0] ||
      null;
    return profile ? { visualization, profile } : null;
  }

  function getProfileOverlay(profileType, visualization) {
    if (!visualization) {
      return null;
    }
    if (profileType === "horizontal-center") {
      return { type: "row", index: visualization.centerRowIndex };
    }
    if (profileType === "vertical-center") {
      return { type: "column", index: visualization.centerColumnIndex };
    }
    if (profileType === "horizontal-mean") {
      return { type: "all-rows" };
    }
    if (profileType === "vertical-mean") {
      return { type: "all-columns" };
    }
    return null;
  }

  function buildProfileSummaryHtml(profile, analysis) {
    return `
      <p><strong>${profile.label}</strong> · ${profile.aggregation} · ${profile.sampleCount} samples</p>
      <p>Profile mean <strong>${formatRoiMetric(profile.stats?.mean, profile.units, 3)}</strong> · profile SD <strong>${formatRoiMetric(profile.stats?.sd, profile.units, 3)}</strong> · profile MAD <strong>${formatRoiMetric(profile.stats?.mad, profile.units, 3)}</strong></p>
      <p>ROI mean <strong>${formatRoiMetric(analysis.statsCalibrated?.mean, analysis.units, 3)}</strong> · ROI SD <strong>${formatRoiMetric(analysis.statsCalibrated?.sd, analysis.units, 3)}</strong> · ROI median <strong>${formatRoiMetric(analysis.statsCalibrated?.median, analysis.units, 3)}</strong> · ROI MAD <strong>${formatRoiMetric(analysis.statsCalibrated?.mad, analysis.units, 3)}</strong></p>
      <p>The line plot shows the ordered calibrated values from the selected profile. The histogram summarizes all pixels in the square ROI, not just the line.</p>
    `;
  }

  function buildCharacterizationSummaryHtml(profile, analysis) {
    const direction = profile.axis === "y" ? "top-to-bottom" : "left-to-right";
    const aggregationCopy =
      profile.aggregation === "center-line"
        ? "The highlighted center line alone is extracted from the square."
        : "All pixels in the square contribute, then values are averaged along one axis to form the projection profile.";
    return `
      <p><strong>Square inclusion</strong> shows the exact ROI pixel matrix used for analysis.</p>
      <p>${aggregationCopy}</p>
      <p><strong>Derived strip</strong> orders the extracted signal ${direction}; the lower strip shows mean-centered deviations that line-profile spread metrics characterize.</p>
      <p>Whole-ROI SD, IQR, and MAD still come from the complete square ROI pixel set, using source image values rather than screen pixels.</p>
      <p>ROI pixel count <strong>${analysis.geometry.areaPx}</strong> · selected matrix <strong>${analysis.geometry.selectedRowCount} x ${analysis.geometry.selectedColumnCount}</strong> · units <strong>${analysis.units || "-"}</strong></p>
    `;
  }

  function renderAnalysisVisuals() {
    const roi = getSelectedRoi();
    if (!roi) {
      els.analysisNote.textContent = "Select an ROI to review line profiles, ROI distributions, and the exact sampled square matrix.";
      els.profileSummary.innerHTML = '<p class="empty-copy">Profile statistics will appear here.</p>';
      els.characterizationSummary.innerHTML = '<p class="empty-copy">The square-to-profile mapping will appear here.</p>';
      clearAnalysisCanvas(els.profileCanvas, "Select an ROI");
      clearAnalysisCanvas(els.histogramCanvas, "Select an ROI");
      clearAnalysisCanvas(els.characterizationSourceCanvas, "Select an ROI");
      clearAnalysisCanvas(els.characterizationDerivedCanvas, "Select an ROI");
      return;
    }

    const analysis = getAnalysisForRoi(roi);
    const selected = getSelectedProfileVisualization(roi, analysis);
    if (!selected) {
      els.analysisNote.textContent = `${roi.label} is selected, but profile visualization is not available for this ROI.`;
      els.profileSummary.innerHTML = '<p class="empty-copy">Profile statistics are unavailable.</p>';
      els.characterizationSummary.innerHTML = '<p class="empty-copy">Characterization visuals are unavailable.</p>';
      clearAnalysisCanvas(els.profileCanvas, "Profile unavailable");
      clearAnalysisCanvas(els.histogramCanvas, "Histogram unavailable");
      clearAnalysisCanvas(els.characterizationSourceCanvas, "Matrix unavailable");
      clearAnalysisCanvas(els.characterizationDerivedCanvas, "Derived signal unavailable");
      return;
    }

    const { visualization, profile } = selected;
    els.analysisNote.textContent = `${roi.label} · ${profile.label} · derived directly from the current square ROI pixel matrix.`;
    els.profileSummary.innerHTML = buildProfileSummaryHtml(profile, analysis);
    els.characterizationSummary.innerHTML = buildCharacterizationSummaryHtml(profile, analysis);

    syncCanvasSize(els.profileCanvas);
    syncCanvasSize(els.histogramCanvas);
    syncCanvasSize(els.characterizationSourceCanvas);
    syncCanvasSize(els.characterizationDerivedCanvas);

    exportApi.drawProfilePlotFigure(els.profileCanvas.getContext("2d"), {
      width: els.profileCanvas.width,
      height: els.profileCanvas.height,
      title: profile.label,
      xLabel: profile.spacingMm
        ? `Ordered sample index (${roundForDisplay(profile.spacingMm, 3)} mm spacing)`
        : "Ordered sample index",
      yLabel: profile.units ? `Calibrated value (${profile.units})` : "Calibrated value",
      series: [
        {
          label: "Signal",
          values: profile.values,
          color: "#0b6cae",
        },
      ],
      referenceLines: [
        {
          label: "Profile mean",
          value: profile.stats?.mean,
          color: "#c84c3c",
        },
      ],
    });

    exportApi.drawHistogramFigure(els.histogramCanvas.getContext("2d"), {
      width: els.histogramCanvas.width,
      height: els.histogramCanvas.height,
      title: "Full ROI value distribution",
      bins: visualization.histogram || [],
      xLabel: analysis.units ? `Calibrated value (${analysis.units})` : "Calibrated value",
      meanValue: analysis.statsCalibrated?.mean,
    });

    exportApi.drawMatrixHeatmap(els.characterizationSourceCanvas.getContext("2d"), {
      width: els.characterizationSourceCanvas.width,
      height: els.characterizationSourceCanvas.height,
      title: "Included square ROI pixels",
      matrix: visualization.rawMatrix,
      colorMap: "grayscale",
      overlay: getProfileOverlay(profile.type, visualization),
    });

    exportApi.drawProfileCharacterizationFigure(els.characterizationDerivedCanvas.getContext("2d"), {
      width: els.characterizationDerivedCanvas.width,
      height: els.characterizationDerivedCanvas.height,
      title: "Extracted signal and deviation",
      values: profile.values,
      deviations: profile.deviations,
      meanValue: profile.stats?.mean,
      units: profile.units,
    });
  }

  function getNpsAnalysisForSet(set) {
    if (!set) {
      return null;
    }
    const rois = getActiveNpsRois();
    const key = `${set.id}::${set.updatedAt || ""}::${rois.map((roi) => `${roi.id}:${roi.updatedAt}`).join("|")}`;
    if (state.nps.cache.has(key)) {
      return state.nps.cache.get(key);
    }
    const analysis = buildNpsAnalysisForRois(getActiveVolume(), rois, {
      setId: set.id,
      centerXImg: set.centerXImg,
      centerYImg: set.centerYImg,
    });
    state.nps.cache.set(key, analysis);
    return analysis;
  }

  function buildNpsSummaryHtml(set, analysis) {
    if (!set || !analysis || analysis.error) {
      return '<p class="empty-copy">No valid NPS analysis available.</p>';
    }
    return `
      <p><strong>${set.label}</strong> · ${analysis.validRoiCount} / ${analysis.sourceRoiCount} ROIs valid</p>
      <p>Edge <strong>${analysis.edgePx} px</strong> · spacing <strong>${formatRoiMetric(analysis.spacingX, "mm", 4)} x ${formatRoiMetric(analysis.spacingY, "mm", 4)}</strong></p>
      <p>Integrated NPS <strong>${formatRoiMetric(analysis.integratedNps, analysis.units ? `${analysis.units}²` : "", 4)}</strong> · variance closure <strong>${formatRoiMetric(analysis.varianceClosureRatio, "", 4)}</strong></p>
      <p>Peak frequency <strong>${formatRoiMetric(analysis.peakFrequency, "cycles/mm", 4)}</strong> · centroid <strong>${formatRoiMetric(analysis.centroidFrequency, "cycles/mm", 4)}</strong> · f50 <strong>${formatRoiMetric(analysis.f50Frequency, "cycles/mm", 4)}</strong></p>
      <p>f10 / f90 <strong>${formatRoiMetric(analysis.f10Frequency, "cycles/mm", 4)} / ${formatRoiMetric(analysis.f90Frequency, "cycles/mm", 4)}</strong></p>
      <p>High-frequency fraction <strong>${formatRoiMetric(analysis.highFrequencyPowerFraction, "", 4)}</strong> · radial coverage <strong>${formatRoiMetric(analysis.radialCoverageFraction, "", 4)}</strong></p>
      <p>Normalized NPS uses integrated NPS as the denominator; it is not normalized by mean HU.</p>
    `;
  }

  function applyNpsInputsToState() {
    state.nps.edgePx = core.nextPowerOfTwo(Math.max(2, Number(els.npsEdgeInput.value) || DEFAULT_NPS_EDGE_PX));
    state.nps.ringCount = Math.max(0, Math.round(Number(els.npsRingCountInput.value) || DEFAULT_NPS_RING_COUNT));
    state.nps.roisPerRing = Math.max(1, Math.round(Number(els.npsRoisPerRingInput.value) || DEFAULT_NPS_ROIS_PER_RING));
    state.nps.ringSpacingPx = Math.max(
      state.nps.edgePx,
      Math.round(Number(els.npsRingSpacingInput.value) || DEFAULT_NPS_RING_SPACING_PX)
    );
    state.nps.includeCenter = els.npsIncludeCenterInput.checked;
    els.npsEdgeInput.value = String(state.nps.edgePx);
    els.npsRingCountInput.value = String(state.nps.ringCount);
    els.npsRoisPerRingInput.value = String(state.nps.roisPerRing);
    els.npsRingSpacingInput.value = String(state.nps.ringSpacingPx);
    invalidateNpsCache();
  }

  function syncNpsInputsFromSet(set) {
    if (!set || !els.npsCenterXInput || !els.npsCenterYInput) {
      return;
    }
    els.npsEdgeInput.value = String(set.edgePx || state.nps.edgePx);
    els.npsRingCountInput.value = String(set.ringCount ?? state.nps.ringCount);
    els.npsRoisPerRingInput.value = String(set.roisPerRing || state.nps.roisPerRing);
    els.npsRingSpacingInput.value = String(set.ringSpacingPx || state.nps.ringSpacingPx);
    els.npsIncludeCenterInput.checked = set.includeCenter !== false;
    els.npsCenterXInput.value = Number.isFinite(set.centerXImg) ? String(roundForDisplay(set.centerXImg, 3)) : "";
    els.npsCenterYInput.value = Number.isFinite(set.centerYImg) ? String(roundForDisplay(set.centerYImg, 3)) : "";
  }

  function validateNpsLayoutInsideImage(layout, volume) {
    if (!layout?.rois?.length) {
      return {
        ok: false,
        message: "NPS layout did not create any ROIs. Enable center ROI or increase the ring count.",
      };
    }
    const outOfBounds = layout.rois.filter((roi) => {
      const geometry = resolveSquareGeometry(roi, volume);
      return (
        !geometry ||
        geometry.error ||
        geometry.touchesBoundary ||
        geometry.selectedColumnCount !== geometry.intendedSelectedColumnCount ||
        geometry.selectedRowCount !== geometry.intendedSelectedRowCount
      );
    });
    if (!outOfBounds.length) {
      return { ok: true, message: "" };
    }
    return {
      ok: false,
      message:
        `${outOfBounds.length} NPS ROI${outOfBounds.length === 1 ? "" : "s"} would extend outside the source image. ` +
        "Reduce ring count, ring spacing, ROI edge, or move the NPS center before trusting NPS values.",
    };
  }

  function buildBoundedNpsLayout(options) {
    const volume = getActiveVolume();
    if (!volume) {
      return {
        ok: false,
        message: "Load an active source image before creating NPS rings.",
      };
    }
    const edgePx = normalizeNpsEdgePx(options.edgePx);
    const ringCount = Math.max(0, Math.round(Number(options.ringCount) || DEFAULT_NPS_RING_COUNT));
    const roisPerRing = Math.max(1, Math.round(Number(options.roisPerRing) || DEFAULT_NPS_ROIS_PER_RING));
    const requestedRingSpacingPx = Number.isFinite(Number(options.boundaryRadiusPx))
      ? getNpsRingSpacingForBoundaryRadius(options.boundaryRadiusPx, edgePx, ringCount)
      : Math.max(0, Number(options.ringSpacingPx) || DEFAULT_NPS_RING_SPACING_PX);
    const fit = computeMaxNpsRingSpacing(options.centerXImg, options.centerYImg, edgePx, ringCount, roisPerRing, volume);
    if (!fit.ok) {
      return {
        ok: false,
        message: fit.message || "NPS ring geometry does not fit inside the source image.",
      };
    }

    if (ringCount > 0 && Number.isFinite(fit.maxRingSpacingPx)) {
      if (requestedRingSpacingPx < edgePx - 1e-6) {
        return {
          ok: false,
          message:
            `The NPS circle you placed is too small for ${ringCount} ring${ringCount === 1 ? "" : "s"} with ${edgePx}px square ROIs. ` +
            "Drag farther outward, reduce ROI edge, or reduce ring count.",
        };
      }
      if (fit.maxRingSpacingPx < edgePx - 1e-6) {
        return {
          ok: false,
          message:
            "The requested NPS rings cannot fit completely inside the CT image with this center, ROI edge, and ring count. " +
            "Move the center inward, reduce ROI edge, or reduce ring count.",
        };
      }
      if (requestedRingSpacingPx > fit.maxRingSpacingPx) {
        return {
          ok: false,
          message:
            `The NPS radius you placed would extend outside the CT image. Maximum valid ring spacing here is ${roundForDisplay(
              fit.maxRingSpacingPx,
              2
            )} px. Move the mouse inward, move the center inward, or reduce ring count/ROI edge.`,
        };
      }
    }

    const layout = createConcentricNpsRoisExact({
      setId: options.setId,
      datasetId: options.datasetId,
      sliceIndex: options.sliceIndex,
      centerXImg: options.centerXImg,
      centerYImg: options.centerYImg,
      edgePx,
      ringCount,
      roisPerRing,
      ringSpacingPx: requestedRingSpacingPx,
      includeCenter: options.includeCenter,
      sequenceStart: options.sequenceStart,
    });
    const validation = validateNpsLayoutInsideImage(layout, volume);
    if (!validation.ok) {
      return validation;
    }

    return {
      ok: true,
      layout,
      adjusted: false,
      requestedRingSpacingPx,
      boundedRingSpacingPx: layout.ringSpacingPx,
    };
  }

  function rebuildExistingNpsSet(set, overrides = {}) {
    if (!set) {
      return {
        ok: false,
        message: "No active NPS set is available for editing.",
      };
    }
    return buildBoundedNpsLayout({
      setId: set.id,
      datasetId: set.datasetId,
      sliceIndex: set.sliceIndex,
      centerXImg: overrides.centerXImg ?? set.centerXImg,
      centerYImg: overrides.centerYImg ?? set.centerYImg,
      edgePx: overrides.edgePx ?? set.edgePx,
      ringCount: overrides.ringCount ?? set.ringCount,
      roisPerRing: overrides.roisPerRing ?? set.roisPerRing,
      ringSpacingPx: overrides.ringSpacingPx ?? set.ringSpacingPx,
      includeCenter: overrides.includeCenter ?? set.includeCenter,
      sequenceStart: getNpsSequenceStartForSet(set.id),
    });
  }

  function applyNpsSetLayout(set, bounded, options = {}) {
    if (!set || !bounded?.ok || !bounded.layout) {
      return false;
    }
    const layout = bounded.layout;
    state.rois = state.rois.filter((roi) => roi.npsSetId !== set.id);
    state.rois.push(...layout.rois);
    set.centerXImg = layout.centerXImg;
    set.centerYImg = layout.centerYImg;
    set.edgePx = layout.edgePx;
    set.ringCount = layout.ringCount;
    set.roisPerRing = layout.roisPerRing;
    set.ringSpacingPx = layout.ringSpacingPx;
    set.includeCenter = layout.includeCenter;
    set.updatedAt = new Date().toISOString();
    state.nps.activeSetId = set.id;
    state.nps.edgePx = layout.edgePx;
    state.nps.ringCount = layout.ringCount;
    state.nps.ringSpacingPx = layout.ringSpacingPx;
    state.selectedRoiId = layout.rois.find((roi) => roi.id === options.preferredRoiId)?.id || layout.rois[0]?.id || "";
    syncNpsInputsFromSet(set);
    invalidateRoiCache();
    invalidateNpsCache();
    updateUi();
    render();
    return true;
  }

  function getRoiUnionBounds(rois, volume) {
    const bounds = {
      xMin: Number.POSITIVE_INFINITY,
      yMin: Number.POSITIVE_INFINITY,
      xMax: Number.NEGATIVE_INFINITY,
      yMax: Number.NEGATIVE_INFINITY,
    };
    (rois || []).forEach((roi) => {
      const geometry = resolveSquareGeometry(roi, volume);
      if (!geometry || geometry.error) {
        return;
      }
      bounds.xMin = Math.min(bounds.xMin, geometry.xMinBoundaryImg);
      bounds.yMin = Math.min(bounds.yMin, geometry.yMinBoundaryImg);
      bounds.xMax = Math.max(bounds.xMax, geometry.xMaxBoundaryImg);
      bounds.yMax = Math.max(bounds.yMax, geometry.yMaxBoundaryImg);
    });
    return Number.isFinite(bounds.xMin) ? bounds : null;
  }

  function fitViewportToImageBounds(bounds, marginImg = 12) {
    const volume = getActiveVolume();
    if (!volume || !bounds) {
      return;
    }
    const canvasSize = getCurrentCanvasSize();
    const fitScale = Math.min(canvasSize.width / volume.columns, canvasSize.height / volume.rows);
    const paddedWidth = Math.max(1, bounds.xMax - bounds.xMin + 1 + marginImg * 2);
    const paddedHeight = Math.max(1, bounds.yMax - bounds.yMin + 1 + marginImg * 2);
    const targetScale = Math.min(canvasSize.width / paddedWidth, canvasSize.height / paddedHeight);
    const scale = Math.max(0.2 * fitScale, Math.min(targetScale, fitScale * 30));
    const centerX = (bounds.xMin + bounds.xMax) / 2;
    const centerY = (bounds.yMin + bounds.yMax) / 2;
    state.viewport.zoom = clamp(scale / Math.max(0.0001, fitScale), 0.2, 30);
    const centeredOffsetX = (canvasSize.width - volume.columns * scale) / 2;
    const centeredOffsetY = (canvasSize.height - volume.rows * scale) / 2;
    state.viewport.panX = canvasSize.width / 2 - centeredOffsetX - (centerX + 0.5) * scale;
    state.viewport.panY = canvasSize.height / 2 - centeredOffsetY - (centerY + 0.5) * scale;
  }

  function revealNpsLayout(layout) {
    if (!layout) {
      return;
    }
    state.activeSliceIndex = layout.rois[0]?.sliceIndex ?? state.activeSliceIndex;
    state.selectedRoiId = layout.rois[0]?.id || "";
    setActivePage("viewer");
  }

  function renderNpsVisuals() {
    const set = getActiveNpsSet();
    const shouldDrawFigures = state.activePage === "figures";
    if (!set) {
      els.npsNote.textContent = "Choose NPS Rings, click the center, then drag the phantom/ring radius.";
      els.npsSummary.innerHTML = '<p class="empty-copy">No NPS set generated.</p>';
      els.npsAnalysisSummary.innerHTML = '<p class="empty-copy">Generate an NPS set to compute the 2D and radial NPS.</p>';
      if (shouldDrawFigures) {
        clearAnalysisCanvas(els.npsCurveCanvas, "No NPS set");
        clearAnalysisCanvas(els.npsNormalizedCanvas, "No NPS set");
        clearAnalysisCanvas(els.npsCumulativeCanvas, "No NPS set");
        clearAnalysisCanvas(els.npsBandpowerCanvas, "No NPS set");
        clearAnalysisCanvas(els.npsHeatmapCanvas, "No NPS set");
      }
      return;
    }

    const analysis = getNpsAnalysisForSet(set);
    const roiCount = getActiveNpsRois().length;
    els.npsNote.textContent = `${set.label} · ${roiCount} concentric ROI${roiCount === 1 ? "" : "s"} on this slice`;
    els.npsSummary.innerHTML = buildNpsSummaryHtml(set, analysis);
    els.npsAnalysisSummary.innerHTML = buildNpsSummaryHtml(set, analysis);

    if (!analysis || analysis.error || !analysis.validRoiCount) {
      if (shouldDrawFigures) {
        clearAnalysisCanvas(els.npsCurveCanvas, analysis?.error || "NPS unavailable");
        clearAnalysisCanvas(els.npsNormalizedCanvas, analysis?.error || "NPS unavailable");
        clearAnalysisCanvas(els.npsCumulativeCanvas, analysis?.error || "NPS unavailable");
        clearAnalysisCanvas(els.npsBandpowerCanvas, analysis?.error || "NPS unavailable");
        clearAnalysisCanvas(els.npsHeatmapCanvas, analysis?.error || "NPS unavailable");
      }
      return;
    }

    if (!shouldDrawFigures) {
      return;
    }

    syncCanvasSize(els.npsCurveCanvas);
    syncCanvasSize(els.npsNormalizedCanvas);
    syncCanvasSize(els.npsCumulativeCanvas);
    syncCanvasSize(els.npsBandpowerCanvas);
    syncCanvasSize(els.npsHeatmapCanvas);
    exportApi.drawNpsCurveFigure(els.npsCurveCanvas.getContext("2d"), {
      width: els.npsCurveCanvas.width,
      height: els.npsCurveCanvas.height,
      title: `${set.label} absolute radial NPS`,
      radialBins: analysis.radialBins,
      valueField: "nps",
      peakFrequency: analysis.peakFrequency,
      npsUnits: analysis.npsUnits,
    });
    exportApi.drawNpsCurveFigure(els.npsNormalizedCanvas.getContext("2d"), {
      width: els.npsNormalizedCanvas.width,
      height: els.npsNormalizedCanvas.height,
      title: `${set.label} normalized radial NPS`,
      radialBins: analysis.radialBins,
      valueField: "normalizedNps",
      lineColor: "#2f8f64",
      yLabel: `Normalized NPS (${analysis.normalizedNpsUnits || "mm^2"})`,
      peakFrequency: analysis.peakFrequency,
      npsUnits: analysis.normalizedNpsUnits,
    });
    exportApi.drawNpsCurveFigure(els.npsCumulativeCanvas.getContext("2d"), {
      width: els.npsCumulativeCanvas.width,
      height: els.npsCumulativeCanvas.height,
      title: `${set.label} cumulative NPS`,
      radialBins: analysis.radialBins,
      valueField: "cumulativeFraction",
      lineColor: "#d18a2d",
      yLabel: "Cumulative radial-domain power fraction",
      referenceFrequencies: [
        { label: "f10", frequency: analysis.f10Frequency, color: "#6c7f91" },
        { label: "f50", frequency: analysis.f50Frequency, color: "#0b6cae" },
        { label: "f90", frequency: analysis.f90Frequency, color: "#c84c3c" },
      ],
    });
    exportApi.drawNpsBandPowerFigure(els.npsBandpowerCanvas.getContext("2d"), {
      width: els.npsBandpowerCanvas.width,
      height: els.npsBandpowerCanvas.height,
      title: `${set.label} NPS bandpower`,
      bandPowers: analysis.bandPowers,
    });
    exportApi.drawNpsHeatmapFigure(els.npsHeatmapCanvas.getContext("2d"), {
      width: els.npsHeatmapCanvas.width,
      height: els.npsHeatmapCanvas.height,
      title: `${set.label} 2D NPS`,
      nps2d: analysis.nps2d,
      peakFrequency: analysis.peakFrequency,
    });
  }

  function buildCurrentComparisonBundle(timestamp) {
    return buildReconstructionComparisonBundle(state.datasets, state.rois, {
      researchStudyId: els.researchStudyIdInput?.value?.trim?.() || "",
      patientStudyId: els.patientStudyIdInput?.value?.trim?.() || "",
      timestamp: timestamp || new Date().toISOString(),
      npsSets: state.nps.sets,
    });
  }

  function renderComparisonSummaryHtml(comparison) {
    const summaryRows = comparison?.roiComparison?.summaryRows || [];
    const npsRows = comparison?.npsComparison?.summaryRows || [];
    if (!summaryRows.length && !npsRows.length) {
      return '<p class="empty-copy">Copy the same ROI or NPS set to all loaded series to compare reconstruction-specific noise values.</p>';
    }
    const roiRows = summaryRows.slice(0, 8).map((row) => {
      const low = formatRoiMetric(Number(row.lowest_sd_calibrated), row.units, 3);
      const high = formatRoiMetric(Number(row.highest_sd_calibrated), row.units, 3);
      return `
        <tr>
          <td>${row.roi_label || row.comparison_group_id}</td>
          <td>${row.baseline_reconstruction_label || "-"}</td>
          <td>${row.lowest_noise_reconstruction_label || "-"} (${low})</td>
          <td>${row.highest_noise_reconstruction_label || "-"} (${high})</td>
        </tr>
      `;
    });
    const npsLine = npsRows.length
      ? `<p>NPS comparison available for <strong>${npsRows.length}</strong> copied NPS set${npsRows.length === 1 ? "" : "s"} and exported as dedicated NPS comparison CSV files.</p>`
      : '<p class="hint">No copied NPS set comparison is available yet.</p>';
    return `
      <p><strong>${summaryRows.length}</strong> copied ROI comparison group${summaryRows.length === 1 ? "" : "s"} across loaded reconstructions.</p>
      <div class="comparison-table-wrap">
        <table class="comparison-table">
          <thead><tr><th>ROI</th><th>Baseline</th><th>Lowest SD</th><th>Highest SD</th></tr></thead>
          <tbody>${roiRows.join("")}</tbody>
        </table>
      </div>
      ${npsLine}
      <p class="hint">Lower SD is a local lower-spread measurement for the same copied image-space ROI. Confirm registration and inspect ROI contamination warnings before interpreting differences.</p>
    `;
  }

  function renderComparisonVisuals() {
    if (!els.comparisonCanvas || !els.comparisonSummary) {
      return;
    }
    if (state.datasets.length < 2) {
      els.comparisonSummary.innerHTML =
        '<p class="empty-copy">Load multiple reconstructions of the same patient or phantom to enable reconstruction comparison.</p>';
      clearAnalysisCanvas(els.comparisonCanvas, "Load multiple series");
      return;
    }
    const comparison = buildCurrentComparisonBundle("preview");
    const rows = comparison.roiComparison?.rows || [];
    els.comparisonSummary.innerHTML = renderComparisonSummaryHtml(comparison);
    if (!rows.length) {
      clearAnalysisCanvas(els.comparisonCanvas, "Copy ROIs to all series");
      return;
    }
    syncCanvasSize(els.comparisonCanvas);
    exportApi.drawReconstructionComparisonFigure(els.comparisonCanvas.getContext("2d"), {
      width: els.comparisonCanvas.width,
      height: els.comparisonCanvas.height,
      title: "ROI SD across loaded reconstructions",
      rows,
      yLabel: "SD (calibrated units)",
    });
  }

  function clearActiveNpsSet(options = {}) {
    const set = getActiveNpsSet();
    if (!set) {
      return;
    }
    if (state.rois.some((roi) => roi.id === state.selectedRoiId && roi.npsSetId === set.id)) {
      state.selectedRoiId = "";
    }
    state.rois = state.rois.filter((roi) => roi.npsSetId !== set.id);
    state.nps.sets = state.nps.sets.filter((entry) => entry.id !== set.id);
    state.nps.activeSetId = state.nps.sets[0]?.id || "";
    invalidateNpsCache();
    if (!options.silent) {
      updateUi();
      render();
    }
  }

  function clearCurrentSliceNpsSets(options = {}) {
    const setIds = new Set(
      state.nps.sets
        .filter((set) => set.datasetId === state.activeDatasetId && set.sliceIndex === state.activeSliceIndex)
        .map((set) => set.id)
    );
    const staleRoiIds = new Set(
      state.rois
        .filter(
          (roi) =>
            roi.datasetId === state.activeDatasetId &&
            roi.sliceIndex === state.activeSliceIndex &&
            (roi.type === NPS_ROI_TYPE || Boolean(roi.npsSetId))
        )
        .map((roi) => roi.id)
    );
    if (!setIds.size && !staleRoiIds.size) {
      return false;
    }
    if (staleRoiIds.has(state.selectedRoiId)) {
      state.selectedRoiId = "";
    }
    state.rois = state.rois.filter((roi) => !staleRoiIds.has(roi.id));
    state.nps.sets = state.nps.sets.filter((set) => !setIds.has(set.id));
    state.nps.activeSetId = "";
    invalidateRoiCache();
    invalidateNpsCache();
    if (!options.silent) {
      updateUi();
      render();
    }
    return true;
  }

  function createNpsSetAt(centerXImg, centerYImg, options = {}) {
    const volume = getActiveVolume();
    if (!volume) {
      return;
    }
    const ringCount = Math.max(0, Math.round(Number(options.ringCount ?? state.nps.ringCount) || DEFAULT_NPS_RING_COUNT));
    const ringSpacingPx = Number.isFinite(Number(options.boundaryRadiusPx))
      ? getNpsRingSpacingForBoundaryRadius(options.boundaryRadiusPx, state.nps.edgePx, ringCount)
      : Number.isFinite(Number(options.ringSpacingPx))
      ? Math.max(0, Number(options.ringSpacingPx))
      : state.nps.ringSpacingPx;
    const setId = `nps_set_${String(state.nps.sequence).padStart(3, "0")}`;
    const bounded = buildBoundedNpsLayout({
      setId,
      datasetId: state.activeDatasetId,
      sliceIndex: state.activeSliceIndex,
      centerXImg,
      centerYImg,
      edgePx: state.nps.edgePx,
      ringCount,
      roisPerRing: state.nps.roisPerRing,
      ringSpacingPx,
      boundaryRadiusPx: options.boundaryRadiusPx,
      includeCenter: state.nps.includeCenter,
      sequenceStart: state.nps.sequence,
    });
    if (!bounded.ok) {
      setStatus(bounded.message, "warning");
      state.nps.draft = null;
      clearCurrentSliceNpsSets({ silent: true });
      syncNpsInputsFromSet({
        centerXImg,
        centerYImg,
        edgePx: state.nps.edgePx,
        ringCount,
        roisPerRing: state.nps.roisPerRing,
        ringSpacingPx,
        includeCenter: state.nps.includeCenter,
      });
      render();
      return;
    }
    const layout = bounded.layout;

    const set = {
      id: layout.setId,
      label: `NPS Set ${String(state.nps.sequence).padStart(2, "0")}`,
      datasetId: state.activeDatasetId,
      sliceIndex: state.activeSliceIndex,
      centerXImg: layout.centerXImg,
      centerYImg: layout.centerYImg,
      edgePx: layout.edgePx,
      ringCount: layout.ringCount,
      roisPerRing: layout.roisPerRing,
      ringSpacingPx: layout.ringSpacingPx,
      includeCenter: layout.includeCenter,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    state.nps.sequence = layout.nextSequence;
    state.nps.sets.push(set);
    state.nps.activeSetId = set.id;
    state.nps.edgePx = layout.edgePx;
    state.nps.ringCount = layout.ringCount;
    state.nps.ringSpacingPx = layout.ringSpacingPx;
    state.rois.push(...layout.rois);
    state.selectedRoiId = layout.rois[0]?.id || "";
    revealNpsLayout(layout);
    syncNpsInputsFromSet(set);
    invalidateNpsCache();
    updateUi();
    render();
    setStatus(`${set.label} generated with ${layout.rois.length} NPS ROI${layout.rois.length === 1 ? "" : "s"}.`);
  }

  function regenerateActiveNpsSet() {
    const volume = getActiveVolume();
    const set = getActiveNpsSet();
    if (!volume || !set) {
      setStatus("Create or select an NPS set before regenerating it.", "warning");
      return;
    }
    if (!core.supportsPhysicalSquare(volume)) {
      setStatus("NPS analysis requires Pixel Spacing metadata on the active series.", "warning");
      return;
    }

    applyNpsInputsToState();
    const centerX =
      els.npsCenterXInput && Number.isFinite(Number(els.npsCenterXInput.value))
        ? Number(els.npsCenterXInput.value)
        : set.centerXImg;
    const centerY =
      els.npsCenterYInput && Number.isFinite(Number(els.npsCenterYInput.value))
        ? Number(els.npsCenterYInput.value)
        : set.centerYImg;
    const bounded = buildBoundedNpsLayout({
      setId: set.id,
      datasetId: set.datasetId,
      sliceIndex: set.sliceIndex,
      centerXImg: centerX,
      centerYImg: centerY,
      edgePx: state.nps.edgePx,
      ringCount: state.nps.ringCount,
      roisPerRing: state.nps.roisPerRing,
      ringSpacingPx: state.nps.ringSpacingPx,
      includeCenter: state.nps.includeCenter,
      sequenceStart: state.nps.sequence,
    });
    if (!bounded.ok) {
      setStatus(bounded.message, "warning");
      return;
    }
    const layout = bounded.layout;
    state.rois = state.rois.filter((roi) => roi.npsSetId !== set.id);
    state.rois.push(...layout.rois);
    state.nps.sequence = layout.nextSequence;
    set.centerXImg = layout.centerXImg;
    set.centerYImg = layout.centerYImg;
    set.edgePx = layout.edgePx;
    set.ringCount = layout.ringCount;
    set.roisPerRing = layout.roisPerRing;
    set.ringSpacingPx = layout.ringSpacingPx;
    set.includeCenter = layout.includeCenter;
    set.updatedAt = new Date().toISOString();
    state.nps.activeSetId = set.id;
    state.selectedRoiId = layout.rois[0]?.id || "";
    revealNpsLayout(layout);
    syncNpsInputsFromSet(set);
    invalidateRoiCache();
    invalidateNpsCache();
    updateUi();
    render();
    setStatus(
      `${set.label} regenerated with ${layout.rois.length} adjustable NPS ROI${layout.rois.length === 1 ? "" : "s"}.`
    );
  }

  function updateSeriesUi() {
    if (!state.datasets.length) {
      els.seriesList.innerHTML = '<p class="empty-copy">Load a DICOM series or drop a study folder into the viewport.</p>';
      els.studyNote.textContent = "No series loaded";
      els.seriesList.classList.remove("is-scrollable");
      return;
    }

    els.studyNote.textContent = `${state.datasets.length} series loaded`;
    els.seriesList.classList.toggle("is-scrollable", state.datasets.length > 5);
    els.seriesList.innerHTML = state.datasets
      .map((dataset, index) => {
        const active = dataset.id === state.activeDatasetId ? " is-active" : "";
        return `
          <button class="series-card${active}" data-series-index="${index}" type="button" title="Switch to ${dataset.label}">
            <strong>${dataset.label}</strong>
            <span>${dataset.pixelCount} slice${dataset.pixelCount === 1 ? "" : "s"} · ${dataset.meta?.patientName || dataset.meta?.patientId || "Unknown patient"}</span>
            <em>${dataset.id === state.activeDatasetId ? "Active reconstruction" : "Click to switch reconstruction"}</em>
          </button>
        `;
      })
      .join("");

    Array.from(els.seriesList.querySelectorAll("[data-series-index]")).forEach((card) => {
      card.addEventListener("click", (event) => activateSeriesCard(card, event));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          activateSeriesCard(card, event);
        }
      });
    });
  }

  function updateSliceControls() {
    const volume = getActiveVolume();
    const depth = volume?.depth || 0;
    els.sliceSlider.max = String(Math.max(0, depth - 1));
    els.sliceSlider.value = String(clamp(state.activeSliceIndex, 0, Math.max(0, depth - 1)));
    els.sliceSlider.disabled = depth <= 1;
    els.readout.textContent = depth ? `Slice ${state.activeSliceIndex + 1} / ${depth}` : "Slice - / -";
  }

  function updateMetadataUi() {
    const record = getActiveRecord();
    const volume = getActiveVolume();
    const slice = getCurrentSlice();
    const units = dicomApi.getCalibrationUnits(record, slice);
    const rows = Array.from(els.metadata.querySelectorAll("dd"));
    if (!record || !volume) {
      rows.forEach((row) => {
        row.textContent = "-";
      });
      return;
    }
    rows[0].textContent = record.seriesDescription || record.protocolName || record.seriesInstanceUID || "-";
    rows[1].textContent = `${volume.columns} x ${volume.rows} x ${volume.depth}`;
    rows[2].textContent = `${formatSpacing(record.pixelSpacing)} / ${formatDimension(volume.sliceSpacing)}`;
    rows[3].textContent = `${slice?.slope ?? record.rescaleSlope ?? 1} / ${slice?.intercept ?? record.rescaleIntercept ?? 0}`;
    rows[4].textContent = units || "-";
    rows[5].textContent = `${state.activeSliceIndex + 1}${record.sopInstanceUID ? ` · ${record.sopInstanceUID.slice(-12)}` : ""}`;
  }

  function updateRoiListUi() {
    const currentVisible = getVisibleRois();
    const seriesRois = state.rois.filter((roi) => roi.datasetId === state.activeDatasetId && roi.visible !== false);
    els.roiNote.textContent = `${currentVisible.length} on current slice · ${seriesRois.length} in active series`;
    if (!seriesRois.length) {
      els.roiList.innerHTML = '<p class="empty-copy">No ROI in the active series.</p>';
      return;
    }

    els.roiList.innerHTML = seriesRois
      .slice()
      .sort((left, right) => left.sliceIndex - right.sliceIndex || String(left.label || left.id).localeCompare(String(right.label || right.id)))
      .map((roi) => {
        const selected = roi.id === state.selectedRoiId ? " is-active" : "";
        const currentSlice = roi.sliceIndex === state.activeSliceIndex ? " current-slice" : "";
        const analysis = getAnalysisForRoi(roi);
        const sd = analysis.statsCalibrated?.sd;
        const mean = analysis.statsCalibrated?.mean;
        return `
          <div class="roi-card${selected}${currentSlice}" data-roi-id="${roi.id}" role="button" tabindex="0" title="Double-click to center this ROI on the CT image">
            <div class="roi-card-main">
              <strong>${roi.label}${roi.type === NPS_ROI_TYPE ? " · NPS" : ""}</strong>
              <span>Slice ${roi.sliceIndex + 1} · ${roi.squareMode} · Mean ${formatRoiMetric(mean, analysis.units, 2)} · SD ${formatRoiMetric(sd, analysis.units, 2)}</span>
            </div>
            <button class="roi-card-delete" data-roi-delete-id="${roi.id}" type="button" title="Delete ${roi.label}">Delete</button>
          </div>
        `;
      })
      .join("");

    Array.from(els.roiList.querySelectorAll("[data-roi-delete-id]")).forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        deleteRoiById(button.dataset.roiDeleteId || "");
      });
    });

    Array.from(els.roiList.querySelectorAll("[data-roi-id]")).forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest("[data-roi-delete-id]")) {
          return;
        }
        setSelectedRoi(card.dataset.roiId || "");
      });
      card.addEventListener("dblclick", (event) => {
        if (event.target.closest("[data-roi-delete-id]")) {
          return;
        }
        setActiveTool("select");
        selectRoiAndNavigate(card.dataset.roiId || "");
        setStatus("ROI centered. Drag the ROI body to move it; drag corner handles to resize.");
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        setActiveTool("select");
        selectRoiAndNavigate(card.dataset.roiId || "");
      });
    });
  }

  function buildRoiDetailHtml(roi, analysis) {
    const geometry = analysis.geometry;
    const isNpsRoi = roi.type === NPS_ROI_TYPE;
    const npsDisabled = isNpsRoi ? "disabled" : "";
    const npsLockNote = isNpsRoi
      ? '<p class="hint">This is an NPS ROI. Individual geometry is locked; edit the NPS set center/ring spacing instead.</p>'
      : "";
    const boundaryWarning = analysis.warnings.touchesBoundaryFlag
      ? '<p class="warning-note">ROI touches or extends beyond the image boundary.</p>'
      : "";
    const sizeWarning = analysis.warnings.tooSmallFlag
      ? '<p class="warning-note">ROI is below the recommended pixel count threshold for Phase 1.</p>'
      : "";

    return `
      <div class="detail-group">
        <h3>Geometry</h3>
        ${npsLockNote}
        <div class="detail-grid">
          <div><dt>Label</dt><dd><input id="noiselab-roi-label-input" type="text" value="${roi.label}" ${npsDisabled} /></dd></div>
          <div><dt>Visibility</dt><dd><label><input id="noiselab-roi-visible-input" type="checkbox" ${roi.visible !== false ? "checked" : ""} /> Visible</label></dd></div>
          <div><dt>Center X</dt><dd><input id="noiselab-roi-center-x" type="number" step="0.5" value="${roundForDisplay(geometry.centerXImg, 3)}" ${npsDisabled} /></dd></div>
          <div><dt>Center Y</dt><dd><input id="noiselab-roi-center-y" type="number" step="0.5" value="${roundForDisplay(geometry.centerYImg, 3)}" ${npsDisabled} /></dd></div>
          <div><dt>Edge (px)</dt><dd><input id="noiselab-roi-edge-px" type="number" step="1" min="1" value="${roi.edgePx || ""}" ${roi.squareMode === SQUARE_MODE_PHYSICAL || isNpsRoi ? "disabled" : ""} /></dd></div>
          <div><dt>Edge (mm)</dt><dd><input id="noiselab-roi-edge-mm" type="number" step="0.1" min="0.1" value="${roi.edgeMm || ""}" ${roi.squareMode === SQUARE_MODE_PIXEL || isNpsRoi ? "disabled" : ""} /></dd></div>
          <div><dt>Selected Pixels</dt><dd>${geometry.selectedRowCount} x ${geometry.selectedColumnCount}</dd></div>
          <div><dt>Area</dt><dd>${formatRoiMetric(geometry.areaPx, "px", 0)} / ${formatRoiMetric(geometry.areaMm2, "mm²", 3)}</dd></div>
        </div>
      </div>
      <div class="detail-group">
        <h3>Noise Statistics</h3>
        <div class="detail-grid">
          <div><dt>Mean</dt><dd>${formatRoiMetric(analysis.statsCalibrated?.mean, analysis.units, 3)}</dd></div>
          <div><dt>SD</dt><dd>${formatRoiMetric(analysis.statsCalibrated?.sd, analysis.units, 3)}</dd></div>
          <div><dt>Median</dt><dd>${formatRoiMetric(analysis.statsCalibrated?.median, analysis.units, 3)}</dd></div>
          <div><dt>IQR</dt><dd>${formatRoiMetric(analysis.statsCalibrated?.iqr, analysis.units, 3)}</dd></div>
          <div><dt>Min</dt><dd>${formatRoiMetric(analysis.statsCalibrated?.min, analysis.units, 3)}</dd></div>
          <div><dt>Max</dt><dd>${formatRoiMetric(analysis.statsCalibrated?.max, analysis.units, 3)}</dd></div>
          <div><dt>MAD</dt><dd>${formatRoiMetric(analysis.statsCalibrated?.mad, analysis.units, 3)}</dd></div>
          <div><dt>CV</dt><dd>${formatRoiMetric(analysis.statsCalibrated?.coefficientOfVariation, "", 4)}</dd></div>
          <div><dt>Skewness</dt><dd>${formatRoiMetric(analysis.statsCalibrated?.skewness, "", 4)}</dd></div>
          <div><dt>Kurtosis</dt><dd>${formatRoiMetric(analysis.statsCalibrated?.kurtosis, "", 4)}</dd></div>
        </div>
        ${boundaryWarning}
        ${sizeWarning}
      </div>
    `;
  }

  function updateRoiDetailUi() {
    const roi = getSelectedRoi();
    if (!roi) {
      els.roiDetailNote.textContent = "Select an ROI";
      els.roiDetail.innerHTML = '<p class="empty-copy">The selected ROI’s geometry, pixel counts, and noise statistics will appear here.</p>';
      return;
    }

    const analysis = getAnalysisForRoi(roi);
    els.roiDetailNote.textContent = `${roi.label} · ${roi.squareMode}`;
    els.roiDetail.innerHTML = buildRoiDetailHtml(roi, analysis);

    const labelInput = document.getElementById("noiselab-roi-label-input");
    const visibleInput = document.getElementById("noiselab-roi-visible-input");
    const centerXInput = document.getElementById("noiselab-roi-center-x");
    const centerYInput = document.getElementById("noiselab-roi-center-y");
    const edgePxInput = document.getElementById("noiselab-roi-edge-px");
    const edgeMmInput = document.getElementById("noiselab-roi-edge-mm");

    function applyDetailEdits() {
      const target = getSelectedRoi();
      if (!target) {
        return;
      }
      if (target.type === NPS_ROI_TYPE) {
        const set = getNpsSetForRoi(target);
        if (set) {
          state.nps.activeSetId = set.id;
          syncNpsInputsFromSet(set);
          setSidebarSectionCollapsed("nps-rings", false);
          setStatus("NPS ROI geometry is locked to the concentric set. Edit center/ring spacing in NPS Rings.");
        }
        return;
      }
      const previous = captureRoiGeometry(target);
      target.label = safeString(labelInput.value) || target.label;
      target.visible = visibleInput.checked;
      target.centerXImg = Number(centerXInput.value);
      target.centerYImg = Number(centerYInput.value);
      if (target.squareMode === SQUARE_MODE_PIXEL) {
        target.edgePx = Math.max(1, Math.round(Number(edgePxInput.value) || target.edgePx || 1));
      } else {
        target.edgeMm = Math.max(0.1, Number(edgeMmInput.value) || target.edgeMm || DEFAULT_FIXED_PHYSICAL_EDGE_MM);
      }
      const fit = getRoiSourceFit(target);
      if (!fit.ok) {
        restoreRoiGeometry(target, previous);
        setStatus(`${fit.message} ROI detail edits were not applied.`, "warning");
        updateRoiDetailUi();
        updateRoiListUi();
        render();
        return;
      }
      target.updatedAt = new Date().toISOString();
      invalidateRoiCache(target.id);
      updateRoiDetailUi();
      updateRoiListUi();
      render();
    }

    [labelInput, visibleInput, centerXInput, centerYInput, edgePxInput, edgeMmInput].forEach((input) => {
      if (!input) {
        return;
      }
      input.addEventListener("change", applyDetailEdits);
    });
  }

  function updateExportUi() {
    if (!els.exportStudySelect) {
      return;
    }
    exportStudyApi?.populateSelect(els.exportStudySelect, state.export.studies, state.export.currentStudyId, "No study selected");
    const study = state.export.studies.find((entry) => safeString(entry.id) === state.export.currentStudyId) || null;
    const mirrorSuffix = study
      ? ` If outbox mirroring is enabled, files also go to exports_outbox/noiselab/${study.slug}.`
      : " If outbox mirroring is enabled, NoiseLab will create/select a study from research_study_ID.";
    els.exportTargetNote.textContent = `Primary export downloads one ZIP file to your browser Downloads folder.${mirrorSuffix}`;
  }

  function updateUi() {
    updateSeriesUi();
    updateSliceControls();
    updateMetadataUi();
    updateRoiListUi();
    updateRoiDetailUi();
    if (state.activePage === "figures") {
      renderAnalysisVisuals();
      renderComparisonVisuals();
    }
    renderNpsVisuals();
    updateExportUi();
    if (els.profileTypeSelect) {
      els.profileTypeSelect.value = state.analysisView.profileType;
    }
    els.windowWidthInput.value = String(Math.round(state.viewport.windowWidth));
    els.windowCenterInput.value = String(Math.round(state.viewport.windowCenter));
    const hasVolume = Boolean(getActiveVolume());
    els.overlayNote.style.display = hasVolume ? "none" : "block";
  }

  function setSelectedRoi(roiId) {
    state.selectedRoiId = roiId || "";
    updateRoiListUi();
    updateRoiDetailUi();
    render();
  }

  function closeRoiContextMenu() {
    if (els.roiContextMenu) {
      els.roiContextMenu.hidden = true;
    }
  }

  function isContextMenuGesture(event) {
    return event?.button === 2 || (event?.button === 0 && event?.ctrlKey);
  }

  function openRoiContextMenu(clientX, clientY, roiId) {
    if (!els.roiContextMenu) {
      return;
    }
    setActiveTool("select");
    setSelectedRoi(roiId);
    setSidebarSectionCollapsed("roi-details", false);
    const width = 220;
    const height = 190;
    const left = Math.min(clientX + 8, Math.max(8, window.innerWidth - width - 8));
    const top = Math.min(clientY + 8, Math.max(8, window.innerHeight - height - 8));
    els.roiContextMenu.style.left = `${left}px`;
    els.roiContextMenu.style.top = `${top}px`;
    els.roiContextMenu.hidden = false;
  }

  function focusSelectedRoiEditor() {
    const roi = getSelectedRoi();
    if (!roi) {
      return;
    }
    setActiveTool("select");
    selectRoiAndNavigate(roi.id, { center: true });
    if (roi.type === NPS_ROI_TYPE) {
      const set = getNpsSetForRoi(roi);
      if (set) {
        state.nps.activeSetId = set.id;
        syncNpsInputsFromSet(set);
        setSidebarSectionCollapsed("nps-rings", false);
        window.requestAnimationFrame(() => {
          els.npsRingSpacingInput?.focus();
          els.npsRingSpacingInput?.select?.();
        });
        setStatus(
          `${set.label} is editable as a locked NPS set. Drag the set to move it, drag a ring ROI corner to change radius, or edit Ring Spacing.`
        );
        return;
      }
    }
    setSidebarSectionCollapsed("roi-details", false);
    els.roiDetail?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    window.requestAnimationFrame(() => {
      const edgePxInput = document.getElementById("noiselab-roi-edge-px");
      const edgeMmInput = document.getElementById("noiselab-roi-edge-mm");
      const centerXInput = document.getElementById("noiselab-roi-center-x");
      const labelInput = document.getElementById("noiselab-roi-label-input");
      const preferredInput = [edgePxInput, edgeMmInput, centerXInput, labelInput].find((input) => input && !input.disabled);
      preferredInput?.focus();
      preferredInput?.select?.();
    });
    setStatus(`${roi.label || "ROI"} is editable. Drag the ROI body to move it; drag corner handles to resize; use ROI Details for exact numbers.`);
  }

  function addRoi(roi) {
    state.rois.push(roi);
    invalidateRoiCache(roi.id);
    setSelectedRoi(roi.id);
  }

  function createOneClickRoi(xImg, yImg) {
    return createSquareRoi({
      sequence: state.roiSequence,
      datasetId: state.activeDatasetId,
      sliceIndex: state.activeSliceIndex,
      centerXImg: xImg,
      centerYImg: yImg,
      squareMode: state.roiMode.squareMode,
      edgePx: state.roiMode.fixedPixelEdge,
      edgeMm: state.roiMode.fixedMmEdge,
    });
  }

  function revealPlacedRoi(roi) {
    if (!roi) {
      return;
    }
    const volume = getActiveVolume();
    if (roi.datasetId === state.activeDatasetId && volume) {
      state.activeSliceIndex = clamp(Number(roi.sliceIndex) || 0, 0, volume.depth - 1);
    }
    state.selectedRoiId = roi.id;
    state.suppressSliceWheelUntil = Date.now() + 700;
    setActiveTool("select");
    setActivePage("viewer");
    updateUi();
    render();
    scheduleRender();
    setStatus(`${roi.label || "ROI"} placed and selected. Drag the ROI body to move it; drag corner handles to resize.`);
  }

  function updateDraggedNewRoi(pointer) {
    const drag = state.dragging;
    if (!drag || drag.type !== "new-roi") {
      return;
    }

    const dx = pointer.xImg - drag.anchorXImg;
    const dy = pointer.yImg - drag.anchorYImg;
    const signX = dx >= 0 ? 1 : -1;
    const signY = dy >= 0 ? 1 : -1;

    if (drag.roi.squareMode === SQUARE_MODE_PIXEL) {
      const edgePx = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))) + 1);
      const centerX = drag.anchorXImg + signX * (edgePx - 1) / 2;
      const centerY = drag.anchorYImg + signY * (edgePx - 1) / 2;
      drag.roi.edgePx = edgePx;
      drag.roi.centerXImg = centerX;
      drag.roi.centerYImg = centerY;
    } else {
      const volume = getActiveVolume();
      const spacingX = volume?.columnSpacing || 1;
      const spacingY = volume?.rowSpacing || 1;
      const edgeMm = Math.max(Math.abs(dx) * spacingX, Math.abs(dy) * spacingY, 0.1);
      drag.roi.edgeMm = edgeMm;
      drag.roi.centerXImg = drag.anchorXImg + signX * edgeMm / (2 * spacingX);
      drag.roi.centerYImg = drag.anchorYImg + signY * edgeMm / (2 * spacingY);
    }

    drag.roi.updatedAt = new Date().toISOString();
    invalidateRoiCache(drag.roi.id);
    render();
  }

  function updateMovedRoi(pointer) {
    const drag = state.dragging;
    if (!drag || drag.type !== "move-roi") {
      return;
    }
    const roi = drag.roi;
    const previous = captureRoiGeometry(roi);
    const nextX = drag.startCenterX + (pointer.xImg - drag.pointerStartX);
    const nextY = drag.startCenterY + (pointer.yImg - drag.pointerStartY);
    roi.centerXImg = roi.squareMode === SQUARE_MODE_PIXEL ? core.snapPixelSquareCenter(nextX, roi.edgePx) : nextX;
    roi.centerYImg = roi.squareMode === SQUARE_MODE_PIXEL ? core.snapPixelSquareCenter(nextY, roi.edgePx) : nextY;
    const fit = getRoiSourceFit(roi);
    if (!fit.ok) {
      restoreRoiGeometry(roi, previous);
      setStatus(fit.message, "warning");
      render();
      return;
    }
    roi.updatedAt = new Date().toISOString();
    invalidateRoiCache(roi.id);
    render();
  }

  function updateResizedRoi(pointer) {
    const drag = state.dragging;
    if (!drag || drag.type !== "resize-roi") {
      return;
    }
    const roi = drag.roi;
    const volume = getActiveVolume();
    const previous = captureRoiGeometry(roi);

    if (roi.squareMode === SQUARE_MODE_PIXEL) {
      const size = drag.centerScale
        ? Math.max(Math.abs(pointer.xImg - drag.centerX) * 2, Math.abs(pointer.yImg - drag.centerY) * 2)
        : Math.max(Math.abs(pointer.xImg - drag.fixedCornerX), Math.abs(pointer.yImg - drag.fixedCornerY));
      const edgePx = Math.max(1, Math.round(size));
      if (drag.centerScale) {
        roi.edgePx = edgePx;
        roi.centerXImg = core.snapPixelSquareCenter(drag.centerX, edgePx);
        roi.centerYImg = core.snapPixelSquareCenter(drag.centerY, edgePx);
      } else {
        const signX = drag.handleName.includes("e") ? 1 : -1;
        const signY = drag.handleName.includes("s") ? 1 : -1;
        roi.edgePx = edgePx;
        roi.centerXImg = core.snapPixelSquareCenter(drag.fixedCornerX + signX * edgePx / 2, edgePx);
        roi.centerYImg = core.snapPixelSquareCenter(drag.fixedCornerY + signY * edgePx / 2, edgePx);
      }
    } else {
      const spacingX = volume?.columnSpacing || 1;
      const spacingY = volume?.rowSpacing || 1;
      const edgeMm = drag.centerScale
        ? Math.max(Math.abs(pointer.xImg - drag.centerX) * spacingX * 2, Math.abs(pointer.yImg - drag.centerY) * spacingY * 2)
        : Math.max(Math.abs(pointer.xImg - drag.fixedCornerX) * spacingX, Math.abs(pointer.yImg - drag.fixedCornerY) * spacingY);
      roi.edgeMm = Math.max(0.1, edgeMm);
      if (drag.centerScale) {
        roi.centerXImg = drag.centerX;
        roi.centerYImg = drag.centerY;
      } else {
        const signX = drag.handleName.includes("e") ? 1 : -1;
        const signY = drag.handleName.includes("s") ? 1 : -1;
        roi.centerXImg = drag.fixedCornerX + signX * roi.edgeMm / (2 * spacingX);
        roi.centerYImg = drag.fixedCornerY + signY * roi.edgeMm / (2 * spacingY);
      }
    }

    const fit = getRoiSourceFit(roi);
    if (!fit.ok) {
      restoreRoiGeometry(roi, previous);
      setStatus(fit.message, "warning");
      render();
      return;
    }
    roi.updatedAt = new Date().toISOString();
    invalidateRoiCache(roi.id);
    render();
  }

  function createRoiEditDrag(hit, pointer, centerScale, event) {
    const base = {
      roi: hit.roi,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startedByContextGesture: isContextMenuGesture(event),
      hasMoved: false,
    };
    if (hit.hitType === "handle") {
      return {
        ...base,
        type: "resize-roi",
        handleName: hit.handleName,
        centerScale,
        centerX: hit.geometry.centerXImg,
        centerY: hit.geometry.centerYImg,
        fixedCornerX:
          hit.handleName === "nw" || hit.handleName === "sw"
            ? hit.geometry.xMaxBoundaryImg
            : hit.geometry.xMinBoundaryImg,
        fixedCornerY:
          hit.handleName === "nw" || hit.handleName === "ne"
            ? hit.geometry.yMaxBoundaryImg
            : hit.geometry.yMinBoundaryImg,
      };
    }
    return {
      ...base,
      type: "move-roi",
      pointerStartX: pointer.xImg,
      pointerStartY: pointer.yImg,
      startCenterX: hit.geometry.centerXImg,
      startCenterY: hit.geometry.centerYImg,
    };
  }

  function startNpsSetEditDrag(hit, pointer, event) {
    const set = getNpsSetForRoi(hit?.roi);
    if (!set) {
      return false;
    }
    setActiveTool("select");
    state.nps.activeSetId = set.id;
    setSelectedRoi(hit.roi.id);
    closeRoiContextMenu();

    const ringIndex = Math.max(0, Math.round(Number(hit.roi.npsRingIndex) || 0));
    const canResizeRing = hit.hitType === "handle" && ringIndex > 0;
    state.dragging = canResizeRing
      ? {
          type: "resize-nps-set",
          setId: set.id,
          roi: hit.roi,
          preferredRoiId: hit.roi.id,
          ringIndex,
          startClientX: event.clientX,
          startClientY: event.clientY,
          centerXImg: set.centerXImg,
          centerYImg: set.centerYImg,
          startRingSpacingPx: set.ringSpacingPx,
          startedByContextGesture: isContextMenuGesture(event),
          hasMoved: false,
        }
      : {
          type: "move-nps-set",
          setId: set.id,
          roi: hit.roi,
          preferredRoiId: hit.roi.id,
          startClientX: event.clientX,
          startClientY: event.clientY,
          pointerStartX: pointer.xImg,
          pointerStartY: pointer.yImg,
          startCenterX: set.centerXImg,
          startCenterY: set.centerYImg,
          startedByContextGesture: isContextMenuGesture(event),
          hasMoved: false,
        };
    event.preventDefault();
    return true;
  }

  function updateMovedNpsSet(pointer) {
    const drag = state.dragging;
    const set = state.nps.sets.find((entry) => entry.id === drag?.setId);
    if (!set) {
      return;
    }
    const bounded = rebuildExistingNpsSet(set, {
      centerXImg: drag.startCenterX + (pointer.xImg - drag.pointerStartX),
      centerYImg: drag.startCenterY + (pointer.yImg - drag.pointerStartY),
    });
    if (!bounded.ok) {
      setStatus(bounded.message, "warning");
      return;
    }
    applyNpsSetLayout(set, bounded, { preferredRoiId: drag.preferredRoiId });
  }

  function updateResizedNpsSet(pointer) {
    const drag = state.dragging;
    const set = state.nps.sets.find((entry) => entry.id === drag?.setId);
    if (!set) {
      return;
    }
    const distancePx = Math.hypot(pointer.xImg - drag.centerXImg, pointer.yImg - drag.centerYImg);
    const requestedRingSpacingPx = Math.max(set.edgePx, distancePx / Math.max(1, drag.ringIndex));
    const bounded = rebuildExistingNpsSet(set, {
      ringSpacingPx: requestedRingSpacingPx,
    });
    if (!bounded.ok) {
      setStatus(bounded.message, "warning");
      return;
    }
    applyNpsSetLayout(set, bounded, { preferredRoiId: drag.preferredRoiId });
  }

  function getActiveNpsDraft() {
    const draft = state.nps.draft;
    if (!draft || draft.datasetId !== state.activeDatasetId || draft.sliceIndex !== state.activeSliceIndex) {
      return null;
    }
    return draft;
  }

  function updateNpsDraftFromPointer(pointer) {
    const draft = getActiveNpsDraft();
    if (!draft || !pointer) {
      return false;
    }
    draft.radiusPx = Math.hypot(pointer.xImg - draft.centerXImg, pointer.yImg - draft.centerYImg);
    render();
    return true;
  }

  function beginNpsPlacement(pointer) {
    if (!isImagePointInsideSource(pointer.xImg, pointer.yImg)) {
      setStatus("Place the NPS center inside the visible source-image border.", "warning");
      return false;
    }
    if (!core.supportsPhysicalSquare(getActiveVolume())) {
      setStatus("NPS analysis requires Pixel Spacing metadata on the active series.", "warning");
      return false;
    }
    applyNpsInputsToState();
    clearCurrentSliceNpsSets({ silent: true });
    state.nps.draft = {
      datasetId: state.activeDatasetId,
      sliceIndex: state.activeSliceIndex,
      centerXImg: pointer.xImg,
      centerYImg: pointer.yImg,
      radiusPx: 0,
    };
    setStatus("NPS center set. Move the mouse to size the circle, then double-click to place the square ROIs.");
    updateUi();
    render();
    return true;
  }

  function commitNpsDraft(pointer) {
    const draft = getActiveNpsDraft();
    if (!draft) {
      return false;
    }
    if (pointer) {
      updateNpsDraftFromPointer(pointer);
    }
    const radiusPx = Math.max(0, Number(draft.radiusPx) || 0);
    state.nps.draft = null;
    const ringCount = Math.max(1, Math.round(Number(state.nps.ringCount) || DEFAULT_NPS_RING_COUNT));
    createNpsSetAt(draft.centerXImg, draft.centerYImg, {
      ringCount,
      boundaryRadiusPx: radiusPx,
    });
    setActiveTool("select");
    updateUi();
    render();
    return true;
  }

  function startRoiEditDrag(hit, pointer, event) {
    if (hit?.roi?.type === NPS_ROI_TYPE) {
      return startNpsSetEditDrag(hit, pointer, event);
    }
    const centerScale = state.roiMode.centerScale || event.altKey;
    setSelectedRoi(hit.roi.id);
    closeRoiContextMenu();
    state.dragging = createRoiEditDrag(hit, pointer, centerScale, event);
    event.preventDefault();
    return true;
  }

  function handlePointerDown(event) {
    if (!getActiveVolume()) {
      return;
    }

    const pointer = canvasToImageCoord(event.clientX, event.clientY);
    const hit = findRoiHit(pointer.xImg, pointer.yImg);

    if (isContextMenuGesture(event)) {
      if (hit) {
        startRoiEditDrag(hit, pointer, event);
        return;
      }
      if (event.button !== 2) {
        closeRoiContextMenu();
        event.preventDefault();
        return;
      }
      closeRoiContextMenu();
      state.dragging = {
        type: "stack-scrub",
        startY: event.clientY,
        startSliceIndex: state.activeSliceIndex,
      };
      event.preventDefault();
      return;
    }

    if (event.button === 1) {
      state.dragging = {
        type: "pan",
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: state.viewport.panX,
        startPanY: state.viewport.panY,
        source: "middleMouse",
      };
      event.preventDefault();
      return;
    }

    closeRoiContextMenu();
    const forceToolPlacement =
      event.shiftKey && ["squareRoi", "npsConcentric"].includes(state.activeTool);

    if (hit && !forceToolPlacement) {
      startRoiEditDrag(hit, pointer, event);
      return;
    }

    if (state.activeTool === "npsConcentric") {
      if (getActiveNpsDraft()) {
        updateNpsDraftFromPointer(pointer);
      } else {
        beginNpsPlacement(pointer);
      }
      event.preventDefault();
      return;
    }

    if (state.activeTool === "squareRoi") {
      if (!isImagePointInsideSource(pointer.xImg, pointer.yImg)) {
        setStatus("Place ROIs inside the visible source-image border. Outside-image placement is blocked to keep overlays and sampled pixels aligned.", "warning");
        return;
      }
      if (state.roiMode.squareMode === SQUARE_MODE_PHYSICAL && !core.supportsPhysicalSquare(getActiveVolume())) {
        setStatus("Physical-square mode requires Pixel Spacing metadata on the active series.", "warning");
        return;
      }
      const roi = createOneClickRoi(pointer.xImg, pointer.yImg);
      addRoi(roi);
      state.roiSequence += 1;
      state.dragging = {
        type: "new-roi",
        roi,
        anchorXImg: pointer.xImg,
        anchorYImg: pointer.yImg,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
      event.preventDefault();
      return;
    }

    if (hit) {
      startRoiEditDrag(hit, pointer, event);
      return;
    }

    setSelectedRoi("");
    if (state.activeTool === "pan") {
      state.dragging = {
        type: "pan",
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: state.viewport.panX,
        startPanY: state.viewport.panY,
      };
    } else if (state.activeTool === "windowLevel") {
      state.dragging = {
        type: "window-level",
        startClientX: event.clientX,
        startClientY: event.clientY,
        startWw: state.viewport.windowWidth,
        startWl: state.viewport.windowCenter,
      };
    } else if (state.activeTool === "zoom") {
      state.dragging = {
        type: "zoom",
        startClientY: event.clientY,
        startZoom: state.viewport.zoom,
      };
    }
  }

  function handlePointerMove(event) {
    const drag = state.dragging;
    if (!drag) {
      if (state.activeTool === "npsConcentric" && getActiveNpsDraft()) {
        const pointer = canvasToImageCoord(event.clientX, event.clientY);
        updateNpsDraftFromPointer(pointer);
      }
      updateCanvasCursor(event);
      return;
    }
    if (Number.isFinite(drag.startClientX) && Number.isFinite(drag.startClientY)) {
      drag.hasMoved = drag.hasMoved || Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > 3;
    }

    if (drag.type === "stack-scrub") {
      const volume = getActiveVolume();
      if (!volume) {
        return;
      }
      const deltaY = drag.startY - event.clientY;
      const sliceDelta = Math.round(deltaY / 8);
      setActiveSliceIndex(clamp(drag.startSliceIndex + sliceDelta, 0, volume.depth - 1));
      updateUi();
      render();
      updateCanvasCursor(event);
      return;
    }

    const pointer = canvasToImageCoord(event.clientX, event.clientY);

    if (drag.type === "new-roi") {
      updateDraggedNewRoi(pointer);
      updateUi();
      updateCanvasCursor(event);
      return;
    }
    if (drag.type === "move-roi") {
      updateMovedRoi(pointer);
      updateUi();
      updateCanvasCursor(event);
      return;
    }
    if (drag.type === "resize-roi") {
      updateResizedRoi(pointer);
      updateUi();
      updateCanvasCursor(event);
      return;
    }
    if (drag.type === "move-nps-set") {
      updateMovedNpsSet(pointer);
      updateCanvasCursor(event);
      return;
    }
    if (drag.type === "resize-nps-set") {
      updateResizedNpsSet(pointer);
      updateCanvasCursor(event);
      return;
    }
    if (drag.type === "pan") {
      const { ratioX, ratioY } = getCanvasClientScale();
      state.viewport.panX = drag.startPanX + (event.clientX - drag.startClientX) * ratioX;
      state.viewport.panY = drag.startPanY + (event.clientY - drag.startClientY) * ratioY;
      render();
      updateCanvasCursor(event);
      return;
    }
    if (drag.type === "window-level") {
      state.viewport.windowWidth = Math.max(1, drag.startWw + (event.clientX - drag.startClientX) * 3);
      state.viewport.windowCenter = drag.startWl - (event.clientY - drag.startClientY) * 2;
      updateUi();
      render();
      updateCanvasCursor(event);
      return;
    }
    if (drag.type === "zoom") {
      const delta = (drag.startClientY - event.clientY) / 220;
      state.viewport.zoom = clamp(drag.startZoom * (1 + delta), 0.2, 30);
      render();
      updateCanvasCursor(event);
    }
  }

  function handlePointerUp(event) {
    const drag = state.dragging;
    state.dragging = null;
    updateCanvasCursor(event);
    if (drag?.type === "new-roi") {
      if (!drag.hasMoved) {
        state.rois = state.rois.filter((roi) => roi.id !== drag.roi.id);
        if (state.selectedRoiId === drag.roi.id) {
          state.selectedRoiId = "";
        }
        invalidateRoiCache(drag.roi.id);
        updateUi();
        render();
        setStatus("Drag to place a square ROI. A simple click does not create an ROI.", "warning");
        return;
      }
      const fit = getRoiSourceFit(drag.roi);
      if (!fit.ok) {
        state.rois = state.rois.filter((roi) => roi.id !== drag.roi.id);
        if (state.selectedRoiId === drag.roi.id) {
          state.selectedRoiId = "";
        }
        invalidateRoiCache(drag.roi.id);
        updateUi();
        render();
        setStatus(fit.message, "warning");
        return;
      }
      revealPlacedRoi(drag.roi);
      return;
    }
    if ((drag?.type === "move-nps-set" || drag?.type === "resize-nps-set") && drag.hasMoved) {
      state.suppressContextMenuUntil = Date.now() + 300;
      const set = state.nps.sets.find((entry) => entry.id === drag.setId);
      setStatus(
        `${set?.label || "NPS set"} ${drag.type === "move-nps-set" ? "moved" : "radius adjusted"}. ` +
          "NPS ROIs remain locked to the concentric set and inside the source image."
      );
      updateUi();
      render();
      return;
    }
    if (drag?.startedByContextGesture && drag.hasMoved) {
      state.suppressContextMenuUntil = Date.now() + 300;
      setStatus(`${drag.roi?.label || "ROI"} edited. Drag the ROI body to move it; drag corner handles to resize.`);
    }
    updateUi();
    render();
    if (drag?.startedByContextGesture && !drag.hasMoved && drag.roi) {
      openRoiContextMenu(event.clientX, event.clientY, drag.roi.id);
    }
  }

  function handleCanvasContextMenu(event) {
    event.preventDefault();
    if (!getActiveVolume() || state.dragging?.startedByContextGesture || Date.now() < state.suppressContextMenuUntil) {
      return;
    }
    const pointer = canvasToImageCoord(event.clientX, event.clientY);
    const hit = findRoiHit(pointer.xImg, pointer.yImg);
    if (!hit) {
      closeRoiContextMenu();
      return;
    }
    openRoiContextMenu(event.clientX, event.clientY, hit.roi.id);
    setStatus(`${hit.roi.label || "ROI"} selected. Choose Edit Size / Position, or drag the ROI body/handles directly.`);
  }

  function handleCanvasDoubleClick(event) {
    if (state.activeTool !== "npsConcentric" || !getActiveNpsDraft()) {
      return;
    }
    event.preventDefault();
    const pointer = canvasToImageCoord(event.clientX, event.clientY);
    commitNpsDraft(pointer);
  }

  function deleteRoiById(roiId) {
    const targetId = safeString(roiId);
    if (!targetId) {
      return;
    }
    const target = state.rois.find((roi) => roi.id === targetId);
    if (!target) {
      setStatus("ROI could not be found. The list was refreshed.", "warning");
      updateUi();
      render();
      return;
    }
    state.rois = state.rois.filter((roi) => roi.id !== targetId);
    invalidateRoiCache(targetId);
    invalidateNpsCache();
    if (state.selectedRoiId === targetId) {
      state.selectedRoiId = "";
    }
    updateUi();
    render();
    setStatus(`${target.label || target.id} deleted.`);
  }

  function deleteSelectedRoi() {
    if (state.selectedRoiId) {
      deleteRoiById(state.selectedRoiId);
      return;
    }
    const seriesRois = state.rois.filter((roi) => roi.datasetId === state.activeDatasetId && roi.visible !== false);
    if (seriesRois.length === 1) {
      deleteRoiById(seriesRois[0].id);
      return;
    }
    setStatus("Select an ROI in the list or on the image before deleting.", "warning");
  }

  function duplicateSelectedRoi() {
    const roi = getSelectedRoi();
    if (!roi) {
      return;
    }
    const duplicate = cloneRoi(roi);
    duplicate.id = `roi_${String(state.roiSequence).padStart(3, "0")}`;
    duplicate.label = `${roi.label} copy`;
    duplicate.centerXImg += roi.squareMode === SQUARE_MODE_PIXEL ? 2 : 2;
    duplicate.centerYImg += roi.squareMode === SQUARE_MODE_PIXEL ? 2 : 2;
    if (!isRoiFullyInsideSource(duplicate)) {
      duplicate.centerXImg = roi.centerXImg;
      duplicate.centerYImg = roi.centerYImg;
    }
    const fit = getRoiSourceFit(duplicate);
    if (!fit.ok) {
      setStatus(`${fit.message} Duplicate was not created.`, "warning");
      return;
    }
    duplicate.updatedAt = new Date().toISOString();
    state.roiSequence += 1;
    addRoi(duplicate);
    updateUi();
    render();
  }

  function getCurrentSliceRois() {
    return state.rois.filter((roi) => roi.datasetId === state.activeDatasetId && roi.sliceIndex === state.activeSliceIndex);
  }

  function cloneNpsSetsForTarget(sourceRois, sourceDataset, targetDataset, copyScope, copiedAt) {
    const setIdMap = new Map();
    const sourceSetIds = Array.from(new Set(sourceRois.map((roi) => roi.npsSetId).filter(Boolean)));
    sourceSetIds.forEach((sourceSetId) => {
      const sourceSet = state.nps.sets.find((set) => set.id === sourceSetId);
      if (!sourceSet) {
        return;
      }
      const sourcePoint = getPatientPointForImageCoord(
        sourceDataset,
        sourceSet.sliceIndex,
        sourceSet.centerXImg,
        sourceSet.centerYImg
      );
      const sliceMatch = findTargetSliceForSourcePoint(sourceDataset, sourceSet.sliceIndex, targetDataset, sourcePoint);
      const targetRecord = getDatasetSliceRecord(targetDataset, sliceMatch.index);
      const targetCoord = patientPointToImageCoord(targetRecord, sourcePoint);
      const targetSetId = `nps_set_${String(state.nps.sequence).padStart(3, "0")}`;
      state.nps.sequence += 1;
      const targetSet = {
        ...sourceSet,
        id: targetSetId,
        datasetId: targetDataset.id,
        sliceIndex: sliceMatch.index,
        centerXImg: Number.isFinite(targetCoord?.xImg) ? targetCoord.xImg : sourceSet.centerXImg,
        centerYImg: Number.isFinite(targetCoord?.yImg) ? targetCoord.yImg : sourceSet.centerYImg,
        label: sourceSet.label,
        copiedFromNpsSetId: sourceSet.id,
        copiedFromDatasetId: sourceSet.datasetId,
        copiedFromSliceIndex: sourceSet.sliceIndex,
        copiedFromDatasetLabel: getActiveDataset()?.label || "",
        copyScope,
        copyMappingMethod: Number.isFinite(targetCoord?.xImg) && Number.isFinite(targetCoord?.yImg) ? "patient-space" : "image-space-fallback",
        copySliceMappingMethod: sliceMatch.method,
        copySliceDistanceMm: sliceMatch.distanceMm,
        createdAt: copiedAt,
        updatedAt: copiedAt,
      };
      state.nps.sets.push(targetSet);
      setIdMap.set(sourceSetId, targetSetId);
    });
    return setIdMap;
  }

  function mapRoiToTargetDataset(sourceRoi, sourceDataset, targetDataset) {
    const sourcePoint = getPatientPointForImageCoord(
      sourceDataset,
      sourceRoi.sliceIndex,
      sourceRoi.centerXImg,
      sourceRoi.centerYImg
    );
    const sliceMatch = findTargetSliceForSourcePoint(sourceDataset, sourceRoi.sliceIndex, targetDataset, sourcePoint);
    const targetSliceIndex = sliceMatch.index;
    const targetRecord = getDatasetSliceRecord(targetDataset, targetSliceIndex);
    const targetCoord = patientPointToImageCoord(targetRecord, sourcePoint);
    const mapped = {
      centerXImg: Number.isFinite(targetCoord?.xImg) ? targetCoord.xImg : sourceRoi.centerXImg,
      centerYImg: Number.isFinite(targetCoord?.yImg) ? targetCoord.yImg : sourceRoi.centerYImg,
      sliceIndex: targetSliceIndex,
      mappingMethod: Number.isFinite(targetCoord?.xImg) && Number.isFinite(targetCoord?.yImg) ? "patient-space" : "image-space-fallback",
      sliceMappingMethod: sliceMatch.method,
      sliceDistanceMm: sliceMatch.distanceMm,
    };

    if (sourceRoi.squareMode === SQUARE_MODE_PIXEL) {
      const sourceSpacingX = sourceDataset.volume?.columnSpacing;
      const sourceSpacingY = sourceDataset.volume?.rowSpacing;
      const targetSpacingX = targetDataset.volume?.columnSpacing;
      const targetSpacingY = targetDataset.volume?.rowSpacing;
      const sourceSpacing =
        Number.isFinite(sourceSpacingX) && Number.isFinite(sourceSpacingY) ? (sourceSpacingX + sourceSpacingY) / 2 : null;
      const targetSpacing =
        Number.isFinite(targetSpacingX) && Number.isFinite(targetSpacingY) ? (targetSpacingX + targetSpacingY) / 2 : null;
      if (Number.isFinite(sourceRoi.edgePx) && Number.isFinite(sourceSpacing) && Number.isFinite(targetSpacing) && targetSpacing > 0) {
        mapped.edgePx = Math.max(1, Math.round((sourceRoi.edgePx * sourceSpacing) / targetSpacing));
        mapped.sizeMappingMethod = "physical-edge-preserving-pixel-square";
      } else {
        mapped.edgePx = sourceRoi.edgePx || DEFAULT_FIXED_PIXEL_EDGES[1];
        mapped.sizeMappingMethod = "pixel-edge-fallback";
      }
    } else {
      mapped.edgeMm = sourceRoi.edgeMm;
      mapped.sizeMappingMethod = "physical-square-edge-mm-preserved";
    }
    return mapped;
  }

  function copyRoisToAllSeries(sourceRois, options = {}) {
    const sourceDataset = getActiveDataset();
    if (!sourceDataset || state.datasets.length < 2) {
      setStatus("Load multiple series before copying ROIs to reconstructions.", "warning");
      return;
    }

    const roisToCopy = (sourceRois || []).filter(
      (roi) => roi.datasetId === sourceDataset.id && roi.sliceIndex === state.activeSliceIndex
    );
    if (!roisToCopy.length) {
      setStatus("Place or select at least one ROI on the active slice before copying.", "warning");
      return;
    }

    const copyScope = options.scope || "current-slice";
    const sourceRoiIds = new Set(roisToCopy.map((roi) => roi.id));
    const sourceSetIds = new Set(roisToCopy.map((roi) => roi.npsSetId).filter(Boolean));
    const copiedAt = new Date().toISOString();
    let copiedCount = 0;
    let targetCount = 0;
    let skippedCount = 0;

    state.datasets.forEach((targetDataset) => {
      if (targetDataset.id === sourceDataset.id) {
        return;
      }
      state.rois = state.rois.filter((roi) => {
        if (roi.datasetId !== targetDataset.id) {
          return true;
        }
        if (copyScope === "current-slice") {
          return !(roi.copiedFromDatasetId === sourceDataset.id && roi.copiedFromSliceIndex === state.activeSliceIndex && roi.copyScope === copyScope);
        }
        return !sourceRoiIds.has(roi.copiedFromRoiId);
      });
      state.nps.sets = state.nps.sets.filter((set) => {
        if (set.datasetId !== targetDataset.id) {
          return true;
        }
        if (!sourceSetIds.has(set.copiedFromNpsSetId)) {
          return true;
        }
        return set.copyScope !== copyScope;
      });

      const setIdMap = cloneNpsSetsForTarget(roisToCopy, sourceDataset, targetDataset, copyScope, copiedAt);
      roisToCopy.forEach((sourceRoi) => {
        const mapping = mapRoiToTargetDataset(sourceRoi, sourceDataset, targetDataset);
        const copiedRoi = cloneRoi(sourceRoi);
        copiedRoi.id = `roi_${String(state.roiSequence).padStart(3, "0")}`;
        copiedRoi.datasetId = targetDataset.id;
        copiedRoi.sliceIndex = mapping.sliceIndex;
        copiedRoi.label = sourceRoi.label;
        copiedRoi.centerXImg = mapping.centerXImg;
        copiedRoi.centerYImg = mapping.centerYImg;
        if (copiedRoi.squareMode === SQUARE_MODE_PIXEL) {
          copiedRoi.edgePx = mapping.edgePx;
        } else {
          copiedRoi.edgeMm = mapping.edgeMm;
        }
        const fit = getRoiSourceFit(copiedRoi, targetDataset.volume);
        if (!fit.ok) {
          skippedCount += 1;
          return;
        }
        copiedRoi.copiedFromRoiId = sourceRoi.id;
        copiedRoi.copiedFromDatasetId = sourceDataset.id;
        copiedRoi.copiedFromSliceIndex = state.activeSliceIndex;
        copiedRoi.copiedFromDatasetLabel = sourceDataset.label || "";
        copiedRoi.copyScope = copyScope;
        copiedRoi.copyMappingMethod = mapping.mappingMethod;
        copiedRoi.copySliceMappingMethod = mapping.sliceMappingMethod;
        copiedRoi.copySliceDistanceMm = mapping.sliceDistanceMm;
        copiedRoi.copySizeMappingMethod = mapping.sizeMappingMethod;
        if (copiedRoi.npsSetId && setIdMap.has(copiedRoi.npsSetId)) {
          copiedRoi.npsSetId = setIdMap.get(copiedRoi.npsSetId);
        }
        copiedRoi.createdAt = copiedAt;
        copiedRoi.updatedAt = copiedAt;
        state.rois.push(copiedRoi);
        state.roiSequence += 1;
        copiedCount += 1;
      });
      targetCount += 1;
    });

    invalidateRoiCache();
    invalidateNpsCache();
    updateUi();
    render();
    const skippedMessage = skippedCount
      ? ` ${skippedCount} mapped ROI${skippedCount === 1 ? "" : "s"} were skipped because they would not fit inside the target source image.`
      : "";
    setStatus(
      `Copied ${copiedCount} ROI${copiedCount === 1 ? "" : "s"} to ${targetCount} series using patient-space center/slice matching when DICOM geometry is available. Verify registration before analysis.${skippedMessage}`
    );
  }

  function copyCurrentSliceRoisToAllSeries() {
    copyRoisToAllSeries(getCurrentSliceRois(), { scope: "current-slice" });
  }

  function copySelectedRoiToAllSeries() {
    const roi = getSelectedRoi();
    if (!roi) {
      setStatus("Select a ROI before copying it to all series.", "warning");
      return;
    }
    copyRoisToAllSeries([roi], { scope: `selected-roi:${roi.id}` });
  }

  async function saveExportFile(file) {
    const contentBase64 =
      typeof file?.contentBase64 === "string"
        ? file.contentBase64
        : encodeTextBase64(file?.content || "");
    const response = await fetch("/api/exports/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workflow: "noiselab",
        filename: file?.name,
        contentBase64,
        mimeType: file?.mimeType,
        studyId: state.export.currentStudyId || "",
        patientStudyId: els.patientStudyIdInput.value.trim(),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || `Could not save ${file?.name || "export file"} through the local export backend.`);
    }
    return payload;
  }

  function getExportableDatasetEntries() {
    return state.datasets
      .map((dataset, index) => ({
        dataset,
        index,
        rois: state.rois.filter((roi) => roi.datasetId === dataset.id),
        npsSets: state.nps.sets.filter((set) => set.datasetId === dataset.id),
      }))
      .filter((entry) => entry.rois.length || entry.npsSets.length);
  }

  function makeSeriesExportPrefix(entry, isMultiSeriesExport) {
    if (!isMultiSeriesExport) {
      return "";
    }
    const label = sanitizeExportPart(entry.dataset?.label || `series_${entry.index + 1}`, "series");
    return `series_${String(entry.index + 1).padStart(2, "0")}_${label}`;
  }

  function makeSeriesExportFolder(entry) {
    const label = sanitizeExportPart(entry.dataset?.label || `series_${entry.index + 1}`, "series");
    return `series_${String(entry.index + 1).padStart(2, "0")}_${label}`;
  }

  async function exportBundle() {
    const dataset = getActiveDataset();
    if (!dataset) {
      throw new Error("Load a DICOM series before exporting.");
    }

    const researchStudyId = els.researchStudyIdInput.value.trim();
    const patientStudyId = els.patientStudyIdInput.value.trim();
    if (!researchStudyId || !patientStudyId) {
      throw new Error("Both research_study_ID and patient_study_ID are required before export.");
    }

    const exportEntries = getExportableDatasetEntries();
    const roiCount = exportEntries.reduce((sum, entry) => sum + entry.rois.length, 0);
    if (!roiCount) {
      throw new Error("Place at least one ROI before export.");
    }

    const mirrorOutbox = Boolean(els.exportMirrorOutboxInput?.checked);
    if (mirrorOutbox && !state.export.currentStudyId && exportStudyApi && researchStudyId) {
      const payload = await exportStudyApi.create(researchStudyId);
      state.export.studies = Array.isArray(payload?.studies) ? payload.studies : [];
      state.export.currentStudyId = safeString(payload?.currentStudyId) || "";
      updateExportUi();
    }

    const timestamp = new Date().toISOString();
    const archiveBaseName = buildExportArchiveName(researchStudyId, patientStudyId, timestamp);
    const rootFolder = archiveBaseName;
    const zipFiles = [];
    const mirrorFiles = [];
    const savedFiles = [];

    function queueExportFile(file, zipFolder, mirrorPrefix) {
      if (!file) {
        return;
      }
      const zipPath = makeZipPath(rootFolder, zipFolder, file.name || "file");
      zipFiles.push({
        ...file,
        name: zipPath,
      });
      if (mirrorOutbox) {
        mirrorFiles.push(prefixExportFile(file, mirrorPrefix));
      }
    }

    async function saveFileWithStatus(file) {
      setStatus(`Saving ${file.name}...`);
      try {
        const result = await saveExportFile(file);
        savedFiles.push(result);
      } catch (error) {
        throw new Error(`NoiseLab export failed while saving ${file.name}: ${error.message || error}`);
      }
    }

    setStatus(`Building NoiseLab ZIP bundle for ${exportEntries.length} series...`);
    for (const entry of exportEntries) {
      const folder = makeSeriesExportFolder(entry);
      const mirrorPrefix = makeSeriesExportPrefix(entry, true);
      const bundle = buildExportBundle(entry.dataset, entry.rois, {
        researchStudyId,
        patientStudyId,
        timestamp,
        npsSets: entry.npsSets,
      });

      for (const file of bundle.files) {
        queueExportFile(file, folder, mirrorPrefix);
      }

      for (const analysisEntry of bundle.analyses) {
        const overlayFile = await exportApi.createOverlayPngFile(
          entry.dataset.volume,
          analysisEntry.roi,
          state.viewport,
          {
            metricBadge: {
              label: "SD",
              value: analysisEntry.analysis.statsCalibrated?.sd,
              digits: 2,
            },
          }
        );
        queueExportFile(overlayFile, folder, mirrorPrefix);

        const analysisFigureFiles = await exportApi.createAnalysisFigureFiles(analysisEntry.roi, analysisEntry.analysis, {
          histogramBins: state.analysisView.histogramBins,
        });
        for (const figureFile of analysisFigureFiles) {
          queueExportFile(figureFile, folder, mirrorPrefix);
        }
      }

      for (const npsEntry of bundle.npsAnalyses || []) {
        const npsFigureFiles = await exportApi.createNpsFigureFiles(npsEntry.set, npsEntry.analysis);
        for (const figureFile of npsFigureFiles) {
          queueExportFile(figureFile, folder, mirrorPrefix);
        }
      }
    }

    const comparisonBundle = buildReconstructionComparisonBundle(state.datasets, state.rois, {
      researchStudyId,
      patientStudyId,
      timestamp,
      npsSets: state.nps.sets,
    });
    for (const file of comparisonBundle.files) {
      queueExportFile(file, "comparison", "comparison");
    }
    const comparisonFigure = await exportApi.createReconstructionComparisonPngFile(comparisonBundle);
    if (comparisonFigure) {
      queueExportFile(comparisonFigure, "comparison", "comparison");
    }

    if (!zipFiles.length) {
      throw new Error("No export files were generated.");
    }

    setStatus(`Creating ${archiveBaseName}.zip with ${zipFiles.length} files...`);
    const zipBlob = await createZipBlob(zipFiles);
    downloadBlob(zipBlob, `${archiveBaseName}.zip`);

    if (mirrorOutbox) {
      for (const file of mirrorFiles) {
        await saveFileWithStatus(file);
      }
    }

    const targetDirectory = savedFiles.find((file) => file?.directory)?.directory || "";
    const mirrorText = mirrorOutbox
      ? ` Also mirrored ${savedFiles.length} individual file${savedFiles.length === 1 ? "" : "s"}${targetDirectory ? ` to ${targetDirectory}` : ""}.`
      : "";
    setStatus(`Noise analysis ZIP downloaded: ${archiveBaseName}.zip (${zipFiles.length} files).${mirrorText}`);
  }

  async function loadExportStudies() {
    if (!exportStudyApi) {
      return;
    }
    const payload = await exportStudyApi.load();
    state.export.studies = Array.isArray(payload?.studies) ? payload.studies : [];
    state.export.currentStudyId = safeString(payload?.currentStudyId) || "";
    updateExportUi();
  }

  async function createExportStudy() {
    if (!exportStudyApi) {
      return;
    }
    const label = els.exportStudyCreateInput.value.trim();
    if (!label) {
      els.exportStudyCreateInput.focus();
      return;
    }
    const payload = await exportStudyApi.create(label);
    state.export.studies = Array.isArray(payload?.studies) ? payload.studies : [];
    state.export.currentStudyId = safeString(payload?.currentStudyId) || "";
    els.exportStudyCreateInput.value = "";
    if (!els.researchStudyIdInput.value.trim()) {
      els.researchStudyIdInput.value = state.export.currentStudyId || label;
    }
    updateExportUi();
  }

  async function selectExportStudy() {
    if (!exportStudyApi) {
      return;
    }
    const payload = await exportStudyApi.select(els.exportStudySelect.value || "");
    state.export.currentStudyId = safeString(payload?.study?.id || payload?.id) || "";
    if (!els.researchStudyIdInput.value.trim()) {
      els.researchStudyIdInput.value = state.export.currentStudyId || "";
    }
    updateExportUi();
  }

  function bindUi() {
    els.statusPill = document.getElementById("noiselab-status-pill");
    els.studyNote = document.getElementById("noiselab-study-note");
    els.seriesList = document.getElementById("noiselab-series-list");
    els.roiList = document.getElementById("noiselab-roi-list");
    els.roiNote = document.getElementById("noiselab-roi-note");
    els.roiDetail = document.getElementById("noiselab-roi-detail");
    els.roiDetailNote = document.getElementById("noiselab-roi-detail-note");
    els.metadata = document.getElementById("noiselab-metadata");
    els.canvas = document.getElementById("noiselab-canvas");
    els.roiContextMenu = document.getElementById("noiselab-roi-context-menu");
    els.viewerPanel = document.getElementById("noiselab-viewer-panel");
    els.figuresPanel = document.getElementById("noiselab-figures-panel");
    els.overlayNote = document.getElementById("noiselab-overlay-note");
    els.sliceSlider = document.getElementById("noiselab-slice-slider");
    els.readout = document.getElementById("noiselab-readout");
    els.windowWidthInput = document.getElementById("noiselab-window-width");
    els.windowCenterInput = document.getElementById("noiselab-window-center");
    els.exportStudySelect = document.getElementById("noiselab-export-study-select");
    els.exportStudyCreateInput = document.getElementById("noiselab-export-study-create");
    els.exportTargetNote = document.getElementById("noiselab-export-target-note");
    els.exportMirrorOutboxInput = document.getElementById("noiselab-export-mirror-outbox");
    els.researchStudyIdInput = document.getElementById("noiselab-research-study-id");
    els.patientStudyIdInput = document.getElementById("noiselab-patient-study-id");
    els.analysisNote = document.getElementById("noiselab-analysis-note");
    els.profileTypeSelect = document.getElementById("noiselab-profile-type");
    els.profileCanvas = document.getElementById("noiselab-profile-canvas");
    els.histogramCanvas = document.getElementById("noiselab-histogram-canvas");
    els.profileSummary = document.getElementById("noiselab-profile-summary");
    els.characterizationSourceCanvas = document.getElementById("noiselab-characterization-source-canvas");
    els.characterizationDerivedCanvas = document.getElementById("noiselab-characterization-derived-canvas");
    els.characterizationSummary = document.getElementById("noiselab-characterization-summary");
    els.npsNote = document.getElementById("noiselab-nps-note");
    els.npsEdgeInput = document.getElementById("noiselab-nps-edge-px");
    els.npsRingCountInput = document.getElementById("noiselab-nps-ring-count");
    els.npsRoisPerRingInput = document.getElementById("noiselab-nps-rois-per-ring");
    els.npsRingSpacingInput = document.getElementById("noiselab-nps-ring-spacing-px");
    els.npsCenterXInput = document.getElementById("noiselab-nps-center-x");
    els.npsCenterYInput = document.getElementById("noiselab-nps-center-y");
    els.npsIncludeCenterInput = document.getElementById("noiselab-nps-include-center");
    els.npsGenerateCenterButton = document.getElementById("noiselab-nps-generate-center");
    els.npsUpdateActiveButton = document.getElementById("noiselab-nps-update-active");
    els.npsClearButton = document.getElementById("noiselab-nps-clear");
    els.npsSummary = document.getElementById("noiselab-nps-summary");
    els.npsCurveCanvas = document.getElementById("noiselab-nps-curve-canvas");
    els.npsNormalizedCanvas = document.getElementById("noiselab-nps-normalized-canvas");
    els.npsCumulativeCanvas = document.getElementById("noiselab-nps-cumulative-canvas");
    els.npsBandpowerCanvas = document.getElementById("noiselab-nps-bandpower-canvas");
    els.npsHeatmapCanvas = document.getElementById("noiselab-nps-heatmap-canvas");
    els.npsAnalysisSummary = document.getElementById("noiselab-nps-analysis-summary");
    els.comparisonCanvas = document.getElementById("noiselab-comparison-canvas");
    els.comparisonSummary = document.getElementById("noiselab-comparison-summary");

    document.querySelectorAll("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveTool(button.dataset.tool || "select");
      });
    });

    document.querySelectorAll("[data-page]").forEach((button) => {
      button.addEventListener("click", () => {
        setActivePage(button.dataset.page || "viewer");
      });
    });

    document.querySelector(".sidebar")?.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-sidebar-section-toggle]");
      if (!toggle) {
        return;
      }
      const sectionId = toggle.dataset.sidebarSectionToggle;
      if (sectionId) {
        setSidebarSectionCollapsed(sectionId, !state.sidebarSections[sectionId]);
      }
    });

    els.seriesList.addEventListener("pointerup", (event) => {
      const card = event.target.closest("[data-series-index]");
      if (!card) {
        return;
      }
      if (event.button != null && event.button !== 0) {
        return;
      }
      activateSeriesCard(card, event);
    });

    els.seriesList.addEventListener("click", (event) => {
      const card = event.target.closest("[data-series-index]");
      if (!card) {
        return;
      }
      activateSeriesCard(card, event);
    });

    document.querySelectorAll('input[name="square-mode"]').forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) {
          state.roiMode.squareMode = input.value;
        }
      });
    });

    document.getElementById("noiselab-placement-mode").addEventListener("change", (event) => {
      state.roiMode.placementMode = event.target.value || "drag";
    });

    document.getElementById("noiselab-fixed-pixel-size").addEventListener("change", (event) => {
      state.roiMode.fixedPixelEdge = Math.max(1, Math.round(Number(event.target.value) || DEFAULT_FIXED_PIXEL_EDGES[1]));
      document.getElementById("noiselab-custom-pixel-size").value = String(state.roiMode.fixedPixelEdge);
    });

    document.getElementById("noiselab-custom-pixel-size").addEventListener("change", (event) => {
      state.roiMode.fixedPixelEdge = Math.max(1, Math.round(Number(event.target.value) || DEFAULT_FIXED_PIXEL_EDGES[1]));
      document.getElementById("noiselab-fixed-pixel-size").value = String(state.roiMode.fixedPixelEdge);
    });

    document.getElementById("noiselab-fixed-mm-size").addEventListener("change", (event) => {
      state.roiMode.fixedMmEdge = Math.max(0.1, Number(event.target.value) || DEFAULT_FIXED_PHYSICAL_EDGE_MM);
    });

    document.getElementById("noiselab-center-scale").addEventListener("change", (event) => {
      state.roiMode.centerScale = event.target.checked;
    });

    els.profileTypeSelect.addEventListener("change", (event) => {
      state.analysisView.profileType = event.target.value || "horizontal-center";
      renderAnalysisVisuals();
    });

    function applyNpsConfig() {
      applyNpsInputsToState();
      renderNpsVisuals();
    }

    [els.npsEdgeInput, els.npsRingCountInput, els.npsRoisPerRingInput, els.npsRingSpacingInput, els.npsIncludeCenterInput].forEach((input) => {
      input.addEventListener("change", applyNpsConfig);
    });

    els.npsGenerateCenterButton.addEventListener("click", () => {
      const volume = getActiveVolume();
      if (!volume) {
        setStatus("Load a DICOM series before generating NPS ROIs.", "warning");
        return;
      }
      if (!core.supportsPhysicalSquare(volume)) {
        setStatus("NPS analysis requires Pixel Spacing metadata on the active series.", "warning");
        return;
      }
      applyNpsConfig();
      const centerXImg = volume.columns / 2 - 0.5;
      const centerYImg = volume.rows / 2 - 0.5;
      const edgePx = normalizeNpsEdgePx(state.nps.edgePx);
      const ringCount = Math.max(1, Math.round(Number(state.nps.ringCount) || DEFAULT_NPS_RING_COUNT));
      const ringSpacingPx = getDefaultContainedNpsRingSpacing(
        centerXImg,
        centerYImg,
        edgePx,
        ringCount,
        state.nps.roisPerRing,
        volume
      );
      state.nps.ringSpacingPx = ringSpacingPx;
      els.npsRingSpacingInput.value = String(roundForDisplay(ringSpacingPx, 3));
      createNpsSetAt(centerXImg, centerYImg, { ringCount, ringSpacingPx });
    });

    els.npsUpdateActiveButton.addEventListener("click", regenerateActiveNpsSet);
    els.npsClearButton.addEventListener("click", clearActiveNpsSet);

    document.getElementById("noiselab-dicom-input").addEventListener("change", async (event) => {
      try {
        await loadFiles(event.target.files);
      } catch (error) {
        setStatus(error.message || "Could not load DICOM files.", "error");
      }
    });

    document.getElementById("noiselab-folder-input").addEventListener("change", async (event) => {
      try {
        await loadFiles(event.target.files);
      } catch (error) {
        setStatus(error.message || "Could not load DICOM folder.", "error");
      }
    });

    document.getElementById("noiselab-clear-button").addEventListener("click", clearStudy);
    document.getElementById("noiselab-fit-button").addEventListener("click", fitViewport);
    document.getElementById("noiselab-reset-wl-button").addEventListener("click", () => {
      const defaults = getCurrentWindowDefaults();
      state.viewport.windowWidth = defaults.windowWidth;
      state.viewport.windowCenter = defaults.windowCenter;
      updateUi();
      render();
    });
    document.getElementById("noiselab-prev-slice").addEventListener("click", () => {
      const volume = getActiveVolume();
      if (!volume) {
        return;
      }
      setActiveSliceIndex(state.activeSliceIndex - 1);
      updateUi();
      render();
    });
    document.getElementById("noiselab-next-slice").addEventListener("click", () => {
      const volume = getActiveVolume();
      if (!volume) {
        return;
      }
      setActiveSliceIndex(state.activeSliceIndex + 1);
      updateUi();
      render();
    });

    els.sliceSlider.addEventListener("input", (event) => {
      setActiveSliceIndex(Number(event.target.value) || 0);
      updateUi();
      render();
    });
    els.windowWidthInput.addEventListener("change", (event) => {
      state.viewport.windowWidth = Math.max(1, Number(event.target.value) || state.viewport.windowWidth);
      render();
    });
    els.windowCenterInput.addEventListener("change", (event) => {
      state.viewport.windowCenter = Number(event.target.value) || state.viewport.windowCenter;
      render();
    });

    document.getElementById("noiselab-delete-roi").addEventListener("click", deleteSelectedRoi);
    document.getElementById("noiselab-duplicate-roi").addEventListener("click", duplicateSelectedRoi);
    document.getElementById("noiselab-copy-rois-all-series").addEventListener("click", copyCurrentSliceRoisToAllSeries);
    document.getElementById("noiselab-export-button").addEventListener("click", () => {
      exportBundle().catch((error) => {
        setStatus(error.message || "NoiseLab export failed.", "error");
      });
    });

    els.exportStudyCreateInput = document.getElementById("noiselab-export-study-create");
    document.getElementById("noiselab-export-study-create-button").addEventListener("click", () => {
      createExportStudy().catch((error) => {
        setStatus(error.message || "Could not create export study.", "error");
      });
    });
    els.exportStudySelect.addEventListener("change", () => {
      selectExportStudy().catch((error) => {
        setStatus(error.message || "Could not change export study.", "error");
      });
    });

    els.roiContextMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-roi-menu-action]");
      if (!button) {
        return;
      }
      const action = button.dataset.roiMenuAction;
      closeRoiContextMenu();
      if (action === "edit") {
        focusSelectedRoiEditor();
      } else if (action === "duplicate") {
        duplicateSelectedRoi();
      } else if (action === "copy-selected") {
        copySelectedRoiToAllSeries();
      } else if (action === "copy-slice") {
        copyCurrentSliceRoisToAllSeries();
      } else if (action === "delete") {
        deleteSelectedRoi();
      }
    });

    window.addEventListener("mousedown", (event) => {
      if (event.target === els.canvas || els.roiContextMenu.contains(event.target)) {
        return;
      }
      closeRoiContextMenu();
    });

    els.canvas.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    els.canvas.addEventListener("mouseleave", () => {
      if (!state.dragging) {
        els.canvas.style.cursor = "";
      }
    });
    els.canvas.addEventListener("contextmenu", handleCanvasContextMenu);
    els.canvas.addEventListener("dblclick", handleCanvasDoubleClick);
    els.canvas.addEventListener("auxclick", (event) => event.preventDefault());
    els.canvas.addEventListener("wheel", (event) => {
      if (!getActiveVolume()) {
        return;
      }
      event.preventDefault();
      const zoomWheel = event.metaKey || event.ctrlKey || state.activeTool === "zoom";
      if (!zoomWheel && Date.now() < state.suppressSliceWheelUntil) {
        render();
        return;
      }
      if (zoomWheel) {
        const nextZoom = state.viewport.zoom * Math.exp(-event.deltaY * 0.0015);
        zoomViewportAtClientPoint(event.clientX, event.clientY, nextZoom);
      } else {
        const volume = getActiveVolume();
        const delta = event.deltaY > 0 ? 1 : -1;
        setActiveSliceIndex(state.activeSliceIndex + delta);
      }
      updateUi();
      render();
    }, { passive: false });

    const dropzone = document.getElementById("noiselab-dropzone");
    ["dragenter", "dragover"].forEach((type) => {
      dropzone.addEventListener(type, (event) => {
        event.preventDefault();
      });
    });
    dropzone.addEventListener("drop", async (event) => {
      event.preventDefault();
      try {
        const files = await collectDroppedFiles(event.dataTransfer);
        await loadFiles(files);
      } catch (error) {
        setStatus(error.message || "Could not load dropped files.", "error");
      }
    });

    window.addEventListener("resize", () => {
      render();
      if (state.activePage === "figures") {
        renderAnalysisVisuals();
        renderNpsVisuals();
      }
    });
    if (typeof ResizeObserver === "function") {
      const canvasResizeObserver = new ResizeObserver(() => {
        scheduleRender();
      });
      canvasResizeObserver.observe(els.canvas);
      canvasResizeObserver.observe(document.getElementById("noiselab-dropzone"));
    }
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeRoiContextMenu();
        setActiveTool("select");
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelectedRoi();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "ArrowUp") {
        event.preventDefault();
        stepActiveDataset(-1);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "ArrowDown") {
        event.preventDefault();
        stepActiveDataset(1);
        return;
      }
      if (event.key === "w" || event.key === "W") {
        setActiveTool("windowLevel");
      } else if (event.key === "z" || event.key === "Z") {
        setActiveTool("zoom");
      } else if (event.key === "m" || event.key === "M") {
        setActiveTool("pan");
      } else if (event.key === "r" || event.key === "R") {
        setActiveTool("squareRoi");
      } else if (event.key === "n" || event.key === "N") {
        setActiveTool("npsConcentric");
      } else if (event.key === "ArrowUp") {
        const volume = getActiveVolume();
        if (volume) {
          setActiveSliceIndex(state.activeSliceIndex - 1);
        }
      } else if (event.key === "ArrowDown") {
        const volume = getActiveVolume();
        if (volume) {
          setActiveSliceIndex(state.activeSliceIndex + 1);
        }
      }
      updateUi();
      render();
      updateCanvasCursor();
    });
  }

  function init() {
    bindUi();
    initializeSidebarSections();
    loadExportStudies().catch(() => {});
    updateUi();
    render();
    setStatus(`${APP_NAME} ${APP_VERSION} ready`);
  }

  window.addEventListener("DOMContentLoaded", init, { once: true });
})();
