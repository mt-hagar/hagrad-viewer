(function (global) {
  "use strict";

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeAngleDegrees(value) {
    let angle = value;
    while (angle > 180) {
      angle -= 360;
    }
    while (angle < -180) {
      angle += 360;
    }
    return angle;
  }

  function safeString(value) {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
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

  function prettifyPatientName(value) {
    return safeString(value)?.replace(/\^+/g, " ") ?? null;
  }

  function isSamePatientStudy(left, right) {
    if (!left || !right) {
      return true;
    }

    if (left.studyInstanceUID && right.studyInstanceUID) {
      return left.studyInstanceUID === right.studyInstanceUID;
    }

    if (left.patientId && right.patientId) {
      return left.patientId === right.patientId;
    }

    return true;
  }

  function getFileRelativePath(file) {
    return safeString(file?.webkitRelativePath) || safeString(file?.relativePath) || safeString(file?.name) || "";
  }

  function getFileDirectoryPath(file) {
    const normalized = getFileRelativePath(file).replace(/\\/g, "/");
    const slashIndex = normalized.lastIndexOf("/");
    return slashIndex > 0 ? normalized.slice(0, slashIndex) : "";
  }

  function appendSourceDirectoryToKey(baseKey, record) {
    const sourceDirectory = getFileDirectoryPath(record?.file);
    return sourceDirectory ? `${baseKey}::source-folder:${sourceDirectory}` : baseKey;
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

  function subtractVectors(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function scaleVector(vector, scalar) {
    return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
  }

  function cloneVector(vector) {
    return [vector[0], vector[1], vector[2]];
  }

  function getNormalVector(imageOrientationPatient) {
    if (!Array.isArray(imageOrientationPatient) || imageOrientationPatient.length !== 6) {
      return null;
    }

    const row = normalize(imageOrientationPatient.slice(0, 3));
    const column = normalize(imageOrientationPatient.slice(3, 6));
    return normalize(cross(row, column));
  }

  function formatDimension(value, suffix) {
    return Number.isFinite(value) ? `${value.toFixed(3).replace(/\.?0+$/, "")} ${suffix || "mm"}` : "-";
  }

  function formatSpacing(spacing) {
    if (!Array.isArray(spacing) || spacing.length < 2) {
      return "-";
    }

    return `${spacing[0].toFixed(3).replace(/\.?0+$/, "")} x ${spacing[1]
      .toFixed(3)
      .replace(/\.?0+$/, "")} mm`;
  }

  function formatDicomDate(value) {
    const text = safeString(value);
    if (!text || text.length !== 8) {
      return null;
    }
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
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
    return `${hh}:${mm}:${ss}`;
  }

  function combineDateTime(record) {
    const date =
      formatDicomDate(record.acquisitionDate) ||
      formatDicomDate(record.contentDate) ||
      formatDicomDate(record.studyDate);
    const time =
      formatDicomTime(record.acquisitionTime) ||
      formatDicomTime(record.contentTime) ||
      formatDicomTime(record.studyTime);

    if (date && time) {
      return `${date} ${time}`;
    }
    return date || time || "-";
  }

  function sanitizeFilePart(value, fallback) {
    const cleaned = String(value || "")
      .trim()
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "");
    return cleaned || fallback;
  }

  function waitForAnimationFrame() {
    return new Promise((resolve) => global.requestAnimationFrame(resolve));
  }

  function wait(milliseconds) {
    return new Promise((resolve) => global.setTimeout(resolve, milliseconds));
  }

  let loadProfilingOverride = false;
  const loadProfiles = [];

  function nowMs() {
    return typeof global.performance?.now === "function" ? global.performance.now() : Date.now();
  }

  function isLoadProfilingEnabled() {
    if (loadProfilingOverride || global.__HAGRadLoadProfiling === true) {
      return true;
    }
    try {
      const params = new URLSearchParams(global.location?.search || "");
      return params.get("hagradProfile") === "1" || params.get("profileLoad") === "1";
    } catch (_error) {
      return false;
    }
  }

  function sanitizeProfileDetails(details) {
    const source = details && typeof details === "object" ? details : {};
    const sanitized = {};
    Object.entries(source).forEach(([key, value]) => {
      if (typeof value === "number" || typeof value === "boolean" || value === null) {
        sanitized[key] = value;
      } else if (typeof value === "string") {
        sanitized[key] = value.slice(0, 80);
      }
    });
    return sanitized;
  }

  function readMemorySample(label) {
    const memory = global.performance?.memory;
    if (!memory) {
      return null;
    }
    const toMb = (value) => Math.round((value / (1024 * 1024)) * 10) / 10;
    return {
      label,
      usedMb: Number.isFinite(memory.usedJSHeapSize) ? toMb(memory.usedJSHeapSize) : null,
      totalMb: Number.isFinite(memory.totalJSHeapSize) ? toMb(memory.totalJSHeapSize) : null,
      limitMb: Number.isFinite(memory.jsHeapSizeLimit) ? toMb(memory.jsHeapSizeLimit) : null,
      atMs: Math.round(nowMs() * 10) / 10,
    };
  }

  function setLoadProfilingEnabled(enabled) {
    loadProfilingOverride = Boolean(enabled);
    global.__HAGRadLoadProfiling = loadProfilingOverride;
    return loadProfilingOverride;
  }

  function getLoadProfiles() {
    return loadProfiles.slice();
  }

  function clearLoadProfiles() {
    loadProfiles.length = 0;
  }

  function createLoadProfiler(context, details) {
    const enabled = isLoadProfilingEnabled();
    if (!enabled) {
      const noop = () => {};
      return {
        enabled: false,
        setDetail: noop,
        count: noop,
        record: noop,
        start: () => noop,
        sampleMemory: noop,
        finish: noop,
      };
    }

    const report = {
      context: String(context || "load"),
      startedAt: new Date().toISOString(),
      details: sanitizeProfileDetails(details),
      counts: {},
      phases: [],
      memorySamples: [],
    };
    const startMs = nowMs();
    const phaseEntries = new Map();

    function setDetail(key, value) {
      Object.assign(report.details, sanitizeProfileDetails({ [key]: value }));
    }

    function count(key, value = 1) {
      if (!Number.isFinite(value)) {
        return;
      }
      report.counts[key] = (report.counts[key] || 0) + value;
    }

    function record(label, durationMs, phaseDetails) {
      if (!Number.isFinite(durationMs)) {
        return;
      }
      const phaseLabel = String(label || "phase");
      const details = sanitizeProfileDetails(phaseDetails);
      const key = `${phaseLabel}:${JSON.stringify(details)}`;
      let entry = phaseEntries.get(key);
      if (!entry) {
        entry = {
          label: phaseLabel,
          count: 0,
          totalMs: 0,
          minMs: null,
          maxMs: 0,
          avgMs: 0,
          ...details,
        };
        phaseEntries.set(key, entry);
        report.phases.push(entry);
      }
      entry.count += 1;
      entry.totalMs = Math.round((entry.totalMs + durationMs) * 10) / 10;
      entry.minMs = entry.minMs === null ? Math.round(durationMs * 10) / 10 : Math.min(entry.minMs, Math.round(durationMs * 10) / 10);
      entry.maxMs = Math.max(entry.maxMs, Math.round(durationMs * 10) / 10);
      entry.avgMs = Math.round((entry.totalMs / entry.count) * 10) / 10;
    }

    function start(label, phaseDetails) {
      const phaseStart = nowMs();
      return (endDetails) => {
        record(label, nowMs() - phaseStart, {
          ...sanitizeProfileDetails(phaseDetails),
          ...sanitizeProfileDetails(endDetails),
        });
      };
    }

    function sampleMemory(label) {
      const sample = readMemorySample(label);
      if (sample) {
        report.memorySamples.push(sample);
      }
    }

    function finish(extraDetails) {
      report.totalMs = Math.round((nowMs() - startMs) * 10) / 10;
      Object.assign(report.details, sanitizeProfileDetails(extraDetails));
      loadProfiles.push(report);
      if (loadProfiles.length > 20) {
        loadProfiles.shift();
      }
      if (global.console?.info) {
        global.console.info("[HAGRad load profile]", report);
      }
      return report;
    }

    sampleMemory("start");
    return {
      enabled: true,
      setDetail,
      count,
      record,
      start,
      sampleMemory,
      finish,
    };
  }

  const DICOM_HEADER_INDEX_DB_NAME = "hagrad-dicom-header-index-v1";
  const DICOM_HEADER_INDEX_STORE = "headers";
  const DICOM_HEADER_INDEX_SCHEMA = 2;
  const DICOM_HEADER_FINGERPRINT_BYTES = 16 * 1024;

  function canUseDicomHeaderWorker() {
    return (
      typeof global.Worker === "function" &&
      global.location?.protocol !== "file:" &&
      typeof global.location?.origin === "string"
    );
  }

  function getDicomHeaderWorkerUrl() {
    return new URL("/src/shared/hagrad-dicom-worker.js", global.location.origin).href;
  }

  function getDicomHeaderWorkerConcurrency(requestedConcurrency, fileCount) {
    const hardwareConcurrency =
      (global.navigator && Number.isFinite(global.navigator.hardwareConcurrency)
        ? global.navigator.hardwareConcurrency
        : 4) || 4;
    const defaultConcurrency = Math.min(4, Math.max(1, Math.floor(hardwareConcurrency / 2)));
    const requested = Number.isFinite(requestedConcurrency) ? requestedConcurrency : defaultConcurrency;
    return Math.max(1, Math.min(fileCount || 1, Math.floor(requested)));
  }

  function getFileSourceKey(file) {
    return [file?.name || "file", file?.size || 0, file?.lastModified || 0].join("::");
  }

  function canUseDicomHeaderIndex() {
    return Boolean(global.indexedDB && global.crypto?.subtle && typeof global.TextEncoder === "function");
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
    });
  }

  function openDicomHeaderIndexDb() {
    if (!canUseDicomHeaderIndex()) {
      return Promise.resolve(null);
    }

    return new Promise((resolve, reject) => {
      const request = global.indexedDB.open(DICOM_HEADER_INDEX_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DICOM_HEADER_INDEX_STORE)) {
          db.createObjectStore(DICOM_HEADER_INDEX_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open the DICOM header index."));
    });
  }

  function getDicomHeaderIndexKey(file) {
    const relativePath = getFileRelativePath(file) || getFileSourceKey(file);
    return [
      `schema-${DICOM_HEADER_INDEX_SCHEMA}`,
      relativePath,
      file?.size || 0,
      file?.lastModified || 0,
    ].join("::");
  }

  function arrayBufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  async function computeDicomHeaderFingerprint(file) {
    if (!global.crypto?.subtle || typeof file?.slice !== "function") {
      return null;
    }
    const byteLength = Math.min(file.size || 0, DICOM_HEADER_FINGERPRINT_BYTES);
    const buffer = await file.slice(0, byteLength).arrayBuffer();
    const digest = await global.crypto.subtle.digest("SHA-256", buffer);
    return arrayBufferToHex(digest);
  }

  function stripFileFromDicomHeaderRecord(record) {
    if (!record) {
      return null;
    }
    const copy = { ...record };
    delete copy.file;
    delete copy.arrayBufferPromise;
    delete copy.dataSetPromise;
    delete copy.fileImageId;
    return copy;
  }

  function hasCompleteCachedPixelGeometry(record) {
    if (!record?.hasPixelData && !Number.isFinite(record?.pixelDataOffset)) {
      return true;
    }
    return (
      Number.isFinite(record.rows) &&
      Number.isFinite(record.columns) &&
      Number.isFinite(record.samplesPerPixel) &&
      Number.isFinite(record.bitsAllocated) &&
      Number.isFinite(record.pixelRepresentation)
    );
  }

  async function getCachedDicomHeaderRecord(db, key, file) {
    if (!db || !key) {
      return null;
    }
    try {
      const transaction = db.transaction(DICOM_HEADER_INDEX_STORE, "readonly");
      const stored = await requestToPromise(transaction.objectStore(DICOM_HEADER_INDEX_STORE).get(key));
      if (
        !stored ||
        stored.schemaVersion !== DICOM_HEADER_INDEX_SCHEMA ||
        !stored.record ||
        !stored.headerFingerprint
      ) {
        return null;
      }
      const currentFingerprint = await computeDicomHeaderFingerprint(file);
      if (!currentFingerprint || currentFingerprint !== stored.headerFingerprint) {
        return null;
      }
      if (!hasCompleteCachedPixelGeometry(stored.record)) {
        return null;
      }
      return stored.record;
    } catch (_error) {
      return null;
    }
  }

  async function putCachedDicomHeaderRecord(db, key, record) {
    if (!db || !key || !record?.headerFingerprint) {
      return;
    }
    try {
      const transaction = db.transaction(DICOM_HEADER_INDEX_STORE, "readwrite");
      await requestToPromise(
        transaction.objectStore(DICOM_HEADER_INDEX_STORE).put({
          key,
          schemaVersion: DICOM_HEADER_INDEX_SCHEMA,
          headerFingerprint: record.headerFingerprint,
          record: stripFileFromDicomHeaderRecord(record),
          updatedAt: Date.now(),
        })
      );
    } catch (_error) {}
  }

  async function clearDicomHeaderIndex() {
    if (!global.indexedDB) {
      return false;
    }
    return new Promise((resolve) => {
      const request = global.indexedDB.deleteDatabase(DICOM_HEADER_INDEX_DB_NAME);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
    });
  }

  function parseDicomHeaderWithWorker(worker, file, index, byteLimits) {
    return new Promise((resolve, reject) => {
      const requestId = `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;

      const cleanup = () => {
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
        worker.removeEventListener("messageerror", handleMessageError);
      };

      const handleMessage = (event) => {
        const payload = event.data || {};
        if (payload.requestId !== requestId) {
          return;
        }
        cleanup();
        resolve(payload);
      };

      const handleError = (error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error("DICOM header worker failed."));
      };

      const handleMessageError = () => {
        cleanup();
        reject(new Error("DICOM header worker could not receive a file."));
      };

      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);
      worker.addEventListener("messageerror", handleMessageError);
      worker.postMessage({
        type: "parseDicomHeader",
        requestId,
        index,
        file,
        byteLimits,
      });
    });
  }

  async function parseDicomHeadersInWorker(files, options = {}) {
    const sourceFiles = Array.from(files || []).filter(Boolean);
    if (!sourceFiles.length) {
      return [];
    }
    if (!canUseDicomHeaderWorker()) {
      return null;
    }

    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const profile = options.profile?.enabled ? options.profile : null;
    const parsed = new Array(sourceFiles.length);
    const workers = [];
    const workerUrl = getDicomHeaderWorkerUrl();
    const workerCount = getDicomHeaderWorkerConcurrency(options.concurrency, sourceFiles.length);
    const byteLimits = Array.isArray(options.byteLimits) ? options.byteLimits : null;
    const cacheKeys = sourceFiles.map(getDicomHeaderIndexKey);
    const indexDb = await openDicomHeaderIndexDb().catch(() => null);
    const cachePutPromises = [];
    let nextIndex = 0;
    let completed = 0;

    profile?.setDetail("headerWorkerAvailable", true);
    profile?.count("selectedFiles", sourceFiles.length);
    profile?.count("headerWorkerCount", workerCount);

    if (indexDb) {
      const finishIndexLookup = profile?.start("headerIndexLookup", { fileCount: sourceFiles.length });
      await Promise.all(
        sourceFiles.map(async (file, index) => {
          const cached = await getCachedDicomHeaderRecord(indexDb, cacheKeys[index], file);
          if (cached) {
            parsed[index] = {
              ...cached,
              file,
              sourceKey: cached.sourceKey || getFileSourceKey(file),
            };
          }
        })
      );
      completed = parsed.filter(Boolean).length;
      profile?.count("headerIndexHits", completed);
      profile?.count("headerIndexMisses", sourceFiles.length - completed);
      finishIndexLookup?.({ cacheHits: completed, cacheMisses: sourceFiles.length - completed });
      if (completed && onProgress) {
        onProgress(completed, sourceFiles.length);
      }
      if (completed === sourceFiles.length) {
        indexDb.close?.();
        return parsed.filter(Boolean);
      }
    }

    if (!indexDb) {
      profile?.count("headerIndexUnavailable", 1);
    }

    async function runWorker() {
      const worker = new global.Worker(workerUrl);
      workers.push(worker);
      try {
        while (nextIndex < sourceFiles.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          if (parsed[currentIndex]) {
            continue;
          }
          const file = sourceFiles[currentIndex];
          try {
            const payload = await parseDicomHeaderWithWorker(worker, file, currentIndex, byteLimits);
            if (payload?.ok && payload.record) {
              parsed[currentIndex] = {
                ...payload.record,
                file,
                sourceKey: payload.record.sourceKey || getFileSourceKey(file),
              };
              cachePutPromises.push(putCachedDicomHeaderRecord(indexDb, cacheKeys[currentIndex], parsed[currentIndex]));
            }
          } finally {
            completed += 1;
            if (onProgress && (completed === sourceFiles.length || completed % 50 === 0)) {
              onProgress(completed, sourceFiles.length);
            }
          }
        }
      } finally {
        worker.terminate();
      }
    }

    try {
      const cacheHitsBeforeWorker = completed;
      const finishWorkerParse = profile?.start("headerWorkerParse", {
        fileCount: sourceFiles.length - cacheHitsBeforeWorker,
        workerCount,
      });
      await Promise.all(Array.from({ length: workerCount }, runWorker));
      finishWorkerParse?.({
        parsedCount: parsed.filter(Boolean).length,
        cacheHits: cacheHitsBeforeWorker,
      });
      const finishIndexWrite = profile?.start("headerIndexWrite", { writeCount: cachePutPromises.length });
      await Promise.allSettled(cachePutPromises);
      finishIndexWrite?.({ writeCount: cachePutPromises.length });
      indexDb?.close?.();
      return parsed.filter(Boolean);
    } catch (_error) {
      workers.forEach((worker) => worker.terminate());
      indexDb?.close?.();
      return null;
    }
  }

  function defineRelativePath(file, relativePath) {
    if (!file || !relativePath) {
      return file;
    }

    if (file.webkitRelativePath === relativePath) {
      return file;
    }

    try {
      Object.defineProperty(file, "webkitRelativePath", {
        configurable: true,
        enumerable: true,
        value: relativePath,
      });
      return file;
    } catch (_error) {}

    try {
      const cloned = new File([file], file.name, {
        type: file.type,
        lastModified: file.lastModified,
      });
      Object.defineProperty(cloned, "webkitRelativePath", {
        configurable: true,
        enumerable: true,
        value: relativePath,
      });
      return cloned;
    } catch (_error) {
      return file;
    }
  }

  function fileKey(file) {
    const relativePath = safeString(file?.webkitRelativePath) || safeString(file?.relativePath) || file?.name || "file";
    return [relativePath, file?.size || 0, file?.lastModified || 0].join("::");
  }

  function dedupeFiles(files) {
    const seen = new Set();
    const nextFiles = [];
    files.forEach((file) => {
      if (!file) {
        return;
      }
      const key = fileKey(file);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      nextFiles.push(file);
    });
    return nextFiles;
  }

  function readFileFromEntry(entry, relativePath) {
    return new Promise((resolve, reject) => {
      entry.file(
        (file) => resolve(defineRelativePath(file, relativePath || file.name)),
        (error) => reject(error || new Error("Failed to read dropped file entry."))
      );
    });
  }

  function readAllDirectoryEntries(reader) {
    return new Promise((resolve, reject) => {
      const entries = [];
      const iterate = () => {
        reader.readEntries(
          (batch) => {
            if (!batch?.length) {
              resolve(entries);
              return;
            }
            entries.push(...batch);
            iterate();
          },
          (error) => reject(error || new Error("Failed to read a dropped folder."))
        );
      };
      iterate();
    });
  }

  async function collectFilesFromEntry(entry, parentPath) {
    if (!entry) {
      return [];
    }

    const nextPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    if (entry.isFile) {
      return [await readFileFromEntry(entry, nextPath)];
    }
    if (!entry.isDirectory) {
      return [];
    }

    const reader = entry.createReader?.();
    if (!reader) {
      return [];
    }

    const children = await readAllDirectoryEntries(reader);
    const files = [];
    for (const child of children) {
      files.push(...(await collectFilesFromEntry(child, nextPath)));
    }
    return files;
  }

  async function collectFilesFromHandle(handle, parentPath) {
    if (!handle) {
      return [];
    }

    const nextPath = parentPath ? `${parentPath}/${handle.name}` : handle.name;
    if (handle.kind === "file") {
      const file = await handle.getFile();
      return [defineRelativePath(file, nextPath)];
    }
    if (handle.kind !== "directory") {
      return [];
    }

    const files = [];
    for await (const child of handle.values()) {
      files.push(...(await collectFilesFromHandle(child, nextPath)));
    }
    return files;
  }

  async function collectDroppedFiles(dataTransfer) {
    const directFiles = Array.from(dataTransfer?.files || []).filter(Boolean);
    const items = Array.from(dataTransfer?.items || []).filter((item) => item?.kind === "file");
    if (!items.length) {
      return dedupeFiles(directFiles);
    }

    const collected = [];
    for (const item of items) {
      try {
        if (typeof item.getAsFileSystemHandle === "function") {
          const handle = await item.getAsFileSystemHandle();
          collected.push(...(await collectFilesFromHandle(handle, "")));
          continue;
        }
      } catch (_error) {}

      try {
        if (typeof item.webkitGetAsEntry === "function") {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            collected.push(...(await collectFilesFromEntry(entry, "")));
            continue;
          }
        }
      } catch (_error) {}

      const file = item.getAsFile?.();
      if (file) {
        collected.push(file);
      }
    }

    return dedupeFiles(collected.length ? collected : directFiles);
  }

  global.HAGRadCore = Object.freeze({
    clamp,
    normalizeAngleDegrees,
    safeString,
    naturalCompare,
    parseNumericArray,
    parseFirstNumber,
    prettifyPatientName,
    isSamePatientStudy,
    getFileRelativePath,
    getFileDirectoryPath,
    appendSourceDirectoryToKey,
    cross,
    dot,
    vectorLength,
    normalize,
    addVectors,
    subtractVectors,
    scaleVector,
    cloneVector,
    getNormalVector,
    formatDimension,
    formatSpacing,
    formatDicomDate,
    formatDicomTime,
    combineDateTime,
    sanitizeFilePart,
    waitForAnimationFrame,
    wait,
    createLoadProfiler,
    setLoadProfilingEnabled,
    getLoadProfiles,
    clearLoadProfiles,
    parseDicomHeadersInWorker,
    clearDicomHeaderIndex,
    collectDroppedFiles,
  });
})(window);
