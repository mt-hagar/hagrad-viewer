(function (global) {
  "use strict";

  const sharedCore = global.HAGRadCore;
  if (!sharedCore) {
    throw new Error("Missing shared core script: /src/shared/hagrad-core.js");
  }

  const { clamp } = sharedCore;

  function averageFinite(values) {
    let sum = 0;
    let count = 0;
    values.forEach((value) => {
      if (Number.isFinite(value)) {
        sum += value;
        count += 1;
      }
    });
    return count ? sum / count : null;
  }

  function computeKurtosis(values) {
    const finite = (values || []).filter(Number.isFinite);
    if (finite.length < 4) {
      return null;
    }
    const mean = averageFinite(finite);
    if (!Number.isFinite(mean)) {
      return null;
    }
    let secondMoment = 0;
    let fourthMoment = 0;
    finite.forEach((value) => {
      const centered = value - mean;
      const centeredSquared = centered * centered;
      secondMoment += centeredSquared;
      fourthMoment += centeredSquared * centeredSquared;
    });
    secondMoment /= finite.length;
    fourthMoment /= finite.length;
    if (!Number.isFinite(secondMoment) || secondMoment <= 0 || !Number.isFinite(fourthMoment)) {
      return null;
    }
    return fourthMoment / (secondMoment * secondMoment);
  }

  function smoothSeries(values, radius) {
    const smoothed = [];
    for (let index = 0; index < values.length; index += 1) {
      const samples = [];
      for (let offset = -radius; offset <= radius; offset += 1) {
        const value = values[index + offset];
        if (Number.isFinite(value)) {
          samples.push(value);
        }
      }
      smoothed.push(samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : Number.NaN);
    }
    return smoothed;
  }

  function interpolateThresholdCrossing(x0, y0, x1, y1, threshold) {
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
      return null;
    }
    if (y1 === y0) {
      return (x0 + x1) / 2;
    }
    const t = (threshold - y0) / (y1 - y0);
    return x0 + (x1 - x0) * t;
  }

  function findFirstThresholdCrossing(distancesMm, values, threshold, startIndex, endIndex) {
    const start = clamp(startIndex, 0, Math.max(0, values.length - 2));
    const end = clamp(endIndex, 1, values.length - 1);
    for (let index = start; index < end; index += 1) {
      const left = values[index];
      const right = values[index + 1];
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        continue;
      }
      if ((left <= threshold && right >= threshold) || (left >= threshold && right <= threshold)) {
        return {
          index,
          distanceMm: interpolateThresholdCrossing(distancesMm[index], left, distancesMm[index + 1], right, threshold),
        };
      }
    }
    return null;
  }

  function buildDerivativeProfile(distancesMm, values) {
    const derivativeDistancesMm = [];
    const derivativeHuPerMm = [];
    for (let index = 0; index < values.length - 1; index += 1) {
      const left = values[index];
      const right = values[index + 1];
      const deltaMm = distancesMm[index + 1] - distancesMm[index];
      if (!Number.isFinite(left) || !Number.isFinite(right) || deltaMm <= 0) {
        continue;
      }
      derivativeDistancesMm.push((distancesMm[index] + distancesMm[index + 1]) / 2);
      derivativeHuPerMm.push((right - left) / deltaMm);
    }
    return {
      derivativeDistancesMm,
      derivativeHuPerMm,
      derivativeAbs: derivativeHuPerMm.map((value) => Math.abs(value)),
    };
  }

  function pickStrongestEdgePeaks(valuesAbs) {
    const candidates = [];
    for (let index = 1; index < valuesAbs.length - 1; index += 1) {
      const current = valuesAbs[index];
      if (!Number.isFinite(current) || current <= 0) {
        continue;
      }
      if (current >= valuesAbs[index - 1] && current >= valuesAbs[index + 1]) {
        candidates.push(index);
      }
    }

    if (!candidates.length) {
      for (let index = 0; index < valuesAbs.length; index += 1) {
        if (Number.isFinite(valuesAbs[index]) && valuesAbs[index] > 0) {
          candidates.push(index);
        }
      }
    }

    const minSeparation = Math.max(5, Math.round(valuesAbs.length * 0.08));
    const selected = [];
    candidates
      .sort((left, right) => valuesAbs[right] - valuesAbs[left])
      .forEach((index) => {
        if (selected.some((existing) => Math.abs(existing - index) < minSeparation)) {
          return;
        }
        selected.push(index);
      });

    return selected.slice(0, 2).sort((left, right) => left - right);
  }

  function pickStrongestProfilePeaks(values) {
    const candidates = [];
    for (let index = 1; index < values.length - 1; index += 1) {
      const current = values[index];
      if (!Number.isFinite(current)) {
        continue;
      }
      if (current >= values[index - 1] && current >= values[index + 1]) {
        candidates.push(index);
      }
    }

    if (!candidates.length) {
      for (let index = 0; index < values.length; index += 1) {
        if (Number.isFinite(values[index])) {
          candidates.push(index);
        }
      }
    }

    const minSeparation = Math.max(6, Math.round(values.length * 0.12));
    const selected = [];
    candidates
      .sort((left, right) => values[right] - values[left])
      .forEach((index) => {
        if (selected.some((existing) => Math.abs(existing - index) < minSeparation)) {
          return;
        }
        selected.push(index);
      });

    return selected.slice(0, 2).sort((left, right) => left - right);
  }

  function findMinValueIndex(values, startIndex, endIndex) {
    const start = clamp(Math.min(startIndex, endIndex), 0, Math.max(0, values.length - 1));
    const end = clamp(Math.max(startIndex, endIndex), 0, Math.max(0, values.length - 1));
    let bestIndex = null;
    let bestValue = Number.POSITIVE_INFINITY;
    for (let index = start; index <= end; index += 1) {
      const value = values[index];
      if (!Number.isFinite(value)) {
        continue;
      }
      if (value < bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function findMaxValueIndex(values, startIndex, endIndex) {
    const start = clamp(Math.min(startIndex, endIndex), 0, Math.max(0, values.length - 1));
    const end = clamp(Math.max(startIndex, endIndex), 0, Math.max(0, values.length - 1));
    let bestIndex = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (let index = start; index <= end; index += 1) {
      const value = values[index];
      if (!Number.isFinite(value)) {
        continue;
      }
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function averageWindow(values, centerIndex, radius) {
    if (!Number.isInteger(centerIndex) || centerIndex < 0 || centerIndex >= values.length) {
      return null;
    }

    const start = Math.max(0, centerIndex - radius);
    const end = Math.min(values.length - 1, centerIndex + radius);
    return averageFinite(values.slice(start, end + 1));
  }

  function findNearestFiniteIndex(values, preferredIndex) {
    const direct = clamp(preferredIndex, 0, Math.max(0, values.length - 1));
    if (Number.isFinite(values[direct])) {
      return direct;
    }
    for (let offset = 1; offset < values.length; offset += 1) {
      const lower = direct - offset;
      const upper = direct + offset;
      if (lower >= 0 && Number.isFinite(values[lower])) {
        return lower;
      }
      if (upper < values.length && Number.isFinite(values[upper])) {
        return upper;
      }
    }
    return direct;
  }

  function sanitizeStentGuideIndices(length, preferred, fallback) {
    if (length < 5) {
      return null;
    }

    const source = preferred || fallback;
    if (!source) {
      return null;
    }

    const maxStart = Math.max(0, length - 5);
    const leftOutsideIndex = clamp(
      Math.round(source.leftOutsideIndex ?? fallback.leftOutsideIndex),
      0,
      maxStart
    );
    const leftPeakIndex = clamp(
      Math.round(source.leftPeakIndex ?? fallback.leftPeakIndex),
      leftOutsideIndex + 1,
      Math.max(leftOutsideIndex + 1, length - 4)
    );
    const lumenMinIndex = clamp(
      Math.round(source.lumenMinIndex ?? fallback.lumenMinIndex),
      leftPeakIndex + 1,
      Math.max(leftPeakIndex + 1, length - 3)
    );
    const rightPeakIndex = clamp(
      Math.round(source.rightPeakIndex ?? fallback.rightPeakIndex),
      lumenMinIndex + 1,
      Math.max(lumenMinIndex + 1, length - 2)
    );
    const rightOutsideIndex = clamp(
      Math.round(source.rightOutsideIndex ?? fallback.rightOutsideIndex),
      rightPeakIndex + 1,
      length - 1
    );

    return {
      leftOutsideIndex,
      leftPeakIndex,
      lumenMinIndex,
      rightPeakIndex,
      rightOutsideIndex,
    };
  }

  function findThresholdCrossingForward(distancesMm, values, threshold, startIndex, endIndex) {
    const start = clamp(startIndex, 0, Math.max(0, values.length - 2));
    const end = clamp(endIndex, 1, values.length - 1);
    for (let index = start; index < end; index += 1) {
      const left = values[index];
      const right = values[index + 1];
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        continue;
      }
      if ((left <= threshold && right >= threshold) || (left >= threshold && right <= threshold)) {
        return {
          index,
          distanceMm: interpolateThresholdCrossing(distancesMm[index], left, distancesMm[index + 1], right, threshold),
        };
      }
    }
    return null;
  }

  function findThresholdCrossingBackward(distancesMm, values, threshold, startIndex, endIndex) {
    const start = clamp(startIndex, 1, Math.max(1, values.length - 1));
    const end = clamp(endIndex, 0, Math.max(0, values.length - 2));
    for (let index = start; index > end; index -= 1) {
      const left = values[index - 1];
      const right = values[index];
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        continue;
      }
      if ((left <= threshold && right >= threshold) || (left >= threshold && right <= threshold)) {
        return {
          index: index - 1,
          distanceMm: interpolateThresholdCrossing(distancesMm[index - 1], left, distancesMm[index], right, threshold),
        };
      }
    }
    return null;
  }

  function buildOrderedSegment(distancesMm, valuesHu, startIndex, endIndex) {
    const distances = [];
    const values = [];
    if (startIndex <= endIndex) {
      for (let index = startIndex; index <= endIndex; index += 1) {
        distances.push(distancesMm[index]);
        values.push(valuesHu[index]);
      }
    } else {
      for (let index = startIndex; index >= endIndex; index -= 1) {
        distances.push(distancesMm[index]);
        values.push(valuesHu[index]);
      }
    }
    return { distances, values };
  }

  function analyzeEdgeSegment(distancesMm, valuesHu, baseHu, peakHu) {
    if (!Number.isFinite(baseHu) || !Number.isFinite(peakHu) || peakHu <= baseHu || valuesHu.length < 2) {
      return null;
    }

    const amplitudeHu = peakHu - baseHu;
    if (amplitudeHu < 5) {
      return null;
    }

    const threshold10Hu = baseHu + amplitudeHu * 0.1;
    const threshold50Hu = baseHu + amplitudeHu * 0.5;
    const threshold90Hu = baseHu + amplitudeHu * 0.9;
    const crossing10 = findFirstThresholdCrossing(distancesMm, valuesHu, threshold10Hu, 0, valuesHu.length - 1);
    if (!crossing10) {
      return null;
    }

    const crossing50 = findFirstThresholdCrossing(
      distancesMm,
      valuesHu,
      threshold50Hu,
      crossing10.index,
      valuesHu.length - 1
    );

    const crossing90 = findFirstThresholdCrossing(
      distancesMm,
      valuesHu,
      threshold90Hu,
      crossing10.index,
      valuesHu.length - 1
    );
    if (!crossing90) {
      return null;
    }

    const riseDistanceMm = Math.abs(crossing90.distanceMm - crossing10.distanceMm);
    if (!Number.isFinite(riseDistanceMm) || riseDistanceMm <= 0) {
      return null;
    }

    return {
      baseHu,
      peakHu,
      amplitudeHu,
      kurtosis: computeKurtosis(valuesHu),
      threshold10Hu,
      threshold50Hu,
      threshold90Hu,
      threshold10DistanceMm: crossing10.distanceMm,
      threshold50DistanceMm: crossing50?.distanceMm ?? null,
      threshold90DistanceMm: crossing90.distanceMm,
      riseDistanceMm,
      slopeHuPerMm: (amplitudeHu * 0.8) / riseDistanceMm,
    };
  }

  function analyzePeakHalfMaximum(distancesMm, valuesHu, peakIndex, leftBoundIndex, rightBoundIndex, baselineHu, innerSide) {
    const peakHu = valuesHu[peakIndex];
    if (!Number.isFinite(peakHu) || !Number.isFinite(baselineHu) || peakHu <= baselineHu) {
      return null;
    }

    const halfMaximumHu = baselineHu + (peakHu - baselineHu) * 0.5;
    let leftCrossing = findThresholdCrossingBackward(distancesMm, valuesHu, halfMaximumHu, peakIndex, leftBoundIndex);
    let rightCrossing = findThresholdCrossingForward(distancesMm, valuesHu, halfMaximumHu, peakIndex, rightBoundIndex);
    const leftBoundValue = valuesHu[clamp(leftBoundIndex, 0, valuesHu.length - 1)];
    const rightBoundValue = valuesHu[clamp(rightBoundIndex, 0, valuesHu.length - 1)];
    if (!leftCrossing && Number.isFinite(leftBoundValue) && leftBoundValue <= halfMaximumHu) {
      leftCrossing = {
        index: leftBoundIndex,
        distanceMm: distancesMm[clamp(leftBoundIndex, 0, distancesMm.length - 1)],
      };
    }
    if (!rightCrossing && Number.isFinite(rightBoundValue) && rightBoundValue <= halfMaximumHu) {
      rightCrossing = {
        index: rightBoundIndex,
        distanceMm: distancesMm[clamp(rightBoundIndex, 0, distancesMm.length - 1)],
      };
    }
    if (!leftCrossing || !rightCrossing) {
      return null;
    }

    return {
      peakIndex,
      peakHu,
      baselineHu,
      halfMaximumHu,
      leftHalfDistanceMm: leftCrossing.distanceMm,
      rightHalfDistanceMm: rightCrossing.distanceMm,
      innerHalfDistanceMm: innerSide === "right" ? rightCrossing.distanceMm : leftCrossing.distanceMm,
      outerHalfDistanceMm: innerSide === "right" ? leftCrossing.distanceMm : rightCrossing.distanceMm,
      fwhmMm: Math.abs(rightCrossing.distanceMm - leftCrossing.distanceMm),
    };
  }

  function analyzeTroughHalfMinimum(distancesMm, valuesHu, troughIndex, leftBoundIndex, rightBoundIndex, baselineHu) {
    const troughHu = valuesHu[troughIndex];
    if (!Number.isFinite(troughHu) || !Number.isFinite(baselineHu) || troughHu >= baselineHu) {
      return null;
    }

    const halfMinimumHu = troughHu + (baselineHu - troughHu) * 0.5;
    const leftCrossing = findThresholdCrossingBackward(
      distancesMm,
      valuesHu,
      halfMinimumHu,
      troughIndex,
      leftBoundIndex
    );
    let rightCrossing = findThresholdCrossingForward(
      distancesMm,
      valuesHu,
      halfMinimumHu,
      troughIndex,
      rightBoundIndex
    );
    let estimatedRightBoundary = false;
    const rightBoundValue = valuesHu[clamp(rightBoundIndex, 0, valuesHu.length - 1)];
    if (!rightCrossing && Number.isFinite(rightBoundValue) && rightBoundValue <= halfMinimumHu) {
      rightCrossing = {
        index: rightBoundIndex,
        distanceMm: distancesMm[clamp(rightBoundIndex, 0, distancesMm.length - 1)],
      };
      estimatedRightBoundary = true;
    }
    if (!leftCrossing || !rightCrossing || rightCrossing.distanceMm <= leftCrossing.distanceMm) {
      return null;
    }

    return {
      troughIndex,
      troughHu,
      baselineHu,
      halfMinimumHu,
      leftHalfDistanceMm: leftCrossing.distanceMm,
      rightHalfDistanceMm: rightCrossing.distanceMm,
      fwhmMm: Math.abs(rightCrossing.distanceMm - leftCrossing.distanceMm),
      estimatedRightBoundary,
    };
  }

  function buildStentProfileModel(base, smoothHu, guideAdjustments, detectionHu) {
    const guideHu = Array.isArray(detectionHu) && detectionHu.length === smoothHu.length ? detectionHu : smoothHu;
    const autoPeaks = pickStrongestProfilePeaks(guideHu);
    if (autoPeaks.length < 2) {
      return null;
    }

    const [autoLeftPeakIndex, autoRightPeakIndex] = autoPeaks;
    const autoLeftOutsideMinIndex = findMinValueIndex(guideHu, 0, autoLeftPeakIndex);
    const autoLumenMinIndex = findMinValueIndex(guideHu, autoLeftPeakIndex, autoRightPeakIndex);
    const autoRightOutsideMinIndex = findMinValueIndex(guideHu, autoRightPeakIndex, guideHu.length - 1);
    if (
      autoLeftOutsideMinIndex == null ||
      autoLumenMinIndex == null ||
      autoRightOutsideMinIndex == null ||
      autoLeftPeakIndex >= autoRightPeakIndex
    ) {
      return null;
    }

    const guideIndices = sanitizeStentGuideIndices(
      smoothHu.length,
      guideAdjustments,
      {
        leftOutsideIndex: autoLeftOutsideMinIndex,
        leftPeakIndex: autoLeftPeakIndex,
        lumenMinIndex: autoLumenMinIndex,
        rightPeakIndex: autoRightPeakIndex,
        rightOutsideIndex: autoRightOutsideMinIndex,
      }
    );
    if (!guideIndices) {
      return null;
    }

    const leftOutsideMinIndex = findNearestFiniteIndex(smoothHu, guideIndices.leftOutsideIndex);
    const leftPeakIndex = findNearestFiniteIndex(smoothHu, guideIndices.leftPeakIndex);
    const lumenMinIndex = findNearestFiniteIndex(smoothHu, guideIndices.lumenMinIndex);
    const rightPeakIndex = findNearestFiniteIndex(smoothHu, guideIndices.rightPeakIndex);
    const rightOutsideMinIndex = findNearestFiniteIndex(smoothHu, guideIndices.rightOutsideIndex);

    const averagingRadius = Math.max(1, Math.round(smoothHu.length * 0.015));
    const lumenBaseHu = averageWindow(smoothHu, lumenMinIndex, averagingRadius);
    const outerLeftBaseHu = averageWindow(smoothHu, leftOutsideMinIndex, averagingRadius);
    const outerRightBaseHu = averageWindow(smoothHu, rightOutsideMinIndex, averagingRadius);
    const leftPeakBaselineHu = Math.max(lumenBaseHu ?? Number.NEGATIVE_INFINITY, outerLeftBaseHu ?? Number.NEGATIVE_INFINITY);
    const rightPeakBaselineHu = Math.max(lumenBaseHu ?? Number.NEGATIVE_INFINITY, outerRightBaseHu ?? Number.NEGATIVE_INFINITY);

    const leftPeak = analyzePeakHalfMaximum(
      base.distancesMm,
      smoothHu,
      leftPeakIndex,
      leftOutsideMinIndex,
      lumenMinIndex,
      leftPeakBaselineHu,
      "right"
    );
    const rightPeak = analyzePeakHalfMaximum(
      base.distancesMm,
      smoothHu,
      rightPeakIndex,
      lumenMinIndex,
      rightOutsideMinIndex,
      rightPeakBaselineHu,
      "left"
    );
    if (!leftPeak || !rightPeak) {
      return null;
    }

    const leftOuterSegment = buildOrderedSegment(base.distancesMm, smoothHu, leftOutsideMinIndex, leftPeakIndex);
    const rightOuterSegment = buildOrderedSegment(base.distancesMm, smoothHu, rightOutsideMinIndex, rightPeakIndex);
    const leftOuterEdge = analyzeEdgeSegment(
      leftOuterSegment.distances,
      leftOuterSegment.values,
      outerLeftBaseHu,
      leftPeak.peakHu
    );
    const rightOuterEdge = analyzeEdgeSegment(
      rightOuterSegment.distances,
      rightOuterSegment.values,
      outerRightBaseHu,
      rightPeak.peakHu
    );
    const lowerSteepEdge =
      leftOuterEdge && rightOuterEdge
        ? Math.abs(leftOuterEdge.slopeHuPerMm) <= Math.abs(rightOuterEdge.slopeHuPerMm)
          ? { label: "Left outer edge", ...leftOuterEdge }
          : { label: "Right outer edge", ...rightOuterEdge }
        : leftOuterEdge
          ? { label: "Left outer edge", ...leftOuterEdge }
          : rightOuterEdge
            ? { label: "Right outer edge", ...rightOuterEdge }
            : null;

    const meanPeakHu = averageFinite([leftPeak.peakHu, rightPeak.peakHu]);
    const meanHalfMaximumHu = averageFinite([leftPeak.halfMaximumHu, rightPeak.halfMaximumHu]);

    return {
      leftPeakIndex,
      rightPeakIndex,
      lumenMinIndex,
      leftOutsideMinIndex,
      rightOutsideMinIndex,
      outerLeftBaseHu,
      outerRightBaseHu,
      lumenBaseHu,
      meanPeakHu,
      meanHalfMaximumHu,
      guideIndices,
      guideDistancesMm: {
        leftOutsideMm: base.distancesMm[leftOutsideMinIndex],
        leftPeakMm: base.distancesMm[leftPeakIndex],
        lumenMm: base.distancesMm[lumenMinIndex],
        rightPeakMm: base.distancesMm[rightPeakIndex],
        rightOutsideMm: base.distancesMm[rightOutsideMinIndex],
      },
      adjustmentMode: guideAdjustments ? "manual" : "auto",
      leftPeak,
      rightPeak,
      stentFwhmMeanMm: averageFinite([leftPeak.fwhmMm, rightPeak.fwhmMm]),
      lumenFwhmMm:
        Number.isFinite(leftPeak.innerHalfDistanceMm) && Number.isFinite(rightPeak.innerHalfDistanceMm)
          ? Math.abs(rightPeak.innerHalfDistanceMm - leftPeak.innerHalfDistanceMm)
          : null,
      leftOuterEdge,
      rightOuterEdge,
      lowerSteepEdge,
    };
  }

  function findDerivativePeakBetween(derivative, startDistanceMm, endDistanceMm) {
    const minDistance = Math.min(startDistanceMm, endDistanceMm);
    const maxDistance = Math.max(startDistanceMm, endDistanceMm);
    let bestIndex = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    derivative.derivativeAbs.forEach((value, index) => {
      const distanceMm = derivative.derivativeDistancesMm[index];
      if (!Number.isFinite(value) || !Number.isFinite(distanceMm)) {
        return;
      }
      if (distanceMm < minDistance || distanceMm > maxDistance) {
        return;
      }
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function sanitizePlaqueGuideIndices(length, preferred, fallback) {
    if (length < 4) {
      return null;
    }

    const source = preferred || fallback;
    if (!source) {
      return null;
    }

    const maxStart = Math.max(0, length - 4);
    const outsideIndex = clamp(
      Math.round(source.outsideIndex ?? fallback.outsideIndex),
      0,
      maxStart
    );
    const lumenIndex = clamp(
      Math.round(source.lumenIndex ?? fallback.lumenIndex),
      outsideIndex + 1,
      Math.max(outsideIndex + 1, length - 3)
    );
    const plaqueIndex = clamp(
      Math.round(source.plaqueIndex ?? fallback.plaqueIndex),
      lumenIndex + 1,
      Math.max(lumenIndex + 1, length - 2)
    );
    const rightOutsideIndex = clamp(
      Math.round(source.rightOutsideIndex ?? fallback.rightOutsideIndex),
      plaqueIndex + 1,
      length - 1
    );

    return {
      outsideIndex,
      lumenIndex,
      plaqueIndex,
      rightOutsideIndex,
    };
  }

  function computeLumenFwhm(base, smoothHu, outsideIndex, lumenIndex, rightBoundaryDistanceMm) {
    const averagingRadius = Math.max(1, Math.round(smoothHu.length * 0.015));
    const outsideHu = averageWindow(smoothHu, outsideIndex, averagingRadius);
    const lumenHu = averageWindow(smoothHu, lumenIndex, averagingRadius);
    if (!Number.isFinite(outsideHu) || !Number.isFinite(lumenHu) || lumenHu <= outsideHu) {
      return null;
    }

    const halfMaximumHu = outsideHu + (lumenHu - outsideHu) * 0.5;
    const leftCrossing = findFirstThresholdCrossing(
      base.distancesMm,
      smoothHu,
      halfMaximumHu,
      outsideIndex,
      lumenIndex
    );
    const rightDistanceMm = Number.isFinite(rightBoundaryDistanceMm)
      ? rightBoundaryDistanceMm
      : base.distancesMm[lumenIndex];
    if (!leftCrossing || !Number.isFinite(rightDistanceMm) || rightDistanceMm <= leftCrossing.distanceMm) {
      return null;
    }

    return {
      outsideHu,
      lumenHu,
      halfMaximumHu,
      leftHalfDistanceMm: leftCrossing.distanceMm,
      rightHalfDistanceMm: rightDistanceMm,
      fwhmMm: rightDistanceMm - leftCrossing.distanceMm,
    };
  }

  function safePositiveRatio(numerator, denominator) {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
      return null;
    }
    return numerator / denominator;
  }

  function buildNormalizedInterfaceMetrics(amplitudeHu, slopeHuPerMm, peakGradientHuPerMm, riseDistanceMm) {
    const amplitudeAbsHu = Math.abs(amplitudeHu);
    const normalizedSlopePerMm =
      amplitudeAbsHu > 1e-6 && Number.isFinite(slopeHuPerMm)
        ? Math.abs(slopeHuPerMm) / amplitudeAbsHu
        : Number.isFinite(riseDistanceMm) && riseDistanceMm > 0
          ? 0.8 / riseDistanceMm
          : null;
    const normalizedPeakGradientPerMm =
      amplitudeAbsHu > 1e-6 && Number.isFinite(peakGradientHuPerMm)
        ? Math.abs(peakGradientHuPerMm) / amplitudeAbsHu
        : null;

    return {
      amplitudeAbsHu: Number.isFinite(amplitudeAbsHu) ? amplitudeAbsHu : null,
      normalizedSlopePerMm,
      normalizedSlopePercentPerMm: Number.isFinite(normalizedSlopePerMm) ? normalizedSlopePerMm * 100 : null,
      normalizedPeakGradientPerMm,
      normalizedPeakGradientPercentPerMm: Number.isFinite(normalizedPeakGradientPerMm)
        ? normalizedPeakGradientPerMm * 100
        : null,
    };
  }

  function buildPlaqueInterfaceCandidate(side, base, smoothHu, peakIndex, baseIndex, derivative) {
    if (!Number.isInteger(baseIndex) || baseIndex === peakIndex) {
      return null;
    }

    const averagingRadius = Math.max(1, Math.round(smoothHu.length * 0.015));
    const baseHu = averageWindow(smoothHu, baseIndex, averagingRadius);
    const peakHu = averageWindow(smoothHu, peakIndex, averagingRadius) ?? smoothHu[peakIndex];
    if (!Number.isFinite(baseHu) || !Number.isFinite(peakHu) || peakHu <= baseHu) {
      return null;
    }

    const segment = buildOrderedSegment(base.distancesMm, smoothHu, baseIndex, peakIndex);
    const edge = analyzeEdgeSegment(segment.distances, segment.values, baseHu, peakHu);
    if (!edge) {
      return null;
    }

    const derivativePeakIndex = findDerivativePeakBetween(
      derivative,
      base.distancesMm[baseIndex],
      base.distancesMm[peakIndex]
    );
    const peakGradientHuPerMm = Number.isInteger(derivativePeakIndex)
      ? Math.abs(derivative.derivativeHuPerMm[derivativePeakIndex])
      : null;
    const edgeFwhmMm = Number.isInteger(derivativePeakIndex)
      ? computeDerivativeFwhm(derivative.derivativeDistancesMm, derivative.derivativeAbs, derivativePeakIndex)
      : null;
    const amplitudeHu = peakHu - baseHu;
    const normalizedMetrics = buildNormalizedInterfaceMetrics(
      amplitudeHu,
      edge.slopeHuPerMm,
      peakGradientHuPerMm,
      edge.riseDistanceMm
    );

    return {
      side,
      label: side === "left" ? "Left plaque-lumen interface" : "Right plaque-lumen interface",
      baseIndex,
      peakIndex,
      baseDistanceMm: base.distancesMm[baseIndex],
      peakDistanceMm: base.distancesMm[peakIndex],
      baseHu,
      peakHu,
      amplitudeHu,
      threshold10Hu: edge.threshold10Hu,
      threshold50Hu: edge.threshold50Hu,
      threshold90Hu: edge.threshold90Hu,
      threshold10DistanceMm: edge.threshold10DistanceMm,
      threshold50DistanceMm: edge.threshold50DistanceMm,
      threshold90DistanceMm: edge.threshold90DistanceMm,
      startThresholdDistanceMm: edge.threshold10DistanceMm,
      startThresholdHu: edge.threshold10Hu,
      endThresholdDistanceMm: edge.threshold90DistanceMm,
      endThresholdHu: edge.threshold90Hu,
      riseDistanceMm: edge.riseDistanceMm,
      slopeHuPerMm: edge.slopeHuPerMm,
      edgeFwhmMm,
      peakGradientHuPerMm,
      ...normalizedMetrics,
      kurtosis: edge.kurtosis,
    };
  }

  function choosePrimaryPlaqueInterface(interfaces) {
    const finite = (interfaces || []).filter(Boolean);
    if (!finite.length) {
      return null;
    }
    return finite.find((entry) => entry.side === "left") || finite[0];
  }

  function buildCalcifiedPlaqueLumenProfileModel(base, smoothHu, derivative, guideAdjustments) {
    if (!base || !Array.isArray(smoothHu) || smoothHu.length < 5) {
      return null;
    }

    const autoPeakIndex = findMaxValueIndex(smoothHu, 0, smoothHu.length - 1);
    if (!Number.isInteger(autoPeakIndex)) {
      return null;
    }

    const exclusionRadius = Math.max(4, Math.round(smoothHu.length * 0.12));
    const autoLumenIndex = autoPeakIndex > 1
      ? findMaxValueIndex(smoothHu, 0, Math.max(0, autoPeakIndex - exclusionRadius))
      : null;
    const autoOutsideIndex = Number.isInteger(autoLumenIndex) && autoLumenIndex > 1
      ? findMinValueIndex(smoothHu, 0, Math.max(0, autoLumenIndex - 1))
      : 0;
    const autoRightOutsideIndex = autoPeakIndex < smoothHu.length - 2
      ? findMinValueIndex(smoothHu, Math.min(smoothHu.length - 1, autoPeakIndex + exclusionRadius), smoothHu.length - 1)
      : smoothHu.length - 1;

    const guideIndices = sanitizePlaqueGuideIndices(
      smoothHu.length,
      guideAdjustments,
      {
        outsideIndex: Number.isInteger(autoOutsideIndex) ? autoOutsideIndex : 0,
        lumenIndex: Number.isInteger(autoLumenIndex) ? autoLumenIndex : Math.max(1, autoPeakIndex - exclusionRadius),
        plaqueIndex: autoPeakIndex,
        rightOutsideIndex: Number.isInteger(autoRightOutsideIndex) ? autoRightOutsideIndex : smoothHu.length - 1,
      }
    );
    if (!guideIndices) {
      return null;
    }

    const outsideIndex = findNearestFiniteIndex(smoothHu, guideIndices.outsideIndex);
    const lumenIndex = findNearestFiniteIndex(smoothHu, guideIndices.lumenIndex);
    const peakIndex = findNearestFiniteIndex(smoothHu, guideIndices.plaqueIndex);
    const rightOutsideIndex = findNearestFiniteIndex(smoothHu, guideIndices.rightOutsideIndex);

    const leftInterface = buildPlaqueInterfaceCandidate("left", base, smoothHu, peakIndex, lumenIndex, derivative);
    const rightInterface = buildPlaqueInterfaceCandidate("right", base, smoothHu, peakIndex, rightOutsideIndex, derivative);
    const interfaces = [leftInterface, rightInterface].filter(Boolean);
    const primaryInterface = choosePrimaryPlaqueInterface(interfaces);
    if (!primaryInterface) {
      return null;
    }

    const lumenFwhm = computeLumenFwhm(
      base,
      smoothHu,
      outsideIndex,
      lumenIndex,
      primaryInterface.threshold50DistanceMm
    );
    const plaquePeak = analyzePeakHalfMaximum(
      base.distancesMm,
      smoothHu,
      peakIndex,
      Math.min(lumenIndex, peakIndex),
      Math.max(rightOutsideIndex, peakIndex),
      primaryInterface.baseHu,
      "right"
    );
    const plaqueFwhmMm = plaquePeak?.fwhmMm ?? null;
    const lumenFwhmMm = lumenFwhm?.fwhmMm ?? null;

    return {
      type: "calcified",
      peakIndex,
      peakDistanceMm: base.distancesMm[peakIndex],
      peakHu: smoothHu[peakIndex],
      lumenBaselineHu: primaryInterface.baseHu,
      amplitudeHu: smoothHu[peakIndex] - primaryInterface.baseHu,
      plaqueHu: smoothHu[peakIndex],
      plaqueDeltaHu: smoothHu[peakIndex] - primaryInterface.baseHu,
      halfMaximumHu: plaquePeak?.halfMaximumHu ?? null,
      halfMinimumHu: null,
      plaqueFwhmMm,
      plaqueFwhmKind: "half_maximum_peak",
      plaqueFwhmEstimated: false,
      plaqueLeftHalfDistanceMm: plaquePeak?.leftHalfDistanceMm ?? null,
      plaqueRightHalfDistanceMm: plaquePeak?.rightHalfDistanceMm ?? null,
      lumenFwhmMm,
      lumenHalfMaximumHu: lumenFwhm?.halfMaximumHu ?? null,
      lumenLeftHalfDistanceMm: lumenFwhm?.leftHalfDistanceMm ?? null,
      lumenRightHalfDistanceMm: lumenFwhm?.rightHalfDistanceMm ?? null,
      outsideBaselineHu: lumenFwhm?.outsideHu ?? null,
      plaqueToLumenFwhmRatio: safePositiveRatio(plaqueFwhmMm, lumenFwhmMm),
      edgeWidthToLumenFwhmRatio: safePositiveRatio(primaryInterface.riseDistanceMm, lumenFwhmMm),
      edgeFwhmToLumenFwhmRatio: safePositiveRatio(primaryInterface.edgeFwhmMm, lumenFwhmMm),
      interfaces,
      primaryInterface,
      leftInterface,
      rightInterface,
      guideIndices,
      guideDistancesMm: {
        outsideMm: base.distancesMm[outsideIndex],
        lumenMm: base.distancesMm[lumenIndex],
        plaqueMm: base.distancesMm[peakIndex],
        rightOutsideMm: base.distancesMm[rightOutsideIndex],
      },
      adjustmentMode: guideAdjustments ? "manual" : "auto",
    };
  }

  function analyzeFallingPlaqueInterface(base, smoothHu, lumenIndex, plaqueIndex, derivative) {
    const averagingRadius = Math.max(1, Math.round(smoothHu.length * 0.015));
    const lumenHu = averageWindow(smoothHu, lumenIndex, averagingRadius);
    const plaqueHu = averageWindow(smoothHu, plaqueIndex, averagingRadius);
    if (!Number.isFinite(lumenHu) || !Number.isFinite(plaqueHu) || lumenHu <= plaqueHu) {
      return null;
    }

    const amplitudeHu = lumenHu - plaqueHu;
    if (amplitudeHu < 5) {
      return null;
    }

    const threshold90Hu = plaqueHu + amplitudeHu * 0.9;
    const threshold50Hu = plaqueHu + amplitudeHu * 0.5;
    const threshold10Hu = plaqueHu + amplitudeHu * 0.1;
    const crossing90 = findFirstThresholdCrossing(base.distancesMm, smoothHu, threshold90Hu, lumenIndex, plaqueIndex);
    if (!crossing90) {
      return null;
    }
    const crossing50 = findFirstThresholdCrossing(
      base.distancesMm,
      smoothHu,
      threshold50Hu,
      crossing90.index,
      plaqueIndex
    );
    const crossing10 = findFirstThresholdCrossing(
      base.distancesMm,
      smoothHu,
      threshold10Hu,
      crossing90.index,
      plaqueIndex
    );
    if (!crossing10 || crossing10.distanceMm <= crossing90.distanceMm) {
      return null;
    }

    const derivativePeakIndex = findDerivativePeakBetween(
      derivative,
      base.distancesMm[lumenIndex],
      base.distancesMm[plaqueIndex]
    );
    const peakGradientHuPerMm = Number.isInteger(derivativePeakIndex)
      ? Math.abs(derivative.derivativeHuPerMm[derivativePeakIndex])
      : null;
    const edgeFwhmMm = Number.isInteger(derivativePeakIndex)
      ? computeDerivativeFwhm(derivative.derivativeDistancesMm, derivative.derivativeAbs, derivativePeakIndex)
      : null;
    const fallDistanceMm = crossing10.distanceMm - crossing90.distanceMm;
    const slopeHuPerMm = (-amplitudeHu * 0.8) / fallDistanceMm;
    const normalizedMetrics = buildNormalizedInterfaceMetrics(
      amplitudeHu,
      slopeHuPerMm,
      peakGradientHuPerMm,
      fallDistanceMm
    );

    return {
      side: "right",
      label: "Lumen to non-calcified plaque interface",
      baseIndex: lumenIndex,
      peakIndex: plaqueIndex,
      baseDistanceMm: base.distancesMm[lumenIndex],
      peakDistanceMm: base.distancesMm[plaqueIndex],
      baseHu: lumenHu,
      peakHu: plaqueHu,
      plaqueHu,
      amplitudeHu,
      threshold10Hu,
      threshold50Hu,
      threshold90Hu,
      threshold10DistanceMm: crossing10.distanceMm,
      threshold50DistanceMm: crossing50?.distanceMm ?? null,
      threshold90DistanceMm: crossing90.distanceMm,
      startThresholdDistanceMm: crossing90.distanceMm,
      startThresholdHu: threshold90Hu,
      endThresholdDistanceMm: crossing10.distanceMm,
      endThresholdHu: threshold10Hu,
      riseDistanceMm: fallDistanceMm,
      slopeHuPerMm,
      edgeFwhmMm,
      peakGradientHuPerMm,
      ...normalizedMetrics,
      kurtosis: computeKurtosis(smoothHu.slice(lumenIndex, plaqueIndex + 1)),
    };
  }

  function buildNonCalcifiedPlaqueLumenProfileModel(base, smoothHu, derivative, guideAdjustments) {
    if (!base || !Array.isArray(smoothHu) || smoothHu.length < 5) {
      return null;
    }

    const searchEnd = Math.max(1, Math.floor(smoothHu.length * 0.65));
    const autoLumenIndex = findMaxValueIndex(smoothHu, 0, searchEnd);
    if (!Number.isInteger(autoLumenIndex)) {
      return null;
    }
    const exclusionRadius = Math.max(2, Math.round(smoothHu.length * 0.04));
    const autoPlaqueIndex = autoLumenIndex < smoothHu.length - 2
      ? findMinValueIndex(smoothHu, Math.min(smoothHu.length - 1, autoLumenIndex + exclusionRadius), smoothHu.length - 1)
      : null;
    if (!Number.isInteger(autoPlaqueIndex)) {
      return null;
    }
    const autoOutsideIndex = autoLumenIndex > 1
      ? findMinValueIndex(smoothHu, 0, Math.max(0, autoLumenIndex - 1))
      : 0;

    const guideIndices = sanitizePlaqueGuideIndices(
      smoothHu.length,
      guideAdjustments,
      {
        outsideIndex: Number.isInteger(autoOutsideIndex) ? autoOutsideIndex : 0,
        lumenIndex: autoLumenIndex,
        plaqueIndex: autoPlaqueIndex,
        rightOutsideIndex: smoothHu.length - 1,
      }
    );
    if (!guideIndices) {
      return null;
    }

    const outsideIndex = findNearestFiniteIndex(smoothHu, guideIndices.outsideIndex);
    const lumenIndex = findNearestFiniteIndex(smoothHu, guideIndices.lumenIndex);
    const plaqueIndex = findNearestFiniteIndex(smoothHu, guideIndices.plaqueIndex);
    const rightOutsideIndex = findNearestFiniteIndex(smoothHu, guideIndices.rightOutsideIndex);
    const primaryInterface = analyzeFallingPlaqueInterface(base, smoothHu, lumenIndex, plaqueIndex, derivative);
    if (!primaryInterface) {
      return null;
    }

    const lumenFwhm = computeLumenFwhm(
      base,
      smoothHu,
      outsideIndex,
      lumenIndex,
      primaryInterface.threshold50DistanceMm
    );
    const lumenFwhmMm = lumenFwhm?.fwhmMm ?? null;
    const plaqueTrough = analyzeTroughHalfMinimum(
      base.distancesMm,
      smoothHu,
      plaqueIndex,
      lumenIndex,
      rightOutsideIndex,
      primaryInterface.baseHu
    );
    const plaqueFwhmMm = plaqueTrough?.fwhmMm ?? null;

    return {
      type: "non_calcified",
      peakIndex: plaqueIndex,
      peakDistanceMm: base.distancesMm[plaqueIndex],
      peakHu: smoothHu[plaqueIndex],
      plaqueHu: primaryInterface.plaqueHu,
      lumenBaselineHu: primaryInterface.baseHu,
      amplitudeHu: primaryInterface.amplitudeHu,
      plaqueDeltaHu: primaryInterface.amplitudeHu,
      halfMaximumHu: plaqueTrough?.halfMinimumHu ?? primaryInterface.threshold50Hu,
      halfMinimumHu: plaqueTrough?.halfMinimumHu ?? primaryInterface.threshold50Hu,
      plaqueFwhmMm,
      plaqueFwhmKind: "half_minimum_trough",
      plaqueFwhmEstimated: plaqueTrough?.estimatedRightBoundary === true,
      plaqueLeftHalfDistanceMm: plaqueTrough?.leftHalfDistanceMm ?? null,
      plaqueRightHalfDistanceMm: plaqueTrough?.rightHalfDistanceMm ?? null,
      lumenFwhmMm,
      lumenHalfMaximumHu: lumenFwhm?.halfMaximumHu ?? null,
      lumenLeftHalfDistanceMm: lumenFwhm?.leftHalfDistanceMm ?? null,
      lumenRightHalfDistanceMm: lumenFwhm?.rightHalfDistanceMm ?? null,
      outsideBaselineHu: lumenFwhm?.outsideHu ?? null,
      plaqueToLumenFwhmRatio: safePositiveRatio(plaqueFwhmMm, lumenFwhmMm),
      edgeWidthToLumenFwhmRatio: safePositiveRatio(primaryInterface.riseDistanceMm, lumenFwhmMm),
      edgeFwhmToLumenFwhmRatio: safePositiveRatio(primaryInterface.edgeFwhmMm, lumenFwhmMm),
      interfaces: [primaryInterface],
      primaryInterface,
      leftInterface: null,
      rightInterface: primaryInterface,
      guideIndices,
      guideDistancesMm: {
        outsideMm: base.distancesMm[outsideIndex],
        lumenMm: base.distancesMm[lumenIndex],
        plaqueMm: base.distancesMm[plaqueIndex],
        rightOutsideMm: base.distancesMm[rightOutsideIndex],
      },
      adjustmentMode: guideAdjustments ? "manual" : "auto",
    };
  }

  function buildPlaqueLumenProfileModel(base, smoothHu, derivative, guideAdjustments) {
    return base?.profileSubtype === "non_calcified"
      ? buildNonCalcifiedPlaqueLumenProfileModel(base, smoothHu, derivative, guideAdjustments)
      : buildCalcifiedPlaqueLumenProfileModel(base, smoothHu, derivative, guideAdjustments);
  }

  function computeDerivativeFwhm(derivativeDistancesMm, derivativeAbs, peakIndex) {
    const peakValue = derivativeAbs[peakIndex];
    if (!Number.isFinite(peakValue) || peakValue <= 0) {
      return null;
    }

    const halfMaximum = peakValue / 2;
    let leftDistance = derivativeDistancesMm[peakIndex];
    let rightDistance = derivativeDistancesMm[peakIndex];

    for (let index = peakIndex - 1; index >= 0; index -= 1) {
      if (derivativeAbs[index] < halfMaximum) {
        leftDistance = interpolateThresholdCrossing(
          derivativeDistancesMm[index],
          derivativeAbs[index],
          derivativeDistancesMm[index + 1],
          derivativeAbs[index + 1],
          halfMaximum
        );
        break;
      }
    }

    for (let index = peakIndex + 1; index < derivativeAbs.length; index += 1) {
      if (derivativeAbs[index] < halfMaximum) {
        rightDistance = interpolateThresholdCrossing(
          derivativeDistancesMm[index - 1],
          derivativeAbs[index - 1],
          derivativeDistancesMm[index],
          derivativeAbs[index],
          halfMaximum
        );
        break;
      }
    }

    return rightDistance - leftDistance;
  }

  function analyzeSingleEdge(distancesMm, smoothValues, derivativeDistancesMm, derivativeHuPerMm, derivativeAbs, peakIndex) {
    const peakDerivative = derivativeHuPerMm[peakIndex];
    if (!Number.isFinite(peakDerivative)) {
      return null;
    }

    const sign = peakDerivative >= 0 ? 1 : -1;
    const transformedValues = smoothValues.map((value) => (Number.isFinite(value) ? value * sign : Number.NaN));
    const peakSampleIndex = clamp(peakIndex + 1, 1, transformedValues.length - 2);
    const searchRadius = Math.max(8, Math.round(transformedValues.length * 0.12));
    const leftBound = Math.max(0, peakSampleIndex - searchRadius);
    const rightBound = Math.min(transformedValues.length - 1, peakSampleIndex + searchRadius);

    const lowValue = averageFinite(transformedValues.slice(leftBound, peakSampleIndex + 1));
    const highValue = averageFinite(transformedValues.slice(peakSampleIndex, rightBound + 1));
    if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || highValue <= lowValue) {
      return null;
    }

    const amplitudeHu = highValue - lowValue;
    if (amplitudeHu < 5) {
      return null;
    }

    const threshold10 = lowValue + amplitudeHu * 0.1;
    const threshold90 = lowValue + amplitudeHu * 0.9;
    const crossing10 = findFirstThresholdCrossing(distancesMm, transformedValues, threshold10, leftBound, rightBound);
    if (!crossing10) {
      return null;
    }
    const crossing90 = findFirstThresholdCrossing(
      distancesMm,
      transformedValues,
      threshold90,
      crossing10.index,
      rightBound
    );
    if (!crossing90 || crossing90.distanceMm <= crossing10.distanceMm) {
      return null;
    }

    const riseDistanceMm = crossing90.distanceMm - crossing10.distanceMm;
    const fwhmMm = computeDerivativeFwhm(derivativeDistancesMm, derivativeAbs, peakIndex);
    return {
      sign,
      peakDistanceMm: derivativeDistancesMm[peakIndex],
      peakHuPerMm: peakDerivative,
      fwhmMm,
      riseDistanceMm,
      slopeHuPerMm: (amplitudeHu * 0.8) / riseDistanceMm,
      amplitudeHu,
      threshold10DistanceMm: crossing10.distanceMm,
      threshold90DistanceMm: crossing90.distanceMm,
    };
  }

  function analyzeProfileSamples(base, guideAdjustments, plaqueGuideAdjustments) {
    if (!base) {
      return null;
    }

    const smoothHu = smoothSeries(base.valuesHu, 1);
    const derivative = buildDerivativeProfile(base.distancesMm, smoothHu);
    const stentDetectionHu = base.mode === "line" ? smoothSeries(base.valuesHu, 2) : smoothHu;
    const stent =
      buildStentProfileModel(base, smoothHu, guideAdjustments || null, stentDetectionHu) ||
      (base.mode === "line" ? buildStentProfileModel(base, stentDetectionHu, guideAdjustments || null) : null);
    const plaque = buildPlaqueLumenProfileModel(base, smoothHu, derivative, plaqueGuideAdjustments || null);
    const edges = [stent?.leftOuterEdge, stent?.rightOuterEdge].filter(Boolean);
    const lowerSlopeEdge = stent?.lowerSteepEdge || null;

    return {
      ...base,
      smoothHu,
      derivativeDistancesMm: derivative.derivativeDistancesMm,
      derivativeHuPerMm: derivative.derivativeHuPerMm,
      derivativeAbs: derivative.derivativeAbs,
      stent,
      plaque,
      edges,
      lowerSlopeEdge,
    };
  }

  global.HAGRadProfileAnalysis = Object.freeze({
    averageFinite,
    computeKurtosis,
    smoothSeries,
    interpolateThresholdCrossing,
    findFirstThresholdCrossing,
    buildDerivativeProfile,
    pickStrongestEdgePeaks,
    sanitizeStentGuideIndices,
    sanitizePlaqueGuideIndices,
    buildStentProfileModel,
    buildPlaqueLumenProfileModel,
    analyzeSingleEdge,
    analyzeProfileSamples,
  });
})(typeof window !== "undefined" ? window : globalThis);
