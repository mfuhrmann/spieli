<script>
  import { _ } from 'svelte-i18n';

  /** @type {number|null} */
  export let minAge = null;
  /** @type {number|null} */
  export let maxAge = null;

  const AGE_GROUPS = [
    { key: 'toddler',  emoji: '🍼', lo: 0,  hi: 3  },
    { key: 'child',    emoji: '🧒', lo: 4,  hi: 7  },
    { key: 'preteen',  emoji: '🏃', lo: 8,  hi: 11 },
    { key: 'teen',     emoji: '🧑', lo: 12, hi: 16 },
  ];

  $: target = maxAge ?? minAge ?? null;
  $: match  = target !== null
    ? ([...AGE_GROUPS].reverse().find(g => target >= g.lo) ?? AGE_GROUPS[0])
    : null;

  $: label = (minAge && maxAge)
    ? $_('details.ageRange', { values: { min: minAge, max: maxAge } })
    : minAge  ? $_('details.ageMin',   { values: { age: minAge } })
    : maxAge  ? $_('details.ageMax',   { values: { age: maxAge } })
    : null;
</script>

{#if match}
  <span class="age-chip">
    {match.emoji} {$_('details.ageGroups.' + match.key)}
    {#if label}<span class="age-range">{label}</span>{/if}
  </span>
{/if}

<style>
  .age-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
    background: #ecfdf5;
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #065f46;
    white-space: nowrap;
  }
  .age-range {
    font-size: 10px;
    font-family: 'DM Mono', monospace;
    color: #10b981;
    margin-left: 2px;
  }
</style>
