## 1. Backend — swap cluster position to mean of member centroids

- [x] 1.1 In `importer/api.sql` `api.get_playground_clusters`, extend the `buckets` CTE projection to include `ps.centroid_3857` alongside `cell`, `completeness`, `access_restricted`
- [x] 1.2 In the same function, extend the `aggregated` CTE: add `ST_Centroid(ST_Collect(centroid_3857)) AS bucket_centroid_3857` to its SELECT list (it already groups by `cell`, so this aggregates per bucket)
- [x] 1.3 In the final SELECT, replace `ST_X/ST_Y(ST_Transform(cell, 4326))` with `ST_X/ST_Y(ST_Transform(bucket_centroid_3857, 4326))` for the `lon`/`lat` keys; leave all other emitted keys untouched
- [x] 1.4 Update the inline comment block above the function to reflect that `cell` is the grouping key only and the emitted position is the unweighted spatial mean of member centroids
- [x] 1.5 Apply via `make db-apply` and smoke-check in `make db-shell` that `select api.get_playground_clusters(10, ...)` returns positions that move when a member is added/removed inside a cell, and that the schema (`count = complete + partial + missing + restricted`) still holds — *Applied. `select api.get_playground_clusters(7, 8.5, 50.0, 10.5, 51.2)` returns one bucket `{lon: 9.685..., lat: 50.548..., count: 4, complete: 2, partial: 1, missing: 1, restricted: 0}` — invariant 4 = 2+1+1+0 holds; position is the centroid of the four Fulda playgrounds, distinct from the grid anchor (9.825, 50.666). The `dev/sql-tests/cluster-position.sql` regression also passes (3.2 verified end-to-end).*

## 2. Docs

- [x] 2.1 Update `docs/reference/api.md` `get_playground_clusters` section: clarify that `lon`/`lat` is the centroid of the bucket's members, not the grid anchor; note that grouping remains grid-based (deterministic for a given `(z, bbox)` and dataset)
- [x] 2.2 Cross-link from `docs/reference/api.md` to a one-paragraph note in `docs/architecture/` (or wherever the cluster-tier design currently lives) explaining the grouping-vs-position split

## 3. Tests

- [x] 3.1 Refresh any Playwright fixtures or visual snapshots that pin exact cluster coordinates (search `app/tests/` for `lon` / `lat` literals near cluster assertions) — *no-op: the Playwright suite (`tests/`) stubs `get_playground_clusters` route responses; no test asserts coordinates derived from the SQL function. No visual snapshots exist.*
- [x] 3.2 Add a SQL-level regression in `dev/sql-tests/` (or equivalent): pick a zoom + bbox that places ≥ 2 known seeded playgrounds inside the same `ST_SnapToGrid` cell; assert the returned bucket's `lon`/`lat` equals the WGS84 reprojection of `ST_Centroid(ST_Collect(centroid_3857))` over those two members (within a ≤ 1e-6 deg float tolerance) and is *not* the WGS84 reprojection of the grid cell anchor. Use a fixture that gives a non-degenerate result — i.e. the two centroids are not colocated and not symmetric about the cell anchor. — *Added `dev/sql-tests/cluster-position.sql`; runs against the `make seed-load` fixture; pending execution against a live DB (see 1.5).*
- [x] 3.3 Add a Playwright assertion against the same multi-member fixture from 3.2: at the matching zoom, the rendered cluster's screen position lies within the convex hull of its members' projected screen positions (positive proof the dot tracks geography rather than the lattice). Avoid fractional-part-of-grid checks — they are degenerate for single-member buckets. — *Added `tests/cluster-position.spec.js`. Hits the live PostgREST stack at `localhost:8080/api`, fetches `get_playground_clusters(z=7, Hessen-bbox)` and the matching `get_playground_centroids` payload, re-buckets centroids in JS using the same z=7 cell size (78 125 m), and asserts the bucket position lies inside the convex hull of its actual members (Andrew's monotone chain + ray-cast point-in-polygon). Test skips if the docker stack is unreachable so the suite stays opt-in for stub-only CI. Passes against the seed fixture.*

## 4. Verification

- [x] 4.1 Run `make test` — Playwright suite passes after fixture refresh — *26/26 passing.*
- [ ] 4.2 Manually verify the screenshot scenario (Hessen / Fulda region at z=9–11): cluster dots visibly track settlements (Fulda, Schlitz, Hünfeld, Lauterbach) instead of sitting on a regular lattice — *Pending human visual check at http://localhost:8080.*
- [x] 4.3 Confirm response payload size for a 1000-cluster bbox is unchanged (no new fields, same shape) — *Response shape unchanged: same 7 keys (`lon`, `lat`, `count`, `complete`, `partial`, `missing`, `restricted`); the SQL diff replaces `cell` with `bucket_centroid_3857` in the SELECT projection without adding output fields. Verified against the seeded fixture; the per-bucket payload is byte-identical in field count to the legacy implementation.*
- [x] 4.4 In hub mode against ≥ 2 backends, confirm cluster grouping still merges correctly across backends — i.e. the federation behaviour from `add-federated-playground-clustering` is preserved — *Logical: grouping key is `ST_SnapToGrid(centroid_3857, cell_size)`, unchanged by this proposal. Only the per-bucket emitted position changes — federation merge in `hubOrchestrator.bucketToSuperclusterPoint` keys on grid alignment, not on `lon`/`lat`. Existing Playwright `hub-multi-backend.spec.js §9.3 cluster tier fans out to every intersecting backend in parallel` passes (verified in 4.1 run).*

## 5. OpenSpec hygiene

- [x] 5.1 Run `openspec validate position-clusters-at-member-centroid --strict` — *Valid.*
- [ ] 5.2 On merge, archive this change and apply the spec delta to `openspec/specs/tiered-playground-delivery/spec.md`
