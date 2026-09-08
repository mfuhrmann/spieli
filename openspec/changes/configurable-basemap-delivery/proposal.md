## Why

The basemap URL is hardcoded at `app/src/components/Map.svelte:135` (`basemaps.cartocdn.com`, keyless). Issue #823 opened because CARTO now requires an API key on raster basemaps and is watermarking keyless requests. Two things follow from that, and only one of them is about CARTO.

**The immediate breakage.** The tile URL is not env-driven, so no operator can change it without a rebuild. Every provider option in #823 — adding a key, switching to basemap.de, switching to a vector provider, self-hosting — is blocked behind the same missing indirection.

**The structural problem.** spieli's model is that a new region is `cp .env.example .env` plus two variables; there are already 16 federated backends, one on a third-party operator's machine. A keyed basemap converts that into "set two env vars and go register with a US SaaS", per operator, forever. CARTO's own terms ("the key is yours. Do not share it") make one shared key a licence problem, not merely a quota problem. **The onboarding tax, not privacy or tile weight, is the constraint that should drive the provider decision**, and it is not stated anywhere in #823 today.

Exploration also established that #823's three options conflate two independent axes. *Which provider* serves tiles and *how tiles reach the browser* are separable. Separating them is what this change delivers: after it, the provider decision (#823 item 3) becomes a config change and a documentation update rather than a code change, and it can be revisited without touching the frontend again.

This change deliberately does **not** pick a provider. That decision depends on an unresolved licensing question (see Open Questions in `design.md`), and blocking the enabling work on it would leave operators unable to respond to CARTO at all.

## What Changes

- Add `BASEMAP_URL` and `BASEMAP_ATTRIBUTION` env vars, threaded through `oci/app/docker-entrypoint.sh` → `app/public/config.js` → `app/src/lib/config.js` → `Map.svelte`, replacing the hardcoded `XYZ` source. Defaults preserve today's behaviour so an operator who changes nothing sees no change.
- Add an opt-in proxied delivery mode: `BASEMAP_PROXY_UPSTREAM` makes nginx serve tiles from a same-origin `/tiles/` path backed by `proxy_cache`, so the visitor's browser never contacts the tile provider. Cache size is bounded by `BASEMAP_CACHE_MAX_SIZE`. Direct delivery remains the default.
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
- `oci/app/nginx.conf` — new `location /tiles/` block plus a `proxy_cache_path`, active only when proxying is configured.
- `oci/app/datenschutz.template.html` — the tile row becomes conditional rather than a hardcoded CARTO row.
- `docs/ops/configuration.md`, `docs/reference/external-services.md`, `.env.example`.
- **Release labels**: `requires-env-update` (new optional vars) and `requires-compose-update` if the cache needs a volume. Not `requires-reimport` or `requires-schema-update` — no data model or SQL change.
- Defaults are chosen so an operator who upgrades and changes nothing keeps current behaviour; the labels cover operators who opt in.
