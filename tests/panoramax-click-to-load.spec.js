import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

// An iframe is not an image. It gets its own browsing context on the
// provider's origin, with cookies, localStorage and whatever script runs
// there — probing the live viewer showed it attempting to set a Matomo
// `_pk_id` cookie. That is the strongest third-party capability on the page,
// and until #852 it activated as soon as a playground with photos was
// selected, without the visitor asking to see a photo.
//
// Panoramax is also the one service that cannot be proxied (its thumbnail
// endpoint redirects to a per-instance derivative host), so this gate is the
// only thing standing between plain map use and that capability.

const OSM_ID = fixture.features[0].properties.osm_id;
const UUID = '11111111-2222-3333-4444-555555555555';

/** Fixture playground carrying a Panoramax photo, with the host stubbed out. */
async function loadWithPhoto(page) {
  const panoramaxHits = [];
  await page.route('**://api.panoramax.xyz/**', route => {
    panoramaxHits.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/jpeg', body: '' });
  });

  await injectApiConfig(page);
  const fc = structuredClone(fixture);
  fc.features[0].properties.panoramax = UUID;
  await stubApiRoutes(page, fc);
  await page.goto(`/#W${OSM_ID}`);
  await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });
  return panoramaxHits;
}

const preview = page => page.locator('aside.info-panel button.panoramax-preview');

test.describe('The Panoramax viewer waits to be asked', () => {
  test('selecting a playground with photos creates no iframe', async ({ page }) => {
    await loadWithPhoto(page);
    await page.waitForTimeout(1200);
    // The whole point: no browsing context on the provider's origin exists
    // until the visitor activates the preview.
    expect(await page.locator('iframe').count()).toBe(0);
    await expect(preview(page)).toBeVisible();
  });

  test('the thumbnail is still fetched, so the preview shows the photo', async ({ page }) => {
    // A placeholder that showed nothing would be a worse experience sold as
    // privacy. The thumbnail is a plain image request.
    const hits = await loadWithPhoto(page);
    await expect.poll(() => hits.filter(u => u.includes('/thumb.jpg')).length,
                      { timeout: 5000 }).toBeGreaterThan(0);
    expect(hits.filter(u => u.includes('?pic='))).toEqual([]);
  });

  test('activating the preview loads the viewer', async ({ page }) => {
    await loadWithPhoto(page);
    await preview(page).click();
    const frame = page.locator('.panoramax-modal iframe');
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute('src', /api\.panoramax\.xyz/);
  });

  test('the viewer iframe is hardened', async ({ page }) => {
    await loadWithPhoto(page);
    await preview(page).click();
    const frame = page.locator('.panoramax-modal iframe');
    await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    // The narrowest set the viewer actually works under: with allow-scripts
    // alone it renders no canvas at all.
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
  });

  test('the preview is reachable and activatable from the keyboard', async ({ page }) => {
    await loadWithPhoto(page);
    const btn = preview(page);
    // A real <button>, so focus and Enter come from the browser rather than
    // from a role="button" wrapper that has to reimplement both.
    await btn.focus();
    await expect(btn).toBeFocused();
    await expect(btn).toHaveAttribute('aria-label', /.+/);
    await page.keyboard.press('Enter');
    await expect(page.locator('.panoramax-modal iframe')).toHaveCount(1);
  });

  test('closing the modal destroys the iframe again', async ({ page }) => {
    await loadWithPhoto(page);
    await preview(page).click();
    await expect(page.locator('.panoramax-modal iframe')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('iframe')).toHaveCount(0);
  });
});
