# Configuration Reference

Every variable a stack reads from `.env`. The installer writes most of them; edit `.env` afterwards and recreate the affected containers ([Configure the instance → Applying changes](configure.md#applying-changes)). How the settings fit together — language, memory, basemap, external services — is explained in [Configure the instance](configure.md).

**Applies to** names the container that reads the variable, which is also the one to recreate after a change; *Compose* means Docker Compose itself reads it. A variable for a container your `DEPLOY_MODE` does not start has no effect ([Deployment modes](../reference/deployment-modes.md)).

## Role and region

| Variable | Default | Applies to | Description |
|---|---|---|---|
| `DEPLOY_MODE` | — | Compose | Deployment mode: `data-node`, `ui`, or `data-node-ui`. Written by the installer. |
| `APP_MODE` | `standalone` | app | `standalone` (regional map) or `hub` (aggregation map). `hub` reads its backends from `REGISTRY_URL`; it runs with `DEPLOY_MODE=ui`, or with `data-node-ui` to serve one region of its own as well. See [Federated Deployment](federated-deployment.md). |
| `OSM_RELATION_ID` | `62700` | app, importer | OSM relation ID of the region to display |
| `PBF_URL` | Hessen extract | importer | Geofabrik `.osm.pbf` download URL |
| `API_BASE_URL` | `/api` | app | Base URL of the PostgREST API. Set to the remote URL for `ui` mode (e.g. `https://data.example.com/api`). |
| `APP_PORT` | `8080` | Compose | Host port the app is exposed on |
| `POSTGRES_PASSWORD` | `CHANGE_ME` (installed stack), `change-me` (source) | db, importer, PostgREST | Database password. The installer generates a random one (`openssl rand -hex 32`); **change it** if you set the stack up by hand. Hex avoids characters that break the connection URI |

## Map and interface

| Variable | Default | Applies to | Description |
|---|---|---|---|
| `APP_NAME` | `spieli` | app | Name of the installed app (Chrome/Edge "Install app", Safari "Add to Dock", iOS "Add to Home Screen") — what the Dock, start menu and home screen show. Each stack installs as its own app, so give each region its own, e.g. `spieli Fulda`. Written into `/manifest.webmanifest` at container start. |
| `DEFAULT_LOCALE` | *(browser)* | app | UI language. Leave empty to auto-detect from the visitor's browser. Supported: `de`, `en`, `sk`. An unsupported value falls back to `en`. |
| `REGION_LANG` | `de` | app | Language your region's playgrounds are **named** in (BCP 47). Not the same as `DEFAULT_LOCALE` — see [Language settings](configure.md#language-settings). |
| `REGION_COUNTRY` | `de` | app | Country whose public-holiday calendar `opening_hours` values are evaluated against (ISO 3166-1 alpha-2). |
| `REGION_STATE` | *(unset)* | app | State for holiday calendars that vary by state: the ISO 3166-2 code (`he` or `DE-HE`) or the state's name (`Hessen`, `Thüringen`; letter case does not matter). Leave empty to keep the library default. Must be a state the [`opening_hours` library](https://github.com/opening-hours/opening_hours.js#holidays) has holidays for; anything else is ignored with a console warning. |
| `MAP_ZOOM` | `12` | app | Initial map zoom level. The installer writes `12` (standalone) or `6` (hub) |
| `MAP_MIN_ZOOM` | `10` | app | Minimum zoom level. The installer writes `7` (standalone) or `4` (hub) |
| `POI_RADIUS_M` | `5000` | app | Radius in metres for nearby POI search |
| `REGION_PLAYGROUND_WIKI_URL` | Generic OSM wiki | app | Wiki page linked in the "Contribute data" modal |
| `REGION_CHAT_URL` | *(hidden)* | app | Community chat link shown in the "Contribute data" modal; leave empty to hide the button. In hub mode this is the hub operator's own channel — backends do not contribute one. |
| `PARENT_ORIGIN` | *(unset)* | app | **Currently has no effect.** It is written into `config.js` as `parentOrigin`, but no part of the frontend reads it. Appearing in a hub needs nothing on the data-node beyond a public `/api/` with CORS; leave it unset. Removal tracked in [#1061](https://github.com/mfuhrmann/spieli/issues/1061) |

## Basemap

| Variable | Default | Applies to | Description |
|---|---|---|---|
| `BASEMAP_UPSTREAM` | `https://tiles.openfreemap.org` | app | Where the bundled style's tiles and sprites are fetched from and cached. Origin only (`scheme://host[:port]`), no path. Point it at your own tileserver to stop using a public one — a two-step swap, see [Basemap](basemap-and-services.md#basemap). |
| `BASEMAP_URL` | *(unset)* | app | Raster basemap as an OpenLayers XYZ template. Placeholders are substituted by name, so a provider using `{z}/{y}/{x}` needs no code change. See [Basemap](basemap-and-services.md#basemap). |
| `BASEMAP_STYLE_URL` | *(unset — the app falls back to `/basemap/style.json`)* | app | MapLibre style document, rendered as vector tiles. Takes precedence over `BASEMAP_URL`. See [Basemap](basemap-and-services.md#basemap). |
| `BASEMAP_COVERAGE_BBOX` | *(unset — no limit)* | app | `minLon,minLat,maxLon,maxLat` where the basemap has **detailed** data. Only needed for a regional tileset; unset is correct for a planet one. See [Regional tilesets](basemap-and-services.md#regional-tilesets). |
| `BASEMAP_ATTRIBUTION` | *(the tile server's own credit)* | app | Overrides the attribution the map shows. Leave unset and the credit comes from the tile server itself, which is correct for any upstream. **Required** whenever `BASEMAP_URL` or `BASEMAP_STYLE_URL` is set — the container refuses to start otherwise. Trusted HTML: rendered into the page as-is. |
| `BASEMAP_PROXY` | *(unset)* | app | `true` serves tiles through this instance, so the browser fetches from same-origin `/tiles/` and never contacts the provider. The upstream origin **and** the tile path are derived from `BASEMAP_URL`. See [Basemap](basemap-and-services.md#basemap). |
| `BASEMAP_CACHE_MAX_SIZE` | `4g` | app | Disk ceiling per cache zone. The basemap cache always exists; enabling `BASEMAP_PROXY` adds a second zone sized from the same value, so the on-disk total can be twice this. |
| `BASEMAP_CACHE_KEYS_ZONE` | `64m` | app | nginx cache key zone. Holds roughly 8000 keys per MB and **binds before disk does** — a large `BASEMAP_CACHE_MAX_SIZE` behind a small keys zone yields a cache that stays almost empty. |
| `BASEMAP_CACHE_INACTIVE` | `90d` | app | How long an unrequested tile survives. nginx defaults to 10 minutes, which evicts tiles regardless of free space — far too short for basemap tiles. |

## External services and CSP

| Variable | Default | Applies to | Description |
|---|---|---|---|
| `PROXY_NOMINATIM` | `true` | app | Fetch geocoding server-side through `/ext/nominatim/` so the browser never contacts Nominatim. `false` restores direct browser requests. See [External-service proxies](basemap-and-services.md#external-service-proxies). |
| `PROXY_COMMONS` | `true` | app | Fetch the Commons API and the image bytes server-side (`/ext/commons/`, `/ext/wikimedia/`). |
| `PROXY_MANGROVE` | `true` | app | Fetch and submit reviews server-side through `/ext/mangrove/`. Submission still verifies at Mangrove: the JWT signature covers its own claims, so the proxy is transparent to it. |
| `OSM_NOTES_URL` | *(empty — the public OSM API)* | app | Where "Missing a playground?" hints go as anonymous [OSM notes](https://wiki.openstreetmap.org/wiki/Notes) (#1000). An `https://` origin with no path. `false` turns the anonymous hint off; the MapComplete option stays. Not proxied: the browser sends the note itself, only when the visitor presses Send, and the host is added to the generated CSP and privacy page. For testing, use the OSM dev sandbox `https://master.apis.dev.openstreetmap.org` so no real notes are created. |
| `EXT_CACHE_MAX_SIZE` | `2g` | app | Disk ceiling for the shared `/ext/` cache. One zone serves all four services; the default cache key includes the upstream host, so two upstreams cannot collide on a path. |
| `EXT_CACHE_KEYS_ZONE` | `16m` | app | Key zone for the `/ext/` cache. Same caveat as the basemap one: it binds before disk does. |
| `EXT_CACHE_INACTIVE` | `30d` | app | How long an unrequested `/ext/` response survives. |
| `CSP_CONNECT_EXTRA` | *(unset)* | app | Extra origins for the generated `connect-src`, space-separated. Needed when a hub fetches `registry.json` from a URL at runtime, so the entrypoint cannot read it to discover backends. Rejected at startup if malformed. See [Content Security Policy](security.md#nginx-security-headers). |
| `CSP_IMG_EXTRA` | *(unset)* | app | Extra origins for the generated `img-src`, space-separated. Needed when images are rendered from an origin the generator cannot discover. Rejected at startup if malformed. |

## Import and schedule

| Variable | Default | Applies to | Description |
|---|---|---|---|
| `OSM2PGSQL_THREADS` | `4` | importer | CPU threads for the osm2pgsql data-loading step |
| `REIMPORT_INTERVAL_MIN_DAYS` | *(unset)* | importer | Minimum days between automatic OSM re-imports (daemon mode). Leave unset to run one-shot (import once and exit). Must be set together with `REIMPORT_INTERVAL_MAX_DAYS`. |
| `REIMPORT_INTERVAL_MAX_DAYS` | *(unset)* | importer | Maximum days between automatic OSM re-imports. The importer picks a random interval in `[MIN, MAX]` days after each successful run. Recommended: `2`–`10`. Must be set together with `REIMPORT_INTERVAL_MIN_DAYS`. |
| `REIMPORT_JITTER_HOURS` | `6` | importer | Daemon mode: a random 0–N hours added to every scheduled wait, and before an import that is already overdue at startup, so stacks that once imported together (after an upgrade sweep or reboot) drift apart instead of sharing a slot (#882). An overdue import is never held back past `MAX_DAYS` + this window. `0` disables it; with `MIN == MAX` the importer then warns. Not a whole number → default, with a log warning. |
| `REIMPORT_STARTUP_JITTER_MAX_HOURS` | `0` | importer | On a **fresh DB** (no prior import recorded), sleep a random duration between `0` and this many hours before the first import. Prevents a thundering herd when many backends are deployed simultaneously. Has no effect on restarts or routine cycles (that is `REIMPORT_JITTER_HOURS`). Recommended value for multi-backend deployments: `6`. Before #882 compose did not pass it to the importer, so a value in `.env` had no effect. |
| `OSM_BBOX` | *(auto)* | importer | Manual bounding box for the osmium pre-filter (`west,south,east,north`). Skips Nominatim lookup when set. **Only effective when deploying from source** (`compose.yml`); the installed `compose.prod.yml` does not pass it yet ([#1061](https://github.com/mfuhrmann/spieli/issues/1061)). |
| `OSM_BBOX_PADDING` | `0.15` | importer | Degrees of padding added to each side of the Nominatim bbox (≈ 15 km). Only effective when deploying from source, see `OSM_BBOX`. |
| `OSM_PREFILTER_MIN_MB` | `20` | importer | Source PBF files smaller than this many MB skip the osmium pre-filter step. Only effective when deploying from source, see `OSM_BBOX`. |

## Database tuning

| Variable | Default | Applies to | Description |
|---|---|---|---|
| `PG_MAX_PARALLEL_WORKERS` | `2` | importer | Total parallel worker processes available to PostgreSQL (set ≤ CPU count). Persisted via `ALTER SYSTEM` in `api.sql`. |
| `PG_MAX_PARALLEL_WORKERS_PER_GATHER` | `2` | importer | Parallel workers per query. Must be ≤ `PG_MAX_PARALLEL_WORKERS`. |
| `PG_MAX_PARALLEL_MAINTENANCE_WORKERS` | `2` | importer | Parallel workers for `CREATE INDEX` / `VACUUM`. Must be ≤ `PG_MAX_PARALLEL_WORKERS`. |
| `PG_MAINTENANCE_WORK_MEM` | `256MB` | importer | Memory per maintenance operation (index builds etc.). Total peak ≈ `value × (PG_MAX_PARALLEL_MAINTENANCE_WORKERS + 1)`. **Must include a unit suffix** (`kB`, `MB`, `GB`, `TB`); a bare integer is interpreted as kilobytes by PostgreSQL. |
| `PG_WORK_MEM` | `32MB` | importer | Memory per sort/hash operation inside parallel workers. Total peak per query ≈ `value × (PG_MAX_PARALLEL_WORKERS_PER_GATHER + 1) × hash/sort nodes`. **Must include a unit suffix** (`kB`, `MB`, `GB`, `TB`); a bare integer is interpreted as kilobytes by PostgreSQL. |

## Hub

| Variable | Default | Applies to | Description |
|---|---|---|---|
| `REGISTRY_URL` | `/registry.json` | app | URL of the registry JSON listing backends. Default is same-origin; bind-mount or bake in a custom file. See [Federated Deployment](federated-deployment.md) and [`registry.json` reference](../reference/registry-json.md). |
| `HUB_POLL_INTERVAL` | `300` | app | Seconds between the hub's refreshes of each backend's `get_meta` (counts, data age, health) and of `/federation-status.json`. The registry itself is read once per page load. Bare integer, no unit suffix. |
| `MACRO_MAX_ZOOM` | `7` | app | Maximum zoom level at which the macro view (one summary ring per backend) is shown instead of individual cluster circles. Increase for deployments with many backends covering a small geographic area; decrease for sparse deployments covering a large area. **Currently has no effect:** no compose file passes it to the container ([#1061](https://github.com/mfuhrmann/spieli/issues/1061)). |

## Legal pages

| Variable | Default | Applies to | Description |
|---|---|---|---|
| `SITE_URL` | *(unset)* | app, importer | Public base URL of this instance (e.g. `https://spieli.example.com`). Used to construct absolute `impressum_url` and `privacy_url` in `get_meta()` so the Hub can discover legal pages without an operator-supplied override URL. `get_meta()` emits the legacy paths `SITE_URL + /impressum` and `+ /datenschutz`, which the app permanently redirects to the canonical `/legal/impressum` and `/legal/datenschutz`. Leave unset for purely local testing. |
| `IMPRESSUM_NAME` | *(unset)* | app, importer | Full name of the legally responsible person or organisation. Required to generate the Impressum (with `IMPRESSUM_ADDRESS`) and the Datenschutz page (with `IMPRESSUM_EMAIL`). On a data-node the importer also stores the generated text for the hub. |
| `IMPRESSUM_ORG` | *(unset)* | app, importer | Organisation name (if different from `IMPRESSUM_NAME`). Optional; omitted from the Impressum when empty. |
| `IMPRESSUM_ADDRESS` | *(unset)* | app, importer | Street address and city (e.g. `Musterstraße 1, 36037 Fulda`). Required alongside `IMPRESSUM_NAME`. |
| `IMPRESSUM_EMAIL` | *(unset)* | app, importer | Contact email address. Required for the Datenschutz page; shown on the Impressum when set. |
| `IMPRESSUM_PHONE` | *(unset)* | app, importer | Contact phone number. Optional; omitted from the Impressum when empty. |
| `IMPRESSUM_URL` | *(unset)* | app, importer | Override URL for an existing Impressum page (e.g. `https://example.com/impressum`). When set, the generated `impressum.html` is skipped and this URL is used directly in `get_meta()` and `config.js`. |
| `PRIVACY_URL` | *(unset)* | app, importer | Override URL for an existing Datenschutzerklärung page. When set, the generated `datenschutz.html` is skipped. |

## Compose profiles

Which containers each `DEPLOY_MODE` starts, and the `auto-update` profile: [Deployment modes → Compose profiles](../reference/deployment-modes.md#compose-profiles).
