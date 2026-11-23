<script>
  import { haversineDistance, formatDistance, bearingDeg, bearingToDir } from '../lib/playgroundHelpers.js';
  import { poiRadiusM } from '../lib/config.js';
  import { _ } from 'svelte-i18n';

  /** @type {Array} POI objects from fetchNearbyPOIs */
  export let pois = [];
  /** @type {number} Playground centre latitude (WGS84) */
  export let centerLat = 0;
  /** @type {number} Playground centre longitude (WGS84) */
  export let centerLon = 0;

  $: CATEGORIES = [
    {
      icon: '🚻', label: $_('poi.categories.toilets'),
      match: f => f.amenity === 'toilets',
      fallback: $_('poi.fallbacks.toilets'),
    },
    {
      icon: '🚌', label: $_('poi.categories.busStops'),
      match: f => f.highway === 'bus_stop',
      fallback: $_('poi.fallbacks.busStops'),
      hint: (poi) => poi.tags.towards
        ? `→ ${poi.tags.towards}`
        : $_('compass.' + bearingToDir(bearingDeg(centerLat, centerLon, poi.lat, poi.lon))),
    },
    {
      icon: '🍦', label: $_('poi.categories.iceCream'),
      match: f => f.amenity === 'ice_cream' || (f.cuisine && f.cuisine.includes('ice_cream')),
      fallback: $_('poi.fallbacks.iceCream'),
    },
    {
      icon: '🛒', label: $_('poi.categories.shopping'),
      match: f => f.shop === 'supermarket' || f.shop === 'convenience' || f.shop === 'bakery',
      fallback: $_('poi.fallbacks.shopping'),
    },
    {
      icon: '🧴', label: $_('poi.categories.drugstore'),
      match: f => f.shop === 'chemist',
      fallback: $_('poi.fallbacks.drugstore'),
    },
    {
      icon: '🏥', label: $_('poi.categories.emergency'),
      match: f => (f.emergency === 'yes' && ['hospital', 'clinic', 'doctors'].includes(f.amenity)) || f['healthcare:speciality'] === 'emergency',
      fallback: $_('poi.fallbacks.emergency'),
    },
  ];

  $: enriched = pois.map(p => ({
    ...p,
    dist: haversineDistance(centerLat, centerLon, p.lat, p.lon),
  }));

  // The nearest place of each kind, one row per kind (#1077): a second toilet
  // 3.7 km away answers nothing the first did not.
  $: rows = CATEGORIES.map(cat => {
    const nearest = enriched
      .filter(p => cat.match(p.tags))
      .sort((a, b) => a.dist - b.dist)[0];
    return nearest ? { cat, poi: nearest } : null;
  }).filter(Boolean);
</script>

{#if rows.length === 0}
  <small class="text-muted">
    {$_('poi.noNearby', { values: { radius: (poiRadiusM / 1000).toFixed(0) } })}
  </small>
{:else}
  <ul class="poi-list" data-testid="poi-list">
    {#each rows as { cat, poi } (cat.label)}
      {@const name = poi.tags.name || cat.fallback}
      {@const hint = cat.hint ? cat.hint(poi) : null}
      {@const geoUrl = `geo:${poi.lat},${poi.lon}?q=${poi.lat},${poi.lon}(${encodeURIComponent(name)})`}
      {@const osmUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${centerLat},${centerLon};${poi.lat},${poi.lon}`}
      <li>
        <a href={geoUrl} class="poi-row link-mobile-only" title={$_('poi.openNavApp')}>
          <span class="poi-icon" aria-hidden="true">{cat.icon}</span>
          <span class="poi-name"><span class="poi-cat">{cat.label}</span> {name}{#if hint}<span class="poi-hint">({hint})</span>{/if}</span>
          <span class="poi-dist">{formatDistance(poi.dist)}</span>
        </a>
        <a href={osmUrl} target="_blank" rel="noopener" class="poi-row link-desktop-only" title={$_('poi.openInBrowser')}>
          <span class="poi-icon" aria-hidden="true">{cat.icon}</span>
          <span class="poi-name"><span class="poi-cat">{cat.label}</span> {name}{#if hint}<span class="poi-hint">({hint})</span>{/if}</span>
          <span class="poi-dist">{formatDistance(poi.dist)}</span>
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .poi-list { list-style: none; padding: 0; margin: 0; }
  .poi-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.25rem 0;
    font-size: 0.8125rem;
    color: var(--color-primary);
    text-decoration: none;
  }
  .poi-row:hover .poi-name { text-decoration: underline; }
  .poi-icon { flex-shrink: 0; width: 1.25rem; }
  .poi-name { flex: 1; min-width: 0; }
  .poi-cat { color: #6b7280; margin-right: 0.25rem; }
  .poi-hint {
    color: #6b7280;
    margin-left: 0.25rem;
    font-size: 0.7rem;
  }
  .poi-dist { white-space: nowrap; color: #6b7280; }

  /* geo: links open mobile nav apps — hide on desktop */
  .link-mobile-only  { display: flex; }
  .link-desktop-only { display: none; }

  @media (min-width: 1024px) {
    .link-mobile-only  { display: none; }
    .link-desktop-only { display: flex; }
  }
</style>
