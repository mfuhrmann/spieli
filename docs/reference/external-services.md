# External Services

spieli integrates with the following free external services.
They fall into three groups, and the distinction matters for privacy: only the first group is contacted by the visitor's browser.

## Contacted by the visitor's browser

Each of these receives the visitor's IP address, User-Agent and `Referer` by construction, because the browser connects to them directly.
The "Also receives" column lists what is sent on top of that.

| Service | Host | Purpose | Contacted when | Also receives |
|---|---|---|---|---|
| [Nominatim](https://nominatim.openstreetmap.org) | `nominatim.openstreetmap.org` | Location search, region-URL resolution | On a search query, and on loading a region URL such as `/fulda` | The search term |
| [Panoramax](https://panoramax.xyz) | `api.panoramax.xyz` | Street-level photos | Selecting a playground that has photos | The requested photo UUID. The viewer is embedded in an `<iframe>`, so Panoramax runs in its own browsing context and can set its own storage there |
| [Wikimedia Commons](https://commons.wikimedia.org) | `commons.wikimedia.org`, `upload.wikimedia.org` | Playground photos from `wikimedia_commons` / `image` tags | Selecting a playground carrying either tag | The requested file name |
| [Mangrove.reviews](https://mangrove.reviews) | `api.mangrove.reviews` | Pseudonymous community reviews | Only after the visitor expands the "Reviews" section: once for that playground, then once per further playground selected while the section stays expanded. Never on selection alone, and never before the section is opened. Again on submitting a review | Playground coordinates. On submit: the rating, optional comment, and the browser-held public key |

Playground data itself is served by the instance's own PostgREST, so it never leaves the operator's server.

Two consequences worth being explicit about:

- **The basemap is not in this table, and that is the point.** It used to be the largest entry in it, contacted by every visitor on every map movement. It is now fetched server-side and cached, so the browser only ever talks to the instance itself. See the next section.
- **Reviews create a persistent pseudonymous identifier.** `app/src/lib/reviews.js` generates a P-256 keypair on the first review submission and stores it in `localStorage` under `spieli-mangrove-keypair`. It is not created by merely viewing the map.
- **A panel section that is collapsed by default contacts nothing.** `PlaygroundPanel.svelte` mounts each accordion section's component only while that section is open (`openSections`, default `['photos', 'equipment', 'pois']`), so a closed section's fetch code never runs. Reviews are closed by default and are therefore not contacted on selection, even though `ReviewsPanel` fetches on mount. Reading the fetch call alone gives the wrong answer — check the section's default state too. Conversely, photos *are* open by default, which is why Panoramax and Commons are contacted on selection.
- **A re-opened section does not re-fetch.** `fetchReviewsCached` in `app/src/lib/reviews.js` holds a per-page in-memory cache keyed on the Mangrove subject URI, so collapsing and re-expanding, or returning to a playground already seen, issues no further request. It is dropped after a submission so the visitor sees their own review, and it is deliberately not `localStorage`.

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
That is a statement about spieli's own code, not about the assembled page: the third-party services in the first table each receive the visitor's IP address, and spieli has no control over what they do with it.
Claiming outright that spieli "does not track users" overstates this, so do not write that.
