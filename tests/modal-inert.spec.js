import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

// #758 — the map container is focusable and sits behind every overlay, and so
// do the search bar, the control buttons and the side panel. While a modal
// dialog is open everything outside it must be inert: focus moves into the
// dialog, Tab stays there, and Esc hands focus back to where it was.

test.beforeEach(async ({ page }) => {
  await injectApiConfig(page);
  await stubApiRoutes(page);
  await page.goto('/');
  await expect(page.locator('.map-container')).toBeVisible();
});

test('keyboard focus stays in the info dialog, and returns after Esc', async ({ page }) => {
  const map = page.locator('.map-container');
  const infoBtn = page.locator('.controls-top-right .control-btn').first();
  await infoBtn.click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();

  // Focus moved into the dialog on open.
  await expect.poll(() => dialog.evaluate(d => d.contains(document.activeElement))).toBe(true);

  // Tab never leaves it — not onto the map, not onto any control behind it.
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const inside = await dialog.evaluate(d => d.contains(document.activeElement) || document.activeElement === document.body);
    expect(inside, `Tab ${i + 1} left the dialog for ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))}`).toBe(true);
  }
  await expect(map).toHaveJSProperty('inert', true);
  await expect(page.locator('.search-area')).toHaveJSProperty('inert', true);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(map).toHaveJSProperty('inert', false);
  await expect(page.locator('.search-area')).toHaveJSProperty('inert', false);
  // Focus back on the button that opened it.
  await expect(infoBtn).toBeFocused();
});
