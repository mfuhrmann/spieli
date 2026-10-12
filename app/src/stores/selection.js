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

function createSelectionStore() {
    const { subscribe, set, update } = writable({ feature: null, backendUrl: '', kind: 'playground' });

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
                    history.replaceState(null, '', writeHash({ slug, osmId, kind }));
                }
            }
        },
        clear() {
            set({ feature: null, backendUrl: '', kind: 'playground' });
            history.replaceState(null, '', window.location.pathname + window.location.search);
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
