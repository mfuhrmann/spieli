# External Services

spieli integrates with the following free external services.
They fall into two groups, and the distinction matters for privacy: only the first group is contacted by the visitor's browser.

## Contacted by the visitor's browser

Each of these receives the visitor's IP address, User-Agent and `Referer` by construction, because the browser connects to them directly.
The "Also receives" column lists what is sent on top of that.

| Service | Host | Purpose | Contacted when | Also receives |
|---|---|---|---|---|
| [CartoDB Voyager](https://carto.com/basemaps) | `basemaps.cartocdn.com` | Background map tiles | Every map load and every pan | Tile coordinates (z/x/y), which reveal the viewed map extent |
| [Nominatim](https://nominatim.openstreetmap.org) | `nominatim.openstreetmap.org` | Location search, region-URL resolution | On a search query, and on loading a region URL such as `/fulda` | The search term |
| [Panoramax](https://panoramax.xyz) | `api.panoramax.xyz` | Street-level photos | Selecting a playground that has photos | The requested photo UUID |
| [Wikimedia Commons](https://commons.wikimedia.org) | `commons.wikimedia.org`, `upload.wikimedia.org` | Playground photos from `wikimedia_commons` / `image` tags | Selecting a playground carrying either tag | The requested file name |
| [Mangrove.reviews](https://mangrove.reviews) | `api.mangrove.reviews` | Pseudonymous community reviews | Selecting any playground; again on submitting a review | Playground coordinates. On submit: the rating, optional comment, and the browser-held public key |

Playground data itself is served by the instance's own PostgREST, so it never leaves the operator's server.

Two consequences worth being explicit about:

- **The basemap host is contacted by every visitor on every map movement.** It is currently hardcoded in `app/src/components/Map.svelte`. Making it configurable, and choosing a provider, are tracked in [#823](https://github.com/mfuhrmann/spieli/issues/823).
- **Reviews create a persistent pseudonymous identifier.** `app/src/lib/reviews.js` generates a P-256 keypair on the first review submission and stores it in `localStorage` under `spieli-mangrove-keypair`. It is not created by merely viewing the map.

Operators must disclose all of the above.
`oci/app/datenschutz.template.html` ships a service table that already does; keep the two in sync when a service is added or removed.

## Server-side only

Contacted by the importer or the container, never by the visitor's browser.

| Service | Purpose |
|---|---|
| [Geofabrik](https://download.geofabrik.de) | Source of OSM PBF extracts for import |

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
