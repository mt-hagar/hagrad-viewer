#!/usr/bin/env python3

from __future__ import annotations

import os
import posixpath
import base64
import json
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape


OOXML_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
OOXML_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
OOXML_PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
OOXML_DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
OOXML_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
CONTENT_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types"

NS = {
    "a": OOXML_A,
    "ct": CONTENT_TYPES,
    "main": OOXML_MAIN,
    "pkgrel": OOXML_PACKAGE_REL,
    "r": OOXML_REL,
    "xdr": OOXML_DRAWING,
}

ROOT = Path(__file__).resolve().parent.parent
VIEWER_JS = ROOT / "src" / "viewer.js"
XLSX_EXPORT_JS = ROOT / "src" / "shared" / "hagrad-xlsx-export.js"

MEASUREMENT_HEADERS = [
    "study_id",
    "series_number",
    "series_description",
    "reconstruction",
    "annotation_id",
    "measurement_type",
    "value_mm",
    "profile_raw_sheet",
    "HAGRad_image",
]

MEASUREMENT_ROWS = [
    ["study_001", "6", "VMI70", "Recon 1/3", "M001", "Stent Line Profile", "12.4", "profile_001_s6", "HAGRad_thumb_1.png"],
    ["study_001", "7", "VMI80", "Recon 2/3", "M002", "Vascular Line Profile", "118", "profile_002_s7", "HAGRad_thumb_2.png"],
    ["study_001", "9", "Bv60", "Recon 3/3", "M003", "roi", "52.1", "", "HAGRad_thumb_3.png"],
]

RAW_HEADERS = [
    "study_id",
    "series_number",
    "series_description",
    "reconstruction",
    "annotation_id",
    "sample_index",
    "distance_mm",
    "hu",
]

RAW_ROWS = [
    ["study_001", "6", "VMI70", "Recon 1/2", "M001", "0", "0", "101"],
    ["study_001", "6", "VMI70", "Recon 1/2", "M001", "1", "0.5", "105"],
    ["study_001", "7", "VMI80", "Recon 2/2", "M002", "0", "0", "112"],
]

PROFILE_INDEX_HEADERS = [
    "sheet_name",
    "annotation_id",
    "profile_label",
    "profile_family",
    "series_number",
    "series_description",
    "reconstruction",
    "sample_count",
    "x_axis",
    "y_axis",
]

PROFILE_INDEX_ROWS = [
    ["profile_001_s6", "M001", "Stent Line", "stent_lumen_interface", "6", "VMI70", "Recon 1/3", "3", "distance_mm", "HU"],
    ["profile_002_s7", "M002", "Vascular Profile", "vascular_lumen_profile", "7", "VMI80", "Recon 2/3", "2", "distance_mm", "HU"],
]

PROFILE_HEADERS = [
    "study_id",
    "series_number",
    "series_description",
    "reconstruction",
    "reconstruction_order",
    "convolution_kernel",
    "annotation_id",
    "profile_label",
    "profile_family",
    "profile_type",
    "sample_index",
    "x_distance_mm",
    "y_hu",
    "raw_y_hu",
    "display_smoothed_hu",
    "raw_stored_value",
    "world_x_mm",
    "world_y_mm",
    "world_z_mm",
    "voxel_x",
    "voxel_y",
    "voxel_z",
    "plane",
    "sample_spacing_mm",
    "interpolation_method",
    "sampling_source",
]

PROFILE_SHEETS = [
    {
        "name": "profile_001_s6",
        "series_number": "6",
        "rows": [
            ["study_001", "6", "VMI70", "Recon 1/3", "1", "Bv60v4", "M001", "Stent Line", "stent_lumen_interface", "Stent-Lumen Line Profile", "0", "0", "101", "101", "100.5", "101", "1", "2", "3", "10", "20", "30", "axial", "0.5", "nearest", "source_voxel_nearest"],
            ["study_001", "6", "VMI70", "Recon 1/3", "1", "Bv60v4", "M001", "Stent Line", "stent_lumen_interface", "Stent-Lumen Line Profile", "1", "0.5", "105", "105", "105.5", "105", "1.5", "2.5", "3.5", "10.5", "20.5", "30.5", "axial", "0.5", "nearest", "source_voxel_nearest"],
            ["study_001", "6", "VMI70", "Recon 1/3", "1", "Bv60v4", "M001", "Stent Line", "stent_lumen_interface", "Stent-Lumen Line Profile", "2", "1", "109", "109", "108.5", "109", "2", "3", "4", "11", "21", "31", "axial", "0.5", "nearest", "source_voxel_nearest"],
        ],
    },
    {
        "name": "profile_002_s7",
        "series_number": "7",
        "rows": [
            ["study_001", "7", "VMI80", "Recon 2/3", "2", "Bv64", "M002", "Vascular Profile", "vascular_lumen_profile", "Vascular Line Profile", "0", "0", "112", "112", "111", "112", "5", "6", "7", "15", "25", "35", "axial", "0.4", "nearest", "source_voxel_nearest"],
            ["study_001", "7", "VMI80", "Recon 2/3", "2", "Bv64", "M002", "Vascular Profile", "vascular_lumen_profile", "Vascular Line Profile", "1", "0.4", "120", "120", "119", "120", "5.4", "6.4", "7.4", "15.4", "25.4", "35.4", "axial", "0.4", "nearest", "source_voxel_nearest"],
        ],
    },
]


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def col_name(index: int) -> str:
    name = ""
    value = index + 1
    while value:
        value, remainder = divmod(value - 1, 26)
        name = chr(65 + remainder) + name
    return name


def col_index(cell_ref: str) -> int:
    letters = "".join(char for char in cell_ref if char.isalpha())
    value = 0
    for char in letters:
        value = value * 26 + (ord(char.upper()) - ord("A") + 1)
    return value - 1


def inline_cell(row_index: int, col_index_value: int, value: str) -> str:
    cell_ref = f"{col_name(col_index_value)}{row_index}"
    return (
        f'<c r="{cell_ref}" t="inlineStr">'
        f"<is><t>{escape(str(value))}</t></is>"
        "</c>"
    )


def row_xml(row_index: int, values: list[str], height: float | None = None) -> str:
    height_attrs = ""
    if height is not None:
        height_attrs = f' ht="{height:g}" customHeight="1"'
    cells = "".join(inline_cell(row_index, index, value) for index, value in enumerate(values))
    return f'<row r="{row_index}"{height_attrs}>{cells}</row>'


def sheet_xml(
    headers: list[str],
    rows: list[list[str]],
    *,
    column_widths: dict[int, float] | None = None,
    row_heights: dict[int, float] | None = None,
    drawing_rel_id: str | None = None,
) -> str:
    column_xml = ""
    if column_widths:
        column_xml = "<cols>" + "".join(
            f'<col min="{index + 1}" max="{index + 1}" width="{width:g}" customWidth="1"/>'
            for index, width in sorted(column_widths.items())
        ) + "</cols>"
    rows_xml = [row_xml(1, headers, row_heights.get(1) if row_heights else None)]
    for row_offset, values in enumerate(rows, start=2):
        rows_xml.append(row_xml(row_offset, values, row_heights.get(row_offset) if row_heights else None))
    drawing_xml = f'<drawing r:id="{drawing_rel_id}"/>' if drawing_rel_id else ""
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<worksheet xmlns="{OOXML_MAIN}" xmlns:r="{OOXML_REL}">'
        f"{column_xml}<sheetData>{''.join(rows_xml)}</sheetData>{drawing_xml}</worksheet>"
    )


def rels_xml(relationships: list[tuple[str, str, str]]) -> str:
    rels = "".join(
        f'<Relationship Id="{rel_id}" Type="{escape(rel_type)}" Target="{escape(target)}"/>'
        for rel_id, rel_type, target in relationships
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Relationships xmlns="{OOXML_PACKAGE_REL}">{rels}</Relationships>'
    )


def png_chunk(chunk_type: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + chunk_type
        + payload
        + struct.pack(">I", zlib.crc32(chunk_type + payload) & 0xFFFFFFFF)
    )


def make_png(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            row.extend(((rgb[0] + x * 7) % 256, (rgb[1] + y * 9) % 256, rgb[2]))
        rows.append(bytes(row))
    payload = b"".join(rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + png_chunk(b"IDAT", zlib.compress(payload))
        + png_chunk(b"IEND", b"")
    )


def drawing_xml(image_count: int, image_col_index: int) -> str:
    anchors = []
    for image_index in range(1, image_count + 1):
        zero_based_row = image_index
        pic_id = image_index
        anchors.append(
            f'<xdr:twoCellAnchor editAs="oneCell">'
            f"<xdr:from><xdr:col>{image_col_index}</xdr:col><xdr:colOff>0</xdr:colOff>"
            f"<xdr:row>{zero_based_row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>"
            f"<xdr:to><xdr:col>{image_col_index + 1}</xdr:col><xdr:colOff>0</xdr:colOff>"
            f"<xdr:row>{zero_based_row + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>"
            "<xdr:pic>"
            "<xdr:nvPicPr>"
            f'<xdr:cNvPr id="{pic_id}" name="HAGRad_thumb_{image_index}.png"/>'
            '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>'
            "</xdr:nvPicPr>"
            f'<xdr:blipFill><a:blip r:embed="rId{image_index}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
            '<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>'
            "</xdr:pic><xdr:clientData/></xdr:twoCellAnchor>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<xdr:wsDr xmlns:xdr="{OOXML_DRAWING}" xmlns:a="{OOXML_A}" xmlns:r="{OOXML_REL}">'
        f"{''.join(anchors)}</xdr:wsDr>"
    )


def content_types_xml() -> str:
    overrides = [
        ("/docProps/app.xml", "application/vnd.openxmlformats-officedocument.extended-properties+xml"),
        ("/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"),
        ("/xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"),
        ("/xl/worksheets/sheet1.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"),
        ("/xl/worksheets/sheet2.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"),
        ("/xl/worksheets/sheet3.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"),
        ("/xl/styles.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"),
        ("/xl/drawings/drawing1.xml", "application/vnd.openxmlformats-officedocument.drawing+xml"),
    ]
    override_xml = "".join(
        f'<Override PartName="{part_name}" ContentType="{content_type}"/>'
        for part_name, content_type in overrides
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Types xmlns="{CONTENT_TYPES}">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Default Extension="png" ContentType="image/png"/>'
        f"{override_xml}</Types>"
    )


def workbook_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<workbook xmlns="{OOXML_MAIN}" xmlns:r="{OOXML_REL}"><sheets>'
        '<sheet name="measurements" sheetId="1" r:id="rId1"/>'
        '<sheet name="rest" sheetId="2" r:id="rId2"/>'
        '<sheet name="raw_samples" sheetId="3" r:id="rId3"/>'
        "</sheets></workbook>"
    )


def minimal_styles_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<styleSheet xmlns="{OOXML_MAIN}">'
        '<fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts>'
        '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>'
        "</styleSheet>"
    )


def create_synthetic_measurement_xlsx(path: Path) -> None:
    thumbnail_colors = [(220, 60, 80), (80, 180, 130), (90, 120, 230)]
    fixture_path = path.with_suffix(".fixture.json")
    fixture_path.write_text(
        json.dumps(
            {
                "measurementHeaders": MEASUREMENT_HEADERS,
                "measurementRows": MEASUREMENT_ROWS,
                "rawHeaders": RAW_HEADERS,
                "rawRows": RAW_ROWS,
                "profileIndexHeaders": PROFILE_INDEX_HEADERS,
                "profileIndexRows": PROFILE_INDEX_ROWS,
                "profileHeaders": PROFILE_HEADERS,
                "profileSheets": PROFILE_SHEETS,
                "images": [
                    base64.b64encode(make_png(12, 10, color)).decode("ascii")
                    for color in thumbnail_colors
                ],
            }
        ),
        encoding="utf-8",
    )
    node_code = r"""
const fs = require("node:fs");
const xlsx = require(process.argv[1]);
const fixture = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const outputPath = process.argv[3];

function objectRows(headers, rows) {
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function imageBytes(base64) {
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvFromRows(headers, rows) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

(async () => {
  const rawSamplesCsv = csvFromRows(fixture.rawHeaders, fixture.rawRows);
  const profileSheets = [
    {
      name: "profile_sheets",
      headers: fixture.profileIndexHeaders,
      rows: objectRows(fixture.profileIndexHeaders, fixture.profileIndexRows),
    },
    ...fixture.profileSheets.map((sheet) => ({
      name: sheet.name,
      headers: fixture.profileHeaders,
      rows: objectRows(fixture.profileHeaders, sheet.rows),
    })),
  ];
  const workbook = await xlsx.buildXlsxFile({
    filename: "synthetic_measurements.xlsx",
    sheets: [
      {
        name: "measurements",
        headers: fixture.measurementHeaders,
        rows: objectRows(fixture.measurementHeaders, fixture.measurementRows),
        images: fixture.images.map((image, index) => ({
          rowIndex: index,
          column: "HAGRad_image",
          filename: `HAGRad_thumb_${index + 1}.png`,
          name: `HAGRad_thumb_${index + 1}.png`,
          data: imageBytes(image),
        })),
      },
      {
        name: "rest",
        headers: fixture.measurementHeaders,
        rows: objectRows(fixture.measurementHeaders, fixture.measurementRows),
      },
      xlsx.sheetFromCsv("raw_samples", rawSamplesCsv),
      ...profileSheets,
    ],
  });
  fs.writeFileSync(outputPath, Buffer.from(await workbook.blob.arrayBuffer()));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
"""
    completed = subprocess.run(
        ["node", "-e", node_code, str(XLSX_EXPORT_JS), str(fixture_path), str(path)],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        output = "\n".join(part for part in [completed.stdout, completed.stderr] if part).strip()
        raise AssertionError(f"Shared XLSX module failed to generate workbook:\n{output}")


def parse_xml_member(archive: zipfile.ZipFile, name: str) -> ET.Element:
    return ET.fromstring(archive.read(name))


def parse_relationships(archive: zipfile.ZipFile, name: str) -> dict[str, str]:
    root = parse_xml_member(archive, name)
    relationships = {}
    for relationship in root.findall("pkgrel:Relationship", NS):
        relationships[relationship.attrib["Id"]] = relationship.attrib["Target"]
    return relationships


def workbook_sheet_paths(archive: zipfile.ZipFile) -> dict[str, str]:
    workbook = parse_xml_member(archive, "xl/workbook.xml")
    rels = parse_relationships(archive, "xl/_rels/workbook.xml.rels")
    paths = {}
    for sheet in workbook.findall("main:sheets/main:sheet", NS):
        rel_id = sheet.attrib[f"{{{OOXML_REL}}}id"]
        paths[sheet.attrib["name"]] = posixpath.normpath(posixpath.join("xl", rels[rel_id]))
    return paths


def parse_sheet_table(archive: zipfile.ZipFile, sheet_path: str) -> tuple[list[str], list[dict[str, str]], ET.Element]:
    root = parse_xml_member(archive, sheet_path)
    rows = root.findall("main:sheetData/main:row", NS)
    values_by_row: list[dict[int, str]] = []
    for row in rows:
        values = {}
        for cell in row.findall("main:c", NS):
            value = ""
            inline_text = cell.find("main:is/main:t", NS)
            plain_value = cell.find("main:v", NS)
            if inline_text is not None and inline_text.text is not None:
                value = inline_text.text
            elif plain_value is not None and plain_value.text is not None:
                value = plain_value.text
            values[col_index(cell.attrib["r"])] = value
        values_by_row.append(values)
    headers = [values_by_row[0].get(index, "") for index in range(max(values_by_row[0]) + 1)]
    body = []
    for row_values in values_by_row[1:]:
        body.append({header: row_values.get(index, "") for index, header in enumerate(headers)})
    return headers, body, root


def validate_package_structure(archive: zipfile.ZipFile) -> dict[str, str]:
    names = set(archive.namelist())
    expected_sheet_count = 4 + len(PROFILE_SHEETS)
    required_members = [
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/workbook.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/worksheets/_rels/sheet1.xml.rels",
        "xl/drawings/drawing1.xml",
        "xl/drawings/_rels/drawing1.xml.rels",
    ]
    required_members.extend(f"xl/worksheets/sheet{index}.xml" for index in range(1, expected_sheet_count + 1))
    for member in required_members:
        assert_true(member in names, f"Missing XLSX member: {member}")
    media_members = sorted(name for name in names if name.startswith("xl/media/") and name.endswith(".png"))
    assert_true(len(media_members) == len(MEASUREMENT_ROWS), "Expected one PNG thumbnail per measurement row.")
    return workbook_sheet_paths(archive)


def validate_tables(archive: zipfile.ZipFile, sheet_paths: dict[str, str]) -> None:
    expected_profile_sheet_by_annotation = {
        row[MEASUREMENT_HEADERS.index("annotation_id")]: row[MEASUREMENT_HEADERS.index("profile_raw_sheet")]
        for row in MEASUREMENT_ROWS
        if row[MEASUREMENT_HEADERS.index("profile_raw_sheet")]
    }
    for sheet_name in ("measurements", "rest"):
        headers, rows, _root = parse_sheet_table(archive, sheet_paths[sheet_name])
        assert_true("HAGRad_image" in headers, f"{sheet_name} missing HAGRad_image column.")
        assert_true("profile_raw_sheet" in headers, f"{sheet_name} missing profile_raw_sheet column.")
        for required_header in ("series_number", "series_description", "reconstruction"):
            assert_true(required_header in headers, f"{sheet_name} missing {required_header}.")
        assert_true(len(rows) == len(MEASUREMENT_ROWS), f"{sheet_name} row count mismatch.")
        for row in rows:
            for required_header in ("series_number", "series_description", "reconstruction"):
                assert_true(row[required_header], f"{sheet_name} row missing {required_header}: {row}")
            expected_profile_sheet = expected_profile_sheet_by_annotation.get(row["annotation_id"], "")
            assert_true(
                row.get("profile_raw_sheet", "") == expected_profile_sheet,
                f"{sheet_name} profile_raw_sheet mismatch for {row['annotation_id']}: {row.get('profile_raw_sheet')}",
            )

    raw_headers, raw_rows, _root = parse_sheet_table(archive, sheet_paths["raw_samples"])
    assert_true("series_number" in raw_headers, "raw_samples missing series_number.")
    assert_true(raw_rows and all(row["series_number"] for row in raw_rows), "raw_samples series_number values are empty.")

    profile_index_headers, profile_index_rows, _root = parse_sheet_table(archive, sheet_paths["profile_sheets"])
    for required_header in PROFILE_INDEX_HEADERS:
        assert_true(required_header in profile_index_headers, f"profile_sheets missing {required_header}.")
    assert_true(len(profile_index_rows) == len(PROFILE_SHEETS), "profile_sheets index row count mismatch.")

    seen_names = set()
    for expected_sheet in PROFILE_SHEETS:
        sheet_name = expected_sheet["name"]
        assert_true(sheet_name in sheet_paths, f"Missing profile worksheet {sheet_name}.")
        assert_true(len(sheet_name) <= 31, f"Profile sheet name exceeds Excel limit: {sheet_name}")
        assert_true(not any(char in sheet_name for char in '\\/?*[]:'), f"Profile sheet name is not Excel-safe: {sheet_name}")
        assert_true(sheet_name.lower() not in seen_names, f"Duplicate profile sheet name: {sheet_name}")
        seen_names.add(sheet_name.lower())

        matching_index_rows = [row for row in profile_index_rows if row["sheet_name"] == sheet_name]
        assert_true(len(matching_index_rows) == 1, f"profile_sheets missing index row for {sheet_name}.")
        assert_true(
            matching_index_rows[0]["sample_count"] == str(len(expected_sheet["rows"])),
            f"profile_sheets sample count mismatch for {sheet_name}.",
        )
        assert_true(matching_index_rows[0]["x_axis"] == "distance_mm", f"profile_sheets x_axis mismatch for {sheet_name}.")
        assert_true(matching_index_rows[0]["y_axis"] == "HU", f"profile_sheets y_axis mismatch for {sheet_name}.")

        profile_headers, profile_rows, _profile_root = parse_sheet_table(archive, sheet_paths[sheet_name])
        for required_header in ("series_number", "x_distance_mm", "y_hu", "raw_y_hu", "profile_family", "profile_type"):
            assert_true(required_header in profile_headers, f"{sheet_name} missing {required_header}.")
        assert_true(len(profile_rows) == len(expected_sheet["rows"]), f"{sheet_name} sample count mismatch.")
        expected_distances = [row[PROFILE_HEADERS.index("x_distance_mm")] for row in expected_sheet["rows"]]
        expected_hu = [row[PROFILE_HEADERS.index("y_hu")] for row in expected_sheet["rows"]]
        for index, row in enumerate(profile_rows):
            assert_true(row["series_number"] == expected_sheet["series_number"], f"{sheet_name} row missing expected series_number.")
            assert_true(row["x_distance_mm"] == expected_distances[index], f"{sheet_name} x_distance_mm mismatch at row {index + 2}.")
            assert_true(row["y_hu"] == expected_hu[index], f"{sheet_name} y_hu mismatch at row {index + 2}.")


def validate_dimensions(archive: zipfile.ZipFile, sheet_paths: dict[str, str]) -> None:
    _headers, _rows, root = parse_sheet_table(archive, sheet_paths["measurements"])
    image_col_index = MEASUREMENT_HEADERS.index("HAGRad_image")
    matching_col = root.find(f"main:cols/main:col[@min='{image_col_index + 1}'][@max='{image_col_index + 1}']", NS)
    assert_true(matching_col is not None, "HAGRad_image column width is not set.")
    assert_true(float(matching_col.attrib.get("width", "0")) >= 20, "HAGRad_image column width is too small.")
    for row_index in range(2, len(MEASUREMENT_ROWS) + 2):
        row = root.find(f"main:sheetData/main:row[@r='{row_index}']", NS)
        assert_true(row is not None, f"Missing measurement row {row_index}.")
        assert_true(row.attrib.get("customHeight") == "1", f"Row {row_index} does not set customHeight.")
        assert_true(float(row.attrib.get("ht", "0")) >= 60, f"Row {row_index} height is too small.")


def validate_drawings_and_media(archive: zipfile.ZipFile) -> None:
    drawing_root = parse_xml_member(archive, "xl/drawings/drawing1.xml")
    drawing_rels = parse_relationships(archive, "xl/drawings/_rels/drawing1.xml.rels")
    image_col_index = MEASUREMENT_HEADERS.index("HAGRad_image")
    anchors = drawing_root.findall("xdr:twoCellAnchor", NS)
    assert_true(len(anchors) == len(MEASUREMENT_ROWS), "Drawing anchor count does not match thumbnail count.")

    for index, anchor in enumerate(anchors, start=1):
        from_marker = anchor.find("xdr:from", NS)
        assert_true(from_marker is not None, f"Anchor {index} is missing a from marker.")
        col = int(from_marker.findtext("xdr:col", default="-1", namespaces=NS))
        row = int(from_marker.findtext("xdr:row", default="-1", namespaces=NS))
        assert_true(col == image_col_index, f"Image {index} anchored to column {col}, expected {image_col_index}.")
        assert_true(row == index, f"Image {index} anchored to row {row}, expected {index}.")

        blip = anchor.find(".//a:blip", NS)
        assert_true(blip is not None, f"Image {index} missing blip relationship.")
        rel_id = blip.attrib[f"{{{OOXML_REL}}}embed"]
        target = drawing_rels.get(rel_id)
        assert_true(target is not None, f"Drawing relationship {rel_id} missing.")
        media_path = posixpath.normpath(posixpath.join("xl/drawings", target))
        assert_true(media_path == f"xl/media/image{index}.png", f"Unexpected image target: {media_path}")
        png_bytes = archive.read(media_path)
        assert_true(png_bytes.startswith(b"\x89PNG\r\n\x1a\n"), f"{media_path} is not a PNG.")
        assert_true(len(png_bytes) > 80, f"{media_path} PNG is unexpectedly small.")


def available_macos_app(name: str) -> bool:
    return Path(f"/Applications/{name}.app").exists() or Path(f"/System/Applications/{name}.app").exists()


def smoke_open_if_available(workbook_path: Path, temp_dir: Path) -> list[str]:
    results = []
    office_bin = shutil.which("soffice") or shutil.which("libreoffice")
    if office_bin:
        output_dir = temp_dir / "office-smoke"
        output_dir.mkdir(parents=True, exist_ok=True)
        completed = subprocess.run(
            [office_bin, "--headless", "--convert-to", "csv", "--outdir", str(output_dir), str(workbook_path)],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        if completed.returncode != 0:
            output = "\n".join(part for part in [completed.stdout, completed.stderr] if part).strip()
            raise AssertionError(f"LibreOffice smoke-open failed:\n{output}")
        converted_files = list(output_dir.glob("*.csv"))
        assert_true(converted_files, "LibreOffice smoke-open did not create a converted CSV.")
        results.append(f"LibreOffice headless open/convert passed via {office_bin}.")
    else:
        results.append("LibreOffice/soffice not available; skipped headless office smoke.")

    if sys.platform == "darwin":
        gui_apps = [name for name in ("Microsoft Excel", "Numbers") if available_macos_app(name)]
        if gui_apps and os.environ.get("HAGRAD_GUI_WORKBOOK_SMOKE") == "1":
            for app_name in gui_apps:
                completed = subprocess.run(
                    ["open", "-g", "-a", app_name, str(workbook_path)],
                    capture_output=True,
                    text=True,
                    timeout=15,
                    check=False,
                )
                if completed.returncode != 0:
                    output = "\n".join(part for part in [completed.stdout, completed.stderr] if part).strip()
                    raise AssertionError(f"{app_name} GUI smoke-open failed:\n{output}")
                results.append(f"{app_name} GUI open command passed.")
        elif gui_apps:
            results.append(
                "Detected GUI spreadsheet app(s) "
                + ", ".join(gui_apps)
                + "; skipped GUI open unless HAGRAD_GUI_WORKBOOK_SMOKE=1."
            )
        else:
            results.append("Excel/Numbers not available; skipped GUI spreadsheet smoke.")
    return results


def slice_source_between(source: str, start_marker: str, end_marker: str) -> str:
    start = source.find(start_marker)
    end = source.find(end_marker, start + len(start_marker))
    assert_true(start >= 0 and end > start, f"Could not locate source block: {start_marker}")
    return source[start:end]


def validate_viewer_export_source_contract() -> None:
    source = VIEWER_JS.read_text(encoding="utf-8")
    raw_export_block = slice_source_between(
        source,
        "function buildRawProfileWorkbookSheets",
        "function buildRawProfileWorkbookFile",
    )
    for marker in (
        '"raw_samples"',
        '"series_number"',
        '"series_description"',
        '"reconstruction"',
        '"reconstruction_order"',
        '"convolution_kernel"',
    ):
        assert_true(marker in raw_export_block, f"Raw profile export source missing marker: {marker}")

    measurement_table_block = slice_source_between(
        source,
        "function buildMeasurementsTable",
        "function rowsForHeaders",
    )
    for marker in ('"series_number"', '"series_description"', '"reconstruction"', '"profile_raw_sheet"'):
        assert_true(marker in measurement_table_block, f"Measurement/rest export source missing marker: {marker}")

    profile_sample_block = slice_source_between(
        source,
        "function buildProfileRawSampleRows",
        "function buildProfileRawSheetBundle",
    )
    for marker in ('"x_distance_mm"', '"y_hu"', '"raw_y_hu"', '"series_number"'):
        assert_true(marker in profile_sample_block, f"Profile sample export source missing marker: {marker}")

    profile_sheet_block = slice_source_between(
        source,
        "function buildProfileRawSheetBundle",
        "async function buildMeasurementThumbnailImages",
    )
    for marker in ('"profile_sheets"', '"sheet_name"', '"sample_count"'):
        assert_true(marker in profile_sheet_block, f"Profile sheet export source missing marker: {marker}")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="hagrad-viewer-xlsx-test-") as temp_name:
        temp_dir = Path(temp_name)
        workbook_path = temp_dir / "synthetic_measurements.xlsx"
        create_synthetic_measurement_xlsx(workbook_path)
        assert_true(workbook_path.stat().st_size > 0, "Synthetic workbook was not created.")

        with zipfile.ZipFile(workbook_path, "r") as archive:
            sheet_paths = validate_package_structure(archive)
            validate_tables(archive, sheet_paths)
            validate_dimensions(archive, sheet_paths)
            validate_drawings_and_media(archive)

        validate_viewer_export_source_contract()
        smoke_results = smoke_open_if_available(workbook_path, temp_dir)
        print("Viewer XLSX export structure test passed.")
        for result in smoke_results:
            print(f"- {result}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
