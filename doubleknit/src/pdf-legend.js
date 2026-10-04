import { message, translate } from './i18n.js';
import { workingLegend } from './legend.js';
import { fontUnits, fontWidths } from './pdf-font-metrics.js';

// The renderer consumes these exact lines: measuring and drawing cannot wrap differently.
export function textWidth(value, size = 7.5) {
  return [...value].reduce((sum, c) => sum + (fontWidths[c.codePointAt(0)] ?? fontUnits), 0)
    / fontUnits * size * 25.4 / 72;
}
export function wrapLegend(value, width, size = 7.5) {
  const lines = [];
  let line = '';
  for (const word of value.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size) <= width - 0.5) { line = next; continue; }
    if (line) lines.push(line);
    line = '';
    for (const character of word) {
      if (line && textWidth(line + character, size) > width - 0.5) { lines.push(line); line = ''; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}
export function layoutLegend(project, locale, width) {
  const t = (key, args) => translate(message(key, args), locale);
  const items = [{ kind: 'text', value: t('pdf.legend'), x: 0, y: 4, size: 11 }];
  let y = 10;
  const paragraph = (value, x = 0, available = width, size = 7.5) => {
    const lines = wrapLegend(value, available, size);
    lines.forEach((value, index) => items.push({ kind: 'text', value, x, y: y + index * 3.4, size }));
    return lines.length * 3.4 + 1.5;
  };
  const legend = workingLegend(project, locale);
  for (const value of legend.paragraphs) y += paragraph(value);
  if (legend.headings.length) {
    const labelWidth = (width - 16) / 2;
    y += Math.max(...legend.headings.map((heading, index) => paragraph(heading, 14 + index * labelWidth, labelWidth - 2)));
    for (const entry of legend.entries) {
      entry.samples.forEach((sample, offset) => items.push({ kind: 'pair', ...sample, x: offset * 6, y: y - 3.5 }));
      y += Math.max(10, paragraph(entry.label, 14, labelWidth - 2, 8),
        paragraph(entry.reverseLabel, 14 + labelWidth, labelWidth - 2, 8));
    }
  }
  if (!legend.headings.length) {
    const columns = width >= 120 ? 2 : 1, columnWidth = width / columns;
    for (let index = 0; index < legend.entries.length; index += columns) {
      let height = 10;
      for (let column = 0; column < columns && index + column < legend.entries.length; column++) {
        const entry = legend.entries[index + column], x = column * columnWidth;
        entry.samples.forEach((sample, offset) => items.push({ kind: 'pair', ...sample,
          x: x + offset * 6, y: y - 3.5 }));
        height = Math.max(height, paragraph(entry.label, x + 14, columnWidth - 16, 8));
      }
      y += height;
    }
  }
  for (const value of legend.notes) y += paragraph(value);
  return { width, height: y, items };
}
