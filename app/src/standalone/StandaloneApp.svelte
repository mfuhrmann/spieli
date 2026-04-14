<script>
  import 'bootstrap/dist/css/bootstrap.min.css';
  import 'bootstrap-icons/font/bootstrap-icons.css';

  import Map from '../components/Map.svelte';
  import { selection } from '../stores/selection.js';
  import { apiBaseUrl } from '../lib/config.js';
</script>

<div class="app-root">
  <Map defaultBackendUrl={apiBaseUrl} />

  {#if $selection.feature}
    <aside class="info-panel">
      <div class="info-panel__header">
        <strong>{$selection.feature.get('name') ?? 'Spielplatz'}</strong>
        <button
          class="btn-close"
          aria-label="Schließen"
          onclick={() => selection.clear()}
        ></button>
      </div>
      <div class="info-panel__body">
        <!-- PlaygroundPanel component will be added in PR 3 -->
        <p class="text-muted small">Detailansicht folgt in PR 3.</p>
        <dl class="row small">
          <dt class="col-5">OSM ID</dt>
          <dd class="col-7">{$selection.feature.get('osm_id')}</dd>
        </dl>
      </div>
    </aside>
  {/if}
</div>

<style>
  .app-root {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }

  .info-panel {
    position: absolute;
    top: 0;
    left: 0;
    width: 360px;
    height: 100%;
    background: #fff;
    box-shadow: 2px 0 8px rgba(0,0,0,0.15);
    z-index: 100;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .info-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid #dee2e6;
    font-size: 1rem;
  }

  .info-panel__body {
    padding: 1rem;
    flex: 1;
  }
</style>
