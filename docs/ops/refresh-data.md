# Refreshing OSM Data On Demand

Geofabrik publishes updated OSM extracts daily. The importer pulls the latest extract, filters it to your region, and loads it into the database. This page explains how to trigger that process right now, outside of any automated schedule.

For setting up automatic re-imports, see [Scheduled Import](scheduled-import.md).

## Before you start: know your setup

Check which import mode the installer configured. Run from your deployment directory (where `compose.yml` and `.env` live):

```bash
grep REIMPORT_INTERVAL .env
```

| Result | Mode |
|---|---|
| Both vars absent or empty | **One-shot** — importer runs once and exits |
| Both vars set (e.g. `MIN=2`, `MAX=10`) | **Daemon** — importer loops; different steps apply |

Check your `DEPLOY_MODE` too — every command below uses it as `<mode>`:

```bash
grep DEPLOY_MODE .env
```

Valid values: `data-node`, `data-node-ui`. (Hub-only deployments — `DEPLOY_MODE=ui` — have no database and no importer.)

## One-shot mode

Run the importer once from your deployment directory. It exits when done.

```bash
docker compose --profile <mode> run --rm importer
```

## Daemon mode

When `REIMPORT_INTERVAL_MIN_DAYS` and `REIMPORT_INTERVAL_MAX_DAYS` are set, the importer container runs in a loop. On startup it checks `last_import_at` in the database — if the last import was recent (within a randomly chosen interval), it sleeps until the next scheduled time rather than importing again.

This means **restarting the container does not force an immediate re-import** unless the data is already overdue. And the one-shot command above is wrong here: with the interval variables in `.env`, `run --rm importer` starts a **second daemon** next to the running one.

To force a re-import right now:

**Step 1 — Stop the running daemon**, so the import is the only writer:

```bash
docker compose --profile <mode> stop importer
```

**Step 2 — Run a one-shot import (interval vars unset inline):**

```bash
docker compose --profile <mode> run --rm \
  -e REIMPORT_INTERVAL_MIN_DAYS= \
  -e REIMPORT_INTERVAL_MAX_DAYS= \
  importer
```

Unsetting the vars inline overrides `.env` without editing the file. The container runs once and exits.

**Step 3 — Resume the daemon:**

```bash
docker compose --profile <mode> up -d importer
```

The daemon restarts, sees the fresh `last_import_at`, and sleeps for the next scheduled interval.

## After deleting the database

On an empty database (a deleted `pgdata` volume, `down -v`, a PostgreSQL major-version upgrade) the daemon imports right away when the stack starts; do not start a second import by hand. In one-shot mode, run the import once as above.

## Clearing the PBF cache

The importer keeps the downloaded extract and two derived files (the region cut and the tag-filtered extract) in the `pbf_cache` volume. It checks their timestamps, not their content, so a file left broken by an interrupted or OOM-killed run is reused and the import silently produces **0 playgrounds**. Delete the derived files, then run the import as above:

```bash
docker compose --profile <mode> run --rm importer \
  sh -c 'rm -f /data/*_${OSM_RELATION_ID}*.pbf*'
```

The single quotes matter: `OSM_RELATION_ID` is expanded inside the container, from `.env`. The source extract stays, so nothing is downloaded again unless Geofabrik has a newer one.

## Verify the import ran

```bash
curl -s http://localhost:8080/api/rpc/get_meta | python3 -m json.tool | grep last_import_at
```

Or from outside the host:

```bash
curl -s https://your-domain.example.com/api/rpc/get_meta | python3 -m json.tool | grep last_import_at
```

`last_import_at` is the timestamp of when the importer script ran. What the other timestamp means: [Scheduled Import → How fresh is the data?](scheduled-import.md#how-fresh-is-the-data)

## How long does it take?

See [Sizing → Import duration](../reference/sizing.md#import-duration).

## See also

- [Scheduled Import](scheduled-import.md) — set up automatic re-imports with daemon mode or a systemd timer
- [Monitoring](monitoring.md) — track import freshness via `federation-status.json` and Prometheus
- [Upgrading](upgrade.md) — re-importing after a spieli version upgrade
