import { expect, test } from '@playwright/test';
import { mockApi, owner, photo } from './mock-api';

test('khách xem gallery, tên người đăng và detail; reload deep link', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/photos$/);
  await expect(page.locator('.photo-card')).toHaveCount(3);
  await expect(page.locator('.photo-card').first()).toContainText(owner.name);
  await page.locator('.photo-link').first().click();
  await page.reload();
  await expect(page.getByRole('heading', { name: photo(1).title, exact: true })).toBeVisible();
  const image = page.locator('.detail-image img');
  await expect(image).toHaveAttribute('loading', 'eager');
  await expect(image).toHaveAttribute('fetchpriority', 'high');
  await expect(image).toHaveAttribute('sizes', /1200px/);
  await expect(page.getByRole('button', { name: 'Xóa ảnh', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test('lỗi me không ngăn khách xem ảnh công khai', async ({ page }) => {
  await mockApi(page, { meError: true });
  await page.goto('/photos');
  await expect(page.locator('.photo-card')).toHaveCount(3);
});

test('gallery rỗng, phân trang và trang vượt cuối', async ({ page }) => {
  const state = await mockApi(page, { photos: [], total: 0 });
  await page.goto('/photos');
  await expect(page.getByRole('heading', { name: 'Thư viện đang chờ khoảnh khắc đầu tiên' })).toBeVisible();
  state.photos = Array.from({ length: 12 }, (_, i) => photo(i + 1)); state.total = 13;
  await page.reload();
  await expect(page.locator('.photo-card')).toHaveCount(12);
  await page.getByRole('link', { name: 'Trang sau' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole('heading', { name: 'Trang này chưa có ảnh' })).toBeVisible();
  await page.getByRole('link', { name: 'Trang trước' }).click();
  await expect(page.locator('.photo-card')).toHaveCount(12);
});

test('lỗi tải có thể thử lại, query sai và 404', async ({ page }) => {
  const state = await mockApi(page, { listError: true });
  await page.goto('/photos');
  await expect(page.getByRole('alert')).toContainText('Không tải được');
  state.listError = false;
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.locator('.photo-card')).toHaveCount(3);
  await page.goto('/photos?page=0');
  await expect(page.getByRole('alert')).toContainText('số nguyên dương');
  await page.goto('/photos/missing');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
  await page.goto('/missing');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
});

for (const status of [204, 202] as const) {
  test(`chủ ảnh hủy xóa không gửi DELETE; xác nhận ${status}`, async ({ page }) => {
    const state = await mockApi(page, { user: owner, deleteStatus: status });
    await page.goto(`/photos/${photo(1).id}`);
    await page.getByRole('button', { name: 'Xóa ảnh', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hủy', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    expect(state.writes).toHaveLength(0);
    await page.getByRole('button', { name: 'Xóa ảnh', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận xóa' }).click();
    await expect(page).toHaveURL(/\/photos$/);
    await expect(page.getByRole('status').filter({ hasText: status === 202 ? 'đang chờ dọn' : 'dọn dữ liệu thành công' })).toBeVisible();
    expect(state.writes.filter(r => r.method() === 'DELETE')).toHaveLength(1);
  });
}

test('người khác không thấy nút xóa; lỗi 403 không báo thành công', async ({ page }) => {
  const state = await mockApi(page, { user: owner, deleteStatus: 403 });
  await page.goto(`/photos/${photo(2).id}`);
  await expect(page.getByRole('heading', { name: photo(2).title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xóa ảnh', exact: true })).toHaveCount(0);
  await page.goto(`/photos/${photo(1).id}`);
  await page.getByRole('button', { name: 'Xóa ảnh', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa' }).click();
  await expect(page.getByRole('alert')).toContainText('không sở hữu');
  expect(state.photos).toHaveLength(3);
});
