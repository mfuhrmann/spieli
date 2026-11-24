<script>
  // Detail panel for a selected standalone pitch (#934). Mounted by AppShell
  // in the playground panel's slot — side panel on desktop, `embedded` in the
  // full-screen mobile panel — so close/back behave the same for both kinds.
  //
  // What to show is decided in lib/pitchInfo.js: every fact appears only when
  // tagged, never as "unknown".
  import { _, locale } from 'svelte-i18n';
  import { humanizeTagValue, tagValuesLabel } from '../lib/deviceLabel.js';
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
  import PanelHeader from './panel/PanelHeader.svelte';
  import PhotoStrip from './panel/PhotoStrip.svelte';
  import ZoneBackground from './panel/ZoneBackground.svelte';
  import { pitchIllustrationHtml } from '../lib/equipmentAttributes.js';
  import { panoramaxUuidsFromTags } from '../lib/panoramax.js';

  export let embedded = false;

  $: feature = $selection.kind === 'pitch' ? $selection.feature : null;
  $: attr = feature ? feature.getProperties() : null;
  // Hub: which region the pitch comes from, as the playground panel shows it.
  $: backendName = feature?.get('_backendName') ?? null;

  // ── Title and sports ──────────────────────────────────────────────────────
  $: title = attr ? pitchTitle(attr) : null;
  $: titleText = title ? (title.name ?? $_(title.key)) : '';
  // OSM name → region language; a generated title is interface text.
  $: titleLang = title?.name ? regionLang : $locale;
  $: sports = attr ? pitchSports(attr) : [];
  const sportLabel = (s, t) => t(`pitch.sports.${s}`, { default: humanizeTagValue(s) });

  // ── Facts (each null when untagged) ───────────────────────────────────────
  $: surfaceLabel = attr?.surface
    ? tagValuesLabel(attr.surface, 'details.surfaceValues.', $_)
    : null;
  $: lit = attr ? litInfo(attr.lit) : null;
  $: access = attr ? [accessInfo(attr), feeInfo(attr), reservationInfo(attr)].filter(Boolean) : [];
  $: hoops = attr && sports.includes('basketball') ? hoopsInfo(attr) : null;
  $: wheelchair = attr ? wheelchairInfo(attr) : null;
  $: openingHoursInfo = attr?.opening_hours ? openingHoursState(attr.opening_hours, $_) : null;

  // ── Photos ────────────────────────────────────────────────────────────────
  // Same tags as equipmentAttributes reads, panoramax:0 included, so a pitch
  // shows the same photo whichever panel it is opened in.
  $: panoramaxUuids = panoramaxUuidsFromTags(attr);
  $: commonsTag = attr?.wikimedia_commons || '';
  $: imageTag = attr?.image || '';
  $: illustration = attr ? pitchIllustrationHtml(attr.sport, $_) : '';
  // PhotoStrip reports whether any photo resolved; the example illustration
  // stands in only when none did — no Panoramax photo, and the Commons/image
  // tags (if any) resolved to nothing. An `image=` on a foreign host or an
  // empty category must not leave neither photo nor illustration (#968).
  let photoStatus = 'loading';
  $: showIllustration = !!illustration && photoStatus === 'none';

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

  async function share() {
    if (!attr) return false;
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}`
      + writeHash({ slug: feature.get('_backendSlug') ?? null, osmId: attr.osm_id, kind: 'pitch' });
    try {
      if (navigator.share) {
        await navigator.share({ title: titleText, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('Share failed:', err);
      return false;
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
  <!-- Same zones as the playground panel (#1077): A sports, photo, access;
       B facts; C operator and MapComplete. -->
  <aside class={embedded ? 'pitch-panel--embedded' : 'info-panel pitch-panel'} aria-label={$_('pitch.label')}>
    <PanelHeader
      {embedded}
      kicker={$_('pitch.label')}
      title={titleText}
      {titleLang}
      {backendName}
      {navUrl}
      navMobile={mobile}
      onShare={share}
      onClose={close}
    />

    <div class={embedded ? '' : 'pitch-body'}>
      <section data-testid="zone-a">
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

        <PhotoStrip
          commons={commonsTag}
          image={imageTag}
          {panoramaxUuids}
          {mcUrl}
          hideEmpty={!!illustration}
          bind:status={photoStatus}
        />
        {#if showIllustration}
          <!-- No photo of this pitch: an example illustration of its sport, as
               the pitch rows inside a playground show (#968). No "Photos"
               heading — it is not a photo of this place; the caption says
               "example image". data-illustration lets imageFallback.js hide the
               whole section if the image fails. -->
          <section class="mb-3 pitch-illustration" data-illustration>
            {@html illustration}
          </section>
        {/if}

        {#if access.length > 0}
          <div class="status-row mb-3">
            {#each access as a (a.key)}
              <Badge variant="outline" class="whitespace-nowrap" data-fact="access">{$_(a.key)}</Badge>
            {/each}
          </div>
        {/if}
      </section>

      {#if surfaceLabel || lit || hoops || openingHoursInfo || wheelchair}
        <section class="panel-section grid grid-cols-2 gap-x-4 gap-y-2 mb-2" data-testid="zone-b">
          {#if surfaceLabel}
            <div class="fact-item" data-fact="surface">
              <span class="info-label">{$_('details.surfaceLabel')}</span>
              <span class="fact-value">{surfaceLabel}</span>
            </div>
          {/if}
          {#if lit}
            <div class="fact-item">
              <span class="info-label">{$_('pitch.lightingLabel')}</span>
              <span class="fact-value" data-fact="lit">{$_(lit.key, lit.values ? { values: lit.values } : undefined)}</span>
            </div>
          {/if}
          {#if hoops}
            <div class="fact-item">
              <span class="info-label">{$_('pitch.sports.basketball')}</span>
              <span class="fact-value">{$_(hoops.key, { values: hoops.values })}</span>
            </div>
          {/if}
          {#if openingHoursInfo}
            <div class="fact-item">
              <span class="info-label">{$_('panel.hoursLabel')}</span>
              <span class="fact-value">{openingHoursInfo.text}</span>
            </div>
          {/if}
          {#if wheelchair}
            <div class="fact-item">
              <span class="fact-value">{$_(wheelchair.key)}</span>
            </div>
          {/if}
        </section>
      {/if}

      <ZoneBackground {attr} {mcUrl} note={$_('pitch.addDetails')} />
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
    background: var(--color-background);
    box-shadow: 4px 0 15px -3px rgb(22 48 42 / 0.12);
    z-index: 100;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--color-border);
    color-scheme: light;
  }
  @media (max-width: 1023px) {
    .info-panel { display: none !important; }
  }

  .pitch-body { padding: 1rem; }

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
    border: 1px solid var(--color-chip-line);
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
    color: var(--color-muted-foreground);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .fact-item { display: flex; flex-direction: column; gap: 1px; }
  .fact-value { font-size: 13px; color: var(--color-foreground); }

</style>
