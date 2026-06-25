## 1. macroFiltered store

- [x] 1.1 Create `app/src/stores/macroFiltered.js`: `writable(null)`. Value is `Map<backendUrl, {count, complete, partial, missing}>` when a filter is active, or `null` when not. Document the contract in a header comment.

## 2. hubOrchestrator — macro filter fan-out

- [x] 2.1 Import `hasActiveFilters` from `stores/filters.js`, `transformExtent` (already imported), and the new `macroFilteredStore`.
- [x] 2.2 In `orchestrate()`'s `tier === 'macro'` branch: after `clearSourcesAndProgress()`, read `const filters = getFilters()`. If `!filters || !hasActiveFilters(filters)` → `macroFilteredStore.set(null)` and return (preserve zero-fetch path). _(Implemented as `orchestrateMacroFilter(signal)` called from the macro branch.)_
- [x] 2.3 Filter active: select backends (`filterHealthy(allBackends)`, filtered to those with a bbox, since the macro viewport is global), build a fresh `const acc = new Map()`, and fan out `fetchPlaygroundClusters` per backend scoped to **that backend's own bbox** (transform `backend.bbox` → EPSG:3857 for the extent arg), passing `filters`. Use `clusterFetcherFor(url)` so legacy peers are skipped.
- [x] 2.4 In `onResult`: for an `ok` array entry, sum `count/complete/partial/missing` across all buckets, set `acc.set(backendUrl, {count, complete, partial, missing})`, and `macroFilteredStore.set(new Map(acc))` (publish progressively, fresh Map each time so subscribers see a new reference). For a 404 entry, call `markBackendLegacy(backendUrl)` and write no entry. Guard on `signal.aborted`.
- [x] 2.5 Ensure the fresh-per-call `acc` and the abort controller prevent a superseded macro fan-out from publishing stale entries (mirror the cluster branch's abort handling). _(Macro branch reuses `orchestrate()`'s `abort` signal; superseded calls are aborted and `onResult` guards on `signal.aborted`.)_
- [x] 2.6 On orchestrator `detach()`, leave the store as-is (next mount resets it); confirm no leak.

## 3. MacroView — merge filtered aggregate

- [x] 3.1 Add `export let macroFiltered;` (the store) as a prop; subscribe alongside `backends` so a rebuild fires on either store's change. _(Mirrored both store values into `backendsValue`/`filteredValue`; either subscription calls `rebuild()`.)_
- [x] 3.2 In `buildFeature(backend)`: read the current filtered map. If non-null and it has an entry for `backend.url`, override `count/complete/partial/missing` from the entry (these feed both `props` and the healthy ring); if the entry's `count === 0`, set `_filteredEmpty: true` on the feature.
- [x] 3.3 When the filtered map is non-null but has **no** entry for this backend (not yet settled, or legacy peer), fall back to cached-meta values (no override, no `_filteredEmpty`).
- [x] 3.4 Confirm `_offline` / `_importing` / `_degraded` flag computation is unchanged and still derived from backend health, not from the filtered count. _(`_degraded` now additionally requires no filtered entry, so a filtered-0 backend takes the `_filteredEmpty` path instead.)_

## 4. macroRingStyle — grey "no match" ring

- [x] 4.1 Add `renderFilteredEmptyMacroRing(pixelCoords, state)`: grey ring (gray-400 #9ca3af stroke, `RING_WIDTH`), gray-50 inner disc with thin grey stroke, `LABEL_FONT` text "no match", minimum radius (26, as degraded).
- [x] 4.2 Add `const filteredEmptyStyle = new Style({ renderer: renderFilteredEmptyMacroRing });`
- [x] 4.3 In `macroRingStyleFn`, insert the check **after** `_offline` and `_importing`, **before** `_degraded`.
- [x] 4.4 Update the file header comment (variant list) to include the "no match" filtered-empty ring.

## 5. Wire the store into the hub

- [x] 5.1 In the hub mount path, pass `macroFilteredStore` to `MacroView`; the orchestrator imports the store directly. Also extend HubApp's filter-change rerun guard from `cluster` to `cluster || macro` so a filter toggle at macro zoom re-derives.

## 6. Unit tests

- [x] 6.1 `macroFiltered` store default is `null` (+ holds an aggregate Map). `src/stores/macroFiltered.test.js`.
- [ ] 6.2 Orchestrator: filter inactive at macro tier → store set to `null`, no cluster fetch dispatched. _(Deferred — orchestrator has no unit-test harness in this repo; needs OL map + fanOut mocking. Covered by smoke test 8.3.)_
- [ ] 6.3 Orchestrator: filter active → cluster fetch per backend with bbox + filter params; buckets summed. _(Deferred — same reason. The bucket-sum is exercised end-to-end by 8.3.)_
- [ ] 6.4 Orchestrator: 404 from a backend → no store entry, `markBackendLegacy` invoked. _(Deferred — same reason.)_
- [ ] 6.5 `buildFeature`: filtered overrides / `_filteredEmpty` / cached-meta fallback. _(Deferred — `buildFeature` is internal to the `.svelte` component, not importable under the node test runner. Covered by 8.3.)_
- [x] 6.6 `macroRingStyleFn`: `_filteredEmpty` → its own style; `_offline`/`_importing` precede it; it precedes `_degraded`. `src/hub/macroRingStyle.test.js`.

## 7. Docs

- [x] 7.1 `docs/contributing/frontend-guide.md` — macro-tier filter path (zero-fetch when idle, cluster fan-out when filtering) + the "no match" ring among the macro ring variants. Also added the `macroFilteredStore` row and a per-tier filter-path table. CLAUDE.md store table updated too.

## 9. FilterChips — missing removable chips (bug found during testing)

- [x] 9.1 `app/src/components/FilterChips.svelte`: add `fence`, `hasDogs`, `shade` to `FILTER_KEYS` so those active filters render a removable chip (they were settable but had no chip). Add a comment to keep the list in sync with `defaultFilters`.
- [x] 9.2 Confirm i18n labels exist for the three keys in the registered locales (`de`/`en`) — present; other locale files are dormant and `fallbackLocale: 'en'` covers any gap.
- [x] 9.3 `docs/contributing/frontend-guide.md` "Adding a new filter" — add an explicit `FilterChips.svelte` / `FILTER_KEYS` step (the checklist previously omitted it, which is how this bug slipped in) so future filters don't repeat it.

## 8. Verification

- [x] 8.1 `npm --prefix app run test:unit` — all pass (incl. two new suites).
- [x] 8.2 `make docs-build` — builds clean; no new broken links (pre-existing INFO warnings only).
- [x] 8.3 Manual hub smoke test (single-backend local hub, `APP_MODE=hub`, `MAP_MIN_ZOOM=4`): zoom to macro, toggle a filter (e.g. baby) → ring reshapes to filtered totals; toggle off all completeness states → grey "no match" ring; clear filters → full totals restored. Verified working. Also confirmed the FilterChips fix (§9) live.
