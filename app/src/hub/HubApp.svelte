<script>
  import 'bootstrap/dist/css/bootstrap.min.css';
  import 'bootstrap-icons/font/bootstrap-icons.css';

  import VectorSource from 'ol/source/Vector.js';

  import Map from '../components/Map.svelte';
  import PlaygroundPanel from '../components/PlaygroundPanel.svelte';
  import InstancePanel from './InstancePanel.svelte';
  import { createRegistry } from './registry.js';
  import { selection } from '../stores/selection.js';

  const sharedSource = new VectorSource();
  const { backends, registryError } = createRegistry(sharedSource);
</script>

<div class="app-root">
  <!-- Map fills the viewport; hub supplies the shared playground source -->
  <Map playgroundSource={sharedSource} />

  <!-- Backend status sidebar (top-right) -->
  <InstancePanel {backends} {registryError} />

  <!-- Detail panel (left) — same component as standalone, uses per-backend URL -->
  {#if $selection.feature}
    <PlaygroundPanel />
  {/if}
</div>

<style>
  .app-root {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
</style>
