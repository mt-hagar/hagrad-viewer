(function (global) {
  "use strict";

  const sharedCore = global.HAGRadCore;
  if (!sharedCore) {
    throw new Error("Missing shared core script: /src/shared/hagrad-core.js");
  }

  const {
    safeString,
    parseNumericArray,
    parseFirstNumber,
    prettifyPatientName,
    naturalCompare,
    normalize,
    getNormalVector,
    cloneVector,
    dot,
    addVectors,
    scaleVector,
    waitForAnimationFrame,
    appendSourceDirectoryToKey,
  } = sharedCore;

  const SUPPORTED_TRANSFER_SYNTAXES = new Set([
    "1.2.840.10008.1.2",
    "1.2.840.10008.1.2.1",
  ]);
  const DICOM_HEADER_READ_LIMITS = [
    256 * 1024,
    1024 * 1024,
    4 * 1024 * 1024,
    16 * 1024 * 1024,
    Infinity,
  ];
  const DICOM_HEADER_PARSE_CONCURRENCY = Math.min(
    8,
    Math.max(3, Math.floor(((global.navigator && global.navigator.hardwareConcurrency) || 8) / 2))
  );
  const DICOM_HEADER_PROGRESS_INTERVAL = 50;

  function waitForUiYield() {
    if (typeof waitForAnimationFrame === "function") {
      return waitForAnimationFrame();
    }
    return Promise.resolve();
  }

  function cloneTypedArray(values) {
    if (values instanceof Int16Array) {
      return new Int16Array(values);
    }
    if (values instanceof Uint16Array) {
      return new Uint16Array(values);
    }
    if (values instanceof Int8Array) {
      return new Int16Array(values);
    }
    if (values instanceof Uint8Array) {
      return new Uint16Array(values);
    }
    return new Uint16Array(values || []);
  }

  function readDicomHeaderBuffer(file, byteLimit) {
    if (Number.isFinite(byteLimit) && file.size > byteLimit && typeof file.slice === "function") {
      return file.slice(0, byteLimit).arrayBuffer();
    }
    return file.arrayBuffer();
  }

  async function parseDicomHeader(file) {
    let lastError = null;
    for (const byteLimit of DICOM_HEADER_READ_LIMITS) {
      try {
        const buffer = await readDicomHeaderBuffer(file, byteLimit);
      const byteArray = new Uint8Array(buffer);
      const dataSet = global.dicomParser.parseDicom(byteArray, { untilTag: "x7fe00010" });
      const imageOrientationPatient = parseNumericArray(dataSet.string("x00200037"));
      const pixelDataElement = dataSet.elements.x7fe00010 || dataSet.elements.x7fe00008;
      const isPartialRead = Number.isFinite(byteLimit) && file.size > byteLimit;
      if (!pixelDataElement && isPartialRead) {
        continue;
      }

      return {
        file,
        transferSyntaxUID: safeString(dataSet.string("x00020010")),
        patientName: prettifyPatientName(dataSet.string("x00100010")),
        patientId: safeString(dataSet.string("x00100020")),
        patientBirthDate: safeString(dataSet.string("x00100030")),
        patientSex: safeString(dataSet.string("x00100040")),
        studyDate: safeString(dataSet.string("x00080020")),
        studyTime: safeString(dataSet.string("x00080030")),
        acquisitionDate: safeString(dataSet.string("x00080022")),
        acquisitionTime: safeString(dataSet.string("x00080032")),
        contentDate: safeString(dataSet.string("x00080023")),
        contentTime: safeString(dataSet.string("x00080033")),
        modality: safeString(dataSet.string("x00080060")),
        manufacturer: safeString(dataSet.string("x00080070")),
        stationName: safeString(dataSet.string("x00081010")),
        studyDescription: safeString(dataSet.string("x00081030")),
        seriesDescription: safeString(dataSet.string("x0008103e")),
        protocolName: safeString(dataSet.string("x00181030")),
        imageType: safeString(dataSet.string("x00080008")),
        manufacturerModelName: safeString(dataSet.string("x00081090")),
        softwareVersions: safeString(dataSet.string("x00181020")),
        accessionNumber: safeString(dataSet.string("x00080050")),
        studyInstanceUID: safeString(dataSet.string("x0020000d")),
        seriesInstanceUID: safeString(dataSet.string("x0020000e")),
        sopInstanceUID: safeString(dataSet.string("x00080018")),
        frameOfReferenceUID: safeString(dataSet.string("x00200052")),
        seriesNumber: parseFirstNumber(dataSet.string("x00200011")),
        instanceNumber: parseFirstNumber(dataSet.string("x00200013")),
        numberOfFrames: parseFirstNumber(dataSet.string("x00280008")),
        rows: parseFirstNumber(dataSet.string("x00280010")),
        columns: parseFirstNumber(dataSet.string("x00280011")),
        pixelSpacing: parseNumericArray(dataSet.string("x00280030")),
        sliceThickness: parseFirstNumber(dataSet.string("x00180050")),
        kvp: parseFirstNumber(dataSet.string("x00180060")),
        exposureTime: parseFirstNumber(dataSet.string("x00181150")),
        tubeCurrent: parseFirstNumber(dataSet.string("x00181151")),
        exposure: parseFirstNumber(dataSet.string("x00181152")),
        reconstructionDiameter: parseFirstNumber(dataSet.string("x00181100")),
        convolutionKernel: safeString(dataSet.string("x00181210")),
        ctdiVol: parseFirstNumber(dataSet.string("x00189345")),
        patientPosition: safeString(dataSet.string("x00185100")),
        imagePositionPatient: parseNumericArray(dataSet.string("x00200032")),
        imageOrientationPatient,
        rowDirection: normalize(imageOrientationPatient.slice(0, 3)),
        columnDirection: normalize(imageOrientationPatient.slice(3, 6)),
        normalVector: getNormalVector(imageOrientationPatient),
        windowCenter: parseFirstNumber(dataSet.string("x00281050")),
        windowWidth: parseFirstNumber(dataSet.string("x00281051")),
        rescaleIntercept: parseFirstNumber(dataSet.string("x00281052")),
        rescaleSlope: parseFirstNumber(dataSet.string("x00281053")),
        rescaleType: safeString(dataSet.string("x00281054")),
        hasPixelData: Boolean(pixelDataElement),
      };
      } catch (error) {
        lastError = error;
        if (!Number.isFinite(byteLimit) || file.size <= byteLimit) {
          break;
        }
      }
    }
    throw lastError || new Error("The DICOM header could not be parsed.");
  }

  async function parseDicomFiles(files, options = {}) {
    const sourceFiles = Array.from(files || []);
    const parsed = new Array(sourceFiles.length);
    const concurrency = Math.min(sourceFiles.length || 1, options.concurrency || DICOM_HEADER_PARSE_CONCURRENCY);
    let nextIndex = 0;
    let completed = 0;
    let lastYieldAt = 0;
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;

    async function worker() {
      while (nextIndex < sourceFiles.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        try {
          parsed[currentIndex] = await parseDicomHeader(sourceFiles[currentIndex]);
        } catch (_error) {
          parsed[currentIndex] = null;
        } finally {
          completed += 1;
          if (onProgress && (completed === sourceFiles.length || completed % DICOM_HEADER_PROGRESS_INTERVAL === 0)) {
            onProgress(completed, sourceFiles.length);
          }
          if (completed - lastYieldAt >= DICOM_HEADER_PROGRESS_INTERVAL) {
            lastYieldAt = completed;
            await waitForUiYield();
          }
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));
    return parsed.filter(Boolean);
  }

  function compareDicomRecords(left, right, normalVector) {
    if (normalVector && left.imagePositionPatient.length >= 3 && right.imagePositionPatient.length >= 3) {
      const leftPosition = dot(left.imagePositionPatient, normalVector);
      const rightPosition = dot(right.imagePositionPatient, normalVector);
      if (leftPosition !== rightPosition) {
        return leftPosition - rightPosition;
      }
    }

    if (
      Number.isFinite(left.instanceNumber) &&
      Number.isFinite(right.instanceNumber) &&
      left.instanceNumber !== right.instanceNumber
    ) {
      return left.instanceNumber - right.instanceNumber;
    }

    return naturalCompare(left.file?.name || "", right.file?.name || "");
  }

  function groupSeries(records) {
    const grouped = new Map();
    (records || []).forEach((record) => {
      if (!record?.hasPixelData) {
        return;
      }
      const key =
        appendSourceDirectoryToKey(
          record.seriesInstanceUID ||
            [
              record.studyInstanceUID || "study",
              record.seriesDescription || "series",
              record.protocolName || "protocol",
              record.frameOfReferenceUID || "for",
            ].join("::"),
          record
        );
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(record);
    });

    return Array.from(grouped.entries())
      .map(([key, group]) => {
        const normalVector = group.find((record) => record.normalVector)?.normalVector ?? null;
        group.sort((left, right) => compareDicomRecords(left, right, normalVector));
        return {
          key,
          records: group,
          pixelCount: group.length,
        };
      })
      .sort((left, right) => right.pixelCount - left.pixelCount || naturalCompare(left.key, right.key));
  }

  function buildSeriesCandidates(records) {
    return groupSeries(records).map((group, index) => {
      const first = group.records[0] || null;
      return {
        id: group.key,
        key: group.key,
        label:
          first?.seriesDescription ||
          first?.protocolName ||
          first?.studyDescription ||
          `Series ${index + 1}`,
        records: group.records,
        pixelCount: group.pixelCount,
        meta: first,
        volume: null,
      };
    });
  }

  function estimateSliceSpacing(records) {
    const normalVector = records.find((record) => record.normalVector)?.normalVector;
    const positions = normalVector
      ? records
          .map((record) =>
            record.imagePositionPatient.length >= 3 ? dot(record.imagePositionPatient, normalVector) : null
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

  function initializeDecoderFallback() {
    if (!global.cornerstone || !global.cornerstoneWADOImageLoader || !global.dicomParser) {
      return false;
    }
    global.cornerstoneWADOImageLoader.external.cornerstone = global.cornerstone;
    global.cornerstoneWADOImageLoader.external.dicomParser = global.dicomParser;
    return true;
  }

  async function decodePixelDataWithCornerstone(record) {
    if (!initializeDecoderFallback()) {
      throw new Error("Compressed DICOM decoding is not available in this viewer build.");
    }

    const imageId = global.cornerstoneWADOImageLoader.wadouri.fileManager.add(record.file);
    try {
      const image = await global.cornerstone.loadAndCacheImage(imageId);
      const pixelData = image.getPixelData?.();
      if (!pixelData || !Number.isFinite(image.rows) || !Number.isFinite(image.columns)) {
        throw new Error("The selected file could not be decoded into image pixels.");
      }
      if (image.color) {
        throw new Error("Only monochrome DICOM images are supported.");
      }

      return {
        rows: image.rows,
        columns: image.columns,
        pixels: cloneTypedArray(pixelData),
        slope: Number.isFinite(image.slope) ? image.slope : record.rescaleSlope ?? 1,
        intercept: Number.isFinite(image.intercept) ? image.intercept : record.rescaleIntercept ?? 0,
        units: record.rescaleType || (record.modality === "CT" ? "HU" : "rescaled"),
      };
    } finally {
      global.cornerstoneWADOImageLoader.wadouri.fileManager.remove?.(imageId);
    }
  }

  async function parsePixelData(record, options) {
    const allowMultiFrame = Boolean(options?.allowMultiFrame);
    const byteArray = new Uint8Array(await record.file.arrayBuffer());
    const dataSet = global.dicomParser.parseDicom(byteArray);
    const transferSyntaxUID = safeString(dataSet.string("x00020010"));

    if (!allowMultiFrame && Number.isFinite(record.numberOfFrames) && record.numberOfFrames > 1) {
      throw new Error("Multi-frame DICOM is not supported in this phase of NoiseLab.");
    }

    const rows = parseFirstNumber(dataSet.string("x00280010"));
    const columns = parseFirstNumber(dataSet.string("x00280011"));
    const samplesPerPixel = parseFirstNumber(dataSet.string("x00280002")) || 1;
    const bitsAllocated = parseFirstNumber(dataSet.string("x00280100")) || 16;
    const pixelRepresentation = parseFirstNumber(dataSet.string("x00280103")) || 0;
    const pixelDataElement = dataSet.elements.x7fe00010;

    if (!SUPPORTED_TRANSFER_SYNTAXES.has(transferSyntaxUID || "") || pixelDataElement?.fragments?.length) {
      return decodePixelDataWithCornerstone(record);
    }

    if (samplesPerPixel !== 1) {
      throw new Error("Only monochrome DICOM images are supported.");
    }

    if (!pixelDataElement || !Number.isFinite(rows) || !Number.isFinite(columns)) {
      return decodePixelDataWithCornerstone(record);
    }

    const sampleCount = rows * columns;
    const byteOffset = byteArray.byteOffset + pixelDataElement.dataOffset;
    let pixels;

    if (bitsAllocated === 16) {
      const view =
        pixelRepresentation === 1
          ? new Int16Array(byteArray.buffer, byteOffset, sampleCount)
          : new Uint16Array(byteArray.buffer, byteOffset, sampleCount);
      pixels = pixelRepresentation === 1 ? new Int16Array(sampleCount) : new Uint16Array(sampleCount);
      pixels.set(view);
    } else if (bitsAllocated === 8) {
      const view =
        pixelRepresentation === 1
          ? new Int8Array(byteArray.buffer, byteOffset, sampleCount)
          : new Uint8Array(byteArray.buffer, byteOffset, sampleCount);
      pixels = pixelRepresentation === 1 ? new Int16Array(sampleCount) : new Uint16Array(sampleCount);
      for (let index = 0; index < sampleCount; index += 1) {
        pixels[index] = view[index];
      }
    } else {
      throw new Error(`Unsupported Bits Allocated value: ${bitsAllocated}`);
    }

    return {
      rows,
      columns,
      pixels,
      slope: parseFirstNumber(dataSet.string("x00281053")) ?? record.rescaleSlope ?? 1,
      intercept: parseFirstNumber(dataSet.string("x00281052")) ?? record.rescaleIntercept ?? 0,
      units: record.rescaleType || (record.modality === "CT" ? "HU" : "rescaled"),
    };
  }

  async function buildVolume(records, options) {
    const slices = [];
    let skippedCount = 0;
    const rowSpacing = records[0]?.pixelSpacing?.[0] || null;
    const columnSpacing = records[0]?.pixelSpacing?.[1] || null;
    const sliceSpacing = estimateSliceSpacing(records);
    let rows = null;
    let columns = null;

    for (let index = 0; index < records.length; index += 1) {
      if (typeof options?.statusCallback === "function") {
        options.statusCallback(index + 1, records.length);
      }

      let slice;
      try {
        slice = await parsePixelData(records[index], options);
      } catch (_error) {
        skippedCount += 1;
        continue;
      }

      rows = rows ?? slice.rows;
      columns = columns ?? slice.columns;
      if (slice.rows !== rows || slice.columns !== columns) {
        skippedCount += 1;
        continue;
      }

      slices.push({
        ...slice,
        record: records[index],
      });

      if ((index + 1) % 8 === 0) {
        await waitForUiYield();
      }
    }

    if (!slices.length) {
      throw new Error("No usable image slices could be decoded from the selected files.");
    }

    const firstRecord = records[0];
    const originWorld =
      firstRecord.imagePositionPatient.length >= 3 ? cloneVector(firstRecord.imagePositionPatient) : [0, 0, 0];
    const rowDirection = normalize(firstRecord.rowDirection || [1, 0, 0]);
    const columnDirection = normalize(firstRecord.columnDirection || [0, 1, 0]);
    const normalDirection = normalize(firstRecord.normalVector || [0, 0, 1]);

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
          addVectors(originWorld, scaleVector(rowDirection, (columnSpacing || 1) * (columns - 1) / 2)),
          scaleVector(columnDirection, (rowSpacing || 1) * (rows - 1) / 2)
        ),
        scaleVector(normalDirection, sliceSpacing * (slices.length - 1) / 2)
      ),
      slices,
      records,
      skippedCount,
    };
  }

  function pixelCenterToPatient(record, columnIndex, rowIndex) {
    if (
      !record ||
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
    if (!Number.isFinite(spacingX) || !Number.isFinite(spacingY)) {
      return null;
    }

    return addVectors(
      addVectors(
        cloneVector(record.imagePositionPatient),
        scaleVector(record.rowDirection, columnIndex * spacingX)
      ),
      scaleVector(record.columnDirection, rowIndex * spacingY)
    );
  }

  function pixelCenterToLocalMm(record, columnIndex, rowIndex) {
    const spacingY = record?.pixelSpacing?.[0];
    const spacingX = record?.pixelSpacing?.[1];
    if (!Number.isFinite(spacingX) || !Number.isFinite(spacingY)) {
      return null;
    }
    return {
      xMm: columnIndex * spacingX,
      yMm: rowIndex * spacingY,
    };
  }

  function getCalibrationUnits(record, slice) {
    return (
      safeString(slice?.units) ||
      safeString(record?.rescaleType) ||
      (safeString(record?.modality) === "CT" ? "HU" : "rescaled")
    );
  }

  global.HAGRadDicom = Object.freeze({
    SUPPORTED_TRANSFER_SYNTAXES,
    parseDicomHeader,
    parseDicomFiles,
    groupSeries,
    buildSeriesCandidates,
    estimateSliceSpacing,
    buildVolume,
    pixelCenterToPatient,
    pixelCenterToLocalMm,
    getCalibrationUnits,
  });
})(typeof window !== "undefined" ? window : globalThis);
