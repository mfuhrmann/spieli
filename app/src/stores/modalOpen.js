// Modal dialogs (#758): keep keyboard and screen-reader focus inside the open
// dialog.
//
// Dialogs register with the `modal` action on their role="dialog" element,
// which ties everything to the element's lifetime — no open/close bookkeeping
// to forget. While mounted, the action:
//
//   - makes everything OUTSIDE the dialog `inert`: every sibling of the dialog
//     and of each of its ancestors up to <body>. Only the map used to matter
//     (it is focusable and covers the viewport, #757), but the search bar, the
//     control buttons and the side panel sit behind the backdrop too, and Tab
//     reached all of them. Siblings that are already inert are left alone and
//     not restored, so a lightbox opened over another dialog makes that dialog
//     inert while it is up and hands it back when it closes;
//   - moves focus into the dialog, and back to where it was on close.
//
// `modalOpen` says whether any dialog is open, for handlers that must not act
// behind one (Map's Escape closes the hub backend popup only when none is).

import { writable, derived } from 'svelte/store';

const openCount = writable(0);

export const modalOpen = derived(openCount, n => n > 0);

function inertOutside(node) {
  const made = [];
  if (typeof document === 'undefined') return made;
  for (let el = node; el && el !== document.body && el.parentElement; el = el.parentElement) {
    for (const sib of el.parentElement.children) {
      if (sib === el || sib.inert || sib.tagName === 'SCRIPT' || sib.tagName === 'STYLE') continue;
      sib.inert = true;
      made.push(sib);
    }
  }
  return made;
}

/** Svelte action: `<div role="dialog" aria-modal="true" use:modal>`. */
export function modal(node) {
  openCount.update(n => n + 1);
  const previousFocus = typeof document !== 'undefined' ? document.activeElement : null;
  const madeInert = node ? inertOutside(node) : [];
  if (node && !node.contains(document.activeElement)) {
    if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
    node.focus({ preventScroll: true });
  }
  let released = false;
  return {
    destroy() {
      // Guarded: a second destroy (HMR, a teardown race) must not release
      // another dialog that is still open.
      if (released) return;
      released = true;
      for (const el of madeInert) el.inert = false;
      openCount.update(n => Math.max(0, n - 1));
      if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
        previousFocus.focus({ preventScroll: true });
      }
    },
  };
}
