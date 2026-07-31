# Glossary

OSM-specific terms you'll encounter when working with this project.

## OSM relation ID

Every city, district, or region in OpenStreetMap has a numeric ID called a **relation ID**. spieli uses this ID to know which geographic area to show on the map.

To find the relation ID for your region: search on [Nominatim](https://nominatim.openstreetmap.org) or [openstreetmap.org](https://openstreetmap.org) — it appears in the URL, e.g. `openstreetmap.org/relation/62700` → ID is `62700`.

## PBF file

A **PBF file** (Protocolbuffer Binary Format) is a compressed snapshot of OpenStreetMap data for a geographic region. Geofabrik publishes regularly-updated PBF extracts at [download.geofabrik.de](https://download.geofabrik.de).

The importer reads a PBF file to populate the database. The file only needs to *contain* your region — a Bundesland extract works for a single Kreis within it.

## osm2pgsql

**osm2pgsql** is the tool that reads a PBF file and imports the OSM data into PostgreSQL. You run it via `make import` to load data for the first time, and again whenever you want to refresh from a newer Geofabrik extract.

More: [osm2pgsql.org](https://osm2pgsql.org)

## PostgREST

**PostgREST** is a server that automatically turns a PostgreSQL database into a REST API. Instead of writing server-side code, you write SQL functions and PostgREST exposes them as HTTP endpoints. spieli's entire API layer is PostgREST — there is no custom backend application server.

More: [postgrest.org](https://postgrest.org)

## Mapping detail indicator

Each playground carries a **Mapping detail** badge whose colour reflects how much of it has been mapped in OpenStreetMap:

| Colour | Legend label | Meaning |
|--------|-------------|---------|
| Bright green | detailliert / detailed | Play infrastructure **and** at least one detail (surface, opening hours, or a non-trivial access value) |
| Dark green   | grundlegend / basic | One of the two, not both |
| Slate blue-grey | noch nicht erfasst / not mapped yet | Neither — the playground exists in OSM but carries nothing else |

"Play infrastructure" means `playground=*` objects and soccer / basketball / table-tennis pitches. Benches, shelters and picnic tables do not count — a lone bench must not carry an otherwise unmapped playground.

A photo is **not** part of the rating. It is shown separately as a camera glyph on the map.

The map legend is headed "Erfasste Details" / "Mapping detail". The same three-state breakdown is used in cluster rings, the federation macro view and the hub instance drawer, all reading the same palette (`app/src/lib/completenessPalette.js`).

The scale is a green-to-slate ramp rather than a traffic light: it measures how much of the map is filled in, not how good the playground is. The slate step means "nobody has mapped this yet — help out", not "bad playground". A plain grey was tried first and lost against the basemap, which draws residential landuse and buildings in warm greys of its own.

Internally, the three states are referred to as `complete`, `partial`, and `missing`. These values appear in the API responses (see [`api.md`](api.md)) and in the database (`playground_stats` materialised view). They are deliberately *not* renamed to match the labels — federation between backends on different versions depends on them. Full rule in [`completeness.md`](completeness.md).

## Overpass Turbo

**Overpass Turbo** ([overpass-turbo.eu](https://overpass-turbo.eu)) is a web tool for running ad-hoc queries against live OpenStreetMap data. It is useful when adding support for a new device type — you can search for `playground=<tag>` to find real playgrounds that have the device mapped and use them for testing.
