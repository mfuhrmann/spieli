<script>
  import { filterStore, hasActiveFilters } from '../stores/filters.js';
  import { X } from 'lucide-svelte';

  const FILTER_LABELS = {
    private:     'Nur öffentlich',
    water:       'Wasserspielplatz',
    baby:        'Baby-geeignet',
    toddler:     'Kleinkind-geeignet',
    wheelchair:  'Rollstuhlgerecht',
    bench:       'Mit Sitzbank',
    picnic:      'Mit Picknicktisch',
    shelter:     'Mit Unterstand',
    tableTennis: 'Tischtennisplatte',
    soccer:      'Mit Bolzplatz',
    basketball:  'Basketballfeld',
  };

  $: activeFilters = Object.entries($filterStore)
    .filter(([_, active]) => active)
    .map(([key]) => ({ key, label: FILTER_LABELS[key] }));

  $: hasFilters = hasActiveFilters($filterStore);

  function removeFilter(key) {
    filterStore.update(f => ({ ...f, [key]: false }));
  }

  function clearAll() {
    filterStore.update(f => Object.fromEntries(Object.keys(f).map(k => [k, false])));
  }
</script>

{#if hasFilters}
  <div class="chips-container">
    {#each activeFilters as filter (filter.key)}
      <span class="chip">
        <span class="chip-label">{filter.label}</span>
        <button
          class="chip-remove"
          onclick={() => removeFilter(filter.key)}
          aria-label="{filter.label} entfernen"
        >
          <X class="h-3 w-3" />
        </button>
      </span>
    {/each}

    {#if activeFilters.length > 1}
      <button class="clear-all" onclick={clearAll}>
        Alle löschen
      </button>
    {/if}
  </div>
{/if}

<style>
  .chips-container {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 8px 0;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px 6px 12px;
    background: white;
    border-radius: 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    font-size: 13px;
    color: #1b5e20;
    white-space: nowrap;
  }

  .chip-label {
    font-weight: 500;
  }

  .chip-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: rgba(0, 0, 0, 0.08);
    border-radius: 50%;
    cursor: pointer;
    color: #5f6368;
    transition: background 0.15s;
  }

  .chip-remove:hover {
    background: rgba(0, 0, 0, 0.16);
  }

  .clear-all {
    font-size: 12px;
    color: #1a73e8;
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px 8px;
    white-space: nowrap;
  }

  .clear-all:hover {
    text-decoration: underline;
  }
</style>
