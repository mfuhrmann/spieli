import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

// #966 — pitch illustrations (#962) were generated but the pitch rows never
// rendered them. A tagged pitch (surface= is nearly universal) must show its
// attributes and the illustration when expanded.

const pg = fixture.features[0];
const ring = pg.geometry.type === 'Polygon' ? pg.geometry.coordinates[0] : pg.geometry.coordinates[0][0];
const [lon, lat] = ring[0];

test('a pitch row expands to its attributes and illustration', async ({ page }) => {
  await injectApiConfig(page);
  await stubApiRoutes(page);
  await page.route('**/rpc/get_equipment**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ type: 'FeatureCollection', features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { osm_id: 9660001, osm_type: 'W', leisure: 'pitch', sport: 'soccer', surface: 'grass' },
    }] }),
  }));
  // Never leave the machine: the proxied path or, with the proxy off in this
  // test config, the Wikimedia host itself.
  await page.route(/\/ext\/wikimedia\/|wikimedia\.org/, route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' }));

  await page.goto(`/#W${pg.properties.osm_id}`);
  const panel = page.locator('aside.info-panel');
  await expect(panel).toBeVisible({ timeout: 8000 });

  await panel.locator('button.device-toggle', { hasText: /Sports pitch|Sportpl/ }).click();
  const toggle = panel.locator('.pitch-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  const detail = panel.locator('.pitch-sub .device-detail');
  await expect(detail.locator('li')).toContainText(/Grass|Rasen/);
  await expect(detail.locator('img')).toHaveAttribute('src', /Football_pitch_metric\.svg/);
  await expect(detail.locator('img')).toHaveAttribute('alt', /Football|Fußball/);
  await expect(detail).toContainText(/Example image|Symbolbild/);
});
