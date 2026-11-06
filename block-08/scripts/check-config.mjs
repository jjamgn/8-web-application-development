import 'dotenv/config';
import { isIP } from 'node:net';

let missing = 0;
const value = key => (process.env[key] || '').trim();
const report = (key, ok) => {
  console.log(`${key}: ${ok ? 'OK' : 'THIẾU HOẶC CHƯA HỢP LỆ'}`);
  if (!ok) missing++;
};
const boolean = (key, fallback) => {
  const raw = value(key);
  if (!raw) return fallback;
  return raw === 'true' ? true : raw === 'false' ? false : undefined;
};
const isMailbox = input => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(input);
const isLocalHost = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host.toLowerCase());
const production = process.env.NODE_ENV === 'production';
const proxyHops = value('TRUST_PROXY_HOPS') || '0';
report('TRUST_PROXY_HOPS', /^\d+$/.test(proxyHops) && Number(proxyHops) >= 0 && Number(proxyHops) <= 5);

for (const key of ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SESSION_SECRET', 'ADMIN_REGISTRATION_CODE']) {
  const raw = value(key);
  let ok = Boolean(raw);
  if (ok && ['DATABASE_URL', 'DIRECT_URL'].includes(key)) {
    try {
      const url = new URL(raw);
      ok = ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname && url.password) && !/[\[\]]/.test(raw);
    } catch { ok = false; }
  }
  if (ok && key === 'SUPABASE_URL') {
    try {
      const url = new URL(raw);
      ok = url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
    } catch { ok = false; }
  }
  if (ok && key === 'SESSION_SECRET') ok = raw.length >= 32;
  if (ok && key === 'ADMIN_REGISTRATION_CODE') ok = raw.length >= 16;
  report(key, ok);
}

const tokenSecret = value('AUTH_TOKEN_SECRET');
report('AUTH_TOKEN_SECRET (hoặc SESSION_SECRET)', tokenSecret ? tokenSecret.length >= 32 : value('SESSION_SECRET').length >= 32);

let appUrlOk = false;
try {
  const url = new URL(value('APP_URL'));
  const trustedProtocol = url.protocol === 'https:' || (!production && url.protocol === 'http:' && isLocalHost(url.hostname));
  appUrlOk = trustedProtocol && Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
} catch { /* Report an invalid origin without exposing its value. */ }
report('APP_URL', appUrlOk);

const smtpHost = value('SMTP_HOST');
const hostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
report('SMTP_HOST', Boolean(smtpHost) && (Boolean(isIP(smtpHost)) || hostnamePattern.test(smtpHost)));
const smtpPortText = value('SMTP_PORT') || '587';
const smtpPort = Number(smtpPortText);
report('SMTP_PORT', /^\d+$/.test(smtpPortText) && Number.isInteger(smtpPort) && smtpPort >= 1 && smtpPort <= 65535);
const smtpSecure = boolean('SMTP_SECURE', false);
report('SMTP_SECURE', smtpSecure !== undefined);
const smtpRequireTls = boolean('SMTP_REQUIRE_TLS', true);
report('SMTP_REQUIRE_TLS', smtpRequireTls === true || (smtpRequireTls === false && !production && isLocalHost(smtpHost)));
const smtpUser = value('SMTP_USER');
const smtpPassword = process.env.SMTP_PASSWORD || '';
report('SMTP_USER / SMTP_PASSWORD', Boolean(smtpUser) === Boolean(smtpPassword));
const smtpFrom = value('SMTP_FROM');
const displayMailbox = smtpFrom.match(/^[^<>\r\n]+<([^<>\r\n]+)>$/);
report('SMTP_FROM', !/[\r\n]/.test(smtpFrom) && isMailbox(displayMailbox ? displayMailbox[1].trim() : smtpFrom));

console.log(`Chế độ: ${process.env.DEMO_MODE === 'true' ? 'xem thử (các form auth không ghi dữ liệu hoặc gửi email)' : 'database thật'}`);
if (process.argv.includes('--connect') && missing === 0) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('PostgreSQL: kết nối thành công');
  } catch {
    console.log('PostgreSQL: chưa kết nối được; kiểm tra URL, mật khẩu, mạng và trạng thái project');
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }

  const { createClient } = await import('@supabase/supabase-js');
  try {
    const { error } = await createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage.listBuckets();
    if (error) throw error;
    console.log('Supabase Storage: xác thực thành công');
  } catch {
    console.log('Supabase Storage: chưa xác thực được; kiểm tra URL và service role/secret key');
    process.exitCode = 1;
  }

  let smtp;
  try {
    const { default: nodemailer } = await import('nodemailer');
    smtp = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      requireTLS: smtpRequireTls,
      ...(smtpUser ? { auth: { user: smtpUser, pass: smtpPassword } } : {}),
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    });
    await smtp.verify();
    console.log('SMTP: kết nối và xác thực thành công (không gửi email)');
  } catch {
    console.log('SMTP: chưa kết nối được; kiểm tra host, port, TLS và thông tin xác thực');
    process.exitCode = 1;
  } finally { smtp?.close(); }
}
if (missing) process.exitCode = 1;
