import { test, expect, devices } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

/**
 * #1087 — phones get the share sheet, computers copy the link, and a tap
 * never ends in nothing: a failed share sheet falls back to copying.
 */

const OSM_ID = fixture.features[0].properties.osm_id;

async function stubShare(page, behaviour) {
  await page.addInitScript((b) => {
    window.__shared = []; window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async (t) => { window.__copied.push(t); } },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d) => {
        window.__shared.push(d);
        if (b !== 'ok') { const e = new Error(b); e.name = b; throw e; }
      },
    });
  }, behaviour);
}

async function open(page, selector) {
  await injectApiConfig(page);
  await stubApiRoutes(page);
  await page.goto(`/#W${OSM_ID}`);
  const btn = page.locator(`${selector} [data-testid="share-btn"]`);
  await expect(btn).toBeVisible({ timeout: 8000 });
  return btn;
}

test.describe('computer', () => {
  test('copies the link and says so, even where a share sheet exists', async ({ page }) => {
    await stubShare(page, 'ok');
    const btn = await open(page, 'aside.info-panel');
    await expect(btn).toHaveAttribute('aria-label', /Copy link/);
    await btn.click();
    await expect(page.locator('aside.info-panel [data-testid="share-toast"]')).toHaveText('Link copied');
    expect(await page.evaluate(() => window.__shared.length)).toBe(0);
    expect(await page.evaluate(() => window.__copied)).toEqual([expect.stringMatching(new RegExp(`#W${OSM_ID}$`))]);
  });
});

test.describe('phone', () => {
  // Pixel 7's viewport, touch and user agent, without defaultBrowserType
  // (which may not be set inside a describe group).
  const { defaultBrowserType: _b, ...pixel } = devices['Pixel 7'];
  test.use(pixel);
  const panel = '.mobile-detail-panel';

  test('opens the share sheet', async ({ page }) => {
    await stubShare(page, 'ok');
    const btn = await open(page, panel);
    await expect(btn).toHaveAttribute('aria-label', /Share/);
    await btn.tap();
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
    expect(await page.evaluate(() => window.__copied.length)).toBe(0);
    await expect(page.locator(`${panel} [data-testid="share-toast"]`)).toHaveCount(0);
  });

  test('a rejected share sheet falls back to copying, visibly', async ({ page }) => {
    await stubShare(page, 'NotAllowedError');
    const btn = await open(page, panel);
    await btn.tap();
    await expect(page.locator(`${panel} [data-testid="share-toast"]`)).toHaveText('Link copied');
    expect(await page.evaluate(() => window.__copied.length)).toBe(1);
  });

  test('cancelling the share sheet copies nothing', async ({ page }) => {
    await stubShare(page, 'AbortError');
    const btn = await open(page, panel);
    await btn.tap();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__copied.length)).toBe(0);
    await expect(page.locator(`${panel} [data-testid="share-toast"]`)).toHaveCount(0);
  });
});
