(function attachHagradLineProfileRaw(global) {
  "use strict";

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function dot(a, b) {
    return (a?.[0] || 0) * (b?.[0] || 0) + (a?.[1] || 0) * (b?.[1] || 0) + (a?.[2] || 0) * (b?.[2] || 0);
  }

  function subtract(a, b) {
    return [
      (a?.[0] || 0) - (b?.[0] || 0),
      (a?.[1] || 0) - (b?.[1] || 0),
      (a?.[2] || 0) - (b?.[2] || 0),
    ];
  }

  function add(a, b) {
    return [
      (a?.[0] || 0) + (b?.[0] || 0),
      (a?.[1] || 0) + (b?.[1] || 0),
      (a?.[2] || 0) + (b?.[2] || 0),
    ];
  }

  function scale(vector, factor) {
    return [
      (vector?.[0] || 0) * factor,
      (vector?.[1] || 0) * factor,
      (vector?.[2] || 0) * factor,
    ];
  }

  function length(vector) {
    return Math.hypot(vector?.[0] || 0, vector?.[1] || 0, vector?.[2] || 0);
  }

  function clampIndex(value, size) {
    if (!Number.isFinite(value) || !Number.isFinite(size) || size <= 0) {
      return -1;
    }
    const rounded = Math.round(value);
    return rounded >= 0 && rounded < size ? rounded : -1;
  }

  function sliceForIndex(volume, zIndex) {
    if (!volume || !Array.isArray(volume.slices)) {
      return null;
    }
    return volume.slices[zIndex] || null;
  }

  function getSliceDimensions(volume, slice) {
    const rows = Math.trunc(toNumber(slice?.rows, volume?.rows || 0));
    const columns = Math.trunc(toNumber(slice?.columns, volume?.columns || 0));
    return { rows, columns };
  }

  function getStoredValueAtIndex(volume, xIndex, yIndex, zIndex) {
    const slice = sliceForIndex(volume, zIndex);
    if (!slice || !slice.pixels) {
      return null;
    }
    const { rows, columns } = getSliceDimensions(volume, slice);
    if (xIndex < 0 || yIndex < 0 || xIndex >= columns || yIndex >= rows) {
      return null;
    }
    const offset = yIndex * columns + xIndex;
    const raw = slice.pixels[offset];
    return Number.isFinite(raw) ? raw : null;
  }

  function rescaleStoredValue(slice, storedValue) {
    if (!Number.isFinite(storedValue)) {
      return null;
    }
    const slope = toNumber(slice?.slope, 1);
    const intercept = toNumber(slice?.intercept, 0);
    return storedValue * slope + intercept;
  }

  function getHuAtIndex(volume, xIndex, yIndex, zIndex) {
    const slice = sliceForIndex(volume, zIndex);
    const raw = getStoredValueAtIndex(volume, xIndex, yIndex, zIndex);
    const hu = rescaleStoredValue(slice, raw);
    return Number.isFinite(hu) ? hu : null;
  }

  function worldToVolumeCoordinates(volume, world) {
    if (!volume || !Array.isArray(world)) {
      return null;
    }
    const origin = Array.isArray(volume.origin) ? volume.origin : [0, 0, 0];
    const rowDirection = Array.isArray(volume.rowDirection) ? volume.rowDirection : [1, 0, 0];
    const columnDirection = Array.isArray(volume.columnDirection) ? volume.columnDirection : [0, 1, 0];
    const normal = Array.isArray(volume.normal) ? volume.normal : [0, 0, 1];
    const columnSpacing = toNumber(volume.columnSpacing, toNumber(volume.spacingX, 1)) || 1;
    const rowSpacing = toNumber(volume.rowSpacing, toNumber(volume.spacingY, 1)) || 1;
    const sliceSpacing = toNumber(volume.sliceSpacing, toNumber(volume.spacingZ, 1)) || 1;
    const delta = subtract(world, origin);
    return {
      x: dot(delta, rowDirection) / columnSpacing,
      y: dot(delta, columnDirection) / rowSpacing,
      z: dot(delta, normal) / sliceSpacing,
    };
  }

  function sampleNearest(volume, coordinates) {
    if (!volume || !coordinates) {
      return {
        hu: null,
        rawStoredValue: null,
        voxelX: null,
        voxelY: null,
        voxelZ: null,
      };
    }
    const zSize = Array.isArray(volume.slices) ? volume.slices.length : 0;
    const zIndex = clampIndex(coordinates.z, zSize);
    const slice = sliceForIndex(volume, zIndex);
    const { rows, columns } = getSliceDimensions(volume, slice);
    const xIndex = clampIndex(coordinates.x, columns);
    const yIndex = clampIndex(coordinates.y, rows);
    if (xIndex < 0 || yIndex < 0 || zIndex < 0) {
      return {
        hu: null,
        rawStoredValue: null,
        voxelX: coordinates.x,
        voxelY: coordinates.y,
        voxelZ: coordinates.z,
      };
    }
    const rawStoredValue = getStoredValueAtIndex(volume, xIndex, yIndex, zIndex);
    const hu = rescaleStoredValue(slice, rawStoredValue);
    return {
      hu: Number.isFinite(hu) ? hu : null,
      rawStoredValue: Number.isFinite(rawStoredValue) ? rawStoredValue : null,
      voxelX: coordinates.x,
      voxelY: coordinates.y,
      voxelZ: coordinates.z,
    };
  }

  function sampleTrilinearHu(volume, coordinates) {
    if (!volume || !coordinates) {
      return null;
    }
    const zSize = Array.isArray(volume.slices) ? volume.slices.length : 0;
    const firstSlice = sliceForIndex(volume, 0);
    const { rows, columns } = getSliceDimensions(volume, firstSlice);
    if (
      coordinates.x < 0 ||
      coordinates.y < 0 ||
      coordinates.z < 0 ||
      coordinates.x > columns - 1 ||
      coordinates.y > rows - 1 ||
      coordinates.z > zSize - 1
    ) {
      return null;
    }
    const x0 = Math.floor(coordinates.x);
    const y0 = Math.floor(coordinates.y);
    const z0 = Math.floor(coordinates.z);
    const x1 = Math.min(x0 + 1, columns - 1);
    const y1 = Math.min(y0 + 1, rows - 1);
    const z1 = Math.min(z0 + 1, zSize - 1);
    const tx = coordinates.x - x0;
    const ty = coordinates.y - y0;
    const tz = coordinates.z - z0;
    const c000 = getHuAtIndex(volume, x0, y0, z0);
    const c100 = getHuAtIndex(volume, x1, y0, z0);
    const c010 = getHuAtIndex(volume, x0, y1, z0);
    const c110 = getHuAtIndex(volume, x1, y1, z0);
    const c001 = getHuAtIndex(volume, x0, y0, z1);
    const c101 = getHuAtIndex(volume, x1, y0, z1);
    const c011 = getHuAtIndex(volume, x0, y1, z1);
    const c111 = getHuAtIndex(volume, x1, y1, z1);
    const values = [c000, c100, c010, c110, c001, c101, c011, c111];
    if (values.some((value) => !Number.isFinite(value))) {
      return null;
    }
    const c00 = c000 * (1 - tx) + c100 * tx;
    const c10 = c010 * (1 - tx) + c110 * tx;
    const c01 = c001 * (1 - tx) + c101 * tx;
    const c11 = c011 * (1 - tx) + c111 * tx;
    const c0 = c00 * (1 - ty) + c10 * ty;
    const c1 = c01 * (1 - ty) + c11 * ty;
    return c0 * (1 - tz) + c1 * tz;
  }

  function defaultSampleSpacingMm(volume) {
    const spacings = [
      toNumber(volume?.columnSpacing, NaN),
      toNumber(volume?.rowSpacing, NaN),
      toNumber(volume?.sliceSpacing, NaN),
    ].filter((value) => Number.isFinite(value) && value > 0);
    const minSpacing = spacings.length ? Math.min(...spacings) : 1;
    return Math.max(0.1, minSpacing / 2);
  }

  function resolveSampleSpacingMm(volume, requestedSpacingMm) {
    const requested = Number(requestedSpacingMm);
    if (Number.isFinite(requested) && requested > 0) {
      return requested;
    }
    return defaultSampleSpacingMm(volume);
  }

  function computeStats(values) {
    const finiteValues = values.filter((value) => Number.isFinite(value));
    if (!finiteValues.length) {
      return {
        minHu: null,
        maxHu: null,
        meanHu: null,
        sdHu: null,
      };
    }
    const minHu = Math.min(...finiteValues);
    const maxHu = Math.max(...finiteValues);
    const meanHu = finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
    const variance = finiteValues.reduce((sum, value) => sum + (value - meanHu) ** 2, 0) / finiteValues.length;
    return {
      minHu,
      maxHu,
      meanHu,
      sdHu: Math.sqrt(variance),
    };
  }

  function sampleLineProfile(options) {
    const volume = options?.volume;
    const startWorld = options?.startWorld;
    const endWorld = options?.endWorld;
    if (!volume || !Array.isArray(startWorld) || !Array.isArray(endWorld)) {
      return null;
    }
    const vector = subtract(endWorld, startWorld);
    const lengthMm = length(vector);
    if (!Number.isFinite(lengthMm) || lengthMm <= 0) {
      return null;
    }
    const sampleSpacingMm = resolveSampleSpacingMm(volume, options.sampleSpacingMm);
    const segmentCount = Math.max(1, Math.ceil(lengthMm / sampleSpacingMm));
    const sampleCount = segmentCount + 1;
    const interpolationMethod = options.interpolationMethod || "nearest";
    const plane = options.plane || "";
    const samples = [];
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const distanceMm = sampleIndex === sampleCount - 1 ? lengthMm : Math.min(lengthMm, sampleIndex * sampleSpacingMm);
      const normalizedPosition = lengthMm > 0 ? distanceMm / lengthMm : 0;
      const world = add(startWorld, scale(vector, normalizedPosition));
      const voxel = worldToVolumeCoordinates(volume, world);
      const nearest = sampleNearest(volume, voxel);
      const huTrilinear = sampleTrilinearHu(volume, voxel);
      const huNearest = nearest.hu;
      const primaryHu = interpolationMethod === "trilinear" && Number.isFinite(huTrilinear) ? huTrilinear : huNearest;
      samples.push({
        sampleIndex,
        distanceMm,
        normalizedPosition,
        hu: Number.isFinite(primaryHu) ? primaryHu : null,
        huNearest: Number.isFinite(huNearest) ? huNearest : null,
        huTrilinear: Number.isFinite(huTrilinear) ? huTrilinear : null,
        rawStoredValue: Number.isFinite(nearest.rawStoredValue) ? nearest.rawStoredValue : null,
        worldX: world[0],
        worldY: world[1],
        worldZ: world[2],
        voxelX: voxel?.x ?? null,
        voxelY: voxel?.y ?? null,
        voxelZ: voxel?.z ?? null,
        plane,
        interpolationMethod,
        sampleSpacingMm,
      });
    }
    const stats = computeStats(samples.map((sample) => sample.hu));
    return {
      lengthMm,
      sampleCount,
      sampleSpacingMm,
      interpolationMethod,
      distancesMm: samples.map((sample) => sample.distanceMm),
      valuesHu: samples.map((sample) => sample.hu),
      smoothHu: [],
      rawSamples: samples,
      ...stats,
    };
  }

  const api = {
    computeStats,
    defaultSampleSpacingMm,
    resolveSampleSpacingMm,
    sampleLineProfile,
    sampleNearest,
    sampleTrilinearHu,
    worldToVolumeCoordinates,
  };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  global.HAGRadLineProfileRaw = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
