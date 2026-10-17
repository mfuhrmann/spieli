import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

test.describe('FilterPanel', () => {
  test.beforeEach(async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('filter button is visible on the map', async ({ page }) => {
    await expect(page.locator('.filter-container button')).toBeVisible();
  });

  test('clicking filter button opens the dropdown', async ({ page }) => {
    await expect(page.locator('.filter-dropdown')).not.toBeVisible();
    await page.locator('.filter-container button').click();
    await expect(page.locator('.filter-dropdown')).toBeVisible();
  });

  test('clicking filter button again closes the dropdown', async ({ page }) => {
    const btn = page.locator('.filter-container button');
    await btn.click();
    await expect(page.locator('.filter-dropdown')).toBeVisible();
    await btn.click();
    await expect(page.locator('.filter-dropdown')).not.toBeVisible();
  });

  test('no badge shown before any filter is active', async ({ page }) => {
    await expect(page.locator('.filter-container .badge')).not.toBeVisible();
  });

  test('toggling a filter shows badge with count 1', async ({ page }) => {
    await page.locator('.filter-container button').click();
    await page.locator('.filter-list .filter-item input[type="checkbox"]').first().click();
    await expect(page.locator('.filter-container .badge')).toBeVisible();
    await expect(page.locator('.filter-container .badge')).toHaveText('1');
  });

  test('toggling two filters shows badge with count 2', async ({ page }) => {
    await page.locator('.filter-container button').click();
    const checkboxes = page.locator('.filter-list .filter-item input[type="checkbox"]');
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await expect(page.locator('.filter-container .badge')).toHaveText('2');
  });

  test('clear-all button appears only when a filter is active', async ({ page }) => {
    await page.locator('.filter-container button').click();
    await expect(page.locator('.clear-btn')).not.toBeVisible();
    await page.locator('.filter-list .filter-item input[type="checkbox"]').first().click();
    await expect(page.locator('.clear-btn')).toBeVisible();
  });

  test('clear-all removes all active filters and hides the badge', async ({ page }) => {
    await page.locator('.filter-container button').click();
    const checkboxes = page.locator('.filter-list .filter-item input[type="checkbox"]');
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await page.locator('.clear-btn').click();
    await expect(page.locator('.filter-container .badge')).not.toBeVisible();
    await expect(page.locator('.clear-btn')).not.toBeVisible();
  });

  test('untoggling a filter decrements the badge count', async ({ page }) => {
    await page.locator('.filter-container button').click();
    const checkboxes = page.locator('.filter-list .filter-item input[type="checkbox"]');
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await expect(page.locator('.filter-container .badge')).toHaveText('2');
    await checkboxes.nth(0).click();
    await expect(page.locator('.filter-container .badge')).toHaveText('1');
  });

  test('clicking outside the dropdown closes it', async ({ page }) => {
    await page.locator('.filter-container button').click();
    await expect(page.locator('.filter-dropdown')).toBeVisible();
    await page.mouse.click(10, 10);
    await expect(page.locator('.filter-dropdown')).not.toBeVisible();
  });

  test('layers section contains the standalone pitches toggle', async ({ page }) => {
    await page.locator('.filter-container button').click();
    await expect(page.locator('.layer-section')).toBeVisible();
    const pitchToggle = page.locator('.layer-section input[type="checkbox"] >> nth=0');
    await expect(pitchToggle).toBeVisible();
    await expect(pitchToggle).not.toBeChecked();
  });

  // The mapping-detail states moved to MappingDetailControl (#924); see
  // tests/mapping-detail.spec.js.
  test('filter panel lists no mapping-detail states', async ({ page }) => {
    await page.locator('.filter-container button').click();
    await expect(page.locator('.filter-dropdown')).toBeVisible();
    await expect(page.locator('.filter-dropdown .completeness-section')).toHaveCount(0);
    await expect(page.locator('.filter-dropdown')).not.toContainText('no details yet');
  });

  // #932 — the dropdown used a fixed 320 px list height whatever the window.
  test('dropdown uses the window height instead of a fixed list height', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.locator('.filter-container button').click();
    const [client, scroll] = await page.locator('.filter-list').evaluate(e => [e.clientHeight, e.scrollHeight]);
    expect(client, 'list fits without scrolling on a tall window').toBe(scroll);
  });

  test('dropdown stays inside a short window', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.locator('.filter-container button').click();
    const box = await page.locator('.filter-dropdown').boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(480);
  });

  test('the pitch layer alone does not mark the filter button active', async ({ page }) => {
    await page.locator('.filter-container button').click();
    await page.locator('.layer-section input[type="checkbox"] >> nth=0').check();
    await expect(page.locator('.filter-container .badge')).toHaveCount(0);
    await expect(page.locator('.filter-container .control-btn')).not.toHaveClass(/active/);
  });

  // #947 — pitches only load from zoom 12; below it the toggle gave no feedback.
  test('the pitch toggle says to zoom in when the map is too far out', async ({ page }) => {
    await page.evaluate(() => window.__spieli.map.getView().setZoom(10));
    await page.locator('.filter-container button').click();
    await page.locator('.layer-section input[type="checkbox"] >> nth=0').check();
    await expect(page.locator('.layer-hint')).toHaveText('Shown when you zoom in further.');
    await page.locator('.filter-container button').click();
    await page.evaluate(() => window.__spieli.map.getView().setZoom(14));
    await page.locator('.filter-container button').click();
    await expect(page.locator('.layer-hint')).toHaveCount(0);
    // Zooming with the dropdown open (wheel, pinch) updates the hint too.
    await page.evaluate(() => window.__spieli.map.getView().setZoom(9));
    await expect(page.locator('.layer-hint')).toHaveCount(1);
  });
});
