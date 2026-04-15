# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Spielplatzkarte is an interactive web map for exploring playgrounds based on OpenStreetMap data. It is deployable per-region (e.g. Berlin, Fulda) by setting environment variables. The UI language is German throughout — there is no i18n layer, German strings are hardcoded.

## Git workflow

- **Never push directly to `main`.** All changes go through a feature branch and a pull request.
- **Never create branches or push to `upstream`** (`SupaplexOSM/spielplatzkarte`). Always work on `origin` (the fork: `mfuhrmann/spielplatzkarte`).
- **Never create pull requests or issues on `upstream`** (`SupaplexOSM/spielplatzkarte`). All PRs and issues must be created on the fork (`mfuhrmann/spielplatzkarte`).
- Branch naming: `<type>/<short-description>` (e.g. `feat/add-filter-panel`, `fix/popup-scroll`).
- Use **Conventional Commits** for all commit messages: `<type>[optional scope]: <description>`. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`. Breaking changes: append `!` after type/scope or add a `BREAKING CHANGE:` footer.
- Releases are cut from version tags (e.g. `v0.2.3`). The tag drives both the app version (read from `package.json` at build time) and the container image tag — keep all three in sync when releasing.
- **`main` always carries an `-rc` version.** The `version` field in `package.json` on `main` must always be one patch increment above the latest release tag and carry an `-rc` suffix (e.g. after releasing `v0.1.4` the branch version becomes `0.1.5-rc`). This version is what gets embedded in the `:rc` container image on every merge.

### Release procedure

1. **Bump version on `main`**: update `package.json` → remove `-rc`, e.g. `0.1.5-rc` → `0.1.5`. Commit: `chore: release v0.1.5`.
2. **Tag**: `git tag v0.1.5 && git push origin v0.1.5`. The `build.yml` workflow publishes `:latest`, `:0.1.5`, and `:0.1` container images automatically.
3. **Advance `main` to the next `-rc`**: update `package.json` → `0.1.6-rc`. Commit: `chore: bump version to 0.1.6-rc`.

## Development commands

All common operations are available via `make`. Run `make help` to list targets.

```bash
make install      # npm ci (root) + npm --prefix app ci — installs all deps
make dev          # Vite dev server at http://localhost:5173 (hot-reload)
make build        # Production build → app/dist/
make serve        # Preview production build locally
make test         # Run Playwright E2E tests
```

## Docker Compose stack

```bash
cp .env.example .env   # configure OSM_RELATION_ID and PBF_URL
make up                # start db + PostgREST + nginx/app
make import            # one-time OSM data import (downloads PBF, runs osm2pgsql)
make docker-build      # rebuild and restart only the nginx/app container
make db-apply          # apply importer/api.sql to the running DB and reload PostgREST
make db-shell          # open a psql shell in the running DB container
make down              # stop all containers
```

The importer is not started by `make up`. Run `make import` once before the app has any data.

## Automated weekly import (systemd)

Ready-to-use systemd unit files live in `deploy/`. They run `docker compose run --rm importer` automatically once a week and catch missed runs on the next boot.

**Prerequisites**

- systemd must be available on the host (standard on most Linux servers)
- The service user must be a member of the `docker` group

**Install**

```bash
# 1. Copy the unit files
sudo cp deploy/spielplatzkarte-import.service /etc/systemd/system/
sudo cp deploy/spielplatzkarte-import.timer   /etc/systemd/system/

# 2. Edit the service unit — set WorkingDirectory and EnvironmentFile to the
#    actual deployment path, and uncomment + set User= to the deployment user
sudo editor /etc/systemd/system/spielplatzkarte-import.service

# 3. Reload and enable
sudo systemctl daemon-reload
sudo systemctl enable --now spielplatzkarte-import.timer

# 4. Verify
systemctl status spielplatzkarte-import.timer
```

The timer fires every Sunday at 00:00 local time. To use a different time, create a drop-in override:

```bash
sudo systemctl edit spielplatzkarte-import.timer
# Add: [Timer]\nOnCalendar=Sun 03:00
```

**Disable / rollback**

```bash
sudo systemctl disable --now spielplatzkarte-import.timer
sudo rm /etc/systemd/system/spielplatzkarte-import.{service,timer}
sudo systemctl daemon-reload
```

## Testing on mobile / LAN access

To test the app on a phone (or any device on the same WiFi), run:

```bash
make lan-url
```

This prints your machine's LAN IP and the ready-to-use URLs:

```
  LAN IP:            192.168.1.42
  Vite dev server:   http://192.168.1.42:5173
  Docker stack:      http://192.168.1.42:8080
```

**Vite dev server** (`make dev`): binds to all interfaces automatically — open the printed Network URL on the phone. If the page doesn't load, check that port 5173 is not blocked by a firewall on the host.

**Docker stack** (`make up`): already binds to `0.0.0.0` by default, so `http://<LAN-IP>:8080` (or `$APP_PORT`) works immediately without any extra config.

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
