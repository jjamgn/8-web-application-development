import { LIMITS } from '../types';

export type RawPreview = { blob: Blob; width: number; height: number; orientation: number | null; hasExif: boolean; hasGps: boolean };

// Strip EXIF only from a display-only copy, so the browser cannot silently auto-orient it.
// The original File is retained unchanged for the actual multipart upload.
export async function createRawPreview(file: File): Promise<RawPreview> {
  if (file.size > LIMITS.fileBytes) throw new Error('Ảnh vượt 10 MiB; không tạo bản xem trước.');
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const removed: [number, number][] = [];
  let width = 0, height = 0, orientation: number | null = null, hasExif = false, hasGps = false;
  function readExif(start: number, end: number) {
    hasExif = true;
    if (start + 8 > end) return;
    const little = bytes[start] === 0x49 && bytes[start + 1] === 0x49;
    if (!little && !(bytes[start] === 0x4d && bytes[start + 1] === 0x4d)) return;
    const read16 = (p: number) => { if (p < start || p + 2 > end) throw new Error(); return view.getUint16(p, little); };
    const read32 = (p: number) => { if (p < start || p + 4 > end) throw new Error(); return view.getUint32(p, little); };
    try {
      if (read16(start + 2) !== 42) return;
      const ifd = start + read32(start + 4), count = read16(ifd);
      for (let i = 0; i < count; i++) {
        const p = ifd + 2 + i * 12;
        if (p + 12 > end) break;
        const tag = read16(p);
        if (tag === 0x0112 && read16(p + 2) === 3 && read32(p + 4) === 1) {
          const value = read16(p + 8); if (value >= 1 && value <= 8) orientation = value;
        }
        if (tag === 0x8825 && read32(p + 8) > 0) hasGps = true;
      }
    } catch { /* Invalid metadata never grants permission to bypass server validation. */ }
  }
  let mime: 'image/jpeg' | 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    mime = 'image/jpeg';
    let offset = 2;
    while (offset + 1 < bytes.length) {
      const markerStart = offset;
      if (bytes[offset] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset), start = offset + 2, end = offset + length;
      if (length < 2 || end > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && start + 5 <= end) {
        height = view.getUint16(start + 1); width = view.getUint16(start + 3);
      }
      if (marker === 0xe1 && end - start >= 6 && [69, 120, 105, 102, 0, 0].every((b, i) => bytes[start + i] === b)) {
        readExif(start + 6, end); removed.push([markerStart, end]);
      }
      offset = end;
    }
  } else if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) {
    mime = 'image/png';
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset), start = offset + 8, end = start + length;
      if (end + 4 > bytes.length) break;
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (type === 'IHDR' && length === 13) { width = view.getUint32(start); height = view.getUint32(start + 4); }
      if (type === 'eXIf') { readExif(start, end); removed.push([offset, end + 4]); }
      offset = end + 4;
      if (type === 'IEND') break;
    }
  } else { throw new Error('Không đọc được bản xem trước JPEG/PNG của file này.'); }
  if (!width || !height || width * height > LIMITS.pixels) throw new Error('Không tạo preview: kích thước không hợp lệ hoặc vượt 40 triệu pixel.');
  const parts: BlobPart[] = []; let offset = 0;
  for (const [start, end] of removed) { parts.push(buffer.slice(offset, start)); offset = end; }
  parts.push(buffer.slice(offset));
  return { blob: removed.length ? new Blob(parts, { type: mime }) : file, width, height, orientation, hasExif, hasGps };
}
