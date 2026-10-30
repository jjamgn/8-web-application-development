import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.FRONTEND_URL || 'http://localhost:5173';
const evidence = fileURLToPath(new URL('../../docs/evidence/', import.meta.url));
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(); page.setDefaultTimeout(12000);
const results = [], runtimeErrors = [], network = [], writes = [];
page.on('pageerror', e => runtimeErrors.push(e.message));
const categories = ['Khai vị', 'Món chính', 'Món chay', 'Tráng miệng'];
const rows = Array.from({ length: 41 }, (_, i) => ({ id: i + 1, name: `Món thử ${String(i + 1).padStart(3, '0')}`, description: 'Hương vị Việt cùng rau vườn tươi ngon.', price: i * 10000, category: categories[i % 4], available: i % 3 !== 0, chefId: 1, imageUrl: '/images/beef.png', imagePath: '/images/beef.png' }));
const chefs = [{ id: 1, name: 'Nguyễn Minh An', specialty: 'Món Việt' }, { id: 2, name: 'Trần Hoài Thương', specialty: 'Món chay và bánh ngọt' }, { id: 3, name: 'Lê Quốc Bảo', specialty: 'Hải sản' }];
const ingredients = Array.from({ length: 31 }, (_, i) => ({ id: i + 1, name: i === 0 ? 'Đậu hũ' : i === 1 ? 'Mực' : `Nguyên liệu ${String(i + 1).padStart(3, '0')}`, unit: i >= 2 && i % 5 === 0 ? 'ml' : 'g' }));
let legacyIngredientResponse = false;
let failPage = 0, holdOldQuery = false, pausedRequest = null;
function pauseAPI(matches) {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  pausedRequest = { matches, promise };
  return () => { pausedRequest = null; release(); };
}
await context.route('**/api/**', async route => {
  const req = route.request(), url = new URL(req.url()), p = url.searchParams;
  const parts = url.pathname.split('/'), resource = parts[2], id = Number(parts[3]);
  const headers = { 'access-control-allow-origin': base, 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': 'Content-Type' };
  const json = body => route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {});
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  const pause = pausedRequest;
  if (req.method() === 'GET' && pause?.matches(url)) await pause.promise;
  if (req.method() === 'GET' && resource === 'chefs') return json({ ok: true, data: chefs });
  if (req.method() === 'GET' && resource === 'ingredients') {
    if (id) return json({ ok: true, data: ingredients.find(i => i.id === id) });
    if (legacyIngredientResponse) return json({ ok: true, data: ingredients });
    const normalize = v => v.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
    const items = ingredients.filter(i => !p.get('q') || normalize(i.name).includes(normalize(p.get('q'))));
    const page = Number(p.get('page') || 1), size = Number(p.get('pageSize') || 12);
    return json({ ok: true, data: p.has('page') ? { items: items.slice((page - 1) * size, page * size), total: items.length, page, pageSize: size } : items });
  }
  if (req.method() === 'GET' && resource === 'dishes' && !id) {
    network.push(Object.fromEntries(p));
    if (Number(p.get('page')) === failPage) { failPage = 0; return route.fulfill({ status: 500, headers, contentType: 'application/json', body: '{"message":"temporary"}' }); }
    if (holdOldQuery && !p.get('category') && p.get('page') === '2') await new Promise(r => setTimeout(r, 600));
    let filtered = rows.filter(d => (!p.get('q') || d.name.toLowerCase().includes(p.get('q').toLowerCase()) || (p.get('mode') === 'fulltext' && p.get('q') === 'huongvi' && d.id <= 30) || (p.get('mode') === 'fuzzy' && p.get('q') === 'monn' && d.id <= 18)) && (!p.has('category') || d.category === p.get('category')) && (!p.has('available') || d.available === (p.get('available') === 'true')) && (!p.has('minPrice') || d.price >= Number(p.get('minPrice'))) && (!p.has('maxPrice') || d.price <= Number(p.get('maxPrice'))));
    filtered.sort((a, b) => p.get('sort')?.startsWith('price') ? (a.price - b.price) * (p.get('sort').endsWith('desc') ? -1 : 1) : a.name.localeCompare(b.name));
    const n = Number(p.get('page') || 1), size = Number(p.get('pageSize') || 12);
    return json({ ok: true, data: { items: filtered.slice((n - 1) * size, n * size), total: filtered.length, page: n, pageSize: size } });
  }
  if (resource === 'dishes' && req.method() === 'GET') return json({ ok: true, data: rows.find(d => d.id === id) });
  if (resource === 'dishes' && ['POST', 'PATCH'].includes(req.method())) {
    const body = req.postDataJSON(); writes.push({ method: req.method(), body });
    if (body.name === 'SERVER_ERROR') return route.fulfill({ status: 422, headers, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Tên đã tồn tại.', fields: { name: 'Tên đã tồn tại.' } } }) });
    const values = { ...body };
    if (values.ingredients) values.ingredients = values.ingredients.map(row => ({ ...row, ingredient: ingredients.find(i => i.id === row.ingredientId) }));
    const row = req.method() === 'POST' ? { id: rows.length + 1, ...values, imageUrl: body.imagePath } : Object.assign(rows.find(d => d.id === id), values);
    if (req.method() === 'POST') rows.push(row);
    return json({ ok: true, data: row });
  }
  return json({ ok: true, data: [] });
});
const goto = route => page.goto(`${base}/#${route}`);
async function check(name, fn) { await fn(); results.push({ name, result: 'PASS' }); console.log(`PASS ${name}`); }
const cards = () => page.locator('.dish-card');
const waitCount = count => page.waitForFunction(n => document.querySelectorAll('.dish-card').length === n, count);
try {
  await check('Skeletons cover initial/next loading and disappear on success/error; reduced motion and mobile work', async () => {
    let release = pauseAPI(url => url.pathname === '/api/dishes' && url.searchParams.get('page') === '1');
    try {
      await goto('/dishes'); await page.locator('.skeleton-cards').waitFor();
      assert.equal(await cards().count(), 0); assert.equal(await page.locator('.skeleton-card').count(), 12);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await page.locator('.skeleton-surface').first().evaluate(el => getComputedStyle(el).animationName), 'none');
      await page.screenshot({ path: path.join(evidence, 'skeleton-menu-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(evidence, 'skeleton-menu-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ reducedMotion: 'no-preference' });
    } finally { release(); }
    await waitCount(12); assert.equal(await page.locator('.skeleton-state').count(), 0);
    release = pauseAPI(url => url.pathname === '/api/dishes' && url.searchParams.get('page') === '2');
    try {
      await page.getByRole('button', { name: 'Tải thêm món' }).click(); await page.locator('.skeleton-cards').waitFor();
      assert.equal(await cards().count(), 12); assert.equal(await page.locator('.skeleton-card').count(), 12);
      assert.equal(await page.getByRole('button', { name: 'Đang tải món' }).isDisabled(), true);
    } finally { release(); }
    await waitCount(24); assert.equal(await page.locator('.skeleton-state').count(), 0);
    release = pauseAPI(url => url.pathname === '/api/dishes' && url.searchParams.get('page') === '1');
    try { await goto('/explore'); await page.locator('.skeleton-cards').waitFor(); } finally { release(); }
    await waitCount(12);
    release = pauseAPI(url => url.pathname === '/api/dishes' && url.searchParams.get('page') === '2');
    try {
      await page.locator('.more-dishes').scrollIntoViewIfNeeded(); await page.locator('.skeleton-cards').waitFor();
      assert.equal(await cards().count(), 12);
    } finally { release(); }
    await waitCount(24);
    release = pauseAPI(url => url.pathname === '/api/dishes' && url.searchParams.get('page') === '1');
    try {
      await goto('/admin/dishes'); await page.locator('.skeleton-table').waitFor();
      assert.equal(await page.locator('tbody tr').count(), 0); assert.equal(await page.locator('.skeleton-table-row').count(), 13);
      await page.screenshot({ path: path.join(evidence, 'skeleton-admin.png'), fullPage: true });
    } finally { release(); }
    await page.locator('tbody tr').first().waitFor();
    release = pauseAPI(url => url.pathname === '/api/dishes' && url.searchParams.get('page') === '2');
    try {
      await page.getByRole('button', { name: 'Trang 2', exact: true }).click(); await page.locator('.skeleton-table').waitFor();
      assert.equal(await page.locator('tbody tr').count(), 0);
    } finally { release(); }
    await page.locator('tbody').getByText('Món thử 013', { exact: true }).waitFor();
    release = pauseAPI(url => url.pathname === '/api/dishes/1');
    try {
      await goto('/dishes/1'); await page.locator('.skeleton-detail').waitFor();
      assert.ok((await page.locator('.skeleton-detail-image').boundingBox()).width > 400);
      await page.screenshot({ path: path.join(evidence, 'skeleton-detail.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok((await page.locator('.skeleton-detail-image').boundingBox()).width > 300);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(evidence, 'skeleton-detail-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
    } finally { release(); }
    await page.getByRole('heading', { name: 'Món thử 001', exact: true }).waitFor();
    release = pauseAPI(url => url.pathname === '/api/dishes/1');
    try { await goto('/admin/dishes/1/edit'); await page.locator('.skeleton-form').waitFor(); } finally { release(); }
    await page.locator('[name=name]').waitFor();
    release = pauseAPI(url => url.pathname === '/api/dishes' && url.searchParams.get('page') === '1');
    failPage = 1;
    try { await goto('/dishes?q=skeleton-error'); await page.locator('.skeleton-cards').waitFor(); } finally { release(); }
    await page.getByRole('heading', { name: 'Chưa thể tải dữ liệu', exact: true }).waitFor();
    assert.equal(await page.locator('.skeleton-state').count(), 0);
  });
  await check('Current API image wins over old seed path; missing images use a neutral placeholder', async () => {
    const original = { imageUrl: rows[0].imageUrl, imagePath: rows[0].imagePath };
    await context.route('**/images/sourced/latest-test.png', route => route.fulfill({ path: fileURLToPath(new URL('../public/images/tofu.png', import.meta.url)), contentType: 'image/png' }));
    await context.route('**/images/sourced/missing-test.png', route => route.fulfill({ status: 404, body: '' }));
    try {
      rows[0].imageUrl = '/images/sourced/latest-test.png'; rows[0].imagePath = 'seed/beef.png';
      await goto('/dishes'); await waitCount(12);
      const image = page.locator('.dish-card img').first(); await image.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => { const img = document.querySelector('.dish-card img'); return img?.getAttribute('src') === '/images/sourced/latest-test.png' && img.naturalWidth > 0; });
      await goto('/admin/dishes'); await page.locator('tbody tr').first().waitFor();
      assert.equal(await page.locator('tbody tr img').first().getAttribute('src'), '/images/sourced/latest-test.png');
      rows[0].imageUrl = '/images/sourced/missing-test.png';
      await goto('/dishes/1'); await page.waitForFunction(() => document.querySelector('.detail-image img')?.getAttribute('src') === '/images/placeholder.svg');
      rows[0].imageUrl = '/images/sourced/latest-test.png';
      await page.reload(); await page.waitForFunction(() => { const img = document.querySelector('.detail-image img'); return img?.getAttribute('src') === '/images/sourced/latest-test.png' && img.naturalWidth > 0; });
    } finally { Object.assign(rows[0], original); }
  });
  await check('Load More appends, retries the same page and stops at the end', async () => {
    await goto('/dishes'); await waitCount(12);
    await page.getByRole('button', { name: 'Tải thêm món' }).click(); await waitCount(24);
    failPage = 3; await page.getByRole('button', { name: 'Tải thêm món' }).click();
    await page.getByRole('button', { name: 'Thử tải lại' }).waitFor(); assert.equal(await cards().count(), 24);
    await page.getByRole('button', { name: 'Thử tải lại' }).click(); await waitCount(36);
    await page.getByRole('button', { name: 'Tải thêm món' }).click(); await waitCount(41);
    assert.equal(await page.getByRole('button', { name: 'Tải thêm món' }).count(), 0);
    assert.deepEqual(network.filter(n => n.page === '3').map(n => n.page), ['3', '3']);
  });
  await check('Slow old page cannot mix into a new category', async () => {
    await goto('/dishes'); await page.reload(); await waitCount(12); holdOldQuery = true;
    await page.getByRole('button', { name: 'Tải thêm món' }).click();
    await page.locator('[name=category]').selectOption('Món chay'); await page.getByRole('button', { name: 'Tìm món' }).click();
    await waitCount(10); await page.waitForTimeout(800);
    assert.equal(await cards().count(), 10); assert.ok((await page.locator('.card-category').allTextContents()).every(c => c === 'Món chay'));
    holdOldQuery = false;
  });
  await check('Page numbers survive URL/reload/back and reset on filter; false and zero are preserved', async () => {
    await goto('/admin/dishes'); await page.locator('tbody tr').first().waitFor();
    await page.getByRole('button', { name: 'Trang 2', exact: true }).click(); await page.waitForURL(/page=2/); await page.locator('tbody').getByText('Món thử 013', { exact: true }).waitFor();
    await page.reload(); await page.locator('tbody').getByText('Món thử 013', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Trang trước' }).click(); await page.locator('tbody').getByText('Món thử 001', { exact: true }).waitFor();
    await page.goBack(); await page.locator('tbody').getByText('Món thử 013', { exact: true }).waitFor();
    await page.locator('[name=minPrice]').fill('0'); await page.locator('[name=available]').selectOption('false'); await page.getByRole('button', { name: 'Tìm món' }).click();
    await page.waitForURL(/available=false/); assert.match(page.url(), /minPrice=0/); assert.match(page.url(), /page=1(?:&|$)/);
    await page.locator('tbody tr').first().waitFor();
    await page.screenshot({ path: path.join(evidence, 'fixture-admin-pages.png'), fullPage: true });
  });
  await check('Infinite scroll automatically appends, does not repeat pages, reload starts at the first page', async () => {
    await goto('/explore'); await waitCount(12);
    await page.locator('.more-dishes').scrollIntoViewIfNeeded(); await waitCount(24);
    assert.equal(new Set(await page.locator('.card-title h3').allTextContents()).size, 24);
    await page.screenshot({ path: path.join(evidence, 'fixture-infinite-scroll.png'), fullPage: true });
    await page.reload(); await waitCount(12);
  });
  await check('Fuzzy search is primary and stays consistent across pages/filters; fallbacks and modes remain automatic', async () => {
    await goto('/dishes?q=huongvi'); await waitCount(12);
    assert.equal(await page.locator('[name=mode]').count(), 0);
    await page.getByText('Kết quả phù hợp với tên hoặc mô tả món ăn.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Tải thêm món' }).click(); await waitCount(24);
    assert.deepEqual(network.filter(n => n.q === 'huongvi').map(n => [n.mode, n.page]), [['fuzzy','1'],['basic','1'],['fulltext','1'],['fulltext','2']]);
    assert.equal(new URL(page.url().split('#')[1], base).searchParams.has('mode'), false);
    await goto('/dishes?q=monn'); await waitCount(12);
    await page.getByText('Gợi ý những món có tên gần giống.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Tải thêm món' }).click(); await waitCount(18);
    assert.deepEqual(network.filter(n => n.q === 'monn').map(n => [n.mode, n.page]), [['fuzzy', '1'], ['fuzzy', '2']]);
    assert.equal(await page.locator('[name=sort]').inputValue(), 'relevance');
    await goto(`/admin/dishes?${new URLSearchParams({ q: 'monn', category: 'Món chay', minPrice: '0', available: 'false' })}`);
    await page.locator('tbody tr').first().waitFor();
    const filtered = network.filter(n => n.q === 'monn' && n.category).at(-1);
    assert.equal(filtered.mode, 'fuzzy'); assert.equal(filtered.minPrice, '0'); assert.equal(filtered.available, 'false');
  });
  await check('Legacy ingredient arrays retain page numbers, full-set unit filtering and searchable picker', async () => {
    legacyIngredientResponse = true;
    try {
      await goto('/admin/ingredients?unit=ml'); await page.locator('tbody tr').first().waitFor();
      const expected = ingredients.filter(i => i.unit === 'ml').length;
      assert.equal(await page.locator('tbody tr').count(), expected); assert.ok((await page.locator('tbody td:nth-child(3)').allTextContents()).every(unit => unit === 'ml'));
      await page.locator('[name=ingredientQuery]').fill('nguyen lieu'); await page.getByRole('button', { name: 'Tìm nguyên liệu', exact: true }).click(); await page.locator('tbody tr').first().waitFor(); assert.equal(await page.locator('tbody tr').count(), expected); assert.match(page.url(), /unit=ml/);
      await goto('/admin/ingredients?page=2'); await page.locator('tbody tr').first().waitFor(); assert.equal(await page.locator('tbody tr').count(), 12);
      const ids = await page.locator('tbody td:first-child').allTextContents(); await page.reload(); await page.locator('tbody tr').first().waitFor(); assert.deepEqual(await page.locator('tbody td:first-child').allTextContents(), ids);
      await goto('/admin/dishes/new'); await page.locator('[data-chef-id="1"]').waitFor(); await page.locator('[name=ingredientSearch]').fill('dau hu'); await page.getByRole('button', { name: 'Chọn Đậu hũ', exact: true }).click(); assert.equal(await page.locator('[name=quantity-1]').inputValue(), '1');
    } finally { legacyIngredientResponse = false; }
  });
  await check('Chef search replaces dropdown, supports unaccented names/specialties and preserves recipes on edit', async () => {
    const release = pauseAPI(url => url.pathname === '/api/chefs');
    try { await goto('/admin/dishes/new'); await page.reload(); await page.locator('.chef-picker .skeleton-options').waitFor(); } finally { release(); }
    await page.locator('[data-chef-id="1"]').waitFor();
    assert.equal(await page.locator('select[name=chefId]').count(), 0);
    await page.locator('[name=name]').fill('Món chọn đầu bếp'); await page.locator('textarea[name=description]').fill('Chọn đầu bếp và nguyên liệu'); await page.locator('[name=price]').fill('0');
    await page.getByRole('button', { name: 'Thêm món ăn', exact: false }).click(); await page.locator('#field-chefId-error').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.name), 'chefSearch');
    await page.locator('[name=chefSearch]').fill('minh an'); await page.getByRole('button', { name: 'Chọn Nguyễn Minh An', exact: true }).click();
    assert.equal(await page.locator('[name=chefId]').inputValue(), '1');
    await page.locator('[name=chefSearch]').fill('hai san'); await page.getByRole('button', { name: 'Chọn Lê Quốc Bảo', exact: true }).click();
    assert.equal(await page.locator('[name=chefId]').inputValue(), '3');
    await page.locator('[name=chefSearch]').fill('khongco'); await page.getByText('Chưa tìm thấy đầu bếp phù hợp. Thử tên hoặc chuyên môn khác.', { exact: true }).waitFor();
    assert.equal(await page.locator('[name=chefId]').inputValue(), '3');
    await page.locator('[name=chefSearch]').fill('');
    await page.locator('[name=ingredientSearch]').fill('dau hu'); await page.getByRole('button', { name: 'Chọn Đậu hũ', exact: true }).click(); await page.locator('[name=quantity-1]').fill('50');
    const writeCount = writes.length; await page.locator('[name=chefSearch]').press('Enter'); assert.equal(writes.length, writeCount);
    await page.locator('.chef-picker').screenshot({ path: path.join(evidence, 'chef-search-picker.png') });
    await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.locator('.chef-picker').screenshot({ path: path.join(evidence, 'chef-search-picker-mobile.png') }); await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Thêm món ăn', exact: false }).click(); await page.waitForURL(/#\/admin\/dishes$/); await page.locator('tbody tr').first().waitFor();
    assert.equal(writes.at(-1).body.chefId, 3); assert.deepEqual(writes.at(-1).body.ingredients, [{ ingredientId: 1, quantity: 50 }]);
    const dish = rows.find(d => d.name === 'Món chọn đầu bếp');
    await goto(`/admin/dishes/${dish.id}/edit`); await page.locator('[data-chef-id="3"]').waitFor();
    assert.equal(await page.locator('[name=chefId]').inputValue(), '3'); assert.equal(await page.locator('[name=quantity-1]').inputValue(), '50');
    await page.locator('[name=chefSearch]').fill('minh an'); await page.getByRole('button', { name: 'Chọn Nguyễn Minh An', exact: true }).click();
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: false }).click(); await page.waitForURL(/#\/admin\/dishes$/); await page.locator('tbody tr').first().waitFor();
    assert.deepEqual(writes.at(-1).body, { chefId: 1 });
    await goto(`/admin/dishes/${dish.id}/edit`); await page.locator('[name=quantity-1]').waitFor(); assert.equal(await page.locator('[name=quantity-1]').inputValue(), '50');
  });
  await check('Ingredient admin uses server page numbers, URL restore and unaccented search with skeletons', async () => {
    await goto('/admin/ingredients'); await page.locator('tbody tr').first().waitFor();
    assert.equal(await page.locator('tbody tr').count(), 12);
    const release = pauseAPI(url => url.pathname === '/api/ingredients' && url.searchParams.get('page') === '2');
    try { await page.getByRole('button', { name: 'Trang 2', exact: true }).click(); await page.locator('.skeleton-table').waitFor(); } finally { release(); }
    await page.waitForURL(/page=2/); await page.locator('tbody tr').first().waitFor();
    const ids = await page.locator('tbody td:first-child').allTextContents();
    await page.reload(); await page.locator('tbody tr').first().waitFor(); assert.deepEqual(await page.locator('tbody td:first-child').allTextContents(), ids);
    await page.screenshot({ path: path.join(evidence, 'ingredient-admin-pages.png'), fullPage: true });
    await page.locator('[name=ingredientQuery]').fill('dau hu'); await page.getByRole('button', { name: 'Tìm nguyên liệu', exact: true }).click();
    await page.locator('tbody').getByText('Đậu hũ', { exact: true }).waitFor(); assert.equal(await page.locator('tbody tr').count(), 1); assert.match(page.url(), /page=1/);
    await page.getByRole('link', { name: 'Sửa Đậu hũ', exact: true }).click(); await page.locator('[name=name]').waitFor(); await page.getByRole('link', { name: 'Hủy', exact: true }).click();
    await page.locator('tbody').getByText('Đậu hũ', { exact: true }).waitFor(); assert.match(page.url(), /q=dau/);
    await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: path.join(evidence, 'ingredient-admin-mobile.png'), fullPage: true }); await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('Dish form searches/selects ingredients, validates quantities and persists/replaces/clears the recipe', async () => {
    await goto('/admin/dishes/new'); await page.locator('[data-chef-id="1"]').waitFor();
    await page.locator('[name=name]').fill('Món công thức thử'); await page.locator('textarea[name=description]').fill('Công thức thử'); await page.locator('[name=price]').fill('0'); await page.locator('[data-chef-id="1"]').click();
    const release = pauseAPI(url => url.pathname === '/api/ingredients' && url.searchParams.get('q') === 'muc');
    try { await page.locator('[name=ingredientSearch]').fill('muc'); await page.locator('.ingredient-picker .skeleton-options').waitFor(); } finally { release(); }
    await page.getByRole('button', { name: 'Chọn Mực', exact: true }).click(); await page.locator('[name=quantity-2]').fill('2.5');
    assert.equal(await page.getByRole('button', { name: 'Đã chọn Mực', exact: true }).isDisabled(), true);
    await page.locator('[name=ingredientSearch]').fill('dau hu'); await page.getByRole('button', { name: 'Chọn Đậu hũ', exact: true }).click(); await page.locator('[name=quantity-1]').fill('100');
    await page.screenshot({ path: path.join(evidence, 'dish-ingredient-picker.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: path.join(evidence, 'dish-ingredient-picker-mobile.png'), fullPage: true }); await page.setViewportSize({ width: 1440, height: 1000 });
    const count = writes.length; await page.locator('[name=quantity-2]').fill('0'); await page.getByRole('button', { name: 'Thêm món ăn', exact: false }).click(); await page.locator('.ingredient-picker [role=alert]').waitFor(); assert.equal(writes.length, count);
    await page.locator('[name=quantity-2]').fill('2.5'); await page.getByRole('button', { name: 'Thêm món ăn', exact: false }).click(); await page.waitForURL(/#\/admin\/dishes$/); await page.locator('tbody tr').first().waitFor();
    assert.deepEqual(writes.at(-1).body.ingredients, [{ ingredientId: 2, quantity: 2.5 }, { ingredientId: 1, quantity: 100 }]);
    const dish = rows.find(d => d.name === 'Món công thức thử');
    await goto(`/admin/dishes/${dish.id}/edit`); await page.locator('[name=quantity-2]').waitFor(); assert.equal(await page.locator('[name=quantity-2]').inputValue(), '2.5');
    await page.getByRole('button', { name: 'Bỏ Mực', exact: true }).click(); await page.locator('[name=quantity-1]').fill('150'); await page.getByRole('button', { name: 'Lưu thay đổi', exact: false }).click(); await page.waitForURL(/#\/admin\/dishes$/); await page.locator('tbody tr').first().waitFor();
    assert.deepEqual(writes.at(-1).body, { ingredients: [{ ingredientId: 1, quantity: 150 }] });
    await goto(`/admin/dishes/${dish.id}/edit`); await page.locator('[name=quantity-1]').waitFor(); await page.locator('[name=name]').fill('Món công thức cập nhật'); await page.getByRole('button', { name: 'Lưu thay đổi', exact: false }).click(); await page.waitForURL(/#\/admin\/dishes$/); await page.locator('tbody tr').first().waitFor(); assert.deepEqual(writes.at(-1).body, { name: 'Món công thức cập nhật' });
    await goto(`/admin/dishes/${dish.id}/edit`); await page.locator('[name=quantity-1]').waitFor(); await page.getByRole('button', { name: 'Bỏ Đậu hũ', exact: true }).click(); await page.getByRole('button', { name: 'Lưu thay đổi', exact: false }).click(); await page.waitForURL(/#\/admin\/dishes$/); await page.locator('tbody tr').first().waitFor(); assert.deepEqual(writes.at(-1).body, { ingredients: [] });
  });
  await check('Image source and HTTP 422 field errors keep the form draft', async () => {
    await goto('/admin/dishes/new'); await page.locator('[data-chef-id="1"]').waitFor();
    await page.locator('[name=name]').fill('SERVER_ERROR'); await page.locator('textarea[name=description]').fill('Một món ngon'); await page.locator('[name=price]').fill('0'); await page.locator('[data-chef-id="1"]').click();
    await page.locator('[name=imageSource][value=url]').check(); await page.locator('[name=imageUrl]').fill('https://images.example/food.png');
    await page.getByRole('button', { name: 'Thêm món ăn', exact: false }).click();
    await page.locator('#field-name-error').waitFor(); assert.equal(await page.locator('textarea[name=description]').inputValue(), 'Một món ngon');
    await page.locator('[name=name]').fill('Món URL mới'); await page.getByRole('button', { name: 'Thêm món ăn', exact: false }).click(); await page.waitForURL(/#\/admin\/dishes$/);
    assert.equal(writes.at(-1).body.imagePath, 'https://images.example/food.png'); assert.equal(writes.at(-1).body.price, 0);
  });
  await check('Mobile layout fits viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await goto('/dishes'); await waitCount(12);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(evidence, 'fixture-menu-mobile.png'), fullPage: true });
  });
  assert.deepEqual(runtimeErrors, []);
} catch (error) {
  await page.screenshot({ path: path.join(evidence, 'smoke-failure.png'), fullPage: true });
  console.log('Failure state', page.url(), await cards().count());
  throw error;
} finally {
  await writeFile(path.join(evidence, 'fe-smoke.json'), JSON.stringify({ source: 'intercepted fixtures, not Supabase evidence', results, runtimeErrors, network }, null, 2));
  await browser.close();
}
