## 1. Database — `importer/api.sql`

- [ ] 1.1 In `playground_stats`, make `access_restricted` NULL-safe: change `(pl.access IN ('private','customers'))` to a form that yields `false` for untagged rows (e.g. `COALESCE(pl.access,'') IN ('private','customers')`).
- [ ] 1.2 In `get_playground_clusters`, replace the four `SUM(CASE …)` expressions with three keyed only on `completeness`: `complete`, `partial`, `missing` (drop the `NOT access_restricted` guard and the separate `restricted` SUM).
- [ ] 1.3 Remove `'restricted'` from the `json_build_object` output of `get_playground_clusters`.
- [ ] 1.4 Confirm `filter_private` and the completeness-filter WHERE clauses still reference `access_restricted`/`completeness` correctly after the NULL-safety fix.
- [ ] 1.5 `make db-apply` and sanity-check: `count = complete + partial + missing` for sample buckets via `get_playground_clusters`.

## 2. Cluster renderer — `app/src/lib/clusterStyle.js`

- [ ] 2.1 Remove `HATCH_BG`, `HATCH_LINE`, `RESTRICTED_DOT` constants and `makeHatchPattern()`.
- [ ] 2.2 Drop the `restricted` parameter and the `r10` arc from `quantise()` and `drawStackedRing()`; the ring now draws three segments (complete/partial/missing).
- [ ] 2.3 Remove `r10` from the bitmap-cache key in `getOrCreateBitmap()`.
- [ ] 2.4 In the single-child dot path, remove the `restricted > 0 → RESTRICTED_DOT` branch; colour purely by completeness.
- [ ] 2.5 Remove the `restricted` read in `renderStackedRing()` (`feature.get('restricted')`).
- [x] 2.6 (done) Ring sizing retuned from live-browser review: radii `26/32/38/44 → 18/22/28/34`, `RING_WIDTH 12 → 8`, centre count `bold 22px → 16px`.

## 3. Frontend data plumbing

- [ ] 3.1 `app/src/lib/api.js` — update the `fetchPlaygroundClusters` docstring: response shape `{lon,lat,count,complete,partial,missing}` and invariant `count = complete + partial + missing`.
- [ ] 3.2 `app/src/lib/tieredOrchestrator.js` — remove the now-dead `restricted` passthrough.
- [ ] 3.3 `app/src/hub/hubOrchestrator.js` — remove the cluster-bucket `restricted` passthroughs/accumulation (leave the macro-tier code untouched).
- [ ] 3.4 `app/src/components/CompletenessLegend.svelte` — if a hatched "not public" swatch is present, remove it; otherwise note no change.

## 4. Confirm out-of-scope code untouched

- [ ] 4.1 Verify `app/src/hub/macroRingStyle.js` and `app/src/hub/MacroView.svelte` still render their gray "offline / unknown-completeness backend" segment (no changes).
- [ ] 4.2 Verify the polygon tier's per-feature `access_restricted` filter attribute (`get_playgrounds_bbox` / `filter_attrs`) is unchanged.

## 5. Tests & verification

- [ ] 5.1 Update unit tests referencing `restricted` cluster fields / hatch rendering (e.g. cluster-style and orchestrator tests) to the three-segment model.
- [ ] 5.2 Fresh-volume import test: `make down && docker volume rm spieli_pgdata spieli_pgdata2 && make up`, then confirm `get_playground_clusters` returns no `restricted` field and the new invariant holds.
- [ ] 5.3 `make docker-build`; visually confirm on `localhost:8080` that the previously fully-grey Fulda clusters now render in completeness colours and no hatched rings remain.
- [ ] 5.4 `make build` and `make test` green.

## 6. Release hygiene

- [ ] 6.1 Label the PR `requires-schema-update` (operators run `API_ONLY=1` after upgrade).
- [ ] 6.2 Update `docs/reference/api.md` for the new `get_playground_clusters` response shape and invariant.
