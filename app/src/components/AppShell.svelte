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
  import { onDestroy, onMount } from 'svelte';
  import { Pencil, Plus, Minus } from 'lucide-svelte';
  import { mapStore } from '../stores/map.js';
  import { selection, hasSelection } from '../stores/selection.js';
  import { playgroundSourceStore } from '../stores/playgroundSource.js';
  import { parseHash } from '../lib/deeplink.js';

  /**
   * The OL VectorSource that renders the playground layer. The shell passes it
   * to the Map and to widgets that need to scan features (NearbyPlaygrounds
   * fallback, URL-hash restore).
   * @type {import('ol/source/Vector.js').default}
   */
  export let playgroundSource;

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

  // ── URL hash restore ──────────────────────────────────────────────────────
  //
  // On first load the shell inspects `location.hash` and — once the injected
  // source has features — selects the matching osm_id. The slug is accepted
  // but not enforced here; hub mode layers its own slug→backend resolution on
  // top (see #148).
  let hashRestored = false;
  function tryRestoreFromHash() {
    if (hashRestored) return;
    const parsed = parseHash(window.location.hash);
    if (!parsed) { hashRestored = true; return; }
    const feat = playgroundSource.getFeatures().find(f => f.get('osm_id') === parsed.osmId);
    if (feat) {
      const backendUrl = feat.get('_backendUrl') ?? defaultBackendUrl;
      selection.select(feat, backendUrl);
      hashRestored = true;
    }
  }

  onMount(() => {
    // If features are already loaded (sync fetch or test fixture), try now.
    tryRestoreFromHash();
    // Otherwise wait for the source to populate.
    const key = playgroundSource.on('change', tryRestoreFromHash);
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

  // Keep bottom-right controls above the sheet at each snap height
  $: controlsBottomStyle = (() => {
    if (!isMobile || !bottomSheetOpen) return '';
    if (bottomSheetSnap === 'peek') return 'bottom: calc(140px + 1rem)';
    if (bottomSheetSnap === 'half') return 'bottom: calc(50vh + 1rem)';
    return '';
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
    </div>

    <div class="controls-top-right">
      <FilterPanel />
      <button
        class="control-btn"
        onclick={() => dataModalOpen = true}
        title="Daten ergänzen"
        aria-label="Daten ergänzen"
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
          title="Vergrößern"
          aria-label="Vergrößern"
        >
          <Plus class="h-4 w-4" />
        </button>
        <button
          class="zoom-btn zoom-out"
          onclick={zoomOut}
          title="Verkleinern"
          aria-label="Verkleinern"
        >
          <Minus class="h-4 w-4" />
        </button>
      </div>
    </div>

    {#if instancePanel}
      <div class="instance-slot">
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
    transition: bottom 0.3s ease-out;
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

  /* Bottom-left slot for the hub instance-pill (and any future bottom-left widget). */
  .instance-slot {
    position: absolute;
    bottom: 1rem;
    left: 1rem;
    z-index: 100;
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
      top: auto;
      bottom: auto;
      right: 0.75rem;
      top: 0.75rem;
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
