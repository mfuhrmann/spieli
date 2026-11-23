<script>
  // Tool block under the header while mapping detail is on (#1077): the
  // mapping-detail badge, which inputs are still missing, and the MapComplete
  // link. The panel order does not change; this block is only added.
  import { _ } from 'svelte-i18n';
  import { PencilLine } from 'lucide-svelte';
  import Badge from '../ui/Badge.svelte';
  import MapCompleteLink from '../MapCompleteLink.svelte';
  import { COMPLETENESS_PALETTE } from '../../lib/completenessPalette.js';

  /**
   * @type {{ level: 'complete'|'partial'|'missing', hintKey?: string|null, mcUrl?: string }}
   */
  let { level, hintKey = null, mcUrl = '' } = $props();

  // The labels describe how much has been MAPPED, not how good the playground
  // is (#733), so they live in `mappingDetail.*`.
  const KEY = {
    complete: 'mappingDetail.detailed',
    partial:  'mappingDetail.basic',
    missing:  'mappingDetail.noDetails',
  };
  // Tinted from the map palette so the badge equals the polygon just tapped.
  // Tinted background, not the solid base: dark text on solid green is
  // unreadable. The dot carries the identity colour.
  const pal = $derived(COMPLETENESS_PALETTE[level]);
  const style = $derived(`background: ${pal.fill}; border-color: ${pal.stroke}; color: #1f2937;`);
</script>

<div class="mapper-tools" data-testid="mapper-tools">
  <div class="mapper-tools__row">
    <Badge variant="outline" class="gap-1.5" {style}>
      <span class="detail-dot" style="background: {pal.base};" aria-hidden="true"></span>
      {$_(KEY[level])}
    </Badge>
    <MapCompleteLink href={mcUrl} label={$_('popup.editInMapComplete')} />
  </div>
  {#if hintKey}
    <!-- A callout rather than a grey caption line, which went unnoticed (#982).
         Blue, not amber: the hint is an invitation, not a verdict. -->
    <p class="detail-hint" data-testid="mapping-detail-hint">
      <PencilLine class="h-4 w-4 shrink-0 mt-px text-blue-600" />
      <span class="min-w-0">{$_(hintKey)}</span>
    </p>
  {/if}
</div>

<style>
  .mapper-tools {
    margin-bottom: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px dashed #e5e7eb;
  }
  .mapper-tools__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .detail-dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .detail-hint {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0.5rem 0 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    font-size: 0.8125rem;
    line-height: 1.4;
    color: #1e3a8a;
  }
</style>
