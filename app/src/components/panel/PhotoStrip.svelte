<script>
  // Zone A photos (#1077). Wikimedia Commons and Panoramax as before, but at
  // the top instead of in an accordion. Without photos it is one compact line
  // with an "add a photo" link, not an empty frame. Panoramax stays
  // click-to-load (#852): its thumbnail is an image, the viewer iframe only
  // opens on activation.
  import { _ } from 'svelte-i18n';
  import { Camera } from 'lucide-svelte';
  import CommonsGallery from '../CommonsGallery.svelte';
  import PanoramaxViewer from '../PanoramaxViewer.svelte';

  /**
   * @type {{
   *   commons?: string,
   *   image?: string,
   *   panoramaxUuids?: string[],
   *   mcUrl?: string,
   *   hideEmpty?: boolean,
   *   status?: 'loading' | 'photos' | 'none',
   * }}
   */
  let {
    commons = '',
    image = '',
    panoramaxUuids = [],
    mcUrl = '',
    // The parent's contribution invitation replaces the no-photo line.
    hideEmpty = false,
    status = $bindable('loading'),
  } = $props();

  let commonsCount = $state(0);
  let commonsLoaded = $state(false);

  const hasCommonsTags = $derived(!!(commons || image));
  const uuids = $derived(panoramaxUuids ?? []);

  $effect(() => {
    if (uuids.length > 0 || commonsCount > 0) status = 'photos';
    else if (hasCommonsTags && !commonsLoaded) status = 'loading';
    else status = 'none';
  });

  // Margin only while something shows. The gallery itself stays mounted
  // whenever photo tags exist, so a new selection always gets its fetch.
  const filled = $derived(status !== 'none' || !hideEmpty);
  const safeMc = $derived(typeof mcUrl === 'string' && /^https?:\/\//i.test(mcUrl) ? mcUrl : '');
</script>

<div class="photo-strip" class:photo-strip--filled={filled} data-testid="photo-strip">
  <!-- One swipeable row of thumbnails from both sources (#1081); a tap opens
       the source's own full-screen view. The gallery stays mounted whenever
       photo tags exist, so a new selection always gets its fetch. -->
  {#if hasCommonsTags || uuids.length > 0}
    <div class="strip-row" class:strip-row--empty={status === 'none'}>
      {#if hasCommonsTags}
        <CommonsGallery {commons} {image} strip bind:count={commonsCount} bind:loaded={commonsLoaded} />
      {/if}
      {#if uuids.length > 0}
        <PanoramaxViewer {uuids} {mcUrl} strip />
      {/if}
    </div>
  {/if}
  {#if status === 'photos' && safeMc}
    <a class="contrib-link mt-1.5" href={safeMc} target="_blank" rel="noopener noreferrer">
      <Camera class="h-3.5 w-3.5" aria-hidden="true" />{$_('popup.addPhoto')}
    </a>
  {:else if status === 'none' && !hideEmpty}
    <p class="no-photo" data-testid="no-photo">
      <Camera class="h-4 w-4 shrink-0" aria-hidden="true" />
      <span class="min-w-0">{$_('panel.noPhoto')}</span>
      {#if safeMc}<a class="contrib-link" href={safeMc} target="_blank" rel="noopener noreferrer">{$_('popup.addPhoto')}</a>{/if}
    </p>
  {/if}
</div>

<style>
  .photo-strip--filled { margin-bottom: 0.75rem; }
  .strip-row {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    /* Bleed to the panel edge on the right, so a cut-off thumbnail shows
       there is more to swipe. */
    margin-right: -1rem;
    padding-right: 1rem;
  }
  .strip-row::-webkit-scrollbar { display: none; }
  .strip-row--empty { display: none; }
  .no-photo {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 8px;
    margin: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--color-surface);
    border: 1px dashed var(--color-border);
    font-size: 0.8125rem;
    color: var(--color-muted-foreground);
  }
</style>
