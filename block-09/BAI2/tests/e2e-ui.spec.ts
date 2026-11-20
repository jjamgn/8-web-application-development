import { test, expect } from '@playwright/test';
import * as OTPAuth from 'otpauth';

const baseUrl = process.env.BAI2_E2E_URL;
const editorEmail = process.env.BAI2_E2E_EDITOR_EMAIL;
const editorPassword = process.env.BAI2_E2E_EDITOR_PASSWORD;
const editorSecret = process.env.BAI2_E2E_EDITOR_TOTP_SECRET;
test.skip(!baseUrl, 'Set BAI2_E2E_URL to the running SSR app.');

test('guest can still open the public menu and search', async ({ page }) => {
  await page.goto(`${baseUrl}/dishes`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Thực đơn', exact: true }).first()).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Tìm món ăn theo tên' });
  await search.fill('phở');
  await page.getByRole('button', { name: 'Tìm món' }).click();
  await expect(page).toHaveURL(/\/dishes\?.*q=/);
});

test.describe('enrolled editor', () => {
test.skip(!editorEmail || !editorPassword || !editorSecret,
  'Set the BAI2_E2E_EDITOR_* credentials for an enrolled demo editor.');
test('editor MFA remains pending until TOTP and then sees only allowed actions', async ({ page }) => {
  await page.goto(`${baseUrl}/auth/login`);
  await page.getByLabel('Địa chỉ email').fill(editorEmail!);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(editorPassword!);
  await page.getByRole('button', { name: 'Vào trang quản trị' }).click();
  await expect(page).toHaveURL(/\/auth\/mfa$/);
  await page.goto(`${baseUrl}/admin/dishes`);
  await expect(page, 'a pending session must not enter admin').toHaveURL(/\/auth\/mfa$/);
  const code = new OTPAuth.TOTP({ issuer: 'Bếp Nhà', label: editorEmail!, algorithm: 'SHA1', digits: 6,
    period: 30, secret: OTPAuth.Secret.fromBase32(editorSecret!) }).generate();
  await page.getByLabel('Mã xác minh').fill(code);
  await page.getByRole('button', { name: 'Xác minh và tiếp tục' }).click();
  await expect(page).toHaveURL(/\/admin\/dishes(?:\?.*)?$/);
  await expect(page.getByRole('link', { name: /Thêm món ăn/ })).toBeVisible();
  await expect(page.locator('a[href$="/delete"]')).toHaveCount(0);
  await page.goto(`${baseUrl}/auth/account`);
  await expect(page.getByRole('link', { name: 'Cài đặt xác minh hai bước' })).toBeVisible();
});
});
