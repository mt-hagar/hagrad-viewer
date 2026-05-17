import { LABELS, LABELS_BY_CODE, CORONARY_LABEL_CODES, REFERENCE_DEFINITIONS } from "./constants.js";

const sharedCore = window.HAGRadCore;

if (!sharedCore) {
  throw new Error("Missing shared core script: /src/shared/hagrad-core.js");
}

const { clamp } = sharedCore;

export function getVoxelVolumeMm3(volume) {
  return volume.rowSpacing * volume.columnSpacing * volume.sliceSpacing;
}

export function getPixelAreaMm2(volume) {
  return volume.rowSpacing * volume.columnSpacing;
}

export function getSliceHuValue(volume, sliceIndex, pixelIndex) {
  const slice = volume?.slices?.[sliceIndex];
  if (!slice) {
    return null;
  }
  return slice.pixels[pixelIndex] * slice.slope + slice.intercept;
}

export function getNeighborhoodStats(volume, sliceIndex, centerX, centerY, radius) {
  if (!volume) {
    return { mean: 0, sd: 0, max: -Infinity, min: Infinity, count: 0 };
  }
  let sum = 0;
  let sumSquares = 0;
  let max = -Infinity;
  let min = Infinity;
  let count = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = clamp(Math.round(centerX) + dx, 0, volume.columns - 1);
      const y = clamp(Math.round(centerY) + dy, 0, volume.rows - 1);
      const value = getSliceHuValue(volume, sliceIndex, y * volume.columns + x);
      if (!Number.isFinite(value)) {
        continue;
      }
      sum += value;
      sumSquares += value * value;
      max = Math.max(max, value);
      min = Math.min(min, value);
      count += 1;
    }
  }
  if (!count) {
    return { mean: 0, sd: 0, max: -Infinity, min: Infinity, count: 0 };
  }
  const mean = sum / count;
  const variance = Math.max(0, sumSquares / count - mean * mean);
  return {
    mean,
    sd: Math.sqrt(variance),
    max,
    min,
    count,
  };
}

export function sampleCircularRoi(volume, sliceIndex, centerX, centerY, radiusPx) {
  if (!volume) {
    return null;
  }
  const radius = Math.max(1, Math.round(radiusPx || 1));
  const radiusSquared = radius * radius;
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  let peakHu = -Infinity;

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > radiusSquared) {
        continue;
      }
      const x = clamp(Math.round(centerX) + dx, 0, volume.columns - 1);
      const y = clamp(Math.round(centerY) + dy, 0, volume.rows - 1);
      const pixelIndex = y * volume.columns + x;
      const hu = getSliceHuValue(volume, sliceIndex, pixelIndex);
      if (!Number.isFinite(hu)) {
        continue;
      }
      sum += hu;
      sumSquares += hu * hu;
      peakHu = Math.max(peakHu, hu);
      count += 1;
    }
  }

  if (!count) {
    return null;
  }

  const meanHu = sum / count;
  const variance = Math.max(0, sumSquares / count - meanHu * meanHu);
  return {
    shape: "circle",
    sliceIndex,
    centerX,
    centerY,
    radiusPx: radius,
    pixelCount: count,
    areaMm2: count * getPixelAreaMm2(volume),
    meanHu,
    sdHu: Math.sqrt(variance),
    peakHu,
  };
}

export function samplePolygonRoi(volume, sliceIndex, points) {
  if (!volume) {
    return null;
  }
  const normalized = normalizeContourPoints(points, volume);
  if (normalized.length < 3 || polygonArea(normalized) < 20) {
    return null;
  }

  let minX = volume.columns - 1;
  let minY = volume.rows - 1;
  let maxX = 0;
  let maxY = 0;
  normalized.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });

  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  let peakHu = -Infinity;
  let sumX = 0;
  let sumY = 0;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!pointInPolygon(normalized, x + 0.5, y + 0.5)) {
        continue;
      }
      const pixelIndex = y * volume.columns + x;
      const hu = getSliceHuValue(volume, sliceIndex, pixelIndex);
      if (!Number.isFinite(hu)) {
        continue;
      }
      sum += hu;
      sumSquares += hu * hu;
      peakHu = Math.max(peakHu, hu);
      sumX += x + 0.5;
      sumY += y + 0.5;
      count += 1;
    }
  }

  if (!count) {
    return null;
  }

  const meanHu = sum / count;
  const variance = Math.max(0, sumSquares / count - meanHu * meanHu);
  return {
    shape: "polygon",
    sliceIndex,
    points: normalized,
    centerX: sumX / count,
    centerY: sumY / count,
    pixelCount: count,
    areaMm2: count * getPixelAreaMm2(volume),
    meanHu,
    sdHu: Math.sqrt(variance),
    peakHu,
  };
}

export function createEmptyLabelSlices(volume, fillValue = 0) {
  return Array.from({ length: volume?.depth || 0 }, () => {
    const slice = new Uint8Array((volume?.rows || 0) * (volume?.columns || 0));
    if (fillValue > 0) {
      slice.fill(fillValue);
    }
    return slice;
  });
}

export function cloneLabelSlices(labelSlices) {
  return (labelSlices || []).map((slice) => new Uint8Array(slice));
}

export function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return 0;
  }
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) * 0.5;
}

export function pointInPolygon(points, x, y) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const left = points[index];
    const right = points[previous];
    const intersects =
      left.y > y !== right.y > y &&
      x < ((right.x - left.x) * (y - left.y)) / Math.max(right.y - left.y, 1e-6) + left.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

export function normalizeContourPoints(points, volume) {
  if (!volume) {
    return [];
  }
  return (points || [])
    .map((point) => ({
      x: clamp(Math.round(point.x), 0, volume.columns - 1),
      y: clamp(Math.round(point.y), 0, volume.rows - 1),
    }))
    .filter((point, index, array) => {
      const previous = array[index - 1];
      return !previous || previous.x !== point.x || previous.y !== point.y;
    });
}

export function extractConnectedComponents2D(volume, sliceIndex, mask) {
  const width = volume?.columns || 0;
  const height = volume?.rows || 0;
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

      const hu = getSliceHuValue(volume, sliceIndex, current);
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
    const hu = getSliceHuValue(volume, sliceIndex, pixelIndex);
    if (hu != null && hu > -300) {
      mask[pixelIndex] = 1;
    }
  }

  const components = extractConnectedComponents2D(volume, sliceIndex, mask);
  if (!components.length) {
    return null;
  }

  const imageCenterX = volume.columns / 2;
  const imageCenterY = volume.rows / 2;
  return (
    components.reduce((best, component) => {
      const distanceToCenter = Math.hypot(component.centerX - imageCenterX, component.centerY - imageCenterY);
      const score = component.pixelCount - distanceToCenter * 18;
      if (!best || score > best.score) {
        return { score, component };
      }
      return best;
    }, null)?.component || null
  );
}

export function estimateDefaultAnalysisRegion(volume) {
  const body = estimateBodyBounds(volume);
  if (!body) {
    return {
      centerX: volume.columns * 0.5,
      centerY: volume.rows * 0.5,
      radiusX: volume.columns * 0.28,
      radiusY: volume.rows * 0.22,
    };
  }

  const bodyWidth = body.maxX - body.minX + 1;
  const bodyHeight = body.maxY - body.minY + 1;
  return {
    centerX: clamp(body.centerX, volume.columns * 0.24, volume.columns * 0.76),
    centerY: clamp(body.centerY - bodyHeight * 0.06, volume.rows * 0.24, volume.rows * 0.76),
    radiusX: clamp(bodyWidth * 0.31, volume.columns * 0.16, volume.columns * 0.38),
    radiusY: clamp(bodyHeight * 0.24, volume.rows * 0.11, volume.rows * 0.32),
  };
}

export function pointInsideAnalysisRegion(x, y, region) {
  const dx = (x + 0.5 - region.centerX) / Math.max(region.radiusX, 1);
  const dy = (y + 0.5 - region.centerY) / Math.max(region.radiusY, 1);
  return dx * dx + dy * dy <= 1;
}

function aggregatePicks(picks) {
  const usable = (picks || []).filter((pick) => Number.isFinite(pick?.meanHu));
  if (!usable.length) {
    return null;
  }
  const totalWeight = usable.reduce((sum, pick) => sum + Math.max(1, pick.pixelCount || 1), 0);
  const meanHu =
    usable.reduce((sum, pick) => sum + pick.meanHu * Math.max(1, pick.pixelCount || 1), 0) / Math.max(1, totalWeight);
  const variance =
    usable.reduce((sum, pick) => {
      const weight = Math.max(1, pick.pixelCount || 1);
      const delta = (pick.meanHu || 0) - meanHu;
      return sum + weight * ((pick.sdHu || 0) * (pick.sdHu || 0) + delta * delta);
    }, 0) / Math.max(1, totalWeight);
  return {
    meanHu,
    sdHu: Math.sqrt(Math.max(0, variance)),
    areaMm2: usable.reduce((sum, pick) => sum + (pick.areaMm2 || 0), 0) / usable.length,
    pixelCount: totalWeight,
    picks: usable,
    centerX: usable[usable.length - 1]?.centerX ?? null,
    centerY: usable[usable.length - 1]?.centerY ?? null,
    sliceIndex: usable[usable.length - 1]?.sliceIndex ?? null,
  };
}

function getReferenceSummary(referenceStore, key) {
  return aggregatePicks(referenceStore?.[key]?.picks || []);
}

export function summarizeReferences(referenceStore) {
  return REFERENCE_DEFINITIONS.map((definition) => ({
    ...definition,
    summary: getReferenceSummary(referenceStore, definition.key),
  }));
}

export function hasRequiredReferences(referenceStore) {
  return summarizeReferences(referenceStore)
    .filter((definition) => definition.required)
    .every((definition) => definition.summary);
}

export function buildReferenceModel({ referenceStore, seriesCandidate, volume, config }) {
  const requiredMissing = summarizeReferences(referenceStore)
    .filter((definition) => definition.required && !definition.summary)
    .map((definition) => definition.label);

  if (requiredMissing.length) {
    throw new Error(`Pick the required references first: ${requiredMissing.join(", ")}.`);
  }

  const aortic = getReferenceSummary(referenceStore, "aortic_root_contrast");
  const pulmonary = getReferenceSummary(referenceStore, "pulmonary_trunk_contrast");
  const lm = getReferenceSummary(referenceStore, "lm_coronary_lumen");
  const calcified = getReferenceSummary(referenceStore, "calcified_plaque_reference");
  const myocardium = getReferenceSummary(referenceStore, "myocardium_background");
  const fat = getReferenceSummary(referenceStore, "fat_background");
  const aortaWall = getReferenceSummary(referenceStore, "ascending_aorta_wall");
  const bloodPool = getReferenceSummary(referenceStore, "blood_pool_generic");
  const noiseRef = getReferenceSummary(referenceStore, "noise_reference");
  const characterization = seriesCandidate?.characterization || {};

  const contrastRefs = [aortic, pulmonary, lm, bloodPool].filter(Boolean);
  const contrastMean =
    contrastRefs.reduce((sum, entry) => sum + entry.meanHu * Math.max(1, entry.pixelCount || 1), 0) /
    Math.max(1, contrastRefs.reduce((sum, entry) => sum + Math.max(1, entry.pixelCount || 1), 0));
  const contrastSd =
    contrastRefs.reduce((sum, entry) => sum + Math.max(1, entry.pixelCount || 1) * (entry.sdHu || 0), 0) /
    Math.max(1, contrastRefs.reduce((sum, entry) => sum + Math.max(1, entry.pixelCount || 1), 0));

  const softMean = Number.isFinite(myocardium?.meanHu)
    ? myocardium.meanHu
    : Number.isFinite(aortaWall?.meanHu)
      ? aortaWall.meanHu
      : contrastMean - 170;
  const fatMean = Number.isFinite(fat?.meanHu) ? fat.meanHu : softMean - 120;
  const calciumMean = calcified.meanHu;
  const calciumSd = calcified.sdHu || 0;
  const noiseSigma = Math.max(8, noiseRef?.sdHu || contrastSd || 12);
  const intensitySpan = Math.max(80, calciumMean - contrastMean);

  const usesVncLikeImage = characterization.vncLike && !characterization.contrastLikely;
  const spectralAware = characterization.spectralCapable || characterization.vncLike;
  const spectralOrConventional = spectralAware ? "spectral_or_vnc_aware" : "conventional_single_energy";
  const methodType = usesVncLikeImage
    ? "spectral_vnc_like_research_agatston_style"
    : spectralAware
      ? "spectral_capable_post_contrast_research_estimate"
      : "conventional_post_contrast_research_estimate";

  const adaptiveMinHu = usesVncLikeImage
    ? Math.max(130, softMean + 120, calciumMean - Math.max(120, intensitySpan * 0.55))
    : Math.max(
        contrastMean + Math.max(config.minResidualHu || 35, noiseSigma * 1.8),
        softMean + 180,
        calciumMean - Math.max(140, intensitySpan * 0.45)
      );
  const residualFloorHu = usesVncLikeImage
    ? Math.max(18, noiseSigma * 1.3)
    : Math.max(config.minResidualHu || 35, noiseSigma * 1.8, intensitySpan * 0.15);
  const localResidualFloorHu = usesVncLikeImage
    ? Math.max(12, noiseSigma * 1.15)
    : Math.max(config.localResidualHu || 18, noiseSigma * 1.3, intensitySpan * 0.09);

  const confidenceNote = usesVncLikeImage
    ? "Spectral/VNC-like input detected. This branch is more defensible than ordinary CTA, but it remains research-only in this prototype unless independently validated."
    : spectralAware
      ? "Spectral-capable CTA metadata was detected, but the active series still behaves like a post-contrast research estimate rather than validated noncontrast-equivalent scoring."
      : "Ordinary single-energy post-contrast CTA detected. Calcium and iodine overlap, so this output is a post-contrast research estimate rather than a true noncontrast-equivalent calcium score.";

  return {
    methodType,
    spectralOrConventional,
    usesVncLikeImage,
    spectralAware,
    confidenceNote,
    contrastMean,
    contrastSd,
    softMean,
    fatMean,
    calciumMean,
    calciumSd,
    noiseSigma,
    intensitySpan,
    adaptiveMinHu,
    residualFloorHu,
    localResidualFloorHu,
    manualSeedThresholdHu: Math.max(130, adaptiveMinHu * 0.92),
    referencePoints: {
      aortic,
      pulmonary,
      lm,
      calcified,
      myocardium,
      fat,
      aortaWall,
      bloodPool,
      noiseRef,
    },
    referenceSummaryRows: summarizeReferences(referenceStore),
    config: {
      minAreaMm2: config.minAreaMm2,
      massCalibrationFactor: config.massCalibrationFactor,
      minResidualHu: config.minResidualHu,
      localResidualHu: config.localResidualHu,
    },
  };
}

function estimateAutoLabelForComponent(component, region, model) {
  const x = component.centerX;
  const y = component.centerY;
  const imageCenterX = region.centerX;
  const imageCenterY = region.centerY;
  const aortic = model.referencePoints.aortic;
  const lm = model.referencePoints.lm;

  if (aortic && Math.hypot(x - aortic.centerX, y - aortic.centerY) <= Math.max(region.radiusX * 0.14, 26)) {
    return 7;
  }

  if (
    aortic &&
    y < aortic.centerY + region.radiusY * 0.08 &&
    Math.abs(x - aortic.centerX) < region.radiusX * 0.12
  ) {
    return 5;
  }

  if (lm && Math.hypot(x - lm.centerX, y - lm.centerY) <= Math.max(region.radiusX * 0.08, 18)) {
    return 4;
  }

  if (x < imageCenterX - region.radiusX * 0.12) {
    return 3;
  }

  if (y < imageCenterY - region.radiusY * 0.02) {
    return 1;
  }

  if (x > imageCenterX + region.radiusX * 0.03) {
    return 2;
  }

  return x >= imageCenterX ? 1 : 3;
}

export function growThresholdComponentFromSeed(volume, sliceIndex, seedPixelIndex, model) {
  if (!volume || !model) {
    return [];
  }
  const seedHu = getSliceHuValue(volume, sliceIndex, seedPixelIndex);
  if (!Number.isFinite(seedHu) || seedHu < model.manualSeedThresholdHu) {
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
        if (nextX < 0 || nextX >= volume.columns || (!dx && !dy)) {
          continue;
        }
        const nextIndex = nextY * volume.columns + nextX;
        if (visited[nextIndex]) {
          continue;
        }
        visited[nextIndex] = 1;
        const hu = getSliceHuValue(volume, sliceIndex, nextIndex);
        if (Number.isFinite(hu) && hu >= model.manualSeedThresholdHu) {
          queue.push(nextIndex);
        }
      }
    }
  }

  return pixels;
}

function shouldKeepPixel(volume, sliceIndex, pixelIndex, x, y, region, model) {
  if (!pointInsideAnalysisRegion(x, y, region)) {
    return false;
  }

  const hu = getSliceHuValue(volume, sliceIndex, pixelIndex);
  if (!Number.isFinite(hu) || hu < model.adaptiveMinHu) {
    return false;
  }

  const local = getNeighborhoodStats(volume, sliceIndex, x, y, 2);
  const localResidual = hu - local.mean;
  const contrastResidual = hu - model.contrastMean;
  const softResidual = hu - model.softMean;
  const calciumLikelihood = (hu - model.contrastMean) / Math.max(1, model.intensitySpan);

  if (contrastResidual < model.residualFloorHu) {
    return false;
  }
  if (localResidual < model.localResidualFloorHu) {
    return false;
  }
  if (softResidual < model.residualFloorHu * 0.65) {
    return false;
  }
  if (calciumLikelihood < 0.26) {
    return false;
  }

  return true;
}

export function runContrastEstimation({ volume, slabRange, seriesCandidate, referenceStore, config }) {
  if (!volume) {
    throw new Error("Load a series before estimating calcification.");
  }

  const region = estimateDefaultAnalysisRegion(volume);
  const model = buildReferenceModel({
    referenceStore,
    seriesCandidate,
    volume,
    config,
  });
  const autoLabelSlices = new Array(volume.depth);
  const top = clamp(Math.min(slabRange.top, slabRange.bottom), 0, volume.depth - 1);
  const bottom = clamp(Math.max(slabRange.top, slabRange.bottom), 0, volume.depth - 1);
  const minPixels = Math.max(1, Math.ceil((config.minAreaMm2 || 0.8) / Math.max(getPixelAreaMm2(volume), 1e-6)));

  for (let sliceIndex = top; sliceIndex <= bottom; sliceIndex += 1) {
    const workingMask = new Uint8Array(volume.rows * volume.columns);
    const labelSlice = new Uint8Array(volume.rows * volume.columns);
    autoLabelSlices[sliceIndex] = labelSlice;
    for (let y = 0; y < volume.rows; y += 1) {
      for (let x = 0; x < volume.columns; x += 1) {
        const pixelIndex = y * volume.columns + x;
        if (shouldKeepPixel(volume, sliceIndex, pixelIndex, x, y, region, model)) {
          workingMask[pixelIndex] = 1;
        }
      }
    }

    const components = extractConnectedComponents2D(volume, sliceIndex, workingMask);
    components.forEach((component) => {
      if (component.pixelCount < minPixels) {
        return;
      }
      if (!Number.isFinite(component.peakHu) || component.peakHu < model.adaptiveMinHu + model.localResidualFloorHu * 0.5) {
        return;
      }
      if (!Number.isFinite(component.meanHu) || component.meanHu < model.contrastMean + model.residualFloorHu * 0.6) {
        return;
      }
      const labelCode = estimateAutoLabelForComponent(component, region, model);
      component.pixels.forEach((pixelIndex) => {
        labelSlice[pixelIndex] = labelCode;
      });
    });
  }

  return {
    autoLabelSlices,
    methodSummary: {
      ...model,
      region,
      slabTop: top,
      slabBottom: bottom,
    },
  };
}

export function composeLabelSlices({ volume, autoLabelSlices, overrideLabelSlices, slabRange }) {
  const labelSlices = (autoLabelSlices || []).slice();
  const top = clamp(Math.min(slabRange.top, slabRange.bottom), 0, volume.depth - 1);
  const bottom = clamp(Math.max(slabRange.top, slabRange.bottom), 0, volume.depth - 1);

  if (!(overrideLabelSlices instanceof Map) || !overrideLabelSlices.size) {
    return { labelSlices };
  }

  overrideLabelSlices.forEach((overrideMap, rawSliceIndex) => {
    const sliceIndex = Number(rawSliceIndex);
    if (!Number.isFinite(sliceIndex) || sliceIndex < top || sliceIndex > bottom || !overrideMap?.size) {
      return;
    }
    const sourceSlice = autoLabelSlices?.[sliceIndex] || new Uint8Array(volume.rows * volume.columns);
    const nextSlice = new Uint8Array(sourceSlice);
    overrideMap.forEach((overrideValue, pixelIndex) => {
      nextSlice[pixelIndex] = overrideValue > 0 ? overrideValue : 0;
    });
    labelSlices[sliceIndex] = nextSlice;
  });

  return { labelSlices };
}

function agatstonStyleFactorForPeakHu(peakHu, methodSummary) {
  if (!Number.isFinite(peakHu)) {
    return 0;
  }
  if (methodSummary.usesVncLikeImage) {
    if (peakHu < 130) {
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

  const residual = peakHu - methodSummary.contrastMean;
  if (residual < methodSummary.residualFloorHu) {
    return 0;
  }
  if (residual < 70) {
    return 1;
  }
  if (residual < 150) {
    return 2;
  }
  if (residual < 250) {
    return 3;
  }
  return 4;
}

function computeResults(volume, labelSlices, components, methodSummary, config) {
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
        integratedResearchVolume: 0,
        agatstonStyleScore: 0,
        coronary: label.coronary,
      },
    ])
  );

  for (let sliceIndex = 0; sliceIndex < volume.depth; sliceIndex += 1) {
    const labelSlice = labelSlices[sliceIndex];
    if (!labelSlice) {
      continue;
    }
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
      const hu = getSliceHuValue(volume, sliceIndex, pixelIndex);
      if (Number.isFinite(hu)) {
        const researchHu = methodSummary.usesVncLikeImage ? Math.max(0, hu) : Math.max(0, hu - methodSummary.contrastMean);
        bucket.integratedResearchVolume += researchHu * voxelVolumeMm3;
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
      const sliceComponents = extractConnectedComponents2D(volume, sliceIndex, mask);
      sliceComponents.forEach((component) => {
        const areaMm2 = component.pixelCount * pixelAreaMm2;
        if (areaMm2 < (config.minAreaMm2 || 0.8)) {
          return;
        }
        const densityFactor = agatstonStyleFactorForPeakHu(component.peakHu, methodSummary);
        if (!densityFactor) {
          return;
        }
        perLabel.get(label.code).agatstonStyleScore += areaMm2 * densityFactor;
      });
    });
  }

  components.forEach((component) => {
    const bucket = perLabel.get(component.labelCode);
    if (bucket) {
      bucket.lesions += 1;
    }
  });

  const rawRows = LABELS.map((label) => {
    const bucket = perLabel.get(label.code);
    bucket.volumeMm3 = bucket.voxelCount * voxelVolumeMm3;
    const equivalentMassMg =
      ((config.massCalibrationFactor || 0.81) * bucket.integratedResearchVolume) / 1000;
    return {
      labelCode: label.code,
      vessel: bucket.vessel,
      lesions: bucket.lesions,
      volume_mm3: roundTo(bucket.volumeMm3, 1),
      equivalent_mass_mg: roundTo(equivalentMassMg, 2),
      agatston_style_score: roundTo(bucket.agatstonStyleScore, 1),
      coronary: bucket.coronary,
      method_type: methodSummary.methodType,
      confidence_note: methodSummary.confidenceNote,
      spectral_or_conventional: methodSummary.spectralOrConventional,
    };
  });

  const rows = rawRows.filter(
    (row) => row.coronary || row.lesions || row.volume_mm3 || row.agatston_style_score
  );

  const coronaryRows = rows.filter((row) => row.coronary);
  const totalRow = rows.reduce(
    (accumulator, row) => {
      accumulator.lesions += row.lesions;
      accumulator.volume_mm3 += Number(row.volume_mm3) || 0;
      accumulator.equivalent_mass_mg += Number(row.equivalent_mass_mg) || 0;
      accumulator.agatston_style_score += Number(row.agatston_style_score) || 0;
      return accumulator;
    },
    {
      vessel: "Total Calcification",
      lesions: 0,
      volume_mm3: 0,
      equivalent_mass_mg: 0,
      agatston_style_score: 0,
    }
  );
  const coronaryTotalRow = coronaryRows.reduce(
    (accumulator, row) => {
      accumulator.lesions += row.lesions;
      accumulator.volume_mm3 += Number(row.volume_mm3) || 0;
      accumulator.equivalent_mass_mg += Number(row.equivalent_mass_mg) || 0;
      accumulator.agatston_style_score += Number(row.agatston_style_score) || 0;
      return accumulator;
    },
    {
      vessel: "Total Coronary",
      lesions: 0,
      volume_mm3: 0,
      equivalent_mass_mg: 0,
      agatston_style_score: 0,
    }
  );

  const formattedRows = [
    ...rows.map((row) => ({
      ...row,
      isTotal: false,
    })),
    {
      labelCode: 0,
      vessel: coronaryTotalRow.vessel,
      volume_mm3: roundTo(coronaryTotalRow.volume_mm3, 1),
      equivalent_mass_mg: roundTo(coronaryTotalRow.equivalent_mass_mg, 2),
      agatston_style_score: roundTo(coronaryTotalRow.agatston_style_score, 1),
      lesions: coronaryTotalRow.lesions,
      coronary: true,
      method_type: methodSummary.methodType,
      confidence_note: methodSummary.confidenceNote,
      spectral_or_conventional: methodSummary.spectralOrConventional,
      isTotal: true,
    },
    {
      labelCode: 0,
      vessel: totalRow.vessel,
      volume_mm3: roundTo(totalRow.volume_mm3, 1),
      equivalent_mass_mg: roundTo(totalRow.equivalent_mass_mg, 2),
      agatston_style_score: roundTo(totalRow.agatston_style_score, 1),
      lesions: totalRow.lesions,
      coronary: false,
      method_type: methodSummary.methodType,
      confidence_note: methodSummary.confidenceNote,
      spectral_or_conventional: methodSummary.spectralOrConventional,
      isTotal: true,
    },
  ];

  return {
    lesionCount: components.length,
    totalVolumeMm3: roundTo(totalRow.volume_mm3, 1),
    equivalentMassMg: roundTo(totalRow.equivalent_mass_mg, 2),
    agatstonStyleScore: roundTo(totalRow.agatston_style_score, 1),
    coronaryVolumeMm3: roundTo(coronaryTotalRow.volume_mm3, 1),
    rows: formattedRows,
  };
}

export function rebuildAnalysisOutputs({ volume, labelSlices, methodSummary, config }) {
  if (!volume || !labelSlices?.length) {
    return {
      componentLookupBySlice: [],
      components: [],
      results: null,
    };
  }

  const components = [];
  const lookup = Array.from({ length: volume.depth }, () => new Map());
  const visitedBySlice = new Map();
  let nextId = 1;

  function getVisitedSlice(sliceIndex) {
    let visitedSlice = visitedBySlice.get(sliceIndex);
    if (!visitedSlice) {
      const labelSlice = labelSlices[sliceIndex];
      if (!labelSlice) {
        return null;
      }
      visitedSlice = new Uint8Array(labelSlice.length);
      visitedBySlice.set(sliceIndex, visitedSlice);
    }
    return visitedSlice;
  }

  for (let sliceIndex = 0; sliceIndex < volume.depth; sliceIndex += 1) {
    const labelSlice = labelSlices[sliceIndex];
    if (!labelSlice) {
      continue;
    }
    const visitedSlice = getVisitedSlice(sliceIndex);
    for (let pixelIndex = 0; pixelIndex < labelSlice.length; pixelIndex += 1) {
      const labelCode = labelSlice[pixelIndex];
      if (!labelCode || visitedSlice[pixelIndex]) {
        continue;
      }

      const queue = [[sliceIndex, pixelIndex]];
      visitedSlice[pixelIndex] = 1;
      const pixelsBySlice = new Map();
      let voxelCount = 0;
      let sumHu = 0;
      let peakHu = -Infinity;
      let minSlice = sliceIndex;
      let maxSlice = sliceIndex;
      let sumX = 0;
      let sumY = 0;

      while (queue.length) {
        const [currentSlice, currentIndex] = queue.pop();
        const x = currentIndex % volume.columns;
        const y = (currentIndex - x) / volume.columns;
        voxelCount += 1;
        minSlice = Math.min(minSlice, currentSlice);
        maxSlice = Math.max(maxSlice, currentSlice);
        sumX += x + 0.5;
        sumY += y + 0.5;
        if (!pixelsBySlice.has(currentSlice)) {
          pixelsBySlice.set(currentSlice, []);
        }
        pixelsBySlice.get(currentSlice).push(currentIndex);
        lookup[currentSlice].set(currentIndex, nextId);

        const hu = getSliceHuValue(volume, currentSlice, currentIndex);
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
              if (nextX < 0 || nextX >= volume.columns || (!dx && !dy && !dz)) {
                continue;
              }
              const nextIndex = nextY * volume.columns + nextX;
              const nextLabelSlice = labelSlices[nextSlice];
              if (!nextLabelSlice || nextLabelSlice[nextIndex] !== labelCode) {
                continue;
              }
              const nextVisitedSlice = getVisitedSlice(nextSlice);
              if (!nextVisitedSlice || nextVisitedSlice[nextIndex]) {
                continue;
              }
              nextVisitedSlice[nextIndex] = 1;
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
        centerX: sumX / Math.max(1, voxelCount),
        centerY: sumY / Math.max(1, voxelCount),
        labelCode,
        labelName: LABELS_BY_CODE.get(labelCode)?.label || "Other",
        pixelsBySlice,
      });
      nextId += 1;
    }
  }

  components.sort((left, right) => right.volumeMm3 - left.volumeMm3);

  return {
    componentLookupBySlice: lookup,
    components,
    results: computeResults(volume, labelSlices, components, methodSummary, config),
  };
}

export function getComponentSummaryRows(components, results) {
  if (!results) {
    return [];
  }
  return results.rows
    .filter((row) => !row.isTotal)
    .map((row) => {
      const assigned = components.filter((component) => component.labelCode === row.labelCode);
      const minSlice = assigned.length ? Math.min(...assigned.map((component) => component.minSlice)) : null;
      const maxSlice = assigned.length ? Math.max(...assigned.map((component) => component.maxSlice)) : null;
      return {
        row,
        labelMeta: LABELS_BY_CODE.get(row.labelCode) || null,
        componentCount: assigned.length,
        minSlice,
        maxSlice,
      };
    });
}

export function getSuppressedPreviewHu(volume, sliceIndex, pixelIndex, labelSlice, methodSummary) {
  const hu = getSliceHuValue(volume, sliceIndex, pixelIndex);
  if (!Number.isFinite(hu) || !methodSummary) {
    return hu;
  }

  if (methodSummary.usesVncLikeImage) {
    return hu;
  }

  const labelCode = labelSlice?.[pixelIndex] || 0;
  const softMean = Number.isFinite(methodSummary.softMean) ? methodSummary.softMean : 45;
  const fatMean = Number.isFinite(methodSummary.fatMean) ? methodSummary.fatMean : -90;
  const contrastMean = Number.isFinite(methodSummary.contrastMean) ? methodSummary.contrastMean : softMean + 220;
  const contrastSpan = Math.max(80, contrastMean - softMean);
  const vncBloodTarget = clamp(softMean - 18, 10, 38);
  const residualHu = hu - contrastMean;

  if (labelCode > 0) {
    const residual = Math.max(0, residualHu);
    return clamp(125 + residual * 0.72, 125, Math.max(220, methodSummary.calciumMean * 0.72));
  }

  if (hu <= softMean + Math.max(12, contrastSpan * 0.04)) {
    return hu;
  }

  // Blend contrast-rich pixels toward a VNC-like blood-pool target while preserving some gradation.
  const suppressionOnset = softMean + Math.max(16, contrastSpan * 0.05);
  const t = clamp((hu - suppressionOnset) / Math.max(40, contrastMean - suppressionOnset), 0, 1);
  const smooth = t * t * (3 - 2 * t);
  const blendStrength = 0.55 + smooth * 0.38;
  const preservedResidual = residualHu * (0.06 + (1 - smooth) * 0.08);
  const target = vncBloodTarget + preservedResidual;
  const suppressed = hu * (1 - blendStrength) + target * blendStrength;
  return clamp(suppressed, fatMean, Math.max(vncBloodTarget + 45, 85));
}

function roundTo(value, decimals) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}
