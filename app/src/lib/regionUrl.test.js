import assert from 'node:assert/strict';
import { resolveRegionFromPath } from './regionUrl.js';

// resolveRegionFromPath drives the shared Nominatim client, which calls the
// global fetch. We stub fetch per case so parsing/ranking/bbox logic is tested
// without network. `lastUrl` captures the request URL for param assertions.
let lastUrl = null;

function stubResults(results) {
  lastUrl = null;
  globalThis.fetch = async (url) => {
    lastUrl = url;
    return { ok: true, json: async () => results };
  };
}

function failIfFetched() {
  lastUrl = null;
  globalThis.fetch = async () => {
    throw new Error('fetch should not have been called');
  };
}

const RELATION_FULDA = {
  osm_type: 'relation',
  osm_id: 62700,
  class: 'boundary',
  display_name: 'Fulda, Hesse, Germany',
  boundingbox: ['50.5', '50.6', '9.6', '9.7'], // [minLat, maxLat, minLon, maxLon]
};

// --- early returns: no network ---

// 1. Root / empty / nullish paths → null, no fetch
{
  failIfFetched();
  assert.equal(await resolveRegionFromPath('/'), null);
  assert.equal(await resolveRegionFromPath(''), null);
  assert.equal(await resolveRegionFromPath(null), null);
  assert.equal(lastUrl, null);
}

// 2. Multi-segment paths (e.g. legal pages, API) → null, no fetch
{
  failIfFetched();
  assert.equal(await resolveRegionFromPath('/legal/impressum'), null);
  assert.equal(await resolveRegionFromPath('/api/rpc/get_meta'), null);
  assert.equal(lastUrl, null);
}

// 3. Reserved single-segment prefixes (case-insensitive) → null, no fetch
{
  failIfFetched();
  for (const p of ['/api', '/api2', '/legal', '/metrics', '/API', '/Legal']) {
    assert.equal(await resolveRegionFromPath(p), null, `expected null for ${p}`);
  }
  assert.equal(lastUrl, null);
}

// 4. Paths that look like static files (contain a dot) → null, no fetch
{
  failIfFetched();
  for (const p of ['/config.js', '/version.json', '/favicon.ico', '/registry.json']) {
    assert.equal(await resolveRegionFromPath(p), null, `expected null for ${p}`);
  }
  assert.equal(lastUrl, null);
}

// --- request shape ---

// 5. Query is sent with lowercase `featuretype` (camelCase is silently ignored
//    by Nominatim) and an accept-language from the shared client.
{
  stubResults([RELATION_FULDA]);
  await resolveRegionFromPath('/fulda');
  const u = new URL(lastUrl);
  assert.equal(u.searchParams.get('featuretype'), 'settlement');
  assert.equal(u.searchParams.get('q'), 'fulda');
  assert.notEqual(u.searchParams.get('accept-language'), null);
}

// 6. URL-encoded names are decoded before the lookup
{
  stubResults([RELATION_FULDA]);
  await resolveRegionFromPath('/m%C3%BCnchen');
  assert.equal(new URL(lastUrl).searchParams.get('q'), 'münchen');
}

// --- ranking ---

// 7. A boundary relation is preferred over a higher-importance non-relation hit
{
  const node = { osm_type: 'node', osm_id: 1, class: 'waterway', display_name: 'Fulda (river)', boundingbox: ['50.0', '51.0', '9.0', '10.0'] };
  stubResults([node, RELATION_FULDA]);
  const r = await resolveRegionFromPath('/fulda');
  assert.equal(r.osmId, 62700);
  assert.equal(r.name, 'Fulda');
  assert.deepEqual(r.extent, [9.6, 50.5, 9.7, 50.6]); // [minLon, minLat, maxLon, maxLat]
}

// 8. A relation without boundary/place class still beats a non-relation hit
{
  const node = { osm_type: 'node', osm_id: 1, class: 'place', display_name: 'X node', boundingbox: ['1', '2', '3', '4'] };
  const rel = { osm_type: 'relation', osm_id: 999, class: 'waterway', display_name: 'X relation', boundingbox: ['10', '20', '30', '40'] };
  stubResults([node, rel]);
  const r = await resolveRegionFromPath('/x');
  assert.equal(r.osmId, 999);
}

// --- bbox guard ---

// 9. Malformed bounding boxes (wrong length / non-numeric) → null
{
  stubResults([{ ...RELATION_FULDA, boundingbox: ['50.5', '50.6', '9.6'] }]); // length 3
  assert.equal(await resolveRegionFromPath('/fulda'), null);

  stubResults([{ ...RELATION_FULDA, boundingbox: ['50.5', 'NaN', '9.6', '9.7'] }]); // non-numeric
  assert.equal(await resolveRegionFromPath('/fulda'), null);
}

// 10. Best candidate lacking any boundingbox → null
{
  stubResults([{ osm_type: 'node', osm_id: 5, class: 'place', display_name: 'No bbox' }]);
  assert.equal(await resolveRegionFromPath('/nowhere'), null);
}

// --- failure modes ---

// 11. Empty result set → null
{
  stubResults([]);
  assert.equal(await resolveRegionFromPath('/nonexistent-village-xyz'), null);
}

// 12. Network / timeout error is swallowed → null
{
  globalThis.fetch = async () => { throw new Error('network down'); };
  assert.equal(await resolveRegionFromPath('/fulda'), null);
}

console.log('All regionUrl tests passed.');
