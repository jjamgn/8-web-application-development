// Opt-in UI regression for the localhost avatar/CSRF bug. Only this run's account is modified.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

if (process.env.BLOCK11_LOCAL_PROFILE_LIVE !== '1') throw Error('Explicit opt-in required.');
if (!new URL(process.env.DATABASE_URL).username.includes('swuswowkpsffkrvvyblo')) throw Error('Unexpected database project.');
const { chromium } = createRequire(new URL('../../web/package.json', import.meta.url))('@playwright/test');
const db = new PrismaClient(), browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage(); page.setDefaultTimeout(90_000);
const run = randomUUID(), password = 'Aa!' + randomUUID();
const report = { localhost: true, checks: [], cleaned: false };
const base = 'http://localhost:5173';
let user;
const originalIds = (await db.photo.findMany({ select: { id: true } })).map(p => p.id);
try {
  user = await db.user.create({ data: { name: 'Local avatar smoke', email: 'block11-local-' + run + '@example.test', passwordHash: await bcrypt.hash(password, 12) } });
  await page.goto(base + '/login?returnTo=/profile');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Tải avatar mới' }).waitFor();
  report.checks.push('localhost login accepted with valid Origin and CSRF');
  console.log('PASS localhost login');
  await page.getByLabel('Chọn avatar').setInputFiles('../docs/demo-assets/exif-gps/test-sideways-orientation6-gps.jpg');
  await page.getByLabel('Giới thiệu', { exact: true }).fill('Local avatar regression');
  const patch = page.waitForResponse(r => new URL(r.url()).pathname === '/api/me/profile' && r.request().method() === 'PATCH', { timeout: 120_000 });
  const upload = page.waitForResponse(r => new URL(r.url()).pathname === '/api/me/avatar' && r.request().method() === 'POST', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  assert.equal((await patch).status(), 200);
  const avatarResponse = await upload; assert.equal(avatarResponse.status(), 200);
  const identity = (await avatarResponse.json()).data; assert.equal(identity.id, user.id); assert.ok(identity.avatarUrl);
  await page.locator('.profile-avatar img').waitFor();
  await page.waitForFunction(() => { const img = document.querySelector('.profile-avatar img'); return img?.complete && img.naturalWidth > 0; });
  const image = await page.request.get(base + identity.avatarUrl); assert.equal(image.status(), 200);
  const meta = await sharp(await image.body()).metadata(); assert.equal(meta.format, 'webp'); assert.equal(meta.width, meta.height); assert.ok(meta.width <= 512); assert.equal(meta.exif, undefined);
  report.checks.push('localhost UI profile PATCH and avatar POST succeeded; square stripped WebP displayed');
  report.avatarWidth = meta.width;
  console.log('PASS localhost profile and real avatar upload');
  const csrf = (await (await page.request.get(base + '/api/auth/csrf')).json()).data.csrfToken;
  const badToken = await page.request.patch(base + '/api/me/profile', { headers: { Origin: base, 'X-CSRF-Token': 'invalid' }, data: { name: 'Rejected', bio: '' } });
  assert.equal(badToken.status(), 403); assert.equal((await badToken.json()).error.code, 'CSRF_INVALID');
  const badOrigin = await page.request.patch(base + '/api/me/profile', { headers: { Origin: 'https://evil.example', 'X-CSRF-Token': csrf }, data: { name: 'Rejected', bio: '' } });
  assert.equal(badOrigin.status(), 403); assert.equal((await badOrigin.json()).error.code, 'ORIGIN_NOT_ALLOWED');
  assert.equal((await db.user.findUnique({ where: { id: user.id }, select: { name: true } })).name, user.name);
  report.checks.push('bad token and unlisted Origin both rejected without profile mutation');
  console.log('PASS CSRF and Origin protections retained');
} finally {
  if (user) {
    const fixtures = await db.photo.findMany({ where: { uploaderId: user.id }, select: { id: true } });
    if (fixtures.length) {
      const csrf = (await (await page.request.get(base + '/api/auth/csrf')).json()).data.csrfToken;
      for (const photo of fixtures) {
        const result = await page.request.delete(base + '/api/photos/' + photo.id, { headers: { Origin: base, 'X-CSRF-Token': csrf } });
        assert.equal(result.status(), 204, 'Fixture avatar must be cleaned using its normal lifecycle');
      }
    }
    if (await db.photo.count({ where: { uploaderId: user.id } }) === 0) await db.user.delete({ where: { id: user.id } });
    const remaining = new Set((await db.photo.findMany({ select: { id: true } })).map(p => p.id));
    report.cleaned = !(await db.user.findUnique({ where: { id: user.id } })) && originalIds.every(id => remaining.has(id));
    assert.equal(report.cleaned, true, 'Only fixtures may be removed');
  }
  await browser.close(); await db.$disconnect();
  await mkdir('../docs/evidence/compact-upload-profile', { recursive: true });
  await writeFile('../docs/evidence/compact-upload-profile/live-localhost-results.json', JSON.stringify(report, null, 2));
}
