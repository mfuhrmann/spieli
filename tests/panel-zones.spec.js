import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes, makePlayground } from './helpers.js';

/**
 * #1077 — the playground panel is ordered by the parent's question:
 * zone A (decide), zone B (go deeper), zone C (background). Mapping detail
 * adds a tool block under the header and never reorders.
 */

const LON = 13.404, LAT = 52.520;

function device(osmId, playground) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [LON + 0.0005, LAT + 0.0005] },
    properties: { osm_id: osmId, osm_type: 'N', playground },
  };
}

async function open(page, { props = {}, devices = [], detail = null, pois = null } = {}) {
  const pg = makePlayground({ osmId: 1077, name: 'Zonenspielplatz', lon: LON, lat: LAT });
  Object.assign(pg.properties, props);
  await injectApiConfig(page);
  await stubApiRoutes(page, { type: 'FeatureCollection', features: [pg] });
  // Registered after stubApiRoutes, so it takes precedence over its empty stub.
  await page.route('**/rpc/get_equipment**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ type: 'FeatureCollection', features: devices }),
  }));
  if (pois) {
    await page.route('**/rpc/get_pois**', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(pois),
    }));
  }
  const query = detail === null ? '' : `?detail=${detail}`;
  await page.goto(`/${query}#W1077`);
  const panel = page.locator('aside.info-panel');
  await expect(panel).toBeVisible({ timeout: 8000 });
  return panel;
}

/** True when `a` comes before `b` in document order. */
async function precedes(a, b) {
  const handleB = await b.elementHandle();
  return a.evaluate((el, other) => !!(el.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING), handleB);
}

test('zones appear in order A, B, C', async ({ page }) => {
  const panel = await open(page, { props: { operator: 'Stadt Fulda' } });
  const a = panel.locator('[data-testid="zone-a"]');
  const b = panel.locator('[data-testid="zone-b"]');
  const c = panel.locator('[data-testid="zone-c"]');
  await expect(c).toBeVisible();
  expect(await precedes(a, b)).toBe(true);
  expect(await precedes(b, c)).toBe(true);
  // Operator is background, not a decision fact.
  await expect(c.locator('[data-testid="operator-value"]')).toContainText('Stadt Fulda');
});

test('pills: fenced, partly shaded, wheelchair, dogs allowed', async ({ page }) => {
  const panel = await open(page, {
    props: { has_fence: true, shade: 'partial', has_shade: false, wheelchair_play: 'yes', has_dogs: true },
  });
  const pills = panel.locator('[data-testid="pill-row"]');
  await expect(pills.locator('[data-pill="fenced"]')).toBeVisible();
  // shade=partial must not read as "No shade" (#1072)
  await expect(pills.locator('[data-pill="shade"]')).toHaveAttribute('data-shade', 'partial');
  await expect(pills.locator('[data-pill="wheelchair"]')).toBeVisible();
  await expect(pills.locator('[data-pill="dogs"]')).toBeVisible();
});

test('pills: unknown values stay silent, dogs only on dog=yes', async ({ page }) => {
  const panel = await open(page, { props: { has_fence: true, has_dogs: false }, devices: [device(1, 'swing')] });
  const pills = panel.locator('[data-testid="pill-row"]');
  await expect(pills.locator('[data-pill="fenced"]')).toBeVisible();
  await expect(pills.locator('[data-pill="shade"]')).toHaveCount(0);
  await expect(pills.locator('[data-pill="wheelchair"]')).toHaveCount(0);
  await expect(pills.locator('[data-pill="dogs"]')).toHaveCount(0);
});

test('pills: age first, then shade, wheelchair, fenced, dogs', async ({ page }) => {
  const panel = await open(page, {
    props: { for_baby: true, for_toddler: true, shade: 'yes', wheelchair_play: 'no', has_fence: true, has_dogs: true },
  });
  const pills = panel.locator('[data-testid="pill-row"] [data-pill]');
  await expect(pills).toHaveCount(6);
  const order = await pills.evaluateAll(els => els.map(e => e.dataset.pill));
  expect(order).toEqual(['baby', 'toddler', 'shade', 'wheelchair', 'fenced', 'dogs']);
});

test('activities and highlights replace the device count', async ({ page }) => {
  const panel = await open(page, {
    props: { is_water: true, 'playground:theme': 'ship' },
    devices: [
      device(1, 'swing'), device(2, 'basketswing'), device(3, 'sandpit'),
      device(4, 'zipwire'), device(5, 'pump'), device(6, 'water_channel'), device(7, 'platform'),
    ],
  });
  const activities = panel.locator('[data-testid="activity-row"] [data-activity]');
  // two swing types are one activity; the platform is none
  await expect(activities).toHaveCount(2);
  await expect(activities.nth(0)).toHaveAttribute('data-activity', 'swing');
  await expect(activities.nth(1)).toHaveAttribute('data-activity', 'dig');
  const hl = panel.locator('[data-testid="highlights"] [data-highlight]');
  // theme first, water play once, then the zip line
  await expect(hl).toHaveCount(3);
  await expect(hl.nth(0)).toHaveAttribute('data-highlight', 'theme');
  await expect(hl.nth(1)).toHaveAttribute('data-highlight', 'water');
  await expect(hl.nth(2)).toHaveAttribute('data-highlight', 'zipwire');
  await expect(panel.locator('.equip-summary')).toHaveCount(0);
  // highlights lead the "what kids can do" block, above the activities,
  // and the block comes after the pills
  expect(await precedes(panel.locator('[data-testid="activity-block"] .row-label'), panel.locator('[data-testid="highlights"]'))).toBe(true);
  expect(await precedes(panel.locator('[data-testid="highlights"]'), panel.locator('[data-testid="activity-row"]'))).toBe(true);
});

test('area-level equipment tags count as activities', async ({ page }) => {
  const panel = await open(page, { props: { 'playground:slide': 'yes' } });
  await expect(panel.locator('[data-testid="activity-row"] [data-activity="slide"]')).toBeVisible();
  await expect(panel.locator('[data-testid="contribute-invite"]')).toHaveCount(0);
});

test('nothing known: the panel invites contribution instead of a no-photo line', async ({ page }) => {
  const panel = await open(page);
  await expect(panel.locator('[data-testid="contribute-invite"]')).toBeVisible();
  await expect(panel.locator('[data-testid="no-photo"]')).toHaveCount(0);
});

test('something known: no invitation, compact no-photo line', async ({ page }) => {
  const panel = await open(page, { devices: [device(1, 'slide')] });
  await expect(panel.locator('[data-testid="activity-row"]')).toBeVisible();
  await expect(panel.locator('[data-testid="contribute-invite"]')).toHaveCount(0);
  await expect(panel.locator('[data-testid="no-photo"]')).toBeVisible();
});

test('mapping detail off: no tool block, MapComplete in zone C', async ({ page }) => {
  const panel = await open(page, { detail: '0' });
  await expect(panel.locator('[data-testid="mapper-tools"]')).toHaveCount(0);
  await expect(panel.locator('[data-testid="zone-c"] .mc-edit-link')).toHaveCount(1);
});

test('mapping detail on: tool block first in zone A, MapComplete moves there', async ({ page }) => {
  const panel = await open(page, { detail: '1' });
  const tools = panel.locator('[data-testid="zone-a"] > [data-testid="mapper-tools"]:first-child');
  await expect(tools).toBeVisible();
  await expect(tools.locator('.mc-edit-link')).toHaveCount(1);
  await expect(panel.locator('[data-testid="zone-c"] .mc-edit-link')).toHaveCount(0);
});

test('zone B: good to know, nearest place per kind, equipment list collapsed', async ({ page }) => {
  const pois = [
    { lat: LAT + 0.001, lon: LON, tags: { highway: 'bus_stop', name: 'Nah' } },
    { lat: LAT + 0.01, lon: LON, tags: { highway: 'bus_stop', name: 'Fern' } },
    { lat: LAT + 0.002, lon: LON, tags: { amenity: 'toilets' } },
  ];
  const panel = await open(page, {
    pois,
    props: { opening_hours: '24/7', lit: 'yes' },
    devices: [
      { ...device(1, 'slide') },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [LON + 0.0005, LAT + 0.0005] }, properties: { osm_id: 2, osm_type: 'N', amenity: 'bench' } },
    ],
  });
  const facts = panel.locator('[data-testid="good-to-know"] [data-fact]');
  const keys = await facts.evaluateAll(els => els.map(e => e.dataset.fact));
  expect(keys).toEqual(['opening-hours', 'seating', 'ground', 'lit']);
  // one row per kind, the nearest
  const poiRows = panel.locator('[data-testid="poi-list"] li');
  await expect(poiRows).toHaveCount(2);
  await expect(panel.locator('[data-testid="poi-list"]')).toContainText('Nah');
  await expect(panel.locator('[data-testid="poi-list"]')).not.toContainText('Fern');
  // the full equipment list waits behind its toggle
  await expect(panel.locator('button.device-toggle')).toHaveCount(0);
});
