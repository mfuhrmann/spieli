# Switching regions

This guide covers changing the geographic coverage of a running spieli instance — for example, switching from a Landkreis to a full Bundesland, or expanding to all of Germany.

The process requires a full database re-import. Plan for downtime proportional to the size of the new extract (see [Import duration](#import-duration)).

## 1. Find the new relation ID and PBF extract

**OSM relation ID** — search on [Nominatim](https://nominatim.openstreetmap.org). The relation ID appears in the URL: `openstreetmap.org/relation/51477` → ID is `51477`.

**PBF extract** — browse [download.geofabrik.de](https://download.geofabrik.de) for an extract that covers your target region. The extract only needs to *contain* your region — a country extract works fine for a single Bundesland.

Common extracts:

| Coverage | URL |
|---|---|
| Germany | `https://download.geofabrik.de/europe/germany-latest.osm.pbf` |
| Baden-Württemberg | `https://download.geofabrik.de/europe/germany/baden-wuerttemberg-latest.osm.pbf` |
| Bayern | `https://download.geofabrik.de/europe/germany/bayern-latest.osm.pbf` |
| Hessen | `https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf` |
| NRW | `https://download.geofabrik.de/europe/germany/nordrhein-westfalen-latest.osm.pbf` |

## 2. Update `.env`

Edit `~/spieli/.env` and change the two region-specific lines:

```env
OSM_RELATION_ID=51477
PBF_URL=https://download.geofabrik.de/europe/germany-latest.osm.pbf
```

## 3. Wipe the database and re-import

**Warning:** This permanently deletes all existing playground data. The import re-downloads the PBF and rebuilds the database from scratch.

```bash
cd ~/spieli

# Stop the stack
docker compose --profile data-node-ui down

# Delete the database and cached PBF
# (the prefix is the compose project name — the directory name unless COMPOSE_PROJECT_NAME is set;
#  `docker volume ls` shows the exact names)
docker volume rm spieli_pgdata spieli_pbf_cache

# Start the stack (initialises a fresh database)
docker compose --profile data-node-ui up -d
```

Then start the import, depending on how the stack runs:

- **With automatic updates** (daemon mode, `REIMPORT_INTERVAL_*` set in `.env`): nothing to do. On an empty database the daemon starts the import by itself. Running the importer by hand as well would start a second import alongside it. Follow it with `docker compose logs -f importer`.
- **Without automatic updates:** run it once:

    ```bash
    docker compose --profile data-node-ui run --rm importer
    ```

The app will return empty responses until the import finishes.

## Import duration

See [Sizing → Import duration](../reference/sizing.md#import-duration).

## After the import

The app picks up the new data automatically — no restart needed. Verify with:

```bash
curl -s https://yourdomain.example.com/api/rpc/get_meta | python3 -m json.tool
```

The `playground_count` and `bbox` fields should reflect the new region.
