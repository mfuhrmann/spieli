<script>
  import { filterStore, hasActiveFilters } from '../stores/filters.js';

  let open = false;
  let wrap;

  function onWindowClick(e) {
    if (open && wrap && !wrap.contains(e.target)) open = false;
  }

  const FILTERS = [
    { key: 'private',     label: 'Nur öffentlich zugängliche' },
    { key: 'water',       label: 'Wasserspielplatz' },
    { key: 'baby',        label: 'Baby-geeignet' },
    { key: 'toddler',     label: 'Kleinkind-geeignet' },
    { key: 'wheelchair',  label: 'Rollstuhlgerecht' },
    { key: 'bench',       label: 'Mit Sitzbank' },
    { key: 'picnic',      label: 'Mit Picknicktisch' },
    { key: 'shelter',     label: 'Mit Unterstand' },
    { key: 'tableTennis', label: 'Mit Tischtennisplatte' },
    { key: 'soccer',      label: 'Mit Bolzplatz' },
    { key: 'basketball',  label: 'Mit Basketballfeld' },
  ];

  $: active = hasActiveFilters($filterStore);

  function toggle(key) {
    filterStore.update(f => ({ ...f, [key]: !f[key] }));
  }

  function clearAll() {
    filterStore.update(f => Object.fromEntries(Object.keys(f).map(k => [k, false])));
  }
</script>

<svelte:window onclick={onWindowClick} />

<div class="filter-wrap" bind:this={wrap}>
  <button
    class="filter-btn btn btn-sm {active ? 'btn-primary' : 'btn-outline-secondary'}"
    onclick={() => open = !open}
    title="Filter"
    aria-label="Filter"
  >
    <span class="bi bi-funnel{active ? '-fill' : ''}"></span>
    {#if active}
      <span class="filter-badge">{Object.values($filterStore).filter(Boolean).length}</span>
    {/if}
  </button>

  {#if open}
    <div class="filter-dropdown">
      <div class="filter-header">
        <span class="fw-semibold" style="font-size:0.85rem;">Filter</span>
        {#if active}
          <button class="btn btn-link btn-sm p-0 text-muted" onclick={clearAll} style="font-size:0.75rem;">
            Alle zurücksetzen
          </button>
        {/if}
      </div>
      {#each FILTERS as f}
        <label class="filter-item">
          <input
            type="checkbox"
            class="form-check-input me-2"
            checked={$filterStore[f.key]}
            onchange={() => toggle(f.key)}
          />
          {f.label}
        </label>
      {/each}
    </div>
  {/if}
</div>

<style>
  .filter-wrap { position: relative; }

  .filter-btn { padding: 0.25rem 0.5rem; line-height: 1; position: relative; }

  .filter-badge {
    position: absolute;
    top: -4px; right: -4px;
    background: #dc3545;
    color: #fff;
    font-size: 0.6rem;
    border-radius: 999px;
    width: 14px; height: 14px;
    display: flex; align-items: center; justify-content: center;
    line-height: 1;
  }

  .filter-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: #fff;
    border: 1px solid #dee2e6;
    border-radius: 0.4rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    padding: 0.5rem 0.75rem;
    min-width: 210px;
    z-index: 200;
  }

  .filter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.4rem;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid #dee2e6;
  }

  .filter-item {
    display: flex;
    align-items: center;
    font-size: 0.82rem;
    padding: 0.2rem 0;
    cursor: pointer;
    white-space: nowrap;
  }
</style>
