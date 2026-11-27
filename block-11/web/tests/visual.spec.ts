import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chooseFiles, mockApi, owner, photo } from './mock-api';

for (const width of [375, 1440]) {
  test(`các form và dialog không tràn màn hình ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await mockApi(page);
    const folder = resolve('../docs/evidence/mock-browser');
    await mkdir(folder, { recursive: true });
    for (const path of ['/login', '/register']) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: path === '/login' ? 'Đăng nhập' : 'Tạo tài khoản', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await page.screenshot({ path: resolve(folder, `${path.slice(1)}-${width}.png`), fullPage: true });
    }
    state.user = owner;
    await page.goto('/photos/upload');
    await chooseFiles(page, 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: resolve(folder, `upload-${width}.png`), fullPage: true });
    await page.goto(`/photos/${photo(1).id}`);
    await page.getByRole('button', { name: 'Xóa ảnh', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: resolve(folder, `delete-dialog-${width}.png`), fullPage: true });
  });
}
