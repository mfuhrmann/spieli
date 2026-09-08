## 1. Thread the basemap source through configuration

- [ ] 1.1 Add `basemapUrl` and `basemapAttribution` to `app/public/config.js` with today's CARTO values as the checked-in dev defaults.
- [ ] 1.2 Export `basemapUrl` / `basemapAttribution` from `app/src/lib/config.js`, reading `window.APP_CONFIG` with the same fallback, matching the existing `c.x ?? default` pattern.
- [ ] 1.3 Replace the literals in the `XYZ` source at `app/src/components/Map.svelte:135` with the config constants. Confirm the `{a-d}` subdomain template still resolves when supplied via config.
- [ ] 1.4 Render `BASEMAP_URL` / `BASEMAP_ATTRIBUTION` into `config.js` in `oci/app/docker-entrypoint.sh`, following the escaping already used for the other rendered values.
- [ ] 1.5 Add both vars to `.env.example` with commented alternatives (including the basemap.de `{z}/{y}/{x}` endpoint from #823, which exercises the axis-order case).

## 2. Add proxied delivery

- [ ] 2.1 Add a `proxy_cache_path` and a `location /tiles/` block to `oci/app/nginx.conf`, emitted only when `BASEMAP_PROXY_UPSTREAM` is set. Follow the existing `/api/` block's use of the Docker resolver.
- [ ] 2.2 Set a truthful `User-Agent` on the proxied upstream request identifying spieli and the instance, since the operator's server is now the client rather than a browser.
- [ ] 2.3 Honour upstream cache headers; add `BASEMAP_CACHE_MAX_SIZE` (conservative default) and wire it into `proxy_cache_path max_size=`.
- [ ] 2.4 When proxying is enabled, point `basemapUrl` at the same-origin `/tiles/{z}/{x}/{y}.png` path in the generated `config.js`.
- [ ] 2.5 Verify no fallback path exists from proxied to direct (D3): an unreachable upstream must fail the tile, not reach the provider from the browser.
- [ ] 2.6 Decide whether the cache needs a named volume; if so, update `compose.yml` and apply the `requires-compose-update` label.

## 3. Make the disclosure follow the configuration

- [ ] 3.1 Replace the hardcoded CARTO row in `oci/app/datenschutz.template.html` (added in PR #826) with a placeholder rendered by the entrypoint, in the style of the existing `{{HUB_PRIVACY_SECTION}}` awk inlining.
- [ ] 3.2 Direct mode: emit a provider row naming the configured host, transmitting IP / User-Agent / Referer / tile coordinates.
- [ ] 3.3 Proxied mode: emit no third-party tile row, and state that tiles are served by this instance.
- [ ] 3.4 Re-check the "Übermittlung in Drittländer" section, which names CARTO today: it must reflect the configured provider and say nothing when tiles are proxied.
- [ ] 3.5 Confirm the rendered page still has no leftover `{{...}}` placeholders and parses cleanly, for both delivery modes and both app modes (the hub section interacts with the same awk pass).

## 4. Documentation

- [ ] 4.1 Document all four vars in `docs/ops/configuration.md`, including that operators are responsible for checking their chosen provider's terms (see Risks).
- [ ] 4.2 Update `docs/reference/external-services.md`: its browser-contacted table names CARTO specifically and must describe both delivery modes.
- [ ] 4.3 Note in the ops docs that proxied delivery moves tile egress onto the operator, with the caching-vs-coverage distinction from D4 stated plainly.
- [ ] 4.4 Run `make docs-build` to catch broken links.

## 5. Verify

- [ ] 5.1 Default config: `make docker-build`, confirm tiles still load from CARTO and attribution is unchanged.
- [ ] 5.2 Alternative provider: set the basemap.de endpoint, confirm tiles render (this is the `{z}/{y}/{x}` axis-order case) and attribution updates.
- [ ] 5.3 Proxied mode: confirm via browser devtools that **no** request leaves for the provider host, and that `/tiles/` returns tiles.
- [ ] 5.4 Cache: confirm a second view of the same area is served from cache, and that the cache directory respects `BASEMAP_CACHE_MAX_SIZE`.
- [ ] 5.5 Confirm the generated privacy page matches the configured mode in both directions (provider named / no third-party row).
- [ ] 5.6 With proxying on, confirm CSP can be tightened to `img-src 'self' data:` without breaking the map, and decide whether to do so in this change or follow up.
- [ ] 5.7 `make test` and `make build`.

## 6. Follow-ups explicitly not in this change

- [ ] 6.1 Answer the Open Questions in `design.md`, above all whether CARTO's terms permit proxying — it constrains which combinations are legal.
- [ ] 6.2 Decide the provider (#823 item 3) once those answers exist.
- [ ] 6.3 Measure tile weight across zoom levels properly, rather than from the single-tile sample in #823.
- [ ] 6.4 Macro-tier basemap (D6) — only needed if a Germany-only provider is chosen.
