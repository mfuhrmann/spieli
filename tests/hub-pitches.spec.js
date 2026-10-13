import { test, expect } from '@playwright/test';
import { injectHubConfig, stubHubRegistry, makePlayground } from './helpers.js';

/**
 * #947 — the hub's "Standalone pitches" toggle did nothing: only the
 * standalone app had a pitch layer. The hub now loads pitches from every
 * healthy backend in view, and a hub pitch opens the pitch panel with its
 * region and a `#<slug>/P<id>` link.
 */

const LON = 9.675, LAT = 50.551;
const d = 0.0004;
const PITCH = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[
    [LON - d, LAT - d], [LON + d, LAT - d], [LON + d, LAT + d], [LON - d, LAT + d], [LON - d, LAT - d],
  ]] },
  properties: { osm_id: 501, osm_type: 'W', leisure: 'pitch', sport: 'soccer', surface: 'grass', lit: 'yes', name: null },
};

const instanceA = {
  slug: 'slug-a', url: '/api-a', name: 'Instanz A',
  playgrounds: { type: 'FeatureCollection', features: [makePlayground({ osmId: 111, name: 'A', lon: 9.70, lat: 50.56 })] },
  meta: { name: 'Region A', version: '0.12.0', bbox: [9.6, 50.5, 9.8, 50.6] },
};
const instanceB = {
  slug: 'slug-b', url: '/api-b', name: 'Instanz B',
  playgrounds: { type: 'FeatureCollection', features: [makePlayground({ osmId: 222, name: 'B', lon: 8.68, lat: 50.11 })] },
  meta: { name: 'Region B', version: '0.12.0', bbox: [8.6, 50.0, 8.7, 50.2] },
};

async function setup(page, pitchRequests = []) {
  await injectHubConfig(page);
  await stubHubRegistry(page, { instanceA, instanceB });
  await page.route('**/rpc/get_standalone_equipment**', route => {
    const path = new URL(route.request().url()).pathname;
    pitchRequests.push(path);
    const features = path.startsWith('/api-a') ? [PITCH] : [];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features }) });
  });
  await page.route('**/rpc/get_pitch?**', route => {
    const path = new URL(route.request().url()).pathname;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(path.startsWith('/api-a') ? PITCH : null) });
  });
}

async function centreOnPitch(page) {
  return page.waitForFunction(([lon, lat]) => {
    const map = window.__spieli?.map;
    if (!map) return null;
    const R = 6378137;
    const c = [lon * Math.PI / 180 * R, Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * R];
    const v = map.getView();
    if (v.getZoom() !== 17) { v.setCenter(c); v.setZoom(17); return null; }
    const layer = map.getLayers().getArray().find(l => l.get('selectable'));
    if (!layer?.getSource().getFeatures().length) return null;
    map.renderSync();
    return map.getPixelFromCoordinate(c);
  }, [LON, LAT], { timeout: 10000 }).then(h => h.jsonValue());
}

test('the pitch layer loads from the backends in view and opens the pitch panel', async ({ page }) => {
  const pitchRequests = [];
  await setup(page, pitchRequests);
  await page.goto('/');
  await page.waitForFunction(() => window.__spieli?.map);
  await page.locator('.filter-container > button').click();
  await page.locator('.layer-section input[type="checkbox"]').check();
  await page.locator('.filter-container > button').click();

  const px = await centreOnPitch(page);
  // Only the backend whose bbox intersects the view was asked.
  expect(pitchRequests.length).toBeGreaterThan(0);
  expect(pitchRequests.every(p => p.startsWith('/api-a'))).toBe(true);

  const box = await page.locator('.map-container').boundingBox();
  await page.mouse.click(box.x + px[0], box.y + px[1]);
  const panel = page.locator('aside.pitch-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.backend-name')).toHaveText('Instanz A');
  await expect(panel.locator('[data-fact="lit"]')).toHaveText('Lit');
  await expect(page).toHaveURL(/#slug-a\/P501$/);
});

test('a #<slug>/P<id> link restores the pitch from that backend', async ({ page }) => {
  await setup(page);
  await page.goto('/#slug-a/P501');
  const panel = page.locator('aside.pitch-panel');
  await expect(panel).toBeVisible({ timeout: 8000 });
  await expect(panel.locator('.backend-name')).toHaveText('Instanz A');
});

test('a slug-less pitch link asks every backend and opens the one that has it', async ({ page }) => {
  await setup(page);
  await page.goto('/#P501');
  const panel = page.locator('aside.pitch-panel');
  await expect(panel).toBeVisible({ timeout: 8000 });
  await expect(panel.locator('.backend-name')).toHaveText('Instanz A');
});

test('the pitch layer keeps its pitches when every backend fails', async ({ page }) => {
  let fail = false;
  await setup(page);
  await page.route('**/rpc/get_standalone_equipment**', route => {
    if (fail) return route.abort();
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [PITCH] }) });
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__spieli?.map);
  await page.locator('.filter-container > button').click();
  await page.locator('.layer-section input[type="checkbox"]').check();
  await page.locator('.filter-container > button').click();
  await centreOnPitch(page);
  fail = true;
  await page.evaluate(() => {
    const v = window.__spieli.map.getView();
    const [x, y] = v.getCenter();
    v.setCenter([x + 20, y]);
  });
  await page.waitForTimeout(800);
  const count = await page.evaluate(() => window.__spieli.map.getLayers().getArray()
    .find(l => l.get('selectable')).getSource().getFeatures().length);
  expect(count).toBe(1);
});
