import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

/**
 * #1002 — private playgrounds (a kindergarten's, a school's) are hidden in
 * the finder view: the cluster tier asks the server to leave them out, and an
 * older backend that does not know the parameter keeps working.
 */

const CLUSTER = { clusterMaxZoom: 13, mapZoom: 12 };

function trackClusters(page, respond) {
  const urls = [];
  return page.route('**/rpc/get_playground_clusters**', route => {
    const url = new URL(route.request().url());
    urls.push(url);
    const r = respond?.(url) ?? { status: 200, body: '[]' };
    route.fulfill({ status: r.status, contentType: 'application/json', body: r.body });
  }).then(() => urls);
}

test('the finder view asks the server to hide private playgrounds', async ({ page }) => {
  await injectApiConfig(page, CLUSTER);
  await stubApiRoutes(page);
  const urls = await trackClusters(page);
  await page.goto('/');
  await expect.poll(() => urls.length).toBeGreaterThan(0);
  expect(urls.at(-1).searchParams.get('filter_hide_private')).toBe('true');
});

test('with mapping detail on, private playgrounds are not hidden', async ({ page }) => {
  await injectApiConfig(page, CLUSTER);
  await stubApiRoutes(page);
  const urls = await trackClusters(page);
  await page.goto('/?detail=1');
  await expect.poll(() => urls.length).toBeGreaterThan(0);
  expect(urls.at(-1).searchParams.has('filter_hide_private')).toBe(false);
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
    url.searchParams.has('filter_hide_private') ? { status: 404, body: '{}' } : null);
  await page.goto('/');
  await expect.poll(() => urls.length).toBeGreaterThan(1);
  expect(urls[0].searchParams.get('filter_hide_private')).toBe('true');
  expect(urls[1].searchParams.has('filter_hide_private')).toBe(false);

  // Remembered: the next request leaves the parameter out straight away.
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(() => urls.length).toBeGreaterThan(2);
  expect(urls.at(-1).searchParams.has('filter_hide_private')).toBe(false);
  expect(legacy).toBe(0);
});
