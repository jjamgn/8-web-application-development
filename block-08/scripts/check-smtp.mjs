import 'dotenv/config';
import nodemailer from 'nodemailer';
import addressParser from 'nodemailer/lib/addressparser/index.js';

// Run this locally to check authentication without sharing credentials.
// Never print provider responses, error messages, mailbox names or secrets.
const host = (process.env.SMTP_HOST || '').trim();
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASSWORD;
const from = addressParser(process.env.SMTP_FROM || '', { flatten: true });
const local = ['localhost', '127.0.0.1', '::1'].includes(host);
let invalid = false;
function check(label, ok) {
  console.log(`${label}: ${ok ? 'OK' : 'THIẾU HOẶC CHƯA HỢP LỆ'}`);
  if (!ok) invalid = true;
}
check('SMTP_HOST', Boolean(host));
check('SMTP_PORT', Number.isInteger(port) && port >= 1 && port <= 65535);
check('SMTP_SECURE', !process.env.SMTP_SECURE || ['true', 'false'].includes(process.env.SMTP_SECURE));
check('SMTP_FROM', from.length === 1 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from[0].address || ''));
check('SMTP_USER / SMTP_PASSWORD', Boolean(user) === Boolean(pass) && (local || Boolean(user && pass)));
check('SMTP_REQUIRE_TLS', (!process.env.SMTP_REQUIRE_TLS || ['true', 'false'].includes(process.env.SMTP_REQUIRE_TLS)) && (process.env.SMTP_REQUIRE_TLS !== 'false' || local && process.env.NODE_ENV !== 'production'));
if (process.env.SMTP_PASS !== undefined && !pass) console.log('Đổi tên SMTP_PASS thành SMTP_PASSWORD; giữ nguyên giá trị.');

if (invalid) {
  process.exitCode = 1;
} else {
  const transport = nodemailer.createTransport({
    host, port, secure: process.env.SMTP_SECURE === 'true',
    requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
    ...(user && pass ? { auth: { user, pass } } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    logger: false, debug: false,
  });
  try {
    await transport.verify();
    console.log('SMTP: kết nối và xác thực thành công. Không gửi email thử.');
    console.log('Khởi động lại server rồi dùng Gửi lại mã trên trang xác minh.');
  } catch (error) {
    const known = new Set(['EAUTH', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNECTION', 'ETLS', 'EPROTOCOL']);
    const code = known.has(error?.code) ? error.code : 'SMTP_ERROR';
    const status = Number.isInteger(error?.responseCode) ? `; status=${error.responseCode}` : '';
    console.error(`SMTP: kiểm tra thất bại (${code}${status}).`);
    if (code === 'EAUTH') console.error('Kiểm tra tài khoản SMTP, mật khẩu ứng dụng và quyền SMTP của nhà cung cấp.');
    else console.error('Kiểm tra host, port, TLS và kết nối mạng.');
    process.exitCode = 1;
  } finally { transport.close(); }
}
