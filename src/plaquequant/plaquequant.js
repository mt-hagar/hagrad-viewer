(function () {
  "use strict";

  const core = window.HAGRadCore;
  const dicom = window.HAGRadDicom;
  const exportStudyApi = window.HAGRadExportStudies || null;
  if (!core || !dicom) {
    throw new Error("HAGRad shared scripts are required for PlaqueQuant.");
  }

  const {
    clamp,
    safeString,
    sanitizeFilePart,
    formatSpacing,
    combineDateTime,
    waitForAnimationFrame,
    collectDroppedFiles,
  } = core;

  const VESSELS = ["LM", "LAD", "LCx", "RCA", "Unknown"];
  const SUBTYPE_COLORS = {
    low_attenuation: [255, 113, 113],
    noncalcified: [255, 205, 90],
    calcified: [118, 214, 255],
    mixed: [176, 132, 255],
  };
  const MAX_AUTO_COMPONENT_PIXELS = 2400;
  const MAX_AUTO_LESIONS = 450;
  const ENGINE_REFERENCES = [
    {
      id: "mm_dhm_nnunet_plaque",
      name: "MM-DHM nnU-Net plaque segmentation",
      role: "Direct plaque model",
      source: "https://github.com/MM-DHM/nnUNet-Coronary-CTA-Segmentation",
      status: "external_weights_required",
    },
    {
      id: "seqseg_coronary",
      name: "SeqSeg coronary lumen/tree tracking",
      role: "Coronary tree mask and centerline guidance",
      source: "https://github.com/numisveinsson/SeqSeg",
      status: "python_weights_required",
    },
    {
      id: "vmtk",
      name: "VMTK",
      role: "Centerlines, surfaces, vessel cross-sections",
      source: "https://github.com/vmtk/vmtk",
      status: "local_tool_optional",
    },
    {
      id: "coronary_cta_prediction",
      name: "European Radiology 2022 plaque model",
      role: "Reference plaque segmentation model",
      source: "https://github.com/balinthomonnay/coronary_cta_prediciton",
      status: "legacy_preprocessing_required",
    },
  ];

  const state = {
    files: [],
    records: [],
    reconstructions: [],
    selectedSeriesId: "",
    activeReconId: "",
    activeTool: "window",
    layout: "presentation",
    currentSlice: 0,
    crosshair: { x: 0.5, y: 0.5, z: 0.5 },
    window: { width: 800, center: 250 },
    view: { zoom: 1, panX: 0, panY: 0 },
    dragging: null,
    renderQueued: false,
    vesselSeeds: [],
    centerlineModels: [],
    wallModels: [],
    engineStatus: null,
    pipeline: {
      centerline: { status: "not_started", validated: false, method: "" },
      wall: { status: "blocked", validated: false, method: "" },
      plaque: { status: "blocked", validated: false, method: "" },
    },
    analysis: {
      lesions: [],
      selectedLesionId: "",
      nextLesionId: 1,
      method: "not_run",
      opacity: 0.55,
    },
    exportStudy: {
      studies: [],
      currentStudyId: "",
    },
  };

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function initElements() {
    [
      "dicom-input",
      "dicom-folder-input",
      "clear-button",
      "status-pill",
      "series-count",
      "series-list",
      "load-series-button",
      "slice-readout",
      "layout-presentation",
      "layout-mpr",
      "viewport-grid",
      "drop-zone",
      "empty-state",
      "opacity-input",
      "check-engines-button",
      "engine-status",
      "engine-list",
      "centerline-status",
      "wall-status",
      "plaque-status",
      "run-centerline-button",
      "validate-centerline-button",
      "run-wall-button",
      "validate-wall-button",
      "analysis-mode",
      "low-max",
      "noncalc-max",
      "calc-min",
      "min-area",
      "run-analysis-button",
      "analysis-method",
      "active-vessel",
      "active-vessel-readout",
      "manual-add-button",
      "seed-button",
      "seed-summary",
      "exclude-lesion-button",
      "assign-vessel-button",
      "vessel-summary",
      "lesion-list",
      "export-button",
      "export-note",
    ].forEach((id) => {
      els[toCamel(id)] = $(id);
    });
    els.canvases = {
      axial: $("canvas-axial"),
      coronal: $("canvas-coronal"),
      sagittal: $("canvas-sagittal"),
      review: $("canvas-review"),
    };
  }

  function toCamel(value) {
    return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
  }

  function setStatus(message, kind) {
    els.statusPill.textContent = message;
    els.statusPill.style.background = kind === "error" ? "var(--danger)" : kind === "busy" ? "var(--accent-2)" : "var(--accent)";
    els.statusPill.style.color = kind === "error" ? "#270b09" : "#06211f";
  }

  function getActiveRecon() {
    return state.reconstructions.find((entry) => entry.id === state.activeReconId) || null;
  }

  function getVoxelVolumeMm3(volume) {
    return (volume?.rowSpacing || 1) * (volume?.columnSpacing || 1) * (volume?.sliceSpacing || 1);
  }

  function resetPipeline() {
    state.centerlineModels = [];
    state.wallModels = [];
    state.pipeline = {
      centerline: { status: "not_started", validated: false, method: "" },
      wall: { status: "blocked", validated: false, method: "" },
      plaque: { status: "blocked", validated: false, method: "" },
    };
  }

  function invalidateDownstream(stage) {
    if (stage === "centerline") {
      state.centerlineModels = [];
      state.wallModels = [];
      state.pipeline.centerline = { status: "not_started", validated: false, method: "" };
      state.pipeline.wall = { status: "blocked", validated: false, method: "" };
      state.pipeline.plaque = { status: "blocked", validated: false, method: "" };
      state.analysis.lesions = [];
      state.analysis.selectedLesionId = "";
      state.analysis.method = "not_run";
      return;
    }
    if (stage === "wall") {
      state.wallModels = [];
      state.pipeline.wall = { status: "blocked", validated: false, method: "" };
      state.pipeline.plaque = { status: "blocked", validated: false, method: "" };
      state.analysis.lesions = [];
      state.analysis.selectedLesionId = "";
      state.analysis.method = "not_run";
    }
  }

  function getHu(volume, x, y, z) {
    if (!volume || x < 0 || y < 0 || z < 0 || x >= volume.columns || y >= volume.rows || z >= volume.depth) {
      return null;
    }
    const slice = volume.slices[z];
    const raw = slice.pixels[y * volume.columns + x];
    return raw * (slice.slope ?? 1) + (slice.intercept ?? 0);
  }

  function classifyHu(hu) {
    const lowMax = Number.parseFloat(els.lowMax.value);
    const noncalcMax = Number.parseFloat(els.noncalcMax.value);
    const calcMin = Number.parseFloat(els.calcMin.value);
    if (hu >= calcMin) {
      return "calcified";
    }
    if (hu >= -30 && hu <= lowMax) {
      return "low_attenuation";
    }
    if (hu > lowMax && hu <= noncalcMax) {
      return "noncalcified";
    }
    return null;
  }

  async function handleFiles(files, mode) {
    const incoming = Array.from(files || []);
    if (!incoming.length) {
      return;
    }
    setStatus("Reading DICOM headers", "busy");
    state.files = mode === "replace" ? incoming : dedupeLocalFiles([...state.files, ...incoming]);
    const records = await dicom.parseDicomFiles(state.files);
    state.records = records;
    state.reconstructions = dicom.buildSeriesCandidates(records).map((candidate, index) => ({
      ...candidate,
      id: candidate.id || `series-${index + 1}`,
      volume: null,
    }));
    state.selectedSeriesId = state.reconstructions[0]?.id || "";
    renderSeries();
    setStatus(records.length ? "Choose reconstruction" : "No usable DICOM found", records.length ? null : "error");
  }

  function renderSeries() {
    els.seriesCount.textContent = String(state.reconstructions.length);
    els.loadSeriesButton.disabled = !state.selectedSeriesId;
    if (!state.reconstructions.length) {
      els.seriesList.className = "list empty";
      els.seriesList.textContent = "Load axial CCTA DICOM files or a folder.";
      return;
    }
    els.seriesList.className = "list";
    els.seriesList.innerHTML = "";
    state.reconstructions.forEach((series) => {
      const meta = series.meta || {};
      const item = document.createElement("button");
      item.type = "button";
      item.className = `series-item${series.id === state.selectedSeriesId ? " is-selected" : ""}`;
      item.innerHTML = [
        `<strong>${escapeHtml(series.label || "Unnamed reconstruction")}</strong>`,
        `<small>${series.pixelCount} images · ${escapeHtml(formatSpacing(meta.pixelSpacing))} · ${escapeHtml(combineDateTime(meta))}</small>`,
      ].join("");
      item.addEventListener("click", () => {
        state.selectedSeriesId = series.id;
        renderSeries();
      });
      els.seriesList.appendChild(item);
    });
  }

  async function loadSelectedSeries() {
    const recon = state.reconstructions.find((entry) => entry.id === state.selectedSeriesId);
    if (!recon) {
      return;
    }
    setStatus("Decoding reconstruction", "busy");
    recon.volume = await dicom.buildVolume(recon.records, {
      statusCallback(done, total) {
        setStatus(`Decoding ${done}/${total}`, "busy");
      },
    });
    state.activeReconId = recon.id;
    state.currentSlice = Math.floor(recon.volume.depth / 2);
    state.crosshair = { x: 0.5, y: 0.5, z: state.currentSlice / Math.max(1, recon.volume.depth - 1) };
    state.analysis.lesions = [];
    state.analysis.selectedLesionId = "";
    state.analysis.nextLesionId = 1;
    state.analysis.method = "not_run";
    state.vesselSeeds = [];
    resetPipeline();
    els.emptyState.classList.add("is-hidden");
    els.exportButton.disabled = true;
    resizeCanvases();
    scheduleRender();
    renderReview();
    setStatus("Reconstruction loaded", null);
  }

  function resizeCanvases() {
    Object.values(els.canvases).forEach((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width * window.devicePixelRatio));
      const height = Math.max(1, Math.round(rect.height * window.devicePixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    });
  }

  function renderAll() {
    resizeCanvases();
    const recon = getActiveRecon();
    const volume = recon?.volume;
    if (!volume) {
      return;
    }
    if (!state.pipeline.wall.validated) {
      setStatus("Validate vessel wall scaffold before plaque quantification", "error");
      return;
    }
    state.currentSlice = clamp(Math.round(state.currentSlice), 0, volume.depth - 1);
    state.crosshair.z = state.currentSlice / Math.max(1, volume.depth - 1);
    renderPlane("axial");
    if (state.layout === "mpr") {
      renderPlane("coronal");
      renderPlane("sagittal");
      renderReviewCanvas();
    }
    els.sliceReadout.textContent = `Slice ${state.currentSlice + 1}/${volume.depth}`;
  }

  function scheduleRender() {
    if (state.renderQueued) {
      return;
    }
    state.renderQueued = true;
    window.requestAnimationFrame(() => {
      state.renderQueued = false;
      renderAll();
    });
  }

  function planeDims(volume, plane) {
    if (plane === "coronal") {
      return { w: volume.columns, h: volume.depth };
    }
    if (plane === "sagittal") {
      return { w: volume.rows, h: volume.depth };
    }
    return { w: volume.columns, h: volume.rows };
  }

  function planeSample(volume, plane, u, v) {
    if (plane === "coronal") {
      const y = Math.round(state.crosshair.y * (volume.rows - 1));
      return getHu(volume, u, y, volume.depth - 1 - v);
    }
    if (plane === "sagittal") {
      const x = Math.round(state.crosshair.x * (volume.columns - 1));
      return getHu(volume, x, u, volume.depth - 1 - v);
    }
    return getHu(volume, u, v, state.currentSlice);
  }

  function renderPlane(plane) {
    const recon = getActiveRecon();
    const volume = recon?.volume;
    const canvas = els.canvases[plane];
    if (!volume || !canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    const dims = planeDims(volume, plane);
    const image = ctx.createImageData(dims.w, dims.h);
    const min = state.window.center - state.window.width / 2;
    const invWidth = 255 / Math.max(1, state.window.width);
    for (let y = 0; y < dims.h; y += 1) {
      for (let x = 0; x < dims.w; x += 1) {
        const hu = planeSample(volume, plane, x, y);
        const gray = clamp(Math.round(((hu ?? min) - min) * invWidth), 0, 255);
        const index = (y * dims.w + x) * 4;
        image.data[index] = gray;
        image.data[index + 1] = gray;
        image.data[index + 2] = gray;
        image.data[index + 3] = 255;
      }
    }
    const buffer = document.createElement("canvas");
    buffer.width = dims.w;
    buffer.height = dims.h;
    buffer.getContext("2d").putImageData(image, 0, 0);
    drawFitted(ctx, buffer, canvas, dims);
    drawOverlay(ctx, canvas, plane, dims);
    drawCrosshair(ctx, canvas, plane);
  }

  function drawFitted(ctx, source, canvas, dims) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / dims.w, canvas.height / dims.h) * state.view.zoom;
    const width = dims.w * scale;
    const height = dims.h * scale;
    const x = (canvas.width - width) / 2 + state.view.panX * window.devicePixelRatio;
    const y = (canvas.height - height) / 2 + state.view.panY * window.devicePixelRatio;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, x, y, width, height);
    canvas._fit = { x, y, width, height, scale, dims };
  }

  function drawOverlay(ctx, canvas, plane, dims) {
    if (plane !== "axial") {
      return;
    }
    const recon = getActiveRecon();
    const volume = recon?.volume;
    const fit = canvas._fit;
    if (!volume || !fit) {
      return;
    }
    const opacity = state.analysis.opacity;
    const slice = state.currentSlice;
    state.analysis.lesions
      .filter((lesion) => !lesion.excluded && lesion.slice === slice)
      .forEach((lesion) => {
        const color = SUBTYPE_COLORS[lesion.subtype] || SUBTYPE_COLORS.mixed;
        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity})`;
        lesion.voxels.forEach((voxel) => {
          const px = fit.x + voxel.x * fit.scale;
          const py = fit.y + voxel.y * fit.scale;
          ctx.fillRect(px, py, Math.max(1, fit.scale), Math.max(1, fit.scale));
        });
        const centroid = lesion.centroid;
        ctx.strokeStyle = lesion.id === state.analysis.selectedLesionId ? "#ffffff" : `rgb(${color.join(",")})`;
        ctx.lineWidth = lesion.id === state.analysis.selectedLesionId ? 3 : 1.5;
        ctx.beginPath();
        ctx.arc(fit.x + centroid.x * fit.scale, fit.y + centroid.y * fit.scale, Math.max(6, 5 * fit.scale), 0, Math.PI * 2);
        ctx.stroke();
      });
    state.vesselSeeds
      .filter((seed) => seed.z === slice)
      .forEach((seed) => {
        ctx.strokeStyle = "#5fd0c8";
        ctx.fillStyle = "rgba(95, 208, 200, 0.22)";
        ctx.lineWidth = 2;
        const px = fit.x + seed.x * fit.scale;
        const py = fit.y + seed.y * fit.scale;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(7, 4 * fit.scale), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#f3f6f8";
        ctx.font = `${11 * window.devicePixelRatio}px system-ui`;
        ctx.fillText(seed.vessel, px + 8, py - 8);
      });
    state.wallModels
      .flatMap((model) => model.points)
      .filter((point) => point.z === slice)
      .forEach((point) => {
        const px = fit.x + point.x * fit.scale;
        const py = fit.y + point.y * fit.scale;
        const radiusPx = Math.max(8, point.radiusPx * fit.scale);
        ctx.strokeStyle = "rgba(255, 207, 90, 0.88)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, radiusPx, 0, Math.PI * 2);
        ctx.stroke();
      });
  }

  function drawCrosshair(ctx, canvas, plane) {
    if (!canvas._fit) {
      return;
    }
    const { x, y, width, height } = canvas._fit;
    const cx = plane === "sagittal" ? state.crosshair.y : state.crosshair.x;
    const cy = plane === "axial" ? state.crosshair.y : 1 - state.crosshair.z;
    ctx.strokeStyle = "rgba(95, 208, 200, 0.75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + width * cx, y);
    ctx.lineTo(x + width * cx, y + height);
    ctx.moveTo(x, y + height * cy);
    ctx.lineTo(x + width, y + height * cy);
    ctx.stroke();
  }

  function renderReviewCanvas() {
    const canvas = els.canvases.review;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#080b0e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const totals = computeTotals();
    const max = Math.max(1, totals.patient.total_plaque_volume_mm3);
    const rows = [
      ["Calcified", totals.patient.calcified_plaque_volume_mm3, SUBTYPE_COLORS.calcified],
      ["Non-calcified", totals.patient.noncalcified_plaque_volume_mm3, SUBTYPE_COLORS.noncalcified],
      ["Low attenuation", totals.patient.low_attenuation_plaque_volume_mm3, SUBTYPE_COLORS.low_attenuation],
      ["Mixed", totals.patient.mixed_plaque_volume_mm3, SUBTYPE_COLORS.mixed],
    ];
    ctx.font = `${14 * window.devicePixelRatio}px system-ui`;
    ctx.fillStyle = "#f3f6f8";
    ctx.fillText("Plaque composition scaffold", 20, 30);
    rows.forEach((row, index) => {
      const y = 62 + index * 38;
      const width = (canvas.width - 160) * (row[1] / max);
      ctx.fillStyle = `rgb(${row[2].join(",")})`;
      ctx.fillRect(20, y, width, 16);
      ctx.fillStyle = "#dfe7ee";
      ctx.fillText(`${row[0]}: ${row[1].toFixed(1)} mm3`, 28 + width, y + 14);
    });
  }

  async function runCandidateAnalysis() {
    const recon = getActiveRecon();
    const volume = recon?.volume;
    if (!volume) {
      return;
    }
    const mode = els.analysisMode.value;
    state.analysis.lesions = [];
    state.analysis.selectedLesionId = "";
    if (mode === "manualOnly") {
      state.analysis.method = "manual_only";
      renderReview();
      renderAll();
      return;
    }
    if (mode === "seedGuided" && !state.vesselSeeds.length) {
      setStatus("Place vessel seeds first", "error");
      return;
    }
    els.runAnalysisButton.disabled = true;
    setStatus(mode === "seedGuided" ? "Running seed-guided scan" : "Running fast candidate scan", "busy");
    const minArea = Number.parseFloat(els.minArea.value) || 0;
    const minPixels = Math.max(1, Math.ceil(minArea / ((volume.rowSpacing || 1) * (volume.columnSpacing || 1))));
    const scanPlan = buildScanPlan(volume, mode);
    for (let z = 0; z < volume.depth; z += 1) {
      const sliceRegions = scanPlan.filter((region) => z >= region.z0 && z <= region.z1);
      if (sliceRegions.length) {
        const visited = new Uint8Array(volume.rows * volume.columns);
        for (const region of sliceRegions) {
          for (let y = region.y0; y < region.y1; y += 1) {
            for (let x = region.x0; x < region.x1; x += 1) {
              const index = y * volume.columns + x;
              if (visited[index]) {
                continue;
              }
              const subtype = classifyCandidateHu(getHu(volume, x, y, z), mode);
              if (!subtype) {
                visited[index] = 1;
                continue;
              }
              const component = floodSlice(volume, x, y, z, visited, region, subtype, mode);
              if (
                component.length >= minPixels &&
                component.length <= MAX_AUTO_COMPONENT_PIXELS &&
                state.analysis.lesions.length < MAX_AUTO_LESIONS
              ) {
                addLesionFromVoxels(component, z, region.vessel || "Unknown", `${mode}_component`);
              }
            }
          }
        }
      }
      if (z % 3 === 0) {
        setStatus(`Analyzing slice ${z + 1}/${volume.depth}`, "busy");
        await waitForAnimationFrame();
        if (state.analysis.lesions.length >= MAX_AUTO_LESIONS) {
          break;
        }
      }
    }
    state.analysis.method =
      mode === "seedGuided"
        ? "seed_guided_threshold_scaffold"
        : mode === "centralThreshold"
          ? "legacy_central_threshold_scaffold"
          : "fast_calcified_threshold_scaffold";
    state.pipeline.plaque = {
      status: "review",
      validated: false,
      method: state.analysis.method,
    };
    els.runAnalysisButton.disabled = false;
    els.exportButton.disabled = state.analysis.lesions.length === 0;
    setStatus(`${state.analysis.lesions.length} candidates`, null);
    renderReview();
    scheduleRender();
  }

  function buildScanPlan(volume, mode) {
    if (mode === "seedGuided") {
      const radiusMm = 8;
      const sliceRadius = Math.max(1, Math.round(radiusMm / (volume.sliceSpacing || 1)));
      const wallPoints = state.wallModels.flatMap((model) =>
        model.points.map((point) => ({
          ...point,
          vessel: model.vessel,
          radiusMm: model.radiusMm,
        }))
      );
      const points = wallPoints.length ? wallPoints : state.vesselSeeds;
      return points.map((seed) => {
        const localRadiusMm = Math.max(radiusMm, (seed.radiusMm || 0) + 4);
        const rx = Math.max(4, Math.round(localRadiusMm / (volume.columnSpacing || 1)));
        const ry = Math.max(4, Math.round(localRadiusMm / (volume.rowSpacing || 1)));
        return {
          x0: clamp(seed.x - rx, 0, volume.columns - 1),
          x1: clamp(seed.x + rx + 1, 1, volume.columns),
          y0: clamp(seed.y - ry, 0, volume.rows - 1),
          y1: clamp(seed.y + ry + 1, 1, volume.rows),
          z0: clamp(seed.z - sliceRadius, 0, volume.depth - 1),
          z1: clamp(seed.z + sliceRadius, 0, volume.depth - 1),
          vessel: seed.vessel,
        };
      });
    }
    return [
      {
        x0: Math.floor(volume.columns * 0.18),
        x1: Math.ceil(volume.columns * 0.82),
        y0: Math.floor(volume.rows * 0.16),
        y1: Math.ceil(volume.rows * 0.84),
        z0: 0,
        z1: volume.depth - 1,
        vessel: "Unknown",
      },
    ];
  }

  function classifyCandidateHu(hu, mode) {
    if (mode === "fastCalcified") {
      const calcMin = Number.parseFloat(els.calcMin.value);
      return hu >= calcMin ? "calcified" : null;
    }
    return classifyHu(hu);
  }

  function floodSlice(volume, startX, startY, z, visited, bounds, subtype, mode) {
    const stack = [{ x: startX, y: startY }];
    const voxels = [];
    while (stack.length) {
      const voxel = stack.pop();
      if (voxel.x < bounds.x0 || voxel.x >= bounds.x1 || voxel.y < bounds.y0 || voxel.y >= bounds.y1) {
        continue;
      }
      const index = voxel.y * volume.columns + voxel.x;
      if (visited[index]) {
        continue;
      }
      visited[index] = 1;
      if (classifyCandidateHu(getHu(volume, voxel.x, voxel.y, z), mode) !== subtype) {
        continue;
      }
      voxels.push({ x: voxel.x, y: voxel.y });
      if (voxels.length > MAX_AUTO_COMPONENT_PIXELS) {
        continue;
      }
      stack.push({ x: voxel.x + 1, y: voxel.y });
      stack.push({ x: voxel.x - 1, y: voxel.y });
      stack.push({ x: voxel.x, y: voxel.y + 1 });
      stack.push({ x: voxel.x, y: voxel.y - 1 });
    }
    return voxels;
  }

  function addLesionFromVoxels(voxels, slice, vessel, source) {
    const recon = getActiveRecon();
    const volume = recon?.volume;
    if (!volume || !voxels.length) {
      return null;
    }
    let sumX = 0;
    let sumY = 0;
    const subtypeCounts = {};
    voxels.forEach((voxel) => {
      sumX += voxel.x;
      sumY += voxel.y;
      const subtype = classifyHu(getHu(volume, voxel.x, voxel.y, slice)) || "mixed";
      subtypeCounts[subtype] = (subtypeCounts[subtype] || 0) + 1;
    });
    const subtype = Object.entries(subtypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "mixed";
    const lesion = {
      id: `PQ-${String(state.analysis.nextLesionId++).padStart(3, "0")}`,
      vessel,
      slice,
      subtype,
      source,
      excluded: false,
      voxels,
      centroid: { x: sumX / voxels.length, y: sumY / voxels.length },
      volumeMm3: voxels.length * getVoxelVolumeMm3(volume),
    };
    state.analysis.lesions.push(lesion);
    return lesion;
  }

  function addManualRoi(canvas, event) {
    const recon = getActiveRecon();
    const volume = recon?.volume;
    const point = canvasToVoxel(canvas, event.clientX, event.clientY);
    if (!volume || !point) {
      return;
    }
    const radiusMm = 2.2;
    const rx = Math.max(2, Math.round(radiusMm / (volume.columnSpacing || 1)));
    const ry = Math.max(2, Math.round(radiusMm / (volume.rowSpacing || 1)));
    const voxels = [];
    for (let y = point.y - ry; y <= point.y + ry; y += 1) {
      for (let x = point.x - rx; x <= point.x + rx; x += 1) {
        if (x < 0 || y < 0 || x >= volume.columns || y >= volume.rows) {
          continue;
        }
        const norm = ((x - point.x) ** 2) / (rx ** 2) + ((y - point.y) ** 2) / (ry ** 2);
        if (norm <= 1 && classifyHu(getHu(volume, x, y, state.currentSlice))) {
          voxels.push({ x, y });
        }
      }
    }
    const lesion = addLesionFromVoxels(voxels, state.currentSlice, els.activeVessel.value, "manual_threshold_roi");
    if (lesion) {
      state.analysis.selectedLesionId = lesion.id;
      state.analysis.method = state.analysis.method === "not_run" ? "manual_threshold_roi" : state.analysis.method;
      els.exportButton.disabled = false;
      renderReview();
      renderAll();
    }
  }

  function addVesselSeed(canvas, event) {
    const volume = getActiveRecon()?.volume;
    const point = canvasToVoxel(canvas, event.clientX, event.clientY);
    if (!volume || !point) {
      return;
    }
    state.vesselSeeds.push({
      id: `seed-${state.vesselSeeds.length + 1}`,
      x: point.x,
      y: point.y,
      z: state.currentSlice,
      vessel: els.activeVessel.value,
    });
    invalidateDownstream("centerline");
    setStatus(`Seed added for ${els.activeVessel.value}`, null);
    renderReview();
    scheduleRender();
  }

  function runCenterlineScaffold() {
    if (!getActiveRecon()?.volume) {
      return;
    }
    if (!state.vesselSeeds.length) {
      state.pipeline.centerline.status = "needs_seeds";
      renderReview();
      setStatus("Place centerline seeds along the coronary vessel first", "error");
      return;
    }
    const byVessel = new Map();
    state.vesselSeeds.forEach((seed) => {
      if (!byVessel.has(seed.vessel)) {
        byVessel.set(seed.vessel, []);
      }
      byVessel.get(seed.vessel).push(seed);
    });
    state.centerlineModels = Array.from(byVessel.entries()).map(([vessel, seeds]) => ({
      vessel,
      source: "manual_seed_centerline_scaffold",
      validated: false,
      points: seeds
        .slice()
        .sort((a, b) => a.z - b.z)
        .map((seed) => ({ x: seed.x, y: seed.y, z: seed.z })),
    }));
    state.pipeline.centerline = {
      status: "review",
      validated: false,
      method: "manual_seed_centerline_scaffold",
    };
    state.pipeline.wall = { status: "blocked", validated: false, method: "" };
    state.pipeline.plaque = { status: "blocked", validated: false, method: "" };
    state.wallModels = [];
    state.analysis.lesions = [];
    state.analysis.selectedLesionId = "";
    state.analysis.method = "not_run";
    renderReview();
    scheduleRender();
    setStatus("Centerline scaffold ready for validation", null);
  }

  function validateCenterline() {
    if (state.pipeline.centerline.status !== "review") {
      return;
    }
    state.pipeline.centerline.validated = true;
    state.pipeline.wall.status = "not_started";
    renderReview();
    setStatus("Centerline validated. Next: vessel wall scaffold.", null);
  }

  function runWallScaffold() {
    const volume = getActiveRecon()?.volume;
    if (!volume || !state.pipeline.centerline.validated) {
      setStatus("Validate centerline before vessel wall segmentation", "error");
      return;
    }
    const radiusMm = 2.8;
    const radiusPx = Math.max(3, radiusMm / Math.max(volume.rowSpacing || 1, volume.columnSpacing || 1));
    state.wallModels = state.centerlineModels.map((model) => ({
      vessel: model.vessel,
      source: "fixed_radius_wall_roi_scaffold",
      validated: false,
      radiusMm,
      points: model.points.map((point) => ({ ...point, radiusPx })),
    }));
    state.pipeline.wall = {
      status: "review",
      validated: false,
      method: "fixed_radius_wall_roi_scaffold",
    };
    state.pipeline.plaque = { status: "blocked", validated: false, method: "" };
    state.analysis.lesions = [];
    state.analysis.selectedLesionId = "";
    state.analysis.method = "not_run";
    renderReview();
    scheduleRender();
    setStatus("Vessel wall ROI scaffold ready for validation", null);
  }

  function validateWall() {
    if (state.pipeline.wall.status !== "review") {
      return;
    }
    state.pipeline.wall.validated = true;
    state.pipeline.plaque.status = "not_started";
    renderReview();
    setStatus("Wall scaffold validated. Plaque quantification is unlocked.", null);
  }

  function canvasToVoxel(canvas, clientX, clientY) {
    const fit = canvas._fit;
    if (!fit) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * window.devicePixelRatio;
    const y = (clientY - rect.top) * window.devicePixelRatio;
    if (x < fit.x || y < fit.y || x > fit.x + fit.width || y > fit.y + fit.height) {
      return null;
    }
    return {
      x: clamp(Math.floor((x - fit.x) / fit.scale), 0, fit.dims.w - 1),
      y: clamp(Math.floor((y - fit.y) / fit.scale), 0, fit.dims.h - 1),
    };
  }

  function pickLesion(canvas, event) {
    const point = canvasToVoxel(canvas, event.clientX, event.clientY);
    if (!point) {
      return null;
    }
    let best = null;
    let bestDistance = Infinity;
    state.analysis.lesions
      .filter((lesion) => lesion.slice === state.currentSlice)
      .forEach((lesion) => {
        const distance = Math.hypot(lesion.centroid.x - point.x, lesion.centroid.y - point.y);
        if (distance < bestDistance && distance < 18) {
          best = lesion;
          bestDistance = distance;
        }
      });
    if (best) {
      state.analysis.selectedLesionId = best.id;
      renderReview();
      renderAll();
    }
    return best;
  }

  function computeTotals() {
    const vesselRows = new Map();
    VESSELS.forEach((vessel) => {
      vesselRows.set(vessel, emptyMetricRow({ vessel_name: vessel }));
    });
    const patient = emptyMetricRow({});
    state.analysis.lesions.filter((lesion) => !lesion.excluded).forEach((lesion) => {
      const vessel = vesselRows.get(lesion.vessel) || vesselRows.get("Unknown");
      const key = subtypeMetricKey(lesion.subtype);
      patient.total_plaque_volume_mm3 += lesion.volumeMm3;
      vessel.total_plaque_volume_mm3 += lesion.volumeMm3;
      if (key) {
        patient[key] += lesion.volumeMm3;
        vessel[key] += lesion.volumeMm3;
      } else {
        patient.mixed_plaque_volume_mm3 += lesion.volumeMm3;
        vessel.mixed_plaque_volume_mm3 += lesion.volumeMm3;
      }
    });
    return { patient, vessels: Array.from(vesselRows.values()) };
  }

  function emptyMetricRow(extra) {
    return {
      ...extra,
      total_plaque_volume_mm3: 0,
      calcified_plaque_volume_mm3: 0,
      noncalcified_plaque_volume_mm3: 0,
      low_attenuation_plaque_volume_mm3: 0,
      mixed_plaque_volume_mm3: 0,
    };
  }

  function subtypeMetricKey(subtype) {
    if (subtype === "calcified") {
      return "calcified_plaque_volume_mm3";
    }
    if (subtype === "noncalcified") {
      return "noncalcified_plaque_volume_mm3";
    }
    if (subtype === "low_attenuation") {
      return "low_attenuation_plaque_volume_mm3";
    }
    if (subtype === "mixed") {
      return "mixed_plaque_volume_mm3";
    }
    return null;
  }

  function renderReview() {
    els.analysisMethod.textContent = state.analysis.method.replaceAll("_", " ");
    els.activeVesselReadout.textContent = els.activeVessel.value;
    const totals = computeTotals();
    renderSeedSummary();
    els.vesselSummary.innerHTML = "";
    totals.vessels.forEach((row) => {
      const element = document.createElement("div");
      element.className = "summary-row";
      element.innerHTML = `<strong>${escapeHtml(row.vessel_name)}</strong><span>${row.total_plaque_volume_mm3.toFixed(1)} mm3</span>`;
      els.vesselSummary.appendChild(element);
    });
    els.lesionList.innerHTML = "";
    const visible = state.analysis.lesions;
    if (!visible.length) {
      els.lesionList.className = "lesion-list empty";
      els.lesionList.textContent = "Run analysis or add an ROI.";
    } else {
      els.lesionList.className = "lesion-list";
      visible.forEach((lesion) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `lesion-item${lesion.id === state.analysis.selectedLesionId ? " is-selected" : ""}`;
        item.innerHTML = `<strong>${escapeHtml(lesion.id)} · ${escapeHtml(lesion.vessel)} · ${escapeHtml(lesion.subtype)}</strong><small>Slice ${lesion.slice + 1} · ${lesion.volumeMm3.toFixed(1)} mm3 · ${escapeHtml(lesion.source)}${lesion.excluded ? " · excluded" : ""}</small>`;
        item.addEventListener("click", () => {
          state.analysis.selectedLesionId = lesion.id;
          state.currentSlice = lesion.slice;
          renderReview();
          renderAll();
        });
        els.lesionList.appendChild(item);
      });
    }
    const selected = Boolean(state.analysis.selectedLesionId);
    els.excludeLesionButton.disabled = !selected;
    els.assignVesselButton.disabled = !selected;
    els.exportButton.disabled = !state.analysis.lesions.some((lesion) => !lesion.excluded);
    renderPipelineUi();
  }

  function renderSeedSummary() {
    if (!state.vesselSeeds.length) {
      els.seedSummary.className = "seed-summary empty";
      els.seedSummary.textContent = "No vessel seeds placed.";
      return;
    }
    const counts = state.vesselSeeds.reduce((memo, seed) => {
      memo[seed.vessel] = (memo[seed.vessel] || 0) + 1;
      return memo;
    }, {});
    els.seedSummary.className = "seed-summary";
    els.seedSummary.textContent = Object.entries(counts)
      .map(([vessel, count]) => `${vessel}: ${count}`)
      .join(" · ");
  }

  function renderPipelineUi() {
    const centerline = state.pipeline.centerline;
    const wall = state.pipeline.wall;
    const plaque = state.pipeline.plaque;
    setStageStatus(els.centerlineStatus, stageLabel(centerline, "Centerline"));
    setStageStatus(els.wallStatus, stageLabel(wall, "Wall"));
    setStageStatus(els.plaqueStatus, stageLabel(plaque, "Plaque"));

    const hasVolume = Boolean(getActiveRecon()?.volume);
    els.runCenterlineButton.disabled = !hasVolume || state.vesselSeeds.length === 0;
    els.validateCenterlineButton.disabled = centerline.status !== "review";
    els.runWallButton.disabled = !centerline.validated;
    els.validateWallButton.disabled = wall.status !== "review";
    els.runAnalysisButton.disabled = !wall.validated;
  }

  function setStageStatus(element, result) {
    element.textContent = result.text;
    element.className = `stage-status ${result.kind}`;
  }

  function stageLabel(stage, label) {
    if (stage.validated) {
      return { text: `${label} validated`, kind: "validated" };
    }
    if (stage.status === "review") {
      return { text: `${label} ready for review`, kind: "review" };
    }
    if (stage.status === "blocked") {
      return { text: label === "Wall" ? "Waiting for centerline validation" : "Waiting for wall validation", kind: "blocked" };
    }
    if (stage.status === "needs_seeds") {
      return { text: "Place centerline seeds first", kind: "blocked" };
    }
    return { text: "Not started", kind: "" };
  }

  function selectedLesion() {
    return state.analysis.lesions.find((lesion) => lesion.id === state.analysis.selectedLesionId) || null;
  }

  function setLayout(layout) {
    state.layout = layout;
    els.viewportGrid.className = `viewport-grid ${layout}`;
    els.layoutPresentation.classList.toggle("is-active", layout === "presentation");
    els.layoutMpr.classList.toggle("is-active", layout === "mpr");
    scheduleRender();
  }

  function canvasPointerDown(event) {
    const canvas = event.currentTarget;
    if (!getActiveRecon()?.volume) {
      return;
    }
    if (event.button === 1) {
      event.preventDefault();
      state.dragging = {
        x: event.clientX,
        y: event.clientY,
        tool: "pan",
        startWindow: { ...state.window },
        startView: { ...state.view },
        startSlice: state.currentSlice,
        source: "middleMouse",
      };
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }
    if (state.activeTool === "manualAdd") {
      addManualRoi(canvas, event);
      return;
    }
    if (state.activeTool === "seed") {
      addVesselSeed(canvas, event);
      return;
    }
    if (event.button === 0 && pickLesion(canvas, event)) {
      return;
    }
    state.dragging = {
      x: event.clientX,
      y: event.clientY,
      tool: event.button === 2 ? "scroll" : state.activeTool,
      startWindow: { ...state.window },
      startView: { ...state.view },
      startSlice: state.currentSlice,
    };
    canvas.setPointerCapture?.(event.pointerId);
  }

  function canvasPointerMove(event) {
    const recon = getActiveRecon();
    const volume = recon?.volume;
    if (!state.dragging || !volume) {
      return;
    }
    const dx = event.clientX - state.dragging.x;
    const dy = event.clientY - state.dragging.y;
    if (state.dragging.tool === "window") {
      state.window.width = clamp(state.dragging.startWindow.width + dx * 3, 20, 4000);
      state.window.center = clamp(state.dragging.startWindow.center - dy * 2, -1200, 1800);
    } else if (state.dragging.tool === "zoom") {
      state.view.zoom = clamp(state.dragging.startView.zoom * (1 - dy / 260), 0.2, 8);
    } else if (state.dragging.tool === "pan") {
      state.view.panX = state.dragging.startView.panX + dx;
      state.view.panY = state.dragging.startView.panY + dy;
    } else if (state.dragging.tool === "scroll") {
      state.currentSlice = clamp(Math.round(state.dragging.startSlice + dy / 3), 0, volume.depth - 1);
    }
    scheduleRender();
  }

  function canvasPointerUp() {
    state.dragging = null;
  }

  function zoomCanvasAtClientPoint(canvas, clientX, clientY, nextZoom) {
    const fit = canvas?._fit;
    const currentZoom = Number(state.view.zoom) || 1;
    const clampedZoom = clamp(nextZoom, 0.2, 8);
    if (Math.abs(clampedZoom - currentZoom) < 0.0001) {
      return false;
    }
    if (!fit?.dims || !Number.isFinite(fit.scale) || fit.scale <= 0) {
      state.view.zoom = clampedZoom;
      return true;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const canvasX = (clientX - rect.left) * dpr;
    const canvasY = (clientY - rect.top) * dpr;
    const imageX = (canvasX - fit.x) / fit.scale;
    const imageY = (canvasY - fit.y) / fit.scale;
    const fitScale = fit.scale / currentZoom;
    const nextScale = fitScale * clampedZoom;
    const nextDrawWidth = fit.dims.w * nextScale;
    const nextDrawHeight = fit.dims.h * nextScale;

    state.view.zoom = clampedZoom;
    state.view.panX = (canvasX - (canvas.width - nextDrawWidth) / 2 - imageX * nextScale) / dpr;
    state.view.panY = (canvasY - (canvas.height - nextDrawHeight) / 2 - imageY * nextScale) / dpr;
    return true;
  }

  function handleWheel(event) {
    const volume = getActiveRecon()?.volume;
    if (!volume) {
      return;
    }
    event.preventDefault();
    if (event.metaKey || event.ctrlKey || state.activeTool === "zoom") {
      const nextZoom = state.view.zoom * (event.deltaY < 0 ? 1.12 : 0.9);
      zoomCanvasAtClientPoint(event.currentTarget, event.clientX, event.clientY, nextZoom);
      scheduleRender();
      return;
    }
    state.currentSlice = clamp(state.currentSlice + Math.sign(event.deltaY), 0, volume.depth - 1);
    scheduleRender();
  }

  function setTool(tool) {
    state.activeTool = tool;
    els.manualAddButton?.classList.remove("is-active");
    els.seedButton?.classList.remove("is-active");
    document.querySelectorAll("[data-tool]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tool === tool);
    });
  }

  async function exportCsvs() {
    const recon = getActiveRecon();
    if (!recon?.volume) {
      return;
    }
    const researchStudyId = safeString(window.prompt("research_study_ID")) || "";
    if (!researchStudyId) {
      return;
    }
    const patientStudyId = safeString(window.prompt("patient_study_ID")) || "";
    if (!patientStudyId) {
      return;
    }
    if (!state.exportStudy.currentStudyId && exportStudyApi) {
      const created = await exportStudyApi.create(researchStudyId);
      state.exportStudy.currentStudyId = safeString(created?.id) || "";
    }
    const exportedAt = new Date().toISOString();
    const base = baseExportFields(recon, researchStudyId, patientStudyId, exportedAt);
    const totals = computeTotals();
    const files = [
      ["plaque_patient_summary.csv", [formatRow({ ...base, ...roundMetricRow(totals.patient), lesion_count: state.analysis.lesions.filter((l) => !l.excluded).length })]],
      ["plaque_vessel_summary.csv", totals.vessels.map((row) => formatRow({ ...base, ...roundMetricRow(row) }))],
      ["plaque_lesion_summary.csv", state.analysis.lesions.map((lesion) => formatRow(lesionExportRow(base, lesion)))],
      ["plaque_metadata.csv", [formatRow(metadataRow(base, recon))]],
    ];
    files.forEach(([filename, rows]) => {
      downloadCsv(filenameForExport(filename, researchStudyId, patientStudyId), rows, { patientStudyId });
    });
    els.exportNote.textContent = `Exported ${files.length} CSV files at ${exportedAt}.`;
    setStatus("Export complete", null);
  }

  function baseExportFields(recon, researchStudyId, patientStudyId, exportedAt) {
    return {
      research_study_ID: researchStudyId,
      patient_study_ID: patientStudyId,
      reconstruction_label: recon.label || "",
      series_instance_uid: recon.meta?.seriesInstanceUID || "",
      export_timestamp: exportedAt,
      analysis_method: state.analysis.method,
      centerline_method: state.pipeline.centerline.method,
      centerline_validated: state.pipeline.centerline.validated ? "true" : "false",
      vessel_wall_method: state.pipeline.wall.method,
      vessel_wall_validated: state.pipeline.wall.validated ? "true" : "false",
      clinical_validation_status: "research_prototype_not_clinically_validated",
    };
  }

  function lesionExportRow(base, lesion) {
    return {
      ...base,
      lesion_id: lesion.id,
      vessel_name: lesion.vessel,
      slice_number: lesion.slice + 1,
      source: lesion.source,
      included: lesion.excluded ? "false" : "true",
      plaque_subtype: lesion.subtype,
      plaque_volume_mm3: round(lesion.volumeMm3),
    };
  }

  function metadataRow(base, recon) {
    const volume = recon.volume;
    const meta = recon.meta || {};
    return {
      ...base,
      patient_name_present_in_source: meta.patientName ? "true" : "false",
      modality: meta.modality || "",
      study_date: meta.studyDate || "",
      series_description: meta.seriesDescription || "",
      protocol_name: meta.protocolName || "",
      rows: volume.rows,
      columns: volume.columns,
      slices: volume.depth,
      pixel_spacing_row_mm: volume.rowSpacing || "",
      pixel_spacing_col_mm: volume.columnSpacing || "",
      slice_spacing_mm: volume.sliceSpacing || "",
      threshold_low_attenuation_max_hu: els.lowMax.value,
      threshold_noncalcified_max_hu: els.noncalcMax.value,
      threshold_calcified_min_hu: els.calcMin.value,
      vessel_seed_count: state.vesselSeeds.length,
      centerline_model_count: state.centerlineModels.length,
      vessel_wall_model_count: state.wallModels.length,
      external_engine_ready_count: (state.engineStatus?.engines || []).filter((engine) => engine.ready).length,
      unsupported_phase1_metrics: "centerline_lumen_outer_wall_scct_segments_cadrads_not_fully_automatic",
    };
  }

  function roundMetricRow(row) {
    const next = { ...row };
    Object.keys(next).forEach((key) => {
      if (key.endsWith("_mm3")) {
        next[key] = round(next[key]);
      }
    });
    return next;
  }

  function round(value) {
    return Number.isFinite(value) ? Number(value.toFixed(3)) : "";
  }

  function formatRow(row) {
    return row;
  }

  function filenameForExport(filename, researchStudyId, patientStudyId) {
    const prefix = [sanitizeFilePart(researchStudyId, "study"), sanitizeFilePart(patientStudyId, "patient")].join("_");
    return `${prefix}_${filename}`;
  }

  function downloadCsv(filename, rows, options) {
    const headers = Array.from(rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set()));
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    persistBlob(blob, filename, options);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function persistBlob(blob, filename, options) {
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Could not read export blob."));
        reader.readAsDataURL(blob);
      });
      const contentBase64 = dataUrl.split(",", 2)[1] || "";
      await fetch("/api/exports/save", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow: "plaquequant",
          filename,
          contentBase64,
          mimeType: blob.type || "text/csv",
          studyId: state.exportStudy.currentStudyId || "",
          patientStudyId: options?.patientStudyId || "",
        }),
      });
    } catch (error) {
      console.warn("Could not mirror PlaqueQuant export.", error);
    }
  }

  function csvCell(value) {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[char]);
  }

  async function checkEngines() {
    els.engineStatus.textContent = "Checking local Python/model bridge...";
    els.checkEnginesButton.disabled = true;
    try {
      const response = await fetch("/api/plaquequant/engines", { credentials: "same-origin" });
      const payload = response.ok ? await response.json() : null;
      state.engineStatus = payload;
      renderEngineList(payload?.engines || []);
      const readyCount = (payload?.engines || []).filter((engine) => engine.ready).length;
      els.engineStatus.textContent = readyCount
        ? `${readyCount} local engine${readyCount === 1 ? "" : "s"} ready`
        : "No external engine ready; using browser scaffold";
    } catch (_error) {
      renderEngineList([]);
      els.engineStatus.textContent = "Bridge unavailable; using browser scaffold";
    } finally {
      els.checkEnginesButton.disabled = false;
    }
  }

  function renderEngineList(localEngines) {
    const byId = new Map((localEngines || []).map((engine) => [engine.id, engine]));
    els.engineList.innerHTML = "";
    ENGINE_REFERENCES.forEach((reference) => {
      const local = byId.get(reference.id) || {};
      const ready = Boolean(local.ready);
      const item = document.createElement("div");
      item.className = "engine-item";
      item.innerHTML = [
        `<strong>${escapeHtml(reference.name)} <span class="engine-badge ${ready ? "ready" : "missing"}">${ready ? "ready" : "not ready"}</span></strong>`,
        `<small>${escapeHtml(reference.role)}</small>`,
        `<small>${escapeHtml(local.message || reference.status)}</small>`,
      ].join("");
      els.engineList.appendChild(item);
    });
  }

  function bindEvents() {
    els.dicomInput.addEventListener("change", (event) => handleFiles(event.target.files, "replace"));
    els.dicomFolderInput.addEventListener("change", (event) => handleFiles(event.target.files, "replace"));
    els.clearButton.addEventListener("click", () => window.location.reload());
    els.loadSeriesButton.addEventListener("click", () => loadSelectedSeries().catch((error) => setStatus(error.message, "error")));
    els.layoutPresentation.addEventListener("click", () => setLayout("presentation"));
    els.layoutMpr.addEventListener("click", () => setLayout("mpr"));
    els.checkEnginesButton.addEventListener("click", () => checkEngines().catch((error) => setStatus(error.message, "error")));
    els.runCenterlineButton.addEventListener("click", runCenterlineScaffold);
    els.validateCenterlineButton.addEventListener("click", validateCenterline);
    els.runWallButton.addEventListener("click", runWallScaffold);
    els.validateWallButton.addEventListener("click", validateWall);
    els.runAnalysisButton.addEventListener("click", () => runCandidateAnalysis().catch((error) => {
      els.runAnalysisButton.disabled = false;
      setStatus(error.message, "error");
    }));
    els.opacityInput.addEventListener("input", () => {
      state.analysis.opacity = Number.parseFloat(els.opacityInput.value);
      scheduleRender();
    });
    els.activeVessel.addEventListener("change", () => {
      const lesion = selectedLesion();
      if (lesion) {
        lesion.vessel = els.activeVessel.value;
      }
      renderReview();
      renderAll();
    });
    els.manualAddButton.addEventListener("click", () => {
      state.activeTool = state.activeTool === "manualAdd" ? "window" : "manualAdd";
      els.manualAddButton.classList.toggle("is-active", state.activeTool === "manualAdd");
      els.seedButton.classList.remove("is-active");
    });
    els.seedButton.addEventListener("click", () => {
      state.activeTool = state.activeTool === "seed" ? "window" : "seed";
      els.seedButton.classList.toggle("is-active", state.activeTool === "seed");
      els.manualAddButton.classList.remove("is-active");
    });
    els.excludeLesionButton.addEventListener("click", () => {
      const lesion = selectedLesion();
      if (lesion) {
        lesion.excluded = !lesion.excluded;
        renderReview();
        renderAll();
      }
    });
    els.assignVesselButton.addEventListener("click", () => {
      const lesion = selectedLesion();
      if (lesion) {
        lesion.vessel = els.activeVessel.value;
        renderReview();
        renderAll();
      }
    });
    els.exportButton.addEventListener("click", () => exportCsvs().catch((error) => setStatus(error.message, "error")));
    document.querySelectorAll("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => setTool(button.dataset.tool));
    });
    Object.values(els.canvases).forEach((canvas) => {
      canvas.addEventListener("pointerdown", canvasPointerDown);
      canvas.addEventListener("pointermove", canvasPointerMove);
      canvas.addEventListener("pointerup", canvasPointerUp);
      canvas.addEventListener("pointercancel", canvasPointerUp);
      canvas.addEventListener("wheel", handleWheel, { passive: false });
      canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    });
    window.addEventListener("resize", renderAll);
    window.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() === "w") setTool("window");
      if (event.key.toLowerCase() === "z") setTool("zoom");
      if (event.key.toLowerCase() === "m") setTool("pan");
    });
    els.dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      els.dropZone.classList.add("is-dragging");
    });
    els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("is-dragging"));
    els.dropZone.addEventListener("drop", async (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("is-dragging");
      const files = await collectDroppedFiles(event.dataTransfer);
      handleFiles(files, "replace");
    });
  }

  function dedupeLocalFiles(files) {
    const seen = new Set();
    return files.filter((file) => {
      const key = [file.webkitRelativePath || file.name || "file", file.size || 0, file.lastModified || 0].join("::");
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  async function loadExportStudies() {
    if (!exportStudyApi) {
      return;
    }
    try {
      const payload = await exportStudyApi.load();
      state.exportStudy.studies = Array.isArray(payload?.studies) ? payload.studies : [];
      state.exportStudy.currentStudyId = safeString(payload?.currentStudyId) || "";
    } catch (_error) {}
  }

  function init() {
    initElements();
    bindEvents();
    loadExportStudies();
    renderSeries();
    renderReview();
    renderEngineList([]);
  }

  init();
})();
