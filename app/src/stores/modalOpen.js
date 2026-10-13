// Whether a modal dialog is open anywhere in the app (#758).
//
// The map container is focusable (tabindex="0", #757) and covers the whole
// viewport, so without this, tabbing past a dialog's last control landed on the
// map behind the overlay: arrow keys panned a map nobody could see, and a
// screen reader announced the map while an aria-modal dialog was open. Map.svelte
// makes its container `inert` while this is true.
//
// A counter, not a boolean: a photo lightbox can open while another dialog is
// up, and closing the inner one must not release the map. Dialogs register with
// the `modal` action on their role="dialog" element, which ties the count to
// the element's lifetime — no open/close bookkeeping to forget.

import { writable, derived } from 'svelte/store';

const openCount = writable(0);

export const modalOpen = derived(openCount, n => n > 0);

/** Svelte action: `<div role="dialog" aria-modal="true" use:modal>`. */
export function modal() {
  openCount.update(n => n + 1);
  return {
    destroy() {
      openCount.update(n => Math.max(0, n - 1));
    },
  };
}
