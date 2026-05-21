(function () {
  "use strict";

  const MODES = {
    zoom: "zoom",
    windowing: "windowing",
    calibration: "calibration",
    anchors: "anchors",
    borderHints: "borderHints",
    centerline: "centerline",
    borders: "borders",
    draw: "draw",
    lesion: "stenosis",
    eraser: "eraser",
  };

  const SUPPORTED_TRANSFER_SYNTAXES = new Set([
    "1.2.840.10008.1.2",
    "1.2.840.10008.1.2.1",
    "1.2.840.10008.1.2.2",
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

  const MAX_FRAME_CACHE_SIZE = 8;
  const MAX_HISTORY_ENTRIES = 80;
  const CENTERLINE_CONTROL_STRIDE = 8;
  const BORDER_CONTROL_STRIDE = 8;
  const BORDER_BRUSH_RADIUS_SAMPLES = 6;
  const BORDER_CONTROL_LOCAL_SEARCH_RADIUS_SAMPLES = 6;
  const BORDER_HINT_BLEND_RADIUS_SAMPLES = 10;
  const MIN_CENTERLINE_SAMPLES = 18;
  const DEFAULT_SAMPLE_STEP_PX = 5;
  const MAX_BORDER_RADIUS_PX = 28;
  const MIN_MANUAL_BORDER_RADIUS_PX = 0;
  const MIN_AUTO_BORDER_RADIUS_PX = 1.2;
  const ERASER_RADIUS_PX = 18;

  const COLORS = {
    calibration: "#ffd166",
    anchor: "#f6c46d",
    anchorLine: "rgba(246, 196, 109, 0.52)",
    centerline: "#76d8ca",
    centerlineHandle: "#ddf7f1",
    leftBorder: "#8fd5ff",
    rightBorder: "#ffb9a8",
    lesionStart: "#ffd166",
    lesionEnd: "#ffd166",
    lesionCursor: "#ff7464",
    refProx: "#79b6ff",
    refDist: "#79b6ff",
    eraser: "rgba(255, 140, 128, 0.86)",
    handleStroke: "#071318",
  };

  const MODE_LABELS = {
    [MODES.zoom]: "Zoom",
    [MODES.windowing]: "Window",
    [MODES.calibration]: "Calibrate",
    [MODES.anchors]: "Anchors",
    [MODES.borderHints]: "Border Hints",
    [MODES.centerline]: "Centerline",
    [MODES.borders]: "Borders",
    [MODES.draw]: "Draw",
    [MODES.lesion]: "Stenosis",
    [MODES.eraser]: "Eraser",
  };

  const CORONARY_SEGMENTS = {
    RCA: [
      { code: "1", label: "RCA prox" },
      { code: "2", label: "RCA mid" },
      { code: "3", label: "RCA distal" },
      { code: "4", label: "R-PDA" },
      { code: "16", label: "R-PLB" },
    ],
    LM: [{ code: "5", label: "LM" }],
    LAD: [
      { code: "6", label: "LAD prox" },
      { code: "7", label: "LAD mid" },
      { code: "8", label: "LAD dist" },
      { code: "9", label: "D1" },
      { code: "10", label: "D2" },
      { code: "17", label: "Ramus" },
    ],
    LCx: [
      { code: "11", label: "LCx prox" },
      { code: "12", label: "OM1" },
      { code: "13", label: "LCx mid/dist" },
      { code: "14", label: "OM2" },
      { code: "15", label: "L-PDA" },
      { code: "18", label: "L-PLB" },
    ],
    CABG: [
      { code: "cabg_lima_lad", label: "LIMA–LAD" },
      { code: "cabg_svg_om", label: "SVG–OM" },
      { code: "cabg_svg_rca", label: "SVG–RCA" },
      { code: "cabg_svg_pda", label: "SVG–PDA" },
      { code: "cabg_svg_d1", label: "SVG–D1" },
      { code: "cabg_svg_plb", label: "SVG–PLB" },
      { code: "cabg_ra_om", label: "RA–OM" },
      { code: "cabg_rima_rca", label: "RIMA–RCA" },
      { code: "cabg_rima_lad", label: "RIMA–LAD" },
      { code: "custom", label: "Other / Custom" },
    ],
  };

  const ANALYSIS_CATEGORIES = {
    coronary_native: "Coronary arteries",
    coronary_cabg: "Coronary arteries, CABG",
    lower_extremity: "Lower Extremity",
    cervicocephalic: "Cervicocephalic Arteries",
  };

  const LOWER_EXTREMITY_SIDES = [
    { code: "right", label: "Right", finalPrefix: "Right" },
    { code: "left", label: "Left", finalPrefix: "Left" },
    { code: "bilateral_midline", label: "Bilateral / midline", finalPrefix: "Bilateral / midline" },
  ];

  const LOWER_EXTREMITY_LEVELS = [
    { code: "aortoiliac", label: "Aortoiliac" },
    { code: "femoral", label: "Femoral" },
    { code: "popliteal", label: "Popliteal" },
    { code: "infrapopliteal", label: "Infrapopliteal / runoff" },
    { code: "foot", label: "Foot arteries" },
  ];

  const LOWER_EXTREMITY_SEGMENTS = {
    aortoiliac: [
      { code: "aa", label: "Abdominal aorta (AA)", finalLabel: "abdominal aorta" },
      { code: "cia", label: "Common iliac artery (CIA)", finalLabel: "common iliac artery" },
      { code: "eia", label: "External iliac artery (EIA)", finalLabel: "external iliac artery" },
      { code: "iia_ha", label: "Internal iliac artery / hypogastric artery (IIA / HA)", finalLabel: "internal iliac artery" },
    ],
    femoral: [
      { code: "cfa", label: "Common femoral artery (CFA)", finalLabel: "CFA" },
      { code: "dfa_pfa", label: "Deep femoral / profunda femoris artery (DFA / PFA)", finalLabel: "deep femoral artery" },
      { code: "sfa", label: "Superficial femoral artery (SFA)", finalLabel: "SFA" },
      { code: "prox_sfa", label: "Proximal SFA", finalLabel: "proximal SFA" },
      { code: "mid_sfa", label: "Mid SFA", finalLabel: "mid SFA" },
      { code: "dist_sfa", label: "Distal SFA", finalLabel: "distal SFA" },
    ],
    popliteal: [
      { code: "pop", label: "Popliteal artery (POP)", finalLabel: "POP" },
      { code: "p1", label: "P1 proximal popliteal", finalLabel: "POP P1" },
      { code: "p2", label: "P2 mid popliteal", finalLabel: "POP P2" },
      { code: "p3", label: "P3 distal popliteal", finalLabel: "POP P3" },
    ],
    infrapopliteal: [
      { code: "ata", label: "Anterior tibial artery (ATA)", finalLabel: "ATA" },
      { code: "tpt", label: "Tibioperoneal trunk (TPT)", finalLabel: "TPT" },
      { code: "pta", label: "Posterior tibial artery (PTA)", finalLabel: "PTA" },
      { code: "per", label: "Peroneal artery (PER)", finalLabel: "peroneal artery" },
    ],
    foot: [
      { code: "dpa", label: "Dorsalis pedis artery (DPA)", finalLabel: "dorsalis pedis artery" },
      { code: "medial_plantar", label: "Medial plantar artery", finalLabel: "medial plantar artery" },
      { code: "lateral_plantar", label: "Lateral plantar artery", finalLabel: "lateral plantar artery" },
      { code: "plantar_arch", label: "Plantar arch", finalLabel: "plantar arch" },
    ],
  };

  const CERVICOCEPHALIC_SIDES = [
    { code: "right", label: "Right", finalPrefix: "Right" },
    { code: "left", label: "Left", finalPrefix: "Left" },
    { code: "bilateral_midline", label: "Bilateral / midline", finalPrefix: "" },
  ];

  const CERVICOCEPHALIC_LEVELS = [
    { code: "great_vessels", label: "Aortic arch / great vessels" },
    { code: "carotid", label: "Carotid arteries" },
    { code: "vertebral", label: "Vertebral arteries" },
    { code: "subclavian", label: "Subclavian arteries" },
  ];

  const CERVICOCEPHALIC_SEGMENTS = {
    great_vessels: [
      { code: "aortic_arch", label: "Aortic arch", finalLabel: "aortic arch" },
      { code: "bca", label: "Brachiocephalic artery / innominate artery (BCA)", finalLabel: "brachiocephalic artery" },
      { code: "cca_origin", label: "Common carotid artery origin", finalLabel: "common carotid artery origin" },
      { code: "sca_origin", label: "Subclavian artery origin", finalLabel: "subclavian artery origin" },
    ],
    carotid: [
      { code: "cca", label: "Common carotid artery (CCA)", finalLabel: "CCA" },
      { code: "prox_cca", label: "Proximal CCA", finalLabel: "proximal CCA" },
      { code: "mid_cca", label: "Mid CCA", finalLabel: "mid CCA" },
      { code: "dist_cca", label: "Distal CCA", finalLabel: "distal CCA" },
      { code: "carotid_bifurcation", label: "Carotid bifurcation", finalLabel: "carotid bifurcation" },
      { code: "ica", label: "Internal carotid artery (ICA)", finalLabel: "ICA" },
      { code: "prox_ica", label: "Proximal ICA", finalLabel: "proximal ICA" },
      { code: "mid_ica", label: "Mid ICA", finalLabel: "mid ICA" },
      { code: "dist_extracranial_ica", label: "Distal extracranial ICA", finalLabel: "distal extracranial ICA" },
      { code: "eca", label: "External carotid artery (ECA)", finalLabel: "ECA" },
    ],
    vertebral: [
      { code: "va", label: "Vertebral artery (VA)", finalLabel: "VA" },
      { code: "v1", label: "V1 segment", finalLabel: "VA V1" },
      { code: "v2", label: "V2 segment", finalLabel: "VA V2" },
      { code: "v3", label: "V3 segment", finalLabel: "VA V3" },
    ],
    subclavian: [
      { code: "sca", label: "Subclavian artery (SCA)", finalLabel: "SCA" },
      { code: "prox_sca", label: "Proximal SCA", finalLabel: "proximal SCA" },
      { code: "mid_sca", label: "Mid SCA", finalLabel: "mid SCA" },
      { code: "dist_sca", label: "Distal SCA", finalLabel: "distal SCA" },
    ],
  };

  const HIERARCHICAL_VASCULAR_CATEGORY_CONFIGS = {
    lower_extremity: {
      vesselLabel: "Lower Extremity",
      sides: LOWER_EXTREMITY_SIDES,
      levels: LOWER_EXTREMITY_LEVELS,
      segments: LOWER_EXTREMITY_SEGMENTS,
    },
    cervicocephalic: {
      vesselLabel: "Cervicocephalic Arteries",
      sides: CERVICOCEPHALIC_SIDES,
      levels: CERVICOCEPHALIC_LEVELS,
      segments: CERVICOCEPHALIC_SEGMENTS,
    },
  };

  const PROJECTION_HELP_PAGES = [
    {
      key: "LM",
      title: "LM",
      subtitle: "Common angiographic projections for left main stem.",
      imagePath: "help/LM.png",
    },
    {
      key: "LAD",
      title: "LAD",
      subtitle: "Common angiographic projections for left anterior descending artery.",
      imagePath: "help/LAD.png",
    },
    {
      key: "LCx",
      title: "LCx",
      subtitle: "Common angiographic projections for left circumflex.",
      imagePath: "help/LCx.png",
    },
    {
      key: "RCA",
      title: "RCA",
      subtitle: "Common angiographic projections for right coronary artery.",
      imagePath: "help/RCA.png",
    },
  ];

  const PORTABLE_BUNDLE_KIND = "hagrad_qca_portable_case_bundle";
  const PORTABLE_BUNDLE_VERSION = 1;

  const state = {
    series: [],
    activeSeriesId: null,
    reportEntryCounter: 1,
    lastExportStudyId: "",
    history: [],
    redoHistory: [],
    isRestoringHistory: false,
    currentFrameIndex: 0,
    selectedFrameIndex: null,
    decoderFallbackReady: false,
    frameCache: new Map(),
    mode: MODES.anchors,
    returnMode: MODES.anchors,
    presentationFocus: false,
    focusSidebarOpen: false,
    focusReturnScroll: { x: 0, y: 0 },
    activeFocusSectionId: "workflow-section",
    renderQueued: false,
    renderToken: 0,
    canvasTransform: null,
    lastRenderedFrame: null,
    profileGeometry: null,
    overlayVisibility: {
      centerline: true,
      borders: true,
      lesion: true,
      lumen: false,
    },
    projectionHelpOpen: false,
    projectionHelpIndex: 0,
    localizationPromptOpen: false,
    localizationPromptMode: null,
    localizationPromptTargetEntryId: null,
    finishClosePromptOpen: false,
    exportStudy: {
      currentStudyId: "",
      studies: [],
    },
    activePopover: null,
    referenceSamplingTarget: null,
    dragging: null,
    cinePlayback: {
      isPlaying: false,
      timerId: null,
    },
    pointer: {
      imageX: null,
      imageY: null,
      value: null,
    },
    analysis: null,
    drawTargetMode: null,
    pendingRemovalRightClick: null,
    pendingLesionRightClick: null,
  };

  window.HAGRadWorkflowGuardState = {
    hasOpenStudy() {
      return state.series.length > 0 || Boolean(state.analysis);
    },
  };

  const els = {};
  const exportStudyApi = window.HAGRadExportStudies || null;
  let localizationPromptResolver = null;
  let finishClosePromptResolver = null;

  function cacheElements() {
    els.app = document.querySelector(".app");
    els.sidebar = document.querySelector(".sidebar");
    els.dicomInput = document.getElementById("dicom-input");
    els.dicomFolderInput = document.getElementById("dicom-folder-input");
    els.dicomAddInput = document.getElementById("dicom-add-input");
    els.dicomAddFolderInput = document.getElementById("dicom-add-folder-input");
    els.loadDicomButton = document.getElementById("load-dicom-button");
    els.loadDicomFolderButton = document.getElementById("load-dicom-folder-button");
    els.clearButton = document.getElementById("clear-button");
    els.statusPill = document.getElementById("status-pill");
    els.workflowNote = document.getElementById("workflow-note");
    els.workflowSteps = Array.from(document.querySelectorAll(".workflow-step"));
    els.loadPanel = document.getElementById("load-panel");
    els.workflowSection = document.getElementById("workflow-section");
    els.seriesSection = document.getElementById("series-section");
    els.vesselSection = document.getElementById("vessel-section");
    els.qcaSection = document.getElementById("qca-section");
    els.savedStenosesSection = document.getElementById("saved-stenoses-section");
    els.savedStenosesSummary = document.getElementById("saved-stenoses-summary");
    els.savedStenosesList = document.getElementById("saved-stenoses-list");
    els.viewerSection = document.getElementById("viewer-section");
    els.profileSection = document.getElementById("profile-section");
    els.seriesSummary = document.getElementById("series-summary");
    els.seriesList = document.getElementById("series-list");
    els.frameSlider = document.getElementById("frame-slider");
    els.previewFrameReadout = document.getElementById("preview-frame-readout");
    els.analysisFrameReadout = document.getElementById("analysis-frame-readout");
    els.selectFrameButton = document.getElementById("select-frame-button");
    els.jumpAnalysisFrameButton = document.getElementById("jump-analysis-frame-button");
    els.analysisCategorySelect = document.getElementById("analysis-category-select");
    els.coronaryVesselField = document.getElementById("coronary-vessel-field");
    els.vesselLabelInput = document.getElementById("vessel-label-input");
    els.lowerExtSideField = document.getElementById("lower-ext-side-field");
    els.lowerExtSideSelect = document.getElementById("lower-ext-side-select");
    els.lowerExtLevelField = document.getElementById("lower-ext-level-field");
    els.lowerExtLevelSelect = document.getElementById("lower-ext-level-select");
    els.segmentLocationField = document.getElementById("segment-location-field");
    els.segmentLocationLabel = document.getElementById("segment-location-label");
    els.segmentLocationSelect = document.getElementById("segment-location-select");
    els.cabgCustomLabelField = document.getElementById("cabg-custom-label-field");
    els.cabgCustomLabelInput = document.getElementById("cabg-custom-label-input");
    els.lesionLabelInput = document.getElementById("lesion-label-input");
    els.toolButtons = Array.from(document.querySelectorAll("[data-mode]"));
    els.resetWindowingButton = document.getElementById("reset-windowing-button");
    els.segmentButton = document.getElementById("segment-button");
    els.undoAnchorButton = document.getElementById("undo-anchor-button");
    els.resegmentButton = document.getElementById("resegment-button");
    els.clearSegmentationButton = document.getElementById("clear-segmentation-button");
    els.segmentationStatus = document.getElementById("segmentation-status");
    els.modeHint = document.getElementById("mode-hint");
    els.measurementNote = document.getElementById("measurement-note");
    els.calibrationLabelInput = document.getElementById("calibration-label-input");
    els.calibrationFrenchSelect = document.getElementById("calibration-french-select");
    els.calibrationStatusReadout = document.getElementById("calibration-status-readout");
    els.calibrationDetailReadout = document.getElementById("calibration-detail-readout");
    els.startCalibrationButton = document.getElementById("start-calibration-button");
    els.clearCalibrationButton = document.getElementById("clear-calibration-button");
    els.metricMld = document.getElementById("metric-mld");
    els.metricReference = document.getElementById("metric-reference");
    els.metricDs = document.getElementById("metric-ds");
    els.metricLength = document.getElementById("metric-length");
    els.calibrationBox = document.getElementById("calibration-box");
    els.exportResultsButton = document.getElementById("export-results-button");
    els.metadataList = document.getElementById("metadata-list");
    els.viewerTitle = document.getElementById("viewer-title");
    els.frameBadge = document.getElementById("frame-badge");
    els.modeBadge = document.getElementById("mode-badge");
    els.undoActionButton = document.getElementById("undo-action-button");
    els.redoActionButton = document.getElementById("redo-action-button");
    els.nextLesionButton = document.getElementById("next-lesion-button");
    els.finishCloseButton = document.getElementById("finish-close-button");
    els.displayVisibilityButton = document.getElementById("display-visibility-button");
    els.displayVisibilityPanel = document.getElementById("display-visibility-panel");
    els.overlayLayerButtons = Array.from(document.querySelectorAll("[data-overlay-layer]"));
    els.segmentationReferenceButton = document.getElementById("segmentation-reference-button");
    els.segmentationReferencePanel = document.getElementById("segmentation-reference-panel");
    els.vesselReferenceSwatch = document.getElementById("vessel-reference-swatch");
    els.backgroundReferenceSwatch = document.getElementById("background-reference-swatch");
    els.vesselReferenceReadout = document.getElementById("vessel-reference-readout");
    els.backgroundReferenceReadout = document.getElementById("background-reference-readout");
    els.pickVesselReferenceButton = document.getElementById("pick-vessel-reference-button");
    els.pickBackgroundReferenceButton = document.getElementById("pick-background-reference-button");
    els.clearReferenceTonesButton = document.getElementById("clear-reference-tones-button");
    els.projectionHelpButton = document.getElementById("projection-help-button");
    els.canvasResetWindowButton = document.getElementById("canvas-reset-window-button");
    els.canvasResetViewButton = document.getElementById("canvas-reset-view-button");
    els.canvasFocusToggleButton = document.getElementById("canvas-focus-toggle-button");
    els.canvasFocusExitButton = document.getElementById("canvas-focus-exit-button");
    els.focusWorkflowButtons = Array.from(document.querySelectorAll("[data-focus-sidebar-section]"));
    els.focusFinishCloseButton = document.getElementById("focus-finish-close-button");
    els.projectionHelpModal = document.getElementById("projection-help-modal");
    els.projectionHelpBackdrop = document.getElementById("projection-help-backdrop");
    els.projectionHelpCloseButton = document.getElementById("projection-help-close-button");
    els.projectionHelpTitle = document.getElementById("projection-help-title");
    els.projectionHelpSubtitle = document.getElementById("projection-help-subtitle");
    els.projectionHelpImage = document.getElementById("projection-help-image");
    els.projectionHelpPageIndicator = document.getElementById("projection-help-page-indicator");
    els.projectionHelpPrevButton = document.getElementById("projection-help-prev-button");
    els.projectionHelpNextButton = document.getElementById("projection-help-next-button");
    els.localizationModal = document.getElementById("localization-modal");
    els.localizationBackdrop = document.getElementById("localization-backdrop");
    els.localizationCloseButton = document.getElementById("localization-close-button");
    els.localizationTitle = document.getElementById("localization-title");
    els.localizationCopy = document.getElementById("localization-copy");
    els.localizationCategorySelect = document.getElementById("localization-category-select");
    els.localizationCoronaryVesselField = document.getElementById("localization-coronary-vessel-field");
    els.localizationVesselSelect = document.getElementById("localization-vessel-select");
    els.localizationLowerExtSideField = document.getElementById("localization-lower-ext-side-field");
    els.localizationLowerExtSideSelect = document.getElementById("localization-lower-ext-side-select");
    els.localizationLowerExtLevelField = document.getElementById("localization-lower-ext-level-field");
    els.localizationLowerExtLevelSelect = document.getElementById("localization-lower-ext-level-select");
    els.localizationSegmentLocationField = document.getElementById("localization-segment-location-field");
    els.localizationSegmentLocationLabel = document.getElementById("localization-segment-location-label");
    els.localizationSegmentSelect = document.getElementById("localization-segment-select");
    els.localizationCustomLabelField = document.getElementById("localization-custom-label-field");
    els.localizationCustomLabelInput = document.getElementById("localization-custom-label-input");
    els.localizationConfirmButton = document.getElementById("localization-confirm-button");
    els.finishCloseModal = document.getElementById("finish-close-modal");
    els.finishCloseBackdrop = document.getElementById("finish-close-backdrop");
    els.finishCloseModalCloseButton = document.getElementById("finish-close-modal-close-button");
    els.finishCloseBundleCheckbox = document.getElementById("finish-close-bundle-checkbox");
    els.finishCloseCancelButton = document.getElementById("finish-close-cancel-button");
    els.finishCloseConfirmButton = document.getElementById("finish-close-confirm-button");
    els.exportStudySelect = document.getElementById("export-study-select");
    els.exportStudyCreateInput = document.getElementById("export-study-create-input");
    els.exportStudyCreateButton = document.getElementById("export-study-create-button");
    els.exportStudyTargetNote = document.getElementById("export-study-target-note");
    els.canvasWrap = document.getElementById("canvas-wrap");
    els.imageCanvas = document.getElementById("image-canvas");
    els.overlayCanvas = document.getElementById("overlay-canvas");
    els.canvasOverlayMessage = document.getElementById("canvas-overlay-message");
    els.interactionReadout = document.getElementById("interaction-readout");
    els.pointerReadout = document.getElementById("pointer-readout");
    els.profileCanvas = document.getElementById("profile-canvas");
    els.profileNote = document.getElementById("profile-note");
  }

  function safeString(value) {
    return String(value || "").trim();
  }

  function parseFirstNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    const text = safeString(value);
    if (!text) {
      return null;
    }
    const match = text.match(/-?\d+(?:\.\d+)?/);
    return match ? Number.parseFloat(match[0]) : null;
  }

  function parseNumericArray(value) {
    const text = safeString(value);
    if (!text) {
      return [];
    }
    return text
      .split("\\")
      .map((part) => Number.parseFloat(part))
      .filter(Number.isFinite);
  }

  function prettifyPatientName(value) {
    const text = safeString(value);
    if (!text) {
      return "";
    }
    return text
      .split("^")
      .filter(Boolean)
      .join(", ");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function roundTo(value, decimals) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  function naturalCompare(left, right) {
    return safeString(left).localeCompare(safeString(right), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function inferAnalysisCategory(source) {
    const explicitCategory = safeString(source?.analysisCategory);
    if (explicitCategory) {
      return explicitCategory;
    }
    const vesselLabel = safeString(source?.vesselLabel);
    if (vesselLabel === "CABG") {
      return "coronary_cabg";
    }
    if (vesselLabel === "Lower Extremity") {
      return "lower_extremity";
    }
    if (vesselLabel === "Cervicocephalic Arteries") {
      return "cervicocephalic";
    }
    return "coronary_native";
  }

  function getSelectedAnalysisCategory() {
    return safeString(els.analysisCategorySelect?.value) || "coronary_native";
  }

  function getSelectedLocalizationCategory() {
    return safeString(els.localizationCategorySelect?.value);
  }

  function isCabgVessel(vesselLabel) {
    return safeString(vesselLabel) === "CABG";
  }

  function isCustomCabgSegmentCode(segmentCode) {
    return safeString(segmentCode) === "custom";
  }

  function getCustomCabgLabelValue(inputElement) {
    return safeString(inputElement?.value);
  }

  function getHierarchicalVascularCategoryConfig(category) {
    return HIERARCHICAL_VASCULAR_CATEGORY_CONFIGS[safeString(category)] || null;
  }

  function isHierarchicalVascularCategory(category) {
    return Boolean(getHierarchicalVascularCategoryConfig(category));
  }

  function getHierarchicalVesselLabel(category) {
    return safeString(getHierarchicalVascularCategoryConfig(category)?.vesselLabel);
  }

  function getHierarchicalSideDefinition(category, sideCode) {
    const config = getHierarchicalVascularCategoryConfig(category);
    return config?.sides?.find((side) => safeString(side.code) === safeString(sideCode)) || null;
  }

  function getHierarchicalLevelDefinition(category, levelCode) {
    const config = getHierarchicalVascularCategoryConfig(category);
    return config?.levels?.find((level) => safeString(level.code) === safeString(levelCode)) || null;
  }

  function getHierarchicalSegmentsForLevel(category, levelCode) {
    const config = getHierarchicalVascularCategoryConfig(category);
    return config?.segments?.[safeString(levelCode)] || [];
  }

  function getHierarchicalSegmentDefinition(category, levelCode, segmentCode) {
    return getHierarchicalSegmentsForLevel(category, levelCode).find((segment) => safeString(segment.code) === safeString(segmentCode)) || null;
  }

  function buildHierarchicalVascularLabel(category, sideCode, levelCode, segmentCode, explicitLabel) {
    const explicit = safeString(explicitLabel);
    if (explicit) {
      return explicit;
    }
    const side = getHierarchicalSideDefinition(category, sideCode);
    const segment = getHierarchicalSegmentDefinition(category, levelCode, segmentCode);
    if (!segment || !side) {
      return "";
    }
    return side.finalPrefix ? `${side.finalPrefix} ${segment.finalLabel}`.trim() : safeString(segment.finalLabel);
  }

  function populateSimpleOptions(selectElement, items, preferredCode, options) {
    if (!selectElement) {
      return "";
    }
    const normalizedItems = Array.isArray(items) ? items : [];
    const availableCodes = new Set(normalizedItems.map((item) => safeString(item.code)));
    const autoSelectFirst = options?.autoSelectFirst !== false;
    const includePlaceholder = options?.includePlaceholder !== false;
    const placeholderLabel = options?.placeholderLabel || "Choose option...";
    const selectedCode = availableCodes.has(safeString(preferredCode))
      ? safeString(preferredCode)
      : autoSelectFirst
        ? safeString(normalizedItems[0]?.code)
        : "";
    const optionMarkup = [];
    if (includePlaceholder || !normalizedItems.length) {
      optionMarkup.push(`<option value=""${selectedCode ? "" : " selected"}>${escapeHtml(placeholderLabel)}</option>`);
    }
    optionMarkup.push(
      ...normalizedItems.map((item) => {
        const code = safeString(item.code);
        const isSelected = code === selectedCode ? " selected" : "";
        return `<option value="${escapeHtml(code)}"${isSelected}>${escapeHtml(item.label)}</option>`;
      })
    );
    selectElement.innerHTML = optionMarkup.join("");
    selectElement.disabled = !normalizedItems.length;
    return selectedCode;
  }

  function getSegmentsForVessel(vesselLabel) {
    return CORONARY_SEGMENTS[safeString(vesselLabel)] || [];
  }

  function findSegmentDefinition(vesselLabel, segmentCode) {
    return getSegmentsForVessel(vesselLabel).find((segment) => safeString(segment.code) === safeString(segmentCode)) || null;
  }

  function resolveSegmentDefinition(vesselLabel, segmentCode, options) {
    const normalizedVesselLabel = safeString(vesselLabel);
    const normalizedSegmentCode = safeString(segmentCode);
    const baseDefinition = normalizedSegmentCode ? findSegmentDefinition(normalizedVesselLabel, normalizedSegmentCode) : null;
    const explicitLabel = safeString(options?.segmentLabel);
    const customLabel = safeString(options?.customLabel);

    if (isCabgVessel(normalizedVesselLabel) && isCustomCabgSegmentCode(normalizedSegmentCode)) {
      return {
        code: "custom",
        label: customLabel || explicitLabel || baseDefinition?.label || "Other / Custom",
        vesselLabel: normalizedVesselLabel,
        isCustom: true,
      };
    }

    if (baseDefinition) {
      return {
        ...baseDefinition,
        vesselLabel: normalizedVesselLabel,
      };
    }

    if (!normalizedSegmentCode && !explicitLabel) {
      return null;
    }

    return {
      code: normalizedSegmentCode,
      label: explicitLabel || customLabel,
      vesselLabel: normalizedVesselLabel,
      isCustom: false,
    };
  }

  function formatSegmentOptionLabel(segment) {
    if (!segment) {
      return "";
    }
    const vesselLabel = safeString(segment.vesselLabel);
    const segmentCode = safeString(segment.code);
    if (
      vesselLabel === "CABG" ||
      vesselLabel === "Lower Extremity" ||
      segmentCode === "custom" ||
      segmentCode.startsWith("cabg_") ||
      !/^\d+$/.test(segmentCode)
    ) {
      return safeString(segment.label);
    }
    return `Sg ${segment.code} - ${segment.label}`;
  }

  function getSelectedSegmentDefinition() {
    const category = getSelectedAnalysisCategory();
    if (category === "coronary_cabg") {
      return resolveSegmentDefinition("CABG", els.segmentLocationSelect?.value, {
        customLabel: getCustomCabgLabelValue(els.cabgCustomLabelInput),
      });
    }
    if (isHierarchicalVascularCategory(category)) {
      return {
        code: safeString(els.segmentLocationSelect?.value),
        label: buildHierarchicalVascularLabel(
          category,
          els.lowerExtSideSelect?.value,
          els.lowerExtLevelSelect?.value,
          els.segmentLocationSelect?.value
        ),
        vesselLabel: getHierarchicalVesselLabel(category),
      };
    }
    return resolveSegmentDefinition(els.vesselLabelInput?.value, els.segmentLocationSelect?.value, {
      customLabel: getCustomCabgLabelValue(els.cabgCustomLabelInput),
    });
  }

  function getSelectedLocalizationSegmentDefinition() {
    const category = getSelectedLocalizationCategory();
    if (category === "coronary_cabg") {
      return resolveSegmentDefinition("CABG", els.localizationSegmentSelect?.value, {
        customLabel: getCustomCabgLabelValue(els.localizationCustomLabelInput),
      });
    }
    if (isHierarchicalVascularCategory(category)) {
      return {
        code: safeString(els.localizationSegmentSelect?.value),
        label: buildHierarchicalVascularLabel(
          category,
          els.localizationLowerExtSideSelect?.value,
          els.localizationLowerExtLevelSelect?.value,
          els.localizationSegmentSelect?.value
        ),
        vesselLabel: getHierarchicalVesselLabel(category),
      };
    }
    return resolveSegmentDefinition(els.localizationVesselSelect?.value, els.localizationSegmentSelect?.value, {
      customLabel: getCustomCabgLabelValue(els.localizationCustomLabelInput),
    });
  }

  function populateSegmentLocationOptions(selectElement, vesselLabel, preferredCode, options) {
    if (!selectElement) {
      return null;
    }

    const segments = getSegmentsForVessel(vesselLabel);
    const availableCodes = new Set(segments.map((segment) => safeString(segment.code)));
    const autoSelectFirst = options?.autoSelectFirst !== false;
    const includePlaceholder = options?.includePlaceholder === true;
    const placeholderLabel = options?.placeholderLabel || (safeString(vesselLabel) ? "Choose segment..." : "Choose vessel first");
    const selectedCode = availableCodes.has(safeString(preferredCode))
      ? safeString(preferredCode)
      : autoSelectFirst
        ? segments[0]?.code || ""
        : "";

    const optionMarkup = [];
    if (includePlaceholder || !segments.length) {
      optionMarkup.push(
        `<option value=""${selectedCode ? "" : " selected"}>${escapeHtml(placeholderLabel)}</option>`
      );
    }
    optionMarkup.push(
      ...segments.map((segment) => {
        const isSelected = safeString(segment.code) === selectedCode ? " selected" : "";
        return `<option value="${escapeHtml(segment.code)}"${isSelected}>${escapeHtml(formatSegmentOptionLabel(segment))}</option>`;
      })
    );

    selectElement.innerHTML = optionMarkup.join("");
    selectElement.disabled = !segments.length;
    return findSegmentDefinition(vesselLabel, selectedCode);
  }

  function syncSegmentLocationOptions(vesselLabel, preferredCode) {
    return populateSegmentLocationOptions(els.segmentLocationSelect, vesselLabel, preferredCode, {
      autoSelectFirst: true,
      includePlaceholder: false,
    });
  }

  function syncLocalizationSegmentOptions(vesselLabel, preferredCode) {
    return populateSegmentLocationOptions(els.localizationSegmentSelect, vesselLabel, preferredCode, {
      autoSelectFirst: false,
      includePlaceholder: true,
      placeholderLabel: safeString(vesselLabel) ? "Choose segment..." : "Choose vessel first",
    });
  }

  function syncHierarchicalSideOptions(selectElement, category, preferredCode) {
    return populateSimpleOptions(selectElement, getHierarchicalVascularCategoryConfig(category)?.sides || [], preferredCode, {
      autoSelectFirst: false,
      includePlaceholder: true,
      placeholderLabel: "Choose side...",
    });
  }

  function syncHierarchicalLevelOptions(selectElement, category, preferredCode) {
    return populateSimpleOptions(selectElement, getHierarchicalVascularCategoryConfig(category)?.levels || [], preferredCode, {
      autoSelectFirst: false,
      includePlaceholder: true,
      placeholderLabel: "Choose vessel level...",
    });
  }

  function syncHierarchicalSegmentOptions(selectElement, category, levelCode, preferredCode) {
    return populateSimpleOptions(selectElement, getHierarchicalSegmentsForLevel(category, levelCode), preferredCode, {
      autoSelectFirst: false,
      includePlaceholder: true,
      placeholderLabel: safeString(levelCode) ? "Choose vessel / segment..." : "Choose vessel level first",
    });
  }

  function updateMainSelectionUi(options) {
    const category = options?.category || getSelectedAnalysisCategory();
    const source = options?.source || null;
    const preferredSide = safeString(options?.preferredSide || source?.lowerExtSide);
    const preferredLevel = safeString(options?.preferredLevel || source?.lowerExtLevel);
    const preferredSegmentCode = safeString(options?.preferredSegmentCode || source?.segmentCode);
    const preferredSegmentLabel = safeString(options?.preferredSegmentLabel || source?.segmentLabel);
    const preferredVesselLabel = safeString(options?.preferredVesselLabel || source?.vesselLabel);

    if (els.analysisCategorySelect && els.analysisCategorySelect.value !== category) {
      els.analysisCategorySelect.value = category;
    }

    if (els.coronaryVesselField) {
      els.coronaryVesselField.hidden = category !== "coronary_native";
    }
    if (els.lowerExtSideField) {
      els.lowerExtSideField.hidden = !isHierarchicalVascularCategory(category);
    }
    if (els.lowerExtLevelField) {
      els.lowerExtLevelField.hidden = !isHierarchicalVascularCategory(category) || !safeString(els.lowerExtSideSelect?.value || preferredSide);
    }
    if (els.segmentLocationField) {
      els.segmentLocationField.hidden =
        !category || (isHierarchicalVascularCategory(category) && !safeString(els.lowerExtLevelSelect?.value || preferredLevel));
    }

    if (category === "coronary_native") {
      const vesselLabel = preferredVesselLabel || "LAD";
      if (els.vesselLabelInput) {
        els.vesselLabelInput.value = vesselLabel;
      }
      if (els.segmentLocationLabel) {
        els.segmentLocationLabel.textContent = "Segment Localization";
      }
      syncSegmentLocationOptions(vesselLabel, preferredSegmentCode);
      if (els.cabgCustomLabelInput) {
        els.cabgCustomLabelInput.value = "";
      }
    } else if (category === "coronary_cabg") {
      if (els.segmentLocationLabel) {
        els.segmentLocationLabel.textContent = "CABG Graft";
      }
      syncSegmentLocationOptions("CABG", preferredSegmentCode);
      if (els.cabgCustomLabelInput) {
        els.cabgCustomLabelInput.value = isCustomCabgSegmentCode(preferredSegmentCode) ? preferredSegmentLabel : "";
      }
    } else if (isHierarchicalVascularCategory(category)) {
      if (els.segmentLocationLabel) {
        els.segmentLocationLabel.textContent = "Vessel / Segment";
      }
      const selectedSide = syncHierarchicalSideOptions(els.lowerExtSideSelect, category, preferredSide);
      if (els.lowerExtLevelField) {
        els.lowerExtLevelField.hidden = !selectedSide;
      }
      const selectedLevel = selectedSide
        ? syncHierarchicalLevelOptions(els.lowerExtLevelSelect, category, preferredLevel)
        : syncHierarchicalLevelOptions(els.lowerExtLevelSelect, category, "");
      if (els.segmentLocationField) {
        els.segmentLocationField.hidden = !selectedLevel;
      }
      if (selectedLevel) {
        syncHierarchicalSegmentOptions(els.segmentLocationSelect, category, selectedLevel, preferredSegmentCode);
      } else if (els.segmentLocationSelect) {
        syncHierarchicalSegmentOptions(els.segmentLocationSelect, category, "", "");
      }
      if (els.cabgCustomLabelInput) {
        els.cabgCustomLabelInput.value = "";
      }
    } else {
      if (els.segmentLocationField) {
        els.segmentLocationField.hidden = false;
      }
    }
    updateCabgCustomInputsUi();
  }

  function updateLocalizationSelectionUi(options) {
    const category = options?.category || getSelectedLocalizationCategory();
    const source = options?.source || null;
    const preferredSide = safeString(options?.preferredSide || source?.lowerExtSide);
    const preferredLevel = safeString(options?.preferredLevel || source?.lowerExtLevel);
    const preferredSegmentCode = safeString(options?.preferredSegmentCode || source?.segmentCode);
    const preferredSegmentLabel = safeString(options?.preferredSegmentLabel || source?.segmentLabel);
    const preferredVesselLabel = safeString(options?.preferredVesselLabel || source?.vesselLabel);

    if (els.localizationCategorySelect && els.localizationCategorySelect.value !== category) {
      els.localizationCategorySelect.value = category;
    }
    if (els.localizationCoronaryVesselField) {
      els.localizationCoronaryVesselField.hidden = category !== "coronary_native";
    }
    if (els.localizationLowerExtSideField) {
      els.localizationLowerExtSideField.hidden = !isHierarchicalVascularCategory(category);
    }
    if (els.localizationLowerExtLevelField) {
      els.localizationLowerExtLevelField.hidden = !isHierarchicalVascularCategory(category) || !safeString(els.localizationLowerExtSideSelect?.value || preferredSide);
    }
    if (els.localizationSegmentLocationField) {
      els.localizationSegmentLocationField.hidden =
        !category ||
        (isHierarchicalVascularCategory(category) && !safeString(els.localizationLowerExtLevelSelect?.value || preferredLevel));
    }

    if (category === "coronary_native") {
      if (els.localizationVesselSelect) {
        els.localizationVesselSelect.value = preferredVesselLabel || "";
      }
      if (els.localizationSegmentLocationLabel) {
        els.localizationSegmentLocationLabel.textContent = "Segment Localization";
      }
      syncLocalizationSegmentOptions(preferredVesselLabel, preferredSegmentCode);
      if (els.localizationCustomLabelInput) {
        els.localizationCustomLabelInput.value = "";
      }
    } else if (category === "coronary_cabg") {
      if (els.localizationSegmentLocationLabel) {
        els.localizationSegmentLocationLabel.textContent = "CABG Graft";
      }
      syncLocalizationSegmentOptions("CABG", preferredSegmentCode);
      if (els.localizationCustomLabelInput) {
        els.localizationCustomLabelInput.value = isCustomCabgSegmentCode(preferredSegmentCode) ? preferredSegmentLabel : "";
      }
    } else if (isHierarchicalVascularCategory(category)) {
      if (els.localizationSegmentLocationLabel) {
        els.localizationSegmentLocationLabel.textContent = "Vessel / Segment";
      }
      const selectedSide = syncHierarchicalSideOptions(els.localizationLowerExtSideSelect, category, preferredSide);
      if (els.localizationLowerExtLevelField) {
        els.localizationLowerExtLevelField.hidden = !selectedSide;
      }
      const selectedLevel = selectedSide
        ? syncHierarchicalLevelOptions(els.localizationLowerExtLevelSelect, category, preferredLevel)
        : syncHierarchicalLevelOptions(els.localizationLowerExtLevelSelect, category, "");
      if (els.localizationSegmentLocationField) {
        els.localizationSegmentLocationField.hidden = !selectedLevel;
      }
      if (selectedLevel) {
        syncHierarchicalSegmentOptions(els.localizationSegmentSelect, category, selectedLevel, preferredSegmentCode);
      } else if (els.localizationSegmentSelect) {
        syncHierarchicalSegmentOptions(els.localizationSegmentSelect, category, "", "");
      }
      if (els.localizationCustomLabelInput) {
        els.localizationCustomLabelInput.value = "";
      }
    } else {
      if (els.localizationSegmentLocationField) {
        els.localizationSegmentLocationField.hidden = false;
      }
    }
    updateCabgCustomInputsUi();
  }

  function getCurrentSelectionFromUi() {
    const analysisCategory = getSelectedAnalysisCategory();
    if (analysisCategory === "coronary_cabg") {
      const segment = resolveSegmentDefinition("CABG", els.segmentLocationSelect?.value, {
        customLabel: getCustomCabgLabelValue(els.cabgCustomLabelInput),
      });
      return {
        analysisCategory,
        vesselLabel: "CABG",
        segmentCode: safeString(segment?.code),
        segmentLabel: safeString(segment?.label),
        lowerExtSide: "",
        lowerExtLevel: "",
      };
    }
    if (isHierarchicalVascularCategory(analysisCategory)) {
      return {
        analysisCategory,
        vesselLabel: getHierarchicalVesselLabel(analysisCategory),
        segmentCode: safeString(els.segmentLocationSelect?.value),
        segmentLabel: buildHierarchicalVascularLabel(
          analysisCategory,
          els.lowerExtSideSelect?.value,
          els.lowerExtLevelSelect?.value,
          els.segmentLocationSelect?.value
        ),
        lowerExtSide: safeString(els.lowerExtSideSelect?.value),
        lowerExtLevel: safeString(els.lowerExtLevelSelect?.value),
      };
    }
    const segment = resolveSegmentDefinition(els.vesselLabelInput?.value, els.segmentLocationSelect?.value, {
      customLabel: getCustomCabgLabelValue(els.cabgCustomLabelInput),
    });
    return {
      analysisCategory,
      vesselLabel: safeString(els.vesselLabelInput?.value),
      segmentCode: safeString(segment?.code),
      segmentLabel: safeString(segment?.label),
      lowerExtSide: "",
      lowerExtLevel: "",
    };
  }

  function getCurrentLocalizationSelectionFromUi() {
    const analysisCategory = getSelectedLocalizationCategory();
    if (analysisCategory === "coronary_cabg") {
      const segment = resolveSegmentDefinition("CABG", els.localizationSegmentSelect?.value, {
        customLabel: getCustomCabgLabelValue(els.localizationCustomLabelInput),
      });
      return {
        analysisCategory,
        vesselLabel: "CABG",
        segment,
        lowerExtSide: "",
        lowerExtLevel: "",
      };
    }
    if (isHierarchicalVascularCategory(analysisCategory)) {
      return {
        analysisCategory,
        vesselLabel: getHierarchicalVesselLabel(analysisCategory),
        segment: {
          code: safeString(els.localizationSegmentSelect?.value),
          label: buildHierarchicalVascularLabel(
            analysisCategory,
            els.localizationLowerExtSideSelect?.value,
            els.localizationLowerExtLevelSelect?.value,
            els.localizationSegmentSelect?.value
          ),
          vesselLabel: getHierarchicalVesselLabel(analysisCategory),
        },
        lowerExtSide: safeString(els.localizationLowerExtSideSelect?.value),
        lowerExtLevel: safeString(els.localizationLowerExtLevelSelect?.value),
      };
    }
    return {
      analysisCategory,
      vesselLabel: safeString(els.localizationVesselSelect?.value),
      segment: resolveSegmentDefinition(els.localizationVesselSelect?.value, els.localizationSegmentSelect?.value, {
        customLabel: getCustomCabgLabelValue(els.localizationCustomLabelInput),
      }),
      lowerExtSide: "",
      lowerExtLevel: "",
    };
  }

  function updateCabgCustomInputsUi() {
    const showMainCustomField =
      getSelectedAnalysisCategory() === "coronary_cabg" && isCustomCabgSegmentCode(els.segmentLocationSelect?.value);
    if (els.cabgCustomLabelField) {
      els.cabgCustomLabelField.hidden = !showMainCustomField;
    }
    if (!showMainCustomField && els.cabgCustomLabelInput) {
      els.cabgCustomLabelInput.value = "";
    }

    const showLocalizationCustomField =
      getSelectedLocalizationCategory() === "coronary_cabg" && isCustomCabgSegmentCode(els.localizationSegmentSelect?.value);
    if (els.localizationCustomLabelField) {
      els.localizationCustomLabelField.hidden = !showLocalizationCustomField;
    }
    if (!showLocalizationCustomField && els.localizationCustomLabelInput) {
      els.localizationCustomLabelInput.value = "";
    }
  }

  function getLocalizationSummary(source, options) {
    const allowUiFallback = options?.allowUiFallback === true;
    const vesselLabel = safeString(source?.vesselLabel) || (allowUiFallback ? safeString(els.vesselLabelInput?.value) : "") || "—";
    const segmentCode = safeString(source?.segmentCode);
    const segmentLabel = safeString(source?.segmentLabel);
    const segment =
      resolveSegmentDefinition(vesselLabel, segmentCode, {
        segmentLabel,
      }) || (allowUiFallback ? getSelectedSegmentDefinition() : null);
    const resolvedSegmentCode = safeString(segment?.code || segmentCode);
    const resolvedSegmentLabel = safeString(segment?.label || segmentLabel);
    return {
      vesselLabel,
      segmentCode: resolvedSegmentCode,
      segmentLabel: resolvedSegmentLabel,
      segmentDisplay:
        segment || (resolvedSegmentCode && resolvedSegmentLabel)
          ? formatSegmentOptionLabel({ code: resolvedSegmentCode, label: resolvedSegmentLabel })
          : "—",
    };
  }

  function distance(a, b) {
    return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
  }

  function subtractPoints(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  }

  function addPoints(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  function scalePoint(point, factor) {
    return { x: point.x * factor, y: point.y * factor };
  }

  function normalizeVector(vector) {
    const length = Math.hypot(vector.x, vector.y);
    if (!length) {
      return { x: 1, y: 0 };
    }
    return { x: vector.x / length, y: vector.y / length };
  }

  function perpendicular(vector) {
    return { x: -vector.y, y: vector.x };
  }

  function dotPoint(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function clonePoint(point) {
    return { x: point.x, y: point.y };
  }

  function clonePoints(points) {
    return (points || []).map(clonePoint);
  }

  function formatDate(value) {
    const text = safeString(value);
    if (!/^\d{8}$/.test(text)) {
      return text || "—";
    }
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }

  function formatTime(value) {
    const text = safeString(value).replace(/\./g, "");
    if (!/^\d{2,6}$/.test(text)) {
      return text || "—";
    }
    const padded = text.padEnd(6, "0");
    return `${padded.slice(0, 2)}:${padded.slice(2, 4)}:${padded.slice(4, 6)}`;
  }

  function formatDateTime(dateValue, timeValue) {
    const dateText = formatDate(dateValue);
    const timeText = formatTime(timeValue);
    if (dateText === "—" && timeText === "—") {
      return "—";
    }
    if (dateText === "—") {
      return timeText;
    }
    if (timeText === "—") {
      return dateText;
    }
    return `${dateText} ${timeText}`;
  }

  function getDicomDateTimeMs(dateValue, timeValue) {
    const dateText = safeString(dateValue);
    if (!/^\d{8}$/.test(dateText)) {
      return null;
    }
    const timeText = safeString(timeValue).replace(/\./g, "");
    const paddedTime = /^\d{2,6}$/.test(timeText) ? timeText.padEnd(6, "0") : "000000";
    const year = Number.parseInt(dateText.slice(0, 4), 10);
    const month = Number.parseInt(dateText.slice(4, 6), 10) - 1;
    const day = Number.parseInt(dateText.slice(6, 8), 10);
    const hour = Number.parseInt(paddedTime.slice(0, 2), 10);
    const minute = Number.parseInt(paddedTime.slice(2, 4), 10);
    const second = Number.parseInt(paddedTime.slice(4, 6), 10);
    return Date.UTC(year, month, day, hour, minute, second);
  }

  function formatDurationSeconds(value) {
    return Number.isFinite(value) ? `${roundTo(value, 1)} s` : "—";
  }

  function formatValue(value, suffix, decimals) {
    return Number.isFinite(value) ? `${roundTo(value, decimals)} ${suffix}`.trim() : "-";
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? `${roundTo(value, 1)}%` : "-";
  }

  function setStatus(message, tone) {
    els.statusPill.textContent = message;
    els.statusPill.classList.remove("is-warning", "is-error");
    if (tone === "warning") {
      els.statusPill.classList.add("is-warning");
    } else if (tone === "error") {
      els.statusPill.classList.add("is-error");
    }
  }

  function getActiveSeries() {
    return state.series.find((series) => series.id === state.activeSeriesId) || null;
  }

  function getSeriesById(seriesId) {
    return state.series.find((series) => series.id === seriesId) || null;
  }

  function deepClone(value) {
    if (value == null) {
      return value;
    }
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function sanitizeForHistory(value, seen) {
    if (value == null || typeof value !== "object") {
      return value;
    }
    if (value instanceof Promise) {
      return undefined;
    }
    if (
      (typeof ImageData !== "undefined" && value instanceof ImageData) ||
      (typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement) ||
      (typeof HTMLElement !== "undefined" && value instanceof HTMLElement)
    ) {
      return undefined;
    }
    if (
      value instanceof File ||
      value instanceof Blob ||
      value instanceof Date ||
      value instanceof ArrayBuffer ||
      ArrayBuffer.isView(value)
    ) {
      return value;
    }
    const nextSeen = seen || new WeakMap();
    if (nextSeen.has(value)) {
      return nextSeen.get(value);
    }
    if (Array.isArray(value)) {
      const output = [];
      nextSeen.set(value, output);
      value.forEach((item) => {
        const sanitized = sanitizeForHistory(item, nextSeen);
        if (sanitized !== undefined) {
          output.push(sanitized);
        }
      });
      return output;
    }

    const output = {};
    nextSeen.set(value, output);
    Object.entries(value).forEach(([key, entryValue]) => {
      if (
        key === "arrayBufferPromise" ||
        key === "dataSetPromise" ||
        key === "fileImageId" ||
        key === "renderCanvas" ||
        key === "imageData" ||
        key === "pixels" ||
        key === "normalized" ||
        key === "gradient"
      ) {
        return;
      }
      const sanitized = sanitizeForHistory(entryValue, nextSeen);
      if (sanitized !== undefined) {
        output[key] = sanitized;
      }
    });
    return output;
  }

  function slugify(value, fallback) {
    const slug = safeString(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return slug || fallback;
  }

  function buildSeriesStateKey(seriesLike) {
    return safeString(seriesLike?.seriesInstanceUID || seriesLike?.key || seriesLike?.id || seriesLike?.label);
  }

  function isPotentialBundleFile(file) {
    const name = safeString(file?.name).toLowerCase();
    return name.endsWith(".hqcabundle") || name.endsWith(".json");
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return window.btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  function getDefaultOverlayVisibility() {
    return {
      centerline: true,
      borders: true,
      lesion: true,
      lumen: false,
    };
  }

  function getDefaultSeriesViewSnapshot() {
    return {
      zoom: 1,
      panX: 0,
      panY: 0,
      windowCenter: null,
      windowWidth: null,
    };
  }

  function normalizeSeriesViewSnapshot(view) {
    return {
      zoom: Number.isFinite(view?.zoom) ? view.zoom : 1,
      panX: Number.isFinite(view?.panX) ? view.panX : 0,
      panY: Number.isFinite(view?.panY) ? view.panY : 0,
      windowCenter: Number.isFinite(view?.windowCenter) ? view.windowCenter : null,
      windowWidth: Number.isFinite(view?.windowWidth) && view.windowWidth > 0 ? view.windowWidth : null,
    };
  }

  function collectUniqueDicomFiles(seriesList) {
    const files = [];
    const seen = new Set();
    (seriesList || []).forEach((series) => {
      (series.frames || []).forEach((frame) => {
        const file = frame?.record?.file;
        if (!file || seen.has(file)) {
          return;
        }
        seen.add(file);
        files.push(file);
      });
    });
    return files;
  }

  function buildPortableBundleSeriesSnapshot(series) {
    return {
      stateKey: buildSeriesStateKey(series),
      id: safeString(series?.id),
      key: safeString(series?.key),
      label: safeString(series?.label),
      seriesInstanceUID: safeString(series?.seriesInstanceUID),
      currentFrameIndex: Number.isFinite(series?.currentFrameIndex) ? series.currentFrameIndex : 0,
      selectedFrameIndex: Number.isFinite(series?.selectedFrameIndex) ? series.selectedFrameIndex : null,
      analysis: deepClone(series?.analysis || null),
      reportEntries: deepClone(getSeriesReportEntries(series)),
      view: normalizeSeriesViewSnapshot(series?.view || getDefaultSeriesViewSnapshot()),
      draftAnalysisCategory: safeString(series?.draftAnalysisCategory),
      draftVesselLabel: safeString(series?.draftVesselLabel),
      draftLowerExtSide: safeString(series?.draftLowerExtSide),
      draftLowerExtLevel: safeString(series?.draftLowerExtLevel),
      draftSegmentCode: safeString(series?.draftSegmentCode),
      draftSegmentLabel: safeString(series?.draftSegmentLabel),
      draftLesionLabel: safeString(series?.draftLesionLabel),
    };
  }

  async function buildPortableBundlePayload(studyId) {
    persistActiveSeriesState();
    const files = collectUniqueDicomFiles(state.series);
    const dicomFiles = [];
    for (const file of files) {
      dicomFiles.push({
        name: safeString(file?.name) || "image.dcm",
        type: safeString(file?.type) || "application/dicom",
        lastModified: Number.isFinite(file?.lastModified) ? file.lastModified : Date.now(),
        base64: arrayBufferToBase64(await file.arrayBuffer()),
      });
    }
    return {
      kind: PORTABLE_BUNDLE_KIND,
      version: PORTABLE_BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      studyId: safeString(studyId),
      workspace: {
        activeSeriesStateKey: buildSeriesStateKey(getActiveSeries()),
        reportEntryCounter: state.reportEntryCounter,
        mode: state.mode,
        drawTargetMode: state.drawTargetMode,
        overlayVisibility: deepClone(state.overlayVisibility),
        calibrationLabelValue: safeString(els.calibrationLabelInput?.value) || "Guide catheter",
        calibrationFrenchValue: safeString(els.calibrationFrenchSelect?.value) || "5",
        lastExportStudyId: safeString(studyId) || safeString(state.lastExportStudyId),
      },
      seriesStates: state.series.map((series) => buildPortableBundleSeriesSnapshot(series)),
      dicomFiles,
    };
  }

  async function exportPortableBundle(options) {
    if (!state.series.length) {
      throw new Error("No study is loaded.");
    }
    const studyId = safeString(options?.studyId);
    const entries = buildReportExportEntries();
    if (!options?.silent) {
      setStatus("Building portable case bundle...");
    }
    const payload = await buildPortableBundlePayload(studyId);
    const blob = new Blob([JSON.stringify(payload)], {
      type: "application/json;charset=utf-8",
    });
    const filename = buildReportFilename("portable_case_bundle", "hqcabundle", entries.length, studyId);
    if (options?.returnFile) {
      return { filename, blob };
    }
    await downloadExportBundle(
      [{ filename, blob }],
      window.HAGRadZip?.zipNameFrom ? window.HAGRadZip.zipNameFrom(filename) : buildReportFilename("portable_case_bundle", "zip", entries.length, studyId),
      { patientStudyId: studyId }
    );
    if (!options?.silent) {
      setStatus(`Portable case bundle exported as a ZIP.`);
    }
    return filename;
  }

  function applySeriesSnapshotToRehydratedSeries(series, snapshot) {
    if (!series || !snapshot) {
      return;
    }
    const maxFrameIndex = Math.max(0, (series.frames?.length || 1) - 1);
    const nextId = safeString(snapshot.id) || series.id;
    series.id = nextId;
    series.key = safeString(snapshot.key) || series.key;
    series.label = safeString(snapshot.label) || series.label;
    series.seriesInstanceUID = safeString(snapshot.seriesInstanceUID) || series.seriesInstanceUID;
    (series.frames || []).forEach((frame) => {
      frame.seriesId = nextId;
      frame.id = `${nextId}_frame_${frame.globalFrameIndex}`;
    });
    series.currentFrameIndex = clamp(Math.round(snapshot.currentFrameIndex || 0), 0, maxFrameIndex);
    series.selectedFrameIndex = Number.isFinite(snapshot.selectedFrameIndex)
      ? clamp(Math.round(snapshot.selectedFrameIndex), 0, maxFrameIndex)
      : null;
    series.analysis = deepClone(snapshot.analysis || null);
    if (series.analysis && Number.isFinite(series.analysis.frameIndex)) {
      series.analysis.frameIndex = clamp(Math.round(series.analysis.frameIndex), 0, maxFrameIndex);
    }
    series.reportEntries = deepClone(snapshot.reportEntries || []);
    series.reportEntries.forEach((entry) => {
      entry.seriesId = nextId;
      entry.seriesLabel = series.label || entry.seriesLabel || "";
      if (Number.isFinite(entry.frameIndex)) {
        entry.frameIndex = clamp(Math.round(entry.frameIndex), 0, maxFrameIndex);
        entry.frameNumber = entry.frameIndex + 1;
      }
    });
    series.view = normalizeSeriesViewSnapshot(snapshot.view);
    series.draftAnalysisCategory = safeString(snapshot.draftAnalysisCategory);
    series.draftVesselLabel = safeString(snapshot.draftVesselLabel);
    series.draftLowerExtSide = safeString(snapshot.draftLowerExtSide);
    series.draftLowerExtLevel = safeString(snapshot.draftLowerExtLevel);
    series.draftSegmentCode = safeString(snapshot.draftSegmentCode);
    series.draftSegmentLabel = safeString(snapshot.draftSegmentLabel);
    series.draftLesionLabel = safeString(snapshot.draftLesionLabel);
  }

  function rehydrateBundleFile(snapshot, index) {
    if (!snapshot?.base64) {
      throw new Error(`Portable bundle DICOM item ${index + 1} is missing its payload.`);
    }
    const buffer = base64ToArrayBuffer(snapshot.base64);
    return new File([buffer], safeString(snapshot.name) || `bundle_${index + 1}.dcm`, {
      type: safeString(snapshot.type) || "application/dicom",
      lastModified: Number.isFinite(snapshot.lastModified) ? snapshot.lastModified : Date.now(),
    });
  }

  async function loadPortableBundlePayload(payload, options) {
    if (safeString(payload?.kind) !== PORTABLE_BUNDLE_KIND) {
      throw new Error("The selected file is not a HAGRad QCA portable case bundle.");
    }
    if (Number(payload?.version) !== PORTABLE_BUNDLE_VERSION) {
      throw new Error("This portable case bundle version is not supported by the current QCA build.");
    }
    if (!Array.isArray(payload?.dicomFiles) || !payload.dicomFiles.length) {
      throw new Error("The portable case bundle does not contain any DICOM files.");
    }
    if (options?.append && state.series.length) {
      throw new Error("Portable case bundles replace the current study. Clear the study first.");
    }

    const files = payload.dicomFiles.map((fileSnapshot, index) => rehydrateBundleFile(fileSnapshot, index));
    stopCinePlayback({ silent: true });
    if (!options?.append) {
      recordHistoryStep("load portable bundle");
      clearStudy({ skipHistory: true });
    }
    setStatus(`Reading portable case bundle with ${files.length} embedded DICOM file${files.length === 1 ? "" : "s"}...`);
    const records = await parseDicomFiles(files, {
      onProgress(done, total) {
        setStatus(`Reading embedded DICOM headers ${done} / ${total}...`);
      },
    });
    if (!records.length) {
      throw new Error("The portable case bundle could not restore any readable DICOM files.");
    }
    const groups = groupSeries(records);
    if (!groups.length) {
      throw new Error("The portable case bundle does not contain any readable angiography series.");
    }

    const nextSeries = groups.map((group, index) => buildSeriesFromGroup(group, index));
    const snapshotQueues = new Map();
    (payload.seriesStates || []).forEach((snapshot) => {
      const key = buildSeriesStateKey(snapshot);
      if (!snapshotQueues.has(key)) {
        snapshotQueues.set(key, []);
      }
      snapshotQueues.get(key).push(snapshot);
    });

    nextSeries.forEach((series) => {
      const key = buildSeriesStateKey(series);
      let snapshot = snapshotQueues.get(key)?.shift() || null;
      if (!snapshot) {
        const fallbackQueue = Array.from(snapshotQueues.values()).find((queue) => queue.length);
        snapshot = fallbackQueue?.shift() || null;
      }
      applySeriesSnapshotToRehydratedSeries(series, snapshot);
    });

    state.series = nextSeries;
    const activeSeriesKey = safeString(payload.workspace?.activeSeriesStateKey);
    state.activeSeriesId =
      nextSeries.find((series) => buildSeriesStateKey(series) === activeSeriesKey)?.id ||
      nextSeries[0]?.id ||
      null;
    state.reportEntryCounter = Number.isFinite(payload.workspace?.reportEntryCounter)
      ? Math.max(1, Math.round(payload.workspace.reportEntryCounter))
      : Math.max(
          1,
          ...nextSeries.flatMap((series) => getSeriesReportEntries(series).map((entry) => Number.isFinite(entry.order) ? entry.order + 1 : 1))
        );
    state.mode = payload.workspace?.mode || MODES.anchors;
    state.drawTargetMode =
      payload.workspace?.drawTargetMode === MODES.centerline || payload.workspace?.drawTargetMode === MODES.borders
        ? payload.workspace.drawTargetMode
        : null;
    if (state.mode === MODES.draw && !state.drawTargetMode) {
      state.mode = MODES.anchors;
    }
    state.returnMode =
      state.mode === MODES.draw
        ? state.drawTargetMode || MODES.anchors
        : state.mode !== MODES.zoom && state.mode !== MODES.windowing
          ? state.mode
          : MODES.anchors;
    state.overlayVisibility = deepClone(payload.workspace?.overlayVisibility) || getDefaultOverlayVisibility();
    state.lastExportStudyId = safeString(payload.studyId || payload.workspace?.lastExportStudyId);
    state.history = [];
    state.redoHistory = [];
    state.dragging = null;
    state.pendingRemovalRightClick = null;
    state.pendingLesionRightClick = null;
    state.referenceSamplingTarget = null;
    state.pointer = { imageX: null, imageY: null, value: null };
    state.canvasTransform = null;
    state.profileGeometry = null;
    state.projectionHelpOpen = false;
    state.projectionHelpIndex = 0;
    state.localizationPromptOpen = false;
    state.localizationPromptMode = null;
    state.localizationPromptTargetEntryId = null;
    state.finishClosePromptOpen = false;
    localizationPromptResolver = null;
    finishClosePromptResolver = null;
    if (els.calibrationLabelInput) {
      els.calibrationLabelInput.value = safeString(payload.workspace?.calibrationLabelValue) || "Guide catheter";
    }
    if (els.calibrationFrenchSelect) {
      els.calibrationFrenchSelect.value = safeString(payload.workspace?.calibrationFrenchValue) || "5";
    }
    loadSeriesState(getActiveSeries());
    updateUi();
    scheduleRender();
    setStatus(`Loaded portable case bundle with ${nextSeries.length} angiography series.`);
  }

  async function loadPortableBundleFromFile(file, options) {
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch (_error) {
      throw new Error("The selected portable case bundle could not be read.");
    }
    await loadPortableBundlePayload(payload, options);
  }

  function hasUndoableWorkspaceState() {
    return Boolean(
      state.series.length ||
        Number.isFinite(state.selectedFrameIndex) ||
        state.analysis ||
        getAllReportEntries().length
    );
  }

  function captureHistorySnapshot() {
    return {
      series: sanitizeForHistory(state.series),
      activeSeriesId: state.activeSeriesId,
      reportEntryCounter: state.reportEntryCounter,
      currentFrameIndex: state.currentFrameIndex,
      selectedFrameIndex: state.selectedFrameIndex,
      mode: state.mode,
      drawTargetMode: state.drawTargetMode,
      overlayVisibility: deepClone(state.overlayVisibility),
      calibrationLabelValue: safeString(els.calibrationLabelInput?.value) || "Guide catheter",
      calibrationFrenchValue: safeString(els.calibrationFrenchSelect?.value) || "5",
      pendingLesionRightClick: sanitizeForHistory(state.pendingLesionRightClick),
    };
  }

  function recordHistoryStep(label) {
    if (state.isRestoringHistory || !hasUndoableWorkspaceState()) {
      return;
    }
    state.redoHistory = [];
    try {
      state.history.push({
        label: safeString(label) || "last action",
        snapshot: captureHistorySnapshot(),
      });
      if (state.history.length > MAX_HISTORY_ENTRIES) {
        state.history.splice(0, state.history.length - MAX_HISTORY_ENTRIES);
      }
    } catch (error) {
      console.warn("QCA history snapshot skipped", error);
    }
  }

  function restoreHistorySnapshot(entry) {
    state.isRestoringHistory = true;
    try {
      stopCinePlayback({ silent: true });
      const snapshot = entry.snapshot;
      state.series = sanitizeForHistory(snapshot.series) || [];
      state.activeSeriesId = snapshot.activeSeriesId || null;
      state.reportEntryCounter = Number.isFinite(snapshot.reportEntryCounter) ? snapshot.reportEntryCounter : 1;
      state.currentFrameIndex = Number.isFinite(snapshot.currentFrameIndex) ? snapshot.currentFrameIndex : 0;
      state.selectedFrameIndex = Number.isFinite(snapshot.selectedFrameIndex) ? snapshot.selectedFrameIndex : null;
      state.mode = snapshot.mode || MODES.anchors;
      state.drawTargetMode =
        snapshot.drawTargetMode === MODES.centerline || snapshot.drawTargetMode === MODES.borders
          ? snapshot.drawTargetMode
          : null;
      if (state.mode === MODES.draw && !state.drawTargetMode) {
        state.mode = MODES.anchors;
      }
      state.returnMode =
        state.mode === MODES.draw
          ? state.drawTargetMode || MODES.anchors
          : state.mode !== MODES.zoom && state.mode !== MODES.windowing
            ? state.mode
            : MODES.anchors;
      state.overlayVisibility = deepClone(snapshot.overlayVisibility) || {
        centerline: true,
        borders: true,
        lesion: true,
        lumen: false,
      };
      state.pendingLesionRightClick = sanitizeForHistory(snapshot.pendingLesionRightClick) || null;
      state.pendingRemovalRightClick = null;
      state.dragging = null;
      state.pointer = { imageX: null, imageY: null, value: null };
      state.activePopover = null;
      state.projectionHelpOpen = false;
      state.localizationPromptOpen = false;
      state.localizationPromptMode = null;
      state.localizationPromptTargetEntryId = null;
      state.finishClosePromptOpen = false;
      localizationPromptResolver = null;
      finishClosePromptResolver = null;
      state.referenceSamplingTarget = null;
      state.canvasTransform = null;
      state.profileGeometry = null;
      state.frameCache.clear();
      if (els.calibrationLabelInput) {
        els.calibrationLabelInput.value = snapshot.calibrationLabelValue || "Guide catheter";
      }
      if (els.calibrationFrenchSelect) {
        els.calibrationFrenchSelect.value = snapshot.calibrationFrenchValue || "5";
      }
      loadSeriesState(getActiveSeries());
      els.profileCanvas.style.cursor = "default";
      updateUi();
      scheduleRender();
    } finally {
      state.isRestoringHistory = false;
    }
  }

  function undoLastAction() {
    const entry = state.history.pop();
    if (!entry) {
      setStatus("Nothing to undo yet.", "warning");
      return;
    }
    state.redoHistory.push({
      label: entry.label,
      snapshot: captureHistorySnapshot(),
    });
    if (state.redoHistory.length > MAX_HISTORY_ENTRIES) {
      state.redoHistory.splice(0, state.redoHistory.length - MAX_HISTORY_ENTRIES);
    }
    restoreHistorySnapshot(entry);
    setStatus(`Undid ${entry.label}.`);
  }

  function redoLastAction() {
    const entry = state.redoHistory.pop();
    if (!entry) {
      setStatus("Nothing to redo yet.", "warning");
      return;
    }
    state.history.push({
      label: entry.label,
      snapshot: captureHistorySnapshot(),
    });
    if (state.history.length > MAX_HISTORY_ENTRIES) {
      state.history.splice(0, state.history.length - MAX_HISTORY_ENTRIES);
    }
    restoreHistorySnapshot(entry);
    setStatus(`Redid ${entry.label}.`);
  }

  function clearCinePlaybackTimer() {
    if (state.cinePlayback?.timerId) {
      window.clearTimeout(state.cinePlayback.timerId);
      state.cinePlayback.timerId = null;
    }
  }

  function stopCinePlayback(options) {
    clearCinePlaybackTimer();
    if (!state.cinePlayback?.isPlaying) {
      return;
    }
    state.cinePlayback.isPlaying = false;
    if (!options?.silent) {
      setStatus("Cine playback paused.");
    }
  }

  function getCinePlaybackIntervalMs(series) {
    if (Number.isFinite(series?.frameTimeMs) && series.frameTimeMs > 0) {
      return series.frameTimeMs;
    }
    if (Number.isFinite(series?.cineRateFps) && series.cineRateFps > 0) {
      return 1000 / series.cineRateFps;
    }
    return 100;
  }

  function scheduleNextCinePlaybackTick() {
    clearCinePlaybackTimer();
    if (!state.cinePlayback?.isPlaying) {
      return;
    }

    const series = getActiveSeries();
    if (!series?.frames?.length || series.frames.length < 2) {
      stopCinePlayback({ silent: true });
      return;
    }
    if (Number.isFinite(state.selectedFrameIndex)) {
      stopCinePlayback({ silent: true });
      setStatus("Unlock the QCA frame before playing the cine.", "warning");
      return;
    }

    state.cinePlayback.timerId = window.setTimeout(() => {
      if (!state.cinePlayback?.isPlaying) {
        return;
      }
      const nextIndex = (state.currentFrameIndex + 1) % series.frames.length;
      setCurrentFrameIndex(nextIndex);
      scheduleNextCinePlaybackTick();
    }, getCinePlaybackIntervalMs(series));
  }

  function toggleCinePlayback() {
    const series = getActiveSeries();
    if (!series?.frames?.length) {
      return;
    }
    if (state.cinePlayback?.isPlaying) {
      stopCinePlayback();
      return;
    }
    if (series.frames.length < 2) {
      setStatus("This series has only one frame.", "warning");
      return;
    }
    if (Number.isFinite(state.selectedFrameIndex)) {
      setStatus("Unlock the QCA frame before playing the cine.", "warning");
      return;
    }
    state.cinePlayback.isPlaying = true;
    scheduleNextCinePlaybackTick();
    setStatus(`Playing ${series.label || "cine"} in a loop.`);
  }

  function computeSeriesDurationSeconds(series) {
    if (!series) {
      return null;
    }
    if (Number.isFinite(series.frameTimeMs) && series.frameCount > 0) {
      return (series.frameCount * series.frameTimeMs) / 1000;
    }
    if (Number.isFinite(series.acquisitionStartMs) && Number.isFinite(series.acquisitionEndMs) && series.acquisitionEndMs >= series.acquisitionStartMs) {
      return (series.acquisitionEndMs - series.acquisitionStartMs) / 1000;
    }
    return null;
  }

  function computeStudyDurationSeconds() {
    const starts = state.series.map((series) => series.acquisitionStartMs).filter(Number.isFinite);
    const ends = state.series.map((series) => series.acquisitionEndMs).filter(Number.isFinite);
    if (starts.length && ends.length) {
      return Math.max(0, (Math.max(...ends) - Math.min(...starts)) / 1000);
    }
    const durations = state.series.map(computeSeriesDurationSeconds).filter(Number.isFinite);
    return durations.length ? durations.reduce((sum, value) => sum + value, 0) : null;
  }

  function getSeriesSortMs(series) {
    if (Number.isFinite(series?.acquisitionStartMs)) {
      return series.acquisitionStartMs;
    }
    return getDicomDateTimeMs(series?.studyDate, series?.studyTime);
  }

  function aggregateStudyMetric(items) {
    const finiteItems = (items || [])
      .filter((item) => Number.isFinite(item?.value) && item.value > 0)
      .sort((left, right) => {
        const leftSort = Number.isFinite(left?.sortMs) ? left.sortMs : Number.MAX_SAFE_INTEGER;
        const rightSort = Number.isFinite(right?.sortMs) ? right.sortMs : Number.MAX_SAFE_INTEGER;
        return leftSort - rightSort;
      });

    if (!finiteItems.length) {
      return {
        total: null,
        method: "unavailable",
      };
    }

    if (finiteItems.length === 1) {
      return {
        total: finiteItems[0].value,
        method: "single_series",
      };
    }

    const values = finiteItems.map((item) => item.value);
    const tolerance = Math.max(...values) * 0.01;
    const nonDecreasing = values.every((value, index) => index === 0 || value + tolerance >= values[index - 1]);

    if (nonDecreasing) {
      return {
        total: Math.max(...values),
        method: "cumulative_max",
      };
    }

    return {
      total: values.reduce((sum, value) => sum + value, 0),
      method: "series_sum",
    };
  }

  function formatAggregateMethod(method) {
    switch (safeString(method)) {
      case "single_series":
        return "single series";
      case "cumulative_max":
        return "cumulative max";
      case "series_sum":
        return "series sum";
      default:
        return "";
    }
  }

  function formatAggregateMetric(value, unit, decimals, method) {
    if (!Number.isFinite(value)) {
      return "—";
    }
    const base = unit ? `${roundTo(value, decimals)} ${unit}` : String(roundTo(value, decimals));
    const methodLabel = formatAggregateMethod(method);
    return methodLabel ? `${base} (${methodLabel})` : base;
  }

  function getSeriesContrastValue(series) {
    if (Number.isFinite(series?.contrastBolusTotalDoseMl)) {
      return series.contrastBolusTotalDoseMl;
    }
    if (Number.isFinite(series?.contrastBolusVolumeMl)) {
      return series.contrastBolusVolumeMl;
    }
    return null;
  }

  function getSeriesContrastSource(series) {
    if (Number.isFinite(series?.contrastBolusTotalDoseMl)) {
      return "contrast_bolus_total_dose";
    }
    if (Number.isFinite(series?.contrastBolusVolumeMl)) {
      return "contrast_bolus_volume";
    }
    return "";
  }

  function formatContrastSource(source) {
    switch (safeString(source)) {
      case "contrast_bolus_total_dose":
        return "total dose";
      case "contrast_bolus_volume":
        return "volume";
      case "mixed":
        return "mixed sources";
      default:
        return "";
    }
  }

  function getCaseSummaryMetadata() {
    const primarySeries = state.series[0] || null;
    const totalDoseAreaProduct = aggregateStudyMetric(
      state.series.map((series) => ({
        value: series.doseAreaProduct,
        sortMs: getSeriesSortMs(series),
      }))
    );
    const totalExposureTime = aggregateStudyMetric(
      state.series.map((series) => ({
        value: series.exposureTimeMs,
        sortMs: getSeriesSortMs(series),
      }))
    );
    const contrastItems = state.series
      .map((series) => ({
        value: getSeriesContrastValue(series),
        sortMs: getSeriesSortMs(series),
        source: getSeriesContrastSource(series),
      }))
      .filter((item) => Number.isFinite(item.value) && item.value > 0);
    const totalContrast = aggregateStudyMetric(contrastItems);
    const contrastSources = new Set(contrastItems.map((item) => safeString(item.source)).filter(Boolean));

    return {
      seriesCount: state.series.length,
      totalFrames: state.series.reduce((sum, series) => sum + (series.frameCount || 0), 0),
      totalLesions: getAllReportEntries().length,
      estimatedStudyDurationSeconds: computeStudyDurationSeconds(),
      totalDoseAreaProduct: totalDoseAreaProduct.total,
      totalDoseAreaProductMethod: totalDoseAreaProduct.method,
      totalExposureTimeMs: totalExposureTime.total,
      totalExposureTimeMethod: totalExposureTime.method,
      totalContrastMl: totalContrast.total,
      totalContrastMethod: totalContrast.method,
      totalContrastSource:
        contrastSources.size > 1 ? "mixed" : contrastSources.size === 1 ? Array.from(contrastSources)[0] : "",
      patientName: primarySeries?.patientName || "",
      patientId: primarySeries?.patientId || "",
      patientBirthDate: primarySeries?.patientBirthDate || "",
      studyDate: primarySeries?.studyDate || "",
      studyTime: primarySeries?.studyTime || "",
      studyDescription: primarySeries?.studyDescription || "",
      accessionNumber: primarySeries?.accessionNumber || "",
    };
  }

  function persistActiveSeriesState() {
    const series = getActiveSeries();
    if (!series) {
      return;
    }
    if (!Array.isArray(series.reportEntries)) {
      series.reportEntries = [];
    }
    const currentSelection = getCurrentSelectionFromUi();
    series.currentFrameIndex = state.currentFrameIndex;
    series.selectedFrameIndex = state.selectedFrameIndex;
    series.analysis = state.analysis;
    series.draftAnalysisCategory = safeString(currentSelection.analysisCategory);
    series.draftVesselLabel = safeString(currentSelection.vesselLabel);
    series.draftLowerExtSide = safeString(currentSelection.lowerExtSide);
    series.draftLowerExtLevel = safeString(currentSelection.lowerExtLevel);
    series.draftSegmentCode = safeString(currentSelection.segmentCode);
    series.draftSegmentLabel = safeString(currentSelection.segmentLabel);
    series.draftLesionLabel = safeString(els.lesionLabelInput?.value);
    syncSavedReportEntryFromAnalysis(series, state.analysis);
  }

  function loadSeriesState(series) {
    state.referenceSamplingTarget = null;
    if (!series) {
      state.currentFrameIndex = 0;
      state.selectedFrameIndex = null;
      state.analysis = null;
      state.drawTargetMode = null;
      if (state.mode === MODES.draw) {
        state.mode = MODES.anchors;
        state.returnMode = MODES.anchors;
      }
      if (els.vesselLabelInput) {
        els.vesselLabelInput.value = "LAD";
      }
      if (els.analysisCategorySelect) {
        els.analysisCategorySelect.value = "coronary_native";
      }
      updateMainSelectionUi({
        category: "coronary_native",
        preferredVesselLabel: "LAD",
      });
      if (els.cabgCustomLabelInput) {
        els.cabgCustomLabelInput.value = "";
      }
      if (els.lowerExtSideSelect) {
        els.lowerExtSideSelect.value = "";
      }
      if (els.lowerExtLevelSelect) {
        els.lowerExtLevelSelect.value = "";
      }
      if (els.lesionLabelInput) {
        els.lesionLabelInput.value = "";
      }
      updateCabgCustomInputsUi();
      return;
    }
    const maxFrameIndex = Math.max(0, (series.frames?.length || 1) - 1);
    state.selectedFrameIndex = Number.isFinite(series.selectedFrameIndex) ? series.selectedFrameIndex : null;
    state.analysis = series.analysis || null;
    state.currentFrameIndex = Number.isFinite(state.selectedFrameIndex)
      ? clamp(state.selectedFrameIndex, 0, maxFrameIndex)
      : clamp(series.currentFrameIndex || 0, 0, maxFrameIndex);
    updateMainSelectionUi({
      category: inferAnalysisCategory(state.analysis || { analysisCategory: series.draftAnalysisCategory, vesselLabel: series.draftVesselLabel }),
      source: {
        analysisCategory: state.analysis?.analysisCategory || series.draftAnalysisCategory,
        vesselLabel: state.analysis?.vesselLabel || series.draftVesselLabel,
        segmentCode: state.analysis?.segmentCode || series.draftSegmentCode,
        segmentLabel: state.analysis?.segmentLabel || series.draftSegmentLabel,
        lowerExtSide: state.analysis?.lowerExtSide || series.draftLowerExtSide,
        lowerExtLevel: state.analysis?.lowerExtLevel || series.draftLowerExtLevel,
      },
    });
    els.lesionLabelInput.value = safeString(state.analysis?.lesionLabel || series.draftLesionLabel);
  }

  function getActiveViewState() {
    const series = getActiveSeries();
    if (!series) {
      return { zoom: 1, panX: 0, panY: 0, windowCenter: null, windowWidth: null };
    }
    if (!series.view) {
      series.view = { zoom: 1, panX: 0, panY: 0, windowCenter: null, windowWidth: null };
    } else {
      if (!Number.isFinite(series.view.zoom)) {
        series.view.zoom = 1;
      }
      if (!Number.isFinite(series.view.panX)) {
        series.view.panX = 0;
      }
      if (!Number.isFinite(series.view.panY)) {
        series.view.panY = 0;
      }
      if (!Number.isFinite(series.view.windowCenter)) {
        series.view.windowCenter = null;
      }
      if (!Number.isFinite(series.view.windowWidth) || series.view.windowWidth <= 0) {
        series.view.windowWidth = null;
      }
    }
    return series.view;
  }

  function getFrameWindowState(frame, viewState) {
    const baseLow = Number.isFinite(frame?.low) ? frame.low : 0;
    const baseHigh = Number.isFinite(frame?.high) ? frame.high : 1;
    const baseWidth = Math.max(1e-6, baseHigh - baseLow);
    const baseCenter = baseLow + baseWidth / 2;
    const center = Number.isFinite(viewState?.windowCenter) ? viewState.windowCenter : baseCenter;
    const width = Number.isFinite(viewState?.windowWidth) && viewState.windowWidth > 0 ? viewState.windowWidth : baseWidth;
    return {
      baseLow,
      baseHigh,
      baseWidth,
      baseCenter,
      center,
      width,
      low: center - width / 2,
      high: center + width / 2,
      isCustom: Number.isFinite(viewState?.windowCenter) || (Number.isFinite(viewState?.windowWidth) && viewState.windowWidth > 0),
    };
  }

  function getWindowingSummary(frame, viewState) {
    const windowState = getFrameWindowState(frame, viewState);
    return `WW ${roundTo(windowState.width, 1)} · WL ${roundTo(windowState.center, 1)}`;
  }

  function hasCustomWindowing(series) {
    const view = series?.view;
    return Boolean(Number.isFinite(view?.windowCenter) || (Number.isFinite(view?.windowWidth) && view.windowWidth > 0));
  }

  function hasCustomCanvasView(series) {
    const view = series?.view;
    return Boolean(
      (Number.isFinite(view?.zoom) && Math.abs(view.zoom - 1) > 1e-4) ||
        (Number.isFinite(view?.panX) && Math.abs(view.panX) > 0.5) ||
        (Number.isFinite(view?.panY) && Math.abs(view.panY) > 0.5)
    );
  }

  function getCurrentFrameDescriptor() {
    const series = getActiveSeries();
    if (!series?.frames?.length) {
      return null;
    }
    return series.frames[clamp(state.currentFrameIndex, 0, series.frames.length - 1)] || null;
  }

  function getSelectedFrameDescriptor() {
    const series = getActiveSeries();
    if (!series?.frames?.length || !Number.isFinite(state.selectedFrameIndex)) {
      return null;
    }
    return series.frames[clamp(state.selectedFrameIndex, 0, series.frames.length - 1)] || null;
  }

  function isAnalysisFrameVisible() {
    return Number.isFinite(state.selectedFrameIndex) && state.selectedFrameIndex === state.currentFrameIndex;
  }

  function hasSegmentedVessel() {
    return Boolean(state.analysis?.centerline?.length > 1 && state.analysis?.measurements);
  }

  function hasAnalysisDraft(analysis) {
    if (!analysis) {
      return false;
    }
    return Boolean(
      analysis.anchorPoints?.length ||
        analysis.borderHintPoints?.length ||
        analysis.centerline?.length ||
        analysis.borderLeft?.length ||
        analysis.borderRight?.length ||
        analysis.lesion ||
        analysis.measurements ||
        analysis.calibration ||
        analysis.calibrationDraftPoints?.length
    );
  }

  function getSeriesReportEntries(series) {
    if (!series) {
      return [];
    }
    if (!Array.isArray(series.reportEntries)) {
      series.reportEntries = [];
    }
    return series.reportEntries;
  }

  function buildReportEntry(series, analysis, options) {
    if (!series || !analysis?.measurements || !Number.isFinite(analysis.frameIndex)) {
      return null;
    }
    const snapshot = deepClone(analysis);
    const order = Number.isFinite(options?.order)
      ? options.order
      : Number.isFinite(snapshot.reportEntryOrder)
        ? snapshot.reportEntryOrder
        : state.reportEntryCounter;
    const id = safeString(options?.id || snapshot.reportEntryId) || `lesion_${order}`;
    const archivedAt = safeString(options?.archivedAt || snapshot.reportArchivedAt) || new Date().toISOString();
    assignReportEntryIdentity(snapshot, { id, order, archivedAt });
    return {
      id,
      order,
      archivedAt,
      seriesId: series.id,
      seriesLabel: series.label || "",
      patientName: series.patientName || "",
      patientId: series.patientId || "",
      frameIndex: snapshot.frameIndex,
      frameNumber: snapshot.frameIndex + 1,
      analysisCategory: snapshot.analysisCategory || inferAnalysisCategory(snapshot),
      vesselLabel: snapshot.vesselLabel || "Vessel",
      lowerExtSide: snapshot.lowerExtSide || "",
      lowerExtLevel: snapshot.lowerExtLevel || "",
      segmentCode: snapshot.segmentCode || "",
      segmentLabel: snapshot.segmentLabel || "",
      lesionLabel: snapshot.lesionLabel || "",
      viewSnapshot: deepClone(series.view || getActiveViewState()),
      analysis: snapshot,
    };
  }

  function assignReportEntryIdentity(analysis, entryLike) {
    if (!analysis) {
      return;
    }
    const reportEntryId = safeString(entryLike?.id || entryLike?.reportEntryId);
    analysis.reportEntryId = reportEntryId || null;
    analysis.reportEntryOrder = Number.isFinite(entryLike?.order)
      ? entryLike.order
      : Number.isFinite(entryLike?.reportEntryOrder)
        ? entryLike.reportEntryOrder
        : null;
    analysis.reportArchivedAt = safeString(entryLike?.archivedAt || entryLike?.reportArchivedAt) || null;
  }

  function findReportEntryLocation(entryId) {
    const targetId = safeString(entryId);
    if (!targetId) {
      return null;
    }
    for (const series of state.series) {
      const entryIndex = getSeriesReportEntries(series).findIndex((entry) => entry.id === targetId);
      if (entryIndex >= 0) {
        return {
          series,
          entryIndex,
          entry: getSeriesReportEntries(series)[entryIndex],
        };
      }
    }
    return null;
  }

  function syncSavedReportEntryFromAnalysis(series, analysis) {
    const targetId = safeString(analysis?.reportEntryId);
    if (!series || !targetId || !analysis?.measurements || !Number.isFinite(analysis.frameIndex)) {
      return;
    }
    const existingEntry = getSeriesReportEntries(series).find((entry) => entry.id === targetId);
    if (!existingEntry) {
      return;
    }
    const nextEntry = buildReportEntry(series, analysis, {
      id: targetId,
      order: Number.isFinite(analysis.reportEntryOrder) ? analysis.reportEntryOrder : existingEntry.order,
      archivedAt: safeString(analysis.reportArchivedAt) || existingEntry.archivedAt,
    });
    if (!nextEntry) {
      return;
    }
    Object.assign(existingEntry, nextEntry);
  }

  function getSavedReportEntries() {
    return state.series
      .flatMap((series) => getSeriesReportEntries(series))
      .slice()
      .sort((left, right) => left.order - right.order);
  }

  function getCurrentDraftReportEntry() {
    const series = getActiveSeries();
    if (!series || !state.analysis?.measurements) {
      return null;
    }
    return buildReportEntry(series, state.analysis);
  }

  function getAllReportEntries() {
    const entries = getSavedReportEntries();
    const currentEntry = getCurrentDraftReportEntry();
    if (currentEntry) {
      const existingIndex = entries.findIndex((entry) => entry.id === currentEntry.id);
      if (existingIndex >= 0) {
        entries.splice(existingIndex, 1, currentEntry);
      } else {
        entries.push(currentEntry);
      }
    }
    return entries.sort((left, right) => left.order - right.order);
  }

  function archiveCurrentAnalysisToReport() {
    const series = getActiveSeries();
    const entry = buildReportEntry(series, state.analysis, {
      order: state.reportEntryCounter,
    });
    if (!entry) {
      return null;
    }
    assignReportEntryIdentity(state.analysis, entry);
    state.series.forEach((seriesItem) => {
      const index = getSeriesReportEntries(seriesItem).findIndex((item) => item.id === entry.id);
      if (index >= 0) {
        getSeriesReportEntries(seriesItem).splice(index, 1);
      }
    });
    getSeriesReportEntries(series).push(entry);
    state.reportEntryCounter = Math.max(state.reportEntryCounter, entry.order + 1);
    return entry;
  }

  function formatLesionCount(count) {
    return count === 1 ? "1 stenosis" : `${count} stenoses`;
  }

  function getSuggestedStudyId() {
    const series = getActiveSeries();
    return (
      safeString(state.lastExportStudyId) ||
      safeString(series?.accessionNumber) ||
      safeString(series?.patientId) ||
      safeString(series?.studyDate)
    );
  }

  function requestStudyIdForExport() {
    while (true) {
      const response = window.prompt("Enter a Study ID for this export.", getSuggestedStudyId());
      if (response == null) {
        setStatus("Export canceled. Study ID is required.", "warning");
        return null;
      }
      const studyId = safeString(response);
      if (studyId) {
        state.lastExportStudyId = studyId;
        return studyId;
      }
      window.alert("Study ID is required before export can start.");
    }
  }

  function getActiveCalibration(series, analysis) {
    const activeAnalysis = analysis || state.analysis;
    const manualSpacing = activeAnalysis?.calibration?.method === "manualLine" ? activeAnalysis.calibration.mmPerPixel : null;
    if (Number.isFinite(manualSpacing) && manualSpacing > 0) {
      return activeAnalysis.calibration;
    }

    const dicomSpacing = series?.measurementSpacingMm;
    if (Number.isFinite(dicomSpacing) && dicomSpacing > 0) {
      return {
        method: "dicom",
        label: "DICOM spacing",
        mmPerPixel: dicomSpacing,
        sourceFrameIndex: Number.isFinite(activeAnalysis?.frameIndex)
          ? activeAnalysis.frameIndex
          : Number.isFinite(state.selectedFrameIndex)
            ? state.selectedFrameIndex
            : null,
      };
    }

    return null;
  }

  function getMeasurementSpacing(series, analysis) {
    const calibration = getActiveCalibration(series, analysis);
    return Number.isFinite(calibration?.mmPerPixel) && calibration.mmPerPixel > 0 ? calibration.mmPerPixel : null;
  }

  function getMeasurementUnits(series, analysis) {
    return getMeasurementSpacing(series, analysis) ? "mm" : "px";
  }

  function toPhysicalLength(valuePx, series, analysis) {
    const spacing = getMeasurementSpacing(series, analysis);
    return spacing ? valuePx * spacing : valuePx;
  }

  function frenchToMillimeters(frenchSize) {
    return frenchSize * 0.33;
  }

  function getSelectedFrenchSize() {
    const value = Number.parseInt(els.calibrationFrenchSelect.value, 10);
    return [4, 5, 6].includes(value) ? value : null;
  }

  function getKnownCalibrationSizeMm() {
    const frenchSize = getSelectedFrenchSize();
    return Number.isFinite(frenchSize) ? frenchToMillimeters(frenchSize) : null;
  }

  function ensureSegmentationHints(analysis) {
    if (!analysis.segmentationHints) {
      analysis.segmentationHints = {
        vesselTone: null,
        backgroundTone: null,
      };
    }
    return analysis.segmentationHints;
  }

  function toneToCss(value) {
    const channel = Number.isFinite(value) ? Math.round(clamp(value, 0, 1) * 255) : 18;
    return `rgb(${channel}, ${channel}, ${channel})`;
  }

  function formatToneReadout(value, fallbackText) {
    return Number.isFinite(value) ? `${Math.round(value * 100)}% sampled tone` : fallbackText;
  }

  function getCalibrationSummary(calibration) {
    if (!calibration) {
      return {
        status: "Uncalibrated",
        detail: "No manual or DICOM spacing is available yet.",
      };
    }
    if (calibration.method === "manualLine") {
      const sourceFrame = Number.isFinite(calibration.sourceFrameIndex) ? calibration.sourceFrameIndex + 1 : "—";
      const frenchLabel = Number.isFinite(calibration.knownFrenchSize)
        ? `${calibration.knownFrenchSize}F (${roundTo(calibration.knownSizeMm, 2)} mm)`
        : `${roundTo(calibration.knownSizeMm, 2)} mm`;
      return {
        status: "Manual line",
        detail: `${calibration.label || "Known object"} · ${frenchLabel} over ${roundTo(calibration.pixelLength, 2)} px · ${roundTo(
          calibration.mmPerPixel,
          5
        )} mm/pixel · frame ${sourceFrame}`,
      };
    }
    return {
      status: "DICOM fallback",
      detail: `${roundTo(calibration.mmPerPixel, 5)} mm/pixel from DICOM metadata. Prefer manual catheter or marker calibration for more trustworthy absolute QCA results.`,
    };
  }

  function updateWorkflowUi() {
    const series = getActiveSeries();
    const reportEntryCount = getAllReportEntries().length;
    let activeStep = "load";
    if (series) {
      activeStep = "frame";
    }
    if (Number.isFinite(state.selectedFrameIndex)) {
      activeStep = "segment";
    }
    if (hasSegmentedVessel()) {
      activeStep = "review";
    }
    if (hasSegmentedVessel() && state.analysis?.measurements) {
      activeStep = "export";
    } else if (!Number.isFinite(state.selectedFrameIndex) && reportEntryCount) {
      activeStep = "export";
    }

    els.workflowSteps.forEach((step) => {
      step.classList.toggle("is-active", step.dataset.step === activeStep);
    });

    if (!series) {
      els.workflowNote.textContent = "Load a cine or image series to begin.";
    } else if (!Number.isFinite(state.selectedFrameIndex)) {
      els.workflowNote.textContent = reportEntryCount
        ? `${formatLesionCount(reportEntryCount)} saved. Lock the next still frame or export the combined report.`
        : "Review the run and lock the best still frame for quantitative coronary angiography.";
    } else if (!hasSegmentedVessel()) {
      els.workflowNote.textContent = reportEntryCount
        ? `${formatLesionCount(reportEntryCount)} saved. Place vessel anchors on the selected frame, then run segmentation.`
        : "Place vessel anchors on the selected frame, then run segmentation.";
    } else {
      els.workflowNote.textContent = reportEntryCount
        ? `${formatLesionCount(reportEntryCount)} saved. Drag centerline, borders, stenosis limits, or reference points as needed.`
        : "Drag centerline, borders, stenosis limits, or reference points as needed.";
    }
  }

  function openSidebarSection(section) {
    if (section?.tagName === "DETAILS") {
      section.open = true;
    }
  }

  function scrollToElement(element) {
    element?.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
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

  function scheduleFocusLayoutRender() {
    scheduleRender();
    window.requestAnimationFrame(() => {
      scheduleRender();
      window.setTimeout(scheduleRender, 180);
      window.setTimeout(scheduleRender, 380);
    });
  }

  function updatePresentationFocusUi() {
    document.body.classList.toggle("is-presentation-focus", state.presentationFocus);
    document.body.classList.toggle("is-focus-sidebar-open", state.presentationFocus && state.focusSidebarOpen);
    els.app?.classList.toggle("is-presentation-focus", state.presentationFocus);
    els.app?.classList.toggle("is-focus-sidebar-open", state.presentationFocus && state.focusSidebarOpen);
    if (els.canvasFocusToggleButton) {
      els.canvasFocusToggleButton.classList.toggle("is-active", state.presentationFocus);
      els.canvasFocusToggleButton.textContent = state.presentationFocus ? "×" : "⤢";
      els.canvasFocusToggleButton.title = state.presentationFocus ? "Exit immersive focus view" : "Immersive focus view";
      els.canvasFocusToggleButton.setAttribute(
        "aria-label",
        state.presentationFocus ? "Exit immersive focus view" : "Enter immersive QCA focus view"
      );
    }
    els.focusWorkflowButtons?.forEach((button) => {
      const sectionId = button.dataset.focusSidebarSection;
      button.classList.toggle(
        "is-active",
        state.presentationFocus && state.focusSidebarOpen && sectionId === state.activeFocusSectionId
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
      focusWithoutScrolling(els.canvasWrap);
    }
    updatePresentationFocusUi();
    scheduleFocusLayoutRender();
  }

  function togglePresentationFocus() {
    setPresentationFocus(!state.presentationFocus);
  }

  function handleFocusSidebarSection(sectionId) {
    const section = document.getElementById(sectionId);
    const normalizedSectionId = section?.tagName === "DETAILS" ? sectionId : "workflow-section";
    const shouldClose =
      state.presentationFocus && state.focusSidebarOpen && state.activeFocusSectionId === normalizedSectionId;
    state.activeFocusSectionId = normalizedSectionId;
    const activeSection = document.getElementById(normalizedSectionId);
    openSidebarSection(activeSection);
    if (state.presentationFocus) {
      setFocusSidebarOpen(!shouldClose);
      window.requestAnimationFrame(() => scrollToElement(activeSection));
      scheduleFocusLayoutRender();
    }
  }

  function activateMode(mode) {
    const transientMode = mode === MODES.zoom || mode === MODES.windowing || mode === MODES.draw;
    const currentIsTransient =
      state.mode === MODES.zoom || state.mode === MODES.windowing || state.mode === MODES.draw;
    if (mode === MODES.draw) {
      const targetMode =
        state.mode === MODES.centerline || state.mode === MODES.borders
          ? state.mode
          : state.returnMode === MODES.centerline || state.returnMode === MODES.borders
            ? state.returnMode
            : null;
      if (targetMode !== MODES.centerline && targetMode !== MODES.borders) {
        setStatus("Draw mode is available while editing the centerline or vessel borders.", "warning");
        return;
      }
      state.drawTargetMode = targetMode;
    } else if (mode === MODES.centerline || mode === MODES.borders) {
      state.drawTargetMode = mode;
    }
    if (transientMode) {
      if (!currentIsTransient) {
        state.returnMode = state.mode || MODES.anchors;
      }
    } else {
      state.returnMode = mode || MODES.anchors;
    }
    state.mode = mode;
    state.pendingRemovalRightClick = null;
    state.pendingLesionRightClick = null;
    if (mode === MODES.centerline) {
      state.overlayVisibility.centerline = true;
    } else if (mode === MODES.borders) {
      state.overlayVisibility.borders = true;
    } else if (mode === MODES.draw) {
      if (state.drawTargetMode === MODES.centerline) {
        state.overlayVisibility.centerline = true;
      } else if (state.drawTargetMode === MODES.borders) {
        state.overlayVisibility.borders = true;
      }
    } else if (mode === MODES.lesion) {
      state.overlayVisibility.lesion = true;
    }
    updateUi();
    scheduleRender();
  }

  function resetWindowing(options) {
    const series = getActiveSeries();
    if (!series) {
      return;
    }
    const view = getActiveViewState();
    if (!hasCustomWindowing(series)) {
      if (!options?.silent) {
        setStatus("Windowing is already using the default display.");
      }
      return;
    }
    if (!options?.skipHistory) {
      recordHistoryStep("reset windowing");
    }
    view.windowCenter = null;
    view.windowWidth = null;
    persistActiveSeriesState();
    updateUi();
    scheduleRender();
    if (!options?.silent) {
      setStatus("Windowing reset to the default display.");
    }
  }

  function resetCanvasView(options) {
    const series = getActiveSeries();
    if (!series) {
      return;
    }
    const view = getActiveViewState();
    const hasCustomView = hasCustomCanvasView(series);
    if (!hasCustomView) {
      if (!options?.silent) {
        setStatus("The image is already centered at the default zoom.");
      }
      return;
    }
    if (!options?.skipHistory) {
      recordHistoryStep("reset zoom and center");
    }
    view.zoom = 1;
    view.panX = 0;
    view.panY = 0;
    persistActiveSeriesState();
    updateUi();
    scheduleRender();
    if (!options?.silent) {
      setStatus("Zoom and pan reset to the centered default view.");
    }
  }

  function jumpToWorkflowStep(step) {
    if (step === "load") {
      scrollToElement(els.loadPanel);
      setStatus("Workflow jump: load or append angiography series from the top panel.");
      return;
    }

    if (step === "frame") {
      openSidebarSection(els.seriesSection);
      scrollToElement(els.seriesSection);
      setStatus("Workflow jump: review the cine and lock the best still QCA frame.");
      return;
    }

    if (step === "segment") {
      openSidebarSection(els.vesselSection);
      activateMode(MODES.anchors);
      scrollToElement(Number.isFinite(state.selectedFrameIndex) ? els.viewerSection : els.vesselSection);
      setStatus("Workflow jump: place anchors and segment the vessel.");
      return;
    }

    if (step === "review") {
      openSidebarSection(els.vesselSection);
      if (hasSegmentedVessel()) {
        activateMode(MODES.centerline);
      } else if (Number.isFinite(state.selectedFrameIndex)) {
        activateMode(MODES.anchors);
      }
      scrollToElement(hasSegmentedVessel() ? els.profileSection : els.viewerSection);
      setStatus("Workflow jump: review and refine centerline, borders, and stenosis markers.");
      return;
    }

    if (step === "export") {
      openSidebarSection(els.qcaSection);
      scrollToElement(els.qcaSection);
      setStatus("Workflow jump: review measurements and export the combined QCA report.");
    }
  }

  function updateSeriesUi() {
    const activeSeries = getActiveSeries();
    els.seriesSummary.textContent = `${state.series.length} loaded`;

    if (!state.series.length) {
      els.seriesList.innerHTML = '<p class="empty-copy">No angiography series loaded yet.</p>';
      return;
    }

    els.seriesList.innerHTML = state.series
      .map((series) => {
        const frameRateText = Number.isFinite(series.cineRateFps)
          ? `${roundTo(series.cineRateFps, 1)} fps`
          : Number.isFinite(series.frameTimeMs) && series.frameTimeMs > 0
            ? `${roundTo(1000 / series.frameTimeMs, 1)} fps`
            : "cine rate n/a";
        return `
          <button class="series-button ${series.id === activeSeries?.id ? "is-active" : ""}" type="button" data-series-id="${series.id}">
            <strong>${escapeHtml(series.label)}</strong>
            <small>${series.frameCount} frames · ${series.rows} × ${series.columns} · ${escapeHtml(frameRateText)}</small>
          </button>
        `;
      })
      .join("");

    Array.from(els.seriesList.querySelectorAll("[data-series-id]")).forEach((button) => {
      button.addEventListener("click", () => {
        activateSeries(button.dataset.seriesId);
      });
    });
  }

  function buildSavedStenosisLabel(entry) {
    const analysisCategory = safeString(entry?.analysisCategory || inferAnalysisCategory(entry));
    const segmentDisplay =
      entry.segmentCode && entry.segmentLabel
        ? formatSegmentOptionLabel({ code: entry.segmentCode, label: entry.segmentLabel })
        : "";
    return (
      safeString(entry.lesionLabel) ||
      (isHierarchicalVascularCategory(analysisCategory)
        ? segmentDisplay
        : [entry.vesselLabel || "", segmentDisplay].filter(Boolean).join(" · ")) ||
      `Stenosis ${entry.order}`
    );
  }

  function updateSavedStenosesUi() {
    if (!els.savedStenosesList || !els.savedStenosesSummary) {
      return;
    }
    const entries = getSavedReportEntries();
    const activeEntryId = safeString(state.analysis?.reportEntryId);
    els.savedStenosesSummary.textContent = entries.length
      ? `${formatLesionCount(entries.length)} available to reopen`
      : "No prior stenosis yet.";

    if (!entries.length) {
      els.savedStenosesList.innerHTML = '<p class="empty-copy">Saved stenoses will appear here after Next Stenosis.</p>';
      return;
    }

    els.savedStenosesList.innerHTML = entries
      .map((entry) => {
        const isActive = activeEntryId && activeEntryId === entry.id;
        const subtitle = [entry.seriesLabel || "", `Frame ${entry.frameNumber}`].filter(Boolean).join(" · ");
        return `
          <button class="stenosis-button ${isActive ? "is-active" : ""}" type="button" data-report-entry-id="${entry.id}">
            <div class="stenosis-button-header">
              <strong class="stenosis-button-title">${escapeHtml(buildSavedStenosisLabel(entry))}</strong>
              <span class="stenosis-button-badge">#${entry.order}</span>
            </div>
            <div class="stenosis-button-meta">
              <small class="stenosis-button-subtitle">${escapeHtml(subtitle)}</small>
              ${isActive ? '<span class="stenosis-button-state">Editing</span>' : ""}
            </div>
          </button>
        `;
      })
      .join("");

    Array.from(els.savedStenosesList.querySelectorAll("[data-report-entry-id]")).forEach((button) => {
      button.addEventListener("click", () => {
        reopenSavedStenosis(button.dataset.reportEntryId);
      });
    });
  }

  function updateFrameUi() {
    const series = getActiveSeries();
    const frameCount = series?.frames?.length || 0;
    const isLocked = Number.isFinite(state.selectedFrameIndex);
    els.frameSlider.disabled = frameCount <= 1 || isLocked;
    els.frameSlider.max = String(Math.max(0, frameCount - 1));
    els.frameSlider.value = String(Math.max(0, Math.min(state.currentFrameIndex, frameCount - 1)));
    els.previewFrameReadout.textContent = frameCount ? `${state.currentFrameIndex + 1} / ${frameCount}` : "0 / 0";
    els.analysisFrameReadout.textContent = Number.isFinite(state.selectedFrameIndex)
      ? `${state.selectedFrameIndex + 1} / ${frameCount}`
      : "None";
    els.selectFrameButton.disabled = !frameCount;
    els.selectFrameButton.textContent = isLocked ? "Deselect QCA Frame" : "Lock QCA Frame";
    els.jumpAnalysisFrameButton.disabled = !Number.isFinite(state.selectedFrameIndex);

    const displayedFrame = getCurrentFrameDescriptor();
    els.frameBadge.textContent = frameCount
      ? `Frame ${state.currentFrameIndex + 1} / ${frameCount}`
      : "Frame 0 / 0";
    els.viewerTitle.textContent = displayedFrame
      ? `${series.label} · ${displayedFrame.globalFrameIndex + 1}`
      : "No frame selected";
  }

  function updateModeUi() {
    els.toolButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === state.mode);
    });

    const hints = {
      [MODES.zoom]:
        "Use the mouse wheel to zoom the image and drag to pan. Cmd/Ctrl + wheel also zooms from any workflow, and middle mouse pans temporarily. Press Esc to return. Shortcut: Z.",
      [MODES.windowing]:
        "Drag horizontally to change window width and vertically to change window level on the current series. Use ↺ to reset and Esc to return. Shortcut: W.",
      [MODES.calibration]:
        "Click two points across a known object on the locked QCA frame, then drag the endpoints if needed. Shortcut: K.",
      [MODES.anchors]:
        "Click to place anchors, double-click to segment, right-click to insert extra anchors, and double-right-click an existing anchor to remove it. Shortcut: A.",
      [MODES.borderHints]:
        "Optional pre-segmentation edge hints. Click likely left or right vessel borders to bias automatic contour detection, then segment or re-segment. Double-right-click an existing hint to remove it. No shortcut yet.",
      [MODES.centerline]:
        "Drag the sparse centerline handles to move the vessel path after automatic detection. Right-click adds more centerline controls and double-right-click removes a selected centerline control. Shortcut: C.",
      [MODES.borders]:
        "Drag the blue and coral border handles to refine the lumen contour profile. Left-drag on the border line to grab a local contour point, left-click outside a contour to draw it aggressively, right-click for more border controls, or double-right-click a selected border control to remove it. Shortcut: B.",
      [MODES.draw]:
        "Hold left mouse button to sketch a dashed stroke over the active structure, then release to blend it smoothly into the current centerline or border. Shortcut: D.",
      [MODES.lesion]:
        "Left-drag stenosis limits, references, or the cursor directly on the vessel or in the chart. Double-right-click the proximal reference to remove it. Shortcut: S.",
      [MODES.eraser]:
        "Move the eraser circle with the mouse and click to erase anchors or editable controls inside it. Shortcut: E.",
    };

    els.modeHint.textContent = hints[state.mode] || hints[MODES.anchors];
    els.modeBadge.textContent = `Mode: ${MODE_LABELS[state.mode] || capitalize(state.mode)}`;
    if (els.resetWindowingButton) {
      els.resetWindowingButton.disabled = !getActiveSeries() || !hasCustomWindowing(getActiveSeries());
    }

    if (state.mode === MODES.zoom) {
      els.interactionReadout.textContent =
        "Mouse wheel zooms the image. Cmd/Ctrl + wheel also zooms from any workflow, and middle mouse pans the active view. Press Esc to return.";
    } else if (state.mode === MODES.windowing) {
      const frame = state.lastRenderedFrame;
      els.interactionReadout.textContent = frame
        ? `Drag on the ICA image to adjust windowing for this series. ${getWindowingSummary(frame, getActiveViewState())}. Press Esc to return.`
        : "Drag on the ICA image to adjust window width and level for this series. Press Esc to return.";
    } else if (state.mode === MODES.calibration) {
      els.interactionReadout.textContent =
        "Click two points across a known catheter or marker on the locked QCA frame.";
    } else if (state.mode === MODES.anchors) {
      els.interactionReadout.textContent =
        "Click to add anchors, double-click to segment, right-click to insert extra anchors, and double-right-click an anchor to remove it.";
    } else if (state.mode === MODES.borderHints) {
      els.interactionReadout.textContent =
        "Click to add optional left or right border hints, drag them to refine, then segment or re-segment to apply. Double-right-click a hint to remove it.";
    } else if (state.mode === MODES.centerline) {
      els.interactionReadout.textContent =
        "Drag the white centerline handles, right-click to add more centerline edit points, or double-right-click a selected one to remove it.";
    } else if (state.mode === MODES.borders) {
      els.interactionReadout.textContent =
        "Drag contour handles or left-drag directly on the border line to slide a local border point, left-click outside a border to draw it aggressively, right-click near a border to add more, or double-right-click a selected control to remove it.";
    } else if (state.mode === MODES.draw) {
      const targetLabel = state.drawTargetMode === MODES.borders ? "border contour" : "centerline";
      els.interactionReadout.textContent =
        `Hold left mouse button and draw a dashed ${targetLabel} stroke, then release to merge it smoothly into the current vessel geometry.`;
    } else if (state.mode === MODES.eraser) {
      els.interactionReadout.textContent =
        "Move the eraser circle with the mouse, then click to remove anchors or control handles.";
    } else {
      els.interactionReadout.textContent =
        "Left-drag stenosis and reference markers on the image or chart. Double-right-click the proximal reference to remove it.";
    }
  }

  function updateDisplayVisibilityUi() {
    els.displayVisibilityPanel.hidden = state.activePopover !== "display";
    els.segmentationReferencePanel.hidden = state.activePopover !== "references";
    els.displayVisibilityButton.classList.toggle("is-active", state.activePopover === "display");
    els.segmentationReferenceButton.classList.toggle("is-active", state.activePopover === "references");

    els.overlayLayerButtons.forEach((button) => {
      const layer = button.dataset.overlayLayer;
      const isActive = Boolean(state.overlayVisibility[layer]);
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function updateReferenceControlsUi() {
    const hints = state.analysis ? ensureSegmentationHints(state.analysis) : { vesselTone: null, backgroundTone: null };
    const canSample = Number.isFinite(state.selectedFrameIndex) && isAnalysisFrameVisible();

    els.vesselReferenceSwatch.style.background = toneToCss(hints.vesselTone);
    els.backgroundReferenceSwatch.style.background = toneToCss(hints.backgroundTone);
    els.vesselReferenceReadout.textContent = formatToneReadout(hints.vesselTone, "Using anchor average.");
    els.backgroundReferenceReadout.textContent = formatToneReadout(hints.backgroundTone, "Using local edge average.");

    els.pickVesselReferenceButton.disabled = !canSample;
    els.pickBackgroundReferenceButton.disabled = !canSample;
    els.clearReferenceTonesButton.disabled = !state.analysis || (!Number.isFinite(hints.vesselTone) && !Number.isFinite(hints.backgroundTone));
    els.pickVesselReferenceButton.classList.toggle("is-active", state.referenceSamplingTarget === "vessel");
    els.pickBackgroundReferenceButton.classList.toggle("is-active", state.referenceSamplingTarget === "background");
  }

  function updateProjectionHelpUi() {
    const isOpen = Boolean(state.projectionHelpOpen);
    if (els.projectionHelpModal) {
      els.projectionHelpModal.hidden = !isOpen;
    }
    document.body.classList.toggle("projection-help-open", isOpen);
    if (!isOpen) {
      return;
    }

    const page = PROJECTION_HELP_PAGES[clamp(state.projectionHelpIndex, 0, PROJECTION_HELP_PAGES.length - 1)];
    if (!page) {
      return;
    }

    els.projectionHelpTitle.textContent = page.title;
    els.projectionHelpSubtitle.textContent = page.subtitle;
    els.projectionHelpImage.src = new URL(page.imagePath, window.location.href).href;
    els.projectionHelpImage.alt = `${page.title} projection guide`;
    els.projectionHelpPageIndicator.textContent = `${state.projectionHelpIndex + 1} / ${PROJECTION_HELP_PAGES.length}`;
    els.projectionHelpPrevButton.disabled = state.projectionHelpIndex <= 0;
    els.projectionHelpNextButton.disabled = state.projectionHelpIndex >= PROJECTION_HELP_PAGES.length - 1;
  }

  function updateLocalizationPromptUi() {
    const isOpen = Boolean(state.localizationPromptOpen);
    if (els.localizationModal) {
      els.localizationModal.hidden = !isOpen;
    }
    document.body.classList.toggle("localization-modal-open", isOpen);
    if (!isOpen) {
      return;
    }

    if (els.localizationTitle) {
      els.localizationTitle.textContent =
        state.localizationPromptMode === "exportConfirm" || (state.localizationPromptMode === "nextStenosis" && state.analysis?.measurements)
          ? "Confirm Vessel And Segment"
          : "Select Vessel And Segment";
    }
    if (els.localizationCopy) {
      els.localizationCopy.textContent =
        state.localizationPromptMode === "exportConfirm"
          ? "Please confirm the vessel selection before export. Study ID will be requested right after this step."
          : state.localizationPromptMode === "nextStenosis" && state.analysis?.measurements
            ? "Please confirm the vessel selection for the stenosis you are saving before continuing to the next one."
            : "Select the vessel and segment to use as the starting localization for the next stenosis.";
    }

    const hasVessel = Boolean(safeString(els.localizationVesselSelect?.value));
    const hasCategory = Boolean(safeString(els.localizationCategorySelect?.value));
    const hasSide =
      !isHierarchicalVascularCategory(getSelectedLocalizationCategory()) || Boolean(safeString(els.localizationLowerExtSideSelect?.value));
    const hasLevel =
      !isHierarchicalVascularCategory(getSelectedLocalizationCategory()) || Boolean(safeString(els.localizationLowerExtLevelSelect?.value));
    const hasCoronaryOrCabgSelection =
      getSelectedLocalizationCategory() === "coronary_native"
        ? hasVessel
        : getSelectedLocalizationCategory() === "coronary_cabg"
          ? true
          : isHierarchicalVascularCategory(getSelectedLocalizationCategory());
    const hasSegment = Boolean(safeString(els.localizationSegmentSelect?.value));
    const requiresCustomLabel =
      getSelectedLocalizationCategory() === "coronary_cabg" && isCustomCabgSegmentCode(els.localizationSegmentSelect?.value);
    const hasCustomLabel = Boolean(getCustomCabgLabelValue(els.localizationCustomLabelInput));
    els.localizationConfirmButton.disabled = !(
      hasCategory &&
      hasCoronaryOrCabgSelection &&
      hasSide &&
      hasLevel &&
      hasSegment &&
      (!requiresCustomLabel || hasCustomLabel)
    );
    els.localizationConfirmButton.textContent =
      state.localizationPromptMode === "exportConfirm" || (state.localizationPromptMode === "nextStenosis" && state.analysis?.measurements)
        ? "Confirm"
        : "Continue";
  }

  function updateFinishClosePromptUi() {
    const isOpen = Boolean(state.finishClosePromptOpen);
    if (els.finishCloseModal) {
      els.finishCloseModal.hidden = !isOpen;
    }
    document.body.classList.toggle("finish-close-modal-open", isOpen);
  }

  function getExportStudyDirectoryLabel(studyId) {
    const study = state.exportStudy.studies.find((entry) => safeString(entry.id) === safeString(studyId)) || null;
    if (study?.slug) {
      return `exports_outbox/qca/${study.slug}`;
    }
    return "exports_outbox/qca";
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
    els.exportStudyTargetNote.textContent = "Mirrored exports will also be saved to exports_outbox/qca until a study is selected.";
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

  function togglePopover(name) {
    state.activePopover = state.activePopover === name ? null : name;
    updateUi();
  }

  function openProjectionHelp(index) {
    state.projectionHelpIndex = clamp(Number.isFinite(index) ? index : 0, 0, PROJECTION_HELP_PAGES.length - 1);
    state.projectionHelpOpen = true;
    state.activePopover = null;
    updateUi();
  }

  function openLocalizationPrompt(options) {
    const analysisCategory = safeString(options?.analysisCategory || inferAnalysisCategory(options));
    const vesselLabel = safeString(options?.vesselLabel);
    const segmentCode = safeString(options?.segmentCode);
    const segmentLabel = safeString(options?.segmentLabel);
    const lowerExtSide = safeString(options?.lowerExtSide);
    const lowerExtLevel = safeString(options?.lowerExtLevel);
    state.localizationPromptMode = options?.mode || "nextStenosis";
    state.localizationPromptTargetEntryId = safeString(options?.targetEntryId) || null;
    state.localizationPromptOpen = true;
    state.activePopover = null;
    updateLocalizationSelectionUi({
      category: analysisCategory || "coronary_native",
      source: {
        analysisCategory,
        vesselLabel,
        segmentCode,
        segmentLabel,
        lowerExtSide,
        lowerExtLevel,
      },
    });
    updateUi();
  }

  function requestFinishCloseOptions() {
    state.finishClosePromptOpen = true;
    if (els.finishCloseBundleCheckbox) {
      els.finishCloseBundleCheckbox.checked = false;
    }
    refreshExportStudyOptions().catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not load export studies.", "error");
    });
    updateUi();
    return new Promise((resolve) => {
      finishClosePromptResolver = resolve;
    });
  }

  function closeFinishClosePrompt(result) {
    const wasOpen = state.finishClosePromptOpen;
    state.finishClosePromptOpen = false;
    updateUi();
    if (finishClosePromptResolver) {
      const resolver = finishClosePromptResolver;
      finishClosePromptResolver = null;
      resolver(result || null);
    } else if (!wasOpen) {
      return;
    }
  }

  function confirmFinishClosePrompt() {
    closeFinishClosePrompt({
      includePortableBundle: Boolean(els.finishCloseBundleCheckbox?.checked),
    });
  }

  function applyLocalizationToEntry(entryId, selection) {
    const analysisCategory = safeString(selection?.analysisCategory || inferAnalysisCategory(selection));
    const vesselLabel = safeString(selection?.vesselLabel);
    const segment = selection?.segment;
    const currentDraftEntry = getCurrentDraftReportEntry();
    if (!entryId || entryId === "current_draft" || (currentDraftEntry && currentDraftEntry.id === entryId)) {
      updateMainSelectionUi({
        category: analysisCategory,
        source: {
          analysisCategory,
          vesselLabel,
          segmentCode: segment?.code,
          segmentLabel: segment?.label,
          lowerExtSide: selection?.lowerExtSide,
          lowerExtLevel: selection?.lowerExtLevel,
        },
      });
      if (state.analysis) {
        state.analysis.analysisCategory = analysisCategory;
        state.analysis.vesselLabel = vesselLabel;
        state.analysis.lowerExtSide = safeString(selection?.lowerExtSide);
        state.analysis.lowerExtLevel = safeString(selection?.lowerExtLevel);
        state.analysis.segmentCode = safeString(segment?.code);
        state.analysis.segmentLabel = safeString(segment?.label);
      }
      persistActiveSeriesState();
      return;
    }

    for (const series of state.series) {
      const reportEntry = getSeriesReportEntries(series).find((item) => item.id === entryId);
      if (!reportEntry) {
        continue;
      }
      reportEntry.analysisCategory = analysisCategory;
      reportEntry.vesselLabel = vesselLabel;
      reportEntry.lowerExtSide = safeString(selection?.lowerExtSide);
      reportEntry.lowerExtLevel = safeString(selection?.lowerExtLevel);
      reportEntry.segmentCode = safeString(segment?.code);
      reportEntry.segmentLabel = safeString(segment?.label);
      if (reportEntry.analysis) {
        reportEntry.analysis.analysisCategory = analysisCategory;
        reportEntry.analysis.vesselLabel = vesselLabel;
        reportEntry.analysis.lowerExtSide = safeString(selection?.lowerExtSide);
        reportEntry.analysis.lowerExtLevel = safeString(selection?.lowerExtLevel);
        reportEntry.analysis.segmentCode = safeString(segment?.code);
        reportEntry.analysis.segmentLabel = safeString(segment?.label);
      }
      if (series.id === state.activeSeriesId && Number.isFinite(state.selectedFrameIndex) && state.analysis?.frameIndex === reportEntry.frameIndex) {
        updateMainSelectionUi({
          category: analysisCategory,
          source: {
            analysisCategory,
            vesselLabel,
            segmentCode: segment?.code,
            segmentLabel: segment?.label,
            lowerExtSide: selection?.lowerExtSide,
            lowerExtLevel: selection?.lowerExtLevel,
          },
        });
      }
      return;
    }
  }

  function confirmLocalizationPrompt() {
    const selection = getCurrentLocalizationSelectionFromUi();
    const vesselLabel = safeString(selection?.vesselLabel);
    const segment = selection?.segment;
    if (!vesselLabel || !segment) {
      updateLocalizationPromptUi();
      return;
    }

    state.localizationPromptOpen = false;
    const promptMode = state.localizationPromptMode;
    const targetEntryId = state.localizationPromptTargetEntryId;
    state.localizationPromptMode = null;
    state.localizationPromptTargetEntryId = null;

    if (promptMode === "exportConfirm") {
      applyLocalizationToEntry(targetEntryId, selection);
      updateUi();
      scheduleRender();
      if (localizationPromptResolver) {
        const resolver = localizationPromptResolver;
        localizationPromptResolver = null;
        resolver(true);
      }
      setStatus(`Export localization confirmed: ${vesselLabel} · ${formatSegmentOptionLabel(segment)}.`);
      return;
    }

    if (promptMode === "nextStenosis") {
      recordHistoryStep("next lesion");
      const hadMeasurements = Boolean(state.analysis?.measurements);
      if (hadMeasurements && state.analysis) {
        state.analysis.analysisCategory = safeString(selection.analysisCategory);
        state.analysis.vesselLabel = vesselLabel;
        state.analysis.lowerExtSide = safeString(selection.lowerExtSide);
        state.analysis.lowerExtLevel = safeString(selection.lowerExtLevel);
        state.analysis.segmentCode = segment.code;
        state.analysis.segmentLabel = segment.label;
        updateMainSelectionUi({
          category: selection.analysisCategory,
          source: {
            analysisCategory: selection.analysisCategory,
            vesselLabel,
            segmentCode: segment.code,
            segmentLabel: segment.label,
            lowerExtSide: selection.lowerExtSide,
            lowerExtLevel: selection.lowerExtLevel,
          },
        });
      }
      const archivedEntry = hadMeasurements ? archiveCurrentAnalysisToReport() : null;

      state.mode = MODES.anchors;
      state.dragging = null;
      state.referenceSamplingTarget = null;
      state.activePopover = null;
      state.profileGeometry = null;
      els.profileCanvas.style.cursor = "default";

      updateMainSelectionUi({
        category: selection.analysisCategory,
        source: {
          analysisCategory: selection.analysisCategory,
          vesselLabel,
          segmentCode: segment.code,
          segmentLabel: segment.label,
          lowerExtSide: selection.lowerExtSide,
          lowerExtLevel: selection.lowerExtLevel,
        },
      });
      els.lesionLabelInput.value = "";

      resetAnalysisForSelectedFrame();
      persistActiveSeriesState();
      updateUi();
      scheduleRender();

      if (archivedEntry) {
        setStatus(
          `Saved ${buildSavedStenosisLabel(archivedEntry)}. Continue with the next stenosis on frame ${state.selectedFrameIndex + 1}.`
        );
        return;
      }

      setStatus(
        `Localization set to ${vesselLabel} · ${formatSegmentOptionLabel(segment)}. Continue the next stenosis on frame ${state.selectedFrameIndex + 1}.`
      );
      return;
    }

    updateMainSelectionUi({
      category: selection.analysisCategory,
      source: {
        analysisCategory: selection.analysisCategory,
        vesselLabel,
        segmentCode: segment.code,
        segmentLabel: segment.label,
        lowerExtSide: selection.lowerExtSide,
        lowerExtLevel: selection.lowerExtLevel,
      },
    });
    els.lesionLabelInput.value = "";

    state.mode = MODES.anchors;
    resetAnalysisForSelectedFrame();
    persistActiveSeriesState();
    updateUi();
    scheduleRender();
    setStatus(
      `Localization set to ${vesselLabel} · ${formatSegmentOptionLabel(segment)}. Continue the next stenosis on frame ${state.selectedFrameIndex + 1}.`
    );
  }

  function requestLocalizationConfirmationForSingleExport(entry) {
    if (!entry) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      localizationPromptResolver = resolve;
      openLocalizationPrompt({
        mode: "exportConfirm",
        analysisCategory: entry.analysisCategory || inferAnalysisCategory(entry),
        targetEntryId: entry.id,
        vesselLabel: entry.vesselLabel,
        segmentCode: entry.segmentCode,
        segmentLabel: entry.segmentLabel,
        lowerExtSide: entry.lowerExtSide,
        lowerExtLevel: entry.lowerExtLevel,
      });
    });
  }

  function closeLocalizationPrompt() {
    if (!state.localizationPromptOpen) {
      return;
    }
    const promptMode = state.localizationPromptMode;
    state.localizationPromptOpen = false;
    state.localizationPromptMode = null;
    state.localizationPromptTargetEntryId = null;
    updateUi();
    if (localizationPromptResolver) {
      const resolver = localizationPromptResolver;
      localizationPromptResolver = null;
      resolver(false);
    }
    if (promptMode === "exportConfirm") {
      setStatus("Export canceled before vessel and segment confirmation.", "warning");
      return;
    }
    if (promptMode === "nextStenosis") {
      setStatus("Next stenosis canceled. Continuing the current analysis.", "warning");
    }
  }

  function closeProjectionHelp() {
    if (!state.projectionHelpOpen) {
      return;
    }
    state.projectionHelpOpen = false;
    updateUi();
  }

  function stepProjectionHelp(offset) {
    if (!state.projectionHelpOpen) {
      return;
    }
    state.projectionHelpIndex = clamp(
      state.projectionHelpIndex + offset,
      0,
      PROJECTION_HELP_PAGES.length - 1
    );
    updateUi();
  }

  async function sampleSegmentationReferenceAtPoint(target, point) {
    const analysis = ensureAnalysisState();
    const frameDescriptor = getSelectedFrameDescriptor();
    if (!analysis || !frameDescriptor || !state.canvasTransform) {
      return;
    }

    const frame = await decodeFrame(frameDescriptor);
    const sampledValue = getNeighborhoodMean(frame.normalized, frame.columns, frame.rows, point, 1);
    const hints = ensureSegmentationHints(analysis);
    const needsResegment = hasSegmentedVessel();
    recordHistoryStep(`${target === "vessel" ? "vessel" : "background"} reference sampling`);
    if (target === "vessel") {
      hints.vesselTone = sampledValue;
      setStatus(
        needsResegment
          ? "Vessel reference tone sampled. Re-segment to apply the new vessel guidance."
          : "Vessel reference tone sampled from the locked QCA frame."
      );
    } else {
      hints.backgroundTone = sampledValue;
      setStatus(
        needsResegment
          ? "Background reference tone sampled. Re-segment to apply the new background guidance."
          : "Background reference tone sampled from the locked QCA frame."
      );
    }
    state.referenceSamplingTarget = null;
    updateUi();
    scheduleRender();
  }

  function clearReferenceTones() {
    const analysis = ensureAnalysisState();
    if (!analysis) {
      return;
    }
    recordHistoryStep("clear segmentation references");
    const hints = ensureSegmentationHints(analysis);
    hints.vesselTone = null;
    hints.backgroundTone = null;
    state.referenceSamplingTarget = null;
    updateUi();
    scheduleRender();
    setStatus(hasSegmentedVessel() ? "Reference tones cleared. Re-segment to remove their influence." : "Segmentation reference tones cleared.");
  }

  function updateCalibrationUi() {
    const series = getActiveSeries();
    const analysis = state.analysis;
    const manualCalibration = analysis?.calibration?.method === "manualLine" ? analysis.calibration : null;
    const effectiveCalibration = getActiveCalibration(series, analysis);
    const calibrationSummary = getCalibrationSummary(effectiveCalibration);

    els.calibrationStatusReadout.textContent = calibrationSummary.status;
    els.calibrationDetailReadout.textContent = calibrationSummary.detail;
    els.startCalibrationButton.disabled = !Number.isFinite(state.selectedFrameIndex) || !isAnalysisFrameVisible();
    els.clearCalibrationButton.disabled = !manualCalibration;
  }

  function updateSegmentationUi() {
    const selectedFrame = getSelectedFrameDescriptor();
    const anchors = state.analysis?.anchorPoints?.length || 0;
    const borderHints = state.analysis?.borderHintPoints?.length || 0;
    const canSegment = Boolean(selectedFrame && isAnalysisFrameVisible() && anchors >= 2);
    const hasSegmentation = hasSegmentedVessel();

    els.segmentButton.disabled = !canSegment;
    els.undoAnchorButton.disabled = !selectedFrame || !anchors;
    els.resegmentButton.disabled = !hasSegmentation;
    els.clearSegmentationButton.disabled = !selectedFrame || (!anchors && !borderHints && !hasSegmentation);

    if (!selectedFrame) {
      els.segmentationStatus.textContent = "Select a still frame to place vessel anchors.";
    } else if (!anchors) {
      els.segmentationStatus.textContent = "Selected frame locked. Click the image to place vessel points.";
    } else if (!hasSegmentation) {
      els.segmentationStatus.textContent = `${anchors} anchor point${anchors === 1 ? "" : "s"} placed${borderHints ? ` · ${borderHints} optional border hint${borderHints === 1 ? "" : "s"}` : ""}. Run segmentation when ready.`;
    } else {
      els.segmentationStatus.textContent = `${state.analysis.vesselLabel || "Vessel"} segmented on frame ${state.selectedFrameIndex + 1}${borderHints ? ` · ${borderHints} border hint${borderHints === 1 ? "" : "s"} available for re-segmentation` : ""}.`;
    }
  }

  function updateMeasurementUi() {
    const series = getActiveSeries();
    const measurements = state.analysis?.measurements;
    const analysis = state.analysis;
    const units = getMeasurementUnits(series, analysis);
    const calibration = getActiveCalibration(series, analysis);
    const reportEntryCount = getAllReportEntries().length;

    if (!measurements) {
      els.metricMld.textContent = "-";
      els.metricReference.textContent = "-";
      els.metricDs.textContent = "-";
      els.metricLength.textContent = "-";
      els.measurementNote.textContent = reportEntryCount
        ? `${formatLesionCount(reportEntryCount)} saved for export. Start the next stenosis or export the combined report.`
        : "No stenosis profile yet.";
    } else {
      els.metricMld.textContent = formatValue(measurements.mld, units, 2);
      els.metricReference.textContent = formatValue(measurements.referenceDiameter, units, 2);
      els.metricDs.textContent = formatPercent(measurements.percentDiameterStenosis);
      els.metricLength.textContent = formatValue(measurements.lesionLength, units, 1);
      els.measurementNote.textContent = `MLD at sample ${measurements.mldSampleIndex + 1} with editable stenosis and reference markers. Calibration: ${getCalibrationSummary(
        calibration
      ).status}.${reportEntryCount > 1 ? ` ${formatLesionCount(reportEntryCount - 1)} already saved to the report.` : ""}`;
    }

    if (calibration?.method === "manualLine") {
      const catheterText = Number.isFinite(calibration.knownFrenchSize)
        ? `${calibration.knownFrenchSize}F catheter`
        : calibration.label || "the selected object";
      els.calibrationBox.textContent = `Manual calibration is active at ${roundTo(
        calibration.mmPerPixel,
        5
      )} mm/pixel using ${catheterText} on the locked QCA frame. This is more trustworthy than raw DICOM spacing, but still depends on same-plane geometry and a correctly known object size.`;
    } else if (getMeasurementSpacing(series, analysis)) {
      const spacingText = roundTo(getMeasurementSpacing(series, analysis), 4);
      els.calibrationBox.textContent = `Using DICOM detector spacing of ${spacingText} mm/pixel as a fallback. For more trustworthy absolute QCA diameters, apply a manual same-frame calibration with a known catheter or marker.`;
    } else {
      els.calibrationBox.textContent =
        "No calibration is available. Measurements are shown in pixels until you set a manual calibration or DICOM spacing is present.";
    }

    els.exportResultsButton.disabled = reportEntryCount < 1;
    els.nextLesionButton.disabled = !Number.isFinite(state.selectedFrameIndex) || !hasAnalysisDraft(state.analysis);
    els.finishCloseButton.disabled = reportEntryCount < 1;
  }

  function updateHistoryUi() {
    els.undoActionButton.disabled = !state.history.length;
    if (els.redoActionButton) {
      els.redoActionButton.disabled = !state.redoHistory.length;
    }
  }

  function updateMetadataUi() {
    const series = getActiveSeries();
    const displayedFrame = getCurrentFrameDescriptor();
    const displayedRecord = displayedFrame?.record || null;
    const calibration = getActiveCalibration(series, state.analysis);
    const caseSummary = getCaseSummaryMetadata();
    if (!series) {
      els.metadataList.innerHTML = `
        <div class="meta-row">
          <dt>Status</dt>
          <dd>Load a DICOM series to inspect metadata.</dd>
        </div>
      `;
      return;
    }

    const spacingText = series.measurementSpacingMm
      ? `${roundTo(series.measurementSpacingMm, 4)} mm/pixel`
      : "Unavailable";
    const frameRateText = Number.isFinite(series.cineRateFps)
      ? `${roundTo(series.cineRateFps, 1)} fps`
      : Number.isFinite(series.frameTimeMs) && series.frameTimeMs > 0
        ? `${roundTo(1000 / series.frameTimeMs, 1)} fps`
        : "Unavailable";
    const estimatedSeriesDuration = computeSeriesDurationSeconds(series);
    const estimatedStudyDuration = computeStudyDurationSeconds();
    const displayedDoseProduct = Number.isFinite(displayedRecord?.doseAreaProduct) ? displayedRecord.doseAreaProduct : series.doseAreaProduct;
    const displayedExposureTime = Number.isFinite(displayedRecord?.exposureTimeMs) ? displayedRecord.exposureTimeMs : series.exposureTimeMs;
    const displayedExposureMas = Number.isFinite(displayedRecord?.exposureMas) ? displayedRecord.exposureMas : series.exposureMas;

    const localization = getLocalizationSummary(state.analysis, { allowUiFallback: true });

    const rows = [
      ["Patient", series.patientName || "—"],
      ["Patient ID", series.patientId || "—"],
      ["Birth Date", formatDate(series.patientBirthDate)],
      ["Modality", series.modality || "—"],
      ["Study Description", series.studyDescription || "—"],
      ["Accession", series.accessionNumber || "—"],
      ["Series", series.label || "—"],
      ["Saved Stenoses", String(getSavedReportEntries().length)],
      ["Vessel", localization.vesselLabel || "—"],
      ["Segment", localization.segmentDisplay],
      ["Stenosis Label", state.analysis?.lesionLabel || safeString(els.lesionLabelInput.value) || "—"],
      ["Study Date", formatDate(series.studyDate)],
      ["Study Time", formatTime(series.studyTime)],
      [
        "Study Dose Product",
        formatAggregateMetric(caseSummary.totalDoseAreaProduct, "", 3, caseSummary.totalDoseAreaProductMethod),
      ],
      [
        "Study Exposure Time",
        formatAggregateMetric(caseSummary.totalExposureTimeMs, "ms", 1, caseSummary.totalExposureTimeMethod),
      ],
      [
        "Study Contrast",
        Number.isFinite(caseSummary.totalContrastMl)
          ? `${formatAggregateMetric(caseSummary.totalContrastMl, "mL", 2, caseSummary.totalContrastMethod)}${
              formatContrastSource(caseSummary.totalContrastSource)
                ? ` · ${formatContrastSource(caseSummary.totalContrastSource)}`
                : ""
            }`
          : "—",
      ],
      ["Frames", String(series.frameCount)],
      [
        "Displayed Frame",
        displayedFrame ? `${displayedFrame.globalFrameIndex + 1} / ${series.frameCount}` : "—",
      ],
      [
        "QCA Frame",
        Number.isFinite(state.selectedFrameIndex) ? `${state.selectedFrameIndex + 1} / ${series.frameCount}` : "Not locked",
      ],
      [
        "Calibration",
        calibration ? getCalibrationSummary(calibration).status : "Uncalibrated",
      ],
      [
        "Acquisition",
        displayedRecord ? formatDateTime(displayedRecord.acquisitionDate, displayedRecord.acquisitionTime) : "—",
      ],
      [
        "Instance",
        Number.isFinite(displayedRecord?.instanceNumber) ? String(displayedRecord.instanceNumber) : "—",
      ],
      [
        "Source File",
        displayedRecord?.file?.name || "—",
      ],
      [
        "SOP Instance UID",
        displayedRecord?.sopInstanceUID || "—",
      ],
      ["Matrix", `${series.rows} × ${series.columns}`],
      ["Spacing", spacingText],
      [
        "Active Scale",
        calibration ? `${roundTo(calibration.mmPerPixel, 5)} mm/pixel` : "Pixels only",
      ],
      ["Frame Rate", frameRateText],
      ["Series Duration", formatDurationSeconds(estimatedSeriesDuration)],
      ["Loaded Study Duration", formatDurationSeconds(estimatedStudyDuration)],
      ["Series / Frame Dose Product", Number.isFinite(displayedDoseProduct) ? String(roundTo(displayedDoseProduct, 3)) : "—"],
      ["Series / Frame Exposure Time", Number.isFinite(displayedExposureTime) ? `${roundTo(displayedExposureTime, 1)} ms` : "—"],
      ["Series / Frame Exposure", Number.isFinite(displayedExposureMas) ? `${roundTo(displayedExposureMas, 3)} mAs` : "—"],
      ["Primary Angle", Number.isFinite(series.primaryAngle) ? `${roundTo(series.primaryAngle, 1)}°` : "—"],
      ["Secondary Angle", Number.isFinite(series.secondaryAngle) ? `${roundTo(series.secondaryAngle, 1)}°` : "—"],
    ];

    els.metadataList.innerHTML = rows
      .map(
        ([label, value]) => `
          <div class="meta-row">
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(String(value))}</dd>
          </div>
        `
      )
      .join("");
  }

  function updateUi() {
    updateWorkflowUi();
    updateSeriesUi();
    updateFrameUi();
    updateModeUi();
    updateCanvasMiniActionsUi();
    updateDisplayVisibilityUi();
    updateReferenceControlsUi();
    updateProjectionHelpUi();
    updateLocalizationPromptUi();
    updateFinishClosePromptUi();
    updateCabgCustomInputsUi();
    updateCalibrationUi();
    updateSegmentationUi();
    updateMeasurementUi();
    updateSavedStenosesUi();
    updateHistoryUi();
    updateMetadataUi();
  }

  function updateCanvasMiniActionsUi() {
    const activeSeries = getActiveSeries();
    const canResetWindowing = Boolean(activeSeries && hasCustomWindowing(activeSeries));
    const canResetView = Boolean(activeSeries && hasCustomCanvasView(activeSeries));
    if (els.canvasResetWindowButton) {
      els.canvasResetWindowButton.disabled = false;
      els.canvasResetWindowButton.classList.toggle("is-muted", !canResetWindowing);
    }
    if (els.canvasResetViewButton) {
      els.canvasResetViewButton.disabled = false;
      els.canvasResetViewButton.classList.toggle("is-muted", !canResetView);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function capitalize(value) {
    const text = safeString(value);
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
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

  function compareRecords(left, right) {
    if (Number.isFinite(left.instanceNumber) && Number.isFinite(right.instanceNumber) && left.instanceNumber !== right.instanceNumber) {
      return left.instanceNumber - right.instanceNumber;
    }
    const acquisitionLeft = `${left.acquisitionDate || ""}${left.acquisitionTime || ""}`;
    const acquisitionRight = `${right.acquisitionDate || ""}${right.acquisitionTime || ""}`;
    if (acquisitionLeft && acquisitionRight && acquisitionLeft !== acquisitionRight) {
      return acquisitionLeft.localeCompare(acquisitionRight);
    }
    return naturalCompare(left.file.name, right.file.name);
  }

  function groupSeries(records) {
    const grouped = new Map();
    records.forEach((record) => {
      if (!record.hasPixelData) {
        return;
      }
      const key =
        record.seriesInstanceUID ||
        `${record.seriesDescription || "series"}::${record.patientId || "unknown"}::${record.studyDate || ""}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(record);
    });

    return Array.from(grouped.entries())
      .map(([key, group]) => {
        group.sort(compareRecords);
        return { key, records: group };
      })
      .sort((left, right) => {
        const rightFrames = right.records.reduce((sum, record) => sum + Math.max(1, record.numberOfFrames || 1), 0);
        const leftFrames = left.records.reduce((sum, record) => sum + Math.max(1, record.numberOfFrames || 1), 0);
        return rightFrames - leftFrames || naturalCompare(left.records[0]?.seriesDescription, right.records[0]?.seriesDescription);
      });
  }

  function buildSeriesId(key, offset) {
    const slug = safeString(key)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return `qca_series_${slug || "series"}_${offset}`;
  }

  function pickMeasurementSpacing(record) {
    const source = record.pixelSpacing?.length >= 2 ? record.pixelSpacing : record.imagerPixelSpacing;
    if (!source || source.length < 2 || !Number.isFinite(source[0]) || !Number.isFinite(source[1])) {
      return null;
    }
    const average = (source[0] + source[1]) / 2;
    return average > 0 ? average : null;
  }

  function buildSeriesFromGroup(group, offset) {
    const first = group.records[0];
    const seriesId = buildSeriesId(group.key, offset);
    const frames = [];
    let globalFrameIndex = 0;

    group.records.forEach((record) => {
      const frameCount = Math.max(1, record.numberOfFrames || 1);
      for (let localFrameIndex = 0; localFrameIndex < frameCount; localFrameIndex += 1) {
        frames.push({
          id: `${seriesId}_frame_${globalFrameIndex}`,
          seriesId,
          globalFrameIndex,
          localFrameIndex,
          record,
        });
        globalFrameIndex += 1;
      }
    });

    const label = first.seriesDescription || `Series ${offset + 1}`;
    const acquisitionTimesMs = group.records
      .map((record) => getDicomDateTimeMs(record.acquisitionDate || record.studyDate, record.acquisitionTime || record.studyTime))
      .filter(Number.isFinite);
    const doseAreaProducts = group.records.map((record) => record.doseAreaProduct).filter(Number.isFinite);
    const exposureTimes = group.records.map((record) => record.exposureTimeMs).filter(Number.isFinite);
    const exposureMasValues = group.records.map((record) => record.exposureMas).filter(Number.isFinite);
    const contrastVolumes = group.records.map((record) => record.contrastBolusVolumeMl).filter(Number.isFinite);
    const contrastTotalDoses = group.records.map((record) => record.contrastBolusTotalDoseMl).filter(Number.isFinite);
    const contrastAgents = group.records.map((record) => safeString(record.contrastBolusAgent)).filter(Boolean);
    return {
      id: seriesId,
      key: group.key,
      label,
      frames,
      frameCount: frames.length,
      rows: first.rows || 0,
      columns: first.columns || 0,
      patientName: first.patientName || "",
      patientId: first.patientId || "",
      patientBirthDate: first.patientBirthDate || "",
      modality: first.modality || "",
      studyDate: first.studyDate || "",
      studyTime: first.studyTime || "",
      studyDescription: first.studyDescription || "",
      accessionNumber: first.accessionNumber || "",
      seriesInstanceUID: first.seriesInstanceUID || "",
      frameTimeMs: Number.isFinite(first.frameTime) ? first.frameTime : null,
      cineRateFps: Number.isFinite(first.cineRate) ? first.cineRate : null,
      primaryAngle: Number.isFinite(first.primaryAngle) ? first.primaryAngle : null,
      secondaryAngle: Number.isFinite(first.secondaryAngle) ? first.secondaryAngle : null,
      acquisitionStartMs: acquisitionTimesMs.length ? Math.min(...acquisitionTimesMs) : null,
      acquisitionEndMs: acquisitionTimesMs.length ? Math.max(...acquisitionTimesMs) : null,
      doseAreaProduct: doseAreaProducts.length ? Math.max(...doseAreaProducts) : null,
      exposureTimeMs: exposureTimes.length ? Math.max(...exposureTimes) : null,
      exposureMas: exposureMasValues.length ? Math.max(...exposureMasValues) : null,
      contrastBolusAgent: contrastAgents[0] || "",
      contrastBolusVolumeMl: contrastVolumes.length ? Math.max(...contrastVolumes) : null,
      contrastBolusTotalDoseMl: contrastTotalDoses.length ? Math.max(...contrastTotalDoses) : null,
      measurementSpacingMm: pickMeasurementSpacing(first),
      currentFrameIndex: 0,
      selectedFrameIndex: null,
      analysis: null,
      reportEntries: [],
      view: { zoom: 1, panX: 0, panY: 0, windowCenter: null, windowWidth: null },
      draftAnalysisCategory: safeString(getSelectedAnalysisCategory()),
      draftVesselLabel: safeString(getCurrentSelectionFromUi().vesselLabel),
      draftLowerExtSide: safeString(getCurrentSelectionFromUi().lowerExtSide),
      draftLowerExtLevel: safeString(getCurrentSelectionFromUi().lowerExtLevel),
      draftSegmentCode: safeString(getCurrentSelectionFromUi().segmentCode),
      draftSegmentLabel: safeString(getCurrentSelectionFromUi().segmentLabel),
      draftLesionLabel: safeString(els.lesionLabelInput?.value),
    };
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
      const pixelDataElement = dataSet.elements.x7fe00010 || dataSet.elements.x7fe00008;
      const isPartialRead = Number.isFinite(byteLimit) && file.size > byteLimit;
      if (!pixelDataElement && isPartialRead) {
        continue;
      }

      return {
        file,
        transferSyntaxUID: safeString(dataSet.string("x00020010")),
        patientName: prettifyPatientName(dataSet.string("x00100010")),
        patientId: safeString(dataSet.string("x00100020")),
        patientBirthDate: safeString(dataSet.string("x00100030")),
        studyDate: safeString(dataSet.string("x00080020")),
        studyTime: safeString(dataSet.string("x00080030")),
        acquisitionDate: safeString(dataSet.string("x00080022")),
        acquisitionTime: safeString(dataSet.string("x00080032")),
        modality: safeString(dataSet.string("x00080060")),
        accessionNumber: safeString(dataSet.string("x00080050")),
        studyDescription: safeString(dataSet.string("x00081030")),
        seriesDescription: safeString(dataSet.string("x0008103e")),
        seriesInstanceUID: safeString(dataSet.string("x0020000e")),
        sopInstanceUID: safeString(dataSet.string("x00080018")),
        instanceNumber: parseFirstNumber(dataSet.string("x00200013")),
        numberOfFrames: parseFirstNumber(dataSet.string("x00280008")),
        rows: parseFirstNumber(dataSet.string("x00280010")),
        columns: parseFirstNumber(dataSet.string("x00280011")),
        pixelSpacing: parseNumericArray(dataSet.string("x00280030")),
        imagerPixelSpacing: parseNumericArray(dataSet.string("x00181164")),
        photometricInterpretation: safeString(dataSet.string("x00280004")),
        samplesPerPixel: parseFirstNumber(dataSet.string("x00280002")),
        bitsAllocated: parseFirstNumber(dataSet.string("x00280100")),
        pixelRepresentation: parseFirstNumber(dataSet.string("x00280103")),
        windowCenter: parseFirstNumber(dataSet.string("x00281050")),
        windowWidth: parseFirstNumber(dataSet.string("x00281051")),
        rescaleIntercept: parseFirstNumber(dataSet.string("x00281052")),
        rescaleSlope: parseFirstNumber(dataSet.string("x00281053")),
        frameTime: parseFirstNumber(dataSet.string("x00181063")),
        cineRate: parseFirstNumber(dataSet.string("x00180040")),
        contrastBolusAgent: safeString(dataSet.string("x00180010")),
        contrastBolusVolumeMl: parseFirstNumber(dataSet.string("x00181041")),
        contrastBolusTotalDoseMl: parseFirstNumber(dataSet.string("x00181044")),
        exposureTimeMs: parseFirstNumber(dataSet.string("x00181150")),
        exposureMas: parseFirstNumber(dataSet.string("x00181152")),
        doseAreaProduct: parseFirstNumber(dataSet.string("x0018115e")),
        primaryAngle: parseFirstNumber(dataSet.string("x00181510")),
        secondaryAngle: parseFirstNumber(dataSet.string("x00181511")),
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

    async function worker() {
      while (nextIndex < sourceFiles.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        try {
          parsed[currentIndex] = await parseDicomHeader(sourceFiles[currentIndex]);
        } catch (_error) {
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
    return parsed.filter(Boolean);
  }

  function resetAnalysisForSelectedFrame() {
    const currentSelection = getCurrentSelectionFromUi();
    state.analysis = {
      frameIndex: state.selectedFrameIndex,
      analysisCategory: safeString(currentSelection.analysisCategory),
      vesselLabel: safeString(currentSelection.vesselLabel),
      lowerExtSide: safeString(currentSelection.lowerExtSide),
      lowerExtLevel: safeString(currentSelection.lowerExtLevel),
      segmentCode: safeString(currentSelection.segmentCode),
      segmentLabel: safeString(currentSelection.segmentLabel),
      lesionLabel: safeString(els.lesionLabelInput.value),
      segmentationHints: {
        vesselTone: null,
        backgroundTone: null,
      },
      calibration: null,
      calibrationDraftPoints: [],
      anchorPoints: [],
      borderHintPoints: [],
      centerlineSampleCount: 0,
      centerlineControls: [],
      centerline: [],
      leftOffsetControls: [],
      rightOffsetControls: [],
      leftOffsets: [],
      rightOffsets: [],
      borderLeft: [],
      borderRight: [],
      lesion: null,
      measurements: null,
    };
    persistActiveSeriesState();
  }

  function clearDerivedSegmentation(analysis) {
    if (!analysis) {
      return;
    }
    analysis.centerlineSampleCount = 0;
    analysis.centerlineControls = [];
    analysis.centerline = [];
    analysis.leftOffsetControls = [];
    analysis.rightOffsetControls = [];
    analysis.leftOffsets = [];
    analysis.rightOffsets = [];
    analysis.borderLeft = [];
    analysis.borderRight = [];
    analysis.lesion = null;
    analysis.measurements = null;
  }

  function prepareNextLesion() {
    const series = getActiveSeries();
    if (!series || !Number.isFinite(state.selectedFrameIndex)) {
      setStatus("Lock a QCA frame before moving on to the next stenosis.", "warning");
      return;
    }

    state.dragging = null;
    state.referenceSamplingTarget = null;
    state.activePopover = null;
    state.localizationPromptOpen = false;
    openLocalizationPrompt({
      mode: "nextStenosis",
      analysisCategory: safeString(state.analysis?.analysisCategory || getSelectedAnalysisCategory()),
      vesselLabel: safeString(state.analysis?.vesselLabel || els.vesselLabelInput?.value),
      lowerExtSide: safeString(state.analysis?.lowerExtSide || els.lowerExtSideSelect?.value),
      lowerExtLevel: safeString(state.analysis?.lowerExtLevel || els.lowerExtLevelSelect?.value),
      segmentCode: safeString(state.analysis?.segmentCode || els.segmentLocationSelect?.value),
      segmentLabel: safeString(state.analysis?.segmentLabel),
    });
    updateUi();
    scheduleRender();
    setStatus(`Confirm vessel and segment before saving the current stenosis on frame ${state.selectedFrameIndex + 1}.`);
  }

  function clearStudy(options) {
    if (!options?.skipHistory) {
      recordHistoryStep("clear study");
    }
    stopCinePlayback({ silent: true });
    state.series.forEach((series) => {
      series.frames.forEach((frame) => {
        if (frame.record?.fileImageId && window.cornerstoneWADOImageLoader?.wadouri?.fileManager?.remove) {
          cornerstoneWADOImageLoader.wadouri.fileManager.remove(frame.record.fileImageId);
        }
      });
    });

    state.series = [];
    state.activeSeriesId = null;
    state.reportEntryCounter = 1;
    state.currentFrameIndex = 0;
    state.selectedFrameIndex = null;
    state.frameCache.clear();
    state.analysis = null;
    state.pointer = { imageX: null, imageY: null, value: null };
    state.dragging = null;
    state.canvasTransform = null;
    state.profileGeometry = null;
    state.activePopover = null;
    state.projectionHelpOpen = false;
    state.projectionHelpIndex = 0;
    state.localizationPromptOpen = false;
    state.localizationPromptMode = null;
    state.localizationPromptTargetEntryId = null;
    state.drawTargetMode = null;
    if (state.mode === MODES.draw) {
      state.mode = MODES.anchors;
    }
    state.returnMode = MODES.anchors;
    state.finishClosePromptOpen = false;
    localizationPromptResolver = null;
    finishClosePromptResolver = null;
    state.referenceSamplingTarget = null;
    state.pendingRemovalRightClick = null;
    state.pendingLesionRightClick = null;
    els.profileCanvas.style.cursor = "default";
    updateUi();
    scheduleRender();
    setStatus("Ready for an XA cine or frame series");
  }

  async function loadStudyFromFiles(fileList, options) {
    const append = Boolean(options?.append);
    const files = Array.from(fileList || []).filter((file) => file.size > 0);
    if (!files.length) {
      return;
    }
    if (files.some((file) => isPotentialBundleFile(file))) {
      if (files.length !== 1 || !isPotentialBundleFile(files[0])) {
        throw new Error("Load a portable case bundle by itself, not mixed with other files.");
      }
      await loadPortableBundleFromFile(files[0], { append });
      return;
    }

    stopCinePlayback({ silent: true });

    if (!append) {
      recordHistoryStep("load study");
      clearStudy({ skipHistory: true });
    } else {
      recordHistoryStep("append study series");
      persistActiveSeriesState();
    }
    setStatus(`Reading ${files.length} DICOM file${files.length === 1 ? "" : "s"}...`);
    const records = await parseDicomFiles(files, {
      onProgress(done, total) {
        setStatus(`Reading DICOM headers ${done} / ${total}...`);
      },
    });
    if (!records.length) {
      throw new Error("No readable DICOM files were found.");
    }

    const groups = groupSeries(records);
    if (!groups.length) {
      throw new Error("No pixel data was found in the selected DICOM files.");
    }

    const seriesOffset = append ? state.series.length : 0;
    const nextSeries = groups.map((group, index) => buildSeriesFromGroup(group, seriesOffset + index));

    if (append) {
      state.series.push(...nextSeries);
    } else {
      state.series = nextSeries;
    }

    state.activeSeriesId = nextSeries[0].id;
    loadSeriesState(getActiveSeries());
    state.dragging = null;
    updateUi();
    scheduleRender();
    setStatus(
      append
        ? `Added ${nextSeries.length} angiography series. ${state.series.length} total loaded.`
        : `Loaded ${state.series.length} angiography series.`
    );
  }

  function activateSeries(seriesId) {
    if (!seriesId || seriesId === state.activeSeriesId) {
      return;
    }
    persistActiveSeriesState();
    recordHistoryStep("switch series");
    state.activeSeriesId = seriesId;
    loadSeriesState(getActiveSeries());
    state.dragging = null;
    state.profileGeometry = null;
    els.profileCanvas.style.cursor = "default";
    updateUi();
    scheduleRender();
    setStatus(`Activated ${getActiveSeries()?.label || "series"}.`);
  }

  function reopenSavedStenosis(entryId) {
    const location = findReportEntryLocation(entryId);
    if (!location?.entry) {
      setStatus("That saved stenosis could not be reopened.", "warning");
      return;
    }

    persistActiveSeriesState();
    recordHistoryStep("open saved stenosis");

    if (state.analysis?.measurements && safeString(state.analysis.reportEntryId) !== location.entry.id) {
      archiveCurrentAnalysisToReport();
    }

    stopCinePlayback({ silent: true });
    state.activePopover = null;
    state.referenceSamplingTarget = null;
    state.dragging = null;
    state.pendingRemovalRightClick = null;
    state.pendingLesionRightClick = null;
    state.localizationPromptOpen = false;
    state.localizationPromptMode = null;
    state.localizationPromptTargetEntryId = null;
    localizationPromptResolver = null;

    state.activeSeriesId = location.series.id;
    const series = getActiveSeries();
    if (!series) {
      setStatus("That saved stenosis no longer has a valid series.", "warning");
      return;
    }

    const frameIndex = clamp(Math.round(location.entry.frameIndex || 0), 0, Math.max(0, (series.frames?.length || 1) - 1));
    series.view = normalizeSeriesViewSnapshot(location.entry.viewSnapshot || series.view || getDefaultSeriesViewSnapshot());
    state.selectedFrameIndex = frameIndex;
    state.currentFrameIndex = frameIndex;
    state.analysis = deepClone(location.entry.analysis || null);
    if (!state.analysis) {
      setStatus("That saved stenosis no longer has a valid analysis snapshot.", "warning");
      return;
    }

    state.analysis.frameIndex = frameIndex;
    state.analysis.analysisCategory = safeString(location.entry.analysisCategory || state.analysis.analysisCategory || inferAnalysisCategory(location.entry));
    state.analysis.vesselLabel = safeString(location.entry.vesselLabel || state.analysis.vesselLabel);
    state.analysis.lowerExtSide = safeString(location.entry.lowerExtSide || state.analysis.lowerExtSide);
    state.analysis.lowerExtLevel = safeString(location.entry.lowerExtLevel || state.analysis.lowerExtLevel);
    state.analysis.segmentCode = safeString(location.entry.segmentCode || state.analysis.segmentCode);
    state.analysis.segmentLabel = safeString(location.entry.segmentLabel || state.analysis.segmentLabel);
    state.analysis.lesionLabel = safeString(location.entry.lesionLabel || state.analysis.lesionLabel);
    assignReportEntryIdentity(state.analysis, location.entry);

    series.selectedFrameIndex = frameIndex;
    series.currentFrameIndex = frameIndex;
    series.analysis = state.analysis;

    updateMainSelectionUi({
      category: state.analysis.analysisCategory || inferAnalysisCategory(state.analysis),
      source: state.analysis,
    });
    els.lesionLabelInput.value = state.analysis.lesionLabel || "";

    openSidebarSection(els.savedStenosesSection);
    openSidebarSection(els.vesselSection);
    openSidebarSection(els.qcaSection);
    activateMode(hasSegmentedVessel() ? MODES.lesion : MODES.anchors);
    state.profileGeometry = null;
    els.profileCanvas.style.cursor = "default";
    persistActiveSeriesState();
    updateUi();
    scheduleRender();
    prefetchNearbyFrames();
    scrollToElement(els.viewerSection);
    setStatus(`Reopened ${buildSavedStenosisLabel(location.entry)} for review and editing.`);
  }

  function activateRelativeSeries(offset) {
    if (!state.series.length || !Number.isFinite(offset) || offset === 0) {
      return;
    }
    const currentIndex = Math.max(
      0,
      state.series.findIndex((series) => series.id === state.activeSeriesId)
    );
    const nextIndex = ((currentIndex + offset) % state.series.length + state.series.length) % state.series.length;
    activateSeries(state.series[nextIndex]?.id);
  }

  function setCurrentFrameIndex(index, options) {
    const series = getActiveSeries();
    if (!series?.frames?.length) {
      return;
    }
    if (Number.isFinite(state.selectedFrameIndex) && !options?.allowLocked) {
      return;
    }
    state.currentFrameIndex = clamp(Math.round(index), 0, series.frames.length - 1);
    persistActiveSeriesState();
    updateUi();
    scheduleRender();
    prefetchNearbyFrames();
  }

  function selectCurrentFrameForAnalysis() {
    const series = getActiveSeries();
    if (!series?.frames?.length) {
      return;
    }
    recordHistoryStep(Number.isFinite(state.selectedFrameIndex) ? "unlock qca frame" : "lock qca frame");

    if (Number.isFinite(state.selectedFrameIndex)) {
      const frameNumber = state.selectedFrameIndex + 1;
      const archivedEntry = state.analysis?.measurements ? archiveCurrentAnalysisToReport() : null;
      state.selectedFrameIndex = null;
      state.analysis = null;
      state.dragging = null;
      state.referenceSamplingTarget = null;
      persistActiveSeriesState();
      updateUi();
      scheduleRender();
      setStatus(
        archivedEntry
          ? `Saved ${archivedEntry.vesselLabel}${archivedEntry.lesionLabel ? ` · ${archivedEntry.lesionLabel}` : ""} and deselected QCA frame ${frameNumber}. Cine scrolling is available again.`
          : `Deselected QCA frame ${frameNumber}. Cine scrolling is available again.`
      );
      return;
    }

    stopCinePlayback({ silent: true });
    state.selectedFrameIndex = state.currentFrameIndex;
    state.mode = MODES.anchors;
    resetAnalysisForSelectedFrame();
    persistActiveSeriesState();
    updateUi();
    scheduleRender();
    setStatus(`Locked frame ${state.selectedFrameIndex + 1} for quantitative coronary angiography analysis.`);
  }

  function jumpToAnalysisFrame() {
    if (!Number.isFinite(state.selectedFrameIndex)) {
      return;
    }
    setCurrentFrameIndex(state.selectedFrameIndex, { allowLocked: true });
  }

  function ensureAnalysisState() {
    if (!Number.isFinite(state.selectedFrameIndex)) {
      return null;
    }
    if (!state.analysis || state.analysis.frameIndex !== state.selectedFrameIndex) {
      resetAnalysisForSelectedFrame();
    }
    const currentSelection = getCurrentSelectionFromUi();
    state.analysis.analysisCategory = safeString(currentSelection.analysisCategory);
    state.analysis.vesselLabel = safeString(currentSelection.vesselLabel);
    state.analysis.lowerExtSide = safeString(currentSelection.lowerExtSide);
    state.analysis.lowerExtLevel = safeString(currentSelection.lowerExtLevel);
    state.analysis.segmentCode = safeString(currentSelection.segmentCode);
    state.analysis.segmentLabel = safeString(currentSelection.segmentLabel);
    state.analysis.lesionLabel = safeString(els.lesionLabelInput.value);
    return state.analysis;
  }

  function refreshMeasurementsAfterCalibrationChange() {
    const analysis = ensureAnalysisState();
    if (!analysis?.centerline?.length || !analysis?.leftOffsets?.length || !analysis?.rightOffsets?.length || !analysis?.lesion) {
      return;
    }
    analysis.measurements = computeMeasurements(
      analysis.centerline,
      analysis.leftOffsets,
      analysis.rightOffsets,
      analysis.lesion,
      getActiveSeries(),
      analysis.borderLeft,
      analysis.borderRight
    );
  }

  function computeManualCalibration(pointA, pointB) {
    const knownSizeMm = getKnownCalibrationSizeMm();
    const knownFrenchSize = getSelectedFrenchSize();
    if (!knownSizeMm) {
      throw new Error("Select a 4F, 5F, or 6F catheter size first.");
    }
    const pixelLength = distance(pointA, pointB);
    if (!Number.isFinite(pixelLength) || pixelLength < 2) {
      throw new Error("The calibration line is too short. Pick two clearer points.");
    }
    return {
      method: "manualLine",
      label: safeString(els.calibrationLabelInput.value) || "Known object",
      knownSizeMm,
      knownFrenchSize,
      pixelLength,
      mmPerPixel: knownSizeMm / pixelLength,
      points: [clonePoint(pointA), clonePoint(pointB)],
      sourceFrameIndex: state.selectedFrameIndex,
    };
  }

  function commitManualCalibration(pointA, pointB) {
    const analysis = ensureAnalysisState();
    if (!analysis) {
      return;
    }
    recordHistoryStep("manual calibration");
    analysis.calibration = computeManualCalibration(pointA, pointB);
    analysis.calibrationDraftPoints = [];
    refreshMeasurementsAfterCalibrationChange();
    updateUi();
    scheduleRender();
    setStatus(
      `Manual calibration set at ${roundTo(analysis.calibration.mmPerPixel, 5)} mm/pixel on frame ${state.selectedFrameIndex + 1}.`
    );
  }

  function startCalibrationMode() {
    if (!Number.isFinite(state.selectedFrameIndex) || !isAnalysisFrameVisible()) {
      throw new Error("Lock a QCA frame and return to it before calibrating.");
    }
    if (!getKnownCalibrationSizeMm()) {
      throw new Error("Select a 4F, 5F, or 6F catheter size first.");
    }
    const analysis = ensureAnalysisState();
    analysis.calibrationDraftPoints = [];
    state.mode = MODES.calibration;
    updateUi();
    scheduleRender();
    setStatus("Calibration mode active. Click two points across the known object on the locked QCA frame.");
  }

  function clearManualCalibration() {
    const analysis = ensureAnalysisState();
    if (!analysis) {
      return;
    }
    recordHistoryStep("clear manual calibration");
    analysis.calibration = null;
    analysis.calibrationDraftPoints = [];
    refreshMeasurementsAfterCalibrationChange();
    updateUi();
    scheduleRender();
    setStatus("Manual calibration cleared.");
  }

  function undoAnchor() {
    const analysis = ensureAnalysisState();
    if (!analysis?.anchorPoints?.length) {
      return;
    }
    recordHistoryStep("undo anchor");
    analysis.anchorPoints.pop();
    clearDerivedSegmentation(analysis);
    updateUi();
    scheduleRender();
  }

  function clearSegmentation() {
    const analysis = ensureAnalysisState();
    if (!analysis) {
      return;
    }
    recordHistoryStep("clear segmentation");
    analysis.anchorPoints = [];
    analysis.borderHintPoints = [];
    clearDerivedSegmentation(analysis);
    updateUi();
    scheduleRender();
    setStatus("Cleared the current vessel draft, including optional border hints.");
  }

  function getRecordArrayBuffer(record) {
    if (!record.arrayBufferPromise) {
      record.arrayBufferPromise = record.file.arrayBuffer();
    }
    return record.arrayBufferPromise;
  }

  async function getRecordDataSet(record) {
    if (!record.dataSetPromise) {
      record.dataSetPromise = getRecordArrayBuffer(record).then((buffer) => {
        const byteArray = new Uint8Array(buffer);
        return dicomParser.parseDicom(byteArray);
      });
    }
    return record.dataSetPromise;
  }

  async function decodeFrameManual(frameDescriptor) {
    const record = frameDescriptor.record;
    const dataSet = await getRecordDataSet(record);
    const transferSyntaxUID = safeString(dataSet.string("x00020010"));
    const rows = parseFirstNumber(dataSet.string("x00280010")) || record.rows;
    const columns = parseFirstNumber(dataSet.string("x00280011")) || record.columns;
    const samplesPerPixel = parseFirstNumber(dataSet.string("x00280002")) || record.samplesPerPixel || 1;
    const bitsAllocated = parseFirstNumber(dataSet.string("x00280100")) || record.bitsAllocated || 16;
    const pixelRepresentation = parseFirstNumber(dataSet.string("x00280103")) || record.pixelRepresentation || 0;
    const numberOfFrames = Math.max(1, parseFirstNumber(dataSet.string("x00280008")) || record.numberOfFrames || 1);
    const pixelDataElement = dataSet.elements.x7fe00010;

    if (!SUPPORTED_TRANSFER_SYNTAXES.has(transferSyntaxUID) || pixelDataElement?.fragments?.length) {
      throw new Error("Transfer syntax requires Cornerstone decoding.");
    }

    if (samplesPerPixel !== 1) {
      throw new Error("Only monochrome XA frames are supported in phase 1.");
    }

    if (!pixelDataElement || !Number.isFinite(rows) || !Number.isFinite(columns)) {
      throw new Error("The DICOM file does not expose readable pixel data.");
    }

    const sampleCount = rows * columns;
    const frameIndex = clamp(frameDescriptor.localFrameIndex, 0, numberOfFrames - 1);
    const bytesPerSample = bitsAllocated === 16 ? 2 : bitsAllocated === 8 ? 1 : 0;
    if (!bytesPerSample) {
      throw new Error(`Unsupported Bits Allocated value: ${bitsAllocated}`);
    }
    const frameOffset = sampleCount * bytesPerSample * frameIndex;
    const byteArray = new Uint8Array(await getRecordArrayBuffer(record));
    const byteOffset = byteArray.byteOffset + pixelDataElement.dataOffset + frameOffset;

    let sourcePixels;
    if (bitsAllocated === 16) {
      sourcePixels =
        pixelRepresentation === 1
          ? new Int16Array(byteArray.buffer, byteOffset, sampleCount)
          : new Uint16Array(byteArray.buffer, byteOffset, sampleCount);
    } else {
      sourcePixels =
        pixelRepresentation === 1
          ? new Int8Array(byteArray.buffer, byteOffset, sampleCount)
          : new Uint8Array(byteArray.buffer, byteOffset, sampleCount);
    }

    const slope = Number.isFinite(record.rescaleSlope) ? record.rescaleSlope : 1;
    const intercept = Number.isFinite(record.rescaleIntercept) ? record.rescaleIntercept : 0;
    const pixels = new Float32Array(sampleCount);
    for (let index = 0; index < sampleCount; index += 1) {
      pixels[index] = sourcePixels[index] * slope + intercept;
    }

    return buildPreparedFrame({
      rows,
      columns,
      pixels,
      photometricInterpretation: record.photometricInterpretation,
      windowCenter: record.windowCenter,
      windowWidth: record.windowWidth,
    });
  }

  async function decodeFrameWithCornerstone(frameDescriptor) {
    initializeDecoderFallback();
    if (!state.decoderFallbackReady) {
      throw new Error("Compressed DICOM decoding is not available in this browser build.");
    }

    const record = frameDescriptor.record;
    if (!record.fileImageId) {
      record.fileImageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(record.file);
    }
    const imageId =
      Math.max(1, record.numberOfFrames || 1) > 1
        ? `${record.fileImageId}?frame=${frameDescriptor.localFrameIndex + 1}`
        : record.fileImageId;

    const image = await cornerstone.loadAndCacheImage(imageId);
    const rawPixels = image.getPixelData?.();
    if (!rawPixels || !Number.isFinite(image.rows) || !Number.isFinite(image.columns)) {
      throw new Error("Cornerstone could not decode the selected frame.");
    }
    if (image.color) {
      throw new Error("Only monochrome XA frames are supported in phase 1.");
    }

    const slope = Number.isFinite(image.slope) ? image.slope : Number.isFinite(record.rescaleSlope) ? record.rescaleSlope : 1;
    const intercept = Number.isFinite(image.intercept)
      ? image.intercept
      : Number.isFinite(record.rescaleIntercept)
        ? record.rescaleIntercept
        : 0;

    const pixels = new Float32Array(rawPixels.length);
    for (let index = 0; index < rawPixels.length; index += 1) {
      pixels[index] = rawPixels[index] * slope + intercept;
    }

    return buildPreparedFrame({
      rows: image.rows,
      columns: image.columns,
      pixels,
      photometricInterpretation: record.photometricInterpretation,
      windowCenter: record.windowCenter,
      windowWidth: record.windowWidth,
    });
  }

  function percentileFromSamples(values, percentile) {
    const sorted = values.slice().sort((left, right) => left - right);
    if (!sorted.length) {
      return null;
    }
    const index = clamp(Math.round((sorted.length - 1) * percentile), 0, sorted.length - 1);
    return sorted[index];
  }

  function computeDisplayWindow(pixels, windowCenter, windowWidth) {
    if (Number.isFinite(windowCenter) && Number.isFinite(windowWidth) && windowWidth > 0) {
      return {
        low: windowCenter - windowWidth / 2,
        high: windowCenter + windowWidth / 2,
      };
    }

    const samples = [];
    const step = Math.max(1, Math.floor(pixels.length / 4096));
    for (let index = 0; index < pixels.length; index += step) {
      samples.push(pixels[index]);
    }
    const low = percentileFromSamples(samples, 0.01);
    const high = percentileFromSamples(samples, 0.995);
    if (!Number.isFinite(low) || !Number.isFinite(high) || low === high) {
      return { low: 0, high: 1 };
    }
    return { low, high };
  }

  function computeGradientMagnitude(normalized, rows, columns) {
    const gradient = new Float32Array(normalized.length);
    for (let y = 1; y < rows - 1; y += 1) {
      const rowOffset = y * columns;
      const prevRow = (y - 1) * columns;
      const nextRow = (y + 1) * columns;
      for (let x = 1; x < columns - 1; x += 1) {
        const gx =
          -normalized[prevRow + x - 1] +
          normalized[prevRow + x + 1] -
          2 * normalized[rowOffset + x - 1] +
          2 * normalized[rowOffset + x + 1] -
          normalized[nextRow + x - 1] +
          normalized[nextRow + x + 1];
        const gy =
          -normalized[prevRow + x - 1] -
          2 * normalized[prevRow + x] -
          normalized[prevRow + x + 1] +
          normalized[nextRow + x - 1] +
          2 * normalized[nextRow + x] +
          normalized[nextRow + x + 1];
        gradient[rowOffset + x] = Math.min(1, Math.hypot(gx, gy) / 4);
      }
    }
    return gradient;
  }

  function buildPreparedFrame({ rows, columns, pixels, photometricInterpretation, windowCenter, windowWidth }) {
    const { low, high } = computeDisplayWindow(pixels, windowCenter, windowWidth);
    const range = Math.max(1e-6, high - low);
    const invert = safeString(photometricInterpretation).toUpperCase() === "MONOCHROME1";
    const normalized = new Float32Array(pixels.length);
    const rgba = new Uint8ClampedArray(pixels.length * 4);

    for (let index = 0; index < pixels.length; index += 1) {
      let value = clamp((pixels[index] - low) / range, 0, 1);
      if (invert) {
        value = 1 - value;
      }
      normalized[index] = value;
      const channel = Math.round(value * 255);
      const offset = index * 4;
      rgba[offset] = channel;
      rgba[offset + 1] = channel;
      rgba[offset + 2] = channel;
      rgba[offset + 3] = 255;
    }

    const gradient = computeGradientMagnitude(normalized, rows, columns);
    const imageData = new ImageData(rgba, columns, rows);
    return {
      rows,
      columns,
      pixels,
      normalized,
      gradient,
      imageData,
      low,
      high,
      invert,
    };
  }

  function buildWindowedImageData(frame, low, high) {
    const range = Math.max(1e-6, high - low);
    const rgba = new Uint8ClampedArray(frame.pixels.length * 4);
    for (let index = 0; index < frame.pixels.length; index += 1) {
      let value = clamp((frame.pixels[index] - low) / range, 0, 1);
      if (frame.invert) {
        value = 1 - value;
      }
      const channel = Math.round(value * 255);
      const offset = index * 4;
      rgba[offset] = channel;
      rgba[offset + 1] = channel;
      rgba[offset + 2] = channel;
      rgba[offset + 3] = 255;
    }
    return new ImageData(rgba, frame.columns, frame.rows);
  }

  function buildFrameCanvas(frame, viewState) {
    const windowState = getFrameWindowState(frame, viewState || getActiveViewState());
    if (!windowState.isCustom) {
      if (frame.renderCanvas) {
        return frame.renderCanvas;
      }
      const canvas = document.createElement("canvas");
      canvas.width = frame.columns;
      canvas.height = frame.rows;
      canvas.getContext("2d").putImageData(frame.imageData, 0, 0);
      frame.renderCanvas = canvas;
      return canvas;
    }

    const cacheKey = `${roundTo(windowState.center, 3)}:${roundTo(windowState.width, 3)}`;
    if (frame.windowedRenderCanvas && frame.windowedRenderKey === cacheKey) {
      return frame.windowedRenderCanvas;
    }

    const canvas = frame.windowedRenderCanvas || document.createElement("canvas");
    canvas.width = frame.columns;
    canvas.height = frame.rows;
    canvas.getContext("2d").putImageData(buildWindowedImageData(frame, windowState.low, windowState.high), 0, 0);
    frame.windowedRenderCanvas = canvas;
    frame.windowedRenderKey = cacheKey;
    return canvas;
  }

  function cacheDecodedFrame(cacheKey, frame) {
    if (state.frameCache.has(cacheKey)) {
      state.frameCache.delete(cacheKey);
    }
    state.frameCache.set(cacheKey, frame);
    while (state.frameCache.size > MAX_FRAME_CACHE_SIZE) {
      const oldestKey = state.frameCache.keys().next().value;
      state.frameCache.delete(oldestKey);
    }
  }

  async function decodeFrame(frameDescriptor) {
    if (!frameDescriptor) {
      return null;
    }
    if (state.frameCache.has(frameDescriptor.id)) {
      const cached = state.frameCache.get(frameDescriptor.id);
      state.frameCache.delete(frameDescriptor.id);
      state.frameCache.set(frameDescriptor.id, cached);
      return cached;
    }

    let decoded;
    try {
      decoded = await decodeFrameManual(frameDescriptor);
    } catch (_error) {
      decoded = await decodeFrameWithCornerstone(frameDescriptor);
    }

    cacheDecodedFrame(frameDescriptor.id, decoded);
    return decoded;
  }

  function prefetchNearbyFrames() {
    const series = getActiveSeries();
    if (!series?.frames?.length) {
      return;
    }
    const indices = new Set([
      clamp(state.currentFrameIndex - 1, 0, series.frames.length - 1),
      state.currentFrameIndex,
      clamp(state.currentFrameIndex + 1, 0, series.frames.length - 1),
      Number.isFinite(state.selectedFrameIndex) ? state.selectedFrameIndex : null,
    ]);
    indices.forEach((index) => {
      if (!Number.isFinite(index)) {
        return;
      }
      decodeFrame(series.frames[index]).catch(() => {});
    });
  }

  function waitForAnimationFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(resolve));
  }

  class MinHeap {
    constructor() {
      this.items = [];
    }

    get size() {
      return this.items.length;
    }

    push(item) {
      this.items.push(item);
      this.bubbleUp(this.items.length - 1);
    }

    pop() {
      if (!this.items.length) {
        return null;
      }
      const root = this.items[0];
      const tail = this.items.pop();
      if (this.items.length && tail) {
        this.items[0] = tail;
        this.bubbleDown(0);
      }
      return root;
    }

    bubbleUp(index) {
      let current = index;
      while (current > 0) {
        const parent = Math.floor((current - 1) / 2);
        if (this.items[parent].priority <= this.items[current].priority) {
          break;
        }
        [this.items[parent], this.items[current]] = [this.items[current], this.items[parent]];
        current = parent;
      }
    }

    bubbleDown(index) {
      let current = index;
      while (true) {
        const left = current * 2 + 1;
        const right = current * 2 + 2;
        let smallest = current;
        if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) {
          smallest = left;
        }
        if (right < this.items.length && this.items[right].priority < this.items[smallest].priority) {
          smallest = right;
        }
        if (smallest === current) {
          break;
        }
        [this.items[current], this.items[smallest]] = [this.items[smallest], this.items[current]];
        current = smallest;
      }
    }
  }

  function sampleFrameValue(buffer, width, height, x, y) {
    const clampedX = clamp(x, 0, width - 1);
    const clampedY = clamp(y, 0, height - 1);
    const x0 = Math.floor(clampedX);
    const y0 = Math.floor(clampedY);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const tx = clampedX - x0;
    const ty = clampedY - y0;
    const topLeft = buffer[y0 * width + x0];
    const topRight = buffer[y0 * width + x1];
    const bottomLeft = buffer[y1 * width + x0];
    const bottomRight = buffer[y1 * width + x1];
    const top = lerp(topLeft, topRight, tx);
    const bottom = lerp(bottomLeft, bottomRight, tx);
    return lerp(top, bottom, ty);
  }

  function getNeighborhoodMean(buffer, width, height, point, radius) {
    let sum = 0;
    let count = 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = clamp(Math.round(point.x) + dx, 0, width - 1);
        const y = clamp(Math.round(point.y) + dy, 0, height - 1);
        sum += buffer[y * width + x];
        count += 1;
      }
    }
    return count ? sum / count : 0;
  }

  function estimateAnchorModel(frame, anchors, analysis) {
    const hints = analysis ? ensureSegmentationHints(analysis) : null;
    const values = anchors.map((point) => getNeighborhoodMean(frame.normalized, frame.columns, frame.rows, point, 1));
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const variance =
      values.reduce((sum, value) => {
        const delta = value - mean;
        return sum + delta * delta;
      }, 0) / Math.max(1, values.length);
    const targetMean = Number.isFinite(hints?.vesselTone) ? hints.vesselTone : mean;
    const backgroundMean = Number.isFinite(hints?.backgroundTone) ? hints.backgroundTone : null;
    const manualSpread = Number.isFinite(backgroundMean)
      ? Math.max(0.04, Math.abs(targetMean - backgroundMean) * 0.28)
      : null;
    return {
      targetMean,
      backgroundMean,
      targetSpread: manualSpread || Math.max(0.06, Math.sqrt(variance) * 1.8),
    };
  }

  function pointToSegmentDistance(point, start, end) {
    return projectPointToSegment(point, start, end).distance;
  }

  function projectPointToSegment(point, start, end) {
    const segment = subtractPoints(end, start);
    const lengthSquared = segment.x * segment.x + segment.y * segment.y;
    if (!lengthSquared) {
      return {
        t: 0,
        point: clonePoint(start),
        distance: distance(point, start),
        tangent: { x: 1, y: 0 },
      };
    }
    const t = clamp(dotPoint(subtractPoints(point, start), segment) / lengthSquared, 0, 1);
    const projection = { x: start.x + segment.x * t, y: start.y + segment.y * t };
    return {
      t,
      point: projection,
      distance: distance(point, projection),
      tangent: normalizeVector(segment),
    };
  }

  function getNearestPolylineLocation(point, polyline) {
    if (!polyline?.length) {
      return null;
    }
    if (polyline.length === 1) {
      return {
        segmentIndex: 0,
        t: 0,
        point: clonePoint(polyline[0]),
        distance: distance(point, polyline[0]),
        tangent: { x: 1, y: 0 },
      };
    }

    let winner = null;
    for (let index = 0; index < polyline.length - 1; index += 1) {
      const projection = projectPointToSegment(point, polyline[index], polyline[index + 1]);
      if (!winner || projection.distance < winner.distance) {
        winner = {
          segmentIndex: index,
          t: projection.t,
          point: projection.point,
          distance: projection.distance,
          tangent: projection.tangent,
        };
      }
    }
    return winner;
  }

  function inferBorderHintGeometry(point, analysis) {
    const geometrySource =
      analysis?.centerline?.length > 1
        ? analysis.centerline
        : analysis?.anchorPoints?.length > 1
          ? analysis.anchorPoints
          : null;
    const location = getNearestPolylineLocation(point, geometrySource);
    if (!location) {
      return null;
    }
    const normal = perpendicular(location.tangent);
    const signedDistance = dotPoint(subtractPoints(point, location.point), normal);
    return {
      side: signedDistance <= 0 ? "left" : "right",
      signedDistance,
      guidePoint: location.point,
      tangent: location.tangent,
      distance: location.distance,
    };
  }

  function computePathCost(frame, x, y, start, end, model) {
    const index = y * frame.columns + x;
    const value = frame.normalized[index];
    const gradient = frame.gradient[index];
    const targetPenalty = Math.abs(value - model.targetMean) / model.targetSpread;
    const backgroundPenalty = Number.isFinite(model.backgroundMean) && Math.abs(value - model.backgroundMean) <= Math.abs(value - model.targetMean) ? 0.9 : 0;
    const lineDistance = pointToSegmentDistance({ x, y }, start, end);
    const segmentLength = Math.max(1, distance(start, end));
    const linePenalty = lineDistance / Math.max(12, segmentLength * 0.35);
    return 0.15 + targetPenalty * 1.35 + backgroundPenalty + gradient * 0.55 + linePenalty * 0.45;
  }

  function reconstructPath(previous, endIndex, width, minX, minY) {
    const path = [];
    let cursor = endIndex;
    while (cursor >= 0) {
      const x = cursor % width;
      const y = Math.floor(cursor / width);
      path.push({ x: minX + x, y: minY + y });
      cursor = previous[cursor];
    }
    path.reverse();
    return path;
  }

  function buildStraightPath(start, end) {
    const steps = Math.max(2, Math.ceil(distance(start, end)));
    const path = [];
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      path.push({
        x: lerp(start.x, end.x, t),
        y: lerp(start.y, end.y, t),
      });
    }
    return path;
  }

  function tracePathBetweenAnchors(frame, start, end, model) {
    const margin = clamp(Math.round(distance(start, end) * 0.5), 48, 140);
    const minX = clamp(Math.floor(Math.min(start.x, end.x) - margin), 0, frame.columns - 1);
    const maxX = clamp(Math.ceil(Math.max(start.x, end.x) + margin), 0, frame.columns - 1);
    const minY = clamp(Math.floor(Math.min(start.y, end.y) - margin), 0, frame.rows - 1);
    const maxY = clamp(Math.ceil(Math.max(start.y, end.y) + margin), 0, frame.rows - 1);
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const startX = clamp(Math.round(start.x), minX, maxX) - minX;
    const startY = clamp(Math.round(start.y), minY, maxY) - minY;
    const endX = clamp(Math.round(end.x), minX, maxX) - minX;
    const endY = clamp(Math.round(end.y), minY, maxY) - minY;
    const startIndex = startY * width + startX;
    const endIndex = endY * width + endX;

    const gScore = new Float32Array(width * height);
    gScore.fill(Number.POSITIVE_INFINITY);
    const previous = new Int32Array(width * height);
    previous.fill(-1);
    const visited = new Uint8Array(width * height);
    const heap = new MinHeap();

    gScore[startIndex] = 0;
    heap.push({
      index: startIndex,
      priority: 0,
    });

    const neighborOffsets = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ];

    while (heap.size) {
      const current = heap.pop();
      if (!current || visited[current.index]) {
        continue;
      }
      visited[current.index] = 1;
      if (current.index === endIndex) {
        return reconstructPath(previous, endIndex, width, minX, minY);
      }

      const currentX = current.index % width;
      const currentY = Math.floor(current.index / width);
      for (let neighborIndex = 0; neighborIndex < neighborOffsets.length; neighborIndex += 1) {
        const [dx, dy] = neighborOffsets[neighborIndex];
        const nextX = currentX + dx;
        const nextY = currentY + dy;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
          continue;
        }

        const nextIndex = nextY * width + nextX;
        if (visited[nextIndex]) {
          continue;
        }

        const worldX = minX + nextX;
        const worldY = minY + nextY;
        const stepLength = dx && dy ? Math.SQRT2 : 1;
        const tentative =
          gScore[current.index] + stepLength * (1 + computePathCost(frame, worldX, worldY, start, end, model));
        if (tentative >= gScore[nextIndex]) {
          continue;
        }

        gScore[nextIndex] = tentative;
        previous[nextIndex] = current.index;
        const heuristic = Math.hypot(nextX - endX, nextY - endY) * 0.85;
        heap.push({
          index: nextIndex,
          priority: tentative + heuristic,
        });
      }
    }

    return buildStraightPath(start, end);
  }

  function smoothPolyline(points, iterations) {
    let current = clonePoints(points);
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const next = current.map((point, index) => {
        if (index === 0 || index === current.length - 1) {
          return clonePoint(point);
        }
        return {
          x: (current[index - 1].x + point.x + current[index + 1].x) / 3,
          y: (current[index - 1].y + point.y + current[index + 1].y) / 3,
        };
      });
      current = next;
    }
    return current;
  }

  function polylineLength(points) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      total += distance(points[index - 1], points[index]);
    }
    return total;
  }

  function resamplePolyline(points, stepPx) {
    if (!points?.length) {
      return [];
    }
    if (points.length === 1) {
      return [clonePoint(points[0])];
    }

    const cumulative = [0];
    for (let index = 1; index < points.length; index += 1) {
      cumulative.push(cumulative[index - 1] + distance(points[index - 1], points[index]));
    }

    const totalLength = cumulative[cumulative.length - 1];
    const count = Math.max(MIN_CENTERLINE_SAMPLES, Math.round(totalLength / Math.max(1, stepPx)) + 1);
    const resampled = [];
    for (let sample = 0; sample < count; sample += 1) {
      const target = (sample / Math.max(1, count - 1)) * totalLength;
      let segmentIndex = 1;
      while (segmentIndex < cumulative.length && cumulative[segmentIndex] < target) {
        segmentIndex += 1;
      }
      const leftIndex = clamp(segmentIndex - 1, 0, points.length - 1);
      const rightIndex = clamp(segmentIndex, 0, points.length - 1);
      const leftDistance = cumulative[leftIndex];
      const rightDistance = cumulative[rightIndex];
      const t = rightDistance === leftDistance ? 0 : (target - leftDistance) / (rightDistance - leftDistance);
      resampled.push({
        x: lerp(points[leftIndex].x, points[rightIndex].x, t),
        y: lerp(points[leftIndex].y, points[rightIndex].y, t),
      });
    }
    return resampled;
  }

  function catmullRomPoint(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x:
        0.5 *
        ((2 * p1.x) +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y:
        0.5 *
        ((2 * p1.y) +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
  }

  function buildPointControls(points, stride) {
    const controls = [];
    for (let index = 0; index < points.length; index += stride) {
      controls.push({
        sampleIndex: index,
        x: points[index].x,
        y: points[index].y,
      });
    }
    if (!controls.length || controls[controls.length - 1].sampleIndex !== points.length - 1) {
      controls.push({
        sampleIndex: points.length - 1,
        x: points[points.length - 1].x,
        y: points[points.length - 1].y,
      });
    }
    return controls;
  }

  function buildOffsetControls(offsets, stride) {
    const controls = [];
    for (let index = 0; index < offsets.length; index += stride) {
      controls.push({
        sampleIndex: index,
        value: offsets[index],
      });
    }
    if (!controls.length || controls[controls.length - 1].sampleIndex !== offsets.length - 1) {
      controls.push({
        sampleIndex: offsets.length - 1,
        value: offsets[offsets.length - 1],
      });
    }
    return controls;
  }

  function interpolatePointControls(controls, sampleCount) {
    if (!controls.length) {
      return [];
    }
    if (controls.length === 1) {
      return Array.from({ length: sampleCount }, () => clonePoint(controls[0]));
    }

    const output = new Array(sampleCount);
    for (let index = 0; index < controls.length - 1; index += 1) {
      const prev = controls[Math.max(0, index - 1)];
      const current = controls[index];
      const next = controls[index + 1];
      const after = controls[Math.min(controls.length - 1, index + 2)];
      const start = current.sampleIndex;
      const end = next.sampleIndex;
      const span = Math.max(1, end - start);
      for (let sampleIndex = start; sampleIndex <= end; sampleIndex += 1) {
        const t = span === 0 ? 0 : (sampleIndex - start) / span;
        output[sampleIndex] = catmullRomPoint(prev, current, next, after, t);
      }
    }

    output[0] = output[0] || clonePoint(controls[0]);
    output[sampleCount - 1] = output[sampleCount - 1] || clonePoint(controls[controls.length - 1]);
    return smoothPolyline(output, 1);
  }

  function smoothOffsets(values) {
    const output = values.slice();
    for (let index = 1; index < values.length - 1; index += 1) {
      output[index] = (values[index - 1] + values[index] + values[index + 1]) / 3;
    }
    return output;
  }

  function smoothOffsetsWeighted(values) {
    if (!values?.length) {
      return [];
    }
    if (values.length < 5) {
      return smoothOffsets(values);
    }
    const output = values.slice();
    for (let index = 0; index < values.length; index += 1) {
      const left2 = values[Math.max(0, index - 2)];
      const left1 = values[Math.max(0, index - 1)];
      const current = values[index];
      const right1 = values[Math.min(values.length - 1, index + 1)];
      const right2 = values[Math.min(values.length - 1, index + 2)];
      output[index] = (left2 + left1 * 4 + current * 6 + right1 * 4 + right2) / 16;
    }
    return output;
  }

  function buildPinnedSampleIndexSet(controls, sampleCount) {
    const pinned = new Set([0, Math.max(0, sampleCount - 1)]);
    (controls || []).forEach((control) => {
      if (Number.isFinite(control?.sampleIndex)) {
        pinned.add(clamp(control.sampleIndex, 0, Math.max(0, sampleCount - 1)));
      }
    });
    return pinned;
  }

  function smoothPolylinePinned(points, pinnedSampleIndices, iterations) {
    if (!points?.length) {
      return [];
    }
    let current = clonePoints(points);
    const pinned = pinnedSampleIndices || new Set();
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const next = current.map((point, index) => {
        if (index === 0 || index === current.length - 1 || pinned.has(index)) {
          return clonePoint(point);
        }
        const left2 = current[Math.max(0, index - 2)];
        const left1 = current[Math.max(0, index - 1)];
        const right1 = current[Math.min(current.length - 1, index + 1)];
        const right2 = current[Math.min(current.length - 1, index + 2)];
        return {
          x: (left2.x + left1.x * 4 + point.x * 6 + right1.x * 4 + right2.x) / 16,
          y: (left2.y + left1.y * 4 + point.y * 6 + right1.y * 4 + right2.y) / 16,
        };
      });
      current = next;
    }
    return current;
  }

  function catmullRomScalar(v0, v1, v2, v3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      0.5 *
      ((2 * v1) +
        (-v0 + v2) * t +
        (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
        (-v0 + 3 * v1 - 3 * v2 + v3) * t3)
    );
  }

  function preserveOffsetControlValues(values, controls) {
    const output = values.slice();
    (controls || []).forEach((control) => {
      const sampleIndex = clamp(control.sampleIndex, 0, output.length - 1);
      output[sampleIndex] = clamp(control.value, MIN_MANUAL_BORDER_RADIUS_PX, MAX_BORDER_RADIUS_PX);
    });
    return output;
  }

  function finalizeManualOffsets(values, controls) {
    let output = values.map((value) => clamp(value, MIN_MANUAL_BORDER_RADIUS_PX, MAX_BORDER_RADIUS_PX));
    output = preserveOffsetControlValues(output, controls);
    for (let iteration = 0; iteration < 2; iteration += 1) {
      output = smoothOffsetsWeighted(output).map((value) => clamp(value, MIN_MANUAL_BORDER_RADIUS_PX, MAX_BORDER_RADIUS_PX));
      output = preserveOffsetControlValues(output, controls);
    }
    return output;
  }

  function harmonizeBorderOffsets(centerline, leftOffsets, rightOffsets, leftControls, rightControls) {
    if (!centerline?.length || !leftOffsets?.length || !rightOffsets?.length) {
      return { leftOffsets, rightOffsets };
    }
    const initialBorders = buildBorderPoints(centerline, leftOffsets, rightOffsets);
    const leftPinned = buildPinnedSampleIndexSet(leftControls, centerline.length);
    const rightPinned = buildPinnedSampleIndexSet(rightControls, centerline.length);
    const smoothedLeftBorder = smoothPolylinePinned(initialBorders.left, leftPinned, 2);
    const smoothedRightBorder = smoothPolylinePinned(initialBorders.right, rightPinned, 2);
    const harmonizedOffsets = deriveOffsetsFromBorderContours(centerline, smoothedLeftBorder, smoothedRightBorder);
    return {
      leftOffsets: finalizeManualOffsets(harmonizedOffsets.leftOffsets, leftControls),
      rightOffsets: finalizeManualOffsets(harmonizedOffsets.rightOffsets, rightControls),
    };
  }

  function interpolateOffsetControls(controls, sampleCount) {
    if (!controls.length) {
      return [];
    }
    if (controls.length === 1) {
      return new Array(sampleCount).fill(clamp(controls[0].value, MIN_MANUAL_BORDER_RADIUS_PX, MAX_BORDER_RADIUS_PX));
    }

    const sortedControls = controls.slice().sort((left, right) => left.sampleIndex - right.sampleIndex);
    const values = new Array(sampleCount).fill(sortedControls[0].value);
    for (let index = 0; index < sortedControls.length - 1; index += 1) {
      const prev = sortedControls[Math.max(0, index - 1)];
      const current = sortedControls[index];
      const next = sortedControls[index + 1];
      const after = sortedControls[Math.min(sortedControls.length - 1, index + 2)];
      const span = Math.max(1, next.sampleIndex - current.sampleIndex);
      for (let sampleIndex = current.sampleIndex; sampleIndex <= next.sampleIndex; sampleIndex += 1) {
        const t = span === 0 ? 0 : (sampleIndex - current.sampleIndex) / span;
        values[sampleIndex] = catmullRomScalar(prev.value, current.value, next.value, after.value, t);
      }
    }
    values[0] = sortedControls[0].value;
    values[sampleCount - 1] = sortedControls[sortedControls.length - 1].value;
    return finalizeManualOffsets(values, sortedControls);
  }

  function computeTangents(points) {
    return points.map((point, index) => {
      const left = points[Math.max(0, index - 1)];
      const right = points[Math.min(points.length - 1, index + 1)];
      const tangent = normalizeVector({
        x: right.x - left.x,
        y: right.y - left.y,
      });
      return tangent;
    });
  }

  function buildArcLength(points) {
    let cumulative = 0;
    return points.map((point, index) => {
      if (index > 0) {
        cumulative += distance(points[index - 1], point);
      }
      return {
        x: point.x,
        y: point.y,
        arcLengthPx: cumulative,
      };
    });
  }

  function buildBorderPoints(centerline, leftOffsets, rightOffsets) {
    const tangents = computeTangents(centerline);
    const left = [];
    const right = [];
    for (let index = 0; index < centerline.length; index += 1) {
      const normal = perpendicular(tangents[index]);
      left.push(addPoints(centerline[index], scalePoint(normal, -leftOffsets[index])));
      right.push(addPoints(centerline[index], scalePoint(normal, rightOffsets[index])));
    }
    return { left, right, tangents };
  }

  function getDiameterProfilePx(leftOffsets, rightOffsets, borderLeft, borderRight) {
    if (
      borderLeft?.length &&
      borderRight?.length &&
      borderLeft.length === borderRight.length
    ) {
      return borderLeft.map((point, index) => distance(point, borderRight[index]));
    }
    return leftOffsets.map((left, index) => left + rightOffsets[index]);
  }

  function deriveOffsetsFromBorderContours(centerline, borderLeft, borderRight) {
    const tangents = computeTangents(centerline);
    const leftOffsets = [];
    const rightOffsets = [];
    for (let index = 0; index < centerline.length; index += 1) {
      const normal = perpendicular(tangents[index]);
      const leftVector = subtractPoints(borderLeft[index], centerline[index]);
      const rightVector = subtractPoints(borderRight[index], centerline[index]);
      leftOffsets.push(
        clamp(Math.max(MIN_MANUAL_BORDER_RADIUS_PX, -dotPoint(leftVector, normal)), MIN_MANUAL_BORDER_RADIUS_PX, MAX_BORDER_RADIUS_PX)
      );
      rightOffsets.push(
        clamp(Math.max(MIN_MANUAL_BORDER_RADIUS_PX, dotPoint(rightVector, normal)), MIN_MANUAL_BORDER_RADIUS_PX, MAX_BORDER_RADIUS_PX)
      );
    }
    return { leftOffsets, rightOffsets };
  }

  function syncOffsetControlsToOffsets(controls, offsets) {
    controls.forEach((control) => {
      const sampleIndex = clamp(control.sampleIndex, 0, offsets.length - 1);
      control.value = offsets[sampleIndex];
    });
  }

  function estimateVesselPolarity(frame, centerline, references) {
    if (Number.isFinite(references?.vesselTone) && Number.isFinite(references?.backgroundTone)) {
      return references.vesselTone >= references.backgroundTone ? "bright" : "dark";
    }
    let delta = 0;
    let count = 0;
    const tangents = computeTangents(centerline);
    for (let index = 0; index < centerline.length; index += 6) {
      const point = centerline[index];
      const normal = perpendicular(tangents[index]);
      const centerValue = sampleFrameValue(frame.normalized, frame.columns, frame.rows, point.x, point.y);
      const outsideLeft = sampleFrameValue(
        frame.normalized,
        frame.columns,
        frame.rows,
        point.x - normal.x * 12,
        point.y - normal.y * 12
      );
      const outsideRight = sampleFrameValue(
        frame.normalized,
        frame.columns,
        frame.rows,
        point.x + normal.x * 12,
        point.y + normal.y * 12
      );
      delta += centerValue - (outsideLeft + outsideRight) / 2;
      count += 1;
    }
    return count && delta / count >= 0 ? "bright" : "dark";
  }

  function detectBoundaryDistance(profileDistances, profileValues, polarity, side, references) {
    const centerIndex = Math.floor(profileValues.length / 2);
    const centerValue = Number.isFinite(references?.vesselTone) ? references.vesselTone : profileValues[centerIndex];
    const edgeValues = side === "left" ? profileValues.slice(0, 6) : profileValues.slice(-6);
    const outsideValue = Number.isFinite(references?.backgroundTone)
      ? references.backgroundTone
      : edgeValues.reduce((sum, value) => sum + value, 0) / Math.max(1, edgeValues.length);
    const threshold = outsideValue + (centerValue - outsideValue) * 0.5;

    if (side === "left") {
      for (let index = centerIndex - 1; index >= 1; index -= 1) {
        const current = profileValues[index];
        const previous = profileValues[index - 1];
        if (polarity === "bright") {
          if (current >= threshold && previous <= threshold) {
            const span = current - previous || 1;
            const t = (threshold - previous) / span;
            return Math.abs(lerp(profileDistances[index - 1], profileDistances[index], t));
          }
        } else if (current <= threshold && previous >= threshold) {
          const span = previous - current || 1;
          const t = (previous - threshold) / span;
          return Math.abs(lerp(profileDistances[index - 1], profileDistances[index], t));
        }
      }
    } else {
      for (let index = centerIndex + 1; index < profileValues.length; index += 1) {
        const current = profileValues[index];
        const previous = profileValues[index - 1];
        if (polarity === "bright") {
          if (previous >= threshold && current <= threshold) {
            const span = previous - current || 1;
            const t = (previous - threshold) / span;
            return Math.abs(lerp(profileDistances[index - 1], profileDistances[index], t));
          }
        } else if (previous <= threshold && current >= threshold) {
          const span = current - previous || 1;
          const t = (threshold - previous) / span;
          return Math.abs(lerp(profileDistances[index - 1], profileDistances[index], t));
        }
      }
    }

    return 4.5;
  }

  function autoDetectBorders(frame, centerline, analysis) {
    const tangents = computeTangents(centerline);
    const references = analysis ? ensureSegmentationHints(analysis) : null;
    const polarity = estimateVesselPolarity(frame, centerline, references);
    const leftOffsets = [];
    const rightOffsets = [];

    for (let index = 0; index < centerline.length; index += 1) {
      const point = centerline[index];
      const normal = perpendicular(tangents[index]);
      const distances = [];
      const values = [];
      for (let distancePx = -MAX_BORDER_RADIUS_PX; distancePx <= MAX_BORDER_RADIUS_PX; distancePx += 0.5) {
        distances.push(distancePx);
        values.push(
          sampleFrameValue(
            frame.normalized,
            frame.columns,
            frame.rows,
            point.x + normal.x * distancePx,
            point.y + normal.y * distancePx
          )
        );
      }
      leftOffsets.push(detectBoundaryDistance(distances, values, polarity, "left", references));
      rightOffsets.push(detectBoundaryDistance(distances, values, polarity, "right", references));
    }

    return {
      leftOffsets: smoothOffsets(smoothOffsets(leftOffsets)).map((value) => clamp(value, MIN_AUTO_BORDER_RADIUS_PX, MAX_BORDER_RADIUS_PX)),
      rightOffsets: smoothOffsets(smoothOffsets(rightOffsets)).map((value) => clamp(value, MIN_AUTO_BORDER_RADIUS_PX, MAX_BORDER_RADIUS_PX)),
    };
  }

  function applyBorderHintsToOffsets(centerline, leftOffsets, rightOffsets, analysis) {
    const hints = analysis?.borderHintPoints || [];
    if (!centerline?.length || !leftOffsets?.length || !rightOffsets?.length || !hints.length) {
      return {
        leftOffsets,
        rightOffsets,
      };
    }

    const nextLeftOffsets = leftOffsets.slice();
    const nextRightOffsets = rightOffsets.slice();
    const appliedHints = [];

    hints.forEach((hint) => {
      const sampleIndex = getNearestCenterlineSampleIndex(hint, centerline);
      const { center, normal } = getCenterlineNormalAtSample({ centerline }, sampleIndex);
      const signedDistance = dotPoint(subtractPoints(hint, center), normal);
      const side = signedDistance <= 0 ? "left" : "right";
      const desiredOffset = clamp(Math.abs(signedDistance), MIN_MANUAL_BORDER_RADIUS_PX, MAX_BORDER_RADIUS_PX);
      if (!Number.isFinite(desiredOffset)) {
        return;
      }

      hint.side = side;
      const targetOffsets = side === "left" ? nextLeftOffsets : nextRightOffsets;
      appliedHints.push({ side, sampleIndex, desiredOffset });
      for (
        let delta = -BORDER_HINT_BLEND_RADIUS_SAMPLES;
        delta <= BORDER_HINT_BLEND_RADIUS_SAMPLES;
        delta += 1
      ) {
        const targetIndex = clamp(sampleIndex + delta, 0, centerline.length - 1);
        const influence = Math.max(0, 1 - Math.abs(delta) / (BORDER_HINT_BLEND_RADIUS_SAMPLES + 1));
        targetOffsets[targetIndex] = clamp(
          lerp(targetOffsets[targetIndex], desiredOffset, influence ** 1.45),
          MIN_MANUAL_BORDER_RADIUS_PX,
          MAX_BORDER_RADIUS_PX
        );
      }
    });

    let smoothedLeftOffsets = smoothOffsets(nextLeftOffsets);
    let smoothedRightOffsets = smoothOffsets(nextRightOffsets);
    appliedHints.forEach((hint) => {
      const targetOffsets = hint.side === "left" ? smoothedLeftOffsets : smoothedRightOffsets;
      targetOffsets[hint.sampleIndex] = hint.desiredOffset;
    });

    smoothedLeftOffsets = smoothOffsets(smoothedLeftOffsets).map((value) =>
      clamp(value, MIN_MANUAL_BORDER_RADIUS_PX, MAX_BORDER_RADIUS_PX)
    );
    smoothedRightOffsets = smoothOffsets(smoothedRightOffsets).map((value) =>
      clamp(value, MIN_MANUAL_BORDER_RADIUS_PX, MAX_BORDER_RADIUS_PX)
    );
    appliedHints.forEach((hint) => {
      const targetOffsets = hint.side === "left" ? smoothedLeftOffsets : smoothedRightOffsets;
      targetOffsets[hint.sampleIndex] = hint.desiredOffset;
    });

    return {
      leftOffsets: smoothedLeftOffsets,
      rightOffsets: smoothedRightOffsets,
    };
  }

  function percentile(values, proportion) {
    if (!values.length) {
      return null;
    }
    const sorted = values.slice().sort((left, right) => left - right);
    return sorted[clamp(Math.round((sorted.length - 1) * proportion), 0, sorted.length - 1)];
  }

  function computeInitialLesion(diameters) {
    const referenceEstimate = percentile(diameters, 0.8) || Math.max(...diameters);
    let minIndex = 0;
    for (let index = 1; index < diameters.length; index += 1) {
      if (diameters[index] < diameters[minIndex]) {
        minIndex = index;
      }
    }

    const minimum = diameters[minIndex];
    const threshold = minimum + (referenceEstimate - minimum) * 0.6;
    let startIndex = minIndex;
    let endIndex = minIndex;
    while (startIndex > 0 && diameters[startIndex] < threshold) {
      startIndex -= 1;
    }
    while (endIndex < diameters.length - 1 && diameters[endIndex] < threshold) {
      endIndex += 1;
    }

    if (endIndex - startIndex < 4) {
      const halfSpan = clamp(Math.round(diameters.length * 0.08), 3, 14);
      startIndex = clamp(minIndex - halfSpan, 0, diameters.length - 1);
      endIndex = clamp(minIndex + halfSpan, 0, diameters.length - 1);
    }

    const refOffset = clamp(Math.round(diameters.length * 0.07), 3, 12);
    return {
      startIndex,
      endIndex,
      cursorIndex: minIndex,
      proximalRefIndex: clamp(startIndex - refOffset, 0, diameters.length - 1),
      distalRefIndex: clamp(endIndex + refOffset, 0, diameters.length - 1),
    };
  }

  function averageNeighborhood(values, index, radius) {
    let sum = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const target = clamp(index + offset, 0, values.length - 1);
      sum += values[target];
      count += 1;
    }
    return count ? sum / count : 0;
  }

  function computeMeasurements(centerline, leftOffsets, rightOffsets, lesion, series, borderLeft, borderRight) {
    const diametersPx = getDiameterProfilePx(leftOffsets, rightOffsets, borderLeft, borderRight);
    const startIndex = clamp(lesion.startIndex, 0, diametersPx.length - 1);
    const endIndex = clamp(lesion.endIndex, startIndex, diametersPx.length - 1);
    const cursorIndex = clamp(lesion.cursorIndex, startIndex, endIndex);
    const proximalRefIndex = Number.isFinite(lesion.proximalRefIndex) ? clamp(lesion.proximalRefIndex, 0, startIndex) : null;
    const distalRefIndex = Number.isFinite(lesion.distalRefIndex)
      ? clamp(lesion.distalRefIndex, endIndex, diametersPx.length - 1)
      : clamp(endIndex, endIndex, diametersPx.length - 1);

    let mldIndex = startIndex;
    for (let index = startIndex + 1; index <= endIndex; index += 1) {
      if (diametersPx[index] < diametersPx[mldIndex]) {
        mldIndex = index;
      }
    }

    const spacing = getMeasurementSpacing(series, state.analysis);
    const proximalReferencePx = Number.isFinite(proximalRefIndex) ? averageNeighborhood(diametersPx, proximalRefIndex, 2) : null;
    const distalReferencePx = averageNeighborhood(diametersPx, distalRefIndex, 2);
    const referenceSamples = [proximalReferencePx, distalReferencePx].filter(Number.isFinite);
    const referencePx =
      referenceSamples.reduce((sum, value) => sum + value, 0) / Math.max(1, referenceSamples.length);
    const mldPx = diametersPx[mldIndex];
    const lesionLengthPx = centerline[endIndex].arcLengthPx - centerline[startIndex].arcLengthPx;

    return {
      diameterProfilePx: diametersPx,
      referenceDiameter: spacing ? referencePx * spacing : referencePx,
      proximalReferenceDiameter: Number.isFinite(proximalReferencePx)
        ? spacing
          ? proximalReferencePx * spacing
          : proximalReferencePx
        : null,
      distalReferenceDiameter: spacing ? distalReferencePx * spacing : distalReferencePx,
      mld: spacing ? mldPx * spacing : mldPx,
      lesionLength: spacing ? lesionLengthPx * spacing : lesionLengthPx,
      percentDiameterStenosis: referencePx > 0 ? (1 - mldPx / referencePx) * 100 : null,
      mldSampleIndex: mldIndex,
      cursorSampleIndex: cursorIndex,
    };
  }

  function rebuildDerivedGeometry(options) {
    const analysis = ensureAnalysisState();
    if (!analysis?.centerlineControls?.length || !analysis.centerlineSampleCount) {
      return;
    }
    const preservedBorders =
      options?.preserveBorders &&
      analysis.borderLeft?.length === analysis.centerlineSampleCount &&
      analysis.borderRight?.length === analysis.centerlineSampleCount
        ? {
            left: clonePoints(analysis.borderLeft),
            right: clonePoints(analysis.borderRight),
          }
        : null;

    analysis.centerline = buildArcLength(
      interpolatePointControls(analysis.centerlineControls, analysis.centerlineSampleCount)
    );
    if (preservedBorders) {
      const preservedOffsets = deriveOffsetsFromBorderContours(
        analysis.centerline,
        preservedBorders.left,
        preservedBorders.right
      );
      analysis.leftOffsets = preservedOffsets.leftOffsets;
      analysis.rightOffsets = preservedOffsets.rightOffsets;
      syncOffsetControlsToOffsets(analysis.leftOffsetControls, analysis.leftOffsets);
      syncOffsetControlsToOffsets(analysis.rightOffsetControls, analysis.rightOffsets);
      analysis.borderLeft = preservedBorders.left;
      analysis.borderRight = preservedBorders.right;
    } else {
      analysis.leftOffsets = interpolateOffsetControls(analysis.leftOffsetControls, analysis.centerlineSampleCount);
      analysis.rightOffsets = interpolateOffsetControls(analysis.rightOffsetControls, analysis.centerlineSampleCount);
      const harmonizedOffsets = harmonizeBorderOffsets(
        analysis.centerline,
        analysis.leftOffsets,
        analysis.rightOffsets,
        analysis.leftOffsetControls,
        analysis.rightOffsetControls
      );
      analysis.leftOffsets = harmonizedOffsets.leftOffsets;
      analysis.rightOffsets = harmonizedOffsets.rightOffsets;

      const borders = buildBorderPoints(analysis.centerline, analysis.leftOffsets, analysis.rightOffsets);
      analysis.borderLeft = borders.left;
      analysis.borderRight = borders.right;
    }

    const diametersPx = getDiameterProfilePx(
      analysis.leftOffsets,
      analysis.rightOffsets,
      analysis.borderLeft,
      analysis.borderRight
    );

    if (!analysis.lesion || options?.resetLesion) {
      analysis.lesion = computeInitialLesion(diametersPx);
    } else {
      const maxIndex = analysis.centerlineSampleCount - 1;
      analysis.lesion.startIndex = clamp(analysis.lesion.startIndex, 0, maxIndex);
      analysis.lesion.endIndex = clamp(analysis.lesion.endIndex, analysis.lesion.startIndex, maxIndex);
      analysis.lesion.cursorIndex = clamp(analysis.lesion.cursorIndex, analysis.lesion.startIndex, analysis.lesion.endIndex);
      analysis.lesion.proximalRefIndex = Number.isFinite(analysis.lesion.proximalRefIndex)
        ? clamp(analysis.lesion.proximalRefIndex, 0, analysis.lesion.startIndex)
        : null;
      analysis.lesion.distalRefIndex = Number.isFinite(analysis.lesion.distalRefIndex)
        ? clamp(analysis.lesion.distalRefIndex, analysis.lesion.endIndex, maxIndex)
        : clamp(analysis.lesion.endIndex, analysis.lesion.endIndex, maxIndex);
    }

    analysis.measurements = computeMeasurements(
      analysis.centerline,
      analysis.leftOffsets,
      analysis.rightOffsets,
      analysis.lesion,
      getActiveSeries(),
      analysis.borderLeft,
      analysis.borderRight
    );
  }

  async function segmentCurrentVessel(options) {
    const analysis = ensureAnalysisState();
    if (!analysis || !isAnalysisFrameVisible()) {
      throw new Error("Jump back to the selected analysis frame before segmenting.");
    }
    if (analysis.anchorPoints.length < 2) {
      throw new Error("Place at least two vessel anchor points first.");
    }
    if (!options?.skipHistory) {
      recordHistoryStep(options?.resegment ? "re-segment vessel" : "segment vessel");
    }

    setStatus(options?.resegment ? "Re-segmenting vessel..." : "Tracing vessel path...");
    await waitForAnimationFrame();

    const frameDescriptor = getSelectedFrameDescriptor();
    const frame = await decodeFrame(frameDescriptor);
    const model = estimateAnchorModel(frame, analysis.anchorPoints, analysis);
    const tracedPath = [];

    for (let index = 0; index < analysis.anchorPoints.length - 1; index += 1) {
      const segmentPath = tracePathBetweenAnchors(
        frame,
        analysis.anchorPoints[index],
        analysis.anchorPoints[index + 1],
        model
      );
      if (!segmentPath.length) {
        continue;
      }
      if (tracedPath.length) {
        segmentPath.shift();
      }
      tracedPath.push(...segmentPath);
      if (index % 2 === 0) {
        await waitForAnimationFrame();
      }
    }

    const totalLength = polylineLength(tracedPath);
    if (totalLength < 24) {
      throw new Error("The vessel path is too short. Spread the anchor points farther apart.");
    }

    const centerline = resamplePolyline(smoothPolyline(tracedPath, 2), DEFAULT_SAMPLE_STEP_PX);
    const borders = autoDetectBorders(frame, centerline, analysis);
    const hintedBorders = applyBorderHintsToOffsets(centerline, borders.leftOffsets, borders.rightOffsets, analysis);

    analysis.centerlineSampleCount = centerline.length;
    analysis.centerlineControls = buildPointControls(centerline, CENTERLINE_CONTROL_STRIDE);
    analysis.leftOffsetControls = buildOffsetControls(hintedBorders.leftOffsets, BORDER_CONTROL_STRIDE);
    analysis.rightOffsetControls = buildOffsetControls(hintedBorders.rightOffsets, BORDER_CONTROL_STRIDE);
    rebuildDerivedGeometry({ resetLesion: true });

    updateUi();
    scheduleRender();
    setStatus(`${analysis.vesselLabel || "Vessel"} segmented on frame ${state.selectedFrameIndex + 1}.`);
  }

  function resizeCanvasToDisplaySize(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function buildCanvasTransform(frame, canvas) {
    const view = getActiveViewState();
    const baseScale = Math.min(canvas.width / frame.columns, canvas.height / frame.rows);
    const zoom = clamp(view.zoom || 1, 1, 8);
    const scale = baseScale * zoom;
    const drawWidth = frame.columns * scale;
    const drawHeight = frame.rows * scale;
    const offsetX = (canvas.width - drawWidth) / 2 + (view.panX || 0);
    const offsetY = (canvas.height - drawHeight) / 2 + (view.panY || 0);
    return {
      baseScale,
      zoom,
      scale,
      drawWidth,
      drawHeight,
      offsetX,
      offsetY,
      columns: frame.columns,
      rows: frame.rows,
    };
  }

  function updateViewZoomFromScreenPoint(screenPoint, zoomFactor) {
    const transform = state.canvasTransform;
    if (!transform) {
      return;
    }
    const view = getActiveViewState();
    const nextZoom = clamp((view.zoom || 1) * zoomFactor, 1, 8);
    if (Math.abs(nextZoom - (view.zoom || 1)) < 1e-4) {
      return;
    }

    const imagePoint = canvasToImage(screenPoint, transform);
    const nextScale = transform.baseScale * nextZoom;
    const centeredOffsetX = (els.imageCanvas.width - transform.columns * nextScale) / 2;
    const centeredOffsetY = (els.imageCanvas.height - transform.rows * nextScale) / 2;

    view.zoom = nextZoom;
    view.panX = screenPoint.x - imagePoint.x * nextScale - centeredOffsetX;
    view.panY = screenPoint.y - imagePoint.y * nextScale - centeredOffsetY;
    persistActiveSeriesState();
    scheduleRender();
  }

  function imageToCanvas(point, transform) {
    return {
      x: transform.offsetX + point.x * transform.scale,
      y: transform.offsetY + point.y * transform.scale,
    };
  }

  function canvasToImage(point, transform) {
    return {
      x: (point.x - transform.offsetX) / transform.scale,
      y: (point.y - transform.offsetY) / transform.scale,
    };
  }

  function isInsideImage(point, frame) {
    return point.x >= 0 && point.y >= 0 && point.x <= frame.columns - 1 && point.y <= frame.rows - 1;
  }

  function updateCanvasMessage(frameDescriptor) {
    if (!frameDescriptor) {
      els.canvasOverlayMessage.textContent =
        "Load a cine series, preview frames, and lock the best still image for QCA.";
      return;
    }

    if (!Number.isFinite(state.selectedFrameIndex)) {
      els.canvasOverlayMessage.textContent =
        state.mode === MODES.zoom
          ? "Zoom mode is active. Use the wheel to zoom and drag to pan while reviewing the cine."
          : state.mode === MODES.windowing
            ? "Window mode is active. Drag on the cine image to adjust window width and level while previewing the run."
            : "Preview the cine with the slider, mouse wheel, left/right arrows, or space to play, then click `Lock QCA Frame` when the artery is steady.";
      return;
    }

    if (!isAnalysisFrameVisible()) {
      els.canvasOverlayMessage.textContent = `QCA is attached to frame ${state.selectedFrameIndex + 1}. Jump back to that frame to edit the vessel.`;
      return;
    }

    if (state.referenceSamplingTarget === "vessel") {
      els.canvasOverlayMessage.textContent =
        "Reference picker: click a representative vessel tone on the locked QCA frame.";
      return;
    }

    if (state.referenceSamplingTarget === "background") {
      els.canvasOverlayMessage.textContent =
        "Reference picker: click a representative background tone near the vessel on the locked QCA frame.";
      return;
    }

    if (state.mode === MODES.calibration) {
      const draftCount = state.analysis?.calibrationDraftPoints?.length || 0;
      els.canvasOverlayMessage.textContent =
        draftCount === 1
          ? "Calibration mode: click the second point across the known object, then drag endpoints if needed."
          : "Calibration mode: click two points across a known catheter or marker on this locked QCA frame.";
      return;
    }

    if (state.mode === MODES.windowing) {
      els.canvasOverlayMessage.textContent =
        "Window mode: drag right or left for width and up or down for level on this series.";
      return;
    }

    if (state.mode === MODES.eraser) {
      els.canvasOverlayMessage.textContent =
        "Eraser mode: drag the circle over anchors or edit handles to remove what it touches.";
      return;
    }

    if (state.mode === MODES.draw) {
      els.canvasOverlayMessage.textContent =
        state.drawTargetMode === MODES.borders
          ? "Draw mode: sketch along the border and release to blend that contour smoothly into the vessel edge."
          : "Draw mode: sketch a centerline path and release to blend it smoothly into the current vessel centerline.";
      return;
    }

    if (state.mode === MODES.borderHints) {
      const anchors = state.analysis?.anchorPoints?.length || 0;
      els.canvasOverlayMessage.textContent =
        anchors >= 2
          ? "Border Hint mode: click optional left or right vessel-edge hints, then segment or re-segment to bias contour detection."
          : "Border Hint mode needs at least two vessel anchors first so the app can infer the left and right vessel edges.";
      return;
    }

    const anchors = state.analysis?.anchorPoints?.length || 0;
    if (!hasSegmentedVessel()) {
      els.canvasOverlayMessage.textContent =
        anchors >= 2
          ? "Double-click to segment now, or add more anchor points through bends before segmenting."
          : "This is the locked analysis frame. Click the image to place proximal and distal vessel anchors.";
      return;
    }

    els.canvasOverlayMessage.textContent =
      "Drag handles directly on the vessel or use the diameter chart to refine stenosis and reference markers.";
  }

  function drawPolyline(context, points, transform, strokeStyle, lineWidth, closed) {
    if (!points?.length) {
      return;
    }
    context.beginPath();
    const first = imageToCanvas(points[0], transform);
    context.moveTo(first.x, first.y);
    for (let index = 1; index < points.length; index += 1) {
      const point = imageToCanvas(points[index], transform);
      context.lineTo(point.x, point.y);
    }
    if (closed) {
      context.closePath();
    }
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();
  }

  function drawDashedPolyline(context, points, transform, strokeStyle, lineWidth, dashPattern) {
    if (!points?.length) {
      return;
    }
    context.save();
    context.setLineDash(dashPattern || [10, 8]);
    drawPolyline(context, points, transform, strokeStyle, lineWidth, false);
    context.restore();
  }

  function drawFilledLumen(context, leftPoints, rightPoints, transform) {
    if (!leftPoints?.length || !rightPoints?.length) {
      return;
    }
    context.beginPath();
    const first = imageToCanvas(leftPoints[0], transform);
    context.moveTo(first.x, first.y);
    for (let index = 1; index < leftPoints.length; index += 1) {
      const point = imageToCanvas(leftPoints[index], transform);
      context.lineTo(point.x, point.y);
    }
    for (let index = rightPoints.length - 1; index >= 0; index -= 1) {
      const point = imageToCanvas(rightPoints[index], transform);
      context.lineTo(point.x, point.y);
    }
    context.closePath();
    context.fillStyle = "rgba(111, 213, 200, 0.16)";
    context.fill();
  }

  function drawHandle(context, point, transform, fillStyle, radiusPx) {
    const screen = imageToCanvas(point, transform);
    context.beginPath();
    context.arc(screen.x, screen.y, radiusPx, 0, Math.PI * 2);
    context.fillStyle = fillStyle;
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = COLORS.handleStroke;
    context.stroke();
  }

  function drawCrossSectionHandle(context, centerlinePoint, borderLeft, borderRight, transform, color) {
    const left = imageToCanvas(borderLeft, transform);
    const right = imageToCanvas(borderRight, transform);
    const center = imageToCanvas(centerlinePoint, transform);
    context.beginPath();
    context.moveTo(left.x, left.y);
    context.lineTo(right.x, right.y);
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.stroke();
    context.beginPath();
    context.arc(center.x, center.y, 5, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = COLORS.handleStroke;
    context.stroke();
  }

  function drawCalibrationOverlay(context, transform, analysis) {
    const points =
      analysis?.calibrationDraftPoints?.length
        ? analysis.calibrationDraftPoints
        : analysis?.calibration?.points?.length === 2
          ? analysis.calibration.points
          : analysis?.calibrationDraftPoints || [];

    if (!points.length) {
      return;
    }

    if (points.length === 2) {
      drawPolyline(context, points, transform, COLORS.calibration, 2.6, false);
    }
    points.forEach((point) => drawHandle(context, point, transform, COLORS.calibration, 6));
  }

  function drawBorderHintOverlay(context, transform, analysis) {
    if (!analysis?.borderHintPoints?.length) {
      return;
    }

    analysis.borderHintPoints.forEach((hint) => {
      const geometry = inferBorderHintGeometry(hint, analysis);
      const color = hint.side === "right" ? COLORS.rightBorder : COLORS.leftBorder;
      if (geometry?.guidePoint) {
        const guidePoint = imageToCanvas(geometry.guidePoint, transform);
        const hintPoint = imageToCanvas(hint, transform);
        context.beginPath();
        context.moveTo(guidePoint.x, guidePoint.y);
        context.lineTo(hintPoint.x, hintPoint.y);
        context.setLineDash([7, 6]);
        context.strokeStyle = color;
        context.lineWidth = 1.4;
        context.stroke();
        context.setLineDash([]);
      }
      drawHandle(context, hint, transform, color, 5.5);
    });
  }

  function drawOverlay(context, transform, options) {
    const analysis = options?.analysis || state.analysis;
    const showHandles = options?.showHandles !== false;
    const forceAnalysisVisible = options?.forceAnalysisVisible === true;
    const overlayVisibility = options?.overlayVisibility || state.overlayVisibility;
    const showCenterline = overlayVisibility.centerline;
    const showBorders = overlayVisibility.borders;
    const showLesion = overlayVisibility.lesion;
    const showLumen = overlayVisibility.lumen;
    if (!analysis || (!isAnalysisFrameVisible() && !forceAnalysisVisible)) {
      return;
    }

    drawCalibrationOverlay(context, transform, analysis);

    if (analysis.anchorPoints?.length && (!analysis.centerline?.length || state.mode === MODES.anchors)) {
      drawPolyline(context, analysis.anchorPoints, transform, COLORS.anchorLine, 2, false);
      analysis.anchorPoints.forEach((point) => drawHandle(context, point, transform, COLORS.anchor, 6));
    }

    if (showHandles && analysis.borderHintPoints?.length && (!analysis.centerline?.length || state.mode === MODES.borderHints)) {
      drawBorderHintOverlay(context, transform, analysis);
    }

    if (!analysis.centerline?.length) {
      return;
    }

    if (showLumen) {
      drawFilledLumen(context, analysis.borderLeft, analysis.borderRight, transform);
    }
    if (showBorders) {
      drawPolyline(context, analysis.borderLeft, transform, COLORS.leftBorder, 2.2, false);
      drawPolyline(context, analysis.borderRight, transform, COLORS.rightBorder, 2.2, false);
    }
    if (showCenterline) {
      drawPolyline(context, analysis.centerline, transform, COLORS.centerline, 2.6, false);
    }

    if (showHandles && state.mode === MODES.centerline && showCenterline) {
      analysis.centerlineControls.forEach((control) => {
        drawHandle(context, control, transform, COLORS.centerlineHandle, 5.5);
      });
    } else if (showHandles && state.mode === MODES.borders && showBorders) {
      analysis.leftOffsetControls.forEach((control) => {
        drawHandle(context, analysis.borderLeft[control.sampleIndex], transform, COLORS.leftBorder, 5);
      });
      analysis.rightOffsetControls.forEach((control) => {
        drawHandle(context, analysis.borderRight[control.sampleIndex], transform, COLORS.rightBorder, 5);
      });
    }

    if (analysis.lesion && showLesion) {
      getLesionMarkerDefinitions(analysis, { includeCursor: false })
        .slice()
        .sort((left, right) => (left.priority || 0) - (right.priority || 0))
        .forEach((marker) => {
        drawCrossSectionHandle(
          context,
          analysis.centerline[marker.index],
          analysis.borderLeft[marker.index],
          analysis.borderRight[marker.index],
          transform,
          marker.color
        );
      });
      if (Number.isFinite(analysis.lesion.cursorIndex)) {
        drawHandle(context, analysis.centerline[analysis.lesion.cursorIndex], transform, COLORS.lesionCursor, 7);
      }
    }

    if (state.dragging?.kind === "drawStroke" && state.dragging.points?.length) {
      const strokeColor =
        state.dragging.targetMode === MODES.borders
          ? state.dragging.side === "right"
            ? COLORS.rightBorder
            : COLORS.leftBorder
          : COLORS.centerline;
      drawDashedPolyline(context, state.dragging.points, transform, strokeColor, 2.8, [11, 7]);
    }

    const eraserPoint =
      state.dragging?.kind === "eraser"
        ? state.dragging.lastPoint
        : Number.isFinite(state.pointer.imageX) && Number.isFinite(state.pointer.imageY)
          ? { x: state.pointer.imageX, y: state.pointer.imageY }
          : null;
    if (showHandles && state.mode === MODES.eraser && eraserPoint && isInsideImage(eraserPoint, transform)) {
      const center = imageToCanvas(eraserPoint, transform);
      context.beginPath();
      context.arc(center.x, center.y, ERASER_RADIUS_PX * transform.scale, 0, Math.PI * 2);
      context.fillStyle = "rgba(255, 140, 128, 0.08)";
      context.fill();
      context.setLineDash([10, 8]);
      context.lineWidth = 2;
      context.strokeStyle = COLORS.eraser;
      context.stroke();
      context.setLineDash([]);
    }
  }

  function renderProfileChart(canvas, options) {
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const fontScale = options?.fontScale || 1;
    const analysis = options?.analysis || state.analysis;
    const profile = analysis?.measurements?.diameterProfilePx;
    const series = options?.series || getActiveSeries();
    const units = getMeasurementUnits(series, analysis);
    if (!profile?.length || !analysis?.centerline?.length) {
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#071318";
      context.fillRect(0, 0, width, height);
      context.fillStyle = "rgba(214, 229, 227, 0.72)";
      context.font = `${14 * fontScale}px Aptos, sans-serif`;
      context.fillText("Segment a vessel to see the diameter profile.", 24, 34);
      return {
        geometry: null,
        summaryText: "Segment a vessel to see MLD and reference trends.",
      };
    }

    const marginLeft = 60;
    const marginRight = 20;
    const marginTop = 20;
    const marginBottom = 44;
    const plotWidth = width - marginLeft - marginRight;
    const plotHeight = height - marginTop - marginBottom;
    const scaledProfile = profile.map((value) => toPhysicalLength(value, series, analysis));
    const minValue = Math.min(...scaledProfile);
    const maxValue = Math.max(...scaledProfile);
    const paddedMin = Math.max(0, minValue * 0.9);
    const paddedMax = Math.max(paddedMin + 0.01, maxValue * 1.08);

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#071318";
    context.fillRect(0, 0, width, height);

    function xForIndex(index) {
      return marginLeft + (index / Math.max(1, scaledProfile.length - 1)) * plotWidth;
    }

    function yForValue(value) {
      const t = (value - paddedMin) / Math.max(1e-6, paddedMax - paddedMin);
      return marginTop + plotHeight - t * plotHeight;
    }

    context.strokeStyle = "rgba(126, 220, 213, 0.14)";
    context.lineWidth = 1;
    for (let line = 0; line <= 4; line += 1) {
      const y = marginTop + (plotHeight / 4) * line;
      context.beginPath();
      context.moveTo(marginLeft, y);
      context.lineTo(marginLeft + plotWidth, y);
      context.stroke();
    }

    context.strokeStyle = "rgba(255, 255, 255, 0.22)";
    context.beginPath();
    context.moveTo(marginLeft, marginTop);
    context.lineTo(marginLeft, marginTop + plotHeight);
    context.lineTo(marginLeft + plotWidth, marginTop + plotHeight);
    context.stroke();

    const lesion = analysis.lesion;
    const lesionStartX = xForIndex(lesion.startIndex);
    const lesionEndX = xForIndex(lesion.endIndex);
    context.fillStyle = "rgba(255, 209, 102, 0.08)";
    context.fillRect(lesionStartX, marginTop, lesionEndX - lesionStartX, plotHeight);

    context.beginPath();
    context.moveTo(xForIndex(0), yForValue(scaledProfile[0]));
    for (let index = 1; index < scaledProfile.length; index += 1) {
      context.lineTo(xForIndex(index), yForValue(scaledProfile[index]));
    }
    context.strokeStyle = COLORS.centerline;
    context.lineWidth = 2.5;
    context.stroke();

    const measurements = analysis.measurements;
    const referenceY = yForValue(measurements.referenceDiameter);
    context.beginPath();
    context.moveTo(marginLeft, referenceY);
    context.lineTo(marginLeft + plotWidth, referenceY);
    context.strokeStyle = "rgba(121, 182, 255, 0.65)";
    context.lineWidth = 1.5;
    context.setLineDash([8, 6]);
    context.stroke();
    context.setLineDash([]);

    const markerDefinitions = getLesionMarkerDefinitions(analysis);
    const markerHandles = [];

    markerDefinitions.forEach((marker) => {
      const index = marker.index;
      const x = xForIndex(index);
      const y = yForValue(scaledProfile[index]);
      const handleY = marginTop + 20;
      const handleRadius = marker.key === "cursorIndex" ? 9 : 7;
      context.beginPath();
      context.moveTo(x, marginTop);
      context.lineTo(x, marginTop + plotHeight);
      context.strokeStyle = marker.color;
      context.lineWidth = marker.key === "cursorIndex" ? 2.4 : 1.7;
      context.stroke();

      context.beginPath();
      context.arc(x, handleY, handleRadius, 0, Math.PI * 2);
      context.fillStyle = marker.color;
      context.fill();
      context.lineWidth = 1.5;
      context.strokeStyle = COLORS.handleStroke;
      context.stroke();

      context.beginPath();
      context.arc(x, y, marker.key === "cursorIndex" ? 6.5 : 5, 0, Math.PI * 2);
      context.fillStyle = marker.color;
      context.fill();
      context.lineWidth = 1.2;
      context.strokeStyle = COLORS.handleStroke;
      context.stroke();

      context.fillStyle = marker.color;
      context.font = `${11 * fontScale}px Aptos, sans-serif`;
      context.fillText(marker.label, x + 6, marginTop + 14);
      markerHandles.push({
        key: marker.key,
        x,
        lineYMin: marginTop,
        lineYMax: marginTop + plotHeight,
        handleY,
        handleRadius,
      });
    });

    const mldX = xForIndex(measurements.mldSampleIndex);
    const mldY = yForValue(measurements.mld);
    context.beginPath();
    context.arc(mldX, mldY, 5, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();

    context.fillStyle = "rgba(214, 229, 227, 0.84)";
    context.font = `${11 * fontScale}px Aptos, sans-serif`;
    context.fillText(`${roundTo(paddedMax, 2)} ${units}`, 10, marginTop + 8);
    context.fillText(`${roundTo(paddedMin, 2)} ${units}`, 10, marginTop + plotHeight + 2);
    context.fillText("Distance along vessel", marginLeft, height - 12);

    const summaryText = `MLD ${formatValue(measurements.mld, units, 2)} · reference ${formatValue(
      measurements.referenceDiameter,
      units,
      2
    )} · stenosis ${formatPercent(measurements.percentDiameterStenosis)}`;
    return {
      geometry: {
        marginLeft,
        marginRight,
        marginTop,
        marginBottom,
        plotWidth,
        plotHeight,
        xForIndex,
        sampleCount: scaledProfile.length,
        markers: markerHandles,
      },
      summaryText,
    };
  }

  function drawProfile() {
    resizeCanvasToDisplaySize(els.profileCanvas);
    const result = renderProfileChart(els.profileCanvas, {
      fontScale: window.devicePixelRatio || 1,
    });
    els.profileNote.textContent = result.summaryText;
    state.profileGeometry = result.geometry;
  }

  async function renderScene() {
    const token = ++state.renderToken;
    resizeCanvasToDisplaySize(els.imageCanvas);
    resizeCanvasToDisplaySize(els.overlayCanvas);

    const imageContext = els.imageCanvas.getContext("2d");
    const overlayContext = els.overlayCanvas.getContext("2d");
    imageContext.clearRect(0, 0, els.imageCanvas.width, els.imageCanvas.height);
    overlayContext.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);
    overlayContext.lineCap = "round";
    overlayContext.lineJoin = "round";

    const frameDescriptor = getCurrentFrameDescriptor();
    updateCanvasMessage(frameDescriptor);
    if (!frameDescriptor) {
      state.canvasTransform = null;
      state.lastRenderedFrame = null;
      drawProfile();
      return;
    }

    try {
      const frame = await decodeFrame(frameDescriptor);
      if (token !== state.renderToken) {
        return;
      }
      state.lastRenderedFrame = frame;
      const transform = buildCanvasTransform(frame, els.imageCanvas);
      state.canvasTransform = transform;
      imageContext.fillStyle = "#071318";
      imageContext.fillRect(0, 0, els.imageCanvas.width, els.imageCanvas.height);
      imageContext.drawImage(
        buildFrameCanvas(frame),
        transform.offsetX,
        transform.offsetY,
        transform.drawWidth,
        transform.drawHeight
      );
      drawOverlay(overlayContext, transform);
    } catch (error) {
      console.error(error);
      state.canvasTransform = null;
      state.lastRenderedFrame = null;
      overlayContext.fillStyle = "rgba(255, 209, 203, 0.92)";
      overlayContext.font = `${14 * (window.devicePixelRatio || 1)}px Aptos, sans-serif`;
      overlayContext.fillText(error.message || "Frame decode failed.", 24, 32);
    }

    drawProfile();
  }

  function scheduleRender() {
    if (state.renderQueued) {
      return;
    }
    state.renderQueued = true;
    window.requestAnimationFrame(() => {
      state.renderQueued = false;
      renderScene().catch((error) => {
        console.error(error);
        setStatus(error.message || "Rendering failed.", "error");
      });
    });
  }

  function getCanvasRelativePoint(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (event.clientX - rect.left) * dpr,
      y: (event.clientY - rect.top) * dpr,
    };
  }

  function getImagePointFromEvent(event) {
    const frameDescriptor = getCurrentFrameDescriptor();
    const transform = state.canvasTransform;
    if (!frameDescriptor || !transform) {
      return null;
    }
    const screen = getCanvasRelativePoint(event, els.overlayCanvas);
    const imagePoint = canvasToImage(screen, transform);
    return imagePoint;
  }

  async function updatePointerReadout(event) {
    const frameDescriptor = getCurrentFrameDescriptor();
    const imagePoint = getImagePointFromEvent(event);
    if (!frameDescriptor || !imagePoint) {
      state.pointer = { imageX: null, imageY: null, value: null };
      els.pointerReadout.textContent = "x -, y -, value -";
      if (state.mode === MODES.eraser) {
        scheduleRender();
      }
      return;
    }

    const frame = await decodeFrame(frameDescriptor);
    if (!isInsideImage(imagePoint, frame)) {
      state.pointer = { imageX: null, imageY: null, value: null };
      els.pointerReadout.textContent = "x -, y -, value -";
      if (state.mode === MODES.eraser) {
        scheduleRender();
      }
      return;
    }

    const value = sampleFrameValue(frame.pixels, frame.columns, frame.rows, imagePoint.x, imagePoint.y);
    state.pointer = {
      imageX: imagePoint.x,
      imageY: imagePoint.y,
      value,
    };
    els.pointerReadout.textContent = `x ${Math.round(imagePoint.x)}, y ${Math.round(imagePoint.y)}, value ${roundTo(value, 1)}`;
    if (state.mode === MODES.eraser) {
      scheduleRender();
    }
  }

  function getHandleThresholdPx() {
    const transform = state.canvasTransform;
    return transform ? 10 / transform.scale : 10;
  }

  function findNearestAnchor(point) {
    const anchors = state.analysis?.anchorPoints || [];
    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    anchors.forEach((anchor, index) => {
      const distanceToAnchor = distance(anchor, point);
      if (distanceToAnchor < closestDistance) {
        closestDistance = distanceToAnchor;
        closestIndex = index;
      }
    });
    return closestDistance <= getHandleThresholdPx() ? closestIndex : -1;
  }

  function findNearestBorderHint(point) {
    const hints = state.analysis?.borderHintPoints || [];
    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    hints.forEach((hint, index) => {
      const hintDistance = distance(hint, point);
      if (hintDistance < closestDistance) {
        closestDistance = hintDistance;
        closestIndex = index;
      }
    });
    return closestDistance <= getHandleThresholdPx() ? closestIndex : -1;
  }

  function findNearestCalibrationPoint(point) {
    const points =
      state.analysis?.calibrationDraftPoints?.length
        ? state.analysis.calibrationDraftPoints
        : state.analysis?.calibration?.points || state.analysis?.calibrationDraftPoints || [];
    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    points.forEach((candidate, index) => {
      const candidateDistance = distance(candidate, point);
      if (candidateDistance < closestDistance) {
        closestDistance = candidateDistance;
        closestIndex = index;
      }
    });
    return closestDistance <= getHandleThresholdPx() ? closestIndex : -1;
  }

  function findNearestPointControl(point) {
    const controls = state.analysis?.centerlineControls || [];
    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    controls.forEach((control, index) => {
      const distanceToControl = distance(control, point);
      if (distanceToControl < closestDistance) {
        closestDistance = distanceToControl;
        closestIndex = index;
      }
    });
    return closestDistance <= getHandleThresholdPx() ? closestIndex : -1;
  }

  function findNearestBorderControl(point) {
    const analysis = state.analysis;
    if (!analysis?.leftOffsetControls?.length || !analysis?.borderLeft?.length || !analysis?.borderRight?.length) {
      return null;
    }

    const threshold = getHandleThresholdPx();
    let winner = null;
    analysis.leftOffsetControls.forEach((control, index) => {
      const pointDistance = distance(analysis.borderLeft[control.sampleIndex], point);
      if (pointDistance <= threshold && (!winner || pointDistance < winner.distance)) {
        winner = { side: "left", index, distance: pointDistance };
      }
    });
    analysis.rightOffsetControls.forEach((control, index) => {
      const pointDistance = distance(analysis.borderRight[control.sampleIndex], point);
      if (pointDistance <= threshold && (!winner || pointDistance < winner.distance)) {
        winner = { side: "right", index, distance: pointDistance };
      }
    });
    return winner;
  }

  function isSameRemovalTarget(previous, target) {
    return Boolean(
      previous &&
        target &&
        previous.kind === target.kind &&
        previous.index === target.index &&
        previous.side === target.side
    );
  }

  function buildRemovalTargetAtPoint(point) {
    const analysis = ensureAnalysisState();
    if (!analysis) {
      return null;
    }

    if (state.mode === MODES.anchors) {
      const index = findNearestAnchor(point);
      if (index >= 0) {
        return {
          kind: "anchor",
          index,
          point: clonePoint(analysis.anchorPoints[index]),
          label: "anchor",
        };
      }
      return null;
    }

    if (state.mode === MODES.borderHints) {
      const index = findNearestBorderHint(point);
      if (index >= 0) {
        return {
          kind: "borderHint",
          index,
          point: clonePoint(analysis.borderHintPoints[index]),
          label: "border hint",
        };
      }
      return null;
    }

    if (state.mode === MODES.centerline) {
      const index = findNearestPointControl(point);
      if (index >= 0) {
        return {
          kind: "centerlineControl",
          index,
          point: clonePoint(analysis.centerlineControls[index]),
          label: "centerline control",
        };
      }
      return null;
    }

    if (state.mode === MODES.borders) {
      const hit = findNearestBorderControl(point);
      if (hit) {
        const borderPoints = hit.side === "left" ? analysis.borderLeft : analysis.borderRight;
        return {
          kind: "borderControl",
          side: hit.side,
          index: hit.index,
          point: clonePoint(borderPoints[analysis[hit.side === "left" ? "leftOffsetControls" : "rightOffsetControls"][hit.index].sampleIndex]),
          label: `${hit.side} border control`,
        };
      }
    }

    return null;
  }

  function removeEditableControl(target) {
    const analysis = ensureAnalysisState();
    if (!analysis || !target) {
      return false;
    }

    if (target.kind === "anchor") {
      if (!analysis.anchorPoints?.[target.index]) {
        return false;
      }
      recordHistoryStep("remove anchor");
      analysis.anchorPoints.splice(target.index, 1);
      clearDerivedSegmentation(analysis);
      updateUi();
      scheduleRender();
      setStatus("Anchor removed.");
      return true;
    }

    if (target.kind === "borderHint") {
      if (!analysis.borderHintPoints?.[target.index]) {
        return false;
      }
      recordHistoryStep("remove border hint");
      analysis.borderHintPoints.splice(target.index, 1);
      updateUi();
      scheduleRender();
      setStatus("Border hint removed.");
      return true;
    }

    if (target.kind === "centerlineControl") {
      if (!analysis.centerlineControls?.[target.index]) {
        return false;
      }
      if (analysis.centerlineControls.length <= 2 || target.index === 0 || target.index === analysis.centerlineControls.length - 1) {
        setStatus("The centerline end controls are fixed.", "warning");
        return false;
      }
      recordHistoryStep("remove centerline control");
      analysis.centerlineControls.splice(target.index, 1);
      rebuildDerivedGeometry({ preserveBorders: true });
      updateUi();
      scheduleRender();
      setStatus("Centerline control removed.");
      return true;
    }

    if (target.kind === "borderControl") {
      const controls = target.side === "left" ? analysis.leftOffsetControls : analysis.rightOffsetControls;
      if (!controls?.[target.index]) {
        return false;
      }
      if (controls.length <= 2 || target.index === 0 || target.index === controls.length - 1) {
        setStatus(`The ${target.side} border end controls are fixed.`, "warning");
        return false;
      }
      recordHistoryStep("remove border control");
      controls.splice(target.index, 1);
      rebuildDerivedGeometry();
      updateUi();
      scheduleRender();
      setStatus(`${capitalize(target.side)} border control removed.`);
      return true;
    }

    return false;
  }

  function getCenterlineNormalAtSample(analysis, sampleIndex) {
    const center = analysis.centerline[sampleIndex];
    const previous = analysis.centerline[Math.max(0, sampleIndex - 1)];
    const next = analysis.centerline[Math.min(analysis.centerline.length - 1, sampleIndex + 1)];
    return {
      center,
      normal: perpendicular(
        normalizeVector({
          x: next.x - previous.x,
          y: next.y - previous.y,
        })
      ),
    };
  }

  function findAggressiveBorderBrushTarget(point) {
    const analysis = state.analysis;
    if (!analysis?.centerline?.length || !analysis?.leftOffsets?.length || !analysis?.rightOffsets?.length) {
      return null;
    }

    const sampleIndex = getNearestCenterlineSampleIndex(point);
    const { center, normal } = getCenterlineNormalAtSample(analysis, sampleIndex);
    const signedDistance = dotPoint(subtractPoints(point, center), normal);
    const threshold = getHandleThresholdPx() * 0.8;
    const leftLimit = -(analysis.leftOffsets[sampleIndex] + threshold);
    const rightLimit = analysis.rightOffsets[sampleIndex] + threshold;

    if (signedDistance <= leftLimit) {
      return { side: "left", sampleIndex };
    }
    if (signedDistance >= rightLimit) {
      return { side: "right", sampleIndex };
    }
    return null;
  }

  function getNearestCenterlineSampleIndex(point, centerlineOverride) {
    const centerline = centerlineOverride || state.analysis?.centerline || [];
    let winner = 0;
    let winnerDistance = Number.POSITIVE_INFINITY;
    centerline.forEach((sample, index) => {
      const sampleDistance = distance(sample, point);
      if (sampleDistance < winnerDistance) {
        winner = index;
        winnerDistance = sampleDistance;
      }
    });
    return winner;
  }

  function findLesionCursorHit(point) {
    return findLesionMarkerAtPoint(point, { keys: ["cursorIndex"] })?.key === "cursorIndex";
  }

  function getLesionMarkerDefinitions(analysis, options) {
    const lesion = analysis?.lesion;
    if (!lesion) {
      return [];
    }
    const allowedKeys = options?.keys ? new Set(options.keys) : null;
    const includeCursor = options?.includeCursor !== false;
    const definitions = [
      {
        key: "proximalRefIndex",
        index: Number.isFinite(lesion.proximalRefIndex) ? lesion.proximalRefIndex : null,
        color: COLORS.refProx,
        label: "Prox Ref",
        priority: 1,
      },
      {
        key: "startIndex",
        index: lesion.startIndex,
        color: COLORS.lesionStart,
        label: "Stenosis Start",
        priority: 3,
      },
      {
        key: "cursorIndex",
        index: includeCursor && Number.isFinite(lesion.cursorIndex) ? lesion.cursorIndex : null,
        color: COLORS.lesionCursor,
        label: "Cursor",
        priority: 2,
      },
      {
        key: "endIndex",
        index: lesion.endIndex,
        color: COLORS.lesionEnd,
        label: "Stenosis End",
        priority: 3,
      },
      {
        key: "distalRefIndex",
        index: Number.isFinite(lesion.distalRefIndex) ? lesion.distalRefIndex : null,
        color: COLORS.refDist,
        label: "Dist Ref",
        priority: 1,
      },
    ];
    return definitions.filter((marker) => Number.isFinite(marker.index) && (!allowedKeys || allowedKeys.has(marker.key)));
  }

  function findLesionMarkerAtPoint(point, options) {
    const analysis = state.analysis;
    if (!analysis?.lesion || !analysis?.centerline?.length || !analysis?.borderLeft?.length || !analysis?.borderRight?.length) {
      return null;
    }

    const threshold = getHandleThresholdPx() * 1.35;
    let winner = null;
    getLesionMarkerDefinitions(analysis, options).forEach((marker) => {
      const center = analysis.centerline[marker.index];
      if (!center) {
        return;
      }
      let score = distance(center, point);
      if (marker.key !== "cursorIndex") {
        score = Math.min(score, pointToSegmentDistance(point, analysis.borderLeft[marker.index], analysis.borderRight[marker.index]));
      }
      if (
        score <= threshold &&
        (
          !winner ||
          score < winner.distance - 1e-6 ||
          (Math.abs(score - winner.distance) <= 1e-6 && (marker.priority || 0) > (winner.priority || 0))
        )
      ) {
        winner = { ...marker, distance: score };
      }
    });
    return winner;
  }

  function insertAnchorAtBestPosition(point, options) {
    const analysis = ensureAnalysisState();
    if (!analysis || !state.canvasTransform) {
      return;
    }
    if (!options?.skipHistory) {
      recordHistoryStep("anchor edit");
    }

    const clampedPoint = {
      x: clamp(point.x, 0, state.canvasTransform.columns - 1),
      y: clamp(point.y, 0, state.canvasTransform.rows - 1),
    };

    if (options?.append || analysis.anchorPoints.length < 2) {
      analysis.anchorPoints.push(clampedPoint);
    } else {
      let bestInsertIndex = analysis.anchorPoints.length;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < analysis.anchorPoints.length - 1; index += 1) {
        const segmentDistance = pointToSegmentDistance(
          clampedPoint,
          analysis.anchorPoints[index],
          analysis.anchorPoints[index + 1]
        );
        if (segmentDistance < bestDistance) {
          bestDistance = segmentDistance;
          bestInsertIndex = index + 1;
        }
      }
      analysis.anchorPoints.splice(bestInsertIndex, 0, clampedPoint);
    }

    clearDerivedSegmentation(analysis);
    state.mode = MODES.anchors;
    updateUi();
    scheduleRender();
    setStatus(options?.statusMessage || "Anchor inserted. Double-click or click Segment Vessel to re-segment.");
  }

  function insertBorderHintAtPoint(point, options) {
    const analysis = ensureAnalysisState();
    if (!analysis || !state.canvasTransform) {
      return;
    }
    if ((analysis.anchorPoints?.length || 0) < 2 && (analysis.centerline?.length || 0) < 2) {
      setStatus("Place at least two vessel anchors first so border hints can be assigned to the left or right edge.", "warning");
      return;
    }
    const geometry = inferBorderHintGeometry(point, analysis);
    if (!geometry) {
      setStatus("The app could not infer which side of the vessel this border hint belongs to.", "warning");
      return;
    }
    if (!options?.skipHistory) {
      recordHistoryStep("add border hint");
    }

    const clampedPoint = {
      x: clamp(point.x, 0, state.canvasTransform.columns - 1),
      y: clamp(point.y, 0, state.canvasTransform.rows - 1),
      side: geometry.side,
    };

    analysis.borderHintPoints.push(clampedPoint);
    state.mode = MODES.borderHints;
    updateUi();
    scheduleRender();
    setStatus(options?.statusMessage || `${capitalize(geometry.side)} border hint added. Segment or re-segment to apply it.`);
  }

  function sortControlsBySampleIndex(controls) {
    controls.sort((left, right) => left.sampleIndex - right.sampleIndex);
  }

  function upsertOffsetControl(controls, sampleIndex, value) {
    const existing = controls.find((control) => control.sampleIndex === sampleIndex);
    if (existing) {
      existing.value = value;
      return existing;
    }
    const control = { sampleIndex, value };
    controls.push(control);
    sortControlsBySampleIndex(controls);
    return control;
  }

  function pickAvailableSampleIndex(sampleIndex, controls, maxIndex, ignoredControl) {
    const taken = new Set(
      (controls || [])
        .filter((control) => control !== ignoredControl)
        .map((control) => control.sampleIndex)
    );
    if (!taken.has(sampleIndex)) {
      return sampleIndex;
    }
    for (let offset = 1; offset <= maxIndex; offset += 1) {
      const lower = sampleIndex - offset;
      if (lower > 0 && !taken.has(lower)) {
        return lower;
      }
      const upper = sampleIndex + offset;
      if (upper < maxIndex && !taken.has(upper)) {
        return upper;
      }
    }
    return null;
  }

  function pickBorderControlSampleIndex(point, side, controls, analysis, ignoredControl) {
    if (!analysis?.centerline?.length || !analysis?.borderLeft?.length || !analysis?.borderRight?.length) {
      return null;
    }
    const maxIndex = analysis.centerline.length - 1;
    const targetIndex = getNearestCenterlineSampleIndex(point);
    const borderPoints = side === "left" ? analysis.borderLeft : analysis.borderRight;
    const taken = new Set(
      (controls || [])
        .filter((control) => control !== ignoredControl)
        .map((control) => control.sampleIndex)
    );
    const radius = Math.max(2, BORDER_CONTROL_LOCAL_SEARCH_RADIUS_SAMPLES);
    let winner = null;

    for (let offset = 0; offset <= radius; offset += 1) {
      const candidateIndexes = offset === 0 ? [targetIndex] : [targetIndex - offset, targetIndex + offset];
      candidateIndexes.forEach((candidateIndex) => {
        if (candidateIndex < 0 || candidateIndex > maxIndex || taken.has(candidateIndex)) {
          return;
        }
        const borderPoint = borderPoints[candidateIndex];
        if (!borderPoint) {
          return;
        }
        const score = distance(borderPoint, point) + Math.abs(candidateIndex - targetIndex) * 1.25;
        if (!winner || score < winner.score) {
          winner = { sampleIndex: candidateIndex, score };
        }
      });
    }

    if (winner) {
      return winner.sampleIndex;
    }

    return ignoredControl ? ignoredControl.sampleIndex : null;
  }

  function insertCenterlineControlAtPoint(point) {
    const analysis = ensureAnalysisState();
    if (!analysis?.centerline?.length) {
      setStatus("Segment the vessel before adding more centerline controls.", "warning");
      return;
    }
    recordHistoryStep("add centerline control");

    const sampleIndex = pickAvailableSampleIndex(
      getNearestCenterlineSampleIndex(point),
      analysis.centerlineControls,
      analysis.centerline.length - 1
    );
    if (!Number.isFinite(sampleIndex)) {
      setStatus("No free centerline sample is available at that location.", "warning");
      return;
    }

    const sample = analysis.centerline[sampleIndex];
    analysis.centerlineControls.push({
      sampleIndex,
      x: sample.x,
      y: sample.y,
    });
    sortControlsBySampleIndex(analysis.centerlineControls);
    rebuildDerivedGeometry({ preserveBorders: true });
    updateUi();
    scheduleRender();
    setStatus("Centerline control added. Drag it to refine the vessel path.");
  }

  function moveBorderHint(point) {
    const analysis = ensureAnalysisState();
    const hint = analysis?.borderHintPoints?.[state.dragging.index];
    if (!hint || !state.canvasTransform) {
      return;
    }

    hint.x = clamp(point.x, 0, state.canvasTransform.columns - 1);
    hint.y = clamp(point.y, 0, state.canvasTransform.rows - 1);

    const geometry = inferBorderHintGeometry(hint, analysis);
    if (geometry?.side) {
      hint.side = geometry.side;
    }

    updateUi();
    scheduleRender();
  }

  function findNearestBorderSample(point) {
    const analysis = state.analysis;
    if (!analysis?.borderLeft?.length || !analysis?.borderRight?.length) {
      return null;
    }

    let winner = null;
    analysis.borderLeft.forEach((candidate, sampleIndex) => {
      const candidateDistance = distance(candidate, point);
      if (!winner || candidateDistance < winner.distance) {
        winner = { side: "left", sampleIndex, distance: candidateDistance };
      }
    });
    analysis.borderRight.forEach((candidate, sampleIndex) => {
      const candidateDistance = distance(candidate, point);
      if (!winner || candidateDistance < winner.distance) {
        winner = { side: "right", sampleIndex, distance: candidateDistance };
      }
    });
    return winner;
  }

  function insertBorderControlAtPoint(point) {
    const analysis = ensureAnalysisState();
    if (!analysis?.centerline?.length) {
      setStatus("Segment the vessel before adding more border controls.", "warning");
      return;
    }
    recordHistoryStep("add border control");

    const hit = findNearestBorderSample(point);
    if (!hit) {
      return;
    }

    const controls = hit.side === "left" ? analysis.leftOffsetControls : analysis.rightOffsetControls;
    const offsets = hit.side === "left" ? analysis.leftOffsets : analysis.rightOffsets;
    const sampleIndex = pickBorderControlSampleIndex(point, hit.side, controls, analysis);
    if (!Number.isFinite(sampleIndex)) {
      setStatus("That border region already has enough local controls. Drag an existing one instead.", "warning");
      return;
    }

    controls.push({
      sampleIndex,
      value: offsets[sampleIndex],
    });
    sortControlsBySampleIndex(controls);
    rebuildDerivedGeometry();
    updateUi();
    scheduleRender();
    setStatus(`${capitalize(hit.side)} border control added. Drag it to refine the contour.`);
  }

  function activateBorderControlFromLine(point, options) {
    const analysis = ensureAnalysisState();
    if (!analysis?.centerline?.length) {
      return null;
    }

    const hit = findNearestBorderSample(point);
    if (!hit || hit.distance > getHandleThresholdPx() * 1.8) {
      return null;
    }

    const controls = hit.side === "left" ? analysis.leftOffsetControls : analysis.rightOffsetControls;
    const offsets = hit.side === "left" ? analysis.leftOffsets : analysis.rightOffsets;
    const sampleIndex = pickBorderControlSampleIndex(point, hit.side, controls, analysis);
    if (!Number.isFinite(sampleIndex)) {
      return null;
    }

    if (options?.preview) {
      return {
        side: hit.side,
        sampleIndex,
      };
    }

    const control = {
      sampleIndex,
      value: offsets[sampleIndex],
    };
    controls.push(control);
    sortControlsBySampleIndex(controls);
    return {
      side: hit.side,
      index: controls.indexOf(control),
    };
  }

  function applyAggressiveBorderBrush(point, side) {
    const analysis = ensureAnalysisState();
    if (!analysis?.centerline?.length) {
      return;
    }

    const sampleIndex = getNearestCenterlineSampleIndex(point);
    const { center, normal } = getCenterlineNormalAtSample(analysis, sampleIndex);
    const signedDistance = dotPoint(subtractPoints(point, center), normal);
    const desiredOffset = side === "left" ? -signedDistance : signedDistance;
    if (!Number.isFinite(desiredOffset) || desiredOffset <= 0) {
      return;
    }

    const controls = side === "left" ? analysis.leftOffsetControls : analysis.rightOffsetControls;
    const offsets = side === "left" ? analysis.leftOffsets : analysis.rightOffsets;
    const maxIndex = analysis.centerline.length - 1;
    for (let delta = -BORDER_BRUSH_RADIUS_SAMPLES; delta <= BORDER_BRUSH_RADIUS_SAMPLES; delta += 1) {
      const targetIndex = clamp(sampleIndex + delta, 0, maxIndex);
      const influence = 1 - Math.abs(delta) / (BORDER_BRUSH_RADIUS_SAMPLES + 1);
      const nextValue = clamp(
        lerp(offsets[targetIndex], desiredOffset, Math.max(0, influence) ** 1.4),
        MIN_MANUAL_BORDER_RADIUS_PX,
        MAX_BORDER_RADIUS_PX
      );
      upsertOffsetControl(controls, targetIndex, nextValue);
    }

    rebuildDerivedGeometry();
    updateUi();
    scheduleRender();
  }

  function removeControlsNearPoint(controls, locationForControl, point, minimumCount, lockedIndexes) {
    const locked = lockedIndexes || new Set();
    let removableCount = Math.max(0, controls.length - minimumCount);
    if (!removableCount) {
      return {
        controls,
        changed: false,
      };
    }

    const nextControls = [];
    let changed = false;
    controls.forEach((control, index) => {
      if (locked.has(index) || removableCount <= 0 || distance(locationForControl(control), point) > ERASER_RADIUS_PX) {
        nextControls.push(control);
        return;
      }
      removableCount -= 1;
      changed = true;
    });

    return {
      controls: changed ? nextControls : controls,
      changed,
    };
  }

  function eraseAtPoint(point) {
    const analysis = ensureAnalysisState();
    if (!analysis) {
      return false;
    }

    let changed = false;

    const nextAnchors = analysis.anchorPoints.filter((anchor) => distance(anchor, point) > ERASER_RADIUS_PX);
    if (nextAnchors.length !== analysis.anchorPoints.length) {
      analysis.anchorPoints = nextAnchors;
      clearDerivedSegmentation(analysis);
      changed = true;
    }

    const nextBorderHints = (analysis.borderHintPoints || []).filter((hint) => distance(hint, point) > ERASER_RADIUS_PX);
    if (nextBorderHints.length !== (analysis.borderHintPoints || []).length) {
      analysis.borderHintPoints = nextBorderHints;
      changed = true;
    }

    if (!analysis.centerline?.length) {
      if (changed) {
        updateUi();
        scheduleRender();
      }
      return changed;
    }

    if (!changed && analysis.centerlineControls.length > 2) {
      const nextCenterlineControls = removeControlsNearPoint(
        analysis.centerlineControls,
        (control) => control,
        point,
        2,
        new Set([0, analysis.centerlineControls.length - 1])
      );
      if (nextCenterlineControls.changed) {
        analysis.centerlineControls = nextCenterlineControls.controls;
        rebuildDerivedGeometry({ preserveBorders: true });
        changed = true;
      }
    }

    let borderControlsChanged = false;
    if (!changed && analysis.leftOffsetControls.length > 2) {
      const nextLeftControls = removeControlsNearPoint(
        analysis.leftOffsetControls,
        (control) => analysis.borderLeft[control.sampleIndex],
        point,
        2
      );
      analysis.leftOffsetControls = nextLeftControls.controls;
      borderControlsChanged = borderControlsChanged || nextLeftControls.changed;
    }
    if (!changed && analysis.rightOffsetControls.length > 2) {
      const nextRightControls = removeControlsNearPoint(
        analysis.rightOffsetControls,
        (control) => analysis.borderRight[control.sampleIndex],
        point,
        2
      );
      analysis.rightOffsetControls = nextRightControls.controls;
      borderControlsChanged = borderControlsChanged || nextRightControls.changed;
    }
    if (!changed && borderControlsChanged) {
      rebuildDerivedGeometry();
      changed = true;
    }

    if (changed) {
      updateUi();
      scheduleRender();
    }
    return changed;
  }

  function findProfileMarkerAtPoint(point) {
    const geometry = state.profileGeometry;
    if (!geometry?.markers?.length) {
      return null;
    }

    const dpr = window.devicePixelRatio || 1;
    let winner = null;
    geometry.markers.forEach((marker) => {
      const handleDistance = Math.hypot(point.x - marker.x, point.y - marker.handleY);
      const lineDistance = Math.abs(point.x - marker.x);
      const isOnLine = point.y >= marker.lineYMin && point.y <= marker.lineYMax;
      const score = Math.min(handleDistance, isOnLine ? lineDistance : Number.POSITIVE_INFINITY);
      if (!winner || score < winner.score) {
        winner = { key: marker.key, score };
      }
    });

    return winner && winner.score <= 18 * dpr ? winner : null;
  }

  function updateProfileCursor(event) {
    if (!hasSegmentedVessel() || !state.profileGeometry) {
      els.profileCanvas.style.cursor = "default";
      return;
    }
    const point = getCanvasRelativePoint(event, els.profileCanvas);
    els.profileCanvas.style.cursor = findProfileMarkerAtPoint(point) ? "ew-resize" : "default";
  }

  function handleOverlayPointerDown(event) {
    if (event.button !== 2) {
      state.pendingLesionRightClick = null;
    }
    const series = getActiveSeries();
    if (!series || !state.canvasTransform) {
      return;
    }

    if (event.button === 1) {
      event.preventDefault();
      const screen = getCanvasRelativePoint(event, els.overlayCanvas);
      const view = getActiveViewState();
      state.dragging = {
        kind: "pan",
        startScreen: screen,
        startPanX: view.panX || 0,
        startPanY: view.panY || 0,
      };
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (state.referenceSamplingTarget) {
      if (!Number.isFinite(state.selectedFrameIndex) || !isAnalysisFrameVisible()) {
        return;
      }
      const samplingPoint = getImagePointFromEvent(event);
      if (!samplingPoint) {
        return;
      }
      sampleSegmentationReferenceAtPoint(state.referenceSamplingTarget, samplingPoint).catch((error) => {
        console.error(error);
        setStatus(error.message || "Reference sampling failed.", "error");
      });
      return;
    }

    if (state.mode === MODES.zoom) {
      const screen = getCanvasRelativePoint(event, els.overlayCanvas);
      const view = getActiveViewState();
      state.dragging = {
        kind: "pan",
        startScreen: screen,
        startPanX: view.panX || 0,
        startPanY: view.panY || 0,
      };
      return;
    }

    if (state.mode === MODES.windowing) {
      const frame = state.lastRenderedFrame;
      if (!frame) {
        return;
      }
      const point = getImagePointFromEvent(event);
      if (!point || !isInsideImage(point, frame)) {
        return;
      }
      recordHistoryStep("adjust windowing");
      const screen = getCanvasRelativePoint(event, els.overlayCanvas);
      const windowState = getFrameWindowState(frame, getActiveViewState());
      state.dragging = {
        kind: "windowing",
        startScreen: screen,
        startWindowCenter: windowState.center,
        startWindowWidth: windowState.width,
        startBaseWidth: windowState.baseWidth,
      };
      setStatus(`Windowing active. ${getWindowingSummary(frame, getActiveViewState())}.`);
      return;
    }

    if (!Number.isFinite(state.selectedFrameIndex) || !isAnalysisFrameVisible()) {
      return;
    }

    const analysis = ensureAnalysisState();
    const point = getImagePointFromEvent(event);
    if (!point) {
      return;
    }

    if (state.mode === MODES.calibration) {
      const calibrationPointIndex = findNearestCalibrationPoint(point);
      if (calibrationPointIndex >= 0) {
        recordHistoryStep("move calibration");
        state.dragging = { kind: "calibrationPoint", index: calibrationPointIndex };
      } else if (isInsideImage(point, { columns: state.canvasTransform.columns, rows: state.canvasTransform.rows })) {
        const clampedPoint = {
          x: clamp(point.x, 0, state.canvasTransform.columns - 1),
          y: clamp(point.y, 0, state.canvasTransform.rows - 1),
        };

        if (!analysis.calibrationDraftPoints?.length) {
          analysis.calibrationDraftPoints = [clampedPoint];
          updateUi();
          scheduleRender();
        } else if (analysis.calibrationDraftPoints.length === 1) {
          analysis.calibrationDraftPoints.push(clampedPoint);
          try {
            commitManualCalibration(analysis.calibrationDraftPoints[0], analysis.calibrationDraftPoints[1]);
          } catch (error) {
            console.error(error);
            setStatus(error.message || "Calibration failed.", "error");
          }
        } else {
          analysis.calibrationDraftPoints = [clampedPoint];
          updateUi();
          scheduleRender();
        }
      }
      return;
    }

    if (state.mode === MODES.anchors) {
      const existingAnchorIndex = findNearestAnchor(point);
      if (existingAnchorIndex >= 0) {
        recordHistoryStep("move anchor");
        state.dragging = { kind: "anchor", index: existingAnchorIndex };
      } else if (isInsideImage(point, { columns: state.canvasTransform.columns, rows: state.canvasTransform.rows })) {
        insertAnchorAtBestPosition(point, {
          append: true,
          statusMessage: "Anchor added. Double-click to segment when the vessel path looks right.",
        });
      }
      return;
    }

    if (state.mode === MODES.borderHints) {
      const existingHintIndex = findNearestBorderHint(point);
      if (existingHintIndex >= 0) {
        recordHistoryStep("move border hint");
        state.dragging = { kind: "borderHint", index: existingHintIndex };
      } else if (isInsideImage(point, { columns: state.canvasTransform.columns, rows: state.canvasTransform.rows })) {
        insertBorderHintAtPoint(point, {
          statusMessage: "Border hint added. Segment or re-segment to bias the automatic borders.",
        });
      }
      return;
    }

    if (state.mode === MODES.eraser) {
      if (!isInsideImage(point, { columns: state.canvasTransform.columns, rows: state.canvasTransform.rows })) {
        return;
      }
      recordHistoryStep("eraser edit");
      eraseAtPoint({
        x: clamp(point.x, 0, state.canvasTransform.columns - 1),
        y: clamp(point.y, 0, state.canvasTransform.rows - 1),
      });
      updateUi();
      scheduleRender();
      return;
    }

    if (!hasSegmentedVessel()) {
      return;
    }

    if (state.mode === MODES.draw) {
      if (!isInsideImage(point, { columns: state.canvasTransform.columns, rows: state.canvasTransform.rows })) {
        return;
      }
      const targetMode = state.drawTargetMode === MODES.borders ? MODES.borders : MODES.centerline;
      const drawSide =
        targetMode === MODES.borders ? findNearestBorderSample(point)?.side || findAggressiveBorderBrushTarget(point)?.side || "left" : null;
      const clampedPoint = {
        x: clamp(point.x, 0, state.canvasTransform.columns - 1),
        y: clamp(point.y, 0, state.canvasTransform.rows - 1),
      };
      recordHistoryStep(targetMode === MODES.borders ? "draw border" : "draw centerline");
      state.dragging = {
        kind: "drawStroke",
        targetMode,
        side: drawSide,
        points: [clampedPoint],
      };
      setStatus(
        targetMode === MODES.borders
          ? `Drawing the ${drawSide} border contour. Release to blend it into the existing vessel edge.`
          : "Drawing the centerline. Release to blend it into the existing vessel path."
      );
      scheduleRender();
      return;
    }

    if (state.mode === MODES.centerline) {
      const controlIndex = findNearestPointControl(point);
      if (controlIndex >= 0) {
        recordHistoryStep("move centerline");
        state.dragging = { kind: "centerlineControl", index: controlIndex };
      }
      return;
    }

    if (state.mode === MODES.borders) {
      const borderHit = findNearestBorderControl(point);
      if (borderHit) {
        recordHistoryStep("move border");
        state.dragging = {
          kind: "borderControl",
          side: borderHit.side,
          index: borderHit.index,
        };
      } else {
        const createdBorderPreview = activateBorderControlFromLine(point, { preview: true });
        if (createdBorderPreview) {
          recordHistoryStep("move border");
          const createdBorderHit = activateBorderControlFromLine(point);
          if (!createdBorderHit) {
            return;
          }
          state.dragging = {
            kind: "borderControl",
            side: createdBorderHit.side,
            index: createdBorderHit.index,
          };
          moveBorderControl(point);
          setStatus(`Dragging the ${createdBorderHit.side} border contour. Release to keep the new local control point.`);
          return;
        }
        const brushTarget = findAggressiveBorderBrushTarget(point);
        if (brushTarget) {
          recordHistoryStep("aggressive border draw");
          state.dragging = {
            kind: "borderBrush",
            side: brushTarget.side,
          };
          applyAggressiveBorderBrush(point, brushTarget.side);
          setStatus(`Aggressive ${brushTarget.side} border drawing active. Drag to reshape the contour.`);
        }
      }
      return;
    }

    if (state.mode === MODES.lesion) {
      const lesionHit = findLesionMarkerAtPoint(point);
      if (lesionHit) {
        recordHistoryStep(lesionHit.key === "cursorIndex" ? "move lesion cursor" : "adjust lesion markers");
        state.dragging =
          lesionHit.key === "cursorIndex"
            ? {
                kind: "lesionCursorImage",
              }
            : {
                kind: "lesionMarkerImage",
                key: lesionHit.key,
              };
      }
    }
  }

  function handleOverlayDoubleClick(event) {
    if (event.button !== 0) {
      return;
    }
    if (!Number.isFinite(state.selectedFrameIndex) || !isAnalysisFrameVisible()) {
      return;
    }
    if (state.mode !== MODES.anchors || hasSegmentedVessel()) {
      return;
    }
    const analysis = ensureAnalysisState();
    if (!analysis?.anchorPoints?.length || analysis.anchorPoints.length < 2) {
      return;
    }

    event.preventDefault();
    segmentCurrentVessel({ resegment: false }).catch((error) => {
      console.error(error);
      setStatus(error.message || "Segmentation failed.", "error");
    });
  }

  function handleOverlayContextMenu(event) {
    if (!Number.isFinite(state.selectedFrameIndex) || !isAnalysisFrameVisible()) {
      return;
    }

    const point = getImagePointFromEvent(event);
    if (!point || !isInsideImage(point, { columns: state.canvasTransform.columns, rows: state.canvasTransform.rows })) {
      return;
    }

    event.preventDefault();
    const removalTarget = buildRemovalTargetAtPoint(point);
    if (state.mode === MODES.lesion) {
      state.pendingRemovalRightClick = null;
      const proximalHit = findLesionMarkerAtPoint(point, { keys: ["proximalRefIndex"], includeCursor: false });
      if (!proximalHit) {
        state.pendingLesionRightClick = null;
        return;
      }

      const now = Date.now();
      const previous = state.pendingLesionRightClick;
      if (
        previous &&
        previous.key === proximalHit.key &&
        now - previous.time <= 500 &&
        distance(previous.point, point) <= getHandleThresholdPx() * 2
      ) {
        removeProximalReference();
        state.pendingLesionRightClick = null;
      } else {
        state.pendingLesionRightClick = {
          key: proximalHit.key,
          point: clonePoint(point),
          time: now,
        };
        setStatus("Right-click the proximal reference once more to remove it from the reference diameter.");
      }
      return;
    }

    state.pendingLesionRightClick = null;
    if (removalTarget) {
      const now = Date.now();
      const previous = state.pendingRemovalRightClick;
      if (
        isSameRemovalTarget(previous, removalTarget) &&
        now - previous.time <= 500 &&
        distance(previous.point, point) <= getHandleThresholdPx() * 2
      ) {
        removeEditableControl(removalTarget);
        state.pendingRemovalRightClick = null;
      } else {
        state.pendingRemovalRightClick = {
          ...removalTarget,
          time: now,
        };
        setStatus(`Right-click the selected ${removalTarget.label} once more to remove it.`);
      }
      return;
    }

    state.pendingRemovalRightClick = null;
    if (state.mode === MODES.centerline) {
      insertCenterlineControlAtPoint(point);
      return;
    }
    if (state.mode === MODES.borders) {
      insertBorderControlAtPoint(point);
      return;
    }
    if (state.mode === MODES.anchors) {
      insertAnchorAtBestPosition(point);
    }
  }

  function handleProfilePointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    if (!hasSegmentedVessel() || !state.profileGeometry) {
      return;
    }
    const point = getCanvasRelativePoint(event, els.profileCanvas);
    const winner = findProfileMarkerAtPoint(point);
    if (winner) {
      event.preventDefault();
      recordHistoryStep("adjust lesion markers");
      state.dragging = {
        kind: "profileMarker",
        key: winner.key,
      };
      if (typeof els.profileCanvas.setPointerCapture === "function") {
        try {
          els.profileCanvas.setPointerCapture(event.pointerId);
        } catch (_error) {
          // Pointer capture may fail in some browsers for synthetic or already-ended pointers.
        }
      }
    }
  }

  function moveAnchor(point) {
    const analysis = ensureAnalysisState();
    if (!analysis) {
      return;
    }
    const anchor = analysis.anchorPoints[state.dragging.index];
    if (!anchor) {
      return;
    }
    anchor.x = clamp(point.x, 0, state.canvasTransform.columns - 1);
    anchor.y = clamp(point.y, 0, state.canvasTransform.rows - 1);
    clearDerivedSegmentation(analysis);
    updateUi();
    scheduleRender();
  }

  function moveCalibrationPoint(point) {
    const analysis = ensureAnalysisState();
    if (!analysis) {
      return;
    }

    const nextPoint = {
      x: clamp(point.x, 0, state.canvasTransform.columns - 1),
      y: clamp(point.y, 0, state.canvasTransform.rows - 1),
    };

    if (analysis.calibration?.points?.length === 2) {
      analysis.calibration.points[state.dragging.index] = nextPoint;
      try {
        analysis.calibration = computeManualCalibration(analysis.calibration.points[0], analysis.calibration.points[1]);
        refreshMeasurementsAfterCalibrationChange();
      } catch (_error) {
        // Keep interactive dragging responsive even if the line becomes temporarily too short.
      }
    } else if (analysis.calibrationDraftPoints?.length) {
      analysis.calibrationDraftPoints[state.dragging.index] = nextPoint;
    }

    updateUi();
    scheduleRender();
  }

  function moveCenterlineControl(point) {
    const analysis = ensureAnalysisState();
    const control = analysis?.centerlineControls?.[state.dragging.index];
    if (!control) {
      return;
    }
    control.x = clamp(point.x, 0, state.canvasTransform.columns - 1);
    control.y = clamp(point.y, 0, state.canvasTransform.rows - 1);
    rebuildDerivedGeometry({ preserveBorders: true });
    updateUi();
    scheduleRender();
  }

  function moveBorderControl(point) {
    const analysis = ensureAnalysisState();
    if (!analysis) {
      return;
    }
    const controls = state.dragging.side === "left" ? analysis.leftOffsetControls : analysis.rightOffsetControls;
    const control = controls?.[state.dragging.index];
    if (!control) {
      return;
    }

    const nextSampleIndex = pickBorderControlSampleIndex(point, state.dragging.side, controls, analysis, control);
    if (Number.isFinite(nextSampleIndex)) {
      control.sampleIndex = nextSampleIndex;
      sortControlsBySampleIndex(controls);
      state.dragging.index = controls.indexOf(control);
    }

    const sampleIndex = control.sampleIndex;
    const center = analysis.centerline[sampleIndex];
    const previous = analysis.centerline[Math.max(0, sampleIndex - 1)];
    const next = analysis.centerline[Math.min(analysis.centerline.length - 1, sampleIndex + 1)];
    const normal = perpendicular(
      normalizeVector({
        x: next.x - previous.x,
        y: next.y - previous.y,
      })
    );
    const vector = subtractPoints(point, center);
    const signedDistance = dotPoint(vector, normal);
    control.value =
      state.dragging.side === "left"
        ? clamp(-signedDistance, MIN_MANUAL_BORDER_RADIUS_PX, MAX_BORDER_RADIUS_PX)
        : clamp(signedDistance, MIN_MANUAL_BORDER_RADIUS_PX, MAX_BORDER_RADIUS_PX);

    rebuildDerivedGeometry();
    updateUi();
    scheduleRender();
  }

  function getStrokeSamplePoint(points, fraction) {
    if (!points?.length) {
      return null;
    }
    if (points.length === 1) {
      return clonePoint(points[0]);
    }
    const clampedFraction = clamp(fraction, 0, 1);
    const position = clampedFraction * (points.length - 1);
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(points.length - 1, leftIndex + 1);
    const t = position - leftIndex;
    return {
      x: lerp(points[leftIndex].x, points[rightIndex].x, t),
      y: lerp(points[leftIndex].y, points[rightIndex].y, t),
    };
  }

  function buildControlRange(startIndex, endIndex, maxIndex) {
    let start = clamp(Math.min(startIndex, endIndex), 0, maxIndex);
    let end = clamp(Math.max(startIndex, endIndex), 0, maxIndex);
    if (end - start >= 3) {
      return { start, end };
    }
    const midpoint = Math.round((start + end) / 2);
    start = clamp(midpoint - 2, 0, maxIndex);
    end = clamp(midpoint + 2, 0, maxIndex);
    if (end - start < 3) {
      start = clamp(start - 1, 0, maxIndex);
      end = clamp(end + 1, 0, maxIndex);
    }
    return { start, end };
  }

  function finalizeControlSet(controls) {
    const byIndex = new Map();
    (controls || []).forEach((control) => {
      if (!Number.isFinite(control?.sampleIndex)) {
        return;
      }
      byIndex.set(control.sampleIndex, control);
    });
    return Array.from(byIndex.values()).sort((left, right) => left.sampleIndex - right.sampleIndex);
  }

  function applyDrawStrokeToCenterline(analysis, strokePoints) {
    if (!analysis?.centerline?.length || !analysis.centerlineControls?.length) {
      return false;
    }
    const smoothedStroke = smoothPolyline(strokePoints, 2);
    const maxIndex = analysis.centerline.length - 1;
    const startHit = getNearestCenterlineSampleIndex(smoothedStroke[0], analysis.centerline);
    const endHit = getNearestCenterlineSampleIndex(smoothedStroke[smoothedStroke.length - 1], analysis.centerline);
    let orderedStroke = smoothedStroke;
    let range = buildControlRange(startHit, endHit, maxIndex);
    if (startHit > endHit) {
      orderedStroke = clonePoints(smoothedStroke).reverse();
    }

    const nextControls = analysis.centerlineControls
      .filter((control) => control.sampleIndex < range.start || control.sampleIndex > range.end)
      .map((control) => ({
        sampleIndex: control.sampleIndex,
        x: control.x,
        y: control.y,
      }));

    nextControls.push({
      sampleIndex: range.start,
      x: analysis.centerline[range.start].x,
      y: analysis.centerline[range.start].y,
    });

    const availableInterior = Math.max(0, range.end - range.start - 1);
    const interiorCount = Math.min(
      availableInterior,
      Math.max(1, Math.min(10, Math.round((range.end - range.start) / 3)))
    );
    for (let index = 1; index <= interiorCount; index += 1) {
      const fraction = index / (interiorCount + 1);
      const strokePoint = getStrokeSamplePoint(orderedStroke, fraction);
      if (!strokePoint) {
        continue;
      }
      const sampleIndex = clamp(
        Math.round(lerp(range.start + 1, range.end - 1, fraction)),
        range.start + 1,
        range.end - 1
      );
      nextControls.push({
        sampleIndex,
        x: strokePoint.x,
        y: strokePoint.y,
      });
    }

    nextControls.push({
      sampleIndex: range.end,
      x: analysis.centerline[range.end].x,
      y: analysis.centerline[range.end].y,
    });

    analysis.centerlineControls = finalizeControlSet(nextControls);
    rebuildDerivedGeometry({ preserveBorders: true });
    return true;
  }

  function applyDrawStrokeToBorder(analysis, side, strokePoints) {
    if (!analysis?.centerline?.length || !analysis.leftOffsets?.length || !analysis.rightOffsets?.length) {
      return false;
    }
    const controls = side === "right" ? analysis.rightOffsetControls : analysis.leftOffsetControls;
    const offsets = side === "right" ? analysis.rightOffsets : analysis.leftOffsets;
    const smoothedStroke = smoothPolyline(strokePoints, 2);
    const strokeSampleIndexes = smoothedStroke.map((point) => getNearestCenterlineSampleIndex(point, analysis.centerline));
    const range = buildControlRange(
      Math.min(...strokeSampleIndexes),
      Math.max(...strokeSampleIndexes),
      analysis.centerline.length - 1
    );

    const nextControls = controls
      .filter((control) => control.sampleIndex < range.start || control.sampleIndex > range.end)
      .map((control) => ({
        sampleIndex: control.sampleIndex,
        value: control.value,
      }));

    nextControls.push({
      sampleIndex: range.start,
      value: offsets[range.start],
    });

    const availableInterior = Math.max(0, range.end - range.start - 1);
    const interiorCount = Math.min(
      availableInterior,
      Math.max(1, Math.min(12, Math.round((range.end - range.start) / 2.5)))
    );
    for (let index = 1; index <= interiorCount; index += 1) {
      const fraction = index / (interiorCount + 1);
      const sampleIndex = clamp(
        Math.round(lerp(range.start + 1, range.end - 1, fraction)),
        range.start + 1,
        range.end - 1
      );
      const strokePoint = getStrokeSamplePoint(smoothedStroke, fraction);
      if (!strokePoint) {
        continue;
      }
      const { center, normal } = getCenterlineNormalAtSample(analysis, sampleIndex);
      const signedDistance = dotPoint(subtractPoints(strokePoint, center), normal);
      const value =
        side === "right"
          ? clamp(signedDistance, MIN_MANUAL_BORDER_RADIUS_PX, MAX_BORDER_RADIUS_PX)
          : clamp(-signedDistance, MIN_MANUAL_BORDER_RADIUS_PX, MAX_BORDER_RADIUS_PX);
      nextControls.push({
        sampleIndex,
        value,
      });
    }

    nextControls.push({
      sampleIndex: range.end,
      value: offsets[range.end],
    });

    if (side === "right") {
      analysis.rightOffsetControls = finalizeControlSet(nextControls);
    } else {
      analysis.leftOffsetControls = finalizeControlSet(nextControls);
    }
    rebuildDerivedGeometry();
    return true;
  }

  function commitDrawStroke() {
    const analysis = ensureAnalysisState();
    const stroke = state.dragging;
    if (!analysis || stroke?.kind !== "drawStroke" || !stroke.points?.length) {
      return false;
    }
    if (stroke.points.length < 2) {
      return false;
    }
    if (stroke.targetMode === MODES.centerline) {
      return applyDrawStrokeToCenterline(analysis, stroke.points);
    }
    if (stroke.targetMode === MODES.borders) {
      return applyDrawStrokeToBorder(analysis, stroke.side || "left", stroke.points);
    }
    return false;
  }

  function moveLesionCursorOnImage(point) {
    const analysis = ensureAnalysisState();
    if (!analysis?.centerline?.length) {
      return;
    }
    setLesionMarkerIndex(analysis, "cursorIndex", getNearestCenterlineSampleIndex(point));
    updateLesionMeasurements(analysis);
    updateUi();
    scheduleRender();
  }

  function setLesionMarkerIndex(analysis, key, index) {
    if (!analysis?.lesion || !analysis?.centerline?.length) {
      return;
    }
    const lesion = analysis.lesion;
    const maxIndex = analysis.centerline.length - 1;
    const nextIndex = clamp(index, 0, maxIndex);

    if (key === "startIndex") {
      lesion.startIndex = clamp(nextIndex, 0, lesion.endIndex);
      if (Number.isFinite(lesion.proximalRefIndex)) {
        lesion.proximalRefIndex = clamp(lesion.proximalRefIndex, 0, lesion.startIndex);
      }
      lesion.cursorIndex = clamp(lesion.cursorIndex, lesion.startIndex, lesion.endIndex);
    } else if (key === "endIndex") {
      lesion.endIndex = clamp(nextIndex, lesion.startIndex, maxIndex);
      lesion.distalRefIndex = clamp(lesion.distalRefIndex, lesion.endIndex, maxIndex);
      lesion.cursorIndex = clamp(lesion.cursorIndex, lesion.startIndex, lesion.endIndex);
    } else if (key === "cursorIndex") {
      lesion.cursorIndex = clamp(nextIndex, lesion.startIndex, lesion.endIndex);
    } else if (key === "proximalRefIndex") {
      lesion.proximalRefIndex = clamp(nextIndex, 0, lesion.startIndex);
    } else if (key === "distalRefIndex") {
      lesion.distalRefIndex = clamp(nextIndex, lesion.endIndex, maxIndex);
    }
  }

  function updateLesionMeasurements(analysis) {
    if (!analysis?.centerline?.length || !analysis?.lesion) {
      return;
    }
    analysis.measurements = computeMeasurements(
      analysis.centerline,
      analysis.leftOffsets,
      analysis.rightOffsets,
      analysis.lesion,
      getActiveSeries(),
      analysis.borderLeft,
      analysis.borderRight
    );
  }

  function moveLesionMarkerOnImage(point) {
    const analysis = ensureAnalysisState();
    if (!analysis?.centerline?.length || !state.dragging?.key) {
      return;
    }
    setLesionMarkerIndex(analysis, state.dragging.key, getNearestCenterlineSampleIndex(point));
    updateLesionMeasurements(analysis);
    updateUi();
    scheduleRender();
  }

  function removeProximalReference() {
    const analysis = ensureAnalysisState();
    if (!analysis?.lesion || !Number.isFinite(analysis.lesion.proximalRefIndex)) {
      return;
    }
    recordHistoryStep("remove proximal reference");
    analysis.lesion.proximalRefIndex = null;
    updateLesionMeasurements(analysis);
    updateUi();
    scheduleRender();
    setStatus("Proximal reference removed. Measurements now use the distal reference only.");
  }

  function moveProfileMarker(event) {
    const analysis = ensureAnalysisState();
    const geometry = state.profileGeometry;
    if (!analysis?.lesion || !geometry) {
      return;
    }
    const point = getCanvasRelativePoint(event, els.profileCanvas);
    const t = clamp((point.x - geometry.marginLeft) / Math.max(1, geometry.plotWidth), 0, 1);
    const index = clamp(Math.round(t * (geometry.sampleCount - 1)), 0, geometry.sampleCount - 1);
    setLesionMarkerIndex(analysis, state.dragging.key, index);
    updateLesionMeasurements(analysis);
    updateUi();
    scheduleRender();
  }

  function updateWindowingFromPointer(event) {
    const frame = state.lastRenderedFrame;
    if (!frame || !state.dragging?.startScreen) {
      return;
    }
    const screen = getCanvasRelativePoint(event, els.overlayCanvas);
    const deltaX = screen.x - state.dragging.startScreen.x;
    const deltaY = screen.y - state.dragging.startScreen.y;
    const baseWidth = Math.max(1e-6, state.dragging.startBaseWidth || frame.high - frame.low || 1);
    const widthDelta = (deltaX / Math.max(1, els.overlayCanvas.width)) * baseWidth * 2.4;
    const centerDelta = (-deltaY / Math.max(1, els.overlayCanvas.height)) * baseWidth * 1.8;
    const view = getActiveViewState();
    view.windowWidth = Math.max(baseWidth * 0.02, state.dragging.startWindowWidth + widthDelta);
    view.windowCenter = state.dragging.startWindowCenter + centerDelta;
    persistActiveSeriesState();
    els.interactionReadout.textContent = `Drag on the ICA image to adjust windowing for this series. ${getWindowingSummary(frame, view)}.`;
    scheduleRender();
  }

  function handleGlobalPointerMove(event) {
    updatePointerReadout(event).catch(() => {});
    if (!state.dragging) {
      return;
    }

    if (state.dragging.kind === "profileMarker") {
      moveProfileMarker(event);
      return;
    }

    if (state.dragging.kind === "pan") {
      const screen = getCanvasRelativePoint(event, els.overlayCanvas);
      const view = getActiveViewState();
      view.panX = state.dragging.startPanX + (screen.x - state.dragging.startScreen.x);
      view.panY = state.dragging.startPanY + (screen.y - state.dragging.startScreen.y);
      persistActiveSeriesState();
      scheduleRender();
      return;
    }

    if (state.dragging.kind === "windowing") {
      updateWindowingFromPointer(event);
      return;
    }

    const point = getImagePointFromEvent(event);
    if (!point || !state.canvasTransform) {
      return;
    }
    const clampedPoint = {
      x: clamp(point.x, 0, state.canvasTransform.columns - 1),
      y: clamp(point.y, 0, state.canvasTransform.rows - 1),
    };

    if (state.dragging.kind === "anchor") {
      moveAnchor(clampedPoint);
    } else if (state.dragging.kind === "borderHint") {
      moveBorderHint(clampedPoint);
    } else if (state.dragging.kind === "calibrationPoint") {
      moveCalibrationPoint(clampedPoint);
    } else if (state.dragging.kind === "drawStroke") {
      const lastPoint = state.dragging.points[state.dragging.points.length - 1];
      if (!lastPoint || distance(lastPoint, clampedPoint) >= 1.5) {
        state.dragging.points.push(clampedPoint);
        scheduleRender();
      }
    } else if (state.dragging.kind === "centerlineControl") {
      moveCenterlineControl(clampedPoint);
    } else if (state.dragging.kind === "borderControl") {
      moveBorderControl(clampedPoint);
    } else if (state.dragging.kind === "borderBrush") {
      applyAggressiveBorderBrush(clampedPoint, state.dragging.side);
    } else if (state.dragging.kind === "lesionMarkerImage") {
      moveLesionMarkerOnImage(clampedPoint);
    } else if (state.dragging.kind === "lesionCursorImage") {
      moveLesionCursorOnImage(clampedPoint);
    }
  }

  function handleGlobalPointerUp(event) {
    if (state.dragging?.kind === "windowing") {
      const frame = state.lastRenderedFrame;
      if (frame) {
        setStatus(`Windowing updated. ${getWindowingSummary(frame, getActiveViewState())}.`);
      } else {
        setStatus("Windowing updated.");
      }
    } else if (state.dragging?.kind === "drawStroke") {
      const targetMode = state.dragging.targetMode;
      const strokeSide = state.dragging.side;
      const committed = commitDrawStroke();
      if (committed) {
        updateUi();
        scheduleRender();
        setStatus(
          targetMode === MODES.borders
            ? `Draw stroke merged smoothly into the ${strokeSide || "selected"} border contour.`
            : "Draw stroke merged smoothly into the centerline."
        );
      } else {
        setStatus("The draw stroke was too short to apply.", "warning");
      }
    }
    if (state.dragging?.kind === "profileMarker" && typeof els.profileCanvas?.releasePointerCapture === "function") {
      try {
        if (Number.isFinite(event?.pointerId) && els.profileCanvas.hasPointerCapture?.(event.pointerId)) {
          els.profileCanvas.releasePointerCapture(event.pointerId);
        }
      } catch (_error) {
        // Ignore release failures when the pointer is no longer active.
      }
    }
    state.dragging = null;
  }

  function drawExportCard(context, rect, title, subtitle, options) {
    const compactHeader = options?.compactHeader === true;
    const titleY = rect.y + (compactHeader ? 26 : 30);
    const subtitleY = rect.y + (compactHeader ? 44 : 52);
    const contentTop = rect.y + (compactHeader ? 56 : 72);
    const bottomPadding = compactHeader ? 14 : 18;

    context.fillStyle = "rgba(12, 28, 35, 0.96)";
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    context.strokeStyle = "rgba(145, 181, 201, 0.16)";
    context.lineWidth = 1;
    context.strokeRect(rect.x, rect.y, rect.width, rect.height);

    context.fillStyle = "#f2f7f6";
    context.font = `${compactHeader ? 700 : 700} ${compactHeader ? 18 : 20}px Aptos, sans-serif`;
    context.fillText(title, rect.x + 20, titleY);
    if (subtitle) {
      context.fillStyle = "rgba(214, 229, 227, 0.72)";
      context.font = `${compactHeader ? 12 : 14}px Aptos, sans-serif`;
      context.fillText(subtitle, rect.x + 20, subtitleY);
    }

    return {
      x: rect.x + 18,
      y: contentTop,
      width: rect.width - 36,
      height: rect.height - (contentTop - rect.y) - bottomPadding,
    };
  }

  function getExportAnalysisBounds(frame, analysis) {
    if (!frame || !analysis?.centerline?.length) {
      return null;
    }

    const points = [...analysis.centerline];
    if (analysis.borderLeft?.length === analysis.centerline.length) {
      points.push(...analysis.borderLeft);
    }
    if (analysis.borderRight?.length === analysis.centerline.length) {
      points.push(...analysis.borderRight);
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    points.forEach((point) => {
      if (!point) {
        return;
      }
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return null;
    }

    const width = Math.max(24, maxX - minX);
    const height = Math.max(24, maxY - minY);
    const padding = Math.max(32, Math.max(width, height) * 0.32);
    return {
      minX: clamp(minX - padding, 0, frame.columns - 1),
      minY: clamp(minY - padding, 0, frame.rows - 1),
      maxX: clamp(maxX + padding, 0, frame.columns - 1),
      maxY: clamp(maxY + padding, 0, frame.rows - 1),
    };
  }

  function getExportViewport(frame, contentRect, analysis) {
    const bounds = getExportAnalysisBounds(frame, analysis);
    if (!bounds) {
      const scale = Math.min(contentRect.width / frame.columns, contentRect.height / frame.rows);
      const drawWidth = frame.columns * scale;
      const drawHeight = frame.rows * scale;
      const panelX = contentRect.x + (contentRect.width - drawWidth) / 2;
      const panelY = contentRect.y + (contentRect.height - drawHeight) / 2;
      return {
        cropX: 0,
        cropY: 0,
        cropWidth: frame.columns,
        cropHeight: frame.rows,
        panelX,
        panelY,
        drawWidth,
        drawHeight,
        scale,
        offsetX: panelX,
        offsetY: panelY,
      };
    }

    const aspect = contentRect.width / Math.max(1, contentRect.height);
    let cropWidth = Math.max(64, bounds.maxX - bounds.minX);
    let cropHeight = Math.max(64, bounds.maxY - bounds.minY);
    if (cropWidth / cropHeight > aspect) {
      cropHeight = cropWidth / aspect;
    } else {
      cropWidth = cropHeight * aspect;
    }
    cropWidth = Math.min(frame.columns, cropWidth);
    cropHeight = Math.min(frame.rows, cropHeight);

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const cropX = clamp(centerX - cropWidth / 2, 0, frame.columns - cropWidth);
    const cropY = clamp(centerY - cropHeight / 2, 0, frame.rows - cropHeight);
    const scale = Math.min(contentRect.width / cropWidth, contentRect.height / cropHeight);
    const drawWidth = cropWidth * scale;
    const drawHeight = cropHeight * scale;
    const panelX = contentRect.x + (contentRect.width - drawWidth) / 2;
    const panelY = contentRect.y + (contentRect.height - drawHeight) / 2;

    return {
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      panelX,
      panelY,
      drawWidth,
      drawHeight,
      scale,
      offsetX: panelX - cropX * scale,
      offsetY: panelY - cropY * scale,
    };
  }

  function drawExportFramePanel(context, frame, panelRect, title, subtitle, options) {
    const contentRect = drawExportCard(context, panelRect, title, subtitle);
    const viewport = getExportViewport(frame, contentRect, options?.analysis);

    context.fillStyle = "#0d1d23";
    context.fillRect(contentRect.x, contentRect.y, contentRect.width, contentRect.height);
    context.drawImage(
      buildFrameCanvas(frame, options?.view),
      viewport.cropX,
      viewport.cropY,
      viewport.cropWidth,
      viewport.cropHeight,
      viewport.panelX,
      viewport.panelY,
      viewport.drawWidth,
      viewport.drawHeight
    );

    if (options?.withOverlay) {
      drawOverlay(
        context,
        {
          scale: viewport.scale,
          drawWidth: viewport.drawWidth,
          drawHeight: viewport.drawHeight,
          offsetX: viewport.offsetX,
          offsetY: viewport.offsetY,
          columns: frame.columns,
          rows: frame.rows,
        },
        {
          showHandles: false,
          forceAnalysisVisible: true,
          analysis: options.analysis,
          overlayVisibility: options.overlayVisibility,
        }
      );
    }
  }

  function buildReportExportEntries() {
    const entries = getAllReportEntries();
    if (!entries.length) {
      throw new Error("No measurements are available yet.");
    }
    return entries.map((entry, index) => {
      const series = getSeriesById(entry.seriesId);
      const analysis = entry.analysis;
      const frameDescriptor = series?.frames?.[entry.frameIndex] || null;
      const record = frameDescriptor?.record || null;
      if (!series || !analysis?.measurements || !frameDescriptor) {
        throw new Error("One of the saved stenoses can no longer be resolved for export.");
      }
      return {
        ...entry,
        exportIndex: index + 1,
        series,
        analysis,
        frameDescriptor,
        record,
        localization: getLocalizationSummary(entry),
        stenosisLabel: safeString(entry.lesionLabel || analysis?.lesionLabel),
      };
    });
  }

  function buildReportEntryTitle(entry) {
    const analysisCategory = safeString(entry?.analysisCategory || inferAnalysisCategory(entry));
    const segmentDisplay =
      entry.segmentCode && entry.segmentLabel
        ? formatSegmentOptionLabel({ code: entry.segmentCode, label: entry.segmentLabel })
        : "";
    const selectionDisplay =
      isHierarchicalVascularCategory(analysisCategory)
        ? segmentDisplay || entry.vesselLabel || "Vessel"
        : [entry.vesselLabel || "Vessel", segmentDisplay].filter(Boolean).join(" · ");
    return [entry.seriesLabel || "Series", selectionDisplay, entry.lesionLabel || "", `Frame ${entry.frameNumber}`]
      .filter(Boolean)
      .join(" · ");
  }

  function drawExportMetricList(context, contentRect, metrics, calibrationDetail, options) {
    const columns = clamp(Math.round(options?.columns || 1), 1, 2);
    const columnGap = columns > 1 ? 18 : 0;
    const columnWidth = (contentRect.width - columnGap * (columns - 1)) / columns;
    const rowHeight = columns > 1 ? 30 : 34;
    metrics.forEach(([label, value], index) => {
      const columnIndex = index % columns;
      const rowIndex = Math.floor(index / columns);
      const metricX = contentRect.x + columnIndex * (columnWidth + columnGap);
      const metricY = contentRect.y + 4 + rowIndex * rowHeight;
      context.fillStyle = "rgba(158, 181, 180, 0.9)";
      context.font = `${columns > 1 ? 9 : 10}px Aptos, sans-serif`;
      context.fillText(label.toUpperCase(), metricX, metricY);
      context.fillStyle = "#f2f7f6";
      context.font = `${columns > 1 ? 700 : 700} ${columns > 1 ? 15 : 17}px Aptos, sans-serif`;
      context.fillText(String(value), metricX, metricY + (columns > 1 ? 17 : 20));
    });

    const rowCount = Math.ceil(metrics.length / columns);
    const detailY = contentRect.y + 8 + rowCount * rowHeight;
    context.fillStyle = "rgba(214, 229, 227, 0.72)";
    context.font = "11px Aptos, sans-serif";
    context.fillText("Calibration Detail", contentRect.x, detailY);
    context.fillStyle = "#f2f7f6";
    context.font = "12px Aptos, sans-serif";
    wrapExportText(context, calibrationDetail, contentRect.x, detailY + 16, contentRect.width, 14);
  }

  function getStudyIdFilenameSegment(studyId) {
    const text = safeString(studyId);
    return text ? `study_${slugify(text, "study")}_` : "";
  }

  function buildLesionFilename(entry, label, extension, studyId) {
    const patientSlug = slugify(entry.patientId || entry.patientName || "patient", "patient");
    const seriesSlug = slugify(entry.seriesLabel || "series", "series");
    const vesselSlug = slugify(entry.vesselLabel || "vessel", "vessel");
    const segmentSlug =
      entry.segmentCode && entry.segmentLabel
        ? slugify(`sg_${entry.segmentCode}_${entry.segmentLabel}`, `sg_${entry.segmentCode}`)
        : "";
    const stenosisSlug = slugify(entry.lesionLabel || `stenosis_${entry.exportIndex}`, `stenosis_${entry.exportIndex}`);
    return `hagrad_qca_${getStudyIdFilenameSegment(studyId)}${patientSlug}_${seriesSlug}_${vesselSlug}${segmentSlug ? `_${segmentSlug}` : ""}_${stenosisSlug}_${label}_frame_${entry.frameNumber}.${extension}`;
  }

  async function exportSingleLesionPng(entry, options) {
    const frame = entry.frame || (await decodeFrame(entry.frameDescriptor));
    const analysis = entry.analysis;
    const series = entry.series;
    const measurements = analysis.measurements;
    const calibration = getActiveCalibration(series, analysis);
    const units = getMeasurementUnits(series, analysis);
    const localization = entry.localization || getLocalizationSummary(entry);
    const stenosisLabel = safeString(entry.stenosisLabel || entry.lesionLabel || analysis?.lesionLabel) || "—";
    const studyId = safeString(options?.studyId);
    const researchStudy = getSelectedExportStudyMetadata();
    const exportStudyLine = [
      studyId ? `Study ID ${studyId}` : "",
      researchStudy.displayLabel ? `Research Study ${researchStudy.displayLabel}` : "",
    ]
      .filter(Boolean)
      .join(" • ");
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = 1760;
    exportCanvas.height = 1180;
    const context = exportCanvas.getContext("2d");
    context.fillStyle = "#071318";
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    const exportTitle = buildReportEntryTitle(entry);
    context.fillStyle = "#f2f7f6";
    context.font = "700 36px Aptos, sans-serif";
    context.fillText("HAGRad QCA", 48, 54);
    context.font = "18px Aptos, sans-serif";
    context.fillStyle = "rgba(214, 229, 227, 0.78)";
    context.fillText(exportTitle, 48, 80);
    if (exportStudyLine) {
      context.fillText(exportStudyLine, 48, 104);
    }

    const topRowY = exportStudyLine ? 128 : 112;
    const imagePanelWidth = 820;
    const imagePanelHeight = 706;
    const panelGap = 24;
    const bottomRowY = topRowY + imagePanelHeight + 20;
    const metricsWidth = 500;
    const metricsHeight = 300;
    const profileWidth = imagePanelWidth;
    const profileHeight = metricsHeight;
    const profileX = 48 + imagePanelWidth + panelGap;

    drawExportFramePanel(
      context,
      frame,
      { x: 48, y: topRowY, width: imagePanelWidth, height: imagePanelHeight },
      "ICA Still Frame",
      "Without measurement overlay",
      { withOverlay: false, analysis, overlayVisibility: state.overlayVisibility, view: entry.viewSnapshot }
    );
    drawExportFramePanel(
      context,
      frame,
      { x: 48 + imagePanelWidth + panelGap, y: topRowY, width: imagePanelWidth, height: imagePanelHeight },
      "QCA Still Frame",
      "With current overlay selection",
      { withOverlay: true, analysis, overlayVisibility: state.overlayVisibility, view: entry.viewSnapshot }
    );

    const metricsContent = drawExportCard(
      context,
      { x: 48, y: bottomRowY, width: metricsWidth, height: metricsHeight },
      "Measurements",
      exportTitle
    );
    const metrics = [
      ["Series", series.label || "—"],
      ["Vessel", localization.vesselLabel || "—"],
      ["Segment", localization.segmentDisplay],
      ["Stenosis", stenosisLabel],
      ["Calibration", getCalibrationSummary(calibration).status],
      ["MLD", formatValue(measurements.mld, units, 2)],
      ["Reference", formatValue(measurements.referenceDiameter, units, 2)],
      ["%DS", formatPercent(measurements.percentDiameterStenosis)],
      ["Stenosis Length", formatValue(measurements.lesionLength, units, 1)],
    ];
    drawExportMetricList(context, metricsContent, metrics, getCalibrationSummary(calibration).detail, {
      columns: 2,
    });

    const profilePanel = drawExportCard(
      context,
      { x: profileX, y: bottomRowY, width: profileWidth, height: profileHeight },
      "Diameter Profile",
      `MLD ${formatValue(measurements.mld, units, 2)} · reference ${formatValue(measurements.referenceDiameter, units, 2)} · stenosis ${formatPercent(
        measurements.percentDiameterStenosis
      )}`,
      { compactHeader: true }
    );
    const profileCanvas = document.createElement("canvas");
    profileCanvas.width = Math.max(1, Math.round(profilePanel.width));
    profileCanvas.height = Math.max(1, Math.round(profilePanel.height));
    renderProfileChart(profileCanvas, {
      fontScale: 0.88,
      analysis,
      series,
    });
    context.drawImage(profileCanvas, profilePanel.x, profilePanel.y, profilePanel.width, profilePanel.height);

    const blob = await new Promise((resolve, reject) => {
      exportCanvas.toBlob((result) => {
        if (!result) {
          reject(new Error("PNG export failed."));
          return;
        }
        resolve(result);
      }, "image/png");
    });

    const filename = buildLesionFilename(entry, "qca_analysis", "png", studyId);
    if (options?.returnFile) {
      return { filename, blob };
    }
    await downloadExportBundle(
      [{ filename, blob }],
      window.HAGRadZip?.zipNameFrom ? window.HAGRadZip.zipNameFrom(filename) : buildLesionFilename(entry, "qca_analysis", "zip", studyId),
      { patientStudyId: studyId }
    );
    if (!options?.silent) {
      setStatus(`Stenosis PNG exported as a ZIP for ${exportTitle}.`);
    }
    return filename;
  }

  async function exportLesionPngSet(entries, options) {
    const filenames = [];
    const files = [];
    for (const entry of entries) {
      const result = await exportSingleLesionPng(entry, { silent: true, studyId: options?.studyId, returnFile: Boolean(options?.returnFiles) });
      if (options?.returnFiles) {
        files.push(result);
        filenames.push(result.filename);
      } else {
        filenames.push(result);
      }
    }
    if (options?.returnFiles) {
      return files;
    }
    if (!options?.silent) {
      setStatus(`Exported ${filenames.length} stenosis PNG image${filenames.length === 1 ? "" : "s"}.`);
    }
    return filenames;
  }

  async function exportAnalyzedPng(options) {
    const entries = buildReportExportEntries();
    const studyId = safeString(options?.studyId);
    const researchStudy = getSelectedExportStudyMetadata();
    const exportStudyLine = [
      studyId ? `Study ID ${studyId}` : "",
      researchStudy.displayLabel ? `Research Study ${researchStudy.displayLabel}` : "",
    ]
      .filter(Boolean)
      .join(" • ");
    const resolvedEntries = await Promise.all(
      entries.map(async (entry) => ({
        ...entry,
        frame: await decodeFrame(entry.frameDescriptor),
      }))
    );

    const exportCanvas = document.createElement("canvas");
    const sectionHeight = 916;
    const sectionGap = 28;
    const headerHeight = exportStudyLine ? 156 : 132;
    exportCanvas.width = 1760;
    exportCanvas.height = headerHeight + resolvedEntries.length * sectionHeight + Math.max(0, resolvedEntries.length - 1) * sectionGap + 36;
    const context = exportCanvas.getContext("2d");
    context.fillStyle = "#071318";
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    const primaryEntry = resolvedEntries[0];
    const patientLine = [primaryEntry.patientName || "", primaryEntry.patientId ? `ID ${primaryEntry.patientId}` : ""]
      .filter(Boolean)
      .join(" · ");

    context.fillStyle = "#f2f7f6";
    context.font = "700 36px Aptos, sans-serif";
    context.fillText("HAGRad QCA Report", 48, 56);
    context.font = "18px Aptos, sans-serif";
    context.fillStyle = "rgba(214, 229, 227, 0.78)";
    context.fillText(`${formatLesionCount(resolvedEntries.length)} included across the current study export.`, 48, 84);
    if (patientLine) {
      context.fillText(patientLine, 48, 108);
    }
    if (exportStudyLine) {
      context.fillText(exportStudyLine, 48, patientLine ? 132 : 108);
    }

    resolvedEntries.forEach((entry, index) => {
      const sectionY = headerHeight + index * (sectionHeight + sectionGap);
      const analysis = entry.analysis;
      const series = entry.series;
      const measurements = analysis.measurements;
      const calibration = getActiveCalibration(series, analysis);
      const units = getMeasurementUnits(series, analysis);
      const localization = entry.localization || getLocalizationSummary(entry);
      const stenosisLabel = safeString(entry.stenosisLabel || entry.lesionLabel || analysis?.lesionLabel) || "—";
      const entryTitle = buildReportEntryTitle(entry);
      const topRowY = sectionY + 72;
      const imagePanelWidth = 820;
      const imagePanelHeight = 520;
      const panelGap = 24;
      const bottomRowY = topRowY + imagePanelHeight + 22;
      const metricsWidth = 500;
      const metricsHeight = 270;
      const profileWidth = imagePanelWidth;
      const profileHeight = metricsHeight;
      const profileX = 48 + imagePanelWidth + panelGap;

      context.fillStyle = "#f2f7f6";
      context.font = "700 22px Aptos, sans-serif";
      context.fillText(`Stenosis ${entry.exportIndex}`, 48, sectionY + 24);
      context.fillStyle = "rgba(214, 229, 227, 0.78)";
      context.font = "16px Aptos, sans-serif";
      context.fillText(entryTitle, 48, sectionY + 48);

      drawExportFramePanel(
        context,
        entry.frame,
        { x: 48, y: topRowY, width: imagePanelWidth, height: imagePanelHeight },
        "ICA Still Frame",
        "Without measurement overlay",
        { withOverlay: false, analysis, overlayVisibility: state.overlayVisibility, view: entry.viewSnapshot }
      );
      drawExportFramePanel(
        context,
        entry.frame,
        { x: 48 + imagePanelWidth + panelGap, y: topRowY, width: imagePanelWidth, height: imagePanelHeight },
        "QCA Still Frame",
        "With current overlay selection",
        { withOverlay: true, analysis, overlayVisibility: state.overlayVisibility, view: entry.viewSnapshot }
      );

      const metricsContent = drawExportCard(
        context,
        { x: 48, y: bottomRowY, width: metricsWidth, height: metricsHeight },
        "Measurements",
        entryTitle
      );
      const metrics = [
        ["Series", series.label || "—"],
        ["Vessel", localization.vesselLabel || "—"],
        ["Segment", localization.segmentDisplay],
        ["Stenosis", stenosisLabel],
        ["Frame", entry.frameNumber],
        ["Calibration", getCalibrationSummary(calibration).status],
        ["MLD", formatValue(measurements.mld, units, 2)],
        ["Reference", formatValue(measurements.referenceDiameter, units, 2)],
        ["%DS", formatPercent(measurements.percentDiameterStenosis)],
        ["Stenosis Length", formatValue(measurements.lesionLength, units, 1)],
      ];
      drawExportMetricList(context, metricsContent, metrics, getCalibrationSummary(calibration).detail, {
        columns: 2,
      });

      const profileCanvas = document.createElement("canvas");
      const profilePanel = drawExportCard(
        context,
        { x: profileX, y: bottomRowY, width: profileWidth, height: profileHeight },
        "Diameter Profile",
        `MLD ${formatValue(measurements.mld, units, 2)} · reference ${formatValue(measurements.referenceDiameter, units, 2)} · stenosis ${formatPercent(
          measurements.percentDiameterStenosis
        )}`,
        { compactHeader: true }
      );
      profileCanvas.width = Math.max(1, Math.round(profilePanel.width));
      profileCanvas.height = Math.max(1, Math.round(profilePanel.height));
      renderProfileChart(profileCanvas, {
        fontScale: 0.86,
        analysis,
        series,
      });
      context.drawImage(profileCanvas, profilePanel.x, profilePanel.y, profilePanel.width, profilePanel.height);
    });

    const blob = await new Promise((resolve, reject) => {
      exportCanvas.toBlob((result) => {
        if (!result) {
          reject(new Error("PNG export failed."));
          return;
        }
        resolve(result);
      }, "image/png");
    });

    const filename = buildReportFilename("qca_report", "png", resolvedEntries.length, studyId);
    if (options?.returnFile) {
      return { filename, blob };
    }
    await downloadExportBundle(
      [{ filename, blob }],
      window.HAGRadZip?.zipNameFrom ? window.HAGRadZip.zipNameFrom(filename) : buildReportFilename("qca_report", "zip", resolvedEntries.length, studyId),
      { patientStudyId: studyId }
    );
    if (!options?.silent) {
      setStatus(`Combined PNG report exported as a ZIP for ${formatLesionCount(resolvedEntries.length)}.`);
    }
    return filename;
  }

  function wrapExportText(context, text, x, startY, maxWidth, lineHeight) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    let line = "";
    let y = startY;
    words.forEach((word) => {
      const nextLine = line ? `${line} ${word}` : word;
      if (context.measureText(nextLine).width > maxWidth && line) {
        context.fillText(line, x, y);
        line = word;
        y += lineHeight;
      } else {
        line = nextLine;
      }
    });
    if (line) {
      context.fillText(line, x, y);
    }
  }

  function blankPlaceholder(value) {
    return value === "—" ? "" : value;
  }

  function xmlEscape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function sanitizeWorksheetName(value, fallback) {
    const text = safeString(value)
      .replace(/[\\/*?:[\]]/g, " ")
      .trim();
    return (text || fallback || "Sheet").slice(0, 31);
  }

  function buildSpreadsheetXmlWorkbook(sheets) {
    const workbookHeader =
      '<?xml version="1.0"?>\n' +
      '<?mso-application progid="Excel.Sheet"?>\n' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
      'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
      'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" ' +
      'xmlns:html="http://www.w3.org/TR/REC-html40">\n' +
      '  <Styles>\n' +
      '    <Style ss:ID="Default" ss:Name="Normal">\n' +
      '      <Alignment ss:Vertical="Center"/>\n' +
      '      <Font ss:FontName="Aptos" ss:Size="10"/>\n' +
      '    </Style>\n' +
      '    <Style ss:ID="Header">\n' +
      '      <Font ss:FontName="Aptos" ss:Size="10" ss:Bold="1" ss:Color="#F7F4FF"/>\n' +
      '      <Interior ss:Color="#5E5566" ss:Pattern="Solid"/>\n' +
      '    </Style>\n' +
      '  </Styles>\n';
    const workbookFooter = "</Workbook>";
    const worksheetXml = (sheets || [])
      .map((sheet) => {
        const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
        const columnCount = Math.max(1, ...rows.map((row) => (Array.isArray(row) ? row.length : 0)));
        const rowXml = rows
          .map((row, rowIndex) => {
            const cells = Array.isArray(row) ? row : [];
            const cellXml = cells
              .map((cell) => {
                const isNumber = typeof cell === "number" && Number.isFinite(cell);
                const value = isNumber ? String(cell) : String(cell ?? "");
                return `        <Cell${rowIndex === 0 ? ' ss:StyleID="Header"' : ""}><Data ss:Type="${
                  isNumber ? "Number" : "String"
                }">${xmlEscape(value)}</Data></Cell>`;
              })
              .join("");
            return `      <Row>\n${cellXml || '        <Cell><Data ss:Type="String"></Data></Cell>'}\n      </Row>`;
          })
          .join("\n");
        return (
          `  <Worksheet ss:Name="${xmlEscape(sanitizeWorksheetName(sheet?.name, "Sheet"))}">\n` +
          `    <Table ss:ExpandedColumnCount="${columnCount}" ss:ExpandedRowCount="${Math.max(1, rows.length)}" x:FullColumns="1" x:FullRows="1">\n` +
          `${rowXml}\n` +
          "    </Table>\n" +
          "  </Worksheet>"
        );
      })
      .join("\n");
    return `${workbookHeader}${worksheetXml}\n${workbookFooter}`;
  }

  function buildResultsWorkbookData(studyId) {
    const entries = buildReportExportEntries();
    const caseSummary = getCaseSummaryMetadata();
    const researchStudy = getSelectedExportStudyMetadata();
    const primarySeries = state.series[0] || null;
    const metadataRows = [
      ["Field", "Value"],
      ["Study ID", studyId],
      ["Research Study ID", researchStudy.id],
      ["Research Study Label", researchStudy.label],
      ["Patient Name", caseSummary.patientName || primarySeries?.patientName || ""],
      ["Patient ID", caseSummary.patientId || primarySeries?.patientId || ""],
      ["Patient Birth Date", blankPlaceholder(formatDate(caseSummary.patientBirthDate))],
      ["Study Date", blankPlaceholder(formatDate(caseSummary.studyDate))],
      ["Study Time", blankPlaceholder(formatTime(caseSummary.studyTime))],
      ["Study Description", caseSummary.studyDescription || ""],
      ["Accession Number", caseSummary.accessionNumber || ""],
      ["Case Series Count", caseSummary.seriesCount],
      ["Case Total Frames", caseSummary.totalFrames],
      ["Case Total Stenoses", caseSummary.totalLesions],
      [
        "Case Estimated Duration (s)",
        Number.isFinite(caseSummary.estimatedStudyDurationSeconds) ? roundTo(caseSummary.estimatedStudyDurationSeconds, 3) : "",
      ],
      [
        "Case Total Dose Area Product",
        Number.isFinite(caseSummary.totalDoseAreaProduct) ? roundTo(caseSummary.totalDoseAreaProduct, 6) : "",
      ],
      ["Case Total Dose Area Product Method", caseSummary.totalDoseAreaProductMethod || ""],
      [
        "Case Total Exposure Time (ms)",
        Number.isFinite(caseSummary.totalExposureTimeMs) ? roundTo(caseSummary.totalExposureTimeMs, 3) : "",
      ],
      ["Case Total Exposure Time Method", caseSummary.totalExposureTimeMethod || ""],
      [
        "Case Total Contrast (mL)",
        Number.isFinite(caseSummary.totalContrastMl) ? roundTo(caseSummary.totalContrastMl, 6) : "",
      ],
      ["Case Total Contrast Method", caseSummary.totalContrastMethod || ""],
      ["Case Total Contrast Source", caseSummary.totalContrastSource || ""],
      [],
      [
        "Series Label",
        "Series Instance UID",
        "Frame Count",
        "Frame Rate (fps)",
        "Series Duration (s)",
        "Spacing (mm/pixel)",
        "Dose Area Product",
        "Exposure Time (ms)",
        "Exposure (mAs)",
        "Primary Angle (deg)",
        "Secondary Angle (deg)",
        "Contrast Agent",
        "Contrast (mL)",
        "Contrast Source",
        "Study Description",
        "Accession Number",
      ],
    ];

    state.series.forEach((series) => {
      metadataRows.push([
        series.label || "",
        series.seriesInstanceUID || "",
        series.frameCount || 0,
        Number.isFinite(series.cineRateFps)
          ? roundTo(series.cineRateFps, 3)
          : Number.isFinite(series.frameTimeMs) && series.frameTimeMs > 0
            ? roundTo(1000 / series.frameTimeMs, 3)
            : "",
        Number.isFinite(computeSeriesDurationSeconds(series)) ? roundTo(computeSeriesDurationSeconds(series), 3) : "",
        Number.isFinite(series.measurementSpacingMm) ? roundTo(series.measurementSpacingMm, 6) : "",
        Number.isFinite(series.doseAreaProduct) ? roundTo(series.doseAreaProduct, 6) : "",
        Number.isFinite(series.exposureTimeMs) ? roundTo(series.exposureTimeMs, 3) : "",
        Number.isFinite(series.exposureMas) ? roundTo(series.exposureMas, 6) : "",
        Number.isFinite(series.primaryAngle) ? roundTo(series.primaryAngle, 3) : "",
        Number.isFinite(series.secondaryAngle) ? roundTo(series.secondaryAngle, 3) : "",
        series.contrastBolusAgent || "",
        Number.isFinite(getSeriesContrastValue(series)) ? roundTo(getSeriesContrastValue(series), 6) : "",
        getSeriesContrastSource(series),
        series.studyDescription || "",
        series.accessionNumber || "",
      ]);
    });

    const measurementRows = [
      [
        "study_id",
        "research_study_id",
        "research_study_label",
        "report_index",
        "series_label",
        "series_instance_uid",
        "vessel_label",
        "segment_code",
        "segment_label",
        "stenosis_label",
        "frame_number",
        "patient_name",
        "patient_id",
        "study_date",
        "study_time",
        "acquisition_date",
        "acquisition_time",
        "source_file",
        "sop_instance_uid",
        "calibration_method",
        "calibration_label",
        "calibration_french_size",
        "calibration_mm_per_pixel",
        "calibration_source_frame",
        "units",
        "mld",
        "reference_diameter",
        "percent_diameter_stenosis",
        "stenosis_length",
        "proximal_reference_diameter",
        "distal_reference_diameter",
        "mld_sample_index",
        "dose_area_product",
        "exposure_time_ms",
        "exposure_mas",
        "primary_angle_deg",
        "secondary_angle_deg",
      ],
    ];

    entries.forEach((entry) => {
      const { analysis, series, record } = entry;
      const measurements = analysis.measurements;
      const calibration = getActiveCalibration(series, analysis);
      const units = getMeasurementUnits(series, analysis);
      const localization = entry.localization || getLocalizationSummary(entry);
      const stenosisLabel = safeString(entry.stenosisLabel || entry.lesionLabel || analysis?.lesionLabel);
      measurementRows.push([
        studyId,
        researchStudy.id,
        researchStudy.label,
        entry.exportIndex,
        series.label || "",
        series.seriesInstanceUID || "",
        localization.vesselLabel || "Vessel",
        localization.segmentCode || "",
        localization.segmentLabel || "",
        stenosisLabel,
        entry.frameNumber,
        series.patientName || "",
        series.patientId || "",
        blankPlaceholder(formatDate(series.studyDate)),
        blankPlaceholder(formatTime(series.studyTime)),
        blankPlaceholder(formatDate(record?.acquisitionDate)),
        blankPlaceholder(formatTime(record?.acquisitionTime)),
        record?.file?.name || "",
        record?.sopInstanceUID || "",
        calibration?.method || "none",
        calibration?.label || "",
        Number.isFinite(calibration?.knownFrenchSize) ? calibration.knownFrenchSize : "",
        calibration?.mmPerPixel ? roundTo(calibration.mmPerPixel, 6) : "",
        Number.isFinite(calibration?.sourceFrameIndex) ? calibration.sourceFrameIndex + 1 : "",
        units,
        roundTo(measurements.mld, 4),
        roundTo(measurements.referenceDiameter, 4),
        roundTo(measurements.percentDiameterStenosis, 4),
        roundTo(measurements.lesionLength, 4),
        Number.isFinite(measurements.proximalReferenceDiameter) ? roundTo(measurements.proximalReferenceDiameter, 4) : "",
        roundTo(measurements.distalReferenceDiameter, 4),
        measurements.mldSampleIndex + 1,
        Number.isFinite(record?.doseAreaProduct)
          ? roundTo(record.doseAreaProduct, 6)
          : Number.isFinite(series.doseAreaProduct)
            ? roundTo(series.doseAreaProduct, 6)
            : "",
        Number.isFinite(record?.exposureTimeMs)
          ? roundTo(record.exposureTimeMs, 3)
          : Number.isFinite(series.exposureTimeMs)
            ? roundTo(series.exposureTimeMs, 3)
            : "",
        Number.isFinite(record?.exposureMas)
          ? roundTo(record.exposureMas, 6)
          : Number.isFinite(series.exposureMas)
            ? roundTo(series.exposureMas, 6)
            : "",
        Number.isFinite(series.primaryAngle) ? roundTo(series.primaryAngle, 3) : "",
        Number.isFinite(series.secondaryAngle) ? roundTo(series.secondaryAngle, 3) : "",
      ]);
    });

    return { entries, metadataRows, measurementRows };
  }

  async function exportResultsWorkbook(options) {
    const studyId = safeString(options?.studyId);
    const { entries, metadataRows, measurementRows } = buildResultsWorkbookData(studyId);
    const workbookXml = buildSpreadsheetXmlWorkbook([
      { name: "Metadata", rows: metadataRows },
      { name: "Stenosis Measurements", rows: measurementRows },
    ]);
    const blob = new Blob([workbookXml], {
      type: "application/vnd.ms-excel",
    });
    const filename = buildReportFilename("qca_results", "xls", entries.length, studyId);
    if (options?.returnFile) {
      return { filename, blob };
    }
    await downloadExportBundle(
      [{ filename, blob }],
      window.HAGRadZip?.zipNameFrom ? window.HAGRadZip.zipNameFrom(filename) : buildReportFilename("qca_results", "zip", entries.length, studyId),
      { patientStudyId: studyId }
    );
    if (!options?.silent) {
      setStatus(`Excel results exported as a ZIP for ${formatLesionCount(entries.length)}.`);
    }
    return filename;
  }

  async function exportCombinedResults(options) {
    const initialEntries = buildReportExportEntries();
    if (initialEntries.length === 1) {
      const confirmed = await requestLocalizationConfirmationForSingleExport(initialEntries[0]);
      if (!confirmed) {
        return null;
      }
    }
    const studyId = safeString(options?.studyId) || requestStudyIdForExport();
    if (!studyId) {
      return null;
    }
    const entries = buildReportExportEntries();
    const workbookFile = await exportResultsWorkbook({ silent: true, studyId, returnFile: true });
    const reportPngFile = await exportAnalyzedPng({ silent: true, studyId, returnFile: true });
    let lesionPngFiles = [];
    if (options?.includeIndividualPngs) {
      lesionPngFiles = await exportLesionPngSet(entries, { silent: true, studyId, returnFiles: true });
    }
    const portableFile = options?.includePortableBundle
      ? await exportPortableBundle({ studyId, silent: true, returnFile: true })
      : null;
    const bundleFiles = [reportPngFile, workbookFile, ...lesionPngFiles, portableFile].filter(Boolean);
    const zipFilename = buildReportFilename("qca_export_bundle", "zip", entries.length, studyId);
    const bundleResult = await downloadExportBundle(bundleFiles, zipFilename, { patientStudyId: studyId });
    const lesionPngFilenames = lesionPngFiles.map((file) => file.filename);
    const workbookFilename = workbookFile.filename;
    const pngFilename = reportPngFile.filename;
    const bundleFilename = bundleResult.filename;

    if (options?.closeAfterExport) {
      clearStudy({ skipHistory: true });
      setStatus(`Finished case export as ${bundleFilename}. Workspace reset for the next study.`);
      return {
        studyId,
        workbookFilename,
        pngFilename,
        lesionPngFilenames,
        bundleFilename,
      };
    }
    setStatus(`Exported ${bundleFilename} with ${bundleFiles.length} file${bundleFiles.length === 1 ? "" : "s"} for ${formatLesionCount(entries.length)}.`);
    return {
      studyId,
      workbookFilename,
      pngFilename,
      lesionPngFilenames,
      bundleFilename,
    };
  }

  async function finishAndCloseStudy() {
    const entries = buildReportExportEntries();
    const finishOptions = await requestFinishCloseOptions();
    if (!finishOptions) {
      setStatus("Finish and close canceled.", "warning");
      return null;
    }
    recordHistoryStep("finish and close");
    const result = await exportCombinedResults({
      includeIndividualPngs: true,
      includePortableBundle: Boolean(finishOptions.includePortableBundle),
    });
    if (!result) {
      return null;
    }
    clearStudy({ skipHistory: true });
    setStatus(`Finished case export as ${result.bundleFilename}. Workspace reset for the next study.`);
    return {
      ...result,
      lesionCount: entries.length,
    };
  }

  function buildReportFilename(label, extension, lesionCount, studyId) {
    const entries = getAllReportEntries();
    const primaryEntry = entries[0] || null;
    const activeSeries = getActiveSeries();
    const patientSlug = slugify(
      primaryEntry?.patientId || primaryEntry?.patientName || activeSeries?.patientId || activeSeries?.patientName || "patient",
      "patient"
    );
    return `hagrad_qca_${getStudyIdFilenameSegment(studyId)}${patientSlug}_${label}_${lesionCount}_stenoses.${extension}`;
  }

  function downloadBlob(blob, filename, options) {
    persistBlobToExportOutbox(blob, filename, options);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    window.setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 0);
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
          workflow: "qca",
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

  function handleWheel(event) {
    const series = getActiveSeries();
    if (!series?.frames?.length) {
      return;
    }
    if (event.target === els.profileCanvas) {
      return;
    }
    event.preventDefault();

    if ((event.metaKey || event.ctrlKey || state.mode === MODES.zoom) && state.canvasTransform) {
      const screen = getCanvasRelativePoint(event, els.overlayCanvas);
      updateViewZoomFromScreenPoint(screen, event.deltaY > 0 ? 0.92 : 1.08);
      return;
    }

    if (Number.isFinite(state.selectedFrameIndex)) {
      return;
    }

    const delta = event.deltaY > 0 ? 1 : -1;
    setCurrentFrameIndex(state.currentFrameIndex + delta);
  }

  function bindEvents() {
    els.loadDicomButton.addEventListener("click", () => {
      if (state.series.length) {
        els.dicomAddInput.click();
      } else {
        els.dicomInput.click();
      }
    });
    els.loadDicomFolderButton.addEventListener("click", () => {
      if (state.series.length) {
        els.dicomAddFolderInput.click();
      } else {
        els.dicomFolderInput.click();
      }
    });

    els.dicomInput.addEventListener("change", async (event) => {
      try {
        await loadStudyFromFiles(event.target.files);
      } catch (error) {
        console.error(error);
        setStatus(error.message || "DICOM load failed.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.dicomFolderInput.addEventListener("change", async (event) => {
      try {
        await loadStudyFromFiles(event.target.files);
      } catch (error) {
        console.error(error);
        setStatus(error.message || "DICOM folder load failed.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.dicomAddInput.addEventListener("change", async (event) => {
      try {
        await loadStudyFromFiles(event.target.files, { append: true });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Additional DICOM load failed.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.dicomAddFolderInput.addEventListener("change", async (event) => {
      try {
        await loadStudyFromFiles(event.target.files, { append: true });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Additional DICOM folder load failed.", "error");
      } finally {
        event.target.value = "";
      }
    });

    els.clearButton.addEventListener("click", clearStudy);
    els.undoActionButton.addEventListener("click", () => {
      undoLastAction();
    });
    els.redoActionButton.addEventListener("click", () => {
      redoLastAction();
    });
    els.workflowSteps.forEach((stepButton) => {
      stepButton.addEventListener("click", () => {
        jumpToWorkflowStep(stepButton.dataset.step);
      });
    });
    els.frameSlider.addEventListener("input", () => {
      setCurrentFrameIndex(Number.parseInt(els.frameSlider.value, 10) || 0);
    });
    els.selectFrameButton.addEventListener("click", () => {
      selectCurrentFrameForAnalysis();
    });
    els.jumpAnalysisFrameButton.addEventListener("click", () => {
      jumpToAnalysisFrame();
    });
    els.calibrationLabelInput.addEventListener("input", () => {
      const analysis = ensureAnalysisState();
      if (analysis?.calibration?.method === "manualLine" && analysis.calibration.points?.length === 2) {
        try {
          analysis.calibration = computeManualCalibration(analysis.calibration.points[0], analysis.calibration.points[1]);
          refreshMeasurementsAfterCalibrationChange();
        } catch (_error) {}
      }
      updateUi();
      scheduleRender();
    });
    els.calibrationFrenchSelect.addEventListener("change", () => {
      const analysis = ensureAnalysisState();
      if (analysis?.calibration?.method === "manualLine" && analysis.calibration.points?.length === 2) {
        try {
          analysis.calibration = computeManualCalibration(analysis.calibration.points[0], analysis.calibration.points[1]);
          refreshMeasurementsAfterCalibrationChange();
          setStatus(`Manual calibration updated to ${roundTo(analysis.calibration.mmPerPixel, 5)} mm/pixel.`);
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Calibration update failed.", "error");
        }
      }
      updateUi();
      scheduleRender();
    });
    els.displayVisibilityButton.addEventListener("click", () => {
      togglePopover("display");
    });
    els.segmentationReferenceButton.addEventListener("click", () => {
      togglePopover("references");
    });
    els.projectionHelpButton.addEventListener("click", () => {
      openProjectionHelp(0);
    });
    els.projectionHelpCloseButton.addEventListener("click", () => {
      closeProjectionHelp();
    });
    els.projectionHelpBackdrop.addEventListener("click", () => {
      closeProjectionHelp();
    });
    els.projectionHelpPrevButton.addEventListener("click", () => {
      stepProjectionHelp(-1);
    });
    els.projectionHelpNextButton.addEventListener("click", () => {
      stepProjectionHelp(1);
    });
    els.localizationCategorySelect?.addEventListener("change", () => {
      updateLocalizationSelectionUi({
        category: getSelectedLocalizationCategory(),
      });
      updateLocalizationPromptUi();
    });
    els.localizationVesselSelect.addEventListener("change", () => {
      updateLocalizationSelectionUi({
        category: getSelectedLocalizationCategory() || "coronary_native",
        source: {
          vesselLabel: els.localizationVesselSelect.value,
        },
      });
      updateLocalizationPromptUi();
    });
    els.localizationLowerExtSideSelect?.addEventListener("change", () => {
      updateLocalizationSelectionUi({
        category: getSelectedLocalizationCategory(),
        source: {
          lowerExtSide: els.localizationLowerExtSideSelect.value,
        },
      });
      updateLocalizationPromptUi();
    });
    els.localizationLowerExtLevelSelect?.addEventListener("change", () => {
      updateLocalizationSelectionUi({
        category: getSelectedLocalizationCategory(),
        source: {
          lowerExtSide: els.localizationLowerExtSideSelect.value,
          lowerExtLevel: els.localizationLowerExtLevelSelect.value,
        },
      });
      updateLocalizationPromptUi();
    });
    els.localizationSegmentSelect.addEventListener("change", () => {
      updateCabgCustomInputsUi();
      updateLocalizationPromptUi();
    });
    els.localizationCustomLabelInput?.addEventListener("input", () => {
      updateLocalizationPromptUi();
    });
    els.localizationBackdrop.addEventListener("click", () => {
      closeLocalizationPrompt();
    });
    els.localizationCloseButton.addEventListener("click", () => {
      closeLocalizationPrompt();
    });
    els.localizationConfirmButton.addEventListener("click", () => {
      confirmLocalizationPrompt();
    });
    els.finishCloseBackdrop.addEventListener("click", () => {
      closeFinishClosePrompt(null);
    });
    els.finishCloseModalCloseButton.addEventListener("click", () => {
      closeFinishClosePrompt(null);
    });
    els.finishCloseCancelButton.addEventListener("click", () => {
      closeFinishClosePrompt(null);
    });
    els.finishCloseConfirmButton.addEventListener("click", () => {
      confirmFinishClosePrompt();
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
    els.resetWindowingButton.addEventListener("click", () => {
      resetWindowing();
    });
    els.canvasResetWindowButton?.addEventListener("click", () => {
      resetWindowing();
    });
    els.canvasResetViewButton?.addEventListener("click", () => {
      resetCanvasView();
    });
    els.canvasFocusToggleButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      togglePresentationFocus();
    });
    els.canvasFocusExitButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setPresentationFocus(false);
    });
    els.focusWorkflowButtons?.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleFocusSidebarSection(button.dataset.focusSidebarSection);
      });
    });
    els.focusFinishCloseButton?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await finishAndCloseStudy();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Finish and close export failed.", "error");
      }
    });
    els.overlayLayerButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const layer = button.dataset.overlayLayer;
        state.overlayVisibility[layer] = !state.overlayVisibility[layer];
        updateUi();
        scheduleRender();
      });
    });
    els.nextLesionButton.addEventListener("click", () => {
      prepareNextLesion();
    });
    els.pickVesselReferenceButton.addEventListener("click", () => {
      if (!Number.isFinite(state.selectedFrameIndex) || !isAnalysisFrameVisible()) {
        setStatus("Lock a QCA frame and return to it before sampling a vessel tone.", "warning");
        return;
      }
      state.activePopover = "references";
      state.referenceSamplingTarget = state.referenceSamplingTarget === "vessel" ? null : "vessel";
      updateUi();
      scheduleRender();
    });
    els.pickBackgroundReferenceButton.addEventListener("click", () => {
      if (!Number.isFinite(state.selectedFrameIndex) || !isAnalysisFrameVisible()) {
        setStatus("Lock a QCA frame and return to it before sampling a background tone.", "warning");
        return;
      }
      state.activePopover = "references";
      state.referenceSamplingTarget = state.referenceSamplingTarget === "background" ? null : "background";
      updateUi();
      scheduleRender();
    });
    els.clearReferenceTonesButton.addEventListener("click", () => {
      clearReferenceTones();
    });
    els.startCalibrationButton.addEventListener("click", () => {
      try {
        startCalibrationMode();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Calibration setup failed.", "error");
      }
    });
    els.clearCalibrationButton.addEventListener("click", () => {
      clearManualCalibration();
    });
    els.analysisCategorySelect?.addEventListener("change", () => {
      updateMainSelectionUi({
        category: getSelectedAnalysisCategory(),
      });
      ensureAnalysisState();
      persistActiveSeriesState();
      updateUi();
      scheduleRender();
    });
    els.vesselLabelInput.addEventListener("change", () => {
      updateMainSelectionUi({
        category: "coronary_native",
        source: {
          vesselLabel: els.vesselLabelInput.value,
        },
      });
      ensureAnalysisState();
      persistActiveSeriesState();
      updateUi();
      scheduleRender();
    });
    els.lowerExtSideSelect?.addEventListener("change", () => {
      updateMainSelectionUi({
        category: getSelectedAnalysisCategory(),
        source: {
          lowerExtSide: els.lowerExtSideSelect.value,
        },
      });
      ensureAnalysisState();
      persistActiveSeriesState();
      updateUi();
      scheduleRender();
    });
    els.lowerExtLevelSelect?.addEventListener("change", () => {
      updateMainSelectionUi({
        category: getSelectedAnalysisCategory(),
        source: {
          lowerExtSide: els.lowerExtSideSelect.value,
          lowerExtLevel: els.lowerExtLevelSelect.value,
        },
      });
      ensureAnalysisState();
      persistActiveSeriesState();
      updateUi();
      scheduleRender();
    });
    els.segmentLocationSelect.addEventListener("change", () => {
      updateCabgCustomInputsUi();
      ensureAnalysisState();
      persistActiveSeriesState();
      updateUi();
      scheduleRender();
    });
    els.cabgCustomLabelInput?.addEventListener("input", () => {
      ensureAnalysisState();
      persistActiveSeriesState();
      updateUi();
      scheduleRender();
    });
    els.lesionLabelInput.addEventListener("input", () => {
      if (state.analysis) {
        state.analysis.lesionLabel = safeString(els.lesionLabelInput.value);
      }
      persistActiveSeriesState();
      updateUi();
      scheduleRender();
    });
    els.toolButtons.forEach((button) => {
      button.addEventListener("click", () => {
        activateMode(button.dataset.mode);
      });
    });
    els.segmentButton.addEventListener("click", async () => {
      try {
        await segmentCurrentVessel({ resegment: false });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Segmentation failed.", "error");
      }
    });
    els.resegmentButton.addEventListener("click", async () => {
      try {
        await segmentCurrentVessel({ resegment: true });
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Re-segmentation failed.", "error");
      }
    });
    els.undoAnchorButton.addEventListener("click", undoAnchor);
    els.clearSegmentationButton.addEventListener("click", clearSegmentation);
    els.exportResultsButton.addEventListener("click", async () => {
      try {
        await exportCombinedResults();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Combined export failed.", "error");
      }
    });
    els.finishCloseButton.addEventListener("click", async () => {
      try {
        await finishAndCloseStudy();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Finish and close export failed.", "error");
      }
    });

    els.overlayCanvas.addEventListener("pointerdown", handleOverlayPointerDown);
    els.overlayCanvas.addEventListener("auxclick", (event) => {
      if (event.button === 1) {
        event.preventDefault();
      }
    });
    els.overlayCanvas.addEventListener("dblclick", handleOverlayDoubleClick);
    els.overlayCanvas.addEventListener("contextmenu", handleOverlayContextMenu);
    els.overlayCanvas.addEventListener("pointermove", (event) => {
      updatePointerReadout(event).catch(() => {});
    });
    els.overlayCanvas.addEventListener("pointerleave", () => {
      state.pointer = { imageX: null, imageY: null, value: null };
      els.pointerReadout.textContent = "x -, y -, value -";
      if (state.mode === MODES.eraser) {
        scheduleRender();
      }
    });
    els.profileCanvas.addEventListener("pointerdown", handleProfilePointerDown);
    els.profileCanvas.addEventListener("pointermove", updateProfileCursor);
    els.profileCanvas.addEventListener("pointerleave", () => {
      els.profileCanvas.style.cursor = "default";
    });
    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("resize", scheduleRender);
    els.canvasWrap.addEventListener("wheel", handleWheel, { passive: false });

    ["dragenter", "dragover"].forEach((eventName) => {
      els.canvasWrap.addEventListener(eventName, (event) => {
        event.preventDefault();
      });
    });

    els.canvasWrap.addEventListener("drop", async (event) => {
      event.preventDefault();
      try {
        const droppedFiles =
          (await window.HAGRadCore?.collectDroppedFiles?.(event.dataTransfer)) ||
          Array.from(event.dataTransfer?.files || []);
        await loadStudyFromFiles(droppedFiles);
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Dropped DICOM files failed to load.", "error");
      }
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (
        state.presentationFocus &&
        state.focusSidebarOpen &&
        !els.sidebar?.contains(target) &&
        !target.closest?.(".presentation-focus-dock") &&
        !target.closest?.(".canvas-mini-actions")
      ) {
        setFocusSidebarOpen(false);
      }
    });

    document.addEventListener("keydown", async (event) => {
      if (state.finishClosePromptOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeFinishClosePrompt(null);
        } else if (event.key === "Enter") {
          event.preventDefault();
          confirmFinishClosePrompt();
        }
        return;
      }
      if (state.localizationPromptOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeLocalizationPrompt();
        } else if (event.key === "Enter" && !els.localizationConfirmButton.disabled) {
          event.preventDefault();
          confirmLocalizationPrompt();
        }
        return;
      }
      if (event.target?.tagName === "INPUT" || event.target?.tagName === "TEXTAREA") {
        return;
      }
      const key = safeString(event.key).toLowerCase();
      if (state.projectionHelpOpen) {
        if (event.key === "Escape" || key === "h") {
          event.preventDefault();
          closeProjectionHelp();
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          stepProjectionHelp(1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          stepProjectionHelp(-1);
        }
        return;
      }
      if (event.key === "Escape") {
        if (state.activePopover) {
          event.preventDefault();
          state.activePopover = null;
          updateUi();
          return;
        }
        if (state.focusSidebarOpen) {
          event.preventDefault();
          setFocusSidebarOpen(false);
          return;
        }
        const isTransientMode = state.mode === MODES.zoom || state.mode === MODES.windowing || state.mode === MODES.draw;
        if (state.presentationFocus && !isTransientMode) {
          event.preventDefault();
          setPresentationFocus(false);
          return;
        }
        if (isTransientMode) {
          event.preventDefault();
          const resumeMode =
            state.returnMode &&
            state.returnMode !== MODES.zoom &&
            state.returnMode !== MODES.windowing &&
            state.returnMode !== MODES.draw
              ? state.returnMode
              : MODES.anchors;
          activateMode(resumeMode);
          setStatus(`Returned to ${MODE_LABELS[resumeMode] || capitalize(resumeMode)} mode.`);
          return;
        }
      }
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && key === "z") {
        event.preventDefault();
        undoLastAction();
      } else if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        (key === "y" || (event.shiftKey && key === "z"))
      ) {
        event.preventDefault();
        redoLastAction();
      } else if (key === "h") {
        event.preventDefault();
        openProjectionHelp(0);
      } else if (key === "l") {
        event.preventDefault();
        if (!getActiveSeries()?.frames?.length) {
          return;
        }
        if (Number.isFinite(state.selectedFrameIndex)) {
          setStatus(`Frame ${state.selectedFrameIndex + 1} is already locked for QCA analysis.`);
          return;
        }
        selectCurrentFrameForAnalysis();
      } else if (key === "u") {
        event.preventDefault();
        if (!Number.isFinite(state.selectedFrameIndex)) {
          setStatus("No QCA frame is currently locked.", "warning");
          return;
        }
        selectCurrentFrameForAnalysis();
      } else if (key === "z") {
        event.preventDefault();
        activateMode(MODES.zoom);
      } else if (key === "w") {
        event.preventDefault();
        activateMode(MODES.windowing);
      } else if (key === "b") {
        event.preventDefault();
        activateMode(MODES.borders);
      } else if (key === "a") {
        event.preventDefault();
        activateMode(MODES.anchors);
      } else if (key === "s") {
        event.preventDefault();
        activateMode(MODES.lesion);
      } else if (key === "c") {
        event.preventDefault();
        activateMode(MODES.centerline);
      } else if (key === "d") {
        event.preventDefault();
        activateMode(MODES.draw);
      } else if (key === "k") {
        event.preventDefault();
        activateMode(MODES.calibration);
      } else if (key === "e") {
        event.preventDefault();
        activateMode(MODES.eraser);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setCurrentFrameIndex(state.currentFrameIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCurrentFrameIndex(state.currentFrameIndex - 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        activateRelativeSeries(-1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        activateRelativeSeries(1);
      } else if (event.code === "Space") {
        event.preventDefault();
        toggleCinePlayback();
      } else if (event.key === "Enter" && !hasSegmentedVessel()) {
        event.preventDefault();
        try {
          await segmentCurrentVessel({ resegment: false });
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Segmentation failed.", "error");
        }
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (state.mode === MODES.anchors) {
          undoAnchor();
        }
      }
    });
  }

  function init() {
    cacheElements();
    state.projectionHelpOpen = false;
    state.projectionHelpIndex = 0;
    state.localizationPromptOpen = false;
    state.localizationPromptMode = null;
    state.localizationPromptTargetEntryId = null;
    state.finishClosePromptOpen = false;
    localizationPromptResolver = null;
    finishClosePromptResolver = null;
    if (els.projectionHelpModal) {
      els.projectionHelpModal.hidden = true;
    }
    if (els.localizationModal) {
      els.localizationModal.hidden = true;
    }
    if (els.finishCloseModal) {
      els.finishCloseModal.hidden = true;
    }
    document.body.classList.remove("projection-help-open");
    document.body.classList.remove("localization-modal-open");
    document.body.classList.remove("finish-close-modal-open");
    updateMainSelectionUi({
      category: getSelectedAnalysisCategory(),
      preferredVesselLabel: safeString(els.vesselLabelInput?.value) || "LAD",
      preferredSegmentCode: safeString(els.segmentLocationSelect?.value),
    });
    refreshExportStudyOptions().catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not load export studies.", "error");
    });
    bindEvents();
    updatePresentationFocusUi();
    updateUi();
    scheduleRender();
  }

  init();
})();
