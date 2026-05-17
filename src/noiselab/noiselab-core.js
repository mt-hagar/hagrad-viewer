(function (global) {
  "use strict";

  const sharedCore = global.HAGRadCore || {};
  const dicomApi = global.HAGRadDicom || {};

  const clamp = sharedCore.clamp || ((value, min, max) => Math.min(max, Math.max(min, value)));
  const dot =
    sharedCore.dot ||
    ((left, right) => (left || []).reduce((sum, value, index) => sum + value * ((right || [])[index] || 0), 0));
  const naturalCompare = sharedCore.naturalCompare || ((left, right) => String(left || "").localeCompare(String(right || "")));
  const safeString = sharedCore.safeString || ((value) => (typeof value === "string" ? value.trim() || null : null));
  const sanitizeFilePart =
    sharedCore.sanitizeFilePart ||
    ((value, fallback) => {
      const cleaned = String(value || "")
        .trim()
        .replace(/[^a-z0-9]+/gi, "_")
        .replace(/^_+|_+$/g, "");
      return cleaned || fallback;
    });

  const APP_NAME = "HAGRad NoiseLab";
  const APP_VERSION = "0.2.0-phase2-preview";
  const EXPORT_VERSION = "2026-04-phase1";
  const ROI_TYPE = "square-noise-roi";
  const SQUARE_MODE_PIXEL = "pixel-square";
  const SQUARE_MODE_PHYSICAL = "physical-square";
  const DEFAULT_FIXED_PIXEL_EDGES = Object.freeze([11, 21, 31]);
  const DEFAULT_FIXED_PHYSICAL_EDGE_MM = 10;
  const MINIMUM_RECOMMENDED_PIXEL_COUNT = 25;
  const NPS_ROI_TYPE = "square-nps-roi";
  const NPS_EXPORT_VERSION = "2026-05-nps-v2";
  const COMPARISON_EXPORT_VERSION = "2026-05-reconstruction-comparison-v1";
  const DEFAULT_NPS_EDGE_PX = 64;
  const DEFAULT_NPS_RING_COUNT = 2;
  const DEFAULT_NPS_ROIS_PER_RING = 8;
  const DEFAULT_NPS_RING_SPACING_PX = 96;

  function roundForDisplay(value, digits) {
    if (!Number.isFinite(value)) {
      return null;
    }
    const factor = 10 ** (digits || 0);
    return Math.round(value * factor) / factor;
  }

  function serializeNumber(value) {
    if (!Number.isFinite(value)) {
      return "";
    }
    if (Number.isInteger(value)) {
      return String(value);
    }
    return Number(value.toPrecision(15)).toString();
  }

  function csvEscape(value) {
    const text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function toCsv(columns, rows) {
    const lines = [columns.map(csvEscape).join(",")];
    (rows || []).forEach((row) => {
      lines.push(columns.map((column) => csvEscape(row?.[column])).join(","));
    });
    return `${lines.join("\n")}\n`;
  }

  function quantileSorted(sortedValues, probability) {
    if (!Array.isArray(sortedValues) || !sortedValues.length) {
      return null;
    }
    if (sortedValues.length === 1) {
      return sortedValues[0];
    }
    const p = clamp(Number(probability) || 0, 0, 1);
    const index = (sortedValues.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) {
      return sortedValues[lower];
    }
    const fraction = index - lower;
    return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * fraction;
  }

  function medianAbsoluteDeviation(values, medianValue) {
    const median = Number.isFinite(medianValue) ? medianValue : quantileSorted((values || []).slice().sort((a, b) => a - b), 0.5);
    if (!Number.isFinite(median)) {
      return null;
    }
    const deviations = (values || [])
      .filter(Number.isFinite)
      .map((value) => Math.abs(value - median))
      .sort((a, b) => a - b);
    return quantileSorted(deviations, 0.5);
  }

  function averageFinite(values) {
    const finiteValues = (values || []).filter(Number.isFinite);
    if (!finiteValues.length) {
      return null;
    }
    return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  }

  function computeStats(values) {
    const finiteValues = (values || []).filter(Number.isFinite);
    if (!finiteValues.length) {
      return null;
    }

    const sorted = finiteValues.slice().sort((left, right) => left - right);
    const count = sorted.length;
    const sum = sorted.reduce((accumulator, value) => accumulator + value, 0);
    const mean = sum / count;
    let centeredSquareSum = 0;
    let centeredCubeSum = 0;
    let centeredFourthSum = 0;
    sorted.forEach((value) => {
      const centered = value - mean;
      const square = centered * centered;
      centeredSquareSum += square;
      centeredCubeSum += square * centered;
      centeredFourthSum += square * square;
    });

    const variance = Math.max(0, centeredSquareSum / count);
    const sd = Math.sqrt(variance);
    const median = quantileSorted(sorted, 0.5);
    const q1 = quantileSorted(sorted, 0.25);
    const q3 = quantileSorted(sorted, 0.75);
    const iqr = Number.isFinite(q1) && Number.isFinite(q3) ? q3 - q1 : null;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const range = max - min;
    const mad = medianAbsoluteDeviation(sorted, median);
    const coefficientOfVariation = Math.abs(mean) > 1e-12 ? sd / Math.abs(mean) : null;
    const skewness =
      sd > 0
        ? centeredCubeSum / count / (sd * sd * sd)
        : null;
    const kurtosis =
      variance > 0
        ? centeredFourthSum / count / (variance * variance)
        : null;

    return {
      count,
      sum,
      mean,
      sd,
      min,
      max,
      median,
      q1,
      q3,
      iqr,
      range,
      mad,
      coefficientOfVariation,
      skewness,
      kurtosis,
      variance,
    };
  }

  function patientPointToImageCoord(record, patientPoint) {
    if (
      !record ||
      !Array.isArray(patientPoint) ||
      patientPoint.length < 3 ||
      !Array.isArray(record.imagePositionPatient) ||
      record.imagePositionPatient.length < 3 ||
      !Array.isArray(record.rowDirection) ||
      record.rowDirection.length < 3 ||
      !Array.isArray(record.columnDirection) ||
      record.columnDirection.length < 3
    ) {
      return null;
    }

    const spacingY = record.pixelSpacing?.[0];
    const spacingX = record.pixelSpacing?.[1];
    if (!Number.isFinite(spacingX) || !Number.isFinite(spacingY) || spacingX <= 0 || spacingY <= 0) {
      return null;
    }

    const offset = sharedCore.subtractVectors
      ? sharedCore.subtractVectors(patientPoint, record.imagePositionPatient)
      : patientPoint.map((value, index) => value - record.imagePositionPatient[index]);
    return {
      xImg: dot(offset, record.rowDirection) / spacingX,
      yImg: dot(offset, record.columnDirection) / spacingY,
    };
  }

  function slicePositionMm(record, normalVector) {
    const normal = normalVector || record?.normalVector;
    if (!record || !Array.isArray(record.imagePositionPatient) || record.imagePositionPatient.length < 3 || !Array.isArray(normal)) {
      return null;
    }
    return dot(record.imagePositionPatient, normal);
  }

  function findNearestSliceIndexForPatientPoint(volume, patientPoint, fallbackIndex) {
    const fallback = clamp(Math.round(Number(fallbackIndex) || 0), 0, Math.max(0, (volume?.depth || 1) - 1));
    if (!volume?.slices?.length || !Array.isArray(patientPoint) || patientPoint.length < 3) {
      return {
        index: fallback,
        distanceMm: null,
        method: "fallback",
      };
    }

    const normal =
      (Array.isArray(volume.normalDirection) && volume.normalDirection.length >= 3 && volume.normalDirection) ||
      volume.slices.find((slice) => Array.isArray(slice?.record?.normalVector) && slice.record.normalVector.length >= 3)?.record.normalVector ||
      null;
    if (!normal) {
      return {
        index: fallback,
        distanceMm: null,
        method: "fallback",
      };
    }

    const targetPosition = dot(patientPoint, normal);
    let bestIndex = fallback;
    let bestDistance = Number.POSITIVE_INFINITY;
    volume.slices.forEach((slice, index) => {
      const position = slicePositionMm(slice?.record, normal);
      if (!Number.isFinite(position)) {
        return;
      }
      const distance = Math.abs(position - targetPosition);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return {
      index: bestIndex,
      distanceMm: Number.isFinite(bestDistance) ? bestDistance : null,
      method: Number.isFinite(bestDistance) ? "patient-position" : "fallback",
    };
  }

  function getSpacing(volume) {
    return {
      spacingX: Number(volume?.columnSpacing) || null,
      spacingY: Number(volume?.rowSpacing) || null,
    };
  }

  function supportsPhysicalSquare(volume) {
    const spacing = getSpacing(volume);
    return Number.isFinite(spacing.spacingX) && Number.isFinite(spacing.spacingY);
  }

  function snapPixelSquareCenter(value, edgePx) {
    const size = Math.max(1, Math.round(Number(edgePx) || 1));
    const offset = size % 2 === 0 ? 0.5 : 0;
    return Math.round((Number(value) || 0) - offset) + offset;
  }

  function createRoiId(sequence) {
    return `roi_${String(sequence).padStart(3, "0")}`;
  }

  function createDefaultRoiLabel(sequence) {
    return `ROI ${String(sequence).padStart(2, "0")}`;
  }

  function createSquareRoi(options) {
    const mode = options?.squareMode === SQUARE_MODE_PHYSICAL ? SQUARE_MODE_PHYSICAL : SQUARE_MODE_PIXEL;
    const edgePx = Math.max(1, Math.round(Number(options?.edgePx) || DEFAULT_FIXED_PIXEL_EDGES[1]));
    const centerXImg =
      mode === SQUARE_MODE_PIXEL
        ? snapPixelSquareCenter(options?.centerXImg, edgePx)
        : Number(options?.centerXImg) || 0;
    const centerYImg =
      mode === SQUARE_MODE_PIXEL
        ? snapPixelSquareCenter(options?.centerYImg, edgePx)
        : Number(options?.centerYImg) || 0;

    return {
      id: safeString(options?.id) || createRoiId(Number(options?.sequence) || 1),
      label: safeString(options?.label) || createDefaultRoiLabel(Number(options?.sequence) || 1),
      type: ROI_TYPE,
      squareMode: mode,
      datasetId: safeString(options?.datasetId) || "",
      sliceIndex: Number.isFinite(options?.sliceIndex) ? Math.round(options.sliceIndex) : 0,
      centerXImg,
      centerYImg,
      edgePx,
      edgeMm: mode === SQUARE_MODE_PHYSICAL ? Math.max(0.1, Number(options?.edgeMm) || DEFAULT_FIXED_PHYSICAL_EDGE_MM) : null,
      visible: options?.visible !== false,
      createdAt: safeString(options?.createdAt) || new Date().toISOString(),
      updatedAt: safeString(options?.updatedAt) || new Date().toISOString(),
      notes: Array.isArray(options?.notes) ? options.notes.slice() : [],
    };
  }

  function cloneRoi(roi) {
    return {
      ...roi,
      notes: Array.isArray(roi?.notes) ? roi.notes.slice() : [],
    };
  }

  function resolveSquareGeometry(roi, volume) {
    if (!roi) {
      return null;
    }

    const spacing = getSpacing(volume);
    const mode = roi.squareMode === SQUARE_MODE_PHYSICAL ? SQUARE_MODE_PHYSICAL : SQUARE_MODE_PIXEL;
    const centerXImg =
      mode === SQUARE_MODE_PIXEL
        ? snapPixelSquareCenter(roi.centerXImg, roi.edgePx)
        : Number(roi.centerXImg) || 0;
    const centerYImg =
      mode === SQUARE_MODE_PIXEL
        ? snapPixelSquareCenter(roi.centerYImg, roi.edgePx)
        : Number(roi.centerYImg) || 0;

    if (mode === SQUARE_MODE_PHYSICAL && !supportsPhysicalSquare(volume)) {
      return {
        error: "Physical-square mode requires Pixel Spacing in both x and y.",
      };
    }

    let xMinBoundaryImg;
    let xMaxBoundaryImg;
    let yMinBoundaryImg;
    let yMaxBoundaryImg;
    let edgePxX = null;
    let edgePxY = null;
    let edgeMmX = null;
    let edgeMmY = null;
    let nominalEdgePx = null;
    let nominalEdgeMm = null;

    if (mode === SQUARE_MODE_PIXEL) {
      nominalEdgePx = Math.max(1, Math.round(Number(roi.edgePx) || 1));
      const halfSpan = nominalEdgePx / 2;
      xMinBoundaryImg = centerXImg - halfSpan;
      xMaxBoundaryImg = centerXImg + halfSpan;
      yMinBoundaryImg = centerYImg - halfSpan;
      yMaxBoundaryImg = centerYImg + halfSpan;
      edgePxX = nominalEdgePx;
      edgePxY = nominalEdgePx;
      edgeMmX = Number.isFinite(spacing.spacingX) ? nominalEdgePx * spacing.spacingX : null;
      edgeMmY = Number.isFinite(spacing.spacingY) ? nominalEdgePx * spacing.spacingY : null;
      nominalEdgeMm =
        Number.isFinite(edgeMmX) && Number.isFinite(edgeMmY) && Math.abs(edgeMmX - edgeMmY) < 1e-9 ? edgeMmX : null;
    } else {
      nominalEdgeMm = Math.max(0.1, Number(roi.edgeMm) || DEFAULT_FIXED_PHYSICAL_EDGE_MM);
      xMinBoundaryImg = centerXImg - nominalEdgeMm / (2 * spacing.spacingX);
      xMaxBoundaryImg = centerXImg + nominalEdgeMm / (2 * spacing.spacingX);
      yMinBoundaryImg = centerYImg - nominalEdgeMm / (2 * spacing.spacingY);
      yMaxBoundaryImg = centerYImg + nominalEdgeMm / (2 * spacing.spacingY);
      edgePxX = nominalEdgeMm / spacing.spacingX;
      edgePxY = nominalEdgeMm / spacing.spacingY;
      edgeMmX = nominalEdgeMm;
      edgeMmY = nominalEdgeMm;
      nominalEdgePx = null;
    }

    const colStart = Math.ceil(xMinBoundaryImg);
    const colEnd = Math.floor(xMaxBoundaryImg);
    const rowStart = Math.ceil(yMinBoundaryImg);
    const rowEnd = Math.floor(yMaxBoundaryImg);
    const selectedColumnCount = Math.max(0, colEnd - colStart + 1);
    const selectedRowCount = Math.max(0, rowEnd - rowStart + 1);
    const clippedColStart = clamp(colStart, 0, Math.max(0, Number(volume?.columns || 1) - 1));
    const clippedColEnd = clamp(colEnd, 0, Math.max(0, Number(volume?.columns || 1) - 1));
    const clippedRowStart = clamp(rowStart, 0, Math.max(0, Number(volume?.rows || 1) - 1));
    const clippedRowEnd = clamp(rowEnd, 0, Math.max(0, Number(volume?.rows || 1) - 1));
    const clippedColumnCount = colEnd >= colStart ? Math.max(0, clippedColEnd - clippedColStart + 1) : 0;
    const clippedRowCount = rowEnd >= rowStart ? Math.max(0, clippedRowEnd - clippedRowStart + 1) : 0;
    const areaPx = clippedColumnCount * clippedRowCount;
    const areaMm2 =
      Number.isFinite(spacing.spacingX) && Number.isFinite(spacing.spacingY)
        ? areaPx * spacing.spacingX * spacing.spacingY
        : null;

    return {
      squareMode: mode,
      centerXImg,
      centerYImg,
      xMinBoundaryImg,
      xMaxBoundaryImg,
      yMinBoundaryImg,
      yMaxBoundaryImg,
      intendedColumnStart: colStart,
      intendedColumnEnd: colEnd,
      intendedRowStart: rowStart,
      intendedRowEnd: rowEnd,
      columnStart: clippedColumnCount ? clippedColStart : null,
      columnEnd: clippedColumnCount ? clippedColEnd : null,
      rowStart: clippedRowCount ? clippedRowStart : null,
      rowEnd: clippedRowCount ? clippedRowEnd : null,
      nominalEdgePx,
      nominalEdgeMm,
      edgePxX,
      edgePxY,
      edgeMmX,
      edgeMmY,
      selectedColumnCount: clippedColumnCount,
      selectedRowCount: clippedRowCount,
      intendedSelectedColumnCount: selectedColumnCount,
      intendedSelectedRowCount: selectedRowCount,
      areaPx,
      areaMm2,
      spacingX: spacing.spacingX,
      spacingY: spacing.spacingY,
      touchesBoundary:
        xMinBoundaryImg < -0.5 ||
        yMinBoundaryImg < -0.5 ||
        xMaxBoundaryImg > Number(volume?.columns || 0) - 0.5 ||
        yMaxBoundaryImg > Number(volume?.rows || 0) - 0.5,
    };
  }

  function extractSquareRoiPixels(volume, sliceIndex, roi) {
    const geometry = resolveSquareGeometry(roi, volume);
    if (!geometry || geometry.error) {
      return {
        geometry,
        error: geometry?.error || "ROI geometry could not be resolved.",
      };
    }

    const slice = volume?.slices?.[sliceIndex];
    const record = slice?.record || volume?.records?.[sliceIndex] || null;
    if (!slice || !slice.pixels || !Number.isFinite(volume?.columns) || !Number.isFinite(volume?.rows)) {
      return {
        geometry,
        error: "The selected slice has no source pixel data.",
      };
    }

    const units = dicomApi.getCalibrationUnits ? dicomApi.getCalibrationUnits(record, slice) : "rescaled";
    const entries = [];
    const storedValues = [];
    const calibratedValues = [];
    const storedMatrix = [];
    const rescaledMatrix = [];
    const calibratedMatrix = [];

    if (
      !Number.isFinite(geometry.columnStart) ||
      !Number.isFinite(geometry.columnEnd) ||
      !Number.isFinite(geometry.rowStart) ||
      !Number.isFinite(geometry.rowEnd)
    ) {
      return {
        geometry,
        error: "ROI does not intersect the current image.",
      };
    }

    for (let row = geometry.rowStart; row <= geometry.rowEnd; row += 1) {
      const storedRow = [];
      const rescaledRow = [];
      const calibratedRow = [];

      for (let column = geometry.columnStart; column <= geometry.columnEnd; column += 1) {
        const pixelIndex = row * volume.columns + column;
        const storedPixelValue = slice.pixels[pixelIndex];
        const rescaledValue = storedPixelValue * slice.slope + slice.intercept;
        const calibratedValue = rescaledValue;
        const localMm = dicomApi.pixelCenterToLocalMm ? dicomApi.pixelCenterToLocalMm(record, column, row) : null;
        const patient = dicomApi.pixelCenterToPatient ? dicomApi.pixelCenterToPatient(record, column, row) : null;

        storedRow.push(storedPixelValue);
        rescaledRow.push(rescaledValue);
        calibratedRow.push(calibratedValue);
        storedValues.push(storedPixelValue);
        calibratedValues.push(calibratedValue);
        entries.push({
          rowInRoi: row - geometry.rowStart,
          colInRoi: column - geometry.columnStart,
          imageX: column,
          imageY: row,
          physicalXmm: localMm?.xMm ?? null,
          physicalYmm: localMm?.yMm ?? null,
          patientXmm: patient?.[0] ?? null,
          patientYmm: patient?.[1] ?? null,
          patientZmm: patient?.[2] ?? null,
          storedPixelValue,
          rescaledValue,
          calibratedValue,
          units,
        });
      }

      storedMatrix.push(storedRow);
      rescaledMatrix.push(rescaledRow);
      calibratedMatrix.push(calibratedRow);
    }

    const statsRaw = computeStats(storedValues);
    const statsCalibrated = computeStats(calibratedValues);
    const warnings = {
      touchesBoundaryFlag: geometry.touchesBoundary,
      tooSmallFlag: geometry.areaPx < MINIMUM_RECOMMENDED_PIXEL_COUNT,
      highGradientOverlapFlag: null,
      heterogeneityWarningFlag: null,
      homogeneityScore: null,
    };

    return {
      geometry,
      record,
      slice,
      entries,
      storedMatrix,
      rescaledMatrix,
      calibratedMatrix,
      units,
      statsRaw,
      statsCalibrated,
      warnings,
    };
  }

  function buildHistogram(values, binCount) {
    const finiteValues = (values || []).filter(Number.isFinite);
    if (!finiteValues.length) {
      return null;
    }
    const bins = Math.max(2, Math.round(Number(binCount) || 32));
    const min = Math.min(...finiteValues);
    const max = Math.max(...finiteValues);
    const width = max === min ? 1 : (max - min) / bins;
    const counts = new Array(bins).fill(0);

    finiteValues.forEach((value) => {
      const rawIndex = width === 0 ? 0 : Math.floor((value - min) / width);
      const index = clamp(rawIndex, 0, bins - 1);
      counts[index] += 1;
    });

    return counts.map((count, index) => {
      const binLower = min + width * index;
      const binUpper = index === bins - 1 ? max : min + width * (index + 1);
      return {
        binIndex: index,
        binLower,
        binUpper,
        binCenter: (binLower + binUpper) / 2,
        count,
        normalizedFrequency: count / finiteValues.length,
      };
    });
  }

  function matrixColumn(matrix, columnIndex) {
    return (matrix || []).map((row) => row?.[columnIndex]).filter(Number.isFinite);
  }

  function buildProfileSamples(values, spacingMm, units) {
    return (values || []).map((value, sampleIndex) => ({
      sampleIndex,
      distancePx: sampleIndex,
      distanceMm: Number.isFinite(spacingMm) ? sampleIndex * spacingMm : null,
      rawValue: Number.isFinite(value) ? value : null,
      units: units || "",
    }));
  }

  function buildProfileDescriptor(profileType, label, axis, aggregation, values, spacingMm, units) {
    const samples = buildProfileSamples(values, spacingMm, units);
    const finiteValues = samples.map((sample) => sample.rawValue).filter(Number.isFinite);
    const stats = computeStats(finiteValues);
    const profileMean = stats?.mean ?? null;
    const deviations = samples.map((sample) => (Number.isFinite(sample.rawValue) && Number.isFinite(profileMean) ? sample.rawValue - profileMean : null));
    const absoluteDeviations = deviations.map((value) => (Number.isFinite(value) ? Math.abs(value) : null));
    const deviationStats = computeStats(deviations.filter(Number.isFinite));
    const absoluteDeviationStats = computeStats(absoluteDeviations.filter(Number.isFinite));

    return {
      type: profileType,
      label,
      axis,
      aggregation,
      sampleCount: samples.length,
      spacingMm: Number.isFinite(spacingMm) ? spacingMm : null,
      units: units || "",
      samples: samples.map((sample, index) => ({
        ...sample,
        deviationFromProfileMean: deviations[index],
        absoluteDeviationFromProfileMean: absoluteDeviations[index],
      })),
      values: samples.map((sample) => sample.rawValue),
      deviations,
      absoluteDeviations,
      stats,
      deviationStats,
      absoluteDeviationStats,
    };
  }

  function buildRoiProfileAnalysis(analysis, options) {
    const matrix = analysis?.calibratedMatrix;
    if (!Array.isArray(matrix) || !matrix.length || !Array.isArray(matrix[0]) || !matrix[0].length) {
      return null;
    }

    const rowCount = matrix.length;
    const columnCount = matrix[0].length;
    const centerRowIndex = Math.floor((rowCount - 1) / 2);
    const centerColumnIndex = Math.floor((columnCount - 1) / 2);
    const spacingX = analysis?.geometry?.spacingX ?? null;
    const spacingY = analysis?.geometry?.spacingY ?? null;
    const units = analysis?.units || "";
    const histogramBins = Math.max(4, Math.round(Number(options?.histogramBins) || 24));
    const flattened = matrix.flat().filter(Number.isFinite);

    const horizontalCenter = buildProfileDescriptor(
      "horizontal-center",
      "Horizontal center line",
      "x",
      "center-line",
      matrix[centerRowIndex].slice(),
      spacingX,
      units
    );
    const verticalCenter = buildProfileDescriptor(
      "vertical-center",
      "Vertical center line",
      "y",
      "center-line",
      matrixColumn(matrix, centerColumnIndex),
      spacingY,
      units
    );
    const horizontalMean = buildProfileDescriptor(
      "horizontal-mean",
      "Mean horizontal profile",
      "x",
      "column-mean",
      Array.from({ length: columnCount }, (_, columnIndex) => averageFinite(matrixColumn(matrix, columnIndex))),
      spacingX,
      units
    );
    const verticalMean = buildProfileDescriptor(
      "vertical-mean",
      "Mean vertical profile",
      "y",
      "row-mean",
      matrix.map((row) => averageFinite(row)),
      spacingY,
      units
    );

    const profiles = [horizontalCenter, verticalCenter, horizontalMean, verticalMean];
    const profilesByType = profiles.reduce((accumulator, profile) => {
      accumulator[profile.type] = profile;
      return accumulator;
    }, {});

    const roiMean = analysis?.statsCalibrated?.mean ?? null;
    const roiMedian = analysis?.statsCalibrated?.median ?? null;
    const deviationFromRoiMeanMatrix = matrix.map((row) =>
      row.map((value) => (Number.isFinite(value) && Number.isFinite(roiMean) ? value - roiMean : null))
    );
    const absoluteDeviationFromRoiMedianMatrix = matrix.map((row) =>
      row.map((value) => (Number.isFinite(value) && Number.isFinite(roiMedian) ? Math.abs(value - roiMedian) : null))
    );

    return {
      rowCount,
      columnCount,
      centerRowIndex,
      centerColumnIndex,
      units,
      histogramBinCount: histogramBins,
      histogram: buildHistogram(flattened, histogramBins),
      profiles,
      profilesByType,
      roiMean,
      roiMedian,
      rawMatrix: matrix.map((row) => row.slice()),
      deviationFromRoiMeanMatrix,
      absoluteDeviationFromRoiMedianMatrix,
    };
  }

  function isPowerOfTwo(value) {
    const integer = Math.round(Number(value) || 0);
    return integer > 0 && (integer & (integer - 1)) === 0;
  }

  function nextPowerOfTwo(value) {
    let size = 1;
    const target = Math.max(1, Math.round(Number(value) || 1));
    while (size < target) {
      size *= 2;
    }
    return size;
  }

  function fft1d(real, imag) {
    const n = real.length;
    if (!isPowerOfTwo(n) || imag.length !== n) {
      throw new Error("FFT length must be a power of two.");
    }

    let bitReversed = 0;
    for (let index = 1; index < n; index += 1) {
      let bit = n >> 1;
      while (bitReversed & bit) {
        bitReversed ^= bit;
        bit >>= 1;
      }
      bitReversed ^= bit;
      if (index < bitReversed) {
        const tempReal = real[index];
        const tempImag = imag[index];
        real[index] = real[bitReversed];
        imag[index] = imag[bitReversed];
        real[bitReversed] = tempReal;
        imag[bitReversed] = tempImag;
      }
    }

    for (let length = 2; length <= n; length *= 2) {
      const angle = (-2 * Math.PI) / length;
      const stepReal = Math.cos(angle);
      const stepImag = Math.sin(angle);
      for (let start = 0; start < n; start += length) {
        let twiddleReal = 1;
        let twiddleImag = 0;
        for (let offset = 0; offset < length / 2; offset += 1) {
          const evenIndex = start + offset;
          const oddIndex = evenIndex + length / 2;
          const oddReal = real[oddIndex] * twiddleReal - imag[oddIndex] * twiddleImag;
          const oddImag = real[oddIndex] * twiddleImag + imag[oddIndex] * twiddleReal;
          real[oddIndex] = real[evenIndex] - oddReal;
          imag[oddIndex] = imag[evenIndex] - oddImag;
          real[evenIndex] += oddReal;
          imag[evenIndex] += oddImag;
          const nextTwiddleReal = twiddleReal * stepReal - twiddleImag * stepImag;
          twiddleImag = twiddleReal * stepImag + twiddleImag * stepReal;
          twiddleReal = nextTwiddleReal;
        }
      }
    }
  }

  function fft2dReal(matrix) {
    const size = matrix.length;
    if (!isPowerOfTwo(size) || !matrix.every((row) => Array.isArray(row) && row.length === size)) {
      throw new Error("2D NPS FFT requires square power-of-two matrices.");
    }

    const real = matrix.map((row) => row.slice());
    const imag = matrix.map((row) => new Array(size).fill(0));

    for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
      fft1d(real[rowIndex], imag[rowIndex]);
    }

    for (let columnIndex = 0; columnIndex < size; columnIndex += 1) {
      const columnReal = [];
      const columnImag = [];
      for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
        columnReal.push(real[rowIndex][columnIndex]);
        columnImag.push(imag[rowIndex][columnIndex]);
      }
      fft1d(columnReal, columnImag);
      for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
        real[rowIndex][columnIndex] = columnReal[rowIndex];
        imag[rowIndex][columnIndex] = columnImag[rowIndex];
      }
    }

    return { real, imag };
  }

  function fftShift2d(matrix) {
    const size = matrix.length;
    const half = Math.floor(size / 2);
    return Array.from({ length: size }, (_, rowIndex) =>
      Array.from({ length: size }, (_, columnIndex) => matrix[(rowIndex + half) % size][(columnIndex + half) % size])
    );
  }

  function subtractMean(matrix) {
    const values = matrix.flat().filter(Number.isFinite);
    const mean = averageFinite(values);
    return {
      mean,
      variance: computeStats(values)?.variance ?? null,
      matrix: matrix.map((row) => row.map((value) => (Number.isFinite(value) && Number.isFinite(mean) ? value - mean : 0))),
    };
  }

  function buildRadialNpsBins(nps2d, spacingX, spacingY) {
    const size = nps2d.length;
    const frequencyStepX = 1 / (size * spacingX);
    const frequencyStepY = 1 / (size * spacingY);
    const frequencyCellArea = frequencyStepX * frequencyStepY;
    const nyquistX = 1 / (2 * spacingX);
    const nyquistY = 1 / (2 * spacingY);
    const maxFrequency = Math.min(nyquistX, nyquistY);
    const binWidth = Math.min(frequencyStepX, frequencyStepY);
    const binCount = Math.max(1, Math.ceil(maxFrequency / binWidth));
    const bins = Array.from({ length: binCount }, (_, index) => ({
      binIndex: index,
      frequencyLower: index * binWidth,
      frequencyUpper: Math.min(maxFrequency, (index + 1) * binWidth),
      frequencyCenter: Math.min(maxFrequency, (index + 0.5) * binWidth),
      sum: 0,
      integratedPower: 0,
      count: 0,
    }));

    const center = size / 2;
    for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
      const fy = (rowIndex - center) * frequencyStepY;
      for (let columnIndex = 0; columnIndex < size; columnIndex += 1) {
        const fx = (columnIndex - center) * frequencyStepX;
        const radialFrequency = Math.sqrt(fx * fx + fy * fy);
        if (radialFrequency > maxFrequency) {
          continue;
        }
        const binIndex = clamp(Math.floor(radialFrequency / binWidth), 0, binCount - 1);
        bins[binIndex].sum += nps2d[rowIndex][columnIndex];
        bins[binIndex].integratedPower += nps2d[rowIndex][columnIndex] * frequencyCellArea;
        bins[binIndex].count += 1;
      }
    }

    return bins.map((bin) => ({
      binIndex: bin.binIndex,
      frequencyLower: bin.frequencyLower,
      frequencyUpper: bin.frequencyUpper,
      frequencyCenter: bin.frequencyCenter,
      nps: bin.count ? bin.sum / bin.count : null,
      integratedPower: bin.integratedPower,
      frequencyCellCount: bin.count,
      frequencyArea: bin.count * frequencyCellArea,
      sampleCount: bin.count,
    }));
  }

  function enrichRadialNpsBins(radialBins, integratedNps) {
    const totalNps = Number.isFinite(integratedNps) && integratedNps > 0 ? integratedNps : null;
    const radialIntegratedNps = (radialBins || []).reduce(
      (sum, bin) => sum + (Number.isFinite(bin.integratedPower) ? bin.integratedPower : 0),
      0
    );
    const radialDenominator = radialIntegratedNps > 0 ? radialIntegratedNps : null;
    let cumulativeIntegratedPower = 0;
    const bins = (radialBins || []).map((bin) => {
      const binIntegratedPower = Number.isFinite(bin.integratedPower) ? bin.integratedPower : 0;
      cumulativeIntegratedPower += binIntegratedPower;
      return {
        ...bin,
        absoluteNps: bin.nps,
        normalizedNps: totalNps && Number.isFinite(bin.nps) ? bin.nps / totalNps : null,
        normalizedIntegratedPower: totalNps ? binIntegratedPower / totalNps : null,
        binPowerFraction: radialDenominator ? binIntegratedPower / radialDenominator : null,
        cumulativeIntegratedPower,
        cumulativeFraction: radialDenominator ? cumulativeIntegratedPower / radialDenominator : null,
        cumulativeFractionOfTotalNps: totalNps ? cumulativeIntegratedPower / totalNps : null,
      };
    });
    return {
      bins,
      radialIntegratedNps,
      radialCoverageFraction: totalNps ? radialIntegratedNps / totalNps : null,
    };
  }

  function frequencyAtCumulativeFraction(radialBins, targetFraction) {
    const target = Number(targetFraction);
    if (!Number.isFinite(target)) {
      return null;
    }
    for (const bin of radialBins || []) {
      if (!Number.isFinite(bin.cumulativeFraction) || bin.cumulativeFraction < target) {
        continue;
      }
      const previousFraction = Math.max(0, bin.cumulativeFraction - (Number(bin.binPowerFraction) || 0));
      const denominator = bin.cumulativeFraction - previousFraction;
      if (denominator > 1e-12) {
        const t = clamp((target - previousFraction) / denominator, 0, 1);
        return bin.frequencyLower + (bin.frequencyUpper - bin.frequencyLower) * t;
      }
      return bin.frequencyCenter;
    }
    const last = (radialBins || []).filter((bin) => Number.isFinite(bin.frequencyUpper)).pop();
    return last?.frequencyUpper ?? null;
  }

  function buildNpsBandPowers(radialBins, nyquistFrequency) {
    const lowUpper = Number.isFinite(nyquistFrequency) ? nyquistFrequency * 0.25 : null;
    const midUpper = Number.isFinite(nyquistFrequency) ? nyquistFrequency * 0.5 : null;
    const total = (radialBins || []).reduce(
      (sum, bin) => sum + (Number.isFinite(bin.integratedPower) ? bin.integratedPower : 0),
      0
    );
    const bands = [
      { key: "low", label: "Low", lower: 0, upper: lowUpper, integratedPower: 0 },
      { key: "mid", label: "Mid", lower: lowUpper, upper: midUpper, integratedPower: 0 },
      { key: "high", label: "High", lower: midUpper, upper: nyquistFrequency, integratedPower: 0 },
    ];

    (radialBins || []).forEach((bin) => {
      if (!Number.isFinite(bin.frequencyCenter) || !Number.isFinite(bin.integratedPower)) {
        return;
      }
      const target =
        Number.isFinite(lowUpper) && bin.frequencyCenter < lowUpper
          ? bands[0]
          : Number.isFinite(midUpper) && bin.frequencyCenter < midUpper
            ? bands[1]
            : bands[2];
      target.integratedPower += bin.integratedPower;
    });

    return {
      thresholds: {
        lowMidFrequency: lowUpper,
        midHighFrequency: midUpper,
      },
      totalIntegratedPower: total,
      bands: bands.map((band) => ({
        ...band,
        fraction: total > 0 ? band.integratedPower / total : null,
      })),
    };
  }

  function buildNpsAnalysisFromMatrices(matrices, options) {
    const spacingX = Number(options?.spacingX) || null;
    const spacingY = Number(options?.spacingY) || null;
    const units = safeString(options?.units) || "calibrated";
    if (!Number.isFinite(spacingX) || !Number.isFinite(spacingY)) {
      return {
        error: "NPS analysis requires Pixel Spacing in both x and y.",
      };
    }

    const validMatrices = (matrices || []).filter(
      (matrix) => Array.isArray(matrix) && matrix.length && matrix.every((row) => Array.isArray(row) && row.length === matrix.length)
    );
    if (!validMatrices.length) {
      return {
        error: "At least one square ROI matrix is required for NPS analysis.",
      };
    }

    const size = validMatrices[0].length;
    if (!isPowerOfTwo(size)) {
      return {
        error: "NPS ROI edge length must be a power of two for the internal FFT.",
      };
    }
    if (!validMatrices.every((matrix) => matrix.length === size)) {
      return {
        error: "All NPS ROI matrices must have the same square size.",
      };
    }

    const accumulator = Array.from({ length: size }, () => new Array(size).fill(0));
    const roiMeans = [];
    const roiVariances = [];

    validMatrices.forEach((matrix) => {
      const detrended = subtractMean(matrix);
      roiMeans.push(detrended.mean);
      roiVariances.push(detrended.variance);
      const fft = fft2dReal(detrended.matrix);
      const power = Array.from({ length: size }, (_, rowIndex) =>
        Array.from({ length: size }, (_, columnIndex) => {
          const real = fft.real[rowIndex][columnIndex];
          const imag = fft.imag[rowIndex][columnIndex];
          return real * real + imag * imag;
        })
      );
      const shiftedPower = fftShift2d(power);
      for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
        for (let columnIndex = 0; columnIndex < size; columnIndex += 1) {
          accumulator[rowIndex][columnIndex] += shiftedPower[rowIndex][columnIndex];
        }
      }
    });

    const scale = (spacingX * spacingY) / (size * size * validMatrices.length);
    const nps2d = accumulator.map((row) => row.map((value) => value * scale));
    const frequencyStepX = 1 / (size * spacingX);
    const frequencyStepY = 1 / (size * spacingY);
    const integratedNps = nps2d.flat().reduce((sum, value) => sum + value, 0) * frequencyStepX * frequencyStepY;
    const normalizedNps2d =
      Number.isFinite(integratedNps) && integratedNps > 0
        ? nps2d.map((row) => row.map((value) => value / integratedNps))
        : null;
    const radial = enrichRadialNpsBins(buildRadialNpsBins(nps2d, spacingX, spacingY), integratedNps);
    const radialBins = radial.bins;
    const npsValues = radialBins.map((bin) => bin.nps).filter(Number.isFinite);
    const maxNps = npsValues.length ? Math.max(...npsValues) : null;
    const peakBin = radialBins.reduce((best, bin) => {
      if (!Number.isFinite(bin.nps)) {
        return best;
      }
      if (!best || bin.nps > best.nps) {
        return bin;
      }
      return best;
    }, null);
    const totalRadialPower = radial.radialIntegratedNps;
    const centroidFrequency =
      totalRadialPower > 0
        ? radialBins.reduce(
            (sum, bin) => sum + (Number.isFinite(bin.integratedPower) ? bin.frequencyCenter * bin.integratedPower : 0),
            0
          ) / totalRadialPower
        : null;
    const nyquistMin = Math.min(1 / (2 * spacingX), 1 / (2 * spacingY));
    const highFrequencyThreshold = nyquistMin * 0.5;
    const highFrequencyPower = radialBins.reduce(
      (sum, bin) =>
        sum + (bin.frequencyCenter >= highFrequencyThreshold && Number.isFinite(bin.integratedPower) ? bin.integratedPower : 0),
      0
    );
    const bandPowers = buildNpsBandPowers(radialBins, nyquistMin);
    const meanRoiVariance = averageFinite(roiVariances);

    return {
      method: "2d-fft-mean-subtracted-square-roi",
      normalization: "absolute NPS uses dx*dy/(Nx*Ny) scaled unnormalized DFT power averaged across ROIs; normalized NPS divides absolute NPS by integrated NPS (noise variance), not by mean HU",
      normalizedNpsDefinition: "normalized_nps = absolute_nps / integrated_nps; cumulative_fraction is integrated radial power divided by total radial-domain power",
      exportVersion: NPS_EXPORT_VERSION,
      roiCount: validMatrices.length,
      edgePx: size,
      spacingX,
      spacingY,
      units,
      npsUnits: `${units}^2 mm^2`,
      normalizedNpsUnits: "mm^2",
      frequencyUnits: "cycles/mm",
      frequencyStepX,
      frequencyStepY,
      nyquistX: 1 / (2 * spacingX),
      nyquistY: 1 / (2 * spacingY),
      integratedNps,
      radialIntegratedNps: radial.radialIntegratedNps,
      radialCoverageFraction: radial.radialCoverageFraction,
      meanRoiVariance,
      varianceClosureRatio:
        Number.isFinite(meanRoiVariance) && Math.abs(meanRoiVariance) > 1e-12 ? integratedNps / meanRoiVariance : null,
      peakFrequency: peakBin?.frequencyCenter ?? null,
      peakNps: peakBin?.nps ?? null,
      peakNormalizedNps: peakBin?.normalizedNps ?? null,
      maxNps,
      centroidFrequency,
      highFrequencyThreshold,
      highFrequencyPowerFraction: totalRadialPower > 0 ? highFrequencyPower / totalRadialPower : null,
      highFrequencyPowerFractionOfTotalNps:
        Number.isFinite(integratedNps) && integratedNps > 0 ? highFrequencyPower / integratedNps : null,
      f10Frequency: frequencyAtCumulativeFraction(radialBins, 0.1),
      f50Frequency: frequencyAtCumulativeFraction(radialBins, 0.5),
      f90Frequency: frequencyAtCumulativeFraction(radialBins, 0.9),
      bandPowers,
      roiMeans,
      roiVariances,
      nps2d,
      normalizedNps2d,
      radialBins,
    };
  }

  function createConcentricNpsRois(options) {
    const centerXImg = Number(options?.centerXImg) || 0;
    const centerYImg = Number(options?.centerYImg) || 0;
    const rawEdgePx = Math.max(2, Math.round(Number(options?.edgePx) || DEFAULT_NPS_EDGE_PX));
    const edgePx = isPowerOfTwo(rawEdgePx) ? rawEdgePx : nextPowerOfTwo(rawEdgePx);
    const ringCount = Math.max(0, Math.round(Number(options?.ringCount) || DEFAULT_NPS_RING_COUNT));
    const roisPerRing = Math.max(1, Math.round(Number(options?.roisPerRing) || DEFAULT_NPS_ROIS_PER_RING));
    const ringSpacingPx = Math.max(edgePx, Number(options?.ringSpacingPx) || DEFAULT_NPS_RING_SPACING_PX);
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
      roi.label =
        ringIndex === 0
          ? `NPS center ${String(sequence).padStart(2, "0")}`
          : `NPS r${ringIndex} a${angleIndex + 1}`;
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

  function buildNpsAnalysisForRois(volume, rois, options) {
    const analyses = (rois || [])
      .map((roi) => ({
        roi,
        analysis: extractSquareRoiPixels(volume, roi.sliceIndex, roi),
      }))
      .filter((entry) => !entry.analysis?.error);

    const rejected = [];
    const matrices = [];
    analyses.forEach((entry) => {
      const geometry = entry.analysis.geometry;
      if (
        !geometry ||
        geometry.selectedRowCount !== geometry.selectedColumnCount ||
        geometry.selectedRowCount !== Math.round(entry.roi.edgePx || geometry.selectedRowCount)
      ) {
        rejected.push({
          roi_id: entry.roi.id,
          reason: "ROI is clipped or not a complete square matrix.",
        });
        return;
      }
      if (!isPowerOfTwo(geometry.selectedRowCount)) {
        rejected.push({
          roi_id: entry.roi.id,
          reason: "ROI edge is not a power of two.",
        });
        return;
      }
      matrices.push(entry.analysis.calibratedMatrix);
    });

    const spacing = getSpacing(volume);
    const nps = buildNpsAnalysisFromMatrices(matrices, {
      spacingX: spacing.spacingX,
      spacingY: spacing.spacingY,
      units: analyses[0]?.analysis?.units || options?.units || "calibrated",
    });

    return {
      ...nps,
      sourceRoiCount: rois?.length || 0,
      validRoiCount: matrices.length,
      rejectedRoiCount: rejected.length + ((rois?.length || 0) - analyses.length),
      rejectedRois: rejected,
      roiIds: analyses.map((entry) => entry.roi.id),
      roiLabels: analyses.map((entry) => entry.roi.label),
      setId: safeString(options?.setId) || "",
      centerXImg: Number(options?.centerXImg) ?? null,
      centerYImg: Number(options?.centerYImg) ?? null,
    };
  }

  function buildNpsSummaryColumns() {
    return [
      "research_study_id",
      "patient_study_id",
      "nps_set_id",
      "slice_index",
      "center_x_img",
      "center_y_img",
      "source_roi_count",
      "valid_roi_count",
      "rejected_roi_count",
      "edge_px",
      "pixel_spacing_x_mm",
      "pixel_spacing_y_mm",
      "frequency_step_x_cycles_per_mm",
      "frequency_step_y_cycles_per_mm",
      "nyquist_x_cycles_per_mm",
      "nyquist_y_cycles_per_mm",
      "integrated_nps",
      "radial_integrated_nps",
      "radial_coverage_fraction",
      "mean_roi_variance",
      "variance_closure_ratio",
      "peak_frequency_cycles_per_mm",
      "peak_nps",
      "peak_normalized_nps",
      "centroid_frequency_cycles_per_mm",
      "f10_frequency_cycles_per_mm",
      "f50_frequency_cycles_per_mm",
      "f90_frequency_cycles_per_mm",
      "low_mid_threshold_cycles_per_mm",
      "mid_high_threshold_cycles_per_mm",
      "low_frequency_power",
      "low_frequency_power_fraction",
      "mid_frequency_power",
      "mid_frequency_power_fraction",
      "high_frequency_power",
      "high_frequency_threshold_cycles_per_mm",
      "high_frequency_power_fraction",
      "high_frequency_power_fraction_of_total_nps",
      "nps_units",
      "normalized_nps_units",
      "method",
      "normalization",
      "normalized_nps_definition",
      "analysis_timestamp",
      "app_version",
      "export_version",
    ];
  }

  function buildNpsSummaryRow(context, set, analysis) {
    return {
      research_study_id: context.researchStudyId,
      patient_study_id: context.patientStudyId,
      nps_set_id: set?.id || analysis?.setId || "",
      slice_index: set?.sliceIndex ?? "",
      center_x_img: serializeNumber(set?.centerXImg ?? analysis?.centerXImg),
      center_y_img: serializeNumber(set?.centerYImg ?? analysis?.centerYImg),
      source_roi_count: serializeNumber(analysis?.sourceRoiCount),
      valid_roi_count: serializeNumber(analysis?.validRoiCount),
      rejected_roi_count: serializeNumber(analysis?.rejectedRoiCount),
      edge_px: serializeNumber(analysis?.edgePx),
      pixel_spacing_x_mm: serializeNumber(analysis?.spacingX),
      pixel_spacing_y_mm: serializeNumber(analysis?.spacingY),
      frequency_step_x_cycles_per_mm: serializeNumber(analysis?.frequencyStepX),
      frequency_step_y_cycles_per_mm: serializeNumber(analysis?.frequencyStepY),
      nyquist_x_cycles_per_mm: serializeNumber(analysis?.nyquistX),
      nyquist_y_cycles_per_mm: serializeNumber(analysis?.nyquistY),
      integrated_nps: serializeNumber(analysis?.integratedNps),
      radial_integrated_nps: serializeNumber(analysis?.radialIntegratedNps),
      radial_coverage_fraction: serializeNumber(analysis?.radialCoverageFraction),
      mean_roi_variance: serializeNumber(analysis?.meanRoiVariance),
      variance_closure_ratio: serializeNumber(analysis?.varianceClosureRatio),
      peak_frequency_cycles_per_mm: serializeNumber(analysis?.peakFrequency),
      peak_nps: serializeNumber(analysis?.peakNps),
      peak_normalized_nps: serializeNumber(analysis?.peakNormalizedNps),
      centroid_frequency_cycles_per_mm: serializeNumber(analysis?.centroidFrequency),
      f10_frequency_cycles_per_mm: serializeNumber(analysis?.f10Frequency),
      f50_frequency_cycles_per_mm: serializeNumber(analysis?.f50Frequency),
      f90_frequency_cycles_per_mm: serializeNumber(analysis?.f90Frequency),
      low_mid_threshold_cycles_per_mm: serializeNumber(analysis?.bandPowers?.thresholds?.lowMidFrequency),
      mid_high_threshold_cycles_per_mm: serializeNumber(analysis?.bandPowers?.thresholds?.midHighFrequency),
      low_frequency_power: serializeNumber(analysis?.bandPowers?.bands?.find((band) => band.key === "low")?.integratedPower),
      low_frequency_power_fraction: serializeNumber(analysis?.bandPowers?.bands?.find((band) => band.key === "low")?.fraction),
      mid_frequency_power: serializeNumber(analysis?.bandPowers?.bands?.find((band) => band.key === "mid")?.integratedPower),
      mid_frequency_power_fraction: serializeNumber(analysis?.bandPowers?.bands?.find((band) => band.key === "mid")?.fraction),
      high_frequency_power: serializeNumber(analysis?.bandPowers?.bands?.find((band) => band.key === "high")?.integratedPower),
      high_frequency_threshold_cycles_per_mm: serializeNumber(analysis?.highFrequencyThreshold),
      high_frequency_power_fraction: serializeNumber(analysis?.highFrequencyPowerFraction),
      high_frequency_power_fraction_of_total_nps: serializeNumber(analysis?.highFrequencyPowerFractionOfTotalNps),
      nps_units: analysis?.npsUnits || "",
      normalized_nps_units: analysis?.normalizedNpsUnits || "",
      method: analysis?.method || "",
      normalization: analysis?.normalization || "",
      normalized_nps_definition: analysis?.normalizedNpsDefinition || "",
      analysis_timestamp: context.timestamp,
      app_version: APP_VERSION,
      export_version: NPS_EXPORT_VERSION,
    };
  }

  function buildNpsRadialColumns() {
    return [
      "nps_set_id",
      "bin_index",
      "frequency_lower_cycles_per_mm",
      "frequency_upper_cycles_per_mm",
      "frequency_center_cycles_per_mm",
      "nps",
      "absolute_nps",
      "normalized_nps",
      "bin_integrated_power",
      "bin_power_fraction",
      "normalized_integrated_power",
      "cumulative_integrated_power",
      "cumulative_fraction",
      "cumulative_fraction_of_total_nps",
      "sample_count",
      "nps_units",
      "normalized_nps_units",
    ];
  }

  function buildNpsRadialRows(set, analysis) {
    return (analysis?.radialBins || []).map((bin) => ({
      nps_set_id: set?.id || analysis?.setId || "",
      bin_index: bin.binIndex,
      frequency_lower_cycles_per_mm: serializeNumber(bin.frequencyLower),
      frequency_upper_cycles_per_mm: serializeNumber(bin.frequencyUpper),
      frequency_center_cycles_per_mm: serializeNumber(bin.frequencyCenter),
      nps: serializeNumber(bin.nps),
      absolute_nps: serializeNumber(bin.absoluteNps ?? bin.nps),
      normalized_nps: serializeNumber(bin.normalizedNps),
      bin_integrated_power: serializeNumber(bin.integratedPower),
      bin_power_fraction: serializeNumber(bin.binPowerFraction),
      normalized_integrated_power: serializeNumber(bin.normalizedIntegratedPower),
      cumulative_integrated_power: serializeNumber(bin.cumulativeIntegratedPower),
      cumulative_fraction: serializeNumber(bin.cumulativeFraction),
      cumulative_fraction_of_total_nps: serializeNumber(bin.cumulativeFractionOfTotalNps),
      sample_count: serializeNumber(bin.sampleCount),
      nps_units: analysis?.npsUnits || "",
      normalized_nps_units: analysis?.normalizedNpsUnits || "",
    }));
  }

  function buildNpsNormalizedRadialColumns() {
    return [
      "nps_set_id",
      "bin_index",
      "frequency_lower_cycles_per_mm",
      "frequency_upper_cycles_per_mm",
      "frequency_center_cycles_per_mm",
      "normalized_nps",
      "normalized_integrated_power",
      "normalized_cumulative_power",
      "normalization_reference",
      "normalized_nps_units",
    ];
  }

  function buildNpsNormalizedRadialRows(set, analysis) {
    return (analysis?.radialBins || []).map((bin) => ({
      nps_set_id: set?.id || analysis?.setId || "",
      bin_index: bin.binIndex,
      frequency_lower_cycles_per_mm: serializeNumber(bin.frequencyLower),
      frequency_upper_cycles_per_mm: serializeNumber(bin.frequencyUpper),
      frequency_center_cycles_per_mm: serializeNumber(bin.frequencyCenter),
      normalized_nps: serializeNumber(bin.normalizedNps),
      normalized_integrated_power: serializeNumber(bin.normalizedIntegratedPower),
      normalized_cumulative_power: serializeNumber(bin.cumulativeFractionOfTotalNps),
      normalization_reference: "integrated_nps",
      normalized_nps_units: analysis?.normalizedNpsUnits || "",
    }));
  }

  function buildNpsCumulativeColumns() {
    return [
      "nps_set_id",
      "bin_index",
      "frequency_lower_cycles_per_mm",
      "frequency_upper_cycles_per_mm",
      "frequency_center_cycles_per_mm",
      "bin_integrated_power",
      "cumulative_integrated_power",
      "cumulative_fraction",
      "cumulative_fraction_of_total_nps",
      "nps_units",
    ];
  }

  function buildNpsCumulativeRows(set, analysis) {
    return (analysis?.radialBins || []).map((bin) => ({
      nps_set_id: set?.id || analysis?.setId || "",
      bin_index: bin.binIndex,
      frequency_lower_cycles_per_mm: serializeNumber(bin.frequencyLower),
      frequency_upper_cycles_per_mm: serializeNumber(bin.frequencyUpper),
      frequency_center_cycles_per_mm: serializeNumber(bin.frequencyCenter),
      bin_integrated_power: serializeNumber(bin.integratedPower),
      cumulative_integrated_power: serializeNumber(bin.cumulativeIntegratedPower),
      cumulative_fraction: serializeNumber(bin.cumulativeFraction),
      cumulative_fraction_of_total_nps: serializeNumber(bin.cumulativeFractionOfTotalNps),
      nps_units: analysis?.npsUnits || "",
    }));
  }

  function buildNpsBandPowerColumns() {
    return [
      "nps_set_id",
      "band_key",
      "band_label",
      "frequency_lower_cycles_per_mm",
      "frequency_upper_cycles_per_mm",
      "integrated_power",
      "fraction_of_radial_power",
      "fraction_of_total_nps",
      "nps_units",
    ];
  }

  function buildNpsBandPowerRows(set, analysis) {
    const integratedNps = Number(analysis?.integratedNps);
    return (analysis?.bandPowers?.bands || []).map((band) => ({
      nps_set_id: set?.id || analysis?.setId || "",
      band_key: band.key || "",
      band_label: band.label || "",
      frequency_lower_cycles_per_mm: serializeNumber(band.lower),
      frequency_upper_cycles_per_mm: serializeNumber(band.upper),
      integrated_power: serializeNumber(band.integratedPower),
      fraction_of_radial_power: serializeNumber(band.fraction),
      fraction_of_total_nps:
        Number.isFinite(integratedNps) && Math.abs(integratedNps) > 1e-12
          ? serializeNumber(band.integratedPower / integratedNps)
          : "",
      nps_units: analysis?.npsUnits || "",
    }));
  }

  function npsBandByKey(analysis, key) {
    return (analysis?.bandPowers?.bands || []).find((band) => band.key === key) || null;
  }

  function datasetDisplayLabel(dataset, index) {
    const meta = dataset?.meta || {};
    return (
      safeString(dataset?.label) ||
      safeString(meta.seriesDescription) ||
      safeString(meta.protocolName) ||
      safeString(meta.seriesInstanceUID) ||
      `Series ${Number(index) + 1 || 1}`
    );
  }

  function comparisonGroupIdForRoi(roi) {
    return safeString(roi?.copiedFromRoiId) || safeString(roi?.comparisonGroupId) || safeString(roi?.id) || "roi";
  }

  function comparisonGroupIdForNpsSet(set) {
    return safeString(set?.copiedFromNpsSetId) || safeString(set?.comparisonGroupId) || safeString(set?.id) || "nps_set";
  }

  function ratioToBaseline(value, baselineValue) {
    if (!Number.isFinite(value) || !Number.isFinite(baselineValue) || Math.abs(baselineValue) <= 1e-12) {
      return null;
    }
    return value / baselineValue;
  }

  function deltaToBaseline(value, baselineValue) {
    if (!Number.isFinite(value) || !Number.isFinite(baselineValue)) {
      return null;
    }
    return value - baselineValue;
  }

  function percentDeltaToBaseline(value, baselineValue) {
    if (!Number.isFinite(value) || !Number.isFinite(baselineValue) || Math.abs(baselineValue) <= 1e-12) {
      return null;
    }
    return ((value - baselineValue) / Math.abs(baselineValue)) * 100;
  }

  function buildReconstructionComparisonColumns() {
    return [
      "research_study_id",
      "patient_study_id",
      "comparison_group_id",
      "roi_id",
      "roi_label",
      "roi_type",
      "square_mode",
      "copied_from_roi_id",
      "dataset_id",
      "dataset_index",
      "reconstruction_label",
      "series_description",
      "series_number",
      "protocol_name",
      "study_id",
      "series_id",
      "sop_instance_uid",
      "slice_index",
      "roi_center_x_img",
      "roi_center_y_img",
      "roi_edge_px_x",
      "roi_edge_px_y",
      "roi_edge_mm_x",
      "roi_edge_mm_y",
      "selected_rows",
      "selected_cols",
      "area_px",
      "area_mm2",
      "pixel_spacing_x_mm",
      "pixel_spacing_y_mm",
      "units",
      "mean_calibrated",
      "sd_calibrated",
      "variance_calibrated",
      "median_calibrated",
      "iqr_calibrated",
      "mad_calibrated",
      "min_calibrated",
      "max_calibrated",
      "range_calibrated",
      "coefficient_of_variation",
      "baseline_flag",
      "baseline_reconstruction_label",
      "delta_mean_vs_baseline",
      "delta_sd_vs_baseline",
      "percent_delta_sd_vs_baseline",
      "noise_ratio_vs_baseline",
      "variance_ratio_vs_baseline",
      "touches_boundary_flag",
      "too_small_flag",
      "analysis_timestamp",
      "app_version",
      "export_version",
    ];
  }

  function buildReconstructionComparisonSummaryColumns() {
    return [
      "research_study_id",
      "patient_study_id",
      "comparison_group_id",
      "roi_label",
      "roi_type",
      "source_roi_id",
      "reconstruction_count",
      "baseline_reconstruction_label",
      "baseline_sd_calibrated",
      "lowest_noise_reconstruction_label",
      "lowest_sd_calibrated",
      "highest_noise_reconstruction_label",
      "highest_sd_calibrated",
      "sd_range_calibrated",
      "sd_percent_range_vs_baseline",
      "mean_range_calibrated",
      "variance_ratio_high_vs_low",
      "units",
      "interpretation_note",
      "analysis_timestamp",
      "app_version",
      "export_version",
    ];
  }

  function buildNpsComparisonColumns() {
    return [
      "research_study_id",
      "patient_study_id",
      "comparison_group_id",
      "nps_set_id",
      "nps_label",
      "copied_from_nps_set_id",
      "dataset_id",
      "dataset_index",
      "reconstruction_label",
      "series_description",
      "series_number",
      "protocol_name",
      "slice_index",
      "valid_roi_count",
      "rejected_roi_count",
      "edge_px",
      "pixel_spacing_x_mm",
      "pixel_spacing_y_mm",
      "integrated_nps",
      "radial_integrated_nps",
      "radial_coverage_fraction",
      "mean_roi_variance",
      "variance_closure_ratio",
      "peak_frequency_cycles_per_mm",
      "peak_nps",
      "peak_normalized_nps",
      "centroid_frequency_cycles_per_mm",
      "f10_frequency_cycles_per_mm",
      "f50_frequency_cycles_per_mm",
      "f90_frequency_cycles_per_mm",
      "low_frequency_power_fraction",
      "mid_frequency_power_fraction",
      "high_frequency_power_fraction",
      "high_frequency_power_fraction_of_total_nps",
      "nps_units",
      "normalized_nps_units",
      "baseline_flag",
      "baseline_reconstruction_label",
      "delta_integrated_nps_vs_baseline",
      "percent_delta_integrated_nps_vs_baseline",
      "nps_ratio_vs_baseline",
      "delta_peak_frequency_vs_baseline",
      "delta_f50_frequency_vs_baseline",
      "analysis_timestamp",
      "app_version",
      "export_version",
    ];
  }

  function buildNpsComparisonSummaryColumns() {
    return [
      "research_study_id",
      "patient_study_id",
      "comparison_group_id",
      "nps_label",
      "source_nps_set_id",
      "reconstruction_count",
      "baseline_reconstruction_label",
      "baseline_integrated_nps",
      "lowest_integrated_nps_reconstruction_label",
      "lowest_integrated_nps",
      "highest_integrated_nps_reconstruction_label",
      "highest_integrated_nps",
      "integrated_nps_range",
      "integrated_nps_percent_range_vs_baseline",
      "peak_frequency_range_cycles_per_mm",
      "f50_frequency_range_cycles_per_mm",
      "high_frequency_fraction_range",
      "nps_units",
      "interpretation_note",
      "analysis_timestamp",
      "app_version",
      "export_version",
    ];
  }

  function buildRoiComparisonModels(datasets, rois, context) {
    const datasetEntries = (datasets || []).map((dataset, index) => ({
      dataset,
      index,
      label: datasetDisplayLabel(dataset, index),
    }));
    const datasetById = new Map(datasetEntries.map((entry) => [entry.dataset?.id, entry]));
    const models = [];

    (rois || []).forEach((roi) => {
      const datasetEntry = datasetById.get(roi?.datasetId);
      if (!datasetEntry?.dataset?.volume) {
        return;
      }
      const analysis = extractSquareRoiPixels(datasetEntry.dataset.volume, roi.sliceIndex, roi);
      if (analysis?.error) {
        return;
      }
      const meta = datasetEntry.dataset.meta || analysis.record || {};
      const groupId = comparisonGroupIdForRoi(roi);
      models.push({
        groupId,
        groupLabel: safeString(roi?.label) || groupId,
        datasetEntry,
        roi,
        analysis,
        meta,
      });
    });

    const groups = new Map();
    models.forEach((model) => {
      if (!groups.has(model.groupId)) {
        groups.set(model.groupId, []);
      }
      groups.get(model.groupId).push(model);
    });

    const rows = [];
    const summaryRows = [];
    groups.forEach((groupModels, groupId) => {
      const sortedModels = groupModels
        .slice()
        .sort((left, right) => left.datasetEntry.index - right.datasetEntry.index || naturalCompare(left.roi.id, right.roi.id));
      const baseline =
        sortedModels.find((model) => model.roi.id === groupId) ||
        sortedModels.find((model) => !model.roi.copiedFromRoiId) ||
        sortedModels[0];
      const baselineStats = baseline?.analysis?.statsCalibrated || {};
      const baselineLabel = baseline?.datasetEntry?.label || "";

      sortedModels.forEach((model) => {
        const geometry = model.analysis.geometry || {};
        const stats = model.analysis.statsCalibrated || {};
        rows.push({
          research_study_id: context.researchStudyId,
          patient_study_id: context.patientStudyId,
          comparison_group_id: groupId,
          roi_id: model.roi.id,
          roi_label: model.roi.label || "",
          roi_type: model.roi.type || ROI_TYPE,
          square_mode: model.roi.squareMode || "",
          copied_from_roi_id: model.roi.copiedFromRoiId || "",
          dataset_id: model.datasetEntry.dataset.id || "",
          dataset_index: model.datasetEntry.index + 1,
          reconstruction_label: model.datasetEntry.label,
          series_description: model.meta.seriesDescription || "",
          series_number: serializeNumber(model.meta.seriesNumber),
          protocol_name: model.meta.protocolName || "",
          study_id: model.meta.studyInstanceUID || "",
          series_id: model.meta.seriesInstanceUID || "",
          sop_instance_uid: model.analysis.record?.sopInstanceUID || "",
          slice_index: model.roi.sliceIndex,
          roi_center_x_img: serializeNumber(geometry.centerXImg),
          roi_center_y_img: serializeNumber(geometry.centerYImg),
          roi_edge_px_x: serializeNumber(geometry.edgePxX),
          roi_edge_px_y: serializeNumber(geometry.edgePxY),
          roi_edge_mm_x: serializeNumber(geometry.edgeMmX),
          roi_edge_mm_y: serializeNumber(geometry.edgeMmY),
          selected_rows: serializeNumber(geometry.selectedRowCount),
          selected_cols: serializeNumber(geometry.selectedColumnCount),
          area_px: serializeNumber(geometry.areaPx),
          area_mm2: serializeNumber(geometry.areaMm2),
          pixel_spacing_x_mm: serializeNumber(geometry.spacingX),
          pixel_spacing_y_mm: serializeNumber(geometry.spacingY),
          units: model.analysis.units || "",
          mean_calibrated: serializeNumber(stats.mean),
          sd_calibrated: serializeNumber(stats.sd),
          variance_calibrated: serializeNumber(stats.variance),
          median_calibrated: serializeNumber(stats.median),
          iqr_calibrated: serializeNumber(stats.iqr),
          mad_calibrated: serializeNumber(stats.mad),
          min_calibrated: serializeNumber(stats.min),
          max_calibrated: serializeNumber(stats.max),
          range_calibrated: serializeNumber(stats.range),
          coefficient_of_variation: serializeNumber(stats.coefficientOfVariation),
          baseline_flag: model === baseline ? "true" : "false",
          baseline_reconstruction_label: baselineLabel,
          delta_mean_vs_baseline: serializeNumber(deltaToBaseline(stats.mean, baselineStats.mean)),
          delta_sd_vs_baseline: serializeNumber(deltaToBaseline(stats.sd, baselineStats.sd)),
          percent_delta_sd_vs_baseline: serializeNumber(percentDeltaToBaseline(stats.sd, baselineStats.sd)),
          noise_ratio_vs_baseline: serializeNumber(ratioToBaseline(stats.sd, baselineStats.sd)),
          variance_ratio_vs_baseline: serializeNumber(ratioToBaseline(stats.variance, baselineStats.variance)),
          touches_boundary_flag: model.analysis.warnings?.touchesBoundaryFlag ? "true" : "false",
          too_small_flag: model.analysis.warnings?.tooSmallFlag ? "true" : "false",
          analysis_timestamp: context.timestamp,
          app_version: APP_VERSION,
          export_version: COMPARISON_EXPORT_VERSION,
        });
      });

      const finiteSdModels = sortedModels.filter((model) => Number.isFinite(model.analysis?.statsCalibrated?.sd));
      const finiteMeanModels = sortedModels.filter((model) => Number.isFinite(model.analysis?.statsCalibrated?.mean));
      const lowest = finiteSdModels.reduce(
        (best, model) => (!best || model.analysis.statsCalibrated.sd < best.analysis.statsCalibrated.sd ? model : best),
        null
      );
      const highest = finiteSdModels.reduce(
        (best, model) => (!best || model.analysis.statsCalibrated.sd > best.analysis.statsCalibrated.sd ? model : best),
        null
      );
      const meanValues = finiteMeanModels.map((model) => model.analysis.statsCalibrated.mean);
      const sdRange =
        lowest && highest ? highest.analysis.statsCalibrated.sd - lowest.analysis.statsCalibrated.sd : null;
      const meanRange = meanValues.length ? Math.max(...meanValues) - Math.min(...meanValues) : null;
      const lowVariance = lowest?.analysis?.statsCalibrated?.variance;
      const highVariance = highest?.analysis?.statsCalibrated?.variance;
      summaryRows.push({
        research_study_id: context.researchStudyId,
        patient_study_id: context.patientStudyId,
        comparison_group_id: groupId,
        roi_label: baseline?.roi?.label || sortedModels[0]?.roi?.label || groupId,
        roi_type: baseline?.roi?.type || ROI_TYPE,
        source_roi_id: baseline?.roi?.id || "",
        reconstruction_count: sortedModels.length,
        baseline_reconstruction_label: baselineLabel,
        baseline_sd_calibrated: serializeNumber(baselineStats.sd),
        lowest_noise_reconstruction_label: lowest?.datasetEntry?.label || "",
        lowest_sd_calibrated: serializeNumber(lowest?.analysis?.statsCalibrated?.sd),
        highest_noise_reconstruction_label: highest?.datasetEntry?.label || "",
        highest_sd_calibrated: serializeNumber(highest?.analysis?.statsCalibrated?.sd),
        sd_range_calibrated: serializeNumber(sdRange),
        sd_percent_range_vs_baseline: serializeNumber(
          Number.isFinite(sdRange) && Number.isFinite(baselineStats.sd) && Math.abs(baselineStats.sd) > 1e-12
            ? (sdRange / Math.abs(baselineStats.sd)) * 100
            : null
        ),
        mean_range_calibrated: serializeNumber(meanRange),
        variance_ratio_high_vs_low: serializeNumber(ratioToBaseline(highVariance, lowVariance)),
        units: baseline?.analysis?.units || sortedModels[0]?.analysis?.units || "",
        interpretation_note:
          "Lower ROI SD indicates lower local signal spread for the same image-space ROI; inspect warnings and source images before interpreting as random noise alone.",
        analysis_timestamp: context.timestamp,
        app_version: APP_VERSION,
        export_version: COMPARISON_EXPORT_VERSION,
      });
    });

    return { models, rows, summaryRows };
  }

  function buildNpsComparisonModels(datasets, npsSets, rois, context) {
    const datasetEntries = (datasets || []).map((dataset, index) => ({
      dataset,
      index,
      label: datasetDisplayLabel(dataset, index),
    }));
    const datasetById = new Map(datasetEntries.map((entry) => [entry.dataset?.id, entry]));
    const models = [];

    (npsSets || []).forEach((set) => {
      const datasetEntry = datasetById.get(set?.datasetId);
      if (!datasetEntry?.dataset?.volume) {
        return;
      }
      const setRois = (rois || []).filter((roi) => roi.datasetId === set.datasetId && roi.npsSetId === set.id);
      const analysis = buildNpsAnalysisForRois(datasetEntry.dataset.volume, setRois, {
        setId: set.id,
        centerXImg: set.centerXImg,
        centerYImg: set.centerYImg,
      });
      if (analysis?.error || !analysis?.validRoiCount) {
        return;
      }
      const meta = datasetEntry.dataset.meta || {};
      const groupId = comparisonGroupIdForNpsSet(set);
      models.push({
        groupId,
        groupLabel: safeString(set?.label) || groupId,
        datasetEntry,
        set,
        analysis,
        meta,
      });
    });

    const groups = new Map();
    models.forEach((model) => {
      if (!groups.has(model.groupId)) {
        groups.set(model.groupId, []);
      }
      groups.get(model.groupId).push(model);
    });

    const rows = [];
    const summaryRows = [];
    groups.forEach((groupModels, groupId) => {
      const sortedModels = groupModels
        .slice()
        .sort((left, right) => left.datasetEntry.index - right.datasetEntry.index || naturalCompare(left.set.id, right.set.id));
      const baseline =
        sortedModels.find((model) => model.set.id === groupId) ||
        sortedModels.find((model) => !model.set.copiedFromNpsSetId) ||
        sortedModels[0];
      const baselineAnalysis = baseline?.analysis || {};
      const baselineLabel = baseline?.datasetEntry?.label || "";

      sortedModels.forEach((model) => {
        const analysis = model.analysis || {};
        rows.push({
          research_study_id: context.researchStudyId,
          patient_study_id: context.patientStudyId,
          comparison_group_id: groupId,
          nps_set_id: model.set.id || "",
          nps_label: model.set.label || model.set.id || "",
          copied_from_nps_set_id: model.set.copiedFromNpsSetId || "",
          dataset_id: model.datasetEntry.dataset.id || "",
          dataset_index: model.datasetEntry.index + 1,
          reconstruction_label: model.datasetEntry.label,
          series_description: model.meta.seriesDescription || "",
          series_number: serializeNumber(model.meta.seriesNumber),
          protocol_name: model.meta.protocolName || "",
          slice_index: model.set.sliceIndex ?? "",
          valid_roi_count: serializeNumber(analysis.validRoiCount),
          rejected_roi_count: serializeNumber(analysis.rejectedRoiCount),
          edge_px: serializeNumber(analysis.edgePx),
          pixel_spacing_x_mm: serializeNumber(analysis.spacingX),
          pixel_spacing_y_mm: serializeNumber(analysis.spacingY),
          integrated_nps: serializeNumber(analysis.integratedNps),
          radial_integrated_nps: serializeNumber(analysis.radialIntegratedNps),
          radial_coverage_fraction: serializeNumber(analysis.radialCoverageFraction),
          mean_roi_variance: serializeNumber(analysis.meanRoiVariance),
          variance_closure_ratio: serializeNumber(analysis.varianceClosureRatio),
          peak_frequency_cycles_per_mm: serializeNumber(analysis.peakFrequency),
          peak_nps: serializeNumber(analysis.peakNps),
          peak_normalized_nps: serializeNumber(analysis.peakNormalizedNps),
          centroid_frequency_cycles_per_mm: serializeNumber(analysis.centroidFrequency),
          f10_frequency_cycles_per_mm: serializeNumber(analysis.f10Frequency),
          f50_frequency_cycles_per_mm: serializeNumber(analysis.f50Frequency),
          f90_frequency_cycles_per_mm: serializeNumber(analysis.f90Frequency),
          low_frequency_power_fraction: serializeNumber(npsBandByKey(analysis, "low")?.fraction),
          mid_frequency_power_fraction: serializeNumber(npsBandByKey(analysis, "mid")?.fraction),
          high_frequency_power_fraction: serializeNumber(analysis.highFrequencyPowerFraction),
          high_frequency_power_fraction_of_total_nps: serializeNumber(analysis.highFrequencyPowerFractionOfTotalNps),
          nps_units: analysis.npsUnits || "",
          normalized_nps_units: analysis.normalizedNpsUnits || "",
          baseline_flag: model === baseline ? "true" : "false",
          baseline_reconstruction_label: baselineLabel,
          delta_integrated_nps_vs_baseline: serializeNumber(deltaToBaseline(analysis.integratedNps, baselineAnalysis.integratedNps)),
          percent_delta_integrated_nps_vs_baseline: serializeNumber(
            percentDeltaToBaseline(analysis.integratedNps, baselineAnalysis.integratedNps)
          ),
          nps_ratio_vs_baseline: serializeNumber(ratioToBaseline(analysis.integratedNps, baselineAnalysis.integratedNps)),
          delta_peak_frequency_vs_baseline: serializeNumber(deltaToBaseline(analysis.peakFrequency, baselineAnalysis.peakFrequency)),
          delta_f50_frequency_vs_baseline: serializeNumber(deltaToBaseline(analysis.f50Frequency, baselineAnalysis.f50Frequency)),
          analysis_timestamp: context.timestamp,
          app_version: APP_VERSION,
          export_version: COMPARISON_EXPORT_VERSION,
        });
      });

      const finiteNpsModels = sortedModels.filter((model) => Number.isFinite(model.analysis?.integratedNps));
      const finitePeakModels = sortedModels.filter((model) => Number.isFinite(model.analysis?.peakFrequency));
      const finiteF50Models = sortedModels.filter((model) => Number.isFinite(model.analysis?.f50Frequency));
      const finiteHighFractionModels = sortedModels.filter((model) => Number.isFinite(model.analysis?.highFrequencyPowerFraction));
      const lowest = finiteNpsModels.reduce(
        (best, model) => (!best || model.analysis.integratedNps < best.analysis.integratedNps ? model : best),
        null
      );
      const highest = finiteNpsModels.reduce(
        (best, model) => (!best || model.analysis.integratedNps > best.analysis.integratedNps ? model : best),
        null
      );
      const peakValues = finitePeakModels.map((model) => model.analysis.peakFrequency);
      const f50Values = finiteF50Models.map((model) => model.analysis.f50Frequency);
      const highFractionValues = finiteHighFractionModels.map((model) => model.analysis.highFrequencyPowerFraction);
      const integratedRange = lowest && highest ? highest.analysis.integratedNps - lowest.analysis.integratedNps : null;
      summaryRows.push({
        research_study_id: context.researchStudyId,
        patient_study_id: context.patientStudyId,
        comparison_group_id: groupId,
        nps_label: baseline?.set?.label || sortedModels[0]?.set?.label || groupId,
        source_nps_set_id: baseline?.set?.id || "",
        reconstruction_count: sortedModels.length,
        baseline_reconstruction_label: baselineLabel,
        baseline_integrated_nps: serializeNumber(baselineAnalysis.integratedNps),
        lowest_integrated_nps_reconstruction_label: lowest?.datasetEntry?.label || "",
        lowest_integrated_nps: serializeNumber(lowest?.analysis?.integratedNps),
        highest_integrated_nps_reconstruction_label: highest?.datasetEntry?.label || "",
        highest_integrated_nps: serializeNumber(highest?.analysis?.integratedNps),
        integrated_nps_range: serializeNumber(integratedRange),
        integrated_nps_percent_range_vs_baseline: serializeNumber(
          Number.isFinite(integratedRange) &&
            Number.isFinite(baselineAnalysis.integratedNps) &&
            Math.abs(baselineAnalysis.integratedNps) > 1e-12
            ? (integratedRange / Math.abs(baselineAnalysis.integratedNps)) * 100
            : null
        ),
        peak_frequency_range_cycles_per_mm: serializeNumber(
          peakValues.length ? Math.max(...peakValues) - Math.min(...peakValues) : null
        ),
        f50_frequency_range_cycles_per_mm: serializeNumber(
          f50Values.length ? Math.max(...f50Values) - Math.min(...f50Values) : null
        ),
        high_frequency_fraction_range: serializeNumber(
          highFractionValues.length ? Math.max(...highFractionValues) - Math.min(...highFractionValues) : null
        ),
        nps_units: baselineAnalysis.npsUnits || sortedModels[0]?.analysis?.npsUnits || "",
        interpretation_note:
          "Integrated NPS is compared for copied concentric NPS sets. Review valid/rejected ROI counts and geometry before interpreting reconstruction differences.",
        analysis_timestamp: context.timestamp,
        app_version: APP_VERSION,
        export_version: COMPARISON_EXPORT_VERSION,
      });
    });

    return { models, rows, summaryRows };
  }

  function buildReconstructionComparisonMetadata(datasets, roiComparison, npsComparison, context) {
    return {
      app_name: APP_NAME,
      app_version: APP_VERSION,
      export_version: COMPARISON_EXPORT_VERSION,
      export_timestamp: context.timestamp,
      research_study_id: context.researchStudyId,
      patient_study_id: context.patientStudyId,
      purpose:
        "Compare local noise statistics across multiple loaded reconstructions of the same patient or phantom using copied image-space ROI geometry.",
      datasets: (datasets || []).map((dataset, index) => {
        const meta = dataset?.meta || {};
        return {
          dataset_id: dataset?.id || "",
          dataset_index: index + 1,
          reconstruction_label: datasetDisplayLabel(dataset, index),
          study_instance_uid: meta.studyInstanceUID || "",
          series_instance_uid: meta.seriesInstanceUID || "",
          series_description: meta.seriesDescription || "",
          protocol_name: meta.protocolName || "",
          series_number: meta.seriesNumber ?? null,
          rows: dataset?.volume?.rows ?? meta.rows ?? null,
          columns: dataset?.volume?.columns ?? meta.columns ?? null,
          depth: dataset?.volume?.depth ?? null,
          pixel_spacing_x_mm: dataset?.volume?.columnSpacing ?? meta.pixelSpacing?.[1] ?? null,
          pixel_spacing_y_mm: dataset?.volume?.rowSpacing ?? meta.pixelSpacing?.[0] ?? null,
          slice_spacing_mm: dataset?.volume?.sliceSpacing ?? meta.sliceThickness ?? null,
        };
      }),
      roi_comparison: {
        row_count: roiComparison?.rows?.length || 0,
        group_count: roiComparison?.summaryRows?.length || 0,
        baseline_rule:
          "A copied ROI is grouped by copied_from_roi_id. The uncopied source ROI is the baseline when present; otherwise the earliest loaded dataset in that group is baseline.",
        primary_metric: "sd_calibrated",
        ratio_definitions: {
          noise_ratio_vs_baseline: "sd_calibrated / baseline_sd_calibrated",
          variance_ratio_vs_baseline: "variance_calibrated / baseline_variance_calibrated",
        },
      },
      nps_comparison: {
        row_count: npsComparison?.rows?.length || 0,
        group_count: npsComparison?.summaryRows?.length || 0,
        baseline_rule:
          "A copied NPS set is grouped by copied_from_nps_set_id. The uncopied source set is baseline when present; otherwise the earliest loaded dataset in that group is baseline.",
        primary_metric: "integrated_nps",
        method: "2D square-ROI NPS from complete power-of-two concentric ROI sets, compared at set level.",
      },
      limitations: [
        "Noise comparisons assume that copied ROIs refer to anatomically or phantom-equivalent locations across reconstructions.",
        "The app copies image-space geometry to the matching slice index; if reconstructions are not co-registered, manual verification is required.",
        "ROI SD reflects local signal spread and can include structure, edges, or drift; it should not be interpreted as pure random noise without visual review and quality checks.",
      ],
    };
  }

  function buildReconstructionComparisonBundle(datasets, rois, options) {
    const context = {
      timestamp: options?.timestamp || new Date().toISOString(),
      researchStudyId: safeString(options?.researchStudyId) || "",
      patientStudyId: safeString(options?.patientStudyId) || "",
    };
    const roiComparison = buildRoiComparisonModels(datasets, rois, context);
    const npsComparison = buildNpsComparisonModels(datasets, options?.npsSets || [], rois, context);
    const metadata = buildReconstructionComparisonMetadata(datasets, roiComparison, npsComparison, context);

    return {
      context,
      roiComparison,
      npsComparison,
      files: [
        {
          name: "reconstruction_noise_comparison.csv",
          mimeType: "text/csv",
          content: toCsv(buildReconstructionComparisonColumns(), roiComparison.rows),
        },
        {
          name: "reconstruction_noise_comparison_summary.csv",
          mimeType: "text/csv",
          content: toCsv(buildReconstructionComparisonSummaryColumns(), roiComparison.summaryRows),
        },
        {
          name: "reconstruction_nps_comparison.csv",
          mimeType: "text/csv",
          content: toCsv(buildNpsComparisonColumns(), npsComparison.rows),
        },
        {
          name: "reconstruction_nps_comparison_summary.csv",
          mimeType: "text/csv",
          content: toCsv(buildNpsComparisonSummaryColumns(), npsComparison.summaryRows),
        },
        {
          name: "reconstruction_comparison_metadata.json",
          mimeType: "application/json",
          content: `${JSON.stringify(metadata, null, 2)}\n`,
        },
      ],
    };
  }

  function buildRoiSummaryColumns() {
    return [
      "research_study_id",
      "patient_study_id",
      "study_id",
      "series_id",
      "sop_instance_uid",
      "slice_index",
      "roi_id",
      "roi_label",
      "roi_type",
      "square_mode",
      "copied_from_roi_id",
      "copied_from_dataset_id",
      "copy_mapping_method",
      "copy_slice_mapping_method",
      "copy_slice_distance_mm",
      "copy_size_mapping_method",
      "roi_center_x_img",
      "roi_center_y_img",
      "roi_x_min_img",
      "roi_y_min_img",
      "roi_x_max_img",
      "roi_y_max_img",
      "roi_edge_px",
      "roi_edge_mm",
      "pixel_spacing_x_mm",
      "pixel_spacing_y_mm",
      "area_px",
      "area_mm2",
      "mean_raw",
      "mean_calibrated",
      "sd_raw",
      "sd_calibrated",
      "median_raw",
      "median_calibrated",
      "iqr_raw",
      "iqr_calibrated",
      "min_raw",
      "min_calibrated",
      "max_raw",
      "max_calibrated",
      "range_raw",
      "range_calibrated",
      "coefficient_of_variation",
      "mad",
      "skewness",
      "kurtosis",
      "touches_boundary_flag",
      "too_small_flag",
      "high_gradient_overlap_flag",
      "heterogeneity_warning_flag",
      "homogeneity_score",
      "analysis_timestamp",
      "app_version",
      "export_version",
      "roi_edge_px_x",
      "roi_edge_px_y",
      "roi_edge_mm_x",
      "roi_edge_mm_y",
      "selected_rows",
      "selected_cols",
      "patient_x_mm",
      "patient_y_mm",
      "patient_z_mm",
      "calibrated_units",
    ];
  }

  function buildRoiSummaryRow(bundleContext, roi, analysis) {
    const geometry = analysis.geometry;
    const firstEntry = analysis.entries[0] || null;
    return {
      research_study_id: bundleContext.researchStudyId,
      patient_study_id: bundleContext.patientStudyId,
      study_id: analysis.record?.studyInstanceUID || "",
      series_id: analysis.record?.seriesInstanceUID || "",
      sop_instance_uid: analysis.record?.sopInstanceUID || "",
      slice_index: roi.sliceIndex,
      roi_id: roi.id,
      roi_label: roi.label,
      roi_type: roi.type || ROI_TYPE,
      square_mode: roi.squareMode,
      copied_from_roi_id: roi.copiedFromRoiId || "",
      copied_from_dataset_id: roi.copiedFromDatasetId || "",
      copy_mapping_method: roi.copyMappingMethod || "",
      copy_slice_mapping_method: roi.copySliceMappingMethod || "",
      copy_slice_distance_mm: serializeNumber(roi.copySliceDistanceMm),
      copy_size_mapping_method: roi.copySizeMappingMethod || "",
      roi_center_x_img: serializeNumber(geometry.centerXImg),
      roi_center_y_img: serializeNumber(geometry.centerYImg),
      roi_x_min_img: serializeNumber(geometry.xMinBoundaryImg),
      roi_y_min_img: serializeNumber(geometry.yMinBoundaryImg),
      roi_x_max_img: serializeNumber(geometry.xMaxBoundaryImg),
      roi_y_max_img: serializeNumber(geometry.yMaxBoundaryImg),
      roi_edge_px:
        roi.squareMode === SQUARE_MODE_PIXEL && Number.isFinite(geometry.nominalEdgePx)
          ? serializeNumber(geometry.nominalEdgePx)
          : "",
      roi_edge_mm:
        roi.squareMode === SQUARE_MODE_PHYSICAL && Number.isFinite(geometry.nominalEdgeMm)
          ? serializeNumber(geometry.nominalEdgeMm)
          : "",
      pixel_spacing_x_mm: serializeNumber(geometry.spacingX),
      pixel_spacing_y_mm: serializeNumber(geometry.spacingY),
      area_px: serializeNumber(geometry.areaPx),
      area_mm2: serializeNumber(geometry.areaMm2),
      mean_raw: serializeNumber(analysis.statsRaw?.mean),
      mean_calibrated: serializeNumber(analysis.statsCalibrated?.mean),
      sd_raw: serializeNumber(analysis.statsRaw?.sd),
      sd_calibrated: serializeNumber(analysis.statsCalibrated?.sd),
      median_raw: serializeNumber(analysis.statsRaw?.median),
      median_calibrated: serializeNumber(analysis.statsCalibrated?.median),
      iqr_raw: serializeNumber(analysis.statsRaw?.iqr),
      iqr_calibrated: serializeNumber(analysis.statsCalibrated?.iqr),
      min_raw: serializeNumber(analysis.statsRaw?.min),
      min_calibrated: serializeNumber(analysis.statsCalibrated?.min),
      max_raw: serializeNumber(analysis.statsRaw?.max),
      max_calibrated: serializeNumber(analysis.statsCalibrated?.max),
      range_raw: serializeNumber(analysis.statsRaw?.range),
      range_calibrated: serializeNumber(analysis.statsCalibrated?.range),
      coefficient_of_variation: serializeNumber(analysis.statsCalibrated?.coefficientOfVariation),
      mad: serializeNumber(analysis.statsCalibrated?.mad),
      skewness: serializeNumber(analysis.statsCalibrated?.skewness),
      kurtosis: serializeNumber(analysis.statsCalibrated?.kurtosis),
      touches_boundary_flag: analysis.warnings.touchesBoundaryFlag ? "true" : "false",
      too_small_flag: analysis.warnings.tooSmallFlag ? "true" : "false",
      high_gradient_overlap_flag:
        analysis.warnings.highGradientOverlapFlag == null ? "" : analysis.warnings.highGradientOverlapFlag ? "true" : "false",
      heterogeneity_warning_flag:
        analysis.warnings.heterogeneityWarningFlag == null ? "" : analysis.warnings.heterogeneityWarningFlag ? "true" : "false",
      homogeneity_score: serializeNumber(analysis.warnings.homogeneityScore),
      analysis_timestamp: bundleContext.timestamp,
      app_version: APP_VERSION,
      export_version: EXPORT_VERSION,
      roi_edge_px_x: serializeNumber(geometry.edgePxX),
      roi_edge_px_y: serializeNumber(geometry.edgePxY),
      roi_edge_mm_x: serializeNumber(geometry.edgeMmX),
      roi_edge_mm_y: serializeNumber(geometry.edgeMmY),
      selected_rows: serializeNumber(geometry.selectedRowCount),
      selected_cols: serializeNumber(geometry.selectedColumnCount),
      patient_x_mm: serializeNumber(firstEntry?.patientXmm),
      patient_y_mm: serializeNumber(firstEntry?.patientYmm),
      patient_z_mm: serializeNumber(firstEntry?.patientZmm),
      calibrated_units: analysis.units,
    };
  }

  function buildRoiPixelsColumns() {
    return [
      "roi_id",
      "roi_label",
      "slice_index",
      "row_in_roi",
      "col_in_roi",
      "image_x",
      "image_y",
      "physical_x_mm",
      "physical_y_mm",
      "stored_pixel_value",
      "rescaled_value",
      "calibrated_value",
      "units",
      "patient_x_mm",
      "patient_y_mm",
      "patient_z_mm",
    ];
  }

  function buildRoiPixelsRows(roi, analysis) {
    return analysis.entries.map((entry) => ({
      roi_id: roi.id,
      roi_label: roi.label,
      slice_index: roi.sliceIndex,
      row_in_roi: entry.rowInRoi,
      col_in_roi: entry.colInRoi,
      image_x: entry.imageX,
      image_y: entry.imageY,
      physical_x_mm: serializeNumber(entry.physicalXmm),
      physical_y_mm: serializeNumber(entry.physicalYmm),
      stored_pixel_value: serializeNumber(entry.storedPixelValue),
      rescaled_value: serializeNumber(entry.rescaledValue),
      calibrated_value: serializeNumber(entry.calibratedValue),
      units: entry.units,
      patient_x_mm: serializeNumber(entry.patientXmm),
      patient_y_mm: serializeNumber(entry.patientYmm),
      patient_z_mm: serializeNumber(entry.patientZmm),
    }));
  }

  function buildPixelsMatrixEntry(roi, analysis) {
    return {
      roi_id: roi.id,
      roi_label: roi.label,
      slice_index: roi.sliceIndex,
      square_mode: roi.squareMode,
      geometry: {
        center_x_img: analysis.geometry.centerXImg,
        center_y_img: analysis.geometry.centerYImg,
        x_min_img: analysis.geometry.xMinBoundaryImg,
        y_min_img: analysis.geometry.yMinBoundaryImg,
        x_max_img: analysis.geometry.xMaxBoundaryImg,
        y_max_img: analysis.geometry.yMaxBoundaryImg,
        selected_rows: analysis.geometry.selectedRowCount,
        selected_cols: analysis.geometry.selectedColumnCount,
        edge_px_x: analysis.geometry.edgePxX,
        edge_px_y: analysis.geometry.edgePxY,
        edge_mm_x: analysis.geometry.edgeMmX,
        edge_mm_y: analysis.geometry.edgeMmY,
      },
      spacing: {
        pixel_spacing_x_mm: analysis.geometry.spacingX,
        pixel_spacing_y_mm: analysis.geometry.spacingY,
      },
      rescale: {
        slope: analysis.slice?.slope,
        intercept: analysis.slice?.intercept,
      },
      units: analysis.units,
      stored_values: analysis.storedMatrix,
      rescaled_values: analysis.rescaledMatrix,
      calibrated_values: analysis.calibratedMatrix,
    };
  }

  function buildAnalysisMetadata(dataset, analyses, context) {
    const meta = dataset?.meta || {};
    return {
      app_name: APP_NAME,
      app_version: APP_VERSION,
      git_commit_hash: context?.gitCommitHash || "",
      export_timestamp: context?.timestamp || new Date().toISOString(),
      active_dataset_identifiers: {
        study_instance_uid: meta.studyInstanceUID || "",
        series_instance_uid: meta.seriesInstanceUID || "",
        frame_of_reference_uid: meta.frameOfReferenceUID || "",
        patient_id: meta.patientId || "",
      },
      dicom_metadata: {
        patient_name: meta.patientName || "",
        patient_id: meta.patientId || "",
        modality: meta.modality || "",
        series_description: meta.seriesDescription || "",
        protocol_name: meta.protocolName || "",
        study_date: meta.studyDate || "",
        acquisition_date: meta.acquisitionDate || "",
        rows: meta.rows || dataset?.volume?.rows || null,
        columns: meta.columns || dataset?.volume?.columns || null,
      },
      pixel_spacing: {
        row_spacing_mm: dataset?.volume?.rowSpacing ?? null,
        column_spacing_mm: dataset?.volume?.columnSpacing ?? null,
        slice_spacing_mm: dataset?.volume?.sliceSpacing ?? null,
      },
      rescale: {
        slope: analyses[0]?.slice?.slope ?? meta.rescaleSlope ?? 1,
        intercept: analyses[0]?.slice?.intercept ?? meta.rescaleIntercept ?? 0,
        units: analyses[0]?.units || meta.rescaleType || (meta.modality === "CT" ? "HU" : "rescaled"),
      },
      square_mode_definitions: {
        pixel_square: "Equal edge length in image pixels; when anisotropic spacing is present, physical edge length differs between x and y.",
        physical_square: "Equal edge length in mm; when anisotropic spacing is present, the discrete pixel matrix can be non-square while the physical ROI remains square.",
      },
      profile_definitions: {
        status: "In-app profile visualization and PNG figure export are available for center-line and mean-projection review. Structured profile CSV export and detrending remain planned follow-up work.",
      },
      nps_definitions: {
        status: "2D square-ROI NPS is available for concentric NPS ROI sets.",
        roi_geometry: "The NPS tool places equal-size pixel-square ROIs on concentric rings around a selected image-space center.",
        calculation: "For each complete square ROI, calibrated source pixels are mean-subtracted, transformed with a 2D FFT, normalized by dx*dy/(Nx*Ny), averaged across ROIs, and radially averaged into a 1D NPS curve.",
        absolute_nps: "Absolute NPS is exported in calibrated units squared times mm^2, for example HU^2 mm^2.",
        normalized_nps: "Normalized NPS is absolute NPS divided by integrated NPS/noise variance. It is not divided by mean HU, because CT mean values can be near zero or negative.",
        cumulative_nps: "Cumulative NPS integrates radial-bin frequency-domain power versus spatial frequency. f10, f50, and f90 are the spatial frequencies where 10%, 50%, and 90% of radial-domain integrated power are reached.",
        bandpower: "Low, mid, and high frequency bands are split at 25% and 50% of the minimum Nyquist frequency.",
        limitations: "Current NPS implementation is 2D single-slice local NPS, not a full 3D NPS workflow.",
      },
      histogram_settings: {
        status: "In-app histogram visualization and PNG figure export are available. Structured histogram CSV export remains planned follow-up work.",
      },
      warning_definitions: {
        touches_boundary_flag: "True when any part of the ROI lies outside the image extent.",
        too_small_flag: `True when fewer than ${MINIMUM_RECOMMENDED_PIXEL_COUNT} image pixels remain inside the ROI.`,
        high_gradient_overlap_flag: "Reserved for later phase.",
        heterogeneity_warning_flag: "Reserved for later phase.",
      },
      limitations_notes: [
        "Phase 1 supports single-frame grayscale DICOM slices and standard image series.",
        "Enhanced multi-frame DICOM and structured profile/histogram CSV export workflows are not implemented yet.",
        "Calibrated values currently equal rescaled values derived from Rescale Slope/Intercept.",
      ],
    };
  }

  function buildExportReadme() {
    return `# ${APP_NAME} Export Bundle

This bundle is designed for reproducible square-ROI-based local noise analysis.

## Files

- \`roi_summary.csv\`: one row per ROI with geometry, spacing, and summary statistics.
- \`roi_pixels.csv\`: long-format pixel table for every ROI pixel included in analysis.
- \`roi_pixels_matrix.json\`: structured matrices of stored, rescaled, and calibrated values for each ROI.
- \`analysis_metadata.json\`: app version, DICOM metadata, spacing, rescale information, and analysis definitions.
- \`roi_<id>_overlay.png\`: slice overlay image with the analyzed square ROI.
- \`roi_<id>_histogram.png\`: histogram of calibrated pixel values in the square ROI.
- \`roi_<id>_profile_<type>.png\`: exported profile curve for each baseline profile representation.
- \`roi_<id>_characterization_<type>.png\`: exported figure showing the exact sampled square pattern and the derived signal actually characterized.
- \`nps_summary.csv\`: one row per exported NPS set with NPS method settings and derived metrics.
- \`nps_radial.csv\`: radial 1D absolute NPS curve values plus normalized and cumulative columns for every exported NPS set.
- \`nps_normalized_radial.csv\`: normalized radial NPS curve values using integrated NPS as the normalization reference.
- \`nps_cumulative.csv\`: cumulative integrated radial NPS power versus spatial frequency.
- \`nps_bandpower.csv\`: low-, mid-, and high-frequency integrated NPS power and fractions.
- \`nps_matrix.json\`: 2D absolute and normalized NPS matrices, radial bins, ROI membership, and calculation settings.
- \`nps_<set>_curve.png\`: paper-style absolute 1D radial NPS curve for each NPS set.
- \`nps_<set>_normalized_curve.png\`: normalized radial NPS curve.
- \`nps_<set>_cumulative_curve.png\`: cumulative integrated power curve with f10/f50/f90 reference markers.
- \`nps_<set>_bandpower.png\`: low/mid/high frequency bandpower bar figure.
- \`nps_<set>_heatmap.png\`: 2D NPS heatmap for each NPS set.
- \`reconstruction_noise_comparison.csv\`: per-reconstruction ROI statistics for copied ROI groups, including deltas and ratios versus the baseline reconstruction.
- \`reconstruction_noise_comparison_summary.csv\`: compact lowest/highest noise summary per copied ROI group.
- \`reconstruction_nps_comparison.csv\`: per-reconstruction NPS metrics for copied concentric NPS sets.
- \`reconstruction_nps_comparison_summary.csv\`: compact integrated-NPS comparison summary per copied NPS set.
- \`reconstruction_comparison_metadata.json\`: definitions, dataset identifiers, baseline rules, and limitations for reconstruction comparison exports.
- \`reconstruction_noise_comparison.png\`: bar-style figure summarizing ROI SD across reconstructions when comparison data are available.

## Coordinate Definitions

- \`*_img\` fields use image coordinates where integer values correspond to pixel centers and half-integer values correspond to pixel edges.
- \`physical_x_mm\` and \`physical_y_mm\` are local image-plane millimeter coordinates derived from Pixel Spacing when available.
- Patient-space coordinates are exported only when Image Position (Patient) and Image Orientation (Patient) are available.

## Square Modes

- \`pixel-square\`: a square in pixel space with equal edge length in x and y pixel counts.
- \`physical-square\`: a square in physical space with equal edge length in mm. Under anisotropic spacing, the selected pixel matrix can have different row and column counts.

## Value Definitions

- \`stored_pixel_value\`: raw value stored in the DICOM pixel matrix.
- \`rescaled_value\`: \`stored_pixel_value * rescale_slope + rescale_intercept\`.
- \`calibrated_value\`: currently identical to \`rescaled_value\` in Phase 1.

## Statistics

- Mean and standard deviation are population statistics over all included ROI pixels.
- Quartiles use linear interpolation on sorted values (R/Excel style type-7 quantiles).
- \`mad\` is the median absolute deviation from the median.
- \`coefficient_of_variation\` is \`sd_calibrated / abs(mean_calibrated)\` when the denominator is non-zero.

## Current Phase Notes

- Baseline profile and histogram figures are exported as PNG.
- 2D NPS is implemented for complete power-of-two square ROIs generated by the concentric NPS tool.
- Absolute NPS, normalized NPS, cumulative radial power, bandpower fractions, and f10/f50/f90 are exported for each valid NPS set.
- Structured histogram/profile CSV export, detrending, residual noise decomposition, and spectral analysis are reserved for later phases.
- \`high_gradient_overlap_flag\` and \`heterogeneity_warning_flag\` are reserved fields in Phase 1.
`;
  }

  function buildExportBundle(dataset, rois, options) {
    const timestamp = options?.timestamp || new Date().toISOString();
    const analyses = (rois || [])
      .map((roi) => ({
        roi,
        analysis: extractSquareRoiPixels(dataset?.volume, roi.sliceIndex, roi),
      }))
      .filter((entry) => !entry.analysis?.error);

    const context = {
      timestamp,
      researchStudyId: safeString(options?.researchStudyId) || "",
      patientStudyId: safeString(options?.patientStudyId) || "",
      gitCommitHash: safeString(options?.gitCommitHash) || "",
    };

    const roiSummaryRows = analyses.map((entry) => buildRoiSummaryRow(context, entry.roi, entry.analysis));
    const roiPixelsRows = analyses.flatMap((entry) => buildRoiPixelsRows(entry.roi, entry.analysis));
    const matrixPayload = {
      app_name: APP_NAME,
      app_version: APP_VERSION,
      export_version: EXPORT_VERSION,
      export_timestamp: timestamp,
      rois: analyses.map((entry) => buildPixelsMatrixEntry(entry.roi, entry.analysis)),
    };
    const npsSets = Array.isArray(options?.npsSets) ? options.npsSets : [];
    const npsAnalyses = npsSets
      .map((set) => {
        const setRois = (rois || []).filter((roi) => roi.npsSetId === set.id);
        return {
          set,
          analysis: buildNpsAnalysisForRois(dataset?.volume, setRois, {
            setId: set.id,
            centerXImg: set.centerXImg,
            centerYImg: set.centerYImg,
          }),
        };
      })
      .filter((entry) => !entry.analysis?.error && entry.analysis?.validRoiCount);

    const metadataPayload = buildAnalysisMetadata(dataset, analyses.map((entry) => entry.analysis), context);
    const npsSummaryRows = npsAnalyses.map((entry) => buildNpsSummaryRow(context, entry.set, entry.analysis));
    const npsRadialRows = npsAnalyses.flatMap((entry) => buildNpsRadialRows(entry.set, entry.analysis));
    const npsNormalizedRadialRows = npsAnalyses.flatMap((entry) => buildNpsNormalizedRadialRows(entry.set, entry.analysis));
    const npsCumulativeRows = npsAnalyses.flatMap((entry) => buildNpsCumulativeRows(entry.set, entry.analysis));
    const npsBandPowerRows = npsAnalyses.flatMap((entry) => buildNpsBandPowerRows(entry.set, entry.analysis));
    const npsMatrixPayload = {
      app_name: APP_NAME,
      app_version: APP_VERSION,
      export_version: NPS_EXPORT_VERSION,
      export_timestamp: timestamp,
      nps_sets: npsAnalyses.map((entry) => ({
        nps_set_id: entry.set.id,
        label: entry.set.label || entry.set.id,
        center_x_img: entry.set.centerXImg,
        center_y_img: entry.set.centerYImg,
        slice_index: entry.set.sliceIndex,
        edge_px: entry.analysis.edgePx,
        spacing_x_mm: entry.analysis.spacingX,
        spacing_y_mm: entry.analysis.spacingY,
        units: entry.analysis.units,
        nps_units: entry.analysis.npsUnits,
        normalized_nps_units: entry.analysis.normalizedNpsUnits,
        method: entry.analysis.method,
        normalization: entry.analysis.normalization,
        normalized_nps_definition: entry.analysis.normalizedNpsDefinition,
        roi_ids: entry.analysis.roiIds,
        roi_labels: entry.analysis.roiLabels,
        rejected_rois: entry.analysis.rejectedRois,
        metrics: {
          integrated_nps: entry.analysis.integratedNps,
          radial_integrated_nps: entry.analysis.radialIntegratedNps,
          radial_coverage_fraction: entry.analysis.radialCoverageFraction,
          mean_roi_variance: entry.analysis.meanRoiVariance,
          variance_closure_ratio: entry.analysis.varianceClosureRatio,
          peak_frequency_cycles_per_mm: entry.analysis.peakFrequency,
          peak_nps: entry.analysis.peakNps,
          peak_normalized_nps: entry.analysis.peakNormalizedNps,
          centroid_frequency_cycles_per_mm: entry.analysis.centroidFrequency,
          f10_frequency_cycles_per_mm: entry.analysis.f10Frequency,
          f50_frequency_cycles_per_mm: entry.analysis.f50Frequency,
          f90_frequency_cycles_per_mm: entry.analysis.f90Frequency,
          high_frequency_power_fraction: entry.analysis.highFrequencyPowerFraction,
          high_frequency_power_fraction_of_total_nps: entry.analysis.highFrequencyPowerFractionOfTotalNps,
        },
        band_powers: entry.analysis.bandPowers,
        nps_2d: entry.analysis.nps2d,
        normalized_nps_2d: entry.analysis.normalizedNps2d,
        radial_bins: entry.analysis.radialBins,
      })),
    };

    return {
      context,
      analyses,
      npsAnalyses,
      files: [
        {
          name: "roi_summary.csv",
          mimeType: "text/csv",
          content: toCsv(buildRoiSummaryColumns(), roiSummaryRows),
        },
        {
          name: "roi_pixels.csv",
          mimeType: "text/csv",
          content: toCsv(buildRoiPixelsColumns(), roiPixelsRows),
        },
        {
          name: "roi_pixels_matrix.json",
          mimeType: "application/json",
          content: `${JSON.stringify(matrixPayload, null, 2)}\n`,
        },
        {
          name: "analysis_metadata.json",
          mimeType: "application/json",
          content: `${JSON.stringify(metadataPayload, null, 2)}\n`,
        },
        {
          name: "nps_summary.csv",
          mimeType: "text/csv",
          content: toCsv(buildNpsSummaryColumns(), npsSummaryRows),
        },
        {
          name: "nps_radial.csv",
          mimeType: "text/csv",
          content: toCsv(buildNpsRadialColumns(), npsRadialRows),
        },
        {
          name: "nps_normalized_radial.csv",
          mimeType: "text/csv",
          content: toCsv(buildNpsNormalizedRadialColumns(), npsNormalizedRadialRows),
        },
        {
          name: "nps_cumulative.csv",
          mimeType: "text/csv",
          content: toCsv(buildNpsCumulativeColumns(), npsCumulativeRows),
        },
        {
          name: "nps_bandpower.csv",
          mimeType: "text/csv",
          content: toCsv(buildNpsBandPowerColumns(), npsBandPowerRows),
        },
        {
          name: "nps_matrix.json",
          mimeType: "application/json",
          content: `${JSON.stringify(npsMatrixPayload, null, 2)}\n`,
        },
        {
          name: "README.md",
          mimeType: "text/markdown",
          content: buildExportReadme(),
        },
      ],
    };
  }

  function makeOverlayFilename(roi) {
    return `roi_${sanitizeFilePart(roi?.id || "roi", "roi")}_overlay.png`;
  }

  function makeHistogramFilename(roi) {
    return `roi_${sanitizeFilePart(roi?.id || "roi", "roi")}_histogram.png`;
  }

  function makeProfileFigureFilename(roi, profileType) {
    return `roi_${sanitizeFilePart(roi?.id || "roi", "roi")}_profile_${sanitizeFilePart(profileType || "profile", "profile")}.png`;
  }

  function makeCharacterizationFigureFilename(roi, profileType) {
    return `roi_${sanitizeFilePart(roi?.id || "roi", "roi")}_characterization_${sanitizeFilePart(profileType || "profile", "profile")}.png`;
  }

  function makeNpsCurveFilename(set) {
    return `nps_${sanitizeFilePart(set?.id || set?.setId || "set", "set")}_curve.png`;
  }

  function makeNpsNormalizedCurveFilename(set) {
    return `nps_${sanitizeFilePart(set?.id || set?.setId || "set", "set")}_normalized_curve.png`;
  }

  function makeNpsCumulativeCurveFilename(set) {
    return `nps_${sanitizeFilePart(set?.id || set?.setId || "set", "set")}_cumulative_curve.png`;
  }

  function makeNpsBandPowerFilename(set) {
    return `nps_${sanitizeFilePart(set?.id || set?.setId || "set", "set")}_bandpower.png`;
  }

  function makeNpsHeatmapFilename(set) {
    return `nps_${sanitizeFilePart(set?.id || set?.setId || "set", "set")}_heatmap.png`;
  }

  global.HAGRadNoiseLabCore = Object.freeze({
    APP_NAME,
    APP_VERSION,
    EXPORT_VERSION,
    ROI_TYPE,
    SQUARE_MODE_PIXEL,
    SQUARE_MODE_PHYSICAL,
    DEFAULT_FIXED_PIXEL_EDGES,
    DEFAULT_FIXED_PHYSICAL_EDGE_MM,
    MINIMUM_RECOMMENDED_PIXEL_COUNT,
    NPS_ROI_TYPE,
    NPS_EXPORT_VERSION,
    COMPARISON_EXPORT_VERSION,
    DEFAULT_NPS_EDGE_PX,
    DEFAULT_NPS_RING_COUNT,
    DEFAULT_NPS_ROIS_PER_RING,
    DEFAULT_NPS_RING_SPACING_PX,
    serializeNumber,
    toCsv,
    computeStats,
    patientPointToImageCoord,
    slicePositionMm,
    findNearestSliceIndexForPatientPoint,
    buildHistogram,
    buildRoiProfileAnalysis,
    buildNpsAnalysisFromMatrices,
    buildNpsAnalysisForRois,
    buildReconstructionComparisonBundle,
    createConcentricNpsRois,
    isPowerOfTwo,
    nextPowerOfTwo,
    supportsPhysicalSquare,
    snapPixelSquareCenter,
    createSquareRoi,
    cloneRoi,
    resolveSquareGeometry,
    extractSquareRoiPixels,
    buildExportBundle,
    makeOverlayFilename,
    makeHistogramFilename,
    makeProfileFigureFilename,
    makeCharacterizationFigureFilename,
    makeNpsCurveFilename,
    makeNpsNormalizedCurveFilename,
    makeNpsCumulativeCurveFilename,
    makeNpsBandPowerFilename,
    makeNpsHeatmapFilename,
    roundForDisplay,
  });
})(typeof window !== "undefined" ? window : globalThis);
