<script>
  import { regionPlaygroundWikiUrl, regionChatUrl } from '../lib/config.js';

  export let open = false;
  /** OSM wiki page shown as "Erfassungsregeln für Spielplätze in dieser Region". */
  export let wikiUrl = regionPlaygroundWikiUrl;
  /** Community chat URL; hidden when null/falsy. */
  export let chatUrl = regionChatUrl;
  function close() { open = false; }

  function onBackdropClick(e) {
    if (e.target === e.currentTarget) close();
  }

  function onKeydown(e) {
    if (open && e.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" onclick={onBackdropClick}>
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="dc-title">
      <div class="modal-header">
        <h5 class="modal-title" id="dc-title">Daten ergänzen</h5>
        <button type="button" class="close-btn" onclick={close} aria-label="Schließen">✕</button>
      </div>
      <div class="modal-body">
        <p class="small">
          Die Daten dieser Karte stammen aus
          <a href="https://www.openstreetmap.org/" target="_blank" rel="noopener">OpenStreetMap</a>.
          Du kannst sie direkt bearbeiten – kein Account nötig bei MapComplete.
        </p>

        <h6 class="section-heading">Spielgeräte &amp; Details ergänzen</h6>
        <p class="small">
          Mit <a href="https://mapcomplete.org/playgrounds.html" target="_blank" rel="noopener">MapComplete</a>
          kannst du Spielgeräte, Fotos und weitere Details einfach per Klick eintragen.
        </p>

        <h6 class="section-heading">OSM-Wiki</h6>
        <p class="small">
          <a href={wikiUrl} target="_blank" rel="noopener">
            Erfassungsregeln für Spielplätze in dieser Region
          </a>
        </p>

        {#if chatUrl}
          <h6 class="section-heading">Community</h6>
          <p class="small">
            Fragen und Austausch im
            <a href={chatUrl} target="_blank" rel="noopener">regionalen Chat</a>.
          </p>
        {/if}
      </div>
      <div class="modal-footer">
        <button type="button" class="ok-btn" onclick={close}>OK</button>
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
    width: min(90vw, 480px);
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

  .small { font-size: 0.875rem; color: #495057; margin: 0 0 0.5rem; }

  .section-heading { font-size: 0.875rem; font-weight: 600; margin: 0.75rem 0 0.25rem; }

  a { color: #6c757d; }
  a:hover { color: #343a40; }

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
