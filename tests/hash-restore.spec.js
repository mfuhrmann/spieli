import { test, expect } from '@playwright/test';
import fixture from './fixtures/playground.json' assert { type: 'json' };

const OSM_ID = fixture.features[0].properties.osm_id;
const OSM_TYPE = fixture.features[0].properties.osm_type;

test.describe('URL hash restore', () => {
  test('loading with a hash opens the info panel for that playground', async ({ page }) => {
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
  });
});
