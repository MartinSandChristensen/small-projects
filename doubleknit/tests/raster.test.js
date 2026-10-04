import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, derivePairs, reverseColour } from '../src/model.js';
import { inspectRaster, orientPixels, rasterFace, rasterProject, isBlankPattern, luminance, MAX_RASTER_BYTES } from '../src/raster.js';
import { serializeProjectFile, parseProjectFile } from '../src/projects.js';
import { translate } from '../src/i18n.js';
import { png, pngChunk, exif, gif, rgba } from '../scripts/raster-fixtures.mjs';
const image = (rows, name = 'art.png') => ({ width: rows[0].length, height: rows.length, data: Uint8ClampedArray.from(rgba(rows)), name });
const current = createProject(2, 2);
const throwsKey = (fn, key) => assert.throws(fn, error => error.descriptor?.key === key);

test('raster container checks signatures, bounded dimensions, truncation and animation before decode', () => {
  for (const bytes of [png(3, 1, rgba(['010'])), gif(3, 1, [0, 1, 0])]) {
    const info = inspectRaster(bytes); assert.equal(info.width, 3); assert.equal(info.height, 1);
    throwsKey(() => inspectRaster(bytes.subarray(0, bytes.length - 1)), 'raster.invalid');
  }
  throwsKey(() => inspectRaster(Buffer.from('<svg/>')), 'raster.format');
  throwsKey(() => inspectRaster(Buffer.from([255, 216, 255, 0, 0, 0])), 'raster.jpeg');
  throwsKey(() => inspectRaster(Buffer.alloc(MAX_RASTER_BYTES + 1)), 'raster.fileSize');
  throwsKey(() => inspectRaster(png(201, 1, rgba(['0'.repeat(201)]))), 'raster.dimensions');
  throwsKey(() => inspectRaster(gif(201, 1, Array(201).fill(0))), 'raster.dimensions');
  throwsKey(() => inspectRaster(gif(1, 1, [0], { animated: true })), 'raster.animation');
  for (const type of ['acTL', 'fcTL', 'fdAT']) throwsKey(() => inspectRaster(png(1, 1, rgba(['0']), [pngChunk(type)])), 'raster.animation');
  const largeFrame = gif(1, 1, [0]); largeFrame.writeUInt16LE(201, 24);
  throwsKey(() => inspectRaster(largeFrame), 'raster.dimensions');
  const deep = png(1, 1, rgba(['0'])); deep[24] = 16;
  throwsKey(() => inspectRaster(deep), 'raster.bitDepth');
});

test('PNG EXIF is stripped and all eight orientations are exact integer pixel transforms', () => {
  const source = { width: 3, height: 2, data: Uint8ClampedArray.from([1, 2, 3, 4, 5, 6].flatMap(v => [v, v, v, 255])) };
  const expected = ['123456', '321654', '654321', '456123', '142536', '415263', '635241', '362514'];
  for (let orientation = 1; orientation <= 8; orientation++) {
    for (const little of [false, true]) {
      const info = inspectRaster(png(3, 2, [...source.data], [exif(orientation, little)]));
      assert.equal(info.orientation, orientation);
      assert.equal(inspectRaster(Buffer.concat(info.parts)).orientation, 1);
    }
    const result = orientPixels(source, orientation);
    assert.equal(result.width, orientation >= 5 ? 2 : 3);
    assert.equal([...result.data].filter((_, i) => i % 4 === 0).join(''), expected[orientation - 1]);
  }
  throwsKey(() => inspectRaster(png(1, 1, rgba(['0']), [exif(9)])), 'raster.invalid');
});

test('strict opaque colour mapping ignores transparent RGB and retains deterministic absent bases', () => {
  assert.equal(luminance([0, 0, 0]), 0); assert.equal(luminance([255, 255, 255]), 1);
  const art = image(['.01.']); art.data.set([128, 0, 0, 0], 12);
  assert.deepEqual(rasterFace(art, 'a', 'flat').chart, [[0, 0, 1, 0]]);
  assert.deepEqual(rasterFace(art, 'b', 'flat').chart, [[1, 0, 1, 1]]);
  for (const [value, bit] of [[0, 1], [128, 1], [255, 0]]) {
    const solid = { width: 1, height: 1, data: Uint8ClampedArray.from([value, value, value, 255]) };
    assert.deepEqual(rasterFace(solid, 'a', 'flat').chart, [[bit]]);
  }
  const colours = image(['010']); colours.data.set([255, 0, 0, 255], 8);
  assert.throws(() => rasterFace(colours, 'a', 'in-the-round'), error => {
    assert.equal(error.descriptor.key, 'raster.colours'); assert.match(translate(error.descriptor), /round 1, column 3/); return true;
  });
  const alpha = image(['0']); alpha.data[3] = 128;
  throwsKey(() => rasterFace(alpha, 'a', 'flat'), 'raster.alpha');
  throwsKey(() => rasterFace(image(['0.1']), 'a', 'flat'), 'raster.hole');
  throwsKey(() => rasterFace(image(['0', '.', '1']), 'a', 'flat'), 'error.shapeEmpty');
  throwsKey(() => rasterFace(image(['.']), 'a', 'flat'), 'error.emptyShape');
});

test('raster replacement resolves modes and mirrored triangle masks without reversing designs', () => {
  current.workflow = 'in-the-round'; current.display.notation = 'plus'; current.display.rows = 30;
  const before = JSON.stringify(current);
  const a = image(['..1', '.01', '101']), b = image(['1..', '01.', '110'], 'back.gif');
  const independent = rasterProject({ a, b }, current, 'double-faced');
  assert.deepEqual(independent.maskA, [[2, 3], [1, 3], [0, 3]]);
  assert.deepEqual(independent.a[2], [1, 0, 1]); assert.deepEqual(independent.b[2], [1, 1, 0]);
  assert.deepEqual(derivePairs(independent)[2], [{ a: 1, b: 0 }, { a: 0, b: 1 }, { a: 1, b: 1 }]);
  const plain = rasterProject({ a }, current, 'plain');
  assert.equal(Object.hasOwn(plain, 'b'), false); assert.equal(Object.hasOwn(plain, 'identicalPatterns'), false);
  assert.equal(reverseColour(plain, 1, 0), 0);
  const linked = rasterProject({ a: image(['001']) }, current, 'double-faced', true);
  assert.equal(Object.hasOwn(linked, 'b'), false); assert.equal(reverseColour(linked, 0, 0), 1);
  assert.throws(() => rasterProject({ a }, current, 'double-faced', true), /Image A.*symmetric/);
  assert.throws(() => rasterProject({ a, b: a }, current, 'double-faced'), /Image B.*mirror/);
  assert.throws(() => rasterProject({ a, b: image(['0']) }, current, 'double-faced'), /Image B.*identical dimensions/);
  for (const project of [plain, linked, independent]) {
    assert.equal(project.workflow, 'in-the-round'); assert.deepEqual(project.display, current.display);
    assert.deepEqual(parseProjectFile(serializeProjectFile(project, 'Ærø')).project, project);
  }
  assert.equal(JSON.stringify(current), before);
});

test('blank means rectangular base-filled independent sources regardless of dimensions or settings', () => {
  for (const project of [createProject(3, 1), createProject(3, 1, 'plain'), createProject(3, 1, 'double-faced', true)]) {
    project.workflow = 'in-the-round'; project.display.rows = 40;
    assert.equal(isBlankPattern(project), true);
    project.maskA[0] = [1, 2]; assert.equal(isBlankPattern(project), false);
    project.maskA[0] = [0, 3]; project.a[0][0] = 1; assert.equal(isBlankPattern(project), false);
  }
  const project = createProject(1, 1); project.b[0][0] = 0; assert.equal(isBlankPattern(project), false);
});

test('200 by 200 imports in all source modes fit the current JSON limit', () => {
  const a = image(Array.from({ length: 200 }, (_, y) => Array.from({ length: 200 }, (_, x) => (x + y) % 2).join('')));
  for (const [mode, linked] of [['plain', false], ['double-faced', false], ['double-faced', true]]) {
    const result = rasterProject({ a, b: a }, current, mode, linked);
    const text = serializeProjectFile(result, 'Maximum');
    assert.ok(Buffer.byteLength(text) < 1024 * 1024);
    assert.deepEqual(parseProjectFile(text).project, result);
  }
});
