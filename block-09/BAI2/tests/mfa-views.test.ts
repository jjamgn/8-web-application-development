import test from 'node:test';
import assert from 'node:assert/strict';
import ejs from 'ejs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const views = fileURLToPath(new URL('../views/', import.meta.url));
const csrf = 'a'.repeat(64);
const user = (role: string, chefId: number | null = null) => ({ id: 7, name: 'Minh', email: 'minh@example.test', emailVerifiedAt: new Date(), role, chefId });
const common = (path: string, currentUser: ReturnType<typeof user> | null = null) => ({
  title: 'Bếp Nhà', path, currentUser, demo: false, csrf, notice: '', error: '', errors: {},
  values: {}, categories: ['Món chính'], imageUrl: (name: string) => `/images/${name}`,
  money: (value: number) => `${value} đ`,
});
const render = (name: string, locals: Record<string, unknown>) => ejs.renderFile(join(views, name), locals);

test('MFA login and profile forms submit the contract fields with CSRF', async () => {
  const pending = await render('auth/mfa.ejs', { ...common('/auth/mfa'), method: 'totp' });
  assert.match(pending, /action="\/auth\/mfa"/);
  assert.match(pending, /name="method"/);
  assert.match(pending, /name="code"/);
  assert.match(pending, new RegExp(`name="_csrf" value="${csrf}"`));
  assert.doesNotMatch(pending, /mfaSetupSecretEncrypted|mfaPendingUserId/);

  const settings = await render('auth/mfa-settings.ejs', { ...common('/auth/account/mfa', user('editor', 2)), mfaEnabled: true });
  for (const action of ['recovery/regenerate', 'replace', 'disable']) assert.match(settings, new RegExp(`action="/auth/account/mfa/${action}"`));
  assert.equal((settings.match(/name="currentPassword"/g) || []).length, 3);
  assert.equal((settings.match(/name="method"/g) || []).length, 3);
  assert.equal((settings.match(/name="code"/g) || []).length, 3);
  const disabled = await render('auth/mfa-settings.ejs', { ...common('/auth/account/mfa', user('viewer')), mfaEnabled: false });
  assert.match(disabled, /action="\/auth\/account\/mfa\/setup"/);
  assert.doesNotMatch(disabled, /action="\/auth\/account\/mfa\/disable"/);
});

test('setup exposes the QR only there and recovery codes render once in their dedicated page', async () => {
  const setup = await render('auth/mfa-setup.ejs', { ...common('/auth/account/mfa/setup', user('viewer')),
    mode: 'enable', manualSecret: 'TESTBASE32SECRET', qrDataUrl: 'data:image/png;base64,AAAA', confirmPath: '/auth/account/mfa/enable' });
  assert.match(setup, /TESTBASE32SECRET/);
  assert.match(setup, /data:image\/png;base64,AAAA/);
  assert.match(setup, /action="\/auth\/account\/mfa\/enable"/);
  const codes = ['A'.repeat(32), 'B'.repeat(32)];
  const recovery = await render('auth/mfa-recovery-codes.ejs', { ...common('/auth/account/mfa/recovery-codes', user('viewer')), codes });
  assert.ok(codes.every(code => recovery.includes(code)));
  assert.doesNotMatch(recovery, /TESTBASE32SECRET/);
});

const items = [
  { id: 1, name: 'Món nháp của mình', chefId: 2, chef: { name: 'Chef A' }, status: 'draft', category: 'Món chính', price: 1000, available: true, imagePath: 'a.jpg' },
  { id: 2, name: 'Món nháp khác', chefId: 3, chef: { name: 'Chef B' }, status: 'draft', category: 'Món chính', price: 2000, available: true, imagePath: 'b.jpg' },
  { id: 3, name: 'Món đã công bố', chefId: 2, chef: { name: 'Chef A' }, status: 'published', category: 'Món chính', price: 3000, available: false, imagePath: 'c.jpg' },
];
function listLocals(role: string, chefId: number | null = null) {
  return { ...common('/admin/dishes', user(role, chefId)), kind: 'dishes', meta: { label: 'món ăn', title: 'Món ăn' },
    counts: { dishes: 3, chefs: 2, ingredients: 0 }, items, total: 3, page: 1, pages: 1,
    q: '', category: '', available: '', link: () => '/admin/dishes' };
}

test('admin list hides mutations by role and editor ownership/status', async () => {
  const viewer = await render('admin-list.ejs', listLocals('viewer'));
  assert.doesNotMatch(viewer, /href="\/admin\/dishes\/new"/);
  assert.doesNotMatch(viewer, /href="\/admin\/dishes\/\d+\/(edit|delete)"/);
  const editor = await render('admin-list.ejs', listLocals('editor', 2));
  assert.match(editor, /href="\/admin\/dishes\/new"/);
  assert.match(editor, /href="\/admin\/dishes\/1\/edit"/);
  assert.doesNotMatch(editor, /href="\/admin\/dishes\/(2|3)\/edit"/);
  assert.doesNotMatch(editor, /href="\/admin\/dishes\/\d+\/delete"/);
  assert.doesNotMatch(editor, /href="\/dishes\/(1|2)"/);
  const admin = await render('admin-list.ejs', listLocals('admin'));
  assert.match(admin, /href="\/admin\/dishes\/3\/edit"/);
  assert.match(admin, /href="\/admin\/dishes\/2\/delete"/);
});

test('editor dish form never submits chefId/status, while admin may choose both', async () => {
  const fields = { kind: 'dishes', meta: { label: 'món ăn', title: 'Món ăn' }, editing: false,
    values: { name: '', description: '', price: '', category: 'Món chính', available: true, ingredients: [], status: 'draft' },
    chefs: [{ id: 2, name: 'Chef A', specialty: 'Món Việt' }], ingredients: [] };
  const editor = await render('form.ejs', { ...common('/admin/dishes/new', user('editor', 2)), ...fields });
  assert.match(editor, /Chef A/);
  assert.doesNotMatch(editor, /name="chefId"/);
  assert.doesNotMatch(editor, /name="status"/);
  const admin = await render('form.ejs', { ...common('/admin/dishes/new', user('admin')), ...fields });
  assert.match(admin, /name="chefId"/);
  assert.match(admin, /name="status"/);
  const profile = await render('auth/account.ejs', { ...common('/auth/account', user('viewer')), values: { name: 'Minh' }, editSection: '' });
  assert.match(profile, /href="\/auth\/account\/mfa"/);
  assert.match(profile, /Người xem/);
  assert.doesNotMatch(profile, /Chờ cấp quyền quản trị/);
});
