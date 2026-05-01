# Upgrading spieli

This guide explains how to update a running spieli deployment to a newer release.

## Check the current version

```bash
docker compose exec app cat /usr/share/nginx/html/config.js | grep version
# or look at the image tag:
docker compose ps
```

Check [GitHub Releases](https://github.com/mfuhrmann/spieli/releases) for the latest version and any breaking changes.

## Standard upgrade (same minor version)

For patch and minor version upgrades with no breaking changes:

```bash
cd /path/to/your/spieli-deployment

# Pull the latest images
docker compose -f compose.prod.yml pull

# Restart app container (zero-database-downtime)
docker compose -f compose.prod.yml --profile <mode> up -d app

# If the API SQL changed (check the release notes):
docker compose -f compose.prod.yml --profile <mode> run --rm importer
# or just apply the schema change without a full re-import:
make db-apply    # only if running from source clone
```

Replace `<mode>` with your `DEPLOY_MODE` (`data-node`, `ui`, or `data-node-ui`).

## When to run a full re-import

A full re-import (`docker compose run --rm importer`) is needed when:

- The release notes say "run `make db-apply` or re-import after upgrading"
- `importer/api.sql` changed in a way that requires rebuilding the `playground_stats` materialised view
- A new OSM tag type was added to `processing/lua/osm_import.lua` — the new columns won't exist in the existing data until a fresh import

A schema-only update (`make db-apply` / the `db-apply` step of the importer) is safe and fast (seconds) when only PostgREST functions changed, since it drops and recreates functions without touching the `planet_osm_*` tables.

## Applying SQL changes without a full re-import

If you are running from a source clone and only API functions changed:

```bash
make db-apply
```

This runs `envsubst < importer/api.sql | psql` against the running database and sends `NOTIFY pgrst, 'reload schema'` to PostgREST. The app continues to serve requests during the apply; PostgREST picks up the new schema within a second of the reload.

## Upgrading the Docker Compose file

When the `compose.prod.yml` itself changes (new services, new volume mounts, etc.):

```bash
# From a source clone:
git pull

# Or download the updated file directly:
curl -O https://raw.githubusercontent.com/mfuhrmann/spieli/main/compose.prod.yml

# Then recreate:
docker compose -f compose.prod.yml --profile <mode> down
docker compose -f compose.prod.yml --profile <mode> up -d
```

## Hub upgrades

Upgrade each data-node first, verify it works, then upgrade the Hub UI. The Hub is backwards-compatible with older data-nodes (it falls back to the legacy `get_playgrounds` RPC if the tiered RPCs return 404), but an older Hub is not guaranteed to understand new data-node response fields.

## Downgrading

Downgrading is supported only within the same minor version. Images are tagged `:X.Y.Z` and `:X.Y`, so:

```bash
# Pin to a specific version:
# Edit compose.prod.yml to use ghcr.io/mfuhrmann/spieli:0.4.0 instead of :latest
docker compose -f compose.prod.yml pull
docker compose -f compose.prod.yml --profile <mode> up -d
```

The database schema is **not** automatically rolled back on a downgrade. If the new version added new columns or functions, the older app may ignore them safely, but this is not tested. When in doubt, re-import from scratch.

## See also

- [Configuration reference](configuration.md) — check for new or changed variables before upgrading
- [Troubleshooting](troubleshooting.md) — common post-upgrade issues
- [RELEASING.md](https://github.com/mfuhrmann/spieli/blob/main/RELEASING.md) — how releases are cut (maintainer reference)
