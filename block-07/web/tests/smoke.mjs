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
const ingredientRows = [
  { id: 1, name: 'Đậu hũ', unit: 'g' },
  { id: 2, name: 'Nước cốt dừa', unit: 'ml' },
  { id: 3, name: 'Nấm đông cô', unit: 'g' },
  { id: 4, name: 'Đậu hũ non', unit: 'cái' },
  { id: 5, name: 'Trứng gà', unit: 'quả' },
];
let failPage = 0, holdOldQuery = false, ingredientFault = '';
await context.route('**/api/**', async route => {
  const req = route.request(), url = new URL(req.url()), p = url.searchParams;
  const parts = url.pathname.split('/'), resource = parts[2], id = Number(parts[3]);
  const headers = { 'access-control-allow-origin': base, 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': 'Content-Type' };
  const json = body => route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {});
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (req.method() === 'GET' && resource === 'specialties') return json({ ok: true, data: [{ id: 1, name: 'Món Việt' }, { id: 2, name: 'Món chay' }] });
  if (req.method() === 'GET' && resource === 'chefs') return json({ ok: true, data: [{ id: 1, name: 'Đầu bếp thử', specialties: [{ id: 1, name: 'Món Việt' }] }] });
  if (req.method() === 'GET' && resource === 'ingredients') {
    if (ingredientFault === 'http') return route.fulfill({ status: 500, headers, contentType: 'application/json', body: '{"message":"temporary"}' });
    return json({ ok: true, data: id ? ingredientRows.find(row => row.id === id) : ingredientFault === 'empty' ? [] : ingredientRows });
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
  await check('Literal and full-text search take priority; fuzzy is a fallback and the selected mode stays consistent', async () => {
    await goto('/dishes?q=huongvi'); await waitCount(12);
    assert.equal(await page.locator('[name=mode]').count(), 0);
    await page.getByText('Kết quả phù hợp với tên, mô tả hoặc nguyên liệu, có dấu hoặc không dấu.', { exact: true }).waitFor();
    assert.equal(await page.locator('[name=sort]').isDisabled(), false);
    assert.equal(await page.locator('[name=sort]').inputValue(), 'name_asc');
    await page.getByRole('button', { name: 'Tải thêm món' }).click(); await waitCount(24);
    assert.deepEqual(network.filter(n => n.q === 'huongvi').map(n => [n.mode, n.page]), [['basic','1'],['fulltext','1'],['fulltext','2']]);
    assert.equal(new URL(page.url().split('#')[1], base).searchParams.has('mode'), false);
    await goto('/dishes?q=monn'); await waitCount(12);
    await page.getByText('Gợi ý món có tên hoặc nguyên liệu gần giống, có dấu hoặc không dấu.', { exact: true }).waitFor();
    assert.equal(await page.locator('[name=sort]').isDisabled(), true);
    assert.equal(await page.locator('[name=sort]').inputValue(), 'relevance');
    assert.deepEqual(network.filter(n => n.q === 'monn').map(n => n.mode), ['basic', 'fulltext', 'fuzzy']);
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
  await check('Ingredient name/unit filters support Vietnamese without accents and survive reload/edit/back', async () => {
    await goto('/admin/ingredients');
    await page.getByRole('heading', { name: 'Quản lý nguyên liệu', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 5);
    assert.equal(await page.locator('.site-header').getByRole('link', { name: 'Quản trị', exact: true }).textContent(), 'Quản trị');
    await page.getByLabel('Tìm theo tên nguyên liệu').fill('DAU HU');
    await page.getByLabel('Đơn vị', { exact: true }).selectOption('g');
    await page.getByRole('button', { name: 'Tìm nguyên liệu', exact: true }).click();
    await page.getByText('1 / 5 nguyên liệu', { exact: true }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 1);
    await page.locator('tbody').getByText('Đậu hũ', { exact: true }).waitFor();
    assert.equal(new URL(page.url().split('#')[1], base).searchParams.get('q'), 'DAU HU');
    await page.reload();
    await page.getByText('1 / 5 nguyên liệu', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Tìm theo tên nguyên liệu').inputValue(), 'DAU HU');
    assert.equal(await page.getByLabel('Đơn vị', { exact: true }).inputValue(), 'g');
    await page.getByRole('link', { name: 'Sửa Đậu hũ', exact: true }).click();
    await page.getByRole('heading', { name: 'Sửa nguyên liệu', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Hủy', exact: true }).click();
    await page.getByText('1 / 5 nguyên liệu', { exact: true }).waitFor();
    ingredientFault = 'http';
    await page.getByRole('link', { name: 'Sửa Đậu hũ', exact: true }).click();
    await page.getByRole('heading', { name: 'Chưa thể tải dữ liệu', exact: true }).waitFor();
    ingredientFault = '';
    await page.getByRole('link', { name: '← Danh sách nguyên liệu', exact: true }).click();
    await page.getByText('1 / 5 nguyên liệu', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Xóa điều kiện', exact: true }).click();
    await page.getByText('5 / 5 nguyên liệu', { exact: true }).waitFor();
    await page.goBack();
    await page.getByText('1 / 5 nguyên liệu', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Xóa điều kiện', exact: true }).click();
    await page.getByText('5 / 5 nguyên liệu', { exact: true }).waitFor();
    await page.getByLabel('Tìm theo tên nguyên liệu').fill('chưa áp dụng');
    await page.getByRole('button', { name: 'Xóa điều kiện', exact: true }).click();
    assert.equal(await page.getByLabel('Tìm theo tên nguyên liệu').inputValue(), '');
    await page.getByLabel('Đơn vị', { exact: true }).selectOption('ml');
    await page.getByRole('button', { name: 'Tìm nguyên liệu', exact: true }).click();
    await page.getByText('1 / 5 nguyên liệu', { exact: true }).waitFor();
    await page.locator('tbody').getByText('Nước cốt dừa', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(evidence, 'fixture-ingredients-desktop.png'), fullPage: true });
    await page.getByLabel('Tìm theo tên nguyên liệu').fill('NẤM');
    await page.getByRole('button', { name: 'Tìm nguyên liệu', exact: true }).click();
    await page.getByRole('heading', { name: 'Chưa có kết quả phù hợp', exact: true }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 0);
    await page.getByRole('button', { name: 'Xóa điều kiện', exact: true }).click();
    await page.getByText('5 / 5 nguyên liệu', { exact: true }).waitFor();
  });
  await check('Ingredient filters retain error/retry and empty states; mobile fits viewport', async () => {
    ingredientFault = 'http';
    await page.reload();
    await page.getByRole('heading', { name: 'Chưa thể tải dữ liệu', exact: true }).waitFor();
    ingredientFault = '';
    await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await page.getByText('5 / 5 nguyên liệu', { exact: true }).waitFor();
    ingredientFault = 'empty';
    await page.reload();
    await page.getByText('0 / 0 nguyên liệu', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Chưa có kết quả phù hợp', exact: true }).waitFor();
    ingredientFault = '';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByText('5 / 5 nguyên liệu', { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(evidence, 'fixture-ingredients-mobile.png'), fullPage: true });
  });
  await check('Mobile layout fits viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await goto('/dishes'); await waitCount(12);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(await page.locator('.image-arrow').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Khám phá thực đơn', exact: true }).textContent(), 'Khám phá thực đơn');
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
