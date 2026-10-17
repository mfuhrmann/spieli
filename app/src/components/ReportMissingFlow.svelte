<script>
  // "Missing a playground?" (#1000): crosshair placement, duplicate check,
  // form, thank-you — plus the empty-area hint, right-click entry and the
  // visitor's own sent hints as pins. The entry points only call
  // startReport(); everything after that lives here. Note text, sending and
  // storage are in lib/osmNotes.js.
  import { onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import { MapPinPlus, Navigation2, X, Check, CircleHelp, MessageSquarePlus, Pencil, ExternalLink } from 'lucide-svelte';
  import VectorLayer from 'ol/layer/Vector.js';
  import VectorSource from 'ol/source/Vector.js';
  import Feature from 'ol/Feature.js';
  import Point from 'ol/geom/Point.js';
  import { fromLonLat, toLonLat } from 'ol/proj.js';
  import { buffer } from 'ol/extent.js';
  import { Style, Circle as CircleStyle, Fill, Stroke, Text } from 'ol/style.js';
  import { modal } from '../stores/modalOpen.js';
  import { mapStore } from '../stores/map.js';
  import { playgroundSourceStore } from '../stores/playgroundSource.js';
  import { activeTierStore } from '../stores/tier.js';
  import { effectiveFilterStore, hasActiveFilters } from '../stores/filters.js';
  import { selection, hasSelection } from '../stores/selection.js';
  import { location } from '../stores/location.js';
  import { reportStep, reportStartAt, startReport, cancelReport } from '../stores/reportMissing.js';
  import { getPlaygroundTitle, fitViewToSelection } from '../lib/playgroundHelpers.js';
  import { osmNotesUrl, regionLang } from '../lib/config.js';
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

  let zoom = 0;
  let dupeFeature = null;
  let spot = null;          // { lat, lon } chosen in the place step
  let equipment = [];
  let fenced = false;
  let name = '';
  let details = '';
  let sending = false;
  let sendError = false;
  let sentNote = null;      // { id, url }

  // ── map wiring ────────────────────────────────────────────────────────────

  const ownSource = new VectorSource();
  const ownLayer = new VectorLayer({ source: ownSource, zIndex: 25, minZoom: 11 });
  ownLayer.setStyle(ownNoteStyle);

  function ownNoteStyle(feature) {
    const status = feature.get('status');
    const colour = status === 'closed' ? '#059669' : status === 'hidden' ? '#9ca3af' : '#d97706';
    return new Style({
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
    if (!attachedMap || !source || emptyHintDismissed) return;
    // A filter can empty the view on its own; the hint would then claim a
    // gap that is not there.
    if (get(reportStep) || get(hasSelection) || get(activeTierStore) !== 'polygon') return;
    if (hasActiveFilters(get(effectiveFilterStore))) return;
    const extent = attachedMap.getView().calculateExtent(attachedMap.getSize());
    showEmptyHint = source.getFeaturesInExtent(extent).length === 0;
  }

  function onContextMenu(evt) {
    if (!attachedMap || get(reportStep)) return;
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
    zoom = map.getView().getZoom() ?? 0;
    refreshOwnPins();
  }

  function detach() {
    if (!attachedMap) return;
    attachedMap.removeLayer(ownLayer);
    attachedMap.un('moveend', onMoveEnd);
    attachedMap.un('click', onMapClick);
    attachedMap.getViewport().removeEventListener('contextmenu', onContextMenu);
    attachedMap = null;
  }

  $: attach($mapStore);
  onDestroy(() => { detach(); clearTimeout(emptyTimer); });

  // ── place step ────────────────────────────────────────────────────────────

  // A new report: reset the form, close any open panel, frame the start spot.
  let lastStep = null;
  $: onStepChange($reportStep);
  function onStepChange(step) {
    if (step === 'place' && lastStep === null) beginReport();
    lastStep = step;
  }

  function beginReport() {
    showEmptyHint = false;
    ownPopup = null;
    equipment = [];
    fenced = false;
    name = '';
    details = '';
    sendError = false;
    sentNote = null;
    dupeFeature = null;
    if (get(hasSelection)) selection.clear();
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

  function confirmSpot() {
    const view = attachedMap?.getView();
    if (!view) return;
    const center = view.getCenter();
    const [lon, lat] = toLonLat(center);
    spot = { lat, lon };
    dupeFeature = nearbyPlayground(center, lat);
    reportStep.set(dupeFeature ? 'dupe' : 'choose');
  }

  // The closest known playground within DUPE_RADIUS_M of the crosshair, or
  // null. Web Mercator stretches distances by 1/cos(latitude), so the ground
  // radius is scaled before it is compared with map units.
  function nearbyPlayground(center, lat) {
    const source = get(playgroundSourceStore);
    if (!source) return null;
    const r = DUPE_RADIUS_M / Math.cos((lat * Math.PI) / 180);
    let best = null;
    let bestDist = Infinity;
    for (const f of source.getFeaturesInExtent(buffer([...center, ...center], r))) {
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
    cancelReport();
    if (!f) return;
    selection.select(f, f.get('_backendUrl') ?? defaultBackendUrl);
    const view = attachedMap?.getView();
    if (view) fitViewToSelection(view, f.getGeometry().getExtent());
  }

  $: dupeTitle = dupeFeature ? getPlaygroundTitle(dupeFeature.getProperties(), $_) : '';

  // ── form step ─────────────────────────────────────────────────────────────

  function toggleEquipment(key) {
    equipment = equipment.includes(key) ? equipment.filter(k => k !== key) : [...equipment, key];
  }

  async function send() {
    if (!spot || sending || !canSendMore()) return;
    sending = true;
    sendError = false;
    try {
      const text = buildNoteText({ equipment, fenced, name, details, lang: regionLang });
      sentNote = await createNote({ lat: spot.lat, lon: spot.lon, text, base: osmNotesUrl });
      countSent();
      refreshOwnPins(addOwnNote({
        id: sentNote.id,
        lat: spot.lat,
        lon: spot.lon,
        created: new Date().toISOString().slice(0, 10),
        status: 'open',
        url: sentNote.url,
      }));
      reportStep.set('done');
    } catch (err) {
      console.warn('[report] sending the note failed:', err);
      sendError = true;
    } finally {
      sending = false;
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
    if ($reportStep) cancelReport();
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
      <h2 class="card-title">{$_('report.place.title')}</h2>
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
        <button type="button" class="btn btn-primary" onclick={confirmSpot}>{$_('report.place.next')}</button>
      {/if}
    </div>
  </div>
{/if}

{#if $reportStep === 'dupe'}
  <div class="report-card" role="region" aria-label={$_('report.dupe.title')}>
    <h2 class="card-title">{$_('report.dupe.title')}</h2>
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
          <h2 class="modal-title" id="report-title">{$_('report.choose.title')}</h2>
          <button type="button" class="icon-btn" onclick={cancelReport} aria-label={$_('report.cancel')}>
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="modal-body">
          <div class="options">
            {#if osmNotesUrl}
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
          <h2 class="modal-title" id="report-title">{$_('report.form.title')}</h2>
          <button type="button" class="icon-btn" onclick={cancelReport} aria-label={$_('report.cancel')}>
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

          <p class="warning">{$_('report.form.publicWarning')}</p>

          {#if sendError}
            <p class="error" role="alert">{$_('report.form.error')}</p>
          {/if}

          <div class="card-actions">
            <button type="button" class="btn btn-secondary" onclick={() => reportStep.set('choose')}>{$_('report.form.back')}</button>
            <button type="button" class="btn btn-primary" onclick={send} disabled={sending}>
              {sending ? $_('report.form.sending') : $_('report.form.send')}
            </button>
          </div>
        </div>
      {:else}
        <div class="modal-header">
          <h2 class="modal-title" id="report-title">{$_('report.done.title')}</h2>
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

  .warning {
    margin: 0 0 0.875rem;
    padding: 0.5rem 0.625rem;
    border-radius: 8px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: #78350f;
  }

  .error {
    margin: 0 0 0.75rem;
    font-size: 0.8125rem;
    color: #b91c1c;
  }

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
