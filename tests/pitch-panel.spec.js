import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes, makePlayground } from './helpers.js';

/**
 * #934 — standalone pitches are clickable and open a pitch panel; pitches have
 * `#P<osm_id>` links; the playground panel shows lighting when tagged.
 */

const LON = 13.41, LAT = 52.52;
const d = 0.0004;
function pitch(osmId, props, lon = LON, lat = LAT) {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[
      [lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d],
    ]] },
    properties: { osm_id: osmId, osm_type: 'W', leisure: 'pitch', name: null, amenity: null, ...props },
  };
}
const RICH   = pitch(501, { sport: 'soccer;basketball', surface: 'artificial_turf', lit: 'sunset-23:00', access: 'yes', hoops: '2' });
const SPARSE = pitch(502, { sport: 'basketball' }, LON + 0.003, LAT);

async function stubPitches(page, features = [RICH, SPARSE], getPitch = null) {
  // StandaloneApp creates the pitch layer only after the region lookup
  // settles; unstubbed it waits on the real Nominatim (up to its timeout),
  // which made these tests depend on the network.
  await page.route('**/lookup?**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
  await page.route('**/rpc/get_standalone_equipment**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ type: 'FeatureCollection', features }),
  }));
  await page.route('**/rpc/get_pitch?**', route => {
    if (getPitch === 404) return route.fulfill({ status: 404, body: '' });
    const id = Number(new URL(route.request().url()).searchParams.get('osm_id'));
    const hit = getPitch ?? features.find(f => f.properties.osm_id === id) ?? null;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hit) });
  });
}

async function openMapWithPitches(page) {
  await injectApiConfig(page);
  await stubApiRoutes(page);
  await stubPitches(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__spieli?.map);
  await page.locator('.filter-container > button').click();
  await page.locator('.layer-section input[type="checkbox"]').check();
  await page.locator('.filter-container > button').click();
}

/** Centre the map on a pitch at z17 and return its pixel once the layer has it. */
async function pitchPixel(page, osmId, lon, lat) {
  return page.waitForFunction(([id, lon, lat]) => {
    const map = window.__spieli.map;
    const R = 6378137;
    const c = [lon * Math.PI / 180 * R, Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * R];
    const v = map.getView();
    if (v.getZoom() !== 17) { v.setCenter(c); v.setZoom(17); return null; }
    const layer = map.getLayers().getArray().find(l => l.get('selectable'));
    if (!layer?.getSource().getFeatures().some(f => f.get('osm_id') === id)) return null;
    map.renderSync();
    return map.getPixelFromCoordinate(c);
  }, [osmId, lon, lat], { timeout: 10000 }).then(h => h.jsonValue());
}

async function clickPitch(page, osmId, lon, lat) {
  const px = await pitchPixel(page, osmId, lon, lat);
  const box = await page.locator('.map-container').boundingBox();
  await page.mouse.click(box.x + px[0], box.y + px[1]);
}

test.describe('desktop', () => {
  test('clicking a pitch opens the pitch panel with its facts and a #P link', async ({ page }) => {
    await openMapWithPitches(page);
    await clickPitch(page, 501, LON, LAT);
    const panel = page.locator('aside.pitch-panel');
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(/#P501$/);
    await expect(panel.locator('.panel-title')).toHaveText('Football pitch');
    await expect(panel.locator('.sport-chip')).toHaveText(['Football', 'Basketball']);
    await expect(panel.locator('[data-fact="surface"]')).toContainText('Artificial turf');
    await expect(panel.locator('[data-fact="lit"]')).toHaveText('Lit sunset–23:00');
    await expect(panel.locator('[data-fact="access"]')).toHaveText('Public');
    await expect(panel).toContainText('2 hoops');
    // No playground panel content alongside.
    await expect(page.locator('aside.info-panel:not(.pitch-panel)')).toHaveCount(0);
  });

  test('a sparse pitch shows no unknown rows', async ({ page }) => {
    await openMapWithPitches(page);
    await clickPitch(page, 502, LON + 0.003, LAT);
    const panel = page.locator('aside.pitch-panel');
    await expect(panel.locator('.panel-title')).toHaveText('Basketball court');
    await expect(panel.locator('[data-fact]')).toHaveCount(0);
  });

  test('clicking empty map clears the pitch selection', async ({ page }) => {
    await openMapWithPitches(page);
    await clickPitch(page, 501, LON, LAT);
    await expect(page.locator('aside.pitch-panel')).toBeVisible();
    const box = await page.locator('.map-container').boundingBox();
    // Right edge, mid-height: clear of the panel, the controls and both pitches.
    await page.mouse.click(box.x + box.width - 140, box.y + box.height / 2 + 120);
    await expect(page.locator('aside.pitch-panel')).toHaveCount(0);
  });

  test('Escape closes the panel and clears the hash', async ({ page }) => {
    await openMapWithPitches(page);
    await clickPitch(page, 501, LON, LAT);
    await expect(page.locator('aside.pitch-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('aside.pitch-panel')).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('');
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('tap opens the full-screen panel; Back to map closes it', async ({ page }) => {
    await openMapWithPitches(page);
    await clickPitch(page, 501, LON, LAT);
    const panel = page.locator('.mobile-detail-panel .pitch-panel--embedded');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.panel-title')).toHaveText('Football pitch');
    await page.locator('.mobile-back-btn').click();
    await expect(panel).toHaveCount(0);
  });
});

test.describe('German header', () => {
  test.use({ locale: 'de-DE' });

  // "Mehrzweckplatz" is one long word next to the wider "Bring mich hierher";
  // the title used to run underneath the button instead of breaking.
  for (const width of [1280, 360]) {
    test(`a long one-word title does not run under the actions at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const multi = pitch(503, { sport: 'multi' });
      await injectApiConfig(page);
      await stubApiRoutes(page);
      await stubPitches(page, [multi]);
      await page.goto('/#P503');
      const title = page.locator('.panel-title').filter({ hasText: /Mehrzweck/ });
      await expect(title).toBeVisible({ timeout: 8000 });
      // The title block shrinks to share its row with the buttons; the bug
      // was its text overflowing that box (and running under the button).
      const [scroll, client] = await title.evaluate(el => [el.scrollWidth, el.clientWidth]);
      expect(scroll, 'title text overflows its box').toBeLessThanOrEqual(client);
    });
  }
});

test.describe('example illustration (#968)', () => {
  test('a pitch with no photo shows its sport\'s example illustration', async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
    const tt = pitch(503, { sport: 'table_tennis' });
    await stubPitches(page, [tt]);
    await page.route(/\/ext\/wikimedia\/|wikimedia\.org/, route => route.fulfill({
      status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    }));
    await page.goto('/#P503');
    const panel = page.locator('aside.pitch-panel');
    await expect(panel).toBeVisible({ timeout: 8000 });
    const ill = panel.locator('.pitch-illustration');
    await expect(ill.locator('img')).toHaveAttribute('src', /Table_Tennis_Table_Blue/);
    await expect(ill).toContainText(/Example image|Symbolbild/);
  });

  test('a pitch with a photo shows the photo, not the illustration', async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
    await stubPitches(page, [pitch(504, { sport: 'table_tennis', panoramax: 'a3dde228-46c5-45aa-8d77-3aecae9257e6' })]);
    await page.goto('/#P504');
    await expect(page.locator('aside.pitch-panel')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('aside.pitch-panel .pitch-illustration')).toHaveCount(0);
  });
});

test.describe('#P links', () => {
  test('restores the pitch, switches the layer on and frames it', async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
    await stubPitches(page);
    await page.goto('/#P501');
    await expect(page.locator('aside.pitch-panel')).toBeVisible({ timeout: 8000 });
    await page.locator('.filter-container > button').click();
    await expect(page.locator('.layer-section input[type="checkbox"]')).toBeChecked();
  });

  test('the slug form also restores in standalone, like playground links', async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
    await stubPitches(page);
    await page.goto('/#irrelevant-slug/P501');
    await expect(page.locator('aside.pitch-panel')).toBeVisible({ timeout: 8000 });
  });

  test('an unknown pitch opens the map without a panel', async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
    await stubPitches(page, [RICH, SPARSE], null);
    await page.goto('/#P999');
    await expect(page.locator('canvas').first()).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page.locator('aside.pitch-panel')).toHaveCount(0);
  });

  test('a backend without get_pitch opens the map without a panel', async ({ page }) => {
    const warnings = [];
    page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });
    await injectApiConfig(page);
    await stubApiRoutes(page);
    await stubPitches(page, [RICH], 404);
    await page.goto('/#P501');
    await expect(page.locator('canvas').first()).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page.locator('aside.pitch-panel')).toHaveCount(0);
    expect(warnings.some(w => w.includes('get_pitch not available'))).toBe(true);
  });
});

test.describe('playground lighting', () => {
  for (const [lit, shown] of [['yes', 'Lit'], [null, null]]) {
    test(`lit=${lit} → ${shown ?? 'nothing'}`, async ({ page }) => {
      const pg = makePlayground({ osmId: 777, name: 'Lichtspielplatz', lon: LON, lat: LAT });
      if (lit) pg.properties.lit = lit;
      await injectApiConfig(page);
      await stubApiRoutes(page, { type: 'FeatureCollection', features: [pg] });
      await page.goto('/#W777');
      const panel = page.locator('aside.info-panel');
      await expect(panel).toBeVisible({ timeout: 8000 });
      if (shown) await expect(panel.locator('[data-fact="lit"]')).toContainText(shown);
      else await expect(panel.locator('[data-fact="lit"]')).toHaveCount(0);
    });
  }
});
