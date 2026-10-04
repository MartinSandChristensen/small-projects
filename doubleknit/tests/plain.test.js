import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, validateProject, reverseColour, derivePairs, deriveCombined,
  toggleCell, toggleArea, resizeProject, resizeRemovesPattern, resetProject, isResetProject } from '../src/model.js';
import { serializeProjectFile, parseProjectFile, createProjectLibrary } from '../src/projects.js';
import { createHistory } from '../src/history.js';
import { createPersistence, STORAGE_KEY } from '../src/storage.js';

test('Plain inverse-mirrors the outward reverse and preserves physical opposite-colour pairs', () => {
  const p = { ...createProject(3, 1, 'plain'), a: [[0, 0, 1]] };
  assert.deepEqual([0, 1, 2].map(x => reverseColour(p, 0, x)), [0, 1, 1]);
  assert.deepEqual(deriveCombined(p), [[1, 0, 1, 0, 0, 1]]);
  assert.ok(derivePairs(p)[0].every(pair => pair.a !== pair.b));
  const pairs = derivePairs(p);
  assert.equal(derivePairs({ ...p, display: { ...p.display, notation: 'plus' } }, p, pairs)[0], pairs[0]);
  const independent = { ...p, mode: 'double-faced', b: [[0, 0, 0]] };
  assert.notEqual(derivePairs(independent, p, pairs)[0], pairs[0]);
  assert.throws(() => toggleCell(p, 'b', 0, 0));
  assert.throws(() => toggleArea(p, 'b', { top: 0, bottom: 0, left: 0, right: 2 }));
});

test('Plain resize, area edits and history store only A and retain its bottom-right anchor', () => {
  const p = toggleCell(createProject(3, 1, 'plain'), 'a', 0, 2);
  const grown = resizeProject(p, 4, 2);
  assert.deepEqual(grown.a, [[0, 0, 0, 0], [0, 0, 0, 1]]);
  assert.equal(Object.hasOwn(grown, 'b'), false);
  assert.equal(resizeRemovesPattern(grown, 1, 1), false);
  assert.equal(resizeRemovesPattern({ ...p, a: [[1, 0, 0]] }, 2, 1), true);
  const history = createHistory(grown);
  const changed = toggleArea(grown, 'a', { top: 0, bottom: 1, left: 0, right: 3 });
  history.push(changed);
  assert.deepEqual(history.undo(), grown);
  assert.deepEqual(history.redo(), changed);
  assert.deepEqual(grown.a[1], [0, 0, 0, 1]);
  assert.ok(derivePairs(changed).flat().every(pair => pair.a !== pair.b));
});

test('mode discrimination is shared by files, snapshots and guarded current storage', () => {
  const p = createProject(3, 1, 'plain');
  for (const invalid of [{ ...p, mode: undefined }, { ...p, mode: 'other' },
    { ...p, b: null }, { ...p, b: [[1, 1, 1]] }, { ...p, mode: 'double-faced' },
    { ...p, schemaVersion: 3 }]) {
    assert.throws(() => validateProject(invalid));
    assert.throws(() => parseProjectFile(JSON.stringify(invalid)));
  }
  const storage = new Map();
  const adapter = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  const persistence = createPersistence(() => adapter);
  persistence.load();
  assert.equal(persistence.missing, true);
  persistence.save(p);
  assert.deepEqual(createPersistence(() => adapter).load(), p);
  const library = createProjectLibrary(() => adapter);
  library.read();
  library.save('Plain', p);
  assert.deepEqual(library.read()[0].project, p);
  assert.deepEqual(parseProjectFile(serializeProjectFile(p, 'Plain')).project, p);
  storage.set(STORAGE_KEY, '{broken');
  const guarded = createPersistence(() => adapter);
  guarded.load();
  assert.equal(guarded.missing, false);
  guarded.save(p);
  assert.equal(storage.get(STORAGE_KEY), '{broken');
  guarded.replace(p);
  assert.deepEqual(JSON.parse(storage.get(STORAGE_KEY)), p);
});

test('Reset equality includes every current source setting and preserves mode at maximum size', () => {
  for (const mode of ['plain', 'double-faced']) {
    const p = createProject(undefined, undefined, mode);
    assert.equal(isResetProject(p), true);
    assert.equal(isResetProject(toggleCell(p, 'a', 0, 0)), false);
    for (const [key, value] of Object.entries({ notation: 'triangle', stitches: 21, rows: 21,
      proportional: false, guides: true, guideSize: 11 })) {
      assert.equal(isResetProject({ ...p, display: { ...p.display, [key]: value } }), false);
    }
    const large = resizeProject(p, 200, 200);
    assert.equal(isResetProject(large), false);
    assert.deepEqual(resetProject(large), p);
    assert.deepEqual(parseProjectFile(serializeProjectFile(large, mode)).project, large);
  }
});
