import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes, makePlayground } from './helpers.js';

/**
 * #996 — the map pin carries a lock badge for access=private/customers, but
 * the panel dropped it. The panel now repeats it as a "not public" badge,
 * driven by the same isRestrictedAccess rule as the pin.
 */

async function open(page, access) {
  const pg = makePlayground({ osmId: 996, name: 'Schlossspielplatz' });
  if (access) pg.properties.access = access;
  else delete pg.properties.access;
  await injectApiConfig(page);
  await stubApiRoutes(page, { type: 'FeatureCollection', features: [pg] });
  await page.goto('/#W996');
  await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });
  return page.locator('aside.info-panel [data-testid="restricted-badge"]');
}

for (const access of ['private', 'customers']) {
  test(`access=${access}: the panel shows the lock badge`, async ({ page }) => {
    const badge = await open(page, access);
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('not public');
    await expect(badge.locator('svg')).toHaveCount(1);
  });
}

for (const access of ['yes', null]) {
  test(`access=${access ?? '(untagged)'}: no lock badge`, async ({ page }) => {
    const badge = await open(page, access);
    await expect(badge).toHaveCount(0);
  });
}
