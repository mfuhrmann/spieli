<script>
  // Country-level macro view (P2 §5).
  //
  // Subscribes to the backends store and rebuilds one Point feature per
  // backend at the backend's bbox centroid, with ring properties
  // (count + completeness) sourced from each backend's cached `get_meta`
  // response. The resulting features live in `source` and are styled by
  // `macroRingStyleFn` (registered on `macroLayer` in Map.svelte).
  //
  // The orchestrator is what *decides* whether the macro layer is visible —
  // this component just keeps the source contents in sync so a tier toggle
  // shows the latest data without a fetch round-trip. Cost: one O(N)
  // rebuild per backends-store update (poll every 5 min + initial load).
  //
  // Pre-P1 backends ship `get_meta` without the `complete/partial/missing`
  // extension. Their entries arrive with `completeness: null`; we render
  // those as a flat gray ring (everything in the "restricted" segment) so
  // the operator sees "data quality unknown" rather than a misleading
  // healthy-but-empty zero ring.
  //
  // Offline backends are flagged on the feature; the renderer branches to a
  // dashed outline + "offline" label. Health currently comes from the
  // federationHealth stub (always healthy) — the same wiring applies once
  // `add-federation-health-exposition` lands the real signal.

  import { onDestroy } from 'svelte';
  import Feature from 'ol/Feature.js';
  import Point from 'ol/geom/Point.js';
  import { transform } from 'ol/proj.js';
  import { bboxCentroid } from './centroid.js';
  import { deriveMacroRing } from './macroAggregate.js';

  /** @type {import('svelte/store').Readable<Array>} */
  export let backends;
  /** @type {import('ol/source/Vector.js').default} */
  export let source;
  /**
   * Per-backend filtered aggregate store (hubOrchestrator → macroFiltered.js).
   * `null` when no filter is active (use cached meta); otherwise a
   * `Map<backendUrl, {count, complete, partial, missing}>`.
   * @type {import('svelte/store').Readable<Map|null>}
   */
  export let macroFiltered;
  /**
   * Macro filter coverage store (hubOrchestrator → macroCoverage.js). `null`
   * when no filter is active; otherwise `{ answered, total, cantFilter[] }`.
   * Used to flag backends that couldn't apply the filter (#688).
   * @type {import('svelte/store').Readable<{answered:number,total:number,cantFilter:string[]}|null>}
   */
  export let macroCoverage;

  // Latest value of each store, mirrored so buildFeature (called from the
  // rebuild below) reads them all without a closure-captured snapshot.
  let backendsValue = [];
  let filteredValue = null;
  let coverageValue = null;

  function buildFeature(backend) {
    const centroid = bboxCentroid(backend.bbox) ?? backend.nominalCentroid ?? null;
    if (!centroid) return null;
    // When a filter is active and this backend has settled a filtered total,
    // it overrides the cached-meta count + completeness so the ring reflects
    // the filtered subset. No entry (not yet settled, or a pre-tier peer that
    // 404s on the cluster RPC) falls back to cached meta unchanged. The count,
    // completeness segments, and state flags are derived in `macroAggregate.js`.
    const filtered = filteredValue ? filteredValue.get(backend.url) : null;
    const r = deriveMacroRing(backend, filtered);
    // A backend the orchestrator couldn't filter (no bbox / 404) keeps its
    // unfiltered ring but is flagged so the renderer marks it "unfiltered".
    const cantFilter = coverageValue ? coverageValue.cantFilter.includes(backend.url) : false;
    return new Feature({
      geometry: new Point(transform(centroid, 'EPSG:4326', 'EPSG:3857')),
      _tier:          'macro',
      _backendUrl:    backend.url,
      _backendSlug:   backend.slug ?? null,
      _bbox:          backend.bbox,
      _offline:       r.offline,
      _importing:     r.importing,
      _degraded:      r.degraded,
      _filteredEmpty: r.filteredEmpty,
      _cantFilter:    cantFilter,
      _name:          backend.name ?? backend.region ?? backend.slug ?? backend.url,
      count:          r.count,
      complete:       r.complete,
      partial:        r.partial,
      missing:        r.missing,
      restricted:     r.restricted,
    });
  }

  // Rebuild on every store update. Backends typically change shape twice
  // per session (initial load + 5-min poll) and number <20, so a full
  // clear+addFeatures is well below any perceptible cost. The filtered store
  // additionally fires once per backend as filtered totals settle.
  function rebuild() {
    if (!source) return;
    const features = backendsValue
      .map(buildFeature)
      .filter(Boolean);
    source.clear();
    source.addFeatures(features);
  }

  const detachBackends = backends.subscribe(($backends) => {
    backendsValue = $backends;
    rebuild();
  });
  const detachFiltered = macroFiltered.subscribe(($filtered) => {
    filteredValue = $filtered;
    rebuild();
  });
  const detachCoverage = macroCoverage.subscribe(($coverage) => {
    coverageValue = $coverage;
    rebuild();
  });

  onDestroy(() => {
    detachBackends();
    detachFiltered();
    detachCoverage();
    if (source) source.clear();
  });
</script>
