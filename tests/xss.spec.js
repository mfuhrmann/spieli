import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

const OSM_ID = fixture.features[0].properties.osm_id;

test.describe('XSS escaping', () => {
  test.beforeEach(async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
    await page.goto(`/#W${OSM_ID}`);
    await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });
  });

  test('playground name with HTML characters is displayed as plain text', async ({ page }) => {
    const nameEl = page.locator('.info-panel__header .fw-semibold');
    await expect(nameEl).toBeVisible();
    const text = await nameEl.textContent();
    // Raw name contains <script>, < > & — must appear as literal characters, not tags.
    expect(text).toContain("<script>alert('xss')</script>");
    expect(text).toContain('<XSS & Friends>');
    // No child elements should have been injected by the name.
    const childCount = await nameEl.evaluate(el => el.children.length);
    expect(childCount).toBe(0);
  });

  test('description with <script> tag does not execute and is shown as text', async ({ page }) => {
    // Description paragraphs use p.small without the text-muted class (which
    // is reserved for the location line above them).
    const descEl = page.locator('.info-panel__body p.small:not(.text-muted)').first();
    await expect(descEl).toBeVisible();
    const text = await descEl.textContent();
    expect(text).toContain("<script>alert('xss')</script>");
  });

  test('operator with & is displayed as plain text', async ({ page }) => {
    // Operator is rendered in a <dd> adjacent to <dt>Betreiber</dt>.
    const operatorEl = page.locator('dt.col-5:has-text("Betreiber") + dd.col-7');
    await expect(operatorEl).toBeVisible();
    const text = await operatorEl.textContent();
    expect(text).toContain('Bezirksamt Mitte & Co.');
  });
});
