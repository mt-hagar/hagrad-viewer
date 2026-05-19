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
  const CIRCULAR_ROI_SEGMENTS = 14;
  const ROI_HANDLE_LIMIT = 8;
  const DEFAULT_CIRCULAR_ROI_RADIUS_MM = 4;
  const MIN_CIRCULAR_ROI_DIAMETER_MM = 0.5;
  const FREEHAND_ROI_SAMPLE_DISTANCE_MM = 0.45;

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

  const DEFAULT_COLLAPSED_SECTIONS = {
    "annotate-actions": true,
    "analysis-export": true,
    "reference-study": true,
    "reference-help": true,
  };

  const SHORTCUT_STORAGE_KEY = "hagrad.ccta_iq.shortcuts.v3";
  const UI_MODE_STORAGE_KEY = "hagrad.ccta_iq.ui_mode.v1";
  const SIDEBAR_TAB_STORAGE_KEY = "hagrad.ccta_iq.sidebar_tab.v1";
  const IQ_TARGET_PROTOCOL_STORAGE_KEY = "hagrad.ccta_iq.roi_target_protocol.v1";
  const IQ_SUBJECTIVE_PROTOCOL_STORAGE_KEY = "hagrad.ccta_iq.subjective_protocol.v1";
  const IQ_STUDY_RULE_SETS_STORAGE_KEY = "hagrad.ccta_iq.study_rule_sets.v1";
  const SIDEBAR_TAB_KEYS = ["case", "study-rules", "annotate", "subjective", "export"];
  const SIDEBAR_TAB_KEY_SET = new Set(SIDEBAR_TAB_KEYS);
  const PROJECT_WORKFLOW_ENABLED = false;
  const SESSION_AUTOSAVE_DELAY_MS = 900;
  const DUPLICATE_CHECK_DELAY_MS = 260;
  const TOOL_HOVER_DELAY_MS = 5000;

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
    { id: "freehandRoi", label: "ROI Draw", defaultKey: "D", defaultMeaning: "Hold the left mouse button and trace a freehand ROI contour" },
    { id: "segmentationRoi", label: "ROI Multiple Click", defaultKey: "Q", defaultMeaning: "Place a smoothed click-by-click ROI" },
    { id: "brushRoi", label: "ROI Brush", defaultKey: "B", defaultMeaning: "Paint a threshold-based ROI" },
    { id: "contourCorrect", label: "Adjust ROI", defaultKey: "A", defaultMeaning: "Adjust part of the selected ROI contour" },
    { id: "eraser", label: "Eraser", defaultKey: "E", defaultMeaning: "Erase or trim annotations" },
    { id: "length", label: "Length", defaultKey: "L", defaultMeaning: "Place a distance measurement" },
    { id: "probe", label: "Probe", defaultKey: "O", defaultMeaning: "Sample one CT value" },
    { id: "arrow", label: "Arrow", defaultKey: "Y", defaultMeaning: "Place an arrow pointer" },
    { id: "text", label: "Text Label", defaultKey: "T", defaultMeaning: "Place a text label" },
    { id: "mprCursor", label: "MPR Coord", defaultKey: "X", defaultMeaning: "Move and rotate the shared MPR crosshair" },
    { id: "windowLevel", label: "WW/WL", defaultKey: "W", defaultMeaning: "Adjust window width and level" },
    { id: "pan", label: "Pan", defaultKey: "M", defaultMeaning: "Move the current viewport" },
    { id: "zoom", label: "Zoom", defaultKey: "Z", defaultMeaning: "Zoom the current viewport" },
    { id: "exportCurrent", label: "Export Current PNG", defaultKey: "J", defaultMeaning: "Export the current viewport as PNG" },
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
    lineProfile: "Draw a 1D HU profile, then refine the stent cutoffs in the profile panel if needed.",
    squareProfile: "Draw a rectangular band profile for cleaner stent analysis and export.",
    freehandRoi: "ROI Draw: hold the left mouse button and trace the ROI freehand, then release to finish it.",
    segmentationRoi: "ROI Multiple Click: place multiple clicks around a target and finish with double click to create a smoothed ROI.",
    brushRoi: "Paint a threshold-aware continuous ROI with grow/shrink refinement.",
    contourCorrect: "Adjust ROI: start on or just beside an ROI contour, it will auto-select that ROI, then redraw the segment you want to replace and release to smooth the correction in.",
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
  const RIGHT_DRAG_SCRUB_HEIGHT_FACTOR = 0.42;
  const RIGHT_CLICK_DOUBLE_MS = 320;

  const PROFILE_GUIDE_STYLES = {
    leftOutsideIndex: { color: "#57c8ff", label: "Outer L" },
    leftPeakIndex: { color: "#7af4a8", label: "Peak L" },
    lumenMinIndex: { color: "#f6f7f9", label: "Lumen" },
    rightPeakIndex: { color: "#7af4a8", label: "Peak R" },
    rightOutsideIndex: { color: "#57c8ff", label: "Outer R" },
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

  const IQ_TARGET_CATEGORY_STYLES = {
    coronary: {
      label: "Signal / Vessel",
      fill: "rgba(253, 186, 144, 0.18)",
      stroke: "#fdba90",
      description: "Signal or vessel ROI",
    },
    background: {
      label: "Background",
      fill: "rgba(189, 148, 126, 0.18)",
      stroke: "#c7a18f",
      description: "Background reference ROI",
    },
    noise: {
      label: "Noise",
      fill: "rgba(188, 196, 208, 0.18)",
      stroke: "#b8c4d0",
      description: "Noise reference ROI",
    },
    other: {
      label: "Other",
      fill: "rgba(210, 198, 235, 0.16)",
      stroke: "#c8b6ff",
      description: "Custom quantitative ROI",
    },
  };
  const IQ_TARGET_COLOR_PALETTE = [
    "#ffe0cf", "#ffd7e1", "#d8f1d2", "#d9ecff",
    "#fdba90", "#ffb2c1", "#bdeab8", "#b7dcff",
    "#ff9a9a", "#f4a8c0", "#8fe6ab", "#93cfff",
    "#c7a18f", "#bf7f99", "#7fc7a1", "#b8c4d0",
  ];
  const IQ_TARGET_METRIC_ROLE_DEFINITIONS = {
    signal: { label: "Signal", category: "coronary", valueKey: "meanHu", unit: "HU", color: "#fdba90" },
    background: { label: "Background", category: "background", valueKey: "meanHu", unit: "HU", color: "#c7a18f" },
    noise: { label: "Noise", category: "noise", valueKey: "sdHu", unit: "HU", color: "#b8c4d0" },
    other: { label: "Other", category: "other", valueKey: "meanHu", unit: "HU", color: "#c8b6ff" },
  };
  const IQ_TARGET_STAT_DEFINITIONS = {
    mean: { label: "Mean HU", valueKey: "meanHu", exportColumn: "mean_hu" },
    sd: { label: "SD HU", valueKey: "sdHu", exportColumn: "sd_hu" },
    min: { label: "Min HU", valueKey: "minHu", exportColumn: "min_hu" },
    max: { label: "Max HU", valueKey: "maxHu", exportColumn: "max_hu" },
  };
  const DEFAULT_IQ_TARGET_STAT_KEYS = ["mean", "sd"];

  const DEFAULT_IQ_ROI_TARGETS_DETAILED = [
    {
      id: "muscle_background_1",
      label: "Muscle Background 1",
      description: "Background reference",
      roiCategory: "background",
      vessel: "",
      region: "Muscle",
      segment: "",
      locationGroup: "background",
      fill: "rgba(189, 148, 126, 0.18)",
      stroke: "#c7a18f",
    },
    {
      id: "muscle_background_2",
      label: "Muscle Background 2",
      description: "Background reference",
      roiCategory: "background",
      vessel: "",
      region: "Muscle",
      segment: "",
      locationGroup: "background",
      fill: "rgba(189, 148, 126, 0.18)",
      stroke: "#c7a18f",
    },
    {
      id: "aortic_root_noise",
      label: "Aortic Root Noise",
      description: "Noise reference",
      roiCategory: "noise",
      statKeys: ["sd"],
      vessel: "",
      region: "Aortic root",
      segment: "",
      locationGroup: "noise",
      fill: "rgba(188, 196, 208, 0.18)",
      stroke: "#b8c4d0",
    },
    {
      id: "rca_proximal_s1",
      label: "RCA proximal",
      description: "Segment 1",
      roiCategory: "coronary",
      vessel: "RCA",
      region: "Coronary artery",
      segment: "Segment 1",
      locationGroup: "proximal",
      fill: "rgba(255, 164, 164, 0.18)",
      stroke: "#ff9a9a",
    },
    {
      id: "rca_distal_s3",
      label: "RCA distal",
      description: "Segment 3",
      roiCategory: "coronary",
      vessel: "RCA",
      region: "Coronary artery",
      segment: "Segment 3",
      locationGroup: "distal",
      fill: "rgba(255, 164, 164, 0.18)",
      stroke: "#ff9a9a",
    },
    {
      id: "lad_distal_s8",
      label: "LAD distal",
      description: "Segment 8",
      roiCategory: "coronary",
      vessel: "LAD",
      region: "Coronary artery",
      segment: "Segment 8",
      locationGroup: "distal",
      fill: "rgba(165, 236, 188, 0.18)",
      stroke: "#8fe6ab",
    },
    {
      id: "lad_proximal_s56",
      label: "LAD proximal",
      description: "Segment 5/6",
      roiCategory: "coronary",
      vessel: "LAD",
      region: "Coronary artery",
      segment: "Segment 5/6",
      locationGroup: "proximal",
      fill: "rgba(165, 236, 188, 0.18)",
      stroke: "#8fe6ab",
    },
    {
      id: "lcx_proximal_s11",
      label: "LCx proximal",
      description: "Segment 11",
      roiCategory: "coronary",
      vessel: "LCx",
      region: "Coronary artery",
      segment: "Segment 11",
      locationGroup: "proximal",
      fill: "rgba(168, 214, 255, 0.18)",
      stroke: "#93cfff",
    },
    {
      id: "lcx_distal_s13",
      label: "LCx mid/dist",
      description: "Segment 13",
      roiCategory: "coronary",
      vessel: "LCx",
      region: "Coronary artery",
      segment: "Segment 13",
      locationGroup: "distal",
      fill: "rgba(168, 214, 255, 0.18)",
      stroke: "#93cfff",
    },
  ];

  const DEFAULT_IQ_ROI_TARGETS_SIMPLE = [
    {
      id: "mediastinal_fat_background",
      label: "Mediastinal Fat",
      description: "Background reference",
      roiCategory: "background",
      vessel: "",
      region: "Mediastinal fat",
      segment: "",
      locationGroup: "background",
      fill: "rgba(189, 148, 126, 0.18)",
      stroke: "#c7a18f",
    },
    {
      id: "aortic_root_noise",
      label: "Aortic Root Noise",
      description: "Noise reference",
      roiCategory: "noise",
      statKeys: ["sd"],
      vessel: "",
      region: "Aortic root",
      segment: "",
      locationGroup: "noise",
      fill: "rgba(188, 196, 208, 0.18)",
      stroke: "#b8c4d0",
    },
    {
      id: "rca_signal",
      label: "RCA",
      description: "Whole-vessel signal",
      roiCategory: "coronary",
      vessel: "RCA",
      region: "Coronary artery",
      segment: "",
      locationGroup: "",
      fill: "rgba(255, 164, 164, 0.18)",
      stroke: "#ff9a9a",
    },
    {
      id: "lad_signal",
      label: "LAD",
      description: "Whole-vessel signal",
      roiCategory: "coronary",
      vessel: "LAD",
      region: "Coronary artery",
      segment: "",
      locationGroup: "",
      fill: "rgba(165, 236, 188, 0.18)",
      stroke: "#8fe6ab",
    },
    {
      id: "lcx_signal",
      label: "LCx",
      description: "Whole-vessel signal",
      roiCategory: "coronary",
      vessel: "LCx",
      region: "Coronary artery",
      segment: "",
      locationGroup: "",
      fill: "rgba(168, 214, 255, 0.18)",
      stroke: "#93cfff",
    },
  ];

  const DEFAULT_IQ_ROI_TARGETS_PERIVASCULAR = [
    {
      id: "aorta_noise",
      label: "Aorta",
      description: "Noise ROI",
      roiCategory: "noise",
      metricRoles: ["noise"],
      statKeys: ["sd"],
      vessel: "",
      region: "Aorta",
      segment: "",
      locationGroup: "noise",
      fill: "rgba(188, 196, 208, 0.18)",
      stroke: "#b8c4d0",
    },
    {
      id: "rca_signal",
      label: "RCA",
      description: "Signal ROI",
      roiCategory: "coronary",
      metricRoles: ["signal"],
      statKeys: ["mean"],
      vessel: "RCA",
      region: "Coronary artery",
      segment: "",
      locationGroup: "",
      fill: "rgba(255, 164, 164, 0.18)",
      stroke: "#ff9a9a",
    },
    {
      id: "rca_perivascular_background",
      label: "RCA_perivascular",
      description: "Perivascular background ROI",
      roiCategory: "background",
      metricRoles: ["background"],
      statKeys: ["mean"],
      vessel: "",
      region: "RCA perivascular",
      segment: "",
      locationGroup: "RCA_perivascular",
      fill: "rgba(255, 208, 196, 0.18)",
      stroke: "#ffe0cf",
    },
    {
      id: "lad_signal",
      label: "LAD",
      description: "Signal ROI",
      roiCategory: "coronary",
      metricRoles: ["signal"],
      statKeys: ["mean"],
      vessel: "LAD",
      region: "Coronary artery",
      segment: "",
      locationGroup: "",
      fill: "rgba(165, 236, 188, 0.18)",
      stroke: "#8fe6ab",
    },
    {
      id: "lad_perivascular_background",
      label: "LAD_perivascular",
      description: "Perivascular background ROI",
      roiCategory: "background",
      metricRoles: ["background"],
      statKeys: ["mean"],
      vessel: "",
      region: "LAD perivascular",
      segment: "",
      locationGroup: "LAD_perivascular",
      fill: "rgba(216, 241, 210, 0.18)",
      stroke: "#d8f1d2",
    },
    {
      id: "lcx_signal",
      label: "LCx",
      description: "Signal ROI",
      roiCategory: "coronary",
      metricRoles: ["signal"],
      statKeys: ["mean"],
      vessel: "LCx",
      region: "Coronary artery",
      segment: "",
      locationGroup: "",
      fill: "rgba(168, 214, 255, 0.18)",
      stroke: "#93cfff",
    },
    {
      id: "lcx_perivascular_background",
      label: "LCx_perivascular",
      description: "Perivascular background ROI",
      roiCategory: "background",
      metricRoles: ["background"],
      statKeys: ["mean"],
      vessel: "",
      region: "LCx perivascular",
      segment: "",
      locationGroup: "LCx_perivascular",
      fill: "rgba(217, 236, 255, 0.18)",
      stroke: "#d9ecff",
    },
  ];

  const DEFAULT_IQ_ROI_TARGETS_LATE_ENHANCEMENT = [
    {
      id: "lv_cavum_signal",
      label: "LV Cavum",
      description: "Signal ROI; SD also used as noise",
      roiCategory: "coronary",
      metricRoles: ["signal", "noise"],
      vessel: "",
      region: "LV cavum",
      segment: "",
      locationGroup: "blood_pool",
      fill: "rgba(253, 186, 144, 0.18)",
      stroke: "#fdba90",
    },
    {
      id: "myocardium_background",
      label: "Myocardium",
      description: "Background reference",
      roiCategory: "background",
      vessel: "",
      region: "Myocardium",
      segment: "",
      locationGroup: "background",
      fill: "rgba(189, 148, 126, 0.18)",
      stroke: "#c7a18f",
    },
  ];

  const DEFAULT_IQ_ROI_TARGETS_STENT_IMAGER = [
    {
      id: "prox_stent_vessel",
      label: "prox_stent_vessel",
      description: "Vessel proximal to stent",
      roiCategory: "coronary",
      metricRoles: ["signal"],
      statKeys: ["mean"],
      vessel: "Stented vessel",
      region: "Vessel proximal to stent",
      segment: "proximal to stent",
      locationGroup: "stent_reference",
      fill: "rgba(253, 186, 144, 0.18)",
      stroke: "#fdba90",
    },
    {
      id: "dist_stent_vessel",
      label: "dist_stent_vessel",
      description: "Vessel distal to stent",
      roiCategory: "coronary",
      metricRoles: ["signal"],
      statKeys: ["mean"],
      vessel: "Stented vessel",
      region: "Vessel distal to stent",
      segment: "distal to stent",
      locationGroup: "stent_reference",
      fill: "rgba(255, 210, 127, 0.18)",
      stroke: "#ffd27f",
    },
    {
      id: "in_stent_vessel",
      label: "in_stent_vessel",
      description: "In-stent vessel",
      roiCategory: "coronary",
      metricRoles: ["signal"],
      statKeys: ["mean"],
      vessel: "Stented vessel",
      region: "In-stent vessel",
      segment: "in-stent",
      locationGroup: "in_stent",
      fill: "rgba(165, 236, 188, 0.18)",
      stroke: "#8fe6ab",
    },
    {
      id: "stent_background_noise_1",
      label: "background_noise_1",
      description: "Background and noise ROI 1",
      roiCategory: "noise",
      metricRoles: ["noise", "background"],
      statKeys: ["mean", "sd"],
      vessel: "",
      region: "Stent reference background 1",
      segment: "background/noise 1",
      locationGroup: "stent_background",
      fill: "rgba(188, 196, 208, 0.18)",
      stroke: "#b8c4d0",
    },
    {
      id: "stent_background_noise_2",
      label: "background_noise_2",
      description: "Background and noise ROI 2",
      roiCategory: "noise",
      metricRoles: ["noise", "background"],
      statKeys: ["mean", "sd"],
      vessel: "",
      region: "Stent reference background 2",
      segment: "background/noise 2",
      locationGroup: "stent_background",
      fill: "rgba(199, 161, 143, 0.18)",
      stroke: "#c7a18f",
    },
  ];
  const DEFAULT_IQ_ROI_TARGETS_CUSTOM = [];

  const IQ_OBJECTIVE_MODEL_DEFINITIONS = [
    {
      id: "coronary_detailed",
      label: "Model 1: Coronary, detailed",
      shortLabel: "Coronary, detailed",
      description: "Detailed coronary workflow with proximal/distal vessel targets, muscle background, and aortic-root noise.",
      helpText: "Best for classic CCTA image-quality studies with vessel-level plus proximal/distal SNR and CNR reporting.",
      summaryKind: "coronary_detailed",
      defaultTargets: DEFAULT_IQ_ROI_TARGETS_DETAILED,
    },
    {
      id: "coronary_simple",
      label: "Model 2: Coronary, simple",
      shortLabel: "Coronary, simple",
      description: "One signal ROI each for RCA, LAD, and LCx, plus one mediastinal-fat background ROI and aortic-root noise.",
      helpText: "Best when one representative ROI per coronary vessel is enough, with mediastinal fat as the single background reference and no proximal/distal splitting.",
      summaryKind: "coronary_simple",
      defaultTargets: DEFAULT_IQ_ROI_TARGETS_SIMPLE,
    },
    {
      id: "coronary_perivascular",
      label: "Model 3: Coronary, perivascular",
      shortLabel: "Coronary, perivascular",
      description: "Aortic SD HU for noise, coronary vessel mean HU for signal, and matched perivascular mean HU backgrounds.",
      helpText: "Best when CNR should contrast each coronary vessel against its local perivascular background while still reporting total signal, background, noise, SNR, and CNR.",
      summaryKind: "coronary_perivascular",
      defaultTargets: DEFAULT_IQ_ROI_TARGETS_PERIVASCULAR,
    },
    {
      id: "late_enhancement",
      label: "Model 4: Late Enhancement",
      shortLabel: "Late Enhancement",
      description: "LV Cavum mean HU provides signal, myocardium mean HU provides background, and LV Cavum SD provides image noise.",
      helpText: "Best for delayed-enhancement style cardiac CT where blood-pool signal is contrasted against myocardium instead of separate coronary segments.",
      summaryKind: "late_enhancement",
      defaultTargets: DEFAULT_IQ_ROI_TARGETS_LATE_ENHANCEMENT,
    },
    {
      id: "stent_imager",
      label: "Model 5: Stent_imager",
      shortLabel: "Stent_imager",
      description: "Proximal, distal, and in-stent vessel signal ROIs plus two combined background/noise ROIs.",
      helpText: "Best for stent image-quality studies where in-stent attenuation, reference-vessel signal, background, noise, SNR, CNR, and delta_HU_stent should be reported explicitly.",
      summaryKind: "stent_imager",
      defaultTargets: DEFAULT_IQ_ROI_TARGETS_STENT_IMAGER,
    },
    {
      id: "custom_blank",
      label: "Model 6: Custom blank",
      shortLabel: "Custom",
      description: "A blank objective protocol with no predefined ROI targets or computed metric groups.",
      helpText: "Start from zero when your study needs a fully custom signal, background, noise, SNR, and CNR definition.",
      summaryKind: "custom",
      defaultTargets: DEFAULT_IQ_ROI_TARGETS_CUSTOM,
    },
  ];

  const DEFAULT_IQ_OBJECTIVE_MODEL_ID = IQ_OBJECTIVE_MODEL_DEFINITIONS[0].id;

  const BASE_IQ_OBJECTIVE_METRIC_RULES = {
    signalEnabled: true,
    backgroundEnabled: true,
    noiseEnabled: true,
    snrEnabled: true,
    cnrEnabled: true,
    totalEnabled: true,
    perVesselEnabled: true,
    proximalEnabled: true,
    distalEnabled: true,
    customGroupEnabled: false,
    backgroundSource: "all_background",
    noiseSource: "all_noise",
  };

  const IQ_FORMULA_METRIC_KINDS = new Set(["signal", "background", "noise", "snr", "cnr", "custom"]);
  const IQ_FORMULA_SCOPE_KINDS = new Set(["reference", "total", "proximal", "distal", "vessel", "custom_group", "custom"]);

  function normalizeIqFormulaMetricKind(value) {
    const normalized = cleanIqTargetString(value).toLowerCase();
    return IQ_FORMULA_METRIC_KINDS.has(normalized) ? normalized : "custom";
  }

  function normalizeIqFormulaScopeKind(value) {
    const normalized = cleanIqTargetString(value).toLowerCase();
    return IQ_FORMULA_SCOPE_KINDS.has(normalized) ? normalized : "custom";
  }

  function inferIqFormulaMetricKind(metric) {
    const label = cleanIqTargetString(metric?.label || metric?.id).toLowerCase();
    const formula = cleanIqTargetString(metric?.formula).toLowerCase();
    if (label.startsWith("snr")) return "snr";
    if (label.startsWith("cnr")) return "cnr";
    if (label.startsWith("signal")) return "signal";
    if (label === "background") return "background";
    if (label === "noise") return "noise";
    if (formula.includes("background.mean") && formula.includes("noise.sd") && formula.includes("/")) return "cnr";
    if (formula.includes("noise.sd") && formula.includes("/")) return "snr";
    if (formula.includes("background.mean") && !formula.includes("signal.") && !formula.includes("vessel:") && !formula.includes("structure:") && !formula.includes("group:")) return "background";
    if (formula.includes("noise.sd") && !formula.includes("signal.") && !formula.includes("vessel:") && !formula.includes("structure:") && !formula.includes("group:")) return "noise";
    if (formula.includes("signal.mean") || formula.includes("vessel:") || formula.includes("structure:") || formula.includes("group:")) return "signal";
    return "custom";
  }

  function inferIqFormulaScopeKind(metric) {
    const label = cleanIqTargetString(metric?.label || metric?.id).toLowerCase();
    const formula = cleanIqTargetString(metric?.formula).toLowerCase();
    const metricKind = normalizeIqFormulaMetricKind(inferIqFormulaMetricKind(metric));
    if (metricKind === "background" || metricKind === "noise") return "reference";
    if (label.includes("proximal") || formula.includes("group:proximal")) return "proximal";
    if (label.includes("distal") || formula.includes("group:distal")) return "distal";
    if (/(^|_)total($|_)/.test(label) || label === "signal_total" || label === "snr_total" || label === "cnr_total") return "total";
    if (formula.includes("vessel:") || formula.includes("structure:") || /_(rca|lad|lcx)$/.test(label)) return "vessel";
    if (/group:(?!proximal\b|distal\b)/.test(formula)) return "custom_group";
    if (formula.includes("signal.mean")) return "total";
    return "custom";
  }

  function makeIqFormulaMetric(id, label, formula, unit, options) {
    return {
      id,
      label,
      formula,
      unit: unit || "",
      enabled: true,
      metricKind: normalizeIqFormulaMetricKind(options?.metricKind || inferIqFormulaMetricKind({ id, label, formula })),
      scopeKind: normalizeIqFormulaScopeKind(options?.scopeKind || inferIqFormulaScopeKind({ id, label, formula })),
    };
  }

  function getDefaultIqFormulaMetricsForModel(modelId) {
    const model = IQ_OBJECTIVE_MODEL_DEFINITIONS.find((item) => item.id === cleanIqTargetString(modelId)) || IQ_OBJECTIVE_MODEL_DEFINITIONS[0];
    const baseMetrics = [
      makeIqFormulaMetric("signal_total", "Signal_total", "avg(signal.mean)", "HU", { metricKind: "signal", scopeKind: "total" }),
      makeIqFormulaMetric("background", "Background", "avg(background.mean)", "HU", { metricKind: "background", scopeKind: "reference" }),
      makeIqFormulaMetric("noise", "Noise", "avg(noise.sd)", "HU", { metricKind: "noise", scopeKind: "reference" }),
    ];
    const vesselMetrics = ["RCA", "LAD", "LCx"].flatMap((vessel) => [
      makeIqFormulaMetric(`signal_${vessel.toLowerCase()}`, `Signal_${vessel}`, `avg(vessel:${vessel}.mean)`, "HU", { metricKind: "signal", scopeKind: "vessel" }),
      makeIqFormulaMetric(`snr_${vessel.toLowerCase()}`, `SNR_${vessel}`, `avg(vessel:${vessel}.mean) / avg(noise.sd)`, "", { metricKind: "snr", scopeKind: "vessel" }),
      makeIqFormulaMetric(`cnr_${vessel.toLowerCase()}`, `CNR_${vessel}`, `(avg(vessel:${vessel}.mean) - avg(background.mean)) / avg(noise.sd)`, "", { metricKind: "cnr", scopeKind: "vessel" }),
    ]);
    const ratioMetrics = [
      makeIqFormulaMetric("snr_total", "SNR_total", "avg(signal.mean) / avg(noise.sd)", "", { metricKind: "snr", scopeKind: "total" }),
      makeIqFormulaMetric("cnr_total", "CNR_total", "(avg(signal.mean) - avg(background.mean)) / avg(noise.sd)", "", { metricKind: "cnr", scopeKind: "total" }),
    ];
    if (model.summaryKind === "custom") {
      return [];
    }
    if (model.summaryKind === "late_enhancement") {
      return [...baseMetrics, ...ratioMetrics];
    }
    if (model.summaryKind === "coronary_perivascular") {
      const perivascularPairs = [
        { vessel: "RCA", signalTarget: "rca_signal", backgroundTarget: "rca_perivascular_background" },
        { vessel: "LAD", signalTarget: "lad_signal", backgroundTarget: "lad_perivascular_background" },
        { vessel: "LCx", signalTarget: "lcx_signal", backgroundTarget: "lcx_perivascular_background" },
      ];
      const perivascularMetrics = perivascularPairs.flatMap(({ vessel, signalTarget, backgroundTarget }) => [
        makeIqFormulaMetric(
          `signal_${vessel.toLowerCase()}`,
          `Signal_${vessel}`,
          `avg(target:${signalTarget}.mean)`,
          "HU",
          { metricKind: "signal", scopeKind: "vessel" }
        ),
        makeIqFormulaMetric(
          `background_${vessel.toLowerCase()}`,
          `Background_${vessel}`,
          `avg(target:${backgroundTarget}.mean)`,
          "HU",
          { metricKind: "background", scopeKind: "vessel" }
        ),
        makeIqFormulaMetric(
          `snr_${vessel.toLowerCase()}`,
          `SNR_${vessel}`,
          `avg(target:${signalTarget}.mean) / avg(noise.sd)`,
          "",
          { metricKind: "snr", scopeKind: "vessel" }
        ),
        makeIqFormulaMetric(
          `cnr_${vessel.toLowerCase()}`,
          `CNR_${vessel}`,
          `(avg(target:${signalTarget}.mean) - avg(target:${backgroundTarget}.mean)) / avg(noise.sd)`,
          "",
          { metricKind: "cnr", scopeKind: "vessel" }
        ),
      ]);
      return [...baseMetrics, ...perivascularMetrics, ...ratioMetrics];
    }
    if (model.summaryKind === "stent_imager") {
      const stentSignalFormula = "(avg(target:prox_stent_vessel.mean) + avg(target:dist_stent_vessel.mean) + avg(target:in_stent_vessel.mean)) / 3";
      const stentBackgroundFormula = "(avg(target:stent_background_noise_1.mean) + avg(target:stent_background_noise_2.mean)) / 2";
      const stentNoiseFormula = "(avg(target:stent_background_noise_1.sd) + avg(target:stent_background_noise_2.sd)) / 2";
      return [
        makeIqFormulaMetric("signal_total", "Signal_total", stentSignalFormula, "HU", { metricKind: "signal", scopeKind: "total" }),
        makeIqFormulaMetric("background", "Background", stentBackgroundFormula, "HU", { metricKind: "background", scopeKind: "reference" }),
        makeIqFormulaMetric("noise", "Noise", stentNoiseFormula, "HU", { metricKind: "noise", scopeKind: "reference" }),
        makeIqFormulaMetric(
          "delta_hu_stent",
          "delta_HU_stent",
          "avg(target:in_stent_vessel.mean) - ((avg(target:prox_stent_vessel.mean) + avg(target:dist_stent_vessel.mean)) / 2)",
          "HU",
          { metricKind: "custom", scopeKind: "custom" }
        ),
        makeIqFormulaMetric("snr_total", "SNR", `(${stentSignalFormula}) / (${stentNoiseFormula})`, "", { metricKind: "snr", scopeKind: "total" }),
        makeIqFormulaMetric("cnr_total", "CNR", `((${stentSignalFormula}) - (${stentBackgroundFormula})) / (${stentNoiseFormula})`, "", { metricKind: "cnr", scopeKind: "total" }),
      ];
    }
    if (model.summaryKind === "coronary_simple") {
      return [...baseMetrics, ...vesselMetrics, ...ratioMetrics];
    }
    const proximalDistalMetrics = ["proximal", "distal"].flatMap((group) => [
      makeIqFormulaMetric(`signal_${group}`, `Signal_${group}`, `avg(group:${group}.mean)`, "HU", { metricKind: "signal", scopeKind: group }),
      makeIqFormulaMetric(`snr_${group}`, `SNR_${group}`, `avg(group:${group}.mean) / avg(noise.sd)`, "", { metricKind: "snr", scopeKind: group }),
      makeIqFormulaMetric(`cnr_${group}`, `CNR_${group}`, `(avg(group:${group}.mean) - avg(background.mean)) / avg(noise.sd)`, "", { metricKind: "cnr", scopeKind: group }),
    ]);
    return [...baseMetrics, ...proximalDistalMetrics, ...vesselMetrics, ...ratioMetrics];
  }

  function normalizeIqFormulaMetrics(rawMetrics, modelId) {
    const defaults = getDefaultIqFormulaMetricsForModel(modelId);
    const sourceMetrics = Array.isArray(rawMetrics) ? rawMetrics : defaults;
    const seenIds = new Set();
    return sourceMetrics.map((metric, index) => {
      const label = cleanIqTargetString(metric?.label) || `Metric ${index + 1}`;
      const fallbackId = slugifyIqTarget(label, `metric_${index + 1}`);
      let id = slugifyIqTarget(metric?.id || label, fallbackId);
      let suffix = 1;
      while (seenIds.has(id)) {
        suffix += 1;
        id = `${fallbackId}_${suffix}`;
      }
      seenIds.add(id);
      const formula = cleanIqTargetString(metric?.formula) || "avg(signal.mean)";
      const metricDraft = { ...metric, id, label, formula };
      const isCustomMetric = /^custom_metric/i.test(id) || /^custom_metric/i.test(label);
      return {
        id,
        label,
        formula,
        unit: cleanIqTargetString(metric?.unit),
        enabled: metric?.enabled !== false,
        metricKind: normalizeIqFormulaMetricKind(metric?.metricKind || (isCustomMetric ? "custom" : inferIqFormulaMetricKind(metricDraft))),
        scopeKind: normalizeIqFormulaScopeKind(metric?.scopeKind || (isCustomMetric ? "custom" : inferIqFormulaScopeKind(metricDraft))),
      };
    });
  }

  function getDefaultIqMetricRulesForModel(modelId) {
    const model = IQ_OBJECTIVE_MODEL_DEFINITIONS.find((item) => item.id === cleanIqTargetString(modelId)) || IQ_OBJECTIVE_MODEL_DEFINITIONS[0];
    if (model.summaryKind === "coronary_simple") {
      return {
        ...BASE_IQ_OBJECTIVE_METRIC_RULES,
        proximalEnabled: false,
        distalEnabled: false,
        formulaMetrics: getDefaultIqFormulaMetricsForModel(model.id),
      };
    }
    if (model.summaryKind === "coronary_perivascular") {
      return {
        ...BASE_IQ_OBJECTIVE_METRIC_RULES,
        proximalEnabled: false,
        distalEnabled: false,
        formulaMetrics: getDefaultIqFormulaMetricsForModel(model.id),
      };
    }
    if (model.summaryKind === "stent_imager") {
      return {
        ...BASE_IQ_OBJECTIVE_METRIC_RULES,
        perVesselEnabled: false,
        proximalEnabled: false,
        distalEnabled: false,
        formulaMetrics: getDefaultIqFormulaMetricsForModel(model.id),
      };
    }
    if (model.summaryKind === "late_enhancement") {
      return {
        ...BASE_IQ_OBJECTIVE_METRIC_RULES,
        perVesselEnabled: false,
        proximalEnabled: false,
        distalEnabled: false,
        noiseSource: "signal_sd",
        formulaMetrics: getDefaultIqFormulaMetricsForModel(model.id),
      };
    }
    if (model.summaryKind === "custom") {
      return {
        ...BASE_IQ_OBJECTIVE_METRIC_RULES,
        signalEnabled: false,
        backgroundEnabled: false,
        noiseEnabled: false,
        snrEnabled: false,
        cnrEnabled: false,
        totalEnabled: false,
        perVesselEnabled: false,
        proximalEnabled: false,
        distalEnabled: false,
        customGroupEnabled: false,
        backgroundSource: "none",
        formulaMetrics: [],
      };
    }
    return { ...BASE_IQ_OBJECTIVE_METRIC_RULES, formulaMetrics: getDefaultIqFormulaMetricsForModel(model.id) };
  }

  function normalizeIqMetricRules(rules, modelId) {
    const defaults = getDefaultIqMetricRulesForModel(modelId);
    const allowedBackgroundSources = new Set(["all_background", "none"]);
    const allowedNoiseSources = new Set(["all_noise", "signal_sd"]);
    const backgroundSource = cleanIqTargetString(rules?.backgroundSource) || defaults.backgroundSource;
    const noiseSource = cleanIqTargetString(rules?.noiseSource) || defaults.noiseSource;
    return {
      signalEnabled: rules?.signalEnabled ?? defaults.signalEnabled,
      backgroundEnabled: rules?.backgroundEnabled ?? defaults.backgroundEnabled,
      noiseEnabled: rules?.noiseEnabled ?? defaults.noiseEnabled,
      snrEnabled: rules?.snrEnabled ?? defaults.snrEnabled,
      cnrEnabled: rules?.cnrEnabled ?? defaults.cnrEnabled,
      totalEnabled: rules?.totalEnabled ?? defaults.totalEnabled,
      perVesselEnabled: rules?.perVesselEnabled ?? defaults.perVesselEnabled,
      proximalEnabled: rules?.proximalEnabled ?? defaults.proximalEnabled,
      distalEnabled: rules?.distalEnabled ?? defaults.distalEnabled,
      customGroupEnabled: Boolean(rules?.customGroupEnabled ?? defaults.customGroupEnabled),
      backgroundSource:
        allowedBackgroundSources.has(backgroundSource) || backgroundSource.startsWith("target:")
          ? backgroundSource
          : defaults.backgroundSource,
      noiseSource:
        allowedNoiseSources.has(noiseSource) || noiseSource.startsWith("target:")
          ? noiseSource
          : defaults.noiseSource,
      formulaMetrics: normalizeIqFormulaMetrics(rules?.formulaMetrics, modelId),
    };
  }

  function hasIqFormulaSelectorTarget(selector) {
    const cleanSelector = cleanIqTargetString(selector);
    const lastDotIndex = cleanSelector.lastIndexOf(".");
    if (lastDotIndex < 0) {
      return true;
    }
    const scope = cleanSelector.slice(0, lastDotIndex);
    const stat = cleanSelector.slice(lastDotIndex + 1);
    const valueKey = getIqFormulaStatValueKey(stat);
    const statKey = getIqFormulaStatKeyForValueKey(valueKey);
    if (!statKey || statKey === "area") {
      return true;
    }
    const [rawScopeType, ...rawScopeRest] = scope.split(":");
    const scopeType = cleanIqTargetString(rawScopeType).toLowerCase();
    const scopeValue = rawScopeRest.join(":");
    const targets = getEnabledIqTargets().filter((target) => getIqTargetStatKeys(target).includes(statKey));
    if (scopeType === "all") {
      return Boolean(targets.length);
    }
    if (["signal", "background", "noise", "other"].includes(scopeType)) {
      return targets.some((target) => getIqTargetRoleForStat(target, statKey) === scopeType);
    }
    if (scopeType === "role") {
      return targets.some((target) => getIqTargetRoleForStat(target, statKey) === cleanIqTargetString(scopeValue).toLowerCase());
    }
    if (scopeType === "group") {
      return targets.some((target) => formulaSelectorTextMatches(getIqTargetGroupForStat(target, statKey), scopeValue));
    }
    if (scopeType === "structure" || scopeType === "vessel") {
      return targets.some((target) =>
        formulaSelectorTextMatches(target.vessel, scopeValue) ||
        formulaSelectorTextMatches(target.region, scopeValue) ||
        formulaSelectorTextMatches(target.label, scopeValue)
      );
    }
    if (scopeType === "target") {
      return targets.some((target) => target.id === scopeValue);
    }
    return true;
  }

  function isIqFormulaMetricAvailableForCurrentTargets(metric) {
    const formula = cleanIqTargetString(metric?.formula);
    if (!formula) {
      return true;
    }
    const selectors = [];
    formula.replace(/\b(?:avg|mean|average|sum|min|max|count)\(\s*([^()]+?)\s*\)/gi, (_match, selector) => {
      selectors.push(selector);
      return _match;
    });
    return selectors.every((selector) => hasIqFormulaSelectorTarget(selector));
  }

  function shouldIncludeIqFormulaMetric(metric, rules) {
    const metricKind = normalizeIqFormulaMetricKind(metric?.metricKind || inferIqFormulaMetricKind(metric));
    const scopeKind = normalizeIqFormulaScopeKind(metric?.scopeKind || inferIqFormulaScopeKind(metric));
    if (metric?.enabled === false) return false;
    if (metricKind === "signal" && rules?.signalEnabled === false) return false;
    if (metricKind === "background" && rules?.backgroundEnabled === false) return false;
    if (metricKind === "noise" && rules?.noiseEnabled === false) return false;
    if (metricKind === "snr" && rules?.snrEnabled === false) return false;
    if (metricKind === "cnr" && rules?.cnrEnabled === false) return false;
    if (metricKind === "cnr" && rules?.backgroundSource === "none") return false;
    if (scopeKind === "total" && rules?.totalEnabled === false) return false;
    if (scopeKind === "proximal" && rules?.proximalEnabled === false) return false;
    if (scopeKind === "distal" && rules?.distalEnabled === false) return false;
    if (scopeKind === "vessel" && rules?.perVesselEnabled === false) return false;
    if (scopeKind === "custom_group" && rules?.customGroupEnabled === false) return false;
    if (!isIqFormulaMetricAvailableForCurrentTargets(metric)) return false;
    return true;
  }

  function makeIqSignalFormulaMetricsForScope(scopeKind, labelSuffix, selector, rules) {
    const cleanLabelSuffix = cleanIqTargetString(labelSuffix);
    const suffixSlug = slugifyIqTarget(cleanLabelSuffix, scopeKind);
    const metrics = [];
    if (rules?.signalEnabled) {
      metrics.push(
        makeIqFormulaMetric(
          `signal_${suffixSlug}`,
          `Signal_${cleanLabelSuffix}`,
          `avg(${selector}.mean)`,
          "HU",
          { metricKind: "signal", scopeKind }
        )
      );
    }
    if (rules?.snrEnabled) {
      metrics.push(
        makeIqFormulaMetric(
          `snr_${suffixSlug}`,
          `SNR_${cleanLabelSuffix}`,
          `avg(${selector}.mean) / avg(noise.sd)`,
          "",
          { metricKind: "snr", scopeKind }
        )
      );
    }
    if (rules?.cnrEnabled && rules?.backgroundSource !== "none") {
      metrics.push(
        makeIqFormulaMetric(
          `cnr_${suffixSlug}`,
          `CNR_${cleanLabelSuffix}`,
          `(avg(${selector}.mean) - avg(background.mean)) / avg(noise.sd)`,
          "",
          { metricKind: "cnr", scopeKind }
        )
      );
    }
    return metrics;
  }

  function makeIqPairedSignalBackgroundFormulaMetrics(scopeKind, labelSuffix, signalSelector, backgroundSelector, rules) {
    const cleanLabelSuffix = cleanIqTargetString(labelSuffix);
    const suffixSlug = slugifyIqTarget(cleanLabelSuffix, scopeKind);
    const metrics = [];
    if (rules?.signalEnabled) {
      metrics.push(
        makeIqFormulaMetric(
          `signal_${suffixSlug}`,
          `Signal_${cleanLabelSuffix}`,
          `avg(${signalSelector}.mean)`,
          "HU",
          { metricKind: "signal", scopeKind }
        )
      );
    }
    if (rules?.backgroundEnabled) {
      metrics.push(
        makeIqFormulaMetric(
          `background_${suffixSlug}`,
          `Background_${cleanLabelSuffix}`,
          `avg(${backgroundSelector}.mean)`,
          "HU",
          { metricKind: "background", scopeKind }
        )
      );
    }
    if (rules?.snrEnabled) {
      metrics.push(
        makeIqFormulaMetric(
          `snr_${suffixSlug}`,
          `SNR_${cleanLabelSuffix}`,
          `avg(${signalSelector}.mean) / avg(noise.sd)`,
          "",
          { metricKind: "snr", scopeKind }
        )
      );
    }
    if (rules?.cnrEnabled && rules?.backgroundSource !== "none") {
      metrics.push(
        makeIqFormulaMetric(
          `cnr_${suffixSlug}`,
          `CNR_${cleanLabelSuffix}`,
          `(avg(${signalSelector}.mean) - avg(${backgroundSelector}.mean)) / avg(noise.sd)`,
          "",
          { metricKind: "cnr", scopeKind }
        )
      );
    }
    return metrics;
  }

  function findIqPerivascularBackgroundForSignal(signalTarget, backgroundTargets) {
    const vessel = cleanIqTargetString(signalTarget?.vessel || signalTarget?.label);
    const vesselLower = vessel.toLowerCase();
    return backgroundTargets.find((target) => {
      const haystack = `${target.label} ${target.region} ${target.locationGroup}`.toLowerCase();
      return vesselLower && haystack.includes(vesselLower);
    }) || null;
  }

  function getExpectedIqFormulaMetricsForRules(rules) {
    const expectedMetrics = [];
    const pushMetrics = (metrics) => {
      metrics.forEach((metric) => expectedMetrics.push(metric));
    };
    if (rules?.backgroundEnabled) {
      expectedMetrics.push(makeIqFormulaMetric("background", "Background", "avg(background.mean)", "HU", { metricKind: "background", scopeKind: "reference" }));
    }
    if (rules?.noiseEnabled) {
      expectedMetrics.push(makeIqFormulaMetric("noise", "Noise", "avg(noise.sd)", "HU", { metricKind: "noise", scopeKind: "reference" }));
    }
    if (rules?.totalEnabled) {
      pushMetrics(makeIqSignalFormulaMetricsForScope("total", "total", "signal", rules));
    }
    if (rules?.proximalEnabled) {
      pushMetrics(makeIqSignalFormulaMetricsForScope("proximal", "proximal", "group:proximal", rules));
    }
    if (rules?.distalEnabled) {
      pushMetrics(makeIqSignalFormulaMetricsForScope("distal", "distal", "group:distal", rules));
    }
    const signalTargets = IQ_ROI_TARGETS.filter((target) =>
      target.enabled !== false && getIqTargetRoleForStat(target, "mean") === "signal"
    );
    const backgroundTargets = IQ_ROI_TARGETS.filter((target) =>
      target.enabled !== false && getIqTargetRoleForStat(target, "mean") === "background"
    );
    if (rules?.perVesselEnabled) {
      if (getCurrentObjectiveModelDefinition().summaryKind === "coronary_perivascular") {
        signalTargets.forEach((target) => {
          const structure = cleanIqTargetString(target.vessel || target.region || target.label);
          const pairedBackground = findIqPerivascularBackgroundForSignal(target, backgroundTargets);
          if (!structure || !pairedBackground) {
            return;
          }
          pushMetrics(makeIqPairedSignalBackgroundFormulaMetrics(
            "vessel",
            structure,
            `target:${target.id}`,
            `target:${pairedBackground.id}`,
            rules
          ));
        });
      } else {
        Array.from(new Set(signalTargets.map((target) => cleanIqTargetString(target.vessel || target.region || target.label)).filter(Boolean)))
          .forEach((structure) => {
            pushMetrics(makeIqSignalFormulaMetricsForScope("vessel", structure, `structure:${structure}`, rules));
          });
      }
    }
    if (rules?.customGroupEnabled) {
      Array.from(new Set(signalTargets.map((target) => cleanIqTargetString(target.locationGroup)).filter(Boolean)))
        .filter((group) => !["proximal", "distal"].includes(group.toLowerCase()))
        .forEach((group) => {
          pushMetrics(makeIqSignalFormulaMetricsForScope("custom_group", group, `group:${group}`, rules));
        });
    }
    const seenIds = new Set();
    return expectedMetrics.filter((metric) => {
      if (seenIds.has(metric.id)) {
        return false;
      }
      seenIds.add(metric.id);
      return true;
    });
  }

  function ensureIqFormulaMetricsForRules(rules, options) {
    const normalizedRules = normalizeIqMetricRules(rules, IQ_OBJECTIVE_MODEL_ID);
    const existingIds = new Set((normalizedRules.formulaMetrics || []).map((metric) => metric.id));
    const missingMetrics = getExpectedIqFormulaMetricsForRules(normalizedRules)
      .filter((metric) => shouldIncludeIqFormulaMetric(metric, normalizedRules) && !existingIds.has(metric.id));
    if (!missingMetrics.length) {
      return normalizedRules;
    }
    if (options?.activateFirstAdded !== false) {
      IQ_ACTIVE_FORMULA_METRIC_ID = missingMetrics[0].id;
    }
    return {
      ...normalizedRules,
      formulaMetrics: [...(normalizedRules.formulaMetrics || []), ...missingMetrics],
    };
  }

  const INITIAL_IQ_TARGET_PROTOCOL = loadIqTargetProtocolFromStorage();
  let IQ_OBJECTIVE_MODEL_ID = INITIAL_IQ_TARGET_PROTOCOL.modelId;
  let IQ_ROI_TARGETS = INITIAL_IQ_TARGET_PROTOCOL.targets;
  let IQ_OBJECTIVE_METRIC_RULES = INITIAL_IQ_TARGET_PROTOCOL.metricRules;
  let IQ_TARGETS_BY_ID = new Map();
  let IQ_REQUIRED_TARGET_IDS = [];
  let IQ_STUDY_TARGET_DRAG_ID = "";
  let IQ_STUDY_SUBJECTIVE_DRAG_KEY = "";
  let IQ_STUDY_FORMULA_DRAG_ID = "";
  let IQ_ACTIVE_FORMULA_METRIC_ID = "";
  refreshIqTargetIndexes();

  function cleanIqTargetString(value) {
    return String(value ?? "").trim();
  }

  function formatIqSegmentDescription(segment) {
    const cleanSegment = cleanIqTargetString(segment);
    if (!cleanSegment) {
      return "";
    }
    return /^segment\b/i.test(cleanSegment) ? cleanSegment : `Segment ${cleanSegment}`;
  }

  function normalizeIqTargetCategory(value) {
    const category = cleanIqTargetString(value);
    return Object.prototype.hasOwnProperty.call(IQ_TARGET_CATEGORY_STYLES, category) ? category : "coronary";
  }

  function getDefaultIqTargetMetricRoles(category) {
    const normalizedCategory = normalizeIqTargetCategory(category);
    if (normalizedCategory === "background") {
      return ["background"];
    }
    if (normalizedCategory === "noise") {
      return ["noise"];
    }
    return ["signal"];
  }

  function normalizeIqTargetMetricRoles(rawRoles, category) {
    const roles = Array.isArray(rawRoles)
      ? rawRoles
      : typeof rawRoles === "string"
        ? rawRoles.split(/[,\s]+/)
        : [];
    const normalizedRoles = roles
      .map((role) => cleanIqTargetString(role).toLowerCase())
      .filter((role) => Object.prototype.hasOwnProperty.call(IQ_TARGET_METRIC_ROLE_DEFINITIONS, role));
    return Array.from(new Set(normalizedRoles.length ? normalizedRoles : getDefaultIqTargetMetricRoles(category)));
  }

  function normalizeIqTargetStatKeys(rawStatKeys) {
    const keys = Array.isArray(rawStatKeys)
      ? rawStatKeys
      : typeof rawStatKeys === "string"
        ? rawStatKeys.split(/[,\s]+/)
        : [];
    const normalizedKeys = keys
      .map((key) => cleanIqTargetString(key).toLowerCase())
      .filter((key) => Object.prototype.hasOwnProperty.call(IQ_TARGET_STAT_DEFINITIONS, key));
    return Array.from(new Set(normalizedKeys.length ? normalizedKeys : DEFAULT_IQ_TARGET_STAT_KEYS));
  }

  function normalizeIqTargetRoleKey(role, fallback) {
    const normalizedRole = cleanIqTargetString(role).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(IQ_TARGET_METRIC_ROLE_DEFINITIONS, normalizedRole)) {
      return normalizedRole;
    }
    return fallback || "signal";
  }

  function getDefaultIqTargetRoleForStat(statKey, metricRoles, category) {
    const roles = normalizeIqTargetMetricRoles(metricRoles, category);
    const normalizedStat = cleanIqTargetString(statKey).toLowerCase();
    if (roles.includes("background") && roles.includes("noise")) {
      if (normalizedStat === "mean") return "background";
      if (normalizedStat === "sd") return "noise";
    }
    if (roles.includes("signal") && roles.includes("noise")) {
      if (normalizedStat === "mean") return "signal";
      if (normalizedStat === "sd") return "noise";
    }
    if (roles.includes("signal") && roles.includes("background")) {
      if (normalizedStat === "mean") return "signal";
      if (normalizedStat === "sd") return "background";
    }
    if (normalizedStat === "sd" && roles.includes("noise")) return "noise";
    if (normalizedStat === "mean" && roles.includes("background")) return "background";
    if (normalizedStat === "mean" && roles.includes("signal")) return "signal";
    return roles[0] || getDefaultIqTargetMetricRoles(category)[0] || "signal";
  }

  function normalizeIqTargetStatRoles(rawStatRoles, statKeys, metricRoles, category) {
    const source = rawStatRoles && typeof rawStatRoles === "object" && !Array.isArray(rawStatRoles)
      ? rawStatRoles
      : {};
    return normalizeIqTargetStatKeys(statKeys).reduce((roles, statKey) => {
      roles[statKey] = normalizeIqTargetRoleKey(
        source[statKey],
        getDefaultIqTargetRoleForStat(statKey, metricRoles, category)
      );
      return roles;
    }, {});
  }

  function normalizeIqTargetStatLabels(rawStatLabels, statKeys, statRoles) {
    const source = rawStatLabels && typeof rawStatLabels === "object" && !Array.isArray(rawStatLabels)
      ? rawStatLabels
      : {};
    return normalizeIqTargetStatKeys(statKeys).reduce((labels, statKey) => {
      const cleanLabel = cleanIqTargetString(source[statKey]);
      if (cleanLabel) {
        labels[statKey] = cleanLabel;
      } else if (statRoles?.[statKey] === "other") {
        labels[statKey] = "Other";
      }
      return labels;
    }, {});
  }

  function normalizeIqTargetStatGroups(rawStatGroups, statKeys, fallbackGroup) {
    const source = rawStatGroups && typeof rawStatGroups === "object" && !Array.isArray(rawStatGroups)
      ? rawStatGroups
      : {};
    return normalizeIqTargetStatKeys(statKeys).reduce((groups, statKey) => {
      const cleanGroup = cleanIqTargetString(source[statKey]) || cleanIqTargetString(fallbackGroup);
      if (cleanGroup) {
        groups[statKey] = cleanGroup;
      }
      return groups;
    }, {});
  }

  function getIqTargetMetricRoles(target) {
    if (target?.statRoles) {
      const statKeys = normalizeIqTargetStatKeys(target?.statKeys);
      const statRoles = normalizeIqTargetStatRoles(target.statRoles, statKeys, target?.metricRoles, target?.roiCategory);
      const roles = Array.from(new Set(statKeys.map((statKey) => statRoles[statKey]).filter(Boolean)));
      if (roles.length) {
        return roles;
      }
    }
    return normalizeIqTargetMetricRoles(target?.metricRoles, target?.roiCategory);
  }

  function getIqTargetStatKeys(target) {
    return normalizeIqTargetStatKeys(target?.statKeys);
  }

  function getIqTargetStatRoles(target) {
    return normalizeIqTargetStatRoles(target?.statRoles, getIqTargetStatKeys(target), target?.metricRoles, target?.roiCategory);
  }

  function getIqTargetStatLabels(target) {
    return normalizeIqTargetStatLabels(target?.statLabels, getIqTargetStatKeys(target), getIqTargetStatRoles(target));
  }

  function getIqTargetStatGroups(target) {
    return normalizeIqTargetStatGroups(target?.statGroups, getIqTargetStatKeys(target), target?.locationGroup);
  }

  function getIqTargetRoleForStat(target, statKey) {
    return getIqTargetStatRoles(target)[cleanIqTargetString(statKey).toLowerCase()] || getDefaultIqTargetRoleForStat(statKey, target?.metricRoles, target?.roiCategory);
  }

  function getIqTargetGroupForStat(target, statKey) {
    const normalizedStat = cleanIqTargetString(statKey).toLowerCase();
    return getIqTargetStatGroups(target)[normalizedStat] || cleanIqTargetString(target?.locationGroup);
  }

  function getIqTargetRoleLabelForStat(target, statKey) {
    const normalizedStat = cleanIqTargetString(statKey).toLowerCase();
    const role = getIqTargetRoleForStat(target, normalizedStat);
    const customLabel = getIqTargetStatLabels(target)[normalizedStat];
    if (role === "other" && customLabel) {
      return customLabel;
    }
    return IQ_TARGET_METRIC_ROLE_DEFINITIONS[role]?.label || customLabel || role;
  }

  function getIqTargetStatDisplayLabel(statKey) {
    const normalized = cleanIqTargetString(statKey).toLowerCase();
    if (normalized === "mean") return "avg HU";
    if (normalized === "sd") return "SD HU";
    if (normalized === "min") return "min HU";
    if (normalized === "max") return "max HU";
    return IQ_TARGET_STAT_DEFINITIONS[normalized]?.label || normalized;
  }

  function getIqTargetCollectedStatsDisplay(target) {
    return getIqTargetStatKeys(target).map(getIqTargetStatDisplayLabel).join(" + ");
  }

  function getIqTargetStatRoleOrdinal(target, statKey) {
    const targetId = safeString(target?.id);
    const normalizedStat = cleanIqTargetString(statKey).toLowerCase();
    const normalizedRole = getIqTargetRoleForStat(target, normalizedStat);
    const normalizedLabel = getIqTargetRoleLabelForStat(target, normalizedStat).toLowerCase();
    let ordinal = 0;
    for (const candidate of getEnabledIqTargets()) {
      for (const candidateStatKey of getIqTargetStatKeys(candidate)) {
        const candidateRole = getIqTargetRoleForStat(candidate, candidateStatKey);
        const candidateLabel = getIqTargetRoleLabelForStat(candidate, candidateStatKey).toLowerCase();
        if (candidateRole === normalizedRole && candidateLabel === normalizedLabel) {
          ordinal += 1;
        }
        if (candidate.id === targetId && candidateStatKey === normalizedStat) {
          return ordinal || 1;
        }
      }
    }
    return 1;
  }

  function getIqTargetStatAssignmentLabel(target, statKey) {
    const roleLabel = getIqTargetRoleLabelForStat(target, statKey);
    return `${roleLabel} ${getIqTargetStatRoleOrdinal(target, statKey)}`;
  }

  function getIqTargetRoleNumberLabels(target) {
    return getIqTargetStatKeys(target).map((statKey) => {
      return `${getIqTargetStatDisplayLabel(statKey)} > ${getIqTargetStatAssignmentLabel(target, statKey)}`;
    });
  }

  function getIqTargetDisplayOrder(target) {
    const targetId = safeString(target?.id);
    const enabledIndex = IQ_REQUIRED_TARGET_IDS.indexOf(targetId);
    if (enabledIndex >= 0) {
      return enabledIndex + 1;
    }
    const allIndex = IQ_ROI_TARGETS.findIndex((candidate) => candidate.id === targetId);
    return allIndex >= 0 ? allIndex + 1 : 1;
  }

  function getIqTargetRuleDisplayLabel(target) {
    const order = getIqTargetDisplayOrder(target);
    const assignments = getIqTargetRoleNumberLabels(target).join("; ");
    return `ROI${order}: ${target?.label || "ROI"}${assignments ? `, ${assignments}` : ""}`;
  }

  function getIqTargetRoleNumbersForExport(target) {
    return getIqTargetRoleNumberLabels(target).join(";");
  }

  function hasIqTargetMetricRole(target, role) {
    return getIqTargetMetricRoles(target).includes(role);
  }

  function normalizeIqPaletteColor(value, fallback) {
    const cleanValue = cleanIqTargetString(value);
    const match = cleanValue.match(/^#?([0-9a-f]{6})$/i);
    if (match) {
      return `#${match[1].toLowerCase()}`;
    }
    return fallback || IQ_TARGET_COLOR_PALETTE[0];
  }

  function getNextIqTargetPaletteColor() {
    const usedColors = new Set(IQ_ROI_TARGETS.map((target) => normalizeIqPaletteColor(target.stroke, "").toLowerCase()).filter(Boolean));
    return IQ_TARGET_COLOR_PALETTE.find((color) => !usedColors.has(color.toLowerCase())) ||
      IQ_TARGET_COLOR_PALETTE[IQ_ROI_TARGETS.length % IQ_TARGET_COLOR_PALETTE.length];
  }

  function getStudyTargetColorPaletteMarkup(selectedColor) {
    const normalizedSelected = normalizeIqPaletteColor(selectedColor, "");
    return `
      <div class="study-color-picker" data-study-color-picker>
        <button
          class="study-color-selected"
          data-study-target-color-toggle
          type="button"
          aria-expanded="false"
          title="Change ROI color"
          style="--swatch-color:${escapeHtml(normalizedSelected || IQ_TARGET_COLOR_PALETTE[0])}"
        >
          <span class="study-color-selected-band" aria-hidden="true"></span>
        </button>
        <div class="study-color-palette" data-study-color-palette role="radiogroup" aria-label="ROI target color">
          ${IQ_TARGET_COLOR_PALETTE.map((color, index) => {
            const isSelected = color.toLowerCase() === normalizedSelected.toLowerCase();
            return `
              <button
                class="study-color-swatch ${isSelected ? "is-selected" : ""}"
                data-study-target-color="${escapeHtml(color)}"
                type="button"
                role="radio"
                aria-checked="${isSelected ? "true" : "false"}"
                title="Use palette color ${index + 1}"
                style="--swatch-color:${escapeHtml(color)}"
              ></button>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function setStudyColorPickerOpen(picker, isOpen) {
    if (!picker) {
      return;
    }
    picker.classList.toggle("is-open", Boolean(isOpen));
    picker.querySelector("[data-study-target-color-toggle]")?.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function closeStudyColorPickers(exceptPicker) {
    document.querySelectorAll("[data-study-color-picker].is-open").forEach((picker) => {
      if (picker !== exceptPicker) {
        setStudyColorPickerOpen(picker, false);
      }
    });
  }

  function setStudyObjectiveRowColor(row, color) {
    const normalizedColor = normalizeIqPaletteColor(color, IQ_TARGET_COLOR_PALETTE[0]);
    const colorInput = row?.querySelector('[data-study-target-field="stroke"]');
    if (colorInput) {
      colorInput.value = normalizedColor;
    }
    const selectedControl = row?.querySelector("[data-study-target-color-toggle]");
    if (selectedControl) {
      selectedControl.style.setProperty("--swatch-color", normalizedColor);
    }
    row?.querySelectorAll("[data-study-target-color]").forEach((button) => {
      const isSelected = normalizeIqPaletteColor(button.dataset.studyTargetColor, "") === normalizedColor;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-checked", isSelected ? "true" : "false");
    });
    return normalizedColor;
  }

  function makeIqTargetFill(stroke, category) {
    const color = cleanIqTargetString(stroke) || IQ_TARGET_CATEGORY_STYLES[normalizeIqTargetCategory(category)].stroke;
    const match = color.match(/^#?([0-9a-f]{6})$/i);
    if (!match) {
      return IQ_TARGET_CATEGORY_STYLES[normalizeIqTargetCategory(category)].fill;
    }
    const hex = match[1];
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, 0.18)`;
  }

  function slugifyIqTarget(value, fallback) {
    const slug = cleanIqTargetString(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return slug || fallback || "target";
  }

  function createCustomIqTargetId(label) {
    const slug = slugifyIqTarget(label, "target");
    let candidate = `custom_${slug}`;
    let suffix = 1;
    while (IQ_TARGETS_BY_ID.has(candidate)) {
      suffix += 1;
      candidate = `custom_${slug}_${suffix}`;
    }
    return candidate;
  }

  function normalizeIqTarget(raw, index) {
    const category = normalizeIqTargetCategory(raw?.roiCategory);
    const style = IQ_TARGET_CATEGORY_STYLES[category];
    const label = cleanIqTargetString(raw?.label) || `Target ${index + 1}`;
    const stroke = cleanIqTargetString(raw?.stroke) || style.stroke;
    const region = cleanIqTargetString(raw?.region) || (category === "coronary" ? "Coronary artery" : style.label);
    const vessel = cleanIqTargetString(raw?.vessel);
    const segment = cleanIqTargetString(raw?.segment);
    const locationGroup =
      cleanIqTargetString(raw?.locationGroup) ||
      (category === "coronary" ? "" : category);
    const metricRoles = normalizeIqTargetMetricRoles(raw?.metricRoles, category);
    const statKeys = normalizeIqTargetStatKeys(raw?.statKeys);
    const statRoles = normalizeIqTargetStatRoles(raw?.statRoles, statKeys, metricRoles, category);
    const statLabels = normalizeIqTargetStatLabels(raw?.statLabels, statKeys, statRoles);
    const statGroups = normalizeIqTargetStatGroups(raw?.statGroups, statKeys, locationGroup);
    const description =
      cleanIqTargetString(raw?.description) ||
      (segment ? formatIqSegmentDescription(segment) : style.description);
    return {
      id: cleanIqTargetString(raw?.id) || `custom_${slugifyIqTarget(label, `target_${index + 1}`)}`,
      enabled: raw?.enabled !== false,
      label,
      description,
      roiCategory: category,
      vessel,
      region,
      segment,
      locationGroup,
      metricRoles: Array.from(new Set(Object.values(statRoles).filter(Boolean))),
      statKeys,
      statRoles,
      statLabels,
      statGroups,
      fill: makeIqTargetFill(stroke, category),
      stroke,
    };
  }

  function getObjectiveModelDefinition(modelId) {
    return IQ_OBJECTIVE_MODEL_DEFINITIONS.find((model) => model.id === cleanIqTargetString(modelId)) || IQ_OBJECTIVE_MODEL_DEFINITIONS[0];
  }

  function cloneDefaultIqTargets(modelId) {
    const model = getObjectiveModelDefinition(modelId);
    return (model.defaultTargets || []).map((target, index) => normalizeIqTarget({ ...target }, index));
  }

  function loadIqTargetProtocolFromStorage() {
    try {
      const raw = window.localStorage?.getItem(IQ_TARGET_PROTOCOL_STORAGE_KEY);
      if (!raw) {
        return {
          modelId: DEFAULT_IQ_OBJECTIVE_MODEL_ID,
          targets: cloneDefaultIqTargets(DEFAULT_IQ_OBJECTIVE_MODEL_ID),
          metricRules: normalizeIqMetricRules(null, DEFAULT_IQ_OBJECTIVE_MODEL_ID),
        };
      }
      const parsed = JSON.parse(raw);
      const modelId = getObjectiveModelDefinition(parsed?.modelId).id || DEFAULT_IQ_OBJECTIVE_MODEL_ID;
      const targets = Array.isArray(parsed?.targets) ? parsed.targets : Array.isArray(parsed) ? parsed : [];
      const normalized = targets
        .map((target, index) => normalizeIqTarget(target, index))
        .filter((target) => target.id && target.label);
      return {
        modelId,
        targets: normalized.length ? normalized : cloneDefaultIqTargets(modelId),
        metricRules: normalizeIqMetricRules(parsed?.metricRules, modelId),
      };
    } catch (_error) {
      return {
        modelId: DEFAULT_IQ_OBJECTIVE_MODEL_ID,
        targets: cloneDefaultIqTargets(DEFAULT_IQ_OBJECTIVE_MODEL_ID),
        metricRules: normalizeIqMetricRules(null, DEFAULT_IQ_OBJECTIVE_MODEL_ID),
      };
    }
  }

  function refreshIqTargetIndexes() {
    IQ_OBJECTIVE_MODEL_ID = getObjectiveModelDefinition(IQ_OBJECTIVE_MODEL_ID).id;
    const seenIds = new Set();
    IQ_ROI_TARGETS = (IQ_ROI_TARGETS && IQ_ROI_TARGETS.length ? IQ_ROI_TARGETS : cloneDefaultIqTargets(IQ_OBJECTIVE_MODEL_ID))
      .map((target, index) => {
        const normalized = normalizeIqTarget(target, index);
        let candidateId = normalized.id;
        let suffix = 1;
        while (seenIds.has(candidateId)) {
          suffix += 1;
          candidateId = `${normalized.id}_${suffix}`;
        }
        normalized.id = candidateId;
        seenIds.add(candidateId);
        return normalized;
      });
    IQ_TARGETS_BY_ID = new Map(IQ_ROI_TARGETS.map((target) => [target.id, target]));
    IQ_REQUIRED_TARGET_IDS = IQ_ROI_TARGETS.filter((target) => target.enabled !== false).map((target) => target.id);
    if (!IQ_REQUIRED_TARGET_IDS.length && IQ_ROI_TARGETS[0]) {
      IQ_ROI_TARGETS[0].enabled = true;
      IQ_REQUIRED_TARGET_IDS = [IQ_ROI_TARGETS[0].id];
    }
  }

  function saveIqTargetProtocolToStorage() {
    try {
      window.localStorage?.setItem(
        IQ_TARGET_PROTOCOL_STORAGE_KEY,
        JSON.stringify({
          version: 3,
          modelId: IQ_OBJECTIVE_MODEL_ID,
          targets: IQ_ROI_TARGETS,
          metricRules: IQ_OBJECTIVE_METRIC_RULES,
        })
      );
    } catch (_error) {
      // Ignore storage issues. The current protocol still works for this session.
    }
  }

  const IQ_SUBJECTIVE_ALLOWED_SCALES = Array.from({ length: 9 }, (_value, index) => index + 2);
  const IQ_SUBJECTIVE_QUICK_SCALE_OPTIONS = [2, 4, 5];
  const IQ_SUBJECTIVE_CUSTOM_SCALE_VALUE = "__custom__";
  const IQ_SUBJECTIVE_MAX_CUSTOM_SCALE = 10;
  const IQ_SUBJECTIVE_SCORE_LABELS_BY_SCALE = {
    2: {
      0: "Poor / No",
      1: "Good / Yes",
    },
    3: {
      1: "Poor",
      2: "Intermediate",
      3: "Excellent",
    },
    4: {
      1: "Poor",
      2: "Fair",
      3: "Good",
      4: "Excellent",
    },
    5: {
      1: "Poor",
      2: "Fair",
      3: "Moderate",
      4: "Good",
      5: "Excellent",
    },
    6: {
      1: "Very poor",
      2: "Poor",
      3: "Limited",
      4: "Adequate",
      5: "Good",
      6: "Excellent",
    },
    7: {
      1: "Very poor",
      2: "Poor",
      3: "Fair",
      4: "Adequate",
      5: "Good",
      6: "Very good",
      7: "Excellent",
    },
    8: {
      1: "Very poor",
      2: "Poor",
      3: "Fair",
      4: "Slightly limited",
      5: "Adequate",
      6: "Good",
      7: "Very good",
      8: "Excellent",
    },
    9: {
      1: "Very poor",
      2: "Poor",
      3: "Fair",
      4: "Limited",
      5: "Adequate",
      6: "Satisfactory",
      7: "Good",
      8: "Very good",
      9: "Excellent",
    },
    10: {
      1: "Very poor",
      2: "Poor",
      3: "Markedly limited",
      4: "Limited",
      5: "Borderline",
      6: "Adequate",
      7: "Satisfactory",
      8: "Good",
      9: "Very good",
      10: "Excellent",
    },
  };
  const IQ_SUBJECTIVE_FIELD_SCALE_OPTIONS = Object.fromEntries(
    IQ_SUBJECTIVE_ALLOWED_SCALES.map((scale) => [
      String(scale),
      {
        key: String(scale),
        label: scale === 2 ? "2-point (0/1)" : `${scale}-point`,
        values: scale === 2 ? [0, 1] : Array.from({ length: scale }, (_value, index) => index + 1),
      },
    ])
  );
  const IQ_SUBJECTIVE_STALE_FIVE_POINT_LABEL_SETS = [
    {
      1: "Very poor",
      2: "Poor",
      3: "Acceptable",
      4: "Good",
      5: "Excellent",
    },
    {
      1: "Poor",
      2: "Fair",
      3: "Good",
      4: "Excellent",
      5: "Excellent",
    },
  ];
  const IQ_SUBJECTIVE_GENERIC_DESCRIPTIONS_BY_SCALE = {
    2: {
      0: "Negative, poor, absent, or not confident for this category.",
      1: "Positive, good, present, or confident for this category.",
    },
    3: {
      1: "Low or poor performance for this category.",
      2: "Intermediate performance for this category.",
      3: "High or excellent performance for this category.",
    },
    4: {
      1: "Severe limitation for this category; non-diagnostic.",
      2: "Marked limitation, but diagnostic evaluation remains possible.",
      3: "Mild limitation with only minor impact on interpretation.",
      4: "Minimal or no relevant limitation; excellent impression.",
    },
    5: {
      1: "Very poor category performance; non-diagnostic.",
      2: "Poor category performance with relevant limitations.",
      3: "Moderate category performance; diagnostic with moderate limitations.",
      4: "Good category performance with minor limitations.",
      5: "Excellent category performance without relevant limitations.",
    },
    6: {
      1: "Very poor performance; severe limitation or non-diagnostic impression.",
      2: "Poor performance with major relevant limitations.",
      3: "Limited performance with clear impairment, but still interpretable if needed.",
      4: "Adequate performance with acceptable diagnostic usability.",
      5: "Good performance with only minor limitations.",
      6: "Excellent performance without relevant limitations.",
    },
    7: {
      1: "Very poor performance; severe limitation or non-diagnostic impression.",
      2: "Poor performance with major relevant limitations.",
      3: "Fair performance with visible limitations.",
      4: "Adequate middle-grade performance; diagnostic but not optimal.",
      5: "Good performance with minor limitations.",
      6: "Very good performance with minimal limitations.",
      7: "Excellent performance without relevant limitations.",
    },
    8: {
      1: "Very poor performance; severe limitation or non-diagnostic impression.",
      2: "Poor performance with major relevant limitations.",
      3: "Fair performance with visible limitations.",
      4: "Slightly limited performance; diagnostic usability remains acceptable.",
      5: "Adequate performance with only modest limitations.",
      6: "Good performance with minor limitations.",
      7: "Very good performance with minimal limitations.",
      8: "Excellent performance without relevant limitations.",
    },
    9: {
      1: "Very poor performance; severe limitation or non-diagnostic impression.",
      2: "Poor performance with major relevant limitations.",
      3: "Fair performance with visible limitations.",
      4: "Limited performance with relevant but not prohibitive impairment.",
      5: "Adequate middle-grade performance; diagnostic but not optimal.",
      6: "Satisfactory performance with manageable minor limitations.",
      7: "Good performance with minor limitations.",
      8: "Very good performance with minimal limitations.",
      9: "Excellent performance without relevant limitations.",
    },
    10: {
      1: "Very poor performance; severe limitation or non-diagnostic impression.",
      2: "Poor performance with major relevant limitations.",
      3: "Markedly limited performance with substantial impairment.",
      4: "Limited performance with relevant but not prohibitive impairment.",
      5: "Borderline performance; usable but clearly constrained.",
      6: "Adequate performance with acceptable diagnostic usability.",
      7: "Satisfactory performance with manageable minor limitations.",
      8: "Good performance with minor limitations.",
      9: "Very good performance with minimal limitations.",
      10: "Excellent performance without relevant limitations.",
    },
  };
  const DEFAULT_IQ_SUBJECTIVE_FIELDS = [
    {
      scale: 4,
      key: "noise",
      label: "Noise",
      descriptions: {
        1: "Severe image noise with substantial impairment of coronary artery evaluation; non-diagnostic.",
        2: "Marked image noise that visibly affects assessment, but diagnostic evaluation remains possible.",
        3: "Mild image noise with only minor impact on interpretation.",
        4: "Minimal or no relevant image noise; excellent image impression.",
      },
    },
    {
      scale: 4,
      key: "sharpness",
      label: "Sharpness",
      descriptions: {
        1: "Severe blurring of coronary vessel contours with loss of border definition; non-diagnostic.",
        2: "Reduced vessel edge definition with noticeable blurring, but still diagnostic.",
        3: "Good delineation of coronary borders with only slight blurring.",
        4: "Excellent sharpness with crisp, clearly defined coronary vessel contours.",
      },
    },
    {
      scale: 4,
      key: "motionArtifacts",
      label: "Motion artifacts",
      descriptions: {
        1: "Severe motion artifacts causing non-diagnostic assessment of the coronary arteries.",
        2: "Noticeable motion artifacts that impair evaluation, but diagnostic interpretation remains possible.",
        3: "Minor motion artifacts with limited effect on interpretation.",
        4: "No or minimal motion artifacts; unrestricted evaluation.",
      },
    },
    {
      scale: 4,
      key: "artifactInterference",
      label: "Artifact interference",
      descriptions: {
        1: "Severe artifact interference such as breathing or stair-step artifacts with major limitation of coronary assessment; non-diagnostic.",
        2: "Noticeable artifact interference that clearly affects evaluation, but diagnostic interpretation remains possible.",
        3: "Minor artifact interference with only limited influence on interpretation.",
        4: "No or minimal relevant artifact interference; excellent evaluability with little to no disturbance from breathing or stair-step artifacts.",
      },
    },
    {
      scale: 4,
      key: "overallImageQuality",
      label: "Overall image quality",
      descriptions: {
        1: "Non-diagnostic image quality.",
        2: "Diagnostic image quality despite clear limitations.",
        3: "Good diagnostic image quality with minor limitations.",
        4: "Excellent diagnostic image quality without relevant limitations.",
      },
    },
  ];
  const DEFAULT_IQ_SUBJECTIVE_PROTOCOL = {
    scale: "4",
    fields: DEFAULT_IQ_SUBJECTIVE_FIELDS,
    scoreLabels: IQ_SUBJECTIVE_SCORE_LABELS_BY_SCALE[4],
  };
  const IQ_SUBJECTIVE_TEMPLATE_FIELDS = [
    ...DEFAULT_IQ_SUBJECTIVE_FIELDS,
    {
      scale: "2",
      key: "diagnosticConfidence",
      label: "Diagnostic confidence",
      scoreLabels: {
        0: "Poor",
        1: "Confident",
      },
      descriptions: {
        0: "Low or insufficient diagnostic confidence for the requested evaluation.",
        1: "Diagnostic confidence is sufficient for the requested evaluation.",
      },
    },
  ];
  let IQ_SUBJECTIVE_SCALE = DEFAULT_IQ_SUBJECTIVE_PROTOCOL.scale;
  let IQ_SUBJECTIVE_FIELDS = DEFAULT_IQ_SUBJECTIVE_PROTOCOL.fields;
  let IQ_SUBJECTIVE_SCORE_LABELS = DEFAULT_IQ_SUBJECTIVE_PROTOCOL.scoreLabels;

  function cleanIqSubjectiveString(value) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeIqSubjectiveScale(value) {
    return normalizeIqSubjectiveFieldScale(value, DEFAULT_IQ_SUBJECTIVE_PROTOCOL.scale);
  }

  function normalizeIqSubjectiveFieldScale(value, fallback) {
    const raw = cleanIqSubjectiveString(value);
    if (/^(binary|binary01|0-1|0\/1)$/i.test(raw)) {
      return "2";
    }
    const fallbackRaw = cleanIqSubjectiveString(fallback);
    if (!raw && /^(binary|binary01|0-1|0\/1)$/i.test(fallbackRaw)) {
      return "2";
    }
    const parsed = Number.parseInt(raw || fallback, 10);
    if (IQ_SUBJECTIVE_ALLOWED_SCALES.includes(parsed)) {
      return String(parsed);
    }
    const fallbackParsed = Number.parseInt(fallback, 10);
    return String(IQ_SUBJECTIVE_ALLOWED_SCALES.includes(fallbackParsed) ? fallbackParsed : DEFAULT_IQ_SUBJECTIVE_PROTOCOL.scale);
  }

  function getIqSubjectiveFieldScaleKey(fieldOrScale) {
    if (fieldOrScale && typeof fieldOrScale === "object") {
      return normalizeIqSubjectiveFieldScale(fieldOrScale.scale, IQ_SUBJECTIVE_SCALE);
    }
    return normalizeIqSubjectiveFieldScale(fieldOrScale ?? IQ_SUBJECTIVE_SCALE, IQ_SUBJECTIVE_SCALE);
  }

  function getIqSubjectiveScaleLabel(fieldOrScale) {
    const scaleKey = getIqSubjectiveFieldScaleKey(fieldOrScale);
    return IQ_SUBJECTIVE_FIELD_SCALE_OPTIONS[scaleKey]?.label || `${scaleKey}-point`;
  }

  function getIqSubjectiveScaleValues(scale) {
    const scaleKey = getIqSubjectiveFieldScaleKey(scale ?? IQ_SUBJECTIVE_SCALE);
    return (IQ_SUBJECTIVE_FIELD_SCALE_OPTIONS[scaleKey]?.values || IQ_SUBJECTIVE_FIELD_SCALE_OPTIONS[4].values).slice();
  }

  function getDefaultIqSubjectiveScoreLabels(scale) {
    const safeScale = getIqSubjectiveFieldScaleKey(scale);
    const values = getIqSubjectiveScaleValues(safeScale);
    const scaleDefaults = IQ_SUBJECTIVE_SCORE_LABELS_BY_SCALE[safeScale] || {};
    return Object.fromEntries(
      values.map((value, index) => [
        value,
        scaleDefaults[value] ||
          scaleDefaults[String(value)] ||
          (index === 0 ? "Worst" : index === values.length - 1 ? "Best" : `Score ${value}`),
      ])
    );
  }

  function normalizeIqSubjectiveScoreLabels(labels, scale) {
    const safeScale = getIqSubjectiveFieldScaleKey(scale);
    const defaults = getDefaultIqSubjectiveScoreLabels(safeScale);
    const scaleNumber = Number.parseInt(safeScale, 10);
    const normalized = Object.fromEntries(
      getIqSubjectiveScaleValues(safeScale).map((value) => [
        value,
        cleanIqSubjectiveString(labels?.[value] ?? labels?.[String(value)] ?? defaults[value]) ||
          defaults[value] ||
          `Score ${value}`,
      ])
    );
    if (
      safeScale === "5" &&
      IQ_SUBJECTIVE_STALE_FIVE_POINT_LABEL_SETS.some((staleLabels) =>
        getIqSubjectiveScaleValues(5).every((value) =>
          cleanIqSubjectiveString(normalized[value]).toLowerCase() ===
            cleanIqSubjectiveString(staleLabels[value]).toLowerCase()
        )
      )
    ) {
      return { ...defaults };
    }
    if (scaleNumber > 5) {
      const values = getIqSubjectiveScaleValues(safeScale);
      const hasGeneratedScoreLabels = values.some((value) => /^score\s+\d+$/i.test(cleanIqSubjectiveString(normalized[value])));
      const hasCompressedFourPointPrefix = [1, 2, 3, 4].every(
        (value) =>
          cleanIqSubjectiveString(normalized[value]).toLowerCase() ===
          cleanIqSubjectiveString(IQ_SUBJECTIVE_SCORE_LABELS_BY_SCALE[4][value]).toLowerCase()
      );
      if (hasGeneratedScoreLabels || hasCompressedFourPointPrefix) {
        return { ...defaults };
      }
    }
    return normalized;
  }

  function getGenericIqSubjectiveDescriptions(scale) {
    const safeScale = getIqSubjectiveFieldScaleKey(scale);
    const values = getIqSubjectiveScaleValues(safeScale);
    const defaults = IQ_SUBJECTIVE_GENERIC_DESCRIPTIONS_BY_SCALE[safeScale];
    if (defaults) {
      return defaults;
    }
    return Object.fromEntries(
      values.map((value, index) => [
        value,
        index === 0
          ? "Lowest/worst value for this category."
          : index === values.length - 1
            ? "Highest/best value for this category."
            : `Intermediate score ${value} for this category.`,
      ])
    );
  }

  function normalizeIqSubjectiveDescriptions(descriptions, scale) {
    const safeScale = getIqSubjectiveFieldScaleKey(scale);
    const defaults = getGenericIqSubjectiveDescriptions(scale);
    const normalized = Object.fromEntries(
      getIqSubjectiveScaleValues(scale).map((value) => [
        value,
        cleanIqSubjectiveString(descriptions?.[value] ?? descriptions?.[String(value)] ?? defaults[value]) ||
          defaults[value] ||
          `Score ${value}`,
      ])
    );
    if (Number.parseInt(safeScale, 10) > 5) {
      const hasGeneratedDescriptions = getIqSubjectiveScaleValues(safeScale).some((value) =>
        /^(lowest\/worst|highest\/best|intermediate score \d+)/i.test(cleanIqSubjectiveString(normalized[value]))
      );
      if (hasGeneratedDescriptions) {
        return { ...defaults };
      }
    }
    return normalized;
  }

  function createIqSubjectiveFieldKey(label, index) {
    const slug =
      cleanIqSubjectiveString(label)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || `category_${index + 1}`;
    return slug;
  }

  function normalizeIqSubjectiveField(field, index, scale) {
    const fieldScale = normalizeIqSubjectiveFieldScale(field?.scale, scale);
    const label = cleanIqSubjectiveString(field?.label) || `Category ${index + 1}`;
    const rawKey = cleanIqSubjectiveString(field?.key)
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return {
      key: rawKey || createIqSubjectiveFieldKey(label, index),
      scale: fieldScale,
      label,
      scoreLabels: normalizeIqSubjectiveScoreLabels(field?.scoreLabels, fieldScale),
      descriptions: normalizeIqSubjectiveDescriptions(field?.descriptions, fieldScale),
    };
  }

  function normalizeIqSubjectiveProtocol(protocol) {
    const scale = normalizeIqSubjectiveFieldScale(protocol?.scale, DEFAULT_IQ_SUBJECTIVE_PROTOCOL.scale);
    const sourceFields =
      Array.isArray(protocol?.fields) && protocol.fields.length
        ? protocol.fields
        : DEFAULT_IQ_SUBJECTIVE_PROTOCOL.fields;
    const seenKeys = new Set();
    const fields = sourceFields.map((field, index) => {
      const normalized = normalizeIqSubjectiveField(field, index, scale);
      const baseKey = normalized.key;
      let candidateKey = baseKey;
      let suffix = 1;
      while (seenKeys.has(candidateKey)) {
        suffix += 1;
        candidateKey = `${baseKey}_${suffix}`;
      }
      normalized.key = candidateKey;
      seenKeys.add(candidateKey);
      return normalized;
    });
    if (!fields.length) {
      return normalizeIqSubjectiveProtocol(DEFAULT_IQ_SUBJECTIVE_PROTOCOL);
    }
    return {
      scale,
      fields,
      scoreLabels: normalizeIqSubjectiveScoreLabels(protocol?.scoreLabels, scale),
    };
  }

  function cloneDefaultIqSubjectiveProtocol() {
    return normalizeIqSubjectiveProtocol(DEFAULT_IQ_SUBJECTIVE_PROTOCOL);
  }

  function loadIqSubjectiveProtocolFromStorage() {
    try {
      const stored = window.localStorage?.getItem(IQ_SUBJECTIVE_PROTOCOL_STORAGE_KEY);
      if (stored) {
        return normalizeIqSubjectiveProtocol(JSON.parse(stored));
      }
    } catch (_error) {
      // Ignore malformed user preferences and fall back to the default protocol.
    }
    return cloneDefaultIqSubjectiveProtocol();
  }

  const initialIqSubjectiveProtocol = loadIqSubjectiveProtocolFromStorage();
  IQ_SUBJECTIVE_SCALE = initialIqSubjectiveProtocol.scale;
  IQ_SUBJECTIVE_FIELDS = initialIqSubjectiveProtocol.fields;
  IQ_SUBJECTIVE_SCORE_LABELS = initialIqSubjectiveProtocol.scoreLabels;

  function saveIqSubjectiveProtocolToStorage() {
    try {
      window.localStorage?.setItem(
        IQ_SUBJECTIVE_PROTOCOL_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          scale: IQ_SUBJECTIVE_SCALE,
          fields: IQ_SUBJECTIVE_FIELDS,
          scoreLabels: IQ_SUBJECTIVE_SCORE_LABELS,
        })
      );
    } catch (_error) {
      // Ignore storage issues. The active protocol still works for this session.
    }
  }

  function createIqStudyRuleSetId(name) {
    return `rules_${slugifyIqTarget(name, "study")}_${Date.now().toString(36)}`;
  }

  function normalizeIqStudyRuleSet(raw, index) {
    const objectiveModelId = getObjectiveModelDefinition(raw?.objective?.modelId || raw?.modelId).id;
    const targets = Array.isArray(raw?.objective?.targets)
      ? raw.objective.targets
      : Array.isArray(raw?.targets)
        ? raw.targets
        : cloneDefaultIqTargets(objectiveModelId);
    const subjective = normalizeIqSubjectiveProtocol(raw?.subjective || raw?.subjectiveProtocol || DEFAULT_IQ_SUBJECTIVE_PROTOCOL);
    return {
      id: cleanIqTargetString(raw?.id) || createIqStudyRuleSetId(raw?.name || `Study rules ${index + 1}`),
      name: cleanIqTargetString(raw?.name) || `Study rules ${index + 1}`,
      savedAt: cleanIqTargetString(raw?.savedAt),
      objective: {
        modelId: objectiveModelId,
        targets: targets.map((target, targetIndex) => normalizeIqTarget(target, targetIndex)),
        metricRules: normalizeIqMetricRules(raw?.objective?.metricRules || raw?.metricRules, objectiveModelId),
      },
      subjective,
    };
  }

  function loadIqStudyRuleSetsFromStorage() {
    try {
      const stored = window.localStorage?.getItem(IQ_STUDY_RULE_SETS_STORAGE_KEY);
      if (!stored) {
        return [];
      }
      const parsed = JSON.parse(stored);
      const sets = Array.isArray(parsed?.sets) ? parsed.sets : Array.isArray(parsed) ? parsed : [];
      return sets.map((set, index) => normalizeIqStudyRuleSet(set, index)).filter((set) => set.id && set.name);
    } catch (_error) {
      return [];
    }
  }

  function saveIqStudyRuleSetsToStorage() {
    try {
      window.localStorage?.setItem(
        IQ_STUDY_RULE_SETS_STORAGE_KEY,
        JSON.stringify({ version: 1, sets: IQ_STUDY_RULE_SETS })
      );
    } catch (_error) {
      // The active rules still remain in the current protocol storage.
    }
  }

  function buildCurrentStudyRulesSnapshot(options) {
    const name = cleanIqTargetString(options?.name) || "CCTA IQ study rules";
    return normalizeIqStudyRuleSet(
      {
        id: options?.id || createIqStudyRuleSetId(name),
        name,
        savedAt: new Date().toISOString(),
        objective: {
          modelId: IQ_OBJECTIVE_MODEL_ID,
          targets: IQ_ROI_TARGETS,
          metricRules: IQ_OBJECTIVE_METRIC_RULES,
        },
        subjective: {
          scale: IQ_SUBJECTIVE_SCALE,
          fields: IQ_SUBJECTIVE_FIELDS,
          scoreLabels: IQ_SUBJECTIVE_SCORE_LABELS,
        },
      },
      IQ_STUDY_RULE_SETS.length
    );
  }

  function applyStudyRulesSnapshot(ruleSet) {
    const normalized = normalizeIqStudyRuleSet(ruleSet, 0);
    captureIqAnnotationTargetSnapshots();
    IQ_OBJECTIVE_MODEL_ID = normalized.objective.modelId;
    IQ_ROI_TARGETS = normalized.objective.targets;
    IQ_OBJECTIVE_METRIC_RULES = normalized.objective.metricRules;
    IQ_ACTIVE_FORMULA_METRIC_ID = IQ_OBJECTIVE_METRIC_RULES.formulaMetrics?.[0]?.id || "";
    refreshIqTargetIndexes();
    IQ_SUBJECTIVE_SCALE = normalized.subjective.scale;
    IQ_SUBJECTIVE_FIELDS = normalized.subjective.fields;
    IQ_SUBJECTIVE_SCORE_LABELS = normalized.subjective.scoreLabels;
    saveIqTargetProtocolToStorage();
    saveIqSubjectiveProtocolToStorage();
    state.iq.activeTargetId = getDefaultIqTargetDefinition().id;
    state.iq.subjectiveActiveFieldKey = getDefaultIqSubjectiveFieldDefinition().key;
    updateIqTargetProtocolUi();
    updateIqSubjectiveProtocolUi({ renderOnly: true });
    renderStudyRulesWorkspace({ force: true });
  }

  let IQ_STUDY_RULE_SETS = loadIqStudyRuleSetsFromStorage();
  let IQ_ACTIVE_STUDY_RULE_SET_ID = "";

  function createEmptyIqSubjectiveScoreMap() {
    return Object.fromEntries(IQ_SUBJECTIVE_FIELDS.map((field) => [field.key, null]));
  }

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
    currentVOI: { ...VOI_PRESETS.coronary },
    currentPreset: "coronary",
    syncMprTransforms: true,
    cineFps: 8,
    cineTimerId: null,
    dragging: null,
    polygonDraft: null,
    renderQueued: false,
    renderDirtyViewports: new Set(VIEWPORT_IDS),
    readoutsDirty: true,
    annotationSequence: 1,
    roiClipboard: null,
    selectedAnnotationId: null,
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
      annotationManager: "",
      metadata: "",
      iqTargetScrollFrameId: null,
    },
    toolHover: {
      timerId: null,
      toolKey: "",
    },
    iq: {
      activeTargetId: IQ_ROI_TARGETS[0]?.id || "",
      subjectiveScoresByRecon: {},
      subjectiveActiveFieldKey: getDefaultIqSubjectiveFieldDefinition().key,
      subjectiveRevealReconLabel: false,
      contourCorrectionDraft: null,
      exportResearchStudyId: "",
      exportPatientStudyId: "",
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
    sanitizeStentGuideIndices,
    analyzeProfileSamples,
  } = sharedProfileAnalysis;
  const exportStudyApi = window.HAGRadExportStudies || null;
  const overlayStyle = window.HAGRadOverlayStyle || null;

  function cacheElements() {
    els.app = document.querySelector(".app");
    els.sidebar = document.querySelector(".sidebar");
    els.dicomInput = document.getElementById("dicom-input");
    els.dicomFolderInput = document.getElementById("dicom-folder-input");
    els.dicomAddInput = document.getElementById("dicom-add-input");
    els.clearButton = document.getElementById("clear-button");
    els.statusPill = document.getElementById("status-pill");
    els.workspaceModeNote = document.getElementById("workspace-mode-note");
    els.iqWorkflowNote = document.getElementById("iq-workflow-note");
    els.iqJumpButtons = Array.from(document.querySelectorAll("[data-iq-jump-tab]"));
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
    els.toolContextNote = document.getElementById("tool-context-note");
    els.roiToolTrigger = document.getElementById("roi-tool-trigger");
    els.roiToolMenu = document.getElementById("roi-tool-menu");
    els.roiToolActiveLabel = document.getElementById("roi-tool-active-label");
    els.toolTooltipTargets = Array.from(document.querySelectorAll("[data-tool], [data-tool-group-toggle]"));
    els.toolHoverTooltip = document.getElementById("tool-hover-tooltip");
    els.toolScopedGroups = Array.from(document.querySelectorAll("[data-tool-scope]"));
    els.toolPanels = Array.from(document.querySelectorAll("[data-tool-panel]"));
    els.sidebarSections = Array.from(document.querySelectorAll("[data-section-id]"));
    els.sidebarSectionToggles = Array.from(document.querySelectorAll("[data-section-toggle]"));
    els.uiLevelElements = Array.from(document.querySelectorAll("[data-ui-level]"));
    els.sidebarTabElements = Array.from(document.querySelectorAll("[data-sidebar-tab]"));
    els.presetButtons = Array.from(document.querySelectorAll("[data-preset]"));
    els.resetButton = document.getElementById("reset-button");
    els.presentationResetWindowButton = document.getElementById("presentation-reset-window-button");
    els.presentationResetFitButton = document.getElementById("presentation-reset-fit-button");
    els.presentationFocusToggleButton = document.getElementById("presentation-focus-toggle-button");
    els.presentationFocusExitButton = document.getElementById("presentation-focus-exit-button");
    els.focusWorkflowButtons = Array.from(document.querySelectorAll("[data-focus-workflow-tab]"));
    els.focusIqExportButton = document.getElementById("focus-iq-export-button");
    els.undoButton = document.getElementById("undo-button");
    els.redoButton = document.getElementById("redo-button");
    els.historySummary = document.getElementById("history-summary");
    els.resetMprButton = document.getElementById("reset-mpr-button");
    els.mprOverlayToggleButton = document.getElementById("mpr-overlay-toggle-button");
    els.syncMprButton = document.getElementById("sync-mpr-button");
    els.clearMeasurementsButton = document.getElementById("clear-measurements-button");
    els.brushMinInput = document.getElementById("brush-min-input");
    els.brushMaxInput = document.getElementById("brush-max-input");
    els.brushSizeInput = document.getElementById("brush-size-input");
    els.eraserSizeInput = document.getElementById("eraser-size-input");
    els.brushShrinkButton = document.getElementById("brush-shrink-button");
    els.brushGrowButton = document.getElementById("brush-grow-button");
    els.copyRoiButton = document.getElementById("copy-roi-button");
    els.pasteRoiButton = document.getElementById("paste-roi-button");
    els.iqTargetSelect = document.getElementById("iq-target-select");
    els.iqTargetList = document.getElementById("iq-target-list");
    els.iqObjectiveModelSelect = document.getElementById("iq-objective-model-select");
    els.iqObjectiveModelLabel = document.getElementById("iq-objective-model-label");
    els.iqObjectiveModelNote = document.getElementById("iq-objective-model-note");
    els.iqTargetDefineSelect = document.getElementById("iq-target-define-select");
    els.iqTargetDefineList = document.getElementById("iq-target-define-list");
    els.iqTargetSummary = document.getElementById("iq-target-summary");
    els.iqTargetProtocolNote = document.getElementById("iq-target-protocol-note");
    els.iqTargetEditorMetaNote = document.getElementById("iq-target-editor-meta-note");
    els.iqTargetEditorHelp = document.getElementById("iq-target-editor-help");
    els.iqTargetLabelInput = document.getElementById("iq-target-label-input");
    els.iqTargetCategorySelect = document.getElementById("iq-target-category-select");
    els.iqTargetSegmentInput = document.getElementById("iq-target-segment-input");
    els.iqTargetColorInput = document.getElementById("iq-target-color-input");
    els.iqTargetSaveButton = document.getElementById("iq-target-save-button");
    els.iqTargetAddButton = document.getElementById("iq-target-add-button");
    els.iqTargetDeleteButton = document.getElementById("iq-target-delete-button");
    els.iqObjectiveNote = document.getElementById("iq-objective-note");
    els.iqSummaryGrid = document.getElementById("iq-summary-grid");
    els.iqSnbChart = document.getElementById("iq-snb-chart");
    els.iqSnrCnrChart = document.getElementById("iq-snrcnr-chart");
    els.iqRoiTableBody = document.getElementById("iq-roi-table-body");
    els.iqRoiTableNote = document.getElementById("iq-roi-table-note");
    els.iqSubjectiveProtocolEditor = document.getElementById("iq-subjective-protocol-editor");
    els.iqSubjectiveProtocolNote = document.getElementById("iq-subjective-protocol-note");
    els.iqSubjectiveFieldSelect = document.getElementById("iq-subjective-field-select");
    els.iqSubjectiveScaleSelect = document.getElementById("iq-subjective-scale-select");
    els.iqSubjectiveLabelInput = document.getElementById("iq-subjective-label-input");
    els.iqSubjectiveDescriptionEditor = document.getElementById("iq-subjective-description-editor");
    els.iqSubjectiveSaveButton = document.getElementById("iq-subjective-save-button");
    els.iqSubjectiveAddButton = document.getElementById("iq-subjective-add-button");
    els.iqSubjectiveDeleteButton = document.getElementById("iq-subjective-delete-button");
    els.iqSubjectiveCardList = document.getElementById("iq-subjective-card-list");
    els.iqSubjectiveProgress = document.getElementById("iq-subjective-progress");
    els.iqSubjectiveNote = document.getElementById("iq-subjective-note");
    els.iqSubjectiveSeriesIndex = document.getElementById("iq-subjective-series-index");
    els.iqSubjectiveSeriesDetail = document.getElementById("iq-subjective-series-detail");
    els.iqSubjectivePrevButton = document.getElementById("iq-subjective-prev-button");
    els.iqSubjectiveNextButton = document.getElementById("iq-subjective-next-button");
    els.iqSubjectiveToggleLabelButton = document.getElementById("iq-subjective-toggle-label-button");
    els.iqExportNote = document.getElementById("iq-export-note");
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
    els.reconstructionTransferNote = document.getElementById("reconstruction-transfer-note");
    els.shortcutResetButton = document.getElementById("shortcut-reset-button");
    els.shortcutTableBody = document.getElementById("shortcut-table-body");
    els.voiReadout = document.getElementById("voi-readout");
    els.exportCurrentButton = document.getElementById("export-current-button");
    els.exportGridButton = document.getElementById("export-grid-button");
    els.exportMeasurementsButton = document.getElementById("export-measurements-button");
    els.finishCloseButton = document.getElementById("finish-close-button");
    els.exportBaselineButton = document.getElementById("export-baseline-button");
    els.iqOpenExportButton = document.getElementById("iq-open-export-button");
    els.iqExportModal = document.getElementById("iq-export-modal");
    els.iqExportCloseButton = document.getElementById("iq-export-close-button");
    els.iqExportCancelButton = document.getElementById("iq-export-cancel-button");
    els.iqExportConfirmButton = document.getElementById("iq-export-confirm-button");
    els.iqResetProtocolsButton = document.getElementById("iq-reset-protocols-button");
    els.studyRulesWorkspace = document.getElementById("study-rules-workspace");
    els.studyRulesSavedSelect = document.getElementById("study-rules-saved-select");
    els.studyRulesNameInput = document.getElementById("study-rules-name-input");
    els.studyRulesSaveButton = document.getElementById("study-rules-save-button");
    els.studyRulesSaveNewButton = document.getElementById("study-rules-save-new-button");
    els.studyRulesDeleteButton = document.getElementById("study-rules-delete-button");
    els.studyObjectiveModelSelect = document.getElementById("study-objective-model-select");
    els.studyObjectiveSummary = document.getElementById("study-objective-summary");
    els.studyObjectiveModelNote = document.getElementById("study-objective-model-note");
    els.studyObjectiveTargetTableBody = document.getElementById("study-objective-target-table-body");
    els.studyObjectiveAddTargetButton = document.getElementById("study-objective-add-target-button");
    els.studyObjectiveApplyPresetButton = document.getElementById("study-objective-apply-preset-button");
    els.studyMetricSignalEnabled = document.getElementById("study-metric-signal-enabled");
    els.studyMetricBackgroundEnabled = document.getElementById("study-metric-background-enabled");
    els.studyMetricNoiseEnabled = document.getElementById("study-metric-noise-enabled");
    els.studyMetricSnrEnabled = document.getElementById("study-metric-snr-enabled");
    els.studyMetricCnrEnabled = document.getElementById("study-metric-cnr-enabled");
    els.studyMetricTotalEnabled = document.getElementById("study-metric-total-enabled");
    els.studyMetricVesselEnabled = document.getElementById("study-metric-vessel-enabled");
    els.studyMetricProximalEnabled = document.getElementById("study-metric-proximal-enabled");
    els.studyMetricDistalEnabled = document.getElementById("study-metric-distal-enabled");
    els.studyMetricCustomGroupEnabled = document.getElementById("study-metric-custom-group-enabled");
    els.studyMetricBackgroundSource = document.getElementById("study-metric-background-source");
    els.studyMetricNoiseSource = document.getElementById("study-metric-noise-source");
    els.studyMetricPreview = document.getElementById("study-metric-preview");
    els.studyFormulaMetricList = document.getElementById("study-formula-metric-list");
    els.studyFormulaMetricNameInput = document.getElementById("study-formula-metric-name-input");
    els.studyFormulaMetricUnitInput = document.getElementById("study-formula-metric-unit-input");
    els.studyFormulaMetricExpressionInput = document.getElementById("study-formula-metric-expression-input");
    els.studyFormulaMetricColorPreview = document.getElementById("study-formula-metric-color-preview");
    els.studyFormulaTokenPalette = document.getElementById("study-formula-token-palette");
    els.studyFormulaMetricAddButton = document.getElementById("study-formula-metric-add-button");
    els.studyFormulaMetricSaveButton = document.getElementById("study-formula-metric-save-button");
    els.studyFormulaMetricDeleteButton = document.getElementById("study-formula-metric-delete-button");
    els.studyFormulaMetricPreview = document.getElementById("study-formula-metric-preview");
    els.studySubjectiveSummary = document.getElementById("study-subjective-summary");
    els.studySubjectiveScaleSelect = document.getElementById("study-subjective-scale-select");
    els.studySubjectiveScoreLabels = document.getElementById("study-subjective-score-labels");
    els.studySubjectiveTableBody = document.getElementById("study-subjective-table-body");
    els.studySubjectiveAddCategoryButton = document.getElementById("study-subjective-add-category-button");
    els.studySubjectiveResetButton = document.getElementById("study-subjective-reset-button");
    els.iqExportStudySelect = document.getElementById("iq-export-study-select");
    els.iqExportStudyCreateInput = document.getElementById("iq-export-study-create-input");
    els.iqExportStudyCreateButton = document.getElementById("iq-export-study-create-button");
    els.iqExportStudyTargetNote = document.getElementById("iq-export-study-target-note");
    els.iqExportReadinessWarning = document.getElementById("iq-export-readiness-warning");
    els.iqExportReadinessWarningText = document.getElementById("iq-export-readiness-warning-text");
    els.iqExportReadinessWarningList = document.getElementById("iq-export-readiness-warning-list");
    els.iqExportReadinessWarningClose = document.getElementById("iq-export-readiness-warning-close");
    els.iqExportResearchIdInput = document.getElementById("iq-export-research-id-input");
    els.iqExportPatientIdInput = document.getElementById("iq-export-patient-id-input");
    els.iqExportMetadataInput = document.getElementById("iq-export-metadata");
    els.iqExportObjectiveInput = document.getElementById("iq-export-objective");
    els.iqExportSubjectiveInput = document.getElementById("iq-export-subjective");
    els.iqExportReviewPngInput = document.getElementById("iq-export-review-png");
    els.iqExportSummaryPngInput = document.getElementById("iq-export-summary-png");
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
    return trimTrailingDecimalZeros(Number(value).toFixed(decimals ?? 3));
  }

  function trimTrailingDecimalZeros(value) {
    const text = String(value ?? "");
    return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
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
          workflow: "ccta-iq",
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
  }

  function saveUiModePreference() {
    try {
      window.localStorage?.setItem(UI_MODE_STORAGE_KEY, "advanced");
    } catch (_error) {
      // Ignore storage issues.
    }
  }

  function loadSidebarTabPreference() {
    try {
      const stored = String(window.localStorage?.getItem(SIDEBAR_TAB_STORAGE_KEY) || "").trim().toLowerCase();
      const normalizedStored = stored === "define-objective" || stored === "define-subjective" ? "study-rules" : stored;
      if (SIDEBAR_TAB_KEY_SET.has(normalizedStored)) {
        state.activeSidebarTab = normalizedStored;
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

  function isRoiAnnotationType(type) {
    return type === "freehandRoi" || type === "brushRoi";
  }

  function isPolygonDraftTool(toolKey) {
    return POLYGON_DRAFT_TOOLS.has(toolKey);
  }

  function isMprNavigationAvailable() {
    return state.layout === "mpr" || state.activeToolKey === "mprCursor";
  }

  function isCircularRoiAnnotation(annotation) {
    return Boolean(annotation?.type === "freehandRoi" && annotation?.iqSourceTool === "circularRoi");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getDefaultIqTargetDefinition() {
    return IQ_ROI_TARGETS.find((target) => target.enabled !== false) ||
      IQ_ROI_TARGETS[0] ||
      normalizeIqTarget({ label: "Signal ROI", roiCategory: "coronary" }, 0);
  }

  function getEnabledIqTargets() {
    const enabledTargets = IQ_ROI_TARGETS.filter((target) => target.enabled !== false);
    return enabledTargets.length ? enabledTargets : IQ_ROI_TARGETS;
  }

  function getIqTargetOrderIndex(targetId) {
    const index = IQ_REQUIRED_TARGET_IDS.indexOf(safeString(targetId));
    return index >= 0 ? index : Number.POSITIVE_INFINITY;
  }

  function getIqTargetDefinition(targetId) {
    const target = IQ_TARGETS_BY_ID.get(safeString(targetId));
    if (target) {
      return target;
    }
    const id = safeString(targetId);
    if (id) {
      return {
        ...getDefaultIqTargetDefinition(),
        id,
        label: id.replace(/^custom_/, "").replace(/_/g, " ") || "Removed target",
        description: "Not in current objective protocol",
      };
    }
    return getDefaultIqTargetDefinition();
  }

  function buildIqTargetSnapshot(target) {
    const safeTarget = target || getDefaultIqTargetDefinition();
    return {
      id: safeTarget.id,
      enabled: safeTarget.enabled !== false,
      label: safeTarget.label,
      description: safeTarget.description,
      roiCategory: safeTarget.roiCategory,
      vessel: safeTarget.vessel,
      region: safeTarget.region,
      segment: safeTarget.segment,
      locationGroup: safeTarget.locationGroup,
      metricRoles: getIqTargetMetricRoles(safeTarget),
      statKeys: getIqTargetStatKeys(safeTarget),
      statRoles: getIqTargetStatRoles(safeTarget),
      statLabels: getIqTargetStatLabels(safeTarget),
      statGroups: getIqTargetStatGroups(safeTarget),
      fill: safeTarget.fill,
      stroke: safeTarget.stroke,
    };
  }

  function getIqTargetDefinitionForAnnotation(annotation) {
    if (!annotation) {
      return getDefaultIqTargetDefinition();
    }
    const liveTarget = IQ_TARGETS_BY_ID.get(safeString(annotation.iqTargetId));
    if (liveTarget) {
      return liveTarget;
    }
    if (annotation.iqTargetSnapshot) {
      return normalizeIqTarget(
        {
          ...annotation.iqTargetSnapshot,
          id: annotation.iqTargetId || annotation.iqTargetSnapshot.id,
        },
        0
      );
    }
    return getIqTargetDefinition(annotation.iqTargetId);
  }

  function getActiveIqTargetDefinition() {
    return IQ_TARGETS_BY_ID.get(state.iq.activeTargetId) || getDefaultIqTargetDefinition();
  }

  function isIqRoiAnnotation(annotation) {
    return Boolean(annotation && isRoiAnnotationType(annotation.type) && safeString(annotation.iqTargetId));
  }

  function getIqRoiTypeLabel(annotation) {
    if (annotation?.iqSourceTool === "circularRoi") {
      return "ROI Circle";
    }
    if (annotation?.iqSourceTool === "segmentationRoi") {
      return "ROI Multiple Click";
    }
    if (annotation?.type === "brushRoi") {
      return "ROI Brush";
    }
    return "ROI Draw";
  }

  function getIqAnnotationTheme(annotation) {
    const target = isIqRoiAnnotation(annotation) ? getIqTargetDefinitionForAnnotation(annotation) : null;
    if (!target) {
      return {
        stroke: "#57c8ff",
        fill: "rgba(87, 200, 255, 0.12)",
        labelFill: "rgba(87, 200, 255, 0.94)",
      };
    }
    return {
      stroke: target.stroke,
      fill: target.fill,
      labelFill: target.stroke,
    };
  }

  function getAnnotationLabelOffsetsMm(annotation) {
    return {
      xMm: Number(annotation?.labelOffsetXmm) || 0,
      yMm: Number(annotation?.labelOffsetYmm) || 0,
    };
  }

  function getFreehandLabelBasePlanePoint(annotation) {
    const planePoints = getFreehandPlanePoints(annotation);
    if (!planePoints.length) {
      return null;
    }
    const anchor = planePoints.reduce((best, point) => (point.y < best.y ? point : best), planePoints[0]);
    return {
      xMm: anchor.x,
      yMm: anchor.y,
    };
  }

  function getBrushLabelBasePlanePoint(annotation) {
    const centroid = getBrushMaskCentroid(annotation);
    if (!Number.isFinite(centroid.xMm) || !Number.isFinite(centroid.yMm)) {
      return null;
    }
    return centroid;
  }

  function getRoiLabelText(annotation, reconstruction) {
    if (annotation?.type === "brushRoi") {
      return getBrushLabel(annotation, reconstruction);
    }
    if (annotation?.type === "freehandRoi") {
      return getFreehandLabel(annotation, reconstruction);
    }
    return "";
  }

  function getRoiLabelPlacement(annotation, reconstruction, geometry, ctx) {
    if (!annotation || !geometry || !ctx) {
      return null;
    }
    const text = getRoiLabelText(annotation, reconstruction);
    if (!text) {
      return null;
    }
    const basePlanePoint = annotation.type === "brushRoi"
      ? getBrushLabelBasePlanePoint(annotation)
      : getFreehandLabelBasePlanePoint(annotation);
    if (!basePlanePoint) {
      return null;
    }
    const offsets = getAnnotationLabelOffsetsMm(annotation);
    const anchorCanvas = planeMmToCanvasPoint(
      geometry,
      basePlanePoint.xMm + offsets.xMm,
      basePlanePoint.yMm + offsets.yMm
    );
    return {
      text,
      basePlanePoint,
      offsets,
      anchorCanvas,
      bounds: getLabelChipBounds(ctx, text, anchorCanvas.x, anchorCanvas.y),
    };
  }

  function getIqWorkflowQueue(reconstruction, currentTargetId, count) {
    const orderedTargetIds = getEnabledIqTargets().map((target) => target.id);
    const completedIds = getCompletedIqTargetIds(reconstruction);
    const queue = [];
    const safeCurrentTargetId = safeString(currentTargetId);
    const startIndex = orderedTargetIds.indexOf(safeCurrentTargetId);

    if (startIndex < 0) {
      return queue;
    }

    for (let offset = 0; offset < orderedTargetIds.length && queue.length < (count || orderedTargetIds.length); offset += 1) {
      const candidateId = orderedTargetIds[(startIndex + offset) % orderedTargetIds.length];
      if (candidateId !== safeCurrentTargetId && completedIds.has(candidateId)) {
        continue;
      }
      queue.push(getIqTargetDefinition(candidateId));
    }

    return queue;
  }

  function assignIqTargetToAnnotation(annotation, targetId, options) {
    if (!annotation || !isRoiAnnotationType(annotation.type)) {
      return;
    }
    const target = getIqTargetDefinition(targetId);
    annotation.iqTargetId = target.id;
    annotation.iqTargetSnapshot = buildIqTargetSnapshot(target);
    annotation.iqSourceTool = options?.sourceTool || annotation.iqSourceTool || state.activeToolKey || "";
  }

  function setActiveIqTarget(targetId, options) {
    const target = IQ_TARGETS_BY_ID.get(safeString(targetId)) || getDefaultIqTargetDefinition();
    state.iq.activeTargetId = target.id;
    if (els.iqTargetSelect) {
      els.iqTargetSelect.value = target.id;
    }
    if (els.iqTargetDefineSelect) {
      els.iqTargetDefineSelect.value = target.id;
    }
    const selected = getSelectedAnnotation();
    if (!options?.keepSelection && isIqRoiAnnotation(selected) && selected.iqTargetId !== target.id) {
      state.selectedAnnotationId = null;
    }
    renderIqTargetPicker({ scrollToActive: true });
    renderIqObjectiveOutputs();
    renderAnnotationManager();
    requestRenderAll();
  }

  function updateIqTargetProtocolUi() {
    state.uiCache.reconstructionList = "";
    if (!IQ_TARGETS_BY_ID.has(state.iq.activeTargetId)) {
      state.iq.activeTargetId = getDefaultIqTargetDefinition().id;
    }
    renderIqTargetPicker({ scrollToActive: true, scrollBehavior: "auto" });
    renderIqObjectiveOutputs();
    renderReconstructionButtons();
    renderAnnotationManager();
    renderStudyRulesWorkspace();
    requestRenderAll();
  }

  function captureIqAnnotationTargetSnapshots() {
    state.reconstructions.forEach((reconstruction) => {
      (reconstruction.annotations || []).forEach((annotation) => {
        if (!isIqRoiAnnotation(annotation)) {
          return;
        }
        annotation.iqTargetSnapshot = buildIqTargetSnapshot(getIqTargetDefinitionForAnnotation(annotation));
      });
    });
  }

  function syncIqAnnotationSnapshotsForTarget(target) {
    if (!target?.id) {
      return;
    }
    state.reconstructions.forEach((reconstruction) => {
      (reconstruction.annotations || []).forEach((annotation) => {
        if (isIqRoiAnnotation(annotation) && annotation.iqTargetId === target.id) {
          annotation.iqTargetSnapshot = buildIqTargetSnapshot(target);
        }
      });
    });
  }

  function getIqTargetCategoryCounts() {
    return getEnabledIqTargets().reduce(
      (counts, target) => {
        getIqTargetStatKeys(target).forEach((statKey) => {
          const role = getIqTargetRoleForStat(target, statKey);
          const category = IQ_TARGET_METRIC_ROLE_DEFINITIONS[role]?.category || role;
          counts[category] = (counts[category] || 0) + 1;
        });
        return counts;
      },
      { coronary: 0, background: 0, noise: 0, other: 0 }
    );
  }

  function hasAnnotationsForIqTarget(targetId) {
    return state.reconstructions.some((reconstruction) =>
      (reconstruction.annotations || []).some((annotation) => isIqRoiAnnotation(annotation) && annotation.iqTargetId === targetId)
    );
  }

  function inferIqTargetVesselFromText(text, fallback) {
    const lower = cleanIqTargetString(text).toLowerCase();
    if (!lower) {
      return cleanIqTargetString(fallback);
    }
    if (/\brca\b|right coronary/.test(lower)) {
      return "RCA";
    }
    if (/\blad\b|left anterior descending/.test(lower)) {
      return "LAD";
    }
    if (/\blcx\b|left circumflex|circumflex/.test(lower)) {
      return "LCx";
    }
    if (/\blm\b|left main/.test(lower)) {
      return "LM";
    }
    return cleanIqTargetString(fallback);
  }

  function inferIqTargetLocationGroup(text, category, fallback) {
    if (category !== "coronary") {
      return category;
    }
    const lower = cleanIqTargetString(text).toLowerCase();
    if (/\bprox/.test(lower)) {
      return "proximal";
    }
    if (/mid\/dist|mid-dist|\bdist/.test(lower)) {
      return "distal";
    }
    if (/\bmid\b/.test(lower)) {
      return "mid";
    }
    return cleanIqTargetString(fallback);
  }

  function getCurrentObjectiveModelDefinition() {
    return getObjectiveModelDefinition(IQ_OBJECTIVE_MODEL_ID);
  }

  function describeIqTargetCategory(category) {
    return IQ_TARGET_CATEGORY_STYLES[normalizeIqTargetCategory(category)]?.label || IQ_TARGET_CATEGORY_STYLES.coronary.label;
  }

  function readIqTargetEditorDraft(baseTarget, options) {
    const category = normalizeIqTargetCategory(els.iqTargetCategorySelect?.value || baseTarget?.roiCategory);
    const style = IQ_TARGET_CATEGORY_STYLES[category];
    const label = cleanIqTargetString(els.iqTargetLabelInput?.value) || baseTarget?.label || "Custom ROI";
    const segment = cleanIqTargetString(els.iqTargetSegmentInput?.value);
    const inferenceSource = [label, segment].filter(Boolean).join(" ");
    const vessel = category === "coronary" ? inferIqTargetVesselFromText(inferenceSource, baseTarget?.vessel) : "";
    const locationGroup = inferIqTargetLocationGroup(inferenceSource, category, baseTarget?.locationGroup);
    const stroke = cleanIqTargetString(els.iqTargetColorInput?.value) || style.stroke;
    const region = cleanIqTargetString(baseTarget?.region) || (category === "coronary" ? label || "Signal ROI" : label || style.label);
    const description = segment || cleanIqTargetString(baseTarget?.description) || style.description;
    return normalizeIqTarget(
      {
        id: options?.newTarget ? createCustomIqTargetId(label) : baseTarget?.id,
        enabled: baseTarget?.enabled !== false,
        label,
        roiCategory: category,
        vessel,
        region,
        segment,
        locationGroup,
        description,
        stroke,
        fill: makeIqTargetFill(stroke, category),
      },
      IQ_ROI_TARGETS.length
    );
  }

  function populateIqTargetEditor(target) {
    const safeTarget = target || getActiveIqTargetDefinition();
    if (els.iqTargetLabelInput) {
      els.iqTargetLabelInput.value = safeTarget.label || "";
    }
    if (els.iqTargetCategorySelect) {
      els.iqTargetCategorySelect.value = normalizeIqTargetCategory(safeTarget.roiCategory);
    }
    if (els.iqTargetSegmentInput) {
      els.iqTargetSegmentInput.value = safeTarget.segment || "";
      els.iqTargetSegmentInput.placeholder =
        safeTarget.roiCategory === "coronary"
          ? "1, 5/6, proximal, distal, septal..."
          : safeTarget.roiCategory === "noise"
            ? "Aortic root, LV cavum, blood pool..."
            : "Muscle, myocardium, remote wall...";
    }
    if (els.iqTargetColorInput) {
      els.iqTargetColorInput.value = /^#[0-9a-f]{6}$/i.test(safeTarget.stroke || "") ? safeTarget.stroke : IQ_TARGET_CATEGORY_STYLES[normalizeIqTargetCategory(safeTarget.roiCategory)].stroke;
    }
  }

  function renderIqTargetProtocolPicker() {
    const optionMarkup = IQ_ROI_TARGETS.map(
      (target) => `<option value="${escapeHtml(target.id)}">${escapeHtml(getIqTargetRuleDisplayLabel(target))}</option>`
    ).join("");
    if (els.iqTargetDefineSelect) {
      els.iqTargetDefineSelect.innerHTML = optionMarkup;
      els.iqTargetDefineSelect.value = state.iq.activeTargetId;
    }
    if (!els.iqTargetDefineList) {
      return;
    }
    els.iqTargetDefineList.innerHTML = "";
    const fragment = document.createDocumentFragment();
    IQ_ROI_TARGETS.forEach((target) => {
      const category = normalizeIqTargetCategory(target.roiCategory);
      const style = IQ_TARGET_CATEGORY_STYLES[category] || IQ_TARGET_CATEGORY_STYLES.coronary;
      const inUse = hasAnnotationsForIqTarget(target.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "iq-target-button iq-target-protocol-button";
      button.classList.toggle("is-active", target.id === state.iq.activeTargetId);
      button.classList.toggle("is-complete", inUse);
      button.style.setProperty("--iq-target-color", target.stroke);
      button.dataset.targetId = target.id;
      button.title = inUse
        ? "Select to edit. This target cannot be deleted while measured ROIs exist."
        : "Select this target to edit its protocol definition.";
      const meta = [
        getIqTargetCollectedStatsDisplay(target),
        getIqTargetRoleNumberLabels(target).join(" + "),
        target.vessel || target.region,
        target.locationGroup ? target.locationGroup : "",
      ].filter(Boolean);
      button.innerHTML = `
        <span class="iq-target-topline">
          <span class="iq-target-title">
            <span class="iq-target-swatch"></span>
            <strong>${escapeHtml(getIqTargetRuleDisplayLabel(target))}</strong>
          </span>
          <span class="iq-target-status${inUse ? " is-complete" : ""}">${escapeHtml(inUse ? "In use" : style.label)}</span>
        </span>
        <span class="iq-target-meta">${escapeHtml(meta.join(" · "))}</span>
        <span class="iq-target-measurement">${escapeHtml(target.segment || target.description || `${style.label} target`)}</span>
      `;
      fragment.appendChild(button);
    });
    els.iqTargetDefineList.appendChild(fragment);
  }

  function renderIqTargetProtocolEditor() {
    const activeTarget = getActiveIqTargetDefinition();
    const model = getCurrentObjectiveModelDefinition();
    const counts = getEnabledIqTargets().reduce(
      (accumulator, target) => {
        getIqTargetMetricRoles(target).forEach((role) => {
          const category = IQ_TARGET_METRIC_ROLE_DEFINITIONS[role]?.category || role;
          accumulator[category] = (accumulator[category] || 0) + 1;
        });
        return accumulator;
      },
      { coronary: 0, background: 0, noise: 0 }
    );
    if (els.iqObjectiveModelSelect) {
      els.iqObjectiveModelSelect.value = model.id;
    }
    if (els.iqObjectiveModelLabel) {
      els.iqObjectiveModelLabel.textContent = model.label;
    }
    if (els.iqObjectiveModelNote) {
      els.iqObjectiveModelNote.textContent = model.description;
    }
    populateIqTargetEditor(activeTarget);
    renderIqTargetProtocolPicker();
    if (els.iqTargetProtocolNote) {
      els.iqTargetProtocolNote.textContent =
        `${model.shortLabel} • ${IQ_ROI_TARGETS.length} targets: ${counts.coronary || 0} signal/vessel, ${counts.background || 0} background, ${counts.noise || 0} noise. Saved as your default.`;
    }
    if (els.iqTargetEditorMetaNote) {
      els.iqTargetEditorMetaNote.textContent = model.id === "late_enhancement"
        ? "For Late Enhancement, image noise is derived from the SD of the LV Cavum signal ROI unless you explicitly add a separate noise target."
        : "Built-in coronary presets keep vessel and proximal/distal grouping internally so later SNR/CNR reporting stays structured.";
    }
    if (els.iqTargetEditorHelp) {
      els.iqTargetEditorHelp.textContent = model.helpText;
    }
    if (els.iqTargetDeleteButton) {
      els.iqTargetDeleteButton.disabled = IQ_ROI_TARGETS.length <= 1 || hasAnnotationsForIqTarget(activeTarget.id);
      els.iqTargetDeleteButton.title = hasAnnotationsForIqTarget(activeTarget.id)
        ? "Delete the saved ROIs for this target before removing it from the protocol."
        : "Remove this target from the objective protocol.";
    }
  }

  function saveActiveIqTargetDefinition() {
    const target = IQ_TARGETS_BY_ID.get(state.iq.activeTargetId) || getDefaultIqTargetDefinition();
    const updated = readIqTargetEditorDraft(target);
    IQ_ROI_TARGETS = IQ_ROI_TARGETS.map((existingTarget) => (existingTarget.id === target.id ? updated : existingTarget));
    refreshIqTargetIndexes();
    saveIqTargetProtocolToStorage();
    syncIqAnnotationSnapshotsForTarget(updated);
    state.iq.activeTargetId = updated.id;
    updateIqTargetProtocolUi();
    setStatus(`Updated objective target: ${updated.label}.`);
  }

  function addIqTargetDefinition() {
    const draft = readIqTargetEditorDraft(null, { newTarget: true });
    IQ_ROI_TARGETS = [...IQ_ROI_TARGETS, draft];
    refreshIqTargetIndexes();
    saveIqTargetProtocolToStorage();
    state.iq.activeTargetId = draft.id;
    updateIqTargetProtocolUi();
    setStatus(`Added objective target: ${draft.label}.`);
  }

  function deleteActiveIqTargetDefinition() {
    const target = IQ_TARGETS_BY_ID.get(state.iq.activeTargetId);
    if (!target || IQ_ROI_TARGETS.length <= 1) {
      setStatus("At least one objective target must remain.", "warning");
      return;
    }
    if (hasAnnotationsForIqTarget(target.id)) {
      setStatus(`Delete saved ROIs for ${target.label} before removing this target.`, "warning");
      return;
    }
    IQ_ROI_TARGETS = IQ_ROI_TARGETS.filter((existingTarget) => existingTarget.id !== target.id);
    refreshIqTargetIndexes();
    saveIqTargetProtocolToStorage();
    state.iq.activeTargetId = getDefaultIqTargetDefinition().id;
    updateIqTargetProtocolUi();
    setStatus(`Removed objective target: ${target.label}.`);
  }

  function applyObjectiveModelPreset(modelId, options) {
    const model = getObjectiveModelDefinition(modelId);
    captureIqAnnotationTargetSnapshots();
    IQ_OBJECTIVE_MODEL_ID = model.id;
    IQ_ROI_TARGETS = cloneDefaultIqTargets(model.id);
    IQ_OBJECTIVE_METRIC_RULES = normalizeIqMetricRules(null, model.id);
    IQ_ACTIVE_FORMULA_METRIC_ID = IQ_OBJECTIVE_METRIC_RULES.formulaMetrics?.[0]?.id || "";
    refreshIqTargetIndexes();
    saveIqTargetProtocolToStorage();
    state.selectedAnnotationId = null;
    state.iq.activeTargetId = getDefaultIqTargetDefinition().id;
    updateIqTargetProtocolUi();
    if (options?.statusMessage) {
      setStatus(options.statusMessage);
    }
  }

  function resetIqTargetProtocolToDefaults(options) {
    applyObjectiveModelPreset(IQ_OBJECTIVE_MODEL_ID, {
      statusMessage: options?.statusMessage || `Objective ROI protocol restored to the built-in ${getCurrentObjectiveModelDefinition().shortLabel} defaults.`,
    });
  }

  function confirmObjectiveModelChange(modelId) {
    const nextModel = getObjectiveModelDefinition(modelId);
    if (nextModel.id === IQ_OBJECTIVE_MODEL_ID) {
      return true;
    }
    return window.confirm(
      `Switch the objective preset to "${nextModel.shortLabel}"? This replaces the current objective target definitions for this study. Saved ROIs stay in place, but new measurements will follow the new preset.`
    );
  }

  function resetIqProtocolsToDefaultsWithConfirmation() {
    const confirmed = window.confirm(
      "Reset both objective and subjective definitions to the built-in defaults for the current app? This changes the saved defaults used for the next scoring steps."
    );
    if (!confirmed) {
      return false;
    }
    IQ_ACTIVE_STUDY_RULE_SET_ID = "";
    resetIqTargetProtocolToDefaults({ statusMessage: `Objective ROI protocol restored to the built-in ${getCurrentObjectiveModelDefinition().shortLabel} defaults.` });
    resetIqSubjectiveProtocolToDefaults();
    renderStudyRulesWorkspace({ force: true });
    setStatus("Objective and subjective built-in defaults restored.");
    return true;
  }

  function getIqTargetMeasurementPreview(target, annotation, reconstruction) {
    if (!target || !annotation || !reconstruction) {
      return {
        statusLabel: "Pending",
        detailText: "No ROI saved yet.",
      };
    }
    const summary = getMeasurementSummary(annotation, reconstruction) || {};
    const details = [];
    const statKeys = getIqTargetStatKeys(target);
    if (statKeys.includes("mean") && Number.isFinite(summary.mean)) {
      details.push(`Avg ${formatIqNumber(summary.mean, 0)} HU`);
    }
    if (statKeys.includes("sd") && Number.isFinite(summary.sd)) {
      details.push(`${target.roiCategory === "noise" ? "Noise" : "SD"} ${formatIqNumber(summary.sd, 1)} HU`);
    }
    if (statKeys.includes("min") && Number.isFinite(summary.minHu)) {
      details.push(`Min ${formatIqNumber(summary.minHu, 0)} HU`);
    }
    if (statKeys.includes("max") && Number.isFinite(summary.maxHu)) {
      details.push(`Max ${formatIqNumber(summary.maxHu, 0)} HU`);
    }
    if (Number.isFinite(summary.areaMm2)) {
      details.push(`${formatIqNumber(summary.areaMm2, 1)} mm2`);
    }
    return {
      statusLabel: "Measured",
      detailText: details.join(" • ") || "Measured",
    };
  }

  function getAnnotationFocusWorld(annotation) {
    if (!annotation) {
      return null;
    }
    if (annotation.type === "brushRoi") {
      const centroid = getBrushMaskCentroid(annotation);
      if (Number.isFinite(centroid.xMm) && Number.isFinite(centroid.yMm)) {
        return planePointToWorld(annotation.frame, centroid.xMm, centroid.yMm);
      }
    }
    if (annotation.type === "freehandRoi") {
      const planePoints = getFreehandPlanePoints(annotation);
      if (planePoints.length) {
        const centroid = planePoints.reduce(
          (accumulator, point) => ({
            xMm: accumulator.xMm + point.x,
            yMm: accumulator.yMm + point.y,
          }),
          { xMm: 0, yMm: 0 }
        );
        return planePointToWorld(
          annotation.frame,
          centroid.xMm / planePoints.length,
          centroid.yMm / planePoints.length
        );
      }
    }
    return Array.isArray(annotation.frame?.centerWorld) ? cloneVector(annotation.frame.centerWorld) : null;
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

  function focusIqTargetAnnotation(targetId) {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return false;
    }
    const annotation = getLatestIqAnnotationForTarget(reconstruction, targetId);
    if (!annotation) {
      setActiveIqTarget(targetId);
      return false;
    }

    setActiveSidebarTab("annotate");
    const focusWorld = getAnnotationFocusWorld(annotation) || cloneVector(annotation.frame.centerWorld);
    if (shouldRestoreAnnotationInMpr(annotation)) {
      restoreMprFrameForAnnotation(annotation, focusWorld);
    } else {
      state.mpr.centerWorld = focusWorld;
      setLayout("presentation");
      resetPresentationViewportTransform({ render: false });
      setActiveViewport("presentation");
    }
    setSelectedAnnotation(annotation.id);
    requestRenderAll();
    return true;
  }

  function getIqTargetRequiredSummaryKeys(target) {
    const required = new Set();
    getIqTargetStatKeys(target).forEach((statKey) => {
      if (statKey === "mean") required.add("mean");
      if (statKey === "sd") required.add("sd");
      if (statKey === "min") required.add("minHu");
      if (statKey === "max") required.add("maxHu");
    });
    getIqTargetMetricRoles(target).forEach((role) => {
      if (role === "signal" || role === "background") required.add("mean");
      if (role === "noise") required.add("sd");
    });
    return Array.from(required);
  }

  function getIqTargetMeasurementMissingReason(reconstruction, targetId) {
    const target = getIqTargetDefinition(targetId);
    const annotation = getLatestIqAnnotationForTarget(reconstruction, target.id);
    if (!annotation) {
      return "ROI not placed";
    }
    const summary = getMeasurementSummary(annotation, reconstruction) || {};
    if (!Number.isFinite(summary.areaMm2) || summary.areaMm2 <= 0) {
      return "ROI has no measurable area";
    }
    const missingStats = getIqTargetRequiredSummaryKeys(target).filter((summaryKey) => !Number.isFinite(summary[summaryKey]));
    if (missingStats.length) {
      const labels = missingStats.map((summaryKey) => {
        if (summaryKey === "mean") return "mean HU";
        if (summaryKey === "sd") return "SD HU";
        if (summaryKey === "minHu") return "min HU";
        if (summaryKey === "maxHu") return "max HU";
        return summaryKey;
      });
      return `missing ${labels.join(", ")}`;
    }
    return "";
  }

  function getCompletedIqTargetIds(reconstruction) {
    return new Set(
      getEnabledIqTargets()
        .filter((target) => !getIqTargetMeasurementMissingReason(reconstruction, target.id))
        .map((target) => target.id)
    );
  }

  function getNextPendingIqTargetId(reconstruction, startTargetId) {
    const orderedTargetIds = getEnabledIqTargets().map((target) => target.id);
    if (!orderedTargetIds.length) {
      return "";
    }
    const completedIds = getCompletedIqTargetIds(reconstruction);
    const startIndex = Math.max(orderedTargetIds.indexOf(safeString(startTargetId)), -1);
    for (let offset = 1; offset <= orderedTargetIds.length; offset += 1) {
      const candidateId = orderedTargetIds[(startIndex + offset + orderedTargetIds.length) % orderedTargetIds.length];
      if (!completedIds.has(candidateId)) {
        return candidateId;
      }
    }
    return "";
  }

  function getFirstIncompleteIqTargetId(reconstruction) {
    return getNextPendingIqTargetId(reconstruction, "");
  }

  function getLatestIqAnnotationForTarget(reconstruction, targetId, frame) {
    const annotations = (reconstruction?.annotations || [])
      .filter((annotation) => isIqRoiAnnotation(annotation) && annotation.iqTargetId === targetId)
      .sort((left, right) => right.id - left.id);
    if (!frame) {
      return annotations[0] || null;
    }
    return annotations.find((annotation) => isAnnotationVisible(annotation, frame)) || annotations[0] || null;
  }

  function getIqWorkflowState(reconstruction) {
    const completedIds = getCompletedIqTargetIds(reconstruction);
    const completedCount = IQ_REQUIRED_TARGET_IDS.filter((targetId) => completedIds.has(targetId)).length;
    const currentTarget = getIqTargetDefinition(state.iq.activeTargetId);
    const currentIncomplete = !completedIds.has(currentTarget.id);
    const currentTargetId = currentIncomplete ? currentTarget.id : getFirstIncompleteIqTargetId(reconstruction) || currentTarget.id;
    const nextTargetId = getNextPendingIqTargetId(reconstruction, currentTargetId);
    return {
      completedIds,
      completedCount,
      currentTarget: getIqTargetDefinition(currentTargetId),
      nextTarget: nextTargetId ? getIqTargetDefinition(nextTargetId) : null,
      isComplete: completedCount >= IQ_REQUIRED_TARGET_IDS.length,
    };
  }

  function syncActiveIqTargetToWorkflow(reconstruction, options) {
    const selected = getSelectedAnnotation();
    if (!options?.force && isIqRoiAnnotation(selected)) {
      state.iq.activeTargetId = selected.iqTargetId;
      return getIqTargetDefinition(state.iq.activeTargetId);
    }
    const nextTargetId = getFirstIncompleteIqTargetId(reconstruction);
    const enabledTargets = getEnabledIqTargets();
    state.iq.activeTargetId = nextTargetId || enabledTargets[enabledTargets.length - 1]?.id || enabledTargets[0]?.id || "";
    return getIqTargetDefinition(state.iq.activeTargetId);
  }

  function advanceIqMeasurementWorkflow(options) {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return false;
    }
    const completedTargetId = safeString(options?.completedTargetId || state.iq.activeTargetId);
    const completedTarget = getIqTargetDefinition(completedTargetId);
    const nextTargetId = getNextPendingIqTargetId(reconstruction, completedTargetId);
    if (!nextTargetId) {
      state.iq.activeTargetId = completedTarget.id;
      renderIqTargetPicker({ scrollToActive: true });
      renderIqObjectiveOutputs();
      requestRenderAll();
      setStatus(`Objective ROI workflow complete for ${reconstruction.label}.`);
      return true;
    }
    state.iq.activeTargetId = nextTargetId;
    const nextTarget = getIqTargetDefinition(nextTargetId);
    renderIqTargetPicker({ scrollToActive: true });
    renderIqObjectiveOutputs();
    requestRenderAll();
    setStatus(`${completedTarget.label} finished. Next: ${nextTarget.label}.`);
    return true;
  }

  function finishCurrentIqMeasurementStep(viewportId) {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return false;
    }
    if (state.polygonDraft?.viewportId === viewportId && isPolygonDraftTool(state.polygonDraft.sourceTool || state.activeToolKey)) {
      finalizePolygonDraft(viewportId, state.polygonDraft.hoverWorld || null, { advanceWorkflow: true });
      return true;
    }
    const frame = state.viewports[viewportId]?.lastFrame || getViewportFrame(viewportId, reconstruction);
    const selected = getSelectedAnnotation();
    const completedAnnotation =
      (isIqRoiAnnotation(selected) && (!frame || isAnnotationVisible(selected, frame)) ? selected : null) ||
      getLatestIqAnnotationForTarget(reconstruction, state.iq.activeTargetId, frame);
    if (!completedAnnotation) {
      return false;
    }
    setSelectedAnnotation(completedAnnotation.id);
    return advanceIqMeasurementWorkflow({ completedTargetId: completedAnnotation.iqTargetId });
  }

  function getDefaultIqSubjectiveFieldDefinition() {
    return IQ_SUBJECTIVE_FIELDS[0] || normalizeIqSubjectiveField(DEFAULT_IQ_SUBJECTIVE_FIELDS[0], 0, IQ_SUBJECTIVE_SCALE);
  }

  function getIqSubjectiveFieldDefinition(fieldKey) {
    return IQ_SUBJECTIVE_FIELDS.find((field) => field.key === fieldKey) || getDefaultIqSubjectiveFieldDefinition();
  }

  function getIqSubjectiveScoreLabel(value, field) {
    const fieldScale = field ? getIqSubjectiveFieldScaleKey(field) : String(IQ_SUBJECTIVE_SCALE);
    return (
      field?.scoreLabels?.[value] ||
      field?.scoreLabels?.[String(value)] ||
      IQ_SUBJECTIVE_SCORE_LABELS?.[value] ||
      IQ_SUBJECTIVE_SCORE_LABELS?.[String(value)] ||
      IQ_SUBJECTIVE_SCORE_LABELS_BY_SCALE[fieldScale]?.[value] ||
      IQ_SUBJECTIVE_SCORE_LABELS_BY_SCALE[IQ_SUBJECTIVE_SCALE]?.[value] ||
      (value === 0 ? "No" : value === Number(fieldScale) ? "Best" : value === 1 ? "Worst" : `Score ${value}`)
    );
  }

  function isValidIqSubjectiveScore(score, field) {
    return Number.isFinite(score) && getIqSubjectiveScaleValues(field || IQ_SUBJECTIVE_SCALE).includes(score);
  }

  function createUniqueIqSubjectiveFieldKey(label) {
    const existingKeys = new Set(IQ_SUBJECTIVE_FIELDS.map((field) => field.key));
    const baseKey = createIqSubjectiveFieldKey(label, IQ_SUBJECTIVE_FIELDS.length);
    let candidateKey = baseKey;
    let suffix = 1;
    while (existingKeys.has(candidateKey)) {
      suffix += 1;
      candidateKey = `${baseKey}_${suffix}`;
    }
    return candidateKey;
  }

  function updateIqSubjectiveProtocolUi(options) {
    if (!IQ_SUBJECTIVE_FIELDS.some((field) => field.key === state.iq.subjectiveActiveFieldKey)) {
      state.iq.subjectiveActiveFieldKey = getDefaultIqSubjectiveFieldDefinition().key;
    }
    renderIqSubjectiveProtocolEditor({ force: true });
    renderIqSubjectiveCards();
    renderIqObjectiveOutputs();
    renderReconstructionButtons();
    requestProjectSessionAutosave();
    if (options?.renderOnly !== true) {
      requestRenderAll();
    }
  }

  function getIqSubjectiveProtocolSummaryText() {
    const scaleLabels = Array.from(new Set(IQ_SUBJECTIVE_FIELDS.map((field) => getIqSubjectiveScaleLabel(field))));
    return `${IQ_SUBJECTIVE_FIELDS.length} categories • ${scaleLabels.join(", ")} scoring • saved as your default.`;
  }

  function renameIqSubjectiveScoreLabel(scoreValue, fieldKey) {
    const value = Number.parseInt(scoreValue, 10);
    const field = fieldKey ? getIqSubjectiveFieldDefinition(fieldKey) : null;
    if (!getIqSubjectiveScaleValues(field || IQ_SUBJECTIVE_SCALE).includes(value)) {
      return;
    }
    const currentLabel = getIqSubjectiveScoreLabel(value, field);
    const nextLabel = window.prompt(`Rename Likert score ${value}`, currentLabel);
    if (nextLabel == null) {
      return;
    }
    const cleaned = cleanIqSubjectiveString(nextLabel);
    if (!cleaned) {
      setStatus("Likert score labels cannot be empty.", "warning");
      return;
    }
    if (field) {
      IQ_SUBJECTIVE_FIELDS = IQ_SUBJECTIVE_FIELDS.map((existingField) =>
        existingField.key === field.key
          ? {
              ...existingField,
              scoreLabels: normalizeIqSubjectiveScoreLabels(
                {
                  ...existingField.scoreLabels,
                  [value]: cleaned,
                },
                existingField.scale
              ),
            }
          : existingField
      );
    } else {
      IQ_SUBJECTIVE_SCORE_LABELS = normalizeIqSubjectiveScoreLabels(
        {
          ...IQ_SUBJECTIVE_SCORE_LABELS,
          [value]: cleaned,
        },
        IQ_SUBJECTIVE_SCALE
      );
    }
    saveIqSubjectiveProtocolToStorage();
    renderIqSubjectiveProtocolEditor({ force: true });
    renderIqSubjectiveCards();
    renderStudyRulesWorkspace({ force: true });
    setStatus(`Likert score ${value} relabeled to ${cleaned}.`);
  }

  function populateIqSubjectiveEditor(field) {
    const safeField = field || getDefaultIqSubjectiveFieldDefinition();
    if (els.iqSubjectiveScaleSelect) {
      els.iqSubjectiveScaleSelect.innerHTML = getIqSubjectiveScaleOptionsMarkup(safeField.scale || IQ_SUBJECTIVE_SCALE);
      els.iqSubjectiveScaleSelect.value = String(safeField.scale || IQ_SUBJECTIVE_SCALE);
    }
    if (els.iqSubjectiveLabelInput) {
      els.iqSubjectiveLabelInput.value = safeField.label || "";
    }
    if (els.iqSubjectiveDescriptionEditor) {
      els.iqSubjectiveDescriptionEditor.innerHTML = getIqSubjectiveScaleValues(safeField)
        .map((value) => {
          const description =
            safeField.descriptions?.[value] ||
            getGenericIqSubjectiveDescriptions(safeField.scale)[value] ||
            `Score ${value}`;
          return `
            <label class="number-field subjective-description-field">
              <span data-subjective-score-label="${value}" title="Double-click to rename this Likert value">${value} · ${escapeHtml(getIqSubjectiveScoreLabel(value, safeField))}</span>
              <textarea data-subjective-description-score="${value}" rows="2">${escapeHtml(description)}</textarea>
            </label>
          `;
        })
        .join("");
    }
  }

  function renderIqSubjectiveProtocolEditor(options) {
    if (!els.iqSubjectiveProtocolEditor) {
      return;
    }
    const isEditing = els.iqSubjectiveProtocolEditor.contains(document.activeElement);
    const requestedFieldKey =
      options?.force === true || !isEditing
        ? state.iq.subjectiveActiveFieldKey
        : els.iqSubjectiveFieldSelect?.value || state.iq.subjectiveActiveFieldKey;
    const activeField = getIqSubjectiveFieldDefinition(requestedFieldKey);
    if (els.iqSubjectiveProtocolNote) {
      els.iqSubjectiveProtocolNote.textContent = getIqSubjectiveProtocolSummaryText();
    }
    if (els.iqSubjectiveDeleteButton) {
      els.iqSubjectiveDeleteButton.disabled = IQ_SUBJECTIVE_FIELDS.length <= 1;
      els.iqSubjectiveDeleteButton.title =
        IQ_SUBJECTIVE_FIELDS.length <= 1
          ? "At least one subjective category must remain."
          : "Remove this category from the subjective export protocol.";
    }
    if (isEditing && options?.force !== true) {
      return;
    }
    if (els.iqSubjectiveFieldSelect) {
      els.iqSubjectiveFieldSelect.innerHTML = IQ_SUBJECTIVE_FIELDS.map(
        (field) => `<option value="${escapeHtml(field.key)}">${escapeHtml(field.label)}</option>`
      ).join("");
      els.iqSubjectiveFieldSelect.value = activeField.key;
    }
    populateIqSubjectiveEditor(activeField);
  }

  function readIqSubjectiveEditorDraft(baseField) {
    const nextScale = normalizeIqSubjectiveFieldScale(els.iqSubjectiveScaleSelect?.value || baseField?.scale || IQ_SUBJECTIVE_SCALE, IQ_SUBJECTIVE_SCALE);
    const previousScale = getIqSubjectiveFieldScaleKey(baseField?.scale || IQ_SUBJECTIVE_SCALE);
    const scaleChanged = nextScale !== previousScale;
    const label = cleanIqSubjectiveString(els.iqSubjectiveLabelInput?.value) || baseField?.label || "Custom category";
    const descriptions = {};
    const defaults = getGenericIqSubjectiveDescriptions(nextScale);
    getIqSubjectiveScaleValues(nextScale).forEach((value) => {
      const input = els.iqSubjectiveDescriptionEditor?.querySelector(`[data-subjective-description-score="${value}"]`);
      descriptions[value] =
        (!scaleChanged && cleanIqSubjectiveString(input?.value)) ||
        (!scaleChanged && cleanIqSubjectiveString(baseField?.descriptions?.[value])) ||
        defaults[value] ||
        `Score ${value}`;
    });
    return {
      scale: nextScale,
      field: normalizeIqSubjectiveField(
        {
          key: baseField?.key,
          scale: nextScale,
          label,
          scoreLabels: scaleChanged ? getDefaultIqSubjectiveScoreLabels(nextScale) : baseField?.scoreLabels,
          descriptions,
        },
        IQ_SUBJECTIVE_FIELDS.findIndex((field) => field.key === baseField?.key),
        nextScale
      ),
    };
  }

  function saveActiveIqSubjectiveFieldDefinition(options) {
    const field = getIqSubjectiveFieldDefinition(els.iqSubjectiveFieldSelect?.value || state.iq.subjectiveActiveFieldKey);
    const fieldIndex = Math.max(0, IQ_SUBJECTIVE_FIELDS.findIndex((item) => item.key === field.key));
    const draft = readIqSubjectiveEditorDraft(field);
    IQ_SUBJECTIVE_SCALE = normalizeIqSubjectiveScale(draft.scale);
    IQ_SUBJECTIVE_SCORE_LABELS = normalizeIqSubjectiveScoreLabels(IQ_SUBJECTIVE_SCORE_LABELS, IQ_SUBJECTIVE_SCALE);
    IQ_SUBJECTIVE_FIELDS = IQ_SUBJECTIVE_FIELDS.map((existingField, index) =>
      index === fieldIndex
        ? draft.field
        : normalizeIqSubjectiveField(existingField, index, existingField.scale || IQ_SUBJECTIVE_SCALE)
    );
    saveIqSubjectiveProtocolToStorage();
    state.iq.subjectiveActiveFieldKey = draft.field.key;
    updateIqSubjectiveProtocolUi();
    if (options?.silent !== true) {
      setStatus(options?.statusMessage || `Updated subjective category: ${draft.field.label}.`);
    }
    return draft.field;
  }

  function addIqSubjectiveFieldDefinition() {
    const label = `Custom category ${IQ_SUBJECTIVE_FIELDS.length + 1}`;
    const field = normalizeIqSubjectiveField(
      {
        key: createUniqueIqSubjectiveFieldKey(label),
        scale: IQ_SUBJECTIVE_SCALE,
        label,
        descriptions: getGenericIqSubjectiveDescriptions(IQ_SUBJECTIVE_SCALE),
      },
      IQ_SUBJECTIVE_FIELDS.length,
      IQ_SUBJECTIVE_SCALE
    );
    IQ_SUBJECTIVE_FIELDS = [...IQ_SUBJECTIVE_FIELDS, field];
    saveIqSubjectiveProtocolToStorage();
    state.iq.subjectiveActiveFieldKey = field.key;
    updateIqSubjectiveProtocolUi();
    setStatus(`Added subjective category: ${field.label}.`);
  }

  function deleteActiveIqSubjectiveFieldDefinition() {
    const field = getIqSubjectiveFieldDefinition(els.iqSubjectiveFieldSelect?.value || state.iq.subjectiveActiveFieldKey);
    if (!field || IQ_SUBJECTIVE_FIELDS.length <= 1) {
      setStatus("At least one subjective category must remain.", "warning");
      return;
    }
    IQ_SUBJECTIVE_FIELDS = IQ_SUBJECTIVE_FIELDS.filter((existingField) => existingField.key !== field.key);
    saveIqSubjectiveProtocolToStorage();
    state.iq.subjectiveActiveFieldKey = getDefaultIqSubjectiveFieldDefinition().key;
    updateIqSubjectiveProtocolUi();
    setStatus(`Removed subjective category: ${field.label}.`);
  }

  function resetIqSubjectiveProtocolToDefaults() {
    const protocol = cloneDefaultIqSubjectiveProtocol();
    IQ_SUBJECTIVE_SCALE = protocol.scale;
    IQ_SUBJECTIVE_FIELDS = protocol.fields;
    IQ_SUBJECTIVE_SCORE_LABELS = protocol.scoreLabels;
    saveIqSubjectiveProtocolToStorage();
    state.iq.subjectiveActiveFieldKey = getDefaultIqSubjectiveFieldDefinition().key;
    updateIqSubjectiveProtocolUi();
    setStatus("Subjective scoring protocol restored to the built-in CCTA IQ defaults.");
  }

  function getStudyRuleSetNameDraft() {
    return cleanIqTargetString(els.studyRulesNameInput?.value) || "CCTA IQ study rules";
  }

  function renderStudyRuleSetPicker() {
    if (!els.studyRulesSavedSelect) {
      return;
    }
    els.studyRulesSavedSelect.innerHTML = [
      `<option value="">Current unsaved rules</option>`,
      ...IQ_STUDY_RULE_SETS.map((ruleSet) =>
        `<option value="${escapeHtml(ruleSet.id)}">${escapeHtml(ruleSet.name)}</option>`
      ),
    ].join("");
    els.studyRulesSavedSelect.value = IQ_ACTIVE_STUDY_RULE_SET_ID;
    if (els.studyRulesDeleteButton) {
      els.studyRulesDeleteButton.disabled = !IQ_ACTIVE_STUDY_RULE_SET_ID;
    }
  }

  function renderStudyObjectiveSourceSelects() {
    const backgroundOptions = [
      { value: "all_background", label: "Average all Background-use ROI mean HU" },
      { value: "none", label: "No background / do not compute CNR" },
      ...IQ_ROI_TARGETS
        .filter((target) => getIqTargetRoleForStat(target, "mean") === "background")
        .map((target) => ({ value: `target:${target.id}`, label: `${getIqTargetRuleDisplayLabel(target)} mean HU` })),
    ];
    const noiseOptions = [
      { value: "all_noise", label: "Average all Noise-use ROI SD HU" },
      { value: "signal_sd", label: "Average all Signal-use ROI SD HU" },
      ...IQ_ROI_TARGETS
        .filter((target) => getIqTargetRoleForStat(target, "sd") === "noise")
        .map((target) => ({ value: `target:${target.id}`, label: `${getIqTargetRuleDisplayLabel(target)} SD HU` })),
    ];
    if (els.studyMetricBackgroundSource) {
      els.studyMetricBackgroundSource.innerHTML = backgroundOptions
        .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
        .join("");
      els.studyMetricBackgroundSource.value = IQ_OBJECTIVE_METRIC_RULES.backgroundSource;
      if (els.studyMetricBackgroundSource.value !== IQ_OBJECTIVE_METRIC_RULES.backgroundSource) {
        els.studyMetricBackgroundSource.value = "all_background";
      }
    }
    if (els.studyMetricNoiseSource) {
      els.studyMetricNoiseSource.innerHTML = noiseOptions
        .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
        .join("");
      els.studyMetricNoiseSource.value = IQ_OBJECTIVE_METRIC_RULES.noiseSource;
      if (els.studyMetricNoiseSource.value !== IQ_OBJECTIVE_METRIC_RULES.noiseSource) {
        els.studyMetricNoiseSource.value = getDefaultIqMetricRulesForModel(IQ_OBJECTIVE_MODEL_ID).noiseSource;
      }
    }
  }

  function getStudyFormulaMetrics() {
    IQ_OBJECTIVE_METRIC_RULES = normalizeIqMetricRules(IQ_OBJECTIVE_METRIC_RULES, IQ_OBJECTIVE_MODEL_ID);
    return IQ_OBJECTIVE_METRIC_RULES.formulaMetrics || [];
  }

  function getVisibleStudyFormulaMetrics(rules) {
    const metricRules = rules || normalizeIqMetricRules(IQ_OBJECTIVE_METRIC_RULES, IQ_OBJECTIVE_MODEL_ID);
    return (metricRules.formulaMetrics || []).filter((metric) => shouldIncludeIqFormulaMetric(metric, metricRules));
  }

  function getActiveStudyFormulaMetric() {
    const metrics = getStudyFormulaMetrics();
    return metrics.find((metric) => metric.id === IQ_ACTIVE_FORMULA_METRIC_ID) || metrics[0] || null;
  }

  function getStudyFormulaTokenDefinitions() {
    const operatorTokens = [
      { label: "All area", value: "sum(all.area)" },
      { label: "+", value: " + " },
      { label: "-", value: " - " },
      { label: "*", value: " * " },
      { label: "/", value: " / " },
      { label: "^", value: " ^ " },
      { label: "(", value: "(" },
      { label: ")", value: ")" },
      { label: "sqrt()", value: "sqrt()" },
      { label: "abs()", value: "abs()" },
      { label: "round()", value: "round()" },
      { label: "pow()", value: "pow(, )" },
    ];
    const assignments = getEnabledIqTargets().flatMap((target) =>
      getIqTargetStatKeys(target).map((statKey) => {
        const role = getIqTargetRoleForStat(target, statKey);
        const roleLabel = getIqTargetRoleLabelForStat(target, statKey);
        const group = getIqTargetGroupForStat(target, statKey);
        const assignmentLabel = getIqTargetStatAssignmentLabel(target, statKey);
        const color = IQ_TARGET_METRIC_ROLE_DEFINITIONS[role]?.color || target.stroke || IQ_TARGET_CATEGORY_STYLES.other.stroke;
        const value = `avg(target:${target.id}.${statKey})`;
        return {
          target,
          statKey,
          role,
          roleLabel,
          group,
          assignmentLabel,
          color,
          value,
        };
      })
    );
    const makeAverageExpression = (items) => {
      const values = items.map((item) => item.value);
      if (!values.length) return "";
      return values.length === 1 ? values[0] : `(${values.join(" + ")}) / ${values.length}`;
    };
    const totalTokens = Object.values(
      assignments.reduce((groups, item) => {
        const key = `${item.role}:${item.roleLabel}`;
        if (!groups[key]) {
          groups[key] = {
            label: `${item.roleLabel}_total`,
            role: item.role,
            color: item.color,
            items: [],
          };
        }
        groups[key].items.push(item);
        return groups;
      }, {})
    ).map((group) => ({
      label: group.label,
      value: makeAverageExpression(group.items),
      role: group.role,
      color: group.color,
    })).filter((token) => token.value);
    const groupedTokens = Object.values(
      assignments.reduce((groups, item) => {
        if (!item.group) {
          return groups;
        }
        const key = `${item.role}:${item.roleLabel}:${item.group}`;
        if (!groups[key]) {
          groups[key] = {
            label: `${item.roleLabel}_${item.group}`,
            role: item.role,
            color: item.color,
            items: [],
          };
        }
        groups[key].items.push(item);
        return groups;
      }, {})
    ).map((group) => ({
      label: group.label,
      value: makeAverageExpression(group.items),
      role: group.role,
      color: group.color,
    })).filter((token) => token.value);
    const assignmentTokens = assignments.map((item) => ({
      label: item.assignmentLabel,
      value: item.value,
      role: item.role,
      color: item.color,
    }));
    const targetTokens = assignments.map((item) => ({
      label: `${item.target.label} ${getIqTargetStatDisplayLabel(item.statKey)}`,
      value: item.value,
      role: item.role,
      color: item.color,
    }));
    return [...totalTokens, ...groupedTokens, ...assignmentTokens, ...targetTokens, ...operatorTokens];
  }

  function insertTextIntoFormulaInput(text) {
    const input = els.studyFormulaMetricExpressionInput;
    if (!input) {
      return;
    }
    const insertion = String(text ?? "");
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = `${input.value.slice(0, start)}${insertion}${input.value.slice(end)}`;
    const cursor = start + insertion.length;
    input.focus();
    input.setSelectionRange?.(cursor, cursor);
    IQ_ACTIVE_STUDY_RULE_SET_ID = "";
    syncActiveStudyFormulaMetricDraftToState();
    updateStudyFormulaMetricCardDraft();
    renderStudyFormulaMetricPreviewFromDraft();
  }

  function renderStudyFormulaColorPreview() {
    if (!els.studyFormulaMetricColorPreview) {
      return;
    }
    const expression = els.studyFormulaMetricExpressionInput?.value || "";
    if (!expression) {
      els.studyFormulaMetricColorPreview.innerHTML = `<span class="formula-muted">Equation preview appears here. Matching parentheses get the same color.</span>`;
      return;
    }
    const colors = ["#fdba90", "#93cfff", "#8fe6ab", "#ffd27f", "#f0a6ca", "#c8b6ff", "#8ee6df"];
    const stack = [];
    let pairIndex = 0;
    let html = "";
    for (let index = 0; index < expression.length; index += 1) {
      const character = expression[index];
      if (character === "(") {
        const color = colors[pairIndex % colors.length];
        pairIndex += 1;
        stack.push(color);
        html += `<span class="formula-paren" style="--paren-color:${color}">(</span>`;
      } else if (character === ")") {
        const color = stack.pop();
        html += color
          ? `<span class="formula-paren" style="--paren-color:${color}">)</span>`
          : `<span class="formula-paren is-unmatched">)</span>`;
      } else {
        html += escapeHtml(character);
      }
    }
    if (stack.length) {
      html += ` <span class="formula-balance-warning">${stack.length} unmatched opening parenthesis${stack.length === 1 ? "" : "es"}</span>`;
    }
    els.studyFormulaMetricColorPreview.innerHTML = html;
  }

  function renderStudyFormulaMetricPreviewFromDraft() {
    renderStudyFormulaColorPreview();
    if (!els.studyFormulaMetricPreview) {
      return;
    }
    if (els.studyFormulaMetricExpressionInput?.disabled) {
      els.studyFormulaMetricPreview.textContent =
        "No formula metric is selected under the current computed-metric switches.";
      return;
    }
    const formula = els.studyFormulaMetricExpressionInput?.value || "";
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      els.studyFormulaMetricPreview.textContent =
        "Formula saved with the protocol. Load or select a reconstruction to preview the numeric result.";
      return;
    }
    const rows = buildIqObjectiveRowsForReconstruction(reconstruction);
    const result = evaluateIqFormulaExpression(formula, rows);
    els.studyFormulaMetricPreview.textContent = result.error
      ? `Preview for ${reconstruction.label}: not computable yet (${result.error})`
      : `Preview for ${reconstruction.label}: ${formatIqNumber(result.value, 4)} ${els.studyFormulaMetricUnitInput?.value || ""}`.trim();
  }

  function updateStudyFormulaMetricCardDraft() {
    const activeMetric = getActiveStudyFormulaMetric();
    if (!activeMetric || !els.studyFormulaMetricList) {
      return;
    }
    const card = els.studyFormulaMetricList.querySelector(`[data-study-formula-metric-id="${CSS.escape(activeMetric.id)}"]`);
    if (!card) {
      return;
    }
    const label = cleanIqTargetString(els.studyFormulaMetricNameInput?.value) || activeMetric.label;
    const formula = cleanIqTargetString(els.studyFormulaMetricExpressionInput?.value) || activeMetric.formula;
    const unit = cleanIqTargetString(els.studyFormulaMetricUnitInput?.value);
    const title = card.querySelector("strong");
    const code = card.querySelector("code");
    const meta = card.querySelector("span:last-child");
    if (title) title.textContent = label;
    if (code) code.textContent = formula;
    if (meta) meta.textContent = `${activeMetric.enabled === false ? "Disabled" : "Enabled"}${unit ? ` • ${unit}` : ""}`;
  }

  function syncActiveStudyFormulaMetricDraftToState() {
    const activeMetric = getActiveStudyFormulaMetric();
    if (!activeMetric) {
      return null;
    }
    const nextMetric = normalizeIqFormulaMetrics(
      [{
        ...activeMetric,
        label: els.studyFormulaMetricNameInput?.value || activeMetric.label,
        unit: els.studyFormulaMetricUnitInput?.value || "",
        formula: els.studyFormulaMetricExpressionInput?.value || activeMetric.formula,
      }],
      IQ_OBJECTIVE_MODEL_ID
    )[0];
    nextMetric.id = activeMetric.id;
    IQ_OBJECTIVE_METRIC_RULES = {
      ...normalizeIqMetricRules(IQ_OBJECTIVE_METRIC_RULES, IQ_OBJECTIVE_MODEL_ID),
      formulaMetrics: getStudyFormulaMetrics().map((metric) => metric.id === activeMetric.id ? nextMetric : metric),
    };
    IQ_ACTIVE_FORMULA_METRIC_ID = nextMetric.id;
    return nextMetric;
  }

  function focusStudyFormulaMetricNameInput(options) {
    if (!els.studyFormulaMetricNameInput || els.studyFormulaMetricNameInput.disabled) {
      return;
    }
    els.studyFormulaMetricNameInput.focus();
    if (options?.select !== false) {
      els.studyFormulaMetricNameInput.select();
    }
  }

  function promptRenameActiveStudyFormulaMetric() {
    const activeMetric = getActiveStudyFormulaMetric();
    if (!activeMetric) {
      return;
    }
    const nextLabel = window.prompt("Rename formula metric", activeMetric.label);
    if (nextLabel === null) {
      focusStudyFormulaMetricNameInput();
      return;
    }
    const cleanLabel = cleanIqTargetString(nextLabel);
    if (!cleanLabel) {
      focusStudyFormulaMetricNameInput();
      return;
    }
    els.studyFormulaMetricNameInput.value = cleanLabel;
    saveActiveStudyFormulaMetric();
  }

  function renderStudyFormulaMetricComposer() {
    const rules = normalizeIqMetricRules(IQ_OBJECTIVE_METRIC_RULES, IQ_OBJECTIVE_MODEL_ID);
    IQ_OBJECTIVE_METRIC_RULES = rules;
    const allMetrics = rules.formulaMetrics || [];
    const metrics = getVisibleStudyFormulaMetrics(rules);
    if (!metrics.some((metric) => metric.id === IQ_ACTIVE_FORMULA_METRIC_ID)) {
      IQ_ACTIVE_FORMULA_METRIC_ID = metrics[0]?.id || "";
    }
    if (!IQ_ACTIVE_FORMULA_METRIC_ID && metrics[0]) {
      IQ_ACTIVE_FORMULA_METRIC_ID = metrics[0].id;
    }
    const activeMetric = metrics.find((metric) => metric.id === IQ_ACTIVE_FORMULA_METRIC_ID) || null;
    if (els.studyFormulaMetricList) {
      els.studyFormulaMetricList.innerHTML = metrics.length ? metrics.map((metric) => `
        <div
          class="metric-formula-card ${metric.id === activeMetric?.id ? "is-active" : ""} ${metric.enabled === false ? "is-disabled" : ""}"
          data-study-formula-metric-id="${escapeHtml(metric.id)}"
          draggable="true"
          role="button"
          tabindex="0"
          title="Click to edit. Drag to reorder exported metric rows."
        >
          <button
            class="metric-formula-delete-button"
            data-study-formula-delete="${escapeHtml(metric.id)}"
            type="button"
            title="Delete ${escapeHtml(metric.label)}"
            aria-label="Delete ${escapeHtml(metric.label)}"
          >×</button>
          <strong>${escapeHtml(metric.label)}</strong>
          <code>${escapeHtml(metric.formula)}</code>
          <span>${metric.enabled === false ? "Disabled" : "Enabled"}${metric.unit ? ` • ${escapeHtml(metric.unit)}` : ""}</span>
        </div>
      `).join("") : `<div class="metric-rule-preview">${
        allMetrics.length
          ? "No formula rows match the current output switches. Re-enable Total, Proximal, Distal, Per vessel / structure, or Other groups to show the preserved formulas again."
          : "No formulas yet. Add one to define the exported objective summary."
      }</div>`;
    }
    if (els.studyFormulaMetricNameInput) {
      els.studyFormulaMetricNameInput.value = activeMetric?.label || "";
      els.studyFormulaMetricNameInput.disabled = !activeMetric;
    }
    if (els.studyFormulaMetricUnitInput) {
      els.studyFormulaMetricUnitInput.value = activeMetric?.unit || "";
      els.studyFormulaMetricUnitInput.disabled = !activeMetric;
    }
    if (els.studyFormulaMetricExpressionInput) {
      els.studyFormulaMetricExpressionInput.value = activeMetric?.formula || "";
      els.studyFormulaMetricExpressionInput.disabled = !activeMetric;
    }
    if (els.studyFormulaMetricSaveButton) {
      els.studyFormulaMetricSaveButton.disabled = !activeMetric;
    }
    if (els.studyFormulaMetricDeleteButton) {
      els.studyFormulaMetricDeleteButton.disabled = !activeMetric;
    }
    if (els.studyFormulaTokenPalette) {
      els.studyFormulaTokenPalette.innerHTML = getStudyFormulaTokenDefinitions().map((token) => `
        <button
          class="formula-token-button"
          data-study-formula-token="${escapeHtml(token.value)}"
          data-formula-token-role="${escapeHtml(token.role || "")}"
          draggable="true"
          type="button"
          style="${token.color ? `--token-color:${escapeHtml(token.color)}` : ""}"
        >${escapeHtml(token.label)}</button>
      `).join("");
    }
    renderStudyFormulaMetricPreviewFromDraft();
  }

  function getStudyFormulaMetricCards() {
    return Array.from(els.studyFormulaMetricList?.querySelectorAll("[data-study-formula-metric-id]") || []);
  }

  function getStudyFormulaDragAfterCard(clientY) {
    return getStudyFormulaMetricCards()
      .filter((card) => !card.classList.contains("is-dragging"))
      .reduce(
        (closest, card) => {
          const box = card.getBoundingClientRect();
          const offset = clientY - box.top - box.height / 2;
          return offset < 0 && offset > closest.offset ? { offset, card } : closest;
        },
        { offset: Number.NEGATIVE_INFINITY, card: null }
      ).card;
  }

  function reorderStudyFormulaMetricsByDomOrder(statusMessage) {
    const orderedVisibleIds = getStudyFormulaMetricCards().map((card) => safeString(card.dataset.studyFormulaMetricId)).filter(Boolean);
    if (!orderedVisibleIds.length) {
      return;
    }
    const rules = normalizeIqMetricRules(IQ_OBJECTIVE_METRIC_RULES, IQ_OBJECTIVE_MODEL_ID);
    const allMetrics = rules.formulaMetrics || [];
    const metricById = new Map(allMetrics.map((metric) => [metric.id, metric]));
    const reorderedVisibleMetrics = orderedVisibleIds.map((metricId) => metricById.get(metricId)).filter(Boolean);
    if (reorderedVisibleMetrics.length !== orderedVisibleIds.length) {
      return;
    }
    const visibleIdSet = new Set(orderedVisibleIds);
    const hiddenMetrics = allMetrics.filter((metric) => !visibleIdSet.has(metric.id));
    const nextMetrics = [...reorderedVisibleMetrics, ...hiddenMetrics];
    const changed = nextMetrics.some((metric, index) => metric.id !== allMetrics[index]?.id);
    if (!changed) {
      return;
    }
    IQ_OBJECTIVE_METRIC_RULES = {
      ...rules,
      formulaMetrics: nextMetrics,
    };
    saveIqTargetProtocolToStorage();
    renderStudyFormulaMetricComposer();
    renderIqObjectiveOutputs();
    setStatus(statusMessage || "Updated exported metric order.");
  }

  function handleStudyFormulaMetricDragStart(event) {
    if (event.target.closest("[data-study-formula-delete]")) {
      event.preventDefault();
      return;
    }
    const card = event.target.closest("[data-study-formula-metric-id]");
    if (!card) {
      return;
    }
    IQ_STUDY_FORMULA_DRAG_ID = safeString(card.dataset.studyFormulaMetricId);
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", IQ_STUDY_FORMULA_DRAG_ID);
  }

  function handleStudyFormulaMetricDragOver(event) {
    if (!IQ_STUDY_FORMULA_DRAG_ID) {
      return;
    }
    const draggingCard = getStudyFormulaMetricCards().find((card) => card.dataset.studyFormulaMetricId === IQ_STUDY_FORMULA_DRAG_ID);
    if (!draggingCard) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const afterCard = getStudyFormulaDragAfterCard(event.clientY);
    if (!afterCard) {
      els.studyFormulaMetricList.appendChild(draggingCard);
    } else if (afterCard !== draggingCard) {
      els.studyFormulaMetricList.insertBefore(draggingCard, afterCard);
    }
  }

  function handleStudyFormulaMetricDrop(event) {
    if (!IQ_STUDY_FORMULA_DRAG_ID) {
      return;
    }
    event.preventDefault();
    IQ_ACTIVE_STUDY_RULE_SET_ID = "";
    reorderStudyFormulaMetricsByDomOrder("Updated exported metric order.");
    IQ_STUDY_FORMULA_DRAG_ID = "";
  }

  function handleStudyFormulaMetricDragEnd() {
    getStudyFormulaMetricCards().forEach((card) => card.classList.remove("is-dragging"));
    IQ_STUDY_FORMULA_DRAG_ID = "";
  }

  function addStudyFormulaMetric() {
    const nextIndex = getStudyFormulaMetrics().length + 1;
    const existingIds = new Set(getStudyFormulaMetrics().map((metric) => metric.id));
    let candidateId = `custom_metric_${nextIndex}`;
    let suffix = nextIndex;
    while (existingIds.has(candidateId)) {
      suffix += 1;
      candidateId = `custom_metric_${suffix}`;
    }
    const metric = makeIqFormulaMetric(candidateId, `Custom_metric_${nextIndex}`, "avg(signal.mean)", "HU", {
      metricKind: "custom",
      scopeKind: "custom",
    });
    IQ_OBJECTIVE_METRIC_RULES = {
      ...normalizeIqMetricRules(IQ_OBJECTIVE_METRIC_RULES, IQ_OBJECTIVE_MODEL_ID),
      formulaMetrics: [...getStudyFormulaMetrics(), metric],
    };
    IQ_ACTIVE_FORMULA_METRIC_ID = metric.id;
    persistStudyRulesAfterEdit(`Added formula metric: ${metric.label}.`);
  }

  function saveActiveStudyFormulaMetric() {
    const nextMetric = syncActiveStudyFormulaMetricDraftToState();
    if (!nextMetric) {
      return;
    }
    persistStudyRulesAfterEdit(`Updated formula metric: ${nextMetric.label}.`);
  }

  function deleteActiveStudyFormulaMetric() {
    const activeMetric = getActiveStudyFormulaMetric();
    if (!activeMetric) {
      return;
    }
    deleteStudyFormulaMetric(activeMetric.id);
  }

  function deleteStudyFormulaMetric(metricId) {
    const safeMetricId = safeString(metricId);
    if (!safeMetricId) {
      return;
    }
    const metrics = getStudyFormulaMetrics();
    const metricToDelete = metrics.find((metric) => metric.id === safeMetricId);
    if (!metricToDelete) {
      return;
    }
    const remainingMetrics = metrics.filter((metric) => metric.id !== safeMetricId);
    IQ_OBJECTIVE_METRIC_RULES = {
      ...normalizeIqMetricRules(IQ_OBJECTIVE_METRIC_RULES, IQ_OBJECTIVE_MODEL_ID),
      formulaMetrics: remainingMetrics,
    };
    if (IQ_ACTIVE_FORMULA_METRIC_ID === safeMetricId) {
      IQ_ACTIVE_FORMULA_METRIC_ID = remainingMetrics[0]?.id || "";
    }
    persistStudyRulesAfterEdit(`Deleted formula metric: ${metricToDelete.label}.`);
  }

  function renderStudyObjectiveRules() {
    const model = getCurrentObjectiveModelDefinition();
    const counts = getIqTargetCategoryCounts();
    if (els.studyObjectiveModelSelect) {
      els.studyObjectiveModelSelect.value = model.id;
    }
    if (els.studyObjectiveSummary) {
      els.studyObjectiveSummary.textContent =
        `${model.shortLabel}: ${IQ_REQUIRED_TARGET_IDS.length} active targets (${counts.coronary || 0} signal, ${counts.background || 0} background, ${counts.noise || 0} noise).`;
    }
    if (els.studyObjectiveModelNote) {
      els.studyObjectiveModelNote.textContent = model.helpText;
    }
    if (els.studyObjectiveTargetTableBody) {
      const roleOptionsMarkup = (selectedRole) => Object.entries(IQ_TARGET_METRIC_ROLE_DEFINITIONS).map(([role, definition]) => `
        <option value="${escapeHtml(role)}" ${role === selectedRole ? "selected" : ""}>${escapeHtml(definition.label)}</option>
      `).join("");
      const statControlMarkup = (target, statKey) => {
        const statKeys = getIqTargetStatKeys(target);
        const role = getIqTargetRoleForStat(target, statKey);
        const statLabels = getIqTargetStatLabels(target);
        const isEnabled = statKeys.includes(statKey);
        const definition = IQ_TARGET_STAT_DEFINITIONS[statKey];
        return `
          <div class="study-stat-assignment" data-study-target-stat-cell="${escapeHtml(statKey)}">
            <label class="study-mini-check">
              <input data-study-target-stat-enabled="${escapeHtml(statKey)}" type="checkbox" ${isEnabled ? "checked" : ""} />
              <span>${escapeHtml(definition.label.replace(" HU", ""))}</span>
            </label>
            <select data-study-target-stat-role="${escapeHtml(statKey)}" ${isEnabled ? "" : "disabled"}>
              ${roleOptionsMarkup(role)}
            </select>
            <input
              class="study-stat-other-label ${role === "other" ? "" : "is-hidden"}"
              data-study-target-stat-label="${escapeHtml(statKey)}"
              type="text"
              value="${escapeHtml(statLabels[statKey] || "")}"
              placeholder="Other label"
              ${isEnabled ? "" : "disabled"}
            />
            <div class="study-stat-assignment-preview" data-study-target-stat-preview="${escapeHtml(statKey)}">
              ${isEnabled ? escapeHtml(getIqTargetStatAssignmentLabel(target, statKey)) : "Not collected"}
            </div>
          </div>
        `;
      };
      els.studyObjectiveTargetTableBody.innerHTML = IQ_ROI_TARGETS.length ? IQ_ROI_TARGETS.map((target) => {
        const category = normalizeIqTargetCategory(target.roiCategory);
        const style = IQ_TARGET_CATEGORY_STYLES[category];
        const stroke = normalizeIqPaletteColor(target.stroke, style.stroke);
        const targetOrder = getIqTargetDisplayOrder(target);
        return `
          <tr data-study-target-id="${escapeHtml(target.id)}" draggable="false">
            <td class="study-target-drag-cell">
              <button
                class="study-target-drag-handle"
                data-study-target-drag-handle
                draggable="true"
                type="button"
                aria-label="Drag to reorder ${escapeHtml(target.label)}"
                title="Drag to change measurement sequence"
              >⋮⋮</button>
            </td>
            <td>
              <label class="study-mini-check">
                <input data-study-target-field="enabled" type="checkbox" ${target.enabled !== false ? "checked" : ""} />
                <span>Use</span>
              </label>
            </td>
            <td><strong class="study-target-number">ROI${targetOrder}</strong></td>
            <td>
              <div class="study-target-rule-preview">${escapeHtml(getIqTargetRuleDisplayLabel(target))}</div>
              <input data-study-target-field="label" type="text" value="${escapeHtml(target.label)}" />
            </td>
            <td>${statControlMarkup(target, "mean")}</td>
            <td>${statControlMarkup(target, "sd")}</td>
            <td>${statControlMarkup(target, "min")}</td>
            <td>${statControlMarkup(target, "max")}</td>
            <td><input data-study-target-field="locationGroup" type="text" value="${escapeHtml(target.locationGroup || "")}" placeholder="Optional group, e.g. proximal, vessel, phase..." /></td>
            <td>
              <input data-study-target-field="stroke" type="hidden" value="${escapeHtml(stroke)}" />
              ${getStudyTargetColorPaletteMarkup(stroke)}
            </td>
            <td><button class="button mini danger-button" data-study-target-remove="${escapeHtml(target.id)}" type="button">Delete</button></td>
          </tr>
        `;
      }).join("") : `
        <tr>
          <td colspan="11" class="iq-table-empty">No objective targets yet. Use Add ROI Target to build this custom study from scratch.</td>
        </tr>
      `;
    }

    const rules = normalizeIqMetricRules(IQ_OBJECTIVE_METRIC_RULES, IQ_OBJECTIVE_MODEL_ID);
    IQ_OBJECTIVE_METRIC_RULES = rules;
    if (els.studyMetricSignalEnabled) els.studyMetricSignalEnabled.checked = rules.signalEnabled;
    if (els.studyMetricBackgroundEnabled) els.studyMetricBackgroundEnabled.checked = rules.backgroundEnabled;
    if (els.studyMetricNoiseEnabled) els.studyMetricNoiseEnabled.checked = rules.noiseEnabled;
    if (els.studyMetricSnrEnabled) els.studyMetricSnrEnabled.checked = rules.snrEnabled;
    if (els.studyMetricCnrEnabled) els.studyMetricCnrEnabled.checked = rules.cnrEnabled;
    if (els.studyMetricTotalEnabled) els.studyMetricTotalEnabled.checked = rules.totalEnabled;
    if (els.studyMetricVesselEnabled) els.studyMetricVesselEnabled.checked = rules.perVesselEnabled;
    if (els.studyMetricProximalEnabled) els.studyMetricProximalEnabled.checked = rules.proximalEnabled;
    if (els.studyMetricDistalEnabled) els.studyMetricDistalEnabled.checked = rules.distalEnabled;
    if (els.studyMetricCustomGroupEnabled) els.studyMetricCustomGroupEnabled.checked = rules.customGroupEnabled;
    renderStudyObjectiveSourceSelects();
    renderStudyFormulaMetricComposer();
    if (els.studyMetricPreview) {
      const enabledMetrics = [rules.snrEnabled ? "SNR" : "", rules.cnrEnabled ? "CNR" : ""].filter(Boolean).join(" and ") || "No ratio metric";
      const groups = [
        rules.totalEnabled ? "total" : "",
        rules.proximalEnabled ? "proximal" : "",
        rules.distalEnabled ? "distal" : "",
        rules.perVesselEnabled ? "per vessel/structure" : "",
        rules.customGroupEnabled ? "other groups" : "",
      ].filter(Boolean).join(", ");
      const formulaCount = getVisibleStudyFormulaMetrics(rules).length;
      const totalFormulaDefinitions = (rules.formulaMetrics || []).length;
      els.studyMetricPreview.textContent = formulaCount
        ? `${formulaCount} explicit formula metric${formulaCount === 1 ? "" : "s"} will define the objective summary. Use the equation builder below to make SNR, CNR, Noise, and custom metrics reproducible.`
        : totalFormulaDefinitions
          ? "No formula metrics are selected by the current output switches. Hidden formulas are preserved and will return when their switch is enabled again."
          : `${enabledMetrics} will be computed for ${groups || "no selected signal grouping"}. SNR = Signal / Noise; CNR = (Signal - Background) / Noise.`;
    }
  }

  function getSubjectiveTemplateOptionsMarkup() {
    return [
      `<option value="">Custom / keep row</option>`,
      ...IQ_SUBJECTIVE_TEMPLATE_FIELDS.map((field) =>
        `<option value="${escapeHtml(field.key)}">${escapeHtml(field.label)} (${escapeHtml(getIqSubjectiveScaleLabel(field))})</option>`
      ),
    ].join("");
  }

  function getIqSubjectiveScaleOptionsMarkup(selectedScale) {
    const selectedKey = getIqSubjectiveFieldScaleKey(selectedScale);
    const quickScaleKeys = new Set(IQ_SUBJECTIVE_QUICK_SCALE_OPTIONS.map((scale) => String(scale)));
    const options = IQ_SUBJECTIVE_QUICK_SCALE_OPTIONS.map((scale) => {
      const key = String(scale);
      const option = IQ_SUBJECTIVE_FIELD_SCALE_OPTIONS[key];
      return `<option value="${key}" ${selectedKey === key ? "selected" : ""}>${escapeHtml(option.label)}</option>`;
    });
    if (!quickScaleKeys.has(selectedKey) && IQ_SUBJECTIVE_FIELD_SCALE_OPTIONS[selectedKey]) {
      options.push(
        `<option value="${selectedKey}" selected>${escapeHtml(`${IQ_SUBJECTIVE_FIELD_SCALE_OPTIONS[selectedKey].label} (custom)`)}</option>`
      );
    }
    options.push(`<option value="${IQ_SUBJECTIVE_CUSTOM_SCALE_VALUE}">Other...</option>`);
    return options.join("");
  }

  function promptForCustomIqSubjectiveScale(fallbackScale) {
    const fallbackKey = getIqSubjectiveFieldScaleKey(fallbackScale || IQ_SUBJECTIVE_SCALE);
    const fallbackNumber = Number.parseInt(fallbackKey, 10);
    const rawValue = window.prompt(
      `Enter custom score count (2-${IQ_SUBJECTIVE_MAX_CUSTOM_SCALE}).`,
      String(Number.isFinite(fallbackNumber) ? fallbackNumber : DEFAULT_IQ_SUBJECTIVE_PROTOCOL.scale)
    );
    if (rawValue === null) {
      return null;
    }
    const parsed = Number(cleanIqSubjectiveString(rawValue));
    if (!Number.isInteger(parsed) || parsed < 2 || parsed > IQ_SUBJECTIVE_MAX_CUSTOM_SCALE) {
      window.alert(`Please enter a whole number from 2 to ${IQ_SUBJECTIVE_MAX_CUSTOM_SCALE}.`);
      setStatus(`Custom subjective scales must be 2 to ${IQ_SUBJECTIVE_MAX_CUSTOM_SCALE} points.`, "warning");
      return null;
    }
    return String(parsed);
  }

  function resolveIqSubjectiveScaleSelectValue(selectElement, fallbackScale) {
    if (!selectElement) {
      return normalizeIqSubjectiveFieldScale(fallbackScale, IQ_SUBJECTIVE_SCALE);
    }
    if (selectElement.value !== IQ_SUBJECTIVE_CUSTOM_SCALE_VALUE) {
      return normalizeIqSubjectiveFieldScale(selectElement.value, fallbackScale);
    }
    const customScale = promptForCustomIqSubjectiveScale(fallbackScale);
    const restoredScale = customScale || getIqSubjectiveFieldScaleKey(fallbackScale || IQ_SUBJECTIVE_SCALE);
    selectElement.innerHTML = getIqSubjectiveScaleOptionsMarkup(restoredScale);
    selectElement.value = restoredScale;
    return customScale;
  }

  function renderStudySubjectiveRules() {
    if (els.studySubjectiveSummary) {
      const scales = Array.from(new Set(IQ_SUBJECTIVE_FIELDS.map((field) => getIqSubjectiveScaleLabel(field))));
      els.studySubjectiveSummary.textContent = `${IQ_SUBJECTIVE_FIELDS.length} categories • ${scales.join(", ")} scoring in one study.`;
    }
    if (els.studySubjectiveScaleSelect) {
      els.studySubjectiveScaleSelect.innerHTML = getIqSubjectiveScaleOptionsMarkup(IQ_SUBJECTIVE_SCALE);
      els.studySubjectiveScaleSelect.value = String(IQ_SUBJECTIVE_SCALE);
    }
    if (els.studySubjectiveScoreLabels) {
      els.studySubjectiveScoreLabels.innerHTML = `
        <p class="hint compact-hint">
          The default category scale applies immediately to all categories below. After that,
          each row can still be adjusted individually. A 2-point scale is stored as 0/1; use Other
          for custom 3- to 10-point reader scores.
        </p>
      `;
    }
    if (els.studySubjectiveTableBody) {
      const templateOptions = getSubjectiveTemplateOptionsMarkup();
      els.studySubjectiveTableBody.innerHTML = IQ_SUBJECTIVE_FIELDS.map((field) => {
        const fieldScale = getIqSubjectiveFieldScaleKey(field);
        return `
        <tr class="study-subjective-control-row" data-study-subjective-field-key="${escapeHtml(field.key)}" draggable="false">
          <td class="study-target-drag-cell">
            <button
              class="study-target-drag-handle"
              data-study-subjective-drag-handle
              draggable="true"
              type="button"
              aria-label="Drag to reorder ${escapeHtml(field.label)}"
              title="Drag to change subjective scoring sequence"
            >⋮⋮</button>
          </td>
          <td>
            <label class="study-inline-label">
              <span>Category</span>
              <input data-study-subjective-field="label" type="text" value="${escapeHtml(field.label)}" />
            </label>
          </td>
          <td>
            <label class="study-inline-label">
              <span>Scale</span>
              <select data-study-subjective-field="scale">${getIqSubjectiveScaleOptionsMarkup(fieldScale)}</select>
            </label>
          </td>
          <td>
            <label class="study-inline-label">
              <span>Template</span>
              <select data-study-subjective-template>${templateOptions}</select>
            </label>
          </td>
          <td class="study-subjective-action-cell">
            <button class="button mini danger-button" data-study-subjective-remove="${escapeHtml(field.key)}" type="button">Delete</button>
          </td>
        </tr>
        <tr class="study-subjective-details-row" data-study-subjective-field-key="${escapeHtml(field.key)}">
          <td colspan="5">
            <div class="study-subjective-details-head">
              <strong>${escapeHtml(field.label)}</strong>
              <span>${escapeHtml(getIqSubjectiveScaleLabel(field))}: edit each score label and explanation below.</span>
            </div>
            <div class="study-description-grid">
              ${getIqSubjectiveScaleValues(field).map((value) => `
                <label>
                  <span>Value ${escapeHtml(String(value))}</span>
                  <input data-study-subjective-score-label="${value}" type="text" value="${escapeHtml(getIqSubjectiveScoreLabel(value, field))}" />
                  <textarea data-study-subjective-description="${value}" rows="2">${escapeHtml(field.descriptions?.[value] || "")}</textarea>
                </label>
              `).join("")}
            </div>
          </td>
        </tr>
      `;
      }).join("");
    }
  }

  function renderStudyRulesWorkspace(options) {
    if (!els.studyRulesWorkspace) {
      return;
    }
    if (els.studyRulesNameInput && (options?.force || document.activeElement !== els.studyRulesNameInput)) {
      const activeSet = IQ_STUDY_RULE_SETS.find((ruleSet) => ruleSet.id === IQ_ACTIVE_STUDY_RULE_SET_ID);
      els.studyRulesNameInput.value = activeSet?.name || els.studyRulesNameInput.value || "CCTA IQ study rules";
    }
    renderStudyRuleSetPicker();
    renderStudyObjectiveRules();
    renderStudySubjectiveRules();
  }

  function persistStudyRulesAfterEdit(statusMessage) {
    refreshIqTargetIndexes();
    saveIqTargetProtocolToStorage();
    saveIqSubjectiveProtocolToStorage();
    updateIqTargetProtocolUi();
    updateIqSubjectiveProtocolUi({ renderOnly: true });
    renderStudyRulesWorkspace({ force: true });
    if (statusMessage) {
      setStatus(statusMessage);
    }
  }

  function updateStudyObjectiveTargetFromRow(row) {
    const targetId = safeString(row?.dataset.studyTargetId);
    const targetIndex = IQ_ROI_TARGETS.findIndex((target) => target.id === targetId);
    if (targetIndex < 0) {
      return;
    }
    const current = IQ_ROI_TARGETS[targetIndex];
    const statKeys = Array.from(row.querySelectorAll("[data-study-target-stat-enabled]:checked"))
      .map((input) => cleanIqTargetString(input.dataset.studyTargetStatEnabled).toLowerCase())
      .filter((statKey) => Object.prototype.hasOwnProperty.call(IQ_TARGET_STAT_DEFINITIONS, statKey));
    const safeStatKeys = normalizeIqTargetStatKeys(statKeys.length ? statKeys : ["mean"]);
    const statRoles = safeStatKeys.reduce((roles, statKey) => {
      roles[statKey] = normalizeIqTargetRoleKey(
        row.querySelector(`[data-study-target-stat-role="${CSS.escape(statKey)}"]`)?.value,
        getDefaultIqTargetRoleForStat(statKey, current.metricRoles, current.roiCategory)
      );
      return roles;
    }, {});
    const statLabels = safeStatKeys.reduce((labels, statKey) => {
      const cleanLabel = cleanIqTargetString(row.querySelector(`[data-study-target-stat-label="${CSS.escape(statKey)}"]`)?.value);
      if (cleanLabel) {
        labels[statKey] = cleanLabel;
      }
      return labels;
    }, {});
    const metricRoles = Array.from(new Set(Object.values(statRoles).filter(Boolean)));
    const primaryRole = metricRoles.find((role) => role !== "other") || metricRoles[0] || getDefaultIqTargetMetricRoles(current.roiCategory)[0];
    const category = normalizeIqTargetCategory(IQ_TARGET_METRIC_ROLE_DEFINITIONS[primaryRole]?.category || current.roiCategory);
    const style = IQ_TARGET_CATEGORY_STYLES[category];
    const label = cleanIqTargetString(row.querySelector('[data-study-target-field="label"]')?.value) || current.label;
    const structure = inferIqTargetVesselFromText(label, current.vessel) || label;
    const segment = cleanIqTargetString(current.segment);
    const locationGroup =
      cleanIqTargetString(row.querySelector('[data-study-target-field="locationGroup"]')?.value) ||
      inferIqTargetLocationGroup(`${label} ${segment}`, category, current.locationGroup);
    const statGroups = safeStatKeys.reduce((groups, statKey) => {
      if (locationGroup) {
        groups[statKey] = locationGroup;
      }
      return groups;
    }, {});
    const stroke = cleanIqTargetString(row.querySelector('[data-study-target-field="stroke"]')?.value) || style.stroke;
    const enabled = row.querySelector('[data-study-target-field="enabled"]')?.checked !== false;
    IQ_ROI_TARGETS[targetIndex] = normalizeIqTarget(
      {
        ...current,
        enabled,
        label,
        roiCategory: category,
        metricRoles,
        statKeys: safeStatKeys,
        statRoles,
        statLabels,
        statGroups,
        vessel: category === "coronary" ? structure || inferIqTargetVesselFromText(`${label} ${segment}`, current.vessel) : "",
        region: structure || current.region || style.label,
        segment,
        locationGroup,
        description: segment ? formatIqSegmentDescription(segment) : current.description || style.description,
        stroke,
      },
      targetIndex
    );
    IQ_OBJECTIVE_METRIC_RULES = ensureIqFormulaMetricsForRules(IQ_OBJECTIVE_METRIC_RULES, { activateFirstAdded: false });
    persistStudyRulesAfterEdit(`Updated objective target: ${label}.`);
  }

  function setStudyObjectiveRowMetricRoles(row, roles) {
    const category = normalizeIqTargetCategory(row?.querySelector('[data-study-target-field="roiCategory"]')?.value);
    const normalizedRoles = normalizeIqTargetMetricRoles(roles, category);
    row?.querySelectorAll("[data-study-target-role]").forEach((input) => {
      input.checked = normalizedRoles.includes(input.dataset.studyTargetRole);
    });
    return normalizedRoles;
  }

  function syncStudyObjectiveRowColorFromFamily(row) {
    const category = normalizeIqTargetCategory(row?.querySelector('[data-study-target-field="roiCategory"]')?.value);
    const currentColor = row?.querySelector('[data-study-target-field="stroke"]')?.value;
    setStudyObjectiveRowColor(row, currentColor || IQ_TARGET_CATEGORY_STYLES[category].stroke);
  }

  function syncStudyObjectiveRowMetricRolesFromFamily(row) {
    const category = normalizeIqTargetCategory(row?.querySelector('[data-study-target-field="roiCategory"]')?.value);
    setStudyObjectiveRowMetricRoles(row, getDefaultIqTargetMetricRoles(category));
    syncStudyObjectiveRowColorFromFamily(row);
  }

  function syncStudyObjectiveRowFamilyFromMetricRoles(row) {
    const checkedRoles = Array.from(row?.querySelectorAll("[data-study-target-role]:checked") || [])
      .map((input) => input.dataset.studyTargetRole)
      .filter(Boolean);
    if (!checkedRoles.length) {
      syncStudyObjectiveRowMetricRolesFromFamily(row);
      return;
    }
    if (checkedRoles.length !== 1) {
      return;
    }
    const roleDefinition = IQ_TARGET_METRIC_ROLE_DEFINITIONS[checkedRoles[0]];
    const categorySelect = row?.querySelector('[data-study-target-field="roiCategory"]');
    if (roleDefinition?.category && categorySelect) {
      categorySelect.value = normalizeIqTargetCategory(roleDefinition.category);
      syncStudyObjectiveRowColorFromFamily(row);
    }
  }

  function getStudyObjectiveTargetRows() {
    return Array.from(els.studyObjectiveTargetTableBody?.querySelectorAll("[data-study-target-id]") || []);
  }

  function getStudyObjectiveDragAfterRow(clientY) {
    return getStudyObjectiveTargetRows()
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

  function reorderStudyObjectiveTargetsByDomOrder(statusMessage) {
    const orderedIds = getStudyObjectiveTargetRows().map((row) => safeString(row.dataset.studyTargetId)).filter(Boolean);
    if (orderedIds.length !== IQ_ROI_TARGETS.length) {
      return;
    }
    const targetById = new Map(IQ_ROI_TARGETS.map((target) => [target.id, target]));
    const reorderedTargets = orderedIds.map((targetId) => targetById.get(targetId)).filter(Boolean);
    if (reorderedTargets.length !== IQ_ROI_TARGETS.length) {
      return;
    }
    const changed = reorderedTargets.some((target, index) => target.id !== IQ_ROI_TARGETS[index]?.id);
    if (!changed) {
      return;
    }
    IQ_ROI_TARGETS = reorderedTargets;
    IQ_ACTIVE_STUDY_RULE_SET_ID = "";
    persistStudyRulesAfterEdit(statusMessage || "Updated objective ROI target sequence.");
  }

  function handleStudyObjectiveTargetDragStart(event) {
    const handle = event.target.closest("[data-study-target-drag-handle]");
    if (!handle) {
      return;
    }
    const row = handle.closest("[data-study-target-id]");
    if (!row) {
      return;
    }
    IQ_STUDY_TARGET_DRAG_ID = safeString(row.dataset.studyTargetId);
    row.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", IQ_STUDY_TARGET_DRAG_ID);
  }

  function handleStudyObjectiveTargetDragOver(event) {
    if (!IQ_STUDY_TARGET_DRAG_ID) {
      return;
    }
    const draggingRow = getStudyObjectiveTargetRows().find((row) => row.dataset.studyTargetId === IQ_STUDY_TARGET_DRAG_ID);
    if (!draggingRow) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const afterRow = getStudyObjectiveDragAfterRow(event.clientY);
    if (!afterRow) {
      els.studyObjectiveTargetTableBody.appendChild(draggingRow);
    } else if (afterRow !== draggingRow) {
      els.studyObjectiveTargetTableBody.insertBefore(draggingRow, afterRow);
    }
  }

  function handleStudyObjectiveTargetDrop(event) {
    if (!IQ_STUDY_TARGET_DRAG_ID) {
      return;
    }
    event.preventDefault();
    reorderStudyObjectiveTargetsByDomOrder("Updated objective ROI target sequence.");
    IQ_STUDY_TARGET_DRAG_ID = "";
  }

  function handleStudyObjectiveTargetDragEnd() {
    getStudyObjectiveTargetRows().forEach((row) => row.classList.remove("is-dragging"));
    IQ_STUDY_TARGET_DRAG_ID = "";
  }

  function addStudyObjectiveTarget() {
    const label = `Signal ROI ${IQ_ROI_TARGETS.length + 1}`;
    IQ_ROI_TARGETS = [
      ...IQ_ROI_TARGETS,
      normalizeIqTarget(
        {
          id: createCustomIqTargetId(label),
          enabled: true,
          label,
          description: "Custom signal ROI",
          roiCategory: "coronary",
          metricRoles: ["signal"],
          statKeys: ["mean"],
          statRoles: { mean: "signal" },
          vessel: "",
          region: "Signal ROI",
          segment: "",
          locationGroup: "",
          stroke: getNextIqTargetPaletteColor(),
        },
        IQ_ROI_TARGETS.length
      ),
    ];
    IQ_OBJECTIVE_METRIC_RULES = ensureIqFormulaMetricsForRules(IQ_OBJECTIVE_METRIC_RULES, { activateFirstAdded: false });
    persistStudyRulesAfterEdit(`Added objective target: ${label}.`);
  }

  function removeStudyObjectiveTarget(targetId) {
    if (IQ_ROI_TARGETS.length <= 1) {
      setStatus("At least one objective target must remain.", "warning");
      return;
    }
    const target = IQ_TARGETS_BY_ID.get(safeString(targetId));
    if (!target) {
      return;
    }
    if (hasAnnotationsForIqTarget(target.id)) {
      const confirmed = window.confirm(
        `Remove "${target.label}" from the active study rules? Existing measurements keep their stored label snapshot, but this target will no longer be part of the guided protocol.`
      );
      if (!confirmed) {
        return;
      }
      captureIqAnnotationTargetSnapshots();
    }
    IQ_ROI_TARGETS = IQ_ROI_TARGETS.filter((item) => item.id !== target.id);
    persistStudyRulesAfterEdit(`Removed objective target: ${target.label}.`);
  }

  function readStudyMetricRulesFromControls() {
    IQ_OBJECTIVE_METRIC_RULES = ensureIqFormulaMetricsForRules(
      {
        signalEnabled: els.studyMetricSignalEnabled?.checked,
        backgroundEnabled: els.studyMetricBackgroundEnabled?.checked,
        noiseEnabled: els.studyMetricNoiseEnabled?.checked,
        snrEnabled: els.studyMetricSnrEnabled?.checked,
        cnrEnabled: els.studyMetricCnrEnabled?.checked,
        totalEnabled: els.studyMetricTotalEnabled?.checked,
        perVesselEnabled: els.studyMetricVesselEnabled?.checked,
        proximalEnabled: els.studyMetricProximalEnabled?.checked,
        distalEnabled: els.studyMetricDistalEnabled?.checked,
        customGroupEnabled: els.studyMetricCustomGroupEnabled?.checked,
        backgroundSource: els.studyMetricBackgroundSource?.value,
        noiseSource: els.studyMetricNoiseSource?.value,
        formulaMetrics: getStudyFormulaMetrics(),
      },
      { activateFirstAdded: true }
    );
    saveIqTargetProtocolToStorage();
    renderIqObjectiveOutputs();
    renderStudyObjectiveRules();
    setStatus("Objective metric rules updated.");
  }

  function updateStudySubjectiveFieldFromRow(row) {
    const fieldKey = safeString(row?.dataset.studySubjectiveFieldKey);
    const fieldIndex = IQ_SUBJECTIVE_FIELDS.findIndex((field) => field.key === fieldKey);
    if (fieldIndex < 0) {
      return;
    }
    const subjectRows = Array.from(els.studySubjectiveTableBody?.querySelectorAll("[data-study-subjective-field-key]") || [])
      .filter((item) => safeString(item.dataset.studySubjectiveFieldKey) === fieldKey);
    const findInSubjectRows = (selector) => subjectRows.map((item) => item.querySelector(selector)).find(Boolean);
    const current = IQ_SUBJECTIVE_FIELDS[fieldIndex];
    const label = cleanIqSubjectiveString(findInSubjectRows('[data-study-subjective-field="label"]')?.value) || current.label;
    const nextScale = normalizeIqSubjectiveFieldScale(
      findInSubjectRows('[data-study-subjective-field="scale"]')?.value || current.scale,
      current.scale || IQ_SUBJECTIVE_SCALE
    );
    const scaleChanged = nextScale !== getIqSubjectiveFieldScaleKey(current.scale || IQ_SUBJECTIVE_SCALE);
    const defaultScoreLabels = getDefaultIqSubjectiveScoreLabels(nextScale);
    const defaultDescriptions = getGenericIqSubjectiveDescriptions(nextScale);
    const scoreLabels = {};
    const descriptions = {};
    getIqSubjectiveScaleValues(nextScale).forEach((value) => {
      scoreLabels[value] =
        (!scaleChanged && cleanIqSubjectiveString(findInSubjectRows(`[data-study-subjective-score-label="${value}"]`)?.value)) ||
        (!scaleChanged && current.scoreLabels?.[value]) ||
        defaultScoreLabels[value] ||
        getIqSubjectiveScoreLabel(value, { ...current, scale: nextScale });
      descriptions[value] =
        (!scaleChanged && cleanIqSubjectiveString(findInSubjectRows(`[data-study-subjective-description="${value}"]`)?.value)) ||
        (!scaleChanged && current.descriptions?.[value]) ||
        defaultDescriptions[value];
    });
    IQ_SUBJECTIVE_FIELDS[fieldIndex] = normalizeIqSubjectiveField(
      {
        ...current,
        scale: nextScale,
        label,
        scoreLabels,
        descriptions,
      },
      fieldIndex,
      nextScale
    );
    saveIqSubjectiveProtocolToStorage();
    updateIqSubjectiveProtocolUi({ renderOnly: true });
    renderStudySubjectiveRules();
    setStatus(`Updated subjective category: ${label}.`);
  }

  function getStudySubjectiveControlRows() {
    return Array.from(els.studySubjectiveTableBody?.querySelectorAll(".study-subjective-control-row[data-study-subjective-field-key]") || []);
  }

  function getStudySubjectiveRowPair(fieldKey) {
    const safeKey = safeString(fieldKey);
    const rows = Array.from(els.studySubjectiveTableBody?.querySelectorAll("[data-study-subjective-field-key]") || [])
      .filter((row) => safeString(row.dataset.studySubjectiveFieldKey) === safeKey);
    return {
      controlRow: rows.find((row) => row.classList.contains("study-subjective-control-row")) || null,
      detailsRow: rows.find((row) => row.classList.contains("study-subjective-details-row")) || null,
    };
  }

  function getStudySubjectiveDragAfterRow(clientY) {
    return getStudySubjectiveControlRows()
      .filter((row) => !row.classList.contains("is-dragging"))
      .reduce(
        (closest, row) => {
          const detailsRow = getStudySubjectiveRowPair(row.dataset.studySubjectiveFieldKey).detailsRow;
          const rowRect = row.getBoundingClientRect();
          const detailsRect = detailsRow?.getBoundingClientRect();
          const top = rowRect.top;
          const bottom = detailsRect ? detailsRect.bottom : rowRect.bottom;
          const offset = clientY - (top + (bottom - top) / 2);
          return offset < 0 && offset > closest.offset ? { offset, row } : closest;
        },
        { offset: Number.NEGATIVE_INFINITY, row: null }
      ).row;
  }

  function moveStudySubjectiveRowPair(fieldKey, beforeControlRow) {
    const pair = getStudySubjectiveRowPair(fieldKey);
    if (!pair.controlRow || !pair.detailsRow || !els.studySubjectiveTableBody) {
      return;
    }
    if (!beforeControlRow) {
      els.studySubjectiveTableBody.appendChild(pair.controlRow);
      els.studySubjectiveTableBody.appendChild(pair.detailsRow);
      return;
    }
    els.studySubjectiveTableBody.insertBefore(pair.controlRow, beforeControlRow);
    els.studySubjectiveTableBody.insertBefore(pair.detailsRow, beforeControlRow);
  }

  function reorderStudySubjectiveFieldsByDomOrder(statusMessage) {
    const orderedKeys = getStudySubjectiveControlRows().map((row) => safeString(row.dataset.studySubjectiveFieldKey)).filter(Boolean);
    if (orderedKeys.length !== IQ_SUBJECTIVE_FIELDS.length) {
      return;
    }
    const fieldByKey = new Map(IQ_SUBJECTIVE_FIELDS.map((field) => [field.key, field]));
    const reorderedFields = orderedKeys.map((fieldKey) => fieldByKey.get(fieldKey)).filter(Boolean);
    if (reorderedFields.length !== IQ_SUBJECTIVE_FIELDS.length) {
      return;
    }
    const changed = reorderedFields.some((field, index) => field.key !== IQ_SUBJECTIVE_FIELDS[index]?.key);
    if (!changed) {
      return;
    }
    IQ_SUBJECTIVE_FIELDS = reorderedFields;
    IQ_ACTIVE_STUDY_RULE_SET_ID = "";
    saveIqSubjectiveProtocolToStorage();
    updateIqSubjectiveProtocolUi({ renderOnly: true });
    renderStudyRulesWorkspace({ force: true });
    setStatus(statusMessage || "Updated subjective scoring sequence.");
  }

  function handleStudySubjectiveDragStart(event) {
    const handle = event.target.closest("[data-study-subjective-drag-handle]");
    if (!handle) {
      return;
    }
    const row = handle.closest("[data-study-subjective-field-key]");
    if (!row) {
      return;
    }
    IQ_STUDY_SUBJECTIVE_DRAG_KEY = safeString(row.dataset.studySubjectiveFieldKey);
    const pair = getStudySubjectiveRowPair(IQ_STUDY_SUBJECTIVE_DRAG_KEY);
    pair.controlRow?.classList.add("is-dragging");
    pair.detailsRow?.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", IQ_STUDY_SUBJECTIVE_DRAG_KEY);
  }

  function handleStudySubjectiveDragOver(event) {
    if (!IQ_STUDY_SUBJECTIVE_DRAG_KEY) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const afterRow = getStudySubjectiveDragAfterRow(event.clientY);
    if (afterRow?.dataset.studySubjectiveFieldKey === IQ_STUDY_SUBJECTIVE_DRAG_KEY) {
      return;
    }
    moveStudySubjectiveRowPair(IQ_STUDY_SUBJECTIVE_DRAG_KEY, afterRow);
  }

  function handleStudySubjectiveDrop(event) {
    if (!IQ_STUDY_SUBJECTIVE_DRAG_KEY) {
      return;
    }
    event.preventDefault();
    reorderStudySubjectiveFieldsByDomOrder("Updated subjective scoring sequence.");
    IQ_STUDY_SUBJECTIVE_DRAG_KEY = "";
  }

  function handleStudySubjectiveDragEnd() {
    Array.from(els.studySubjectiveTableBody?.querySelectorAll(".is-dragging") || []).forEach((row) => {
      row.classList.remove("is-dragging");
    });
    IQ_STUDY_SUBJECTIVE_DRAG_KEY = "";
  }

  function applyStudySubjectiveTemplate(row, templateKey) {
    const fieldKey = safeString(row?.dataset.studySubjectiveFieldKey);
    const fieldIndex = IQ_SUBJECTIVE_FIELDS.findIndex((field) => field.key === fieldKey);
    const template = IQ_SUBJECTIVE_TEMPLATE_FIELDS.find((field) => field.key === templateKey);
    if (fieldIndex < 0 || !template) {
      return;
    }
    IQ_SUBJECTIVE_FIELDS[fieldIndex] = normalizeIqSubjectiveField(
      {
        ...IQ_SUBJECTIVE_FIELDS[fieldIndex],
        scale: template.scale || IQ_SUBJECTIVE_SCALE,
        label: template.label,
        scoreLabels: template.scoreLabels,
        descriptions: template.descriptions,
      },
      fieldIndex,
      template.scale || IQ_SUBJECTIVE_SCALE
    );
    saveIqSubjectiveProtocolToStorage();
    updateIqSubjectiveProtocolUi({ renderOnly: true });
    renderStudyRulesWorkspace({ force: true });
    setStatus(`Applied subjective template: ${template.label}.`);
  }

  function updateStudySubjectiveScoreLabel(control) {
    const score = Number.parseInt(control?.dataset.studyScoreLabel, 10);
    if (!getIqSubjectiveScaleValues().includes(score)) {
      return;
    }
    IQ_SUBJECTIVE_SCORE_LABELS = normalizeIqSubjectiveScoreLabels(
      {
        ...IQ_SUBJECTIVE_SCORE_LABELS,
        [score]: cleanIqSubjectiveString(control.value),
      },
      IQ_SUBJECTIVE_SCALE
    );
    saveIqSubjectiveProtocolToStorage();
    updateIqSubjectiveProtocolUi({ renderOnly: true });
    renderStudySubjectiveRules();
    setStatus(`Updated Likert score ${score} label.`);
  }

  function setStudySubjectiveScale(scaleValue) {
    IQ_SUBJECTIVE_SCALE = normalizeIqSubjectiveFieldScale(scaleValue, IQ_SUBJECTIVE_SCALE);
    IQ_SUBJECTIVE_SCORE_LABELS = normalizeIqSubjectiveScoreLabels(IQ_SUBJECTIVE_SCORE_LABELS, IQ_SUBJECTIVE_SCALE);
    IQ_SUBJECTIVE_FIELDS = IQ_SUBJECTIVE_FIELDS.map((field, index) =>
      normalizeIqSubjectiveField(
        {
          ...field,
          scale: IQ_SUBJECTIVE_SCALE,
          scoreLabels: getDefaultIqSubjectiveScoreLabels(IQ_SUBJECTIVE_SCALE),
          descriptions: getGenericIqSubjectiveDescriptions(IQ_SUBJECTIVE_SCALE),
        },
        index,
        IQ_SUBJECTIVE_SCALE
      )
    );
    saveIqSubjectiveProtocolToStorage();
    updateIqSubjectiveProtocolUi({ renderOnly: true });
    renderStudyRulesWorkspace({ force: true });
    setStatus(`Subjective categories set to ${getIqSubjectiveScaleLabel(IQ_SUBJECTIVE_SCALE)}. You can still adjust rows individually.`);
  }

  function addStudySubjectiveCategory() {
    addIqSubjectiveFieldDefinition();
    renderStudyRulesWorkspace({ force: true });
  }

  function removeStudySubjectiveCategory(fieldKey) {
    if (IQ_SUBJECTIVE_FIELDS.length <= 1) {
      setStatus("At least one subjective category must remain.", "warning");
      return;
    }
    const field = getIqSubjectiveFieldDefinition(fieldKey);
    IQ_SUBJECTIVE_FIELDS = IQ_SUBJECTIVE_FIELDS.filter((item) => item.key !== field.key);
    saveIqSubjectiveProtocolToStorage();
    state.iq.subjectiveActiveFieldKey = getDefaultIqSubjectiveFieldDefinition().key;
    updateIqSubjectiveProtocolUi({ renderOnly: true });
    renderStudyRulesWorkspace({ force: true });
    setStatus(`Removed subjective category: ${field.label}.`);
  }

  function saveCurrentStudyRules(options) {
    const activeId = options?.asNew ? "" : IQ_ACTIVE_STUDY_RULE_SET_ID;
    const name = getStudyRuleSetNameDraft();
    const snapshot = buildCurrentStudyRulesSnapshot({
      id: activeId || createIqStudyRuleSetId(name),
      name,
    });
    const existingIndex = IQ_STUDY_RULE_SETS.findIndex((ruleSet) => ruleSet.id === snapshot.id);
    if (existingIndex >= 0) {
      IQ_STUDY_RULE_SETS[existingIndex] = snapshot;
    } else {
      IQ_STUDY_RULE_SETS = [...IQ_STUDY_RULE_SETS, snapshot];
    }
    IQ_ACTIVE_STUDY_RULE_SET_ID = snapshot.id;
    saveIqStudyRuleSetsToStorage();
    saveIqTargetProtocolToStorage();
    saveIqSubjectiveProtocolToStorage();
    renderStudyRulesWorkspace({ force: true });
    setStatus(`Saved study rules: ${snapshot.name}.`);
  }

  function deleteActiveStudyRules() {
    const active = IQ_STUDY_RULE_SETS.find((ruleSet) => ruleSet.id === IQ_ACTIVE_STUDY_RULE_SET_ID);
    if (!active) {
      return;
    }
    const confirmed = window.confirm(`Delete saved study rules "${active.name}"? The currently active settings stay loaded.`);
    if (!confirmed) {
      return;
    }
    IQ_STUDY_RULE_SETS = IQ_STUDY_RULE_SETS.filter((ruleSet) => ruleSet.id !== active.id);
    IQ_ACTIVE_STUDY_RULE_SET_ID = "";
    saveIqStudyRuleSetsToStorage();
    renderStudyRulesWorkspace({ force: true });
    setStatus(`Deleted saved study rules: ${active.name}.`);
  }

  function loadSelectedStudyRules(ruleSetId) {
    const ruleSet = IQ_STUDY_RULE_SETS.find((item) => item.id === ruleSetId);
    if (!ruleSet) {
      IQ_ACTIVE_STUDY_RULE_SET_ID = "";
      renderStudyRulesWorkspace({ force: true });
      return;
    }
    const confirmed = window.confirm(
      `Load "${ruleSet.name}" as the active study rules? This replaces the current objective and subjective definitions.`
    );
    if (!confirmed) {
      renderStudyRuleSetPicker();
      return;
    }
    IQ_ACTIVE_STUDY_RULE_SET_ID = ruleSet.id;
    applyStudyRulesSnapshot(ruleSet);
    setStatus(`Loaded study rules: ${ruleSet.name}.`);
  }

  function getIqSubjectiveScoresForReconstruction(reconstructionId, options) {
    const key = safeString(reconstructionId || state.activeReconId);
    if (!key) {
      return createEmptyIqSubjectiveScoreMap();
    }
    if (!state.iq.subjectiveScoresByRecon[key] || typeof state.iq.subjectiveScoresByRecon[key] !== "object") {
      if (options?.create === false) {
        return createEmptyIqSubjectiveScoreMap();
      }
      state.iq.subjectiveScoresByRecon[key] = createEmptyIqSubjectiveScoreMap();
    }
    const scores = state.iq.subjectiveScoresByRecon[key];
    IQ_SUBJECTIVE_FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(scores, field.key)) {
        scores[field.key] = null;
      }
    });
    return scores;
  }

  function getNextIncompleteSubjectiveFieldKey(reconstructionId) {
    const scores = getIqSubjectiveScoresForReconstruction(reconstructionId);
    return (
      IQ_SUBJECTIVE_FIELDS.find((field) => !isValidIqSubjectiveScore(scores[field.key], field))?.key ||
      IQ_SUBJECTIVE_FIELDS[IQ_SUBJECTIVE_FIELDS.length - 1]?.key ||
      getDefaultIqSubjectiveFieldDefinition().key
    );
  }

  function getSubjectiveCompletionCount(reconstructionId) {
    const scores = getIqSubjectiveScoresForReconstruction(reconstructionId);
    return IQ_SUBJECTIVE_FIELDS.filter((field) => isValidIqSubjectiveScore(scores[field.key], field)).length;
  }

  function getObjectiveCompletionCount(reconstruction) {
    const completedIds = getCompletedIqTargetIds(reconstruction);
    return IQ_REQUIRED_TARGET_IDS.filter((targetId) => completedIds.has(targetId)).length;
  }

  function getObjectiveMissingCount(reconstruction) {
    return Math.max(0, IQ_REQUIRED_TARGET_IDS.length - getObjectiveCompletionCount(reconstruction));
  }

  function getSubjectiveMissingCount(reconstructionId) {
    return Math.max(0, IQ_SUBJECTIVE_FIELDS.length - getSubjectiveCompletionCount(reconstructionId));
  }

  function getMissingIqTargetLabels(reconstruction) {
    return IQ_REQUIRED_TARGET_IDS
      .map((targetId) => {
        const reason = getIqTargetMeasurementMissingReason(reconstruction, targetId);
        if (!reason) {
          return "";
        }
        return `${getIqTargetDefinition(targetId).label} (${reason})`;
      })
      .filter(Boolean);
  }

  function getMissingSubjectiveFieldLabels(reconstructionId) {
    const scores = getIqSubjectiveScoresForReconstruction(reconstructionId, { create: false }) || {};
    return IQ_SUBJECTIVE_FIELDS
      .filter((field) => !isValidIqSubjectiveScore(scores[field.key], field))
      .map((field) => field.label);
  }

  function summarizeMissingLabels(labels, maxLabels) {
    const safeLabels = (labels || []).map((label) => safeString(label)).filter(Boolean);
    const visibleLabels = safeLabels.slice(0, maxLabels || 3);
    const remainder = Math.max(0, safeLabels.length - visibleLabels.length);
    return `${visibleLabels.join(", ")}${remainder ? `, +${remainder} more` : ""}`;
  }

  function getReconstructionIndex(reconstructionId) {
    return state.reconstructions.findIndex((reconstruction) => reconstruction.id === reconstructionId);
  }

  function getNeutralReconstructionLabel(reconstructionId) {
    const index = getReconstructionIndex(reconstructionId);
    if (index < 0 || !state.reconstructions.length) {
      return "Series";
    }
    return `Series ${index + 1} of ${state.reconstructions.length}`;
  }

  function getSubjectiveReconstructionTitle(reconstruction) {
    const neutralLabel = getNeutralReconstructionLabel(reconstruction?.id);
    if (!reconstruction) {
      return neutralLabel;
    }
    if (!state.iq.subjectiveRevealReconLabel) {
      return neutralLabel;
    }
    return reconstruction.label ? `${neutralLabel} • ${reconstruction.label}` : neutralLabel;
  }

  function renderSubjectiveSeriesNavigator(reconstruction, completed) {
    if (!els.iqSubjectiveSeriesIndex || !els.iqSubjectiveSeriesDetail || !els.iqSubjectiveToggleLabelButton) {
      return;
    }

    if (!reconstruction) {
      els.iqSubjectiveSeriesIndex.textContent = "Series 0 of 0";
      els.iqSubjectiveSeriesDetail.textContent = "Load a study to begin blinded subjective scoring.";
      els.iqSubjectiveToggleLabelButton.textContent = "Show Label";
      els.iqSubjectiveToggleLabelButton.disabled = true;
      if (els.iqSubjectivePrevButton) {
        els.iqSubjectivePrevButton.disabled = true;
      }
      if (els.iqSubjectiveNextButton) {
        els.iqSubjectiveNextButton.disabled = true;
      }
      return;
    }

    const missing = getSubjectiveMissingCount(reconstruction.id);
    els.iqSubjectiveSeriesIndex.textContent = getNeutralReconstructionLabel(reconstruction.id);
    els.iqSubjectiveSeriesDetail.textContent = state.iq.subjectiveRevealReconLabel
      ? `${reconstruction.label || "Original label unavailable"} • ${completed} / ${IQ_SUBJECTIVE_FIELDS.length} scored${missing ? ` • ${missing} missing` : " • complete"}`
      : `${completed} / ${IQ_SUBJECTIVE_FIELDS.length} scored${missing ? ` • ${missing} missing` : " • complete"} • label hidden`;
    els.iqSubjectiveToggleLabelButton.textContent = state.iq.subjectiveRevealReconLabel ? "Hide Label" : "Show Label";
    els.iqSubjectiveToggleLabelButton.disabled = false;
    const canStep = state.reconstructions.length > 1;
    if (els.iqSubjectivePrevButton) {
      els.iqSubjectivePrevButton.disabled = !canStep;
    }
    if (els.iqSubjectiveNextButton) {
      els.iqSubjectiveNextButton.disabled = !canStep;
    }
  }

  function navigateIqTargetByOffset(offset) {
    const orderedTargetIds = getEnabledIqTargets().map((target) => target.id);
    if (!orderedTargetIds.length) {
      return false;
    }
    const currentIndex = Math.max(0, orderedTargetIds.indexOf(safeString(state.iq.activeTargetId)));
    const nextIndex = (currentIndex + (offset >= 0 ? 1 : -1) + orderedTargetIds.length) % orderedTargetIds.length;
    const nextTargetId = orderedTargetIds[nextIndex];
    const foundAnnotation = focusIqTargetAnnotation(nextTargetId);
    if (!foundAnnotation) {
      setActiveIqTarget(nextTargetId);
    }
    const nextTarget = getIqTargetDefinition(nextTargetId);
    setStatus(foundAnnotation ? `Jumped to ${nextTarget.label}.` : `Active ROI target: ${nextTarget.label}.`);
    return true;
  }

  function navigateReconstructionByOffset(offset, options) {
    if (!state.reconstructions.length) {
      return false;
    }
    const currentIndex = Math.max(0, state.reconstructions.findIndex((item) => item.id === state.activeReconId));
    const nextIndex = (currentIndex + (offset >= 0 ? 1 : -1) + state.reconstructions.length) % state.reconstructions.length;
    const nextReconstruction = state.reconstructions[nextIndex];
    if (!nextReconstruction) {
      return false;
    }
    setActiveReconstruction(nextReconstruction.id);
    const objectiveComplete = getObjectiveCompletionCount(nextReconstruction);
    const objectiveMissing = getObjectiveMissingCount(nextReconstruction);
    const subjectiveComplete = getSubjectiveCompletionCount(nextReconstruction.id);
    const subjectiveMissing = getSubjectiveMissingCount(nextReconstruction.id);
    const shouldHideSpecificLabel = Boolean(
      options?.hideSpecificLabel ||
      (state.activeSidebarTab === "subjective" && !state.iq.subjectiveRevealReconLabel)
    );
    const reconstructionDisplay = shouldHideSpecificLabel
      ? getNeutralReconstructionLabel(nextReconstruction.id)
      : nextReconstruction.label || getNeutralReconstructionLabel(nextReconstruction.id);
    setStatus(
      `${reconstructionDisplay} • objective ${objectiveComplete}/${IQ_REQUIRED_TARGET_IDS.length}${objectiveMissing ? ` (${objectiveMissing} missing)` : ""} • subjective ${subjectiveComplete}/${IQ_SUBJECTIVE_FIELDS.length}${subjectiveMissing ? ` (${subjectiveMissing} missing)` : ""}.`
    );
    return true;
  }

  function setActiveSubjectiveField(fieldKey) {
    state.iq.subjectiveActiveFieldKey = getIqSubjectiveFieldDefinition(fieldKey).key;
    renderIqSubjectiveCards();
  }

  function toggleSubjectiveReconLabelVisibility() {
    state.iq.subjectiveRevealReconLabel = !state.iq.subjectiveRevealReconLabel;
    renderIqSubjectiveCards();
    setStatus(
      state.iq.subjectiveRevealReconLabel
        ? "Series label shown for subjective review."
        : "Series label hidden for blinded subjective review."
    );
  }

  function setSubjectiveScore(fieldKey, score) {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      throw new Error("Load a reconstruction first.");
    }
    const field = getIqSubjectiveFieldDefinition(fieldKey);
    const allowedScores = getIqSubjectiveScaleValues(field);
    const rawScore = Number(score);
    const numericScore = allowedScores.includes(rawScore)
      ? rawScore
      : clamp(rawScore || allowedScores[0], allowedScores[0], allowedScores[allowedScores.length - 1]);
    const scores = getIqSubjectiveScoresForReconstruction(reconstruction.id);
    scores[field.key] = numericScore;
    state.iq.subjectiveActiveFieldKey = getNextIncompleteSubjectiveFieldKey(reconstruction.id);
    renderIqSubjectiveCards();
    renderIqObjectiveOutputs();
    renderReconstructionButtons();
    requestProjectSessionAutosave();
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
    if (els.workspaceModeNote) {
      els.workspaceModeNote.textContent = "Full CCTA IQ workspace enabled";
    }
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
    updateStudyRulesWorkspaceUi();
  }

  function updateStudyRulesWorkspaceUi() {
    const isStudyRules = state.activeSidebarTab === "study-rules";
    els.app?.classList.toggle("is-study-rules", isStudyRules);
    els.stage?.classList.toggle("is-study-rules", isStudyRules);
    els.studyRulesWorkspace?.classList.toggle("is-hidden", !isStudyRules);
    els.viewportGrid?.classList.toggle("is-hidden", isStudyRules);
    updateEmptyState();
    if (isStudyRules) {
      renderStudyRulesWorkspace({ force: true });
    }
  }

  function setUiMode(mode) {
    const nextMode = "advanced";
    if (state.uiMode === nextMode) {
      updateUiModeUi();
      return;
    }
    state.uiMode = nextMode;
    saveUiModePreference();
    updateUiModeUi();
    requestProjectSessionAutosave();
  }

  function setActiveSidebarTab(tabKey) {
    const nextTab = SIDEBAR_TAB_KEY_SET.has(tabKey) ? tabKey : "case";
    if (state.activeSidebarTab === nextTab) {
      updateSidebarTabsUi();
      updatePresentationFocusUi();
      return;
    }
    state.activeSidebarTab = nextTab;
    saveSidebarTabPreference();
    updateSidebarTabsUi();
    updatePresentationFocusUi();
    if (nextTab === "annotate") {
      scheduleIqTargetListAutoScroll(state.iq.activeTargetId, { behavior: "auto" });
    }
  }

  function handleSidebarNavigationClick(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const button = target?.closest?.("[data-sidebar-tab-button], [data-iq-jump-tab]");
    if (!button || !els.sidebar?.contains(button)) {
      return;
    }

    const tabKey = button.dataset.sidebarTabButton || button.dataset.iqJumpTab;
    if (!SIDEBAR_TAB_KEY_SET.has(tabKey)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setActiveSidebarTab(tabKey);
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

  function formatIqNumber(value, digits) {
    return Number.isFinite(value) ? trimTrailingDecimalZeros(Number(value).toFixed(digits ?? 1)) : "-";
  }

  function averageNumbers(values) {
    const finite = (values || []).filter(Number.isFinite);
    if (!finite.length) {
      return null;
    }
    return finite.reduce((sum, value) => sum + value, 0) / finite.length;
  }

  function buildIqObjectiveRowsForReconstruction(reconstruction) {
    if (!reconstruction) {
      return [];
    }

    return reconstruction.annotations
      .filter((annotation) => isIqRoiAnnotation(annotation))
      .map((annotation) => {
        const target = getIqTargetDefinitionForAnnotation(annotation);
        const summary = getMeasurementSummary(annotation, reconstruction) || {};
        const metricRoles = getIqTargetMetricRoles(target);
        const statKeys = getIqTargetStatKeys(target);
        const statRoles = getIqTargetStatRoles(target);
        const statLabels = getIqTargetStatLabels(target);
        const statGroups = getIqTargetStatGroups(target);
        return {
          annotation,
          reconstruction,
          reconstructionLabel: reconstruction.label || "",
          roiLabel: target.label,
          roiType: getIqRoiTypeLabel(annotation),
          vessel: target.vessel || "",
          region: target.region || "",
          segment: target.segment || "",
          roiCategory: target.roiCategory,
          locationGroup: target.locationGroup,
          metricRoles,
          statKeys,
          statRoles,
          statLabels,
          statGroups,
          color: target.stroke,
          meanHu: Number.isFinite(summary.mean) ? summary.mean : null,
          sdHu: Number.isFinite(summary.sd) ? summary.sd : null,
          minHu: Number.isFinite(summary.minHu) ? summary.minHu : null,
          maxHu: Number.isFinite(summary.maxHu) ? summary.maxHu : null,
          areaMm2: Number.isFinite(summary.areaMm2) ? summary.areaMm2 : null,
        };
      })
      .sort((left, right) => getIqTargetOrderIndex(left.annotation.iqTargetId) - getIqTargetOrderIndex(right.annotation.iqTargetId));
  }

  function buildIqMetricContext(metricKey, label, signal, background, noise) {
    return {
      key: metricKey,
      label,
      signal,
      snr: Number.isFinite(signal) && Number.isFinite(noise) && noise > 0 ? signal / noise : null,
      cnr:
        Number.isFinite(signal) && Number.isFinite(background) && Number.isFinite(noise) && noise > 0
          ? (signal - background) / noise
          : null,
    };
  }

  function pushIqContextMetric(contexts, metricKey, label, values, background, noise) {
    const signal = averageNumbers(values);
    if (!Number.isFinite(signal)) {
      return;
    }
    contexts.push(buildIqMetricContext(metricKey, label, signal, background, noise));
  }

  function buildIqSummaryRowsFromContexts(contexts, background, noise) {
    const rules = IQ_OBJECTIVE_METRIC_RULES;
    const totalContext = contexts.find((context) => context.key === "total") || null;
    const summaryRows = [
      { key: "Signal_total", label: "Signal_total", value: totalContext?.signal ?? null, unit: "HU" },
      { key: "Background", label: "Background", value: background, unit: "HU" },
      { key: "Noise", label: "Noise", value: noise, unit: "HU" },
    ];
    contexts.filter((context) => context.key !== "total").forEach((context) => {
      summaryRows.push({
        key: `Signal_${context.key}`,
        label: `Signal_${context.key}`,
        value: context.signal,
        unit: "HU",
      });
    });
    contexts.forEach((context) => {
      if (rules.snrEnabled) {
        summaryRows.push({
          key: `SNR_${context.key}`,
          label: `SNR_${context.key}`,
          value: context.snr,
          unit: "",
        });
      }
      if (rules.cnrEnabled) {
        summaryRows.push({
          key: `CNR_${context.key}`,
          label: `CNR_${context.key}`,
          value: context.cnr,
          unit: "",
        });
      }
    });
    return summaryRows;
  }

  function resolveIqTargetSourceAverage(rows, source, valueKey, fallbackRows) {
    if (source === "none") {
      return null;
    }
    if (source?.startsWith?.("target:")) {
      const targetId = source.slice("target:".length);
      return averageNumbers(rows.filter((row) => row.annotation.iqTargetId === targetId).map((row) => row[valueKey]));
    }
    return averageNumbers((fallbackRows || []).map((row) => row[valueKey]));
  }

  function getIqFormulaStatValueKey(statKey) {
    const normalized = cleanIqTargetString(statKey).toLowerCase();
    if (normalized === "mean" || normalized === "avg" || normalized === "average" || normalized === "hu") return "meanHu";
    if (normalized === "sd" || normalized === "noise" || normalized === "std" || normalized === "stdev") return "sdHu";
    if (normalized === "min" || normalized === "minimum") return "minHu";
    if (normalized === "max" || normalized === "maximum") return "maxHu";
    if (normalized === "area" || normalized === "area_mm2") return "areaMm2";
    return "";
  }

  function getIqFormulaStatKeyForValueKey(valueKey) {
    if (valueKey === "meanHu") return "mean";
    if (valueKey === "sdHu") return "sd";
    if (valueKey === "minHu") return "min";
    if (valueKey === "maxHu") return "max";
    return "";
  }

  function getIqFormulaValueKeyLabel(valueKey) {
    if (valueKey === "meanHu") return "mean HU";
    if (valueKey === "sdHu") return "SD HU";
    if (valueKey === "minHu") return "minimum HU";
    if (valueKey === "maxHu") return "maximum HU";
    if (valueKey === "areaMm2") return "area";
    return "value";
  }

  function formulaSelectorTextMatches(left, right) {
    return cleanIqTargetString(left).toLowerCase() === cleanIqTargetString(right).toLowerCase();
  }

  function describeIqFormulaSelector(selector, valueKey) {
    const cleanSelector = cleanIqTargetString(selector);
    const lastDotIndex = cleanSelector.lastIndexOf(".");
    const scope = lastDotIndex >= 0 ? cleanSelector.slice(0, lastDotIndex) : cleanSelector;
    const [rawScopeType, ...rawScopeRest] = scope.split(":");
    const scopeType = cleanIqTargetString(rawScopeType).toLowerCase();
    const scopeValue = rawScopeRest.join(":");
    const statLabel = getIqFormulaValueKeyLabel(valueKey);
    if (scopeType === "target") {
      const target = getIqTargetDefinition(scopeValue);
      return `${target ? getIqTargetRuleDisplayLabel(target) : scopeValue} ${statLabel}`;
    }
    if (scopeType === "vessel") return `${scopeValue} ${statLabel}`;
    if (scopeType === "structure") return `${scopeValue} ${statLabel}`;
    if (scopeType === "group") return `${scopeValue} group ${statLabel}`;
    if (scopeType === "role") return `${scopeValue} role ${statLabel}`;
    if (["signal", "background", "noise", "other", "all"].includes(scopeType)) return `${scopeType} ${statLabel}`;
    return `${cleanSelector || "selector"} ${statLabel}`;
  }

  function getRowsForIqFormulaSelector(rows, selector) {
    const cleanSelector = cleanIqTargetString(selector);
    const lastDotIndex = cleanSelector.lastIndexOf(".");
    if (lastDotIndex < 0) {
      return { rows: [], valueKey: "", error: "Use selector.stat, for example signal.mean or noise.sd." };
    }
    const scope = cleanSelector.slice(0, lastDotIndex);
    const stat = cleanSelector.slice(lastDotIndex + 1);
    const valueKey = getIqFormulaStatValueKey(stat);
    if (!valueKey) {
      return { rows: [], valueKey: "", error: `Unknown statistic "${stat}".` };
    }
    const [rawScopeType, ...rawScopeRest] = scope.split(":");
    const scopeType = cleanIqTargetString(rawScopeType).toLowerCase();
    const scopeValue = rawScopeRest.join(":");
    const selectorStatKey = getIqFormulaStatKeyForValueKey(valueKey);
    const rowHasStatRole = (row, role) => {
      const normalizedRole = normalizeIqTargetRoleKey(role, "");
      return selectorStatKey && row?.statRoles?.[selectorStatKey] === normalizedRole;
    };
    const rowHasStatGroup = (row, group) => {
      return selectorStatKey && formulaSelectorTextMatches(row?.statGroups?.[selectorStatKey] || row?.locationGroup, group);
    };
    const selectedRows = (rows || []).filter((row) => {
      if (scopeType === "all") {
        return true;
      }
      if (["signal", "background", "noise", "other"].includes(scopeType)) {
        return rowHasStatRole(row, scopeType);
      }
      if (scopeType === "role") {
        return rowHasStatRole(row, cleanIqTargetString(scopeValue).toLowerCase());
      }
      if (scopeType === "vessel") {
        return formulaSelectorTextMatches(row.vessel, scopeValue);
      }
      if (scopeType === "group") {
        return rowHasStatGroup(row, scopeValue);
      }
      if (scopeType === "structure") {
        return formulaSelectorTextMatches(row.vessel, scopeValue) || formulaSelectorTextMatches(row.region, scopeValue);
      }
      if (scopeType === "target") {
        return formulaSelectorTextMatches(row.annotation?.iqTargetId, scopeValue);
      }
      return false;
    });
    return {
      rows: selectedRows,
      valueKey,
      selector: cleanSelector,
      label: describeIqFormulaSelector(cleanSelector, valueKey),
      error: "",
    };
  }

  function aggregateIqFormulaValues(functionName, values) {
    const finiteValues = (values || []).filter(Number.isFinite);
    const name = cleanIqTargetString(functionName).toLowerCase();
    if (name === "count") {
      return finiteValues.length;
    }
    if (!finiteValues.length) {
      return null;
    }
    if (name === "sum") {
      return finiteValues.reduce((sum, value) => sum + value, 0);
    }
    if (name === "min") {
      return Math.min(...finiteValues);
    }
    if (name === "max") {
      return Math.max(...finiteValues);
    }
    return averageNumbers(finiteValues);
  }

  function replaceIqFormulaAggregates(expression, rows, errors) {
    return expression.replace(/\b(avg|mean|average|sum|min|max|count)\(\s*([^()]+?)\s*\)/gi, (match, functionName, selector) => {
      const selection = getRowsForIqFormulaSelector(rows, selector);
      if (selection.error) {
        const lowerFunction = cleanIqTargetString(functionName).toLowerCase();
        if (lowerFunction === "min" || lowerFunction === "max") {
          return match;
        }
        errors.push(selection.error);
        return "(0/0)";
      }
      const value = aggregateIqFormulaValues(
        functionName,
        selection.rows.map((row) => row[selection.valueKey])
      );
      if (!Number.isFinite(value) && cleanIqTargetString(functionName).toLowerCase() !== "count") {
        const reason = selection.rows.length
          ? `No finite ${getIqFormulaValueKeyLabel(selection.valueKey)} value was available for ${selection.label}.`
          : `No ROI measurement was found for ${selection.label}.`;
        errors.push(`${reason} Selector: ${selection.selector}.`);
        return "(0/0)";
      }
      return Number.isFinite(value) ? `(${value})` : "(0/0)";
    });
  }

  function evaluateSafeIqMathExpression(expression) {
    const allowedFunctions = {
      abs: Math.abs,
      sqrt: Math.sqrt,
      pow: Math.pow,
      min: Math.min,
      max: Math.max,
      round: Math.round,
      floor: Math.floor,
      ceil: Math.ceil,
      log: Math.log,
      log10: Math.log10 || ((value) => Math.log(value) / Math.LN10),
      exp: Math.exp,
    };
    const allowedConstants = {
      PI: Math.PI,
      E: Math.E,
      pi: Math.PI,
      e: Math.E,
    };
    const mathExpression = String(expression || "").replace(/\^/g, "**");
    if (!/^[0-9eE+\-*/%().,\sA-Za-z_]+$/.test(mathExpression)) {
      return { value: null, error: "Formula contains unsupported characters." };
    }
    const identifierProbe = mathExpression.replace(/\b\d+(?:\.\d+)?e[+\-]?\d+\b/gi, "1");
    const identifiers = identifierProbe.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
    const allowedNames = new Set([...Object.keys(allowedFunctions), ...Object.keys(allowedConstants)]);
    const invalidIdentifier = identifiers.find((identifier) => !allowedNames.has(identifier));
    if (invalidIdentifier) {
      return { value: null, error: `Unsupported formula word "${invalidIdentifier}".` };
    }
    try {
      const names = [...Object.keys(allowedFunctions), ...Object.keys(allowedConstants)];
      const values = [...Object.values(allowedFunctions), ...Object.values(allowedConstants)];
      const value = Function(...names, `"use strict"; return (${mathExpression});`)(...values);
      return {
        value: Number.isFinite(value) ? value : null,
        error: Number.isFinite(value) ? "" : "Formula did not produce a finite number.",
      };
    } catch (_error) {
      return { value: null, error: "Formula syntax could not be evaluated." };
    }
  }

  function evaluateIqFormulaExpression(formula, rows) {
    const expression = cleanIqTargetString(formula);
    if (!expression) {
      return { value: null, error: "Formula is empty." };
    }
    const errors = [];
    const substituted = replaceIqFormulaAggregates(expression, rows, errors);
    if (errors.length) {
      return { value: null, error: errors[0] };
    }
    return evaluateSafeIqMathExpression(substituted);
  }

  function buildIqFormulaSummaryRows(rows) {
    const rules = normalizeIqMetricRules(IQ_OBJECTIVE_METRIC_RULES, IQ_OBJECTIVE_MODEL_ID);
    const formulaMetrics = getVisibleStudyFormulaMetrics(rules);
    return formulaMetrics
      .map((metric, index) => {
        const result = evaluateIqFormulaExpression(metric.formula, rows);
        return {
          id: metric.id,
          key: metric.label,
          label: metric.label,
          value: result.value,
          unit: metric.unit || "",
          formula: metric.formula,
          metricKind: normalizeIqFormulaMetricKind(metric.metricKind || inferIqFormulaMetricKind(metric)),
          scopeKind: normalizeIqFormulaScopeKind(metric.scopeKind || inferIqFormulaScopeKind(metric)),
          order: index + 1,
          error: result.error || "",
          source: "formula",
        };
      });
  }

  function computeIqDerivedSummary(rows) {
    const model = getCurrentObjectiveModelDefinition();
    const rules = normalizeIqMetricRules(IQ_OBJECTIVE_METRIC_RULES, model.id);
    IQ_OBJECTIVE_METRIC_RULES = rules;
    const signalRows = rows.filter((row) => row.statRoles?.mean === "signal");
    const backgroundRows = rows.filter((row) => row.statRoles?.mean === "background");
    const noiseRows = rows.filter((row) => row.statRoles?.sd === "noise");

    const signalTotal = averageNumbers(signalRows.map((row) => row.meanHu));
    const background = resolveIqTargetSourceAverage(rows, rules.backgroundSource, "meanHu", backgroundRows);
    const derivedNoiseRows =
      rules.noiseSource === "signal_sd" || (model.summaryKind === "late_enhancement" && !noiseRows.length)
        ? signalRows
        : noiseRows;
    const noise = resolveIqTargetSourceAverage(rows, rules.noiseSource, "sdHu", derivedNoiseRows);
    const contexts = [];
    if (rules.totalEnabled) {
      pushIqContextMetric(contexts, "total", "total", signalRows.map((row) => row.meanHu), background, noise);
    }

    if (rules.proximalEnabled || rules.distalEnabled || rules.customGroupEnabled) {
      const preferredGroups = ["proximal", "distal"];
      if (rules.proximalEnabled) {
        pushIqContextMetric(
          contexts,
          "proximal",
          "proximal",
          signalRows.filter((row) => row.locationGroup === "proximal").map((row) => row.meanHu),
          background,
          noise
        );
      }
      if (rules.distalEnabled) {
        pushIqContextMetric(
          contexts,
          "distal",
          "distal",
          signalRows.filter((row) => row.locationGroup === "distal").map((row) => row.meanHu),
          background,
          noise
        );
      }
      if (rules.customGroupEnabled) {
        Array.from(new Set(signalRows.map((row) => row.locationGroup).filter(Boolean)))
          .filter((group) => !preferredGroups.includes(group))
          .forEach((group) => {
            pushIqContextMetric(
              contexts,
              slugifyIqTarget(group, "group"),
              group,
              signalRows.filter((row) => row.locationGroup === group).map((row) => row.meanHu),
              background,
              noise
            );
          });
      }
    }

    if (rules.perVesselEnabled) {
      const preferredVessels = ["RCA", "LAD", "LCx"];
      preferredVessels.forEach((vessel) => {
        pushIqContextMetric(
          contexts,
          vessel,
          vessel,
          signalRows.filter((row) => row.vessel === vessel).map((row) => row.meanHu),
          background,
          noise
        );
      });
      Array.from(new Set(signalRows.map((row) => row.vessel).filter(Boolean)))
        .filter((vessel) => !preferredVessels.includes(vessel))
        .forEach((vessel) => {
          pushIqContextMetric(
            contexts,
            slugifyIqTarget(vessel, "vessel"),
            vessel,
            signalRows.filter((row) => row.vessel === vessel).map((row) => row.meanHu),
            background,
            noise
          );
        });
    }

    const formulaRows = buildIqFormulaSummaryRows(rows);
    const hasFormulaDefinitions = Boolean(rules.formulaMetrics?.length);
    const summaryRows = hasFormulaDefinitions ? formulaRows : buildIqSummaryRowsFromContexts(contexts, background, noise);

    return {
      modelId: model.id,
      modelLabel: model.label,
      signalTotal,
      background,
      noise,
      signalContexts: contexts,
      summaryRows,
      completedTargetCount: IQ_REQUIRED_TARGET_IDS.filter((targetId) =>
        rows.some((row) => row.annotation.iqTargetId === targetId)
      ).length,
    };
  }

  function scrollIqTargetListToTarget(targetId, options) {
    const container = els.iqTargetList;
    if (!container || state.activeSidebarTab !== "annotate") {
      return;
    }
    const targetButton = Array.from(container.querySelectorAll("[data-target-id]"))
      .find((button) => button.dataset.targetId === safeString(targetId));
    if (!targetButton) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const targetRect = targetButton.getBoundingClientRect();
    if (!containerRect.height || !targetRect.height) {
      return;
    }

    const desiredTop = Math.max(
      0,
      container.scrollTop + (targetRect.top - containerRect.top) - 8
    );
    if (Math.abs(container.scrollTop - desiredTop) < 2) {
      return;
    }
    container.scrollTo({
      top: desiredTop,
      behavior: options?.behavior || "smooth",
    });
  }

  function scheduleIqTargetListAutoScroll(targetId, options) {
    if (!els.iqTargetList || !targetId) {
      return;
    }
    if (state.uiCache.iqTargetScrollFrameId) {
      window.cancelAnimationFrame(state.uiCache.iqTargetScrollFrameId);
    }
    state.uiCache.iqTargetScrollFrameId = window.requestAnimationFrame(() => {
      state.uiCache.iqTargetScrollFrameId = null;
      scrollIqTargetListToTarget(targetId, options);
    });
  }

  function renderIqTargetPicker(options) {
    if (!els.iqTargetSelect || !els.iqTargetList) {
      return;
    }
    if (!IQ_TARGETS_BY_ID.has(state.iq.activeTargetId)) {
      state.iq.activeTargetId = getDefaultIqTargetDefinition().id;
    }
    const reconstruction = getActiveReconstruction();
    const workflowState = getIqWorkflowState(reconstruction);
    const visibleTargets = getEnabledIqTargets();

    els.iqTargetSelect.innerHTML = visibleTargets.map(
      (target) => `<option value="${escapeHtml(target.id)}">${escapeHtml(getIqTargetRuleDisplayLabel(target))}</option>`
    ).join("");
    els.iqTargetSelect.value = state.iq.activeTargetId;
    renderIqTargetProtocolEditor();

    const selected = getSelectedAnnotation();
    const activeTarget = workflowState.currentTarget;
    if (!reconstruction) {
      els.iqTargetSummary.textContent = "Load a reconstruction to start the guided ROI sequence.";
    } else if (selected && isIqRoiAnnotation(selected)) {
      const selectedTarget = getIqTargetDefinitionForAnnotation(selected);
      const nextAfterSelectedId = getNextPendingIqTargetId(reconstruction, selectedTarget.id);
      const nextAfterSelected = nextAfterSelectedId ? getIqTargetDefinition(nextAfterSelectedId) : null;
      els.iqTargetSummary.textContent = nextAfterSelected
        ? `Editing ${getIqTargetRuleDisplayLabel(selectedTarget)}. Press Space or double click when done to move on to ${getIqTargetRuleDisplayLabel(nextAfterSelected)}.`
        : `Editing ${getIqTargetRuleDisplayLabel(selectedTarget)}. All guided objective targets are complete.`;
    } else if (workflowState.isComplete) {
      els.iqTargetSummary.textContent = `All ${IQ_REQUIRED_TARGET_IDS.length} guided objective targets are complete for ${reconstruction.label}.`;
    } else {
      els.iqTargetSummary.textContent = workflowState.nextTarget
        ? `Measure now: ${getIqTargetRuleDisplayLabel(activeTarget)}. Then continue with ${getIqTargetRuleDisplayLabel(workflowState.nextTarget)}.`
        : `Measure now: ${getIqTargetRuleDisplayLabel(activeTarget)}.`;
    }

    els.iqTargetList.innerHTML = "";
    const fragment = document.createDocumentFragment();
    visibleTargets.forEach((target) => {
      const annotation = getLatestIqAnnotationForTarget(reconstruction, target.id);
      const preview = getIqTargetMeasurementPreview(target, annotation, reconstruction);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "iq-target-button";
      button.classList.toggle("is-active", target.id === state.iq.activeTargetId);
      button.classList.toggle("is-complete", Boolean(annotation));
      button.style.setProperty("--iq-target-color", target.stroke);
      button.dataset.targetId = target.id;
      if (annotation) {
        button.dataset.annotationId = String(annotation.id);
      }
      button.title = annotation ? "Jump to the saved ROI" : "Set as the next ROI target";
      button.innerHTML = `
        <span class="iq-target-topline">
          <span class="iq-target-title">
            <span class="iq-target-swatch"></span>
            <strong>${escapeHtml(getIqTargetRuleDisplayLabel(target))}</strong>
          </span>
          <span class="iq-target-status${annotation ? " is-complete" : ""}">${preview.statusLabel}</span>
        </span>
        <span class="iq-target-meta">${escapeHtml(getIqTargetCollectedStatsDisplay(target))} · ${escapeHtml(getIqTargetRoleNumberLabels(target).join(" + "))}${target.vessel ? ` · ${escapeHtml(target.vessel)}` : ` · ${escapeHtml(target.region)}`}</span>
        <span class="iq-target-measurement">${escapeHtml(preview.detailText)}</span>
      `;
      fragment.appendChild(button);
    });
    els.iqTargetList.appendChild(fragment);
    if (options?.scrollToActive) {
      scheduleIqTargetListAutoScroll(state.iq.activeTargetId, {
        behavior: options?.scrollBehavior || "smooth",
      });
    }
  }

  function renderIqBarChart(element, rows, options) {
    if (!element) {
      return;
    }
    if (!rows.length) {
      element.classList.add("iq-bar-chart-empty");
      element.textContent = options?.emptyText || "No complete measurements yet.";
      return;
    }

    element.classList.remove("iq-bar-chart-empty");
    const maxValue = Math.max(...rows.flatMap((row) => row.values.filter(Number.isFinite)), 1);
    element.innerHTML = "";
    const fragment = document.createDocumentFragment();
    rows.forEach((row) => {
      const rowElement = document.createElement("div");
      rowElement.className = "iq-bar-row";
      const header = document.createElement("div");
      header.className = "iq-bar-header";
      header.innerHTML = `<span>${row.label}</span><span>${row.values.map((value) => formatIqNumber(value, row.digits ?? 1)).join(" / ")}</span>`;
      rowElement.appendChild(header);
      row.values.forEach((value, valueIndex) => {
        if (!Number.isFinite(value)) {
          return;
        }
        const track = document.createElement("div");
        track.className = "iq-bar-track";
        const fill = document.createElement("div");
        fill.className = "iq-bar-fill";
        fill.style.setProperty("--bar-width", `${Math.max(4, (value / maxValue) * 100)}%`);
        fill.style.setProperty("--bar-color", row.colors?.[valueIndex] || row.color || "var(--accent)");
        track.appendChild(fill);
        rowElement.appendChild(track);
      });
      fragment.appendChild(rowElement);
    });
    element.appendChild(fragment);
  }

  function renderIqObjectiveOutputs() {
    const reconstruction = getActiveReconstruction();
    const rows = buildIqObjectiveRowsForReconstruction(reconstruction);
    const summary = computeIqDerivedSummary(rows);
    const model = getCurrentObjectiveModelDefinition();
    const missingCount = Math.max(0, IQ_REQUIRED_TARGET_IDS.length - summary.completedTargetCount);
    const workflowState = getIqWorkflowState(reconstruction);

    if (els.iqWorkflowNote) {
      els.iqWorkflowNote.textContent = reconstruction
        ? workflowState.isComplete
          ? `${reconstruction.label} active • ${model.shortLabel} objective ROI sequence complete • ${getSubjectiveCompletionCount(reconstruction.id)}/${IQ_SUBJECTIVE_FIELDS.length} subjective scores complete.`
          : `${reconstruction.label} active • ${model.shortLabel} • measure ${getIqTargetRuleDisplayLabel(workflowState.currentTarget)} next • ${summary.completedTargetCount}/${IQ_REQUIRED_TARGET_IDS.length} objective targets complete • ${getSubjectiveCompletionCount(reconstruction.id)}/${IQ_SUBJECTIVE_FIELDS.length} subjective scores complete.`
        : "Load a CCTA study to begin the guided objective and subjective IQ workflow.";
    }

    if (els.iqObjectiveNote) {
      els.iqObjectiveNote.textContent = reconstruction
        ? workflowState.isComplete
          ? `All configured ${model.shortLabel} ROI targets are complete for ${reconstruction.label}.`
          : `${summary.completedTargetCount}/${IQ_REQUIRED_TARGET_IDS.length} configured targets measured${missingCount ? ` · ${missingCount} still missing` : ""} • current step: ${getIqTargetRuleDisplayLabel(workflowState.currentTarget)}.`
        : "Load a study to start ROI measurements.";
    }

    if (els.iqSummaryGrid) {
      const metricCards = [
        ["Signal Total", summary.signalTotal, "HU"],
        ["Background", summary.background, "HU"],
        ["Noise", summary.noise, "HU"],
        ["SNR Total", summary.summaryRows.find((row) => row.key === "SNR_total")?.value, ""],
        ["CNR Total", summary.summaryRows.find((row) => row.key === "CNR_total")?.value, ""],
        ["Targets Done", summary.completedTargetCount, ""],
      ];
      els.iqSummaryGrid.innerHTML = metricCards.map(([label, value, unit]) => `
        <div class="metric-card">
          <span>${label}</span>
          <strong>${Number.isFinite(value) ? `${formatIqNumber(value, unit ? 1 : 0)}${unit ? ` ${unit}` : ""}` : "-"}</strong>
        </div>
      `).join("");
    }

    renderIqBarChart(
      els.iqSnbChart,
      [
        { label: "Signal total", values: [summary.signalTotal], color: "#fdba90" },
        { label: "Background", values: [summary.background], color: "#c7a18f" },
        { label: "Noise", values: [summary.noise], color: "#b8c4d0" },
      ].filter((row) => row.values.some(Number.isFinite)),
      { emptyText: `Complete the ${model.shortLabel} ROI set to show this chart.` }
    );

    renderIqBarChart(
      els.iqSnrCnrChart,
      summary.signalContexts.map((context) => ({
        label: context.label,
        digits: 2,
        values: [
          context.snr,
          context.cnr,
        ],
        colors: ["#fdba90", "#ffd27f"],
      })).filter((row) => row.values.some(Number.isFinite)),
      { emptyText: `Complete the ${model.shortLabel} ROI set to calculate SNR and CNR.` }
    );

    if (els.iqRoiTableBody) {
      if (!rows.length) {
        els.iqRoiTableBody.innerHTML = `<tr><td colspan="7" class="iq-table-empty">No IQ ROIs yet.</td></tr>`;
      } else {
        els.iqRoiTableBody.innerHTML = rows.map((row) => `
          <tr>
            <td><span class="iq-roi-chip" style="--iq-row-color: ${row.color}">${row.roiLabel}${row.segment ? ` · ${row.segment}` : ""}</span></td>
            <td>${row.roiType}</td>
            <td>${formatIqNumber(row.meanHu, 1)}</td>
            <td>${formatIqNumber(row.sdHu, 1)}</td>
            <td>${formatIqNumber(row.minHu, 1)}</td>
            <td>${formatIqNumber(row.maxHu, 1)}</td>
            <td>${formatIqNumber(row.areaMm2, 1)}</td>
          </tr>
        `).join("");
      }
    }
    if (els.iqRoiTableNote) {
      els.iqRoiTableNote.textContent = reconstruction
        ? `Current reconstruction: ${reconstruction.label}. Objective preset: ${model.shortLabel}. Exports stay labeled per reconstruction.`
        : "Current reconstruction objective measurements.";
    }
    if (els.iqExportNote) {
      els.iqExportNote.textContent = state.reconstructions.length > 1
        ? `One Excel workbook with metadata, objective, and subjective sheets for ${state.reconstructions.length} loaded reconstructions.`
        : "One Excel workbook with metadata, objective, and subjective sheets.";
    }
  }

  const IQ_SUBJECTIVE_SCORE_COLOR_STOPS = [
    { t: 0, rgb: [112, 28, 46] },
    { t: 0.24, rgb: [171, 61, 43] },
    { t: 0.5, rgb: [199, 151, 54] },
    { t: 0.74, rgb: [99, 140, 59] },
    { t: 1, rgb: [18, 86, 53] },
  ];

  function interpolateIqSubjectiveScoreColor(t) {
    const normalized = clamp(Number.isFinite(t) ? t : 0, 0, 1);
    const upperIndex = IQ_SUBJECTIVE_SCORE_COLOR_STOPS.findIndex((stop) => normalized <= stop.t);
    if (upperIndex <= 0) {
      return IQ_SUBJECTIVE_SCORE_COLOR_STOPS[0].rgb;
    }
    const lower = IQ_SUBJECTIVE_SCORE_COLOR_STOPS[upperIndex - 1];
    const upper = IQ_SUBJECTIVE_SCORE_COLOR_STOPS[upperIndex];
    const localT = clamp((normalized - lower.t) / Math.max(0.001, upper.t - lower.t), 0, 1);
    return lower.rgb.map((channel, index) => Math.round(channel + (upper.rgb[index] - channel) * localT));
  }

  function getIqSubjectiveScoreButtonStyle(index, count) {
    const denominator = Math.max(1, count - 1);
    const [red, green, blue] = interpolateIqSubjectiveScoreColor(index / denominator);
    return [
      `--score-bg: rgba(${red}, ${green}, ${blue}, 0.16)`,
      `--score-bg-soft: rgba(${red}, ${green}, ${blue}, 0.07)`,
      `--score-border: rgba(${red}, ${green}, ${blue}, 0.44)`,
      `--score-active-bg: rgba(${red}, ${green}, ${blue}, 0.3)`,
      `--score-active-border: rgba(${red}, ${green}, ${blue}, 0.78)`,
    ].join("; ");
  }

  function renderIqSubjectiveCards() {
    if (!els.iqSubjectiveCardList) {
      return;
    }
    renderIqSubjectiveProtocolEditor();
    const reconstruction = getActiveReconstruction();
    const scores = getIqSubjectiveScoresForReconstruction(reconstruction?.id, { create: false });
    const completed = getSubjectiveCompletionCount(reconstruction?.id);
    const seriesTitle = getSubjectiveReconstructionTitle(reconstruction);
    renderSubjectiveSeriesNavigator(reconstruction, completed);
    if (els.iqSubjectiveProgress) {
      els.iqSubjectiveProgress.textContent = reconstruction
        ? `${completed} / ${IQ_SUBJECTIVE_FIELDS.length} completed`
        : `0 / ${IQ_SUBJECTIVE_FIELDS.length} completed`;
    }
    if (els.iqSubjectiveNote) {
      if (!reconstruction) {
        els.iqSubjectiveNote.textContent = "Load a study to score subjective image quality.";
      } else if (completed === IQ_SUBJECTIVE_FIELDS.length) {
        els.iqSubjectiveNote.textContent = `${seriesTitle} is fully scored.`;
      } else {
        els.iqSubjectiveNote.textContent = `Scoring ${seriesTitle}. Use the category buttons or matching keyboard numbers while the image remains visible.`;
      }
    }

    els.iqSubjectiveCardList.innerHTML = "";
    const fragment = document.createDocumentFragment();
    IQ_SUBJECTIVE_FIELDS.forEach((field) => {
      const scaleValues = getIqSubjectiveScaleValues(field);
      const compactScoreButtons = scaleValues.length >= 6;
      const score = scores[field.key];
      const validScore = isValidIqSubjectiveScore(score, field) ? score : null;
      const isActive = state.iq.subjectiveActiveFieldKey === field.key;
      const card = document.createElement("article");
      card.className = "subjective-card";
      card.classList.toggle("is-active", isActive);
      card.classList.toggle("is-complete", Number.isFinite(validScore));
      card.dataset.fieldKey = field.key;
      card.style.setProperty("--subjective-score-count", String(scaleValues.length));
      card.innerHTML = `
        <div class="subjective-card-header">
          <strong>${escapeHtml(field.label)}</strong>
          <span class="subjective-score-badge">${Number.isFinite(validScore) ? validScore : "-"}</span>
        </div>
        <div class="subjective-card-copy">${
          Number.isFinite(validScore)
            ? escapeHtml(field.descriptions[validScore])
            : `Select ${escapeHtml(getIqSubjectiveScaleLabel(field))}. Lowest score = worst / most impaired, highest score = best / least impaired.`
        }</div>
        <div class="subjective-option-grid" data-score-count="${scaleValues.length}">
          ${scaleValues.map((value, index) => {
            const scoreLabel = getIqSubjectiveScoreLabel(value, field);
            return `
            <button
              class="subjective-option-button ${compactScoreButtons ? "is-compact-score" : ""} ${validScore === value ? "is-active" : ""}"
              type="button"
              data-field-key="${escapeHtml(field.key)}"
              data-score="${value}"
              style="${getIqSubjectiveScoreButtonStyle(index, scaleValues.length)}"
              title="${escapeHtml(`${value}: ${scoreLabel}`)}"
              aria-label="${escapeHtml(`${field.label}: ${value}, ${scoreLabel}`)}"
            >
              <strong>${value}</strong>
              <span title="Double-click to rename this score value">${escapeHtml(scoreLabel)}</span>
            </button>
          `;
          }).join("")}
        </div>
      `;
      fragment.appendChild(card);
    });
    els.iqSubjectiveCardList.appendChild(fragment);
  }

  function getImageCount() {
    return getActiveReconstruction()?.volume.depth || 0;
  }

  function getSectionStorageKey(sectionId) {
    return `hagrad.ccta_iq.sidebar.${sectionId}`;
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

  function dedupeShortcutSettings() {
    const assigned = new Map();
    SHORTCUT_ACTIONS.forEach((action) => {
      const normalized = normalizeShortcutKeyValue(state.shortcuts[action.id]?.key);
      state.shortcuts[action.id].key = normalized;
      if (!normalized) {
        return;
      }
      if (assigned.has(normalized)) {
        state.shortcuts[action.id].key = "";
        return;
      }
      assigned.set(normalized, action.id);
    });
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
    dedupeShortcutSettings();
    saveShortcutSettings();
  }

  function saveShortcutSettings() {
    try {
      window.localStorage?.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(state.shortcuts));
    } catch (_error) {
      // Ignore storage issues.
    }
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
      setStatus(`${normalized} is reserved for fixed viewer behavior.`, "warning");
      renderShortcutTable();
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

  function runShortcutAction(actionId) {
    switch (actionId) {
      case "circularRoi":
      case "freehandRoi":
      case "segmentationRoi":
      case "brushRoi":
      case "contourCorrect":
      case "eraser":
      case "length":
      case "probe":
      case "lineProfile":
      case "squareProfile":
      case "arrow":
      case "text":
      case "mprCursor":
      case "windowLevel":
      case "pan":
      case "zoom":
        setActiveTool(actionId);
        return true;
      case "exportCurrent":
        setActiveSidebarTab("export");
        exportCurrentViewportPng().catch((error) => {
          console.error(error);
          setStatus(error.message || "Current PNG export failed.", "error");
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
  }

  function getShortcutDisplayForTool(toolKey) {
    return normalizeShortcutKeyValue(state.shortcuts?.[toolKey]?.key);
  }

  function getToolActionLabel(toolKey) {
    return SHORTCUT_ACTIONS.find((action) => action.id === toolKey)?.label || toolKey;
  }

  function updateViewportToolHuds() {
    if (!els.toolHuds?.length) {
      return;
    }
    const label = getToolActionLabel(state.activeToolKey);
    const shortcut = getShortcutDisplayForTool(state.activeToolKey);
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
      const shortcut = getShortcutDisplayForTool(button.dataset.tool);
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
    updateViewportToolHuds();
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
        state.presentationFocus ? "Exit immersive focus view" : "Enter immersive CCTA IQ focus view"
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
    const normalizedTab = SIDEBAR_TAB_KEY_SET.has(tab) ? tab : "case";
    const shouldClose = state.presentationFocus && state.focusSidebarOpen && state.activeSidebarTab === normalizedTab;
    setActiveSidebarTab(normalizedTab);
    if (state.presentationFocus) {
      setFocusSidebarOpen(!shouldClose);
      scheduleFocusLayoutRender();
    }
  }

  function setLayout(layout, options) {
    const previousLayout = state.layout;
    state.layout = layout === "mpr" ? "mpr" : "presentation";
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

  function returnToPrimaryTool() {
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
      state.iq.contourCorrectionDraft = null;
    }
    if (toolKey !== "eraser") {
    state.eraser.preview = null;
    }
    state.activeToolKey = toolKey;
    setActiveSidebarTab("annotate");
    closeRoiToolMenu();
    updateToolButtons();
    updateToolOptionsUi();
    updateViewportCursors();
    requestRenderAll();
  }

  function getToolHoverCopy(toolKey) {
    if (toolKey === "roi") {
      return "ROI tools: O = Probe, C = ROI Circle, D = ROI Draw, Q = ROI Multiple Click, B = ROI Brush, A = Adjust ROI, E = Eraser.";
    }
    const shortcutLabel = state.shortcuts?.[toolKey]?.key ? `Shortcut ${state.shortcuts[toolKey].key}. ` : "";
    return `${shortcutLabel}${TOOL_CONTEXT_NOTES[toolKey] || ""}`.trim();
  }

  function clearToolHoverTimer() {
    if (state.toolHover.timerId) {
      window.clearTimeout(state.toolHover.timerId);
      state.toolHover.timerId = null;
    }
  }

  function hideToolHoverTooltip() {
    clearToolHoverTimer();
    state.toolHover.toolKey = "";
    if (els.toolHoverTooltip) {
      els.toolHoverTooltip.classList.add("is-hidden");
      els.toolHoverTooltip.textContent = "";
    }
  }

  function showToolHoverTooltip(target, toolKey) {
    if (!els.toolHoverTooltip || !target) {
      return;
    }
    const rect = target.getBoundingClientRect();
    els.toolHoverTooltip.textContent = getToolHoverCopy(toolKey);
    els.toolHoverTooltip.style.top = `${Math.round(rect.bottom + 10)}px`;
    els.toolHoverTooltip.classList.remove("is-hidden");
    const tooltipRect = els.toolHoverTooltip.getBoundingClientRect();
    const centeredLeft = rect.left + rect.width / 2;
    const clampedLeft = clamp(centeredLeft, tooltipRect.width / 2 + 12, window.innerWidth - tooltipRect.width / 2 - 12);
    els.toolHoverTooltip.style.left = `${Math.round(clampedLeft)}px`;
  }

  function scheduleToolHoverTooltip(target, toolKey) {
    hideToolHoverTooltip();
    state.toolHover.toolKey = toolKey;
    state.toolHover.timerId = window.setTimeout(() => {
      state.toolHover.timerId = null;
      showToolHoverTooltip(target, toolKey);
    }, TOOL_HOVER_DELAY_MS);
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

  function cloneRoiClipboard() {
    if (!state.roiClipboard?.annotation && !state.roiClipboard?.pointsMm?.length) {
      return null;
    }
    return {
      plane: state.roiClipboard.plane,
      pointsMm: (state.roiClipboard.pointsMm || []).map((point) => ({
        xMm: point.xMm,
        yMm: point.yMm,
      })),
      annotation: state.roiClipboard.annotation ? cloneAnnotation(state.roiClipboard.annotation) : null,
    };
  }

  function createAnnotationHistorySnapshot() {
    return {
      annotationSequence: state.annotationSequence,
      activeReconId: state.activeReconId,
      selectedAnnotationId: state.selectedAnnotationId,
      selectedProfileAnnotationId: state.selectedProfileAnnotationId,
      roiClipboard: cloneRoiClipboard(),
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
    state.eraser.preview = null;
    state.annotationSequence = snapshot.annotationSequence;
    state.roiClipboard = snapshot.roiClipboard
      ? {
          plane: snapshot.roiClipboard.plane,
          pointsMm: (snapshot.roiClipboard.pointsMm || []).map((point) => ({
            xMm: point.xMm,
            yMm: point.yMm,
          })),
          annotation: snapshot.roiClipboard.annotation ? cloneAnnotation(snapshot.roiClipboard.annotation) : null,
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
        subjectiveScores: { ...getIqSubjectiveScoresForReconstruction(reconstruction.id) },
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

    state.iq.subjectiveScoresByRecon = {};
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
      state.iq.subjectiveScoresByRecon[reconstruction.id] = stored?.subjectiveScores
        ? {
            ...createEmptyIqSubjectiveScoreMap(),
            ...stored.subjectiveScores,
          }
        : createEmptyIqSubjectiveScoreMap();
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
    state.iq.subjectiveActiveFieldKey = getNextIncompleteSubjectiveFieldKey(state.activeReconId);

    const activeAnnotations = getActiveAnnotations();
    state.selectedAnnotationId = activeAnnotations.some((annotation) => annotation.id === snapshot.selectedAnnotationId)
      ? snapshot.selectedAnnotationId
      : null;
    state.selectedProfileAnnotationId = activeAnnotations.some(
      (annotation) => annotation.id === snapshot.selectedProfileAnnotationId
    )
      ? snapshot.selectedProfileAnnotationId
      : null;
    syncActiveIqTargetToWorkflow(getActiveReconstruction(), { force: !state.selectedAnnotationId });

    els.viewportGrid.classList.toggle("layout-mpr", state.layout === "mpr");
    els.viewportGrid.classList.toggle("layout-presentation", state.layout !== "mpr");
    if (els.cineSpeedReadout) {
      els.cineSpeedReadout.textContent = `${state.cineFps} fps`;
    }
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
      const targetLabel = isIqRoiAnnotation(annotation) ? `${getIqTargetDefinitionForAnnotation(annotation).label} • ` : "";
      return `${leadType}${targetLabel}${summary.areaMm2.toFixed(1)} mm2 • Avg ${summary.mean != null ? Math.round(summary.mean) : "-"} HU`;
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

    if (isIqRoiAnnotation(annotation)) {
      return getIqTargetDefinitionForAnnotation(annotation).label;
    }

    const baseName = formatMeasurementType(annotation);
    if (PROFILE_TYPES.has(annotation.type)) {
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
        renameAnnotation(annotation.id);
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
    if (isIqRoiAnnotation(annotation)) {
      state.iq.activeTargetId = annotation.iqTargetId;
    }
    if (annotation && PROFILE_TYPES.has(annotation.type)) {
      state.selectedProfileAnnotationId = annotation.id;
    }
    if (!annotation && state.selectedProfileAnnotationId === annotationId) {
      state.selectedProfileAnnotationId = null;
    }
    renderIqTargetPicker({ scrollToActive: isIqRoiAnnotation(annotation) });
    renderIqObjectiveOutputs();
    renderAnnotationManager();
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
    els.emptyState.classList.toggle("is-hidden", state.activeSidebarTab === "study-rules" || Boolean(getActiveReconstruction()));
  }

  function renderReconstructionButtons() {
    const signature = JSON.stringify({
      activeReconId: state.activeReconId,
      reconstructions: state.reconstructions.map((reconstruction) => ({
        id: reconstruction.id,
        label: reconstruction.label,
        depth: reconstruction.volume.depth,
        annotationCount: reconstruction.annotations.length,
        objectiveComplete: getObjectiveCompletionCount(reconstruction),
        subjectiveComplete: getSubjectiveCompletionCount(reconstruction.id),
      })),
    });
    if (state.uiCache.reconstructionList === signature) {
      return;
    }
    state.uiCache.reconstructionList = signature;
    els.reconstructionList.innerHTML = "";
    state.reconstructions.forEach((reconstruction) => {
      const objectiveComplete = getObjectiveCompletionCount(reconstruction);
      const objectiveMissing = getObjectiveMissingCount(reconstruction);
      const subjectiveComplete = getSubjectiveCompletionCount(reconstruction.id);
      const subjectiveMissing = getSubjectiveMissingCount(reconstruction.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "recon-button";
      button.classList.toggle("is-active", reconstruction.id === state.activeReconId);
      button.innerHTML = `
        <strong>${reconstruction.label}</strong>
        <span>${reconstruction.volume.depth} slices</span>
        <span>Objective ${objectiveComplete}/${IQ_REQUIRED_TARGET_IDS.length}${objectiveMissing ? ` • ${objectiveMissing} missing` : " • complete"}</span>
        <span>Subjective ${subjectiveComplete}/${IQ_SUBJECTIVE_FIELDS.length}${subjectiveMissing ? ` • ${subjectiveMissing} missing` : " • complete"}</span>
      `;
      button.addEventListener("click", () => {
        setActiveReconstruction(reconstruction.id);
      });
      els.reconstructionList.appendChild(button);
    });
    els.reconstructionSummary.textContent = `${state.reconstructions.length} loaded`;
    updateMeasurementTransferControls();
  }

  function updateMeasurementTransferControls() {
    const sourceReconstruction = getActiveReconstruction();
    const measurementCount = sourceReconstruction
      ? sourceReconstruction.annotations.filter((annotation) => MEASUREMENT_TYPES.has(annotation.type)).length
      : 0;
    const otherReconCount = Math.max(0, state.reconstructions.length - 1);
    const objectiveComplete = sourceReconstruction ? getObjectiveCompletionCount(sourceReconstruction) : 0;
    const objectiveMissing = sourceReconstruction ? getObjectiveMissingCount(sourceReconstruction) : IQ_REQUIRED_TARGET_IDS.length;
    const subjectiveComplete = sourceReconstruction ? getSubjectiveCompletionCount(sourceReconstruction.id) : 0;
    const subjectiveMissing = sourceReconstruction ? getSubjectiveMissingCount(sourceReconstruction.id) : IQ_SUBJECTIVE_FIELDS.length;
    const canTransfer = Boolean(sourceReconstruction && otherReconCount > 0 && measurementCount > 0);

    [els.syncMeasurementsButton].forEach((button) => {
      if (button) {
        button.disabled = !canTransfer;
      }
    });

    if (!els.reconstructionTransferNote) {
      return;
    }
    if (!sourceReconstruction) {
      els.reconstructionTransferNote.textContent = "Load a study first, then add more reconstructions when you want synchronized IQ measurements.";
      return;
    }
    if (!otherReconCount) {
      els.reconstructionTransferNote.textContent = "Add at least one more reconstruction to transfer the ROI and measurement set.";
      return;
    }
    if (!measurementCount) {
      els.reconstructionTransferNote.textContent = `Draw the reference ROI set on ${sourceReconstruction.label}, then transfer it to the other ${otherReconCount} reconstruction${otherReconCount === 1 ? "" : "s"}. Objective ${objectiveComplete}/${IQ_REQUIRED_TARGET_IDS.length} complete${objectiveMissing ? ` • ${objectiveMissing} missing` : ""}.`;
      return;
    }
    els.reconstructionTransferNote.textContent = `Ready to transfer ${measurementCount} measurement${measurementCount === 1 ? "" : "s"} from ${sourceReconstruction.label} to ${otherReconCount} other reconstruction${otherReconCount === 1 ? "" : "s"}. Objective ${objectiveComplete}/${IQ_REQUIRED_TARGET_IDS.length}${objectiveMissing ? ` • ${objectiveMissing} missing` : " • complete"}; subjective ${subjectiveComplete}/${IQ_SUBJECTIVE_FIELDS.length}${subjectiveMissing ? ` • ${subjectiveMissing} missing` : " • complete"}.`;
  }

  function updateMetadata() {
    const reconstruction = getActiveReconstruction();
    const record = reconstruction?.records?.[0];
    const volume = reconstruction?.volume;
    const signature = JSON.stringify({
      activeReconId: reconstruction?.id || "",
      patientName: record?.patientName || "",
      patientId: record?.patientId || "",
      label: reconstruction?.label || "",
      modality: record?.modality || "",
      depth: volume?.depth || 0,
      rows: volume?.rows || 0,
      columns: volume?.columns || 0,
      spacing: record?.pixelSpacing || [],
      sliceSpacing: volume?.sliceSpacing || 0,
      sliceThickness: record?.sliceThickness || 0,
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

  function updateSidebarUi() {
    updateUiModeUi();
    updateSidebarTabsUi();
    renderIqTargetPicker();
    renderIqObjectiveOutputs();
    renderIqSubjectiveCards();
    updateVoiUi();
    updateMprUi();
    updateSyncButton();
    updateMeasurementCount();
    renderProjectUi();
    renderProjectCases();
    updateMetadata();
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
    getIqSubjectiveScoresForReconstruction(reconstructionId);
    state.iq.subjectiveActiveFieldKey = getNextIncompleteSubjectiveFieldKey(reconstructionId);
    if (!reconstruction.annotations.some((annotation) => annotation.id === state.selectedAnnotationId)) {
      state.selectedAnnotationId = null;
    }
    syncActiveIqTargetToWorkflow(reconstruction, { force: !state.selectedAnnotationId });
    if (!state.mpr.centerWorld) {
      state.mpr.centerWorld = cloneVector(reconstruction.volume.centerWorld);
    }

    updateSidebarUi();
    if (state.activeSidebarTab === "annotate") {
      scheduleIqTargetListAutoScroll(state.iq.activeTargetId, { behavior: "auto" });
    }
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
    state.mpr.planeNormals = null;
    state.maximizedViewportId = null;
    state.polygonDraft = null;
    state.iq.contourCorrectionDraft = null;
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

    if (els.sliceSlider) {
      els.sliceSlider.disabled = !axialMetrics;
      els.sliceSlider.max = String(Math.max(0, (axialMetrics?.count ?? 1) - 1));
      els.sliceSlider.value = String(axialIndex);
    }
    if (els.sliceSummary) {
      els.sliceSummary.textContent = summary;
    }
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
      return overlay;
    }

    ctx.save();
    ctx.fillStyle = "#f5fbff";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

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

  function drawLabelChip(ctx, text, x, y, fill) {
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
  }

  function getLabelChipBounds(ctx, text, x, y) {
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

  function drawSelectionHandle(ctx, point, radiusPx) {
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
    return clone;
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
    return clone;
  }

  function addAnnotation(annotation) {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      return;
    }
    if (isRoiAnnotationType(annotation.type) && !safeString(annotation.iqTargetId)) {
      assignIqTargetToAnnotation(annotation, state.iq.activeTargetId, {
        sourceTool: annotation.iqSourceTool || state.activeToolKey,
      });
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

  function createAnnotationBase(type, frame) {
    return {
      id: state.annotationSequence++,
      type,
      plane: frame.plane,
      frame: cloneFrame(frame),
      viewContext: createAnnotationViewContext(frame),
      worldPoints: [],
    };
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
    let minHu = Number.POSITIVE_INFINITY;
    let maxHu = Number.NEGATIVE_INFINITY;

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
        minHu = Math.min(minHu, value);
        maxHu = Math.max(maxHu, value);
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
      minHu,
      maxHu,
      areaMm2: count * mask.stepMm * mask.stepMm,
      sampleCount: count,
    };
  }

  function getBrushLabel(annotation, reconstruction) {
    const stats = getBrushStats(annotation, reconstruction);
    const targetPrefix = isIqRoiAnnotation(annotation) ? `${getIqTargetDefinitionForAnnotation(annotation).label} · ` : "";
    return stats
      ? `${targetPrefix}Avg ${Math.round(stats.mean)} HU / SD ${stats.sd.toFixed(1)} / Area ${stats.areaMm2.toFixed(1)} mm2`
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
    const metrics = frame?.metrics;
    if (!metrics) {
      return FREEHAND_ROI_SAMPLE_DISTANCE_MM;
    }
    return Math.max(
      FREEHAND_ROI_SAMPLE_DISTANCE_MM,
      Math.min(Number(metrics.spacingX) || 1, Number(metrics.spacingY) || 1) * 0.85
    );
  }

  function getMinimumCircularRoiRadiusMm(frame) {
    const spacingX = Number(frame?.metrics?.spacingX) || 0;
    const spacingY = Number(frame?.metrics?.spacingY) || 0;
    const spacingFloor = spacingX > 0 || spacingY > 0 ? Math.max(spacingX, spacingY) : 0;
    return Math.max(MIN_CIRCULAR_ROI_DIAMETER_MM / 2, spacingFloor);
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
      annotation.worldPoints = [];
      return true;
    }

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
    let minHu = Number.POSITIVE_INFINITY;
    let maxHu = Number.NEGATIVE_INFINITY;

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
        minHu = Math.min(minHu, value);
        maxHu = Math.max(maxHu, value);
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
      minHu,
      maxHu,
      areaMm2: getPolygonAreaMm2(planePoints),
      vertexCount: planePoints.length,
    };
  }

  function getFreehandLabel(annotation, reconstruction) {
    const stats = getFreehandStats(annotation, reconstruction);
    const targetPrefix = isIqRoiAnnotation(annotation) ? `${getIqTargetDefinitionForAnnotation(annotation).label} · ` : "";
    return stats
      ? `${targetPrefix}Mean ${Math.round(stats.mean)} HU / SD ${stats.sd.toFixed(1)} / Area ${stats.areaMm2.toFixed(1)} mm2`
      : "ROI Draw";
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
    annotation.iqSourceTool = "circularRoi";
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
      sourceAnnotation.iqSourceTool !== "segmentationRoi" ||
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
    annotation.iqSourceTool = sourceAnnotation.iqSourceTool;
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
    annotation.iqSourceTool = "contourCorrect";
    return true;
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
        const labelPlacement = getRoiLabelPlacement(annotation, reconstruction, geometry, viewportState.ctx);
        const insideLabel = Boolean(
          labelPlacement &&
          planePoint.canvasX >= labelPlacement.bounds.x &&
          planePoint.canvasX <= labelPlacement.bounds.x + labelPlacement.bounds.width &&
          planePoint.canvasY >= labelPlacement.bounds.y &&
          planePoint.canvasY <= labelPlacement.bounds.y + labelPlacement.bounds.height
        );
        considerHit(
          insideLabel
            ? { annotation, mode: "labelMove", priority: 1, distancePx: 0 }
            : null
        );
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
        const labelPlacement = getRoiLabelPlacement(annotation, reconstruction, geometry, viewportState.ctx);
        const insideLabel = Boolean(
          labelPlacement &&
          planePoint.canvasX >= labelPlacement.bounds.x &&
          planePoint.canvasX <= labelPlacement.bounds.x + labelPlacement.bounds.width &&
          planePoint.canvasY >= labelPlacement.bounds.y &&
          planePoint.canvasY <= labelPlacement.bounds.y + labelPlacement.bounds.height
        );
        considerHit(
          insideLabel
            ? { annotation, mode: "labelMove", priority: 1, distancePx: 0 }
            : null
        );
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

  function drawSelectedAnnotationOverlay(ctx, annotation, reconstruction, frame, geometry) {
    if (!annotation || !isAnnotationVisible(annotation, frame)) {
      return;
    }

    const handleRadiusPx = 5.5;
    const roiTheme = isIqRoiAnnotation(annotation) ? getIqAnnotationTheme(annotation) : null;
    ctx.save();
    ctx.strokeStyle = roiTheme?.stroke || "#ffffff";
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
      const rotationHandle = planeMmToCanvasPoint(geometry, getSquareProfileRotationHandle(box).xMm, getSquareProfileRotationHandle(box).yMm);
      ctx.beginPath();
      ctx.moveTo((corners[0].x + corners[1].x) / 2, (corners[0].y + corners[1].y) / 2);
      ctx.lineTo(rotationHandle.x, rotationHandle.y);
      ctx.stroke();
      drawSelectionHandle(ctx, rotationHandle, handleRadiusPx);
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
      drawSelectionHandle(ctx, planeMmToCanvasPoint(geometry, centroid.xMm, centroid.yMm), handleRadiusPx);
      const labelPlacement = getRoiLabelPlacement(annotation, reconstruction, geometry, ctx);
      if (labelPlacement) {
        ctx.strokeRect(labelPlacement.bounds.x, labelPlacement.bounds.y, labelPlacement.bounds.width, labelPlacement.bounds.height);
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
        const circleGeometry = getCircularRoiGeometry(annotation);
        const handlePlanePoint = getCircularRoiHandlePlanePoint(annotation);
        if (circleGeometry && handlePlanePoint) {
          const center = planeMmToCanvasPoint(geometry, circleGeometry.centerXmm, circleGeometry.centerYmm);
          const handle = planeMmToCanvasPoint(geometry, handlePlanePoint.x, handlePlanePoint.y);
          ctx.beginPath();
          ctx.moveTo(center.x, center.y);
          ctx.lineTo(handle.x, handle.y);
          ctx.stroke();
          drawSelectionHandle(ctx, handle, handleRadiusPx);
        }
      } else {
        getEditableRoiHandleIndices(annotation).forEach((pointIndex) => {
          const point = points[pointIndex];
          if (point) {
            drawSelectionHandle(ctx, point, handleRadiusPx);
          }
        });
      }
      const labelPlacement = getRoiLabelPlacement(annotation, reconstruction, geometry, ctx);
      if (labelPlacement) {
        ctx.strokeRect(labelPlacement.bounds.x, labelPlacement.bounds.y, labelPlacement.bounds.width, labelPlacement.bounds.height);
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

  function formatMeasurementType(annotationOrType) {
    const annotation = annotationOrType && typeof annotationOrType === "object" ? annotationOrType : null;
    const type = annotation?.type || annotationOrType;
    if (type === "lineProfile") {
      return "Line Profile";
    }
    if (type === "squareProfile") {
      return "Square Profile";
    }
    if (type === "freehandRoi") {
      if (annotation?.iqSourceTool === "circularRoi") {
        return "ROI Circle";
      }
      if (annotation?.iqSourceTool === "segmentationRoi") {
        return "ROI Multiple Click";
      }
      return "ROI Draw";
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

  function drawAnnotation(ctx, annotation, reconstruction, frame, geometry, options) {
    if (!isAnnotationVisible(annotation, frame)) {
      return;
    }

    if (annotation.type === "text") {
      const point = projectWorldPointToCanvas(frame, geometry, annotation.worldPoints[0]);
      if (!options?.preview) {
        drawLabelChip(ctx, annotation.text, point.x, point.y, "rgba(255, 207, 102, 0.94)");
      }
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
      if (!options?.preview) {
        drawLabelChip(ctx, getProbeLabel(annotation, reconstruction), point.x, point.y, "rgba(87, 200, 255, 0.94)");
      }
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
      if (!options?.preview) {
        drawLabelChip(ctx, getLengthLabel(annotation), end.x, end.y, "rgba(255, 207, 102, 0.94)");
      }
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
      if (!options?.preview) {
        drawLabelChip(ctx, "Profile", end.x, end.y, "rgba(122, 244, 168, 0.96)");
      }
      return;
    }

    if (annotation.type === "squareProfile") {
      const box = getSquareProfilePlaneBox(annotation);
      const points = getSquareProfileCorners(box).map((corner) => planeMmToCanvasPoint(geometry, corner.xMm, corner.yMm));
      drawPolygonShape(ctx, points, "#9cf06b", "rgba(156, 240, 107, 0.10)");
      if (!options?.preview) {
        drawLabelChip(ctx, "Square Profile", points[1].x, points[1].y, "rgba(156, 240, 107, 0.96)");
      }
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
      const theme = getIqAnnotationTheme(annotation);
      const cellRadiusPx = Math.max(1.6, mask.stepMm * geometry.scale * 0.58);
      ctx.save();
      ctx.fillStyle = theme.fill;
      ctx.strokeStyle = theme.stroke;
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
      if (!options?.preview) {
        const labelPlacement = getRoiLabelPlacement(annotation, reconstruction, geometry, ctx);
        if (labelPlacement) {
          drawLabelChip(ctx, labelPlacement.text, labelPlacement.anchorCanvas.x, labelPlacement.anchorCanvas.y, theme.labelFill);
        }
      }
      return;
    }

    if (annotation.type === "freehandRoi") {
      const theme = getIqAnnotationTheme(annotation);
      const points = annotation.worldPoints.map((worldPoint) => projectWorldPointToCanvas(frame, geometry, worldPoint));
      drawPolygonShape(ctx, points, theme.stroke, theme.fill);
      if (!options?.preview) {
        const labelPlacement = getRoiLabelPlacement(annotation, reconstruction, geometry, ctx);
        if (labelPlacement) {
          drawLabelChip(ctx, labelPlacement.text, labelPlacement.anchorCanvas.x, labelPlacement.anchorCanvas.y, theme.labelFill);
        }
      }
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
    const target = getActiveIqTargetDefinition();
    drawPolygonShape(ctx, points, target.stroke, target.fill, true);
  }

  function drawIqWorkflowOverlay(ctx, reconstruction, viewportId, canvasWidth) {
    if (!reconstruction) {
      return;
    }
    const selected = getSelectedAnnotation();
    const workflowState = getIqWorkflowState(reconstruction);
    const target = selected && isIqRoiAnnotation(selected)
      ? getIqTargetDefinitionForAnnotation(selected)
      : workflowState.currentTarget;
    if (!target) {
      return;
    }
    const stepIndex = Math.max(0, IQ_REQUIRED_TARGET_IDS.indexOf(target.id)) + 1;
    const queue = getIqWorkflowQueue(reconstruction, target.id, 4);
    const upcomingText = queue.slice(1).map((entry) => entry.label).join("  ->  ");

    ctx.save();
    ctx.fillStyle = "rgba(5, 12, 18, 0.76)";
    ctx.strokeStyle = target.stroke;
    ctx.lineWidth = 1.4;
    const boxWidth = Math.min(380, canvasWidth - 36);
    const boxHeight = upcomingText ? 74 : 56;
    const x = canvasWidth - boxWidth - 18;
    const y = 18;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(x, y, boxWidth, boxHeight, 14);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(x, y, boxWidth, boxHeight);
      ctx.strokeRect(x, y, boxWidth, boxHeight);
    }

    ctx.fillStyle = target.stroke;
    ctx.font = "700 14px Aptos, sans-serif";
    ctx.fillText(`Now ${stepIndex}/${IQ_REQUIRED_TARGET_IDS.length}`, x + 16, y + 21);
    ctx.fillStyle = "#f4f8fb";
    ctx.font = "700 16px Aptos, sans-serif";
    const suffix = viewportId === state.activeViewportId ? "" : ` • ${VIEWPORT_CONFIG[viewportId]?.title || viewportId}`;
    const targetText = `${getIqTargetRuleDisplayLabel(target)}${suffix}`;
    ctx.fillText(targetText.length > 48 ? `${targetText.slice(0, 45)}...` : targetText, x + 16, y + 44);
    if (upcomingText) {
      ctx.fillStyle = "#9fb6c7";
      ctx.font = "500 12px Aptos, sans-serif";
      ctx.fillText("Next", x + 16, y + 61);
      ctx.fillStyle = "#dce7ef";
      ctx.font = "500 12px Aptos, sans-serif";
      ctx.fillText(upcomingText, x + 58, y + 61);
    }
    ctx.restore();
  }

  function drawContourCorrectionPreview(ctx, frame, geometry) {
    const draft = state.iq.contourCorrectionDraft;
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
        drawAnnotation(ctx, options.previewAnnotation, reconstruction, frame, geometry, { preview: true });
      }
      if (options?.showIqWorkflowOverlay) {
        drawIqWorkflowOverlay(ctx, reconstruction, options.viewportId || "", canvasWidth);
      }
    }
  }

  function zoomViewportAtClientPoint(viewportId, clientX, clientY, deltaY) {
    const viewportState = state.viewports[viewportId];
    if (!viewportState?.lastGeometry || !viewportState?.lastFrame) {
      return;
    }
    const planePoint = canvasToPlanePoint(viewportId, clientX, clientY);
    const rect = viewportState.canvas.getBoundingClientRect();
    const oldZoom = Math.max(0.2, viewportState.zoom || 1);
    const zoomMultiplier = Math.exp((-deltaY || 0) * 0.0018);
    const newZoom = clamp(oldZoom * zoomMultiplier, 0.2, 12);
    const fitScale = viewportState.lastGeometry.scale / oldZoom;

    if (!planePoint || !Number.isFinite(fitScale)) {
      setViewportTransform(viewportId, { zoom: newZoom }, { sync: true });
      requestRenderViewports(state.syncMprTransforms ? VIEWPORT_IDS : [viewportId], { readouts: false });
      return;
    }

    const newScale = fitScale * newZoom;
    const panX = planePoint.canvasX - rect.width / 2 - planePoint.xMm * newScale;
    const panY = planePoint.canvasY - rect.height / 2 - planePoint.yMm * newScale;
    setViewportTransform(viewportId, { zoom: newZoom, panX, panY }, { sync: true });
    requestRenderViewports(state.syncMprTransforms ? VIEWPORT_IDS : [viewportId], { readouts: false });
  }

  function isDrawingInteractionActive(viewportId) {
    if (state.polygonDraft?.viewportId === viewportId) {
      return true;
    }
    if (!state.dragging || state.dragging.viewportId !== viewportId) {
      return false;
    }
    return new Set(["circularRoi", "editAnnotation", "brushRoiPaint", "contourCorrect"]).has(state.dragging.type);
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
      viewportId,
      showIqWorkflowOverlay: viewportId === (state.layout === "presentation" ? "presentation" : state.activeViewportId),
      showMprOverlay: state.mpr.overlayVisible !== false && (state.layout === "mpr" || state.activeToolKey === "mprCursor"),
      previewAnnotation:
        ((state.dragging?.type === "annotation" || state.dragging?.type === "circularRoi") &&
          state.dragging.viewportId === viewportId &&
          state.dragging.annotation) ||
        null,
    });
  }

  function renderAll() {
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
    if (els.cineButton) {
      els.cineButton.textContent = "Play Cine";
    }
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
    if (els.cineButton) {
      els.cineButton.textContent = "Pause Cine";
    }
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
    await downloadCanvas(exportCanvas, buildExportFilename(`current_${exportViewportId}`, "png"));
    setStatus("Current viewport exported as a ZIP bundle.");
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

    await downloadCanvas(exportCanvas, buildExportFilename("comparison_4up", "png"));
    setStatus("4-up comparison exported as a ZIP bundle.");
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
      return `exports_outbox/ccta-iq/${study.slug}`;
    }
    return "exports_outbox/ccta-iq";
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
      : "Mirrored exports will also be saved to exports_outbox/ccta-iq until a study is selected.";
    if (els.measurementExportStudyTargetNote) {
      els.measurementExportStudyTargetNote.textContent = text;
    }
    if (els.baselineExportStudyTargetNote) {
      els.baselineExportStudyTargetNote.textContent = text;
    }
    if (els.iqExportStudyTargetNote) {
      els.iqExportStudyTargetNote.textContent = text;
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
    if (els.iqExportStudySelect) {
      exportStudyApi?.populateSelect(els.iqExportStudySelect, state.exportStudies, state.currentExportStudyId, "No study selected");
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

  function buildIqExportReadinessIssues() {
    return state.reconstructions.map((reconstruction) => {
      const missingObjectiveLabels = getMissingIqTargetLabels(reconstruction);
      const missingSubjectiveLabels = getMissingSubjectiveFieldLabels(reconstruction.id);
      const metricIssueLabels = computeIqDerivedSummary(buildIqObjectiveRowsForReconstruction(reconstruction)).summaryRows
        .filter((row) => row.error || !Number.isFinite(row.value))
        .map((row) => `${row.label}${row.error ? ` (${row.error})` : " (not computable)"}`);
      return {
        reconstruction,
        missingObjectiveLabels,
        missingSubjectiveLabels,
        metricIssueLabels,
      };
    }).filter((issue) => issue.missingObjectiveLabels.length || issue.missingSubjectiveLabels.length || issue.metricIssueLabels.length);
  }

  function renderIqExportReadinessWarning() {
    if (!els.iqExportReadinessWarning || !els.iqExportReadinessWarningText || !els.iqExportReadinessWarningList) {
      return [];
    }
    const issues = buildIqExportReadinessIssues();
    if (!issues.length) {
      els.iqExportReadinessWarning.classList.add("is-hidden");
      els.iqExportReadinessWarningList.innerHTML = "";
      return issues;
    }

    const reconstructionCount = state.reconstructions.length;
    els.iqExportReadinessWarningText.textContent =
      `${issues.length} of ${reconstructionCount} loaded reconstruction${reconstructionCount === 1 ? "" : "s"} still ` +
      `have missing objective ROI measurements, missing subjective scores, or non-computable metric formulas. Export requires explicit confirmation.`;
    els.iqExportReadinessWarningList.innerHTML = issues.map((issue) => {
      const neutralLabel = getNeutralReconstructionLabel(issue.reconstruction.id);
      const reconstructionLabel = issue.reconstruction.label && issue.reconstruction.label !== neutralLabel
        ? `${neutralLabel} • ${issue.reconstruction.label}`
        : neutralLabel;
      const objectivePart = issue.missingObjectiveLabels.length
        ? `objective ${issue.missingObjectiveLabels.length}/${IQ_REQUIRED_TARGET_IDS.length} missing (${summarizeMissingLabels(issue.missingObjectiveLabels, 3)})`
        : "objective complete";
      const subjectivePart = issue.missingSubjectiveLabels.length
        ? `subjective ${issue.missingSubjectiveLabels.length}/${IQ_SUBJECTIVE_FIELDS.length} missing (${summarizeMissingLabels(issue.missingSubjectiveLabels, 3)})`
        : "subjective complete";
      const metricPart = issue.metricIssueLabels.length
        ? `metrics ${issue.metricIssueLabels.length} issue${issue.metricIssueLabels.length === 1 ? "" : "s"} (${summarizeMissingLabels(issue.metricIssueLabels, 2)})`
        : "metrics computable";
      return `<li><strong>${escapeHtml(reconstructionLabel)}</strong>: ${escapeHtml(objectivePart)}; ${escapeHtml(subjectivePart)}; ${escapeHtml(metricPart)}.</li>`;
    }).join("");
    els.iqExportReadinessWarning.classList.remove("is-hidden");
    return issues;
  }

  function dismissIqExportReadinessWarning() {
    els.iqExportReadinessWarning?.classList.add("is-hidden");
  }

  function buildIqExportReadinessDialogMessage(issues) {
    const lines = [
      "Export readiness warning",
      "",
      "At least one loaded series is incomplete. Every enabled objective ROI target on every loaded series needs a valid measurable ROI, and every subjective image-quality category on every loaded series needs a score.",
      "",
      ...issues.slice(0, 8).map((issue) => {
        const neutralLabel = getNeutralReconstructionLabel(issue.reconstruction.id);
        const reconstructionLabel = issue.reconstruction.label && issue.reconstruction.label !== neutralLabel
          ? `${neutralLabel} - ${issue.reconstruction.label}`
          : neutralLabel;
        const parts = [];
        if (issue.missingObjectiveLabels.length) {
          parts.push(`objective missing: ${summarizeMissingLabels(issue.missingObjectiveLabels, 4)}`);
        }
        if (issue.missingSubjectiveLabels.length) {
          parts.push(`subjective missing: ${summarizeMissingLabels(issue.missingSubjectiveLabels, 4)}`);
        }
        if (issue.metricIssueLabels.length) {
          parts.push(`metric issues: ${summarizeMissingLabels(issue.metricIssueLabels, 3)}`);
        }
        return `${reconstructionLabel}: ${parts.join("; ")}`;
      }),
    ];
    if (issues.length > 8) {
      lines.push(`...and ${issues.length - 8} more incomplete series.`);
    }
    lines.push("", "Press OK only if you intentionally want to export an incomplete dataset.");
    return lines.join("\n");
  }

  function confirmIqExportReadinessOrAbort() {
    const issues = renderIqExportReadinessWarning();
    if (!issues.length) {
      return true;
    }
    setStatus(
      `Export blocked for review: ${issues.length} loaded series still have missing objective or subjective IQ data.`,
      "warning"
    );
    els.iqExportReadinessWarning?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    return window.confirm(buildIqExportReadinessDialogMessage(issues));
  }

  function openIqExportModal() {
    if (!state.reconstructions.length) {
      throw new Error("Load a coronary CTA study first.");
    }
    refreshExportStudyOptions().catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not load export studies.", "error");
    });
    state.iq.exportResearchStudyId = state.iq.exportResearchStudyId || state.currentExportStudyId || "";
    state.iq.exportPatientStudyId = state.iq.exportPatientStudyId || suggestMeasurementStudyId();
    if (els.iqExportResearchIdInput) {
      els.iqExportResearchIdInput.value = state.iq.exportResearchStudyId;
    }
    if (els.iqExportPatientIdInput) {
      els.iqExportPatientIdInput.value = state.iq.exportPatientStudyId;
    }
    const readinessIssues = renderIqExportReadinessWarning();
    els.iqExportModal?.classList.remove("is-hidden");
    els.iqExportModal?.setAttribute("aria-hidden", "false");
    els.iqExportModal?.scrollTo?.({ top: 0 });
    els.iqExportModal?.querySelector(".modal-option-list")?.scrollTo?.({ top: 0 });
    document.body.classList.add("is-modal-open");
    if (readinessIssues.length) {
      setStatus(
        `Export readiness warning: ${readinessIssues.length} loaded reconstruction${readinessIssues.length === 1 ? "" : "s"} still have missing IQ data.`,
        "warning"
      );
      els.iqExportReadinessWarningClose?.focus();
    } else {
      els.iqExportPatientIdInput?.focus();
      els.iqExportPatientIdInput?.select();
    }
  }

  function closeIqExportModal() {
    els.iqExportModal?.classList.add("is-hidden");
    els.iqExportModal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-modal-open");
  }

  function buildIqExportBaseName(patientStudyId, suffix) {
    const reconstruction = getActiveReconstruction() || state.reconstructions[0] || null;
    const record = reconstruction?.records?.[0] || {};
    const patient = sanitizeFilePart(record.patientName || record.patientId || "patient", "patient");
    const study = sanitizeFilePart(patientStudyId || "", "study");
    return `${study}_${patient}_${suffix}`;
  }

  function buildIqMetadataSheetRows(researchStudyId, patientStudyId) {
    const exportStudy = getSelectedExportStudyMetadata();
    const rows = buildBaselineCharacteristicsRows().map((row) => ({
      research_study_id: researchStudyId,
      patient_study_id: patientStudyId,
      export_study_id: exportStudy.id,
      export_study_label: exportStudy.label,
      ...row,
    }));
    const headers = [
      "research_study_id",
      "patient_study_id",
      "export_study_id",
      "export_study_label",
      ...getBaselineCharacteristicsHeaders().filter((header) => header !== "study_id" && header !== "research_study_id" && header !== "research_study_label"),
    ];
    return [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))];
  }

  function getReconstructionSeriesNumberForExport(reconstruction) {
    const records = reconstruction?.records || [];
    const seriesNumber = records.find((record) => Number.isFinite(record.seriesNumber))?.seriesNumber;
    return formatNumberForCsv(seriesNumber, 0);
  }

  function buildIqObjectiveExportBaseRow(researchStudyId, patientStudyId, exportStudy, summary, reconstruction, seriesNumber) {
    return {
      research_study_id: researchStudyId,
      patient_study_id: patientStudyId,
      export_study_id: exportStudy.id,
      export_study_label: exportStudy.label,
      objective_model_id: summary.modelId,
      objective_model_label: summary.modelLabel,
      reconstruction_label: reconstruction.label,
      series_number: seriesNumber,
    };
  }

  function buildIqObjectiveTargetExportRow(baseRow, target, row, recordType) {
    const targetOrder = getIqTargetDisplayOrder(target);
    const metricRoles = getIqTargetMetricRoles(target);
    const statKeys = getIqTargetStatKeys(target);
    const statAssignments = statKeys.map((statKey) => {
      const assignment = getIqTargetStatAssignmentLabel(target, statKey);
      const group = getIqTargetGroupForStat(target, statKey);
      return `${statKey}=${assignment}${group ? ` [${group}]` : ""}`;
    });
    const hasExportableStats = Boolean(row) && statKeys.some((statKey) => {
      if (statKey === "mean") return Number.isFinite(row.meanHu);
      if (statKey === "sd") return Number.isFinite(row.sdHu);
      if (statKey === "min") return Number.isFinite(row.minHu);
      if (statKey === "max") return Number.isFinite(row.maxHu);
      return false;
    });
    return {
      ...baseRow,
      record_type: recordType,
      target_order: targetOrder,
      target_id: target.id,
      target_rule_label: getIqTargetRuleDisplayLabel(target),
      role_numbers: getIqTargetRoleNumbersForExport(target),
      roi_label: row?.roiLabel || target.label,
      roi_type: row?.roiType || "",
      vessel: row?.vessel || target.vessel || "",
      region: row?.region || target.region || "",
      segment: row?.segment || target.segment || "",
      location_group: row?.locationGroup || target.locationGroup || "",
      metric_roles: metricRoles.join(";"),
      stat_assignments: statAssignments.join(";"),
      mean_assignment: statKeys.includes("mean") ? getIqTargetStatAssignmentLabel(target, "mean") : "",
      sd_assignment: statKeys.includes("sd") ? getIqTargetStatAssignmentLabel(target, "sd") : "",
      min_assignment: statKeys.includes("min") ? getIqTargetStatAssignmentLabel(target, "min") : "",
      max_assignment: statKeys.includes("max") ? getIqTargetStatAssignmentLabel(target, "max") : "",
      collected_hu_stats: statKeys.join(";"),
      collected_hu_label: getIqTargetCollectedStatsDisplay(target),
      mean_hu: row && statKeys.includes("mean") ? formatNumberForCsv(row.meanHu, 3) : "",
      sd_hu: row && statKeys.includes("sd") ? formatNumberForCsv(row.sdHu, 3) : "",
      min_hu: row && statKeys.includes("min") ? formatNumberForCsv(row.minHu, 3) : "",
      max_hu: row && statKeys.includes("max") ? formatNumberForCsv(row.maxHu, 3) : "",
      area_mm2: row ? formatNumberForCsv(row.areaMm2, 3) : "",
      metric_order: "",
      metric_id: "",
      metric_kind: "",
      metric_scope: "",
      metric_label: "",
      metric_value: "",
      metric_unit: "",
      metric_formula: "",
      metric_status: row ? (hasExportableStats ? "ok" : "not_computable_roi") : "missing_roi",
    };
  }

  function buildIqObjectiveSheetRows(researchStudyId, patientStudyId) {
    const exportStudy = getSelectedExportStudyMetadata();
    const headers = [
      "record_type",
      "research_study_id",
      "patient_study_id",
      "export_study_id",
      "export_study_label",
      "objective_model_id",
      "objective_model_label",
      "reconstruction_label",
      "series_number",
      "target_order",
      "target_id",
      "target_rule_label",
      "role_numbers",
      "roi_label",
      "roi_type",
      "vessel",
      "region",
      "segment",
      "location_group",
      "metric_roles",
      "stat_assignments",
      "mean_assignment",
      "sd_assignment",
      "min_assignment",
      "max_assignment",
      "collected_hu_stats",
      "collected_hu_label",
      "mean_hu",
      "sd_hu",
      "min_hu",
      "max_hu",
      "area_mm2",
      "metric_order",
      "metric_id",
      "metric_kind",
      "metric_scope",
      "metric_label",
      "metric_value",
      "metric_unit",
      "metric_formula",
      "metric_status",
    ];
    const rows = [];
    state.reconstructions.forEach((reconstruction) => {
      const seriesNumber = getReconstructionSeriesNumberForExport(reconstruction);
      const roiRows = buildIqObjectiveRowsForReconstruction(reconstruction);
      const summary = computeIqDerivedSummary(roiRows);
      const baseRow = buildIqObjectiveExportBaseRow(researchStudyId, patientStudyId, exportStudy, summary, reconstruction, seriesNumber);
      const measuredTargetIds = new Set();
      const targetRows = [];
      roiRows.forEach((row) => {
        const target = getIqTargetDefinitionForAnnotation(row.annotation);
        measuredTargetIds.add(target.id);
        targetRows.push(buildIqObjectiveTargetExportRow(baseRow, target, row, "roi"));
      });
      getEnabledIqTargets()
        .filter((target) => !measuredTargetIds.has(target.id))
        .forEach((target) => {
          targetRows.push(buildIqObjectiveTargetExportRow(baseRow, target, null, "roi_missing"));
        });
      targetRows.sort((left, right) => Number(left.target_order || 0) - Number(right.target_order || 0));
      rows.push(...targetRows);
      summary.summaryRows.forEach((row) => {
        rows.push({
          ...baseRow,
          record_type: "summary",
          target_order: "",
          target_id: "",
          target_rule_label: "",
          role_numbers: "",
          roi_label: "",
          roi_type: "",
          vessel: "",
          region: "",
          segment: "",
          location_group: "",
          metric_roles: "",
          stat_assignments: "",
          mean_assignment: "",
          sd_assignment: "",
          min_assignment: "",
          max_assignment: "",
          collected_hu_stats: "",
          collected_hu_label: "",
          mean_hu: "",
          sd_hu: "",
          min_hu: "",
          max_hu: "",
          area_mm2: "",
          metric_order: row.order || "",
          metric_id: row.id || row.key || "",
          metric_kind: row.metricKind || "",
          metric_scope: row.scopeKind || "",
          metric_label: row.label,
          metric_value: formatNumberForCsv(row.value, 6),
          metric_unit: row.unit,
          metric_formula: row.formula || "",
          metric_status: Number.isFinite(row.value) ? "ok" : (row.error ? `not_computable: ${row.error}` : "not_computable"),
        });
      });
    });
    return [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))];
  }

  function formatIqSubjectiveScoreOptionsForExport(field) {
    return getIqSubjectiveScaleValues(field)
      .map((value) => {
        const label = getIqSubjectiveScoreLabel(value, field);
        const description = cleanIqSubjectiveString(field.descriptions?.[value]);
        return `${value}=${label}${description ? `: ${description}` : ""}`;
      })
      .join(" | ");
  }

  function buildIqSubjectiveSheetRows(researchStudyId, patientStudyId) {
    const exportStudy = getSelectedExportStudyMetadata();
    const headers = [
      "research_study_id",
      "patient_study_id",
      "export_study_id",
      "export_study_label",
      "reconstruction_label",
      "series_number",
      "category_order",
      "question_key",
      "question_label",
      "likert_scale",
      "score_options",
      "score",
      "score_label",
      "score_description",
      "score_status",
    ];
    const rows = [];
    state.reconstructions.forEach((reconstruction) => {
      const seriesNumber = getReconstructionSeriesNumberForExport(reconstruction);
      const scores = getIqSubjectiveScoresForReconstruction(reconstruction.id);
      IQ_SUBJECTIVE_FIELDS.forEach((field, index) => {
        const score = scores[field.key];
        const validScore = isValidIqSubjectiveScore(score, field) ? score : null;
        rows.push([
          researchStudyId,
          patientStudyId,
          exportStudy.id,
          exportStudy.label,
          reconstruction.label,
          seriesNumber,
          index + 1,
          field.key,
          field.label,
          getIqSubjectiveScaleLabel(field),
          formatIqSubjectiveScoreOptionsForExport(field),
          Number.isFinite(validScore) ? validScore : "",
          Number.isFinite(validScore) ? getIqSubjectiveScoreLabel(validScore, field) : "",
          Number.isFinite(validScore) ? field.descriptions[validScore] : "",
          Number.isFinite(validScore) ? "ok" : "missing_score",
        ]);
      });
    });
    return [headers, ...rows];
  }

  function xmlEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function normalizeWorkbookCellValue(value) {
    if (value == null) {
      return "";
    }
    return typeof value === "string" ? value : String(value);
  }

  function getWorkbookCellType(value) {
    return typeof value === "number" && Number.isFinite(value) ? "Number" : "String";
  }

  function buildSpreadsheetWorkbookXml(sheets) {
    const validSheets = (sheets || []).filter((sheet) => safeString(sheet?.name) && Array.isArray(sheet?.rows) && sheet.rows.length);
    const worksheetXml = validSheets.map((sheet) => {
      const sheetName = safeString(sheet.name).replace(/[\\/:*?\[\]]/g, "_").slice(0, 31) || "Sheet";
      const maxColumns = Math.max(...sheet.rows.map((row) => row.length), 0);
      const rowXml = sheet.rows.map((row, rowIndex) => {
        const cells = row.map((cell) => {
          const cellValue = normalizeWorkbookCellValue(cell);
          const type = rowIndex === 0 ? "String" : getWorkbookCellType(cell);
          const styleId = rowIndex === 0 ? ' ss:StyleID="Header"' : "";
          return `<Cell${styleId}><Data ss:Type="${type}">${xmlEscape(cellValue)}</Data></Cell>`;
        }).join("");
        return `<Row>${cells}</Row>`;
      }).join("");
      return `<Worksheet ss:Name="${xmlEscape(sheetName)}"><Table ss:ExpandedColumnCount="${maxColumns}" ss:ExpandedRowCount="${sheet.rows.length}" x:FullColumns="1" x:FullRows="1">${rowXml}</Table></Worksheet>`;
    }).join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Aptos" ss:Size="11" ss:Color="#0b1720"/>
   <Interior/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Aptos" ss:Size="11" ss:Bold="1" ss:Color="#f4f8fb"/>
   <Interior ss:Color="#0f2230" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 ${worksheetXml}
</Workbook>`;
  }

  function buildIqReviewCanvas() {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      throw new Error("Load a study first.");
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
    return exportCanvas;
  }

  function getRepresentativeIqRows(rows) {
    const preferredIds = [
      ...IQ_ROI_TARGETS.filter((target) => target.roiCategory === "noise").map((target) => target.id),
      ...IQ_ROI_TARGETS.filter((target) => target.roiCategory === "coronary").map((target) => target.id),
      ...IQ_ROI_TARGETS.filter((target) => target.roiCategory === "background").map((target) => target.id),
    ];
    const representatives = [];
    preferredIds.forEach((targetId) => {
      const match = rows.find((row) => row.annotation?.iqTargetId === targetId);
      if (match && !representatives.some((row) => row.annotation?.id === match.annotation?.id)) {
        representatives.push(match);
      }
    });
    rows
      .filter((row) => row.roiCategory === "coronary")
      .forEach((row) => {
        if (representatives.length < 3 && !representatives.some((entry) => entry.annotation?.id === row.annotation?.id)) {
          representatives.push(row);
        }
      });
    rows.forEach((row) => {
      if (representatives.length < 3 && !representatives.some((entry) => entry.annotation?.id === row.annotation?.id)) {
        representatives.push(row);
      }
    });
    return representatives.slice(0, 3);
  }

  function getIqSummaryReferenceRow(rows) {
    return rows.find((row) => row.roiCategory === "noise") || rows.find((row) => row.roiCategory === "coronary") || rows[0] || null;
  }

  function getAnnotationCanvasBounds(annotation, frame, geometry) {
    if (!annotation || !frame || !geometry) {
      return null;
    }
    if (annotation.type === "brushRoi") {
      const bounds = getBrushMaskBounds(annotation);
      if (!bounds) {
        return null;
      }
      const topLeft = planeMmToCanvasPoint(geometry, bounds.minX, bounds.minY);
      const bottomRight = planeMmToCanvasPoint(geometry, bounds.maxX, bounds.maxY);
      return {
        x: Math.min(topLeft.x, bottomRight.x),
        y: Math.min(topLeft.y, bottomRight.y),
        width: Math.abs(bottomRight.x - topLeft.x),
        height: Math.abs(bottomRight.y - topLeft.y),
      };
    }
    if (annotation.type === "freehandRoi") {
      const points = annotation.worldPoints.map((worldPoint) => projectWorldPointToCanvas(frame, geometry, worldPoint));
      if (!points.length) {
        return null;
      }
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
        height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
      };
    }
    return null;
  }

  function drawSummaryRoiCard(ctx, previewCanvas, row, frame, geometry, x, y, width, height) {
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = row.color || "#7ecbff";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, width, height);

    const thumbSize = 74;
    const thumbX = x + 10;
    const thumbY = y + 10;
    const bounds = getAnnotationCanvasBounds(row.annotation, frame, geometry);
    if (bounds) {
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      const cropSize = clamp(Math.max(bounds.width, bounds.height) * 2.35, 68, Math.min(previewCanvas.width, previewCanvas.height));
      const sourceX = clamp(centerX - cropSize / 2, 0, Math.max(0, previewCanvas.width - cropSize));
      const sourceY = clamp(centerY - cropSize / 2, 0, Math.max(0, previewCanvas.height - cropSize));
      ctx.drawImage(previewCanvas, sourceX, sourceY, cropSize, cropSize, thumbX, thumbY, thumbSize, thumbSize);
    } else {
      ctx.drawImage(previewCanvas, thumbX, thumbY, thumbSize, thumbSize);
    }
    ctx.strokeStyle = row.color || "#7ecbff";
    ctx.lineWidth = 2;
    ctx.strokeRect(thumbX, thumbY, thumbSize, thumbSize);

    ctx.fillStyle = "#f4f8fb";
    ctx.font = "700 14px Aptos, sans-serif";
    ctx.fillText(row.roiLabel, x + 96, y + 24);
    ctx.fillStyle = "#9fb6c7";
    ctx.font = "500 12px Aptos, sans-serif";
    ctx.fillText(`${row.roiType}${row.segment ? ` • ${row.segment}` : ""}`, x + 96, y + 42);
    ctx.fillText(`Mean ${formatIqNumber(row.meanHu, 1)} HU`, x + 96, y + 60);
    ctx.fillText(`SD ${formatIqNumber(row.sdHu, 1)} • Area ${formatIqNumber(row.areaMm2, 1)} mm2`, x + 96, y + 78);
  }

  function buildIqSummaryCanvas(researchStudyId, patientStudyId) {
    const reconstructions = state.reconstructions.slice();
    if (!reconstructions.length) {
      throw new Error("Load a study first.");
    }
    const subjectiveRowCount = Math.ceil(IQ_SUBJECTIVE_FIELDS.length / 2);
    const rowHeight = Math.max(362, 226 + subjectiveRowCount * 44 + 36);
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = 1640;
    exportCanvas.height = 180 + reconstructions.length * rowHeight;
    const ctx = exportCanvas.getContext("2d");
    ctx.fillStyle = "#081018";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    ctx.fillStyle = "#f4f8fb";
    ctx.font = "700 34px Aptos, sans-serif";
    ctx.fillText("HAGRad CCTA IQ Summary", 42, 56);
    ctx.fillStyle = "#9fb6c7";
    ctx.font = "500 18px Aptos, sans-serif";
    ctx.fillText(
      `research_study_ID ${researchStudyId} • patient_study_ID ${patientStudyId} • ${reconstructions.length} reconstruction${reconstructions.length === 1 ? "" : "s"}`,
      42,
      90
    );

    reconstructions.forEach((reconstruction, reconstructionIndex) => {
      const top = 126 + reconstructionIndex * rowHeight;
      const rows = buildIqObjectiveRowsForReconstruction(reconstruction);
      const summary = computeIqDerivedSummary(rows);
      const subjectiveScores = getIqSubjectiveScoresForReconstruction(reconstruction.id, { create: false });
      const previewCanvas = document.createElement("canvas");
      previewCanvas.width = 360;
      previewCanvas.height = 220;
      const previewCtx = previewCanvas.getContext("2d");
      const referenceRow = getIqSummaryReferenceRow(rows);
      const previewViewportState = {
        zoom: 1,
        panX: 0,
        panY: 0,
        bufferCanvas: document.createElement("canvas"),
      };
      const previewFrame = getCurrentPlaneFrame("axial", reconstruction);
      if (previewFrame && referenceRow?.annotation) {
        const focusWorld = getAnnotationFocusWorld(referenceRow.annotation);
        if (focusWorld) {
          previewFrame.centerWorld = cloneVector(focusWorld);
        }
      }
      if (previewFrame) {
        drawPlaneScene(previewCtx, reconstruction, previewFrame, previewCanvas.width, previewCanvas.height, previewViewportState, {
          includeAnnotations: true,
          annotationList: getVisibleAnnotationsForFrame(reconstruction, previewFrame),
          viewportId: "presentation",
          showIqWorkflowOverlay: false,
          showMprOverlay: false,
        });
      }
      const previewGeometry = previewViewportState.lastGeometry;
      const representativeRows = getRepresentativeIqRows(rows);

      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(28, top, exportCanvas.width - 56, rowHeight - 22);

      ctx.drawImage(previewCanvas, 48, top + 24, previewCanvas.width, previewCanvas.height);
      ctx.fillStyle = "#d6e4ec";
      ctx.font = "700 24px Aptos, sans-serif";
      ctx.fillText(reconstruction.label, 438, top + 42);
      ctx.fillStyle = "#9fb6c7";
      ctx.font = "500 15px Aptos, sans-serif";
      ctx.fillText(
        `${summary.modelLabel} • ${rows.length} ROI result${rows.length === 1 ? "" : "s"} • ${summary.completedTargetCount}/${IQ_REQUIRED_TARGET_IDS.length} guided targets • ${getSubjectiveCompletionCount(reconstruction.id)}/${IQ_SUBJECTIVE_FIELDS.length} subjective scores`,
        438,
        top + 68
      );

      const metricRows = [
        ["Signal_total", summary.signalTotal, "#fdba90"],
        ["Background", summary.background, "#c7a18f"],
        ["Noise", summary.noise, "#b8c4d0"],
        ["SNR_total", summary.summaryRows.find((row) => row.key === "SNR_total")?.value, "#f3a779"],
        ["CNR_total", summary.summaryRows.find((row) => row.key === "CNR_total")?.value, "#ffd27f"],
      ];
      metricRows.forEach(([label, value, color], metricIndex) => {
        const x = 438 + (metricIndex % 3) * 220;
        const y = top + 102 + Math.floor(metricIndex / 3) * 72;
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(x, y, 196, 52);
        ctx.fillStyle = "#9fb6c7";
        ctx.font = "500 14px Aptos, sans-serif";
        ctx.fillText(label, x + 14, y + 20);
        ctx.fillStyle = color;
        ctx.font = "700 22px Aptos, sans-serif";
        ctx.fillText(formatIqNumber(value, 2), x + 14, y + 42);
      });

      const barMetrics = [
        { label: "Signal", value: summary.signalTotal, color: "#fdba90" },
        { label: "Background", value: summary.background, color: "#c7a18f" },
        { label: "Noise", value: summary.noise, color: "#b8c4d0" },
        { label: "SNR", value: summary.summaryRows.find((row) => row.key === "SNR_total")?.value, color: "#f3a779" },
        { label: "CNR", value: summary.summaryRows.find((row) => row.key === "CNR_total")?.value, color: "#ffd27f" },
      ].filter((entry) => Number.isFinite(entry.value));
      const maxBarValue = Math.max(1, ...barMetrics.map((entry) => entry.value));
      ctx.fillStyle = "#d6e4ec";
      ctx.font = "700 18px Aptos, sans-serif";
      ctx.fillText("Statistical graph", 1128, top + 40);
      barMetrics.forEach((entry, barIndex) => {
        const y = top + 58 + barIndex * 28;
        const x = 1128;
        ctx.fillStyle = "#d6e4ec";
        ctx.font = "600 13px Aptos, sans-serif";
        ctx.fillText(entry.label, x, y + 11);
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(x + 80, y, 210, 14);
        ctx.fillStyle = entry.color;
        ctx.fillRect(x + 80, y, Math.max(6, (entry.value / maxBarValue) * 210), 14);
        ctx.fillStyle = "#9fb6c7";
        ctx.font = "500 13px Aptos, sans-serif";
        ctx.fillText(formatIqNumber(entry.value, 2), x + 302, y + 11);
      });

      ctx.fillStyle = "#d6e4ec";
      ctx.font = "700 18px Aptos, sans-serif";
      ctx.fillText("Representative ROIs", 438, top + 194);
      representativeRows.forEach((row, cardIndex) => {
        drawSummaryRoiCard(
          ctx,
          previewCanvas,
          row,
          previewFrame,
          previewGeometry,
          438 + cardIndex * 220,
          top + 208,
          206,
          94
        );
      });

      ctx.fillStyle = "#d6e4ec";
      ctx.font = "700 18px Aptos, sans-serif";
      ctx.fillText("Subjective", 1128, top + 216);
      IQ_SUBJECTIVE_FIELDS.forEach((field, fieldIndex) => {
        const x = 1128 + (fieldIndex % 2) * 214;
        const y = top + 236 + Math.floor(fieldIndex / 2) * 42;
        const score = subjectiveScores[field.key];
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(x, y, 196, 34);
        ctx.fillStyle = "#9fb6c7";
        ctx.font = "500 13px Aptos, sans-serif";
        ctx.fillText(field.label, x + 10, y + 21);
        ctx.fillStyle = "#ffd27f";
        ctx.font = "700 16px Aptos, sans-serif";
        ctx.fillText(isValidIqSubjectiveScore(score, field) ? String(score) : "-", x + 170, y + 21);
      });
    });
    return exportCanvas;
  }

  async function exportIqOutputs() {
    const researchStudyId = safeString(els.iqExportResearchIdInput?.value);
    const patientStudyId = safeString(els.iqExportPatientIdInput?.value);
    if (!researchStudyId || !patientStudyId) {
      throw new Error("Enter both research_study_ID and patient_study_ID before export.");
    }
    state.iq.exportResearchStudyId = researchStudyId;
    state.iq.exportPatientStudyId = patientStudyId;

    const shouldExportMetadata = els.iqExportMetadataInput?.checked !== false;
    const shouldExportObjective = els.iqExportObjectiveInput?.checked !== false;
    const shouldExportSubjective = els.iqExportSubjectiveInput?.checked !== false;
    const shouldExportSummaryPng = Boolean(els.iqExportSummaryPngInput?.checked);

    if (!shouldExportMetadata && !shouldExportObjective && !shouldExportSubjective && !shouldExportSummaryPng) {
      throw new Error("Select at least one export item.");
    }
    syncActiveStudyFormulaMetricDraftToState();
    if (!confirmIqExportReadinessOrAbort()) {
      setStatus("Export cancelled so missing IQ measurements can be completed.", "warning");
      return false;
    }

    const workbookSheets = [];
    if (shouldExportMetadata) {
      workbookSheets.push({
        name: "Metadata",
        rows: buildIqMetadataSheetRows(researchStudyId, patientStudyId),
      });
    }
    if (shouldExportObjective) {
      workbookSheets.push({
        name: "objective",
        rows: buildIqObjectiveSheetRows(researchStudyId, patientStudyId),
      });
    }
    if (shouldExportSubjective) {
      workbookSheets.push({
        name: "subjective",
        rows: buildIqSubjectiveSheetRows(researchStudyId, patientStudyId),
      });
    }

    const exportFiles = [];
    if (workbookSheets.length) {
      exportFiles.push({
        filename: `${buildIqExportBaseName(patientStudyId, "iq_results")}.xls`,
        blob: new Blob([buildSpreadsheetWorkbookXml(workbookSheets)], { type: "application/vnd.ms-excel;charset=utf-8" }),
      });
    }
    if (shouldExportSummaryPng) {
      exportFiles.push({
        filename: `${buildIqExportBaseName(patientStudyId, "summary_sheet")}.png`,
        blob: await canvasToPngBlob(buildIqSummaryCanvas(researchStudyId, patientStudyId)),
      });
    }
    await downloadExportBundle(exportFiles, `${buildIqExportBaseName(patientStudyId, "iq_export")}.zip`, {
      patientStudyId,
    });

    const exportedParts = [
      workbookSheets.length ? "Excel workbook" : "",
      shouldExportSummaryPng ? "summary PNG" : "",
    ].filter(Boolean).join(" and ");
    setStatus(`Exported ZIP bundle with ${exportedParts || "selected outputs"} for ${patientStudyId}.`);
    return true;
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
    els.baselineExportModal.scrollTo?.({ top: 0 });
    els.baselineExportModal.querySelector(".modal-option-list")?.scrollTo?.({ top: 0 });
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
    els.measurementExportModal.scrollTo?.({ top: 0 });
    els.measurementExportModal.querySelector(".modal-option-list")?.scrollTo?.({ top: 0 });
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

  function buildMeasurementsTable(entries, studyId) {
    const researchStudy = getSelectedExportStudyMetadata();
    const headers = [
      "study_id",
      "research_study_id",
      "research_study_label",
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

    const rows = entries.map((entry) => ({
      study_id: studyId || "",
      research_study_id: researchStudy.id || "",
      research_study_label: researchStudy.label || "",
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
      profile_adjustment_mode: entry.summary.profileAdjustmentMode || "",
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
      edge_left_kurtosis: entry.summary.edgeLeftKurtosis != null ? entry.summary.edgeLeftKurtosis.toFixed(4) : "",
      edge_right_rise_10_90_mm: entry.summary.edgeRightRise10To90Mm != null ? entry.summary.edgeRightRise10To90Mm.toFixed(3) : "",
      edge_right_slope_hu_per_mm: entry.summary.edgeRightSlopeHuPerMm != null ? entry.summary.edgeRightSlopeHuPerMm.toFixed(3) : "",
      edge_right_kurtosis: entry.summary.edgeRightKurtosis != null ? entry.summary.edgeRightKurtosis.toFixed(4) : "",
      edge1_fwhm_mm: entry.summary.edge1FwhmMm != null ? entry.summary.edge1FwhmMm.toFixed(3) : "",
      edge1_rise_10_90_mm: entry.summary.edge1Rise10To90Mm != null ? entry.summary.edge1Rise10To90Mm.toFixed(3) : "",
      edge1_slope_hu_per_mm: entry.summary.edge1SlopeHuPerMm != null ? entry.summary.edge1SlopeHuPerMm.toFixed(3) : "",
      edge1_kurtosis: entry.summary.edge1Kurtosis != null ? entry.summary.edge1Kurtosis.toFixed(4) : "",
      edge2_fwhm_mm: entry.summary.edge2FwhmMm != null ? entry.summary.edge2FwhmMm.toFixed(3) : "",
      edge2_rise_10_90_mm: entry.summary.edge2Rise10To90Mm != null ? entry.summary.edge2Rise10To90Mm.toFixed(3) : "",
      edge2_slope_hu_per_mm: entry.summary.edge2SlopeHuPerMm != null ? entry.summary.edge2SlopeHuPerMm.toFixed(3) : "",
      edge2_kurtosis: entry.summary.edge2Kurtosis != null ? entry.summary.edge2Kurtosis.toFixed(4) : "",
      lower_slope_edge: entry.summary.lowerSlopeEdgeLabel || "",
      lower_slope_fwhm_mm: entry.summary.lowerSlopeFwhmMm != null ? entry.summary.lowerSlopeFwhmMm.toFixed(3) : "",
      lower_slope_rise_10_90_mm: entry.summary.lowerSlopeRise10To90Mm != null ? entry.summary.lowerSlopeRise10To90Mm.toFixed(3) : "",
      lower_slope_hu_per_mm: entry.summary.lowerSlopeHuPerMm != null ? entry.summary.lowerSlopeHuPerMm.toFixed(3) : "",
      lower_slope_kurtosis: entry.summary.lowerSlopeKurtosis != null ? entry.summary.lowerSlopeKurtosis.toFixed(4) : "",
    }));

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
    const stent = analysis?.stent || null;
    const leftEdge = stent?.leftOuterEdge || null;
    const rightEdge = stent?.rightOuterEdge || null;
    const lowerEdge = stent?.lowerSteepEdge || null;
    const meanKurtosis = averageFinite([leftEdge?.kurtosis, rightEdge?.kurtosis]);
    return [
      `Mode: ${stent?.adjustmentMode || "-"}`,
      `Peaks/Lumen: ${formatMetricValue(stent?.leftPeak?.peakHu, "HU", 0)} / ${formatMetricValue(stent?.rightPeak?.peakHu, "HU", 0)} / ${formatMetricValue(stent?.lumenBaseHu, "HU", 0)}`,
      `Stent FWHM: L ${formatMetricValue(stent?.leftPeak?.fwhmMm, "mm", 2)} | R ${formatMetricValue(stent?.rightPeak?.fwhmMm, "mm", 2)} | Mean ${formatMetricValue(stent?.stentFwhmMeanMm, "mm", 2)}`,
      `Lumen FWHM: ${formatMetricValue(stent?.lumenFwhmMm, "mm", 2)}`,
      `Left 10-90: ${formatMetricValue(leftEdge?.riseDistanceMm, "mm", 2)} | ${formatMetricValue(leftEdge?.slopeHuPerMm, "HU/mm", 1)}`,
      `Right 10-90: ${formatMetricValue(rightEdge?.riseDistanceMm, "mm", 2)} | ${formatMetricValue(rightEdge?.slopeHuPerMm, "HU/mm", 1)}`,
      `Lower steep: ${lowerEdge?.label || "-"} | ${formatMetricValue(lowerEdge?.riseDistanceMm, "mm", 2)} | ${formatMetricValue(lowerEdge?.slopeHuPerMm, "HU/mm", 1)}`,
      `Kurtosis: L ${formatMetricValue(leftEdge?.kurtosis, "", 2)} | R ${formatMetricValue(rightEdge?.kurtosis, "", 2)} | Mean ${formatMetricValue(meanKurtosis, "", 2)}`,
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

  function copyLatestRoi() {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      throw new Error("Load a reconstruction first.");
    }

    const frame = state.viewports[state.activeViewportId]?.lastFrame || getViewportFrame(state.activeViewportId, reconstruction);
    const selected = getSelectedAnnotation();
    const visibleRois = reconstruction.annotations
      .filter((annotation) => isRoiAnnotationType(annotation.type))
      .filter((annotation) => isAnnotationVisible(annotation, frame));
    const roi =
      (selected && isRoiAnnotationType(selected.type) ? selected : null) ||
      visibleRois[visibleRois.length - 1] ||
      reconstruction.annotations.filter((item) => isRoiAnnotationType(item.type)).slice(-1)[0];

    if (!roi) {
      throw new Error("Draw an ROI first.");
    }

    const pointsMm = roi.worldPoints.length
      ? roi.worldPoints.map((worldPoint) => {
          const coordinates = worldToPlaneCoordinates(roi.frame, worldPoint);
          return { xMm: coordinates.xMm, yMm: coordinates.yMm };
        })
      : roi.type === "brushRoi" && roi.mask
        ? (() => {
            const centroid = getBrushMaskCentroid(roi);
            return [{ xMm: centroid.xMm, yMm: centroid.yMm }];
          })()
        : [];

    state.roiClipboard = {
      plane: frame.plane,
      pointsMm,
      annotation: cloneAnnotation(roi),
    };
    setStatus("ROI copied. Switch reconstruction and paste when ready.");
  }

  function pasteCopiedRoi() {
    const reconstruction = getActiveReconstruction();
    if (!reconstruction) {
      throw new Error("Load a reconstruction first.");
    }

    if (!state.roiClipboard?.pointsMm?.length && !state.roiClipboard?.annotation?.mask) {
      throw new Error("Copy an ROI first.");
    }

    const frame = state.viewports[state.activeViewportId]?.lastFrame || getViewportFrame(state.activeViewportId, reconstruction);
    const offsetXmm = 3;
    const offsetYmm = 3;
    const worldPoints = (state.roiClipboard.pointsMm || []).map((point) =>
      addVectors(
        addVectors(frame.centerWorld, scaleVector(frame.uWorld, point.xMm + offsetXmm)),
        scaleVector(frame.vWorld, point.yMm + offsetYmm)
      )
    );

    const sourceAnnotation = state.roiClipboard.annotation;
    const nextAnnotation = sourceAnnotation
      ? cloneAnnotation(sourceAnnotation)
      : {
          ...createAnnotationBase("freehandRoi", frame),
        };
    nextAnnotation.id = state.annotationSequence++;
    nextAnnotation.frame = cloneFrame(frame);
    nextAnnotation.plane = frame.plane;
    nextAnnotation.worldPoints = worldPoints;
    if (nextAnnotation.ellipse) {
      setCircularRoiGeometry(nextAnnotation, {
        centerXmm: nextAnnotation.ellipse.centerXmm + offsetXmm,
        centerYmm: nextAnnotation.ellipse.centerYmm + offsetYmm,
        radiusXmm: nextAnnotation.ellipse.radiusXmm,
        radiusYmm: nextAnnotation.ellipse.radiusYmm,
      });
    }
    if (nextAnnotation.mask) {
      nextAnnotation.mask = cloneBrushMask(nextAnnotation.mask);
      nextAnnotation.mask.originXmm += offsetXmm;
      nextAnnotation.mask.originYmm += offsetYmm;
    }

    addAnnotation(nextAnnotation);
    setStatus(`ROI pasted into ${reconstruction.label}.`);
  }

  function translateAnnotationInPlane(annotation, sourceAnnotation, deltaXmm, deltaYmm) {
    if (isCircularRoiAnnotation(sourceAnnotation)) {
      const sourceGeometry = getCircularRoiGeometry(sourceAnnotation);
      if (!sourceGeometry) {
        return;
      }
      setCircularRoiGeometry(annotation, {
        centerXmm: sourceGeometry.centerXmm + deltaXmm,
        centerYmm: sourceGeometry.centerYmm + deltaYmm,
        radiusXmm: sourceGeometry.radiusXmm,
        radiusYmm: sourceGeometry.radiusYmm,
      });
      return;
    }
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
    syncActiveIqTargetToWorkflow(reconstruction, { force: true });
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
    requestProjectSessionAutosave();
    setStatus(`Copied ${sourceMeasurements.length} measurement${sourceMeasurements.length === 1 ? "" : "s"} from ${sourceReconstruction.label} to ${updatedCount} other reconstruction${updatedCount === 1 ? "" : "s"}. Exports stay labeled per reconstruction.`);
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
    reconstruction.annotations = [];
    state.selectedAnnotationId = null;
    state.selectedProfileAnnotationId = null;
    syncActiveIqTargetToWorkflow(reconstruction, { force: true });
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
    state.iq.contourCorrectionDraft = null;
    state.roiClipboard = null;
    state.selectedAnnotationId = null;
    state.selectedProfileAnnotationId = null;
    state.iq.activeTargetId = getDefaultIqTargetDefinition().id;
    state.iq.subjectiveScoresByRecon = {};
    state.iq.subjectiveActiveFieldKey = getDefaultIqSubjectiveFieldDefinition().key;
    state.iq.subjectiveRevealReconLabel = false;
    state.annotationSequence = 1;
    state.mpr.centerWorld = null;
    state.mpr.overlayVisible = true;
    state.mpr.rotations = {
      axial: 0,
      coronal: 0,
      sagittal: 0,
    };
    state.maximizedViewportId = null;
    state.currentVOI = { ...VOI_PRESETS.coronary };
    state.currentPreset = "coronary";
    state.projectSession.pending = false;
    state.projectSession.saving = false;
    resetHistory();
    setActiveViewport("presentation");
    resetViewportTransforms();
    updateEmptyState();
    updateSidebarUi();
    requestRenderAll();
    setStatus("Ready for a coronary CTA stack");
  }

  function parseDicomHeader(file) {
    return file.arrayBuffer().then((buffer) => {
      const byteArray = new Uint8Array(buffer);
      const dataSet = dicomParser.parseDicom(byteArray, { untilTag: "x7fe00010" });
      const imageOrientationPatient = parseNumericArray(dataSet.string("x00200037"));
      const pixelDataElement = dataSet.elements.x7fe00010 || dataSet.elements.x7fe00008;
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
        seriesNumber: parseFirstNumber(dataSet.string("x00200011")),
        acquisitionNumber: parseFirstNumber(dataSet.string("x00200012")),
        frameOfReferenceUID: safeString(dataSet.string("x00200052")),
        instanceNumber: parseFirstNumber(dataSet.string("x00200013")),
        imageType: safeString(dataSet.string("x00080008")),
        numberOfFrames: parseFirstNumber(dataSet.string("x00280008")),
        rows: parseFirstNumber(dataSet.string("x00280010")),
        columns: parseFirstNumber(dataSet.string("x00280011")),
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
    resetHistory();
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
      state.sourceRecords = [];
      state.referenceBasis = null;
      state.annotationSequence = 1;
      state.roiClipboard = null;
      state.selectedAnnotationId = null;
      state.selectedProfileAnnotationId = null;
      state.iq.subjectiveScoresByRecon = {};
      state.iq.subjectiveActiveFieldKey = getDefaultIqSubjectiveFieldDefinition().key;
      state.iq.subjectiveRevealReconLabel = false;
    }

    state.reconstructions.push(...nextReconstructions);
    nextReconstructions.forEach((reconstruction) => {
      state.iq.subjectiveScoresByRecon[reconstruction.id] = createEmptyIqSubjectiveScoreMap();
    });
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
      setStatus(`Added ${nextReconstructions.length} reconstruction${nextReconstructions.length === 1 ? "" : "s"}.`);
    } else {
      setActiveReconstruction(state.reconstructions[0].id);
      state.currentVOI = determineInitialVoi(state.reconstructions[0].records);
      state.currentPreset = null;
      updateSidebarUi();
      setStatus(`Loaded ${state.reconstructions.length} reconstruction${state.reconstructions.length === 1 ? "" : "s"} for this patient.`);
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

    updateEmptyState();
    requestRenderAll();
  }

  function pointsAreNear(left, right, toleranceMm) {
    return vectorLength(subtractVectors(left, right)) <= toleranceMm;
  }

  function finalizePolygonDraft(viewportId, worldPoint, options) {
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
        iqSourceTool: sourceTool,
        worldPoints: points,
      });
      if (options?.advanceWorkflow) {
        const addedAnnotation = getSelectedAnnotation();
        if (isIqRoiAnnotation(addedAnnotation)) {
          advanceIqMeasurementWorkflow({ completedTargetId: addedAnnotation.iqTargetId });
        }
      }
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
        updateEraserPreview(viewportId, event.clientX, event.clientY);
        requestRenderViewports(getViewportIdsForPlane(getViewportPlane(viewportId)), { readouts: false });
      }
      if (state.activeToolKey === "edit" && !state.dragging) {
        const viewportId = event.currentTarget.dataset.viewportId;
        const viewportState = state.viewports[viewportId];
        const hit = getAnnotationHit(viewportId, event.clientX, event.clientY);
        viewportState.canvas.style.cursor =
          hit?.mode === "move" || hit?.mode === "labelMove"
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
      if (isIqRoiAnnotation(annotation)) {
        event.preventDefault();
        setSelectedAnnotation(annotation.id);
        advanceIqMeasurementWorkflow({ completedTargetId: annotation.iqTargetId });
        return;
      }
    }

    const hit = getAnnotationHit(viewportId, event.clientX, event.clientY);
    if (isIqRoiAnnotation(hit?.annotation) && !state.polygonDraft) {
      event.preventDefault();
      setSelectedAnnotation(hit.annotation.id);
      advanceIqMeasurementWorkflow({ completedTargetId: hit.annotation.iqTargetId });
      return;
    }

    if (state.activeToolKey !== "segmentationRoi" || !state.polygonDraft) {
      if (toggleViewportFocus(viewportId)) {
        event.preventDefault();
      }
      return;
    }

    event.preventDefault();
    const worldPoint = canvasToWorldPoint(viewportId, event.clientX, event.clientY);
    finalizePolygonDraft(viewportId, worldPoint, { advanceWorkflow: true });
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
      cornerIndex: hit.cornerIndex,
      historyCaptured: false,
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
        if (isCircularRoiAnnotation(hit.annotation)) {
          setSelectedAnnotation(hit.annotation.id);
          setActiveTool("edit");
          setStatus("ROI Circle ready for editing. Drag the single handle to resize it, or press A to adjust part of the contour.");
        } else {
          startAnnotationEditDrag(viewportId, viewportState, event, hit);
        }
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
        state.activeToolKey === "squareProfile") &&
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
          iqTargetId: state.iq.activeTargetId,
          iqSourceTool: "circularRoi",
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
      state.iq.contourCorrectionDraft = {
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
      requestRenderViewports(getViewportIdsForPlane(frame.plane), { readouts: false });
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
      state.dragging.maxPointerDistancePx = Math.max(
        state.dragging.maxPointerDistancePx || 0,
        Math.hypot(event.clientX - state.dragging.startClientX, event.clientY - state.dragging.startClientY)
      );
      const radiusMm = Math.max(
        getMinimumCircularRoiRadiusMm(state.dragging.frame),
        Math.hypot(
          planePoint.xMm - state.dragging.centerPlanePoint.xMm,
          planePoint.yMm - state.dragging.centerPlanePoint.yMm
        )
      );
      state.dragging.annotation.ellipse = {
        centerXmm: state.dragging.centerPlanePoint.xMm,
        centerYmm: state.dragging.centerPlanePoint.yMm,
        radiusXmm: radiusMm,
        radiusYmm: radiusMm,
      };
      state.dragging.annotation.worldPoints = createEllipseWorldPoints(
        state.dragging.frame,
        state.dragging.centerPlanePoint,
        radiusMm,
        radiusMm,
        CIRCULAR_ROI_SEGMENTS
      );
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
      const draft = state.iq.contourCorrectionDraft;
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
      if (!annotation || !chartState?.profile?.stent || annotation.id !== state.dragging.annotationId) {
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

    if (state.dragging.type === "annotation") {
      const worldPoint = canvasToWorldPoint(state.dragging.viewportId, event.clientX, event.clientY);
      if (!worldPoint) {
        return;
      }

      state.dragging.annotation.worldPoints[1] = worldPoint;
      requestRenderViewports(getViewportIdsForPlane(state.dragging.annotation.plane), { readouts: false });
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

      if (state.dragging.mode === "move") {
        const deltaXmm = planePoint.xMm - state.dragging.startPlanePoint.xMm;
        const deltaYmm = planePoint.yMm - state.dragging.startPlanePoint.yMm;
        translateAnnotationInPlane(annotation, state.dragging.sourceAnnotation, deltaXmm, deltaYmm);
      } else if (state.dragging.mode === "labelMove") {
        const deltaXmm = planePoint.xMm - state.dragging.startPlanePoint.xMm;
        const deltaYmm = planePoint.yMm - state.dragging.startPlanePoint.yMm;
        const sourceOffsets = getAnnotationLabelOffsetsMm(state.dragging.sourceAnnotation);
        annotation.labelOffsetXmm = sourceOffsets.xMm + deltaXmm;
        annotation.labelOffsetYmm = sourceOffsets.yMm + deltaYmm;
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
        if (isIqRoiAnnotation(dragging.annotation)) {
          advanceIqMeasurementWorkflow({ completedTargetId: dragging.annotation.iqTargetId });
        }
      }
    } else if (dragging.type === "freehandRoi") {
      finalizePolygonDraft(dragging.viewportId, null, { advanceWorkflow: true });
    } else if (dragging.type === "contourCorrect") {
      const annotation = getSelectedAnnotation();
      const draft = state.iq.contourCorrectionDraft;
      if (annotation && draft && annotation.id === dragging.annotationId) {
        captureUndoSnapshot();
        const applied = applyContourCorrection(annotation, draft.planePoints);
        if (applied) {
          setStatus("ROI contour corrected.");
        }
      }
      state.iq.contourCorrectionDraft = null;
      renderIqObjectiveOutputs();
    } else if (dragging.type === "brushRoiPaint") {
      const reconstruction = getActiveReconstruction();
      const annotation = getSelectedAnnotation();
      if (reconstruction && annotation?.id === dragging.annotationId && countBrushMaskCells(annotation.mask) <= 0) {
        reconstruction.annotations = reconstruction.annotations.filter((item) => item.id !== annotation.id);
        state.selectedAnnotationId = null;
      } else if (dragging.isNew && isIqRoiAnnotation(annotation)) {
        advanceIqMeasurementWorkflow({ completedTargetId: annotation.iqTargetId });
      }
      updateSidebarUi();
    } else if (dragging.type === "editAnnotation") {
      const annotation = getSelectedAnnotation();
      if (annotation && annotation.id === dragging.annotationId && !isValidDragAnnotation(annotation)) {
        Object.assign(annotation, cloneAnnotation(dragging.sourceAnnotation));
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
      zoomViewportAtClientPoint(viewportId, event.clientX, event.clientY, event.deltaY);
      return;
    }
    if (isDrawingInteractionActive(viewportId)) {
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
    els.uiModeButtons.forEach((button) => {
      button.addEventListener("click", () => setUiMode(button.dataset.uiMode));
    });
    els.sidebar?.addEventListener("click", handleSidebarNavigationClick, true);
    els.sidebarTabButtons.forEach((button) => {
      button.addEventListener("click", () => setActiveSidebarTab(button.dataset.sidebarTabButton));
    });
    els.iqJumpButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setActiveSidebarTab(button.dataset.iqJumpTab);
      });
    });
    els.iqTargetSelect?.addEventListener("change", () => {
      setActiveIqTarget(els.iqTargetSelect.value);
    });
    els.iqObjectiveModelSelect?.addEventListener("change", () => {
      const nextModelId = els.iqObjectiveModelSelect.value;
      if (!confirmObjectiveModelChange(nextModelId)) {
        els.iqObjectiveModelSelect.value = IQ_OBJECTIVE_MODEL_ID;
        return;
      }
      applyObjectiveModelPreset(nextModelId, {
        statusMessage: `Objective preset switched to ${getObjectiveModelDefinition(nextModelId).shortLabel}.`,
      });
    });
    els.iqTargetDefineSelect?.addEventListener("change", () => {
      setActiveIqTarget(els.iqTargetDefineSelect.value, { keepSelection: true });
    });
    els.iqTargetCategorySelect?.addEventListener("change", () => {
      const style = IQ_TARGET_CATEGORY_STYLES[normalizeIqTargetCategory(els.iqTargetCategorySelect.value)];
      if (els.iqTargetColorInput) {
        els.iqTargetColorInput.value = style.stroke;
      }
    });
    els.iqTargetSaveButton?.addEventListener("click", saveActiveIqTargetDefinition);
    els.iqTargetAddButton?.addEventListener("click", addIqTargetDefinition);
    els.iqTargetDeleteButton?.addEventListener("click", deleteActiveIqTargetDefinition);
    els.iqTargetList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-target-id]");
      if (!button) {
        return;
      }
      const targetId = button.dataset.targetId;
      if (!focusIqTargetAnnotation(targetId)) {
        setActiveIqTarget(targetId);
      }
    });
    els.iqTargetDefineList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-target-id]");
      if (!button) {
        return;
      }
      setActiveIqTarget(button.dataset.targetId, { keepSelection: true });
    });
    els.iqSubjectiveFieldSelect?.addEventListener("change", () => {
      state.iq.subjectiveActiveFieldKey = getIqSubjectiveFieldDefinition(els.iqSubjectiveFieldSelect.value).key;
      renderIqSubjectiveProtocolEditor({ force: true });
      renderIqSubjectiveCards();
    });
    els.iqSubjectiveScaleSelect?.addEventListener("change", () => {
      const activeField = getIqSubjectiveFieldDefinition(state.iq.subjectiveActiveFieldKey);
      const nextScale = resolveIqSubjectiveScaleSelectValue(els.iqSubjectiveScaleSelect, activeField.scale || IQ_SUBJECTIVE_SCALE);
      if (!nextScale) {
        return;
      }
      saveActiveIqSubjectiveFieldDefinition({
        statusMessage: `Subjective scoring scale set to ${getIqSubjectiveScaleLabel(nextScale)}.`,
      });
    });
    els.iqSubjectiveSaveButton?.addEventListener("click", saveActiveIqSubjectiveFieldDefinition);
    els.iqSubjectiveAddButton?.addEventListener("click", addIqSubjectiveFieldDefinition);
    els.iqSubjectiveDeleteButton?.addEventListener("click", deleteActiveIqSubjectiveFieldDefinition);
    els.iqSubjectiveCardList?.addEventListener("click", (event) => {
      const optionButton = event.target.closest("[data-score]");
      if (optionButton) {
        event.preventDefault();
        setSubjectiveScore(optionButton.dataset.fieldKey, Number(optionButton.dataset.score));
        return;
      }
      const card = event.target.closest("[data-field-key]");
      if (card) {
        setActiveSubjectiveField(card.dataset.fieldKey);
      }
    });
    els.iqSubjectiveCardList?.addEventListener("dblclick", (event) => {
      const optionButton = event.target.closest("[data-score]");
      if (!optionButton) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      renameIqSubjectiveScoreLabel(optionButton.dataset.score, optionButton.dataset.fieldKey);
    });
    els.iqSubjectiveDescriptionEditor?.addEventListener("dblclick", (event) => {
      const label = event.target.closest("[data-subjective-score-label]");
      if (!label) {
        return;
      }
      event.preventDefault();
      renameIqSubjectiveScoreLabel(label.dataset.subjectiveScoreLabel);
    });
    els.iqSubjectivePrevButton?.addEventListener("click", () => {
      navigateReconstructionByOffset(-1, { hideSpecificLabel: !state.iq.subjectiveRevealReconLabel });
    });
    els.iqSubjectiveNextButton?.addEventListener("click", () => {
      navigateReconstructionByOffset(1, { hideSpecificLabel: !state.iq.subjectiveRevealReconLabel });
    });
    els.iqSubjectiveToggleLabelButton?.addEventListener("click", toggleSubjectiveReconLabelVisibility);
    els.iqResetProtocolsButton?.addEventListener("click", resetIqProtocolsToDefaultsWithConfirmation);
    els.studyRulesSavedSelect?.addEventListener("change", () => loadSelectedStudyRules(els.studyRulesSavedSelect.value));
    els.studyRulesSaveButton?.addEventListener("click", () => saveCurrentStudyRules({ asNew: false }));
    els.studyRulesSaveNewButton?.addEventListener("click", () => saveCurrentStudyRules({ asNew: true }));
    els.studyRulesDeleteButton?.addEventListener("click", deleteActiveStudyRules);
    els.studyRulesWorkspace?.addEventListener("click", (event) => {
      const toggleButton = event.target.closest("[data-study-rules-panel-toggle]");
      if (!toggleButton) {
        return;
      }
      const panel = toggleButton.closest(".study-rules-panel");
      if (!panel) {
        return;
      }
      const isCollapsed = panel.classList.toggle("is-collapsed");
      toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
      toggleButton.textContent = isCollapsed ? "Show" : "Hide";
    });
    els.studyObjectiveModelSelect?.addEventListener("change", () => {
      const nextModelId = els.studyObjectiveModelSelect.value;
      if (!confirmObjectiveModelChange(nextModelId)) {
        els.studyObjectiveModelSelect.value = IQ_OBJECTIVE_MODEL_ID;
        return;
      }
      IQ_ACTIVE_STUDY_RULE_SET_ID = "";
      applyObjectiveModelPreset(nextModelId, {
        statusMessage: `Objective preset switched to ${getObjectiveModelDefinition(nextModelId).shortLabel}.`,
      });
      renderStudyRulesWorkspace({ force: true });
    });
    els.studyObjectiveApplyPresetButton?.addEventListener("click", () => {
      const modelId = els.studyObjectiveModelSelect?.value || IQ_OBJECTIVE_MODEL_ID;
      if (!confirmObjectiveModelChange(modelId) && modelId !== IQ_OBJECTIVE_MODEL_ID) {
        return;
      }
      IQ_ACTIVE_STUDY_RULE_SET_ID = "";
      applyObjectiveModelPreset(modelId, {
        statusMessage: `Reloaded ${getObjectiveModelDefinition(modelId).shortLabel} objective defaults.`,
      });
      renderStudyRulesWorkspace({ force: true });
    });
    els.studyObjectiveAddTargetButton?.addEventListener("click", addStudyObjectiveTarget);
    els.studyObjectiveTargetTableBody?.addEventListener("change", (event) => {
      const removeButton = event.target.closest("[data-study-target-remove]");
      if (removeButton) {
        return;
      }
      const row = event.target.closest("[data-study-target-id]");
      if (row) {
        if (event.target.matches("[data-study-target-stat-enabled]")) {
          const statKey = event.target.dataset.studyTargetStatEnabled;
          row.querySelectorAll(`[data-study-target-stat-role="${CSS.escape(statKey)}"], [data-study-target-stat-label="${CSS.escape(statKey)}"]`)
            .forEach((control) => {
              control.disabled = !event.target.checked;
            });
        } else if (event.target.matches("[data-study-target-stat-role]")) {
          const statKey = event.target.dataset.studyTargetStatRole;
          const labelInput = row.querySelector(`[data-study-target-stat-label="${CSS.escape(statKey)}"]`);
          labelInput?.classList.toggle("is-hidden", event.target.value !== "other");
        }
        IQ_ACTIVE_STUDY_RULE_SET_ID = "";
        updateStudyObjectiveTargetFromRow(row);
      }
    });
    els.studyObjectiveTargetTableBody?.addEventListener("click", (event) => {
      const colorToggle = event.target.closest("[data-study-target-color-toggle]");
      if (colorToggle) {
        const picker = colorToggle.closest("[data-study-color-picker]");
        const shouldOpen = !picker?.classList.contains("is-open");
        closeStudyColorPickers(picker);
        setStudyColorPickerOpen(picker, shouldOpen);
        return;
      }
      const colorButton = event.target.closest("[data-study-target-color]");
      if (colorButton) {
        const row = colorButton.closest("[data-study-target-id]");
        if (!row) {
          return;
        }
        setStudyObjectiveRowColor(row, colorButton.dataset.studyTargetColor);
        setStudyColorPickerOpen(colorButton.closest("[data-study-color-picker]"), false);
        IQ_ACTIVE_STUDY_RULE_SET_ID = "";
        updateStudyObjectiveTargetFromRow(row);
        return;
      }
      if (!event.target.closest("[data-study-color-picker]")) {
        closeStudyColorPickers();
      }
      const removeButton = event.target.closest("[data-study-target-remove]");
      if (!removeButton) {
        return;
      }
      IQ_ACTIVE_STUDY_RULE_SET_ID = "";
      removeStudyObjectiveTarget(removeButton.dataset.studyTargetRemove);
    });
    els.studyObjectiveTargetTableBody?.addEventListener("dragstart", handleStudyObjectiveTargetDragStart);
    els.studyObjectiveTargetTableBody?.addEventListener("dragover", handleStudyObjectiveTargetDragOver);
    els.studyObjectiveTargetTableBody?.addEventListener("drop", handleStudyObjectiveTargetDrop);
    els.studyObjectiveTargetTableBody?.addEventListener("dragend", handleStudyObjectiveTargetDragEnd);
    [
      els.studyMetricSignalEnabled,
      els.studyMetricBackgroundEnabled,
      els.studyMetricNoiseEnabled,
      els.studyMetricSnrEnabled,
      els.studyMetricCnrEnabled,
      els.studyMetricTotalEnabled,
      els.studyMetricVesselEnabled,
      els.studyMetricProximalEnabled,
      els.studyMetricDistalEnabled,
      els.studyMetricCustomGroupEnabled,
      els.studyMetricBackgroundSource,
      els.studyMetricNoiseSource,
    ].filter(Boolean).forEach((control) => {
      control.addEventListener("change", () => {
        IQ_ACTIVE_STUDY_RULE_SET_ID = "";
        readStudyMetricRulesFromControls();
      });
    });
    els.studyFormulaMetricList?.addEventListener("click", (event) => {
      const deleteButton = event.target.closest("[data-study-formula-delete]");
      if (deleteButton) {
        event.preventDefault();
        event.stopPropagation();
        IQ_ACTIVE_STUDY_RULE_SET_ID = "";
        deleteStudyFormulaMetric(deleteButton.dataset.studyFormulaDelete);
        return;
      }
      const metricButton = event.target.closest("[data-study-formula-metric-id]");
      if (!metricButton) {
        return;
      }
      IQ_ACTIVE_FORMULA_METRIC_ID = metricButton.dataset.studyFormulaMetricId;
      renderStudyFormulaMetricComposer();
    });
    els.studyFormulaMetricList?.addEventListener("dblclick", (event) => {
      if (event.target.closest("[data-study-formula-delete]")) {
        return;
      }
      const metricButton = event.target.closest("[data-study-formula-metric-id]");
      if (!metricButton) {
        return;
      }
      IQ_ACTIVE_FORMULA_METRIC_ID = metricButton.dataset.studyFormulaMetricId;
      renderStudyFormulaMetricComposer();
      promptRenameActiveStudyFormulaMetric();
    });
    els.studyFormulaMetricList?.addEventListener("keydown", (event) => {
      if (event.target.closest("[data-study-formula-delete]")) {
        return;
      }
      if (!["Enter", " "].includes(event.key)) {
        return;
      }
      const metricButton = event.target.closest("[data-study-formula-metric-id]");
      if (!metricButton) {
        return;
      }
      event.preventDefault();
      IQ_ACTIVE_FORMULA_METRIC_ID = metricButton.dataset.studyFormulaMetricId;
      renderStudyFormulaMetricComposer();
    });
    els.studyFormulaMetricList?.addEventListener("dragstart", handleStudyFormulaMetricDragStart);
    els.studyFormulaMetricList?.addEventListener("dragover", handleStudyFormulaMetricDragOver);
    els.studyFormulaMetricList?.addEventListener("drop", handleStudyFormulaMetricDrop);
    els.studyFormulaMetricList?.addEventListener("dragend", handleStudyFormulaMetricDragEnd);
    els.studyFormulaTokenPalette?.addEventListener("click", (event) => {
      const tokenButton = event.target.closest("[data-study-formula-token]");
      if (!tokenButton) {
        return;
      }
      insertTextIntoFormulaInput(tokenButton.dataset.studyFormulaToken);
    });
    els.studyFormulaTokenPalette?.addEventListener("dragstart", (event) => {
      const tokenButton = event.target.closest("[data-study-formula-token]");
      if (!tokenButton) {
        return;
      }
      event.dataTransfer?.setData("text/plain", tokenButton.dataset.studyFormulaToken || "");
    });
    els.studyFormulaMetricExpressionInput?.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
    els.studyFormulaMetricExpressionInput?.addEventListener("drop", (event) => {
      event.preventDefault();
      const token = event.dataTransfer?.getData("text/plain");
      if (token) {
        insertTextIntoFormulaInput(token);
      }
    });
    [els.studyFormulaMetricNameInput, els.studyFormulaMetricExpressionInput, els.studyFormulaMetricUnitInput]
      .filter(Boolean)
      .forEach((input) => {
        input.addEventListener("input", () => {
          IQ_ACTIVE_STUDY_RULE_SET_ID = "";
          syncActiveStudyFormulaMetricDraftToState();
          updateStudyFormulaMetricCardDraft();
          renderStudyFormulaMetricPreviewFromDraft();
        });
      });
    [els.studyFormulaMetricNameInput, els.studyFormulaMetricExpressionInput, els.studyFormulaMetricUnitInput]
      .filter(Boolean)
      .forEach((input) => {
        input.addEventListener("keydown", (event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            saveActiveStudyFormulaMetric();
          }
        });
      });
    els.studyFormulaMetricAddButton?.addEventListener("click", () => {
      IQ_ACTIVE_STUDY_RULE_SET_ID = "";
      addStudyFormulaMetric();
    });
    els.studyFormulaMetricSaveButton?.addEventListener("click", () => {
      IQ_ACTIVE_STUDY_RULE_SET_ID = "";
      saveActiveStudyFormulaMetric();
    });
    els.studyFormulaMetricDeleteButton?.addEventListener("click", () => {
      IQ_ACTIVE_STUDY_RULE_SET_ID = "";
      deleteActiveStudyFormulaMetric();
    });
    els.studySubjectiveScaleSelect?.addEventListener("change", () => {
      IQ_ACTIVE_STUDY_RULE_SET_ID = "";
      const nextScale = resolveIqSubjectiveScaleSelectValue(els.studySubjectiveScaleSelect, IQ_SUBJECTIVE_SCALE);
      if (!nextScale) {
        return;
      }
      setStudySubjectiveScale(nextScale);
    });
    els.studySubjectiveScoreLabels?.addEventListener("change", (event) => {
      const control = event.target.closest("[data-study-score-label]");
      if (control) {
        IQ_ACTIVE_STUDY_RULE_SET_ID = "";
        updateStudySubjectiveScoreLabel(control);
      }
    });
    els.studySubjectiveTableBody?.addEventListener("change", (event) => {
      const row = event.target.closest("[data-study-subjective-field-key]");
      if (!row) {
        return;
      }
      IQ_ACTIVE_STUDY_RULE_SET_ID = "";
      const templateSelect = event.target.closest("[data-study-subjective-template]");
      if (templateSelect && templateSelect.value) {
        applyStudySubjectiveTemplate(row, templateSelect.value);
        return;
      }
      const scaleSelect = event.target.closest('[data-study-subjective-field="scale"]');
      if (scaleSelect) {
        const fieldKey = safeString(row.dataset.studySubjectiveFieldKey);
        const currentField = IQ_SUBJECTIVE_FIELDS.find((field) => field.key === fieldKey);
        const nextScale = resolveIqSubjectiveScaleSelectValue(scaleSelect, currentField?.scale || IQ_SUBJECTIVE_SCALE);
        if (!nextScale) {
          return;
        }
      }
      updateStudySubjectiveFieldFromRow(row);
    });
    els.studySubjectiveTableBody?.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-study-subjective-remove]");
      if (!removeButton) {
        return;
      }
      IQ_ACTIVE_STUDY_RULE_SET_ID = "";
      removeStudySubjectiveCategory(removeButton.dataset.studySubjectiveRemove);
    });
    els.studySubjectiveTableBody?.addEventListener("dragstart", handleStudySubjectiveDragStart);
    els.studySubjectiveTableBody?.addEventListener("dragover", handleStudySubjectiveDragOver);
    els.studySubjectiveTableBody?.addEventListener("drop", handleStudySubjectiveDrop);
    els.studySubjectiveTableBody?.addEventListener("dragend", handleStudySubjectiveDragEnd);
    els.studySubjectiveAddCategoryButton?.addEventListener("click", () => {
      IQ_ACTIVE_STUDY_RULE_SET_ID = "";
      addStudySubjectiveCategory();
    });
    els.studySubjectiveResetButton?.addEventListener("click", () => {
      IQ_ACTIVE_STUDY_RULE_SET_ID = "";
      resetIqSubjectiveProtocolToDefaults();
      renderStudyRulesWorkspace({ force: true });
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
      resetPresentationViewportTransform();
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
        handleFocusWorkflowTab(button.dataset.focusWorkflowTab);
      });
    });
    els.focusIqExportButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        openIqExportModal();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "CCTA IQ export setup failed.", "error");
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
    [els.syncMeasurementsButton].forEach((button) => {
      button?.addEventListener("click", () => {
        try {
          syncMeasurementsToAllReconstructions();
        } catch (error) {
          console.error(error);
          setStatus(error.message || "Measurement sync failed.", "error");
        }
      });
    });
    els.annotationRenameButton?.addEventListener("click", () => {
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
    els.roiToolTrigger?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleRoiToolMenu();
    });
    els.roiToolMenu?.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (els.roiToolMenu && els.roiToolTrigger) {
        if (els.roiToolMenu.contains(target) || els.roiToolTrigger.contains(target)) {
          return;
        }
        closeRoiToolMenu();
      }
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
    els.toolTooltipTargets.forEach((button) => {
      const getToolKey = () => button.dataset.tool || button.dataset.toolGroupToggle;
      button.addEventListener("pointerenter", () => {
        scheduleToolHoverTooltip(button, getToolKey());
      });
      button.addEventListener("pointermove", () => {
        if (els.toolHoverTooltip && !els.toolHoverTooltip.classList.contains("is-hidden")) {
          hideToolHoverTooltip();
        }
        scheduleToolHoverTooltip(button, getToolKey());
      });
      button.addEventListener("pointerleave", hideToolHoverTooltip);
      button.addEventListener("pointerdown", hideToolHoverTooltip);
      button.addEventListener("blur", hideToolHoverTooltip);
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

    els.sliceSlider?.addEventListener("input", () => {
      setPlaneIndex("axial", Number(els.sliceSlider.value));
    });

    els.presentationFastScrollSlider?.addEventListener("input", () => {
      setPlaneIndex("axial", Number(els.presentationFastScrollSlider.value));
    });

    els.mprOverlayToggleButton?.addEventListener("click", () => {
      toggleMprOverlayVisibility();
    });

    els.cineSpeedSlider?.addEventListener("input", () => {
      state.cineFps = Number(els.cineSpeedSlider.value);
      if (els.cineSpeedReadout) {
        els.cineSpeedReadout.textContent = `${state.cineFps} fps`;
      }
      if (state.cineTimerId) {
        startCine();
      }
    });

    els.cineButton?.addEventListener("click", toggleCine);

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

    els.iqOpenExportButton?.addEventListener("click", () => {
      try {
        openIqExportModal();
      } catch (error) {
        console.error(error);
        setStatus(error.message || "CCTA IQ export setup failed.", "error");
      }
    });
    [
      els.iqExportCloseButton,
      els.iqExportCancelButton,
      ...Array.from(document.querySelectorAll("[data-iq-export-close]")),
    ].forEach((element) => {
      element?.addEventListener("click", closeIqExportModal);
    });
    els.iqExportReadinessWarningClose?.addEventListener("click", dismissIqExportReadinessWarning);
    els.iqExportConfirmButton?.addEventListener("click", async () => {
      try {
        const exported = await exportIqOutputs();
        if (exported !== false) {
          closeIqExportModal();
        }
      } catch (error) {
        console.error(error);
        setStatus(error.message || "CCTA IQ export failed.", "error");
      }
    });
    els.iqExportStudySelect?.addEventListener("change", () => {
      handleExportStudySelectionChange(els.iqExportStudySelect).catch((error) => {
        console.error(error);
        setStatus(error.message || "Could not change export study.", "error");
      });
    });
    els.iqExportStudyCreateButton?.addEventListener("click", () => {
      createExportStudyFromInput(els.iqExportStudyCreateInput).catch((error) => {
        console.error(error);
        setStatus(error.message || "Could not create export study.", "error");
      });
    });
    els.iqExportStudyCreateInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      createExportStudyFromInput(els.iqExportStudyCreateInput).catch((error) => {
        console.error(error);
        setStatus(error.message || "Could not create export study.", "error");
      });
    });
    [els.iqExportResearchIdInput, els.iqExportPatientIdInput].forEach((input) => {
      input?.addEventListener("keydown", async (event) => {
        if (event.key !== "Enter") {
          return;
        }
        event.preventDefault();
        try {
          await exportIqOutputs();
          closeIqExportModal();
        } catch (error) {
          console.error(error);
          setStatus(error.message || "CCTA IQ export failed.", "error");
        }
      });
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

        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          (
            (state.activeSidebarTab === "annotate" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) ||
            (state.activeSidebarTab === "subjective" && ["ArrowUp", "ArrowDown"].includes(event.key))
          )
        ) {
          return;
        }

        if (
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          (state.activeSidebarTab === "annotate" || state.activeSidebarTab === "subjective") &&
          ["ArrowLeft", "ArrowRight"].includes(event.key)
        ) {
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
          finishCurrentIqMeasurementStep(viewportId);
        }
      });
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
      if (event.key === "Escape" && els.iqExportModal && !els.iqExportModal.classList.contains("is-hidden")) {
        event.preventDefault();
        closeIqExportModal();
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
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
        return;
      }

      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        if (state.activeSidebarTab === "annotate" && event.key === "ArrowLeft") {
          event.preventDefault();
          navigateIqTargetByOffset(-1);
          return;
        }
        if (state.activeSidebarTab === "annotate" && event.key === "ArrowRight") {
          event.preventDefault();
          navigateIqTargetByOffset(1);
          return;
        }
        if ((state.activeSidebarTab === "annotate" || state.activeSidebarTab === "subjective") && event.key === "ArrowUp") {
          event.preventDefault();
          navigateReconstructionByOffset(-1);
          return;
        }
        if ((state.activeSidebarTab === "annotate" || state.activeSidebarTab === "subjective") && event.key === "ArrowDown") {
          event.preventDefault();
          navigateReconstructionByOffset(1);
          return;
        }
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        (state.activeSidebarTab === "annotate" || state.activeSidebarTab === "subjective") &&
        event.key === "ArrowLeft"
      ) {
        event.preventDefault();
        navigateReconstructionByOffset(-1, {
          hideSpecificLabel: state.activeSidebarTab === "subjective" && !state.iq.subjectiveRevealReconLabel,
        });
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        (state.activeSidebarTab === "annotate" || state.activeSidebarTab === "subjective") &&
        event.key === "ArrowRight"
      ) {
        event.preventDefault();
        navigateReconstructionByOffset(1, {
          hideSpecificLabel: state.activeSidebarTab === "subjective" && !state.iq.subjectiveRevealReconLabel,
        });
        return;
      }

      if (
        state.activeSidebarTab === "subjective" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        getIqSubjectiveScaleValues(getIqSubjectiveFieldDefinition(state.iq.subjectiveActiveFieldKey || getNextIncompleteSubjectiveFieldKey())).map(String).includes(event.key)
      ) {
        event.preventDefault();
        setSubjectiveScore(state.iq.subjectiveActiveFieldKey || getNextIncompleteSubjectiveFieldKey(), Number(event.key));
        return;
      }

      if (
        event.key === " " &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        finishCurrentIqMeasurementStep(state.activeViewportId)
      ) {
        event.preventDefault();
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
    refreshExportStudyOptions().catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not load export studies.", "error");
    });
    updateProjectWorkflowAvailability();
    loadSidebarSectionState();
    loadUiModePreference();
    loadSidebarTabPreference();
    loadShortcutSettings();
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
    if (els.cineSpeedReadout) {
      els.cineSpeedReadout.textContent = `${state.cineFps} fps`;
    }
    setStatus("Ready for a coronary CTA stack");
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
