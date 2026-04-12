# Spielplatzkarte

A free, interactive web map for exploring playgrounds based on [OpenStreetMap](https://openstreetmap.org) data — configurable for any region.

> **Origin:** This project is a further development of the original [Berliner Spielplatzkarte](https://github.com/SupaplexOSM/spielplatzkarte) by Alex Seidel.

---

## Features

**Map**
- Display all playgrounds in a configured OSM region on an interactive map
- Playground polygons coloured by data completeness (same logic used for polygon outline, hover tooltip dot, and detail panel badge):
  - 🟢 **Vollständig** — has at least one Panoramax photo (`panoramax` / `panoramax:*` tag) **and** a `name` **and** at least one of `operator`, `opening_hours`, `surface`, or `access` (with a value other than `yes`)
  - 🟡 **Teilweise erfasst** — has at least one of the above criteria but not all three
  - 🔴 **Daten fehlen** — none of the above are present
- Private and customers-only playgrounds (`access=private` / `access=customers`) shown with a diagonal hatch pattern and dashed border
- Hover tooltip with playground name, key attributes, and completeness indicator

**Playground detail panel**
- Name, size (m²), surface (Bodenbelag), access restrictions, opening hours (parsed live), age restrictions, operator, contact info
- Equipment list (Ausstattung): individual collapsible items with attributes; sport-specific labels for pitches (Fußball, Basketball, Volleyball, …)
- Tree count: number of mapped `natural=tree` nodes in and around the playground, shown as a map layer when a playground is selected
- Street photos via [Panoramax](https://panoramax.xyz) — inline viewer with fullscreen modal and keyboard navigation
- Community reviews via [Mangrove.reviews](https://mangrove.reviews) — read ratings and submit your own (pseudonymous, no account required)
- Nearby POIs within a configurable radius: toilets, bus stops, ice cream, supermarkets, drugstores, emergency rooms (`emergency=yes` or `healthcare:speciality=emergency`) — with approximate distance (~) and OSM foot routing
- Permalink: every playground gets a shareable `#W<id>` URL; share button uses the Web Share API (mobile) or copies to clipboard
- Add photos and equipment directly via [MapComplete](https://mapcomplete.org/playgrounds)

**Navigation & UX**
- Location search via [Nominatim](https://nominatim.openstreetmap.org) with nearby playground suggestions — focus with **Double-Shift**
- Geolocation: show nearest playgrounds to current position
- **ESC** deselects the active playground and clears the URL hash
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
| **nginx** | Serves the Vite-built frontend; proxies `/api/` to PostgREST; exposes CORS headers for Hub federation |

---

## Federation

Multiple regional instances can be aggregated into a single global map using the **[Spielplatzkarte Hub](https://github.com/mfuhrmann/spielplatzkarte-hub)**.

Each instance exposes two federation endpoints (available since v0.2.1):

- `GET /api/rpc/get_playgrounds` — full GeoJSON FeatureCollection of all playgrounds in the region
- `GET /api/rpc/get_meta` — instance metadata: OSM relation name, playground count, bounding box

CORS is enabled on `/api/` so the Hub can query instances cross-origin from the browser.

---

## Tech Stack

| Component | Technology |
|---|---|
| Map | [OpenLayers](https://openlayers.org/) |
| UI framework | [Bootstrap 5](https://getbootstrap.com/) + [Bootstrap Icons](https://icons.getbootstrap.com/) |
| Opening hours parser | [opening_hours.js](https://github.com/opening-hours/opening_hours.js) |
| Build tool | [Vite 6](https://vitejs.dev/) |
| Internationalisation | [i18next](https://www.i18next.com/) |
| Language | JavaScript (ES Modules) |
| Database | [PostgreSQL 16](https://www.postgresql.org/) + [PostGIS 3.4](https://postgis.net/) |
| OSM import | [osm2pgsql](https://osm2pgsql.org/) (classic schema, `--hstore`) |
| API layer | [PostgREST v12](https://postgrest.org/) |
| Web server | [nginx](https://nginx.org/) |
| Container runtime | [Docker](https://www.docker.com/) / Docker Compose |

---

## Internationalisation

The UI is fully translated using [i18next](https://www.i18next.com/). The language is detected automatically from the visitor's browser settings, with English as the fallback.

### Supported languages

| Code | Language |
|---|---|
| `de` | German |
| `en` | English |
| `fr` | French |
| `es` | Spanish |
| `it` | Italian |
| `pl` | Polish |
| `nl` | Dutch |
| `cs` | Czech |
| `pt` | Portuguese |
| `sv` | Swedish |
| `uk` | Ukrainian |
| `ja` | Japanese |

> **Note:** Translations were not done by native speakers and may contain errors. Corrections and improvements are very welcome — see below for how to contribute.

### Testing a specific language

Add `?lang=xx` to the URL to force a language regardless of browser settings:

```
http://localhost:5173/?lang=fr
http://localhost:8080/?lang=ja
```

### Adding a new language

1. Copy `locales/en.json` to `locales/xx.json` (replace `xx` with the [BCP 47 language code](https://en.wikipedia.org/wiki/IETF_language_tag), e.g. `ro` for Romanian).
2. Translate all the string values in the new file. Do not change the keys.
3. For languages with complex plural forms (e.g. Polish, Ukrainian), add the appropriate plural suffixes (`_one`, `_few`, `_many`, `_other`) to the equipment count strings. See [i18next pluralisation docs](https://www.i18next.com/translation-function/plurals) and the existing `locales/pl.json` for reference.
4. In `js/i18n.js`, add an import and register the new locale:
   ```js
   import ro from '../locales/ro.json';
   // …
   resources: {
       // …existing entries…
       ro: { translation: ro },
   }
   ```
5. Run `npm run build` to verify there are no errors.

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

### Quick install (no git clone required)

The easiest way to deploy is with the interactive installer. It downloads everything it needs, walks you through configuration, and optionally runs the first import.

**Requirements:** Docker with the Compose plugin, `bash`, `openssl`

```bash
curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spielplatzkarte/main/install.sh -o install.sh
bash install.sh
```

The installer will:

1. Ask for a deployment directory (default: `./spielplatzkarte`)
2. Ask for your OSM relation ID and Geofabrik PBF URL
3. Prompt for optional settings (port, UI links, zoom levels)
4. Generate a secure database password automatically
5. Download `compose.yml` and `db/init.sql` into the deployment directory
6. Offer to pull images, start the stack, and run the first import

After setup, manage the stack from the deployment directory:

```bash
cd spielplatzkarte
docker compose up -d                 # start
docker compose run --rm importer     # re-import OSM data
docker compose down                  # stop
```

---

### Manual deploy (from source)

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
make up

# Import OSM data (downloads PBF, runs osm2pgsql, sets up API functions)
# Takes a few minutes depending on extract size and hardware
make import
```

The app will be available at `http://localhost:8080` (or the port set in `APP_PORT`).

### 5. Updating data

Re-run the importer at any time to refresh from Geofabrik (extracts are updated daily):

```bash
make import
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

**Requirements:** [Node.js](https://nodejs.org/) v18 or newer, [Docker](https://www.docker.com/) with Docker Compose

All common operations are available via `make`. Run `make help` to list all targets.

### Frontend dev server

```bash
make install      # install Node dependencies
make up           # start db + PostgREST + nginx (required backend)
make dev          # dev server with hot-reload at http://localhost:5173
```

A running PostgREST backend is required — the app no longer falls back to Overpass. Start the full stack with `make up` before running the dev server.

### Rebuild the app container after code changes

```bash
make docker-build
```

This runs the Vite build inside the container and replaces the nginx image without touching the database or PostgREST.

### Applying database changes without a full rebuild

SQL changes to `importer/api.sql` (PostgREST functions, indexes) can be applied directly to the running database:

```bash
make db-apply
```

---

## License

[GNU General Public License v3.0](LICENSE)

Map data © [OpenStreetMap](https://openstreetmap.org) contributors, available under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright).
