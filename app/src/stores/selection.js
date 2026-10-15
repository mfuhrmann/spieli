// Reactive store for the current selection — a playground or, in standalone
// mode, a standalone pitch (#934). One store with a `kind` rather than one
// store per kind, so "only one thing is open" holds by construction.
// Replaces the 40+ DOM ID coupling in the old selectPlayground.js with a single
// writable store that all components can subscribe to.
//
// shape: { feature: OlFeature | null, backendUrl: string, kind: 'playground' | 'pitch' }
//   feature    — the selected OpenLayers feature (null = nothing selected)
//   kind       — what the feature is; readers that only make sense for a
//                playground (equipment, reviews, nearby) must check it
//   backendUrl — the API base URL of the backend that owns this feature.
//                In standalone mode this is always apiBaseUrl.
//                In hub mode this is the per-backend URL from the registry.

import { writable, derived } from 'svelte/store';
import { writeHash } from '../lib/deeplink.js';

// History (#997): opening a panel pushes one entry, so the phone's back
// gesture closes the panel instead of leaving the page. The entry is marked
// with PANEL_STATE; while one is open, further selections replace it rather
// than stack, so one back always returns to the map. Closing in-app pops it
// again (history.back), so the history does not fill with dead entries.
const PANEL_STATE = { spieliPanel: true };

function onPanelEntry() {
    return history.state?.spieliPanel === true;
}

function baseUrl() {
    return window.location.pathname + window.location.search;
}

function createSelectionStore() {
    const { subscribe, set } = writable({ feature: null, backendUrl: '', kind: 'playground' });
    let current = null;
    subscribe(v => { current = v.feature; });

    // Set by clear() while its history.back() is in flight: that popstate is
    // our own, not the visitor's back gesture.
    let pendingBack = false;
    // Hash of the latest selection, for that re-push.
    let pendingHash = '';
    // Runs when the visitor's back closes the panel; AppShell sets it to its
    // "back to map" (zoom out). Without one the selection is simply cleared.
    let backHandler = null;

    function clearState() {
        set({ feature: null, backendUrl: '', kind: 'playground' });
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('popstate', () => {
            if (pendingBack) {
                pendingBack = false;
                // Something was selected between clear() and this popstate
                // (clear-then-select in one click): the back just popped the
                // new selection's entry, so push it again.
                if (current) history.pushState(PANEL_STATE, '', baseUrl() + pendingHash);
                return;
            }
            if (onPanelEntry()) {
                // Forward onto a panel entry whose panel is closed: the panel
                // is not reopened, so make it a plain map entry.
                if (!current) history.replaceState(null, '', baseUrl());
                return;
            }
            if (current) {
                if (backHandler) backHandler();
                else clearState();
            }
        });
    }

    return {
        subscribe,
        select(feature, backendUrl, kind = 'playground') {
            set({ feature, backendUrl, kind });
            if (feature) {
                const osmId = feature.get('osm_id');
                if (osmId) {
                    // `_backendSlug` is set by the hub registry when it knows the
                    // owning backend's slug; standalone never sets it, so this
                    // falls back to the legacy `#W<osm_id>` form.
                    const slug = feature.get('_backendSlug') ?? null;
                    const hash = writeHash({ slug, osmId, kind });
                    pendingHash = hash;
                    // Also true while clear()'s back is still in flight; the
                    // popstate handler then pushes this entry again.
                    if (onPanelEntry()) {
                        history.replaceState(PANEL_STATE, '', hash);
                    } else {
                        // The map entry underneath must not carry the hash
                        // (a deeplink load), or back would land on it again.
                        history.replaceState(null, '', baseUrl());
                        history.pushState(PANEL_STATE, '', hash);
                    }
                }
            }
        },
        clear() {
            clearState();
            if (pendingBack) return;
            if (onPanelEntry()) {
                pendingBack = true;
                history.back();
            } else {
                history.replaceState(null, '', baseUrl());
            }
        },
        // AppShell's "back to map", run when the visitor's back closes the panel.
        setBackHandler(fn) {
            backHandler = fn;
            return () => { if (backHandler === fn) backHandler = null; };
        },
    };
}

export const selection = createSelectionStore();

// Derived: true when anything is selected — it drives the shared panel slot
// and the mobile layout, which are the same for playgrounds and pitches.
export const hasSelection = derived(selection, $s => $s.feature !== null);

// Derived: what is selected ('playground' | 'pitch'), or null.
export const selectedKind = derived(selection, $s => ($s.feature ? $s.kind : null));

// Derived: the OSM ID of the selected *playground* (or null — also for a
// selected pitch, whose id may coincide with a playground's).
export const selectedOsmId = derived(selection, $s =>
    $s.kind === 'playground' ? ($s.feature?.get('osm_id') ?? null) : null);
