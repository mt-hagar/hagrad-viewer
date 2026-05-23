(function () {
  "use strict";

  importScripts("/vendor/dicomParser.min.js");

  const DICOM_HEADER_READ_LIMITS = [
    256 * 1024,
    1024 * 1024,
    4 * 1024 * 1024,
    16 * 1024 * 1024,
    Infinity,
  ];
  const DICOM_HEADER_FINGERPRINT_BYTES = 16 * 1024;
  const RADIATION_REPORT_KEYWORDS = ["dose", "radiation", "ctdi", "dlp", "rdsr"];
  const CONTRAST_REPORT_KEYWORDS = ["contrast", "bolus", "iodine", "saline", "inject", "flow rate"];

  function safeString(value) {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  function parseNumericArray(value) {
    if (!value) {
      return [];
    }
    return String(value)
      .split("\\")
      .map((part) => Number.parseFloat(part))
      .filter(Number.isFinite);
  }

  function parseFirstNumber(value) {
    const first = parseNumericArray(value)[0];
    return Number.isFinite(first) ? first : null;
  }

  function readNumber(dataSet, tag) {
    const stringValue = parseFirstNumber(dataSet.string(tag));
    if (Number.isFinite(stringValue)) {
      return stringValue;
    }

    const element = dataSet.elements[tag];
    if (!element) {
      return null;
    }

    const vr = element.vr || "";
    const readers = {
      US: "uint16",
      SS: "int16",
      UL: "uint32",
      SL: "int32",
      FL: "float",
      FD: "double",
    };
    const readerName = readers[vr];
    if (!readerName || typeof dataSet[readerName] !== "function") {
      return null;
    }

    const value = dataSet[readerName](tag);
    return Number.isFinite(value) ? value : null;
  }

  function prettifyPatientName(value) {
    return safeString(value)?.replace(/\^+/g, " ") ?? null;
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function normalize(vector) {
    const length = Math.sqrt(dot(vector, vector));
    if (!length) {
      return [0, 0, 0];
    }
    return [vector[0] / length, vector[1] / length, vector[2] / length];
  }

  function getNormalVector(imageOrientationPatient) {
    if (!Array.isArray(imageOrientationPatient) || imageOrientationPatient.length !== 6) {
      return null;
    }
    return normalize(cross(normalize(imageOrientationPatient.slice(0, 3)), normalize(imageOrientationPatient.slice(3, 6))));
  }

  function computeBodyMassIndex(weightKg, sizeM) {
    if (!Number.isFinite(weightKg) || !Number.isFinite(sizeM) || sizeM <= 0) {
      return null;
    }
    return weightKg / (sizeM * sizeM);
  }

  function getFileSourceKey(file) {
    return [file?.name || "file", file?.size || 0, file?.lastModified || 0].join("::");
  }

  function normalizeReportText(value) {
    return String(value || "")
      .replace(/[\u0000-\u001f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractReportSnippet(text, keywords) {
    if (!text) {
      return null;
    }
    const lower = text.toLowerCase();
    let bestIndex = -1;
    keywords.forEach((keyword) => {
      const index = lower.indexOf(keyword);
      if (index >= 0 && (bestIndex < 0 || index < bestIndex)) {
        bestIndex = index;
      }
    });
    if (bestIndex < 0) {
      return null;
    }
    const start = Math.max(0, bestIndex - 90);
    const end = Math.min(text.length, bestIndex + 210);
    return text.slice(start, end).trim();
  }

  function extractReportNumber(text, regex) {
    if (!text) {
      return null;
    }
    const match = regex.exec(text);
    if (!match) {
      return null;
    }
    const value = Number.parseFloat(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  function emptyReportInsights() {
    return {
      textSummary: null,
      radiationSnippet: null,
      contrastSnippet: null,
      ctdiVolMgy: null,
      dlpMgyCm: null,
      contrastVolumeMl: null,
      contrastFlowRateMlPerS: null,
    };
  }

  function extractReportInsights(buffer, hasPixelData) {
    if (hasPixelData) {
      return emptyReportInsights();
    }

    let decodedText = "";
    try {
      decodedText = new TextDecoder("latin1").decode(new Uint8Array(buffer));
    } catch (_error) {
      decodedText = "";
    }

    const normalized = normalizeReportText(decodedText);
    if (!normalized) {
      return emptyReportInsights();
    }

    return {
      textSummary: normalized.slice(0, 420),
      radiationSnippet: extractReportSnippet(normalized, RADIATION_REPORT_KEYWORDS),
      contrastSnippet: extractReportSnippet(normalized, CONTRAST_REPORT_KEYWORDS),
      ctdiVolMgy: extractReportNumber(normalized, /\bCTDI(?:VOL)?\b[^0-9]{0,24}([0-9]+(?:\.[0-9]+)?)/i),
      dlpMgyCm: extractReportNumber(normalized, /\bDLP\b[^0-9]{0,24}([0-9]+(?:\.[0-9]+)?)/i),
      contrastVolumeMl: extractReportNumber(
        normalized,
        /\b(?:CONTRAST(?: BOLUS)? VOLUME|BOLUS VOLUME|VOLUME)\b[^0-9]{0,24}([0-9]+(?:\.[0-9]+)?)\s*(?:ML|CC)\b/i
      ),
      contrastFlowRateMlPerS: extractReportNumber(
        normalized,
        /\b(?:FLOW RATE|RATE)\b[^0-9]{0,24}([0-9]+(?:\.[0-9]+)?)\s*(?:ML\/S|ML\/SEC|CC\/S)\b/i
      ),
    };
  }

  function readDicomHeaderBuffer(file, byteLimit) {
    if (Number.isFinite(byteLimit) && file.size > byteLimit && typeof file.slice === "function") {
      return file.slice(0, byteLimit).arrayBuffer();
    }
    return file.arrayBuffer();
  }

  function arrayBufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  async function computeHeaderFingerprint(buffer) {
    if (!self.crypto?.subtle) {
      return null;
    }
    const sample = buffer.slice(0, Math.min(buffer.byteLength, DICOM_HEADER_FINGERPRINT_BYTES));
    const digest = await self.crypto.subtle.digest("SHA-256", sample);
    return arrayBufferToHex(digest);
  }

  async function parseDicomHeader(file, byteLimits) {
    let lastError = null;
    const limits = Array.isArray(byteLimits) && byteLimits.length ? byteLimits : DICOM_HEADER_READ_LIMITS;
    for (const byteLimit of limits) {
      try {
        const buffer = await readDicomHeaderBuffer(file, byteLimit);
        const byteArray = new Uint8Array(buffer);
        const dataSet = dicomParser.parseDicom(byteArray, { untilTag: "x7fe00010" });
        const pixelDataElement = dataSet.elements.x7fe00010 || dataSet.elements.x7fe00008;
        const isPartialRead = Number.isFinite(byteLimit) && file.size > byteLimit;
        if (!pixelDataElement && isPartialRead) {
          continue;
        }

        const imageOrientationPatient = parseNumericArray(dataSet.string("x00200037"));
        const rowDirection = normalize(imageOrientationPatient.slice(0, 3));
        const columnDirection = normalize(imageOrientationPatient.slice(3, 6));
        const normalVector = getNormalVector(imageOrientationPatient);
        const patientSizeM = readNumber(dataSet, "x00101020");
        const patientWeightKg = readNumber(dataSet, "x00101030");
        const ctdiVolMgy = readNumber(dataSet, "x00189345");
        const exposureTimeMs = readNumber(dataSet, "x00181150");
        const tubeCurrentMa = readNumber(dataSet, "x00181151");
        const exposureMas = readNumber(dataSet, "x00181152");
        const contrastBolusTotalDose = readNumber(dataSet, "x00181044");
        const reportInsights = extractReportInsights(buffer, Boolean(pixelDataElement));
        const headerFingerprint = await computeHeaderFingerprint(buffer);

        return {
          headerFingerprint,
          sourceKey: getFileSourceKey(file),
          sopClassUID: safeString(dataSet.string("x00080016")),
          transferSyntaxUID: safeString(dataSet.string("x00020010")),
          patientName: prettifyPatientName(dataSet.string("x00100010")),
          patientId: safeString(dataSet.string("x00100020")),
          patientBirthDate: safeString(dataSet.string("x00100030")),
          patientSex: safeString(dataSet.string("x00100040")),
          patientAge: safeString(dataSet.string("x00101010")),
          patientSizeM,
          patientWeightKg,
          patientBmi: computeBodyMassIndex(patientWeightKg, patientSizeM),
          accessionNumber: safeString(dataSet.string("x00080050")),
          studyDate: safeString(dataSet.string("x00080020")),
          studyTime: safeString(dataSet.string("x00080030")),
          seriesDate: safeString(dataSet.string("x00080021")),
          seriesTime: safeString(dataSet.string("x00080031")),
          acquisitionDate: safeString(dataSet.string("x00080022")),
          acquisitionTime: safeString(dataSet.string("x00080032")),
          contentDate: safeString(dataSet.string("x00080023")),
          contentTime: safeString(dataSet.string("x00080033")),
          modality: safeString(dataSet.string("x00080060")),
          manufacturer: safeString(dataSet.string("x00080070")),
          institutionName: safeString(dataSet.string("x00080080")),
          stationName: safeString(dataSet.string("x00081010")),
          studyDescription: safeString(dataSet.string("x00081030")),
          seriesDescription: safeString(dataSet.string("x0008103e")),
          manufacturerModelName: safeString(dataSet.string("x00081090")),
          softwareVersions: safeString(dataSet.string("x00181020")),
          protocolName: safeString(dataSet.string("x00181030")),
          contrastBolusAgent: safeString(dataSet.string("x00180010")),
          bodyPartExamined: safeString(dataSet.string("x00180015")),
          studyInstanceUID: safeString(dataSet.string("x0020000d")),
          seriesInstanceUID: safeString(dataSet.string("x0020000e")),
          sopInstanceUID: safeString(dataSet.string("x00080018")),
          studyId: safeString(dataSet.string("x00200010")),
          seriesNumber: readNumber(dataSet, "x00200011"),
          acquisitionNumber: readNumber(dataSet, "x00200012"),
          frameOfReferenceUID: safeString(dataSet.string("x00200052")),
          instanceNumber: readNumber(dataSet, "x00200013"),
          imageType: safeString(dataSet.string("x00080008")),
          numberOfFrames: readNumber(dataSet, "x00280008"),
          rows: readNumber(dataSet, "x00280010"),
          columns: readNumber(dataSet, "x00280011"),
          pixelSpacing: parseNumericArray(dataSet.string("x00280030")),
          imagerPixelSpacing: parseNumericArray(dataSet.string("x00181164")),
          photometricInterpretation: safeString(dataSet.string("x00280004")),
          samplesPerPixel: readNumber(dataSet, "x00280002"),
          bitsAllocated: readNumber(dataSet, "x00280100"),
          pixelRepresentation: readNumber(dataSet, "x00280103"),
          sliceThickness: readNumber(dataSet, "x00180050"),
          spacingBetweenSlices: readNumber(dataSet, "x00180088"),
          kvp: readNumber(dataSet, "x00180060"),
          dataCollectionDiameter: readNumber(dataSet, "x00180090"),
          reconstructionDiameter: readNumber(dataSet, "x00181100"),
          distanceSourceToDetector: readNumber(dataSet, "x00181110"),
          distanceSourceToPatient: readNumber(dataSet, "x00181111"),
          gantryDetectorTilt: readNumber(dataSet, "x00181120"),
          tableHeight: readNumber(dataSet, "x00181130"),
          tableTraverse: readNumber(dataSet, "x00181131"),
          rotationDirection: safeString(dataSet.string("x00181140")),
          exposureTime: exposureTimeMs,
          exposureTimeMs,
          tubeCurrent: tubeCurrentMa,
          tubeCurrentMa,
          exposure: exposureMas,
          exposureMas,
          filterType: safeString(dataSet.string("x00181160")),
          focalSpots: safeString(dataSet.string("x00181190")),
          convolutionKernel: safeString(dataSet.string("x00181210")),
          patientPosition: safeString(dataSet.string("x00185100")),
          singleCollimationWidth: readNumber(dataSet, "x00189306"),
          totalCollimationWidth: readNumber(dataSet, "x00189307"),
          revolutionTimeSec: readNumber(dataSet, "x00189305"),
          tableFeedPerRotation: readNumber(dataSet, "x00189310"),
          spiralPitchFactor: readNumber(dataSet, "x00189311"),
          ctdiVol: ctdiVolMgy,
          ctdiVolMgy,
          doseAreaProduct: readNumber(dataSet, "x0018115e"),
          contrastBolusRoute: safeString(dataSet.string("x00181040")),
          contrastBolusVolumeMl: readNumber(dataSet, "x00181041"),
          contrastBolusStartTime: safeString(dataSet.string("x00181042")),
          contrastBolusStopTime: safeString(dataSet.string("x00181043")),
          contrastBolusTotalDose,
          contrastBolusTotalDoseMl: contrastBolusTotalDose,
          contrastFlowRateMlPerS: readNumber(dataSet, "x00181046"),
          contrastFlowDurationSec: readNumber(dataSet, "x00181047"),
          contrastIngredient: safeString(dataSet.string("x00181048")),
          contrastIngredientConcentrationMgMl: readNumber(dataSet, "x00181049"),
          imagePositionPatient: parseNumericArray(dataSet.string("x00200032")),
          imageOrientationPatient,
          rowDirection,
          columnDirection,
          normalVector,
          sliceLocation: readNumber(dataSet, "x00201041"),
          windowCenter: readNumber(dataSet, "x00281050"),
          windowWidth: readNumber(dataSet, "x00281051"),
          rescaleIntercept: readNumber(dataSet, "x00281052"),
          rescaleSlope: readNumber(dataSet, "x00281053"),
          rescaleType: safeString(dataSet.string("x00281054")),
          frameTime: readNumber(dataSet, "x00181063"),
          cineRate: readNumber(dataSet, "x00180040"),
          primaryAngle: readNumber(dataSet, "x00181510"),
          secondaryAngle: readNumber(dataSet, "x00181511"),
          reportTextSummary: reportInsights.textSummary,
          reportRadiationSnippet: reportInsights.radiationSnippet,
          reportContrastSnippet: reportInsights.contrastSnippet,
          reportCtdiVolMgy: reportInsights.ctdiVolMgy,
          reportDlpMgyCm: reportInsights.dlpMgyCm,
          reportContrastVolumeMl: reportInsights.contrastVolumeMl,
          reportContrastFlowRateMlPerS: reportInsights.contrastFlowRateMlPerS,
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

  self.addEventListener("message", async (event) => {
    const payload = event.data || {};
    if (payload.type !== "parseDicomHeader") {
      return;
    }

    try {
      const record = await parseDicomHeader(payload.file, payload.byteLimits);
      self.postMessage({
        requestId: payload.requestId,
        index: payload.index,
        ok: true,
        record,
      });
    } catch (error) {
      self.postMessage({
        requestId: payload.requestId,
        index: payload.index,
        ok: false,
        error: error?.message || String(error),
      });
    }
  });
})();
