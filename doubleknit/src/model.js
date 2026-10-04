import { AppError } from './i18n.js';
import { workflowMessages } from './workflow.js';
import { DEFAULT_DISPLAY, validateDisplay } from './display.js';

export const SCHEMA_VERSION = 7;
export const MAPPING = 'mirrored-ba-v1';
export const DEFAULT_SIZE = 20;
export const MAX_SIZE = 200;

export function isDimension(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_SIZE;
}

export function parseDimension(text) {
  if (!/^\d+$/.test(String(text).trim())) return null;
  const value = Number(text);
  return isDimension(value) ? value : null;
}

function filledChart(width, height, colour) {
  return Array.from({ length: height }, () => Array(width).fill(colour));
}

export function createProject(width = DEFAULT_SIZE, height = DEFAULT_SIZE, mode = 'double-faced', identicalPatterns = false) {
  if (!isDimension(width) || !isDimension(height)) throw new AppError('error.invalidDimensions');
  if (!['plain', 'double-faced'].includes(mode)) throw new AppError('error.projectMode');
  if (typeof identicalPatterns !== 'boolean' || (mode === 'plain' && identicalPatterns)) {
    throw new AppError('error.relationship');
  }
  return { schemaVersion: SCHEMA_VERSION, mapping: MAPPING, mode, width, height, workflow: 'flat',
    ...(mode === 'double-faced' ? { identicalPatterns } : {}),
    a: filledChart(width, height, 0), ...(mode === 'double-faced' && !identicalPatterns ? { b: filledChart(width, height, 1) } : {}),
    maskA: Array.from({ length: height }, () => [0, width]),
    display: { ...DEFAULT_DISPLAY } };
}

// Return only supported source fields, with no references to untrusted arrays.
export function validateProject(value) {
  if (!value || value.schemaVersion !== SCHEMA_VERSION) throw new AppError('error.projectVersion');
  if (value.mapping !== MAPPING) throw new AppError('error.chartMapping');
  const { width, height, mode } = value;
  const workflow = validateWorkflow(value.workflow);
  if (!['plain', 'double-faced'].includes(mode)) throw new AppError('error.projectMode');
  if (mode === 'plain' && Object.hasOwn(value, 'b')) throw new AppError('error.plainFaceB');
  if (mode === 'plain' && Object.hasOwn(value, 'identicalPatterns')) {
    throw new AppError('error.plainRelationship');
  }
  if (mode === 'double-faced' && typeof value.identicalPatterns !== 'boolean') {
    throw new AppError('error.requiredRelationship');
  }
  if (value.identicalPatterns && Object.hasOwn(value, 'b')) {
    throw new AppError('error.linkedFaceB');
  }
  if (!isDimension(width) || !isDimension(height)) {
    throw new AppError('error.dimensions', { max: MAX_SIZE });
  }
  for (const face of editableFaces(value)) {
    const chart = value[face];
    if (!Array.isArray(chart) || chart.length !== height) throw new AppError('error.faceRows', { face: face.toUpperCase() });
    for (let y = 0; y < height; y++) {
      const row = chart[y];
      if (!Array.isArray(row) || row.length !== width) throw new AppError('error.faceWidth', { face: face.toUpperCase() });
      for (let x = 0; x < width; x++) {
        if (row[x] !== 0 && row[x] !== 1) throw new AppError('error.faceBits', { face: face.toUpperCase() });
      }
    }
  }
  const maskA = validateMask(value.maskA, width, height, value.identicalPatterns, workflow);
  if (Object.hasOwn(value, 'maskB')) throw new AppError('error.derivedMaskB');
  return { schemaVersion: SCHEMA_VERSION, mapping: MAPPING, mode, width, height, workflow,
    ...(mode === 'double-faced' ? { identicalPatterns: value.identicalPatterns } : {}),
    a: value.a.map(row => [...row]), ...(editableFaces(value).includes('b') ? { b: value.b.map(row => [...row]) } : {}),
    maskA, display: validateDisplay(value.display) };
}

export function editableFaces(project) { return project.mode === 'plain' || project.identicalPatterns ? ['a'] : ['a', 'b']; }

// Resolve outward-facing B before applying the shared physical mirror.
export function reverseColour(project, y, x) {
  if (project.mode === 'plain') return 1 - project.a[y][project.width - 1 - x];
  return project.identicalPatterns ? 1 - project.a[y][x] : project.b[y][x];
}

// This changes sources only. The caller confirms and records an undoable transaction.
export function setIdenticalPatterns(project, enabled) {
  if (project.mode !== 'double-faced' || typeof enabled !== 'boolean') {
    throw new AppError('error.linkingMode');
  }
  if (project.identicalPatterns === enabled) return project;
  if (enabled && !isSymmetricMask(project)) throw new AppError('link.asymmetric');
  const { b, ...source } = project;
  return { ...source, identicalPatterns: enabled,
    ...(enabled ? {} : { b: project.a.map(row => row.map(colour => 1 - colour)) }) };
}

export function resetProject(project) {
  return createProject(DEFAULT_SIZE, DEFAULT_SIZE, project.mode, project.identicalPatterns ?? false);
}

export function relationship(project) {
  return project.mode === 'plain' ? 'plain' : project.identicalPatterns ? 'linked' : 'independent';
}

// Preserve the currently visible reverse when making it independently editable.
// Earlier source snapshots in history retain any reverse replaced by a derived one.
export function setRelationship(project, kind) {
  if (!['plain', 'linked', 'independent'].includes(kind)) throw new AppError('error.relationship');
  if (relationship(project) === kind) return project;
  if (kind === 'linked' && !isSymmetricMask(project)) throw new AppError('link.asymmetric');
  const { b, identicalPatterns, ...source } = project;
  return { ...source, mode: kind === 'plain' ? 'plain' : 'double-faced',
    ...(kind === 'plain' ? {} : { identicalPatterns: kind === 'linked' }),
    ...(kind === 'independent' ? { b: project.a.map((row, y) => row.map((_, x) => reverseColour(project, y, x))) } : {}) };
}

export function isDesignClear(project) {
  return editableFaces(project).every(face => project[face].every(row => row.every(value => value === (face === 'a' ? 0 : 1))));
}

export function clearDesign(project) {
  if (isDesignClear(project)) return project;
  return { ...project, a: filledChart(project.width, project.height, 0),
    ...(editableFaces(project).includes('b') ? { b: filledChart(project.width, project.height, 1) } : {}) };
}

export function isResetProject(project) {
  return project.width === DEFAULT_SIZE && project.height === DEFAULT_SIZE
    && project.workflow === 'flat'
    && isRectangle(project)
    && Object.keys(DEFAULT_DISPLAY).every(key => project.display[key] === DEFAULT_DISPLAY[key])
    && editableFaces(project).every(face => project[face].every(row =>
      row.every(colour => colour === (face === 'a' ? 0 : 1))));
}

const mappings = {
  [MAPPING]: (project, y, x) => isPresent(project, 'a', y, x)
    ? { a: project.a[y][x], b: reverseColour(project, y, project.width - 1 - x) } : { present: false },
};

// Actual yarn pairs, independent of notation and working direction.
// Resolve derived B before this boundary; absent pairs retain their position.
export function derivePairs(project, previous, pairs) {
  if (!Object.hasOwn(mappings, project.mapping)) throw new AppError('error.chartMapping');
  return Array.from({ length: project.height }, (_, y) =>
    previous?.mapping === project.mapping && previous.mode === project.mode
      && previous.identicalPatterns === project.identicalPatterns && previous.width === project.width
      && previous.maskA[y] === project.maskA[y] && previous.a[y] === project.a[y] && previous.b?.[y] === project.b?.[y] && pairs?.[y]
      ? pairs[y] : Array.from({ length: project.width }, (_, x) => mappings[project.mapping](project, y, x)));
}

// Logical stitch sequence retained for mapping consumers, not screen rendering.
export function deriveCombined(project, previous, combined) {
  if (!Object.hasOwn(mappings, project.mapping)) throw new AppError('error.chartMapping');
  return Array.from({ length: project.height }, (_, y) =>
    previous?.mapping === project.mapping && previous.mode === project.mode
      && previous.identicalPatterns === project.identicalPatterns && previous.width === project.width
      && previous.maskA[y] === project.maskA[y] && previous.a[y] === project.a[y] && previous.b?.[y] === project.b?.[y] && combined?.[y]
      ? combined[y] : Array.from({ length: project.width }, (_, x) => {
        const pair = mappings[project.mapping](project, y, x);
        return pair.present === false ? [null, null] : [pair.b, pair.a];
      }).flat());
}

export function rowNumber(height, y) { return height - y; }
export function validateWorkflow(workflow) {
  if (!['flat', 'in-the-round'].includes(workflow)) throw new AppError('error.workflow');
  return workflow;
}
export function setWorkflow(project, workflow) {
  validateWorkflow(workflow);
  return workflow === project.workflow ? project : { ...project, workflow };
}
export function rowDirection(number, workflow = 'flat') {
  return workflow === 'in-the-round' || number % 2 === 1 ? 'right-to-left' : 'left-to-right';
}

export function toggleCell(project, face, y, x) {
  if (!editableFaces(project).includes(face) || !Number.isInteger(x) || !Number.isInteger(y)
      || x < 0 || x >= project.width || y < 0 || y >= project.height) {
    throw new AppError('error.editableCell');
  }
  if (!isPresent(project, face, y, x)) return project;
  const chart = [...project[face]];
  chart[y] = [...chart[y]];
  chart[y][x] = 1 - chart[y][x];
  return { ...project, [face]: chart };
}

// Inclusive rectangular operation; copy only occupied affected rows.
// Both single and bulk editing use the same face spans, never colour as presence.
export function toggleArea(project, face, bounds) {
  const { left, right, top, bottom } = bounds;
  if (!editableFaces(project).includes(face) || ![left, right, top, bottom].every(Number.isInteger)
      || left < 0 || top < 0 || right >= project.width || bottom >= project.height
      || right < left || bottom < top) throw new AppError('error.editableArea');
  const chart = [...project[face]];
  let changed = false;
  for (let y = top; y <= bottom; y++) {
    const span = faceSpan(project, face, y);
    if (!span || span[0] > right || span[1] <= left) continue;
    chart[y] = [...chart[y]];
    for (let x = Math.max(left, span[0]); x <= Math.min(right, span[1] - 1); x++) chart[y][x] = 1 - chart[y][x];
    changed = true;
  }
  return changed ? { ...project, [face]: chart } : project;
}

export function resizeRemovesPattern(project, width, height) {
  return editableFaces(project).some(face => project[face].some((row, y) => row.some((colour, x) => {
    const nextY = y + height - project.height;
    const nextX = face === 'a' ? x + width - project.width : x;
    return colour === (face === 'a' ? 1 : 0) && (nextY < 0 || nextX < 0 || nextX >= width);
  })));
}

export function resizeProject(project, width, height) {
  if (width === project.width && height === project.height) return project;
  const result = { ...project, ...createProject(width, height, project.mode, project.identicalPatterns ?? false), display: project.display, workflow: project.workflow };
  for (const face of editableFaces(project)) {
    for (let y = 0; y < height; y++) {
      const oldY = y + project.height - height;
      for (let x = 0; x < width; x++) {
        const oldX = face === 'a' ? x + project.width - width : x;
        result[face][y][x] = project[face][oldY]?.[oldX] ?? (face === 'a' ? 0 : 1);
      }
    }
  }
  if (!isRectangle(project)) {
    result.maskA = Array.from({ length: height }, (_, y) => {
      const span = project.maskA[y + project.height - height];
      if (!span) return null;
      const left = Math.max(0, span[0] + width - project.width);
      const right = Math.min(width, span[1] + width - project.width);
      return left < right ? [left, right] : null;
    });
    validateMask(result.maskA, width, height, result.identicalPatterns, project.workflow);
  }
  return result;
}

export function initialFocus(project, face) {
  return nearestPresent(project, face, { y: project.height - 1, x: face === 'a' ? project.width - 1 : 0 });
}

// Follow the anchored stitch, then clamp if that stitch was cropped.
export function resizeFocus(focus, face, previous, next) {
  return nearestPresent(next, face, {
    y: Math.max(0, Math.min(next.height - 1, focus.y + next.height - previous.height)),
    x: Math.max(0, Math.min(next.width - 1, focus.x + (face === 'a' ? next.width - previous.width : 0))),
  });
}

// A row is null (empty padding) or [left, rightExclusive] in source coordinates.
// Only A's mask is stored. B always uses its physical horizontal mirror.
export function validateMask(mask, width, height, symmetric = false, workflow = 'flat') {
  const words = workflowMessages(workflow);
  if (!Array.isArray(mask) || mask.length !== height) throw new AppError('error.shapeRows', { units: words.units });
  let occupied = false, ended = false;
  const clean = Array.from(mask, span => {
    if (span === null) { if (occupied) ended = true; return null; }
    if (!Array.isArray(span) || span.length !== 2 || ![span[0], span[1]].every(Number.isInteger)
        || span[0] < 0 || span[0] >= span[1] || span[1] > width) {
      throw new AppError('error.shapeSpan', { unit: words.unit });
    }
    if (ended) throw new AppError('error.shapeEmpty', { units: words.units });
    if (symmetric && span[0] + span[1] !== width) throw new AppError('error.symmetricOutline');
    occupied = true;
    return [...span];
  });
  if (!occupied) throw new AppError('error.emptyShape');
  return clean;
}
export function isRectangle(project) {
  return project.maskA.every(span => span && span[0] === 0 && span[1] === project.width);
}
export function isSymmetricMask(project) {
  return project.maskA.every(span => !span || span[0] + span[1] === project.width);
}
export function faceSpan(project, face, y) {
  const span = project.maskA[y];
  return span && face.toLowerCase() === 'b' ? [project.width - span[1], project.width - span[0]] : span;
}
export function isPresent(project, face, y, x) {
  const span = faceSpan(project, face, y);
  return Boolean(span && x >= span[0] && x < span[1]);
}
export function nearestPresent(project, face, point) {
  let nearest, distance = Infinity;
  for (let y = 0; y < project.height; y++) {
    const span = faceSpan(project, face, y);
    if (!span) continue;
    const x = Math.max(span[0], Math.min(span[1] - 1, point.x));
    const d = Math.abs(y - point.y) + Math.abs(x - point.x);
    if (d < distance) { distance = d; nearest = { x, y }; }
  }
  return nearest;
}
// Set absolute cuts from A's bounding edges across an inclusive source row range.
// Retained colour arrays are deliberately unchanged, including absent coordinates.
export function setRowEdges(project, { top, bottom, left = 0, right = 0, empty = false }) {
  if (![top, bottom].every(Number.isInteger) || top < 0 || bottom >= project.height || bottom < top) {
    throw new AppError('error.shapeRange', { unit: workflowMessages(project.workflow).unit });
  }
  if (typeof empty !== 'boolean' || ![left, right].every(Number.isInteger)
      || left < 0 || right < 0 || left >= project.width || right >= project.width) {
    throw new AppError('error.edgeCuts');
  }
  if (project.identicalPatterns) right = left;
  const span = empty ? null : [left, project.width - right];
  const maskA = project.maskA.map((row, y) => y >= top && y <= bottom ? span && [...span] : row);
  validateMask(maskA, project.width, project.height, project.identicalPatterns, project.workflow);
  if (maskA.every((row, y) => row?.[0] === project.maskA[y]?.[0] && row?.[1] === project.maskA[y]?.[1])) return project;
  return { ...project, maskA };
}
