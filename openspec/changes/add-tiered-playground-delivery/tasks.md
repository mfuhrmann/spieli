## 1. Backend — tiered RPCs

- [ ] 1.1 Add `api.get_playground_clusters(z int, min_lon float8, min_lat float8, max_lon float8, max_lat float8)` in `importer/api.sql` — buckets features by `ST_SnapToGrid` using `cell_size_m` derived from `z`; returns `{lon, lat, count, complete, partial, missing}` per bucket as a JSON array
- [ ] 1.2 Add `api.get_playground_centroids(min_lon, min_lat, max_lon, max_lat)` returning per-playground rows: `osm_id`, `lon`, `lat`, `completeness` ('complete'|'partial'|'missing'), packed filter-attrs object
- [ ] 1.3 Add `api.get_playgrounds_bbox(min_lon, min_lat, max_lon, max_lat)` — same response shape as `get_playgrounds` but scoped to bbox intersection; reuses the `playground_stats` materialised view
- [ ] 1.4 Extend `api.get_meta` to include `{complete, partial, missing}` alongside the existing `playground_count` (sums over `playground_stats`)
- [ ] 1.5 Add `COMMENT ON FUNCTION api.get_playgrounds(bigint) IS 'DEPRECATED: use get_playgrounds_bbox. Scheduled for removal in the release after next.'`
- [ ] 1.6 Add a computed `grid_cell` column or expression to `playground_stats` (or inline in the cluster function) — whichever benchmarks faster on a Germany-sized dataset
- [ ] 1.7 Add `import_version` (or `data_version`) bump timestamp, written on successful import and surfaced via `get_meta`, for client-side cache-bust
- [ ] 1.8 Grant EXECUTE on all three new functions to `web_anon`
- [ ] 1.9 Update `dev/seed/seed.sql` so `make seed-load` exercises all three new RPCs with the 4-playground fixture

## 2. Client — API layer + fetchers

- [ ] 2.1 Add `fetchPlaygroundClusters(zoom, extentEPSG3857, baseUrl)`, `fetchPlaygroundCentroids(extentEPSG3857, baseUrl)`, `fetchPlaygroundsBbox(extentEPSG3857, baseUrl)` in `app/src/lib/api.js`
- [ ] 2.2 All three fetchers accept an `AbortSignal` so moveend handlers can cancel in-flight requests
- [ ] 2.3 Mark `fetchPlaygrounds` deprecated with a JSDoc `@deprecated` tag and a one-time console warning on first call
- [ ] 2.4 Extend `fetchMeta` typing to surface the new `{complete, partial, missing}` and `data_version` fields
- [ ] 2.5 Add `clusterMaxZoom` and `centroidMaxZoom` to `app/src/lib/config.js` (defaults 10 and 13); surface via `window.APP_CONFIG` and the nginx entrypoint

## 3. Client — zoom-tier orchestrator

- [ ] 3.1 Replace the `fetchPlaygrounds` call in `StandaloneApp.svelte:onMount` with a `moveend`-driven orchestrator that dispatches to the right fetcher based on `view.getZoom()`
- [ ] 3.2 Orchestrator debounces by 300 ms and uses `AbortController` to cancel any request superseded by a later moveend
- [ ] 3.3 Three layers are created up front: `clusterLayer`, `centroidLayer`, `polygonLayer`; visibility is toggled on zoom transition, not recreated
- [ ] 3.4 `clusterLayer` source is populated from `get_playground_clusters` with no client-side clustering (server buckets are authoritative at that zoom)
- [ ] 3.5 `centroidLayer` wraps a Supercluster instance fed from `get_playground_centroids`; on zoom change within the centroid tier, re-project Supercluster output; on pan, refetch centroids for the new bbox and reindex
- [ ] 3.6 `polygonLayer` continues to use the existing `playgroundStyleFn`; `playgroundSourceStore` is published only when this layer is active
- [ ] 3.7 Gracefully fall back: if a tier's RPC 404s (backend upgrade in progress), the orchestrator tries the next tier up and logs a one-time warning

## 4. Client — cluster renderer + Supercluster integration

- [ ] 4.1 Add `supercluster` to `app/package.json` dependencies; run `npm install` in `app/`
- [ ] 4.2 Create `app/src/components/ClusterLayer.svelte` — encapsulates a Supercluster instance, the OL source/layer pair, and the canvas renderer
- [ ] 4.3 Implement `stackedRingRenderer` in `app/src/lib/clusterStyle.js` — canvas 2D draw of the ring with complete/partial/missing segments + count; cached by `(count_bucket, r_frac, p_frac, m_frac)` with a WeakMap-keyed bitmap pool
- [ ] 4.4 Single-child clusters render as a single completeness-colour dot (no ring, matches polygon colour at higher zoom)
- [ ] 4.5 Cluster click zooms to the cluster's bounding extent with `view.fit`, same padding behaviour as the existing polygon select
- [ ] 4.6 Filter badge: below the count, a small pill "N match" rendered in the same canvas when `$filterStore` has any active filter; only on the centroid tier and above (not at zoom ≤ 10)
- [ ] 4.7 Hover on a cluster shows a small tooltip (reuse `HoverPreview`) listing aggregate counts

## 5. Client — selection + deeplink adaptation

- [ ] 5.1 `AppShell.svelte::tryRestoreFromHash` falls back to a hydration fetch (`get_playgrounds_bbox` centred on the osm_id's last-known position from `get_nearest_playgrounds`) when the polygon layer is empty
- [ ] 5.2 `NearbyPlaygrounds` fallback (distance scan of `playgroundSource.getFeatures()`) is removed — it's been a soft fallback since Overpass mode; the PostgREST `get_nearest_playgrounds` path is always available now
- [ ] 5.3 Cluster-click does not set a hash (it's a navigation gesture, not a selection)

## 6. Docs

- [ ] 6.1 Create `docs/reference/api.md` documenting the three tiered RPCs with request/response examples and zoom thresholds
- [ ] 6.2 Update `CLAUDE.md` "Key frontend architecture" section to describe the three layers and the moveend orchestrator; keep the old description under a `<!-- legacy -->` comment until archive
- [ ] 6.3 Update `docs/reference/api.md` cross-link from the main federation / architecture doc
- [ ] 6.4 Add `Reference → API` to `mkdocs.yml` nav

## 7. Verification

- [ ] 7.1 Unit: `stackedRingRenderer` bitmap cache keys round-trip for a sample of count/ratio tuples
- [ ] 7.2 Playwright: zoom-in from 6 to 18, assert cluster → centroid → polygon transitions happen at the configured thresholds and no visible gap in count
- [ ] 7.3 Playwright: pan at zoom 12 across the Fulda seed region, assert centroid layer refetches and count matches expected
- [ ] 7.4 Manual: `make docker-build && make up` on the 4-playground seed; click a cluster at zoom 10, verify fit-to-extent works
- [ ] 7.5 Manual: performance sanity on a Berlin-sized extract — `npm run build` + serve, confirm first-paint map is interactive in under 2 seconds
- [ ] 7.6 Legacy: `fetchPlaygrounds` calls log the deprecation warning exactly once per session
- [ ] 7.7 `openspec validate add-tiered-playground-delivery` passes before archive
