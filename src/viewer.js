(function () {
  "use strict";

  const VIEWPORT_CONFIG = {
    presentation: { plane: "axial", title: "Presentation (Axial)", readoutLabel: "Axial" },
    axial: { plane: "coronal", title: "Coronal", readoutLabel: "Coronal" },
    sagittal: { plane: "axial", title: "Axial", readoutLabel: "Axial" },
    coronal: { plane: "sagittal", title: "Sagittal", readoutLabel: "Sagittal" },
  };

  const VIEWPORT_IDS = Object.keys(VIEWPORT_CONFIG);
  const COMPARISON_TILE_IDS = ["comparison-tile-1", "comparison-tile-2", "comparison-tile-3", "comparison-tile-4"];
  const COMPARISON_LAYOUTS = {
    single: {
      label: "Presentation",
      mode: "presentation",
      tileCount: 1,
      comparison: false,
      cssClass: "comparison-layout-single",
    },
    stacked2: {
      label: "Stacked 2",
      mode: "presentation",
      tileCount: 2,
      comparison: true,
      cssClass: "comparison-layout-stacked2",
    },
    columns2: {
      label: "Side by side",
      mode: "presentation",
      tileCount: 2,
      comparison: true,
      cssClass: "comparison-layout-columns2",
    },
    grid2x2: {
      label: "2 x 2",
      mode: "presentation",
      tileCount: 4,
      comparison: true,
      cssClass: "comparison-layout-grid2x2",
    },
    mpr: {
      label: "4-up MPR",
      mode: "mpr",
      tileCount: 1,
      comparison: false,
      cssClass: "comparison-layout-single",
    },
  };
  const PROFILE_TYPES = new Set(["lineProfile", "squareProfile", "plaqueLineProfile", "plaqueNoncalcifiedLineProfile", "vascularLineProfile"]);
  const LINE_PROFILE_TYPES = new Set(["lineProfile", "plaqueLineProfile", "plaqueNoncalcifiedLineProfile", "vascularLineProfile"]);
  const STENT_INTERFACE_PROFILE_TYPES = new Set(["lineProfile", "squareProfile"]);
  const MULTI_DIAMETER_TYPES = new Set(["bloomingDiameter", "stenosisDiameter"]);
  const MEASUREMENT_TYPES = new Set([
    "length",
    "probe",
    "freehandRoi",
    "brushRoi",
    "lineProfile",
    "squareProfile",
    "plaqueLineProfile",
    "plaqueNoncalcifiedLineProfile",
    "vascularLineProfile",
    "bloomingDiameter",
    "stenosisDiameter",
  ]);
  const POLYGON_DRAFT_TOOLS = new Set(["freehandRoi", "segmentationRoi"]);
  const CIRCULAR_ROI_SEGMENTS = 14;
  const ROI_HANDLE_LIMIT = 8;
  const DEFAULT_CIRCULAR_ROI_RADIUS_MM = 4;
  const MIN_CIRCULAR_ROI_DIAMETER_MM = 0.5;
  const FREEHAND_ROI_SAMPLE_DISTANCE_MM = 0.45;

  const VOI_PRESETS = {
    coronary: { label: "Coronary", width: 800, center: 250, builtIn: true },
    softTissue: { label: "Soft Tissue", width: 400, center: 40, builtIn: true },
    lung: { label: "Lung", width: 1500, center: -500, builtIn: true },
    bone: { label: "Bone", width: 2000, center: 300, builtIn: true },
  };
  const DEFAULT_VOI_PRESET_ORDER = ["coronary", "softTissue", "lung", "bone"];
  const VOI_PRESET_SHORTCUT_ACTIONS = {
    coronary: "presetCoronary",
    softTissue: "presetSoftTissue",
    lung: "presetLung",
    bone: "presetBone",
  };

  const MPR_LINE_COLORS = {
    axial: "#ffb000",
    coronal: "#d96cff",
    sagittal: "#34b8ff",
  };

  const DEFAULT_COLLAPSED_SECTIONS = {
    "annotate-actions": true,
    "analysis-export": true,
    "reference-study": true,
    "reference-help": true,
  };

  const SHORTCUT_STORAGE_KEY = "hagrad.shortcuts.v1";
  const VOI_PRESET_STORAGE_KEY = "hagrad.voi_presets.v1";
  const UI_MODE_STORAGE_KEY = "hagrad.ui_mode.v1";
  const SIDEBAR_TAB_STORAGE_KEY = "hagrad.sidebar_tab.v1";
  const PRESENTATION_SERIES_LABEL_STORAGE_KEY = "hagrad.presentation_series_label.v1";
  const PROJECT_WORKFLOW_ENABLED = false;
  const SESSION_AUTOSAVE_DELAY_MS = 900;
  const DUPLICATE_CHECK_DELAY_MS = 260;

  const BASELINE_EXPORT_GROUPS = [
    {
      id: "patientStudy",
      label: "Patient & Study",
      inputId: "baseline-group-patient-study",
    },
    {
      id: "reconstruction",
      label: "Reconstruction & Geometry",
      inputId: "baseline-group-reconstruction",
    },
    {
      id: "radiation",
      label: "Radiation & Dose",
      inputId: "baseline-group-radiation",
    },
    {
      id: "contrast",
      label: "Contrast & Reports",
      inputId: "baseline-group-contrast",
    },
  ];

  const SHORTCUT_ACTIONS = [
    { id: "circularRoi", label: "ROI Circle", defaultKey: "C", defaultMeaning: "Place a circle or ellipse ROI" },
    { id: "freehandRoi", label: "ROI Draw", defaultKey: "R", defaultMeaning: "Hold the left mouse button and trace a freehand ROI contour" },
    { id: "segmentationRoi", label: "ROI Multiple Click", defaultKey: "Q", defaultMeaning: "Place a smoothed click-by-click ROI" },
    { id: "brushRoi", label: "ROI Brush", defaultKey: "H", defaultMeaning: "Paint a threshold-based ROI" },
    { id: "contourCorrect", label: "Adjust ROI", defaultKey: "A", defaultMeaning: "Adjust part of the selected ROI contour" },
    { id: "eraser", label: "Eraser", defaultKey: "E", defaultMeaning: "Erase or trim annotations" },
    { id: "length", label: "Length", defaultKey: "L", defaultMeaning: "Place a distance measurement" },
    { id: "probe", label: "Probe", defaultKey: "B", defaultMeaning: "Sample one CT value" },
    { id: "lineProfile", label: "Stent-Lumen Line", defaultKey: "P", defaultMeaning: "Draw a line profile for stent-lumen interface analysis" },
    { id: "squareProfile", label: "Stent-Lumen Square", defaultKey: "S", defaultMeaning: "Draw a band profile for stent-lumen interface analysis" },
    { id: "plaqueLineProfile", label: "Plaque-Lumen Calcified", defaultKey: "I", defaultMeaning: "Draw a calcified plaque-lumen interface line profile" },
    { id: "plaqueNoncalcifiedLineProfile", label: "Plaque-Lumen Noncalcified", defaultKey: "N", defaultMeaning: "Draw a non-calcified plaque-lumen interface line profile" },
    { id: "vascularLineProfile", label: "Vascular Line Profile", defaultKey: "V", defaultMeaning: "Draw a vessel line profile for lumen FWHM and 10-90 edge sharpness" },
    { id: "bloomingDiameter", label: "Blooming Diameter", defaultKey: "", defaultMeaning: "Draw outer and parallel inner diameters to estimate blooming percentage" },
    { id: "stenosisDiameter", label: "Stenosis Diameter", defaultKey: "", defaultMeaning: "Draw proximal, distal, and minimal lumen diameters to estimate stenosis percentage" },
    { id: "arrow", label: "Arrow", defaultKey: "Y", defaultMeaning: "Place an arrow pointer" },
    { id: "text", label: "Text Label", defaultKey: "T", defaultMeaning: "Place a text label" },
    { id: "windowLevel", label: "WW/WL", defaultKey: "W", defaultMeaning: "Adjust window width and level" },
    { id: "pan", label: "Pan", defaultKey: "M", defaultMeaning: "Move the current viewport" },
    { id: "zoom", label: "Zoom", defaultKey: "Z", defaultMeaning: "Zoom the current viewport" },
    { id: "exportCine", label: "Export Cine", defaultKey: "", defaultMeaning: "Export a cine clip of the stack" },
    { id: "presetCoronary", label: "Coronary Preset", defaultKey: "1", defaultMeaning: "Apply the coronary window preset" },
    { id: "presetSoftTissue", label: "Soft Tissue Preset", defaultKey: "2", defaultMeaning: "Apply the soft tissue preset" },
    { id: "presetLung", label: "Lung Preset", defaultKey: "3", defaultMeaning: "Apply the lung preset" },
    { id: "presetBone", label: "Bone Preset", defaultKey: "4", defaultMeaning: "Apply the bone preset" },
  ];
  const RESERVED_EDITABLE_SHORTCUT_KEYS = new Set(["Space", "Escape", "+", "=", "-", "_"]);

  const TOOL_CONTEXT_NOTES = {
    edit: "Select an annotation, then drag it directly in the image or from the list below.",
    mprCursor: "Move the crosshair center or rotate MPR planes while keeping the other views synchronized.",
    windowLevel: "Adjust exact WW/WL values and presets for the active study.",
    pan: "Reposition the current viewport. Sync keeps the MPR panels moving together.",
    zoom: "Zoom the active viewport, with optional shared zoom across the MPR views.",
    circularRoi: "ROI Circle: click to define the ROI center, drag outward to size it, release to create it, then move or resize from the single handle.",
    length: "Place a distance measurement. It will appear in the annotation list and exports.",
    probe: "Sample one CT value at a point and keep it as its own saved result.",
    lineProfile: "Stent-lumen interface: draw a 1D HU profile, then refine the stent cutoffs in the profile panel if needed.",
    squareProfile: "Stent-lumen interface: draw a rectangular band profile for cleaner stent analysis and export.",
    plaqueLineProfile: "Plaque-lumen interface: draw across contrast lumen and calcified plaque to quantify blooming width and edge slope.",
    plaqueNoncalcifiedLineProfile: "Plaque-lumen interface: draw from contrast lumen into non-calcified plaque to quantify HU drop and interface width.",
    vascularLineProfile: "Vascular line profile: draw perpendicular across a vessel lumen to calculate FWHM diameter and left/right 10-90 edge sharpness.",
    bloomingDiameter: "Blooming diameter: draw the outer diameter first, then the inner lumen diameter. The inner line is constrained parallel to the outer line. HAGRad calculates ((outer - inner) / outer) x 100.",
    stenosisDiameter: "Stenosis diameter: draw proximal reference, distal reference, then minimal lumen diameter. HAGRad averages the references and calculates diameter stenosis.",
    freehandRoi: "ROI Draw: hold the left mouse button and trace the ROI freehand, then release to finish it.",
    segmentationRoi: "ROI Multiple Click: place multiple clicks around a target and finish with double click to create a smoothed ROI.",
    brushRoi: "Paint a threshold-aware continuous ROI with grow/shrink refinement.",
    contourCorrect: "Adjust ROI: start on or just beside an ROI contour, then redraw the segment you want to replace and release to smooth the correction in.",
    eraser: "Use the round eraser to trim ROIs or remove any touched annotation.",
    arrow: "Place a pointer to highlight a finding for presentation export.",
    text: "Drop a short text label anywhere on the image.",
  };

  const ROI_TOOL_KEYS = ["probe", "circularRoi", "freehandRoi", "segmentationRoi", "brushRoi", "contourCorrect", "eraser"];
  const ROI_TOOL_LABELS = {
    probe: "Probe",
    circularRoi: "ROI Circle",
    freehandRoi: "ROI Draw",
    segmentationRoi: "ROI Multiple Click",
    brushRoi: "ROI Brush",
    contourCorrect: "Adjust ROI",
    eraser: "Eraser",
  };
  const INTERFACE_TOOL_KEYS = [
    "lineProfile",
    "squareProfile",
    "plaqueLineProfile",
    "plaqueNoncalcifiedLineProfile",
    "vascularLineProfile",
  ];
  const INTERFACE_TOOL_LABELS = {
    lineProfile: "Stent Line",
    squareProfile: "Stent Square",
    plaqueLineProfile: "Plaque Calcified",
    plaqueNoncalcifiedLineProfile: "Plaque Noncalcified",
    vascularLineProfile: "Vascular Profile",
  };

  const DIAMETER_TOOL_CONFIGS = {
    bloomingDiameter: {
      label: "Blooming",
      roles: [
        { key: "outer", label: "Outer", color: "#ff7f6e" },
        { key: "inner", label: "Inner", color: "#f8f53a" },
      ],
    },
    stenosisDiameter: {
      label: "Stenosis",
      roles: [
        { key: "proximal", label: "Prox ref", color: "#57c8ff" },
        { key: "distal", label: "Dist ref", color: "#66d9d0" },
        { key: "minimal", label: "MLD", color: "#ff7f6e" },
      ],
    },
  };

  const RIGHT_DRAG_SCRUB_HEIGHT_FACTOR = 0.9;
  const RIGHT_CLICK_DOUBLE_MS = 320;

  const PROFILE_GUIDE_STYLES = {
    leftOutsideIndex: { color: "#57c8ff", label: "Outer L" },
    leftPeakIndex: { color: "#7af4a8", label: "Peak L" },
    lumenMinIndex: { color: "#f6f7f9", label: "Lumen" },
    rightPeakIndex: { color: "#7af4a8", label: "Peak R" },
    rightOutsideIndex: { color: "#57c8ff", label: "Outer R" },
  };

  const PLAQUE_PROFILE_GUIDE_STYLES = {
    outsideIndex: { color: "#57c8ff", label: "Out" },
    lumenIndex: { color: "#7af4a8", label: "Lumen" },
    plaqueIndex: { color: "#ff7f6e", label: "Plaque" },
    rightOutsideIndex: { color: "#f6f7f9", label: "Right" },
  };

  const VASCULAR_PROFILE_GUIDE_STYLES = {
    leftBackgroundIndex: { color: "#57c8ff", label: "BG L" },
    peakIndex: { color: "#f8f53a", label: "Peak" },
    rightBackgroundIndex: { color: "#66d9d0", label: "BG R" },
  };

  const TOOL_CURSORS = {
    edit: "default",
    mprCursor: "move",
    windowLevel: "crosshair",
    pan: "grab",
    zoom: "zoom-in",
    circularRoi: "crosshair",
    length: "crosshair",
    probe: "copy",
    lineProfile: "crosshair",
    squareProfile: "crosshair",
    plaqueLineProfile: "crosshair",
    plaqueNoncalcifiedLineProfile: "crosshair",
    vascularLineProfile: "crosshair",
    bloomingDiameter: "crosshair",
    stenosisDiameter: "crosshair",
    freehandRoi: "crosshair",
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
  const DIRECT_PIXEL_TRANSFER_SYNTAXES = new Set([
    "1.2.840.10008.1.2",
    "1.2.840.10008.1.2.1",
  ]);
  const DICOM_HEADER_READ_LIMITS = [
    256 * 1024,
    1024 * 1024,
    4 * 1024 * 1024,
    16 * 1024 * 1024,
    Infinity,
  ];
  const DICOM_HEADER_PARSE_CONCURRENCY = Math.min(
    8,
    Math.max(3, Math.floor(((window.navigator && window.navigator.hardwareConcurrency) || 8) / 2))
  );
  const DICOM_HEADER_PROGRESS_INTERVAL = 50;

  const RADIATION_REPORT_KEYWORDS = [
    "dose",
    "radiation",
    "ctdi",
    "dlp",
    "rdsr",
  ];

  const CONTRAST_REPORT_KEYWORDS = [
    "contrast",
    "bolus",
    "iodine",
    "saline",
    "inject",
    "flow rate",
  ];

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
    sourceRecords: [],
    projects: [],
    projectCases: [],
    activeProjectId: null,
    projectCaseId: "",
    projectCaseLabel: "",
    projectCaseFilter: "",
    duplicateMatches: [],
    baselineExportGroups: {
      patientStudy: true,
      reconstruction: true,
      radiation: true,
      contrast: true,
    },
    exportStudies: [],
    currentExportStudyId: "",
    uiMode: "advanced",
    activeSidebarTab: "case",
    activeReconId: null,
    referenceBasis: null,
    decoderFallbackReady: false,
    activeViewportId: "presentation",
    activeToolKey: "windowLevel",
    layout: "presentation",
    presentationFocus: false,
    focusSidebarOpen: false,
    focusReturnScroll: { x: 0, y: 0 },
    currentVOI: { width: VOI_PRESETS.coronary.width, center: VOI_PRESETS.coronary.center },
    currentPreset: "coronary",
    currentPresetDirty: false,
    voiPresets: {},
    voiPresetOrder: [...DEFAULT_VOI_PRESET_ORDER],
    voiPreferenceLoaded: false,
    showDicomMetadataOverlay: false,
    showPresentationSeriesLabel: true,
    showViewportOverlays: false,
    showViewportGrid: false,
    viewportOverlayPositions: {
      dicom: null,
      series: null,
    },
    syncMprTransforms: true,
    cineFps: 8,
    cineTimerId: null,
    dragging: null,
    polygonDraft: null,
    diameterDraft: null,
    contourCorrectionDraft: null,
    renderQueued: false,
    renderDirtyViewports: new Set(VIEWPORT_IDS),
    readoutsDirty: true,
    annotationSequence: 1,
    annotationClipboard: null,
    selectedAnnotationId: null,
    hoveredAnnotationId: null,
    selectedProfileAnnotationId: null,
    profileChartState: null,
    brushRoi: {
      minHu: -190,
      maxHu: -30,
      sizeMm: 4,
    },
    eraser: {
      sizeMm: 6,
      preview: null,
    },
    mpr: {
      centerWorld: null,
      overlayVisible: true,
      planeNormals: null,
      rotations: {
        axial: 0,
        coronal: 0,
        sagittal: 0,
      },
    },
    comparison: {
      layout: "single",
      syncEnabled: false,
      activeTileId: "comparison-tile-1",
      layoutMenuOpen: false,
      viewportOverrideActive: false,
      tiles: [],
    },
    maximizedViewportId: null,
    rightClick: {
      lastTap: null,
    },
    viewports: {},
    sidebarSections: {},
    shortcuts: {},
    projectSession: {
      autosaveTimerId: null,
      duplicateTimerId: null,
      lastSavedAt: "",
      hasSavedSession: false,
      saving: false,
      pending: false,
    },
    uiCache: {
      projectUi: "",
      projectCases: "",
      reconstructionList: "",
      comparisonLayer: "",
      annotationManager: "",
      metadata: "",
    },
    history: {
      undoStack: [],
      redoStack: [],
      isRestoring: false,
      limit: 40,
    },
  };

  window.HAGRadWorkflowGuardState = {
    hasOpenStudy() {
      return state.reconstructions.length > 0;
    },
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
    isSamePatientStudy,
    appendSourceDirectoryToKey,
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
    buildDicomVolumeInWorker,
    createVolumeFromWorkerPayload,
  } = sharedCore;
  const sharedProfileAnalysis = window.HAGRadProfileAnalysis;
  if (!sharedProfileAnalysis) {
    throw new Error("Missing profile analysis script: /src/shared/hagrad-profile-analysis.js");
  }
  const {
    averageFinite,
    smoothSeries,
    interpolateThresholdCrossing,
    sanitizeStentGuideIndices,
    sanitizePlaqueGuideIndices,
    analyzeProfileSamples,
  } = sharedProfileAnalysis;
  const exportStudyApi = window.HAGRadExportStudies || null;
  const overlayStyle = window.HAGRadOverlayStyle || null;

  function readDicomNumber(dataSet, tag) {
    const stringValue = parseFirstNumber(dataSet.string(tag));
    if (Number.isFinite(stringValue)) {
      return stringValue;
    }

    const element = dataSet.elements[tag];
    if (!element) {
      return null;
    }

    const readers = {
      US: "uint16",
      SS: "int16",
      UL: "uint32",
      SL: "int32",
      FL: "float",
      FD: "double",
    };
    const readerName = readers[element.vr || ""];
    if (!readerName || typeof dataSet[readerName] !== "function") {
      return null;
    }

    const value = dataSet[readerName](tag);
    return Number.isFinite(value) ? value : null;
  }

  function cacheElements() {
    els.app = document.querySelector(".app");
    els.dicomInput = document.getElementById("dicom-input");
    els.dicomFolderInput = document.getElementById("dicom-folder-input");
    els.dicomAddInput = document.getElementById("dicom-add-input");
    els.dicomAddFolderInput = document.getElementById("dicom-add-folder-input");
    els.clearButton = document.getElementById("clear-button");
    els.statusPill = document.getElementById("status-pill");
    els.uiModeButtons = Array.from(document.querySelectorAll("[data-ui-mode]"));
    els.sidebarTabButtons = Array.from(document.querySelectorAll("[data-sidebar-tab-button]"));
    els.projectSummary = document.getElementById("project-summary");
    els.projectSelect = document.getElementById("project-select");
    els.projectRefreshButton = document.getElementById("project-refresh-button");
    els.projectNextIdButton = document.getElementById("project-next-id-button");
    els.projectCreateNameInput = document.getElementById("project-create-name-input");
    els.projectCreateButton = document.getElementById("project-create-button");
    els.projectCaseIdInput = document.getElementById("project-case-id-input");
    els.projectCaseLabelInput = document.getElementById("project-case-label-input");
    els.projectCaseBrowserNote = document.getElementById("project-case-browser-note");
    els.projectCaseFilterInput = document.getElementById("project-case-filter-input");
    els.projectCaseList = document.getElementById("project-case-list");
    els.projectDuplicateShell = document.getElementById("project-duplicate-shell");
    els.projectDuplicateNote = document.getElementById("project-duplicate-note");
    els.projectDuplicateList = document.getElementById("project-duplicate-list");
    els.projectRestoreSessionButton = document.getElementById("project-restore-session-button");
    els.projectSessionNote = document.getElementById("project-session-note");
    els.layoutButtons = Array.from(document.querySelectorAll("[data-layout]"));
    els.toolButtons = Array.from(document.querySelectorAll("[data-tool]"));
    els.roiToolTrigger = document.getElementById("roi-tool-trigger");
    els.roiToolMenu = document.getElementById("roi-tool-menu");
    els.roiToolActiveLabel = document.getElementById("roi-tool-active-label");
    els.interfaceToolTrigger = document.getElementById("interface-tool-trigger");
    els.interfaceToolMenu = document.getElementById("interface-tool-menu");
    els.interfaceToolActiveLabel = document.getElementById("interface-tool-active-label");
    els.toolGroupTriggers = Array.from(document.querySelectorAll("[data-tool-group-toggle]"));
    els.toolSubmenus = Array.from(document.querySelectorAll("[data-tool-submenu]"));
    els.toolContextNote = document.getElementById("tool-context-note");
    els.toolScopedGroups = Array.from(document.querySelectorAll("[data-tool-scope]"));
    els.toolPanels = Array.from(document.querySelectorAll("[data-tool-panel]"));
    els.sidebarSections = Array.from(document.querySelectorAll("[data-section-id]"));
    els.sidebarSectionToggles = Array.from(document.querySelectorAll("[data-section-toggle]"));
    els.uiLevelElements = Array.from(document.querySelectorAll("[data-ui-level]"));
    els.sidebarTabElements = Array.from(document.querySelectorAll("[data-sidebar-tab]"));
    els.sidebar = document.querySelector(".sidebar");
    els.presetGrid = document.getElementById("preset-grid");
    els.presetButtons = Array.from(document.querySelectorAll("[data-preset]"));
    els.presetEditorNote = document.getElementById("preset-editor-note");
    els.presetNameInput = document.getElementById("preset-name-input");
    els.presetSaveButton = document.getElementById("preset-save-button");
    els.presetAddButton = document.getElementById("preset-add-button");
    els.presetResetButton = document.getElementById("preset-reset-button");
    els.resetButton = document.getElementById("reset-button");
    els.presentationResetWindowButton = document.getElementById("presentation-reset-window-button");
    els.presentationResetFitButton = document.getElementById("presentation-reset-fit-button");
    els.presentationModeToggleButton = document.getElementById("presentation-mode-toggle-button");
    els.presentationLayoutToggleButton = document.getElementById("presentation-layout-toggle-button");
    els.presentationLayoutMenu = document.getElementById("presentation-layout-menu");
    els.comparisonLayoutChoices = Array.from(document.querySelectorAll("[data-comparison-layout]"));
    els.comparisonSyncButton = document.getElementById("comparison-sync-button");
    els.presentationOverlayToggleButton = document.getElementById("presentation-overlay-toggle-button");
    els.presentationGridToggleButton = document.getElementById("presentation-grid-toggle-button");
    els.presentationFocusToggleButton = document.getElementById("presentation-focus-toggle-button");
    els.presentationFocusExitButton = document.getElementById("presentation-focus-exit-button");
    els.focusSidebarCollapseButton = document.getElementById("focus-sidebar-collapse-button");
    els.focusWorkflowButtons = Array.from(document.querySelectorAll("[data-focus-workflow-tab]"));
    els.focusFinishCloseButton = document.getElementById("focus-finish-close-button");
    els.undoButton = document.getElementById("undo-button");
    els.redoButton = document.getElementById("redo-button");
    els.historySummary = document.getElementById("history-summary");
    els.resetMprButton = document.getElementById("reset-mpr-button");
    els.syncMprButton = document.getElementById("sync-mpr-button");
    els.mprOverlayToggleButton = document.getElementById("mpr-overlay-toggle-button");
    els.clearMeasurementsButton = document.getElementById("clear-measurements-button");
    els.brushMinInput = document.getElementById("brush-min-input");
    els.brushMaxInput = document.getElementById("brush-max-input");
    els.brushSizeInput = document.getElementById("brush-size-input");
    els.eraserSizeInput = document.getElementById("eraser-size-input");
    els.brushShrinkButton = document.getElementById("brush-shrink-button");
    els.brushGrowButton = document.getElementById("brush-grow-button");
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
    els.annotationManagerNote = document.getElementById("annotation-manager-note");
    els.annotationManagerList = document.getElementById("annotation-manager-list");
    els.annotationRenameButton = document.getElementById("annotation-rename-button");
    els.annotationDeleteButton = document.getElementById("annotation-delete-button");
    els.shortcutResetButton = document.getElementById("shortcut-reset-button");
    els.shortcutTableBody = document.getElementById("shortcut-table-body");
    els.voiReadout = document.getElementById("voi-readout");
    els.exportCineButton = document.getElementById("export-cine-button");
    els.exportMeasurementsButton = document.getElementById("export-measurements-button");
    els.finishCloseButton = document.getElementById("finish-close-button");
    els.exportBaselineButton = document.getElementById("export-baseline-button");
    els.measurementExportModal = document.getElementById("measurement-export-modal");
    els.measurementExportCloseButton = document.getElementById("measurement-export-close-button");
    els.measurementExportCancelButton = document.getElementById("measurement-export-cancel-button");
    els.measurementExportConfirmButton = document.getElementById("measurement-export-confirm-button");
    els.measurementExportStudyIdInput = document.getElementById("measurement-export-study-id-input");
    els.measurementExportStudySelect = document.getElementById("measurement-export-study-select");
    els.measurementExportStudyCreateInput = document.getElementById("measurement-export-study-create-input");
    els.measurementExportStudyCreateButton = document.getElementById("measurement-export-study-create-button");
    els.measurementExportStudyTargetNote = document.getElementById("measurement-export-study-target-note");
    els.measurementExportTitle = document.getElementById("measurement-export-title");
    els.measurementExportCopy = document.getElementById("measurement-export-copy");
    els.baselineExportModal = document.getElementById("baseline-export-modal");
    els.baselineExportCloseButton = document.getElementById("baseline-export-close-button");
    els.baselineExportCancelButton = document.getElementById("baseline-export-cancel-button");
    els.baselineExportConfirmButton = document.getElementById("baseline-export-confirm-button");
    els.baselineExportStudyIdInput = document.getElementById("baseline-export-study-id-input");
    els.baselineExportStudySelect = document.getElementById("baseline-export-study-select");
    els.baselineExportStudyCreateInput = document.getElementById("baseline-export-study-create-input");
    els.baselineExportStudyCreateButton = document.getElementById("baseline-export-study-create-button");
    els.baselineExportStudyTargetNote = document.getElementById("baseline-export-study-target-note");
    els.baselineExportGroupInputs = BASELINE_EXPORT_GROUPS.reduce((accumulator, group) => {
      accumulator[group.id] = document.getElementById(group.inputId);
      return accumulator;
    }, {});
    els.profileStatus = document.getElementById("profile-status");
    els.profileChart = document.getElementById("profile-chart");
    els.profileResetAutoButton = document.getElementById("profile-reset-auto-button");
    els.profileMetrics = document.getElementById("profile-metrics");
    els.measurementCount = document.getElementById("measurement-count");
    els.metaPatient = document.getElementById("meta-patient");
    els.metaPatientId = document.getElementById("meta-patient-id");
    els.metaSeries = document.getElementById("meta-series");
    els.metaSeriesNumber = document.getElementById("meta-series-number");
    els.metaModality = document.getElementById("meta-modality");
    els.metaKernel = document.getElementById("meta-kernel");
    els.metaIterative = document.getElementById("meta-iterative");
    els.metaSlices = document.getElementById("meta-slices");
    els.metaMatrix = document.getElementById("meta-matrix");
    els.metaSpacing = document.getElementById("meta-spacing");
    els.metaThickness = document.getElementById("meta-thickness");
    els.metaIncrement = document.getElementById("meta-increment");
    els.metaKvp = document.getElementById("meta-kvp");
    els.metaTime = document.getElementById("meta-time");
    els.metaPosition = document.getElementById("meta-position");
    els.metadataOverlayToggleButton = document.getElementById("metadata-overlay-toggle-button");
    els.presentationSeriesLabelToggleButton = document.getElementById("presentation-series-label-toggle-button");
    els.presentationSeriesLabel = document.getElementById("presentation-series-label");
    els.presentationSeriesLabelText = document.getElementById("presentation-series-label-text");
    els.presentationSeriesLabelCloseButton = document.getElementById("presentation-series-label-close-button");
    els.toolHuds = Array.from(document.querySelectorAll("[data-tool-hud]"));
    els.emptyState = document.getElementById("empty-state");
    els.viewportGrid = document.getElementById("viewport-grid");
    els.comparisonLayer = document.getElementById("comparison-layer");
    els.stage = document.querySelector(".stage");
    els.viewportMiniActions = document.querySelector(".viewport-mini-actions");
    els.viewportPanels = Array.from(document.querySelectorAll(".viewport-panel"));
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
    els.dicomOverlays = {
      presentation: document.getElementById("presentation-dicom-overlay"),
      axial: document.getElementById("axial-dicom-overlay"),
      sagittal: document.getElementById("sagittal-dicom-overlay"),
      coronal: document.getElementById("coronal-dicom-overlay"),
    };
    els.sliceSlider = document.getElementById("slice-slider");
    els.sliceSummary = document.getElementById("slice-summary");
    els.presentationFastScrollSlider = document.getElementById("presentation-fast-scroll-slider");
    els.presentationFastScrollValue = document.getElementById("presentation-fast-scroll-value");
    els.cineSpeedSlider = document.getElementById("cine-speed-slider");
    els.cineSpeedReadout = document.getElementById("cine-speed-readout");
    els.cineButton = document.getElementById("cine-button");
  }

  function relocateViewportMiniActions() {
    if (!els.stage || !els.viewportMiniActions || els.viewportMiniActions.parentElement === els.stage) {
      return;
    }
    els.stage.insertBefore(els.viewportMiniActions, els.comparisonLayer || null);
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

  function updateProjectWorkflowAvailability() {
    const elements = Array.from(document.querySelectorAll("[data-project-workflow]"));
    elements.forEach((element) => {
      element.classList.toggle("is-hidden", !PROJECT_WORKFLOW_ENABLED);
    });
  }

  function parsePatientAgeYears(value) {
    const text = safeString(value);
    if (!text) {
      return null;
    }
    const amount = Number.parseInt(text, 10);
    if (!Number.isFinite(amount)) {
      return null;
    }
    const unit = text.slice(-1).toUpperCase();
    if (unit === "Y") {
      return amount;
    }
    if (unit === "M") {
      return amount / 12;
    }
    if (unit === "W") {
      return amount / 52.1775;
    }
    if (unit === "D") {
      return amount / 365.25;
    }
    return amount;
  }

  function computeBodyMassIndex(weightKg, sizeM) {
    if (!Number.isFinite(weightKg) || !Number.isFinite(sizeM) || sizeM <= 0) {
      return null;
    }
    return weightKg / (sizeM * sizeM);
  }

  function getFileSourceKey(file) {
    return [file.name || "file", file.size || 0, file.lastModified || 0].join("::");
  }

  function normalizeReportText(value) {
    return String(value || "")
      .replace(/[\u0000-\u001f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractReportSnippet(text, keywords) {
    if (!text) {
      return null;
    }
    const lower = text.toLowerCase();
    let bestIndex = -1;
    keywords.forEach((keyword) => {
      const index = lower.indexOf(keyword);
      if (index >= 0 && (bestIndex < 0 || index < bestIndex)) {
        bestIndex = index;
      }
    });
    if (bestIndex < 0) {
      return null;
    }
    const start = Math.max(0, bestIndex - 90);
    const end = Math.min(text.length, bestIndex + 210);
    return text.slice(start, end).trim();
  }

  function extractReportNumber(text, regex) {
    if (!text) {
      return null;
    }
    const match = regex.exec(text);
    if (!match) {
      return null;
    }
    const value = Number.parseFloat(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  function extractReportInsights(buffer, hasPixelData) {
    if (hasPixelData) {
      return {
        textSummary: null,
        radiationSnippet: null,
        contrastSnippet: null,
        ctdiVolMgy: null,
        dlpMgyCm: null,
        contrastVolumeMl: null,
        contrastFlowRateMlPerS: null,
      };
    }

    let decodedText = "";
    try {
      decodedText = new TextDecoder("latin1").decode(new Uint8Array(buffer));
    } catch (error) {
      decodedText = "";
    }

    const normalized = normalizeReportText(decodedText);
    if (!normalized) {
      return {
        textSummary: null,
        radiationSnippet: null,
        contrastSnippet: null,
        ctdiVolMgy: null,
        dlpMgyCm: null,
        contrastVolumeMl: null,
        contrastFlowRateMlPerS: null,
      };
    }

    return {
      textSummary: normalized.slice(0, 420),
      radiationSnippet: extractReportSnippet(normalized, RADIATION_REPORT_KEYWORDS),
      contrastSnippet: extractReportSnippet(normalized, CONTRAST_REPORT_KEYWORDS),
      ctdiVolMgy: extractReportNumber(normalized, /\bCTDI(?:VOL)?\b[^0-9]{0,24}([0-9]+(?:\.[0-9]+)?)/i),
      dlpMgyCm: extractReportNumber(normalized, /\bDLP\b[^0-9]{0,24}([0-9]+(?:\.[0-9]+)?)/i),
      contrastVolumeMl: extractReportNumber(
        normalized,
        /\b(?:CONTRAST(?: BOLUS)? VOLUME|BOLUS VOLUME|VOLUME)\b[^0-9]{0,24}([0-9]+(?:\.[0-9]+)?)\s*(?:ML|CC)\b/i
      ),
      contrastFlowRateMlPerS: extractReportNumber(
        normalized,
        /\b(?:FLOW RATE|RATE)\b[^0-9]{0,24}([0-9]+(?:\.[0-9]+)?)\s*(?:ML\/S|ML\/SEC|CC\/S)\b/i
      ),
    };
  }

  function uniqueDefinedValues(values) {
    const seen = new Set();
    const unique = [];
    values.forEach((value) => {
      if (value == null || value === "") {
        return;
      }
      const key = typeof value === "number" ? `n:${value}` : `s:${String(value)}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      unique.push(value);
    });
    return unique;
  }

  function collectRecordValues(records, selector) {
    return uniqueDefinedValues(
      records
        .map((record) => selector(record))
        .filter((value) => value != null && value !== "")
    );
  }

  function formatAggregatedValue(values, formatter) {
    if (!values.length) {
      return "";
    }
    return values
      .map((value) => (formatter ? formatter(value) : String(value)))
      .filter((value) => value != null && value !== "")
      .join(" | ");
  }

  function formatNumberForCsv(value, decimals) {
    if (!Number.isFinite(value)) {
      return "";
    }
    return Number(value)
      .toFixed(decimals ?? 3)
      .replace(/\.?0+$/, "");
  }

  function buildExportFilename(prefix, extension, options) {
    const reconstruction = getActiveReconstruction();
    const record = reconstruction?.records?.[0] || {};
    const patient = sanitizeFilePart(record.patientName || record.patientId, "patient");
    const series = sanitizeFilePart(reconstruction?.label || record.seriesDescription || "series", "series");
    const studyId = safeString(options?.studyId);
    const studySegment = studyId ? `${sanitizeFilePart(studyId, "study")}_` : "";
    return `${prefix}_${studySegment}${patient}_${series}.${extension}`;
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
          workflow: "viewer",
          filename,
          contentBase64,
          mimeType: blob.type || "application/octet-stream",
          studyId: state.currentExportStudyId || "",
          patientStudyId: safeString(options?.patientStudyId || ""),
        }),
      });
    } catch (error) {
      console.warn("Could not mirror the export into the local outbox.", error);
    }
  }

  async function downloadCanvas(canvas, filename, options) {
    const blob = await canvasToPngBlob(canvas);
    return downloadExportBundle(
      [{ filename, blob }],
      window.HAGRadZip?.zipNameFrom ? window.HAGRadZip.zipNameFrom(filename) : filename.replace(/\.[^.]+$/, ".zip"),
      options
    );
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || `Request failed with status ${response.status}.`);
    }
    return payload;
  }

  function loadUiModePreference() {
    state.uiMode = "advanced";
    try {
      window.localStorage?.setItem(UI_MODE_STORAGE_KEY, "advanced");
    } catch (_error) {
      // Ignore storage issues.
    }
  }

  function saveUiModePreference() {
    try {
      window.localStorage?.setItem(UI_MODE_STORAGE_KEY, state.uiMode);
    } catch (_error) {
      // Ignore storage issues.
    }
  }

  function loadSidebarTabPreference() {
    try {
      const stored = String(window.localStorage?.getItem(SIDEBAR_TAB_STORAGE_KEY) || "").trim().toLowerCase();
      if (stored === "case" || stored === "annotate" || stored === "export") {
        state.activeSidebarTab = stored;
      }
    } catch (_error) {
      state.activeSidebarTab = "case";
    }
  }

  function saveSidebarTabPreference() {
    try {
      window.localStorage?.setItem(SIDEBAR_TAB_STORAGE_KEY, state.activeSidebarTab);
    } catch (_error) {
      // Ignore storage issues.
    }
  }

  function loadPresentationSeriesLabelPreference() {
    try {
      const stored = window.localStorage?.getItem(PRESENTATION_SERIES_LABEL_STORAGE_KEY);
      if (stored === "0" || stored === "1") {
        state.showPresentationSeriesLabel = stored !== "0";
      }
    } catch (_error) {
      state.showPresentationSeriesLabel = true;
    }
  }

  function savePresentationSeriesLabelPreference() {
    try {
      window.localStorage?.setItem(
        PRESENTATION_SERIES_LABEL_STORAGE_KEY,
        state.showPresentationSeriesLabel ? "1" : "0"
      );
    } catch (_error) {
      // Ignore storage issues.
    }
  }

  function formatTimestampForUi(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
      return "";
    }
    try {
      return date.toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_error) {
      return value;
    }
  }

  function getCurrentProjectCaseId() {
    return sanitizeProjectCaseId(state.projectCaseId);
  }

  function updateUiModeUi() {
    state.uiMode = "advanced";
    els.uiModeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.uiMode === state.uiMode);
    });
    els.uiLevelElements.forEach((element) => {
      element.classList.remove("is-ui-hidden");
    });
  }

  function updateSidebarTabsUi() {
    els.sidebarTabButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.sidebarTabButton === state.activeSidebarTab);
    });
    els.sidebarTabElements.forEach((element) => {
      element.classList.toggle("is-ui-hidden", element.dataset.sidebarTab !== state.activeSidebarTab);
    });
  }

  function setUiMode(mode) {
    void mode;
    state.uiMode = "advanced";
    saveUiModePreference();
    updateUiModeUi();
  }

  function setActiveSidebarTab(tabKey) {
    const nextTab = ["case", "annotate", "export"].includes(tabKey) ? tabKey : "case";
    if (state.activeSidebarTab === nextTab) {
      updateSidebarTabsUi();
      updatePresentationFocusUi();
      return;
    }
    state.activeSidebarTab = nextTab;
    saveSidebarTabPreference();
    updateSidebarTabsUi();
    updatePresentationFocusUi();
  }

  function getActiveProject() {
    return state.projects.find((project) => project.id === state.activeProjectId) || null;
  }

  function sanitizeProjectCaseId(value) {
    return String(value || "")
      .trim()
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function buildProjectCaseSummary() {
    const reconstruction = getActiveReconstruction() || state.reconstructions[0] || null;
    const record = reconstruction?.records?.[0] || state.sourceRecords[0] || {};
    return {
      caseId: sanitizeProjectCaseId(state.projectCaseId),
      caseLabel: String(state.projectCaseLabel || "").trim(),
      patientName: record.patientName || "",
      patientId: record.patientId || "",
      patientBirthDate: formatDicomDate(record.patientBirthDate) || "",
      patientSex: record.patientSex || "",
      patientAgeDicom: record.patientAge || "",
      patientAgeYears: formatNumberForCsv(parsePatientAgeYears(record.patientAge), 2),
      accessionNumber: record.accessionNumber || "",
      studyInstanceUID: record.studyInstanceUID || "",
      studyDateTime: combineDateTime(record) === "-" ? "" : combineDateTime(record),
    };
  }

  function getMatchingProjectCase(caseId) {
    const normalized = sanitizeProjectCaseId(caseId || state.projectCaseId);
    if (!normalized) {
      return null;
    }
    return state.projectCases.find((projectCase) => sanitizeProjectCaseId(projectCase.case_id) === normalized) || null;
  }

  function getProjectSessionSummaryText() {
    const project = getActiveProject();
    if (!project) {
      return "Select a project to start building a case list.";
    }
    if (!getCurrentProjectCaseId()) {
      return "Set or accept a project case ID to enable autosave for this case.";
    }
    if (!state.reconstructions.length) {
      return "Load a study to start autosave for this project case.";
    }
    if (state.projectSession.saving) {
      return "Saving this workspace to the project folder...";
    }
    if (state.projectSession.pending) {
      return "Autosave pending. The current layout and annotations will be stored shortly.";
    }
    if (state.projectSession.lastSavedAt) {
      return `Workspace autosaved ${formatTimestampForUi(state.projectSession.lastSavedAt)}.`;
    }
    return "Autosave is ready for this case.";
  }

  function renderProjectUi() {
    if (!PROJECT_WORKFLOW_ENABLED) {
      return;
    }
    if (!els.projectSelect) {
      return;
    }

    const signature = JSON.stringify({
      projects: state.projects.map((project) => ({
        id: project.id,
        name: project.name,
        caseCount: project.caseCount,
        nextCaseId: project.nextCaseId,
      })),
      activeProjectId: state.activeProjectId,
      projectCaseId: state.projectCaseId,
      projectCaseLabel: state.projectCaseLabel,
      hasSavedSession: state.projectSession.hasSavedSession,
      lastSavedAt: state.projectSession.lastSavedAt,
      sessionPending: state.projectSession.pending,
      sessionSaving: state.projectSession.saving,
    });
    if (state.uiCache.projectUi === signature) {
      return;
    }
    state.uiCache.projectUi = signature;

    const selectedValue = state.activeProjectId || "";
    els.projectSelect.innerHTML = "";
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "No project selected";
    els.projectSelect.appendChild(emptyOption);

    state.projects.forEach((project) => {
      const option = document.createElement("option");
      option.value = project.id;
      option.textContent = `${project.name} (${project.caseCount || 0})`;
      els.projectSelect.appendChild(option);
    });
    els.projectSelect.value = state.projects.some((project) => project.id === selectedValue) ? selectedValue : "";

    const activeProject = getActiveProject();
    els.projectSummary.textContent = activeProject
      ? `${activeProject.name} • next ${activeProject.nextCaseId || "-"}`
      : "No project selected";
    els.projectCaseIdInput.value = state.projectCaseId || "";
    els.projectCaseLabelInput.value = state.projectCaseLabel || "";
    if (els.projectCaseFilterInput) {
      els.projectCaseFilterInput.value = state.projectCaseFilter || "";
    }
    if (els.projectSessionNote) {
      els.projectSessionNote.textContent = getProjectSessionSummaryText();
    }
    if (els.projectRestoreSessionButton) {
      els.projectRestoreSessionButton.disabled = !Boolean(getMatchingProjectCase()?.has_session || state.projectSession.hasSavedSession);
    }
  }

  function buildProjectCaseRowText(projectCase) {
    return [
      projectCase.case_id,
      projectCase.case_label,
      projectCase.patient_id,
      projectCase.patient_name,
      projectCase.study_instance_uid,
      projectCase.accession_number,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function createProjectCaseItem(projectCase, options) {
    const isCurrent = sanitizeProjectCaseId(projectCase.case_id) === getCurrentProjectCaseId();
    const isDuplicate = Boolean(options?.isDuplicate);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-case-item";
    button.classList.toggle("is-current", isCurrent);
    button.classList.toggle("is-duplicate", isDuplicate);

    const topLine = document.createElement("div");
    topLine.className = "project-case-topline";
    const id = document.createElement("span");
    id.className = "project-case-id";
    id.textContent = projectCase.case_id || "case";
    const time = document.createElement("span");
    time.className = "project-case-time";
    time.textContent = formatTimestampForUi(projectCase.updated_at || projectCase.created_at) || "No timestamp";
    topLine.appendChild(id);
    topLine.appendChild(time);

    const label = document.createElement("div");
    label.className = "project-case-label";
    label.textContent =
      projectCase.case_label ||
      projectCase.patient_name ||
      projectCase.patient_id ||
      "No label saved yet";

    const meta = document.createElement("div");
    meta.className = "project-case-meta";
    const patientBits = [projectCase.patient_id, projectCase.patient_sex, projectCase.patient_age_dicom].filter(Boolean);
    const studyBits = [projectCase.study_datetime, projectCase.accession_number].filter(Boolean);
    meta.textContent = [patientBits.join(" • "), studyBits.join(" • ")].filter(Boolean).join("  |  ") || "No patient metadata saved";

    const badges = document.createElement("div");
    badges.className = "project-case-badges";
    if (projectCase.has_session) {
      const badge = document.createElement("span");
      badge.className = "project-case-badge is-session";
      badge.textContent = "session";
      badges.appendChild(badge);
    }
    if (Number(projectCase.export_count) > 0) {
      const badge = document.createElement("span");
      badge.className = "project-case-badge is-exports";
      badge.textContent = `${projectCase.export_count} exports`;
      badges.appendChild(badge);
    }
    if (isDuplicate) {
      const badge = document.createElement("span");
      badge.className = "project-case-badge is-match";
      badge.textContent = `${projectCase.match_score || 0} match`;
      badges.appendChild(badge);
    }

    button.appendChild(topLine);
    button.appendChild(label);
    button.appendChild(meta);
    if (badges.childNodes.length) {
      button.appendChild(badges);
    }

    button.addEventListener("click", async () => {
      await adoptProjectCase(projectCase, { restore: true });
    });

    return button;
  }

  function renderProjectCases() {
    if (!PROJECT_WORKFLOW_ENABLED) {
      return;
    }
    if (!els.projectCaseList || !els.projectCaseBrowserNote) {
      return;
    }

    const signature = JSON.stringify({
      projectId: state.activeProjectId,
      filter: state.projectCaseFilter,
      currentCaseId: getCurrentProjectCaseId(),
      sessionSavedAt: state.projectSession.lastSavedAt,
      cases: state.projectCases.map((projectCase) => ({
        case_id: projectCase.case_id,
        case_label: projectCase.case_label,
        patient_id: projectCase.patient_id,
        updated_at: projectCase.updated_at,
        has_session: projectCase.has_session,
        export_count: projectCase.export_count,
      })),
      duplicates: state.duplicateMatches.map((match) => ({
        case_id: match.case_id,
        match_score: match.match_score,
      })),
    });
    if (state.uiCache.projectCases === signature) {
      return;
    }
    state.uiCache.projectCases = signature;

    const project = getActiveProject();
    els.projectCaseList.innerHTML = "";
    els.projectDuplicateList.innerHTML = "";

    if (!project) {
      els.projectCaseBrowserNote.textContent = "No project selected";
      els.projectCaseList.innerHTML = `<p class="annotation-empty">Select a project to browse saved cases.</p>`;
      els.projectDuplicateShell.classList.add("is-hidden");
      return;
    }

    const filter = String(state.projectCaseFilter || "").trim().toLowerCase();
    const filteredCases = state.projectCases.filter((projectCase) => !filter || buildProjectCaseRowText(projectCase).includes(filter));
    const caseCount = filteredCases.length;
    const visibleDuplicates = state.duplicateMatches.filter(
      (projectCase) => sanitizeProjectCaseId(projectCase.case_id) !== getCurrentProjectCaseId()
    );
    const duplicateCount = visibleDuplicates.length;
    els.projectCaseBrowserNote.textContent = `${caseCount} case${caseCount === 1 ? "" : "s"}${duplicateCount ? ` • ${duplicateCount} possible match${duplicateCount === 1 ? "" : "es"}` : ""}`;

    if (duplicateCount) {
      els.projectDuplicateShell.classList.remove("is-hidden");
      els.projectDuplicateNote.textContent = `${duplicateCount} match${duplicateCount === 1 ? "" : "es"} against the loaded study`;
      const duplicateFragment = document.createDocumentFragment();
      visibleDuplicates.forEach((projectCase) => {
        duplicateFragment.appendChild(createProjectCaseItem(projectCase, { isDuplicate: true }));
      });
      els.projectDuplicateList.appendChild(duplicateFragment);
    } else {
      els.projectDuplicateShell.classList.add("is-hidden");
      els.projectDuplicateNote.textContent = "No duplicate matches";
    }

    if (!filteredCases.length) {
      els.projectCaseList.innerHTML = `<p class="annotation-empty">No project cases match this filter.</p>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    filteredCases.forEach((projectCase) => {
      fragment.appendChild(createProjectCaseItem(projectCase));
    });
    els.projectCaseList.appendChild(fragment);
  }

  async function loadProjectCasesFromBackend() {
    if (!PROJECT_WORKFLOW_ENABLED) {
      state.projectCases = [];
      state.duplicateMatches = [];
      state.projectSession.hasSavedSession = false;
      state.projectSession.lastSavedAt = "";
      return;
    }
    if (!state.activeProjectId) {
      state.projectCases = [];
      state.duplicateMatches = [];
      state.projectSession.hasSavedSession = false;
      state.projectSession.lastSavedAt = "";
      renderProjectCases();
      return;
    }

    const payload = await fetchJson("/api/projects/cases", {
      method: "POST",
      body: JSON.stringify({ projectId: state.activeProjectId }),
    });
    state.projectCases = payload.cases || [];
    const matchingCase = getMatchingProjectCase();
    state.projectSession.hasSavedSession = Boolean(matchingCase?.has_session);
    state.projectSession.lastSavedAt = matchingCase?.session_saved_at || "";
    renderProjectCases();
  }

  async function runProjectDuplicateCheck() {
    if (!PROJECT_WORKFLOW_ENABLED) {
      state.duplicateMatches = [];
      return;
    }
    if (!state.activeProjectId) {
      state.duplicateMatches = [];
      renderProjectCases();
      return;
    }

    const caseSummary = buildProjectCaseSummary();
    if (
      !caseSummary.studyInstanceUID &&
      !caseSummary.patientId &&
      !caseSummary.accessionNumber &&
      !caseSummary.patientName
    ) {
      state.duplicateMatches = [];
      renderProjectCases();
      return;
    }

    const payload = await fetchJson("/api/projects/find-duplicates", {
      method: "POST",
      body: JSON.stringify({
        projectId: state.activeProjectId,
        case: caseSummary,
      }),
    });
    state.duplicateMatches = (payload.matches || []).filter(
      (match) => sanitizeProjectCaseId(match.case_id) !== getCurrentProjectCaseId()
    );
    renderProjectCases();
  }

  function scheduleProjectDuplicateCheck(options) {
    if (!PROJECT_WORKFLOW_ENABLED) {
      return;
    }
    if (state.projectSession.duplicateTimerId) {
      window.clearTimeout(state.projectSession.duplicateTimerId);
      state.projectSession.duplicateTimerId = null;
    }
    const runner = () => {
      runProjectDuplicateCheck().catch((error) => {
        console.error(error);
      });
    };
    if (options?.immediate) {
      runner();
      return;
    }
    state.projectSession.duplicateTimerId = window.setTimeout(runner, DUPLICATE_CHECK_DELAY_MS);
  }

  async function loadProjectsFromBackend(options) {
    if (!PROJECT_WORKFLOW_ENABLED) {
      state.projects = [];
      state.projectCases = [];
      state.activeProjectId = null;
      state.projectCaseId = "";
      state.projectCaseLabel = "";
      state.duplicateMatches = [];
      state.projectSession.hasSavedSession = false;
      state.projectSession.lastSavedAt = "";
      updateSidebarUi();
      return;
    }
    const payload = await fetchJson("/api/projects", {
      method: "GET",
      headers: {},
    });
    state.projects = payload.projects || [];
    state.activeProjectId = payload.currentProjectId || null;

    if (state.activeProjectId && (!state.projectCaseId || options?.refreshCaseId)) {
      try {
        const nextPayload = await fetchJson("/api/projects/next-case-id", {
          method: "POST",
          body: JSON.stringify({ projectId: state.activeProjectId }),
        });
        state.projectCaseId = sanitizeProjectCaseId(nextPayload.caseId || state.projectCaseId);
      } catch (_error) {
        // Keep any existing case ID if auto-suggestion fails.
      }
    }

    await loadProjectCasesFromBackend();
    scheduleProjectDuplicateCheck({ immediate: true });
    updateSidebarUi();
  }

  async function createProjectFromInput() {
    if (!PROJECT_WORKFLOW_ENABLED) {
      return null;
    }
    const name = String(els.projectCreateNameInput.value || "").trim();
    if (!name) {
      throw new Error("Enter a project name first.");
    }
    const payload = await fetchJson("/api/projects/create", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    state.projects = payload.projects || [];
    state.activeProjectId = payload.currentProjectId || payload.project?.id || null;
    state.projectCaseId = sanitizeProjectCaseId(payload.project?.nextCaseId || "");
    state.projectCaseLabel = "";
    els.projectCreateNameInput.value = "";
    await loadProjectCasesFromBackend();
    scheduleProjectDuplicateCheck({ immediate: true });
    updateSidebarUi();
    requestProjectSessionAutosave();
    setStatus(`Project ${payload.project?.name || "created"} is ready.`);
  }

  async function selectProject(projectId) {
    if (!PROJECT_WORKFLOW_ENABLED) {
      return null;
    }
    const payload = await fetchJson("/api/projects/select", {
      method: "POST",
      body: JSON.stringify({ projectId }),
    });
    state.projects = payload.projects || [];
    state.activeProjectId = payload.currentProjectId || null;
    if (state.activeProjectId) {
      const nextPayload = await fetchJson("/api/projects/next-case-id", {
        method: "POST",
        body: JSON.stringify({ projectId: state.activeProjectId }),
      });
      state.projectCaseId = sanitizeProjectCaseId(nextPayload.caseId || state.projectCaseId);
    } else {
      state.projectCaseId = "";
    }
    state.projectCaseLabel = "";
    await loadProjectCasesFromBackend();
    scheduleProjectDuplicateCheck({ immediate: true });
    updateSidebarUi();
    requestProjectSessionAutosave();
    setStatus(state.activeProjectId ? `Project selected.` : "Project selection cleared.");
  }

  async function refreshSuggestedProjectCaseId() {
    if (!PROJECT_WORKFLOW_ENABLED) {
      return null;
    }
    const project = getActiveProject();
    if (!project) {
      throw new Error("Select a project first.");
    }
    const payload = await fetchJson("/api/projects/next-case-id", {
      method: "POST",
      body: JSON.stringify({ projectId: project.id }),
    });
    state.projectCaseId = sanitizeProjectCaseId(payload.caseId || "");
    await loadProjectCasesFromBackend();
    scheduleProjectDuplicateCheck({ immediate: true });
    updateSidebarUi();
    requestProjectSessionAutosave();
    setStatus(`Suggested case ID updated to ${state.projectCaseId}.`);
  }

  async function adoptProjectCase(projectCase, options) {
    if (!PROJECT_WORKFLOW_ENABLED) {
      return null;
    }
    state.projectCaseId = sanitizeProjectCaseId(projectCase.case_id || "");
    state.projectCaseLabel = String(projectCase.case_label || "").trim();
    state.projectSession.hasSavedSession = Boolean(projectCase.has_session);
    state.projectSession.lastSavedAt = String(projectCase.session_saved_at || "");
    updateSidebarUi();
    scheduleProjectDuplicateCheck({ immediate: true });

    if (options?.restore && projectCase.has_session) {
      const restored = await restoreProjectSessionFromBackend(projectCase.case_id, { silent: true });
      setStatus(
        restored
          ? `Using ${projectCase.case_id} and restored its saved workspace.`
          : `Using ${projectCase.case_id}. Load the matching study to restore its saved workspace.`
      );
    } else {
      setStatus(`Using ${projectCase.case_id} for this project case.`);
    }
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

  function getImageCount() {
    return getActiveReconstruction()?.volume.depth || 0;
  }

  function createComparisonViewportState(id) {
    return {
      id,
      canvas: null,
      ctx: null,
      zoom: 1,
      panX: 0,
      panY: 0,
      lastGeometry: null,
      lastFrame: null,
      bufferCanvas: null,
    };
  }

  function createComparisonTile(id, index) {
    return {
      id,
      index,
      reconstructionId: null,
      centerWorld: null,
      voi: { ...state.currentVOI },
      viewports: Object.fromEntries(
        VIEWPORT_IDS.map((viewportId) => [viewportId, createComparisonViewportState(`${id}-${viewportId}`)])
      ),
    };
  }

  function ensureComparisonTiles() {
    if (state.comparison.tiles.length === COMPARISON_TILE_IDS.length) {
      return;
    }
    state.comparison.tiles = COMPARISON_TILE_IDS.map((id, index) => {
      const existing = state.comparison.tiles.find((tile) => tile.id === id);
      return existing || createComparisonTile(id, index);
    });
  }

  function getComparisonLayoutDefinition(layoutKey) {
    return COMPARISON_LAYOUTS[layoutKey] || COMPARISON_LAYOUTS.single;
  }

  function isComparisonActive() {
    return Boolean(getComparisonLayoutDefinition(state.comparison.layout).comparison);
  }

  function getVisibleComparisonTiles() {
    ensureComparisonTiles();
    const definition = getComparisonLayoutDefinition(state.comparison.layout);
    return state.comparison.tiles.slice(0, definition.tileCount);
  }

  function getComparisonTile(tileId) {
    ensureComparisonTiles();
    return state.comparison.tiles.find((tile) => tile.id === tileId) || state.comparison.tiles[0] || null;
  }

  function getReconstructionById(reconstructionId) {
    return state.reconstructions.find((reconstruction) => reconstruction.id === reconstructionId) || null;
  }

  function getActiveComparisonTile() {
    return getComparisonTile(state.comparison.activeTileId);
  }

  function withComparisonViewportOverride(tile, viewportId, callback) {
    const viewportState = tile?.viewports?.[viewportId];
    if (!tile || !viewportState || !VIEWPORT_IDS.includes(viewportId)) {
      return callback();
    }
    const previousViewportState = state.viewports[viewportId];
    const previousOverrideActive = state.comparison.viewportOverrideActive;
    state.viewports[viewportId] = viewportState;
    state.comparison.viewportOverrideActive = true;
    try {
      return callback();
    } finally {
      state.viewports[viewportId] = previousViewportState;
      state.comparison.viewportOverrideActive = previousOverrideActive;
    }
  }

  function tagComparisonDragging(tile, pointerElement) {
    if (!tile || !state.dragging || state.dragging.comparisonTileId) {
      return;
    }
    state.dragging.comparisonTileId = tile.id;
    state.dragging.pointerElement = pointerElement;
  }

  function cloneVoi(voi) {
    return {
      width: clamp(Math.round(Number(voi?.width) || state.currentVOI.width), 1, 4000),
      center: clamp(Math.round(Number(voi?.center) || state.currentVOI.center), -1200, 3000),
    };
  }

  function resetComparisonViewportTransforms(tile) {
    Object.values(tile?.viewports || {}).forEach((viewportState) => {
      viewportState.zoom = 1;
      viewportState.panX = 0;
      viewportState.panY = 0;
      viewportState.lastGeometry = null;
      viewportState.lastFrame = null;
    });
  }

  function assignComparisonTileReconstruction(tileId, reconstructionId, options = {}) {
    const tile = getComparisonTile(tileId);
    const reconstruction = getReconstructionById(reconstructionId);
    if (!tile || !reconstruction) {
      return false;
    }

    tile.reconstructionId = reconstruction.id;
    tile.centerWorld = cloneVector(state.mpr.centerWorld || reconstruction.volume.centerWorld);
    tile.voi = cloneVoi(options.voi || state.currentVOI);
    resetComparisonViewportTransforms(tile);
    state.comparison.activeTileId = tile.id;
    state.activeReconId = reconstruction.id;
    state.mpr.centerWorld = cloneVector(tile.centerWorld);
    state.currentVOI = cloneVoi(tile.voi);
    state.uiCache.comparisonLayer = "";
    updateVoiUi();
    updateSidebarUi();
    requestRenderAll();
    setStatus(`${reconstruction.label} assigned to comparison tile ${tile.index + 1}.`);
    return true;
  }

  function seedComparisonTiles() {
    ensureComparisonTiles();
    const visibleTiles = getVisibleComparisonTiles();
    visibleTiles.forEach((tile, index) => {
      if (tile.reconstructionId && getReconstructionById(tile.reconstructionId)) {
        return;
      }
      const reconstruction = state.reconstructions[index] || state.reconstructions[0] || null;
      if (!reconstruction) {
        tile.reconstructionId = null;
        return;
      }
      tile.reconstructionId = reconstruction.id;
      tile.centerWorld = cloneVector(state.mpr.centerWorld || reconstruction.volume.centerWorld);
      tile.voi = cloneVoi(state.currentVOI);
      resetComparisonViewportTransforms(tile);
    });
    if (!visibleTiles.some((tile) => tile.id === state.comparison.activeTileId)) {
      state.comparison.activeTileId = visibleTiles[0]?.id || "comparison-tile-1";
    }
    const activeTile = getActiveComparisonTile();
    if (activeTile?.reconstructionId) {
      state.activeReconId = activeTile.reconstructionId;
      if (activeTile.centerWorld) {
        state.mpr.centerWorld = cloneVector(activeTile.centerWorld);
      }
      state.currentVOI = cloneVoi(activeTile.voi);
      updateVoiUi();
    }
  }

  function clearInvalidComparisonAssignments() {
    ensureComparisonTiles();
    state.comparison.tiles.forEach((tile) => {
      if (tile.reconstructionId && !getReconstructionById(tile.reconstructionId)) {
        tile.reconstructionId = null;
        tile.centerWorld = null;
      }
    });
  }

  function getSectionStorageKey(sectionId) {
    return `hagrad.sidebar.${sectionId}`;
  }

  function loadSidebarSectionState() {
    els.sidebarSections.forEach((section) => {
      const sectionId = section.dataset.sectionId;
      if (!sectionId) {
        return;
      }
      let collapsed = section.dataset.defaultCollapsed === "true" || Boolean(DEFAULT_COLLAPSED_SECTIONS[sectionId]);
      try {
        const stored = window.localStorage?.getItem(getSectionStorageKey(sectionId));
        if (stored === "0" || stored === "1") {
          collapsed = stored === "1";
        }
      } catch (_error) {
        // Ignore storage issues and fall back to defaults.
      }
      state.sidebarSections[sectionId] = collapsed;
    });
  }

  function updateSidebarSectionUi() {
    els.sidebarSections.forEach((section) => {
      const sectionId = section.dataset.sectionId;
      if (!sectionId) {
        return;
      }
      const collapsed = Boolean(state.sidebarSections[sectionId]);
      section.classList.toggle("is-collapsed", collapsed);
      const toggle = section.querySelector("[data-section-toggle]");
      if (toggle) {
        toggle.textContent = collapsed ? "+" : "-";
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggle.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${section.querySelector("h2")?.textContent || "section"}`);
      }
    });
  }

  function setSidebarSectionCollapsed(sectionId, collapsed) {
    state.sidebarSections[sectionId] = Boolean(collapsed);
    try {
      window.localStorage?.setItem(getSectionStorageKey(sectionId), collapsed ? "1" : "0");
    } catch (_error) {
      // Ignore storage issues.
    }
    updateSidebarSectionUi();
  }

  function toggleSidebarSection(sectionId) {
    setSidebarSectionCollapsed(sectionId, !state.sidebarSections[sectionId]);
  }

  function createDefaultShortcutState() {
    return SHORTCUT_ACTIONS.reduce((accumulator, action) => {
      accumulator[action.id] = {
        key: action.defaultKey,
        meaning: action.defaultMeaning,
      };
      return accumulator;
    }, {});
  }

  function normalizeShortcutKeyValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }
    const lowered = text.toLowerCase();
    if (lowered === "space" || lowered === "spacebar") {
      return "Space";
    }
    if (lowered === "escape" || lowered === "esc") {
      return "Escape";
    }
    return text.charAt(0).toUpperCase();
  }

  function normalizeShortcutEventKey(key) {
    if (!key) {
      return "";
    }
    if (key === " ") {
      return "Space";
    }
    if (key === "Escape") {
      return "Escape";
    }
    return key.length === 1 ? key.toUpperCase() : "";
  }

  function isReservedEditableShortcutKey(shortcutKey) {
    return RESERVED_EDITABLE_SHORTCUT_KEYS.has(normalizeShortcutKeyValue(shortcutKey));
  }

  function dedupeShortcutSettings(shortcuts) {
    const assignedKeys = new Map();
    let changed = false;
    SHORTCUT_ACTIONS.forEach((action) => {
      const current = normalizeShortcutKeyValue(shortcuts[action.id]?.key);
      if (!shortcuts[action.id]) {
        shortcuts[action.id] = { key: "", meaning: action.defaultMeaning };
        changed = true;
      }
      if (shortcuts[action.id].key !== current) {
        shortcuts[action.id].key = current;
        changed = true;
      }
      if (!current) {
        return;
      }
      if (isReservedEditableShortcutKey(current)) {
        shortcuts[action.id].key = "";
        changed = true;
        return;
      }
      if (assignedKeys.has(current)) {
        shortcuts[action.id].key = "";
        changed = true;
        return;
      }
      assignedKeys.set(current, action.id);
    });
    return changed;
  }

  function loadShortcutSettings() {
    const defaults = createDefaultShortcutState();
    let stored = null;
    try {
      stored = JSON.parse(window.localStorage?.getItem(SHORTCUT_STORAGE_KEY) || "null");
    } catch (_error) {
      stored = null;
    }

    state.shortcuts = SHORTCUT_ACTIONS.reduce((accumulator, action) => {
      const saved = stored?.[action.id] || {};
      accumulator[action.id] = {
        key: normalizeShortcutKeyValue(saved.key ?? defaults[action.id].key),
        meaning: String(saved.meaning ?? defaults[action.id].meaning),
      };
      return accumulator;
    }, {});
    if (dedupeShortcutSettings(state.shortcuts)) {
      saveShortcutSettings();
    }
  }

  function saveShortcutSettings() {
    try {
      window.localStorage?.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(state.shortcuts));
    } catch (_error) {
      // Ignore storage issues.
    }
  }

  function createDefaultVoiPresetState() {
    return {
      presets: DEFAULT_VOI_PRESET_ORDER.reduce((accumulator, key) => {
        accumulator[key] = { ...VOI_PRESETS[key] };
        return accumulator;
      }, {}),
      order: [...DEFAULT_VOI_PRESET_ORDER],
    };
  }

  function normalizeVoiPresetRecord(key, record, fallback) {
    const width = Number(record?.width);
    const center = Number(record?.center);
    if (!Number.isFinite(width) || !Number.isFinite(center)) {
      return fallback ? { ...fallback } : null;
    }
    return {
      label: safeString(record?.label || fallback?.label || key).trim() || fallback?.label || key,
      width: clamp(Math.round(width), 1, 4000),
      center: clamp(Math.round(center), -1200, 3000),
      builtIn: Boolean(fallback?.builtIn),
      custom: !fallback?.builtIn,
    };
  }

  function getPreferredVoiDefault() {
    const preset = state.voiPresets[state.currentPreset] || state.voiPresets.coronary || VOI_PRESETS.coronary;
    return {
      width: clamp(Math.round(preset.width), 1, 4000),
      center: clamp(Math.round(preset.center), -1200, 3000),
    };
  }

  function loadVoiPresetSettings() {
    const defaults = createDefaultVoiPresetState();
    state.voiPresets = defaults.presets;
    state.voiPresetOrder = defaults.order;
    state.currentPreset = "coronary";
    state.currentPresetDirty = false;
    state.currentVOI = getPreferredVoiDefault();

    let stored = null;
    try {
      stored = JSON.parse(window.localStorage?.getItem(VOI_PRESET_STORAGE_KEY) || "null");
    } catch (_error) {
      stored = null;
    }

    if (!stored || typeof stored !== "object") {
      state.voiPreferenceLoaded = false;
      return;
    }

    const savedPresets = stored.presets && typeof stored.presets === "object" ? stored.presets : {};
    DEFAULT_VOI_PRESET_ORDER.forEach((key) => {
      const normalized = normalizeVoiPresetRecord(key, savedPresets[key], VOI_PRESETS[key]);
      state.voiPresets[key] = normalized || { ...VOI_PRESETS[key] };
    });

    const savedOrder = Array.isArray(stored.order) ? stored.order.map((key) => String(key)) : Object.keys(savedPresets);
    savedOrder.forEach((key) => {
      if (DEFAULT_VOI_PRESET_ORDER.includes(key)) {
        return;
      }
      const normalized = normalizeVoiPresetRecord(key, savedPresets[key], null);
      if (!normalized) {
        return;
      }
      normalized.custom = true;
      state.voiPresets[key] = normalized;
      if (!state.voiPresetOrder.includes(key)) {
        state.voiPresetOrder.push(key);
      }
    });

    const storedPresetKey = safeString(stored.currentPreset);
    state.currentPreset = storedPresetKey && state.voiPresets[storedPresetKey] ? storedPresetKey : null;
    const storedCurrentVoi = normalizeVoiPresetRecord("current", stored.currentVOI, null);
    state.currentVOI = storedCurrentVoi
      ? { width: storedCurrentVoi.width, center: storedCurrentVoi.center }
      : getPreferredVoiDefault();
    state.currentPresetDirty = Boolean(state.currentPreset && stored.currentPresetDirty);
    state.voiPreferenceLoaded = true;
  }

  function saveVoiPresetSettings() {
    try {
      window.localStorage?.setItem(
        VOI_PRESET_STORAGE_KEY,
        JSON.stringify({
          presets: state.voiPresets,
          order: state.voiPresetOrder,
          currentPreset: state.currentPreset || "",
          currentVOI: state.currentVOI,
          currentPresetDirty: state.currentPresetDirty,
        })
      );
    } catch (_error) {
      // Ignore storage issues.
    }
  }

  function getPresetShortcut(presetKey) {
    const actionId = VOI_PRESET_SHORTCUT_ACTIONS[presetKey];
    return actionId ? state.shortcuts[actionId]?.key || "" : "";
  }

  function renderVoiPresetButtons() {
    if (!els.presetGrid) {
      return;
    }
    els.presetGrid.innerHTML = "";
    state.voiPresetOrder
      .filter((key) => state.voiPresets[key])
      .forEach((key) => {
        const preset = state.voiPresets[key];
        const button = document.createElement("button");
        button.type = "button";
        button.className = "pill-button preset-button";
        button.dataset.preset = key;
        button.textContent = preset.label;
        button.title = `${preset.label}: W ${preset.width} / L ${preset.center}`;
        if (preset.custom) {
          button.classList.add("is-user-preset");
        }
        const shortcut = getPresetShortcut(key);
        if (shortcut) {
          button.dataset.shortcut = shortcut;
        }
        els.presetGrid.appendChild(button);
      });
    els.presetButtons = Array.from(els.presetGrid.querySelectorAll("[data-preset]"));
    updatePresetButtons();
  }

  function updatePresetEditorUi() {
    const preset = state.voiPresets[state.currentPreset] || null;
    if (els.presetEditorNote) {
      const saved = preset
        ? `${preset.label}${state.currentPresetDirty ? " modified" : ""} · W ${preset.width} / L ${preset.center}`
        : "No preset selected";
      els.presetEditorNote.textContent = saved;
    }
    if (els.presetNameInput && document.activeElement !== els.presetNameInput) {
      els.presetNameInput.value = preset?.label || "";
    }
    if (els.presetSaveButton) {
      els.presetSaveButton.disabled = !preset;
      els.presetSaveButton.textContent = preset ? "Save Selected" : "Select Preset";
    }
  }

  function saveCurrentVoiToSelectedPreset() {
    const preset = state.voiPresets[state.currentPreset];
    if (!preset) {
      setStatus("Select a preset first, then save the current WW/WL into it.", "warning");
      return;
    }
    const label = safeString(els.presetNameInput?.value).trim();
    state.voiPresets[state.currentPreset] = {
      ...preset,
      label: label || preset.label,
      width: clamp(Math.round(state.currentVOI.width), 1, 4000),
      center: clamp(Math.round(state.currentVOI.center), -1200, 3000),
    };
    state.currentPresetDirty = false;
    saveVoiPresetSettings();
    renderVoiPresetButtons();
    updateVoiUi();
    setStatus(`${state.voiPresets[state.currentPreset].label} preset updated.`);
  }

  function buildCustomPresetKey(label) {
    const base = sanitizeFilePart(label, "custom_preset").replace(/[^a-zA-Z0-9_-]/g, "_") || "custom_preset";
    let key = `custom_${base}`;
    let suffix = 2;
    while (state.voiPresets[key]) {
      key = `custom_${base}_${suffix}`;
      suffix += 1;
    }
    return key;
  }

  function addCurrentVoiPreset() {
    const label = safeString(els.presetNameInput?.value).trim();
    if (!label) {
      setStatus("Type a name for the new preset first.", "warning");
      els.presetNameInput?.focus();
      return;
    }
    const key = buildCustomPresetKey(label);
    state.voiPresets[key] = {
      label,
      width: clamp(Math.round(state.currentVOI.width), 1, 4000),
      center: clamp(Math.round(state.currentVOI.center), -1200, 3000),
      custom: true,
      builtIn: false,
    };
    state.voiPresetOrder.push(key);
    state.currentPreset = key;
    state.currentPresetDirty = false;
    saveVoiPresetSettings();
    renderVoiPresetButtons();
    updateVoiUi();
    setStatus(`${label} preset added.`);
  }

  function resetVoiPresetSettings() {
    const shouldReset = window.confirm("Reset display presets to the HAGRad defaults?");
    if (!shouldReset) {
      return;
    }
    const defaults = createDefaultVoiPresetState();
    state.voiPresets = defaults.presets;
    state.voiPresetOrder = defaults.order;
    state.currentPreset = "coronary";
    state.currentPresetDirty = false;
    state.currentVOI = getPreferredVoiDefault();
    saveVoiPresetSettings();
    renderVoiPresetButtons();
    updateVoiUi();
    requestRenderAll();
    setStatus("Display presets reset to default.");
  }

  function getShortcutActionIdForControl(control) {
    if (!control) {
      return "";
    }
    const presetKey = control.dataset.preset;
    if (presetKey) {
      return VOI_PRESET_SHORTCUT_ACTIONS[presetKey] || "";
    }
    const toolKey = control.dataset.tool;
    if (toolKey && SHORTCUT_ACTIONS.some((action) => action.id === toolKey)) {
      return toolKey;
    }
    return "";
  }

  function promptForShortcutAction(actionId) {
    const action = SHORTCUT_ACTIONS.find((item) => item.id === actionId);
    if (!action) {
      return;
    }
    const current = state.shortcuts[actionId]?.key || "";
    const nextShortcut = window.prompt(
      `Shortcut for ${action.label}\nUse one letter or number. Leave empty to remove it.`,
      current
    );
    if (nextShortcut === null) {
      return;
    }
    assignShortcutKey(actionId, nextShortcut);
  }

  function handleShortcutControlDoubleClick(event) {
    const control = event.target.closest("[data-tool], [data-preset]");
    const actionId = getShortcutActionIdForControl(control);
    if (!actionId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    promptForShortcutAction(actionId);
  }

  function findShortcutConflict(actionId, shortcutKey) {
    if (!shortcutKey) {
      return null;
    }
    const normalized = normalizeShortcutKeyValue(shortcutKey);
    return SHORTCUT_ACTIONS.find(
      (action) => action.id !== actionId && normalizeShortcutKeyValue(state.shortcuts[action.id]?.key) === normalized
    ) || null;
  }

  function assignShortcutKey(actionId, shortcutKey) {
    const normalized = normalizeShortcutKeyValue(shortcutKey);
    if (normalized && isReservedEditableShortcutKey(normalized)) {
      renderShortcutTable();
      setStatus(`Shortcut ${normalized} is reserved for fixed viewer navigation.`, "warning");
      return;
    }
    const conflict = findShortcutConflict(actionId, normalized);
    if (conflict) {
      state.shortcuts[conflict.id].key = "";
    }
    state.shortcuts[actionId].key = normalized;
    saveShortcutSettings();
    renderShortcutTable();
    updateToolButtons();
    updatePresetButtons();
    if (normalized) {
      setStatus(
        conflict
          ? `Shortcut ${normalized} moved from ${conflict.label} to ${SHORTCUT_ACTIONS.find((action) => action.id === actionId)?.label}.`
          : `${SHORTCUT_ACTIONS.find((action) => action.id === actionId)?.label} shortcut set to ${normalized}.`
      );
    } else {
      setStatus(`${SHORTCUT_ACTIONS.find((action) => action.id === actionId)?.label} shortcut cleared.`);
    }
  }

  function renderShortcutTable() {
    if (!els.shortcutTableBody) {
      return;
    }

    els.shortcutTableBody.innerHTML = "";
    SHORTCUT_ACTIONS.forEach((action) => {
      const row = document.createElement("tr");

      const actionCell = document.createElement("td");
      const actionName = document.createElement("div");
      actionName.className = "shortcut-action-name";
      actionName.textContent = action.label;
      actionCell.appendChild(actionName);

      const keyCell = document.createElement("td");
      const keyInput = document.createElement("input");
      keyInput.type = "text";
      keyInput.className = "shortcut-key-input";
      keyInput.value = state.shortcuts[action.id]?.key || "";
      keyInput.placeholder = "None";
      keyInput.setAttribute("aria-label", `${action.label} shortcut`);
      keyInput.addEventListener("keydown", (event) => {
        if (event.key === "Tab") {
          return;
        }
        event.preventDefault();
        if (event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }
        if (event.key === "Backspace" || event.key === "Delete") {
          keyInput.value = "";
          assignShortcutKey(action.id, "");
          return;
        }
        const normalized = normalizeShortcutEventKey(event.key);
        if (!normalized) {
          return;
        }
        keyInput.value = normalized;
        assignShortcutKey(action.id, normalized);
      });
      keyInput.addEventListener("blur", () => {
        const normalized = normalizeShortcutKeyValue(keyInput.value);
        assignShortcutKey(action.id, normalized);
      });
      keyCell.appendChild(keyInput);

      row.appendChild(actionCell);
      row.appendChild(keyCell);
      els.shortcutTableBody.appendChild(row);
    });
  }

  function resetShortcutSettings() {
    state.shortcuts = createDefaultShortcutState();
    saveShortcutSettings();
    renderShortcutTable();
    updateToolButtons();
    updatePresetButtons();
    setStatus("Shortcuts reset to the default table.");
  }

  function getShortcutActionIdForEvent(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return null;
    }
    const pressed = normalizeShortcutEventKey(event.key);
    if (!pressed) {
      return null;
    }
    const match = SHORTCUT_ACTIONS.find((action) => normalizeShortcutKeyValue(state.shortcuts[action.id]?.key) === pressed);
    return match?.id || null;
  }

  function getShortcutDisplayForAction(actionId) {
    const key = normalizeShortcutKeyValue(state.shortcuts[actionId]?.key);
    return key || "";
  }

  function getToolActionLabel(toolKey) {
    return SHORTCUT_ACTIONS.find((action) => action.id === toolKey)?.label || formatMeasurementType(toolKey);
  }

  function runShortcutAction(actionId) {
    switch (actionId) {
      case "freehandRoi":
      case "brushRoi":
      case "eraser":
      case "length":
      case "probe":
      case "lineProfile":
      case "squareProfile":
      case "plaqueLineProfile":
      case "plaqueNoncalcifiedLineProfile":
      case "vascularLineProfile":
      case "bloomingDiameter":
      case "stenosisDiameter":
      case "arrow":
      case "text":
      case "mprCursor":
      case "windowLevel":
      case "pan":
      case "zoom":
        setActiveTool(actionId);
        return true;
      case "exportCine":
        setActiveSidebarTab("export");
        exportCineClip().catch((error) => {
          console.error(error);
          setStatus(error.message || "Cine export failed.", "error");
        });
        return true;
      case "presetCoronary":
        applyPreset("coronary");
        return true;
      case "presetSoftTissue":
        applyPreset("softTissue");
        return true;
      case "presetLung":
        applyPreset("lung");
        return true;
      case "presetBone":
        applyPreset("bone");
        return true;
      default:
        return false;
    }
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
    if (els.presentationModeToggleButton) {
      const nextLayout = state.layout === "mpr" ? "presentation" : "mpr";
      const label = nextLayout === "mpr" ? "Switch to 4-up MPR" : "Switch to presentation";
      const icon = els.presentationModeToggleButton.querySelector(".viewport-mode-icon");
      els.presentationModeToggleButton.classList.toggle("is-active", state.layout === "mpr");
      els.presentationModeToggleButton.title = label;
      els.presentationModeToggleButton.setAttribute("aria-label", label);
      icon?.classList.toggle("mode-mpr", nextLayout === "mpr");
      icon?.classList.toggle("mode-presentation", nextLayout === "presentation");
    }
    if (els.presentationLayoutToggleButton) {
      const activeDefinition = getComparisonLayoutDefinition(state.comparison.layout);
      const label = `Layout: ${activeDefinition.label}`;
      els.presentationLayoutToggleButton.classList.toggle("is-active", state.layout === "mpr" || isComparisonActive());
      els.presentationLayoutToggleButton.title = label;
      els.presentationLayoutToggleButton.setAttribute("aria-label", "Choose viewport layout");
      els.presentationLayoutToggleButton.setAttribute("aria-expanded", state.comparison.layoutMenuOpen ? "true" : "false");
    }
    els.comparisonLayoutChoices?.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.comparisonLayout === state.comparison.layout);
    });
    if (els.comparisonSyncButton) {
      const canSync = isComparisonActive();
      const syncIsActive = canSync && state.comparison.syncEnabled;
      els.comparisonSyncButton.disabled = !canSync;
      els.comparisonSyncButton.classList.toggle("is-hidden", !canSync);
      els.comparisonSyncButton.classList.toggle("is-active", syncIsActive);
      els.comparisonSyncButton.setAttribute("aria-hidden", canSync ? "false" : "true");
      els.comparisonSyncButton.title = canSync
        ? syncIsActive
          ? "Comparison sync on"
          : "Comparison sync off"
        : "Choose a comparison layout to enable sync";
      els.comparisonSyncButton.setAttribute(
        "aria-label",
        syncIsActive ? "Turn comparison sync off" : "Turn comparison sync on"
      );
    }
  }

  function setComparisonLayoutMenuOpen(open) {
    state.comparison.layoutMenuOpen = Boolean(open);
    els.presentationLayoutMenu?.classList.toggle("is-hidden", !state.comparison.layoutMenuOpen);
    updateLayoutButtons();
  }

  function setComparisonSync(enabled) {
    state.comparison.syncEnabled = Boolean(enabled);
    if (state.comparison.syncEnabled && isComparisonActive()) {
      syncComparisonTilesFromActiveTile({ center: true, transform: true, voi: true });
    }
    updateLayoutButtons();
    requestRenderAll();
  }

  function updateViewportChromeUi() {
    if (els.viewportGrid) {
      els.viewportGrid.classList.toggle("hide-viewport-overlays", state.showViewportOverlays === false);
      els.viewportGrid.classList.toggle("has-grid-overlay", Boolean(state.showViewportGrid));
    }
    if (els.presentationOverlayToggleButton) {
      const visible = state.showViewportOverlays !== false;
      els.presentationOverlayToggleButton.classList.toggle("is-active", visible);
      els.presentationOverlayToggleButton.title = visible
        ? "Hide DICOM header and series labels"
        : "Show DICOM header and series labels";
      els.presentationOverlayToggleButton.setAttribute(
        "aria-label",
        visible ? "Hide DICOM header and series labels" : "Show DICOM header and series labels"
      );
    }
    if (els.presentationGridToggleButton) {
      const visible = Boolean(state.showViewportGrid);
      els.presentationGridToggleButton.classList.toggle("is-active", visible);
      els.presentationGridToggleButton.title = visible ? "Hide viewport grid" : "Show viewport grid";
      els.presentationGridToggleButton.setAttribute(
        "aria-label",
        visible ? "Hide viewport grid" : "Show viewport grid"
      );
    }
  }

  function setViewportOverlayVisibility(visible) {
    state.showViewportOverlays = Boolean(visible);
    state.showDicomMetadataOverlay = Boolean(visible);
    if (visible) {
      state.showPresentationSeriesLabel = true;
    }
    updateViewportChromeUi();
    updateViewportDicomOverlays();
    updatePresentationSeriesLabel();
    updateComparisonUi();
    requestRenderAll();
  }

  function updateComparisonUi() {
    clearInvalidComparisonAssignments();
    const active = isComparisonActive();
    const definition = getComparisonLayoutDefinition(state.comparison.layout);
    els.stage?.classList.toggle("is-comparison-mode", active);
    if (els.comparisonLayer) {
      els.comparisonLayer.classList.toggle("is-hidden", !active);
      els.comparisonLayer.classList.remove(
        "comparison-layout-single",
        "comparison-layout-stacked2",
        "comparison-layout-columns2",
        "comparison-layout-grid2x2"
      );
      els.comparisonLayer.classList.add(definition.cssClass || "comparison-layout-single");
      els.comparisonLayer.classList.toggle("hide-viewport-overlays", state.showViewportOverlays === false);
      els.comparisonLayer.classList.toggle("has-grid-overlay", Boolean(state.showViewportGrid));
    }
    updateLayoutButtons();
  }

  function isRoiAnnotationType(type) {
    return type === "freehandRoi" || type === "brushRoi";
  }

  function isLineProfileAnnotationType(type) {
    return LINE_PROFILE_TYPES.has(type);
  }

  function isMultiDiameterAnnotationType(type) {
    return MULTI_DIAMETER_TYPES.has(type);
  }

  function isPlaqueProfileAnnotation(annotation) {
    return annotation?.type === "plaqueLineProfile" || annotation?.type === "plaqueNoncalcifiedLineProfile";
  }

  function getPlaqueProfileSubtype(annotation) {
    return annotation?.type === "plaqueNoncalcifiedLineProfile" ? "non_calcified" : "calcified";
  }

  function getProfileFamily(annotation) {
    if (annotation?.type === "vascularLineProfile") {
      return "vascular_lumen_profile";
    }
    return isPlaqueProfileAnnotation(annotation) ? "plaque_lumen_interface" : "stent_lumen_interface";
  }

  function isPolygonDraftTool(toolKey) {
    return POLYGON_DRAFT_TOOLS.has(toolKey);
  }

  function isCircularRoiAnnotation(annotation) {
    return Boolean(annotation?.type === "freehandRoi" && annotation?.roiSourceTool === "circularRoi");
  }

  function isMprNavigationAvailable() {
    return state.layout === "mpr" || state.activeToolKey === "mprCursor";
  }

  function updateViewportToolHuds() {
    if (!els.toolHuds?.length) {
      return;
    }
    const label = getToolActionLabel(state.activeToolKey);
    const shortcut = getShortcutDisplayForAction(state.activeToolKey);
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
      const shortcut = getShortcutDisplayForAction(button.dataset.tool);
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
    if (els.interfaceToolTrigger) {
      const activeInterfaceTool = INTERFACE_TOOL_KEYS.includes(state.activeToolKey);
      const menuOpen = !els.interfaceToolMenu?.classList.contains("is-hidden");
      els.interfaceToolTrigger.classList.toggle("is-active", activeInterfaceTool || menuOpen);
      els.interfaceToolTrigger.setAttribute("aria-expanded", String(!els.interfaceToolMenu?.classList.contains("is-hidden")));
    }
    if (els.interfaceToolActiveLabel) {
      els.interfaceToolActiveLabel.textContent =
        INTERFACE_TOOL_LABELS[state.activeToolKey] || "Open Interface Tools";
    }
    updateViewportToolHuds();
  }

  function updatePresetButtons() {
    els.presetButtons.forEach((button) => {
      const presetKey = button.dataset.preset;
      const preset = state.voiPresets[presetKey];
      const shortcut = getPresetShortcut(presetKey);
      button.classList.toggle("is-active", presetKey === state.currentPreset);
      button.classList.toggle("is-modified", presetKey === state.currentPreset && state.currentPresetDirty);
      if (preset) {
        button.textContent = preset.label;
        button.title = `${preset.label}: W ${preset.width} / L ${preset.center}`;
      }
      if (shortcut) {
        button.dataset.shortcut = shortcut;
      } else {
        delete button.dataset.shortcut;
      }
    });
    updatePresetEditorUi();
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

  function scheduleFocusLayoutRender() {
    requestRenderAll();
    window.requestAnimationFrame(() => {
      requestRenderAll();
      window.setTimeout(requestRenderAll, 180);
      window.setTimeout(requestRenderAll, 380);
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
        state.presentationFocus ? "Exit immersive focus view" : "Enter immersive focus view"
      );
    }
    els.focusWorkflowButtons?.forEach((button) => {
      const tab = button.dataset.focusWorkflowTab;
      button.classList.toggle("is-active", state.presentationFocus && state.focusSidebarOpen && tab === state.activeSidebarTab);
    });
  }

  function setFocusSidebarOpen(open) {
    state.focusSidebarOpen = Boolean(open) && state.presentationFocus;
    updatePresentationFocusUi();
  }

  function setPresentationFocus(enabled) {
    const nextFocus = Boolean(enabled);
    if (state.presentationFocus === nextFocus) {
      if (!nextFocus) {
        return;
      }
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
      const focusViewportId =
        state.layout === "mpr" && VIEWPORT_IDS.includes(state.activeViewportId)
          ? state.activeViewportId
          : "presentation";
      setActiveViewport(focusViewportId);
      focusWithoutScrolling(els.viewportPanels.find((panel) => panel.dataset.viewportId === focusViewportId));
    }
    updatePresentationFocusUi();
    scheduleFocusLayoutRender();
  }

  function togglePresentationFocus() {
    setPresentationFocus(!state.presentationFocus);
  }

  function handleFocusWorkflowTab(tab) {
    const normalizedTab = ["case", "annotate", "export"].includes(tab) ? tab : "case";
    setActiveSidebarTab(normalizedTab);
    if (state.presentationFocus) {
      setFocusSidebarOpen(true);
      scheduleFocusLayoutRender();
    }
  }

  function setComparisonLayout(layoutKey) {
    const definition = getComparisonLayoutDefinition(layoutKey);
    state.comparison.layout = COMPARISON_LAYOUTS[layoutKey] ? layoutKey : "single";
    setComparisonLayoutMenuOpen(false);
    setLayout(definition.mode, { preserveComparison: true });
    if (definition.comparison) {
      seedComparisonTiles();
    }
    state.uiCache.comparisonLayer = "";
    updateComparisonUi();
    if (definition.comparison) {
      renderComparisonLayer();
    }
    requestRenderAll();
    setStatus(definition.comparison ? `${definition.label} comparison layout enabled.` : `${definition.label} layout enabled.`);
  }

  function setLayout(layout, options) {
    const previousLayout = state.layout;
    state.layout = layout === "mpr" ? "mpr" : "presentation";
    if (!options?.preserveComparison) {
      state.comparison.layout = state.layout === "mpr" ? "mpr" : "single";
    }
    if (state.layout !== "mpr") {
      state.maximizedViewportId = null;
      if (previousLayout === "mpr" && options?.resetPresentationTransform !== false) {
        resetPresentationViewportTransform({ render: false, recenter: false });
      }
      setActiveViewport("presentation");
    }
    els.viewportGrid.classList.toggle("layout-mpr", state.layout === "mpr");
    els.viewportGrid.classList.toggle("layout-presentation", state.layout !== "mpr");
    updateViewportFocusUi();
    updateLayoutButtons();
    updateComparisonUi();
    requestRenderAll();
  }

  function setActiveViewport(viewportId) {
    state.activeViewportId = viewportId;
    els.viewportPanels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.viewportId === viewportId);
    });
    requestProjectSessionAutosave();
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
    closeInterfaceToolMenu();
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

  function openInterfaceToolMenu() {
    if (!els.interfaceToolMenu || !els.interfaceToolTrigger) {
      return;
    }
    closeRoiToolMenu();
    els.interfaceToolMenu.classList.remove("is-hidden");
    els.interfaceToolTrigger.setAttribute("aria-expanded", "true");
    updateToolButtons();
  }

  function closeInterfaceToolMenu() {
    if (!els.interfaceToolMenu || !els.interfaceToolTrigger) {
      return;
    }
    els.interfaceToolMenu.classList.add("is-hidden");
    els.interfaceToolTrigger.setAttribute("aria-expanded", "false");
    updateToolButtons();
  }

  function toggleInterfaceToolMenu() {
    if (!els.interfaceToolMenu || els.interfaceToolMenu.classList.contains("is-hidden")) {
      openInterfaceToolMenu();
    } else {
      closeInterfaceToolMenu();
    }
  }

  function returnToPrimaryTool() {
    cancelPolygonDraft();
    if (state.activeToolKey !== "windowLevel") {
      setActiveTool("windowLevel");
    }
  }

  function setActiveTool(toolKey) {
    if (!POLYGON_DRAFT_TOOLS.has(toolKey)) {
      state.polygonDraft = null;
    }
    if (!isMultiDiameterAnnotationType(toolKey) || state.diameterDraft?.toolKey !== toolKey) {
      state.diameterDraft = null;
    }
    if (toolKey !== "contourCorrect") {
      state.contourCorrectionDraft = null;
    }
    if (toolKey !== "eraser") {
      state.eraser.preview = null;
    }
    state.hoveredAnnotationId = null;
    state.activeToolKey = toolKey;
    setActiveSidebarTab("annotate");
    closeRoiToolMenu();
    closeInterfaceToolMenu();
    updateToolButtons();
    updateToolOptionsUi();
    updateViewportCursors();
    if (isMultiDiameterAnnotationType(toolKey)) {
      setStatus(getDiameterDraftStatus(toolKey, state.diameterDraft?.lines?.length || 0));
    }
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
    const thresholds = normalizeBrushThresholds(Number(els.brushMinInput.value), Number(els.brushMaxInput.value));
    state.brushRoi.minHu = thresholds.minHu;
    state.brushRoi.maxHu = thresholds.maxHu;
    state.brushRoi.sizeMm = clampBrushSizeMm(Number(els.brushSizeInput.value));
    els.brushMinInput.value = String(Math.round(state.brushRoi.minHu));
    els.brushMaxInput.value = String(Math.round(state.brushRoi.maxHu));
    els.brushSizeInput.value = String(state.brushRoi.sizeMm);
  }

  function applyEraserInputs() {
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

  function resetHistory() {
    state.history.undoStack = [];
    state.history.redoStack = [];
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    if (!els.undoButton || !els.redoButton || !els.historySummary) {
      return;
    }
    const undoCount = state.history.undoStack.length;
    const redoCount = state.history.redoStack.length;
    els.undoButton.disabled = undoCount === 0;
    els.redoButton.disabled = redoCount === 0;
    els.historySummary.textContent = `${undoCount} undo / ${redoCount} redo`;
  }

  function cloneAnnotationClipboard() {
    if (!state.annotationClipboard?.annotation) {
      return null;
    }
    return {
      annotation: cloneAnnotation(state.annotationClipboard.annotation),
      sourceLabel: state.annotationClipboard.sourceLabel || "",
    };
  }

  function createAnnotationHistorySnapshot() {
    return {
      annotationSequence: state.annotationSequence,
      activeReconId: state.activeReconId,
      selectedAnnotationId: state.selectedAnnotationId,
      selectedProfileAnnotationId: state.selectedProfileAnnotationId,
      annotationClipboard: cloneAnnotationClipboard(),
      reconstructions: state.reconstructions.map((reconstruction) => ({
        id: reconstruction.id,
        annotations: reconstruction.annotations.map((annotation) => cloneAnnotation(annotation)),
      })),
    };
  }

  function restoreAnnotationHistorySnapshot(snapshot) {
    state.history.isRestoring = true;
    state.dragging = null;
    state.polygonDraft = null;
    state.diameterDraft = null;
    state.eraser.preview = null;
    state.annotationSequence = snapshot.annotationSequence;
    state.annotationClipboard = snapshot.annotationClipboard
      ? {
          annotation: cloneAnnotation(snapshot.annotationClipboard.annotation),
          sourceLabel: snapshot.annotationClipboard.sourceLabel || "",
        }
      : null;

    state.reconstructions.forEach((reconstruction) => {
      const stored = snapshot.reconstructions.find((item) => item.id === reconstruction.id);
      reconstruction.annotations = stored ? stored.annotations.map((annotation) => cloneAnnotation(annotation)) : [];
    });

    if (snapshot.activeReconId && state.reconstructions.some((reconstruction) => reconstruction.id === snapshot.activeReconId)) {
      state.activeReconId = snapshot.activeReconId;
    } else {
      state.activeReconId = state.reconstructions[0]?.id || null;
    }

    const activeAnnotations = getActiveAnnotations();
    state.selectedAnnotationId = activeAnnotations.some((annotation) => annotation.id === snapshot.selectedAnnotationId)
      ? snapshot.selectedAnnotationId
      : null;
    state.selectedProfileAnnotationId = activeAnnotations.some(
      (annotation) => annotation.id === snapshot.selectedProfileAnnotationId
    )
      ? snapshot.selectedProfileAnnotationId
      : null;
    state.history.isRestoring = false;
    updateSidebarUi();
    updateViewportCursors();
    requestRenderAll();
  }

  function canPersistProjectSession() {
    if (!PROJECT_WORKFLOW_ENABLED) {
      return false;
    }
    return Boolean(state.activeProjectId && getCurrentProjectCaseId() && state.reconstructions.length);
  }

  function createProjectSessionSnapshot() {
    return {
      studySignature: buildProjectCaseSummary(),
      uiMode: state.uiMode,
      layout: state.layout,
      activeToolKey: state.activeToolKey,
      activeViewportId: state.activeViewportId,
      currentVOI: { ...state.currentVOI },
      currentPreset: state.currentPreset || "",
      syncMprTransforms: state.syncMprTransforms,
      cineFps: state.cineFps,
      annotationSequence: state.annotationSequence,
      selectedAnnotationId: state.selectedAnnotationId,
      selectedProfileAnnotationId: state.selectedProfileAnnotationId,
      activeSeriesKey: getActiveReconstruction()?.seriesKey || "",
      mpr: {
        centerWorld: state.mpr.centerWorld ? cloneVector(state.mpr.centerWorld) : null,
        overlayVisible: state.mpr.overlayVisible !== false,
        planeNormals: cloneMprPlaneNormals(state.mpr.planeNormals),
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
        seriesKey: reconstruction.seriesKey,
        label: reconstruction.label,
        annotations: reconstruction.annotations.map((annotation) => cloneAnnotation(annotation)),
      })),
    };
  }

  function isProjectSessionCompatible(snapshot) {
    if (!snapshot?.reconstructions?.length || !state.reconstructions.length) {
      return false;
    }

    const current = buildProjectCaseSummary();
    const saved = snapshot.studySignature || {};
    if (saved.studyInstanceUID && current.studyInstanceUID && saved.studyInstanceUID !== current.studyInstanceUID) {
      return false;
    }
    if (saved.patientId && current.patientId && saved.patientId !== current.patientId) {
      return false;
    }

    return snapshot.reconstructions.some((stored) =>
      state.reconstructions.some(
        (reconstruction) => stored.seriesKey === reconstruction.seriesKey || stored.label === reconstruction.label
      )
    );
  }

  function upsertProjectCaseInState(projectCase) {
    if (!projectCase?.case_id) {
      return;
    }
    const normalized = sanitizeProjectCaseId(projectCase.case_id);
    const mergedCase = {
      ...projectCase,
      case_id: normalized,
    };
    const existingIndex = state.projectCases.findIndex(
      (row) => sanitizeProjectCaseId(row.case_id) === normalized
    );
    if (existingIndex >= 0) {
      state.projectCases[existingIndex] = {
        ...state.projectCases[existingIndex],
        ...mergedCase,
      };
    } else {
      state.projectCases.unshift(mergedCase);
    }
    state.projectCases.sort((left, right) =>
      String(right.updated_at || right.created_at || "").localeCompare(String(left.updated_at || left.created_at || ""))
    );
  }

  function restoreProjectSessionSnapshot(snapshot) {
    if (!isProjectSessionCompatible(snapshot)) {
      return false;
    }

    stopCine();
    state.dragging = null;
    state.polygonDraft = null;
    state.diameterDraft = null;
    state.eraser.preview = null;
    state.uiMode = "advanced";
    saveUiModePreference();
    updateUiModeUi();
    state.layout = snapshot.layout === "mpr" ? "mpr" : "presentation";
    state.activeToolKey = snapshot.activeToolKey || "windowLevel";
    state.activeViewportId = snapshot.activeViewportId || "presentation";
    state.currentVOI = snapshot.currentVOI
      ? {
          width: clamp(Math.round(snapshot.currentVOI.width), 1, 4000),
          center: clamp(Math.round(snapshot.currentVOI.center), -1200, 3000),
        }
      : { ...state.currentVOI };
    state.currentPreset = snapshot.currentPreset || null;
    state.syncMprTransforms = snapshot.syncMprTransforms !== false;
    state.cineFps = Number.isFinite(snapshot.cineFps) ? snapshot.cineFps : state.cineFps;
    state.annotationSequence = Number.isFinite(snapshot.annotationSequence)
      ? snapshot.annotationSequence
      : state.annotationSequence;
    state.mpr.centerWorld = Array.isArray(snapshot.mpr?.centerWorld)
      ? cloneVector(snapshot.mpr.centerWorld)
      : cloneVector(state.reconstructions[0].volume.centerWorld);
    state.mpr.overlayVisible = snapshot.mpr?.overlayVisible !== false;
    state.mpr.rotations = {
      axial: normalizeAngleDegrees(Number(snapshot.mpr?.rotations?.axial) || 0),
      coronal: normalizeAngleDegrees(Number(snapshot.mpr?.rotations?.coronal) || 0),
      sagittal: normalizeAngleDegrees(Number(snapshot.mpr?.rotations?.sagittal) || 0),
    };
    state.mpr.planeNormals = normalizeMprPlaneNormals(snapshot.mpr?.planeNormals);

    resetViewportTransforms();
    VIEWPORT_IDS.forEach((viewportId) => {
      const viewportSnapshot = snapshot.viewports?.[viewportId];
      const viewportState = state.viewports[viewportId];
      if (!viewportSnapshot || !viewportState) {
        return;
      }
      viewportState.zoom = clamp(Number(viewportSnapshot.zoom) || 1, 0.2, 12);
      viewportState.panX = Number(viewportSnapshot.panX) || 0;
      viewportState.panY = Number(viewportSnapshot.panY) || 0;
    });

    state.reconstructions.forEach((reconstruction) => {
      const stored =
        snapshot.reconstructions.find((entry) => entry.seriesKey === reconstruction.seriesKey) ||
        snapshot.reconstructions.find((entry) => entry.label === reconstruction.label);
      reconstruction.annotations = stored
        ? stored.annotations.map((annotation) => {
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

    const preferredRecon =
      state.reconstructions.find((reconstruction) => reconstruction.seriesKey === snapshot.activeSeriesKey) ||
      state.reconstructions[0] ||
      null;
    state.activeReconId = preferredRecon?.id || null;

    const activeAnnotations = getActiveAnnotations();
    state.selectedAnnotationId = activeAnnotations.some((annotation) => annotation.id === snapshot.selectedAnnotationId)
      ? snapshot.selectedAnnotationId
      : null;
    state.selectedProfileAnnotationId = activeAnnotations.some(
      (annotation) => annotation.id === snapshot.selectedProfileAnnotationId
    )
      ? snapshot.selectedProfileAnnotationId
      : null;

    els.viewportGrid.classList.toggle("layout-mpr", state.layout === "mpr");
    els.viewportGrid.classList.toggle("layout-presentation", state.layout !== "mpr");
    els.cineSpeedReadout.textContent = `${state.cineFps} fps`;
    updateLayoutButtons();
    updateToolButtons();
    updateSidebarUi();
    setActiveViewport(state.activeViewportId);
    updateViewportCursors();
    updateEmptyState();
    requestRenderAll();
    return true;
  }

  async function saveProjectSessionNow(options) {
    if (!PROJECT_WORKFLOW_ENABLED) {
      return null;
    }
    if (!canPersistProjectSession()) {
      state.projectSession.pending = false;
      renderProjectUi();
      return null;
    }

    if (state.dragging || state.polygonDraft) {
      requestProjectSessionAutosave();
      return null;
    }

    state.projectSession.pending = false;
    state.projectSession.saving = true;
    renderProjectUi();
    const result = await fetchJson("/api/projects/session/save", {
      method: "POST",
      body: JSON.stringify({
        projectId: state.activeProjectId,
        case: buildProjectCaseSummary(),
        session: createProjectSessionSnapshot(),
      }),
    });
    state.projectSession.saving = false;
    state.projectSession.hasSavedSession = Boolean(result?.hasSession);
    state.projectSession.lastSavedAt = String(result?.savedAt || "");
    upsertProjectCaseInState({
      ...(result?.case || {}),
      has_session: Boolean(result?.hasSession),
      session_saved_at: String(result?.savedAt || ""),
    });
    renderProjectUi();
    renderProjectCases();
    if (!options?.silent) {
      setStatus(`Workspace saved into ${result?.project?.name || "project"} as ${result?.case?.case_id || getCurrentProjectCaseId()}.`);
    }
    return result;
  }

  function requestProjectSessionAutosave() {
    if (!PROJECT_WORKFLOW_ENABLED) {
      return;
    }
    if (state.projectSession.autosaveTimerId) {
      window.clearTimeout(state.projectSession.autosaveTimerId);
      state.projectSession.autosaveTimerId = null;
    }
    if (!canPersistProjectSession()) {
      state.projectSession.pending = false;
      renderProjectUi();
      return;
    }
    state.projectSession.pending = true;
    renderProjectUi();
    state.projectSession.autosaveTimerId = window.setTimeout(() => {
      saveProjectSessionNow({ silent: true }).catch((error) => {
        console.error(error);
        state.projectSession.saving = false;
        state.projectSession.pending = false;
        renderProjectUi();
      });
    }, SESSION_AUTOSAVE_DELAY_MS);
  }

  async function restoreProjectSessionFromBackend(caseId, options) {
    if (!PROJECT_WORKFLOW_ENABLED) {
      return false;
    }
    const project = getActiveProject();
    const normalizedCaseId = sanitizeProjectCaseId(caseId || state.projectCaseId);
    if (!project || !normalizedCaseId) {
      return false;
    }

    const payload = await fetchJson("/api/projects/session/load", {
      method: "POST",
      body: JSON.stringify({
        projectId: project.id,
        caseId: normalizedCaseId,
      }),
    });
    upsertProjectCaseInState(payload.case);
    state.projectSession.hasSavedSession = Boolean(payload.hasSession);
    state.projectSession.lastSavedAt = String(payload.case?.session_saved_at || payload.session?.savedAt || "");
    renderProjectCases();
    renderProjectUi();

    if (!payload.hasSession || !payload.session) {
      if (!options?.silent) {
        setStatus(`No saved workspace was found for ${normalizedCaseId}.`, "warning");
      }
      return false;
    }

    const restored = restoreProjectSessionSnapshot(payload.session);
    if (!restored && !options?.silent) {
      setStatus(`A saved workspace exists for ${normalizedCaseId}, but it does not match the currently loaded study.`, "warning");
    }
    return restored;
  }

  function captureUndoSnapshot() {
    if (state.history.isRestoring || !state.reconstructions.length) {
      return;
    }
    state.history.undoStack.push(createAnnotationHistorySnapshot());
    if (state.history.undoStack.length > state.history.limit) {
      state.history.undoStack.shift();
    }
    state.history.redoStack = [];
    updateHistoryButtons();
  }

  function undoHistory() {
    if (!state.history.undoStack.length) {
      return false;
    }
    const snapshot = state.history.undoStack.pop();
    state.history.redoStack.push(createAnnotationHistorySnapshot());
    restoreAnnotationHistorySnapshot(snapshot);
    updateHistoryButtons();
    setStatus("Undid the last annotation change.");
    return true;
  }

  function redoHistory() {
    if (!state.history.redoStack.length) {
      return false;
    }
    const snapshot = state.history.redoStack.pop();
    state.history.undoStack.push(createAnnotationHistorySnapshot());
    restoreAnnotationHistorySnapshot(snapshot);
    updateHistoryButtons();
    setStatus("Redid the annotation change.");
    return true;
  }

  function formatAnnotationManagerDetail(annotation, reconstruction) {
    const planeLabel = annotation.plane ? `${annotation.plane[0].toUpperCase()}${annotation.plane.slice(1)}` : "-";
    const leadType = annotation.customName ? `${formatMeasurementType(annotation)} • ` : "";
    if (annotation.type === "text") {
      return `${leadType}${annotation.text || "Text label"} • ${planeLabel}`;
    }
    if (annotation.type === "arrow") {
      return `${leadType}Pointer • ${planeLabel}`;
    }

    const summary = MEASUREMENT_TYPES.has(annotation.type) ? getMeasurementSummary(annotation, reconstruction) : {};
    if (annotation.type === "length" && summary.lengthMm != null) {
      return `${leadType}${summary.lengthMm.toFixed(1)} mm • ${planeLabel}`;
    }
    if (annotation.type === "probe" && summary.hu != null) {
      return `${leadType}${Math.round(summary.hu)} HU • ${planeLabel}`;
    }
    if ((annotation.type === "freehandRoi" || annotation.type === "brushRoi") && summary.areaMm2 != null) {
      return `${leadType}${summary.areaMm2.toFixed(1)} mm2 • Avg ${summary.mean != null ? Math.round(summary.mean) : "-"} HU`;
    }
    if (annotation.type === "bloomingDiameter") {
      return `${leadType}${summary.outerDiameterMm != null ? summary.outerDiameterMm.toFixed(1) : "-"} / ${summary.innerDiameterMm != null ? summary.innerDiameterMm.toFixed(1) : "-"} mm • ${summary.bloomingPercent != null ? summary.bloomingPercent.toFixed(1) : "-"}% blooming`;
    }
    if (annotation.type === "stenosisDiameter") {
      return `${leadType}Ref ${summary.referenceDiameterMm != null ? summary.referenceDiameterMm.toFixed(1) : "-"} mm • MLD ${summary.minimalLumenDiameterMm != null ? summary.minimalLumenDiameterMm.toFixed(1) : "-"} mm • ${summary.stenosisPercent != null ? summary.stenosisPercent.toFixed(1) : "-"}% stenosis`;
    }
    if (PROFILE_TYPES.has(annotation.type)) {
      const detailBits = [];
      if (annotation.customName) {
        detailBits.push(formatMeasurementType(annotation));
      }
      if (summary.profileLengthMm != null) {
        detailBits.push(`${summary.profileLengthMm.toFixed(1)} mm`);
      }
      if (summary.sampleCount != null) {
        detailBits.push(`${summary.sampleCount} samples`);
      }
      detailBits.push(planeLabel);
      return detailBits.join(" • ");
    }
    return `${leadType}${planeLabel}`;
  }

  function getAnnotationTypeOrdinal(annotation, reconstruction) {
    if (!annotation?.type || !reconstruction) {
      return null;
    }

    const sameTypeAnnotations = reconstruction.annotations
      .filter((item) => item.type === annotation.type)
      .sort((left, right) => left.id - right.id);
    const index = sameTypeAnnotations.findIndex((item) => item.id === annotation.id);
    return index >= 0 ? index + 1 : null;
  }

  function getAnnotationDisplayName(annotation, reconstruction) {
    const customName = annotation.customName?.trim();
    if (customName) {
      return customName;
    }

    const baseName = formatMeasurementType(annotation);
    if (PROFILE_TYPES.has(annotation.type) || isMultiDiameterAnnotationType(annotation.type)) {
      const ordinal = getAnnotationTypeOrdinal(annotation, reconstruction);
      if (ordinal != null) {
        return `${baseName} ${ordinal}`;
      }
    }

    return baseName;
  }

  function renameAnnotation(annotationId) {
    const annotation = getActiveAnnotations().find((item) => item.id === annotationId) || null;
    if (!annotation) {
      throw new Error("Select an annotation first.");
    }

    const currentName = annotation.customName?.trim() || "";
    const nextName = window.prompt(
      "Rename annotation. Leave blank to reset to the default name.",
      currentName
    );
    if (nextName == null) {
      return false;
    }

    const trimmed = nextName.trim();
    if ((annotation.customName?.trim() || "") === trimmed) {
      return false;
    }

    captureUndoSnapshot();
    if (trimmed) {
      annotation.customName = trimmed;
      setStatus(`Renamed annotation to ${trimmed}.`);
    } else {
      delete annotation.customName;
      setStatus("Annotation name reset to the default.");
    }
    updateSidebarUi();
    requestRenderAll();
    return true;
  }

  function getAnnotationFocusWorld(annotation) {
    if (!annotation?.frame) {
      return null;
    }

    if (annotation.type === "squareProfile") {
      const box = getSquareProfilePlaneBox(annotation);
      return planePointToWorld(annotation.frame, box.centerXmm, box.centerYmm);
    }

    if (annotation.ellipse) {
      return planePointToWorld(annotation.frame, annotation.ellipse.centerXmm, annotation.ellipse.centerYmm);
    }

    if (annotation.type === "brushRoi" && annotation.mask?.cells?.length) {
      let count = 0;
      let sumXmm = 0;
      let sumYmm = 0;
      const mask = annotation.mask;
      for (let y = 0; y < mask.height; y += 1) {
        for (let x = 0; x < mask.width; x += 1) {
          if (!mask.cells[brushMaskIndex(mask, x, y)]) {
            continue;
          }
          const center = getBrushMaskCellCenter(mask, x, y);
          sumXmm += center.xMm;
          sumYmm += center.yMm;
          count += 1;
        }
      }
      if (count) {
        return planePointToWorld(annotation.frame, sumXmm / count, sumYmm / count);
      }
    }

    if (annotation.worldPoints?.length) {
      const sum = annotation.worldPoints.reduce(
        (accumulator, point) => addVectors(accumulator, point),
        [0, 0, 0]
      );
      return scaleVector(sum, 1 / annotation.worldPoints.length);
    }

    return null;
  }

  function isFrameObliqueToCanonicalPlane(frame) {
    if (!frame?.plane || !isValidWorldVector(frame.nWorld)) {
      return false;
    }
    const base = LOCAL_PLANE_BASES[frame.plane];
    if (!base) {
      return false;
    }
    const canonicalNormal = worldDirectionFromLocal(base.n);
    return Math.abs(dot(normalize(frame.nWorld), canonicalNormal)) < 0.995;
  }

  function shouldRestoreAnnotationInMpr(annotation) {
    if (annotation?.viewContext?.layout === "mpr") {
      return true;
    }
    if (annotation?.viewContext?.layout === "presentation") {
      return false;
    }
    return Boolean(annotation?.frame?.plane && (annotation.frame.plane !== "axial" || isFrameObliqueToCanonicalPlane(annotation.frame)));
  }

  function getAnnotationMprViewport(annotation) {
    const contextViewport = annotation?.viewContext?.viewportId;
    if (contextViewport && VIEWPORT_IDS.includes(contextViewport)) {
      return contextViewport;
    }
    return VIEWPORT_IDS.find((viewportId) => getViewportPlane(viewportId) === annotation.frame?.plane) || "presentation";
  }

  function restoreMprFrameForAnnotation(annotation, focusWorld) {
    if (!annotation?.frame || !focusWorld) {
      return false;
    }

    const context = cloneAnnotationViewContext(annotation.viewContext);
    state.mpr.centerWorld = cloneVector(focusWorld);
    const contextNormals = cloneMprPlaneNormals(context?.mprPlaneNormals);
    if (contextNormals) {
      state.mpr.planeNormals = contextNormals;
    } else {
      const normals = getMprPlaneNormals();
      normals[annotation.frame.plane] = cloneVector(annotation.frame.nWorld);
      state.mpr.planeNormals = normalizeMprPlaneNormals(normals);
    }
    if (context?.mprRotations) {
      state.mpr.rotations = { ...context.mprRotations };
    }
    state.maximizedViewportId = VIEWPORT_IDS.includes(context?.maximizedViewportId)
      ? context.maximizedViewportId
      : null;
    setLayout("mpr");
    setActiveViewport(getAnnotationMprViewport(annotation));
    updateMprUi();
    updateViewportFocusUi();
    return true;
  }

  function resetPresentationPan() {
    const presentationViewport = state.viewports.presentation;
    if (!presentationViewport) {
      return;
    }
    presentationViewport.panX = 0;
    presentationViewport.panY = 0;
  }

  function centerViewerOnAnnotation(annotation) {
    const reconstruction = getActiveReconstruction();
    const focusWorld = getAnnotationFocusWorld(annotation);
    if (!reconstruction || !focusWorld) {
      return false;
    }

    stopCine();
    state.polygonDraft = null;
    state.diameterDraft = null;
    state.contourCorrectionDraft = null;
    state.eraser.preview = null;

    if (shouldRestoreAnnotationInMpr(annotation)) {
      restoreMprFrameForAnnotation(annotation, focusWorld);
      requestRenderAll();
      setStatus(`MPR returned to ${getAnnotationDisplayName(annotation, reconstruction)}.`);
      return true;
    }

    state.mpr.centerWorld = cloneVector(focusWorld);
    setLayout("presentation");
    resetPresentationViewportTransform({ render: false });
    setActiveViewport("presentation");
    updateReadouts();
    requestRenderAll();
    setStatus(`Presentation centered on ${getAnnotationDisplayName(annotation, reconstruction)}.`);
    return true;
  }

  function renderAnnotationManager() {
    if (!els.annotationManagerList || !els.annotationManagerNote) {
      return;
    }

    const reconstruction = getActiveReconstruction();
    const annotations = getActiveAnnotations().slice().sort((left, right) => right.id - left.id);
    const signature = JSON.stringify({
      activeReconId: reconstruction?.id || "",
      selectedAnnotationId: state.selectedAnnotationId,
      annotationIds: annotations.map((annotation) => ({
        id: annotation.id,
        type: annotation.type,
        customName: annotation.customName || "",
        text: annotation.text || "",
        detail: formatAnnotationManagerDetail(annotation, reconstruction),
      })),
    });
    if (state.uiCache.annotationManager === signature) {
      return;
    }
    state.uiCache.annotationManager = signature;
    els.annotationManagerList.innerHTML = "";
    els.annotationManagerNote.textContent = reconstruction
      ? `${annotations.length} in ${reconstruction.label}`
      : "Active reconstruction";

    if (!annotations.length) {
      const empty = document.createElement("p");
      empty.className = "annotation-empty";
      empty.textContent = reconstruction ? "No annotations in this reconstruction yet." : "Load a study to start annotating.";
      els.annotationManagerList.appendChild(empty);
      if (els.annotationDeleteButton) {
        els.annotationDeleteButton.disabled = true;
      }
      if (els.annotationRenameButton) {
        els.annotationRenameButton.disabled = true;
      }
      return;
    }

    annotations.forEach((annotation) => {
      const row = document.createElement("div");
      row.className = "annotation-item";
      row.classList.toggle("is-selected", annotation.id === state.selectedAnnotationId);

      const mainButton = document.createElement("button");
      mainButton.type = "button";
      mainButton.className = "annotation-item-main";
      const titleRow = document.createElement("span");
      titleRow.className = "annotation-item-title";
      const titleText = document.createElement("span");
      titleText.textContent = getAnnotationDisplayName(annotation, reconstruction);
      const idText = document.createElement("span");
      idText.className = "annotation-item-id";
      idText.textContent = `#${annotation.id}`;
      titleRow.appendChild(titleText);
      titleRow.appendChild(idText);
      const detailText = document.createElement("span");
      detailText.className = "annotation-item-detail";
      detailText.textContent = formatAnnotationManagerDetail(annotation, reconstruction);
      mainButton.appendChild(titleRow);
      mainButton.appendChild(detailText);
      mainButton.addEventListener("click", () => {
        setSelectedAnnotation(annotation.id);
        updateProfilePanel();
        requestRenderAll();
      });
      mainButton.addEventListener("dblclick", (event) => {
        event.preventDefault();
        setSelectedAnnotation(annotation.id);
        centerViewerOnAnnotation(annotation);
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "annotation-item-delete";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelectedAnnotation(annotation.id);
        deleteSelectedAnnotation();
      });

      row.appendChild(mainButton);
      row.appendChild(deleteButton);
      els.annotationManagerList.appendChild(row);
    });

    if (els.annotationDeleteButton) {
      els.annotationDeleteButton.disabled = !Boolean(getSelectedAnnotation());
    }
    if (els.annotationRenameButton) {
      els.annotationRenameButton.disabled = !Boolean(getSelectedAnnotation());
    }
  }

  function scopeMatchesTool(scopeText, toolKey) {
    return (scopeText || "")
      .split(/\s+/)
      .filter(Boolean)
      .includes(toolKey);
  }

  function updateToolOptionsUi() {
    const toolKey = state.activeToolKey;
    if (els.toolContextNote) {
      els.toolContextNote.textContent = TOOL_CONTEXT_NOTES[toolKey] || "Primary mouse button";
    }
    els.toolScopedGroups.forEach((group) => {
      group.classList.toggle("is-hidden", !scopeMatchesTool(group.dataset.toolScope, toolKey));
    });
    els.toolPanels.forEach((panel) => {
      panel.classList.toggle("is-hidden", !scopeMatchesTool(panel.dataset.toolPanel, toolKey));
    });
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
    renderAnnotationManager();
  }

  function setHoveredAnnotation(annotationId, plane) {
    const nextId = annotationId || null;
    if (state.hoveredAnnotationId === nextId) {
      return;
    }
    state.hoveredAnnotationId = nextId;
    if (plane) {
      requestRenderViewports(getViewportIdsForPlane(plane), { readouts: false });
    } else {
      requestRenderViewports(VIEWPORT_IDS, { readouts: false });
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
    const signature = JSON.stringify({
      activeReconId: state.activeReconId,
      reconstructions: state.reconstructions.map((reconstruction) => ({
        id: reconstruction.id,
        label: reconstruction.label,
        depth: reconstruction.volume.depth,
      })),
    });
    if (state.uiCache.reconstructionList === signature) {
      return;
    }
    state.uiCache.reconstructionList = signature;
    els.reconstructionList.innerHTML = "";
    state.reconstructions.forEach((reconstruction) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "recon-button";
      button.draggable = true;
      button.dataset.reconstructionId = reconstruction.id;
      button.classList.toggle("is-active", reconstruction.id === state.activeReconId);
      button.innerHTML = `<strong>${reconstruction.label}</strong><span>${reconstruction.volume.depth} slices</span>`;
      button.addEventListener("click", () => {
        setActiveReconstruction(reconstruction.id);
      });
      button.addEventListener("dragstart", (event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("application/x-hagrad-reconstruction-id", reconstruction.id);
        event.dataTransfer.setData("text/plain", reconstruction.id);
      });
      els.reconstructionList.appendChild(button);
    });
    els.reconstructionSummary.textContent = `${state.reconstructions.length} loaded`;
  }

  function getStudyMetadataSummary(reconstruction) {
    const record = reconstruction?.records?.[0];
    const volume = reconstruction?.volume;
    if (!record || !volume) {
      return null;
    }
    const iterativeHint = extractIterativeReconstructionHint(record);
    const incrementMm = Number.isFinite(record.spacingBetweenSlices) ? record.spacingBetweenSlices : volume.sliceSpacing;
    const kvpText = Number.isFinite(record.kvp) ? `${Math.round(record.kvp)} kV` : "-";
    return {
      patientName: record.patientName || "Anonymous",
      patientId: record.patientId || "-",
      seriesLabel: reconstruction.label,
      seriesNumber: Number.isFinite(record.seriesNumber) ? String(record.seriesNumber) : "-",
      modality: record.modality || "-",
      kernel: record.convolutionKernel || "-",
      iterative: iterativeHint || "-",
      slices: String(volume.depth),
      matrix: `${volume.columns} x ${volume.rows} x ${volume.depth}`,
      spacing: `${formatSpacing(record.pixelSpacing)} / ${formatDimension(volume.sliceSpacing)}`,
      thickness: formatDimension(record.sliceThickness),
      increment: formatDimension(incrementMm),
      kvp: kvpText,
      acquired: combineDateTime(record),
      position: record.patientPosition || "-",
    };
  }

  function updateMetadata() {
    const reconstruction = getActiveReconstruction();
    const record = reconstruction?.records?.[0];
    const volume = reconstruction?.volume;
    const summary = getStudyMetadataSummary(reconstruction);
    const iterativeHint = record ? extractIterativeReconstructionHint(record) : "";
    const incrementMm = Number.isFinite(record?.spacingBetweenSlices) ? record.spacingBetweenSlices : volume?.sliceSpacing;
    const signature = JSON.stringify({
      activeReconId: reconstruction?.id || "",
      patientName: record?.patientName || "",
      patientId: record?.patientId || "",
      label: reconstruction?.label || "",
      seriesNumber: record?.seriesNumber || "",
      modality: record?.modality || "",
      kernel: record?.convolutionKernel || "",
      iterativeHint,
      depth: volume?.depth || 0,
      rows: volume?.rows || 0,
      columns: volume?.columns || 0,
      spacing: record?.pixelSpacing || [],
      sliceSpacing: volume?.sliceSpacing || 0,
      sliceThickness: record?.sliceThickness || 0,
      incrementMm: incrementMm || 0,
      kvp: record?.kvp || "",
      time: combineDateTime(record || {}),
      position: record?.patientPosition || "",
    });
    if (state.uiCache.metadata === signature) {
      return;
    }
    state.uiCache.metadata = signature;
    if (!record || !volume) {
      els.metaPatient.textContent = "No study loaded";
      els.metaPatientId.textContent = "-";
      els.metaSeries.textContent = "-";
      els.metaSeriesNumber.textContent = "-";
      els.metaModality.textContent = "-";
      els.metaKernel.textContent = "-";
      els.metaIterative.textContent = "-";
      els.metaSlices.textContent = "-";
      els.metaMatrix.textContent = "-";
      els.metaSpacing.textContent = "-";
      els.metaThickness.textContent = "-";
      els.metaIncrement.textContent = "-";
      els.metaKvp.textContent = "-";
      els.metaTime.textContent = "-";
      els.metaPosition.textContent = "-";
      return;
    }

    els.metaPatient.textContent = summary.patientName;
    els.metaPatientId.textContent = summary.patientId;
    els.metaSeries.textContent = summary.seriesLabel;
    els.metaSeriesNumber.textContent = summary.seriesNumber;
    els.metaModality.textContent = summary.modality;
    els.metaKernel.textContent = summary.kernel;
    els.metaIterative.textContent = summary.iterative;
    els.metaSlices.textContent = summary.slices;
    els.metaMatrix.textContent = summary.matrix;
    els.metaSpacing.textContent = summary.spacing;
    els.metaThickness.textContent = summary.thickness;
    els.metaIncrement.textContent = summary.increment;
    els.metaKvp.textContent = summary.kvp;
    els.metaTime.textContent = summary.acquired;
    els.metaPosition.textContent = summary.position;
  }

  function updateSidebarUi() {
    updateUiModeUi();
    updateSidebarTabsUi();
    updateVoiUi();
    updateMprUi();
    updateSyncButton();
    updateViewportChromeUi();
    updateMeasurementCount();
    renderProjectUi();
    renderProjectCases();
    updateMetadata();
    updatePresentationSeriesLabel();
    renderReconstructionButtons();
    renderAnnotationManager();
    updateProfilePanel();
    updateReadouts();
    updateHistoryButtons();
    updateToolOptionsUi();
    updateSidebarSectionUi();
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

  function switchReconstructionBy(delta) {
    if (state.reconstructions.length < 2) {
      return false;
    }
    const currentIndex = Math.max(
      0,
      state.reconstructions.findIndex((reconstruction) => reconstruction.id === state.activeReconId)
    );
    const nextIndex =
      (currentIndex + delta + state.reconstructions.length) % state.reconstructions.length;
    const nextReconstruction = state.reconstructions[nextIndex];
    if (!nextReconstruction || nextReconstruction.id === state.activeReconId) {
      return false;
    }
    setActiveReconstruction(nextReconstruction.id);
    setStatus(`Showing reconstruction ${nextIndex + 1}/${state.reconstructions.length}: ${nextReconstruction.label}.`);
    return true;
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
    state.mpr.planeNormals = null;
    state.comparison.layout = "single";
    state.comparison.activeTileId = "comparison-tile-1";
    state.comparison.layoutMenuOpen = false;
    ensureComparisonTiles();
    state.comparison.tiles.forEach((tile) => {
      tile.reconstructionId = null;
      tile.centerWorld = null;
      tile.voi = cloneVoi(state.currentVOI);
      resetComparisonViewportTransforms(tile);
    });
    state.uiCache.comparisonLayer = "";
    state.maximizedViewportId = null;
    state.polygonDraft = null;
    state.contourCorrectionDraft = null;
    resetViewportTransforms();
    updateViewportFocusUi();
    updateMprUi();
    requestRenderAll();
    setStatus("MPR reset to the original center, default planes, and fitted view.");
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

  function recenterPresentationToCanonicalSlice(reconstruction) {
    const activeReconstruction = reconstruction || getActiveReconstruction();
    if (!activeReconstruction?.volume) {
      return false;
    }
    const frame = getCanonicalPlaneFrame("axial", activeReconstruction);
    if (!frame?.centerWorld) {
      return false;
    }
    state.mpr.centerWorld = cloneVector(frame.centerWorld);
    return true;
  }

  function resetPresentationViewportTransform(options) {
    const viewportState = state.viewports.presentation;
    if (!viewportState) {
      return;
    }
    if (options?.recenter !== false) {
      recenterPresentationToCanonicalSlice();
    }
    viewportState.zoom = 1;
    viewportState.panX = 0;
    viewportState.panY = 0;
    viewportState.lastGeometry = null;
    viewportState.lastFrame = null;
    if (options?.render !== false) {
      requestRenderAll();
    }
  }

  function resetPresentationWindowing() {
    if (!getActiveReconstruction()) {
      return;
    }
    const presetKey = state.voiPresets[state.currentPreset] ? state.currentPreset : "coronary";
    applyPreset(presetKey);
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
    state.mpr.planeNormals = null;
    state.polygonDraft = null;
    updateMprUi();
    requestRenderAll();
  }

  function applyPreset(presetKey) {
    const preset = state.voiPresets[presetKey];
    if (!preset) {
      return;
    }
    state.currentPreset = presetKey;
    state.currentPresetDirty = false;
    applyVoi(preset);
  }

  function applyVoi(voi, options) {
    const resetPreset = options?.resetPreset === true;
    state.currentVOI = {
      width: clamp(Math.round(voi.width), 1, 4000),
      center: clamp(Math.round(voi.center), -1200, 3000),
    };
    if (resetPreset) {
      state.currentPresetDirty = Boolean(state.currentPreset);
    }
    if (isComparisonActive()) {
      const tile = getActiveComparisonTile();
      if (tile) {
        tile.voi = cloneVoi(state.currentVOI);
        syncComparisonTilesFromActiveTile({ voi: true });
      }
    }
    updateVoiUi();
    saveVoiPresetSettings();
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
    if (state.voiPreferenceLoaded) {
      return { ...state.currentVOI };
    }
    const candidate = records.find(
      (record) => Number.isFinite(record.windowWidth) && record.windowWidth > 0 && Number.isFinite(record.windowCenter)
    );
    if (candidate) {
      return {
        width: clamp(candidate.windowWidth, 1, 4000),
        center: clamp(candidate.windowCenter, -1200, 3000),
      };
    }
    return getPreferredVoiDefault();
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

  function isValidWorldVector(vector) {
    return (
      Array.isArray(vector) &&
      vector.length === 3 &&
      vector.every((value) => Number.isFinite(value)) &&
      vectorLength(vector) > 1e-4
    );
  }

  function normalizeMprPlaneNormals(normals) {
    if (!normals) {
      return null;
    }
    const axial = isValidWorldVector(normals.axial) ? normalize(normals.axial) : null;
    const coronal = isValidWorldVector(normals.coronal) ? normalize(normals.coronal) : null;
    const sagittal = isValidWorldVector(normals.sagittal) ? normalize(normals.sagittal) : null;
    if (!axial || !coronal || !sagittal) {
      return null;
    }
    return { axial, coronal, sagittal };
  }

  function cloneMprPlaneNormals(normals) {
    const normalized = normalizeMprPlaneNormals(normals);
    return normalized
      ? {
          axial: cloneVector(normalized.axial),
          coronal: cloneVector(normalized.coronal),
          sagittal: cloneVector(normalized.sagittal),
        }
      : null;
  }

  function getMprPlaneNormals() {
    const storedNormals = normalizeMprPlaneNormals(state.mpr.planeNormals);
    if (storedNormals) {
      return storedNormals;
    }
    return {
      sagittal: worldDirectionFromLocal(rotateLocalVector([1, 0, 0])),
      coronal: worldDirectionFromLocal(rotateLocalVector([0, 1, 0])),
      axial: worldDirectionFromLocal(rotateLocalVector([0, 0, 1])),
    };
  }

  function rotateWorldVectorAroundAxis(vector, axis, radians) {
    const unitAxis = normalize(axis);
    const cosValue = Math.cos(radians);
    const sinValue = Math.sin(radians);
    return normalize(
      addVectors(
        addVectors(
          scaleVector(vector, cosValue),
          scaleVector(cross(unitAxis, vector), sinValue)
        ),
        scaleVector(unitAxis, dot(unitAxis, vector) * (1 - cosValue))
      )
    );
  }

  function applyMprRotationAroundControlPlane(controlPlaneName, startPlaneNormals, nextRotationDegrees, deltaDegrees) {
    const normals = cloneMprPlaneNormals(startPlaneNormals) || getMprPlaneNormals();
    const axis = normals?.[controlPlaneName];
    if (!axis) {
      return;
    }

    const deltaRadians = (deltaDegrees * Math.PI) / 180;
    const nextNormals = Object.fromEntries(
      Object.entries(normals).map(([planeName, normal]) => [
        planeName,
        planeName === controlPlaneName
          ? cloneVector(normal)
          : rotateWorldVectorAroundAxis(normal, axis, deltaRadians),
      ])
    );

    state.mpr.planeNormals = normalizeMprPlaneNormals(nextNormals);
    state.mpr.rotations = {
      ...state.mpr.rotations,
      [controlPlaneName]: normalizeAngleDegrees(nextRotationDegrees),
    };
    state.polygonDraft = null;
    updateMprUi();
    requestRenderAll();
  }

  function getMprDragRotationSign(planeName) {
    // The sagittal viewport has opposite 2D handedness, so match drag direction to visual rotation.
    return planeName === "sagittal" ? -1 : 1;
  }

  function projectDirectionOntoPlane(direction, normal) {
    const projected = subtractVectors(direction, scaleVector(normal, dot(direction, normal)));
    return vectorLength(projected) > 1e-4 ? normalize(projected) : null;
  }

  function getRollLockedPlaneBasis(base, normalWorld) {
    const canonicalU = worldDirectionFromLocal(base.u);
    const canonicalV = worldDirectionFromLocal(base.v);
    let uWorld = projectDirectionOntoPlane(canonicalU, normalWorld);
    if (!uWorld) {
      uWorld = projectDirectionOntoPlane(canonicalV, normalWorld);
    }
    if (!uWorld) {
      uWorld = normalize(cross(normalWorld, [0, 0, 1]));
    }
    if (!uWorld || vectorLength(uWorld) < 1e-4) {
      uWorld = normalize(cross(normalWorld, [0, 1, 0]));
    }

    const handedness = dot(cross(base.u, base.v), base.n) >= 0 ? 1 : -1;
    const vWorld = handedness >= 0 ? normalize(cross(normalWorld, uWorld)) : normalize(cross(uWorld, normalWorld));
    return { uWorld, vWorld };
  }

  function getCanonicalPlaneCenterWorld(volume, normalWorld) {
    const volumeCenter = volume?.centerWorld;
    if (!volumeCenter) {
      return null;
    }
    const navigationCenter = state.mpr.centerWorld || volumeCenter;
    const normalOffset = dot(subtractVectors(navigationCenter, volumeCenter), normalWorld);
    return addVectors(volumeCenter, scaleVector(normalWorld, normalOffset));
  }

  function getCurrentPlaneFrame(plane, reconstruction) {
    const activeReconstruction = reconstruction || getActiveReconstruction();
    const volume = activeReconstruction?.volume;
    if (!volume) {
      return null;
    }

    const metrics = getPlaneMetrics(volume, plane);
    const base = LOCAL_PLANE_BASES[plane];
    const planeNormals = getMprPlaneNormals();
    const nWorld = cloneVector(planeNormals[plane] || worldDirectionFromLocal(rotateLocalVector(base.n)));
    const { uWorld, vWorld } = getRollLockedPlaneBasis(base, nWorld);

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

  function getCanonicalPlaneFrame(plane, reconstruction) {
    const activeReconstruction = reconstruction || getActiveReconstruction();
    const volume = activeReconstruction?.volume;
    if (!volume) {
      return null;
    }

    const metrics = getPlaneMetrics(volume, plane);
    const base = LOCAL_PLANE_BASES[plane];
    const nWorld = worldDirectionFromLocal(base.n);
    const { uWorld, vWorld } = getRollLockedPlaneBasis(base, nWorld);
    const centerWorld = getCanonicalPlaneCenterWorld(volume, nWorld) || volume.centerWorld;

    return {
      plane,
      reconstructionId: activeReconstruction.id,
      centerWorld: cloneVector(centerWorld),
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

  function getCanonicalPlaneFrameAtCenter(plane, reconstruction, centerWorld) {
    const activeReconstruction = reconstruction || getActiveReconstruction();
    const volume = activeReconstruction?.volume;
    if (!volume) {
      return null;
    }

    const metrics = getPlaneMetrics(volume, plane);
    const base = LOCAL_PLANE_BASES[plane];
    const nWorld = worldDirectionFromLocal(base.n);
    const { uWorld, vWorld } = getRollLockedPlaneBasis(base, nWorld);
    const navigationCenter = centerWorld || volume.centerWorld;
    const normalOffset = dot(subtractVectors(navigationCenter, volume.centerWorld), nWorld);
    const planeCenter = addVectors(volume.centerWorld, scaleVector(nWorld, normalOffset));

    return {
      plane,
      reconstructionId: activeReconstruction.id,
      centerWorld: cloneVector(planeCenter),
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

  function getCurrentPlaneFrameAtCenter(plane, reconstruction, centerWorld) {
    const activeReconstruction = reconstruction || getActiveReconstruction();
    const volume = activeReconstruction?.volume;
    if (!volume) {
      return null;
    }

    const metrics = getPlaneMetrics(volume, plane);
    const base = LOCAL_PLANE_BASES[plane];
    const planeNormals = getMprPlaneNormals();
    const nWorld = cloneVector(planeNormals[plane] || worldDirectionFromLocal(rotateLocalVector(base.n)));
    const { uWorld, vWorld } = getRollLockedPlaneBasis(base, nWorld);

    return {
      plane,
      reconstructionId: activeReconstruction.id,
      centerWorld: cloneVector(centerWorld || volume.centerWorld),
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

  function getReadoutIndexAtCenter(reconstruction, plane, centerWorld) {
    if (!reconstruction || !centerWorld) {
      return 0;
    }

    const coordinates = worldToVolumeCoordinates(reconstruction.volume, centerWorld);
    if (plane === "axial") {
      return clamp(Math.round(coordinates.z), 0, reconstruction.volume.depth - 1);
    }
    if (plane === "coronal") {
      return clamp(Math.round(coordinates.y), 0, reconstruction.volume.rows - 1);
    }
    return clamp(Math.round(coordinates.x), 0, reconstruction.volume.columns - 1);
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
    updateViewportDicomOverlays();
  }

  function updateMetadataOverlayToggleButton() {
    if (!els.metadataOverlayToggleButton) {
      return;
    }
    els.metadataOverlayToggleButton.textContent = state.showDicomMetadataOverlay ? "Hide DICOM Overlay" : "Show DICOM Overlay";
  }

  function buildViewportDicomOverlayRows(viewportId) {
    const reconstruction = getActiveReconstruction();
    const summary = getStudyMetadataSummary(reconstruction);
    if (!summary) {
      return [];
    }
    const plane = getViewportPlane(viewportId);
    const planeTitle = viewportId === "presentation" ? "Axial" : VIEWPORT_CONFIG[viewportId].readoutLabel;
    return [
      [
        { label: "Patient", value: summary.patientName },
        { label: "ID", value: summary.patientId },
      ],
      [
        { label: "Series", value: summary.seriesLabel },
        { label: "No", value: summary.seriesNumber },
      ],
      [
        { label: "Plane", value: planeTitle },
        { label: "Slice", value: getViewportSummary(viewportId) },
      ],
      [
        { label: "Thickness", value: summary.thickness },
        { label: "Increment", value: summary.increment },
      ],
      [
        { label: "Kernel", value: summary.kernel },
        { label: "IR", value: summary.iterative },
      ],
      [
        { label: "Spacing", value: summary.spacing },
        { label: "kVp", value: summary.kvp },
      ],
      [
        { label: "Matrix", value: summary.matrix },
        { label: plane === "axial" ? "Position" : "Acquired", value: plane === "axial" ? summary.position : summary.acquired },
      ],
    ];
  }

  function renderViewportDicomOverlay(overlay, rows) {
    if (!overlay) {
      return;
    }
    overlay.innerHTML = "";
    const closeButton = document.createElement("button");
    closeButton.className = "viewport-dicom-overlay-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Hide DICOM header");
    closeButton.setAttribute("title", "Hide DICOM header");
    closeButton.textContent = "×";
    overlay.appendChild(closeButton);
    rows.forEach((row) => {
      const line = document.createElement("div");
      line.className = "viewport-dicom-line";
      row.forEach((item, index) => {
        if (index > 0) {
          const divider = document.createElement("span");
          divider.textContent = "•";
          line.appendChild(divider);
        }
        const strong = document.createElement("strong");
        strong.textContent = `${item.label}:`;
        line.appendChild(strong);
        const value = document.createElement("span");
        value.textContent = item.value || "-";
        line.appendChild(value);
      });
      overlay.appendChild(line);
    });
  }

  function applyViewportOverlayPosition(kind, element) {
    if (!element) {
      return;
    }
    const position = state.viewportOverlayPositions?.[kind];
    if (!position) {
      element.style.left = "";
      element.style.top = "";
      element.style.right = "";
      return;
    }
    element.style.left = `${position.x}px`;
    element.style.top = `${position.y}px`;
    element.style.right = "auto";
  }

  function applyViewportOverlayPositions() {
    applyViewportOverlayPosition("dicom", els.dicomOverlays?.presentation);
    applyViewportOverlayPosition("series", els.presentationSeriesLabel);
  }

  function syncViewportOverlayVisibilityFlag() {
    if (!state.showDicomMetadataOverlay && !state.showPresentationSeriesLabel) {
      state.showViewportOverlays = false;
      updateViewportChromeUi();
      updateComparisonUi();
    }
  }

  function getPresentationOverlayDragBounds(element) {
    const panel = element?.closest(".viewport-panel");
    if (!panel || !element) {
      return null;
    }
    const panelRect = panel.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    return {
      panelRect,
      elementRect,
      left: elementRect.left - panelRect.left,
      top: elementRect.top - panelRect.top,
      maxLeft: Math.max(0, panelRect.width - elementRect.width - 8),
      maxTop: Math.max(0, panelRect.height - elementRect.height - 8),
    };
  }

  function startViewportOverlayDrag(kind, element, event) {
    if (event.button !== 2 || event.target?.closest?.("button")) {
      return;
    }
    const bounds = getPresentationOverlayDragBounds(element);
    if (!bounds) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    element.setPointerCapture?.(event.pointerId);
    state.dragging = {
      type: "viewportOverlay",
      overlayKind: kind,
      pointerElement: element,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: bounds.left,
      startTop: bounds.top,
      maxLeft: bounds.maxLeft,
      maxTop: bounds.maxTop,
    };
  }

  function handleViewportOverlayDragMove(event) {
    const dragging = state.dragging;
    if (!dragging || dragging.type !== "viewportOverlay") {
      return false;
    }
    const x = clamp(dragging.startLeft + event.clientX - dragging.startClientX, 8, dragging.maxLeft);
    const y = clamp(dragging.startTop + event.clientY - dragging.startClientY, 8, dragging.maxTop);
    state.viewportOverlayPositions[dragging.overlayKind] = { x, y };
    applyViewportOverlayPositions();
    event.preventDefault();
    return true;
  }

  function updateViewportDicomOverlays() {
    updateMetadataOverlayToggleButton();
    Object.entries(els.dicomOverlays || {}).forEach(([viewportId, overlay]) => {
      if (!overlay) {
        return;
      }
      const shouldShow = state.showDicomMetadataOverlay && Boolean(getActiveReconstruction());
      overlay.classList.toggle("is-hidden", !shouldShow);
      if (!shouldShow) {
        overlay.innerHTML = "";
        return;
      }
      renderViewportDicomOverlay(overlay, buildViewportDicomOverlayRows(viewportId));
    });
    applyViewportOverlayPositions();
  }

  function updatePresentationSeriesLabelToggleButton() {
    if (!els.presentationSeriesLabelToggleButton) {
      return;
    }
    els.presentationSeriesLabelToggleButton.textContent = state.showPresentationSeriesLabel
      ? "Hide Series Label"
      : "Show Series Label";
    els.presentationSeriesLabelToggleButton.classList.toggle("is-active", state.showPresentationSeriesLabel);
  }

  function buildPresentationSeriesLabelText(reconstruction) {
    const summary = getStudyMetadataSummary(reconstruction);
    if (!summary) {
      return "";
    }
    const index = state.reconstructions.findIndex((item) => item.id === reconstruction.id);
    const position = index >= 0 ? `Recon ${index + 1}/${state.reconstructions.length}` : "Recon";
    return [
      position,
      summary.seriesLabel ? `Series ${summary.seriesLabel}` : "",
      summary.seriesNumber && summary.seriesNumber !== "-" ? `No ${summary.seriesNumber}` : "",
      summary.kernel && summary.kernel !== "-" ? `Kernel ${summary.kernel}` : "",
      summary.iterative && summary.iterative !== "-" ? `IR ${summary.iterative}` : "",
    ]
      .filter(Boolean)
      .join(" • ");
  }

  function updatePresentationSeriesLabel() {
    updatePresentationSeriesLabelToggleButton();
    if (!els.presentationSeriesLabel) {
      return;
    }
    const reconstruction = getActiveReconstruction();
    const shouldShow = Boolean(reconstruction && state.showPresentationSeriesLabel);
    els.presentationSeriesLabel.classList.toggle("is-hidden", !shouldShow);
    if (els.presentationSeriesLabelText) {
      els.presentationSeriesLabelText.textContent = shouldShow ? buildPresentationSeriesLabelText(reconstruction) : "";
    }
    applyViewportOverlayPosition("series", els.presentationSeriesLabel);
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

  function voiToByte(value, voi) {
    const activeVoi = voi || state.currentVOI;
    const width = Math.max(1, activeVoi.width);
    const center = activeVoi.center;
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

  function renderPlanePixelsToCanvas(bufferCanvas, reconstruction, frame, voi) {
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
        const gray = voiToByte(hu == null ? -1024 : hu, voi);
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

    if (overlayStyle?.drawMprLine) {
      overlayStyle.drawMprLine(ctx, start, end, color);
      return;
    }

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
    const offsetX = (Number(options.annotation?.labelOffsetXpx) || 0) + (Number(options.offsetX) || 0);
    const offsetY = (Number(options.annotation?.labelOffsetYpx) || 0) + (Number(options.offsetY) || 0);
    if (overlayStyle?.drawLabel) {
      return overlayStyle.drawLabel(ctx, text, x, y, fill, {
        ...options,
        offsetX,
        offsetY,
      });
    }
    ctx.save();
    ctx.font = "600 13px Aptos, Segoe UI, sans-serif";
    const textWidth = ctx.measureText(text).width;
    const width = textWidth + 16;
    const height = 24;
    const px = x + 10 + offsetX;
    const py = y - height - 10 + offsetY;
    ctx.fillStyle = fill;
    ctx.fillRect(px, py, width, height);
    ctx.fillStyle = "#061117";
    ctx.textBaseline = "middle";
    ctx.fillText(text, px + 8, py + height / 2 + 1);
    ctx.restore();
    return { x: px, y: py, width, height };
  }

  function getLabelChipBounds(ctx, text, x, y, options = {}) {
    const offsetX = (Number(options.annotation?.labelOffsetXpx) || 0) + (Number(options.offsetX) || 0);
    const offsetY = (Number(options.annotation?.labelOffsetYpx) || 0) + (Number(options.offsetY) || 0);
    if (overlayStyle?.layoutLabel) {
      return overlayStyle.layoutLabel(ctx, text, x, y, {
        ...options,
        offsetX,
        offsetY,
      });
    }
    ctx.save();
    ctx.font = "600 13px Aptos, Segoe UI, sans-serif";
    const textWidth = ctx.measureText(text).width;
    ctx.restore();
    const width = textWidth + 16;
    const height = 24;
    return {
      x: x + 10 + offsetX,
      y: y - height - 10 + offsetY,
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

  function expandRect(rect, padding) {
    return {
      x: rect.x - padding,
      y: rect.y - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    };
  }

  function rectsOverlap(a, b, padding = 0) {
    const left = expandRect(a, padding);
    const right = expandRect(b, padding);
    return (
      left.x < right.x + right.width &&
      left.x + left.width > right.x &&
      left.y < right.y + right.height &&
      left.y + left.height > right.y
    );
  }

  function pointInsideRect(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
  }

  function lineSegmentsIntersect(a, b, c, d) {
    const direction = (p, q, r) => (r.x - p.x) * (q.y - p.y) - (q.x - p.x) * (r.y - p.y);
    const onSegment = (p, q, r) =>
      Math.min(p.x, q.x) <= r.x + 1e-6 &&
      r.x <= Math.max(p.x, q.x) + 1e-6 &&
      Math.min(p.y, q.y) <= r.y + 1e-6 &&
      r.y <= Math.max(p.y, q.y) + 1e-6;

    const d1 = direction(c, d, a);
    const d2 = direction(c, d, b);
    const d3 = direction(a, b, c);
    const d4 = direction(a, b, d);

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true;
    }
    return (
      (Math.abs(d1) <= 1e-6 && onSegment(c, d, a)) ||
      (Math.abs(d2) <= 1e-6 && onSegment(c, d, b)) ||
      (Math.abs(d3) <= 1e-6 && onSegment(a, b, c)) ||
      (Math.abs(d4) <= 1e-6 && onSegment(a, b, d))
    );
  }

  function segmentIntersectsRect(start, end, rect, padding = 0) {
    const expanded = expandRect(rect, padding);
    if (pointInsideRect(start, expanded) || pointInsideRect(end, expanded)) {
      return true;
    }
    const corners = [
      { x: expanded.x, y: expanded.y },
      { x: expanded.x + expanded.width, y: expanded.y },
      { x: expanded.x + expanded.width, y: expanded.y + expanded.height },
      { x: expanded.x, y: expanded.y + expanded.height },
    ];
    for (let index = 0; index < corners.length; index += 1) {
      if (lineSegmentsIntersect(start, end, corners[index], corners[(index + 1) % corners.length])) {
        return true;
      }
    }
    return false;
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

  function cloneAnnotationViewContext(context) {
    if (!context) {
      return null;
    }
    return {
      ...context,
      viewportId: VIEWPORT_IDS.includes(context.viewportId) ? context.viewportId : "",
      mprCenterWorld: Array.isArray(context.mprCenterWorld) ? cloneVector(context.mprCenterWorld) : null,
      presentationCenterWorld: Array.isArray(context.presentationCenterWorld)
        ? cloneVector(context.presentationCenterWorld)
        : null,
      mprPlaneNormals: cloneMprPlaneNormals(context.mprPlaneNormals),
      mprRotations: context.mprRotations
        ? {
            axial: normalizeAngleDegrees(Number(context.mprRotations.axial) || 0),
            coronal: normalizeAngleDegrees(Number(context.mprRotations.coronal) || 0),
            sagittal: normalizeAngleDegrees(Number(context.mprRotations.sagittal) || 0),
          }
        : null,
      maximizedViewportId: VIEWPORT_IDS.includes(context.maximizedViewportId) ? context.maximizedViewportId : null,
    };
  }

  function cloneAnnotation(annotation) {
    const clone = {
      ...annotation,
      frame: cloneFrame(annotation.frame),
      worldPoints: cloneWorldPoints(annotation.worldPoints),
    };
    if (annotation.viewContext) {
      clone.viewContext = cloneAnnotationViewContext(annotation.viewContext);
    }
    if (annotation.ellipse) {
      clone.ellipse = { ...annotation.ellipse };
    }
    if (annotation.squareProfile) {
      clone.squareProfile = { ...annotation.squareProfile };
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
    if (annotation.plaqueGuideAdjustments) {
      clone.plaqueGuideAdjustments = { ...annotation.plaqueGuideAdjustments };
    }
    if (annotation.vascularGuideAdjustments) {
      clone.vascularGuideAdjustments = { ...annotation.vascularGuideAdjustments };
    }
    if (Array.isArray(annotation.diameterLines)) {
      clone.diameterLines = annotation.diameterLines.map((line) => ({
        ...line,
        frame: line.frame ? cloneFrame(line.frame) : undefined,
        viewContext: line.viewContext ? cloneAnnotationViewContext(line.viewContext) : undefined,
        worldPoints: cloneWorldPoints(line.worldPoints || []),
      }));
    }
    return clone;
  }

  function createAnnotationViewContext(frame, options) {
    const layout = options?.layout || (state.layout === "mpr" ? "mpr" : "presentation");
    const viewportId = VIEWPORT_IDS.includes(options?.viewportId)
      ? options.viewportId
      : VIEWPORT_IDS.includes(state.activeViewportId)
        ? state.activeViewportId
        : "presentation";
    const context = {
      layout,
      viewportId,
      plane: frame.plane,
    };
    if (layout === "mpr") {
      context.mprCenterWorld = cloneVector(state.mpr.centerWorld || frame.centerWorld);
      context.mprPlaneNormals = cloneMprPlaneNormals(state.mpr.planeNormals) || cloneMprPlaneNormals(getMprPlaneNormals());
      context.mprRotations = { ...state.mpr.rotations };
      context.maximizedViewportId = state.maximizedViewportId || null;
    } else {
      context.presentationCenterWorld = cloneVector(state.mpr.centerWorld || frame.centerWorld);
    }
    return context;
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
    if (isPlaqueProfileAnnotation(clone)) {
      delete clone.plaqueGuideAdjustments;
    }
    return clone;
  }

  function addAnnotation(annotation) {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return;
    }
    captureUndoSnapshot();
    reconstruction.annotations.push(annotation);
    state.selectedAnnotationId = annotation.id;
    if (PROFILE_TYPES.has(annotation.type)) {
      state.selectedProfileAnnotationId = annotation.id;
    }
    updateSidebarUi();
    requestRenderAll();
  }

  function createAnnotationBase(type, frame, options) {
    return {
      id: state.annotationSequence++,
      type,
      plane: frame.plane,
      frame: cloneFrame(frame),
      viewContext: createAnnotationViewContext(frame, options),
      worldPoints: [],
    };
  }

  function diameterDraftMatches(draft, toolKey, reconstruction, frame) {
    if (!draft || draft.toolKey !== toolKey || draft.reconstructionId !== reconstruction?.id || draft.plane !== frame?.plane) {
      return false;
    }
    if (toolKey === "stenosisDiameter") {
      return dot(draft.frame.nWorld, frame.nWorld) >= 0.992;
    }
    if (dot(draft.frame.nWorld, frame.nWorld) < 0.992) {
      return false;
    }
    const distance = Math.abs(dot(subtractVectors(draft.frame.centerWorld, frame.centerWorld), frame.nWorld));
    return distance <= frame.metrics.spacingNormal * 0.75;
  }

  function ensureDiameterDraft(toolKey, reconstruction, frame, viewportId) {
    if (!diameterDraftMatches(state.diameterDraft, toolKey, reconstruction, frame)) {
      state.diameterDraft = {
        toolKey,
        reconstructionId: reconstruction.id,
        plane: frame.plane,
        frame: cloneFrame(frame),
        viewContext: createAnnotationViewContext(frame, { viewportId }),
        lines: [],
      };
    }
    return state.diameterDraft;
  }

  function getDiameterDraftRole(toolKey, index) {
    return getDiameterToolConfig(toolKey)?.roles?.[index] || {
      key: `line${index + 1}`,
      label: `Line ${index + 1}`,
      color: getAnnotationAccentColor({ type: toolKey }),
    };
  }

  function getDiameterDraftStatus(toolKey, nextIndex) {
    const config = getDiameterToolConfig(toolKey);
    const role = config?.roles?.[nextIndex];
    if (!config || !role) {
      return "Draw the next diameter.";
    }
    return `${config.label}: draw ${role.label.toLowerCase()} diameter (${nextIndex + 1} of ${config.roles.length}).`;
  }

  function buildDiameterAnnotationFromDraft(draft) {
    const annotation = {
      ...createAnnotationBase(draft.toolKey, draft.frame, {
        layout: draft.viewContext?.layout,
        viewportId: draft.viewContext?.viewportId,
      }),
      viewContext: cloneAnnotationViewContext(draft.viewContext),
      diameterLines: draft.lines.map((line) => ({
        ...line,
        frame: line.frame ? cloneFrame(line.frame) : cloneFrame(draft.frame),
        plane: line.plane || line.frame?.plane || draft.plane,
        viewContext: line.viewContext ? cloneAnnotationViewContext(line.viewContext) : undefined,
        worldPoints: cloneWorldPoints(line.worldPoints),
      })),
    };
    annotation.worldPoints = annotation.diameterLines.flatMap((line) => line.worldPoints);
    return annotation;
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

  function smoothBrushMaskOnce(mask) {
    const next = new Array(mask.cells.length).fill(0);
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        let neighbors = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const sampleX = x + offsetX;
            const sampleY = y + offsetY;
            if (sampleX < 0 || sampleY < 0 || sampleX >= mask.width || sampleY >= mask.height) {
              continue;
            }
            neighbors += mask.cells[brushMaskIndex(mask, sampleX, sampleY)] ? 1 : 0;
          }
        }
        const index = brushMaskIndex(mask, x, y);
        next[index] = mask.cells[index] ? (neighbors >= 3 ? 1 : 0) : (neighbors >= 5 ? 1 : 0);
      }
    }
    mask.cells = next;
    return mask;
  }

  function morphBrushMask(annotation, direction) {
    if (!annotation?.mask?.cells?.length) {
      return false;
    }
    const mask = cloneBrushMask(annotation.mask);
    const next = new Array(mask.cells.length).fill(0);

    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        const index = brushMaskIndex(mask, x, y);
        if (direction > 0) {
          let fill = false;
          for (let offsetY = -1; offsetY <= 1 && !fill; offsetY += 1) {
            for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
              const sampleX = x + offsetX;
              const sampleY = y + offsetY;
              if (sampleX < 0 || sampleY < 0 || sampleX >= mask.width || sampleY >= mask.height) {
                continue;
              }
              if (mask.cells[brushMaskIndex(mask, sampleX, sampleY)]) {
                fill = true;
                break;
              }
            }
          }
          next[index] = fill ? 1 : 0;
        } else if (mask.cells[index]) {
          let keep = true;
          for (let offsetY = -1; offsetY <= 1 && keep; offsetY += 1) {
            for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
              const sampleX = x + offsetX;
              const sampleY = y + offsetY;
              if (sampleX < 0 || sampleY < 0 || sampleX >= mask.width || sampleY >= mask.height) {
                keep = false;
                break;
              }
              if (!mask.cells[brushMaskIndex(mask, sampleX, sampleY)]) {
                keep = false;
                break;
              }
            }
          }
          next[index] = keep ? 1 : 0;
        }
      }
    }

    annotation.mask = smoothBrushMaskOnce({ ...mask, cells: next });
    trimBrushMask(annotation.mask);
    return countBrushMaskCells(annotation.mask) > 0;
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
    const retainedArc = forwardCount <= backwardCount
      ? collectWrappedPlanePoints(original, endIndex, startIndex)
      : collectWrappedPlanePoints(original, startIndex, endIndex);

    const merged = simplifyPlanePoints(
      resampleClosedPlanePoints([...correctionPoints, ...retainedArc], 0.65),
      0.45
    );
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

    const sampled = resampleClosedPlanePoints(planePoints, Math.max(0.5, Math.min(annotation.frame.metrics.spacingX, annotation.frame.metrics.spacingY)));
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

  function annotationTouchedByEraser(annotation, planePoint, radiusMm, frame) {
    if (annotation.type === "probe" || annotation.type === "text") {
      const point = worldToPlaneCoordinates(annotation.frame, annotation.worldPoints[0]);
      return Math.hypot(point.xMm - planePoint.xMm, point.yMm - planePoint.yMm) <= radiusMm;
    }

    if (annotation.type === "length" || annotation.type === "arrow" || isLineProfileAnnotationType(annotation.type)) {
      const start = worldToPlaneCoordinates(annotation.frame, annotation.worldPoints[0]);
      const end = worldToPlaneCoordinates(annotation.frame, annotation.worldPoints[1]);
      const distancePx = pointToSegmentDistancePx(
        { x: planePoint.xMm, y: planePoint.yMm },
        { x: start.xMm, y: start.yMm },
        { x: end.xMm, y: end.yMm }
      );
      return distancePx <= radiusMm;
    }

    if (isMultiDiameterAnnotationType(annotation.type)) {
      return getDiameterAnnotationLines(annotation).some((line) => {
        if (!isDiameterLineVisible(annotation, line, frame)) {
          return false;
        }
        const lineFrame = getDiameterLineFrame(annotation, line);
        const start = worldToPlaneCoordinates(lineFrame, line.worldPoints[0]);
        const end = worldToPlaneCoordinates(lineFrame, line.worldPoints[1]);
        const distancePx = pointToSegmentDistancePx(
          { x: planePoint.xMm, y: planePoint.yMm },
          { x: start.xMm, y: start.yMm },
          { x: end.xMm, y: end.yMm }
        );
        return distancePx <= radiusMm;
      });
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

      if (annotationTouchedByEraser(annotation, planePoint, radiusMm, frame)) {
        removeAnnotationRecord(reconstruction, annotation);
        changed = true;
      }
    });

    if (changed) {
      renderAnnotationManager();
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

  function isFrameVisibleOnFrame(sourceFrame, sourcePlane, frame) {
    if (!sourceFrame || !frame || sourcePlane !== frame.plane) {
      return false;
    }

    if (dot(sourceFrame.nWorld, frame.nWorld) < 0.992) {
      return false;
    }

    const distance = Math.abs(dot(subtractVectors(sourceFrame.centerWorld, frame.centerWorld), frame.nWorld));
    return distance <= frame.metrics.spacingNormal * 0.75;
  }

  function getDiameterLineFrame(annotation, line) {
    return line?.frame || annotation?.frame || null;
  }

  function isDiameterLineVisible(annotation, line, frame) {
    const lineFrame = getDiameterLineFrame(annotation, line);
    const linePlane = line?.plane || lineFrame?.plane || annotation?.plane;
    return isFrameVisibleOnFrame(lineFrame, linePlane, frame);
  }

  function isAnnotationVisible(annotation, frame) {
    if (!annotation || !frame) {
      return false;
    }
    if (isMultiDiameterAnnotationType(annotation.type)) {
      return getDiameterAnnotationLines(annotation).some((line) => isDiameterLineVisible(annotation, line, frame));
    }
    return isFrameVisibleOnFrame(annotation.frame, annotation.plane, frame);
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

  function getDiameterToolConfig(type) {
    return DIAMETER_TOOL_CONFIGS[type] || null;
  }

  function getDiameterAnnotationLines(annotation) {
    if (!annotation || !isMultiDiameterAnnotationType(annotation.type)) {
      return [];
    }
    const config = getDiameterToolConfig(annotation.type);
    if (Array.isArray(annotation.diameterLines) && annotation.diameterLines.length) {
      return annotation.diameterLines
        .map((line, index) => {
          const role = config?.roles?.[index] || {};
          const worldPoints = Array.isArray(line.worldPoints) ? line.worldPoints.slice(0, 2) : [];
          if (worldPoints.length < 2) {
            return null;
          }
          return {
            key: line.key || role.key || `line${index + 1}`,
            label: line.label || role.label || `Line ${index + 1}`,
            color: line.color || role.color || getAnnotationAccentColor(annotation),
            frame: line.frame || annotation.frame,
            plane: line.plane || line.frame?.plane || annotation.plane,
            viewContext: line.viewContext || annotation.viewContext,
            worldPoints,
          };
        })
        .filter(Boolean);
    }

    const worldPoints = Array.isArray(annotation.worldPoints) ? annotation.worldPoints : [];
    const lines = [];
    for (let index = 0; index + 1 < worldPoints.length; index += 2) {
      const role = config?.roles?.[index / 2] || {};
      lines.push({
        key: role.key || `line${lines.length + 1}`,
        label: role.label || `Line ${lines.length + 1}`,
        color: role.color || getAnnotationAccentColor(annotation),
        frame: annotation.frame,
        plane: annotation.plane,
        viewContext: annotation.viewContext,
        worldPoints: [worldPoints[index], worldPoints[index + 1]],
      });
    }
    return lines;
  }

  function getDiameterLineLengthMm(line) {
    if (!line?.worldPoints?.[0] || !line?.worldPoints?.[1]) {
      return null;
    }
    const lengthMm = vectorLength(subtractVectors(line.worldPoints[0], line.worldPoints[1]));
    return Number.isFinite(lengthMm) ? lengthMm : null;
  }

  function getDiameterLineUnitDirection(line) {
    if (!line?.worldPoints?.[0] || !line?.worldPoints?.[1]) {
      return null;
    }
    const vector = subtractVectors(line.worldPoints[1], line.worldPoints[0]);
    const lengthMm = vectorLength(vector);
    return Number.isFinite(lengthMm) && lengthMm > 1e-4 ? scaleVector(vector, 1 / lengthMm) : null;
  }

  function constrainWorldPointToDirection(fixedPoint, targetPoint, unitDirection) {
    if (!fixedPoint || !targetPoint || !unitDirection) {
      return targetPoint;
    }
    const projectedDistanceMm = dot(subtractVectors(targetPoint, fixedPoint), unitDirection);
    return addVectors(fixedPoint, scaleVector(unitDirection, projectedDistanceMm));
  }

  function alignDiameterLineToDirection(line, unitDirection) {
    const lengthMm = getDiameterLineLengthMm(line);
    if (!line?.worldPoints?.[0] || !line?.worldPoints?.[1] || !unitDirection || !Number.isFinite(lengthMm) || lengthMm <= 1e-4) {
      return;
    }
    const center = scaleVector(addVectors(line.worldPoints[0], line.worldPoints[1]), 0.5);
    const halfVector = scaleVector(unitDirection, lengthMm / 2);
    line.worldPoints = [
      subtractVectors(center, halfVector),
      addVectors(center, halfVector),
    ];
  }

  function getConstrainedDiameterDragWorldPoints(draft, dragging) {
    const worldPoints = Array.isArray(dragging?.worldPoints) ? cloneWorldPoints(dragging.worldPoints) : [];
    if (draft?.toolKey !== "bloomingDiameter" || draft.lines.length !== 1 || worldPoints.length < 2) {
      return worldPoints;
    }
    const outerDirection = getDiameterLineUnitDirection(draft.lines[0]);
    if (outerDirection) {
      worldPoints[1] = constrainWorldPointToDirection(worldPoints[0], worldPoints[1], outerDirection);
    }
    return worldPoints;
  }

  function updateBloomingDiameterPoint(lines, lineIndex, pointIndex, worldPoint) {
    const line = lines[lineIndex];
    if (!line?.worldPoints?.[pointIndex]) {
      return false;
    }

    if (lineIndex === 1) {
      const outerDirection = getDiameterLineUnitDirection(lines[0]);
      const fixedPoint = line.worldPoints[pointIndex === 0 ? 1 : 0];
      line.worldPoints[pointIndex] = outerDirection
        ? constrainWorldPointToDirection(fixedPoint, worldPoint, outerDirection)
        : worldPoint;
      return true;
    }

    line.worldPoints[pointIndex] = worldPoint;
    if (lineIndex === 0 && lines[1]) {
      const outerDirection = getDiameterLineUnitDirection(line);
      if (outerDirection) {
        alignDiameterLineToDirection(lines[1], outerDirection);
      }
    }
    return true;
  }

  function getDiameterMeasurementSummary(annotation) {
    const lines = getDiameterAnnotationLines(annotation);
    const lengths = lines.map(getDiameterLineLengthMm);
    if (annotation?.type === "bloomingDiameter") {
      const outerDiameterMm = lengths[0];
      const innerDiameterMm = lengths[1];
      const bloomingPercent =
        Number.isFinite(outerDiameterMm) && outerDiameterMm > 0 && Number.isFinite(innerDiameterMm)
          ? ((outerDiameterMm - innerDiameterMm) / outerDiameterMm) * 100
          : null;
      return {
        outerDiameterMm,
        innerDiameterMm,
        bloomingPercent,
      };
    }
    if (annotation?.type === "stenosisDiameter") {
      const proximalReferenceDiameterMm = lengths[0];
      const distalReferenceDiameterMm = lengths[1];
      const minimalLumenDiameterMm = lengths[2];
      const referenceDiameterMm = averageFinite([proximalReferenceDiameterMm, distalReferenceDiameterMm]);
      const stenosisPercent =
        Number.isFinite(referenceDiameterMm) && referenceDiameterMm > 0 && Number.isFinite(minimalLumenDiameterMm)
          ? ((referenceDiameterMm - minimalLumenDiameterMm) / referenceDiameterMm) * 100
          : null;
      return {
        proximalReferenceDiameterMm,
        distalReferenceDiameterMm,
        referenceDiameterMm,
        minimalLumenDiameterMm,
        stenosisPercent,
      };
    }
    return {};
  }

  function getMultiDiameterLabel(annotation) {
    const summary = getDiameterMeasurementSummary(annotation);
    if (annotation?.type === "bloomingDiameter") {
      return Number.isFinite(summary.bloomingPercent)
        ? `Blooming ${summary.bloomingPercent.toFixed(1)}%`
        : "Blooming";
    }
    if (annotation?.type === "stenosisDiameter") {
      return Number.isFinite(summary.stenosisPercent)
        ? `Stenosis ${summary.stenosisPercent.toFixed(1)}%`
        : "Stenosis";
    }
    return getDiameterToolConfig(annotation?.type)?.label || "Diameter";
  }

  function getCanvasVectorPair(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length <= 1e-4) {
      return {
        tangent: { x: 1, y: 0 },
        normal: { x: 0, y: -1 },
      };
    }
    const tangent = { x: dx / length, y: dy / length };
    return {
      tangent,
      normal: { x: -tangent.y, y: tangent.x },
    };
  }

  function getBoundsCenter(bounds) {
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };
  }

  function getDiameterLabelCandidates(ctx, item, annotation) {
    const baseBounds = getLabelChipBounds(ctx, item.text, item.anchor.x, item.anchor.y, {
      annotation,
      viewportWidth: ctx.canvas?.width,
      viewportHeight: ctx.canvas?.height,
    });
    const baseCenter = getBoundsCenter(baseBounds);
    const distances = item.kind === "summary" ? [48, 74, 100, 126, 152] : [36, 60, 84, 108, 132];
    const shifts = item.kind === "summary" ? [0, 38, -38, 76, -76] : [0, 30, -30, 60, -60];
    const preferredSide = item.preferredSide || -1;
    const sides = [preferredSide, -preferredSide];
    const candidates = [];

    sides.forEach((side, sideIndex) => {
      distances.forEach((distance, distanceIndex) => {
        shifts.forEach((shift, shiftIndex) => {
          const targetCenter = {
            x: item.anchor.x + item.normal.x * side * distance + item.tangent.x * shift,
            y: item.anchor.y + item.normal.y * side * distance + item.tangent.y * shift,
          };
          candidates.push({
            offsetX: targetCenter.x - baseCenter.x,
            offsetY: targetCenter.y - baseCenter.y,
            rank: sideIndex * 200 + distanceIndex * 20 + shiftIndex,
          });
        });
      });
    });

    candidates.push({ offsetX: 0, offsetY: 0, rank: 10000 });
    return candidates;
  }

  function scoreDiameterLabelBounds(bounds, candidate, placedBounds, segments) {
    let score = candidate.rank;
    segments.forEach((segment) => {
      if (segmentIntersectsRect(segment.start, segment.end, bounds, 8)) {
        score += 100000;
      } else {
        const center = getBoundsCenter(bounds);
        const distance = pointToSegmentDistancePx(center, segment.start, segment.end);
        score += Math.max(0, 28 - distance) * 35;
      }
    });
    placedBounds.forEach((placed) => {
      if (rectsOverlap(bounds, placed, 5)) {
        score += 100000;
      }
    });
    return score;
  }

  function getDiameterLabelPlacements(ctx, annotation, reconstruction, frame, geometry, options = {}) {
    const lines = getDiameterAnnotationLines(annotation).filter((line) => isDiameterLineVisible(annotation, line, frame));
    const segments = lines.map((line) => ({
      line,
      start: projectWorldPointToCanvas(frame, geometry, line.worldPoints[0]),
      end: projectWorldPointToCanvas(frame, geometry, line.worldPoints[1]),
    }));
    if (!segments.length) {
      return [];
    }

    const groupCenter = segments.reduce(
      (sum, segment) => ({
        x: sum.x + (segment.start.x + segment.end.x) / 2,
        y: sum.y + (segment.start.y + segment.end.y) / 2,
      }),
      { x: 0, y: 0 }
    );
    groupCenter.x /= segments.length;
    groupCenter.y /= segments.length;

    const items = segments.map((segment, index) => {
      const vectors = getCanvasVectorPair(segment.start, segment.end);
      const anchor = {
        x: (segment.start.x + segment.end.x) / 2,
        y: (segment.start.y + segment.end.y) / 2,
      };
      const relativeSide =
        Math.sign((anchor.x - groupCenter.x) * vectors.normal.x + (anchor.y - groupCenter.y) * vectors.normal.y) ||
        (index % 2 === 0 ? -1 : 1);
      const lengthMm = getDiameterLineLengthMm(segment.line);
      return {
        kind: "line",
        text: Number.isFinite(lengthMm)
          ? `${segment.line.label} ${lengthMm.toFixed(1)} mm`
          : segment.line.label,
        anchor,
        color: segment.line.color || getAnnotationAccentColor(annotation),
        tangent: vectors.tangent,
        normal: vectors.normal,
        preferredSide: relativeSide,
      };
    });

    if (reconstruction && !options.preview) {
      const lastSegment = segments[segments.length - 1];
      const vectors = getCanvasVectorPair(lastSegment.start, lastSegment.end);
      items.push({
        kind: "summary",
        text: getMultiDiameterLabel(annotation),
        anchor: groupCenter,
        color: getAnnotationAccentColor(annotation),
        tangent: vectors.tangent,
        normal: vectors.normal,
        preferredSide: -1,
      });
    }

    const placedBounds = [];
    return items.map((item) => {
      let best = null;
      getDiameterLabelCandidates(ctx, item, annotation).forEach((candidate) => {
        const bounds = getLabelChipBounds(ctx, item.text, item.anchor.x, item.anchor.y, {
          annotation,
          offsetX: candidate.offsetX,
          offsetY: candidate.offsetY,
          viewportWidth: ctx.canvas?.width,
          viewportHeight: ctx.canvas?.height,
        });
        const score = scoreDiameterLabelBounds(bounds, candidate, placedBounds, segments);
        if (!best || score < best.score) {
          best = { ...item, ...candidate, bounds, score };
        }
      });
      placedBounds.push(best.bounds);
      return best;
    });
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

  function rotatePlanePoint(point, angleRadians) {
    const cosine = Math.cos(angleRadians);
    const sine = Math.sin(angleRadians);
    return {
      xMm: point.xMm * cosine - point.yMm * sine,
      yMm: point.xMm * sine + point.yMm * cosine,
    };
  }

  function getSquareProfileCorners(box) {
    const halfWidth = box.widthMm / 2;
    const halfHeight = box.heightMm / 2;
    const localCorners = [
      { xMm: -halfWidth, yMm: -halfHeight },
      { xMm: halfWidth, yMm: -halfHeight },
      { xMm: halfWidth, yMm: halfHeight },
      { xMm: -halfWidth, yMm: halfHeight },
    ];
    return localCorners.map((point) => {
      const rotated = rotatePlanePoint(point, box.angleRadians);
      return {
        xMm: box.centerXmm + rotated.xMm,
        yMm: box.centerYmm + rotated.yMm,
      };
    });
  }

  function getSquareProfileRotationHandle(box) {
    const offsetMm = clamp(Math.max(box.heightMm * 0.2, 6), 6, 16);
    const localPoint = { xMm: 0, yMm: -(box.heightMm / 2 + offsetMm) };
    const rotated = rotatePlanePoint(localPoint, box.angleRadians);
    return {
      xMm: box.centerXmm + rotated.xMm,
      yMm: box.centerYmm + rotated.yMm,
    };
  }

  function setSquareProfileBox(annotation, box) {
    annotation.squareProfile = {
      centerXmm: box.centerXmm,
      centerYmm: box.centerYmm,
      widthMm: box.widthMm,
      heightMm: box.heightMm,
      angleDegrees: normalizeAngleDegrees(box.angleDegrees || 0),
    };
    const corners = getSquareProfileCorners(getSquareProfilePlaneBox(annotation));
    annotation.worldPoints = [
      planePointToWorld(annotation.frame, corners[0].xMm, corners[0].yMm),
      planePointToWorld(annotation.frame, corners[2].xMm, corners[2].yMm),
    ];
  }

  function getAnnotationAccentColor(annotation) {
    if (!annotation) {
      return overlayStyle?.COLORS?.measurement || "#ffcf66";
    }
    if (annotation.type === "probe") {
      return overlayStyle?.COLORS?.probe || "#57c8ff";
    }
    if (annotation.type === "freehandRoi" || annotation.type === "brushRoi") {
      return overlayStyle?.COLORS?.roi || "#57c8ff";
    }
    if (annotation.type === "lineProfile" || annotation.type === "squareProfile") {
      return overlayStyle?.COLORS?.stent || "#7af4a8";
    }
    if (annotation.type === "plaqueLineProfile") {
      return overlayStyle?.COLORS?.plaqueCalcified || "#ff7f6e";
    }
    if (annotation.type === "plaqueNoncalcifiedLineProfile") {
      return overlayStyle?.COLORS?.plaqueNoncalcified || "#66d9d0";
    }
    if (annotation.type === "vascularLineProfile") {
      return "#f8f53a";
    }
    if (annotation.type === "bloomingDiameter") {
      return "#ffcf66";
    }
    if (annotation.type === "stenosisDiameter") {
      return "#57c8ff";
    }
    if (annotation.type === "text") {
      return overlayStyle?.COLORS?.text || "#ffd27f";
    }
    if (annotation.type === "arrow") {
      return overlayStyle?.COLORS?.arrow || "#ff8f85";
    }
    return overlayStyle?.COLORS?.measurement || "#ffcf66";
  }

  function getAnnotationLabelSpec(annotation, reconstruction, frame, geometry) {
    if (!annotation || !isAnnotationVisible(annotation, frame)) {
      return null;
    }
    const accent = getAnnotationAccentColor(annotation);
    if (annotation.type === "text") {
      const point = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
      return { text: annotation.text, anchor: point, accent };
    }
    if (annotation.type === "probe") {
      const point = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
      return { text: getProbeLabel(annotation, reconstruction), anchor: point, accent };
    }
    if (annotation.type === "length") {
      const point = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[1]);
      return { text: getLengthLabel(annotation), anchor: point, accent };
    }
    if (isLineProfileAnnotationType(annotation.type)) {
      const point = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[1]);
      return {
        text:
          annotation.type === "vascularLineProfile"
            ? "Vascular Profile"
            : isPlaqueProfileAnnotation(annotation)
              ? "Plaque-Lumen"
              : "Stent-Lumen",
        anchor: point,
        accent,
      };
    }
    if (isMultiDiameterAnnotationType(annotation.type)) {
      const lines = getDiameterAnnotationLines(annotation).filter((line) => isDiameterLineVisible(annotation, line, frame));
      const lastLine = lines[lines.length - 1];
      const anchorWorld = lastLine?.worldPoints?.[1] || annotation.worldPoints?.[annotation.worldPoints.length - 1];
      if (!anchorWorld) {
        return null;
      }
      return {
        text: getMultiDiameterLabel(annotation),
        anchor: projectWorldPointToCanvas(frame, geometry, anchorWorld),
        accent,
      };
    }
    if (annotation.type === "squareProfile") {
      const box = getSquareProfilePlaneBox(annotation);
      const points = getSquareProfileCorners(box).map((corner) => planeMmToCanvasPoint(geometry, corner.xMm, corner.yMm));
      return { text: "Square Profile", anchor: points[1], accent };
    }
    if (annotation.type === "brushRoi") {
      const centroid = getBrushMaskCentroid(annotation);
      const anchor = planeMmToCanvasPoint(geometry, centroid.xMm, centroid.yMm);
      return { text: getBrushLabel(annotation, reconstruction), anchor, accent };
    }
    if (annotation.type === "freehandRoi" && annotation.worldPoints.length) {
      const points = annotation.worldPoints.map((worldPoint) => projectWorldPointToCanvas(frame, geometry, worldPoint));
      const anchor = points.reduce((best, point) => (point.y < best.y ? point : best), points[0]);
      return { text: getFreehandLabel(annotation, reconstruction), anchor, accent };
    }
    return null;
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
      if (viewportState.ctx && isMultiDiameterAnnotationType(annotation.type)) {
        getDiameterLabelPlacements(viewportState.ctx, annotation, reconstruction, frame, geometry).forEach((placement) => {
          const insideLabel =
            planePoint.canvasX >= placement.bounds.x &&
            planePoint.canvasX <= placement.bounds.x + placement.bounds.width &&
            planePoint.canvasY >= placement.bounds.y &&
            planePoint.canvasY <= placement.bounds.y + placement.bounds.height;
          considerHit(insideLabel ? { annotation, mode: "label", priority: 0, distancePx: 0 } : null);
        });
      } else {
        const labelSpec = getAnnotationLabelSpec(annotation, reconstruction, frame, geometry);
        if (labelSpec && viewportState.ctx) {
          const bounds = getLabelChipBounds(
            viewportState.ctx,
            labelSpec.text,
            labelSpec.anchor.x,
            labelSpec.anchor.y,
            { annotation }
          );
          const insideLabel =
            planePoint.canvasX >= bounds.x &&
            planePoint.canvasX <= bounds.x + bounds.width &&
            planePoint.canvasY >= bounds.y &&
            planePoint.canvasY <= bounds.y + bounds.height;
          considerHit(
            insideLabel
              ? { annotation, mode: "label", priority: 0, distancePx: 0 }
              : null
          );
        }
      }

      if (annotation.type === "probe" || annotation.type === "text") {
        const point = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
        const pointDistancePx = Math.hypot(planePoint.canvasX - point.x, planePoint.canvasY - point.y);
        considerHit(
          pointDistancePx <= handleRadiusPx
            ? { annotation, mode: "move", priority: 0, distancePx: pointDistancePx }
            : null
        );
        return;
      }

      if (annotation.type === "length" || annotation.type === "arrow" || isLineProfileAnnotationType(annotation.type)) {
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

      if (isMultiDiameterAnnotationType(annotation.type)) {
        getDiameterAnnotationLines(annotation).forEach((line, lineIndex) => {
          if (!isDiameterLineVisible(annotation, line, frame)) {
            return;
          }
          const start = projectWorldPointToCanvas(frame, geometry, line.worldPoints[0]);
          const end = projectWorldPointToCanvas(frame, geometry, line.worldPoints[1]);
          const startDistancePx = Math.hypot(planePoint.canvasX - start.x, planePoint.canvasY - start.y);
          const endDistancePx = Math.hypot(planePoint.canvasX - end.x, planePoint.canvasY - end.y);
          considerHit(
            startDistancePx <= handleRadiusPx
              ? { annotation, mode: "diameterPoint", lineIndex, pointIndex: 0, priority: 0, distancePx: startDistancePx }
              : null
          );
          considerHit(
            endDistancePx <= handleRadiusPx
              ? { annotation, mode: "diameterPoint", lineIndex, pointIndex: 1, priority: 0, distancePx: endDistancePx }
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
        });
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
        const rotationHandle = planeMmToCanvasPoint(geometry, getSquareProfileRotationHandle(box).xMm, getSquareProfileRotationHandle(box).yMm);
        const handleDistancePx = Math.hypot(planePoint.canvasX - rotationHandle.x, planePoint.canvasY - rotationHandle.y);
        considerHit(
          handleDistancePx <= handleRadiusPx + 2
            ? { annotation, mode: "squareRotate", priority: 0, distancePx: handleDistancePx }
            : null
        );
        const insideBox = pointInPolygon({ x: planePoint.xMm, y: planePoint.yMm }, getSquareProfileCorners(box).map((corner) => ({ x: corner.xMm, y: corner.yMm })));
        considerHit(
          insideBox
            ? { annotation, mode: "move", priority: 2, distancePx: 0 }
            : null
        );
        return;
      }

      if (annotation.type === "brushRoi") {
        const insideMask = pointInBrushMask(annotation, planePoint.xMm, planePoint.yMm);
        considerHit(
          insideMask
            ? { annotation, mode: "move", priority: 2, distancePx: 0 }
            : null
        );
        return;
      }

      if (annotation.type === "freehandRoi") {
        const planePoints = getFreehandPlanePoints(annotation);
        if (isCircularRoiAnnotation(annotation)) {
          const handlePlanePoint = getCircularRoiHandlePlanePoint(annotation);
          if (handlePlanePoint) {
            const handleCanvasPoint = planeMmToCanvasPoint(geometry, handlePlanePoint.x, handlePlanePoint.y);
            const handleDistancePx = Math.hypot(
              planePoint.canvasX - handleCanvasPoint.x,
              planePoint.canvasY - handleCanvasPoint.y
            );
            considerHit(
              handleDistancePx <= handleRadiusPx + 2
                ? { annotation, mode: "circleRadius", priority: 0, distancePx: handleDistancePx }
                : null
            );
          }
        } else {
          getEditableRoiHandleIndices(annotation).forEach((pointIndex) => {
            const point = planePoints[pointIndex];
            const canvasPoint = planeMmToCanvasPoint(geometry, point.x, point.y);
            const distancePx = Math.hypot(planePoint.canvasX - canvasPoint.x, planePoint.canvasY - canvasPoint.y);
            considerHit(
              distancePx <= handleRadiusPx
                ? { annotation, mode: "roiVertex", pointIndex, priority: 0, distancePx }
                : null
            );
          });
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

  function drawSelectedAnnotationOverlay(ctx, annotation, reconstruction, frame, geometry, options = {}) {
    if (!annotation || !isAnnotationVisible(annotation, frame)) {
      return;
    }

    const handleRadiusPx = 5.5;
    const accent = getAnnotationAccentColor(annotation);
    ctx.save();
    ctx.strokeStyle = overlayStyle?.withAlpha?.(options.hover ? overlayStyle?.COLORS?.hover || accent : accent, options.hover ? 0.72 : 0.92) || "#ffffff";
    ctx.lineWidth = options.hover ? 1.6 : 2;
    ctx.setLineDash(options.hover ? [4, 5] : [6, 4]);

    if (annotation.type === "probe" || annotation.type === "text") {
      const point = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
      if (annotation.type === "text") {
        const bounds = getLabelChipBounds(ctx, annotation.text, point.x, point.y, { annotation });
        ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      }
      drawSelectionHandle(ctx, point, handleRadiusPx, accent);
      ctx.restore();
      return;
    }

    if (annotation.type === "length" || annotation.type === "arrow" || isLineProfileAnnotationType(annotation.type)) {
      const start = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
      const end = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[1]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      drawSelectionHandle(ctx, start, handleRadiusPx, accent);
      drawSelectionHandle(ctx, end, handleRadiusPx, accent);
      ctx.restore();
      return;
    }

    if (isMultiDiameterAnnotationType(annotation.type)) {
      getDiameterAnnotationLines(annotation).forEach((line) => {
        if (!isDiameterLineVisible(annotation, line, frame)) {
          return;
        }
        const start = projectWorldPointToCanvas(frame, geometry, line.worldPoints[0]);
        const end = projectWorldPointToCanvas(frame, geometry, line.worldPoints[1]);
        ctx.strokeStyle = overlayStyle?.withAlpha?.(line.color || accent, options.hover ? 0.72 : 0.92) || line.color || accent;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        drawSelectionHandle(ctx, start, handleRadiusPx, line.color || accent);
        drawSelectionHandle(ctx, end, handleRadiusPx, line.color || accent);
      });
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
      corners.forEach((point) => drawSelectionHandle(ctx, point, handleRadiusPx, accent));
      const rotationHandle = planeMmToCanvasPoint(geometry, getSquareProfileRotationHandle(box).xMm, getSquareProfileRotationHandle(box).yMm);
      ctx.beginPath();
      ctx.moveTo((corners[0].x + corners[1].x) / 2, (corners[0].y + corners[1].y) / 2);
      ctx.lineTo(rotationHandle.x, rotationHandle.y);
      ctx.stroke();
      drawSelectionHandle(ctx, rotationHandle, handleRadiusPx, accent);
      ctx.restore();
      return;
    }

    if (annotation.type === "brushRoi") {
      const bounds = getBrushMaskBounds(annotation);
      if (bounds) {
        const topLeft = planeMmToCanvasPoint(geometry, bounds.minX, bounds.minY);
        const bottomRight = planeMmToCanvasPoint(geometry, bounds.maxX, bounds.maxY);
        ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
      }
      const centroid = getBrushMaskCentroid(annotation);
      drawSelectionHandle(ctx, planeMmToCanvasPoint(geometry, centroid.xMm, centroid.yMm), handleRadiusPx, accent);
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
        const circleGeometry = getCircularRoiGeometry(annotation);
        const handlePlanePoint = getCircularRoiHandlePlanePoint(annotation);
        if (circleGeometry && handlePlanePoint) {
          const center = planeMmToCanvasPoint(geometry, circleGeometry.centerXmm, circleGeometry.centerYmm);
          const handle = planeMmToCanvasPoint(geometry, handlePlanePoint.x, handlePlanePoint.y);
          ctx.beginPath();
          ctx.moveTo(center.x, center.y);
          ctx.lineTo(handle.x, handle.y);
          ctx.stroke();
          drawSelectionHandle(ctx, handle, handleRadiusPx, accent);
        }
      } else {
        getEditableRoiHandleIndices(annotation).forEach((pointIndex) => {
          const point = points[pointIndex];
          if (point) {
            drawSelectionHandle(ctx, point, handleRadiusPx, accent);
          }
        });
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
    if (annotation.squareProfile) {
      const widthMm = Math.max(annotation.squareProfile.widthMm || 0, 0);
      const heightMm = Math.max(annotation.squareProfile.heightMm || 0, 0);
      const angleDegrees = normalizeAngleDegrees(annotation.squareProfile.angleDegrees || 0);
      return {
        centerXmm: annotation.squareProfile.centerXmm,
        centerYmm: annotation.squareProfile.centerYmm,
        widthMm,
        heightMm,
        angleDegrees,
        angleRadians: (angleDegrees * Math.PI) / 180,
        minX: annotation.squareProfile.centerXmm - widthMm / 2,
        maxX: annotation.squareProfile.centerXmm + widthMm / 2,
        minY: annotation.squareProfile.centerYmm - heightMm / 2,
        maxY: annotation.squareProfile.centerYmm + heightMm / 2,
      };
    }

    const first = worldToPlaneCoordinates(annotation.frame, annotation.worldPoints[0]);
    const second = worldToPlaneCoordinates(annotation.frame, annotation.worldPoints[1]);
    const centerXmm = (first.xMm + second.xMm) / 2;
    const centerYmm = (first.yMm + second.yMm) / 2;
    const widthMm = Math.abs(second.xMm - first.xMm);
    const heightMm = Math.abs(second.yMm - first.yMm);
    return {
      centerXmm,
      centerYmm,
      minX: Math.min(first.xMm, second.xMm),
      maxX: Math.max(first.xMm, second.xMm),
      minY: Math.min(first.yMm, second.yMm),
      maxY: Math.max(first.yMm, second.yMm),
      widthMm,
      heightMm,
      angleDegrees: 0,
      angleRadians: 0,
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
      const centeredPrimaryMm = primaryMm - primaryLengthMm / 2;
      const samples = [];

      for (let secondaryIndex = 0; secondaryIndex < secondaryCount; secondaryIndex += 1) {
        const secondaryMm = secondaryCount === 1
          ? 0
          : (secondaryIndex / (secondaryCount - 1)) * secondaryLengthMm - secondaryLengthMm / 2;
        const localPoint = horizontal
          ? { xMm: centeredPrimaryMm, yMm: secondaryMm }
          : { xMm: secondaryMm, yMm: centeredPrimaryMm };
        const rotatedPoint = rotatePlanePoint(localPoint, box.angleRadians);
        const world = planePointToWorld(
          annotation.frame,
          box.centerXmm + rotatedPoint.xMm,
          box.centerYmm + rotatedPoint.yMm
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

  function findProfileMaxIndex(values, startIndex, endIndex) {
    const start = clamp(Math.min(startIndex, endIndex), 0, Math.max(0, values.length - 1));
    const end = clamp(Math.max(startIndex, endIndex), 0, Math.max(0, values.length - 1));
    let bestIndex = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (let index = start; index <= end; index += 1) {
      const value = values[index];
      if (!Number.isFinite(value)) {
        continue;
      }
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function findProfileMinIndex(values, startIndex, endIndex) {
    const start = clamp(Math.min(startIndex, endIndex), 0, Math.max(0, values.length - 1));
    const end = clamp(Math.max(startIndex, endIndex), 0, Math.max(0, values.length - 1));
    let bestIndex = null;
    let bestValue = Number.POSITIVE_INFINITY;
    for (let index = start; index <= end; index += 1) {
      const value = values[index];
      if (!Number.isFinite(value)) {
        continue;
      }
      if (value < bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function averageProfileWindow(values, centerIndex, radius) {
    if (!Number.isInteger(centerIndex) || centerIndex < 0 || centerIndex >= values.length) {
      return null;
    }
    const start = Math.max(0, centerIndex - radius);
    const end = Math.min(values.length - 1, centerIndex + radius);
    return averageFinite(values.slice(start, end + 1));
  }

  function sanitizeVascularGuideIndices(length, preferred, fallback) {
    if (length < 3 || !fallback) {
      return null;
    }
    const source = preferred || fallback;
    const leftBackgroundIndex = clamp(
      Math.round(source.leftBackgroundIndex ?? fallback.leftBackgroundIndex ?? 0),
      0,
      Math.max(0, length - 3)
    );
    const peakIndex = clamp(
      Math.round(source.peakIndex ?? fallback.peakIndex ?? Math.round(length / 2)),
      leftBackgroundIndex + 1,
      Math.max(leftBackgroundIndex + 1, length - 2)
    );
    const rightBackgroundIndex = clamp(
      Math.round(source.rightBackgroundIndex ?? fallback.rightBackgroundIndex ?? length - 1),
      peakIndex + 1,
      length - 1
    );
    return {
      leftBackgroundIndex,
      peakIndex,
      rightBackgroundIndex,
    };
  }

  function findProfileThresholdCrossing(distancesMm, values, threshold, startIndex, endIndex) {
    if (!Number.isFinite(threshold) || !Array.isArray(values) || values.length < 2) {
      return null;
    }
    const start = clamp(Math.round(startIndex), 0, values.length - 1);
    const end = clamp(Math.round(endIndex), 0, values.length - 1);
    const direction = end >= start ? 1 : -1;
    let previousIndex = start;
    for (let index = start + direction; direction > 0 ? index <= end : index >= end; index += direction) {
      const left = values[previousIndex];
      const right = values[index];
      if (Number.isFinite(left) && Number.isFinite(right)) {
        const crosses = (left <= threshold && right >= threshold) || (left >= threshold && right <= threshold);
        if (crosses) {
          return {
            index: direction > 0 ? previousIndex : index,
            distanceMm: interpolateThresholdCrossing(
              distancesMm[previousIndex],
              left,
              distancesMm[index],
              right,
              threshold
            ),
          };
        }
      }
      previousIndex = index;
    }
    return null;
  }

  function buildVascularEdgeMetric(distancesMm, values, lowHu, peakHu, peakIndex, side, boundIndex) {
    const amplitudeHu = peakHu - lowHu;
    if (!Number.isFinite(amplitudeHu) || amplitudeHu <= 5) {
      return null;
    }
    const threshold10Hu = lowHu + amplitudeHu * 0.1;
    const threshold90Hu = lowHu + amplitudeHu * 0.9;
    const firstThreshold = side === "left" ? threshold10Hu : threshold90Hu;
    const secondThreshold = side === "left" ? threshold90Hu : threshold10Hu;
    const boundedIndex = clamp(boundIndex, 0, values.length - 1);
    const first = findProfileThresholdCrossing(
      distancesMm,
      values,
      firstThreshold,
      side === "left" ? boundedIndex : peakIndex,
      side === "left" ? peakIndex : boundedIndex
    );
    if (!first) {
      return null;
    }
    const second = findProfileThresholdCrossing(
      distancesMm,
      values,
      secondThreshold,
      first.index,
      side === "left" ? peakIndex : boundedIndex
    );
    if (!second) {
      return null;
    }
    const riseDistanceMm = Math.abs(second.distanceMm - first.distanceMm);
    if (!Number.isFinite(riseDistanceMm) || riseDistanceMm <= 0) {
      return null;
    }
    return {
      side,
      threshold10Hu,
      threshold90Hu,
      threshold10DistanceMm: side === "left" ? first.distanceMm : second.distanceMm,
      threshold90DistanceMm: side === "left" ? second.distanceMm : first.distanceMm,
      riseDistanceMm,
      slopeHuPerMm: (amplitudeHu * 0.8) / riseDistanceMm,
    };
  }

  function buildVascularLineProfileModel(base, guideAdjustments) {
    if (!base || base.mode !== "line" || !Array.isArray(base.valuesHu) || base.valuesHu.length < 5) {
      return null;
    }
    const smoothHu = smoothSeries(base.valuesHu, 1);
    const finiteValues = smoothHu.filter(Number.isFinite);
    if (finiteValues.length < 5) {
      return {
        smoothHu,
        vascular: null,
      };
    }
    const autoPeakIndex = findProfileMaxIndex(smoothHu, 0, smoothHu.length - 1);
    const autoLeftBackgroundIndex = autoPeakIndex == null
      ? 0
      : findProfileMinIndex(smoothHu, 0, Math.max(0, autoPeakIndex - 1)) ?? 0;
    const autoRightBackgroundIndex = autoPeakIndex == null
      ? smoothHu.length - 1
      : findProfileMinIndex(smoothHu, Math.min(smoothHu.length - 1, autoPeakIndex + 1), smoothHu.length - 1) ?? smoothHu.length - 1;
    const guideIndices = sanitizeVascularGuideIndices(
      smoothHu.length,
      guideAdjustments,
      {
        leftBackgroundIndex: autoLeftBackgroundIndex,
        peakIndex: autoPeakIndex ?? Math.round(smoothHu.length / 2),
        rightBackgroundIndex: autoRightBackgroundIndex,
      }
    );
    if (!guideIndices) {
      return {
        smoothHu,
        vascular: null,
      };
    }

    const peakIndex = guideIndices.peakIndex;
    const peakHu = peakIndex == null ? null : smoothHu[peakIndex];
    const edgeSampleCount = clamp(Math.round(smoothHu.length * 0.12), 2, Math.max(2, Math.floor(smoothHu.length / 3)));
    const averagingRadius = Math.max(1, Math.round(edgeSampleCount / 2));
    const leftBackgroundHu = averageProfileWindow(smoothHu, guideIndices.leftBackgroundIndex, averagingRadius);
    const rightBackgroundHu = averageProfileWindow(smoothHu, guideIndices.rightBackgroundIndex, averagingRadius);
    const backgroundHu = averageFinite([leftBackgroundHu, rightBackgroundHu]);
    const amplitudeHu = Number.isFinite(peakHu) && Number.isFinite(backgroundHu) ? peakHu - backgroundHu : null;
    if (!Number.isFinite(amplitudeHu) || amplitudeHu <= 5 || peakIndex == null) {
      return {
        smoothHu,
        vascular: null,
      };
    }

    const halfMaximumHu = backgroundHu + amplitudeHu * 0.5;
    const leftHalf = findProfileThresholdCrossing(
      base.distancesMm,
      smoothHu,
      halfMaximumHu,
      peakIndex,
      guideIndices.leftBackgroundIndex
    );
    const rightHalf = findProfileThresholdCrossing(
      base.distancesMm,
      smoothHu,
      halfMaximumHu,
      peakIndex,
      guideIndices.rightBackgroundIndex
    );
    const fwhmMm =
      leftHalf && rightHalf && Number.isFinite(leftHalf.distanceMm) && Number.isFinite(rightHalf.distanceMm)
        ? Math.abs(rightHalf.distanceMm - leftHalf.distanceMm)
        : null;
    const leftEdge = buildVascularEdgeMetric(
      base.distancesMm,
      smoothHu,
      backgroundHu,
      peakHu,
      peakIndex,
      "left",
      guideIndices.leftBackgroundIndex
    );
    const rightEdge = buildVascularEdgeMetric(
      base.distancesMm,
      smoothHu,
      backgroundHu,
      peakHu,
      peakIndex,
      "right",
      guideIndices.rightBackgroundIndex
    );
    const averageSlopeHuPerMm = averageFinite([leftEdge?.slopeHuPerMm, rightEdge?.slopeHuPerMm]);

    return {
      smoothHu,
      vascular: {
        peakIndex,
        peakDistanceMm: base.distancesMm[peakIndex],
        peakHu,
        leftBackgroundHu,
        rightBackgroundHu,
        backgroundHu,
        guideIndices,
        guideDistancesMm: {
          leftBackgroundMm: base.distancesMm[guideIndices.leftBackgroundIndex],
          peakMm: base.distancesMm[guideIndices.peakIndex],
          rightBackgroundMm: base.distancesMm[guideIndices.rightBackgroundIndex],
        },
        adjustmentMode: guideAdjustments ? "manual" : "auto",
        amplitudeHu,
        halfMaximumHu,
        fwhmMm,
        leftHalfDistanceMm: leftHalf?.distanceMm ?? null,
        rightHalfDistanceMm: rightHalf?.distanceMm ?? null,
        leftEdge,
        rightEdge,
        averageSlopeHuPerMm,
      },
    };
  }

  function buildProfileAnalysis(annotation, reconstruction) {
    const base =
      isLineProfileAnnotationType(annotation.type)
        ? sampleLineProfile(annotation, reconstruction)
        : annotation.type === "squareProfile"
          ? sampleSquareProfile(annotation, reconstruction)
          : null;
    if (!base) {
      return null;
    }
    base.profileFamily = getProfileFamily(annotation);
    base.profileSubtype = isPlaqueProfileAnnotation(annotation) ? getPlaqueProfileSubtype(annotation) : "";
    if (annotation.type === "vascularLineProfile") {
      const vascular = buildVascularLineProfileModel(base, annotation.vascularGuideAdjustments || null);
      return {
        ...base,
        smoothHu: vascular?.smoothHu || smoothSeries(base.valuesHu, 1),
        vascular: vascular?.vascular || null,
      };
    }
    return analyzeProfileSamples(
      base,
      STENT_INTERFACE_PROFILE_TYPES.has(annotation.type) ? annotation.profileGuideAdjustments || null : null,
      isPlaqueProfileAnnotation(annotation) ? annotation.plaqueGuideAdjustments || null : null
    );
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

    if (profile.profileFamily === "vascular_lumen_profile" && profile.vascular) {
      const vascular = profile.vascular;
      [
        { hu: vascular.backgroundHu, color: "rgba(145, 181, 201, 0.68)" },
        { hu: vascular.halfMaximumHu, color: "rgba(248, 245, 58, 0.82)" },
        { hu: vascular.peakHu, color: "rgba(246, 247, 249, 0.58)" },
      ]
        .filter((entry) => Number.isFinite(entry.hu))
        .forEach((guide) => {
          ctx.save();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = guide.color;
          ctx.lineWidth = 1.1;
          const y = yAt(guide.hu);
          ctx.beginPath();
          ctx.moveTo(plot.x, y);
          ctx.lineTo(plot.x + plot.width, y);
          ctx.stroke();
          ctx.restore();
        });

      if (Number.isFinite(vascular.leftHalfDistanceMm) && Number.isFinite(vascular.rightHalfDistanceMm)) {
        ctx.strokeStyle = "#f8f53a";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(xAt(vascular.leftHalfDistanceMm), yAt(vascular.halfMaximumHu));
        ctx.lineTo(xAt(vascular.rightHalfDistanceMm), yAt(vascular.halfMaximumHu));
        ctx.stroke();
      }

      [vascular.leftEdge, vascular.rightEdge].filter(Boolean).forEach((edge) => {
        ctx.save();
        ctx.strokeStyle = edge.side === "left" ? "#57c8ff" : "#66d9d0";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(xAt(edge.threshold10DistanceMm), yAt(edge.threshold10Hu));
        ctx.lineTo(xAt(edge.threshold90DistanceMm), yAt(edge.threshold90Hu));
        ctx.stroke();
        ctx.restore();
      });

      if (Number.isFinite(vascular.peakDistanceMm)) {
        ctx.save();
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = "rgba(246, 247, 249, 0.5)";
        ctx.lineWidth = 1.2;
        const x = xAt(vascular.peakDistanceMm);
        ctx.beginPath();
        ctx.moveTo(x, plot.y);
        ctx.lineTo(x, plot.y + plot.height);
        ctx.stroke();
        ctx.restore();
      }

      if (options?.showManualGuides !== false) {
        Object.entries(vascular.guideIndices || {}).forEach(([key, index]) => {
          const style = VASCULAR_PROFILE_GUIDE_STYLES[key];
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
            kind: "vascular",
            index,
            distanceMm,
            x,
            y: plot.y + 8,
            radiusPx: 8,
          });
        });
      }
    } else if (profile.profileFamily === "plaque_lumen_interface" && profile.plaque) {
      const plaque = profile.plaque;
      const primary = plaque.primaryInterface || null;
      const isNonCalcified = plaque.type === "non_calcified";
      const horizontalGuides = [
        { hu: plaque.lumenBaselineHu, color: "rgba(122, 244, 168, 0.82)", dashed: true },
        { hu: plaque.lumenHalfMaximumHu, color: "rgba(122, 244, 168, 0.48)", dashed: true },
        { hu: plaque.halfMaximumHu, color: isNonCalcified ? "rgba(102, 217, 208, 0.85)" : "rgba(255, 127, 110, 0.9)", dashed: true },
        { hu: plaque.plaqueHu ?? plaque.peakHu, color: "rgba(246, 247, 249, 0.68)", dashed: true },
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
        plaque.lumenLeftHalfDistanceMm,
        plaque.lumenRightHalfDistanceMm,
        plaque.lumenHalfMaximumHu,
        "#7af4a8",
        5
      );

      drawBar(
        plaque.plaqueLeftHalfDistanceMm,
        plaque.plaqueRightHalfDistanceMm,
        plaque.halfMaximumHu,
        isNonCalcified ? "#66d9d0" : "#ff7f6e",
        5
      );

      [plaque.leftInterface, plaque.rightInterface].filter(Boolean).forEach((edge) => {
        const primaryEdge = edge === primary;
        ctx.save();
        ctx.strokeStyle = primaryEdge ? "#f6f7f9" : "rgba(246, 247, 249, 0.42)";
        ctx.lineWidth = primaryEdge ? 2.6 : 1.5;
        ctx.setLineDash(primaryEdge ? [] : [5, 5]);
        ctx.beginPath();
        ctx.moveTo(xAt(edge.startThresholdDistanceMm), yAt(edge.startThresholdHu));
        ctx.lineTo(xAt(edge.endThresholdDistanceMm), yAt(edge.endThresholdHu));
        ctx.stroke();
        ctx.restore();
      });

      if (Number.isFinite(plaque.peakDistanceMm)) {
        ctx.save();
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = "rgba(255, 127, 110, 0.62)";
        ctx.lineWidth = 1.2;
        const x = xAt(plaque.peakDistanceMm);
        ctx.beginPath();
        ctx.moveTo(x, plot.y);
        ctx.lineTo(x, plot.y + plot.height);
        ctx.stroke();
        ctx.restore();
      }

      if (options?.showManualGuides !== false) {
        Object.entries(plaque.guideIndices || {}).forEach(([key, index]) => {
          const style = PLAQUE_PROFILE_GUIDE_STYLES[key];
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
            kind: "plaque",
            index,
            distanceMm,
            x,
            y: plot.y + 8,
            radiusPx: 8,
          });
        });
      }
    } else if (profile.stent) {
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
            kind: "stent",
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
          kind: handle.kind || "stent",
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

  function setPlaqueGuideAdjustment(annotation, guideKey, targetIndex, sampleCount, currentGuides) {
    const current = sanitizePlaqueGuideIndices(sampleCount, annotation.plaqueGuideAdjustments || currentGuides, currentGuides);
    if (!current) {
      return;
    }
    const next = { ...current };
    next[guideKey] = targetIndex;
    annotation.plaqueGuideAdjustments = sanitizePlaqueGuideIndices(sampleCount, next, current);
  }

  function setVascularGuideAdjustment(annotation, guideKey, targetIndex, sampleCount, currentGuides) {
    const current = sanitizeVascularGuideIndices(
      sampleCount,
      annotation.vascularGuideAdjustments || currentGuides,
      currentGuides
    );
    if (!current) {
      return;
    }
    const next = { ...current };
    next[guideKey] = targetIndex;
    annotation.vascularGuideAdjustments = sanitizeVascularGuideIndices(sampleCount, next, current);
  }

  function resetSelectedProfileAuto() {
    const annotation = getActiveProfileAnnotation();
    if (!annotation || !PROFILE_TYPES.has(annotation.type)) {
      throw new Error("Select a profile annotation first.");
    }
    delete annotation.profileGuideAdjustments;
    delete annotation.plaqueGuideAdjustments;
    delete annotation.vascularGuideAdjustments;
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
          <dd>Draw a vascular, stent, plaque, or square profile to see the curve and edge metrics here.</dd>
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

    const vascular = analysis.profileFamily === "vascular_lumen_profile" ? analysis.vascular || null : null;
    if (analysis.profileFamily === "vascular_lumen_profile") {
      const adjustmentMode = vascular?.adjustmentMode === "manual" ? "manual" : "auto";
      els.profileStatus.textContent = `${getAnnotationDisplayName(annotation, reconstruction)} • ${analysis.sampleCount} samples • vascular line profile • ${adjustmentMode}`;
      els.profileMetrics.innerHTML = `
        <div class="meta-row">
          <dt>Length</dt>
          <dd>${formatMetricValue(analysis.lengthMm, "mm", 2)}</dd>
        </div>
        <div class="meta-row">
          <dt>Guide Mode</dt>
          <dd>${adjustmentMode}</dd>
        </div>
        <div class="meta-row">
          <dt>FWHM Lumen</dt>
          <dd>${formatMetricValue(vascular?.fwhmMm, "mm", 3)}</dd>
        </div>
        <div class="meta-row">
          <dt>Left Edge</dt>
          <dd>10-90 ${formatMetricValue(vascular?.leftEdge?.riseDistanceMm, "mm", 3)} | ${formatMetricValue(vascular?.leftEdge?.slopeHuPerMm, "HU/mm", 1)}</dd>
        </div>
        <div class="meta-row">
          <dt>Right Edge</dt>
          <dd>10-90 ${formatMetricValue(vascular?.rightEdge?.riseDistanceMm, "mm", 3)} | ${formatMetricValue(vascular?.rightEdge?.slopeHuPerMm, "HU/mm", 1)}</dd>
        </div>
        <div class="meta-row">
          <dt>Average Sharpness</dt>
          <dd>${formatMetricValue(vascular?.averageSlopeHuPerMm, "HU/mm", 1)}</dd>
        </div>
        <div class="meta-row">
          <dt>Peak / Background</dt>
          <dd>${formatMetricValue(vascular?.peakHu, "HU", 0)} / ${formatMetricValue(vascular?.backgroundHu, "HU", 0)}</dd>
        </div>
      `;
      drawProfileChart(analysis);
      return;
    }

    const plaque = analysis.profileFamily === "plaque_lumen_interface" ? analysis.plaque || null : null;
    if (plaque) {
      const primary = plaque.primaryInterface || null;
      const subtypeLabel = plaque.type === "non_calcified" ? "non-calcified" : "calcified";
      const interfaceWidthLabel = plaque.type === "non_calcified" ? "90-10" : "10-90";
      const plaqueFwhmLabel = plaque.type === "non_calcified" ? "Plaque FWHMmin" : "Plaque FWHM";
      const plaqueFwhmNote = plaque.plaqueFwhmEstimated ? " (to right guide)" : "";
      els.profileStatus.textContent = `${getAnnotationDisplayName(annotation, reconstruction)} • ${analysis.sampleCount} samples • plaque-lumen ${subtypeLabel} • ${plaque.adjustmentMode || "auto"}`;
      els.profileMetrics.innerHTML = `
        <div class="meta-row">
          <dt>Length</dt>
          <dd>${formatMetricValue(analysis.lengthMm, "mm", 2)}</dd>
        </div>
        <div class="meta-row">
          <dt>Family</dt>
          <dd>Plaque-lumen interface • ${subtypeLabel} • ${plaque.adjustmentMode || "auto"}</dd>
        </div>
        <div class="meta-row">
          <dt>${plaque.type === "non_calcified" ? "Plaque Low" : "Plaque Peak"}</dt>
          <dd>${formatMetricValue(plaque.plaqueHu ?? plaque.peakHu, "HU", 0)} at ${formatMetricValue(plaque.peakDistanceMm, "mm", 2)}</dd>
        </div>
        <div class="meta-row">
          <dt>Lumen Baseline</dt>
          <dd>${formatMetricValue(plaque.lumenBaselineHu, "HU", 0)} | Delta ${formatMetricValue(plaque.plaqueDeltaHu ?? plaque.amplitudeHu, "HU", 0)}</dd>
        </div>
        <div class="meta-row">
          <dt>FWHM Lumen</dt>
          <dd>${formatMetricValue(plaque.lumenFwhmMm, "mm", 3)} at ${formatMetricValue(plaque.lumenHalfMaximumHu, "HU", 0)}</dd>
        </div>
        <div class="meta-row">
          <dt>${plaqueFwhmLabel}</dt>
          <dd>${formatMetricValue(plaque.plaqueFwhmMm, "mm", 3)}${plaqueFwhmNote} at ${formatMetricValue(plaque.halfMinimumHu ?? plaque.halfMaximumHu, "HU", 0)}</dd>
        </div>
        <div class="meta-row">
          <dt>Primary Interface</dt>
          <dd>${primary?.label || "-"} | ${interfaceWidthLabel} ${formatMetricValue(primary?.riseDistanceMm, "mm", 3)} | ${formatMetricValue(primary?.slopeHuPerMm, "HU/mm", 1)}</dd>
        </div>
        <div class="meta-row">
          <dt>Normalized Sharpness</dt>
          <dd>${formatMetricValue(primary?.normalizedSlopePercentPerMm, "%/mm", 1)} relative slope | Peak ${formatMetricValue(primary?.normalizedPeakGradientPercentPerMm, "%/mm", 1)}</dd>
        </div>
        <div class="meta-row">
          <dt>Blooming Balance</dt>
          <dd>Plaque/Lumen FWHM ${formatMetricValue(plaque.plaqueToLumenFwhmRatio, "", 3)} | Edge/Lumen ${formatMetricValue(plaque.edgeWidthToLumenFwhmRatio, "", 3)}</dd>
        </div>
        <div class="meta-row">
          <dt>Edge Spread</dt>
          <dd>Derivative FWHM ${formatMetricValue(primary?.edgeFwhmMm, "mm", 3)} | Max gradient ${formatMetricValue(primary?.peakGradientHuPerMm, "HU/mm", 1)}</dd>
        </div>
        <div class="meta-row">
          <dt>Kurtosis</dt>
          <dd>${formatMetricValue(primary?.kurtosis, "", 2)}</dd>
        </div>
      `;
      drawProfileChart(analysis);
      return;
    }

    const stent = analysis.stent || null;
    const adjustmentMode = stent?.adjustmentMode === "manual" ? "manual" : "auto";
    els.profileStatus.textContent = `${getAnnotationDisplayName(annotation, reconstruction)} • ${analysis.sampleCount} samples${stent ? ` • ${adjustmentMode}` : " • no stent model found"}`;
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
    if (isMultiDiameterAnnotationType(annotation.type)) {
      return getDiameterMeasurementSummary(annotation);
    }
    if (PROFILE_TYPES.has(annotation.type)) {
      const analysis = buildProfileAnalysis(annotation, reconstruction);
      if (analysis?.profileFamily === "vascular_lumen_profile") {
        const vascular = analysis.vascular || null;
        return {
          profileFamily: "vascular_lumen_profile",
          profileLengthMm: analysis?.lengthMm,
          profileAxis: analysis?.axis,
          sampleCount: analysis?.sampleCount,
          profileAdjustmentMode: vascular?.adjustmentMode || "auto",
          vascularPeakHu: vascular?.peakHu,
          vascularBackgroundHu: vascular?.backgroundHu,
          vascularAmplitudeHu: vascular?.amplitudeHu,
          vascularFwhmMm: vascular?.fwhmMm,
          vascularHalfMaximumHu: vascular?.halfMaximumHu,
          vascularLeftRise10To90Mm: vascular?.leftEdge?.riseDistanceMm,
          vascularLeftSlopeHuPerMm: vascular?.leftEdge?.slopeHuPerMm,
          vascularRightRise10To90Mm: vascular?.rightEdge?.riseDistanceMm,
          vascularRightSlopeHuPerMm: vascular?.rightEdge?.slopeHuPerMm,
          vascularAverageSlopeHuPerMm: vascular?.averageSlopeHuPerMm,
        };
      }
      const plaque = analysis?.profileFamily === "plaque_lumen_interface" ? analysis?.plaque || null : null;
      if (plaque) {
        const primary = plaque.primaryInterface || null;
        return {
          profileFamily: "plaque_lumen_interface",
          plaqueType: plaque.type || "calcified",
          profileLengthMm: analysis?.lengthMm,
          profileWidthMm: analysis?.widthMm,
          profileAxis: analysis?.axis,
          sampleCount: analysis?.sampleCount,
          profileAdjustmentMode: plaque.adjustmentMode || "auto",
          plaquePeakHu: plaque.peakHu,
          plaqueHu: plaque.plaqueHu,
          plaqueLumenBaselineHu: plaque.lumenBaselineHu,
          plaqueAmplitudeHu: plaque.amplitudeHu,
          plaqueDeltaHu: plaque.plaqueDeltaHu,
          plaqueFwhmMm: plaque.plaqueFwhmMm,
          plaqueFwhmKind: plaque.plaqueFwhmKind || "",
          plaqueFwhmEstimated: plaque.plaqueFwhmEstimated === true,
          plaqueHalfMaximumHu: plaque.halfMaximumHu,
          plaqueHalfMinimumHu: plaque.halfMinimumHu,
          plaqueLumenFwhmMm: plaque.lumenFwhmMm,
          plaqueLumenHalfMaximumHu: plaque.lumenHalfMaximumHu,
          plaqueLumenLeftHalfDistanceMm: plaque.lumenLeftHalfDistanceMm,
          plaqueLumenRightHalfDistanceMm: plaque.lumenRightHalfDistanceMm,
          plaqueInterfaceSide: primary?.side || "",
          plaqueInterfaceDirection: plaque.type === "non_calcified" ? "90_to_10_fall" : "10_to_90_rise",
          plaqueInterfaceWidthMm: primary?.riseDistanceMm,
          plaqueInterfaceRise10To90Mm: primary?.riseDistanceMm,
          plaqueInterfaceSlopeHuPerMm: primary?.slopeHuPerMm,
          plaqueInterfaceNormalizedSlopePerMm: primary?.normalizedSlopePerMm,
          plaqueInterfaceNormalizedSlopePercentPerMm: primary?.normalizedSlopePercentPerMm,
          plaqueInterfaceEdgeFwhmMm: primary?.edgeFwhmMm,
          plaqueInterfacePeakGradientHuPerMm: primary?.peakGradientHuPerMm,
          plaqueInterfaceNormalizedPeakGradientPerMm: primary?.normalizedPeakGradientPerMm,
          plaqueInterfaceNormalizedPeakGradientPercentPerMm: primary?.normalizedPeakGradientPercentPerMm,
          plaqueInterfaceKurtosis: primary?.kurtosis,
          plaqueFwhmToLumenFwhmRatio: plaque.plaqueToLumenFwhmRatio,
          plaqueEdgeWidthToLumenFwhmRatio: plaque.edgeWidthToLumenFwhmRatio,
          plaqueEdgeFwhmToLumenFwhmRatio: plaque.edgeFwhmToLumenFwhmRatio,
          plaqueLeftRise10To90Mm: plaque.leftInterface?.riseDistanceMm,
          plaqueLeftSlopeHuPerMm: plaque.leftInterface?.slopeHuPerMm,
          plaqueLeftEdgeFwhmMm: plaque.leftInterface?.edgeFwhmMm,
          plaqueRightRise10To90Mm: plaque.rightInterface?.riseDistanceMm,
          plaqueRightSlopeHuPerMm: plaque.rightInterface?.slopeHuPerMm,
          plaqueRightEdgeFwhmMm: plaque.rightInterface?.edgeFwhmMm,
        };
      }
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
        profileFamily: "stent_lumen_interface",
        plaqueType: "",
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
      return "Stent-Lumen Line Profile";
    }
    if (type === "squareProfile") {
      return "Stent-Lumen Square Profile";
    }
    if (type === "plaqueLineProfile") {
      return "Plaque-Lumen Interface (Calcified)";
    }
    if (type === "plaqueNoncalcifiedLineProfile") {
      return "Plaque-Lumen Interface (Non-calcified)";
    }
    if (type === "vascularLineProfile") {
      return "Vascular Line Profile";
    }
    if (type === "bloomingDiameter") {
      return "Blooming Diameter";
    }
    if (type === "stenosisDiameter") {
      return "Stenosis Diameter";
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

  function drawDiameterAnnotation(ctx, annotation, reconstruction, frame, geometry, options = {}) {
    const lines = getDiameterAnnotationLines(annotation).filter((line) => isDiameterLineVisible(annotation, line, frame));
    if (!lines.length) {
      return;
    }

    ctx.save();
    lines.forEach((line) => {
      const start = projectWorldPointToCanvas(frame, geometry, line.worldPoints[0]);
      const end = projectWorldPointToCanvas(frame, geometry, line.worldPoints[1]);
      const color = line.color || getAnnotationAccentColor(annotation);
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
      ctx.lineWidth = options.preview ? 6 : 5;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = options.preview ? 2.8 : 2.5;
      ctx.setLineDash(options.preview ? [7, 5] : []);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    ctx.restore();

    getDiameterLabelPlacements(ctx, annotation, reconstruction, frame, geometry, options).forEach((placement) => {
      drawLabelChip(ctx, placement.text, placement.anchor.x, placement.anchor.y, placement.color, {
        annotation,
        selected: Boolean(annotation.id && annotation.id === state.selectedAnnotationId),
        offsetX: placement.offsetX,
        offsetY: placement.offsetY,
      });
    });
  }

  function drawDiameterDraftPreview(ctx, draft, frame, geometry) {
    if (!draft || draft.plane !== frame.plane) {
      return;
    }
    const liveLine =
      state.dragging?.type === "diameterLine" &&
      state.dragging.toolKey === draft.toolKey &&
      state.dragging.worldPoints?.length === 2
        ? {
            ...getDiameterDraftRole(draft.toolKey, draft.lines.length),
            frame: state.dragging.frame ? cloneFrame(state.dragging.frame) : cloneFrame(frame),
            plane: state.dragging.plane || frame.plane,
            viewContext: state.dragging.viewContext ? cloneAnnotationViewContext(state.dragging.viewContext) : null,
            worldPoints: state.dragging.worldPoints,
          }
        : null;
    const lines = liveLine ? [...draft.lines, liveLine] : draft.lines;
    if (!lines.length) {
      return;
    }
    const previewAnnotation = {
      id: null,
      type: draft.toolKey,
      plane: draft.plane,
      frame: draft.frame,
      viewContext: draft.viewContext,
      diameterLines: lines,
      worldPoints: lines.flatMap((line) => line.worldPoints || []),
    };
    if (!isAnnotationVisible(previewAnnotation, frame)) {
      return;
    }
    drawDiameterAnnotation(ctx, previewAnnotation, null, frame, geometry, { preview: true });
  }

  function drawAnnotation(ctx, annotation, reconstruction, frame, geometry) {
    if (!isAnnotationVisible(annotation, frame)) {
      return;
    }
    const accent = getAnnotationAccentColor(annotation);
    const labelOptions = {
      annotation,
      selected: annotation.id === state.selectedAnnotationId,
    };

    if (annotation.type === "text") {
      const label = getAnnotationLabelSpec(annotation, reconstruction, frame, geometry);
      drawLabelChip(ctx, label.text, label.anchor.x, label.anchor.y, accent, labelOptions);
      return;
    }

    if (annotation.type === "probe") {
      const point = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
      ctx.save();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.66)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(point.x - 8, point.y);
      ctx.lineTo(point.x + 8, point.y);
      ctx.moveTo(point.x, point.y - 8);
      ctx.lineTo(point.x, point.y + 8);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      const label = getAnnotationLabelSpec(annotation, reconstruction, frame, geometry);
      drawLabelChip(ctx, label.text, label.anchor.x, label.anchor.y, accent, labelOptions);
      return;
    }

    if (annotation.type === "length") {
      const start = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
      const end = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[1]);
      if (overlayStyle?.drawLine) {
        overlayStyle.drawLine(ctx, start, end, accent);
      } else {
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.restore();
      }
      const label = getAnnotationLabelSpec(annotation, reconstruction, frame, geometry);
      drawLabelChip(ctx, label.text, label.anchor.x, label.anchor.y, accent, labelOptions);
      return;
    }

    if (isLineProfileAnnotationType(annotation.type)) {
      const start = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
      const end = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[1]);
      if (overlayStyle?.drawLine) {
        overlayStyle.drawLine(ctx, start, end, accent);
      } else {
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.restore();
      }
      const label = getAnnotationLabelSpec(annotation, reconstruction, frame, geometry);
      drawLabelChip(ctx, label.text, label.anchor.x, label.anchor.y, accent, labelOptions);
      return;
    }

    if (annotation.type === "squareProfile") {
      const box = getSquareProfilePlaneBox(annotation);
      const points = getSquareProfileCorners(box).map((corner) => planeMmToCanvasPoint(geometry, corner.xMm, corner.yMm));
      drawPolygonShape(ctx, points, accent, overlayStyle?.withAlpha?.(accent, 0.11) || "rgba(156, 240, 107, 0.10)");
      const label = getAnnotationLabelSpec(annotation, reconstruction, frame, geometry);
      drawLabelChip(ctx, label.text, label.anchor.x, label.anchor.y, accent, labelOptions);
      return;
    }

    if (isMultiDiameterAnnotationType(annotation.type)) {
      drawDiameterAnnotation(ctx, annotation, reconstruction, frame, geometry);
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
      const label = getAnnotationLabelSpec(annotation, reconstruction, frame, geometry);
      drawLabelChip(ctx, label.text, label.anchor.x, label.anchor.y, accent, labelOptions);
      return;
    }

    if (annotation.type === "freehandRoi") {
      const points = annotation.worldPoints.map((worldPoint) => projectWorldPointToCanvas(frame, geometry, worldPoint));
      drawPolygonShape(ctx, points, accent, overlayStyle?.withAlpha?.(accent, 0.12) || "rgba(87, 200, 255, 0.12)");
      const label = getAnnotationLabelSpec(annotation, reconstruction, frame, geometry);
      drawLabelChip(ctx, label.text, label.anchor.x, label.anchor.y, accent, labelOptions);
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
    renderPlanePixelsToCanvas(bufferCanvas, reconstruction, frame, options?.voi);
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
        const selectedAnnotation = reconstruction.annotations.find((annotation) => annotation.id === state.selectedAnnotationId);
        const hoveredAnnotation = reconstruction.annotations.find((annotation) => annotation.id === state.hoveredAnnotationId);
        if (hoveredAnnotation && hoveredAnnotation.id !== selectedAnnotation?.id) {
          drawSelectedAnnotationOverlay(ctx, hoveredAnnotation, reconstruction, frame, geometry, { hover: true });
        }
        if (selectedAnnotation) {
          drawSelectedAnnotationOverlay(ctx, selectedAnnotation, reconstruction, frame, geometry);
        }
      }
      if (state.polygonDraft && state.polygonDraft.reconstructionId === reconstruction.id) {
        drawFreehandPreview(ctx, state.polygonDraft, frame, geometry);
      }
      if (state.diameterDraft && state.diameterDraft.reconstructionId === reconstruction.id) {
        drawDiameterDraftPreview(ctx, state.diameterDraft, frame, geometry);
      }
      drawContourCorrectionPreview(ctx, frame, geometry);
      drawEraserPreview(ctx, frame, geometry);
      if (options?.previewAnnotation) {
        drawAnnotation(ctx, options.previewAnnotation, reconstruction, frame, geometry);
      }
    }
  }

  function getViewportFrame(viewportId, reconstruction) {
    if (viewportId === "presentation" && state.layout !== "mpr") {
      return getCanonicalPlaneFrame(getViewportPlane(viewportId), reconstruction);
    }
    return getCurrentPlaneFrame(getViewportPlane(viewportId), reconstruction);
  }

  function getViewportIdsForPlane(plane) {
    return VIEWPORT_IDS.filter((viewportId) => getViewportPlane(viewportId) === plane);
  }

  function canSyncComparisonCenter(sourceReconstruction, targetReconstruction) {
    const sourceVolume = sourceReconstruction?.volume;
    const targetVolume = targetReconstruction?.volume;
    if (!sourceVolume || !targetVolume) {
      return false;
    }
    return (
      Math.abs(dot(sourceVolume.rowDirection, targetVolume.rowDirection)) > 0.98 &&
      Math.abs(dot(sourceVolume.columnDirection, targetVolume.columnDirection)) > 0.98 &&
      Math.abs(dot(sourceVolume.normalDirection, targetVolume.normalDirection)) > 0.98
    );
  }

  function syncComparisonTilesFromActiveTile(options = {}) {
    if (!state.comparison.syncEnabled || !isComparisonActive()) {
      return;
    }
    const sourceTile = getActiveComparisonTile();
    const sourceReconstruction = getReconstructionById(sourceTile?.reconstructionId);
    if (!sourceTile || !sourceReconstruction) {
      return;
    }

    let warned = false;
    getVisibleComparisonTiles().forEach((tile) => {
      if (tile.id === sourceTile.id || !tile.reconstructionId) {
        return;
      }
      const reconstruction = getReconstructionById(tile.reconstructionId);
      if (!reconstruction) {
        return;
      }
      if (options.center) {
        if (canSyncComparisonCenter(sourceReconstruction, reconstruction)) {
          tile.centerWorld = cloneVector(sourceTile.centerWorld || sourceReconstruction.volume.centerWorld);
        } else if (!warned) {
          warned = true;
          setStatus("Comparison sync skipped one tile because its geometry could not be mapped safely.", "warning");
        }
      }
      if (options.voi) {
        tile.voi = cloneVoi(sourceTile.voi);
      }
      if (options.transform) {
        VIEWPORT_IDS.forEach((viewportId) => {
          const sourceViewport = sourceTile.viewports[viewportId];
          const targetViewport = tile.viewports[viewportId];
          targetViewport.zoom = sourceViewport.zoom;
          targetViewport.panX = sourceViewport.panX;
          targetViewport.panY = sourceViewport.panY;
        });
      }
    });
  }

  function setActiveComparisonTile(tileId) {
    const tile = getComparisonTile(tileId);
    if (!tile) {
      return;
    }
    state.comparison.activeTileId = tile.id;
    const reconstruction = getReconstructionById(tile.reconstructionId);
    if (reconstruction) {
      state.activeReconId = reconstruction.id;
      state.mpr.centerWorld = cloneVector(tile.centerWorld || reconstruction.volume.centerWorld);
      state.currentVOI = cloneVoi(tile.voi);
      updateVoiUi();
      updateSidebarUi();
    } else {
      updateComparisonUi();
    }
    updateComparisonUi();
    updateComparisonTileActiveClasses();
    requestRenderAll();
  }

  function setComparisonTileCenter(tile, nextCenterWorld, options = {}) {
    if (!tile || !Array.isArray(nextCenterWorld)) {
      return;
    }
    tile.centerWorld = cloneVector(nextCenterWorld);
    if (tile.id === state.comparison.activeTileId) {
      state.mpr.centerWorld = cloneVector(tile.centerWorld);
    }
    if (options.sync !== false) {
      syncComparisonTilesFromActiveTile({ center: true });
    }
  }

  function setComparisonTileVoi(tile, voi, options = {}) {
    if (!tile) {
      return;
    }
    tile.voi = cloneVoi(voi);
    if (tile.id === state.comparison.activeTileId) {
      state.currentVOI = cloneVoi(tile.voi);
      updateVoiUi();
    }
    if (options.sync !== false) {
      syncComparisonTilesFromActiveTile({ voi: true });
    }
  }

  function setComparisonViewportTransform(tile, viewportId, transform, options = {}) {
    const viewportState = tile?.viewports?.[viewportId];
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
    if (options.sync !== false) {
      syncComparisonTilesFromActiveTile({ transform: true });
    }
  }

  function getComparisonFrame(tile, viewportId) {
    const reconstruction = getReconstructionById(tile?.reconstructionId);
    if (!reconstruction) {
      return null;
    }
    const plane = getViewportPlane(viewportId);
    return getCanonicalPlaneFrameAtCenter(plane, reconstruction, tile.centerWorld || reconstruction.volume.centerWorld);
  }

  function getComparisonReadout(tile, viewportId) {
    const reconstruction = getReconstructionById(tile?.reconstructionId);
    const frame = getComparisonFrame(tile, viewportId);
    if (!reconstruction || !frame) {
      return viewportId === "presentation" ? "0 / 0" : `${VIEWPORT_CONFIG[viewportId].readoutLabel} -`;
    }
    const index = getReadoutIndexAtCenter(reconstruction, frame.plane, frame.centerWorld);
    if (viewportId === "presentation") {
      return `${index + 1} / ${frame.metrics.count}`;
    }
    return `${VIEWPORT_CONFIG[viewportId].readoutLabel} ${index + 1} / ${frame.metrics.count}`;
  }

  function ensureComparisonCanvasSize(viewportState) {
    const canvas = viewportState?.canvas;
    if (!canvas) {
      return { width: 1, height: 1 };
    }
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
    return { width: logicalWidth, height: logicalHeight };
  }

  function renderComparisonViewport(tile, viewportId) {
    const reconstruction = getReconstructionById(tile?.reconstructionId);
    const viewportState = tile?.viewports?.[viewportId];
    if (!viewportState?.ctx) {
      return;
    }
    const size = ensureComparisonCanvasSize(viewportState);
    const frame = getComparisonFrame(tile, viewportId);
    if (!reconstruction || !frame) {
      viewportState.ctx.clearRect(0, 0, size.width, size.height);
      viewportState.ctx.fillStyle = "#000000";
      viewportState.ctx.fillRect(0, 0, size.width, size.height);
      return;
    }
    drawPlaneScene(viewportState.ctx, reconstruction, frame, size.width, size.height, viewportState, {
      includeAnnotations: true,
      voi: tile.voi,
      previewAnnotation: state.dragging?.type === "annotation" &&
        state.dragging.comparisonTileId === tile.id &&
        state.dragging.viewportId === viewportId
          ? state.dragging.annotation
          : null,
    });
  }

  function getInternalReconstructionDragId(dataTransfer) {
    return (
      dataTransfer?.getData?.("application/x-hagrad-reconstruction-id") ||
      dataTransfer?.getData?.("text/plain") ||
      ""
    );
  }

  function hasInternalReconstructionDrag(dataTransfer) {
    const types = Array.from(dataTransfer?.types || []);
    if (types.includes("application/x-hagrad-reconstruction-id")) {
      return true;
    }
    return Boolean(getReconstructionById(getInternalReconstructionDragId(dataTransfer)));
  }

  function handleComparisonTileDragEnter(event) {
    if (!hasInternalReconstructionDrag(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.currentTarget.classList.add("is-drop-target");
  }

  function handleComparisonTileDragOver(event) {
    if (!hasInternalReconstructionDrag(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    event.currentTarget.classList.add("is-drop-target");
  }

  function handleComparisonTileDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      event.currentTarget.classList.remove("is-drop-target");
    }
  }

  function handleComparisonTileDrop(event) {
    const tileId = event.currentTarget.dataset.comparisonTileId;
    const reconstructionId = getInternalReconstructionDragId(event.dataTransfer);
    if (!tileId || !reconstructionId || !getReconstructionById(reconstructionId)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove("is-drop-target");
    assignComparisonTileReconstruction(tileId, reconstructionId);
  }

  function scrollComparisonTile(tile, viewportId, delta) {
    const reconstruction = getReconstructionById(tile?.reconstructionId);
    const frame = getComparisonFrame(tile, viewportId);
    if (!tile || !reconstruction || !frame) {
      return;
    }
    const currentIndex = getReadoutIndexAtCenter(reconstruction, frame.plane, frame.centerWorld);
    setComparisonTilePlaneIndex(tile, viewportId, currentIndex + delta);
  }

  function setComparisonTilePlaneIndex(tile, viewportId, targetIndex) {
    const reconstruction = getReconstructionById(tile?.reconstructionId);
    const frame = getComparisonFrame(tile, viewportId);
    if (!tile || !reconstruction || !frame) {
      return;
    }
    const metrics = frame.metrics;
    const currentIndex = getReadoutIndexAtCenter(reconstruction, frame.plane, frame.centerWorld);
    const clampedIndex = clamp(Math.round(Number(targetIndex) || 0), 0, Math.max(0, metrics.count - 1));
    const delta = clampedIndex - currentIndex;
    if (!delta) {
      return;
    }
    stopCine();
    const startCenterWorld = tile.centerWorld || frame.centerWorld || reconstruction.volume.centerWorld;
    const nextCenterWorld = addVectors(startCenterWorld, scaleVector(frame.nWorld, delta * metrics.spacingNormal));
    setComparisonTileCenter(tile, nextCenterWorld);
    state.polygonDraft = null;
    if (state.diameterDraft?.toolKey !== "stenosisDiameter") {
      state.diameterDraft = null;
    }
    requestRenderAll();
  }

  function zoomComparisonViewportAtClientPoint(tile, viewportId, clientX, clientY, nextZoom) {
    const viewportState = tile?.viewports?.[viewportId];
    const geometry = viewportState?.lastGeometry;
    const canvas = viewportState?.canvas;
    if (!tile || !viewportState || !canvas) {
      return false;
    }
    const currentZoom = Number(viewportState.zoom) || 1;
    const clampedZoom = clamp(nextZoom, 0.2, 12);
    if (Math.abs(clampedZoom - currentZoom) < 0.0001) {
      return false;
    }
    if (!geometry) {
      setComparisonViewportTransform(tile, viewportId, { zoom: clampedZoom });
      return true;
    }
    const rect = canvas.getBoundingClientRect();
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;
    const centerX = geometry.originX + geometry.drawWidth / 2;
    const centerY = geometry.originY + geometry.drawHeight / 2;
    const zoomFactor = clampedZoom / currentZoom;
    setComparisonViewportTransform(tile, viewportId, {
      zoom: clampedZoom,
      panX: viewportState.panX + (canvasX - centerX) * (1 - zoomFactor),
      panY: viewportState.panY + (canvasY - centerY) * (1 - zoomFactor),
    });
    return true;
  }

  function handleComparisonWheel(event) {
    const tile = getComparisonTile(event.currentTarget.dataset.comparisonTileId);
    const viewportId = event.currentTarget.dataset.comparisonViewportId || "presentation";
    if (!tile) {
      return;
    }
    event.preventDefault();
    setActiveComparisonTile(tile.id);
    if (event.metaKey || event.ctrlKey) {
      const viewportState = tile.viewports[viewportId];
      const currentZoom = Number(viewportState?.zoom) || 1;
      if (zoomComparisonViewportAtClientPoint(tile, viewportId, event.clientX, event.clientY, currentZoom * Math.exp(-event.deltaY * 0.0015))) {
        requestRenderAll();
      }
      return;
    }
    scrollComparisonTile(tile, viewportId, event.deltaY > 0 ? 1 : -1);
  }

  function handleComparisonFastScrollInput(event) {
    const tile = getComparisonTile(event.currentTarget.dataset.comparisonScrollTileId);
    const viewportId = event.currentTarget.dataset.comparisonScrollViewportId || "presentation";
    if (!tile) {
      return;
    }
    event.stopPropagation();
    setActiveComparisonTile(tile.id);
    setComparisonTilePlaneIndex(tile, viewportId, event.currentTarget.value);
  }

  function handleComparisonPointerDown(event) {
    const tile = getComparisonTile(event.currentTarget.dataset.comparisonTileId);
    const viewportId = event.currentTarget.dataset.comparisonViewportId || "presentation";
    if (!tile?.viewports?.[viewportId]) {
      return;
    }
    setActiveComparisonTile(tile.id);
    withComparisonViewportOverride(tile, viewportId, () => handleViewportPointerDown(event));
    tagComparisonDragging(tile, event.currentTarget);
  }

  function handleComparisonClick(event) {
    const tile = getComparisonTile(event.currentTarget.dataset.comparisonTileId);
    const viewportId = event.currentTarget.dataset.comparisonViewportId || "presentation";
    if (!tile?.viewports?.[viewportId]) {
      return;
    }
    setActiveComparisonTile(tile.id);
    withComparisonViewportOverride(tile, viewportId, () => handleViewportClick(event));
  }

  function handleComparisonDoubleClick(event) {
    const tile = getComparisonTile(event.currentTarget.dataset.comparisonTileId);
    const viewportId = event.currentTarget.dataset.comparisonViewportId || "presentation";
    if (!tile?.viewports?.[viewportId]) {
      return;
    }
    setActiveComparisonTile(tile.id);
    withComparisonViewportOverride(tile, viewportId, () => handleViewportDoubleClick(event));
  }

  function handleComparisonDragMove(event) {
    const dragging = state.dragging;
    const tile = getComparisonTile(dragging.tileId);
    const viewportId = dragging.viewportId || "presentation";
    const viewportState = tile?.viewports?.[viewportId];
    if (!tile || !viewportState) {
      return false;
    }
    if (dragging.type === "comparisonWindowLevel") {
      const deltaX = event.clientX - dragging.startClientX;
      const deltaY = event.clientY - dragging.startClientY;
      setComparisonTileVoi(tile, {
        width: dragging.startVOI.width + deltaX * 4,
        center: dragging.startVOI.center - deltaY * 4,
      });
      requestRenderAll();
      return true;
    }
    if (dragging.type === "comparisonPan") {
      setComparisonViewportTransform(tile, viewportId, {
        panX: dragging.startPanX + (event.clientX - dragging.startClientX),
        panY: dragging.startPanY + (event.clientY - dragging.startClientY),
      });
      requestRenderAll();
      return true;
    }
    if (dragging.type === "comparisonZoom") {
      const deltaY = dragging.startClientY - event.clientY;
      setComparisonViewportTransform(tile, viewportId, {
        zoom: clamp(dragging.startZoom * Math.exp(deltaY * 0.01), 0.2, 12),
      });
      requestRenderAll();
      return true;
    }
    return false;
  }

  function getComparisonLayoutSignature() {
    return JSON.stringify({
      layout: state.comparison.layout,
      tiles: getVisibleComparisonTiles().map((tile) => ({
        id: tile.id,
        reconstructionId: tile.reconstructionId,
        label: getReconstructionById(tile.reconstructionId)?.label || "",
      })),
    });
  }

  function buildComparisonCanvas(tile, viewportId, className) {
    const canvas = document.createElement("canvas");
    canvas.className = className;
    canvas.dataset.viewportId = viewportId;
    canvas.dataset.comparisonTileId = tile.id;
    canvas.dataset.comparisonViewportId = viewportId;
    canvas.setAttribute("aria-label", `${getReconstructionById(tile.reconstructionId)?.label || "Comparison tile"} ${VIEWPORT_CONFIG[viewportId].title}`);
    canvas.addEventListener("pointerdown", handleComparisonPointerDown);
    canvas.addEventListener("click", handleComparisonClick);
    canvas.addEventListener("dblclick", handleComparisonDoubleClick);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener("wheel", handleComparisonWheel, { passive: false });
    const viewportState = tile.viewports[viewportId];
    viewportState.canvas = canvas;
    viewportState.ctx = canvas.getContext("2d");
    return canvas;
  }

  function buildComparisonFastScroll(tile, viewportId) {
    const scroller = document.createElement("div");
    scroller.className = "comparison-fast-scroll";
    const label = document.createElement("label");
    label.textContent = "Slice";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "0";
    slider.step = "1";
    slider.value = "0";
    slider.dataset.comparisonScrollTileId = tile.id;
    slider.dataset.comparisonScrollViewportId = viewportId;
    slider.setAttribute("aria-label", "Scroll comparison tile");
    slider.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      setActiveComparisonTile(tile.id);
    });
    slider.addEventListener("input", handleComparisonFastScrollInput);
    const value = document.createElement("span");
    value.dataset.comparisonScrollValue = `${tile.id}-${viewportId}`;
    value.textContent = getComparisonReadout(tile, viewportId);
    scroller.append(label, slider, value);
    return scroller;
  }

  function updateComparisonTileActiveClasses() {
    if (!els.comparisonLayer) {
      return;
    }
    els.comparisonLayer.querySelectorAll(".comparison-tile").forEach((tileElement) => {
      tileElement.classList.toggle(
        "is-active",
        tileElement.dataset.comparisonTileId === state.comparison.activeTileId
      );
    });
  }

  function renderComparisonLayerShell() {
    if (!els.comparisonLayer || !isComparisonActive()) {
      return;
    }
    const signature = getComparisonLayoutSignature();
    if (state.uiCache.comparisonLayer === signature) {
      updateComparisonTileActiveClasses();
      return;
    }
    state.uiCache.comparisonLayer = signature;
    els.comparisonLayer.innerHTML = "";
    getVisibleComparisonTiles().forEach((tile) => {
      const reconstruction = getReconstructionById(tile.reconstructionId);
      const tileElement = document.createElement("article");
      tileElement.className = "comparison-tile";
      tileElement.classList.toggle("is-active", tile.id === state.comparison.activeTileId);
      tileElement.dataset.comparisonTileId = tile.id;
      tileElement.tabIndex = 0;
      tileElement.addEventListener("click", () => setActiveComparisonTile(tile.id));
      tileElement.addEventListener("dragenter", handleComparisonTileDragEnter);
      tileElement.addEventListener("dragover", handleComparisonTileDragOver);
      tileElement.addEventListener("dragleave", handleComparisonTileDragLeave);
      tileElement.addEventListener("drop", handleComparisonTileDrop);

      const header = document.createElement("header");
      header.className = "comparison-tile-header";
      const label = document.createElement("span");
      label.className = "comparison-tile-series";
      label.textContent = reconstruction?.label || "Empty tile";
      const readout = document.createElement("span");
      readout.className = "viewport-readout";
      readout.dataset.comparisonReadout = `${tile.id}-presentation`;
      readout.textContent = getComparisonReadout(tile, "presentation");
      header.append(label, readout);
      tileElement.appendChild(header);

      if (!reconstruction) {
        const empty = document.createElement("div");
        empty.className = "comparison-empty";
        empty.innerHTML = "<strong>Drop series here</strong><span>Drag a reconstruction from Patient & Series.</span>";
        tileElement.appendChild(empty);
      } else {
        tileElement.appendChild(buildComparisonCanvas(tile, "presentation", "comparison-tile-canvas"));
        tileElement.appendChild(buildComparisonFastScroll(tile, "presentation"));
      }

      els.comparisonLayer.appendChild(tileElement);
    });
  }

  function updateComparisonReadouts() {
    if (!els.comparisonLayer || !isComparisonActive()) {
      return;
    }
    getVisibleComparisonTiles().forEach((tile) => {
      const readout = els.comparisonLayer.querySelector(`[data-comparison-readout="${tile.id}-presentation"]`);
      if (readout) {
        readout.textContent = getComparisonReadout(tile, "presentation");
      }
      const slider = els.comparisonLayer.querySelector(
        `[data-comparison-scroll-tile-id="${tile.id}"][data-comparison-scroll-viewport-id="presentation"]`
      );
      const value = els.comparisonLayer.querySelector(`[data-comparison-scroll-value="${tile.id}-presentation"]`);
      const reconstruction = getReconstructionById(tile.reconstructionId);
      const frame = getComparisonFrame(tile, "presentation");
      if (slider) {
        slider.disabled = !reconstruction || !frame;
        slider.max = String(Math.max(0, (frame?.metrics?.count ?? 1) - 1));
        slider.value = String(frame && reconstruction ? getReadoutIndexAtCenter(reconstruction, frame.plane, frame.centerWorld) : 0);
      }
      if (value) {
        value.textContent = getComparisonReadout(tile, "presentation");
      }
    });
  }

  function renderComparisonLayer() {
    if (!isComparisonActive()) {
      return;
    }
    renderComparisonLayerShell();
    getVisibleComparisonTiles().forEach((tile) => {
      renderComparisonViewport(tile, "presentation");
    });
    updateComparisonReadouts();
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

  function renderAll() {
    if (isComparisonActive()) {
      renderComparisonLayer();
      updateReadouts();
      return;
    }
    VIEWPORT_IDS.forEach(renderViewport);
    updateReadouts();
  }

  function requestRenderViewports(viewportIds, options) {
    requestProjectSessionAutosave();
    const targets = Array.isArray(viewportIds) ? viewportIds : [viewportIds];
    targets.forEach((viewportId) => {
      if (viewportId && VIEWPORT_IDS.includes(viewportId)) {
        state.renderDirtyViewports.add(viewportId);
      }
    });
    if (options?.readouts !== false) {
      state.readoutsDirty = true;
    }
    if (state.renderQueued) {
      return;
    }

    state.renderQueued = true;
    window.requestAnimationFrame(() => {
      state.renderQueued = false;
      if (isComparisonActive()) {
        state.renderDirtyViewports.clear();
        renderComparisonLayer();
        if (state.readoutsDirty) {
          updateReadouts();
          state.readoutsDirty = false;
        }
        return;
      }
      const dirtyViewports = state.renderDirtyViewports.size ? Array.from(state.renderDirtyViewports) : VIEWPORT_IDS;
      state.renderDirtyViewports.clear();
      dirtyViewports.forEach(renderViewport);
      if (state.readoutsDirty) {
        updateReadouts();
        state.readoutsDirty = false;
      }
    });
  }

  function requestRenderAll() {
    requestRenderViewports(VIEWPORT_IDS, { readouts: true });
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
      } else if (state.dragging?.type === "editAnnotation" && state.dragging.viewportId === viewportId) {
        cursor = "grabbing";
      } else if (state.dragging?.type === "pan" && state.dragging.viewportId === viewportId) {
        cursor = "grabbing";
      } else if (
        state.dragging &&
        state.dragging.viewportId === viewportId &&
        (state.dragging.type === "mprCenter" || state.dragging.type === "mprRotate")
      ) {
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
    const useCanonicalPresentationPlane = state.layout !== "mpr" && plane === "axial";
    const frame = useCanonicalPresentationPlane
      ? getCanonicalPlaneFrame(plane, reconstruction)
      : getCurrentPlaneFrame(plane, reconstruction);
    if (!frame) {
      return;
    }
    const startCenterWorld = useCanonicalPresentationPlane
      ? frame.centerWorld
      : state.mpr.centerWorld || reconstruction.volume.centerWorld;
    state.mpr.centerWorld = addVectors(
      startCenterWorld,
      scaleVector(frame.nWorld, delta * frame.metrics.spacingNormal)
    );
    state.polygonDraft = null;
    if (state.diameterDraft?.toolKey !== "stenosisDiameter") {
      state.diameterDraft = null;
    }
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
    const filename = buildExportFilename("cine", cineFormat.extension);
    await downloadExportBundle(
      [{ filename, blob }],
      window.HAGRadZip?.zipNameFrom ? window.HAGRadZip.zipNameFrom(filename) : buildExportFilename("cine", "zip")
    );
    setStatus(`Cine clip exported as a ZIP bundle containing ${cineFormat.extension.toUpperCase()}.`);
  }

  function csvEscape(value) {
    if (value == null || value === "") {
      return "";
    }
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function mergeSourceRecords(existingRecords, nextRecords) {
    const byKey = new Map((existingRecords || []).map((record) => [record.sourceKey, record]));
    (nextRecords || []).forEach((record) => {
      byKey.set(record.sourceKey, record);
    });
    return Array.from(byKey.values());
  }

  function formatDateTimeForRecord(record) {
    const value = combineDateTime(record);
    return value === "-" ? "" : value;
  }

  function extractIterativeReconstructionHint(record) {
    const haystack = [record.seriesDescription, record.protocolName, record.imageType]
      .filter(Boolean)
      .join(" ");
    const match = /\b(QIR\s*\d+|ADMIRE\s*\d+|ASIR(?:-V)?\s*\d+|IR\s*\d+)\b/i.exec(haystack);
    return match ? match[1].replace(/\s+/g, " ").trim() : "";
  }

  function extractMonoEnergeticKevHint(record) {
    const haystack = [record.seriesDescription, record.protocolName].filter(Boolean).join(" ");
    const vmiMatch = /\bVMI\s*([0-9]{2,3})\b/i.exec(haystack);
    if (vmiMatch) {
      return vmiMatch[1];
    }
    const kevMatch = /\b([0-9]{2,3})\s*keV\b/i.exec(haystack);
    return kevMatch ? kevMatch[1] : "";
  }

  function classifySourceRecord(record) {
    if (record.hasPixelData) {
      return "image";
    }

    const haystack = [
      record.modality,
      record.seriesDescription,
      record.studyDescription,
      record.protocolName,
      record.file?.name,
      record.reportTextSummary,
      record.reportRadiationSnippet,
      record.reportContrastSnippet,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const isRadiationReport =
      RADIATION_REPORT_KEYWORDS.some((keyword) => haystack.includes(keyword)) ||
      Number.isFinite(record.reportCtdiVolMgy) ||
      Number.isFinite(record.reportDlpMgyCm);
    if (isRadiationReport) {
      return "radiation_report";
    }

    const isContrastReport =
      CONTRAST_REPORT_KEYWORDS.some((keyword) => haystack.includes(keyword)) ||
      Number.isFinite(record.reportContrastVolumeMl) ||
      Number.isFinite(record.reportContrastFlowRateMlPerS) ||
      Boolean(record.contrastBolusAgent);
    if (isContrastReport) {
      return "contrast_report";
    }

    if (["SR", "DOC", "KO", "PR"].includes(record.modality || "")) {
      return "report";
    }

    return "other";
  }

  function addBaselineRow(rows, row) {
    const value = row?.value;
    if (value == null || value === "") {
      return;
    }
    rows.push({
      section: row.section || "",
      scope_type: row.scopeType || "",
      scope_label: row.scopeLabel || "",
      reconstruction_label: row.reconstructionLabel || "",
      source_file: row.sourceFile || "",
      modality: row.modality || "",
      field_group: row.fieldGroup || "",
      field_name: row.fieldName || "",
      value,
      unit: row.unit || "",
      source: row.source || "",
      notes: row.notes || "",
    });
  }

  function addAggregatedBaselineField(rows, options) {
    const values = collectRecordValues(options.records || [], options.selector);
    const formatted = formatAggregatedValue(values, options.formatter);
    if (!formatted) {
      return;
    }
    addBaselineRow(rows, {
      section: options.section,
      scopeType: options.scopeType,
      scopeLabel: options.scopeLabel,
      reconstructionLabel: options.reconstructionLabel,
      sourceFile: options.sourceFile,
      modality: options.modality,
      fieldGroup: options.fieldGroup,
      fieldName: options.fieldName,
      value: formatted,
      unit: options.unit,
      source: options.source || "dicom_header",
      notes: values.length > 1 ? (options.notes ? `${options.notes} Multiple values across slices.` : "Multiple values across slices.") : options.notes,
    });
  }

  function getOrderedFiniteValues(records, selector) {
    return (records || [])
      .map((record) => selector(record))
      .filter(Number.isFinite);
  }

  function getScanExtentSummary(records, volume) {
    const normalVector = records.find((record) => record.normalVector)?.normalVector || volume?.normalDirection || null;
    const positions = normalVector
      ? getOrderedFiniteValues(records, (record) =>
          record.imagePositionPatient.length >= 3 ? dot(record.imagePositionPatient, normalVector) : null
        )
      : [];

    if (positions.length >= 2) {
      const startMm = positions[0];
      const endMm = positions[positions.length - 1];
      const thickness = records[0]?.sliceThickness ?? volume?.sliceSpacing ?? 0;
      return {
        startMm,
        endMm,
        lengthMm: Math.abs(endMm - startMm) + thickness,
        source: "Computed from ImagePositionPatient",
      };
    }

    const tablePositions = getOrderedFiniteValues(records, (record) => record.tableTraverse);
    if (tablePositions.length >= 2) {
      const startMm = tablePositions[0];
      const endMm = tablePositions[tablePositions.length - 1];
      return {
        startMm,
        endMm,
        lengthMm: Math.abs(endMm - startMm),
        source: "Computed from table traverse positions",
      };
    }

    const sliceSpacing = volume?.sliceSpacing ?? estimateSliceSpacing(records);
    const thickness = records[0]?.sliceThickness ?? sliceSpacing ?? 0;
    if (Number.isFinite(sliceSpacing) && Number.isFinite(volume?.depth)) {
      return {
        startMm: null,
        endMm: null,
        lengthMm: Math.max(0, (volume.depth - 1) * sliceSpacing) + thickness,
        source: "Estimated from slice count and spacing",
      };
    }

    return {
      startMm: null,
      endMm: null,
      lengthMm: null,
      source: "",
    };
  }

  function buildBaselinePatientAndStudyRows(allRecords) {
    const rows = [];
    const first = allRecords[0];
    if (!first) {
      return rows;
    }

    const patientAgeYears = parsePatientAgeYears(first.patientAge);
    const radiationReportCount = allRecords.filter((record) => classifySourceRecord(record) === "radiation_report").length;
    const contrastReportCount = allRecords.filter((record) => classifySourceRecord(record) === "contrast_report").length;

    [
      ["demographics", "patient_name", first.patientName, "", "dicom_header", ""],
      ["demographics", "patient_id", first.patientId, "", "dicom_header", ""],
      ["demographics", "patient_birth_date", formatDicomDate(first.patientBirthDate), "", "dicom_header", ""],
      ["demographics", "patient_sex", first.patientSex, "", "dicom_header", ""],
      ["demographics", "patient_age_dicom", first.patientAge, "", "dicom_header", ""],
      ["demographics", "patient_age_years", formatNumberForCsv(patientAgeYears, 2), "years", "computed", "Parsed from DICOM patient age when available."],
      ["demographics", "patient_height_m", formatNumberForCsv(first.patientSizeM, 3), "m", "dicom_header", ""],
      ["demographics", "patient_weight_kg", formatNumberForCsv(first.patientWeightKg, 2), "kg", "dicom_header", ""],
      ["demographics", "patient_bmi", formatNumberForCsv(first.patientBmi, 2), "kg/m2", "computed", "Computed from patient size and weight when both were present."],
      ["identifiers", "study_instance_uid", first.studyInstanceUID, "", "dicom_header", ""],
      ["identifiers", "study_id", first.studyId, "", "dicom_header", ""],
      ["identifiers", "accession_number", first.accessionNumber, "", "dicom_header", ""],
      ["timing", "study_datetime", formatDateTimeForRecord(first), "", "dicom_header", ""],
      ["scanner", "institution_name", first.institutionName, "", "dicom_header", ""],
      ["scanner", "manufacturer", first.manufacturer, "", "dicom_header", ""],
      ["scanner", "manufacturer_model_name", first.manufacturerModelName, "", "dicom_header", ""],
      ["scanner", "software_versions", first.softwareVersions, "", "dicom_header", ""],
      ["scanner", "station_name", first.stationName, "", "dicom_header", ""],
      ["counts", "loaded_dicom_files", String(allRecords.length), "files", "computed", ""],
      ["counts", "loaded_reconstructions", String(state.reconstructions.length), "series", "computed", ""],
      ["counts", "radiation_report_files", String(radiationReportCount), "files", "computed", ""],
      ["counts", "contrast_report_files", String(contrastReportCount), "files", "computed", ""],
    ].forEach(([fieldGroup, fieldName, value, unit, source, notes]) => {
      addBaselineRow(rows, {
        section: "patient_study",
        scopeType: "study",
        scopeLabel: first.patientName || first.patientId || "Loaded study",
        modality: first.modality || "",
        fieldGroup,
        fieldName,
        value,
        unit,
        source,
        notes,
      });
    });

    return rows;
  }

  function buildReconstructionBaselineRows(reconstruction) {
    const rows = [];
    const records = reconstruction?.records || [];
    const first = records[0];
    if (!first) {
      return rows;
    }

    const scopeLabel = reconstruction.label || first.seriesDescription || first.seriesInstanceUID || "Reconstruction";
    const sourceFile = first.file?.name || "";
    const modality = first.modality || "";
    const volume = reconstruction.volume || {};
    const scanExtent = getScanExtentSummary(records, volume);
    const tableTraverseValues = getOrderedFiniteValues(records, (record) => record.tableTraverse);
    const monoEnergeticKevHint = extractMonoEnergeticKevHint(first);
    const iterativeHint = extractIterativeReconstructionHint(first);
    const iodineMapHint = /iodine/i.test([first.seriesDescription, first.protocolName, first.imageType].filter(Boolean).join(" "));

    [
      ["identifiers", "series_instance_uid", first.seriesInstanceUID],
      ["identifiers", "frame_of_reference_uid", first.frameOfReferenceUID],
      ["identifiers", "series_number", formatNumberForCsv(first.seriesNumber, 0)],
      ["identifiers", "acquisition_number", formatNumberForCsv(first.acquisitionNumber, 0)],
      ["identifiers", "image_files_loaded", String(records.length)],
      ["description", "series_description", first.seriesDescription],
      ["description", "study_description", first.studyDescription],
      ["description", "protocol_name", first.protocolName],
      ["description", "body_part_examined", first.bodyPartExamined],
      ["description", "image_type", first.imageType],
      ["timing", "acquisition_datetime", formatDateTimeForRecord(first)],
      ["scanner", "manufacturer", first.manufacturer],
      ["scanner", "manufacturer_model_name", first.manufacturerModelName],
      ["scanner", "software_versions", first.softwareVersions],
      ["scanner", "station_name", first.stationName],
      ["geometry", "matrix_size", `${volume.columns || first.columns || "-"} x ${volume.rows || first.rows || "-"} x ${volume.depth || records.length}`],
      ["geometry", "row_spacing_mm", formatNumberForCsv(volume.rowSpacing ?? first.pixelSpacing?.[0], 3)],
      ["geometry", "column_spacing_mm", formatNumberForCsv(volume.columnSpacing ?? first.pixelSpacing?.[1], 3)],
      ["geometry", "slice_spacing_mm", formatNumberForCsv(volume.sliceSpacing ?? estimateSliceSpacing(records), 3)],
      ["geometry", "slice_thickness_mm", formatNumberForCsv(first.sliceThickness, 3)],
      ["geometry", "spacing_between_slices_mm", formatNumberForCsv(first.spacingBetweenSlices, 3)],
      ["geometry", "reconstruction_diameter_mm", formatNumberForCsv(first.reconstructionDiameter, 3)],
      ["geometry", "data_collection_diameter_mm", formatNumberForCsv(first.dataCollectionDiameter, 3)],
      ["acquisition", "patient_position", first.patientPosition],
      ["acquisition", "rotation_direction", first.rotationDirection],
      ["acquisition", "filter_type", first.filterType],
      ["acquisition", "focal_spots", first.focalSpots],
      ["acquisition", "table_height_mm", formatNumberForCsv(first.tableHeight, 3)],
      ["reconstruction", "iterative_reconstruction_hint", iterativeHint],
      ["reconstruction", "monoenergetic_kev_hint", monoEnergeticKevHint],
      ["reconstruction", "iodine_map_hint", iodineMapHint ? "yes" : "no"],
      ["computed", "scan_length_mm", formatNumberForCsv(scanExtent.lengthMm, 3)],
      ["computed", "scan_start_position_mm", formatNumberForCsv(scanExtent.startMm, 3)],
      ["computed", "scan_end_position_mm", formatNumberForCsv(scanExtent.endMm, 3)],
      ["computed", "scan_length_source", scanExtent.source],
      ["computed", "table_position_start_mm", formatNumberForCsv(tableTraverseValues[0], 3)],
      ["computed", "table_position_end_mm", formatNumberForCsv(tableTraverseValues[tableTraverseValues.length - 1], 3)],
      ["computed", "table_position_range_mm", tableTraverseValues.length >= 2 ? formatNumberForCsv(Math.abs(tableTraverseValues[tableTraverseValues.length - 1] - tableTraverseValues[0]), 3) : ""],
      ["computed", "skipped_nondecodable_slices", String(volume.skippedCount || 0)],
    ].forEach(([fieldGroup, fieldName, value]) => {
      const unit =
        /_(mm|mgy|kg|ma|mas|sec|ml)$/.test(fieldName) ? fieldName.split("_").slice(-1)[0].replace("mgy", "mGy") : "";
      addBaselineRow(rows, {
        section: "reconstruction",
        scopeType: "series",
        scopeLabel,
        reconstructionLabel: scopeLabel,
        sourceFile,
        modality,
        fieldGroup,
        fieldName,
        value,
        unit:
          fieldName === "scan_length_mm" ||
          fieldName === "scan_start_position_mm" ||
          fieldName === "scan_end_position_mm" ||
          fieldName === "table_position_start_mm" ||
          fieldName === "table_position_end_mm" ||
          fieldName === "table_position_range_mm" ||
          fieldName === "row_spacing_mm" ||
          fieldName === "column_spacing_mm" ||
          fieldName === "slice_spacing_mm" ||
          fieldName === "slice_thickness_mm" ||
          fieldName === "spacing_between_slices_mm" ||
          fieldName === "reconstruction_diameter_mm" ||
          fieldName === "data_collection_diameter_mm" ||
          fieldName === "table_height_mm"
            ? "mm"
            : fieldName === "skipped_nondecodable_slices"
              ? "slices"
              : "",
        source: fieldGroup === "computed" ? "computed" : "dicom_header",
      });
    });

    [
      ["reconstruction", "convolution_kernel", (record) => record.convolutionKernel, null, ""],
      ["reconstruction", "window_center", (record) => record.windowCenter, (value) => formatNumberForCsv(value, 3), ""],
      ["reconstruction", "window_width", (record) => record.windowWidth, (value) => formatNumberForCsv(value, 3), ""],
      ["reconstruction", "rescale_slope", (record) => record.rescaleSlope, (value) => formatNumberForCsv(value, 3), ""],
      ["reconstruction", "rescale_intercept", (record) => record.rescaleIntercept, (value) => formatNumberForCsv(value, 3), ""],
      ["acquisition", "kvp", (record) => record.kvp, (value) => formatNumberForCsv(value, 1), "kV"],
      ["acquisition", "exposure_time_ms", (record) => record.exposureTimeMs, (value) => formatNumberForCsv(value, 3), "ms"],
      ["acquisition", "tube_current_ma", (record) => record.tubeCurrentMa, (value) => formatNumberForCsv(value, 3), "mA"],
      ["acquisition", "exposure_mas", (record) => record.exposureMas, (value) => formatNumberForCsv(value, 3), "mAs"],
      ["acquisition", "gantry_detector_tilt_deg", (record) => record.gantryDetectorTilt, (value) => formatNumberForCsv(value, 3), "deg"],
      ["acquisition", "distance_source_to_detector_mm", (record) => record.distanceSourceToDetector, (value) => formatNumberForCsv(value, 3), "mm"],
      ["acquisition", "distance_source_to_patient_mm", (record) => record.distanceSourceToPatient, (value) => formatNumberForCsv(value, 3), "mm"],
      ["acquisition", "revolution_time_s", (record) => record.revolutionTimeSec, (value) => formatNumberForCsv(value, 3), "s"],
      ["acquisition", "single_collimation_width_mm", (record) => record.singleCollimationWidth, (value) => formatNumberForCsv(value, 3), "mm"],
      ["acquisition", "total_collimation_width_mm", (record) => record.totalCollimationWidth, (value) => formatNumberForCsv(value, 3), "mm"],
      ["acquisition", "table_feed_per_rotation_mm", (record) => record.tableFeedPerRotation, (value) => formatNumberForCsv(value, 3), "mm"],
      ["acquisition", "spiral_pitch_factor", (record) => record.spiralPitchFactor, (value) => formatNumberForCsv(value, 3), ""],
      ["dose", "ctdi_vol_mgy", (record) => record.ctdiVolMgy, (value) => formatNumberForCsv(value, 3), "mGy"],
      ["contrast", "contrast_agent", (record) => record.contrastBolusAgent, null, ""],
      ["contrast", "contrast_route", (record) => record.contrastBolusRoute, null, ""],
      ["contrast", "contrast_volume_ml", (record) => record.contrastBolusVolumeMl, (value) => formatNumberForCsv(value, 3), "mL"],
      ["contrast", "contrast_total_dose", (record) => record.contrastBolusTotalDose, (value) => formatNumberForCsv(value, 3), ""],
      ["contrast", "contrast_flow_rate_ml_per_s", (record) => record.contrastFlowRateMlPerS, (value) => formatNumberForCsv(value, 3), "mL/s"],
      ["contrast", "contrast_flow_duration_s", (record) => record.contrastFlowDurationSec, (value) => formatNumberForCsv(value, 3), "s"],
      ["contrast", "contrast_ingredient", (record) => record.contrastIngredient, null, ""],
      ["contrast", "contrast_ingredient_concentration_mg_per_ml", (record) => record.contrastIngredientConcentrationMgMl, (value) => formatNumberForCsv(value, 3), "mg/mL"],
    ].forEach(([fieldGroup, fieldName, selector, formatter, unit]) => {
      addAggregatedBaselineField(rows, {
        section: "reconstruction",
        scopeType: "series",
        scopeLabel,
        reconstructionLabel: scopeLabel,
        sourceFile,
        modality,
        fieldGroup,
        fieldName,
        records,
        selector,
        formatter,
        unit,
        source: "dicom_header",
      });
    });

    return rows;
  }

  function buildReportBaselineRows(allRecords) {
    const rows = [];
    allRecords
      .filter((record) => !record.hasPixelData)
      .forEach((record) => {
        const category = classifySourceRecord(record);
        const section =
          category === "radiation_report"
            ? "radiation_report"
            : category === "contrast_report"
              ? "contrast_report"
              : "report";
        const scopeLabel = record.seriesDescription || record.protocolName || record.file?.name || section;

        [
          ["report", "file_name", record.file?.name, "", "dicom_header", ""],
          ["report", "modality", record.modality, "", "dicom_header", ""],
          ["report", "sop_class_uid", record.sopClassUID, "", "dicom_header", ""],
          ["report", "series_description", record.seriesDescription, "", "dicom_header", ""],
          ["report", "study_description", record.studyDescription, "", "dicom_header", ""],
          ["report", "protocol_name", record.protocolName, "", "dicom_header", ""],
          ["report", "report_datetime", formatDateTimeForRecord(record), "", "dicom_header", ""],
          ["scanner", "manufacturer", record.manufacturer, "", "dicom_header", ""],
          ["scanner", "manufacturer_model_name", record.manufacturerModelName, "", "dicom_header", ""],
          ["dose", "ctdi_vol_mgy", formatNumberForCsv(record.ctdiVolMgy ?? record.reportCtdiVolMgy, 3), "mGy", record.ctdiVolMgy != null ? "dicom_header" : "report_text", ""],
          ["dose", "dlp_mgy_cm", formatNumberForCsv(record.reportDlpMgyCm, 3), "mGy.cm", "report_text", "Keyword extraction from report text when available."],
          ["contrast", "contrast_agent", record.contrastBolusAgent, "", "dicom_header", ""],
          ["contrast", "contrast_volume_ml", formatNumberForCsv(record.contrastBolusVolumeMl ?? record.reportContrastVolumeMl, 3), "mL", record.contrastBolusVolumeMl != null ? "dicom_header" : "report_text", ""],
          ["contrast", "contrast_flow_rate_ml_per_s", formatNumberForCsv(record.contrastFlowRateMlPerS ?? record.reportContrastFlowRateMlPerS, 3), "mL/s", record.contrastFlowRateMlPerS != null ? "dicom_header" : "report_text", ""],
          ["report", "report_text_summary", record.reportTextSummary, "", "report_text", "Truncated plain-text scan of the non-image DICOM file."],
          ["report", "radiation_text_snippet", record.reportRadiationSnippet, "", "report_text", "Keyword snippet from the report file."],
          ["report", "contrast_text_snippet", record.reportContrastSnippet, "", "report_text", "Keyword snippet from the report file."],
        ].forEach(([fieldGroup, fieldName, value, unit, source, notes]) => {
          addBaselineRow(rows, {
            section,
            scopeType: "report_file",
            scopeLabel,
            sourceFile: record.file?.name || "",
            modality: record.modality || "",
            fieldGroup,
            fieldName,
            value,
            unit,
            source,
            notes,
          });
        });
      });
    return rows;
  }

  function buildBaselineCharacteristicsRows() {
    const allRecords = state.sourceRecords.length
      ? state.sourceRecords.slice()
      : state.reconstructions.flatMap((reconstruction) => reconstruction.records || []);

    if (!allRecords.length) {
      return [];
    }

    return [
      ...buildBaselinePatientAndStudyRows(allRecords),
      ...state.reconstructions.flatMap((reconstruction) => buildReconstructionBaselineRows(reconstruction)),
      ...buildReportBaselineRows(allRecords),
    ];
  }

  function getBaselineExportGroupForRow(row) {
    if (row.section === "patient_study") {
      return "patientStudy";
    }
    if (row.field_group === "dose" || row.section === "radiation_report") {
      return "radiation";
    }
    if (row.field_group === "contrast" || row.section === "contrast_report" || row.section === "report") {
      return "contrast";
    }
    return "reconstruction";
  }

  function filterBaselineRowsByGroups(rows, selectedGroups) {
    const enabledGroups = new Set((selectedGroups || []).filter(Boolean));
    return rows.filter((row) => enabledGroups.has(getBaselineExportGroupForRow(row)));
  }

  function buildBaselineCharacteristicsCsv(rows, studyId) {
    const headers = [
      "study_id",
      "research_study_id",
      "research_study_label",
      "section",
      "scope_type",
      "scope_label",
      "reconstruction_label",
      "source_file",
      "modality",
      "field_group",
      "field_name",
      "value",
      "unit",
      "source",
      "notes",
    ];

    const csvRows = rows.map((row) => [
      studyId || "",
      row.research_study_id || "",
      row.research_study_label || "",
      row.section,
      row.scope_type,
      row.scope_label,
      row.reconstruction_label,
      row.source_file,
      row.modality,
      row.field_group,
      row.field_name,
      row.value,
      row.unit,
      row.source,
      row.notes,
    ]);

    return [headers, ...csvRows].map((row) => row.map(csvEscape).join(",")).join("\n");
  }

  function getBaselineCharacteristicsHeaders() {
    return [
      "study_id",
      "research_study_id",
      "research_study_label",
      "section",
      "scope_type",
      "scope_label",
      "reconstruction_label",
      "source_file",
      "modality",
      "field_group",
      "field_name",
      "value",
      "unit",
      "source",
      "notes",
    ];
  }

  async function appendExportToActiveProject(exportType, headers, rows) {
    if (!PROJECT_WORKFLOW_ENABLED) {
      return null;
    }
    const project = getActiveProject();
    if (!project) {
      return null;
    }

    const caseSummary = buildProjectCaseSummary();
    if (!caseSummary.caseId) {
      throw new Error("Set a project case ID before exporting into the project tables.");
    }

    return fetchJson("/api/projects/append-export", {
      method: "POST",
      body: JSON.stringify({
        projectId: project.id,
        exportType,
        headers,
        rows,
        case: caseSummary,
      }),
    });
  }

  function syncBaselineExportInputsFromState() {
    BASELINE_EXPORT_GROUPS.forEach((group) => {
      const input = els.baselineExportGroupInputs?.[group.id];
      if (input) {
        input.checked = state.baselineExportGroups[group.id] !== false;
      }
    });
  }

  function syncBaselineExportStateFromInputs() {
    BASELINE_EXPORT_GROUPS.forEach((group) => {
      const input = els.baselineExportGroupInputs?.[group.id];
      if (input) {
        state.baselineExportGroups[group.id] = input.checked;
      }
    });
  }

  function getSelectedBaselineExportGroups() {
    syncBaselineExportStateFromInputs();
    return BASELINE_EXPORT_GROUPS.filter((group) => state.baselineExportGroups[group.id]).map((group) => group.id);
  }

  function getExportStudyDirectoryLabel(studyId) {
    const study = state.exportStudies.find((entry) => safeString(entry.id) === safeString(studyId)) || null;
    if (study?.slug) {
      return `exports_outbox/viewer/${study.slug}`;
    }
    return "exports_outbox/viewer";
  }

  function getSelectedExportStudyMetadata() {
    const study = state.exportStudies.find((entry) => safeString(entry.id) === safeString(state.currentExportStudyId)) || null;
    return {
      id: safeString(study?.id) || "",
      label: safeString(study?.label) || "",
      slug: safeString(study?.slug) || "",
      displayLabel: safeString(study?.label) || safeString(study?.id) || "",
    };
  }

  function updateExportStudyTargetNotes() {
    const currentStudyId = safeString(state.currentExportStudyId);
    const study = state.exportStudies.find((entry) => safeString(entry.id) === currentStudyId) || null;
    const text = study
      ? `Mirrored exports will also be saved to ${getExportStudyDirectoryLabel(study.id)}.`
      : "Mirrored exports will also be saved to exports_outbox/viewer until a study is selected.";
    if (els.measurementExportStudyTargetNote) {
      els.measurementExportStudyTargetNote.textContent = text;
    }
    if (els.baselineExportStudyTargetNote) {
      els.baselineExportStudyTargetNote.textContent = text;
    }
  }

  function applyExportStudyPayload(payload) {
    state.exportStudies = Array.isArray(payload?.studies) ? payload.studies : [];
    state.currentExportStudyId = safeString(payload?.currentStudyId) || "";
    if (els.measurementExportStudySelect) {
      exportStudyApi?.populateSelect(els.measurementExportStudySelect, state.exportStudies, state.currentExportStudyId, "No study selected");
    }
    if (els.baselineExportStudySelect) {
      exportStudyApi?.populateSelect(els.baselineExportStudySelect, state.exportStudies, state.currentExportStudyId, "No study selected");
    }
    updateExportStudyTargetNotes();
  }

  async function refreshExportStudyOptions() {
    if (!exportStudyApi) {
      updateExportStudyTargetNotes();
      return;
    }
    const payload = await exportStudyApi.load();
    applyExportStudyPayload(payload);
  }

  async function handleExportStudySelectionChange(selectElement) {
    if (!exportStudyApi || !selectElement) {
      return;
    }
    const payload = await exportStudyApi.select(selectElement.value || "");
    state.currentExportStudyId = safeString(payload?.id) || "";
    await refreshExportStudyOptions();
  }

  async function createExportStudyFromInput(inputElement) {
    if (!exportStudyApi || !inputElement) {
      return;
    }
    const label = safeString(inputElement.value);
    if (!label) {
      setStatus("Enter a study name first.", "warning");
      inputElement.focus();
      return;
    }
    const created = await exportStudyApi.create(label);
    inputElement.value = "";
    state.currentExportStudyId = safeString(created?.id) || "";
    await refreshExportStudyOptions();
    setStatus(`Selected export study ${created?.label || state.currentExportStudyId}.`);
  }

  function openBaselineExportModal() {
    const rows = buildBaselineCharacteristicsRows();
    if (!rows.length) {
      throw new Error("Load a study first.");
    }

    syncBaselineExportInputsFromState();
    if (els.baselineExportStudyIdInput) {
      els.baselineExportStudyIdInput.value = suggestMeasurementStudyId();
    }
    refreshExportStudyOptions().catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not load export studies.", "error");
    });
    els.baselineExportModal.classList.remove("is-hidden");
    els.baselineExportModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-modal-open");
    if (els.baselineExportStudyIdInput) {
      els.baselineExportStudyIdInput.focus();
      els.baselineExportStudyIdInput.select();
    } else {
      els.baselineExportConfirmButton.focus();
    }
  }

  function suggestMeasurementStudyId() {
    const reconstruction = getActiveReconstruction();
    const record = reconstruction?.records?.[0] || {};
    return (
      safeString(record.studyId) ||
      safeString(record.accessionNumber) ||
      safeString(record.patientId) ||
      ""
    );
  }

  function openMeasurementExportModal(mode) {
    const entries = buildMeasurementEntries();
    if (!entries.length) {
      throw new Error("Create at least one measurement first.");
    }

    const finishClose = mode === "finishClose";
    state.pendingMeasurementExport = {
      finishClose,
    };
    els.measurementExportTitle.textContent = finishClose ? "Finish & Close" : "Export Measurements";
    els.measurementExportCopy.textContent = finishClose
      ? "Assign a Study ID before exporting. HAGRad will export the measurement PNG and CSV, then close the current patient."
      : "Assign a Study ID before exporting. HAGRad will place it into the first CSV column and show it in the exported PNG header.";
    els.measurementExportConfirmButton.textContent = finishClose ? "Export, Finish & Close" : "Export PNG + CSV";
    els.measurementExportStudyIdInput.value = suggestMeasurementStudyId();
    refreshExportStudyOptions().catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not load export studies.", "error");
    });
    els.measurementExportModal.classList.remove("is-hidden");
    els.measurementExportModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-modal-open");
    els.measurementExportStudyIdInput.focus();
    els.measurementExportStudyIdInput.select();
  }

  function closeMeasurementExportModal() {
    if (!els.measurementExportModal) {
      return;
    }
    els.measurementExportModal.classList.add("is-hidden");
    els.measurementExportModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-modal-open");
    state.pendingMeasurementExport = null;
  }

  function closeBaselineExportModal() {
    if (!els.baselineExportModal) {
      return;
    }
    els.baselineExportModal.classList.add("is-hidden");
    els.baselineExportModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-modal-open");
  }

  async function exportBaselineCharacteristics(selectedGroups, options) {
    const rows = buildBaselineCharacteristicsRows();
    if (!rows.length) {
      throw new Error("Load a study first.");
    }
    const studyId = safeString(options?.studyId);

    const groups = selectedGroups?.length ? selectedGroups : BASELINE_EXPORT_GROUPS.map((group) => group.id);
    const filteredRows = filterBaselineRowsByGroups(rows, groups);
    if (!filteredRows.length) {
      throw new Error("Select at least one baseline export group first.");
    }

    const headers = getBaselineCharacteristicsHeaders();
    const researchStudy = getSelectedExportStudyMetadata();
    const enrichedRows = filteredRows.map((row) => ({
      ...row,
      research_study_id: researchStudy.id || "",
      research_study_label: researchStudy.label || "",
    }));
    const csv = buildBaselineCharacteristicsCsv(enrichedRows, studyId);
    const csvFilename = buildExportFilename("baseline_characteristics", "csv", { studyId });
    await downloadExportBundle(
      [{ filename: csvFilename, blob: new Blob([csv], { type: "text/csv;charset=utf-8" }) }],
      buildExportFilename("baseline_characteristics", "zip", { studyId }),
      { patientStudyId: studyId }
    );

    const projectRows = filteredRows.map((row) => ({
      study_id: studyId || "",
      research_study_id: researchStudy.id || "",
      research_study_label: researchStudy.label || "",
      ...row,
    }));
    const projectResult = await appendExportToActiveProject("baseline_characteristics", headers, projectRows);
    if (projectResult?.case) {
      const existing = getMatchingProjectCase(projectResult.case.case_id) || {};
      upsertProjectCaseInState({
        ...existing,
        ...projectResult.case,
        export_count: Number(existing.export_count || 0) + 1,
        last_export_at: projectResult.exportTimestamp || "",
      });
      renderProjectCases();
    }

    const reportCount = state.sourceRecords.filter((record) => !record.hasPixelData).length;
    setStatus(
      projectResult
        ? `Baseline characteristics ZIP exported for ${studyId || "the current study"} and appended to ${projectResult.project.name} as ${projectResult.case.case_id}.`
        : `Exported baseline characteristics ZIP with ${filteredRows.length} CSV row${filteredRows.length === 1 ? "" : "s"} from ${state.reconstructions.length} reconstruction${state.reconstructions.length === 1 ? "" : "s"} and ${reportCount} report file${reportCount === 1 ? "" : "s"}${studyId ? ` for ${studyId}` : ""}.`
    );
  }

  function buildMeasurementEntriesForReconstruction(reconstruction) {
    return reconstruction.annotations
      .filter((annotation) => MEASUREMENT_TYPES.has(annotation.type))
      .sort((left, right) => left.id - right.id)
      .map((annotation) => ({
        reconstruction,
        annotation,
        displayName: getAnnotationDisplayName(annotation, reconstruction),
        summary: getMeasurementSummary(annotation, reconstruction),
      }));
  }

  function buildMeasurementEntries() {
    return state.reconstructions
      .flatMap((reconstruction) => buildMeasurementEntriesForReconstruction(reconstruction))
      .sort((left, right) => left.annotation.id - right.annotation.id)
      .map((entry, index) => ({
        ...entry,
        label: `M${String(index + 1).padStart(3, "0")}`,
        order: index + 1,
      }));
  }

  function getMeasurementSliceMetadata(entry) {
    const reconstruction = entry?.reconstruction;
    const frame = entry?.annotation?.frame;
    if (!reconstruction?.volume || !frame?.centerWorld) {
      return {
        measurement_slice_index: "",
        measurement_slice_count: "",
      };
    }

    const volume = reconstruction.volume;
    const coordinates = worldToVolumeCoordinates(volume, frame.centerWorld);
    const plane = frame.plane || entry.annotation?.plane || "axial";
    const metrics = getPlaneMetrics(volume, plane);
    let rawIndex = coordinates.z;
    if (plane === "coronal") {
      rawIndex = coordinates.y;
    } else if (plane === "sagittal") {
      rawIndex = coordinates.x;
    }

    return {
      measurement_slice_index:
        Number.isFinite(rawIndex) && metrics?.count ? String(clamp(Math.round(rawIndex), 0, metrics.count - 1) + 1) : "",
      measurement_slice_count: metrics?.count ? String(metrics.count) : "",
    };
  }

  function getMeasurementExportMetadata(entry) {
    const reconstruction = entry?.reconstruction;
    const record = reconstruction?.records?.[0] || {};
    const volume = reconstruction?.volume || {};
    const incrementMm = Number.isFinite(record.spacingBetweenSlices) ? record.spacingBetweenSlices : volume.sliceSpacing;
    const sliceMetadata = getMeasurementSliceMetadata(entry);

    return {
      dicom_patient_name: record.patientName || "",
      dicom_patient_id: record.patientId || "",
      dicom_study_id: record.studyId || "",
      accession_number: record.accessionNumber || "",
      study_instance_uid: record.studyInstanceUID || "",
      series_instance_uid: record.seriesInstanceUID || "",
      study_description: record.studyDescription || "",
      series_description: record.seriesDescription || "",
      protocol_name: record.protocolName || "",
      modality: record.modality || "",
      series_number: Number.isFinite(record.seriesNumber) ? String(record.seriesNumber) : "",
      acquisition_number: Number.isFinite(record.acquisitionNumber) ? String(record.acquisitionNumber) : "",
      instance_number: Number.isFinite(record.instanceNumber) ? String(record.instanceNumber) : "",
      manufacturer: record.manufacturer || "",
      manufacturer_model_name: record.manufacturerModelName || "",
      software_versions: record.softwareVersions || "",
      station_name: record.stationName || "",
      acquisition_datetime: formatDateTimeForRecord(record),
      patient_position: record.patientPosition || "",
      convolution_kernel: record.convolutionKernel || "",
      iterative_reconstruction_hint: extractIterativeReconstructionHint(record),
      kvp: formatNumberForCsv(record.kvp, 1),
      matrix: volume.columns && volume.rows && volume.depth ? `${volume.columns} x ${volume.rows} x ${volume.depth}` : "",
      slice_thickness_mm: formatNumberForCsv(record.sliceThickness, 3),
      slice_increment_mm: formatNumberForCsv(incrementMm, 3),
      pixel_spacing_row_mm: formatNumberForCsv(volume.rowSpacing ?? record.pixelSpacing?.[0], 4),
      pixel_spacing_column_mm: formatNumberForCsv(volume.columnSpacing ?? record.pixelSpacing?.[1], 4),
      slice_spacing_mm: formatNumberForCsv(volume.sliceSpacing, 4),
      source_file: record.file?.name || "",
      ...sliceMetadata,
    };
  }

  function buildMeasurementsTable(entries, studyId) {
    const researchStudy = getSelectedExportStudyMetadata();
    const headers = [
      "study_id",
      "research_study_id",
      "research_study_label",
      "dicom_patient_name",
      "dicom_patient_id",
      "dicom_study_id",
      "accession_number",
      "study_instance_uid",
      "series_instance_uid",
      "study_description",
      "series_description",
      "protocol_name",
      "modality",
      "series_number",
      "acquisition_number",
      "instance_number",
      "manufacturer",
      "manufacturer_model_name",
      "software_versions",
      "station_name",
      "acquisition_datetime",
      "patient_position",
      "convolution_kernel",
      "iterative_reconstruction_hint",
      "kvp",
      "matrix",
      "slice_thickness_mm",
      "slice_increment_mm",
      "pixel_spacing_row_mm",
      "pixel_spacing_column_mm",
      "slice_spacing_mm",
      "measurement_slice_index",
      "measurement_slice_count",
      "source_file",
      "label",
      "order",
      "annotation_id",
      "custom_name",
      "display_name",
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
      "profile_family",
      "profile_adjustment_mode",
      "vascular_peak_hu",
      "vascular_background_hu",
      "vascular_amplitude_hu",
      "vascular_fwhm_mm",
      "vascular_half_max_hu",
      "vascular_left_rise_10_90_mm",
      "vascular_left_slope_hu_per_mm",
      "vascular_right_rise_10_90_mm",
      "vascular_right_slope_hu_per_mm",
      "vascular_average_slope_hu_per_mm",
      "blooming_outer_diameter_mm",
      "blooming_inner_diameter_mm",
      "blooming_percent",
      "stenosis_proximal_reference_mm",
      "stenosis_distal_reference_mm",
      "stenosis_reference_diameter_mm",
      "stenosis_minimal_lumen_diameter_mm",
      "stenosis_percent",
      "plaque_type",
      "plaque_peak_hu",
      "plaque_hu",
      "plaque_lumen_baseline_hu",
      "plaque_amplitude_hu",
      "plaque_delta_hu",
      "plaque_fwhm_mm",
      "plaque_fwhm_kind",
      "plaque_fwhm_estimated",
      "plaque_half_max_hu",
      "plaque_half_min_hu",
      "plaque_lumen_fwhm_mm",
      "plaque_lumen_half_max_hu",
      "plaque_lumen_left_half_mm",
      "plaque_lumen_right_half_mm",
      "plaque_interface_side",
      "plaque_interface_direction",
      "plaque_interface_width_mm",
      "plaque_interface_rise_10_90_mm",
      "plaque_interface_slope_hu_per_mm",
      "plaque_interface_normalized_slope_per_mm",
      "plaque_interface_normalized_slope_percent_per_mm",
      "plaque_interface_edge_fwhm_mm",
      "plaque_interface_peak_gradient_hu_per_mm",
      "plaque_interface_normalized_peak_gradient_per_mm",
      "plaque_interface_normalized_peak_gradient_percent_per_mm",
      "plaque_fwhm_to_lumen_fwhm_ratio",
      "plaque_edge_width_to_lumen_fwhm_ratio",
      "plaque_edge_fwhm_to_lumen_fwhm_ratio",
      "plaque_interface_kurtosis",
      "plaque_left_rise_10_90_mm",
      "plaque_left_slope_hu_per_mm",
      "plaque_left_edge_fwhm_mm",
      "plaque_right_rise_10_90_mm",
      "plaque_right_slope_hu_per_mm",
      "plaque_right_edge_fwhm_mm",
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

    const rows = entries.map((entry) => {
      const metadata = getMeasurementExportMetadata(entry);
      return {
        study_id: studyId || "",
        research_study_id: researchStudy.id || "",
        research_study_label: researchStudy.label || "",
        ...metadata,
        label: entry.label,
        order: entry.order,
        annotation_id: entry.annotation.id,
        custom_name: entry.annotation.customName || "",
        display_name: entry.displayName || "",
        type: formatMeasurementType(entry.annotation),
        plane: entry.annotation.plane,
        reconstruction: entry.reconstruction?.label || "",
        length_mm: entry.summary.lengthMm != null ? entry.summary.lengthMm.toFixed(2) : "",
        probe_hu: entry.summary.hu != null ? Math.round(entry.summary.hu) : "",
        mean_hu: entry.summary.mean != null ? entry.summary.mean.toFixed(2) : "",
        sd_hu: entry.summary.sd != null ? entry.summary.sd.toFixed(2) : "",
        area_mm2: entry.summary.areaMm2 != null ? entry.summary.areaMm2.toFixed(2) : "",
        vertex_count: entry.summary.vertexCount != null ? entry.summary.vertexCount : "",
        profile_length_mm: entry.summary.profileLengthMm != null ? entry.summary.profileLengthMm.toFixed(2) : "",
        profile_width_mm: entry.summary.profileWidthMm != null ? entry.summary.profileWidthMm.toFixed(2) : "",
        profile_axis: entry.summary.profileAxis || "",
        profile_samples: entry.summary.sampleCount != null ? entry.summary.sampleCount : "",
        profile_family: entry.summary.profileFamily || "",
        profile_adjustment_mode: entry.summary.profileAdjustmentMode || "",
        vascular_peak_hu: entry.summary.vascularPeakHu != null ? entry.summary.vascularPeakHu.toFixed(1) : "",
        vascular_background_hu: entry.summary.vascularBackgroundHu != null ? entry.summary.vascularBackgroundHu.toFixed(1) : "",
        vascular_amplitude_hu: entry.summary.vascularAmplitudeHu != null ? entry.summary.vascularAmplitudeHu.toFixed(1) : "",
        vascular_fwhm_mm: entry.summary.vascularFwhmMm != null ? entry.summary.vascularFwhmMm.toFixed(3) : "",
        vascular_half_max_hu: entry.summary.vascularHalfMaximumHu != null ? entry.summary.vascularHalfMaximumHu.toFixed(1) : "",
        vascular_left_rise_10_90_mm: entry.summary.vascularLeftRise10To90Mm != null ? entry.summary.vascularLeftRise10To90Mm.toFixed(3) : "",
        vascular_left_slope_hu_per_mm: entry.summary.vascularLeftSlopeHuPerMm != null ? entry.summary.vascularLeftSlopeHuPerMm.toFixed(3) : "",
        vascular_right_rise_10_90_mm: entry.summary.vascularRightRise10To90Mm != null ? entry.summary.vascularRightRise10To90Mm.toFixed(3) : "",
        vascular_right_slope_hu_per_mm: entry.summary.vascularRightSlopeHuPerMm != null ? entry.summary.vascularRightSlopeHuPerMm.toFixed(3) : "",
        vascular_average_slope_hu_per_mm: entry.summary.vascularAverageSlopeHuPerMm != null ? entry.summary.vascularAverageSlopeHuPerMm.toFixed(3) : "",
        blooming_outer_diameter_mm: entry.summary.outerDiameterMm != null ? entry.summary.outerDiameterMm.toFixed(3) : "",
        blooming_inner_diameter_mm: entry.summary.innerDiameterMm != null ? entry.summary.innerDiameterMm.toFixed(3) : "",
        blooming_percent: entry.summary.bloomingPercent != null ? entry.summary.bloomingPercent.toFixed(3) : "",
        stenosis_proximal_reference_mm: entry.summary.proximalReferenceDiameterMm != null ? entry.summary.proximalReferenceDiameterMm.toFixed(3) : "",
        stenosis_distal_reference_mm: entry.summary.distalReferenceDiameterMm != null ? entry.summary.distalReferenceDiameterMm.toFixed(3) : "",
        stenosis_reference_diameter_mm: entry.summary.referenceDiameterMm != null ? entry.summary.referenceDiameterMm.toFixed(3) : "",
        stenosis_minimal_lumen_diameter_mm: entry.summary.minimalLumenDiameterMm != null ? entry.summary.minimalLumenDiameterMm.toFixed(3) : "",
        stenosis_percent: entry.summary.stenosisPercent != null ? entry.summary.stenosisPercent.toFixed(3) : "",
        plaque_type: entry.summary.plaqueType || "",
        plaque_peak_hu: entry.summary.plaquePeakHu != null ? entry.summary.plaquePeakHu.toFixed(1) : "",
        plaque_hu: entry.summary.plaqueHu != null ? entry.summary.plaqueHu.toFixed(1) : "",
        plaque_lumen_baseline_hu: entry.summary.plaqueLumenBaselineHu != null ? entry.summary.plaqueLumenBaselineHu.toFixed(1) : "",
        plaque_amplitude_hu: entry.summary.plaqueAmplitudeHu != null ? entry.summary.plaqueAmplitudeHu.toFixed(1) : "",
        plaque_delta_hu: entry.summary.plaqueDeltaHu != null ? entry.summary.plaqueDeltaHu.toFixed(1) : "",
        plaque_fwhm_mm: entry.summary.plaqueFwhmMm != null ? entry.summary.plaqueFwhmMm.toFixed(3) : "",
        plaque_fwhm_kind: entry.summary.plaqueFwhmKind || "",
        plaque_fwhm_estimated: entry.summary.plaqueFwhmEstimated ? "yes" : "",
        plaque_half_max_hu: entry.summary.plaqueHalfMaximumHu != null ? entry.summary.plaqueHalfMaximumHu.toFixed(1) : "",
        plaque_half_min_hu: entry.summary.plaqueHalfMinimumHu != null ? entry.summary.plaqueHalfMinimumHu.toFixed(1) : "",
        plaque_lumen_fwhm_mm: entry.summary.plaqueLumenFwhmMm != null ? entry.summary.plaqueLumenFwhmMm.toFixed(3) : "",
        plaque_lumen_half_max_hu: entry.summary.plaqueLumenHalfMaximumHu != null ? entry.summary.plaqueLumenHalfMaximumHu.toFixed(1) : "",
        plaque_lumen_left_half_mm: entry.summary.plaqueLumenLeftHalfDistanceMm != null ? entry.summary.plaqueLumenLeftHalfDistanceMm.toFixed(3) : "",
        plaque_lumen_right_half_mm: entry.summary.plaqueLumenRightHalfDistanceMm != null ? entry.summary.plaqueLumenRightHalfDistanceMm.toFixed(3) : "",
        plaque_interface_side: entry.summary.plaqueInterfaceSide || "",
        plaque_interface_direction: entry.summary.plaqueInterfaceDirection || "",
        plaque_interface_width_mm: entry.summary.plaqueInterfaceWidthMm != null ? entry.summary.plaqueInterfaceWidthMm.toFixed(3) : "",
        plaque_interface_rise_10_90_mm: entry.summary.plaqueInterfaceRise10To90Mm != null ? entry.summary.plaqueInterfaceRise10To90Mm.toFixed(3) : "",
        plaque_interface_slope_hu_per_mm: entry.summary.plaqueInterfaceSlopeHuPerMm != null ? entry.summary.plaqueInterfaceSlopeHuPerMm.toFixed(3) : "",
        plaque_interface_normalized_slope_per_mm: entry.summary.plaqueInterfaceNormalizedSlopePerMm != null ? entry.summary.plaqueInterfaceNormalizedSlopePerMm.toFixed(6) : "",
        plaque_interface_normalized_slope_percent_per_mm: entry.summary.plaqueInterfaceNormalizedSlopePercentPerMm != null ? entry.summary.plaqueInterfaceNormalizedSlopePercentPerMm.toFixed(3) : "",
        plaque_interface_edge_fwhm_mm: entry.summary.plaqueInterfaceEdgeFwhmMm != null ? entry.summary.plaqueInterfaceEdgeFwhmMm.toFixed(3) : "",
        plaque_interface_peak_gradient_hu_per_mm: entry.summary.plaqueInterfacePeakGradientHuPerMm != null ? entry.summary.plaqueInterfacePeakGradientHuPerMm.toFixed(3) : "",
        plaque_interface_normalized_peak_gradient_per_mm: entry.summary.plaqueInterfaceNormalizedPeakGradientPerMm != null ? entry.summary.plaqueInterfaceNormalizedPeakGradientPerMm.toFixed(6) : "",
        plaque_interface_normalized_peak_gradient_percent_per_mm: entry.summary.plaqueInterfaceNormalizedPeakGradientPercentPerMm != null ? entry.summary.plaqueInterfaceNormalizedPeakGradientPercentPerMm.toFixed(3) : "",
        plaque_fwhm_to_lumen_fwhm_ratio: entry.summary.plaqueFwhmToLumenFwhmRatio != null ? entry.summary.plaqueFwhmToLumenFwhmRatio.toFixed(6) : "",
        plaque_edge_width_to_lumen_fwhm_ratio: entry.summary.plaqueEdgeWidthToLumenFwhmRatio != null ? entry.summary.plaqueEdgeWidthToLumenFwhmRatio.toFixed(6) : "",
        plaque_edge_fwhm_to_lumen_fwhm_ratio: entry.summary.plaqueEdgeFwhmToLumenFwhmRatio != null ? entry.summary.plaqueEdgeFwhmToLumenFwhmRatio.toFixed(6) : "",
        plaque_interface_kurtosis: entry.summary.plaqueInterfaceKurtosis != null ? entry.summary.plaqueInterfaceKurtosis.toFixed(3) : "",
        plaque_left_rise_10_90_mm: entry.summary.plaqueLeftRise10To90Mm != null ? entry.summary.plaqueLeftRise10To90Mm.toFixed(3) : "",
        plaque_left_slope_hu_per_mm: entry.summary.plaqueLeftSlopeHuPerMm != null ? entry.summary.plaqueLeftSlopeHuPerMm.toFixed(3) : "",
        plaque_left_edge_fwhm_mm: entry.summary.plaqueLeftEdgeFwhmMm != null ? entry.summary.plaqueLeftEdgeFwhmMm.toFixed(3) : "",
        plaque_right_rise_10_90_mm: entry.summary.plaqueRightRise10To90Mm != null ? entry.summary.plaqueRightRise10To90Mm.toFixed(3) : "",
        plaque_right_slope_hu_per_mm: entry.summary.plaqueRightSlopeHuPerMm != null ? entry.summary.plaqueRightSlopeHuPerMm.toFixed(3) : "",
        plaque_right_edge_fwhm_mm: entry.summary.plaqueRightEdgeFwhmMm != null ? entry.summary.plaqueRightEdgeFwhmMm.toFixed(3) : "",
        left_outer_anchor_mm: entry.summary.leftOuterAnchorMm != null ? entry.summary.leftOuterAnchorMm.toFixed(3) : "",
        left_peak_anchor_mm: entry.summary.leftPeakAnchorMm != null ? entry.summary.leftPeakAnchorMm.toFixed(3) : "",
        lumen_anchor_mm: entry.summary.lumenAnchorMm != null ? entry.summary.lumenAnchorMm.toFixed(3) : "",
        right_peak_anchor_mm: entry.summary.rightPeakAnchorMm != null ? entry.summary.rightPeakAnchorMm.toFixed(3) : "",
        right_outer_anchor_mm: entry.summary.rightOuterAnchorMm != null ? entry.summary.rightOuterAnchorMm.toFixed(3) : "",
        peak1_hu: entry.summary.peak1Hu != null ? entry.summary.peak1Hu.toFixed(1) : "",
        peak2_hu: entry.summary.peak2Hu != null ? entry.summary.peak2Hu.toFixed(1) : "",
        lumen_baseline_hu: entry.summary.lumenBaselineHu != null ? entry.summary.lumenBaselineHu.toFixed(1) : "",
        stent_fwhm_left_mm: entry.summary.stentFwhmLeftMm != null ? entry.summary.stentFwhmLeftMm.toFixed(3) : "",
        stent_fwhm_right_mm: entry.summary.stentFwhmRightMm != null ? entry.summary.stentFwhmRightMm.toFixed(3) : "",
        stent_fwhm_mean_mm: entry.summary.stentFwhmMeanMm != null ? entry.summary.stentFwhmMeanMm.toFixed(3) : "",
        lumen_fwhm_mm: entry.summary.lumenFwhmMm != null ? entry.summary.lumenFwhmMm.toFixed(3) : "",
        edge_left_rise_10_90_mm: entry.summary.edgeLeftRise10To90Mm != null ? entry.summary.edgeLeftRise10To90Mm.toFixed(3) : "",
        edge_left_slope_hu_per_mm: entry.summary.edgeLeftSlopeHuPerMm != null ? entry.summary.edgeLeftSlopeHuPerMm.toFixed(3) : "",
        edge_left_kurtosis: entry.summary.edgeLeftKurtosis != null ? entry.summary.edgeLeftKurtosis.toFixed(3) : "",
        edge_right_rise_10_90_mm: entry.summary.edgeRightRise10To90Mm != null ? entry.summary.edgeRightRise10To90Mm.toFixed(3) : "",
        edge_right_slope_hu_per_mm: entry.summary.edgeRightSlopeHuPerMm != null ? entry.summary.edgeRightSlopeHuPerMm.toFixed(3) : "",
        edge_right_kurtosis: entry.summary.edgeRightKurtosis != null ? entry.summary.edgeRightKurtosis.toFixed(3) : "",
        edge1_fwhm_mm: entry.summary.edge1FwhmMm != null ? entry.summary.edge1FwhmMm.toFixed(3) : "",
        edge1_rise_10_90_mm: entry.summary.edge1Rise10To90Mm != null ? entry.summary.edge1Rise10To90Mm.toFixed(3) : "",
        edge1_slope_hu_per_mm: entry.summary.edge1SlopeHuPerMm != null ? entry.summary.edge1SlopeHuPerMm.toFixed(3) : "",
        edge1_kurtosis: entry.summary.edge1Kurtosis != null ? entry.summary.edge1Kurtosis.toFixed(3) : "",
        edge2_fwhm_mm: entry.summary.edge2FwhmMm != null ? entry.summary.edge2FwhmMm.toFixed(3) : "",
        edge2_rise_10_90_mm: entry.summary.edge2Rise10To90Mm != null ? entry.summary.edge2Rise10To90Mm.toFixed(3) : "",
        edge2_slope_hu_per_mm: entry.summary.edge2SlopeHuPerMm != null ? entry.summary.edge2SlopeHuPerMm.toFixed(3) : "",
        edge2_kurtosis: entry.summary.edge2Kurtosis != null ? entry.summary.edge2Kurtosis.toFixed(3) : "",
        lower_slope_edge: entry.summary.lowerSlopeEdgeLabel || "",
        lower_slope_fwhm_mm: entry.summary.lowerSlopeFwhmMm != null ? entry.summary.lowerSlopeFwhmMm.toFixed(3) : "",
        lower_slope_rise_10_90_mm: entry.summary.lowerSlopeRise10To90Mm != null ? entry.summary.lowerSlopeRise10To90Mm.toFixed(3) : "",
        lower_slope_hu_per_mm: entry.summary.lowerSlopeHuPerMm != null ? entry.summary.lowerSlopeHuPerMm.toFixed(3) : "",
        lower_slope_kurtosis: entry.summary.lowerSlopeKurtosis != null ? entry.summary.lowerSlopeKurtosis.toFixed(3) : "",
      };
    });

    return { headers, rows };
  }

  function buildMeasurementsCsv(entries, studyId) {
    const table = buildMeasurementsTable(entries, studyId);
    const csvRows = table.rows.map((row) => table.headers.map((header) => row[header] ?? ""));
    return [table.headers, ...csvRows].map((row) => row.map(csvEscape).join(",")).join("\n");
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
    if (analysis?.profileFamily === "vascular_lumen_profile") {
      const vascular = analysis.vascular || null;
      return [
        `Family: vascular line profile | ${vascular?.adjustmentMode || "auto"}`,
        `FWHM lumen: ${formatMetricValue(vascular?.fwhmMm, "mm", 3)}`,
        `Left 10-90: ${formatMetricValue(vascular?.leftEdge?.riseDistanceMm, "mm", 3)} | ${formatMetricValue(vascular?.leftEdge?.slopeHuPerMm, "HU/mm", 1)}`,
        `Right 10-90: ${formatMetricValue(vascular?.rightEdge?.riseDistanceMm, "mm", 3)} | ${formatMetricValue(vascular?.rightEdge?.slopeHuPerMm, "HU/mm", 1)}`,
        `Average sharpness: ${formatMetricValue(vascular?.averageSlopeHuPerMm, "HU/mm", 1)}`,
        `Peak/background: ${formatMetricValue(vascular?.peakHu, "HU", 0)} / ${formatMetricValue(vascular?.backgroundHu, "HU", 0)}`,
      ];
    }
    if (analysis?.profileFamily === "plaque_lumen_interface" && analysis?.plaque) {
      const plaque = analysis.plaque;
      const primary = plaque.primaryInterface || null;
      const subtypeLabel = plaque.type === "non_calcified" ? "non-calcified" : "calcified";
      const targetLabel = plaque.type === "non_calcified" ? "Plaque low" : "Plaque peak";
      const interfaceLabel = plaque.type === "non_calcified" ? "90-10" : "10-90";
      const fwhmLabel = plaque.type === "non_calcified" ? "Plaque FWHMmin" : "Plaque FWHM";
      const fwhmNote = plaque.plaqueFwhmEstimated ? " to right guide" : "";
      return [
        `Family: plaque-lumen interface | ${subtypeLabel} | ${plaque.adjustmentMode || "auto"}`,
        `${targetLabel}: ${formatMetricValue(plaque.plaqueHu ?? plaque.peakHu, "HU", 0)} at ${formatMetricValue(plaque.peakDistanceMm, "mm", 2)}`,
        `Lumen baseline: ${formatMetricValue(plaque.lumenBaselineHu, "HU", 0)} | Delta ${formatMetricValue(plaque.plaqueDeltaHu ?? plaque.amplitudeHu, "HU", 0)}`,
        `Lumen FWHM: ${formatMetricValue(plaque.lumenFwhmMm, "mm", 3)} at ${formatMetricValue(plaque.lumenHalfMaximumHu, "HU", 0)}`,
        `${fwhmLabel}: ${formatMetricValue(plaque.plaqueFwhmMm, "mm", 3)}${fwhmNote} at ${formatMetricValue(plaque.halfMinimumHu ?? plaque.halfMaximumHu, "HU", 0)}`,
        `Interface: ${interfaceLabel} ${formatMetricValue(primary?.riseDistanceMm, "mm", 3)} | ${formatMetricValue(primary?.slopeHuPerMm, "HU/mm", 1)}`,
        `Normalized sharpness: ${formatMetricValue(primary?.normalizedSlopePercentPerMm, "%/mm", 1)} | Peak ${formatMetricValue(primary?.normalizedPeakGradientPercentPerMm, "%/mm", 1)}`,
        `Blooming ratios: Plaque/Lumen ${formatMetricValue(plaque.plaqueToLumenFwhmRatio, "", 3)} | Edge/Lumen ${formatMetricValue(plaque.edgeWidthToLumenFwhmRatio, "", 3)}`,
        `Edge spread: FWHM ${formatMetricValue(primary?.edgeFwhmMm, "mm", 3)} | Max gradient ${formatMetricValue(primary?.peakGradientHuPerMm, "HU/mm", 1)}`,
        `Kurtosis: ${formatMetricValue(primary?.kurtosis, "", 2)}`,
      ];
    }
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

  async function exportMeasurementsPng(entries, studyId, options) {
    const researchStudy = getSelectedExportStudyMetadata();
    const hasProfileEntries = entries.some((entry) => PROFILE_TYPES.has(entry.annotation.type));
    const tileWidth = hasProfileEntries ? 1320 : 960;
    const tileHeight = 960;
    const columns = entries.length === 1 ? 1 : entries.length <= 4 ? 2 : 3;
    const rows = Math.ceil(entries.length / columns);
    const gap = 22;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = columns * tileWidth + (columns + 1) * gap;
    exportCanvas.height = rows * tileHeight + (rows + 1) * gap;
    const ctx = exportCanvas.getContext("2d");
    ctx.fillStyle = "#05080b";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    entries.forEach((entry, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = gap + column * (tileWidth + gap);
      const y = gap + row * (tileHeight + gap);
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
        `${studyId ? `Study ${studyId} • ` : ""}${researchStudy.displayLabel ? `Research ${researchStudy.displayLabel} • ` : ""}${entry.label} • ${entry.displayName} • ${entry.annotation.plane}`,
        entry.reconstruction.label
      );
      drawOrientationLabels(ctx, x, y, tileWidth, tileHeight, getOrientationLabels(entry.annotation.frame));
      ctx.save();
      ctx.translate(x, y);
      drawMeasurementTag(ctx, entry.label);
      ctx.restore();
    });

    const filename = buildExportFilename("measurements", "png", { studyId });
    const blob = await canvasToPngBlob(exportCanvas);
    if (options?.returnFile) {
      return { filename, blob };
    }
    await downloadExportBundle([{ filename, blob }], buildExportFilename("measurements", "zip", { studyId }), {
      patientStudyId: studyId,
    });
    return { filename, blob };
  }

  async function exportMeasurementsReport(options) {
    const entries = buildMeasurementEntries();
    if (!entries.length) {
      throw new Error("Create at least one measurement first.");
    }

    const studyId = safeString(options?.studyId);
    if (!studyId) {
      throw new Error("Enter a Study ID before exporting measurements.");
    }

    const pngFile = await exportMeasurementsPng(entries, studyId, { returnFile: true });
    const table = buildMeasurementsTable(entries, studyId);
    const csv = buildMeasurementsCsv(entries, studyId);
    const csvFile = {
      filename: buildExportFilename("measurements", "csv", { studyId }),
      blob: new Blob([csv], { type: "text/csv;charset=utf-8" }),
    };
    await downloadExportBundle(
      [pngFile, csvFile],
      buildExportFilename("measurements", "zip", { studyId }),
      { patientStudyId: studyId }
    );
    const projectResult = await appendExportToActiveProject("measurements", table.headers, table.rows);
    if (projectResult?.case) {
      const existing = getMatchingProjectCase(projectResult.case.case_id) || {};
      upsertProjectCaseInState({
        ...existing,
        ...projectResult.case,
        export_count: Number(existing.export_count || 0) + 1,
        last_export_at: projectResult.exportTimestamp || "",
      });
      renderProjectCases();
    }
    const reconstructionCount = new Set(entries.map((entry) => entry.reconstruction.id)).size;
    const statusMessage =
      projectResult
        ? `Measurement ZIP exported and appended to ${projectResult.project.name} as ${projectResult.case.case_id}.`
        : `Exported ${entries.length} measurements from ${reconstructionCount} reconstruction${reconstructionCount === 1 ? "" : "s"} as a ZIP bundle with PNG and CSV for ${studyId}.`;
    if (options?.closeAfterExport) {
      clearStudy();
      setStatus(`Exported a measurement ZIP for ${studyId} and closed the current study.`);
      return;
    }
    setStatus(statusMessage);
  }

  function mapWorldPointBetweenFrames(sourceFrame, targetFrame, worldPoint) {
    const coordinates = worldToPlaneCoordinates(sourceFrame, worldPoint);
    return addVectors(
      addVectors(targetFrame.centerWorld, scaleVector(targetFrame.uWorld, coordinates.xMm)),
      scaleVector(targetFrame.vWorld, coordinates.yMm)
    );
  }

  function copySelectedAnnotation() {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      throw new Error("Load a reconstruction first.");
    }

    const annotation = getSelectedAnnotation();
    if (!annotation) {
      throw new Error("Select an annotation first.");
    }

    state.annotationClipboard = {
      annotation: cloneAnnotation(annotation),
      sourceLabel: getAnnotationDisplayName(annotation, reconstruction),
    };
    setStatus(`${state.annotationClipboard.sourceLabel || "Annotation"} copied. Switch series or slice and paste when ready.`);
  }

  function buildPastedAnnotationForFrame(sourceAnnotation, targetFrame, viewportId) {
    const annotation = cloneAnnotation(sourceAnnotation);
    annotation.id = state.annotationSequence++;
    annotation.frame = cloneFrame(targetFrame);
    annotation.plane = targetFrame.plane;
    annotation.viewContext = createAnnotationViewContext(targetFrame, { viewportId });
    annotation.worldPoints = (sourceAnnotation.worldPoints || []).map((point) =>
      mapWorldPointBetweenFrames(sourceAnnotation.frame, targetFrame, point)
    );
    if (Array.isArray(sourceAnnotation.diameterLines)) {
      annotation.diameterLines = sourceAnnotation.diameterLines.map((line) => ({
        ...line,
        frame: cloneFrame(targetFrame),
        plane: targetFrame.plane,
        viewContext: createAnnotationViewContext(targetFrame, { viewportId }),
        worldPoints: (line.worldPoints || []).map((point) =>
          mapWorldPointBetweenFrames(line.frame || sourceAnnotation.frame, targetFrame, point)
        ),
      }));
      annotation.worldPoints = annotation.diameterLines.flatMap((line) => line.worldPoints || []);
    }
    return annotation;
  }

  function pasteCopiedAnnotation() {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      throw new Error("Load a reconstruction first.");
    }

    const sourceAnnotation = state.annotationClipboard?.annotation;
    if (!sourceAnnotation) {
      throw new Error("Copy an annotation first.");
    }

    const frame = state.viewports[state.activeViewportId]?.lastFrame || getViewportFrame(state.activeViewportId, reconstruction);
    if (!frame) {
      throw new Error("The active viewport is not ready yet.");
    }

    const annotation = buildPastedAnnotationForFrame(sourceAnnotation, frame, state.activeViewportId);
    addAnnotation(annotation);
    setStatus(`${getAnnotationDisplayName(annotation, reconstruction)} pasted into ${reconstruction.label}.`);
  }

  function translateAnnotationInPlane(annotation, sourceAnnotation, deltaXmm, deltaYmm) {
    if (sourceAnnotation.type === "brushRoi" && sourceAnnotation.mask) {
      annotation.mask = cloneBrushMask(sourceAnnotation.mask);
      annotation.mask.originXmm += deltaXmm;
      annotation.mask.originYmm += deltaYmm;
      annotation.worldPoints = sourceAnnotation.worldPoints.map((point) =>
        addVectors(
          point,
          addVectors(
            scaleVector(sourceAnnotation.frame.uWorld, deltaXmm),
            scaleVector(sourceAnnotation.frame.vWorld, deltaYmm)
          )
        )
      );
      return;
    }
    if (sourceAnnotation.type === "squareProfile") {
      const sourceBox = getSquareProfilePlaneBox(sourceAnnotation);
      setSquareProfileBox(annotation, {
        centerXmm: sourceBox.centerXmm + deltaXmm,
        centerYmm: sourceBox.centerYmm + deltaYmm,
        widthMm: sourceBox.widthMm,
        heightMm: sourceBox.heightMm,
        angleDegrees: sourceBox.angleDegrees,
      });
      return;
    }
    if (isMultiDiameterAnnotationType(sourceAnnotation.type)) {
      const translation = addVectors(
        scaleVector(sourceAnnotation.frame.uWorld, deltaXmm),
        scaleVector(sourceAnnotation.frame.vWorld, deltaYmm)
      );
      annotation.diameterLines = getDiameterAnnotationLines(sourceAnnotation).map((line) => ({
        ...line,
        worldPoints: line.worldPoints.map((point) => addVectors(point, translation)),
      }));
      annotation.worldPoints = annotation.diameterLines.flatMap((line) => line.worldPoints);
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
    const angleRadians = sourceBox.angleRadians;
    const dragged = { xMm: planePoint.xMm, yMm: planePoint.yMm };
    const opposite = corners[oppositeIndex];
    const draggedRelative = {
      xMm: dragged.xMm - sourceBox.centerXmm,
      yMm: dragged.yMm - sourceBox.centerYmm,
    };
    const oppositeRelative = {
      xMm: opposite.xMm - sourceBox.centerXmm,
      yMm: opposite.yMm - sourceBox.centerYmm,
    };
    const draggedLocal = rotatePlanePoint(draggedRelative, -angleRadians);
    const oppositeLocal = rotatePlanePoint(oppositeRelative, -angleRadians);
    const centerLocal = {
      xMm: (draggedLocal.xMm + oppositeLocal.xMm) / 2,
      yMm: (draggedLocal.yMm + oppositeLocal.yMm) / 2,
    };
    const centerOffset = rotatePlanePoint(centerLocal, angleRadians);
    setSquareProfileBox(annotation, {
      centerXmm: sourceBox.centerXmm + centerOffset.xMm,
      centerYmm: sourceBox.centerYmm + centerOffset.yMm,
      widthMm: Math.abs(draggedLocal.xMm - oppositeLocal.xMm),
      heightMm: Math.abs(draggedLocal.yMm - oppositeLocal.yMm),
      angleDegrees: sourceBox.angleDegrees,
    });
  }

  function deleteSelectedAnnotation(options) {
    const reconstruction = getActiveReconstruction();
    const annotation = getSelectedAnnotation();
    if (!reconstruction || !annotation) {
      return false;
    }

    if (!options?.skipHistory) {
      captureUndoSnapshot();
    }
    reconstruction.annotations = reconstruction.annotations.filter((item) => item.id !== annotation.id);
    if (state.selectedProfileAnnotationId === annotation.id) {
      state.selectedProfileAnnotationId = null;
    }
    state.selectedAnnotationId = null;
    updateSidebarUi();
    requestRenderAll();
    setStatus("Annotation deleted.");
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

    captureUndoSnapshot();
    let updatedCount = 0;
    const plaqueProfileCount = sourceMeasurements.filter((annotation) => isPlaqueProfileAnnotation(annotation)).length;
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

    updateSidebarUi();
    requestRenderAll();
    setStatus(
      `Copied ${sourceMeasurements.length} measurement${sourceMeasurements.length === 1 ? "" : "s"} from ${sourceReconstruction.label} to ${updatedCount} other reconstruction${updatedCount === 1 ? "" : "s"}.${plaqueProfileCount ? " Plaque profile guide cutoffs will auto-fit independently in each reconstruction." : ""}`
    );
  }

  function clearMeasurements() {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return;
    }
    if (!reconstruction.annotations.length) {
      return;
    }
    captureUndoSnapshot();
    state.dragging = null;
    state.polygonDraft = null;
    state.diameterDraft = null;
    reconstruction.annotations = [];
    state.selectedAnnotationId = null;
    state.selectedProfileAnnotationId = null;
    updateSidebarUi();
    updateViewportCursors();
    requestRenderAll();
  }

  function clearStudy() {
    stopCine();
    if (state.projectSession.autosaveTimerId) {
      window.clearTimeout(state.projectSession.autosaveTimerId);
      state.projectSession.autosaveTimerId = null;
    }
    state.reconstructions = [];
    state.sourceRecords = [];
    state.activeReconId = null;
    state.referenceBasis = null;
    state.dragging = null;
    state.polygonDraft = null;
    state.diameterDraft = null;
    state.annotationClipboard = null;
    state.selectedAnnotationId = null;
    state.selectedProfileAnnotationId = null;
    state.annotationSequence = 1;
    state.mpr.centerWorld = null;
    state.mpr.overlayVisible = true;
    state.mpr.rotations = {
      axial: 0,
      coronal: 0,
      sagittal: 0,
    };
    state.mpr.planeNormals = null;
    state.maximizedViewportId = null;
    if (!state.voiPresets[state.currentPreset]) {
      state.currentPreset = null;
    }
    saveVoiPresetSettings();
    state.projectSession.pending = false;
    state.projectSession.saving = false;
    resetHistory();
    setActiveViewport("presentation");
    resetViewportTransforms();
    updateComparisonUi();
    updateEmptyState();
    updateSidebarUi();
    requestRenderAll();
    setStatus("Ready for a DICOM stack");
  }

  function readDicomHeaderBuffer(file, byteLimit) {
    if (Number.isFinite(byteLimit) && file.size > byteLimit && typeof file.slice === "function") {
      return file.slice(0, byteLimit).arrayBuffer();
    }
    return file.arrayBuffer();
  }

  async function parseDicomHeader(file) {
    let lastError = null;
    for (const byteLimit of DICOM_HEADER_READ_LIMITS) {
      try {
        const buffer = await readDicomHeaderBuffer(file, byteLimit);
      const byteArray = new Uint8Array(buffer);
      const dataSet = dicomParser.parseDicom(byteArray, { untilTag: "x7fe00010" });
      const imageOrientationPatient = parseNumericArray(dataSet.string("x00200037"));
      const pixelDataElement = dataSet.elements.x7fe00010 || dataSet.elements.x7fe00008;
      const isPartialRead = Number.isFinite(byteLimit) && file.size > byteLimit;
      if (!pixelDataElement && isPartialRead) {
        continue;
      }
      const reportInsights = extractReportInsights(buffer, Boolean(pixelDataElement));
      const patientSizeM = parseFirstNumber(dataSet.string("x00101020"));
      const patientWeightKg = parseFirstNumber(dataSet.string("x00101030"));

      return {
        file,
        sourceKey: getFileSourceKey(file),
        sopClassUID: safeString(dataSet.string("x00080016")),
        transferSyntaxUID: safeString(dataSet.string("x00020010")),
        patientName: prettifyPatientName(dataSet.string("x00100010")),
        patientId: safeString(dataSet.string("x00100020")),
        patientBirthDate: safeString(dataSet.string("x00100030")),
        patientSex: safeString(dataSet.string("x00100040")),
        patientAge: safeString(dataSet.string("x00101010")),
        patientSizeM,
        patientWeightKg,
        patientBmi: computeBodyMassIndex(patientWeightKg, patientSizeM),
        accessionNumber: safeString(dataSet.string("x00080050")),
        studyDate: safeString(dataSet.string("x00080020")),
        studyTime: safeString(dataSet.string("x00080030")),
        seriesDate: safeString(dataSet.string("x00080021")),
        seriesTime: safeString(dataSet.string("x00080031")),
        acquisitionDate: safeString(dataSet.string("x00080022")),
        acquisitionTime: safeString(dataSet.string("x00080032")),
        contentDate: safeString(dataSet.string("x00080023")),
        contentTime: safeString(dataSet.string("x00080033")),
        modality: safeString(dataSet.string("x00080060")),
        manufacturer: safeString(dataSet.string("x00080070")),
        institutionName: safeString(dataSet.string("x00080080")),
        stationName: safeString(dataSet.string("x00081010")),
        studyDescription: safeString(dataSet.string("x00081030")),
        seriesDescription: safeString(dataSet.string("x0008103e")),
        manufacturerModelName: safeString(dataSet.string("x00081090")),
        softwareVersions: safeString(dataSet.string("x00181020")),
        protocolName: safeString(dataSet.string("x00181030")),
        contrastBolusAgent: safeString(dataSet.string("x00180010")),
        bodyPartExamined: safeString(dataSet.string("x00180015")),
        studyInstanceUID: safeString(dataSet.string("x0020000d")),
        seriesInstanceUID: safeString(dataSet.string("x0020000e")),
        studyId: safeString(dataSet.string("x00200010")),
        seriesNumber: readDicomNumber(dataSet, "x00200011"),
        acquisitionNumber: readDicomNumber(dataSet, "x00200012"),
        frameOfReferenceUID: safeString(dataSet.string("x00200052")),
        instanceNumber: readDicomNumber(dataSet, "x00200013"),
        imageType: safeString(dataSet.string("x00080008")),
        numberOfFrames: readDicomNumber(dataSet, "x00280008"),
        rows: readDicomNumber(dataSet, "x00280010"),
        columns: readDicomNumber(dataSet, "x00280011"),
        samplesPerPixel: readDicomNumber(dataSet, "x00280002"),
        bitsAllocated: readDicomNumber(dataSet, "x00280100"),
        pixelRepresentation: readDicomNumber(dataSet, "x00280103"),
        pixelDataOffset: Number.isFinite(pixelDataElement?.dataOffset) ? pixelDataElement.dataOffset : null,
        pixelDataLength: Number.isFinite(pixelDataElement?.length) ? pixelDataElement.length : null,
        pixelDataHasFragments: Boolean(pixelDataElement?.fragments?.length),
        pixelSpacing: parseNumericArray(dataSet.string("x00280030")),
        sliceThickness: parseFirstNumber(dataSet.string("x00180050")),
        spacingBetweenSlices: parseFirstNumber(dataSet.string("x00180088")),
        kvp: parseFirstNumber(dataSet.string("x00180060")),
        dataCollectionDiameter: parseFirstNumber(dataSet.string("x00180090")),
        reconstructionDiameter: parseFirstNumber(dataSet.string("x00181100")),
        distanceSourceToDetector: parseFirstNumber(dataSet.string("x00181110")),
        distanceSourceToPatient: parseFirstNumber(dataSet.string("x00181111")),
        gantryDetectorTilt: parseFirstNumber(dataSet.string("x00181120")),
        tableHeight: parseFirstNumber(dataSet.string("x00181130")),
        tableTraverse: parseFirstNumber(dataSet.string("x00181131")),
        rotationDirection: safeString(dataSet.string("x00181140")),
        exposureTimeMs: parseFirstNumber(dataSet.string("x00181150")),
        tubeCurrentMa: parseFirstNumber(dataSet.string("x00181151")),
        exposureMas: parseFirstNumber(dataSet.string("x00181152")),
        filterType: safeString(dataSet.string("x00181160")),
        focalSpots: safeString(dataSet.string("x00181190")),
        convolutionKernel: safeString(dataSet.string("x00181210")),
        patientPosition: safeString(dataSet.string("x00185100")),
        singleCollimationWidth: parseFirstNumber(dataSet.string("x00189306")),
        totalCollimationWidth: parseFirstNumber(dataSet.string("x00189307")),
        revolutionTimeSec: parseFirstNumber(dataSet.string("x00189305")),
        tableFeedPerRotation: parseFirstNumber(dataSet.string("x00189310")),
        spiralPitchFactor: parseFirstNumber(dataSet.string("x00189311")),
        ctdiVolMgy: parseFirstNumber(dataSet.string("x00189345")),
        contrastBolusRoute: safeString(dataSet.string("x00181040")),
        contrastBolusVolumeMl: parseFirstNumber(dataSet.string("x00181041")),
        contrastBolusStartTime: safeString(dataSet.string("x00181042")),
        contrastBolusStopTime: safeString(dataSet.string("x00181043")),
        contrastBolusTotalDose: parseFirstNumber(dataSet.string("x00181044")),
        contrastFlowRateMlPerS: parseFirstNumber(dataSet.string("x00181046")),
        contrastFlowDurationSec: parseFirstNumber(dataSet.string("x00181047")),
        contrastIngredient: safeString(dataSet.string("x00181048")),
        contrastIngredientConcentrationMgMl: parseFirstNumber(dataSet.string("x00181049")),
        imagePositionPatient: parseNumericArray(dataSet.string("x00200032")),
        imageOrientationPatient,
        rowDirection: normalize(imageOrientationPatient.slice(0, 3)),
        columnDirection: normalize(imageOrientationPatient.slice(3, 6)),
        normalVector: getNormalVector(imageOrientationPatient),
        sliceLocation: parseFirstNumber(dataSet.string("x00201041")),
        windowCenter: parseFirstNumber(dataSet.string("x00281050")),
        windowWidth: parseFirstNumber(dataSet.string("x00281051")),
        rescaleIntercept: parseFirstNumber(dataSet.string("x00281052")),
        rescaleSlope: parseFirstNumber(dataSet.string("x00281053")),
        reportTextSummary: reportInsights.textSummary,
        reportRadiationSnippet: reportInsights.radiationSnippet,
        reportContrastSnippet: reportInsights.contrastSnippet,
        reportCtdiVolMgy: reportInsights.ctdiVolMgy,
        reportDlpMgyCm: reportInsights.dlpMgyCm,
        reportContrastVolumeMl: reportInsights.contrastVolumeMl,
        reportContrastFlowRateMlPerS: reportInsights.contrastFlowRateMlPerS,
        hasPixelData: Boolean(pixelDataElement),
      };
      } catch (error) {
        lastError = error;
        if (!Number.isFinite(byteLimit) || file.size <= byteLimit) {
          break;
        }
      }
    }
    throw lastError || new Error("The DICOM header could not be parsed.");
  }

  async function parseDicomFiles(files, options = {}) {
    const sourceFiles = Array.from(files || []);
    const parsed = new Array(sourceFiles.length);
    const concurrency = Math.min(sourceFiles.length || 1, options.concurrency || DICOM_HEADER_PARSE_CONCURRENCY);
    let nextIndex = 0;
    let completed = 0;
    let lastYieldAt = 0;
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const profile = options.profile?.enabled ? options.profile : null;

    if (!options.disableWorkerParsing && typeof window.HAGRadCore?.parseDicomHeadersInWorker === "function") {
      const workerRecords = await window.HAGRadCore.parseDicomHeadersInWorker(sourceFiles, {
        byteLimits: DICOM_HEADER_READ_LIMITS,
        concurrency,
        onProgress,
        profile,
      });
      if (Array.isArray(workerRecords)) {
        profile?.count("headerRecords", workerRecords.length);
        return workerRecords;
      }
    }

    const finishMainThreadParse = profile?.start("headerMainThreadParse", { fileCount: sourceFiles.length, concurrency });
    async function worker() {
      while (nextIndex < sourceFiles.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        try {
          parsed[currentIndex] = await parseDicomHeader(sourceFiles[currentIndex]);
        } catch (error) {
          parsed[currentIndex] = null;
        } finally {
          completed += 1;
          if (onProgress && (completed === sourceFiles.length || completed % DICOM_HEADER_PROGRESS_INTERVAL === 0)) {
            onProgress(completed, sourceFiles.length);
          }
          if (completed - lastYieldAt >= DICOM_HEADER_PROGRESS_INTERVAL) {
            lastYieldAt = completed;
            await waitForAnimationFrame();
          }
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));
    const records = parsed.filter(Boolean);
    profile?.count("headerRecords", records.length);
    finishMainThreadParse?.({ parsedCount: records.length });
    return records;
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
        appendSourceDirectoryToKey(
          record.seriesInstanceUID ||
            `${record.seriesDescription || "unnamed-series"}::${record.frameOfReferenceUID || "unknown-for"}`,
          record
        );
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

  async function decodePixelDataWithCornerstone(record, options) {
    const profile = options?.profile?.enabled ? options.profile : null;
    initializeDecoderFallback();
    if (!state.decoderFallbackReady) {
      throw new Error("Compressed DICOM decoding is not available in this viewer build.");
    }

    const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(record.file);
    try {
      const finishDecode = profile?.start("pixelDecodeTypedArray", { mode: "cornerstone" });
      const image = await cornerstone.loadAndCacheImage(imageId);
      const pixelData = image.getPixelData?.();
      if (!pixelData || !Number.isFinite(image.rows) || !Number.isFinite(image.columns)) {
        throw new Error("The selected file could not be decoded into image pixels.");
      }
      if (image.color) {
        throw new Error("Only monochrome DICOM images are supported.");
      }

      finishDecode?.({
        rows: image.rows,
        columns: image.columns,
        sampleCount: pixelData.length,
      });
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

  async function parsePixelDataFromStoredRange(record, options) {
    const transferSyntaxUID = safeString(record?.transferSyntaxUID);
    const profile = options?.profile?.enabled ? options.profile : null;

    if (Number.isFinite(record.numberOfFrames) && record.numberOfFrames > 1) {
      throw new Error("Multi-frame DICOM is not supported in this local MPR viewer yet.");
    }
    if (
      !DIRECT_PIXEL_TRANSFER_SYNTAXES.has(transferSyntaxUID || "") ||
      record?.pixelDataHasFragments ||
      !Number.isFinite(record?.pixelDataOffset)
    ) {
      return null;
    }

    const rows = record.rows;
    const columns = record.columns;
    const samplesPerPixel = record.samplesPerPixel || 1;
    const bitsAllocated = record.bitsAllocated || 16;
    const pixelRepresentation = record.pixelRepresentation || 0;
    if (samplesPerPixel !== 1) {
      throw new Error("Only monochrome DICOM images are supported.");
    }
    if (!Number.isFinite(rows) || !Number.isFinite(columns)) {
      return null;
    }

    const sampleCount = rows * columns;
    const bytesPerSample = bitsAllocated === 16 ? 2 : bitsAllocated === 8 ? 1 : 0;
    if (!bytesPerSample) {
      throw new Error(`Unsupported Bits Allocated value: ${bitsAllocated}`);
    }
    const expectedBytes = sampleCount * bytesPerSample;
    if (Number.isFinite(record.pixelDataLength) && record.pixelDataLength < expectedBytes) {
      return null;
    }

    const finishRead = profile?.start("pixelPayloadRead", { mode: "directRange", bytes: expectedBytes });
    const buffer = await record.file.slice(record.pixelDataOffset, record.pixelDataOffset + expectedBytes).arrayBuffer();
    finishRead?.({ byteLength: buffer.byteLength });
    if (buffer.byteLength < expectedBytes) {
      return null;
    }

    let pixels;
    const finishDecode = profile?.start("pixelDecodeTypedArray", {
      mode: "directRange",
      bitsAllocated,
      sampleCount,
    });
    if (bitsAllocated === 16) {
      pixels = pixelRepresentation === 1 ? new Int16Array(buffer, 0, sampleCount) : new Uint16Array(buffer, 0, sampleCount);
    } else {
      const view = pixelRepresentation === 1 ? new Int8Array(buffer, 0, sampleCount) : new Uint8Array(buffer, 0, sampleCount);
      pixels = pixelRepresentation === 1 ? new Int16Array(sampleCount) : new Uint16Array(sampleCount);
      for (let index = 0; index < sampleCount; index += 1) {
        pixels[index] = view[index];
      }
    }
    finishDecode?.({ typedArray: pixels.constructor?.name || "" });

    return {
      rows,
      columns,
      pixels,
      slope: record.rescaleSlope ?? 1,
      intercept: record.rescaleIntercept ?? 0,
    };
  }

  async function parsePixelData(record, options) {
    const profile = options?.profile?.enabled ? options.profile : null;
    const directSlice = await parsePixelDataFromStoredRange(record, options);
    if (directSlice) {
      profile?.count("pixelDirectRangeSlices", 1);
      return directSlice;
    }

    const finishRead = profile?.start("pixelPayloadRead", { mode: "fullFile" });
    const buffer = await record.file.arrayBuffer();
    finishRead?.({ byteLength: buffer.byteLength });
    const finishDecode = profile?.start("pixelDecodeTypedArray", { mode: "fullFile" });
    const byteArray = new Uint8Array(buffer);
    const dataSet = dicomParser.parseDicom(byteArray);
    const transferSyntaxUID = safeString(dataSet.string("x00020010"));

    if (Number.isFinite(record.numberOfFrames) && record.numberOfFrames > 1) {
      throw new Error("Multi-frame DICOM is not supported in this local MPR viewer yet.");
    }

    const rows = readDicomNumber(dataSet, "x00280010");
    const columns = readDicomNumber(dataSet, "x00280011");
    const samplesPerPixel = readDicomNumber(dataSet, "x00280002") || 1;
    const bitsAllocated = readDicomNumber(dataSet, "x00280100") || 16;
    const pixelRepresentation = readDicomNumber(dataSet, "x00280103") || 0;
    const pixelDataElement = dataSet.elements.x7fe00010;

    if (!SUPPORTED_TRANSFER_SYNTAXES.has(transferSyntaxUID || "") || pixelDataElement?.fragments?.length) {
      finishDecode?.({ fallback: "cornerstone" });
      profile?.count("pixelCornerstoneSlices", 1);
      return decodePixelDataWithCornerstone(record, options);
    }

    if (samplesPerPixel !== 1) {
      throw new Error("Only monochrome DICOM images are supported.");
    }

    if (!pixelDataElement || !Number.isFinite(rows) || !Number.isFinite(columns)) {
      finishDecode?.({ fallback: "cornerstone" });
      profile?.count("pixelCornerstoneSlices", 1);
      return decodePixelDataWithCornerstone(record, options);
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
    finishDecode?.({
      bitsAllocated,
      sampleCount,
      typedArray: pixels.constructor?.name || "",
    });
    profile?.count("pixelFullFileSlices", 1);

    return {
      rows,
      columns,
      pixels,
      slope: readDicomNumber(dataSet, "x00281053") ?? record.rescaleSlope ?? 1,
      intercept: readDicomNumber(dataSet, "x00281052") ?? record.rescaleIntercept ?? 0,
    };
  }

  async function buildVolume(records, options) {
    const profile = options?.profile?.enabled ? options.profile : null;
    const finishVolume = profile?.start("volumeConstruction", { sliceCount: records.length });
    const workerPayload = await buildDicomVolumeInWorker?.(records, {
      profile,
      disableVolumeWorker: options?.disableVolumeWorker,
      spacingFallback: 1,
      statusCallback(current, total) {
        if (current === 1 || current === total || current % 10 === 0) {
          setStatus(`Loading volume ${current} / ${total}...`);
        }
      },
    });
    const workerVolume = createVolumeFromWorkerPayload?.(workerPayload, records, { includeUnits: false });
    if (workerVolume) {
      finishVolume?.({ decodedSlices: workerVolume.depth, skippedCount: workerVolume.skippedCount });
      return workerVolume;
    }

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
        slice = await parsePixelData(records[index], options);
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
      profile?.count("decodedSlices", 1);
      if ((index + 1) % 8 === 0) {
        await waitForAnimationFrame();
      }
    }

    if (!slices.length) {
      finishVolume?.({ decodedSlices: 0, skippedCount });
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

    const volume = {
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
    profile?.count("skippedSlices", skippedCount);
    finishVolume?.({ decodedSlices: slices.length, skippedCount });
    return volume;
  }

  function makeReconstructionId(seriesKey, offset) {
    return `${sanitizeFilePart(seriesKey, "series")}_${offset}`;
  }

  function buildReconstructionLabel(records, offset) {
    const first = records[0];
    const base = first.seriesDescription || `Series ${offset + 1}`;
    return base;
  }

  function isSameStudyAsLoadedStudy(record) {
    const existing = state.reconstructions[0]?.records?.[0];
    return isSamePatientStudy(existing, record);
  }

  async function loadReconstructionsFromFiles(fileList, options) {
    const profile = window.HAGRadCore?.createLoadProfiler?.("DICOM load", {
      workflow: "viewer",
      mode: options?.append ? "append" : "replace",
    });
    const finishEnumeration = profile?.start("fileEnumeration");
    const files = Array.from(fileList || []).filter((file) => file.size > 0);
    finishEnumeration?.({ fileCount: files.length });
    if (!files.length) {
      return;
    }

    stopCine();
    resetHistory();
    setStatus(`Reading ${files.length} files...`);
    const finishHeaderParse = profile?.start("dicomHeaderParse", { fileCount: files.length });
    const records = await parseDicomFiles(files, {
      onProgress(done, total) {
        setStatus(`Reading DICOM headers ${done} / ${total}...`);
      },
      profile,
    });
    finishHeaderParse?.({ recordCount: records.length });
    if (!records.length) {
      throw new Error("No readable DICOM files were found.");
    }

    const finishGrouping = profile?.start("seriesGrouping", { recordCount: records.length });
    const groups = groupSeries(records);
    finishGrouping?.({ groupCount: groups.length });
    const existingKeys = new Set(state.reconstructions.map((reconstruction) => reconstruction.seriesKey));
    const nextReconstructions = [];
    let skippedDifferentStudy = 0;
    let skippedDuplicateSeries = 0;
    let skippedUnreadableSeries = 0;
    let skippedFiles = 0;

    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      if (!group.pixelCount) {
        continue;
      }

      const imageRecords = group.records.filter((record) => record.hasPixelData);
      if (!imageRecords.length) {
        continue;
      }

      if (options?.append && !isSameStudyAsLoadedStudy(imageRecords[0])) {
        skippedDifferentStudy += 1;
        continue;
      }

      if (options?.append && existingKeys.has(group.key)) {
        skippedDuplicateSeries += 1;
        continue;
      }

      let volume;
      try {
        volume = await buildVolume(imageRecords, { profile });
      } catch (error) {
        skippedUnreadableSeries += 1;
        console.warn("Skipping unreadable DICOM series.", error);
        continue;
      }
      skippedFiles += volume.skippedCount || 0;
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
      if (options?.append && skippedDifferentStudy) {
        throw new Error("The added reconstruction files belong to a different study or patient. Clear the study first if you want to switch patients.");
      }
      if (options?.append && skippedDuplicateSeries) {
        throw new Error("Those reconstruction series are already loaded.");
      }
      throw new Error("No usable reconstructions were found in the selected files.");
    }

    if (!options?.append) {
      state.reconstructions = [];
      state.sourceRecords = [];
      state.referenceBasis = null;
      state.annotationSequence = 1;
      state.annotationClipboard = null;
      state.selectedAnnotationId = null;
      state.selectedProfileAnnotationId = null;
    }

    state.reconstructions.push(...nextReconstructions);
    state.sourceRecords = mergeSourceRecords(state.sourceRecords, records);
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
      const notes = [];
      if (skippedUnreadableSeries) {
        notes.push(`${skippedUnreadableSeries} unreadable series skipped`);
      }
      if (skippedFiles) {
        notes.push(`${skippedFiles} file${skippedFiles === 1 ? "" : "s"} skipped during decoding`);
      }
      const loadedMessage = `Added ${nextReconstructions.length} reconstruction${nextReconstructions.length === 1 ? "" : "s"}.`;
      setStatus(notes.length ? `${loadedMessage} ${notes.join("; ")}.` : loadedMessage, notes.length ? "warning" : null);
    } else {
      setActiveReconstruction(state.reconstructions[0].id);
      state.currentVOI = determineInitialVoi(state.reconstructions[0].records);
      if (!state.voiPreferenceLoaded) {
        state.currentPreset = null;
        state.currentPresetDirty = false;
      }
      updateSidebarUi();
      const notes = [];
      if (skippedUnreadableSeries) {
        notes.push(`${skippedUnreadableSeries} unreadable series skipped`);
      }
      if (skippedFiles) {
        notes.push(`${skippedFiles} file${skippedFiles === 1 ? "" : "s"} skipped during decoding`);
      }
      const loadedMessage = `Loaded ${state.reconstructions.length} reconstruction${state.reconstructions.length === 1 ? "" : "s"} for this patient.`;
      setStatus(notes.length ? `${loadedMessage} ${notes.join("; ")}.` : loadedMessage, notes.length ? "warning" : null);
    }

    if (!options?.append) {
      scheduleProjectDuplicateCheck({ immediate: true });
      try {
        const restored = await restoreProjectSessionFromBackend(state.projectCaseId, { silent: true });
        if (restored) {
          setStatus(`Loaded ${state.reconstructions.length} reconstruction${state.reconstructions.length === 1 ? "" : "s"} and restored the saved workspace for ${getCurrentProjectCaseId()}.`);
        }
      } catch (error) {
        console.error(error);
      }
    } else {
      requestProjectSessionAutosave();
    }

    if (isComparisonActive()) {
      seedComparisonTiles();
      state.uiCache.comparisonLayer = "";
      updateComparisonUi();
    } else {
      clearInvalidComparisonAssignments();
    }

    updateEmptyState();
    requestRenderAll();
    profile?.sampleMemory("afterVolumeConstruction");
    const finishFirstRender = profile?.start("firstRenderAfterVolumeCompletion", {
      reconstructionCount: state.reconstructions.length,
    });
    window.requestAnimationFrame(() => {
      finishFirstRender?.();
      profile?.sampleMemory("afterFirstRender");
      profile?.finish({
        loadedReconstructions: nextReconstructions.length,
        totalReconstructions: state.reconstructions.length,
      });
    });
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
        ...createAnnotationBase("freehandRoi", state.polygonDraft.frame, {
          layout: state.polygonDraft.viewContext?.layout,
          viewportId: state.polygonDraft.viewportId,
        }),
        viewContext: cloneAnnotationViewContext(state.polygonDraft.viewContext),
        roiSourceTool: sourceTool,
        worldPoints: points,
      });
    }

    state.polygonDraft = null;
    requestRenderViewports(getViewportIdsForPlane(getViewportPlane(viewportId)), { readouts: false });
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
    if (!annotation || !(chartState?.profile?.stent || chartState?.profile?.plaque || chartState?.profile?.vascular) || !hit) {
      return;
    }

    event.preventDefault();
    els.profileChart.setPointerCapture?.(event.pointerId);
    state.dragging = {
      type: "profileGuide",
      pointerId: event.pointerId,
      annotationId: annotation.id,
      guideKey: hit.key,
      guideKind: hit.kind,
      historyCaptured: false,
    };
    els.profileChart.style.cursor = "ew-resize";
  }

  function handleViewportPointerMovePreview(event) {
    if (state.dragging?.type === "freehandRoi") {
      return;
    }

    if (!state.polygonDraft || state.activeToolKey !== "segmentationRoi") {
      if (state.activeToolKey === "eraser") {
        const viewportId = event.currentTarget.dataset.viewportId;
        setHoveredAnnotation(null, getViewportPlane(viewportId));
        updateEraserPreview(viewportId, event.clientX, event.clientY);
        requestRenderViewports(getViewportIdsForPlane(getViewportPlane(viewportId)), { readouts: false });
      }
      if (state.activeToolKey === "edit" && !state.dragging) {
        const viewportId = event.currentTarget.dataset.viewportId;
        const viewportState = state.viewports[viewportId];
        const hit = getAnnotationHit(viewportId, event.clientX, event.clientY);
        setHoveredAnnotation(hit?.annotation?.id || null, hit?.annotation?.plane || getViewportPlane(viewportId));
        viewportState.canvas.style.cursor =
          hit?.mode === "move" || hit?.mode === "label"
            ? "move"
            : hit?.mode === "circleRadius"
              ? "ew-resize"
            : hit?.mode === "point" || hit?.mode === "roiVertex" || hit?.mode === "squareCorner"
              ? "crosshair"
              : hit?.mode === "squareRotate"
                ? "alias"
              : "default";
        return;
      }
      if (state.activeToolKey === "circularRoi" && !state.dragging) {
        const viewportId = event.currentTarget.dataset.viewportId;
        const viewportState = state.viewports[viewportId];
        const hit = getAnnotationHit(viewportId, event.clientX, event.clientY);
        setHoveredAnnotation(hit?.annotation?.id || null, hit?.annotation?.plane || getViewportPlane(viewportId));
        viewportState.canvas.style.cursor =
          hit?.annotation && isCircularRoiAnnotation(hit.annotation)
            ? hit.mode === "circleRadius"
              ? "ew-resize"
              : "move"
            : "crosshair";
        return;
      }
      if (isMprNavigationAvailable() && !state.dragging) {
        const viewportId = event.currentTarget.dataset.viewportId;
        const viewportState = state.viewports[viewportId];
        const hit = getMprOverlayHit(viewportId, event.clientX, event.clientY);
        if (hit || state.activeToolKey === "mprCursor") {
          setHoveredAnnotation(null, getViewportPlane(viewportId));
          viewportState.canvas.style.cursor = hit?.type === "line" ? "alias" : hit?.type === "center" ? "move" : "grab";
          return;
        }
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
    requestRenderViewports(getViewportIdsForPlane(getViewportPlane(viewportId)), { readouts: false });
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
        viewContext: createAnnotationViewContext(frame, { viewportId }),
        sourceTool: state.activeToolKey,
        worldPoints: [worldPoint],
        hoverWorld: worldPoint,
      };
    } else if (!pointsAreNear(state.polygonDraft.worldPoints[state.polygonDraft.worldPoints.length - 1], worldPoint, 0.5)) {
      state.polygonDraft.worldPoints.push(worldPoint);
      state.polygonDraft.hoverWorld = worldPoint;
    }

    requestRenderViewports(getViewportIdsForPlane(frame.plane), { readouts: false });
  }

  function handleViewportDoubleClick(event) {
    const viewportId = event.currentTarget.dataset.viewportId;
    if (state.activeToolKey === "edit") {
      const hit = getAnnotationHit(viewportId, event.clientX, event.clientY);
      const annotation = hit?.annotation || getSelectedAnnotation();
      if (annotation?.type === "text") {
        event.preventDefault();
        setSelectedAnnotation(annotation.id);
        const updatedText = window.prompt("Edit text label", annotation.text || "");
        if (updatedText && updatedText.trim()) {
          captureUndoSnapshot();
          annotation.text = updatedText.trim();
          updateSidebarUi();
          requestRenderViewports(getViewportIdsForPlane(annotation.plane), { readouts: false });
          setStatus("Text label updated.");
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
    if (annotation.type === "length" || annotation.type === "arrow" || isLineProfileAnnotationType(annotation.type)) {
      return vectorLength(subtractVectors(annotation.worldPoints[0], annotation.worldPoints[1])) > 0.5;
    }
    if (annotation.type === "squareProfile") {
      const box = getSquareProfilePlaneBox(annotation);
      return box.widthMm > 0.5 && box.heightMm > 0.5;
    }
    if (isMultiDiameterAnnotationType(annotation.type)) {
      const config = getDiameterToolConfig(annotation.type);
      const lines = getDiameterAnnotationLines(annotation);
      const expectedCount = config?.roles?.length || 0;
      return lines.length >= expectedCount && lines.every((line) => (getDiameterLineLengthMm(line) || 0) > 0.5);
    }
    if (annotation.type === "freehandRoi") {
      return getFreehandPlanePoints(annotation).length >= 3 && getPolygonAreaMm2(getFreehandPlanePoints(annotation)) > 0.8;
    }
    return true;
  }

  function getVisibleBrushAnnotation(frame) {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return null;
    }

    const selected = getSelectedAnnotation();
    if (selected?.type === "brushRoi" && isAnnotationVisible(selected, frame)) {
      return selected;
    }

    const visibleBrushes = reconstruction.annotations
      .filter((annotation) => annotation.type === "brushRoi")
      .filter((annotation) => isAnnotationVisible(annotation, frame))
      .sort((left, right) => right.id - left.id);
    return visibleBrushes[0] || null;
  }

  function getBrushAnnotationForAdjustment() {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      throw new Error("Load a reconstruction first.");
    }

    const selected = getSelectedAnnotation();
    if (selected?.type === "brushRoi") {
      return selected;
    }

    const frame = state.viewports[state.activeViewportId]?.lastFrame || getViewportFrame(state.activeViewportId, reconstruction);
    const visible = getVisibleBrushAnnotation(frame);
    if (visible) {
      setSelectedAnnotation(visible.id);
      return visible;
    }

    const latest = reconstruction.annotations.filter((annotation) => annotation.type === "brushRoi").slice(-1)[0];
    if (latest) {
      setSelectedAnnotation(latest.id);
      return latest;
    }

    throw new Error("Paint a brush ROI first.");
  }

  function resizeSelectedBrushRoi(direction) {
    const annotation = getBrushAnnotationForAdjustment();
    captureUndoSnapshot();
    const stillValid = morphBrushMask(annotation, direction);
    if (!stillValid) {
      deleteSelectedAnnotation({ skipHistory: true });
      setStatus("Brush ROI became empty and was removed.", "warning");
      return;
    }
    updateSidebarUi();
    requestRenderViewports(getViewportIdsForPlane(annotation.plane), { readouts: false });
    setStatus(direction > 0 ? "Brush ROI grown." : "Brush ROI shrunk.");
  }

  function startAnnotationEditDrag(viewportId, viewportState, event, hit) {
    setSelectedAnnotation(hit.annotation.id);
    viewportState.pointerId = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    state.dragging = {
      type: "editAnnotation",
      viewportId,
      annotationId: hit.annotation.id,
      mode: hit.mode,
      pointIndex: hit.pointIndex,
      lineIndex: hit.lineIndex,
      cornerIndex: hit.cornerIndex,
      historyCaptured: false,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPlanePoint: canvasToPlanePoint(viewportId, event.clientX, event.clientY),
      sourceAnnotation: cloneAnnotation(hit.annotation),
    };
    updateProfilePanel();
    updateViewportCursors();
    requestRenderViewports(getViewportIdsForPlane(hit.annotation.plane), { readouts: false });
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

      const hit = getAnnotationHit(viewportId, event.clientX, event.clientY);
      if (hit) {
        event.preventDefault();
        startAnnotationEditDrag(viewportId, viewportState, event, hit);
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

    if (state.activeToolKey === "edit") {
      const hit = getAnnotationHit(viewportId, event.clientX, event.clientY);
      if (!hit) {
        setSelectedAnnotation(null);
        updateProfilePanel();
        requestRenderViewports(getViewportIdsForPlane(getViewportPlane(viewportId)), { readouts: false });
        return;
      }

      startAnnotationEditDrag(viewportId, viewportState, event, hit);
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

    if (
      (state.activeToolKey === "length" ||
        state.activeToolKey === "arrow" ||
        state.activeToolKey === "lineProfile" ||
        state.activeToolKey === "plaqueLineProfile" ||
        state.activeToolKey === "plaqueNoncalcifiedLineProfile" ||
        state.activeToolKey === "vascularLineProfile" ||
        state.activeToolKey === "squareProfile" ||
        isMultiDiameterAnnotationType(state.activeToolKey)) &&
      !worldPoint
    ) {
      return;
    }

    if (state.activeToolKey === "circularRoi") {
      const hit = getAnnotationHit(viewportId, event.clientX, event.clientY);
      if (hit?.annotation && isCircularRoiAnnotation(hit.annotation)) {
        event.preventDefault();
        startAnnotationEditDrag(viewportId, viewportState, event, hit);
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
      requestRenderViewports(getViewportIdsForPlane(frame.plane), { readouts: false });
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
        viewContext: createAnnotationViewContext(frame, { viewportId }),
        sourceTool: "freehandRoi",
        worldPoints: [worldPoint],
        hoverWorld: null,
      };
      state.dragging = {
        type: "freehandRoi",
        viewportId,
        sampleDistanceMm: getFreehandSampleDistanceMm(frame),
      };
      requestRenderViewports(getViewportIdsForPlane(frame.plane), { readouts: false });
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
        historyCaptured: false,
      };
      requestRenderViewports(getViewportIdsForPlane(frame.plane), { readouts: false });
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

      let isNew = false;
      if (!annotation) {
        annotation = createBrushRoiAnnotation(frame, planePoint);
        addAnnotation(annotation);
        isNew = true;
      } else {
        captureUndoSnapshot();
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
        isNew,
        lastPlanePoint: planePoint,
      };
      updateSidebarUi();
      requestRenderViewports(getViewportIdsForPlane(frame.plane), { readouts: false });
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
      captureUndoSnapshot();
      eraseStroke(viewportId, reconstruction, frame, planePoint, planePoint, state.eraser.sizeMm / 2);
      state.dragging = {
        type: "eraser",
        viewportId,
        frame: cloneFrame(frame),
        lastPlanePoint: planePoint,
      };
      requestRenderViewports(getViewportIdsForPlane(frame.plane), { readouts: false });
      return;
    }

    if (isMprNavigationAvailable()) {
      const hit = getMprOverlayHit(viewportId, event.clientX, event.clientY);
      if (hit || state.activeToolKey === "mprCursor") {
        if (hit?.type === "line") {
          const controlPlaneName = frame?.plane || getViewportPlane(viewportId);
          viewportState.pointerId = event.pointerId;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          event.preventDefault();
          state.dragging = {
            type: "mprRotate",
            viewportId,
            planeName: controlPlaneName,
            referenceLinePlaneName: hit.planeName,
            startAngleRadians: hit.angleRadians,
            startRotation: state.mpr.rotations[controlPlaneName],
            rotationSign: getMprDragRotationSign(controlPlaneName),
            startPlaneNormals: cloneMprPlaneNormals(getMprPlaneNormals()),
          };
          updateViewportCursors();
          return;
        }

        const startPlanePoint = canvasToPlanePoint(viewportId, event.clientX, event.clientY);
        if (!startPlanePoint?.inside || !frame) {
          return;
        }

        viewportState.pointerId = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        state.dragging = {
          type: "mprCenter",
          viewportId,
          startFrame: cloneFrame(frame),
          startCenterWorld: cloneVector(state.mpr.centerWorld || frame.centerWorld),
          startPlanePoint,
        };
        updateViewportCursors();
        requestRenderAll();
        return;
      }
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

    if (isMultiDiameterAnnotationType(state.activeToolKey)) {
      const draft = ensureDiameterDraft(state.activeToolKey, reconstruction, frame, viewportId);
      const role = getDiameterDraftRole(state.activeToolKey, draft.lines.length);
      state.dragging = {
        type: "diameterLine",
        viewportId,
        toolKey: state.activeToolKey,
        role,
        frame: cloneFrame(frame),
        plane: frame.plane,
        viewContext: createAnnotationViewContext(frame, { viewportId }),
        worldPoints: [worldPoint, worldPoint],
      };
      requestRenderViewports(getViewportIdsForPlane(frame.plane), { readouts: false });
      return;
    }

    if (
      state.activeToolKey === "length" ||
      state.activeToolKey === "arrow" ||
      state.activeToolKey === "lineProfile" ||
      state.activeToolKey === "plaqueLineProfile" ||
      state.activeToolKey === "plaqueNoncalcifiedLineProfile" ||
      state.activeToolKey === "vascularLineProfile" ||
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
      requestRenderViewports(getViewportIdsForPlane(frame.plane), { readouts: false });
    }
  }

  function handleGlobalPointerMove(event) {
    if (!state.dragging) {
      return;
    }

    if (state.dragging.type === "viewportOverlay") {
      handleViewportOverlayDragMove(event);
      return;
    }

    if (
      state.dragging.comparisonTileId &&
      state.dragging.type === "rightScroll" &&
      !state.comparison.viewportOverrideActive
    ) {
      const tile = getComparisonTile(state.dragging.comparisonTileId);
      const viewportId = state.dragging.viewportId || "presentation";
      const dragDeltaY = event.clientY - state.dragging.startClientY;
      const normalized = dragDeltaY / state.dragging.scrubHeightPx;
      const targetIndex = clamp(
        Math.round(state.dragging.startIndex + normalized * state.dragging.maxIndex),
        0,
        state.dragging.maxIndex
      );
      setComparisonTilePlaneIndex(tile, viewportId, targetIndex);
      event.preventDefault();
      return;
    }

    if (
      state.dragging.comparisonTileId &&
      !state.comparison.viewportOverrideActive &&
      !String(state.dragging.type || "").startsWith("comparison")
    ) {
      const tile = getComparisonTile(state.dragging.comparisonTileId);
      const viewportId = state.dragging.viewportId || "presentation";
      withComparisonViewportOverride(tile, viewportId, () => handleGlobalPointerMove(event));
      return;
    }

    if (String(state.dragging.type || "").startsWith("comparison")) {
      if (handleComparisonDragMove(event)) {
        event.preventDefault();
      }
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
      requestRenderViewports(getViewportIdsForPlane(state.dragging.frame.plane), { readouts: false });
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
      requestRenderViewports(getViewportIdsForPlane(draft.plane), { readouts: false });
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
      requestRenderViewports(getViewportIdsForPlane(state.dragging.frame.plane), { readouts: false });
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
      requestRenderViewports(
        state.syncMprTransforms ? VIEWPORT_IDS : [state.dragging.viewportId],
        { readouts: false }
      );
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
      requestRenderViewports(
        state.syncMprTransforms ? VIEWPORT_IDS : [state.dragging.viewportId],
        { readouts: false }
      );
      return;
    }

    if (state.dragging.type === "mprCenter") {
      const planePoint = canvasToPlanePoint(state.dragging.viewportId, event.clientX, event.clientY);
      const startFrame = state.dragging.startFrame;
      const startCenterWorld = state.dragging.startCenterWorld;
      const startPlanePoint = state.dragging.startPlanePoint;
      if (!planePoint || !startFrame || !startCenterWorld || !startPlanePoint) {
        return;
      }
      const deltaXmm = planePoint.xMm - startPlanePoint.xMm;
      const deltaYmm = planePoint.yMm - startPlanePoint.yMm;
      state.mpr.centerWorld = addVectors(
        addVectors(startCenterWorld, scaleVector(startFrame.uWorld, deltaXmm)),
        scaleVector(startFrame.vWorld, deltaYmm)
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
      const rotationSign = Number.isFinite(state.dragging.rotationSign) ? state.dragging.rotationSign : 1;
      let deltaDegrees = ((currentAngle - state.dragging.startAngleRadians) * 180) / Math.PI;
      deltaDegrees = normalizeAngleDegrees(deltaDegrees * rotationSign);
      applyMprRotationAroundControlPlane(
        state.dragging.planeName,
        state.dragging.startPlaneNormals,
        state.dragging.startRotation + deltaDegrees,
        deltaDegrees
      );
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
      requestRenderViewports(getViewportIdsForPlane(annotation.plane), { readouts: false });
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
        requestRenderViewports(getViewportIdsForPlane(draft.plane), { readouts: false });
      }
      return;
    }

    if (state.dragging.type === "profileGuide") {
      const annotation = getActiveProfileAnnotation();
      const chartState = state.profileChartState;
      if (
        !annotation ||
        !(chartState?.profile?.stent || chartState?.profile?.plaque || chartState?.profile?.vascular) ||
        annotation.id !== state.dragging.annotationId
      ) {
        return;
      }
      if (!state.dragging.historyCaptured) {
        captureUndoSnapshot();
        state.dragging.historyCaptured = true;
      }

      const rect = els.profileChart.getBoundingClientRect();
      const localX = clamp(event.clientX - rect.left, chartState.plot.x, chartState.plot.x + chartState.plot.width);
      const distanceMm = ((localX - chartState.plot.x) / chartState.plot.width) * chartState.maxDistance;
      const targetIndex = findNearestProfileDistanceIndex(chartState.profile.distancesMm, distanceMm);
      if (state.dragging.guideKind === "plaque") {
        setPlaqueGuideAdjustment(
          annotation,
          state.dragging.guideKey,
          targetIndex,
          chartState.profile.distancesMm.length,
          chartState.profile.plaque?.guideIndices
        );
      } else if (state.dragging.guideKind === "vascular") {
        setVascularGuideAdjustment(
          annotation,
          state.dragging.guideKey,
          targetIndex,
          chartState.profile.distancesMm.length,
          chartState.profile.vascular?.guideIndices
        );
      } else {
        setProfileGuideAdjustment(
          annotation,
          state.dragging.guideKey,
          targetIndex,
          chartState.profile.distancesMm.length,
          chartState.profile.stent?.guideIndices
        );
      }
      updateProfilePanel();
      return;
    }

    if (state.dragging.type === "annotation") {
      const worldPoint = canvasToWorldPoint(state.dragging.viewportId, event.clientX, event.clientY);
      if (!worldPoint) {
        return;
      }

      state.dragging.annotation.worldPoints[1] = worldPoint;
      requestRenderViewports(getViewportIdsForPlane(state.dragging.annotation.plane), { readouts: false });
      return;
    }

    if (state.dragging.type === "diameterLine") {
      const worldPoint = canvasToWorldPoint(state.dragging.viewportId, event.clientX, event.clientY);
      if (!worldPoint) {
        return;
      }
      const draft = state.diameterDraft;
      state.dragging.worldPoints[1] = worldPoint;
      state.dragging.worldPoints = getConstrainedDiameterDragWorldPoints(draft, state.dragging);
      if (draft) {
        requestRenderViewports(getViewportIdsForPlane(draft.plane), { readouts: false });
      }
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
      if (!state.dragging.historyCaptured) {
        captureUndoSnapshot();
        state.dragging.historyCaptured = true;
      }

      if (state.dragging.mode === "label") {
        annotation.labelOffsetXpx =
          (Number(state.dragging.sourceAnnotation.labelOffsetXpx) || 0) +
          (event.clientX - state.dragging.startClientX);
        annotation.labelOffsetYpx =
          (Number(state.dragging.sourceAnnotation.labelOffsetYpx) || 0) +
          (event.clientY - state.dragging.startClientY);
      } else if (state.dragging.mode === "move") {
        const deltaXmm = planePoint.xMm - state.dragging.startPlanePoint.xMm;
        const deltaYmm = planePoint.yMm - state.dragging.startPlanePoint.yMm;
        translateAnnotationInPlane(annotation, state.dragging.sourceAnnotation, deltaXmm, deltaYmm);
      } else if (state.dragging.mode === "point" && worldPoint) {
        annotation.worldPoints[state.dragging.pointIndex] = worldPoint;
      } else if (state.dragging.mode === "diameterPoint" && worldPoint) {
        const lines = getDiameterAnnotationLines(annotation);
        const line = lines[state.dragging.lineIndex];
        if (line?.worldPoints?.[state.dragging.pointIndex]) {
          if (annotation.type === "bloomingDiameter") {
            updateBloomingDiameterPoint(lines, state.dragging.lineIndex, state.dragging.pointIndex, worldPoint);
          } else {
            line.worldPoints[state.dragging.pointIndex] = worldPoint;
          }
          annotation.diameterLines = lines;
          annotation.worldPoints = lines.flatMap((item) => item.worldPoints);
        }
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
      } else if (state.dragging.mode === "squareRotate") {
        const sourceBox = getSquareProfilePlaneBox(state.dragging.sourceAnnotation);
        const deltaX = planePoint.xMm - sourceBox.centerXmm;
        const deltaY = planePoint.yMm - sourceBox.centerYmm;
        const angleDegrees = normalizeAngleDegrees((Math.atan2(deltaY, deltaX) * 180) / Math.PI + 90);
        setSquareProfileBox(annotation, {
          centerXmm: sourceBox.centerXmm,
          centerYmm: sourceBox.centerYmm,
          widthMm: sourceBox.widthMm,
          heightMm: sourceBox.heightMm,
          angleDegrees,
        });
      }

      requestRenderViewports(getViewportIdsForPlane(annotation.plane), { readouts: false });
    }
  }

  function releasePointer(viewportId) {
    const viewportState = state.viewports[viewportId];
    if (!viewportState?.pointerId) {
      return;
    }
    const pointerElement = state.dragging?.viewportId === viewportId ? state.dragging.pointerElement : null;
    (pointerElement || viewportState.canvas || els.viewports[viewportId])?.releasePointerCapture?.(viewportState.pointerId);
    viewportState.pointerId = null;
  }

  function handleGlobalPointerUp() {
    if (!state.dragging) {
      return;
    }

    const dragging = state.dragging;
    if (dragging.type === "viewportOverlay") {
      dragging.pointerElement?.releasePointerCapture?.(dragging.pointerId);
      state.dragging = null;
      return;
    }

    if (
      dragging.comparisonTileId &&
      !state.comparison.viewportOverrideActive &&
      !String(dragging.type || "").startsWith("comparison")
    ) {
      const tile = getComparisonTile(dragging.comparisonTileId);
      const viewportId = dragging.viewportId || "presentation";
      withComparisonViewportOverride(tile, viewportId, () => handleGlobalPointerUp());
      return;
    }

    if (String(dragging.type || "").startsWith("comparison")) {
      dragging.pointerElement?.releasePointerCapture?.(dragging.pointerId);
      state.dragging = null;
      updateViewportCursors();
      requestRenderAll();
      return;
    }

    if (dragging.type === "profileGuide") {
      els.profileChart.releasePointerCapture?.(dragging.pointerId);
      els.profileChart.style.cursor = "default";
    } else {
      releasePointer(dragging.viewportId);
    }

    if (dragging.type === "annotation" && isValidDragAnnotation(dragging.annotation)) {
      addAnnotation(dragging.annotation);
    } else if (dragging.type === "diameterLine") {
      const draft = state.diameterDraft;
      const worldPoints = getConstrainedDiameterDragWorldPoints(draft, dragging);
      const lineLengthMm = vectorLength(subtractVectors(worldPoints[0], worldPoints[1]));
      if (draft && draft.toolKey === dragging.toolKey && Number.isFinite(lineLengthMm) && lineLengthMm > 0.5) {
        draft.lines.push({
          ...dragging.role,
          frame: dragging.frame ? cloneFrame(dragging.frame) : cloneFrame(draft.frame),
          plane: dragging.plane || dragging.frame?.plane || draft.plane,
          viewContext: dragging.viewContext ? cloneAnnotationViewContext(dragging.viewContext) : null,
          worldPoints,
        });
        const expectedCount = getDiameterToolConfig(draft.toolKey)?.roles?.length || 0;
        if (draft.lines.length >= expectedCount) {
          const annotation = buildDiameterAnnotationFromDraft(draft);
          state.diameterDraft = null;
          addAnnotation(annotation);
          setStatus(`${getMultiDiameterLabel(annotation)} saved.`);
        } else {
          setStatus(getDiameterDraftStatus(draft.toolKey, draft.lines.length));
        }
      }
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
        captureUndoSnapshot();
        if (applyContourCorrection(annotation, draft.planePoints)) {
          annotation.viewContext = createAnnotationViewContext(annotation.frame, { viewportId: dragging.viewportId });
          setStatus("ROI contour corrected.");
        }
      }
      state.contourCorrectionDraft = null;
    } else if (dragging.type === "brushRoiPaint") {
      const reconstruction = getActiveReconstruction();
      const annotation = getSelectedAnnotation();
      if (reconstruction && annotation?.id === dragging.annotationId && countBrushMaskCells(annotation.mask) <= 0) {
        reconstruction.annotations = reconstruction.annotations.filter((item) => item.id !== annotation.id);
        state.selectedAnnotationId = null;
      } else if (annotation?.id === dragging.annotationId) {
        annotation.viewContext = createAnnotationViewContext(annotation.frame, { viewportId: dragging.viewportId });
      }
      updateSidebarUi();
    } else if (dragging.type === "editAnnotation") {
      const annotation = getSelectedAnnotation();
      if (annotation && annotation.id === dragging.annotationId && !isValidDragAnnotation(annotation)) {
        Object.assign(annotation, cloneAnnotation(dragging.sourceAnnotation));
      } else if (annotation && annotation.id === dragging.annotationId && dragging.mode !== "label") {
        annotation.viewContext = createAnnotationViewContext(annotation.frame, { viewportId: dragging.viewportId });
      }
      updateSidebarUi();
    } else if (dragging.type === "profileGuide") {
      updateProfilePanel();
    }

    state.dragging = null;
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
      const currentZoom = Number(viewportState?.zoom) || 1;
      const nextZoom = currentZoom * Math.exp(-event.deltaY * 0.0015);
      if (zoomViewportAtClientPoint(viewportId, event.clientX, event.clientY, nextZoom)) {
        requestRenderViewports(
          state.syncMprTransforms ? VIEWPORT_IDS : [viewportId],
          { readouts: false }
        );
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

    els.dicomAddFolderInput?.addEventListener("change", async (event) => {
      try {
        await loadReconstructionsFromFiles(event.target.files, { append: true });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Failed to add reconstruction folder.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.clearButton.addEventListener("click", clearStudy);
    els.metadataOverlayToggleButton?.addEventListener("click", () => {
      state.showDicomMetadataOverlay = !state.showDicomMetadataOverlay;
      updateViewportDicomOverlays();
      syncViewportOverlayVisibilityFlag();
    });
    els.presentationSeriesLabelToggleButton?.addEventListener("click", () => {
      state.showPresentationSeriesLabel = !state.showPresentationSeriesLabel;
      savePresentationSeriesLabelPreference();
      updatePresentationSeriesLabel();
      syncViewportOverlayVisibilityFlag();
    });
    els.presentationSeriesLabelCloseButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.showPresentationSeriesLabel = false;
      savePresentationSeriesLabelPreference();
      updatePresentationSeriesLabel();
      syncViewportOverlayVisibilityFlag();
    });
    els.presentationSeriesLabel?.addEventListener("pointerdown", (event) => {
      startViewportOverlayDrag("series", els.presentationSeriesLabel, event);
    });
    els.presentationSeriesLabel?.addEventListener("contextmenu", (event) => event.preventDefault());
    els.dicomOverlays?.presentation?.addEventListener("click", (event) => {
      if (!event.target?.closest?.(".viewport-dicom-overlay-close")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      state.showDicomMetadataOverlay = false;
      updateViewportDicomOverlays();
      syncViewportOverlayVisibilityFlag();
    });
    els.dicomOverlays?.presentation?.addEventListener("pointerdown", (event) => {
      startViewportOverlayDrag("dicom", els.dicomOverlays.presentation, event);
    });
    els.dicomOverlays?.presentation?.addEventListener("contextmenu", (event) => event.preventDefault());
    els.uiModeButtons.forEach((button) => {
      button.addEventListener("click", () => setUiMode(button.dataset.uiMode));
    });
    els.sidebarTabButtons.forEach((button) => {
      button.addEventListener("click", () => setActiveSidebarTab(button.dataset.sidebarTabButton));
    });
    if (PROJECT_WORKFLOW_ENABLED) {
      els.projectRefreshButton.addEventListener("click", async () => {
        try {
          await loadProjectsFromBackend({ refreshCaseId: false });
          setStatus("Project list refreshed.");
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Project refresh failed.", "error");
        }
      });
      els.projectNextIdButton.addEventListener("click", async () => {
        try {
          await refreshSuggestedProjectCaseId();
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Could not suggest the next project case ID.", "error");
        }
      });
      els.projectCreateButton.addEventListener("click", async () => {
        try {
          await createProjectFromInput();
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Project creation failed.", "error");
        }
      });
      els.projectSelect.addEventListener("change", async () => {
        try {
          await selectProject(els.projectSelect.value);
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Project selection failed.", "error");
        }
      });
      ["change", "blur"].forEach((eventName) => {
        els.projectCaseIdInput.addEventListener(eventName, () => {
          state.projectCaseId = sanitizeProjectCaseId(els.projectCaseIdInput.value);
          els.projectCaseIdInput.value = state.projectCaseId;
          state.projectSession.hasSavedSession = Boolean(getMatchingProjectCase()?.has_session);
          state.projectSession.lastSavedAt = String(getMatchingProjectCase()?.session_saved_at || "");
          updateSidebarUi();
          scheduleProjectDuplicateCheck();
          requestProjectSessionAutosave();
        });
        els.projectCaseLabelInput.addEventListener(eventName, () => {
          state.projectCaseLabel = String(els.projectCaseLabelInput.value || "").trim();
          els.projectCaseLabelInput.value = state.projectCaseLabel;
          updateSidebarUi();
          requestProjectSessionAutosave();
        });
        els.projectCreateNameInput.addEventListener(eventName, () => {
          els.projectCreateNameInput.value = String(els.projectCreateNameInput.value || "").trim();
        });
      });
      els.projectCaseFilterInput.addEventListener("input", () => {
        state.projectCaseFilter = String(els.projectCaseFilterInput.value || "");
        renderProjectCases();
      });
      els.projectRestoreSessionButton.addEventListener("click", async () => {
        try {
          const restored = await restoreProjectSessionFromBackend(state.projectCaseId, { silent: false });
          if (restored) {
            setStatus(`Restored the saved workspace for ${getCurrentProjectCaseId()}.`);
          }
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Session restore failed.", "error");
        }
      });
    }
    els.undoButton.addEventListener("click", undoHistory);
    els.redoButton.addEventListener("click", redoHistory);
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
      if (state.layout === "mpr") {
        resetMprState();
      } else {
        resetPresentationViewportTransform();
      }
    });
    els.presentationModeToggleButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setLayout(state.layout === "mpr" ? "presentation" : "mpr");
    });
    els.presentationLayoutToggleButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setComparisonLayoutMenuOpen(!state.comparison.layoutMenuOpen);
    });
    els.comparisonLayoutChoices?.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setComparisonLayout(button.dataset.comparisonLayout || "single");
      });
    });
    els.comparisonSyncButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setComparisonSync(!state.comparison.syncEnabled);
    });
    els.presentationOverlayToggleButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setViewportOverlayVisibility(state.showViewportOverlays === false);
    });
    els.presentationGridToggleButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.showViewportGrid = !state.showViewportGrid;
      updateViewportChromeUi();
      updateComparisonUi();
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
    els.focusSidebarCollapseButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setFocusSidebarOpen(false);
      scheduleFocusLayoutRender();
    });
    els.focusWorkflowButtons?.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleFocusWorkflowTab(button.dataset.focusWorkflowTab);
      });
    });
    els.focusFinishCloseButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        openMeasurementExportModal("finishClose");
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Finish & Close failed.", "error");
      }
    });
    els.syncMprButton.addEventListener("click", () => {
      setSyncMprTransforms(!state.syncMprTransforms);
    });
    els.resetMprButton.addEventListener("click", resetMprState);
    els.clearMeasurementsButton.addEventListener("click", clearMeasurements);
    els.brushGrowButton.addEventListener("click", () => {
      try {
        resizeSelectedBrushRoi(1);
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Brush grow failed.", "error");
      }
    });
    els.brushShrinkButton.addEventListener("click", () => {
      try {
        resizeSelectedBrushRoi(-1);
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Brush shrink failed.", "error");
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
    els.annotationRenameButton.addEventListener("click", () => {
      try {
        renameAnnotation(state.selectedAnnotationId);
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Rename failed.", "error");
      }
    });
    els.annotationDeleteButton?.addEventListener("click", () => {
      deleteSelectedAnnotation();
    });
    els.shortcutResetButton.addEventListener("click", resetShortcutSettings);

    els.layoutButtons.forEach((button) => {
      button.addEventListener("click", () => setLayout(button.dataset.layout));
    });

    els.sidebarSectionToggles.forEach((button) => {
      button.addEventListener("click", () => {
        const sectionId = button.closest("[data-section-id]")?.dataset.sectionId;
        if (!sectionId) {
          return;
        }
        toggleSidebarSection(sectionId);
      });
    });

    els.toolButtons.forEach((button) => {
      button.addEventListener("click", () => setActiveTool(button.dataset.tool));
    });
    els.sidebar?.addEventListener("dblclick", handleShortcutControlDoubleClick);
    els.roiToolTrigger?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleRoiToolMenu();
    });
    els.roiToolMenu?.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    els.interfaceToolTrigger?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleInterfaceToolMenu();
    });
    els.interfaceToolMenu?.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (state.comparison.layoutMenuOpen && els.presentationLayoutMenu && els.presentationLayoutToggleButton) {
        if (!els.presentationLayoutMenu.contains(target) && !els.presentationLayoutToggleButton.contains(target)) {
          setComparisonLayoutMenuOpen(false);
        }
      }
      if (els.roiToolMenu && els.roiToolTrigger) {
        if (els.roiToolMenu.contains(target) || els.roiToolTrigger.contains(target)) {
          return;
        }
        closeRoiToolMenu();
      }
      if (els.interfaceToolMenu && els.interfaceToolTrigger) {
        if (els.interfaceToolMenu.contains(target) || els.interfaceToolTrigger.contains(target)) {
          return;
        }
        closeInterfaceToolMenu();
      }
    });

    els.presetGrid?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-preset]");
      if (!button || !els.presetGrid.contains(button)) {
        return;
      }
      applyPreset(button.dataset.preset);
    });
    els.presetSaveButton?.addEventListener("click", saveCurrentVoiToSelectedPreset);
    els.presetAddButton?.addEventListener("click", addCurrentVoiPreset);
    els.presetResetButton?.addEventListener("click", resetVoiPresetSettings);

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
      els.brushMinInput.addEventListener(eventName, applyBrushRoiInputs);
      els.brushMaxInput.addEventListener(eventName, applyBrushRoiInputs);
      els.brushSizeInput.addEventListener(eventName, applyBrushRoiInputs);
      els.eraserSizeInput.addEventListener(eventName, applyEraserInputs);
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
    ].forEach((input) => {
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

    els.exportCineButton.addEventListener("click", async () => {
      try {
        await exportCineClip();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Cine export failed.", "error");
      }
    });

    els.exportMeasurementsButton.addEventListener("click", async () => {
      try {
        openMeasurementExportModal("export");
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Measurement export failed.", "error");
      }
    });
    els.finishCloseButton?.addEventListener("click", () => {
      try {
        openMeasurementExportModal("finishClose");
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Finish & Close failed.", "error");
      }
    });
    els.exportBaselineButton.addEventListener("click", () => {
      try {
        openBaselineExportModal();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Baseline characteristics export failed.", "error");
      }
    });
    [
      els.measurementExportCloseButton,
      els.measurementExportCancelButton,
      ...Array.from(document.querySelectorAll("[data-measurement-modal-close]")),
    ].forEach((element) => {
      element?.addEventListener("click", closeMeasurementExportModal);
    });
    els.measurementExportConfirmButton?.addEventListener("click", async () => {
      try {
        const studyId = safeString(els.measurementExportStudyIdInput?.value);
        await exportMeasurementsReport({
          studyId,
          closeAfterExport: Boolean(state.pendingMeasurementExport?.finishClose),
        });
        closeMeasurementExportModal();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Measurement export failed.", "error");
      }
    });
    els.measurementExportStudySelect?.addEventListener("change", () => {
      handleExportStudySelectionChange(els.measurementExportStudySelect).catch((error) => {
        console.error(error);
        setStatus(error.message || "Could not change export study.", "error");
      });
    });
    els.measurementExportStudyCreateButton?.addEventListener("click", () => {
      createExportStudyFromInput(els.measurementExportStudyCreateInput).catch((error) => {
        console.error(error);
        setStatus(error.message || "Could not create export study.", "error");
      });
    });
    els.measurementExportStudyCreateInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      createExportStudyFromInput(els.measurementExportStudyCreateInput).catch((error) => {
        console.error(error);
        setStatus(error.message || "Could not create export study.", "error");
      });
    });
    els.measurementExportStudyIdInput?.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      try {
        const studyId = safeString(els.measurementExportStudyIdInput?.value);
        await exportMeasurementsReport({
          studyId,
          closeAfterExport: Boolean(state.pendingMeasurementExport?.finishClose),
        });
        closeMeasurementExportModal();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Measurement export failed.", "error");
      }
    });
    [
      els.baselineExportCloseButton,
      els.baselineExportCancelButton,
      ...Array.from(document.querySelectorAll("[data-baseline-modal-close]")),
    ].forEach((element) => {
      element?.addEventListener("click", closeBaselineExportModal);
    });
    BASELINE_EXPORT_GROUPS.forEach((group) => {
      els.baselineExportGroupInputs[group.id]?.addEventListener("change", syncBaselineExportStateFromInputs);
    });
    els.baselineExportConfirmButton.addEventListener("click", async () => {
      try {
        const selectedGroups = getSelectedBaselineExportGroups();
        const studyId = safeString(els.baselineExportStudyIdInput?.value);
        await exportBaselineCharacteristics(selectedGroups, { studyId });
        closeBaselineExportModal();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Baseline characteristics export failed.", "error");
      }
    });
    els.baselineExportStudySelect?.addEventListener("change", () => {
      handleExportStudySelectionChange(els.baselineExportStudySelect).catch((error) => {
        console.error(error);
        setStatus(error.message || "Could not change export study.", "error");
      });
    });
    els.baselineExportStudyCreateButton?.addEventListener("click", () => {
      createExportStudyFromInput(els.baselineExportStudyCreateInput).catch((error) => {
        console.error(error);
        setStatus(error.message || "Could not create export study.", "error");
      });
    });
    els.baselineExportStudyCreateInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      createExportStudyFromInput(els.baselineExportStudyCreateInput).catch((error) => {
        console.error(error);
        setStatus(error.message || "Could not create export study.", "error");
      });
    });
    els.baselineExportStudyIdInput?.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      try {
        const selectedGroups = getSelectedBaselineExportGroups();
        const studyId = safeString(els.baselineExportStudyIdInput?.value);
        await exportBaselineCharacteristics(selectedGroups, { studyId });
        closeBaselineExportModal();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Baseline characteristics export failed.", "error");
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
        if (!getActiveReconstruction()) {
          return;
        }

        if ((event.metaKey || event.ctrlKey) && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
          event.preventDefault();
          event.stopPropagation();
          switchReconstructionBy(event.key === "ArrowRight" ? 1 : -1);
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

    ["dragenter", "dragover"].forEach((eventName) => {
      els.stage.addEventListener(eventName, (event) => {
        if (hasInternalReconstructionDrag(event.dataTransfer)) {
          return;
        }
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
      if (hasInternalReconstructionDrag(event.dataTransfer)) {
        event.preventDefault();
        return;
      }
      try {
        const droppedFiles =
          (await window.HAGRadCore?.collectDroppedFiles?.(event.dataTransfer)) ||
          Array.from(event.dataTransfer?.files || []);
        await loadReconstructionsFromFiles(droppedFiles, { append: state.reconstructions.length > 0 });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Failed to load dropped DICOM files.", "error");
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.comparison.layoutMenuOpen) {
        event.preventDefault();
        setComparisonLayoutMenuOpen(false);
        return;
      }
      if (event.key === "Escape" && els.measurementExportModal && !els.measurementExportModal.classList.contains("is-hidden")) {
        event.preventDefault();
        closeMeasurementExportModal();
        return;
      }
      if (event.key === "Escape" && els.baselineExportModal && !els.baselineExportModal.classList.contains("is-hidden")) {
        event.preventDefault();
        closeBaselineExportModal();
        return;
      }

      const tagName = event.target?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA") {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        if (event.shiftKey) {
          redoHistory();
        } else {
          undoHistory();
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === "y" || event.key === "Y")) {
        event.preventDefault();
        redoHistory();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        switchReconstructionBy(event.key === "ArrowRight" ? 1 : -1);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && (event.key === "c" || event.key === "C")) {
        event.preventDefault();
        try {
          copySelectedAnnotation();
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Annotation copy failed.", "error");
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === "v" || event.key === "V")) {
        event.preventDefault();
        try {
          pasteCopiedAnnotation();
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Annotation paste failed.", "error");
        }
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (deleteSelectedAnnotation()) {
          event.preventDefault();
        }
        return;
      }

      const shortcutActionId = getShortcutActionIdForEvent(event);
      if (shortcutActionId) {
        event.preventDefault();
        runShortcutAction(shortcutActionId);
        return;
      }

      if (event.key === "+" || event.key === "=") {
        try {
          resizeSelectedBrushRoi(1);
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Brush grow failed.", "error");
        }
      } else if (event.key === "-" || event.key === "_") {
        try {
          resizeSelectedBrushRoi(-1);
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Brush shrink failed.", "error");
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (state.focusSidebarOpen) {
          setFocusSidebarOpen(false);
        } else if (state.presentationFocus && state.activeToolKey === "windowLevel") {
          setPresentationFocus(false);
        } else {
          returnToPrimaryTool();
        }
      }
    });

    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerUp);
    window.addEventListener("resize", requestRenderAll);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        saveProjectSessionNow({ silent: true }).catch(() => {});
      }
    });
    window.addEventListener("pagehide", () => {
      saveProjectSessionNow({ silent: true }).catch(() => {});
    });
  }

  function initialize() {
    cacheElements();
    relocateViewportMiniActions();
    refreshExportStudyOptions().catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not load export studies.", "error");
    });
    updateProjectWorkflowAvailability();
    loadSidebarSectionState();
    loadUiModePreference();
    loadSidebarTabPreference();
    loadPresentationSeriesLabelPreference();
    loadShortcutSettings();
    loadVoiPresetSettings();
    renderVoiPresetButtons();
    applyBrushRoiInputs();
    applyEraserInputs();
    initializeDecoderFallback();
    initializeViewportCanvases();
    bindStaticEvents();
    renderShortcutTable();
    updateLayoutButtons();
    updatePresentationFocusUi();
    updateToolButtons();
    updateSidebarUi();
    updateEmptyState();
    els.cineSpeedReadout.textContent = `${state.cineFps} fps`;
    setStatus("Ready for a DICOM stack");
    if (PROJECT_WORKFLOW_ENABLED) {
      loadProjectsFromBackend({ refreshCaseId: true }).catch((error) => {
        console.error(error);
        setStatus(error.message || "Project list could not be loaded.", "warning");
      });
    }
    requestRenderAll();
  }

  window.addEventListener("DOMContentLoaded", initialize);
})();
