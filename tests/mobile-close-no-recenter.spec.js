import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

/**
 * #925 — on mobile, closing the detail panel jumped the map back to the GPS
 * position. AppShell unmounts the map controls (LocateButton among them) while
 * a playground is selected on mobile; closing the panel remounted LocateButton,
 * whose onMount re-ran auto-locate and centred on the fix. Desktop never
 * unmounts the controls, which is why it only reproduced on a phone.
 */

const OSM_ID = fixture.features[0].properties.osm_id;

// The fixture playground sits in Berlin; the GPS fix is in Fulda, far enough
// that a recentre is unmistakable.
const PLAYGROUND_CENTRE = { lon: 13.4045, lat: 52.5205 };
const GPS = { latitude: 50.551, longitude: 9.675 };

function toLonLat([x, y]) {
  const R = 6378137;
  return {
    lon: (x / R) * (180 / Math.PI),
    lat: (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI),
  };
}

test.use({ viewport: { width: 390, height: 844 } });

test('closing the mobile detail panel does not recentre on the GPS fix', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(GPS);
  await injectApiConfig(page);
  await stubApiRoutes(page);

  // The deeplink suppresses the page-load auto-centre, so the view starts on
  // the playground while the location store already holds the Fulda fix.
  await page.goto(`/#W${OSM_ID}`);
  const back = page.locator('.mobile-back-btn');
  await expect(back).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(1000);

  await back.click();
  await expect(back).toBeHidden();
  // Past the back-to-map zoom-out (400 ms) and any GPS animation.
  await page.waitForTimeout(1500);

  const center = await page.evaluate(() => window.__spieli?.map?.getView().getCenter() ?? null);
  expect(center).not.toBeNull();
  const { lon, lat } = toLonLat(center);
  expect(Math.abs(lon - PLAYGROUND_CENTRE.lon), `lon ${lon} should stay near the playground`).toBeLessThan(0.1);
  expect(Math.abs(lat - PLAYGROUND_CENTRE.lat), `lat ${lat} should stay near the playground`).toBeLessThan(0.1);
});

// A first-time visitor has no permission at page load and grants it later (in
// production via the Locate button). The first fix kept the "already
// auto-located" flag behind the permission check, so the remount on close saw
// "granted", ran auto-locate for the first time and centred on the fix.
test('a permission granted after page load does not recentre on close', async ({ page, context }) => {
  await injectApiConfig(page);
  await stubApiRoutes(page);

  await page.goto(`/#W${OSM_ID}`);
  const back = page.locator('.mobile-back-btn');
  await expect(back).toBeVisible({ timeout: 8000 });

  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(GPS);

  await back.click();
  await expect(back).toBeHidden();
  await page.waitForTimeout(1500);

  const center = await page.evaluate(() => window.__spieli?.map?.getView().getCenter() ?? null);
  expect(center).not.toBeNull();
  const { lon, lat } = toLonLat(center);
  expect(Math.abs(lon - PLAYGROUND_CENTRE.lon), `lon ${lon} should stay near the playground`).toBeLessThan(0.1);
  expect(Math.abs(lat - PLAYGROUND_CENTRE.lat), `lat ${lat} should stay near the playground`).toBeLessThan(0.1);
});
