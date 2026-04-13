import { test, expect } from '@playwright/test';

test.describe('Smoke', () => {
  test('map canvas is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('page title contains Spielplatzkarte', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Spielplatzkarte/);
  });
});
