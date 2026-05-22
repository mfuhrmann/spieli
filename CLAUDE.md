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

1. Bump `app/package.json` version: remove `-rc` (e.g. `0.1.7-rc` → `0.1.7`). Commit: `chore: release v0.1.7`.
2. Update `TAG=` in both `install` blocks in `docs/getting-started/quick-start.md` to the new tag. Commit together with step 1 or separately.
3. Tag: `git tag v0.1.7 && git push origin v0.1.7`. CI publishes `:latest`, `:0.1.7`, `:0.1` images, creates a GitHub release, and uploads `install.sh` + `install.sh.sha256` as release assets.
4. Advance `main`: bump to next `-rc` (e.g. `0.1.8-rc`). Commit: `chore: bump version to 0.1.8-rc`.

**PR labels for release notes** — label PRs before merging so the auto-generated release notes show the correct upgrade action:
- `requires-schema-update` — `api.sql` changed; operators must run `API_ONLY=1` after upgrading.
- `requires-reimport` — data model changed; operators must run a full re-import.
- `requires-env-update` — new or removed env var in `.env`; operators must update their `.env` before starting.
- `requires-compose-update` — `compose.yml` changed structurally (new service, renamed service, removed volume); operators must re-run `install.sh` or update manually.

**Versioning rule** — breaking = "pull + restart is NOT sufficient":
- Any merged PR carries a breaking label → next release bumps **minor** (e.g. `0.4.x` → `0.5.0`).
- No breaking labels → **patch** bump (e.g. `0.5.0` → `0.5.1`).

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

**Docker build cache pitfall**: `make docker-build` uses Docker's layer cache. If source file changes aren't picked up (all steps say `---> Using cache`), force a full rebuild:
```bash
docker compose build --no-cache app && docker compose up -d app
```
This happens because Docker sometimes fails to detect that `app/` files changed. Symptom: code changes have no effect despite a successful `make docker-build`.

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
| `playgroundSource.js` | Shared OL VectorSource for the polygon tier. Non-null while Map.svelte is mounted; reset to `null` on teardown. Widgets (NearbyPlaygrounds, AppShell deeplink restore) hydrate features into it on demand at any zoom — there is no separate "cluster source" store; the cluster `VectorSource` is owned by `StandaloneApp.svelte` and never published, since no widget consumes it externally. |
| `tier.js` | Active zoom-tier — `null` \| `'cluster'` \| `'polygon'`. Written by the orchestrator, read by Map for layer visibility |

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

The map manages five OL layers beyond the basemap. Tiered playground delivery uses two of them — the active one is driven by `activeTierStore`:

1. **playgroundLayer** (zIndex 10) — polygon tier (zoom > `clusterMaxZoom`, default 13). Playground polygons styled by `playgroundStyleFn`, filtered by `filterStore`. Visible only when `$activeTierStore === 'polygon'`.
2. **clusterLayer** (zIndex 12) — cluster tier (zoom ≤ `clusterMaxZoom`). Server-bucketed cluster rings + single-child dots rendered via the canvas `stackedRingRenderer` in `app/src/lib/clusterStyle.js`. Visible only when `$activeTierStore === 'cluster'`.
3. **treeLayer** (zIndex 15) — natural=tree dots, shown when a playground is selected.
4. **equipmentLayer** (zIndex 20) — playground devices/pitches/benches, shown when a playground is selected.
5. **pitchLayer** (zIndex 9) — standalone pitches outside any playground, loaded on `moveend` at zoom ≥ 12, visibility controlled by `filterStore.standalonePitches`.

Equipment and tree layers are driven by `overlayFeaturesStore` (written by PlaygroundPanel, read by Map). Cluster vs polygon visibility is driven by `activeTierStore` (written by the orchestrator).

### Zoom-tier orchestrator (`app/src/lib/tieredOrchestrator.js`)

Standalone's data path is no longer a one-shot `fetchPlaygrounds` on mount. Instead `attachTieredOrchestrator(...)` wires a debounced (300 ms) `moveend` handler that:

1. Computes the active tier from `view.getZoom()` against `clusterMaxZoom`.
2. Publishes the tier via `activeTierStore`.
3. Aborts any in-flight request via `AbortController`.
4. Fetches the tier's RPC (`fetchPlaygroundClusters` or `fetchPlaygroundsBbox`) and populates the corresponding source.
5. Falls back to the legacy `fetchPlaygrounds(relation_id)` once if a tier RPC 404s (backend skew during a deploy).

Deeplinks at low zoom use the new `fetchPlaygroundByOsmId` (RPC `get_playground(osm_id)`) to hydrate the polygon source on demand without waiting for a polygon-tier moveend.

### API (`app/src/lib/api.js`)

All PostgREST calls. Key functions:

- `fetchPlaygroundClusters(zoom, extent, baseUrl, signal)` — cluster tier (zoom ≤ 13)
- `fetchPlaygroundsBbox(extent, baseUrl, signal)` — polygon tier (zoom > 13)
- `fetchPlaygroundByOsmId(osmId, baseUrl, signal)` — single-feature hydration; throws on non-OK, returns `null` on legitimate miss
- `fetchPlaygroundCentroids(extent, baseUrl, signal)` — server-shipped, client unused in P1 (kept for federation)
- `fetchPlaygroundEquipment(extentEPSG3857, osmId, baseUrl)` — equipment within a playground's bbox
- `fetchStandaloneEquipment(extentEPSG3857, baseUrl)` — pitches + equipment NOT within any playground
- `fetchTrees`, `fetchNearbyPOIs`, `fetchNearestPlaygrounds`, `fetchMeta`
- `fetchPlaygrounds(baseUrl)` — region-scoped legacy fetcher; **deprecated**, logs a one-time console warning, will be removed in the release after next

### Database API (`importer/api.sql`)

All PostgREST-exposed functions live in the `api` schema. See [`docs/reference/api.md`](docs/reference/api.md) for full request/response shapes.

- `get_playground_clusters(z, bbox)` — pre-aggregated cluster buckets with `{count, complete, partial, missing, restricted}`
- `get_playgrounds_bbox(bbox)` — polygon tier; same response shape as the legacy `get_playgrounds`
- `get_playground(osm_id)` — single-feature lookup for deeplink/nearby hydration
- `get_playground_centroids(bbox)` — lightweight per-feature rows (federation-ready, client unused in P1)
- `get_meta()` — federation discovery; returns `{relation_id, name, playground_count, complete, partial, missing, bbox}`
- `get_equipment(bbox)` — equipment within a bounding box (used per selected playground)
- `get_standalone_equipment(bbox)` — pitches + equipment outside any playground polygon
- `get_trees(bbox)`, `get_pois(lat, lon, radius_m)`, `get_nearest_playgrounds(lat, lon)`
- `get_playgrounds(relation_id)` — **deprecated** region-scoped variant; SQL `COMMENT` flags it for removal

The `playground_stats` materialised view is rebuilt with each `make db-apply` and carries the per-playground `completeness` (`'complete' | 'partial' | 'missing'`) — the rule mirrors `app/src/lib/completeness.js` exactly.

Run `make db-apply` after modifying `api.sql` to apply changes without a full re-import.

**After any change to `importer/api.sql` or `db/init.sql`, verify with a fresh-volume import:**
```bash
make down && docker volume rm spieli_pgdata spieli_pgdata2 && make up
```
This catches ordering bugs (e.g. a function referencing a table defined later in the file) that `make db-apply` on an existing volume silently passes.

### Styles (`app/src/lib/vectorStyles.js`)

- `playgroundStyleFn` — playground polygon fill/stroke, colour-coded by completeness
- `equipmentLayerStyleFn` — equipment points/polygons (green for pitches, teal for fitness, grey for devices)
- `treeStyle` — small green dot for trees

## Documentation

When adding or changing something covered by the `docs/` structure, update the relevant page (or create a new one and add it to `mkdocs.yml`). Relevant mappings:

- New API RPC → `docs/reference/api.md`
- New config env var → `docs/ops/configuration.md`
- New OSM tag / import rule → `docs/contributing/import-pipeline.md`
- New frontend store or component → `docs/contributing/frontend-guide.md`
- New make target or dev workflow step → `docs/contributing/local-dev.md`
- New troubleshooting scenario → `docs/ops/troubleshooting.md`

Run `make docs-build` before pushing to catch broken links.
