(function attachHagradXlsxExport(global) {
  "use strict";

  const MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const XML_TYPE = "application/xml";
  const PNG_TYPE = "image/png";
  const encoder = new TextEncoder();
  let crcTable = null;

  const REL_TYPES = {
    officeDocument: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
    worksheet: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
    styles: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
    drawing: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing",
    image: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    coreProperties: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
    appProperties: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties",
  };

  function xmlEscape(value) {
    if (value == null) {
      return "";
    }
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function safeWorksheetName(name, fallback) {
    const sanitized = String(name || "")
      .replace(/[\\/?*\[\]:]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return (sanitized || fallback || "Sheet").slice(0, 31);
  }

  function uniqueWorksheetNames(sheets) {
    const seen = new Map();
    return sheets.map((sheet, index) => {
      const base = safeWorksheetName(sheet.name, `Sheet ${index + 1}`);
      const occurrence = (seen.get(base) || 0) + 1;
      seen.set(base, occurrence);
      if (occurrence === 1) {
        return base;
      }
      const suffix = ` ${occurrence}`;
      return `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    });
  }

  function columnName(index) {
    let name = "";
    let value = index + 1;
    while (value > 0) {
      value -= 1;
      name = String.fromCharCode(65 + (value % 26)) + name;
      value = Math.floor(value / 26);
    }
    return name;
  }

  function normalizeRows(headers, rows) {
    return (rows || []).map((row) => {
      if (Array.isArray(row)) {
        const objectRow = {};
        headers.forEach((header, index) => {
          objectRow[header] = row[index] ?? "";
        });
        return objectRow;
      }
      return { ...(row || {}) };
    });
  }

  function csvToRows(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    const source = String(text || "");
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (inQuotes) {
        if (char === '"') {
          if (source[index + 1] === '"') {
            cell += '"';
            index += 1;
          } else {
            inQuotes = false;
          }
        } else {
          cell += char;
        }
        continue;
      }
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(cell);
        cell = "";
      } else if (char === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (char !== "\r") {
        cell += char;
      }
    }
    if (cell || row.length || source.endsWith(",")) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  function safeSheetNameFromFilename(filename, fallback) {
    return safeWorksheetName(String(filename || "").replace(/\.[^.]+$/, ""), fallback);
  }

  function sheetFromRows(name, rows, options = {}) {
    return {
      name: safeWorksheetName(name, options.fallbackName || "Sheet"),
      rows: rows || [],
      images: options.images || [],
      columnWidths: options.columnWidths,
      rowHeights: options.rowHeights,
    };
  }

  function sheetFromCsv(name, csvText, options = {}) {
    return sheetFromRows(name, csvToRows(csvText), {
      ...options,
      fallbackName: safeSheetNameFromFilename(name, options.fallbackName || "Sheet"),
    });
  }

  function normalizeSheet(sheet, index) {
    const sourceRows = sheet.rows || [];
    let headers = Array.isArray(sheet.headers) ? sheet.headers.slice() : [];
    if (!headers.length && sourceRows.length && Array.isArray(sourceRows[0])) {
      headers = sourceRows[0].map((header) => String(header || ""));
      return {
        ...sheet,
        name: sheet.name || `Sheet ${index + 1}`,
        headers,
        rows: normalizeRows(headers, sourceRows.slice(1)),
      };
    }
    if (!headers.length && sourceRows.length) {
      const headerSet = new Set();
      sourceRows.forEach((row) => {
        Object.keys(row || {}).forEach((key) => headerSet.add(key));
      });
      headers = Array.from(headerSet);
    }
    return {
      ...sheet,
      name: sheet.name || `Sheet ${index + 1}`,
      headers,
      rows: normalizeRows(headers, sourceRows),
    };
  }

  function inferColumnWidths(headers, rows, images) {
    const imageColumns = new Set((images || []).map((image) => image.columnIndex).filter(Number.isInteger));
    return headers.map((header, index) => {
      if (imageColumns.has(index) || header === "HAGRad_image") {
        return 24;
      }
      const maxLength = Math.max(
        String(header || "").length,
        ...rows.map((row) => String(row?.[header] ?? "").length)
      );
      return Math.min(34, Math.max(10, maxLength + 2));
    });
  }

  function normalizeColumnIndex(headers, column) {
    if (Number.isInteger(column)) {
      return column;
    }
    const index = headers.indexOf(String(column || ""));
    return index >= 0 ? index : headers.indexOf("HAGRad_image");
  }

  async function bytesFromImageData(data) {
    if (data == null) {
      return null;
    }
    if (data instanceof Uint8Array) {
      return data;
    }
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      return new Uint8Array(await data.arrayBuffer());
    }
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    if (typeof data === "string") {
      const base64 = data.includes(",") ? data.split(",", 2)[1] : data;
      if (typeof Buffer !== "undefined") {
        return new Uint8Array(Buffer.from(base64, "base64"));
      }
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    }
    return null;
  }

  async function normalizeImages(sheet) {
    const images = [];
    for (const [index, image] of (sheet.images || []).entries()) {
      const columnIndex = normalizeColumnIndex(sheet.headers, image.column ?? image.columnIndex ?? "HAGRad_image");
      if (!Number.isInteger(columnIndex) || columnIndex < 0) {
        continue;
      }
      const rowIndex = Number.isInteger(image.rowIndex) ? image.rowIndex : Number(image.rowIndex);
      if (!Number.isFinite(rowIndex) || rowIndex < 0) {
        continue;
      }
      const bytes = await bytesFromImageData(image.data ?? image.bytes ?? image.blob);
      if (!bytes?.length) {
        continue;
      }
      images.push({
        ...image,
        rowIndex,
        columnIndex,
        filename: image.filename || `HAGRad_image_${index + 1}.png`,
        name: image.name || image.filename || `HAGRad_image_${index + 1}.png`,
        bytes,
      });
    }
    return images;
  }

  function workbookCellXml(value, rowIndex, columnIndex) {
    const cellRef = `${columnName(columnIndex)}${rowIndex}`;
    if (value == null || value === "") {
      return `<c r="${cellRef}"/>`;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return `<c r="${cellRef}"><v>${value}</v></c>`;
    }
    if (typeof value === "boolean") {
      return `<c r="${cellRef}" t="b"><v>${value ? 1 : 0}</v></c>`;
    }
    if (typeof value === "object" && value.type === "number" && Number.isFinite(value.value)) {
      return `<c r="${cellRef}"><v>${value.value}</v></c>`;
    }
    const text = typeof value === "object" && "value" in value ? value.value : value;
    return `<c r="${cellRef}" t="inlineStr"><is><t>${xmlEscape(text)}</t></is></c>`;
  }

  function buildWorksheetXml(sheet) {
    const imageRows = new Set((sheet.images || []).map((image) => image.rowIndex + 2));
    const widths = sheet.columnWidths || inferColumnWidths(sheet.headers, sheet.rows, sheet.images);
    const colsXml = widths.length
      ? `<cols>${widths
          .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${Number(width || 12)}" customWidth="1"/>`)
          .join("")}</cols>`
      : "";
    const allRows = [Object.fromEntries(sheet.headers.map((header) => [header, header])), ...sheet.rows];
    const rowsXml = allRows
      .map((row, rowOffset) => {
        const rowNumber = rowOffset + 1;
        const configuredHeight = sheet.rowHeights?.[rowNumber] || (imageRows.has(rowNumber) ? 66 : rowNumber === 1 ? 22 : null);
        const heightAttrs = configuredHeight ? ` ht="${configuredHeight}" customHeight="1"` : "";
        const cells = sheet.headers.map((header, columnIndex) => workbookCellXml(row?.[header], rowNumber, columnIndex)).join("");
        return `<row r="${rowNumber}"${heightAttrs}>${cells}</row>`;
      })
      .join("");
    const drawingXml = sheet.drawingRelId ? `<drawing r:id="${sheet.drawingRelId}"/>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${colsXml}<sheetData>${rowsXml}</sheetData>${drawingXml}</worksheet>`;
  }

  function buildDrawingXml(images) {
    const anchors = images
      .map((image, index) => {
        const relId = `rId${index + 1}`;
        const drawingRow = image.rowIndex + 1;
        const drawingCol = image.columnIndex;
        return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${drawingCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${drawingRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${drawingCol + 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${drawingRow + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${index + 1}" name="${xmlEscape(image.name)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
      })
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors}</xdr:wsDr>`;
  }

  function buildRelationshipsXml(relationships) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships
      .map((relationship) => `<Relationship Id="${relationship.id}" Type="${relationship.type}" Target="${xmlEscape(relationship.target)}"/>`)
      .join("")}</Relationships>`;
  }

  function buildWorkbookXml(sheetNames) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNames
      .map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
      .join("")}</sheets></workbook>`;
  }

  function buildStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`;
  }

  function buildContentTypesXml(sheetCount, drawingCount) {
    const sheetOverrides = Array.from({ length: sheetCount }, (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ).join("");
    const drawingOverrides = Array.from({ length: drawingCount }, (_, index) =>
      `<Override PartName="/xl/drawings/drawing${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
    ).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}${drawingOverrides}</Types>`;
  }

  function buildAppPropsXml(sheetNames) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>HAGRad Viewer</Application><TitlesOfParts><vt:vector size="${sheetNames.length}" baseType="lpstr">${sheetNames
      .map((name) => `<vt:lpstr>${xmlEscape(name)}</vt:lpstr>`)
      .join("")}</vt:vector></TitlesOfParts></Properties>`;
  }

  function buildCorePropsXml(options) {
    const now = new Date().toISOString();
    const creator = xmlEscape(options.creator || "HAGRad Viewer");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>${creator}</dc:creator><cp:lastModifiedBy>${creator}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  }

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

  function writeUint16(view, offset, value) {
    view.setUint16(offset, value, true);
  }

  function writeUint32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }

  function dosDateTime(date) {
    const value = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date();
    const year = Math.max(1980, value.getFullYear());
    return {
      dosTime: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2),
      dosDate: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
    };
  }

  function safePackagePath(path, fallback) {
    const parts = String(path || "")
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .map((part) => part.replace(/[\u0000-\u001f]/g, "_"));
    return parts.join("/") || fallback || "file";
  }

  function makeHeader(length) {
    const buffer = new ArrayBuffer(length);
    return { buffer, view: new DataView(buffer) };
  }

  async function bytesFromContent(content) {
    if (content instanceof Uint8Array) {
      return content;
    }
    if (content instanceof ArrayBuffer) {
      return new Uint8Array(content);
    }
    if (typeof Blob !== "undefined" && content instanceof Blob) {
      return new Uint8Array(await content.arrayBuffer());
    }
    if (ArrayBuffer.isView(content)) {
      return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
    }
    return encoder.encode(String(content ?? ""));
  }

  async function createPackageZipBlob(files) {
    const normalized = [];
    for (const [index, file] of files.entries()) {
      normalized.push({
        filename: safePackagePath(file.filename || file.name, `file_${index + 1}`),
        bytes: await bytesFromContent(file.content ?? file.bytes ?? file.blob),
        modifiedAt: file.modifiedAt instanceof Date ? file.modifiedAt : new Date(),
      });
    }

    const chunks = [];
    const centralDirectory = [];
    let offset = 0;
    normalized.forEach((file) => {
      const filenameBytes = encoder.encode(file.filename);
      const { dosDate, dosTime } = dosDateTime(file.modifiedAt);
      const crc = crc32(file.bytes);
      const size = file.bytes.length;

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
    return new Blob(chunks, { type: MIME_TYPE });
  }

  function makeFile(path, content, type) {
    return {
      filename: path,
      blob: content instanceof Blob ? content : new Blob([content], { type: type || XML_TYPE }),
    };
  }

  async function buildXlsxFile(options = {}) {
    const normalizedSheets = (options.sheets || []).map(normalizeSheet);
    if (!normalizedSheets.length) {
      throw new Error("Provide at least one worksheet for XLSX export.");
    }
    const sheetNames = uniqueWorksheetNames(normalizedSheets);
    const files = [];
    const workbookRelationships = [];
    let drawingCount = 0;
    let mediaCount = 0;

    for (const [index, sheet] of normalizedSheets.entries()) {
      sheet.name = sheetNames[index];
      sheet.images = await normalizeImages(sheet);
      if (sheet.images.length) {
        drawingCount += 1;
        sheet.drawingId = drawingCount;
        sheet.drawingRelId = "rId1";
      }
      files.push(makeFile(`xl/worksheets/sheet${index + 1}.xml`, buildWorksheetXml(sheet), XML_TYPE));
      if (sheet.images.length) {
        files.push(
          makeFile(
            `xl/worksheets/_rels/sheet${index + 1}.xml.rels`,
            buildRelationshipsXml([
              {
                id: "rId1",
                type: REL_TYPES.drawing,
                target: `../drawings/drawing${sheet.drawingId}.xml`,
              },
            ]),
            XML_TYPE
          )
        );
        files.push(makeFile(`xl/drawings/drawing${sheet.drawingId}.xml`, buildDrawingXml(sheet.images), XML_TYPE));
        const drawingRelationships = [];
        sheet.images.forEach((image, imageIndex) => {
          mediaCount += 1;
          const mediaPath = `xl/media/image${mediaCount}.png`;
          files.push(makeFile(mediaPath, new Blob([image.bytes], { type: PNG_TYPE }), PNG_TYPE));
          drawingRelationships.push({
            id: `rId${imageIndex + 1}`,
            type: REL_TYPES.image,
            target: `../media/image${mediaCount}.png`,
          });
        });
        files.push(
          makeFile(
            `xl/drawings/_rels/drawing${sheet.drawingId}.xml.rels`,
            buildRelationshipsXml(drawingRelationships),
            XML_TYPE
          )
        );
      }
      workbookRelationships.push({
        id: `rId${index + 1}`,
        type: REL_TYPES.worksheet,
        target: `worksheets/sheet${index + 1}.xml`,
      });
    }

    workbookRelationships.push({
      id: `rId${normalizedSheets.length + 1}`,
      type: REL_TYPES.styles,
      target: "styles.xml",
    });

    files.push(makeFile("[Content_Types].xml", buildContentTypesXml(normalizedSheets.length, drawingCount), XML_TYPE));
    files.push(
      makeFile(
        "_rels/.rels",
        buildRelationshipsXml([
          { id: "rId1", type: REL_TYPES.officeDocument, target: "xl/workbook.xml" },
          { id: "rId2", type: REL_TYPES.coreProperties, target: "docProps/core.xml" },
          { id: "rId3", type: REL_TYPES.appProperties, target: "docProps/app.xml" },
        ]),
        XML_TYPE
      )
    );
    files.push(makeFile("docProps/core.xml", buildCorePropsXml(options), XML_TYPE));
    files.push(makeFile("docProps/app.xml", buildAppPropsXml(sheetNames), XML_TYPE));
    files.push(makeFile("xl/workbook.xml", buildWorkbookXml(sheetNames), XML_TYPE));
    files.push(makeFile("xl/_rels/workbook.xml.rels", buildRelationshipsXml(workbookRelationships), XML_TYPE));
    files.push(makeFile("xl/styles.xml", buildStylesXml(), XML_TYPE));

    const blob = await createPackageZipBlob(files);
    return {
      filename: options.filename || "hagrad_export.xlsx",
      blob,
      mimeType: MIME_TYPE,
    };
  }

  const api = Object.freeze({
    MIME_TYPE,
    buildXlsxFile,
    createPackageZipBlob,
    csvToRows,
    sheetFromCsv,
    sheetFromRows,
  });

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  global.HAGRadXlsxExport = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
