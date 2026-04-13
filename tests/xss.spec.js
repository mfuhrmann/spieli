import { test, expect } from '@playwright/test';
import fixture from './fixtures/playground.json' assert { type: 'json' };

const OSM_ID = fixture.features[0].properties.osm_id;
const OSM_TYPE = fixture.features[0].properties.osm_type;

test.describe('XSS escaping', () => {
  test.beforeEach(async ({ page }) => {
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

  test('playground name with HTML characters is displayed as plain text', async ({ page }) => {
    const nameEl = page.locator('#info-name');
    await expect(nameEl).toBeVisible();
    // The raw name contains < > & — they must appear as literal characters, not tags
    const text = await nameEl.textContent();
    expect(text).toContain('<XSS & Friends>');
    // No child elements should have been injected by the name
    const childCount = await nameEl.evaluate(el => el.children.length);
    expect(childCount).toBe(0);
  });

  test('description with <script> tag does not execute and is shown as text', async ({ page }) => {
    let scriptExecuted = false;
    await page.exposeFunction('__xssProbe', () => { scriptExecuted = true; });

    const descEl = page.locator('#info-description');
    await expect(descEl).toBeVisible();
    const text = await descEl.textContent();
    expect(text).toContain("<script>alert('xss')</script>");
    expect(scriptExecuted).toBe(false);
  });

  test('operator with & is displayed as plain text', async ({ page }) => {
    const operatorEl = page.locator('#info-operator');
    await expect(operatorEl).toBeVisible();
    const text = await operatorEl.textContent();
    expect(text).toContain('Bezirksamt Mitte & Co.');
  });
});
