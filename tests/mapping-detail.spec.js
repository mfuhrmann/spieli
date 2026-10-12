import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

/**
 * #924 — mapping detail is opt-in. The map defaults to the plain finder view;
 * a control next to Info/Filter switches mapping detail on, remembers the
 * choice, and holds the detailed / basic / no-details filters, which are
 * ignored while it is off. `?detail=1|0` overrides the choice for one load.
 */

const OSM_ID = fixture.features[0].properties.osm_id;
const control = page => page.locator('.detail-container > button');
const detailSwitch = page => page.locator('.detail-dropdown input[role="switch"]');

async function load(page, path = '/', config = {}) {
  await injectApiConfig(page, config);
  await stubApiRoutes(page);
  await page.goto(path);
  await expect(page.locator('canvas').first()).toBeVisible();
}

async function switchDetail(page, on) {
  if (!(await page.locator('.detail-dropdown').isVisible())) await control(page).click();
  const sw = detailSwitch(page);
  if ((await sw.isChecked()) !== on) await sw.click();
}

test.describe('mapping detail control', () => {
  test('first visit: finder view, no legend, control unpressed', async ({ page }) => {
    await load(page);
    await expect(control(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.legend')).toHaveCount(0);
    await control(page).click();
    await expect(detailSwitch(page)).not.toBeChecked();
    await expect(page.locator('.state-item input').first()).toBeDisabled();
  });

  test('switching on shows the legend and survives a reload', async ({ page }) => {
    await load(page);
    await switchDetail(page, true);
    await expect(control(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.legend')).toBeVisible();
    await page.reload();
    await expect(control(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('Escape closes the popover and returns focus to the button', async ({ page }) => {
    await load(page);
    await control(page).click();
    await expect(page.locator('.detail-dropdown')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.detail-dropdown')).toHaveCount(0);
    await expect(control(page)).toBeFocused();
  });

  test('hidden states apply only while mapping detail is on', async ({ page }) => {
    // Cluster tier at every zoom, so filters travel as request parameters.
    // Wait for the first tier fetch: the filter subscription is attached with
    // the orchestrator, and a change before that triggers no refetch.
    const first = page.waitForRequest(/\/rpc\/get_playground_clusters/);
    await load(page, '/', { clusterMaxZoom: 20 });
    await first;
    // Toggling also refetches without a filter change, so match on content.
    const clusterRequest = (hidden) => page.waitForRequest(r =>
      r.url().includes('/rpc/get_playground_clusters')
      && r.url().includes('filter_missing=false') === hidden);

    await switchDetail(page, true);
    let req = clusterRequest(true);
    await page.locator('.state-item input').nth(2).click(); // "no details yet"
    await req;
    await expect(page.locator('.detail-container .badge')).toHaveText('1');
    await expect(page.locator('.filter-container .badge')).toHaveCount(0);

    req = clusterRequest(false);
    await switchDetail(page, false);
    expect((await req).url()).not.toContain('filter_missing');
    await expect(page.locator('.detail-container .badge')).toHaveCount(0);

    req = clusterRequest(true);
    await switchDetail(page, true);
    await req;
  });

  test('clicking a pin opens the playground', async ({ page }) => {
    await load(page); // polygon tier at every zoom (helpers default)
    // Wait for the polygon source, then click just above the pin's tip,
    // which is anchored at the playground's interior point.
    const pixel = await page.waitForFunction(() => {
      const map = window.__spieli?.map;
      const layer = map?.getLayers().getArray().find(l => l.getZIndex?.() === 10);
      const f = layer?.getSource()?.getFeatures()[0];
      if (!f) return null;
      const g = f.getGeometry();
      const p = g.getType() === 'MultiPolygon' ? g.getInteriorPoints().getPoint(0) : g.getInteriorPoint();
      const c = p.getCoordinates().slice(0, 2);
      // The fixture sits outside the configured region's initial view.
      map.getView().setCenter(c);
      map.renderSync();
      return map.getPixelFromCoordinate(c);
    }).then(h => h.jsonValue());
    const box = await page.locator('.map-container').boundingBox();
    await page.mouse.click(box.x + pixel[0], box.y + pixel[1] - 19);
    await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('high-DPI screen', () => {
  test.use({ deviceScaleFactor: 2 });

  // Renderers draw in CSS pixels and hit-test 1:1 (hidpiRenderer.js); a click
  // just above the tip must still land on the pin at devicePixelRatio 2.
  test('clicking a pin opens the playground', async ({ page }) => {
    await load(page);
    const pixel = await page.waitForFunction(() => {
      const map = window.__spieli?.map;
      const layer = map?.getLayers().getArray().find(l => l.getZIndex?.() === 10);
      const f = layer?.getSource()?.getFeatures()[0];
      if (!f) return null;
      const g = f.getGeometry();
      const p = g.getType() === 'MultiPolygon' ? g.getInteriorPoints().getPoint(0) : g.getInteriorPoint();
      const c = p.getCoordinates().slice(0, 2);
      map.getView().setCenter(c);
      map.renderSync();
      return map.getPixelFromCoordinate(c);
    }).then(h => h.jsonValue());
    const box = await page.locator('.map-container').boundingBox();
    await page.mouse.click(box.x + pixel[0], box.y + pixel[1] - 19);
    await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('playground panel', () => {
  test('mapping-detail badge only with mapping detail on', async ({ page }) => {
    await load(page, `/#W${OSM_ID}`);
    const panel = page.locator('aside.info-panel');
    await expect(panel).toBeVisible({ timeout: 8000 });
    await expect(panel.locator('.detail-dot')).toHaveCount(0);
    await switchDetail(page, true);
    await expect(panel.locator('.detail-dot')).toHaveCount(1);
  });
});

test.describe('?detail link parameter', () => {
  test('detail=1 turns it on for the load without changing the stored choice', async ({ page }) => {
    await load(page, `/?detail=1#W${OSM_ID}`);
    await expect(control(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });
    await page.goto('/');
    await expect(control(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('toggling rewrites the parameter in place', async ({ page }) => {
    await load(page, '/?detail=1');
    await switchDetail(page, false);
    await expect(page).toHaveURL(/[?&]detail=0/);
    await page.reload();
    await expect(control(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('share link carries detail=1 only while mapping detail is on', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async (t) => { window.__copied = t; } },
        configurable: true,
      });
    });
    await load(page, `/#W${OSM_ID}`);
    const panel = page.locator('aside.info-panel');
    await expect(panel).toBeVisible({ timeout: 8000 });
    // The desktop panel has no share button; the copy-link button is the mobile one.
    await page.setViewportSize({ width: 390, height: 844 });
    const share = page.locator('.mobile-detail-panel button[aria-label]').filter({ has: page.locator('svg') }).last();
    await share.click();
    expect(await page.evaluate(() => window.__copied)).not.toContain('detail=');

    await page.setViewportSize({ width: 1280, height: 800 });
    await switchDetail(page, true);
    await page.setViewportSize({ width: 390, height: 844 });
    await share.click();
    expect(await page.evaluate(() => window.__copied)).toMatch(/\?detail=1#W/);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the control is present and switches mapping detail', async ({ page }) => {
    await load(page);
    await expect(control(page)).toBeVisible();
    await switchDetail(page, true);
    await expect(control(page)).toHaveAttribute('aria-pressed', 'true');
  });
});
