<script>
  // "Missing a playground?" (#1000): crosshair placement, duplicate check,
  // form, thank-you — plus the empty-area hint, right-click entry and the
  // visitor's own sent hints as pins. The entry points only call
  // startReport(); everything after that lives here. Note text, sending and
  // storage are in lib/osmNotes.js.
  import { onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import { MapPinPlus, Navigation2, X, Check, CircleHelp, Info, MessageSquarePlus, Pencil, ExternalLink } from 'lucide-svelte';
  import VectorLayer from 'ol/layer/Vector.js';
  import VectorSource from 'ol/source/Vector.js';
  import Feature from 'ol/Feature.js';
  import Point from 'ol/geom/Point.js';
  import { fromLonLat, toLonLat } from 'ol/proj.js';
  import { buffer } from 'ol/extent.js';
  import GeoJSON from 'ol/format/GeoJSON.js';
  import { Style, Circle as CircleStyle, Fill, Stroke, Text } from 'ol/style.js';
  import { modal } from '../stores/modalOpen.js';
  import { mapStore } from '../stores/map.js';
  import { playgroundSourceStore } from '../stores/playgroundSource.js';
  import { activeTierStore } from '../stores/tier.js';
  import { effectiveFilterStore, hasActiveFilters } from '../stores/filters.js';
  import { selection, hasSelection } from '../stores/selection.js';
  import { location } from '../stores/location.js';
  import { dataCoverage, coverageAt, isCovered } from '../stores/dataCoverage.js';
  import { reportStep, reportStartAt, reportBusy, startReport, cancelReport } from '../stores/reportMissing.js';
  import { fetchPlaygroundsBbox } from '../lib/api.js';
  import { tagWithBackend } from '../hub/backendTag.js';
  import { getPlaygroundTitle, fitViewToSelection } from '../lib/playgroundHelpers.js';
  import { osmNotesUrl, regionLang, privacyUrl, apiBaseUrl } from '../lib/config.js';
  import {
    REPORT_EQUIPMENT, DETAILS_MAX, NAME_MAX, buildNoteText, createNote, fetchNoteStatus,
    mapCompleteAddUrl, readOwnNotes, addOwnNote, updateOwnNoteStatus,
    canSendMore, countSent, SESSION_LIMIT,
  } from '../lib/osmNotes.js';

  /** Fallback backend URL for a duplicate hit that carries no `_backendUrl`. */
  export let defaultBackendUrl = '';

  // Below this a crosshair spans several streets; the note would send a
  // mapper looking in the wrong place.
  const PLACE_MIN_ZOOM = 16;
  // "Do you mean this one?" radius, in metres on the ground.
  const DUPE_RADIUS_M = 50;
  // The empty-area hint waits this long after the map settles, so it does not
  // flash while the polygon tier is still loading.
  const EMPTY_HINT_DELAY_MS = 1500;
  const OSMF_PRIVACY_URL = 'https://osmfoundation.org/wiki/Privacy_Policy';

  let zoom = 0;
  let dupeFeature = null;
  let spot = null;          // { lat, lon } chosen in the place step
  let equipment = [];
  let fenced = false;
  let name = '';
  let details = '';
  // Opt-in: keeping the hint in localStorage is not something the visitor
  // asked for by sending it, so it needs their say-so (TDDDG § 25).
  let remember = false;
  let sending = false;
  let sendError = false;
  let sentNote = null;      // { id, url }

  // ── map wiring ────────────────────────────────────────────────────────────

  const ownSource = new VectorSource();
  const ownLayer = new VectorLayer({ source: ownSource, zIndex: 25, minZoom: 11 });
  // Map.svelte's click handler skips features on this layer: a tap on an own
  // pin is ours alone, not also a playground selection or an empty-map click.
  ownLayer.set('spieliOwnNotes', true);
  ownLayer.setStyle(ownNoteStyle);

  const ownStyles = new Map();
  function ownNoteStyle(feature) {
    const status = feature.get('status') === 'closed' ? 'closed'
      : feature.get('status') === 'hidden' ? 'hidden' : 'open';
    let style = ownStyles.get(status);
    if (!style) {
      const colour = status === 'closed' ? '#059669' : status === 'hidden' ? '#9ca3af' : '#d97706';
      style = new Style({
        image: new CircleStyle({
          radius: 10,
          fill: new Fill({ color: colour }),
          stroke: new Stroke({ color: '#ffffff', width: 2 }),
        }),
        text: new Text({
          text: status === 'closed' ? '✓' : '?',
          font: 'bold 12px system-ui, sans-serif',
          fill: new Fill({ color: '#ffffff' }),
        }),
      });
      ownStyles.set(status, style);
    }
    return style;
  }

  function refreshOwnPins(list = readOwnNotes()) {
    ownSource.clear();
    ownSource.addFeatures(list.map(n => {
      const f = new Feature({ geometry: new Point(fromLonLat([n.lon, n.lat])) });
      f.setProperties({ noteId: n.id, status: n.status, created: n.created, url: n.url });
      return f;
    }));
  }

  let attachedMap = null;
  let emptyTimer = null;
  let showEmptyHint = false;
  let emptyHintDismissed = false;

  function onMoveEnd() {
    zoom = attachedMap?.getView().getZoom() ?? 0;
    showEmptyHint = false;
    clearTimeout(emptyTimer);
    emptyTimer = setTimeout(evaluateEmptyHint, EMPTY_HINT_DELAY_MS);
  }

  function evaluateEmptyHint() {
    const source = get(playgroundSourceStore);
    if (!attachedMap || !source || emptyHintDismissed) { showEmptyHint = false; return; }
    // A filter can empty the view on its own; the hint would then claim a
    // gap that is not there.
    if (get(reportStep) || get(hasSelection) || get(activeTierStore) !== 'polygon'
        || hasActiveFilters(get(effectiveFilterStore))) {
      showEmptyHint = false;
      return;
    }
    // Outside the data this map has, an empty view says nothing about OSM.
    const view = attachedMap.getView();
    const [lon, lat] = toLonLat(view.getCenter());
    if (!isCovered(get(dataCoverage), lon, lat)) { showEmptyHint = false; return; }
    const extent = view.calculateExtent(attachedMap.getSize());
    showEmptyHint = source.getFeaturesInExtent(extent).length === 0;
  }

  // The polygon tier can land after the hint was decided (a slow backend, a
  // hub fan-out): re-check when the source changes, so the hint goes away as
  // soon as playgrounds arrive.
  let watchedSource = null;
  function onSourceChange() { if (showEmptyHint) evaluateEmptyHint(); }
  $: watchSource($playgroundSourceStore);
  function watchSource(source) {
    if (watchedSource === source) return;
    watchedSource?.un('change', onSourceChange);
    watchedSource = source;
    watchedSource?.on('change', onSourceChange);
  }

  // Right-click with a mouse only. A touch long-press fires contextmenu too
  // (Android Chrome), and a resting finger must not start a report.
  let lastPointerType = 'mouse';
  function onPointerDown(evt) { lastPointerType = evt.pointerType || 'mouse'; }
  function onContextMenu(evt) {
    if (!attachedMap || get(reportStep)) return;
    if ((evt.pointerType || lastPointerType) !== 'mouse') return;
    evt.preventDefault();
    startReport(attachedMap.getEventCoordinate(evt));
  }

  function onMapClick(evt) {
    if (get(reportStep)) return;
    const hit = attachedMap.forEachFeatureAtPixel(evt.pixel, f => f, {
      layerFilter: l => l === ownLayer,
      hitTolerance: 6,
    });
    if (hit) openOwnNote(hit);
    else ownPopup = null;
  }

  function attach(map) {
    if (attachedMap === map) return;
    detach();
    if (!map) return;
    attachedMap = map;
    map.addLayer(ownLayer);
    map.on('moveend', onMoveEnd);
    map.on('click', onMapClick);
    map.getViewport().addEventListener('contextmenu', onContextMenu);
    map.getViewport().addEventListener('pointerdown', onPointerDown, true);
    zoom = map.getView().getZoom() ?? 0;
    refreshOwnPins();
  }

  function detach() {
    if (!attachedMap) return;
    attachedMap.removeLayer(ownLayer);
    attachedMap.un('moveend', onMoveEnd);
    attachedMap.un('click', onMapClick);
    attachedMap.getViewport().removeEventListener('contextmenu', onContextMenu);
    attachedMap.getViewport().removeEventListener('pointerdown', onPointerDown, true);
    attachedMap = null;
  }

  $: attach($mapStore);
  onDestroy(() => { detach(); watchSource(null); clearTimeout(emptyTimer); });

  // ── place step ────────────────────────────────────────────────────────────

  // A new report: reset the form, frame the start spot. startReport() has
  // already closed any open panel, in step with the history entries.
  let lastStep = null;
  $: onStepChange($reportStep);
  function onStepChange(step) {
    if (step === 'place' && lastStep === null) beginReport();
    if (step !== lastStep) moveFocus(step);
    lastStep = step;
  }

  // Each step replaces the previous one's content, so the focused button
  // disappears with it. Move focus to the new step's heading, which a screen
  // reader then announces; on close, back to the map's report button.
  async function moveFocus(step) {
    await tick();
    if (step) {
      document.querySelector('[data-report-focus]')?.focus({ preventScroll: true });
    } else if (!document.activeElement || document.activeElement === document.body) {
      document.querySelector('.report-btn')?.focus({ preventScroll: true });
    }
  }

  function beginReport() {
    showEmptyHint = false;
    ownPopup = null;
    equipment = [];
    fenced = false;
    name = '';
    details = '';
    remember = false;
    sendError = false;
    sentNote = null;
    dupeFeature = null;
    checking = false;
    flowId += 1;
    const at = get(reportStartAt);
    reportStartAt.set(null);
    const view = attachedMap?.getView();
    if (at && view) {
      view.animate({ center: at, zoom: Math.max(view.getZoom() ?? 0, 18), duration: 400 });
    }
  }

  function useMyLocation() {
    const loc = get(location);
    const view = attachedMap?.getView();
    if (!loc || !view) return;
    view.animate({
      center: fromLonLat([loc.lon, loc.lat]),
      zoom: Math.max(view.getZoom() ?? 0, 18),
      duration: 400,
    });
  }

  function zoomCloser() {
    const view = attachedMap?.getView();
    view?.animate({ zoom: PLACE_MIN_ZOOM + 1, duration: 300 });
  }

  // Every async step checks this: a report closed (or restarted) while a
  // request was in flight must not be pushed forward by its answer.
  let flowId = 0;
  let checking = false;
  let outside = false;
  const geojson = new GeoJSON();

  async function confirmSpot() {
    const view = attachedMap?.getView();
    if (!view || checking) return;
    const center = view.getCenter();
    const [lon, lat] = toLonLat(center);
    spot = { lat, lon };
    const coverage = get(dataCoverage);
    outside = !isCovered(coverage, lon, lat);
    if (outside) {
      // No data here: no duplicate check is possible, so only MapComplete,
      // which shows what OSM already has, is offered.
      dupeFeature = null;
      reportStep.set('choose');
      return;
    }
    const id = flowId;
    checking = true;
    // Coverage not known yet: standalone still has its one backend to ask.
    const backends = Array.isArray(coverage) && coverage.length
      ? coverageAt(coverage, lon, lat)
      : (apiBaseUrl ? [{ url: apiBaseUrl }] : []);
    const nearby = await fetchNearby(center, lat, backends);
    checking = false;
    if (id !== flowId || get(reportStep) !== 'place') return;
    dupeFeature = nearbyPlayground(center, lat, nearby);
    reportStep.set(dupeFeature ? 'dupe' : 'choose');
  }

  // Ask the backend(s) holding this spot for playgrounds right around it.
  // The polygon source alone is not enough: after a zoom-in its fetch is
  // often still in flight (300 ms debounce plus the request), and a quick
  // "Next" would find nothing and skip "Do you mean this one?".
  async function fetchNearby(center, lat, backends) {
    const r = (DUPE_RADIUS_M * 2) / Math.cos((lat * Math.PI) / 180);
    const extent = buffer([...center, ...center], r);
    const results = await Promise.allSettled(backends.map(async (b) => {
      const fc = await fetchPlaygroundsBbox(extent, b.url);
      const features = geojson.readFeatures(fc, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
      for (const f of features) tagWithBackend(f, b);
      return features;
    }));
    return results.flatMap(res => (res.status === 'fulfilled' ? res.value : []));
  }

  // The closest known playground within DUPE_RADIUS_M of the crosshair, or
  // null: from the fetched candidates and from what the map already shows.
  // Web Mercator stretches distances by 1/cos(latitude), so the ground radius
  // is scaled before it is compared with map units.
  function nearbyPlayground(center, lat, fetched = []) {
    const source = get(playgroundSourceStore);
    const r = DUPE_RADIUS_M / Math.cos((lat * Math.PI) / 180);
    const area = buffer([...center, ...center], r);
    const candidates = [...fetched, ...(source ? source.getFeaturesInExtent(area) : [])];
    let best = null;
    let bestDist = Infinity;
    for (const f of candidates) {
      const geom = f.getGeometry();
      if (!geom) continue;
      const d = geom.intersectsCoordinate(center)
        ? 0
        : Math.hypot(...geom.getClosestPoint(center).map((v, i) => v - center[i]));
      if (d <= r && d < bestDist) { best = f; bestDist = d; }
    }
    return best;
  }

  function showDupe() {
    const f = dupeFeature;
    if (!f) { cancelReport(); return; }
    // Open the playground only once the report's history entry is gone, so
    // the panel's own entry is not popped by that back.
    cancelReport(() => {
      selection.select(f, f.get('_backendUrl') ?? defaultBackendUrl);
      const view = attachedMap?.getView();
      if (view) fitViewToSelection(view, f.getGeometry().getExtent());
    });
  }

  $: dupeTitle = dupeFeature ? getPlaygroundTitle(dupeFeature.getProperties(), $_) : '';

  // ── form step ─────────────────────────────────────────────────────────────

  function toggleEquipment(key) {
    equipment = equipment.includes(key) ? equipment.filter(k => k !== key) : [...equipment, key];
  }

  async function send() {
    if (!spot || sending || !canSendMore()) return;
    const id = flowId;
    sending = true;
    reportBusy.set(true);
    sendError = false;
    try {
      const text = buildNoteText({ equipment, fenced, name, details, lang: regionLang });
      const note = await createNote({ lat: spot.lat, lon: spot.lon, text, base: osmNotesUrl });
      countSent();
      // Closing is blocked while sending, but a restart in between would
      // still be overtaken by this answer.
      if (id !== flowId) return;
      sentNote = note;
      if (remember) {
        refreshOwnPins(addOwnNote({
          id: sentNote.id,
          lat: spot.lat,
          lon: spot.lon,
          created: new Date().toISOString().slice(0, 10),
          status: 'open',
          url: sentNote.url,
        }));
      }
      reportStep.set('done');
    } catch (err) {
      console.warn('[report] sending the note failed:', err);
      // 401/403: OSM no longer takes notes without an account (a change the
      // community has debated). Say so and point to MapComplete instead of a
      // generic "try again later".
      sendError = err?.status === 401 || err?.status === 403 ? 'refused' : 'failed';
    } finally {
      sending = false;
      reportBusy.set(false);
    }
  }

  $: mcUrl = spot ? mapCompleteAddUrl(spot.lat, spot.lon) : '';
  $: limitReached = $reportStep === 'choose' && !canSendMore();

  // ── own notes ─────────────────────────────────────────────────────────────

  let ownPopup = null;   // { id, created, url, status, checking }

  // The status is fetched on click, never on load: opening the map must not
  // contact OSM on the visitor's behalf.
  async function openOwnNote(f) {
    const id = f.get('noteId');
    ownPopup = { id, created: f.get('created'), url: f.get('url'), status: f.get('status'), checking: true };
    const status = await fetchNoteStatus(id, osmNotesUrl);
    if (ownPopup?.id !== id) return;
    ownPopup = { ...ownPopup, status: status ?? 'unknown', checking: false };
    if (status) refreshOwnPins(updateOwnNoteStatus(id, status));
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  }

  // ── keyboard ──────────────────────────────────────────────────────────────

  function onKeydown(e) {
    if (e.key !== 'Escape') return;
    if ($reportStep) cancelReport();   // a no-op while sending
    else if (ownPopup) ownPopup = null;
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if $reportStep === 'place' || $reportStep === 'dupe'}
  <div class="crosshair" aria-hidden="true">
    <svg viewBox="0 0 48 48" width="48" height="48">
      <circle cx="24" cy="24" r="10" fill="none" stroke="#ffffff" stroke-width="5" />
      <circle cx="24" cy="24" r="10" fill="none" stroke="#047857" stroke-width="2.5" />
      <path d="M24 2v12M24 34v12M2 24h12M34 24h12" stroke="#ffffff" stroke-width="5" stroke-linecap="round" />
      <path d="M24 2v12M24 34v12M2 24h12M34 24h12" stroke="#047857" stroke-width="2.5" stroke-linecap="round" />
      <circle cx="24" cy="24" r="2" fill="#047857" />
    </svg>
  </div>
{/if}

{#if $reportStep === 'place'}
  <div class="report-card" role="region" aria-label={$_('report.place.title')}>
    <div class="card-head">
      <h2 class="card-title" tabindex="-1" data-report-focus>{$_('report.place.title')}</h2>
      <button type="button" class="icon-btn" onclick={cancelReport} aria-label={$_('report.cancel')}>
        <X class="h-4 w-4" />
      </button>
    </div>
    <p class="card-text">{$_('report.place.hint')}</p>
    <div class="card-actions">
      {#if $location}
        <button type="button" class="btn btn-secondary" onclick={useMyLocation}>
          <Navigation2 class="h-4 w-4" aria-hidden="true" />
          {$_('report.place.here')}
        </button>
      {/if}
      {#if zoom < PLACE_MIN_ZOOM}
        <button type="button" class="btn btn-primary" onclick={zoomCloser}>{$_('report.place.zoomIn')}</button>
      {:else}
        <button type="button" class="btn btn-primary" onclick={confirmSpot} disabled={checking} aria-busy={checking}>
          {checking ? $_('report.place.checking') : $_('report.place.next')}
        </button>
      {/if}
    </div>
  </div>
{/if}

{#if $reportStep === 'dupe'}
  <div class="report-card" role="region" aria-label={$_('report.dupe.title')}>
    <h2 class="card-title" tabindex="-1" data-report-focus>{$_('report.dupe.title')}</h2>
    <p class="card-text">{$_('report.dupe.text', { values: { name: dupeTitle } })}</p>
    <div class="card-actions">
      <button type="button" class="btn btn-secondary" onclick={() => reportStep.set('choose')}>{$_('report.dupe.other')}</button>
      <button type="button" class="btn btn-primary" onclick={showDupe}>{$_('report.dupe.show')}</button>
    </div>
  </div>
{/if}

{#if $reportStep === 'choose' || $reportStep === 'form' || $reportStep === 'done'}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" onclick={(e) => { if (e.target === e.currentTarget) cancelReport(); }}>
    <div class="modal-box" role="dialog" aria-modal="true" use:modal aria-labelledby="report-title">
      {#if $reportStep === 'choose'}
        <div class="modal-header">
          <h2 class="modal-title" id="report-title" tabindex="-1" data-report-focus>{$_('report.choose.title')}</h2>
          <button type="button" class="icon-btn" onclick={cancelReport} aria-label={$_('report.cancel')}>
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="modal-body">
          {#if outside}
            <p class="card-text">{$_('report.choose.outside')}</p>
          {/if}
          <div class="options">
            {#if osmNotesUrl && !outside}
              <button type="button" class="option" onclick={() => reportStep.set('form')} disabled={limitReached}>
                <span class="option-icon"><MessageSquarePlus class="h-5 w-5" aria-hidden="true" /></span>
                <span class="option-body">
                  <span class="option-head">
                    <span class="option-title">{$_('report.choose.noteTitle')}</span>
                    <span class="badge badge-free">{$_('report.choose.noteBadge')}</span>
                  </span>
                  <span class="option-text">
                    {limitReached
                      ? $_('report.choose.limit', { values: { count: SESSION_LIMIT } })
                      : $_('report.choose.noteText')}
                  </span>
                </span>
              </button>
            {/if}
            <a class="option" href={mcUrl} target="_blank" rel="noopener noreferrer" onclick={cancelReport}>
              <span class="option-icon"><Pencil class="h-5 w-5" aria-hidden="true" /></span>
              <span class="option-body">
                <span class="option-head">
                  <span class="option-title">{$_('report.choose.mcTitle')}</span>
                  <span class="badge">{$_('report.choose.mcBadge')}</span>
                </span>
                <span class="option-text">{$_('report.choose.mcText')}</span>
              </span>
              <ExternalLink class="h-4 w-4 option-ext" aria-hidden="true" />
            </a>
          </div>
          <div class="card-actions">
            <button type="button" class="btn btn-secondary" onclick={() => reportStep.set('place')}>{$_('report.form.back')}</button>
          </div>
        </div>
      {:else if $reportStep === 'form'}
        <div class="modal-header">
          <h2 class="modal-title" id="report-title" tabindex="-1" data-report-focus>{$_('report.form.title')}</h2>
          <button type="button" class="icon-btn" onclick={cancelReport} aria-label={$_('report.cancel')} disabled={sending}>
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="modal-body">
          <p class="card-text">{$_('report.form.intro')}</p>

          <fieldset class="field">
            <legend class="field-label">{$_('report.form.equipmentLabel')}</legend>
            <div class="chips">
              {#each REPORT_EQUIPMENT as key}
                <button type="button" class="chip" class:chip-on={equipment.includes(key)}
                  aria-pressed={equipment.includes(key)} onclick={() => toggleEquipment(key)}>
                  {#if equipment.includes(key)}<Check class="h-3 w-3" aria-hidden="true" />{/if}
                  {$_(`report.equipment.${key}`)}
                </button>
              {/each}
              <button type="button" class="chip" class:chip-on={fenced}
                aria-pressed={fenced} onclick={() => fenced = !fenced}>
                {#if fenced}<Check class="h-3 w-3" aria-hidden="true" />{/if}
                {$_('report.form.fenced')}
              </button>
            </div>
          </fieldset>

          <label class="field">
            <span class="field-label">{$_('report.form.name')}</span>
            <input class="input" type="text" maxlength={NAME_MAX} bind:value={name} />
          </label>

          <label class="field">
            <span class="field-label">{$_('report.form.details')}</span>
            <textarea class="input" rows="3" maxlength={DETAILS_MAX} bind:value={details}
              placeholder={$_('report.form.detailsPlaceholder')}></textarea>
          </label>

          <div class="good-to-know">
            <Info class="h-4 w-4 good-to-know-icon" aria-hidden="true" />
            <div>
            <p>{$_('report.form.publicWarning')}</p>
            <p class="privacy-links">
              {$_('report.form.privacyLabel')}
              <a href={OSMF_PRIVACY_URL} target="_blank" rel="noopener noreferrer">{$_('report.form.privacyOsmf')}</a>
              {#if privacyUrl}
                · <a href={privacyUrl} target="_blank" rel="noopener">{$_('report.form.privacyThisSite')}</a>
              {/if}
            </p>
            </div>
          </div>

          <label class="remember">
            <input type="checkbox" bind:checked={remember} />
            <span>
              {$_('report.form.remember')}
              <span class="remember-hint">{$_('report.form.rememberHint')}</span>
            </span>
          </label>

          {#if sendError === 'refused'}
            <p class="error" role="alert">
              {$_('report.form.refused')}
              <a href={mcUrl} target="_blank" rel="noopener noreferrer">{$_('report.choose.mcTitle')}</a>
            </p>
          {:else if sendError}
            <p class="error" role="alert">{$_('report.form.error')}</p>
          {/if}

          <div class="card-actions">
            <button type="button" class="btn btn-secondary" onclick={() => reportStep.set('choose')} disabled={sending}>{$_('report.form.back')}</button>
            <button type="button" class="btn btn-primary" onclick={send} disabled={sending}>
              {sending ? $_('report.form.sending') : $_('report.form.send')}
            </button>
          </div>
        </div>
      {:else}
        <div class="modal-header">
          <h2 class="modal-title" id="report-title" tabindex="-1" data-report-focus>{$_('report.done.title')}</h2>
          <button type="button" class="icon-btn" onclick={cancelReport} aria-label={$_('info.closeBtn')}>
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="modal-body">
          <p class="card-text">{$_('report.done.text')}</p>
          <div class="done-links">
            <a class="btn btn-secondary btn-block" href={sentNote?.url} target="_blank" rel="noopener noreferrer">{$_('report.done.viewNote')}</a>
            <button type="button" class="btn btn-primary btn-block" onclick={cancelReport}>{$_('report.done.close')}</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if showEmptyHint && !$reportStep && !$hasSelection}
  <div class="empty-hint" role="status">
    <span>{$_('report.empty.text')}</span>
    <button type="button" class="btn btn-primary btn-small" onclick={() => startReport()}>
      <MapPinPlus class="h-4 w-4" aria-hidden="true" />
      {$_('report.empty.action')}
    </button>
    <button type="button" class="icon-btn" aria-label={$_('report.empty.dismiss')}
      onclick={() => { emptyHintDismissed = true; showEmptyHint = false; }}>
      <X class="h-4 w-4" />
    </button>
  </div>
{/if}

{#if ownPopup && !$reportStep}
  <div class="report-card" role="region" aria-label={$_('report.own.title', { values: { date: formatDate(ownPopup.created) } })}>
    <div class="card-head">
      <h2 class="card-title">
        {#if ownPopup.status === 'closed'}<Check class="h-4 w-4 text-ok" aria-hidden="true" />{:else}<CircleHelp class="h-4 w-4 text-open" aria-hidden="true" />{/if}
        {$_('report.own.title', { values: { date: formatDate(ownPopup.created) } })}
      </h2>
      <button type="button" class="icon-btn" onclick={() => ownPopup = null} aria-label={$_('report.own.close')}>
        <X class="h-4 w-4" />
      </button>
    </div>
    <p class="card-text" aria-live="polite">
      {ownPopup.checking ? $_('report.own.checking') : $_(`report.own.status.${ownPopup.status}`)}
    </p>
    <div class="card-actions">
      <a class="btn btn-secondary" href={ownPopup.url} target="_blank" rel="noopener noreferrer">{$_('report.own.view')}</a>
    </div>
  </div>
{/if}

<style>
  .crosshair {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 150;
    pointer-events: none;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
  }

  .report-card {
    position: absolute;
    left: 50%;
    bottom: 2.5rem;
    transform: translateX(-50%);
    z-index: 250;
    width: min(calc(100vw - 2rem), 420px);
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
    padding: 0.875rem 1rem 1rem;
    color: #1f2937;
  }

  .card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .card-title,
  .modal-title {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: #1a1a1a;
  }

  .card-text {
    margin: 0.375rem 0 0.75rem;
    font-size: 0.875rem;
    line-height: 1.5;
    color: #374151;
  }

  .card-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    min-height: 40px;
    padding: 0 0.875rem;
    border-radius: 8px;
    border: 1px solid transparent;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
  }
  .btn:disabled { opacity: 0.6; cursor: wait; }
  .btn-primary { background: #047857; color: #ffffff; }
  .btn-primary:hover { background: #065f46; }
  .btn-secondary { background: #f3f4f6; color: #1f2937; border-color: #e5e7eb; }
  .btn-secondary:hover { background: #e5e7eb; }
  .btn-block { width: 100%; }
  .btn-small { min-height: 32px; padding: 0 0.625rem; font-size: 0.8125rem; }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: #6b7280;
    cursor: pointer;
  }
  .icon-btn:hover { background: #f3f4f6; color: #111827; }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 1050;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-box {
    background: #ffffff;
    border-radius: 10px;
    width: min(92vw, 440px);
    max-height: 88vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22);
    color: #1f2937;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.125rem 0.75rem;
    border-bottom: 1px solid #f0f0f0;
  }

  .modal-body { padding: 0.75rem 1.125rem 1.125rem; }

  .field {
    display: block;
    margin: 0 0 0.875rem;
    padding: 0;
    border: none;
  }

  .field-label {
    display: block;
    margin-bottom: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: #374151;
  }

  .chips { display: flex; flex-wrap: wrap; gap: 0.375rem; }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-height: 34px;
    padding: 0 0.75rem;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    color: #374151;
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
  }
  .chip-on { background: #ecfdf5; border-color: #047857; color: #065f46; font-weight: 600; }

  .input {
    width: 100%;
    padding: 0.5rem 0.625rem;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font: inherit;
    font-size: 0.875rem;
    color: #1f2937;
    background: #ffffff;
    resize: vertical;
  }
  .input:focus { outline: 2px solid #047857; outline-offset: 1px; }

  /* Calm on purpose: this informs, it does not warn. */
  .good-to-know {
    display: flex;
    gap: 0.5rem;
    margin: 0 0 0.875rem;
    padding: 0.5rem 0.625rem;
    border-radius: 8px;
    background: #f3f4f6;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: #4b5563;
  }
  .good-to-know p { margin: 0; }
  .good-to-know .privacy-links { margin-top: 0.375rem; }
  .good-to-know a { color: #047857; font-weight: 600; }
  :global(.good-to-know-icon) { flex-shrink: 0; margin-top: 0.125rem; color: #6b7280; }

  .remember {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin: 0 0 0.875rem;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: #374151;
    cursor: pointer;
  }
  .remember input { margin-top: 0.2rem; accent-color: #047857; width: 16px; height: 16px; flex-shrink: 0; }
  .remember-hint { display: block; color: #6b7280; }


  .error {
    margin: 0 0 0.75rem;
    font-size: 0.8125rem;
    color: #b91c1c;
  }
  .error a { color: #047857; font-weight: 600; }

  [data-report-focus]:focus { outline: none; }
  [data-report-focus]:focus-visible { outline: 2px solid #047857; outline-offset: 2px; border-radius: 4px; }

  .options { display: flex; flex-direction: column; gap: 0.625rem; margin-bottom: 1rem; }

  .option {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    width: 100%;
    padding: 0.875rem;
    border: 1.5px solid #e5e7eb;
    border-radius: 10px;
    background: #ffffff;
    font: inherit;
    text-align: left;
    color: #1f2937;
    text-decoration: none;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s;
  }
  .option:hover:not(:disabled) { border-color: #047857; background: #f0fdf4; }
  .option:disabled { cursor: not-allowed; opacity: 0.65; }

  .option-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #ecfdf5;
    color: #047857;
  }

  .option-body { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; min-width: 0; }
  .option-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem; }
  .option-title { font-size: 0.9375rem; font-weight: 700; }
  .option-text { font-size: 0.8125rem; line-height: 1.45; color: #4b5563; }
  :global(.option-ext) { flex-shrink: 0; color: #9ca3af; margin-top: 0.125rem; }

  .badge {
    padding: 0.0625rem 0.5rem;
    border-radius: 999px;
    background: #f3f4f6;
    color: #4b5563;
    font-size: 0.6875rem;
    font-weight: 600;
  }
  .badge-free { background: #d1fae5; color: #065f46; }

  .done-links { display: flex; flex-direction: column; gap: 0.5rem; }

  .empty-hint {
    position: absolute;
    left: 50%;
    bottom: 6rem;
    transform: translateX(-50%);
    z-index: 120;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: max-content;
    max-width: calc(100vw - 2rem);
    padding: 0.375rem 0.375rem 0.375rem 0.875rem;
    border-radius: 999px;
    background: #ffffff;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
    font-size: 0.8125rem;
    color: #1f2937;
  }

  :global(.text-ok) { color: #059669; }
  :global(.text-open) { color: #d97706; }

  @media (max-width: 1023px) {
    .report-card { bottom: 1rem; }
    .empty-hint { border-radius: 12px; }
  }
</style>
