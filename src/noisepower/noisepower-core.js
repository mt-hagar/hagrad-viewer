(function (global) {
  "use strict";

  const sharedCore = global.HAGRadCore || {};

  const APP_NAME = "HAGRad Noise Power";
  const APP_VERSION = "0.1.0";
  const EXPORT_VERSION = "2026-05-noise-power-v1";
  const ROI_TYPE = "ROI_noise_square";
  const NPS_ROI_TYPE = "ROI_noise_power_square";
  const CIRCLE_TYPE = "Noise_Power_circle";
  const DEFAULT_SQUARE_EDGE_PX = 64;
  const DEFAULT_NPS_EDGE_PX = 64;
  const DEFAULT_NPS_PERIPHERAL_COUNT = 4;
  const DEFAULT_NPS_RING_COUNT = 1;
  const DEFAULT_NPS_MARGIN_PX = 4;
  const MINIMUM_RECOMMENDED_PIXEL_COUNT = 25;
  const KERNEL_RHO10_REFERENCES = Object.freeze({
    Bv40: { kernel: "Bv40", rho50LpCm: 3.95, rho10LpCm: 6.61, rho02LpCm: 8.02, source: "Mergen et al. Investigative Radiology Table 1; Gruschwitz et al. Scientific Reports Supplementary Table S1" },
    Bv44: { kernel: "Bv44", rho10LpCm: 7.7, source: "Mergen et al. Investigative Radiology Table 1" },
    Bv48: { kernel: "Bv48", rho50LpCm: 5.4, rho10LpCm: 8.49, rho02LpCm: 9.88, source: "Gruschwitz et al. Scientific Reports Supplementary Table S1" },
    Bv49: { kernel: "Bv49", rho50LpCm: 5.62, rho10LpCm: 8.59, rho02LpCm: 9.91, source: "Gruschwitz et al. Scientific Reports Supplementary Table S1" },
    Bv56: { kernel: "Bv56", rho10LpCm: 10.8, source: "Mergen et al. Investigative Radiology Table 1" },
    Bv59: { kernel: "Bv59", rho50LpCm: 8.32, rho10LpCm: 11.73, rho02LpCm: 12.18, source: "Gruschwitz et al. Scientific Reports Supplementary Table S1" },
    Bv60: { kernel: "Bv60", rho50LpCm: 8.79, rho10LpCm: 11.86, rho02LpCm: 12.23, source: "Mergen et al. Investigative Radiology Table 1; Gruschwitz et al. Scientific Reports Supplementary Table S1" },
    Bv64: { kernel: "Bv64", rho10LpCm: 11.2, source: "Mergen et al. Investigative Radiology Table 1" },
    Bv72: { kernel: "Bv72", rho10LpCm: 17.4, source: "Mergen et al. Investigative Radiology Table 1" },
    Bv76: { kernel: "Bv76", rho50LpCm: 16.47, rho10LpCm: 22.12, rho02LpCm: 24.93, source: "Gruschwitz et al. Scientific Reports Supplementary Table S1" },
    Bv80: { kernel: "Bv80", rho10LpCm: 25.9, source: "Mergen et al. Investigative Radiology Table 1" },
    Bv89: { kernel: "Bv89", rho10LpCm: 35.9, source: "Mergen et al. Investigative Radiology Table 1" },
  });

  const clamp =
    sharedCore.clamp ||
    ((value, min, max) => Math.min(max, Math.max(min, value)));
  const safeString =
    sharedCore.safeString ||
    ((value) => {
      if (typeof value !== "string") {
        return null;
      }
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    });
  const naturalCompare =
    sharedCore.naturalCompare ||
    ((left, right) => String(left || "").localeCompare(String(right || ""), undefined, { numeric: true }));
  const dot =
    sharedCore.dot ||
    ((left, right) => (left || []).reduce((sum, value, index) => sum + value * ((right || [])[index] || 0), 0));
  const subtractVectors =
    sharedCore.subtractVectors ||
    ((left, right) => (left || []).map((value, index) => value - ((right || [])[index] || 0)));

  function roundForDisplay(value, digits = 2) {
    if (!Number.isFinite(value)) {
      return null;
    }
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function serializeNumber(value) {
    if (!Number.isFinite(value)) {
      return "";
    }
    return Number(value.toPrecision(15)).toString();
  }

  function csvEscape(value) {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function toCsv(columns, rows) {
    const lines = [columns.map(csvEscape).join(",")];
    (rows || []).forEach((row) => {
      lines.push(columns.map((column) => csvEscape(row?.[column])).join(","));
    });
    return `${lines.join("\n")}\n`;
  }

  function xmlEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sanitizeWorkbookSheetName(value, fallback = "Sheet") {
    const cleaned = String(value || fallback)
      .replace(/[\\/:*?\[\]]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31);
    return cleaned || fallback;
  }

  function workbookCellValue(column, value) {
    if (value == null) {
      return { type: "String", value: "" };
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return { type: "Number", value };
    }
    const text = String(value);
    const columnName = String(column || "").toLowerCase();
    const shouldStayText =
      !text ||
      columnName.includes("id") ||
      columnName.includes("label") ||
      columnName.includes("reconstruction") ||
      columnName.includes("series_number") ||
      columnName.includes("method") ||
      columnName.includes("type") ||
      columnName.includes("axis") ||
      columnName.includes("units") ||
      columnName.includes("warning") ||
      columnName.includes("error") ||
      columnName === "valid";
    if (!shouldStayText && /^-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(text)) {
      return { type: "Number", value: Number(text) };
    }
    return { type: "String", value: text };
  }

  function rowsToWorkbookRows(columns, rows) {
    return [
      columns.slice(),
      ...(rows || []).map((row) => columns.map((column) => workbookCellValue(column, row?.[column]))),
    ];
  }

  function buildSpreadsheetWorkbookXml(sheets) {
    const usedNames = new Set();
    const validSheets = (sheets || []).filter((sheet) => sheet?.name && Array.isArray(sheet.rows) && sheet.rows.length);
    const worksheetXml = validSheets
      .map((sheet, sheetIndex) => {
        const baseName = sanitizeWorkbookSheetName(sheet.name, `Sheet ${sheetIndex + 1}`);
        let sheetName = baseName;
        let suffix = 2;
        while (usedNames.has(sheetName.toLowerCase())) {
          const suffixText = ` ${suffix}`;
          sheetName = `${baseName.slice(0, 31 - suffixText.length)}${suffixText}`;
          suffix += 1;
        }
        usedNames.add(sheetName.toLowerCase());
        const maxColumns = Math.max(...sheet.rows.map((row) => row.length), 0);
        const rowXml = sheet.rows
          .map((row, rowIndex) => {
            const cells = row
              .map((cell, columnIndex) => {
                const column = sheet.rows[0]?.[columnIndex];
                const normalizedCell = cell && typeof cell === "object" && "type" in cell ? cell : workbookCellValue(column, cell);
                const type = rowIndex === 0 ? "String" : normalizedCell.type;
                const styleId = rowIndex === 0 ? ' ss:StyleID="Header"' : "";
                return `<Cell${styleId}><Data ss:Type="${type}">${xmlEscape(normalizedCell.value)}</Data></Cell>`;
              })
              .join("");
            return `<Row>${cells}</Row>`;
          })
          .join("");
        return `<Worksheet ss:Name="${xmlEscape(sheetName)}"><Table ss:ExpandedColumnCount="${maxColumns}" ss:ExpandedRowCount="${sheet.rows.length}" x:FullColumns="1" x:FullRows="1">${rowXml}</Table></Worksheet>`;
      })
      .join("");

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
   <Font ss:FontName="Aptos" ss:Size="10" ss:Color="#0b1720"/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Aptos" ss:Size="10" ss:Bold="1" ss:Color="#f4f8fb"/>
   <Interior ss:Color="#0f2230" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 ${worksheetXml}
</Workbook>`;
  }

  function sanitizeFilePart(value, fallback) {
    const cleaned = String(value || "")
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "_")
      .replace(/^_+|_+$/g, "");
    return cleaned || fallback || "item";
  }

  function normalizeKernelKey(value) {
    const text = safeString(value);
    if (!text) {
      return "";
    }
    const match = text.replace(/\\/g, " ").match(/\bBv\s*([0-9]{2})(?:\b|[A-Za-z0-9_+-]*)/i);
    return match ? `Bv${match[1]}` : "";
  }

  function kernelRho10Reference(input) {
    const candidates =
      typeof input === "string"
        ? [input]
        : [
            input?.convolutionKernel,
            input?.kernel,
            input?.seriesDescription,
            input?.protocolName,
            input?.imageType,
            input?.meta?.convolutionKernel,
            input?.meta?.seriesDescription,
            input?.meta?.protocolName,
            input?.meta?.imageType,
          ];
    for (const candidate of candidates) {
      const kernel = normalizeKernelKey(candidate);
      if (kernel && KERNEL_RHO10_REFERENCES[kernel]) {
        return { ...KERNEL_RHO10_REFERENCES[kernel], matched_text: safeString(candidate) || "" };
      }
    }
    const detectedKernel = candidates.map(normalizeKernelKey).find(Boolean) || "";
    return detectedKernel ? { kernel: detectedKernel, rho10LpCm: null, source: "", matched_text: "" } : null;
  }

  function rhoMaxLpCmFromSpacing(spacingX, spacingY) {
    const dx = Number(spacingX);
    const dy = Number(spacingY);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx <= 0 || dy <= 0) {
      return null;
    }
    return Math.min(1 / (2 * dx), 1 / (2 * dy)) * 10;
  }

  function datasetRhoMaxLpCm(dataset) {
    return rhoMaxLpCmFromSpacing(
      dataset?.volume?.columnSpacing ?? dataset?.meta?.pixelSpacing?.[1],
      dataset?.volume?.rowSpacing ?? dataset?.meta?.pixelSpacing?.[0]
    );
  }

  function kernelSamplingComparison(rhoMaxLpCm, reference) {
    const rhoMax = Number(rhoMaxLpCm);
    const rho10 = Number(reference?.rho10LpCm);
    if (!Number.isFinite(rhoMax)) {
      return { ratio: null, status: "missing-rhoMax" };
    }
    if (!Number.isFinite(rho10) || rho10 <= 0) {
      return { ratio: null, status: reference?.kernel ? "no-kernel-rho10-reference" : "unknown-kernel" };
    }
    const ratio = rhoMax / rho10;
    return {
      ratio,
      status: ratio >= 1 ? "adequate" : ratio >= 0.98 ? "near-limit" : "rhoMax-below-kernel-rho10",
    };
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

  function averageFinite(values) {
    const finite = (values || []).filter(Number.isFinite);
    if (!finite.length) {
      return null;
    }
    return finite.reduce((sum, value) => sum + value, 0) / finite.length;
  }

  function medianAbsoluteDeviation(values, medianValue) {
    const finite = (values || []).filter(Number.isFinite);
    if (!finite.length) {
      return null;
    }
    const sorted = finite.slice().sort((left, right) => left - right);
    const median = Number.isFinite(medianValue) ? medianValue : quantileSorted(sorted, 0.5);
    const deviations = sorted.map((value) => Math.abs(value - median)).sort((left, right) => left - right);
    return quantileSorted(deviations, 0.5);
  }

  function computeStats(values) {
    const finite = (values || []).filter(Number.isFinite);
    if (!finite.length) {
      return null;
    }
    const sorted = finite.slice().sort((left, right) => left - right);
    const count = sorted.length;
    const mean = sorted.reduce((sum, value) => sum + value, 0) / count;
    let squareSum = 0;
    let cubeSum = 0;
    let fourthSum = 0;
    sorted.forEach((value) => {
      const centered = value - mean;
      const square = centered * centered;
      squareSum += square;
      cubeSum += square * centered;
      fourthSum += square * square;
    });
    const variance = squareSum / count;
    const sd = Math.sqrt(Math.max(0, variance));
    const median = quantileSorted(sorted, 0.5);
    const q1 = quantileSorted(sorted, 0.25);
    const q3 = quantileSorted(sorted, 0.75);
    return {
      count,
      mean,
      sd,
      variance,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median,
      q1,
      q3,
      iqr: Number.isFinite(q1) && Number.isFinite(q3) ? q3 - q1 : null,
      range: sorted[sorted.length - 1] - sorted[0],
      mad: medianAbsoluteDeviation(sorted, median),
      skewness: sd > 0 ? cubeSum / count / (sd * sd * sd) : null,
      kurtosis: variance > 0 ? fourthSum / count / (variance * variance) : null,
    };
  }

  function spacingFromVolume(volume) {
    return {
      spacingX: Number(volume?.columnSpacing) || null,
      spacingY: Number(volume?.rowSpacing) || null,
    };
  }

  function snapPixelSquareCenter(value, edgePx) {
    const edge = Math.max(1, Math.round(Number(edgePx) || 1));
    const offset = edge % 2 === 0 ? 0.5 : 0;
    return Math.round((Number(value) || 0) - offset) + offset;
  }

  function createNoiseSquareRoi(options = {}) {
    const sequence = Math.max(1, Math.round(Number(options.sequence) || 1));
    const edgePx = Math.max(1, Math.round(Number(options.edgePx) || DEFAULT_SQUARE_EDGE_PX));
    return {
      id: safeString(options.id) || `np_roi_${String(sequence).padStart(3, "0")}`,
      label: safeString(options.label) || `ROI ${String(sequence).padStart(2, "0")}`,
      type: options.type === NPS_ROI_TYPE ? NPS_ROI_TYPE : ROI_TYPE,
      datasetId: safeString(options.datasetId) || "",
      sliceIndex: Number.isFinite(options.sliceIndex) ? Math.round(options.sliceIndex) : 0,
      centerXImg: snapPixelSquareCenter(options.centerXImg, edgePx),
      centerYImg: snapPixelSquareCenter(options.centerYImg, edgePx),
      edgePx,
      visible: options.visible !== false,
      parentCircleId: safeString(options.parentCircleId) || "",
      ringIndex: Number.isFinite(options.ringIndex) ? Math.round(options.ringIndex) : null,
      angleIndex: Number.isFinite(options.angleIndex) ? Math.round(options.angleIndex) : null,
      angleRadians: Number.isFinite(options.angleRadians) ? Number(options.angleRadians) : null,
      radiusPx: Number.isFinite(options.radiusPx) ? Number(options.radiusPx) : null,
      notes: Array.isArray(options.notes) ? options.notes.slice() : [],
      warnings: Array.isArray(options.warnings) ? options.warnings.slice() : [],
      createdAt: safeString(options.createdAt) || new Date().toISOString(),
      updatedAt: safeString(options.updatedAt) || new Date().toISOString(),
    };
  }

  function createNoisePowerCircle(options = {}) {
    const sequence = Math.max(1, Math.round(Number(options.sequence) || 1));
    return {
      id: safeString(options.id) || `np_circle_${String(sequence).padStart(3, "0")}`,
      label: safeString(options.label) || `NPS Circle ${String(sequence).padStart(2, "0")}`,
      type: CIRCLE_TYPE,
      datasetId: safeString(options.datasetId) || "",
      sliceIndex: Number.isFinite(options.sliceIndex) ? Math.round(options.sliceIndex) : 0,
      centerXImg: Number(options.centerXImg) || 0,
      centerYImg: Number(options.centerYImg) || 0,
      radiusPx: Math.max(0, Number(options.radiusPx) || 0),
      roiEdgePx: Math.max(2, Math.round(Number(options.roiEdgePx) || DEFAULT_NPS_EDGE_PX)),
      peripheralRoiCount: Math.max(0, Math.round(Number(options.peripheralRoiCount) || DEFAULT_NPS_PERIPHERAL_COUNT)),
      ringCount: Math.max(1, Math.round(Number(options.ringCount) || DEFAULT_NPS_RING_COUNT)),
      includeCenter: options.includeCenter !== false,
      detrendPlane: Boolean(options.detrendPlane),
      generated: Boolean(options.generated),
      npsSetId: safeString(options.npsSetId) || "",
      copiedFromCircleId: safeString(options.copiedFromCircleId) || "",
      copiedFromDatasetId: safeString(options.copiedFromDatasetId) || "",
      visible: options.visible !== false,
      notes: Array.isArray(options.notes) ? options.notes.slice() : [],
      warnings: Array.isArray(options.warnings) ? options.warnings.slice() : [],
      createdAt: safeString(options.createdAt) || new Date().toISOString(),
      updatedAt: safeString(options.updatedAt) || new Date().toISOString(),
    };
  }

  function cloneRoi(roi) {
    return {
      ...roi,
      notes: Array.isArray(roi?.notes) ? roi.notes.slice() : [],
      warnings: Array.isArray(roi?.warnings) ? roi.warnings.slice() : [],
    };
  }

  function cloneCircle(circle) {
    return {
      ...circle,
      notes: Array.isArray(circle?.notes) ? circle.notes.slice() : [],
      warnings: Array.isArray(circle?.warnings) ? circle.warnings.slice() : [],
    };
  }

  function circleRootIdFromList(circle, circles) {
    if (!circle) {
      return "";
    }
    const circleById = new Map((circles || []).map((entry) => [entry.id, entry]));
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

  function circleAnalysisSetId(circle, circles) {
    return safeString(circle?.npsSetId) || circleRootIdFromList(circle, circles) || safeString(circle?.id);
  }

  function circlesForNpsAnalysis(circle, circles) {
    if (!circle) {
      return [];
    }
    const candidates = (circles && circles.length ? circles : [circle]).filter(
      (entry) => entry && entry.datasetId === circle.datasetId
    );
    const setId = circleAnalysisSetId(circle, candidates);
    const related = candidates.filter((entry) => circleAnalysisSetId(entry, candidates) === setId);
    return related.length ? related : [circle];
  }

  function resolveSquareGeometry(roi, volume) {
    if (!roi) {
      return null;
    }
    const edgePx = Math.max(1, Math.round(Number(roi.edgePx) || DEFAULT_SQUARE_EDGE_PX));
    const centerXImg = snapPixelSquareCenter(roi.centerXImg, edgePx);
    const centerYImg = snapPixelSquareCenter(roi.centerYImg, edgePx);
    const half = edgePx / 2;
    const xMinBoundaryImg = centerXImg - half;
    const xMaxBoundaryImg = centerXImg + half;
    const yMinBoundaryImg = centerYImg - half;
    const yMaxBoundaryImg = centerYImg + half;
    const intendedColumnStart = Math.ceil(xMinBoundaryImg);
    const intendedColumnEnd = Math.floor(xMaxBoundaryImg);
    const intendedRowStart = Math.ceil(yMinBoundaryImg);
    const intendedRowEnd = Math.floor(yMaxBoundaryImg);
    const intendedSelectedColumnCount = Math.max(0, intendedColumnEnd - intendedColumnStart + 1);
    const intendedSelectedRowCount = Math.max(0, intendedRowEnd - intendedRowStart + 1);
    const columns = Math.max(0, Number(volume?.columns) || 0);
    const rows = Math.max(0, Number(volume?.rows) || 0);
    const columnStart = clamp(intendedColumnStart, 0, Math.max(0, columns - 1));
    const columnEnd = clamp(intendedColumnEnd, 0, Math.max(0, columns - 1));
    const rowStart = clamp(intendedRowStart, 0, Math.max(0, rows - 1));
    const rowEnd = clamp(intendedRowEnd, 0, Math.max(0, rows - 1));
    const selectedColumnCount =
      intendedColumnEnd >= intendedColumnStart && columns ? Math.max(0, columnEnd - columnStart + 1) : 0;
    const selectedRowCount =
      intendedRowEnd >= intendedRowStart && rows ? Math.max(0, rowEnd - rowStart + 1) : 0;
    const spacing = spacingFromVolume(volume);
    const areaPx = selectedColumnCount * selectedRowCount;
    const areaMm2 =
      Number.isFinite(spacing.spacingX) && Number.isFinite(spacing.spacingY)
        ? areaPx * spacing.spacingX * spacing.spacingY
        : null;
    const edgeMmX = Number.isFinite(spacing.spacingX) ? edgePx * spacing.spacingX : null;
    const edgeMmY = Number.isFinite(spacing.spacingY) ? edgePx * spacing.spacingY : null;
    const touchesBoundary =
      xMinBoundaryImg < -0.5 ||
      yMinBoundaryImg < -0.5 ||
      xMaxBoundaryImg > columns - 0.5 ||
      yMaxBoundaryImg > rows - 0.5 ||
      selectedColumnCount !== intendedSelectedColumnCount ||
      selectedRowCount !== intendedSelectedRowCount;
    return {
      centerXImg,
      centerYImg,
      edgePx,
      xMinBoundaryImg,
      xMaxBoundaryImg,
      yMinBoundaryImg,
      yMaxBoundaryImg,
      intendedColumnStart,
      intendedColumnEnd,
      intendedRowStart,
      intendedRowEnd,
      columnStart: selectedColumnCount ? columnStart : null,
      columnEnd: selectedColumnCount ? columnEnd : null,
      rowStart: selectedRowCount ? rowStart : null,
      rowEnd: selectedRowCount ? rowEnd : null,
      selectedColumnCount,
      selectedRowCount,
      intendedSelectedColumnCount,
      intendedSelectedRowCount,
      areaPx,
      areaMm2,
      spacingX: spacing.spacingX,
      spacingY: spacing.spacingY,
      edgeMmX,
      edgeMmY,
      touchesBoundary,
    };
  }

  function buildHistogram(values, binCount = 32) {
    const finite = (values || []).filter(Number.isFinite);
    if (!finite.length) {
      return [];
    }
    const bins = Math.max(2, Math.round(Number(binCount) || 32));
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    const width = max === min ? 1 : (max - min) / bins;
    const counts = new Array(bins).fill(0);
    finite.forEach((value) => {
      const index = clamp(Math.floor((value - min) / width), 0, bins - 1);
      counts[index] += 1;
    });
    return counts.map((count, index) => {
      const lower = min + index * width;
      const upper = index === bins - 1 ? max : lower + width;
      return {
        binIndex: index,
        binLower: lower,
        binUpper: upper,
        binCenter: (lower + upper) / 2,
        count,
        fraction: count / finite.length,
      };
    });
  }

  function matrixColumn(matrix, columnIndex) {
    return (matrix || []).map((row) => row?.[columnIndex]).filter(Number.isFinite);
  }

  function profileFromValues(type, label, axis, values, spacingMm, units) {
    const samples = (values || []).map((value, index) => ({
      sampleIndex: index,
      distancePx: index,
      distanceMm: Number.isFinite(spacingMm) ? index * spacingMm : null,
      value: Number.isFinite(value) ? value : null,
      units: units || "",
    }));
    const profileStats = computeStats(samples.map((sample) => sample.value).filter(Number.isFinite));
    const mean = profileStats?.mean ?? null;
    return {
      type,
      label,
      axis,
      spacingMm: Number.isFinite(spacingMm) ? spacingMm : null,
      units: units || "",
      samples: samples.map((sample) => ({
        ...sample,
        deviationFromProfileMean:
          Number.isFinite(sample.value) && Number.isFinite(mean) ? sample.value - mean : null,
      })),
      values: samples.map((sample) => sample.value),
      stats: profileStats,
    };
  }

  function solve3x3(matrix, vector) {
    const a = matrix.map((row, index) => row.concat([vector[index]]));
    for (let pivot = 0; pivot < 3; pivot += 1) {
      let best = pivot;
      for (let row = pivot + 1; row < 3; row += 1) {
        if (Math.abs(a[row][pivot]) > Math.abs(a[best][pivot])) {
          best = row;
        }
      }
      if (Math.abs(a[best][pivot]) < 1e-12) {
        return null;
      }
      if (best !== pivot) {
        const temp = a[pivot];
        a[pivot] = a[best];
        a[best] = temp;
      }
      const divisor = a[pivot][pivot];
      for (let col = pivot; col < 4; col += 1) {
        a[pivot][col] /= divisor;
      }
      for (let row = 0; row < 3; row += 1) {
        if (row === pivot) {
          continue;
        }
        const factor = a[row][pivot];
        for (let col = pivot; col < 4; col += 1) {
          a[row][col] -= factor * a[pivot][col];
        }
      }
    }
    return [a[0][3], a[1][3], a[2][3]];
  }

  function fitPlane(matrix) {
    const rows = matrix?.length || 0;
    const columns = matrix?.[0]?.length || 0;
    if (!rows || !columns) {
      return null;
    }
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    let sxz = 0;
    let syz = 0;
    const xCenter = (columns - 1) / 2;
    const yCenter = (rows - 1) / 2;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const z = matrix[row][col];
        if (!Number.isFinite(z)) {
          continue;
        }
        const x = col - xCenter;
        const y = row - yCenter;
        n += 1;
        sx += x;
        sy += y;
        sz += z;
        sxx += x * x;
        syy += y * y;
        sxy += x * y;
        sxz += x * z;
        syz += y * z;
      }
    }
    const coeff = solve3x3(
      [
        [n, sx, sy],
        [sx, sxx, sxy],
        [sy, sxy, syy],
      ],
      [sz, sxz, syz]
    );
    if (!coeff) {
      return null;
    }
    const [intercept, slopeX, slopeY] = coeff;
    const fitted = [];
    const residual = [];
    for (let row = 0; row < rows; row += 1) {
      const fittedRow = [];
      const residualRow = [];
      for (let col = 0; col < columns; col += 1) {
        const x = col - xCenter;
        const y = row - yCenter;
        const fit = intercept + slopeX * x + slopeY * y;
        fittedRow.push(fit);
        residualRow.push(Number.isFinite(matrix[row][col]) ? matrix[row][col] - fit : null);
      }
      fitted.push(fittedRow);
      residual.push(residualRow);
    }
    return {
      intercept,
      slopeXPerPixel: slopeX,
      slopeYPerPixel: slopeY,
      fitted,
      residual,
      residualStats: computeStats(residual.flat().filter(Number.isFinite)),
    };
  }

  function buildProfileAnalysis(extraction, options = {}) {
    const matrix = extraction?.calibratedMatrix;
    if (!Array.isArray(matrix) || !matrix.length || !Array.isArray(matrix[0]) || !matrix[0].length) {
      return null;
    }
    const rows = matrix.length;
    const columns = matrix[0].length;
    const centerRow = Math.floor((rows - 1) / 2);
    const centerColumn = Math.floor((columns - 1) / 2);
    const spacingX = extraction.geometry?.spacingX ?? null;
    const spacingY = extraction.geometry?.spacingY ?? null;
    const units = extraction.units || "";
    const horizontalCenter = profileFromValues(
      "horizontal-center",
      "Horizontal center profile",
      "x",
      matrix[centerRow].slice(),
      spacingX,
      units
    );
    const verticalCenter = profileFromValues(
      "vertical-center",
      "Vertical center profile",
      "y",
      matrixColumn(matrix, centerColumn),
      spacingY,
      units
    );
    const horizontalMean = profileFromValues(
      "horizontal-mean",
      "Averaged horizontal profile",
      "x",
      Array.from({ length: columns }, (_, column) => averageFinite(matrixColumn(matrix, column))),
      spacingX,
      units
    );
    const verticalMean = profileFromValues(
      "vertical-mean",
      "Averaged vertical profile",
      "y",
      matrix.map((row) => averageFinite(row)),
      spacingY,
      units
    );
    const plane = fitPlane(matrix);
    return {
      rowCount: rows,
      columnCount: columns,
      centerRow,
      centerColumn,
      profiles: [horizontalCenter, verticalCenter, horizontalMean, verticalMean],
      profilesByType: {
        "horizontal-center": horizontalCenter,
        "vertical-center": verticalCenter,
        "horizontal-mean": horizontalMean,
        "vertical-mean": verticalMean,
      },
      histogram: buildHistogram(matrix.flat(), options.histogramBins || 32),
      plane,
      residualDetrendedSd: plane?.residualStats?.sd ?? null,
    };
  }

  function smoothMovingAverage(values, radius = 2) {
    return (values || []).map((value, index) => {
      let sum = 0;
      let count = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const candidate = values[index + offset];
        if (Number.isFinite(candidate)) {
          sum += candidate;
          count += 1;
        }
      }
      return count ? sum / count : value;
    });
  }

  function interpolateThresholdFrequency(points, threshold) {
    const target = Number(threshold);
    if (!Number.isFinite(target)) {
      return null;
    }
    const curve = (points || []).filter((point) => Number.isFinite(point.frequencyMmMinus1) && Number.isFinite(point.ttf));
    for (let index = 1; index < curve.length; index += 1) {
      const previous = curve[index - 1];
      const current = curve[index];
      if ((previous.ttf >= target && current.ttf <= target) || (previous.ttf <= target && current.ttf >= target)) {
        const span = current.ttf - previous.ttf;
        const t = Math.abs(span) > 1e-12 ? (target - previous.ttf) / span : 0;
        return previous.frequencyMmMinus1 + (current.frequencyMmMinus1 - previous.frequencyMmMinus1) * clamp(t, 0, 1);
      }
    }
    return null;
  }

  function buildTtfAnalysisFromSquare(extraction, options = {}) {
    const matrix = extraction?.calibratedMatrix;
    const geometry = extraction?.geometry || {};
    const spacingX = Number(geometry.spacingX);
    const spacingY = Number(geometry.spacingY);
    const warnings = [];
    if (!Array.isArray(matrix) || matrix.length < 8 || !Array.isArray(matrix[0]) || matrix[0].length < 8) {
      return { valid: false, error: "TTFxy needs a square ROI of at least 8 x 8 pixels.", warnings: ["ttf-roi-too-small"] };
    }
    if (!Number.isFinite(spacingX) || !Number.isFinite(spacingY) || spacingX <= 0 || spacingY <= 0) {
      return { valid: false, error: "TTFxy needs valid in-plane pixel spacing.", warnings: ["ttf-missing-pixel-spacing"] };
    }
    if (Math.abs(spacingX - spacingY) > 1e-6) {
      warnings.push("ttf-anisotropic-pixel-spacing");
    }
    const nyquistFrequency = Math.min(1 / (2 * spacingX), 1 / (2 * spacingY));
    const rhoMaxLpCm = rhoMaxLpCmFromSpacing(spacingX, spacingY);
    const resolutionLimit = { nyquistFrequency, rhoMaxLpCm };
    const rows = matrix.length;
    const columns = matrix[0].length;
    const values = matrix.flat().filter(Number.isFinite);
    const stats = computeStats(values);
    if (!stats || !Number.isFinite(stats.sd)) {
      return { valid: false, error: "TTFxy needs finite source HU values.", warnings: ["ttf-no-finite-pixels"] };
    }
    const sorted = values.slice().sort((left, right) => left - right);
    const lowLevel = quantileSorted(sorted, 0.1);
    const highLevel = quantileSorted(sorted, 0.9);
    const contrast = Number.isFinite(lowLevel) && Number.isFinite(highLevel) ? highLevel - lowLevel : null;
    const lowerTail = sorted.slice(0, Math.max(4, Math.floor(sorted.length * 0.2)));
    const upperTail = sorted.slice(Math.max(0, sorted.length - Math.max(4, Math.floor(sorted.length * 0.2))));
    const lowNoise = computeStats(lowerTail)?.sd ?? null;
    const highNoise = computeStats(upperTail)?.sd ?? null;
    const noiseEstimate = averageFinite([lowNoise, highNoise]);
    const cnr = Number.isFinite(contrast) && Number.isFinite(noiseEstimate) && noiseEstimate > 0 ? Math.abs(contrast) / noiseEstimate : null;
    const plane = fitPlane(matrix);
    const slopeXPerMm = Number.isFinite(plane?.slopeXPerPixel) ? plane.slopeXPerPixel / spacingX : null;
    const slopeYPerMm = Number.isFinite(plane?.slopeYPerPixel) ? plane.slopeYPerPixel / spacingY : null;
    const gradientMagnitude = Math.hypot(Number(slopeXPerMm) || 0, Number(slopeYPerMm) || 0);
    const minContrast = Math.max(5, (Number(noiseEstimate) || 0) * 1.5);
    if (!Number.isFinite(contrast) || Math.abs(contrast) < minContrast || !Number.isFinite(gradientMagnitude) || gradientMagnitude <= 1e-9) {
      return {
        valid: false,
        error: "TTFxy edge was not detected. Place the square ROI across a circular insert or material edge.",
        warnings: warnings.concat(["ttf-no-edge-detected"]),
        contrastHu: contrast,
        noiseHu: noiseEstimate,
        cnr,
        ...resolutionLimit,
      };
    }
    if (Number.isFinite(cnr) && cnr < 15) {
      return {
        valid: false,
        error: "TTFxy CNR is below the TG-233 threshold; rho10 is not reported.",
        warnings: warnings.concat(["ttf-low-cnr-tg233"]),
        units: extraction?.units || "HU",
        contrastHu: contrast,
        noiseHu: noiseEstimate,
        cnr,
        lowLevelHu: lowLevel,
        highLevelHu: highLevel,
        ...resolutionLimit,
      };
    }

    const normalX = slopeXPerMm / gradientMagnitude;
    const normalY = slopeYPerMm / gradientMagnitude;
    const xCenter = (columns - 1) / 2;
    const yCenter = (rows - 1) / 2;
    const samples = [];
    let sumD = 0;
    let sumV = 0;
    let sumDD = 0;
    let sumDV = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const value = matrix[row][column];
        if (!Number.isFinite(value)) {
          continue;
        }
        const xMm = (column - xCenter) * spacingX;
        const yMm = (row - yCenter) * spacingY;
        const distance = xMm * normalX + yMm * normalY;
        samples.push({ distance, value });
        sumD += distance;
        sumV += value;
        sumDD += distance * distance;
        sumDV += distance * value;
      }
    }
    const denominator = samples.length * sumDD - sumD * sumD;
    const slope = Math.abs(denominator) > 1e-12 ? (samples.length * sumDV - sumD * sumV) / denominator : null;
    const intercept = Number.isFinite(slope) ? (sumV - slope * sumD) / samples.length : null;
    const midpoint = (lowLevel + highLevel) / 2;
    const edgeOffset = Number.isFinite(slope) && Math.abs(slope) > 1e-12 ? (midpoint - intercept) / slope : 0;
    const binWidthMm = Math.min(spacingX, spacingY) / 10;
    const distances = samples.map((sample) => sample.distance - edgeOffset);
    const minDistance = Math.min(...distances);
    const maxDistance = Math.max(...distances);
    const binCount = Math.max(8, Math.ceil((maxDistance - minDistance) / binWidthMm) + 1);
    const bins = Array.from({ length: binCount }, (_, index) => ({
      distanceMm: minDistance + (index + 0.5) * binWidthMm,
      sum: 0,
      count: 0,
    }));
    samples.forEach((sample, index) => {
      const binIndex = clamp(Math.floor((distances[index] - minDistance) / binWidthMm), 0, binCount - 1);
      bins[binIndex].sum += sample.value;
      bins[binIndex].count += 1;
    });
    let esf = bins
      .filter((bin) => bin.count > 0)
      .map((bin) => ({
        distanceMm: bin.distanceMm,
        value: bin.sum / bin.count,
        count: bin.count,
      }));
    if (esf.length < 8) {
      return {
        valid: false,
        error: "TTFxy edge profile has too few populated distance bins.",
        warnings: warnings.concat(["ttf-insufficient-edge-samples"]),
        contrastHu: contrast,
        noiseHu: noiseEstimate,
        cnr,
        ...resolutionLimit,
      };
    }
    const firstMean = averageFinite(esf.slice(0, Math.min(4, esf.length)).map((point) => point.value));
    const lastMean = averageFinite(esf.slice(Math.max(0, esf.length - 4)).map((point) => point.value));
    if (Number.isFinite(firstMean) && Number.isFinite(lastMean) && firstMean > lastMean) {
      esf = esf.map((point) => ({ ...point, distanceMm: -point.distanceMm })).reverse();
    }
    const smoothedValues = smoothMovingAverage(esf.map((point) => point.value), Number(options.smoothingRadius) || 2);
    const normalizedDenominator = Math.abs(contrast) > 1e-12 ? Math.abs(contrast) : 1;
    const normalizedOffset = contrast >= 0 ? lowLevel : highLevel;
    esf = esf.map((point, index) => ({
      ...point,
      smoothedValue: smoothedValues[index],
      normalizedValue: (smoothedValues[index] - normalizedOffset) / normalizedDenominator,
    }));
    const lsfValues = esf.map((point, index) => {
      if (index === 0) {
        return (esf[1].normalizedValue - point.normalizedValue) / Math.max(1e-12, esf[1].distanceMm - point.distanceMm);
      }
      if (index === esf.length - 1) {
        return (point.normalizedValue - esf[index - 1].normalizedValue) / Math.max(1e-12, point.distanceMm - esf[index - 1].distanceMm);
      }
      return (esf[index + 1].normalizedValue - esf[index - 1].normalizedValue) /
        Math.max(1e-12, esf[index + 1].distanceMm - esf[index - 1].distanceMm);
    });
    let fftLength = 1;
    while (fftLength < Math.max(1024, lsfValues.length)) {
      fftLength *= 2;
    }
    const real = new Array(fftLength).fill(0);
    const imag = new Array(fftLength).fill(0);
    lsfValues.forEach((value, index) => {
      const window = lsfValues.length > 1 ? 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (lsfValues.length - 1)) : 1;
      real[index] = Number.isFinite(value) ? value * window : 0;
    });
    fft1d(real, imag);
    const dc = Math.hypot(real[0], imag[0]);
    if (!Number.isFinite(dc) || dc <= 1e-12) {
      return {
        valid: false,
        error: "TTFxy FFT normalization failed because the LSF DC component is zero.",
        warnings: warnings.concat(["ttf-zero-lsf-dc"]),
        contrastHu: contrast,
        noiseHu: noiseEstimate,
        cnr,
        ...resolutionLimit,
      };
    }
    const ttf = [];
    for (let index = 0; index <= fftLength / 2; index += 1) {
      const frequencyMmMinus1 = index / (fftLength * binWidthMm);
      if (frequencyMmMinus1 > nyquistFrequency + 1e-12) {
        break;
      }
      ttf.push({
        frequencyMmMinus1,
        ttf: Math.hypot(real[index], imag[index]) / dc,
      });
    }
    const f50Frequency = interpolateThresholdFrequency(ttf, 0.5);
    const f10Frequency = interpolateThresholdFrequency(ttf, 0.1);
    const rho10LpCm = Number.isFinite(f10Frequency) ? f10Frequency * 10 : null;
    const rho50LpCm = Number.isFinite(f50Frequency) ? f50Frequency * 10 : null;
    const rhoMaxOverRho10 =
      Number.isFinite(rhoMaxLpCm) && Number.isFinite(rho10LpCm) && rho10LpCm > 0 ? rhoMaxLpCm / rho10LpCm : null;
    const lsf = esf.map((point, index) => ({
      distanceMm: point.distanceMm,
      value: lsfValues[index],
    }));
    return {
      valid: true,
      method: "square-roi-dominant-edge-esf-lsf-fft-ttfxy",
      formula: "TTFxy(f) = |FFT(dESF/dx)| / |FFT(dESF/dx)[0]|",
      warnings,
      units: extraction?.units || "HU",
      contrastHu: contrast,
      noiseHu: noiseEstimate,
      cnr,
      lowLevelHu: lowLevel,
      highLevelHu: highLevel,
      edgeAngleDegrees: (Math.atan2(normalY, normalX) * 180) / Math.PI,
      binWidthMm,
      smoothingRadius: Number(options.smoothingRadius) || 2,
      nyquistFrequency,
      f50Frequency,
      f10Frequency,
      rho10LpCm,
      rho50LpCm,
      rhoMaxLpCm,
      rhoMaxOverRho10,
      rhoMaxAdequate: Number.isFinite(rhoMaxOverRho10) ? rhoMaxOverRho10 >= 1 : null,
      esf,
      lsf,
      ttf,
    };
  }

  function extractSquareRoiPixels(volume, sliceIndex, roi, options = {}) {
    const geometry = resolveSquareGeometry(roi, volume);
    if (!geometry) {
      return { error: "ROI geometry could not be resolved.", geometry };
    }
    const slice = volume?.slices?.[sliceIndex];
    const record = slice?.record || volume?.records?.[sliceIndex] || null;
    if (!slice || !slice.pixels || !Number.isFinite(volume?.columns)) {
      return { error: "The selected slice has no source pixel data.", geometry };
    }
    if (!Number.isFinite(geometry.columnStart) || !Number.isFinite(geometry.rowStart)) {
      return { error: "ROI does not intersect the source image.", geometry };
    }
    const units =
      safeString(slice.units) ||
      safeString(record?.rescaleType) ||
      (safeString(record?.modality) === "CT" ? "HU" : "rescaled");
    const storedValues = [];
    const calibratedValues = [];
    const entries = [];
    const storedMatrix = [];
    const calibratedMatrix = [];
    const slope = Number.isFinite(slice.slope) ? slice.slope : Number(record?.rescaleSlope) || 1;
    const intercept = Number.isFinite(slice.intercept) ? slice.intercept : Number(record?.rescaleIntercept) || 0;

    for (let row = geometry.rowStart; row <= geometry.rowEnd; row += 1) {
      const storedRow = [];
      const calibratedRow = [];
      for (let column = geometry.columnStart; column <= geometry.columnEnd; column += 1) {
        const index = row * volume.columns + column;
        const stored = slice.pixels[index];
        const calibrated = stored * slope + intercept;
        storedValues.push(stored);
        calibratedValues.push(calibrated);
        storedRow.push(stored);
        calibratedRow.push(calibrated);
        entries.push({
          rowInRoi: row - geometry.rowStart,
          colInRoi: column - geometry.columnStart,
          imageX: column,
          imageY: row,
          storedPixelValue: stored,
          rescaledValue: calibrated,
          calibratedValue: calibrated,
          units,
        });
      }
      storedMatrix.push(storedRow);
      calibratedMatrix.push(calibratedRow);
    }

    const statsStored = computeStats(storedValues);
    const statsCalibrated = computeStats(calibratedValues);
    const profileAnalysis = buildProfileAnalysis({ calibratedMatrix, geometry, units }, { histogramBins: 32 });
    const ttfAnalysis =
      options.includeTtf === false || roi?.type !== ROI_TYPE
        ? null
        : buildTtfAnalysisFromSquare({ calibratedMatrix, geometry, units, statsCalibrated });
    const plane = profileAnalysis?.plane || null;
    const gradientRange =
      plane && calibratedMatrix.length && calibratedMatrix[0]?.length
        ? Math.hypot(
            plane.slopeXPerPixel * Math.max(1, calibratedMatrix[0].length - 1),
            plane.slopeYPerPixel * Math.max(1, calibratedMatrix.length - 1)
          )
        : null;
    const warnings = [];
    if (geometry.touchesBoundary) {
      warnings.push("boundary");
    }
    if (geometry.areaPx < MINIMUM_RECOMMENDED_PIXEL_COUNT) {
      warnings.push("small-roi");
    }
    if (Number.isFinite(gradientRange) && Number.isFinite(statsCalibrated?.sd)) {
      const gradientThreshold = Math.max(10, statsCalibrated.sd * 2);
      if (gradientRange > gradientThreshold) {
        warnings.push("edge-or-gradient");
      }
    }
    if (
      Number.isFinite(profileAnalysis?.residualDetrendedSd) &&
      Number.isFinite(statsCalibrated?.sd) &&
      statsCalibrated.sd > 0 &&
      profileAnalysis.residualDetrendedSd / statsCalibrated.sd < 0.5
    ) {
      warnings.push("trend-dominated");
    }

    return {
      geometry,
      slice,
      record,
      slope,
      intercept,
      units,
      entries,
      storedMatrix,
      calibratedMatrix,
      storedValues,
      calibratedValues,
      statsStored,
      statsCalibrated,
      profileAnalysis,
      ttfAnalysis,
      warnings,
      warningFlags: {
        boundary: warnings.includes("boundary"),
        tooSmall: warnings.includes("small-roi"),
        edgeGradient: warnings.includes("edge-or-gradient"),
        trendDominated: warnings.includes("trend-dominated"),
      },
      gradientRange,
      residualDetrendedSd: profileAnalysis?.residualDetrendedSd ?? null,
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
      throw new Error("2D FFT requires a square power-of-two matrix.");
    }
    const real = matrix.map((row) => row.slice());
    const imag = matrix.map(() => new Array(size).fill(0));
    for (let row = 0; row < size; row += 1) {
      fft1d(real[row], imag[row]);
    }
    for (let column = 0; column < size; column += 1) {
      const columnReal = [];
      const columnImag = [];
      for (let row = 0; row < size; row += 1) {
        columnReal.push(real[row][column]);
        columnImag.push(imag[row][column]);
      }
      fft1d(columnReal, columnImag);
      for (let row = 0; row < size; row += 1) {
        real[row][column] = columnReal[row];
        imag[row][column] = columnImag[row];
      }
    }
    return { real, imag };
  }

  function fftShift2d(matrix) {
    const size = matrix.length;
    const half = Math.floor(size / 2);
    return Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, column) => matrix[(row + half) % size][(column + half) % size])
    );
  }

  function meanSubtractMatrix(matrix) {
    const stats = computeStats(matrix.flat().filter(Number.isFinite));
    const mean = stats?.mean ?? 0;
    return {
      mean,
      variance: stats?.variance ?? null,
      matrix: matrix.map((row) => row.map((value) => (Number.isFinite(value) ? value - mean : 0))),
    };
  }

  function planeDetrendMatrix(matrix) {
    const plane = fitPlane(matrix);
    if (!plane) {
      return meanSubtractMatrix(matrix);
    }
    const residual = plane.residual.map((row) => row.map((value) => (Number.isFinite(value) ? value : 0)));
    const stats = computeStats(residual.flat().filter(Number.isFinite));
    return {
      mean: 0,
      variance: stats?.variance ?? null,
      matrix: residual,
      plane,
    };
  }

  function buildRadialBins(nps2d, spacingX, spacingY, integratedNps) {
    const size = nps2d.length;
    const frequencyStepX = 1 / (size * spacingX);
    const frequencyStepY = 1 / (size * spacingY);
    const frequencyCellArea = frequencyStepX * frequencyStepY;
    const nyquistX = 1 / (2 * spacingX);
    const nyquistY = 1 / (2 * spacingY);
    const nyquist = Math.min(nyquistX, nyquistY);
    const binWidth = Math.min(frequencyStepX, frequencyStepY);
    const binCount = Math.max(1, Math.ceil(nyquist / binWidth));
    const bins = Array.from({ length: binCount }, (_, index) => ({
      binIndex: index,
      frequencyLower: index * binWidth,
      frequencyUpper: Math.min(nyquist, (index + 1) * binWidth),
      frequencyCenter: Math.min(nyquist, (index + 0.5) * binWidth),
      sum: 0,
      count: 0,
      integratedPower: 0,
    }));
    const center = size / 2;
    for (let row = 0; row < size; row += 1) {
      const fy = (row - center) * frequencyStepY;
      for (let column = 0; column < size; column += 1) {
        const fx = (column - center) * frequencyStepX;
        const frequency = Math.sqrt(fx * fx + fy * fy);
        if (frequency > nyquist) {
          continue;
        }
        const binIndex = clamp(Math.floor(frequency / binWidth), 0, binCount - 1);
        const value = nps2d[row][column];
        bins[binIndex].sum += value;
        bins[binIndex].count += 1;
        bins[binIndex].integratedPower += value * frequencyCellArea;
      }
    }
    const radialIntegrated = bins.reduce((sum, bin) => sum + bin.integratedPower, 0);
    let cumulative = 0;
    return bins.map((bin) => {
      const nps = bin.count ? bin.sum / bin.count : null;
      cumulative += bin.integratedPower;
      return {
        binIndex: bin.binIndex,
        frequencyLower: bin.frequencyLower,
        frequencyUpper: bin.frequencyUpper,
        frequencyCenter: bin.frequencyCenter,
        nps,
        normalizedNps: Number.isFinite(integratedNps) && integratedNps > 0 && Number.isFinite(nps) ? nps / integratedNps : null,
        integratedPower: bin.integratedPower,
        cumulativeNoisePower: cumulative,
        cumulativeFraction: radialIntegrated > 0 ? cumulative / radialIntegrated : null,
        cumulativeFractionOfTotalNps: integratedNps > 0 ? cumulative / integratedNps : null,
        sampleCount: bin.count,
      };
    });
  }

  function frequencyAtCumulativeFraction(radialBins, fraction) {
    const target = Number(fraction);
    if (!Number.isFinite(target)) {
      return null;
    }
    const totalPower = (radialBins || []).filter((bin) => Number.isFinite(bin.cumulativeNoisePower)).pop()?.cumulativeNoisePower ?? null;
    for (const bin of radialBins || []) {
      if (!Number.isFinite(bin.cumulativeFraction) || bin.cumulativeFraction < target) {
        continue;
      }
      const previousFraction =
        Number.isFinite(totalPower) && totalPower > 0
          ? Math.max(0, (bin.cumulativeNoisePower - (Number(bin.integratedPower) || 0)) / totalPower)
          : 0;
      const span = bin.cumulativeFraction - previousFraction;
      if (span > 1e-12) {
        const t = clamp((target - previousFraction) / span, 0, 1);
        return bin.frequencyLower + (bin.frequencyUpper - bin.frequencyLower) * t;
      }
      return bin.frequencyCenter;
    }
    return (radialBins || []).filter((bin) => Number.isFinite(bin.frequencyUpper)).pop()?.frequencyUpper ?? null;
  }

  function frequencyAtPeakFractionTail(radialBins, peakBin, fraction = 0.1) {
    const bins = (radialBins || []).filter((bin) => Number.isFinite(bin.frequencyCenter) && Number.isFinite(bin.nps));
    if (!bins.length || !peakBin || !Number.isFinite(peakBin.nps) || peakBin.nps <= 0) {
      return null;
    }
    const peakIndex = bins.findIndex((bin) => bin.binIndex === peakBin.binIndex);
    if (peakIndex < 0) {
      return null;
    }
    const target = peakBin.nps * clamp(Number(fraction) || 0.1, 0, 1);
    for (let index = peakIndex + 1; index < bins.length; index += 1) {
      const current = bins[index];
      const previous = bins[index - 1];
      if (current.nps > target) {
        continue;
      }
      const span = current.nps - previous.nps;
      if (Math.abs(span) > 1e-12) {
        const t = clamp((target - previous.nps) / span, 0, 1);
        return previous.frequencyCenter + (current.frequencyCenter - previous.frequencyCenter) * t;
      }
      return current.frequencyCenter;
    }
    return bins[bins.length - 1]?.frequencyCenter ?? null;
  }

  function cumulativePowerAtFrequency(radialBins, frequency) {
    const f = Number(frequency);
    if (!Number.isFinite(f)) {
      return null;
    }
    let previous = 0;
    for (const bin of radialBins || []) {
      if (f >= bin.frequencyUpper) {
        previous = bin.cumulativeNoisePower;
        continue;
      }
      if (f <= bin.frequencyLower) {
        return previous;
      }
      const span = bin.frequencyUpper - bin.frequencyLower;
      const t = span > 0 ? (f - bin.frequencyLower) / span : 0;
      return previous + (Number(bin.integratedPower) || 0) * clamp(t, 0, 1);
    }
    return (radialBins || []).filter((bin) => Number.isFinite(bin.cumulativeNoisePower)).pop()?.cumulativeNoisePower ?? null;
  }

  function bandFractions(radialBins, nyquist) {
    const total = (radialBins || []).reduce((sum, bin) => sum + (Number(bin.integratedPower) || 0), 0);
    const bands = [
      { key: "low", lower: 0, upper: nyquist * 0.25, power: 0 },
      { key: "mid", lower: nyquist * 0.25, upper: nyquist * 0.5, power: 0 },
      { key: "high", lower: nyquist * 0.5, upper: nyquist, power: 0 },
    ];
    (radialBins || []).forEach((bin) => {
      const center = bin.frequencyCenter;
      const band = center < bands[0].upper ? bands[0] : center < bands[1].upper ? bands[1] : bands[2];
      band.power += Number(bin.integratedPower) || 0;
    });
    return bands.map((band) => ({
      ...band,
      fraction: total > 0 ? band.power / total : null,
    }));
  }

  function buildNpsAnalysisFromMatrices(matrices, options = {}) {
    const spacingX = Number(options.spacingX);
    const spacingY = Number(options.spacingY);
    if (!Number.isFinite(spacingX) || !Number.isFinite(spacingY) || spacingX <= 0 || spacingY <= 0) {
      return { error: "NPS analysis requires valid Pixel Spacing in x and y." };
    }
    const valid = (matrices || []).filter(
      (matrix) =>
        Array.isArray(matrix) &&
        matrix.length &&
        matrix.every((row) => Array.isArray(row) && row.length === matrix.length)
    );
    if (!valid.length) {
      return { error: "At least one complete square ROI matrix is required for NPS." };
    }
    const size = valid[0].length;
    if (!isPowerOfTwo(size)) {
      return { error: "NPS square ROI edge must be a power of two." };
    }
    if (!valid.every((matrix) => matrix.length === size)) {
      return { error: "All NPS square ROIs must have the same edge length." };
    }
    const detrendPlane = Boolean(options.detrendPlane);
    const accumulator = Array.from({ length: size }, () => new Array(size).fill(0));
    const roiMeans = [];
    const roiVariances = [];
    valid.forEach((matrix) => {
      const detrended = detrendPlane ? planeDetrendMatrix(matrix) : meanSubtractMatrix(matrix);
      roiMeans.push(detrended.mean);
      roiVariances.push(detrended.variance);
      const fft = fft2dReal(detrended.matrix);
      const power = Array.from({ length: size }, (_, row) =>
        Array.from({ length: size }, (_, column) => {
          const real = fft.real[row][column];
          const imag = fft.imag[row][column];
          return real * real + imag * imag;
        })
      );
      const shifted = fftShift2d(power);
      for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
          accumulator[row][column] += shifted[row][column];
        }
      }
    });
    const scale = (spacingX * spacingY) / (size * size * valid.length);
    const nps2d = accumulator.map((row) => row.map((value) => value * scale));
    const frequencyStepX = 1 / (size * spacingX);
    const frequencyStepY = 1 / (size * spacingY);
    const integratedNps = nps2d.flat().reduce((sum, value) => sum + value, 0) * frequencyStepX * frequencyStepY;
    const normalizedNps2d =
      integratedNps > 0 ? nps2d.map((row) => row.map((value) => value / integratedNps)) : null;
    const radialBins = buildRadialBins(nps2d, spacingX, spacingY, integratedNps);
    const radialIntegratedNps = radialBins.reduce((sum, bin) => sum + (Number(bin.integratedPower) || 0), 0);
    const peakBin = radialBins.reduce((best, bin) => {
      if (!Number.isFinite(bin.nps)) {
        return best;
      }
      return !best || bin.nps > best.nps ? bin : best;
    }, null);
    const normalizedPeakBin = radialBins.reduce((best, bin) => {
      if (!Number.isFinite(bin.normalizedNps)) {
        return best;
      }
      return !best || bin.normalizedNps > best.normalizedNps ? bin : best;
    }, null);
    const averageFrequency =
      radialIntegratedNps > 0
        ? radialBins.reduce((sum, bin) => sum + bin.frequencyCenter * (Number(bin.integratedPower) || 0), 0) /
          radialIntegratedNps
        : null;
    const nyquistX = 1 / (2 * spacingX);
    const nyquistY = 1 / (2 * spacingY);
    const nyquist = Math.min(nyquistX, nyquistY);
    const bands = bandFractions(radialBins, nyquist);
    const meanRoiVariance = averageFinite(roiVariances);
    const warnings = [];
    if (Math.abs(spacingX - spacingY) > 1e-6) {
      warnings.push("anisotropic-pixel-spacing");
    }
    if (Number.isFinite(meanRoiVariance) && Math.abs(meanRoiVariance) > 1e-12) {
      const closure = integratedNps / meanRoiVariance;
      if (Math.abs(closure - 1) > 0.05) {
        warnings.push("variance-closure-check");
      }
    }
    return {
      method: detrendPlane ? "2d-fft-plane-detrended-square-roi" : "2d-fft-mean-subtracted-square-roi",
      formula:
        "NPS_2D(fx,fy) = dx * dy / (Nx * Ny) * average(|FFT2(ROI - mean_ROI)|^2)",
      roiCount: valid.length,
      edgePx: size,
      spacingX,
      spacingY,
      frequencyStepX,
      frequencyStepY,
      nyquistX,
      nyquistY,
      nyquistFrequency: nyquist,
      rhoMaxLpCm: rhoMaxLpCmFromSpacing(spacingX, spacingY),
      units: safeString(options.units) || "HU",
      npsUnits: `${safeString(options.units) || "HU"}^2 mm^2`,
      normalizedNpsUnits: "mm^2",
      integratedNps,
      radialIntegratedNps,
      radialCoverageFraction: integratedNps > 0 ? radialIntegratedNps / integratedNps : null,
      meanRoiVariance,
      varianceClosureRatio:
        Number.isFinite(meanRoiVariance) && Math.abs(meanRoiVariance) > 1e-12 ? integratedNps / meanRoiVariance : null,
      peakFrequency: peakBin?.frequencyCenter ?? null,
      peakNps: peakBin?.nps ?? null,
      f10TailFrequency: frequencyAtPeakFractionTail(radialBins, peakBin, 0.1),
      normalizedPeakFrequency: normalizedPeakBin?.frequencyCenter ?? null,
      normalizedPeakNps: normalizedPeakBin?.normalizedNps ?? null,
      averageFrequency,
      spectralCentroidFrequency: averageFrequency,
      f10Frequency: frequencyAtCumulativeFraction(radialBins, 0.1),
      f50Frequency: frequencyAtCumulativeFraction(radialBins, 0.5),
      f90Frequency: frequencyAtCumulativeFraction(radialBins, 0.9),
      cumulativePowerAt025: cumulativePowerAtFrequency(radialBins, 0.25),
      cumulativePowerAt050: cumulativePowerAtFrequency(radialBins, 0.5),
      lowFrequencyPowerFraction: bands.find((band) => band.key === "low")?.fraction ?? null,
      midFrequencyPowerFraction: bands.find((band) => band.key === "mid")?.fraction ?? null,
      highFrequencyPowerFraction: bands.find((band) => band.key === "high")?.fraction ?? null,
      bands,
      roiMeans,
      roiVariances,
      nps2d,
      normalizedNps2d,
      radialBins,
      warnings,
    };
  }

  function rectanglesOverlap(first, second) {
    const a = resolveSquareGeometry(first, { rows: Number.POSITIVE_INFINITY, columns: Number.POSITIVE_INFINITY });
    const b = resolveSquareGeometry(second, { rows: Number.POSITIVE_INFINITY, columns: Number.POSITIVE_INFINITY });
    return (
      a.xMinBoundaryImg < b.xMaxBoundaryImg &&
      a.xMaxBoundaryImg > b.xMinBoundaryImg &&
      a.yMinBoundaryImg < b.yMaxBoundaryImg &&
      a.yMaxBoundaryImg > b.yMinBoundaryImg
    );
  }

  function generateNpsRoisForCircle(circle, options = {}) {
    const edgePx = Math.max(2, Math.round(Number(options.edgePx ?? circle?.roiEdgePx) || DEFAULT_NPS_EDGE_PX));
    const edgeForNps = isPowerOfTwo(edgePx) ? edgePx : nextPowerOfTwo(edgePx);
    const peripheralRoiCount = Math.max(
      0,
      Math.round(Number(options.peripheralRoiCount ?? circle?.peripheralRoiCount) || DEFAULT_NPS_PERIPHERAL_COUNT)
    );
    const ringCount = Math.max(1, Math.round(Number(options.ringCount ?? circle?.ringCount) || DEFAULT_NPS_RING_COUNT));
    const includeCenter = options.includeCenter ?? circle?.includeCenter !== false;
    const halfDiagonal = (edgeForNps * Math.SQRT2) / 2;
    const margin = Math.max(0, Number(options.marginPx) || DEFAULT_NPS_MARGIN_PX);
    const usableRadius = Math.max(0, Number(circle?.radiusPx || 0) - halfDiagonal - margin);
    let sequence = Math.max(1, Math.round(Number(options.sequenceStart) || 1));
    const rois = [];
    const warnings = [];

    function addRoi(x, y, ringIndex, angleIndex, angleRadians, radiusPx) {
      const roi = createNoiseSquareRoi({
        id: `np_nps_${String(sequence).padStart(3, "0")}`,
        label: ringIndex === 0 ? "NPS center" : `NPS r${ringIndex} a${angleIndex + 1}`,
        type: NPS_ROI_TYPE,
        datasetId: circle.datasetId,
        sliceIndex: circle.sliceIndex,
        centerXImg: x,
        centerYImg: y,
        edgePx: edgeForNps,
        parentCircleId: circle.id,
        ringIndex,
        angleIndex,
        angleRadians,
        radiusPx,
      });
      rois.push(roi);
      sequence += 1;
    }

    if (includeCenter) {
      addRoi(circle.centerXImg, circle.centerYImg, 0, 0, 0, 0);
    }
    if (ringCount > 0 && peripheralRoiCount > 0) {
      if (usableRadius <= 0) {
        warnings.push("circle-too-small-for-nps-square-rois");
      }
      for (let ringIndex = 1; ringIndex <= ringCount; ringIndex += 1) {
        const radiusPx = usableRadius * (ringIndex / ringCount);
        const count = peripheralRoiCount;
        for (let angleIndex = 0; angleIndex < count; angleIndex += 1) {
          const angleRadians = (2 * Math.PI * angleIndex) / count;
          addRoi(
            circle.centerXImg + Math.cos(angleRadians) * radiusPx,
            circle.centerYImg + Math.sin(angleRadians) * radiusPx,
            ringIndex,
            angleIndex,
            angleRadians,
            radiusPx
          );
        }
      }
    }
    for (let first = 0; first < rois.length; first += 1) {
      for (let second = first + 1; second < rois.length; second += 1) {
        if (rectanglesOverlap(rois[first], rois[second])) {
          warnings.push("nps-roi-overlap");
          first = rois.length;
          break;
        }
      }
    }
    const chord = peripheralRoiCount > 1 ? 2 * usableRadius * Math.sin(Math.PI / peripheralRoiCount) : Number.POSITIVE_INFINITY;
    if (ringCount > 0 && peripheralRoiCount > 1 && chord < edgeForNps) {
      warnings.push("peripheral-roi-spacing-less-than-square-edge");
    }
    return {
      circleId: circle.id,
      edgePx: edgeForNps,
      usableRadiusPx: usableRadius,
      rois,
      warnings: Array.from(new Set(warnings)),
      nextSequence: sequence,
    };
  }

  function validateNpsRois(circle, rois, volume) {
    const warnings = [];
    (rois || []).forEach((roi) => {
      const geometry = resolveSquareGeometry(roi, volume);
      if (!geometry || geometry.touchesBoundary) {
        warnings.push(`${roi.label}:boundary`);
      }
      const halfDiagonal = (Math.max(1, roi.edgePx) * Math.SQRT2) / 2;
      const distance = Math.hypot(roi.centerXImg - circle.centerXImg, roi.centerYImg - circle.centerYImg);
      if (distance + halfDiagonal > circle.radiusPx + 1e-6) {
        warnings.push(`${roi.label}:outside-circle`);
      }
    });
    for (let first = 0; first < rois.length; first += 1) {
      for (let second = first + 1; second < rois.length; second += 1) {
        if (rectanglesOverlap(rois[first], rois[second])) {
          warnings.push("nps-roi-overlap");
        }
      }
    }
    return Array.from(new Set(warnings));
  }

  function buildNpsAnalysisForCircle(volume, circle, rois, circles = null) {
    const circleSet = circlesForNpsAnalysis(circle, circles);
    const circleIds = new Set(circleSet.map((entry) => entry.id));
    const circleRois = (rois || []).filter((roi) => circleIds.has(roi.parentCircleId) && roi.type === NPS_ROI_TYPE);
    const extracts = circleRois.map((roi) => ({ roi, extraction: extractSquareRoiPixels(volume, roi.sliceIndex, roi) }));
    const matrices = [];
    const rejected = [];
    extracts.forEach((entry) => {
      const extraction = entry.extraction;
      const geometry = extraction.geometry;
      if (extraction.error) {
        rejected.push({ roiId: entry.roi.id, reason: extraction.error });
        return;
      }
      if (
        geometry.selectedRowCount !== geometry.selectedColumnCount ||
        geometry.selectedRowCount !== Math.round(entry.roi.edgePx || geometry.selectedRowCount) ||
        geometry.touchesBoundary
      ) {
        rejected.push({ roiId: entry.roi.id, reason: "ROI is clipped or not a complete square matrix." });
        return;
      }
      if (!isPowerOfTwo(geometry.selectedRowCount)) {
        rejected.push({ roiId: entry.roi.id, reason: "NPS ROI edge is not a power of two." });
        return;
      }
      matrices.push(extraction.calibratedMatrix);
    });
    const spacing = spacingFromVolume(volume);
    const nps = buildNpsAnalysisFromMatrices(matrices, {
      spacingX: spacing.spacingX,
      spacingY: spacing.spacingY,
      units: extracts.find((entry) => !entry.extraction.error)?.extraction?.units || "HU",
      detrendPlane: Boolean(circle?.detrendPlane),
    });
    const layoutWarnings = [];
    circleSet.forEach((entry) => {
      const roisForCircle = circleRois.filter((roi) => roi.parentCircleId === entry.id);
      layoutWarnings.push(...validateNpsRois(entry, roisForCircle, volume));
    });
    if (circleSet.length > 1) {
      for (let first = 0; first < circleRois.length; first += 1) {
        for (let second = first + 1; second < circleRois.length; second += 1) {
          if (circleRois[first].parentCircleId !== circleRois[second].parentCircleId && rectanglesOverlap(circleRois[first], circleRois[second])) {
            layoutWarnings.push("pooled-nps-roi-overlap");
          }
        }
      }
      const edgeSizes = Array.from(new Set(circleSet.map((entry) => Math.round(Number(entry.roiEdgePx) || 0)).filter(Boolean)));
      if (edgeSizes.length > 1) {
        layoutWarnings.push("pooled-nps-roi-size-mismatch");
      }
      const detrendModes = Array.from(new Set(circleSet.map((entry) => Boolean(entry.detrendPlane))));
      if (detrendModes.length > 1) {
        layoutWarnings.push("pooled-nps-detrend-setting-mismatch");
      }
    }
    return {
      ...nps,
      circleId: circle?.id || "",
      circleIds: circleSet.map((entry) => entry.id),
      circleLabels: circleSet.map((entry) => entry.label),
      circleCount: circleSet.length,
      analysisSetId: circleAnalysisSetId(circle, circleSet),
      sourceRoiCount: circleRois.length,
      validRoiCount: matrices.length,
      rejectedRoiCount: rejected.length,
      rejectedRois: rejected,
      roiIds: extracts.map((entry) => entry.roi.id),
      roiWarnings: layoutWarnings,
      warnings: Array.from(new Set([...(nps.warnings || []), ...layoutWarnings])),
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
    const offset = subtractVectors(patientPoint, record.imagePositionPatient);
    return {
      xImg: dot(offset, record.rowDirection) / spacingX,
      yImg: dot(offset, record.columnDirection) / spacingY,
    };
  }

  function pixelCenterToPatient(record, xImg, yImg) {
    if (
      !record ||
      !Array.isArray(record.imagePositionPatient) ||
      record.imagePositionPatient.length < 3 ||
      !Array.isArray(record.rowDirection) ||
      !Array.isArray(record.columnDirection)
    ) {
      return null;
    }
    const spacingY = record.pixelSpacing?.[0];
    const spacingX = record.pixelSpacing?.[1];
    if (!Number.isFinite(spacingX) || !Number.isFinite(spacingY)) {
      return null;
    }
    return [
      record.imagePositionPatient[0] + record.rowDirection[0] * xImg * spacingX + record.columnDirection[0] * yImg * spacingY,
      record.imagePositionPatient[1] + record.rowDirection[1] * xImg * spacingX + record.columnDirection[1] * yImg * spacingY,
      record.imagePositionPatient[2] + record.rowDirection[2] * xImg * spacingX + record.columnDirection[2] * yImg * spacingY,
    ];
  }

  function slicePositionMm(record, normalVector) {
    const normal = normalVector || record?.normalVector;
    if (!record || !Array.isArray(record.imagePositionPatient) || !Array.isArray(normal)) {
      return null;
    }
    return dot(record.imagePositionPatient, normal);
  }

  function findNearestSliceIndexForPatientPoint(volume, patientPoint, fallbackIndex = 0) {
    const fallback = clamp(Math.round(Number(fallbackIndex) || 0), 0, Math.max(0, (volume?.depth || 1) - 1));
    const normal =
      (Array.isArray(volume?.normalDirection) && volume.normalDirection) ||
      volume?.slices?.find((slice) => Array.isArray(slice?.record?.normalVector))?.record?.normalVector ||
      null;
    if (!normal || !Array.isArray(patientPoint)) {
      return { index: fallback, distanceMm: null, method: "fallback" };
    }
    const target = dot(patientPoint, normal);
    let bestIndex = fallback;
    let bestDistance = Number.POSITIVE_INFINITY;
    (volume?.slices || []).forEach((slice, index) => {
      const position = slicePositionMm(slice.record, normal);
      if (!Number.isFinite(position)) {
        return;
      }
      const distance = Math.abs(position - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return {
      index: bestIndex,
      distanceMm: Number.isFinite(bestDistance) ? bestDistance : null,
      method: Number.isFinite(bestDistance) ? "patient-space" : "fallback",
    };
  }

  function mapSquareRoiToTarget(sourceRoi, sourceDataset, targetDataset, options = {}) {
    const sourceVolume = sourceDataset?.volume;
    const targetVolume = targetDataset?.volume;
    const sourceRecord = sourceVolume?.slices?.[sourceRoi.sliceIndex]?.record || sourceDataset?.meta;
    const patientPoint = pixelCenterToPatient(sourceRecord, sourceRoi.centerXImg, sourceRoi.centerYImg);
    const sliceMatch = findNearestSliceIndexForPatientPoint(targetVolume, patientPoint, sourceRoi.sliceIndex);
    const targetRecord = targetVolume?.slices?.[sliceMatch.index]?.record || targetDataset?.meta;
    const targetCoord = patientPointToImageCoord(targetRecord, patientPoint);
    const sourceSpacing = spacingFromVolume(sourceVolume);
    const targetSpacing = spacingFromVolume(targetVolume);
    const warnings = [];
    let edgePx = sourceRoi.edgePx;
    if (
      Number.isFinite(sourceSpacing.spacingX) &&
      Number.isFinite(sourceSpacing.spacingY) &&
      Number.isFinite(targetSpacing.spacingX) &&
      Number.isFinite(targetSpacing.spacingY)
    ) {
      const sourceAverage = (sourceSpacing.spacingX + sourceSpacing.spacingY) / 2;
      const targetAverage = (targetSpacing.spacingX + targetSpacing.spacingY) / 2;
      edgePx = Math.max(1, Math.round((sourceRoi.edgePx * sourceAverage) / targetAverage));
      if (
        Math.abs(sourceSpacing.spacingX - sourceSpacing.spacingY) > 1e-6 ||
        Math.abs(targetSpacing.spacingX - targetSpacing.spacingY) > 1e-6
      ) {
        warnings.push("anisotropic-spacing-size-mapping-uses-average-pixel-spacing");
      }
    } else {
      warnings.push("missing-pixel-spacing-size-copied-in-pixels");
    }
    if (!targetCoord) {
      warnings.push("patient-space-center-mapping-unavailable");
    }
    const mapped = createNoiseSquareRoi({
      ...sourceRoi,
      id: safeString(options.id) || sourceRoi.id,
      datasetId: targetDataset?.id || "",
      sliceIndex: sliceMatch.index,
      centerXImg: targetCoord?.xImg ?? sourceRoi.centerXImg,
      centerYImg: targetCoord?.yImg ?? sourceRoi.centerYImg,
      edgePx,
      parentCircleId: options.parentCircleId ?? sourceRoi.parentCircleId,
      type: sourceRoi.type,
      warnings: warnings.concat(sourceRoi.warnings || []),
    });
    mapped.copiedFromRoiId = sourceRoi.id;
    mapped.copiedFromDatasetId = sourceDataset?.id || "";
    mapped.copyMappingMethod = targetCoord ? "patient-space" : "image-space-fallback";
    mapped.copySliceMappingMethod = sliceMatch.method;
    mapped.copySliceDistanceMm = sliceMatch.distanceMm;
    mapped.copySizeMappingMethod = warnings.includes("missing-pixel-spacing-size-copied-in-pixels")
      ? "pixel-edge-fallback"
      : "physical-edge-preserving-average-spacing";
    return mapped;
  }

  function mapCircleToTarget(sourceCircle, sourceDataset, targetDataset, options = {}) {
    const sourceVolume = sourceDataset?.volume;
    const targetVolume = targetDataset?.volume;
    const sourceRecord = sourceVolume?.slices?.[sourceCircle.sliceIndex]?.record || sourceDataset?.meta;
    const patientPoint = pixelCenterToPatient(sourceRecord, sourceCircle.centerXImg, sourceCircle.centerYImg);
    const sliceMatch = findNearestSliceIndexForPatientPoint(targetVolume, patientPoint, sourceCircle.sliceIndex);
    const targetRecord = targetVolume?.slices?.[sliceMatch.index]?.record || targetDataset?.meta;
    const targetCoord = patientPointToImageCoord(targetRecord, patientPoint);
    const sourceSpacing = spacingFromVolume(sourceVolume);
    const targetSpacing = spacingFromVolume(targetVolume);
    const warnings = [];
    let radiusPx = sourceCircle.radiusPx;
    let roiEdgePx = sourceCircle.roiEdgePx;
    if (
      Number.isFinite(sourceSpacing.spacingX) &&
      Number.isFinite(sourceSpacing.spacingY) &&
      Number.isFinite(targetSpacing.spacingX) &&
      Number.isFinite(targetSpacing.spacingY)
    ) {
      const sourceAverage = (sourceSpacing.spacingX + sourceSpacing.spacingY) / 2;
      const targetAverage = (targetSpacing.spacingX + targetSpacing.spacingY) / 2;
      radiusPx = (sourceCircle.radiusPx * sourceAverage) / targetAverage;
      roiEdgePx = Math.max(2, Math.round((sourceCircle.roiEdgePx * sourceAverage) / targetAverage));
      if (
        Math.abs(sourceSpacing.spacingX - sourceSpacing.spacingY) > 1e-6 ||
        Math.abs(targetSpacing.spacingX - targetSpacing.spacingY) > 1e-6
      ) {
        warnings.push("anisotropic-spacing-circle-mapping-uses-average-pixel-spacing");
      }
    } else {
      warnings.push("missing-pixel-spacing-circle-copied-in-pixels");
    }
    if (!targetCoord) {
      warnings.push("patient-space-circle-center-mapping-unavailable");
    }
    const mapped = createNoisePowerCircle({
      ...sourceCircle,
      id: safeString(options.id) || sourceCircle.id,
      datasetId: targetDataset?.id || "",
      sliceIndex: sliceMatch.index,
      centerXImg: targetCoord?.xImg ?? sourceCircle.centerXImg,
      centerYImg: targetCoord?.yImg ?? sourceCircle.centerYImg,
      radiusPx,
      roiEdgePx,
      warnings: warnings.concat(sourceCircle.warnings || []),
    });
    mapped.copiedFromCircleId = sourceCircle.id;
    mapped.copiedFromDatasetId = sourceDataset?.id || "";
    mapped.copyMappingMethod = targetCoord ? "patient-space" : "image-space-fallback";
    mapped.copySliceMappingMethod = sliceMatch.method;
    mapped.copySliceDistanceMm = sliceMatch.distanceMm;
    return mapped;
  }

  function datasetLabel(dataset, index = 0) {
    return (
      safeString(dataset?.label) ||
      safeString(dataset?.meta?.seriesDescription) ||
      safeString(dataset?.meta?.protocolName) ||
      `Recon ${index + 1}`
    );
  }

  function datasetSeriesNumber(dataset) {
    const value = Number(dataset?.meta?.seriesNumber);
    if (Number.isFinite(value)) {
      return value;
    }
    return safeString(dataset?.meta?.seriesNumber);
  }

  function datasetExportFields(dataset, index = 0) {
    const label = datasetLabel(dataset, index);
    const kernelReference = kernelRho10Reference(dataset);
    const rhoMaxLpCm = datasetRhoMaxLpCm(dataset);
    const comparison = kernelSamplingComparison(rhoMaxLpCm, kernelReference);
    return {
      reconstruction: label,
      reconstruction_label: label,
      reconstruction_index: index + 1,
      series_number: datasetSeriesNumber(dataset),
      reconstruction_kernel: dataset?.meta?.convolutionKernel || "",
      kernel_reference: kernelReference?.kernel || "",
      kernel_rho50_reference_lp_cm: serializeNumber(kernelReference?.rho50LpCm),
      kernel_rho10_reference_lp_cm: serializeNumber(kernelReference?.rho10LpCm),
      kernel_rho02_reference_lp_cm: serializeNumber(kernelReference?.rho02LpCm),
      kernel_rho10_reference_source: kernelReference?.source || "",
      rho_max_lp_cm_from_spacing: serializeNumber(rhoMaxLpCm),
      rho_max_over_kernel_rho10_reference: serializeNumber(comparison.ratio),
      rho_max_kernel_sampling_status: comparison.status,
    };
  }

  function iterativeReconstructionHint(meta) {
    const text = [meta?.seriesDescription, meta?.protocolName, meta?.imageType, meta?.convolutionKernel]
      .filter(Boolean)
      .join(" ");
    const match = text.match(/\b(ASIR[-\s]?\w*|MBIR|VEO|ADMIRE\s*\d*|SAFIRE\s*\d*|IRIS|AIDR\s*3D|iDose\s*\d*|IMR|FIRST|DLIR\s*\w*)\b/i);
    return match ? match[0] : "";
  }

  function buildNoiseSquareSummaryRows(datasets, rois, context) {
    const datasetById = new Map((datasets || []).map((dataset, index) => [dataset.id, { dataset, index }]));
    return (rois || [])
      .filter((roi) => roi.type === ROI_TYPE)
      .flatMap((roi) => {
        const entry = datasetById.get(roi.datasetId);
        if (!entry?.dataset?.volume) {
          return [];
        }
        const extraction = extractSquareRoiPixels(entry.dataset.volume, roi.sliceIndex, roi);
        if (extraction.error) {
          return [];
        }
        const stats = extraction.statsCalibrated || {};
        const geometry = extraction.geometry || {};
        const ttf = extraction.ttfAnalysis || {};
        return [
          {
            research_study_id: context.researchStudyId,
            patient_study_id: context.patientStudyId,
            ...datasetExportFields(entry.dataset, entry.index),
            roi_id: roi.id,
            roi_label: roi.label,
            slice_index: roi.sliceIndex,
            mean_hu: serializeNumber(stats.mean),
            sd_hu: serializeNumber(stats.sd),
            variance_hu2: serializeNumber(stats.variance),
            min_hu: serializeNumber(stats.min),
            max_hu: serializeNumber(stats.max),
            median_hu: serializeNumber(stats.median),
            iqr_hu: serializeNumber(stats.iqr),
            skewness: serializeNumber(stats.skewness),
            kurtosis: serializeNumber(stats.kurtosis),
            pixel_count: serializeNumber(stats.count),
            area_mm2: serializeNumber(geometry.areaMm2),
            edge_px: serializeNumber(geometry.edgePx),
            edge_mm_x: serializeNumber(geometry.edgeMmX),
            edge_mm_y: serializeNumber(geometry.edgeMmY),
            center_x_img: serializeNumber(geometry.centerXImg),
            center_y_img: serializeNumber(geometry.centerYImg),
            pixel_spacing_x_mm: serializeNumber(geometry.spacingX),
            pixel_spacing_y_mm: serializeNumber(geometry.spacingY),
            horizontal_center_profile_sd: serializeNumber(extraction.profileAnalysis?.profilesByType?.["horizontal-center"]?.stats?.sd),
            vertical_center_profile_sd: serializeNumber(extraction.profileAnalysis?.profilesByType?.["vertical-center"]?.stats?.sd),
            residual_detrended_sd: serializeNumber(extraction.residualDetrendedSd),
            ttfxy_valid: ttf.valid ? "true" : "false",
            ttfxy_contrast_hu: serializeNumber(ttf.contrastHu),
            ttfxy_noise_hu: serializeNumber(ttf.noiseHu),
            ttfxy_cnr: serializeNumber(ttf.cnr),
            ttfxy_f50_mm_minus_1: serializeNumber(ttf.f50Frequency),
            ttfxy_f10_mm_minus_1: serializeNumber(ttf.f10Frequency),
            ttfxy_edge_angle_degrees: serializeNumber(ttf.edgeAngleDegrees),
            ttfxy_warnings: (ttf.warnings || []).join("|"),
            warnings: extraction.warnings.join("|"),
            units: extraction.units,
            analysis_timestamp: context.timestamp,
          },
        ];
      });
  }

  function buildProfileRows(datasets, rois, context) {
    const datasetById = new Map((datasets || []).map((dataset, index) => [dataset.id, { dataset, index }]));
    return (rois || [])
      .filter((roi) => roi.type === ROI_TYPE)
      .flatMap((roi) => {
        const entry = datasetById.get(roi.datasetId);
        if (!entry?.dataset?.volume) {
          return [];
        }
        const extraction = extractSquareRoiPixels(entry.dataset.volume, roi.sliceIndex, roi);
        const profiles = extraction.profileAnalysis?.profiles || [];
        return profiles
          .filter((profile) => profile.type === "horizontal-center" || profile.type === "vertical-center")
          .flatMap((profile) =>
            profile.samples.map((sample) => ({
              research_study_id: context.researchStudyId,
              patient_study_id: context.patientStudyId,
              ...datasetExportFields(entry.dataset, entry.index),
              roi_id: roi.id,
              roi_label: roi.label,
              profile_type: profile.type,
              axis: profile.axis,
              sample_index: sample.sampleIndex,
              distance_mm: serializeNumber(sample.distanceMm),
              value_hu: serializeNumber(sample.value),
              deviation_from_profile_mean_hu: serializeNumber(sample.deviationFromProfileMean),
              units: profile.units,
            }))
          );
      });
  }

  function buildTtfCurveRows(datasets, rois, context) {
    const datasetById = new Map((datasets || []).map((dataset, index) => [dataset.id, { dataset, index }]));
    return (rois || [])
      .filter((roi) => roi.type === ROI_TYPE)
      .flatMap((roi) => {
        const entry = datasetById.get(roi.datasetId);
        if (!entry?.dataset?.volume) {
          return [];
        }
        const extraction = extractSquareRoiPixels(entry.dataset.volume, roi.sliceIndex, roi);
        const ttf = extraction.ttfAnalysis;
        if (!ttf?.valid) {
          return [];
        }
        const base = {
          research_study_id: context.researchStudyId,
          patient_study_id: context.patientStudyId,
          ...datasetExportFields(entry.dataset, entry.index),
          roi_id: roi.id,
          roi_label: roi.label,
          method: ttf.method,
        };
        const esfRows = (ttf.esf || []).map((point, index) => ({
          ...base,
          curve_type: "normalized_esf",
          sample_index: index,
          x: serializeNumber(point.distanceMm),
          x_units: "mm_from_edge",
          y: serializeNumber(point.normalizedValue),
          y_units: "normalized_esf",
          count: point.count,
        }));
        const lsfRows = (ttf.lsf || []).map((point, index) => ({
          ...base,
          curve_type: "lsf",
          sample_index: index,
          x: serializeNumber(point.distanceMm),
          x_units: "mm_from_edge",
          y: serializeNumber(point.value),
          y_units: "normalized_esf_per_mm",
          count: "",
        }));
        const ttfRows = (ttf.ttf || []).map((point, index) => ({
          ...base,
          curve_type: "ttfxy",
          sample_index: index,
          x: serializeNumber(point.frequencyMmMinus1),
          x_units: "mm_minus_1",
          y: serializeNumber(point.ttf),
          y_units: "normalized_ttf",
          count: "",
        }));
        return esfRows.concat(lsfRows, ttfRows);
      });
  }

  function buildTtfMetricsRows(datasets, rois, context) {
    const datasetById = new Map((datasets || []).map((dataset, index) => [dataset.id, { dataset, index }]));
    return (rois || [])
      .filter((roi) => roi.type === ROI_TYPE)
      .flatMap((roi) => {
        const entry = datasetById.get(roi.datasetId);
        if (!entry?.dataset?.volume) {
          return [];
        }
        const extraction = extractSquareRoiPixels(entry.dataset.volume, roi.sliceIndex, roi);
        const ttf = extraction.ttfAnalysis || {};
        return [
          {
            research_study_id: context.researchStudyId,
            patient_study_id: context.patientStudyId,
            ...datasetExportFields(entry.dataset, entry.index),
            roi_id: roi.id,
            roi_label: roi.label,
            valid: ttf.valid ? "true" : "false",
            method: ttf.method || "",
            contrast_hu: serializeNumber(ttf.contrastHu),
            noise_hu: serializeNumber(ttf.noiseHu),
            cnr: serializeNumber(ttf.cnr),
            f50_mm_minus_1: serializeNumber(ttf.f50Frequency),
            f10_mm_minus_1: serializeNumber(ttf.f10Frequency),
            rho50_lp_cm: serializeNumber(ttf.rho50LpCm),
            rho10_lp_cm: serializeNumber(ttf.rho10LpCm),
            rho_max_lp_cm: serializeNumber(ttf.rhoMaxLpCm),
            rho_max_over_rho10: serializeNumber(ttf.rhoMaxOverRho10),
            rho_max_adequate: ttf.rhoMaxAdequate == null ? "" : ttf.rhoMaxAdequate ? "true" : "false",
            edge_angle_degrees: serializeNumber(ttf.edgeAngleDegrees),
            bin_width_mm: serializeNumber(ttf.binWidthMm),
            nyquist_frequency_mm_minus_1: serializeNumber(ttf.nyquistFrequency),
            warnings_count: ttf.warnings?.length || 0,
            warnings: (ttf.warnings || []).join("|"),
            error: ttf.error || "",
          },
        ];
      });
  }

  function buildNpsRoiSummaryRows(datasets, rois, context) {
    const datasetById = new Map((datasets || []).map((dataset, index) => [dataset.id, { dataset, index }]));
    return (rois || [])
      .filter((roi) => roi.type === NPS_ROI_TYPE)
      .flatMap((roi) => {
        const entry = datasetById.get(roi.datasetId);
        if (!entry?.dataset?.volume) {
          return [];
        }
        const extraction = extractSquareRoiPixels(entry.dataset.volume, roi.sliceIndex, roi);
        if (extraction.error) {
          return [];
        }
        const stats = extraction.statsCalibrated || {};
        return [
          {
            research_study_id: context.researchStudyId,
            patient_study_id: context.patientStudyId,
            ...datasetExportFields(entry.dataset, entry.index),
            circle_id: roi.parentCircleId,
            nps_roi_id: roi.id,
            nps_roi_label: roi.label,
            ring_index: roi.ringIndex,
            angle_index: roi.angleIndex,
            center_x_img: serializeNumber(roi.centerXImg),
            center_y_img: serializeNumber(roi.centerYImg),
            edge_px: serializeNumber(roi.edgePx),
            area_mm2: serializeNumber(extraction.geometry?.areaMm2),
            mean_hu: serializeNumber(stats.mean),
            sd_hu: serializeNumber(stats.sd),
            variance_hu2: serializeNumber(stats.variance),
            warnings: extraction.warnings.join("|"),
            units: extraction.units,
          },
        ];
      });
  }

  function buildNpsModels(datasets, circles, rois) {
    const datasetById = new Map((datasets || []).map((dataset, index) => [dataset.id, { dataset, index }]));
    const groups = new Map();
    const circlesWithGeneratedRois = new Set((rois || []).filter((roi) => roi.type === NPS_ROI_TYPE).map((roi) => roi.parentCircleId));
    (circles || []).filter((circle) => circle.generated || circlesWithGeneratedRois.has(circle.id)).forEach((circle, circleIndex) => {
      const entry = datasetById.get(circle.datasetId);
      if (!entry?.dataset?.volume) {
        return;
      }
      const setId = circleAnalysisSetId(circle, circles);
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
        group.circles.find((circle) => circle.id === group.setId || circleAnalysisSetId(circle, circles) === circle.id) ||
        group.circles[0];
      const analysis = buildNpsAnalysisForCircle(group.dataset.volume, representative, rois, group.circles);
      if (analysis.error || !analysis.validRoiCount) {
        return [];
      }
      return [{ circle: representative, circles: group.circles, analysis, dataset: group.dataset, datasetIndex: group.datasetIndex }];
    });
  }

  function buildNpsCurveRows(models, context) {
    return (models || []).flatMap((model) =>
      (model.analysis.radialBins || []).map((bin) => ({
        research_study_id: context.researchStudyId,
        patient_study_id: context.patientStudyId,
        ...datasetExportFields(model.dataset, model.datasetIndex),
        circle_id: model.circle.id,
        analysis_set_id: model.analysis.analysisSetId,
        circle_ids: (model.analysis.circleIds || [model.circle.id]).join("|"),
        frequency_mm_minus_1: serializeNumber(bin.frequencyCenter),
        nps: serializeNumber(bin.nps),
        normalized_nps: serializeNumber(bin.normalizedNps),
        cumulative_noise_power: serializeNumber(bin.cumulativeNoisePower),
        cumulative_fraction: serializeNumber(bin.cumulativeFraction),
        nps_units: model.analysis.npsUnits,
      }))
    );
  }

  function buildNpsMetricsRows(models, context) {
    return (models || []).map((model) => ({
      research_study_id: context.researchStudyId,
      patient_study_id: context.patientStudyId,
      ...datasetExportFields(model.dataset, model.datasetIndex),
      circle_id: model.circle.id,
      circle_label: model.circle.label,
      analysis_set_id: model.analysis.analysisSetId,
      circle_ids: (model.analysis.circleIds || [model.circle.id]).join("|"),
      circle_count: serializeNumber(model.analysis.circleCount || 1),
      sd_hu: serializeNumber(Math.sqrt(model.analysis.meanRoiVariance)),
      variance_hu2: serializeNumber(model.analysis.meanRoiVariance),
      integrated_nps: serializeNumber(model.analysis.integratedNps),
      radial_integrated_nps: serializeNumber(model.analysis.radialIntegratedNps),
      variance_closure_ratio: serializeNumber(model.analysis.varianceClosureRatio),
      nyquist_frequency_mm_minus_1: serializeNumber(model.analysis.nyquistFrequency),
      rho_max_lp_cm: serializeNumber(model.analysis.rhoMaxLpCm),
      peak_frequency_mm_minus_1: serializeNumber(model.analysis.peakFrequency),
      average_frequency_mm_minus_1: serializeNumber(model.analysis.averageFrequency),
      f10_tail_mm_minus_1: serializeNumber(model.analysis.f10TailFrequency),
      f10_cumulative_mm_minus_1: serializeNumber(model.analysis.f10Frequency),
      f50_cumulative_mm_minus_1: serializeNumber(model.analysis.f50Frequency),
      f90_cumulative_mm_minus_1: serializeNumber(model.analysis.f90Frequency),
      low_frequency_noise_fraction: serializeNumber(model.analysis.lowFrequencyPowerFraction),
      mid_frequency_noise_fraction: serializeNumber(model.analysis.midFrequencyPowerFraction),
      high_frequency_noise_fraction: serializeNumber(model.analysis.highFrequencyPowerFraction),
      normalized_nps_peak_frequency_mm_minus_1: serializeNumber(model.analysis.normalizedPeakFrequency),
      cumulative_power_at_0_25_mm_minus_1: serializeNumber(model.analysis.cumulativePowerAt025),
      cumulative_power_at_0_50_mm_minus_1: serializeNumber(model.analysis.cumulativePowerAt050),
      roi_count_used: serializeNumber(model.analysis.validRoiCount),
      roi_count_total: serializeNumber(model.analysis.sourceRoiCount),
      roi_size_px: serializeNumber(model.analysis.edgePx),
      roi_size_mm_x: serializeNumber(model.analysis.edgePx * model.analysis.spacingX),
      roi_size_mm_y: serializeNumber(model.analysis.edgePx * model.analysis.spacingY),
      warnings_count: model.analysis.warnings?.length || 0,
      warnings: (model.analysis.warnings || []).join("|"),
      nps_units: model.analysis.npsUnits,
    }));
  }

  function buildNps2dPayload(models, context) {
    return {
      app_name: APP_NAME,
      app_version: APP_VERSION,
      export_version: EXPORT_VERSION,
      export_timestamp: context.timestamp,
      nps_matrices: (models || []).map((model) => ({
        ...datasetExportFields(model.dataset, model.datasetIndex),
        circle_id: model.circle.id,
        circle_label: model.circle.label,
        analysis_set_id: model.analysis.analysisSetId,
        circle_ids: model.analysis.circleIds || [model.circle.id],
        circle_count: model.analysis.circleCount || 1,
        roi_ids: model.analysis.roiIds,
        edge_px: model.analysis.edgePx,
        spacing_x_mm: model.analysis.spacingX,
        spacing_y_mm: model.analysis.spacingY,
        frequency_step_x_mm_minus_1: model.analysis.frequencyStepX,
        frequency_step_y_mm_minus_1: model.analysis.frequencyStepY,
        units: model.analysis.units,
        nps_units: model.analysis.npsUnits,
        method: model.analysis.method,
        formula: model.analysis.formula,
        detrend_plane: Boolean(model.circle.detrendPlane),
        metrics: {
          sd_hu: Number.isFinite(model.analysis.meanRoiVariance) ? Math.sqrt(model.analysis.meanRoiVariance) : null,
          variance_hu2: model.analysis.meanRoiVariance,
          integrated_nps: model.analysis.integratedNps,
          nyquist_frequency_mm_minus_1: model.analysis.nyquistFrequency,
          rho_max_lp_cm: model.analysis.rhoMaxLpCm,
          peak_frequency_mm_minus_1: model.analysis.peakFrequency,
          average_frequency_mm_minus_1: model.analysis.averageFrequency,
          f10_tail_mm_minus_1: model.analysis.f10TailFrequency,
          f10_cumulative_mm_minus_1: model.analysis.f10Frequency,
          f50_cumulative_mm_minus_1: model.analysis.f50Frequency,
          f90_cumulative_mm_minus_1: model.analysis.f90Frequency,
        },
        nps_2d: model.analysis.nps2d,
        normalized_nps_2d: model.analysis.normalizedNps2d,
        radial_bins: model.analysis.radialBins,
      })),
    };
  }

  function buildAnalysisMetadata(datasets, rois, circles, context) {
    return {
      app_name: APP_NAME,
      app_version: APP_VERSION,
      export_version: EXPORT_VERSION,
      export_timestamp: context.timestamp,
      research_study_id: context.researchStudyId,
      patient_study_id: context.patientStudyId,
      units: "CT calibrated values are rescaled from stored pixels using Rescale Slope and Intercept and are expected to be HU for CT.",
      formulas: {
        square_roi_variance: "Population variance across calibrated source pixels inside the ROI.",
        nps_2d:
          "NPS_2D(fx,fy) = dx * dy / (Nx * Ny) * average(|FFT2(ROI - mean_ROI)|^2). The average is across valid square NPS ROIs.",
        normalized_nps: "normalized_nps = nps / integrated_nps.",
        cumulative_noise_power: "Cumulative sum of radially binned integrated NPS power versus spatial frequency.",
        average_frequency: "Spectral centroid of radial integrated NPS power.",
        rho_max:
          "rhoMax is the maximum displayable in-plane spatial frequency from Nyquist. It equals 1/(2*pixel spacing) in lp/mm, or 10/(2*pixel spacing_mm) in lp/cm.",
        rho10:
          "rho10 is the TTF/MTF 10% frequency. In this app it is measured only from a valid TTF Square ROI and reported as TTF f10 converted from mm^-1 to lp/cm.",
        kernel_rho10_reference:
          "kernel_rho50_reference_lp_cm, kernel_rho10_reference_lp_cm, and kernel_rho02_reference_lp_cm are literature references for supported Siemens Bv kernels, not values measured from a homogeneous water phantom. The rho10 reference is used only to compare sampling rhoMax against a known kernel MTF 10% frequency.",
        f10_tail:
          "f10 tail is the post-peak radial spatial frequency where the absolute radial NPS curve falls to 10% of its peak value.",
        f10_f50_f90_cumulative:
          "f10, f50, and f90 cumulative NPS are radial spatial frequencies where cumulative integrated NPS reaches 10%, 50%, and 90% of total noise power.",
        ttfxy: "TTFxy(f) = |FFT(dESF/dx)| / |FFT(dESF/dx)[0]|. ESF is estimated from square ROI pixels binned by signed distance from the dominant in-plane edge.",
      },
      warning_definitions: {
        boundary: "ROI touches the source image boundary or was clipped.",
        small_roi: `ROI contains fewer than ${MINIMUM_RECOMMENDED_PIXEL_COUNT} pixels.`,
        edge_or_gradient: "A fitted plane changes across the ROI by more than max(10 HU, 2 * ROI SD).",
        trend_dominated: "Plane detrending removes more than half of total ROI SD, suggesting gradient rather than random noise.",
        anisotropic_pixel_spacing: "Pixel spacing differs between row and column directions; radial NPS uses physical frequency axes and min Nyquist cutoff.",
        ttf_no_edge_detected: "Square ROI did not contain a sufficient monotonic edge or contrast transition for TTFxy.",
        ttf_low_cnr_tg233: "TTFxy CNR is below the TG-233 recommended total CNR threshold of 15; interpret f50/f10 cautiously.",
      },
      datasets: (datasets || []).map((dataset, index) => {
        const meta = dataset?.meta || {};
        const exportFields = datasetExportFields(dataset, index);
        return {
          ...exportFields,
          dataset_id: dataset?.id || "",
          study_instance_uid: meta.studyInstanceUID || "",
          series_instance_uid: meta.seriesInstanceUID || "",
          series_description: meta.seriesDescription || "",
          protocol_name: meta.protocolName || "",
          image_type: meta.imageType || "",
          manufacturer: meta.manufacturer || "",
          manufacturer_model_name: meta.manufacturerModelName || "",
          station_name: meta.stationName || "",
          software_versions: meta.softwareVersions || "",
          reconstruction_kernel: meta.convolutionKernel || "",
          iterative_reconstruction_hint: meta.iterativeReconstruction || iterativeReconstructionHint(meta),
          kvp: meta.kvp ?? null,
          tube_current_ma: meta.tubeCurrent ?? null,
          exposure_time_ms: meta.exposureTime ?? null,
          ctdivol_mgy: meta.ctdiVol ?? null,
          rows: dataset?.volume?.rows ?? meta.rows ?? null,
          columns: dataset?.volume?.columns ?? meta.columns ?? null,
          depth: dataset?.volume?.depth ?? null,
          pixel_spacing_x_mm: dataset?.volume?.columnSpacing ?? meta.pixelSpacing?.[1] ?? null,
          pixel_spacing_y_mm: dataset?.volume?.rowSpacing ?? meta.pixelSpacing?.[0] ?? null,
          slice_thickness_mm: meta.sliceThickness ?? null,
          slice_spacing_mm: dataset?.volume?.sliceSpacing ?? null,
          rescale_slope: meta.rescaleSlope ?? null,
          rescale_intercept: meta.rescaleIntercept ?? null,
          rescale_type: meta.rescaleType || "",
        };
      }),
      roi_count: (rois || []).length,
      circle_count: (circles || []).length,
      assumptions: [
        "Measurements use source DICOM pixel matrices, not rendered screen pixels.",
        "Copy-to-reconstruction mapping preserves patient-space center and physical size when DICOM geometry and Pixel Spacing are available.",
        "NPS is 2D single-slice local NPS from square ROIs organized by one or more linked placement circles in the same analysis set.",
        "TTFxy is only valid when the square ROI spans a material edge or circular insert boundary; homogeneous noise ROIs are reported as invalid for TTF.",
        "Kernel rho10 reference values are literature lookups for supported Siemens Bv kernels and are not inferred from NPS.",
      ],
      kernel_rho10_reference_table: KERNEL_RHO10_REFERENCES,
    };
  }

  function buildReadmeText() {
    return `${APP_NAME} Export Bundle

Files
- noise_power_data.xls: Excel workbook containing all tabular outputs in separate sheets:
  - Square ROI Summary: one row per TTF Square ROI per reconstruction.
  - Square ROI Profiles: long-format horizontal and vertical center-profile samples.
  - TTF Metrics: one row per square ROI with in-plane TTFxy validity, contrast, CNR, f50, and f10.
  - TTF Curves: long-format normalized ESF, LSF, and TTFxy curve samples derived from square ROIs that contain a usable edge.
  - NPS ROI Summary: one row per generated square NPS ROI per reconstruction.
  - NPS Curve 1D: long-format radial NPS curve with frequency, absolute NPS, normalized NPS, and cumulative noise power.
  - NPS Metrics: one row per reconstruction and NPS circle or pooled circle set with noise magnitude and texture metrics.
- nps_2d_matrix.json: 2D absolute and normalized NPS matrices plus metadata needed to reproduce radial curves.
- analysis_metadata.json: DICOM metadata, app version, export timestamp, units, formulas, and warning definitions.
- PNG figures: all-reconstructions ROI/metric overview panel, source overlay, ROI profile, ROI histogram, per-reconstruction 2D NPS heatmaps, absolute/normalized/cumulative comparison curves, and combined panel.

Reconstruction identifiers
Workbook sheets and JSON matrices include reconstruction, reconstruction_label, reconstruction_index, and DICOM series_number. PNG and ZIP names include DICOM series numbers when available.

NPS method
For each generated square NPS ROI, calibrated HU values are extracted from the source image. One NPS analysis set may contain square ROIs from one or more linked Noise Power circles; linked circles are pooled before averaging the 2D NPS. The ROI mean is subtracted by default. Optional plane detrending subtracts a fitted 2D plane before the FFT. The app computes an unnormalized 2D DFT and scales power as:
NPS_2D(fx,fy) = dx * dy / (Nx * Ny) * average(|FFT2(ROI - mean_ROI)|^2).

Units
Frequency is cycles/mm. Absolute NPS is HU^2 mm^2 when DICOM CT calibration is HU. Normalized NPS is absolute NPS divided by integrated NPS. fav/fA is the spectral centroid of radial integrated NPS power. fpeak/fP is the frequency at maximum radial NPS. f10 tail is the post-peak frequency where absolute radial NPS falls to 10% of peak NPS. f10, f50, and f90 cumulative NPS are the radial frequencies where cumulative integrated NPS reaches 10%, 50%, and 90% of total noise power. rhoMax is the Nyquist display limit in lp/cm derived from pixel spacing/FOV and matrix size.

Resolution / TTF method
rho10 is a resolution metric, not an NPS texture metric. The paper defines rho10 as the spatial frequency where MTF falls to 10% of its zero-frequency value. HAGRad Noise Power reports the analogous measured TTFxy f10 from a valid TTF Square ROI and converts it to rho10 in lp/cm. rhoMax/rho10 is reported when both values are available; values below 1 indicate that sampling/FOV/matrix may not display the measured 10% TTF frequency.

Kernel MTF references
For supported Siemens Bv kernels, the app also reports kernel_rho50_reference_lp_cm, kernel_rho10_reference_lp_cm, and kernel_rho02_reference_lp_cm where literature tables provide them. These are not measured from the water phantom NPS. The rho10 lookup supports the paper-style check rhoMax versus the kernel's reference MTF 10% frequency. Unknown kernels remain blank and are exported with no-kernel-rho10-reference or unknown-kernel status.

TTFxy method
TTFxy is an in-plane edge-response analysis. The square ROI is treated as an edge organizer only when it spans a circular insert or material transition. The app estimates the dominant edge normal, bins calibrated HU values by signed distance from the edge to form an ESF, differentiates to an LSF, applies a Hann window, and computes normalized |FFT(LSF)|. Homogeneous noise ROIs are marked invalid for TTFxy.

Limitations
This is a local 2D axial CT phantom noise workflow. Homogeneity and edge warnings are screening checks, not a substitute for visual review. Copied geometry should be verified when reconstructions differ in matrix, Pixel Spacing, slice positions, or frame of reference.
`;
  }

  function makeTextFile(name, content, mimeType = "text/plain") {
    return { name, mimeType, content };
  }

  function buildMandatoryExportFiles(datasets, rois, circles, options = {}) {
    const context = {
      timestamp: options.timestamp || new Date().toISOString(),
      researchStudyId: safeString(options.researchStudyId) || "",
      patientStudyId: safeString(options.patientStudyId) || "",
    };
    const npsModels = buildNpsModels(datasets, circles, rois);
    const squareRows = buildNoiseSquareSummaryRows(datasets, rois, context);
    const profileRows = buildProfileRows(datasets, rois, context);
    const ttfCurveRows = buildTtfCurveRows(datasets, rois, context);
    const ttfMetricsRows = buildTtfMetricsRows(datasets, rois, context);
    const npsRoiRows = buildNpsRoiSummaryRows(datasets, rois, context);
    const npsCurveRows = buildNpsCurveRows(npsModels, context);
    const npsMetricsRows = buildNpsMetricsRows(npsModels, context);
    const squareColumns = [
      "research_study_id",
      "patient_study_id",
      "reconstruction",
      "reconstruction_label",
      "reconstruction_index",
      "series_number",
      "reconstruction_kernel",
      "kernel_reference",
      "kernel_rho50_reference_lp_cm",
      "kernel_rho10_reference_lp_cm",
      "kernel_rho02_reference_lp_cm",
      "kernel_rho10_reference_source",
      "rho_max_lp_cm_from_spacing",
      "rho_max_over_kernel_rho10_reference",
      "rho_max_kernel_sampling_status",
      "roi_id",
      "roi_label",
      "slice_index",
      "mean_hu",
      "sd_hu",
      "variance_hu2",
      "min_hu",
      "max_hu",
      "median_hu",
      "iqr_hu",
      "skewness",
      "kurtosis",
      "pixel_count",
      "area_mm2",
      "edge_px",
      "edge_mm_x",
      "edge_mm_y",
      "center_x_img",
      "center_y_img",
      "pixel_spacing_x_mm",
      "pixel_spacing_y_mm",
      "horizontal_center_profile_sd",
      "vertical_center_profile_sd",
      "residual_detrended_sd",
      "ttfxy_valid",
      "ttfxy_contrast_hu",
      "ttfxy_noise_hu",
      "ttfxy_cnr",
      "ttfxy_f50_mm_minus_1",
      "ttfxy_f10_mm_minus_1",
      "ttfxy_edge_angle_degrees",
      "ttfxy_warnings",
      "warnings",
      "units",
      "analysis_timestamp",
    ];
    const profileColumns = [
      "research_study_id",
      "patient_study_id",
      "reconstruction",
      "reconstruction_label",
      "reconstruction_index",
      "series_number",
      "roi_id",
      "roi_label",
      "profile_type",
      "axis",
      "sample_index",
      "distance_mm",
      "value_hu",
      "deviation_from_profile_mean_hu",
      "units",
    ];
    const ttfMetricColumns = [
      "research_study_id",
      "patient_study_id",
      "reconstruction",
      "reconstruction_label",
      "reconstruction_index",
      "series_number",
      "reconstruction_kernel",
      "kernel_reference",
      "kernel_rho50_reference_lp_cm",
      "kernel_rho10_reference_lp_cm",
      "kernel_rho02_reference_lp_cm",
      "kernel_rho10_reference_source",
      "rho_max_lp_cm_from_spacing",
      "rho_max_over_kernel_rho10_reference",
      "rho_max_kernel_sampling_status",
      "roi_id",
      "roi_label",
      "valid",
      "method",
      "contrast_hu",
      "noise_hu",
      "cnr",
      "f50_mm_minus_1",
      "f10_mm_minus_1",
      "rho50_lp_cm",
      "rho10_lp_cm",
      "rho_max_lp_cm",
      "rho_max_over_rho10",
      "rho_max_adequate",
      "edge_angle_degrees",
      "bin_width_mm",
      "nyquist_frequency_mm_minus_1",
      "warnings_count",
      "warnings",
      "error",
    ];
    const ttfCurveColumns = [
      "research_study_id",
      "patient_study_id",
      "reconstruction",
      "reconstruction_label",
      "reconstruction_index",
      "series_number",
      "roi_id",
      "roi_label",
      "method",
      "curve_type",
      "sample_index",
      "x",
      "x_units",
      "y",
      "y_units",
      "count",
    ];
    const npsRoiColumns = [
      "research_study_id",
      "patient_study_id",
      "reconstruction",
      "reconstruction_label",
      "reconstruction_index",
      "series_number",
      "circle_id",
      "nps_roi_id",
      "nps_roi_label",
      "ring_index",
      "angle_index",
      "center_x_img",
      "center_y_img",
      "edge_px",
      "area_mm2",
      "mean_hu",
      "sd_hu",
      "variance_hu2",
      "warnings",
      "units",
    ];
    const npsCurveColumns = [
      "research_study_id",
      "patient_study_id",
      "reconstruction",
      "reconstruction_label",
      "reconstruction_index",
      "series_number",
      "circle_id",
      "analysis_set_id",
      "circle_ids",
      "frequency_mm_minus_1",
      "nps",
      "normalized_nps",
      "cumulative_noise_power",
      "cumulative_fraction",
      "nps_units",
    ];
    const npsMetricColumns = [
      "research_study_id",
      "patient_study_id",
      "reconstruction",
      "reconstruction_label",
      "reconstruction_index",
      "series_number",
      "reconstruction_kernel",
      "kernel_reference",
      "kernel_rho50_reference_lp_cm",
      "kernel_rho10_reference_lp_cm",
      "kernel_rho02_reference_lp_cm",
      "kernel_rho10_reference_source",
      "rho_max_lp_cm_from_spacing",
      "rho_max_over_kernel_rho10_reference",
      "rho_max_kernel_sampling_status",
      "circle_id",
      "circle_label",
      "analysis_set_id",
      "circle_ids",
      "circle_count",
      "sd_hu",
      "variance_hu2",
      "integrated_nps",
      "radial_integrated_nps",
      "variance_closure_ratio",
      "nyquist_frequency_mm_minus_1",
      "rho_max_lp_cm",
      "peak_frequency_mm_minus_1",
      "average_frequency_mm_minus_1",
      "f10_tail_mm_minus_1",
      "f10_cumulative_mm_minus_1",
      "f50_cumulative_mm_minus_1",
      "f90_cumulative_mm_minus_1",
      "low_frequency_noise_fraction",
      "mid_frequency_noise_fraction",
      "high_frequency_noise_fraction",
      "normalized_nps_peak_frequency_mm_minus_1",
      "cumulative_power_at_0_25_mm_minus_1",
      "cumulative_power_at_0_50_mm_minus_1",
      "roi_count_used",
      "roi_count_total",
      "roi_size_px",
      "roi_size_mm_x",
      "roi_size_mm_y",
      "warnings_count",
      "warnings",
      "nps_units",
    ];
    const workbookSheets = [
      { name: "Square ROI Summary", rows: rowsToWorkbookRows(squareColumns, squareRows) },
      { name: "Square ROI Profiles", rows: rowsToWorkbookRows(profileColumns, profileRows) },
      { name: "TTF Metrics", rows: rowsToWorkbookRows(ttfMetricColumns, ttfMetricsRows) },
      { name: "TTF Curves", rows: rowsToWorkbookRows(ttfCurveColumns, ttfCurveRows) },
      { name: "NPS ROI Summary", rows: rowsToWorkbookRows(npsRoiColumns, npsRoiRows) },
      { name: "NPS Curve 1D", rows: rowsToWorkbookRows(npsCurveColumns, npsCurveRows) },
      { name: "NPS Metrics", rows: rowsToWorkbookRows(npsMetricColumns, npsMetricsRows) },
    ];
    const files = [
      makeTextFile("noise_power_data.xls", buildSpreadsheetWorkbookXml(workbookSheets), "application/vnd.ms-excel"),
      makeTextFile("nps_2d_matrix.json", `${JSON.stringify(buildNps2dPayload(npsModels, context), null, 2)}\n`, "application/json"),
      makeTextFile(
        "analysis_metadata.json",
        `${JSON.stringify(buildAnalysisMetadata(datasets, rois, circles, context), null, 2)}\n`,
        "application/json"
      ),
      makeTextFile("README.txt", buildReadmeText(), "text/plain"),
    ];
    return {
      context,
      npsModels,
      squareRows,
      profileRows,
      ttfCurveRows,
      ttfMetricsRows,
      npsRoiRows,
      npsCurveRows,
      npsMetricsRows,
      workbookSheets,
      files,
    };
  }

  global.HAGRadNoisePowerCore = Object.freeze({
    APP_NAME,
    APP_VERSION,
    EXPORT_VERSION,
    ROI_TYPE,
    NPS_ROI_TYPE,
    CIRCLE_TYPE,
    DEFAULT_SQUARE_EDGE_PX,
    DEFAULT_NPS_EDGE_PX,
    DEFAULT_NPS_PERIPHERAL_COUNT,
    DEFAULT_NPS_RING_COUNT,
    MINIMUM_RECOMMENDED_PIXEL_COUNT,
    roundForDisplay,
    serializeNumber,
    toCsv,
    sanitizeFilePart,
    KERNEL_RHO10_REFERENCES,
    normalizeKernelKey,
    kernelRho10Reference,
    rhoMaxLpCmFromSpacing,
    datasetRhoMaxLpCm,
    kernelSamplingComparison,
    computeStats,
    createNoiseSquareRoi,
    createNoisePowerCircle,
    cloneRoi,
    cloneCircle,
    resolveSquareGeometry,
    extractSquareRoiPixels,
    buildProfileAnalysis,
    buildHistogram,
    fitPlane,
    snapPixelSquareCenter,
    isPowerOfTwo,
    nextPowerOfTwo,
    fft2dReal,
    buildNpsAnalysisFromMatrices,
    generateNpsRoisForCircle,
    validateNpsRois,
    buildNpsAnalysisForCircle,
    patientPointToImageCoord,
    pixelCenterToPatient,
    findNearestSliceIndexForPatientPoint,
    mapSquareRoiToTarget,
    mapCircleToTarget,
    buildMandatoryExportFiles,
    buildNpsModels,
    datasetLabel,
    naturalCompare,
  });
})(typeof window !== "undefined" ? window : globalThis);
