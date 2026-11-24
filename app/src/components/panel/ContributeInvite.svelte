<script>
  // Zone A when nothing is known (#1077): for two thirds of playgrounds the
  // panel would otherwise be a title and nothing else. Invites the visitor to
  // send a hint without an account (#1073), add a photo or the details.
  import { _ } from 'svelte-i18n';
  import { MessageCirclePlus, Camera, Pencil } from 'lucide-svelte';

  /** @type {{ mcUrl?: string, onHint?: (() => void) | null }} */
  let { mcUrl = '', onHint = null } = $props();
  const safeMc = $derived(typeof mcUrl === 'string' && /^https?:\/\//i.test(mcUrl) ? mcUrl : '');
</script>

<div class="invite" data-testid="contribute-invite">
  <p class="invite__text">
    <MessageCirclePlus class="h-4 w-4 shrink-0 mt-px" aria-hidden="true" />
    <span>{$_('panel.invite.text')}</span>
  </p>
  {#if onHint}
    <button type="button" class="invite__hint" onclick={onHint} data-testid="hint-open">
      <MessageCirclePlus class="h-4 w-4" aria-hidden="true" />{$_('report.hint.open')}
    </button>
  {/if}
  {#if safeMc}
    <div class="invite__actions">
      <a class="contrib-link" href={safeMc} target="_blank" rel="noopener noreferrer"><Camera class="h-3.5 w-3.5" aria-hidden="true" />{$_('popup.addPhoto')}</a>
      <a class="contrib-link" href={safeMc} target="_blank" rel="noopener noreferrer"><Pencil class="h-3.5 w-3.5" aria-hidden="true" />{$_('panel.invite.addDetails')}</a>
    </div>
  {/if}
</div>

<style>
  .invite {
    margin-bottom: 0.75rem;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--color-chip);
    border: 1px dashed var(--color-chip-line);
  }
  .invite__text {
    display: flex;
    gap: 8px;
    margin: 0 0 6px;
    font-size: 0.875rem;
    line-height: 1.4;
    color: var(--color-ink);
  }
  .invite__hint {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 2px 0 10px 24px;
    padding: 6px 12px;
    border: none;
    border-radius: 8px;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }
  .invite__hint:hover { background: var(--color-primary-hover); }
  .invite__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    padding-left: 24px;
  }
</style>
