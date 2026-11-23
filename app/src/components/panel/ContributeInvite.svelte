<script>
  // Zone A when nothing is known (#1077): for two thirds of playgrounds the
  // panel would otherwise be a title and nothing else. Invites the visitor to
  // add a photo or the details. #1073 adds an anonymous tap-to-send note here.
  import { _ } from 'svelte-i18n';
  import { MessageCirclePlus } from 'lucide-svelte';
  import MapCompleteLink from '../MapCompleteLink.svelte';

  /** @type {{ mcUrl?: string }} */
  let { mcUrl = '' } = $props();
</script>

<div class="invite" data-testid="contribute-invite">
  <p class="invite__text">
    <MessageCirclePlus class="h-4 w-4 shrink-0 mt-px" aria-hidden="true" />
    <span>{$_('panel.invite.text')}</span>
  </p>
  <div class="invite__actions">
    <MapCompleteLink href={mcUrl} label={$_('popup.addPhoto')} />
    <MapCompleteLink href={mcUrl} label={$_('panel.invite.addDetails')} />
  </div>
</div>

<style>
  .invite {
    margin-bottom: 0.75rem;
    padding: 10px 12px;
    border-radius: 10px;
    background: #f0fdf4;
    border: 1px dashed #86efac;
  }
  .invite__text {
    display: flex;
    gap: 8px;
    margin: 0 0 6px;
    font-size: 0.875rem;
    line-height: 1.4;
    color: #14532d;
  }
  .invite__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    padding-left: 24px;
  }
</style>
