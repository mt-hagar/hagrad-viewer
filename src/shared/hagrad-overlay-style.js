(function () {
  "use strict";

  const COLORS = {
    measurement: "#f2c86f",
    probe: "#57c8ff",
    roi: "#57c8ff",
    stent: "#7af4a8",
    plaqueCalcified: "#ff7f6e",
    plaqueNoncalcified: "#66d9d0",
    text: "#ffd27f",
    arrow: "#ff8f85",
    selected: "#f7fbff",
    hover: "#ffd27f",
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function withAlpha(color, alpha) {
    if (!color || !color.startsWith("#") || color.length !== 7) {
      return color;
    }
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function roundRect(ctx, x, y, width, height, radius) {
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, width, height, radius);
      return;
    }
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
  }

  function layoutLabel(ctx, text, anchorX, anchorY, options = {}) {
    const offsetX = Number(options.offsetX) || 0;
    const offsetY = Number(options.offsetY) || 0;
    const font = options.font || "700 12px Aptos, Segoe UI, sans-serif";
    const paddingX = options.paddingX ?? 10;
    const height = options.height ?? 24;
    const canvasWidth = options.viewportWidth || ctx.canvas?.width || 0;
    const canvasHeight = options.viewportHeight || ctx.canvas?.height || 0;

    ctx.save();
    ctx.font = font;
    const textWidth = ctx.measureText(text).width;
    ctx.restore();

    const width = Math.max(options.minWidth || 0, textWidth + paddingX * 2 + 4);
    let x = anchorX + 12 + offsetX;
    let y = anchorY - height - 12 + offsetY;

    if (canvasWidth > 0) {
      x = clamp(x, 8, Math.max(8, canvasWidth - width - 8));
    }
    if (canvasHeight > 0) {
      y = clamp(y, 8, Math.max(8, canvasHeight - height - 8));
    }

    return {
      x,
      y,
      width,
      height,
      font,
      paddingX,
      anchorX,
      anchorY,
      offsetX,
      offsetY,
    };
  }

  function drawLabel(ctx, text, anchorX, anchorY, color, options = {}) {
    const accent = color || COLORS.measurement;
    const bounds = layoutLabel(ctx, text, anchorX, anchorY, options);
    const leaderTargetX = bounds.x + Math.min(bounds.width - 10, Math.max(10, bounds.width * 0.18));
    const leaderTargetY = bounds.y + bounds.height;

    ctx.save();
    if (options.leader !== false) {
      ctx.strokeStyle = withAlpha(accent, options.leaderAlpha ?? 0.62);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(anchorX, anchorY);
      ctx.lineTo(leaderTargetX, leaderTargetY);
      ctx.stroke();
    }

    ctx.shadowColor = "rgba(0, 0, 0, 0.36)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    roundRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 7);
    ctx.fillStyle = options.background || "rgba(8, 15, 21, 0.84)";
    ctx.fill();
    ctx.shadowColor = "transparent";

    ctx.strokeStyle = withAlpha(accent, options.selected ? 0.92 : 0.56);
    ctx.lineWidth = options.selected ? 1.8 : 1.2;
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.beginPath();
    roundRect(ctx, bounds.x + 4, bounds.y + 5, 4, bounds.height - 10, 2);
    ctx.fill();

    ctx.font = bounds.font;
    ctx.textBaseline = "middle";
    ctx.fillStyle = options.textColor || "rgba(247, 251, 255, 0.96)";
    ctx.fillText(text, bounds.x + bounds.paddingX + 4, bounds.y + bounds.height / 2 + 0.5);
    ctx.restore();

    return bounds;
  }

  function drawLine(ctx, start, end, color, options = {}) {
    const accent = color || COLORS.measurement;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (options.dashed) {
      ctx.setLineDash(options.dash || [7, 5]);
    }
    ctx.strokeStyle = options.halo || "rgba(0, 0, 0, 0.62)";
    ctx.lineWidth = (options.width || 2.4) + 3.4;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = options.width || 2.4;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawPolygon(ctx, points, color, options = {}) {
    if (!Array.isArray(points) || points.length < 2) {
      return;
    }
    const accent = color || COLORS.roi;
    ctx.save();
    ctx.lineJoin = "round";
    if (options.dashed) {
      ctx.setLineDash(options.dash || [7, 5]);
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    if (options.closed !== false) {
      ctx.closePath();
    }
    if (options.fillAlpha !== 0) {
      ctx.fillStyle = options.fill || withAlpha(accent, options.fillAlpha ?? 0.12);
      ctx.fill();
    }
    ctx.strokeStyle = options.halo || "rgba(0, 0, 0, 0.62)";
    ctx.lineWidth = (options.width || 2) + 3.2;
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = options.width || 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawHandle(ctx, point, options = {}) {
    const radius = options.radius ?? 5.5;
    const accent = options.color || COLORS.selected;
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "rgba(247, 251, 255, 0.98)";
    ctx.strokeStyle = options.ring || accent;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(5, 10, 14, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(1.5, radius - 2.8), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawArrow(ctx, from, to, color, options = {}) {
    const accent = color || COLORS.arrow;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const headLength = options.headLength || 15;
    drawLine(ctx, from, to, accent, { width: options.width || 2.4 });
    ctx.save();
    ctx.fillStyle = accent;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headLength * Math.cos(angle - Math.PI / 6), to.y - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(to.x - headLength * Math.cos(angle + Math.PI / 6), to.y - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  function drawMprLine(ctx, start, end, color) {
    drawLine(ctx, start, end, color, { width: 1.9, halo: "rgba(0, 0, 0, 0.72)" });
  }

  function drawMprCenter(ctx, center) {
    ctx.save();
    ctx.fillStyle = "rgba(247, 251, 255, 0.96)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.76)";
    ctx.lineWidth = 2.4;
    ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(247, 251, 255, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  window.HAGRadOverlayStyle = {
    COLORS,
    withAlpha,
    layoutLabel,
    drawLabel,
    drawLine,
    drawPolygon,
    drawHandle,
    drawArrow,
    drawMprLine,
    drawMprCenter,
  };
})();
