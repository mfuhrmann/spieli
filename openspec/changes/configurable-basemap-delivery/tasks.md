## 1. Thread the basemap source through configuration

- [ ] 1.1 Add `basemapUrl` and `basemapAttribution` to `app/public/config.js` with today's CARTO values as the checked-in dev defaults.
- [ ] 1.2 Export `basemapUrl` / `basemapAttribution` from `app/src/lib/config.js`, reading `window.APP_CONFIG` with the same fallback, matching the existing `c.x ?? default` pattern.
- [ ] 1.3 Replace the literals in the `XYZ` source at `app/src/components/Map.svelte:135` with the config constants. Confirm the `{a-d}` subdomain template still resolves when supplied via config.
- [ ] 1.4 Render `BASEMAP_URL` / `BASEMAP_ATTRIBUTION` into `config.js` in `oci/app/docker-entrypoint.sh`, following the escaping already used for the other rendered values.
- [ ] 1.5 Add both vars to `.env.example`. Note that basemap.de is documented only as an axis-order example for the raster path, with an explicit warning that it covers Germany alone and returns blank 200s elsewhere (D9) — it must not read as a recommended value.

## 2. Add proxied delivery

- [ ] 2.1 Add a `proxy_cache_path` and a `location /tiles/` block to `oci/app/nginx.conf`, emitted only when `BASEMAP_PROXY_UPSTREAM` is set. Follow the existing `/api/` block's use of the Docker resolver.
- [ ] 2.2 Set a truthful `User-Agent` on the proxied upstream request identifying spieli and the instance, since the operator's server is now the client rather than a browser.
- [ ] 2.3 Honour upstream cache headers; add `BASEMAP_CACHE_MAX_SIZE` (conservative default) and wire it into `proxy_cache_path max_size=`.
- [ ] 2.4 When proxying is enabled, point `basemapUrl` at the same-origin `/tiles/{z}/{x}/{y}.png` path in the generated `config.js`.
- [ ] 2.5 Verify no fallback path exists from proxied to direct (D3): an unreachable upstream must fail the tile, not reach the provider from the browser.
- [ ] 2.6 Set `access_log off` on the `/tiles/` location (D8) so proxying does not write a per-visitor location trail to the operator's disk. Keep error-level logging so upstream failures stay diagnosable.
- [ ] 2.7 Confirm nothing else logs the tile stream: check for a server-level `access_log` that the location does not override, and for any upstream reverse proxy (Traefik on the federated host) that would log it instead.
- [ ] 2.8 Decide whether the cache needs a named volume; if so, update `compose.yml` and apply the `requires-compose-update` label.

## 2a. Vector basemap rendering (D10)

- [ ] 2a.1 Add `ol-mapbox-style` and render a configured vector style, alongside the existing raster `XYZ` path rather than replacing it.
- [ ] 2a.2 Add a style-URL configuration shape (`BASEMAP_STYLE_URL` or equivalent) and decide how it and `BASEMAP_URL` interact when both are set.
- [ ] 2a.3 Confirm overzoom works: the tileset caps at `maxzoom: 14` while `mapMaxZoom` is 21, so the client must render z15–21 from z14 tiles and issue no requests above the cap.
- [ ] 2a.4 Serve the style document, glyphs and sprites from the same origin as the tiles. Easy to miss, and if missed the browser still contacts a third party for fonts even though tiles are local.
- [ ] 2a.5 Check bundle-size impact; the build already warns above 500 kB.
- [ ] 2a.6 Confirm the vector basemap renders under both app modes and does not disturb the existing tier layer ordering.
- [ ] 2a.7 Adopt OpenFreeMap **Bright** as the style (D11) and vendor it, so the two edits below are ours to make and cannot be changed upstream underneath us.
- [ ] 2a.8 Desaturate `park`, `landcover_grass` and `landcover_wood` so the green channel belongs to playground completeness.
- [ ] 2a.9 Drop the `poi` symbol layers (`poi_r1`, `poi_r7`, `poi_r20`, `poi_transit`) — the strongest competitor for attention. Legibility only: measured, this does **not** improve render performance (D11), because the data is still decoded. Decide separately whether `poi_transit` stays dropped.
- [ ] 2a.10 Re-check completeness legibility against real data with the **tuned** style. The published comparison used stock styles; the shipped one will not be stock.

## 2b. Macro-tier basemap (D6)

- [ ] 2b.1 Add a bundled world-outline source (Natural Earth 1:110m or equivalent, no network request) as an OL layer.
- [ ] 2b.2 Wire its visibility into the existing `activeTierStore` subscription at `Map.svelte:432`, visible only when `tier === 'macro'`.
- [ ] 2b.3 Confirm the hub macro view reads correctly with a three-country tileset configured, and that the outline does not appear at cluster or polygon tiers.
- [ ] 2b.4 Check the added asset's effect on bundle size; the build already warns above 500 kB.

## 2c. Locally served tiles (D10)

- [ ] 2c.1 Choose the tileset source and confirm redistribution is permitted (Open Question 2a) before shipping instructions telling operators to serve a copy.
- [ ] 2c.2 Decide the storage format and how nginx serves it; if PMTiles, confirm HTTP range-request serving works through the existing nginx.
- [ ] 2c.3 Document fetching a Germany + Czechia + Slovakia extract and where it lives on disk, following the pattern the importer already uses for PBFs.
- [ ] 2c.4 Define the refresh cadence. Basemap data does not need minute freshness, but "never updated" is also wrong.
- [ ] 2c.5 Ensure a pan beyond the copied area does not render blank tiles as if they were valid map data (the basemap.de failure mode in D9).
- [ ] 2c.6 Measure the real on-disk size against the 73 GB bbox estimate, which is generous and includes sea and neighbour overlap.

## 3. Make the disclosure follow the configuration

- [ ] 3.1 Replace the hardcoded CARTO row in `oci/app/datenschutz.template.html` (added in PR #826) with a placeholder rendered by the entrypoint, in the style of the existing `{{HUB_PRIVACY_SECTION}}` awk inlining.
- [ ] 3.2 Direct mode: emit a provider row naming the configured host, transmitting IP / User-Agent / Referer / tile coordinates.
- [ ] 3.3 Proxied mode: emit no third-party tile row, and state that tiles are served by this instance.
- [ ] 3.4 Re-check the "Übermittlung in Drittländer" section, which names CARTO today: it must reflect the configured provider and say nothing when tiles are proxied.
- [ ] 3.5 Confirm the rendered page still has no leftover `{{...}}` placeholders and parses cleanly, for both delivery modes and both app modes (the hub section interacts with the same awk pass).

## 4. Documentation

- [ ] 4.1 Document all four vars in `docs/ops/configuration.md`, including that operators are responsible for checking their chosen provider's terms (see Risks).
- [ ] 4.2 Update `docs/reference/external-services.md`: its browser-contacted table names CARTO specifically and must describe both delivery modes.
- [ ] 4.3 Note in the ops docs that proxied delivery moves tile egress onto the operator, with the raster-vs-vector sizing distinction from D4 stated plainly.
- [ ] 4.4 Document the three delivery modes (direct / proxied / mirrored), the disk each needs, and the `keys_zone` and `inactive` traps from D4 — a large `max_size` with a default `keys_zone` yields a near-empty cache.
- [ ] 4.5 Document how to fetch and refresh the local tileset, and what happens at its coverage edge.
- [ ] 4.6 Run `make docs-build` to catch broken links.

## 5. Verify

- [ ] 5.1 Default config: `make docker-build`, confirm tiles still load from CARTO and attribution is unchanged.
- [ ] 5.2 Alternative raster provider: confirm a `{z}/{y}/{x}` template renders (the axis-order case) and that attribution updates with it.
- [ ] 5.3 Proxied mode: confirm via browser devtools that **no** request leaves for the provider host, and that `/tiles/` returns tiles.
- [ ] 5.4 Cache: confirm a second view of the same area is served from cache, and that the cache directory respects `BASEMAP_CACHE_MAX_SIZE`.
- [ ] 5.5 Confirm the generated privacy page matches the configured mode in both directions (provider named / no third-party row).
- [ ] 5.6 With proxying on, confirm CSP can be tightened to `img-src 'self' data:` without breaking the map, and decide whether to do so in this change or follow up.
- [ ] 5.7 With proxying on and a map panned across many tiles, confirm the access log contains **no** tile entries (D8) — the check that the privacy property actually holds, not just that the directive is present.
- [ ] 5.8 Vector: confirm the tuned style renders and complete/partial/missing remain distinguishable against park and landcover fills, that zooming to z21 issues no requests above the tileset's `maxzoom: 14`, and that glyphs and sprites are fetched same-origin (devtools shows no third-party host).
- [ ] 5.9 Local delivery: confirm every basemap request is answered from local storage and none reaches a provider, including on a deliberate cache-miss-shaped request.
- [ ] 5.10 Pan beyond the covered area and confirm the result is not silently blank tiles presented as valid map data (D9).
- [ ] 5.11 `make test` and `make build`.

## 6. Follow-ups explicitly not in this change

- [ ] 6.1 Confirm redistribution rights for the chosen tileset (`design.md` Open Question 2a) — the load-bearing unknown on the recommended path. CARTO's and basemap.de's terms are both moot now that neither is a candidate.
- [ ] 6.2 **Maintainer decision:** adopt a mirrored vector basemap as the shipped default (D10), which changes the cartographic appearance of every deployment, or keep CARTO as the default and leave the privacy-first configuration opt-in.
- [ ] 6.3 Extending coverage beyond Germany, Czechia and Slovakia as further regions join the federation — a tileset-extent and disk question once vector and local serving exist, not a new architecture.
- [ ] 6.4 Re-measure tile weight over a realistic session rather than one column of tiles, if the weight difference turns out to matter in practice.
