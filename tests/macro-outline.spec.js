import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes, injectHubConfig, stubHubRegistry, makePlayground } from './helpers.js';

// The hub macro tier paints a world outline *under* the basemap, so the area
// outside the federation's tileset is not silently blank — a regional tileset
// answers 204 above ~z7 rather than erroring, and an empty tile is
// indistinguishable from an empty map.
//
// The last open acceptance box on #830 and #828. The visibility rule itself is
// a one-liner (`setVisible(tier === 'macro')`); what is worth pinning is the
// FETCH policy around it, because that is where the cost is and where a
// regression would be silent: a standalone deployment must never pull the
// 164 kB asset, and it must not be fetched before the macro tier is entered.

const outlineRequests = (page) => {
  const hits = [];
  page.on('request', r => {
    if (r.url().includes('world-110m.json')) hits.push(r.url());
  });
  return hits;
};

const instanceA = {
  slug: 'a', url: '/api-a', name: 'A',
  playgrounds: { type: 'FeatureCollection', features: [makePlayground({ osmId: 111, name: 'A', lon: 9.67, lat: 50.55 })] },
  meta: { name: 'Region A', version: '0.10.0-rc', bbox: [9.5, 50.4, 9.8, 50.7] },
};
const instanceB = {
  slug: 'b', url: '/api-b', name: 'B',
  playgrounds: { type: 'FeatureCollection', features: [makePlayground({ osmId: 222, name: 'B', lon: 8.68, lat: 50.11 })] },
  meta: { name: 'Region B', version: '0.10.0-rc', bbox: [8.6, 50.0, 8.7, 50.2] },
};

test.describe('Hub macro world outline', () => {
  test('is fetched once the macro tier is active', async ({ page }) => {
    const hits = outlineRequests(page);
    // mapZoom 6 on purpose: the helper defaults to 8, which is ABOVE
    // macroMaxZoom (7), so the cluster tier is active there and the outline is
    // correctly not fetched. Asserting against the default would have tested
    // the wrong tier.
    await injectHubConfig(page, { mapZoom: 6 });
    await stubHubRegistry(page, { instanceA, instanceB });
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 8000 });
    await expect.poll(() => hits.length, { timeout: 8000 }).toBeGreaterThan(0);
  });

  test('is served from this instance, not a third party', async ({ page }) => {
    // It is a bundled asset precisely so the macro view costs no external
    // request; a CDN-hosted outline would reintroduce exactly what #855 removed.
    const hits = outlineRequests(page);
    await injectHubConfig(page, { mapZoom: 6 });
    await stubHubRegistry(page, { instanceA, instanceB });
    await page.goto('/');
    await expect.poll(() => hits.length, { timeout: 8000 }).toBeGreaterThan(0);
    for (const u of hits) {
      expect(new URL(u).hostname, 'the outline must be same-origin')
        .toMatch(/^(localhost|127\.0\.0\.1)$/);
    }
  });

  test('a standalone deployment never fetches it', async ({ page }) => {
    // Standalone has no macro tier, so the 164 kB asset must never be pulled.
    const hits = outlineRequests(page);
    await injectApiConfig(page);
    await stubApiRoutes(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(1500);
    expect(hits).toEqual([]);
  });

  test('it is fetched at most once, not on every macro transition', async ({ page }) => {
    // loadMacroOutline() is called on EVERY transition into macro, and the
    // orchestrator publishes the tier on init and again on the first moveend,
    // so the guard flag is what stops a second 164 kB fetch. It deliberately
    // stays set after a failure too, so a missing asset is not re-requested on
    // each entry.
    const hits = outlineRequests(page);
    await injectHubConfig(page, { mapZoom: 6 });
    await stubHubRegistry(page, { instanceA, instanceB });
    await page.goto('/');
    await expect.poll(() => hits.length, { timeout: 8000 }).toBeGreaterThan(0);
    await page.waitForTimeout(2000);
    expect(hits.length, 'the outline must not be refetched per macro entry').toBe(1);
  });
});
