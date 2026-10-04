import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, derivePairs, deriveCombined, toggleCell, resizeProject } from '../src/model.js';
import { faceColour, faceRole, pairPresentation, pairAppearance } from '../src/notation.js';
import { validateDisplay } from '../src/display.js';
import { serializeProjectFile, parseProjectFile, createProjectLibrary } from '../src/projects.js';
import { createHistory } from '../src/history.js';

test('all four combinations preserve actual colours, working order, triangle corners and plus contrast', () => {
  for (const a of [0, 1]) for (const b of [0, 1]) {
    for (const direction of ['right-to-left', 'left-to-right']) {
      const rtl = direction === 'right-to-left';
      const triangle = pairPresentation({ a, b }, 'triangle', direction);
      assert.deepEqual(triangle.upper, { colour: rtl ? a : b, corner: rtl ? 'upper-right' : 'upper-left' });
      assert.deepEqual(triangle.lower, { colour: rtl ? b : a, corner: rtl ? 'lower-left' : 'lower-right' });
      assert.match(triangle.description, rtl ? /^A .* first, then B/ : /^B .* first, then A/);
      const appearance = pairAppearance({ a, b }, 'triangle', direction);
      assert.equal(appearance.classes['pair-split'], a !== b);
      if (a !== b) assert.match(appearance.style.backgroundImage, rtl ? /225deg/ : /135deg/);
      else assert.equal(appearance.style, null);
      const plus = pairPresentation({ a, b }, 'plus', direction);
      assert.equal(plus.background, a);
      assert.equal(plus.plus, b === 0);
      assert.match(plus.description, b === 1 ? /no plus for B base colour$/ : /plus for B pattern colour$/);
    }
    for (const notation of ['triangle', 'plus']) {
      assert.equal(faceColour('A', a, notation), a);
      assert.equal(faceColour('B', b, notation), b);
      assert.equal(faceRole('A', a), a ? 'pattern' : 'base');
      assert.equal(faceRole('B', b), b ? 'base' : 'pattern');
    }
  }
});

test('compact pairs mirror asymmetric B once and reuse only unchanged rows across edits and resizes', () => {
  const project = { ...createProject(3, 2), a: [[0, 1, 0], [1, 0, 0]], b: [[0, 0, 1], [1, 0, 1]] };
  const pairs = derivePairs(project);
  assert.deepEqual(pairs[0], [{ a: 0, b: 1 }, { a: 1, b: 0 }, { a: 0, b: 0 }]);
  assert.deepEqual(pairs.map(row => row.flatMap(({ a, b }) => [b, a])), deriveCombined(project));
  const next = toggleCell(project, 'b', 0, 0);
  const changed = derivePairs(next, project, pairs);
  assert.equal(changed[1], pairs[1]);
  assert.notEqual(changed[0], pairs[0]);
  assert.deepEqual(changed[0][2], { a: 0, b: 1 });
  assert.equal(pairs[0][2].b, 0);
  const resized = resizeProject(next, 4, 3);
  assert.deepEqual(derivePairs(resized, next, changed), derivePairs(resized));
  assert.equal(derivePairs(createProject(200, 200)).flat().length, 40000);
});

test('notation is a validated display-only history operation preserved by files and snapshots', () => {
  const project = createProject(3, 2);
  const pairs = derivePairs(project), history = createHistory(project);
  const data = new Map();
  const library = createProjectLibrary(() => ({ getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value) }), () => 'one');
  library.read();
  const changed = { ...project, display: { ...project.display, notation: 'triangle' } };
  history.push(changed);
  library.save('Triangles', changed);
  assert.deepEqual(library.read()[0].project, changed);
  assert.deepEqual(parseProjectFile(serializeProjectFile(changed, 'Triangles')).project, changed);
  assert.equal(derivePairs(changed, project, pairs)[0], pairs[0]);
  assert.equal(changed.b, project.b);
  assert.deepEqual(deriveCombined(changed), deriveCombined(project));
  assert.equal(history.undo().display.notation, 'plus');
  assert.equal(history.redo().display.notation, 'triangle');
  for (const notation of [undefined, null, 'expanded', 'PLUS', 1]) {
    assert.throws(() => validateDisplay({ ...project.display, notation }));
  }
});

test('pair descriptions name each face’s role for every colour combination and reading direction', () => {
  for (const locale of ['en-GB', 'da']) for (const a of [0, 1]) for (const b of [0, 1]) {
    const base = locale === 'da' ? 'bundfarve' : 'base colour';
    const pattern = locale === 'da' ? 'mønsterfarve' : 'pattern colour';
    for (const notation of ['triangle', 'plus']) for (const direction of ['left-to-right', 'right-to-left']) {
      const { description } = pairPresentation({ a, b }, notation, direction, locale);
      assert.ok(description.includes(`A ${a ? pattern : base}`), description);
      assert.ok(description.includes(`B ${b ? base : pattern}`), description);
      assert.doesNotMatch(description, /\b(white|black|hvid|hvidt|sort)\b/i);
    }
  }
});
