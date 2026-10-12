import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

/**
 * #939 — spieli is installable as an app. The browser needs a linked manifest
 * whose icons actually load (they used to 404), and the Info dialog offers
 * "Install as app" where the browser fires `beforeinstallprompt` (Chromium).
 */

test('the page links a manifest whose icons load', async ({ page, request }) => {
  await injectApiConfig(page);
  await stubApiRoutes(page);
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(href);
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.start_url).toBe('/');
  expect(manifest.display).toBe('standalone');
  const purposes = manifest.icons.map(i => `${i.sizes}:${i.purpose}`).sort();
  expect(purposes).toEqual(['192x192:any', '192x192:maskable', '512x512:any', '512x512:maskable']);
  for (const icon of manifest.icons) {
    const r = await request.get(new URL(icon.src, new URL(href, page.url())).toString());
    expect(r.ok(), icon.src).toBe(true);
    expect(r.headers()['content-type']).toContain('image/png');
  }
});

test('"Install as app" appears only when the browser offers it', async ({ page }) => {
  await injectApiConfig(page);
  await stubApiRoutes(page);
  await page.goto('/');
  const info = page.locator('.controls-row .control-btn').first();
  const install = page.getByRole('button', { name: 'Install as app' });

  // No offer from the browser (Safari, Firefox, already installed): no entry.
  await info.click();
  await expect(page.locator('.modal-box')).toBeVisible();
  await expect(install).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Simulate Chromium's offer; clicking hands it back to the browser once.
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => { window.__installPrompted = (window.__installPrompted ?? 0) + 1; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await info.click();
  await install.click();
  expect(await page.evaluate(() => window.__installPrompted)).toBe(1);
  await expect(install).toHaveCount(0);
});
