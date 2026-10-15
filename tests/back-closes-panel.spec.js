import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

/**
 * #997 — on a phone the panel fills the screen and the natural way out is the
 * system back gesture. Opening a panel now pushes one history entry, so back
 * closes the panel; a second back leaves the page as before.
 */

const OSM_ID = fixture.features[0].properties.osm_id;

test.use({ viewport: { width: 390, height: 844 } });

// Switching selections while open, and clear-then-select in one click, are
// covered by app/src/stores/selection.test.js.

async function openDeeplink(page) {
  await injectApiConfig(page);
  await stubApiRoutes(page);
  await page.goto(`/#W${OSM_ID}`);
  const back = page.locator('.mobile-back-btn');
  await expect(back).toBeVisible({ timeout: 8000 });
  return back;
}

test('browser back closes the panel and stays on the map', async ({ page }) => {
  const back = await openDeeplink(page);

  await page.goBack();
  await expect(back).toBeHidden();
  await expect(page).not.toHaveURL(/#/);
  await expect(page.locator('.ol-viewport')).toBeVisible();

  // The second back leaves the page, as before.
  await page.goBack();
  await expect(page).toHaveURL('about:blank');
});

test('closing in-app pops the entry, so the next back leaves the page', async ({ page }) => {
  const back = await openDeeplink(page);

  await back.click();
  await expect(back).toBeHidden();
  await expect(page).not.toHaveURL(/#/);

  await page.goBack();
  await expect(page).toHaveURL('about:blank');
});
