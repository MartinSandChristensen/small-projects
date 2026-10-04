import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, deriveCombined, resizeProject, toggleArea, toggleCell } from '../src/model.js';
import { createHistory } from '../src/history.js';
import { includesCell, selectionBounds } from '../src/selection.js';

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('area inverts mixed colours exactly once, with reversed corners and immutable untouched rows', () => {
  const before = freeze(toggleCell(createProject(4, 3), 'b', 1, 1));
  const bounds = selectionBounds({ x: 2, y: 2 }, { x: 1, y: 1 });
  const next = toggleArea(before, 'b', bounds);
  assert.deepEqual(next.b, [[1, 1, 1, 1], [1, 1, 0, 1], [1, 0, 0, 1]]);
  assert.equal(next.a, before.a);
  assert.equal(next.b[0], before.b[0]);
  assert.equal(next.display, before.display);
  assert.deepEqual(toggleArea(next, 'b', bounds), before);
  assert.equal(includesCell(bounds, 2, 2), true);
  assert.equal(includesCell(bounds, 0, 2), false);
  assert.equal(includesCell(null, 0, 0), false);
  for (const invalid of [{ ...bounds, right: 4 }, { ...bounds, top: -1 },
    { ...bounds, left: 1.5 }, { ...bounds, bottom: 0 }]) assert.throws(() => toggleArea(before, 'a', invalid));
  assert.throws(() => toggleArea(before, 'c', bounds));
});

test('history restores full sources, resize, reset and display; branching and replacement discard redo', () => {
  const initial = freeze(createProject(2, 2));
  const history = createHistory(initial);
  const area = freeze(toggleArea(initial, 'a', { left: 0, right: 1, top: 0, bottom: 1 }));
  const display = freeze({ ...area, display: { ...area.display, guides: true } });
  const resized = freeze(resizeProject(display, 3, 1));
  const reset = freeze(createProject());
  for (const p of [area, display, resized, reset]) history.push(p);
  for (const p of [resized, display, area, initial]) {
    assert.equal(history.undo(), p);
    assert.deepEqual(deriveCombined(p), deriveCombined(structuredClone(p)));
  }
  assert.equal(history.undo(), null);
  assert.equal(history.redo(), area);
  history.push(area); // no-op preserves redo
  assert.equal(history.canRedo, true);
  history.push(toggleCell(area, 'b', 0, 0));
  assert.equal(history.canRedo, false);
  history.clear(initial);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
});

test('history bounds operation count and conservative storage size, keeping current work', () => {
  const initial = createProject(1, 1);
  const history = createHistory(initial, { limit: 2 });
  let p = initial;
  for (let i = 0; i < 3; i++) { p = toggleCell(p, 'a', 0, 0); history.push(p); }
  assert.ok(history.undo());
  assert.ok(history.undo());
  assert.equal(history.undo(), null);
  assert.ok(history.redo());
  assert.equal(history.redo(), p);
  const limited = createHistory(initial, { bytes: JSON.stringify(initial).length * 4 });
  const second = toggleCell(initial, 'a', 0, 0);
  limited.push(second);
  limited.push(toggleCell(second, 'a', 0, 0));
  assert.equal(limited.undo(), second);
  assert.equal(limited.undo(), null);
  limited.push(createProject(200, 200));
  assert.equal(limited.canUndo, false);
});
