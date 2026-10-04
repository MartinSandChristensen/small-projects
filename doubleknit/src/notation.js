import { message, translate } from './i18n.js';
import { workingLegend } from './legend.js';
// Renderer-independent pair semantics. Directions are inputs so future round
// knitting and PDF rendering share exactly the same placement and descriptions.
export const yarnName = (colour, locale = 'en-GB', face = 'A') => translate('role.' + faceRole(face, colour), locale);
export function faceColour(face, colour, notation) {
  return colour;
}
export function faceRole(face, colour) {
  return colour === (face === 'B' ? 1 : 0) ? 'base' : 'pattern';
}
export function pairPresentation({ a, b, present }, notation, direction, locale = 'en-GB') {
  if (present === false) return { present: false, background: null, plus: false, upper: null, lower: null,
    description: translate('pair.absent', locale) };
  const rtl = direction === 'right-to-left';
  const first = rtl ? 'A' : 'B', second = rtl ? 'B' : 'A';
  const colour = (face, value) => message('role.' + faceRole(face, value));
  const order = message('pair.order', { first, second,
    firstColour: colour(first, rtl ? a : b), secondColour: colour(second, rtl ? b : a) });
  if (notation === 'plain') return { background: a, plus: false, upper: null, lower: null,
    description: translate(order, locale) };
  if (notation === 'plus') {
    return { background: a, plus: b === 0, upper: null, lower: null,
      description: translate(message(b === 0 ? 'pair.plus' : 'pair.plain', {
        order, colour: colour('A', a),
      }), locale) };
  }
  const upper = { colour: rtl ? a : b, corner: rtl ? 'upper-right' : 'upper-left' };
  const lower = { colour: rtl ? b : a, corner: rtl ? 'lower-left' : 'lower-right' };
  return { background: a, plus: false, upper, lower,
    description: translate(a === b ? message('pair.solid', { order })
      : message('pair.split', { order, first, second, upperColour: colour(first, upper.colour), lowerColour: colour(second, lower.colour),
        upperCorner: message('corner.' + upper.corner), lowerCorner: message('corner.' + lower.corner) }), locale) };
}

// Cache the finite set of rectangular presentations, shared by cells and legend.
const presentations = new Map();
export function pairAppearance(pair, notation, direction, locale = 'en-GB') {
  const key = `${pair.present === false ? 'absent' : `${pair.a}${pair.b}`}:${notation}:${direction}:${locale}`;
  if (!presentations.has(key)) {
    const model = pairPresentation(pair, notation, direction, locale);
    presentations.set(key, { ...model, classes: {
      absent: pair.present === false, black: model.background === 1, 'pair-plus': model.plus,
      'pair-split': pair.present !== false && notation === 'triangle' && pair.a !== pair.b,
    }, style: pair.present !== false && notation === 'triangle' && pair.a !== pair.b ? {
      backgroundImage: `linear-gradient(${direction === 'right-to-left' ? '225deg' : '135deg'}, ${model.upper.colour ? '#171c19' : '#fff'} 50%, ${model.lower.colour ? '#171c19' : '#fff'} 50%)`,
    } : null });
  }
  return presentations.get(key);
}

export const CompactLegend = {
  props: ['project'],
  computed: { legend() { return workingLegend(this.project, this.locale); } },
  methods: { pairAppearance },
  template: `
    <div class="compact-legend">
      <p v-for="(paragraph, index) in legend.paragraphs" :key="index">{{ paragraph }}</p>
      <table v-if="legend.headings.length" class="legend-table">
        <thead><tr><th></th><th v-for="heading in legend.headings" scope="col">{{ heading }}</th></tr></thead>
        <tbody><tr v-for="(entry, index) in legend.entries" :key="index">
          <td><span class="legend-samples" aria-hidden="true">
            <span v-for="(sample, number) in entry.samples" :key="number" class="cell"
              :class="pairAppearance(sample.pair, sample.notation, sample.direction, locale).classes"
              :style="pairAppearance(sample.pair, sample.notation, sample.direction, locale).style"></span>
          </span></td><td>{{ entry.label }}</td><td>{{ entry.reverseLabel }}</td>
        </tr></tbody>
      </table>
      <div v-else class="legend-combinations">
        <div v-for="(entry, index) in legend.entries" :key="index" class="legend-pair">
          <span class="legend-samples" aria-hidden="true">
            <span v-for="(sample, number) in entry.samples" :key="number" class="cell"
              :class="pairAppearance(sample.pair, sample.notation, sample.direction, locale).classes"
              :style="pairAppearance(sample.pair, sample.notation, sample.direction, locale).style"></span>
          </span>
          <span>{{ entry.label }}</span>
        </div>
      </div>
      <p v-for="(paragraph, index) in legend.notes" :key="index">{{ paragraph }}</p>
    </div>`,
};
