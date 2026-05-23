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

!!! danger "Do not delete volumes during a standard upgrade"
    A standard upgrade does **not** require deleting Docker volumes. Deleting `pgdata` erases all imported playground data and forces a full re-import (several hours for large states). If you already deleted `pgdata`, see [If you deleted the database volume](#if-you-deleted-the-database-volume) below.

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

### Verify the upgrade

After the `API_ONLY=1` step, confirm the new version is live and playground data is intact:

```bash
curl -sf http://localhost:<port>/api/rpc/get_meta | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('version:', d['version'], ' playgrounds:', d['playground_count'])"
```

Both `version` and `playground_count` should be non-zero. If `playground_count` is 0, a full re-import is needed (see below).

## When to run a full re-import

A full re-import (without `API_ONLY`) is needed when:

- The release notes say "re-import after upgrading"
- A new OSM tag type was added to `processing/lua/osm_import.lua` — the new columns won't exist in existing data until a fresh import

```bash
docker compose --profile <mode> run --rm importer
```

A full re-import also re-applies `api.sql`, so the separate `API_ONLY=1` step is not needed when you do a full re-import.

## If you deleted the database volume

If you deleted the `pgdata` volume (e.g. `docker compose down -v` or `docker volume rm <stack>_pgdata`), all imported data is gone and you need a full re-import. Before running it:

1. **Check whether the PBF cache volume also survived.** The importer stores downloaded and pre-filtered PBF files in a separate named volume (`<stack>_pbf_cache`). This volume is not removed by `docker compose down -v` if it was created outside the current Compose project.

    ```bash
    docker volume ls | grep pbf_cache
    ```

2. **If the cache volume exists, clear it.** A previously interrupted import may have left a corrupt or empty filtered PBF in the cache. The importer checks file timestamps but not content — a corrupt cache causes a full re-import to process 0 objects and silently leave the database empty.

    ```bash
    # Replace <stack> with your stack name (e.g. spieli-hessen)
    docker volume rm <stack>_pbf_cache
    ```

    Alternatively, force a cache bypass by deleting only the filtered files:

    ```bash
    docker run --rm -v <stack>_pbf_cache:/data alpine \
      sh -c 'rm -f /data/*_<RELATION_ID>.pbf /data/*_<RELATION_ID>_tags.pbf'
    ```

3. **Run the full re-import** (downloads the PBF fresh if the cache was cleared):

    ```bash
    docker compose --profile <mode> run --rm importer
    ```

4. **Verify** with `get_meta` as shown in the standard upgrade section above.

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
