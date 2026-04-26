## 1. Database schema

- [ ] 1.1 Add `meta` singleton table to `db/init.sql` with `imported_at TIMESTAMPTZ` and `osm_data_age TIMESTAMPTZ`; enforce singleton with a `CHECK (id = 1)` constraint and `ON CONFLICT DO UPDATE`
- [ ] 1.2 Verify schema applies cleanly with `make db-apply` on a fresh DB

## 2. Importer — Dockerfile

- [ ] 2.1 Add `osmium-tool` to `importer/Dockerfile` if #208 has not yet landed (no-op if already present)

## 3. Importer — import.sh

- [ ] 3.1 After successful osm2pgsql, run `osmium fileinfo --json "$IMPORT_PBF"` and extract `osmosis_replication_timestamp` with `jq`
- [ ] 3.2 Handle null or missing `osmosis_replication_timestamp`: set `OSM_DATA_AGE` to empty, log a warning, continue
- [ ] 3.3 Handle `osmium fileinfo` failure (non-zero exit): set `OSM_DATA_AGE` to empty, log a warning, continue
- [ ] 3.4 Upsert both timestamps into `meta` via `psql`: `INSERT INTO api.meta (id, imported_at, osm_data_age) VALUES (1, now(), '<OSM_DATA_AGE>') ON CONFLICT (id) DO UPDATE SET imported_at = EXCLUDED.imported_at, osm_data_age = EXCLUDED.osm_data_age`
- [ ] 3.5 Confirm upsert is skipped (or a `NULL` is written) when `OSM_DATA_AGE` is empty

## 4. Database API — get_meta()

- [ ] 4.1 Extend `api.get_meta()` in `importer/api.sql` to `SELECT` and return `imported_at` and `osm_data_age` from `api.meta`
- [ ] 4.2 Confirm `GET /api/rpc/get_meta` returns both fields (null before first import, populated after)
- [ ] 4.3 Run `make db-apply` to apply changes to the running DB

## 5. Frontend — registry.js

- [ ] 5.1 In `loadBackend()`, read `osm_data_age` and `relation_id` from the `get_meta()` response and store per-backend
- [ ] 5.2 Tag `_relationId` onto every feature added by `loadBackend()`
- [ ] 5.3 Implement dedup: before adding a feature to the VectorSource, check if `osm_id` is already present; keep whichever backend has the newer `osm_data_age` (null treated as oldest)
- [ ] 5.4 Log a debug message on each dedup replacement: `[hub] dedup: replacing backend A with B for osm_id X (B is fresher)`

## 6. Frontend — InstancePanel

- [ ] 6.1 Pass `imported_at` and `osm_data_age` from `get_meta()` into the InstancePanel component
- [ ] 6.2 Display `imported_at` as a relative time (e.g. "3 hours ago") with ISO timestamp on hover
- [ ] 6.3 Display `osm_data_age` as a relative time with ISO timestamp on hover; show "unknown" when `null`

## 7. Verification

- [ ] 7.1 Run `make import` and confirm `api.meta` is populated with both timestamps after the run
- [ ] 7.2 Run `make import` a second time on the same PBF — confirm `imported_at` advances and `osm_data_age` is stable
- [ ] 7.3 In hub mode with a Hessen + Fulda backend topology, confirm each `osm_id` appears exactly once in the VectorSource
- [ ] 7.4 Simulate a stale Hessen backend (older `osm_data_age`) and a fresh Fulda backend — confirm Fulda's feature wins
- [ ] 7.5 Simulate a backend with `osm_data_age: null` — confirm it loses to any backend with a real timestamp
- [ ] 7.6 Confirm standalone mode is unaffected: no dedup logic runs, single-backend playground load works as before
- [ ] 7.7 Confirm InstancePanel shows both timestamps correctly and degrades gracefully when fields are null
