<script>
  import VectorSource from 'ol/source/Vector.js';
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
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

  // Sync resolver for deep-link slug → backend URL. Reads the current backends
  // list via `get()` so AppShell can call it from its restore loop without
  // taking a store subscription of its own.
  function resolveSlugToBackendUrl(slug) {
    return get(backends).find(b => b.slug === slug)?.url ?? null;
  }

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

<AppShell
  playgroundSource={sharedSource}
  searchExtent={aggregatedBbox}
  nearestFetcher={fetchNearestAcrossBackends}
  {resolveSlugToBackendUrl}
  {dataContribLinks}
>
  {#snippet instancePanel()}
    <InstancePanel {backends} {registryError} />
  {/snippet}
</AppShell>
