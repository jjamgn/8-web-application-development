import sharp from 'sharp';
import { open, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { AppError } from '../errors.js';
import { LIMITS } from '../../../contracts/index.js';
import type { PreparedPhoto, StagedVariant } from '../types.js';

// libvips' open-file cache can retain request-scoped paths on Windows, blocking cleanup.
sharp.cache({ files: 0 });

async function assertStaticPng(tempPath: string) {
  const handle = await open(tempPath, 'r');
  try {
    const size = (await handle.stat()).size;
    let offset = 8;
    const header = Buffer.alloc(8);
    while (offset + 12 <= size) {
      await handle.read(header, 0, 8, offset);
      const length = header.readUInt32BE(0);
      const type = header.toString('ascii', 4, 8);
      if (type === 'acTL') throw new AppError('UNSUPPORTED_IMAGE_TYPE', 400, 'Không nhận PNG động.');
      if (offset + length + 12 > size) throw new AppError('INVALID_IMAGE', 400, 'Ảnh PNG bị thiếu dữ liệu.');
      offset += length + 12;
      if (type === 'IEND') return;
    }
    throw new AppError('INVALID_IMAGE', 400, 'Ảnh PNG thiếu phần kết thúc.');
  } finally { await handle.close(); }
}

export const variantWidths = (width: number) => [...new Set([320, 960, 1600].map(target => Math.min(width, target)))];
export function checkPixelLimit(width: number, height: number) {
  if (width * height > LIMITS.pixels) throw new AppError('PIXEL_LIMIT_EXCEEDED', 400, 'Ảnh vượt quá 40 triệu pixel.');
}
export async function prepareImage(input: { tempPath: string; title: string; alt: string }): Promise<PreparedPhoto> {
  const handle = await open(input.tempPath, 'r');
  const signature = Buffer.alloc(8);
  try { await handle.read(signature, 0, 8, 0); } finally { await handle.close(); }
  const jpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
  const png = signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!jpeg && !png) throw new AppError('UNSUPPORTED_IMAGE_TYPE', 400, 'Chỉ nhận JPEG hoặc PNG tĩnh.');
  if (png) await assertStaticPng(input.tempPath);
  const variants: StagedVariant[] = [];
  let decodingComplete = false;
  try {
    // metadata() reads headers only; reject huge dimensions before invoking a full decode.
    const metadata = await sharp(input.tempPath, { limitInputPixels: false, animated: true }).metadata();
    if (!metadata.width || !metadata.height) throw new AppError('INVALID_IMAGE', 400, 'Ảnh không hợp lệ.');
    checkPixelLimit(metadata.width, metadata.pageHeight ?? metadata.height);
    if ((metadata.pages ?? 1) !== 1) throw new AppError('UNSUPPORTED_IMAGE_TYPE', 400, 'Không nhận ảnh nhiều frame.');
    const rotated = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
    const width = rotated ? metadata.height : metadata.width;
    const height = rotated ? metadata.width : metadata.height;
    // Force a strict full decode independently of resize optimizations (e.g. JPEG shrink-on-load).
    await sharp(input.tempPath, { failOn: 'warning', limitInputPixels: LIMITS.pixels }).stats();
    decodingComplete = true;
    for (const outputWidth of variantWidths(width)) {
      const tempPath = path.join(path.dirname(input.tempPath), `${randomUUID()}.webp`);
      // Register the path before encoding, so partially written files are also cleaned on failure.
      const variant: StagedVariant = { tempPath, width: outputWidth, height: 0, bytes: 0, mime: 'image/webp' };
      variants.push(variant);
      const info = await sharp(input.tempPath, { failOn: 'warning', limitInputPixels: LIMITS.pixels })
        .autoOrient().resize({ width: outputWidth, withoutEnlargement: true }).webp({ quality: 80 }).toFile(tempPath);
      variant.width = info.width; variant.height = info.height; variant.bytes = info.size;
    }
    return { title: input.title, alt: input.alt, width, height, variants };
  } catch (error) {
    await Promise.all(variants.map(v => rm(v.tempPath, { force: true })));
    if (error instanceof AppError) throw error;
    throw new AppError(decodingComplete ? 'IMAGE_PROCESSING_FAILED' : 'INVALID_IMAGE', 400,
      decodingComplete ? 'Không thể tạo ảnh WebP.' : 'Ảnh bị hỏng hoặc thiếu dữ liệu.');
  }
}
