import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

// #758 — the map container is focusable and sits behind every overlay. While a
// modal dialog is open it must be inert, or Tab escapes the dialog onto a map
// nobody can see (and arrow keys pan it).

test.beforeEach(async ({ page }) => {
  await injectApiConfig(page);
  await stubApiRoutes(page);
  await page.goto('/');
  await expect(page.locator('.map-container')).toBeVisible();
});

test('the map is inert while the info dialog is open, and not after', async ({ page }) => {
  const map = page.locator('.map-container');
  await expect(map).not.toHaveAttribute('inert', /.*/);

  await page.locator('.controls-top-right .control-btn').first().click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  await expect(map).toHaveAttribute('inert', /.*/);

  // Tabbing through the whole dialog never lands on the map.
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const onMap = await page.evaluate(() => document.activeElement?.classList.contains('map-container'));
    expect(onMap, `Tab ${i + 1} reached the map`).toBe(false);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(map).not.toHaveAttribute('inert', /.*/);
});
