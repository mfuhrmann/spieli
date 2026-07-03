<script>
  import VectorSource from 'ol/source/Vector.js';
  import { onDestroy, onMount } from 'svelte';
  import { get, readable } from 'svelte/store';
  import { transformExtent, fromLonLat } from 'ol/proj';

  import AppShell from '../components/AppShell.svelte';
  import InstancePanel from './InstancePanel.svelte';
  import MacroView from './MacroView.svelte';
  import MacroCoverageBanner from './MacroCoverageBanner.svelte';

  import { resolveRegionFromPath, isRegionPath } from '../lib/regionUrl.js';
  import { parseHash } from '../lib/deeplink.js';
  import { regionFramingApplied } from '../stores/urlFraming.js';
  import { createRegistry } from './registry.js';
  import { attachHubOrchestrator } from './hubOrchestrator.js';
  import { mapStore } from '../stores/map.js';
  import { filterStore } from '../stores/filters.js';
  import { macroFilteredStore } from '../stores/macroFiltered.js';
  import { macroCoverageStore } from '../stores/macroCoverage.js';
  import { activeTierStore } from '../stores/tier.js';
  import { clusterMaxZoom } from '../lib/config.js';
  import { regionFitPadding } from '../lib/playgroundHelpers.js';
  import * as osmIdDedup from './osmIdDedup.js';

  // Three sources owned by the hub — the orchestrator populates cluster /
  // polygon on every moveend; MacroView (P2 §5) populates macro from
  // backend metadata (no fetch). Map.svelte toggles layer visibility from
  // activeTierStore — same pattern as the standalone two-tier design,
  // extended with the hub-only macro tier.
  const polygonSource = new VectorSource();
  const clusterSource = new VectorSource();
  const macroSource   = new VectorSource();
  let detachOrchestrator = null;

  // Test hooks. Used by the Playwright suite to make direct assertions
  // about polygon-source contents and to unit-test the pure dedup helpers.
  // The footprint is two property assignments + a few KB of bundled
  // helpers — small enough to ship unconditionally rather than gate on a
  // build-time flag. See tests/osmIdDedup.spec.js + tests/hub-osm-id-dedup.spec.js.
  // Namespaced under `__spieli` so it does not collide with anything else.
  if (typeof window !== 'undefined') {
    window.__spieli = window.__spieli ?? {};
    window.__spieli.polygonSource = polygonSource;
    window.__spieli.clusterSource = clusterSource;
    window.__spieli.macroSource   = macroSource;
    window.__spieli.osmIdDedup    = osmIdDedup;
  }

  const {
    backends,
    registryError,
    aggregatedBbox,
    overlapWarnings,
    fetchNearestAcrossBackends,
  } = createRegistry();

  // Track current map viewport in EPSG:4326 for search biasing — same pattern
  // as StandaloneApp. aggregatedBbox covers all backends and is far too coarse.
  const viewportExtent = readable(null, (set) => {
    let detach = null;
    const unsub = mapStore.subscribe((map) => {
      if (detach) { detach(); detach = null; }
      if (!map) return;
      const update = () => {
        const size = map.getSize();
        if (!size) return;
        set(transformExtent(map.getView().calculateExtent(size), 'EPSG:3857', 'EPSG:4326'));
      };
      map.on('moveend', update);
      detach = () => map.un('moveend', update);
      update();
    });
    return () => { if (detach) detach(); unsub(); };
  });

  const dataContribLinks = { chatUrl: null };

  // Sync resolver for deep-link slug → backend URL. Reads the current backends
  // list via `get()` so AppShell can call it from its restore loop without
  // taking a store subscription of its own.
  function resolveSlugToBackendUrl(slug) {
    const b = get(backends).find(b => b.slug === slug);
    return b ? { url: b.url, name: b.name ?? null } : null;
  }

  // Sync accessor for the slug-less broadcast deeplink path. AppShell fans
  // `fetchPlaygroundByOsmId` across these URLs in parallel; first hit wins.
  // Returns slug and name so deeplink hydration can stamp both `_backendSlug`
  // and `_backendName` on the hydrated feature.
  function getAllBackendUrls() {
    return get(backends).map(b => ({ url: b.url, slug: b.slug ?? null, name: b.name ?? null }));
  }

  // Hub-only retry hook for AppShell.tryRestoreFromHash. The deeplink
  // restore needs to re-run when the registry settles (slug becomes
  // resolvable, broadcast URLs become available) — the polygon source
  // never changes at cluster tier so the source-change retry isn't enough.
  function subscribeBackendsForHashRetry(cb) {
    return backends.subscribe(cb);
  }

  // Initial region fit: once the map is ready, every registered backend has
  // finished its first `get_meta` (success or error), and `aggregatedBbox`
  // has emitted its non-null union, fit the view and then stop listening.
  // Until that point the map stays on its default Germany-wide center from
  // Map.svelte — the "safe" fallback from D5.
  //
  // Why wait for *every* backend's first load: with two backends, the
  // first one to settle drives `aggregatedBbox` to its own bbox alone.
  // If we fit on that single-bbox emission, `backendCount === 1` and the
  // single-backend clamp (`clusterMaxZoom + 1`) latches — even though
  // the union with the second backend would justify the macro tier.
  let fitDone = false;
  let latestMap = null;
  let latestBbox = null;
  let backendsSettled = false;
  let detachMap = null;
  let detachBbox = null;
  let detachBackends = null;
  let detachMapAttach = null;

  // A deeplink hash (e.g. #bayern/W123) expresses an explicit target that takes
  // precedence over the geolocation / bbox initial fit. While it's pending we
  // suppress tryFit entirely and let AppShell.tryRestoreFromHash frame the
  // selected playground. A moveend-watch + timeout fallback re-enables the
  // normal fit only if the restore never delivers (404, unknown slug, hydration
  // error) — mirrors StandaloneApp's deeplink guard.
  let deeplinkPending = false;
  let deeplinkFitTimer = null;
  let detachDeeplinkWatcher = null;

  // Geolocation for initial view: prefer the user's current location over the
  // aggregated bbox. geolocDone gates tryFit so we don't bbox-fit and then
  // immediately jump to the user's location. Resolves within 3 s or falls back.
  let geolocDone = false;
  let geolocCoord = null; // [lon, lat] in EPSG:4326, or null if unavailable
  let regionUrlDone = false;
  let regionUrlExtent = null; // [minLon, minLat, maxLon, maxLat] from URL path, or null
  let regionUrlOsmId = null;  // Nominatim osm_id for backend matching
  let highlightedBackendUrl = null;

  // Fallback extent when no backend bbox is available (e.g. all backends
  // are currently importing). Covers Germany so the map is usable.
  const FALLBACK_BBOX = [5.87, 47.27, 15.04, 55.06];

  function tryFit() {
    if (deeplinkPending) return;
    if (fitDone || !latestMap || !backendsSettled || !geolocDone || !regionUrlDone) return;
    if (!regionUrlExtent && !geolocCoord && !latestBbox) return;
    const fitPadding = regionFitPadding();
    if (regionUrlExtent) {
      latestMap.getView().fit(
        transformExtent(regionUrlExtent, 'EPSG:4326', 'EPSG:3857'),
        { padding: fitPadding, duration: 0 },
      );
    } else if (geolocCoord) {
      latestMap.getView().animate({
        center: fromLonLat(geolocCoord),
        zoom: clusterMaxZoom + 1,
        duration: 0,
      });
    } else {
      // No location — fall back to aggregated bbox, or Germany if no bbox.
      // Single-backend hubs always clamp to clusterMaxZoom + 1 (spec §6.1):
      // a single small city's bbox fitted with normal padding lands in the
      // macro tier, where one giant ring covers a city the user already
      // implied they wanted to look at. Clamping forces the initial paint
      // into the cluster tier.
      //
      // Multi-backend hubs accept whatever the union dictates (spec §6.2)
      // — a Germany+France union legitimately wants the macro continent
      // overview now that §5 ships and macro rings render properly.
      const backendCount = get(backends).length;
      const fitOpts = { padding: fitPadding, duration: 0 };
      if (backendCount <= 1) fitOpts.maxZoom = clusterMaxZoom + 1;
      latestMap.getView().fit(
        transformExtent(latestBbox ?? FALLBACK_BBOX, 'EPSG:4326', 'EPSG:3857'),
        fitOpts,
      );
    }
    fitDone = true;
    detachMap?.();
    detachBbox?.();
    detachBackends?.();
    detachMap = detachBbox = detachBackends = null;
  }

  onMount(() => {
    // Read the deeplink hash BEFORE anything can mutate it. When present it
    // owns the initial framing (via AppShell.tryRestoreFromHash), so tryFit
    // stays suppressed until the fallback timer disarms it below.
    deeplinkPending = !!parseHash(window.location.hash);

    // Resolve region URL path (e.g. /fulda) in parallel with geolocation.
    // Region URL takes precedence over geolocation when both resolve.
    const regionPath = isRegionPath(window.location.pathname);
    resolveRegionFromPath(window.location.pathname).then(result => {
      if (result) {
        regionUrlExtent = result.extent;
        regionUrlOsmId = result.osmId;
      }
      // Tell the shared LocateButton whether a region URL framed the map, so
      // its auto-locate doesn't pan over an explicit /region request (#698).
      // Without this the store stays null and LocateButton waits the full
      // safety timeout before locating.
      if (regionPath) regionFramingApplied.set(!!result);
      regionUrlDone = true;
      tryFit();
    });

    // Request geolocation early so the result is likely in hand before
    // backends settle. Uses a 3 s timeout and a 5-min cache so a repeat
    // page-load doesn't trigger another GPS fix. On error or timeout,
    // geolocDone is set so tryFit falls through to the bbox fit.
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          geolocCoord = [pos.coords.longitude, pos.coords.latitude];
          geolocDone = true;
          tryFit();
        },
        () => { geolocDone = true; tryFit(); },
        { timeout: 3000, maximumAge: 300000 },
      );
    } else {
      geolocDone = true;
    }

    detachMap = mapStore.subscribe(m => {
      latestMap = m;
      // Test hook: expose the OL map so the E2E suite can assert the initial
      // view (e.g. a deeplink frames the linked playground, not the GPS fix).
      if (typeof window !== 'undefined' && m) window.__spieli.map = m;
      tryFit();
    });

    // Arm the deeplink fallback once the map is published (Map.svelte mounts
    // before HubApp, so latestMap is already set). If AppShell's deeplink
    // restore succeeds it fires a moveend (fitViewToSelection) and we leave the
    // map on the linked playground. If no moveend arrives within the timeout the
    // restore failed — disarm and run the normal geoloc/bbox fit.
    if (deeplinkPending && latestMap) {
      let restored = false;
      const onMove = () => { restored = true; };
      latestMap.once('moveend', onMove);
      detachDeeplinkWatcher = () => latestMap.un('moveend', onMove);
      deeplinkFitTimer = setTimeout(() => {
        deeplinkFitTimer = null;
        detachDeeplinkWatcher?.();
        detachDeeplinkWatcher = null;
        if (!restored) { deeplinkPending = false; tryFit(); }
      }, 1500);
    }

    detachBbox = aggregatedBbox.subscribe(b => { latestBbox = b; tryFit(); });
    detachBackends = backends.subscribe(bs => {
      // Settled = registry loaded AND every backend's get_meta has resolved
      // (success or error). A backend that errors keeps `bbox: null`, which
      // aggregatedBbox already excludes; the only thing the settle-gate
      // changes is the *clamp decision* in tryFit.
      backendsSettled = bs.length > 0 && bs.every(b => !b.loading);
      if (backendsSettled && regionUrlOsmId && !highlightedBackendUrl) {
        const match = bs.find(b => b.relationId === regionUrlOsmId);
        if (match) highlightedBackendUrl = match.url;
      }
      tryFit();
    });

    // Attach the hub orchestrator once the map is published. The orchestrator
    // fans out per-tier RPCs across registered backends on every (debounced)
    // moveend, populates clusterSource / polygonSource, and writes the
    // active tier to activeTierStore for layer-visibility toggling.
    //
    // Map.svelte's onMount fires before HubApp's (children before parent in
    // Svelte's lifecycle), so by the time we subscribe here, mapStore
    // already has a value and the callback fires SYNCHRONOUSLY. That makes
    // any self-unsubscribe pattern (`const detachAttach = ...; detachAttach()`)
    // hit a TDZ on the const inside its own first invocation. We instead
    // hold the unsubscribe externally and detach via onDestroy / once the
    // attachment has run.
    detachMapAttach = mapStore.subscribe(map => {
      if (!map || detachOrchestrator) return;
      let clusterFilterFingerprint = '';
      const orchestrator = attachHubOrchestrator({
        map,
        backendsStore: backends,
        clusterSource,
        polygonSource,
        getFilters: () => clusterFilterFingerprint ? JSON.parse(clusterFilterFingerprint) : null,
      });
      let filterSubReady = false;
      const unsubFilters = filterStore.subscribe(filters => {
        const { standalonePitches: _sp, ...cf } = filters;
        clusterFilterFingerprint = JSON.stringify(cf);
        if (!filterSubReady) { filterSubReady = true; return; }
        // Both the cluster and macro tiers re-derive against the active
        // filter — the polygon tier filters client-side and needs no rerun.
        const tier = get(activeTierStore);
        if (tier === 'cluster' || tier === 'macro') orchestrator.rerun();
      });
      detachOrchestrator = () => { orchestrator.detach(); unsubFilters(); };
      // Detach asynchronously so we're not unsubscribing while still inside
      // svelte's subscriber dispatch loop.
      queueMicrotask(() => { detachMapAttach?.(); detachMapAttach = null; });
    });
  });

  onDestroy(() => {
    detachMap?.();
    detachBbox?.();
    detachBackends?.();
    detachMapAttach?.();
    detachOrchestrator?.();
    detachDeeplinkWatcher?.();
    if (deeplinkFitTimer) clearTimeout(deeplinkFitTimer);
  });
</script>

<MacroView {backends} source={macroSource} macroFiltered={macroFilteredStore} macroCoverage={macroCoverageStore} />
<MacroCoverageBanner coverage={macroCoverageStore} />

<AppShell
  playgroundSource={polygonSource}
  {clusterSource}
  {macroSource}
  searchExtent={viewportExtent}
  nearestFetcher={fetchNearestAcrossBackends}
  {resolveSlugToBackendUrl}
  {getAllBackendUrls}
  onBackendsUpdate={subscribeBackendsForHashRetry}
  {dataContribLinks}
>
  {#snippet instancePanel()}
    <InstancePanel {backends} {registryError} {overlapWarnings} {highlightedBackendUrl} />
  {/snippet}
</AppShell>
