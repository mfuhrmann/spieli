# Configuration Reference

All variables are set in `.env` (copy from `.env.example`). The installer generates this file interactively — you can edit it afterwards to change any setting.

## Variables

| Variable | Default | Mode | Description |
|---|---|---|---|
| `DEPLOY_MODE` | — | — | Deployment mode: `data-node`, `ui`, or `data-node-ui`. Written by the installer. |
| `APP_MODE` | `standalone` | both | App mode: `standalone` (regional map) or `hub` (aggregation map). `hub` requires `REGISTRY_URL` and must be paired with `DEPLOY_MODE=ui`. See [Federated Deployment](federated-deployment.md). |
| `OSM_RELATION_ID` | `62700` | data-node, data-node-ui | OSM relation ID of the region to display |
| `OSM_RELATION_ID2` | `454881` | dev only | OSM relation ID for the second local backend (`db2`); used by `make import2` / `make seed-load2` |
| `PBF_URL` | Hessen extract | data-node, data-node-ui | Geofabrik `.osm.pbf` download URL |
| `REGISTRY_URL` | `/registry.json` | hub | URL of the registry JSON listing backends. Default is same-origin; bind-mount or bake in a custom file. See [Federated Deployment](federated-deployment.md) and [`registry.json` reference](../reference/registry-json.md). |
| `API_BASE_URL` | `/api` | ui, data-node-ui | Base URL of the PostgREST API. Set to the remote URL for `ui` mode (e.g. `https://data.example.com/api`). |
| `REGION_PLAYGROUND_WIKI_URL` | Generic OSM wiki | ui, data-node-ui | Wiki page linked in the "Contribute" modal |
| `REGION_CHAT_URL` | *(hidden)* | ui, data-node-ui | Community chat link; leave empty to hide the button |
| `MAP_ZOOM` | `12` | ui, data-node-ui | Initial map zoom level |
| `MAP_MIN_ZOOM` | `10` | ui, data-node-ui | Minimum zoom level |
| `PARENT_ORIGIN` | *(own origin)* | data-node-ui | Allowed origin for `postMessage` events — set to the Hub's full origin when embedding in a Hub |
| `APP_PORT` | `8080` | ui, data-node-ui | Host port the app is exposed on |
| `POSTGRES_PASSWORD` | `change-me` | data-node, data-node-ui | Database password — **change in production** |
| `POI_RADIUS_M` | `5000` | ui, data-node-ui | Radius in metres for nearby POI search |
| `OSM2PGSQL_THREADS` | `4` | data-node, data-node-ui | CPU threads for the osm2pgsql data-loading step |
| `PG_MAX_PARALLEL_WORKERS` | `2` | data-node, data-node-ui | Total parallel worker processes available to PostgreSQL (set ≤ CPU count). Persisted via `ALTER SYSTEM` in `api.sql`. |
| `PG_MAX_PARALLEL_WORKERS_PER_GATHER` | `2` | data-node, data-node-ui | Parallel workers per query. Must be ≤ `PG_MAX_PARALLEL_WORKERS`. |
| `PG_MAX_PARALLEL_MAINTENANCE_WORKERS` | `2` | data-node, data-node-ui | Parallel workers for `CREATE INDEX` / `VACUUM`. Must be ≤ `PG_MAX_PARALLEL_WORKERS`. |
| `PG_MAINTENANCE_WORK_MEM` | `256MB` | data-node, data-node-ui | Memory per maintenance operation (index builds etc.). Total peak ≈ `value × (PG_MAX_PARALLEL_MAINTENANCE_WORKERS + 1)`. **Must include a unit suffix** (`kB`, `MB`, `GB`, `TB`); a bare integer is interpreted as kilobytes by PostgreSQL. |
| `PG_WORK_MEM` | `32MB` | data-node, data-node-ui | Memory per sort/hash operation inside parallel workers. Total peak per query ≈ `value × (PG_MAX_PARALLEL_WORKERS_PER_GATHER + 1) × hash/sort nodes`. **Must include a unit suffix** (`kB`, `MB`, `GB`, `TB`); a bare integer is interpreted as kilobytes by PostgreSQL. |

> **How `PG_*` values are applied.** `make db-apply` (and `make import`) runs
> `ALTER SYSTEM SET …` at the top of `api.sql`, then `SELECT pg_reload_conf()`.
> The values are persisted to `postgresql.auto.conf` inside the data volume
> and apply to every connection — including PostgREST — without restarting
> the database container. To re-tune, edit `.env` and run `make db-apply`.

### RAM sizing

Defaults are sized for a **2-core / 4 GB host** (peak ≈ 1.5 GB during the
heaviest single operation, `CREATE INDEX`). Recommended values per host
size:

| Host RAM / cores | `WORKERS` / `PER_GATHER` / `MAINT` | `MAINT_WORK_MEM` | `WORK_MEM` | Approx. peak |
|---|---|---|---|---|
| 4 GB / 2 core (default) | 2 / 2 / 2 | 256MB | 32MB | ~1.5 GB |
| 8 GB / 4–6 core         | 4 / 2 / 4 | 512MB | 64MB | ~3 GB |
| 16 GB / 8 core          | 8 / 4 / 4 | 1GB   | 128MB | ~6 GB |

The driver of the peak is `CREATE INDEX` parallelism (≈ `MAINT_WORK_MEM ×
(MAINT_WORKERS + 1)`) followed by the materialised view rebuild (≈
`WORK_MEM × (PER_GATHER + 1) × ~4 hash/sort nodes`). These run sequentially,
so the budget is the larger of the two plus baseline (~700 MB for
`shared_buffers` default + PostgREST pool + WAL + autovacuum).
| `OSM_BBOX` | *(auto)* | data-node, data-node-ui | Manual bounding box for the osmium pre-filter (`west,south,east,north`). Skips Nominatim lookup when set. |
| `OSM_BBOX_PADDING` | `0.15` | data-node, data-node-ui | Degrees of padding added to each side of the Nominatim bbox (≈ 15 km). |
| `OSM_PREFILTER_MIN_MB` | `20` | data-node, data-node-ui | Source PBF files smaller than this many MB skip the osmium pre-filter step. |
| `GEOSERVER_URL` | *(disabled)* | data-node, data-node-ui | Base URL of a GeoServer instance for the shadow WMS layer; leave empty to disable |
| `GEOSERVER_WORKSPACE` | `spieli` | data-node, data-node-ui | GeoServer workspace name — only used when `GEOSERVER_URL` is set |
| `HUB_POLL_INTERVAL` | `300` | hub | Seconds between Hub re-fetches of playground data from all registered instances. Bare integer, no unit suffix. See [Federated Deployment](federated-deployment.md). |

## Applying changes

After editing `.env`, restart the relevant containers. Replace `<mode>` with your `DEPLOY_MODE` value (`data-node`, `ui`, or `data-node-ui`):

```bash
# Restart app only (config changes)
docker compose --profile <mode> up -d app

# Full restart
docker compose --profile <mode> down
docker compose --profile <mode> up -d
```
