## Why

When an OSM re-import is running, the backend's data is partially rebuilt — playgrounds may disappear or appear mid-import, making the map inconsistent. Hub operators and end-users currently have no visibility into this transient state; the hub drawer shows "healthy" even while a backend is actively replacing its dataset. Adding an `importing` flag to `get_meta` and surfacing it in the hub drawer gives users a clear "updating" signal instead of a confusing mid-import view.

## What Changes

- `api.import_status` gains a boolean column `importing` (default `false`)
- `importer/import.sh` sets `importing = true` before osm2pgsql runs and `false` on clean exit
- `get_meta` exposes the `importing` field
- `poll-federation.sh` carries the field through into `/federation-status.json`
- Hub drawer shows an "updating" badge next to the affected backend when `importing: true`
- A systemd timer (or cron) can be configured to run the importer in the early morning (Geofabrik dumps are available from ~04:00 UTC)

## Capabilities

### New Capabilities

- `import-in-progress-signal`: Importer marks itself as active in `api.import_status` before the disruptive osm2pgsql phase and clears the flag on success or failure; backends expose this via `get_meta`.

### Modified Capabilities

- `scheduled-importer`: Extend the existing importer spec to cover the `importing` flag lifecycle (set before osm2pgsql, cleared on finish).
- `federation-health-exposition`: Extend the hub's poll/status pipeline to carry `importing` through `/federation-status.json` and surface it in the hub drawer.

## Impact

- **`importer/api.sql`** — new `importing` column on `api.import_status`; `get_meta` adds the field
- **`importer/import.sh`** — two additional `psql` calls (set flag before, clear after)
- **`oci/hub/poll-federation.sh`** — pass `importing` through to status JSON
- **`app/src/hub/InstancePanel.svelte`** (or equivalent drawer component) — render "updating" badge when `importing: true`
- **No breaking changes** — `importing` is an additive field; existing clients that ignore it continue to work
