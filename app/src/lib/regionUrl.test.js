import assert from 'node:assert/strict';
import { resolveRegionFromPath, isRegionPath, shouldAutoCenterOnLocate } from './regionUrl.js';

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

// --- proximity disambiguation via opts.near ---

// 12b. Same-named relations are disambiguated by nearest bbox centroid to `near`.
//      Mirrors /Lauterbach on a Fulda instance: the Czech hit has the highest
//      importance and comes first, but Hessen is nearer and must win.
{
  const lauterbachCzech = {
    osm_type: 'relation', osm_id: 436702, class: 'boundary',
    display_name: 'Lauterbach, Bezirk Zwittau, Tschechien',
    boundingbox: ['49.65', '49.72', '16.55', '16.65'], // centroid ~ (16.6, 49.69)
  };
  const lauterbachHessen = {
    osm_type: 'relation', osm_id: 418333, class: 'boundary',
    display_name: 'Lauterbach (Hessen), Vogelsbergkreis, Hessen',
    boundingbox: ['50.60', '50.68', '9.34', '9.45'], // centroid ~ (9.40, 50.64)
  };
  // Czech first (higher importance) — without `near` it would win.
  stubResults([lauterbachCzech, lauterbachHessen]);
  const noNear = await resolveRegionFromPath('/lauterbach');
  assert.equal(noNear.osmId, 436702, 'without near, importance order wins');

  // Fulda centre ~ (9.65, 50.55) — Hessen is far nearer than Czechia.
  stubResults([lauterbachCzech, lauterbachHessen]);
  const nearFulda = await resolveRegionFromPath('/lauterbach', { near: [9.65, 50.55] });
  assert.equal(nearFulda.osmId, 418333, 'with near, nearest centroid wins');
  assert.equal(nearFulda.name, 'Lauterbach (Hessen)');
}

// 12c. A malformed `near` is ignored — falls back to importance ordering.
{
  stubResults([RELATION_FULDA]);
  const r = await resolveRegionFromPath('/fulda', { near: [NaN, 50] });
  assert.equal(r.osmId, 62700);
}

// --- isRegionPath: synchronous predicate used to gate auto-locate centering ---

// 13. Single non-reserved segment looks like a region path
{
  for (const p of ['/fulda', '/Frankfurt', '/m%C3%BCnchen', '/new-york']) {
    assert.equal(isRegionPath(p), true, `expected true for ${p}`);
  }
}

// 14. Root, empty, nullish, multi-segment, reserved, and dotted paths are not
{
  for (const p of ['/', '', null, undefined, '/legal/impressum', '/api/rpc/x',
                   '/api', '/API', '/metrics', '/config.js', '/version.json']) {
    assert.equal(isRegionPath(p), false, `expected false for ${p}`);
  }
}

// 15. Malformed percent-encoding does not throw → false
{
  assert.equal(isRegionPath('/%E0%A4%A'), false);
}

// --- shouldAutoCenterOnLocate: auto-locate centering policy ---

// 16. A deeplink hash always suppresses auto-centering, regardless of the rest.
{
  for (const regionPath of [true, false]) {
    for (const framingApplied of [true, false, null]) {
      assert.equal(
        shouldAutoCenterOnLocate({ hasDeeplink: true, regionPath, framingApplied }),
        false,
        `deeplink should suppress centering (regionPath=${regionPath}, framingApplied=${framingApplied})`
      );
    }
  }
}

// 17. No deeplink and no region path → center on GPS.
{
  for (const framingApplied of [true, false, null]) {
    assert.equal(
      shouldAutoCenterOnLocate({ hasDeeplink: false, regionPath: false, framingApplied }),
      true
    );
  }
}

// 18. Region path: suppress only when framing actually applied (true). A failed
//     (false) or still-undecided (null) framing allows GPS centering / pending.
{
  assert.equal(
    shouldAutoCenterOnLocate({ hasDeeplink: false, regionPath: true, framingApplied: true }),
    false,
    'resolved region framing suppresses centering'
  );
  assert.equal(
    shouldAutoCenterOnLocate({ hasDeeplink: false, regionPath: true, framingApplied: false }),
    true,
    'failed region framing (typo) allows GPS centering'
  );
  assert.equal(
    shouldAutoCenterOnLocate({ hasDeeplink: false, regionPath: true, framingApplied: null }),
    false,
    'undecided framing assumes pending and does not pan over it'
  );
}

console.log('All regionUrl tests passed.');
