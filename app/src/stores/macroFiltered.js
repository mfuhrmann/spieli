import { writable } from 'svelte/store';

// Per-backend filtered aggregate for the macro (country) tier.
//
// Contract:
//   null                              → no filter active; MacroView renders
//                                        rings from the cached `get_meta`
//                                        totals (the macro tier stays
//                                        zero-fetch in this state).
//   Map<backendUrl, aggregate>        → a filter is active; the hub
//                                        orchestrator has summed each
//                                        backend's filtered cluster buckets
//                                        into `aggregate`.
//
// aggregate shape: { count, complete, partial, missing }
//
// Written by hubOrchestrator (macro tier, filter active); read by
// MacroView, which overrides a backend's ring props when an entry exists.
// The map is published progressively (one entry per backend as it settles)
// with a fresh Map reference each time so Svelte subscribers re-render.
// Backends without an entry (not yet settled, or a pre-tier peer that 404s
// on the cluster RPC) fall back to their cached-meta totals.
export const macroFilteredStore = writable(null);
