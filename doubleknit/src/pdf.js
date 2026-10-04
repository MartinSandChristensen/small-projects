import { layoutLegend } from './pdf-legend.js';
import { AppError, message, translate } from './i18n.js';
import { derivePairs, isPresent } from './model.js';
import { guideBoundaries } from './display.js';
import { pairPresentation } from './notation.js';
import { workflowText, workingDirection } from './workflow.js';
import { PDF_SPACE } from './pdf-layout.js';

export const PDF_LIBRARY_URL = 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js';
const FONT_URL = new URL('../assets/NotoSans-Regular.ttf', import.meta.url).href;
let libraryPromise, fontPromise;
function loadLibrary() {
  if (!libraryPromise) libraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => fail(), 30000);
    const fail = () => { clearTimeout(timer); script.remove(); reject(new AppError('pdf.loadError')); };
    script.src = PDF_LIBRARY_URL;
    script.onload = () => {
      clearTimeout(timer);
      if (window.jspdf?.jsPDF) resolve(window.jspdf.jsPDF); else fail();
    };
    script.onerror = fail;
    document.head.append(script);
  }).catch(error => { libraryPromise = null; throw error; });
  return libraryPromise;
}
function loadFont() {
  if (!fontPromise) fontPromise = (async () => {
    const response = await fetch(FONT_URL, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('font');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    return binary;
  })().catch(() => { fontPromise = null; throw new AppError('pdf.loadError'); });
  return fontPromise;
}

export async function generatePdf(snapshot) {
  const [JsPDF, font] = await Promise.all([loadLibrary(), loadFont()]);
  const doc = new JsPDF({ unit: 'mm', format: snapshot.plan.paper, orientation: snapshot.plan.orientation,
    compress: true, putOnlyUsedFonts: true, floatPrecision: 4 });
  doc.addFileToVFS('NotoSans-Regular.ttf', font);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.setFont('NotoSans');
  // Never silently substitute boxes or drop unsupported user-name characters.
  const glyphs = doc.getFont().metadata.cmap?.unicode?.codeMap;
  if (glyphs && [...snapshot.name].some(character => !glyphs[character.codePointAt(0)])) throw new AppError('pdf.fontError');
  doc.setProperties({ title: snapshot.name, creator: 'Doubleknit', subject: 'Double knitting chart' });
  doc.setLanguage(snapshot.locale);
  renderPdf(doc, snapshot);
  return doc.output('blob');
}

// Pure rendering boundary: no screen DOM, deferred chart cache, storage or browser locale.
export function renderPdf(doc, { project, name, locale, plan }) {
  const t = (key, args) => translate(message(key, args), locale);
  const words = workflowText(project.workflow, locale);
  const [pageWidth, pageHeight] = plan.paper;
  const needsAssembly = plan.tiles.length > 1;
  const w = plan.cellWidth, h = plan.cellHeight;
  const pairs = project.mode === 'plain' ? null : derivePairs(project);
  const presentations = new Map();
  function text(value, x, y, size = 8, options = {}) {
    doc.setFontSize(size); doc.setTextColor(25); doc.text(String(value), x, y, options);
  }
  function paragraph(value, x, y, width, size = 7.5, spacing = 3.4) {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, width);
    lines.forEach((line, index) => text(line, x, y + index * spacing, size));
    return y + lines.length * spacing + 1.5;
  }
  function line(x1, y1, x2, y2, weight = 0.15, grey = 40) {
    doc.setDrawColor(grey); doc.setLineWidth(weight); doc.line(x1, y1, x2, y2);
  }
  function outlinedLine(x1, y1, x2, y2, boundary = false) {
    line(x1, y1, x2, y2, boundary ? 0.8 : 0.65, 255);
    line(x1, y1, x2, y2, boundary ? 0.4 : 0.22, 0);
  }
  function pairCell(pair, x, y, cw, ch, direction, muted = false, notation = project.display.notation) {
    const black = muted ? 185 : 0, white = muted ? 248 : 255;
    const key = `${pair.a}:${pair.b}:${direction}:${notation}`;
    if (!presentations.has(key)) presentations.set(key, pairPresentation(pair, notation, direction, locale));
    const model = presentations.get(key);
    doc.setFillColor(model.background ? black : white); doc.rect(x, y, cw, ch, 'F');
    if (model.upper && model.upper.colour !== model.lower.colour) {
      doc.setFillColor(model.upper.colour ? black : white);
      if (model.upper.corner === 'upper-right') doc.triangle(x, y, x + cw, y, x + cw, y + ch, 'F');
      else doc.triangle(x, y, x + cw, y, x, y + ch, 'F');
      doc.setFillColor(model.lower.colour ? black : white);
      if (model.lower.corner === 'lower-left') doc.triangle(x, y, x, y + ch, x + cw, y + ch, 'F');
      else doc.triangle(x + cw, y, x, y + ch, x + cw, y + ch, 'F');
    }
    if (model.plus) {
      const insetX = cw / 8, insetY = ch / 8, weight = Math.min(cw, ch) / 8;
      line(x + insetX, y + ch / 2, x + cw - insetX, y + ch / 2, weight, model.background ? white : black);
      line(x + cw / 2, y + insetY, x + cw / 2, y + ch - insetY, weight, model.background ? white : black);
    }
  }
  function legend(x, y, width, layout = layoutLegend(project, locale, width)) {
    for (const item of layout.items) {
      const ex = x + item.x, ey = y + item.y;
      if (item.kind === 'text') { text(item.value, ex, ey, item.size); continue; }
      pairCell(item.pair, ex, ey, 5, 5, item.direction, false, item.notation);
      doc.setDrawColor(140); doc.setLineWidth(0.08); doc.rect(ex, ey, 5, 5);
    }
    return y + layout.height;
  }
  function map(x, y, maxWidth, maxHeight, active = null, detailed = false) {
    const unit = Math.min(maxWidth / plan.gridColumns, maxHeight / plan.gridRows);
    const byPosition = new Map(plan.tiles.map(tile => [`${tile.column}:${tile.band}`, tile]));
    for (let band = 0; band < plan.gridRows; band++) for (let column = 0; column < plan.gridColumns; column++) {
      const tile = byPosition.get(`${column}:${band}`);
      const px = x + (plan.gridColumns - column - 1) * unit, py = y + (plan.gridRows - band - 1) * unit;
      doc.setDrawColor(70); doc.setLineWidth(active === tile && tile ? 0.65 : 0.15);
      doc.setLineDashPattern(tile ? [] : [0.6, 0.6], 0);
      doc.setFillColor(active === tile && tile ? 215 : 255);
      doc.rect(px, py, unit, unit, 'FD');
      doc.setLineDashPattern([], 0);
      if (tile && detailed) {
        const cw = (tile.right - tile.left) * w, ch = (tile.bottom - tile.top) * h;
        const scale = Math.min((unit - 2) / cw, (unit - 2) / ch);
        const sw = w * scale, sh = h * scale;
        const ox = px + (unit - cw * scale) / 2, oy = py + (unit - ch * scale) / 2;
        for (let row = tile.top; row < tile.bottom; row++) for (let col = tile.left; col < tile.right; col++) {
          if (!isPresent(project, 'a', row, col)) continue;
          const cx = ox + (col - tile.left) * sw, cy = oy + (row - tile.top) * sh;
          if (pairs) pairCell(pairs[row][col], cx, cy, sw, sh, workingDirection(project, project.height - row), true);
          else { doc.setFillColor(project.a[row][col] ? 185 : 248); doc.rect(cx, cy, sw, sh, 'F'); }
        }
        if (project.display.guides) {
          const guides = guideBoundaries('A', project.width, project.height, project.display.guideSize);
          for (const col of guides.vertical) if (col >= tile.left && col <= tile.right)
            line(ox + (col - tile.left) * sw, oy, ox + (col - tile.left) * sw, oy + ch * scale, 0.15, 155);
          for (const row of guides.horizontal) if (row >= tile.top && row <= tile.bottom)
            line(ox, oy + (row - tile.top) * sh, ox + cw * scale, oy + (row - tile.top) * sh, 0.15, 155);
        }
      }
      if (tile && (detailed || unit >= 5)) {
        const labelSize = detailed ? Math.min(18, unit * 0.8) : Math.min(9, unit * 1.1);
        if (detailed) {
          const labelWidth = Math.min(unit - 0.4, Math.max(8, String(tile.page).length * labelSize * 0.25));
          const labelHeight = Math.min(unit - 0.4, labelSize * 0.5);
          doc.setFillColor(255); doc.rect(px + (unit - labelWidth) / 2, py + (unit - labelHeight) / 2, labelWidth, labelHeight, 'F');
        }
        text(tile.page, px + unit / 2, py + unit / 2 + labelSize * 0.12, labelSize, { align: 'center' });
      }
    }
    return y + plan.gridRows * unit;
  }
  function header(tile) {
    doc.setFontSize(10);
    const title = doc.splitTextToSize(name, pageWidth - (needsAssembly ? 60 : 20));
    title.forEach((part, index) => text(part, 10, 14 + index * 4, 10));
    text(t('pdf.chartType', { workflow: words.name }), 10, 24, 8);
    if (needsAssembly && tile) map(pageWidth - 38, 10, 28, 15, tile);
  }
  function footer(page, tile) {
    if (tile) {
      if (needsAssembly) text(t('pdf.position', { column: tile.column + 1, band: tile.band + 1 }), 10, pageHeight - 18, 7);
    }
    text(t('pdf.page', { page, total: plan.pageCount }), pageWidth - 10, pageHeight - 11, 7, { align: 'right' });
  }
  function arrow(x, y, rtl) {
    const end = x + (rtl ? -1.8 : 1.8);
    line(x, y, end, y, 0.18);
    line(end, y, end + (rtl ? 0.6 : -0.6), y - 0.5, 0.18);
    line(end, y, end + (rtl ? 0.6 : -0.6), y + 0.5, 0.18);
  }
  function chart(tile) {
    const x0 = PDF_SPACE.margin + PDF_SPACE.gutter, y0 = PDF_SPACE.margin + PDF_SPACE.top;
    const width = (tile.right - tile.left) * w, height = (tile.bottom - tile.top) * h;
    for (let y = tile.top; y < tile.bottom; y++) {
      const py = y0 + (y - tile.top) * h;
      const rtl = workingDirection(project, project.height - y) === 'right-to-left';
      for (let x = tile.left; x < tile.right; x++) {
        const px = x0 + (x - tile.left) * w;
        const muted = x < tile.core.left || x >= tile.core.right || y < tile.core.top || y >= tile.core.bottom;
        if (!isPresent(project, 'a', y, x)) {
          doc.setFillColor(250); doc.rect(px, py, w, h, 'F');
          // Each hatch is clipped analytically to its cell, never confused with white yarn.
          line(px, py + h, px + w, py, 0.1, 210);
          line(px, py + h / 2, px + w / 2, py, 0.1, 210);
          line(px + w / 2, py + h, px + w, py + h / 2, 0.1, 210);
        } else if (pairs) pairCell(pairs[y][x], px, py, w, h, rtl ? 'right-to-left' : 'left-to-right', muted);
        else { doc.setFillColor(project.a[y][x] ? (muted ? 185 : 0) : (muted ? 248 : 255)); doc.rect(px, py, w, h, 'F'); }
      }
      const labelX = rtl ? x0 + width + 2.5 : x0 - 2.5;
      text(project.height - y, labelX, py + h / 2 + 0.65, Math.min(6.5, h * 2.3), { align: rtl ? 'left' : 'right' });
      arrow(rtl ? x0 + width + 9 : x0 - 9, py + h / 2, rtl);
    }
    // Hairlines, then global guides, then the actual shape boundary.
    for (let x = 0; x <= tile.right - tile.left; x++) line(x0 + x * w, y0, x0 + x * w, y0 + height, 0.08, 145);
    for (let y = 0; y <= tile.bottom - tile.top; y++) line(x0, y0 + y * h, x0 + width, y0 + y * h, 0.08, 145);
    if (project.display.guides) {
      const boundaries = guideBoundaries(pairs ? 'C' : 'A', project.width, project.height, project.display.guideSize);
      for (const x of boundaries.vertical) if (x >= tile.left && x <= tile.right) {
        const px = x0 + (x - tile.left) * w; outlinedLine(px, y0, px, y0 + height);
      }
      for (const y of boundaries.horizontal) if (y >= tile.top && y <= tile.bottom) {
        const py = y0 + (y - tile.top) * h; outlinedLine(x0, py, x0 + width, py);
      }
    }
    const present = (y, x) => y >= 0 && y < project.height && x >= 0 && x < project.width && isPresent(project, 'a', y, x);
    for (let y = tile.top; y < tile.bottom; y++) for (let x = tile.left; x < tile.right; x++) {
      if (!present(y, x)) continue;
      const px = x0 + (x - tile.left) * w, py = y0 + (y - tile.top) * h;
      if (!present(y, x - 1)) outlinedLine(px, py, px, py + h, true);
      if (!present(y, x + 1)) outlinedLine(px + w, py, px + w, py + h, true);
      if (!present(y - 1, x)) outlinedLine(px, py, px + w, py, true);
      if (!present(y + 1, x)) outlinedLine(px, py + h, px + w, py + h, true);
    }
    const columnLabels = new Set([tile.left]);
    // Avoid collisions between adjacent three-digit column labels at small cell widths.
    if (tile.right - tile.left > 2) columnLabels.add(tile.right - 1);
    for (let x = tile.left + 2; x < tile.right - 2; x++) if ((x + 1) % 5 === 0) columnLabels.add(x);
    for (const x of columnLabels) text(x + 1, x0 + (x - tile.left + 0.5) * w, y0 - 3.5, 6, { align: 'center' });
    const duplicates = [];
    if (tile.left < tile.core.left) {
      const end = x0 + (tile.core.left - tile.left) * w;
      line(x0, y0 - 1, end, y0 - 1);
      line(x0, y0 - 2, x0, y0 - 0.5); line(end, y0 - 2, end, y0 - 0.5);
      duplicates.push(t('pdf.columns', { first: tile.left + 1, last: tile.core.left }));
    }
    if (tile.top < tile.core.top) {
      const end = y0 + (tile.core.top - tile.top) * h;
      line(x0 - 1, y0, x0 - 1, end);
      line(x0 - 2, y0, x0 - 0.5, y0); line(x0 - 2, end, x0 - 0.5, end);
      duplicates.push(`${words.labels} ${project.height - tile.core.top + 1}–${project.height - tile.top}`);
    }
    if (tile.right > tile.core.right) {
      const start = x0 + (tile.core.right - tile.left) * w;
      line(start, y0 - 1, x0 + width, y0 - 1);
      line(start, y0 - 2, start, y0 - 0.5); line(x0 + width, y0 - 2, x0 + width, y0 - 0.5);
      duplicates.push(t('pdf.columns', { first: tile.core.right + 1, last: tile.right }));
    }
    if (tile.bottom > tile.core.bottom) {
      const start = y0 + (tile.core.bottom - tile.top) * h;
      line(x0 - 1, start, x0 - 1, y0 + height);
      line(x0 - 2, start, x0 - 0.5, start); line(x0 - 2, y0 + height, x0 - 0.5, y0 + height);
      duplicates.push(`${words.labels} ${project.height - tile.bottom + 1}–${project.height - tile.core.bottom}`);
    }
    if (duplicates.length) paragraph(`${t('pdf.overlapMark')}: ${duplicates.join(' · ')}`, 10, pageHeight - 28, pageWidth - 20, 6, 2.5);
    return y0 + height;
  }
  if (plan.tiled) {
    header(null);
    let end = legend(10, 36, pageWidth - 20);
    if (needsAssembly) {
      text(t('pdf.assembly'), 10, end + 6, 11);
      end = paragraph(t('pdf.assemblyHelp'), 10, end + 12, pageWidth - 20);
      map(10, end + 2, pageWidth - 20, pageHeight - end - 28, null, true);
    }
    footer(1);
  }
  plan.tiles.forEach(tile => {
    if (plan.tiled) doc.addPage(plan.paper, plan.orientation);
    header(tile);
    chart(tile);
    if (!plan.tiled) {
      const box = plan.legendBox;
      legend(box.x, box.y, box.width, box);
    }
    footer(tile.page, tile);
  });
}
