# External Services

spieli integrates with the following free external services.
They fall into groups, and the distinction matters for privacy: what the visitor's browser contacts directly, what it contacts only on a click, and what only this server ever contacts.

## Contacted by the visitor's browser

Most of what used to be here is gone: geocoding, the Commons API, the playground photo bytes and reviews are all fetched **server-side** through a cache on this instance, so the browser only connects to the instance itself.

**Two** things still reach a third party directly, and both are deliberate rather than unfinished.

| Service | Host | What still goes direct | Why it is not proxied |
|---|---|---|---|
| [Panoramax](https://panoramax.xyz) | `api.panoramax.xyz` | Street-level photo **thumbnails** always; the **viewer** only after the visitor activates it | The thumbnail endpoint answers `308` with a `Location` on a per-instance derivative host (`panoramax.openstreetmap.fr` for the flagship). nginx cannot follow a redirect, and Panoramax is a federation whose derivative hosts are not ours to enumerate. The viewer is an `<iframe>`: serving a whole interactive application from this origin would grant it same-origin privileges here. See [#863](https://github.com/mfuhrmann/spieli/issues/863) |
| [OpenStreetMap notes](https://wiki.openstreetmap.org/wiki/Notes) | `api.openstreetmap.org` (`OSM_NOTES_URL`) | A "Missing a playground?" hint, **only when the visitor presses Send**; a sent hint's status, only when the visitor taps its pin. Never on plain map use. No cookies, no referrer | A proxy would send every anonymous note from this server's one address, which is exactly what OSM's spam limits look for. Turn it off with `OSM_NOTES_URL=false`. See [#1000](https://github.com/mfuhrmann/spieli/issues/1000) |

It is named in the generated Content Security Policy and keeps its rows on the generated privacy page.

### Proxied by default

| Service | Host | Same-origin path | Opt out with |
|---|---|---|---|
| [Nominatim](https://nominatim.openstreetmap.org) | `nominatim.openstreetmap.org` | `/ext/nominatim/` | `PROXY_NOMINATIM=false` |
| [Wikimedia Commons](https://commons.wikimedia.org) | `commons.wikimedia.org` (API), `upload.wikimedia.org` and `thumb.wikimedia.org` (files) | `/ext/commons/`, `/ext/wikimedia/<host>/` | `PROXY_COMMONS=false` |
| [OpenStreetMap wiki](https://wiki.openstreetmap.org) | `wiki.openstreetmap.org` | `/ext/wikimedia/<host>/` | `PROXY_COMMONS=false` |
| [Mangrove.reviews](https://mangrove.reviews) | `api.mangrove.reviews` | `/ext/mangrove/` | `PROXY_MANGROVE=false` |

Opting a service out restores the old behaviour for it: the browser contacts that host directly, the generated CSP names it, and the privacy page grows its row back. See [Security Hardening](../ops/security.md#nginx-security-headers).

### Equipment illustrations come through the same proxy

The example illustrations of devices and pitches are served from this instance via `/ext/wikimedia/`, like the photo gallery. Their file names are resolved once at build time, so the browser never contacts Commons or the OSM wiki for them. How that works: [Frontend Guide → External services](../contributing/frontend-guide.md#external-services-implementation-notes).

Serving these bytes through our own origin makes us their distributor, so the CC attribution obligation is ours rather than Commons'. The author and licence are rendered under each illustration where the wiki exposes them; the OSM wiki returns no `extmetadata`, so its 14 files carry no credit.

### The Panoramax viewer waits to be asked

Selecting a playground that has street-level photos fetches the **thumbnail** — a plain image request — and nothing else. The viewer `<iframe>` is created only when the visitor activates the preview.

This matters more than the thumbnail does. An iframe gets its own browsing context on `api.panoramax.xyz`, with cookies, `localStorage` and whatever script the provider runs there; probing the live viewer shows it attempting to set a Matomo `_pk_id` analytics cookie. That is persistent identification rather than an address in a log, and it is the strongest capability any third party has on this page.

When it is created, the iframe carries `referrerpolicy="no-referrer"` and `sandbox="allow-scripts allow-same-origin"`. That token set was established by probing the live viewer, not assumed: with `allow-scripts` alone the viewer renders nothing at all.

**Be clear about what that sandbox does and does not do.** `allow-same-origin` gives the frame its real origin back, which is what the viewer needs to work — and which means cookies and `localStorage`, including the Matomo cookie above, behave exactly as they would unsandboxed. The sandbox is not what protects the visitor from that. What it still withholds is popups, form submission, top-level navigation and downloads, so a share or "open in Panoramax" link inside the viewer will not work.

**The click gate is the control.** It is what stops that browsing context existing at all unless the visitor asks for it, and closing the viewer destroys the iframe again, so it does not outlive their interest. Dropping `allow-same-origin` would block the cookie but leaves nothing rendered, which is not a trade worth making silently.

### What the proxies do and do not do

- **Nothing is logged.** Every proxy location sets `access_log off`. This is a correctness property, not a tuning choice: proxying moves the visitor's request stream onto the operator's disk, and recording it would rebuild the per-visitor trail this design exists to remove — leaving the operator as controller of something worse than what was replaced. Errors are still logged.
- **The visitor is not identified upstream.** `Cookie`, `Referer`, `Accept-Language`, `X-Forwarded-For` and `X-Real-IP` are cleared on the outbound request, and the `User-Agent` identifies spieli and the instance rather than the visitor's browser.
- **There is no fallback to direct delivery.** If an upstream is unreachable the feature fails. A fallback would disclose exactly the addresses the proxy protects, at the moment something is already wrong, and would do it invisibly.
- **Nominatim is rate-limited by construction.** The OSMF usage policy is an absolute 1 request per second. The limiter sits on an internal loopback server so that only cache *misses* reach it — on the visitor-facing location it would shed requests that were already cached, because `limit_req` runs before the cache lookup. When it does shed, a stale cached answer is served if one is held.
- **Opening reviews is two or three requests, not one.** Mangrove matches a review on its coordinates *and* its `q` label, and clients file playgrounds under different labels: spieli used `osm_playground_<id>`, MapComplete and mangrove.reviews use `playground` or the place's name. To show all of them, the reviews section asks once per label and merges the answers (#914); new reviews are written under the shared label. Same host, same trigger (expanding the section), same proxy and session cache — only the count changes.
- **Reviews still verify.** The Mangrove submit path is a `PUT` whose signature covers the JWT's own claims, so the proxy is transparent to verification. Submission through the proxy is accepted by Mangrove exactly as a direct one is.

Three consequences worth being explicit about:

- **The basemap is not in the browser-contacted group, and that is the point.** It used to be the largest entry in it, contacted by every visitor on every map movement. It is now fetched server-side and cached. See [Basemap](../ops/basemap-and-services.md#basemap).
- **Reviews create a persistent pseudonymous identifier.** `app/src/lib/reviews.js` generates a P-256 keypair on the first review submission and stores it in `localStorage` under `spieli-mangrove-keypair`. It is not created by merely viewing the map. Proxying does not change this: the keypair is the visitor's identity to Mangrove, not an address.
- **A panel section that is collapsed by default contacts nothing.** `PlaygroundPanel.svelte` mounts each accordion section's component only while that section is open (`openSections`, default `['photos', 'equipment', 'pois']`), so a closed section's fetch code never runs. Reviews are closed by default; photos are open. Reading a fetch call alone gives the wrong answer — check the section's default state too.

Operators must disclose all of the above.
`oci/app/datenschutz.template.html` ships a service table that already does; keep the two in sync when a service is added or removed.

## Server-side only

Contacted by the importer or the container, never by the visitor's browser.

| Service | Purpose |
|---|---|
| [Geofabrik](https://download.geofabrik.de) | Source of OSM PBF extracts for import |
| [OpenFreeMap](https://openfreemap.org) / [OpenMapTiles](https://www.openmaptiles.org) | Background map tiles, fetched **server-side and cached**. Configurable via `BASEMAP_UPSTREAM`, including pointing it at a tileserver you run yourself. See [Basemap and external services](../ops/basemap-and-services.md#basemap) and [Shared Basemap Cache](../ops/shared-basemap-cache.md). |

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
