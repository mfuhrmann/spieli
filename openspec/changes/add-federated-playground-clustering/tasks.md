## 1. Hub — bbox routing and backend metadata

- [ ] 1.1 Extend `app/src/hub/registry.js` (or add `app/src/hub/backends.js`) to cache each backend's `bbox` field from its `get_meta` response
- [ ] 1.2 Expose a readable `backendsStore` emitting `{ url, slug, name, bbox, playgroundCount, completeness: {complete, partial, missing} }` per backend
- [ ] 1.3 Add `app/src/hub/bboxRouter.js` — pure function `selectBackends(viewportBbox, backends) => backends[]` that returns only backends whose cached bbox intersects the viewport
- [ ] 1.4 Keep bboxes fresh by re-invoking `get_meta` on the existing 5-minute registry poll
- [ ] 1.5 Integrate `federation-status.json` as a filter: backends with `ok: false` are excluded from the router's output (soft fallback when the status file is absent — treat every backend as reachable)

## 2. Hub — fan-out with progressive render

- [ ] 2.1 Create `app/src/hub/fanOut.js` — `fanOut(fetcher, backends, signal)` invokes `fetcher(backendUrl, signal)` in parallel across `backends`, emits each response as it settles via an async iterator or callback
- [ ] 2.2 Fan-out shares a single `AbortController` across its invocations; on cancel, every in-flight request is aborted
- [ ] 2.3 Per-backend per-request timeout (default 5s); timed-out backends are logged once per session and excluded from the current fan-out
- [ ] 2.4 Errors from one backend do not reject the fan-out promise; they are surfaced as `{ ok: false, error, backendUrl }` entries

## 3. Hub — zoom-tier orchestrator

- [ ] 3.1 Replace the existing "fetch all playgrounds from every backend" logic in `HubApp.svelte` with a moveend-driven orchestrator mirroring P1's standalone pattern but using `fanOut`
- [ ] 3.2 Three tiers (cluster / centroid / polygon) map to `fetchPlaygroundClusters`, `fetchPlaygroundCentroids`, `fetchPlaygroundsBbox` fanned-out across the selected backends
- [ ] 3.3 Below `clusterMaxZoom` (zoom 0–5), the orchestrator dispatches nothing — the macro view renders from the cached `backendsStore` only
- [ ] 3.4 On tier transition, abort the previous fan-out before kicking off the new tier's
- [ ] 3.5 Expose hub-tier bookkeeping via a `hubLoadingStore` so the instance pill can show partial-loaded state (e.g. "3/5 regions loaded")

## 4. Hub — client-side re-clustering

- [ ] 4.1 Cluster tier: merged buckets from all backends' `get_playground_clusters` are fed into a Supercluster instance as weighted points; `map`/`reduce` callbacks preserve `{count, complete, partial, missing}`
- [ ] 4.2 Centroid tier: merged centroids from all backends' `get_playground_centroids` fed into a single Supercluster index; filter attrs preserved per-feature
- [ ] 4.3 Polygon tier: per-backend `get_playgrounds_bbox` results are concatenated into a single `VectorSource` (no re-clustering needed); each feature tagged with `_backendUrl` for selection routing
- [ ] 4.4 On each fan-out partial arrival, the relevant Supercluster index is incrementally updated (`load` with the accumulated set) and the map repaints

## 5. Hub — country-level macro view (zoom 0–5)

- [ ] 5.1 Create `app/src/hub/MacroView.svelte` — renders one OL feature per backend at the backend's bbox centroid
- [ ] 5.2 Macro-view features use the same stacked-ring renderer from P1 (`stackedRingRenderer`) with count, complete, partial, missing from the backend's cached `get_meta` completeness counts
- [ ] 5.3 Backends with `ok: false` (from federation-status) render as outlined (stroke-only) rings with a muted colour and a small "offline" label
- [ ] 5.4 Clicking a macro-view ring animates `view.fit` to the backend's bbox, which naturally lands in the cluster or centroid tier
- [ ] 5.5 Hover over a macro ring shows a tooltip with region name, playground count, and data freshness (from `federation-status.json` or `get_meta.data_version`)
- [ ] 5.6 Macro view visibility is gated on `zoom <= clusterMaxZoom`

## 6. Hub — initial map fit clamp

- [ ] 6.1 When only one backend is registered, clamp the initial `view.fit` to `maxZoom: clusterMaxZoom + 1` or higher (so single-backend hubs don't land in the macro view spuriously)
- [ ] 6.2 When multiple backends are registered, initial fit uses the union of their bboxes as today; if that union sits at or below `clusterMaxZoom`, the macro view takes over and the fit is correct by construction

## 7. Hub — filter-aware cluster badge under federation

- [ ] 7.1 At the centroid tier, the filter badge computation runs over merged centroids from all contributing backends; no per-backend change needed beyond P1
- [ ] 7.2 At the cluster tier, no filter badge (same rule as P1)
- [ ] 7.3 At the macro tier, no filter badge (decision D6 in design.md)

## 8. Docs

- [ ] 8.1 Add a "Scale and clustering" section to `docs/reference/federation.md` describing the zoom tiers, bbox routing, and the country-level macro view
- [ ] 8.2 Update `docs/ops/federated-deployment.md` (coming in `document-federated-hub-deployment`) with a note that backends must implement `add-tiered-playground-delivery` before joining a hub running this code
- [ ] 8.3 Add an architecture diagram (mermaid or simple ASCII) showing hub → bbox-router → fan-out → re-cluster → render

## 9. Verification

- [ ] 9.1 Playwright: on a two-backend test registry, load the hub at zoom 4, assert macro rings appear for both backends with correct counts; zoom in and assert transitions to cluster tier trigger fan-out to both backends
- [ ] 9.2 Playwright: disable one backend mid-test (via a proxy that returns 503); assert the macro-view ring becomes outlined and subsequent moveends skip that backend
- [ ] 9.3 Playwright: moveend across the border between two backends; assert combined clusters render without visible seams and counts sum correctly
- [ ] 9.4 Manual: on a simulated 10-backend registry, confirm fan-out completes within 2s at cluster tier over a Europe-wide viewport
- [ ] 9.5 Manual: pan rapidly across borders, confirm cancelled fetches do not leak features from previous viewports
- [ ] 9.6 Lifecycle: `federation-status.json` is removed mid-session (simulate by stopping cron); fall back to "assume reachable", log warning once
- [ ] 9.7 `openspec validate add-federated-playground-clustering` passes before archive
