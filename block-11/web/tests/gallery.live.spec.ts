import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// This suite never intercepts API or media requests. Use an isolated Block 11 DB/bucket.
// The explicit switch prevents creating demo users/photos on an unintended target.
const controlled = process.env.BLOCK11_BROWSER_FIXTURE === '1';
test.skip(!controlled && process.env.LIVE_RUN_MUTATIONS !== '1', 'Set LIVE_RUN_MUTATIONS=1 against the isolated real Block 11 environment.');

async function register(page: Page, email: string, password: string, name: string) {
  await page.goto('/register');
  await page.getByLabel('Tên hiển thị').fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Xác nhận mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('status')).toContainText('Đăng ký thành công');
}
async function login(page: Page, email: string, password: string) {
  await page.goto('/login?returnTo=/photos/upload');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/photos/upload');
}
async function guardedDelete(page: Page, id: string) {
  return page.evaluate(async photoId => {
    const csrf = await fetch('/api/auth/csrf', { credentials: 'same-origin' }).then(r => r.json());
    const response = await fetch(`/api/photos/${photoId}`, { method: 'DELETE', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf.data.csrfToken } });
    return response.status;
  }, id);
}

test(`${controlled ? 'CONTROLLED A+B+C' : 'LIVE'}: hai tài khoản, upload JPEG/PNG, owner-only delete, media và reload`, async ({ page, browser, baseURL }) => {
  test.setTimeout(controlled ? 120_000 : 240_000);
  const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Generated credentials are never logged or stored in evidence.
  const password = `Demo!${run}`;
  const ownerEmail = `c-owner-${run}@example.test`;
  const otherEmail = `c-other-${run}@example.test`;
  const ownerName = `C owner ${run}`;
  const created: string[] = [];
  const otherContext = await browser.newContext({ baseURL });
  const guestContext = await browser.newContext({ baseURL });
  const otherPage = await otherContext.newPage();
  const guest = await guestContext.newPage();
  try {
    await register(page, ownerEmail, password, ownerName);
    await login(page, ownerEmail, password);
    const images = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#36885d'; ctx.fillRect(100, 100, 1000, 600); // PNG retains transparent border.
      return ['image/jpeg', 'image/png'].map(mime => ({ mime, base64: canvas.toDataURL(mime).split(',')[1] }));
    });
    await page.getByLabel('Chọn ảnh', { exact: true }).setInputFiles(images.map(({ mime, base64 }, i) => ({ name: `live-${run}.${i ? 'png' : 'jpg'}`, mimeType: mime, buffer: Buffer.from(base64, 'base64') })));
    for (let i = 1; i <= 2; i++) {
      await page.getByLabel(`Tiêu đề ảnh ${i}`, { exact: true }).fill(`C live ${run} ${i}`);
      await page.getByLabel(`Mô tả thay thế ảnh ${i}`, { exact: true }).fill('Hình chữ nhật xanh trên nền trong suốt mô phỏng.');
    }
    const uploadResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/photos' && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Đăng 2 ảnh', exact: true }).click();
    const response = await uploadResponse;
    expect(response.status()).toBe(200);
    const payload = await response.json();
    for (const item of payload.data.results) if (item.ok) created.push(item.photo.id);
    expect(payload.data.succeeded).toBe(2);
    expect(payload.data.failed).toBe(0);
    const uploaded = payload.data.results.map((r: { photo: { id: string; variants: { width: number; url: string }[] } }) => r.photo);
    for (const photo of uploaded) {
      expect(photo.variants.map((v: { width: number }) => v.width)).toEqual([320, 960, 1200]);
      expect(photo.uploader.name).toBe(ownerName);
    }
    expect(JSON.stringify(payload)).not.toMatch(/passwordHash|"email"|storageKey|tempPath/);
    const id = created[0];
    await guest.goto(`/photos/${id}`);
    await expect(guest.locator('.detail-image img')).toBeVisible();
    await expect(guest.locator('.detail-image img')).toHaveJSProperty('complete', true);
    expect(await guest.locator('.detail-image img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(guest.getByRole('button', { name: 'Xóa ảnh', exact: true })).toHaveCount(0);
    expect(await guardedDelete(guest, id)).toBe(401);
    const media = await guest.request.get(uploaded[0].variants[0].url);
    expect(media.status()).toBe(200);
    expect(media.headers()['content-type']).toContain('image/webp');
    expect(media.headers()['cache-control']).toContain('immutable');
    await register(otherPage, otherEmail, password, `C other ${run}`);
    await login(otherPage, otherEmail, password);
    expect(await otherPage.evaluate(async () => (await fetch('/api/auth/me', { cache: 'no-store' })).status), 'session after login').toBe(200);
    await otherPage.goto(`/photos/${id}`);
    expect(await otherPage.evaluate(async () => (await fetch('/api/auth/me', { cache: 'no-store' })).status), 'session after reload').toBe(200);
    await expect(otherPage.getByRole('button', { name: 'Xóa ảnh', exact: true })).toHaveCount(0);
    expect(await guardedDelete(otherPage, id)).toBe(403);
    await page.goto(`/photos/${id}`);
    await page.reload();
    await page.getByRole('button', { name: 'Xóa ảnh', exact: true }).click();
    await page.getByRole('button', { name: 'Hủy', exact: true }).click();
    expect((await page.request.get(`/api/photos/${id}`)).status()).toBe(200);
    await page.getByRole('button', { name: 'Xóa ảnh', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận xóa' }).click();
    await expect(page).toHaveURL(/\/photos$/);
    expect((await guest.request.get(`/api/photos/${id}`)).status()).toBe(404);
    expect((await guest.request.get(`${uploaded[0].variants[0].url}?origin-check=${run}`, { headers: { 'Cache-Control': 'no-cache' } })).status()).toBe(404);
    created.splice(created.indexOf(id), 1);
    const loggedOut = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/logout' && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    expect((await loggedOut).status()).toBe(204);
    await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true })).toBeVisible();
    await page.goto('/photos/upload');
    await expect(page).toHaveURL(/\/login\?returnTo=/);
  } finally {
    // Best-effort owner cleanup; account deletion is outside the contract.
    try {
      if (created.length) {
        await login(page, ownerEmail, password);
        for (const id of created) {
          const status = await guardedDelete(page, id);
          expect([204, 202, 404]).toContain(status);
        }
      }
    } finally { await otherContext.close(); await guestContext.close(); }
  }
});

test(`${controlled ? 'CONTROLLED A+B+C' : 'LIVE'}: EXIF comparison uses raw pixels and real normalized server WebP`, async ({ page }) => {
  test.setTimeout(controlled ? 120_000 : 240_000);
  const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Exif!${run}`;
  const email = `exif-comparison-${run}@example.test`;
  let photoId: string | undefined;
  try {
    await register(page, email, password, `EXIF demo ${run}`);
    await login(page, email, password);
    await page.getByLabel('Chọn ảnh', { exact: true }).setInputFiles(fileURLToPath(new URL('../../docs/demo-assets/exif-gps/test-sideways-orientation6-gps.jpg', import.meta.url)));
    const comparison = page.getByRole('region', { name: 'So sánh ảnh test-sideways-orientation6-gps.jpg' });
    const before = comparison.getByAltText('Xem trước test-sideways-orientation6-gps.jpg');
    await expect(before).toHaveJSProperty('naturalWidth', 600);
    await expect(before).toHaveJSProperty('naturalHeight', 1000);
    await expect(comparison).toContainText('Có EXIF · Có GPS');
    await expect(comparison.locator('.comparison-ready')).toHaveCount(0);
    await page.getByLabel('Tiêu đề ảnh 1', { exact: true }).fill(`EXIF comparison ${run}`);
    await page.getByLabel('Mô tả thay thế ảnh 1', { exact: true }).fill('Mũi tên hướng lên sau khi áp dụng Orientation 6');
    const uploaded = page.waitForResponse(r => new URL(r.url()).pathname === '/api/photos' && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Đăng 1 ảnh', exact: true }).click();
    const response = await uploaded;
    expect(response.status()).toBe(200);
    const data = (await response.json()).data;
    for (const item of data.results) if (item.ok) photoId = item.photo.id;
    expect(data.succeeded).toBe(1);
    const photo = data.results[0].photo;
    expect(photo.width).toBe(1000); expect(photo.height).toBe(600);
    const largest = photo.variants.at(-1);
    const after = comparison.getByAltText('Ảnh đã chuẩn hóa test-sideways-orientation6-gps.jpg');
    await expect(after).toHaveAttribute('src', largest.url);
    await expect(after).toHaveJSProperty('naturalWidth', 1000);
    await expect(after).toHaveJSProperty('naturalHeight', 600);
    const media = await page.request.get(largest.url);
    expect(media.status()).toBe(200);
    const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
    const sharp = requireApi('sharp') as typeof import('../../api/node_modules/sharp/lib/index.js');
    const metadata = await sharp(await media.body()).metadata();
    expect(metadata.format).toBe('webp'); expect(metadata.exif).toBeUndefined(); expect(metadata.orientation).toBeUndefined();
    if (controlled) {
      const folder = path.resolve('../docs/evidence/exif-comparison'); await mkdir(folder, { recursive: true });
      await comparison.screenshot({ path: path.join(folder, 'before-after-controlled-api.png') });
    }
  } finally {
    if (photoId) expect([204, 202, 404]).toContain(await guardedDelete(page, photoId));
  }
});
