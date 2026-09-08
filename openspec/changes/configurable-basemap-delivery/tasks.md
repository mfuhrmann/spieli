## 1. Thread the basemap source through configuration

- [x] 1.1 Add `basemapUrl` and `basemapAttribution` to `app/public/config.js` with today's CARTO values as the checked-in dev defaults.
- [x] 1.2 Export `basemapUrl` / `basemapAttribution` from `app/src/lib/config.js`, reading `window.APP_CONFIG` with the same fallback, matching the existing `c.x ?? default` pattern.
- [x] 1.3 Replace the literals in the `XYZ` source at `app/src/components/Map.svelte:135` with the config constants. Confirm the `{a-d}` subdomain template still resolves when supplied via config.
- [x] 1.4 Render `BASEMAP_URL` / `BASEMAP_ATTRIBUTION` into `config.js` in `oci/app/docker-entrypoint.sh`, following the escaping already used for the other rendered values.
- [x] 1.5 Add both vars to `.env.example`. Note that basemap.de is documented only as an axis-order example for the raster path, with an explicit warning that it covers Germany alone and returns blank 200s elsewhere (D9) — it must not read as a recommended value.

## 2. Add proxied delivery

- [x] 2.1 Add a `proxy_cache_path` and a `location /tiles/` block to `oci/app/nginx.conf`, emitted only when `BASEMAP_PROXY_UPSTREAM` is set. Follow the existing `/api/` block's use of the Docker resolver.
- [x] 2.2 Set a truthful `User-Agent` on the proxied upstream request identifying spieli and the instance, since the operator's server is now the client rather than a browser.
- [x] 2.3 Honour upstream cache headers; add `BASEMAP_CACHE_MAX_SIZE` (conservative default) and wire it into `proxy_cache_path max_size=`.
- [x] 2.4 When proxying is enabled, point `basemapUrl` at the same-origin `/tiles/{z}/{x}/{y}.png` path in the generated `config.js`.
- [x] 2.5 Verify no fallback path exists from proxied to direct (D3): an unreachable upstream must fail the tile, not reach the provider from the browser.
- [x] 2.6 Set `access_log off` on the `/tiles/` location (D8) so proxying does not write a per-visitor location trail to the operator's disk. Keep error-level logging so upstream failures stay diagnosable.
- [ ] 2.7 *(blocked on #829 — needs access to the federated host.)* Confirm nothing else logs the tile stream: check for a server-level `access_log` that the location does not override, and for any upstream reverse proxy (Traefik on the federated host) that would log it instead.
- [ ] 2.8 *(blocked on #829 — needs `df -h` on the host.)* Decide whether the cache needs a named volume; if so, update `compose.yml` and apply the `requires-compose-update` label.

## 2a. Vector basemap rendering (D10)

- [x] 2a.1 Add `ol-mapbox-style` and render a configured vector style, alongside the existing raster `XYZ` path rather than replacing it.
- [x] 2a.2 Add a style-URL configuration shape (`BASEMAP_STYLE_URL` or equivalent) and decide how it and `BASEMAP_URL` interact when both are set.
- [x] 2a.3 Confirm overzoom works: the tileset caps at `maxzoom: 14` while `mapMaxZoom` is 21, so the client must render z15–21 from z14 tiles and issue no requests above the cap.
- [ ] 2a.4 *(mechanism done — `--asset-base` rewrites tile/glyph/sprite URLs; verification needs local serving, blocked with 2c.)* Serve the style document, glyphs and sprites from the same origin as the tiles. Easy to miss, and if missed the browser still contacts a third party for fonts even though tiles are local.
- [x] 2a.5 Check bundle-size impact; the build already warns above 500 kB.
- [ ] 2a.6 *(layer ordering verified from source; rendering needs a running stack, same blocker as 5.8.)* Confirm the vector basemap renders under both app modes and does not disturb the existing tier layer ordering.
- [x] 2a.7 Adopt OpenFreeMap **Bright** as the style (D11) and vendor it, so the two edits below are ours to make and cannot be changed upstream underneath us.
- [x] 2a.8 Desaturate `park`, `landcover_grass` and `landcover_wood` so the green channel belongs to playground completeness.
- [x] 2a.9 Drop the `poi` symbol layers (`poi_r1`, `poi_r7`, `poi_r20`, `poi_transit`) — the strongest competitor for attention. Legibility only: measured, this does **not** improve render performance (D11), because the data is still decoded. Decide separately whether `poi_transit` stays dropped.
- [ ] 2a.10 *(done as a spike against live Hessen data before the style was vendored; re-run once it renders in the app.)* Re-check completeness legibility against real data with the **tuned** style. The published comparison used stock styles; the shipped one will not be stock.

## 2b. Macro-tier basemap (D6)

- [x] 2b.1 Add a bundled world-outline source (Natural Earth 1:110m or equivalent, no network request) as an OL layer.
- [x] 2b.2 Wire its visibility into the existing `activeTierStore` subscription at `Map.svelte:432`, visible only when `tier === 'macro'`.
- [ ] 2b.3 *(needs a running hub stack.)* Confirm the hub macro view reads correctly with a three-country tileset configured, and that the outline does not appear at cluster or polygon tiers.
- [x] 2b.4 Check the added asset's effect on bundle size; the build already warns above 500 kB.

## 2c. Locally served tiles (D10)

> **Blocked.** Task 2c.1 gates the section: redistribution rights for the tileset are unconfirmed (Open Question 2a), and shipping instructions telling operators to mirror tiles before that is answered would be publishing legally unverified guidance. Tracked in #829.

- [ ] 2c.1 Choose the tileset source and confirm redistribution is permitted (Open Question 2a) before shipping instructions telling operators to serve a copy.
- [ ] 2c.2 Decide the storage format and how nginx serves it; if PMTiles, confirm HTTP range-request serving works through the existing nginx.
- [ ] 2c.3 Document fetching a Germany + Czechia + Slovakia extract and where it lives on disk, following the pattern the importer already uses for PBFs.
- [ ] 2c.4 Define the refresh cadence. Basemap data does not need minute freshness, but "never updated" is also wrong.
- [ ] 2c.5 Ensure a pan beyond the copied area does not render blank tiles as if they were valid map data (the basemap.de failure mode in D9).
- [ ] 2c.6 Measure the real on-disk size against the 73 GB bbox estimate, which is generous and includes sea and neighbour overlap.

## 3. Make the disclosure follow the configuration

> **Blocked on #826.** These tasks edit the service table that #826 adds to `datenschutz.template.html`. That PR is still open, so the table is not on this branch and implementing here would conflict with it. The entrypoint already derives `BASEMAP_TILE_PROVIDER_HOST` for this section to consume.

- [ ] 3.1 Replace the hardcoded CARTO row in `oci/app/datenschutz.template.html` (added in PR #826) with a placeholder rendered by the entrypoint, in the style of the existing `{{HUB_PRIVACY_SECTION}}` awk inlining.
- [ ] 3.2 Direct mode: emit a provider row naming the configured host, transmitting IP / User-Agent / Referer / tile coordinates.
- [ ] 3.3 Proxied mode: emit no third-party tile row, and state that tiles are served by this instance.
- [ ] 3.4 Re-check the "Übermittlung in Drittländer" section, which names CARTO today: it must reflect the configured provider and say nothing when tiles are proxied.
- [ ] 3.5 Confirm the rendered page still has no leftover `{{...}}` placeholders and parses cleanly, for both delivery modes and both app modes (the hub section interacts with the same awk pass).

## 4. Documentation

- [x] 4.1 Document all four vars in `docs/ops/configuration.md`, including that operators are responsible for checking their chosen provider's terms (see Risks).
- [ ] 4.2 *(blocked on #826 — that PR rewrites this file.)* Update `docs/reference/external-services.md`: its browser-contacted table names CARTO specifically and must describe both delivery modes.
- [x] 4.3 Note in the ops docs that proxied delivery moves tile egress onto the operator, with the raster-vs-vector sizing distinction from D4 stated plainly.
- [x] 4.4 Document the three delivery modes (direct / proxied / mirrored), the disk each needs, and the `keys_zone` and `inactive` traps from D4 — a large `max_size` with a default `keys_zone` yields a near-empty cache.
- [ ] 4.5 *(blocked with 2c.)* Document how to fetch and refresh the local tileset, and what happens at its coverage edge.
- [x] 4.6 Run `make docs-build` to catch broken links.

## 5. Verify

- [ ] 5.1 *(needs a running stack.)* Default config: `make docker-build`, confirm tiles still load from CARTO and attribution is unchanged.
- [ ] 5.2 *(needs a running stack.)* Alternative raster provider: confirm a `{z}/{y}/{x}` template renders (the axis-order case) and that attribution updates with it.
- [x] 5.3 Proxied mode: verified in a built container — `/tiles/` returns real tiles (byte-identical to the direct upstream fetch) and the frontend is pointed at the same-origin path. Two nginx bugs found and fixed here: `proxy_pass` with a bare variable ignores `rewrite` and forwards the original URI (404s with an empty error log), and a variable upstream omits SNI unless `proxy_ssl_server_name` is set.
- [x] 5.4 Cache: verified `X-Cache-Status: MISS` then `HIT` on a repeat fetch. `max_size` enforcement not exercised (would need to fill the cache).
- [ ] 5.5 *(needs a running stack.)* Confirm the generated privacy page matches the configured mode in both directions (provider named / no third-party row).
- [ ] 5.6 *(needs a running stack.)* With proxying on, confirm CSP can be tightened to `img-src 'self' data:` without breaking the map, and decide whether to do so in this change or follow up.
- [x] 5.7 Verified: several tile requests produced **zero** access-log lines, while a page load in the same session was logged normally — so logging is working and only the tile path is exempt (D8).
- [ ] 5.8 *(needs a running stack.)* Vector: confirm the tuned style renders and complete/partial/missing remain distinguishable against park and landcover fills, that zooming to z21 issues no requests above the tileset's `maxzoom: 14`, and that glyphs and sprites are fetched same-origin (devtools shows no third-party host).
- [ ] 5.9 *(needs a running stack.)* Local delivery: confirm every basemap request is answered from local storage and none reaches a provider, including on a deliberate cache-miss-shaped request.
- [ ] 5.10 *(needs a running stack.)* Pan beyond the covered area and confirm the result is not silently blank tiles presented as valid map data (D9).
- [x] 5.11 `make test` and `make build`.

## 6. Follow-ups explicitly not in this change

- [ ] 6.1 Confirm redistribution rights for the chosen tileset (`design.md` Open Question 2a) — the load-bearing unknown on the recommended path. CARTO's and basemap.de's terms are both moot now that neither is a candidate.
- [ ] 6.2 **Maintainer decision:** adopt a mirrored vector basemap as the shipped default (D10), which changes the cartographic appearance of every deployment, or keep CARTO as the default and leave the privacy-first configuration opt-in.
- [ ] 6.3 Extending coverage beyond Germany, Czechia and Slovakia as further regions join the federation — a tileset-extent and disk question once vector and local serving exist, not a new architecture.
- [ ] 6.4 Re-measure tile weight over a realistic session rather than one column of tiles, if the weight difference turns out to matter in practice.

## Review Findings (code review, 2026-09-08) — all applied

Four adversarial review layers over the implementation diff. Every claim below was
verified against the files before being recorded.

### Decisions needed

- [x] [Review][Decision] Proxying is silently bypassed when a vector style is set — the entrypoint rewrites only `SAFE_BASEMAP_URL`, while `basemapIsVector` gives the style precedence, so `BASEMAP_PROXY_UPSTREAM` + `BASEMAP_STYLE_URL` yields fully direct third-party delivery with the proxy running and unused. Reject the combination loudly, or route the style and its assets through the proxy? [oci/app/docker-entrypoint.sh:72-76]
- [x] [Review][Decision] Proxied delivery discards the operator's tile template — `/tiles/{z}/{x}/{y}.png` is hardcoded, so a `{z}/{y}/{x}` provider is proxied with axes swapped and non-`.png` is impossible, making D9's own recommended configuration unimplementable. Add a `BASEMAP_TILE_PATH` var, or derive the path from `BASEMAP_URL`? [oci/app/docker-entrypoint.sh:74]
- [x] [Review][Decision] A vector style that fails to load leaves a blank ground with no fallback and nothing in the UI, while `basemapUrl` still holds a working raster template. Fall back to raster, or keep the blank and document the choice? [app/src/components/Map.svelte:171-190]

### Patches — high

- [x] [Review][Patch] `compose.yml` never passes any `BASEMAP_*` variable to the app service, so the whole feature is inert through the documented `make up` workflow [compose.yml:164]
- [x] [Review][Patch] `attributions` is a source option in OpenLayers, not a layer option, so the vector path silently drops the configured attribution [app/src/components/Map.svelte:172]
- [x] [Review][Patch] Empty `BASEMAP_ATTRIBUTION` falls back to the CARTO string, showing one provider's attribution over another's tiles — the licence failure the spec scenario "Provider set without attribution" exists to prevent [app/src/lib/config.js:37]
- [x] [Review][Patch] `location ~ ^/tiles/(?<tile_path>.*)$` is unconstrained, making the instance an open forwarding proxy that caches arbitrary upstream paths for 30 days [oci/app/docker-entrypoint.sh:109]
- [x] [Review][Patch] `safe_tile_url` retains `;`, `{`, `}` and `#` and is applied to the proxy upstream, which is interpolated into generated nginx config; no scheme check either [oci/app/docker-entrypoint.sh:51,70]
- [x] [Review][Patch] Docs present "mirrored" as "No provider is contacted at request time at all" and `.env.example` points at the bundled style, but the committed `style.json` fetches tiles, glyphs and sprites from `tiles.openfreemap.org`; the entrypoint compounds it by deriving an empty provider host for any `/`-prefixed style [docs/ops/configuration.md, oci/app/docker-entrypoint.sh:86]
- [x] [Review][Patch] No test at any layer covers the new logic; `tests/helpers.js` injects a config with no basemap keys, so the config to Map wiring could regress to hardcoded values undetected [tests/helpers.js:10-22]

### Patches — medium

- [x] [Review][Patch] `proxy_hide_header Cookie` is a no-op — it filters response headers, so visitor cookies are still forwarded upstream; needs `proxy_set_header Cookie ""` [oci/app/docker-entrypoint.sh:138]
- [x] [Review][Patch] Cache sanitiser strips decimal points: `4.5g` silently becomes `45g`, `10 GB` becomes an nginx-fatal `10GB` [oci/app/docker-entrypoint.sh:91-95]
- [x] [Review][Patch] `add_header` inside `/tiles/` cancels inheritance of the server-level CSP, `nosniff`, `Referrer-Policy` and `Permissions-Policy` [oci/app/docker-entrypoint.sh:146,155]
- [x] [Review][Patch] `fetch('basemap/world-110m.json')` is document-relative; under a region path with a trailing slash the SPA fallback returns `index.html` with 200 and the outline is silently absent [app/src/components/Map.svelte:81]
- [x] [Review][Patch] `build-basemap-style.py` writes the output before the "no layers matched" check, so a failed rebuild overwrites the vendored style with an unedited upstream copy [tools/build-basemap-style.py:157,170]
- [x] [Review][Patch] `desaturate()` recurses into lists but not dicts, so legacy `{base, stops}` paint values keep full saturation while the layer is still reported as recoloured [tools/build-basemap-style.py:82-89]
- [x] [Review][Patch] `desaturate_hex` drops the alpha channel of 8-digit hex and returns 4-digit shorthand untouched [tools/build-basemap-style.py:57-66]
- [x] [Review][Patch] `--asset-base` pops `sources[*].url` without preserving `minzoom`/`maxzoom`, so the client requests z15-21 instead of overzooming z14 [tools/build-basemap-style.py:111-115]
- [x] [Review][Patch] The only documented proxy example cannot work: OpenFreeMap is vector-only and its raster path 403s, a fact this change's own design records [.env.example:29]
- [x] [Review][Patch] `docs/user-guide.md`, `docs/ops/security.md` and `docs/source-tree-analysis.md` still state CartoDB as fact; the user-guide line is a privacy statement to end users [docs/]
- [x] [Review][Patch] Proxy upstream is unvalidated for missing scheme and trailing slash — both produce runtime 500s or doubled paths rather than a startup error [oci/app/docker-entrypoint.sh:122]
- [x] [Review][Patch] `safe_attribution` leaves operator-supplied raw HTML that OpenLayers injects into the DOM; document it as trusted input or allowlist `<a href>` [oci/app/docker-entrypoint.sh:57]
- [x] [Review][Patch] No CI leg runs the entrypoint or validates the generated nginx config; the docker job is gated to pushes on main/tags, so a malformed heredoc reaches operators green [.github/workflows/]
- [x] [Review][Patch] The tile cache writes to the container layer with no named volume, so `make docker-build` destroys it; the `4g`/`90d` guidance implies a persistence that does not exist [oci/app/docker-entrypoint.sh:99]

### Patches — low

- [x] [Review][Patch] `expires 30d` and `add_header Cache-Control` both fire, emitting a duplicate header [oci/app/docker-entrypoint.sh:155-156]
- [x] [Review][Patch] `loadMacroOutline` resets `macroOutlineLoaded = false` in its catch, so a persistently failing asset refetches on every entry into the macro tier [app/src/components/Map.svelte:92]
- [x] [Review][Patch] `GREEN_LAYERS` contains `landcover-farmland`, which does not exist in the style — a dead entry with no signal, since only the all-miss case warns [tools/build-basemap-style.py:42-45]
- [x] [Review][Patch] `.env.example` defines `BASEMAP_URL` twice, the second labelled "not a recommendation" [.env.example:15,40]
- [x] [Review][Patch] `X-Cache-Status` is exposed to every visitor, letting a client probe whether a tile was recently requested by someone else [oci/app/docker-entrypoint.sh:146]
- [x] [Review][Patch] Provider-host derivation mishandles protocol-relative URLs, ports and userinfo [oci/app/docker-entrypoint.sh:83-86]
- [x] [Review][Patch] `build-macro-outline.py`: no empty-ring guard, fails on 3D coordinates and null/GeometryCollection geometry, and neither tool creates its output directory [tools/build-macro-outline.py:31-54]
- [x] [Review][Patch] Neither make target guards on `python3`, unlike the repo's `require-npm`/`require-docker` pattern [Makefile]
- [x] [Review][Patch] CLAUDE.md files the two `tools/` scripts under the table headed "Ops scripts (`scripts/`)", and `docs/contributing/frontend-guide.md` is not updated for the new layers [CLAUDE.md]
- [x] [Review][Patch] Task 2a.6 is marked done while 5.8 defers the same verification as "needs a running stack"; section 5 also places its blocked note before the task number, unlike every other section [tasks.md]

### Deferred

- [x] [Review][Defer] Neither build tool records an upstream checksum or fetch date, so the "reproducible and re-derivable" claim cannot be checked against a later upstream — deferred, enhancement rather than defect
- [x] [Review][Defer] The docker job is gated to pushes on main and tags, so images are never built on PRs — deferred, pre-existing CI policy that predates this change
