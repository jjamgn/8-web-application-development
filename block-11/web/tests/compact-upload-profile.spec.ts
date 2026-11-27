import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { mockApi, owner, png } from './mock-api';

const evidence = fileURLToPath(new URL('../../docs/evidence/compact-upload-profile/', import.meta.url));

test('comparison is lazy and collapsed by default, required fields are marked, and comparison can open after upload', async ({ page }) => {
  await mockApi(page, { user: owner }); await page.goto('/photos/upload');
  await page.getByLabel('Chọn ảnh', { exact: true }).setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.comparison-grid')).toHaveCount(0);
  await expect(page.locator('label .required-marker')).toHaveCount(2);
  await expect(page.getByLabel('Tiêu đề ảnh 1', { exact: true })).toHaveAttribute('required', '');
  await expect(page.getByLabel('Mô tả thay thế ảnh 1', { exact: true })).toHaveAttribute('required', '');
  await page.getByLabel('Tiêu đề ảnh 1', { exact: true }).fill('Title');
  await page.getByLabel('Mô tả thay thế ảnh 1', { exact: true }).fill('Alt');
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: evidence + 'upload-collapsed.png', fullPage: true });
  await page.getByRole('button', { name: 'Đăng 1 ảnh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kết quả từng ảnh' })).toBeVisible();
  await expect(page.locator('.comparison-grid')).toHaveCount(0);
  await page.getByText('Xem so sánh trước/sau xử lý', { exact: true }).click();
  await expect(page.getByAltText('Xem trước test.png')).toBeVisible();
  await expect(page.getByAltText('Ảnh đã chuẩn hóa test.png')).toBeVisible();
  await page.getByText('Ẩn so sánh trước/sau xử lý', { exact: true }).click();
  await expect(page.locator('.comparison-grid')).toHaveCount(0);
});

test('avatar picker is next to edit button and choosing avatar opens the editor for save', async ({ page }) => {
  const state = await mockApi(page, { user: owner }); await page.goto('/profile');
  const picker = page.getByRole('button', { name: 'Tải avatar mới' });
  const edit = page.getByRole('button', { name: 'Chỉnh sửa hồ sơ', exact: true });
  await expect(picker).toBeVisible();
  const a = (await picker.boundingBox())!, b = (await edit.boundingBox())!;
  expect(Math.abs(a.y - b.y)).toBeLessThan(5); expect(a.x).toBeLessThan(b.x);
  await page.getByLabel('Chọn avatar').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('button', { name: 'Lưu thay đổi' })).toBeVisible();
  await expect(page.getByAltText('Xem trước avatar mới')).toBeVisible();
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: evidence + 'profile-avatar-picker.png', fullPage: true });
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByAltText('Ảnh đại diện ' + owner.name)).toBeVisible();
  expect(state.writes.filter(r => new URL(r.url()).pathname === '/api/me/avatar')).toHaveLength(1);
});
