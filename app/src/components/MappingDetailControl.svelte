<script>
  import { filterStore, defaultFilters } from '../stores/filters.js';
  import { mappingDetail } from '../stores/mappingDetail.js';
  import { _ } from 'svelte-i18n';
  import { BarChart3 } from 'lucide-svelte';
  import { COMPLETENESS_PALETTE } from '../lib/completenessPalette.js';

  // Opt-in mapping detail (#924). The map defaults to the plain finder view;
  // this control switches mapping detail on and holds the detailed / basic /
  // no-details filters that used to sit in FilterPanel. The filter rows carry
  // the palette swatches, so they double as the legend.

  let open = false;
  let wrap;
  let button;

  function onWindowClick(e) {
    if (open && wrap && !e.composedPath().includes(wrap)) open = false;
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && open) {
      open = false;
      button?.focus();
    }
  }

  const STATES = ['showComplete', 'showPartial', 'showMissing'];
  const PALETTE_KEY = { showComplete: 'complete', showPartial: 'partial', showMissing: 'missing' };

  // Hidden states only count while they apply, i.e. while detail is on.
  $: hiddenCount = $mappingDetail ? STATES.filter(k => !$filterStore[k]).length : 0;

  function toggleState(key) {
    filterStore.update(f => ({ ...f, [key]: !f[key] }));
  }

  function resetStates() {
    filterStore.update(f => {
      const next = { ...f };
      for (const k of STATES) next[k] = defaultFilters[k];
      return next;
    });
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKeydown} />

<div class="detail-container" bind:this={wrap}>
  <button
    bind:this={button}
    class="control-btn"
    class:active={$mappingDetail}
    onclick={() => open = !open}
    title={$_('mappingDetail.toggle')}
    aria-label={$_('mappingDetail.toggle')}
    aria-pressed={$mappingDetail}
    aria-expanded={open}
  >
    <BarChart3 class="h-5 w-5" />
    {#if hiddenCount > 0}
      <span class="badge">{hiddenCount}</span>
    {/if}
  </button>

  {#if open}
    <div class="detail-dropdown">
      <label class="switch-row">
        <span class="switch-text">
          <span class="switch-label">{$_('mappingDetail.show')}</span>
          <span class="switch-hint">{$_('mappingDetail.hint')}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          class="switch"
          checked={$mappingDetail}
          onchange={(e) => mappingDetail.set(e.currentTarget.checked)}
        />
      </label>

      <div class="state-section" class:disabled={!$mappingDetail}>
        <div class="section-header">
          <span class="section-title">{$_('mappingDetail.filterTitle')}</span>
          {#if hiddenCount > 0}
            <button class="clear-btn" onclick={resetStates}>{$_('filter.clearAll')}</button>
          {/if}
        </div>
        {#each STATES as key}
          <label class="state-item" class:state-hidden={!$filterStore[key]}>
            <input
              type="checkbox"
              checked={$filterStore[key]}
              disabled={!$mappingDetail}
              onchange={() => toggleState(key)}
            />
            <span
              class="swatch"
              style="background: {COMPLETENESS_PALETTE[PALETTE_KEY[key]].base}; border-color: {COMPLETENESS_PALETTE[PALETTE_KEY[key]].stroke};"
              aria-hidden="true"
            ></span>
            <span>{$_('filter.mappingDetail.' + key)}</span>
          </label>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .detail-container {
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
    background: #e8f5e9;
    color: #1b5e20;
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
    background: #1b5e20;
    color: white;
    border-radius: 9px;
  }

  .detail-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    width: 280px;
    max-width: calc(100vw - 32px);
    z-index: 300;
    animation: fadeIn 0.15s ease-out;
    overflow: hidden;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .switch-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid #e8eaed;
    cursor: pointer;
  }

  .switch-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .switch-label {
    font-size: 14px;
    font-weight: 600;
    color: #202124;
  }

  .switch-hint {
    font-size: 12px;
    color: #5f6368;
    line-height: 1.35;
  }

  /* A checkbox restyled as a switch; role="switch" announces it as one. */
  .switch {
    appearance: none;
    flex-shrink: 0;
    width: 36px;
    height: 20px;
    margin-top: 1px;
    border-radius: 10px;
    background: #c4c7c5;
    position: relative;
    cursor: pointer;
    transition: background 0.15s;
  }

  .switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transition: transform 0.15s;
  }

  .switch:checked {
    background: #1b5e20;
  }

  .switch:checked::after {
    transform: translateX(16px);
  }

  .switch:focus-visible {
    outline: 2px solid #1a73e8;
    outline-offset: 2px;
  }

  .state-section {
    padding: 4px 0 8px;
  }

  .state-section.disabled {
    opacity: 0.5;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 16px 2px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    color: #80868b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
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

  .state-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    cursor: pointer;
    font-size: 14px;
    color: #5f6368;
    transition: background 0.15s;
  }

  .state-section:not(.disabled) .state-item:hover {
    background: #f1f3f4;
  }

  .state-section.disabled .state-item {
    cursor: default;
  }

  .state-item input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: #1b5e20;
    cursor: inherit;
  }

  .swatch {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    border: 2px solid;
    flex-shrink: 0;
  }

  .state-item.state-hidden {
    text-decoration: line-through;
    opacity: 0.6;
  }
</style>
