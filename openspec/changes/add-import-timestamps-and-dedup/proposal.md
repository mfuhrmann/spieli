## Why

In hub mode, backends can cover overlapping regions (e.g. Fulda inside Hessen) — an explicitly supported configuration. This causes the same playground to appear twice in the VectorSource, making click behaviour undefined and deep-link restore ambiguous. The symptom is already logged (`[deeplink] osm_id X matched 2 backends`), but no fix is in place. Resolving it requires each backend to expose OSM data freshness so the hub can make a principled dedup decision.

## What Changes

- **Importer**: records two timestamps per successful run — `imported_at` (wall-clock of the run) and `osm_data_age` (the OSM extract's own replication timestamp, read via `osmium fileinfo --json`)
- **DB schema**: new `meta` singleton table in `db/init.sql` to persist both timestamps across container restarts
- **`get_meta()` RPC**: extended to return `imported_at` and `osm_data_age` alongside existing fields
- **`registry.js`**: deduplicates features by `osm_id` at VectorSource insertion time, keeping the feature whose backend reports the newer `osm_data_age`; also tags `relation_id` onto every feature as `_relationId`
- **InstancePanel**: surfaces `imported_at` and `osm_data_age` per backend so operators can spot stale data without tailing logs

## Capabilities

### New Capabilities

- `import-timestamps`: Importer writes `imported_at` and `osm_data_age` to the `meta` table after each successful run; `get_meta()` exposes both fields
- `hub-feature-dedup`: Hub deduplicates playground features by `osm_id` across backends at VectorSource insertion time, using `osm_data_age` to pick the fresher source

### Modified Capabilities

<!-- none — no existing spec-level requirements change -->

## Impact

- **`importer/Dockerfile`**: adds `osmium-tool` if #208 has not yet landed (no-op if already present)
- **`db/init.sql`**: new `meta` table (singleton, `ON CONFLICT DO UPDATE`)
- **`importer/import.sh`**: new step at end of run — `osmium fileinfo --json`, timestamp extraction, DB upsert
- **`importer/api.sql`**: `get_meta()` function extended with two new fields
- **`app/src/registry.js`**: dedup logic added to `loadBackend()`; `_relationId` property added to features
- **`app/src/components/InstancePanel.svelte`**: new timestamp display rows
- **No new compose services, no API endpoint changes, no frontend routing changes**
