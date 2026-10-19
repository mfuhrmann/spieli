import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes, makePlayground } from './helpers.js';

/**
 * #1000 review findings: the report flow under a slow network, the back
 * gesture, areas outside this map's data, a duplicate check that must not
 * depend on the polygon tier having loaded, own pins on top of playgrounds,
 * and focus between steps. The OSM API is stubbed throughout.
 */

const NOTES = 'https://notes.example.org';
const EMPTY = { type: 'FeatureCollection', features: [] };
const CORS = { 'access-control-allow-origin': '*' };

async function base(page, { meta = null, overrides = {} } = {}) {
  await injectApiConfig(page, { osmNotesUrl: NOTES, ...overrides });
  await stubApiRoutes(page, EMPTY);
  if (meta) {
    await page.route('**/rpc/get_meta**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(meta) }));
  }
}

// A playground right in the middle of whatever bbox is asked for: the
// duplicate check's own query (centred on the crosshair) then always finds one.
async function playgroundAtEveryCentre(page, { delayPolygonTier = false } = {}) {
  await page.route('**/rpc/get_playgrounds_bbox**', async route => {
    const u = new URL(route.request().url());
    const lon = (Number(u.searchParams.get('min_lon')) + Number(u.searchParams.get('max_lon'))) / 2;
    const lat = (Number(u.searchParams.get('min_lat')) + Number(u.searchParams.get('max_lat'))) / 2;
    const span = Number(u.searchParams.get('max_lon')) - Number(u.searchParams.get('min_lon'));
    // The polygon tier asks for the whole view; the duplicate check for ~200 m.
    if (delayPolygonTier && span > 0.01) await new Promise(r => setTimeout(r, 4000));
    const pg = makePlayground({ osmId: 77, name: 'Schon da', lon: lon - 0.0002, lat: lat - 0.0002 });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [pg] }) });
  });
}

async function toChoose(page) {
  await page.getByRole('button', { name: 'Missing a playground?' }).click();
  const card = page.getByRole('region', { name: 'Where is the playground?' });
  const zoom = card.getByRole('button', { name: 'Zoom in closer' });
  if (await zoom.count()) await zoom.click();
  await card.getByRole('button', { name: 'Next' }).click();
}

test('closing is blocked while a hint is being sent, and the answer still lands', async ({ page }) => {
  await base(page);
  let release;
  const held = new Promise(r => { release = r; });
  await page.route(`${NOTES}/api/0.6/notes.json`, async route => {
    await held;
    await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS,
      body: JSON.stringify({ type: 'Feature', properties: { id: 9, status: 'open' } }) });
  });
  await page.goto('/');
  await toChoose(page);
  await page.getByRole('button', { name: /Leave a hint/ }).click();
  const form = page.getByRole('dialog', { name: "What's there?" });
  await form.getByRole('button', { name: 'Send hint' }).click();
  await expect(form.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(form).toBeVisible();
  release();
  await expect(page.getByRole('dialog', { name: 'Thank you!' })).toBeVisible();
});

test('the back gesture closes the report instead of leaving the page', async ({ page }) => {
  await base(page);
  await page.goto('/');
  await toChoose(page);
  await page.getByRole('button', { name: /Leave a hint/ }).click();
  await expect(page.getByRole('dialog', { name: "What's there?" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: "What's there?" })).toBeHidden();
  await expect(page.locator('.ol-viewport')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Missing a playground?' })).toBeVisible();
  // Closing in-app pops the entry too: the next back leaves the page.
  await toChoose(page);
  await page.getByRole('dialog', { name: 'How would you like to report it?' })
    .getByRole('button', { name: 'Cancel' }).click();
  await page.goBack();
  await expect(page).toHaveURL('about:blank');
});

test('outside this map\'s data only MapComplete is offered', async ({ page }) => {
  // The backend covers an area far away from the view.
  await base(page, { meta: { bbox: [100, 10, 101, 11] } });
  await page.goto('/');
  await toChoose(page);
  const choose = page.getByRole('dialog', { name: 'How would you like to report it?' });
  await expect(choose).toContainText('This map has no data for this area');
  await expect(choose.getByRole('button', { name: /Leave a hint/ })).toHaveCount(0);
  await expect(choose.getByRole('link', { name: /Add it yourself/ })).toBeVisible();
});

test('the duplicate check asks the backend instead of waiting for the map', async ({ page }) => {
  await base(page);
  await playgroundAtEveryCentre(page, { delayPolygonTier: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Missing a playground?' }).click();
  const card = page.getByRole('region', { name: 'Where is the playground?' });
  await card.getByRole('button', { name: 'Zoom in closer' }).click();
  // Straight away: the polygon tier is held back for 4 s.
  await card.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('region', { name: 'Do you mean this playground?' })).toBeVisible();
});

test('a tap on an own pin opens its status, not the playground under it', async ({ page }) => {
  await base(page);
  await playgroundAtEveryCentre(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__spieli?.map);
  const [lon, lat] = await page.evaluate(() => {
    const v = window.__spieli.map.getView();
    v.setZoom(18);
    const c = v.getCenter();
    // EPSG:3857 → WGS84
    const lon = c[0] / 20037508.34 * 180;
    const lat = Math.atan(Math.exp(c[1] / 20037508.34 * Math.PI)) * 360 / Math.PI - 90;
    return [lon, lat];
  });
  await page.evaluate(([lon, lat]) => localStorage.setItem('spieli.ownNotes',
    JSON.stringify([{ id: 5, lat, lon, created: '2026-10-16', status: 'open', url: 'https://notes.example.org/note/5' }])), [lon, lat]);
  await page.route(`${NOTES}/api/0.6/notes/5.json`, route => route.fulfill({
    status: 200, contentType: 'application/json', headers: CORS,
    body: JSON.stringify({ type: 'Feature', properties: { id: 5, status: 'open' } }) }));
  await page.reload();
  await page.waitForFunction(() => window.__spieli?.map);
  await page.evaluate(([lon, lat]) => {
    const v = window.__spieli.map.getView();
    const x = lon * 20037508.34 / 180;
    const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180;
    v.setCenter([x, y]);
    v.setZoom(18);
  }, [lon, lat]);
  await page.waitForTimeout(1200);
  const box = await page.locator('.ol-viewport').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('region', { name: /Your hint from/ })).toBeVisible();
  await expect(page.locator('aside.info-panel')).toHaveCount(0);
});

test('focus follows the steps', async ({ page }) => {
  await base(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Missing a playground?' }).click();
  await expect(page.getByRole('heading', { name: 'Where is the playground?' })).toBeFocused();
  const card = page.getByRole('region', { name: 'Where is the playground?' });
  await card.getByRole('button', { name: 'Zoom in closer' }).click();
  await card.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'How would you like to report it?' })).toBeFocused();
  await page.getByRole('button', { name: /Leave a hint/ }).click();
  await expect(page.getByRole('heading', { name: "What's there?" })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Missing a playground?' })).toBeFocused();
});
