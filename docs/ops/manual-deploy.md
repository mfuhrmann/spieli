# Manual Deploy (from source)

Use this path if you want to build the images yourself or run from a local clone. For most deployments the [Quick Start](../getting-started/quick-start.md) installer is simpler.

## Requirements

- [Node.js](https://nodejs.org/) v18 or newer
- Docker with the Compose plugin
- `git`

## Step 1 — Find your region's OSM relation ID

Search for your city, Kreis, or district on [Nominatim](https://nominatim.openstreetmap.org) or [openstreetmap.org](https://openstreetmap.org). The relation ID appears in the URL — e.g. `openstreetmap.org/relation/62700` → ID is `62700`.

## Step 2 — Find a Geofabrik PBF extract

Browse [download.geofabrik.de](https://download.geofabrik.de) for an extract covering your region. German Bundesländer and many sub-regions are available. The PBF only needs to *contain* your region — a Bundesland extract works fine for a single Kreis.

## Step 3 — Configure

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
DEPLOY_MODE=data-node-ui
OSM_RELATION_ID=62700
PBF_URL=https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf
```

See [Configuration](configuration.md) for all available variables, including `DEPLOY_MODE` options (`data-node`, `ui`, `data-node-ui`).

## Step 4 — Start the stack and import data

```bash
# Start the database, API, and web server
docker compose --profile data-node-ui up -d

# Import OSM data (downloads PBF, clips to region with osmium, runs osm2pgsql)
# First run: ~2–5 min (downloads Bundesland PBF, clips to your region).
# Subsequent runs: much faster — the clipped PBF is cached and reused.
docker compose --profile data-node run --rm importer
```

Replace `data-node-ui` with your chosen `DEPLOY_MODE`. The app will be available at `http://localhost:8080` (or the port set in `APP_PORT`).

## Step 5 — Updating data

Re-run the importer at any time to refresh from Geofabrik (extracts are updated daily):

```bash
docker compose --profile data-node run --rm importer
```

## Applying database changes without a full re-import

SQL changes to `importer/api.sql` (PostgREST functions, indexes) can be applied directly to the running database:

```bash
make db-apply
```

## Testing on a phone / LAN access

```bash
make lan-url
```

Prints your machine's LAN IP and ready-to-use URLs. The Vite dev server and Docker stack both bind to all interfaces, so the printed URLs work immediately on any device on the same WiFi.

!!! warning "Geolocation on mobile"
    Browsers block the geolocation API on plain HTTP. If you need to test the location button on a phone, use Chrome and enable "Insecure origins treated as secure" at `chrome://flags`, or test against the production HTTPS URL.
