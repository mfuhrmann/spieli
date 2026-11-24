<script>
  // Zone A "what kids can do" block (#1077): the highlights first — the
  // reason to go — then each activity once, in a fixed order, icon AND
  // label (phones have no hover, so an icon alone would be a guess). It
  // replaces the device count.
  import { _ } from 'svelte-i18n';
  import HighlightsLine from './HighlightsLine.svelte';
  import { ACTIVITY_ICONS as ICONS } from '../../lib/activities.js';

  /**
   * @type {{ activities: string[], highlights?: Array<Object>, areaTheme?: string|null, loading?: boolean, after?: import('svelte').Snippet }}
   */
  // after: rendered at the end of the activity section (the hint link).
  let { activities = [], highlights = [], areaTheme = null, loading = false, after = null } = $props();
</script>

{#if highlights.length > 0}
  <div class="panel-section" data-testid="highlights-block">
    <h3 class="section-label">{$_('panel.highlights.label')}</h3>
    <HighlightsLine items={highlights} {areaTheme} />
  </div>
{/if}
{#if activities.length > 0}
  <div class="panel-section activity-block" data-testid="activity-block">
    <h3 class="section-label">{$_('panel.activities.label')}</h3>
    <ul class="activity-row" data-testid="activity-row">
      {#each activities as a (a)}
        <li class="activity-chip" data-activity={a}>
          <span class="activity-icon" aria-hidden="true">{ICONS[a]}</span>{$_(`panel.activity.${a}`)}
        </li>
      {/each}
    </ul>
    {@render after?.()}
  </div>
{:else if loading}
  <p class="activity-loading" data-testid="activity-row-loading">{$_('details.loading')}</p>
{/if}

<style>
  .activity-block { padding-bottom: 10px; }
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
    border: 1px solid var(--color-chip-line);
    background: var(--color-chip);
    color: var(--color-chip-foreground);
    font-size: 0.875rem;
    font-weight: 700;
    line-height: 1.4;
  }
  .activity-icon { font-size: 1rem; }
  .activity-loading {
    margin: 0 0 0.75rem;
    font-size: 0.8125rem;
    font-style: italic;
    color: var(--color-muted-foreground);
  }
</style>
