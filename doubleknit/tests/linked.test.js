import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, validateProject, setIdenticalPatterns, reverseColour, derivePairs, deriveCombined,
  editableFaces, toggleCell, toggleArea, resizeProject, resetProject, isResetProject } from '../src/model.js';
import { createHistory } from '../src/history.js';
import { serializeProjectFile, parseProjectFile, createProjectLibrary } from '../src/projects.js';
import { createPersistence, STORAGE_KEY } from '../src/storage.js';

test('linked outward B inverts without mirroring; physical mapping still mirrors once', () => {
  const independent = { ...createProject(3, 1), a: [[0, 0, 1]], b: [[0, 0, 0]] };
  const linked = setIdenticalPatterns(independent, true);
  assert.deepEqual([0, 1, 2].map(x => reverseColour(linked, 0, x)), [1, 1, 0]);
  assert.deepEqual(deriveCombined(linked), [[0, 0, 1, 0, 1, 1]]);
  assert.deepEqual(derivePairs(linked), [[{ a: 0, b: 0 }, { a: 0, b: 1 }, { a: 1, b: 1 }]]);
  assert.deepEqual(editableFaces(linked), ['a']);
  assert.equal(Object.hasOwn(linked, 'b'), false);
  assert.deepEqual(independent.b, [[0, 0, 0]]);
  assert.throws(() => toggleCell(linked, 'b', 0, 0));
  assert.throws(() => toggleArea(linked, 'b', { top: 0, bottom: 0, left: 0, right: 1 }));
  assert.throws(() => setIdenticalPatterns(createProject(3, 1, 'plain'), true));
  // Shared A and missing B are insufficient cache identity across Plain/linked modes.
  const plain = { ...createProject(3, 1, 'plain'), a: linked.a };
  assert.deepEqual(derivePairs(linked, plain, derivePairs(plain)), derivePairs(linked));
  const otherRelationship = { ...linked, identicalPatterns: false, b: [[0, 0, 0]] };
  assert.deepEqual(deriveCombined(otherRelationship, linked, deriveCombined(linked)), deriveCombined(otherRelationship));
});

test('linked edits, bottom-right resize and reset preserve one independent source', () => {
  const p = setIdenticalPatterns(createProject(3, 1), true);
  const changed = toggleCell(p, 'a', 0, 2);
  assert.deepEqual(changed.a, [[0, 0, 1]]);
  const grown = resizeProject(changed, 4, 2);
  assert.deepEqual(grown.a, [[0, 0, 0, 0], [0, 0, 0, 1]]);
  assert.equal(grown.identicalPatterns, true);
  assert.equal(Object.hasOwn(grown, 'b'), false);
  assert.deepEqual(validateProject(grown), grown);
  const reset = resetProject(grown);
  assert.equal(reset.identicalPatterns, true);
  assert.equal(isResetProject(reset), true);
  assert.equal(isResetProject(toggleCell(reset, 'a', 0, 0)), false);
  assert.equal(Object.hasOwn(reset, 'b'), false);
});

test('transition history cannot restore discarded B; unlink materializes current A inverse', () => {
  const p = createProject(3, 1), history = createHistory(p);
  history.push(toggleCell(p, 'b', 0, 1));
  history.undo();
  const linked = setIdenticalPatterns(p, true);
  history.clear(linked);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
  const edited = toggleArea(linked, 'a', { left: 1, right: 2, top: 0, bottom: 0 });
  history.push(edited);
  assert.deepEqual(history.undo(), linked);
  assert.deepEqual(history.redo(), edited);
  const independent = setIdenticalPatterns(edited, false);
  history.clear(independent);
  assert.equal(history.undo(), null);
  assert.deepEqual(independent.b, [[1, 0, 0]]);
  assert.deepEqual(toggleCell(independent, 'a', 0, 1).b, independent.b);
  assert.equal(setIdenticalPatterns(independent, false), independent);
});

test('strict current relationship sources round-trip every persistence path and protect invalid bytes', () => {
  const p = setIdenticalPatterns(createProject(3, 1), true);
  const map = new Map(), adapter = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  const persistence = createPersistence(() => adapter);
  persistence.load(); persistence.save(p);
  assert.deepEqual(createPersistence(() => adapter).load(), p);
  const library = createProjectLibrary(() => adapter);
  library.read(); library.save('Linked', p);
  assert.deepEqual(library.read()[0].project, p);
  assert.deepEqual(parseProjectFile(serializeProjectFile(p, 'Linked')).project, p);
  for (const invalid of [{ ...p, b: null }, { ...p, b: p.a }, { ...p, identicalPatterns: undefined },
    { ...p, identicalPatterns: 'true' }, { ...p, identicalPatterns: false }, { ...p, schemaVersion: 4 },
    { ...createProject(3, 1, 'plain'), identicalPatterns: false }]) {
    assert.throws(() => validateProject(invalid));
    assert.throws(() => parseProjectFile(JSON.stringify(invalid)));
    assert.throws(() => library.save('Invalid', invalid));
    const bytes = JSON.stringify(invalid);
    map.set(STORAGE_KEY, bytes);
    const guarded = createPersistence(() => adapter);
    guarded.load(); guarded.save(p);
    assert.equal(guarded.state, 'protected');
    assert.equal(map.get(STORAGE_KEY), bytes);
  }
});
