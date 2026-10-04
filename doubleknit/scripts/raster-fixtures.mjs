// Tiny deterministic image fixtures, shared by Node and real browser checks.
import { deflateSync } from 'node:zlib';
export function pngChunk(type, data = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const value of body) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4), check = Buffer.alloc(4);
  size.writeUInt32BE(data.length); check.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, check]);
}
export function png(width, height, pixels, chunks = []) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const rows = Array.from({ length: height }, (_, y) => Buffer.from([0, ...pixels.slice(y * width * 4, (y + 1) * width * 4)]));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header),
    ...chunks, pngChunk('IDAT', deflateSync(Buffer.concat(rows))), pngChunk('IEND')]);
}
export function exif(orientation, little = true) {
  const bytes = Buffer.alloc(26);
  bytes.write(little ? 'II' : 'MM');
  const u16 = (value, offset) => little ? bytes.writeUInt16LE(value, offset) : bytes.writeUInt16BE(value, offset);
  const u32 = (value, offset) => little ? bytes.writeUInt32LE(value, offset) : bytes.writeUInt32BE(value, offset);
  u16(42, 2); u32(8, 4); u16(1, 8); u16(0x112, 10); u16(3, 12); u32(1, 14); u16(orientation, 18);
  return pngChunk('eXIf', bytes);
}
export function gif(width, height, pixels, { animated = false, transparent = false } = {}) {
  const header = Buffer.alloc(13); header.write('GIF89a'); header.writeUInt16LE(width, 6); header.writeUInt16LE(height, 8); header[10] = 0x80;
  const descriptor = Buffer.alloc(10); descriptor[0] = 0x2c; descriptor.writeUInt16LE(width, 5); descriptor.writeUInt16LE(height, 7);
  const codes = pixels.flatMap(pixel => [4, pixel]); codes.push(5);
  const compressed = Buffer.alloc(Math.ceil(codes.length * 3 / 8));
  codes.forEach((code, i) => { const bit = i * 3; compressed[bit >> 3] |= code << (bit % 8); if (bit % 8 > 5) compressed[(bit >> 3) + 1] |= code >> (8 - bit % 8); });
  const blocks = [];
  for (let p = 0; p < compressed.length; p += 255) { const chunk = compressed.subarray(p, p + 255); blocks.push(Buffer.from([chunk.length]), chunk); }
  const frame = Buffer.concat([...(transparent ? [Buffer.from([0x21, 0xf9, 4, 1, 0, 0, 0, 0])] : []), descriptor, Buffer.from([2]), ...blocks, Buffer.from([0])]);
  return Buffer.concat([header, Buffer.from([255, 255, 255, 0, 0, 0]), frame, ...(animated ? [frame] : []), Buffer.from([0x3b])]);
}
export const rgba = rows => rows.flatMap(row => [...row].flatMap(value => value === '.' ? [37, 91, 173, 0] : value === '0' ? [255, 255, 255, 255] : [0, 0, 0, 255]));

export function indexedPng() {
  const header = Buffer.alloc(13); header.writeUInt32BE(3); header.writeUInt32BE(1, 4);
  header[8] = 1; header[9] = 3;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header),
    pngChunk('PLTE', Buffer.from([255, 255, 255, 0, 0, 0])),
    pngChunk('IDAT', deflateSync(Buffer.from([0, 0x40]))), pngChunk('IEND')]);
}
