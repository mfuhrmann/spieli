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
  import {
    playgroundStyleFn,
    selectionStyle,
    equipmentLayerStyleFn,
    treeStyle,
    clusterTierStyleFn,
    centroidTierStyleFn,
  } from '../lib/vectorStyles.js';
  import { selection } from '../stores/selection.js';
  import { mapStore } from '../stores/map.js';
  import { playgroundSourceStore } from '../stores/playgroundSource.js';
  import { activeTierStore } from '../stores/tier.js';
  import { filterStore, matchesFilters } from '../stores/filters.js';
  import { overlayFeaturesStore } from '../stores/overlayLayer.js';
  import { debounce } from '../lib/utils.js';

  // Props: the sources are injected by the shell; Map itself never loads data.
  /** @type {VectorSource | null} - polygon-tier source (zoom ≥ 14) */
  export let playgroundSource = null;
  /** @type {VectorSource | null} - cluster-tier source (zoom ≤ 10) */
  export let clusterSource = null;
  /** @type {VectorSource | null} - centroid-tier source (zoom 11–13) */
  export let centroidSource = null;
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
  let playgroundLayer = null; // polygon tier (zoom ≥ 14) — exposed for filter reactivity
  let clusterLayer = null;    // cluster tier (zoom ≤ 10) — §3
  let centroidLayer = null;   // centroid tier (zoom 11–13) — §3
  let equipmentLayer = null;  // overlay: equipment points/polygons
  let treeLayer = null;       // overlay: tree dots
  let overlayUnsubscribe = null;
  let tierUnsubscribe = null;

  onMount(async () => {
    // The shell owns the sources; fall back to empty ones so the map still
    // renders in degraded paths (e.g. tests that mount Map without a parent).
    const polygonSrc  = playgroundSource ?? new VectorSource();
    const clusterSrc  = clusterSource    ?? new VectorSource();
    const centroidSrc = centroidSource   ?? new VectorSource();

    // All three tier layers start hidden; the activeTierStore subscription
    // below reveals the right one once the orchestrator has chosen a tier.
    playgroundLayer = new VectorLayer({
      source: polygonSrc,
      zIndex: 10,
      style: playgroundStyleFn,
      visible: false,
    });
    centroidLayer = new VectorLayer({
      source: centroidSrc,
      zIndex: 11,
      style: centroidTierStyleFn,
      visible: false,
    });
    clusterLayer = new VectorLayer({
      source: clusterSrc,
      zIndex: 12,
      style: clusterTierStyleFn,
      visible: false,
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
      layers: [basemap, playgroundLayer, centroidLayer, clusterLayer],
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

    // Click handler: select playground on click. Cluster/centroid tier clicks
    // are inert for now — §4.5 wires cluster zoom-to-extent and §5 wires
    // centroid select — but they must NOT fall through to `selection.clear()`.
    olMap.on('click', (evt) => {
      const polygonHit = olMap.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === playgroundLayer,
      });
      if (polygonHit) {
        const backendUrl = polygonHit.get('_backendUrl') ?? defaultBackendUrl;
        selection.select(polygonHit, backendUrl);
        view.fit(polygonHit.getGeometry().getExtent(), {
          padding: [40, 40, 40, 420], // right/top/bottom clear; 420 = sidebar width + margin
          maxZoom: 19,
          duration: 400,
        });
        return;
      }
      const tierHit = olMap.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === clusterLayer || l === centroidLayer,
      });
      if (tierHit) return; // deferred to §4.5 / §5
      selection.clear();
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

    // Tier-driven layer visibility. playgroundSourceStore is published only
    // while the polygon tier is active (§3.6) so dependent widgets don't
    // see an empty source at cluster/centroid zooms. `tier === null` means
    // the orchestrator hasn't run yet — keep all layers hidden.
    tierUnsubscribe = activeTierStore.subscribe(tier => {
      if (!playgroundLayer) return;
      if (tier === null) {
        playgroundLayer.setVisible(false);
        centroidLayer.setVisible(false);
        clusterLayer.setVisible(false);
        playgroundSourceStore.set(null);
        return;
      }
      playgroundLayer.setVisible(tier === 'polygon');
      centroidLayer.setVisible(tier === 'centroid');
      clusterLayer.setVisible(tier === 'cluster');
      playgroundSourceStore.set(tier === 'polygon' ? polygonSrc : null);
    });
  });

  onDestroy(() => {
    if (overlayUnsubscribe) overlayUnsubscribe();
    if (tierUnsubscribe) tierUnsubscribe();
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
