# Spielplatzkarte

A free, interactive web map for exploring playgrounds based on [OpenStreetMap](https://openstreetmap.org) data — configurable for any region.

> **Origin:** This project is a further development of the original [Berliner Spielplatzkarte](https://github.com/SupaplexOSM/spielplatzkarte) by Alex Seidel.

> **Language:** The UI is currently in German only. Internationalisation (i18n) is a known limitation — all user-facing strings are hardcoded in German, equipment names are German, and the opening hours parser is configured for Germany (`country_code: de`). Contributions to add i18n support are welcome.

---

## Features

**Map**
- Display all playgrounds in a configured OSM region on an interactive map
- Playground polygons coloured by data completeness (same logic used for polygon outline, hover tooltip dot, and detail panel badge):
  - 🟢 **Vollständig** — has at least one Panoramax photo (`panoramax` / `panoramax:*` tag) **and** a `name` **and** at least one of `operator`, `opening_hours`, `surface`, or `access` (with a value other than `yes`)
  - 🟡 **Teilweise erfasst** — has at least one of the above criteria but not all three
  - 🔴 **Daten fehlen** — none of the above are present
- Hover tooltip with playground name, key attributes, and completeness indicator

**Playground detail panel**
- Name, size (m²), surface (Bodenbelag), access restrictions, opening hours (parsed live), age restrictions, operator, contact info
- Equipment list (Ausstattung): individual collapsible items with attributes; sport-specific labels for pitches (Fußball, Basketball, Volleyball, …)
- Tree count: number of mapped `natural=tree` nodes in and around the playground, shown as a map layer when a playground is selected
- Street photos via [Panoramax](https://panoramax.xyz) — inline viewer with fullscreen modal and keyboard navigation
- Community reviews via [Mangrove.reviews](https://mangrove.reviews) — read ratings and submit your own (pseudonymous, no account required)
- Nearby POIs within a configurable radius: toilets, bus stops, ice cream, supermarkets, drugstores, emergency rooms — with distance and OSM foot routing
- Permalink: every playground gets a shareable `#W<id>` URL; share button uses the Web Share API (mobile) or copies to clipboard
- Add photos and equipment directly via [MapComplete](https://mapcomplete.org/playgrounds)

**Navigation & UX**
- Location search via [Nominatim](https://nominatim.openstreetmap.org) with nearby playground suggestions
- Geolocation: show nearest playgrounds to current position
- Responsive layout: desktop (left sidebar card) and mobile (swipeable bottom sheet with drag-to-close)

---

## Architecture

The app consists of four containers managed by Docker Compose:

```
browser → nginx (app) → PostgREST → PostgreSQL/PostGIS
                                   ↑
                              osm2pgsql importer (run once)
```

| Component | Role |
|---|---|
| **PostgreSQL + PostGIS** | Stores OSM data imported via osm2pgsql |
| **osm2pgsql importer** | Downloads a Geofabrik PBF extract and imports it into PostGIS |
| **PostgREST** | Auto-generates a REST API from SQL functions in the `api` schema |
| **nginx** | Serves the Vite-built frontend; proxies `/api/` to PostgREST |

---

## Tech Stack

| Component | Technology |
|---|---|
| Map | [OpenLayers](https://openlayers.org/) |
| UI framework | [Bootstrap 5](https://getbootstrap.com/) + [Bootstrap Icons](https://icons.getbootstrap.com/) |
| DOM / events | [jQuery](https://jquery.com/) |
| Opening hours parser | [opening_hours.js](https://github.com/opening-hours/opening_hours.js) |
| Build tool | [Vite 6](https://vitejs.dev/) |
| Language | JavaScript (ES Modules) |
| Database | [PostgreSQL 16](https://www.postgresql.org/) + [PostGIS 3.4](https://postgis.net/) |
| OSM import | [osm2pgsql](https://osm2pgsql.org/) (classic schema, `--hstore`) |
| API layer | [PostgREST v12](https://postgrest.org/) |
| Web server | [nginx](https://nginx.org/) |
| Container runtime | [Docker](https://www.docker.com/) / Docker Compose |

---

## External Services

| Service | Purpose |
|---|---|
| [Geofabrik](https://download.geofabrik.de) | Source of OSM PBF extracts for import |
| [Nominatim](https://nominatim.openstreetmap.org) | Location search and region bounding box |
| [CartoDB Voyager](https://carto.com/basemaps) | Background map tiles |
| [Panoramax](https://panoramax.xyz) | Street-level photos |
| [Mangrove.reviews](https://mangrove.reviews) | Pseudonymous community reviews |
| [MapComplete](https://mapcomplete.org) | Contribute photos and equipment |
| [Wikidata](https://wikidata.org) | Operator entity linking |

All data comes from OpenStreetMap or the free services listed above. No proprietary data, no user accounts, no tracking.

---

## Deploy for your region

### 1. Find your region's OSM relation ID

Search for your city, Kreis, or district on [Nominatim](https://nominatim.openstreetmap.org) or [openstreetmap.org](https://openstreetmap.org). The relation ID appears in the URL, e.g. `openstreetmap.org/relation/62700` → ID is `62700`.

### 2. Find a Geofabrik PBF extract

Browse [download.geofabrik.de](https://download.geofabrik.de) and find an extract that covers your region. German Bundesländer and many sub-regions are available. The PBF only needs to *contain* your region — a Bundesland extract works fine even if your region is just one Kreis within it.

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
OSM_RELATION_ID=62700   # your region's OSM relation ID
PBF_URL=https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf
```

See `.env.example` for all available options (UI links, zoom levels, port, DB password).

### 4. Start the stack and import data

```bash
# Start the database, API, and web server
docker compose up -d

# Import OSM data (downloads PBF, runs osm2pgsql, sets up API functions)
# Takes a few minutes depending on extract size and hardware
docker compose run --rm importer
```

The app will be available at `http://localhost:8080` (or the port set in `APP_PORT`).

### 5. Updating data

Re-run the importer at any time to refresh from Geofabrik (extracts are updated daily):

```bash
docker compose run --rm importer
```

---

## Configuration reference

All variables can be set in `.env` (copy from `.env.example`).

| Variable | Default | Description |
|---|---|---|
| `OSM_RELATION_ID` | `62700` | OSM relation ID of the region to display |
| `PBF_URL` | Hessen extract | Geofabrik `.osm.pbf` download URL |
| `REGION_PLAYGROUND_WIKI_URL` | Generic OSM wiki | Wiki page linked in the "Contribute" modal |
| `REGION_CHAT_URL` | *(hidden)* | Community chat link; leave empty to hide the button |
| `MAP_ZOOM` | `12` | Initial map zoom level |
| `MAP_MIN_ZOOM` | `10` | Minimum zoom level |
| `APP_PORT` | `8080` | Host port the app is exposed on |
| `POSTGRES_PASSWORD` | `change-me` | Database password — **change in production** |
| `POI_RADIUS_M` | `5000` | Radius in metres for nearby POI search |
| `OSM2PGSQL_THREADS` | `4` | CPU threads for the import |

---

## Local development

### npm dev server (recommended for frontend work)

**Requirements:** [Node.js](https://nodejs.org/) v18 or newer

```bash
npm install
npm start         # dev server with hot-reload at http://localhost:5173
npm run build     # production build into dist/
npm run serve     # preview the production build locally
```

A running PostgREST backend is required — the app no longer falls back to Overpass. Start the full stack via `docker compose up -d` before running the dev server, or point `API_BASE_URL` at a remote PostgREST instance.

### Building the Docker image

If you have the full stack running via `docker compose up -d` and want to rebuild only the frontend container after code changes:

```bash
docker compose up -d --build app
```

This runs the Vite build inside the container and replaces the nginx image without touching the database or PostgREST.

### Applying database changes without a full rebuild

SQL changes to `importer/api.sql` (PostgREST functions, indexes) can be applied directly to the running database:

```bash
docker compose exec -T db psql -U osm -d osm < importer/api.sql
docker compose exec db psql -U osm -d osm -c "NOTIFY pgrst, 'reload schema';"
```

---

## License

[GNU General Public License v3.0](LICENSE)

Map data © [OpenStreetMap](https://openstreetmap.org) contributors, available under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright).
