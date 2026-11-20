# Configure the instance

How the settings in `.env` work together, for the areas where that takes more than one line. Every single variable, with its default, is listed in the [Configuration Reference](configuration.md).

## Applying changes

After editing `.env`, restart the relevant containers. Replace `<mode>` with your `DEPLOY_MODE` value (`data-node`, `ui`, or `data-node-ui`):

```bash
# Restart app only (config changes)
docker compose --profile <mode> up -d app

# Full restart
docker compose --profile <mode> down
docker compose --profile <mode> up -d
```

> **Legal pages — what to restart.** Changing `IMPRESSUM_*`, `SITE_URL`, `IMPRESSUM_URL` or `PRIVACY_URL`:
>
> 1. **This instance's own pages:** recreate the app container. `docker-entrypoint.sh` regenerates `impressum.html` / `datenschutz.html` and `config.js`:
>    ```bash
>    docker compose --profile <mode> up -d app
>    ```
> 2. **The links a hub shows** come from `get_meta()`, which bakes the URLs in when `api.sql` is applied. Recreate the daemon importer (`up -d importer`: it applies a changed `api.sql` on startup), or run `run --rm -e API_ONLY=1 importer`.
> 3. **The legal text a hub shows for a data-node** (`api.legal_content`) is rewritten only at the end of a **full** import. See [Refresh Data](refresh-data.md).

## Language settings

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

Only `opening_hours` values with `PH` (public holiday) are affected — 69 of
7 042 playgrounds in the Hessen extract (September 2026). A value the app
cannot resolve is ignored and logged in the browser console as
`[config] REGION_STATE "…" is not a state of …`, listing the codes it knows.

**Behaviour change in #878:** before it, a code such as `he` was ignored, so
stacks configured with the previously documented `REGION_STATE=he` evaluated
holidays without a state. After upgrading they honour their state's holidays —
a playground tagged `PH off` now shows as closed on e.g. Corpus Christi in
Hessen. No action is needed.

> **How `PG_*` values are applied.** The importer runs `ALTER SYSTEM SET …`
> at the top of `api.sql`, then `SELECT pg_reload_conf()`. The values are
> persisted to `postgresql.auto.conf` inside the data volume and apply to
> every connection — including PostgREST — without restarting the database
> container. To re-tune, edit `.env` and re-apply the schema only:
> ```bash
> docker compose --profile <mode> run --rm -e API_ONLY=1 importer
> ```
> Without `API_ONLY=1` this runs a full import — or, on a stack with
> automatic updates, starts a second importer daemon next to the running one.

## RAM sizing

!!! warning "The compose files currently pass higher values"
    The defaults below are what `importer/import.sh` and `.env.example` intend. `compose.yml` and `compose.prod.yml` still pass the older, higher values (6 / 4 / 4 · `512MB` · `128MB`, a peak of about 3 GB), and they win whenever `.env` does not set the variables, which the installer does not do. Until [#1060](https://github.com/mfuhrmann/spieli/issues/1060) is fixed, set the values from the table below in `.env` explicitly, especially on hosts with 4 GB or less.

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

## Scheduling OSM re-imports

Two ways, both described in [Scheduled Import](scheduled-import.md): **daemon mode** (set `REIMPORT_INTERVAL_MIN_DAYS` and `REIMPORT_INTERVAL_MAX_DAYS`; the installer does this when you choose automatic updates) or a **one-shot** importer started by a systemd timer or cron.

## Basemap

The basemap is the one service every visitor contacts on every map movement, so how it is delivered is a privacy decision as much as a rendering one. The reasoning behind the default is in [Privacy by design](../concepts/privacy.md); this section covers the settings.

### The default: a cached public tile server

Out of the box the bundled vector style references every asset under `/basemap/` on **this instance**. nginx serves what is vendored in the image (the style document and the webfonts) from disk and fetches the rest — tiles and sprites — from `BASEMAP_UPSTREAM`, caching it.

Map labels are drawn from the vendored webfonts, not from the style's `glyphs` endpoint: `ol-mapbox-style` resolves text through a webfont CSS template rather than fetching glyph ranges. The style still declares `glyphs` under `/basemap/`, and that path proxies correctly if a future renderer does ask for it, but nothing requests it today. `make basemap-fonts` fails if the style asks for a font weight that is not vendored, because the alternative is a silent fallback to a system font plus an upstream request on every page load.

That arrangement does two jobs at once:

- **It is kind to the upstream.** OpenFreeMap is donation-funded and run by one person. A federation of backends sending every visitor's tile requests straight there is not a neighbourly load pattern; a cache in front means one client per deployment, with duplicate misses collapsed (`proxy_cache_lock`) and conditional revalidation rather than full refetches.
- **Visitors' browsers never contact it.** No third party sees a visitor's IP address or the z/x/y stream that reveals what they were looking at.

No request is written to the access log (#988, `oci/app/00-no-access-log.conf`). This covers the *access* log only. `error_log` still records the URI of a request that fails upstream, which is what keeps outages diagnosable; it is a record of failures rather than of browsing, but it is not nothing, so treat the container's error log with the same care as any other log that can name a path a visitor requested.

The cache lives on the container's writable layer, so `make docker-build` discards it and the next visitors refill it from the upstream. Mount a volume at `/var/cache/nginx/basemap` to keep it, which matters more here than for `/tiles/`: this cache is on by default, and an upgrade sweep across stacks otherwise sends every one of them cold at the public server. `compose.yml` and `compose.prod.yml` both ship a `basemap_cache` volume for this.

Running **several stacks on one host**? Point them all at a single shared cache instead of running one per stack — see [Shared Basemap Cache](shared-basemap-cache.md). Fifteen caches at the 4 GB default is up to 60 GB of disk and fifteen separate clients hitting the public tile server, all going cold together on every upgrade sweep.

**To run your own tileserver**, point `BASEMAP_UPSTREAM` at it (origin only, see below). If its URL layout differs from OpenFreeMap's, the bundled style also has to be rebuilt against it, which needs your own image: see [Customise your own image → Your own tileserver](customise-image.md#your-own-tileserver).

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

### Check your reverse proxy's log

spieli writes no access log, including for proxied tiles (`/tiles/`). If you run a reverse proxy in front of it (Traefik, for example), check that it does not log the tile path either: at high zoom the z/x/y sequence is a record of what someone looked at, whichever layer writes it down.

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

`make basemap-style` builds the two vendored style files (`style.json` for `make dev`, `style.local.json` for the container) and decides what is changed against the upstream style. See [Update Generated Assets → Basemap style](../contributing/generated-assets.md#basemap-style).

## External-service proxies

By default the visitor's browser contacts **no third party**. Geocoding, playground photos and reviews are all fetched by this instance and served from its own origin, cached on disk. This is the same mechanism as the basemap, extended to the rest.

```
Browser ──► this instance ──► nginx cache ──► Nominatim / Commons / Mangrove
```

Each service can be opted out individually with the `PROXY_*` variables above. Opting out restores direct browser requests for that service and adds its host to the generated Content Security Policy; the others stay proxied.

### One exception

**Panoramax is not proxied at all.** Its thumbnail endpoint answers `308` with a `Location` on a per-instance derivative host, and nginx cannot follow a redirect — relaying it would send the browser to a host the privacy page does not name and the CSP does not allow. Its viewer is an `<iframe>`, and serving a whole interactive third-party application from this origin would grant it same-origin privileges here. Both stay cross-origin, are named in the CSP, and keep their privacy-page rows.

Equipment illustrations used to be a second exception, because they were rendered from `Special:FilePath` redirects. Since #867 their file names are resolved at build time (`make equipment-images`), and the images are served through `/ext/wikimedia/` like the photo gallery. See [External Services → Equipment illustrations](../reference/external-services.md#equipment-illustrations-come-through-the-same-proxy).

### Nothing is logged

Every proxy location sets `access_log off`; errors are still logged. Why that matters: [Privacy by design → Nothing is written down](../concepts/privacy.md#nothing-is-written-down).

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
