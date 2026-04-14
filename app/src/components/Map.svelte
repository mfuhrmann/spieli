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

  // Props: optional overrides for hub mode (multiple backends feed into one shared source)
  /** @type {VectorSource | null} - when provided, the map uses this source instead of creating one */
  export let playgroundSource = null;
  /** Backend URL used for selection — standalone passes apiBaseUrl, hub passes per-feature URL */
  export let defaultBackendUrl = apiBaseUrl;

  let mapContainer;
  let olMap = null;
  let ownSource = null; // only set when we own the source (standalone mode)

  onMount(async () => {
    // Use provided source (hub) or create our own (standalone)
    const source = playgroundSource ?? (ownSource = new VectorSource());

    const playgroundLayer = new VectorLayer({
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
      controls: defaultControls().extend([new ScaleLine({ units: 'metric' })]),
      interactions: defaultInteractions({ altShiftDragRotate: false, pinchRotate: false }),
    });

    mapStore.set(olMap);

    // Click handler: select playground on click
    olMap.on('click', (evt) => {
      const hit = olMap.forEachFeatureAtPixel(evt.pixel, (feature) => feature, {
        layerFilter: (l) => l === playgroundLayer,
      });
      if (hit) {
        // In hub mode the feature carries its own backend URL; fall back to prop
        const backendUrl = hit.get('_backendUrl') ?? defaultBackendUrl;
        selection.select(hit, backendUrl);
      } else {
        selection.clear();
      }
    });

    // Pointer cursor on hover
    olMap.on('pointermove', (evt) => {
      const hit = olMap.hasFeatureAtPixel(evt.pixel, {
        layerFilter: (l) => l === playgroundLayer,
      });
      mapContainer.style.cursor = hit ? 'pointer' : '';
    });

    // Standalone: fetch playgrounds and fit to region
    if (ownSource) {
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
  });

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
</style>
