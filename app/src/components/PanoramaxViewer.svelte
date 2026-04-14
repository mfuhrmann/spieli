<script>
  import { onMount } from 'svelte';

  /** @type {string[]} List of Panoramax UUIDs for this playground. */
  export let uuids = [];
  /** @type {string} MapComplete URL for the "add photo" link. */
  export let mcUrl = '';

  const thumbUrl  = uuid => `https://api.panoramax.xyz/api/pictures/${uuid}/thumb.jpg`;
  const viewerUrl = uuid => `https://api.panoramax.xyz/?pic=${uuid}&nav=none&focus=pic`;

  let fullscreen = false;
  let modalIndex = 0;

  function openModal(i) {
    modalIndex = i;
    fullscreen = true;
  }
  function closeModal() { fullscreen = false; }
  function prev() { modalIndex = (modalIndex - 1 + uuids.length) % uuids.length; }
  function next() { modalIndex = (modalIndex + 1) % uuids.length; }

  // Registered in capture phase so this fires before PlaygroundPanel's bubble-phase
  // ESC handler, preventing the panel from closing when only the photo modal should close.
  function onKeydown(e) {
    if (!fullscreen) return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === 'Escape')     { e.stopImmediatePropagation(); closeModal(); }
  }

  onMount(() => {
    window.addEventListener('keydown', onKeydown, { capture: true });
    return () => window.removeEventListener('keydown', onKeydown, { capture: true });
  });
</script>

{#if uuids.length === 0}
  <div class="text-center py-2">
    <span class="bi bi-camera" style="font-size:1.8rem; color:#d1d5db;"></span>
    <p class="text-muted mt-1 mb-2" style="font-size:smaller;">Noch keine Fotos vorhanden.</p>
    <a href={mcUrl} target="_blank" rel="noopener" class="mc-add-link small">
      <span class="bi bi-camera-fill"></span> Foto hinzufügen
    </a>
  </div>
{:else}
  <!-- Inline viewer: first photo as clickable iframe -->
  <div class="panoramax-preview" role="button" tabindex="0"
       onclick={() => openModal(0)}
       onkeydown={e => e.key === 'Enter' && openModal(0)}
       title="Vollbild anzeigen"
  >
    <iframe
      src={viewerUrl(uuids[0])}
      style="width:100%; height:240px; border:none; border-radius:4px; pointer-events:none;"
      title="Straßenfoto"
      allowfullscreen
    ></iframe>
    <div class="panoramax-overlay">
      <span class="bi bi-fullscreen panoramax-expand"></span>
    </div>
  </div>

  <!-- Thumbnail strip for multiple photos -->
  {#if uuids.length > 1}
    <div class="d-flex gap-1 mt-1 flex-wrap">
      {#each uuids as uuid, i}
        <button type="button" class="thumb-btn {i === 0 ? 'thumb-active' : ''}"
                onclick={() => openModal(i)}
                title="Foto {i + 1} von {uuids.length}">
          <img src={thumbUrl(uuid)} alt="Foto {i + 1}"
               style="width:52px; height:36px; object-fit:cover; border-radius:3px;" />
        </button>
      {/each}
    </div>
  {/if}

  <p class="mt-1 mb-0">
    <a href={mcUrl} target="_blank" rel="noopener" class="mc-add-link small">
      <span class="bi bi-camera-fill"></span> Foto hinzufügen
    </a>
  </p>

  <!-- Fullscreen modal -->
  {#if fullscreen}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="panoramax-modal-backdrop" onclick={closeModal}>
      <div class="panoramax-modal" onclick={e => e.stopPropagation()}
           role="dialog" aria-modal="true" aria-label="Straßenfoto" tabindex="-1">
        <div class="d-flex align-items-center gap-2 p-2 border-bottom">
          <button type="button" class="btn btn-sm btn-outline-secondary py-0"
                  onclick={prev} disabled={uuids.length < 2} title="Vorheriges Foto">
            <span class="bi bi-chevron-left"></span>
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary py-0"
                  onclick={next} disabled={uuids.length < 2} title="Nächstes Foto">
            <span class="bi bi-chevron-right"></span>
          </button>
          <span class="text-muted" style="font-size:smaller;">
            {modalIndex + 1} / {uuids.length}
          </span>
          <span class="fw-semibold ms-1" style="font-size:0.9rem;">Straßenfoto</span>
          <button type="button" class="btn-close ms-auto" onclick={closeModal}
                  aria-label="Schließen"></button>
        </div>
        <iframe
          src={viewerUrl(uuids[modalIndex])}
          style="width:100%; flex:1; border:none;"
          title="Straßenfoto {modalIndex + 1}"
          allowfullscreen
        ></iframe>
      </div>
    </div>
  {/if}
{/if}

<style>
  .panoramax-preview {
    position: relative;
    cursor: pointer;
    border-radius: 4px;
    overflow: hidden;
  }
  .panoramax-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: 4px;
  }
  .panoramax-expand {
    position: absolute;
    bottom: 8px; right: 8px;
    background: rgba(255,255,255,0.85);
    border-radius: 3px;
    padding: 4px 5px;
    font-size: 13px;
    pointer-events: none;
  }

  .thumb-btn {
    background: none; border: 2px solid transparent; border-radius: 3px;
    padding: 0; cursor: pointer;
  }
  .thumb-active { border-color: #0d6efd; }

  .panoramax-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    z-index: 1050;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .panoramax-modal {
    background: #fff;
    border-radius: 6px;
    width: min(90vw, 1100px);
    height: min(80vh, 700px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .mc-add-link { color: #6c757d; text-decoration: none; }
  .mc-add-link:hover { color: #343a40; text-decoration: underline; }
</style>
