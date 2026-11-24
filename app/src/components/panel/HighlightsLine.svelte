<script>
  // Zone A highlights (#1077): theme first, then water play (all water
  // devices as one), then devices marked `highlight` in the catalogue.
  import { _ } from 'svelte-i18n';
  import { themeIcon, themeName } from '../../lib/playgroundThemes.js';
  import { deviceLabel } from '../../lib/deviceLabel.js';

  /**
   * @type {{ items: Array<{kind: string, value?: string, key?: string}>, areaTheme?: string | null }}
   * areaTheme: the playground's own theme, worded as "a … playground";
   * themes that only come from devices are named plainly.
   */
  let { items = [], areaTheme = null } = $props();

  function label(h, t) {
    if (h.kind === 'theme') {
      return h.value === areaTheme
        ? t('details.themedPlayground', { values: { theme: themeName(h.value, t) } })
        : themeName(h.value, t);
    }
    if (h.kind === 'water') return t('panel.highlights.water');
    return deviceLabel(h.key, t);
  }
  function icon(h) {
    if (h.kind === 'theme') return themeIcon(h.value);
    if (h.kind === 'water') return '💧';
    return '⭐';
  }
</script>

{#if items.length > 0}
  <ul class="highlights" data-testid="highlights" aria-label={$_('panel.highlights.label')}>
    {#each items as h (h.kind + (h.value ?? h.key ?? ''))}
      <li class="highlight" data-highlight={h.kind === 'device' ? h.key : h.kind}>
        <span aria-hidden="true">{icon(h)}</span>{label(h, $_)}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .highlights {
    list-style: none;
    padding: 0;
    margin: 0 0 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  /* All highlights in one colour, the theme included (#1081): yellow,
     because they are the highlights; activities stay green. */
  .highlight {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 11px 3px 8px;
    border-radius: 999px;
    background: var(--color-highlight);
    border: 1px solid var(--color-highlight-line);
    color: var(--color-highlight-foreground);
    font-size: 0.875rem;
    font-weight: 700;
    line-height: 1.4;
  }
</style>
