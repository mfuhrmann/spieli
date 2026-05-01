## Context

The spieli importer runs `osm2pgsql --slim --drop`, which drops and recreates the `planet_osm_*` tables in the `public` schema. During this phase (which can take several minutes on a real region PBF), the backend's playground data is partially absent or inconsistent. The `api` schema (including `api.import_status`) lives separately and remains fully queryable during the osm2pgsql run.

The hub polls each backend's `/api/rpc/get_meta` every 60 seconds via `poll-federation.sh` and writes `/federation-status.json`. The hub UI reads this file and renders per-backend status in the drawer. The plumbing exists; it just needs an `importing` flag to flow through it.

## Goals / Non-Goals

**Goals:**
- Surface an `importing: true` signal in `get_meta` while osm2pgsql is running
- Carry that flag through to `/federation-status.json` and the hub drawer
- Clear the flag unconditionally on importer exit (success or failure)
- Leave all existing clients unaffected (additive-only change)

**Non-Goals:**
- Progress reporting (percentage complete, ETA)
- Pausing hub requests or blocking user interactions during import
- Configuring the scheduled timer itself (covered by the existing `scheduled-importer` spec)
- Changing the import cadence or PBF source selection

## Decisions

### D1 — Column on `api.import_status`, not a separate table

The `importing` flag is a property of the same singleton that already holds `last_import_at`. Adding it as a column avoids a join, keeps `get_meta` a single-table read, and reuses the existing `ON CONFLICT (id) DO UPDATE` UPSERT pattern. No new table or schema migration strategy is needed — the column is added by `api.sql` which is re-applied on every `make db-apply` / import run anyway (idempotent DDL via `CREATE TABLE IF NOT EXISTS … ADD COLUMN IF NOT EXISTS`).

### D2 — Set flag with a bare `psql` call before osm2pgsql, clear it in an EXIT trap

`import.sh` already exports `PGPASSWORD` and has `set -e`. The flag must be cleared even when the script exits early (killed, network error, SQL error). Using a POSIX `trap 'psql … SET importing=false' EXIT` ensures the flag is cleared on any exit path, including `kill`. The flag is set to `true` immediately before the osm2pgsql invocation (not at script start) so the pre-flight validation and PBF download phases do not trigger the "updating" badge unnecessarily.

**Alternative considered**: clear the flag only on success (in a separate step after the schema apply). Rejected because a killed or crashed importer would leave `importing=true` indefinitely, misleading users.

### D3 — `get_meta` exposes `importing` as a JSON boolean

`get_meta` already builds a `json_build_object`; adding `'importing', importing` is a one-liner. No new RPC or schema change. The hub's existing `/api/rpc/get_meta` call picks it up transparently.

### D4 — Hub drawer shows a pill/badge, not an error state

`importing: true` is not an error — the backend is healthy but temporarily refreshing. The drawer already has `instance-badge` elements (e.g. for version). An "updating" badge (distinct colour from the error indicator) is the appropriate treatment. The hub UI must handle `importing` being absent (`undefined`) for backward-compatible operation against older backends.

### D5 — `poll-federation.sh` passes `importing` through to status JSON

The poll script already extracts fields from `get_meta` via `jq`. Adding `importing` to the extracted object requires a one-line `jq` change. The `/federation-status.json` schema gains an optional `importing` boolean per backend entry.

## Risks / Trade-offs

- **Race between poll and import start**: If the importer sets `importing=true` between two hub polls, the hub sees the "updating" state for up to 60 seconds after the import actually started. Acceptable — the signal is advisory, not transactional.
- **Stale `importing=true` if container is SIGKILL'd before the EXIT trap fires**: The trap fires on SIGTERM and normal exits; SIGKILL bypasses it. In practice, `docker compose run --rm` sends SIGTERM first. Operators can manually clear with `psql -c "UPDATE api.import_status SET importing=false WHERE id=1"`. This is documented in ops/troubleshooting.
- **Old backends without `importing` field**: Hub must treat a missing or null `importing` as `false`. `jq` default (`// false`) handles this.

## Migration Plan

1. Deploy updated `api.sql` via `make db-apply` (adds `importing` column, `get_meta` exposes it). No data loss; existing rows get `importing = false` from the column default.
2. Deploy updated `import.sh` (flag lifecycle). No restart required.
3. Deploy updated hub container image (updated `poll-federation.sh` + drawer badge). Hub immediately starts carrying `importing` in `/federation-status.json`.
4. Rollback: re-run `make db-apply` with the old `api.sql`; the column stays (harmless) but `get_meta` no longer emits it; hub silently treats absence as `false`.
