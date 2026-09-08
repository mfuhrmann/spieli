# External Services

spieli integrates with the following free external services at runtime:

| Service | Purpose |
|---|---|
| [Geofabrik](https://download.geofabrik.de) | Source of OSM PBF extracts for import |
| [Nominatim](https://nominatim.openstreetmap.org) | Location search and region bounding box |
| [OpenFreeMap](https://openfreemap.org) / [OpenMapTiles](https://www.openmaptiles.org) | Background map tiles — fetched **server-side and cached**, never by the visitor's browser. Configurable via `BASEMAP_UPSTREAM`, including pointing it at a tileserver you run yourself. |
| [Panoramax](https://panoramax.xyz) | Street-level photos |
| [Wikimedia Commons](https://commons.wikimedia.org) | Playground photos from `wikimedia_commons` / `image` tags |
| [Mangrove.reviews](https://mangrove.reviews) | Pseudonymous community reviews |
| [MapComplete](https://mapcomplete.org) | Contribute photos and equipment |
| [Wikidata](https://wikidata.org) | Operator entity linking |

All map data comes from OpenStreetMap or the free services listed above. No proprietary data, no user accounts, no tracking.

Only some of these are contacted by the visitor's **browser**. The basemap is not: it is the one entry above that spieli fetches server-side and caches, so the tile server sees one polite client per instance rather than every visitor. See [Security](../ops/security.md#the-basemap-is-same-origin-by-default).
