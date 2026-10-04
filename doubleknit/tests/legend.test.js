import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, setRowEdges } from '../src/model.js';
import { workingLegend } from '../src/legend.js';
import { pairPresentation } from '../src/notation.js';
import { layoutLegend } from '../src/pdf-legend.js';

test('Plus symbols retain their original appearance on both row directions', () => {
  const symbols = [
    { a: 0, b: 1, background: 0, plus: false },
    { a: 1, b: 1, background: 1, plus: false },
    { a: 0, b: 0, background: 0, plus: true },
    { a: 1, b: 0, background: 1, plus: true },
  ];
  for (const { a, b, background, plus } of symbols) {
    for (const direction of ['right-to-left', 'left-to-right']) {
      const symbol = pairPresentation({ a, b }, 'plus', direction);
      assert.equal(symbol.background, background);
      assert.equal(symbol.plus, plus);
    }
  }
});

test('shared screen and PDF legend covers workflows, modes, notation, gauge and absence', () => {
  for (const locale of ['en-GB', 'da']) for (const mode of ['plain', 'double-faced'])
    for (const notation of ['plus', 'triangle']) for (const workflow of ['flat', 'in-the-round'])
      for (const proportional of [true, false]) {
        const project = createProject(5, 5, mode);
        project.workflow = workflow;
        Object.assign(project.display, { notation, proportional });
        const model = workingLegend(project, locale);
        const layout = layoutLegend(project, locale, 190);
        const text = layout.items.filter(item => item.kind === 'text').map(item => item.value).join(' ');
        for (const paragraph of [...model.paragraphs, ...model.notes]) assert.ok(text.includes(paragraph));
        assert.doesNotMatch(text, /\b[ABC]\b/);
        assert.equal(/Gauge:|Strikkefasthed:/.test(text), proportional);
        assert.equal(model.entries.length, mode === 'plain' ? 2 : 4);
        assert.deepEqual(layout.items.filter(item => item.kind === 'pair').map(({ pair, notation, direction }) =>
          ({ pair, notation, direction })), model.entries.flatMap(entry => entry.samples));
        for (const entry of model.entries) {
          for (const sample of entry.samples) assert.deepEqual(sample.pair, entry.samples[0].pair);
          if (mode === 'plain') assert.ok(entry.samples.every(sample => !pairPresentation(sample.pair, sample.notation, sample.direction).plus));
        }
        assert.equal(workingLegend(setRowEdges(project, { top: 0, bottom: 0, left: 1 }), locale).notes.length, model.notes.length + 1);
      }
});

test('flat independent Plus instructions exchange same-yarn roles on the Reverse-facing row', () => {
  const project = createProject(3, 2);
  const legend = workingLegend(project);
  assert.deepEqual(legend.headings, ['Front facing you', 'Reverse facing you']);
  assert.deepEqual(legend.entries.map(entry => [entry.label, entry.reverseLabel]), [
    ['Base, Pattern', 'Base, Pattern'], ['Pattern, Pattern', 'Base, Base'],
    ['Base, Base', 'Pattern, Pattern'], ['Pattern, Base', 'Pattern, Base'],
  ]);
  const printed = layoutLegend(project, 'en-GB', 190).items.filter(item => item.kind === 'text').map(item => item.value);
  for (const heading of legend.headings) assert.ok(printed.includes(heading));
  for (const entry of legend.entries) assert.ok(printed.includes(entry.reverseLabel));
});

test('Triangle legends give literal yarn order on both faces, including linked designs', () => {
  for (const linked of [false, true]) {
    const project = createProject(3, 2, 'double-faced', linked);
    project.display.notation = 'triangle';
    const legend = workingLegend(project);
    assert.deepEqual(legend.entries.map(entry => [entry.label, entry.reverseLabel]), [
      ['White, Black', 'Black, White'], ['Black, Black', 'Black, Black'],
      ['White, White', 'White, White'], ['Black, White', 'White, Black'],
    ]);
    project.workflow = 'in-the-round';
    assert.deepEqual(workingLegend(project).headings, []);
  }
});
