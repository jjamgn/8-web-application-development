// End-to-end checks against real HTTP API and Supabase. Only owned test dishes are removed.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.FRONTEND_URL || 'http://localhost:5173', api = process.env.API_URL || 'http://127.0.0.1:3000/api';
const output = fileURLToPath(new URL('../../docs/evidence/', import.meta.url)); await mkdir(output, { recursive: true });
const prefix = `B7_TEST_${randomUUID().slice(0, 8)}`;
const owned = new Set(), uploads = new Set(), results = [], network = [], errors = [];
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(); page.setDefaultTimeout(30000);
page.on('pageerror', e => errors.push(e.message));
page.on('response', res => { const u = new URL(res.url()); if (u.pathname.startsWith('/api/')) network.push({ method: res.request().method(), path: u.pathname + u.search, status: res.status() }); });
const json = async (p, options) => { const r = await fetch(`${api}${p}`, options); const b = await r.json(); assert.equal(b.ok, true, JSON.stringify({ path: p, status: r.status, error: b.error, message: b.message })); return b.data; };
const get = params => json(`/dishes?${new URLSearchParams(params)}`);
const goto = route => page.goto(`${base}/#${route}`);
async function check(name, fn) { await fn(); results.push({ name, result: 'PASS' }); console.log(`PASS ${name}`); }
const waitCount = n => page.waitForFunction(count => document.querySelectorAll('.dish-card').length === count, n);
const waitRows = () => page.locator('tbody tr').first().waitFor();
let baselineTotal, baseline;
try {
  await check('Supabase count and stable server pages; full result baseline for filter assertions', async () => {
    const first = await get({ page: '1', pageSize: '100', sort: 'price_asc' }); baselineTotal = first.total; assert.ok(first.total >= 1000); assert.equal(first.items.length, 100);
    const pages = [];
    for (let n = 2; n <= Math.ceil(first.total / 100); n += 2) pages.push(...await Promise.all([n, n + 1].filter(p => p <= Math.ceil(first.total / 100)).map(p => get({ page: String(p), pageSize: '100', sort: 'price_asc' }))));
    baseline = [first, ...pages].flatMap(p => p.items); assert.equal(baseline.length, first.total); assert.equal(new Set(baseline.map(d => d.id)).size, baseline.length);
    for (let i = 1; i < baseline.length; i++) assert.ok(baseline[i - 1].price < baseline[i].price || (baseline[i - 1].price === baseline[i].price && baseline[i - 1].id < baseline[i].id));
  });
  await check('Basic/Advanced parity, server-wide AND filters, literal wildcard handling', async () => {
    const q = baseline[0].name.split(' ')[0];
    const [basic, advanced] = await Promise.all([get({ mode: 'basic', q }), get({ mode: 'advanced', q })]);
    assert.equal(basic.total, advanced.total); assert.deepEqual(basic.items.map(d => d.id), advanced.items.map(d => d.id));
    const category = baseline[0].category;
    const expected = baseline.filter(d => d.category === category && d.price >= 0 && d.price <= 100000 && !d.available);
    const filtered = await get({ mode: 'advanced', category, minPrice: '0', maxPrice: '100000', available: 'false', sort: 'price_asc', pageSize: '100' });
    assert.equal(filtered.total, expected.length); assert.deepEqual(filtered.items.map(d => d.id), expected.slice(0, 100).map(d => d.id));
    for (const q of ['%', '_']) assert.equal((await get({ q })).total, baseline.filter(d => d.name.toLowerCase().includes(q)).length);
  });
  await check('PostgreSQL full-text and pg_trgm fuzzy return actual matches', async () => {
    const fts = await get({ mode: 'fulltext', q: 'rau' }); assert.ok(fts.total > 0); assert.ok(fts.items.every(d => `${d.name} ${d.description}`.toLowerCase().includes('rau')));
    const name = baseline.find(d => d.name.length >= 8).name;
    const fuzzy = await get({ mode: 'fuzzy', q: name.slice(0, -1) }); assert.ok(fuzzy.total > 0); assert.ok(fuzzy.items.some(d => d.name === name));
  });
  await check('Live Load More appends 12 to 24 unique dishes', async () => {
    await goto('/dishes'); await waitCount(12); await page.getByRole('button', { name: 'Tải thêm món' }).click(); await waitCount(24);
    assert.equal(new Set(await page.locator('.card-title h3 a').evaluateAll(links => links.map(a => a.getAttribute('href')))).size, 24);
    await page.screenshot({ path: path.join(output, 'live-menu-load-more.png'), fullPage: true });
  });
  await check('Live numbered admin URL and reload preserve page and sort', async () => {
    await goto('/admin/dishes?mode=advanced&minPrice=0&sort=price_asc&page=2&pageSize=12'); await waitRows();
    const ids = await page.locator('tbody tr>td:first-child').allTextContents(); assert.equal(ids.length, 12);
    await page.reload(); await waitRows(); assert.deepEqual(await page.locator('tbody tr>td:first-child').allTextContents(), ids);
    assert.equal(await page.locator('[name=minPrice]').inputValue(), '0');
    await page.screenshot({ path: path.join(output, 'live-admin-page-2.png'), fullPage: true });
  });
  await check('Live infinite scroll appends without duplicate dish IDs', async () => {
    await goto('/explore'); await waitCount(12); await page.locator('.more-dishes').scrollIntoViewIfNeeded(); await waitCount(24);
    assert.equal(new Set(await page.locator('.card-title h3 a').evaluateAll(links => links.map(a => a.getAttribute('href')))).size, 24);
    await page.screenshot({ path: path.join(output, 'live-infinite-scroll.png'), fullPage: true });
  });
  await check('Create dish through UI with real file upload, price zero and available false', async () => {
    await goto('/admin/dishes/new'); await page.locator('[name=chefId] option').nth(1).waitFor({ state: 'attached' });
    await page.locator('[name=name]').fill(`${prefix} file`); await page.locator('textarea[name=description]').fill('Món kiểm thử Block 7; được dọn sau nghiệm thu.'); await page.locator('[name=price]').fill('0');
    const chef = await page.locator('[name=chefId] option').nth(1).getAttribute('value'); await page.locator('[name=chefId]').selectOption(chef); await page.locator('[name=available]').uncheck();
    await page.locator('[name=imageSource][value=file]').check(); await page.locator('[name=imageFile]').setInputFiles(fileURLToPath(new URL('../public/images/tofu.png', import.meta.url)));
    const uploaded = page.waitForResponse(res => new URL(res.url()).pathname === '/api/uploads/dishes' && res.request().method() === 'POST');
    const posted = page.waitForResponse(res => new URL(res.url()).pathname === '/api/dishes' && res.request().method() === 'POST');
    await page.getByRole('button', { name: 'Thêm món ăn', exact: false }).click();
    const upload = await (await uploaded).json(); assert.equal(upload.ok, true); uploads.add(path.basename(upload.data.imagePath));
    const b = await (await posted).json(); assert.equal(b.ok, true, JSON.stringify(b)); owned.add(b.data.id);
    const saved = await json(`/dishes/${b.data.id}`); assert.equal(saved.price, 0); assert.equal(saved.available, false); assert.equal(saved.imagePath, upload.data.imagePath);
    await goto(`/dishes/${saved.id}`); await page.getByRole('heading', { name: saved.name, exact: true }).waitFor();
    await page.waitForFunction(() => { const img = document.querySelector('.detail-image img'); return img?.complete && img.naturalWidth > 0; });
    await page.reload(); await page.getByRole('heading', { name: saved.name, exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.detail-image img')?.naturalWidth > 0);
    await page.screenshot({ path: path.join(output, 'live-created-upload.png'), fullPage: true });
    const filtered = await get({ available: 'false', minPrice: '0', maxPrice: '0', q: prefix }); assert.ok(filtered.items.some(d => d.id === saved.id));
  });
  await check('HTTPS image link survives UI save/reload; PATCH name preserves image; cancel delete is safe', async () => {
    const id = [...owned][0], external = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600';
    await goto(`/admin/dishes/${id}/edit?returnTo=${encodeURIComponent('/admin/dishes?page=2&sort=price_asc')}`); await page.locator('[name=name]').waitFor();
    await page.locator('[name=imageSource][value=url]').check(); await page.locator('[name=imageUrl]').fill(external);
    const patched = page.waitForResponse(res => new URL(res.url()).pathname === `/api/dishes/${id}` && res.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click(); assert.equal((await (await patched).json()).ok, true);
    await page.waitForURL(/page=2/); assert.equal((await json(`/dishes/${id}`)).imageUrl, external);
    await goto(`/admin/dishes/${id}/edit`); await page.locator('[name=name]').waitFor(); await page.locator('[name=name]').fill(`${prefix} updated`);
    const patchName = page.waitForResponse(res => new URL(res.url()).pathname === `/api/dishes/${id}` && res.request().method() === 'PATCH'); await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    const response = await patchName; assert.deepEqual(response.request().postDataJSON(), { name: `${prefix} updated` }); assert.equal((await response.json()).ok, true);
    await page.waitForURL(/#\/admin\/dishes$/); await goto(`/dishes/${id}`); await page.getByRole('heading', { name: `${prefix} updated`, exact: true }).waitFor();
    assert.equal(await page.locator('.detail-image img').getAttribute('src'), external);
    await page.waitForFunction(() => document.querySelector('.detail-image img')?.naturalWidth > 0);
    await page.screenshot({ path: path.join(output, 'live-external-image.png'), fullPage: true });
    await goto(`/admin/dishes/${id}/delete`); await page.getByRole('link', { name: 'Giữ lại', exact: true }).click(); assert.equal((await json(`/dishes/${id}`)).imagePath, external);
  });
  await check('Mobile live menu and admin have no horizontal document overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await goto('/dishes'); await waitCount(12);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, 'live-menu-mobile.png'), fullPage: true });
    await goto('/admin/dishes'); await waitRows(); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, 'live-admin-mobile.png'), fullPage: true });
  });
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: path.join(output, 'live-failure.png'), fullPage: true }); throw error;
} finally {
  const cleanup = [];
  for (const id of owned) { try { await json(`/dishes/${id}`, { method: 'DELETE' }); cleanup.push(id); } catch { console.error('Cleanup failed for owned dish', id); } }
  for (const filename of uploads) { try { await unlink(fileURLToPath(new URL(`../../api/var/uploads/${filename}`, import.meta.url))); } catch {} }
  const after = await get({ pageSize: '1' }).catch(() => null);
  await writeFile(path.join(output, 'fe-be-integration.json'), JSON.stringify({ source: 'real browser -> local HTTP API -> Supabase PostgreSQL; no interception', baselineTotal, afterTotal: after?.total, results, errors, network, removedOwnedIds: cleanup }, null, 2));
  await browser.close();
}
