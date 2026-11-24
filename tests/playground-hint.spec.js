import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes, makePlayground } from './helpers.js';

/**
 * #1073 — a hint about a playground spieli already knows: tap what is there,
 * send it as an anonymous OSM note. A dialog over the panel; back returns to
 * the panel; only what is not known yet is offered.
 */

const NOTES = 'https://notes.example.org';
const LON = 13.404, LAT = 52.520;

function device(osmId, playground) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [LON + 0.0005, LAT + 0.0005] },
    properties: { osm_id: osmId, osm_type: 'N', playground },
  };
}

async function open(page, { props = {}, devices = [], notes = NOTES, equipmentDelay = 0 } = {}) {
  const posts = [];
  const pg = makePlayground({ osmId: 1073, name: 'Hinweisplatz', lon: LON, lat: LAT });
  Object.assign(pg.properties, props);
  await injectApiConfig(page, { osmNotesUrl: notes });
  await stubApiRoutes(page, { type: 'FeatureCollection', features: [pg] });
  await page.route('**/rpc/get_equipment**', async route => {
    if (equipmentDelay) await new Promise(r => setTimeout(r, equipmentDelay));
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ type: 'FeatureCollection', features: devices }),
    });
  });
  await page.route(`${NOTES}/api/0.6/notes.json`, async route => {
    posts.push(route.request().postData());
    await route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ type: 'Feature', properties: { id: 4711, status: 'open' } }),
    });
  });
  await page.goto('/#W1073');
  const panel = page.locator('aside.info-panel');
  await expect(panel).toBeVisible({ timeout: 8000 });
  return { panel, posts };
}

const dialog = page => page.getByRole('dialog');

test('empty panel: the invitation opens the hint dialog over the panel', async ({ page }) => {
  const { panel, posts } = await open(page);
  await panel.locator('[data-testid="hint-open"]').click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText(/What is at this playground/);
  // the panel stays open underneath
  await expect(panel).toBeVisible();
  expect(posts).toHaveLength(0);
});

test('every panel: "something missing?" sits right under what kids can do', async ({ page }) => {
  const { panel } = await open(page, { devices: [device(1, 'swing')] });
  const link = panel.locator('[data-testid="zone-a"] [data-testid="hint-open-inline"]');
  await expect(link).toBeVisible();
  // at the end of the activity section, not down in zone C
  const last = await panel.locator('[data-testid="activity-block"]').evaluate(
    el => el.lastElementChild?.dataset.testid);
  expect(last).toBe('hint-open-inline');
  await expect(panel.locator('[data-testid="zone-c"] [data-testid^="hint-open"]')).toHaveCount(0);
  await link.click();
  await expect(dialog(page)).toBeVisible();
});

test('only what is not known is offered', async ({ page }) => {
  const { panel } = await open(page, {
    props: { has_fence: true, shade: 'yes' },
    devices: [device(1, 'swing')],
  });
  await panel.locator('[data-testid="hint-open-inline"]').click();
  const d = dialog(page);
  await expect(d.locator('[data-chip="slide"]')).toBeVisible();
  await expect(d.locator('[data-chip="swing"]')).toHaveCount(0);
  await expect(d.locator('[data-chip="fenced"]')).toHaveCount(0);
  await expect(d.locator('[data-chip^="shade-"]')).toHaveCount(0);
  // named playground: no name field
  await expect(d.getByLabel(/Name/)).toHaveCount(0);
});

test('unnamed playground with nothing known: name, fence and shade are offered', async ({ page }) => {
  const { panel } = await open(page, { props: { name: null } });
  await panel.locator('[data-testid="hint-open"]').click();
  const d = dialog(page);
  await expect(d.locator('[data-chip="fenced"]')).toBeVisible();
  await expect(d.locator('[data-chip="shade-partial"]')).toBeVisible();
  await expect(d.getByLabel(/Name/)).toBeVisible();
});

test('back closes the dialog and keeps the panel', async ({ page }) => {
  const { panel } = await open(page);
  await panel.locator('[data-testid="hint-open"]').click();
  await expect(dialog(page)).toBeVisible();
  await page.goBack();
  await expect(dialog(page)).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/#W1073$/);
});

test('Escape closes only the dialog', async ({ page }) => {
  const { panel } = await open(page);
  await panel.locator('[data-testid="hint-open"]').click();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(panel).toBeVisible();
});

test('send: one note with the object link and area tags, then thanks', async ({ page }) => {
  const { panel, posts } = await open(page);
  await panel.locator('[data-testid="hint-open"]').click();
  const d = dialog(page);
  await d.getByRole('button', { name: 'Slide' }).click();
  await d.getByRole('button', { name: 'Sandpit' }).click();
  await d.locator('[data-chip="shade-partial"]').click();
  await d.getByRole('button', { name: /Send hint/ }).click();
  await expect(d).toContainText(/Thank/i);
  expect(posts).toHaveLength(1);
  const text = new URLSearchParams(posts[0]).get('text');
  expect(text).toContain('https://www.openstreetmap.org/way/1073');
  expect(text).toContain('playground:slide=yes');
  expect(text).toContain('playground:sandpit=yes');
  expect(text).toContain('shade=partial');
  expect(text).not.toContain('leisure=playground');
});

test('notes switched off: no hint entry point', async ({ page }) => {
  const { panel } = await open(page, { notes: false });
  await expect(panel.locator('[data-testid="contribute-invite"]')).toBeVisible();
  await expect(panel.locator('[data-testid="hint-open"]')).toHaveCount(0);
  await expect(panel.locator('[data-testid="hint-open-inline"]')).toHaveCount(0);
});

test('the session limit is shared with missing-playground reports', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('spieli.notesSent', '3'));
  const { panel } = await open(page);
  await panel.locator('[data-testid="hint-open"]').click();
  const d = dialog(page);
  await expect(d.locator('[data-testid="hint-limit"]')).toBeVisible();
  await expect(d.getByRole('button', { name: /Send hint/ })).toBeDisabled();
});

test('the inline link waits for the equipment, so known devices can be hidden', async ({ page }) => {
  const { panel } = await open(page, { devices: [device(1, 'swing')], equipmentDelay: 1500 });
  const link = panel.locator('[data-testid="hint-open-inline"]');
  await expect(link).toHaveCount(0);
  await expect(link).toBeVisible({ timeout: 5000 });
  await link.click();
  await expect(dialog(page).locator('[data-chip="swing"]')).toHaveCount(0);
});

test('an empty hint cannot be sent; ticking something enables Send', async ({ page }) => {
  const { panel, posts } = await open(page);
  await panel.locator('[data-testid="hint-open"]').click();
  const send = dialog(page).getByRole('button', { name: /Send hint/ });
  await expect(send).toBeDisabled();
  await dialog(page).getByRole('button', { name: 'Slide' }).click();
  await expect(send).toBeEnabled();
  expect(posts).toHaveLength(0);
});

test('a hint about a known playground offers no own pin', async ({ page }) => {
  const { panel } = await open(page);
  await panel.locator('[data-testid="hint-open"]').click();
  await expect(dialog(page).getByRole('checkbox')).toHaveCount(0);
});

test('Forward after closing the hint does not close the panel', async ({ page }) => {
  const { panel } = await open(page);
  await panel.locator('[data-testid="hint-open"]').click();
  await expect(dialog(page)).toBeVisible();
  await page.goBack();
  await expect(dialog(page)).toHaveCount(0);
  await page.goForward();
  await page.waitForTimeout(600);
  await expect(dialog(page)).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/#W1073$/);
});

test('at the limit, the hint form speaks about hints, not new playgrounds', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('spieli.notesSent', '3'));
  const { panel } = await open(page);
  await panel.locator('[data-testid="hint-open"]').click();
  await expect(dialog(page).locator('[data-testid="hint-limit"]')).toContainText(/hints in this visit/);
});
