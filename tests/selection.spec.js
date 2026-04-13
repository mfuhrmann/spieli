import { test, expect } from '@playwright/test';
import fixture from './fixtures/playground.json' assert { type: 'json' };

const OSM_ID = fixture.features[0].properties.osm_id;
const OSM_TYPE = fixture.features[0].properties.osm_type;

// Load the page with the fixture playground pre-selected via URL hash.
// This avoids the need to click a specific pixel on the map canvas.
async function loadWithSelection(page) {
  await page.route('**/rpc/get_playgrounds**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) })
  );
  await page.route('**/rpc/get_equipment**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) })
  );
  await page.route('**/rpc/get_trees**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) })
  );
  await page.route('**/rpc/get_pois**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.goto(`/#${OSM_TYPE}${OSM_ID}`);
  await expect(page.locator('#info.panel-open')).toBeVisible({ timeout: 8000 });
}

test.describe('Playground selection', () => {
  test('info panel opens when playground is pre-selected via URL hash', async ({ page }) => {
    await loadWithSelection(page);
    await expect(page.locator('#info.panel-open')).toBeVisible();
  });

  test('URL hash is set after selection', async ({ page }) => {
    await loadWithSelection(page);
    await expect(page).toHaveURL(new RegExp(`#${OSM_TYPE}${OSM_ID}`));
  });

  test('ESC key hides the info panel', async ({ page }) => {
    await loadWithSelection(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#info.panel-open')).toBeHidden();
  });

  test('ESC key clears the URL hash', async ({ page }) => {
    await loadWithSelection(page);
    await page.keyboard.press('Escape');
    const url = new URL(page.url());
    expect(url.hash).toBe('');
  });
});
