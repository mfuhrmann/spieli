## Why

The cluster-tier ring carries a separate `restricted` (access-restricted) segment rendered as light-gray hatching. In practice that segment is dominated by a three-valued-logic bug, not by genuinely private playgrounds: `access_restricted = (pl.access IN ('private','customers'))` evaluates to **NULL** for every untagged playground (≈45% of Fulda's data — 210 of 463). Those rows then fall out of *all four* aggregation buckets (`NOT NULL` and `NULL` both fail the `CASE WHEN`), so a cell of untagged playgrounds renders as a fully gray-hatched ring with no completeness information, silently breaking the documented `count = complete + partial + missing + restricted` invariant. The grey clutters the map and hides the data quality of nearly half the playgrounds.

## What Changes

- **BREAKING** (API response shape): `get_playground_clusters` drops the `restricted` field from each bucket object. The invariant becomes **`count = complete + partial + missing`** — every playground is counted into its completeness bucket by `completeness` alone (which is never NULL; it defaults to `'missing'`).
- The `NOT access_restricted` guard is removed from the three completeness `SUM`s and the separate `restricted` `SUM` is deleted, so the untagged-playground NULL bug disappears: those rows now render by their true completeness (red/yellow).
- The cluster ring renderer becomes a **three-segment** ring (complete / partial / missing). All grey/hatch rendering is removed: the hatch pattern, the restricted arc, the gray single-child dot, and the `restricted` term in the bitmap-cache key.
- The hub cluster-bucket merge stops summing a `restricted` field.
- The `filter_private` toggle is **kept**, but its identical NULL bug is fixed so `access_restricted` defaults to `false` for untagged playgrounds; the `access_restricted` column is retained for filtering only.

### Out of scope (explicitly unchanged)

- The **macro tier** (`macroRingStyle.js` / `MacroView.svelte`) keeps its own gray segment — there it signals offline / unknown-completeness *backends* (a hub-health indicator), a separate concern with its own colour table.
- The polygon tier's per-playground `access_restricted` filter attribute is unchanged (it feeds `filter_private`).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `tiered-playground-delivery`: the cluster RPC response no longer includes `restricted`; the bucket invariant changes to `count = complete + partial + missing`; deterministic-output and rendering scenarios drop the restricted segment; the cluster ring renders three segments with no hatched "not public" arc.
- `federated-playground-clustering`: the hub merge of per-backend cluster buckets no longer aggregates a `restricted` field. The macro-view restricted scenarios (offline / unknown-completeness backends) are unaffected.

## Impact

- **`importer/api.sql`** — `get_playground_clusters` aggregation + JSON output; `access_restricted` definition (NULL→false). `requires-schema-update`: operators run `API_ONLY=1` after upgrading (no full re-import).
- **`app/src/lib/clusterStyle.js`** — remove `HATCH_*`, `makeHatchPattern()`, `RESTRICTED_DOT`, the restricted arc, and the `restricted` arg in `quantise()`/draw + cache key.
- **`app/src/lib/api.js`** — update the `fetchPlaygroundClusters` invariant docstring.
- **`app/src/lib/tieredOrchestrator.js`, `app/src/hub/hubOrchestrator.js`** — drop the now-dead `restricted` passthroughs.
- **`app/src/components/CompletenessLegend.svelte`** — remove any hatched "not public" swatch if present.
- **Verification** — fresh-volume import test (`make down && docker volume rm spieli_pgdata spieli_pgdata2 && make up`) and confirm `count = complete + partial + missing` holds for `get_playground_clusters`.
