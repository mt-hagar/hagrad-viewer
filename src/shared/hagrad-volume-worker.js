(function () {
  "use strict";

  const DIRECT_PIXEL_TRANSFER_SYNTAXES = new Set([
    "1.2.840.10008.1.2",
    "1.2.840.10008.1.2.1",
  ]);

  function safeString(value) {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function vectorLength(vector) {
    return Math.sqrt(dot(vector, vector));
  }

  function normalize(vector) {
    const length = vectorLength(vector);
    if (!length) {
      return [0, 0, 0];
    }
    return [vector[0] / length, vector[1] / length, vector[2] / length];
  }

  function addVectors(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function scaleVector(vector, scalar) {
    return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
  }

  function cloneVector(vector) {
    return Array.isArray(vector) && vector.length >= 3 ? [vector[0], vector[1], vector[2]] : [0, 0, 0];
  }

  function isMonochromePhotometric(record) {
    const photometric = safeString(record?.photometricInterpretation);
    return !photometric || /^MONOCHROME/i.test(photometric);
  }

  function unsupported(message) {
    const error = new Error(message);
    error.unsupported = true;
    return error;
  }

  function expectedPixelByteLength(record) {
    const rows = record.rows;
    const columns = record.columns;
    const bitsAllocated = record.bitsAllocated || 16;
    const bytesPerSample = bitsAllocated === 16 ? 2 : bitsAllocated === 8 ? 1 : 0;
    if (!Number.isFinite(rows) || !Number.isFinite(columns) || !bytesPerSample) {
      return null;
    }
    return rows * columns * bytesPerSample;
  }

  function isEligibleRecord(record) {
    if (!record?.file || typeof record.file.slice !== "function") {
      return false;
    }
    if (Number.isFinite(record.numberOfFrames) && record.numberOfFrames > 1) {
      return false;
    }
    if (!DIRECT_PIXEL_TRANSFER_SYNTAXES.has(safeString(record.transferSyntaxUID) || "")) {
      return false;
    }
    if (record.pixelDataHasFragments || !Number.isFinite(record.pixelDataOffset)) {
      return false;
    }
    if (!isMonochromePhotometric(record)) {
      return false;
    }
    if ((record.samplesPerPixel || 1) !== 1) {
      return false;
    }
    const expectedBytes = expectedPixelByteLength(record);
    if (!Number.isFinite(expectedBytes)) {
      return false;
    }
    return !(Number.isFinite(record.pixelDataLength) && record.pixelDataLength < expectedBytes);
  }

  function estimateSliceSpacing(records) {
    const normalVector = records.find((record) => record.normalVector?.length >= 3)?.normalVector;
    const positions = normalVector
      ? records
          .map((record) =>
            record.imagePositionPatient?.length >= 3 ? dot(record.imagePositionPatient, normalVector) : null
          )
          .filter(Number.isFinite)
      : [];

    if (positions.length >= 2) {
      const deltas = [];
      for (let index = 1; index < positions.length; index += 1) {
        const delta = Math.abs(positions[index] - positions[index - 1]);
        if (delta > 0) {
          deltas.push(delta);
        }
      }
      if (deltas.length) {
        return deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
      }
    }

    return records[0]?.sliceThickness || 1;
  }

  async function decodeStoredRange(record) {
    if (!isEligibleRecord(record)) {
      throw unsupported("The DICOM slice is not eligible for direct worker decoding.");
    }

    const rows = record.rows;
    const columns = record.columns;
    const sampleCount = rows * columns;
    const bitsAllocated = record.bitsAllocated || 16;
    const pixelRepresentation = record.pixelRepresentation || 0;
    const expectedBytes = expectedPixelByteLength(record);
    const buffer = await record.file.slice(record.pixelDataOffset, record.pixelDataOffset + expectedBytes).arrayBuffer();
    if (buffer.byteLength < expectedBytes) {
      throw unsupported("The DICOM pixel payload is shorter than expected.");
    }

    let pixels;
    if (bitsAllocated === 16) {
      pixels = pixelRepresentation === 1 ? new Int16Array(buffer, 0, sampleCount) : new Uint16Array(buffer, 0, sampleCount);
    } else if (bitsAllocated === 8) {
      const view = pixelRepresentation === 1 ? new Int8Array(buffer, 0, sampleCount) : new Uint8Array(buffer, 0, sampleCount);
      pixels = pixelRepresentation === 1 ? new Int16Array(sampleCount) : new Uint16Array(sampleCount);
      for (let index = 0; index < sampleCount; index += 1) {
        pixels[index] = view[index];
      }
    } else {
      throw unsupported(`Unsupported Bits Allocated value: ${bitsAllocated}`);
    }

    return {
      recordIndex: record.index,
      rows,
      columns,
      pixels,
      slope: Number.isFinite(record.rescaleSlope) ? record.rescaleSlope : 1,
      intercept: Number.isFinite(record.rescaleIntercept) ? record.rescaleIntercept : 0,
      units: safeString(record.rescaleType) || (record.modality === "CT" ? "HU" : "rescaled"),
    };
  }

  async function decodeRecords(records, requestId, options) {
    const results = new Array(records.length);
    const concurrency = Math.min(
      records.length || 1,
      Math.max(1, Math.min(4, Math.floor(options.pixelReadConcurrency || 2)))
    );
    let nextIndex = 0;
    let completed = 0;

    async function worker() {
      while (nextIndex < records.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        try {
          results[currentIndex] = await decodeStoredRange(records[currentIndex]);
        } catch (error) {
          results[currentIndex] = { error };
        } finally {
          completed += 1;
          if (completed === records.length || completed % 10 === 0) {
            self.postMessage({
              type: "buildDicomVolumeProgress",
              requestId,
              done: completed,
              total: records.length,
            });
          }
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
  }

  async function buildVolume(records, requestId, options) {
    if (!records.length || !records.every(isEligibleRecord)) {
      throw unsupported("The DICOM series requires the main-thread decoder fallback.");
    }

    const rowSpacing = records[0]?.pixelSpacing?.[0] || options.spacingFallback;
    const columnSpacing = records[0]?.pixelSpacing?.[1] || options.spacingFallback;
    const sliceSpacing = estimateSliceSpacing(records);
    const decoded = await decodeRecords(records, requestId, options);
    const slices = [];
    let skippedCount = 0;
    let rows = null;
    let columns = null;

    decoded.forEach((slice) => {
      if (!slice || slice.error) {
        skippedCount += 1;
        return;
      }
      rows = rows ?? slice.rows;
      columns = columns ?? slice.columns;
      if (slice.rows !== rows || slice.columns !== columns) {
        skippedCount += 1;
        return;
      }
      slices.push(slice);
    });

    if (!slices.length) {
      throw new Error("No usable image slices could be decoded from the selected files.");
    }

    const firstRecord = records[0];
    const originWorld =
      firstRecord.imagePositionPatient?.length >= 3 ? cloneVector(firstRecord.imagePositionPatient) : [0, 0, 0];
    const rowDirection = normalize(firstRecord.rowDirection?.length >= 3 ? firstRecord.rowDirection : [1, 0, 0]);
    const columnDirection = normalize(firstRecord.columnDirection?.length >= 3 ? firstRecord.columnDirection : [0, 1, 0]);
    const normalDirection = normalize(firstRecord.normalVector?.length >= 3 ? firstRecord.normalVector : [0, 0, 1]);
    const rowSpacingForCenter = rowSpacing || 1;
    const columnSpacingForCenter = columnSpacing || 1;

    return {
      rows,
      columns,
      depth: slices.length,
      rowSpacing,
      columnSpacing,
      sliceSpacing,
      originWorld,
      rowDirection,
      columnDirection,
      normalDirection,
      centerWorld: addVectors(
        addVectors(
          addVectors(originWorld, scaleVector(rowDirection, columnSpacingForCenter * (columns - 1) / 2)),
          scaleVector(columnDirection, rowSpacingForCenter * (rows - 1) / 2)
        ),
        scaleVector(normalDirection, sliceSpacing * (slices.length - 1) / 2)
      ),
      slices,
      skippedCount,
    };
  }

  self.addEventListener("message", async (event) => {
    const payload = event.data || {};
    if (payload.type !== "buildDicomVolume") {
      return;
    }

    try {
      const volume = await buildVolume(payload.records || [], payload.requestId, payload.options || {});
      const transferList = [];
      const seenBuffers = new Set();
      volume.slices.forEach((slice) => {
        const buffer = slice.pixels?.buffer;
        if (buffer && !seenBuffers.has(buffer)) {
          seenBuffers.add(buffer);
          transferList.push(buffer);
        }
      });
      self.postMessage(
        {
          type: "buildDicomVolumeResult",
          requestId: payload.requestId,
          ok: true,
          volume,
        },
        transferList
      );
    } catch (error) {
      self.postMessage({
        type: "buildDicomVolumeResult",
        requestId: payload.requestId,
        ok: false,
        unsupported: Boolean(error?.unsupported),
        error: error?.message || String(error),
      });
    }
  });
})();
