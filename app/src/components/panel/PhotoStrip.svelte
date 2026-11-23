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
  import MapCompleteLink from '../MapCompleteLink.svelte';

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
</script>

<div class="photo-strip" class:photo-strip--filled={filled} data-testid="photo-strip">
  {#if hasCommonsTags}
    <CommonsGallery {commons} {image} bind:count={commonsCount} bind:loaded={commonsLoaded} />
  {/if}
  {#if uuids.length > 0}
    <div class:mt-2={commonsCount > 0}>
      <PanoramaxViewer {uuids} {mcUrl} />
    </div>
  {:else if status === 'none' && !hideEmpty}
    <p class="no-photo" data-testid="no-photo">
      <Camera class="h-4 w-4 shrink-0" aria-hidden="true" />
      <span class="min-w-0">{$_('panel.noPhoto')}</span>
      <MapCompleteLink href={mcUrl} label={$_('popup.addPhoto')} />
    </p>
  {/if}
</div>

<style>
  .photo-strip--filled { margin-bottom: 0.75rem; }
  .no-photo {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 8px;
    margin: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: #f9fafb;
    border: 1px dashed #d1d5db;
    font-size: 0.8125rem;
    color: #6b7280;
  }
</style>
