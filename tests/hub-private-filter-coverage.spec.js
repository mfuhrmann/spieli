import { test, expect } from '@playwright/test';
import { injectHubConfig, stubHubRegistry, makePlayground } from './helpers.js';

/**
 * #1002 review — a backend older than `filter_hide_private` answers the
 * retry without it with unfiltered counts. At the macro tier it must count as
 * "can't filter", so the country view never reads as fully filtered when it
 * isn't (#688).
 */

const instanceA = {
  slug: 'slug-a', url: '/api-a', name: 'Instanz A',
  playgrounds: { type: 'FeatureCollection', features: [makePlayground({ osmId: 111, name: 'A', lon: 9.675, lat: 50.551 })] },
  meta: { name: 'Region A', bbox: [9.6, 50.5, 9.7, 50.6] },
};
const instanceB = {
  slug: 'slug-b', url: '/api-b', name: 'Instanz B',
  playgrounds: { type: 'FeatureCollection', features: [makePlayground({ osmId: 222, name: 'B', lon: 8.680, lat: 50.110 })] },
  meta: { name: 'Region B', bbox: [8.6, 50.0, 8.7, 50.2] },
};

test('an old backend that drops "No private ones" counts as not filtered', async ({ page }) => {
  await injectHubConfig(page);
  await stubHubRegistry(page, { instanceA, instanceB });
  // Registered after the helper's stub, so it wins: B is older than the
  // parameter and answers it the way PostgREST does.
  await page.route('**/rpc/get_playground_clusters**', route => {
    const url = new URL(route.request().url());
    const old = url.pathname.startsWith('/api-b') && url.searchParams.has('filter_hide_private');
    route.fulfill(old
      ? { status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202' }) }
      : { status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await page.waitForFunction(() => window.__spieli?.map);
  await page.evaluate(() => window.__spieli.map.getView().setZoom(5));

  await page.locator('.filter-container > button').click();
  await page.getByRole('checkbox', { name: /No private ones/ }).check();
  await page.locator('.filter-container > button').click();

  await expect(page.locator('.macro-coverage')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.macro-coverage')).toContainText('1');
  await expect(page.locator('.macro-coverage')).toContainText('2');
});
