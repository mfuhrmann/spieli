# Local Development

**Requirements:** Node.js v18+, Docker with the Compose plugin

## Setup

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

Run `make help` to list all available targets.

## Hub mode

The stack includes a second backend (`db2` / `postgrest2`) pre-wired at `/api2/`. Both backends use the Hessen PBF — the importer caches it by filename, so the second import reuses the download.

```bash
# In .env: set APP_MODE=hub (and optionally OSM_RELATION_ID / OSM_RELATION_ID2)
make docker-build
make up
make import       # imports Fulda Stadt (454863) into db  — downloads Hessen PBF (~300 MB)
make import2      # imports Neuhof (454881) into db2 — reuses cached PBF
```

`registry.json` lists both backends (`/api` = Fulda, `/api2` = Neuhof). Open `http://localhost:8080` to see the Hub with two real regions.

## Frontend-only (no database)

When `apiBaseUrl` is empty in `app/public/config.js`, the frontend falls back to the Overpass API — no database required for basic frontend work:

```bash
make install
make dev
```

## Adding or changing an equipment illustration

The device and pitch tables (`app/src/lib/objPlaygroundEquipment.js`, `app/src/lib/equipmentAttributes.js`) name illustrations as MediaWiki `File:` titles. Those names are resolved to real file URLs at build time, so after adding or changing one:

```bash
make equipment-images     # re-resolve, rewriting app/src/lib/equipmentImages.generated.json
```

Commit the regenerated file with your change. It is checked in on purpose, like the basemap assets, so a build never depends on someone else's API being up.

Two things to expect:

- **A name that resolves on neither Commons nor the OSM wiki fails the target.** That is the point: such a name used to render nothing while costing two failing requests. Fix the name, or add it to `KNOWN_MISSING` in `tools/build-equipment-images.py` with a reason.
- **The resolved URL is not `Special:FilePath`.** It is the real file path on a Wikimedia or OSM-wiki host, which the `/ext/wikimedia/` proxy serves, so the visitor's browser never contacts either wiki. Do not reintroduce a `Special:FilePath` URL in the frontend — CI rejects it.

`make check-equipment-images` re-resolves and fails if the committed map no longer points at the same files. It is not wired into CI, because it depends on two live APIs; run it by hand if illustrations start disappearing.
