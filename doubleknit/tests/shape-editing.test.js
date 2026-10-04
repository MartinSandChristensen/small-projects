import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, setIdenticalPatterns } from '../src/model.js';
import { previewEdge } from '../src/shape-editing.js';

test('trim previews contiguous edge removal and restore retains original colour arrays', () => {
  const p = createProject(5, 3);
  p.a[1][0] = 1;
  const next = previewEdge(p, { x: 1, y: 1 });
  assert.deepEqual(next.maskA[1], [2, 5]);
  assert.deepEqual(p.maskA[1], [0, 5]);
  assert.equal(next.a, p.a);
  assert.equal(next.b, p.b);
  const restored = previewEdge(next, { x: 0, y: 1, mode: 'restore' });
  assert.deepEqual(restored.maskA[1], [0, 5]);
  assert.equal(restored.a[1][0], 1);
});
test('right edge and linked edge previews remove all affected stitches symmetrically', () => {
  const p = createProject(6, 3);
  assert.deepEqual(previewEdge(p, { x: 4, y: 1, edge: 'right' }).maskA[1], [0, 4]);
  const linked = setIdenticalPatterns(p, true);
  const next = previewEdge(linked, { x: 4, y: 1, edge: 'right' });
  assert.deepEqual(next.maskA[1], [2, 4]);
  assert.deepEqual(previewEdge(next, { x: 5, y: 1, mode: 'restore', edge: 'right' }).maskA[1], [0, 6]);
});
test('invalid empty interior rows and entire empty charts never produce previews', () => {
  assert.throws(() => previewEdge(createProject(5, 3), { x: 4, y: 1 }));
  assert.throws(() => previewEdge(createProject(5, 1), { x: 4, y: 0 }));
  const p = createProject(5, 3);
  const next = previewEdge(p, { x: 4, y: 0 });
  assert.equal(next.maskA[0], null);
  assert.deepEqual(previewEdge(next, { x: 2, y: 0, mode: 'restore' }).maskA[0], [2, 5]);
});
test('wrong-side restore and already absent trim are no-ops', () => {
  const p = previewEdge(createProject(6, 3), { x: 4, y: 1, edge: 'right' });
  assert.equal(previewEdge(p, { x: 5, y: 1 }), p);
  assert.equal(previewEdge(p, { x: 5, y: 1, mode: 'restore', edge: 'left' }), p);
});

import { PatternChart } from '../src/chart.js';
test('shape keyboard navigation can reach absent stitches for restoration', () => {
  let focused;
  const chart = {
    interactive: true, shaping: true, focused: { x: 2, y: 1 }, cells: [[0, 0, 0], [0, 0, 0]],
    present: () => false, focusCell: (x, y) => { focused = { x, y }; },
  };
  let prevented = false;
  PatternChart.methods.keydown.call(chart, {
    target: { matches: () => true }, key: 'ArrowLeft', shiftKey: false,
    preventDefault: () => { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.deepEqual(focused, { x: 1, y: 1 });
});
test('read-only source charts retain source rendering and mirror reverse spans', () => {
  const cells = [[0, 1, 0, 0]];
  assert.equal(PatternChart.computed.renderedRows.call({ isSource: true, editable: false, cells }), cells);
  assert.deepEqual(PatternChart.computed.faceSpans.call({ isSource: true, editable: false, cells, spans: [[0, 3]], face: 'B' }), [[1, 4]]);
  assert.equal(PatternChart.computed.workingGuides.call({ working: false, isSource: true }), true);
});

test('shape hover is transient; clicks accumulate both edges and rows into one commit', () => {
  const project = createProject(10, 4);
  project.a[1][0] = 1;
  let committed;
  const chart = { project, cells: project.a, shapeMode: 'trim', pendingShape: null, hoverShape: null,
    $emit: (event, value) => { if (event === 'change') committed = value; } };
  for (const [name, fn] of Object.entries(PatternChart.methods)) chart[name] = fn.bind(chart);
  chart.previewShape(1, 1, false);
  assert.deepEqual(chart.hoverShape.maskA[1], [2, 10]);
  assert.equal(chart.pendingShape, null);
  chart.previewShape(1, 1);
  chart.previewShape(8, 1);
  chart.previewShape(2, 2);
  assert.deepEqual(chart.pendingShape.maskA, [[0, 10], [2, 8], [3, 10], [0, 10]]);
  assert.deepEqual(project.maskA[1], [0, 10]);
  chart.previewShape(7, 1, false); chart.leaveChart();
  assert.deepEqual(chart.pendingShape.maskA[1], [2, 8]);
  chart.shapeMode = 'restore'; chart.previewShape(0, 1); chart.previewShape(9, 1);
  assert.deepEqual(chart.pendingShape.maskA[1], [0, 10]);
  chart.applyShape();
  assert.equal(chart.pendingShape, null); assert.equal(committed.a, project.a);
  assert.deepEqual(committed.maskA[2], [3, 10]);
  chart.previewShape(0, 0); chart.cancelShape(); assert.equal(chart.pendingShape, null);
});

test('Design directions match knitting workflow and mirror on the reverse', () => {
  for (const workflow of ['flat', 'in-the-round']) for (const face of ['A', 'B', 'C']) {
    const chart = { face, workflow, cells: [[], [], []] };
    const directions = chart.cells.map((_, y) => PatternChart.methods.direction.call(chart, y));
    assert.deepEqual(directions, workflow === 'flat'
      ? (face === 'B' ? ['left-to-right', 'right-to-left', 'left-to-right'] : ['right-to-left', 'left-to-right', 'right-to-left'])
      : Array(3).fill(face === 'B' ? 'left-to-right' : 'right-to-left'));
  }
});
