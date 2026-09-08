## Why

The basemap URL is hardcoded at `app/src/components/Map.svelte:135` (`basemaps.cartocdn.com`, keyless). Issue #823 opened because CARTO now requires an API key on raster basemaps and is watermarking keyless requests. Two things follow from that, and only one of them is about CARTO.

**The immediate breakage.** The tile URL is not env-driven, so no operator can change it without a rebuild. Every provider option in #823 — adding a key, switching to basemap.de, switching to a vector provider, self-hosting — is blocked behind the same missing indirection.

**The structural problem.** spieli's model is that a new region is `cp .env.example .env` plus two variables; there are already 16 federated backends, one on a third-party operator's machine. A keyed basemap converts that into "set two env vars and go register with a US SaaS", per operator, forever. CARTO's own terms ("the key is yours. Do not share it") make one shared key a licence problem, not merely a quota problem. **The onboarding tax, not privacy or tile weight, is the constraint that should drive the provider decision**, and it is not stated anywhere in #823 today.

Exploration also established that #823's three options conflate two independent axes. *Which provider* serves tiles and *how tiles reach the browser* are separable. Separating them is what this change delivers: after it, the provider decision (#823 item 3) becomes a config change and a documentation update rather than a code change, and it can be revisited without touching the frontend again.

This change still does **not** flip the shipped default provider, but it no longer leaves the provider question entirely open. Evaluated with privacy as the top priority (D9), the delivery axis turns out to decide almost everything — with proxying on, the provider cannot segment the tile stream per visitor whichever provider it is — and CARTO comes out excluded on its own merits: obtaining a key to stop the watermark converts anonymous, referer-attributed traffic into traffic attributed to a named account, per operator. The minimal fix for #823 is its worst privacy outcome.

That has a useful consequence: **the recommended path no longer depends on whether CARTO's terms permit proxying**, which was the largest unknown when this proposal was first written.

The recommendation is basemap.de raster, proxied, tile logging off, plus the macro outline. Adopting it as the *shipped default* changes how every deployment's map looks, so that call stays with the maintainer (task 6.2). The mechanism is provider-agnostic either way.

## What Changes

- Add `BASEMAP_URL` and `BASEMAP_ATTRIBUTION` env vars, threaded through `oci/app/docker-entrypoint.sh` → `app/public/config.js` → `app/src/lib/config.js` → `Map.svelte`, replacing the hardcoded `XYZ` source. Defaults preserve today's behaviour so an operator who changes nothing sees no change.
- Add an opt-in proxied delivery mode: `BASEMAP_PROXY_UPSTREAM` makes nginx serve tiles from a same-origin `/tiles/` path backed by `proxy_cache`, so the visitor's browser never contacts the tile provider. Cache size is bounded by `BASEMAP_CACHE_MAX_SIZE`. Direct delivery remains the default.
- **Disable access logging on the tile path by default.** Proxying relocates the visitor's tile stream onto the operator's server rather than deleting it; with default nginx logging that stream becomes a per-visitor location trail on the operator's disk, and the operator silently becomes its controller. A proxy that does this is worse than the third-party delivery it replaced, so this is specified as a requirement of the feature rather than as hardening advice (D8).
- Give the hub macro tier a bundled, network-free basemap outline so a Germany-only provider does not leave the Europe-wide view blank (D6). Originally deferred; folded in because D9 makes a Germany-only provider the recommendation, and the work is roughly thirty lines in a block that already switches layers per tier.
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
