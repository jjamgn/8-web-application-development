// Browser contract checks only. Fixtures are intercepted here, never shipped in the SPA.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const playwrightModule = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(playwrightModule ? pathToFileURL(playwrightModule).href : 'playwright');
const base = 'http://localhost:5173';
const evidence = fileURLToPath(new URL('../../docs/evidence/', import.meta.url));
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(7000);
const runtimeErrors = [];
page.on('pageerror', error => runtimeErrors.push(error.message));
const results = [];
const writes = [];
let documents = 0;
page.on('request', request => { if (request.isNavigationRequest() && request.resourceType() === 'document') documents++; });
const state = {
  chefs: [{ id: 1, name: 'Nguyễn Minh An', specialty: 'Ẩm thực Việt', bio: 'Giữ nguyên giới thiệu' }, { id: 2, name: 'Trần Hoài Thương', specialty: 'Món chay' }],
  ingredients: [{ id: 1, name: 'Thịt bò', unit: 'g' }, { id: 2, name: 'Rau thơm', unit: 'g' }],
  dishes: [
    { id: 1, name: 'Bún bò nướng sả', description: 'Bò nướng thơm cùng bún tươi, rau vườn và nước chấm của Bếp Nhà.', price: 125000, category: 'Món chính', available: true, chefId: 1, imageUrl: '/images/beef.png', imagePath: 'seed/beef.png', ingredients: [{ ingredientId: 1, quantity: 150, ingredient: { id: 1, name: 'Thịt bò', unit: 'g' } }] },
    { id: 2, name: 'Chả giò giòn rụm', description: 'Lớp bánh tráng vàng giòn ôm phần nhân rau củ đầy đặn.', price: 79000, category: 'Khai vị', available: false, chefId: 2, imageUrl: '/images/rolls.png' },
    { id: 3, name: 'Cá kho tộ quê nhà', description: 'Cá kho chậm, nước màu dừa cùng chút tiêu đen và ớt cay.', price: 159000, category: 'Món chính', available: true, chefId: 1, imageUrl: '/images/fish.png' },
  ],
};
let fault = '';
async function check(name, action) {
  await action();
  results.push({ name, result: 'PASS' });
  console.log(`PASS ${name}`);
}
const goto = route => page.goto(`${base}/#${route}`);
const hasHeading = text => page.getByRole('heading', { name: text, exact: true }).waitFor();
const type = (label, value) => page.getByLabel(label, { exact: false }).fill(value);

try {
  await context.route('http://localhost:3000/api/**', route => route.abort('failed'));
  await check('Unavailable API: technical error UI, no white screen', async () => {
    await goto('/dishes');
    await hasHeading('Chưa thể tải dữ liệu');
    await page.screenshot({ path: path.join(evidence, 'api-unavailable-desktop.png'), fullPage: true });
  });
  await context.unroute('http://localhost:3000/api/**');
  await context.route('http://localhost:3000/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const [, , resource, id] = url.pathname.split('/');
    const method = request.method();
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    const json = body => route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (fault === 'network') return route.abort('failed');
    if (fault === 'http404' || fault === 'http500') return route.fulfill({ status: Number(fault.slice(4)), headers, body: 'technical error' });
    if (fault === 'html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Wrong endpoint</html>' });
    if (fault === 'shape') return json({ ok: true, data: { unexpected: true } });
    if (fault === 'emptyChefs' && resource === 'chefs') return json({ ok: true, data: [] });
    if (fault === 'slow' && id === '1') await new Promise(resolve => setTimeout(resolve, 450));
    const rows = state[resource];
    if (!rows) return route.fulfill({ status: 404, headers, body: 'unknown endpoint' });
    if (method === 'GET') {
      let data = id ? rows.find(row => row.id === Number(id)) : rows;
      if (!id && url.searchParams.has('q')) data = rows.filter(row => row.name.toLocaleLowerCase('vi').includes(url.searchParams.get('q').toLocaleLowerCase('vi')));
      return json(data ? { ok: true, data } : { ok: false, error: { code: 'NOT_FOUND', message: 'Không có bản ghi.' } });
    }
    const body = request.postDataJSON();
    writes.push({ resource, method, id, body });
    await new Promise(resolve => setTimeout(resolve, 180));
    if (body?.name === 'SERVER_ERROR') return json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Vui lòng kiểm tra dữ liệu.', fields: { name: ['Tên đã được sử dụng.'] } } });
    if (method === 'POST') {
      const record = { id: Math.max(0, ...rows.map(row => row.id)) + 1, ...body };
      rows.push(record);
      return json({ ok: true, data: record });
    }
    const index = rows.findIndex(row => row.id === Number(id));
    if (method === 'PATCH') { Object.assign(rows[index], body); return json({ ok: true, data: rows[index] }); }
    rows.splice(index, 1);
    return json({ ok: true, data: null });
  });
  await check('Public list/detail, search q, empty, reload and Back', async () => {
    await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await page.getByRole('heading', { name: 'Bún bò nướng sả', exact: true }).waitFor();
    await page.screenshot({ path: path.join(evidence, 'fixture-menu-desktop.png'), fullPage: true });
    const docCount = documents;
    await page.getByRole('link', { name: 'Bún bò nướng sả', exact: true }).click();
    await hasHeading('Bún bò nướng sả');
    assert.equal(documents, docCount, 'Internal link must not reload document');
    await page.reload();
    await hasHeading('Bún bò nướng sả');
    await page.getByRole('link', { name: 'Trở lại thực đơn', exact: false }).click();
    await type('Tìm món ăn theo tên', 'khong-co-mon-nay');
    await page.getByRole('button', { name: 'Tìm món', exact: false }).click();
    await hasHeading('Chưa có kết quả phù hợp');
    assert.match(page.url(), /#\/dishes\?q=khong-co-mon-nay/);
    await page.reload();
    assert.equal(await page.getByLabel('Tìm món ăn theo tên').inputValue(), 'khong-co-mon-nay');
    await page.getByRole('button', { name: 'Xem tất cả', exact: true }).click();
    await page.goBack();
    await hasHeading('Chưa có kết quả phù hợp');
  });
  const labels = { dishes: 'món ăn', chefs: 'đầu bếp', ingredients: 'nguyên liệu' };
  for (const resource of Object.keys(labels)) {
    await check(`All four admin routes + CRUD ${resource}, pending, cancel, no document reload`, async () => {
      const name = `FE ${resource}`;
      await goto(`/admin/${resource}`);
      await hasHeading(`Quản lý ${labels[resource]}`);
      await page.getByRole('link', { name: `+ Thêm ${labels[resource]}`, exact: true }).click();
      await hasHeading(`Thêm ${labels[resource]}`);
      const beforeWrite = writes.length;
      await page.getByRole('button', { name: `Thêm ${labels[resource]}`, exact: false }).click();
      assert.equal(writes.length, beforeWrite, 'Empty form should not send a mutation');
      await page.locator('[name=name]').fill(name);
      if (resource === 'dishes') {
        await type('Mô tả', 'Món ăn kiểm tra FE');
        await type('Giá (VNĐ)', '0');
        await page.getByLabel('Đầu bếp', { exact: false }).selectOption('1');
        await page.getByLabel('Đang phục vụ món ăn này').uncheck();
      } else if (resource === 'chefs') await type('Chuyên môn', 'Món Việt');
      else await type('Đơn vị', 'g');
      const beforeCreateDocs = documents;
      const create = page.getByRole('button', { name: `Thêm ${labels[resource]}`, exact: false });
      await create.click();
      assert.equal(await page.getByRole('button', { name: 'Đang lưu…', exact: false }).isDisabled(), true, 'Submit locks while pending');
      await hasHeading(`Quản lý ${labels[resource]}`);
      assert.equal(documents, beforeCreateDocs, 'Mutation navigation must not reload document');
      const row = state[resource].find(record => record.name === name);
      assert.ok(row);
      if (resource === 'dishes') { assert.equal(row.price, 0); assert.equal(row.available, false); assert.equal(row.chefId, 1); }
      await page.getByRole('link', { name: `Sửa ${name}`, exact: true }).click();
      await hasHeading(`Sửa ${labels[resource]}`);
      await page.locator('[name=name]').fill(`${name} updated`);
      await page.getByRole('button', { name: 'Lưu thay đổi', exact: false }).click();
      await hasHeading(`Quản lý ${labels[resource]}`);
      assert.deepEqual(writes.at(-1).body, { name: `${name} updated` }, 'PATCH sends changed editable fields only');
      const deletedBefore = writes.filter(item => item.method === 'DELETE').length;
      await page.getByRole('link', { name: `Xóa ${name} updated`, exact: true }).click();
      await hasHeading(`Xóa ${labels[resource]} này?`);
      assert.equal(writes.filter(item => item.method === 'DELETE').length, deletedBefore);
      await page.getByRole('link', { name: 'Giữ lại', exact: true }).click();
      await hasHeading(`Quản lý ${labels[resource]}`);
      await page.getByRole('link', { name: `Xóa ${name} updated`, exact: true }).click();
      await page.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
      await hasHeading(`Quản lý ${labels[resource]}`);
      assert.equal(state[resource].some(record => record.id === row.id), false);
      await page.reload();
      await hasHeading(`Quản lý ${labels[resource]}`);
    });
  }
  await check('Server validation field arrays, preserve draft, no-change PATCH, preserve relations', async () => {
    await goto('/admin/ingredients/new');
    await page.locator('[name=name]').fill('SERVER_ERROR');
    await type('Đơn vị', 'kg');
    await page.getByRole('button', { name: 'Thêm nguyên liệu', exact: false }).click();
    await page.getByText('Tên đã được sử dụng.', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Đơn vị', { exact: false }).inputValue(), 'kg');
    await goto('/admin/dishes/1/edit');
    await page.getByLabel('Tên món ăn', { exact: false }).waitFor();
    const writesBefore = writes.length;
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: false }).click();
    await page.getByText('Bạn chưa thay đổi thông tin nào.', { exact: true }).waitFor();
    assert.equal(writes.length, writesBefore);
    await page.getByLabel('Tên món ăn', { exact: false }).fill('Bún bò đổi tên');
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: false }).click();
    await hasHeading('Quản lý món ăn');
    assert.equal(state.dishes[0].imagePath, 'seed/beef.png');
    assert.equal(state.dishes[0].ingredients.length, 1);
  });
  await check('Empty chef list disables dish submit; form resets between resources', async () => {
    fault = 'emptyChefs';
    await goto('/admin/dishes/new');
    await page.getByText('Cần có đầu bếp trước khi thêm món.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Thêm món ăn', exact: false }).isDisabled(), true);
    fault = '';
    await goto('/admin/chefs/new');
    await page.locator('[name=name]').fill('Unsaved draft');
    await goto('/admin/ingredients/new');
    assert.equal(await page.locator('[name=name]').inputValue(), '');
  });
  await check('NOT_FOUND is distinct from HTTP/network/HTML/wrong data errors', async () => {
    await goto('/dishes/99999');
    await hasHeading('Không tìm thấy thông tin');
    for (const error of ['http404', 'http500', 'network', 'html', 'shape']) {
      fault = error;
      await goto('/admin/ingredients');
      await page.reload();
      await hasHeading('Chưa thể tải dữ liệu');
      assert.equal(await page.getByRole('heading', { name: 'Không tìm thấy thông tin', exact: true }).count(), 0);
    }
    fault = '';
  });
  await check('Rapid ID navigation ignores old responses; invalid resource/id fallback', async () => {
    fault = 'slow';
    await goto('/dishes/1');
    await goto('/dishes/2');
    await hasHeading('Chả giò giòn rụm');
    await page.waitForTimeout(550);
    await hasHeading('Chả giò giòn rụm');
    fault = '';
    for (const url of ['/dishes/abc', '/admin/__proto__', '/admin/chefs/abc/edit', '/khong-ton-tai']) {
      await goto(url);
      await hasHeading('Không tìm thấy trang');
    }
  });
  await check('Desktop/mobile layout and hash-safe menu scroll', async () => {
    await goto('/admin/dishes');
    await hasHeading('Quản lý món ăn');
    await page.getByRole('link', { name: 'Sửa Bún bò đổi tên', exact: true }).waitFor();
    await page.screenshot({ path: path.join(evidence, 'fixture-admin-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(evidence, 'fixture-admin-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await goto('/dishes');
    await page.getByRole('button', { name: 'Khám phá thực đơn', exact: false }).click();
    assert.match(page.url(), /#\/dishes$/);
    await page.screenshot({ path: path.join(evidence, 'fixture-menu-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  });
  assert.deepEqual(runtimeErrors, [], 'No uncaught React/browser errors');
  await writeFile(path.join(evidence, 'fe-smoke.json'), JSON.stringify({ checkedAt: new Date().toISOString(), mode: 'Playwright browser route fixtures; not a real BE/DB verification', results, mutations: writes.length, runtimeErrors }, null, 2));
  console.log(`${results.length} checks passed. Real BE integration remains unverified.`);
} catch (error) {
  console.error(error);
  await page.screenshot({ path: path.join(evidence, 'smoke-failure.png'), fullPage: true });
  process.exitCode = 1;
} finally {
  await browser.close();
}
