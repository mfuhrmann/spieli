import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

/**
 * The page language and the language of OSM-derived names are two independent
 * values, and they fail in opposite ways.
 *
 * The page-language tests are a REGRESSION GUARD, not a fix. `<html lang>`
 * already follows the resolved locale, because svelte-i18n's runtime sets it
 * (dist/runtime.js:313, v4.0.1) — no application code writes that attribute.
 * Verified by deleting every candidate line and watching these stay green, then
 * by running this file against an unmodified main. Inherited behaviour a minor
 * upgrade could drop silently, and nobody without a screen reader would notice,
 * so it gets pinned here rather than assumed.
 *
 * The content-language tests ARE the fix. They fail on main: OSM-derived
 * playground names carry no `lang`, so they inherit the document's — which the
 * library has been setting to the UI locale all along. A German name in an
 * English UI is already announced with English phonetics today (WCAG 3.1.2).
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
