<script>
  import { _ } from 'svelte-i18n';
  import Badge from './ui/Badge.svelte';
</script>

<aside class="legend">
  <p class="legend-title">{$_('mappingDetail.legendTitle')}</p>
  <div class="legend-chips">
    <Badge variant="success">{$_('mappingDetail.detailed')}</Badge>
    <Badge variant="warning">{$_('mappingDetail.basic')}</Badge>
    <Badge variant="destructive">{$_('mappingDetail.noDetails')}</Badge>
  </div>
  <!-- The photo marker is additive, not a step in the ramp, so it sits below
       the three chips rather than beside them. -->
  <p class="legend-photo">
    <span class="photo-glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="12" height="12">
        <path
          d="M9 3.5h6L16.5 6H21a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5L9 3.5z"
          fill="#ffffff" stroke="#14532d" stroke-width="2" stroke-linejoin="round"
        />
        <circle cx="12" cy="13" r="3.6" fill="none" stroke="#14532d" stroke-width="2" />
      </svg>
    </span>
    {$_('mappingDetail.hasPhoto')}
  </p>
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

  .legend-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .legend-photo {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin: 0.35rem 0 0;
  }

  .photo-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

</style>
