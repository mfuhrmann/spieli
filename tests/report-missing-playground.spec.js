import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

/**
 * #1000 — a visitor who knows a playground the map does not show can leave an
 * anonymous hint, which becomes an OpenStreetMap note. The OSM API is stubbed:
 * nothing here reaches openstreetmap.org.
 */

const NOTES = 'https://notes.example.org';
const EMPTY = { type: 'FeatureCollection', features: [] };

async function setup(page, overrides = {}) {
  const posts = [];
  const gets = [];
  await injectApiConfig(page, { osmNotesUrl: NOTES, ...overrides });
  await stubApiRoutes(page, EMPTY);
  await page.route(`${NOTES}/api/0.6/notes.json`, async route => {
    posts.push(route.request().postData());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ type: 'Feature', properties: { id: 4711, status: 'open' } }),
    });
  });
  await page.route(`${NOTES}/api/0.6/notes/*.json`, async route => {
    gets.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ type: 'Feature', properties: { id: 4711, status: 'closed' } }),
    });
  });
  await page.goto('/');
  await expect(page.locator('.ol-viewport')).toBeVisible();
  return { posts, gets };
}

test('a hint is placed, filled in and sent as an OSM note', async ({ page }) => {
  const { posts, gets } = await setup(page);
  // Opening the map contacts the notes API for nothing.
  expect(posts).toHaveLength(0);
  expect(gets).toHaveLength(0);

  await page.getByRole('button', { name: 'Missing a playground?' }).click();
  const card = page.getByRole('region', { name: 'Where is the playground?' });
  await expect(card).toBeVisible();

  // Zoomed out too far to place precisely: the card asks to zoom in first.
  await card.getByRole('button', { name: 'Zoom in closer' }).click();
  await card.getByRole('button', { name: 'Next' }).click();

  // Two clearly separate ways: a hint without an account, or MapComplete.
  const choose = page.getByRole('dialog', { name: 'How would you like to report it?' });
  await expect(choose.getByRole('link', { name: /Add it yourself/ }))
    .toHaveAttribute('href', /^https:\/\/mapcomplete\.org\/playgrounds\.html\?z=19&lat=/);
  await choose.getByRole('button', { name: /Leave a hint/ }).click();

  const dialog = page.getByRole('dialog', { name: "What's there?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Slide' }).click();
  await expect(dialog.getByRole('button', { name: 'Slide' })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Fenced' }).click();
  await dialog.getByLabel('Anything else? (optional)').fill('behind the school');
  await dialog.getByRole('button', { name: 'Send hint' }).click();

  const done = page.getByRole('dialog', { name: 'Thank you!' });
  await expect(done).toBeVisible();
  await expect(done.getByRole('link', { name: 'View your hint on OpenStreetMap' }))
    .toHaveAttribute('href', `${NOTES}/note/4711`);

  expect(posts).toHaveLength(1);
  const body = new URLSearchParams(posts[0]);
  // The note is written in the region's language (default de), not the UI's.
  expect(body.get('text')).toContain('Ausstattung (je ein eigener Punkt):\nplayground=slide\n');
  expect(body.get('text')).toContain('\nbarrier=fence\n');
  expect(body.get('text')).toContain('behind the school');
  expect(Number(body.get('lat'))).not.toBeNaN();

  // The sent hint is remembered in this browser only.
  const own = await page.evaluate(() => JSON.parse(localStorage.getItem('spieli.ownNotes')));
  expect(own.map(n => n.id)).toEqual([4711]);
  await done.getByRole('button', { name: 'Back to the map' }).click();
  await expect(done).toBeHidden();
});

test('Escape cancels placing and the map button comes back', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Missing a playground?' }).click();
  await expect(page.getByRole('region', { name: 'Where is the playground?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Where is the playground?' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Missing a playground?' })).toBeVisible();
});

test('with notes turned off, only MapComplete is offered', async ({ page }) => {
  const { posts } = await setup(page, { osmNotesUrl: '' });
  await page.getByRole('button', { name: 'Missing a playground?' }).click();
  const card = page.getByRole('region', { name: 'Where is the playground?' });
  await card.getByRole('button', { name: 'Zoom in closer' }).click();
  await card.getByRole('button', { name: 'Next' }).click();
  const choose = page.getByRole('dialog', { name: 'How would you like to report it?' });
  await expect(choose.getByRole('link', { name: /Add it yourself/ })).toBeVisible();
  await expect(choose.getByRole('button', { name: /Leave a hint/ })).toHaveCount(0);
  expect(posts).toHaveLength(0);
});

test('a search with no hits offers to report a missing playground', async ({ page }) => {
  await page.route('**/nominatim.openstreetmap.org/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await setup(page);
  const input = page.locator('.search-input');
  await input.click();
  await input.fill('Spielplatz am Mühlbach');
  const offer = page.getByRole('button', { name: 'Missing a playground? Report it' });
  await expect(offer).toBeVisible();

  // Editing the query withdraws the offer until the next search lands.
  await input.press('Backspace');
  await expect(offer).toBeHidden();
  await expect(offer).toBeVisible();

  await offer.click();
  await expect(page.getByRole('region', { name: 'Where is the playground?' })).toBeVisible();
});
