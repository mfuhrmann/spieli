<script>
  import { tick } from 'svelte';
  import { fromLonLat } from 'ol/proj';
  import { mapStore } from '../stores/map.js';
  import { nominatimFetch } from '../lib/nominatim.js';
  import { Search, Loader2, X } from 'lucide-svelte';
  import { cn } from '../lib/utils.js';
  import { _ } from 'svelte-i18n';

  /** Bounding box [minLon, minLat, maxLon, maxLat] to restrict Nominatim search. */
  export let regionExtent = null;
  /** Called with (lat, lon) after a result is selected; called with (null, null) on clear. */
  export let onlocation = null;

  let query = '';
  let searching = false;
  let results = [];
  let showResults = false;
  let inputEl;
  let resultsEl;

  /** Index of the option named by `aria-activedescendant`; -1 = none active. */
  let activeIndex = -1;

  const idPrefix = `searchbar-${instanceCounter++}`;
  const listboxId = `${idPrefix}-listbox`;
  const optionId = (i) => `${idPrefix}-option-${i}`;

  $: listOpen = showResults && results.length > 0;
  $: activeId = listOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined;
  $: void scrollActiveIntoView(activeIndex, listOpen);

  async function scrollActiveIntoView(i, open) {
    if (!open || i < 0) return;
    await tick();
    resultsEl?.children?.[i]?.scrollIntoView({ block: 'nearest' });
  }

  async function search() {
    const q = query.trim();
    if (!q) {
      results = [];
      activeIndex = -1;
      showResults = false;
      return;
    }
    searching = true;
    try {
      const baseParams = { q, addressdetails: 1, limit: 10 };
      let viewCenterLon = null;
      let viewCenterLat = null;
      let hits;
      if (regionExtent) {
        const [minLon, minLat, maxLon, maxLat] = regionExtent;
        const viewbox = `${minLon},${minLat},${maxLon},${maxLat}`;
        viewCenterLon = (minLon + maxLon) / 2;
        viewCenterLat = (minLat + maxLat) / 2;
        hits = await nominatimFetch('/search', { ...baseParams, viewbox, bounded: 1 }, { timeout: 0 });
        if (!hits.length) {
          hits = await nominatimFetch('/search', { ...baseParams, viewbox, bounded: 0 }, { timeout: 0 });
        }
      } else {
        hits = await nominatimFetch('/search', baseParams, { timeout: 0 });
      }
      if (viewCenterLon !== null) {
        hits = hits.slice().sort((a, b) => {
          const da = (parseFloat(a.lon) - viewCenterLon) ** 2 + (parseFloat(a.lat) - viewCenterLat) ** 2;
          const db = (parseFloat(b.lon) - viewCenterLon) ** 2 + (parseFloat(b.lat) - viewCenterLat) ** 2;
          return da - db;
        });
      }
      results = hits.slice(0, 5);
      activeIndex = -1;
      showResults = results.length > 0;
    } catch (err) {
      console.error('Search failed:', err);
      results = [];
      activeIndex = -1;
      showResults = false;
    } finally {
      searching = false;
    }
  }

  function selectResult(result) {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const coord = fromLonLat([lon, lat]);
    $mapStore?.getView().animate({ center: coord, zoom: 17 });
    query = result.display_name.split(',')[0];
    showResults = false;
    activeIndex = -1;
    if (onlocation) onlocation(lat, lon);
  }

  function onKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length === 0) return;
      // Reopen a list that was dismissed while its results are still cached.
      if (!showResults) {
        showResults = true;
        return;
      }
      activeIndex = activeIndex >= results.length - 1 ? 0 : activeIndex + 1;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!listOpen) return;
      activeIndex = activeIndex <= 0 ? results.length - 1 : activeIndex - 1;
      return;
    }
    if (e.key === 'Enter') {
      if (listOpen && activeIndex >= 0) {
        e.preventDefault();
        selectResult(results[activeIndex]);
      } else {
        search();
      }
      return;
    }
    if (e.key === 'Escape') {
      // Keep focus in the input, and keep the window-level Escape handlers
      // (PlaygroundPanel close, Map popup) from also firing on this press.
      if (listOpen) e.stopPropagation();
      showResults = false;
      activeIndex = -1;
    }
  }

  function onInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (query.length >= 2) search();
    }, 450);
  }

  let searchTimeout;

  function clearSearch() {
    query = '';
    results = [];
    activeIndex = -1;
    showResults = false;
    inputEl?.focus();
    if (onlocation) onlocation(null, null);
  }

  function onFocus() {
    if (results.length > 0) showResults = true;
  }

  /**
   * Dismissal is focus containment, not a timer: the list closes only once
   * focus leaves the whole card. A timer raced both a mouse click on a result
   * (Safari) and a touch scroll inside the list (iOS).
   */
  function onCardFocusOut(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    showResults = false;
    activeIndex = -1;
  }

  /**
   * Deliberately `mousedown`, not `pointerdown`: on touch, `mousedown` is
   * synthesised after the tap completes, so suppressing it cannot interfere
   * with scrolling the list. It keeps the input from blurring on click.
   */
  function onResultsMousedown(e) {
    e.preventDefault();
  }
</script>

<div class="search-card" onfocusout={onCardFocusOut}>
  <div class="search-input-wrapper">
    <div class="search-icon">
      {#if searching}
        <Loader2 class="h-5 w-5 text-gray-400 animate-spin" />
      {:else}
        <Search class="h-5 w-5 text-gray-400" />
      {/if}
    </div>
    <input
      bind:this={inputEl}
      type="text"
      class="search-input"
      placeholder={$_('search.placeholder')}
      bind:value={query}
      onkeydown={onKeydown}
      oninput={onInput}
      onfocus={onFocus}
      aria-label={$_('search.ariaLabel')}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={listOpen}
      aria-controls={listboxId}
      aria-activedescendant={activeId}
      aria-busy={searching}
    />
    {#if query}
      <button class="clear-btn" onclick={clearSearch} aria-label={$_('search.clearLabel')}>
        <X class="h-4 w-4 text-gray-400" />
      </button>
    {/if}
  </div>

  {#if listOpen}
    <div
      class="search-results"
      bind:this={resultsEl}
      id={listboxId}
      role="listbox"
      aria-label={$_('search.ariaLabel')}
      tabindex="-1"
      onmousedown={onResultsMousedown}
    >
      {#each results as result, i}
        <!--
          Options stay real buttons: `role="option"` overrides the native
          role, while the button keeps working for touch screen readers,
          whose virtual cursor activates options directly and never follows
          `aria-activedescendant`. `tabindex="-1"` keeps them out of the tab
          order — arrow keys, not Tab, reach them on desktop.
        -->
        <button
          class="result-item"
          class:active={i === activeIndex}
          id={optionId(i)}
          role="option"
          aria-selected={i === activeIndex}
          tabindex="-1"
          onclick={() => selectResult(result)}
          onmousemove={() => (activeIndex = i)}
        >
          <MapPin class="h-4 w-4 text-gray-400 shrink-0" />
          <span class="result-text">{result.display_name}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<script context="module">
  import { MapPin } from 'lucide-svelte';

  /**
   * Element ids in the combobox contract must be unique per instance, and the
   * component is in legacy mode so `$props.id()` is unavailable. A
   * module-scoped counter gives every mounted instance its own id prefix.
   */
  let instanceCounter = 0;
</script>

<style>
  .search-card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    width: 300px;
    max-width: calc(100vw - 5rem);
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    padding: 0 12px;
    height: 48px;
  }

  .search-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 12px;
  }

  .search-input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 15px;
    background: transparent;
    color: #202124;
  }

  .search-input::placeholder {
    color: #9aa0a6;
  }

  .search-input:disabled {
    opacity: 0.6;
  }

  .clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    margin: -8px;
    margin-left: 4px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 50%;
  }

  .clear-btn:hover {
    background: #f1f3f4;
  }

  .search-results {
    border-top: 1px solid #e8eaed;
    max-height: 280px;
    overflow-y: auto;
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    width: 100%;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  /*
   * `.active` is the single highlight, written by both arrow keys and
   * pointer movement. A separate `:hover` rule would let the pointer
   * highlight one row while `aria-activedescendant` named another.
   */
  .result-item.active {
    background: #f1f3f4;
  }

  .result-text {
    font-size: 14px;
    color: #202124;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Nominatim display_name values are long, and the search card is narrowed
     further on mobile — a single ellipsised line makes results hard to tell
     apart. Wrap to two lines below the mobile breakpoint. */
  @media (max-width: 1023px) {
    .result-item {
      align-items: flex-start;
    }

    .result-text {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      white-space: normal;
      text-overflow: clip;
    }
  }
</style>
