import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

/**
 * Nominatim results used by every test. Five entries so arrow-key wrap-around
 * and the 5-result slice in `search()` are both exercised.
 */
const HITS = [
  { display_name: 'Fulda, Landkreis Fulda, Hessen, Deutschland', lat: '50.5558', lon: '9.6808' },
  { display_name: 'Fulda-Galerie, Fulda, Hessen, Deutschland', lat: '50.5520', lon: '9.6500' },
  { display_name: 'Fuldatal, Landkreis Kassel, Hessen, Deutschland', lat: '51.3800', lon: '9.4700' },
  { display_name: 'Fuldabrück, Landkreis Kassel, Hessen, Deutschland', lat: '51.2600', lon: '9.5200' },
  { display_name: 'Fuldaaue, Fulda, Hessen, Deutschland', lat: '50.5600', lon: '9.7000' },
];

async function stubNominatim(page, hits = HITS) {
  await page.route('**/nominatim.openstreetmap.org/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hits) })
  );
}

/**
 * The value `selectResult` writes back into the input for the option at
 * `index`: the first comma-segment of its rendered display_name.
 */
async function expectedQueryFor(page, index) {
  const text = await page.locator('.search-results [role="option"] .result-text').nth(index).innerText();
  return text.split(',')[0];
}

/** Type a query and wait for the suggestion list to open (450 ms debounce). */
async function openSuggestions(page, query = 'Fulda') {
  const input = page.locator('.search-input');
  await input.click();
  await input.fill(query);
  await expect(page.locator('.search-results')).toBeVisible();
  return input;
}

test.describe('SearchBar combobox a11y', () => {
  test.beforeEach(async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
    await stubNominatim(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('input exposes the combobox contract', async ({ page }) => {
    const input = page.locator('.search-input');
    await expect(input).toHaveAttribute('role', 'combobox');
    await expect(input).toHaveAttribute('aria-autocomplete', 'list');
    await expect(input).toHaveAttribute('aria-expanded', 'false');

    const controls = await input.getAttribute('aria-controls');
    expect(controls).toBeTruthy();

    await openSuggestions(page);
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(`#${controls}`)).toHaveAttribute('role', 'listbox');
  });

  test('aria-busy tracks the in-flight request', async ({ page }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/nominatim.openstreetmap.org/**', async route => {
      await gate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HITS) });
    });

    const input = page.locator('.search-input');
    await expect(input).toHaveAttribute('aria-busy', 'false');
    await input.click();
    await input.fill('Fulda');

    await expect(input).toHaveAttribute('aria-busy', 'true');
    release();
    await expect(page.locator('.search-results')).toBeVisible();
    await expect(input).toHaveAttribute('aria-busy', 'false');
  });

  test('options carry option semantics and stable ids', async ({ page }) => {
    await openSuggestions(page);
    const options = page.locator('.search-results [role="option"]');
    await expect(options).toHaveCount(5);

    const ids = await options.evaluateAll(els => els.map(el => el.id));
    expect(new Set(ids).size).toBe(5);
    expect(ids.every(Boolean)).toBe(true);

    // Nothing active yet.
    await expect(options.first()).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('.search-input')).not.toHaveAttribute('aria-activedescendant', /./);
  });

  test('arrow keys move aria-activedescendant without moving focus', async ({ page }) => {
    const input = await openSuggestions(page);
    const options = page.locator('.search-results [role="option"]');
    const firstId = await options.nth(0).getAttribute('id');
    const secondId = await options.nth(1).getAttribute('id');
    const lastId = await options.nth(4).getAttribute('id');

    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', firstId);
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(input).toBeFocused();

    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', secondId);
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'false');

    await input.press('ArrowUp');
    await input.press('ArrowUp');
    // Wrapped from the first option to the last.
    await expect(input).toHaveAttribute('aria-activedescendant', lastId);
    await expect(input).toBeFocused();
  });

  test('Enter selects the active option and closes the list', async ({ page }) => {
    const input = await openSuggestions(page);
    await input.press('ArrowDown');
    await input.press('ArrowDown');
    // Results are re-sorted by distance to the region centre, so read the
    // expected label off the rendered option rather than assuming HITS order.
    const expected = await expectedQueryFor(page, 1);
    await input.press('Enter');

    await expect(page.locator('.search-results')).toHaveCount(0);
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(input).toHaveValue(expected);
  });

  test('Escape closes the list and keeps focus in the input', async ({ page }) => {
    const input = await openSuggestions(page);
    await input.press('Escape');

    await expect(page.locator('.search-results')).toHaveCount(0);
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(input).toBeFocused();
    await expect(input).not.toHaveAttribute('aria-activedescendant', /./);
  });

  test('ArrowDown reopens a closed list with cached results', async ({ page }) => {
    const input = await openSuggestions(page);
    await input.press('Escape');
    await expect(page.locator('.search-results')).toHaveCount(0);

    await input.press('ArrowDown');
    await expect(page.locator('.search-results')).toBeVisible();
  });

  test('focus on the clear button keeps the list open', async ({ page }) => {
    await openSuggestions(page);
    await page.locator('.clear-btn').focus();

    await expect(page.locator('.clear-btn')).toBeFocused();
    await expect(page.locator('.search-results')).toBeVisible();
  });

  test('suggestions are not tab stops', async ({ page }) => {
    const input = await openSuggestions(page);
    await expect(page.locator('.search-results [role="option"]').first())
      .toHaveAttribute('tabindex', '-1');

    await input.press('Tab');
    await expect(page.locator('.clear-btn')).toBeFocused();
    await expect(page.locator('.search-results')).toBeVisible();
  });

  test('focus leaving the card closes the list', async ({ page }) => {
    await openSuggestions(page);
    await page.locator('.filter-container button').focus();
    await expect(page.locator('.search-results')).toHaveCount(0);
  });

  test('clicking a suggestion selects it', async ({ page }) => {
    const input = await openSuggestions(page);
    const expected = await expectedQueryFor(page, 2);
    await page.locator('.search-results [role="option"]').nth(2).click();

    await expect(page.locator('.search-results')).toHaveCount(0);
    await expect(input).toHaveValue(expected);
  });

  test('pointer and keyboard share one highlight', async ({ page }) => {
    const input = await openSuggestions(page);
    const options = page.locator('.search-results [role="option"]');

    await options.nth(3).hover();
    await expect(options.nth(3)).toHaveAttribute('aria-selected', 'true');
    const hoveredId = await options.nth(3).getAttribute('id');
    await expect(input).toHaveAttribute('aria-activedescendant', hoveredId);

    await input.press('ArrowDown');
    await expect(options.nth(4)).toHaveAttribute('aria-selected', 'true');
    await expect(options.nth(3)).toHaveAttribute('aria-selected', 'false');
    // Exactly one row highlighted, and it is the one announced.
    await expect(page.locator('.search-results [aria-selected="true"]')).toHaveCount(1);
  });

  test('a new result set clears the active option', async ({ page }) => {
    const input = await openSuggestions(page);
    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', /./);

    await stubNominatim(page, HITS.slice(0, 2));
    await input.fill('Kassel');
    await expect(page.locator('.search-results [role="option"]')).toHaveCount(2);
    await expect(input).not.toHaveAttribute('aria-activedescendant', /./);
  });
});
