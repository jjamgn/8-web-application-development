import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.FRONTEND_URL || 'http://localhost:5173';
const evidence = fileURLToPath(new URL('../../docs/evidence/', import.meta.url));
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const user = { id: 1, name: 'Người dùng Demo', email: 'profile@example.test', role: 'viewer' };
const errors = [];
let passwordCalls = 0, logoutCalls = 0, nameCalls = 0;
const profileRequests = [];
async function mock(context, authenticated) {
  let changed = false;
  let profileUser = { ...user };
  await context.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const headers = { 'access-control-allow-origin': base, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS', 'access-control-allow-headers': 'Content-Type,Authorization,X-CSRF-Token' };
    const json = (body, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    const ok = data => json({ ok: true, data });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path.endsWith('/csrf')) return authenticated ? ok({ csrfToken: 'csrf-old' }) : json({ ok: false, error: { code: 'INVALID_REFRESH_TOKEN' } }, 401);
    if (path.endsWith('/refresh')) return ok({ accessToken: 'access-old', csrfToken: 'csrf-old', user: profileUser, expiresIn: 600 });
    if (path.endsWith('/me') && req.method() === 'PATCH') {
      nameCalls++;
      assert.equal(req.headers().authorization, 'Bearer access-old');
      assert.equal(req.headers()['x-csrf-token'], 'csrf-old');
      profileUser = { ...profileUser, name: req.postDataJSON().name.trim() };
      return ok(profileUser);
    }
    if (path.endsWith('/me')) { profileRequests.push(req.headers().authorization); return ok(profileUser); }
    if (path.endsWith('/change-password')) {
      passwordCalls++;
      const body = req.postDataJSON();
      assert.equal(req.headers().authorization, 'Bearer access-old');
      assert.equal(req.headers()['x-csrf-token'], 'csrf-old');
      if (body.currentPassword !== 'correct-password') return json({ ok: false, error: { code: 'CURRENT_PASSWORD_INVALID', message: 'Mật khẩu hiện tại chưa đúng.', fields: { currentPassword: 'Mật khẩu hiện tại chưa đúng.' } } });
      changed = true;
      return ok({ accessToken: 'access-new', csrfToken: 'csrf-new', user: profileUser, expiresIn: 600 });
    }
    if (path.endsWith('/logout')) {
      logoutCalls++;
      assert.equal(req.headers()['x-csrf-token'], changed ? 'csrf-new' : 'csrf-old');
      return ok(null);
    }
    return ok([]);
  });
}
try {
  const guest = await browser.newContext();
  await mock(guest, false);
  const guestPage = await guest.newPage();
  await guestPage.goto(base + '/#/profile');
  await guestPage.waitForURL('**/#/login');
  await guest.close();

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await mock(context, true);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/#/dishes');
  await page.getByRole('link', { name: user.name, exact: true }).click();
  await page.waitForURL('**/#/profile');
  await page.getByRole('heading', { name: 'Hồ sơ của bạn' }).waitFor();
  assert.equal(await page.locator('.profile-details dd').nth(1).textContent(), user.email);
  await page.getByRole('button', { name: 'Chỉnh sửa tên', exact: true }).click();
  const name = page.getByLabel('Họ và tên', { exact: true });
  await name.fill('   ');
  await page.getByRole('button', { name: 'Lưu tên', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Vui lòng nhập họ và tên.' }).waitFor();
  assert.equal(nameCalls, 0);
  await name.fill('Tên chưa lưu');
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  assert.equal(await page.locator('#profile-info-title').textContent(), user.name);
  await page.getByRole('button', { name: 'Chỉnh sửa tên', exact: true }).click();
  assert.equal(await page.getByLabel('Họ và tên', { exact: true }).inputValue(), user.name);
  await page.getByLabel('Họ và tên', { exact: true }).fill('  Tên Demo Mới  ');
  await page.getByRole('button', { name: 'Lưu tên', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Đã cập nhật họ tên.' }).waitFor();
  assert.equal(nameCalls, 1);
  assert.equal(await page.locator('#profile-info-title').textContent(), 'Tên Demo Mới');
  assert.equal(await page.locator('.profile-avatar').textContent(), 'DM');
  await page.getByRole('link', { name: 'Tên Demo Mới', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Tên Demo Mới', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Tên Demo Mới', exact: true }).waitFor();
  const current = page.locator('#profile-current-password');
  const password = page.locator('#profile-new-password');
  const confirm = page.locator('#profile-confirm-password');
  await current.fill('incorrect-password');
  await password.fill('new-password-test');
  await confirm.fill('new-password-test');
  await page.getByRole('button', { name: 'Cập nhật mật khẩu', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Mật khẩu hiện tại chưa đúng.' }).waitFor();
  await current.fill('correct-password');
  await confirm.fill('different-password');
  await page.getByRole('button', { name: 'Cập nhật mật khẩu', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Mật khẩu xác nhận chưa khớp.' }).waitFor();
  assert.equal(passwordCalls, 1);
  await confirm.fill('new-password-test');
  await page.getByLabel('Hiện mật khẩu').check();
  assert.equal(await password.getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'Cập nhật mật khẩu', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Đã đổi mật khẩu.' }).waitFor();
  assert.ok(page.url().endsWith('/#/profile'));
  assert.equal(await current.inputValue(), '');
  assert.equal(await password.inputValue(), '');
  assert.equal(await confirm.inputValue(), '');
  assert.equal(await password.getAttribute('type'), 'password');
  assert.equal(passwordCalls, 2);
  await page.evaluate(async () => { const api = await import('/src/lib/api.ts'); await api.request('auth/me'); });
  assert.equal(profileRequests.at(-1), 'Bearer access-new');
  await page.screenshot({ path: evidence + 'profile-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: evidence + 'profile-mobile.png', fullPage: true });
  await page.locator('.profile-actions').getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await page.waitForURL('**/#/login');
  assert.equal(logoutCalls, 1);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Profile smoke passed: guest guard, name edit/trim/validation/cancel, immediate header/avatar update and persistence after reload, old-password error, confirmation validation, replacement session, desktop/mobile and logout. API mocked; real account data unchanged.');
} finally { await browser.close(); }
