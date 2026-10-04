import { AppError, errorMessage } from './i18n.js';
import { inspectRaster, MAX_RASTER_BYTES, orientPixels } from './raster.js';

export async function decodeRaster(file, face) {
  let bitmap;
  try {
    if (!file) throw new AppError('raster.required');
    if (file.size > MAX_RASTER_BYTES) throw new AppError('raster.fileSize');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = inspectRaster(bytes);
    // Strip eXIf before decode; apply its exact integer transform once below.
    bitmap = await createImageBitmap(new Blob(info.parts, { type: info.type }),
      { imageOrientation: 'from-image', colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    if (bitmap.width !== info.width || bitmap.height !== info.height) throw new AppError('raster.invalid');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    return { ...orientPixels(pixels, info.orientation), name: file.name };
  } catch (cause) {
    throw new AppError('raster.imageError', { face: face.toUpperCase(), name: file?.name ?? '',
      reason: cause instanceof AppError ? errorMessage(cause) : { key: 'raster.decode' } });
  } finally { bitmap?.close(); }
}
