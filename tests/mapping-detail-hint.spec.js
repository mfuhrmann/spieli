import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes, makePlayground } from './helpers.js';

/**
 * #919 — with mapping detail on, the panel says under the badge which input
 * of the rule is missing for the next step. No link of its own: the panel's
 * MapComplete links further down already open the playground. With mapping
 * detail off there is no badge, so no hint either.
 */

async function open(page, props, detail = '1') {
  const pg = makePlayground({ osmId: 919, name: 'Hinweisspielplatz' });
  delete pg.properties.surface; // makePlayground sets one; each case decides
  Object.assign(pg.properties, props);
  await injectApiConfig(page);
  await stubApiRoutes(page, { type: 'FeatureCollection', features: [pg] });
  await page.goto(`/?detail=${detail}#W919`);
  await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });
  return page.locator('[data-testid="mapping-detail-hint"]');
}

test('no details yet: equipment, surface or opening hours make it basic, both detailed', async ({ page }) => {
  const hint = await open(page, {});
  await expect(hint).toContainText('One piece of play equipment makes it “basic”, and so does the surface or opening hours (if it has any). Both together: “detailed”.');
  await expect(hint.locator('a')).toHaveCount(0);
});

test('basic without equipment: only the play equipment is missing', async ({ page }) => {
  const hint = await open(page, { surface: 'sand' });
  await expect(hint).toContainText('Only the play equipment is missing for “detailed”.');
});

test('basic without info: only surface or opening hours are missing', async ({ page }) => {
  const hint = await open(page, { device_count: 3 });
  await expect(hint).toContainText('Only the surface — or opening hours, if it has any — is missing for “detailed”.');
});

test('detailed: no hint', async ({ page }) => {
  const hint = await open(page, { device_count: 3, surface: 'sand' });
  await expect(page.locator('aside.info-panel .detail-dot')).toHaveCount(1);
  await expect(hint).toHaveCount(0);
});

test('mapping detail off: no hint', async ({ page }) => {
  const hint = await open(page, {}, '0');
  await expect(hint).toHaveCount(0);
});

test.describe('German', () => {
  test.use({ locale: 'de-DE' });
  test('the labels in the hint match the badge', async ({ page }) => {
    const hint = await open(page, { surface: 'sand' });
    await expect(hint).toContainText('Für „detailliert“ fehlen nur noch die Spielgeräte.');
  });
});
