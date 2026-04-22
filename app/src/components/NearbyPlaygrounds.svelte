<script>
  import { getCenter } from 'ol/extent';
  import { transform } from 'ol/proj';
  import { playgroundSourceStore } from '../stores/playgroundSource.js';
  import { selection } from '../stores/selection.js';
  import { playgroundCompleteness } from '../lib/completeness.js';
  import { _ } from 'svelte-i18n';

  export let lat;
  export let lon;
  /** Called when the panel should close (suggestion selected). */
  export let ondismiss = null;
  /**
   * Fetcher returning `{ osm_id, name, distance_m, ... }` items sorted by
   * distance ascending. Standalone injects a single-backend PostgREST call;
   * hub injects a merge across all registered backends. When null (e.g.
   * local-dev mode with no API), the component falls back to a distance
   * scan of the loaded vector source.
   */
  export let fetcher = null;
  /**
   * Backend URL to attach to the selection when the user picks a suggestion.
   * Hub overrides this per-feature via the feature's `_backendUrl`.
   */
  export let defaultBackendUrl = '';

  let items = [];
  let loading = true;

  $: if (lat != null && lon != null) {
    load(lat, lon);
  }

  function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function nearestFromSource(lt, lg, maxResults = 5) {
    const source = $playgroundSourceStore;
    if (!source) return [];
    return source.getFeatures()
      .map(f => {
        const [fLon, fLat] = transform(getCenter(f.getGeometry().getExtent()), 'EPSG:3857', 'EPSG:4326');
        const props = f.getProperties();
        return {
          osm_id:     props.osm_id,
          name:       props.name,
          lat:        fLat,
          lon:        fLon,
          distance_m: haversineM(lt, lg, fLat, fLon),
          tags:       props,
        };
      })
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, maxResults);
  }

  async function load(lt, lg) {
    loading = true;
    items = [];
    try {
      const results = fetcher
        ? await fetcher(lt, lg)
        : nearestFromSource(lt, lg);
      items = results.length > 0 ? results : nearestFromSource(lt, lg);
    } catch (err) {
      console.error('Nearest playgrounds fetch failed:', err);
      items = nearestFromSource(lt, lg);
    } finally {
      loading = false;
    }
  }

  function formatDistance(m) {
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  }

  function completenessClass(tags) {
    const c = playgroundCompleteness(tags);
    if (c === 'complete') return 'dot-complete';
    if (c === 'partial')  return 'dot-partial';
    return 'dot-missing';
  }

  function selectSuggestion(item) {
    const source = $playgroundSourceStore;
    const feature = source?.getFeatures().find(f => f.get('osm_id') === item.osm_id);
    if (feature) {
      const backendUrl = feature.get('_backendUrl') ?? defaultBackendUrl;
      selection.select(feature, backendUrl);
    }
    if (ondismiss) ondismiss();
  }
</script>

<div class="nearby-card">
  <div class="nearby-header">{$_('nearby.header')}</div>
  {#if loading}
    <div class="nearby-loading">{$_('nearby.loading')}</div>
  {:else if items.length === 0}
    <div class="nearby-loading">{$_('nearby.empty')}</div>
  {:else}
    <ul class="nearby-list">
      {#each items as item}
        <li>
          <button class="nearby-item" onclick={() => selectSuggestion(item)}>
            <span class="dot {completenessClass(item.tags)}"></span>
            <span class="nearby-name">{item.name || $_('nearby.unknownName')}</span>
            <span class="nearby-dist">{formatDistance(item.distance_m)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .nearby-card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    width: 300px;
    max-width: calc(100vw - 5rem);
  }

  .nearby-header {
    padding: 8px 14px 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9aa0a6;
    border-bottom: 1px solid #e8eaed;
  }

  .nearby-loading {
    padding: 10px 14px;
    font-size: 13px;
    color: #9aa0a6;
  }

  .nearby-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .nearby-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 14px;
    width: 100%;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .nearby-item:hover {
    background: #f1f3f4;
  }

  .dot {
    flex-shrink: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .dot-complete { background: #22c55e; }
  .dot-partial  { background: #f59e0b; }
  .dot-missing  { background: #ef4444; }

  .nearby-name {
    flex: 1;
    font-size: 13px;
    color: #202124;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nearby-dist {
    flex-shrink: 0;
    font-size: 12px;
    color: #9aa0a6;
  }
</style>
