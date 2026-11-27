import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { mockApi, owner, photo } from './mock-api';

const evidence = fileURLToPath(new URL('../../docs/evidence/author-download/', import.meta.url));

test('author avatar/name appear only over the image and also in detail', async ({ page }) => {
  const picture = photo(1); picture.uploader = { ...owner, avatarUrl: '/media/photos/avatar/320.webp' };
  await mockApi(page, { photos: [picture], total: 1 });
  await page.goto('/photos');
  const frame = page.locator('.photo-frame');
  const author = frame.getByRole('link', { name: owner.name, exact: true });
  await expect(author).toBeHidden();
  await frame.hover();
  await expect(author).toBeVisible();
  await expect(author.locator('img')).toHaveAttribute('src', picture.uploader.avatarUrl!);
  await expect(page.locator('.photo-card > .card-author')).toHaveCount(0);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: evidence + 'author-hover.png', fullPage: true });
  await frame.locator('.photo-link').click();
  const modal = page.getByRole('dialog', { name: 'Chi tiết ảnh', exact: true });
  await expect(modal.locator('.detail-author')).toContainText(owner.name);
  await expect(modal.locator('.detail-author img')).toHaveAttribute('src', picture.uploader.avatarUrl!);
  await expect(modal.locator('.photo-byline')).not.toContainText('Ảnh của');
});

test('split download defaults to largest, selecting a size downloads immediately, Esc only closes its menu', async ({ page }) => {
  await mockApi(page);
  await page.goto('/photos'); await page.locator('.photo-link').first().click();
  const modal = page.getByRole('dialog', { name: 'Chi tiết ảnh', exact: true });
  await expect(modal.locator('.detail-image')).toBeVisible();
  const main = modal.locator('.download-default');
  const defaultDownload = page.waitForEvent('download'); await main.click();
  expect((await defaultDownload).url()).toContain('/1600.webp?download=1');
  const toggle = modal.getByRole('button', { name: 'Chọn kích thước tải WebP' });
  await toggle.click(); const menu = page.getByRole('menu', { name: 'Kích thước WebP' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveCount(3);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: evidence + 'download-menu-desktop.png' });
  const sizedDownload = page.waitForEvent('download');
  await menu.getByRole('menuitem', { name: /^320 ×/ }).click();
  expect((await sizedDownload).url()).toContain('/320.webp?download=1');
  await expect(menu).not.toBeVisible();
  await expect(main).toHaveAttribute('href', /\/1600\.webp\?download=1$/);
  await toggle.focus(); await page.keyboard.press('ArrowDown');
  await expect(menu).toBeVisible();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: /^320 ×/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible(); await expect(modal).toBeVisible(); await expect(toggle).toBeFocused();
});

test('fallback avatar and mobile download popup stay usable inside rounded modal', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/photos'); await page.locator('.photo-link').first().click();
  const modal = page.getByRole('dialog', { name: 'Chi tiết ảnh', exact: true });
  await expect(modal.locator('.detail-author .author-avatar')).toHaveText('LN');
  await modal.getByRole('button', { name: 'Chọn kích thước tải WebP' }).click();
  const menu = page.getByRole('menu', { name: 'Kích thước WebP' });
  await expect(menu).toBeVisible();
  const rect = (await menu.boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x + rect.width).toBeLessThanOrEqual(390);
  expect(rect.y).toBeGreaterThanOrEqual(0); expect(rect.y + rect.height).toBeLessThanOrEqual(844);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: evidence + 'download-menu-mobile.png' });
  await page.mouse.click(2, 300); await expect(menu).not.toBeVisible();
  await expect(modal).toBeVisible();
});
