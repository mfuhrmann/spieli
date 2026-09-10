# External Services

spieli integrates with the following free external services.
They fall into groups, and the distinction matters for privacy: what the visitor's browser contacts directly, what it contacts only on a click, and what only this server ever contacts.

## Contacted by the visitor's browser

Most of what used to be here is gone: geocoding, the Commons API, the playground photo bytes and reviews are all fetched **server-side** through a cache on this instance, so the browser only connects to the instance itself.

**One** thing still reaches a third party directly, and it is deliberate rather than unfinished.

| Service | Host | What still goes direct | Why it is not proxied |
|---|---|---|---|
| [Panoramax](https://panoramax.xyz) | `api.panoramax.xyz` | Street-level photo **thumbnails** always; the **viewer** only after the visitor activates it | The thumbnail endpoint answers `308` with a `Location` on a per-instance derivative host (`panoramax.openstreetmap.fr` for the flagship). nginx cannot follow a redirect, and Panoramax is a federation whose derivative hosts are not ours to enumerate. The viewer is an `<iframe>`: serving a whole interactive application from this origin would grant it same-origin privileges here. See [#863](https://github.com/mfuhrmann/spieli/issues/863) |

It is named in the generated Content Security Policy and keeps its rows on the generated privacy page.

### Proxied by default

| Service | Host | Same-origin path | Opt out with |
|---|---|---|---|
| [Nominatim](https://nominatim.openstreetmap.org) | `nominatim.openstreetmap.org` | `/ext/nominatim/` | `PROXY_NOMINATIM=false` |
| [Wikimedia Commons](https://commons.wikimedia.org) | `commons.wikimedia.org` (API), `upload.wikimedia.org` and `thumb.wikimedia.org` (files) | `/ext/commons/`, `/ext/wikimedia/<host>/` | `PROXY_COMMONS=false` |
| [OpenStreetMap wiki](https://wiki.openstreetmap.org) | `wiki.openstreetmap.org` | `/ext/wikimedia/<host>/` | `PROXY_COMMONS=false` |
| [Mangrove.reviews](https://mangrove.reviews) | `api.mangrove.reviews` | `/ext/mangrove/` | `PROXY_MANGROVE=false` |

Opting a service out restores the old behaviour for it: the browser contacts that host directly, the generated CSP names it, and the privacy page grows its row back. See [Security Hardening](../ops/security.md#nginx-security-headers).

### Equipment illustrations are resolved at build time

The device and pitch tables name their illustrations as MediaWiki `File:` titles. Turning one into a URL used to mean a `Special:FilePath` request, which is a redirect chain, and that chain cannot be proxied without allowing `/w/index.php` — a full MediaWiki entry point — through the cache.

So the redirect is followed at **build time** instead. `tools/build-equipment-images.py` resolves each name against Commons and then the OSM wiki, and commits `app/src/lib/equipmentImages.generated.json` holding the real file URL plus author and licence. Rebuild it with `make equipment-images`.

Three things follow from that, and each fixed a real defect:

- **The bytes come from this instance.** The resolved URL is an ordinary image path on a MediaWiki file host, which `/ext/wikimedia/<host>/` already serves.
- **The OSM wiki is no longer an undisclosed host.** 14 of the 99 illustrations exist only there, and the frontend used to reach them through an `<img onerror>` fallback that appeared in neither this page nor the CSP. It is listed above now, and it is proxied like the rest.
- **A name that resolves nowhere fails the build.** 14 of them did, all pitch illustrations, and in production each one cost two failing requests before an `onerror` handler hid the element. They are listed in the script's `KNOWN_MISSING` set so a *fifteenth* fails the build instead of joining them quietly, and are tracked as a data bug.

Serving these bytes through our own origin makes us their distributor, so the CC attribution obligation is ours rather than Commons'. The author and licence are rendered under each illustration where the wiki exposes them; the OSM wiki returns no `extmetadata`, so its 14 files carry no credit.

### The Panoramax viewer waits to be asked

Selecting a playground that has street-level photos fetches the **thumbnail** — a plain image request — and nothing else. The viewer `<iframe>` is created only when the visitor activates the preview.

This matters more than the thumbnail does. An iframe gets its own browsing context on `api.panoramax.xyz`, with cookies, `localStorage` and whatever script the provider runs there; probing the live viewer shows it attempting to set a Matomo `_pk_id` analytics cookie. That is persistent identification rather than an address in a log, and it is the strongest capability any third party has on this page.

When it is created, the iframe carries `referrerpolicy="no-referrer"` and `sandbox="allow-scripts allow-same-origin"`. That token set was established by probing the live viewer, not assumed: with `allow-scripts` alone the viewer renders nothing at all.

**Be clear about what that sandbox does and does not do.** `allow-same-origin` gives the frame its real origin back, which is what the viewer needs to work — and which means cookies and `localStorage`, including the Matomo cookie above, behave exactly as they would unsandboxed. The sandbox is not what protects the visitor from that. What it still withholds is popups, form submission, top-level navigation and downloads, so a share or "open in Panoramax" link inside the viewer will not work.

**The click gate is the control.** It is what stops that browsing context existing at all unless the visitor asks for it, and closing the viewer destroys the iframe again, so it does not outlive their interest. Dropping `allow-same-origin` would block the cookie but leaves nothing rendered, which is not a trade worth making silently.

### Proxied by default

| Service | Host | Same-origin path | Opt out with |
|---|---|---|---|
| [Nominatim](https://nominatim.openstreetmap.org) | `nominatim.openstreetmap.org` | `/ext/nominatim/` | `PROXY_NOMINATIM=false` |
| [Wikimedia Commons](https://commons.wikimedia.org) | `commons.wikimedia.org` (API), `upload.wikimedia.org` and `thumb.wikimedia.org` (files) | `/ext/commons/`, `/ext/wikimedia/<host>/` | `PROXY_COMMONS=false` |
| [Mangrove.reviews](https://mangrove.reviews) | `api.mangrove.reviews` | `/ext/mangrove/` | `PROXY_MANGROVE=false` |

Opting a service out restores the old behaviour for it: the browser contacts that host directly, the generated CSP names it, and the privacy page grows its row back. See [Security Hardening](../ops/security.md#nginx-security-headers).

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
