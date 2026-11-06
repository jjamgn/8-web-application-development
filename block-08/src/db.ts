import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
export const demo = process.env.DEMO_MODE === 'true';
export const prisma = new PrismaClient();
export function imageUrl(path: string) {
  if(path.startsWith('/images/')) return path;
  const base=process.env.SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/${process.env.SUPABASE_STORAGE_BUCKET || 'dish-images'}/${path.split('/').map(encodeURIComponent).join('/')}` : '/images/beef.png';
}
