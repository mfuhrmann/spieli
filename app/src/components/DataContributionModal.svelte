<script>
  import { regionPlaygroundWikiUrl, regionChatUrl } from '../lib/config.js';

  export let open = false;
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
        <h5 class="modal-title mb-0" id="dc-title">Daten ergänzen</h5>
        <button type="button" class="btn-close" onclick={close} aria-label="Schließen"></button>
      </div>
      <div class="modal-body">
        <p class="small">
          Die Daten dieser Karte stammen aus
          <a href="https://www.openstreetmap.org/" target="_blank" rel="noopener" class="link-secondary">OpenStreetMap</a>.
          Du kannst sie direkt bearbeiten – kein Account nötig bei MapComplete.
        </p>

        <h6 class="mt-3">Spielgeräte &amp; Details ergänzen</h6>
        <p class="small mb-2">
          Mit <a href="https://mapcomplete.org/playgrounds.html" target="_blank" rel="noopener" class="link-secondary">MapComplete</a>
          kannst du Spielgeräte, Fotos und weitere Details einfach per Klick eintragen.
        </p>

        <h6 class="mt-3">OSM-Wiki</h6>
        <p class="small mb-2">
          <a href={regionPlaygroundWikiUrl} target="_blank" rel="noopener" class="link-secondary">
            Erfassungsregeln für Spielplätze in dieser Region
          </a>
        </p>

        {#if regionChatUrl}
          <h6 class="mt-3">Community</h6>
          <p class="small mb-0">
            Fragen und Austausch im
            <a href={regionChatUrl} target="_blank" rel="noopener" class="link-secondary">regionalen Chat</a>.
          </p>
        {/if}
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-primary btn-sm" onclick={close}>OK</button>
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

  .modal-body  { padding: 1rem; }
  .modal-footer {
    padding: 0.5rem 1rem;
    border-top: 1px solid #dee2e6;
    display: flex;
    justify-content: flex-end;
  }
</style>
