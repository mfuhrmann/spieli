<script>
  import 'bootstrap/dist/css/bootstrap.min.css';
  import 'bootstrap-icons/font/bootstrap-icons.css';

  import Map from '../components/Map.svelte';
  import { selection } from '../stores/selection.js';
  import VectorSource from 'ol/source/Vector.js';

  // Shared playground source populated by registry.js (added in PR 5)
  const sharedSource = new VectorSource();
</script>

<div class="app-root">
  <Map playgroundSource={sharedSource} />

  <aside class="instance-panel">
    <h6 class="instance-panel__title">
      <i class="bi bi-map me-1"></i> Spielplatzkarte Hub
    </h6>
    <!-- InstancePanel component will be added in PR 5 -->
    <p class="text-muted small px-2">
      Instanzen werden in PR 5 geladen.
    </p>
  </aside>

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
        <!-- PlaygroundPanel (shared with standalone) will be wired in PR 5 -->
        <p class="text-muted small">Quelle: {$selection.backendUrl}</p>
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

  .instance-panel {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 280px;
    max-height: calc(100vh - 2rem);
    background: #fff;
    border-radius: 0.5rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    z-index: 100;
    overflow-y: auto;
    padding: 0.75rem 0;
  }

  .instance-panel__title {
    padding: 0 0.75rem 0.5rem;
    border-bottom: 1px solid #dee2e6;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #495057;
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
  }

  .info-panel__body {
    padding: 1rem;
    flex: 1;
  }
</style>
