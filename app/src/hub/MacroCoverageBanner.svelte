<!--
  Copyright 2026 Ronny Trommer <ronny@no42.org>
  SPDX-License-Identifier: GPL-3.0-only
-->
<script>
  // Macro-tier coverage disclosure (#688). When a filter is active at the
  // country (macro) zoom but only some backends could apply it, show a single
  // non-alarming "filter covers N of M regions" banner — so the country view
  // never silently presents partial coverage as complete. Hidden when coverage
  // is full (answered === total), no filter is active, or not at macro tier.
  import { _ } from 'svelte-i18n';
  import { activeTierStore } from '../stores/tier.js';

  /** @type {import('svelte/store').Readable<{answered:number,total:number,cantFilter:string[]}|null>} */
  export let coverage;

  $: partial =
    $activeTierStore === 'macro' && $coverage && $coverage.answered < $coverage.total;
</script>

{#if partial}
  <div class="macro-coverage" role="status" aria-live="polite">
    {$_('hub.macroCoverage', { values: { answered: $coverage.answered, total: $coverage.total } })}
  </div>
{/if}

<style>
  .macro-coverage {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 900;
    pointer-events: none;
    max-width: calc(100vw - 2rem);
    padding: 0.4rem 0.85rem;
    border-radius: 9999px;
    background: rgba(255, 251, 235, 0.97); /* amber-50 */
    border: 1px solid #fcd34d; /* amber-300 */
    color: #92400e; /* amber-800 */
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  }
</style>
