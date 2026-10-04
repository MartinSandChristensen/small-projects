import { message, translate } from './i18n.js';
import { faceRelativePlus, workflowText } from './workflow.js';
import { isRectangle } from './model.js';

// Working order uses literal yarns for Triangle and the facing side's roles for Plus/Plain.
export function workingSequence(project, pair, reverseFacing = false, locale = 'en-GB') {
  const triangle = project.mode !== 'plain' && project.display.notation === 'triangle';
  let values = [pair.a, pair.b];
  if (reverseFacing && !faceRelativePlus(project)) {
    values = triangle ? [pair.b, pair.a] : [1 - pair.b, 1 - pair.a];
  }
  const colour = value => message(triangle ? value ? 'legend.black' : 'legend.white'
    : value ? 'legend.pattern' : 'legend.base');
  return translate(message('legend.sequence', { first: colour(values[0]), second: colour(values[1]) }), locale);
}

// Shared knitting instructions and samples; renderers only arrange this content.
export function workingLegend(project, locale = 'en-GB') {
  const t = (key, args) => translate(message(key, args), locale);
  const plain = project.mode === 'plain';
  const triangle = !plain && project.display.notation === 'triangle';
  const flat = project.workflow === 'flat';
  const relative = faceRelativePlus(project);
  const facing = flat && !plain && !relative;
  const headings = facing ? [t('legend.frontFacing'), t('legend.reverseFacing')] : [];
  const paragraphs = [];
  if (project.display.proportional) paragraphs.push(t('pdf.legendGauge', {
    stitches: project.display.stitches, rows: project.display.rows,
    units: workflowText(project.workflow, locale).units,
  }));
  paragraphs.push(t('legend.pairs'), t(flat ? relative ? 'legend.readLinked' : 'legend.readFlat' : 'legend.readRound'));
  if (triangle) paragraphs.push(t('legend.triangle'), t('legend.solid'));
  else paragraphs.push(t(flat ? 'legend.rolesFlat' : 'legend.rolesRound'));
  paragraphs.push(t('legend.workingOrder'));
  const pairs = plain ? [{ a: 0, b: 1 }, { a: 1, b: 0 }]
    : [{ a: 0, b: 1 }, { a: 1, b: 1 }, { a: 0, b: 0 }, { a: 1, b: 0 }];
  const entries = pairs.map(pair => ({
    label: workingSequence(project, pair, false, locale),
    reverseLabel: facing ? workingSequence(project, pair, true, locale) : null,
    samples: [{ pair, notation: plain ? 'plain' : triangle ? 'triangle' : 'plus', direction: 'right-to-left' },
      ...(triangle && flat ? [{ pair,
        notation: 'triangle', direction: 'left-to-right' }] : [])],
  }));
  const notes = [];
  if (triangle && flat) notes.push(t('legend.sampleDirections'));
  if (!isRectangle(project)) notes.push(t('legend.absent'));
  return { paragraphs, headings, entries, notes };
}
