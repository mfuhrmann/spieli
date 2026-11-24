<script>
  // Data-age chip with its explanatory popover, moved out of PlaygroundPanel
  // into zone C (#1077). The age describes the region's OSM import, not the
  // selected playground, so it is background information.
  import { onDestroy, untrack } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { Info, ChevronDown, ChevronUp } from 'lucide-svelte';

  /** @type {{ age: string }} formatted age, e.g. "3 days" */
  let { age } = $props();

  let open = $state(false);
  let popoverStyle = $state('');
  let chipEl;

  function recomputeStyle() {
    if (!chipEl) return;
    const chip = chipEl.getBoundingClientRect();
    // Clamp right edge against the panel's right boundary; floor the width
    // so we never compute a zero/negative width on very narrow viewports.
    const panel = chipEl.closest('aside, [data-panel]');
    const panelRight = panel ? panel.getBoundingClientRect().right : window.innerWidth;
    const maxWidth = Math.max(140, Math.min(260, panelRight - chip.left - 12));
    popoverStyle = [`top:${chip.bottom + 6}px`, `left:${chip.left}px`, `width:${maxWidth}px`].join(';');
  }

  function onDocumentClick(e) {
    // Clicks inside the popover (text selection) or on the chip (its own
    // toggle) must not close it.
    if (e.target?.closest?.('.data-age-popover, .data-age-chip')) return;
    close();
  }
  // Capture phase, registered on open: runs before the panel's Escape
  // handler, so Escape closes only the popover, not the whole panel.
  function onKeydown(e) {
    if (e.key === 'Escape' && open) {
      e.stopImmediatePropagation();
      close();
    }
  }
  // Scroll/resize/sheet-drag invalidate the fixed position. Closing is less
  // surprising than chasing the chip around the screen.
  function onViewportChange() { close(); }

  function openPopover() {
    recomputeStyle();
    open = true;
    // Defer by a tick so the opening click does not close it again.
    setTimeout(() => {
      window.addEventListener('click', onDocumentClick);
      window.addEventListener('keydown', onKeydown, { capture: true });
      window.addEventListener('resize', onViewportChange);
      window.addEventListener('scroll', onViewportChange, true);
    }, 0);
  }

  function close() {
    if (!open) return;
    open = false;
    window.removeEventListener('click', onDocumentClick);
    window.removeEventListener('keydown', onKeydown, { capture: true });
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('scroll', onViewportChange, true);
  }

  function toggle(e) {
    e.stopPropagation();
    if (open) close(); else openPopover();
  }

  // A new age (another backend) must not leave a stale popover open.
  // untrack: close() reads `open`, which must not become a dependency.
  $effect(() => { age; untrack(close); });
  onDestroy(close);
</script>

<button
  bind:this={chipEl}
  class="data-age-chip"
  onclick={toggle}
  title={$_('details.osmDataAgeTitle')}
  aria-haspopup="dialog"
  aria-controls="data-age-popover"
  aria-expanded={open}
>
  <Info class="h-3 w-3" />
  {$_('details.osmDataAgeChip', { values: { age } })}
  {#if open}<ChevronUp class="h-3 w-3" />{:else}<ChevronDown class="h-3 w-3" />{/if}
</button>

{#if open}
  <div
    id="data-age-popover"
    class="data-age-popover"
    style={popoverStyle}
    role="dialog"
    aria-labelledby="data-age-popover-title"
  >
    <p id="data-age-popover-title" class="data-age-popover__title">{$_('details.osmDataAgeTitle')}</p>
    <p class="data-age-popover__body">{$_('details.osmDataAgeBody', { values: { age } })}</p>
  </div>
{/if}

<style>
  .data-age-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 7px;
    border-radius: 9999px;
    font-size: 10px;
    font-weight: 600;
    color: var(--color-muted-foreground);
    background: var(--color-muted);
    border: 1px solid var(--color-border);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
    line-height: 1.4;
  }
  .data-age-chip:hover,
  .data-age-chip[aria-expanded="true"] {
    background: var(--color-muted);
    color: var(--color-foreground);
  }
  /* position: fixed so the panel's overflow-y: auto cannot clip it. */
  .data-age-popover {
    position: fixed;
    z-index: 500;
    background: #ffffff;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    padding: 10px 12px;
  }
  .data-age-popover__title {
    font-size: 10px;
    font-weight: 700;
    color: var(--color-foreground);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0 0 4px;
  }
  .data-age-popover__body {
    font-size: 12px;
    color: var(--color-muted-foreground);
    line-height: 1.5;
    margin: 0;
  }
</style>
