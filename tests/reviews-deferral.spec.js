import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

const OSM_ID = fixture.features[0].properties.osm_id;
// Reviews are read from one subject per label a playground may be filed under
// (#914): spieli's old label, `playground`, and the name when it has one.
const NAME = fixture.features[0].properties.name;
const SUBJECTS = NAME && NAME.toLowerCase() !== 'playground' ? 3 : 2;

// The audit behind #855 read the fetch call in ReviewsPanel and concluded that
// selecting a playground contacts Mangrove. It does not: PlaygroundPanel mounts
// each accordion section's component only while that section is open, and
// reviews are closed by default. These tests pin that down, so the property is
// asserted rather than re-derived from reading two files together, and so a
// future change to the default open sections fails here instead of silently
// widening what the browser discloses.

/** Count requests to Mangrove and answer them without leaving the machine. */
async function stubMangrove(page) {
  const urls = [];
  await page.route('https://api.mangrove.reviews/**', route => {
    urls.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reviews: [], issuers: null, maresi_subjects: null }),
    });
  });
  return urls;
}

async function loadWithSelection(page) {
  await injectApiConfig(page);
  await stubApiRoutes(page);
  await page.goto(`/#W${OSM_ID}`);
  await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });
}

const reviewsToggle = page =>
  page.locator('aside.info-panel button.section-btn')
      .filter({ hasText: /Reviews|Bewertungen/ });

test.describe('Mangrove is not contacted until the visitor asks', () => {
  test('selecting a playground issues no request to Mangrove', async ({ page }) => {
    const urls = await stubMangrove(page);
    await loadWithSelection(page);
    // Give any stray on-selection fetch time to fire before asserting absence.
    await page.waitForTimeout(1000);
    expect(urls).toHaveLength(0);
  });

  test('expanding the reviews section issues one request per subject', async ({ page }) => {
    const urls = await stubMangrove(page);
    await loadWithSelection(page);
    await reviewsToggle(page).click();
    await expect.poll(() => urls.length, { timeout: 5000 }).toBe(SUBJECTS);
    await page.waitForTimeout(500);
    expect(urls).toHaveLength(SUBJECTS);
    const labels = urls.map(u => decodeURIComponent(new URL(u).searchParams.get('sub')).match(/[?&]q=([^&]*)/)[1]);
    expect(labels.slice(0, 2)).toEqual([`osm_playground_${OSM_ID}`, 'playground']);
  });

  test('collapsing and re-expanding does not re-fetch', async ({ page }) => {
    const urls = await stubMangrove(page);
    await loadWithSelection(page);
    const toggle = reviewsToggle(page);

    await toggle.click();
    await expect.poll(() => urls.length, { timeout: 5000 }).toBe(SUBJECTS);

    // Collapsing destroys ReviewsPanel, so the re-mount below would fetch again
    // without the module-level session cache in app/src/lib/reviews.js.
    await toggle.click();
    await toggle.click();
    await page.waitForTimeout(1000);
    expect(urls).toHaveLength(SUBJECTS);
  });

  test('a failed read still leaves the visitor able to submit', async ({ page }) => {
    // Submitting is a separate request that may succeed while the read path is
    // rate limited or down, so the error must not take the form with it.
    await page.route('https://api.mangrove.reviews/**', route =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    );
    await loadWithSelection(page);
    await reviewsToggle(page).click();

    const panel = page.locator('aside.info-panel');
    // Wait on the error notice first: it is the precondition under test (the
    // read failed) and it appears in the same render as the form. Asserting
    // the form alone raced the fetch settling — with the whole suite competing
    // for one preview server, a bare 5s was marginal and this flaked roughly
    // one run in three. The 15s matches the panel wait in loadWithSelection
    // rather than being a number picked to make a failure go away.
    // Matched on text, not on `small.text-muted`: three elements in this panel
    // carry that class ("No equipment mapped", "No nearby facilities", and this
    // one), so a class selector is a strict-mode violation rather than a wait.
    await expect(panel.getByText(/could not be loaded|konnten nicht/i))
      .toBeVisible({ timeout: 15000 });
    await expect(panel.locator('.review-form')).toBeVisible({ timeout: 15000 });
    await expect(panel.locator('.star-btn').first()).toBeVisible();
  });

  test('the collapsed section header shows no review count', async ({ page }) => {
    await stubMangrove(page);
    await loadWithSelection(page);
    // A count on the header would require the very request this defers.
    await expect(reviewsToggle(page)).not.toHaveText(/\d/);
  });
});
