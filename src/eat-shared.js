(function (globalScope) {
  "use strict";

  function safeString(value) {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  }

  function prettifyPatientName(value) {
    const normalized = safeString(value);
    return normalized ? normalized.replace(/\^+/g, " ") : null;
  }

  function formatDicomDate(value) {
    const text = safeString(value);
    if (!text || text.length !== 8) {
      return null;
    }
    return text.slice(0, 4) + "-" + text.slice(4, 6) + "-" + text.slice(6, 8);
  }

  function formatDicomTime(value) {
    const text = safeString(value);
    if (!text) {
      return null;
    }

    const compact = text.split(".")[0];
    const hh = compact.slice(0, 2).padEnd(2, "0");
    const mm = compact.slice(2, 4).padEnd(2, "0");
    const ss = compact.slice(4, 6).padEnd(2, "0");
    return hh + ":" + mm + ":" + ss;
  }

  function combineDateTime(record) {
    const source = record || {};
    const date =
      formatDicomDate(source.acquisitionDate) ||
      formatDicomDate(source.contentDate) ||
      formatDicomDate(source.studyDate);
    const time =
      formatDicomTime(source.acquisitionTime) ||
      formatDicomTime(source.contentTime) ||
      formatDicomTime(source.studyTime);

    if (date && time) {
      return date + " " + time;
    }
    return date || time || "-";
  }

  function parseDicomAgeToYears(value) {
    const match = String(value || "").trim().match(/^(\d{1,3})([DWMY])$/i);
    if (!match) {
      return null;
    }

    const quantity = Number(match[1]);
    const unit = match[2].toUpperCase();
    if (!Number.isFinite(quantity)) {
      return null;
    }
    if (unit === "Y") {
      return quantity;
    }
    if (unit === "M") {
      return quantity / 12;
    }
    if (unit === "W") {
      return quantity / 52;
    }
    if (unit === "D") {
      return quantity / 365.25;
    }
    return null;
  }

  function fnv1aHash(value) {
    let hash = 0x811c9dc5;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash +=
        (hash << 1) +
        (hash << 4) +
        (hash << 7) +
        (hash << 8) +
        (hash << 24);
    }
    return (hash >>> 0).toString(36);
  }

  function getRecordFile(record) {
    return (record && record.file) || {};
  }

  function buildBackendStudyCacheKey(reconstruction) {
    const records = reconstruction && Array.isArray(reconstruction.records) ? reconstruction.records : [];
    const firstRecord = records[0] || {};
    const lastRecord = records.length ? records[records.length - 1] : firstRecord;
    const firstFile = getRecordFile(firstRecord);
    const samples = records.slice(0, 4).map(function (record, index) {
      const file = getRecordFile(record);
      return [
        safeString(record && record.sopInstanceUID) || "sample_" + index,
        safeString(file.webkitRelativePath) || safeString(file.name) || "",
        Number(file.size) || 0,
        Number(file.lastModified) || 0,
        Number(record && record.instanceNumber) || "",
      ].join(":");
    });

    const raw = [
      safeString(firstRecord.studyInstanceUID) || "",
      safeString(firstRecord.seriesInstanceUID) || "",
      safeString(firstRecord.frameOfReferenceUID) || "",
      safeString(firstRecord.patientId) || "",
      safeString(reconstruction && reconstruction.label) || "",
      records.length,
      Number(firstRecord.rows) || "",
      Number(firstRecord.columns) || "",
      Array.isArray(firstRecord.pixelSpacing) ? firstRecord.pixelSpacing.join("x") : "",
      Number(firstRecord.sliceThickness) || "",
      safeString(firstRecord.sopInstanceUID) || "",
      safeString(lastRecord.sopInstanceUID) || "",
      safeString(firstFile.name) || "",
      samples.join("|"),
    ].join("||");

    return "eat_" + fnv1aHash(raw || "empty");
  }

  globalScope.HagradEatShared = Object.freeze({
    safeString: safeString,
    prettifyPatientName: prettifyPatientName,
    formatDicomDate: formatDicomDate,
    formatDicomTime: formatDicomTime,
    combineDateTime: combineDateTime,
    parseDicomAgeToYears: parseDicomAgeToYears,
    buildBackendStudyCacheKey: buildBackendStudyCacheKey,
  });
})(typeof window !== "undefined" ? window : globalThis);
