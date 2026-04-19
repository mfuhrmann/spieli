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

/**
 * Inject a runtime config in hub mode. Uses relative backend URLs so tests
 * can dispatch requests by path prefix.
 */
export async function injectHubConfig(page, overrides = {}) {
  await page.route('**/config.js', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.APP_CONFIG = ${JSON.stringify({
        appMode: 'hub',
        osmRelationId: 0,
        mapZoom: 8,
        mapMinZoom: 6,
        poiRadiusM: 5000,
        apiBaseUrl: '',
        parentOrigin: '',
        registryUrl: '/registry.json',
        hubPollInterval: 300,
        ...overrides,
      })};`,
    })
  );
}

/**
 * Stub a two-backend hub registry. Each backend carries its own playgrounds
 * fixture and metadata so tests can assert slug-scoped selection.
 *
 * `instanceA.url` / `instanceB.url` must be distinct path prefixes used by the
 * app to fetch each backend's RPCs (e.g. `/api-a`, `/api-b`).
 */
export async function stubHubRegistry(page, { instanceA, instanceB }) {
  await page.route('**/registry.json', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        instances: [
          { slug: instanceA.slug, url: instanceA.url, name: instanceA.name },
          { slug: instanceB.slug, url: instanceB.url, name: instanceB.name },
        ],
      }),
    })
  );

  function dispatch(route, perBackend) {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.startsWith(instanceA.url)) return route.fulfill(perBackend(instanceA));
    if (path.startsWith(instanceB.url)) return route.fulfill(perBackend(instanceB));
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  }

  await page.route('**/rpc/get_playgrounds**', route =>
    dispatch(route, (b) => ({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(b.playgrounds),
    }))
  );
  await page.route('**/rpc/get_meta**', route =>
    dispatch(route, (b) => ({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(b.meta ?? null),
    }))
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
  await page.route('**/rpc/get_nearest_playgrounds**', route =>
    dispatch(route, (b) => ({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(b.nearest ?? []),
    }))
  );
}

/** Builds a minimal valid playground GeoJSON fixture. */
export function makePlayground({ osmId, name, lon = 13.404, lat = 52.520 }) {
  const d = 0.001;
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [lon, lat],
        [lon + d, lat],
        [lon + d, lat + d],
        [lon, lat + d],
        [lon, lat],
      ]],
    },
    properties: {
      osm_id: osmId,
      osm_type: 'W',
      name,
      surface: 'sand',
      access: 'yes',
      area: 450,
    },
  };
}
