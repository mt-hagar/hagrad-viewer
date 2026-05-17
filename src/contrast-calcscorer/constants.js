export const VIEW_PRESETS = {
  contrast: { width: 900, center: 260 },
  soft: { width: 400, center: 40 },
  calcium: { width: 1200, center: 500 },
  suppressed: { width: 450, center: 35 },
};

export const TOOLS = {
  tapLabel: "Assign / Draw",
  erase: "Erase",
};

export const LABELS = [
  { code: 1, key: "LAD", label: "LAD", coronary: true, color: [255, 126, 126, 150], stroke: "#ff7e7e" },
  { code: 2, key: "LCX", label: "LCx", coronary: true, color: [98, 214, 255, 150], stroke: "#62d6ff" },
  { code: 3, key: "RCA", label: "RCA", coronary: true, color: [247, 205, 126, 150], stroke: "#f7cd7e" },
  { code: 4, key: "LM", label: "LM", coronary: true, color: [132, 228, 171, 150], stroke: "#84e4ab" },
  { code: 5, key: "AORTIC_VALVE", label: "Aortic Valve", coronary: false, color: [220, 152, 255, 150], stroke: "#dc98ff" },
  { code: 6, key: "MITRAL_VALVE", label: "Mitral Valve", coronary: false, color: [255, 118, 208, 150], stroke: "#ff76d0" },
  { code: 7, key: "AORTIC_ROOT", label: "Aortic Root", coronary: false, color: [255, 166, 112, 150], stroke: "#ffa670" },
  { code: 8, key: "OTHER", label: "Other", coronary: false, color: [166, 184, 194, 148], stroke: "#a6b8c2" },
];

export const LABELS_BY_CODE = new Map(LABELS.map((entry) => [entry.code, entry]));

export const CORONARY_LABEL_CODES = LABELS.filter((entry) => entry.coronary).map((entry) => entry.code);

export const REFERENCE_DEFINITIONS = [
  {
    key: "aortic_root_contrast",
    label: "Aortic Root Contrast",
    shortLabel: "Aortic Root",
    required: true,
    swatch: "#ff8f6a",
    kind: "contrast",
    hint: "Central high-attenuation aortic root lumen sample.",
  },
  {
    key: "pulmonary_trunk_contrast",
    label: "Pulmonary Trunk Contrast",
    shortLabel: "Pulmonary Trunk",
    required: true,
    swatch: "#6ec7ff",
    kind: "contrast",
    hint: "Representative pulmonary artery lumen sample.",
  },
  {
    key: "lm_coronary_lumen",
    label: "LM Coronary Lumen",
    shortLabel: "LM Lumen",
    required: true,
    swatch: "#80f0b2",
    kind: "contrast",
    hint: "Small left main coronary lumen sample near the coronary origin.",
  },
  {
    key: "calcified_plaque_reference",
    label: "Calcified Plaque Reference",
    shortLabel: "Calcified Plaque",
    required: true,
    swatch: "#f8e08b",
    kind: "calcium",
    hint: "High-confidence dense calcified plaque sample on the CTA dataset.",
  },
  {
    key: "myocardium_background",
    label: "Myocardium / Soft Tissue Background",
    shortLabel: "Myocardium",
    required: false,
    swatch: "#ff7f9d",
    kind: "soft",
    hint: "Optional myocardium or soft tissue background sample.",
  },
  {
    key: "fat_background",
    label: "Fat / Low-Attenuation Background",
    shortLabel: "Fat",
    required: false,
    swatch: "#d8bf79",
    kind: "fat",
    hint: "Optional low-attenuation fat sample for wider background context.",
  },
  {
    key: "ascending_aorta_wall",
    label: "Ascending Aorta Wall",
    shortLabel: "Aorta Wall",
    required: false,
    swatch: "#ffbb86",
    kind: "soft",
    hint: "Optional vessel wall sample to distinguish lumen from soft tissue.",
  },
  {
    key: "blood_pool_generic",
    label: "Blood Pool Generic Reference",
    shortLabel: "Blood Pool",
    required: false,
    swatch: "#6ab8ff",
    kind: "contrast",
    hint: "Optional extra blood pool reference from another well-opacified lumen.",
  },
  {
    key: "noise_reference",
    label: "Noise Reference",
    shortLabel: "Noise",
    required: false,
    swatch: "#95a5b0",
    kind: "noise",
    hint: "Optional homogeneous region for image-noise estimation.",
  },
];

export const REFERENCES_BY_KEY = new Map(REFERENCE_DEFINITIONS.map((entry) => [entry.key, entry]));

export const WORKFLOW_STEPS = [
  {
    key: "series",
    number: 1,
    title: "Select Series",
    detail: "Choose the best post-contrast CTA or cardiac CT series.",
    sectionId: "series-section",
  },
  {
    key: "range",
    number: 2,
    title: "Set z-Range",
    detail: "Define the superior and inferior slab for research analysis.",
    sectionId: "range-section",
  },
  {
    key: "references",
    number: 3,
    title: "Pick References",
    detail: "Sample the required contrast and calcified plaque ROIs on the image.",
    sectionId: "references-section",
  },
  {
    key: "estimate",
    number: 4,
    title: "Estimate Calcium",
    detail: "Run the contrast-suppressed research candidate map.",
    sectionId: "estimate-section",
  },
  {
    key: "review",
    number: 5,
    title: "Review / Edit",
    detail: "Relabel, include, or erase lesions while preserving manual overrides.",
    sectionId: "editing-section",
  },
  {
    key: "export",
    number: 6,
    title: "Export / Finish",
    detail: "Export research metrics and a review PNG with method metadata.",
    sectionId: "results-section",
  },
];

export const COLORS = {
  text: "#eff7fb",
  muted: "#a9bcc8",
  selected: [255, 190, 108, 196],
  brush: "rgba(255, 190, 108, 0.92)",
  referenceOutline: "rgba(255, 255, 255, 0.18)",
  referenceFill: "rgba(255, 255, 255, 0.08)",
  warning: "#ffd07a",
};

export const RESEARCH_WARNING_LINES = [
  "Standard Agatston scoring is defined on dedicated noncontrast calcium-scoring CT.",
  "This post-contrast workflow is experimental and not clinically validated.",
  "On conventional single-energy CTA, calcium and iodine overlap and cannot be perfectly separated by simple thresholding.",
  "Conventional CTA outputs are reported as post-contrast research estimates, not true noncontrast-equivalent calcium scores.",
];
