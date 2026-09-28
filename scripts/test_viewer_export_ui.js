#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const viewerHtml = fs.readFileSync(path.join(repoRoot, "src", "viewer.html"), "utf8");
const viewerJs = fs.readFileSync(path.join(repoRoot, "src", "viewer.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buttonWithText(id, text) {
  const pattern = new RegExp(`<button[^>]*id="${id}"[^>]*>[\\s\\S]*?${text}[\\s\\S]*?<\\/button>`);
  return pattern.test(viewerHtml);
}

assert(buttonWithText("finish-close-button", "Finish\\s*&amp;\\s*Close"), "Export sidebar must keep a standalone Finish & Close button.");
assert(buttonWithText("export-button", "Export\\.\\.\\."), 'Export sidebar must expose the compact "Export..." dropdown trigger.');
assert(/id="export-button"[\s\S]*aria-controls="export-modal"/.test(viewerHtml), "Export trigger should control the export dropdown panel.");
assert(/id="export-modal"[\s\S]*class="export-popover is-hidden"/.test(viewerHtml), "Export options should be in the compact dropdown popover.");
assert(
  !/data-section-id="analysis-export"[^>]*data-default-collapsed="true"/.test(viewerHtml),
  "Export section should not default to collapsed because Finish & Close must stay visible.",
);

[
  "export-option-measurements",
  "export-option-raw-profiles",
  "export-option-baseline",
  "export-option-cine",
  "export-option-rest",
].forEach((id) => {
  assert(new RegExp(`id="${id}"[^>]*type="checkbox"|type="checkbox"[^>]*id="${id}"`).test(viewerHtml), `${id} checkbox is missing.`);
});

assert(!/id="export-option-finish-close"/.test(viewerHtml), "Finish & Close should not be a checkbox inside export options.");
assert(!/<button[^>]*>\s*Export Cine Clip\s*<\/button>/.test(viewerHtml), "Old Export Cine Clip button should not be present.");
assert(!/<button[^>]*>\s*Export Measurements\s*<\/button>/.test(viewerHtml), "Old Export Measurements button should not be present.");
assert(!/<button[^>]*>\s*Export Baseline Characteristics\s*<\/button>/.test(viewerHtml), "Old Export Baseline Characteristics button should not be present.");

assert(/els\.finishCloseButton = document\.getElementById\("finish-close-button"\)/.test(viewerJs), "viewer.js should cache the standalone Finish & Close button.");
assert(/finishClose:\s*Boolean\(state\.pendingExport\?\.finishClose\)/.test(viewerJs), "Finish & Close intent should come from pending export state.");
assert(/openMeasurementExportModal\("finishClose"\)/.test(viewerJs), "Standalone Finish & Close should open close-after-export mode.");
assert(/function ensureExportSectionExpanded\(\)/.test(viewerJs), "Export tab should force the Export section open.");
assert(/openViewerExportModal\(\{\s*finishClose:\s*false\s*\}\)/.test(viewerJs), "Export trigger should explicitly open normal export mode.");
assert(/\/src\/viewer\.js\?v=20260927-compact-export-explicit/.test(viewerHtml), "viewer.js cache tag should be bumped for the compact export UI.");

console.log("Viewer compact export UI regression check passed.");
