import { expect, test } from '@playwright/test';
import { chooseFiles, mockApi, owner, png } from './mock-api';

test('khách upload chuyển login, đăng ký không tự login, đăng nhập xoay CSRF và logout', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/photos/upload');
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await page.getByRole('link', { name: 'Đăng ký', exact: true }).click();
  await page.getByLabel('Tên hiển thị').fill('Linh Nguyễn');
  await page.getByLabel('Email', { exact: true }).fill('Linh@Example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Password!123');
  await page.getByLabel('Xác nhận mật khẩu').fill('Password!123');
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('status')).toContainText('Đăng ký thành công');
  expect(state.user).toBeNull();
  await page.getByLabel('Email', { exact: true }).fill('linh@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Password!123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/photos\/upload$/);
  await expect(page.locator('.current-user')).toHaveText(owner.name);
  await chooseFiles(page);
  await page.getByRole('button', { name: 'Đăng 1 ảnh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kết quả từng ảnh' })).toBeVisible();
  const upload = state.writes.find(r => new URL(r.url()).pathname === '/api/photos')!;
  expect(upload.headers()['x-csrf-token']).toBe('rotated-csrf');
  expect(upload.headers()['content-type']).toMatch(/^multipart\/form-data; boundary=/);
  expect(upload.postDataBuffer()!.toString()).toContain('name="metadata"');
  expect(upload.postDataBuffer()!.toString()).not.toContain('uploaderId');
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true })).toBeVisible();
  expect(state.user).toBeNull();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test('returnTo bên ngoài bị loại', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login?returnTo=https://example.com');
  await page.getByLabel('Email', { exact: true }).fill('linh@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Password!123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/photos$/);
});

test('me trả 401 muộn không ghi đè phiên login mới', async ({ page }) => {
  await mockApi(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth/me', async route => {
    await gate;
    return route.fulfill({ status: 401, json: { ok: false, error: { code: 'AUTH_REQUIRED', message: 'Guest' } } });
  });
  await page.goto('/login?returnTo=/photos/upload');
  await page.getByLabel('Email', { exact: true }).fill('linh@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Password!123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/photos\/upload$/);
  await expect(page.getByRole('heading', { name: 'Thêm một khoảnh khắc.' })).toBeVisible();
  const oldMe = page.waitForResponse('**/api/auth/me');
  release();
  await (await oldMe).finished();
  await expect(page.locator('.current-user')).toHaveText(owner.name);
  await expect(page.getByRole('heading', { name: 'Thêm một khoảnh khắc.' })).toBeVisible();
});

for (const status of [401, 403, 429]) {
  test(`login báo lỗi HTTP ${status}, cho sửa form và không tự retry`, async ({ page }) => {
    await mockApi(page);
    let attempts = 0;
    await page.route('**/api/auth/login', route => {
      attempts++;
      return route.fulfill({ status, headers: status === 429 ? { 'Retry-After': '60' } : {},
        json: { ok: false, error: { code: status === 401 ? 'INVALID_CREDENTIALS' : status === 403 ? 'CSRF_INVALID' : 'RATE_LIMITED', message: 'Đăng nhập thất bại.' } } });
    });
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill('linh@example.test');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('Password!123');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(status === 429 ? '60 giây' : 'Đăng nhập thất bại');
    await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeEnabled();
    expect(attempts).toBe(1);
  });
}

test('đăng ký kiểm tra mật khẩu UTF-8 và xác nhận', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/register');
  await page.getByLabel('Tên hiển thị').fill('Linh');
  await page.getByLabel('Email', { exact: true }).fill('linh@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('😀'.repeat(19));
  await page.getByLabel('Xác nhận mật khẩu').fill('😀'.repeat(19));
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('alert')).toContainText('72 bytes');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Password!123');
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('alert')).toContainText('chưa khớp');
  expect(state.writes).toHaveLength(0);
});

test('upload hỗn hợp giữ thứ tự metadata, khóa gửi và không retry ảnh thành công', async ({ page }) => {
  const state = await mockApi(page, { user: owner, uploadDelay: 300 });
  await page.goto('/photos/upload');
  await chooseFiles(page, 2);
  await page.getByLabel('Tiêu đề ảnh 1', { exact: true }).fill('😀'.repeat(120));
  await page.getByRole('button', { name: 'Đăng 2 ảnh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đang gửi và xử lý ảnh…' })).toBeDisabled();
  await expect(page.getByRole('status').last()).toContainText('1 ảnh thành công · 1 ảnh không thành công');
  await expect(page.locator('.upload-results li')).toHaveCount(2);
  await expect(page.locator('.upload-results li').nth(1)).toContainText('INVALID_IMAGE');
  expect(state.writes.filter(r => new URL(r.url()).pathname === '/api/photos')).toHaveLength(1);
  const raw = state.writes[0].postDataBuffer()!.toString();
  expect(raw).toContain(JSON.stringify([{ title: '😀'.repeat(120), alt: 'Mô tả ảnh 1' }, { title: 'Ảnh 2', alt: 'Mô tả ảnh 2' }]));
  await expect(page.getByRole('button', { name: 'Đăng 2 ảnh', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Tạo lượt gửi mới' }).click();
  await expect(page.locator('.upload-entry')).toHaveCount(0);
});

for (const mode of ['all-failed', 'request-error', 'network-error', 'expired'] as const) {
  test(`upload hiển thị đúng lỗi ${mode}, không tự retry`, async ({ page }) => {
    const state = await mockApi(page, { user: owner, uploadMode: mode });
    await page.goto('/photos/upload');
    await chooseFiles(page);
    await page.getByRole('button', { name: 'Đăng 1 ảnh', exact: true }).click();
    if (mode === 'all-failed') await expect(page.locator('.upload-results')).toContainText('0 ảnh thành công · 1 ảnh không thành công');
    else await expect(page.getByRole('alert')).toBeVisible();
    if (mode === 'expired') await expect(page.getByRole('link', { name: 'Đăng nhập lại', exact: true })).toBeVisible();
    expect(state.writes.filter(r => new URL(r.url()).pathname === '/api/photos')).toHaveLength(1);
    await expect(page.getByRole('button', { name: 'Đăng 1 ảnh', exact: true })).toBeDisabled();
  });
}

test('cảnh báo số lượng, bytes và Unicode trước gửi', async ({ page }) => {
  const state = await mockApi(page, { user: owner });
  await page.goto('/photos/upload');
  await page.getByLabel('Chọn ảnh', { exact: true }).setInputFiles(Array.from({ length: 6 }, (_, i) => ({ name: `${i}.png`, mimeType: 'image/png', buffer: png })));
  await expect(page.getByRole('alert')).toContainText('1 đến 5');
  await chooseFiles(page);
  await page.getByLabel('Tiêu đề ảnh 1', { exact: true }).fill('😀'.repeat(121));
  await page.getByRole('button', { name: 'Đăng 1 ảnh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('1–120');
  await page.getByLabel('Chọn ảnh', { exact: true }).setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(10_485_761) });
  await page.getByLabel('Tiêu đề ảnh 1', { exact: true }).fill('Large');
  await page.getByLabel('Mô tả thay thế ảnh 1', { exact: true }).fill('Large');
  await page.getByRole('button', { name: 'Đăng 1 ảnh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('10 MiB');
  expect(state.writes).toHaveLength(0);
});
