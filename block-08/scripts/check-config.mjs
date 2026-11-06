import 'dotenv/config';
let invalid = 0;
function report(key, ok) { console.log(key + ': ' + (ok ? 'OK' : 'THIẾU HOẶC CHƯA HỢP LỆ')); if (!ok) invalid++; }
for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
  let ok = false;
  try { const url = new URL(process.env[key]); ok = ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname && url.password) && !/USER:PASSWORD|YOUR|\[/.test(process.env[key]); } catch {}
  report(key, ok);
}
report('SESSION_SECRET', (process.env.SESSION_SECRET || '').length >= 32);
report('AUTH_TOKEN_SECRET (optional)', !process.env.AUTH_TOKEN_SECRET || process.env.AUTH_TOKEN_SECRET.length >= 32);
const hops = process.env.TRUST_PROXY_HOPS || '0';
report('TRUST_PROXY_HOPS', /^\d+$/.test(hops) && Number(hops) <= 5);
if (process.argv.includes('--connect') && !invalid) {
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  try { await db.$queryRaw`SELECT 1`; console.log('PostgreSQL: OK'); }
  catch { console.log('PostgreSQL: chưa kết nối được'); invalid++; }
  finally { await db.$disconnect(); }
}
if (invalid) process.exitCode = 1;
