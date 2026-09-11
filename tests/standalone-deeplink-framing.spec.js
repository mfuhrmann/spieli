import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

/**
 * #774 — the standalone half of #721. The hub half was fixed in #722; this
 * path kept the pattern that fix abandoned.
 *
 * StandaloneApp decides whether the deeplink restore succeeded by listening
 * for a map `moveend` — but arms that listener only AFTER awaiting Nominatim.
 * A slow Nominatim means the restore's moveend has already passed, so the
 * 1500 ms fallback concludes nothing was restored and fits to the region,
 * throwing away the framing the restore just did.
 *
 * tests/hash-restore.spec.js could never catch this: it asserts the info
 * panel is visible, and the panel opens whether or not the map is moved away
 * afterwards. These tests assert where the view came to REST.
 *
 * Modelled on tests/hub-deeplink.spec.js:87, which does the same for hub.
 */

const OSM_ID = fixture.features[0].properties.osm_id;

// The fixture playground sits in Berlin (~13.4045, 52.5205). The stubbed
// region is deliberately far away so a wrong fit is unmistakable rather than
// a near-miss that a loose tolerance could swallow.
const REGION_BBOX = { minLat: 50.0, maxLat: 51.0, minLon: 9.0, maxLon: 10.0 };
const REGION_CENTRE = { lon: 9.5, lat: 50.5 };
const PLAYGROUND_CENTRE = { lon: 13.4045, lat: 52.5205 };

/** Stub Nominatim's region lookup, optionally delayed to force the ordering. */
async function stubRegionLookup(page, { delayMs = 0 } = {}) {
  await page.route('**/lookup**', async route => {
    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        name: 'Teststadt',
        boundingbox: [
          String(REGION_BBOX.minLat), String(REGION_BBOX.maxLat),
          String(REGION_BBOX.minLon), String(REGION_BBOX.maxLon),
        ],
      }]),
    });
  });
}

/** Read the map's resolved centre back as WGS84 degrees. */
async function centreInDegrees(page) {
  const center = await page.evaluate(() => window.__spieli?.map?.getView().getCenter() ?? null);
  expect(center, 'window.__spieli.map should be published by StandaloneApp').not.toBeNull();
  const R = 6378137;
  return {
    lon: (center[0] / R) * (180 / Math.PI),
    lat: (2 * Math.atan(Math.exp(center[1] / R)) - Math.PI / 2) * (180 / Math.PI),
  };
}

test.describe('Standalone deeplink framing', () => {
  test('a resolved deeplink keeps the view when the region lookup is slow', async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
    // 1500 ms is past the deeplink restore (one local get_playground plus a
    // 400 ms fit), so the restore's moveend fires BEFORE the watcher is armed
    // — the production ordering under a slow or rate-limited Nominatim.
    await stubRegionLookup(page, { delayMs: 1500 });

    await page.goto(`/#W${OSM_ID}`);
    await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });

    // Wait past the lookup delay plus the 1500 ms fallback timer plus fit
    // animation. The bug frames the playground first and clobbers it later,
    // so only the FINAL centre distinguishes fixed from broken.
    await page.waitForTimeout(3800);

    const { lon, lat } = await centreInDegrees(page);
    expect(Math.abs(lon - PLAYGROUND_CENTRE.lon),
      `lon ${lon} should stay on the playground, not fall back to the region`).toBeLessThan(0.1);
    expect(Math.abs(lat - PLAYGROUND_CENTRE.lat),
      `lat ${lat} should stay on the playground, not fall back to the region`).toBeLessThan(0.1);
  });

  test('an unrelated map movement does not suppress the region fallback', async ({ page }) => {
    // The mirror-image defect. `moveend` means "the map moved", not "the
    // deeplink restored", so any movement during load satisfies the check and
    // the fallback never runs — leaving the visitor on whatever view they
    // happened to be on when a deeplink FAILED to resolve.
    await injectApiConfig(page);
    await stubApiRoutes(page);
    await stubRegionLookup(page, { delayMs: 800 });

    // Deeplink that cannot resolve. The shared stub falls back to the first
    // fixture feature on an unknown id, which would mask the failure, so this
    // route is overridden to answer honestly with null.
    await page.route('**/rpc/get_playground?**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
    );

    // Anchor the move to the lookup actually resolving, not to first paint.
    // The deadline it has to slip inside (800 ms lookup + 1500 ms timer) is
    // measured from map mount, so a fixed wait after `canvas` becomes visible
    // drifts on a loaded runner: if paint takes longer than the margin, the
    // move lands after the fallback has already fired and the test fails for
    // a reason unrelated to the code.
    const lookupDone = page.waitForResponse(r => r.url().includes('/lookup'));
    await page.goto('/#W999999999');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 8000 });
    await lookupDone;

    // Short pause so the awaiting code resumes and arms the timer. Moving
    // BEFORE it is armed would make the test pass against the unfixed code
    // too — the old `map.once('moveend')` was armed at the same point, so it
    // would equally have missed the move.
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__spieli?.map?.getView().setCenter([0, 0]));

    await page.waitForTimeout(2200);

    const { lon, lat } = await centreInDegrees(page);
    expect(Math.abs(lon - REGION_CENTRE.lon),
      `lon ${lon} should have fallen back to the region after an unresolvable deeplink`).toBeLessThan(0.6);
    expect(Math.abs(lat - REGION_CENTRE.lat),
      `lat ${lat} should have fallen back to the region after an unresolvable deeplink`).toBeLessThan(0.6);
  });

  test('deselecting inside the fallback window does not yank the view to the region', async ({ page }) => {
    // Found in review of the first fix. The success signal has to answer "did
    // a restore ever deliver", not "is something selected right now" — the
    // distinction only shows up when the visitor deselects inside the 1500 ms
    // window, which two ordinary actions do: zooming out past clusterMaxZoom
    // (the tier deselect in StandaloneApp) and AppShell's mobile "back to
    // map". Reading the store live treats either as "nothing was restored"
    // and fits to the region on top of a deliberate user action.
    //
    // The original `moveend` flag latched, so it never exhibited this; a
    // replacement that does not latch is a regression rather than a fix.
    await injectApiConfig(page, { clusterMaxZoom: 13 });
    await stubApiRoutes(page);
    await stubRegionLookup(page, { delayMs: 800 });

    await page.goto(`/#W${OSM_ID}`);
    await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });

    // Zoom out past the cluster threshold: tier goes polygon → cluster, which
    // clears the selection — all inside the fallback window.
    await page.waitForTimeout(1100);
    await page.evaluate(() => window.__spieli?.map?.getView().setZoom(10));

    await page.waitForTimeout(2200);

    const { lon } = await centreInDegrees(page);
    expect(Math.abs(lon - PLAYGROUND_CENTRE.lon),
      `lon ${lon}: the visitor deselected deliberately, so the region fallback must not fire`).toBeLessThan(0.3);
  });
});
