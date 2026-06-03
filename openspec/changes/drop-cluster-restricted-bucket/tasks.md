## 1. Database — `importer/api.sql`

- [x] 1.1 In `playground_stats`, make `access_restricted` NULL-safe: change `(pl.access IN ('private','customers'))` to a form that yields `false` for untagged rows (e.g. `COALESCE(pl.access,'') IN ('private','customers')`).
- [x] 1.2 In `get_playground_clusters`, replace the four `SUM(CASE …)` expressions with three keyed only on `completeness`: `complete`, `partial`, `missing` (drop the `NOT access_restricted` guard and the separate `restricted` SUM).
- [x] 1.3 Remove `'restricted'` from the `json_build_object` output of `get_playground_clusters`.
- [x] 1.4 Confirm `filter_private` and the completeness-filter WHERE clauses still reference `access_restricted`/`completeness` correctly after the NULL-safety fix. (Verified: `NOT filter_private OR NOT access_restricted` is now correct with a non-NULL column; completeness filters never referenced access.)
- [x] 1.5 `make db-apply` and sanity-check. Applied via single-transaction psql (no `.env` present; env pulled from running container). Verified: `access_restricted IS NULL` count 210 → 0; `get_playground_clusters` 0 invariant violations across 179 buckets.

## 2. Cluster renderer — `app/src/lib/clusterStyle.js`

- [x] 2.1 Remove `HATCH_BG`, `HATCH_LINE`, `RESTRICTED_DOT` constants and `makeHatchPattern()`.
- [x] 2.2 Drop the `restricted` parameter and the `r10` arc from `quantise()` and `drawStackedRing()`; the ring now draws three segments (complete/partial/missing). The missing arc absorbs the rounding residual.
- [x] 2.3 Remove `r10` from the bitmap-cache key in `getOrCreateBitmap()`.
- [x] 2.4 In the single-child dot path, remove the `restricted > 0 → RESTRICTED_DOT` branch; colour purely by completeness.
- [x] 2.5 Remove the `restricted` read in `renderStackedRing()` (`feature.get('restricted')`).
- [x] 2.6 (done) Ring sizing retuned from live-browser review: radii `26/32/38/44 → 18/22/28/34`, `RING_WIDTH 12 → 8`, centre count `bold 22px → 16px`.

## 3. Frontend data plumbing

- [x] 3.1 `app/src/lib/api.js` — update the `fetchPlaygroundClusters` docstring: response shape `{lon,lat,count,complete,partial,missing}` and invariant `count = complete + partial + missing`.
- [x] 3.2 `app/src/lib/tieredOrchestrator.js` — remove the now-dead `restricted` passthrough.
- [x] 3.3 `app/src/hub/hubOrchestrator.js` — remove the cluster-bucket `restricted` passthroughs/accumulation (map/reduce + both `superclusterFeatureToOl` branches + `bucketToSuperclusterPoint`). Macro-tier code untouched.
- [x] 3.4 `app/src/components/CompletenessLegend.svelte` — no hatched "not public" swatch present; no change required.

## 4. Confirm out-of-scope code untouched

- [x] 4.1 Verified `app/src/hub/macroRingStyle.js` and `app/src/hub/MacroView.svelte` still render their gray "offline / unknown-completeness backend" segment (no changes).
- [x] 4.2 Verified the polygon tier's per-feature `access_restricted` filter attribute (`get_playgrounds_bbox` / `filter_attrs`) is unchanged (the column is now NULL-safe, an improvement, but still emitted).

## 5. Tests & verification

- [x] 5.1 Updated tests referencing the removed `restricted` field (found in Playwright E2E specs, not unit tests): `tests/cluster-position.spec.js` invariant assertion dropped `+ bucket.restricted` (was producing `NaN` against the live API); stale `restricted: 0` removed from the `tests/helpers.js` and `tests/hub-multi-backend.spec.js` cluster-bucket stubs.
- [ ] 5.2 Fresh-volume import test (`make down && docker volume rm spieli_pgdata spieli_pgdata2 && make up`) — DESTRUCTIVE (wipes data + full re-import); left for the operator to run. Note: the single-transaction `db-apply` already validated api.sql ordering end-to-end.
- [x] 5.3 `make docker-build` done; live `:8080` API verified (`/api/rpc/get_playground_clusters` returns no `restricted` field, 0 invariant violations). Visual eyeball of the map (grey rings gone) left for the user.
- [~] 5.4 `make build` green. `make test`: Playwright E2E not run in this session; `make test-unit` has a PRE-EXISTING `completeness.test.js` failure (local Node 24 vs CI Node 20, reproduces on pristine `main`) — unrelated to this change. CI gate is Playwright-only and will run on the PR.

## 6. Release hygiene

- [ ] 6.1 Label the PR `requires-schema-update` (operators run `API_ONLY=1` after upgrade). — pending PR creation.
- [x] 6.2 Update `docs/reference/api.md` for the new `get_playground_clusters` response shape and invariant (plus the two stale "unlike get_playground_clusters" cross-references).
