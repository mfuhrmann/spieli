# CLAUDE.md

Guidance for AI coding assistants working in this repository (Claude Code, Cursor, GitHub Copilot, etc.).
For Copilot users: open this file manually — `.github/copilot-instructions.md` points here.

## What this project is

spieli is an interactive web map for exploring playgrounds based on OpenStreetMap data. It is deployable per-region (e.g. Fulda) by setting environment variables. The UI is fully internationalised via svelte-i18n. **A locale file in `locales/` is not live until it is registered** in `app/src/lib/i18n.js` *and* listed in `SUPPORTED` there — `de`, `en` and `sk` today; the other ten files are unreachable at runtime, silently (#814). `app/src/lib/i18n.test.js` enforces that pairing and refuses to graduate a locale whose strings `intl-messageformat` cannot parse (`fr`/`es` are complete but blocked on #751). Separately, de, en, fr and es include complete device name translations. `name_de` in `objPlaygroundEquipment.js` is a fallback for locales that do not yet have translations.

**Locale file ownership** — new UI strings go into `locales/en.json` (Weblate's source template) plus `locales/de.json`, in the same commit. **Never edit any other locale file by hand**; they belong to Weblate translators, and editing them directly breaks Weblate's rebase onto `main`. The `i18n Guard` CI job enforces this. See [`docs/contributing/translations.md`](docs/contributing/translations.md).

## Git workflow

- **Never push directly to `main`.** All changes go through a feature branch and a pull request.
- **Never push directly to the canonical upstream.** Fork the repo, work on your fork, open a PR against `mfuhrmann/spieli`.
- Branch naming: `<type>/<issue-number>-<short-description>` (e.g. `feat/130-equipment-map-layer`).
- Use **Conventional Commits**: `<type>[optional scope]: <description>`. Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`.
- Always create a GitHub issue first, then a branch, then make code changes.
- **Always branch from `main`** unless explicitly building on another in-flight branch.
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
make serve        # preview production build locally
make test         # unit tests + Playwright E2E tests
make test-unit    # unit tests only (app/src/lib/*.test.js + app/src/stores/*.test.js)
make lan-url      # print LAN IP for mobile testing

make basemap-assets   # regenerate the vendored basemap style + macro world outline
make equipment-images # re-resolve the equipment illustrations' File: names
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
make seed-extract      # regenerate dev/seed/seed.sql from running DB (maintainers only)
make db-shell          # psql shell in the running DB container
make installer         # run the interactive production installer
make down              # stop all containers
```

Docs:
```bash
make docs-install  # set up Python venv + MkDocs dependencies
make docs-serve    # MkDocs live-reload server at http://localhost:8000
make docs-build    # build static docs → site/
make docs-clean    # remove site/ and .venv
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

- **Frontend**: Svelte 5 + Vite 6, OpenLayers for the map, Tailwind CSS + Bootstrap + shadcn-inspired primitives for UI
- **PostgREST**: auto-generates REST API from the `api` schema. All DB functions are in `importer/api.sql`.
- **nginx** (`oci/app/`): serves the build, proxies `/api/`, writes `app/public/config.js` at startup from env vars
- **osm2pgsql**: imports OSM PBF data in default pgsql mode (`--slim --drop --hstore`); creates `planet_osm_*` tables; schema bootstrap in `db/init.sql`
- **osmium-tool**: bbox clip + tag filter before osm2pgsql (reduces ~300 MB → ~5 MB per region)

## App modes

`app/src/main.js` mounts either `StandaloneApp` or `HubApp` based on `appMode` in config:

- **`standalone`** (default): single-region map. Fetches playgrounds for a configured OSM relation.
- **`hub`**: federation mode — loads a `registry.json` listing multiple PostgREST backends, merges their playgrounds onto one shared map, shows an `InstancePanel` with backend status.

To test Hub mode locally: set `appMode: 'hub'` in `app/public/config.js`, run `make docker-build`. A local `registry.json` at `app/public/registry.json` points to `/api` for testing.

## Runtime configuration

`app/public/config.js` is the config bridge — sets `window.APP_CONFIG`. In Docker, `oci/app/docker-entrypoint.sh` overwrites it from env vars at startup. `app/src/lib/config.js` reads `window.APP_CONFIG` and exports named constants.

### Basemap delivery

Same-origin by default; nothing to switch on. The entrypoint generates two nginx files:

- `/etc/nginx/basemap-location.conf` — the `^~ /basemap/` prefix location (`^~` is load-bearing: regex locations are matched *before* plain prefixes, so without it the `~* \.png$` static block claims every sprite and raster tile) plus the `@basemap_upstream` named location that proxies and caches.
- `/etc/nginx/conf.d/09-basemap-cache.conf` — `proxy_cache_path` and the maps driving `Accept-Encoding` and the visitor-facing `Cache-Control`.

Those maps are keyed on `$request_uri` and `$status`, never `$upstream_status` or `$upstream_http_*`: those are **empty on a cache hit**, so a map keyed on them falls to its default on every hit.

| Env var | Role |
|---|---|
| `BASEMAP_UPSTREAM` | Origin the cache fetches from (default `https://tiles.openfreemap.org`). Origin only — a path is refused at startup, because `proxy_pass` with a URI-bearing variable *replaces* the request URI instead of prefixing it. |
| `BASEMAP_COVERAGE_BBOX` | Where the basemap has *detailed* data. A regional tileset renders global context at low zoom but answers 204 outside its extract above ~z7, and an empty tile is indistinguishable from an empty map — this is what lets the app say so. Rule and parsing in `app/src/lib/basemapCoverage.js`, unit-tested; `Map.svelte` only feeds it view state. |
| `BASEMAP_CACHE_MAX_SIZE` / `_KEYS_ZONE` / `_INACTIVE` | Cache sizing. Validated, not sanitised: `4.5g` is rejected rather than silently becoming `45g`. |
| `BASEMAP_STYLE_URL` / `BASEMAP_URL` | Opt *out* to a third-party provider. Requires `BASEMAP_ATTRIBUTION`, and is refused alongside `BASEMAP_PROXY` when the style is not same-origin. |

The proxying half is only generated when the effective style routes the browser through `/basemap/`; otherwise `/basemap/` serves vendored files from disk and no cache zone is allocated.

**Shared cache (multi-stack hosts only)** — `deploy/basemap-cache/` is one nginx cache per *host*, which every stack points `BASEMAP_UPSTREAM` at, joined via `compose.override.basemap-cache.yml`. The browser never touches it: it talks to its own stack, which fetches through the cache server-side, so there is no Traefik router, CORS exception or CSP allowance involved. One rewrite is load-bearing — the shared cache must rewrite the TileJSON's absolute upstream URLs to the relative `/basemap/` path, because each stack's own `sub_filter` looks for *its* upstream (now the cache, not the provider) and would otherwise find nothing and hand the browser the provider's URLs. The map renders identically either way, so CI asserts it. See [`docs/ops/shared-basemap-cache.md`](docs/ops/shared-basemap-cache.md).

`make basemap-style` builds **both** style variants from a single upstream fetch — `style.json` (upstream URLs, for `make dev`, which has no nginx) and `style.local.json` (all assets under `/basemap/`, what the container serves). `make basemap-fonts` vendors the webfonts and fails if the style asks for a weight it did not vendor, because that failure is otherwise invisible: a system-font fallback plus an upstream request on every page load.

### External-service delivery (`/ext/`)

Same-origin by default, like the basemap. `docker-entrypoint.sh` generates `/etc/nginx/ext-locations.conf` (the prefix/regex locations) and `/etc/nginx/conf.d/11-ext-cache.conf` (the shared `ext` cache zone, the `limit_req_zone`, and an internal loopback server on `127.0.0.1:8091`).

| Path | Upstream | Notes |
|---|---|---|
| `/ext/nominatim/` | `nominatim.openstreetmap.org` | `search`/`lookup`/`reverse` only. Proxies to the **loopback server**, which carries the rate limiter |
| `/ext/commons/` | `commons.wikimedia.org` | `/w/api.php` only |
| `/ext/wikimedia/<host>/<path>` | any `*.wikimedia.org` | Image bytes. A **regex** location, so its include must stay above the `~* \.(js|css|png…)$` static block |
| `/ext/mangrove/` | `api.mangrove.reviews` | `reviews` (GET) and `submit/<jwt>` (**PUT**) |

Six things here are load-bearing and were each found the hard way:

- **`access_log off` in every location.** Proxying moves the visitor's request stream onto the operator's disk; logging it is worse than the exposure it replaced. Emitted from `_ext_common` so a call site cannot forget it.
- **The rate limiter lives on the loopback server, not the visitor-facing location.** `limit_req` runs in the preaccess phase, *before* the cache lookup, so on the outer location it sheds requests that were already cached — two simultaneous visitors were enough to break search. Only misses reach the loopback hop; a shed request falls back to stale via `proxy_cache_use_stale … http_503`.
- **That loopback server needs a `server_name`.** The limiter is keyed on `$server_name`, and nginx *silently skips* `limit_req` when its key is empty — a limiter that parses and enforces nothing.
- **`set` must come BEFORE `rewrite … break`.** `break` stops the rewrite module, and `set` is one of its directives, so a `set` after it never runs — the `Cache-Control` header then renders empty and none is sent at all.
- **Comments inside the generated blocks must not use backticks.** These are unquoted heredocs, so `` `always` `` is command substitution: the shell tried to run `always`, `set` and `rewrite` as commands and the container died before nginx started.
- **The Wikimedia host is carried in the path, not assumed.** The imageinfo API returns thumbnails on `thumb.wikimedia.org` and originals on `upload.wikimedia.org`; a rewrite pinned to one host sends every thumbnail straight to Wikimedia while appearing to work. `proxiedImageUrl` in `app/src/lib/commons.js` does the rewrite (validate host first, rewrite second) and preserves the `?utm_*` query the API attaches.

**Panoramax is not proxied at all**, and that is a finding rather than an omission: its thumbnail endpoint answers 308 with a `Location` on a per-instance derivative host (nginx cannot follow a redirect, and the derivative hosts are a federation's, not ours to enumerate), and its viewer is an iframe that must not be served from this origin. **Equipment-attribute illustrations are not proxied either** — `equipmentAttributes.js` renders them from `Special:FilePath`, whose redirect chain would need `/w/index.php` opened as a relay. Both are why `img-src` keeps its Wikimedia and Panoramax sources even when every proxy is on; narrowing it would block the images *and* falsify the privacy page.

Per-service opt-out via `PROXY_NOMINATIM` / `PROXY_COMMONS` / `PROXY_MANGROVE` (default on). Opting one out routes the browser directly *and* adds its host to the generated CSP and to the generated privacy-page table — both follow the configuration, neither is hardcoded.

### Content Security Policy

Generated into `/etc/nginx/csp.conf` and included by `nginx.conf`; not a literal, because hub `connect-src` origins come from an operator-supplied `registry.json`, a remote `API_BASE_URL` is another origin, and a basemap opt-out adds a tile host. Written to a temp file and `mv`d, so it is never read half-written.

Two policies ship together for one release: the old wildcard one **enforced**, and the narrowed one **report-only**. A too-tight CSP fails silently, so the swap waits for a clean observation period. No `report-uri` — it would rebuild the per-visitor trail on the operator's disk. `CSP_CONNECT_EXTRA` / `CSP_IMG_EXTRA` cover origins the generator cannot discover.

**Hosts reach the policy as full origins, scheme and port intact.** There are deliberately two derivations of the same set: `host_of` / `style_asset_hosts` produce bare hosts for the privacy page's service table, and `origin_of` / `style_asset_origins` produce origins for the CSP. A CSP host-source with no port matches only the scheme's default port, and one with no scheme only the document's own scheme, so a policy built from the display list blanks the basemap of a tileserver on `:8443` or one reached over `http`. The `:` missing from one `grep` character class is all it took.

**Region metadata vs UI locale.** `defaultLocale` is the interface language; `regionLang` (default `'de'`) is the language the served OSM data is *named* in, and the two are configured independently. OSM-derived text carries `lang={regionLang}`; interface text inherits `document.documentElement.lang`, which `setupI18n()` writes from the resolved locale. `regionCountry` / `regionState` resolve public holidays in `opening_hours`; every call site takes the derived `openingHoursAddress` export rather than a literal. See [`docs/contributing/frontend-guide.md`](docs/contributing/frontend-guide.md#language-attributes).

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
| `location.js` | User's current GPS position — `{ lat, lon, accuracy } \| null`. Written by LocateButton (manual + auto-locate), read by Map (location marker) and PlaygroundPanel (navigation origin). |
| `basemapCoverage.js` | Whether the view has left the basemap's detailed coverage — `null` (no limit declared) \| `false` \| `true`. Written by `Map.svelte` on moveend, read by `BasemapCoverageNotice`. |
| `urlFraming.js` | Whether an explicit region-URL framing (e.g. `/Lauterbach`) was applied on load — `null` (undecided / no region path) \| `true` (override resolved & framed) \| `false` (region path present but did not resolve). Written by `StandaloneApp`, read by `LocateButton` so auto-locate only suppresses GPS centering when a region framing actually took effect. On `false`, StandaloneApp skips the configured-region fit and leaves the default extent so the current location (if available) takes over. |
| `hubLoading.js` | Hub fan-out load progress — `{ loaded, total, settling }`. Written by `hubOrchestrator`, read by the hub UI to show a progress indicator. |
| `macroFiltered.js` | Per-backend filtered aggregate for the hub macro tier — `Map<backendUrl, {count, complete, partial, missing}> \| null`. `null` = no filter active (macro stays zero-fetch, rings use cached `get_meta`). Written by `hubOrchestrator` when a filter is active (sums each backend's filtered `get_playground_clusters` buckets), read by `MacroView` to override ring props. |
| `macroCoverage.js` | Macro-tier filter coverage — `{ answered, total, cantFilter[], settling } \| null`. `null` = no filter active. Written by `hubOrchestrator` (tracks how many in-scope backends actually applied the active filter; `cantFilter` lists those that couldn't — no bbox or 404; `settling` is true while the fan-out is still in flight so the banner doesn't flash mid-load). Read by `MacroView` (per-backend `_cantFilter` ring flag) and `MacroCoverageBanner` ("filter covers N of M regions" disclosure). |

### Components

#### Shared (`app/src/components/`)

| Component | Role |
|---|---|
| `Map.svelte` | OL map, all layers, click/hover handlers, standalone pitch layer (moveend) |
| `AppShell.svelte` | Top-level shell used by both modes: mounts Map, manages deeplink restore, wires keyboard shortcuts |
| `PlaygroundPanel.svelte` | Fetches and displays equipment/trees/POIs for selected playground; writes to `overlayFeaturesStore`; includes "Take me there" navigation button (geo: URL on mobile, OSM directions on desktop) |
| `EquipmentList.svelte` | Renders device/fitness/pitch/bench lists inside PlaygroundPanel |
| `NearbyPlaygrounds.svelte` | Shows nearest playgrounds to the selected one; hydrates polygon source on demand |
| `POIPanel.svelte` | Nearby POI list (cafés, toilets, etc.) shown inside PlaygroundPanel |
| `ReviewsPanel.svelte` | Community reviews for a selected playground (fetch + submit) |
| `PanoramaxViewer.svelte` | Street-level photos for a playground. Shows the **thumbnail** on selection and creates the viewer `<iframe>` only when the visitor activates it (#852) — an iframe gets its own browsing context on the provider's origin, with cookies and its own analytics, so it must not load on plain map use. The iframe carries `referrerpolicy="no-referrer"` and `sandbox="allow-scripts allow-same-origin"`, which is the narrowest set the viewer actually works under (probed: `allow-scripts` alone renders nothing) |
| `CommonsGallery.svelte` | Inline Wikimedia Commons photo gallery for a playground (from `wikimedia_commons` / `image` tags); thumbnails → fullscreen lightbox with CC attribution. Fetch + URL-safety logic in `app/src/lib/commons.js` |
| `HoverPreview.svelte` | Floating card on playground hover (desktop only) |
| `EquipmentTooltip.svelte` | Tooltip on equipment/pitch hover |
| `FilterPanel.svelte` | Filter dropdown; also contains "Ebenen" section for layer toggles |
| `FilterChips.svelte` | Active-filter chip bar shown below the search bar |
| `SearchBar.svelte` | Nominatim location search |
| `BottomSheet.svelte` | Swipeable bottom sheet used on mobile to surface PlaygroundPanel |
| `CompletenessLegend.svelte` | Map legend explaining the mapping-detail ramp and the photo glyph; swatches read `completenessPalette.js` directly |
| `DataContributionModal.svelte` | Modal prompting users to contribute data via MapComplete |
| `LegalContentModal.svelte` | Modal for imprint / legal content fetched from `get_legal()` |
| `LocateButton.svelte` | Button that pans map to user's GPS position; auto-locates on page load when geolocation permission is already granted |
| `MapCompleteLink.svelte` | Link to MapComplete for the selected playground; renders nothing when URL is falsy |
| `ui/` | Primitive UI components (Badge, Button, Card, Input, Sheet) |

#### Standalone mode (`app/src/standalone/`)

| File | Role |
|---|---|
| `StandaloneApp.svelte` | Full standalone layout: search bar, filter controls, zoom/locate buttons, mobile bottom sheet, desktop side panel |

#### Hub mode (`app/src/hub/`)

| File | Role |
|---|---|
| `HubApp.svelte` | Hub layout: macro view, instance panel, fan-out loading indicator |
| `InstancePanel.svelte` | Sidebar listing all registered backends with health status and region details |
| `InstancePanelDrawer.svelte` | Slide-in drawer wrapping InstancePanel on mobile |
| `MacroView.svelte` | Country-level OL layer — one point per backend at its bbox centroid with stacked-ring style |
| `MacroCoverageBanner.svelte` | Non-alarming "filter covers N of M regions" banner shown at the macro tier when a filter applied to only some backends (reads `macroCoverage`) |
| `hubOrchestrator.js` | Hub-mode tiered orchestrator — fans every tier fetch out across backends via `fanOut`, filtered by viewport and health |
| `registry.js` | Loads `registry.json`, polls `get_meta` every 5 min, exposes `backends` readable store, provides multi-backend nearest-playground fetcher |
| `federationHealth.js` | Polls `/federation-status.json` and merges per-backend health into the registry store |
| `fanOut.js` | Invokes a fetcher against every selected backend in parallel; surfaces results progressively via `onResult` callback |
| `osmIdDedup.js` | Deduplicates polygon-tier features across backends by `osm_id` (keeps the feature with the largest area) |

### Layers in Map.svelte

The map manages the basemap plus six overlay layers. Tiered playground delivery uses two of them — the active one is driven by `activeTierStore`:

1. **basemap** (zIndex 0) — raster `XYZ` from `basemapUrl`, or a `VectorTileLayer` styled via `ol-mapbox-style` when `basemapStyleUrl` is set. The library is dynamically imported, so raster deployments do not carry it. **The default is vector and same-origin**: the container serves `/basemap/style.local.json`, whose tiles, sprites and glyphs all resolve under `/basemap/` on this instance. nginx serves the vendored files from disk and proxies the rest to `BASEMAP_UPSTREAM` through a persistent cache, so the visitor's browser never contacts the tile server. `BASEMAP_PROXY` is a separate, older raster-only mechanism: it derives the upstream origin and tile path from `BASEMAP_URL` and rewrites `basemapUrl` to the same-origin `/tiles/` path.
2. **macroOutlineLayer** (zIndex -1) — bundled Natural Earth world outline (`app/public/basemap/world-110m.json`), fetched lazily on the first macro tier and visible only there, so the area outside the basemap tileset's coverage is not silently blank. It sits *below* the basemap: at zIndex 1 it washed the basemap out everywhere the basemap does render.
3. **playgroundLayer** (zIndex 10) — polygon tier (zoom > `clusterMaxZoom`, default 13). Playground polygons styled by `playgroundStyleFn`, filtered by `filterStore`. Visible only when `$activeTierStore === 'polygon'`.
4. **clusterLayer** (zIndex 12) — cluster tier (zoom ≤ `clusterMaxZoom`). Server-bucketed cluster rings + single-child dots rendered via the canvas `stackedRingRenderer` in `app/src/lib/clusterStyle.js`. Visible only when `$activeTierStore === 'cluster'`.
5. **treeLayer** (zIndex 15) — natural=tree dots, shown when a playground is selected.
6. **equipmentLayer** (zIndex 20) — playground devices/pitches/benches, shown when a playground is selected.
7. **pitchLayer** (zIndex 9) — standalone pitches outside any playground, loaded on `moveend` at zoom ≥ 12, visibility controlled by `filterStore.standalonePitches`.
8. **locationLayer** (zIndex 30) — user's GPS position. Pulsing blue dot (`#007aff`) inside a white ring at lower zoom levels; translucent accuracy circle at high zoom (top 3 levels). Driven by `location` store.

Equipment and tree layers are driven by `overlayFeaturesStore` (written by PlaygroundPanel, read by Map). Cluster vs polygon visibility is driven by `activeTierStore` (written by the orchestrator).

### Zoom-tier orchestrator (`app/src/lib/tieredOrchestrator.js`)

Standalone's data path is no longer a one-shot `fetchPlaygrounds` on mount. Instead `attachTieredOrchestrator(...)` wires a debounced (300 ms) `moveend` handler that:

1. Computes the active tier from `view.getZoom()` against `clusterMaxZoom`.
2. Publishes the tier via `activeTierStore`.
3. Aborts any in-flight request via `AbortController`.
4. Fetches the tier's RPC (`fetchPlaygroundClusters` or `fetchPlaygroundsBbox`) and populates the corresponding source.
5. Falls back to the legacy `fetchPlaygrounds(relation_id)` once if a tier RPC 404s (backend skew during a deploy).

Deeplinks at low zoom use the new `fetchPlaygroundByOsmId` (RPC `get_playground(osm_id)`) to hydrate the polygon source on demand without waiting for a polygon-tier moveend.

### Region URL resolution (`app/src/lib/regionUrl.js`)

`resolveRegionFromPath(pathname, { near })` parses a single-segment URL path (e.g. `/fulda`), geocodes it via Nominatim (`featureType=settlement`), and returns `{ name, extent, osmId }` or `null`. Skips reserved prefixes (`api`, `legal`, `metrics`). Used by both StandaloneApp and HubApp on page load to support shareable region URLs like `spieli.eu/fulda`. `near` (optional `[lon, lat]`) is the deployment's configured region centroid; when supplied it disambiguates same-named settlements by nearest bbox centroid (so a Fulda instance's `/Lauterbach` resolves to Lauterbach (Hessen), not the higher-importance Lauterbach in Czechia). StandaloneApp passes the configured region's centre; HubApp omits it.

Two helpers support auto-locate coordination: `isRegionPath(pathname)` is the synchronous structural predicate (single non-reserved, non-dotted segment) shared with LocateButton; `shouldAutoCenterOnLocate({ hasDeeplink, regionPath, framingApplied })` is the pure policy deciding whether auto-locate may pan to the GPS fix — a deeplink hash or a *resolved* region framing suppresses centering, but a failed region path (typo) does not. The framing outcome flows through the `urlFraming` store.

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
- `get_legal(type)` — imprint / legal text fetched from the `legal_content` table
- `get_playgrounds(relation_id)` — **deprecated** region-scoped variant; SQL `COMMENT` flags it for removal

The `playground_stats` materialised view is rebuilt with each `make db-apply` and carries the per-playground `completeness` (`'complete' | 'partial' | 'missing'`) plus its two inputs `has_equipment` / `has_info` and the separate `has_photo` signal — the rule mirrors `app/src/lib/completeness.js` exactly, and the db-smoke workflow fails if the two drift.

**Mapping detail** (`completeness`) = `has_equipment AND has_info` → `complete`, either one → `partial`, neither → `missing`. A photo is **not** an input; it is an additive marker (camera glyph + panel badge) driven by `hasPhotoSignal()`. The three identifiers are wire values and deliberately differ from their user-facing labels — `complete` displays as "detailed", `partial` as "basic", `missing` as "not mapped yet" (`mappingDetail.*` in `locales/*.json`). Never rename the identifiers: mixed-version federation depends on them. All colours live in `app/src/lib/completenessPalette.js`; nothing else may hardcode them. See [`docs/reference/completeness.md`](docs/reference/completeness.md).

Run `make db-apply` after modifying `api.sql` to apply changes without a full re-import.

**After any change to `importer/api.sql` or `db/init.sql`, verify with a fresh-volume import:**
```bash
make down && docker volume rm spieli_pgdata spieli_pgdata2 && make up
```
This catches ordering bugs (e.g. a function referencing a table defined later in the file) that `make db-apply` on an existing volume silently passes.

### Styles (`app/src/lib/vectorStyles.js`)

- `playgroundStyleFn` — playground polygon fill/stroke, colour-coded by mapping detail (colours from `completenessPalette.js`); appends a camera glyph when `hasPhotoSignal(props)` is true
- `equipmentLayerStyleFn` — equipment points/polygons (green for pitches, teal for fitness, grey for devices)
- `treeStyle` — small green dot for trees
- `locationDotStyleFn` — pulsing blue dot for user's GPS position (60 pre-computed styles, 2s cycle)
- `locationAccuracyStyle` — translucent blue circle showing GPS accuracy in real meters

## Ops scripts (`scripts/`)

| Script | Purpose |
|---|---|
| `upgrade-stacks.sh` | Sequential upgrade of all spieli stacks on a single VPS. Edit the `STACKS` array at the top. For data-node stacks the order is load-bearing (#800): **stop** the importer, `API_ONLY=1` with the new image as sole writer, `up -d --force-recreate importer`, then the app, then verify. A plain `up -d importer` restarts the old container, which then re-applies the *old* schema on startup and becomes the last writer — the v0.9.0 sweep left a stack running the new app against the old schema that way, with two filters silently wrong. `api.sql` also takes a session-level advisory lock, which covers the writers this script cannot order (Watchtower, `make db-apply`, a manual API_ONLY run) — but only the *apply*, not the osm2pgsql phase of a full import, so a `db-apply` racing an in-flight import is still unguarded. Verification polls rather than sleeping, because the recreated daemon re-applies the schema on startup and the API is legitimately unavailable while it does. Pure hub stacks skip every importer step. |
| `setup-germany-backends.sh` | Bootstraps all 15 non-Hessen German Bundesland data-node stacks and wires them into a hub with Traefik. One-time setup script. |
| `migrate-hub-hessen.sh` | Splits a combined hub+Hessen stack into a pure hub (`DEPLOY_MODE=ui`) and a dedicated Hessen data-node. Two-phase: Phase 1 creates `~/spieli-hessen` and runs the first import; Phase 2 (`--convert`) updates `registry.json`, switches hub to ui-only, and removes orphaned volumes. |

## Build tools (`tools/`)

Asset generators. Their output is committed, so a rebuild should be diffed
rather than trusted. Most run via `make basemap-assets`; the equipment-image
resolver has its own target because it talks to the MediaWiki APIs rather than
to a tile server.

| Script | Purpose |
|---|---|
| `build-basemap-style.py` | Rebuilds both style variants: `style.json` (upstream URLs, used by `make dev`) and `style.local.json` (all assets under `/basemap/`, used by the container). Built from an upstream MapLibre style (default OpenFreeMap Bright). Desaturates the green landcover fills and drops the `poi` symbol layers, because spieli encodes completeness in green/amber/red and a green basemap competes with its own data. `--asset-base` rewrites tile/glyph/sprite URLs to a local origin; without it the committed style still fetches tiles, fonts and sprites from the upstream host. |
| `build-basemap-fonts.py` | Vendors the @fontsource webfonts the style's `text-font` stacks need (`app/public/basemap/fonts/`), latin + latin-ext. `ol-mapbox-style` renders labels from a webfont CSS template, **not** from the style's `glyphs` endpoint, so a missing weight is invisible: labels fall back to a system font and every page load asks the upstream for a file it does not have. The build asserts coverage against the style and fails if a stack has no vendored file. |
| `build-equipment-images.py` | Resolves the equipment illustrations' `File:` names to real file URLs, writing `app/src/lib/equipmentImages.generated.json`. Run via `make equipment-images`, **not** `make basemap-assets`. Follows the `Special:FilePath` redirect chain once at build time, because that chain cannot be proxied without allowing `/w/index.php` through the cache. Resolves against Commons then the OSM wiki, and **fails on a name that resolves on neither** — 14 currently do not and are pinned in `KNOWN_MISSING`, so a fifteenth is a build failure rather than a silently blank illustration. Also records author, licence and file-page URL, since serving the bytes through our own origin makes the CC attribution obligation ours. |
| `build-macro-outline.py` | Rebuilds `app/public/basemap/world-110m.json` from Natural Earth 1:110m — the world outline shown under the hub macro tier, so areas outside the federation's tileset are not blank. |

## Documentation

When adding or changing something covered by the `docs/` structure, update the relevant page (or create a new one and add it to `mkdocs.yml`). Also update this file when adding stores, components, API functions, make targets, or ops scripts. Relevant mappings:

- New API RPC → `docs/reference/api.md`
- New config env var → `docs/ops/configuration.md`
- New OSM tag / import rule → `docs/contributing/import-pipeline.md`
- New frontend store or component → `docs/contributing/frontend-guide.md`
- New make target or dev workflow step → `docs/contributing/local-dev.md`
- New troubleshooting scenario → `docs/ops/troubleshooting.md`

Run `make docs-build` before pushing to catch broken links.
