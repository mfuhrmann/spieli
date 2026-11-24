import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes, makePlayground } from './helpers.js';

/**
 * #1081 — the interface font is Nunito, self-hosted: no request may leave the
 * origin for a font. Photos show as a strip of thumbnails.
 */

test('Nunito is served from this origin; no font request leaves it', async ({ page }) => {
  const fontRequests = [];
  page.on('request', r => {
    if (r.resourceType() === 'font' || /fonts\.(googleapis|gstatic)\.com/.test(r.url())) fontRequests.push(r.url());
  });
  await injectApiConfig(page);
  await stubApiRoutes(page);
  await page.goto('/');
  await expect(page.locator('.ol-viewport')).toBeVisible();
  // Text is on screen, so the font has been requested by now.
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  const loaded = await page.evaluate(() =>
    [...document.fonts].some(f => /Nunito/.test(f.family) && f.status === 'loaded'));
  expect(loaded).toBe(true);
  const origin = new URL(page.url()).origin;
  expect(fontRequests.length).toBeGreaterThan(0);
  for (const u of fontRequests) expect(new URL(u).origin).toBe(origin);
});

test('photos show as a strip of thumbnails; a tap opens the viewer', async ({ page }) => {
  const pg = makePlayground({ osmId: 1081, name: 'Streifenplatz' });
  pg.properties.panoramax = 'aaaaaaaa-0000-0000-0000-000000000001';
  pg.properties['panoramax:1'] = 'aaaaaaaa-0000-0000-0000-000000000002';
  await page.route('**://api.panoramax.xyz/**', route => route.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  }));
  await injectApiConfig(page);
  await stubApiRoutes(page, { type: 'FeatureCollection', features: [pg] });
  await page.goto('/#W1081');
  const strip = page.locator('aside.info-panel [data-testid="photo-strip"]');
  await expect(strip.locator('button.strip-thumb')).toHaveCount(2, { timeout: 8000 });
  // no large hero image any more
  await expect(strip.locator('.commons-hero, .panoramax-preview img[style*="240px"]')).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  await strip.locator('button.strip-thumb').nth(1).click();
  await expect(page.locator('.panoramax-modal iframe')).toHaveCount(1);
});

test('Bootstrap Icons load, so bi-* icons are not empty (#1085)', async ({ page }) => {
  await injectApiConfig(page);
  await stubApiRoutes(page);
  await page.goto('/');
  await expect(page.locator('.ol-viewport')).toBeVisible();
  // An icon in the page forces the face to load.
  await page.evaluate(() => {
    const i = document.createElement('i'); i.className = 'bi bi-camera'; i.id = 'bi-probe'; document.body.appendChild(i);
  });
  await page.waitForFunction(() => [...document.fonts].some(f => /bootstrap-icons/.test(f.family) && f.status === 'loaded'), null, { timeout: 5000 });
  const content = await page.locator('#bi-probe').evaluate(el => getComputedStyle(el, '::before').content);
  expect(content).not.toBe('none');
});
