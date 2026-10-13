// Pitch loader for the hub's pitch layer (#947): asks every healthy backend
// whose bbox intersects the viewport — the same routing the playground tiers
// use — and tags each pitch with its backend, so selection, the pitch panel
// and the `#<slug>/P<id>` link route back to the right region.

import { get } from 'svelte/store';
import GeoJSON from 'ol/format/GeoJSON.js';
import { transformExtent } from 'ol/proj.js';
import { fetchStandaloneEquipment } from '../lib/api.js';
import { selectBackends } from './bboxRouter.js';
import { filterHealthy } from './federationHealth.js';

const geojsonFormat = new GeoJSON();

/**
 * @param {import('svelte/store').Readable<Array<{url:string, slug?:string, name?:string, bbox:number[]|null}>>} backendsStore
 * @returns {(extent3857: number[], signal: AbortSignal) => Promise<import('ol/Feature.js').default[]>}
 */
export function createHubPitchLoader(backendsStore) {
  return async (extent3857, signal) => {
    const viewport = transformExtent(extent3857, 'EPSG:3857', 'EPSG:4326');
    const selected = filterHealthy(selectBackends(viewport, get(backendsStore)));
    const settled = await Promise.allSettled(selected.map(async backend => {
      const geojson = await fetchStandaloneEquipment(extent3857, backend.url, signal);
      const features = geojsonFormat.readFeatures(geojson, {
        dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857',
      });
      for (const f of features) {
        f.set('_backendUrl', backend.url);
        if (backend.slug) f.set('_backendSlug', backend.slug);
        if (backend.name) f.set('_backendName', backend.name);
      }
      return features;
    }));
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');

    // Overlapping regions return the same pitch twice; keep the first.
    const seen = new Set();
    const out = [];
    for (const r of settled) {
      if (r.status !== 'fulfilled') continue;
      for (const f of r.value) {
        const key = `${f.get('osm_type')}${f.get('osm_id')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(f);
      }
    }
    return out;
  };
}
