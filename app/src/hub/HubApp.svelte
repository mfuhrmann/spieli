<script>
  import VectorSource from 'ol/source/Vector.js';
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { transformExtent } from 'ol/proj';

  import AppShell from '../components/AppShell.svelte';
  import InstancePanel from './InstancePanel.svelte';
  import MacroView from './MacroView.svelte';

  import { createRegistry } from './registry.js';
  import { attachHubOrchestrator } from './hubOrchestrator.js';
  import { mapStore } from '../stores/map.js';
  import { clusterMaxZoom } from '../lib/config.js';
  import * as osmIdDedup from './osmIdDedup.js';

  // Generic OSM wiki link for the contribution modal (hub is region-agnostic).
  const HUB_WIKI_URL = 'https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground';

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
    fetchNearestAcrossBackends,
  } = createRegistry();

  const dataContribLinks = { wikiUrl: HUB_WIKI_URL, chatUrl: null };

  // Sync resolver for deep-link slug → backend URL. Reads the current backends
  // list via `get()` so AppShell can call it from its restore loop without
  // taking a store subscription of its own.
  function resolveSlugToBackendUrl(slug) {
    return get(backends).find(b => b.slug === slug)?.url ?? null;
  }

  // Sync accessor for the slug-less broadcast deeplink path. AppShell fans
  // `fetchPlaygroundByOsmId` across these URLs in parallel; first hit wins.
  // Also returns each backend's slug so the broadcast result can stamp
  // `_backendSlug` on the hydrated feature — preserves the
  // `#W<id>` → `#<slug>/W<id>` URL canonicalisation.
  function getAllBackendUrls() {
    return get(backends).map(b => ({ url: b.url, slug: b.slug ?? null }));
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

  function tryFit() {
    if (fitDone || !latestMap || !latestBbox || !backendsSettled) return;
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
    const fitOpts = { padding: [20, 20, 20, 380], duration: 0 };
    if (backendCount <= 1) fitOpts.maxZoom = clusterMaxZoom + 1;
    latestMap.getView().fit(
      transformExtent(latestBbox, 'EPSG:4326', 'EPSG:3857'),
      fitOpts,
    );
    fitDone = true;
    detachMap?.();
    detachBbox?.();
    detachBackends?.();
    detachMap = detachBbox = detachBackends = null;
  }

  onMount(() => {
    detachMap = mapStore.subscribe(m => { latestMap = m; tryFit(); });
    detachBbox = aggregatedBbox.subscribe(b => { latestBbox = b; tryFit(); });
    detachBackends = backends.subscribe(bs => {
      // Settled = registry loaded AND every backend's get_meta has resolved
      // (success or error). A backend that errors keeps `bbox: null`, which
      // aggregatedBbox already excludes; the only thing the settle-gate
      // changes is the *clamp decision* in tryFit.
      backendsSettled = bs.length > 0 && bs.every(b => !b.loading);
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
      detachOrchestrator = attachHubOrchestrator({
        map,
        backendsStore: backends,
        clusterSource,
        polygonSource,
      });
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
  });
</script>

<MacroView {backends} source={macroSource} />

<AppShell
  playgroundSource={polygonSource}
  {clusterSource}
  {macroSource}
  searchExtent={aggregatedBbox}
  nearestFetcher={fetchNearestAcrossBackends}
  {resolveSlugToBackendUrl}
  {getAllBackendUrls}
  onBackendsUpdate={subscribeBackendsForHashRetry}
  {dataContribLinks}
>
  {#snippet instancePanel()}
    <InstancePanel {backends} {registryError} />
  {/snippet}
</AppShell>
