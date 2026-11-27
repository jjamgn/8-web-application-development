import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { mockApi, owner, photo, png } from './mock-api';

test('skeleton lần đầu, tải thêm lỗi không mất ảnh và có thể thử lại', async ({ page }) => {
  const state = await mockApi(page, { photos: Array.from({ length: 24 }, (_, i) => photo(i + 1)), total: 24 });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/photos?page=1', async route => { await gate; await route.fallback(); });
  await page.goto('/photos');
  await expect(page.getByRole('status', { name: 'Đang tải ảnh' })).toBeVisible();
  release();
  await expect(page.locator('.photo-card')).toHaveCount(12);
  state.listError = true;
  await page.getByRole('button', { name: 'Xem thêm ảnh' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.photo-card')).toHaveCount(12);
  state.listError = false;
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.locator('.photo-card')).toHaveCount(24);
});

test('hồ sơ lấy đúng ảnh của người dùng và khách được chuyển đăng nhập', async ({ page }) => {
  await mockApi(page, { user: owner });
  await page.goto('/photos');
  await page.getByRole('link', { name: owner.name, exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: owner.name, exact: true })).toBeVisible();
  await expect(page.locator('.photo-card')).toHaveCount(2);
  await mkdir('../docs/evidence/feed-upload-profile', { recursive: true });
  await page.screenshot({ path: '../docs/evidence/feed-upload-profile/profile.png', fullPage: true });
  await page.locator('.photo-link').first().click();
  await page.getByRole('link', { name: 'Về hồ sơ' }).click();
  await expect(page.locator('.photo-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login$/);
});

test('kéo thả giữ file gốc, nhập metadata và chặn quá 5 ảnh', async ({ page }) => {
  await mockApi(page, { user: owner });
  await page.goto('/photos/upload');
  await mkdir('../docs/evidence/feed-upload-profile', { recursive: true });
  await page.screenshot({ path: '../docs/evidence/feed-upload-profile/upload-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../docs/evidence/feed-upload-profile/upload-mobile.png', fullPage: true });
  const drop = async (count: number) => {
    const transfer = await page.evaluateHandle(({ bytes, count }) => {
      const data = new DataTransfer();
      for (let i = 0; i < count; i++) data.items.add(new File([new Uint8Array(bytes)], 'drop-' + i + '.png', { type: 'image/png' }));
      return data;
    }, { bytes: [...png], count });
    await page.getByTestId('upload-dropzone').dispatchEvent('drop', { dataTransfer: transfer });
    await transfer.dispose();
  };
  await drop(2);
  await expect(page.locator('.upload-entry')).toHaveCount(2);
  await expect(page.getByAltText('Xem trước drop-0.png')).toBeVisible();
  await page.getByLabel('Tiêu đề ảnh 1', { exact: true }).fill('Ảnh kéo thả');
  await expect(page.getByLabel('Tiêu đề ảnh 1', { exact: true })).toHaveValue('Ảnh kéo thả');
  await drop(6);
  await expect(page.getByRole('alert')).toContainText('1 đến 5 ảnh');
  await expect(page.locator('.upload-entry')).toHaveCount(0);
});
