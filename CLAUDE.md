# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

spieli is an interactive web map for exploring playgrounds based on OpenStreetMap data. It is deployable per-region (e.g. Fulda) by setting environment variables. UI strings are currently hardcoded German — i18n re-integration with svelte-i18n is tracked in epic #157.

## Git workflow

- **Never push directly to `main`.** All changes go through a feature branch and a pull request.
- **Never create branches, PRs, or issues on `upstream`** (`SupaplexOSM/spieli`). Always work on `origin` (`mfuhrmann/spieli`).
- Branch naming: `<type>/<issue-number>-<short-description>` (e.g. `feat/130-equipment-map-layer`).
- Use **Conventional Commits**: `<type>[optional scope]: <description>`. Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`.
- Always create a GitHub issue first, then a branch, then make code changes.
- **`main` always carries an `-rc` version** in `package.json` (e.g. `0.1.7-rc`).

### Release procedure

1. Bump `package.json` version: remove `-rc` (e.g. `0.1.7-rc` → `0.1.7`). Commit: `chore: release v0.1.7`.
2. Tag: `git tag v0.1.7 && git push origin v0.1.7`. CI publishes `:latest`, `:0.1.7`, `:0.1` images.
3. Advance `main`: bump to next `-rc` (e.g. `0.1.8-rc`). Commit: `chore: bump version to 0.1.8-rc`.

## Development commands

All common operations are via `make`. Run `make help` to list all targets.

```bash
make install      # install all deps (root + app/)
make dev          # Vite dev server at http://localhost:5173 (hot-reload, Overpass fallback)
make build        # production build → app/dist/
make test         # Playwright E2E tests
make lan-url      # print LAN IP for mobile testing
```

## Docker Compose stack

The user tests on port 8080 (Docker). Always run `make docker-build` after frontend changes.

```bash
cp .env.example .env   # set OSM_RELATION_ID and PBF_URL
make up                # start db + PostgREST + nginx/app
make import            # download PBF and import OSM data (required once before app has data)
make docker-build      # rebuild and restart only the app container — required to see changes
make db-apply          # apply importer/api.sql to running DB and reload PostgREST
make seed-load         # load 4-playground fixture (Fulda) for dev without a full import
make db-shell          # psql shell in the running DB container
make down              # stop all containers
```

**Local dev note**: When `apiBaseUrl` is empty in `app/public/config.js`, the frontend falls back to Overpass — no database required for basic frontend dev.

## Architecture

```
Browser ──► nginx ──► Vite-built static assets (app/dist/)
                  └──► /api/ ──► PostgREST ──► PostgreSQL/PostGIS
```

- **Frontend**: Svelte 5 + Vite 6, OpenLayers for the map, Tailwind/shadcn for UI
- **PostgREST**: auto-generates REST API from the `api` schema. All DB functions are in `importer/api.sql`.
- **nginx** (`oci/app/`): serves the build, proxies `/api/`, writes `app/public/config.js` at startup from env vars
- **osm2pgsql**: imports OSM PBF data using rules in `processing/`; schema in `db/init.sql`

## App modes

`app/src/main.js` mounts either `StandaloneApp` or `HubApp` based on `appMode` in config:

- **`standalone`** (default): single-region map. Fetches playgrounds for a configured OSM relation.
- **`hub`**: federation mode — loads a `registry.json` listing multiple PostgREST backends, merges their playgrounds onto one shared map, shows an `InstancePanel` with backend status.

To test Hub mode locally: set `appMode: 'hub'` in `app/public/config.js`, run `make docker-build`. A local `registry.json` at `app/public/registry.json` points to `/api` for testing.

## Runtime configuration

`app/public/config.js` is the config bridge — sets `window.APP_CONFIG`. In Docker, `oci/app/docker-entrypoint.app.sh` overwrites it from env vars at startup. `app/src/lib/config.js` reads `window.APP_CONFIG` and exports named constants.

## Key frontend architecture

### Stores (`app/src/stores/`)

| Store | Role |
|---|---|
| `selection.js` | Currently selected playground feature + backend URL |
| `filters.js` | Active filter state (playground filters + `standalonePitches` layer toggle) |
| `overlayLayer.js` | Bridge between PlaygroundPanel and Map — carries `{ equipment[], trees[] }` |
| `map.js` | OL map instance reference |
| `playgroundSource.js` | Shared OL VectorSource reference (used by completeness indicator) |

### Components (`app/src/components/`)

| Component | Role |
|---|---|
| `Map.svelte` | OL map, all layers, click/hover handlers, standalone pitch layer (moveend) |
| `PlaygroundPanel.svelte` | Fetches and displays equipment/trees/POIs for selected playground; writes to `overlayFeaturesStore` |
| `StandaloneApp.svelte` | Full app layout: search bar, filter controls, zoom/locate buttons, mobile bottom sheet, desktop side panel |
| `EquipmentList.svelte` | Renders device/fitness/pitch/bench lists inside PlaygroundPanel |
| `HoverPreview.svelte` | Floating card on playground hover (desktop only) |
| `EquipmentTooltip.svelte` | Tooltip on equipment/pitch hover |
| `FilterPanel.svelte` | Filter dropdown; also contains "Ebenen" section for layer toggles |
| `SearchBar.svelte` | Nominatim location search |

### Layers in Map.svelte

The map manages four OL layers beyond the basemap:

1. **playgroundLayer** (zIndex 10) — playground polygons, styled by `playgroundStyleFn`, filtered by `filterStore`
2. **treeLayer** (zIndex 15) — natural=tree dots, shown when a playground is selected
3. **equipmentLayer** (zIndex 20) — playground devices/pitches/benches, shown when a playground is selected
4. **pitchLayer** (zIndex 9) — standalone pitches outside any playground, loaded on `moveend` at zoom ≥ 12, visibility controlled by `filterStore.standalonePitches`

Equipment and tree layers are driven by `overlayFeaturesStore` (written by PlaygroundPanel, read by Map).

### API (`app/src/lib/api.js`)

All PostgREST calls. Key functions:
- `fetchPlaygrounds(baseUrl)` — all playgrounds in the region
- `fetchPlaygroundEquipment(extentEPSG3857, osmId, baseUrl)` — equipment within a playground's bbox
- `fetchStandaloneEquipment(extentEPSG3857, baseUrl)` — pitches + equipment NOT within any playground
- `fetchTrees`, `fetchNearbyPOIs`, `fetchNearestPlaygrounds`, `fetchMeta`

### Database API (`importer/api.sql`)

All PostgREST-exposed functions live in the `api` schema:
- `get_playgrounds(relation_id)` — playground polygons for a region
- `get_equipment(bbox)` — equipment within a bounding box (used per selected playground)
- `get_standalone_equipment(bbox)` — pitches + equipment outside any playground polygon
- `get_trees(bbox)`, `get_pois(lat, lon, radius_m)`, `get_nearest_playgrounds(lat, lon)`, `get_meta()`

Run `make db-apply` after modifying `api.sql` to apply changes without a full re-import.

### Styles (`app/src/lib/vectorStyles.js`)

- `playgroundStyleFn` — playground polygon fill/stroke, colour-coded by completeness
- `equipmentLayerStyleFn` — equipment points/polygons (green for pitches, teal for fitness, grey for devices)
- `treeStyle` — small green dot for trees
