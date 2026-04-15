// Shared test utilities for the Spielplatzkarte Svelte app.

import fixture from './fixtures/playground.json' assert { type: 'json' };

/**
 * Intercept the runtime config.js so the app uses PostgREST mode (non-empty
 * apiBaseUrl) instead of the Overpass fallback. Call before page.goto().
 */
export async function injectApiConfig(page) {
  await page.route('**/config.js', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.APP_CONFIG = ${JSON.stringify({
        appMode: 'standalone',
        osmRelationId: 62700,
        mapZoom: 12,
        mapMinZoom: 10,
        poiRadiusM: 5000,
        apiBaseUrl: '/api',
        parentOrigin: '',
        registryUrl: './registry.json',
        hubPollInterval: 300,
      })};`,
    })
  );
}

/**
 * Stub the four PostgREST endpoints used by the standalone app.
 * Call before page.goto().
 */
export async function stubApiRoutes(page, playgrounds = fixture) {
  await page.route('**/rpc/get_playgrounds**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(playgrounds) })
  );
  await page.route('**/rpc/get_equipment**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) })
  );
  await page.route('**/rpc/get_trees**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) })
  );
  await page.route('**/rpc/get_pois**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
}
