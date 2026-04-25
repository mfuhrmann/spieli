<script>
  import Map from './Map.svelte';
  import PlaygroundPanel from './PlaygroundPanel.svelte';
  import SearchBar from './SearchBar.svelte';
  import LocateButton from './LocateButton.svelte';
  import FilterPanel from './FilterPanel.svelte';
  import FilterChips from './FilterChips.svelte';
  import BottomSheet from './BottomSheet.svelte';
  import HoverPreview from './HoverPreview.svelte';
  import EquipmentTooltip from './EquipmentTooltip.svelte';
  import NearbyPlaygrounds from './NearbyPlaygrounds.svelte';
  import DataContributionModal from './DataContributionModal.svelte';
  import CompletenessLegend from './CompletenessLegend.svelte';
  import { onDestroy, onMount } from 'svelte';
  import { Pencil, Plus, Minus } from 'lucide-svelte';
  import { _ } from 'svelte-i18n';
  import GeoJSON from 'ol/format/GeoJSON.js';
  import { mapStore } from '../stores/map.js';
  import { selection, hasSelection } from '../stores/selection.js';
  import { playgroundSourceStore } from '../stores/playgroundSource.js';
  import { parseHash } from '../lib/deeplink.js';
  import { fetchPlaygroundByOsmId } from '../lib/api.js';

  /**
   * The OL VectorSource that renders the polygon tier (zoom ≥ 14). The shell
   * passes it to the Map and to widgets that need to scan features
   * (NearbyPlaygrounds fallback, URL-hash restore).
   * @type {import('ol/source/Vector.js').default}
   */
  export let playgroundSource;

  /**
   * Cluster-tier source (zoom ≤ clusterMaxZoom). Fed by the orchestrator from
   * `get_playground_clusters`.
   * @type {import('ol/source/Vector.js').default | null}
   */
  export let clusterSource = null;

  /**
   * Readable store emitting the current map view in WGS84 as
   * `[minLon, minLat, maxLon, maxLat]` (or null). Consumed by SearchBar as
   * Nominatim `viewbox`.
   * @type {import('svelte/store').Readable<[number,number,number,number]|null>}
   */
  export let searchExtent;

  /**
   * `(lat, lon) => Promise<Array<{ osm_id, name, distance_m, ... }>>` returning
   * distance-sorted nearby playgrounds. Standalone wires this to a single
   * PostgREST call; hub wires it to a multi-backend merge.
   * @type {(lat: number, lon: number) => Promise<Array>}
   */
  export let nearestFetcher = null;

  /**
   * Links shown in the data-contribution modal.
   * @type {{ wikiUrl: string, chatUrl: string | null }}
   */
  export let dataContribLinks;

  /** Fallback backend URL applied to features that don't carry `_backendUrl`. */
  export let defaultBackendUrl = '';

  /**
   * Optional Svelte snippet rendered in the bottom-left corner, above the
   * scale-line. Hub uses this to render the instance-pill; standalone leaves
   * it empty.
   * @type {import('svelte').Snippet | null}
   */
  export let instancePanel = null;

  /**
   * Hub-only slug → backend URL resolver. When a deep-link carries a slug,
   * the shell uses this to narrow the feature search to that backend. Returns
   * the URL, or `null` if the slug is unknown — in which case we keep retrying
   * on every source `change` event as more backends populate, but only log the
   * "unknown slug" warning once. Standalone passes `null`, so any slug in the
   * hash is silently ignored.
   * @type {((slug: string) => string | null) | null}
   */
  export let resolveSlugToBackendUrl = null;

  // ── URL hash restore ──────────────────────────────────────────────────────
  //
  // Runs once on first load and again on every `change` event from the
  // injected source until a match is found. Supports both `#W<osm_id>` and
  // `#<slug>/W<osm_id>`: with a slug, selection is scoped to the matching
  // backend; without a slug, we broadcast-search across all loaded features
  // and warn on duplicate osm_ids (rare — same OSM entity present in two
  // overlapping regional databases).
  let hashRestored = false;
  let warnedUnknownSlug = false;
  let hydrating = false;
  let warnedHydrationFailed = false;
  const geojsonFormat = new GeoJSON();

  async function tryRestoreFromHash() {
    if (hashRestored) return;
    const parsed = parseHash(window.location.hash);
    if (!parsed) { hashRestored = true; return; }

    let candidates = playgroundSource.getFeatures();

    if (parsed.slug && resolveSlugToBackendUrl) {
      const targetUrl = resolveSlugToBackendUrl(parsed.slug);
      if (!targetUrl) {
        if (!warnedUnknownSlug) {
          console.warn(`[deeplink] unknown registry slug "${parsed.slug}" — will retry as backends load`);
          warnedUnknownSlug = true;
        }
        return;
      }
      candidates = candidates.filter(f => f.get('_backendUrl') === targetUrl);
    }

    const matches = candidates.filter(f => f.get('osm_id') === parsed.osmId);
    if (matches.length > 0) {
      if (matches.length > 1 && !parsed.slug) {
        console.warn(`[deeplink] osm_id ${parsed.osmId} matched ${matches.length} backends — selecting the first`);
      }
      const feat = matches[0];
      const backendUrl = feat.get('_backendUrl') ?? defaultBackendUrl;
      selection.select(feat, backendUrl);
      // Fit to the playground so the user sees what they linked to even if
      // they landed at a low zoom that doesn't render polygons.
      const map = $mapStore;
      if (map) {
        map.getView().fit(feat.getGeometry().getExtent(), {
          padding: [40, 40, 40, 420],
          maxZoom: 19,
          duration: 400,
        });
      }
      hashRestored = true;
      return;
    }

    // §5.1 — when the polygon source is empty (cluster tier on first load),
    // hydrate the single feature on demand from get_playground(osm_id).
    // The source's 'change' event re-runs this handler and the standard
    // match path then selects + fits.
    //
    // Only standalone, slug-less deeplinks need hydration:
    //   - Hub mode: registry's per-backend broadcast loading populates the
    //     source as each backend responds, then the match path above runs
    //     on every 'change' until a hit. Hydrating here would race against
    //     that and target the wrong backend URL.
    //   - Standalone + slug: the slug is ignored (`resolveSlugToBackendUrl`
    //     is null), the match path runs as broadcast across all features,
    //     and once the orchestrator loads the polygon tier the match
    //     succeeds. No hydration needed.
    if (hydrating) return;
    if (resolveSlugToBackendUrl) return; // hub mode — registry handles it
    if (parsed.slug) return;             // standalone with slug — wait for source
    hydrating = true;
    try {
      const feature = await fetchPlaygroundByOsmId(parsed.osmId, defaultBackendUrl);
      if (feature) {
        const olFeatures = geojsonFormat.readFeatures(
          { type: 'FeatureCollection', features: [feature] },
          { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' },
        );
        playgroundSource.addFeatures(olFeatures);
      } else {
        // 200 OK with no body — the backend confirms no playground exists
        // with this osm_id. Give up rather than retry on every change.
        if (!warnedHydrationFailed) {
          warnedHydrationFailed = true;
          console.warn(`[deeplink] no playground found for osm_id ${parsed.osmId}`);
        }
        hashRestored = true;
      }
    } catch (err) {
      // Server error / network / timeout. Logging once and giving up
      // beats fetching on every subsequent moveend's source change. User
      // can reload to retry.
      if (!warnedHydrationFailed) {
        warnedHydrationFailed = true;
        console.warn('[deeplink] hydration failed (give up; reload to retry):', err);
      }
      hashRestored = true;
    } finally {
      hydrating = false;
    }
  }

  onMount(() => {
    // If features are already loaded (sync fetch or test fixture), try now.
    tryRestoreFromHash();
    // Otherwise wait for the source to populate.
    playgroundSource.on('change', tryRestoreFromHash);
    return () => playgroundSource.un('change', tryRestoreFromHash);
  });

  let dataModalOpen = false;

  // Nearest-playground suggestions panel
  let nearbyLocation = null;  // { lat, lon } | null
  let dismissUnsub = null;

  function handleLocation(lat, lon) {
    if (dismissUnsub) { dismissUnsub(); dismissUnsub = null; }
    if (lat === null) { nearbyLocation = null; return; }
    nearbyLocation = { lat, lon };
    let first = true;
    dismissUnsub = selection.subscribe(() => {
      if (first) { first = false; return; }
      nearbyLocation = null;
      if (dismissUnsub) { dismissUnsub(); dismissUnsub = null; }
    });
  }

  function dismissNearby() {
    nearbyLocation = null;
    if (dismissUnsub) { dismissUnsub(); dismissUnsub = null; }
  }

  onDestroy(() => { if (dismissUnsub) dismissUnsub(); });

  // Responsive: track if we're on mobile
  let isMobile = false;
  function checkMobile() {
    isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
  }
  $: if (typeof window !== 'undefined') {
    checkMobile();
  }

  // Bottom sheet state for mobile
  let bottomSheetOpen = false;
  let bottomSheetSnap = 'half';
  let sheetHeight = 0;
  let sheetDragging = false;

  // Keep controls above the sheet — follows live height during drag, animates on snap
  $: controlsBottomStyle = (() => {
    if (!isMobile || !bottomSheetOpen || sheetHeight === 0) return '';
    const noTransition = sheetDragging ? 'transition: none; ' : '';
    return `${noTransition}bottom: calc(${sheetHeight}px + 1rem)`;
  })();

  // Sync bottom sheet with selection on mobile
  $: if (isMobile && $hasSelection) {
    bottomSheetOpen = true;
    bottomSheetSnap = 'peek';
    const feat = $selection.feature;
    if (feat && $mapStore) {
      $mapStore.getView().fit(feat.getGeometry().getExtent(), {
        padding: [40, 40, 180, 40],
        maxZoom: 19,
        duration: 400,
      });
    }
  }
  $: if (isMobile && !$hasSelection) {
    bottomSheetOpen = false;
  }

  // Hover preview state
  let hoverFeature = null;
  let hoverPosition = null;

  function handleHover(feature, pixel) {
    if (isMobile) return;
    hoverFeature = feature;
    hoverPosition = pixel ? { x: pixel[0], y: pixel[1] } : null;
  }

  function clearHover() {
    hoverFeature = null;
    hoverPosition = null;
  }

  let equipHoverFeature = null;
  let equipHoverPosition = null;

  function handleEquipHover(feature, pixel) {
    if (isMobile) return;
    equipHoverFeature = feature;
    equipHoverPosition = pixel ? { x: pixel[0], y: pixel[1] } : null;
  }

  function clearEquipHover() {
    equipHoverFeature = null;
    equipHoverPosition = null;
  }

  function zoomIn() {
    if ($mapStore) {
      const view = $mapStore.getView();
      view.animate({ zoom: view.getZoom() + 1, duration: 200 });
    }
  }

  function zoomOut() {
    if ($mapStore) {
      const view = $mapStore.getView();
      view.animate({ zoom: view.getZoom() - 1, duration: 200 });
    }
  }
</script>

<svelte:window onresize={checkMobile} />

<div class="app-root">
  <Map
    {playgroundSource}
    {clusterSource}
    {defaultBackendUrl}
    onhover={handleHover}
    onclearhover={clearHover}
    onequipmenthover={handleEquipHover}
    onclearequipmenthover={clearEquipHover}
  />

  {#if !(isMobile && bottomSheetSnap === 'full')}
    <div class="search-area">
      <SearchBar regionExtent={$searchExtent} onlocation={handleLocation} />
      <FilterChips />
      {#if nearbyLocation}
        <NearbyPlaygrounds
          lat={nearbyLocation.lat}
          lon={nearbyLocation.lon}
          fetcher={nearestFetcher}
          {defaultBackendUrl}
          ondismiss={dismissNearby}
        />
      {/if}
      {#if !$hasSelection}
        <CompletenessLegend />
      {/if}
    </div>

    <div class="controls-top-right">
      <FilterPanel />
      <button
        class="control-btn"
        onclick={() => dataModalOpen = true}
        title={$_('nav.addData')}
        aria-label={$_('nav.addData')}
      >
        <Pencil class="h-5 w-5" />
      </button>
    </div>

    <div class="controls-bottom-right" style={controlsBottomStyle}>
      <LocateButton onlocation={handleLocation} />
      <div class="zoom-controls">
        <button
          class="zoom-btn zoom-in"
          onclick={zoomIn}
          title={$_('zoom.in')}
          aria-label={$_('zoom.in')}
        >
          <Plus class="h-4 w-4" />
        </button>
        <button
          class="zoom-btn zoom-out"
          onclick={zoomOut}
          title={$_('zoom.out')}
          aria-label={$_('zoom.out')}
        >
          <Minus class="h-4 w-4" />
        </button>
      </div>
    </div>

    {#if instancePanel}
      <div class="instance-slot" style={controlsBottomStyle}>
        {@render instancePanel()}
      </div>
    {/if}

  {/if}

  {#if !isMobile && $hasSelection}
    <div class="side-panel">
      <PlaygroundPanel />
    </div>
  {/if}

  {#if isMobile}
    <BottomSheet
      bind:open={bottomSheetOpen}
      bind:snapPoint={bottomSheetSnap}
      bind:currentHeight={sheetHeight}
      bind:isDragging={sheetDragging}
      title=""
    >
      {#if $hasSelection}
        <PlaygroundPanel embedded={true} />
      {/if}
    </BottomSheet>
  {/if}

  <HoverPreview position={$hasSelection ? null : hoverPosition} feature={$hasSelection ? null : hoverFeature} />
  <EquipmentTooltip position={equipHoverPosition} feature={equipHoverFeature} />

  <DataContributionModal
    bind:open={dataModalOpen}
    wikiUrl={dataContribLinks.wikiUrl}
    chatUrl={dataContribLinks.chatUrl}
  />
</div>

<style>
  .app-root {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }

  .search-area {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .controls-top-right {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 100;
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
  }

  .controls-bottom-right {
    position: absolute;
    bottom: 7rem;
    right: 1rem;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: center;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: white;
    border: none;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    color: #666;
    transition: background 0.15s, color 0.15s;
  }

  .control-btn:hover {
    background: #f5f5f5;
    color: #333;
  }

  .zoom-controls {
    display: flex;
    flex-direction: column;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }

  .zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: white;
    border: none;
    cursor: pointer;
    color: #666;
    transition: background 0.15s, color 0.15s;
  }

  .zoom-btn:hover {
    background: #f5f5f5;
    color: #333;
  }

  .zoom-in {
    border-bottom: 1px solid #e0e0e0;
  }

  /* Bottom-left slot for the hub instance-pill (and any future bottom-left
     widget). Raised above the scale-line (bottom:24px + ~14px tall) with a
     small gap so the two don't collide. */
  .instance-slot {
    position: absolute;
    bottom: 3rem;
    left: 1rem;
    z-index: 100;
  }

  @media (max-width: 1023px) {
    .instance-slot {
      left: 0.75rem;
    }
  }

  .side-panel {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 380px;
    z-index: 200;
    background: var(--color-card);
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
    overflow-y: auto;
    animation: slideInLeft 0.3s ease-out;
    color-scheme: light;

    --color-background: #ffffff;
    --color-foreground: #1f2937;
    --color-card: #ffffff;
    --color-card-foreground: #1f2937;
    --color-popover: #ffffff;
    --color-popover-foreground: #1f2937;
    --color-muted: #f3f4f6;
    --color-muted-foreground: #6b7280;
    --color-border: #e5e7eb;
    --color-input: #e5e7eb;
  }

  @keyframes slideInLeft {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(0);
    }
  }

  @media (max-width: 1023px) {
    .search-area {
      top: 0.75rem;
      left: 0.75rem;
      right: 0.75rem;
    }

    .controls-top-right {
      top: 0.75rem;
      right: 0.75rem;
    }

    .controls-bottom-right {
      bottom: 10rem;
      right: 0.75rem;
    }
  }

  @media (min-width: 1024px) {
    .app-root:has(.side-panel) .search-area {
      left: calc(380px + 1rem);
      transition: left 0.3s ease-out;
    }
  }
</style>
