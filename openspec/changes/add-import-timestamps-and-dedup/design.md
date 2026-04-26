## Context

The hub fetches playgrounds from every backend in `registry.json` and merges them into a single VectorSource. Backends can legitimately cover overlapping regions — a Hessen-wide backend and a Fulda-specific backend coexisting is a documented, supported topology, not an edge case. When both are present, `loadBackend()` adds features from each, resulting in duplicate polygons for playgrounds that fall inside Fulda. OpenLayers picks the topmost feature on click; the deep-link restore path already detects and logs the collision (`[deeplink] osm_id X matched 2 backends`) but takes no action.

Resolving the collision requires a freshness signal on the backend side. Currently `get_meta()` returns no timestamps — the hub has no way to decide whose copy of a playground is more authoritative.

## Goals / Non-Goals

**Goals:**
- Expose two meaningful timestamps per backend via `get_meta()`: operator-run time (`imported_at`) and OSM data age (`osm_data_age`)
- Eliminate duplicate features in the hub VectorSource by deduping on `osm_id`, keeping the copy with the newer `osm_data_age`
- Surface both timestamps in InstancePanel so operators can observe data staleness without tailing logs
- Tag `relation_id` onto features for debuggability and future routing logic

**Non-Goals:**
- Dedup in standalone mode (only one backend, no collision possible)
- Retroactively correcting stale data already in running backends
- Bbox-overlap warning in InstancePanel (tracked separately in #251)
- Changing the dedup strategy for `fetchNearestAcrossBackends` (it already uses the same `osm_data_age` logic)

## Decisions

### D1: Two timestamps, not one

A single `imported_at` timestamp misleads when a backend re-imports from a cached PBF. The operator's timestamp looks fresh while the OSM data is weeks old. `osm_data_age` (the extract's own `osmosis_replication_timestamp`, read via `osmium fileinfo --json`) is the authoritative freshness signal for dedup. `imported_at` is retained because it's a distinct and useful operational signal — operators need to know both "when did the import run?" and "how old is the data?".

**Alternative considered:** Expose only `osm_data_age`. Rejected: operators would lose visibility into import cadence, which matters for diagnosing cron failures.

### D2: Dedup at VectorSource insertion, not at fetch time

Dedup happens in `registry.js` `loadBackend()`, at the point features are added to the VectorSource, not earlier. This keeps the fetch layer simple and stateless. `fetchNearestAcrossBackends` already performs a similar `osm_id`-keyed merge; this change applies the same logic to the main playground load path.

**Alternative considered:** Dedup server-side via a hub-level aggregator. Rejected: the hub has no server tier (static files + registry), and introducing one for dedup alone is disproportionate.

### D3: Newer `osm_data_age` wins, ties go to first-loaded backend

When two backends report the same `osm_data_age` for a given `osm_id` (e.g. both imported from the same weekly Geofabrik release), the feature already in the VectorSource is kept. This avoids unnecessary churn and matches the expected topology where the more-specific backend (Fulda) loads after the broader one (Hessen) — the Hessen copy lands first and is only displaced if the Fulda copy is genuinely fresher.

### D4: `osmium fileinfo --json`, not `osmium fileinfo` text parsing

The JSON output is stable across osmium versions; the text output format has changed between releases. `jq` is already present in the image after #208 lands. If #208 hasn't landed, osmium-tool and jq must be added here independently.

### D5: Singleton `meta` table, not a run-history log

Only the latest timestamps are needed by the hub. A singleton `ON CONFLICT DO UPDATE` row is simpler than a log table and avoids unbounded growth. If a run-history audit log is ever needed, it is a separate concern.

## Risks / Trade-offs

- **`osmium fileinfo` adds ~1s to import run** → negligible compared to the osm2pgsql step; not a concern
- **Geofabrik extracts without `osmosis_replication_timestamp`** → osmium returns `null`; the importer SHALL treat a null timestamp as "unknown" and store `NULL` in the DB; `get_meta()` returns `null`; the dedup logic falls back to keeping the first-loaded feature
- **Dedup removes a feature the user clicked moments before the second backend loads** → backends load sequentially in `registry.js`; the VectorSource fires a `change` event; OL re-renders; the user loses the selection if they clicked the now-removed duplicate. Acceptable: this is a transient state during initial hub load and affects only overlapping backends, which are not the common case
- **`_relationId` property name collides with a future OSM property** → prefixed with `_` to signal internal use; OSM tag names do not use leading underscores

## Migration Plan

1. Add `meta` table to `db/init.sql` (new table; no existing data to migrate)
2. Update `import.sh` to write timestamps at end of run (idempotent; old runs simply leave the table empty)
3. Deploy updated importer image — first `make import` after deploy populates the table
4. Deploy updated app image — `get_meta()` returns the new fields; InstancePanel renders them; dedup logic activates
5. Existing deployments with no `meta` table: PostgREST returns a 404 on `get_meta` until the importer image is updated and a run completes. Hub degrades gracefully — missing fields are treated as `null`

No rollback complexity. Removing the `meta` table and reverting `import.sh` restores the previous state. Frontend gracefully handles `null` timestamps.

## Open Questions

- Should `osm_data_age` be displayed in InstancePanel as a human-readable relative time (e.g. "3 days ago") or an ISO timestamp? Leaning toward relative for operator UX; ISO available on hover.
- Should the dedup log message (`[hub] dedup: keeping backend A over B for osm_id X`) be emitted at `debug` or `info` level? Leaning `debug` — it fires for every collision on every load, which would be noisy at `info` in a large hub.
