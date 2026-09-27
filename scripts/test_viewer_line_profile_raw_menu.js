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

const expectedInterfaceTools = [
  "lineProfileRaw",
  "lineProfile",
  "squareProfile",
  "plaqueLineProfile",
  "plaqueNoncalcifiedLineProfile",
  "vascularLineProfile",
];

const menuMatch = viewerHtml.match(/<div id="interface-tool-menu"[\s\S]*?<\/div>/);
assert(menuMatch, "viewer.html is missing #interface-tool-menu.");

const menuMarkup = menuMatch[0];
assert(
  /data-tool="lineProfileRaw"[\s\S]*?>\s*Line Profile Raw\s*<\/button>/.test(menuMarkup),
  'viewer.html is missing the "Line Profile Raw" interface menu button.',
);

const htmlPositions = expectedInterfaceTools.map((toolKey) => menuMarkup.indexOf(`data-tool="${toolKey}"`));
htmlPositions.forEach((position, index) => {
  assert(position >= 0, `viewer.html interface menu is missing ${expectedInterfaceTools[index]}.`);
});
for (let index = 1; index < htmlPositions.length; index += 1) {
  assert(
    htmlPositions[index] > htmlPositions[index - 1],
    `viewer.html interface menu order is not stable at ${expectedInterfaceTools[index]}.`,
  );
}

const keysMatch = viewerJs.match(/const INTERFACE_TOOL_KEYS = \[([\s\S]*?)\];/);
assert(keysMatch, "viewer.js is missing INTERFACE_TOOL_KEYS.");
const keysBlock = keysMatch[1];
const keyPositions = expectedInterfaceTools.map((toolKey) => keysBlock.indexOf(`"${toolKey}"`));
keyPositions.forEach((position, index) => {
  assert(position >= 0, `INTERFACE_TOOL_KEYS is missing ${expectedInterfaceTools[index]}.`);
});
assert(keyPositions[0] < keyPositions[1], "lineProfileRaw should be first in INTERFACE_TOOL_KEYS.");

const labelsMatch = viewerJs.match(/const INTERFACE_TOOL_LABELS = \{([\s\S]*?)\};/);
assert(labelsMatch, "viewer.js is missing INTERFACE_TOOL_LABELS.");
assert(
  /lineProfileRaw:\s*"Line Profile Raw"/.test(labelsMatch[1]),
  'INTERFACE_TOOL_LABELS.lineProfileRaw must equal "Line Profile Raw".',
);

assert(
  /id:\s*"lineProfileRaw"[\s\S]*?defaultKey:\s*"G"/.test(viewerJs),
  'Line Profile Raw should keep the default "G" shortcut registration.',
);
assert(
  /function renderInterfaceToolMenuItems\(\)/.test(viewerJs),
  "viewer.js should rebuild the interface menu from INTERFACE_TOOL_KEYS.",
);
assert(
  /\/src\/viewer\.js\?v=20260927-line-raw-menu/.test(viewerHtml),
  "viewer.html should bump the viewer.js cache tag for the Line Profile Raw menu fix.",
);

console.log("Line Profile Raw interface menu regression check passed.");
