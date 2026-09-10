<!--
  Copyright 2026 Ronny Trommer <ronny@no42.org>
  SPDX-License-Identifier: GPL-3.0-only
-->
<script>
  // Detailed-coverage disclosure (#847). A deployment running a regional
  // tileset has detail only inside the imported extract; outside it the tile
  // server answers 204 and the renderer draws an empty tile. Nothing errors,
  // so a void looks exactly like a legitimately empty map.
  //
  // Shown only when the operator has declared a coverage bbox and the view has
  // left it at a zoom where detail is the only thing drawn. Same shape as
  // MacroCoverageBanner: factual, not alarming, and it blocks nothing.
  import { _ } from 'svelte-i18n';
  import { outsideBasemapCoverage } from '../stores/basemapCoverage.js';
</script>

{#if $outsideBasemapCoverage === true}
  <div class="basemap-coverage" role="status" aria-live="polite">
    {$_('basemap.outsideCoverage')}
  </div>
{/if}

<style>
  .basemap-coverage {
    position: fixed;
    top: 4.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 900;
    pointer-events: none;
    max-width: calc(100vw - 2rem);
    padding: 0.4rem 0.85rem;
    border-radius: 999px;
    background: rgba(33, 37, 41, 0.86);
    color: #fff;
    font-size: 0.82rem;
    line-height: 1.3;
    text-align: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  @media (prefers-reduced-motion: no-preference) {
    .basemap-coverage {
      animation: fade-in 160ms ease-out;
    }
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
</style>
