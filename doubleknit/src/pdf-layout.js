import { layoutLegend } from './pdf-legend.js';
import { AppError, formatMillimetres } from './i18n.js';

export const PAPER_SIZES = Object.freeze({ a4: [210, 297], a3: [297, 420], letter: [215.9, 279.4], tabloid: [279.4, 431.8] });
export const DEFAULT_EXPORT = Object.freeze({ paper: 'a4', orientation: 'auto', width: 4, overlap: 2, proportional: false });
// All dimensions are millimetres. Gutters and furniture are reserved before fitting.
export const PDF_SPACE = Object.freeze({ margin: 10, gutter: 10, top: 24, bottom: 22 });

export function defaultPaper(browser = {}) {
  let tags;
  try { tags = browser.languages?.length ? browser.languages : [browser.language]; } catch { return 'a4'; }
  for (const tag of tags ?? []) {
    try {
      if (typeof tag !== 'string') continue;
      const region = new Intl.Locale(tag).region;
      if (region) return ['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'CR', 'GT', 'NI', 'PA', 'PR', 'SV', 'VE', 'BZ'].includes(region)
        ? 'letter' : 'a4';
    } catch { /* Ignore malformed browser tags; do not guess a region from a language. */ }
  }
  return 'a4';
}

export function printBounds(project) {
  let left = project.width, right = 0, top = project.height, bottom = 0;
  project.maskA.forEach((span, y) => {
    if (!span) return;
    left = Math.min(left, span[0]); right = Math.max(right, span[1]);
    top = Math.min(top, y); bottom = y + 1;
  });
  return { left, right, top, bottom };
}
export function occupies(project, box) {
  for (let y = box.top; y < box.bottom; y++) {
    const span = project.maskA[y];
    if (span && span[0] < box.right && span[1] > box.left) return true;
  }
  return false;
}
function axisTiles(start, end, capacity, overlap) {
  const result = [];
  let edge = end;
  while (edge > start) {
    const rightOverlap = Math.min(overlap, end - edge);
    const remainingCapacity = capacity - rightOverlap;
    const first = edge - start <= remainingCapacity ? start : edge - remainingCapacity + overlap;
    result.push({ start: first, end: edge, printStart: Math.max(start, first - overlap), printEnd: Math.min(end, edge + overlap) });
    edge = first;
  }
  return result;
}

export function planPdf(project, input = {}, locale = 'en-GB') {
  const settings = { ...DEFAULT_EXPORT, ...input };
  if (!PAPER_SIZES[settings.paper] || !['auto', 'portrait', 'landscape'].includes(settings.orientation)
      || typeof settings.proportional !== 'boolean'
      || !Number.isFinite(settings.width) || settings.width < 3
      || !Number.isInteger(settings.overlap) || settings.overlap < 0 || settings.overlap > 5) {
    throw new AppError('pdf.invalidSettings');
  }
  const ratio = settings.proportional ? Math.max(0.5, Math.min(2, project.display.rows / project.display.stitches)) : 1;
  const minimumWidth = Math.max(3, 2 * ratio);
  if (settings.width < minimumWidth) throw new AppError('pdf.minimum', { width: formatMillimetres(Math.ceil(minimumWidth * 10) / 10, locale) });
  const bounds = printBounds(project), columns = bounds.right - bounds.left, rows = bounds.bottom - bounds.top;

  const orientations = settings.orientation === 'auto' ? ['portrait', 'landscape'] : [settings.orientation];
  const candidates = orientations.map(orientation => {
    const paper = [...PAPER_SIZES[settings.paper]];
    if (orientation === 'landscape') paper.reverse();
    const availableWidth = paper[0] - 2 * (PDF_SPACE.margin + PDF_SPACE.gutter);
    const availableHeight = paper[1] - 2 * PDF_SPACE.margin - PDF_SPACE.top - PDF_SPACE.bottom;
    return { orientation, paper, availableWidth, availableHeight };
  });
  const layouts = candidates.flatMap(candidate => {
    const { paper, availableWidth, availableHeight } = candidate;
    const below = layoutLegend(project, locale, paper[0] - 20);
    const result = [{ ...candidate, placement: 'below', legend: below,
      fitWidth: Math.min(settings.width, availableWidth / columns,
        (availableHeight - below.height - 10) * ratio / rows) }];
    // Search sidebar widths in millimetres; retain a useful reading column and both row-label gutters.
    for (let width = Math.floor(Math.min(160, availableWidth - columns * minimumWidth - 10)); width >= 65; width--) {
      const legend = layoutLegend(project, locale, width);
      if (legend.height > availableHeight) continue;
      result.push({ ...candidate, placement: 'beside', legend,
        fitWidth: Math.min(settings.width, (availableWidth - width - 10) / columns, availableHeight * ratio / rows) });
    }
    return result;
  });
  // Preserve requested scale across all arrangements/orientations before reducing.
  const single = layouts.find(c => c.fitWidth >= settings.width - 1e-9)
    ?? layouts.filter(c => c.fitWidth >= minimumWidth - 1e-9)
      .sort((a, b) => b.fitWidth - a.fitWidth)[0];
  if (single) {
    const cellWidth = Math.max(minimumWidth, single.fitWidth), cellHeight = cellWidth / ratio;
    const legendBox = { ...single.legend,
      x: single.placement === 'beside' ? 20 + columns * cellWidth + 20 : 10,
      y: single.placement === 'beside' ? 34 : 34 + rows * cellHeight + 10 };
    return { ...single, settings, bounds, legendBox, cellWidth, cellHeight,
      tiled: false, pageCount: 1, gridColumns: 1, gridRows: 1,
      tiles: [{ ...bounds, core: { ...bounds }, column: 0, band: 0, page: 1 }] };
  }
  const tiled = candidates.map(candidate => {
    const capacityX = Math.floor((candidate.availableWidth + 1e-9) / settings.width);
    const capacityY = Math.floor((candidate.availableHeight + 1e-9) / (settings.width / ratio));
    if (capacityX < 1 || capacityY < 1
        || (columns > capacityX && capacityX <= 2 * settings.overlap)
        || (rows > capacityY && capacityY <= 2 * settings.overlap)) return null;
    const xs = axisTiles(bounds.left, bounds.right, capacityX, settings.overlap);
    const ys = axisTiles(bounds.top, bounds.bottom, capacityY, settings.overlap);
    const tiles = [];
    ys.forEach((y, band) => xs.forEach((x, column) => {
      const core = { left: x.start, right: x.end, top: y.start, bottom: y.end };
      if (!occupies(project, core)) return;
      tiles.push({ left: x.printStart, right: x.printEnd, top: y.printStart, bottom: y.printEnd,
        core, column, band, page: tiles.length + 2 });
    }));
    return { ...candidate, settings, bounds, cellWidth: settings.width, cellHeight: settings.width / ratio,
      tiled: true, pageCount: tiles.length + 1, tiles, gridColumns: xs.length, gridRows: ys.length };
  }).filter(Boolean);
  if (!tiled.length) throw new AppError('pdf.tooLarge');
  return tiled.reduce((best, next) => next.pageCount < best.pageCount ? next : best);
}

export function pdfFilename(name) {
  const safe = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '');
  return `${safe || 'pattern'}.pdf`;
}
