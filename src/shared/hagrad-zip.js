(function () {
  "use strict";

  const encoder = new TextEncoder();
  let crcTable = null;

  function buildCrcTable() {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    return table;
  }

  function crc32(bytes) {
    if (!crcTable) {
      crcTable = buildCrcTable();
    }
    let value = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
      value = crcTable[(value ^ bytes[index]) & 0xff] ^ (value >>> 8);
    }
    return (value ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date) {
    const value = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date();
    const year = Math.max(1980, value.getFullYear());
    const dosTime = (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate();
    return { dosDate, dosTime };
  }

  function writeUint16(view, offset, value) {
    view.setUint16(offset, value, true);
  }

  function writeUint32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }

  function makeHeader(length) {
    const buffer = new ArrayBuffer(length);
    return { buffer, view: new DataView(buffer) };
  }

  function safeZipPath(filename, fallback) {
    const clean = String(filename || "")
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .join("_")
      .replace(/[\u0000-\u001f]/g, "_")
      .trim();
    return clean || fallback || "export_file";
  }

  async function blobToBytes(blob) {
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to create PNG export."));
            return;
          }
          resolve(blob);
        },
        "image/png",
        1
      );
    });
  }

  async function normalizeFiles(files) {
    const seen = new Map();
    const normalized = [];
    for (const [index, file] of (files || []).entries()) {
      if (!file?.blob) {
        continue;
      }
      const originalName = safeZipPath(file.filename || file.name, `export_${index + 1}`);
      const dotIndex = originalName.lastIndexOf(".");
      const stem = dotIndex > 0 ? originalName.slice(0, dotIndex) : originalName;
      const extension = dotIndex > 0 ? originalName.slice(dotIndex) : "";
      const occurrence = (seen.get(originalName) || 0) + 1;
      seen.set(originalName, occurrence);
      const filename = occurrence === 1 ? originalName : `${stem}_${String(occurrence).padStart(2, "0")}${extension}`;
      normalized.push({
        filename,
        blob: file.blob,
        bytes: await blobToBytes(file.blob),
        modifiedAt: file.modifiedAt instanceof Date ? file.modifiedAt : new Date(),
      });
    }
    return normalized;
  }

  async function createZipBlob(files) {
    const normalized = await normalizeFiles(files);
    if (!normalized.length) {
      throw new Error("No files were provided for the ZIP export.");
    }

    const chunks = [];
    const centralDirectory = [];
    let offset = 0;

    normalized.forEach((file) => {
      const filenameBytes = encoder.encode(file.filename);
      const { dosDate, dosTime } = dosDateTime(file.modifiedAt);
      const crc = crc32(file.bytes);
      const size = file.bytes.length;
      if (size > 0xffffffff || offset > 0xffffffff) {
        throw new Error("ZIP export is too large for this browser-based bundle writer.");
      }

      const local = makeHeader(30 + filenameBytes.length);
      writeUint32(local.view, 0, 0x04034b50);
      writeUint16(local.view, 4, 20);
      writeUint16(local.view, 6, 0x0800);
      writeUint16(local.view, 8, 0);
      writeUint16(local.view, 10, dosTime);
      writeUint16(local.view, 12, dosDate);
      writeUint32(local.view, 14, crc);
      writeUint32(local.view, 18, size);
      writeUint32(local.view, 22, size);
      writeUint16(local.view, 26, filenameBytes.length);
      writeUint16(local.view, 28, 0);
      new Uint8Array(local.buffer, 30).set(filenameBytes);
      chunks.push(local.buffer, file.bytes);

      const central = makeHeader(46 + filenameBytes.length);
      writeUint32(central.view, 0, 0x02014b50);
      writeUint16(central.view, 4, 20);
      writeUint16(central.view, 6, 20);
      writeUint16(central.view, 8, 0x0800);
      writeUint16(central.view, 10, 0);
      writeUint16(central.view, 12, dosTime);
      writeUint16(central.view, 14, dosDate);
      writeUint32(central.view, 16, crc);
      writeUint32(central.view, 20, size);
      writeUint32(central.view, 24, size);
      writeUint16(central.view, 28, filenameBytes.length);
      writeUint16(central.view, 30, 0);
      writeUint16(central.view, 32, 0);
      writeUint16(central.view, 34, 0);
      writeUint16(central.view, 36, 0);
      writeUint32(central.view, 38, 0);
      writeUint32(central.view, 42, offset);
      new Uint8Array(central.buffer, 46).set(filenameBytes);
      centralDirectory.push(central.buffer);

      offset += local.buffer.byteLength + file.bytes.length;
    });

    const centralOffset = offset;
    let centralSize = 0;
    centralDirectory.forEach((buffer) => {
      chunks.push(buffer);
      centralSize += buffer.byteLength;
    });
    offset += centralSize;

    const end = makeHeader(22);
    writeUint32(end.view, 0, 0x06054b50);
    writeUint16(end.view, 4, 0);
    writeUint16(end.view, 6, 0);
    writeUint16(end.view, 8, normalized.length);
    writeUint16(end.view, 10, normalized.length);
    writeUint32(end.view, 12, centralSize);
    writeUint32(end.view, 16, centralOffset);
    writeUint16(end.view, 20, 0);
    chunks.push(end.buffer);

    return new Blob(chunks, { type: "application/zip" });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function zipNameFrom(filename, fallback) {
    const safeName = safeZipPath(filename, fallback || "hagrad_export.zip");
    return safeName.toLowerCase().endsWith(".zip") ? safeName : safeName.replace(/\.[^.]+$/, "") + ".zip";
  }

  async function downloadBundle(files, zipFilename, options) {
    const validFiles = (files || []).filter((file) => file?.blob);
    if (!validFiles.length) {
      throw new Error("No files were available for the ZIP export.");
    }
    const persistFile = typeof options?.persistFile === "function" ? options.persistFile : null;
    const persistZip = typeof options?.persistZip === "function" ? options.persistZip : null;
    const fileOptions = options?.fileOptions || {};
    const zipOptions = options?.zipOptions || fileOptions;

    if (persistFile) {
      for (const file of validFiles) {
        await persistFile(file.blob, file.filename || file.name, fileOptions);
      }
    }

    const finalZipName = zipNameFrom(zipFilename, "hagrad_export.zip");
    const zipBlob = await createZipBlob(validFiles);
    if (persistZip) {
      await persistZip(zipBlob, finalZipName, zipOptions);
    }
    downloadBlob(zipBlob, finalZipName);
    return {
      filename: finalZipName,
      fileCount: validFiles.length,
      files: validFiles.map((file) => file.filename || file.name),
    };
  }

  window.HAGRadZip = {
    canvasToPngBlob,
    createZipBlob,
    downloadBundle,
    downloadBlob,
    zipNameFrom,
  };
})();
