(function () {
  "use strict";

  const sharedCore = window.HAGRadCore;
  const dicomApi = window.HAGRadDicom;
  const zipApi = window.HAGRadZip;
  const core = window.HAGRadNoisePowerCore;
  const exportApi = window.HAGRadNoisePowerExport;

  if (!sharedCore || !dicomApi || !zipApi || !core || !exportApi) {
    throw new Error("HAGRad Noise Power dependencies are missing.");
  }

  const {
    CIRCLE_TYPE,
    NPS_ROI_TYPE,
    ROI_TYPE,
    APP_NAME,
    APP_VERSION,
    DEFAULT_NPS_EDGE_PX,
    DEFAULT_NPS_PERIPHERAL_COUNT,
    buildMandatoryExportFiles,
    buildNpsAnalysisForCircle,
    buildNpsModels,
    cloneCircle,
    cloneRoi,
    createNoisePowerCircle,
    createNoiseSquareRoi,
    datasetLabel,
    datasetRhoMaxLpCm,
    extractSquareRoiPixels,
    generateNpsRoisForCircle,
    kernelRho10Reference,
    kernelSamplingComparison,
    mapCircleToTarget,
    mapSquareRoiToTarget,
    nextPowerOfTwo,
    resolveSquareGeometry,
    roundForDisplay,
    sanitizeFilePart,
  } = core;
  const { clamp, collectDroppedFiles, formatSpacing, formatDimension, isSamePatientStudy, safeString } = sharedCore;
  const PLOT_PALETTE = [
    "#ffe0cf", "#ffd7e1", "#d8f1d2", "#d9ecff", "#eadfff",
    "#fdba90", "#ffb2c1", "#bdeab8", "#b7dcff", "#d3b8ff",
    "#ff9a9a", "#f4a8c0", "#8fe6ab", "#93cfff", "#b690ff",
    "#c7a18f", "#bf7f99", "#7fc7a1", "#b8c4d0", "#a891c7",
  ];

  const state = {
    datasets: [],
    activeDatasetId: "",
    activeSliceIndex: 0,
    activeTool: "select",
    activeWorkspacePage: "viewer",
    showNpsLabels: false,
    showDicomInfo: false,
    showGridOverlay: false,
    seriesPrefs: {},
    squareProfilePrefs: {},
    reconstructionPrefs: {},
    seriesReferenceKey: "",
    squareProfileReferenceKey: "",
    viewport: {
      zoom: 1,
      panX: 0,
      panY: 0,
      windowWidth: 400,
      windowCenter: 40,
    },
    rois: [],
    circles: [],
    selectedObjectId: "",
    roiSequence: 1,
    circleSequence: 1,
    npsSequence: 1,
    dragging: null,
    seriesOrderDrag: null,
    circleDraft: null,
    pendingNpsSetRootId: "",
    suppressContextMenuUntil: 0,
    suppressSliceWheelUntil: 0,
    analysisRefreshFrame: 0,
    analysisCache: new Map(),
    npsCache: new Map(),
    history: {
      undoStack: [],
      redoStack: [],
      limit: 50,
    },
  };

  let allowGuardedUnload = false;

  function hasOpenStudyOrAnalysis() {
    return state.datasets.length > 0 || state.rois.length > 0 || state.circles.length > 0;
  }

  window.HAGRadWorkflowGuardState = {
    hasOpenStudy() {
      return hasOpenStudyOrAnalysis();
    },
    allowWorkflowSwitch() {
      allowGuardedUnload = true;
    },
  };

  window.addEventListener("beforeunload", (event) => {
    if (allowGuardedUnload || !hasOpenStudyOrAnalysis()) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });

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

  function setStatus(message, level, fullMessage) {
    if (!els.statusPill) {
      return;
    }
    els.statusPill.textContent = message;
    els.statusPill.dataset.level = level || "";
    const detail = fullMessage || message || "";
    els.statusPill.title = detail === message ? "" : detail;
    if (detail) {
      els.statusPill.setAttribute("aria-label", detail);
    } else {
      els.statusPill.removeAttribute("aria-label");
    }
  }

  function setWorkspacePage(page) {
    const nextPage = page === "analysis" ? "analysis" : "viewer";
    state.activeWorkspacePage = nextPage;
    if (els.viewerPage) {
      els.viewerPage.hidden = nextPage !== "viewer";
    }
    if (els.analysisPage) {
      els.analysisPage.hidden = nextPage !== "analysis";
    }
    if (els.viewerPageButton) {
      els.viewerPageButton.classList.toggle("is-active", nextPage === "viewer");
      els.viewerPageButton.setAttribute("aria-selected", nextPage === "viewer" ? "true" : "false");
    }
    if (els.analysisPageButton) {
      els.analysisPageButton.classList.toggle("is-active", nextPage === "analysis");
      els.analysisPageButton.setAttribute("aria-selected", nextPage === "analysis" ? "true" : "false");
    }
    if (nextPage === "analysis") {
      updateAnalysisCanvases();
      focusAnalysisForSelection({ scroll: true });
    } else {
      render();
    }
  }

  function focusAnalysisForSelection(options = {}) {
    if (!els.analysisGrid) {
      return;
    }
    const selectedRoi = getSelectedRoi();
    const selectedCircle = getSelectedCircle() || getCircleForRoi(selectedRoi);
    const hasNpsFocus = Boolean(selectedCircle);
    const hasTtfFocus = Boolean(selectedRoi?.type === ROI_TYPE && !selectedCircle);
    els.analysisGrid.classList.toggle("is-nps-focus", hasNpsFocus);
    els.analysisGrid.classList.toggle("is-ttf-focus", hasTtfFocus);
    if (hasNpsFocus && els.npsAnalysisCard) {
      els.npsAnalysisCard.classList.remove("is-collapsed");
      const toggle = els.npsAnalysisCard.querySelector(".collapse-toggle");
      if (toggle) {
        toggle.textContent = "v";
        toggle.setAttribute("aria-expanded", "true");
      }
      if (options.scroll) {
        window.requestAnimationFrame(() => {
          els.npsAnalysisCard.scrollIntoView({ block: "start", behavior: "smooth" });
        });
      }
    }
  }

  function installCollapsibleBlocks() {
    document.querySelectorAll(".sidebar-section, .analysis-card").forEach((section, index) => {
      const header = Array.from(section.children).find((child) =>
        child.classList.contains("section-header") || child.classList.contains("analysis-card-header")
      );
      if (!header || header.querySelector(".collapse-toggle")) {
        return;
      }
      const title = header.querySelector("h2, h3")?.textContent?.trim() || `Panel ${index + 1}`;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "collapse-toggle";
      toggle.setAttribute("aria-label", `Collapse ${title}`);
      toggle.setAttribute("aria-expanded", "true");
      toggle.textContent = "v";
      toggle.addEventListener("click", () => {
        const collapsed = section.classList.toggle("is-collapsed");
        toggle.textContent = collapsed ? ">" : "v";
        toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        toggle.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${title}`);
        if (!collapsed && section.classList.contains("analysis-card")) {
          updateAnalysisCanvases();
        }
        if (!collapsed && section.classList.contains("sidebar-section")) {
          render();
        }
      });
      header.appendChild(toggle);
    });
  }

  function installSidebarJumpTabs() {
    const tabs = Array.from(document.querySelectorAll("[data-np-sidebar-jump]"));
    if (!tabs.length) {
      return;
    }
    const setActiveTab = (activeTab) => {
      tabs.forEach((tab) => {
        tab.classList.toggle("is-active", tab === activeTab);
      });
    };
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = document.getElementById(tab.dataset.npSidebarJump || "");
        setActiveTab(tab);
        target?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    });
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
      windowWidth: Number(record?.windowWidth) || 400,
      windowCenter: Number(record?.windowCenter) || (slice ? slice.intercept + 40 : 40),
    };
  }

  function getVisibleRois() {
    return state.rois.filter(
      (roi) => roi.datasetId === state.activeDatasetId && roi.sliceIndex === state.activeSliceIndex && roi.visible !== false
    );
  }

  function getVisibleCircles() {
    return state.circles.filter(
      (circle) =>
        circle.datasetId === state.activeDatasetId &&
        circle.sliceIndex === state.activeSliceIndex &&
        circle.visible !== false
    );
  }

  function getSelectedRoi() {
    return state.rois.find((roi) => roi.id === state.selectedObjectId) || null;
  }

  function getSelectedCircle() {
    return state.circles.find((circle) => circle.id === state.selectedObjectId) || null;
  }

  function getSelectedObject() {
    return getSelectedRoi() || getSelectedCircle();
  }

  function getCircleForRoi(roi) {
    return state.circles.find((circle) => circle.id === roi?.parentCircleId) || null;
  }

  function getRoiGroupRootId(roi) {
    if (!roi) {
      return "";
    }
    const roiById = new Map(state.rois.map((entry) => [entry.id, entry]));
    let root = roi;
    const visited = new Set();
    while (root?.copiedFromRoiId && !visited.has(root.id)) {
      visited.add(root.id);
      const parent = roiById.get(root.copiedFromRoiId);
      if (!parent) {
        break;
      }
      root = parent;
    }
    return root?.id || roi.id || "";
  }

  function getCircleGroupRootId(circle) {
    if (!circle) {
      return "";
    }
    const circleById = new Map(state.circles.map((entry) => [entry.id, entry]));
    let root = circle;
    const visited = new Set();
    while (root?.copiedFromCircleId && !visited.has(root.id)) {
      visited.add(root.id);
      const parent = circleById.get(root.copiedFromCircleId);
      if (!parent) {
        break;
      }
      root = parent;
    }
    return root?.id || circle.id || "";
  }

  function getCircleAnalysisSetId(circle) {
    return safeString(circle?.npsSetId) || getCircleGroupRootId(circle);
  }

  function getCircleAnalysisSetCircles(circle, options = {}) {
    if (!circle) {
      return [];
    }
    const setId = getCircleAnalysisSetId(circle);
    return state.circles.filter(
      (entry) =>
        getCircleAnalysisSetId(entry) === setId &&
        (!options.datasetId || entry.datasetId === options.datasetId) &&
        (!options.generatedOnly || entry.generated)
    );
  }

  function circleHasNpsRois(circle) {
    return Boolean(circle && state.rois.some((roi) => roi.type === NPS_ROI_TYPE && roi.parentCircleId === circle.id));
  }

  function circleIsAnalyzable(circle) {
    return Boolean(circle?.generated || circleHasNpsRois(circle));
  }

  function getRelatedNpsCircles(circle) {
    const generatedCircles = state.circles.filter((entry) => circleIsAnalyzable(entry));
    if (!circle) {
      return generatedCircles;
    }
    const setId = getCircleAnalysisSetId(circle);
    return generatedCircles.filter((entry) => getCircleAnalysisSetId(entry) === setId);
  }

  function findRelatedObjectForDataset(object, datasetId) {
    if (!object || !datasetId) {
      return null;
    }
    if (object.type === CIRCLE_TYPE) {
      const setId = getCircleAnalysisSetId(object);
      return state.circles.find((circle) => circle.datasetId === datasetId && getCircleAnalysisSetId(circle) === setId) || null;
    }
    if (object.type === NPS_ROI_TYPE) {
      return findRelatedObjectForDataset(getCircleForRoi(object), datasetId);
    }
    const rootId = getRoiGroupRootId(object);
    return (
      state.rois.find(
        (roi) => roi.type === ROI_TYPE && roi.datasetId === datasetId && getRoiGroupRootId(roi) === rootId
      ) || null
    );
  }

  function getCurrentSliceObjects() {
    return {
      rois: state.rois.filter((roi) => roi.datasetId === state.activeDatasetId && roi.sliceIndex === state.activeSliceIndex),
      circles: state.circles.filter((circle) => circle.datasetId === state.activeDatasetId && circle.sliceIndex === state.activeSliceIndex),
    };
  }

  function getAnalysisForRoi(roi) {
    const dataset = state.datasets.find((entry) => entry.id === roi?.datasetId);
    if (!dataset?.volume || !roi) {
      return null;
    }
    const key = [
      roi.id,
      roi.datasetId,
      roi.sliceIndex,
      roi.centerXImg,
      roi.centerYImg,
      roi.edgePx,
      dataset.volume?.columns,
      dataset.volume?.rows,
    ].join("|");
    if (!state.analysisCache.has(key)) {
      state.analysisCache.set(key, extractSquareRoiPixels(dataset.volume, roi.sliceIndex, roi));
    }
    return state.analysisCache.get(key);
  }

  function getNpsAnalysisForCircle(circle) {
    const dataset = state.datasets.find((entry) => entry.id === circle?.datasetId);
    if (!dataset?.volume || !circle) {
      return null;
    }
    const setCircles = getCircleAnalysisSetCircles(circle, { datasetId: circle.datasetId });
    const relatedCircles = setCircles.filter((entry) => circleIsAnalyzable(entry));
    const circleIds = new Set((relatedCircles.length ? relatedCircles : [circle]).map((entry) => entry.id));
    const rois = state.rois.filter((roi) => circleIds.has(roi.parentCircleId) && roi.datasetId === circle.datasetId);
    const key = [
      getCircleAnalysisSetId(circle),
      circle.datasetId,
      (relatedCircles.length ? relatedCircles : [circle])
        .map((entry) =>
          [
            entry.id,
            entry.sliceIndex,
            entry.centerXImg,
            entry.centerYImg,
            entry.radiusPx,
            entry.roiEdgePx,
            entry.peripheralRoiCount,
            entry.includeCenter,
            entry.detrendPlane,
            entry.generated,
          ].join(":")
        )
        .join(";"),
      rois.map((roi) => `${roi.id}:${roi.centerXImg}:${roi.centerYImg}:${roi.edgePx}`).join(";"),
    ].join("|");
    if (!state.npsCache.has(key)) {
      const representative =
        relatedCircles.find((entry) => entry.id === getCircleAnalysisSetId(circle) || getCircleGroupRootId(entry) === entry.id) ||
        relatedCircles[0] ||
        circle;
      state.npsCache.set(key, buildNpsAnalysisForCircle(dataset.volume, representative, state.rois, relatedCircles.length ? relatedCircles : [circle]));
    }
    return state.npsCache.get(key);
  }

  function buildCachedNpsModels(datasets = state.datasets, circles = state.circles) {
    const datasetById = new Map((datasets || []).map((dataset, index) => [dataset.id, { dataset, index }]));
    const circlesWithGeneratedRois = new Set(state.rois.filter((roi) => roi.type === NPS_ROI_TYPE).map((roi) => roi.parentCircleId));
    const groups = new Map();
    (circles || [])
      .filter((circle) => circle?.generated || circlesWithGeneratedRois.has(circle?.id))
      .forEach((circle, circleIndex) => {
        const entry = datasetById.get(circle.datasetId);
        if (!entry?.dataset?.volume) {
          return;
        }
        const setId = getCircleAnalysisSetId(circle);
        const key = `${circle.datasetId || ""}::${setId}`;
        if (!groups.has(key)) {
          groups.set(key, {
            setId,
            dataset: entry.dataset,
            datasetIndex: entry.index,
            circles: [],
            firstCircleIndex: circleIndex,
          });
        }
        groups.get(key).circles.push(circle);
      });
    return Array.from(groups.values()).flatMap((group) => {
      const representative =
        group.circles.find((circle) => circle.id === group.setId || getCircleGroupRootId(circle) === circle.id) ||
        group.circles[0];
      const analysis = getNpsAnalysisForCircle(representative);
      if (analysis?.error || !analysis?.validRoiCount) {
        return [];
      }
      return [{ circle: representative, circles: group.circles, analysis, dataset: group.dataset, datasetIndex: group.datasetIndex }];
    });
  }

  function invalidateAnalysis() {
    state.analysisCache.clear();
    state.npsCache.clear();
  }

  function scheduleAnalysisRefresh() {
    if (state.analysisRefreshFrame) {
      window.cancelAnimationFrame(state.analysisRefreshFrame);
    }
    state.analysisRefreshFrame = window.requestAnimationFrame(() => {
      state.analysisRefreshFrame = 0;
      updateAnalysisCanvases();
    });
  }

  function snapshotState() {
    return {
      rois: state.rois.map(cloneRoi),
      circles: state.circles.map(cloneCircle),
      selectedObjectId: state.selectedObjectId,
      roiSequence: state.roiSequence,
      circleSequence: state.circleSequence,
      npsSequence: state.npsSequence,
    };
  }

  function restoreSnapshot(snapshot) {
    state.rois = (snapshot?.rois || []).map(cloneRoi);
    state.circles = (snapshot?.circles || []).map(cloneCircle);
    state.selectedObjectId = snapshot?.selectedObjectId || "";
    state.roiSequence = snapshot?.roiSequence || 1;
    state.circleSequence = snapshot?.circleSequence || 1;
    state.npsSequence = snapshot?.npsSequence || 1;
    invalidateAnalysis();
    updateUi();
    render();
  }

  function pushHistory() {
    state.history.undoStack.push(snapshotState());
    if (state.history.undoStack.length > state.history.limit) {
      state.history.undoStack.shift();
    }
    state.history.redoStack = [];
  }

  function undo() {
    if (!state.history.undoStack.length) {
      return;
    }
    const snapshot = state.history.undoStack.pop();
    state.history.redoStack.push(snapshotState());
    restoreSnapshot(snapshot);
    setStatus("Undo applied.");
  }

  function redo() {
    if (!state.history.redoStack.length) {
      return;
    }
    const snapshot = state.history.redoStack.pop();
    state.history.undoStack.push(snapshotState());
    restoreSnapshot(snapshot);
    setStatus("Redo applied.");
  }

  function setActiveTool(tool) {
    state.activeTool = tool || "select";
    if (state.activeTool !== "noiseCircle") {
      state.circleDraft = null;
      state.pendingNpsSetRootId = "";
    }
    document.querySelectorAll("[data-tool]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tool === state.activeTool);
    });
    updateCanvasCursor();
    render();
  }

  function cancelTransientViewportInteraction() {
    state.dragging = null;
    state.circleDraft = null;
    state.pendingNpsSetRootId = "";
  }

  function setActiveDataset(datasetId) {
    const dataset = state.datasets.find((entry) => entry.id === datasetId);
    if (!dataset) {
      return;
    }
    cancelTransientViewportInteraction();
    closeContextMenu();
    closeSeriesColorPickers();
    const previousSelection = getSelectedObject();
    state.activeDatasetId = dataset.id;
    const relatedSelection = findRelatedObjectForDataset(previousSelection, dataset.id);
    state.activeSliceIndex = relatedSelection
      ? clamp(relatedSelection.sliceIndex, 0, Math.max(0, dataset.volume.depth - 1))
      : clamp(state.activeSliceIndex, 0, Math.max(0, dataset.volume.depth - 1));
    const defaults = getCurrentWindowDefaults();
    state.viewport.windowWidth = defaults.windowWidth;
    state.viewport.windowCenter = defaults.windowCenter;
    state.selectedObjectId = relatedSelection?.id || "";
    fitViewport(false);
    updateUi();
    render();
  }

  function setActiveSliceIndex(sliceIndex) {
    const volume = getActiveVolume();
    if (!volume) {
      return;
    }
    state.activeSliceIndex = clamp(Math.round(Number(sliceIndex) || 0), 0, volume.depth - 1);
    const selected = getSelectedObject();
    if (selected && (selected.datasetId !== state.activeDatasetId || selected.sliceIndex !== state.activeSliceIndex)) {
      state.selectedObjectId = "";
    }
  }

  function fitViewport(shouldRender = true) {
    state.viewport.zoom = 1;
    state.viewport.panX = 0;
    state.viewport.panY = 0;
    if (shouldRender) {
      render();
    }
  }

  function getViewportTransform(canvasSize = syncCanvasSize(els.canvas)) {
    const volume = getActiveVolume();
    if (!volume) {
      return { scale: 1, offsetX: 0, offsetY: 0, width: canvasSize.width, height: canvasSize.height };
    }
    const fitScale = Math.min(canvasSize.width / volume.columns, canvasSize.height / volume.rows);
    const scale = fitScale * state.viewport.zoom;
    return {
      scale,
      offsetX: (canvasSize.width - volume.columns * scale) / 2 + state.viewport.panX,
      offsetY: (canvasSize.height - volume.rows * scale) / 2 + state.viewport.panY,
      width: canvasSize.width,
      height: canvasSize.height,
    };
  }

  function imageCoordToCanvas(value, transform) {
    return transform.offsetX + (value + 0.5) * transform.scale;
  }

  function imageYToCanvas(value, transform) {
    return transform.offsetY + (value + 0.5) * transform.scale;
  }

  function canvasToImageCoord(clientX, clientY) {
    const rect = els.canvas.getBoundingClientRect();
    const canvasSize = syncCanvasSize(els.canvas);
    const ratioX = canvasSize.width / Math.max(1, rect.width);
    const ratioY = canvasSize.height / Math.max(1, rect.height);
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

  function isPointInsideImage(xImg, yImg) {
    const volume = getActiveVolume();
    return Boolean(volume && xImg >= -0.5 && yImg >= -0.5 && xImg <= volume.columns - 0.5 && yImg <= volume.rows - 0.5);
  }

  function renderBaseImage(ctx, transform) {
    const volume = getActiveVolume();
    const slice = getCurrentSlice();
    ctx.save();
    ctx.clearRect(0, 0, transform.width, transform.height);
    ctx.fillStyle = "#05080c";
    ctx.fillRect(0, 0, transform.width, transform.height);
    if (!volume || !slice) {
      ctx.restore();
      return;
    }
    const offscreen = renderBaseImage.offscreen || (renderBaseImage.offscreen = document.createElement("canvas"));
    offscreen.width = volume.columns;
    offscreen.height = volume.rows;
    const offscreenCtx = offscreen.getContext("2d");
    const imageData = offscreenCtx.createImageData(volume.columns, volume.rows);
    const ww = Math.max(1, Number(state.viewport.windowWidth) || 400);
    const wc = Number(state.viewport.windowCenter) || 40;
    const low = wc - ww / 2;
    const high = wc + ww / 2;
    for (let index = 0; index < slice.pixels.length; index += 1) {
      const calibrated = slice.pixels[index] * slice.slope + slice.intercept;
      const byte = calibrated <= low ? 0 : calibrated >= high ? 255 : Math.round(((calibrated - low) / (high - low)) * 255);
      const base = index * 4;
      imageData.data[base] = byte;
      imageData.data[base + 1] = byte;
      imageData.data[base + 2] = byte;
      imageData.data[base + 3] = 255;
    }
    offscreenCtx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, transform.offsetX, transform.offsetY, volume.columns * transform.scale, volume.rows * transform.scale);
    ctx.strokeStyle = "rgba(141, 169, 185, 0.34)";
    ctx.lineWidth = Math.max(1, window.devicePixelRatio || 1);
    ctx.strokeRect(transform.offsetX, transform.offsetY, volume.columns * transform.scale, volume.rows * transform.scale);
    ctx.restore();
  }

  function chooseGridSpacingMm(spacingMm, scale) {
    const candidates = [1, 2, 5, 10, 20, 50, 100];
    const neededMm = (34 * spacingMm) / Math.max(0.001, scale);
    return candidates.find((candidate) => candidate >= neededMm) || candidates[candidates.length - 1];
  }

  function chooseGridSpacingPx(scale) {
    const candidates = [16, 32, 64, 128, 256];
    const neededPx = 34 / Math.max(0.001, scale);
    return candidates.find((candidate) => candidate >= neededPx) || candidates[candidates.length - 1];
  }

  function drawGridOverlay(ctx, transform) {
    if (!state.showGridOverlay) {
      return;
    }
    const volume = getActiveVolume();
    if (!volume) {
      return;
    }
    const spacingX = Number(volume.columnSpacing);
    const spacingY = Number(volume.rowSpacing);
    const hasSpacing = Number.isFinite(spacingX) && Number.isFinite(spacingY) && spacingX > 0 && spacingY > 0;
    const left = transform.offsetX;
    const top = transform.offsetY;
    const right = transform.offsetX + volume.columns * transform.scale;
    const bottom = transform.offsetY + volume.rows * transform.scale;
    const centerXImg = (volume.columns - 1) / 2;
    const centerYImg = (volume.rows - 1) / 2;
    const centerX = imageCoordToCanvas(centerXImg, transform);
    const centerY = imageYToCanvas(centerYImg, transform);
    const minorMm = hasSpacing ? chooseGridSpacingMm((spacingX + spacingY) / 2, transform.scale) : null;
    const majorMm = hasSpacing ? minorMm * 5 : null;
    const minorPx = hasSpacing ? null : chooseGridSpacingPx(transform.scale);
    const majorPx = hasSpacing ? null : minorPx * 4;
    const maxOffsetX = hasSpacing
      ? Math.max(centerXImg * spacingX, (volume.columns - 1 - centerXImg) * spacingX)
      : Math.max(centerXImg, volume.columns - 1 - centerXImg);
    const maxOffsetY = hasSpacing
      ? Math.max(centerYImg * spacingY, (volume.rows - 1 - centerYImg) * spacingY)
      : Math.max(centerYImg, volume.rows - 1 - centerYImg);
    const minorStep = hasSpacing ? minorMm : minorPx;
    const majorStep = hasSpacing ? majorMm : majorPx;
    const units = hasSpacing ? "mm" : "px";
    const lineWidth = Math.max(1, window.devicePixelRatio || 1);

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();
    ctx.font = `${Math.max(9, 9 * (window.devicePixelRatio || 1))}px Menlo, monospace`;
    ctx.textBaseline = "top";

    const drawLabel = (text, x, y) => {
      const paddingX = 3;
      const paddingY = 2;
      const metrics = ctx.measureText(text);
      ctx.fillStyle = "rgba(3, 8, 12, 0.68)";
      ctx.fillRect(x - paddingX, y - paddingY, metrics.width + paddingX * 2, 11 + paddingY * 2);
      ctx.fillStyle = "rgba(245, 224, 176, 0.82)";
      ctx.fillText(text, x, y);
    };

    const drawLine = (x1, y1, x2, y2, isMajor) => {
      ctx.beginPath();
      ctx.strokeStyle = isMajor ? "rgba(240, 197, 114, 0.28)" : "rgba(190, 215, 226, 0.14)";
      ctx.lineWidth = isMajor ? lineWidth * 1.15 : lineWidth;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    const drawVerticalAtOffset = (offset, sign) => {
      const xImg = centerXImg + sign * (hasSpacing ? offset / spacingX : offset);
      if (xImg < -0.5 || xImg > volume.columns - 0.5) {
        return;
      }
      const x = imageCoordToCanvas(xImg, transform);
      const isMajor = Math.abs(offset % majorStep) < 1e-6 || Math.abs((offset % majorStep) - majorStep) < 1e-6;
      drawLine(x, top, x, bottom, isMajor);
      if (isMajor && offset > 0 && transform.scale > 0.28) {
        drawLabel(`${sign > 0 ? "+" : "-"}${roundForDisplay(offset, hasSpacing ? 0 : 0)} ${units}`, clamp(x + 3, left + 3, right - 70), top + 5);
      }
    };

    const drawHorizontalAtOffset = (offset, sign) => {
      const yImg = centerYImg + sign * (hasSpacing ? offset / spacingY : offset);
      if (yImg < -0.5 || yImg > volume.rows - 0.5) {
        return;
      }
      const y = imageYToCanvas(yImg, transform);
      const isMajor = Math.abs(offset % majorStep) < 1e-6 || Math.abs((offset % majorStep) - majorStep) < 1e-6;
      drawLine(left, y, right, y, isMajor);
      if (isMajor && offset > 0 && transform.scale > 0.28) {
        drawLabel(`${sign > 0 ? "+" : "-"}${roundForDisplay(offset, hasSpacing ? 0 : 0)} ${units}`, left + 5, clamp(y + 3, top + 18, bottom - 15));
      }
    };

    for (let offset = minorStep; offset <= maxOffsetX + minorStep / 2; offset += minorStep) {
      drawVerticalAtOffset(offset, -1);
      drawVerticalAtOffset(offset, 1);
    }
    for (let offset = minorStep; offset <= maxOffsetY + minorStep / 2; offset += minorStep) {
      drawHorizontalAtOffset(offset, -1);
      drawHorizontalAtOffset(offset, 1);
    }

    ctx.setLineDash?.([6, 5]);
    ctx.strokeStyle = "rgba(255, 230, 162, 0.78)";
    ctx.lineWidth = lineWidth * 1.35;
    ctx.beginPath();
    ctx.moveTo(centerX, top);
    ctx.lineTo(centerX, bottom);
    ctx.moveTo(left, centerY);
    ctx.lineTo(right, centerY);
    ctx.stroke();
    ctx.setLineDash?.([]);
    drawLabel("center", clamp(centerX + 6, left + 6, right - 55), clamp(centerY + 6, top + 6, bottom - 16));
    ctx.restore();
  }

  function drawRoi(ctx, roi, transform, selected) {
    const volume = getActiveVolume();
    const geometry = resolveSquareGeometry(roi, volume);
    if (!geometry) {
      return;
    }
    const left = imageCoordToCanvas(geometry.xMinBoundaryImg, transform);
    const top = imageYToCanvas(geometry.yMinBoundaryImg, transform);
    const right = imageCoordToCanvas(geometry.xMaxBoundaryImg, transform);
    const bottom = imageYToCanvas(geometry.yMaxBoundaryImg, transform);
    const isNps = roi.type === NPS_ROI_TYPE;
    ctx.save();
    ctx.fillStyle = isNps ? "rgba(115, 214, 197, 0.10)" : "rgba(255, 211, 95, 0.10)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.92)";
    ctx.lineWidth = selected ? 5 : 4;
    ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.strokeStyle = selected ? "#fff4b8" : isNps ? "#73d6c5" : "#ffd35f";
    ctx.lineWidth = selected ? 2.4 : 1.8;
    ctx.strokeRect(left, top, right - left, bottom - top);
    const analysis = roi.type === ROI_TYPE ? getAnalysisForRoi(roi) : null;
    const sd = analysis?.statsCalibrated?.sd;
    const mean = analysis?.statsCalibrated?.mean;
    const badge =
      roi.type === ROI_TYPE && Number.isFinite(sd)
        ? `${roi.label}  M ${roundForDisplay(mean, 1)}  SD ${roundForDisplay(sd, 2)}`
        : roi.label;
    const showBadge = !isNps || selected || state.showNpsLabels;
    if (showBadge) {
      ctx.font = `${Math.max(11, 11 * (window.devicePixelRatio || 1))}px Menlo, monospace`;
      const textWidth = ctx.measureText(badge).width;
      ctx.fillStyle = "rgba(0, 0, 0, 0.76)";
      ctx.fillRect(left + 4, Math.max(0, top - 24), Math.min(textWidth + 12, transform.width - left - 8), 18);
      ctx.fillStyle = isNps ? "#d8fff9" : "#fff8d6";
      ctx.fillText(badge, left + 9, Math.max(12, top - 10));
    }
    if (selected && roi.type !== NPS_ROI_TYPE) {
      drawSquareHandles(ctx, left, top, right, bottom);
    }
    ctx.restore();
  }

  function drawSquareHandles(ctx, left, top, right, bottom) {
    const radius = Math.max(4, 4 * (window.devicePixelRatio || 1));
    [
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom],
    ].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#5a4b11";
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function drawCircle(ctx, circle, transform, selected) {
    const x = imageCoordToCanvas(circle.centerXImg, transform);
    const y = imageYToCanvas(circle.centerYImg, transform);
    ctx.save();
    ctx.strokeStyle = selected ? "#fff4b8" : "#f0c572";
    ctx.fillStyle = selected ? "rgba(240, 197, 114, 0.08)" : "rgba(240, 197, 114, 0.04)";
    ctx.lineWidth = selected ? 2.4 : 1.8;
    ctx.setLineDash?.([7, 5]);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, circle.radiusPx * transform.scale), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash?.([]);
    ctx.fillStyle = "#f0c572";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(4, 4 * (window.devicePixelRatio || 1)), 0, Math.PI * 2);
    ctx.fill();
    if (selected) {
      ctx.beginPath();
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#5a4b11";
      ctx.arc(x + circle.radiusPx * transform.scale, y, Math.max(4, 4 * (window.devicePixelRatio || 1)), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.font = `${Math.max(11, 11 * (window.devicePixelRatio || 1))}px Menlo, monospace`;
    const label = `${circle.label}  ${Math.round(circle.radiusPx)}px`;
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(0, 0, 0, 0.76)";
    ctx.fillRect(x + 7, Math.max(0, y - 26), textWidth + 12, 18);
    ctx.fillStyle = "#fff4d2";
    ctx.fillText(label, x + 12, Math.max(12, y - 12));
    ctx.restore();
  }

  function drawDrafts(ctx, transform) {
    if (state.dragging?.type === "new-square" && state.dragging.roi) {
      drawRoi(ctx, state.dragging.roi, transform, true);
    }
    if (state.circleDraft) {
      drawCircle(ctx, state.circleDraft, transform, true);
      const layout = generateNpsRoisForCircle(state.circleDraft, {
        edgePx: state.circleDraft.roiEdgePx,
        peripheralRoiCount: state.circleDraft.peripheralRoiCount,
        includeCenter: state.circleDraft.includeCenter,
        sequenceStart: state.npsSequence,
      });
      layout.rois.forEach((roi) => drawRoi(ctx, roi, transform, false));
    }
  }

  function render() {
    if (!els.canvas || els.viewerPage?.hidden) {
      return;
    }
    const canvasSize = syncCanvasSize(els.canvas);
    const ctx = els.canvas.getContext("2d");
    const transform = getViewportTransform(canvasSize);
    renderBaseImage(ctx, transform);
    const volume = getActiveVolume();
    if (volume) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(transform.offsetX, transform.offsetY, volume.columns * transform.scale, volume.rows * transform.scale);
      ctx.clip();
      drawGridOverlay(ctx, transform);
      getVisibleCircles().forEach((circle) => drawCircle(ctx, circle, transform, circle.id === state.selectedObjectId));
      getVisibleRois().forEach((roi) => drawRoi(ctx, roi, transform, roi.id === state.selectedObjectId));
      drawDrafts(ctx, transform);
      ctx.restore();
    }
  }

  function findRoiHit(xImg, yImg) {
    const volume = getActiveVolume();
    const transform = getViewportTransform();
    const tolerance = Math.max(0.75, 10 / Math.max(0.001, transform.scale));
    const rois = getVisibleRois();
    for (let index = rois.length - 1; index >= 0; index -= 1) {
      const roi = rois[index];
      const geometry = resolveSquareGeometry(roi, volume);
      if (!geometry) {
        continue;
      }
      const corners = [
        { name: "nw", x: geometry.xMinBoundaryImg, y: geometry.yMinBoundaryImg },
        { name: "ne", x: geometry.xMaxBoundaryImg, y: geometry.yMinBoundaryImg },
        { name: "se", x: geometry.xMaxBoundaryImg, y: geometry.yMaxBoundaryImg },
        { name: "sw", x: geometry.xMinBoundaryImg, y: geometry.yMaxBoundaryImg },
      ];
      if (roi.type !== NPS_ROI_TYPE) {
        const handle = corners.find((corner) => Math.hypot(corner.x - xImg, corner.y - yImg) <= tolerance);
        if (handle) {
          return { type: "roi", roi, hitType: "handle", handleName: handle.name, geometry };
        }
      }
      if (
        xImg >= geometry.xMinBoundaryImg &&
        xImg <= geometry.xMaxBoundaryImg &&
        yImg >= geometry.yMinBoundaryImg &&
        yImg <= geometry.yMaxBoundaryImg
      ) {
        return { type: "roi", roi, hitType: "body", handleName: "", geometry };
      }
    }
    return null;
  }

  function findCircleHit(xImg, yImg) {
    const transform = getViewportTransform();
    const tolerance = Math.max(1, 12 / Math.max(0.001, transform.scale));
    const circles = getVisibleCircles();
    for (let index = circles.length - 1; index >= 0; index -= 1) {
      const circle = circles[index];
      const distance = Math.hypot(xImg - circle.centerXImg, yImg - circle.centerYImg);
      if (Math.abs(distance - circle.radiusPx) <= tolerance) {
        return { type: "circle", circle, hitType: "radius" };
      }
      if (distance <= Math.max(circle.radiusPx, tolerance)) {
        return { type: "circle", circle, hitType: "body" };
      }
    }
    return null;
  }

  function findHit(xImg, yImg) {
    return findRoiHit(xImg, yImg) || findCircleHit(xImg, yImg);
  }

  function cursorForHit(hit) {
    if (!hit) {
      return "";
    }
    if (hit.type === "circle") {
      return hit.hitType === "radius" ? "ew-resize" : "move";
    }
    if (hit.hitType === "handle") {
      return hit.handleName === "nw" || hit.handleName === "se" ? "nwse-resize" : "nesw-resize";
    }
    return "move";
  }

  function updateCanvasCursor(event) {
    if (!els.canvas) {
      return;
    }
    if (!getActiveVolume()) {
      els.canvas.style.cursor = "";
      return;
    }
    if (state.dragging?.type === "pan") {
      els.canvas.style.cursor = "grabbing";
      return;
    }
    if (state.dragging?.type?.includes("move")) {
      els.canvas.style.cursor = "move";
      return;
    }
    if (state.dragging?.type?.includes("resize")) {
      els.canvas.style.cursor = "nwse-resize";
      return;
    }
    if (event) {
      const pointer = canvasToImageCoord(event.clientX, event.clientY);
      const hit = findHit(pointer.xImg, pointer.yImg);
      if (hit) {
        els.canvas.style.cursor = cursorForHit(hit);
        return;
      }
    }
    els.canvas.style.cursor =
      state.activeTool === "pan"
        ? "grab"
        : state.activeTool === "zoom"
          ? "zoom-in"
          : state.activeTool === "windowLevel" || state.activeTool === "noiseSquare" || state.activeTool === "noiseCircle"
            ? "crosshair"
            : "";
  }

  function selectObject(id) {
    state.selectedObjectId = id || "";
    const roi = getSelectedRoi();
    const circle = getSelectedCircle() || getCircleForRoi(roi);
    if (circle) {
      els.npsEdgeInput.value = String(circle.roiEdgePx || DEFAULT_NPS_EDGE_PX);
      els.npsPeripheralInput.value = String(circle.peripheralRoiCount || DEFAULT_NPS_PERIPHERAL_COUNT);
      els.npsCenterInput.checked = circle.includeCenter !== false;
      els.npsDetrendInput.checked = Boolean(circle.detrendPlane);
    }
    updateUi();
    render();
  }

  function createSquareFromDrag(anchor, pointer, options = {}) {
    const dx = pointer.xImg - anchor.xImg;
    const dy = pointer.yImg - anchor.yImg;
    const signX = dx >= 0 ? 1 : -1;
    const signY = dy >= 0 ? 1 : -1;
    const edgePx = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))) + 1);
    return createNoiseSquareRoi({
      id: options.id,
      sequence: state.roiSequence,
      datasetId: state.activeDatasetId,
      sliceIndex: state.activeSliceIndex,
      centerXImg: anchor.xImg + signX * (edgePx - 1) / 2,
      centerYImg: anchor.yImg + signY * (edgePx - 1) / 2,
      edgePx,
    });
  }

  function beginCircleDraft(pointer) {
    if (!isPointInsideImage(pointer.xImg, pointer.yImg)) {
      setStatus("Place the circle center inside the source image.", "warning");
      return;
    }
    const setRoot = state.pendingNpsSetRootId
      ? state.circles.find(
          (circle) => circle.datasetId === state.activeDatasetId && getCircleAnalysisSetId(circle) === state.pendingNpsSetRootId
        ) || null
      : null;
    const edgePx = nextPowerOfTwo(Math.max(2, Number(els.npsEdgeInput.value) || DEFAULT_NPS_EDGE_PX));
    state.circleDraft = createNoisePowerCircle({
      sequence: state.circleSequence,
      datasetId: state.activeDatasetId,
      sliceIndex: state.activeSliceIndex,
      centerXImg: pointer.xImg,
      centerYImg: pointer.yImg,
      radiusPx: 0,
      roiEdgePx: setRoot?.roiEdgePx || edgePx,
      peripheralRoiCount: setRoot?.peripheralRoiCount ?? (Number(els.npsPeripheralInput.value) || DEFAULT_NPS_PERIPHERAL_COUNT),
      includeCenter: setRoot ? setRoot.includeCenter !== false : els.npsCenterInput.checked,
      detrendPlane: setRoot ? Boolean(setRoot.detrendPlane) : els.npsDetrendInput.checked,
      npsSetId: state.pendingNpsSetRootId || "",
    });
    setStatus(
      state.pendingNpsSetRootId
        ? `Companion NPS circle center set for ${setRoot?.label || "the selected NPS set"}. Move outward, then double-click to confirm.`
        : "Noise Power circle center set. Move outward, then double-click to confirm the circle."
    );
  }

  function updateCircleDraft(pointer) {
    if (!state.circleDraft) {
      return;
    }
    state.circleDraft.radiusPx = Math.max(
      0,
      Math.hypot(pointer.xImg - state.circleDraft.centerXImg, pointer.yImg - state.circleDraft.centerYImg)
    );
    render();
  }

  function commitCircleDraft(pointer) {
    if (!state.circleDraft) {
      return false;
    }
    if (pointer) {
      updateCircleDraft(pointer);
    }
    if (state.circleDraft.radiusPx < Math.max(8, state.circleDraft.roiEdgePx / 2)) {
      setStatus("The circle is too small for the selected NPS square size.", "warning");
      state.circleDraft = null;
      render();
      return false;
    }
    pushHistory();
    const circle = cloneCircle(state.circleDraft);
    circle.id = `np_circle_${String(state.circleSequence).padStart(3, "0")}`;
    const pendingSetId = state.pendingNpsSetRootId;
    if (pendingSetId) {
      const root =
        state.circles.find(
          (entry) => entry.datasetId === circle.datasetId && getCircleAnalysisSetId(entry) === pendingSetId
        ) || null;
      const companionCount = getCircleAnalysisSetCircles(root || circle, { datasetId: state.activeDatasetId }).length + 1;
      if (root) {
        root.npsSetId = pendingSetId;
        circle.copiedFromCircleId = root.id;
      }
      circle.npsSetId = pendingSetId;
      circle.label = `${root?.label || "NPS Set"} companion ${companionCount}`;
    } else {
      circle.label = `NPS Circle ${String(state.circleSequence).padStart(2, "0")}`;
    }
    state.circleSequence += 1;
    state.circles.push(circle);
    state.circleDraft = null;
    state.pendingNpsSetRootId = "";
    state.selectedObjectId = circle.id;
    let generatedLayouts = [];
    let pooledCircleCount = 1;
    if (pendingSetId) {
      const setCircles = getCircleAnalysisSetCircles(circle, { datasetId: circle.datasetId });
      pooledCircleCount = setCircles.length || 1;
      generatedLayouts = setCircles
        .filter((entry) => !circleIsAnalyzable(entry) || entry.id === circle.id)
        .map((entry) => applyGeneratedNpsRois(entry));
      invalidateAnalysis();
    } else {
      generatedLayouts = [applyGeneratedNpsRois(circle)];
      invalidateAnalysis();
    }
    setActiveTool("select");
    updateUi();
    render();
    if (generatedLayouts.length) {
      const pooledAnalysis = getNpsAnalysisForCircle(circle);
      const warningText = generatedLayouts.flatMap((layout) => layout.warnings || []).length
        ? ` Warnings: ${Array.from(new Set(generatedLayouts.flatMap((layout) => layout.warnings || []))).join(", ")}.`
        : "";
      const circleCount = pooledAnalysis?.circleCount || pooledCircleCount;
      if (pendingSetId) {
        setStatus(
          `${circle.label} added to pooled NPS set. The set now uses ${circleCount} circle${circleCount === 1 ? "" : "s"} and ${pooledAnalysis?.validRoiCount || 0} / ${pooledAnalysis?.sourceRoiCount || pooledAnalysis?.validRoiCount || 0} valid square ROIs.${warningText} Open Analysis to review curves and tables.`,
          warningText ? "warning" : ""
        );
      } else {
        const layout = generatedLayouts[0];
        setStatus(
          `${circle.label} generated ${layout?.rois?.length || 0} square NPS ROIs.${warningText} Move or resize the circle to edit the layout, or open Analysis to review curves.`,
          warningText ? "warning" : ""
        );
      }
    } else {
      setStatus(`${circle.label} placed. Double-click the selected circle or press Generate Squares for NPS ROIs.`);
    }
    return true;
  }

  function applyGeneratedNpsRois(circle) {
    const layout = generateNpsRoisForCircle(circle, {
      edgePx: circle.roiEdgePx,
      peripheralRoiCount: circle.peripheralRoiCount,
      includeCenter: circle.includeCenter,
      sequenceStart: state.npsSequence,
    });
    state.rois = state.rois.filter((roi) => roi.parentCircleId !== circle.id);
    state.rois.push(...layout.rois);
    state.npsSequence = layout.nextSequence;
    circle.generated = true;
    circle.warnings = layout.warnings;
    circle.updatedAt = new Date().toISOString();
    return layout;
  }

  function generateNpsForCircle(circle = getSelectedCircle()) {
    if (!circle) {
      const selectedRoi = getSelectedRoi();
      circle = getCircleForRoi(selectedRoi);
    }
    if (!circle) {
      setStatus("Select a Noise Power circle before generating square NPS ROIs.", "warning");
      return;
    }
    pushHistory();
    circle.roiEdgePx = nextPowerOfTwo(Math.max(2, Number(els.npsEdgeInput.value) || circle.roiEdgePx || DEFAULT_NPS_EDGE_PX));
    circle.peripheralRoiCount = Math.max(0, Math.round(Number(els.npsPeripheralInput.value) || DEFAULT_NPS_PERIPHERAL_COUNT));
    circle.includeCenter = els.npsCenterInput.checked;
    circle.detrendPlane = els.npsDetrendInput.checked;
    const layout = applyGeneratedNpsRois(circle);
    invalidateAnalysis();
    state.selectedObjectId = circle.id;
    updateUi();
    render();
    const pooledAnalysis = getNpsAnalysisForCircle(circle);
    const setText =
      pooledAnalysis?.circleCount > 1
        ? ` Pooled set now uses ${pooledAnalysis.circleCount} circles and ${pooledAnalysis.validRoiCount} / ${pooledAnalysis.sourceRoiCount || pooledAnalysis.validRoiCount} valid square ROIs.`
        : "";
    const warningText = layout.warnings.length ? ` Warnings: ${layout.warnings.join(", ")}.` : "";
    setStatus(
      `${circle.label} generated ${layout.rois.length} square NPS ROIs.${setText}${warningText} Open Analysis when you are ready to review curves.`,
      layout.warnings.length ? "warning" : ""
    );
  }

  function addCircleToSameNpsSet() {
    const selectedCircle = getSelectedCircle() || getCircleForRoi(getSelectedRoi());
    if (!selectedCircle) {
      setStatus("Select an existing Noise Power circle first, then add a companion circle to that same NPS set.", "warning");
      return;
    }
    const setId = getCircleAnalysisSetId(selectedCircle) || selectedCircle.id;
    const root =
      state.circles.find((circle) => circle.datasetId === selectedCircle.datasetId && getCircleAnalysisSetId(circle) === setId) ||
      selectedCircle;
    root.npsSetId = setId;
    selectedCircle.npsSetId = setId;
    state.pendingNpsSetRootId = setId;
    setActiveTool("noiseCircle");
    setStatus(`Draw a second circle for ${root.label}. Its square NPS ROIs will be pooled into one analysis set.`);
  }

  function startObjectDrag(hit, pointer, event) {
    if (!hit) {
      return false;
    }
    pushHistory();
    if (hit.type === "roi") {
      state.selectedObjectId = hit.roi.id;
      if (hit.roi.type === NPS_ROI_TYPE) {
        const circle = getCircleForRoi(hit.roi);
        if (circle) {
          state.selectedObjectId = circle.id;
          state.dragging = {
            type: "move-circle",
            circle,
            startCenterX: circle.centerXImg,
            startCenterY: circle.centerYImg,
            pointerStartX: pointer.xImg,
            pointerStartY: pointer.yImg,
            startClientX: event.clientX,
            startClientY: event.clientY,
            hasMoved: false,
          };
          return true;
        }
      }
      if (hit.hitType === "handle") {
        state.dragging = {
          type: "resize-roi",
          roi: hit.roi,
          handleName: hit.handleName,
          fixedX: hit.handleName.includes("e") ? hit.geometry.xMinBoundaryImg : hit.geometry.xMaxBoundaryImg,
          fixedY: hit.handleName.includes("s") ? hit.geometry.yMinBoundaryImg : hit.geometry.yMaxBoundaryImg,
          startClientX: event.clientX,
          startClientY: event.clientY,
          hasMoved: false,
        };
      } else {
        state.dragging = {
          type: "move-roi",
          roi: hit.roi,
          startCenterX: hit.roi.centerXImg,
          startCenterY: hit.roi.centerYImg,
          pointerStartX: pointer.xImg,
          pointerStartY: pointer.yImg,
          startClientX: event.clientX,
          startClientY: event.clientY,
          hasMoved: false,
        };
      }
      return true;
    }
    state.selectedObjectId = hit.circle.id;
    state.dragging = {
      type: hit.hitType === "radius" ? "resize-circle" : "move-circle",
      circle: hit.circle,
      startCenterX: hit.circle.centerXImg,
      startCenterY: hit.circle.centerYImg,
      startRadiusPx: hit.circle.radiusPx,
      pointerStartX: pointer.xImg,
      pointerStartY: pointer.yImg,
      startClientX: event.clientX,
      startClientY: event.clientY,
      hasMoved: false,
    };
    return true;
  }

  function updateMovedNpsRoisForCircle(circle) {
    const layout = generateNpsRoisForCircle(circle, {
      edgePx: circle.roiEdgePx,
      peripheralRoiCount: circle.peripheralRoiCount,
      includeCenter: circle.includeCenter,
      sequenceStart: state.npsSequence,
    });
    if (!circle.generated) {
      return;
    }
    const staleByParent = new Set(state.rois.filter((roi) => roi.parentCircleId === circle.id).map((roi) => roi.id));
    state.rois = state.rois.filter((roi) => !staleByParent.has(roi.id));
    state.rois.push(...layout.rois);
    state.npsSequence = layout.nextSequence;
    circle.warnings = layout.warnings;
  }

  function handlePointerDown(event) {
    if (!getActiveVolume()) {
      return;
    }
    const pointer = canvasToImageCoord(event.clientX, event.clientY);
    const hit = findHit(pointer.xImg, pointer.yImg);

    if (event.button === 2 || (event.button === 0 && event.ctrlKey)) {
      if (hit) {
        selectObject(hit.type === "roi" ? hit.roi.id : hit.circle.id);
      } else {
        state.dragging = {
          type: "stack-scrub",
          startY: event.clientY,
          startSliceIndex: state.activeSliceIndex,
        };
      }
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
      };
      event.preventDefault();
      return;
    }

    if (hit && state.activeTool !== "noiseSquare" && state.activeTool !== "noiseCircle") {
      startObjectDrag(hit, pointer, event);
      event.preventDefault();
      return;
    }

    if (state.activeTool === "noiseCircle") {
      if (state.circleDraft) {
        updateCircleDraft(pointer);
      } else {
        beginCircleDraft(pointer);
      }
      event.preventDefault();
      return;
    }

    if (state.activeTool === "noiseSquare") {
      if (!isPointInsideImage(pointer.xImg, pointer.yImg)) {
        setStatus("Place TTF Square ROIs inside the source image.", "warning");
        return;
      }
      state.dragging = {
        type: "new-square",
        anchor: { xImg: pointer.xImg, yImg: pointer.yImg },
        roi: createNoiseSquareRoi({
          sequence: state.roiSequence,
          datasetId: state.activeDatasetId,
          sliceIndex: state.activeSliceIndex,
          centerXImg: pointer.xImg,
          centerYImg: pointer.yImg,
          edgePx: 1,
        }),
        startClientX: event.clientX,
        startClientY: event.clientY,
        hasMoved: false,
      };
      event.preventDefault();
      return;
    }

    if (hit) {
      startObjectDrag(hit, pointer, event);
      event.preventDefault();
      return;
    }

    state.selectedObjectId = "";
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
    updateUi();
    render();
  }

  function handlePointerMove(event) {
    if (!state.dragging) {
      if (state.circleDraft) {
        updateCircleDraft(canvasToImageCoord(event.clientX, event.clientY));
      }
      updateCanvasCursor(event);
      return;
    }
    const drag = state.dragging;
    if (Number.isFinite(drag.startClientX) && Number.isFinite(drag.startClientY)) {
      drag.hasMoved = drag.hasMoved || Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > 3;
    }

    if (drag.type === "stack-scrub") {
      const volume = getActiveVolume();
      const delta = Math.round((drag.startY - event.clientY) / 8);
      setActiveSliceIndex(clamp(drag.startSliceIndex + delta, 0, volume.depth - 1));
      updateUi();
      render();
      return;
    }

    const pointer = canvasToImageCoord(event.clientX, event.clientY);
    if (drag.type === "new-square") {
      drag.roi = createSquareFromDrag(drag.anchor, pointer, { id: drag.roi.id });
      render();
      updateUi();
      return;
    }
    if (drag.type === "move-roi") {
      drag.roi.centerXImg = drag.startCenterX + (pointer.xImg - drag.pointerStartX);
      drag.roi.centerYImg = drag.startCenterY + (pointer.yImg - drag.pointerStartY);
      drag.roi.updatedAt = new Date().toISOString();
      invalidateAnalysis();
      render();
      updateUi();
      return;
    }
    if (drag.type === "resize-roi") {
      const signX = drag.handleName.includes("e") ? 1 : -1;
      const signY = drag.handleName.includes("s") ? 1 : -1;
      const edgePx = Math.max(1, Math.round(Math.max(Math.abs(pointer.xImg - drag.fixedX), Math.abs(pointer.yImg - drag.fixedY))));
      drag.roi.edgePx = edgePx;
      drag.roi.centerXImg = drag.fixedX + signX * edgePx / 2;
      drag.roi.centerYImg = drag.fixedY + signY * edgePx / 2;
      drag.roi.updatedAt = new Date().toISOString();
      invalidateAnalysis();
      render();
      updateUi();
      return;
    }
    if (drag.type === "move-circle") {
      drag.circle.centerXImg = drag.startCenterX + (pointer.xImg - drag.pointerStartX);
      drag.circle.centerYImg = drag.startCenterY + (pointer.yImg - drag.pointerStartY);
      drag.circle.updatedAt = new Date().toISOString();
      updateMovedNpsRoisForCircle(drag.circle);
      invalidateAnalysis();
      render();
      updateUi();
      return;
    }
    if (drag.type === "resize-circle") {
      drag.circle.radiusPx = Math.max(1, Math.hypot(pointer.xImg - drag.circle.centerXImg, pointer.yImg - drag.circle.centerYImg));
      drag.circle.updatedAt = new Date().toISOString();
      updateMovedNpsRoisForCircle(drag.circle);
      invalidateAnalysis();
      render();
      updateUi();
      return;
    }
    if (drag.type === "pan") {
      const rect = els.canvas.getBoundingClientRect();
      const canvasSize = syncCanvasSize(els.canvas);
      const ratioX = canvasSize.width / Math.max(1, rect.width);
      const ratioY = canvasSize.height / Math.max(1, rect.height);
      state.viewport.panX = drag.startPanX + (event.clientX - drag.startClientX) * ratioX;
      state.viewport.panY = drag.startPanY + (event.clientY - drag.startClientY) * ratioY;
      render();
      return;
    }
    if (drag.type === "window-level") {
      state.viewport.windowWidth = Math.max(1, drag.startWw + (event.clientX - drag.startClientX) * 3);
      state.viewport.windowCenter = drag.startWl - (event.clientY - drag.startClientY) * 2;
      updateUi();
      render();
      return;
    }
    if (drag.type === "zoom") {
      const delta = (drag.startClientY - event.clientY) / 220;
      state.viewport.zoom = clamp(drag.startZoom * (1 + delta), 0.2, 30);
      render();
    }
  }

  function handlePointerUp(event) {
    const drag = state.dragging;
    state.dragging = null;
    updateCanvasCursor(event);
    if (drag?.type === "new-square") {
      if (!drag.hasMoved) {
        render();
        setStatus("Drag to draw an exact square ROI.", "warning");
        return;
      }
      const fit = resolveSquareGeometry(drag.roi, getActiveVolume());
      if (!fit || fit.touchesBoundary || !fit.areaPx) {
        render();
        setStatus("The ROI would touch or leave the source image. Draw inside the image boundary.", "warning");
        return;
      }
      pushHistory();
      state.rois.push(drag.roi);
      state.selectedObjectId = drag.roi.id;
      state.roiSequence += 1;
      invalidateAnalysis();
      setActiveTool("select");
      updateUi();
      render();
      const analysis = getAnalysisForRoi(drag.roi);
      const stats = analysis?.statsCalibrated || {};
      const statText =
        Number.isFinite(stats.mean) && Number.isFinite(stats.sd)
          ? ` Mean ${roundForDisplay(stats.mean, 2)} ${analysis.units}; SD ${roundForDisplay(stats.sd, 2)} ${analysis.units}.`
          : analysis?.error
            ? ` Analysis warning: ${analysis.error}.`
            : "";
      const ttf = analysis?.ttfAnalysis || {};
      const ttfLowCnr = Array.isArray(ttf.warnings) && ttf.warnings.includes("ttf-low-cnr-tg233");
      const ttfText =
        drag.roi.type === ROI_TYPE && ttf.valid
          ? ` TTFxy ${Number.isFinite(ttf.f50Frequency) ? `f50 ${roundForDisplay(ttf.f50Frequency, 4)} mm^-1` : "computed"}.${ttfLowCnr ? " Low CNR caution." : ""}`
          : drag.roi.type === ROI_TYPE && ttf.error
            ? ` TTFxy not valid for this square: ${ttf.error}`
            : "";
      setStatus(`${drag.roi.label} placed.${statText}${ttfText}`, ttfLowCnr || (!ttf.valid && ttf.error) ? "warning" : "");
      return;
    }
    if (drag?.type && drag.hasMoved) {
      invalidateAnalysis();
      updateUi();
      render();
    }
  }

  function handleDoubleClick(event) {
    const pointer = canvasToImageCoord(event.clientX, event.clientY);
    if (state.activeTool === "noiseCircle" && state.circleDraft) {
      event.preventDefault();
      commitCircleDraft(pointer);
      return;
    }
    const hit = findHit(pointer.xImg, pointer.yImg);
    if (hit?.type === "circle") {
      selectObject(hit.circle.id);
      generateNpsForCircle(hit.circle);
      event.preventDefault();
    }
  }

  function handleContextMenu(event) {
    event.preventDefault();
    if (!getActiveVolume() || Date.now() < state.suppressContextMenuUntil) {
      return;
    }
    const pointer = canvasToImageCoord(event.clientX, event.clientY);
    const hit = findHit(pointer.xImg, pointer.yImg);
    if (!hit) {
      closeContextMenu();
      return;
    }
    const id = hit.type === "roi" ? hit.roi.id : hit.circle.id;
    openContextMenu(event.clientX, event.clientY, id);
  }

  function closeContextMenu() {
    if (els.contextMenu) {
      els.contextMenu.hidden = true;
    }
  }

  function openContextMenu(clientX, clientY, objectId) {
    selectObject(objectId);
    const width = 220;
    const height = 190;
    els.contextMenu.style.left = `${Math.min(clientX + 8, Math.max(8, window.innerWidth - width - 8))}px`;
    els.contextMenu.style.top = `${Math.min(clientY + 8, Math.max(8, window.innerHeight - height - 8))}px`;
    els.contextMenu.hidden = false;
  }

  function zoomViewportAt(clientX, clientY, nextZoom) {
    if (!getActiveVolume()) {
      return;
    }
    const pointer = canvasToImageCoord(clientX, clientY);
    const currentZoom = state.viewport.zoom;
    const clampedZoom = clamp(nextZoom, 0.2, 30);
    if (Math.abs(currentZoom - clampedZoom) < 1e-4) {
      return;
    }
    state.viewport.zoom = clampedZoom;
    const nextTransform = getViewportTransform();
    const projectedX = imageCoordToCanvas(pointer.xImg, nextTransform);
    const projectedY = imageYToCanvas(pointer.yImg, nextTransform);
    state.viewport.panX += pointer.canvasX - projectedX;
    state.viewport.panY += pointer.canvasY - projectedY;
  }

  function isSameStudyAsLoadedDataset(candidate) {
    const existing = state.datasets[0]?.meta || state.datasets[0]?.records?.[0];
    const incoming = candidate?.meta || candidate?.records?.[0];
    return isSamePatientStudy(existing, incoming);
  }

  async function loadFiles(files, options = {}) {
    const profile = window.HAGRadCore?.createLoadProfiler?.("DICOM load", {
      workflow: "noise-power",
      mode: options.add ? "append" : "replace",
    });
    const finishEnumeration = profile?.start("fileEnumeration");
    const list = Array.from(files || []);
    finishEnumeration?.({ fileCount: list.length });
    if (!list.length) {
      return;
    }
    setStatus(`Parsing ${list.length} DICOM file${list.length === 1 ? "" : "s"}...`);
    const finishHeaderParse = profile?.start("dicomHeaderParse", { fileCount: list.length });
    const parsed = await dicomApi.parseDicomFiles(list, {
      onProgress(done, total) {
        setStatus(`Reading DICOM headers ${done} / ${total}...`);
      },
      profile,
    });
    finishHeaderParse?.({ recordCount: parsed.length });
    const finishGrouping = profile?.start("seriesGrouping", { recordCount: parsed.length });
    const candidates = dicomApi.buildSeriesCandidates(parsed);
    finishGrouping?.({ groupCount: candidates.length });
    if (!candidates.length) {
      throw new Error("No image series with DICOM pixel data were found.");
    }
    const importCandidates = [];
    const existingKeys = new Set(state.datasets.map((dataset) => dataset.key || dataset.id));
    let skippedDifferentStudy = 0;
    let skippedDuplicateSeries = 0;
    let skippedUnreadableSeries = 0;
    let skippedFiles = 0;
    let importedCount = 0;
    candidates.forEach((candidate) => {
      const key = candidate.key || candidate.id;
      if (options.add && !isSameStudyAsLoadedDataset(candidate)) {
        skippedDifferentStudy += 1;
        return;
      }
      if (options.add && existingKeys.has(key)) {
        skippedDuplicateSeries += 1;
        return;
      }
      existingKeys.add(key);
      importCandidates.push(candidate);
    });
    if (!importCandidates.length) {
      if (options.add && skippedDifferentStudy) {
        throw new Error("The added reconstruction files belong to a different study or patient. Clear the study first if you want to switch patients.");
      }
      if (options.add && skippedDuplicateSeries) {
        throw new Error("Those reconstruction series are already loaded.");
      }
      throw new Error("No image series with DICOM pixel data were found.");
    }
    if (!options.add) {
      state.datasets = [];
      state.rois = [];
      state.circles = [];
      state.selectedObjectId = "";
      state.roiSequence = 1;
      state.circleSequence = 1;
      state.npsSequence = 1;
      state.history.undoStack = [];
      state.history.redoStack = [];
    }
    for (let index = 0; index < importCandidates.length; index += 1) {
      const candidate = importCandidates[index];
      setStatus(`Building ${candidate.label}: ${index + 1} / ${importCandidates.length}`);
      try {
        candidate.volume = await dicomApi.buildVolume(candidate.records, {
          statusCallback(current, total) {
            if (current === 1 || current === total || current % 10 === 0) {
              setStatus(`Loading ${candidate.label}: ${current} / ${total}`);
            }
          },
          profile,
        });
      } catch (error) {
        skippedUnreadableSeries += 1;
        console.warn("Skipping unreadable DICOM series.", error);
        continue;
      }
      skippedFiles += candidate.volume?.skippedCount || 0;
      candidate.id = uniqueDatasetId(candidate.id || candidate.key || `series_${Date.now()}`);
      state.datasets.push(candidate);
      importedCount += 1;
    }
    if (!importedCount) {
      throw new Error("No new readable reconstructions could be loaded from the selected files.");
    }
    setActiveDataset(state.datasets[0].id);
    const notes = [];
    if (skippedUnreadableSeries) {
      notes.push(`${skippedUnreadableSeries} unreadable series skipped`);
    }
    if (skippedFiles) {
      notes.push(`${skippedFiles} file${skippedFiles === 1 ? "" : "s"} skipped during decoding`);
    }
    const loadedMessage = `${state.datasets.length} reconstruction${state.datasets.length === 1 ? "" : "s"} loaded.`;
    setStatus(notes.length ? `${loadedMessage} ${notes.join("; ")}.` : loadedMessage, notes.length ? "warning" : "");
    profile?.sampleMemory("afterVolumeConstruction");
    const finishFirstRender = profile?.start("firstRenderAfterVolumeCompletion", {
      reconstructionCount: state.datasets.length,
    });
    window.requestAnimationFrame(() => {
      finishFirstRender?.();
      profile?.sampleMemory("afterFirstRender");
      profile?.finish({
        loadedReconstructions: importCandidates.length,
        totalReconstructions: state.datasets.length,
      });
    });
  }

  function uniqueDatasetId(baseId) {
    const base = String(baseId || "series");
    if (!state.datasets.some((dataset) => dataset.id === base)) {
      return base;
    }
    let suffix = 2;
    while (state.datasets.some((dataset) => dataset.id === `${base}_${suffix}`)) {
      suffix += 1;
    }
    return `${base}_${suffix}`;
  }

  function clearStudy() {
    pushHistory();
    state.datasets = [];
    state.activeDatasetId = "";
    state.activeSliceIndex = 0;
    state.rois = [];
    state.circles = [];
    state.selectedObjectId = "";
    state.circleDraft = null;
    invalidateAnalysis();
    updateUi();
    render();
    setStatus("Study cleared.");
  }

  function deleteSelectedObject() {
    const object = getSelectedObject();
    if (!object) {
      setStatus("Select an ROI or circle before deleting.", "warning");
      return;
    }
    pushHistory();
    if (object.type === CIRCLE_TYPE) {
      state.circles = state.circles.filter((circle) => circle.id !== object.id);
      state.rois = state.rois.filter((roi) => roi.parentCircleId !== object.id);
    } else {
      state.rois = state.rois.filter((roi) => roi.id !== object.id);
    }
    state.selectedObjectId = "";
    invalidateAnalysis();
    updateUi();
    render();
    setStatus(`${object.label || object.id} deleted.`);
  }

  function duplicateSelectedObject() {
    const object = getSelectedObject();
    if (!object) {
      setStatus("Select an ROI or circle before duplicating.", "warning");
      return;
    }
    pushHistory();
    if (object.type === CIRCLE_TYPE) {
      const circle = cloneCircle(object);
      circle.id = `np_circle_${String(state.circleSequence).padStart(3, "0")}`;
      circle.label = `${object.label} copy`;
      circle.centerXImg += 8;
      circle.centerYImg += 8;
      circle.copiedFromCircleId = object.id;
      circle.npsSetId = getCircleAnalysisSetId(object) || object.id;
      object.npsSetId = circle.npsSetId;
      state.circleSequence += 1;
      state.circles.push(circle);
      state.selectedObjectId = circle.id;
      if (object.generated) {
        const layout = generateNpsRoisForCircle(circle, {
          edgePx: circle.roiEdgePx,
          peripheralRoiCount: circle.peripheralRoiCount,
          includeCenter: circle.includeCenter,
          sequenceStart: state.npsSequence,
        });
        state.rois.push(...layout.rois);
        state.npsSequence = layout.nextSequence;
        circle.generated = true;
      }
    } else {
      const roi = cloneRoi(object);
      roi.id = `np_roi_${String(state.roiSequence).padStart(3, "0")}`;
      roi.label = `${object.label} copy`;
      roi.centerXImg += 4;
      roi.centerYImg += 4;
      roi.parentCircleId = "";
      roi.type = ROI_TYPE;
      state.roiSequence += 1;
      state.rois.push(roi);
      state.selectedObjectId = roi.id;
    }
    invalidateAnalysis();
    updateUi();
    render();
  }

  function copySelectedToAllRecons() {
    const object = getSelectedObject();
    if (!object) {
      setStatus("Select a TTF square ROI or circle before copying.", "warning");
      return;
    }
    if (state.datasets.length < 2) {
      setStatus("Load more than one reconstruction before copying geometry.", "warning");
      return;
    }
    pushHistory();
    if (object.type === CIRCLE_TYPE) {
      const setCircles = getCircleAnalysisSetCircles(object, { datasetId: object.datasetId });
      copyCirclesToAll(setCircles.length ? setCircles : [object]);
    } else {
      copyRoisToAll([object]);
    }
  }

  function copyCurrentSliceAnalysisToAllRecons() {
    const { rois, circles } = getCurrentSliceObjects();
    const sourceRois = rois.filter((roi) => roi.type === ROI_TYPE);
    if (!sourceRois.length && !circles.length) {
      setStatus("Place a TTF square ROI or circle before copying current slice analysis.", "warning");
      return;
    }
    if (state.datasets.length < 2) {
      setStatus("Load more than one reconstruction before copying geometry.", "warning");
      return;
    }
    pushHistory();
    copyRoisToAll(sourceRois);
    copyCirclesToAll(circles);
  }

  function copyToAllRecons() {
    if (getSelectedObject()) {
      copySelectedToAllRecons();
      return;
    }
    copyCurrentSliceAnalysisToAllRecons();
  }

  function copyRoisToAll(sourceRois) {
    const sourceDataset = getActiveDataset();
    if (!sourceDataset) {
      return;
    }
    let copied = 0;
    state.datasets.forEach((targetDataset) => {
      if (targetDataset.id === sourceDataset.id) {
        return;
      }
      sourceRois.forEach((sourceRoi) => {
        const mapped = mapSquareRoiToTarget(sourceRoi, sourceDataset, targetDataset, {
          id: `np_roi_${String(state.roiSequence).padStart(3, "0")}`,
        });
        mapped.label = sourceRoi.label;
        state.roiSequence += 1;
        state.rois.push(mapped);
        copied += 1;
      });
    });
    invalidateAnalysis();
    updateUi();
    render();
    setStatus(`Copied ${copied} square ROI${copied === 1 ? "" : "s"} to other reconstructions. Verify mapped geometry before export.`);
  }

  function copyCirclesToAll(sourceCircles) {
    const normalizedCircles = Array.from(new Map((sourceCircles || []).filter(Boolean).map((circle) => [circle.id, circle])).values());
    if (!normalizedCircles.length) {
      return;
    }
    let copiedCircles = 0;
    let copiedSquares = 0;
    const groups = new Map();
    normalizedCircles.forEach((circle) => {
      const setId = getCircleAnalysisSetId(circle) || circle.id;
      const key = `${circle.datasetId || ""}::${setId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          datasetId: circle.datasetId,
          setId,
          circles: [],
        });
      }
      groups.get(key).circles.push(circle);
    });
    groups.forEach((group) => {
      const sourceDataset = state.datasets.find((dataset) => dataset.id === group.datasetId);
      if (!sourceDataset) {
        return;
      }
      const sourceCircleIds = new Set(group.circles.map((circle) => circle.id));
      const sourceLabels = new Set(group.circles.map((circle) => safeString(circle.label)).filter(Boolean));
      const sourceNpsRois = state.rois.filter((roi) => roi.type === NPS_ROI_TYPE && sourceCircleIds.has(roi.parentCircleId));
      state.datasets.forEach((targetDataset) => {
        if (targetDataset.id === sourceDataset.id) {
          return;
        }
        const staleCircleIds = new Set(
          state.circles
            .filter((circle) => {
              if (circle.datasetId !== targetDataset.id) {
                return false;
              }
              if (safeString(circle.copySourceSetId) === group.setId || safeString(circle.npsSetId) === group.setId) {
                return true;
              }
              if (sourceCircleIds.has(circle.copiedFromCircleId)) {
                return true;
              }
              return circle.copiedFromDatasetId === sourceDataset.id && sourceLabels.has(safeString(circle.label));
            })
            .map((circle) => circle.id)
        );
        if (staleCircleIds.size) {
          state.circles = state.circles.filter((circle) => !staleCircleIds.has(circle.id));
          state.rois = state.rois.filter((roi) => !staleCircleIds.has(roi.parentCircleId));
        }
        const mappedCircleBySourceId = new Map();
        group.circles.forEach((sourceCircle) => {
          const circle = mapCircleToTarget(sourceCircle, sourceDataset, targetDataset, {
            id: `np_circle_${String(state.circleSequence).padStart(3, "0")}`,
          });
          circle.label = sourceCircle.label;
          circle.npsSetId = group.setId;
          circle.copySourceSetId = group.setId;
          circle.generated = Boolean(sourceCircle.generated || sourceNpsRois.some((roi) => roi.parentCircleId === sourceCircle.id));
          state.circleSequence += 1;
          state.circles.push(circle);
          mappedCircleBySourceId.set(sourceCircle.id, circle);
          copiedCircles += 1;
        });
        group.circles.forEach((sourceCircle) => {
          const targetCircle = mappedCircleBySourceId.get(sourceCircle.id);
          if (!targetCircle) {
            return;
          }
          const sourceRoisForCircle = sourceNpsRois.filter((roi) => roi.parentCircleId === sourceCircle.id);
          if (sourceRoisForCircle.length) {
            const mappedRois = sourceRoisForCircle.map((sourceRoi) => {
              const mapped = mapSquareRoiToTarget(sourceRoi, sourceDataset, targetDataset, {
                id: `np_nps_${String(state.npsSequence).padStart(3, "0")}`,
                parentCircleId: targetCircle.id,
              });
              mapped.label = sourceRoi.label;
              mapped.copySourceSetId = group.setId;
              state.npsSequence += 1;
              return mapped;
            });
            state.rois.push(...mappedRois);
            copiedSquares += mappedRois.length;
            targetCircle.generated = true;
            return;
          }
          if (sourceCircle.generated) {
            const layout = generateNpsRoisForCircle(targetCircle, {
              edgePx: targetCircle.roiEdgePx,
              peripheralRoiCount: targetCircle.peripheralRoiCount,
              includeCenter: targetCircle.includeCenter,
              sequenceStart: state.npsSequence,
            });
            state.rois.push(...layout.rois);
            state.npsSequence = layout.nextSequence;
            copiedSquares += layout.rois.length;
            targetCircle.generated = true;
            targetCircle.warnings = Array.from(new Set([...(targetCircle.warnings || []), ...layout.warnings]));
          }
        });
      });
    });
    invalidateAnalysis();
    updateUi();
    render();
    setStatus(
      `Synced ${copiedCircles} Noise Power circle${copiedCircles === 1 ? "" : "s"} and ${copiedSquares} NPS square ROI${copiedSquares === 1 ? "" : "s"} to other reconstructions. Verify mapped geometry before export.`
    );
  }

  function updateReconList() {
    if (!state.datasets.length) {
      els.reconList.innerHTML = '<p class="empty-copy">Load one or more axial CT phantom reconstructions.</p>';
      els.studyNote.textContent = "No series loaded";
      return;
    }
    els.studyNote.textContent = `${state.datasets.length} loaded`;
    els.reconList.innerHTML = state.datasets
      .map((dataset, index) => {
        const active = dataset.id === state.activeDatasetId ? " is-active" : "";
        const spacing = dataset.volume
          ? `${roundForDisplay(dataset.volume.columnSpacing, 4) || "-"} x ${roundForDisplay(dataset.volume.rowSpacing, 4) || "-"} mm`
          : "-";
        return `
          <button class="recon-card${active}" data-dataset-id="${escapeAttr(dataset.id)}" type="button">
            <strong>${escapeHtml(datasetLabel(dataset, index))}</strong>
            <span>${escapeHtml(`${dataset.volume?.depth || 0} slices · ${dataset.volume?.columns || "-"} x ${dataset.volume?.rows || "-"} · ${spacing}`)}</span>
          </button>
        `;
      })
      .join("");
    els.reconList.querySelectorAll("[data-dataset-id]").forEach((button) => {
      button.addEventListener("mousedown", (event) => {
        if (event.button === 0) {
          setActiveDataset(button.dataset.datasetId || "");
        }
      });
      button.addEventListener("click", () => setActiveDataset(button.dataset.datasetId || ""));
    });
  }

  function updateSliceControls() {
    const volume = getActiveVolume();
    const depth = volume?.depth || 0;
    els.sliceSlider.max = String(Math.max(0, depth - 1));
    els.sliceSlider.value = String(clamp(state.activeSliceIndex, 0, Math.max(0, depth - 1)));
    els.sliceSlider.disabled = depth <= 1;
    els.readout.textContent = depth ? `Slice ${state.activeSliceIndex + 1} / ${depth}` : "Slice - / -";
    els.windowWidthInput.value = String(Math.round(state.viewport.windowWidth));
    els.windowCenterInput.value = String(Math.round(state.viewport.windowCenter));
  }

  function updateObjectList() {
    const activeObjects = [
      ...state.circles.filter((circle) => circle.datasetId === state.activeDatasetId),
      ...state.rois.filter((roi) => roi.datasetId === state.activeDatasetId && roi.type === ROI_TYPE),
    ].sort((left, right) => left.sliceIndex - right.sliceIndex || String(left.label).localeCompare(String(right.label)));
    if (!activeObjects.length) {
      els.objectList.innerHTML = '<p class="empty-copy">ROIs and circles appear here.</p>';
      return;
    }
    els.objectList.innerHTML = activeObjects
      .map((object) => {
        const selected = object.id === state.selectedObjectId ? " is-active" : "";
        const typeLabel = object.type === CIRCLE_TYPE ? "Noise Power Circle" : "TTF Square ROI";
        const detail =
          object.type === CIRCLE_TYPE
            ? `Slice ${object.sliceIndex + 1} · radius ${roundForDisplay(object.radiusPx, 1)} px · ${object.generated ? "squares generated" : "no squares"}`
            : (() => {
                const analysis = getAnalysisForRoi(object);
                return `Slice ${object.sliceIndex + 1} · SD ${formatMetric(analysis?.statsCalibrated?.sd, analysis?.units, 2)}`;
              })();
        return `
          <button class="object-card${selected}" data-object-id="${object.id}" type="button">
            <strong>${object.label}</strong>
            <span>${typeLabel} · ${detail}</span>
          </button>
        `;
      })
      .join("");
    els.objectList.querySelectorAll("[data-object-id]").forEach((button) => {
      button.addEventListener("click", () => selectObject(button.dataset.objectId || ""));
      button.addEventListener("dblclick", () => {
        const object = state.circles.find((circle) => circle.id === button.dataset.objectId);
        if (object) {
          generateNpsForCircle(object);
        }
      });
    });
  }

  function updateDicomOverlay() {
    if (!els.dicomOverlay || !els.dicomToggleButton) {
      return;
    }
    const dataset = getActiveDataset();
    const hasVolume = Boolean(dataset?.volume);
    els.dicomToggleButton.disabled = !hasVolume;
    if (els.gridToggleButton) {
      els.gridToggleButton.disabled = !hasVolume;
      els.gridToggleButton.classList.toggle("is-active", Boolean(state.showGridOverlay && hasVolume));
      els.gridToggleButton.setAttribute("aria-pressed", state.showGridOverlay && hasVolume ? "true" : "false");
    }
    els.dicomToggleButton.classList.toggle("is-active", Boolean(state.showDicomInfo && hasVolume));
    els.dicomToggleButton.setAttribute("aria-pressed", state.showDicomInfo && hasVolume ? "true" : "false");
    if (!state.showDicomInfo || !hasVolume) {
      els.dicomOverlay.hidden = true;
      els.dicomOverlay.innerHTML = "";
      return;
    }
    els.dicomOverlay.hidden = false;
    els.dicomOverlay.innerHTML = `
      <div class="dicom-info-title">DICOM Information</div>
      ${dicomRowsToHtml(getImportantDicomRows(dataset, state.activeSliceIndex))}
    `;
  }

  function formatMetric(value, suffix, digits = 2) {
    if (!Number.isFinite(value)) {
      return "-";
    }
    return `${roundForDisplay(value, digits)}${suffix ? ` ${suffix}` : ""}`;
  }

  function formatKernelSamplingStatus(status) {
    return String(status || "")
      .replace(/-/g, " ")
      .replace(/\brhoMax\b/, "rhoMax")
      .replace(/\brho10\b/, "rho10") || "-";
  }

  function formatKernelMtfReference(reference) {
    if (!reference || !Number.isFinite(reference.rho10LpCm)) {
      return "-";
    }
    const rho50 = Number.isFinite(reference.rho50LpCm) ? roundForDisplay(reference.rho50LpCm, 2) : "-";
    const rho10 = Number.isFinite(reference.rho10LpCm) ? roundForDisplay(reference.rho10LpCm, 2) : "-";
    const rho02 = Number.isFinite(reference.rho02LpCm) ? roundForDisplay(reference.rho02LpCm, 2) : "-";
    return `rho50/10/02 ${rho50} / ${rho10} / ${rho02} lp/cm`;
  }

  function kernelReferenceSummary(dataset) {
    const reference = kernelRho10Reference(dataset);
    const rhoMax = datasetRhoMaxLpCm(dataset);
    const comparison = kernelSamplingComparison(rhoMax, reference);
    return {
      reference,
      rhoMax,
      ratio: comparison.ratio,
      status: comparison.status,
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDicomDate(value) {
    const text = safeString(value);
    if (/^\d{8}$/.test(text)) {
      return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    }
    return text;
  }

  function formatDicomTime(value) {
    const text = safeString(value);
    const match = text.match(/^(\d{2})(\d{2})(\d{2})?/);
    if (!match) {
      return text;
    }
    return [match[1], match[2], match[3] || "00"].join(":");
  }

  function getIterativeReconstructionHint(meta) {
    const text = [meta?.seriesDescription, meta?.protocolName, meta?.imageType, meta?.convolutionKernel]
      .filter(Boolean)
      .join(" ");
    const match = text.match(/\b(ASIR[-\s]?\w*|MBIR|VEO|ADMIRE\s*\d*|SAFIRE\s*\d*|IRIS|AIDR\s*3D|iDose\s*\d*|IMR|FIRST|DLIR\s*\w*)\b/i);
    return match ? match[0] : "";
  }

  function formatDicomValue(value, suffix = "", digits = 3) {
    if (Number.isFinite(value)) {
      return `${roundForDisplay(value, digits)}${suffix ? ` ${suffix}` : ""}`;
    }
    const text = safeString(value);
    return text || "-";
  }

  function getImportantDicomRows(dataset = getActiveDataset(), sliceIndex = state.activeSliceIndex) {
    const volume = dataset?.volume;
    const record = volume?.slices?.[sliceIndex]?.record || dataset?.meta || {};
    const meta = dataset?.meta || record || {};
    const matrix = volume ? `${volume.columns} x ${volume.rows} x ${volume.depth}` : `${meta.columns || "-"} x ${meta.rows || "-"}`;
    const spacing = volume
      ? `${formatDicomValue(volume.columnSpacing, "mm", 4)} x ${formatDicomValue(volume.rowSpacing, "mm", 4)}`
      : formatSpacing(meta.pixelSpacing);
    const kernelReference = kernelReferenceSummary(dataset);
    return [
      ["Reconstruction", dataset ? datasetLabel(dataset, state.datasets.findIndex((entry) => entry.id === dataset.id)) : ""],
      ["Series", meta.seriesDescription || record.seriesDescription],
      ["Protocol", meta.protocolName || record.protocolName],
      ["Series #", meta.seriesNumber ?? record.seriesNumber],
      ["Manufacturer", meta.manufacturer || record.manufacturer],
      ["Model", meta.manufacturerModelName || record.manufacturerModelName],
      ["Station", meta.stationName || record.stationName],
      ["Kernel", meta.convolutionKernel || record.convolutionKernel],
      ["Kernel MTF ref", formatKernelMtfReference(kernelReference.reference)],
      ["rhoMax", kernelReference.rhoMax, "lp/cm", 2],
      ["rhoMax/ref", Number.isFinite(kernelReference.ratio) ? `${roundForDisplay(kernelReference.ratio, 3)} (${formatKernelSamplingStatus(kernelReference.status)})` : formatKernelSamplingStatus(kernelReference.status)],
      ["IR hint", meta.iterativeReconstruction || getIterativeReconstructionHint(meta)],
      ["kVp", meta.kvp ?? record.kvp, "kV", 1],
      ["Tube current", meta.tubeCurrent ?? record.tubeCurrent, "mA", 1],
      ["Exposure time", meta.exposureTime ?? record.exposureTime, "ms", 1],
      ["CTDIvol", meta.ctdiVol ?? record.ctdiVol, "mGy", 3],
      ["Slice thickness", meta.sliceThickness ?? record.sliceThickness, "mm", 3],
      ["Pixel spacing", spacing],
      ["Matrix", matrix],
      ["Slice", volume ? `${sliceIndex + 1} / ${volume.depth}` : "-"],
      ["WW / WL", `${Math.round(state.viewport.windowWidth)} / ${Math.round(state.viewport.windowCenter)}`],
      ["Study date", formatDicomDate(meta.studyDate || record.studyDate)],
      ["Study time", formatDicomTime(meta.studyTime || record.studyTime)],
      ["Patient/Study ID", meta.patientId || record.patientId],
      ["Rescale", `slope ${formatDicomValue(meta.rescaleSlope ?? record.rescaleSlope, "", 4)} / intercept ${formatDicomValue(meta.rescaleIntercept ?? record.rescaleIntercept, "", 3)}`],
    ].filter((row) => safeString(row[1]) || Number.isFinite(row[1]));
  }

  function dicomRowsToHtml(rows) {
    return `
      <dl class="dicom-info-grid">
        ${(rows || [])
          .map(([label, value, suffix, digits]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(formatDicomValue(value, suffix, digits))}</dd>`)
          .join("")}
      </dl>
    `;
  }

  function updateSelectionDetail() {
    const roi = getSelectedRoi();
    const circle = getSelectedCircle();
    if (!roi && !circle) {
      els.selectionNote.textContent = "Nothing selected";
      els.selectionDetail.innerHTML = '<p class="empty-copy">Right-click an overlay or choose an item from the list.</p>';
      return;
    }
    if (circle) {
      const analysis = getNpsAnalysisForCircle(circle);
      const dataset = state.datasets.find((entry) => entry.id === circle.datasetId) || getActiveDataset();
      const kernelReference = kernelReferenceSummary(dataset);
      els.selectionNote.textContent = `${circle.label} · ${circle.generated ? "generated" : "circle only"}`;
      els.selectionDetail.innerHTML = `
        <div class="detail-grid">
          <div><dt>Label</dt><dd><input id="np-selected-label" type="text" value="${escapeAttr(circle.label)}" /></dd></div>
          <div><dt>Radius</dt><dd>${formatMetric(circle.radiusPx, "px", 1)}</dd></div>
          <div><dt>NPS Set</dt><dd>${analysis?.circleCount || 1} circle${(analysis?.circleCount || 1) === 1 ? "" : "s"}</dd></div>
          <div><dt>Squares Used</dt><dd>${analysis?.validRoiCount || 0} / ${analysis?.sourceRoiCount || 0}</dd></div>
          <div><dt>NPS Edge</dt><dd>${circle.roiEdgePx} px</dd></div>
          <div><dt>std</dt><dd>${formatMetric(Math.sqrt(analysis?.meanRoiVariance), analysis?.units, 3)}</dd></div>
          <div><dt>var</dt><dd>${formatMetric(analysis?.meanRoiVariance, `${analysis?.units || "HU"}^2`, 3)}</dd></div>
          <div><dt>Integrated NPS</dt><dd>${formatMetric(analysis?.integratedNps, analysis?.npsUnits, 4)}</dd></div>
          <div><dt>fP / fpeak</dt><dd>${formatMetric(analysis?.peakFrequency, "mm^-1", 4)}</dd></div>
          <div><dt>fA / fav</dt><dd>${formatMetric(analysis?.averageFrequency, "mm^-1", 4)}</dd></div>
          <div><dt>f10 tail</dt><dd>${formatMetric(analysis?.f10TailFrequency, "mm^-1", 4)}</dd></div>
          <div><dt>f10 cum.</dt><dd>${formatMetric(analysis?.f10Frequency, "mm^-1", 4)}</dd></div>
          <div><dt>f50 cum.</dt><dd>${formatMetric(analysis?.f50Frequency, "mm^-1", 4)}</dd></div>
          <div><dt>f90 cum.</dt><dd>${formatMetric(analysis?.f90Frequency, "mm^-1", 4)}</dd></div>
          <div><dt>rhoMax</dt><dd>${formatMetric(kernelReference.rhoMax, "lp/cm", 2)}</dd></div>
          <div><dt>rho10 ref</dt><dd>${formatMetric(kernelReference.reference?.rho10LpCm, "lp/cm", 2)}</dd></div>
          <div><dt>rhoMax/ref</dt><dd>${Number.isFinite(kernelReference.ratio) ? `${roundForDisplay(kernelReference.ratio, 3)} · ${escapeHtml(formatKernelSamplingStatus(kernelReference.status))}` : escapeHtml(formatKernelSamplingStatus(kernelReference.status))}</dd></div>
        </div>
        ${circle.warnings?.length || analysis?.warnings?.length ? `<p class="warning-note">${[...(circle.warnings || []), ...(analysis?.warnings || [])].join(", ")}</p>` : ""}
      `;
      bindSelectedLabelInput(circle);
      updateNpsSummary(circle, analysis);
      return;
    }
    const analysis = getAnalysisForRoi(roi);
    const stats = analysis?.statsCalibrated || {};
    const geometry = analysis?.geometry || {};
    const ttf = analysis?.ttfAnalysis || {};
    const dataset = state.datasets.find((entry) => entry.id === roi.datasetId) || getActiveDataset();
    const kernelReference = kernelReferenceSummary(dataset);
    const warningLabels = [...(analysis?.warnings || []), ...(ttf.warnings || [])];
    els.selectionNote.textContent = `${roi.label} · ${roi.type === NPS_ROI_TYPE ? "NPS square" : "TTF square"}`;
    els.selectionDetail.innerHTML = `
      <div class="detail-grid">
        <div><dt>Label</dt><dd><input id="np-selected-label" type="text" value="${escapeAttr(roi.label)}" ${roi.type === NPS_ROI_TYPE ? "disabled" : ""} /></dd></div>
        <div><dt>Edge</dt><dd>${formatMetric(roi.edgePx, "px", 0)}</dd></div>
        <div><dt>Mean</dt><dd>${formatMetric(stats.mean, analysis?.units, 3)}</dd></div>
        <div><dt>SD</dt><dd>${formatMetric(stats.sd, analysis?.units, 3)}</dd></div>
        <div><dt>Variance</dt><dd>${formatMetric(stats.variance, `${analysis?.units || "HU"}^2`, 3)}</dd></div>
        <div><dt>Median / IQR</dt><dd>${formatMetric(stats.median, analysis?.units, 2)} / ${formatMetric(stats.iqr, analysis?.units, 2)}</dd></div>
        <div><dt>Area</dt><dd>${formatMetric(geometry.areaMm2, "mm2", 2)}</dd></div>
        <div><dt>Pixels</dt><dd>${geometry.selectedRowCount || 0} x ${geometry.selectedColumnCount || 0}</dd></div>
        <div><dt>Skew / Kurt</dt><dd>${formatMetric(stats.skewness, "", 3)} / ${formatMetric(stats.kurtosis, "", 3)}</dd></div>
        <div><dt>Detrended SD</dt><dd>${formatMetric(analysis?.residualDetrendedSd, analysis?.units, 3)}</dd></div>
        <div><dt>TTFxy</dt><dd>${roi.type === ROI_TYPE ? (ttf.valid ? "valid edge" : escapeHtml(ttf.error || "invalid / no usable edge")) : "-"}</dd></div>
        <div><dt>TTF f10 / f50</dt><dd>${formatMetric(ttf.f10Frequency, "mm^-1", 4)} / ${formatMetric(ttf.f50Frequency, "mm^-1", 4)}</dd></div>
        <div><dt>rho10 / rhoMax</dt><dd>${formatMetric(ttf.rho10LpCm, "lp/cm", 2)} / ${formatMetric(ttf.rhoMaxLpCm, "lp/cm", 2)}</dd></div>
        <div><dt>rho10 ref</dt><dd>${formatMetric(kernelReference.reference?.rho10LpCm, "lp/cm", 2)}</dd></div>
        <div><dt>rhoMax/ref</dt><dd>${Number.isFinite(kernelReference.ratio) ? `${roundForDisplay(kernelReference.ratio, 3)} · ${escapeHtml(formatKernelSamplingStatus(kernelReference.status))}` : escapeHtml(formatKernelSamplingStatus(kernelReference.status))}</dd></div>
        <div><dt>TTF CNR</dt><dd>${formatMetric(ttf.cnr, "", 3)}</dd></div>
      </div>
      ${warningLabels.length ? `<p class="warning-note">${escapeHtml(Array.from(new Set(warningLabels)).join(", "))}</p>` : ""}
    `;
    bindSelectedLabelInput(roi);
  }

  function escapeAttr(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function normalizePlotColor(value, fallback) {
    const cleanValue = String(safeString(value) || "").trim();
    const match = cleanValue.match(/^#?([0-9a-f]{6})$/i);
    if (match) {
      return `#${match[1].toLowerCase()}`;
    }
    return fallback || PLOT_PALETTE[0];
  }

  function getSeriesColorPaletteMarkup(selectedColor, label) {
    const normalizedSelected = normalizePlotColor(selectedColor, PLOT_PALETTE[0]);
    return `
      <div class="series-color-picker" data-series-color-picker>
        <button
          class="series-color-selected"
          data-series-color-toggle
          type="button"
          aria-expanded="false"
          aria-label="Color for ${escapeAttr(label)}"
          title="Change series color"
          style="--swatch-color:${escapeAttr(normalizedSelected)}"
        >
          <span class="series-color-selected-band" aria-hidden="true"></span>
        </button>
        <div class="series-color-palette" data-series-color-palette role="radiogroup" aria-label="Series color">
          ${PLOT_PALETTE.map((color, index) => {
            const normalizedColor = normalizePlotColor(color, PLOT_PALETTE[0]);
            const isSelected = normalizedColor === normalizedSelected;
            return `
              <button
                class="series-color-swatch ${isSelected ? "is-selected" : ""}"
                data-series-color="${escapeAttr(normalizedColor)}"
                type="button"
                role="radio"
                aria-checked="${isSelected ? "true" : "false"}"
                title="Use palette color ${index + 1}"
                style="--swatch-color:${escapeAttr(normalizedColor)}"
              ></button>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function setSeriesColorPickerOpen(picker, isOpen) {
    if (!picker) {
      return;
    }
    picker.classList.toggle("is-open", Boolean(isOpen));
    picker.querySelector("[data-series-color-toggle]")?.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function closeSeriesColorPickers(exceptPicker) {
    document.querySelectorAll("[data-series-color-picker].is-open").forEach((picker) => {
      if (picker !== exceptPicker) {
        setSeriesColorPickerOpen(picker, false);
      }
    });
  }

  function setSeriesColorPickerValue(picker, color) {
    const normalizedColor = normalizePlotColor(color, PLOT_PALETTE[0]);
    picker?.querySelector("[data-series-color-toggle]")?.style.setProperty("--swatch-color", normalizedColor);
    picker?.querySelectorAll("[data-series-color]").forEach((button) => {
      const isSelected = normalizePlotColor(button.dataset.seriesColor, "") === normalizedColor;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-checked", isSelected ? "true" : "false");
    });
    return normalizedColor;
  }

  function bindSeriesColorPicker(row, onChange) {
    const picker = row.querySelector("[data-series-color-picker]");
    if (!picker) {
      return;
    }
    picker.addEventListener("click", (event) => {
      const colorToggle = event.target.closest("[data-series-color-toggle]");
      if (colorToggle) {
        const shouldOpen = !picker.classList.contains("is-open");
        closeSeriesColorPickers(picker);
        setSeriesColorPickerOpen(picker, shouldOpen);
        event.preventDefault();
        return;
      }
      const colorButton = event.target.closest("[data-series-color]");
      if (colorButton) {
        const color = setSeriesColorPickerValue(picker, colorButton.dataset.seriesColor);
        setSeriesColorPickerOpen(picker, false);
        onChange(color);
        event.preventDefault();
      }
    });
  }

  function bindSelectedLabelInput(object) {
    const input = document.getElementById("np-selected-label");
    if (!input || input.disabled) {
      return;
    }
    input.addEventListener("change", () => {
      pushHistory();
      object.label = safeString(input.value) || object.label;
      object.updatedAt = new Date().toISOString();
      updateUi();
      render();
    });
  }

  function isEditableEventTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    if (target.closest("[contenteditable='true']")) {
      return true;
    }
    const tagName = target.tagName.toLowerCase();
    if (tagName === "textarea" || tagName === "select") {
      return true;
    }
    if (tagName !== "input") {
      return false;
    }
    const type = String(target.getAttribute("type") || "text").toLowerCase();
    return !["button", "checkbox", "color", "file", "radio", "range", "reset", "submit"].includes(type);
  }

  function updateNpsSummary(circle, analysis) {
    if (!circle) {
      els.npsSummary.innerHTML = '<p class="empty-copy">No NPS circle selected.</p>';
      return;
    }
    if (!analysis || analysis.error || !analysis.validRoiCount) {
      els.npsSummary.innerHTML = `<p><strong>${circle.label}</strong></p><p>No valid NPS yet. Generate squares inside the selected circle.</p>`;
      return;
    }
    const dataset = state.datasets.find((entry) => entry.id === circle.datasetId) || getActiveDataset();
    const kernelReference = kernelReferenceSummary(dataset);
    els.npsSummary.innerHTML = `
      <p><strong>${circle.label}</strong> · ${analysis.circleCount || 1} circle${(analysis.circleCount || 1) === 1 ? "" : "s"} · ${analysis.validRoiCount} / ${analysis.sourceRoiCount || analysis.validRoiCount} valid squares</p>
      <p>std ${formatMetric(Math.sqrt(analysis.meanRoiVariance), analysis.units, 3)} · var ${formatMetric(analysis.meanRoiVariance, `${analysis.units}^2`, 3)}</p>
      <p>fA/fav ${formatMetric(analysis.averageFrequency, "mm^-1", 4)} · fP/fpeak ${formatMetric(analysis.peakFrequency, "mm^-1", 4)}</p>
      <p>f10 tail ${formatMetric(analysis.f10TailFrequency, "mm^-1", 4)}</p>
      <p>f10/f50/f90 cumulative ${formatMetric(analysis.f10Frequency, "mm^-1", 4)} / ${formatMetric(analysis.f50Frequency, "mm^-1", 4)} / ${formatMetric(analysis.f90Frequency, "mm^-1", 4)}</p>
      <p>rhoMax ${formatMetric(analysis.rhoMaxLpCm, "lp/cm", 2)} · rho10 ref ${formatMetric(kernelReference.reference?.rho10LpCm, "lp/cm", 2)}</p>
      <p>Integrated NPS ${formatMetric(analysis.integratedNps, analysis.npsUnits, 4)}</p>
    `;
  }

  function normalizeSeriesNumber(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return String(numeric);
    }
    return safeString(value);
  }

  function analysisSeriesNumber(dataset) {
    return normalizeSeriesNumber(dataset?.meta?.seriesNumber);
  }

  function analysisDatasetLabel(dataset, index = 0) {
    const label = datasetLabel(dataset, index);
    const seriesNumber = analysisSeriesNumber(dataset);
    return seriesNumber ? `S${seriesNumber} · ${label}` : label;
  }

  function ensureLabelHasSeriesNumber(label, dataset, index = 0) {
    const fallback = datasetLabel(dataset, index);
    const text = safeString(label) || fallback;
    const seriesNumber = analysisSeriesNumber(dataset);
    if (!seriesNumber) {
      return text;
    }
    const escapedSeries = seriesNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const alreadyTagged = new RegExp(`\\bS\\s*${escapedSeries}\\b|\\bSeries\\s*#?\\s*${escapedSeries}\\b`, "i").test(text);
    return alreadyTagged ? text : `S${seriesNumber} · ${text}`;
  }

  function analysisRowReconLabel(row) {
    const label = safeString(row?.reconstruction_label) || safeString(row?.reconstruction) || "Recon";
    const seriesNumber = normalizeSeriesNumber(row?.series_number);
    if (!seriesNumber) {
      return label;
    }
    const escapedSeries = seriesNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\bS\\s*${escapedSeries}\\b|\\bSeries\\s*#?\\s*${escapedSeries}\\b`, "i").test(label)) {
      return label;
    }
    return `S${seriesNumber} · ${label}`;
  }

  function modelSeriesKey(model) {
    return `${model?.dataset?.id || "dataset"}::${model?.circle?.id || "circle"}`;
  }

  function seriesDatasetKey(model) {
    return model?.dataset?.id || "dataset";
  }

  function datasetIdFromSeriesKey(key) {
    return safeString(key).split("::")[0] || "";
  }

  function findExistingSeriesPref(datasetId) {
    if (!datasetId) {
      return null;
    }
    if (state.reconstructionPrefs[datasetId]) {
      return state.reconstructionPrefs[datasetId];
    }
    const maps = [state.seriesPrefs, state.squareProfilePrefs];
    for (const prefs of maps) {
      const foundKey = Object.keys(prefs).find((key) => datasetIdFromSeriesKey(key) === datasetId);
      if (foundKey) {
        return prefs[foundKey];
      }
    }
    return null;
  }

  function ensureReconstructionPref(model, index = 0) {
    const datasetId = seriesDatasetKey(model);
    const existing = findExistingSeriesPref(datasetId) || {};
    const fallbackColor = PLOT_PALETTE[index % PLOT_PALETTE.length];
    if (!state.reconstructionPrefs[datasetId]) {
      state.reconstructionPrefs[datasetId] = {
        label: ensureLabelHasSeriesNumber(existing.label || analysisDatasetLabel(model.dataset, model.datasetIndex), model.dataset, model.datasetIndex),
        color: normalizePlotColor(existing.color, fallbackColor),
        visible: existing.visible !== false,
        order: Number.isFinite(existing.order) ? existing.order : index,
      };
    } else {
      const pref = state.reconstructionPrefs[datasetId];
      pref.label = ensureLabelHasSeriesNumber(pref.label || analysisDatasetLabel(model.dataset, model.datasetIndex), model.dataset, model.datasetIndex);
      pref.color = normalizePlotColor(pref.color, fallbackColor);
      if (!Number.isFinite(pref.order)) {
        pref.order = Number.isFinite(existing.order) ? existing.order : index;
      }
      if (typeof pref.visible !== "boolean") {
        pref.visible = existing.visible !== false;
      }
    }
    return state.reconstructionPrefs[datasetId];
  }

  function mirrorReconstructionPrefToSeries(datasetId) {
    const source = state.reconstructionPrefs[datasetId];
    if (!source) {
      return;
    }
    [state.seriesPrefs, state.squareProfilePrefs].forEach((prefs) => {
      Object.entries(prefs).forEach(([key, pref]) => {
        if (datasetIdFromSeriesKey(key) === datasetId) {
          pref.label = source.label;
          pref.color = source.color;
          pref.visible = source.visible !== false;
          pref.order = source.order;
        }
      });
    });
  }

  function syncReconstructionPrefFromSeriesKey(key, patch) {
    const datasetId = datasetIdFromSeriesKey(key);
    if (!datasetId) {
      return;
    }
    const current = state.reconstructionPrefs[datasetId] || {};
    state.reconstructionPrefs[datasetId] = {
      label: patch.label ?? current.label,
      color: patch.color ?? current.color,
      visible: patch.visible ?? current.visible ?? true,
      order: patch.order ?? current.order ?? 0,
    };
    mirrorReconstructionPrefToSeries(datasetId);
  }

  function syncReconstructionPrefsForModels(models, prefs, keyFn) {
    const syncedDatasetIds = new Set();
    sortModelsByPrefs(models, prefs, keyFn).forEach((model, index) => {
      const key = keyFn(model);
      if (!prefs[key]) {
        return;
      }
      prefs[key].order = index;
      const datasetId = datasetIdFromSeriesKey(key);
      if (!datasetId || syncedDatasetIds.has(datasetId)) {
        return;
      }
      syncedDatasetIds.add(datasetId);
      syncReconstructionPrefFromSeriesKey(key, {
        label: prefs[key].label,
        color: prefs[key].color,
        visible: prefs[key].visible !== false,
        order: prefs[key].order,
      });
    });
  }

  function findSeriesKeyForDataset(prefs, datasetId) {
    return Object.keys(prefs || {}).find((key) => datasetIdFromSeriesKey(key) === datasetId) || "";
  }

  function syncReferenceDataset(key) {
    const datasetId = datasetIdFromSeriesKey(key);
    if (!datasetId) {
      return;
    }
    state.seriesReferenceKey = findSeriesKeyForDataset(state.seriesPrefs, datasetId) || state.seriesReferenceKey;
    state.squareProfileReferenceKey = findSeriesKeyForDataset(state.squareProfilePrefs, datasetId) || state.squareProfileReferenceKey;
  }

  function applyReconstructionPrefToSeries(model, prefs, keyFn, index) {
    const key = keyFn(model);
    const source = ensureReconstructionPref(model, index);
    if (!prefs[key]) {
      prefs[key] = { ...source };
    }
    prefs[key].label = source.label;
    prefs[key].color = source.color;
    prefs[key].visible = source.visible !== false;
    prefs[key].order = source.order;
    return prefs[key];
  }

  function prefOrder(pref, fallback) {
    return Number.isFinite(pref?.order) ? pref.order : fallback;
  }

  function displaySeriesLabel(pref, index) {
    return `${index + 1}. ${pref?.label || `Series ${index + 1}`}`;
  }

  function sortModelsByPrefs(models, prefs, keyFn) {
    return (models || [])
      .map((model, index) => ({ model, index, key: keyFn(model) }))
      .sort((left, right) => {
        const leftOrder = prefOrder(prefs[left.key], left.index);
        const rightOrder = prefOrder(prefs[right.key], right.index);
        return leftOrder - rightOrder || left.index - right.index;
      })
      .map((entry) => entry.model);
  }

  function normalizeSeriesOrders(models, prefs, keyFn) {
    sortModelsByPrefs(models, prefs, keyFn).forEach((model, index) => {
      const key = keyFn(model);
      if (prefs[key]) {
        prefs[key].order = index;
      }
    });
  }

  function moveSeriesKey(models, prefs, keyFn, fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) {
      return false;
    }
    const keys = sortModelsByPrefs(models, prefs, keyFn).map(keyFn);
    const fromIndex = keys.indexOf(fromKey);
    const toIndex = keys.indexOf(toKey);
    if (fromIndex < 0 || toIndex < 0) {
      return false;
    }
    const [moved] = keys.splice(fromIndex, 1);
    keys.splice(toIndex, 0, moved);
    keys.forEach((key, index) => {
      if (prefs[key]) {
        prefs[key].order = index;
      }
    });
    return true;
  }

  function moveSeriesByDelta(models, prefs, keyFn, key, delta) {
    const keys = sortModelsByPrefs(models, prefs, keyFn).map(keyFn);
    const index = keys.indexOf(key);
    const targetKey = keys[index + delta];
    return Boolean(targetKey && moveSeriesKey(models, prefs, keyFn, key, targetKey));
  }

  function resolveReferenceKey(models, prefs, keyFn, currentKey) {
    const orderedKeys = sortModelsByPrefs(models, prefs, keyFn).map(keyFn);
    if (currentKey && orderedKeys.includes(currentKey) && prefs[currentKey]?.visible !== false) {
      return currentKey;
    }
    return orderedKeys.find((key) => prefs[key]?.visible !== false) || orderedKeys[0] || "";
  }

  function getSeriesControlRows(container, rowSelector) {
    return Array.from(container?.querySelectorAll(rowSelector) || []);
  }

  function getSeriesDragAfterRow(container, rowSelector, clientY) {
    return getSeriesControlRows(container, rowSelector)
      .filter((row) => !row.classList.contains("is-dragging"))
      .reduce(
        (closest, row) => {
          const box = row.getBoundingClientRect();
          const offset = clientY - box.top - box.height / 2;
          return offset < 0 && offset > closest.offset ? { offset, row } : closest;
        },
        { offset: Number.NEGATIVE_INFINITY, row: null }
      ).row;
  }

  function syncSeriesOrderFromDom(container, rowSelector, datasetKeyName, models, prefs, keyFn, onMoved) {
    const modelKeys = new Set((models || []).map(keyFn));
    const orderedKeys = getSeriesControlRows(container, rowSelector)
      .map((row) => safeString(row.dataset[datasetKeyName]))
      .filter((key) => key && modelKeys.has(key));
    if (!orderedKeys.length || orderedKeys.length !== modelKeys.size) {
      return false;
    }
    let changed = false;
    orderedKeys.forEach((key, index) => {
      prefs[key] = prefs[key] || {};
      changed = changed || prefs[key].order !== index;
      prefs[key].order = index;
    });
    if (changed) {
      syncReconstructionPrefsForModels(models, prefs, keyFn);
      onMoved();
    }
    return changed;
  }

  function bindSeriesListOrderControls(container, rowSelector, datasetKeyName, models, prefs, keyFn, onMoved) {
    const rows = getSeriesControlRows(container, rowSelector);
    container._noisePowerSeriesOrderBinding = { rowSelector, datasetKeyName, models, prefs, keyFn, onMoved };
    const move = (key, delta) => {
      if (moveSeriesByDelta(models, prefs, keyFn, key, delta)) {
        syncReconstructionPrefsForModels(models, prefs, keyFn);
        onMoved();
      }
    };
    rows.forEach((row) => {
      const key = safeString(row.dataset[datasetKeyName]);
      const handle = row.querySelector(".series-sequence");
      row.querySelector("[data-series-move='up']")?.addEventListener("click", () => move(key, -1));
      row.querySelector("[data-series-move='down']")?.addEventListener("click", () => move(key, 1));
      if (!handle) {
        return;
      }
      handle.setAttribute("draggable", "true");
      handle.title = "Drag to reorder, or use arrow keys";
      handle.addEventListener("keydown", (event) => {
        const direction = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
        if (!direction) {
          return;
        }
        event.preventDefault();
        move(key, direction);
      });
      handle.addEventListener("dragstart", (event) => {
        state.seriesOrderDrag = { key, rowSelector, datasetKeyName };
        row.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", key);
      });
      handle.addEventListener("dragend", () => {
        rows.forEach((entry) => entry.classList.remove("is-dragging"));
        state.seriesOrderDrag = null;
      });
    });
    if (container._noisePowerSeriesOrderInstalled) {
      return;
    }
    container._noisePowerSeriesOrderInstalled = true;
    container.addEventListener("dragover", (event) => {
      const binding = container._noisePowerSeriesOrderBinding;
      if (!binding || !state.seriesOrderDrag || state.seriesOrderDrag.rowSelector !== binding.rowSelector) {
        return;
      }
      const currentRows = getSeriesControlRows(container, binding.rowSelector);
      const draggingRow = currentRows.find((row) => safeString(row.dataset[binding.datasetKeyName]) === state.seriesOrderDrag.key);
      if (!draggingRow) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const afterRow = getSeriesDragAfterRow(container, binding.rowSelector, event.clientY);
      if (!afterRow) {
        container.appendChild(draggingRow);
      } else if (afterRow !== draggingRow) {
        container.insertBefore(draggingRow, afterRow);
      }
    });
    container.addEventListener("drop", (event) => {
      const binding = container._noisePowerSeriesOrderBinding;
      if (!binding || !state.seriesOrderDrag || state.seriesOrderDrag.rowSelector !== binding.rowSelector) {
        return;
      }
      event.preventDefault();
      syncSeriesOrderFromDom(container, binding.rowSelector, binding.datasetKeyName, binding.models, binding.prefs, binding.keyFn, binding.onMoved);
      getSeriesControlRows(container, binding.rowSelector).forEach((row) => row.classList.remove("is-dragging"));
      state.seriesOrderDrag = null;
    });
  }

  function ensureSeriesPrefs(models) {
    (models || []).forEach((model, index) => {
      applyReconstructionPrefToSeries(model, state.seriesPrefs, modelSeriesKey, index);
    });
    normalizeSeriesOrders(models, state.seriesPrefs, modelSeriesKey);
    (models || []).forEach((model) => {
      const key = modelSeriesKey(model);
      syncReconstructionPrefFromSeriesKey(key, { order: state.seriesPrefs[key]?.order });
    });
  }

  function applySeriesPrefs(models, valueField) {
    const safeModels = (models || []).filter((model) => model?.dataset && model?.circle && model?.analysis);
    try {
      ensureSeriesPrefs(safeModels);
      state.seriesReferenceKey = resolveReferenceKey(safeModels, state.seriesPrefs, modelSeriesKey, state.seriesReferenceKey);
    } catch (error) {
      console.error("Could not prepare NPS series preferences.", error);
    }
    return sortModelsByPrefs(safeModels, state.seriesPrefs, modelSeriesKey)
      .map((model, index) => {
        const key = modelSeriesKey(model);
        const pref =
          state.seriesPrefs[key] ||
          applyReconstructionPrefToSeries(model, state.seriesPrefs, modelSeriesKey, index) || {
            label: analysisDatasetLabel(model.dataset, model.datasetIndex),
            color: PLOT_PALETTE[index % PLOT_PALETTE.length],
            visible: true,
          };
        return {
          label: displaySeriesLabel(pref, index),
          color: normalizePlotColor(pref.color, PLOT_PALETTE[model.datasetIndex % PLOT_PALETTE.length]),
          hidden: pref.visible === false,
          points: (model.analysis.radialBins || []).map((bin) => ({
            x: bin.frequencyCenter,
            y: bin[valueField],
          })),
        };
      })
      .filter((entry) => !entry.hidden);
  }

  function updateSeriesControls(models) {
    if (!els.seriesControls) {
      return;
    }
    try {
      const safeModels = (models || []).filter((model) => model?.dataset && model?.circle && model?.analysis);
      ensureSeriesPrefs(safeModels);
      const orderedModels = sortModelsByPrefs(safeModels, state.seriesPrefs, modelSeriesKey);
      state.seriesReferenceKey = resolveReferenceKey(orderedModels, state.seriesPrefs, modelSeriesKey, state.seriesReferenceKey);
      if (!safeModels.length) {
        els.seriesControls.innerHTML = '<p class="empty-copy">No NPS curve sets for the selected circle yet. Select the generated circle or press Copy To All Recons after generating NPS squares.</p>';
        return;
      }
      els.seriesControls.innerHTML = orderedModels
        .map((model, index) => {
          const key = modelSeriesKey(model);
          const pref =
            state.seriesPrefs[key] ||
            applyReconstructionPrefToSeries(model, state.seriesPrefs, modelSeriesKey, index) || {
              label: analysisDatasetLabel(model.dataset, model.datasetIndex),
              color: PLOT_PALETTE[index % PLOT_PALETTE.length],
              visible: true,
            };
          const analysis = model.analysis || {};
          return `
            <div class="series-control-row" data-series-key="${escapeAttr(key)}">
              <div class="series-order-control">
                <button class="series-sequence" type="button" aria-label="Use arrow keys to reorder ${escapeAttr(pref.label)}">#${index + 1}</button>
                <button class="series-order-button" data-series-move="up" type="button" ${index === 0 ? "disabled" : ""} aria-label="Move ${escapeAttr(pref.label)} up">Up</button>
                <button class="series-order-button" data-series-move="down" type="button" ${index === orderedModels.length - 1 ? "disabled" : ""} aria-label="Move ${escapeAttr(pref.label)} down">Dn</button>
              </div>
              <input type="checkbox" class="np-series-visible" ${pref.visible === false ? "" : "checked"} aria-label="Show ${escapeAttr(pref.label)}" />
              <label class="series-reference-choice" title="Use as reference in paper table">
                <input type="radio" class="np-series-reference" name="np-series-reference" ${state.seriesReferenceKey === key ? "checked" : ""} aria-label="Use ${escapeAttr(pref.label)} as reference" />
                <span>Ref</span>
              </label>
              ${getSeriesColorPaletteMarkup(pref.color, pref.label)}
              <input type="text" class="np-series-label" value="${escapeAttr(pref.label)}" aria-label="Label for ${escapeAttr(pref.label)}" />
              <span class="series-metric-chip">SD ${formatMetric(analysis.noiseMagnitude, analysis.units, 1)} · fP ${formatMetric(analysis.peakFrequency, "mm^-1", 3)}</span>
            </div>
          `;
        })
        .join("");
      bindSeriesListOrderControls(
        els.seriesControls,
        ".series-control-row[data-series-key]",
        "seriesKey",
        safeModels,
        state.seriesPrefs,
        modelSeriesKey,
        scheduleAnalysisRefresh
      );
      els.seriesControls.querySelectorAll("[data-series-key]").forEach((row) => {
        const key = row.dataset.seriesKey;
        const visible = row.querySelector(".np-series-visible");
        const reference = row.querySelector(".np-series-reference");
        const label = row.querySelector(".np-series-label");
        visible?.addEventListener("change", () => {
          state.seriesPrefs[key] = state.seriesPrefs[key] || {};
          state.seriesPrefs[key].visible = visible.checked;
          syncReconstructionPrefFromSeriesKey(key, { visible: visible.checked });
          scheduleAnalysisRefresh();
        });
        reference?.addEventListener("change", () => {
          if (reference.checked) {
            state.seriesReferenceKey = key;
            syncReferenceDataset(key);
            scheduleAnalysisRefresh();
          }
        });
        bindSeriesColorPicker(row, (color) => {
          state.seriesPrefs[key] = state.seriesPrefs[key] || {};
          state.seriesPrefs[key].color = color;
          syncReconstructionPrefFromSeriesKey(key, { color });
          scheduleAnalysisRefresh();
        });
        label?.addEventListener("change", () => {
          state.seriesPrefs[key] = state.seriesPrefs[key] || {};
          state.seriesPrefs[key].label = safeString(label.value) || state.seriesPrefs[key].label;
          syncReconstructionPrefFromSeriesKey(key, { label: state.seriesPrefs[key].label });
          scheduleAnalysisRefresh();
        });
      });
    } catch (error) {
      console.error("Could not render NPS series controls.", error);
      els.seriesControls.innerHTML = `<p class="warning-note">NPS curves were computed, but the series controls could not render: ${escapeHtml(error?.message || String(error))}</p>`;
    }
  }

  function profileGroupRootId(roi) {
    return roi?.copiedFromRoiId || roi?.id || "";
  }

  function getRelatedSquareProfileModels(seedRoi) {
    const selected = seedRoi?.type === ROI_TYPE ? seedRoi : null;
    const fallback = state.rois.find((roi) => roi.datasetId === state.activeDatasetId && roi.type === ROI_TYPE);
    const roi = selected || fallback;
    if (!roi) {
      return [];
    }
    const rootId = profileGroupRootId(roi);
    const trueRootId = getRoiGroupRootId(roi);
    let related = state.rois.filter(
      (entry) =>
        entry.type === ROI_TYPE &&
        (getRoiGroupRootId(entry) === trueRootId ||
          entry.id === rootId ||
          entry.copiedFromRoiId === rootId ||
          entry.id === roi.id ||
          entry.copiedFromRoiId === roi.id)
    );
    if (related.length < 2) {
      related = state.rois.filter((entry) => entry.type === ROI_TYPE && entry.label === roi.label);
    }
    const datasetIndexById = new Map(state.datasets.map((dataset, index) => [dataset.id, index]));
    return related
      .map((entry) => {
        const dataset = state.datasets.find((item) => item.id === entry.datasetId);
        const extraction = getAnalysisForRoi(entry);
        const profile = extraction?.profileAnalysis?.profilesByType?.["horizontal-center"];
        if (!dataset || !profile) {
          return null;
        }
        return {
          roi: entry,
          dataset,
          datasetIndex: datasetIndexById.get(dataset.id) ?? 0,
          extraction,
          profile,
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.datasetIndex - right.datasetIndex || String(left.roi.label).localeCompare(String(right.roi.label)));
  }

  function squareProfileSeriesKey(model) {
    return `${model?.dataset?.id || "dataset"}::${model?.roi?.id || "roi"}`;
  }

  function ensureSquareProfilePrefs(models) {
    (models || []).forEach((model, index) => {
      applyReconstructionPrefToSeries(model, state.squareProfilePrefs, squareProfileSeriesKey, index);
    });
    normalizeSeriesOrders(models, state.squareProfilePrefs, squareProfileSeriesKey);
    (models || []).forEach((model) => {
      const key = squareProfileSeriesKey(model);
      syncReconstructionPrefFromSeriesKey(key, { order: state.squareProfilePrefs[key]?.order });
    });
  }

  function squareProfileSeriesFromModels(models) {
    const safeModels = (models || []).filter((model) => model?.dataset && model?.roi && model?.profile);
    try {
      ensureSquareProfilePrefs(safeModels);
      state.squareProfileReferenceKey = resolveReferenceKey(
        safeModels,
        state.squareProfilePrefs,
        squareProfileSeriesKey,
        state.squareProfileReferenceKey
      );
    } catch (error) {
      console.error("Could not prepare TTF square profile preferences.", error);
    }
    return sortModelsByPrefs(safeModels, state.squareProfilePrefs, squareProfileSeriesKey)
      .map((model, index) => {
        const pref = state.squareProfilePrefs[squareProfileSeriesKey(model)] || {};
        return {
          label: displaySeriesLabel(pref, index),
          color: normalizePlotColor(pref.color, PLOT_PALETTE[model.datasetIndex % PLOT_PALETTE.length]),
          hidden: pref.visible === false,
          points: (model.profile.samples || []).map((sample) => ({
            x: Number.isFinite(sample.distanceMm) ? sample.distanceMm : sample.sampleIndex,
            y: sample.value,
          })),
        };
      })
      .filter((entry) => !entry.hidden);
  }

  function ttfSeriesFromModels(models, curveType) {
    const safeModels = (models || []).filter((model) => model?.dataset && model?.roi && model?.profile);
    try {
      ensureSquareProfilePrefs(safeModels);
    } catch (error) {
      console.error("Could not prepare TTFxy curve preferences.", error);
    }
    return sortModelsByPrefs(safeModels, state.squareProfilePrefs, squareProfileSeriesKey)
      .map((model, index) => {
        const pref = state.squareProfilePrefs[squareProfileSeriesKey(model)] || {};
        const ttf = model.extraction?.ttfAnalysis;
        const points =
          ttf?.valid && curveType === "esf"
            ? (ttf.esf || []).map((point) => ({ x: point.distanceMm, y: point.normalizedValue }))
            : ttf?.valid
              ? (ttf.ttf || []).map((point) => ({ x: point.frequencyMmMinus1, y: point.ttf }))
              : [];
        return {
          label: displaySeriesLabel(pref, index),
          color: normalizePlotColor(pref.color, PLOT_PALETTE[model.datasetIndex % PLOT_PALETTE.length]),
          hidden: pref.visible === false,
          points,
        };
      })
      .filter((entry) => !entry.hidden && entry.points.length);
  }

  function updateSquareProfileControls(models) {
    if (!els.profileSeriesControls) {
      return;
    }
    try {
      const safeModels = (models || []).filter((model) => model?.dataset && model?.roi && model?.profile);
      ensureSquareProfilePrefs(safeModels);
      const orderedModels = sortModelsByPrefs(safeModels, state.squareProfilePrefs, squareProfileSeriesKey);
      state.squareProfileReferenceKey = resolveReferenceKey(
        orderedModels,
        state.squareProfilePrefs,
        squareProfileSeriesKey,
        state.squareProfileReferenceKey
      );
      if (!safeModels.length) {
        els.profileSeriesControls.innerHTML = '<p class="empty-copy">Select or place a TTF square ROI to show source-pixel mean, SD, profiles, histogram, and TTF status.</p>';
        return;
      }
      els.profileSeriesControls.innerHTML = orderedModels
        .map((model, index) => {
          const key = squareProfileSeriesKey(model);
          const pref =
            state.squareProfilePrefs[key] ||
            applyReconstructionPrefToSeries(model, state.squareProfilePrefs, squareProfileSeriesKey, index) || {
              label: analysisDatasetLabel(model.dataset, model.datasetIndex),
              color: PLOT_PALETTE[index % PLOT_PALETTE.length],
              visible: true,
            };
          const stats = model.extraction?.statsCalibrated || {};
          const ttf = model.extraction?.ttfAnalysis || {};
          const ttfMetric = ttf.valid
            ? ` · TTF f50 ${formatMetric(ttf.f50Frequency, "mm^-1", 4)}`
            : ttf.error
              ? " · TTF invalid"
              : "";
          return `
            <div class="series-control-row" data-profile-series-key="${escapeAttr(key)}">
              <div class="series-order-control">
                <button class="series-sequence" type="button" aria-label="Use arrow keys to reorder ${escapeAttr(pref.label)}">#${index + 1}</button>
                <button class="series-order-button" data-series-move="up" type="button" ${index === 0 ? "disabled" : ""} aria-label="Move ${escapeAttr(pref.label)} up">Up</button>
                <button class="series-order-button" data-series-move="down" type="button" ${index === orderedModels.length - 1 ? "disabled" : ""} aria-label="Move ${escapeAttr(pref.label)} down">Dn</button>
              </div>
              <input type="checkbox" class="np-profile-visible" ${pref.visible === false ? "" : "checked"} aria-label="Show ${escapeAttr(pref.label)}" />
              <label class="series-reference-choice" title="Use as reference in paper table">
                <input type="radio" class="np-profile-reference" name="np-profile-reference" ${state.squareProfileReferenceKey === key ? "checked" : ""} aria-label="Use ${escapeAttr(pref.label)} as reference" />
                <span>Ref</span>
              </label>
              ${getSeriesColorPaletteMarkup(pref.color, pref.label)}
              <input type="text" class="np-profile-label" value="${escapeAttr(pref.label)}" aria-label="Label for ${escapeAttr(pref.label)}" />
              <span class="series-metric-chip">Mean ${formatMetric(stats.mean, model.extraction?.units, 2)} · SD ${formatMetric(stats.sd, model.extraction?.units, 2)}${ttfMetric}</span>
            </div>
          `;
        })
        .join("");
      bindSeriesListOrderControls(
        els.profileSeriesControls,
        ".series-control-row[data-profile-series-key]",
        "profileSeriesKey",
        safeModels,
        state.squareProfilePrefs,
        squareProfileSeriesKey,
        scheduleAnalysisRefresh
      );
      els.profileSeriesControls.querySelectorAll("[data-profile-series-key]").forEach((row) => {
        const key = row.dataset.profileSeriesKey;
        const visible = row.querySelector(".np-profile-visible");
        const reference = row.querySelector(".np-profile-reference");
        const label = row.querySelector(".np-profile-label");
        visible?.addEventListener("change", () => {
          state.squareProfilePrefs[key] = state.squareProfilePrefs[key] || {};
          state.squareProfilePrefs[key].visible = visible.checked;
          syncReconstructionPrefFromSeriesKey(key, { visible: visible.checked });
          scheduleAnalysisRefresh();
        });
        reference?.addEventListener("change", () => {
          if (reference.checked) {
            state.squareProfileReferenceKey = key;
            syncReferenceDataset(key);
            scheduleAnalysisRefresh();
          }
        });
        bindSeriesColorPicker(row, (color) => {
          state.squareProfilePrefs[key] = state.squareProfilePrefs[key] || {};
          state.squareProfilePrefs[key].color = color;
          syncReconstructionPrefFromSeriesKey(key, { color });
          scheduleAnalysisRefresh();
        });
        label?.addEventListener("change", () => {
          state.squareProfilePrefs[key] = state.squareProfilePrefs[key] || {};
          state.squareProfilePrefs[key].label = safeString(label.value) || state.squareProfilePrefs[key].label;
          syncReconstructionPrefFromSeriesKey(key, { label: state.squareProfilePrefs[key].label });
          scheduleAnalysisRefresh();
        });
      });
    } catch (error) {
      console.error("Could not render TTF square ROI profile controls.", error);
      els.profileSeriesControls.innerHTML = `<p class="warning-note">TTF square statistics were computed, but the profile controls could not render: ${escapeHtml(error?.message || String(error))}</p>`;
    }
  }

  function syncAnalysisCanvases() {
    [
      els.profileCanvas,
      els.histogramCanvas,
      els.ttfEsfCanvas,
      els.ttfCurveCanvas,
      els.npsHeatmapCanvas,
      els.npsCurveCanvas,
      els.npsNormalizedCanvas,
      els.npsCumulativeCanvas,
      els.comparisonCanvas,
    ].forEach((canvas) => {
      if (canvas) {
        syncCanvasSize(canvas);
      }
    });
  }

  function updateNpsAnalysisStatus(circle, analysis, models) {
    if (!els.npsAnalysisStatus) {
      return;
    }
    els.npsAnalysisStatus.classList.remove("is-ready", "is-warning");
    if (!circle) {
      els.npsAnalysisStatus.textContent = "Select or generate a Noise Power circle to review NPS curves.";
      return;
    }
    if (!analysis || analysis.error || !analysis.validRoiCount) {
      els.npsAnalysisStatus.classList.add("is-warning");
      els.npsAnalysisStatus.textContent = `${circle.label}: NPS could not be computed yet. ${analysis?.error || "No valid square NPS ROIs were found for this circle set."}`;
      return;
    }
    const reconstructionCount = Array.isArray(models) ? models.length : 0;
    els.npsAnalysisStatus.classList.add(reconstructionCount ? "is-ready" : "is-warning");
    els.npsAnalysisStatus.textContent = `${circle.label}: ${analysis.circleCount || 1} circle${(analysis.circleCount || 1) === 1 ? "" : "s"}, ${analysis.validRoiCount} / ${analysis.sourceRoiCount || analysis.validRoiCount} valid square NPS ROIs, std ${formatMetric(Math.sqrt(analysis.meanRoiVariance), analysis.units, 2)}, fP ${formatMetric(analysis.peakFrequency, "mm^-1", 4)}. ${reconstructionCount ? `${reconstructionCount} reconstruction curve set${reconstructionCount === 1 ? "" : "s"} ready below.` : "No comparison curves were generated."}`;
  }

  function updateAnalysisCanvases() {
    if (els.analysisPage?.hidden) {
      return;
    }
    syncAnalysisCanvases();
    const selectedRoi = getSelectedRoi();
    const selectedCircle = getSelectedCircle() || getCircleForRoi(selectedRoi);
    focusAnalysisForSelection();
    const roi = selectedRoi?.type === ROI_TYPE ? selectedRoi : state.rois.find((entry) => entry.datasetId === state.activeDatasetId && entry.type === ROI_TYPE);
    const extraction = roi ? getAnalysisForRoi(roi) : null;
    const profileModels = getRelatedSquareProfileModels(roi);
    updateSquareProfileControls(profileModels);
    exportApi.drawLineSeries(els.profileCanvas.getContext("2d"), {
      width: els.profileCanvas.width,
      height: els.profileCanvas.height,
      title:
        profileModels.length > 1
          ? `${roi?.label || "TTF Square ROI"} horizontal center profiles across reconstructions`
          : roi
            ? `${roi.label} horizontal center profile`
            : "TTF Square ROI profile",
      xLabel: profileModels[0]?.profile?.spacingMm
        ? `Distance (${roundForDisplay(profileModels[0].profile.spacingMm, 3)} mm samples)`
        : "Sample index",
      yLabel: extraction?.units ? `Value (${extraction.units})` : "Value",
      theme: "dark",
      series: squareProfileSeriesFromModels(profileModels),
    });
    exportApi.drawHistogram(els.histogramCanvas.getContext("2d"), {
      width: els.histogramCanvas.width,
      height: els.histogramCanvas.height,
      title: roi ? `${roi.label} histogram` : "TTF Square ROI histogram",
      bins: extraction?.profileAnalysis?.histogram || [],
      xLabel: extraction?.units || "HU",
      theme: "dark",
    });
    exportApi.drawLineSeries(els.ttfEsfCanvas.getContext("2d"), {
      width: els.ttfEsfCanvas.width,
      height: els.ttfEsfCanvas.height,
      title: "TTFxy normalized edge-spread function",
      xLabel: "Distance from edge (mm)",
      yLabel: "Normalized ESF",
      emptyMessage: "No valid TTFxy edge ROI available",
      theme: "dark",
      series: ttfSeriesFromModels(profileModels, "esf"),
    });
    exportApi.drawLineSeries(els.ttfCurveCanvas.getContext("2d"), {
      width: els.ttfCurveCanvas.width,
      height: els.ttfCurveCanvas.height,
      title: "TTFxy in-plane task transfer function",
      xLabel: "Radial spatial frequency (mm^-1)",
      yLabel: "TTF",
      emptyMessage: "Place a square ROI across an insert edge for TTFxy",
      theme: "dark",
      series: ttfSeriesFromModels(profileModels, "ttf"),
    });

    const circle = selectedCircle || state.circles.find((entry) => entry.datasetId === state.activeDatasetId && entry.generated);
    const analysis = circle ? getNpsAnalysisForCircle(circle) : null;
    exportApi.drawNpsHeatmap(els.npsHeatmapCanvas.getContext("2d"), {
      width: els.npsHeatmapCanvas.width,
      height: els.npsHeatmapCanvas.height,
      title: circle ? `${circle.label} 2D NPS` : "2D NPS",
      analysis,
      theme: "dark",
    });
    const activeModels = buildCachedNpsModels(state.datasets, getRelatedNpsCircles(circle));
    updateNpsAnalysisStatus(circle, analysis, activeModels);
    updateSeriesControls(activeModels);
    exportApi.drawLineSeries(els.npsCurveCanvas.getContext("2d"), {
      width: els.npsCurveCanvas.width,
      height: els.npsCurveCanvas.height,
      title: "Absolute radial NPS",
      yLabel: analysis?.npsUnits || "NPS",
      theme: "dark",
      series: applySeriesPrefs(activeModels, "nps"),
    });
    exportApi.drawLineSeries(els.npsNormalizedCanvas.getContext("2d"), {
      width: els.npsNormalizedCanvas.width,
      height: els.npsNormalizedCanvas.height,
      title: "Normalized NPS",
      yLabel: "Normalized NPS",
      theme: "dark",
      series: applySeriesPrefs(activeModels, "normalizedNps"),
    });
    exportApi.drawLineSeries(els.npsCumulativeCanvas.getContext("2d"), {
      width: els.npsCumulativeCanvas.width,
      height: els.npsCumulativeCanvas.height,
      title: "Cumulative noise power",
      yLabel: "Cumulative fraction",
      theme: "dark",
      series: applySeriesPrefs(activeModels, "cumulativeFraction"),
    });
    updateComparisonPanel();
  }

  function datasetUiFields(dataset, index = 0) {
    const label = datasetLabel(dataset, index);
    const kernelReference = kernelReferenceSummary(dataset);
    return {
      reconstruction: label,
      reconstruction_label: label,
      reconstruction_index: index + 1,
      series_number: dataset?.meta?.seriesNumber ?? "",
      reconstruction_kernel: dataset?.meta?.convolutionKernel || "",
      kernel_reference: kernelReference.reference?.kernel || "",
      kernel_rho50_reference_lp_cm: kernelReference.reference?.rho50LpCm,
      kernel_rho10_reference_lp_cm: kernelReference.reference?.rho10LpCm,
      kernel_rho02_reference_lp_cm: kernelReference.reference?.rho02LpCm,
      rho_max_lp_cm_from_spacing: kernelReference.rhoMax,
      rho_max_over_kernel_rho10_reference: kernelReference.ratio,
      rho_max_kernel_sampling_status: kernelReference.status,
    };
  }

  function buildUiSquareRows() {
    const datasetById = new Map(state.datasets.map((dataset, index) => [dataset.id, { dataset, index }]));
    return state.rois
      .filter((roi) => roi.type === ROI_TYPE)
      .flatMap((roi) => {
        const entry = datasetById.get(roi.datasetId);
        if (!entry?.dataset?.volume) {
          return [];
        }
        const extraction = getAnalysisForRoi(roi);
        if (extraction?.error) {
          return [];
        }
        const stats = extraction?.statsCalibrated || {};
        const ttf = extraction?.ttfAnalysis || {};
        const warnings = Array.from(new Set([...(extraction?.warnings || []), ...(ttf.warnings || [])]));
        return [
          {
            ...datasetUiFields(entry.dataset, entry.index),
            roi_id: roi.id,
            roi_label: roi.label,
            mean_hu: stats.mean,
            sd_hu: stats.sd,
            variance_hu2: stats.variance,
            ttfxy_valid: ttf.valid ? "true" : "false",
            ttfxy_f50_mm_minus_1: ttf.f50Frequency,
            ttfxy_f10_mm_minus_1: ttf.f10Frequency,
            rho10_lp_cm: ttf.rho10LpCm,
            rho_max_lp_cm: ttf.rhoMaxLpCm,
            rho_max_over_rho10: ttf.rhoMaxOverRho10,
            ttfxy_cnr: ttf.cnr,
            warnings: warnings.join("|"),
          },
        ];
      });
  }

  function buildUiNpsMetricRows(models) {
    return (models || []).map((model) => ({
      ...datasetUiFields(model.dataset, model.datasetIndex),
      circle_id: model.circle.id,
      circle_label: model.circle.label,
      analysis_set_id: model.analysis.analysisSetId,
      circle_ids: (model.analysis.circleIds || [model.circle.id]).join("|"),
      circle_count: model.analysis.circleCount || 1,
      sd_hu: Math.sqrt(model.analysis.meanRoiVariance),
      variance_hu2: model.analysis.meanRoiVariance,
      integrated_nps: model.analysis.integratedNps,
      radial_integrated_nps: model.analysis.radialIntegratedNps,
      nyquist_frequency_mm_minus_1: model.analysis.nyquistFrequency,
      rho_max_lp_cm: model.analysis.rhoMaxLpCm,
      peak_frequency_mm_minus_1: model.analysis.peakFrequency,
      average_frequency_mm_minus_1: model.analysis.averageFrequency,
      f10_cumulative_mm_minus_1: model.analysis.f10Frequency,
      f10_tail_mm_minus_1: model.analysis.f10TailFrequency,
      f50_cumulative_mm_minus_1: model.analysis.f50Frequency,
      f90_cumulative_mm_minus_1: model.analysis.f90Frequency,
      roi_count_used: model.analysis.validRoiCount,
      roi_count_total: model.analysis.sourceRoiCount,
      warnings: (model.analysis.warnings || []).join("|"),
    }));
  }

  function updateComparisonPanel() {
    const npsTableModels = buildCachedNpsModels(state.datasets, state.circles);
    ensureSeriesPrefs(npsTableModels);
    state.seriesReferenceKey = resolveReferenceKey(npsTableModels, state.seriesPrefs, modelSeriesKey, state.seriesReferenceKey);
    const npsTableMeta = new Map(
      sortModelsByPrefs(npsTableModels, state.seriesPrefs, modelSeriesKey).map((entry, index) => [
        `${entry.datasetIndex + 1}::${entry.circle.id}`,
        {
          sequence: index + 1,
          label: displaySeriesLabel(state.seriesPrefs[modelSeriesKey(entry)], index),
          visible: state.seriesPrefs[modelSeriesKey(entry)]?.visible !== false,
          seriesKey: modelSeriesKey(entry),
        },
      ])
    );
    const squareTableModels = state.rois
      .filter((roi) => roi.type === ROI_TYPE)
      .map((roi) => {
        const dataset = state.datasets.find((entry) => entry.id === roi.datasetId);
        const datasetIndex = state.datasets.findIndex((entry) => entry.id === roi.datasetId);
        const extraction = getAnalysisForRoi(roi);
        const profile = extraction?.profileAnalysis?.profilesByType?.["horizontal-center"];
        return dataset && profile ? { roi, dataset, datasetIndex, extraction, profile } : null;
      })
      .filter(Boolean);
    ensureSquareProfilePrefs(squareTableModels);
    state.squareProfileReferenceKey = resolveReferenceKey(
      squareTableModels,
      state.squareProfilePrefs,
      squareProfileSeriesKey,
      state.squareProfileReferenceKey
    );
    const squareTableMeta = new Map(
      sortModelsByPrefs(squareTableModels, state.squareProfilePrefs, squareProfileSeriesKey).map((entry, index) => [
        `${entry.datasetIndex + 1}::${entry.roi.id}`,
        {
          sequence: index + 1,
          label: displaySeriesLabel(state.squareProfilePrefs[squareProfileSeriesKey(entry)], index),
          visible: state.squareProfilePrefs[squareProfileSeriesKey(entry)]?.visible !== false,
          seriesKey: squareProfileSeriesKey(entry),
        },
      ])
    );
    const rows = buildUiSquareRows()
      .map((row, index) => {
        const meta = squareTableMeta.get(`${row.reconstruction_index}::${row.roi_id}`);
        return {
          ...row,
          display_sequence: meta?.sequence ?? index + 1,
          display_recon_label: meta?.label || analysisRowReconLabel(row),
          display_label: row.roi_label || "TTF Square ROI",
          is_visible: meta?.visible !== false,
          series_key: meta?.seriesKey || "",
        };
      })
      .filter((row) => row.is_visible)
      .sort((left, right) => left.display_sequence - right.display_sequence || Number(left.reconstruction_index) - Number(right.reconstruction_index));
    const metricRows = buildUiNpsMetricRows(npsTableModels)
      .map((row, index) => {
        const meta = npsTableMeta.get(`${row.reconstruction_index}::${row.circle_id}`);
        return {
          ...row,
          display_sequence: meta?.sequence ?? index + 1,
          display_recon_label: meta?.label || analysisRowReconLabel(row),
          display_label: row.circle_label || "NPS Set",
          is_visible: meta?.visible !== false,
          series_key: meta?.seriesKey || "",
        };
      })
      .filter((row) => row.is_visible)
      .sort((left, right) => left.display_sequence - right.display_sequence || Number(left.reconstruction_index) - Number(right.reconstruction_index));
    const metricGroups = new Map();
    metricRows.forEach((row) => {
      if (!metricGroups.has(row.circle_label)) {
        metricGroups.set(row.circle_label, []);
      }
      metricGroups.get(row.circle_label).push(row);
    });
    const squareGroups = new Map();
    rows.forEach((row) => {
      if (!squareGroups.has(row.roi_label)) {
        squareGroups.set(row.roi_label, []);
      }
      squareGroups.get(row.roi_label).push(row);
    });
    const primaryGroups = metricGroups.size ? metricGroups : squareGroups;
    const series = Array.from(primaryGroups.entries()).map(([label, group], index) => ({
      label,
      color: PLOT_PALETTE[index % PLOT_PALETTE.length],
      points: group.map((row, pointIndex) => ({
        x: Number(row.display_sequence) || pointIndex + 1,
        y: Number(row.sd_hu),
      })),
    }));
    exportApi.drawLineSeries(els.comparisonCanvas.getContext("2d"), {
      width: els.comparisonCanvas.width,
      height: els.comparisonCanvas.height,
      title: metricRows.length ? "NPS ROI noise magnitude across reconstructions" : "TTF Square ROI SD across reconstructions",
      xLabel: "Display sequence",
      yLabel: "SD (HU)",
      theme: "dark",
      series,
    });
    if (!rows.length && !metricRows.length) {
      els.comparisonTable.innerHTML = '<p class="empty-copy">Copy ROI or circle geometry to all reconstructions to populate comparisons.</p>';
      if (els.reportTable) {
        els.reportTable.innerHTML = '<p class="empty-copy">No report table yet.</p>';
      }
      return;
    }
    const n = (row, key) => {
      const raw = row?.[key];
      if (raw == null || raw === "") {
        return null;
      }
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    };
    const f = (value, digits = 3) => (Number.isFinite(value) ? String(roundForDisplay(value, digits)) : "-");
    const delta = (next, base, digits = 3) =>
      Number.isFinite(next) && Number.isFinite(base) ? String(roundForDisplay(next - base, digits)) : "-";
    const pct = (next, base) => (Number.isFinite(next) && Number.isFinite(base) && Math.abs(base) > 1e-12 ? `${f(((next - base) / base) * 100, 1)}%` : "-");
    const pickReferenceRow = (group, referenceKey) => group.find((row) => row.series_key === referenceKey) || group[0] || null;
    const npsFootnote = `<p class="table-subtext">Delta values are comparison minus selected reference. std = standard deviation in HU. var = variance in HU^2. fP/fpeak = peak radial NPS frequency. fA/fav = average NPS frequency / spectral centroid. f10 tail = post-peak frequency where radial NPS falls to 10% of peak. f10/f50/f90 cumulative = frequencies where cumulative integrated NPS reaches 10%, 50%, and 90% of total noise power. rhoMax = Nyquist display limit from FOV/matrix or pixel spacing. rho10 ref = literature kernel MTF 10% reference for supported Siemens Bv kernels, not measured from NPS. Integrated NPS = area under the radial NPS curve.</p>`;
    const squareFootnote = `<p class="table-subtext">Delta values are comparison minus selected reference. SD = standard deviation in HU. Variance = SD squared. TTF f50 = frequency where in-plane TTFxy falls to 50%; rho10 = TTF f10 converted to lp/cm; rho10 ref = literature kernel MTF 10% reference for supported Siemens Bv kernels. rhoMax = Nyquist display limit. Blank/invalid means the square ROI did not contain a usable edge. Warnings summarize boundary, overlap, homogeneity, and TTF edge checks.</p>`;
    const comparisonSections = [];
    if (metricRows.length) {
      comparisonSections.push(`
        <p class="table-subtext"><strong>NPS comparison</strong></p>
        <table>
          <thead><tr><th>Seq</th><th>Recon</th><th>Object</th><th>Circles</th><th>Squares</th><th>std</th><th>var</th><th>Integrated NPS</th><th>rhoMax</th><th>rho10 ref</th><th>Sampling</th><th>fP / fpeak</th><th>fA / fav</th><th>f10 tail</th><th>f10 cum.</th><th>f50 cum.</th><th>f90 cum.</th></tr></thead>
          <tbody>
            ${metricRows
              .map(
                (row) => `<tr>
                  <td>${row.display_sequence}</td>
                  <td>${row.display_recon_label}</td>
                  <td>${row.display_label}</td>
                  <td>${row.circle_count || 1}</td>
                  <td>${f(n(row, "roi_count_used"), 0)} / ${f(n(row, "roi_count_total"), 0)}</td>
                  <td>${f(n(row, "sd_hu"), 2)} HU</td>
                  <td>${f(n(row, "variance_hu2"), 1)} HU^2</td>
                  <td>${f(n(row, "integrated_nps"), 1)}</td>
                  <td>${f(n(row, "rho_max_lp_cm"), 2)} lp/cm</td>
                  <td>${f(n(row, "kernel_rho10_reference_lp_cm"), 2)} lp/cm</td>
                  <td>${escapeHtml(formatKernelSamplingStatus(row.rho_max_kernel_sampling_status))}</td>
                  <td>${f(n(row, "peak_frequency_mm_minus_1"), 4)} mm^-1</td>
                  <td>${f(n(row, "average_frequency_mm_minus_1"), 4)} mm^-1</td>
                  <td>${f(n(row, "f10_tail_mm_minus_1"), 4)} mm^-1</td>
                  <td>${f(n(row, "f10_cumulative_mm_minus_1"), 4)} mm^-1</td>
                  <td>${f(n(row, "f50_cumulative_mm_minus_1"), 4)} mm^-1</td>
                  <td>${f(n(row, "f90_cumulative_mm_minus_1"), 4)} mm^-1</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
        ${npsFootnote}
      `);
    }
    if (rows.length) {
      comparisonSections.push(`
        <p class="table-subtext"><strong>TTF square ROI comparison</strong></p>
        <table>
          <thead><tr><th>Seq</th><th>Recon</th><th>Object</th><th>Mean</th><th>Noise SD</th><th>Variance</th><th>TTF f50</th><th>TTF f10</th><th>rho10</th><th>rho10 ref</th><th>rhoMax</th><th>Sampling</th><th>TTF CNR</th><th>Warnings</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (row) => `<tr>
                  <td>${row.display_sequence}</td>
                  <td>${row.display_recon_label}</td>
                  <td>${row.display_label}</td>
                  <td>${f(n(row, "mean_hu"), 2)} HU</td>
                  <td>${f(n(row, "sd_hu"), 2)} HU</td>
                  <td>${f(n(row, "variance_hu2"), 1)} HU^2</td>
                  <td>${f(n(row, "ttfxy_f50_mm_minus_1"), 4)} mm^-1</td>
                  <td>${f(n(row, "ttfxy_f10_mm_minus_1"), 4)} mm^-1</td>
                  <td>${f(n(row, "rho10_lp_cm"), 2)} lp/cm</td>
                  <td>${f(n(row, "kernel_rho10_reference_lp_cm"), 2)} lp/cm</td>
                  <td>${f(n(row, "rho_max_lp_cm"), 2)} lp/cm</td>
                  <td>${escapeHtml(formatKernelSamplingStatus(row.rho_max_kernel_sampling_status))}</td>
                  <td>${f(n(row, "ttfxy_cnr"), 2)}</td>
                  <td>${row.ttfxy_valid === "false" ? "TTF invalid" : row.warnings || ""}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
        ${squareFootnote}
      `);
    }
    els.comparisonTable.innerHTML = comparisonSections.join("");
    if (!els.reportTable) {
      return;
    }
    const reportSections = [];
    if (metricRows.length) {
      const baselineByCircle = new Map();
      metricGroups.forEach((group, label) => {
        baselineByCircle.set(label, pickReferenceRow(group, state.seriesReferenceKey));
      });
      const pairRows = metricRows
        .filter((row) => baselineByCircle.get(row.circle_label) !== row)
        .map((row) => {
          const base = baselineByCircle.get(row.circle_label);
          const sd = n(row, "sd_hu");
          const baseSd = n(base, "sd_hu");
          const fp = n(row, "peak_frequency_mm_minus_1");
          const baseFp = n(base, "peak_frequency_mm_minus_1");
          const f10Tail = n(row, "f10_tail_mm_minus_1");
          const baseF10Tail = n(base, "f10_tail_mm_minus_1");
          const favg = n(row, "average_frequency_mm_minus_1");
          const baseFavg = n(base, "average_frequency_mm_minus_1");
          const f50 = n(row, "f50_cumulative_mm_minus_1");
          const baseF50 = n(base, "f50_cumulative_mm_minus_1");
          const area = n(row, "integrated_nps");
          const baseArea = n(base, "integrated_nps");
          const kernelRho10Ref = n(row, "kernel_rho10_reference_lp_cm");
          const kernelRatio = n(row, "rho_max_over_kernel_rho10_reference");
          return `<tr>
            <td>${row.display_sequence}</td>
            <td>${base?.display_recon_label || analysisRowReconLabel(base)}</td>
            <td>${row.display_recon_label || analysisRowReconLabel(row)}</td>
            <td>${row.display_label}</td>
            <td>${f(sd, 2)} HU</td>
            <td>${delta(sd, baseSd, 2)} HU (${pct(sd, baseSd)})</td>
            <td>${delta(fp, baseFp, 4)} mm^-1</td>
            <td>${delta(favg, baseFavg, 4)} mm^-1</td>
            <td>${delta(f10Tail, baseF10Tail, 4)} mm^-1</td>
            <td>${delta(f50, baseF50, 4)} mm^-1</td>
            <td>${delta(area, baseArea, 1)} (${pct(area, baseArea)})</td>
            <td>${f(kernelRho10Ref, 2)} lp/cm</td>
            <td>${Number.isFinite(kernelRatio) ? f(kernelRatio, 3) : "-"} · ${escapeHtml(formatKernelSamplingStatus(row.rho_max_kernel_sampling_status))}</td>
          </tr>`;
        })
        .join("");
      reportSections.push(`
        <p class="table-subtext"><strong>NPS paper deltas</strong></p>
        <table>
          <thead>
            <tr><th>Seq</th><th>Reference</th><th>Comparison</th><th>NPS Set</th><th>std</th><th>Delta std</th><th>Delta fP</th><th>Delta fA</th><th>Delta f10 tail</th><th>Delta f50 cum.</th><th>Delta Integrated NPS</th><th>rho10 ref</th><th>rhoMax/ref</th></tr>
          </thead>
          <tbody>
            ${
              pairRows ||
              `<tr><td colspan="13">Load or copy at least two reconstructions with matching NPS circles to generate pairwise paper-report deltas.</td></tr>`
            }
          </tbody>
        </table>
        ${npsFootnote}
      `);
    }
    if (rows.length) {
      const baselineByRoi = new Map();
      squareGroups.forEach((group, label) => {
        baselineByRoi.set(label, pickReferenceRow(group, state.squareProfileReferenceKey));
      });
      const squarePairRows = rows
        .filter((row) => baselineByRoi.get(row.roi_label) !== row)
        .map((row) => {
          const base = baselineByRoi.get(row.roi_label);
          const mean = n(row, "mean_hu");
          const baseMean = n(base, "mean_hu");
          const sd = n(row, "sd_hu");
          const baseSd = n(base, "sd_hu");
          const variance = n(row, "variance_hu2");
          const baseVariance = n(base, "variance_hu2");
          const f50 = n(row, "ttfxy_f50_mm_minus_1");
          const rho10 = n(row, "rho10_lp_cm");
          const kernelRho10Ref = n(row, "kernel_rho10_reference_lp_cm");
          const rhoMax = n(row, "rho_max_lp_cm");
          return `<tr>
            <td>${row.display_sequence}</td>
            <td>${base?.display_recon_label || analysisRowReconLabel(base)}</td>
            <td>${row.display_recon_label || analysisRowReconLabel(row)}</td>
            <td>${row.display_label}</td>
            <td>${f(mean, 2)} HU</td>
            <td>${delta(mean, baseMean, 2)} HU</td>
            <td>${f(sd, 2)} HU</td>
            <td>${delta(sd, baseSd, 2)} HU (${pct(sd, baseSd)})</td>
            <td>${delta(variance, baseVariance, 1)} HU^2 (${pct(variance, baseVariance)})</td>
            <td>${f(f50, 4)} mm^-1</td>
            <td>${f(rho10, 2)} lp/cm</td>
            <td>${f(kernelRho10Ref, 2)} lp/cm</td>
            <td>${f(rhoMax, 2)} lp/cm</td>
            <td>${escapeHtml(formatKernelSamplingStatus(row.rho_max_kernel_sampling_status))}</td>
            <td>${row.warnings || ""}</td>
          </tr>`;
        })
        .join("");
      reportSections.push(`
        <p class="table-subtext"><strong>TTF square ROI paper deltas</strong></p>
        <table>
          <thead>
          <tr><th>Seq</th><th>Reference</th><th>Comparison</th><th>TTF Square ROI</th><th>Mean</th><th>Delta Mean</th><th>SD</th><th>Delta SD</th><th>Delta Variance</th><th>TTF f50</th><th>rho10</th><th>rho10 ref</th><th>rhoMax</th><th>Sampling</th><th>Warnings</th></tr>
        </thead>
        <tbody>
          ${
            squarePairRows ||
            `<tr><td colspan="15">Copy square ROI geometry to at least two reconstructions to generate pairwise paper-report deltas.</td></tr>`
          }
        </tbody>
      </table>
      ${squareFootnote}
      `);
    }
    els.reportTable.innerHTML = reportSections.join("") || '<p class="empty-copy">No report table yet.</p>';
  }

  function updateUi() {
    updateReconList();
    updateSliceControls();
    updateObjectList();
    updateSelectionDetail();
    if (els.showNpsLabelsInput) {
      els.showNpsLabelsInput.checked = state.showNpsLabels;
    }
    if (els.labelToggleButton) {
      els.labelToggleButton.classList.toggle("is-active", Boolean(state.showNpsLabels));
      els.labelToggleButton.setAttribute("aria-pressed", state.showNpsLabels ? "true" : "false");
      els.labelToggleButton.title = state.showNpsLabels ? "Hide ROI labels" : "Show ROI labels";
      els.labelToggleButton.setAttribute(
        "aria-label",
        state.showNpsLabels ? "Hide ROI labels" : "Show ROI labels"
      );
    }
    updateDicomOverlay();
    updateAnalysisCanvases();
    els.overlayNote.style.display = getActiveVolume() ? "none" : "grid";
    const record = getActiveRecord();
    if (record && getActiveVolume()) {
      els.analysisNote.textContent = `${analysisDatasetLabel(getActiveDataset(), state.datasets.findIndex((dataset) => dataset.id === state.activeDatasetId))} · spacing ${formatSpacing(record.pixelSpacing)} · slice ${state.activeSliceIndex + 1}`;
    } else {
      els.analysisNote.textContent = "Place a square ROI or NPS circle to begin.";
    }
  }

  function exportTextFileToBlob(file) {
    return {
      filename: file.name,
      name: file.name,
      mimeType: file.mimeType || "text/plain",
      blob: new Blob([file.content || ""], { type: file.mimeType || "text/plain" }),
    };
  }

  function getScopedAnalysisData(requireObjects = true) {
    const scope = els.exportScopeSelect?.value || "all";
    const datasetIds = new Set(scope === "active" ? [state.activeDatasetId] : state.datasets.map((dataset) => dataset.id));
    const datasets = state.datasets.filter((dataset) => datasetIds.has(dataset.id));
    const rois = state.rois.filter((roi) => datasetIds.has(roi.datasetId));
    const circles = state.circles.filter((circle) => datasetIds.has(circle.datasetId));
    if (!datasets.length || (requireObjects && !rois.length && !circles.length)) {
      throw new Error("Load DICOM and place at least one ROI or circle before export.");
    }
    return { scope, datasetIds, datasets, rois, circles };
  }

  function exportSeriesNumberForDataset(dataset) {
    const value = Number(dataset?.meta?.seriesNumber);
    return Number.isFinite(value) ? String(value) : "";
  }

  function exportSeriesTokenForDatasets(datasets) {
    const numbers = [];
    (datasets || []).forEach((dataset) => {
      const seriesNumber = exportSeriesNumberForDataset(dataset);
      if (seriesNumber && !numbers.includes(seriesNumber)) {
        numbers.push(seriesNumber);
      }
    });
    return numbers.length ? `series_${numbers.map((number) => sanitizeFilePart(number, "series")).join("-")}` : "series_unknown";
  }

  function getReportComparisonSeries(model) {
    const metricRows = model.npsMetricsRows || [];
    const squareRows = model.squareRows || [];
    const groups = new Map();
    (metricRows.length ? metricRows : squareRows).forEach((row) => {
      const key = metricRows.length ? row.circle_label || row.circle_id || "NPS" : row.roi_label || row.roi_id || "TTF Square ROI";
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(row);
    });
    return Array.from(groups.entries()).map(([label, rows], index) => ({
      label,
      color: PLOT_PALETTE[index % PLOT_PALETTE.length],
      points: rows.map((row, pointIndex) => ({
        x: Number(row.reconstruction_index) || pointIndex + 1,
        y: Number(row.sd_hu),
      })),
    }));
  }

  function buildReportFigures(scoped, model) {
    const activeDataset = scoped.datasets.find((dataset) => dataset.id === state.activeDatasetId) || scoped.datasets[0] || null;
    const activeDatasetIndex = state.datasets.findIndex((dataset) => dataset.id === activeDataset?.id);
    const activeSliceIndex = clamp(state.activeSliceIndex, 0, Math.max(0, (activeDataset?.volume?.depth || 1) - 1));
    const selectedRoi = scoped.rois.find((roi) => roi.id === state.selectedObjectId && roi.type === ROI_TYPE) || scoped.rois.find((roi) => roi.type === ROI_TYPE);
    const selectedCircle =
      scoped.circles.find((circle) => circle.id === state.selectedObjectId) ||
      getCircleForRoi(scoped.rois.find((roi) => roi.id === state.selectedObjectId)) ||
      scoped.circles.find((circle) => circle.generated) ||
      null;
    const selectedCircleRootId = selectedCircle ? getCircleAnalysisSetId(selectedCircle) : "";
    const selectedNpsModel =
      model.npsModels.find((entry) => selectedCircleRootId && getCircleAnalysisSetId(entry.circle) === selectedCircleRootId) ||
      model.npsModels[0] ||
      null;
    const profileModels = getRelatedSquareProfileModels(selectedRoi).filter((entry) => scoped.datasetIds.has(entry.dataset.id));
    const profileRoi = selectedRoi || profileModels[0]?.roi || null;
    const extraction = profileRoi ? getAnalysisForRoi(profileRoi) : null;
    ensureSeriesPrefs(model.npsModels);
    ensureSquareProfilePrefs(profileModels);
    const figures = [];
    if (activeDataset) {
      figures.push({
        title: "CT Image With ROI Overlay",
        caption: `${analysisDatasetLabel(activeDataset, activeDatasetIndex)} · slice ${activeSliceIndex + 1}`,
        src: exportApi.createCanvasDataUrl(960, 760, (ctx, size) =>
          exportApi.drawOverlay(ctx, {
            width: size.width,
            height: size.height,
            dataset: activeDataset,
            sliceIndex: activeSliceIndex,
            viewport: state.viewport,
            rois: scoped.rois,
            circles: scoped.circles,
          })
        ),
      });
    }
    figures.push({
      title: "TTF Square ROI Center Profiles",
      caption: profileModels.length > 1 ? "Overlaid copied TTF square ROI profiles across reconstructions." : "Horizontal center profile for the selected TTF square ROI.",
      src: exportApi.createCanvasDataUrl(980, 420, (ctx, size) =>
        exportApi.drawLineSeries(ctx, {
          width: size.width,
          height: size.height,
          title:
            profileModels.length > 1
              ? `${profileRoi?.label || "TTF Square ROI"} horizontal center profiles across reconstructions`
              : profileRoi
                ? `${profileRoi.label} horizontal center profile`
                : "TTF Square ROI profile",
          xLabel: profileModels[0]?.profile?.spacingMm
            ? `Distance (${roundForDisplay(profileModels[0].profile.spacingMm, 3)} mm samples)`
            : "Sample index",
          yLabel: extraction?.units ? `Value (${extraction.units})` : "Value",
          series: squareProfileSeriesFromModels(profileModels),
        })
      ),
    });
    figures.push({
      title: "TTF Square ROI Histogram",
      caption: profileRoi ? `${profileRoi.label} source-pixel HU distribution.` : "TTF Square ROI histogram.",
      src: exportApi.createCanvasDataUrl(980, 360, (ctx, size) =>
        exportApi.drawHistogram(ctx, {
          width: size.width,
          height: size.height,
          title: profileRoi ? `${profileRoi.label} histogram` : "TTF Square ROI histogram",
          bins: extraction?.profileAnalysis?.histogram || [],
          xLabel: extraction?.units || "HU",
        })
      ),
    });
    if (extraction?.ttfAnalysis?.valid) {
      figures.push({
        title: "TTFxy Edge Response",
        caption: `${profileRoi.label} normalized ESF from square ROI edge pixels.`,
        src: exportApi.createCanvasDataUrl(980, 360, (ctx, size) =>
          exportApi.drawLineSeries(ctx, {
            width: size.width,
            height: size.height,
            title: `${profileRoi.label} TTFxy edge response`,
            xLabel: "Distance from edge (mm)",
            yLabel: "Normalized ESF",
            series: [
              {
                label: profileRoi.label,
                color: PLOT_PALETTE[0],
                points: extraction.ttfAnalysis.esf.map((point) => ({ x: point.distanceMm, y: point.normalizedValue })),
              },
            ],
          })
        ),
      });
      figures.push({
        title: "TTFxy Curve",
        caption: `${profileRoi.label} in-plane task transfer function from ESF/LSF/FFT.`,
        src: exportApi.createCanvasDataUrl(980, 420, (ctx, size) =>
          exportApi.drawLineSeries(ctx, {
            width: size.width,
            height: size.height,
            title: `${profileRoi.label} TTFxy`,
            xLabel: "Radial spatial frequency (mm^-1)",
            yLabel: "TTF",
            series: [
              {
                label: profileRoi.label,
                color: PLOT_PALETTE[0],
                points: extraction.ttfAnalysis.ttf.map((point) => ({ x: point.frequencyMmMinus1, y: point.ttf })),
              },
            ],
          })
        ),
      });
    }
    figures.push({
      title: "2D NPS Heatmap",
      caption: selectedNpsModel
        ? `${selectedNpsModel.circle.label} · ${selectedNpsModel.analysis.circleCount || 1} circle${(selectedNpsModel.analysis.circleCount || 1) === 1 ? "" : "s"} · ${selectedNpsModel.analysis.validRoiCount} / ${selectedNpsModel.analysis.sourceRoiCount || selectedNpsModel.analysis.validRoiCount} valid square ROIs.`
        : "2D NPS heatmap.",
      src: exportApi.createCanvasDataUrl(680, 680, (ctx, size) =>
        exportApi.drawNpsHeatmap(ctx, {
          width: size.width,
          height: size.height,
          title: selectedNpsModel ? `${selectedNpsModel.circle.label} 2D NPS` : "2D NPS",
          analysis: selectedNpsModel?.analysis,
        })
      ),
    });
    [
      ["Absolute Radial NPS", "nps", selectedNpsModel?.analysis?.npsUnits || "NPS"],
      ["Normalized NPS", "normalizedNps", "Normalized NPS"],
      ["Cumulative Noise Power", "cumulativeFraction", "Cumulative fraction"],
    ].forEach(([title, field, yLabel]) => {
      figures.push({
        title,
        caption: "One curve per visible reconstruction/analysis set.",
        src: exportApi.createCanvasDataUrl(980, 420, (ctx, size) =>
          exportApi.drawLineSeries(ctx, {
            width: size.width,
            height: size.height,
            title,
            xLabel: "Radial spatial frequency (mm^-1)",
            yLabel,
            series: applySeriesPrefs(model.npsModels, field),
          })
        ),
      });
    });
    figures.push({
      title: "Noise Magnitude Comparison",
      caption: "Paper-oriented SD comparison across reconstructions.",
      src: exportApi.createCanvasDataUrl(980, 360, (ctx, size) =>
        exportApi.drawLineSeries(ctx, {
          width: size.width,
          height: size.height,
          title: model.npsMetricsRows?.length ? "NPS ROI noise magnitude across reconstructions" : "TTF Square ROI SD across reconstructions",
          xLabel: "Reconstruction index",
          yLabel: "SD (HU)",
          series: getReportComparisonSeries(model),
        })
      ),
    });
    const overviewColumns = scoped.datasets.length > 1 ? 2 : 1;
    const overviewCardWidth = 1040;
    const overviewCardHeight = 430;
    const overviewMargin = 24;
    const overviewRows = Math.max(1, Math.ceil(scoped.datasets.length / overviewColumns));
    const overviewWidth = overviewMargin + overviewColumns * (overviewCardWidth + overviewMargin);
    const overviewHeight = 108 + overviewRows * (overviewCardHeight + overviewMargin);
    figures.push({
      title: "Appendix A: All Reconstructions ROI Review Board",
      caption: "All exported reconstructions with source-image ROI overlays, per-reconstruction 2D NPS heatmaps, and compact NPS/TTF findings. The image is scaled to fit the A4 page without cropping.",
      appendix: true,
      src: exportApi.createCanvasDataUrl(
        overviewWidth,
        overviewHeight,
        (ctx, size) =>
          exportApi.drawReconstructionOverviewPanel(ctx, {
            width: size.width,
            height: size.height,
            cardWidth: overviewCardWidth,
            cardHeight: overviewCardHeight,
            datasets: scoped.datasets,
            rois: scoped.rois,
            circles: scoped.circles,
            npsModels: model.npsModels,
            activeSliceIndex,
            viewport: state.viewport,
            researchStudyId: safeString(els.researchIdInput?.value) || "",
            patientStudyId: safeString(els.patientIdInput?.value) || "",
          }),
        1
      ),
    });
    return figures;
  }

  function buildReconstructionMetadataTable(datasets) {
    const rows = (datasets || []).map((dataset, index) => {
      const meta = dataset.meta || {};
      const kernelReference = kernelReferenceSummary(dataset);
      return `
        <tr>
          <td>${escapeHtml(datasetLabel(dataset, index))}</td>
          <td>${escapeHtml(formatDicomValue(meta.seriesNumber, "", 0))}</td>
          <td>${escapeHtml(meta.seriesDescription || "-")}</td>
          <td>${escapeHtml(meta.convolutionKernel || "-")}</td>
          <td>${escapeHtml(formatKernelMtfReference(kernelReference.reference))}</td>
          <td>${escapeHtml(formatMetric(kernelReference.rhoMax, "lp/cm", 2))}</td>
          <td>${escapeHtml(formatKernelSamplingStatus(kernelReference.status))}</td>
          <td>${escapeHtml(meta.iterativeReconstruction || getIterativeReconstructionHint(meta) || "-")}</td>
          <td>${escapeHtml(formatDicomValue(meta.kvp, "kV", 1))}</td>
          <td>${escapeHtml(formatDicomValue(meta.tubeCurrent, "mA", 1))}</td>
          <td>${escapeHtml(formatDicomValue(meta.ctdiVol, "mGy", 3))}</td>
          <td>${escapeHtml(formatDicomValue(meta.sliceThickness, "mm", 3))}</td>
          <td>${escapeHtml(dataset.volume ? `${formatDicomValue(dataset.volume.columnSpacing, "mm", 4)} x ${formatDicomValue(dataset.volume.rowSpacing, "mm", 4)}` : "-")}</td>
          <td>${escapeHtml(dataset.volume ? `${dataset.volume.columns} x ${dataset.volume.rows} x ${dataset.volume.depth}` : "-")}</td>
        </tr>
      `;
    });
    return `
      <table>
        <thead><tr><th>Recon Label</th><th>Series #</th><th>Series</th><th>Kernel</th><th>MTF ref</th><th>rhoMax</th><th>Sampling</th><th>IR</th><th>kVp</th><th>mA</th><th>CTDIvol</th><th>Thickness</th><th>Spacing</th><th>Matrix</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    `;
  }

  function buildReportNpsMetricSummary(scoped, model) {
    const npsModels = buildNpsModels(scoped.datasets, scoped.circles, scoped.rois);
    ensureSeriesPrefs(npsModels);
    const circleLookup = new Map(
      (scoped.circles || []).map((circle) => {
        const datasetIndex = scoped.datasets.findIndex((dataset) => dataset.id === circle.datasetId) + 1;
        return [`${datasetIndex}::${circle.id}`, circle];
      })
    );
    const metaByRow = new Map(
      sortModelsByPrefs(npsModels, state.seriesPrefs, modelSeriesKey).map((entry, index) => [
        `${entry.datasetIndex + 1}::${entry.circle.id}`,
        {
          sequence: index + 1,
          label: displaySeriesLabel(state.seriesPrefs[modelSeriesKey(entry)], index),
          visible: state.seriesPrefs[modelSeriesKey(entry)]?.visible !== false,
        },
      ])
    );
    const numberValue = (row, key) => {
      const raw = row?.[key];
      if (raw == null || raw === "") {
        return null;
      }
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    };
    const metric = (value, suffix = "", digits = 3) => escapeHtml(formatMetric(value, suffix, digits));
    const rows = (model.npsMetricsRows || [])
      .map((row, index) => {
        const key = `${row.reconstruction_index}::${row.circle_id}`;
        const meta = metaByRow.get(key);
        const circleIds = String(row.circle_ids || row.circle_id || "")
          .split("|")
          .map((id) => id.trim())
          .filter(Boolean);
        const circles = circleIds.map((id) => circleLookup.get(`${row.reconstruction_index}::${id}`)).filter(Boolean);
        const circle = circles[0] || circleLookup.get(key);
        const sourceRoiCount = (scoped.rois || []).filter(
          (roi) => circleIds.includes(roi.parentCircleId) && roi.datasetId === circle?.datasetId
        ).length;
        return {
          ...row,
          circle,
          circles,
          sourceRoiCount,
          displaySequence: meta?.sequence ?? index + 1,
          displayLabel: `${meta?.label || analysisRowReconLabel(row)} / ${row.circle_label || "NPS Set"}`,
          visible: meta?.visible !== false,
        };
      })
      .filter((row) => row.visible)
      .sort((left, right) => left.displaySequence - right.displaySequence || Number(left.reconstruction_index) - Number(right.reconstruction_index));

    if (!rows.length) {
      return '<p class="note">No generated NPS metrics are available for this report.</p>';
    }

    return `
      <table class="metric-summary-table">
        <thead>
          <tr>
            <th>Seq</th>
            <th>Recon / NPS Set</th>
            <th>Circles</th>
            <th>Squares</th>
            <th>Radius</th>
            <th>NPS Edge</th>
            <th>std</th>
            <th>var</th>
            <th>Integrated NPS</th>
            <th>rhoMax</th>
            <th>rho10 ref</th>
            <th>Sampling</th>
            <th>fP / fpeak</th>
            <th>fA / fav</th>
            <th>f10 tail</th>
            <th>f10 cum.</th>
            <th>f50 cum.</th>
            <th>f90 cum.</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(row.displaySequence)}</td>
                  <td class="long-label">${escapeHtml(row.displayLabel)}</td>
                  <td>${escapeHtml(row.circle_count || row.circles?.length || 1)}</td>
                  <td>${escapeHtml(`${row.roi_count_used || "-"} / ${row.sourceRoiCount || row.roi_count_used || "-"}`)}</td>
                  <td>${escapeHtml(row.circles?.length > 1 ? row.circles.map((circle) => formatMetric(circle.radiusPx, "px", 1)).join(" / ") : formatMetric(row.circle?.radiusPx, "px", 1))}</td>
                  <td>${metric(numberValue(row, "roi_size_px"), "px", 0)}</td>
                  <td>${metric(numberValue(row, "sd_hu"), "HU", 3)}</td>
                  <td>${metric(numberValue(row, "variance_hu2"), "HU^2", 3)}</td>
                  <td>${metric(numberValue(row, "integrated_nps"), row.nps_units || "HU^2 mm^2", 4)}</td>
                  <td>${metric(numberValue(row, "rho_max_lp_cm"), "lp/cm", 2)}</td>
                  <td>${metric(numberValue(row, "kernel_rho10_reference_lp_cm"), "lp/cm", 2)}</td>
                  <td>${escapeHtml(formatKernelSamplingStatus(row.rho_max_kernel_sampling_status))}</td>
                  <td>${metric(numberValue(row, "peak_frequency_mm_minus_1"), "mm^-1", 4)}</td>
                  <td>${metric(numberValue(row, "average_frequency_mm_minus_1"), "mm^-1", 4)}</td>
                  <td>${metric(numberValue(row, "f10_tail_mm_minus_1"), "mm^-1", 4)}</td>
                  <td>${metric(numberValue(row, "f10_cumulative_mm_minus_1"), "mm^-1", 4)}</td>
                  <td>${metric(numberValue(row, "f50_cumulative_mm_minus_1"), "mm^-1", 4)}</td>
                  <td>${metric(numberValue(row, "f90_cumulative_mm_minus_1"), "mm^-1", 4)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
      <p class="metric-summary-note">std = standard deviation in HU. var = variance in HU^2. rhoMax = Nyquist display limit from FOV/matrix or pixel spacing. rho10 ref = literature kernel MTF 10% reference for supported Siemens Bv kernels, not measured from NPS. fP/fpeak = peak radial NPS frequency. fA/fav = spectral centroid. f10 tail = post-peak frequency where radial NPS falls to 10% of peak. f10/f50/f90 cumulative = frequencies where cumulative integrated NPS reaches 10%, 50%, and 90% of total noise power.</p>
    `;
  }

  function buildPrintReportHtml(scoped, model, figures) {
    updateComparisonPanel();
    const mainFigures = (figures || []).filter((figure) => !figure.appendix);
    const appendixFigures = (figures || []).filter((figure) => figure.appendix);
    const researchStudyId = safeString(els.researchIdInput?.value) || "unspecified";
    const patientStudyId = safeString(els.patientIdInput?.value) || "unspecified";
    const timestamp = new Date().toISOString();
    const seriesToken = exportSeriesTokenForDatasets(scoped.datasets);
    const activeDataset = scoped.datasets.find((dataset) => dataset.id === state.activeDatasetId) || scoped.datasets[0] || null;
    const activeRows = activeDataset ? dicomRowsToHtml(getImportantDicomRows(activeDataset, state.activeSliceIndex)) : "<p>No DICOM data loaded.</p>";
    const comparisonTable = els.comparisonTable?.innerHTML || "<p>No comparison table available.</p>";
    const paperTable = els.reportTable?.innerHTML || "<p>No paper table available.</p>";
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>HAGRad Noise Power Report ${escapeHtml(seriesToken)}</title>
    <style>
      @page { size: A4; margin: 0.45in; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111820; background: #fff; font-family: "Aptos", "Avenir Next", "Segoe UI", sans-serif; font-size: 10.5pt; }
      h1, h2, h3 { margin: 0; color: #0f1822; }
      h1 { font-size: 24pt; }
      h2 { margin: 18pt 0 8pt; font-size: 14pt; border-bottom: 1px solid #cfd8e3; padding-bottom: 4pt; }
      h3 { margin: 8pt 0 4pt; font-size: 10.5pt; }
      p { margin: 4pt 0 8pt; line-height: 1.35; }
      .cover { display: grid; grid-template-columns: 1fr auto; gap: 14pt; align-items: start; margin-bottom: 10pt; }
      .meta-box { border: 1px solid #cfd8e3; border-radius: 6pt; padding: 8pt; min-width: 220pt; }
      .meta-box div { display: grid; grid-template-columns: 78pt 1fr; gap: 5pt; margin: 2pt 0; }
      .note { color: #506174; }
      .figure { break-inside: avoid; margin: 10pt 0 16pt; }
      .figure img { display: block; width: 100%; max-height: 7.8in; object-fit: contain; border: 1px solid #d7e0ea; border-radius: 6pt; }
      .figure-caption { color: #506174; font-size: 9pt; margin-top: 4pt; }
      .figure-grid { display: grid; grid-template-columns: 1fr; gap: 10pt; }
      .appendix-page { break-before: page; }
      .appendix-figure { margin: 8pt 0 0; break-inside: avoid; }
      .appendix-figure img { display: block; width: 100%; max-width: 100%; max-height: 9.25in; height: auto; object-fit: contain; border: 1px solid #d7e0ea; border-radius: 6pt; }
      table { width: 100%; border-collapse: collapse; margin: 6pt 0 12pt; font-size: 8.5pt; }
      th, td { border-bottom: 1px solid #dbe3ec; padding: 4pt 5pt; text-align: left; vertical-align: top; }
      th { color: #182635; background: #edf2f7; font-size: 7.8pt; text-transform: uppercase; letter-spacing: 0.03em; }
      .dicom-info-grid { display: grid; grid-template-columns: 105pt 1fr; gap: 3pt 9pt; margin: 6pt 0 12pt; }
      .dicom-info-grid dt { color: #38506a; font-weight: 700; }
      .dicom-info-grid dd { margin: 0; overflow-wrap: anywhere; }
      .comparison-table { overflow: visible; }
      .comparison-table p { color: #506174; }
      .metric-summary-table { font-size: 7.2pt; }
      .metric-summary-table th, .metric-summary-table td { padding: 3pt 3.5pt; }
      .metric-summary-table .long-label { min-width: 105pt; overflow-wrap: anywhere; }
      .metric-summary-note { color: #506174; font-size: 8pt; }
      .page-break { break-before: page; }
      footer { margin-top: 18pt; color: #506174; font-size: 8.5pt; border-top: 1px solid #dbe3ec; padding-top: 6pt; }
      @media print { .figure { page-break-inside: avoid; } }
    </style>
  </head>
  <body>
    <section class="cover">
      <div>
        <p class="note">HAGRad Physics Workstation · Research use only</p>
        <h1>HAGRad Noise Power Report</h1>
        <p>TTF Square ROI, source-pixel noise, and Noise Power Spectrum analysis from source DICOM pixel values.</p>
      </div>
      <div class="meta-box">
        <div><strong>Research ID</strong><span>${escapeHtml(researchStudyId)}</span></div>
        <div><strong>Study ID</strong><span>${escapeHtml(patientStudyId)}</span></div>
        <div><strong>Series #</strong><span>${escapeHtml(seriesToken.replace(/^series_/, ""))}</span></div>
        <div><strong>Scope</strong><span>${escapeHtml(scoped.scope)}</span></div>
        <div><strong>Generated</strong><span>${escapeHtml(timestamp)}</span></div>
      </div>
    </section>
    <h2>Image And DICOM Header</h2>
    ${activeRows}
    <h2>Reconstruction Metadata</h2>
    ${buildReconstructionMetadataTable(scoped.datasets)}
    <h2>NPS Metric Summary</h2>
    ${buildReportNpsMetricSummary(scoped, model)}
    <h2>Figures</h2>
    <div class="figure-grid">
      ${mainFigures
        .map(
          (figure) => `
            <figure class="figure">
              <h3>${escapeHtml(figure.title)}</h3>
              <img src="${figure.src}" alt="${escapeAttr(figure.title)}" />
              <figcaption class="figure-caption">${escapeHtml(figure.caption || "")}</figcaption>
            </figure>
          `
        )
        .join("")}
    </div>
    <section class="page-break">
      <h2>Reconstruction Comparison</h2>
      <div class="comparison-table">${comparisonTable}</div>
      <h2>Paper Table</h2>
      <div class="comparison-table">${paperTable}</div>
    </section>
    ${
      appendixFigures.length
        ? `<section class="appendix-page">
            <h2>Appendix</h2>
            ${appendixFigures
              .map(
                (figure) => `
                  <figure class="appendix-figure">
                    <h3>${escapeHtml(figure.title)}</h3>
                    <img src="${figure.src}" alt="${escapeAttr(figure.title)}" />
                    <figcaption class="figure-caption">${escapeHtml(figure.caption || "")}</figcaption>
                  </figure>
                `
              )
              .join("")}
          </section>`
        : ""
    }
    <footer>
      Measurements use calibrated source pixels with DICOM Rescale Slope/Intercept. NPS uses mean-subtracted square ROIs with dx * dy / (Nx * Ny) FFT scaling. This report is for local research review and is not for clinical diagnosis.
    </footer>
    <script>
      window.addEventListener("load", () => setTimeout(() => window.print(), 350));
    </script>
  </body>
</html>`;
  }

  async function printReport() {
    const scoped = getScopedAnalysisData(true);
    setStatus("Building print-ready Noise Power report...");
    const model = buildMandatoryExportFiles(scoped.datasets, scoped.rois, scoped.circles, {
      researchStudyId: safeString(els.researchIdInput?.value),
      patientStudyId: safeString(els.patientIdInput?.value),
      timestamp: new Date().toISOString(),
    });
    const figures = buildReportFigures(scoped, model);
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      throw new Error("The report window was blocked. Allow pop-ups for this local app and try again.");
    }
    reportWindow.document.open();
    reportWindow.document.write(buildPrintReportHtml(scoped, model, figures));
    reportWindow.document.close();
    setStatus("Print report opened. Choose Save as PDF in the print dialog.");
  }

  async function exportBundle() {
    const researchStudyId = els.researchIdInput.value.trim();
    const patientStudyId = els.patientIdInput.value.trim();
    if (!researchStudyId || !patientStudyId) {
      throw new Error("Study / Research ID and Patient / Study ID are required.");
    }
    const { datasets, rois, circles } = getScopedAnalysisData(true);
    setStatus("Building Noise Power export bundle...");
    const timestamp = new Date().toISOString();
    const model = buildMandatoryExportFiles(datasets, rois, circles, {
      researchStudyId,
      patientStudyId,
      timestamp,
    });
    const files = model.files.map(exportTextFileToBlob);
    const pngFiles = await exportApi.createNoisePowerPngFiles({
      datasets,
      rois,
      circles,
      npsModels: model.npsModels,
      activeDatasetId: state.activeDatasetId,
      activeSliceIndex: state.activeSliceIndex,
      selectedObjectId: state.selectedObjectId,
      viewport: state.viewport,
      researchStudyId,
      patientStudyId,
    });
    files.push(...pngFiles);
    const stamp = timestamp.replace(/[:.]/g, "-");
    const seriesToken = exportSeriesTokenForDatasets(datasets);
    const zipName = `HAGRad_Noise_Power_${sanitizeFilePart(researchStudyId, "study")}_${sanitizeFilePart(patientStudyId, "case")}_${seriesToken}_${stamp}.zip`;
    const result = await zipApi.downloadBundle(files, zipName);
    setStatus(`Exported ${result.fileCount} files. ZIP ready.`, "", `Exported ${result.fileCount} files to ${result.filename}.`);
  }

  function bindUi() {
    els.statusPill = document.getElementById("np-status-pill");
    els.studyNote = document.getElementById("np-study-note");
    els.reconList = document.getElementById("np-recon-list");
    els.objectList = document.getElementById("np-object-list");
    els.selectionNote = document.getElementById("np-selection-note");
    els.selectionDetail = document.getElementById("np-selection-detail");
    els.npsSummary = document.getElementById("np-nps-summary");
    els.canvas = document.getElementById("np-canvas");
    els.viewerPage = document.getElementById("np-viewer-page");
    els.analysisPage = document.getElementById("np-analysis-page");
    els.viewerPageButton = document.getElementById("np-viewer-page-button");
    els.analysisPageButton = document.getElementById("np-analysis-page-button");
    els.contextMenu = document.getElementById("np-context-menu");
    els.dropzone = document.getElementById("np-dropzone");
    els.overlayNote = document.getElementById("np-overlay-note");
    els.dicomOverlay = document.getElementById("np-dicom-overlay");
    els.dicomToggleButton = document.getElementById("np-dicom-toggle-button");
    els.gridToggleButton = document.getElementById("np-grid-toggle-button");
    els.labelToggleButton = document.getElementById("np-label-toggle-button");
    els.sliceSlider = document.getElementById("np-slice-slider");
    els.readout = document.getElementById("np-readout");
    els.windowWidthInput = document.getElementById("np-window-width");
    els.windowCenterInput = document.getElementById("np-window-center");
    els.npsEdgeInput = document.getElementById("np-nps-edge");
    els.npsPeripheralInput = document.getElementById("np-nps-peripheral");
    els.npsCenterInput = document.getElementById("np-nps-center");
    els.npsDetrendInput = document.getElementById("np-nps-detrend");
    els.showNpsLabelsInput = document.getElementById("np-show-nps-labels");
    els.researchIdInput = document.getElementById("np-research-id");
    els.patientIdInput = document.getElementById("np-patient-id");
    els.exportScopeSelect = document.getElementById("np-export-scope");
    els.analysisNote = document.getElementById("np-analysis-note");
    els.analysisGrid = document.getElementById("np-analysis-grid");
    els.npsAnalysisCard = document.getElementById("np-nps-analysis-card");
    els.npsAnalysisStatus = document.getElementById("np-nps-analysis-status");
    els.seriesControls = document.getElementById("np-series-controls");
    els.profileSeriesControls = document.getElementById("np-profile-series-controls");
    els.profileCanvas = document.getElementById("np-profile-canvas");
    els.histogramCanvas = document.getElementById("np-histogram-canvas");
    els.ttfEsfCanvas = document.getElementById("np-ttf-esf-canvas");
    els.ttfCurveCanvas = document.getElementById("np-ttf-curve-canvas");
    els.npsHeatmapCanvas = document.getElementById("np-nps-heatmap-canvas");
    els.npsCurveCanvas = document.getElementById("np-nps-curve-canvas");
    els.npsNormalizedCanvas = document.getElementById("np-nps-normalized-canvas");
    els.npsCumulativeCanvas = document.getElementById("np-nps-cumulative-canvas");
    els.comparisonCanvas = document.getElementById("np-comparison-canvas");
    els.comparisonTable = document.getElementById("np-comparison-table");
    els.reportTable = document.getElementById("np-report-table");
    els.printReportButton = document.getElementById("np-print-report-button");

    document.querySelectorAll("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => setActiveTool(button.dataset.tool || "select"));
    });
    installCollapsibleBlocks();
    installSidebarJumpTabs();
    els.viewerPageButton.addEventListener("click", () => setWorkspacePage("viewer"));
    els.analysisPageButton.addEventListener("click", () => setWorkspacePage("analysis"));

    document.getElementById("np-dicom-input").addEventListener("change", async (event) => {
      try {
        await loadFiles(event.target.files);
      } catch (error) {
        setStatus(error.message || "Could not load DICOM files.", "error");
      }
    });
    document.getElementById("np-folder-input").addEventListener("change", async (event) => {
      try {
        await loadFiles(event.target.files);
      } catch (error) {
        setStatus(error.message || "Could not load DICOM folder.", "error");
      }
    });
    document.getElementById("np-add-input").addEventListener("change", async (event) => {
      try {
        await loadFiles(event.target.files, { add: true });
      } catch (error) {
        setStatus(error.message || "Could not add reconstructions.", "error");
      }
    });
    document.getElementById("np-add-folder-input")?.addEventListener("change", async (event) => {
      try {
        await loadFiles(event.target.files, { add: true });
      } catch (error) {
        setStatus(error.message || "Could not add reconstruction folder.", "error");
      }
    });
    document.getElementById("np-clear-button").addEventListener("click", clearStudy);
    document.getElementById("np-fit-button").addEventListener("click", () => fitViewport(true));
    document.getElementById("np-reset-wl-button").addEventListener("click", () => {
      const defaults = getCurrentWindowDefaults();
      state.viewport.windowWidth = defaults.windowWidth;
      state.viewport.windowCenter = defaults.windowCenter;
      updateUi();
      render();
    });
    els.dicomToggleButton.addEventListener("click", () => {
      state.showDicomInfo = !state.showDicomInfo;
      updateDicomOverlay();
    });
    els.gridToggleButton.addEventListener("click", () => {
      state.showGridOverlay = !state.showGridOverlay;
      updateDicomOverlay();
      render();
    });
    document.getElementById("np-prev-slice").addEventListener("click", () => {
      setActiveSliceIndex(state.activeSliceIndex - 1);
      updateUi();
      render();
    });
    document.getElementById("np-next-slice").addEventListener("click", () => {
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
      updateDicomOverlay();
      render();
    });
    els.windowCenterInput.addEventListener("change", (event) => {
      state.viewport.windowCenter = Number(event.target.value) || state.viewport.windowCenter;
      updateDicomOverlay();
      render();
    });
    [els.npsEdgeInput, els.npsPeripheralInput, els.npsCenterInput, els.npsDetrendInput].forEach((input) => {
      input.addEventListener("change", () => {
        const circle = getSelectedCircle();
        if (circle) {
          circle.roiEdgePx = nextPowerOfTwo(Math.max(2, Number(els.npsEdgeInput.value) || circle.roiEdgePx));
          circle.peripheralRoiCount = Math.max(0, Math.round(Number(els.npsPeripheralInput.value) || circle.peripheralRoiCount));
          circle.includeCenter = els.npsCenterInput.checked;
          circle.detrendPlane = els.npsDetrendInput.checked;
          invalidateAnalysis();
          updateUi();
          render();
        }
      });
    });
    els.showNpsLabelsInput.addEventListener("change", () => {
      state.showNpsLabels = els.showNpsLabelsInput.checked;
      updateUi();
      render();
    });
    els.labelToggleButton?.addEventListener("click", () => {
      state.showNpsLabels = !state.showNpsLabels;
      updateUi();
      render();
    });
    document.getElementById("np-add-nps-set-circle-button").addEventListener("click", addCircleToSameNpsSet);
    document.getElementById("np-generate-nps-button").addEventListener("click", () => generateNpsForCircle());
    document.getElementById("np-duplicate-button").addEventListener("click", duplicateSelectedObject);
    document.getElementById("np-delete-button").addEventListener("click", deleteSelectedObject);
    document.getElementById("np-copy-to-all-button").addEventListener("click", copyToAllRecons);
    document.getElementById("np-export-button").addEventListener("click", () => {
      exportBundle().catch((error) => setStatus(error.message || "Export failed.", "error"));
    });
    els.printReportButton.addEventListener("click", () => {
      printReport().catch((error) => setStatus(error.message || "Report failed.", "error"));
    });

    els.contextMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-menu-action]");
      if (!button) {
        return;
      }
      const action = button.dataset.menuAction;
      closeContextMenu();
      if (action === "rename") {
        document.getElementById("np-selected-label")?.focus();
      } else if (action === "duplicate") {
        duplicateSelectedObject();
      } else if (action === "copy") {
        copySelectedToAllRecons();
      } else if (action === "generate-nps") {
        generateNpsForCircle();
      } else if (action === "delete") {
        deleteSelectedObject();
      }
    });
    window.addEventListener("mousedown", (event) => {
      if (!event.target.closest?.("[data-series-color-picker]")) {
        closeSeriesColorPickers();
      }
      if (event.target === els.canvas || els.contextMenu.contains(event.target)) {
        return;
      }
      closeContextMenu();
    });

    els.canvas.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    els.canvas.addEventListener("dblclick", handleDoubleClick);
    els.canvas.addEventListener("contextmenu", handleContextMenu);
    els.canvas.addEventListener("auxclick", (event) => event.preventDefault());
    els.canvas.addEventListener(
      "wheel",
      (event) => {
        if (!getActiveVolume()) {
          return;
        }
        event.preventDefault();
        if (event.metaKey || event.ctrlKey || state.activeTool === "zoom") {
          zoomViewportAt(event.clientX, event.clientY, state.viewport.zoom * Math.exp(-event.deltaY * 0.0015));
        } else if (Date.now() >= state.suppressSliceWheelUntil) {
          setActiveSliceIndex(state.activeSliceIndex + (event.deltaY > 0 ? 1 : -1));
        }
        updateUi();
        render();
      },
      { passive: false }
    );
    ["dragenter", "dragover"].forEach((type) => {
      els.dropzone.addEventListener(type, (event) => event.preventDefault());
    });
    els.dropzone.addEventListener("drop", async (event) => {
      event.preventDefault();
      try {
        const files = await collectDroppedFiles(event.dataTransfer);
        await loadFiles(files, { add: state.datasets.length > 0 });
      } catch (error) {
        setStatus(error.message || "Could not load dropped files.", "error");
      }
    });
    window.addEventListener("resize", () => {
      render();
      updateAnalysisCanvases();
    });
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => {
        render();
        updateAnalysisCanvases();
      });
      observer.observe(els.canvas);
      observer.observe(els.dropzone);
      observer.observe(els.analysisPage);
    }
    window.addEventListener("keydown", (event) => {
      if (isEditableEventTarget(event.target)) {
        if (event.key === "Escape") {
          closeSeriesColorPickers();
          event.target.blur?.();
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === "Escape") {
        closeSeriesColorPickers();
        closeContextMenu();
        state.circleDraft = null;
        setActiveTool("select");
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelectedObject();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "ArrowUp") {
        event.preventDefault();
        const index = state.datasets.findIndex((dataset) => dataset.id === state.activeDatasetId);
        if (index > 0) {
          setActiveDataset(state.datasets[index - 1].id);
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "ArrowDown") {
        event.preventDefault();
        const index = state.datasets.findIndex((dataset) => dataset.id === state.activeDatasetId);
        if (index >= 0 && index < state.datasets.length - 1) {
          setActiveDataset(state.datasets[index + 1].id);
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "w") {
        setActiveTool("windowLevel");
      } else if (key === "z") {
        setActiveTool("zoom");
      } else if (key === "m") {
        setActiveTool("pan");
      } else if (key === "r") {
        setActiveTool("noiseSquare");
      } else if (key === "n") {
        setActiveTool("noiseCircle");
      } else if (event.key === "ArrowUp") {
        setActiveSliceIndex(state.activeSliceIndex - 1);
      } else if (event.key === "ArrowDown") {
        setActiveSliceIndex(state.activeSliceIndex + 1);
      }
      updateUi();
      render();
    });
  }

  function init() {
    bindUi();
    updateUi();
    render();
    setStatus(`${APP_NAME} ${APP_VERSION} ready`);
  }

  window.addEventListener("DOMContentLoaded", init, { once: true });
})();
