<script>
  import 'bootstrap/dist/css/bootstrap.min.css';
  import 'bootstrap-icons/font/bootstrap-icons.css';

  import Map from '../components/Map.svelte';
  import PlaygroundPanel from '../components/PlaygroundPanel.svelte';
  import SearchBar from '../components/SearchBar.svelte';
  import LocateButton from '../components/LocateButton.svelte';
  import FilterPanel from '../components/FilterPanel.svelte';
  import DataContributionModal from '../components/DataContributionModal.svelte';
  import { apiBaseUrl } from '../lib/config.js';
  import { mapStore } from '../stores/map.js';
  import { transformExtent } from 'ol/proj';

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
</script>

<div class="app-root">
  <Map defaultBackendUrl={apiBaseUrl} />

  <!-- Toolbar: search + locate + filter + data contribution -->
  <div class="map-toolbar">
    <SearchBar {regionExtent} />
    <LocateButton />
    <FilterPanel />
    <button
      class="btn btn-sm btn-outline-secondary toolbar-icon-btn"
      onclick={() => dataModalOpen = true}
      title="Daten ergänzen"
      aria-label="Daten ergänzen"
    >
      <span class="bi bi-pencil-square"></span>
    </button>
  </div>

  <!-- Full detail panel (manages its own visibility via selection store) -->
  <PlaygroundPanel />

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

  .map-toolbar {
    position: absolute;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    z-index: 100;
    background: rgba(255,255,255,0.92);
    backdrop-filter: blur(4px);
    padding: 0.35rem 0.5rem;
    border-radius: 0.4rem;
    box-shadow: 0 1px 4px rgba(0,0,0,0.18);
  }

  .toolbar-icon-btn { padding: 0.25rem 0.5rem; line-height: 1; }
</style>
