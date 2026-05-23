# Upgrading spieli

This guide explains how to update a running spieli deployment to a newer release.

## Check the current version

```bash
# Read the OCI version label baked into the running image:
docker inspect spieli-app-1 --format '{{index .Config.Labels "org.opencontainers.image.version"}}'

# Or list all running images and their tags:
docker compose images
```

Check [GitHub Releases](https://github.com/mfuhrmann/spieli/releases) for the latest version and any breaking changes.

## Standard upgrade (same minor version)

For patch and minor version upgrades with no breaking changes:

```bash
cd /path/to/your/spieli-deployment

# Pull the latest images
docker compose pull

# Restart app and importer containers
docker compose --profile <mode> up -d app importer

# Re-apply api.sql — updates DB functions and the version reported by get_meta()
docker compose --profile <mode> run --rm -e API_ONLY=1 importer
```

Replace `<mode>` with your `DEPLOY_MODE` (`data-node`, `ui`, or `data-node-ui`).

!!! warning "Always restart the importer, not just the app"
    `docker compose up -d app` alone leaves the daemon importer running the old image. The daemon re-applies `api.sql` on its next scheduled reimport — using the old image, which reverts the version in `get_meta()` back to the previous release. Always include `importer` in the `up -d` call.

!!! note
    The `API_ONLY=1` step is required on every upgrade, not just when the release notes mention SQL changes. The version number visible in the Hub regions panel comes from the database (written by the importer), not the app image — skipping this step leaves the reported version stale.

!!! warning "If API_ONLY fails mid-run"
    `API_ONLY=1` drops and recreates the `playground_stats` materialised view. If it crashes partway through, the view is gone and PostgREST will log errors like `relation "public.playground_stats" does not exist`. Recovery: run a **full re-import** (see below) — this recreates everything from scratch.

## When to run a full re-import

A full re-import (without `API_ONLY`) is needed when:

- The release notes say "re-import after upgrading"
- A new OSM tag type was added to `processing/lua/osm_import.lua` — the new columns won't exist in existing data until a fresh import

```bash
docker compose --profile <mode> run --rm importer
```

A full re-import also re-applies `api.sql`, so the separate `API_ONLY=1` step is not needed when you do a full re-import.

## Upgrading the Compose file

When `compose.yml` itself changes (new services, new volume mounts, etc.):

```bash
# Download the updated file directly:
curl -O https://raw.githubusercontent.com/mfuhrmann/spieli/main/compose.yml

# Then recreate:
docker compose --profile <mode> down
docker compose --profile <mode> up -d
```

## Upgrading with Watchtower (auto-update profile)

When the `auto-update` profile is active, Watchtower pulls new images and restarts containers automatically — no manual `docker compose pull` needed.

The importer applies `api.sql` on every daemon-mode startup, so schema changes from a new image take effect within seconds of a Watchtower-triggered restart — even when the full PBF re-import is deferred by the grace-period check. No manual intervention is needed for schema-only upgrades.

## Hub upgrades

Upgrade each data-node first, verify it works, then upgrade the Hub UI. The Hub is backwards-compatible with older data-nodes (it falls back to the legacy `get_playgrounds` RPC if the tiered RPCs return 404), but an older Hub is not guaranteed to understand new data-node response fields.

## Downgrading

Downgrading is supported only within the same minor version. Images are tagged `:X.Y.Z` and `:X.Y`, so:

```bash
# Pin to a specific version by editing compose.yml:
# Change ghcr.io/mfuhrmann/spieli:latest to ghcr.io/mfuhrmann/spieli:0.4.0
docker compose pull
docker compose --profile <mode> up -d
```

The database schema is **not** automatically rolled back on a downgrade. If the new version added new columns or functions, the older app may ignore them safely, but this is not tested. When in doubt, re-import from scratch.

## See also

- [Configuration reference](configuration.md) — check for new or changed variables before upgrading
- [Troubleshooting](troubleshooting.md) — common post-upgrade issues
- [RELEASING.md](https://github.com/mfuhrmann/spieli/blob/main/RELEASING.md) — how releases are cut (maintainer reference)
