## 1. Database schema

- [ ] 1.1 Add `importing BOOLEAN NOT NULL DEFAULT false` column to `api.import_status` in `importer/api.sql` (use `ADD COLUMN IF NOT EXISTS`)
- [ ] 1.2 Add `'importing', importing` to the `json_build_object` in `get_meta` in `importer/api.sql`
- [ ] 1.3 Run `make db-apply` and verify `curl .../rpc/get_meta | jq .importing` returns `false`

## 2. Importer script

- [ ] 2.1 Add a POSIX EXIT trap in `importer/import.sh` that runs `psql … UPDATE api.import_status SET importing = false WHERE id = 1`
- [ ] 2.2 Insert a `psql … UPDATE api.import_status SET importing = true WHERE id = 1` call immediately before the `osm2pgsql` invocation
- [ ] 2.3 Confirm the trap fires on both clean exit and simulated error (`kill -TERM`)

## 3. Hub poll pipeline

- [ ] 3.1 Update `oci/hub/poll-federation.sh` to extract `importing` from `get_meta` and include it in the per-backend entry written to `/federation-status.json` (default to `false` if field absent)
- [ ] 3.2 Verify `/federation-status.json` includes `"importing": false` for all backends during normal operation

## 4. Hub drawer UI

- [ ] 4.1 In the hub instances drawer component, check each backend's `importing` field from `/federation-status.json`
- [ ] 4.2 Render an "updating" badge (distinct from the error/down state) next to the backend name when `importing: true`
- [ ] 4.3 Confirm no "updating" badge appears when `importing` is `false` or absent

## 5. Tests

- [ ] 5.1 Add a Playwright test to `tests/hub-pill.spec.js` that stubs `get_meta` with `importing: true` for one backend and asserts the "updating" badge appears in the drawer
- [ ] 5.2 Add a scenario that stubs `importing: false` (or omits the field) and asserts no badge

## 6. Documentation

- [ ] 6.1 Update `docs/reference/api.md` — add `importing` to the `get_meta` response table
- [ ] 6.2 Add a note to `docs/ops/troubleshooting.md` explaining how to manually clear a stuck `importing=true` flag (`UPDATE api.import_status SET importing = false WHERE id = 1`)
