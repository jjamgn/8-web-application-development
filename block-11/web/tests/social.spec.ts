import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { mockApi, owner, other, photo, png } from './mock-api';

test('search backend query, modal URL, Esc and direct link', async ({ page }) => {
  await mockApi(page);
  await page.goto('/photos');
  await page.getByRole('searchbox', { name: 'Tìm ảnh' }).fill('nhiều nắng');
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await expect(page.locator('.photo-card')).toHaveCount(1);
  const card = page.locator('.photo-link').first();
  await card.click();
  const dialog = page.getByRole('dialog', { name: 'Chi tiết ảnh', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/photos\/mot-ngay-nhieu-nang\/[0-9a-f-]+$/);
  await expect(dialog.getByRole('heading', { level: 1 })).toHaveText(photo(2).title);
  await mkdir(fileURLToPath(new URL('../../docs/evidence/social-profile/', import.meta.url)), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../../docs/evidence/social-profile/modal-desktop.png', import.meta.url)), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/q=/);
  await expect(page.locator('.photo-card')).toHaveCount(1);
  await card.click(); await page.reload();
  await expect(page.getByRole('dialog', { name: 'Chi tiết ảnh', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(photo(2).title);
});

test('public author profile, follow/unfollow and following feed', async ({ page }) => {
  const state = await mockApi(page, { user: owner });
  await page.goto('/users/' + other.id);
  await page.getByRole('button', { name: 'Theo dõi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bỏ theo dõi', exact: true })).toBeVisible();
  expect(state.following).toEqual([other.id]);
  await page.goto('/following');
  await expect(page.locator('.photo-card')).toHaveCount(1);
  await page.locator('.card-author').click();
  await page.getByRole('button', { name: 'Bỏ theo dõi', exact: true }).click();
  await expect.poll(() => state.following).toEqual([]);
  await page.goto('/following');
  await expect(page.getByRole('heading', { name: 'Chưa có ảnh từ người bạn theo dõi' })).toBeVisible();
});

test('favorite persists into private profile tab and can be removed', async ({ page }) => {
  const state = await mockApi(page, { user: owner });
  await page.goto('/photos');
  await page.locator('.photo-card').first().getByRole('button', { name: 'Yêu thích', exact: true }).click();
  await expect(page.locator('.photo-card').first().getByRole('button', { name: 'Bỏ yêu thích', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/profile?tab=favorites');
  await expect(page.locator('.photo-card')).toHaveCount(1);
  await page.locator('.photo-card').getByRole('button', { name: 'Bỏ yêu thích', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bạn chưa yêu thích ảnh nào' })).toBeVisible();
  expect(state.favorites).toHaveLength(0);
});

test('create collection in save dialog, rename, remove item and delete collection', async ({ page }) => {
  const state = await mockApi(page, { user: owner });
  await page.goto('/photos');
  await page.locator('.photo-card').first().getByRole('button', { name: 'Lưu', exact: false }).click();
  const dialog = page.getByRole('dialog', { name: 'Lưu vào bộ sưu tập', exact: true });
  await dialog.getByLabel('Tên bộ sưu tập mới').fill('Ý tưởng');
  await dialog.getByRole('button', { name: 'Tạo và lưu ảnh' }).click();
  await expect(dialog).not.toBeVisible();
  expect(state.collections[0].count).toBe(1);
  await page.goto('/profile?tab=collections');
  await page.getByRole('button', { name: 'Đổi tên' }).click();
  await page.getByLabel('Tên mới').fill('Cảm hứng');
  await page.getByRole('button', { name: 'Lưu tên' }).click();
  await page.getByRole('link', { name: 'Cảm hứng', exact: true }).click();
  await expect(page.locator('.photo-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Gỡ khỏi bộ' }).click();
  await expect(page.locator('.photo-card')).toHaveCount(0);
  await page.getByRole('link', { name: 'Bộ sưu tập', exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: 'Xóa bộ', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Bạn chưa có bộ sưu tập');
  expect(state.photos).toHaveLength(3);
});

test('edit name/bio/avatar, display uploaded avatar on profile and header, responsive', async ({ page }) => {
  const state = await mockApi(page, { user: owner });
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Chỉnh sửa hồ sơ' }).click();
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Linh mới');
  await page.getByLabel('Giới thiệu', { exact: true }).fill('Góc nhìn của tôi');
  await page.getByLabel('Chọn avatar').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByAltText('Xem trước avatar mới')).toBeVisible();
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Linh mới');
  await expect(page.getByAltText('Ảnh đại diện Linh mới')).toBeVisible();
  await expect(page.locator('.header-avatar')).toBeVisible();
  expect(state.bio).toBe('Góc nhìn của tôi');
  await mkdir(fileURLToPath(new URL('../../docs/evidence/social-profile/', import.meta.url)), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../../docs/evidence/social-profile/profile-desktop.png', import.meta.url)), fullPage: true });
  await page.setViewportSize({ width: 375, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await page.getByRole('heading', { level: 1 }).boundingBox())!.width).toBeGreaterThan(200);
  await page.screenshot({ path: fileURLToPath(new URL('../../docs/evidence/social-profile/profile-mobile.png', import.meta.url)), fullPage: true });
});

test('download selector uses existing WebP variants and old UUID URL redirects', async ({ page }) => {
  await mockApi(page);
  await page.goto('/photos/' + photo(1).id);
  await expect(page).toHaveURL(/\/photos\/binh-yen-ben-suon-nui\//);
  await page.getByLabel('Kích thước tải xuống').selectOption('320');
  await expect(page.locator('.detail-actions a[download]')).toHaveAttribute('href', photo(1).variants[0].url + '?download=1');
});
