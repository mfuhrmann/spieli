// Hide an example illustration whose image fails to load (#969).
//
// The illustrations are HTML strings rendered with {@html}, and used to carry
// an inline onerror="…" to hide themselves. The narrowed CSP (script-src
// 'self', still report-only until #861) blocks inline handlers, so that
// fallback would silently stop working the day the policy is enforced, leaving
// a broken-image icon captioned "example image". `error` does not bubble but
// is seen in the capture phase, so one listener on the document covers every
// illustration, wherever it is rendered.
//
// A file renamed upstream since `make equipment-images` is the case this is
// for. The wrapper is hidden, and so is an enclosing [data-illustration]
// section (the standalone pitch panel's), so no heading is left over empty.

export function installImageFallback(root = document) {
  const onError = (e) => {
    const el = e.target;
    if (!(el instanceof HTMLImageElement)) return;
    const wrap = el.closest('.device-img-wrap');
    if (!wrap) return;
    wrap.style.display = 'none';
    const section = wrap.closest('[data-illustration]');
    if (section) section.style.display = 'none';
  };
  root.addEventListener('error', onError, true);
  return () => root.removeEventListener('error', onError, true);
}
