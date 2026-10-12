import { writable, get } from 'svelte/store';

// Whether the map shows mapping detail (completeness colours, polygons, legend)
// or the plain "finder" view. Off by default: most visitors want to find a
// playground, not judge its OSM data (#924).
//
// Sources, in order: the `?detail=1|0` link parameter, the visitor's stored
// preference, off. The parameter overrides the preference for one page load
// but never writes it — opening a contributor's link must not permanently
// change someone else's map.

const STORAGE_KEY = 'spieli.mappingDetail';
export const DETAIL_PARAM = 'detail';

/** `true` / `false` for `detail=1` / `detail=0`, `null` for absent or anything else. */
export function parseDetailParam(search) {
  try {
    const v = new URLSearchParams(search).get(DETAIL_PARAM);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* malformed search — ignore */ }
  return null;
}

/** `href` with the `detail` parameter set to `on`, hash and other params intact. */
export function withDetailParam(href, on) {
  const url = new URL(href);
  url.searchParams.set(DETAIL_PARAM, on ? '1' : '0');
  return url.toString();
}

// Storage can be missing or throw on every access (private mode, blocked site
// data), so each read and write is guarded and failure means "off".
function readStored(storage) {
  try { return storage?.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

function writeStored(storage, on) {
  try { storage?.setItem(STORAGE_KEY, on ? '1' : '0'); } catch { /* session-only */ }
}

/**
 * Factory with injectable browser objects so the logic is testable in node.
 * `set` is the user toggle: it persists the choice and, when the page was
 * opened with a `detail` parameter, rewrites it so the address bar (and a
 * reload) never contradict the map. A URL without the parameter stays clean.
 */
export function createMappingDetailStore({ storage = null, location = null, history = null } = {}) {
  const fromParam = location ? parseDetailParam(location.search) : null;
  const inner = writable(fromParam ?? readStored(storage));

  function set(on) {
    on = !!on;
    inner.set(on);
    writeStored(storage, on);
    if (history && location && parseDetailParam(location.search) !== null) {
      try {
        history.replaceState(history.state, '', withDetailParam(location.href, on));
      } catch { /* replaceState can throw in sandboxed frames */ }
    }
  }

  return {
    subscribe: inner.subscribe,
    set,
    toggle: () => set(!get(inner)),
  };
}

function browserEnv() {
  if (typeof window === 'undefined') return {};
  let storage = null;
  try { storage = window.localStorage; } catch { /* access itself can throw */ }
  return { storage, location: window.location, history: window.history };
}

export const mappingDetail = createMappingDetailStore(browserEnv());
