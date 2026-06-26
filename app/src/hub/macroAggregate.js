/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Pure derivation logic for the country-level macro view (P2 §5).
//
// Extracted from MacroView.svelte's `buildFeature` and hubOrchestrator's
// macro filter fan-out so the state derivation can be unit-tested in
// isolation — no OpenLayers, no DOM, no canvas (see #690). The component
// keeps only the geometry + OL `Feature` wiring; everything that decides a
// ring's count, completeness segments, and state flags lives here.

import { isBackendHealthy } from './federationHealth.js';

/**
 * Sum filter-aware cluster buckets into a single per-backend aggregate.
 * Bucket totals partition a backend's region at any zoom, so the sum is
 * zoom-invariant. Missing numeric fields coalesce to 0; a null/undefined or
 * empty bucket list sums to all-zeros.
 *
 * @param {Array<{count?:number, complete?:number, partial?:number, missing?:number}>} buckets
 * @returns {{count:number, complete:number, partial:number, missing:number}}
 */
export function sumClusterBuckets(buckets) {
  let count = 0, complete = 0, partial = 0, missing = 0;
  for (const b of buckets ?? []) {
    count    += b.count    ?? 0;
    complete += b.complete ?? 0;
    partial  += b.partial  ?? 0;
    missing  += b.missing  ?? 0;
  }
  return { count, complete, partial, missing };
}

/**
 * Derive a macro ring's count, completeness segments, and state flags for one
 * backend. Pure: no OL/DOM. `filtered` is the backend's filtered aggregate
 * (`{count, complete, partial, missing}`) when a filter is active and that
 * backend has settled a total; `null`/`undefined` falls back to cached
 * `get_meta` totals unchanged.
 *
 * State flags (consumed by `macroRingStyleFn`):
 *  - `offline`       — backend explicitly `healthUp: false`
 *  - `importing`     — backend is mid-import (and not offline)
 *  - `degraded`      — "no data": count is 0 and the backend has no unfiltered
 *                       data (genuinely empty), with or without an active filter
 *  - `filteredEmpty` — "no match": a filter excluded all of a *populated* backend
 *
 * @param {object} backend  registry entry ({ healthUp?, importing?, completeness?, playgroundCount? })
 * @param {{count:number, complete:number, partial:number, missing:number}|null} [filtered]
 * @returns {{offline:boolean, importing:boolean, degraded:boolean, filteredEmpty:boolean,
 *            count:number, complete:number, partial:number, missing:number, restricted:number}}
 */
export function deriveMacroRing(backend, filtered = null) {
  const offline   = !isBackendHealthy(backend);
  const importing = !offline && (backend.importing ?? false);
  // Pre-P1 backends ship no `complete/partial/missing` extension; their count
  // maps into the `restricted` bucket so the renderer draws a flat gray ring.
  const c     = backend.completeness;
  const count = filtered ? filtered.count : (backend.playgroundCount ?? 0);
  // "No match" (filteredEmpty) only applies when the backend actually HAS
  // playgrounds that the filter excluded — a filter can't exclude data that
  // was never there. A genuinely empty backend (no unfiltered data) stays
  // "no data" (degraded) even under an active filter (#689). Health states
  // (offline/importing) still take precedence.
  const hasUnfiltered = (backend.playgroundCount ?? 0) > 0;
  const filteredEmpty = !offline && !importing && !!filtered && count === 0 && hasUnfiltered;
  const degraded      = !offline && !importing && count === 0 && !filteredEmpty;
  const segments = filtered
    ? { complete: filtered.complete, partial: filtered.partial, missing: filtered.missing, restricted: 0 }
    : c
    ? { complete: c.complete, partial: c.partial, missing: c.missing, restricted: 0 }
    : { complete: 0, partial: 0, missing: 0, restricted: count };
  return { offline, importing, degraded, filteredEmpty, count, ...segments };
}
