<script>
  import VectorSource from 'ol/source/Vector.js';
  import { onDestroy } from 'svelte';
  import { Pencil, Plus, Minus } from 'lucide-svelte';
  import { _ } from 'svelte-i18n';
  import { transformExtent } from 'ol/proj';

  import Map from '../components/Map.svelte';
  import PlaygroundPanel from '../components/PlaygroundPanel.svelte';
  import SearchBar from '../components/SearchBar.svelte';
  import LocateButton from '../components/LocateButton.svelte';
  import FilterPanel from '../components/FilterPanel.svelte';
  import FilterChips from '../components/FilterChips.svelte';
  import BottomSheet from '../components/BottomSheet.svelte';
  import HoverPreview from '../components/HoverPreview.svelte';
  import EquipmentTooltip from '../components/EquipmentTooltip.svelte';
  import NearbyPlaygrounds from '../components/NearbyPlaygrounds.svelte';
  import DataContributionModal from '../components/DataContributionModal.svelte';
  import InstancePanel from './InstancePanel.svelte';

  import { createRegistry } from './registry.js';
  import { mapStore } from '../stores/map.js';
  import { selection, hasSelection } from '../stores/selection.js';

  const sharedSource = new VectorSource();
  const { backends, registryError } = createRegistry(sharedSource);

  // Expose the current map extent in WGS84 to constrain Nominatim search.
  let regionExtent = null;
  $: if ($mapStore) {
    const updateExtent = () => {
      const size = $mapStore.getSize();
      if (!size) return;
      const ext = $mapStore.getView().calculateExtent(size);
      regionExtent = transformExtent(ext, 'EPSG:3857', 'EPSG:4326');
    };
    $mapStore.on('moveend', updateExtent);
    updateExtent();
  }

  let dataModalOpen = false;

  // Nearest-playground suggestions panel
  let nearbyLocation = null;
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

  // Equipment hover tooltip state
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

  // Zoom controls
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
  <!-- Full-screen map -->
  <Map
    playgroundSource={sharedSource}
    onhover={handleHover}
    onclearhover={clearHover}
    onequipmenthover={handleEquipHover}
    onclearequipmenthover={clearEquipHover}
  />

  {#if !(isMobile && bottomSheetSnap === 'full')}
    <!-- Search bar: top-left, Google Maps style -->
    <div class="search-area">
      <SearchBar {regionExtent} onlocation={handleLocation} />
      <FilterChips />
      {#if nearbyLocation}
        <NearbyPlaygrounds lat={nearbyLocation.lat} lon={nearbyLocation.lon} ondismiss={dismissNearby} />
      {/if}
    </div>

    <!-- Top-right controls: filter, edit — shifted left to make room for InstancePanel -->
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

    <!-- Bottom-right controls: locate, zoom (Google Maps style) -->
    <div class="controls-bottom-right">
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
  {/if}

  <!-- Backend instance panel: top-right corner -->
  <InstancePanel {backends} {registryError} />

  <!-- Desktop: Side panel slides in from left -->
  {#if !isMobile && $hasSelection}
    <div class="side-panel">
      <PlaygroundPanel />
    </div>
  {/if}

  <!-- Mobile: Bottom sheet -->
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

  <!-- Hover preview card (desktop only, hidden when playground is selected) -->
  <HoverPreview position={$hasSelection ? null : hoverPosition} feature={$hasSelection ? null : hoverFeature} />

  <!-- Equipment hover tooltip (desktop only) -->
  <EquipmentTooltip position={equipHoverPosition} feature={equipHoverFeature} />

  <!-- Data contribution modal -->
  <DataContributionModal bind:open={dataModalOpen} />
</div>

<style>
  .app-root {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }

  /* Search area: top-left floating card */
  .search-area {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Top-right controls: filter, edit */
  .controls-top-right {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 100;
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
  }

  /* Bottom-right controls: locate, zoom (Google Maps style) */
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

  @media (max-width: 1023px) {
    .controls-bottom-right {
      z-index: 30;
    }
  }

  /* Control button (for edit button, locate button) */
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

  /* Zoom controls container */
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

  /* Side panel: slides in from left on desktop */
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
    from { transform: translateX(-100%); }
    to   { transform: translateX(0); }
  }

  /* Mobile adjustments */
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
      right: 0.75rem;
    }
  }

  /* When panel is open on desktop, shift search area */
  @media (min-width: 1024px) {
    .app-root:has(.side-panel) .search-area {
      left: calc(380px + 1rem);
      transition: left 0.3s ease-out;
    }
  }
</style>
