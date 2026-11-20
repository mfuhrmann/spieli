# Federation

Multiple regional instances can be aggregated into a single global map using the **Hub mode** built into this codebase. The Hub is not a separate repository — it is the same app deployed with `APP_MODE=hub`.

```
APP_MODE=standalone   →  regional map (one city / Kreis / Bundesland)
APP_MODE=hub          →  aggregation map that fetches from all registered instances
```

This page is the technical reference: what the hub asks each data-node, and what its rings mean. For *why* spieli is federated, see [Federation: one map, many owners](../concepts/federation.md). To set a hub up, see [Federated Deployment](../ops/federated-deployment.md); to run one locally for development, see [Local Development → Hub mode](../contributing/local-dev.md#hub-mode).

## Federation endpoints

A data-node joins a hub by answering these RPCs under its public `/api/`, with CORS (`Access-Control-Allow-Origin: *`) so the hub's visitors can call them from the browser. Full request and response shapes: [API reference](api.md).

| Endpoint | The hub uses it for |
|---|---|
| `get_meta` | Registry discovery and the macro tier: name, playground count, bounding box, mapping-detail counts, data age, version, legal links |
| `get_playground_clusters` | Cluster tier (zoom ≤ `clusterMaxZoom`), with the active filters as parameters |
| `get_playgrounds_bbox` | Polygon tier (zoom > `clusterMaxZoom`) |
| `get_playground` | Restoring a playground deep link at any zoom |
| `get_equipment`, `get_trees`, `get_pois` | The panel of a selected playground |
| `get_standalone_equipment` | The *Sports pitches (outside playgrounds)* layer |
| `get_pitch` | Restoring a pitch deep link (`#<slug>/P<id>`); a backend without it answers 404 and is skipped |
| `get_legal` | The region's legal text, when it has `has_legal` but no legal URLs |
| `get_playgrounds` | **Deprecated** fallback: used once per backend and session if a tier RPC answers 404, with a one-time warning |

Backends older than the tiered API (before v0.4.9: no tier RPCs, no mapping-detail counts in `get_meta`) still join: the macro view shows them as "mapping detail unknown" (a flat violet ring), and the cluster tier skips them rather than fetching the whole region through the legacy RPC only to discard it.

## Registry

The Hub discovers instances from a `registry.json` file — see the [`registry.json` reference](registry-json.md) for schema, slug rules, and the derived aggregate behaviours (aggregated bounding box).

## Hub UI

The hub looks like a regional map, plus a region pill and list at the bottom left and one ring per region when zoomed out. What visitors see and what the ring labels mean: [User Guide → The all-regions map](../user-guide.md#the-all-regions-map). The ring states and the conditions behind them are listed under [Ring states](#ring-states) below; deep-link forms in the [`registry.json` reference](registry-json.md#deep-link-behaviour).

Two signals in the region list are meant for hub operators: a region whose boundary lies entirely inside another's, or contains it (from `region_geom` in `get_meta`), carries an "overlaps with …" badge — a partial overlap is not detected — and if `registry.json` itself cannot be loaded the pill reads "Registry unreachable".

## Ring states

At `zoom ≤ macroMaxZoom` the Hub renders one ring per registered backend, sized by `playground_count` and segmented by the `{complete, partial, missing}` counts from `get_meta`. Without an active filter no per-playground fetch is issued at this zoom — the rings come entirely from the cached registry metadata. With a filter active, the hub asks each in-scope backend for `get_playground_clusters` at `macroMaxZoom` and sums the buckets, so the ring counts reflect the filter.

Clicking a ring animates `view.fit` to the backend's bbox, which lands in the cluster or polygon tier and triggers a tier fetch scoped to that backend only.

With mapping detail off (the default, #924) a healthy backend is a plain emerald disc with its count; the segmented ring below appears only while mapping detail is on. "Unfiltered" likewise draws the disc instead of the segments; the other states look the same in both views.

Each ring has one of these visual states, driven by `federation-status.json` (see [Hub Status and Metrics](hub-status.md)), the cached `get_meta` response and, with a filter active, the filtered fan-out:

| State | Visual | Condition |
|---|---|---|
| **Healthy** | Mapping-detail segments (light green / dark green / slate, see [Colours](completeness.md#colours); flat violet when the backend predates the completeness counts) + count in centre; an emerald disc with mapping detail off | Backend reachable, data present |
| **Offline** | Dashed gray ring + last-known count + "offline" label | `federation-status.json` reports `up: false` |
| **Importing** | Solid blue ring + count + "updating" label | Backend reachable, osm2pgsql actively running |
| **Degraded** | Solid amber ring + "no data" label | Backend reachable, not importing, but playground count is zero |
| **Unfiltered** | Full ring + dashed grey halo + "unfiltered" label | A filter is active but this backend could not apply it (no bbox, or an older release), so its whole catalogue is shown |
| **No match** | Grey ring + "no match" label | Healthy backend, but the active filter excludes every playground |

Backends older than v0.4.9, whose `get_meta` lacks the mapping-detail counts, render as a flat violet ring (the whole count in the "unknown" slot, internally `restricted`) so the operator sees "mapping detail unknown" rather than a misleading all-zero healthy ring.

How the hub decides which backends to ask at which zoom, and how it merges their answers: [How the hub works internally](../contributing/hub-internals.md).

## See also

- [API reference](api.md) — request/response shapes for the tiered playground RPCs (`get_playground_clusters`, `get_playgrounds_bbox`, `get_playground`, `get_meta`).
- [Federated Deployment](../ops/federated-deployment.md) — step-by-step walkthrough for standing up one Hub + N data-nodes.
- [`registry.json` reference](registry-json.md) — registry schema, slug rules, derived aggregate behaviours.
- [Monitoring](../ops/monitoring.md) — `/federation-status.json` and `/metrics` exposition, uptime and Prometheus recipes.
