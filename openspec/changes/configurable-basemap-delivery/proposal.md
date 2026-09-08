> Umbrella issue: #823. Implementation ticket: #828. The disclosure half shipped separately as #825 / PR #826.

## Why

The basemap URL is hardcoded at `app/src/components/Map.svelte:135` (`basemaps.cartocdn.com`, keyless). Issue #823 opened because CARTO now requires an API key on raster basemaps and is watermarking keyless requests. Two things follow from that, and only one of them is about CARTO.

**The immediate breakage.** The tile URL is not env-driven, so no operator can change it without a rebuild. Every provider option in #823 — adding a key, switching to basemap.de, switching to a vector provider, self-hosting — is blocked behind the same missing indirection.

**The structural problem.** spieli's model is that a new region is `cp .env.example .env` plus two variables; there are already 16 federated backends, one on a third-party operator's machine. A keyed basemap converts that into "set two env vars and go register with a US SaaS", per operator, forever. CARTO's own terms ("the key is yours. Do not share it") make one shared key a licence problem, not merely a quota problem. **The onboarding tax, not privacy or tile weight, is the constraint that should drive the provider decision**, and it is not stated anywhere in #823 today.

Exploration also established that #823's three options conflate two independent axes. *Which provider* serves tiles and *how tiles reach the browser* are separable. Separating them is what this change delivers: after it, the provider decision (#823 item 3) becomes a config change and a documentation update rather than a code change, and it can be revisited without touching the frontend again.

**The federation's target coverage is Germany, Czechia and Slovakia**, which rules out every raster candidate. CARTO is excluded on privacy: obtaining a key to stop the watermark converts anonymous, referer-attributed traffic into traffic attributed to a named account, per operator, so the minimal fix for #823 is its worst privacy outcome (D9). basemap.de is excluded on coverage, and it fails badly — outside Germany it returns `200 OK` with a ~334-byte blank tile rather than a 404, so nothing errors, nothing alerts, and a cache would store millions of blanks as though valid. No keyless raster provider covers the target area.

**So vector is mandatory, not optional** (D10). That is a scope increase over the first draft, which deferred it. It also brings an unexpected simplification: OpenFreeMap's tileset caps at `maxzoom: 14` and the client overzooms above it, so complete coverage of all three countries is **73 GB** rather than the 4,023 GB the raster equivalent would need. At that size a full local copy is ordinary, which makes **serving the tiles ourselves the recommended delivery** rather than the heaviest option — reversing the first draft's assumption that self-hosting was out of reach. Mirroring beats proxying on upstream terms, rate limits, provider durability and cold-start latency, and matches it on privacy.

The proxy path stays in scope as the incremental step and as the option for operators with less disk.

This change still does **not** flip the shipped default, which alters the cartographic appearance of every deployment and is a maintainer call (task 6.2).

## What Changes

- Add `BASEMAP_URL` and `BASEMAP_ATTRIBUTION` env vars, threaded through `oci/app/docker-entrypoint.sh` → `app/public/config.js` → `app/src/lib/config.js` → `Map.svelte`, replacing the hardcoded `XYZ` source. Defaults preserve today's behaviour so an operator who changes nothing sees no change.
- Add an opt-in proxied delivery mode: `BASEMAP_PROXY_UPSTREAM` makes nginx serve tiles from a same-origin `/tiles/` path backed by `proxy_cache`, so the visitor's browser never contacts the tile provider. Cache size is bounded by `BASEMAP_CACHE_MAX_SIZE`. Direct delivery remains the default.
- **Disable access logging on the tile path by default.** Proxying relocates the visitor's tile stream onto the operator's server rather than deleting it; with default nginx logging that stream becomes a per-visitor location trail on the operator's disk, and the operator silently becomes its controller. A proxy that does this is worse than the third-party delivery it replaced, so this is specified as a requirement of the feature rather than as hardening advice (D8).
- Add vector basemap rendering via `ol-mapbox-style`, with a style URL as a second configuration shape alongside the raster template, and the style's glyphs and sprites served from the same origin as the tiles so the privacy property does not leak through the style (D10).
- Add a locally-served delivery mode: the instance holds a tile copy and answers every basemap request from its own storage, with no request path to a provider. Distinct from proxying, which still contacts a provider on a cache miss.
- Give the hub macro tier its own low-zoom basemap so the area outside the federation's three countries is not blank (D6). A three-country tileset narrows the coverage gap but does not close it; either a bundled Natural Earth outline or mirrored z0–6 world tiles (5,461 tiles, a few hundred MB) closes it.
- Make the privacy disclosure follow the configuration. `oci/app/datenschutz.template.html` currently hardcodes a CARTO row (shipped in #826); once the provider is configurable that row must reflect what is configured, and must disappear entirely in proxied mode, where no third party is contacted for tiles.
- Document both axes in `docs/ops/configuration.md` and update `docs/reference/external-services.md`, whose browser-contacted table is provider-specific today.

## Capabilities

### New Capabilities
- `basemap-configuration`: an operator selects the basemap provider and the tile delivery path (direct or proxied) through environment variables, without rebuilding the image, and the app's attribution and privacy disclosure follow that selection automatically.

### Modified Capabilities
<!-- None: no existing spec governs the basemap layer or tile delivery. -->

## Impact

- `app/src/components/Map.svelte` — the `XYZ` source reads config instead of literals.
- `app/src/lib/config.js`, `app/public/config.js` — new exported constants.
- `oci/app/docker-entrypoint.sh` — render the new vars into `config.js`; render the tile row of the privacy page conditionally.
- `oci/app/nginx.conf` — new `location /tiles/` block plus a `proxy_cache_path`, active only when proxying is configured, with `access_log off` on that location.
- `app/src/components/Map.svelte` + a bundled outline asset — macro-tier basemap, wired into the existing `activeTierStore` subscription.
- `oci/app/datenschutz.template.html` — the tile row becomes conditional rather than a hardcoded CARTO row.
- `docs/ops/configuration.md`, `docs/reference/external-services.md`, `.env.example`.
- **Release labels**: `requires-env-update` (new optional vars) and `requires-compose-update` if the cache needs a volume. Not `requires-reimport` or `requires-schema-update` — no data model or SQL change.
- Defaults are chosen so an operator who upgrades and changes nothing keeps current behaviour; the labels cover operators who opt in.
