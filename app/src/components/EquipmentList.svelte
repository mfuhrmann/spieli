<script>
  import { objDevices, objFitnessStation } from '../lib/objPlaygroundEquipment.js';
  import { objColors } from '../lib/vectorStyles.js';
  import { getEquipmentAttributesFromProps } from '../lib/equipmentAttributes.js';
  import { _ } from 'svelte-i18n';

  /** @type {Array} GeoJSON features from fetchPlaygroundEquipment */
  export let features = [];
  /** @type {Object} Playground polygon properties (for playground:<key> fallback) */
  export let playgroundAttr = {};

  $: deviceFeatures  = features.filter(f => f.properties.playground && f.properties.playground !== 'yes');
  $: fitnessFeatures = features.filter(f => f.properties.leisure === 'fitness_station');
  $: pitchFeatures   = features.filter(f => f.properties.leisure === 'pitch');
  $: benchCount   = features.filter(f => f.properties.amenity === 'bench').length;
  $: shelterCount = features.filter(f => f.properties.amenity === 'shelter').length;
  $: picnicCount  = features.filter(f => f.properties.leisure === 'picnic_table').length;

  // Fallback: playground:<key>=<count|yes> on the polygon itself
  $: fallbackCounts = (() => {
    if (deviceFeatures.length) return {};
    const counts = {};
    for (const [tag, val] of Object.entries(playgroundAttr)) {
      if (!tag.startsWith('playground:')) continue;
      const key = tag.replace('playground:', '');
      const n = parseInt(val) || (val === 'yes' ? 1 : 0);
      if (n > 0) counts[key] = n;
    }
    return counts;
  })();

  // Open/closed state per item (keyed by osm_id or random uid)
  let openItems = new Set();
  function toggleItem(uid) {
    const next = new Set(openItems);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    openItems = next;
  }
  function uid(f) {
    return `dev-${f.properties.osm_id ?? Math.random().toString(36).slice(2)}`;
  }

  // Panoramax fullscreen modal for device photos
  let modalUuid = null;
  const thumbUrl  = uuid => `https://api.panoramax.xyz/api/pictures/${uuid}/thumb.jpg`;
  const viewerUrl = uuid => `https://api.panoramax.xyz/?pic=${uuid}&nav=none&focus=pic`;
</script>

{#if features.length === 0 && Object.keys(fallbackCounts).length === 0}
  <ul><li><small class="text-muted">{$_('equipment.noDevices')}</small></li></ul>
  <p class="text-muted mt-2 mb-0" style="font-size:smaller">
    Hilf mit und trage Spielgeräte auf
    <a href="https://mapcomplete.org/playgrounds.html" target="_blank" rel="noopener">MapComplete</a> ein.
  </p>
{:else}
  <!-- Summary counts -->
  <ul class="summary-list">
    {#if deviceFeatures.length}
      <li>{$_('equipment.deviceCount', { values: { count: deviceFeatures.length } })}</li>
    {/if}
    {#if fitnessFeatures.length}
      <li>{$_('equipment.fitnessCount', { values: { count: fitnessFeatures.length } })}</li>
    {/if}
    {#if benchCount}
      <li>{$_('equipment.benches', { values: { count: benchCount } })}</li>
    {/if}
    {#if shelterCount}
      <li>{$_('equipment.shelters', { values: { count: shelterCount } })}</li>
    {/if}
    {#if picnicCount}
      <li>{$_('equipment.picnic', { values: { count: picnicCount } })}</li>
    {/if}
  </ul>

  <!-- Detailed device list (mapped individually) -->
  {#if deviceFeatures.length || fitnessFeatures.length || pitchFeatures.length}
    <ul class="mb-0 device-list">
      {#each deviceFeatures as f (f.properties.osm_id)}
        {@const key = f.properties.playground}
        {@const name = $_('equipment.devices.' + key, { default: objDevices[key]?.name_de ?? key })}
        {@const cat = objDevices[key]?.category ?? 'fallback'}
        {@const color = objColors[cat] ?? objColors['fallback']}
        {@const detail = getEquipmentAttributesFromProps(f.properties, $_)}
        {@const id = uid(f)}
        <li>
          {#if detail.html || detail.panoramaxUuid}
            <button type="button" class="device-toggle" onclick={() => toggleItem(id)}>
              <span style="color:{color}">●</span> {name}
              <span class="bi {openItems.has(id) ? 'bi-chevron-up' : 'bi-chevron-down'} device-chevron"></span>
            </button>
            {#if openItems.has(id)}
              <div class="device-detail">
                {#if detail.panoramaxUuid}
                  <button type="button" class="photo-thumb-btn" onclick={() => modalUuid = detail.panoramaxUuid} title={$_('popup.devicePhoto')}>
                    <img src={thumbUrl(detail.panoramaxUuid)} alt={$_('modal.streetPhoto')} class="photo-thumb" />
                    <span class="photo-label"><span class="bi bi-camera"></span> {$_('popup.devicePhoto')}</span>
                  </button>
                {/if}
                {@html detail.html}
              </div>
            {/if}
          {:else}
            <span style="color:{color}">●</span> {name}
          {/if}
        </li>
      {/each}

      {#each fitnessFeatures as f (f.properties.osm_id)}
        {@const fsType = f.properties.fitness_station}
        {@const name = fsType
          ? $_('equipment.fitness.' + fsType, { default: objFitnessStation[fsType] ?? $_('equipment.fitnessDefault') })
          : $_('equipment.fitnessDefault')}
        {@const color = objColors['activity'] ?? objColors['fallback']}
        {@const detail = getEquipmentAttributesFromProps(f.properties, $_)}
        {@const id = uid(f)}
        <li>
          {#if detail.html || detail.panoramaxUuid}
            <button type="button" class="device-toggle" onclick={() => toggleItem(id)}>
              <span style="color:{color}">●</span> {name}
              <span class="bi {openItems.has(id) ? 'bi-chevron-up' : 'bi-chevron-down'} device-chevron"></span>
            </button>
            {#if openItems.has(id)}
              <div class="device-detail">
                {#if detail.panoramaxUuid}
                  <button type="button" class="photo-thumb-btn" onclick={() => modalUuid = detail.panoramaxUuid} title={$_('popup.devicePhoto')}>
                    <img src={thumbUrl(detail.panoramaxUuid)} alt={$_('modal.streetPhoto')} class="photo-thumb" />
                    <span class="photo-label"><span class="bi bi-camera"></span> {$_('popup.devicePhoto')}</span>
                  </button>
                {/if}
                {@html detail.html}
              </div>
            {/if}
          {:else}
            <span style="color:{color}">●</span> {name}
          {/if}
        </li>
      {/each}

      {#each pitchFeatures as f (f.properties.osm_id)}
        {@const sport = f.properties.sport ?? ''}
        {@const label = sport
          ? $_('equipment.pitches.' + sport, { default: `${$_('equipment.pitchDefault')} (${sport})` })
          : $_('equipment.pitchDefault')}
        {@const color = objColors['fallback']}
        {@const detail = getEquipmentAttributesFromProps(f.properties, $_)}
        {@const id = uid(f)}
        <li>
          {#if detail.html || detail.panoramaxUuid}
            <button type="button" class="device-toggle" onclick={() => toggleItem(id)}>
              <span style="color:{color}">●</span> {label}
              <span class="bi {openItems.has(id) ? 'bi-chevron-up' : 'bi-chevron-down'} device-chevron"></span>
            </button>
            {#if openItems.has(id)}
              <div class="device-detail">
                {#if detail.panoramaxUuid}
                  <button type="button" class="photo-thumb-btn" onclick={() => modalUuid = detail.panoramaxUuid} title={$_('popup.devicePhoto')}>
                    <img src={thumbUrl(detail.panoramaxUuid)} alt={$_('modal.streetPhoto')} class="photo-thumb" />
                    <span class="photo-label"><span class="bi bi-camera"></span> {$_('popup.devicePhoto')}</span>
                  </button>
                {/if}
                {@html detail.html}
              </div>
            {/if}
          {:else}
            <span style="color:{color}">●</span> {label}
          {/if}
        </li>
      {/each}
    </ul>

  <!-- Fallback: playground:<key> tags on the polygon itself -->
  {:else if Object.keys(fallbackCounts).length}
    <ul class="mb-0">
      {#each Object.entries(fallbackCounts) as [key, count]}
        {@const name = $_('equipment.devices.' + key, { default: objDevices[key]?.name_de ?? key })}
        {@const cat  = objDevices[key]?.category ?? 'fallback'}
        {@const color = objColors[cat] ?? objColors['fallback']}
        <li>
          <span style="color:{color}">●</span>
          {count > 1 ? `${count}× ` : ''}{name}
        </li>
      {/each}
    </ul>
    <p class="text-muted mt-2 mb-0" style="font-size:smaller">
      Hilf mit und trage Spielgeräte auf
      <a href="https://mapcomplete.org/playgrounds.html" target="_blank" rel="noopener">MapComplete</a> ein.
    </p>
  {/if}
{/if}

{#if modalUuid}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="photo-modal-backdrop" onclick={() => modalUuid = null}>
    <div class="photo-modal" onclick={e => e.stopPropagation()}
         role="dialog" aria-modal="true" aria-label={$_('popup.devicePhoto')} tabindex="-1">
      <div class="photo-modal-header">
        <span class="photo-modal-title">{$_('popup.devicePhoto')}</span>
        <button type="button" class="btn-close" onclick={() => modalUuid = null} aria-label={$_('info.closeBtn')}></button>
      </div>
      <iframe
        src={viewerUrl(modalUuid)}
        style="width:100%; flex:1; border:none;"
        title={$_('popup.devicePhoto')}
        allowfullscreen
      ></iframe>
    </div>
  </div>
{/if}

<style>
  .summary-list { font-size: 13px; color: #1f2937; }
  .device-list { padding-left: 0; list-style: none; font-size: 13px; color: #1f2937; }
  .device-list li { margin-bottom: 0.25rem; }
  .device-toggle { cursor: pointer; user-select: none; }
  .device-toggle:hover { text-decoration: underline; }
  .device-chevron { font-size: 0.7rem; margin-left: 0.25rem; }
  .device-detail {
    margin: 0.25rem 0 0.5rem 1rem;
    font-size: smaller;
  }
  .device-detail :global(ul) { padding-left: 1.2rem; margin-bottom: 0; }
  .device-detail :global(img) { width: 100%; border-radius: 4px; margin-bottom: 0.25rem; }

  .photo-thumb-btn {
    display: block;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    margin-bottom: 0.25rem;
  }
  .photo-thumb {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: cover;
    border-radius: 4px;
    display: block;
  }
  .photo-thumb-btn:hover .photo-thumb { opacity: 0.85; }
  .photo-label {
    display: block;
    font-size: 0.75rem;
    color: #6c757d;
    margin-top: 2px;
  }

  .photo-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    z-index: 1050;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .photo-modal {
    background: #fff;
    border-radius: 6px;
    width: min(90vw, 1100px);
    height: min(80vh, 700px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .photo-modal-header {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #dee2e6;
    gap: 0.5rem;
  }
  .photo-modal-title {
    flex: 1;
    font-size: 0.9rem;
    font-weight: 600;
  }
</style>
