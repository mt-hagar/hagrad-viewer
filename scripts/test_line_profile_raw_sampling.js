const assert = require("node:assert/strict");
const sampler = require("../src/shared/hagrad-line-profile-raw.js");

function closeTo(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function buildSyntheticVolume() {
  const columns = 4;
  const rows = 3;
  const depth = 2;
  const slices = [];
  for (let z = 0; z < depth; z += 1) {
    const pixels = new Float32Array(rows * columns);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        pixels[y * columns + x] = x + 10 * y + 100 * z;
      }
    }
    slices.push({
      rows,
      columns,
      pixels,
      slope: 2,
      intercept: -100,
    });
  }
  return {
    rows,
    columns,
    depth,
    slices,
    origin: [0, 0, 0],
    rowDirection: [1, 0, 0],
    columnDirection: [0, 1, 0],
    normal: [0, 0, 1],
    columnSpacing: 2,
    rowSpacing: 3,
    sliceSpacing: 4,
  };
}

const volume = buildSyntheticVolume();
const startWorld = [0, 0, 0];
const endWorld = [6, 6, 4];
const totalLengthMm = Math.hypot(6, 6, 4);
const result = sampler.sampleLineProfile({
  volume,
  startWorld,
  endWorld,
  sampleSpacingMm: totalLengthMm / 3,
  plane: "axial",
});

assert.equal(result.sampleCount, 4);
closeTo(result.lengthMm, totalLengthMm);
closeTo(result.sampleSpacingMm, totalLengthMm / 3);

const expectedVoxel = [
  [0, 0, 0],
  [1, 2 / 3, 1 / 3],
  [2, 4 / 3, 2 / 3],
  [3, 2, 1],
];
const expectedTrilinearHu = [-100, -18, 64, 146];
const expectedNearestRaw = [0, 11, 112, 123];
const expectedNearestHu = [-100, -78, 124, 146];

result.rawSamples.forEach((sample, index) => {
  closeTo(sample.distanceMm, index === 3 ? totalLengthMm : (totalLengthMm / 3) * index);
  closeTo(sample.normalizedPosition, index / 3);
  closeTo(sample.voxelX, expectedVoxel[index][0]);
  closeTo(sample.voxelY, expectedVoxel[index][1]);
  closeTo(sample.voxelZ, expectedVoxel[index][2]);
  closeTo(sample.huTrilinear, expectedTrilinearHu[index], 1e-6);
  closeTo(sample.rawStoredValue, expectedNearestRaw[index], 1e-6);
  closeTo(sample.huNearest, expectedNearestHu[index], 1e-6);
  closeTo(sample.hu, expectedNearestHu[index], 1e-6);
  assert.equal(sample.plane, "axial");
  assert.equal(sample.interpolationMethod, "nearest");
});

const hagradVolume = {
  ...volume,
  origin: undefined,
  normal: undefined,
  originWorld: [20, -30, 12],
  normalDirection: [0, 0, 1],
};
const hagradStartWorld = [20, -30, 12];
const hagradEndWorld = [26, -24, 16];
const hagradResult = sampler.sampleLineProfile({
  volume: hagradVolume,
  startWorld: hagradStartWorld,
  endWorld: hagradEndWorld,
  sampleSpacingMm: totalLengthMm / 3,
  plane: "axial",
});

assert.equal(hagradResult.sampleCount, 4);
hagradResult.rawSamples.forEach((sample, index) => {
  closeTo(sample.voxelX, expectedVoxel[index][0]);
  closeTo(sample.voxelY, expectedVoxel[index][1]);
  closeTo(sample.voxelZ, expectedVoxel[index][2]);
  closeTo(sample.huNearest, expectedNearestHu[index], 1e-6);
  closeTo(sample.hu, expectedNearestHu[index], 1e-6);
});

console.log("Line Profile Raw synthetic sampling test passed.");
