import { AppError, errorMessage } from './i18n.js';
import { createProject, editableFaces, isDimension, isRectangle, MAX_SIZE, validateMask, validateProject } from './model.js';
import { workflowMessages } from './workflow.js';

// Independent of the JSON limit. Bound metadata/compressed input before reading it.
export const MAX_RASTER_BYTES = 8 * 1024 * 1024;
const fail = key => { throw new AppError(key); };
const dimensions = (w, h) => {
  if (!isDimension(w) || !isDimension(h)) throw new AppError('raster.dimensions', { max: MAX_SIZE });
};

// EXIF IFD0 orientation. Parse it ourselves so PNG orientation works consistently,
// including browsers that do not apply PNG eXIf when decoding an ImageBitmap.
function exifOrientation(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 8) fail('raster.invalid');
  const little = bytes[0] === 73 && bytes[1] === 73;
  if (!little && !(bytes[0] === 77 && bytes[1] === 77)) fail('raster.invalid');
  if (view.getUint16(2, little) !== 42) fail('raster.invalid');
  const offset = view.getUint32(4, little);
  if (offset < 8 || offset + 2 > bytes.length) fail('raster.invalid');
  const count = view.getUint16(offset, little);
  if (offset + 2 + count * 12 + 4 > bytes.length) fail('raster.invalid');
  let orientation = 1, found = false;
  for (let i = 0; i < count; i++) {
    const p = offset + 2 + i * 12;
    if (view.getUint16(p, little) !== 0x112) continue;
    if (found || view.getUint16(p + 2, little) !== 3 || view.getUint32(p + 4, little) !== 1) fail('raster.invalid');
    orientation = view.getUint16(p + 8, little); found = true;
    if (orientation < 1 || orientation > 8) fail('raster.invalid');
  }
  return orientation;
}

// Inspect the entire container before giving it to a browser decoder. MIME and
// filename are only hints, never format/animation/dimension validation.
export function inspectRaster(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 6) fail('raster.invalid');
  if (bytes.length > MAX_RASTER_BYTES) fail('raster.fileSize');
  const text = (start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
  if (bytes[0] === 255 && bytes[1] === 216) fail('raster.jpeg');
  if (bytes.subarray(0, 8).every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i]) && bytes.length >= 8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let p = 8, width, height, orientation = 1, seenExif = false, data = false, ended = false;
    const parts = [bytes.subarray(0, 8)];
    while (p + 12 <= bytes.length) {
      const size = view.getUint32(p), type = text(p + 4, 4), end = p + size + 12;
      if (end > bytes.length || ended) fail('raster.invalid');
      if (p === 8 && (type !== 'IHDR' || size !== 13)) fail('raster.invalid');
      if (type === 'IHDR') {
        if (p !== 8 || size !== 13) fail('raster.invalid');
        width = view.getUint32(p + 8); height = view.getUint32(p + 12); dimensions(width, height);
        // Canvas only exposes 8-bit channels. Never silently quantize 16-bit art.
        if (bytes[p + 16] === 16) fail('raster.bitDepth');
      }
      if (['acTL', 'fcTL', 'fdAT'].includes(type)) fail('raster.animation');
      if (type === 'eXIf') {
        if (seenExif) fail('raster.invalid');
        seenExif = true; orientation = exifOrientation(bytes.subarray(p + 8, end - 4));
      } else parts.push(bytes.subarray(p, end));
      if (type === 'IDAT') data = true;
      if (type === 'IEND') { if (size !== 0) fail('raster.invalid'); ended = true; }
      p = end;
    }
    if (!ended || !data || p !== bytes.length) fail('raster.invalid');
    return { type: 'image/png', width, height, orientation, parts };
  }
  if (['GIF87a', 'GIF89a'].includes(text(0, 6))) {
    if (bytes.length < 13) fail('raster.invalid');
    const u16 = p => bytes[p] + bytes[p + 1] * 256;
    const width = u16(6), height = u16(8); dimensions(width, height);
    let p = 13 + (bytes[10] & 128 ? 3 * 2 ** ((bytes[10] & 7) + 1) : 0), frames = 0, ended = false;
    const skipBlocks = () => {
      while (p < bytes.length) {
        const n = bytes[p++];
        if (n === 0) return;
        p += n; if (p > bytes.length) fail('raster.invalid');
      }
      fail('raster.invalid');
    };
    while (p < bytes.length) {
      const marker = bytes[p++];
      if (marker === 0x3b) { ended = true; break; }
      if (marker === 0x21) {
        if (p >= bytes.length) fail('raster.invalid');
        const label = bytes[p++];
        if (label === 0xff && ['NETSCAPE2.0', 'ANIMEXTS1.0'].includes(text(p + 1, 11))) fail('raster.animation');
        // Plain-text extensions are graphical content a canvas need not render.
        if (![0xf9, 0xfe, 0xff].includes(label)) fail('raster.invalid');
        skipBlocks();
      } else if (marker === 0x2c) {
        if (++frames > 1) fail('raster.animation');
        if (p + 9 > bytes.length) fail('raster.invalid');
        const w = u16(p + 4), h = u16(p + 6); dimensions(w, h);
        if (u16(p) + w > width || u16(p + 2) + h > height) fail('raster.invalid');
        const packed = bytes[p + 8];
        p += 9 + (packed & 128 ? 3 * 2 ** ((packed & 7) + 1) : 0);
        if (p >= bytes.length || bytes[p] < 2 || bytes[p] > 8) fail('raster.invalid');
        p++; skipBlocks();
      } else fail('raster.invalid');
    }
    if (!ended || frames !== 1 || p !== bytes.length) fail('raster.invalid');
    return { type: 'image/gif', width, height, orientation: 1, parts: [bytes] };
  }
  fail('raster.format');
}

export function orientPixels({ width, height, data }, orientation) {
  const swap = orientation >= 5, w = swap ? height : width, h = swap ? width : height;
  const result = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const positions = [[x, y], [width - 1 - x, y], [width - 1 - x, height - 1 - y], [x, height - 1 - y],
      [y, x], [height - 1 - y, x], [height - 1 - y, width - 1 - x], [y, width - 1 - x]];
    const [dx, dy] = positions[orientation - 1];
    result.set(data.subarray((y * width + x) * 4, (y * width + x + 1) * 4), (dy * w + dx) * 4);
  }
  return { width: w, height: h, data: result };
}

export function luminance(rgb) {
  const channels = rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function rasterFace({ width, height, data }, face, workflow) {
  dimensions(width, height);
  if (!data || data.length !== width * height * 4) fail('raster.invalid');
  const colours = new Map(), spans = [], words = workflowMessages(workflow);
  const at = (key, x, y) => { throw new AppError(key, { unit: words.unit, row: height - y, column: x + 1 }); };
  for (let y = 0; y < height; y++) {
    let left = -1, right = -1;
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4, alpha = data[p + 3];
      if (alpha === 0) continue;
      if (alpha !== 255) at('raster.alpha', x, y);
      if (left < 0) left = x;
      else if (right !== x) at('raster.hole', x, y);
      right = x + 1;
      const rgb = Array.from(data.subarray(p, p + 3)), key = rgb.join(',');
      colours.set(key, luminance(rgb));
      if (colours.size > 2) at('raster.colours', x, y);
    }
    spans.push(left < 0 ? null : [left, right]);
  }
  validateMask(spans, width, height, false, workflow);
  const sorted = [...colours].sort((a, b) => a[1] - b[1]);
  if (sorted.length === 2 && Math.abs(sorted[0][1] - sorted[1][1]) <= 1e-12) fail('raster.tie');
  const mapping = new Map(sorted.map(([key, light], i) => [key, sorted.length === 1 ? (light >= 0.5 ? 0 : 1) : (i === 0 ? 1 : 0)]));
  const chart = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
    const p = (y * width + x) * 4;
    return data[p + 3] === 0 ? (face === 'a' ? 0 : 1) : mapping.get(Array.from(data.subarray(p, p + 3)).join(','));
  }));
  return { chart, spans };
}

export function rasterProject(images, current, mode, linked = false) {
  if (!images.a) fail('raster.required');
  const { width, height } = images.a;
  const candidate = createProject(width, height, mode, linked);
  candidate.workflow = current.workflow; candidate.display = { ...current.display };
  for (const face of editableFaces(candidate)) {
    const image = images[face];
    try {
      if (!image) fail('raster.required');
      if (image.width !== width || image.height !== height) fail('raster.sizes');
      const result = rasterFace(image, face, current.workflow);
      candidate[face] = result.chart;
      if (face === 'a') {
        candidate.maskA = validateMask(result.spans, width, height, linked, current.workflow);
      } else if (result.spans.some((span, y) => {
        const a = candidate.maskA[y];
        return a ? !span || span[0] !== width - a[1] || span[1] !== width - a[0] : span !== null;
      })) fail('raster.masks');
    } catch (cause) {
      throw new AppError('raster.imageError', { face: face.toUpperCase(), name: image?.name ?? '', reason: errorMessage(cause) });
    }
  }
  return validateProject(candidate);
}

export function isBlankPattern(project) {
  return isRectangle(project) && editableFaces(project).every(face => project[face].every(row =>
    row.every(colour => colour === (face === 'a' ? 0 : 1))));
}
