import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
const url = new URL('../.env', import.meta.url);
let content = await readFile(url, 'utf8').catch(() => readFile(new URL('../.env.example', import.meta.url), 'utf8'));
const configured = parse(content);
if ((configured.SESSION_SECRET || '').length < 32) {
  const line = 'SESSION_SECRET=' + randomBytes(48).toString('hex');
  content = /^SESSION_SECRET=.*$/m.test(content) ? content.replace(/^SESSION_SECRET=.*$/m, () => line) : [content, line, ''].join(String.fromCharCode(10));
  await writeFile(url, content);
  console.log('Đã lưu SESSION_SECRET trong .env.');
} else console.log('Giữ nguyên SESSION_SECRET đã cấu hình.');
console.log('Lệnh này không tạo tài khoản hoặc đổi quyền người dùng.');
