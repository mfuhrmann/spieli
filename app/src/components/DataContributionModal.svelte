<script>
  import { _ , locale } from 'svelte-i18n';
  import { version } from '../../package.json';

  export let open = false;
  /** Community chat URL; hidden when null/falsy. */
  export let chatUrl = null;

  function close() { open = false; }

  function onBackdropClick(e) {
    if (e.target === e.currentTarget) close();
  }

  function onKeydown(e) {
    if (open && e.key === 'Escape') close();
  }

  $: osmWikiUrl = $locale?.startsWith('de')
    ? 'https://wiki.openstreetmap.org/wiki/DE:Tag:leisure%3Dplayground'
    : 'https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground';
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" onclick={onBackdropClick}>
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="info-title">
      <div class="modal-header">
        <h5 class="modal-title" id="info-title">{$_('nav.about')}</h5>
        <button type="button" class="close-btn" onclick={close} aria-label={$_('info.closeBtn')}>✕</button>
      </div>
      <div class="modal-body">
        <p class="small">
          {@html $_('modal.addData.introText', { values: {
            osmLink: '<a href="https://www.openstreetmap.org/" target="_blank" rel="noopener">OpenStreetMap</a>',
            mapcompleteLink: '<a href="https://mapcomplete.org/playgrounds.html" target="_blank" rel="noopener">MapComplete</a>'
          } })}
        </p>

        <div class="links">
          <a href={osmWikiUrl} target="_blank" rel="noopener">{$_('modal.addData.wikiLinkText')} ↗</a>
          {#if chatUrl}
            <a href={chatUrl} target="_blank" rel="noopener">{$_('modal.addData.community.simpleChatLabel')} ↗</a>
          {/if}
          <a href="https://github.com/mfuhrmann/spieli" target="_blank" rel="noopener">{$_('modal.addData.githubLabel')} ↗</a>
        </div>

        <p class="version">v{version}</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="ok-btn" onclick={close}>{$_('modal.ok')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.45);
    z-index: 1050;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-box {
    background: #fff;
    border-radius: 6px;
    width: min(90vw, 440px);
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 4px 24px rgba(0,0,0,0.2);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #dee2e6;
  }

  .modal-title { margin: 0; font-size: 1rem; font-weight: 600; }

  .close-btn {
    background: none;
    border: none;
    font-size: 1rem;
    line-height: 1;
    color: #6c757d;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
  }
  .close-btn:hover { color: #000; background: #f0f0f0; }

  .modal-body { padding: 1rem; }

  .small { font-size: 0.875rem; color: #495057; margin: 0 0 1rem; }

  .links {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 1rem;
  }

  .links a {
    font-size: 0.875rem;
    color: #6c757d;
  }
  .links a:hover { color: #343a40; }

  .version {
    font-size: 0.75rem;
    color: #adb5bd;
    margin: 0;
  }

  .modal-footer {
    padding: 0.5rem 1rem;
    border-top: 1px solid #dee2e6;
    display: flex;
    justify-content: flex-end;
  }

  .ok-btn {
    background: #ed7014;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 0.25rem 0.75rem;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .ok-btn:hover { background: #d16212; }
</style>
