// Live FE -> HTTP API -> PostgreSQL checks. No request interception or fixture responses.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium, request } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const frontend = 'http://localhost:5173';
const api = 'http://127.0.0.1:3000/api';
const prefix = `FE_BE_${randomUUID().slice(0, 8)}`;
const output = fileURLToPath(new URL('../../docs/evidence/', import.meta.url));
await mkdir(output, { recursive: true });
const http = await request.newContext({ extraHTTPHeaders: { Origin: frontend }, timeout: 20000 });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const owned = { dishes: new Set(), chefs: new Set(), ingredients: new Set() };
const results = [];
const uncaughtErrors = [];
const network = [];
const baseline = {};
let documents = 0;
page.on('pageerror', error => uncaughtErrors.push(error.message));
page.on('request', req => { if (req.isNavigationRequest() && req.resourceType() === 'document') documents++; });
page.on('response', res => {
  if (new URL(res.url()).pathname.startsWith('/api/')) network.push({ method: res.request().method(), path: new URL(res.url()).pathname, status: res.status() });
});
const goto = route => page.goto(`${frontend}/#${route}`);
const heading = text => page.getByRole('heading', { name: text, exact: true }).waitFor();
async function imagesReady() {
  await page.locator('img').evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0), null, { timeout: 30000 });
}
const matchResponse = (resource, method, id) => page.waitForResponse(res => new URL(res.url()).pathname === `/api/${resource}${id ? `/${id}` : ''}` && res.request().method() === method);
async function check(name, action) { await action(); results.push({ name, result: 'PASS' }); console.log(`PASS ${name}`); }
async function read(resource, id) {
  const response = await http.get(`${api}/${resource}${id ? `/${id}` : ''}`);
  assert.equal(response.status(), 200);
  assert.equal(response.headers()['access-control-allow-origin'], frontend);
  return response.json();
}
const labels = { dishes: 'món ăn', chefs: 'đầu bếp', ingredients: 'nguyên liệu' };
async function createAndEdit(resource, chefId) {
  const name = `${prefix} ${resource}`;
  await goto(`/admin/${resource}`);
  await heading(`Quản lý ${labels[resource]}`);
  await page.getByRole('link', { name: `+ Thêm ${labels[resource]}`, exact: true }).click();
  await heading(`Thêm ${labels[resource]}`);
  await page.locator('[name=name]').fill(name);
  if (resource === 'chefs') await page.locator('[name=specialty]').fill('Món Việt kiểm tra tích hợp');
  else if (resource === 'ingredients') await page.locator('[name=unit]').fill('g');
  else {
    await page.locator('textarea[name=description]').fill('Bản ghi thử tích hợp, được dọn sau kiểm tra.');
    await page.locator('[name=price]').fill('0');
    await page.locator('[name=chefId]').selectOption(String(chefId));
    await page.locator('[name=available]').uncheck();
  }
  const docCount = documents;
  const post = matchResponse(resource, 'POST');
  await page.getByRole('button', { name: `Thêm ${labels[resource]}`, exact: false }).click();
  const response = await post;
  const body = await response.json();
  if (body.ok && body.data?.id) owned[resource].add(body.data.id);
  assert.equal(body.ok, true, JSON.stringify(body));
  const created = body.data;
  await heading(`Quản lý ${labels[resource]}`);
  assert.equal(documents, docCount, 'Saving must not reload the document');
  assert.equal((await read(resource, created.id)).data.name, name);
  await page.getByRole('link', { name: `Sửa ${name}`, exact: true }).click();
  await heading(`Sửa ${labels[resource]}`);
  await page.locator('[name=name]').fill(`${name} updated`);
  const patch = matchResponse(resource, 'PATCH', created.id);
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: false }).click();
  const patched = await patch;
  assert.deepEqual(patched.request().postDataJSON(), { name: `${name} updated` });
  assert.equal((await patched.json()).ok, true);
  await heading(`Quản lý ${labels[resource]}`);
  await page.reload();
  await page.getByRole('link', { name: `Sửa ${name} updated`, exact: true }).waitFor();
  const saved = (await read(resource, created.id)).data;
  if (resource === 'dishes') {
    assert.equal(saved.price, 0); assert.equal(saved.available, false);
    assert.equal(saved.chefId, chefId); assert.equal(saved.imagePath, created.imagePath);
  }
  return saved;
}
let failure;
try {
  await check('Read real data and CORS for all three resources', async () => {
    for (const resource of Object.keys(owned)) {
      const body = await read(resource);
      assert.equal(body.ok, true); assert.ok(Array.isArray(body.data));
      baseline[resource] = body.data.length;
    }
    console.log(`BASELINE ${JSON.stringify(baseline)}`);
  });
  await check('Public menu/detail/search/reload with real records', async () => {
    const dishes = (await read('dishes')).data;
    assert.ok(dishes.length);
    await goto('/dishes');
    await page.getByRole('link', { name: dishes[0].name, exact: true }).waitFor();
    await imagesReady();
    await page.screenshot({ path: path.join(output, 'live-menu-desktop.png'), fullPage: true });
    const docCount = documents;
    await page.getByRole('link', { name: dishes[0].name, exact: true }).click();
    await heading(dishes[0].name);
    assert.equal(documents, docCount);
    await page.reload(); await heading(dishes[0].name);
    await goto('/dishes');
    await page.getByLabel('Tìm món ăn theo tên').fill(dishes[0].name);
    await page.getByRole('button', { name: 'Tìm món', exact: false }).click();
    await page.getByRole('link', { name: dishes[0].name, exact: true }).waitFor();
    assert.ok(new URL(page.url()).hash.includes('q='));
  });
  let chef, ingredient, dish;
  await check('Create/edit chef through FE, read back from DB', async () => { chef = await createAndEdit('chefs'); });
  await check('Create/edit ingredient through FE, read back from DB', async () => { ingredient = await createAndEdit('ingredients'); });
  await check('Create/edit dish with price 0 and available false through FE', async () => { dish = await createAndEdit('dishes', chef.id); });
  await check('Real unique/FK validation keeps form and confirmation page', async () => {
    await goto('/admin/ingredients/new');
    await page.locator('[name=name]').fill(ingredient.name);
    await page.locator('[name=unit]').fill('kg');
    const rejected = matchResponse('ingredients', 'POST');
    await page.getByRole('button', { name: 'Thêm nguyên liệu', exact: false }).click();
    assert.equal((await (await rejected).json()).error.code, 'VALIDATION_FAILED');
    await page.locator('#field-name-error').waitFor();
    assert.equal(await page.locator('[name=unit]').inputValue(), 'kg');
    await goto(`/admin/chefs/${chef.id}/delete`);
    await heading('Xóa đầu bếp này?');
    const blocked = matchResponse('chefs', 'DELETE', chef.id);
    await page.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
    assert.equal((await (await blocked).json()).error.code, 'VALIDATION_FAILED');
    await page.getByRole('alert').waitFor();
    assert.equal((await read('chefs', chef.id)).ok, true);
  });
  await check('Real preflight and technical JSON errors keep CORS', async () => {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const preflight = await http.fetch(`${api}/dishes/${dish.id}`, { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'content-type' } });
      assert.equal(preflight.status(), 204);
      assert.equal(preflight.headers()['access-control-allow-origin'], frontend);
      assert.ok(preflight.headers()['access-control-allow-methods'].includes(method));
    }
    const invalid = await http.post(`${api}/ingredients`, { headers: { 'Content-Type': 'application/json' }, data: Buffer.from('{') });
    assert.equal(invalid.status(), 400);
    assert.equal(invalid.headers()['access-control-allow-origin'], frontend);
    const missing = await http.get(`${api}/unknown`);
    assert.equal(missing.status(), 404);
    await goto('/dishes/2147483647'); await heading('Không tìm thấy thông tin');
  });
  if (process.env.WAIT_FOR_BE_RESTART === '1') {
    console.log('CHECKPOINT: Restart the owned BE server, then send Enter to continue.');
    await new Promise(resolve => { process.stdin.resume(); process.stdin.once('data', resolve); });
    process.stdin.pause();
    await check('All created records persist after a real BE process restart', async () => {
      for (const resource of Object.keys(owned)) for (const id of owned[resource]) {
        const record = await read(resource, id);
        assert.equal(record.ok, true); assert.ok(record.data.name.startsWith(prefix));
      }
      const persistedDish = (await read('dishes', dish.id)).data;
      assert.equal(persistedDish.price, 0); assert.equal(persistedDish.available, false);
    });
  }
  await check('Cancel/confirm deletes through FE, only own test records', async () => {
    for (const resource of ['dishes', 'chefs', 'ingredients']) for (const id of [...owned[resource]]) {
      await goto(`/admin/${resource}/${id}/delete`);
      await heading(`Xóa ${labels[resource]} này?`);
      await page.getByRole('link', { name: 'Giữ lại', exact: true }).click();
      await heading(`Quản lý ${labels[resource]}`);
      assert.equal((await read(resource, id)).ok, true);
      await goto(`/admin/${resource}/${id}/delete`);
      const deleted = matchResponse(resource, 'DELETE', id);
      await page.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
      assert.equal((await (await deleted).json()).ok, true);
      owned[resource].delete(id);
      await heading(`Quản lý ${labels[resource]}`);
      assert.equal((await read(resource, id)).error.code, 'NOT_FOUND');
    }
  });
  await check('Live desktop/mobile screens and no uncaught browser errors', async () => {
    await goto('/admin/dishes');
    await page.getByRole('link', { name: /^Sửa / }).first().waitFor();
    await imagesReady();
    await page.screenshot({ path: path.join(output, 'live-admin-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'live-admin-mobile.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(uncaughtErrors, []);
  });
} catch (error) {
  failure = String(error);
  console.error(error);
  await page.screenshot({ path: path.join(output, 'live-failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  // Recover IDs from successful POSTs even if a browser assertion failed after creation.
  const after = {};
  for (const resource of ['dishes', 'chefs', 'ingredients']) {
    try {
      const rows = (await read(resource)).data;
      for (const row of rows.filter(item => item.name.startsWith(prefix))) {
        const deleted = await http.delete(`${api}/${resource}/${row.id}`);
        assert.equal((await deleted.json()).ok, true);
        owned[resource].delete(row.id);
      }
      const clean = (await read(resource)).data;
      assert.ok(!clean.some(row => row.name.startsWith(prefix)));
      after[resource] = clean.length;
    } catch (error) { failure ||= `Cleanup failed for ${resource}: ${String(error)}`; process.exitCode = 1; }
  }
  await writeFile(path.join(output, 'fe-be-integration.json'), JSON.stringify({ checkedAt: new Date().toISOString(), mode: 'Live browser + Express HTTP API + PostgreSQL; no mocks/interception', frontend, api, prefix, baseline, after, results, uncaughtErrors, network, failure: failure || null }, null, 2));
  await browser.close(); await http.dispose();
  console.log(`${results.length} live checks passed. Cleanup attempted for every test-owned record.`);
}
