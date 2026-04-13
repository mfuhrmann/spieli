import { test, expect } from '@playwright/test';

// Stub Nominatim so the region name is deterministic regardless of CI environment.
const NOMINATIM_STUB = [{ name: 'Spielplatzkarte', boundingbox: ['51.0', '52.0', '9.0', '10.0'] }];

async function stubNominatim(page) {
  await page.route('**/nominatim.openstreetmap.org/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NOMINATIM_STUB) })
  );
}

test.describe('Smoke', () => {
  test('map canvas is visible', async ({ page }) => {
    await stubNominatim(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('page title contains Spielplatzkarte', async ({ page }) => {
    await stubNominatim(page);
    await page.goto('/');
    await expect(page).toHaveTitle(/Spielplatzkarte/);
  });
});
