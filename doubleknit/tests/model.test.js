import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, deriveCombined, initialFocus, parseDimension, resizeFocus, resizeProject,
  resizeRemovesPattern, rowDirection, rowNumber, toggleCell, validateProject } from '../src/model.js';

const bits = text => [...text].map(c => c === 'X' ? 1 : 0);
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('default charts are independent base-filled 20 × 20 sources and a 40 × 20 result', () => {
  const project = createProject();
  assert.equal(project.width, 20);
  assert.equal(project.height, 20);
  assert.deepEqual(deriveCombined(project), Array.from({ length: 20 }, () => Array.from({ length: 40 }, (_, x) => x % 2 ? 0 : 1)));
  project.a[0][0] = 1;
  assert.equal(project.a[1][0], 0);
  assert.equal(project.b[0][0], 1);
});

test('all four yarn pairs use B,A without inversion', () => {
  for (const a of [0, 1]) for (const b of [0, 1]) {
    const project = freeze({ ...createProject(1, 1), a: [[a]], b: [[b]] });
    assert.deepEqual(deriveCombined(project), [[b, a]]);
  }
});

test('all specified examples and asymmetric patterns preserve source orientation and purity', () => {
  for (const [a, b, c] of [
    ['XOOOX', 'XOOOO', 'OXOOOOOOXX'],
    ['OXOXO', 'XXXOO', 'OOOXXOXXXO'],
    ['OOXOO', 'XXXXX', 'XOXOXXXOXO'],
    ['OXOXO', 'XXXOO', 'OOOXXOXXXO'],
    ['XOOOX', 'XOOOO', 'OXOOOOOOXX'],
    ['XOO', 'OXO', 'OXXOOO'],
    ['OOX', 'XOO', 'OOOOXX'],
  ]) {
    const project = freeze({ ...createProject(a.length, 1), a: [bits(a)], b: [bits(b)] });
    assert.deepEqual(deriveCombined(project), [bits(c)]);
  }
  assert.throws(() => deriveCombined({ mapping: 'toString' }), /Unsupported/);
});

test('spatial rows and reading directions remain separate', () => {
  assert.equal(rowNumber(5, 4), 1);
  assert.equal(rowNumber(5, 3), 2);
  assert.equal(rowDirection(1), 'right-to-left');
  assert.equal(rowDirection(2), 'left-to-right');
});

test('single-cell edits leave the other face and previous project unchanged', () => {
  const old = freeze(createProject(2, 2));
  const next = toggleCell(old, 'a', 1, 1);
  assert.deepEqual(next.a, [[0, 0], [0, 1]]);
  assert.deepEqual(next.b, old.b);
  assert.deepEqual(toggleCell(next, 'a', 1, 1), old);
  assert.throws(() => toggleCell(old, 'c', 0, 0));
});

test('incremental combined chart reuses untouched rows and matches full derivation', () => {
  let project = freeze(createProject(3, 3));
  let combined = freeze(deriveCombined(project));
  for (const face of ['a', 'b']) {
    const next = freeze(toggleCell(project, face, 1, 0));
    const result = freeze(deriveCombined(next, project, combined));
    assert.deepEqual(result, deriveCombined(next));
    assert.equal(result[0], combined[0]);
    assert.notEqual(result[1], combined[1]);
    assert.equal(result[2], combined[2]);
    project = next;
    combined = result;
  }
  for (const next of [resizeProject(project, 4, 4), resizeProject(project, 2, 2), createProject(3, 3)]) {
    assert.deepEqual(deriveCombined(next, project, combined), deriveCombined(next));
  }
});

test('resize follows bottom/right A and bottom/left B anchors, preserving pure transactions', () => {
  const old = freeze({ ...createProject(2, 1), a: [bits('XO')], b: [bits('OX')] });
  const grown = resizeProject(old, 3, 2);
  assert.deepEqual(grown.a, [bits('OOO'), bits('OXO')]);
  assert.deepEqual(grown.b, [bits('XXX'), bits('OXX')]);
  assert.equal(resizeRemovesPattern(grown, 2, 1), false);
  assert.deepEqual(resizeProject(grown, 2, 1), old);
  assert.equal(resizeProject(old, 2, 1), old);
  for (const [face, y, x, w, h] of [['a', 1, 0, 1, 2], ['b', 1, 1, 1, 2],
    ['a', 0, 1, 2, 1], ['b', 0, 0, 2, 1]]) {
    assert.equal(resizeRemovesPattern(toggleCell(createProject(2, 2), face, y, x), w, h), true);
  }
});

test('focus follows retained stitches and clamps cropped coordinates; defaults use different edges', () => {
  const old = createProject(3, 3), small = createProject(1, 1), big = createProject(5, 5);
  assert.deepEqual(initialFocus(old, 'a'), { x: 2, y: 2 });
  assert.deepEqual(initialFocus(old, 'b'), { x: 0, y: 2 });
  assert.deepEqual(resizeFocus({ x: 0, y: 0 }, 'a', old, small), { x: 0, y: 0 });
  assert.deepEqual(resizeFocus({ x: 2, y: 2 }, 'b', old, small), { x: 0, y: 0 });
  assert.deepEqual(resizeFocus({ x: 1, y: 1 }, 'a', old, big), { x: 3, y: 3 });
  assert.deepEqual(resizeFocus({ x: 1, y: 1 }, 'b', old, big), { x: 1, y: 3 });
});

test('dimensions reject empty, fractional, nonnumeric and out-of-range input', () => {
  for (const value of ['', ' ', '0', '-1', '1.5', '1e2', 'abc', '201', 'Infinity']) {
    assert.equal(parseDimension(value), null, value);
  }
  assert.equal(parseDimension(' 1 '), 1);
  assert.equal(parseDimension('200'), 200);
});

test('complete source validation rejects malformed shapes, cells, versions and mappings', () => {
  const valid = createProject(1, 1);
  for (const invalid of [null, [], {}, { ...valid, schemaVersion: '1' }, { ...valid, mapping: 'future' },
    { ...valid, width: 201 }, { ...valid, height: 1.5 }, { ...valid, a: [] }, { ...valid, b: [[0, 0]] },
    { ...valid, a: [[true]] }, { ...valid, b: [['0']] }, { ...valid, a: [[2]] }, { ...valid, a: [Array(1)] }]) {
    assert.throws(() => validateProject(invalid));
  }
  const copy = validateProject({ ...valid, c: 'ignored', setting: 'future' });
  assert.deepEqual(copy, valid);
  assert.notEqual(copy.a, valid.a);
  assert.notEqual(copy.a[0], valid.a[0]);
});

test('maximum supported dimensions round-trip and derive the full bounding width', () => {
  const project = validateProject(createProject(200, 200));
  const combined = deriveCombined(project);
  assert.equal(combined.length, 200);
  assert.equal(combined[199].length, 400);
});
