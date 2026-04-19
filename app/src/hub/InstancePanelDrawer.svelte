<script>
  import { _ } from 'svelte-i18n';
  import { X } from 'lucide-svelte';

  /** @type {Array<{ url: string, name: string, version: string|null, loading: boolean, error: string|null, featureCount: number }>} */
  export let backends;
  /** @type {string | null} */
  export let registryError;
  /** @type {() => void} */
  export let onclose;

  let drawerEl;

  // Focus trap: keep keyboard focus inside the drawer while it's open. The
  // pill's own ESC handling closes the drawer — here we only trap Tab.
  function handleKeydown(e) {
    if (e.key !== 'Tab' || !drawerEl) return;
    const focusable = drawerEl.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

<div
  class="drawer"
  role="dialog"
  aria-modal="true"
  aria-labelledby="instance-drawer-title"
  tabindex="-1"
  bind:this={drawerEl}
  onkeydown={handleKeydown}
>
  <header class="drawer__header">
    <h6 id="instance-drawer-title" class="drawer__title">{$_('hub.drawerTitle')}</h6>
    <button
      class="drawer__close"
      type="button"
      onclick={onclose}
      aria-label={$_('hub.closeBtn')}
    >
      <X class="h-4 w-4" />
    </button>
  </header>

  {#if registryError}
    <p class="drawer__message drawer__message--error">
      <i class="bi bi-exclamation-triangle-fill me-1"></i>
      {$_('hub.registryError')}
    </p>
  {:else if backends.length === 0}
    <p class="drawer__message">
      <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
      {$_('hub.loading')}
    </p>
  {:else}
    <ul class="instance-list">
      {#each backends as b (b.url)}
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
</div>

<style>
  .drawer {
    width: 280px;
    max-height: min(60vh, 520px);
    background: #fff;
    border-radius: 0.5rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    overflow-y: auto;
    animation: slideUp 0.15s ease-out;
    display: flex;
    flex-direction: column;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .drawer__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #dee2e6;
  }

  .drawer__title {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: #495057;
  }

  .drawer__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #6b7280;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .drawer__close:hover,
  .drawer__close:focus-visible {
    background: #f1f3f5;
    color: #212529;
  }

  .drawer__message {
    margin: 0;
    padding: 0.75rem;
    font-size: 0.8rem;
    color: #6b7280;
  }

  .drawer__message--error {
    color: #b91c1c;
  }

  .instance-list {
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
    overflow-y: auto;
  }

  .instance-item {
    padding: 0.45rem 0.75rem;
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
    margin-bottom: 0.15rem;
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
