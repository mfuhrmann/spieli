# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Spielplatzkarte is an interactive web map for exploring playgrounds based on OpenStreetMap data. It is deployable per-region (e.g. Berlin, Fulda) by setting environment variables. The UI language is German throughout — there is no i18n layer, German strings are hardcoded.

## Git workflow

- **Never push directly to `main`.** All changes go through a feature branch and a pull request.
- Branch naming: `<type>/<short-description>` (e.g. `feat/add-filter-panel`, `fix/popup-scroll`).
- Use **Conventional Commits** for all commit messages: `<type>[optional scope]: <description>`. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`. Breaking changes: append `!` after type/scope or add a `BREAKING CHANGE:` footer.
- Releases are cut from version tags (e.g. `v0.2.3`). The tag drives both the app version (read from `package.json` at build time) and the container image tag — keep all three in sync when releasing.

## Development commands

```bash
npm start        # Vite dev server at http://localhost:5173 (hot-reload)
npm run build    # Production build → dist/
npm run serve    # Preview production build locally
```

No test framework is configured.

## Docker Compose stack

```bash
cp .env.example .env                   # configure OSM_RELATION_ID and PBF_URL
docker compose run --rm importer       # one-time OSM data import (downloads PBF, runs osm2pgsql)
docker compose up -d                   # start db + postgrest + nginx/app
```

The importer profile is not started by default with `docker compose up`. It must be run explicitly before the app has any data.

## Architecture

```
Browser ──► nginx ──► Vite-built static assets
                  └──► /api/ (proxy) ──► PostgREST ──► PostgreSQL/PostGIS
```

- **Frontend** (`js/`, `css/`, `index.html`): Plain JavaScript ES Modules, OpenLayers for the map, Bootstrap 5 for UI components.
- **PostgREST**: Auto-generates a REST API from the `api` schema in PostgreSQL. All DB functions called by the frontend are in that schema.
- **nginx** (`nginx.conf`, `Dockerfile`): Serves the Vite build, proxies `/api/` to PostgREST, and writes `public/config.js` at startup from env vars.

## Runtime configuration

`public/config.js` is the config bridge. In Docker, `docker-entrypoint.sh` overwrites it from environment variables. In local dev, it holds default fallback values. `js/config.js` reads `window.APP_CONFIG` (set by `public/config.js`) and exports named constants used throughout the JS modules.

**Local dev note**: When `apiBaseUrl` is empty (the default in `public/config.js`), the frontend falls back to Overpass for playground data rather than PostgREST — this means a running database is not required for basic frontend development.

## Key JS modules

| Module | Role |
|---|---|
| `js/map.js` | OpenLayers map setup, layer management, region fit |
| `js/api.js` | All PostgREST fetch calls (`get_playgrounds`, `get_equipment`, `get_trees`, `get_pois`) |
| `js/selectPlayground.js` | Playground selection state, URL hash, info panel display |
| `js/completeness.js` | Calculates and renders the data-completeness indicator per playground |
| `js/config.js` | Exports all runtime config values from `window.APP_CONFIG` |
| `js/panoramax.js` | Street-level photo integration (Panoramax API) |
| `js/reviews.js` | Community review integration (Mangrove API) |
| `js/search.js` | Location search via Nominatim |
| `js/shadow.js` | Sun position / shadow simulation |

## Database

Schema lives in `db/init.sql`. OSM data is imported via osm2pgsql using rules in `processing/`. The `api` schema exposes stored functions that PostgREST serves as RPC endpoints. To apply schema changes without a full re-import, connect directly with psql:

```bash
docker compose exec db psql -U osm -d osm
```
