<script>
  import { modal } from '../stores/modalOpen.js';
  import { _ , locale } from 'svelte-i18n';
  import { version } from '../../package.json';
  import logoUrl from '../images/spieli_logo.png';
  import { installPrompt, promptInstall } from '../stores/installPrompt.js';
  import { startReport } from '../stores/reportMissing.js';

  export let open = false;
  /** Community chat URL; hidden when null/falsy. */
  export let chatUrl = null;
  /** Imprint URL; hidden when null/falsy. */
  export let impressumUrl = null;
  /** Privacy policy URL; hidden when null/falsy. */
  export let privacyUrl = null;

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
    <div class="modal-box" role="dialog" aria-modal="true" use:modal aria-labelledby="info-title">
      <div class="modal-header">
        <h5 class="modal-title" id="info-title">{$_('nav.about')}</h5>
        <button type="button" class="close-btn" onclick={close} aria-label={$_('info.closeBtn')}>✕</button>
      </div>
      <div class="modal-body">
        <div class="intro-container">
          <p class="intro">
            {@html $_('modal.addData.introText', { values: {
              osmLink: '<a href="https://www.openstreetmap.org/" target="_blank" rel="noopener">OpenStreetMap</a>',
              mapcompleteLink: '<a href="https://mapcomplete.org/playgrounds.html" target="_blank" rel="noopener">MapComplete</a>'
            } })}
          </p>
          <img src={logoUrl} alt="spieli logo" class="logo" />
        </div>

        <div class="link-grid">
          <!-- Only where the browser offers installation (Chromium); see
               stores/installPrompt.js (#939). -->
          {#if $installPrompt}
            <button type="button" class="link-card link-card--button" onclick={promptInstall}>
              <span class="link-icon">📲</span>
              <span>{$_('modal.addData.installApp')}</span>
            </button>
          {/if}
          <button type="button" class="link-card link-card--button" onclick={() => { close(); startReport(); }}>
            <span class="link-icon">📍</span>
            <span>{$_('report.infoCard')}</span>
          </button>
          <a class="link-card" href={osmWikiUrl} target="_blank" rel="noopener">
            <span class="link-icon">🗺️</span>
            <span>{$_('modal.addData.wikiLinkText')}</span>
          </a>
          {#if chatUrl}
            <a class="link-card" href={chatUrl} target="_blank" rel="noopener">
              <span class="link-icon">💬</span>
              <span>{$_('modal.addData.community.simpleChatLabel')}</span>
            </a>
          {/if}
          <a class="link-card" href="https://github.com/mfuhrmann/spieli" target="_blank" rel="noopener">
            <span class="link-icon">⚙️</span>
            <span>{$_('modal.addData.githubLabel')}</span>
          </a>
          <a class="link-card" href="https://hosted.weblate.org/engage/spieli/" target="_blank" rel="noopener">
            <span class="link-icon">🌍</span>
            <span>{$_('modal.addData.translateLabel')}</span>
          </a>
          {#if impressumUrl}
            <a class="link-card" href={impressumUrl} target="_blank" rel="noopener">
              <span class="link-icon">📋</span>
              <span>{$_('legal.impressum')}</span>
            </a>
          {/if}
          {#if privacyUrl}
            <a class="link-card" href={privacyUrl} target="_blank" rel="noopener">
              <span class="link-icon">🔒</span>
              <span>{$_('legal.datenschutz')}</span>
            </a>
          {/if}
        </div>

        <div class="meta">
          <p class="credit">
            {@html $_('modal.addData.weblateCredit', { values: {
              weblateLink: '<a href="https://hosted.weblate.org/engage/spieli/" target="_blank" rel="noopener">Weblate</a>'
            } })}
          </p>
          <p class="version">v{version}</p>
        </div>
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
    border-radius: 10px;
    width: min(92vw, 420px);
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0,0,0,0.22);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.125rem 0.75rem;
    border-bottom: 1px solid var(--color-border);
  }

  .modal-title { margin: 0; font-size: 1rem; font-weight: 700; color: var(--color-foreground); }

  .close-btn {
    background: none;
    border: none;
    font-size: 1rem;
    line-height: 1;
    color: var(--color-muted-foreground);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
  }
  .close-btn:hover { color: var(--color-foreground); background: var(--color-muted); }

  .modal-body { padding: 1rem 1.125rem; }

  .intro-container {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1.125rem;
  }

  .intro {
    font-size: 0.875rem;
    color: var(--color-foreground);
    margin: 0;
    line-height: 1.55;
    flex: 1;
  }

  .logo {
    width: 60px;
    height: auto;
    object-fit: contain;
  }

  .link-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-bottom: 1.125rem;
  }

  .link-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    border-radius: 7px;
    background: var(--color-muted);
    border: 1px solid var(--color-border);
    font-size: 0.8125rem;
    color: var(--color-foreground);
    text-decoration: none;
    transition: background 0.12s, border-color 0.12s;
  }
  .link-card--button {
    font: inherit;
    font-size: 0.8125rem;
    text-align: left;
    cursor: pointer;
    width: 100%;
  }
  .link-card:hover {
    background: var(--color-chip);
    border-color: var(--color-chip-line);
    color: var(--color-chip-foreground);
  }

  .link-icon { font-size: 1rem; flex-shrink: 0; }

  .meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .credit {
    font-size: 0.7rem;
    color: var(--color-muted-foreground);
    margin: 0;
    line-height: 1.4;
  }
  .credit :global(a) { color: var(--color-muted-foreground); text-decoration: underline; }
  .credit :global(a:hover) { color: var(--color-primary-hover); }

  .version {
    font-size: 0.7rem;
    color: var(--color-muted-foreground);
    margin: 0;
    text-align: right;
    white-space: nowrap;
  }

  .modal-footer {
    padding: 0.625rem 1.125rem;
    border-top: 1px solid var(--color-border);
    display: flex;
    justify-content: flex-end;
  }

  .ok-btn {
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    border: none;
    border-radius: 10px;
    padding: 0.375rem 1rem;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s;
  }
  .ok-btn:hover { background: var(--color-primary-hover); }
</style>

