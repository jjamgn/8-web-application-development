import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mockApi, owner, photo } from './mock-api';

const fixture = fileURLToPath(new URL('../../docs/demo-assets/exif-gps/test-sideways-orientation6-gps.jpg', import.meta.url));
const expected = fileURLToPath(new URL('../../docs/demo-assets/exif-gps/expected-after-upload.webp', import.meta.url));

test('EXIF preview shows stored sideways pixels, uploads original bytes and only then displays server WebP', async ({ page }) => {
  const state = await mockApi(page, { user: owner });
  const bytes = await readFile(fixture), webp = await readFile(expected);
  await page.addInitScript(() => {
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (init?.body instanceof FormData && init.method === 'POST') {
        const file = init.body.get('photos');
        if (file instanceof Blob) {
          const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
          (window as Window & { uploadedFileHash?: string }).uploadedFileHash = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
        }
      }
      return fetchOriginal(input, init);
    };
  });
  let uploads = 0;
  const saved = { ...photo(1), width: 1000, height: 600, variants: [{ width: 1000, height: 600, mime: 'image/webp' as const, bytes: webp.length, url: '/media/photos/exif-test/1000.webp' }] };
  await page.route('**/api/photos', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    uploads++;
    return route.fulfill({ json: { ok: true, data: { results: [{ index: 0, ok: true, photo: saved }], succeeded: 1, failed: 0 } } });
  });
  await page.route('**/media/photos/exif-test/1000.webp', route => route.fulfill({ contentType: 'image/webp', body: webp }));
  await page.goto('/photos/upload');
  await page.getByLabel('Chọn ảnh', { exact: true }).setInputFiles(fixture);
  await page.getByText('Xem so sánh trước/sau xử lý', { exact: true }).first().click();
  const comparison = page.getByRole('region', { name: 'So sánh ảnh test-sideways-orientation6-gps.jpg' });
  const before = comparison.getByAltText('Xem trước test-sideways-orientation6-gps.jpg');
  await expect(before).toHaveJSProperty('naturalWidth', 600);
  await expect(before).toHaveJSProperty('naturalHeight', 1000);
  await expect(comparison).toContainText('600 × 1000');
  await expect(comparison).toContainText('6 · xoay 90° theo chiều kim đồng hồ');
  await expect(comparison).toContainText('Có EXIF · Có GPS');
  await expect(comparison.locator('.comparison-ready')).toHaveCount(0);
  expect(uploads).toBe(0);
  await page.getByLabel('Tiêu đề ảnh 1', { exact: true }).fill('Demo EXIF');
  await page.getByLabel('Mô tả thay thế ảnh 1', { exact: true }).fill('Mũi tên hướng lên sau khi chuẩn hóa');
  await page.getByRole('button', { name: 'Đăng 1 ảnh', exact: true }).click();
  const after = comparison.getByAltText('Ảnh đã chuẩn hóa test-sideways-orientation6-gps.jpg');
  await expect(after).toHaveAttribute('src', saved.variants[0]!.url);
  await expect(after).toHaveJSProperty('naturalWidth', 1000);
  await expect(after).toHaveJSProperty('naturalHeight', 600);
  await expect(comparison).toContainText('1000 × 600');
  expect(uploads).toBe(1);
  expect(await page.evaluate(() => (window as Window & { uploadedFileHash?: string }).uploadedFileHash)).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(state.writes.filter(r => new URL(r.url()).pathname === '/api/photos')).toHaveLength(0); // handled by the override, exactly once above
  const folder = path.resolve('../docs/evidence/exif-comparison');
  await mkdir(folder, { recursive: true });
  await comparison.screenshot({ path: path.join(folder, 'before-after-exif.png') });
});

test('a sideways PNG without EXIF stays sideways in the raw preview, and mobile does not overflow', async ({ page }) => {
  await mockApi(page, { user: owner });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/photos/upload');
  await page.getByLabel('Chọn ảnh', { exact: true }).setInputFiles(fileURLToPath(new URL('../../docs/demo-assets/exif-gps/raw-pixels-before-exif.png', import.meta.url)));
  await page.getByText('Xem so sánh trước/sau xử lý', { exact: true }).first().click();
  const before = page.getByAltText('Xem trước raw-pixels-before-exif.png');
  await expect(before).toHaveJSProperty('naturalWidth', 600);
  await expect(before).toHaveJSProperty('naturalHeight', 1000);
  await expect(page.locator('.comparison-metadata')).toContainText('Không có EXIF · Không có GPS');
  await expect(page.locator('.comparison-ready')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
