// Hub registry — loads the registry JSON, fetches playgrounds from each
// backend in parallel, populates a shared OL VectorSource, and periodically
// refreshes. Returns a Svelte readable store with per-backend status objects.

import { readable, writable } from 'svelte/store';
import GeoJSON from 'ol/format/GeoJSON.js';
import { registryUrl, hubPollInterval } from '../lib/config.js';
import { fetchMeta } from '../lib/api.js';

const geojsonFormat = new GeoJSON();

/**
 * Backend status shape:
 * {
 *   url: string,
 *   name: string,
 *   loading: boolean,
 *   error: string | null,
 *   featureCount: number,
 *   version: string | null,
 *   region: string | null,
 * }
 */

/**
 * Creates a registry that loads backend status into a Svelte readable store
 * and populates `vectorSource` with playground features (tagged with `_backendUrl`).
 *
 * @param {import('ol/source/Vector.js').default} vectorSource
 * @returns {import('svelte/store').Readable<Array>}
 */
/**
 * @returns {{ backends: import('svelte/store').Readable<Array>, registryError: import('svelte/store').Readable<string|null> }}
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
          if (!backend.name && backend.region) backend.name = backend.region;
        }

        // Parse first — only touch the map if parsing succeeds
        const features = geojsonFormat.readFeatures(geojson, {
          dataProjection:    'EPSG:4326',
          featureProjection: 'EPSG:3857',
        });
        features.forEach(f => f.set('_backendUrl', backend.url));

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
          loading:      true,
          error:        null,
          featureCount: 0,
          version:      null,
          region:       null,
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

  return { backends: store, registryError };
}

/** Fetches all playgrounds from a backend without passing a relation_id —
 *  the backend uses its own configured default. */
async function fetchPlaygroundsHub(baseUrl) {
  const res = await fetch(`${baseUrl}/rpc/get_playgrounds`);
  if (res.ok) return res.json();
  throw new Error(`get_playgrounds failed: ${res.status}`);
}
