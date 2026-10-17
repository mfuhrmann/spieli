<script>
  import { filterStore, hasActiveFilters, activeFilterCount, defaultFilters, effectiveFilters } from '../stores/filters.js';
  import { _ } from 'svelte-i18n';
  import { Filter, Droplets, Baby, Accessibility, Armchair, UtensilsCrossed, Home, RectangleHorizontal, Goal, CircleDot, Lock, Layers, ShieldCheck, Dog, Sun, Sparkles, LockKeyhole } from 'lucide-svelte';
  import { mappingDetail } from '../stores/mappingDetail.js';

  import { tick, onDestroy } from 'svelte';
  import { mapStore } from '../stores/map.js';
  import { PITCH_MIN_ZOOM } from '../lib/pitchLayer.js';

  let open = false;
  let wrap;
  let dropdown;
  let maxHeight = null;

  // Fill the space between the button and the bottom of the window instead
  // of a fixed list height, so the list only scrolls when it really does not
  // fit (#932). Measured, not hardcoded: the button sits at a different
  // height on phones, where the controls stack.
  async function fitToViewport() {
    await tick();
    if (!dropdown) return;
    const top = dropdown.getBoundingClientRect().top;
    maxHeight = Math.max(160, window.innerHeight - top - 16);
  }
  $: if (open) fitToViewport();

  // Pitches only load from PITCH_MIN_ZOOM; below it the checkbox gave no
  // feedback at all (#947). The zoom is followed while the dropdown is open:
  // wheel, pinch and keyboard zoom do not close it.
  let zoom = null;
  let untrackZoom = null;
  function trackZoom(map) {
    untrackZoom?.();
    untrackZoom = null;
    if (!map) return;
    const view = map.getView();
    const update = () => { zoom = view.getZoom() ?? null; };
    update();
    view.on('change:resolution', update);
    untrackZoom = () => view.un('change:resolution', update);
  }
  $: trackZoom(open ? $mapStore : null);
  onDestroy(() => untrackZoom?.());
  $: pitchesNeedZoom = $filterStore.standalonePitches && zoom != null && zoom < PITCH_MIN_ZOOM;

  function onWindowClick(e) {
    if (open && wrap && !e.composedPath().includes(wrap)) open = false;
  }

  const FILTER_ICONS = {
    private:     Lock,
    water:       Droplets,
    baby:        Baby,
    toddler:     Baby,
    wheelchair:  Accessibility,
    bench:       Armchair,
    picnic:      UtensilsCrossed,
    shelter:     Home,
    tableTennis: RectangleHorizontal,
    soccer:      Goal,
    basketball:  CircleDot,
    fence:       ShieldCheck,
    hasDogs:     Dog,
    theme:       Sparkles,
    shade:       Sun,
  };

  $: FILTERS = Object.entries(FILTER_ICONS).map(([key, icon]) => ({
    key,
    label: $_('filter.labels.' + key),
    icon,
  }));

  // The mapping-detail states live in MappingDetailControl, which badges and
  // resets them itself (#924). This panel counts and clears only its own
  // filters — the same view as "mapping detail off".
  $: ownFilters = effectiveFilters($filterStore, false);
  $: active = hasActiveFilters(ownFilters);
  $: activeCount = activeFilterCount(ownFilters);

  function toggle(key) {
    filterStore.update(f => ({ ...f, [key]: !f[key] }));
  }

  function clearAll() {
    filterStore.update(f => ({
      ...defaultFilters,
      showComplete: f.showComplete,
      showPartial:  f.showPartial,
      showMissing:  f.showMissing,
    }));
  }
</script>

<svelte:window onclick={onWindowClick} onresize={() => open && fitToViewport()} />

<div class="filter-container" bind:this={wrap}>
  <button
    class="control-btn"
    class:active
    onclick={() => open = !open}
    title={$_('filter.title')}
    aria-label={$_('filter.title')}
    aria-expanded={open}
  >
    <Filter class="h-5 w-5" />
    {#if active}
      <span class="badge">{activeCount}</span>
    {/if}
  </button>

  {#if open}
    <div class="filter-dropdown" bind:this={dropdown} style={maxHeight ? `max-height: ${maxHeight}px` : ''}>
      <div class="dropdown-header">
        <span class="dropdown-title">{$_('filter.title')}</span>
        {#if active}
          <button class="clear-btn" onclick={clearAll}>
            {$_('filter.clearAll')}
          </button>
        {/if}
      </div>

      <div class="filter-list">
        {#each FILTERS as f}
          <label class="filter-item" class:checked={$filterStore[f.key]}>
            <input
              type="checkbox"
              checked={$filterStore[f.key]}
              onchange={() => toggle(f.key)}
            />
            <svelte:component this={f.icon} class="h-4 w-4" />
            <span>{f.label}</span>
          </label>
        {/each}
      </div>

      <div class="layer-section">
        <span class="layer-title"><Layers class="h-3 w-3" /> {$_('filter.layers')}</span>
        <label class="filter-item" class:checked={$filterStore.standalonePitches}>
          <input
            type="checkbox"
            checked={$filterStore.standalonePitches}
            onchange={() => toggle('standalonePitches')}
          />
          <Goal class="h-4 w-4" />
          <span>{$_('filter.standalonePitches')}</span>
        </label>
        {#if pitchesNeedZoom}
          <p class="layer-hint">{$_('filter.standalonePitchesZoomHint')}</p>
        {/if}
        <!-- Finder view only: with mapping detail on, private playgrounds are
             always shown (#1002), so the toggle would do nothing there. -->
        {#if !$mappingDetail}
          <label class="filter-item" class:checked={$filterStore.showPrivate}>
            <input
              type="checkbox"
              checked={$filterStore.showPrivate}
              onchange={() => toggle('showPrivate')}
            />
            <LockKeyhole class="h-4 w-4" />
            <span>{$_('filter.showPrivate')}</span>
          </label>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .filter-container {
    position: relative;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: white;
    border: none;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    color: #666;
    transition: background 0.15s, color 0.15s;
    position: relative;
  }

  .control-btn:hover {
    background: #f5f5f5;
    color: #333;
  }

  .control-btn.active {
    background: var(--color-primary-soft);
    color: var(--color-primary);
  }

  .badge {
    position: absolute;
    top: -4px;
    right: -4px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    font-size: 11px;
    font-weight: 600;
    background: var(--color-primary);
    color: white;
    border-radius: 9px;
  }

  .filter-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    min-width: 260px;
    z-index: 300;
    animation: fadeIn 0.15s ease-out;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-header,
  .completeness-section,
  .layer-section {
    flex-shrink: 0;
  }

  .layer-hint {
    margin: -4px 16px 8px 46px;
    font-size: 12px;
    color: #6b7280;
  }

  .dropdown-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #e8eaed;
  }

  .dropdown-title {
    font-size: 14px;
    font-weight: 600;
    color: #202124;
  }

  .clear-btn {
    font-size: 12px;
    color: #1a73e8;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .clear-btn:hover {
    text-decoration: underline;
  }

  .filter-list {
    padding: 8px 0;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }

  .filter-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    cursor: pointer;
    font-size: 14px;
    color: #5f6368;
    transition: background 0.15s;
  }

  .filter-item:hover {
    background: #f1f3f4;
  }

  .filter-item.checked {
    background: var(--color-primary-soft);
    color: var(--color-primary);
  }

  .filter-item input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: var(--color-primary);
    cursor: pointer;
  }

  .layer-section {
    border-top: 1px solid #e8eaed;
    padding-top: 4px;
  }

  .layer-title {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    color: #80868b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 6px 16px 2px;
  }
</style>
