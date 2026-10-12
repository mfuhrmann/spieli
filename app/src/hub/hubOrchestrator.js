// Hub-mode tiered orchestrator (P2 §3).
//
// Mirrors the standalone tieredOrchestrator but fans every per-tier fetch
// out across the registry's backends, filtered by viewport (bboxRouter) and
// federation health (federationHealth — currently stubbed).
//
// Three tiers:
//   zoom ≤ macroMaxZoom              → 'macro'   — no fetches; the macro
//                                                  view component renders
//                                                  one ring per backend
//                                                  from the cached
//                                                  backendsStore.
//   macroMaxZoom < zoom ≤ clusterMaxZoom → 'cluster' — fanOut over
//                                                  fetchPlaygroundClusters
//   zoom > clusterMaxZoom            → 'polygon' — fanOut over
//                                                  fetchPlaygroundsBbox
//
// Per-fan-out AbortController is replaced (and the previous one aborted)
// on every moveend, so superseded fan-outs cancel their in-flight per-
// backend requests via the fanOut's plumbing.
//
// Cluster and polygon sources are progressively repainted as each backend
// settles (via fanOut's onResult callback). Cluster buckets from all
// backends are merged where their markers would overlap
// (lib/clusterMerge.js), so borders between backends show no seams.

import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { transform, transformExtent } from 'ol/proj.js';
import { mergeOverlappingBuckets } from '../lib/clusterMerge.js';

import {
  fetchPlaygroundClusters,
  fetchPlaygroundsBbox,
  fetchPlaygrounds,
} from '../lib/api.js';
import { clusterMaxZoom, macroMaxZoom } from '../lib/config.js';
import { activeTierStore } from '../stores/tier.js';
import { hubLoadingStore } from '../stores/hubLoading.js';
import { macroFilteredStore } from '../stores/macroFiltered.js';
import { macroCoverageStore } from '../stores/macroCoverage.js';
import { hasActiveFilters } from '../stores/filters.js';
import { selectBackends } from './bboxRouter.js';
import { filterHealthy } from './federationHealth.js';
import { applyDedup } from './osmIdDedup.js';
import { sumClusterBuckets } from './macroAggregate.js';
import { fanOut } from './fanOut.js';
import { debounce } from '../lib/utils.js';

const geojsonFormat = new GeoJSON();

export function tierForZoom(zoom) {
  if (zoom <= macroMaxZoom)   return 'macro';
  if (zoom <= clusterMaxZoom) return 'cluster';
  return 'polygon';
}

/**
 * Wire the hub orchestrator to a map + the registry's backends store.
 *
 * @param {Object} opts
 * @param {import('ol/Map.js').default} opts.map
 * @param {import('svelte/store').Readable<Array>} opts.backendsStore
 * @param {import('ol/source/Vector.js').default} opts.clusterSource
 * @param {import('ol/source/Vector.js').default} opts.polygonSource
 * @param {() => object|null} [opts.getFilters]  Returns current cluster-relevant filter snapshot.
 * @returns {{ detach: () => void, rerun: () => void }}
 */
export function attachHubOrchestrator({
  map,
  backendsStore,
  clusterSource,
  polygonSource,
  getFilters = () => null,
}) {
  let abort = null;
  let allBackends = [];
  // Sticky per-backend legacy fallback. When a backend's tier RPC 404s once,
  // every subsequent fan-out for that backend uses fetchPlaygrounds (region-
  // scoped, P1 deprecated) instead, with a one-time warning. Keeps the hub
  // serviceable when one peer is on a pre-tier release.
  const backendUseLegacy = new Set();
  const backendLegacyWarned = new Set();
  // Per-backend "malformed cluster bucket" warning de-dup. A backend returning
  // a bucket with non-finite lon/lat would otherwise place a feature at
  // [NaN, NaN] (projects to ~0,0); we drop
  // those buckets and warn at most once per backend per session.
  const backendMalformedBucketWarned = new Set();
  // The debounced orchestrator is referenced from the backends-subscribe
  // callback below as well as the moveend handler below. Declare early so
  // both references resolve out of TDZ regardless of how Svelte schedules
  // the synchronous subscribe firings — see the §5 review for the original
  // crash this avoids.
  const debounced = debounce(orchestrate, 300);

  // Skip the very first subscribe-firing — the synchronous initial value is
  // the registry's empty bootstrap, and the first real load triggers the
  // immediate `orchestrate()` call at the bottom of this function. After
  // that, subsequent emissions (5-min poll, bbox refresh, backend
  // add/remove) need to re-render the active tier against the new set.
  let initialBackendsSet = false;
  const detachStore = backendsStore.subscribe(b => {
    allBackends = b;
    if (!initialBackendsSet) {
      initialBackendsSet = true;
      return;
    }
    // Backends changed (registry poll or registry mutation) — re-orchestrate
    // on the same debounce as moveend so a flurry of poll-driven updates
    // collapses to one fan-out.
    debounced();
  });

  function clearSourcesAndProgress() {
    polygonSource.clear();
    clusterSource.clear();
    hubLoadingStore.set({ loaded: 0, total: 0, settling: false });
  }

  async function orchestrate() {
    const view = map.getView();
    const zoom = view.getZoom();
    // OL `getZoom()` returns `undefined` when the view's resolution doesn't
    // map to an integer zoom (boot, mid-animation, fractional resolution).
    // `tierForZoom(undefined)` would fall through every `<=` to `'polygon'`,
    // dispatching a continent-wide bbox fan-out at boot. Skip until the
    // next moveend brings a finite zoom.
    if (!Number.isFinite(zoom)) return;
    const tier = tierForZoom(zoom);
    activeTierStore.set(tier);

    if (abort) abort.abort();
    abort = new AbortController();
    const signal = abort.signal;

    if (tier === 'macro') {
      // The MacroView component (P2 §5) renders directly from
      // backendsStore. Clear feature sources so old cluster / polygon
      // features from a previous higher zoom don't bleed through.
      clearSourcesAndProgress();
      await orchestrateMacroFilter(signal);
      return;
    }

    const extent3857 = view.calculateExtent(map.getSize());
    const viewportBbox = transformExtent(extent3857, 'EPSG:3857', 'EPSG:4326');
    const filters = getFilters();
    const selected = filterHealthy(selectBackends(viewportBbox, allBackends));

    if (selected.length === 0) {
      clearSourcesAndProgress();
      return;
    }

    hubLoadingStore.set({ loaded: 0, total: selected.length, settling: true });

    // Per-backend lookup map; the polygon onResult needs the backend's slug
    // so it can stamp `_backendSlug` on each feature. O(1) per arrival.
    const backendByUrl = new Map(selected.map(b => [b.url, b]));

    // First-arrival latch per source — clears stale features from the prior
    // tier on the *first* backend's response, then onResult adds features
    // incrementally. Avoids N source.clear()+addFeatures cycles per moveend.
    // Polygon tier still uses a first-arrival latch (it appends rather than
    // re-derives on every arrival). Cluster tier doesn't need one — every
    // arrival re-runs the merge and clears+adds the full re-rendered set,
    // so a separate latch would be dead.
    let polygonFirstArrival = true;
    // Per-orchestrate-call dedup index: osm_id (string) → winning OL Feature.
    // Created fresh per orchestrate() call so winners from the previous
    // moveend don't influence the new fan-out — no explicit .clear() needed
    // on first arrival because the const above is already the empty Map.
    const polyByOsmId = new Map();

    if (tier === 'cluster') {
      const z = Math.floor(zoom);
      // §4.1 — cross-backend re-clustering. Each backend's server buckets
      // are merged where their markers would overlap at the current
      // resolution — the same rule as standalone (#941, lib/clusterMerge.js) —
      // so a viewport spanning two backends shows one disc per place instead
      // of two overlapping at the border, and neighbouring grid cells of one
      // backend do not touch either.
      const accumulated = [];
      const resolution = view.getResolution();
      await fanOut({
        fetcher: (url, sig) => clusterFetcherFor(url)(z, extent3857, url, sig, filters),
        backends: selected,
        signal,
        onResult: (entry) => {
          if (signal.aborted) return;
          if (entry.ok && Array.isArray(entry.value)) {
            let droppedMalformed = 0;
            for (const b of entry.value) {
              // Drop buckets with non-finite coordinates rather than
              // pushing a `[NaN, NaN]` Point that projects to lon=0,lat=0
              // (Gulf of Guinea). Warn at most once per backend per
              // session.
              if (!Number.isFinite(b.lon) || !Number.isFinite(b.lat)) {
                droppedMalformed += 1;
                continue;
              }
              accumulated.push(bucketToPoint(b, entry.backendUrl));
            }
            if (droppedMalformed > 0 && !backendMalformedBucketWarned.has(entry.backendUrl)) {
              backendMalformedBucketWarned.add(entry.backendUrl);
              console.warn(`[hub-tier] backend ${entry.backendUrl} returned ${droppedMalformed} cluster bucket(s) with non-finite lon/lat — dropped`);
            }
            // Re-merge the accumulated set and re-render. O(n) per pass over
            // a viewport's buckets; the source-clear here also wipes stale
            // features from the prior tier on the first arrival, so no
            // separate latch is needed on this branch.
            const merged = mergeOverlappingBuckets(accumulated, resolution);
            clusterSource.clear();
            clusterSource.addFeatures(merged.map(bucketToOlFeature));
          } else if (!entry.ok && isNotFound(entry.error)) {
            markBackendLegacy(entry.backendUrl);
          }
          hubLoadingStore.update(s => ({ ...s, loaded: s.loaded + 1 }));
        },
      });
      if (!signal.aborted) {
        hubLoadingStore.update(s => ({ ...s, settling: false }));
      }
    } else {
      // polygon tier
      await fanOut({
        fetcher: (url, sig) => polygonFetcherFor(url)(extent3857, url, sig),
        backends: selected,
        signal,
        onResult: (entry) => {
          if (signal.aborted) return;
          // Clear the source on the *first* arrival regardless of `ok` so
          // an all-error fan-out doesn't leave ghost polygons from the
          // previous viewport. The latch fires exactly once per
          // orchestrate() call; subsequent arrivals append.
          if (polygonFirstArrival) {
            polygonFirstArrival = false;
            polygonSource.clear();
            // polyByOsmId is already empty (declared `new Map()` per orchestrate()
            // call) — no .clear() needed.
          }
          if (entry.ok) {
            const backend = backendByUrl.get(entry.backendUrl);
            const features = parsePolygonFeatures(entry.value, entry.backendUrl, backend);
            const { toAdd, toRemove } = applyDedup(features, polyByOsmId);
            polygonSource.removeFeatures(toRemove);
            polygonSource.addFeatures(toAdd);
          } else if (isNotFound(entry.error)) {
            markBackendLegacy(entry.backendUrl);
          }
          hubLoadingStore.update(s => ({ ...s, loaded: s.loaded + 1 }));
        },
      });
      if (!signal.aborted) {
        hubLoadingStore.update(s => ({ ...s, settling: false }));
      }
    }
  }

  // Macro-tier filter aggregation. The macro tier is normally zero-fetch —
  // MacroView renders one ring per backend straight from the cached
  // `get_meta` totals. When a filter is active those cached totals are
  // wrong (they ignore the filter), so we derive a filtered total per
  // backend from the filter-aware cluster RPC: fetch each backend's buckets
  // over its own bbox and sum them. Bucket totals partition a backend's
  // region at any zoom, so the sum is zoom-invariant — we query at
  // `macroMaxZoom` (the coarsest tier) to minimise bucket payload, since the
  // per-cell detail is discarded by the sum. Results are published progressively
  // on `macroFilteredStore`; MacroView overrides each ring as its entry
  // settles. A pre-tier peer that 404s keeps its cached-meta ring.
  async function orchestrateMacroFilter(signal) {
    const filters = getFilters();
    if (!filters || !hasActiveFilters(filters)) {
      macroFilteredStore.set(null);
      macroCoverageStore.set(null);
      return;
    }

    // Macro viewport is global, so every healthy backend is in scope (offline
    // peers carry their own offline ring and are excluded from coverage). A
    // backend can only be filtered if it has a bbox and hasn't 404'd the
    // cluster RPC; the rest are "can't filter" — they keep a distinct ring and
    // count against coverage, so the country view never reads as fully filtered
    // when it isn't (#688).
    const inScope = filterHealthy(allBackends);
    const total = inScope.length;
    const selectedUrls = new Set(
      inScope.filter(b => Array.isArray(b.bbox) && !backendUseLegacy.has(b.url)).map(b => b.url),
    );
    const selected   = inScope.filter(b => selectedUrls.has(b.url));
    const cantFilter = new Set(inScope.filter(b => !selectedUrls.has(b.url)).map(b => b.url));

    const acc = new Map();
    // `settling` is true while the fan-out is still in flight. The coverage
    // banner waits for `settling === false` before disclosing partial coverage
    // so it doesn't flash "covers 0 of N" during a normal load (where every
    // backend eventually answers); the per-ring `cantFilter` flag and the
    // progressive `macroFilteredStore` updates do not wait on it.
    const publishCoverage = (settling) =>
      macroCoverageStore.set({ answered: acc.size, total, cantFilter: [...cantFilter], settling });

    macroFilteredStore.set(new Map());
    if (selected.length === 0) {
      publishCoverage(false); // terminal: every in-scope backend can't filter
      return;
    }
    publishCoverage(true);

    await fanOut({
      fetcher: (url, sig) => {
        const backend = selected.find(b => b.url === url);
        const extent3857 = transformExtent(backend.bbox, 'EPSG:4326', 'EPSG:3857');
        return fetchPlaygroundClusters(macroMaxZoom, extent3857, url, sig, filters);
      },
      backends: selected,
      signal,
      onResult: (entry) => {
        if (signal.aborted) return;
        if (entry.ok && Array.isArray(entry.value)) {
          acc.set(entry.backendUrl, sumClusterBuckets(entry.value));
          // Fresh Map reference per publish so Svelte subscribers re-render.
          macroFilteredStore.set(new Map(acc));
        } else {
          // Any failure (404, 500, network, timeout) means this backend
          // couldn't apply the filter → flag it can't-filter so its ring is
          // marked "unfiltered" rather than silently shown as a normal filtered
          // ring. Only a 404 makes the legacy fallback sticky for the session.
          if (!entry.ok && isNotFound(entry.error)) markBackendLegacy(entry.backendUrl);
          cantFilter.add(entry.backendUrl);
        }
        publishCoverage(true);
      },
    });

    // Fan-out done: republish settled so the banner can disclose any genuine
    // partial coverage. Skip if a newer orchestrate() aborted us — its own
    // run owns the store now.
    if (!signal.aborted) publishCoverage(false);
  }

  // Pick the per-backend cluster fetcher. If we've previously seen a 404
  // from this backend's tier RPC, return [] without dispatching any fetch
  // — the legacy `get_playgrounds(relation_id)` RPC doesn't bucket, and
  // downloading every polygon in the region just to discard them at the
  // cluster tier wastes bandwidth without any visible benefit. The user
  // sees a temporary hole over that backend until they zoom past
  // `clusterMaxZoom`, where the polygon tier will use the legacy fetch.
  function clusterFetcherFor(url) {
    if (backendUseLegacy.has(url)) {
      return async () => [];
    }
    return fetchPlaygroundClusters;
  }

  function polygonFetcherFor(url) {
    if (backendUseLegacy.has(url)) {
      return async (_extent, baseUrl, signal) => {
        return fetchPlaygrounds(baseUrl, signal);
      };
    }
    return fetchPlaygroundsBbox;
  }

  function markBackendLegacy(url) {
    backendUseLegacy.add(url);
    if (!backendLegacyWarned.has(url)) {
      backendLegacyWarned.add(url);
      console.warn(`[hub-tier] backend ${url} returned 404 on a tier RPC — falling back to legacy get_playgrounds for the rest of the session`);
    }
  }

  map.on('moveend', debounced);
  // Initial dispatch runs immediately (not debounced) so first paint
  // doesn't wait on a moveend.
  orchestrate();

  return {
    detach() {
      debounced.cancel?.();
      if (abort) abort.abort();
      map.un('moveend', debounced);
      detachStore();
    },
    rerun() {
      orchestrate();
    },
  };
}

// Matches the exact format thrown by api.js fetchers: `<rpc> failed: 404`.
// Anchored on the trailing `failed: 404` so a transient error whose message
// happens to mention "404" elsewhere (URL fragment, payload echo) cannot
// permanently degrade a backend to the legacy fallback for the rest of the
// session.
function isNotFound(err) {
  return typeof err?.message === 'string' && /failed: 404$/.test(err.message);
}

// A server cluster bucket as a merge input in EPSG:3857. All count fields are
// coerced to 0 if missing — the merge sums them, and a single `undefined`
// would propagate `NaN` through every merged count silently. `_backendUrl`
// is kept so a bucket that merges with nothing still carries its backend.
function bucketToPoint(b, backendUrl) {
  const [x, y] = transform([b.lon, b.lat], 'EPSG:4326', 'EPSG:3857');
  return {
    x, y,
    count:       b.count      ?? 0,
    complete:    b.complete   ?? 0,
    partial:     b.partial    ?? 0,
    missing:     b.missing    ?? 0,
    _backendUrl: backendUrl,
  };
}

// A merged bucket as an OL Feature with the props the cluster renderers
// read. `_backendUrl` survives only when every member came from one backend.
function bucketToOlFeature(b) {
  const f = new Feature({ geometry: new Point([b.x, b.y]) });
  f.setProperties({
    _tier:       'cluster',
    count:       b.count,
    complete:    b.complete,
    partial:     b.partial,
    missing:     b.missing,
    ...(b._backendUrl ? { _backendUrl: b._backendUrl } : {}),
  });
  return f;
}

function parsePolygonFeatures(geojson, backendUrl, backend) {
  // Legacy fetchPlaygrounds also returns a FeatureCollection — same
  // parsing path works for both bbox-scoped and legacy responses.
  if (!geojson || !geojson.features) return [];
  const features = geojsonFormat.readFeatures(geojson, {
    dataProjection:    'EPSG:4326',
    featureProjection: 'EPSG:3857',
  });
  features.forEach(f => {
    f.set('_backendUrl', backendUrl);
    f.set('_lastImportAt', backend?.lastImportAt ?? null);
    if (backend?.slug) f.set('_backendSlug', backend.slug);
    if (backend?.name) f.set('_backendName', backend.name);
  });
  return features;
}
