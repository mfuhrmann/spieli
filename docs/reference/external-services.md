# External Services

Every third-party service spieli uses, who contacts it, and how to change that. Why it is built this way: [Privacy by design](../concepts/privacy.md). The settings: [Basemap and external services](../ops/basemap-and-services.md).

In a default deployment the visitor's browser contacts only this instance; the instance fetches the rest server-side, through a cache, without the visitor's address. Only two services are reached by the browser directly, and only in specific situations.

## Contacted by the browser directly

| Service | Host | When | Why it is not proxied | Switch off |
|---|---|---|---|---|
| [Panoramax](https://panoramax.xyz) | `api.panoramax.xyz`, which redirects thumbnails to a per-instance host (e.g. `panoramax.openstreetmap.fr`) | Thumbnails: when a playground with street-level photos is opened. The viewer iframe: only after the visitor clicks the thumbnail, until they close it | The redirect targets are a federation's hosts, not ours to enumerate, and nginx cannot follow a redirect; the viewer is a whole application that must not run on this origin ([#863](https://github.com/mfuhrmann/spieli/issues/863)). The viewer sets an analytics cookie of its own, which is why it waits for a click: [Privacy by design → What still leaves](../concepts/privacy.md#what-still-leaves-and-when) | — |
| [OpenStreetMap notes](https://wiki.openstreetmap.org/wiki/Notes) | `api.openstreetmap.org` (`OSM_NOTES_URL`) | A "Missing a playground?" hint, only on Send; a sent hint's status, only when its pin is tapped | Through one server, every anonymous note would come from one address, which OSM's spam limits block ([#1000](https://github.com/mfuhrmann/spieli/issues/1000)) | `OSM_NOTES_URL=false` |

Both are named in the generated Content Security Policy and on the generated privacy page.

## Fetched server-side (proxied)

Served to the browser from same-origin paths, cached on this instance. Opting a service out makes the browser contact its host directly; the generated CSP and privacy page then name it ([Security → nginx security headers](../ops/security.md#nginx-security-headers)).

| Service | Host | Used for | Same-origin path | Opt out with |
|---|---|---|---|---|
| Background map ([OpenFreeMap](https://openfreemap.org) / [OpenMapTiles](https://www.openmaptiles.org) by default) | `BASEMAP_UPSTREAM`, default `tiles.openfreemap.org` | Tiles, sprites, style | `/basemap/` | `BASEMAP_URL` / `BASEMAP_STYLE_URL` pointing at a third party (needs `BASEMAP_ATTRIBUTION`) |
| [Nominatim](https://nominatim.openstreetmap.org) | `nominatim.openstreetmap.org` | Place search; region names for URLs like `/fulda` | `/ext/nominatim/` | `PROXY_NOMINATIM=false` |
| [Wikimedia Commons](https://commons.wikimedia.org) | `commons.wikimedia.org` (API), `upload.wikimedia.org`, `thumb.wikimedia.org` (files) | Playground photo gallery; device and pitch illustrations | `/ext/commons/`, `/ext/wikimedia/<host>/` | `PROXY_COMMONS=false` |
| [OpenStreetMap wiki](https://wiki.openstreetmap.org) | `wiki.openstreetmap.org` | 14 device illustrations that exist only there | `/ext/wikimedia/<host>/` | `PROXY_COMMONS=false` |
| [Mangrove.reviews](https://mangrove.reviews) | `api.mangrove.reviews` | Reading and submitting reviews. Proxied (default): read on selecting a playground, for the rating under its name. With the proxy off: only once the reviews section is opened | `/ext/mangrove/` | `PROXY_MANGROVE=false` |

What every proxy guarantees: no access log, no cookie, referrer, browser language or forwarded address on the outbound request, and no fallback to a direct connection when the upstream fails. Nominatim requests are limited to one per second, as its usage policy requires; cached answers are not counted. Details: [Privacy by design](../concepts/privacy.md) and [Basemap and external services → External-service proxies](../ops/basemap-and-services.md#external-service-proxies).

Serving the illustrations through this instance makes the operator their distributor, so the CC attribution is shown under each one where the wiki provides it; the OSM wiki provides none for its 14 files.

## Contacted only by the server

| Service | Purpose |
|---|---|
| [Geofabrik](https://download.geofabrik.de) | OSM extracts (`PBF_URL`), downloaded by the importer |
| [Nominatim](https://nominatim.openstreetmap.org) | The importer looks up the region's bounding box once per import, unless `OSM_BBOX` is set |

## Linked, not embedded

Reached only when the visitor clicks a link; nothing is transferred before that.

| Service | Purpose |
|---|---|
| [MapComplete](https://mapcomplete.org) | Contribute photos and equipment |
| [Wikidata](https://wikidata.org) | Operator entity linking |
| [OpenStreetMap](https://www.openstreetmap.org) | Source data, editing, directions |

## Stored in the browser

A key pair for signing reviews is created in `localStorage` on the visitor's first review, not before. Everything spieli keeps in the browser: [Privacy by design → What stays in your browser](../concepts/privacy.md#what-stays-in-your-browser).
