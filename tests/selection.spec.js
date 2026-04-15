import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

const OSM_ID = fixture.features[0].properties.osm_id;

// Navigate with the fixture playground pre-selected via URL hash and wait for
// the panel. Using hash restore avoids the need to click a specific canvas pixel.
async function loadWithSelection(page) {
  await injectApiConfig(page);
  await stubApiRoutes(page);
  await page.goto(`/#W${OSM_ID}`);
  await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });
}

test.describe('Playground selection', () => {
  test('info panel opens when playground is pre-selected via URL hash', async ({ page }) => {
    await loadWithSelection(page);
    await expect(page.locator('aside.info-panel')).toBeVisible();
  });

  test('URL hash is set after selection', async ({ page }) => {
    await loadWithSelection(page);
    await expect(page).toHaveURL(new RegExp(`#W${OSM_ID}`));
  });

  test('ESC key hides the info panel', async ({ page }) => {
    await loadWithSelection(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('aside.info-panel')).toBeHidden();
  });

  test('ESC key clears the URL hash', async ({ page }) => {
    await loadWithSelection(page);
    await page.keyboard.press('Escape');
    const url = new URL(page.url());
    expect(url.hash).toBe('');
  });
});
