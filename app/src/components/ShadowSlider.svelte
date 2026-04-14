<script>
  // Shadow simulation component.
  // Month/hour sliders update the WMS shadow layer when a GeoServer URL is configured.
  // Per-playground shadow statistics require shadow_MM_HH columns from GeoServer
  // (see processing/sql/shadow_processing.sql) — not yet available in this setup.

  import { onDestroy } from 'svelte';
  import { Image as ImageLayer } from 'ol/layer.js';
  import ImageWMS from 'ol/source/ImageWMS.js';
  import { mapStore } from '../stores/map.js';
  import { geoServerUrl, geoServerWorkspace } from '../lib/config.js';

  /** @type {Object|null} Playground attributes — used when shadow columns are available. */
  export let attr = null;

  const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

  // Valid hours per month (1–6, mirrored second half of year)
  const VALID_HOURS = {
    1: [11, 13, 15],
    2: [9, 11, 13, 15],
    3: [9, 11, 13, 15, 17],
    4: [9, 11, 13, 15, 17],
    5: [9, 11, 13, 15, 17, 19],
    6: [9, 11, 13, 15, 17, 19],
  };

  function getValidMonth(m) {
    // Mirror second half of year: Jul(7)→6, Aug(8)→5, …, Dec(12)→1
    if (m > 6) return 13 - m;
    return Math.max(1, m);
  }

  function clampHour(hour, month) {
    const vm = getValidMonth(month);
    const allowed = VALID_HOURS[vm];
    const rounded = [9, 11, 13, 15, 17, 19].find(h => h >= hour) ?? 19;
    if (rounded < allowed[0]) return allowed[0];
    if (rounded > allowed[allowed.length - 1]) return allowed[allowed.length - 1];
    return rounded;
  }

  const now = new Date();
  let month = now.getMonth() + 1;
  let hour  = clampHour(Math.max(9, Math.ceil(now.getHours() / 2) * 2 - 1), month);

  $: validMonth = getValidMonth(month);
  $: hour = clampHour(hour, month);

  // ── WMS layer (GeoServer optional) ────────────────────────────────────────
  let shadowLayer = null;
  let shadowSource = null;

  function getLayerString(m, h) {
    const vm = getValidMonth(m);
    const vh = clampHour(h, m);
    const hs = vh < 10 ? `0${vh}` : `${vh}`;
    return `${geoServerWorkspace}:shadow_0${vm}_${hs}`;
  }

  $: if (geoServerUrl && $mapStore) {
    ensureShadowLayer($mapStore);
  }

  $: if (shadowSource) {
    const layerString = getLayerString(month, hour);
    shadowSource.updateParams({ LAYERS: layerString, _t: Date.now() });
  }

  function ensureShadowLayer(map) {
    if (shadowLayer) return;
    shadowSource = new ImageWMS({
      url: `${geoServerUrl}/geoserver/wms`,
      params: { LAYERS: getLayerString(month, hour), _t: 0 },
      ratio: 1,
      serverType: 'geoserver',
      crossOrigin: 'anonymous',
    });
    shadowLayer = new ImageLayer({
      source: shadowSource,
      opacity: 0.25,
      zIndex: 30,
    });
    map.addLayer(shadowLayer);
  }

  onDestroy(() => {
    if (shadowLayer && $mapStore) {
      $mapStore.removeLayer(shadowLayer);
    }
  });

  // ── Per-playground shadow data (requires GeoServer columns) ───────────────
  $: shadowValue = (() => {
    if (!attr) return null;
    const vm = getValidMonth(month);
    const vh = clampHour(hour, month);
    const key = `shadow_0${vm}_${vh < 10 ? '0' + vh : vh}`;
    const val = attr[key];
    return (val != null && !isNaN(val)) ? Math.round(val) : null;
  })();

  const objShadowDesc = {
    0:'gar kein Schatten', 10:'sehr wenig Schatten', 20:'wenig Schatten',
    30:'eher wenig Schatten', 40:'mäßig viel Schatten', 50:'mittel viel Schatten',
    60:'eher viel Schatten', 70:'viel Schatten', 80:'sehr viel Schatten',
    90:'fast nur Schatten', 100:'nur Schatten',
  };

  $: shadowDesc = shadowValue != null
    ? objShadowDesc[Math.floor(shadowValue / 10) * 10] ?? ''
    : null;
</script>

<div class="shadow-slider">
  <!-- Month slider -->
  <div class="slider-row">
    <span class="slider-label">{MONTHS[month - 1]}</span>
    <input type="range" min="1" max="12" bind:value={month} class="form-range flex-1" />
  </div>

  <!-- Hour slider -->
  <div class="slider-row">
    <span class="slider-label">{hour} Uhr</span>
    <input type="range" min="9" max="19" step="2" bind:value={hour} class="form-range flex-1" />
  </div>

  <!-- Shadow bar (only when data available) -->
  {#if shadowValue != null}
    <div class="progress mt-2" style="height:22px; background:#e0e0e0;"
         role="progressbar" aria-valuenow={shadowValue} aria-valuemin="0" aria-valuemax="100"
         aria-label="Schattenanteil">
      <div class="progress-bar progress-bar-striped bg-primary" style="width:{shadowValue}%"></div>
    </div>
    <p class="text-muted mt-1 mb-0" style="font-size:0.75rem;">
      <strong>{shadowValue} %</strong> — {shadowDesc}
    </p>
  {:else}
    <p class="text-muted mt-2 mb-0" style="font-size:0.75rem;">
      {#if geoServerUrl}
        Schattendaten werden geladen …
      {:else}
        Schattendaten erfordern eine GeoServer-Anbindung.
        <a href="https://github.com/mfuhrmann/spielplatzkarte/blob/main/processing/sql/shadow_processing.sql"
           target="_blank" rel="noopener" class="link-secondary">Mehr erfahren</a>
      {/if}
    </p>
  {/if}
</div>

<style>
  .shadow-slider { font-size: 0.85rem; }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
  }

  .slider-label {
    width: 3.5rem;
    font-size: 0.8rem;
    color: #495057;
    flex-shrink: 0;
  }

  .flex-1 { flex: 1; }
</style>
