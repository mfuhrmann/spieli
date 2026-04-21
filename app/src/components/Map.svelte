<script>
  import { onMount, onDestroy } from 'svelte';
  import { Map, View } from 'ol';
  import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer.js';
  import VectorSource from 'ol/source/Vector.js';
  import XYZ from 'ol/source/XYZ.js';
  import GeoJSON from 'ol/format/GeoJSON.js';
  import { transform } from 'ol/proj';
  import { ScaleLine, defaults as defaultControls } from 'ol/control.js';
  import { defaults as defaultInteractions } from 'ol/interaction/defaults';

  import { mapZoom, mapMinZoom, apiBaseUrl } from '../lib/config.js';
  import { playgroundStyleFn, selectionStyle, equipmentLayerStyleFn, treeStyle } from '../lib/vectorStyles.js';
  import { selection } from '../stores/selection.js';
  import { mapStore } from '../stores/map.js';
  import { playgroundSourceStore } from '../stores/playgroundSource.js';
  import { filterStore, matchesFilters } from '../stores/filters.js';
  import { overlayFeaturesStore } from '../stores/overlayLayer.js';
  import { debounce } from '../lib/utils.js';

  // Props: the source is injected; Map itself never loads data.
  /** @type {VectorSource | null} - when provided, the map uses this source instead of creating one */
  export let playgroundSource = null;
  /** Backend URL used for selection — standalone passes apiBaseUrl, hub passes per-feature URL */
  export let defaultBackendUrl = apiBaseUrl;
  
  /** Hover callback: (feature, pixel) => void */
  export let onhover = null;
  /** Clear hover callback: () => void */
  export let onclearhover = null;
  /** Equipment hover callback: (feature, pixel) => void */
  export let onequipmenthover = null;
  /** Clear equipment hover callback: () => void */
  export let onclearequipmenthover = null;

  let mapContainer;
  let olMap = null;
  let playgroundLayer = null; // exposed for filter reactivity
  let equipmentLayer = null;  // overlay: equipment points/polygons
  let treeLayer = null;       // overlay: tree dots
  let overlayUnsubscribe = null;

  onMount(async () => {
    // The shell owns the source; fall back to an empty one so the map still
    // renders in degraded paths (e.g. tests that mount Map without a parent).
    const source = playgroundSource ?? new VectorSource();

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

    // Subscribe to overlay features store — rebuild equipment/tree layers on each change
    overlayUnsubscribe = overlayFeaturesStore.subscribe(({ equipment, trees }) => {
      if (equipmentLayer) { olMap.removeLayer(equipmentLayer); equipmentLayer = null; }
      if (treeLayer)      { olMap.removeLayer(treeLayer);      treeLayer      = null; }

      if (equipment.length > 0) {
        const src = new VectorSource();
        const olFeatures = new GeoJSON().readFeatures(
          { type: 'FeatureCollection', features: equipment },
          { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
        );
        src.addFeatures(olFeatures);
        equipmentLayer = new VectorLayer({
          source: src,
          zIndex: 20,
          style: equipmentLayerStyleFn,
          properties: { kind: 'overlay' },
        });
        olMap.addLayer(equipmentLayer);
      }

      if (trees.length > 0) {
        const src = new VectorSource();
        src.addFeatures(new GeoJSON().readFeatures(
          { type: 'FeatureCollection', features: trees },
          { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
        ));
        treeLayer = new VectorLayer({ source: src, zIndex: 15, style: () => treeStyle });
        olMap.addLayer(treeLayer);
      }
    });

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
    let lastEquipHoverFeature = null;
    const debouncedHover = debounce((feature, pixel) => {
      if (onhover) onhover(feature, pixel);
    }, 100);

    olMap.on('pointermove', (evt) => {
      // Overlay hit-test: any layer tagged with `kind: 'overlay'` participates
      // (equipment points, standalone pitches contributed by the shell).
      const overlayHit = olMap.forEachFeatureAtPixel(evt.pixel, f => f, {
        layerFilter: l => l.get('kind') === 'overlay',
      });
      const playHit = olMap.forEachFeatureAtPixel(evt.pixel, f => f, {
        layerFilter: l => l === playgroundLayer,
      });

      mapContainer.style.cursor = (overlayHit || playHit) ? 'pointer' : '';

      // Overlay hover takes priority
      if (overlayHit !== lastEquipHoverFeature) {
        lastEquipHoverFeature = overlayHit;
        if (overlayHit) {
          if (onequipmenthover) onequipmenthover(overlayHit, evt.pixel);
          if (lastHoverFeature) { lastHoverFeature = null; if (onclearhover) onclearhover(); }
        } else {
          if (onclearequipmenthover) onclearequipmenthover();
        }
      }

      // Playground hover (only when not hovering an overlay feature)
      if (!overlayHit) {
        if (playHit && playHit !== lastHoverFeature) {
          lastHoverFeature = playHit;
          debouncedHover(playHit, evt.pixel);
        } else if (!playHit && lastHoverFeature) {
          lastHoverFeature = null;
          debouncedHover.cancel();
          if (onclearhover) onclearhover();
        }
      }
    });

    mapContainer.addEventListener('pointerleave', () => {
      debouncedHover.cancel();
      if (lastEquipHoverFeature) {
        lastEquipHoverFeature = null;
        if (onclearequipmenthover) onclearequipmenthover();
      }
      if (lastHoverFeature) {
        lastHoverFeature = null;
        mapContainer.style.cursor = '';
        if (onclearhover) onclearhover();
      }
    });

    // Publish the source so dependent components (filter reactivity,
    // NearbyPlaygrounds fallback, URL-hash restore in AppShell) can react.
    playgroundSourceStore.set(source);
  });

  onDestroy(() => {
    if (overlayUnsubscribe) overlayUnsubscribe();
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
