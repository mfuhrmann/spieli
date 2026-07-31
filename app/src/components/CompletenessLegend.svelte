<script>
  import { _ } from 'svelte-i18n';
  import { COMPLETENESS_PALETTE, COMPLETENESS_ORDER } from '../lib/completenessPalette.js';

  // Swatches read straight from the map palette — the legend cannot drift
  // away from the polygons and rings it explains.
  const labelKey = {
    complete: 'mappingDetail.detailed',
    partial:  'mappingDetail.basic',
    missing:  'mappingDetail.notMapped',
  };
</script>

<aside class="legend">
  <p class="legend-title">{$_('mappingDetail.legendTitle')}</p>
  <ul class="legend-rows">
    {#each COMPLETENESS_ORDER as key (key)}
      <li class="legend-row">
        <span
          class="swatch"
          style="background: {COMPLETENESS_PALETTE[key].fill}; border-color: {COMPLETENESS_PALETTE[key].stroke};"
          aria-hidden="true"
        ></span>
        <span>{$_(labelKey[key])}</span>
      </li>
    {/each}
    <li class="legend-row">
      <span class="swatch swatch-photo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="12" height="12">
          <path
            d="M9 3.5h6L16.5 6H21a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5L9 3.5z"
            fill="#ffffff" stroke="#14532d" stroke-width="2" stroke-linejoin="round"
          />
          <circle cx="12" cy="13" r="3.6" fill="none" stroke="#14532d" stroke-width="2" />
        </svg>
      </span>
      <span>{$_('mappingDetail.hasPhoto')}</span>
    </li>
  </ul>
</aside>

<style>
  .legend {
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(4px);
    border-radius: 0.5rem;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    padding: 0.5rem 0.65rem;
    font-size: 0.72rem;
    color: #374151;
    max-width: 200px;
  }

  .legend-title {
    margin: 0 0 0.35rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6b7280;
  }

  .legend-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.22rem;
  }

  .legend-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    line-height: 1.2;
  }

  .swatch {
    flex: 0 0 auto;
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 0.2rem;
    border: 1.5px solid transparent;
  }

  .swatch-photo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-color: transparent;
  }

</style>
