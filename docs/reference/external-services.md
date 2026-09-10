# External Services

spieli integrates with the following free external services.
They fall into groups, and the distinction matters for privacy: what the visitor's browser contacts directly, what it contacts only on a click, and what only this server ever contacts.

## Contacted by the visitor's browser

**By default, nothing is.** Every service below is fetched server-side through a cache on this instance, so the visitor's browser only ever connects to the instance itself. One exception is listed further down.

That is a change from earlier releases, where each of these was contacted directly by the browser and received the visitor's IP address, `User-Agent` and `Referer` by construction.

| Service | Host | Purpose | Same-origin path | Opt out with |
|---|---|---|---|---|
| [Nominatim](https://nominatim.openstreetmap.org) | `nominatim.openstreetmap.org` | Location search, region-URL resolution | `/ext/nominatim/` | `PROXY_NOMINATIM=false` |
| [Wikimedia Commons](https://commons.wikimedia.org) | `commons.wikimedia.org` (API), `upload.wikimedia.org` and `thumb.wikimedia.org` (files) | Playground photos from `wikimedia_commons` / `image` tags | `/ext/commons/`, `/ext/wikimedia/<host>/` | `PROXY_COMMONS=false` |
| [Mangrove.reviews](https://mangrove.reviews) | `api.mangrove.reviews` | Pseudonymous community reviews, read and submit | `/ext/mangrove/` | `PROXY_MANGROVE=false` |
| [Panoramax](https://panoramax.xyz) | `api.panoramax.xyz` | Street-level photo **thumbnails** | `/ext/panoramax/` | `PROXY_PANORAMAX=false` |

Opting a service out restores the old behaviour for it: the browser contacts that host directly, and the generated Content Security Policy names it. See [Security Hardening](../ops/security.md#nginx-security-headers).

### The one thing the browser still contacts

The **Panoramax viewer** is an `<iframe>` on `api.panoramax.xyz`, and it is deliberately *not* proxied. Serving a whole interactive third-party application from this instance's own origin would give it same-origin privileges here — access to this site's storage, and a document able to script the embedding page's origin. That is strictly worse than a cross-origin iframe.

An iframe is also not an image: it gets its own browsing context, with cookies, `localStorage` and whatever script the provider runs. It is the strongest capability any third party has on the page. Gating it behind an explicit click is tracked in [#852](https://github.com/mfuhrmann/spieli/issues/852); until then, selecting a playground that has street-level photos does load it.

Thumbnails are plain `<img>` requests and are proxied like everything else.

### What the proxies do and do not do

- **Nothing is logged.** Every proxy location sets `access_log off`. This is a correctness property, not a tuning choice: proxying moves the visitor's request stream onto the operator's disk, and recording it would rebuild the per-visitor trail this design exists to remove — leaving the operator as controller of something worse than what was replaced. Errors are still logged.
- **The visitor is not identified upstream.** `Cookie`, `Referer`, `Accept-Language`, `X-Forwarded-For` and `X-Real-IP` are cleared on the outbound request, and the `User-Agent` identifies spieli and the instance rather than the visitor's browser.
- **There is no fallback to direct delivery.** If an upstream is unreachable the feature fails. A fallback would disclose exactly the addresses the proxy protects, at the moment something is already wrong, and would do it invisibly.
- **Nominatim is rate-limited by construction.** The OSMF usage policy is an absolute 1 request per second. The limiter sits on an internal loopback server so that only cache *misses* reach it — on the visitor-facing location it would shed requests that were already cached, because `limit_req` runs before the cache lookup. When it does shed, a stale cached answer is served if one is held.
- **Reviews still verify.** The Mangrove submit path is a `PUT` whose signature covers the JWT's own claims, so the proxy is transparent to verification. Submission through the proxy is accepted by Mangrove exactly as a direct one is.

Three consequences worth being explicit about:

- **The basemap is not in the browser-contacted group, and that is the point.** It used to be the largest entry in it, contacted by every visitor on every map movement. It is now fetched server-side and cached. See [Basemap](../ops/configuration.md#basemap).
- **Reviews create a persistent pseudonymous identifier.** `app/src/lib/reviews.js` generates a P-256 keypair on the first review submission and stores it in `localStorage` under `spieli-mangrove-keypair`. It is not created by merely viewing the map. Proxying does not change this: the keypair is the visitor's identity to Mangrove, not an address.
- **A panel section that is collapsed by default contacts nothing.** `PlaygroundPanel.svelte` mounts each accordion section's component only while that section is open (`openSections`, default `['photos', 'equipment', 'pois']`), so a closed section's fetch code never runs. Reviews are closed by default; photos are open. Reading a fetch call alone gives the wrong answer — check the section's default state too.

Two things that are fine and worth recording so they are not re-investigated:

- **Commons URLs from OSM tags are host-validated** in `app/src/lib/commons.js` before rendering, so a crafted `image` tag cannot point the browser at an arbitrary host. The Content Security Policy is a second line behind that check, not a replacement for it. Both are tested: `tests/hostile-image-tag.spec.js` and the `CSP must follow the configuration` CI job.
- **Which Wikimedia host serves a file is not fixed.** The imageinfo API currently returns thumbnails on `thumb.wikimedia.org` and originals on `upload.wikimedia.org`. `proxiedImageUrl` therefore carries the original host in the proxy path rather than assuming one; a rewrite pinned to a single host silently sends every thumbnail straight to Wikimedia while appearing to work.

Operators must disclose all of the above.
`oci/app/datenschutz.template.html` ships a service table that already does; keep the two in sync when a service is added or removed.

## Server-side only

Contacted by the importer or the container, never by the visitor's browser.

| Service | Purpose |
|---|---|
| [Geofabrik](https://download.geofabrik.de) | Source of OSM PBF extracts for import |
| [OpenFreeMap](https://openfreemap.org) / [OpenMapTiles](https://www.openmaptiles.org) | Background map tiles, fetched **server-side and cached**. Configurable via `BASEMAP_UPSTREAM`, including pointing it at a tileserver you run yourself. See [Security](../ops/security.md#the-basemap-is-same-origin-by-default) and [Shared Basemap Cache](../ops/shared-basemap-cache.md). |

An operator can move the basemap back into the first group by setting `BASEMAP_URL` or `BASEMAP_STYLE_URL` to a third party. That is a deliberate opt-out, it requires `BASEMAP_ATTRIBUTION`, and the generated Datenschutzerklärung names the provider when it happens.

## Linked, not embedded

Reached only when the visitor clicks a link, so no data is transferred until they do.

| Service | Purpose |
|---|---|
| [MapComplete](https://mapcomplete.org) | Contribute photos and equipment |
| [Wikidata](https://wikidata.org) | Operator entity linking |
| [OpenStreetMap](https://www.openstreetmap.org) | Source data, editing, directions |

## On tracking

All map data comes from OpenStreetMap or the free services listed above, and there is no proprietary data and there are no user accounts.

spieli itself sets no cookies, runs no analytics and profiles no one.

That has historically been a statement about spieli's own code rather than about the assembled page, because the third-party services were contacted directly by the browser and each received the visitor's IP address. Since #853 they are fetched server-side, so in a default deployment the only third party the browser reaches is a Panoramax viewer iframe on a playground that has street-level photos.

Even so, do not write that spieli "does not track users" as a claim of fact. It is a statement about design posture: it depends on the deployment's configuration, an operator can opt any proxy out, and the iframe above is a real exception. Describe what the code does and let the reader draw the conclusion.
