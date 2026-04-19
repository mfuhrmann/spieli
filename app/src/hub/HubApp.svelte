<script>
  import VectorSource from 'ol/source/Vector.js';
  import { onDestroy, onMount } from 'svelte';
  import { transformExtent } from 'ol/proj';

  import AppShell from '../components/AppShell.svelte';
  import InstancePanel from './InstancePanel.svelte';

  import { createRegistry } from './registry.js';
  import { mapStore } from '../stores/map.js';

  // Generic OSM wiki link for the contribution modal (hub is region-agnostic).
  const HUB_WIKI_URL = 'https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground';

  const sharedSource = new VectorSource();
  const {
    backends,
    registryError,
    aggregatedBbox,
    fetchNearestAcrossBackends,
  } = createRegistry(sharedSource);

  const dataContribLinks = { wikiUrl: HUB_WIKI_URL, chatUrl: null };

  // Initial region fit: once both the map and the first aggregated bbox are
  // available, fit the view and then stop listening. Until that point the map
  // stays on its default Germany-wide center from Map.svelte — the "safe"
  // fallback from D5.
  let fitDone = false;
  let detachMap = null;
  let detachBbox = null;

  function tryFit(map, bbox) {
    if (fitDone || !map || !bbox) return;
    map.getView().fit(
      transformExtent(bbox, 'EPSG:4326', 'EPSG:3857'),
      { padding: [20, 20, 20, 380], duration: 0 }
    );
    fitDone = true;
    detachMap?.();
    detachBbox?.();
    detachMap = detachBbox = null;
  }

  onMount(() => {
    let latestMap = null;
    let latestBbox = null;
    detachMap = mapStore.subscribe(m => { latestMap = m; tryFit(latestMap, latestBbox); });
    detachBbox = aggregatedBbox.subscribe(b => { latestBbox = b; tryFit(latestMap, latestBbox); });
  });

  onDestroy(() => {
    detachMap?.();
    detachBbox?.();
  });
</script>

<div class="hub-root">
  <AppShell
    playgroundSource={sharedSource}
    searchExtent={aggregatedBbox}
    nearestFetcher={fetchNearestAcrossBackends}
    {dataContribLinks}
  />

  <!-- Backend instance panel — top-right today; #147 redesigns it as a
       bottom-left pill and moves it into the AppShell `instancePanel` slot. -->
  <InstancePanel {backends} {registryError} />
</div>

<style>
  /* Reserve room for the 240px-wide InstancePanel in the top-right corner
     until #147 redesigns it. Scoped to hub-root so standalone is unaffected.
     `!important` is required because AppShell's scoped `.controls-top-right`
     rule has the same specificity (0,2,0) — source order would otherwise
     decide the cascade. Remove this block when #147 moves the panel to
     bottom-left and the collision disappears. */
  :global(.hub-root .controls-top-right) {
    right: calc(240px + 1.5rem) !important;
  }

  @media (max-width: 1023px) {
    :global(.hub-root .controls-top-right) {
      right: calc(240px + 1rem) !important;
    }
  }
</style>
