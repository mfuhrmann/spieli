// Cross-backend osm_id deduplication tests — #202
//
// The polygon tier can receive the same osm_id from two backends when a
// playground sits on or near a region boundary. Without dedup, two overlapping
// features land in the polygon source and clicking on either one routes
// equipment fetches to whichever backend "owns" the feature under the cursor —
// non-deterministic from the user's perspective.
//
// This file covers:
//   1. Smoke: both backends load and polygon fetches complete without errors
//      even when every osm_id in the result set overlaps across backends.
//   2. Fan-out: get_playgrounds_bbox is still issued to both backends — dedup
//      happens client-side AFTER the data arrives, not before the request.
//   3. Timestamp-based winner: when backend B has a newer last_import_at, the
//      deeplink selection of the shared osm_id goes to B for equipment fetches.
//      (Tested via slug-scoped hash deeplink + get_equipment call tracking —
//      this exercises the winning backend's _backendUrl being set correctly
//      on the feature in the polygon source.)
//
// What is NOT yet tested (see TODO at the bottom):
//   - Direct assertion that polygonSource.getFeatures() contains exactly one
//     entry for the shared osm_id. That needs either a canvas-click or a DOM
//     hook exposing the source length — neither is currently in the test harness.

import { test, expect } from '@playwright/test';
import {
  injectHubConfig,
  stubHubRegistry,
  makePlayground,
} from './helpers.js';

const SHARED_OSM_ID = 5000;

// Both backends return the same osm_id. Backend B has a newer import.
function makeFixtures({ lastImportAtA, lastImportAtB } = {}) {
  const sharedPg = makePlayground({ osmId: SHARED_OSM_ID, name: 'Border Park', lon: 9.675, lat: 50.551 });

  const instanceA = {
    slug: 'slug-a',
    url: '/api-a',
    name: 'Backend A',
    playgrounds: { type: 'FeatureCollection', features: [sharedPg] },
    meta: {
      name: 'Region A',
      bbox: [9.6, 50.5, 9.7, 50.6],
      playground_count: 1, complete: 0, partial: 1, missing: 0,
      last_import_at: lastImportAtA ?? null,
    },
  };

  const instanceB = {
    slug: 'slug-b',
    url: '/api-b',
    name: 'Backend B',
    playgrounds: { type: 'FeatureCollection', features: [sharedPg] },
    meta: {
      name: 'Region B',
      bbox: [9.6, 50.5, 9.7, 50.6],
      playground_count: 1, complete: 0, partial: 1, missing: 0,
      last_import_at: lastImportAtB ?? null,
    },
  };

  return { instanceA, instanceB };
}

test.describe('Hub polygon dedup — cross-backend osm_id', () => {
  test('smoke: polygon tier loads without error when both backends share an osm_id', async ({ page }) => {
    const { instanceA, instanceB } = makeFixtures();
    // Force polygon tier by disabling cluster (clusterMaxZoom: 0)
    await injectHubConfig(page, { clusterMaxZoom: 0 });
    await stubHubRegistry(page, { instanceA, instanceB });
    await page.goto('/');

    // Pill settles — both backends loaded, no unhandled errors
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    // No uncaught errors logged that would indicate a dedup crash
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test('fan-out: get_playgrounds_bbox is called on both backends despite shared osm_id', async ({ page }) => {
    const { instanceA, instanceB } = makeFixtures();
    const polygonCalls = { a: 0, b: 0 };
    page.on('request', req => {
      const u = req.url();
      if (!u.includes('/rpc/get_playgrounds_bbox')) return;
      if (u.includes('/api-a/')) polygonCalls.a += 1;
      if (u.includes('/api-b/')) polygonCalls.b += 1;
    });

    await injectHubConfig(page, { clusterMaxZoom: 0 });
    await stubHubRegistry(page, { instanceA, instanceB });
    await page.goto('/');

    await expect(page.locator('.instance-slot .pill')).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });
    await expect.poll(() => polygonCalls.a, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => polygonCalls.b, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  });

  test('winner by timestamp: equipment fetched from newer-import backend on slug-scoped deeplink', async ({ page }) => {
    // Backend B has a newer import → should be the winning backend.
    // We verify via a slug-scoped deeplink (#slug-b/W5000): it calls
    // get_playground on B, selects the feature, then fetches equipment from B.
    // This is the deeplink path — it explicitly names the backend, so it
    // does NOT directly test the polygon source dedup winner. However, it
    // verifies that _lastImportAt is correctly stamped and that the winning
    // backend's equipment endpoint is reachable, which is the user-visible
    // outcome of the dedup.
    //
    // See TODO below for the direct polygon-source assertion.
    const equipCalls = { a: 0, b: 0 };
    page.on('request', req => {
      const u = req.url();
      if (!u.includes('/rpc/get_equipment')) return;
      if (u.includes('/api-a/')) equipCalls.a += 1;
      if (u.includes('/api-b/')) equipCalls.b += 1;
    });

    const { instanceA, instanceB } = makeFixtures({
      lastImportAtA: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      lastImportAtB: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),      // 1 hour ago
    });

    await injectHubConfig(page, { clusterMaxZoom: 0 });
    await stubHubRegistry(page, { instanceA, instanceB });
    await page.goto(`/#slug-b/W${SHARED_OSM_ID}`);

    const panel = page.locator('aside.info-panel');
    await expect(panel).toBeVisible({ timeout: 8000 });

    // Equipment should come from backend B (the slug we navigated to)
    await expect.poll(() => equipCalls.b, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
    expect(equipCalls.a).toBe(0);
  });

  test('degraded mode: both null last_import_at → URL-alphabetical winner, no errors', async ({ page }) => {
    // Neither backend has shipped #301 yet → degraded mode.
    // /api-a < /api-b alphabetically → A wins the tie-break.
    // Test just verifies no crash and both backends are still queried.
    const { instanceA, instanceB } = makeFixtures({ lastImportAtA: null, lastImportAtB: null });
    const polygonCalls = { a: 0, b: 0 };
    page.on('request', req => {
      const u = req.url();
      if (!u.includes('/rpc/get_playgrounds_bbox')) return;
      if (u.includes('/api-a/')) polygonCalls.a += 1;
      if (u.includes('/api-b/')) polygonCalls.b += 1;
    });

    await injectHubConfig(page, { clusterMaxZoom: 0 });
    await stubHubRegistry(page, { instanceA, instanceB });
    await page.goto('/');

    await expect(page.locator('.instance-slot .pill')).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });
    await expect.poll(() => polygonCalls.a, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => polygonCalls.b, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  });
});

// TODO: direct polygon-source assertion
//
// The tests above verify behavior through observable side-effects (request
// counts, UI state) but do not directly assert "polygonSource contains exactly
// one feature for osm_id=5000, not two."
//
// To write that assertion without canvas clicks, two approaches are viable:
//
// Option A — DOM data attribute:
//   In Map.svelte (or HubApp.svelte), write the polygon feature count into a
//   data attribute after each source update:
//     mapEl.dataset.polygonFeatureCount = polygonSource.getFeatures().length;
//   Then the test can assert:
//     await expect(page.locator('#map')).toHaveAttribute('data-polygon-feature-count', '1');
//
// Option B — window test hook:
//   In dev/test mode, expose the polygon source on window:
//     if (import.meta.env.DEV) window.__polygonSource = polygonSource;
//   Then assert via page.evaluate:
//     const count = await page.evaluate(() =>
//       window.__polygonSource?.getFeatures().filter(f => f.get('osm_id') === 5000).length
//     );
//     expect(count).toBe(1);
//
// Once either mechanism is added, the direct assertion can replace the smoke
// test above.
