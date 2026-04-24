// Tiered playground delivery — orchestrator picks the right RPC per zoom,
// and the legacy fetcher emits a one-time deprecation warning when the
// tier RPC 404s on an older backend.
//
// `injectApiConfig` defaults to `clusterMaxZoom: 0` (polygon-only) so the
// other suites stay isolated from cluster-tier orchestration. These tests
// override that to exercise the cluster path.

import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

test.describe('Tiered delivery', () => {
  test('cluster tier RPC fires when zoom ≤ clusterMaxZoom', async ({ page }) => {
    await injectApiConfig(page, { clusterMaxZoom: 13, mapZoom: 12 });
    await stubApiRoutes(page);

    const clusterReq = page.waitForRequest(/\/rpc\/get_playground_clusters/);
    await page.goto('/');
    const req = await clusterReq;
    const url = new URL(req.url());
    expect(url.searchParams.get('z')).toBe('12');
    // bbox params are present
    expect(url.searchParams.get('min_lon')).not.toBeNull();
    expect(url.searchParams.get('max_lat')).not.toBeNull();
  });

  test('polygon tier RPC fires when zoom > clusterMaxZoom', async ({ page }) => {
    await injectApiConfig(page, { clusterMaxZoom: 10, mapZoom: 14 });
    await stubApiRoutes(page);

    const bboxReq = page.waitForRequest(/\/rpc\/get_playgrounds_bbox/);
    await page.goto('/');
    await bboxReq;
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('legacy fetchPlaygrounds emits a one-time deprecation warning', async ({ page }) => {
    // Force the orchestrator into legacy fallback by 404-ing the tier RPC.
    await injectApiConfig(page, { clusterMaxZoom: 13, mapZoom: 12 });
    await page.route('**/rpc/get_playground_clusters**', route =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
    );
    await stubApiRoutes(page);

    const warnings = [];
    page.on('console', msg => {
      if (msg.type() === 'warning') warnings.push(msg.text());
    });

    await page.goto('/');
    // Give the orchestrator's debounced moveend a chance to settle and
    // the legacy fallback to log.
    await page.waitForTimeout(800);

    const deprecationLogs = warnings.filter(t =>
      t.includes('fetchPlaygrounds is deprecated')
    );
    expect(deprecationLogs.length).toBe(1);
  });
});
