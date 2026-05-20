(function (global) {
  "use strict";

  const core = global.HAGRadNoisePowerCore;
  const zipApi = global.HAGRadZip || {};
  if (!core) {
    throw new Error("Missing HAGRad Noise Power core.");
  }

  const {
    CIRCLE_TYPE,
    NPS_ROI_TYPE,
    ROI_TYPE,
    buildProfileAnalysis,
    datasetLabel,
    extractSquareRoiPixels,
    roundForDisplay,
    sanitizeFilePart,
  } = core;

  const palette = ["#0b6cae", "#2f8f64", "#d18a2d", "#9b62b5", "#c84c3c", "#4f7d90", "#5c6bc0", "#7a6a32"];

  function finiteExtent(values) {
    const finite = (values || []).filter(Number.isFinite);
    if (!finite.length) {
      return { min: 0, max: 1 };
    }
    let min = Math.min(...finite);
    let max = Math.max(...finite);
    if (Math.abs(max - min) < 1e-12) {
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
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || Math.abs(max - min) < 1e-12) {
      return (targetMin + targetMax) / 2;
    }
    return targetMin + ((value - min) / (max - min)) * (targetMax - targetMin);
  }

  function chartTheme(spec = {}) {
    return spec.theme === "dark"
      ? {
          bg: "#080d13",
          panel: "#0d1620",
          text: "#f4f8fb",
          muted: "#a8bac7",
          grid: "rgba(194, 213, 225, 0.20)",
          frame: "rgba(194, 213, 225, 0.34)",
          legend: "#dce7ee",
        }
      : {
          bg: "#ffffff",
          panel: "#ffffff",
          text: "#0f1822",
          muted: "#4d6074",
          grid: "#e8edf3",
          frame: "#d5dde7",
          legend: "#223242",
        };
  }

  function clearCanvas(ctx, width, height, theme = chartTheme()) {
    ctx.save();
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function drawTitle(ctx, title, width, theme = chartTheme()) {
    ctx.save();
    ctx.fillStyle = theme.text;
    ctx.font = "600 13px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(title || "", 14, 12, Math.max(40, width - 28));
    ctx.restore();
  }

  function truncateCanvasText(ctx, text, maxWidth) {
    const value = String(text || "");
    if (ctx.measureText(value).width <= maxWidth) {
      return value;
    }
    let next = value;
    while (next.length > 4 && ctx.measureText(`${next}...`).width > maxWidth) {
      next = next.slice(0, -1);
    }
    return `${next}...`;
  }

  function measureLegendRows(ctx, series, maxWidth) {
    const entries = (series || []).slice(0, 10);
    if ((series || []).length > entries.length) {
      entries.push({ label: `+${series.length - entries.length} more` });
    }
    let rows = entries.length ? 1 : 0;
    let cursorX = 0;
    entries.forEach((entry) => {
      const labelWidth = Math.min(190, ctx.measureText(entry.label || "Series").width);
      const itemWidth = 24 + labelWidth + 18;
      if (cursorX > 0 && cursorX + itemWidth > maxWidth) {
        rows += 1;
        cursorX = 0;
      }
      cursorX += itemWidth;
    });
    return Math.min(rows, 4);
  }

  function drawLegend(ctx, series, frame, startY, maxWidth, theme = chartTheme()) {
    const entries = (series || []).slice(0, 10);
    if ((series || []).length > entries.length) {
      entries.push({ label: `+${series.length - entries.length} more`, color: theme.muted });
    }
    ctx.save();
    ctx.font = "11px 'SF Pro Text', 'Segoe UI', sans-serif";
    let x = frame.left + 8;
    let y = startY;
    const rowHeight = 17;
    entries.forEach((entry, index) => {
      const color = entry.color || palette[index % palette.length];
      const label = truncateCanvasText(ctx, entry.label || `Series ${index + 1}`, 180);
      const itemWidth = 24 + ctx.measureText(label).width + 18;
      if (x > frame.left + 8 && x + itemWidth > frame.left + maxWidth) {
        x = frame.left + 8;
        y += rowHeight;
      }
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 8, 13, 3);
      x += 18;
      ctx.fillStyle = theme.legend;
      ctx.fillText(label, x, y);
      x += ctx.measureText(label).width + 18;
    });
    ctx.restore();
  }

  function chartFrame(ctx, width, height, margins, theme = chartTheme()) {
    const frame = {
      left: margins.left,
      top: margins.top,
      right: width - margins.right,
      bottom: height - margins.bottom,
    };
    frame.width = frame.right - frame.left;
    frame.height = frame.bottom - frame.top;
    ctx.save();
    ctx.strokeStyle = theme.frame;
    ctx.lineWidth = 1;
    ctx.strokeRect(frame.left, frame.top, frame.width, frame.height);
    ctx.strokeStyle = theme.grid;
    for (let tick = 1; tick < 4; tick += 1) {
      const y = frame.top + (frame.height * tick) / 4;
      ctx.beginPath();
      ctx.moveTo(frame.left, y);
      ctx.lineTo(frame.right, y);
      ctx.stroke();
    }
    ctx.restore();
    return frame;
  }

  function drawEmpty(ctx, message, width, height, spec = {}) {
    const theme = chartTheme(spec);
    clearCanvas(ctx, width, height, theme);
    ctx.save();
    ctx.fillStyle = theme.muted;
    ctx.font = "12px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(message || "No data", 16, height / 2);
    ctx.restore();
  }

  function drawLineSeries(ctx, spec) {
    const width = spec.width || ctx.canvas.width;
    const height = spec.height || ctx.canvas.height;
    const theme = chartTheme(spec);
    const series = (spec.series || []).filter((entry) => (entry.points || []).some((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
    if (!series.length) {
      drawEmpty(ctx, spec.emptyMessage || "No curve available", width, height, spec);
      return false;
    }
    clearCanvas(ctx, width, height, theme);
    drawTitle(ctx, spec.title || "Curve", width, theme);
    const points = series.flatMap((entry) => entry.points || []);
    const xExtent = finiteExtent(points.map((point) => point.x));
    const yExtent = finiteExtent(points.map((point) => point.y));
    ctx.save();
    ctx.font = "11px 'SF Pro Text', 'Segoe UI', sans-serif";
    const legendRows = measureLegendRows(ctx, series, Math.max(120, width - 110));
    ctx.restore();
    const frame = chartFrame(ctx, width, height, {
      top: Math.max(56, 42 + legendRows * 18),
      right: 28,
      bottom: 52,
      left: 78,
    }, theme);
    const xToCanvas = (value) => mapRange(value, xExtent.min, xExtent.max, frame.left, frame.right);
    const yToCanvas = (value) => mapRange(value, yExtent.min, yExtent.max, frame.bottom, frame.top);

    series.forEach((entry, index) => {
      const color = entry.color || palette[index % palette.length];
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = entry.lineWidth || 2;
      ctx.beginPath();
      let started = false;
      (entry.points || []).forEach((point) => {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
          return;
        }
        const x = xToCanvas(point.x);
        const y = yToCanvas(point.y);
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

    if (Array.isArray(spec.referenceFrequencies)) {
      spec.referenceFrequencies.forEach((reference) => {
        if (!Number.isFinite(reference.frequency)) {
          return;
        }
        const x = xToCanvas(reference.frequency);
        ctx.save();
        ctx.strokeStyle = reference.color || "#7f8a98";
        ctx.setLineDash?.([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, frame.top);
        ctx.lineTo(x, frame.bottom);
        ctx.stroke();
        ctx.restore();
      });
    }

    ctx.save();
    ctx.fillStyle = theme.muted;
    ctx.font = "11px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.fillText(spec.xLabel || "Frequency (cycles/mm)", frame.left, height - 10);
    ctx.fillText(spec.yLabel || "", frame.left + 2, 28);
    ctx.fillText(String(roundForDisplay(yExtent.max, 3)), 8, frame.top + 4);
    ctx.fillText(String(roundForDisplay(yExtent.min, 3)), 8, frame.bottom - 4);
    ctx.restore();
    drawLegend(ctx, series, frame, 40, Math.max(120, width - 110), theme);
    return true;
  }

  function drawHistogram(ctx, spec) {
    const width = spec.width || ctx.canvas.width;
    const height = spec.height || ctx.canvas.height;
    const theme = chartTheme(spec);
    const bins = spec.bins || [];
    if (!bins.length) {
      drawEmpty(ctx, "No histogram available", width, height, spec);
      return false;
    }
    clearCanvas(ctx, width, height, theme);
    drawTitle(ctx, spec.title || "Square ROI histogram", width, theme);
    const frame = chartFrame(ctx, width, height, { top: 40, right: 18, bottom: 40, left: 46 }, theme);
    const maxCount = Math.max(...bins.map((bin) => bin.count || 0), 1);
    const barWidth = frame.width / bins.length;
    bins.forEach((bin, index) => {
      const barHeight = frame.height * ((bin.count || 0) / maxCount);
      ctx.save();
      ctx.fillStyle = "#0b6cae";
      ctx.fillRect(frame.left + index * barWidth + 1, frame.bottom - barHeight, Math.max(1, barWidth - 2), barHeight);
      ctx.restore();
    });
    ctx.save();
    ctx.fillStyle = theme.muted;
    ctx.font = "11px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.fillText(spec.xLabel || "HU", frame.left, height - 10);
    ctx.fillText("Count", frame.left + 2, 28);
    ctx.restore();
    return true;
  }

  function drawProfile(ctx, spec) {
    const profile = spec.profile;
    return drawLineSeries(ctx, {
      width: spec.width || ctx.canvas.width,
      height: spec.height || ctx.canvas.height,
      title: spec.title || profile?.label || "Square ROI profile",
      xLabel: profile?.spacingMm ? `Distance (${roundForDisplay(profile.spacingMm, 3)} mm samples)` : "Sample index",
      yLabel: profile?.units ? `Value (${profile.units})` : "Value",
      theme: spec.theme,
      series: [
        {
          label: profile?.label || "Profile",
          color: "#0b6cae",
          points: (profile?.samples || []).map((sample) => ({
            x: Number.isFinite(sample.distanceMm) ? sample.distanceMm : sample.sampleIndex,
            y: sample.value,
          })),
        },
      ],
    });
  }

  function quantile(values, probability) {
    const finite = (values || []).filter(Number.isFinite).sort((left, right) => left - right);
    if (!finite.length) {
      return null;
    }
    const index = (finite.length - 1) * Math.max(0, Math.min(1, Number(probability) || 0));
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) {
      return finite[lower];
    }
    return finite[lower] + (finite[upper] - finite[lower]) * (index - lower);
  }

  function frequencyTickStep(maxAbsFrequency) {
    const maxAbs = Math.abs(Number(maxAbsFrequency) || 0);
    if (maxAbs <= 0.75) {
      return 0.25;
    }
    if (maxAbs <= 1.5) {
      return 0.5;
    }
    if (maxAbs <= 4) {
      return 1;
    }
    return 2;
  }

  function formatFrequencyTick(value) {
    const rounded = roundForDisplay(value, Math.abs(value) < 1 ? 2 : 1);
    return String(Object.is(rounded, -0) ? 0 : rounded);
  }

  function drawRotatedText(ctx, text, x, y, angleRadians, maxWidth) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angleRadians);
    ctx.fillText(text, 0, 0, maxWidth);
    ctx.restore();
  }

  function drawNpsHeatmap(ctx, spec) {
    const analysis = spec.analysis || {};
    const matrix = spec.nps2d || analysis.nps2d || [];
    const width = spec.width || ctx.canvas.width;
    const height = spec.height || ctx.canvas.height;
    const theme = chartTheme(spec);
    if (!matrix.length || !matrix[0]?.length) {
      drawEmpty(ctx, "No 2D NPS available", width, height, spec);
      return false;
    }
    clearCanvas(ctx, width, height, theme);
    drawTitle(ctx, spec.title || "2D NPS", width, theme);
    const rows = matrix.length;
    const cols = matrix[0].length;
    const frequencyStepX = Number(spec.frequencyStepX ?? analysis.frequencyStepX) || 1;
    const frequencyStepY = Number(spec.frequencyStepY ?? analysis.frequencyStepY) || frequencyStepX;
    const halfRangeX = (cols / 2) * frequencyStepX;
    const halfRangeY = (rows / 2) * frequencyStepY;
    const values = matrix.flat().filter((value) => Number.isFinite(value) && value >= 0);
    const robustMax = Number(spec.colorMax) || quantile(values, 0.995) || Math.max(...values, 1);
    const colorMax = Math.max(robustMax, Number.EPSILON);
    const top = 46;
    const bottom = 72;
    const left = 72;
    const right = 116;
    const plotSize = Math.max(64, Math.min(width - left - right, height - top - bottom));
    const plotLeft = left + Math.max(0, width - left - right - plotSize) / 2;
    const plotTop = top + Math.max(0, height - top - bottom - plotSize) / 2;
    const plotRight = plotLeft + plotSize;
    const plotBottom = plotTop + plotSize;
    const cellWidth = plotSize / cols;
    const cellHeight = plotSize / rows;
    ctx.save();
    ctx.fillStyle = "#000000";
    ctx.fillRect(plotLeft, plotTop, plotSize, plotSize);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const sourceRow = rows - 1 - row;
        const t = clamp01((Number(matrix[sourceRow][col]) || 0) / colorMax);
        const gray = Math.round(255 * t);
        ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
        ctx.fillRect(plotLeft + col * cellWidth, plotTop + row * cellHeight, Math.ceil(cellWidth), Math.ceil(cellHeight));
      }
    }
    ctx.strokeStyle = theme.frame;
    ctx.lineWidth = 1;
    ctx.strokeRect(plotLeft, plotTop, plotSize, plotSize);
    ctx.strokeStyle = "rgba(244, 248, 251, 0.22)";
    ctx.beginPath();
    ctx.moveTo(plotLeft + plotSize / 2, plotTop);
    ctx.lineTo(plotLeft + plotSize / 2, plotBottom);
    ctx.moveTo(plotLeft, plotTop + plotSize / 2);
    ctx.lineTo(plotRight, plotTop + plotSize / 2);
    ctx.stroke();
    ctx.fillStyle = theme.text;
    ctx.strokeStyle = theme.frame;
    ctx.font = "12px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const stepX = frequencyTickStep(halfRangeX);
    const xLimit = Math.floor(halfRangeX / stepX) * stepX;
    for (let tick = -xLimit; tick <= xLimit + 1e-9; tick += stepX) {
      const x = mapRange(tick, -halfRangeX, halfRangeX, plotLeft, plotRight);
      ctx.beginPath();
      ctx.moveTo(x, plotBottom);
      ctx.lineTo(x, plotBottom + 5);
      ctx.stroke();
      ctx.fillText(formatFrequencyTick(tick), x, plotBottom + 10);
    }
    ctx.fillText("fcols [1/mm]", plotLeft + plotSize / 2, plotBottom + 42);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const stepY = frequencyTickStep(halfRangeY);
    const yLimit = Math.floor(halfRangeY / stepY) * stepY;
    for (let tick = -yLimit; tick <= yLimit + 1e-9; tick += stepY) {
      const y = mapRange(tick, -halfRangeY, halfRangeY, plotBottom, plotTop);
      ctx.beginPath();
      ctx.moveTo(plotLeft - 5, y);
      ctx.lineTo(plotLeft, y);
      ctx.stroke();
      ctx.fillText(formatFrequencyTick(tick), plotLeft - 10, y);
    }
    ctx.textAlign = "center";
    drawRotatedText(ctx, "frows [1/mm]", plotLeft - 52, plotTop + plotSize / 2, -Math.PI / 2, plotSize);
    const barLeft = plotRight + 24;
    const barTop = plotTop + 18;
    const barWidth = 22;
    const barHeight = Math.max(64, plotSize - 36);
    const gradient = ctx.createLinearGradient(0, barTop, 0, barTop + barHeight);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(1, "#000000");
    ctx.fillStyle = gradient;
    ctx.fillRect(barLeft, barTop, barWidth, barHeight);
    ctx.strokeStyle = theme.frame;
    ctx.strokeRect(barLeft, barTop, barWidth, barHeight);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(String(roundForDisplay(colorMax, colorMax >= 100 ? 0 : 2)), barLeft + barWidth + 9, barTop + 2);
    ctx.fillText(String(roundForDisplay(colorMax / 2, colorMax >= 100 ? 0 : 2)), barLeft + barWidth + 9, barTop + barHeight / 2);
    ctx.fillText("0", barLeft + barWidth + 9, barTop + barHeight - 2);
    ctx.fillStyle = theme.text;
    ctx.textAlign = "center";
    drawRotatedText(ctx, `NPS [${spec.npsUnits || analysis.npsUnits || "HU^2 mm^2"}]`, barLeft + barWidth + 62, barTop + barHeight / 2, -Math.PI / 2, barHeight);
    ctx.restore();
    return true;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function windowPixelToByte(value, center, width) {
    const ww = Math.max(1, Number(width) || 1);
    const wc = Number(center) || 0;
    const low = wc - ww / 2;
    const high = wc + ww / 2;
    if (value <= low) {
      return 0;
    }
    if (value >= high) {
      return 255;
    }
    return Math.round(((value - low) / (high - low)) * 255);
  }

  function drawSourceImage(ctx, volume, sliceIndex, viewport, target) {
    const slice = volume?.slices?.[sliceIndex];
    if (!slice) {
      return null;
    }
    const imageCanvas = document.createElement("canvas");
    imageCanvas.width = volume.columns;
    imageCanvas.height = volume.rows;
    const imageCtx = imageCanvas.getContext("2d");
    const imageData = imageCtx.createImageData(volume.columns, volume.rows);
    const wc = Number.isFinite(viewport?.windowCenter) ? viewport.windowCenter : slice.intercept + 40;
    const ww = Number.isFinite(viewport?.windowWidth) ? viewport.windowWidth : 400;
    for (let index = 0; index < slice.pixels.length; index += 1) {
      const hu = slice.pixels[index] * slice.slope + slice.intercept;
      const byte = windowPixelToByte(hu, wc, ww);
      const base = index * 4;
      imageData.data[base] = byte;
      imageData.data[base + 1] = byte;
      imageData.data[base + 2] = byte;
      imageData.data[base + 3] = 255;
    }
    imageCtx.putImageData(imageData, 0, 0);
    const scale = Math.min(target.width / volume.columns, target.height / volume.rows);
    const x = target.x + (target.width - volume.columns * scale) / 2;
    const y = target.y + (target.height - volume.rows * scale) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(imageCanvas, x, y, volume.columns * scale, volume.rows * scale);
    return { x, y, scale };
  }

  function drawOverlay(ctx, spec) {
    const width = spec.width || ctx.canvas.width;
    const height = spec.height || ctx.canvas.height;
    const volume = spec.dataset?.volume;
    if (!volume) {
      drawEmpty(ctx, "No image loaded", width, height);
      return false;
    }
    ctx.save();
    ctx.fillStyle = "#05080c";
    ctx.fillRect(0, 0, width, height);
    const frame = drawSourceImage(ctx, volume, spec.sliceIndex || 0, spec.viewport || {}, {
      x: 0,
      y: 0,
      width,
      height,
    });
    if (!frame) {
      ctx.restore();
      return false;
    }
    const imageX = (xImg) => frame.x + (xImg + 0.5) * frame.scale;
    const imageY = (yImg) => frame.y + (yImg + 0.5) * frame.scale;
    (spec.circles || []).forEach((circle) => {
      if (circle.datasetId !== spec.dataset.id || circle.sliceIndex !== spec.sliceIndex) {
        return;
      }
      ctx.strokeStyle = "#f0c572";
      ctx.lineWidth = 2;
      ctx.setLineDash?.([6, 5]);
      ctx.beginPath();
      ctx.arc(imageX(circle.centerXImg), imageY(circle.centerYImg), circle.radiusPx * frame.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash?.([]);
    });
    (spec.rois || []).forEach((roi) => {
      if (roi.datasetId !== spec.dataset.id || roi.sliceIndex !== spec.sliceIndex) {
        return;
      }
      const geometry = core.resolveSquareGeometry(roi, volume);
      if (!geometry) {
        return;
      }
      const left = imageX(geometry.xMinBoundaryImg);
      const top = imageY(geometry.yMinBoundaryImg);
      const right = imageX(geometry.xMaxBoundaryImg);
      const bottom = imageY(geometry.yMaxBoundaryImg);
      ctx.fillStyle = roi.type === NPS_ROI_TYPE ? "rgba(115, 214, 197, 0.12)" : "rgba(255, 211, 95, 0.12)";
      ctx.strokeStyle = roi.type === NPS_ROI_TYPE ? "#73d6c5" : "#ffd35f";
      ctx.lineWidth = 2;
      ctx.fillRect(left, top, right - left, bottom - top);
      ctx.strokeRect(left, top, right - left, bottom - top);
      ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
      ctx.fillRect(left + 4, Math.max(0, top - 22), 120, 18);
      ctx.fillStyle = "#fff8da";
      ctx.font = "11px Menlo, monospace";
      ctx.fillText(roi.label || roi.id, left + 8, Math.max(12, top - 9));
    });
    ctx.restore();
    return true;
  }

  function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    if (!words.length) {
      return y;
    }
    let line = "";
    let lines = 0;
    for (let index = 0; index < words.length; index += 1) {
      const testLine = line ? `${line} ${words[index]}` : words[index];
      if (ctx.measureText(testLine).width > maxWidth && line) {
        lines += 1;
        if (lines >= maxLines) {
          ctx.fillText(`${line.slice(0, Math.max(0, line.length - 3))}...`, x, y);
          return y + lineHeight;
        }
        ctx.fillText(line, x, y);
        y += lineHeight;
        line = words[index];
      } else {
        line = testLine;
      }
    }
    if (line && lines < maxLines) {
      ctx.fillText(line, x, y);
      y += lineHeight;
    }
    return y;
  }

  function metricValue(value, suffix = "", digits = 2) {
    if (value === null || value === undefined || value === "") {
      return "-";
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    return `${roundForDisplay(number, digits)}${suffix ? ` ${suffix}` : ""}`;
  }

  function overviewSliceIndex(dataset, rois, circles, fallbackSliceIndex = 0) {
    const depth = dataset?.volume?.depth || 1;
    const circle = (circles || []).find((entry) => entry.datasetId === dataset?.id);
    if (circle) {
      return Math.max(0, Math.min(depth - 1, circle.sliceIndex || 0));
    }
    const roi = (rois || []).find((entry) => entry.datasetId === dataset?.id);
    if (roi) {
      return Math.max(0, Math.min(depth - 1, roi.sliceIndex || 0));
    }
    return Math.max(0, Math.min(depth - 1, fallbackSliceIndex || 0));
  }

  function drawCompactOverlay(ctx, spec) {
    const volume = spec.dataset?.volume;
    if (!volume) {
      return false;
    }
    const target = spec.target;
    ctx.save();
    ctx.fillStyle = "#05080c";
    ctx.fillRect(target.x, target.y, target.width, target.height);
    const frame = drawSourceImage(ctx, volume, spec.sliceIndex || 0, spec.viewport || {}, target);
    if (!frame) {
      ctx.restore();
      return false;
    }
    const imageX = (xImg) => frame.x + (xImg + 0.5) * frame.scale;
    const imageY = (yImg) => frame.y + (yImg + 0.5) * frame.scale;
    (spec.circles || []).forEach((circle) => {
      if (circle.datasetId !== spec.dataset.id || circle.sliceIndex !== spec.sliceIndex) {
        return;
      }
      ctx.strokeStyle = "#f0c572";
      ctx.lineWidth = 1.6;
      ctx.setLineDash?.([5, 4]);
      ctx.beginPath();
      ctx.arc(imageX(circle.centerXImg), imageY(circle.centerYImg), circle.radiusPx * frame.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash?.([]);
    });
    (spec.rois || []).forEach((roi) => {
      if (roi.datasetId !== spec.dataset.id || roi.sliceIndex !== spec.sliceIndex) {
        return;
      }
      const geometry = core.resolveSquareGeometry(roi, volume);
      if (!geometry) {
        return;
      }
      const left = imageX(geometry.xMinBoundaryImg);
      const top = imageY(geometry.yMinBoundaryImg);
      const right = imageX(geometry.xMaxBoundaryImg);
      const bottom = imageY(geometry.yMaxBoundaryImg);
      ctx.fillStyle = roi.type === NPS_ROI_TYPE ? "rgba(115, 214, 197, 0.13)" : "rgba(255, 211, 95, 0.14)";
      ctx.strokeStyle = roi.type === NPS_ROI_TYPE ? "#73d6c5" : "#ffd35f";
      ctx.lineWidth = roi.type === NPS_ROI_TYPE ? 1 : 1.8;
      ctx.fillRect(left, top, right - left, bottom - top);
      ctx.strokeRect(left, top, right - left, bottom - top);
    });
    ctx.strokeStyle = "rgba(194, 213, 225, 0.28)";
    ctx.lineWidth = 1;
    ctx.strokeRect(target.x, target.y, target.width, target.height);
    ctx.restore();
    return true;
  }

  function overviewHeatmapColorMax(models) {
    const values = [];
    (models || []).forEach((model) => {
      const matrix = model?.analysis?.nps2d || [];
      matrix.forEach((row) => {
        (row || []).forEach((value) => {
          const number = Number(value);
          if (Number.isFinite(number) && number >= 0) {
            values.push(number);
          }
        });
      });
    });
    return Math.max(quantile(values, 0.995) || 0, Number.EPSILON);
  }

  function drawOverviewNpsHeatmap(ctx, analysis, target, sharedColorMax) {
    const matrix = analysis?.nps2d || [];
    ctx.save();
    ctx.fillStyle = "#05080c";
    ctx.fillRect(target.x, target.y, target.width, target.height);
    ctx.strokeStyle = "rgba(194, 213, 225, 0.28)";
    ctx.lineWidth = 1;
    ctx.strokeRect(target.x, target.y, target.width, target.height);
    ctx.fillStyle = "#f4f8fb";
    ctx.font = "800 11px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.fillText("2D NPS heatmap", target.x + 10, target.y + 16);
    if (!matrix.length || !matrix[0]?.length) {
      ctx.fillStyle = "#a8bac7";
      ctx.font = "10px 'SF Pro Text', 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No 2D NPS", target.x + target.width / 2, target.y + target.height / 2);
      ctx.restore();
      return false;
    }
    const rows = matrix.length;
    const cols = matrix[0].length;
    const frequencyStepX = Number(analysis.frequencyStepX) || 1;
    const frequencyStepY = Number(analysis.frequencyStepY) || frequencyStepX;
    const halfRangeX = (cols / 2) * frequencyStepX;
    const halfRangeY = (rows / 2) * frequencyStepY;
    const values = matrix.flat().filter((value) => Number.isFinite(value) && value >= 0);
    const colorMax = Math.max(Number(sharedColorMax) || quantile(values, 0.995) || Math.max(...values, 1), Number.EPSILON);
    const left = 26;
    const top = 30;
    const right = 42;
    const bottom = 28;
    const plotSize = Math.max(72, Math.min(target.width - left - right, target.height - top - bottom));
    const plotLeft = target.x + left + Math.max(0, target.width - left - right - plotSize) / 2;
    const plotTop = target.y + top + Math.max(0, target.height - top - bottom - plotSize) / 2;
    const cellWidth = plotSize / cols;
    const cellHeight = plotSize / rows;
    ctx.fillStyle = "#000";
    ctx.fillRect(plotLeft, plotTop, plotSize, plotSize);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const sourceRow = rows - 1 - row;
        const t = clamp01((Number(matrix[sourceRow][col]) || 0) / colorMax);
        const gray = Math.round(255 * t);
        ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
        ctx.fillRect(plotLeft + col * cellWidth, plotTop + row * cellHeight, Math.ceil(cellWidth), Math.ceil(cellHeight));
      }
    }
    ctx.strokeStyle = "rgba(244, 248, 251, 0.18)";
    ctx.beginPath();
    ctx.moveTo(plotLeft + plotSize / 2, plotTop);
    ctx.lineTo(plotLeft + plotSize / 2, plotTop + plotSize);
    ctx.moveTo(plotLeft, plotTop + plotSize / 2);
    ctx.lineTo(plotLeft + plotSize, plotTop + plotSize / 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(194, 213, 225, 0.34)";
    ctx.strokeRect(plotLeft, plotTop, plotSize, plotSize);
    ctx.fillStyle = "#a8bac7";
    ctx.font = "9px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`fcols +/-${roundForDisplay(halfRangeX, 2)} 1/mm`, plotLeft + plotSize / 2, plotTop + plotSize + 8);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`+${roundForDisplay(halfRangeY, 2)}`, plotLeft - 4, plotTop + 2);
    ctx.fillText("0", plotLeft - 4, plotTop + plotSize / 2);
    ctx.fillText(`-${roundForDisplay(halfRangeY, 2)}`, plotLeft - 4, plotTop + plotSize - 2);
    const barLeft = plotLeft + plotSize + 12;
    const barTop = plotTop + 12;
    const barWidth = 12;
    const barHeight = Math.max(54, plotSize - 24);
    const gradient = ctx.createLinearGradient(0, barTop, 0, barTop + barHeight);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(1, "#000000");
    ctx.fillStyle = gradient;
    ctx.fillRect(barLeft, barTop, barWidth, barHeight);
    ctx.strokeStyle = "rgba(194, 213, 225, 0.34)";
    ctx.strokeRect(barLeft, barTop, barWidth, barHeight);
    ctx.fillStyle = "#a8bac7";
    ctx.textAlign = "left";
    ctx.fillText(String(roundForDisplay(colorMax, colorMax >= 100 ? 0 : 1)), barLeft + barWidth + 5, barTop + 2);
    ctx.fillText("0", barLeft + barWidth + 5, barTop + barHeight - 2);
    ctx.restore();
    return true;
  }

  function drawReconstructionOverviewPanel(ctx, spec) {
    const datasets = spec.datasets || [];
    if (!datasets.length) {
      drawEmpty(ctx, "No reconstructions available", spec.width || ctx.canvas.width, spec.height || ctx.canvas.height);
      return false;
    }
    const width = spec.width || ctx.canvas.width;
    const height = spec.height || ctx.canvas.height;
    clearCanvas(ctx, width, height);
    ctx.save();
    ctx.fillStyle = "#f4f8fb";
    ctx.font = "800 24px 'SF Pro Display', 'Segoe UI', sans-serif";
    ctx.fillText("HAGRad Noise Power - all reconstructions ROI summary", 28, 34);
    ctx.font = "12px 'SF Pro Text', 'Segoe UI', sans-serif";
    ctx.fillStyle = "#a8bac7";
    const subtitle = [
      spec.researchStudyId ? `Research: ${spec.researchStudyId}` : "",
      spec.patientStudyId ? `Patient/Study: ${spec.patientStudyId}` : "",
      `${datasets.length} reconstruction${datasets.length === 1 ? "" : "s"}`,
    ].filter(Boolean).join("   |   ");
    ctx.fillText(subtitle, 28, 58);
    ctx.restore();

    const cardWidth = spec.cardWidth || 760;
    const cardHeight = spec.cardHeight || 430;
    const margin = 24;
    const columns = Math.max(1, Math.floor((width - margin) / (cardWidth + margin)));
    const npsByDataset = new Map((spec.npsModels || []).map((model) => [model.dataset?.id, model]));
    const sharedHeatmapColorMax = Number(spec.heatmapColorMax) || overviewHeatmapColorMax(spec.npsModels || []);
    const ttfByDataset = new Map();
    (spec.rois || []).filter((roi) => roi.type === ROI_TYPE).forEach((roi) => {
      if (!ttfByDataset.has(roi.datasetId)) {
        ttfByDataset.set(roi.datasetId, roi);
      }
    });

    datasets.forEach((dataset, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = margin + column * (cardWidth + margin);
      const y = 88 + row * (cardHeight + margin);
      const sliceIndex = overviewSliceIndex(dataset, spec.rois, spec.circles, spec.activeSliceIndex);
      const datasetRois = (spec.rois || []).filter((roi) => roi.datasetId === dataset.id);
      const datasetCircles = (spec.circles || []).filter((circle) => circle.datasetId === dataset.id);
      const npsModel = npsByDataset.get(dataset.id);
      const ttfRoi = ttfByDataset.get(dataset.id);
      const ttfExtraction = ttfRoi && dataset.volume ? extractSquareRoiPixels(dataset.volume, ttfRoi.sliceIndex, ttfRoi) : null;
      const meta = dataset.meta || {};
      const seriesNumber = seriesNumberForDataset(dataset);
      const header = `${index + 1}. ${seriesNumber ? `S${seriesNumber} - ` : ""}${datasetLabel(dataset, index)}`;

      ctx.save();
      ctx.fillStyle = "#0d1620";
      ctx.strokeStyle = "rgba(194, 213, 225, 0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect?.(x, y, cardWidth, cardHeight, 14);
      if (!ctx.roundRect) {
        ctx.rect(x, y, cardWidth, cardHeight);
      }
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f4f8fb";
      ctx.font = "800 15px 'SF Pro Text', 'Segoe UI', sans-serif";
      ctx.fillText(truncateCanvasText(ctx, header, cardWidth - 32), x + 16, y + 18);
      ctx.fillStyle = "#a8bac7";
      ctx.font = "11px 'SF Pro Text', 'Segoe UI', sans-serif";
      ctx.fillText(
        truncateCanvasText(ctx, `slice ${sliceIndex + 1} | spacing ${metricValue(dataset.volume?.columnSpacing, "mm", 4)} x ${metricValue(dataset.volume?.rowSpacing, "mm", 4)} | kernel ${meta.convolutionKernel || "-"}`, cardWidth - 32),
        x + 16,
        y + 38
      );
      drawCompactOverlay(ctx, {
        dataset,
        sliceIndex,
        viewport: spec.viewport || {},
        rois: datasetRois,
        circles: datasetCircles,
        target: { x: x + 16, y: y + 64, width: 300, height: 300 },
      });
      drawOverviewNpsHeatmap(ctx, npsModel?.analysis, { x: x + 332, y: y + 64, width: 260, height: 300 }, sharedHeatmapColorMax);
      const metricX = x + 612;
      let metricY = y + 78;
      ctx.font = "800 12px 'SF Pro Text', 'Segoe UI', sans-serif";
      ctx.fillStyle = "#f0c572";
      ctx.fillText("Main findings", metricX, metricY);
      metricY += 24;
      ctx.font = "12px 'SF Pro Text', 'Segoe UI', sans-serif";
      ctx.fillStyle = "#dce7ee";
      const nps = npsModel?.analysis;
      const npsLines = nps
        ? [
            `NPS set: ${nps.circleCount || 1} circle${(nps.circleCount || 1) === 1 ? "" : "s"}, ${nps.validRoiCount}/${nps.sourceRoiCount || nps.validRoiCount} valid squares`,
            `std ${metricValue(Math.sqrt(nps.meanRoiVariance), nps.units || "HU", 2)} | var ${metricValue(nps.meanRoiVariance, "HU^2", 1)}`,
            `fP ${metricValue(nps.peakFrequency, "mm^-1", 4)} | fA ${metricValue(nps.averageFrequency, "mm^-1", 4)}`,
            `f50 ${metricValue(nps.f50Frequency, "mm^-1", 4)} | integrated ${metricValue(nps.integratedNps, "HU^2 mm^2", 1)}`,
          ]
        : ["NPS set: not available for this reconstruction"];
      npsLines.forEach((line) => {
        ctx.fillText(line, metricX, metricY);
        metricY += 18;
      });
      metricY += 8;
      const ttf = ttfExtraction?.ttfAnalysis;
      const stats = ttfExtraction?.statsCalibrated || {};
      const ttfLines = ttfRoi
        ? [
            `TTF square: ${ttfRoi.label || ttfRoi.id}`,
            `mean ${metricValue(stats.mean, ttfExtraction?.units || "HU", 2)} | SD ${metricValue(stats.sd, ttfExtraction?.units || "HU", 2)}`,
            ttf?.valid
              ? `TTF f50 ${metricValue(ttf.f50Frequency, "mm^-1", 4)} | CNR ${metricValue(ttf.cnr, "", 2)}`
              : `TTF: ${ttf?.error || "not valid for this square"}`,
          ]
        : ["TTF square: not available for this reconstruction"];
      ttfLines.forEach((line) => {
        ctx.fillText(line, metricX, metricY);
        metricY += 18;
      });
      metricY += 8;
      ctx.fillStyle = "#a8bac7";
      ctx.font = "11px 'SF Pro Text', 'Segoe UI', sans-serif";
      const warningCount = (nps?.warnings?.length || 0) + (ttf?.warnings?.length || 0);
      const metricWidth = cardWidth - (metricX - x) - 16;
      const objectText = `${datasetCircles.length} circle${datasetCircles.length === 1 ? "" : "s"}, ${datasetRois.filter((roi) => roi.type === NPS_ROI_TYPE).length} NPS squares, ${datasetRois.filter((roi) => roi.type === ROI_TYPE).length} TTF square${datasetRois.filter((roi) => roi.type === ROI_TYPE).length === 1 ? "" : "s"}`;
      metricY = drawWrappedText(ctx, objectText, metricX, metricY, metricWidth, 16, 2);
      ctx.fillStyle = warningCount ? "#ffe0b8" : "#a8bac7";
      drawWrappedText(ctx, warningCount ? `${warningCount} warning label(s); inspect workbook for details.` : "No NPS/TTF warning labels reported.", metricX, metricY + 4, metricWidth, 16, 2);
      ctx.restore();
    });
    return true;
  }

  async function canvasToBlob(canvas) {
    if (typeof zipApi.canvasToPngBlob === "function") {
      return zipApi.canvasToPngBlob(canvas);
    }
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed."))), "image/png", 1);
    });
  }

  async function createCanvasFile(name, width, height, draw, pixelRatio = 2) {
    const ratio = Math.max(1, Number(pixelRatio) || 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    const ok = draw(ctx, { width, height });
    if (!ok) {
      drawEmpty(ctx, "No data available", width, height);
    }
    const blob = await canvasToBlob(canvas);
    return { filename: name, name, mimeType: "image/png", blob };
  }

  function createCanvasDataUrl(width, height, draw, pixelRatio = 2) {
    const ratio = Math.max(1, Number(pixelRatio) || 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    const ok = draw(ctx, { width, height });
    if (!ok) {
      drawEmpty(ctx, "No data available", width, height);
    }
    return canvas.toDataURL("image/png", 1);
  }

  function npsSeriesFromModels(models, valueField) {
    return (models || []).map((model, index) => ({
      label: datasetLabel(model.dataset, model.datasetIndex),
      color: palette[index % palette.length],
      points: (model.analysis.radialBins || []).map((bin) => ({
        x: bin.frequencyCenter,
        y: bin[valueField],
      })),
    }));
  }

  function seriesNumberForDataset(dataset) {
    const value = Number(dataset?.meta?.seriesNumber);
    return Number.isFinite(value) ? String(value) : "";
  }

  function seriesTokenForDataset(dataset, fallback = "series") {
    const seriesNumber = seriesNumberForDataset(dataset);
    if (seriesNumber) {
      return `s${sanitizeFilePart(seriesNumber, fallback)}`;
    }
    return sanitizeFilePart(datasetLabel(dataset, 0), fallback);
  }

  function seriesTokenForModels(models, fallback = "series_all") {
    const tokens = [];
    (models || []).forEach((model) => {
      const token = seriesTokenForDataset(model.dataset, "");
      if (token && !tokens.includes(token)) {
        tokens.push(token);
      }
    });
    return tokens.length ? `series_${tokens.join("-").slice(0, 80)}` : fallback;
  }

  function seriesTokenForDatasets(datasets, fallback = "series_all") {
    const tokens = [];
    (datasets || []).forEach((dataset) => {
      const token = seriesTokenForDataset(dataset, "");
      if (token && !tokens.includes(token)) {
        tokens.push(token);
      }
    });
    return tokens.length ? `series_${tokens.join("-").slice(0, 80)}` : fallback;
  }

  function namedFigure(baseName, token) {
    return `${sanitizeFilePart(token, "series")}_${baseName}`;
  }

  async function createNoisePowerPngFiles(options) {
    const files = [];
    const datasets = options.datasets || [];
    const activeDataset =
      datasets.find((dataset) => dataset.id === options.activeDatasetId) ||
      datasets[0] ||
      null;
    const overviewColumns = datasets.length > 1 ? 2 : 1;
    const overviewCardWidth = 1040;
    const overviewCardHeight = 430;
    const overviewMargin = 24;
    const overviewRows = Math.max(1, Math.ceil(datasets.length / overviewColumns));
    const overviewWidth = overviewMargin + overviewColumns * (overviewCardWidth + overviewMargin);
    const overviewHeight = 108 + overviewRows * (overviewCardHeight + overviewMargin);
    if (datasets.length) {
      files.push(
        await createCanvasFile(
          namedFigure("all_reconstructions_roi_summary_panel.png", seriesTokenForDatasets(datasets)),
          overviewWidth,
          overviewHeight,
          (ctx, size) =>
            drawReconstructionOverviewPanel(ctx, {
              width: size.width,
              height: size.height,
              cardWidth: overviewCardWidth,
              cardHeight: overviewCardHeight,
              datasets,
              rois: options.rois || [],
              circles: options.circles || [],
              npsModels: options.npsModels || [],
              activeSliceIndex: options.activeSliceIndex || 0,
              viewport: options.viewport || {},
              researchStudyId: options.researchStudyId || "",
              patientStudyId: options.patientStudyId || "",
            })
        )
      );
    }
    if (activeDataset) {
      files.push(
        await createCanvasFile(namedFigure("roi_overlay_image.png", seriesTokenForDataset(activeDataset, "active_series")), 960, 760, (ctx, size) =>
          drawOverlay(ctx, {
            width: size.width,
            height: size.height,
            dataset: activeDataset,
            sliceIndex: options.activeSliceIndex || 0,
            viewport: options.viewport || {},
            rois: options.rois || [],
            circles: options.circles || [],
          })
        )
      );
    }

    const selectedRoi =
      (options.rois || []).find((roi) => roi.id === options.selectedObjectId && roi.type === ROI_TYPE) ||
      (options.rois || []).find((roi) => roi.type === ROI_TYPE);
    if (selectedRoi) {
      const dataset = datasets.find((entry) => entry.id === selectedRoi.datasetId);
      const roiSeriesToken = seriesTokenForDataset(dataset, "roi_series");
      const extraction = dataset?.volume ? extractSquareRoiPixels(dataset.volume, selectedRoi.sliceIndex, selectedRoi) : null;
      const visualization = extraction && !extraction.error ? buildProfileAnalysis(extraction, { histogramBins: 32 }) : null;
      const profile = visualization?.profilesByType?.["horizontal-center"] || visualization?.profiles?.[0];
      files.push(
        await createCanvasFile(namedFigure("square_roi_profile_figure.png", roiSeriesToken), 980, 420, (ctx, size) =>
          drawProfile(ctx, {
            width: size.width,
            height: size.height,
            title: `${selectedRoi.label} center profile`,
            profile,
          })
        )
      );
      files.push(
        await createCanvasFile(namedFigure("square_roi_histogram_figure.png", roiSeriesToken), 980, 360, (ctx, size) =>
          drawHistogram(ctx, {
            width: size.width,
            height: size.height,
            title: `${selectedRoi.label} histogram`,
            bins: visualization?.histogram || [],
            xLabel: extraction?.units ? `Value (${extraction.units})` : "Value",
          })
        )
      );
      if (extraction?.ttfAnalysis?.valid) {
        files.push(
          await createCanvasFile(namedFigure("ttfxy_edge_response.png", roiSeriesToken), 980, 360, (ctx, size) =>
            drawLineSeries(ctx, {
              width: size.width,
              height: size.height,
              title: `${selectedRoi.label} TTFxy edge response`,
              xLabel: "Distance from edge (mm)",
              yLabel: "Normalized ESF",
              series: [
                {
                  label: selectedRoi.label,
                  color: palette[0],
                  points: extraction.ttfAnalysis.esf.map((point) => ({ x: point.distanceMm, y: point.normalizedValue })),
                },
              ],
            })
          )
        );
        files.push(
          await createCanvasFile(namedFigure("ttfxy_curve.png", roiSeriesToken), 980, 420, (ctx, size) =>
            drawLineSeries(ctx, {
              width: size.width,
              height: size.height,
              title: `${selectedRoi.label} TTFxy`,
              xLabel: "Radial spatial frequency (mm^-1)",
              yLabel: "TTF",
              series: [
                {
                  label: selectedRoi.label,
                  color: palette[0],
                  points: extraction.ttfAnalysis.ttf.map((point) => ({ x: point.frequencyMmMinus1, y: point.ttf })),
                },
              ],
            })
          )
        );
      }
    }

    const models = options.npsModels || [];
    const firstModel = models[0] || null;
    const firstModelToken = seriesTokenForDataset(firstModel?.dataset, "nps_series");
    const modelSetToken = seriesTokenForModels(models);
    files.push(
      await createCanvasFile(namedFigure("nps_2d_heatmap.png", firstModelToken), 680, 680, (ctx, size) =>
        drawNpsHeatmap(ctx, {
          width: size.width,
          height: size.height,
          title: firstModel ? `${firstModel.circle.label} 2D NPS` : "2D NPS",
          analysis: firstModel?.analysis,
        })
      )
    );
    files.push(
      await createCanvasFile(namedFigure("nps_1d_comparison_plot.png", modelSetToken), 980, 420, (ctx, size) =>
        drawLineSeries(ctx, {
          width: size.width,
          height: size.height,
          title: "Absolute radial NPS comparison",
          yLabel: firstModel?.analysis?.npsUnits || "NPS",
          series: npsSeriesFromModels(models, "nps"),
        })
      )
    );
    files.push(
      await createCanvasFile(namedFigure("normalized_nps_comparison_plot.png", modelSetToken), 980, 420, (ctx, size) =>
        drawLineSeries(ctx, {
          width: size.width,
          height: size.height,
          title: "Normalized NPS comparison",
          yLabel: "Normalized NPS",
          series: npsSeriesFromModels(models, "normalizedNps"),
        })
      )
    );
    files.push(
      await createCanvasFile(namedFigure("cumulative_noise_power_comparison_plot.png", modelSetToken), 980, 420, (ctx, size) =>
        drawLineSeries(ctx, {
          width: size.width,
          height: size.height,
          title: "Cumulative noise power comparison",
          yLabel: "Cumulative fraction",
          series: npsSeriesFromModels(models, "cumulativeFraction"),
        })
      )
    );
    files.push(
      await createCanvasFile(namedFigure("combined_manuscript_ready_panel.png", modelSetToken), 1200, 760, (ctx, size) => {
        clearCanvas(ctx, size.width, size.height);
        drawTitle(ctx, "HAGRad Noise Power summary", size.width);
        function panel(width, height, draw) {
          const panelRatio = 2;
          const canvas = document.createElement("canvas");
          canvas.width = width * panelRatio;
          canvas.height = height * panelRatio;
          const panelCtx = canvas.getContext("2d");
          panelCtx.scale(panelRatio, panelRatio);
          draw(panelCtx, { width, height });
          return canvas;
        }
        ctx.drawImage(
          panel(560, 320, (panelCtx, panelSize) =>
            drawNpsHeatmap(panelCtx, {
              width: panelSize.width,
              height: panelSize.height,
              title: "2D NPS",
              analysis: firstModel?.analysis,
            })
          ),
          20,
          48,
          560,
          320
        );
        ctx.drawImage(
          panel(580, 300, (panelCtx, panelSize) =>
            drawLineSeries(panelCtx, {
              width: panelSize.width,
              height: panelSize.height,
              title: "Absolute radial NPS",
              yLabel: firstModel?.analysis?.npsUnits || "NPS",
              series: npsSeriesFromModels(models, "nps"),
            })
          ),
          600,
          48,
          580,
          300
        );
        ctx.drawImage(
          panel(560, 280, (panelCtx, panelSize) =>
            drawLineSeries(panelCtx, {
              width: panelSize.width,
              height: panelSize.height,
              title: "Normalized NPS",
              yLabel: "Normalized",
              series: npsSeriesFromModels(models, "normalizedNps"),
            })
          ),
          20,
          410,
          560,
          280
        );
        ctx.drawImage(
          panel(580, 280, (panelCtx, panelSize) =>
            drawLineSeries(panelCtx, {
              width: panelSize.width,
              height: panelSize.height,
              title: "Cumulative noise power",
              yLabel: "Fraction",
              series: npsSeriesFromModels(models, "cumulativeFraction"),
            })
          ),
          600,
          410,
          580,
          280
        );
        return true;
      })
    );
    return files;
  }

  global.HAGRadNoisePowerExport = Object.freeze({
    drawEmpty,
    drawHistogram,
    drawProfile,
    drawNpsHeatmap,
    drawLineSeries,
    drawOverlay,
    drawReconstructionOverviewPanel,
    createCanvasFile,
    createCanvasDataUrl,
    createNoisePowerPngFiles,
    npsSeriesFromModels,
  });
})(typeof window !== "undefined" ? window : globalThis);
