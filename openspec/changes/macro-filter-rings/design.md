## Context

In hub mode the zoom-tier orchestrator (`hubOrchestrator.js`) drives three tiers: `macro` (zoom ≤ `macroMaxZoom`), `cluster`, and `polygon`. The macro tier is unique in doing **no network I/O** — `orchestrate()` hits the `tier === 'macro'` branch, clears the cluster/polygon sources, and returns. The rings are rendered by `MacroView.svelte`, which subscribes only to the registry's `backendsStore` and builds one Point feature per backend from the cached `get_meta` response (`count`, `complete`, `partial`, `missing`, `bbox`). That meta is a whole-region aggregate with no filter dimension.

The cluster tier already filters server-side: `fetchPlaygroundClusters(z, extent, url, sig, filters)` maps the client filter snapshot onto `filter_*` query params (`clusterFilterMap` plus the three completeness toggles) and `get_playground_clusters` returns buckets whose `count/complete/partial/missing` already exclude non-matching playgrounds. Summing every bucket a backend returns over its full bbox therefore yields the backend's filtered totals — no new RPC required.

`macroRingStyle.js` renders four variants today, selected by feature flags in priority order: offline (`_offline`, dashed grey) → importing (`_importing`, blue) → degraded (`_degraded`, amber "no data", fires when online + `count === 0`) → healthy (segments + count; an unknown-completeness backend lands here too, with its whole count in the grey `restricted` segment).

## Goals / Non-Goals

**Goals:**
- Macro rings reflect active filters: ring size + completeness segments show the filtered subset per backend.
- A backend with zero filtered matches stays visible as a distinct grey "no match" ring (a "global state" cue), rather than disappearing.
- Preserve the macro tier's zero-fetch behavior when **no** filter is active.
- No API or DB changes — reuse the existing filter-aware cluster RPC.

**Non-Goals:**
- A filtered variant of `get_meta` (option A — rejected, needs a schema/RPC change and backend-skew handling that the cluster path already solves).
- Filtering at the macro tier when the backend can't serve the cluster RPC (pre-tier peers fall back to their unfiltered cached ring).
- Changing cluster- or polygon-tier filter behavior.
- Cross-backend re-clustering at the macro tier (each backend remains one ring; we only re-aggregate its own buckets).

## Decisions

**D1 — Derive filtered totals from the cluster RPC, not a new meta RPC.**
The cluster RPC is already filter-aware and already deployed; summing its buckets over a backend's bbox gives the filtered `{count, complete, partial, missing}`. This avoids a `requires-schema-update` migration and reuses the existing per-backend 404→legacy fallback. Cost: one cluster fetch per backend, but only while a filter is active (see D3). The bucketing `z` is immaterial to the sum — buckets partition the region at any `z`, so totals are `z`-invariant; we query each backend with its own `bbox` (not the world viewport) so the response covers exactly that backend's region.

**D2 — New `macroFilteredStore`, merged in `MacroView`.**
The orchestrator owns the data-fetch lifecycle (abort, fan-out, progress) and already writes `activeTierStore` / `hubLoadingStore`; it publishes a `Map<backendUrl, {count, complete, partial, missing}> | null` on a new `macroFiltered.js` store. `null` means "no filter active — use cached meta." `MacroView` subscribes to `backendsStore` **and** `macroFilteredStore` and rebuilds on either; in `buildFeature`, when the store is non-null and has an entry for `backend.url`, the filtered values override the cached-meta `count/complete/partial/missing`. Keeping the merge in `MacroView` preserves its role as the single ring-building site (offline/importing/degraded logic stays there) and avoids the orchestrator stamping OL features for a tier it otherwise doesn't own.

**D3 — Fetch only when a filter is active; zero-fetch otherwise.**
`orchestrate()`'s macro branch checks `hasActiveFilters(getFilters())`. Inactive → `macroFilteredStore.set(null)` and return (today's behavior, zero fetches). Active → run the fan-out. This bounds the new I/O to filtering sessions; panning at min zoom with no filter stays free.

**D4 — Progressive, per-backend override.**
The fan-out publishes incrementally (same philosophy as the cluster tier's progressive repaint): as each backend's filtered total settles, its entry is added to the store map and `MacroView` re-renders that ring. A backend not yet arrived keeps showing its cached-meta ring until its entry lands — no blank flash. The store map is rebuilt fresh per `orchestrate()` call so a superseded fan-out's winners don't leak into the next.

**D5 — Zero-match → new grey "no match" ring.**
When the store is non-null, a backend has an entry, and that entry's `count === 0`, `buildFeature` sets `_filteredEmpty = true`. `macroRingStyle.js` gains `renderFilteredEmptyMacroRing` (grey `restricted` stroke #9ca3af, white inner disc, label "no match", minimum radius) and `macroRingStyleFn` checks `_filteredEmpty` **after** offline/importing and **before** degraded. Rationale for placement: offline/importing describe backend health and take precedence over a filter result; "no match" is a filter outcome on a healthy backend, semantically adjacent to degraded ("no data") but distinct in cause and colour (grey filter-exclusion vs amber data-absence).

**D6 — Filter-incapable backend keeps its unfiltered ring.**
If a backend 404s on the cluster RPC at the macro tier, the existing `markBackendLegacy` path fires and we simply do not write a filtered entry for it. `buildFeature` then falls back to cached meta for that backend — its ring shows unfiltered totals during a filtering session. Acceptable, bounded degradation; matches how the cluster/polygon tiers already treat pre-tier peers.

## Risks / Trade-offs

- [Macro tier no longer always zero-fetch] Mitigated by D3 — fetches fire only when a filter is active. One debounced fan-out per macro moveend while filtering; macro backends number <20.
- [Mixed filtered/unfiltered rings during fan-out settle, or with a legacy peer] A peer that can't filter, or hasn't settled yet, shows unfiltered totals briefly/until arrival. Progressive paint (D4) keeps this transient for capable peers; legacy peers are a known, rare degradation (D6).
- [Grey overload] `restricted`/unknown-completeness rings are already grey (with a count); the new "no match" ring is also grey but carries a "no match" label and zero count, and only appears while filtering. Label + context disambiguate. Offline stays dashed; degraded stays amber.
- [Sum correctness] Relies on cluster buckets partitioning the region without overlap or double-count. This is the same invariant the cluster tier's Supercluster re-aggregation already depends on.

## Migration Plan

No data migration, no API change, no DB change. The cluster RPC and its `filter_*` params already exist and are deployed wherever the cluster tier works. Backends too old to serve the cluster RPC degrade per D6 (unfiltered ring). No env, compose, or registry-format change. Pure frontend change.
