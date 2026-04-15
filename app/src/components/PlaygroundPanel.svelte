<script>
  import { onMount } from 'svelte';
  import OpeningHours from 'opening_hours';
  import { transform } from 'ol/proj';

  import { selection } from '../stores/selection.js';
  import { fetchPlaygroundEquipment, fetchNearbyPOIs } from '../lib/api.js';
  import { playgroundCompleteness } from '../lib/completeness.js';
  import { poiRadiusM } from '../lib/config.js';
  import { getPlaygroundTitle, getPlaygroundLocation } from '../lib/playgroundHelpers.js';
  import EquipmentList from './EquipmentList.svelte';
  import POIPanel from './POIPanel.svelte';
  import PanoramaxViewer from './PanoramaxViewer.svelte';
  import ReviewsPanel from './ReviewsPanel.svelte';
  import ShadowSlider from './ShadowSlider.svelte';

  // ── Derived state from selection store ────────────────────────────────────
  $: feature    = $selection.feature;
  $: backendUrl = $selection.backendUrl;
  $: attr       = feature ? feature.getProperties() : null;

  // ── Async data ────────────────────────────────────────────────────────────
  let equipmentFeatures = [];
  let pois = [];
  let equipmentLoading = false;
  let poisLoading = false;

  // Centre of selected playground in WGS84
  let centerLat = 0, centerLon = 0;

  // Generation counter — incremented on each new selection so stale responses are discarded.
  let loadGen = 0;

  $: if (feature) {
    loadData(feature, backendUrl);
  } else {
    equipmentFeatures = [];
    pois = [];
  }

  async function loadData(feat, url) {
    const geom = feat.getGeometry();
    if (!geom) { equipmentFeatures = []; pois = []; return; }

    const gen = ++loadGen;
    const ext = geom.getExtent();
    const [lon, lat] = transform(
      [(ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2],
      'EPSG:3857', 'EPSG:4326'
    );
    centerLat = lat;
    centerLon = lon;

    equipmentLoading = true;
    poisLoading = true;

    try {
      const geojson = await fetchPlaygroundEquipment(ext, feat.get('osm_id'), url);
      if (gen === loadGen) equipmentFeatures = geojson.features ?? [];
    } catch (err) {
      console.warn('Equipment load failed:', err);
      if (gen === loadGen) equipmentFeatures = [];
    } finally {
      if (gen === loadGen) equipmentLoading = false;
    }

    try {
      const result = await fetchNearbyPOIs(lat, lon, poiRadiusM, feat.get('osm_id'), url);
      if (gen === loadGen) pois = result;
    } catch (err) {
      console.warn('POI load failed:', err);
      if (gen === loadGen) pois = [];
    } finally {
      if (gen === loadGen) poisLoading = false;
    }
  }

  // ── ESC to close ──────────────────────────────────────────────────────────
  function handleKeydown(e) {
    if (e.key === 'Escape' && feature) selection.clear();
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  // ── Completeness badge ────────────────────────────────────────────────────
  const COMPLETENESS = {
    complete: { cls: 'completeness-badge--complete', label: 'Daten vollständig' },
    partial:  { cls: 'completeness-badge--partial',  label: 'Daten teilweise erfasst' },
    missing:  { cls: 'completeness-badge--missing',  label: 'Daten fehlen' },
  };
  $: completeness = attr ? COMPLETENESS[playgroundCompleteness(attr)] : null;

  // ── Opening hours ─────────────────────────────────────────────────────────
  // Returns { color, label, suffix, error } so the template can render without
  // {@html}. label includes the ● bullet; suffix is trailing plain text (e.g.
  // "· Öffnet morgen um 09:00") rendered outside the coloured span.
  function openingHoursState(ohStr) {
    const fmt = d => d.toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' });
    const dayLabel = (d, now) => {
      if (d.toDateString() === now.toDateString()) return 'heute';
      const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
      if (d.toDateString() === tomorrow.toDateString()) return 'morgen';
      const diff = Math.round((d - now) / 86400000);
      if (diff <= 6) return d.toLocaleDateString('de', { weekday: 'long' });
      return d.toLocaleDateString('de', { weekday: 'short', day: '2-digit', month: '2-digit' });
    };
    try {
      const oh = new OpeningHours(ohStr, { address: { country_code: 'de' } });
      const now = new Date();
      const isOpen = oh.getState(now);
      const next = oh.getNextChange(now);
      if (ohStr.trim() === '24/7') return { color: '#16a34a', label: '● Immer geöffnet', suffix: null, error: false };
      if (isOpen) {
        const label = next ? `● Geöffnet bis ${fmt(next)}` : '● Geöffnet';
        return { color: '#16a34a', label, suffix: null, error: false };
      }
      const suffix = next ? ` · Öffnet ${dayLabel(next, now)} um ${fmt(next)}` : null;
      return { color: '#dc2626', label: '● Geschlossen', suffix, error: false };
    } catch {
      return { color: null, label: ohStr, suffix: null, error: true };
    }
  }

  // ── Attribute helpers ─────────────────────────────────────────────────────
  const surfaceLabels = {
    sand:'Sand', grass:'Rasen', wood_chips:'Holzschnitzel', bark_mulch:'Rindenmulch',
    rubber:'Gummigranulat', asphalt:'Asphalt', concrete:'Beton',
    paving_stones:'Pflastersteine', tartan:'Tartan', artificial_turf:'Kunstgras',
    gravel:'Kies', fine_gravel:'Feinkies', dirt:'Erde', compacted:'verdichtet',
  };
  const accessDict = {
    yes:'öffentlich', private:'privat', customers:'nur für Gäste',
    no:'nicht zugänglich', permissive:'öffentlich geduldet',
    destination:'nur für Anlieger', residents:'nur für Anwohnende',
  };
  const privateDict = {
    residents:'nur für Anwohnende', students:'nur für Schule',
    employees:'nur für Mitarbeitende',
  };

  $: accessLabel = attr
    ? (privateDict[attr.private] ?? accessDict[attr.access] ?? 'unbekannt')
    : '';

  $: descriptionParts = (() => {
    if (!attr) return [];
    const parts = [];
    const desc = attr['description:de'] && attr.description !== attr['description:de']
      ? (attr.description ? `${attr.description} | ${attr['description:de']}` : attr['description:de'])
      : attr.description;
    if (desc) parts.push(desc);
    if (attr.note) parts.push(`✏ ${attr.note}`);
    if (attr.fixme) parts.push(`🔧 ${attr.fixme}`);
    return parts;
  })();

  $: mcOsmType = attr ? ({ W:'way', R:'relation', N:'node' }[attr.osm_type] ?? 'way') : 'way';
  $: mcUrl = attr ? `https://mapcomplete.org/playgrounds.html#${mcOsmType}/${attr.osm_id}` : '';

  // ── Accordion state ───────────────────────────────────────────────────────
  let openSections = new Set(['photos', 'equipment', 'pois']);
  function toggleSection(id) {
    const next = new Set(openSections);
    next.has(id) ? next.delete(id) : next.add(id);
    openSections = next;
  }

  // ── Panoramax UUIDs from OSM tags ─────────────────────────────────────────
  $: panoramaxUuids = (() => {
    if (!attr) return [];
    const uuids = [];
    if (attr['panoramax']) uuids.push(attr['panoramax']);
    for (let i = 1; i <= 9; i++) {
      const v = attr[`panoramax:${i}`];
      if (v) uuids.push(v);
    }
    return uuids;
  })();
</script>

{#if feature && attr}
  <aside class="info-panel">
    <div class="info-panel__header">
      <div>
        <div class="fw-semibold">{getPlaygroundTitle(attr)}</div>
        {#if completeness}
          <span class="completeness-badge {completeness.cls}">{completeness.label}</span>
        {/if}
      </div>
      <button class="btn-close" aria-label="Schließen" onclick={() => selection.clear()}></button>
    </div>

    <div class="info-panel__body">

      <!-- Location / description -->
      {#if getPlaygroundLocation(attr)}
        <p class="text-muted small mb-1"><i>{getPlaygroundLocation(attr)}</i></p>
      {/if}
      {#each descriptionParts as part}
        <p class="small mb-1"><i>{part}</i></p>
      {/each}

      <!-- Key facts -->
      <dl class="row small mb-2">
        <dt class="col-5">Größe</dt>
        <dd class="col-7">{attr.area > 0 ? `${Math.round(attr.area / 10) * 10 || attr.area} m²` : 'unbekannt'}</dd>

        <dt class="col-5">Zugänglichkeit</dt>
        <dd class="col-7">{accessLabel}</dd>

        {#if attr.surface}
          <dt class="col-5">Bodenbelag</dt>
          <dd class="col-7">{surfaceLabels[attr.surface] ?? attr.surface}</dd>
        {/if}

        {#if attr.tree_count > 0}
          <dt class="col-5">Bäume mind.</dt>
          <dd class="col-7">{attr.tree_count}</dd>
        {/if}

        {#if attr.min_age || attr.max_age}
          <dt class="col-5">Alter</dt>
          <dd class="col-7">
            {#if attr.min_age && attr.max_age}{attr.min_age}–{attr.max_age} Jahre
            {:else if attr.min_age}ab {attr.min_age} Jahren
            {:else}bis {attr.max_age} Jahre{/if}
          </dd>
        {/if}

        {#if attr.opening_hours}
          {@const oh = openingHoursState(attr.opening_hours)}
          <dt class="col-5">Öffnungszeiten</dt>
          <dd class="col-7">
            {#if oh.error}
              <code style="font-size:smaller">{oh.label}</code>
            {:else}
              <span style:color={oh.color}>{oh.label}</span>{oh.suffix ?? ''}
            {/if}
          </dd>
        {/if}

        {#if attr.operator}
          <dt class="col-5">Betreiber</dt>
          <dd class="col-7" data-testid="operator-value">
            {#if attr['operator:wikidata']}
              <a href="https://www.wikidata.org/wiki/{attr['operator:wikidata']}"
                 target="_blank" rel="noopener" class="link-secondary">{attr.operator}</a>
            {:else}
              {attr.operator}
            {/if}
          </dd>
        {/if}

        {#if attr['contact:email'] || attr.email || attr['contact:phone'] || attr.phone}
          <dt class="col-5">Kontakt</dt>
          <dd class="col-7">
            {#if attr['contact:phone'] || attr.phone}
              {@const phone = attr['contact:phone'] || attr.phone}
              {#if /^\+?\d/.test(phone.trim())}
                <a href="tel:{phone}" class="link-secondary">{phone}</a>
              {:else}{phone}{/if}
            {/if}
            {#if (attr['contact:email'] || attr.email) && (attr['contact:phone'] || attr.phone)} · {/if}
            {#if attr['contact:email'] || attr.email}
              {@const email = attr['contact:email'] || attr.email}
              {#if email.includes('@') && !/^javascript:/i.test(email.trim())}
                <a href="mailto:{email}" class="link-secondary">{email}</a>
              {:else}{email}{/if}
            {/if}
          </dd>
        {/if}

        <dt class="col-5">OSM ID</dt>
        <dd class="col-7">
          <a href="https://www.openstreetmap.org/{mcOsmType}/{attr.osm_id}"
             target="_blank" rel="noopener" class="link-secondary">{attr.osm_id}</a>
        </dd>
      </dl>

      <div class="mb-2">
        <a href={mcUrl} target="_blank" rel="noopener" class="mc-add-link small">
          <span class="bi bi-pencil"></span> Bei MapComplete bearbeiten
        </a>
      </div>

      <!-- Photos accordion -->
      <div class="accordion-section">
        <button class="accordion-toggle" onclick={() => toggleSection('photos')}>
          <span class="bi {openSections.has('photos') ? 'bi-chevron-down' : 'bi-chevron-right'}"></span>
          Bilder
        </button>
        {#if openSections.has('photos')}
          <div class="accordion-body">
            <PanoramaxViewer uuids={panoramaxUuids} {mcUrl} />
          </div>
        {/if}
      </div>

      <!-- Equipment accordion -->
      <div class="accordion-section">
        <button class="accordion-toggle" onclick={() => toggleSection('equipment')}>
          <span class="bi {openSections.has('equipment') ? 'bi-chevron-down' : 'bi-chevron-right'}"></span>
          Ausstattung
        </button>
        {#if openSections.has('equipment')}
          <div class="accordion-body">
            {#if equipmentLoading}
              <small class="text-muted"><i>Wird geladen …</i></small>
            {:else}
              <EquipmentList features={equipmentFeatures} playgroundAttr={attr} />
            {/if}
          </div>
        {/if}
      </div>

      <!-- POI accordion -->
      <div class="accordion-section">
        <button class="accordion-toggle" onclick={() => toggleSection('pois')}>
          <span class="bi {openSections.has('pois') ? 'bi-chevron-down' : 'bi-chevron-right'}"></span>
          Umfeld
        </button>
        {#if openSections.has('pois')}
          <div class="accordion-body">
            {#if poisLoading}
              <small class="text-muted"><i>Wird geladen …</i></small>
            {:else}
              <POIPanel {pois} {centerLat} {centerLon} />
            {/if}
          </div>
        {/if}
      </div>

      <!-- Shadow accordion -->
      <div class="accordion-section">
        <button class="accordion-toggle" onclick={() => toggleSection('shadow')}>
          <span class="bi {openSections.has('shadow') ? 'bi-chevron-down' : 'bi-chevron-right'}"></span>
          Schattigkeit
        </button>
        {#if openSections.has('shadow')}
          <div class="accordion-body">
            <ShadowSlider {attr} />
          </div>
        {/if}
      </div>

      <!-- Reviews accordion -->
      <div class="accordion-section">
        <button class="accordion-toggle" onclick={() => toggleSection('reviews')}>
          <span class="bi {openSections.has('reviews') ? 'bi-chevron-down' : 'bi-chevron-right'}"></span>
          Bewertungen
        </button>
        {#if openSections.has('reviews')}
          <div class="accordion-body">
            <ReviewsPanel lat={centerLat} lon={centerLon} />
          </div>
        {/if}
      </div>

    </div>
  </aside>
{/if}

<style>
  .info-panel {
    position: absolute;
    top: 0; left: 0;
    width: 360px;
    height: 100%;
    background: #fff;
    box-shadow: 2px 0 8px rgba(0,0,0,0.15);
    z-index: 100;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .info-panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 1rem;
    border-bottom: 1px solid #dee2e6;
    position: sticky;
    top: 0;
    background: #fff;
    z-index: 1;
  }

  .info-panel__body {
    padding: 1rem;
    flex: 1;
  }

  .completeness-badge {
    display: inline-block;
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 999px;
    margin-top: 2px;
  }
  .completeness-badge--complete { background: #dcfce7; color: #166534; }
  .completeness-badge--partial  { background: #fef9c3; color: #854d0e; }
  .completeness-badge--missing  { background: #fee2e2; color: #991b1b; }

  .accordion-section { margin-bottom: 0.5rem; }
  .accordion-toggle {
    background: none; border: none; padding: 0.25rem 0;
    font-weight: 600; font-size: 0.85rem; color: #495057;
    cursor: pointer; display: flex; align-items: center; gap: 0.35rem;
    width: 100%;
  }
  .accordion-toggle:hover { color: #212529; }
  .accordion-body { padding: 0.5rem 0 0.25rem 0.75rem; }

  .mc-add-link { color: #6c757d; text-decoration: none; }
  .mc-add-link:hover { color: #343a40; text-decoration: underline; }
</style>
