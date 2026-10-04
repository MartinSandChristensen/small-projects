import { validateMask } from './model.js';

// Coordinates are source/front coordinates. Colour rows remain shared and intact.
export function previewEdge(project, { x, y, mode = 'trim', edge = 'left' }) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= project.width || y < 0 || y >= project.height
    || !['trim', 'restore'].includes(mode) || !['left', 'right'].includes(edge)) throw new Error('Invalid edge operation');
  const old = project.maskA[y];
  const present = old && x >= old[0] && x < old[1];
  if ((mode === 'trim' && !present) || (mode === 'restore' && present)) return project;
  let span;
  if (mode === 'trim') {
    span = edge === 'left' ? [x + 1, old[1]] : [old[0], x];
    if (project.identicalPatterns) span = edge === 'left' ? [x + 1, project.width - x - 1] : [project.width - x, x];
    if (span[0] >= span[1]) span = null;
  } else {
    if (old && ((edge === 'left' && x >= old[0]) || (edge === 'right' && x < old[1]))) return project;
    span = edge === 'left' ? [x, old?.[1] ?? project.width] : [old?.[0] ?? 0, x + 1];
    if (project.identicalPatterns) span = edge === 'left' ? [x, project.width - x] : [project.width - x - 1, x + 1];
  }
  const maskA = project.maskA.map((row, index) => index === y ? span : row);
  validateMask(maskA, project.width, project.height, project.identicalPatterns, project.workflow);
  return { ...project, maskA };
}
