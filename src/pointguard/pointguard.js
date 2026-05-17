(function () {
  "use strict";

  const EXAM_TYPES = {
    auto: {
      id: "auto",
      label: "Auto detect",
      reportLabel: "Cardiac CT",
    },
    coronary_cta: {
      id: "coronary_cta",
      label: "Coronary CTA",
      reportLabel: "Coronary CTA",
    },
    cardiac_ct: {
      id: "cardiac_ct",
      label: "Cardiac CT",
      reportLabel: "Cardiac CT",
    },
    calcium_score: {
      id: "calcium_score",
      label: "Calcium score CT",
      reportLabel: "Coronary calcium score CT",
    },
  };

  const PRESENTATION_CONTEXTS = {
    auto: {
      id: "auto",
      label: "Auto detect",
      note: "Clinical pathway will be inferred from the indication when possible.",
    },
    stable_chest_pain: {
      id: "stable_chest_pain",
      label: "Stable chest pain",
      note: "Recommendations follow the stable-chest-pain CAD-RADS pathway.",
    },
    acute_chest_pain: {
      id: "acute_chest_pain",
      label: "Acute chest pain / ACS",
      note: "Recommendations follow the acute-chest-pain CAD-RADS pathway.",
    },
    general: {
      id: "general",
      label: "General / non-ACS",
      note: "Recommendations stay general when ACS pathway wording is not the main fit.",
    },
  };

  const VESSEL_CONFIGS = [
    {
      id: "left_main",
      label: "Left main",
      shortLabel: "LM",
      major: true,
      patterns: [/\bleft main\b/, /\blm\b/],
    },
    {
      id: "lad",
      label: "LAD",
      shortLabel: "LAD",
      major: true,
      patterns: [/\blad\b/, /left anterior descending/],
    },
    {
      id: "lcx",
      label: "LCx",
      shortLabel: "LCx",
      major: true,
      patterns: [/\blcx\b/, /left circumflex/, /\bcircumflex\b/],
    },
    {
      id: "rca",
      label: "RCA",
      shortLabel: "RCA",
      major: true,
      patterns: [/\brca\b/, /right coronary/],
    },
    {
      id: "ramus",
      label: "Ramus",
      shortLabel: "Ramus",
      major: false,
      patterns: [/\bramus\b/, /intermedius/],
    },
    {
      id: "diagonal",
      label: "Diagonal",
      shortLabel: "Diagonal",
      major: false,
      patterns: [/\bdiag(?:onal)?\b/, /\bd\d+\b/],
    },
    {
      id: "obtuse_marginal",
      label: "Obtuse marginal",
      shortLabel: "OM",
      major: false,
      patterns: [/\bom\b/, /obtuse marginal/],
    },
    {
      id: "pda",
      label: "PDA",
      shortLabel: "PDA",
      major: false,
      patterns: [/\bpda\b/, /posterior descending/],
    },
    {
      id: "plv",
      label: "PLV",
      shortLabel: "PLV",
      major: false,
      patterns: [/\bplv\b/, /posterolateral branch/],
    },
  ];

  const SCCT_SEGMENT_MAP = {
    "1": { number: "1", vesselId: "rca", reportLabel: "Proximal RCA", shortLabel: "RCA", qualifier: "Proximal" },
    "2": { number: "2", vesselId: "rca", reportLabel: "Mid RCA", shortLabel: "RCA", qualifier: "Mid" },
    "3": { number: "3", vesselId: "rca", reportLabel: "Distal RCA", shortLabel: "RCA", qualifier: "Distal" },
    "4": { number: "4", vesselId: "pda", reportLabel: "R-PDA", shortLabel: "R-PDA", qualifier: "" },
    "5": { number: "5", vesselId: "left_main", reportLabel: "Left main", shortLabel: "LM", qualifier: "" },
    "6": { number: "6", vesselId: "lad", reportLabel: "Proximal LAD", shortLabel: "LAD", qualifier: "Proximal" },
    "7": { number: "7", vesselId: "lad", reportLabel: "Mid LAD", shortLabel: "LAD", qualifier: "Mid" },
    "8": { number: "8", vesselId: "lad", reportLabel: "Distal LAD", shortLabel: "LAD", qualifier: "Distal" },
    "9": { number: "9", vesselId: "diagonal", reportLabel: "D1", shortLabel: "D1", qualifier: "" },
    "10": { number: "10", vesselId: "diagonal", reportLabel: "D2", shortLabel: "D2", qualifier: "" },
    "11": { number: "11", vesselId: "lcx", reportLabel: "Proximal LCx", shortLabel: "LCx", qualifier: "Proximal" },
    "12": { number: "12", vesselId: "obtuse_marginal", reportLabel: "OM1", shortLabel: "OM1", qualifier: "" },
    "13": { number: "13", vesselId: "lcx", reportLabel: "Mid and distal LCx", shortLabel: "LCx", qualifier: "Mid/distal" },
    "14": { number: "14", vesselId: "obtuse_marginal", reportLabel: "OM2", shortLabel: "OM2", qualifier: "" },
    "15": { number: "15", vesselId: "pda", reportLabel: "L-PDA", shortLabel: "L-PDA", qualifier: "" },
    "16": { number: "16", vesselId: "plv", reportLabel: "R-PLB", shortLabel: "R-PLB", qualifier: "" },
    "17": { number: "17", vesselId: "ramus", reportLabel: "Ramus intermedius", shortLabel: "Ramus", qualifier: "" },
    "18": { number: "18", vesselId: "plv", reportLabel: "L-PLB", shortLabel: "L-PLB", qualifier: "" },
  };

  const SCCT_SEGMENT_ALIAS_PATTERNS = [
    { pattern: /\bprca\b/, segmentNumber: "1" },
    { pattern: /\bmrca\b/, segmentNumber: "2" },
    { pattern: /\bdrca\b/, segmentNumber: "3" },
    { pattern: /\b(?:r-?pda|pda-?rca)\b/, segmentNumber: "4" },
    { pattern: /\bplad\b/, segmentNumber: "6" },
    { pattern: /\bmlad\b/, segmentNumber: "7" },
    { pattern: /\bdlad\b/, segmentNumber: "8" },
    { pattern: /\bd1\b/, segmentNumber: "9" },
    { pattern: /\bd2\b/, segmentNumber: "10" },
    { pattern: /\b(?:pcx|plcx)\b/, segmentNumber: "11" },
    { pattern: /\bom1\b/, segmentNumber: "12" },
    { pattern: /\b(?:mlcx|dlcx)\b/, segmentNumber: "13" },
    { pattern: /\bom2\b/, segmentNumber: "14" },
    { pattern: /\b(?:l-?pda|pda-?lcx)\b/, segmentNumber: "15" },
    { pattern: /\b(?:r-?plb|r-?plv|plb-?rca)\b/, segmentNumber: "16" },
    { pattern: /\bri\b/, segmentNumber: "17" },
    { pattern: /\b(?:l-?plb|l-?plv|plb-?lcx)\b/, segmentNumber: "18" },
  ];

  const CARDIAC_TOPICS = [
    {
      label: "Aorta",
      patterns: [/ascending aorta/, /aortic root/, /\baorta\b/, /aneurysm/, /ectatic/],
    },
    {
      label: "Pericardium",
      patterns: [/pericard/],
    },
    {
      label: "Chambers",
      patterns: [/left ventricle/, /right ventricle/, /\blv\b/, /\brv\b/, /atrium/, /atrial/, /chamber/, /dilat/, /enlarg/],
    },
    {
      label: "Valves",
      patterns: [/aortic valve/, /mitral valve/, /tricuspid/, /pulmonic/, /\bvalve\b/, /annular calcification/],
    },
    {
      label: "Pulmonary arteries",
      patterns: [/pulmonary arter/, /\bpe\b/, /embol/],
    },
    {
      label: "Myocardium",
      patterns: [/myocard/, /hypertroph/, /scar/, /wall thinning/, /delayed enhancement/],
    },
  ];

  const CORONARY_STRUCTURE_TOPICS = [
    {
      label: "Origin / course anomalies",
      patterns: [
        /anomalous/,
        /retroaortic/,
        /interarterial/,
        /prepulmonic/,
        /transseptal/,
        /malignant course/,
        /high takeoff/,
        /coronary origin/,
        /origin of the coronary/,
        /origin and course/,
        /course of the coronary/,
      ],
    },
    {
      label: "Myocardial bridging",
      patterns: [/myocardial bridg/],
    },
    {
      label: "Coronary fistula / aneurysm",
      patterns: [/fistula/, /coronary aneurysm/, /coronary ectasia/, /ectatic left circumflex/, /ectatic coronary/],
    },
  ];

  const EXTRACARDIAC_TOPICS = [
    {
      label: "Lungs / pleura",
      patterns: [/lung/, /pleura/, /pleural/, /nodule/, /consolidation/, /atelecta/, /effusion/],
    },
    {
      label: "Mediastinum",
      patterns: [/mediastin/, /hilum/, /lymph node/, /hiatal hernia/, /esophagus/],
    },
    {
      label: "Upper abdomen",
      patterns: [/upper abdomen/, /\babdomen\b/, /liver/, /hepatic/, /spleen/, /adrenal/, /renal/, /gallbladder/],
    },
    {
      label: "Osseous structures",
      patterns: [/osseous/, /\bbone\b/, /rib/, /sternum/, /spine/, /fracture/],
    },
  ];

  const SAMPLE_CASES = [
    {
      id: "normal_coronary",
      label: "Normal coronary CTA",
      examType: "coronary_cta",
      indication: "Atypical chest pain",
      calciumScore: "0",
      heartRate: "58",
      text:
        "Indication: atypical chest pain. Diagnostic coronary CTA with right dominant circulation. Left main, LAD, circumflex, and RCA are patent without plaque or stenosis. No pericardial effusion. Ascending aorta is normal caliber. Visualized lungs and upper abdomen show no acute abnormality.",
    },
    {
      id: "lad_moderate",
      label: "Moderate LAD disease with HRP",
      examType: "coronary_cta",
      indication: "Atypical chest pain",
      calciumScore: "188",
      heartRate: "61",
      text:
        "Coronary CTA for atypical chest pain. Diagnostic image quality. Right dominant system. Left main is patent. Proximal LAD has mixed plaque causing moderate 50-69% stenosis with positive remodeling and low attenuation plaque. Mid LAD has mild calcified plaque. LCx has minimal plaque without significant stenosis. RCA has mild calcified plaque with 25-49% stenosis. Coronary calcium score 188. No pericardial effusion. Mild aortic valve calcification. Partially visualized lungs are clear.",
    },
    {
      id: "multivessel_obstructive",
      label: "Multivessel obstructive CAD",
      examType: "coronary_cta",
      indication: "Known coronary artery disease",
      calciumScore: "624",
      heartRate: "64",
      text:
        "Coronary CTA for known coronary artery disease. Image quality is limited by motion but remains diagnostic. Right dominant circulation. Left main has calcified plaque with 50-69% stenosis. Proximal LAD has mixed plaque with severe 70-99% stenosis. LCx has severe 70-99% stenosis in the proximal vessel. RCA has severe 70-99% stenosis proximally. Spotty calcification and napkin ring sign are present in the proximal LAD plaque. Prior LAD stent is patent. Ascending aorta is ectatic at 4.2 cm. No pericardial effusion. Small hiatal hernia and mild bibasal atelectatic change.",
    },
    {
      id: "calcium_score",
      label: "Calcium score only",
      examType: "calcium_score",
      indication: "Risk stratification",
      calciumScore: "412",
      heartRate: "",
      text:
        "Noncontrast cardiac CT for coronary calcium scoring. Agatston score 412, with LAD 280, LCx 44, and RCA 88. Extensive calcified coronary plaque burden. No pericardial effusion. Visualized lungs are clear.",
    },
  ];

  const STENOSIS_LIBRARY = {
    none: { key: "none", label: "None", rangeText: "0%", minPercent: 0, maxPercent: 0, rank: 0, ambiguous: false },
    minimal: {
      key: "minimal",
      label: "Minimal",
      rangeText: "1-24%",
      minPercent: 1,
      maxPercent: 24,
      rank: 1,
      ambiguous: false,
    },
    mild: {
      key: "mild",
      label: "Mild",
      rangeText: "25-49%",
      minPercent: 25,
      maxPercent: 49,
      rank: 2,
      ambiguous: false,
    },
    moderate: {
      key: "moderate",
      label: "Moderate",
      rangeText: "50-69%",
      minPercent: 50,
      maxPercent: 69,
      rank: 3,
      ambiguous: false,
    },
    severe: {
      key: "severe",
      label: "Severe",
      rangeText: "70-99%",
      minPercent: 70,
      maxPercent: 99,
      rank: 4,
      ambiguous: false,
    },
    occluded: {
      key: "occluded",
      label: "Occluded",
      rangeText: "100%",
      minPercent: 100,
      maxPercent: 100,
      rank: 5,
      ambiguous: false,
    },
    nonobstructive: {
      key: "nonobstructive",
      label: "Nonobstructive",
      rangeText: "<50%",
      minPercent: 1,
      maxPercent: 49,
      rank: 1.5,
      ambiguous: true,
    },
  };

  const BACKEND_DICTATION_CHUNK_MS = 4000;
  const REALTIME_CONNECT_TIMEOUT_MS = 15000;
  const REALTIME_STOP_GRACE_MS = 700;
  const BACKEND_RECORDER_MIME_CANDIDATES = [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  const SEGMENT_WORD_NUMBERS = {
    one: "I",
    two: "II",
    three: "III",
    four: "IV",
    five: "V",
    six: "VI",
    seven: "VII",
    eight: "VIII",
  };
  const DICTATION_NOISE_PATTERNS = [
    /\bbeautiful formed\b/,
    /\bsuntrust\b/,
    /\bnormal teeth\b/,
    /\bthermal diagnosis\b/,
    /\bcan we see\b/,
    /\bso this\b/,
  ];

  const state = {
    recognition: null,
    browserSpeechSupported: false,
    backendDictation: {
      status: "checking",
      ready: false,
      model: "gpt-4o-transcribe",
      message: "Checking medical dictation backend...",
    },
    dictationSupported: false,
    keepListening: false,
    isDictating: false,
    activeDictationMode: null,
    mediaRecorder: null,
    mediaStream: null,
    realtimePeerConnection: null,
    realtimeDataChannel: null,
    realtimeTurns: new Map(),
    realtimeOrderedIds: [],
    realtimeFlushedCount: 0,
    recorderMimeType: "",
    pendingTranscriptions: 0,
    transcriptionQueue: Promise.resolve(),
    pendingStopResolver: null,
    dictationSessionId: 0,
    chunkCounter: 0,
    lastAnalysis: null,
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    bindEvents();
    populateSamples();
    setupSpeechRecognition();
    void detectBackendDictation();
    refreshDictationSupport();
    renderAnalysis(createEmptyAnalysis());
    installDeveloperHooks();
  }

  function cacheElements() {
    els.dictationToggleButton = document.getElementById("dictation-toggle-button");
    els.stopDictationButton = document.getElementById("stop-dictation-button");
    els.analyzeButton = document.getElementById("analyze-button");
    els.clearTranscriptButton = document.getElementById("clear-transcript-button");
    els.sampleSelect = document.getElementById("sample-select");
    els.loadSampleButton = document.getElementById("load-sample-button");
    els.statusPill = document.getElementById("status-pill");
    els.examTypeSelect = document.getElementById("exam-type-select");
    els.manualIndicationInput = document.getElementById("manual-indication-input");
    els.manualPresentationSelect = document.getElementById("manual-presentation-select");
    els.manualCalciumScoreInput = document.getElementById("manual-calcium-score-input");
    els.manualHeartRateInput = document.getElementById("manual-heart-rate-input");
    els.cadRadsConfidence = document.getElementById("cad-rads-confidence");
    els.cadRadsBadge = document.getElementById("cad-rads-badge");
    els.cadRadsSummary = document.getElementById("cad-rads-summary");
    els.studyTypeReadout = document.getElementById("study-type-readout");
    els.presentationReadout = document.getElementById("presentation-readout");
    els.plaqueBurdenReadout = document.getElementById("plaque-burden-readout");
    els.modifierReadout = document.getElementById("modifier-readout");
    els.dominanceReadout = document.getElementById("dominance-readout");
    els.qualityReadout = document.getElementById("quality-readout");
    els.recommendationReadout = document.getElementById("recommendation-readout");
    els.missingInfoList = document.getElementById("missing-info-list");
    els.dictationAvailability = document.getElementById("dictation-availability");
    els.dictationEngine = document.getElementById("dictation-engine");
    els.transcriptInput = document.getElementById("transcript-input");
    els.interimTranscript = document.getElementById("interim-transcript");
    els.examReadout = document.getElementById("exam-readout");
    els.examNote = document.getElementById("exam-note");
    els.qualityCardReadout = document.getElementById("quality-card-readout");
    els.qualityCardNote = document.getElementById("quality-card-note");
    els.patternReadout = document.getElementById("pattern-readout");
    els.patternNote = document.getElementById("pattern-note");
    els.coverageReadout = document.getElementById("coverage-readout");
    els.coverageNote = document.getElementById("coverage-note");
    els.techniqueTableBody = document.getElementById("technique-table-body");
    els.ancillaryTableBody = document.getElementById("ancillary-table-body");
    els.vesselTableBody = document.getElementById("vessel-table-body");
    els.composeReportButton = document.getElementById("compose-report-button");
    els.copyReportButton = document.getElementById("copy-report-button");
    els.sectionIndication = document.getElementById("section-indication");
    els.sectionTechnique = document.getElementById("section-technique");
    els.sectionQuality = document.getElementById("section-quality");
    els.sectionCoronary = document.getElementById("section-coronary");
    els.sectionCardiac = document.getElementById("section-cardiac");
    els.sectionExtracardiac = document.getElementById("section-extracardiac");
    els.sectionImpression = document.getElementById("section-impression");
    els.sectionRecommendations = document.getElementById("section-recommendations");
    els.finalReportOutput = document.getElementById("final-report-output");
    els.editorFields = Array.from(document.querySelectorAll("[data-section-field]"));
  }

  function bindEvents() {
    els.dictationToggleButton.addEventListener("click", () => {
      void startDictation();
    });
    els.stopDictationButton.addEventListener("click", () => {
      void stopDictation();
    });
    els.analyzeButton.addEventListener("click", () => {
      void runGuidelineReportCreation();
    });
    els.clearTranscriptButton.addEventListener("click", () => {
      void clearAllInputs();
    });
    els.loadSampleButton.addEventListener("click", loadSelectedSample);
    els.composeReportButton.addEventListener("click", updateFinalReportFromEditors);
    els.copyReportButton.addEventListener("click", copyFinalReport);
    document.addEventListener("keydown", handleGlobalKeydown);
    [
      els.sectionIndication,
      els.sectionTechnique,
      els.sectionQuality,
      els.sectionCoronary,
      els.sectionCardiac,
      els.sectionExtracardiac,
      els.sectionImpression,
      els.sectionRecommendations,
    ].forEach((field) => {
      field.addEventListener("input", updateFinalReportFromEditors);
    });
  }

  function handleGlobalKeydown(event) {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const target = event.target || document.activeElement;
    const editingField = isTypingField(target);
    const interactiveField = isInteractiveElement(target);

    if (event.code === "Space") {
      if (state.isDictating || (!editingField && !interactiveField)) {
        event.preventDefault();
        void toggleDictation();
      }
      return;
    }

    if (event.key === "Enter") {
      if (state.isDictating || (!editingField && !interactiveField)) {
        event.preventDefault();
        void runGuidelineReportCreation();
      }
    }
  }

  async function toggleDictation() {
    if (state.isDictating) {
      await stopDictation();
      return;
    }
    await startDictation();
  }

  async function runGuidelineReportCreation() {
    if (state.isDictating || state.pendingTranscriptions > 0) {
      await stopDictation();
    }
    analyzeTranscript();
  }

  function isTypingField(target) {
    if (!target) {
      return false;
    }

    const tagName = String(target.tagName || "").toLowerCase();
    if (target.isContentEditable) {
      return true;
    }

    if (tagName === "textarea") {
      return true;
    }

    if (tagName === "input") {
      const type = String(target.type || "").toLowerCase();
      return type !== "button" && type !== "checkbox" && type !== "radio" && type !== "range" && type !== "submit";
    }

    return false;
  }

  function isInteractiveElement(target) {
    if (!target) {
      return false;
    }

    const tagName = String(target.tagName || "").toLowerCase();
    return (
      tagName === "button" ||
      tagName === "select" ||
      tagName === "option" ||
      tagName === "a" ||
      tagName === "summary"
    );
  }

  function populateSamples() {
    SAMPLE_CASES.forEach((sample) => {
      const option = document.createElement("option");
      option.value = sample.id;
      option.textContent = sample.label;
      els.sampleSelect.appendChild(option);
    });
  }

  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      state.browserSpeechSupported = false;
      state.recognition = null;
      refreshDictationSupport();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = function () {
      state.isDictating = true;
      state.activeDictationMode = "browser";
      els.interimTranscript.textContent = "Listening...";
      refreshDictationSupport();
      setStatus("Browser speech fallback live. HAGRad PointGuard is transcribing your dictation.");
    };

    recognition.onend = function () {
      state.isDictating = false;
      state.activeDictationMode = null;
      refreshDictationSupport();

      if (state.keepListening) {
        els.interimTranscript.textContent = "Restarting browser speech fallback...";
        try {
          recognition.start();
          return;
        } catch (error) {
          state.keepListening = false;
          setStatus(error.message || "Speech recognition could not restart.", "error");
        }
      }

      els.interimTranscript.textContent = "Nothing streaming right now.";
      setStatus("Dictation stopped. You can edit the transcript and run Go Ahead! whenever you are ready.");
      if (typeof state.pendingStopResolver === "function") {
        const resolve = state.pendingStopResolver;
        state.pendingStopResolver = null;
        resolve();
      }
    };

    recognition.onerror = function (event) {
      if (event.error === "no-speech") {
        setStatus("Listening for speech...", "warning");
        return;
      }
      if (event.error === "aborted") {
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        state.keepListening = false;
        setStatus(
          "Microphone access is blocked in the browser. Allow microphone access for this page and try again, or use macOS Dictation in the transcript box.",
          "error"
        );
        return;
      }
      if (event.error === "audio-capture") {
        state.keepListening = false;
        setStatus("No microphone input is available. Check your Mac microphone selection and any other app that may be using the mic.", "error");
        return;
      }
      if (event.error === "network") {
        state.keepListening = false;
        setStatus("The browser speech service reported a network problem. Try again, or use manual/macOS Dictation input.", "error");
        return;
      }
      setStatus(`Speech recognition error: ${event.error}.`, "error");
    };

    recognition.onresult = function (event) {
      let finalChunk = "";
      let interimChunk = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript || "";
        if (event.results[index].isFinal) {
          finalChunk += `${transcript.trim()} `;
        } else {
          interimChunk += `${transcript.trim()} `;
        }
      }

      if (finalChunk.trim()) {
        appendToTranscript(finalChunk.trim());
      }

      els.interimTranscript.textContent = interimChunk.trim() || "Listening...";
    };

    state.recognition = recognition;
    state.browserSpeechSupported = true;
    refreshDictationSupport();
  }

  function updateDictationButtons() {
    els.stopDictationButton.disabled = !state.isDictating;
    els.dictationToggleButton.disabled = !state.dictationSupported || state.isDictating || state.pendingTranscriptions > 0;
    els.dictationToggleButton.textContent = isRealtimeDictationAvailable()
      ? "Start Realtime Dictation"
      : isBackendDictationAvailable()
        ? "Start Medical Dictation"
        : "Start Dictation";
  }

  function refreshDictationSupport() {
    state.recorderMimeType = getPreferredRecorderMimeType();
    state.dictationSupported = isRealtimeDictationAvailable() || isBackendDictationAvailable() || state.browserSpeechSupported;
    updateDictationButtons();
    renderDictationBadges();
  }

  function renderDictationBadges() {
    if (state.activeDictationMode === "realtime") {
      els.dictationAvailability.textContent = "Realtime live";
      els.dictationEngine.textContent = `Realtime medical dictation: ${state.backendDictation.realtimeModel || "gpt-4o-mini-transcribe"}`;
      return;
    }

    if (state.activeDictationMode === "backend") {
      els.dictationAvailability.textContent = state.pendingTranscriptions > 0 ? "Recording + transcribing" : "Recording";
      els.dictationEngine.textContent = `Upload backend: ${state.backendDictation.uploadModel || "gpt-4o-transcribe"}`;
      return;
    }

    if (state.activeDictationMode === "browser") {
      els.dictationAvailability.textContent = "Listening";
      els.dictationEngine.textContent = "Browser speech fallback";
      return;
    }

    if (state.pendingTranscriptions > 0) {
      els.dictationAvailability.textContent = "Transcribing";
    } else if (isRealtimeDictationAvailable()) {
      els.dictationAvailability.textContent = "Realtime ready";
    } else if (isBackendDictationAvailable()) {
      els.dictationAvailability.textContent = "Medical dictation ready";
    } else if (state.browserSpeechSupported) {
      els.dictationAvailability.textContent = "Browser fallback ready";
    } else if (state.backendDictation.status === "checking") {
      els.dictationAvailability.textContent = "Checking microphone support...";
    } else {
      els.dictationAvailability.textContent = "Manual input only";
    }

    if (isRealtimeDictationAvailable()) {
      els.dictationEngine.textContent = `Realtime medical dictation: ${state.backendDictation.realtimeModel || "gpt-4o-mini-transcribe"}`;
    } else if (isBackendDictationAvailable()) {
      els.dictationEngine.textContent = `Upload backend: ${state.backendDictation.uploadModel || "gpt-4o-transcribe"}`;
    } else if (state.backendDictation.ready && !hasRealtimeSupport() && !hasMediaRecorderSupport()) {
      els.dictationEngine.textContent = "Backend ready, browser unsupported";
    } else if (state.browserSpeechSupported) {
      els.dictationEngine.textContent = "Browser speech fallback";
    } else if (state.backendDictation.status === "checking") {
      els.dictationEngine.textContent = "Checking dictation engine...";
    } else {
      els.dictationEngine.textContent = "Typing / macOS Dictation";
    }
  }

  function isRealtimeDictationAvailable() {
    return Boolean((state.backendDictation.realtimeReady ?? state.backendDictation.ready) && hasRealtimeSupport());
  }

  function isBackendDictationAvailable() {
    return Boolean((state.backendDictation.uploadReady ?? state.backendDictation.ready) && hasMediaRecorderSupport());
  }

  function hasRealtimeSupport() {
    return typeof window.RTCPeerConnection === "function";
  }

  function hasMediaRecorderSupport() {
    return typeof window.MediaRecorder === "function";
  }

  function getPreferredRecorderMimeType() {
    if (!hasMediaRecorderSupport()) {
      return "";
    }
    if (typeof window.MediaRecorder.isTypeSupported !== "function") {
      return "";
    }
    return BACKEND_RECORDER_MIME_CANDIDATES.find((candidate) => window.MediaRecorder.isTypeSupported(candidate)) || "";
  }

  async function detectBackendDictation() {
    try {
      const response = await fetch("/api/pointguard/backend/status", {
        cache: "no-store",
      });
      const payload = await readJsonResponse(response);
      state.backendDictation = {
        status: payload.status || (response.ok ? "ready" : "unavailable"),
        ready: Boolean(payload.ready),
        model: payload.model || payload.realtime?.model || "gpt-4o-mini-transcribe",
        realtimeReady: Boolean(payload.realtime?.ready ?? payload.ready),
        realtimeModel: payload.realtime?.model || payload.model || "gpt-4o-mini-transcribe",
        uploadReady: Boolean(payload.upload?.ready ?? payload.ready),
        uploadModel: payload.upload?.model || "gpt-4o-transcribe",
        preferredMode: payload.preferredMode || (payload.ready ? "realtime_webrtc" : "browser_speech"),
        message: payload.message || "Medical dictation backend status loaded.",
      };
    } catch (error) {
      state.backendDictation = {
        status: "unreachable",
        ready: false,
        model: "gpt-4o-mini-transcribe",
        realtimeReady: false,
        realtimeModel: "gpt-4o-mini-transcribe",
        uploadReady: false,
        uploadModel: "gpt-4o-transcribe",
        preferredMode: "browser_speech",
        message: "PointGuard could not reach the local transcription backend status endpoint.",
      };
    }

    refreshDictationSupport();

    if (isRealtimeDictationAvailable()) {
      setStatus(`Realtime medical dictation ready via ${state.backendDictation.realtimeModel}. Press Space or Start Dictation to capture audio.`);
      return;
    }

    if (isBackendDictationAvailable()) {
      setStatus(`Medical upload dictation ready via ${state.backendDictation.uploadModel}. Press Space or Start Dictation to capture audio.`);
      return;
    }

    if (state.backendDictation.ready && !hasRealtimeSupport() && !hasMediaRecorderSupport()) {
      setStatus(
        "Medical transcription is configured, but this browser cannot open realtime or upload dictation from here. PointGuard will use browser speech fallback when available.",
        "warning"
      );
      return;
    }

    if (state.backendDictation.ready && !hasRealtimeSupport() && isBackendDictationAvailable()) {
      setStatus(
        `Realtime dictation is not supported in this browser, so PointGuard will use the upload backend with ${state.backendDictation.uploadModel}.`,
        "warning"
      );
      return;
    }

    if (!state.backendDictation.ready && state.browserSpeechSupported) {
      setStatus(`${state.backendDictation.message} Browser speech remains available as fallback.`, "warning");
      return;
    }

    if (!state.backendDictation.ready) {
      setStatus(state.backendDictation.message, "warning");
    }
  }

  async function startDictation() {
    if (state.isDictating || state.pendingTranscriptions > 0) {
      return;
    }

    if (!state.dictationSupported) {
      setStatus("No live dictation engine is available here yet. Use manual input or macOS Dictation in the transcript box instead.", "warning");
      return;
    }

    const useRealtime = isRealtimeDictationAvailable();
    const useBackend = !useRealtime && isBackendDictationAvailable();
    const microphoneAccess = await requestMicrophoneAccess({ keepStream: useRealtime || useBackend });
    if (!microphoneAccess.ok) {
      state.keepListening = false;
      if (microphoneAccess.stream) {
        stopMediaStream(microphoneAccess.stream);
      }
      refreshDictationSupport();
      setStatus(microphoneAccess.message, "error");
      return;
    }

    if (useRealtime) {
      try {
        await startRealtimeDictation(microphoneAccess.stream);
        return;
      } catch (error) {
        if (microphoneAccess.stream) {
          stopMediaStream(microphoneAccess.stream);
        }
        if (isBackendDictationAvailable()) {
          setStatus(`${error.message || "Realtime medical dictation could not start."} Falling back to upload transcription.`, "warning");
          const retryAccess = await requestMicrophoneAccess({ keepStream: true });
          if (retryAccess.ok) {
            try {
              await startBackendDictation(retryAccess.stream);
              return;
            } catch (backendError) {
              if (retryAccess.stream) {
                stopMediaStream(retryAccess.stream);
              }
              if (state.browserSpeechSupported && state.recognition) {
                setStatus(`${backendError.message || "Upload transcription could not start."} Falling back to browser speech recognition.`, "warning");
                startBrowserDictation();
                return;
              }
              setStatus(backendError.message || "Upload transcription could not start.", "error");
              return;
            }
          }
        }
        if (state.browserSpeechSupported && state.recognition) {
          setStatus(`${error.message || "Realtime medical dictation could not start."} Falling back to browser speech recognition.`, "warning");
          startBrowserDictation();
          return;
        }
        setStatus(error.message || "Realtime medical dictation could not start.", "error");
        return;
      }
    }

    if (useBackend) {
      try {
        await startBackendDictation(microphoneAccess.stream);
        return;
      } catch (error) {
        if (microphoneAccess.stream) {
          stopMediaStream(microphoneAccess.stream);
        }
        if (state.browserSpeechSupported && state.recognition) {
          setStatus(`${error.message || "Medical dictation could not start."} Falling back to browser speech recognition.`, "warning");
          startBrowserDictation();
          return;
        }
        setStatus(error.message || "Medical dictation could not start.", "error");
        return;
      }
    }

    if (microphoneAccess.stream) {
      stopMediaStream(microphoneAccess.stream);
    }
    startBrowserDictation();
  }

  function startBrowserDictation() {
    if (!state.recognition) {
      setStatus("Browser speech recognition is not available here. Use manual input or macOS Dictation instead.", "warning");
      return;
    }

    state.keepListening = true;
    els.interimTranscript.textContent = "Listening...";

    try {
      state.recognition.start();
    } catch (error) {
      if (!String(error.message || "").includes("already started")) {
        setStatus(error.message || "Unable to start dictation.", "error");
      }
    }
  }

  async function startRealtimeDictation(stream) {
    if (!stream) {
      throw new Error("Microphone audio stream is unavailable.");
    }

    if (!hasRealtimeSupport()) {
      throw new Error("This browser cannot establish a realtime WebRTC dictation session.");
    }

    resetRealtimeTurnState();

    const peerConnection = new RTCPeerConnection();
    const dataChannel = peerConnection.createDataChannel("oai-events");
    const sessionId = state.dictationSessionId + 1;

    state.dictationSessionId = sessionId;
    state.keepListening = false;
    state.mediaStream = stream;
    state.realtimePeerConnection = peerConnection;
    state.realtimeDataChannel = dataChannel;
    state.activeDictationMode = "realtime";
    state.isDictating = true;
    refreshDictationSupport();
    els.interimTranscript.textContent = "Connecting realtime medical dictation...";
    setStatus(
      `Connecting HAGRad PointGuard to realtime medical dictation with ${state.backendDictation.realtimeModel || "gpt-4o-mini-transcribe"}.`
    );

    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });

    dataChannel.addEventListener("open", () => {
      if (sessionId !== state.dictationSessionId) {
        return;
      }
      els.interimTranscript.textContent = "Realtime medical dictation live. Speak naturally.";
      setStatus(
        `Realtime medical dictation live via ${state.backendDictation.realtimeModel || "gpt-4o-mini-transcribe"}.`
      );
    });

    dataChannel.addEventListener("message", (event) => {
      handleRealtimeDataEvent(event, sessionId);
    });

    dataChannel.addEventListener("error", (event) => {
      if (sessionId !== state.dictationSessionId) {
        return;
      }
      const message = event?.error?.message || "Realtime data channel error.";
      setStatus(message, "error");
    });

    peerConnection.addEventListener("connectionstatechange", () => {
      if (sessionId !== state.dictationSessionId) {
        return;
      }

      if (peerConnection.connectionState === "failed") {
        setStatus("Realtime medical dictation connection failed.", "error");
      } else if (peerConnection.connectionState === "disconnected") {
        setStatus("Realtime medical dictation disconnected. You can try again or use a fallback path.", "warning");
      }
    });

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const response = await fetch("/api/pointguard/backend/realtime/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offerSdp: offer.sdp,
          examType: els.examTypeSelect.value || "auto",
          indication: els.manualIndicationInput.value.trim(),
          presentationContext: els.manualPresentationSelect.value || "auto",
          language: "en",
        }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(payload.message || "Could not create the realtime dictation session.");
      }

      if (payload.backend) {
        state.backendDictation = {
          ...state.backendDictation,
          status: payload.backend.status || state.backendDictation.status,
          ready: Boolean(payload.backend.ready),
          realtimeReady: Boolean(payload.backend.realtime?.ready ?? payload.backend.ready),
          realtimeModel: payload.backend.realtime?.model || payload.model || state.backendDictation.realtimeModel,
          uploadReady: Boolean(payload.backend.upload?.ready ?? payload.backend.ready),
          uploadModel: payload.backend.upload?.model || state.backendDictation.uploadModel,
          message: payload.backend.message || state.backendDictation.message,
        };
      }

      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: String(payload.sdp || ""),
      });
      await waitForRealtimeChannelOpen(peerConnection, dataChannel);
    } catch (error) {
      cleanupRealtimeResources();
      throw error;
    }
  }

  async function waitForRealtimeChannelOpen(peerConnection, dataChannel) {
    if (dataChannel.readyState === "open") {
      return;
    }

    await new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("Realtime medical dictation did not connect in time."));
      }, REALTIME_CONNECT_TIMEOUT_MS);

      function cleanup() {
        window.clearTimeout(timer);
        dataChannel.removeEventListener("open", handleOpen);
        peerConnection.removeEventListener("connectionstatechange", handleConnectionStateChange);
      }

      function handleOpen() {
        cleanup();
        resolve();
      }

      function handleConnectionStateChange() {
        if (peerConnection.connectionState === "failed" || peerConnection.connectionState === "closed") {
          cleanup();
          reject(new Error("Realtime medical dictation connection failed."));
        }
      }

      dataChannel.addEventListener("open", handleOpen);
      peerConnection.addEventListener("connectionstatechange", handleConnectionStateChange);
    });
  }

  function handleRealtimeDataEvent(messageEvent, sessionId) {
    if (sessionId !== state.dictationSessionId) {
      return;
    }

    let event;
    try {
      event = JSON.parse(messageEvent.data);
    } catch (error) {
      return;
    }

    if (!event || !event.type) {
      return;
    }

    if (event.type === "input_audio_buffer.committed") {
      registerRealtimeTurn(event.item_id, event.previous_item_id);
      els.interimTranscript.textContent = "Processing spoken turn...";
      return;
    }

    if (event.type === "input_audio_buffer.speech_started") {
      els.interimTranscript.textContent = "Listening...";
      return;
    }

    if (event.type === "input_audio_buffer.speech_stopped") {
      els.interimTranscript.textContent = "Processing spoken turn...";
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.delta") {
      const turn = registerRealtimeTurn(event.item_id);
      turn.delta = `${turn.delta || ""}${event.delta || ""}`;
      els.interimTranscript.textContent = normalizeTranscriptChunk(turn.delta) || "Listening...";
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const turn = registerRealtimeTurn(event.item_id);
      turn.completed = true;
      turn.transcript = normalizeTranscriptChunk(event.transcript || turn.delta || "");
      turn.delta = "";
      flushRealtimeCompletedTurns();
      return;
    }

    if (event.type === "error") {
      const message = event.error?.message || event.message || "Realtime transcription reported an error.";
      setStatus(message, "error");
    }
  }

  function registerRealtimeTurn(itemId, previousItemId) {
    const normalizedItemId = String(itemId || "").trim() || `turn_${state.realtimeOrderedIds.length + 1}`;
    const normalizedPreviousId = String(previousItemId || "").trim();

    if (!state.realtimeTurns.has(normalizedItemId)) {
      state.realtimeTurns.set(normalizedItemId, {
        id: normalizedItemId,
        previousId: normalizedPreviousId,
        delta: "",
        transcript: "",
        completed: false,
      });
    }

    const turn = state.realtimeTurns.get(normalizedItemId);
    if (normalizedPreviousId) {
      turn.previousId = normalizedPreviousId;
    }

    if (!state.realtimeOrderedIds.includes(normalizedItemId)) {
      if (normalizedPreviousId && state.realtimeOrderedIds.includes(normalizedPreviousId)) {
        const previousIndex = state.realtimeOrderedIds.indexOf(normalizedPreviousId);
        state.realtimeOrderedIds.splice(previousIndex + 1, 0, normalizedItemId);
      } else {
        state.realtimeOrderedIds.push(normalizedItemId);
      }
    }

    return turn;
  }

  function flushRealtimeCompletedTurns() {
    while (state.realtimeFlushedCount < state.realtimeOrderedIds.length) {
      const itemId = state.realtimeOrderedIds[state.realtimeFlushedCount];
      const turn = state.realtimeTurns.get(itemId);
      if (!turn || !turn.completed) {
        break;
      }
      if (turn.transcript) {
        appendToTranscript(turn.transcript);
      }
      state.realtimeFlushedCount += 1;
    }

    const nextInterim = getRealtimeInterimTranscript();
    els.interimTranscript.textContent = nextInterim || (state.isDictating ? "Listening..." : "Nothing streaming right now.");
  }

  function getRealtimeInterimTranscript() {
    for (let index = state.realtimeOrderedIds.length - 1; index >= state.realtimeFlushedCount; index -= 1) {
      const turn = state.realtimeTurns.get(state.realtimeOrderedIds[index]);
      if (turn && turn.delta) {
        return normalizeTranscriptChunk(turn.delta);
      }
    }
    return "";
  }

  function resetRealtimeTurnState() {
    state.realtimeTurns = new Map();
    state.realtimeOrderedIds = [];
    state.realtimeFlushedCount = 0;
  }

  function cleanupRealtimeResources() {
    try {
      if (state.realtimeDataChannel) {
        state.realtimeDataChannel.close();
      }
    } catch (error) {
      // Ignore cleanup errors.
    }

    try {
      if (state.realtimePeerConnection) {
        state.realtimePeerConnection.close();
      }
    } catch (error) {
      // Ignore cleanup errors.
    }

    stopMediaStream(state.mediaStream);
    state.realtimeDataChannel = null;
    state.realtimePeerConnection = null;
    state.mediaStream = null;
    state.isDictating = false;
    state.activeDictationMode = null;
    resetRealtimeTurnState();
    refreshDictationSupport();
  }

  async function startBackendDictation(stream) {
    if (!stream) {
      throw new Error("Microphone audio stream is unavailable.");
    }

    if (typeof window.MediaRecorder !== "function") {
      throw new Error("This browser cannot record audio for the medical dictation backend.");
    }

    const recorderOptions = state.recorderMimeType ? { mimeType: state.recorderMimeType } : undefined;
    const recorder = recorderOptions ? new MediaRecorder(stream, recorderOptions) : new MediaRecorder(stream);
    const sessionId = state.dictationSessionId + 1;

    state.dictationSessionId = sessionId;
    state.keepListening = false;
    state.mediaRecorder = recorder;
    state.mediaStream = stream;
    state.chunkCounter = 0;
    state.activeDictationMode = "backend";

    recorder.onstart = function () {
      state.isDictating = true;
      refreshDictationSupport();
      els.interimTranscript.textContent = "Medical audio capture live. PointGuard will append transcription chunks as you speak.";
      setStatus("Medical dictation live. HAGRad PointGuard is recording audio and sending it for cardiac CT transcription.");
    };

    recorder.ondataavailable = function (event) {
      if (event.data && event.data.size > 0) {
        enqueueBackendTranscription(event.data, sessionId);
      }
    };

    recorder.onerror = function (event) {
      const message = event?.error?.message || event?.error?.name || "Media recorder error.";
      setStatus(`Medical dictation recorder error: ${message}`, "error");
    };

    recorder.onstop = function () {
      state.isDictating = false;
      state.activeDictationMode = null;
      stopMediaStream(state.mediaStream);
      state.mediaStream = null;
      state.mediaRecorder = null;
      if (state.pendingTranscriptions > 0) {
        els.interimTranscript.textContent = "Finishing medical transcription...";
        setStatus("Audio capture stopped. PointGuard is finishing the backend transcription.");
      } else {
        els.interimTranscript.textContent = "Nothing streaming right now.";
      }
      refreshDictationSupport();
      if (typeof state.pendingStopResolver === "function") {
        const resolve = state.pendingStopResolver;
        state.pendingStopResolver = null;
        resolve();
      }
    };

    recorder.start(BACKEND_DICTATION_CHUNK_MS);
  }

  function enqueueBackendTranscription(blob, sessionId) {
    state.pendingTranscriptions += 1;
    const chunkNumber = state.chunkCounter + 1;
    state.chunkCounter = chunkNumber;
    refreshDictationSupport();

    state.transcriptionQueue = state.transcriptionQueue
      .catch(() => undefined)
      .then(() => transcribeBackendChunk(blob, sessionId, chunkNumber))
      .catch((error) => {
        if (sessionId !== state.dictationSessionId) {
          return;
        }
        const fallbackHint = state.browserSpeechSupported ? " Browser speech remains available as fallback." : "";
        els.interimTranscript.textContent = "Transcription error.";
        setStatus(`${error.message || "Medical transcription failed."}${fallbackHint}`, "error");
      })
      .finally(() => {
        state.pendingTranscriptions = Math.max(0, state.pendingTranscriptions - 1);
        if (sessionId === state.dictationSessionId) {
          if (state.isDictating) {
            els.interimTranscript.textContent = "Medical audio capture live. Transcription is arriving in guided chunks.";
          } else if (state.pendingTranscriptions > 0) {
            els.interimTranscript.textContent = "Finishing medical transcription...";
          } else {
            els.interimTranscript.textContent = "Nothing streaming right now.";
          }
        }
        refreshDictationSupport();
      });
  }

  async function transcribeBackendChunk(blob, sessionId, chunkNumber) {
    if (!(blob instanceof Blob) || blob.size <= 0) {
      return;
    }

    const formData = new FormData();
    formData.append("audio", blob, buildAudioFilename(blob.type, chunkNumber));
    formData.append("examType", els.examTypeSelect.value || "auto");
    formData.append("indication", els.manualIndicationInput.value.trim());
    formData.append("presentationContext", els.manualPresentationSelect.value || "auto");
    formData.append("transcriptTail", getTranscriptTail());
    formData.append("language", "en");

    const response = await fetch("/api/pointguard/backend/transcribe", {
      method: "POST",
      body: formData,
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(payload.message || "Medical transcription request failed.");
    }

    if (payload.backend) {
      state.backendDictation = {
        ...state.backendDictation,
        status: payload.backend.status || "ready",
        ready: Boolean(payload.backend.ready),
        model: payload.backend.model || state.backendDictation.model || "gpt-4o-mini-transcribe",
        realtimeReady: Boolean(payload.backend.realtime?.ready ?? payload.backend.ready),
        realtimeModel: payload.backend.realtime?.model || state.backendDictation.realtimeModel || "gpt-4o-mini-transcribe",
        uploadReady: Boolean(payload.backend.upload?.ready ?? payload.backend.ready),
        uploadModel: payload.backend.upload?.model || state.backendDictation.uploadModel || "gpt-4o-transcribe",
        message: payload.backend.message || state.backendDictation.message,
      };
    }

    if (sessionId !== state.dictationSessionId) {
      return;
    }

    const chunkText = normalizeTranscriptChunk(payload.text);
    if (chunkText) {
      appendToTranscript(chunkText);
    }
  }

  async function stopDictation(options = {}) {
    state.keepListening = false;

    if (!state.isDictating && state.pendingTranscriptions > 0) {
      await waitForPendingTranscriptions();
      if (options.afterStopMessage !== false) {
        setStatus("Dictation stopped. You can edit the transcript and run Go Ahead! whenever you are ready.");
      }
      return;
    }

    if (state.activeDictationMode === "realtime" || state.realtimePeerConnection) {
      await stopRealtimeDictation(options);
      return;
    }

    if (state.activeDictationMode === "backend" || state.mediaRecorder) {
      await stopBackendDictation(options);
      return;
    }

    if (!state.recognition) {
      return;
    }

    try {
      let stopPromise = Promise.resolve();
      if (state.isDictating) {
        stopPromise = new Promise((resolve) => {
          state.pendingStopResolver = resolve;
        });
      }
      state.recognition.stop();
      await stopPromise;
    } catch (error) {
      state.pendingStopResolver = null;
      setStatus(error.message || "Unable to stop dictation cleanly.", "error");
    }
  }

  async function stopRealtimeDictation(options = {}) {
    stopMediaStream(state.mediaStream);
    els.interimTranscript.textContent = "Finishing realtime transcription...";

    if (options.awaitPending !== false) {
      await delay(REALTIME_STOP_GRACE_MS);
      flushRealtimeCompletedTurns();
    }

    cleanupRealtimeResources();

    if (options.afterStopMessage !== false) {
      setStatus("Dictation stopped. You can edit the transcript and run Go Ahead! whenever you are ready.");
    }
    els.interimTranscript.textContent = "Nothing streaming right now.";
  }

  async function stopBackendDictation(options = {}) {
    const recorder = state.mediaRecorder;
    if (recorder && recorder.state !== "inactive") {
      const stopPromise = new Promise((resolve) => {
        state.pendingStopResolver = resolve;
      });
      try {
        recorder.requestData();
      } catch (error) {
        // Ignore requestData support differences across browsers.
      }
      recorder.stop();
      await stopPromise;
    }

    if (options.awaitPending !== false) {
      await waitForPendingTranscriptions();
    }

    if (options.afterStopMessage !== false && !state.isDictating) {
      setStatus("Dictation stopped. You can edit the transcript and run Go Ahead! whenever you are ready.");
    }
  }

  async function waitForPendingTranscriptions() {
    try {
      await state.transcriptionQueue;
    } catch (error) {
      return;
    }
  }

  function buildAudioFilename(mimeType, chunkNumber) {
    const normalizedType = String(mimeType || "").toLowerCase();
    if (normalizedType.includes("mp4")) {
      return `pointguard-chunk-${chunkNumber}.mp4`;
    }
    if (normalizedType.includes("ogg")) {
      return `pointguard-chunk-${chunkNumber}.ogg`;
    }
    return `pointguard-chunk-${chunkNumber}.webm`;
  }

  function normalizeTranscriptChunk(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getTranscriptTail(maxChars = 320) {
    const transcript = els.transcriptInput.value.trim();
    return transcript.slice(Math.max(0, transcript.length - maxChars));
  }

  function appendToTranscript(chunk) {
    const existing = els.transcriptInput.value.trim();
    const separator = existing ? " " : "";
    els.transcriptInput.value = `${existing}${separator}${chunk}`.trim();
  }

  async function requestMicrophoneAccess(options = {}) {
    const keepStream = Boolean(options.keepStream);
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      return {
        ok: true,
        availability: "Microphone ready",
        stream: null,
      };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!keepStream) {
        stopMediaStream(stream);
      }
      return {
        ok: true,
        availability: "Microphone ready",
        stream: keepStream ? stream : null,
      };
    } catch (error) {
      const errorName = String(error?.name || error?.message || "unknown");
      if (/NotAllowedError|PermissionDeniedError|SecurityError/.test(errorName)) {
        return {
          ok: false,
          availability: "Mic blocked",
          stream: null,
          message:
            "Microphone access is blocked for this page. Allow microphone access in the browser for https://localhost:3020 and try again, or use macOS Dictation in the transcript box.",
        };
      }
      if (/NotFoundError|DevicesNotFoundError/.test(errorName)) {
        return {
          ok: false,
          availability: "No mic found",
          stream: null,
          message: "No microphone was found. Connect or enable a microphone, then try dictation again.",
        };
      }
      if (/NotReadableError|TrackStartError|AbortError/.test(errorName)) {
        return {
          ok: false,
          availability: "Mic busy",
          stream: null,
          message: "The microphone appears busy or unavailable. Close any other app using the microphone and try again.",
        };
      }
      return {
        ok: false,
        availability: "Mic error",
        stream: null,
        message: `Unable to access the microphone (${errorName}). You can still type, paste, or use macOS Dictation in the transcript box.`,
      };
    }
  }

  function stopMediaStream(stream) {
    if (!stream || typeof stream.getTracks !== "function") {
      return;
    }
    stream.getTracks().forEach((track) => track.stop());
  }

  async function clearAllInputs() {
    state.dictationSessionId += 1;
    await stopDictation({
      awaitPending: false,
      afterStopMessage: false,
    });
    stopMediaStream(state.mediaStream);
    state.mediaStream = null;
    state.mediaRecorder = null;
    state.realtimePeerConnection = null;
    state.realtimeDataChannel = null;
    state.activeDictationMode = null;
    state.pendingTranscriptions = 0;
    state.transcriptionQueue = Promise.resolve();
    resetRealtimeTurnState();
    els.transcriptInput.value = "";
    els.interimTranscript.textContent = "Nothing streaming right now.";
    els.manualIndicationInput.value = "";
    els.manualCalciumScoreInput.value = "";
    els.manualHeartRateInput.value = "";
    els.examTypeSelect.value = "auto";
    els.manualPresentationSelect.value = "auto";
    els.sampleSelect.value = "";
    state.lastAnalysis = null;
    refreshDictationSupport();
    renderAnalysis(createEmptyAnalysis());
    setStatus("HAGRad PointGuard has been cleared and is ready for the next case.");
  }

  function loadSelectedSample() {
    const sampleId = els.sampleSelect.value;
    const sample = SAMPLE_CASES.find((entry) => entry.id === sampleId);
    if (!sample) {
      setStatus("Choose an example first so HAGRad PointGuard knows which sample to load.", "warning");
      return;
    }

    els.transcriptInput.value = sample.text;
    els.examTypeSelect.value = sample.examType;
    els.manualIndicationInput.value = sample.indication || "";
    els.manualCalciumScoreInput.value = sample.calciumScore || "";
    els.manualHeartRateInput.value = sample.heartRate || "";
    analyzeTranscript();
  }

  function analyzeTranscript() {
    const transcript = els.transcriptInput.value.trim();
    if (!transcript) {
      setStatus("There is no dictation to analyze yet.", "warning");
      return;
    }

    const analysis = buildAnalysis(transcript);
    state.lastAnalysis = analysis;
    renderAnalysis(analysis);
    setStatus(`Structured ${analysis.exam.label} draft updated${analysis.cadRads.label ? ` with ${analysis.cadRads.label}` : ""}.`);
  }

  function buildAnalysis(text) {
    const preparedText = prepareTranscriptForAnalysis(text);
    const normalizedText = normalizeText(preparedText);
    const sentences = splitSentences(preparedText);
    const exam = detectExamType(normalizedText);
    const indication = extractIndication(sentences);
    const presentation = detectPresentationContext(indication, preparedText);
    const calciumScore = extractCalciumScore(sentences);
    const calciumBreakdown = extractCalciumBreakdown(sentences);
    const heartRate = extractHeartRate(sentences);
    const dominance = extractDominance(normalizedText);
    const quality = extractQuality(sentences);
    const vesselFindings = collectVesselFindings(sentences);
    const coronaryStructureFindings = collectTopicFindings(sentences, CORONARY_STRUCTURE_TOPICS);
    const cardiacFindings = collectTopicFindings(sentences, CARDIAC_TOPICS);
    const extracardiacFindings = collectTopicFindings(sentences, EXTRACARDIAC_TOPICS);
    const plaqueBurden = derivePlaqueBurden(normalizedText, vesselFindings, calciumScore);
    const modifiers = extractModifiers(normalizedText, vesselFindings, quality);
    const cadRads = deriveCadRads(exam, normalizedText, vesselFindings, plaqueBurden, modifiers);
    const recommendation = deriveRecommendation({
      exam,
      indication,
      presentation,
      cadRads,
      plaqueBurden,
      modifiers,
      vesselFindings,
    });
    const techniqueRows = buildTechniqueRows(
      exam,
      normalizedText,
      heartRate,
      calciumScore,
      calciumBreakdown,
      quality,
      modifiers
    );
    const ancillaryRows = buildAncillaryRows(coronaryStructureFindings, cardiacFindings, extracardiacFindings);
    const missingInfo = buildMissingInfo({
      rawText: preparedText,
      preparedText,
      exam,
      indication,
      presentation,
      heartRate,
      calciumScore,
      calciumBreakdown,
      dominance,
      quality,
      vesselFindings,
      coronaryStructureFindings,
      cardiacFindings,
      extracardiacFindings,
      cadRads,
      recommendation,
      modifiers,
      plaqueBurden,
    });
    const sections = buildSections({
      rawText: preparedText,
      exam,
      indication,
      presentation,
      heartRate,
      calciumScore,
      calciumBreakdown,
      dominance,
      quality,
      vesselFindings,
      coronaryStructureFindings,
      cardiacFindings,
      extracardiacFindings,
      cadRads,
      recommendation,
      modifiers,
      plaqueBurden,
    });

    return {
      rawText: preparedText,
      exam,
      indication,
      presentation,
      heartRate,
      calciumScore,
      calciumBreakdown,
      dominance,
      quality,
      vesselFindings,
      coronaryStructureFindings,
      cardiacFindings,
      extracardiacFindings,
      plaqueBurden,
      recommendation,
      modifiers,
      cadRads,
      techniqueRows,
      ancillaryRows,
      missingInfo,
      sections,
    };
  }

  function createEmptyAnalysis() {
    return {
      exam: {
        label: "Awaiting analysis",
        reportLabel: "Cardiac CT",
        note: "Coronary CTA structure will appear here.",
      },
      presentation: {
        label: "Auto detect",
        note: "Clinical pathway will be inferred from the indication when possible.",
      },
      quality: {
        label: "Awaiting analysis",
        summary: "Image quality cues will appear here.",
      },
      plaqueBurden: {
        display: "-",
      },
      modifiers: {
        display: "-",
      },
      cadRads: {
        label: "Awaiting analysis",
        summary: "HAGRad PointGuard will derive stenosis category, plaque burden, and modifiers when the dictated text supports them.",
        tone: "neutral",
        confidence: "Awaiting analysis",
      },
      recommendation: {
        shortText: "-",
        text: "",
      },
      dominance: null,
      calciumBreakdown: [],
      vesselFindings: [],
      coronaryStructureFindings: [],
      techniqueRows: [
        {
          label: "Acquisition",
          value: "Awaiting analysis",
        },
      ],
      ancillaryRows: [
        {
          label: "Pericardium",
          value: "Awaiting analysis",
        },
      ],
      cardiacFindings: [],
      extracardiacFindings: [],
      missingInfo: [],
      sections: {
        indication: "",
        technique: "",
        quality: "",
        coronary: "",
        cardiac: "",
        extracardiac: "",
        impression: "",
        recommendations: "",
      },
    };
  }

  function installDeveloperHooks() {
    if (typeof window === "undefined") {
      return;
    }

    window.__POINTGUARD_DEV__ = {
      analyzeCase: analyzeDeveloperCase,
      getSnapshot: getCurrentReportSnapshot,
      getSampleCases() {
        return SAMPLE_CASES.map((sample) => ({ ...sample }));
      },
    };
  }

  function analyzeDeveloperCase(options) {
    const config = options || {};

    if (els.examTypeSelect) {
      els.examTypeSelect.value = config.examType ? String(config.examType) : "auto";
    }
    if (els.manualIndicationInput) {
      els.manualIndicationInput.value = Object.prototype.hasOwnProperty.call(config, "indication")
        ? config.indication == null
          ? ""
          : String(config.indication)
        : "";
    }
    if (els.manualPresentationSelect) {
      els.manualPresentationSelect.value = Object.prototype.hasOwnProperty.call(config, "presentationContext")
        ? config.presentationContext == null
          ? "auto"
          : String(config.presentationContext)
        : "auto";
    }
    if (els.manualCalciumScoreInput) {
      els.manualCalciumScoreInput.value = Object.prototype.hasOwnProperty.call(config, "calciumScore")
        ? config.calciumScore == null
          ? ""
          : String(config.calciumScore)
        : "";
    }
    if (els.manualHeartRateInput) {
      els.manualHeartRateInput.value = Object.prototype.hasOwnProperty.call(config, "heartRate")
        ? config.heartRate == null
          ? ""
          : String(config.heartRate)
        : "";
    }
    if (els.transcriptInput) {
      els.transcriptInput.value = config.text == null ? "" : String(config.text);
    }

    analyzeTranscript();
    return getCurrentReportSnapshot();
  }

  function getCurrentReportSnapshot() {
    return {
      status: els.statusPill?.textContent || "",
      exam: els.examReadout?.textContent || "",
      cadRads: els.cadRadsBadge?.textContent || "",
      plaqueBurden: els.plaqueBurdenReadout?.textContent || "",
      recommendationReadout: els.recommendationReadout?.textContent || "",
      sections: {
        indication: els.sectionIndication?.value || "",
        technique: els.sectionTechnique?.value || "",
        quality: els.sectionQuality?.value || "",
        coronary: els.sectionCoronary?.value || "",
        cardiac: els.sectionCardiac?.value || "",
        extracardiac: els.sectionExtracardiac?.value || "",
        impression: els.sectionImpression?.value || "",
        recommendations: els.sectionRecommendations?.value || "",
      },
      finalReport: els.finalReportOutput?.value || "",
    };
  }

  function renderAnalysis(analysis) {
    renderCadRads(analysis);
    renderSummaryCards(analysis);
    renderTable(els.techniqueTableBody, analysis.techniqueRows);
    renderTable(els.ancillaryTableBody, analysis.ancillaryRows);
    renderVesselTable(analysis.vesselFindings);
    renderMissingInfo(analysis.missingInfo);
    renderSections(analysis.sections, analysis.missingInfo);
    updateFinalReportFromEditors();
  }

  function renderCadRads(analysis) {
    els.cadRadsConfidence.textContent = analysis.cadRads.confidence || "Awaiting analysis";
    els.cadRadsBadge.textContent = analysis.cadRads.label || "Awaiting analysis";
    els.cadRadsBadge.className = `cad-rads-badge tone-${analysis.cadRads.tone || "neutral"}`;
    els.cadRadsSummary.textContent = analysis.cadRads.summary || "Awaiting analysis";
    els.studyTypeReadout.textContent = analysis.exam.label || "-";
    els.presentationReadout.textContent = analysis.presentation?.label || "-";
    els.plaqueBurdenReadout.textContent = analysis.plaqueBurden.display || "-";
    els.modifierReadout.textContent = analysis.modifiers.display || "-";
    els.dominanceReadout.textContent = analysis.dominance || "-";
    els.qualityReadout.textContent = analysis.quality.label === "Not stated" ? "Diagnostic (autofilled)" : analysis.quality.label || "-";
    els.recommendationReadout.textContent = analysis.recommendation?.shortText || "-";
  }

  function renderSummaryCards(analysis) {
    const majorCoverage = analysis.vesselFindings.filter((finding) => finding.major && finding.mentioned).length;
    const highestVessels = getHighestSeverityVessels(analysis.vesselFindings);

    els.examReadout.textContent = analysis.exam.label || "-";
    els.examNote.textContent =
      majorCoverage > 0
        ? `${majorCoverage} of 4 major coronary territories were explicitly addressed.`
        : analysis.exam.note || "Coronary CTA structure will appear here.";

    els.qualityCardReadout.textContent = analysis.quality.label === "Not stated" ? "Diagnostic" : analysis.quality.label || "-";
    els.qualityCardNote.textContent = analysis.quality.summary || "Image quality cues will appear here.";

    els.patternReadout.textContent = summarizeCoronaryPattern(analysis.cadRads);
    els.patternNote.textContent = highestVessels.length
      ? `Most significant disease involves ${highestVessels.join(", ")}.`
      : "The dominant coronary take-away will appear here.";

    if (analysis.extracardiacFindings.length) {
      els.coverageReadout.textContent = "Addressed";
      els.coverageNote.textContent = analysis.extracardiacFindings.map((entry) => entry.label).join(", ");
    } else {
      els.coverageReadout.textContent = "Auto-normal";
      els.coverageNote.textContent = "The final draft will autofill normal extracardiac wording for the imaged field unless an abnormality is dictated.";
    }
  }

  function renderTable(tbody, rows) {
    const dataRows = Array.isArray(rows) && rows.length ? rows : [{ label: "-", value: "-" }];
    tbody.innerHTML = dataRows
      .map(
        (row) =>
          `<tr><th scope="row">${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`
      )
      .join("");
  }

  function renderVesselTable(vesselFindings) {
    const majorRows = VESSEL_CONFIGS.filter((config) => config.major).map((config) => {
      return vesselFindings.find((finding) => finding.id === config.id) || createEmptyFinding(config);
    });
    const branchRows = vesselFindings.filter((finding) => !finding.major && finding.mentioned);
    const rows = majorRows.concat(branchRows);

    els.vesselTableBody.innerHTML = rows.length
      ? rows
          .map((finding) => {
            const isAutofilledNormal = !finding.mentioned;
            const plaqueText = isAutofilledNormal
              ? "No plaque"
              : finding.plaqueDisplay || (finding.severity?.key === "none" ? "No plaque" : "-");
            const stenosisText = isAutofilledNormal
              ? "0%"
              : finding.stenosisDisplay || (finding.severity?.key === "none" ? "0%" : "Not described");
            const statusText = isAutofilledNormal
              ? "Autofilled normal"
              : finding.statusDisplay || "Not described";
            const noteText = finding.sentences.length
              ? finding.sentences.map(cleanSentence).join(" ")
              : "No abnormal dictation for this vessel; the structured draft defaults to patent without plaque or stenosis.";
            return `
              <tr>
                <td><strong>${escapeHtml(finding.label)}</strong></td>
                <td>${escapeHtml(plaqueText)}</td>
                <td>${escapeHtml(stenosisText)}</td>
                <td>${escapeHtml(statusText)}</td>
                <td>${escapeHtml(noteText)}</td>
              </tr>
            `;
          })
          .join("")
      : '<tr><td colspan="5">Dictate or load a case to build the vessel summary.</td></tr>';
  }

  function renderMissingInfo(missingInfo) {
    if (!missingInfo.length) {
      els.missingInfoList.innerHTML =
        '<p class="empty-note">No high-yield gaps detected from the current dictation.</p>';
      return;
    }

    els.missingInfoList.innerHTML = missingInfo
      .map(
        (item) => `
          <article class="check-item">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.detail)}</span>
          </article>
        `
      )
      .join("");
  }

  function renderSections(sections, missingInfo) {
    els.sectionIndication.value = sections.indication || "";
    els.sectionTechnique.value = sections.technique || "";
    els.sectionQuality.value = sections.quality || "";
    els.sectionCoronary.value = sections.coronary || "";
    els.sectionCardiac.value = sections.cardiac || "";
    els.sectionExtracardiac.value = sections.extracardiac || "";
    els.sectionImpression.value = sections.impression || "";
    els.sectionRecommendations.value = sections.recommendations || "";

    const sectionsWithMissing = new Set(missingInfo.map((item) => item.section).filter(Boolean));
    els.editorFields.forEach((field) => {
      field.classList.toggle("is-missing", sectionsWithMissing.has(field.dataset.sectionField));
    });
  }

  function updateFinalReportFromEditors() {
    const examLabel = state.lastAnalysis?.exam?.reportLabel || EXAM_TYPES[els.examTypeSelect.value]?.reportLabel || "Cardiac CT";
    const sections = [
      ["EXAM", examLabel],
      ["INDICATION", els.sectionIndication.value.trim()],
      ["TECHNIQUE", els.sectionTechnique.value.trim()],
      ["QUALITY", els.sectionQuality.value.trim()],
      ["FINDINGS - CORONARY", els.sectionCoronary.value.trim()],
      ["FINDINGS - NONCORONARY CARDIAC", els.sectionCardiac.value.trim()],
      ["FINDINGS - EXTRACARDIAC", els.sectionExtracardiac.value.trim()],
      ["IMPRESSION", els.sectionImpression.value.trim()],
      ["RECOMMENDATIONS", els.sectionRecommendations.value.trim()],
    ];

    els.finalReportOutput.value = sections
      .map(([heading, body]) => `${heading}\n${body || "Not addressed."}`)
      .join("\n\n");
  }

  async function copyFinalReport() {
    const text = els.finalReportOutput.value;
    if (!text.trim()) {
      setStatus("There is no finished report text to copy yet.", "warning");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setStatus("Finished report copied to the clipboard.");
    } catch (error) {
      els.finalReportOutput.focus();
      els.finalReportOutput.select();
      document.execCommand("copy");
      setStatus("Finished report copied to the clipboard.");
    }
  }

  function detectExamType(normalizedText) {
    const manual = els.examTypeSelect.value;
    if (manual && manual !== "auto" && EXAM_TYPES[manual]) {
      return {
        ...EXAM_TYPES[manual],
        note: "Manual exam type override is active.",
      };
    }

    const scores = {
      coronary_cta: 0,
      cardiac_ct: 0,
      calcium_score: 0,
    };

    if (/coronary cta|coronary ct angiography|\bccta\b|cad-rads/.test(normalizedText)) {
      scores.coronary_cta += 5;
    }
    if (/left main|\blad\b|\blcx\b|\brca\b|circumflex/.test(normalizedText)) {
      scores.coronary_cta += 3;
    }
    if (/calcium score|agatston|coronary calcium|cac score/.test(normalizedText)) {
      scores.calcium_score += 6;
    }
    if (/noncontrast cardiac ct/.test(normalizedText)) {
      scores.calcium_score += 2;
    }
    if (/cardiac ct|tavr|tavi|pulmonary vein|left atrial appendage|aortic root|congenital/.test(normalizedText)) {
      scores.cardiac_ct += 4;
    }

    if (scores.calcium_score > scores.coronary_cta && scores.calcium_score >= scores.cardiac_ct) {
      return {
        ...EXAM_TYPES.calcium_score,
        note: "Detected noncontrast calcium scoring language.",
      };
    }

    if (scores.cardiac_ct > scores.coronary_cta) {
      return {
        ...EXAM_TYPES.cardiac_ct,
        note: "Detected noncoronary cardiac CT language.",
      };
    }

    return {
      ...EXAM_TYPES.coronary_cta,
      note: "Using the coronary CTA template by default for this first HAGRad PointGuard build.",
    };
  }

  function extractIndication(sentences) {
    const manualValue = els.manualIndicationInput.value.trim();
    if (manualValue) {
      return manualValue;
    }

    const leadInPattern = /^(indication|history|clinical indication|reason(?: for exam)?)\s*[:\-]?\s*/;
    for (const sentence of sentences) {
      const focusedIndication = extractFocusedIndication(sentence.raw);
      if (focusedIndication) {
        return focusedIndication;
      }
      if (leadInPattern.test(sentence.normalized)) {
        return cleanSentence(sentence.raw).replace(/^[^.]*?:\s*/i, "").trim();
      }
      if (/chest pain|dyspnea|shortness of breath|palpitations|syncope|cad|risk stratification|follow[- ]?up|rule out|pre[- ]?op/.test(sentence.normalized)) {
        const cleanedSentence = cleanSentence(sentence.raw).replace(leadInPattern, "").trim();
        return extractFocusedIndication(cleanedSentence) || cleanedSentence;
      }
    }

    return null;
  }

  function extractFocusedIndication(value) {
    const normalized = normalizeText(value);
    const patterns = [
      /\b(acute chest pain)\b/,
      /\b(chronic chest pain)\b/,
      /\b(atypical chest pain)\b/,
      /\b(typical chest pain)\b/,
      /\b(stable chest pain)\b/,
      /\b(unstable angina)\b/,
      /\b(chest pain)\b/,
      /\b(shortness of breath)\b/,
      /\b(dyspnea)\b/,
      /\b(palpitations)\b/,
      /\b(syncope)\b/,
      /\b(risk stratification)\b/,
      /\b(known coronary artery disease)\b/,
      /\b(follow[- ]?up)\b/,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) {
        return cleanSentence(capitalize(match[1]));
      }
    }

    const symptomsMatch = normalized.match(/symptoms?\s+of\s+([^.,;]+)/);
    if (symptomsMatch) {
      const symptomText = extractFocusedIndication(symptomsMatch[1]);
      if (symptomText) {
        return symptomText;
      }
    }

    return "";
  }

  function detectPresentationContext(indication, rawText) {
    const manualValue = els.manualPresentationSelect?.value || "auto";
    if (manualValue && manualValue !== "auto" && PRESENTATION_CONTEXTS[manualValue]) {
      return PRESENTATION_CONTEXTS[manualValue];
    }

    const normalized = normalizeText([indication, rawText].filter(Boolean).join(" "));
    if (!normalized) {
      return {
        ...PRESENTATION_CONTEXTS.general,
        note: "No explicit stable-chest-pain or acute-chest-pain pathway was detected.",
      };
    }

    if (/\bacute chest pain\b|\bacs\b|acute coronary syndrome|unstable angina|troponin|\bstemi\b|\bnstemi\b|\bed\b|emergency department|emergency room|\ber\b|rule out acs|rule out mi/.test(normalized)) {
      return {
        ...PRESENTATION_CONTEXTS.acute_chest_pain,
        note: "Acute chest pain / ACS wording was detected in the indication or dictated text.",
      };
    }

    if (/stable chest pain|atypical chest pain|typical chest pain|chronic chest pain|outpatient chest pain/.test(normalized)) {
      return {
        ...PRESENTATION_CONTEXTS.stable_chest_pain,
        note: "Stable chest pain wording was detected in the indication or dictated text.",
      };
    }

    if (/\bchest pain\b/.test(normalized)) {
      return {
        ...PRESENTATION_CONTEXTS.stable_chest_pain,
        note: "Chest-pain wording without acute markers defaults to the stable-chest-pain CAD-RADS pathway.",
      };
    }

    return {
      ...PRESENTATION_CONTEXTS.general,
      note: "No explicit stable-chest-pain or acute-chest-pain pathway was detected.",
    };
  }

  function extractCalciumScore(sentences) {
    const manualValue = parseNumber(els.manualCalciumScoreInput.value);
    if (manualValue != null) {
      return manualValue;
    }

    const fullText = sentences.map((sentence) => sentence.raw).join(" ");
    const match = fullText.match(/(?:agatston|calcium score|cac score)\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)/i);
    return match ? Number.parseFloat(match[1]) : null;
  }

  function extractCalciumBreakdown(sentences) {
    const breakdown = [];
    const vesselPatterns = [
      { label: "Left main", pattern: /(?:left main|lm)\s*(?:score|agatston)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i },
      { label: "LAD", pattern: /(?:\blad\b|left anterior descending)\s*(?:score|agatston)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i },
      { label: "LCx", pattern: /(?:\blcx\b|left circumflex|circumflex)\s*(?:score|agatston)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i },
      { label: "RCA", pattern: /(?:\brca\b|right coronary)\s*(?:score|agatston)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i },
    ];

    sentences
      .filter((sentence) => /agatston|calcium score|calcium scoring|cac score|noncontrast cardiac ct/.test(sentence.normalized))
      .forEach((sentence) => {
        vesselPatterns.forEach((entry) => {
          const match = sentence.raw.match(entry.pattern);
          if (!match) {
            return;
          }
          breakdown.push({
            label: entry.label,
            value: Number.parseFloat(match[1]),
          });
        });
      });

    return breakdown.filter((entry, index, array) => {
      return array.findIndex((candidate) => candidate.label === entry.label) === index;
    });
  }

  function extractHeartRate(sentences) {
    const manualValue = parseNumber(els.manualHeartRateInput.value);
    if (manualValue != null) {
      return manualValue;
    }

    const fullText = sentences.map((sentence) => sentence.raw).join(" ");
    const match = fullText.match(/(?:heart rate|hr)\s*(?:was|of|:)?\s*(\d{2,3})/i) || fullText.match(/(\d{2,3})\s*bpm/i);
    return match ? Number.parseInt(match[1], 10) : null;
  }

  function extractDominance(normalizedText) {
    if (/co[- ]?dominant|balanced dominance/.test(normalizedText)) {
      return "Co-dominant";
    }
    if (/left dominant/.test(normalizedText)) {
      return "Left dominant";
    }
    if (/right dominant/.test(normalizedText)) {
      return "Right dominant";
    }
    return null;
  }

  function extractQuality(sentences) {
    const quality = {
      label: "Not stated",
      summary: "Image quality was not specifically addressed in the dictated text.",
      explicit: false,
      limited: false,
      nondiagnostic: false,
      diagnosticDeclared: false,
      issues: [],
    };

    sentences.forEach((sentence) => {
      const text = sentence.normalized;
      if (/non[- ]diagnostic|nondiagnostic|cannot be evaluated|unassessable|non evaluable/.test(text)) {
        quality.explicit = true;
        quality.nondiagnostic = true;
      }
      if (/limited|suboptimal|motion artifact|blooming|noise|poor opacification|stair step/.test(text)) {
        quality.explicit = true;
        quality.limited = true;
      }
      if (/diagnostic|excellent quality|good quality|adequate quality/.test(text)) {
        quality.explicit = true;
        quality.diagnosticDeclared = true;
      }
      if (/motion artifact/.test(text)) {
        quality.issues.push("motion artifact");
      }
      if (/blooming/.test(text)) {
        quality.issues.push("calcific blooming");
      }
      if (/poor opacification|low contrast/.test(text)) {
        quality.issues.push("reduced contrast opacification");
      }
      if (/noise/.test(text)) {
        quality.issues.push("image noise");
      }
    });

    const uniqueIssues = uniqueStrings(quality.issues);
    quality.issues = uniqueIssues;

    if (quality.nondiagnostic) {
      quality.label = "Non-diagnostic";
      quality.summary = uniqueIssues.length
        ? `Nondiagnostic or unassessable segments were described, with ${uniqueIssues.join(", ")} noted.`
        : "Nondiagnostic or unassessable coronary segments were described.";
      return quality;
    }

    if (quality.limited && quality.diagnosticDeclared) {
      quality.label = "Limited but diagnostic";
      quality.summary = uniqueIssues.length
        ? `The study was described as diagnostic but limited by ${uniqueIssues.join(", ")}.`
        : "The study was described as diagnostic but limited.";
      return quality;
    }

    if (quality.limited) {
      quality.label = "Limited";
      quality.summary = uniqueIssues.length
        ? `The study was described as limited by ${uniqueIssues.join(", ")}.`
        : "The study was described as limited.";
      return quality;
    }

    if (quality.explicit) {
      quality.label = "Diagnostic";
      quality.summary = "The dictated text explicitly described diagnostic image quality.";
    }

    return quality;
  }

  function collectVesselFindings(sentences) {
    const findings = VESSEL_CONFIGS.map((config) => createEmptyFinding(config));

    sentences.forEach((sentence) => {
      const segmentMentions = extractScctSegmentMentions(sentence.normalized);
      findings.forEach((finding) => {
        const matchedSegments = segmentMentions.filter((entry) => entry.vesselId === finding.id);
        if (!finding.patterns.some((pattern) => pattern.test(sentence.normalized)) && !matchedSegments.length) {
          return;
        }

        finding.mentioned = true;
        finding.sentences.push(sentence.raw);
        matchedSegments.forEach((entry) => finding.segmentMentions.push(entry));

        const severity = extractStenosisDetail(sentence.normalized);
        finding.severity = mergeSeverity(finding.severity, severity);

        const plaqueDescriptors = extractPlaqueDescriptors(sentence.normalized);
        plaqueDescriptors.forEach((descriptor) => finding.plaqueDescriptors.add(descriptor));

        if (/non[- ]diagnostic|nondiagnostic|cannot be evaluated|unassessable|non evaluable/.test(sentence.normalized)) {
          finding.nondiagnostic = true;
        }

        if (/stent/.test(sentence.normalized)) {
          finding.stent = true;
        }

        if (/graft|cabg|bypass/.test(sentence.normalized)) {
          finding.graft = true;
        }

        extractHrpFeatures(sentence.normalized).forEach((feature) => finding.hrpFeatures.add(feature));
      });
    });

    return findings.map(finalizeFinding);
  }

  function createEmptyFinding(config) {
    return {
      id: config.id,
      label: config.label,
      shortLabel: config.shortLabel,
      major: config.major,
      patterns: config.patterns,
      mentioned: false,
      severity: null,
      plaqueDescriptors: new Set(),
      plaqueDisplay: "",
      stenosisDisplay: "",
      statusDisplay: "",
      sentences: [],
      nondiagnostic: false,
      stent: false,
      graft: false,
      hrpFeatures: new Set(),
      segmentMentions: [],
    };
  }

  function finalizeFinding(finding) {
    const plaqueDescriptors = normalizePlaqueDescriptors(Array.from(finding.plaqueDescriptors));
    const hrpFeatures = Array.from(finding.hrpFeatures);
    const segmentMentions = uniqueSegmentMentions(finding.segmentMentions);
    const status = [];

    if (finding.nondiagnostic) {
      status.push("Non-diagnostic");
    }
    if (finding.stent) {
      status.push("Stent");
    }
    if (finding.graft) {
      status.push("Graft");
    }
    if (!status.length && finding.mentioned && finding.severity?.key === "none") {
      status.push("Patent");
    }
    if (!status.length && finding.mentioned) {
      status.push("Mentioned");
    }

    return {
      ...finding,
      plaqueDescriptors,
      hrpFeatures,
      segmentMentions,
      plaqueDisplay: plaqueDescriptors.join(", "),
      stenosisDisplay: finding.severity ? finding.severity.rangeText : "",
      statusDisplay: status.join(", "),
      sentences: uniqueStrings(finding.sentences),
    };
  }

  function extractStenosisDetail(normalizedSentence) {
    const explicitRangeMatch = normalizedSentence.match(/(\d{1,3})\s*(?:%|percent)?\s*(?:to|-|–)\s*(\d{1,3})\s*(?:%|percent)?/);
    if (explicitRangeMatch) {
      return mapPercentRange(Number.parseInt(explicitRangeMatch[1], 10), Number.parseInt(explicitRangeMatch[2], 10), true);
    }

    const explicitPercentMatch = normalizedSentence.match(/(\d{1,3})\s*(?:%|percent)/);
    if (explicitPercentMatch) {
      return mapSinglePercent(Number.parseInt(explicitPercentMatch[1], 10), true);
    }

    if (/total occlusion|totally occluded|complete occlusion|100% occlusion|occluded\b/.test(normalizedSentence)) {
      return cloneSeverity(STENOSIS_LIBRARY.occluded, true);
    }

    if (/subtotal|near occlusion|near-occlusion/.test(normalizedSentence)) {
      return cloneSeverity(STENOSIS_LIBRARY.severe, false);
    }

    if (/severe|high[- ]grade|critical/.test(normalizedSentence)) {
      return cloneSeverity(STENOSIS_LIBRARY.severe, false);
    }

    if (/moderate/.test(normalizedSentence)) {
      return cloneSeverity(STENOSIS_LIBRARY.moderate, false);
    }

    if (/mild/.test(normalizedSentence)) {
      return cloneSeverity(STENOSIS_LIBRARY.mild, false);
    }

    if (/minimal|trace/.test(normalizedSentence)) {
      return cloneSeverity(STENOSIS_LIBRARY.minimal, false);
    }

    if (/no significant stenosis/.test(normalizedSentence)) {
      return cloneSeverity(STENOSIS_LIBRARY.nonobstructive, false);
    }

    if (/without plaque or stenosis|no plaque or stenosis|no stenosis|widely patent|patent\b|normal coronary/.test(normalizedSentence)) {
      return cloneSeverity(STENOSIS_LIBRARY.none, false);
    }

    return null;
  }

  function mergeSeverity(current, next) {
    if (!next) {
      return current;
    }
    if (!current) {
      return next;
    }
    return next.rank > current.rank ? next : current;
  }

  function extractPlaqueDescriptors(normalizedSentence) {
    const descriptors = [];
    const hasNoncalcifiedPlaque = /non[- ]?calcified plaque/.test(normalizedSentence);
    const hasStandaloneCalcified = /\bcalcified\b/.test(normalizedSentence) || /\bcalcific\b/.test(normalizedSentence);
    const hasMixedPlaque =
      /mixed plaque|mixed calcified plaque|mixed calcified and noncalcified plaque|partially calcified plaque/.test(
        normalizedSentence
      ) ||
      (((/\bmixed\b/.test(normalizedSentence) && /calcified plaque/.test(normalizedSentence)) ||
        (hasStandaloneCalcified && /non[- ]?calcified/.test(normalizedSentence))) &&
        /\bplaque\b/.test(normalizedSentence));

    if (hasMixedPlaque) {
      descriptors.push("Mixed plaque");
    }
    if (hasNoncalcifiedPlaque) {
      descriptors.push("Noncalcified plaque");
    }
    if (!hasNoncalcifiedPlaque && /calcified plaque|calcific plaque/.test(normalizedSentence)) {
      descriptors.push("Calcified plaque");
    }
    if (/low attenuation plaque/.test(normalizedSentence)) {
      descriptors.push("Low-attenuation plaque");
    }
    if (!descriptors.length && /\bplaque\b/.test(normalizedSentence)) {
      descriptors.push("Plaque");
    }
    return uniqueStrings(descriptors);
  }

  function extractScctSegmentMentions(normalizedSentence) {
    const mentions = [];
    const segmentPattern = /\b(?:scct\s+)?(?:segment|seg(?:ment)?\.?)\s*(\d{1,2})\b/g;
    let match = segmentPattern.exec(normalizedSentence);

    while (match) {
      const segment = SCCT_SEGMENT_MAP[match[1]];
      if (segment) {
        mentions.push(segment);
      }
      match = segmentPattern.exec(normalizedSentence);
    }

    SCCT_SEGMENT_ALIAS_PATTERNS.forEach((entry) => {
      if (entry.pattern.test(normalizedSentence) && SCCT_SEGMENT_MAP[entry.segmentNumber]) {
        mentions.push(SCCT_SEGMENT_MAP[entry.segmentNumber]);
      }
    });

    return uniqueSegmentMentions(mentions);
  }

  function uniqueSegmentMentions(entries) {
    return entries.filter((entry, index, array) => {
      return array.findIndex((candidate) => candidate.number === entry.number && candidate.vesselId === entry.vesselId) === index;
    });
  }

  function normalizePlaqueDescriptors(descriptors) {
    const uniqueDescriptors = uniqueStrings(descriptors);
    if (!uniqueDescriptors.includes("Mixed plaque")) {
      return uniqueDescriptors;
    }
    return uniqueDescriptors.filter((descriptor) => descriptor !== "Calcified plaque" && descriptor !== "Noncalcified plaque");
  }

  function extractHrpFeatures(normalizedSentence) {
    const features = [];
    if (/low attenuation plaque|low-attenuation plaque/.test(normalizedSentence)) {
      features.push("low-attenuation plaque");
    }
    if (/positive remodell?ing/.test(normalizedSentence)) {
      features.push("positive remodeling");
    }
    if (/napkin[- ]ring/.test(normalizedSentence)) {
      features.push("napkin-ring sign");
    }
    if (/spotty calcif/.test(normalizedSentence)) {
      features.push("spotty calcification");
    }
    return uniqueStrings(features);
  }

  function collectTopicFindings(sentences, topics) {
    return topics
      .map((topic) => {
        const matched = sentences.flatMap((sentence) => extractTopicHighlights(topic, sentence));
        return {
          label: topic.label,
          sentences: uniqueStrings(matched),
        };
      })
      .filter((entry) => entry.sentences.length);
  }

  function extractTopicHighlights(topic, sentence) {
    if (!topic || !sentence) {
      return [];
    }

    const structuredHighlights = extractStructuredTopicHighlights(topic.label, sentence.raw, sentence.normalized);
    if (structuredHighlights.length) {
      return structuredHighlights;
    }

    if (!topic.patterns.some((pattern) => pattern.test(sentence.normalized))) {
      return [];
    }

    const clauseHighlights = extractRelevantTopicClauses(sentence.raw, topic.patterns);
    if (clauseHighlights.length) {
      return clauseHighlights;
    }

    return isReportReadyClause(sentence.raw) ? [cleanSentence(sentence.raw)] : [];
  }

  function extractStructuredTopicHighlights(label, rawText, normalizedText) {
    if (label === "Lungs / pleura") {
      const pleuralEffusion = extractPleuralEffusionHighlight(normalizedText);
      if (pleuralEffusion) {
        return [pleuralEffusion];
      }
    }

    if (label === "Upper abdomen") {
      const upperAbdomenFinding = /abdomen|upper abdomen|liver|hepatic|segment\s+(?:[ivx]+|\d+|one|two|three|four|five|six|seven|eight)\b/i.test(
        normalizedText
      )
        ? extractUpperAbdomenHighlight(normalizedText)
        : "";
      if (upperAbdomenFinding) {
        return [upperAbdomenFinding];
      }
    }

    return [];
  }

  function extractRelevantTopicClauses(rawText, patterns) {
    const clauses = splitIntoClauses(rawText);
    const matchedClauses = clauses.filter((clause) => {
      const normalizedClause = normalizeText(clause);
      return patterns.some((pattern) => pattern.test(normalizedClause)) && isReportReadyClause(clause);
    });

    if (matchedClauses.length) {
      return matchedClauses.map((clause) => cleanSentence(clause));
    }

    return [];
  }

  function splitIntoClauses(value) {
    return String(value || "")
      .split(/\s*(?:,|;|\balthough\b|\bhowever\b|\bbut\b)\s*/i)
      .flatMap((chunk) => chunk.split(/\s+\band\s+/i))
      .map((chunk) => chunk.trim())
      .filter(Boolean);
  }

  function isReportReadyClause(value) {
    const normalized = normalizeText(value);
    if (!normalized) {
      return false;
    }
    if (DICTATION_NOISE_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return false;
    }
    return true;
  }

  function extractPleuralEffusionHighlight(normalizedText) {
    if (!/pleural effusion/.test(normalizedText)) {
      return "";
    }

    const sizeDescriptor = /\bsmall\b/.test(normalizedText)
      ? "Small"
      : /\bmoderate\b/.test(normalizedText)
        ? "Moderate"
        : /\blarge\b/.test(normalizedText)
          ? "Large"
          : "Pleural effusions";
    const thicknessMatch = normalizedText.match(/(\d+(?:\.\d+)?)\s*cm/);
    const bilateral = /\bbilateral(?:ly)?\b|both sides/.test(normalizedText);
    const rightGreater =
      /\bright[^.]{0,30}(?:greater|more)\s+than\s+left\b/.test(normalizedText) ||
      /\bmore in the right side than the left\b/.test(normalizedText);
    const leftGreater = /\bleft[^.]{0,30}(?:greater|more)\s+than\s+right\b/.test(normalizedText);
    const rightOnly = /\bright\b/.test(normalizedText) && !bilateral;
    const leftOnly = /\bleft\b/.test(normalizedText) && !bilateral;
    const laterality = bilateral
      ? rightGreater
        ? "bilaterally, greater on the right"
        : leftGreater
          ? "bilaterally, greater on the left"
          : "bilaterally"
      : rightOnly
        ? "on the right"
        : leftOnly
          ? "on the left"
          : "";
    const baseText =
      sizeDescriptor === "Pleural effusions"
        ? `Pleural effusions${laterality ? ` ${laterality}` : ""}`
        : `${sizeDescriptor} pleural effusions${laterality ? ` ${laterality}` : ""}`;

    if (thicknessMatch) {
      return cleanSentence(`${baseText}, measuring up to ${thicknessMatch[1]} cm in thickness`);
    }

    return cleanSentence(baseText);
  }

  function extractUpperAbdomenHighlight(normalizedText) {
    if (!/cystic lesion|cyst/.test(normalizedText)) {
      return "";
    }

    const segmentMatch = normalizedText.match(/segment\s+([ivx]+|\d+|one|two|three|four|five|six|seven|eight)\b/i);
    const segmentLabel = segmentMatch ? formatHepaticSegmentLabel(segmentMatch[1]) : "";
    const location =
      /liver|hepatic/.test(normalizedText) || segmentLabel
        ? `hepatic ${segmentLabel || "lesion"}`
        : "upper abdominal lesion";
    const descriptor = /cystic lesion/.test(normalizedText) ? "cystic lesion" : "cyst";
    const partiallyImaged = /partial|partially/.test(normalizedText) ? "Partially imaged " : "";

    if (segmentLabel) {
      return cleanSentence(`${partiallyImaged}${descriptor} in hepatic ${segmentLabel}`);
    }

    return cleanSentence(`${partiallyImaged}${descriptor} in the upper abdomen`);
  }

  function formatHepaticSegmentLabel(value) {
    const normalized = normalizeText(value);
    if (SEGMENT_WORD_NUMBERS[normalized]) {
      return `segment ${SEGMENT_WORD_NUMBERS[normalized]}`;
    }
    if (/^\d+$/.test(normalized)) {
      const numericMap = {
        "1": "I",
        "2": "II",
        "3": "III",
        "4": "IV",
        "5": "V",
        "6": "VI",
        "7": "VII",
        "8": "VIII",
      };
      return `segment ${numericMap[normalized] || normalized}`;
    }
    if (/^[ivx]+$/i.test(value)) {
      return `segment ${String(value).toUpperCase()}`;
    }
    return "";
  }

  function derivePlaqueBurden(normalizedText, vesselFindings, calciumScore) {
    const explicitMatch = normalizedText.match(/\bp([1-4])\b/);
    if (explicitMatch) {
      return buildPlaqueBurden(`P${explicitMatch[1]}`, "Explicitly stated in the dictated text.");
    }

    const scoreBasedBurden = derivePlaqueBurdenFromCalciumScore(calciumScore);
    const descriptorBasedBurden = derivePlaqueBurdenFromText(normalizedText);
    const dominantCalciumBurden = chooseHigherPlaqueBurden(scoreBasedBurden, descriptorBasedBurden);
    if (dominantCalciumBurden) {
      return dominantCalciumBurden;
    }

    const plaqueVessels = vesselFindings.filter((finding) => finding.plaqueDescriptors.length || (finding.severity && finding.severity.rank > 0));
    const severeVessels = plaqueVessels.filter((finding) => finding.severity && finding.severity.rank >= STENOSIS_LIBRARY.severe.rank).length;
    const moderateOrMore = plaqueVessels.filter((finding) => finding.severity && finding.severity.rank >= STENOSIS_LIBRARY.moderate.rank).length;

    if (!plaqueVessels.length) {
      return {
        score: null,
        label: "Not assigned",
        display: "Not assigned",
        source: "",
      };
    }

    if (plaqueVessels.length >= 4 || (plaqueVessels.length >= 3 && severeVessels >= 1)) {
      return buildPlaqueBurden("P4", "Inferred from diffuse multivessel plaque involvement.");
    }

    if (severeVessels >= 1 || plaqueVessels.length >= 3) {
      return buildPlaqueBurden("P3", "Inferred from multivessel or severe plaque involvement.");
    }

    if (moderateOrMore >= 1 || plaqueVessels.length >= 2) {
      return buildPlaqueBurden("P2", "Inferred from more than mild focal plaque burden.");
    }

    return buildPlaqueBurden("P1", "Inferred from limited plaque involvement.");
  }

  function derivePlaqueBurdenFromCalciumScore(calciumScore) {
    if (calciumScore == null) {
      return null;
    }
    if (calciumScore <= 0) {
      return {
        score: null,
        label: "No plaque burden descriptor",
        display: "None stated",
        source: "Coronary calcium score is zero.",
      };
    }
    if (calciumScore <= 100) {
      return buildPlaqueBurden("P1", `Derived from Agatston score ${formatNumber(calciumScore)}.`);
    }
    if (calciumScore <= 300) {
      return buildPlaqueBurden("P2", `Derived from Agatston score ${formatNumber(calciumScore)}.`);
    }
    if (calciumScore <= 999) {
      return buildPlaqueBurden("P3", `Derived from Agatston score ${formatNumber(calciumScore)}.`);
    }
    return buildPlaqueBurden("P4", `Derived from Agatston score ${formatNumber(calciumScore)}.`);
  }

  function derivePlaqueBurdenFromText(normalizedText) {
    if (/agatston|calcium score|cac score|coronary calcium|plaque burden|calcified plaque burden|coronary calcification/.test(normalizedText)) {
      if (/extensive plaque burden|extensive calcified coronary plaque burden|extensive calcified plaque burden|extensive coronary calcification|extensive coronary calcium|agatston score(?:\s+is)?\s+extensive|calcium score(?:\s+is)?\s+extensive|diffuse extensive plaque/.test(normalizedText)) {
        return buildPlaqueBurden("P4", "Inferred from explicit extensive calcium or plaque-burden wording.");
      }
      if (/severe plaque burden|severe coronary calcification|severe coronary calcium|agatston score(?:\s+is)?\s+severe/.test(normalizedText)) {
        return buildPlaqueBurden("P3", "Inferred from explicit severe calcium or plaque-burden wording.");
      }
      if (/moderate plaque burden|moderate coronary calcification|moderate coronary calcium/.test(normalizedText)) {
        return buildPlaqueBurden("P2", "Inferred from explicit moderate calcium or plaque-burden wording.");
      }
      if (/mild plaque burden|mild coronary calcification|mild coronary calcium/.test(normalizedText)) {
        return buildPlaqueBurden("P1", "Inferred from explicit mild calcium or plaque-burden wording.");
      }
    }

    return null;
  }

  function chooseHigherPlaqueBurden(first, second) {
    if (!first) {
      return second;
    }
    if (!second) {
      return first;
    }
    if (!first.score) {
      return second;
    }
    if (!second.score) {
      return first;
    }

    const order = { P1: 1, P2: 2, P3: 3, P4: 4 };
    return (order[second.score] || 0) > (order[first.score] || 0) ? second : first;
  }

  function buildPlaqueBurden(score, source) {
    const labels = {
      P1: "Mild",
      P2: "Moderate",
      P3: "Severe",
      P4: "Extensive",
    };

    return {
      score,
      label: labels[score],
      display: `${score} (${labels[score]})`,
      source,
    };
  }

  function extractModifiers(normalizedText, vesselFindings, quality) {
    const hrpFeatures = uniqueStrings(
      vesselFindings.flatMap((finding) => finding.hrpFeatures).concat(extractHrpFeatures(normalizedText))
    );
    const hasStent = /stent/.test(normalizedText) || vesselFindings.some((finding) => finding.stent);
    const hasGraft = /graft|cabg|bypass/.test(normalizedText) || vesselFindings.some((finding) => finding.graft);
    const exceptions = [];

    if (/anomalous origin|anomalous coronary/.test(normalizedText)) {
      exceptions.push("anomalous coronary origin");
    }
    if (/dissection/.test(normalizedText)) {
      exceptions.push("coronary dissection");
    }
    if (/pseudoaneurysm|aneurysm/.test(normalizedText)) {
      exceptions.push("coronary aneurysm");
    }
    if (/vasculitis/.test(normalizedText)) {
      exceptions.push("vasculitis");
    }
    if (/fistula/.test(normalizedText)) {
      exceptions.push("coronary fistula");
    }
    if (/extrinsic compression/.test(normalizedText)) {
      exceptions.push("extrinsic compression");
    }

    let ischemia = null;
    if (/ffr-?ct|ct-ffr|ct perfusion|\bctp\b/.test(normalizedText)) {
      if (/positive|ischemia present|hemodynamically significant/.test(normalizedText)) {
        ischemia = "I+";
      } else if (/negative|no ischemia/.test(normalizedText)) {
        ischemia = "I-";
      } else if (/indeterminate|equivocal/.test(normalizedText)) {
        ischemia = "I+/-";
      }
    }

    const hasHrp = hrpFeatures.length >= 2;
    const nonDiagnostic = quality.nondiagnostic || vesselFindings.some((finding) => finding.nondiagnostic);
    const displayParts = [];
    if (hasHrp) {
      displayParts.push("HRP");
    }
    if (ischemia) {
      displayParts.push(ischemia);
    }
    if (hasStent) {
      displayParts.push("S");
    }
    if (hasGraft) {
      displayParts.push("G");
    }
    if (exceptions.length) {
      displayParts.push("E");
    }
    if (nonDiagnostic) {
      displayParts.push("N");
    }

    return {
      hrpFeatures,
      hasHrp,
      hasStent,
      hasGraft,
      ischemia,
      exceptions: uniqueStrings(exceptions),
      nonDiagnostic,
      display: displayParts.length ? displayParts.join(", ") : "-",
    };
  }

  function deriveCadRads(exam, normalizedText, vesselFindings, plaqueBurden, modifiers) {
    const findingsWithDisease = vesselFindings.filter((finding) => finding.mentioned && finding.severity);
    const allMentioned = vesselFindings.filter((finding) => finding.mentioned);
    const majorMentioned = allMentioned.filter((finding) => finding.major);
    const maximum = findingsWithDisease.reduce((best, finding) => {
      return !best || finding.severity.rank > best.severity.rank ? finding : best;
    }, null);

    if (exam.id === "calcium_score" && !findingsWithDisease.length) {
      return {
        label: "CAD-RADS not applied",
        summary: "Calcium score CT alone does not support stenosis-based CAD-RADS assignment without coronary CTA findings.",
        tone: "neutral",
        confidence: "Not applicable",
      };
    }

    if (!allMentioned.length && !/normal coronaries|no plaque or stenosis|no coronary disease/.test(normalizedText)) {
      return {
        label: "CAD-RADS pending",
        summary: "The dictated text does not yet describe enough coronary artery detail for a CAD-RADS assignment.",
        tone: "neutral",
        confidence: "Need more vessel detail",
      };
    }

    const leftMainFinding = vesselFindings.find((finding) => finding.id === "left_main");
    const leftMainObstructive = Boolean(leftMainFinding?.severity && leftMainFinding.severity.maxPercent >= 50);
    const obstructiveMajorVessels = vesselFindings.filter(
      (finding) => finding.major && finding.severity && finding.severity.maxPercent >= 70
    ).length;
    const ambiguousNonobstructiveOnly =
      findingsWithDisease.length > 0 &&
      findingsWithDisease.every((finding) => finding.severity.ambiguous || finding.severity.key === "none");

    if (ambiguousNonobstructiveOnly) {
      const label = modifiers.nonDiagnostic ? "CAD-RADS N" : "CAD-RADS pending";
      return {
        label,
        summary:
          "Coronary disease is described as nonobstructive, but the dictated text does not distinguish minimal from mild stenosis well enough for CAD-RADS 1 versus 2.",
        tone: modifiers.nonDiagnostic ? "caution" : "neutral",
        confidence: "Needs more stenosis detail",
      };
    }

    let baseCategory = null;
    if (/no plaque or stenosis|normal coronaries|no coronary disease/.test(normalizedText) && !findingsWithDisease.length) {
      baseCategory = "0";
    } else if (maximum?.severity?.key === "occluded") {
      baseCategory = "5";
    } else if (leftMainObstructive || obstructiveMajorVessels >= 3) {
      baseCategory = "4B";
    } else if (findingsWithDisease.some((finding) => finding.severity.maxPercent >= 70)) {
      baseCategory = "4A";
    } else if (findingsWithDisease.some((finding) => finding.severity.maxPercent >= 50)) {
      baseCategory = "3";
    } else if (findingsWithDisease.some((finding) => finding.severity.maxPercent >= 25)) {
      baseCategory = "2";
    } else if (
      findingsWithDisease.some((finding) => finding.severity.maxPercent >= 1) ||
      findingsWithDisease.some((finding) => finding.plaqueDescriptors.length) ||
      /positive remodell?ing/.test(normalizedText)
    ) {
      baseCategory = "1";
    } else if (majorMentioned.length >= 4) {
      baseCategory = "0";
    }

    if (!baseCategory) {
      return {
        label: "CAD-RADS pending",
        summary: "Coronary CTA wording is present, but the current dictated text still needs clearer stenosis detail.",
        tone: "neutral",
        confidence: "Need more vessel detail",
      };
    }

    const trailingModifiers = [];
    if (modifiers.hasHrp) {
      trailingModifiers.push("HRP");
    }
    if (modifiers.ischemia) {
      trailingModifiers.push(modifiers.ischemia);
    }
    if (modifiers.hasStent) {
      trailingModifiers.push("S");
    }
    if (modifiers.hasGraft) {
      trailingModifiers.push("G");
    }
    if (modifiers.exceptions.length) {
      trailingModifiers.push("E");
    }

    let label = `CAD-RADS ${baseCategory}`;
    let confidence = "Inferred from coronary descriptors";

    if (plaqueBurden.score) {
      label += `/${plaqueBurden.score}`;
    }

    if (modifiers.nonDiagnostic) {
      if (baseCategory === "0" || baseCategory === "1" || baseCategory === "2") {
        label = "CAD-RADS N";
        if (plaqueBurden.score) {
          label += `/${plaqueBurden.score}`;
        }
      } else {
        label += "/N";
      }
    }

    if (trailingModifiers.length) {
      label += `/${trailingModifiers.join("/")}`;
    }

    if (findingsWithDisease.some((finding) => finding.severity.explicit)) {
      confidence = "Driven by explicit percent stenosis";
    }
    if (majorMentioned.length === 4 && findingsWithDisease.every((finding) => finding.severity && !finding.severity.ambiguous)) {
      confidence = `Strong coverage (${majorMentioned.length}/4 major territories)`;
    }

    return {
      label,
      summary: buildCadRadsSummary(baseCategory, maximum, plaqueBurden, modifiers),
      tone: mapCadRadsTone(baseCategory, modifiers),
      confidence,
    };
  }

  function buildCadRadsSummary(baseCategory, maximum, plaqueBurden, modifiers) {
    const coreSummary = {
      "0": "No coronary plaque or stenosis identified from the dictated coronary assessment.",
      "1": "Minimal nonobstructive coronary atherosclerosis is described.",
      "2": "Mild nonobstructive coronary atherosclerosis is described.",
      "3": "Moderate coronary stenosis is described.",
      "4A": "Severe obstructive coronary disease is described in one or two vessels.",
      "4B": "Left main and/or multivessel obstructive coronary disease is described.",
      "5": "At least one totally occluded coronary artery is described.",
    }[baseCategory];

    const addOns = [];
    if (maximum && maximum.severity && maximum.severity.rank > 0) {
      addOns.push(`Highest-grade disease is reported in ${describeFindingTerritory(maximum)}.`);
    }
    if (plaqueBurden.score) {
      addOns.push(`${plaqueBurden.display} plaque burden.`);
    }
    if (modifiers.hasHrp) {
      addOns.push(`High-risk plaque features are present (${modifiers.hrpFeatures.join(", ")}).`);
    }
    if (modifiers.nonDiagnostic) {
      addOns.push("At least one coronary segment is described as non-diagnostic or unassessable.");
    }

    return [coreSummary].concat(addOns).join(" ");
  }

  function deriveRecommendation(context) {
    const exam = context.exam || {};
    const cadRadsLabel = context.cadRads?.label || "";
    const baseCategory = extractCadRadsBase(cadRadsLabel);
    const plaqueScore = context.plaqueBurden?.score || "";
    const addOns = [];
    const presentation = context.presentation || PRESENTATION_CONTEXTS.general;

    if (exam.id === "calcium_score") {
      return {
        shortText: "Preventive risk assessment",
        text:
          "Use the coronary calcium score together with the clinical risk profile to guide preventive therapy and cardiovascular risk-factor modification.",
      };
    }

    if (/CAD-RADS pending|not applied/.test(cadRadsLabel)) {
      return {
        shortText: "Need more detail",
        text:
          "Clarify the coronary stenosis severity and study interpretability before a CAD-RADS-driven management recommendation is finalized.",
      };
    }

    let recommendation;
    if (presentation.id === "acute_chest_pain") {
      recommendation = buildAcuteChestPainRecommendation(baseCategory, plaqueScore, context.modifiers);
    } else if (presentation.id === "stable_chest_pain") {
      recommendation = buildStableChestPainRecommendation(baseCategory, plaqueScore);
    } else {
      recommendation = buildGeneralRecommendation(baseCategory, plaqueScore);
    }

    if (context.modifiers?.hasHrp) {
      addOns.push("High-risk plaque features further support aggressive preventive therapy.");
    }

    if (context.plaqueBurden?.score === "P3" || context.plaqueBurden?.score === "P4") {
      addOns.push("The diffuse plaque burden also supports intensive risk-factor modification.");
    }

    if (context.modifiers?.ischemia === "I+") {
      addOns.push("A positive ischemia modifier strengthens the case for invasive coronary angiography, especially if symptoms persist despite guideline-directed medical therapy.");
    }

    return {
      shortText: recommendation.shortText,
      text: [recommendation.text].concat(addOns).join(" "),
    };
  }

  function buildStableChestPainRecommendation(baseCategory, plaqueScore) {
    if (baseCategory === "0") {
      return {
        shortText: "Reassurance",
        text: "Reassurance. Consider non-atherosclerotic causes of symptoms.",
      };
    }

    if (baseCategory === "1" || baseCategory === "2") {
      return {
        shortText: "Preventive therapy",
        text: buildStableNonobstructiveRecommendation(plaqueScore),
      };
    }

    if (baseCategory === "3") {
      return {
        shortText: "Functional assessment",
        text:
          "Consider CT-FFR, CT perfusion, or stress testing. Aggressive risk factor modification and preventive pharmacotherapy should be considered. Other treatments, including anti-anginal therapy, should be considered per guideline-directed care.",
      };
    }

    if (baseCategory === "4A") {
      return {
        shortText: "ICA or functional assessment",
        text:
          "Consider invasive coronary angiography or functional assessment. Aggressive risk factor modification and preventive pharmacotherapy should be considered. Other treatments, including anti-anginal therapy and revascularization options, should be considered per guideline-directed care.",
      };
    }

    if (baseCategory === "4B") {
      return {
        shortText: "ICA favored",
        text:
          "Consider invasive coronary angiography or functional assessment. Aggressive risk factor modification and preventive pharmacotherapy should be considered. Other treatments, including anti-anginal therapy and revascularization options, should be considered per guideline-directed care.",
      };
    }

    if (baseCategory === "5") {
      return {
        shortText: "ICA favored",
        text:
          "Consider invasive coronary angiography, functional assessment, and/or viability assessment. Aggressive risk factor modification and preventive pharmacotherapy should be considered. Other treatments, including anti-anginal therapy and revascularization options, should be considered per guideline-directed care.",
      };
    }

    if (baseCategory === "N") {
      return {
        shortText: "Additional evaluation",
        text: "Additional diagnostic evaluation may be needed because obstructive coronary artery disease cannot be confidently excluded from the current study.",
      };
    }

    return {
      shortText: "Clinical correlation",
      text: "Correlate the coronary CTA findings with symptoms, clinical risk, and available prior testing before determining the next management step.",
    };
  }

  function buildStableNonobstructiveRecommendation(plaqueScore) {
    if (plaqueScore === "P3" || plaqueScore === "P4") {
      return "Consider non-atherosclerotic causes of symptoms. Aggressive risk factor modification and preventive pharmacotherapy should be considered.";
    }
    if (plaqueScore === "P2") {
      return "Consider non-atherosclerotic causes of symptoms. Risk factor modification and preventive pharmacotherapy should be considered.";
    }
    return "Consider non-atherosclerotic causes of symptoms. Consider risk factor modification and preventive pharmacotherapy.";
  }

  function buildAcuteChestPainRecommendation(baseCategory, plaqueScore, modifiers) {
    if (baseCategory === "0") {
      return {
        shortText: "No further ACS workup",
        text: "No further evaluation of acute coronary syndrome is required. If troponin is positive, consider other sources of increased troponin. Reassurance.",
      };
    }

    if (baseCategory === "1") {
      return {
        shortText: "Outpatient prevention",
        text: `${buildAcuteNonobstructiveAcsLine(plaqueScore)} ${buildAcuteNonobstructiveFollowUp(plaqueScore)}`,
      };
    }

    if (baseCategory === "2") {
      return {
        shortText: "ACS less likely",
        text: `${buildAcuteCadRads2AcsLine(modifiers)} ${buildAcuteNonobstructiveFollowUp(plaqueScore)}`,
      };
    }

    if (baseCategory === "3") {
      return {
        shortText: "Admission or functional assessment",
        text:
          "Consider hospital admission with cardiology consultation. Consider functional assessment. Preventive management, including aggressive preventive pharmacotherapy, should be considered. Other treatments, including anti-anginal therapy, should be considered per guideline-directed care.",
      };
    }

    if (baseCategory === "4A") {
      return {
        shortText: "Admission and ICA consideration",
        text:
          "Hospital admission with cardiology consultation should be considered. Consider invasive coronary angiography or functional assessment. Preventive management, including aggressive preventive pharmacotherapy, should be considered. Other treatments, including anti-anginal therapy and revascularization options, should be considered per guideline-directed care.",
      };
    }

    if (baseCategory === "4B") {
      return {
        shortText: "ICA recommended",
        text:
          "Hospital admission with cardiology consultation should be considered. Invasive coronary angiography is recommended. Preventive management, including aggressive preventive pharmacotherapy, should be considered. Other treatments, including anti-anginal therapy and revascularization options, should be considered per guideline-directed care.",
      };
    }

    if (baseCategory === "5") {
      return {
        shortText: "Expedited ICA",
        text:
          "Hospital admission with cardiology consultation should be considered. Expedited invasive coronary angiography and revascularization should be considered if acute occlusion is suspected. Preventive management, including aggressive preventive pharmacotherapy, should be considered. Other treatments, including anti-anginal therapy and revascularization options, should be considered per guideline-directed care.",
      };
    }

    if (baseCategory === "N") {
      return {
        shortText: "Additional ACS evaluation",
        text: "Acute coronary syndrome cannot be excluded. Additional or alternative evaluation for acute coronary syndrome is needed.",
      };
    }

    return {
      shortText: "Clinical correlation",
      text: "Correlate the coronary CTA findings with symptoms, biomarkers, and clinical risk before determining the next management step.",
    };
  }

  function buildAcuteNonobstructiveAcsLine(plaqueScore) {
    if (plaqueScore === "P3" || plaqueScore === "P4") {
      return "No further evaluation of acute coronary syndrome is required. If troponin is positive, consider other sources of increased troponin.";
    }
    return "No further evaluation of acute coronary syndrome is required. If troponin is positive, consider other sources of increased troponin.";
  }

  function buildAcuteCadRads2AcsLine(modifiers) {
    if (modifiers?.hasHrp) {
      return "No further evaluation of acute coronary syndrome is required. If clinical suspicion of acute coronary syndrome is high, troponin is positive, or high-risk plaque features are present, consider hospital admission with cardiology consultation.";
    }
    return "No further evaluation of acute coronary syndrome is required. If clinical suspicion of acute coronary syndrome is high or troponin is positive, consider hospital admission with cardiology consultation.";
  }

  function buildAcuteNonobstructiveFollowUp(plaqueScore) {
    if (plaqueScore === "P3" || plaqueScore === "P4") {
      return "Referral for outpatient follow-up for aggressive risk factor modification and preventive pharmacotherapy should be considered.";
    }
    return "Referral for outpatient follow-up for risk factor modification and preventive pharmacotherapy should be considered.";
  }

  function buildGeneralRecommendation(baseCategory, plaqueScore) {
    if (baseCategory === "0") {
      return {
        shortText: "Reassurance",
        text: "No coronary artery disease is identified. Consider non-atherosclerotic causes of symptoms when clinically appropriate.",
      };
    }

    if (baseCategory === "1" || baseCategory === "2") {
      return {
        shortText: "Preventive therapy",
        text:
          plaqueScore === "P3" || plaqueScore === "P4"
            ? "Aggressive risk factor modification and preventive pharmacotherapy should be considered."
            : "Risk factor modification and preventive pharmacotherapy should be considered.",
      };
    }

    if (baseCategory === "3") {
      return {
        shortText: "Functional assessment",
        text: "Consider lesion-specific ischemia assessment such as CT-FFR, CT perfusion, or stress testing together with preventive medical therapy.",
      };
    }

    if (baseCategory === "4A" || baseCategory === "4B" || baseCategory === "5") {
      return {
        shortText: "ICA consideration",
        text: "Consider invasive coronary angiography or additional ischemia assessment, together with aggressive preventive therapy and symptom-directed management.",
      };
    }

    if (baseCategory === "N") {
      return {
        shortText: "Additional evaluation",
        text: "Additional diagnostic evaluation may be needed because obstructive coronary artery disease cannot be confidently excluded from the current study.",
      };
    }

    return {
      shortText: "Clinical correlation",
      text: "Correlate the coronary CTA findings with symptoms, clinical risk, and available prior testing before determining the next management step.",
    };
  }

  function extractCadRadsBase(label) {
    if (/CAD-RADS N/.test(label)) {
      return "N";
    }
    if (/CAD-RADS 4B/.test(label)) {
      return "4B";
    }
    if (/CAD-RADS 4A/.test(label)) {
      return "4A";
    }
    const match = label.match(/CAD-RADS\s+([0-5])/);
    return match ? match[1] : "";
  }

  function buildTechniqueRows(exam, normalizedText, heartRate, calciumScore, calciumBreakdown, quality, modifiers) {
    let acquisition = exam.label;
    if (exam.id === "coronary_cta") {
      acquisition = "Contrast-enhanced coronary CTA";
    } else if (exam.id === "calcium_score") {
      acquisition = "Noncontrast coronary calcium score CT";
    }

    let contrast = "Not stated";
    if (/noncontrast|without contrast/.test(normalizedText)) {
      contrast = "Noncontrast";
    } else if (/contrast/.test(normalizedText) || exam.id === "coronary_cta") {
      contrast = "Contrast-enhanced";
    }

    let gating = "Not stated";
    if (/ecg gated|electrocardiographically gated|prospective gating|retrospective gating/.test(normalizedText)) {
      gating = "ECG-gated";
    } else if (exam.id === "coronary_cta" || exam.id === "calcium_score") {
      gating = "Likely ECG-gated";
    }

    const rows = [
      { label: "Acquisition", value: acquisition },
      { label: "Contrast", value: contrast },
      { label: "ECG gating", value: gating },
      { label: "Heart rate", value: heartRate != null ? `${heartRate} bpm` : "Not provided" },
      { label: "Calcium score", value: calciumScore != null ? formatNumber(calciumScore) : "Not provided" },
      { label: "Image quality", value: quality.label === "Not stated" ? "Diagnostic (autofilled)" : quality.label },
    ];

    if (calciumBreakdown.length) {
      rows.push({
        label: "Calcium breakdown",
        value: calciumBreakdown.map((entry) => `${entry.label} ${formatNumber(entry.value)}`).join(", "),
      });
    }

    if (modifiers.hasStent || modifiers.hasGraft) {
      rows.push({
        label: "Prior hardware",
        value: [modifiers.hasStent ? "Stent" : "", modifiers.hasGraft ? "Graft" : ""].filter(Boolean).join(", "),
      });
    }

    return rows;
  }

  function buildAncillaryRows(coronaryStructureFindings, cardiacFindings, extracardiacFindings) {
    return [
      { label: "Coronary origin / variants", value: coronaryTopicSummary(coronaryStructureFindings) || "Not addressed" },
      { label: "Pericardium", value: getTopicSummary(cardiacFindings, "Pericardium") || "Not addressed" },
      { label: "Aorta", value: getTopicSummary(cardiacFindings, "Aorta") || "Not addressed" },
      { label: "Valves / chambers", value: getCombinedTopicSummary(cardiacFindings, ["Valves", "Chambers"]) || "Not addressed" },
      { label: "Lungs / pleura", value: getTopicSummary(extracardiacFindings, "Lungs / pleura") || "Not addressed" },
      { label: "Upper abdomen", value: getTopicSummary(extracardiacFindings, "Upper abdomen") || "Not addressed" },
      { label: "Chest wall / bones", value: getCombinedTopicSummary(extracardiacFindings, ["Osseous structures"]) || "Not addressed" },
    ];
  }

  function buildMissingInfo(context) {
    const missing = [];

    if (!context.vesselFindings.some((finding) => finding.mentioned) && context.exam.id !== "calcium_score") {
      missing.push({
        title: "Add at least one coronary descriptor",
        detail: "HAGRad PointGuard can autofill the remaining normal structures, but it still needs at least one explicit coronary statement to anchor the report.",
        section: "coronary",
      });
    }

    if (context.modifiers.hasStent && !/patent|restenosis|occluded/.test(normalizeText(context.rawText || ""))) {
      missing.push({
        title: "Clarify stent status",
        detail: "A stent was mentioned, but patency or restenosis severity was not clearly described.",
        section: "coronary",
      });
    }

    if (context.modifiers.hasGraft && !/patent|occluded/.test(normalizeText(context.rawText || ""))) {
      missing.push({
        title: "Clarify graft status",
        detail: "A bypass graft was mentioned, but graft patency and target territory were not clearly described.",
        section: "coronary",
      });
    }

    if (context.exam.id === "coronary_cta" && context.calciumScore == null) {
      missing.push({
        title: "Add calcium score if available",
        detail: "If calcium scoring was performed or available separately, it can support plaque burden assignment.",
        section: "technique",
      });
    }

    if (context.exam.id === "calcium_score" && !context.calciumBreakdown.length) {
      missing.push({
        title: "Add per-vessel calcium subscores",
        detail: "SCCT-style calcium score reporting is stronger when Left main, LAD, LCx, and RCA contributions are listed when available.",
        section: "technique",
      });
    }

    if (/CAD-RADS pending|CAD-RADS N/.test(context.cadRads.label)) {
      missing.push({
        title: "More stenosis detail is needed",
        detail: "The wording is not yet specific enough for a fully confident CAD-RADS-based recommendation.",
        section: "impression",
      });
    }

    return missing;
  }

  function buildSections(context) {
    const coronaryLines = buildCoronarySectionLines(context);
    const cardiacLines = buildCardiacSectionLines(context);
    const extracardiacLines = buildExtracardiacSectionLines(context);

    const techniqueLines = [];
    if (context.exam.id === "coronary_cta") {
      techniqueLines.push("Contrast-enhanced ECG-gated coronary CTA performed.");
    } else if (context.exam.id === "calcium_score") {
      techniqueLines.push("Noncontrast ECG-gated CT performed for coronary calcium scoring.");
    } else {
      techniqueLines.push(`${context.exam.reportLabel} performed.`);
    }
    if (context.heartRate != null) {
      techniqueLines.push(`Reported heart rate ${context.heartRate} bpm.`);
    }
    if (context.calciumScore != null) {
      techniqueLines.push(`Coronary calcium score ${formatNumber(context.calciumScore)}.`);
    }
    if (context.calciumBreakdown.length) {
      techniqueLines.push(
        `Per-vessel calcium distribution: ${context.calciumBreakdown
          .map((entry) => `${entry.label} ${formatNumber(entry.value)}`)
          .join(", ")}.`
      );
    }
    if (context.plaqueBurden.score) {
      techniqueLines.push(`Plaque burden categorized as ${context.plaqueBurden.display}.`);
    }

    const impressionLines = [];
    if (context.cadRads.label && context.cadRads.label !== "CAD-RADS pending" && context.cadRads.label !== "CAD-RADS not applied") {
      impressionLines.push(`${context.cadRads.label}. ${context.cadRads.summary}`);
    } else {
      impressionLines.push(context.cadRads.summary);
    }

    if (context.modifiers.hasHrp) {
      impressionLines.push(`High-risk plaque features: ${context.modifiers.hrpFeatures.join(", ")}.`);
    }

    if (context.vesselFindings.some((finding) => finding.mentioned)) {
      impressionLines.push(buildAdditionalCoronaryImpression(context));
    }

    const significantAncillary = getSignificantAncillaryImpression(context.cardiacFindings, context.extracardiacFindings);
    if (significantAncillary) {
      impressionLines.push(significantAncillary);
    } else {
      impressionLines.push("No additional significant noncoronary cardiac or acute extracardiac abnormality is identified in the imaged field.");
    }

    return {
      indication: context.indication || "Clinical indication was not provided in the dictated input.",
      technique: techniqueLines.join(" "),
      quality: buildQualitySectionText(context.quality, context.vesselFindings),
      coronary: coronaryLines.join("\n"),
      cardiac: cardiacLines.join("\n"),
      extracardiac: extracardiacLines.join("\n"),
      impression: impressionLines.join("\n"),
      recommendations: context.recommendation?.text || "Correlate with the clinical presentation and manage according to the CAD-RADS category.",
    };
  }

  function buildCoronarySectionLines(context) {
    const lines = [];
    if (context.dominance) {
      lines.push(`${context.dominance} coronary circulation.`);
    }

    if (context.coronaryStructureFindings.length) {
      lines.push(`Coronary origin and course: ${coronaryTopicSummary(context.coronaryStructureFindings)}.`);
    } else {
      lines.push("Coronary origins and proximal courses are conventional. No anomalous coronary origin, myocardial bridging, fistula, or coronary aneurysmal change identified.");
    }

    VESSEL_CONFIGS.filter((config) => config.major).forEach((config) => {
      const finding = context.vesselFindings.find((entry) => entry.id === config.id) || createEmptyFinding(config);
      lines.push(`${config.label}: ${describeFindingForReport(finding)}`);
    });

    const branchLines = context.vesselFindings
      .filter((finding) => !finding.major && finding.mentioned)
      .map((finding) => `${getPreferredFindingLabel(finding)}: ${describeFindingForReport(finding)}`);
    if (branchLines.length) {
      lines.push(...branchLines);
    }

    return lines;
  }

  function buildCardiacSectionLines(context) {
    const topicMap = new Map(context.cardiacFindings.map((entry) => [entry.label, entry]));
    return [
      formatTopicLine(topicMap, "Chambers", "Cardiac chamber size is within normal limits on this CT examination."),
      formatTopicLine(topicMap, "Pericardium", "No pericardial effusion or pericardial thickening."),
      formatTopicLine(topicMap, "Aorta", "Thoracic aorta is normal in caliber within the imaged field."),
      formatTopicLine(topicMap, "Valves", "No significant valvular or annular calcification visible on this CT examination."),
      formatTopicLine(topicMap, "Pulmonary arteries", "Main pulmonary arteries are not enlarged in the imaged field."),
      formatTopicLine(topicMap, "Myocardium", "No focal myocardial abnormality is described on the current CT examination."),
    ];
  }

  function buildExtracardiacSectionLines(context) {
    const topicMap = new Map(context.extracardiacFindings.map((entry) => [entry.label, entry]));
    return [
      formatTopicLine(topicMap, "Lungs / pleura", "No focal pulmonary opacity or pleural effusion in the imaged lungs."),
      formatTopicLine(topicMap, "Mediastinum", "No acute mediastinal abnormality in the imaged field."),
      formatTopicLine(topicMap, "Upper abdomen", "No acute upper abdominal abnormality in the imaged field."),
      formatTopicLine(topicMap, "Osseous structures", "No acute osseous or chest wall abnormality in the imaged field."),
    ];
  }

  function formatTopicLine(topicMap, label, defaultText) {
    const entry = topicMap.get(label);
    if (!entry) {
      return `${label}: ${defaultText}`;
    }
    return `${label}: ${entry.sentences.join(" ")}`;
  }

  function getPrimarySegmentMention(finding) {
    return finding?.segmentMentions?.length ? finding.segmentMentions[0] : null;
  }

  function getPreferredFindingLabel(finding) {
    const segmentMention = getPrimarySegmentMention(finding);
    return segmentMention?.reportLabel || finding?.label || "";
  }

  function describeFindingTerritory(finding) {
    const segmentMention = getPrimarySegmentMention(finding);
    if (segmentMention?.reportLabel) {
      return segmentMention.reportLabel;
    }
    const location = extractSegmentQualifier(finding?.sentences?.join(" ") || "");
    return location ? `${location} ${finding.shortLabel}` : finding.label;
  }

  function describeFindingForReport(finding) {
    if (!finding || !finding.mentioned) {
      return "Patent without plaque or stenosis.";
    }

    if (finding.nondiagnostic) {
      return "Nondiagnostic or limited for confident assessment of stenosis.";
    }

    const subject = describeFindingTerritory(finding);
    const plaquePhrase = buildPlaquePhrase(finding);

    if (finding.severity?.key === "none" && !finding.plaqueDescriptors.length) {
      return "Patent without plaque or stenosis.";
    }

    if (finding.severity?.key === "none" && finding.plaqueDescriptors.length) {
      return `${subject} demonstrates ${plaquePhrase} without stenosis.`;
    }

    if (finding.severity?.ambiguous) {
      return `${subject} demonstrates ${plaquePhrase || "atherosclerotic plaque"} with no significant obstructive stenosis (<50%).`;
    }

    if (finding.severity?.key === "minimal" || finding.severity?.key === "mild") {
      return `${subject} demonstrates ${plaquePhrase || "atherosclerotic plaque"} causing ${finding.severity.label.toLowerCase()} (${finding.severity.rangeText}) stenosis.`;
    }

    if (finding.severity?.key === "moderate" || finding.severity?.key === "severe" || finding.severity?.key === "occluded") {
      const details = [`${subject} demonstrates ${plaquePhrase || "atherosclerotic plaque"} causing ${finding.severity.label.toLowerCase()} (${finding.severity.rangeText}) stenosis.`];
      if (finding.hrpFeatures.length) {
        details.push(`Associated high-risk plaque features include ${finding.hrpFeatures.join(", ")}.`);
      }
      if (finding.stent) {
        details.push("A coronary stent is present in this territory.");
      }
      if (finding.graft) {
        details.push("A bypass graft is present in this territory.");
      }
      return details.join(" ");
    }

    if (finding.plaqueDescriptors.length) {
      return `${subject} demonstrates ${plaquePhrase} without clearly quantifiable stenosis in the dictated draft.`;
    }

    return cleanSentence(finding.sentences.join(" "));
  }

  function buildPlaquePhrase(finding) {
    if (!finding.plaqueDescriptors.length) {
      return "";
    }
    if (finding.plaqueDescriptors.includes("Mixed plaque")) {
      return "mixed calcified and noncalcified plaque";
    }
    if (finding.plaqueDescriptors.includes("Calcified plaque")) {
      return "calcified plaque";
    }
    if (finding.plaqueDescriptors.includes("Noncalcified plaque")) {
      return "noncalcified plaque";
    }
    if (finding.plaqueDescriptors.includes("Low-attenuation plaque")) {
      return "low-attenuation plaque";
    }
    return "atherosclerotic plaque";
  }

  function extractSegmentQualifier(text) {
    const normalized = normalizeText(text);
    const segmentMention = getPrimarySegmentMention({ segmentMentions: extractScctSegmentMentions(normalized) });
    if (segmentMention?.qualifier) {
      return segmentMention.qualifier;
    }
    const match = normalized.match(/\b(ostial|proximal|mid|middle|distal)\b/);
    if (!match) {
      return "";
    }
    if (match[1] === "middle") {
      return "Mid";
    }
    return capitalize(match[1]);
  }

  function buildAdditionalCoronaryImpression(context) {
    const mostSevere = context.vesselFindings.reduce((best, finding) => {
      return !best || ((finding.severity?.rank || -1) > (best.severity?.rank || -1)) ? finding : best;
    }, null);

    if (!mostSevere || !mostSevere.mentioned || !mostSevere.severity || mostSevere.severity.rank <= 0) {
      return "No additional coronary plaque or stenosis is identified in the remaining described vessels.";
    }

    const normalTerritories = VESSEL_CONFIGS.filter((config) => config.major)
      .map((config) => context.vesselFindings.find((entry) => entry.id === config.id) || createEmptyFinding(config))
      .filter((finding) => !finding.mentioned || finding.severity?.key === "none" || finding.severity?.ambiguous)
      .map((finding) => finding.label);

    if (!normalTerritories.length) {
      return `Most significant disease is centered in ${describeFindingTerritory(mostSevere)}.`;
    }

    return `No additional plaque or stenosis is identified in the remaining major coronary territories (${normalTerritories.join(", ")}).`;
  }

  function buildQualitySectionText(quality, vesselFindings) {
    const lines = [];
    if (quality.label === "Not stated") {
      lines.push("Diagnostic image quality for coronary interpretation.");
    } else {
      lines.push(`${quality.label} image quality.`);
    }

    if (quality.issues.length) {
      lines.push(`Limiting factors: ${quality.issues.join(", ")}.`);
    } else if (quality.label === "Not stated" || quality.label === "Diagnostic") {
      lines.push("No significant motion, noise, blooming, or contrast limitation identified in the dictated draft.");
    }

    const nondiagnosticVessels = vesselFindings.filter((finding) => finding.nondiagnostic).map((finding) => finding.label);
    if (nondiagnosticVessels.length) {
      lines.push(`Non-diagnostic or unassessable segments involve: ${nondiagnosticVessels.join(", ")}.`);
    }

    return lines.join(" ");
  }

  function getSignificantAncillaryImpression(cardiacFindings, extracardiacFindings) {
    const candidates = cardiacFindings.concat(extracardiacFindings).filter((entry) => {
      const summary = entry.sentences.join(" ").toLowerCase();
      return /aneurysm|ectatic|effusion|nodule|hernia|atelecta|embol|cystic lesion|\bcyst\b/.test(summary);
    });
    if (!candidates.length) {
      return "";
    }
    return candidates.map((entry) => `${entry.label}: ${entry.sentences.join(" ")}`).join("\n");
  }

  function summarizeCoronaryPattern(cadRads) {
    if (!cadRads.label) {
      return "-";
    }
    if (/CAD-RADS 0/.test(cadRads.label)) {
      return "No coronary disease";
    }
    if (/CAD-RADS 1|CAD-RADS 2/.test(cadRads.label)) {
      return "Nonobstructive CAD";
    }
    if (/CAD-RADS 3/.test(cadRads.label)) {
      return "Moderate stenosis";
    }
    if (/CAD-RADS 4A/.test(cadRads.label)) {
      return "Severe focal CAD";
    }
    if (/CAD-RADS 4B/.test(cadRads.label)) {
      return "Left main / multivessel CAD";
    }
    if (/CAD-RADS 5/.test(cadRads.label)) {
      return "Total occlusion";
    }
    if (/CAD-RADS N/.test(cadRads.label)) {
      return "Non-diagnostic study";
    }
    if (/not applied/.test(cadRads.label)) {
      return "Calcium score only";
    }
    return cadRads.label;
  }

  function getHighestSeverityVessels(vesselFindings) {
    const highestRank = vesselFindings.reduce((max, finding) => {
      return finding.severity && finding.severity.rank > max ? finding.severity.rank : max;
    }, -1);

    if (highestRank <= 0) {
      return [];
    }

    return vesselFindings
      .filter((finding) => finding.severity && finding.severity.rank === highestRank)
      .map((finding) => finding.label);
  }

  function mapCadRadsTone(baseCategory, modifiers) {
    if (baseCategory === "0" || baseCategory === "1") {
      return "good";
    }
    if (baseCategory === "2" || baseCategory === "3" || modifiers.nonDiagnostic) {
      return "caution";
    }
    return "danger";
  }

  function prepareTranscriptForAnalysis(value) {
    let text = String(value || "");

    [
      [/\bagatson\b/gi, "Agatston"],
      [/\bagaston\b/gi, "Agatston"],
      [/\bagatston\b/gi, "Agatston"],
      [/\bagatstone\b/gi, "Agatston"],
      [/\bcad rads\b/gi, "CAD-RADS"],
      [/\bct ffr\b/gi, "CT-FFR"],
      [/\becg synchronized\b/gi, "ECG-gated"],
      [/\bhigh grade\b/gi, "high-grade"],
      [/(\d{1,3})\s*(?:%|percent)\s*diameters?\b/gi, "$1%"],
    ].forEach(([pattern, replacement]) => {
      text = text.replace(pattern, replacement);
    });

    Object.entries(SEGMENT_WORD_NUMBERS).forEach(([word, numeral]) => {
      const pattern = new RegExp(`\\bsegment\\s+${word}\\b`, "gi");
      text = text.replace(pattern, `segment ${numeral}`);
    });

    return text.replace(/\s+/g, " ").trim();
  }

  function splitSentences(text) {
    return String(text)
      .replace(/\r/g, "")
      .split(/\n+/)
      .flatMap((chunk) => chunk.split(/(?<=[.!?])\s+/))
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => ({
        raw: chunk,
        normalized: normalizeText(chunk),
      }));
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[–—]/g, "-")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function mapPercentRange(firstPercent, secondPercent, explicit) {
    const minPercent = Math.min(firstPercent, secondPercent);
    const maxPercent = Math.max(firstPercent, secondPercent);
    if (maxPercent <= 0) {
      return cloneSeverity(STENOSIS_LIBRARY.none, explicit);
    }
    if (maxPercent < 25) {
      return cloneSeverity(STENOSIS_LIBRARY.minimal, explicit);
    }
    if (maxPercent < 50) {
      return cloneSeverity(STENOSIS_LIBRARY.mild, explicit);
    }
    if (maxPercent < 70) {
      return cloneSeverity(STENOSIS_LIBRARY.moderate, explicit);
    }
    if (maxPercent < 100) {
      return cloneSeverity(STENOSIS_LIBRARY.severe, explicit);
    }
    return cloneSeverity(STENOSIS_LIBRARY.occluded, explicit);
  }

  function mapSinglePercent(percent, explicit) {
    return mapPercentRange(percent, percent, explicit);
  }

  function cloneSeverity(source, explicit) {
    return {
      ...source,
      explicit,
    };
  }

  function cleanSentence(value) {
    const cleaned = String(value || "").replace(/\s+/g, " ").trim();
    if (!cleaned) {
      return "";
    }
    return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
  }

  function uniqueStrings(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function parseNumber(value) {
    const parsed = Number.parseFloat(String(value).trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) {
      return "-";
    }
    return String(value).replace(/\.0+$/, "");
  }

  async function readJsonResponse(response) {
    try {
      return await response.json();
    } catch (error) {
      return {};
    }
  }

  function delay(durationMs) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(0, durationMs || 0));
    });
  }

  function capitalize(value) {
    const text = String(value || "");
    if (!text) {
      return "";
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function getTopicSummary(entries, label) {
    const entry = entries.find((item) => item.label === label);
    return entry ? entry.sentences.join(" ") : "";
  }

  function coronaryTopicSummary(entries) {
    return entries.map((entry) => `${entry.label}: ${entry.sentences.join(" ")}`).join(" ");
  }

  function getCombinedTopicSummary(entries, labels) {
    const snippets = labels.map((label) => getTopicSummary(entries, label)).filter(Boolean);
    return snippets.join(" ");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
})();
