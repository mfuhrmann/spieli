import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes, makePlayground } from './helpers.js';

/**
 * #996 — the map pin carries an access badge, but the panel dropped it. The
 * panel now repeats it, driven by the same accessKind rule as the pin.
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

// #1002 — a kindergarten's playground (private) and a café's (customers)
// must not look the same: one rules the trip out, the other does not.
const KINDS = [
  { access: 'private',   kind: 'private',   text: 'Private – not open to the public' },
  { access: 'no',        kind: 'private',   text: 'Private – not open to the public' },
  { access: 'customers', kind: 'customers', text: 'For customers & guests only' },
];
for (const { access, kind, text } of KINDS) {
  test(`access=${access}: the panel shows the ${kind} badge`, async ({ page }) => {
    const badge = await open(page, access);
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('data-access', kind);
    await expect(badge).toContainText(text);
    await expect(badge.locator('svg')).toHaveCount(1);
  });
}

for (const access of ['yes', null]) {
  test(`access=${access ?? '(untagged)'}: no access badge`, async ({ page }) => {
    const badge = await open(page, access);
    await expect(badge).toHaveCount(0);
  });
}
