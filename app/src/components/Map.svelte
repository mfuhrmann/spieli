<script>
  import { onMount, onDestroy } from 'svelte';
  import { Map, View } from 'ol';
  import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer.js';
  import VectorSource from 'ol/source/Vector.js';
  import XYZ from 'ol/source/XYZ.js';
  import GeoJSON from 'ol/format/GeoJSON.js';
  import { transform, transformExtent } from 'ol/proj';
  import { ScaleLine, defaults as defaultControls } from 'ol/control.js';
  import { defaults as defaultInteractions } from 'ol/interaction/defaults';

  import { mapZoom, mapMinZoom, osmRelationId, apiBaseUrl } from '../lib/config.js';
  import { fetchPlaygrounds } from '../lib/api.js';
  import { fetchRegionInfo } from '../lib/region.js';
  import { playgroundStyleFn, selectionStyle } from '../lib/vectorStyles.js';
  import { selection } from '../stores/selection.js';
  import { mapStore } from '../stores/map.js';
  import { playgroundSourceStore } from '../stores/playgroundSource.js';
  import { filterStore, matchesFilters } from '../stores/filters.js';
  import { debounce } from '../lib/utils.js';

  // Props: optional overrides for hub mode (multiple backends feed into one shared source)
  /** @type {VectorSource | null} - when provided, the map uses this source instead of creating one */
  export let playgroundSource = null;
  /** Backend URL used for selection — standalone passes apiBaseUrl, hub passes per-feature URL */
  export let defaultBackendUrl = apiBaseUrl;
  
  /** Hover callback: (feature, pixel) => void */
  export let onhover = null;
  /** Clear hover callback: () => void */
  export let onclearhover = null;

  let mapContainer;
  let olMap = null;
  let ownSource = null;       // only set when we own the source (standalone mode)
  let playgroundLayer = null; // exposed for filter reactivity

  onMount(async () => {
    // Use provided source (hub) or create our own (standalone)
    const source = playgroundSource ?? (ownSource = new VectorSource());

    playgroundLayer = new VectorLayer({
      source,
      zIndex: 10,
      style: playgroundStyleFn,
    });

    const basemap = new TileLayer({
      source: new XYZ({
        url: 'https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        attributions:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
          '| &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }),
    });

    const view = new View({
      center: transform([10.5, 51.2], 'EPSG:4326', 'EPSG:3857'), // Germany fallback
      zoom: mapZoom,
      minZoom: mapMinZoom,
    });

    olMap = new Map({
      target: mapContainer,
      layers: [basemap, playgroundLayer],
      view,
      // Disable default zoom/rotate controls for cleaner UI like Google Maps
      controls: defaultControls({ 
        zoom: false, 
        rotate: false,
        attribution: true 
      }).extend([
        new ScaleLine({ units: 'metric', className: 'custom-scale-line' })
      ]),
      interactions: defaultInteractions({ altShiftDragRotate: false, pinchRotate: false }),
    });

    mapStore.set(olMap);

    // Click handler: select playground on click
    olMap.on('click', (evt) => {
      const hit = olMap.forEachFeatureAtPixel(evt.pixel, (feature) => feature, {
        layerFilter: (l) => l === playgroundLayer,
      });
      if (hit) {
        const backendUrl = hit.get('_backendUrl') ?? defaultBackendUrl;
        selection.select(hit, backendUrl);
        view.fit(hit.getGeometry().getExtent(), {
          padding: [40, 40, 40, 420], // right/top/bottom clear; 420 = sidebar width + margin
          maxZoom: 19,
          duration: 400,
        });
      } else {
        selection.clear();
      }
    });

    // Pointer cursor on hover + hover preview callback
    let lastHoverFeature = null;
    const debouncedHover = debounce((feature, pixel) => {
      if (onhover) onhover(feature, pixel);
    }, 100);

    olMap.on('pointermove', (evt) => {
      const hit = olMap.forEachFeatureAtPixel(evt.pixel, (feature) => feature, {
        layerFilter: (l) => l === playgroundLayer,
      });
      
      mapContainer.style.cursor = hit ? 'pointer' : '';
      
      if (hit && hit !== lastHoverFeature) {
        lastHoverFeature = hit;
        debouncedHover(hit, evt.pixel);
      } else if (!hit && lastHoverFeature) {
        lastHoverFeature = null;
        if (onclearhover) onclearhover();
      }
    });

    mapContainer.addEventListener('pointerleave', () => {
      if (lastHoverFeature) {
        lastHoverFeature = null;
        mapContainer.style.cursor = '';
        if (onclearhover) onclearhover();
      }
    });

    // Standalone: fetch playgrounds and fit to region
    if (ownSource) {
      playgroundSourceStore.set(ownSource);
      loadStandaloneData(ownSource, view);
    }

    // Restore selection from URL hash on load
    const hash = window.location.hash;
    const match = hash.match(/^#W(\d+)$/);
    if (match) {
      const osmId = parseInt(match[1], 10);
      // Wait for features to load, then find and select
      source.once('change', () => {
        const feat = source.getFeatures().find(f => f.get('osm_id') === osmId);
        if (feat) selection.select(feat, defaultBackendUrl);
      });
    }
  });

  onDestroy(() => {
    if (olMap) {
      olMap.setTarget(undefined);
      mapStore.set(null);
    }
    playgroundSourceStore.set(null);
  });

  // Re-style the playground layer whenever filters change.
  $: if (playgroundLayer) {
    const filters = $filterStore;
    playgroundLayer.setStyle(feature => {
      if (!matchesFilters(feature.getProperties(), filters)) return null;
      return playgroundStyleFn(feature);
    });
  }

  async function loadStandaloneData(source, view) {
    // Fetch region info for map extent fitting
    try {
      const region = await fetchRegionInfo(osmRelationId);
      view.fit(transformExtent(region.extent, 'EPSG:4326', 'EPSG:3857'), {
        padding: [20, 20, 20, 380], // leave room for the side panel on desktop
        duration: 0,
      });
      document.title = `Spielplatzkarte ${region.name}`;
    } catch (err) {
      console.warn('Nominatim region fetch failed, using default extent:', err);
    }

    // Load playground polygons
    try {
      const geojson = await fetchPlaygrounds();
      const features = new GeoJSON().readFeatures(geojson, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      });
      source.addFeatures(features);
    } catch (err) {
      console.error('Playground data could not be loaded:', err);
    }
  }
</script>

<div bind:this={mapContainer} class="map-container"></div>

<style>
  .map-container {
    width: 100%;
    height: 100%;
    position: absolute;
    inset: 0;
  }

  /* Custom scale line styling - bottom left, minimal */
  :global(.custom-scale-line) {
    position: absolute;
    bottom: 24px;
    left: 10px;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    color: #333;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }

  :global(.custom-scale-line .ol-scale-line-inner) {
    border: 1px solid #333;
    border-top: none;
    color: #333;
    font-size: 11px;
    text-align: center;
  }

  /* Attribution styling - bottom right, minimal */
  :global(.ol-attribution) {
    position: absolute;
    bottom: 4px;
    right: 4px;
    background: rgba(255, 255, 255, 0.7);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
  }

  :global(.ol-attribution ul) {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  :global(.ol-attribution li) {
    display: inline;
  }

  :global(.ol-attribution button) {
    display: none;
  }
</style>
