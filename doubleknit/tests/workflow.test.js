import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, setWorkflow, rowDirection, derivePairs, deriveCombined, resizeProject,
  resetProject, isResetProject, setRowEdges, setIdenticalPatterns, toggleCell, validateProject } from '../src/model.js';
import { pairPresentation, pairAppearance } from '../src/notation.js';
import { createHistory } from '../src/history.js';
import { createPersistence, STORAGE_KEY } from '../src/storage.js';
import { createProjectLibrary, serializeProjectFile, parseProjectFile } from '../src/projects.js';

const variants = [['plain', false], ['double-faced', false], ['double-faced', true]];
const storage = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
};

test('workflow changes preserve every source, shape and pair in every mode and survive resize and edits', () => {
  for (const [mode, linked] of variants) {
    const base = createProject(5, 3, mode, linked);
    const p = setRowEdges(toggleCell(base, 'a', 1, 2), { top: 0, bottom: 0, empty: true });
    const pairs = derivePairs(p), combined = deriveCombined(p);
    Object.freeze(p);
    const round = setWorkflow(p, 'in-the-round');
    assert.equal(setWorkflow(round, 'in-the-round'), round);
    for (const key of ['a', 'b', 'maskA', 'display']) assert.equal(round[key], p[key]);
    assert.deepEqual(deriveCombined(round), combined);
    assert.equal(derivePairs(round, p, pairs)[0], pairs[0]);
    assert.deepEqual(setWorkflow(round, 'flat'), p);
    assert.equal(resizeProject(round, 5, 4).workflow, 'in-the-round');
    assert.equal(toggleCell(round, 'a', 1, 1).workflow, 'in-the-round');
    assert.equal(setRowEdges(round, { top: 0, bottom: 0 }).workflow, 'in-the-round');
    if (mode === 'double-faced') assert.equal(setIdenticalPatterns(round, !linked).workflow, 'in-the-round');
  }
});

test('every round uses A first and the same Triangle corners; Plus graphics and absence remain unchanged', () => {
  for (let number = 1; number <= 4; number++) {
    assert.equal(rowDirection(number, 'flat'), number % 2 ? 'right-to-left' : 'left-to-right');
    const direction = rowDirection(number, 'in-the-round');
    assert.equal(direction, 'right-to-left');
    for (const a of [0, 1]) for (const b of [0, 1]) {
      const pair = { a, b }, triangle = pairPresentation(pair, 'triangle', direction);
      assert.deepEqual(triangle.upper, { colour: a, corner: 'upper-right' });
      assert.deepEqual(triangle.lower, { colour: b, corner: 'lower-left' });
      assert.match(triangle.description, /^A .* first, then B/);
      const plus = pairAppearance(pair, 'plus', direction), flat = pairAppearance(pair, 'plus', 'left-to-right');
      assert.deepEqual(plus.classes, flat.classes); assert.deepEqual(plus.style, flat.style);
      assert.match(plus.description, /^A .* first, then B/);
    }
    assert.equal(pairPresentation({ present: false }, 'triangle', direction).description, 'absent pair');
  }
});

test('workflow alone enables Reset and history restores complete workflows and reset state', () => {
  for (const [mode, linked] of variants) {
    const p = createProject(undefined, undefined, mode, linked), history = createHistory(p);
    assert.equal(p.workflow, 'flat'); assert.equal(isResetProject(p), true);
    const round = setWorkflow(p, 'in-the-round'); history.push(round);
    assert.equal(isResetProject(round), false);
    assert.equal(history.undo(), p); assert.equal(history.redo(), round);
    const reset = resetProject(round); history.push(reset);
    assert.deepEqual(reset, p); assert.equal(isResetProject(reset), true);
    assert.equal(history.undo(), round); assert.equal(history.redo(), reset);
  }
});

test('current work, files and independent snapshots round-trip workflow and notation in every mode', () => {
  for (const [mode, linked] of variants) for (const notation of ['triangle', 'plus']) {
    const p = setWorkflow(createProject(3, 3, mode, linked), 'in-the-round');
    p.display.notation = notation;
    const disk = storage(), persistence = createPersistence(() => disk);
    persistence.load(); assert.equal(persistence.save(p), true);
    assert.deepEqual(createPersistence(() => disk).load(), p);
    const library = createProjectLibrary(() => disk, () => 'round'); library.read(); library.save('Round', p);
    persistence.save(setWorkflow(p, 'flat'));
    assert.deepEqual(library.read()[0].project, p);
    assert.deepEqual(parseProjectFile(serializeProjectFile(p, 'Round')).project, p);
  }
});

test('all load paths reject missing or invalid workflow and v6 without overwriting protected data', () => {
  const p = createProject(2, 2);
  for (const invalid of [...[undefined, null, '', 'round', 'FLAT', 1, true].map(workflow => ({ ...p, workflow })),
    { ...p, schemaVersion: 6 }]) {
    assert.throws(() => validateProject(invalid));
    assert.throws(() => parseProjectFile(JSON.stringify(invalid)));
    const disk = storage(), raw = JSON.stringify(invalid); disk.setItem(STORAGE_KEY, raw);
    const persistence = createPersistence(() => disk); persistence.load();
    assert.equal(persistence.save(setWorkflow(p, 'in-the-round')), false);
    assert.equal(disk.getItem(STORAGE_KEY), raw); assert.equal(persistence.state, 'protected');
    const library = createProjectLibrary(() => disk, () => 'round'); library.read();
    assert.throws(() => library.save('Invalid', invalid));
    disk.setItem('doubleknit.namedProjects', JSON.stringify({ libraryVersion: 1,
      entries: [{ id: 'round', name: 'Invalid', project: invalid }] }));
    assert.throws(() => library.read());
  }
});

test('only linked Plus changes the flat working chart to right-to-left on every row', async () => {
  const { workingDirection } = await import('../src/workflow.js');
  for (const mode of ['plain', 'double-faced']) for (const linked of [false, true]) {
    if (mode === 'plain' && linked) continue;
    for (const notation of ['plus', 'triangle']) for (const workflow of ['flat', 'in-the-round']) {
      const project = createProject(3, 2, mode, linked);
      project.display.notation = notation; project.workflow = workflow;
      assert.equal(workingDirection(project, 1), 'right-to-left');
      assert.equal(workingDirection(project, 2), workflow === 'in-the-round' || linked && notation === 'plus'
        ? 'right-to-left' : 'left-to-right');
    }
  }
});

test('reading linked Plus right-to-left with exchanged yarn roles reproduces physical return rows', () => {
  // Exhaust all row motifs through width five, including asymmetric motifs and same-yarn pairs.
  for (let width = 1; width <= 5; width++) for (let bits = 0; bits < 2 ** width; bits++) {
    const project = createProject(width, 2, 'double-faced', true);
    project.a[0] = Array.from({ length: width }, (_, x) => (bits >> x) & 1);
    const row = derivePairs(project)[0];
    const physicalReturn = row.flatMap(({ a, b }) => [b, a]);
    const relativeReturn = [...row].reverse().flatMap(({ a, b }) => [1 - a, 1 - b]);
    assert.deepEqual(relativeReturn, physicalReturn);
  }
});
