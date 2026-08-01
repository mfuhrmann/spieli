import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

/**
 * The page language and the language of OSM-derived names are two independent
 * values. These tests pin the pair together, because fixing only one of them
 * is what produces a regression: setting <html lang> from the UI locale makes
 * every unannotated playground name newly wrong.
 */
test.describe('Document and content language', () => {
  test('page language follows the configured locale', async ({ page }) => {
    await injectApiConfig(page, { defaultLocale: 'en' });
    await stubApiRoutes(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('page language follows a German configuration', async ({ page }) => {
    await injectApiConfig(page, { defaultLocale: 'de' });
    await stubApiRoutes(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();

    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });

  test('an unsupported configured locale falls back, and the document says so', async ({ page }) => {
    await injectApiConfig(page, { defaultLocale: 'ja' });
    await stubApiRoutes(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('OSM names keep the region language while the UI is English', async ({ page }) => {
    await injectApiConfig(page, { defaultLocale: 'en', regionLang: 'de' });
    await stubApiRoutes(page);
    const osmId = fixture.features[0].properties.osm_id;
    await page.goto(`/#W${osmId}`);
    await expect(page.locator('canvas')).toBeVisible();

    const title = page.locator('.panel-title').first();
    await expect(title).toBeVisible();
    // The document is English; the playground's own name is not.
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(title).toHaveAttribute('lang', 'de');
  });

  test('region language is honoured independently of the UI locale', async ({ page }) => {
    await injectApiConfig(page, { defaultLocale: 'de', regionLang: 'fr' });
    await stubApiRoutes(page);
    const osmId = fixture.features[0].properties.osm_id;
    await page.goto(`/#W${osmId}`);
    await expect(page.locator('canvas')).toBeVisible();

    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.locator('.panel-title').first()).toHaveAttribute('lang', 'fr');
  });

  test('an unnamed playground falls back to the interface language', async ({ page }) => {
    const unnamed = JSON.parse(JSON.stringify(fixture));
    for (const f of unnamed.features) {
      for (const tag of ['name', 'alt_name', 'loc_name', 'official_name', 'old_name', 'short_name']) {
        delete f.properties[tag];
      }
    }

    await injectApiConfig(page, { defaultLocale: 'en', regionLang: 'de' });
    await stubApiRoutes(page, unnamed);
    const osmId = unnamed.features[0].properties.osm_id;
    await page.goto(`/#W${osmId}`);
    await expect(page.locator('canvas')).toBeVisible();

    // The title is now a translated placeholder, not OSM data.
    await expect(page.locator('.panel-title').first()).toHaveAttribute('lang', 'en');
  });
});
