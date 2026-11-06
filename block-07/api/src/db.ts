import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Reused from Block5. API reads and writes always go through PostgreSQL.
export const prisma = new PrismaClient();
export function imageUrl(path: string) {
  if (/^https:\/\//i.test(path)) return path;
  if (path.startsWith('/images/')) return path;
  if (path.startsWith('uploads/') && process.env.UPLOAD_STORAGE !== 'supabase') return `${(process.env.PUBLIC_API_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, '')}/${path}`;
  const base = process.env.SUPABASE_URL;
  return base
    ? `${base.replace(/\/$/, '')}/storage/v1/object/public/${process.env.SUPABASE_STORAGE_BUCKET || 'dish-images'}/${path.split('/').map(encodeURIComponent).join('/')}`
    : '/images/beef.png';
}
