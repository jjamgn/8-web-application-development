import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { mockApi, owner } from './mock-api';

const evidence = fileURLToPath(new URL('../../docs/evidence/hover-modal/', import.meta.url));

test('card actions only appear over hovered or keyboard-focused image', async ({ page }) => {
  const state = await mockApi(page, { user: owner });
  await page.goto('/photos');
  const first = page.locator('.photo-frame').first();
  const second = page.locator('.photo-frame').nth(1);
  await expect(first.locator('.action-buttons')).toBeHidden();
  await first.hover();
  await expect(first.getByRole('button', { name: 'Yêu thích', exact: true })).toBeVisible();
  await expect(first.getByRole('button', { name: 'Lưu vào bộ sưu tập', exact: true })).toBeVisible();
  await expect(first.getByRole('link', { name: 'Tải WebP', exact: true })).toBeVisible();
  await expect(second.locator('.action-buttons')).toBeHidden();
  const frame = (await first.boundingBox())!;
  for (const locator of [first.locator('.quick-actions'), first.locator('.download-actions')]) {
    const box = (await locator.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(frame.x);
    expect(box.y).toBeGreaterThanOrEqual(frame.y);
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
  }
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: evidence + 'gallery-hover.png', fullPage: true });
  await page.mouse.move(0, 0);
  await expect(first.locator('.action-buttons')).toBeHidden();
  await first.locator('.photo-link').focus();
  await expect(first.locator('.action-buttons')).toBeVisible();
  await first.getByRole('button', { name: 'Yêu thích', exact: true }).click();
  await expect.poll(() => state.favorites.length).toBe(1);
});

test('modal controls sit on the dark stage, download aligns right, sheet retains rounded corners', async ({ page }) => {
  await mockApi(page, { user: owner });
  await page.goto('/photos');
  await page.locator('.photo-link').nth(1).click();
  const modal = page.getByRole('dialog', { name: 'Chi tiết ảnh', exact: true });
  await expect(modal.locator('.detail-image')).toBeVisible();
  const panel = (await modal.locator('.photo-modal-panel').boundingBox())!;
  const close = (await modal.getByRole('button', { name: 'Đóng chi tiết ảnh' }).boundingBox())!;
  const prev = (await modal.getByRole('button', { name: 'Ảnh trước', exact: true }).boundingBox())!;
  const next = (await modal.getByRole('button', { name: 'Ảnh tiếp', exact: true }).boundingBox())!;
  expect(close.x + close.width).toBeLessThan(panel.x);
  expect(prev.x + prev.width).toBeLessThan(panel.x);
  expect(next.x).toBeGreaterThan(panel.x + panel.width);
  expect(await modal.locator('.photo-modal-panel').evaluate(el => getComputedStyle(el).borderRadius)).toBe('24px');
  const quick = (await modal.locator('.quick-actions').boundingBox())!;
  const download = (await modal.locator('.download-actions').boundingBox())!;
  expect(download.x).toBeGreaterThan(quick.x + quick.width);
  await expect(modal.locator('a[download]')).toHaveText('Tải WebP');
  await expect(modal.getByRole('button', { name: 'Ảnh trước', exact: true })).not.toContainText('Ảnh trước');
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: evidence + 'modal-desktop.png' });
  const oldTitle = await modal.locator('h1').innerText();
  await modal.getByRole('button', { name: 'Ảnh tiếp', exact: true }).click();
  await expect(modal.locator('h1')).not.toHaveText(oldTitle);
  await modal.locator('.photo-modal-content').evaluate(el => el.scrollTo(0, 500));
  await expect(modal.getByRole('button', { name: 'Đóng chi tiết ảnh' })).toBeVisible();
  await modal.getByRole('button', { name: 'Đóng chi tiết ảnh' }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('.photo-card')).toHaveCount(3);
});

test('touch devices expose image actions and mobile modal controls stay outside the sheet', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await mockApi(page, { user: owner });
    await page.goto('http://localhost:' + (process.env.PLAYWRIGHT_PORT || '5173') + '/photos');
    const first = page.locator('.photo-frame').first();
    await expect(first.getByRole('button', { name: 'Yêu thích', exact: true })).toBeVisible();
    await first.locator('.photo-link').click();
    const modal = page.getByRole('dialog', { name: 'Chi tiết ảnh', exact: true });
    await expect(modal.locator('.detail-image')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const panel = (await modal.locator('.photo-modal-panel').boundingBox())!;
    const close = (await modal.getByRole('button', { name: 'Đóng chi tiết ảnh' }).boundingBox())!;
    expect(close.y + close.height).toBeLessThan(panel.y);
    expect(await modal.locator('.photo-modal-content').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: evidence + 'modal-mobile.png' });
  } finally { await context.close(); }
});
