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
    collectDroppedFiles,
  });
})(window);
