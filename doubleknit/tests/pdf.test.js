import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, isPresent } from '../src/model.js';
import { cellGeometry } from '../src/display.js';
import { defaultPaper, planPdf, pdfFilename, occupies } from '../src/pdf-layout.js';
import { renderPdf } from '../src/pdf.js';

function coverage(project, plan) {
  for (let y = 0; y < project.height; y++) for (let x = 0; x < project.width; x++) {
    if (!isPresent(project, 'a', y, x)) continue;
    assert.equal(plan.tiles.filter(({ core: b }) => x >= b.left && x < b.right && y >= b.top && y < b.bottom).length,
      1, `unique ownership of ${x},${y}`);
    assert.ok(plan.tiles.some(b => x >= b.left && x < b.right && y >= b.top && y < b.bottom));
  }
  for (const tile of plan.tiles) {
    assert.ok(occupies(project, tile.core));
    assert.ok((tile.right - tile.left) * plan.cellWidth <= plan.availableWidth + 1e-7);
    assert.ok((tile.bottom - tile.top) * plan.cellHeight <= plan.availableHeight + 1e-7);
    for (const value of [tile.left, tile.right, tile.top, tile.bottom]) assert.ok(Number.isInteger(value));
  }
}
test('paper uses explicit original browser regions, never inferred American English or UI language', () => {
  for (const tag of ['en-US', 'fr-CA', 'es-MX', 'en-PH']) assert.equal(defaultPaper({ languages: [tag] }), 'letter');
  for (const tag of ['en', 'da', 'en-GB', 'da-DK', 'bad_tag']) assert.equal(defaultPaper({ languages: [tag] }), 'a4');
  assert.equal(defaultPaper({ languages: ['fr', 'en-US'] }), 'letter');
  assert.equal(defaultPaper({ languages: ['da-DK', 'en-US'] }), 'a4');
  assert.equal(defaultPaper({ language: 'en-US' }), 'letter');
  assert.equal(defaultPaper({ get languages() { throw Error(); } }), 'a4');
  assert.equal(defaultPaper(), 'a4');
});
test('fit preserves requested size before reducing, respects explicit orientation and both minimum dimensions', () => {
  const small = planPdf(createProject());
  assert.equal(small.orientation, 'portrait'); assert.equal(small.cellWidth, 4); assert.equal(small.pageCount, 1);
  const wide = createProject(60, 10);
  const landscape = planPdf(wide);
  assert.equal(landscape.orientation, 'landscape'); assert.equal(landscape.cellWidth, 4);
  const explicit = planPdf(wide, { orientation: 'portrait' });
  assert.equal(explicit.orientation, 'portrait'); assert.equal(explicit.tiled, true);
  const reduced = planPdf(createProject(50, 20), { orientation: 'portrait' });
  assert.equal(reduced.tiled, false); assert.equal(reduced.cellWidth, 3.4);
  const gauge = createProject(50, 50); gauge.display.rows = 40;
  assert.throws(() => planPdf(gauge, { proportional: true, width: 3 }), /at least 4/);
  const proportional = planPdf(gauge, { proportional: true });
  assert.ok(proportional.cellWidth >= 4); assert.ok(proportional.cellHeight >= 2);
  assert.throws(() => planPdf(gauge, { overlap: 2.5 }));
  assert.throws(() => planPdf(gauge, { width: NaN }));
});
test('tiling covers all stitches exactly once in cores and repeats exactly the chosen overlap', () => {
  const project = createProject(200, 200);
  for (const overlap of [0, 1, 2, 5]) for (const paper of ['a4', 'a3', 'letter', 'tabloid']) for (const orientation of ['portrait', 'landscape']) {
    const plan = planPdf(project, { overlap, paper, orientation });
    coverage(project, plan);
    assert.equal(plan.tiles[0].core.right, 200); assert.equal(plan.tiles[0].core.bottom, 200);
    assert.equal(plan.pageCount, plan.tiles.length + 1);
    for (const tile of plan.tiles) {
      assert.equal(tile.core.left - tile.left, Math.min(overlap, tile.core.left - plan.bounds.left));
      assert.equal(tile.core.top - tile.top, Math.min(overlap, tile.core.top - plan.bounds.top));
      assert.equal(tile.right - tile.core.right, tile.column ? overlap : 0);
      assert.equal(tile.bottom - tile.core.bottom, tile.band ? overlap : 0);
    }
  }
});
test('shape tiling omits empty and overlap-only tiles, retains white stitches and trims padding without renumbering', () => {
  const rectangle = createProject(200, 200, 'plain');
  const rectPlan = planPdf(rectangle, { orientation: 'portrait' });
  assert.equal(rectPlan.tiles.length, rectPlan.gridColumns * rectPlan.gridRows);
  const triangle = { ...rectangle, maskA: rectangle.maskA.map((_, y) => [0, y + 1]) };
  const plan = planPdf(triangle, { orientation: 'portrait' });
  coverage(triangle, plan); assert.ok(plan.tiles.length < plan.gridColumns * plan.gridRows);
  const padded = { ...rectangle, maskA: rectangle.maskA.map((_, y) => y < 10 || y >= 190 ? null : [20, 180]) };
  const trimmed = planPdf(padded);
  assert.deepEqual(trimmed.bounds, { left: 20, right: 180, top: 10, bottom: 190 }); coverage(padded, trimmed);
  // A neighbouring band's overlap contains stitches, but its own main region is empty.
  const thin = { ...rectangle, maskA: rectangle.maskA.map((_, y) => y > 140 ? [150, 200] : [0, 2]) };
  coverage(thin, planPdf(thin));
});
test('saved proportions consistently change all chart geometry', () => {
  const project = createProject(); project.display.rows = 30; project.display.proportional = true;
  const before = JSON.stringify(project);
  assert.equal(cellGeometry(project.display, 'C', true).width, 36);
  assert.equal(cellGeometry(project.display, 'C', false).width, 36);
  assert.equal(cellGeometry(project.display, 'A', true).width, 36);
  assert.equal(planPdf(project, { proportional: true }).cellHeight, 4 / 1.5);
  assert.equal(JSON.stringify(project), before);
  assert.equal(pdfFilename('Ærø mønster'), 'Ærø mønster.pdf');
  assert.equal(pdfFilename('a/b:c'), 'a_b_c.pdf');
});

function recordingDoc() {
  const calls = [];
  const doc = new Proxy({ calls, splitTextToSize: value => [value] }, {
    get(target, key) { return target[key] ?? ((...args) => { calls.push([key, ...args]); }); },
  });
  return doc;
}
test('PDF rendering uses source semantics for Plain, linked pairs, both workflows, notations and Danish', () => {
  for (const mode of ['plain', 'double-faced']) for (const workflow of ['flat', 'in-the-round'])
    for (const notation of ['triangle', 'plus']) {
      const project = createProject(2, 2, mode, mode === 'double-faced');
      project.workflow = workflow; project.display.notation = notation; project.display.guides = true;
      project.a = [[0, 1], [1, 0]];
      const before = JSON.stringify(project), doc = recordingDoc(), plan = planPdf(project, {}, 'da');
      renderPdf(doc, { project, name: 'Ærø', locale: 'da', plan });
      const texts = doc.calls.filter(c => c[0] === 'text').map(c => c[1]).join('\n');
      assert.match(texts, /Arbejdsdiagram ·/);
      assert.match(texts, workflow === 'flat' ? /pinde/i : /omgange/i);
      assert.match(texts, /Ærø/);
      assert.equal(JSON.stringify(project), before);
      if (mode === 'plain') assert.equal(doc.calls.filter(c => c[0] === 'triangle').length, 0);
      if (mode === 'double-faced' && notation === 'triangle') assert.ok(doc.calls.some(c => c[0] === 'triangle'));
    }
});

test('tiled guide positions stay global and tile cuts do not become shape boundaries', () => {
  const project = createProject(200, 200); project.display.guides = true;
  const plan = planPdf(project, { orientation: 'portrait' });
  const doc = recordingDoc();
  renderPdf(doc, { project, name: 'Guides', locale: 'en-GB', plan });
  const pages = doc.calls.reduce((list, call) => {
    if (call[0] === 'addPage') list.push([]);
    list.at(-1).push(call); return list;
  }, [[]]);
  const strokes = pages[1].flatMap((call, i, calls) => call[0] === 'line'
    ? [{ width: calls[i - 1][1], x1: call[1], y1: call[2], x2: call[3], y2: call[4] }] : []);
  const tile = plan.tiles[0], w = plan.cellWidth;
  const guideXs = strokes.filter(s => s.width === 0.65 && s.x1 === s.x2).map(s => s.x1);
  assert.deepEqual(guideXs, Array.from({ length: 21 }, (_, n) => n * 10)
    .filter(x => x >= tile.left && x <= tile.right).map(x => 20 + (x - tile.left) * w));
  assert.ok(!strokes.some(s => s.width === 0.8 && s.x1 === 20 && s.x2 === 20));
  assert.ok(strokes.some(s => s.width === 0.8 && s.x1 === 20 + (200 - tile.left) * w && s.x1 === s.x2));
});

test('export controls derive proportions from the saved project and preview occupied cells', async () => {
  const { PdfControls } = await import('../src/pdf-controls.js');
  const project = createProject(3, 2);
  project.display.proportional = true; project.display.rows = 30;
  project.maskA = [[1, 3], [0, 3]];
  const context = { project, proportional: false, locale: 'en-GB', paper: 'a4', orientation: 'auto', width: '4', overlap: '2' };
  context.options = PdfControls.computed.options.call(context);
  assert.equal(context.options.proportional, true);
  context.proposal = PdfControls.computed.proposal.call(context);
  assert.equal(context.proposal.plan.cellHeight, 4 / 1.5);
  const cells = PdfControls.computed.previewCells.call(context);
  assert.equal(cells.length, 5);
  assert.ok(cells.every(cell => Number.isFinite(cell.x) && Number.isFinite(cell.y)));
});

test('large paper formats use exact dimensions in both orientations', () => {
  for (const [paper, size] of [['a3', [297, 420]], ['tabloid', [279.4, 431.8]]]) {
    for (const orientation of ['portrait', 'landscape']) {
      const plan = planPdf(createProject(), { paper, orientation });
      assert.deepEqual(plan.paper, orientation === 'portrait' ? size : [...size].reverse());
      assert.equal(plan.pageCount, 1);
    }
  }
});

test('reciprocal overlap shares neighbour cores in both axes, including corners', () => {
  const plan = planPdf(createProject(120, 120), { overlap: 3, orientation: 'portrait' });
  const first = plan.tiles[0], left = plan.tiles.find(t => t.column === 1 && t.band === 0);
  const above = plan.tiles.find(t => t.column === 0 && t.band === 1);
  assert.equal(first.core.left, left.core.right);
  assert.equal(first.left, left.core.right - 3); assert.equal(left.right, first.core.left + 3);
  assert.equal(first.top, above.core.bottom - 3); assert.equal(above.bottom, first.core.top + 3);
  const corner = plan.tiles.find(t => t.column === 1 && t.band === 1);
  assert.equal(corner.right - corner.core.right, 3); assert.equal(corner.bottom - corner.core.bottom, 3);
});

test('single-page fitting ignores a stale invalid overlap; tiling still validates it', async () => {
  const { PdfControls } = await import('../src/pdf-controls.js');
  const context = { project: createProject(), options: { overlap: NaN } };
  assert.equal(PdfControls.computed.needsTiling.call(context), false);
  assert.equal(PdfControls.computed.proposal.call(context).plan.pageCount, 1);
  context.project = createProject(200, 200);
  assert.equal(PdfControls.computed.needsTiling.call(context), true);
  assert.ok(PdfControls.computed.proposal.call(context).error);
});

test('assembly map has muted pattern cells and guides; printed overlap is muted and cores retain black', () => {
  const project = createProject(60, 60, 'plain'); project.a = project.a.map(row => row.map(() => 1));
  project.display.guides = true;
  const doc = recordingDoc(), plan = planPdf(project, { orientation: 'portrait' });
  renderPdf(doc, { project, name: 'Overlap', locale: 'en-GB', plan });
  const pageBreak = doc.calls.findIndex(call => call[0] === 'addPage');
  const assemblyStart = doc.calls.findIndex(call => call[0] === 'text' && call[1] === 'Assembly map');
  const mapCalls = doc.calls.slice(assemblyStart, pageBreak), chartCalls = doc.calls.slice(pageBreak);
  assert.ok(mapCalls.some(call => call[0] === 'setFillColor' && call[1] === 185));
  assert.ok(mapCalls.some(call => call[0] === 'setDrawColor' && call[1] === 155));
  assert.ok(!mapCalls.some(call => call[0] === 'setLineWidth' && call[1] === 0.08));
  assert.ok(chartCalls.some(call => call[0] === 'setFillColor' && call[1] === 185));
  assert.ok(chartCalls.some(call => call[0] === 'setFillColor' && call[1] === 0));
});


test('a separate legend with only one chart sheet does not include assembly maps or positions', () => {
  for (const [mode, height] of [['plain', 70], ['double-faced', 60]]) {
    const project = createProject(40, height, mode);
    const plan = planPdf(project, { width: 3, orientation: 'portrait' });
    assert.equal(plan.pageCount, 2);
    assert.equal(plan.tiles.length, 1);
    const doc = recordingDoc();
    renderPdf(doc, { project, name: 'Single chart sheet', locale: 'en-GB', plan });
    const texts = doc.calls.filter(call => call[0] === 'text').map(call => call[1]).join('\n');
    assert.doesNotMatch(texts, /assembly|position/i);
    assert.match(texts, /2 of 2/);
    assert.equal(doc.calls.filter(call => call[0] === 'addPage').length, 1);
    assert.ok(!doc.calls.some(call => call[0] === 'rect' && call[5] === 'FD'));
  }
});


test('landscape 20 by 20 retains 4 mm cells and a complete measured legend in both languages', async () => {
  const { textWidth } = await import('../src/pdf-legend.js');
  for (const locale of ['en-GB', 'da']) for (const notation of ['plus', 'triangle'])
    for (const workflow of ['flat', 'in-the-round']) for (const mode of ['plain', 'double-faced']) {
      const project = createProject(20, 20, mode);
      project.display.notation = notation; project.workflow = workflow;
      const plan = planPdf(project, { orientation: 'landscape' }, locale);
      assert.equal(plan.pageCount, 1); assert.equal(plan.cellWidth, 4);
      const box = plan.legendBox;
      assert.ok(box.x + box.width <= plan.paper[0] - 10);
      assert.ok(box.y + box.height <= plan.paper[1] - 32);
      assert.ok(box.x >= 20 + 80 + 20 || box.y >= 34 + 80 + 10);
      for (const item of box.items.filter(item => item.kind === 'text')) {
        assert.ok(item.x + textWidth(item.value, item.size) <= box.width);
        assert.ok(item.y < box.height);
      }
      const doc = recordingDoc(); renderPdf(doc, { project, name: 'Ærø', locale, plan });
      assert.ok(doc.calls.some(call => call[0] === 'text' && call[1] === (locale === 'da' ? 'Tegnforklaring' : 'Legend')));
    }
});

test('PDF legends print only active gauge, without cell size or chart-range summaries', () => {
  for (const locale of ['en-GB', 'da']) for (const workflow of ['flat', 'in-the-round'])
    for (const proportional of [false, true]) for (const size of [5, 80]) {
      const project = createProject(size, size);
      project.workflow = workflow;
      Object.assign(project.display, { proportional, stitches: 22.5, rows: 30 });
      const plan = planPdf(project, { proportional }, locale), doc = recordingDoc();
      renderPdf(doc, { project, name: 'Test', locale, plan });
      const texts = doc.calls.filter(c => c[0] === 'text').map(c => c[1]).join(' ');
      assert.equal(/Gauge:|Strikkefasthed:/.test(texts), proportional);
      if (proportional) {
        assert.match(texts, locale === 'da' ? /22,5 masker × 30 (pinde|omgange) pr. 10 cm/ : /22.5 stitches × 30 (rows|rounds) per 10 cm/);
      }
      assert.doesNotMatch(texts, /\bmm\b| · (columns|kolonner) /);
    }
});

test('millimetre labels use one decimal and minimum-width advice remains usable', async () => {
  const { formatMillimetres } = await import('../src/i18n.js');
  assert.equal(formatMillimetres(4), '4.0');
  assert.equal(formatMillimetres(3.456), '3.5');
  assert.equal(formatMillimetres(3.456, 'da'), '3,5');
  const project = createProject(); project.display.rows = 33.3;
  assert.throws(() => planPdf(project, { proportional: true, width: 3 }), /at least 3.4 mm/);
  assert.doesNotThrow(() => planPdf(project, { proportional: true, width: 3.4 }));
});

test('PDF row labels follow the linked Plus exception without changing Triangle directions', () => {
  for (const linked of [false, true]) for (const notation of ['plus', 'triangle']) {
    const project = createProject(3, 2, 'double-faced', linked);
    project.display.notation = notation;
    const doc = recordingDoc();
    renderPdf(doc, { project, name: 'Directions', locale: 'en-GB', plan: planPdf(project, {}) });
    const rowLabels = doc.calls.filter(call => call[0] === 'text' && ['1', '2'].includes(call[1]) && ['left', 'right'].includes(call[4]?.align));
    assert.equal(rowLabels.length, 2);
    assert.equal(rowLabels.find(call => call[1] === '1')[4].align, 'left');
    assert.equal(rowLabels.find(call => call[1] === '2')[4].align, linked && notation === 'plus' ? 'left' : 'right');
  }
});
