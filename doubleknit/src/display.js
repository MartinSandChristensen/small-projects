import { AppError } from './i18n.js';
// Project settings and renderer-independent geometry, shared with future PDF export.
export const DEFAULT_DISPLAY = Object.freeze({
  stitches: 20, rows: 20, proportional: true, guides: false, guideSize: 10, notation: 'plus',
});
export const MAX_GUIDE_SIZE = 200;

export function validateDisplay(value) {
  if (!value || !Number.isFinite(value.stitches) || value.stitches <= 0
      || !Number.isFinite(value.rows) || value.rows <= 0) {
    throw new AppError('error.gauge');
  }
  if (typeof value.proportional !== 'boolean' || typeof value.guides !== 'boolean') {
    throw new AppError('error.displayFlags');
  }
  if (!Number.isInteger(value.guideSize) || value.guideSize < 1 || value.guideSize > MAX_GUIDE_SIZE) {
    throw new AppError('error.guideSize', { max: MAX_GUIDE_SIZE });
  }
  if (!['triangle', 'plus'].includes(value.notation)) throw new AppError('error.notation');
  return Object.fromEntries(Object.keys(DEFAULT_DISPLAY).map(key => [key, value[key]]));
}

export function cellGeometry(display, face) {
  const rawRatio = display.rows / display.stitches;
  const ratio = Math.max(0.5, Math.min(2, rawRatio));
  const effective = display.proportional ? ratio : 1;
  return { width: 24 * Math.max(1, effective), height: 24 / Math.min(1, effective),
    ratio, clamped: rawRatio < 0.5 || rawRatio > 2 };
}

// Boundary coordinates include both rectangle edges, even for partial frames.
export function guideBoundaries(face, width, height, size) {
  const step = size;
  const vertical = [0, width], horizontal = [0, height];
  for (let distance = step; distance < width; distance += step) {
    vertical.push(face === 'B' ? distance : width - distance);
  }
  for (let distance = size; distance < height; distance += size) horizontal.push(height - distance);
  return { vertical: vertical.sort((a, b) => a - b), horizontal: horizontal.sort((a, b) => a - b) };
}
