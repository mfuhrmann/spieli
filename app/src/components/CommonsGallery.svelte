<script>
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { fetchPlaygroundPhotos } from '../lib/commons.js';

  /** @type {{ commons?: string, image?: string }} */
  let { commons = '', image = '' } = $props();

  // How many thumbnails to show before collapsing into a "+N" tile.
  // Five fits the panel width on one row; the 5th becomes the "+N" tile.
  const CAP = 5;

  let photos = $state([]);
  let loading = $state(false);
  let selectedIndex = $state(0);
  let fullscreen = $state(false);
  let modalIndex = $state(0);

  // Re-fetch whenever the selected playground's photo tags change. Each run
  // aborts the previous request so a fast selection change can't render stale
  // photos. Failures degrade silently to an empty gallery (renders nothing).
  $effect(() => {
    const c = commons, i = image;
    if (!c && !i) { photos = []; return; }
    const ctrl = new AbortController();
    loading = true;
    fetchPlaygroundPhotos(c, i, { signal: ctrl.signal })
      .then(p => { photos = p; selectedIndex = 0; })
      .catch(() => { photos = []; })
      .finally(() => { loading = false; });
    return () => ctrl.abort();
  });

  const visible = $derived(photos.slice(0, CAP));
  const overflow = $derived(Math.max(0, photos.length - CAP));

  function openModal(i) { modalIndex = i; fullscreen = true; }
  function closeModal() { fullscreen = false; }
  function prev() { modalIndex = (modalIndex - 1 + photos.length) % photos.length; }
  function next() { modalIndex = (modalIndex + 1) % photos.length; }

  // Capture phase so this fires before PlaygroundPanel's bubble-phase ESC
  // handler — closes only the photo modal, not the whole panel.
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

  // Portal the modal to document.body so it escapes the sidebar stacking context.
  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { node.parentNode?.removeChild(node); } };
  }
</script>

{#if photos.length > 0}
  <!-- Big preview of the selected photo (mirrors the Panoramax viewer layout). -->
  <div class="commons-hero" role="button" tabindex="0"
       onclick={() => openModal(selectedIndex)}
       onkeydown={e => e.key === 'Enter' && openModal(selectedIndex)}
       title={$_('panoramax.fullscreen')}>
    <img src={photos[selectedIndex].thumb}
         alt={$_('photos.thumbnail', { values: { n: selectedIndex + 1 } })} />
    <span class="commons-expand bi bi-fullscreen"></span>
  </div>

  <!-- Small thumbnail strip to switch the preview. -->
  {#if photos.length > 1}
    <div class="commons-strip">
      {#each visible as photo, i}
        <button type="button" class="commons-thumb {i === selectedIndex ? 'commons-thumb-active' : ''}"
                onclick={() => (i === CAP - 1 && overflow > 0) ? openModal(i) : (selectedIndex = i)}
                title={$_('photos.thumbnailTitle', { values: { n: i + 1, total: photos.length } })}>
          <img src={photo.thumb} loading="lazy"
               alt={$_('photos.thumbnail', { values: { n: i + 1 } })} />
          {#if i === CAP - 1 && overflow > 0}
            <span class="commons-more">+{overflow}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
{/if}

<!-- Fullscreen lightbox: attribution (CC author + license) lives here only, so
     the normal thumbnail flow stays clutter-free while crediting correctly. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if fullscreen && photos[modalIndex]}
  <div use:portal class="commons-backdrop" onclick={closeModal}>
    <div class="commons-modal" onclick={e => e.stopPropagation()}
         role="dialog" aria-modal="true" aria-label={$_('accordion.photos')} tabindex="-1">
      <div class="commons-modal-header">
        <div class="commons-nav">
          <button type="button" class="nav-btn" onclick={prev}
                  disabled={photos.length < 2} title={$_('modal.prevPhoto')}>&#8249;</button>
          <button type="button" class="nav-btn" onclick={next}
                  disabled={photos.length < 2} title={$_('modal.nextPhoto')}>&#8250;</button>
          <span class="photo-counter">{modalIndex + 1} / {photos.length}</span>
        </div>
        <button type="button" class="close-btn" onclick={closeModal}
                aria-label={$_('modal.closeBtn')}>&#10005;</button>
      </div>
      <div class="commons-stage">
        <img src={photos[modalIndex].full}
             alt={$_('photos.thumbnail', { values: { n: modalIndex + 1 } })} />
      </div>
      <div class="commons-credit">
        {#if photos[modalIndex].artist}<span>© {photos[modalIndex].artist}</span>{/if}
        {#if photos[modalIndex].license}<span>· {photos[modalIndex].license}</span>{/if}
        {#if photos[modalIndex].descUrl}
          <a href={photos[modalIndex].descUrl} target="_blank" rel="noopener noreferrer">
            {$_('commons.viewSource')}
          </a>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .commons-hero {
    position: relative;
    cursor: pointer;
    border-radius: 4px;
    overflow: hidden;
    line-height: 0;
  }
  .commons-hero img {
    width: 100%;
    height: 200px;
    object-fit: cover;
    border-radius: 4px;
    display: block;
  }
  .commons-expand {
    position: absolute;
    bottom: 8px;
    right: 8px;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 3px;
    padding: 4px 5px;
    font-size: 13px;
    line-height: 1;
    pointer-events: none;
  }

  .commons-strip {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-top: 4px;
    margin-bottom: 0.75rem;
  }
  .commons-thumb {
    position: relative;
    background: none;
    border: 2px solid transparent;
    padding: 0;
    cursor: pointer;
    border-radius: 4px;
    overflow: hidden;
    line-height: 0;
  }
  .commons-thumb-active { border-color: #0d6efd; }
  .commons-thumb img {
    width: 52px;
    height: 38px;
    object-fit: cover;
    border-radius: 3px;
    display: block;
  }
  .commons-more {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 0.95rem;
    font-weight: 600;
    border-radius: 4px;
  }

  .commons-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .commons-modal {
    background: #111;
    border-radius: 8px;
    width: min(94vw, 1100px);
    height: min(88vh, 800px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  }
  @media (max-width: 768px) {
    .commons-modal {
      border-radius: 0;
      width: 100vw;
      height: 100dvh;
    }
  }
  .commons-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: #1b1b1b;
    flex-shrink: 0;
  }
  .commons-nav { display: flex; align-items: center; gap: 0.5rem; }
  .nav-btn {
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 4px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
    color: #eee;
    padding: 0;
  }
  .nav-btn:hover:not(:disabled) { background: #383838; }
  .nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .photo-counter { font-size: 0.8rem; color: #bbb; }
  .close-btn {
    background: none;
    border: none;
    font-size: 1rem;
    color: #bbb;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    line-height: 1;
  }
  .close-btn:hover { background: #2a2a2a; color: #fff; }
  .commons-stage {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-height: 0;
  }
  .commons-stage img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .commons-credit {
    flex-shrink: 0;
    padding: 0.4rem 0.75rem;
    background: #1b1b1b;
    color: #bbb;
    font-size: 0.75rem;
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .commons-credit a { color: #6ea8fe; text-decoration: none; }
  .commons-credit a:hover { text-decoration: underline; }
</style>
