# Glossary

Terms you meet in spieli's map, docs and configuration, each with a pointer to where it is explained.

## spieli's own terms

### Data-node

A spieli stack with a database: it imports one region from OpenStreetMap and serves it through its API (`DEPLOY_MODE=data-node` or `data-node-ui`). With `data-node-ui` it also serves a map of its own. See [Federation: one map, many owners](../concepts/federation.md).

### Hub

A spieli stack in `APP_MODE=hub` that shows many regions on one map. It holds no playground data; visitors' browsers fetch it from the data-nodes listed in its registry. [spieli.eu](https://spieli.eu) is a hub. See [Federation: one map, many owners](../concepts/federation.md).

### Standalone

`APP_MODE=standalone`, the default: a map of the single region the stack's own (or one remote) API serves. See [Deployment modes](deployment-modes.md).

### Registry

The `registry.json` a hub reads to know its data-nodes: one entry with URL, name and slug per region. See [`registry.json` reference](registry-json.md).

### Slug

The short, stable name of a region in a hub's registry (`hessen`), used in shared links such as `#hessen/W37808214`. See [`registry.json` → Slug validation](registry-json.md#slug-validation).

### Mapping detail

How much of a playground has been mapped in OpenStreetMap: *detailed*, *basic* or *no details yet* (internally `complete`, `partial`, `missing`). Shown only when switched on; it rates the map, not the playground. See [Mapping detail](completeness.md) and, for the exact tags, [OSM Tags spieli Reads](osm-tags.md#mapping-detail).

### Finder view

The default look of the map, with mapping detail off: neutral green circles and pins. See [User Guide → Navigating the map](../user-guide.md#navigating-the-map).

### DEPLOY_MODE and APP_MODE

The two settings that decide a stack's role. `DEPLOY_MODE` picks which containers run (`data-node`, `ui`, `data-node-ui`), `APP_MODE` how the map behaves (`standalone`, `hub`). See [Deployment modes](deployment-modes.md).

### Tiers: macro, cluster, polygon

How the map loads playgrounds depending on the zoom level. Zoomed out (up to zoom 13 by default) it shows **clusters**, counts the server has already grouped; zoomed in, the **polygon** tier shows each playground. A hub adds the **macro** tier below that (up to zoom 7): one ring per region, drawn from numbers it already has. See [Federation reference → Ring states](federation.md#ring-states).

### Ring

The circle a hub draws for a region at the macro tier, sized by its playground count. Its look says whether the region is healthy, offline, updating or empty. See [Federation reference → Ring states](federation.md#ring-states).

### External-service proxy

The paths under `/ext/` through which an instance fetches search, photos and reviews on the visitor's behalf, so the browser does not contact those services itself. The basemap works the same way under `/basemap/`. See [External Services](external-services.md).

### Daemon mode

The importer container running permanently and re-importing every few days on its own, instead of once (one-shot). Switched on by `REIMPORT_INTERVAL_MIN_DAYS` / `MAX_DAYS`; the installer does this when you choose automatic updates. See [Scheduled Import](../ops/scheduled-import.md).

### Watchtower

The container (compose profile `auto-update`) that installs new spieli releases automatically. See [Upgrading → Automatic upgrade](../ops/upgrade.md#automatic-upgrade-watchtower).

## OpenStreetMap and tooling

### OSM relation ID

Every city, district or region in OpenStreetMap has a numeric **relation ID**. A data-node uses it to cut its region out of the extract and to name it. Find it on [Nominatim](https://nominatim.openstreetmap.org) or [openstreetmap.org](https://www.openstreetmap.org): `openstreetmap.org/relation/62700` → `62700`. See [Quick Start → Finding your region](../getting-started/quick-start.md#finding-your-region).

### PBF file

A compressed snapshot of OpenStreetMap data for a region (Protocol Buffer Binary Format). Geofabrik publishes daily extracts at [download.geofabrik.de](https://download.geofabrik.de). The importer reads one; it only needs to *contain* your region.

### osm2pgsql

The tool that loads a PBF file into PostgreSQL. It runs inside the importer container, on every import. More: [osm2pgsql.org](https://osm2pgsql.org).

### PostgREST

A server that turns SQL functions into an HTTP API. spieli's whole API is PostgREST over the functions in `importer/api.sql`; there is no other backend application. More: [postgrest.org](https://postgrest.org).

### Overpass Turbo

A web tool for ad-hoc queries against live OpenStreetMap data, at [overpass-turbo.eu](https://overpass-turbo.eu). Useful to find playgrounds with a particular tag, for testing or before adding a device type.
