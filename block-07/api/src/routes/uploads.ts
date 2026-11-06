import { Router, raw } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { imageUrl } from '../db.js';
import { BusinessError } from '../services/resources.js';

export const uploadDirectory = fileURLToPath(new URL('../../var/uploads/', import.meta.url));
export function detectImage(bytes: Uint8Array): { mime: string; ext: string } | null {
  const b = Buffer.from(bytes);
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.toString('ascii', 12, 16) === 'IHDR' && b.readUInt32BE(16) > 0 && b.readUInt32BE(20) > 0) return { mime: 'image/png', ext: 'png' };
  if (b.length >= 12 && b[0] === 255 && b[1] === 216 && b[2] === 255 && b[b.length - 2] === 255 && b[b.length - 1] === 217) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}
export const uploadsRouter = Router();
uploadsRouter.post('/dishes', raw({ type: 'multipart/form-data', limit: '6mb' }), async (req, res) => {
  const invalid = (message: string) => new BusinessError('VALIDATION_FAILED', message, { file: message });
  if (!Buffer.isBuffer(req.body)) throw invalid('Vui lòng gửi một file ảnh bằng multipart/form-data.');
  let form: FormData;
  try { form = await new Response(new Uint8Array(req.body), { headers: { 'Content-Type': req.get('Content-Type') || '' } }).formData(); }
  catch { throw invalid('Dữ liệu tải ảnh chưa hợp lệ.'); }
  const file = form.get('file');
  if (!file || typeof file === 'string' || form.getAll('file').length !== 1) throw invalid('Vui lòng chọn đúng một file ảnh.');
  if (file.size === 0 || file.size > 5 * 1024 * 1024) throw invalid('Ảnh phải có dung lượng từ 1 byte đến 5 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = detectImage(bytes);
  if (!image || image.mime !== file.type) throw invalid('Nội dung file phải là ảnh JPEG, PNG hoặc WebP đúng định dạng.');
  const filename = `${randomUUID()}.${image.ext}`;
  const imagePath = `uploads/${filename}`;
  if (process.env.UPLOAD_STORAGE === 'supabase') {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Storage not configured');
    const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage;
    const { error } = await storage.from(process.env.SUPABASE_STORAGE_BUCKET || 'dish-images').upload(imagePath, bytes, { contentType: image.mime, upsert: false });
    if (error) throw new Error('Upload failed');
  } else {
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(path.join(uploadDirectory, filename), bytes, { flag: 'wx' });
  }
  res.json({ ok: true, data: { imagePath, imageUrl: imageUrl(imagePath) }, error: null });
});
