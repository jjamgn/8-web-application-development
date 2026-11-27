import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mockApi } from './mock-api';

for (const { width, dpr, columns } of [
  { width: 375, dpr: 1, columns: 1 }, { width: 375, dpr: 2, columns: 1 },
  { width: 600, dpr: 1, columns: 2 }, { width: 1024, dpr: 1, columns: 3 },
  { width: 1440, dpr: 1, columns: 3 }, { width: 1440, dpr: 2, columns: 3 },
]) {
  test(`ảnh responsive ${width}px DPR ${dpr}, ${columns} cột`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    const network: { url: string; status: number; contentType?: string }[] = [];
    page.on('response', response => { if (response.url().includes('/media/')) network.push({ url: new URL(response.url()).pathname, status: response.status(), contentType: response.headers()['content-type'] }); });
    await mockApi(page);
    await page.goto('/photos');
    const image = page.locator('.photo-grid img').first();
    await expect(image).toBeVisible();
    await expect(image).toHaveJSProperty('complete', true);
    const evidence = await image.evaluate((node: HTMLImageElement) => ({
      src: node.getAttribute('src'), srcset: node.getAttribute('srcset'), sizes: node.sizes,
      width: node.getAttribute('width'), height: node.getAttribute('height'), loading: node.loading,
      alt: node.alt, currentSrc: new URL(node.currentSrc).pathname, renderedWidth: node.getBoundingClientRect().width,
      viewport: innerWidth, dpr: devicePixelRatio, naturalWidth: node.naturalWidth,
      gridColumns: getComputedStyle(node.closest('.photo-grid')!).gridTemplateColumns.split(' ').length,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    expect(evidence.gridColumns).toBe(columns);
    expect(evidence.overflow).toBe(false);
    expect(evidence.src).toMatch(/\/960.webp$/);
    expect(evidence.srcset).toContain('320w');
    expect(evidence.srcset).toContain('960w');
    expect(evidence.srcset).toContain('1600w');
    expect(evidence.width).toBe('1800'); expect(evidence.height).toBe('1200');
    expect(evidence.loading).toBe('lazy'); expect(evidence.alt).toBeTruthy();
    expect(evidence.naturalWidth).toBeGreaterThan(0);
    expect(evidence.currentSrc).toMatch(/\/(320|960|1600)\.webp$/);
    const expectedCell = Math.min(width - 48, 1200) / columns - 24 * (columns - 1) / columns;
    expect(Math.abs(evidence.renderedWidth - expectedCell)).toBeLessThan(1);
    const folder = resolve('../docs/evidence/mock-browser');
    await mkdir(folder, { recursive: true });
    await page.screenshot({ path: resolve(folder, `gallery-${width}-dpr${dpr}.png`), fullPage: true });
    await writeFile(resolve(folder, `responsive-${width}-dpr${dpr}.json`), JSON.stringify({ mode: 'MOCK — NOT LIVE ACCEPTANCE', ...evidence, network }, null, 2));
    await context.close();
  });
}
