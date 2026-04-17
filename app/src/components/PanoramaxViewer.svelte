<script>
  import { onMount } from 'svelte';

  /** @type {{ uuids?: string[], mcUrl?: string }} */
  let { uuids = [], mcUrl = '' } = $props();

  const thumbUrl  = uuid => `https://api.panoramax.xyz/api/pictures/${uuid}/thumb.jpg`;
  const viewerUrl = uuid => `https://api.panoramax.xyz/?pic=${uuid}&nav=none&focus=pic`;

  let fullscreen = $state(false);
  let modalIndex = $state(0);
  let selectedIndex = $state(0);

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

  /**
   * Svelte action to portal an element to document.body.
   * This ensures the modal escapes the sidebar's stacking context
   * and works correctly in all browsers including Safari.
   */
  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    };
  }
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
  <!-- Inline viewer: selected photo as clickable iframe -->
  <div class="panoramax-preview" role="button" tabindex="0"
       onclick={() => openModal(selectedIndex)}
       onkeydown={e => e.key === 'Enter' && openModal(selectedIndex)}
       title="Vollbild anzeigen"
  >
    <iframe
      src={viewerUrl(uuids[selectedIndex])}
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
        <button type="button" class="thumb-btn {i === selectedIndex ? 'thumb-active' : ''}"
                onclick={() => selectedIndex = i}
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

{/if}

<!-- Fullscreen modal: portaled to document.body to escape sidebar stacking context -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if fullscreen}
  <div use:portal class="panoramax-modal-backdrop" onclick={closeModal}>
    <div class="panoramax-modal" onclick={e => e.stopPropagation()}
         role="dialog" aria-modal="true" aria-label="Straßenfoto" tabindex="-1">
      <div class="panoramax-modal-header">
        <div class="panoramax-nav">
          <button type="button" class="nav-btn"
                  onclick={prev} disabled={uuids.length < 2} title="Vorheriges Foto">
            &#8249;
          </button>
          <button type="button" class="nav-btn"
                  onclick={next} disabled={uuids.length < 2} title="Nächstes Foto">
            &#8250;
          </button>
          <span class="photo-counter">{modalIndex + 1} / {uuids.length}</span>
          <span class="photo-title">Straßenfoto</span>
        </div>
        <button type="button" class="close-btn" onclick={closeModal} aria-label="Schließen">
          &#10005;
        </button>
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
    background: rgba(0, 0, 0, 0.75);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .panoramax-modal {
    background: #fff;
    border-radius: 8px;
    width: min(92vw, 1100px);
    height: min(85vh, 750px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .panoramax-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
    flex-shrink: 0;
  }

  .panoramax-nav {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .nav-btn {
    background: #ffffff;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
    color: #374151;
    padding: 0;
  }
  .nav-btn:hover:not(:disabled) { background: #f3f4f6; }
  .nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .photo-counter {
    font-size: 0.8rem;
    color: #6b7280;
  }

  .photo-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: #111827;
    margin-left: 0.25rem;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1rem;
    color: #6b7280;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    line-height: 1;
  }
  .close-btn:hover { background: #f3f4f6; color: #111827; }

  .mc-add-link { color: #6c757d; text-decoration: none; }
  .mc-add-link:hover { color: #343a40; text-decoration: underline; }
</style>
