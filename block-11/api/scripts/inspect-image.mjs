// Read-only local metadata inspection. No upload, rotation, rewrite or network call.
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function gpsMetadata(exif) {
  if (!exif) return null;
  try {
    const start = exif.subarray(0, 6).equals(Buffer.from('Exif\0\0')) ? 6 : 0;
    const endian = exif.toString('ascii', start, start + 2);
    if (!['II', 'MM'].includes(endian)) return null;
    const u16 = p => endian === 'II' ? exif.readUInt16LE(p) : exif.readUInt16BE(p);
    const u32 = p => endian === 'II' ? exif.readUInt32LE(p) : exif.readUInt32BE(p);
    function entries(offset) {
      const result = new Map(); const p = start + offset; const count = u16(p);
      for (let i = 0; i < count; i++) {
        const e = p + 2 + i * 12;
        result.set(u16(e), { type: u16(e + 2), count: u32(e + 4), value: u32(e + 8), inline: e + 8 });
      }
      return result;
    }
    const pointer = entries(u32(start + 4)).get(0x8825);
    if (!pointer) return null;
    const gps = entries(pointer.value);
    function ascii(tag) {
      const e = gps.get(tag); if (!e || e.type !== 2) return null;
      const p = e.count <= 4 ? e.inline : start + e.value;
      return exif.toString('ascii', p, p + e.count).replace(/\0/g, '');
    }
    function rational(tag) {
      const e = gps.get(tag); if (!e || e.type !== 5 || e.count > 3) return null;
      return Array.from({ length: e.count }, (_, i) => {
        const p = start + e.value + i * 8; const denominator = u32(p + 4);
        return denominator ? u32(p) / denominator : null;
      });
    }
    return { latitudeDMS: rational(2), latitudeRef: ascii(1), longitudeDMS: rational(4), longitudeRef: ascii(3), altitudeMeters: rational(6)?.[0] ?? null };
  } catch { return { parseError: 'GPS directory could not be decoded; EXIF is still present.' }; }
}

const names = ['test-sideways-orientation6-gps.jpg', 'raw-pixels-before-exif.png', 'expected-after-upload.webp'];
const files = process.argv.length > 2 ? process.argv.slice(2).map(file => path.resolve(file)) : names.map(name => fileURLToPath(new URL('../../docs/demo-assets/exif-gps/' + name, import.meta.url)));
const results = [];
for (const file of files) {
  try {
    const m = await sharp(file).metadata();
    const swapsDimensions = [5, 6, 7, 8].includes(m.orientation);
    results.push({ file: path.basename(file), format: m.format, storedPixels: `${m.width}x${m.height}`, exifOrientation: m.orientation ?? null,
      displayAfterExif: `${swapsDimensions ? m.height : m.width}x${swapsDimensions ? m.width : m.height}`, hasExif: !!m.exif, gps: gpsMetadata(m.exif) });
  } catch { results.push({ file: path.basename(file), error: 'Cannot read image metadata.' }); process.exitCode = 1; }
}
console.log(JSON.stringify(results, null, 2));
