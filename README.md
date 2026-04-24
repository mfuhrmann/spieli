# spieli

## Linguistically

*Pronunciation:* **[ˈʃpiːli]**

<u>Meaning/Definition:</u>
A German word, that usually marks an area for children, often equipped with various facilities or devices for playing [Usage: children’s language]

<u>Article/Gender:</u>
In German, the grammatical gender is masculine: „der Spieli“.
In English, it is used as a neuter noun: “the spieli”.

---

## Technically

A free, interactive web map for exploring playgrounds based on [OpenStreetMap](https://openstreetmap.org) data — configurable for any region.

### Historically

> **Origin:** This project is a further development of the original [Berliner spieli](https://github.com/SupaplexOSM/spieli) by Alex Seidel.

## Matrix Contact

Come and let's play:
https://matrix.to/#/#spieli:matrix.org


## Modes

**Standalone** — a single-region map backed by its own database.

```
Browser ──► nginx ──► PostgREST ──► PostgreSQL/PostGIS
             │
             └── serves the app, proxies /api/ to PostgREST
```

**Hub** — aggregates multiple standalone instances onto one shared map. No own database; the Hub fetches data from registered backends over HTTP:

```
                   ┌─ backend A ──► PostgREST ──► PostgreSQL (region A) ─┐
Browser ──► nginx ─┤                                                     │
  (Hub UI)         └─ backend B ──► PostgREST ──► PostgreSQL (region B) ─┘
```

Set `APP_MODE=standalone` (default) or `APP_MODE=hub` in `.env`.

---

## Tech stack

| Component | Technology |
|---|---|
| Map | [OpenLayers](https://openlayers.org/) |
| UI / icons | [Bootstrap 5](https://getbootstrap.com/) + [Tailwind CSS 4](https://tailwindcss.com/) + [lucide-svelte](https://lucide.dev/) |
| Language | [Svelte 5](https://svelte.dev/) |
| Build tool | [Vite 6](https://vitejs.dev/) |
| Database | [PostgreSQL 16](https://www.postgresql.org/) + [PostGIS 3.4](https://postgis.net/) |
| OSM import | [osm2pgsql](https://osm2pgsql.org/) + [osmium-tool](https://osmcode.org/osmium-tool/) |
| API layer | [PostgREST v12](https://postgrest.org/) |
| Web server | [nginx](https://nginx.org/) |
| Container runtime | Docker / Docker Compose |

---

## Deploy

The interactive installer downloads everything it needs and walks you through configuration:

```bash
curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/install.sh -o install.sh
bash install.sh
```

**Requirements:** Docker with the Compose plugin, `bash`, `openssl`

The installer asks for a deployment mode (`data-node` / `ui` / `data-node-ui`), your OSM region, and optional settings, then generates a `.env`, pulls images, and optionally runs the first import.

For deploying from source, see [Manual Deploy](https://mfuhrmann.github.io/spieli/ops/manual-deploy/).

---

## Configuration

Key variables (full reference at [docs/ops/configuration](https://mfuhrmann.github.io/spieli/ops/configuration/)):

| Variable | Default | Description |
|---|---|---|
| `APP_MODE` | `standalone` | `standalone` for a single region; `hub` to aggregate multiple backends |
| `OSM_RELATION_ID` | `454863` | OSM relation ID for backend 1 (standalone + hub) |
| `OSM_RELATION_ID2` | `454881` | OSM relation ID for backend 2 (hub dev testing only) |
| `PBF_URL` | Hessen extract | Geofabrik `.osm.pbf` download URL |
| `REGISTRY_URL` | `/registry.json` | URL of the registry JSON listing backends (hub mode only) |
| `APP_PORT` | `8080` | Host port the app is exposed on |
| `MAP_ZOOM` | `12` | Initial map zoom level |
| `POSTGRES_PASSWORD` | `change-me` | Database password — **change in production** |

---

## Local development

**Requirements:** Node.js v18+, Docker with Docker Compose

### Standalone mode

```bash
make install      # install Node dependencies (once)
make up           # start db + PostgREST + nginx
make import       # download Hessen PBF and import Fulda Stadt (454863) — ~300 MB, run once
make dev          # Vite dev server with hot-reload at http://localhost:5173
```

For quick testing without a full import, load the bundled fixture (4 Fulda playgrounds):

```bash
make seed-load
```

### Hub mode

The stack includes a second backend (`db2` / `postgrest2`) pre-wired at `/api2/`. Both backends use the Hessen PBF — the importer caches it by filename, so the second import reuses the download.

```bash
# In .env: set APP_MODE=hub (and optionally OSM_RELATION_ID / OSM_RELATION_ID2)
make docker-build
make up
make import       # imports Fulda Stadt (454863) into db  — downloads Hessen PBF (~300 MB)
make import2      # imports Neuhof (454881) into db2 — reuses cached PBF
```

`registry.json` lists both backends (`/api` = Fulda, `/api2` = Neuhof). Open `http://localhost:8080` to see the Hub with two real regions.

Run `make help` to list all available targets.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow (branch → commit → PR), or the [docs](https://mfuhrmann.github.io/spieli/) for how-to guides (e.g. [adding a playground device](https://mfuhrmann.github.io/spieli/contributing/add-device/)).

New to OSM concepts like relation IDs or PBF files? See the [glossary](https://mfuhrmann.github.io/spieli/reference/glossary/).

---

## Federation (Hub mode)

Multiple regional instances can be aggregated into a single Hub map by deploying with `APP_MODE=hub` and pointing `REGISTRY_URL` at a JSON file that lists the backends:

```json
{
  "instances": [
    { "slug": "fulda",      "url": "https://fulda.example.com",      "name": "Fulda" },
    { "slug": "vogelsberg", "url": "https://vogelsberg.example.com", "name": "Vogelsberg" }
  ]
}
```

The Hub fetches playground data from every listed backend and renders them on a shared map. Each regional instance exposes `/api/rpc/get_playgrounds` and `/api/rpc/get_meta` for cross-origin federation. See [docs/reference/federation](https://mfuhrmann.github.io/spieli/reference/federation/).

---

## External services

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

## License

[GNU General Public License v3.0](LICENSE)

Map data © [OpenStreetMap](https://openstreetmap.org) contributors, available under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright).
