// Hub registry — loads the registry JSON, fetches playgrounds from each
// backend in parallel, populates a shared OL VectorSource, and periodically
// refreshes. Exposes derived stores and a multi-backend nearest fetcher.

import { readable, writable, derived } from 'svelte/store';
import GeoJSON from 'ol/format/GeoJSON.js';
import { registryUrl, hubPollInterval } from '../lib/config.js';
import { fetchMeta } from '../lib/api.js';
import { isValidSlug } from '../lib/deeplink.js';

const geojsonFormat = new GeoJSON();

// Per-backend timeout for multi-backend nearest fan-out. A slow or unreachable
// backend contributes zero results but never stalls the user interaction.
const NEAREST_TIMEOUT_MS = 3000;
const NEAREST_DEFAULT_LIMIT = 10;

/**
 * Backend status shape:
 * {
 *   url: string,
 *   name: string,
 *   slug: string | null,
 *   loading: boolean,
 *   error: string | null,
 *   featureCount: number,
 *   version: string | null,
 *   region: string | null,
 *   bbox: [minLon, minLat, maxLon, maxLat] | null,
 * }
 */

/**
 * Creates a registry that loads backend status into a Svelte readable store
 * and populates `vectorSource` with playground features (tagged with
 * `_backendUrl` and, when present, `_backendSlug`).
 *
 * @param {import('ol/source/Vector.js').default} vectorSource
 * @returns {{
 *   backends: import('svelte/store').Readable<Array>,
 *   registryError: import('svelte/store').Readable<string|null>,
 *   aggregatedBbox: import('svelte/store').Readable<number[]|null>,
 *   fetchNearestAcrossBackends: (lat: number, lon: number, limit?: number) => Promise<Array>,
 * }}
 */
export function createRegistry(vectorSource) {
  let backends = [];
  let pollTimer = null;
  const registryError = writable(null);

  const store = readable([], (set) => {
    function notify() {
      set([...backends]);
    }

    async function loadBackend(backend) {
      backend.loading = true;
      backend.error = null;
      notify();

      try {
        const [meta, geojson] = await Promise.all([
          fetchMeta(backend.url).catch(() => null),
          fetchPlaygroundsHub(backend.url),
        ]);

        if (meta) {
          backend.version = meta.version ?? null;
          backend.region  = meta.name    ?? null;
          backend.bbox    = Array.isArray(meta.bbox) && meta.bbox.length === 4 ? meta.bbox : null;
          if (!backend.name && backend.region) backend.name = backend.region;
        }

        // Parse first — only touch the map if parsing succeeds
        const features = geojsonFormat.readFeatures(geojson, {
          dataProjection:    'EPSG:4326',
          featureProjection: 'EPSG:3857',
        });
        features.forEach(f => {
          f.set('_backendUrl', backend.url);
          if (backend.slug) f.set('_backendSlug', backend.slug);
        });

        // Atomic swap: remove stale then add new in the same JS turn
        const stale = vectorSource.getFeatures().filter(f => f.get('_backendUrl') === backend.url);
        if (stale.length) vectorSource.removeFeatures(stale);
        vectorSource.addFeatures(features);

        backend.featureCount = features.length;
        backend.loading      = false;
      } catch (err) {
        backend.error   = err.message;
        backend.loading = false;
      }

      notify();
    }

    async function loadAll() {
      try {
        const res = await fetch(registryUrl);
        if (!res.ok) throw new Error(`Registry fetch failed: ${res.status}`);
        const data = await res.json();

        registryError.set(null);

        // Support both { instances: [...] } and bare array formats
        const entries = Array.isArray(data) ? data : (data.instances ?? []);
        backends = entries.map(entry => ({
          url:          entry.url,
          name:         entry.name || entry.url,
          slug:         normaliseSlug(entry.slug, entry.url),
          loading:      true,
          error:        null,
          featureCount: 0,
          version:      null,
          region:       null,
          bbox:         null,
        }));
        notify();

        await Promise.all(backends.map(b => loadBackend(b)));
      } catch (err) {
        console.error('[registry] load failed:', err);
        registryError.set(err.message);
      }

      schedulePoll();
    }

    function schedulePoll() {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = setTimeout(async () => {
        // Re-fetch each backend (registry list stays fixed between page loads)
        await Promise.all(backends.map(b => loadBackend(b)));
        schedulePoll();
      }, hubPollInterval * 1000);
    }

    loadAll();

    return () => {
      if (pollTimer) clearTimeout(pollTimer);
    };
  });

  // Union of all reported backend bboxes. Null until at least one backend has
  // reported; updates reactively as `backends` changes. Backends without a
  // reachable `get_meta` (bbox === null) are ignored.
  const aggregatedBbox = derived(store, ($backends) => {
    const withBbox = $backends.filter(b => b.bbox);
    if (withBbox.length === 0) return null;
    return withBbox.reduce((acc, b) => {
      const [minLon, minLat, maxLon, maxLat] = b.bbox;
      return [
        Math.min(acc[0], minLon),
        Math.min(acc[1], minLat),
        Math.max(acc[2], maxLon),
        Math.max(acc[3], maxLat),
      ];
    }, [Infinity, Infinity, -Infinity, -Infinity]);
  });

  // Multi-backend nearest-playground search.
  //
  // Fires `get_nearest_playgrounds` against every registered backend in
  // parallel with a per-backend AbortController timeout. Slow or failing
  // backends contribute zero results but never block the response.
  async function fetchNearestAcrossBackends(lat, lon, limit = NEAREST_DEFAULT_LIMIT) {
    const results = await Promise.all(
      backends.map(b => fetchNearestOne(b, lat, lon).catch(() => []))
    );

    // Flatten, dedupe by osm_id (keeping the closest), sort, truncate.
    const byOsmId = new Map();
    for (const items of results) {
      for (const item of items) {
        const existing = byOsmId.get(item.osm_id);
        if (!existing || item.distance_m < existing.distance_m) {
          byOsmId.set(item.osm_id, item);
        }
      }
    }
    return [...byOsmId.values()]
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, limit);
  }

  return {
    backends:                   store,
    registryError,
    aggregatedBbox,
    fetchNearestAcrossBackends,
  };
}

/** Normalises a slug value from the registry. Invalid slugs log a warning
 *  and are treated as missing, so the rest of the registry entry still works. */
function normaliseSlug(raw, url) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (isValidSlug(raw)) return raw;
  console.warn(`[registry] invalid slug "${raw}" on backend ${url} — treating as missing`);
  return null;
}

/** Fetches all playgrounds from a backend without passing a relation_id —
 *  the backend uses its own configured default. */
async function fetchPlaygroundsHub(baseUrl) {
  const res = await fetch(`${baseUrl}/rpc/get_playgrounds`);
  if (res.ok) return res.json();
  throw new Error(`get_playgrounds failed: ${res.status}`);
}

/** Per-backend nearest-playgrounds call with a timeout. Returns [] on any
 *  error, timeout, or non-OK response so a single bad backend never blocks
 *  the merged result. Attaches `_backendUrl` / `_backendSlug` to each item
 *  for downstream feature lookup + deep-link writing. */
async function fetchNearestOne(backend, lat, lon) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NEAREST_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({ lat, lon });
    const res = await fetch(
      `${backend.url}/rpc/get_nearest_playgrounds?${params}`,
      { signal: controller.signal }
    );
    if (!res.ok) return [];
    const items = await res.json();
    return items.map(item => ({
      ...item,
      _backendUrl:  backend.url,
      _backendSlug: backend.slug ?? null,
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
