import { nominatimBaseUrl } from './config.js';

const DEFAULT_TIMEOUT_MS = 3000;

// Only the PRIMARY subtag: 'de-DE', 'de-AT' and 'de' all become 'de'.
//
// This is a cache-cardinality decision, not cosmetics. The value goes into the
// query string, and the proxy's cache key includes it, so passing the full tag
// makes region-URL resolution — which is otherwise identical for every visitor
// of an instance and is the query the cache exists for — a separate entry per
// browser locale. Nominatim is behind an instance-wide 1 r/s limiter, so a
// fragmented cache turns into shed requests and a silently empty search box.
//
// Nominatim treats this as a preference list and still falls back sensibly, so
// place names are unaffected in practice.
export function getAcceptLanguage() {
  const tag = (typeof navigator !== 'undefined' && navigator.language) || 'de';
  return tag.split('-')[0].toLowerCase() || 'de';
}

export async function nominatimFetch(path, params = {}, { timeout = DEFAULT_TIMEOUT_MS, signal } = {}) {
  // The base is an absolute third-party origin OR a same-origin path such as
  // /ext/nominatim when this instance proxies. `new URL(path, base)` cannot
  // take a relative base, so the two are concatenated and resolved against the
  // page origin; an absolute base simply wins over that second argument.
  const url = new URL(`${nominatimBaseUrl}${path}`,
                      globalThis.location?.origin ?? 'http://localhost');
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  if (!url.searchParams.has('format')) url.searchParams.set('format', 'json');
  if (!url.searchParams.has('accept-language')) {
    url.searchParams.set('accept-language', getAcceptLanguage());
  }

  const controller = new AbortController();
  const timer = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (timer) clearTimeout(timer);
    if (!res.ok) throw new Error(`Nominatim ${path}: ${res.status}`);
    return res.json();
  } catch (err) {
    if (timer) clearTimeout(timer);
    throw err;
  }
}
