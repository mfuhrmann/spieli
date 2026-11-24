<script>
  // Zone A "what kids can do" block (#1077): the highlights first — the
  // reason to go — then each activity once, in a fixed order, icon AND
  // label (phones have no hover, so an icon alone would be a guess). It
  // replaces the device count.
  import { _ } from 'svelte-i18n';
  import HighlightsLine from './HighlightsLine.svelte';
  import { ACTIVITY_ICONS as ICONS } from '../../lib/activities.js';

  /**
   * @type {{ activities: string[], highlights?: Array<Object>, areaTheme?: string|null, loading?: boolean }}
   */
  let { activities = [], highlights = [], areaTheme = null, loading = false } = $props();
</script>

{#if activities.length > 0 || highlights.length > 0}
  <div class="activity-block" data-testid="activity-block">
    <p class="row-label">{$_('panel.activities.label')}</p>
    <HighlightsLine items={highlights} {areaTheme} />
    {#if activities.length > 0}
    <ul class="activity-row" data-testid="activity-row">
      {#each activities as a (a)}
        <li class="activity-chip" data-activity={a}>
          <span class="activity-icon" aria-hidden="true">{ICONS[a]}</span>{$_(`panel.activity.${a}`)}
        </li>
      {/each}
    </ul>
    {/if}
  </div>
{:else if loading}
  <p class="activity-loading" data-testid="activity-row-loading">{$_('details.loading')}</p>
{/if}

<style>
  .activity-block { margin-bottom: 0.75rem; }
  .row-label {
    margin: 0 0 4px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #9ca3af;
  }
  .activity-row {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .activity-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px 3px 8px;
    border-radius: 999px;
    border: 1px solid #a7f3d0;
    background: var(--color-primary-soft);
    color: #065f46;
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 1.4;
  }
  .activity-icon { font-size: 1rem; }
  .activity-loading {
    margin: 0 0 0.75rem;
    font-size: 0.8125rem;
    font-style: italic;
    color: #9ca3af;
  }
</style>
