<script>
  // Detail panel for a selected standalone pitch (#934). Mounted by AppShell
  // in the playground panel's slot — side panel on desktop, `embedded` in the
  // full-screen mobile panel — so close/back behave the same for both kinds.
  //
  // What to show is decided in lib/pitchInfo.js: every fact appears only when
  // tagged, never as "unknown".
  import { _, locale } from 'svelte-i18n';
  import { X, Share2, Check, Image } from 'lucide-svelte';
  import { transform } from 'ol/proj';
  import { getCenter } from 'ol/extent';
  import { selection } from '../stores/selection.js';
  import { mapStore } from '../stores/map.js';
  import { location } from '../stores/location.js';
  import { mapMinZoom, regionLang } from '../lib/config.js';
  import { openingHoursState } from '../lib/openingHours.js';
  import { navigationUrl, isMobileUserAgent } from '../lib/playgroundHelpers.js';
  import { writeHash } from '../lib/deeplink.js';
  import { sportKey, sportGlyph } from '../lib/sportGlyphs.js';
  import {
    pitchSports, pitchTitle, litInfo, accessInfo, feeInfo,
    reservationInfo, hoopsInfo, wheelchairInfo,
  } from '../lib/pitchInfo.js';
  import Badge from './ui/Badge.svelte';
  import MapCompleteLink from './MapCompleteLink.svelte';
  import PanoramaxViewer from './PanoramaxViewer.svelte';
  import CommonsGallery from './CommonsGallery.svelte';

  export let embedded = false;

  $: feature = $selection.kind === 'pitch' ? $selection.feature : null;
  $: attr = feature ? feature.getProperties() : null;

  // ── Title and sports ──────────────────────────────────────────────────────
  $: title = attr ? pitchTitle(attr) : null;
  $: titleText = title ? (title.name ?? $_(title.key)) : '';
  // OSM name → region language; a generated title is interface text.
  $: titleLang = title?.name ? regionLang : $locale;
  $: sports = attr ? pitchSports(attr) : [];
  const sportLabel = (s, t) => t(`pitch.sports.${s}`, { default: s.replace(/_/g, ' ') });

  // ── Facts (each null when untagged) ───────────────────────────────────────
  $: surfaceLabel = attr?.surface
    ? attr.surface.split(';').map(s => $_('details.surfaceValues.' + s.trim(), { default: s.trim() })).join(' / ')
    : null;
  $: lit = attr ? litInfo(attr.lit) : null;
  $: access = attr ? [accessInfo(attr), feeInfo(attr), reservationInfo(attr)].filter(Boolean) : [];
  $: hoops = attr && sports.includes('basketball') ? hoopsInfo(attr) : null;
  $: wheelchair = attr ? wheelchairInfo(attr) : null;
  $: openingHoursInfo = attr?.opening_hours ? openingHoursState(attr.opening_hours, $_) : null;

  // ── Photos ────────────────────────────────────────────────────────────────
  $: panoramaxUuids = (() => {
    if (!attr) return [];
    const uuids = [];
    if (attr.panoramax) uuids.push(attr.panoramax);
    for (let i = 1; i <= 9; i++) if (attr[`panoramax:${i}`]) uuids.push(attr[`panoramax:${i}`]);
    return uuids;
  })();
  $: commonsTag = attr?.wikimedia_commons || '';
  $: imageTag = attr?.image || '';
  let commonsPhotoCount = 0;

  // ── Links ─────────────────────────────────────────────────────────────────
  $: mcOsmType = attr ? ({ W: 'way', R: 'relation', N: 'node' }[attr.osm_type] ?? 'way') : 'way';
  $: mcUrl = attr ? `https://mapcomplete.org/sport_pitches.html#${mcOsmType}/${attr.osm_id}` : '';

  $: centre = (() => {
    const g = feature?.getGeometry();
    if (!g) return null;
    const [lon, lat] = transform(getCenter(g.getExtent()), 'EPSG:3857', 'EPSG:4326');
    return { lat, lon };
  })();
  const mobile = isMobileUserAgent(typeof navigator !== 'undefined' ? navigator.userAgent : '');
  $: navUrl = centre
    ? navigationUrl({ ...centre, title: titleText, mobile, origin: $location })
    : null;

  let shareConfirmed = false;
  let shareTimeout;
  async function share() {
    if (!attr) return;
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}`
      + writeHash({ osmId: attr.osm_id, kind: 'pitch' });
    try {
      if (navigator.share) {
        await navigator.share({ title: titleText, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      shareConfirmed = true;
      clearTimeout(shareTimeout);
      shareTimeout = setTimeout(() => { shareConfirmed = false; }, 2000);
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('Share failed:', err);
    }
  }

  // Same close gesture as the playground panel: clear, and on desktop zoom
  // out a little so the user lands on a browsable view.
  const DESKTOP_CLOSE_ZOOM_OUT = 3;
  function close() {
    const view = embedded ? null : $mapStore?.getView();
    selection.clear();
    const z = view?.getZoom();
    if (Number.isFinite(z)) view.animate({ zoom: Math.max(z - DESKTOP_CLOSE_ZOOM_OUT, mapMinZoom), duration: 400 });
  }
  function onKeydown(e) {
    if (e.key === 'Escape' && feature && !embedded) close();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if feature && attr}
  <aside class={embedded ? 'pitch-panel--embedded' : 'info-panel pitch-panel'} aria-label={$_('pitch.label')}>
    <header class={embedded ? 'pitch-header pitch-header--embedded' : 'pitch-header'}>
      <div class="min-w-0 flex-1">
        <p class="pitch-kicker">{$_('pitch.label')}</p>
        <h2 class="panel-title" lang={titleLang}>{titleText}</h2>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        {#if navUrl}
          <a
            class="navigate-btn"
            href={navUrl}
            target={mobile ? undefined : '_blank'}
            rel={mobile ? undefined : 'noopener'}
          >{$_('info.navigateHere')}</a>
        {/if}
        <button class="panel-icon-btn" onclick={share} aria-label={$_('info.copyLink')}>
          {#if shareConfirmed}<Check class="h-5 w-5" />{:else}<Share2 class="h-5 w-5" />{/if}
        </button>
        {#if !embedded}
          <button class="panel-icon-btn" onclick={close} aria-label={$_('info.closeBtn')}>
            <X class="h-5 w-5" />
          </button>
        {/if}
      </div>
    </header>

    <div class={embedded ? '' : 'pitch-body'}>
      {#if sports.length > 0}
        <ul class="sport-chips" aria-label={$_('pitch.sportsLabel')}>
          {#each sports as s (s)}
            <li class="sport-chip">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                {@html sportGlyph(sportKey(s))}
              </svg>
              {sportLabel(s, $_)}
            </li>
          {/each}
        </ul>
      {/if}

      {#if openingHoursInfo || lit || access.length > 0 || wheelchair}
        <div class="status-row mb-4">
          {#if openingHoursInfo}
            <Badge variant={openingHoursInfo.open ? 'successSoft' : 'dangerSoft'} class="whitespace-nowrap">
              {openingHoursInfo.text}
            </Badge>
          {/if}
          {#if lit}
            <Badge variant={lit.key === 'pitch.lit.no' ? 'outline' : 'info'} class="whitespace-nowrap" data-fact="lit">
              {$_(lit.key, lit.values ? { values: lit.values } : undefined)}
            </Badge>
          {/if}
          {#each access as a (a.key)}
            <Badge variant="outline" class="whitespace-nowrap" data-fact="access">{$_(a.key)}</Badge>
          {/each}
          {#if wheelchair}
            <Badge variant="outline" class="whitespace-nowrap">{$_(wheelchair.key)}</Badge>
          {/if}
        </div>
      {/if}

      {#if surfaceLabel || hoops || attr.operator}
        <div class="grid grid-cols-2 gap-x-4 gap-y-2 mb-4">
          {#if surfaceLabel}
            <div class="fact-item" data-fact="surface">
              <span class="info-label">{$_('details.surfaceLabel')}</span>
              <span class="fact-value">{surfaceLabel}</span>
            </div>
          {/if}
          {#if hoops}
            <div class="fact-item">
              <span class="info-label">{$_('pitch.sports.basketball')}</span>
              <span class="fact-value">{$_(hoops.key, { values: hoops.values })}</span>
            </div>
          {/if}
          {#if attr.operator}
            <div class="fact-item">
              <span class="info-label">{$_('details.operatorLabel')}</span>
              <span class="fact-value">{attr.operator}</span>
            </div>
          {/if}
        </div>
      {/if}

      {#if commonsTag || imageTag || panoramaxUuids.length > 0}
        <section class="mb-4">
          <h3 class="section-label"><Image class="h-3 w-3 inline" /> {$_('accordion.photos')}</h3>
          {#if commonsTag || imageTag}
            <CommonsGallery commons={commonsTag} image={imageTag} bind:count={commonsPhotoCount} />
          {/if}
          {#if panoramaxUuids.length > 0}
            <PanoramaxViewer uuids={panoramaxUuids} {mcUrl} />
          {/if}
        </section>
      {/if}

      <p class="add-details">{$_('pitch.addDetails')}</p>
      <MapCompleteLink href={mcUrl} label={$_('popup.editInMapComplete')} />
    </div>
  </aside>
{/if}

<style>
  /* Desktop side panel — same frame as PlaygroundPanel's .info-panel. */
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
    display: flex;
    flex-direction: column;
    border-right: 1px solid #e5e7eb;
    color-scheme: light;
  }
  @media (max-width: 1023px) {
    .info-panel { display: none !important; }
  }

  .pitch-header {
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
  .pitch-header--embedded {
    position: static;
    padding: 0 0 0.75rem;
    margin-bottom: 0.75rem;
  }
  .pitch-body { padding: 1rem; }

  .pitch-kicker {
    margin: 0 0 2px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #9ca3af;
  }
  .panel-title {
    font-size: 17px;
    font-weight: 600;
    color: #1f2937;
    line-height: 1.3;
    margin: 0;
    /* The title shares its row with the action buttons and may shrink to
       nothing; a single long word ("Mehrzweckplatz" next to "Bring mich
       hierher") then ran underneath them. Hyphenate where the browser has a
       dictionary for the element's lang, otherwise break inside the word. */
    overflow-wrap: break-word;
    hyphens: auto;
  }

  .navigate-btn {
    padding: 6px 12px;
    background: var(--color-primary);
    color: #ffffff;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    text-decoration: none;
  }
  .navigate-btn:hover { background: var(--color-primary-hover); color: #ffffff; }

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
  }
  .panel-icon-btn:hover { background: #f3f4f6; color: #1f2937; }

  .sport-chips {
    list-style: none;
    padding: 0;
    margin: 0 0 0.75rem;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .sport-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid #a7f3d0;
    background: var(--color-primary-soft);
    color: var(--color-primary);
    font-size: 13px;
    font-weight: 500;
  }

  .status-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .info-label {
    display: block;
    color: #9ca3af;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .fact-item { display: flex; flex-direction: column; gap: 1px; }
  .fact-value { font-size: 13px; color: #1f2937; }

  .section-label {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #9ca3af;
    margin: 0 0 6px;
  }

  .add-details {
    font-size: 12px;
    color: #6b7280;
    margin: 0 0 0.5rem;
  }
</style>
