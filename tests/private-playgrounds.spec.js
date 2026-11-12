import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

/**
 * #1002 — private playgrounds (a kindergarten's, a school's) are shown by
 * default; the "No private ones" filter hides them on the server too, and an
 * older backend that does not know the parameter keeps working.
 */

const CLUSTER = { clusterMaxZoom: 13, mapZoom: 12 };

async function trackClusters(page, respond) {
  const urls = [];
  await page.route('**/rpc/get_playground_clusters**', route => {
    const url = new URL(route.request().url());
    urls.push(url);
    const r = respond?.(url) ?? { status: 200, body: '[]' };
    route.fulfill({ status: r.status, contentType: 'application/json', body: r.body });
  });
  return urls;
}

async function hidePrivate(page) {
  await page.locator('.filter-container > button').click();
  await page.getByRole('checkbox', { name: /No private ones/ }).check();
  await page.locator('.filter-container > button').click();
}

test('private playgrounds are shown by default', async ({ page }) => {
  await injectApiConfig(page, CLUSTER);
  await stubApiRoutes(page);
  const urls = await trackClusters(page);
  await page.goto('/');
  await expect.poll(() => urls.length).toBeGreaterThan(0);
  expect(urls.at(-1).searchParams.has('filter_hide_private')).toBe(false);
});

test('the filter hides them on the server and shows a chip', async ({ page }) => {
  await injectApiConfig(page, CLUSTER);
  await stubApiRoutes(page);
  const urls = await trackClusters(page);
  await page.goto('/');
  await expect.poll(() => urls.length).toBeGreaterThan(0);
  await hidePrivate(page);
  await expect.poll(() => urls.at(-1).searchParams.get('filter_hide_private')).toBe('true');
  await expect(page.locator('.chips-container')).toContainText('No private ones');
});

test('an older backend without the parameter gets a retry, not the legacy path', async ({ page }) => {
  await injectApiConfig(page, CLUSTER);
  await stubApiRoutes(page);
  let legacy = 0;
  await page.route('**/rpc/get_playgrounds?**', route => {
    legacy++;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) });
  });
  const urls = await trackClusters(page, url =>
    url.searchParams.has('filter_hide_private') ? { status: 404, body: JSON.stringify({ code: 'PGRST202' }) } : null);
  await page.goto('/');
  await expect.poll(() => urls.length).toBeGreaterThan(0);
  await hidePrivate(page);
  // Located by content, not by position: the initial load can still issue a
  // cluster request after the first one (its timing moved when the suite
  // started blocking live Nominatim, #1012), so "the request after the first"
  // is not necessarily the filtered one. The retry is issued inside the same
  // fetchPlaygroundClusters call, so it is the very next request.
  const firstFiltered = () => urls.findIndex(u => u.searchParams.get('filter_hide_private') === 'true');
  await expect.poll(firstFiltered).toBeGreaterThanOrEqual(0);
  const i = firstFiltered();
  await expect.poll(() => urls.length).toBeGreaterThan(i + 1);
  expect(urls[i + 1].searchParams.has('filter_hide_private')).toBe(false);

  // Remembered: the next request leaves the parameter out straight away.
  const n = urls.length;
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(() => urls.length).toBeGreaterThan(n);
  expect(urls.at(-1).searchParams.has('filter_hide_private')).toBe(false);
  expect(legacy).toBe(0);
});
