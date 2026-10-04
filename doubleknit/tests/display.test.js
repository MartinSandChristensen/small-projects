import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DISPLAY, cellGeometry, guideBoundaries, validateDisplay } from '../src/display.js';
import { createProject, validateProject, resizeProject, toggleCell, deriveCombined } from '../src/model.js';
import { createPersistence, STORAGE_KEY } from '../src/storage.js';
import { createProjectLibrary, LIBRARY_KEY, parseProjectFile, serializeProjectFile } from '../src/projects.js';

const display = { notation: 'triangle', stitches: 20, rows: 30, proportional: true, guides: true, guideSize: 3 };
test('gauge proportions clamp across all charts without reducing targets, including numeric extremes', () => {
  for (const [stitches, rows, ratio, width, height, clamped] of [
    [20, 30, 1.5, 36, 24, false], [40, 10, 0.5, 24, 48, true], [10, 40, 2, 48, 24, true],
    [Number.MIN_VALUE, Number.MAX_VALUE, 2, 48, 24, true],
    [Number.MAX_VALUE, Number.MIN_VALUE, 0.5, 24, 48, true],
  ]) {
    const settings = { ...display, stitches, rows };
    for (const face of ['A', 'B', 'C']) assert.deepEqual(cellGeometry(settings, face), { width, height, ratio, clamped });
    assert.equal(cellGeometry({ ...settings, proportional: false }, 'A').width, 24);
  }
});
test('display validation rejects incomplete, coerced and invalid settings', () => {
  for (const key of Object.keys(display)) {
    const missing = { ...display }; delete missing[key];
    assert.throws(() => validateDisplay(missing));
  }
  for (const key of ['stitches', 'rows']) for (const value of [0, -1, NaN, Infinity, '20', null]) {
    assert.throws(() => validateDisplay({ ...display, [key]: value }));
  }
  for (const guideSize of [0, -1, 1.5, 201, '10', Infinity]) {
    assert.throws(() => validateDisplay({ ...display, guideSize }));
  }
  for (const key of ['guides', 'proportional']) assert.throws(() => validateDisplay({ ...display, [key]: 1 }));
  assert.deepEqual(validateDisplay({ ...display, unknown: true }), display);
});
test('guide boundaries mirror B, align C pairs and retain partial outer frames', () => {
  assert.deepEqual(guideBoundaries('A', 23, 12, 10), { vertical: [0, 3, 13, 23], horizontal: [0, 2, 12] });
  assert.deepEqual(guideBoundaries('B', 23, 12, 10), { vertical: [0, 10, 20, 23], horizontal: [0, 2, 12] });
  assert.deepEqual(guideBoundaries('C', 23, 12, 10), { vertical: [0, 3, 13, 23], horizontal: [0, 2, 12] });
  for (const width of [1, 10, 11, 23, 200]) for (const size of [1, 10, 200]) {
    const a = guideBoundaries('A', width, 13, size);
    const b = guideBoundaries('B', width, 13, size);
    const c = guideBoundaries('C', width, 13, size);
    assert.deepEqual(b.vertical.map(x => width - x).reverse(), a.vertical);
    assert.deepEqual(c.vertical, a.vertical);
  }
});
test('old versions are rejected by every load path without overwriting stored bytes', () => {
  for (const schemaVersion of [1, 2, 3, 4, 5, 6]) {
    const legacy = { ...createProject(2, 1), schemaVersion };
    const raw = JSON.stringify(legacy);
    const data = new Map([[STORAGE_KEY, raw], [LIBRARY_KEY, JSON.stringify({
      libraryVersion: 1, entries: [{ id: 'old', name: 'Legacy', project: legacy }],
    })]]);
    const storage = { getItem: key => data.get(key), setItem() { assert.fail('Must not overwrite'); } };
    const current = createPersistence(() => storage);
    assert.deepEqual(current.load(), createProject());
    assert.equal(current.state, 'protected');
    current.save(createProject());
    assert.equal(data.get(STORAGE_KEY), raw);
    assert.throws(() => createProjectLibrary(() => storage).read());
    assert.throws(() => parseProjectFile(raw));
    assert.throws(() => parseProjectFile(JSON.stringify({ format: 'doubleknit', fileVersion: 1,
      name: 'Legacy', project: legacy })));
  }
});
test('current-version settings round-trip, stay independent, survive edits/resizes and reset to defaults', () => {
  const project = { ...createProject(2, 1), display };
  const clean = validateProject(project);
  assert.notEqual(clean.display, display);
  assert.deepEqual(parseProjectFile(serializeProjectFile(project, 'Gauge')).project, project);
  assert.deepEqual(resizeProject(project, 3, 2).display, display);
  assert.deepEqual(toggleCell(project, 'a', 0, 0).display, display);
  assert.deepEqual(deriveCombined(project), deriveCombined(createProject(2, 1)));
  assert.deepEqual(createProject().display, DEFAULT_DISPLAY);
  assert.throws(() => validateProject({ ...project, display: undefined }));
  assert.throws(() => validateProject({ ...project, schemaVersion: 8 }));
});

test('new projects use Plus and gauge while existing display preferences round-trip', () => {
  assert.equal(createProject().display.notation, 'plus');
  assert.equal(createProject().display.proportional, true);
  const project = { ...createProject(), display: { ...DEFAULT_DISPLAY, notation: 'triangle', proportional: false } };
  assert.deepEqual(parseProjectFile(serializeProjectFile(project, 'Triangles')).project.display, project.display);
});

test('gauge and guide drafts validate independently, so hidden invalid drafts do not block changes', async () => {
  const { DisplayControls } = await import('../src/display-controls.js');
  const emitted = [];
  const context = { display: { ...DEFAULT_DISPLAY }, locale: 'en-GB', stitches: '21.5', rows: '30',
    guideSize: 'unfinished', $emit: (...args) => emitted.push(args), $nextTick: () => {} };
  DisplayControls.methods.apply.call(context, 'gauge');
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0][1].stitches, 21.5);
  assert.equal(emitted[0][1].guideSize, DEFAULT_DISPLAY.guideSize);
  context.stitches = 'unfinished'; context.guideSize = '5';
  DisplayControls.methods.apply.call(context, 'guides');
  assert.equal(emitted.length, 2);
  assert.equal(emitted[1][1].guideSize, 5);
  assert.equal(emitted[1][1].stitches, DEFAULT_DISPLAY.stitches);
  context.guideSize = '0';
  DisplayControls.methods.apply.call(context, 'guides');
  assert.equal(emitted.length, 2);
  assert.ok(context.errors.guideSize);
});
