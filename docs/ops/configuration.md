# Configuration Reference

All variables are set in `.env` (copy from `.env.example`). The installer generates this file interactively — you can edit it afterwards to change any setting.

## Variables

| Variable | Default | Mode | Description |
|---|---|---|---|
| `DEPLOY_MODE` | — | — | Deployment mode: `data-node`, `ui`, or `data-node-ui`. Written by the installer. |
| `APP_MODE` | `standalone` | both | App mode: `standalone` (regional map) or `hub` (aggregation map). `hub` requires `REGISTRY_URL` and must be paired with `DEPLOY_MODE=ui`. See [Federated Deployment](federated-deployment.md). |
| `OSM_RELATION_ID` | `62700` | data-node, data-node-ui | OSM relation ID of the region to display |
| `OSM_RELATION_ID2` | `454881` | dev only | OSM relation ID for the second local backend (`db2`); used by `make import2` / `make seed-load2` (source clone only) |
| `PBF_URL` | Hessen extract | data-node, data-node-ui | Geofabrik `.osm.pbf` download URL |
| `REGISTRY_URL` | `/registry.json` | hub | URL of the registry JSON listing backends. Default is same-origin; bind-mount or bake in a custom file. See [Federated Deployment](federated-deployment.md) and [`registry.json` reference](../reference/registry-json.md). |
| `API_BASE_URL` | `/api` | ui, data-node-ui | Base URL of the PostgREST API. Set to the remote URL for `ui` mode (e.g. `https://data.example.com/api`). |
| `REGION_PLAYGROUND_WIKI_URL` | Generic OSM wiki | ui, data-node-ui | Wiki page linked in the "Contribute" modal |
| `REGION_CHAT_URL` | *(hidden)* | ui, data-node-ui, hub | Community chat link shown in the "Contribute data" modal; leave empty to hide the button. In hub mode this is the hub operator's own channel — backends do not contribute one. |
| `DEFAULT_LOCALE` | *(browser)* | ui, data-node-ui, hub | UI language. Leave empty to auto-detect from the visitor's browser. Supported: `de`, `en`, `sk`. An unsupported value falls back to `en`. |
| `REGION_LANG` | `de` | ui, data-node-ui, hub | Language your region's playgrounds are **named** in (BCP 47). Not the same as `DEFAULT_LOCALE` — see [Language settings](#language-settings). |
| `REGION_COUNTRY` | `de` | ui, data-node-ui, hub | Country whose public-holiday calendar `opening_hours` values are evaluated against (ISO 3166-1 alpha-2). |
| `REGION_STATE` | *(unset)* | ui, data-node-ui, hub | Sub-country code for holiday calendars that vary by state (e.g. `he` for Hessen). Leave empty to keep the library default. Codes are defined by the [`opening_hours` library](https://github.com/opening-hours/opening_hours.js#holidays), not by a public standard. |
| `MAP_ZOOM` | `12` | ui, data-node-ui | Initial map zoom level |
| `MAP_MIN_ZOOM` | `10` | ui, data-node-ui | Minimum zoom level |
| `BASEMAP_UPSTREAM` | `https://tiles.openfreemap.org` | ui, data-node-ui | Where the bundled style's tiles and sprites are fetched from and cached. Origin only (`scheme://host[:port]`), no path. Point it at your own tileserver to stop using a public one — a two-step swap, see [Basemap](#basemap). |
| `BASEMAP_URL` | *(unset)* | ui, data-node-ui | Raster basemap as an OpenLayers XYZ template. Placeholders are substituted by name, so a provider using `{z}/{y}/{x}` needs no code change. See [Basemap](#basemap). |
| `BASEMAP_STYLE_URL` | *(unset — the app falls back to `/basemap/style.json`)* | ui, data-node-ui | MapLibre style document, rendered as vector tiles. Takes precedence over `BASEMAP_URL`. See [Basemap](#basemap). |
| `BASEMAP_COVERAGE_BBOX` | *(unset — no limit)* | ui, data-node-ui | `minLon,minLat,maxLon,maxLat` where the basemap has **detailed** data. Only needed for a regional tileset; unset is correct for a planet one. See [Regional tilesets](#regional-tilesets). |
| `BASEMAP_ATTRIBUTION` | *(the tile server's own credit)* | ui, data-node-ui | Overrides the attribution the map shows. Leave unset and the credit comes from the tile server itself, which is correct for any upstream. **Required** whenever `BASEMAP_URL` or `BASEMAP_STYLE_URL` is set — the container refuses to start otherwise. Trusted HTML: rendered into the page as-is. |
| `BASEMAP_PROXY` | *(unset)* | ui, data-node-ui | `true` serves tiles through this instance, so the browser fetches from same-origin `/tiles/` and never contacts the provider. The upstream origin **and** the tile path are derived from `BASEMAP_URL`. See [Basemap](#basemap). |
| `BASEMAP_CACHE_MAX_SIZE` | `4g` | ui, data-node-ui | Disk ceiling per cache zone. The basemap cache always exists; enabling `BASEMAP_PROXY` adds a second zone sized from the same value, so the on-disk total can be twice this. |
| `BASEMAP_CACHE_KEYS_ZONE` | `64m` | ui, data-node-ui | nginx cache key zone. Holds roughly 8000 keys per MB and **binds before disk does** — a large `BASEMAP_CACHE_MAX_SIZE` behind a small keys zone yields a cache that stays almost empty. |
| `BASEMAP_CACHE_INACTIVE` | `90d` | ui, data-node-ui | How long an unrequested tile survives. nginx defaults to 10 minutes, which evicts tiles regardless of free space — far too short for basemap tiles. |
| `PROXY_NOMINATIM` | `true` | ui, data-node-ui | Fetch geocoding server-side through `/ext/nominatim/` so the browser never contacts Nominatim. `false` restores direct browser requests. See [External-service proxies](#external-service-proxies). |
| `PROXY_COMMONS` | `true` | ui, data-node-ui | Fetch the Commons API and the image bytes server-side (`/ext/commons/`, `/ext/wikimedia/`). |
| `PROXY_MANGROVE` | `true` | ui, data-node-ui | Fetch and submit reviews server-side through `/ext/mangrove/`. Submission still verifies at Mangrove: the JWT signature covers its own claims, so the proxy is transparent to it. |
| `EXT_CACHE_MAX_SIZE` | `2g` | ui, data-node-ui | Disk ceiling for the shared `/ext/` cache. One zone serves all four services; the default cache key includes the upstream host, so two upstreams cannot collide on a path. |
| `EXT_CACHE_KEYS_ZONE` | `16m` | ui, data-node-ui | Key zone for the `/ext/` cache. Same caveat as the basemap one: it binds before disk does. |
| `EXT_CACHE_INACTIVE` | `30d` | ui, data-node-ui | How long an unrequested `/ext/` response survives. |
| `CSP_CONNECT_EXTRA` | *(unset)* | ui, data-node-ui | Extra origins for the generated `connect-src`, space-separated. Needed when a hub fetches `registry.json` from a URL at runtime, so the entrypoint cannot read it to discover backends. Rejected at startup if malformed. See [Content Security Policy](security.md#nginx-security-headers). |
| `CSP_IMG_EXTRA` | *(unset)* | ui, data-node-ui | Extra origins for the generated `img-src`, space-separated. Needed when images are rendered from an origin the generator cannot discover. Rejected at startup if malformed. |
| `PARENT_ORIGIN` | *(own origin)* | data-node-ui | Allowed origin for `postMessage` events — set to the Hub's full origin when embedding in a Hub |
| `APP_PORT` | `8080` | ui, data-node-ui | Host port the app is exposed on |
| `POSTGRES_PASSWORD` | `change-me` | data-node, data-node-ui | Database password — **change in production** |
| `POI_RADIUS_M` | `5000` | ui, data-node-ui | Radius in metres for nearby POI search |
| `OSM2PGSQL_THREADS` | `4` | data-node, data-node-ui | CPU threads for the osm2pgsql data-loading step |
| `PG_MAX_PARALLEL_WORKERS` | `2` | data-node, data-node-ui | Total parallel worker processes available to PostgreSQL (set ≤ CPU count). Persisted via `ALTER SYSTEM` in `api.sql`. |
| `PG_MAX_PARALLEL_WORKERS_PER_GATHER` | `2` | data-node, data-node-ui | Parallel workers per query. Must be ≤ `PG_MAX_PARALLEL_WORKERS`. |
| `PG_MAX_PARALLEL_MAINTENANCE_WORKERS` | `2` | data-node, data-node-ui | Parallel workers for `CREATE INDEX` / `VACUUM`. Must be ≤ `PG_MAX_PARALLEL_WORKERS`. |
| `PG_MAINTENANCE_WORK_MEM` | `256MB` | data-node, data-node-ui | Memory per maintenance operation (index builds etc.). Total peak ≈ `value × (PG_MAX_PARALLEL_MAINTENANCE_WORKERS + 1)`. **Must include a unit suffix** (`kB`, `MB`, `GB`, `TB`); a bare integer is interpreted as kilobytes by PostgreSQL. |
| `PG_WORK_MEM` | `32MB` | data-node, data-node-ui | Memory per sort/hash operation inside parallel workers. Total peak per query ≈ `value × (PG_MAX_PARALLEL_WORKERS_PER_GATHER + 1) × hash/sort nodes`. **Must include a unit suffix** (`kB`, `MB`, `GB`, `TB`); a bare integer is interpreted as kilobytes by PostgreSQL. |

### Language settings

`DEFAULT_LOCALE` and `REGION_LANG` answer different questions and are
deliberately independent:

| | Question | Affects |
|---|---|---|
| `DEFAULT_LOCALE` | What language is the **interface** in? | Every translated label, and the document's `lang` attribute |
| `REGION_LANG` | What language are the **playgrounds named** in? | The `lang` attribute on OSM-derived names |

A Fulda instance serving an English-speaking audience sets
`DEFAULT_LOCALE=en` and keeps `REGION_LANG=de`: the buttons read "Filter",
but the playgrounds are still called *Spielplatz Am Rosengarten*. Screen
readers use these attributes to pick a pronunciation, and CSS hyphenation
uses `REGION_LANG` to break long compound names correctly.

Set `REGION_LANG` to the language your OSM `name` tags are actually written
in. A bilingual region gets one value for all names — per-object language is
not derivable from OSM data.

`REGION_COUNTRY` and `REGION_STATE` are separate again: they only affect how
public holidays in `opening_hours` values are resolved. A German-language
deployment serving Austrian playgrounds sets `REGION_LANG=de` with
`REGION_COUNTRY=at`.

> **How `PG_*` values are applied.** The importer runs `ALTER SYSTEM SET …`
> at the top of `api.sql`, then `SELECT pg_reload_conf()`. The values are
> persisted to `postgresql.auto.conf` inside the data volume and apply to
> every connection — including PostgREST — without restarting the database
> container. To re-tune, edit `.env` and re-run the importer:
> ```bash
> docker compose --profile <mode> run --rm importer
> ```

### RAM sizing

Defaults are sized for a **2-core / 4 GB host** (peak ≈ 1.5 GB during the
heaviest single operation, `CREATE INDEX`). Recommended values per host
size:

| Host RAM / cores | `WORKERS` / `PER_GATHER` / `MAINT` | `MAINT_WORK_MEM` | `WORK_MEM` | Approx. peak |
|---|---|---|---|---|
| 4 GB / 2 core (default) | 2 / 2 / 2 | 256MB | 32MB | ~1.5 GB |
| 8 GB / 4–6 core         | 4 / 2 / 4 | 512MB | 64MB | ~3 GB |
| 16 GB / 8 core          | 8 / 4 / 4 | 1GB   | 128MB | ~6 GB |

The driver of the peak is `CREATE INDEX` parallelism (≈ `MAINT_WORK_MEM ×
(MAINT_WORKERS + 1)`) followed by the materialised view rebuild (≈
`WORK_MEM × (PER_GATHER + 1) × ~4 hash/sort nodes`). These run sequentially,
so the budget is the larger of the two plus baseline (~700 MB for
`shared_buffers` default + PostgREST pool + WAL + autovacuum).
| `OSM_BBOX` | *(auto)* | data-node, data-node-ui | Manual bounding box for the osmium pre-filter (`west,south,east,north`). Skips Nominatim lookup when set. |
| `OSM_BBOX_PADDING` | `0.15` | data-node, data-node-ui | Degrees of padding added to each side of the Nominatim bbox (≈ 15 km). |
| `OSM_PREFILTER_MIN_MB` | `20` | data-node, data-node-ui | Source PBF files smaller than this many MB skip the osmium pre-filter step. |
| `GEOSERVER_URL` | *(disabled)* | data-node, data-node-ui | Base URL of a GeoServer instance for the shadow WMS layer; leave empty to disable |
| `GEOSERVER_WORKSPACE` | `spieli` | data-node, data-node-ui | GeoServer workspace name — only used when `GEOSERVER_URL` is set |
| `HUB_POLL_INTERVAL` | `300` | hub | Seconds between Hub re-fetches of playground data from all registered instances. Bare integer, no unit suffix. See [Federated Deployment](federated-deployment.md). |
| `MACRO_MAX_ZOOM` | `7` | hub | Maximum zoom level at which the macro view (one summary ring per backend) is shown instead of individual cluster circles. Increase for deployments with many backends covering a small geographic area; decrease for sparse deployments covering a large area. |
| `REIMPORT_INTERVAL_MIN_DAYS` | *(unset)* | data-node, data-node-ui | Minimum days between automatic OSM re-imports (daemon mode). Leave unset to run one-shot (import once and exit). Must be set together with `REIMPORT_INTERVAL_MAX_DAYS`. |
| `REIMPORT_INTERVAL_MAX_DAYS` | *(unset)* | data-node, data-node-ui | Maximum days between automatic OSM re-imports. The importer picks a random interval in `[MIN, MAX]` days after each successful run. Recommended: `2`–`10`. Must be set together with `REIMPORT_INTERVAL_MIN_DAYS`. |
| `REIMPORT_STARTUP_JITTER_MAX_HOURS` | `0` | data-node, data-node-ui | On a **fresh DB** (no prior import recorded), sleep a random duration between `0` and this many hours before the first import. Prevents a thundering herd when many backends are deployed simultaneously. Has no effect on restarts or routine daily cycles. Recommended value for multi-backend deployments: `6`. |
| `SITE_URL` | *(unset)* | ui, data-node-ui | Public base URL of this instance (e.g. `https://spieli.example.com`). Used to construct absolute `impressum_url` and `privacy_url` in `get_meta()` so the Hub can discover legal pages without an operator-supplied override URL. `get_meta()` emits the legacy paths `SITE_URL + /impressum` and `+ /datenschutz`, which the app permanently redirects to the canonical `/legal/impressum` and `/legal/datenschutz`. Leave unset for purely local testing. |
| `IMPRESSUM_NAME` | *(unset)* | ui, data-node-ui | Full name of the legally responsible person or organisation. Required to generate the Impressum and Datenschutz pages. |
| `IMPRESSUM_ORG` | *(unset)* | ui, data-node-ui | Organisation name (if different from `IMPRESSUM_NAME`). Optional; omitted from the Impressum when empty. |
| `IMPRESSUM_ADDRESS` | *(unset)* | ui, data-node-ui | Street address and city (e.g. `Musterstraße 1, 36037 Fulda`). Required alongside `IMPRESSUM_NAME`. |
| `IMPRESSUM_EMAIL` | *(unset)* | ui, data-node-ui | Contact email address. Required for both Impressum and Datenschutz pages. |
| `IMPRESSUM_PHONE` | *(unset)* | ui, data-node-ui | Contact phone number. Optional; omitted from the Impressum when empty. |
| `IMPRESSUM_URL` | *(unset)* | ui, data-node-ui | Override URL for an existing Impressum page (e.g. `https://example.com/impressum`). When set, the generated `impressum.html` is skipped and this URL is used directly in `get_meta()` and `config.js`. |
| `PRIVACY_URL` | *(unset)* | ui, data-node-ui | Override URL for an existing Datenschutzerklärung page. When set, the generated `datenschutz.html` is skipped. |

> **Legal pages — two-step update.** Changing `IMPRESSUM_*` or `SITE_URL` requires two steps to take full effect:
> 1. Restart the app container — `docker-entrypoint.sh` regenerates `impressum.html` / `datenschutz.html` and updates `config.js`:
>    ```bash
>    docker compose --profile <mode> up -d app
>    ```
> 2. Re-run the importer to update `get_meta()` — legal URLs are baked into the database at import time:
>    ```bash
>    docker compose --profile <mode> run --rm importer
>    ```

## Compose profiles

| Profile | Description |
|---|---|
| `data-node` | Starts `db`, `importer`, and `postgrest` (no frontend). |
| `data-node-ui` | Starts everything: `db`, `importer`, `postgrest`, and `app`. |
| `ui` | Starts `app` only — connects to a remote PostgREST backend via `API_BASE_URL`. |
| `auto-update` | Starts a [Watchtower](https://containrrr.dev/watchtower/) container that polls Docker Hub/GHCR every 24 hours and automatically restarts containers whose images have changed. Recommended for unattended data-node deployments. Enable by appending it to your active profile, e.g. `--profile data-node-ui --profile auto-update`. The installer offers this as an opt-in (default: enabled). When enabled, `REIMPORT_INTERVAL_MIN_DAYS` and `REIMPORT_INTERVAL_MAX_DAYS` are written to `.env` so the importer runs in daemon mode — the startup grace check (`last_import_at`) prevents an unplanned re-import when Watchtower restarts the container after an image update. |

## Scheduling OSM re-imports

There are two ways to keep your OSM data up to date:

### Daemon mode (recommended)

Set `REIMPORT_INTERVAL_MIN_DAYS` and `REIMPORT_INTERVAL_MAX_DAYS` in `.env` (the installer does this when you choose the auto-update option). The importer container runs in a loop: after each successful import it sleeps for a random number of days within the configured range, then re-imports.

When combined with the `auto-update` profile (Watchtower), new spieli releases are applied automatically: Watchtower restarts the importer container after an image update, and the startup grace check reads `last_import_at` from the database — if the last import ran recently (within the configured interval), the container sleeps until the next scheduled time instead of re-importing immediately.

```bash
# .env — daemon mode
REIMPORT_INTERVAL_MIN_DAYS=2
REIMPORT_INTERVAL_MAX_DAYS=10
```

### Manual / systemd timer

If you prefer to manage scheduling outside Docker, leave the interval variables unset. The importer then runs once and exits (one-shot mode). You can trigger it on a schedule using a systemd timer or cron:

```bash
# one-shot import
docker compose --profile data-node run --rm importer
```

Example systemd unit files for timer-based scheduling are available in `deploy/`.

## Applying changes

After editing `.env`, restart the relevant containers. Replace `<mode>` with your `DEPLOY_MODE` value (`data-node`, `ui`, or `data-node-ui`):

```bash
# Restart app only (config changes)
docker compose --profile <mode> up -d app

# Full restart
docker compose --profile <mode> down
docker compose --profile <mode> up -d
```

## Basemap

The basemap is the one service every visitor contacts on every map movement, so how it is delivered is a privacy decision as much as a rendering one.

### The default: a cached public tile server

Out of the box the bundled vector style references every asset under `/basemap/` on **this instance**. nginx serves what is vendored in the image (the style document and the webfonts) from disk and fetches the rest — tiles and sprites — from `BASEMAP_UPSTREAM`, caching it.

Map labels are drawn from the vendored webfonts, not from the style's `glyphs` endpoint: `ol-mapbox-style` resolves text through a webfont CSS template rather than fetching glyph ranges. The style still declares `glyphs` under `/basemap/`, and that path proxies correctly if a future renderer does ask for it, but nothing requests it today. `make basemap-fonts` fails if the style asks for a font weight that is not vendored, because the alternative is a silent fallback to a system font plus an upstream request on every page load.

That arrangement does two jobs at once:

- **It is kind to the upstream.** OpenFreeMap is donation-funded and run by one person. A federation of backends sending every visitor's tile requests straight there is not a neighbourly load pattern; a cache in front means one client per deployment, with duplicate misses collapsed (`proxy_cache_lock`) and conditional revalidation rather than full refetches.
- **Visitors' browsers never contact it.** No third party sees a visitor's IP address or the z/x/y stream that reveals what they were looking at.

Proxied requests are not written to the access log, for the same reason they are not sent to a third party: at high zoom the z/x/y stream is a record of what someone looked at. Files served from disk are logged normally — a webfont or the style document fetched once says nothing about where anyone looked.

This covers the *access* log only. `error_log` still records the URI of a request that fails upstream, which is what keeps outages diagnosable; it is a record of failures rather than of browsing, but it is not nothing, so treat the container's error log with the same care as any other log that can name a path a visitor requested.

The cache lives on the container's writable layer, so `make docker-build` discards it and the next visitors refill it from the upstream. Mount a volume at `/var/cache/nginx/basemap` to keep it, which matters more here than for `/tiles/`: this cache is on by default, and an upgrade sweep across stacks otherwise sends every one of them cold at the public server. `compose.yml` and `compose.prod.yml` both ship a `basemap_cache` volume for this.

Running **several stacks on one host**? Point them all at a single shared cache instead of running one per stack — see [Shared Basemap Cache](shared-basemap-cache.md). Fifteen caches at the 4 GB default is up to 60 GB of disk and fifteen separate clients hitting the public tile server, all going cold together on every upgrade sweep.

**To run your own tileserver**, up to two steps. The bundled style carries the *provider's* asset paths (`/planet`, `/sprites/ofm_f384/ofm`), so a server that mirrors that shape needs only the first step, and a differently-shaped one needs the style rebuilt against it as well:

```bash
# 1. rebuild the style against the new provider
tools/build-basemap-style.py --source https://my-tileserver/styles/foo \
                             --asset-base /basemap \
                             --out app/public/basemap/style.local.json
# 2. point the cache at it (origin only — a path is rejected at startup)
BASEMAP_UPSTREAM=http://tileserver:8080
```

An earlier draft of this section claimed the swap was one variable and nothing else. It is not: a 1:1 prefix proxy cannot reshape one provider's URL layout into another's. Two steps, both scriptable, is the honest version — and a provider migration is a one-time operation that already involves standing up a server.

`BASEMAP_UPSTREAM` must be an origin (`scheme://host[:port]`) with no path. A path is refused at startup rather than accepted, because `proxy_pass` with a variable *replaces* the request URI instead of prefixing it — every asset would collapse onto that one path and the map would render blank with no error.

### Two source shapes

Leave both unset and you get the bundled vector style. The container serves `/basemap/style.local.json` and the `make dev` server falls back to `/basemap/style.json`; both are compiled-in defaults, **not** the env var's default — do not copy either into `.env` as a value. Setting `BASEMAP_STYLE_URL` marks the basemap as *configured*, which then requires `BASEMAP_ATTRIBUTION` — the container refuses to start without it. A style whose assets point at a third party is also rejected alongside `BASEMAP_PROXY`, since the style would bypass the proxy; the bundled style is same-origin and is accepted.

Precedence when you do set them:

| Set | Result |
|---|---|
| neither | the bundled vector style |
| `BASEMAP_STYLE_URL` | that style, vector |
| `BASEMAP_URL` only | that raster template — **replaces** the vector default entirely |
| both | the style renders; the raster URL is the fallback if the style fails to load |

`BASEMAP_URL` is an OpenLayers XYZ raster template.

Raster templates are passed through verbatim, so a provider using a reversed axis order works without a code change:

```bash
BASEMAP_URL='https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png'
```

That example is included because it exercises the axis-order case, **not as a recommendation**: basemap.de covers Germany only, and outside Germany it returns `200 OK` with a blank tile rather than an error. Nothing fails, nothing alerts, and a proxy cache will happily store the blanks. Check your provider's coverage against your region before adopting it.

Whatever you choose, make sure the credit matches. Showing one provider's attribution over another's tiles is a licence problem, not a cosmetic one.

For a **vector** basemap you normally do not have to do anything: a tile server declares its own attribution in its TileJSON, and the map uses that. It is authoritative and it differs between servers exactly as it should:

| Upstream | Credit shown |
|---|---|
| `tiles.openfreemap.org` | OpenFreeMap © OpenMapTiles Data from OpenStreetMap |
| a self-hosted Planetiler build | © OpenMapTiles © OpenStreetMap contributors |

Setting `BASEMAP_ATTRIBUTION` overrides that. Only do so when you have a credit the server cannot know about, because an override that goes stale credits the wrong party silently — that is how a map built from self-hosted tiles came to display "© OpenFreeMap".

Note this follows the **tile server**, not `BASEMAP_UPSTREAM`. With a shared cache the upstream is an internal host while the tiles still originate from the public server, so the hostname says nothing about who to credit.

A **raster** basemap has no TileJSON to ask, which is why `BASEMAP_URL` requires `BASEMAP_ATTRIBUTION` and the container refuses to start without it.

### Delivery modes

| Mode | Configuration | Who sees the visitor |
|---|---|---|
| **cached** (default) | nothing — the bundled same-origin style | Nobody. The browser talks only to this instance; tiles are fetched server-side from `BASEMAP_UPSTREAM` and cached |
| **direct** | `BASEMAP_URL` or `BASEMAP_STYLE_URL` pointing at a third party | The provider receives every visitor's IP address, User-Agent, `Referer` and tile coordinates |
| **proxied** | `BASEMAP_PROXY=true` with a raster `BASEMAP_URL` | The provider sees only this server. Predates the default above and applies to raster providers |

A fourth mode, **mirrored** — shipping the tileset with the instance so no provider is contacted even server-side — is not implemented. A DE + CZ + SK PMTiles build is around 5 GB per stack, against a demand-driven cache that costs a fraction of that; `BASEMAP_UPSTREAM` is what makes the swap cheap if that changes.

Note `BASEMAP_STYLE_URL=/basemap/style.json` is **not** the default and is not same-origin delivery: the committed `style.json` is served locally but still points its tiles, fonts and sprites at `tiles.openfreemap.org`. The container serves `style.local.json`, the `--asset-base` variant, whose assets all resolve under `/basemap/`. Both are built by `make basemap-style`; only the second one keeps the browser on your origin.

Proxying has no fallback to direct delivery. If the upstream is unreachable, tiles fail and the map renders without a basemap. That is deliberate: falling back would leak exactly the addresses proxying was enabled to protect, at the moment something is already wrong.

For the same reason, enabling `BASEMAP_PROXY` alongside a vector style is **rejected at startup** whenever that style would still send the browser to a third party — the style takes precedence over the raster URL, so the browser would fetch everything directly while the proxy sat unused and the privacy page claimed otherwise.

That check looks at the style *document*, not just its URL. A same-origin `BASEMAP_STYLE_URL` proves nothing on its own: `/basemap/style.json` is served locally but points its tiles, glyphs and sprites at `tiles.openfreemap.org`, so it is rejected too. `/basemap/style.local.json` — the container default — is accepted, because its assets are all same-origin. Rebuild it with `--asset-base` first. Only a style whose assets are all same-origin can be combined with the proxy.

### Costs of proxying

Proxied tiles are served twice from the operator's point of view — inbound on a cache miss, outbound to every visitor always — so tile egress moves onto your server. Budget accordingly, and check that your chosen provider's terms permit proxying and caching; that is your responsibility, not spieli's.

**The cache is not persistent by default.** It lives on the container's writable layer, so `make docker-build` — the documented way to ship any change — discards it and the next visitors refill it from the upstream. Mount a volume at `/var/cache/nginx/tiles` if you want it to survive rebuilds.

Invalid cache values fail at startup rather than being silently rewritten: `4.5g` is rejected instead of quietly becoming `45g`.

Two cache settings bind before disk does, and both have defaults that will surprise you:

- **`BASEMAP_CACHE_KEYS_ZONE`** holds roughly 8000 keys per MB. The `10m` seen in most nginx examples tracks about 80,000 tiles, so a large `max_size` behind it yields a cache that stays almost entirely empty.
- **`BASEMAP_CACHE_INACTIVE`** defaults in nginx to 10 minutes, evicting tiles regardless of free space. spieli defaults it to 90 days instead.

Sizing depends heavily on raster versus vector. Vector tilesets cap at a low maximum zoom and the client renders deeper zooms by overzooming the same tiles, so full coverage is orders of magnitude smaller than the raster equivalent for the same area.

### Tile requests are never access-logged

When proxying is enabled, nginx sets `access_log off` on `/tiles/`. This is a correctness property of the feature rather than a hardening tip: proxying moves the visitor's tile stream onto your server, and at high zoom that z/x/y sequence is not metadata about what someone looked at — it *is* what they looked at. Logging it would build a per-visitor location trail on your disk, which is worse than the third-party delivery proxying replaces. Error-level logging is retained so upstream failures stay diagnosable.

If you run a reverse proxy in front of spieli (Traefik, for example), check that it does not log the tile path either. A location trail is no less a location trail for being written by the ingress.

### Regional tilesets

A tileset covering a few countries has **two different extents**, and only one of them is discoverable from the tileset itself.

Planetiler bakes Natural Earth and water polygons in globally, so low zooms render everywhere and the declared bounds describe that wide area honestly. OSM detail exists only inside the imported extract. Above roughly z7 outside it the tile server answers `204 No Content`:

| place | z4 | z6 | z8 | z10 | z12 |
|---|---|---|---|---|---|
| Fulda (covered) | 200 | 200 | 200 | 200 | 200 |
| Paris (outside) | 200 | 200 | 204 | 204 | 204 |

The renderer draws an empty tile for a 204. Nothing errors and nothing warns, so the result is indistinguishable from a legitimately empty map.

`BASEMAP_COVERAGE_BBOX` closes that gap. Set it to where your detail actually is and the map shows a quiet notice once the view leaves it:

```bash
# Germany, Czechia and Slovakia
BASEMAP_COVERAGE_BBOX=5.8,47.2,22.6,55.1
```

Leave it unset for a planet tileset. Unset means the notice never appears, which is why this changes nothing for an existing deployment.

Two details worth knowing:

- It keys on the **view centre**, not on the viewport overlapping the box. Near a border a partly-covered view is normal, and warning there would cry wolf.
- It stays quiet below zoom 8, because the tileset's global low-zoom layer still renders there and nothing is actually missing.

A malformed value is ignored rather than fatal: a typo costs the notice, not the map.

### The bundled style

`make basemap-style` produces **two** variants from a single upstream fetch, both vendored copies of OpenFreeMap Bright with the same two edits:

| File | Assets point at | Used by |
|---|---|---|
| `app/public/basemap/style.json` | `tiles.openfreemap.org` | `make dev`, which has no nginx to proxy through |
| `app/public/basemap/style.local.json` | `/basemap/` on this instance | the container — this is what visitors get |

One fetch, both outputs: building them in two runs let the upstream rotate in between, leaving the two variants derived from different sources with nothing detecting it.

The two edits, applied by `tools/build-basemap-style.py`:

1. Green landcover fills are desaturated, because spieli encodes playground data completeness in green, amber and red. A basemap that paints parks green competes with the map's primary signal.
2. The `poi` symbol layers are dropped, as the strongest competitor for attention.

The second edit is a legibility change only. Dropping a style layer does not reduce render cost — the tile data is still decoded and simply not drawn.

`--asset-base` is what rewrites the style's tile, glyph and sprite URLs onto one origin, and it is the whole difference between a local style and a local basemap. **Without it — which is how `style.json` is built — those assets are fetched from `tiles.openfreemap.org` by every visitor**, even though the style document itself is served locally.

Only the origin is stripped; the upstream's own paths are preserved verbatim. That 1:1 mapping is what lets a plain prefix proxy serve the result without reversing a mapping it cannot know. The build refuses to write an `--asset-base` output that still contains a third-party host, and drops any query string it finds, so rebuilding against a keyed provider cannot bake an API key into a committed style.

## External-service proxies

By default the visitor's browser contacts **no third party**. Geocoding, playground photos and reviews are all fetched by this instance and served from its own origin, cached on disk. This is the same mechanism as the basemap, extended to the rest.

```
Browser ──► this instance ──► nginx cache ──► Nominatim / Commons / Mangrove
```

Each service can be opted out individually with the `PROXY_*` variables above. Opting out restores direct browser requests for that service and adds its host to the generated Content Security Policy; the others stay proxied.

### Two exceptions

**Panoramax is not proxied at all.** Its thumbnail endpoint answers `308` with a `Location` on a per-instance derivative host, and nginx cannot follow a redirect — relaying it would send the browser to a host the privacy page does not name and the CSP does not allow. Its viewer is an `<iframe>`, and serving a whole interactive third-party application from this origin would grant it same-origin privileges here. Both stay cross-origin, are named in the CSP, and keep their privacy-page rows.

**Equipment-attribute illustrations are not proxied.** They are rendered from `commons.wikimedia.org/wiki/Special:FilePath/…`, which answers with a redirect chain; following it would mean allowing `/w/index.php` through the proxy, which is a much larger relay surface than a photo gallery is worth. The playground photo gallery itself *is* proxied.

### Nothing is logged

Every proxy location sets `access_log off`, and that is a correctness property rather than a tuning choice. Proxying moves the visitor's request stream onto your disk; recording it would rebuild a per-visitor trail and make you the controller of something worse than the third-party disclosure it replaced. Errors are still logged.

If you put a reverse proxy in front of this stack, check that it is not logging the same paths a layer up. Traefik's access log is off by default; if you have enabled it, exclude `/ext/`.

### Nominatim needs its cache to survive restarts

The OSMF usage policy is an absolute **1 request per second**. Proxying concentrates onto one IP the queries that used to spread across every visitor's, so the cache is load-bearing rather than an optimisation — and `compose.yml` mounts a named volume (`ext_cache`) for exactly that reason. A cache on the container's writable layer is discarded on every image rebuild, and an upgrade across a federation would send every instance cold at a 1 r/s upstream simultaneously.

The rate limiter sits on an internal loopback server rather than on the visitor-facing location, so only cache **misses** reach it. That placement matters: `limit_req` runs before the cache lookup, so on the visitor-facing location it sheds requests that were already cached — measured, two simultaneous visitors were enough to break search. When the limiter does shed, a stale cached answer is served if one is held.

The dominant query is shared: region-URL resolution such as `/fulda` is identical for every visitor of an instance, and it is what caches best.

### Sizing the cache

`EXT_CACHE_MAX_SIZE` defaults to a conservative 2 GB for all four services together. Commons image bytes dominate it. Raise it if `du -sh` on the volume sits at the ceiling and images are being re-fetched:

```bash
docker compose exec app du -sh /var/cache/nginx/ext
```
