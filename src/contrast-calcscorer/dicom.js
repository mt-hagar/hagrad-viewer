const sharedCore = window.HAGRadCore;

if (!sharedCore) {
  throw new Error("Missing shared core script: /src/shared/hagrad-core.js");
}

const {
  safeString,
  naturalCompare,
  parseNumericArray,
  parseFirstNumber,
  prettifyPatientName,
  dot,
  normalize,
  getNormalVector,
  combineDateTime,
  waitForAnimationFrame,
} = sharedCore;

const SUPPORTED_TRANSFER_SYNTAXES = new Set([
  "1.2.840.10008.1.2",
  "1.2.840.10008.1.2.1",
  "1.2.840.10008.1.2.2",
]);

let decoderFallbackReady = false;

function cloneTypedArray(source) {
  if (source instanceof Int16Array) {
    return new Int16Array(source);
  }
  if (source instanceof Uint16Array) {
    return new Uint16Array(source);
  }
  if (source instanceof Uint8Array) {
    return new Uint8Array(source);
  }
  if (source instanceof Int8Array) {
    return new Int8Array(source);
  }
  return new Float32Array(source);
}

function getRecordText(record) {
  return [
    record.seriesDescription,
    record.protocolName,
    record.imageType,
    record.convolutionKernel,
    record.acquisitionContrast,
    record.contrastBolusAgent,
    record.multienergyCtAcquisition,
    record.manufacturer,
    record.manufacturerModelName,
    record.softwareVersions,
  ]
    .map((value) => String(safeString(value) || "").toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function detectSeriesCharacterization(record) {
  const text = getRecordText(record);
  const spectralSignals = [];
  const vncSignals = [];
  const contrastSignals = [];

  if (/(spectral|dual[\s-]?energy|dual[\s-]?layer|multi[\s-]?energy|gemstone|gsi|monoener|getic|kev|photon[\s-]?count)/i.test(text)) {
    spectralSignals.push("spectral/dual-energy wording");
  }
  if (/(virtual[\s-]?(non[\s-]?contrast|unenhanced)|\bvnc\b|iodine[\s-]?(removed|subtraction)|material[\s-]?(suppressed|decomposition)|mat_removed|mat_specific)/i.test(text)) {
    vncSignals.push("VNC or iodine-removal wording");
  }
  if (/(cta|angi|contrast|coronary|cardiac)/i.test(text)) {
    contrastSignals.push("CTA/cardiac wording");
  }
  if (record.multienergyCtAcquisition && !/no/i.test(record.multienergyCtAcquisition)) {
    spectralSignals.push(`multienergy tag: ${record.multienergyCtAcquisition}`);
  }
  if (record.acquisitionContrast && !/none/i.test(record.acquisitionContrast)) {
    contrastSignals.push(`acquisition contrast: ${record.acquisitionContrast}`);
  }
  if (record.contrastBolusAgent) {
    contrastSignals.push("contrast bolus agent present");
  }

  const contrastLikely = contrastSignals.length > 0 || /(cta|angi|contrast)/i.test(text);
  const spectralCapable = spectralSignals.length > 0;
  const vncLike = vncSignals.length > 0;
  const nonContrastLikely =
    /(calcium|cac|cacs|score|non.?contrast|without contrast)/i.test(text) && !contrastLikely;
  const gatedLikely = /(gated|ecg|prospective|retrospective)/i.test(text);

  return {
    spectralCapable,
    vncLike,
    contrastLikely,
    nonContrastLikely,
    gatedLikely,
    spectralSignals,
    vncSignals,
    contrastSignals,
  };
}

function parseDicomHeader(file) {
  return file.arrayBuffer().then((buffer) => {
    const byteArray = new Uint8Array(buffer);
    const dataSet = dicomParser.parseDicom(byteArray, { untilTag: "x7fe00010" });
    const imageOrientationPatient = parseNumericArray(dataSet.string("x00200037"));
    const pixelDataElement = dataSet.elements.x7fe00010 || dataSet.elements.x7fe00008;

    const record = {
      file,
      transferSyntaxUID: safeString(dataSet.string("x00020010")),
      patientName: prettifyPatientName(dataSet.string("x00100010")),
      patientId: safeString(dataSet.string("x00100020")),
      patientBirthDate: safeString(dataSet.string("x00100030")),
      patientSex: safeString(dataSet.string("x00100040")),
      patientAge: safeString(dataSet.string("x00101010")),
      studyDate: safeString(dataSet.string("x00080020")),
      studyTime: safeString(dataSet.string("x00080030")),
      acquisitionDate: safeString(dataSet.string("x00080022")),
      acquisitionTime: safeString(dataSet.string("x00080032")),
      contentDate: safeString(dataSet.string("x00080023")),
      contentTime: safeString(dataSet.string("x00080033")),
      modality: safeString(dataSet.string("x00080060")),
      accessionNumber: safeString(dataSet.string("x00080050")),
      seriesDescription: safeString(dataSet.string("x0008103e")),
      protocolName: safeString(dataSet.string("x00181030")),
      imageType: safeString(dataSet.string("x00080008")),
      studyInstanceUID: safeString(dataSet.string("x0020000d")),
      seriesInstanceUID: safeString(dataSet.string("x0020000e")),
      frameOfReferenceUID: safeString(dataSet.string("x00200052")),
      seriesNumber: parseFirstNumber(dataSet.string("x00200011")),
      instanceNumber: parseFirstNumber(dataSet.string("x00200013")),
      numberOfFrames: parseFirstNumber(dataSet.string("x00280008")),
      rows: parseFirstNumber(dataSet.string("x00280010")),
      columns: parseFirstNumber(dataSet.string("x00280011")),
      pixelSpacing: parseNumericArray(dataSet.string("x00280030")),
      sliceThickness: parseFirstNumber(dataSet.string("x00180050")),
      reconstructionDiameter: parseFirstNumber(dataSet.string("x00181100")),
      kvp: parseFirstNumber(dataSet.string("x00180060")),
      convolutionKernel: safeString(dataSet.string("x00181210")),
      contrastBolusAgent: safeString(dataSet.string("x00180010")),
      acquisitionContrast: safeString(dataSet.string("x00089209")),
      manufacturer: safeString(dataSet.string("x00080070")),
      manufacturerModelName: safeString(dataSet.string("x00081090")),
      softwareVersions: safeString(dataSet.string("x00181020")),
      multienergyCtAcquisition: safeString(dataSet.string("x00189361")),
      imagePositionPatient: parseNumericArray(dataSet.string("x00200032")),
      imageOrientationPatient,
      rowDirection: normalize(imageOrientationPatient.slice(0, 3)),
      columnDirection: normalize(imageOrientationPatient.slice(3, 6)),
      normalVector: getNormalVector(imageOrientationPatient),
      windowCenter: parseFirstNumber(dataSet.string("x00281050")),
      windowWidth: parseFirstNumber(dataSet.string("x00281051")),
      rescaleIntercept: parseFirstNumber(dataSet.string("x00281052")),
      rescaleSlope: parseFirstNumber(dataSet.string("x00281053")),
      hasPixelData: Boolean(pixelDataElement),
    };

    record.characterization = detectSeriesCharacterization(record);
    return record;
  });
}

export async function parseDicomFiles(files) {
  const parsed = await Promise.all(
    Array.from(files || []).map(async (file) => {
      try {
        return await parseDicomHeader(file);
      } catch (_error) {
        return null;
      }
    })
  );
  return parsed.filter(Boolean);
}

function compareDicomRecords(left, right, normalVector) {
  if (normalVector && left.imagePositionPatient.length >= 3 && right.imagePositionPatient.length >= 3) {
    const positionLeft = dot(left.imagePositionPatient, normalVector);
    const positionRight = dot(right.imagePositionPatient, normalVector);
    if (positionLeft !== positionRight) {
      return positionLeft - positionRight;
    }
  }

  if (
    Number.isFinite(left.instanceNumber) &&
    Number.isFinite(right.instanceNumber) &&
    left.instanceNumber !== right.instanceNumber
  ) {
    return left.instanceNumber - right.instanceNumber;
  }

  return naturalCompare(left.file.name, right.file.name);
}

function groupSeries(records) {
  const grouped = new Map();
  records.forEach((record) => {
    const key =
      record.seriesInstanceUID ||
      `${record.studyInstanceUID || "study"}::${record.seriesDescription || "unnamed"}::${record.frameOfReferenceUID || "for"}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(record);
  });

  return Array.from(grouped.entries()).map(([key, group]) => {
    const normalVector = group.find((entry) => entry.normalVector)?.normalVector ?? null;
    group.sort((left, right) => compareDicomRecords(left, right, normalVector));
    const imageRecords = group.filter((record) => record.hasPixelData);
    return {
      key,
      records: group,
      imageRecords,
      pixelCount: imageRecords.length,
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
    const differences = [];
    for (let index = 1; index < positions.length; index += 1) {
      const delta = Math.abs(positions[index] - positions[index - 1]);
      if (delta > 0) {
        differences.push(delta);
      }
    }
    if (differences.length) {
      return differences.reduce((sum, value) => sum + value, 0) / differences.length;
    }
  }

  return records[0]?.sliceThickness || 1;
}

function rankSeriesCandidate(group) {
  const first = group.imageRecords[0] || group.records[0];
  const text = getRecordText(first);
  const characterization = first?.characterization || detectSeriesCharacterization(first || {});
  const reasons = [];
  const cautions = [];
  let score = 0;

  if (first?.modality === "CT") {
    score += 25;
    reasons.push("CT modality");
  } else {
    score -= 50;
    cautions.push("not CT modality");
  }

  if (characterization.contrastLikely) {
    score += 30;
    reasons.push("contrast-enhanced CTA/cardiac wording");
  } else {
    score -= 12;
    cautions.push("contrast metadata is not obvious");
  }

  if (/(cardiac|heart|coronary|ccta)/i.test(text)) {
    score += 18;
    reasons.push("cardiac/coronary wording");
  }

  if (characterization.gatedLikely) {
    score += 10;
    reasons.push("ECG-gated wording");
  }

  if (characterization.spectralCapable) {
    score += 12;
    reasons.push("spectral or dual-energy signal");
  }

  if (characterization.vncLike) {
    score += 6;
    reasons.push("VNC-like or iodine-removal wording");
    cautions.push("may be a derived series rather than the primary post-contrast CTA");
  }

  if (characterization.nonContrastLikely) {
    score -= 42;
    cautions.push("appears noncontrast or dedicated CAC-oriented");
  }

  if (/(calcium|cac|cacs|score)/i.test(text) && !characterization.contrastLikely) {
    score -= 18;
    cautions.push("series text suggests noncontrast calcium scoring");
  }

  if (/(lung|abd|pelvis|body|runoff|trauma|oncology)/i.test(text)) {
    score -= 16;
    cautions.push("generic body CT wording");
  }

  if (Number.isFinite(first?.sliceThickness)) {
    if (first.sliceThickness >= 0.4 && first.sliceThickness <= 1.5) {
      score += 10;
      reasons.push("thin CTA-style slice thickness");
    } else if (first.sliceThickness > 3.5) {
      score -= 10;
      cautions.push("slice thickness is relatively thick");
    }
  }

  if ((group.imageRecords?.length || 0) >= 80) {
    score += 8;
    reasons.push("enough slices for cardiac CTA review");
  }

  if (first?.rows >= 256 && first?.columns >= 256) {
    score += 4;
    reasons.push("diagnostic matrix size");
  }

  return {
    score,
    reasons,
    cautions,
    characterization,
  };
}

export function buildSeriesCandidates(records) {
  return groupSeries(records)
    .filter((group) => group.pixelCount)
    .map((group, index) => {
      const first = group.imageRecords[0];
      const rank = rankSeriesCandidate(group);
      return {
        id: group.key,
        seriesKey: group.key,
        label: first?.seriesDescription || first?.protocolName || `Series ${index + 1}`,
        records: group.imageRecords,
        allRecords: group.records,
        recordCount: group.imageRecords.length,
        studyLabel: first?.patientName || first?.patientId || "Unknown patient",
        acquisitionLabel: combineDateTime(first || {}),
        score: rank.score,
        reasons: rank.reasons,
        cautions: rank.cautions,
        characterization: rank.characterization,
        meta: first || null,
        volume: null,
      };
    })
    .sort((left, right) => right.score - left.score || right.recordCount - left.recordCount);
}

function initializeDecoderFallback() {
  if (decoderFallbackReady) {
    return;
  }
  if (!window.cornerstone || !window.cornerstoneWADOImageLoader || !window.dicomParser) {
    return;
  }
  cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
  cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
  decoderFallbackReady = true;
}

async function decodePixelDataWithCornerstone(record) {
  initializeDecoderFallback();
  if (!decoderFallbackReady) {
    throw new Error("Compressed DICOM decoding is not available in this viewer build.");
  }

  const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(record.file);
  try {
    const image = await cornerstone.loadAndCacheImage(imageId);
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
    };
  } finally {
    cornerstoneWADOImageLoader.wadouri.fileManager.remove?.(imageId);
  }
}

async function parsePixelData(record) {
  const byteArray = new Uint8Array(await record.file.arrayBuffer());
  const dataSet = dicomParser.parseDicom(byteArray);
  const transferSyntaxUID = safeString(dataSet.string("x00020010"));

  if (Number.isFinite(record.numberOfFrames) && record.numberOfFrames > 1) {
    throw new Error("Multi-frame DICOM is not supported in this prototype.");
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
  };
}

export async function buildVolume(records, options = {}) {
  const slices = [];
  let skippedCount = 0;
  const rowSpacing = records[0]?.pixelSpacing?.[0] || 1;
  const columnSpacing = records[0]?.pixelSpacing?.[1] || 1;
  const sliceSpacing = estimateSliceSpacing(records);
  let rows = null;
  let columns = null;

  for (let index = 0; index < records.length; index += 1) {
    if (options.onProgress && (index === 0 || index === records.length - 1 || index % 10 === 0)) {
      options.onProgress(`Loading volume ${index + 1} / ${records.length}...`);
    }

    let slice;
    try {
      slice = await parsePixelData(records[index]);
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

    slices.push(slice);
    if ((index + 1) % 8 === 0) {
      await waitForAnimationFrame();
    }
  }

  if (!slices.length) {
    throw new Error("No usable image slices could be decoded from the selected files.");
  }

  return {
    rows,
    columns,
    depth: slices.length,
    rowSpacing,
    columnSpacing,
    sliceSpacing,
    slices,
    skippedCount,
  };
}
