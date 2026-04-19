<script>
  import { _ } from 'svelte-i18n';
  import { onDestroy } from 'svelte';
  import { Globe, AlertTriangle } from 'lucide-svelte';
  import InstancePanelDrawer from './InstancePanelDrawer.svelte';

  /** @type {import('svelte/store').Readable<Array>} */
  export let backends;
  /** @type {import('svelte/store').Readable<string|null>} */
  export let registryError;

  let open = false;
  let pillEl;
  let wrapperEl;

  // Reachable = backend responded without error and isn't still loading. Drives
  // both the region count in the pill and the zero-reachable messaging.
  $: reachable = $backends.filter(b => !b.error && !b.loading);
  $: regionCount = reachable.length;
  $: playgroundCount = reachable.reduce((acc, b) => acc + (b.featureCount || 0), 0);
  $: isLoading = !$registryError && $backends.length === 0;
  $: hasRegistryError = !!$registryError;

  function toggle() {
    open = !open;
  }

  function close() {
    if (!open) return;
    open = false;
    // Return focus to the pill so keyboard users aren't stranded.
    pillEl?.focus();
  }

  function handleDocKey(e) {
    if (e.key === 'Escape') close();
  }

  function handleDocClick(e) {
    if (!open) return;
    if (wrapperEl && !wrapperEl.contains(e.target)) close();
  }

  $: if (typeof document !== 'undefined') {
    if (open) {
      document.addEventListener('keydown', handleDocKey);
      document.addEventListener('mousedown', handleDocClick);
    } else {
      document.removeEventListener('keydown', handleDocKey);
      document.removeEventListener('mousedown', handleDocClick);
    }
  }

  onDestroy(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', handleDocKey);
      document.removeEventListener('mousedown', handleDocClick);
    }
  });
</script>

<div class="panel" bind:this={wrapperEl}>
  {#if open}
    <div class="panel__drawer">
      <InstancePanelDrawer
        backends={$backends}
        registryError={$registryError}
        onclose={close}
      />
    </div>
  {/if}

  <button
    class="pill"
    class:pill--error={hasRegistryError}
    class:pill--loading={isLoading}
    type="button"
    onclick={toggle}
    aria-expanded={open}
    aria-label={open ? $_('hub.pillCollapse') : $_('hub.pillExpand')}
    bind:this={pillEl}
  >
    {#if hasRegistryError}
      <AlertTriangle class="pill__icon" aria-hidden="true" />
      <span class="pill__text">{$_('hub.registryError')}</span>
    {:else if isLoading}
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      <span class="pill__text">{$_('hub.loading')}</span>
    {:else}
      <Globe class="pill__icon" aria-hidden="true" />
      <span class="pill__text">
        {$_('hub.regionCount', { values: { count: regionCount } })}
        <span class="pill__sep">·</span>
        {$_('hub.playgroundCount', { values: { count: playgroundCount } })}
      </span>
    {/if}
  </button>
</div>

<style>
  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .panel__drawer {
    /* The drawer lives above the pill in document order so it appears to slide
       up from the pill when toggled. */
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 36px;
    padding: 0 0.85rem;
    background: #fff;
    border: none;
    border-radius: 999px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
    cursor: pointer;
    color: #212529;
    font-size: 0.8rem;
    font-weight: 500;
    line-height: 1;
    transition: background 0.15s, box-shadow 0.15s;
    white-space: nowrap;
  }

  .pill:hover,
  .pill:focus-visible {
    background: #f8f9fa;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22);
  }

  .pill:focus-visible {
    outline: 2px solid #4c9aff;
    outline-offset: 2px;
  }

  .pill--error {
    color: #b91c1c;
  }

  .pill--loading {
    color: #6b7280;
  }

  :global(.pill__icon) {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .pill__text {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .pill__sep {
    color: #adb5bd;
  }
</style>
