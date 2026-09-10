<script>
  import { fromLonLat } from 'ol/proj';
  import { tick } from 'svelte';
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
  let cardEl;

  // Index of the keyboard/mouse-highlighted option, or -1 for none. Exposed
  // via aria-activedescendant per the WAI-ARIA combobox pattern - DOM focus
  // deliberately stays on the input the whole time, only the referenced
  // "active" option moves.
  let activeIndex = -1;

  // Stable ids for the ARIA relationship between the input and its listbox.
  // Svelte 5 legacy mode ($props.id() isn't available), so a module-scoped
  // counter gives each SearchBar instance its own id namespace.
  const instanceId = instanceCounter++;
  const listboxId = `searchbar-listbox-${instanceId}`;
  function optionId(i) {
    return `searchbar-option-${instanceId}-${i}`;
  }

  // Moves the active option and scrolls it into view - used for keyboard
  // navigation only. Mouse hover sets activeIndex directly without
  // scrolling, since the pointer is already at that position.
  async function activateAndScroll(i) {
    activeIndex = i;
    await tick();
    document.getElementById(optionId(i))?.scrollIntoView({ block: 'nearest' });
  }

  async function search() {
    const q = query.trim();
    if (!q) {
      results = [];
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
      showResults = results.length > 0;
      // The debounce below is 450ms, so a stale index from the previous
      // result set would otherwise point at (and announce) the wrong row.
      activeIndex = -1;
    } catch (err) {
      console.error('Search failed:', err);
      results = [];
      showResults = false;
      activeIndex = -1;
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
      if (!showResults) {
        // A closed list with cached results (e.g. re-focused after
        // Escape) reopens on ArrowDown rather than requiring a fresh
        // search.
        showResults = true;
        activateAndScroll(0);
      } else {
        activateAndScroll(Math.min(activeIndex + 1, results.length - 1));
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length === 0) return;
      activateAndScroll(Math.max(activeIndex - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      if (activeIndex >= 0 && results[activeIndex]) {
        selectResult(results[activeIndex]);
      } else {
        search();
      }
      return;
    }
    if (e.key === 'Escape') {
      // Deliberately no inputEl.blur() here - Escape closes the list
      // without moving focus out of the input, matching the combobox
      // pattern (the user is still typing).
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
    showResults = false;
    activeIndex = -1;
    inputEl?.focus();
    if (onlocation) onlocation(null, null);
  }

  function onFocus() {
    if (results.length > 0) showResults = true;
  }

  // Replaces a setTimeout-after-blur approach, which had two real bugs:
  // clicking a result raced the 200ms timer in Safari (mousedown there
  // doesn't always focus the button, so relatedTarget on the input's own
  // blur came back null), and scrolling the results list on iOS drops
  // input focus mid-scroll, hiding the list under the user's thumb.
  // focusout bubbles (unlike blur), so one handler on the whole card
  // catches focus leaving to anywhere outside it - including the clear
  // button, which the previous version's tab order broke.
  function onFocusout(e) {
    if (cardEl && e.relatedTarget && cardEl.contains(e.relatedTarget)) return;
    showResults = false;
    activeIndex = -1;
  }

  // Deliberately mousedown, not pointerdown: mousedown is synthetic on
  // touch and fires after the tap completes, so preventing it can't
  // interfere with scrolling the results list. Preventing pointerdown
  // would break that scroll. This keeps the input focused when a result
  // is clicked, so onFocusout above doesn't fire (and hide the list)
  // before the click handler runs.
  function onResultsMousedown(e) {
    e.preventDefault();
  }
</script>

<div class="search-card" bind:this={cardEl} onfocusout={onFocusout}>
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
      aria-expanded={showResults && results.length > 0}
      aria-autocomplete="list"
      aria-controls={listboxId}
      aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
      aria-busy={searching}
    />
    {#if query}
      <button class="clear-btn" onclick={clearSearch} aria-label={$_('search.clearLabel')}>
        <X class="h-4 w-4 text-gray-400" />
      </button>
    {/if}
  </div>

  {#if showResults && results.length > 0}
    <div
      class="search-results"
      role="listbox"
      id={listboxId}
      tabindex="-1"
      onmousedown={onResultsMousedown}
    >
      {#each results as result, i}
        <button
          class="result-item"
          class:active={i === activeIndex}
          role="option"
          id={optionId(i)}
          aria-selected={i === activeIndex}
          tabindex="-1"
          onclick={() => selectResult(result)}
          onmousemove={() => { activeIndex = i; }}
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

  /* .active (not :hover) is the single highlight source of truth, driven
     by mousemove as well as keyboard nav - having both would let pointer
     and keyboard produce two different-looking highlighted rows at once. */
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

  @media (max-width: 1023px) {
    /* The search card is narrowed further on mobile to clear the
       top-right controls (see AppShell.svelte), so long Nominatim
       display_name values need room to wrap rather than clipping to an
       even shorter single line. */
    .result-text {
      white-space: normal;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  }
</style>
