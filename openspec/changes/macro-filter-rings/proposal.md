## Why

At the macro (country) zoom in hub mode, active filters have no effect — the map shows one ring per backend with its full, unfiltered catalogue count and completeness breakdown. Issue #686.

Filters are applied per tier: the cluster tier filters server-side (`get_playground_clusters` accepts `filter_*` params) and the polygon tier filters client-side (`matchesFilters` in `Map.svelte`). The macro tier has no filter path at all — `orchestrate()` short-circuits the `'macro'` branch with zero fetches, and `MacroView.svelte` builds rings straight from the cached, unfiltered `get_meta` response on the backends store. So a user who sets a filter and zooms all the way out sees totals that ignore the filter entirely.

## What Changes

- When filters are active at the macro tier, the hub orchestrator fans out the existing filter-aware `get_playground_clusters` RPC once per backend (scoped to each backend's own bbox), sums the returned buckets into a per-backend filtered aggregate `{count, complete, partial, missing}`, and publishes it on a new `macroFilteredStore`.
- When no filter is active, the macro tier stays on today's zero-fetch path (`get_meta` cache); the store is set to `null`.
- `MacroView.svelte` merges the filtered aggregate into each ring's props when present, so the healthy ring's size and segments reflect the filtered subset automatically.
- A backend whose filtered count is `0` renders a new grey "no match" ring — distinct from offline (dashed), importing (blue), unknown-completeness (grey, with count), and degraded (amber "no data") — so a region with zero matching playgrounds stays visible as a "global state" rather than disappearing.
- A backend that can't filter (pre-tier release → 404 on the cluster RPC) keeps its unfiltered cached-meta ring; the existing per-backend legacy fallback covers this.
- Docs: `docs/contributing/frontend-guide.md` notes the macro tier's filter-only fan-out and the new ring state.
- Bug fix (found while testing this change): `FilterChips.svelte` did not render a removable chip for the `fence`, `hasDogs`, and `shade` filters — its `FILTER_KEYS` allow-list was missing those keys, so the filters could be set but not cleared from the chip bar. The three keys are added to the list.

## Capabilities

### New Capabilities

- `macro-filter-rings`: Macro-view rings reflect active filters by deriving a per-backend filtered aggregate from the cluster RPC; zero-match backends render a distinct grey ring instead of vanishing.

### Modified Capabilities

<!-- none — no existing spec-level behavior changes; macro tier had no filter behavior to modify -->

## Impact

- `app/src/hub/hubOrchestrator.js` — filter-active macro fan-out + per-backend bucket summation; publish to `macroFilteredStore`
- `app/src/stores/macroFiltered.js` — new store (per-backend filtered aggregate, or `null`)
- `app/src/hub/MacroView.svelte` — merge filtered aggregate into ring props; flag zero-match
- `app/src/hub/macroRingStyle.js` — new grey "no match" ring renderer + priority slot
- `docs/contributing/frontend-guide.md` — document macro filter path + ring state
- `app/src/components/FilterChips.svelte` — add `fence`/`hasDogs`/`shade` to the chip allow-list
- No API changes, no DB changes, no breaking changes (cluster RPC and its filter params already exist)
