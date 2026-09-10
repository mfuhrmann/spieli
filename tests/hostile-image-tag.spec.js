import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

// The values that reach the photo gallery come from OSM tags, which are
// arbitrary attacker-editable strings. app/src/lib/commons.js validates that an
// `image` tag points at a Wikimedia host before rendering it, and until #854
// that code check was the ONLY thing between a crafted tag and the visitor's
// browser fetching from a host of the tagger's choosing.
//
// These tests assert the code check on its own terms. The Playwright server
// serves the built app without nginx, so no CSP header is present here — which
// is the point: the first line has to hold without the policy behind it. The
// generated policy is asserted separately in the "CSP must follow the
// configuration" CI job.

const EVIL = 'https://evil.example.com';

/** A copy of the fixture whose single playground carries the given tags. */
function withTags(tags) {
  const fc = structuredClone(fixture);
  Object.assign(fc.features[0].properties, tags);
  return fc;
}

async function loadWith(page, tags) {
  const hits = [];
  // Anything reaching this route is a request that left for the hostile host.
  await page.route('**://evil.example.com/**', route => {
    hits.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', body: '' });
  });
  await injectApiConfig(page);
  await stubApiRoutes(page, withTags(tags));
  await page.goto(`/#W${fixture.features[0].properties.osm_id}`);
  await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });
  // The photos accordion section is open by default, so the gallery has
  // mounted by now. Give any request it would make time to be issued.
  await page.waitForTimeout(1200);
  return hits;
}

test.describe('A hostile OSM image tag reaches no network', () => {
  // Control. Without this the negative assertions below would also pass if the
  // gallery never rendered at all, or if the route interception were wired
  // wrongly — they would be asserting nothing.
  test('control: a legitimate Wikimedia image IS fetched', async ({ page }) => {
    const wanted = [];
    await page.route('**://upload.wikimedia.org/**', route => {
      wanted.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'image/png', body: '' });
    });
    await injectApiConfig(page);
    await stubApiRoutes(page, withTags({ image: 'https://upload.wikimedia.org/legit.jpg' }));
    await page.goto(`/#W${fixture.features[0].properties.osm_id}`);
    await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });
    await expect.poll(() => wanted.length, { timeout: 5000 }).toBeGreaterThan(0);
  });

  test('a direct image URL on an unrelated host is not fetched', async ({ page }) => {
    const hits = await loadWith(page, { image: `${EVIL}/tracker.png` });
    expect(hits).toEqual([]);
  });

  test('a host-suffix spoof of a Wikimedia domain is not fetched', async ({ page }) => {
    // wikimedia.org.evil.example.com passes a naive "contains wikimedia.org"
    // check and is exactly what the anchored regex in commons.js exists for.
    const hits = await loadWith(page, { image: 'https://wikimedia.org.evil.example.com/x.jpg' });
    expect(hits).toEqual([]);
  });

  test('a plain-http Wikimedia URL is not fetched', async ({ page }) => {
    // Rejected as mixed content by commons.js before the browser would.
    const hits = await loadWith(page, { image: 'http://upload.wikimedia.org/x.jpg' });
    expect(hits).toEqual([]);
  });

  test('a hostile tag does not break the panel around it', async ({ page }) => {
    // A rejected tag must render nothing rather than throw: the failure mode to
    // avoid is a tag that takes the whole detail panel down with it.
    await loadWith(page, { image: `${EVIL}/tracker.png` });
    await expect(page.locator('aside.info-panel')).toBeVisible();
    await expect(page.locator(`img[src^="${EVIL}"]`)).toHaveCount(0);
  });

  test('a hostile tag in wikimedia_commons is not fetched either', async ({ page }) => {
    const hits = await loadWith(page, { wikimedia_commons: `File:../../${EVIL}/x.jpg` });
    expect(hits).toEqual([]);
  });
});
