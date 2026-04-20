<script>
  import { _ } from 'svelte-i18n';
</script>

<aside class="legend">
  <ul class="legend-list">
    <li class="legend-item">
      <span class="swatch swatch--complete"></span>
      <span>{$_('completeness.complete')}</span>
    </li>
    <li class="legend-item">
      <span class="swatch swatch--partial"></span>
      <span>{$_('completeness.partial')}</span>
    </li>
    <li class="legend-item">
      <span class="swatch swatch--missing"></span>
      <span>{$_('completeness.missing')}</span>
    </li>
    <li class="legend-item legend-item--hatch">
      <span class="swatch swatch--hatch"></span>
      <span>{$_('completeness.restrictedHint')}</span>
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

  .legend-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    line-height: 1.2;
  }

  .legend-item--hatch {
    border-top: 1px solid #e5e7eb;
    padding-top: 0.3rem;
    margin-top: 0.05rem;
    color: #6b7280;
  }

  .swatch {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1.5px solid;
  }

  /* Match vectorStyles.js colours exactly */
  .swatch--complete {
    background-color: rgba(34, 139, 34, 0.22);
    border-color: #155215;
  }

  .swatch--partial {
    background-color: rgba(234, 179, 8, 0.22);
    border-color: #92400e;
  }

  .swatch--missing {
    background-color: rgba(239, 68, 68, 0.18);
    border-color: #991b1b;
  }

  /* Diagonal hatch matching the canvas pattern in vectorStyles.js */
  .swatch--hatch {
    background:
      repeating-linear-gradient(
        -45deg,
        rgba(34, 139, 34, 0.55) 0px,
        rgba(34, 139, 34, 0.55) 1.5px,
        rgba(34, 139, 34, 0.08) 1.5px,
        rgba(34, 139, 34, 0.08) 5px
      );
    border-color: #155215;
    border-style: dashed;
  }
</style>
