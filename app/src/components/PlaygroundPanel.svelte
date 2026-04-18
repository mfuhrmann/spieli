<script>
  import { onMount } from 'svelte';
  import OpeningHours from 'opening_hours';
  import { transform } from 'ol/proj';
  import { X, Share2, Check, ChevronDown, ChevronRight, Pencil, MapPin, Clock, Trees, Ruler, Users, Phone, Mail, ExternalLink, Image, Package, Navigation, Star } from 'lucide-svelte';

  import { selection } from '../stores/selection.js';
  import { fetchPlaygroundEquipment, fetchNearbyPOIs } from '../lib/api.js';
  import { playgroundCompleteness } from '../lib/completeness.js';
  import { poiRadiusM } from '../lib/config.js';
  import { getPlaygroundTitle, getPlaygroundLocation } from '../lib/playgroundHelpers.js';
  import { cn } from '../lib/utils.js';
  import EquipmentList from './EquipmentList.svelte';
  import POIPanel from './POIPanel.svelte';
  import PanoramaxViewer from './PanoramaxViewer.svelte';
  import ReviewsPanel from './ReviewsPanel.svelte';
  import Badge from './ui/Badge.svelte';
  import Button from './ui/Button.svelte';

  /** When true, renders without the fixed sidebar wrapper (for bottom sheet embedding) */
  export let embedded = false;

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
    if (e.key === 'Escape' && feature && !embedded) selection.clear();
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  // ── Completeness badge ────────────────────────────────────────────────────
  const COMPLETENESS = {
    complete: { variant: 'success', label: 'Vollständig' },
    partial:  { variant: 'warning', label: 'Teilweise erfasst' },
    missing:  { variant: 'destructive', label: 'Daten fehlen' },
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
      if (ohStr.trim() === '24/7') return { open: true, text: 'Immer geöffnet' };
      if (isOpen) {
        const label = next ? `Geöffnet bis ${fmt(next)}` : 'Geöffnet';
        return { open: true, text: label };
      }
      if (next) return { open: false, text: `Geschlossen · Öffnet ${dayLabel(next, now)} um ${fmt(next)}` };
      return { open: false, text: 'Geschlossen' };
    } catch {
      return { open: null, text: ohStr };
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
    if (attr.note) parts.push(`${attr.note}`);
    if (attr.fixme) parts.push(`${attr.fixme}`);
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

  $: openingHoursInfo = attr?.opening_hours ? openingHoursState(attr.opening_hours) : null;

  // ── Share button ──────────────────────────────────────────────────────────
  let shareConfirmed = false;
  let shareTimeout;

  async function sharePlayground() {
    if (!attr) return;
    const url = `${window.location.origin}${window.location.pathname}#${attr.osm_type}${attr.osm_id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: getPlaygroundTitle(attr), url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      } else {
        // fallback for non-secure contexts
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      shareConfirmed = true;
      clearTimeout(shareTimeout);
      shareTimeout = setTimeout(() => { shareConfirmed = false; }, 2000);
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('Share failed:', err);
    }
  }
</script>

{#if feature && attr}
  <aside class={cn(
    embedded ? '' : 'info-panel',
    embedded ? '' : 'lg:flex'
  )}>
    <!-- Header -->
    {#if !embedded}
      <div class="info-panel__header">
        <div class="flex-1 min-w-0">
          <h2 class="text-lg font-semibold text-foreground leading-tight">{getPlaygroundTitle(attr)}</h2>
          {#if getPlaygroundLocation(attr)}
            <p class="text-sm text-muted-foreground mt-0.5">{getPlaygroundLocation(attr)}</p>
          {/if}
          {#if completeness}
            <Badge variant={completeness.variant} class="mt-2">{completeness.label}</Badge>
          {/if}
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button class="panel-icon-btn" onclick={sharePlayground} aria-label="Link kopieren">
            {#if shareConfirmed}
              <Check class="h-5 w-5 text-green-600" />
            {:else}
              <Share2 class="h-5 w-5" />
            {/if}
          </button>
          <button class="panel-icon-btn" onclick={() => selection.clear()} aria-label="Schließen">
            <X class="h-5 w-5" />
          </button>
        </div>
      </div>
    {:else}
      <!-- Embedded header (bottom sheet) -->
      <div class="flex items-start justify-between gap-2 mb-4">
        <div class="flex-1 min-w-0">
          <h2 class="text-lg font-semibold text-foreground leading-tight">{getPlaygroundTitle(attr)}</h2>
          {#if getPlaygroundLocation(attr)}
            <p class="text-sm text-muted-foreground mt-0.5">{getPlaygroundLocation(attr)}</p>
          {/if}
          {#if completeness}
            <Badge variant={completeness.variant} class="mt-2">{completeness.label}</Badge>
          {/if}
        </div>
        <button class="panel-icon-btn shrink-0" onclick={sharePlayground} aria-label="Link kopieren">
          {#if shareConfirmed}
            <Check class="h-5 w-5 text-green-600" />
          {:else}
            <Share2 class="h-5 w-5" />
          {/if}
        </button>
      </div>
    {/if}

    <div class={cn(embedded ? '' : 'info-panel__body')}>
      <!-- Description -->
      {#each descriptionParts as part}
        <p class="text-sm text-muted-foreground italic mb-3">{part}</p>
      {/each}

      <!-- Quick Facts Grid -->
      <div class="grid grid-cols-2 gap-3 mb-4">
        {#if attr.area > 0}
          <div class="flex items-center gap-2 text-sm">
            <Ruler class="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{Math.round(attr.area / 10) * 10 || attr.area} m²</span>
          </div>
        {/if}
        
        <div class="flex items-center gap-2 text-sm">
          <Users class="h-4 w-4 text-muted-foreground shrink-0" />
          <span>{accessLabel}</span>
        </div>

        {#if attr.surface}
          <div class="flex items-center gap-2 text-sm">
            <MapPin class="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{surfaceLabels[attr.surface] ?? attr.surface}</span>
          </div>
        {/if}

        {#if attr.tree_count > 0}
          <div class="flex items-center gap-2 text-sm">
            <Trees class="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{attr.tree_count} Bäume</span>
          </div>
        {/if}

        {#if attr.min_age || attr.max_age}
          <div class="flex items-center gap-2 text-sm col-span-2">
            <Users class="h-4 w-4 text-muted-foreground shrink-0" />
            <span>
              {#if attr.min_age && attr.max_age}{attr.min_age}–{attr.max_age} Jahre
              {:else if attr.min_age}ab {attr.min_age} Jahren
              {:else}bis {attr.max_age} Jahre{/if}
            </span>
          </div>
        {/if}
      </div>

      <!-- Opening Hours -->
      {#if openingHoursInfo}
        <div class="flex items-center gap-2 text-sm mb-4 p-2 rounded-lg bg-muted/50">
          <Clock class="h-4 w-4 shrink-0 {openingHoursInfo.open ? 'text-success' : 'text-destructive'}" />
          <span class={openingHoursInfo.open ? 'text-success' : 'text-destructive'}>{openingHoursInfo.text}</span>
        </div>
      {/if}

      <!-- Contact Info -->
      {#if attr['contact:email'] || attr.email || attr['contact:phone'] || attr.phone || attr.operator}
        <div class="space-y-2 mb-4">
          {#if attr.operator}
            <div class="flex items-center gap-2 text-sm" data-testid="operator-value">
              <span class="text-muted-foreground">Betreiber:</span>
              {#if attr['operator:wikidata']}
                <a href="https://www.wikidata.org/wiki/{attr['operator:wikidata']}"
                   target="_blank" rel="noopener" class="text-primary hover:underline">{attr.operator}</a>
              {:else}
                <span>{attr.operator}</span>
              {/if}
            </div>
          {/if}
          {#if attr['contact:phone'] || attr.phone}
            {@const phone = attr['contact:phone'] || attr.phone}
            <div class="flex items-center gap-2 text-sm">
              <Phone class="h-4 w-4 text-muted-foreground" />
              {#if /^\+?\d/.test(phone.trim())}
                <a href="tel:{phone}" class="text-primary hover:underline">{phone}</a>
              {:else}{phone}{/if}
            </div>
          {/if}
          {#if attr['contact:email'] || attr.email}
            {@const email = attr['contact:email'] || attr.email}
            <div class="flex items-center gap-2 text-sm">
              <Mail class="h-4 w-4 text-muted-foreground" />
              {#if email.includes('@') && !/^javascript:/i.test(email.trim())}
                <a href="mailto:{email}" class="text-primary hover:underline">{email}</a>
              {:else}{email}{/if}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Edit Link -->
      <a href={mcUrl} target="_blank" rel="noopener" class="inline-flex items-center gap-2 text-sm text-primary hover:underline mb-4">
        <Pencil class="h-4 w-4" />
        Bei MapComplete bearbeiten
        <ExternalLink class="h-3 w-3" />
      </a>

      <!-- Accordion Sections -->
      <div class="border-t border-border">
        <!-- Photos -->
        <div class="border-b border-border">
          <button
            class="w-full flex items-center gap-2 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
            onclick={() => toggleSection('photos')}
          >
            {#if openSections.has('photos')}
              <ChevronDown class="h-4 w-4 text-muted-foreground" />
            {:else}
              <ChevronRight class="h-4 w-4 text-muted-foreground" />
            {/if}
            <Image class="h-4 w-4 text-muted-foreground" />
            Bilder
          </button>
          {#if openSections.has('photos')}
            <div class="pb-3">
              <PanoramaxViewer uuids={panoramaxUuids} {mcUrl} />
            </div>
          {/if}
        </div>

        <!-- Equipment -->
        <div class="border-b border-border">
          <button
            class="w-full flex items-center gap-2 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
            onclick={() => toggleSection('equipment')}
          >
            {#if openSections.has('equipment')}
              <ChevronDown class="h-4 w-4 text-muted-foreground" />
            {:else}
              <ChevronRight class="h-4 w-4 text-muted-foreground" />
            {/if}
            <Package class="h-4 w-4 text-muted-foreground" />
            Ausstattung
          </button>
          {#if openSections.has('equipment')}
            <div class="pb-3">
              {#if equipmentLoading}
                <p class="text-sm text-muted-foreground italic py-2">Wird geladen...</p>
              {:else}
                <EquipmentList features={equipmentFeatures} playgroundAttr={attr} />
              {/if}
            </div>
          {/if}
        </div>

        <!-- POIs -->
        <div class="border-b border-border">
          <button
            class="w-full flex items-center gap-2 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
            onclick={() => toggleSection('pois')}
          >
            {#if openSections.has('pois')}
              <ChevronDown class="h-4 w-4 text-muted-foreground" />
            {:else}
              <ChevronRight class="h-4 w-4 text-muted-foreground" />
            {/if}
            <Navigation class="h-4 w-4 text-muted-foreground" />
            Umfeld
          </button>
          {#if openSections.has('pois')}
            <div class="pb-3">
              {#if poisLoading}
                <p class="text-sm text-muted-foreground italic py-2">Wird geladen...</p>
              {:else}
                <POIPanel {pois} {centerLat} {centerLon} />
              {/if}
            </div>
          {/if}
        </div>

        <!-- Reviews -->
        <div class="border-b border-border">
          <button
            class="w-full flex items-center gap-2 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
            onclick={() => toggleSection('reviews')}
          >
            {#if openSections.has('reviews')}
              <ChevronDown class="h-4 w-4 text-muted-foreground" />
            {:else}
              <ChevronRight class="h-4 w-4 text-muted-foreground" />
            {/if}
            <Star class="h-4 w-4 text-muted-foreground" />
            Bewertungen
          </button>
          {#if openSections.has('reviews')}
            <div class="pb-3">
              <ReviewsPanel lat={centerLat} lon={centerLon} />
            </div>
          {/if}
        </div>
      </div>
    </div>
  </aside>
{/if}

<style>
  .info-panel {
    position: absolute;
    top: 0;
    left: 0;
    width: 380px;
    height: 100%;
    background: #ffffff;
    box-shadow: 4px 0 15px -3px rgb(0 0 0 / 0.1);
    z-index: 100;
    overflow-y: auto;
    display: none;
    flex-direction: column;
    border-right: 1px solid #e5e7eb;
    color-scheme: light;
    
    /* Force light theme variables */
    --color-background: #ffffff;
    --color-foreground: #1f2937;
    --color-card: #ffffff;
    --color-card-foreground: #1f2937;
    --color-popover: #ffffff;
    --color-popover-foreground: #1f2937;
    --color-muted: #f3f4f6;
    --color-muted-foreground: #6b7280;
    --color-border: #e5e7eb;
    --color-input: #e5e7eb;
  }

  .info-panel.lg\:flex {
    display: flex;
  }

  .info-panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem;
    border-bottom: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    background: #ffffff;
    z-index: 1;
  }

  .info-panel__body {
    padding: 1rem;
    flex: 1;
  }

  @media (max-width: 1023px) {
    .info-panel {
      display: none !important;
    }
  }

  .panel-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border: none;
    background: transparent;
    border-radius: 0.375rem;
    cursor: pointer;
    color: #6b7280;
    transition: background 0.15s, color 0.15s;
  }

  .panel-icon-btn:hover {
    background: #f3f4f6;
    color: #1f2937;
  }
</style>
