import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

// When the container proxies the external services, config.js hands the
// frontend same-origin /ext/ paths instead of third-party origins. These tests
// pin the frontend half of that: that every service module actually reads its
// base from config, and that a proxied deployment issues no cross-origin
// request for them.
//
// This suite runs against the Vite preview server, so there is no nginx and
// nothing is really proxied — the /ext/ requests 404. That is fine and is the
// point: what is under test is WHERE the browser sends them. The proxies
// themselves are exercised against live upstreams by hand and asserted in the
// "External-service proxies" CI job.

const OSM_ID = fixture.features[0].properties.osm_id;

const PROXIED = {
  nominatimBaseUrl: '/ext/nominatim',
  commonsApiUrl: '/ext/commons/w/api.php',
  commonsFileBase: '/ext/wikimedia',
  mangroveApiUrl: '/ext/mangrove',
  panoramaxApiUrl: '/ext/panoramax',
};

/** Record every request, split into same-origin and cross-origin. */
async function recordRequests(page) {
  const all = [];
  page.on('request', r => {
    try {
      all.push(new URL(r.url()));
    } catch { /* about:blank and friends */ }
  });
  return {
    ext: () => all.filter(u => u.pathname.startsWith('/ext/')).map(u => u.pathname),
    crossOrigin: () => all.filter(u => !['localhost', '127.0.0.1'].includes(u.hostname))
                          .map(u => u.href),
  };
}

test.describe('Proxied deployment routes external services same-origin', () => {
  test('a location search goes to /ext/nominatim, not to OSM', async ({ page }) => {
    const rec = await recordRequests(page);
    await injectApiConfig(page, PROXIED);
    await stubApiRoutes(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 8000 });

    const box = page.locator('input[type="search"], input[type="text"]').first();
    await box.fill('Fulda');
    await expect.poll(() => rec.ext().filter(p => p.startsWith('/ext/nominatim')).length,
                      { timeout: 8000 }).toBeGreaterThan(0);
    expect(rec.crossOrigin().filter(u => u.includes('nominatim.openstreetmap.org'))).toEqual([]);
  });

  test('photos and reviews go to /ext/, not to Wikimedia or Mangrove', async ({ page }) => {
    const rec = await recordRequests(page);
    await injectApiConfig(page, PROXIED);
    await stubApiRoutes(page, (() => {
      const fc = structuredClone(fixture);
      Object.assign(fc.features[0].properties, {
        wikimedia_commons: 'Category:Playgrounds in Germany',
        image: 'https://upload.wikimedia.org/wikipedia/commons/a/b/Foo.jpg',
      });
      return fc;
    })());
    await page.goto(`/#W${OSM_ID}`);
    await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });

    // The photos section is open by default, so the Commons API call is made
    // on selection. Reviews need the explicit expand added in #851.
    await expect.poll(() => rec.ext().filter(p => p.startsWith('/ext/commons')).length,
                      { timeout: 8000 }).toBeGreaterThan(0);

    const toggle = page.locator('aside.info-panel button.section-btn')
                       .filter({ hasText: /Reviews|Bewertungen/ });
    await toggle.click();
    await expect.poll(() => rec.ext().filter(p => p.startsWith('/ext/mangrove')).length,
                      { timeout: 8000 }).toBeGreaterThan(0);

    for (const host of ['commons.wikimedia.org', 'upload.wikimedia.org',
                        'thumb.wikimedia.org', 'api.mangrove.reviews']) {
      expect(rec.crossOrigin().filter(u => u.includes(host)),
             `${host} must not be contacted directly`).toEqual([]);
    }
  });

  test('control: without the proxy config the third parties ARE contacted', async ({ page }) => {
    // Without this the assertions above would pass on a build that simply
    // never issued the requests at all.
    const rec = await recordRequests(page);
    await injectApiConfig(page);          // defaults: direct third-party origins
    await stubApiRoutes(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 8000 });

    const box = page.locator('input[type="search"], input[type="text"]').first();
    await box.fill('Fulda');
    await expect.poll(
      () => rec.crossOrigin().filter(u => u.includes('nominatim.openstreetmap.org')).length,
      { timeout: 8000 },
    ).toBeGreaterThan(0);
    expect(rec.ext()).toEqual([]);
  });
});
