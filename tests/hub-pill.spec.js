import { test, expect } from '@playwright/test';
import { injectHubConfig, stubHubRegistry, stubFederationStatus, makePlayground } from './helpers.js';

const instanceA = {
  slug: 'slug-a',
  url: '/api-a',
  name: 'Instanz A',
  playgrounds: {
    type: 'FeatureCollection',
    features: [makePlayground({ osmId: 111, name: 'Playground A', lon: 9.675, lat: 50.551 })],
  },
  meta: { name: 'Region A', version: '0.2.1', bbox: [9.6, 50.5, 9.7, 50.6] },
};

const instanceB = {
  slug: 'slug-b',
  url: '/api-b',
  name: 'Instanz B',
  playgrounds: {
    type: 'FeatureCollection',
    features: [
      makePlayground({ osmId: 222, name: 'Playground B1', lon: 8.680, lat: 50.110 }),
      makePlayground({ osmId: 333, name: 'Playground B2', lon: 8.685, lat: 50.115 }),
    ],
  },
  meta: { name: 'Region B', version: '0.2.1', bbox: [8.6, 50.0, 8.7, 50.2] },
};

test.describe('Hub instance pill + drawer', () => {
  test.beforeEach(async ({ page }) => {
    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA, instanceB });
  });

  test('pill shows aggregated region + playground counts after load', async ({ page }) => {
    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });
    await expect(pill).toContainText(/3\s+(Spielplätze|playgrounds)/);
  });

  test('clicking pill expands drawer with per-backend rows', async ({ page }) => {
    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();

    const drawer = page.locator('.drawer[role="dialog"]');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('.instance-name')).toHaveCount(2);
    await expect(drawer).toContainText('Instanz A');
    await expect(drawer).toContainText('Instanz B');
  });

  test('ESC collapses drawer', async ({ page }) => {
    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();
    await expect(page.locator('.drawer[role="dialog"]')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.drawer[role="dialog"]')).toHaveCount(0);
  });

  test('outside click collapses drawer', async ({ page }) => {
    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();
    await expect(page.locator('.drawer[role="dialog"]')).toBeVisible();

    // Click on the map canvas, well clear of the pill/drawer.
    await page.locator('canvas').click({ position: { x: 400, y: 300 } });
    await expect(page.locator('.drawer[role="dialog"]')).toHaveCount(0);
  });

  test('drawer shows version badge when meta includes version', async ({ page }) => {
    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();

    const badges = page.locator('.drawer[role="dialog"] .instance-badge');
    await expect(badges).toHaveCount(2);
    await expect(badges.first()).toContainText('0.2.1');
  });

  test('drawer shows "updating" badge when federation-status marks backend as importing', async ({ page }) => {
    await stubFederationStatus(page, {
      backends: {
        'slug-a': { url: '/api-a', up: true, importing: true },
        'slug-b': { url: '/api-b', up: true, importing: false },
      },
    });

    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();

    const drawer = page.locator('.drawer[role="dialog"]');
    await expect(drawer).toBeVisible();

    // Instanz A is importing — should show the updating badge
    const itemA = drawer.locator('.instance-item').filter({ hasText: 'Instanz A' });
    await expect(itemA.locator('.instance-badge--importing')).toBeVisible();

    // Instanz B is not importing — should show version badge, not updating badge
    const itemB = drawer.locator('.instance-item').filter({ hasText: 'Instanz B' });
    await expect(itemB.locator('.instance-badge--importing')).toHaveCount(0);
    await expect(itemB.locator('.instance-badge')).toContainText('0.2.1');
  });

  test('drawer shows no "updating" badge when importing is false or absent', async ({ page }) => {
    await stubFederationStatus(page, {
      backends: {
        'slug-a': { url: '/api-a', up: true, importing: false },
        'slug-b': { url: '/api-b', up: true },
      },
    });

    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();

    const drawer = page.locator('.drawer[role="dialog"]');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('.instance-badge--importing')).toHaveCount(0);
  });

  test('updating badge clears when next federation-status poll reports importing: false', async ({ page }) => {
    // 1-second poll interval so we don't wait long for the second fetch.
    await injectHubConfig(page, { hubPollInterval: 1 });

    let callCount = 0;
    await page.route('**/federation-status.json', route => {
      callCount++;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generated_at: new Date().toISOString(),
          poll_interval_seconds: 1,
          backends: {
            'slug-a': { url: '/api-a', up: true, importing: callCount === 1 },
            'slug-b': { url: '/api-b', up: true, importing: false },
          },
        }),
      });
    });

    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();
    const drawer = page.locator('.drawer[role="dialog"]');
    await expect(drawer).toBeVisible();

    const itemA = drawer.locator('.instance-item').filter({ hasText: 'Instanz A' });
    // First poll: importing=true → badge visible
    await expect(itemA.locator('.instance-badge--importing')).toBeVisible();
    // Second poll (≤ 1 s): importing=false → badge gone
    await expect(itemA.locator('.instance-badge--importing')).toHaveCount(0, { timeout: 5000 });
  });
});
