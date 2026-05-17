(function (global) {
  "use strict";

  const noiselabCore = global.HAGRadNoiseLabCore;
  if (!noiselabCore) {
    throw new Error("Missing NoiseLab core script: /src/noiselab/noiselab-core.js");
  }

  const {
    buildRoiProfileAnalysis,
    makeCharacterizationFigureFilename,
    makeHistogramFilename,
    makeNpsBandPowerFilename,
    makeNpsCumulativeCurveFilename,
    makeNpsCurveFilename,
    makeNpsHeatmapFilename,
    makeNpsNormalizedCurveFilename,
    makeProfileFigureFilename,
    roundForDisplay,
    resolveSquareGeometry,
  } = noiselabCore;

  function finiteExtent(values) {
    const finiteValues = (values || []).filter(Number.isFinite);
    if (!finiteValues.length) {
      return { min: 0, max: 1 };
    }
    let min = Math.min(...finiteValues);
    let max = Math.max(...finiteValues);
    if (Math.abs(max - min) < 1e-9) {
      const pad = Math.max(1, Math.abs(max) * 0.1 || 1);
      min -= pad;
      max += pad;
    } else {
      const pad = (max - min) * 0.08;
      min -= pad;
      max += pad;
    }
    return { min, max };
  }

  function mapRange(value, min, max, targetMin, targetMax) {
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max === min) {
      return (targetMin + targetMax) / 2;
    }
    const t = (value - min) / (max - min);
    return targetMin + (targetMax - targetMin) * t;
  }

  function grayscaleColor(value, min, max) {
    const byte = Math.max(0, Math.min(255, Math.round(mapRange(value, min, max, 26, 244))));
    return `rgb(${byte}, ${byte}, ${byte})`;
  }

  function divergingColor(value, maxAbs) {
    const limit = Number.isFinite(maxAbs) && maxAbs > 0 ? maxAbs : 1;
    const t = Math.max(-1, Math.min(1, (Number(value) || 0) / limit));
    if (t >= 0) {
      const whiteBlend = 1 - t;
      const green = Math.round(236 * whiteBlend + 76 * t);
      const blue = Math.round(244 * whiteBlend + 60 * t);
      return `rgb(200, ${green}, ${blue})`;
    }
    const magnitude = Math.abs(t);
    const whiteBlend = 1 - magnitude;
    const red = Math.round(241 * whiteBlend + 35 * magnitude);
    const green = Math.round(244 * whiteBlend + 87 * magnitude);
    return `rgb(${red}, ${green}, 201)`;
  }

  function drawFigureTitle(ctx, title, width) {
    if (!ctx || !title) {
      return;
    }
    ctx.save();
    ctx.fillStyle = "#0f1822";
    ctx.font = "600 13px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(title, 14, 12, Math.max(40, width - 28));
    ctx.restore();
  }

  function drawChartFrame(ctx, width, height, margins) {
    const left = margins.left;
    const top = margins.top;
    const chartWidth = Math.max(20, width - margins.left - margins.right);
    const chartHeight = Math.max(20, height - margins.top - margins.bottom);

    ctx.save();
    ctx.strokeStyle = "#d5dde7";
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, chartWidth, chartHeight);
    ctx.restore();

    return {
      left,
      top,
      chartWidth,
      chartHeight,
      right: left + chartWidth,
      bottom: top + chartHeight,
    };
  }

  function drawHorizontalGrid(ctx, frame, tickCount) {
    ctx.save();
    ctx.strokeStyle = "#e8edf3";
    ctx.lineWidth = 1;
    for (let tickIndex = 1; tickIndex < tickCount; tickIndex += 1) {
      const y = frame.top + (frame.chartHeight * tickIndex) / tickCount;
      ctx.beginPath();
      ctx.moveTo(frame.left, y);
      ctx.lineTo(frame.right, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawProfilePlotFigure(ctx, spec) {
    if (!ctx || !spec || !Array.isArray(spec.series) || !spec.series.length) {
      return false;
    }

    const width = spec.width || ctx.canvas?.width || 640;
    const height = spec.height || ctx.canvas?.height || 300;
    const allValues = spec.series.flatMap((series) => (series.values || []).filter(Number.isFinite));
    if (!allValues.length) {
      return false;
    }

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    drawFigureTitle(ctx, spec.title || "Profile plot", width);
    const frame = drawChartFrame(ctx, width, height, { top: 38, right: 16, bottom: 34, left: 46 });
    drawHorizontalGrid(ctx, frame, 4);

    const yExtent = finiteExtent(allValues);
    const sampleCount = Math.max(...spec.series.map((series) => series.values?.length || 0), 1);
    const xDenominator = Math.max(1, sampleCount - 1);
    const yToCanvas = (value) => mapRange(value, yExtent.min, yExtent.max, frame.bottom, frame.top);
    const xToCanvas = (index) => frame.left + (frame.chartWidth * index) / xDenominator;

    (spec.referenceLines || []).forEach((line) => {
      if (!Number.isFinite(line?.value)) {
        return;
      }
      ctx.save();
      if (typeof ctx.setLineDash === "function") {
        ctx.setLineDash([5, 4]);
      }
      ctx.strokeStyle = line.color || "#7f8a98";
      ctx.lineWidth = 1;
      const y = yToCanvas(line.value);
      ctx.beginPath();
      ctx.moveTo(frame.left, y);
      ctx.lineTo(frame.right, y);
      ctx.stroke();
      if (typeof ctx.setLineDash === "function") {
        ctx.setLineDash([]);
      }
      ctx.restore();
    });

    spec.series.forEach((series) => {
      const values = series.values || [];
      ctx.save();
      ctx.strokeStyle = series.color || "#0b6cae";
      ctx.lineWidth = series.lineWidth || 2;
      ctx.beginPath();
      let started = false;
      values.forEach((value, index) => {
        if (!Number.isFinite(value)) {
          return;
        }
        const x = xToCanvas(index);
        const y = yToCanvas(value);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.restore();
    });

    ctx.save();
    ctx.fillStyle = "#4d6074";
    ctx.font = "11px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(String(roundForDisplay(yExtent.max, 2)), 10, frame.top + 2);
    ctx.fillText(String(roundForDisplay(yExtent.min, 2)), 10, frame.bottom - 2);
    ctx.textBaseline = "alphabetic";
    ctx.fillText(spec.xLabel || "Sample index", frame.left, height - 10);
    if (spec.yLabel) {
      ctx.fillText(spec.yLabel, frame.left + 2, 28);
    }
    let legendX = frame.left + 6;
    const legendY = frame.top + 12;
    spec.series.forEach((series) => {
      ctx.fillStyle = series.color || "#0b6cae";
      ctx.fillRect(legendX, legendY - 8, 10, 3);
      legendX += 14;
      ctx.fillStyle = "#223242";
      ctx.fillText(series.label || "Series", legendX, legendY);
      legendX += Math.max(48, (series.label || "Series").length * 7 + 12);
    });
    ctx.restore();

    return true;
  }

  function drawHistogramFigure(ctx, spec) {
    if (!ctx || !spec || !Array.isArray(spec.bins) || !spec.bins.length) {
      return false;
    }

    const width = spec.width || ctx.canvas?.width || 640;
    const height = spec.height || ctx.canvas?.height || 220;
    const maxCount = Math.max(...spec.bins.map((bin) => bin.count || 0), 1);

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    drawFigureTitle(ctx, spec.title || "Histogram", width);
    const frame = drawChartFrame(ctx, width, height, { top: 38, right: 16, bottom: 34, left: 38 });
    drawHorizontalGrid(ctx, frame, 4);

    const barWidth = frame.chartWidth / spec.bins.length;
    spec.bins.forEach((bin, index) => {
      const x = frame.left + index * barWidth;
      const barHeight = frame.chartHeight * ((bin.count || 0) / maxCount);
      ctx.save();
      ctx.fillStyle = "#0b6cae";
      ctx.fillRect(x + 1, frame.bottom - barHeight, Math.max(1, barWidth - 2), barHeight);
      ctx.restore();
    });

    ctx.save();
    ctx.fillStyle = "#4d6074";
    ctx.font = "11px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.fillText("Count", 10, 28);
    ctx.fillText(spec.xLabel || "Calibrated value", frame.left, height - 10);
    ctx.fillText(String(maxCount), 12, frame.top + 4);
    ctx.fillText("0", 20, frame.bottom - 2);
    if (Number.isFinite(spec.meanValue)) {
      const meanIndex = spec.bins.findIndex((bin) => spec.meanValue >= bin.binLower && spec.meanValue <= bin.binUpper);
      if (meanIndex >= 0) {
        const x = frame.left + meanIndex * barWidth + barWidth / 2;
        ctx.strokeStyle = "#c84c3c";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, frame.top);
        ctx.lineTo(x, frame.bottom);
        ctx.stroke();
      }
    }
    ctx.restore();

    return true;
  }

  function asFiniteNumber(value) {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function shortLabel(value, maxLength) {
    const text = String(value || "").trim();
    const limit = Math.max(6, maxLength || 18);
    return text.length > limit ? `${text.slice(0, Math.max(1, limit - 3))}...` : text;
  }

  function drawReconstructionComparisonFigure(ctx, spec) {
    const rows = (spec?.rows || [])
      .map((row) => ({
        ...row,
        sdValue: asFiniteNumber(row.sd_calibrated),
        deltaPercent: asFiniteNumber(row.percent_delta_sd_vs_baseline),
      }))
      .filter((row) => Number.isFinite(row.sdValue));

    if (!ctx || !rows.length) {
      return false;
    }

    const width = spec.width || ctx.canvas?.width || 920;
    const height = spec.height || ctx.canvas?.height || 420;
    const maxRows = Math.max(1, spec.maxRows || 36);
    const plottedRows = rows.slice(0, maxRows);
    const groups = [];
    plottedRows.forEach((row) => {
      const groupId = row.comparison_group_id || row.roi_id || "roi";
      let group = groups.find((entry) => entry.groupId === groupId);
      if (!group) {
        group = {
          groupId,
          label: row.roi_label || groupId,
          rows: [],
        };
        groups.push(group);
      }
      group.rows.push(row);
    });

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    drawFigureTitle(ctx, spec.title || "Reconstruction noise comparison", width);
    const frame = drawChartFrame(ctx, width, height, { top: 42, right: 18, bottom: 72, left: 54 });
    drawHorizontalGrid(ctx, frame, 4);

    const yExtent = finiteExtent(plottedRows.map((row) => row.sdValue));
    const yToCanvas = (value) => mapRange(value, yExtent.min, yExtent.max, frame.bottom, frame.top);
    const totalBars = plottedRows.length;
    const groupGap = 8;
    const barWidth = Math.max(5, (frame.chartWidth - Math.max(0, groups.length - 1) * groupGap) / Math.max(totalBars, 1));
    let x = frame.left;

    groups.forEach((group) => {
      const groupStart = x;
      group.rows.forEach((row) => {
        const barHeight = frame.bottom - yToCanvas(row.sdValue);
        const negativeDelta = Number.isFinite(row.deltaPercent) && row.deltaPercent < 0;
        const positiveDelta = Number.isFinite(row.deltaPercent) && row.deltaPercent > 0;
        ctx.save();
        ctx.fillStyle =
          row.baseline_flag === "true"
            ? "#0b6cae"
            : negativeDelta
              ? "#2f8f64"
              : positiveDelta
                ? "#d18a2d"
                : "#8ca3b8";
        ctx.fillRect(x + 1, frame.bottom - barHeight, Math.max(3, barWidth - 2), barHeight);
        ctx.restore();
        x += barWidth;
      });

      const groupEnd = x;
      ctx.save();
      ctx.fillStyle = "#4d6074";
      ctx.font = "10px 'SF Pro Text', 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(shortLabel(group.label, 18), (groupStart + groupEnd) / 2, frame.bottom + 8, Math.max(30, groupEnd - groupStart));
      ctx.restore();
      x += groupGap;
    });

    ctx.save();
    ctx.fillStyle = "#4d6074";
    ctx.font = "11px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(String(roundForDisplay(yExtent.max, 2)), 12, frame.top + 2);
    ctx.fillText(String(roundForDisplay(yExtent.min, 2)), 12, frame.bottom - 2);
    ctx.fillText(spec.yLabel || "ROI SD", frame.left + 2, 30);
    ctx.fillText("Blue = baseline; green = lower SD; amber = higher SD versus baseline", frame.left, height - 18);
    ctx.restore();

    return true;
  }

  function drawMatrixHeatmap(ctx, spec) {
    const matrix = spec?.matrix;
    if (!ctx || !Array.isArray(matrix) || !matrix.length || !Array.isArray(matrix[0]) || !matrix[0].length) {
      return false;
    }

    const width = spec.width || ctx.canvas?.width || 300;
    const height = spec.height || ctx.canvas?.height || 300;
    const rows = matrix.length;
    const columns = matrix[0].length;
    const allValues = matrix.flat().filter(Number.isFinite);
    if (!allValues.length) {
      return false;
    }

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    drawFigureTitle(ctx, spec.title || "ROI matrix", width);
    const frame = drawChartFrame(ctx, width, height, { top: 38, right: 14, bottom: 24, left: 14 });
    const cellSize = Math.min(frame.chartWidth / columns, frame.chartHeight / rows);
    const gridWidth = cellSize * columns;
    const gridHeight = cellSize * rows;
    const offsetX = frame.left + (frame.chartWidth - gridWidth) / 2;
    const offsetY = frame.top + (frame.chartHeight - gridHeight) / 2;
    const colorMap = spec.colorMap || "grayscale";
    const valueExtent = finiteExtent(allValues);
    const maxAbs = Math.max(...allValues.map((value) => Math.abs(value)), 1);

    matrix.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        const x = offsetX + columnIndex * cellSize;
        const y = offsetY + rowIndex * cellSize;
        ctx.save();
        ctx.fillStyle =
          colorMap === "diverging"
            ? divergingColor(value, maxAbs)
            : grayscaleColor(value, valueExtent.min, valueExtent.max);
        ctx.fillRect(x, y, cellSize, cellSize);
        if (cellSize >= 14) {
          ctx.strokeStyle = "rgba(15, 24, 34, 0.14)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, cellSize, cellSize);
        }
        ctx.restore();
      });
    });

    const overlay = spec.overlay;
    if (overlay) {
      ctx.save();
      ctx.strokeStyle = overlay.color || "#ffd35f";
      ctx.fillStyle = overlay.fillColor || "rgba(255, 211, 95, 0.18)";
      ctx.lineWidth = 2;
      if (overlay.type === "row" && Number.isFinite(overlay.index)) {
        const y = offsetY + overlay.index * cellSize;
        ctx.fillRect(offsetX, y, gridWidth, cellSize);
        ctx.strokeRect(offsetX, y, gridWidth, cellSize);
      } else if (overlay.type === "column" && Number.isFinite(overlay.index)) {
        const x = offsetX + overlay.index * cellSize;
        ctx.fillRect(x, offsetY, cellSize, gridHeight);
        ctx.strokeRect(x, offsetY, cellSize, gridHeight);
      } else if (overlay.type === "all-rows") {
        for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
          const y = offsetY + rowIndex * cellSize + cellSize / 2;
          ctx.beginPath();
          ctx.moveTo(offsetX, y);
          ctx.lineTo(offsetX + gridWidth, y);
          ctx.stroke();
        }
      } else if (overlay.type === "all-columns") {
        for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
          const x = offsetX + columnIndex * cellSize + cellSize / 2;
          ctx.beginPath();
          ctx.moveTo(x, offsetY);
          ctx.lineTo(x, offsetY + gridHeight);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = "#4d6074";
    ctx.font = "11px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.fillText(`min ${roundForDisplay(valueExtent.min, 2)}`, frame.left, height - 8);
    ctx.fillText(`max ${roundForDisplay(valueExtent.max, 2)}`, Math.max(frame.left + 100, width - 86), height - 8);
    ctx.restore();

    return true;
  }

  function drawProfileCharacterizationFigure(ctx, spec) {
    if (!ctx || !spec || !Array.isArray(spec.values) || !spec.values.length) {
      return false;
    }

    const width = spec.width || ctx.canvas?.width || 300;
    const height = spec.height || ctx.canvas?.height || 300;
    const values = spec.values.filter(Number.isFinite);
    const deviations = (spec.deviations || []).filter(Number.isFinite);
    if (!values.length) {
      return false;
    }

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    drawFigureTitle(ctx, spec.title || "Characterized signal", width);

    const left = 16;
    const top = 44;
    const plotWidth = width - 32;
    const stripHeight = Math.max(24, Math.floor((height - top - 42) / 2));
    const cellWidth = plotWidth / spec.values.length;
    const valueExtent = finiteExtent(values);
    const deviationLimit = Math.max(...(deviations.length ? deviations.map((value) => Math.abs(value)) : [1]), 1);

    ctx.save();
    ctx.fillStyle = "#4d6074";
    ctx.font = "11px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.fillText("Extracted signal", left, top - 8);
    ctx.fillText("Mean-centered deviation", left, top + stripHeight + 16);
    ctx.restore();

    spec.values.forEach((value, index) => {
      const x = left + index * cellWidth;
      ctx.save();
      ctx.fillStyle = grayscaleColor(value, valueExtent.min, valueExtent.max);
      ctx.fillRect(x, top, Math.max(1, cellWidth), stripHeight);
      ctx.strokeStyle = "rgba(15, 24, 34, 0.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, top, Math.max(1, cellWidth), stripHeight);
      ctx.restore();
    });

    (spec.deviations || []).forEach((value, index) => {
      const x = left + index * cellWidth;
      ctx.save();
      ctx.fillStyle = divergingColor(value, deviationLimit);
      ctx.fillRect(x, top + stripHeight + 22, Math.max(1, cellWidth), stripHeight);
      ctx.strokeStyle = "rgba(15, 24, 34, 0.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, top + stripHeight + 22, Math.max(1, cellWidth), stripHeight);
      ctx.restore();
    });

    ctx.save();
    ctx.fillStyle = "#223242";
    ctx.font = "11px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.fillText(
      `Profile mean ${roundForDisplay(spec.meanValue, 2)}${spec.units ? ` ${spec.units}` : ""}`,
      left,
      height - 10
    );
    ctx.restore();

    return true;
  }

  function drawNpsCurveFigure(ctx, spec) {
    const bins = spec?.radialBins || [];
    const valueField = spec?.valueField || "nps";
    const valueForBin = (bin) => Number(bin?.[valueField]);
    const finiteBins = bins.filter((bin) => Number.isFinite(bin.frequencyCenter) && Number.isFinite(valueForBin(bin)));
    if (!ctx || !finiteBins.length) {
      return false;
    }

    const width = spec.width || ctx.canvas?.width || 760;
    const height = spec.height || ctx.canvas?.height || 300;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    drawFigureTitle(ctx, spec.title || "Noise Power Spectrum", width);

    const frame = drawChartFrame(ctx, width, height, { top: 42, right: 18, bottom: 38, left: 58 });
    drawHorizontalGrid(ctx, frame, 4);
    const xMax = Math.max(...finiteBins.map((bin) => bin.frequencyCenter), 1);
    const yExtent = finiteExtent(finiteBins.map((bin) => valueForBin(bin)));
    const xToCanvas = (value) => mapRange(value, 0, xMax, frame.left, frame.right);
    const yToCanvas = (value) => mapRange(value, yExtent.min, yExtent.max, frame.bottom, frame.top);

    ctx.save();
    ctx.strokeStyle = spec.lineColor || "#0b6cae";
    ctx.lineWidth = 2;
    ctx.beginPath();
    finiteBins.forEach((bin, index) => {
      const x = xToCanvas(bin.frequencyCenter);
      const y = yToCanvas(valueForBin(bin));
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    if (Number.isFinite(spec.peakFrequency)) {
      const x = xToCanvas(spec.peakFrequency);
      if (typeof ctx.setLineDash === "function") {
        ctx.setLineDash([5, 4]);
      }
      ctx.strokeStyle = "#c84c3c";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x, frame.top);
      ctx.lineTo(x, frame.bottom);
      ctx.stroke();
      if (typeof ctx.setLineDash === "function") {
        ctx.setLineDash([]);
      }
    }

    (spec.referenceFrequencies || []).forEach((reference) => {
      if (!Number.isFinite(reference?.frequency)) {
        return;
      }
      const x = xToCanvas(reference.frequency);
      if (typeof ctx.setLineDash === "function") {
        ctx.setLineDash([3, 4]);
      }
      ctx.strokeStyle = reference.color || "#6c7f91";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, frame.top);
      ctx.lineTo(x, frame.bottom);
      ctx.stroke();
      if (typeof ctx.setLineDash === "function") {
        ctx.setLineDash([]);
      }
      ctx.fillStyle = reference.color || "#4d6074";
      ctx.fillText(reference.label || "", x + 4, frame.top + 14);
    });
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "#4d6074";
    ctx.font = "11px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.fillText(spec.xLabel || "Spatial frequency (cycles/mm)", frame.left, height - 12);
    ctx.fillText(spec.yLabel || `NPS (${spec.npsUnits || "units^2 mm^2"})`, frame.left + 2, 30);
    ctx.fillText(String(roundForDisplay(yExtent.max, 3)), 10, frame.top + 4);
    ctx.fillText(String(roundForDisplay(yExtent.min, 3)), 10, frame.bottom - 2);
    if (Number.isFinite(spec.peakFrequency)) {
      ctx.fillStyle = "#223242";
      ctx.fillText(`Peak ${roundForDisplay(spec.peakFrequency, 4)} cycles/mm`, frame.left + 8, frame.top + 16);
    }
    ctx.restore();

    return true;
  }

  function drawNpsHeatmapFigure(ctx, spec) {
    const matrix = spec?.nps2d;
    if (!ctx || !Array.isArray(matrix) || !matrix.length || !Array.isArray(matrix[0]) || !matrix[0].length) {
      return false;
    }

    const width = spec.width || ctx.canvas?.width || 520;
    const height = spec.height || ctx.canvas?.height || 520;
    const rows = matrix.length;
    const columns = matrix[0].length;
    const values = matrix.flat().filter(Number.isFinite);
    if (!values.length) {
      return false;
    }

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    drawFigureTitle(ctx, spec.title || "2D NPS", width);

    const frame = drawChartFrame(ctx, width, height, { top: 42, right: 24, bottom: 34, left: 24 });
    const cellSize = Math.min(frame.chartWidth / columns, frame.chartHeight / rows);
    const gridWidth = cellSize * columns;
    const gridHeight = cellSize * rows;
    const offsetX = frame.left + (frame.chartWidth - gridWidth) / 2;
    const offsetY = frame.top + (frame.chartHeight - gridHeight) / 2;
    const logValues = values.map((value) => Math.log10(Math.max(value, Number.EPSILON)));
    const extent = finiteExtent(logValues);

    matrix.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        const logValue = Math.log10(Math.max(value, Number.EPSILON));
        const t = Math.max(0, Math.min(1, mapRange(logValue, extent.min, extent.max, 0, 1)));
        const red = Math.round(20 + 210 * t);
        const green = Math.round(45 + 120 * (1 - Math.abs(t - 0.55)));
        const blue = Math.round(92 + 135 * (1 - t));
        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(offsetX + columnIndex * cellSize, offsetY + rowIndex * cellSize, cellSize, cellSize);
      });
    });

    ctx.save();
    ctx.strokeStyle = "rgba(15, 24, 34, 0.38)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(offsetX + gridWidth / 2, offsetY);
    ctx.lineTo(offsetX + gridWidth / 2, offsetY + gridHeight);
    ctx.moveTo(offsetX, offsetY + gridHeight / 2);
    ctx.lineTo(offsetX + gridWidth, offsetY + gridHeight / 2);
    ctx.stroke();
    ctx.fillStyle = "#4d6074";
    ctx.font = "11px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.fillText("log10 NPS", frame.left, height - 12);
    ctx.fillText(`Peak ${roundForDisplay(spec.peakFrequency, 4)} cycles/mm`, frame.left + 82, height - 12);
    ctx.restore();

    return true;
  }

  function drawNpsBandPowerFigure(ctx, spec) {
    const bands = spec?.bandPowers?.bands || [];
    const finiteBands = bands.filter((band) => Number.isFinite(band.fraction));
    if (!ctx || !finiteBands.length) {
      return false;
    }

    const width = spec.width || ctx.canvas?.width || 520;
    const height = spec.height || ctx.canvas?.height || 300;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    drawFigureTitle(ctx, spec.title || "NPS Bandpower", width);

    const frame = drawChartFrame(ctx, width, height, { top: 42, right: 18, bottom: 52, left: 54 });
    drawHorizontalGrid(ctx, frame, 4);
    const yToCanvas = (value) => mapRange(value, 0, 1, frame.bottom, frame.top);
    const colors = {
      low: "#2f8f64",
      mid: "#0b6cae",
      high: "#d18a2d",
    };
    const gap = 16;
    const barWidth = Math.max(24, (frame.chartWidth - gap * Math.max(0, finiteBands.length - 1)) / finiteBands.length);

    finiteBands.forEach((band, index) => {
      const x = frame.left + index * (barWidth + gap);
      const y = yToCanvas(band.fraction);
      const barHeight = frame.bottom - y;
      ctx.save();
      ctx.fillStyle = colors[band.key] || "#8ca3b8";
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.fillStyle = "#0f1822";
      ctx.font = "600 11px 'SF Pro Text', 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${roundForDisplay(band.fraction * 100, 1)}%`, x + barWidth / 2, y - 6);
      ctx.fillStyle = "#4d6074";
      ctx.font = "10px 'SF Pro Text', 'Segoe UI', sans-serif";
      ctx.fillText(band.label || band.key, x + barWidth / 2, frame.bottom + 14);
      const lower = Number.isFinite(band.lower) ? roundForDisplay(band.lower, 3) : 0;
      const upper = Number.isFinite(band.upper) ? roundForDisplay(band.upper, 3) : "";
      ctx.fillText(`${lower}-${upper}`, x + barWidth / 2, frame.bottom + 28);
      ctx.restore();
    });

    ctx.save();
    ctx.fillStyle = "#4d6074";
    ctx.font = "11px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.fillText(spec.yLabel || "Fraction of radial-domain NPS power", frame.left + 2, 30);
    ctx.fillText("Bands split at 25% and 50% of min Nyquist frequency", frame.left, height - 10);
    ctx.restore();

    return true;
  }

  function getProfileOverlay(profileType, visualization) {
    if (!visualization) {
      return null;
    }
    if (profileType === "horizontal-center") {
      return { type: "row", index: visualization.centerRowIndex };
    }
    if (profileType === "vertical-center") {
      return { type: "column", index: visualization.centerColumnIndex };
    }
    if (profileType === "horizontal-mean") {
      return { type: "all-rows" };
    }
    if (profileType === "vertical-mean") {
      return { type: "all-columns" };
    }
    return null;
  }

  function drawCharacterizationCompositeFigure(ctx, spec) {
    if (!ctx || !spec?.profile || !spec?.visualization) {
      return false;
    }

    const width = spec.width || ctx.canvas?.width || 760;
    const height = spec.height || ctx.canvas?.height || 340;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    drawFigureTitle(ctx, spec.title || "ROI characterization", width);

    const top = 38;
    const padding = 14;
    const panelHeight = Math.max(120, height - top - padding);
    const leftWidth = Math.floor((width - padding * 3) * 0.42);
    const rightWidth = width - leftWidth - padding * 3;

    const matrixCanvas = document.createElement("canvas");
    matrixCanvas.width = leftWidth;
    matrixCanvas.height = panelHeight;
    drawMatrixHeatmap(matrixCanvas.getContext("2d"), {
      width: matrixCanvas.width,
      height: matrixCanvas.height,
      title: "Included square ROI pixels",
      matrix: spec.visualization.rawMatrix,
      colorMap: "grayscale",
      overlay: getProfileOverlay(spec.profile.type, spec.visualization),
    });

    const derivedCanvas = document.createElement("canvas");
    derivedCanvas.width = rightWidth;
    derivedCanvas.height = panelHeight;
    drawProfileCharacterizationFigure(derivedCanvas.getContext("2d"), {
      width: derivedCanvas.width,
      height: derivedCanvas.height,
      title: spec.profile.label,
      values: spec.profile.values,
      deviations: spec.profile.deviations,
      meanValue: spec.profile.stats?.mean,
      units: spec.profile.units,
    });

    ctx.drawImage(matrixCanvas, padding, top, leftWidth, panelHeight);
    ctx.drawImage(derivedCanvas, padding * 2 + leftWidth, top, rightWidth, panelHeight);
    return true;
  }

  function clampWindowWidth(value) {
    return Math.max(1, Number(value) || 1);
  }

  function clampWindowCenter(value) {
    return Number(value) || 0;
  }

  function windowPixelToByte(value, center, width) {
    const ww = clampWindowWidth(width);
    const wc = clampWindowCenter(center);
    const minimum = wc - ww / 2;
    const maximum = wc + ww / 2;
    if (value <= minimum) {
      return 0;
    }
    if (value >= maximum) {
      return 255;
    }
    return Math.round(((value - minimum) / (maximum - minimum)) * 255);
  }

  function buildGrayscaleImageData(slice, volume, viewport) {
    const width = volume.columns;
    const height = volume.rows;
    const imageData = new Uint8ClampedArray(width * height * 4);
    const wc = Number.isFinite(viewport?.windowCenter)
      ? viewport.windowCenter
      : slice.intercept + ((slice.pixels[0] || 0) * slice.slope);
    const ww = Number.isFinite(viewport?.windowWidth) ? viewport.windowWidth : 400;

    for (let index = 0; index < slice.pixels.length; index += 1) {
      const calibrated = slice.pixels[index] * slice.slope + slice.intercept;
      const byte = windowPixelToByte(calibrated, wc, ww);
      const baseIndex = index * 4;
      imageData[baseIndex] = byte;
      imageData[baseIndex + 1] = byte;
      imageData[baseIndex + 2] = byte;
      imageData[baseIndex + 3] = 255;
    }

    return {
      width,
      height,
      data: imageData,
    };
  }

  function buildOverlayFigureSpec(volume, roi, viewport, options) {
    const slice = volume?.slices?.[roi?.sliceIndex];
    if (!slice) {
      return null;
    }
    const geometry = resolveSquareGeometry(roi, volume);
    if (!geometry || geometry.error) {
      return null;
    }

    return {
      title: options?.title || roi.label,
      width: volume.columns,
      height: volume.rows,
      image: buildGrayscaleImageData(slice, volume, viewport),
      roi: {
        id: roi.id,
        label: roi.label,
        squareMode: roi.squareMode,
        x: geometry.xMinBoundaryImg + 0.5,
        y: geometry.yMinBoundaryImg + 0.5,
        width: geometry.xMaxBoundaryImg - geometry.xMinBoundaryImg,
        height: geometry.yMaxBoundaryImg - geometry.yMinBoundaryImg,
      },
      metricBadge: options?.metricBadge || null,
    };
  }

  function drawOverlayFigure(ctx, spec) {
    if (!ctx || !spec) {
      return false;
    }

    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, spec.width, spec.height);

    if (typeof ImageData !== "undefined") {
      const imageData = new ImageData(spec.image.data, spec.image.width, spec.image.height);
      ctx.putImageData(imageData, 0, 0);
    } else if (ctx.putImageData) {
      ctx.putImageData(
        {
          data: spec.image.data,
          width: spec.image.width,
          height: spec.image.height,
        },
        0,
        0
      );
    }

    ctx.strokeStyle = "#ffd35f";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(spec.roi.x, spec.roi.y, spec.roi.width, spec.roi.height);

    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(spec.roi.x + 4, Math.max(0, spec.roi.y - 24), 132, 20);
    ctx.fillStyle = "#fff7d2";
    ctx.font = "12px Menlo, monospace";
    ctx.textBaseline = "middle";
    ctx.fillText(spec.roi.label, spec.roi.x + 10, Math.max(10, spec.roi.y - 14));

    if (spec.metricBadge) {
      const badge = `${spec.metricBadge.label}: ${roundForDisplay(spec.metricBadge.value, spec.metricBadge.digits || 2)}`;
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(spec.roi.x + 4, Math.min(spec.height - 24, spec.roi.y + spec.roi.height + 6), 160, 20);
      ctx.fillStyle = "#dce6f7";
      ctx.fillText(badge, spec.roi.x + 10, Math.min(spec.height - 14, spec.roi.y + spec.roi.height + 16));
    }

    ctx.restore();
    return true;
  }

  async function canvasToBlob(canvas) {
    if (!canvas) {
      throw new Error("No canvas was provided.");
    }

    if (typeof canvas.toBlob === "function") {
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
              return;
            }
            reject(new Error("Canvas export returned an empty blob."));
          },
          "image/png",
          1
        );
      });
    }

    if (typeof canvas.toDataURL === "function") {
      const dataUrl = canvas.toDataURL("image/png");
      const response = await fetch(dataUrl);
      return response.blob();
    }

    throw new Error("PNG export is not available in this browser.");
  }

  async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64Index = result.indexOf(",");
        resolve(base64Index >= 0 ? result.slice(base64Index + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error("Could not read blob data."));
      reader.readAsDataURL(blob);
    });
  }

  async function createOverlayPngFile(volume, roi, viewport, options) {
    const spec = buildOverlayFigureSpec(volume, roi, viewport, options);
    if (!spec) {
      throw new Error("Could not build overlay figure.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = spec.width;
    canvas.height = spec.height;
    const ctx = canvas.getContext("2d");
    drawOverlayFigure(ctx, spec);
    const blob = await canvasToBlob(canvas);
    const contentBase64 = await blobToBase64(blob);
    return {
      name: noiselabCore.makeOverlayFilename(roi),
      mimeType: "image/png",
      contentBase64,
    };
  }

  async function createCanvasFigureFile(name, width, height, drawFigure) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const didDraw = drawFigure(ctx, { width, height });
    if (!didDraw) {
      throw new Error(`Could not render ${name}.`);
    }
    const blob = await canvasToBlob(canvas);
    const contentBase64 = await blobToBase64(blob);
    return {
      name,
      mimeType: "image/png",
      contentBase64,
    };
  }

  async function createHistogramPngFile(roi, analysis, visualization) {
    return createCanvasFigureFile(makeHistogramFilename(roi), 720, 240, (ctx, size) =>
      drawHistogramFigure(ctx, {
        width: size.width,
        height: size.height,
        title: `${roi.label} histogram`,
        bins: visualization?.histogram || [],
        xLabel: analysis?.units ? `Calibrated value (${analysis.units})` : "Calibrated value",
        meanValue: analysis?.statsCalibrated?.mean,
      })
    );
  }

  async function createProfilePngFile(roi, profile) {
    return createCanvasFigureFile(makeProfileFigureFilename(roi, profile?.type), 760, 300, (ctx, size) =>
      drawProfilePlotFigure(ctx, {
        width: size.width,
        height: size.height,
        title: `${roi.label} · ${profile?.label || "Profile"}`,
        xLabel: profile?.spacingMm
          ? `Ordered sample index (${roundForDisplay(profile.spacingMm, 3)} mm spacing)`
          : "Ordered sample index",
        yLabel: profile?.units ? `Calibrated value (${profile.units})` : "Calibrated value",
        series: [
          {
            label: "Signal",
            values: profile?.values || [],
            color: "#0b6cae",
          },
        ],
        referenceLines: [
          {
            label: "Profile mean",
            value: profile?.stats?.mean,
            color: "#c84c3c",
          },
        ],
      })
    );
  }

  async function createCharacterizationPngFile(roi, profile, visualization) {
    return createCanvasFigureFile(makeCharacterizationFigureFilename(roi, profile?.type), 860, 340, (ctx, size) =>
      drawCharacterizationCompositeFigure(ctx, {
        width: size.width,
        height: size.height,
        title: `${roi.label} · ${profile?.label || "Characterization"}`,
        profile,
        visualization,
      })
    );
  }

  async function createAnalysisFigureFiles(roi, analysis, options) {
    const visualization = buildRoiProfileAnalysis(analysis, {
      histogramBins: options?.histogramBins,
    });
    if (!visualization) {
      return [];
    }

    const files = [];
    files.push(await createHistogramPngFile(roi, analysis, visualization));
    for (const profile of visualization.profiles || []) {
      files.push(await createProfilePngFile(roi, profile));
      files.push(await createCharacterizationPngFile(roi, profile, visualization));
    }
    return files;
  }

  async function createReconstructionComparisonPngFile(comparison) {
    const rows = comparison?.roiComparison?.rows || [];
    if (!rows.length) {
      return null;
    }
    return createCanvasFigureFile("reconstruction_noise_comparison.png", 980, 440, (ctx, size) =>
      drawReconstructionComparisonFigure(ctx, {
        width: size.width,
        height: size.height,
        title: "ROI SD across loaded reconstructions",
        rows,
        yLabel: "SD (calibrated units)",
      })
    );
  }

  async function createNpsFigureFiles(set, analysis) {
    if (!analysis || analysis.error) {
      return [];
    }
    const files = [];
    files.push(
      await createCanvasFigureFile(makeNpsCurveFilename(set), 760, 300, (ctx, size) =>
        drawNpsCurveFigure(ctx, {
          width: size.width,
          height: size.height,
          title: `${set?.label || set?.id || "NPS set"} absolute radial NPS`,
          radialBins: analysis.radialBins,
          valueField: "nps",
          peakFrequency: analysis.peakFrequency,
          npsUnits: analysis.npsUnits,
        })
      )
    );
    files.push(
      await createCanvasFigureFile(makeNpsNormalizedCurveFilename(set), 760, 300, (ctx, size) =>
        drawNpsCurveFigure(ctx, {
          width: size.width,
          height: size.height,
          title: `${set?.label || set?.id || "NPS set"} normalized radial NPS`,
          radialBins: analysis.radialBins,
          valueField: "normalizedNps",
          lineColor: "#2f8f64",
          yLabel: `Normalized NPS (${analysis.normalizedNpsUnits || "mm^2"})`,
          peakFrequency: analysis.peakFrequency,
          npsUnits: analysis.normalizedNpsUnits,
        })
      )
    );
    files.push(
      await createCanvasFigureFile(makeNpsCumulativeCurveFilename(set), 760, 300, (ctx, size) =>
        drawNpsCurveFigure(ctx, {
          width: size.width,
          height: size.height,
          title: `${set?.label || set?.id || "NPS set"} cumulative NPS`,
          radialBins: analysis.radialBins,
          valueField: "cumulativeFraction",
          lineColor: "#d18a2d",
          yLabel: "Cumulative radial-domain power fraction",
          referenceFrequencies: [
            { label: "f10", frequency: analysis.f10Frequency, color: "#6c7f91" },
            { label: "f50", frequency: analysis.f50Frequency, color: "#0b6cae" },
            { label: "f90", frequency: analysis.f90Frequency, color: "#c84c3c" },
          ],
        })
      )
    );
    files.push(
      await createCanvasFigureFile(makeNpsBandPowerFilename(set), 560, 320, (ctx, size) =>
        drawNpsBandPowerFigure(ctx, {
          width: size.width,
          height: size.height,
          title: `${set?.label || set?.id || "NPS set"} NPS bandpower`,
          bandPowers: analysis.bandPowers,
        })
      )
    );
    files.push(
      await createCanvasFigureFile(makeNpsHeatmapFilename(set), 520, 520, (ctx, size) =>
        drawNpsHeatmapFigure(ctx, {
          width: size.width,
          height: size.height,
          title: `${set?.label || set?.id || "NPS set"} 2D NPS`,
          nps2d: analysis.nps2d,
          peakFrequency: analysis.peakFrequency,
        })
      )
    );
    return files;
  }

  global.HAGRadNoiseLabExport = Object.freeze({
    buildOverlayFigureSpec,
    createAnalysisFigureFiles,
    createNpsFigureFiles,
    drawHistogramFigure,
    drawMatrixHeatmap,
    drawCharacterizationCompositeFigure,
    drawNpsCurveFigure,
    drawNpsBandPowerFigure,
    drawNpsHeatmapFigure,
    drawOverlayFigure,
    drawProfileCharacterizationFigure,
    drawProfilePlotFigure,
    drawReconstructionComparisonFigure,
    createOverlayPngFile,
    createReconstructionComparisonPngFile,
  });
})(typeof window !== "undefined" ? window : globalThis);
