import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

/**
 * #926 — "Take me there" did nothing in iOS Safari. It opened the geo: URL via
 * window.open(url, '_blank'), which Safari drops for a custom scheme, while
 * POIPanel's plain <a href="geo:…"> rows worked. The control is now a real
 * link: geo: in the same tab on mobile, OSM directions in a new tab on desktop.
 */

const OSM_ID = fixture.features[0].properties.osm_id;

async function load(page) {
  await injectApiConfig(page);
  await stubApiRoutes(page);
  await page.goto(`/#W${OSM_ID}`);
}

test.describe('desktop', () => {
  test('links to OSM directions in a new tab', async ({ page }) => {
    await load(page);
    const link = page.locator('aside.info-panel a.navigate-btn');
    await expect(link).toBeVisible({ timeout: 8000 });
    await expect(link).toHaveAttribute('href', /^https:\/\/www\.openstreetmap\.org\/directions\?/);
    await expect(link).toHaveAttribute('target', '_blank');
  });
});

test.describe('iPhone Safari', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });

  test('links to a geo: URL in the same tab', async ({ page }) => {
    await load(page);
    const link = page.locator('.mobile-detail-panel a.navigate-btn');
    await expect(link).toBeVisible({ timeout: 8000 });
    await expect(link).toHaveAttribute('href', /^geo:-?\d+(\.\d+)?,-?\d+(\.\d+)?\?q=/);
    await expect(link).not.toHaveAttribute('target', /.+/);
  });
});
