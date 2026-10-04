import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, validateProject, setRowEdges, faceSpan, isPresent, isSymmetricMask, setIdenticalPatterns,
  derivePairs, deriveCombined, toggleCell, toggleArea, resizeProject, resizeRemovesPattern, initialFocus,
  resizeFocus, resetProject, isResetProject } from '../src/model.js';
import { pairPresentation, pairAppearance } from '../src/notation.js';
import { serializeProjectFile, parseProjectFile, createProjectLibrary, MAX_FILE_BYTES } from '../src/projects.js';
import { createPersistence, STORAGE_KEY } from '../src/storage.js';
import { createHistory } from '../src/history.js';

function triangle(mode = 'double-faced') {
  return { ...createProject(3, 3, mode), maskA: [[2, 3], [1, 3], [0, 3]] };
}
const area = { top: 0, bottom: 2, left: 0, right: 2 };
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('triangle mirrors B presence, keeps compact positions and contains no absent yarn semantics', () => {
  const p = freeze(triangle());
  assert.deepEqual(validateProject(p), p);
  assert.deepEqual([0, 1, 2].map(y => faceSpan(p, 'b', y)), [[0, 1], [0, 2], [0, 3]]);
  assert.deepEqual(derivePairs(p)[0], [{ present: false }, { present: false }, { a: 0, b: 1 }]);
  assert.deepEqual(deriveCombined(p)[0], [null, null, null, null, 1, 0]);
  for (const notation of ['triangle', 'plus']) for (const direction of ['left-to-right', 'right-to-left']) {
    const pair = { present: false };
    assert.deepEqual(pairPresentation(pair, notation, direction), { present: false, background: null,
      plus: false, upper: null, lower: null, description: 'absent pair' });
    assert.equal(pairAppearance(pair, notation, direction).classes['pair-split'], false);
    assert.equal(pairAppearance(pair, notation, direction).classes['pair-plus'], false);
  }
});

test('all load paths reject malformed masks and preserve protected storage', () => {
  const p = triangle();
  assert.throws(() => validateProject({ ...p, maskA: [Array(2), [0, 3], [0, 3]] }));
  const invalids = [undefined, [], [[0, 3]], [[0, 0], [0, 3], [0, 3]],
    [[0, 4], [0, 3], [0, 3]], [[-1, 3], [0, 3], [0, 3]], [[0, 1.5], [0, 3], [0, 3]],
    [[0, '3'], [0, 3], [0, 3]], [[0, 1, 2], [0, 3], [0, 3]],
    [[0, 3], null, [0, 3]], [null, null, null]];
  const map = new Map(), storage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  const library = createProjectLibrary(() => storage, () => 'shape'); library.read();
  for (const invalid of [...invalids.map(maskA => ({ ...p, maskA })), { ...p, maskB: null },
    { ...p, schemaVersion: 5 }, { ...p, identicalPatterns: true, b: undefined }]) {
    assert.throws(() => validateProject(invalid));
    assert.throws(() => parseProjectFile(JSON.stringify(invalid)));
    assert.throws(() => library.save('Invalid', invalid));
    const raw = JSON.stringify(invalid); map.set(STORAGE_KEY, raw);
    const persistence = createPersistence(() => storage); persistence.load(); persistence.save(p);
    assert.equal(persistence.state, 'protected'); assert.equal(map.get(STORAGE_KEY), raw);
  }
});

test('shape changes retain colours, are atomic, no-op aware and invalidate only changed pair rows', () => {
  const p = freeze(toggleCell(createProject(3, 3), 'a', 0, 0));
  const pairs = derivePairs(p), combined = deriveCombined(p);
  const cut = setRowEdges(p, { top: 0, bottom: 0, left: 2 });
  assert.equal(cut.a, p.a); assert.equal(cut.b, p.b);
  assert.equal(cut.a[0][0], 1); assert.equal(isPresent(cut, 'a', 0, 0), false);
  assert.equal(setRowEdges(cut, { top: 0, bottom: 0, left: 2 }), cut);
  assert.deepEqual(setRowEdges(cut, { top: 0, bottom: 0 }), p);
  const nextPairs = derivePairs(cut, p, pairs);
  assert.notEqual(nextPairs[0], pairs[0]); assert.equal(nextPairs[1], pairs[1]);
  assert.deepEqual(nextPairs, derivePairs(cut));
  assert.deepEqual(deriveCombined(cut, p, combined), deriveCombined(cut));
  const history = createHistory(p); history.push(cut);
  assert.equal(history.undo(), p); assert.equal(history.redo(), cut);
  assert.throws(() => setRowEdges(p, { top: 1, bottom: 1, empty: true }), /only above or below/);
  assert.throws(() => setRowEdges(p, { top: 0, bottom: 2, empty: true }), /at least one/);
  assert.throws(() => setRowEdges(p, { top: -1, bottom: 2 }));
  assert.throws(() => setRowEdges(p, { top: 0, bottom: 0, left: 2, right: 1 }));
});

test('single and bulk edits share physical presence and skip all-absent selections', () => {
  const p = freeze(triangle());
  assert.equal(toggleCell(p, 'a', 0, 0), p);
  assert.equal(toggleCell(p, 'b', 0, 2), p);
  assert.equal(toggleArea(p, 'a', { top: 0, bottom: 0, left: 0, right: 1 }), p);
  const a = toggleArea(p, 'a', area), b = toggleArea(p, 'b', area);
  assert.deepEqual(a.a, [[0, 0, 1], [0, 1, 1], [1, 1, 1]]);
  assert.deepEqual(b.b, [[0, 1, 1], [0, 0, 1], [0, 0, 0]]);
  assert.equal(a.maskA, p.maskA); assert.equal(a.b, p.b);
});

test('linked symmetry is enforced in transitions, edits, files and resizes without mirroring motifs', () => {
  assert.equal(isSymmetricMask(triangle()), false);
  assert.throws(() => setIdenticalPatterns(triangle(), true), /symmetric/);
  const linked = setIdenticalPatterns(createProject(5, 2), true);
  const cut = setRowEdges(linked, { top: 0, bottom: 0, left: 2 });
  assert.deepEqual(cut.maskA, [[2, 3], [0, 5]]);
  assert.deepEqual(toggleCell(cut, 'a', 1, 0).a[1], [1, 0, 0, 0, 0]);
  assert.throws(() => setRowEdges(cut, { top: 0, bottom: 1, left: 3 }));
  assert.throws(() => resizeProject(cut, 6, 2), /symmetric/);
  assert.throws(() => validateProject({ ...cut, maskA: [[1, 3], [0, 5]] }), /symmetric/);
  assert.deepEqual(setIdenticalPatterns(cut, false).maskA, cut.maskA);
  assert.equal(setRowEdges(createProject(1, 2, 'double-faced', true), { top: 0, bottom: 0, empty: true }).maskA[0], null);
  assert.throws(() => setRowEdges(createProject(1, 1, 'double-faced', true), { top: 0, bottom: 0, empty: true }));
});

test('shaped resize preserves anchors and padding, rejects broken spans, and warns about hidden colours', () => {
  const p = freeze(triangle('plain'));
  const grown = resizeProject(p, 4, 4);
  assert.deepEqual(grown.maskA, [null, [3, 4], [2, 4], [1, 4]]);
  assert.deepEqual(resizeProject(grown, 3, 3), p);
  assert.deepEqual(resizeProject(p, 2, 2).maskA, [[0, 2], [0, 2]]);
  const isolated = { ...createProject(3, 3), maskA: [[2, 3], [0, 1], [2, 3]] };
  assert.throws(() => resizeProject(isolated, 2, 3), /only above or below|at least one/);
  const hiddenColour = { ...p, a: [[1, 0, 0], [0, 0, 0], [0, 0, 0]] };
  assert.equal(resizeRemovesPattern(hiddenColour, 2, 3), true);
  const oneLeft = { ...createProject(3, 1), maskA: [[0, 1]] };
  assert.throws(() => resizeProject(oneLeft, 1, 1), /at least one/);
});

test('focus uses present coordinates in either face and Reset includes shape differences', () => {
  const p = { ...triangle(), maskA: [null, [1, 3], null] };
  assert.deepEqual(initialFocus(p, 'a'), { x: 2, y: 1 });
  assert.deepEqual(initialFocus(p, 'b'), { x: 0, y: 1 });
  assert.deepEqual(resizeFocus({ x: 0, y: 0 }, 'a', p, p), { x: 1, y: 1 });
  const defaults = createProject();
  const cut = setRowEdges(defaults, { top: 0, bottom: 0, left: 1 });
  assert.equal(isResetProject(cut), false);
  assert.equal(isResetProject(resetProject(cut)), true);
});

test('maximum shaped and rectangular sources round-trip within the file budget in every mode', () => {
  for (const mode of ['plain', 'double-faced']) for (const linked of mode === 'plain' ? [false] : [false, true]) {
    const p = createProject(200, 200, mode, linked);
    for (const shaped of [false, true]) {
      const next = shaped ? { ...p, maskA: p.maskA.map((_, y) => [y % 100, 200 - y % 100]) } : p;
      const file = serializeProjectFile(next, '🧶'.repeat(80));
      assert.ok(Buffer.byteLength(file) < MAX_FILE_BYTES);
      assert.deepEqual(parseProjectFile(file).project, next);
      const map = new Map(), storage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
      const library = createProjectLibrary(() => storage, () => 'shape'); library.read(); library.save('Shape', next);
      assert.deepEqual(library.read()[0].project, next);
      const persistence = createPersistence(() => storage); persistence.load(); persistence.save(next);
      assert.deepEqual(createPersistence(() => storage).load(), next);
    }
  }
});
