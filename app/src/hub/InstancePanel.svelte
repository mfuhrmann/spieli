<script>
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { MapPin } from 'lucide-svelte';

  /** @type {import('svelte/store').Readable<Array>} */
  export let backends;
  /** @type {import('svelte/store').Readable<string|null>} */
  export let registryError;

  let collapsed = false;

  onMount(() => {
    collapsed = window.innerWidth < 1024;
  });
</script>

<div class="instance-wrap">
  {#if !collapsed}
    <aside class="instance-panel">
      <h6 class="instance-panel__title">
        <i class="bi bi-map me-1"></i> {$_('hub.title')}
      </h6>

      {#if $registryError}
        <p class="text-danger small px-2 mb-0">
          <i class="bi bi-exclamation-triangle-fill me-1"></i>
          {$_('hub.registryError')}
        </p>
      {:else if $backends.length === 0}
        <p class="text-muted small px-2 mb-0">
          <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
          {$_('hub.loading')}
        </p>
      {:else}
        <ul class="instance-list">
          {#each $backends as b (b.url)}
            <li class="instance-item">
              <div class="instance-row">
                <span class="instance-name">{b.name}</span>
                {#if b.version}
                  <span class="badge instance-badge text-bg-secondary">{b.version}</span>
                {/if}
              </div>

              {#if b.loading}
                <div class="instance-status text-muted">
                  <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                  {$_('details.loading')}
                </div>
              {:else if b.error}
                <div class="instance-status text-danger">
                  <i class="bi bi-exclamation-triangle-fill me-1"></i>
                  {$_('hub.instanceError')}
                </div>
              {:else}
                <div class="instance-status text-muted">
                  <i class="bi bi-geo-alt-fill me-1"></i>
                  {$_('hub.playgroundCount', { values: { count: b.featureCount } })}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </aside>
  {/if}

  <button
    class="instance-toggle"
    onclick={() => collapsed = !collapsed}
    title={$_('hub.title')}
    aria-label={$_('hub.title')}
    aria-expanded={!collapsed}
  >
    <MapPin class="toggle-icon" />
    {#if collapsed && $backends.length > 0}
      <span class="toggle-badge">{$backends.length}</span>
    {/if}
  </button>
</div>

<style>
  .instance-wrap {
    position: absolute;
    bottom: 4rem;
    left: 1rem;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
  }

  @media (max-width: 1023px) {
    .instance-wrap {
      z-index: 30;
    }
  }

  .instance-toggle {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: white;
    border: none;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    color: #666;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: background 0.15s, color 0.15s;
  }

  .instance-toggle:hover {
    background: #f5f5f5;
    color: #333;
  }

  :global(.toggle-icon) {
    width: 18px;
    height: 18px;
  }

  .toggle-badge {
    position: absolute;
    top: -3px;
    right: -3px;
    background: #0d6efd;
    color: white;
    font-size: 0.6rem;
    font-weight: 700;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .instance-panel {
    width: 220px;
    max-height: 40vh;
    background: #fff;
    border-radius: 0.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    overflow-y: auto;
    padding: 0.75rem 0;
  }

  .instance-panel__title {
    padding: 0 0.75rem 0.5rem;
    border-bottom: 1px solid #dee2e6;
    margin-bottom: 0.4rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #495057;
  }

  .instance-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .instance-item {
    padding: 0.35rem 0.75rem;
    border-bottom: 1px solid #f1f3f5;
    font-size: 0.8rem;
  }

  .instance-item:last-child {
    border-bottom: none;
  }

  .instance-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    margin-bottom: 0.1rem;
  }

  .instance-name {
    font-weight: 500;
    color: #212529;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .instance-badge {
    font-size: 0.65rem;
    flex-shrink: 0;
  }

  .instance-status {
    font-size: 0.75rem;
  }
</style>
