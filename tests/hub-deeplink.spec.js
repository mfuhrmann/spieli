import { test, expect } from '@playwright/test';
import { injectHubConfig, stubHubRegistry, makePlayground } from './helpers.js';

// Shared osm_id so the broadcast case has a deterministic match in both backends.
const SHARED_OSM_ID = 999;

const instanceA = {
  slug: 'slug-a',
  url: '/api-a',
  name: 'Instanz A',
  playgrounds: {
    type: 'FeatureCollection',
    features: [
      makePlayground({ osmId: 111, name: 'Only in A', lon: 9.675, lat: 50.551 }),
      makePlayground({ osmId: SHARED_OSM_ID, name: 'Shared A copy', lon: 9.700, lat: 50.600 }),
    ],
  },
  meta: { name: 'Region A', version: '0.2.1', bbox: [9.6, 50.5, 9.7, 50.6] },
};

const instanceB = {
  slug: 'slug-b',
  url: '/api-b',
  name: 'Instanz B',
  playgrounds: {
    type: 'FeatureCollection',
    features: [
      makePlayground({ osmId: 222, name: 'Only in B', lon: 8.680, lat: 50.110 }),
      makePlayground({ osmId: SHARED_OSM_ID, name: 'Shared B copy', lon: 8.700, lat: 50.150 }),
    ],
  },
  meta: { name: 'Region B', version: '0.2.1', bbox: [8.6, 50.0, 8.7, 50.2] },
};

test.describe('Hub deep-link', () => {
  test.beforeEach(async ({ page }) => {
    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA, instanceB });
  });

  test('slug-scoped hash selects on the matching backend', async ({ page }) => {
    await page.goto(`/#slug-a/W111`);
    const panel = page.locator('aside.info-panel');
    await expect(panel).toBeVisible({ timeout: 8000 });
    await expect(panel).toContainText('Only in A');
    await expect(page).toHaveURL(/#slug-a\/W111$/);
  });

  test('slug-less hash still selects via broadcast search', async ({ page }) => {
    await page.goto(`/#W222`);
    const panel = page.locator('aside.info-panel');
    await expect(panel).toBeVisible({ timeout: 8000 });
    await expect(panel).toContainText('Only in B');
    // Selecting a feature whose backend carries a slug rewrites the hash
    // into the canonical slug-scoped form.
    await expect(page).toHaveURL(/#slug-b\/W222$/);
  });

  test('broadcast with duplicate osm_id still produces a selection', async ({ page }) => {
    await page.goto(`/#W${SHARED_OSM_ID}`);
    const panel = page.locator('aside.info-panel');
    await expect(panel).toBeVisible({ timeout: 8000 });
    // Which backend wins depends on which registry fetch resolves first — the
    // guarantee from the spec is just that *some* valid match is selected.
    //
    // We deliberately do NOT assert the "duplicate osm_id" console.warn here:
    // it only fires when both backends' features land before hashRestored
    // latches. In practice Playwright's route-fulfilled responses resolve
    // one-at-a-time, so Backend A typically wins with matches.length === 1 and
    // the warning never triggers. Pinning this would make the test flaky.
    await expect(panel).toContainText(/Shared [AB] copy/);
  });

  test('backend name subtitle shown in panel after hub selection', async ({ page }) => {
    await page.goto(`/#slug-a/W111`);
    const panel = page.locator('aside.info-panel');
    await expect(panel).toBeVisible({ timeout: 8000 });
    await expect(panel.locator('.backend-name')).toContainText('Instanz A');
  });

  // Regression: a deeplink must frame the linked playground even when the
  // browser has a granted geolocation permission far from it. Previously
  // HubApp's initial `tryFit` ran its own getCurrentPosition and centred on the
  // GPS fix, clobbering AppShell's deeplink fit (the fix's moveend loses the
  // race against the later all-backends-settled GPS fit). W111 sits near
  // (9.675, 50.551); the GPS fix is in Berlin (~13.40, 52.52).
  test('deeplink frames the playground, not the granted GPS position', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 52.520, longitude: 13.404 });

    // Delay get_meta so "all backends settled" (which gates HubApp's GPS/bbox
    // fit) lands AFTER the deeplink restore fires its fit — reproducing the
    // production ordering (~16 backends settle slowly) where the GPS fit ran
    // last and clobbered the deeplink. Without this the 2-backend registry
    // settles so fast the deeplink fit wins the race even with the bug present.
    await page.route('**/rpc/get_meta**', async route => {
      await new Promise(r => setTimeout(r, 800));
      await route.fallback();
    });

    await page.goto(`/#slug-a/W111`);
    const panel = page.locator('aside.info-panel');
    await expect(panel).toBeVisible({ timeout: 8000 });

    // Wait past the delayed-get_meta window (800 ms) plus fit animations so the
    // view has fully settled. The bug produces a transient frame on the
    // playground (deeplink fit) that is then clobbered by the later GPS fit, so
    // asserting the FINAL centre — not "ever near" — is what catches it.
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);

    const center = await page.evaluate(() => window.__spieli?.map?.getView().getCenter() ?? null);
    expect(center).not.toBeNull();
    const R = 6378137;
    const lon = (center[0] / R) * (180 / Math.PI);
    const lat = (2 * Math.atan(Math.exp(center[1] / R)) - Math.PI / 2) * (180 / Math.PI);
    // Centred on the playground (~9.675, 50.551), not the Berlin GPS fix.
    expect(Math.abs(lon - 9.675), `lon ${lon} should be near playground, not GPS`).toBeLessThan(0.1);
    expect(Math.abs(lat - 50.551), `lat ${lat} should be near playground, not GPS`).toBeLessThan(0.1);
  });
});
