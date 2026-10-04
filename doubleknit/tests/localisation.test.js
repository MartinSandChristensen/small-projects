import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dictionaries, message, translate, resolveLanguage, supportedLanguage, createLanguagePreference,
  LANGUAGE_KEY, parseDecimal, decimalInput, formatNumber, errorMessage } from '../src/i18n.js';
import { createProject, setWorkflow, setRowEdges, validateProject } from '../src/model.js';
import { createPersistence, STORAGE_KEY } from '../src/storage.js';
import { parseProjectFile, serializeProjectFile } from '../src/projects.js';
import { pairAppearance, pairPresentation } from '../src/notation.js';
import { PatternChart } from '../src/chart.js';
import { DisplayControls } from '../src/display-controls.js';

const placeholders = text => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort();
test('complete dictionaries have matching keys, plural forms and named arguments; every literal reference exists', () => {
  assert.deepEqual(Object.keys(dictionaries.da).sort(), Object.keys(dictionaries['en-GB']).sort());
  for (const [key, en] of Object.entries(dictionaries['en-GB'])) {
    const da = dictionaries.da[key];
    const forms = typeof en === 'object' ? Object.keys(en) : [null];
    if (typeof en === 'object') assert.deepEqual(Object.keys(da), forms, key);
    for (const form of forms) {
      const source = form ? en[form] : en, target = form ? da[form] : da;
      assert.ok(source && target, key);
      assert.deepEqual(placeholders(source), placeholders(target), key);
      assert.doesNotMatch(target, /<[^>]+>/, key);
      const args = Object.fromEntries(placeholders(source).map(name => [name, name === 'count' ? 1 : 'Æøå']));
      for (const locale of ['en-GB', 'da']) assert.ok(translate(message(key, args), locale));
    }
  }
  for (const file of readdirSync(new URL('../src/', import.meta.url)).filter(file => file.endsWith('.js'))) {
    const text = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
    for (const match of text.matchAll(/(?:message|translate|AppError|\bt)\('([\w.-]+)'(?=[,)])/g)) {
      assert.ok(dictionaries['en-GB'][match[1]], `${file}: ${match[1]}`);
    }
  }
});
test('fallback translates a complete English message and plural counts without translating user names', () => {
  const original = dictionaries.da['projects.savedName'];
  try {
    delete dictionaries.da['projects.savedName'];
    assert.equal(translate(message('projects.savedName', { name: 'Min “Ærø” {name}' }), 'da'),
      'Saved “Min “Ærø” {name}” in this browser.');
  } finally { dictionaries.da['projects.savedName'] = original; }
  assert.match(translate(message('area.toggled', { count: 1, face: 'A' }), 'da'), /1 maske på/);
  assert.match(translate(message('area.toggled', { count: 2, face: 'A' }), 'da'), /2 masker på/);
  assert.throws(() => translate('missing.key'), /Missing English/);
  assert.throws(() => translate('projects.savedName'), /Missing .* argument/);
});
test('browser language ordering, strict stored preferences, malformed and unavailable detection', () => {
  assert.equal(resolveLanguage('da', ['en-US']), 'da');
  assert.equal(resolveLanguage('unsupported', ['fr-FR', 'da-DK', 'en-GB']), 'da');
  assert.equal(resolveLanguage(null, ['en-US', 'da']), 'en-GB');
  assert.equal(resolveLanguage(null, [], 'DA-dk'), 'da');
  assert.equal(resolveLanguage('da-DK', ['en-US']), 'en-GB');
  for (const tag of ['', ' da ', 'da--DK', 'da_DK', null, 4]) assert.equal(supportedLanguage(tag), null);
  for (const languages of [undefined, [], ['fr-FR'], ['???', null]]) assert.equal(resolveLanguage(null, languages), 'en-GB');
});
test('language storage is independent, detection does not write, and denied reads/writes leave language usable', () => {
  const items = new Map([[STORAGE_KEY, 'protected bytes']]);
  const storage = { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
  const preference = createLanguagePreference(() => storage, { languages: ['da-DK'] });
  assert.equal(preference.locale, 'da'); assert.equal(items.size, 1);
  preference.choose('en-GB');
  assert.equal(items.get(LANGUAGE_KEY), 'en-GB');
  assert.equal(items.get(STORAGE_KEY), 'protected bytes');
  assert.equal(createLanguagePreference(() => storage, { languages: ['da'] }).locale, 'en-GB');
  const denied = createLanguagePreference(() => { throw new Error('private detail'); }, { language: 'da' });
  denied.choose('en-GB'); assert.equal(denied.locale, 'en-GB');
  assert.match(translate(denied.warning, 'da'), /browserens sprogvalg/);
  assert.doesNotMatch(translate(denied.warning), /private detail/);
});
test('decimal parsing is strict and locale-specific; every positive finite source round-trips without grouping or rounding', () => {
  for (const locale of ['en-GB', 'da']) {
    for (const number of [0.5, 20.25, 1234.56789, 1.2345678901234567, Number.MIN_VALUE, Number.MAX_VALUE]) {
      assert.equal(parseDecimal(decimalInput(number, locale), locale), number);
    }
    for (const text of ['', ' ', '1e3', '0x10', '1 000', '1,234.5', '1.234,5', 'NaN', 'Infinity', '0', '-1', '1.2.3']) {
      assert.equal(parseDecimal(text, locale), null, text);
    }
  }
  assert.equal(parseDecimal('20,5', 'da'), 20.5);
  assert.equal(parseDecimal('20.5', 'da'), null);
  assert.equal(parseDecimal('20,5', 'en-GB'), null);
  assert.equal(formatNumber(1234.5, 'da'), '1.234,5');
  const draft = { display: { stitches: 20.5, rows: 30.5 }, stitches: '20.5', rows: 'unfinished' };
  DisplayControls.watch.locale.call(draft, 'da', 'en-GB');
  assert.deepEqual([draft.stitches, draft.rows], ['20,5', 'unfinished']);
});
test('stored validation and storage messages translate after failure while protected bytes survive', () => {
  const plain = createProject(2, 2, 'plain');
  assert.throws(() => validateProject({ ...plain, b: plain.a }), /must not store face B/);
  assert.throws(() => validateProject({ ...plain, identicalPatterns: false }), /must not store identicalPatterns/);
  const project = setWorkflow(createProject(2, 2), 'in-the-round');
  let error;
  try { setRowEdges(project, { top: -1, bottom: 1, left: 0, right: 0 }); } catch (cause) { error = errorMessage(cause); }
  assert.match(translate(error), /round range/);
  assert.match(translate(error, 'da'), /omgang/);
  const storage = { getItem: () => '{broken', setItem: () => assert.fail('must not write') };
  const persistence = createPersistence(() => storage); persistence.load();
  assert.match(translate(persistence.warningMessage, 'da'), /oprindelige gemte data bevares/);
  assert.equal(persistence.save(project), false);
  assert.deepEqual(parseProjectFile(serializeProjectFile(project, 'Ærø')).project, project);
  assert.equal(parseProjectFile(JSON.stringify(project), 'Unavngivet').name, 'Unavngivet');
  assert.equal('language' in validateProject({ ...project, language: 'da' }), false);
});
test('cached pair and face descriptions refresh by locale without changing chart data or semantics', () => {
  const pair = { a: 0, b: 1 };
  for (const notation of ['triangle', 'plus']) for (const direction of ['right-to-left', 'left-to-right']) {
    const english = pairAppearance(pair, notation, direction, 'en-GB');
    const danish = pairAppearance(pair, notation, direction, 'da');
    assert.notEqual(english.description, danish.description);
    assert.deepEqual(english.classes, danish.classes); assert.deepEqual(english.style, danish.style);
    assert.equal(pairAppearance(pair, notation, direction, 'en-GB'), english);
  }
  assert.equal(pairPresentation({ present: false }, 'plus', 'right-to-left', 'da').description, 'fraværende maskepar');
  const face = { isSource: true, editable: true, cells: [[0, 1]], faceSpans: [[0, 1]], spans: [[0, 1]], face: 'A', workflow: 'flat', locale: 'en-GB' };
  const english = PatternChart.computed.editableLabels.call(face);
  face.locale = 'da'; const danish = PatternChart.computed.editableLabels.call(face);
  assert.match(english[0][0], /base colour/); assert.match(danish[0][0], /bundfarve/);
  assert.match(danish[0][1], /fraværende maske/);
  face.locale = 'en-GB'; assert.deepEqual(PatternChart.computed.editableLabels.call(face), english);
  const combined = { isSource: false, editable: false, cells: [[pair]], display: { notation: 'triangle' }, workflow: 'flat', locale: 'en-GB' };
  const enRow = PatternChart.computed.renderedRows.call(combined);
  combined.locale = 'da'; const daRow = PatternChart.computed.renderedRows.call(combined);
  assert.match(enRow[0][0].label, /Knitting row/); assert.match(daRow[0][0].label, /Strikkepind/);
  assert.deepEqual(combined.cells, [[pair]]);
});

test('only literal working-legend explanations name display pigments', () => {
  for (const dictionary of Object.values(dictionaries)) {
    const literalKeys = ['legend.white', 'legend.black', 'legend.rolesFlat', 'legend.rolesRound'];
    const roles = Object.entries(dictionary).filter(([key]) => !literalKeys.includes(key)).map(([, value]) => value);
    assert.doesNotMatch(JSON.stringify(roles), /\b(white|black|hvid|hvidt|hvide|sort|sorte)\b/i);
  }
});
