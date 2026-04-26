# Hub Data Overlap and Feature Dedup

In hub mode multiple regional backends are merged onto a single map. When two backends cover overlapping geographic areas — for example a state-wide Hessen backend and a city-specific Fulda backend that sits inside Hessen — the same OSM playground can appear in both `get_playgrounds` responses. This page explains how the hub detects and resolves those collisions.

## Why collisions happen

The hub fetches all playgrounds from every registered backend independently and merges them into a shared OpenLayers `VectorSource`. Two backends legitimately overlap when one covers a large administrative area and another covers a subdivision of it. This is a documented, supported deployment topology, not a misconfiguration.

Without dedup, each playground in the overlap zone would have two polygon features stacked on top of each other. OpenLayers picks the topmost feature on click, making click behaviour and deep-link restore non-deterministic.

## Dedup algorithm

Dedup runs in `registry.js` `loadBackend()` at VectorSource insertion time — not at fetch time and not server-side. The key is `osm_id` (the raw OpenStreetMap way or relation ID).

For each incoming feature:

1. **Look up existing feature** by `osm_id` in the VectorSource.
2. **If no existing feature** → add normally (no dedup needed).
3. **If existing feature found** → compare `osm_data_age` values:

| Incoming `osm_data_age` | Existing `osm_data_age` | Result |
|---|---|---|
| newer (later ISO timestamp) | any | Replace existing with incoming |
| older or equal | any non-null | Keep existing, discard incoming |
| `null` | any | Keep existing, discard incoming |
| non-null | `null` | Replace existing with incoming |
| `null` | `null` | Keep existing (first-loader wins) |

The tie-breaking rule — first-loader wins when both ages are null — is intentional. In the expected topology the broader backend (Hessen) loads before the narrower one (Fulda). When both import from the same Geofabrik weekly release the Hessen copy lands first and is not disturbed by the Fulda copy. Operators who want Fulda to always win should either ensure Fulda has a genuine replication timestamp or register Fulda before Hessen in `registry.json`.

When a replacement happens, a `[hub] dedup` line is logged at `console.debug` level:

```
[hub] dedup: replacing https://hessen.example.com/api with https://fulda.example.com/api for osm_id 12345 (fulda is fresher)
```

## Timestamp fields

Each backend exposes two timestamps via `get_meta()`:

| Field | Meaning | Null when |
|---|---|---|
| `imported_at` | Wall-clock time of the most recent import run | Never null after the first import |
| `osm_data_age` | `osmosis_replication_timestamp` from the PBF header | The source PBF has no replication metadata |

### Geofabrik extracts

Geofabrik `.osm.pbf` files (e.g. `hessen-latest.osm.pbf`) do **not** embed an `osmosis_replication_timestamp`. The importer logs a warning and stores `NULL` for `osm_data_age`. This is expected and harmless: the dedup algorithm degrades gracefully to first-loader wins, and the InstancePanel shows "unknown" for OSM data age.

Replication timestamps are present in PBFs produced by the daily/minutely Osmosis replication chain (e.g. planet diff files). If you control your PBF pipeline you can inject a timestamp to enable freshness-based dedup.

### InstancePanel display

Both timestamps appear in the InstancePanel backend drawer as relative times ("3 hours ago"). Hovering over a timestamp shows the full ISO 8601 string as a tooltip. When `osm_data_age` is null the field shows "unknown".

`imported_at` tells you when the operator last ran the importer. `osm_data_age` tells you how old the underlying OSM extract is. A backend can have a very recent `imported_at` but an old `osm_data_age` if the operator re-ran the importer without downloading a fresh PBF — this is why both fields are exposed.

## Operational guidance

**Standard two-backend setup (one large, one small region):**

Register the broader backend first in `registry.json`. It loads first and populates the VectorSource. The narrower backend loads second; its features that share `osm_id` with the broader backend are dropped (both have null `osm_data_age`). Non-overlapping features from the narrower backend are always added. This is the correct and expected behaviour.

**To have the narrower backend win for its coverage area:**

Ensure the narrower backend's PBF carries a replication timestamp (i.e. is newer than the broader backend's PBF). When `osm_data_age` differs the fresher backend always wins, regardless of load order.

**Diagnosing a missing-playground report:**

Check the browser console for `[hub] dedup:` lines. If a playground that should appear from backend B is being suppressed by backend A, check whether A's `osm_data_age` is newer or null and B's is null. The InstancePanel timestamps help here.

## See also

- [`registry.json` reference](registry-json.md) — full registry schema, slug rules, and aggregated bounding-box behaviour.
- [Federation](federation.md) — hub setup, local development topology, and federation endpoints.
- [API reference](api.md) — `get_meta()` response shape including `imported_at` and `osm_data_age`.
