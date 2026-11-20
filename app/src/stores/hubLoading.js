// Hub-tier load progress (P2 §3.5).
//
// Written by the hub orchestrator on each fan-out:
//   { loaded: number, total: number, settling: boolean }
//
// `total` = number of backends in the current fan-out (after bbox + health
// filtering); `loaded` increments per-backend as `onResult` fires; `settling`
// is true between the start of a fan-out and its `Promise.all` resolution.
//
// Nothing reads it at the moment: the region pill's progress comes from the
// registry store. Kept as a write-only signal for a future progress display.

import { writable } from 'svelte/store';
export const hubLoadingStore = writable({ loaded: 0, total: 0, settling: false });
