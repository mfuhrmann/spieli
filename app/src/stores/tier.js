// Active zoom-tier for the three-layer playground renderer.
// Written by the tieredOrchestrator on moveend; read by Map.svelte to toggle
// layer visibility. Values: null | 'cluster' | 'centroid' | 'polygon'.
//
// Default is null so Map.svelte can hide all layers until the orchestrator
// has run at least once. This avoids a flash of the empty polygon layer on
// first paint at low zoom.
import { writable } from 'svelte/store';
export const activeTierStore = writable(null);
