# API Reference

PostgREST exposes the `api` schema as JSON-RPC endpoints under `/api/rpc/`. This page documents the playground-delivery RPCs that drive the standalone client's two-tier rendering. Equipment, tree, POI and nearest-playground RPCs are not yet documented here — see `importer/api.sql` for their signatures.

## Two-tier client contract

The standalone client renders playgrounds through two zoom-scoped layers:

| Zoom | Tier | RPC |
|---|---|---|
| ≤ `clusterMaxZoom` (default 13) | cluster | `get_playground_clusters(z, bbox)` |
| > `clusterMaxZoom` | polygon | `get_playgrounds_bbox(bbox)` |

Single-feature hydration on demand:

| Use case | RPC |
|---|---|
| Deeplink restore at low zoom; nearby-list selection of a not-yet-loaded playground | `get_playground(osm_id)` |

A third bbox-scoped RPC, `get_playground_centroids(bbox)`, ships server-side for future use (federated re-clustering across backends, lighter mid-zoom payloads) but is not consumed by the standalone client in this release.

## `get_playground_clusters(z, bbox)`

Pre-aggregated cluster buckets for the cluster tier. Each bucket counts playgrounds whose centroid snaps to a zoom-appropriate grid cell, broken down by completeness and access.

**Parameters**

| Name | Type | Notes |
|---|---|---|
| `z` | `int` | Zoom level — drives cell size via a hardcoded table (10 Mm at z=0, halving each level down to ~1.2 km at z=13) |
| `min_lon`, `min_lat`, `max_lon`, `max_lat` | `float8` | WGS84 bounding box |

**Response** — JSON array of bucket objects:

```json
[
  {
    "lon":         9.7140,
    "lat":         50.5489,
    "count":       2,
    "complete":    1,
    "partial":     0,
    "missing":     1,
    "restricted":  0
  }
]
```

**Invariant**: `count = complete + partial + missing + restricted` for every bucket. The three completeness counts include only public playgrounds; access-restricted playgrounds are pulled out into `restricted` so the client can render them as a hatched gray segment.

**Bucket centre**: emitted at the snapped grid corner (lon/lat). The client's stacked-ring renderer draws there directly; visual artefacts at cell boundaries are sub-perceptual at the cluster tier's zoom range.

**Example**

```bash
curl 'https://example.com/api/rpc/get_playground_clusters?z=12&min_lon=9&min_lat=50&max_lon=10&max_lat=51'
```

## `get_playgrounds_bbox(bbox)`

Polygon-tier RPC. Returns the same `FeatureCollection` shape as the legacy region-scoped `get_playgrounds(relation_id)`, but restricted to playgrounds whose geometry intersects the bbox (so polygons straddling the viewport edge are returned in full).

**Parameters**

| Name | Type | Notes |
|---|---|---|
| `min_lon`, `min_lat`, `max_lon`, `max_lat` | `float8` | WGS84 bounding box |

**Response** — GeoJSON `FeatureCollection`. Each feature's `properties` include `osm_id`, `osm_type` (`R` or `W`), `name`, `leisure`, `operator`, `access`, `surface`, `area`, the playground-stats counts (`tree_count`, `bench_count`, etc.), and the per-equipment booleans (`is_water`, `for_baby`, `for_toddler`, `for_wheelchair`, `has_soccer`, `has_basketball`). The original tag hstore is spread on top so any OSM tag is reachable.

> Note: the polygon RPC names the water flag `is_water` (legacy from the materialised-view column). The centroid RPC's `filter_attrs` payload (below) renames it to `has_water` for consistency with the other client-side filter keys (`for_baby`, `has_soccer`, …). Same boolean, different key.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [...] },
      "properties": {
        "osm_id":             37808214,
        "osm_type":           "W",
        "name":               "Grezzbachpark",
        "leisure":            "playground",
        "operator":           "...",
        "access":             "yes",
        "surface":            "...",
        "area":               2480,
        "tree_count":         12,
        "bench_count":        4,
        "has_soccer":         true,
        "is_water":           true,
        "for_wheelchair":     false
      }
    }
  ]
}
```

## `get_playground(osm_id)`

Single-feature lookup used by the deeplink-hydration and nearby-list fallback paths when the polygon source isn't populated for the current viewport (cluster tier on first load).

**Parameters**

| Name | Type | Notes |
|---|---|---|
| `osm_id` | `bigint` | Magnitude only; the function tries both relation (`-osm_id`) and way (`+osm_id`) rows and prefers a relation row when both exist |

**Response** — A single GeoJSON `Feature` with the same `properties` shape as one element of `get_playgrounds_bbox.features[*]`, or JSON `null` when no playground matches.

**Frontend convention**: callers throw on non-2xx responses and treat a `null` body as a legitimate "not found", so server errors and missing playgrounds can be acted on differently.

## `get_playground_centroids(bbox)` *(server-only in P1)*

Returns lightweight per-playground rows for a bbox — `osm_id`, lon/lat, completeness, and a nested `filter_attrs` object (`has_water`, `for_baby`, `for_toddler`, `for_wheelchair`, `has_soccer`, `has_basketball`, `access_restricted`). No polygon geometry, no tag hstore.

```json
[
  {
    "osm_id":       37808214,
    "lon":          9.7096,
    "lat":          50.5438,
    "completeness": "complete",
    "filter_attrs": {
      "has_water":         true,
      "for_baby":          false,
      "for_toddler":       false,
      "for_wheelchair":    false,
      "has_soccer":        true,
      "has_basketball":    false,
      "access_restricted": false
    }
  }
]
```

The standalone client doesn't consume this RPC in P1 — the server-bucketed cluster tier covers zoom ≤ 13 directly. The RPC ships now so federated hub clustering (`add-federated-playground-clustering`) and any future "centroid + Supercluster" tier can use it without a schema change.

## `get_meta()` — extended

Existing federation-discovery RPC, extended with completeness counts.

**Response shape** (changed in this release):

```json
{
  "relation_id":      62700,
  "name":             "Landkreis Fulda",
  "playground_count": 4,
  "complete":         2,
  "partial":          1,
  "missing":          1,
  "bbox":             [9.43, 50.36, 10.08, 50.81]
}
```

**Invariant**: `playground_count = complete + partial + missing` (`get_meta` does *not* split out access-restricted; they're rolled into the completeness counts here, unlike `get_playground_clusters`). Hub uses the three counts to render a country-level macro view — see `add-federated-playground-clustering`.

A `data_version` cache-bust timestamp was originally scoped here but moved to `add-federation-health-exposition` (which introduces `api.import_status(last_import_at, ...)` as the better-scoped home).

## Deprecated: `get_playgrounds(relation_id)`

The pre-tiered region-scoped RPC stays available for one release for compatibility with Playwright fixtures and external consumers. Marked DEPRECATED via SQL `COMMENT`; the client `fetchPlaygrounds` logs a one-time console warning. It will be removed in the release after next.

Migration: replace any caller with `fetchPlaygroundsBbox(extent, baseUrl)` driven by viewport extent.

## See also

- [Federation](federation.md) — Hub-mode discovery, `registry.json`, federation endpoints overview.
- [Architecture](architecture.md) — DEPLOY_MODE × APP_MODE matrix, where `apiBaseUrl` is set.
- `importer/api.sql` — authoritative SQL source for every RPC.
- `app/src/lib/api.js` — all client fetchers (each with JSDoc).
- `app/src/lib/tieredOrchestrator.js` — moveend-driven tier picker that calls these RPCs.
