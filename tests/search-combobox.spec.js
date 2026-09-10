// SearchBar ARIA combobox pattern — #737
//
// Covers the observable contract mfuhrmann scoped on the issue: aria-expanded
// toggling with real results, arrow keys moving aria-activedescendant,
// Enter selecting the active option, Escape closing without moving focus
// out of the input, and the list staying open while focus moves to the
// clear button (the tab-order bug the old setTimeout/blur approach had).
//
// Left as manual checks, per the issue's own testing note — none reproduce
// in CI's Chromium: Safari desktop mouse selection, iOS Safari scroll
// inside the results list, and a TalkBack swipe through the options.

import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

const nominatimResults = [
  { display_name: 'Fulda, Landkreis Fulda, Hessen, Deutschland', lat: '50.5556', lon: '9.6808' },
  { display_name: 'Fulda-Bahnhof, Fulda, Hessen, Deutschland', lat: '50.5590', lon: '9.6770' },
];

async function stubNominatim(page, results = nominatimResults) {
  await page.route('**/nominatim.openstreetmap.org/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(results) })
  );
}

// Fills the input and waits for the debounced search (450ms, see
// SearchBar.svelte's onInput) to actually settle, rather than also
// pressing Enter to force an immediate second search - triggering both
// leaves two concurrent search() calls in flight, and the later one to
// resolve resets activeIndex, racing with whichever test runs next.
async function searchAndSettle(page, input, query) {
  await input.fill(query);
  await expect(page.locator('.result-item')).toHaveCount(nominatimResults.length);
}

test.describe('SearchBar combobox', () => {
  test.beforeEach(async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
    await stubNominatim(page);
    await page.goto('/');
  });

  test('aria-expanded reflects whether results are showing', async ({ page }) => {
    const input = page.locator('.search-input');
    await expect(input).toHaveAttribute('aria-expanded', 'false');

    await searchAndSettle(page, input, 'Fulda');

    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.search-results[role="listbox"]')).toBeVisible();
  });

  test('ArrowDown moves aria-activedescendant through the options', async ({ page }) => {
    const input = page.locator('.search-input');
    await searchAndSettle(page, input, 'Fulda');

    const optionIds = await page.locator('.result-item').evaluateAll(els => els.map(el => el.id));

    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', optionIds[0]);
    await expect(page.locator(`#${optionIds[0]}`)).toHaveAttribute('aria-selected', 'true');

    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', optionIds[1]);
    await expect(page.locator(`#${optionIds[0]}`)).toHaveAttribute('aria-selected', 'false');

    // Clamps at the last option rather than wrapping.
    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', optionIds[1]);

    await input.press('ArrowUp');
    await expect(input).toHaveAttribute('aria-activedescendant', optionIds[0]);
  });

  test('Enter selects the active option', async ({ page }) => {
    const input = page.locator('.search-input');
    await searchAndSettle(page, input, 'Fulda');

    await input.press('ArrowDown');
    await input.press('ArrowDown'); // second option
    await input.press('Enter');

    // selectResult() sets the input to the display_name's first segment.
    await expect(input).toHaveValue('Fulda-Bahnhof');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('Escape closes the list without moving focus out of the input', async ({ page }) => {
    const input = page.locator('.search-input');
    await searchAndSettle(page, input, 'Fulda');
    await expect(input).toHaveAttribute('aria-expanded', 'true');

    await input.press('Escape');

    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(input).toBeFocused();
  });

  test('list stays open while focus moves to the clear button', async ({ page }) => {
    const input = page.locator('.search-input');
    await searchAndSettle(page, input, 'Fulda');
    await expect(input).toHaveAttribute('aria-expanded', 'true');

    // Tab order is input -> clear button; focus leaving the input for a
    // sibling still inside .search-card must not hide the list (this is
    // the bug the old setTimeout-after-blur approach had).
    await page.locator('.clear-btn').focus();
    await page.waitForTimeout(50);

    await expect(page.locator('.search-results[role="listbox"]')).toBeVisible();
  });
});
