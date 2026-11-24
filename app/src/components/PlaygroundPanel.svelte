<script context="module">
  // Module-scoped cache so a single `get_meta()` per backend URL is shared
  // across every PlaygroundPanel mount (the panel re-mounts on every
  // selection cycle in standalone). Successful results stay cached for
  // the page lifetime; failures are NOT cached so a transient network
  // blip doesn't permanently hide the chip.
  const metaCache = new Map();
</script>

<script>
  // The playground detail panel, ordered by the parent's question (#1077):
  //   zone A — decide: header, photos, pills (incl. age), "what kids can do"
  //            (highlights, then activities)
  //            (or an invitation to contribute when nothing is known)
  //   zone B — go deeper: description, facts, equipment list, nearby, reviews
  //   zone C — background: operator, contact, data age, MapComplete
  // Mapping detail adds a tool block under the header; it never reorders.
  import { onMount, onDestroy, tick } from 'svelte';
  import { transform } from 'ol/proj';
  import { ChevronDown, ChevronRight, Package, Star, MessageCirclePlus } from 'lucide-svelte';
  import { _, locale } from 'svelte-i18n';
  import { tagValuesLabel } from '../lib/deviceLabel.js';

  import { selection } from '../stores/selection.js';
  import { mapStore } from '../stores/map.js';
  import { location } from '../stores/location.js';
  import { mappingDetail, DETAIL_PARAM } from '../stores/mappingDetail.js';
  import { fetchPlaygroundEquipment, fetchNearbyPOIs, fetchTrees, fetchMeta } from '../lib/api.js';
  import { overlayFeaturesStore } from '../stores/overlayLayer.js';
  import { groupEquipment } from '../lib/equipmentGrouping.js';
  import { playgroundCompleteness, mappingDetailHintKey } from '../lib/completeness.js';
  import { openingHoursState } from '../lib/openingHours.js';
  import { litInfo } from '../lib/pitchInfo.js';
  import { accessKind } from '../lib/access.js';
  import { shadeState } from '../lib/shade.js';
  import { deviceKeysOf, activitiesOf, highlightsOf } from '../lib/activities.js';
  import { poiRadiusM, appMode, mapMinZoom, regionLang, osmNotesUrl } from '../lib/config.js';
  import { reportStep, startHint } from '../stores/reportMissing.js';
  import { getPlaygroundTitle, getPlaygroundLocation, hasOsmName, navigationUrl, isMobileUserAgent } from '../lib/playgroundHelpers.js';
  import { aggregatePlaygroundThemes, areaThemesOf } from '../lib/playgroundThemes.js';
  import { summarizeEquipment } from '../lib/equipmentSummary.js';
  import { cn } from '../lib/utils.js';
  import EquipmentList from './EquipmentList.svelte';
  import POIPanel from './POIPanel.svelte';
  import ReviewsPanel from './ReviewsPanel.svelte';
  import { radiusFromExtent, fetchReviewsCached, headerRatingEnabled, ratingSummary } from '../lib/reviews.js';
  import { panoramaxUuidsFromTags } from '../lib/panoramax.js';
  import PanelHeader from './panel/PanelHeader.svelte';
  import PhotoStrip from './panel/PhotoStrip.svelte';
  import PillRow from './panel/PillRow.svelte';
  import ActivityRow from './panel/ActivityRow.svelte';
  import MapperTools from './panel/MapperTools.svelte';
  import ContributeInvite from './panel/ContributeInvite.svelte';
  import ZoneBackground from './panel/ZoneBackground.svelte';

  /** When true, renders without the fixed sidebar wrapper (for bottom sheet embedding) */
  export let embedded = false;

  // ── Derived state from selection store ────────────────────────────────────
  // Playgrounds only: a selected pitch has its own panel (#934), and loading
  // equipment, trees and reviews for it would be wrong.
  $: feature     = $selection.kind === 'playground' ? $selection.feature : null;
  $: backendUrl  = $selection.backendUrl;
  $: attr        = feature ? feature.getProperties() : null;
  // An OSM name is a proper noun in the region's language; the `nearby.defaultName`
  // placeholder is interface text. Without this the heading inherits the document
  // language, which is the UI locale (WCAG 3.1.2).
  $: titleLang   = hasOsmName(attr) ? regionLang : $locale;
  $: backendName = appMode === 'hub' ? (feature?.get('_backendName') ?? null) : null;

  // ── Async data ────────────────────────────────────────────────────────────
  let equipmentFeatures = [];
  let equipmentGroups = [];

  // ── Themes, activities, highlights (zone A) ───────────────────────────────
  $: deviceProps = [
    ...equipmentFeatures.map(f => f.properties),
    ...equipmentGroups.flatMap(g => [g.structure.properties, ...g.children.map(c => c.properties)]),
  ];
  $: themes = attr ? aggregatePlaygroundThemes(attr, deviceProps) : [];
  $: areaTheme = attr ? (areaThemesOf(attr)[0] ?? null) : null;
  $: deviceKeys = deviceKeysOf(equipmentFeatures, equipmentGroups, attr);
  $: activities = activitiesOf(deviceKeys);
  $: highlights = highlightsOf(deviceKeys, { themes, isWater: !!attr?.is_water });

  // Seating and fitness counts go to zone B's "good to know"; the device
  // total is gone — the activity row says what children can do.
  $: equipSummary = summarizeEquipment(equipmentFeatures, equipmentGroups);
  $: seating = [
    ['benches', equipSummary.benches],
    ['shelters', equipSummary.shelters],
    ['picnic', equipSummary.picnic],
  ].filter(([, n]) => n > 0);
  let pois = [];
  let treeRows = [];
  let equipmentLoading = false;
  let poisLoading = false;

  // ── Backend metadata (data age) ───────────────────────────────────────────
  // metaCache is module-scoped (see <script context="module"> above) so the
  // get_meta() result survives the panel's per-selection remount cycle.
  let osmDataAgeSec = null;
  // Generation guard so a slow earlier loadMeta() can't overwrite a faster
  // later one when the user selects two playgrounds in quick succession.
  let metaGen = 0;

  async function loadMeta(url) {
    const gen = ++metaGen;
    if (!url) { osmDataAgeSec = null; return; }
    if (metaCache.has(url)) {
      if (gen === metaGen) osmDataAgeSec = metaCache.get(url);
      return;
    }
    try {
      const meta = await fetchMeta(url);
      // Prefer the user-facing OSM snapshot age; fall back to import-run age.
      const ageSec = meta?.osm_data_age_seconds ?? meta?.data_age_seconds ?? null;
      metaCache.set(url, ageSec);
      if (gen === metaGen) osmDataAgeSec = ageSec;
    } catch {
      // Don't cache failures — a transient network error must not permanently
      // hide the chip for this backend URL.
      if (gen === metaGen) osmDataAgeSec = null;
    }
  }

  function formatDataAge(sec) {
    if (!Number.isFinite(sec) || sec < 0) return null;
    if (sec < 60) return $_('hub.dataAgeJustNow');
    const m = Math.round(sec / 60);
    if (m < 60)   return $_('hub.dataAgeMinutes', { values: { m } });
    const h = Math.round(m / 60);
    if (h < 48)   return $_('hub.dataAgeHours',   { values: { h } });
    const d = Math.round(h / 24);
    if (d <= 365) return $_('hub.dataAgeDays',    { values: { d } });
    const y = Math.round(d / 365);
    return $_('hub.dataAgeYears', { values: { y } });
  }

  $: loadMeta(backendUrl);
  $: dataAgeFormatted = formatDataAge(osmDataAgeSec);

  // Centre of selected playground in WGS84
  let centerLat = 0, centerLon = 0;
  // The Mangrove subject's radius (#914), rule in lib/reviews.js.
  let reviewRadiusM = null;

  // Generation counter — incremented on each new selection so stale responses are discarded.
  let loadGen = 0;

  $: if (feature) {
    loadData(feature, backendUrl);
  } else {
    ratingCtrl?.abort();
    headerRating = null;
    equipmentFeatures = [];
    equipmentGroups = [];
    pois = [];
    treeRows = [];
    overlayFeaturesStore.set({ equipment: [], trees: [] });
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
    reviewRadiusM = radiusFromExtent(ext);
    loadHeaderRating(feat.getProperties(), reviewRadiusM, lat, lon);

    equipmentLoading = true;
    poisLoading = true;

    let localEquipment = [];
    let localTrees = [];

    try {
      const geojson = await fetchPlaygroundEquipment(ext, feat.get('osm_id'), url);
      if (gen === loadGen) {
        localEquipment = geojson.features ?? [];
        // Clear any leftover _groupId tags before re-stamping. The current
        // fetch path returns fresh objects per call so this is defensive,
        // but a future caching layer or a hub-mode merge that reuses
        // feature references would otherwise leak stale group membership
        // (and silently hide the dot for a now-standalone device).
        for (const f of localEquipment) {
          if (f.properties) delete f.properties._groupId;
        }
        const { groups, standalone } = groupEquipment(localEquipment);
        for (const { structure, children } of groups) {
          for (const child of children) {
            child.properties._groupId = structure.properties.osm_id;
          }
        }
        equipmentGroups = groups;
        equipmentFeatures = standalone;
      }
    } catch (err) {
      console.warn('[panel] Equipment load failed:', err);
      if (gen === loadGen) {
        equipmentFeatures = [];
        equipmentGroups = [];
        treeRows = [];
        // Clear stale equipment from the previous selection's overlay so
        // the map doesn't keep showing wrong dots on the new playground.
        overlayFeaturesStore.set({ equipment: [], trees: [] });
      }
    } finally {
      if (gen === loadGen) equipmentLoading = false;
    }

    try {
      const treeGeojson = await fetchTrees(ext, url);
      if (gen === loadGen) {
        localTrees = treeGeojson.features ?? [];
        treeRows = localTrees
          .filter(f => f.properties?.feature_type === 'tree_row' && f.properties?.length_m != null)
          .map(f => f.properties.length_m);
      }
    } catch (err) {
      // Trees silently ignored on error (e.g. Overpass/dev mode)
    }

    if (gen === loadGen) {
      overlayFeaturesStore.set({ equipment: localEquipment, trees: localTrees });
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

  // Close the desktop side panel: clear the selection and zoom out a few steps
  // (keeping the playground centred) so the user lands back on a browsable view.
  // Similar in spirit to the mobile "back to map" gesture, which zooms out a
  // touch further (MOBILE_BACK_ZOOM_OUT) since the phone overview needs more
  // context. On mobile the panel is embedded and AppShell owns the back gesture,
  // so we only zoom out when !embedded.
  const DESKTOP_CLOSE_ZOOM_OUT = 4;
  function closePanel() {
    const view = embedded ? null : $mapStore?.getView();
    selection.clear();
    if (view) {
      const z = view.getZoom();
      if (Number.isFinite(z)) {
        view.animate({ zoom: Math.max(z - DESKTOP_CLOSE_ZOOM_OUT, mapMinZoom), duration: 400 });
      }
    }
  }

  // ── ESC to close ──────────────────────────────────────────────────────────
  // The data-age popover and the photo dialogs listen in the capture phase and
  // stop the event, so Escape closes them without reaching this handler.
  // An open hint dialog (#1073) sits on top of this panel: Escape closes the
  // dialog only. Its handler marks the event, or the step is still set when
  // this one runs first.
  function handleKeydown(e) {
    if (e.key !== 'Escape' || e.defaultPrevented || $reportStep) return;
    if (feature && !embedded) closePanel();
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    overlayFeaturesStore.set({ equipment: [], trees: [] });
  });

  // ── Mapping detail (tool block) ───────────────────────────────────────────
  // Only while mapping detail is on: in the finder view the badge would bring
  // back exactly the data-quality reading the view leaves out (#924).
  $: completenessLevel = attr && $mappingDetail ? playgroundCompleteness(attr) : null;
  // Which of the rule's two inputs is missing — so "basic" or "no details
  // yet" reads as an invitation, not a grade (#919). Nothing for "detailed".
  $: detailHintKey = completenessLevel ? mappingDetailHintKey(attr) : null;

  // ── Zone B facts ──────────────────────────────────────────────────────────
  $: openingHoursInfo = attr?.opening_hours ? openingHoursState(attr.opening_hours, $_) : null;
  $: litFact = attr ? litInfo(attr.lit) : null;
  $: surfaceLabel = attr?.surface
    ? tagValuesLabel(attr.surface, 'details.surfaceValues.', $_)
    : null;

  // One line per topic, each only when something is recorded.
  $: goodToKnow = !attr ? [] : [
    ...descriptionParts.map((text, i) => ({ key: i ? `description-${i}` : 'description', icon: '📝', text })),
    openingHoursInfo && {
      key: 'opening-hours', icon: '🕗',
      dot: openingHoursInfo.open === null ? undefined : openingHoursInfo.open,
      text: openingHoursInfo.open === null
        ? openingHoursInfo.text
        : `${openingHoursInfo.open ? $_('poi.open') : $_('poi.closed')}: ${openingHoursInfo.text}`,
    },
    seating.length && {
      key: 'seating', icon: '🪑',
      text: seating.map(([key, count]) => $_('equipment.' + key, { values: { count } })).join(' · '),
    },
    equipSummary.fitness > 0 && {
      key: 'fitness', icon: '🏋️',
      text: $_('equipment.fitnessCount', { values: { count: equipSummary.fitness } }),
    },
    (surfaceLabel || attr.area > 0 || attr.tree_count > 0 || treeRows.length > 0) && {
      key: 'ground',
      // The tree only when trees are part of the line; a size alone gets a
      // ruler (#1081).
      icon: (attr.tree_count > 0 || treeRows.length > 0) ? '🌳' : (surfaceLabel ? '🌱' : '📐'),
      text: [
        surfaceLabel,
        attr.area > 0 ? `${(Math.round(attr.area / 10) * 10 || attr.area).toLocaleString($locale ?? undefined)} m²` : null,
        attr.tree_count > 0 ? `${attr.tree_count} ${$_('hover.tagTrees')}` : null,
        treeRows.length > 0 ? `${$_('details.treeShadow')}: ${treeRows.map(m => `${m} m`).join(', ')}` : null,
      ].filter(Boolean).join(' · '),
    },
    // Only when tagged: 53 of 733 Fulda playgrounds carry `lit`, so
    // "unknown" must stay silent rather than read as "not lit" (#934).
    litFact && {
      key: 'lit', icon: '💡',
      text: $_(litFact.key, litFact.values ? { values: litFact.values } : undefined),
    },
  ].filter(Boolean);

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

  // Same rule as the map pin's badge and the hover card's chip, so the panel
  // repeats the marker's signal instead of dropping it (#996), and tells a
  // café's playground from a kindergarten's (#1002). Shown in the header.
  $: access = attr ? accessKind(attr) : 'public';

  $: mcOsmType = attr ? ({ W:'way', R:'relation', N:'node' }[attr.osm_type] ?? 'way') : 'way';
  $: mcUrl = attr ? `https://mapcomplete.org/playgrounds.html#${mcOsmType}/${attr.osm_id}` : '';

  // ── Photos ────────────────────────────────────────────────────────────────
  $: panoramaxUuids = panoramaxUuidsFromTags(attr);
  $: commonsTag = attr?.['wikimedia_commons'] || '';
  $: imageTag = attr?.['image'] || '';
  let photoState = 'loading';

  // ── Nearly empty: invite instead (#1077) ──────────────────────────────────
  // Only once equipment has loaded, or the invitation would flash before the
  // activities arrive.
  $: hasPills = !!attr && (attr.for_baby === true || attr.for_toddler === true
    || attr.has_fence === true || attr.has_dogs === true || shadeState(attr) !== null
    || attr.wheelchair_play === 'yes' || attr.wheelchair_play === 'no');
  $: knowsNothing = !!attr && !equipmentLoading && photoState === 'none' && !hasPills
    && activities.length === 0 && highlights.length === 0;

  // ── Hint about this playground (#1073) ───────────────────────────────────
  // Only when the instance sends OSM notes at all. The note goes to the
  // polygon's interior point (the bbox centre can lie outside an L-shape).
  function interiorLonLat(geom) {
    const type = geom?.getType?.();
    const c = type === 'Polygon' ? geom.getInteriorPoint().getCoordinates()
      : type === 'MultiPolygon' ? geom.getInteriorPoints().getCoordinates()[0]
      : null;
    return c ? transform([c[0], c[1]], 'EPSG:3857', 'EPSG:4326') : [centerLon, centerLat];
  }
  function openHint() {
    if (!attr || !feature) return;
    const [lon, lat] = interiorLonLat(feature.getGeometry());
    startHint({
      osmType: attr.osm_type,
      osmId: attr.osm_id,
      lat, lon,
      knownDevices: [...deviceKeys],
      fenceKnown: attr.has_fence === true,
      shadeKnown: shadeState(attr) !== null,
      hasName: hasOsmName(attr),
      mcUrl,
    });
  }
  $: onHint = osmNotesUrl ? openHint : null;

  // ── Accordion state (zone B) ──────────────────────────────────────────────
  // Both start closed: the activities above already say what is there, and
  // opening reviews contacts Mangrove (reviews-deferral.spec).
  let openSections = new Set();
  // From the rating under the name: open the reviews and land on them, where
  // the visitor can also add one.
  let reviewsEl;
  async function showReviews() {
    if (!openSections.has('reviews')) toggleSection('reviews');
    await tick();
    reviewsEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    reviewsEl?.querySelector('button.section-btn')?.focus({ preventScroll: true });
  }
  function toggleSection(id) {
    const next = new Set(openSections);
    next.has(id) ? next.delete(id) : next.add(id);
    openSections = next;
  }

  // ── Rating under the title (#1077) ────────────────────────────────────────
  // Only through this instance's Mangrove proxy (see lib/reviews.js). Shares
  // the session cache with the reviews section, so opening it later does not
  // ask again.
  let headerRating = null;
  let ratingCtrl = null;
  // Called from loadData once the new playground's centre is known — a
  // reactive call would first run with the previous playground's centre.
  function loadHeaderRating(a, radiusM, lat, lon) {
    ratingCtrl?.abort();
    headerRating = null;
    if (!headerRatingEnabled || !a) return;
    const ctrl = ratingCtrl = new AbortController();
    fetchReviewsCached(lat, lon, a.osm_id, ctrl.signal, { name: a.name ?? null, radiusM })
      .then(list => { if (ratingCtrl === ctrl) headerRating = ratingSummary(list); })
      .catch(() => {});
  }
  onDestroy(() => ratingCtrl?.abort());

  // ── Share ─────────────────────────────────────────────────────────────────
  async function sharePlayground() {
    if (!attr) return false;
    // Carry mapping detail only while it is on, so a contributor shares the
    // view they are looking at and everyone else's links stay as before (#924).
    const detail = $mappingDetail ? `?${DETAIL_PARAM}=1` : '';
    const url = `${window.location.origin}${window.location.pathname}${detail}#${attr.osm_type}${attr.osm_id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: getPlaygroundTitle(attr, $_), url });
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
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('Share failed:', err);
      return false;
    }
  }

  // ── Navigation link ──────────────────────────────────────────────────────
  // Mobile: geo: URL opens native navigation app
  // Desktop: OSM directions with stored GPS fix as origin (falls back to empty origin
  // when location was never granted — OSM then prompts the user for a starting point).
  // The href is reactive on the location store, so the origin follows every
  // watchPosition update rather than being captured once.
  //
  // Rendered as a plain <a href>, not window.open(): iOS Safari silently drops a
  // geo: URL opened via window.open(url, '_blank'), while the same URL as a
  // same-tab link hands off to the maps app — as POIPanel's rows already did (#926).
  // URL rules shared with the pitch panel: lib/playgroundHelpers.js.
  const navIsMobile = isMobileUserAgent(navigator.userAgent);
  $: navUrl = attr
    ? navigationUrl({
        lat: centerLat, lon: centerLon,
        title: getPlaygroundTitle(attr, $_),
        mobile: navIsMobile,
        origin: $location,
      })
    : null;
</script>

{#if feature && attr}
  <aside class={cn(
    embedded ? '' : 'info-panel',
    embedded ? '' : 'lg:flex'
  )}>
    <PanelHeader
      {embedded}
      title={getPlaygroundTitle(attr, $_)}
      {titleLang}
      subtitle={getPlaygroundLocation(attr, $_)}
      {backendName}
      access={access === 'public' ? null : access}
      {navUrl}
      navMobile={navIsMobile}
      onShare={sharePlayground}
      onClose={closePanel}
      rating={headerRating}
      onRatingClick={showReviews}
    >
      {#if !knowsNothing}<PillRow {attr} />{/if}
    </PanelHeader>

    <div class={cn(embedded ? '' : 'info-panel__body')}>
      <!-- Zone A: decide -->
      <section data-testid="zone-a">
        {#if completenessLevel}
          <MapperTools level={completenessLevel} hintKey={detailHintKey} {mcUrl} />
        {/if}
        <PhotoStrip
          commons={commonsTag}
          image={imageTag}
          {panoramaxUuids}
          {mcUrl}
          hideEmpty={knowsNothing}
          bind:status={photoState}
        />
        {#if knowsNothing}
          <ContributeInvite {mcUrl} {onHint} />
        {:else}
          <ActivityRow {activities} {highlights} {areaTheme} loading={equipmentLoading} after={hintLink} />
          {#if activities.length === 0}{@render hintLink()}{/if}
        {/if}
      </section>

      <!-- Zone B: go deeper -->
      <section data-testid="zone-b">
        <!-- "Good to know": the playground itself, one line per topic. A
             description is part of it (#1081): on its own it floated without
             a heading, and on sparse playgrounds it often holds opening hours
             typed in by hand. -->
        {#if goodToKnow.length}
          <div class="panel-section">
          <h3 class="section-label">{$_('panel.goodToKnow')}</h3>
          <ul class="fact-list" data-testid="good-to-know">
            {#each goodToKnow as row (row.key)}
              <li data-fact={row.key}>
                <span class="fact-icon" aria-hidden="true">{row.icon}</span>
                <span class="min-w-0">
                  {#if row.dot !== undefined}
                    <span class="status-dot" class:status-dot--open={row.dot === true} class:status-dot--closed={row.dot === false} aria-hidden="true"></span>
                  {/if}
                  {#if row.key === 'description'}<span class="italic" data-testid="description">{row.text}</span>{:else}{row.text}{/if}
                </span>
              </li>
            {/each}
          </ul>
          </div>
        {/if}

        <!-- Nearby: the nearest place of each kind. -->
        <div class="panel-section">
          <h3 class="section-label">{$_('panel.nearby')}</h3>
          <div class="mb-3">
            {#if poisLoading}
              <p class="text-sm text-muted-foreground italic py-2">{$_('details.loading')}</p>
            {:else}
              <POIPanel {pois} {centerLat} {centerLon} />
            {/if}
          </div>
        </div>

        <div class="accordion-block">
          <!-- Equipment -->
          <div class="border-b border-border">
            <button class="section-btn" onclick={() => toggleSection('equipment')}>
              {#if openSections.has('equipment')}
                <ChevronDown class="h-4 w-4 text-muted-foreground" />
              {:else}
                <ChevronRight class="h-4 w-4 text-muted-foreground" />
              {/if}
              <Package class="h-4 w-4 text-muted-foreground" />
              {$_('panel.allEquipment')}
            </button>
            {#if openSections.has('equipment')}
              <div class="pb-3">
                {#if equipmentLoading}
                  <p class="text-sm text-muted-foreground italic py-2">{$_('details.loading')}</p>
                {:else}
                  <EquipmentList features={equipmentFeatures} groups={equipmentGroups} playgroundAttr={attr} />
                {/if}
              </div>
            {/if}
          </div>

          <!-- Reviews -->
          <div class="border-b border-border reviews-section" bind:this={reviewsEl} data-testid="reviews-section">
            <button class="section-btn" onclick={() => toggleSection('reviews')}>
              {#if openSections.has('reviews')}
                <ChevronDown class="h-4 w-4 text-muted-foreground" />
              {:else}
                <ChevronRight class="h-4 w-4 text-muted-foreground" />
              {/if}
              <Star class="h-4 w-4 text-muted-foreground" />
              {$_('accordion.reviews')}
            </button>
            {#if openSections.has('reviews')}
              <div class="pb-3">
                <ReviewsPanel lat={centerLat} lon={centerLon} osmId={attr?.osm_id} name={attr?.name ?? null} radiusM={reviewRadiusM} />
              </div>
            {/if}
          </div>
        </div>
      </section>

      <!-- Zone C: background and contribute. With mapping detail on, the
           MapComplete link is in the tool block instead. -->
      <ZoneBackground {attr} dataAge={dataAgeFormatted} mcUrl={$mappingDetail ? '' : mcUrl} />
    </div>
  </aside>
{/if}

{#snippet hintLink()}
  <!-- Right under what is known: that is when a visitor notices what is
       missing (#1073). Small, so it does not get in the way. Only once
       equipment has loaded: the form hides known devices, and a tap before
       that would offer what is already mapped. -->
  {#if onHint && !equipmentLoading}
    <button type="button" class="contrib-link hint-link" onclick={onHint} data-testid="hint-open-inline">
      <MessageCirclePlus class="h-3.5 w-3.5" aria-hidden="true" />{$_('report.hint.missing')}
    </button>
  {/if}
{/snippet}

<style>
  .info-panel {
    position: absolute;
    top: 0;
    left: 0;
    width: 380px;
    height: 100%;
    background: var(--color-background);
    box-shadow: 4px 0 15px -3px rgb(22 48 42 / 0.12);
    z-index: 100;
    overflow-y: auto;
    display: none;
    flex-direction: column;
    border-right: 1px solid var(--color-border);
    touch-action: pan-y;
    color-scheme: light;
  }

  .info-panel.lg\:flex {
    display: flex;
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


  .section-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--color-muted-foreground);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    transition: color 0.15s, background 0.15s;
    text-align: left;
  }

  .section-btn:hover {
    color: var(--color-foreground);
    background: var(--color-muted);
  }

  .hint-link { margin: 6px 0 4px; }
  .accordion-block { border-top: 1px solid var(--color-border); margin: 4px -1rem 0; padding: 0 1rem; }
  .accordion-block > div:last-child { border-bottom: 0 !important; }

  /* Clear the sticky desktop header when jumped to from the rating. */
  .reviews-section { scroll-margin-top: 5rem; }

  .fact-list {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.875rem;
    color: var(--color-foreground);
  }
  .fact-list li { display: flex; gap: 8px; }
  .fact-icon { flex-shrink: 0; width: 1.25rem; text-align: center; }

  .status-dot {
    display: inline-block;
    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
    vertical-align: middle;
    margin-right: 2px;
  }
  .status-dot--open   { background: var(--color-primary); }
  /* Closed is information, not an alarm: most playgrounds are closed at
     night (#1081). */
  .status-dot--closed { background: var(--color-neutral-dot); }
</style>
