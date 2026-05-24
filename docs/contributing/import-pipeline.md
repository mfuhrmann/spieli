# Import Pipeline

This guide explains how OSM data flows from a Geofabrik PBF extract into the PostgreSQL database. It is aimed at contributors who want to add new OSM data types or change how existing data is processed.

## Overview

```
Geofabrik PBF (~300 MB Bundesland extract)
        │
        ▼  osmium extract (bbox clip — Nominatim lookup or OSM_BBOX override)
Bbox-clipped PBF (~50 MB)
        │
        ▼  osmium tags-filter
Tag-filtered PBF (~4–8 MB)
        │
        ▼  osm2pgsql --slim --drop --hstore
        │  (default pgsql output — no Lua script)
        │
        ▼  PostgreSQL tables (EPSG:3857)
        │   planet_osm_point    — OSM nodes
        │   planet_osm_polygon  — closed ways and relations as polygons
        │   planet_osm_line     — open ways
        │   planet_osm_roads    — roads subset
        │
        ▼  api.sql applied by import.sh
        │   ALTER SYSTEM (pg tuning)
        │   DROP + CREATE MATERIALIZED VIEW playground_stats
        │   CREATE/REPLACE api schema functions
        │
        ▼  PostgREST /api/rpc/* endpoints
```

The pipeline is driven by `importer/import.sh`, which is the `CMD` of the importer Docker image (`importer/Dockerfile`).

## osm2pgsql and the hstore schema

osm2pgsql runs in its default **pgsql output mode** — no Lua flex script is involved. It imports the filtered PBF into four standard tables (`planet_osm_point`, `planet_osm_polygon`, `planet_osm_line`, `planet_osm_roads`), all in EPSG:3857.

A fixed set of common OSM keys get their own columns (`name`, `operator`, `access`, `surface`, `leisure`, `amenity`, `sport`, `natural`, `highway`, …). Every other tag is stored as a key→value pair in the `tags` **hstore** column. The `--hstore` flag enables this.

All application logic (computing completeness, deriving filter flags, building cluster counts) lives in `importer/api.sql`, which queries these standard tables.

### Adding a new OSM tag to an existing function

If the tag is one of the standard columns it is already in the table. If it is not, it lands in `tags` hstore and you read it with `tags->'my_tag'` in SQL.

Steps:

1. If the tag is not already in the `osmium tags-filter` list, add it to `importer/import.sh` (the `osmium tags-filter` invocation). Otherwise the importer will silently discard those objects.
2. In `importer/api.sql`, add the tag to whichever function or view needs it. Use `tags->'my_tag'` to read a hstore value.
3. Run `make import` to reload data with the new tag present.

If you only changed `api.sql` (no new tag to filter), `make db-apply` is enough — no full re-import needed.

### Adding a new OSM object type

1. Add its tag to the `osmium tags-filter` list in `importer/import.sh`.
2. In `importer/api.sql`, add a new PostgREST function that queries `planet_osm_point` or `planet_osm_polygon` (depending on geometry type). Follow the pattern of existing functions.
3. Expose it: `GRANT EXECUTE ON FUNCTION api.your_function(...) TO web_anon;`
4. Run `make import` to reload data, then `make db-apply` can be used for subsequent SQL-only iterations.

## The tag filter (`importer/import.sh`)

Before osm2pgsql runs, `osmium tags-filter` keeps only objects with tags the app actually queries. This is a performance optimisation — a Bundesland PBF goes from ~300 MB to ~4–8 MB. The current filter passes:

- `leisure=playground`, `leisure=pitch`, `leisure=fitness_station`, `leisure=picnic_table`
- `amenity=bench`, `amenity=shelter`, `amenity=toilets`, `amenity=ice_cream`, `amenity=cafe`, `amenity=restaurant`
- `natural=tree`, `natural=tree_row`, `playground=*`
- `highway=bus_stop`, `shop=chemist/supermarket/convenience`, `emergency=*`
- `boundary=administrative`, `type=multipolygon`

**If you add a new OSM feature type**, add its tag to the filter list in `import.sh` (the `osmium tags-filter` invocation) — otherwise the importer will silently discard those objects.

## The `playground_stats` materialised view

The most important post-import step in `importer/api.sql` is building the `playground_stats` materialized view. It pre-computes per-playground statistics (tree count, bench count, sport types, completeness state) so `get_playgrounds_bbox` is a fast indexed lookup rather than an aggregation query.

It is built entirely from the standard osm2pgsql tables:

- Playground polygons and nodes come from `planet_osm_polygon` (`leisure = 'playground'`) and `planet_osm_point`.
- Equipment and trees are joined from `planet_osm_point` and `planet_osm_polygon` using spatial containment (`ST_Intersects` / `ST_DWithin`).
- Less common tags (e.g. `panoramax`, `opening_hours`) are read from the `tags` hstore column.

The completeness logic in `api.sql` must stay in sync with `app/src/lib/completeness.js` in the frontend. Both implement the same rule:

| Criterion | SQL column (api.sql) | JS property (completeness.js) |
|---|---|---|
| Has photo | `tags ? 'panoramax'` or `tags` key starts with `'panoramax:'` | `Object.keys(props).some(k => k.startsWith('panoramax'))` |
| Has name | `name IS NOT NULL` | `!!props.name` |
| Has info | `surface` or `access != 'yes'` or `opening_hours` | `!!(props.surface \|\| …)` |

- `complete` = all three present
- `partial` = at least one present
- `missing` = none present

**If you change the completeness criteria**, update both files and rebuild the materialised view with `make db-apply`.

## Filter flags (`for_baby`, `for_toddler`, `is_water`, …)

Several boolean columns in `playground_stats` are computed from equipment found inside each playground polygon. They drive both the filter UI and the `filter_attrs` payload in the cluster RPC.

| Flag | Triggers |
|---|---|
| `for_baby` | `tags ? 'baby'` and `tags->'baby' = 'yes'`; `tags->'playground'` ∈ `baby_swing`, `basketswing`, `sandpit`, `springy`; `tags ? 'capacity:baby'` |
| `for_toddler` | `tags->'provided_for:toddler' = 'yes'`; `tags->'playground' = 'basketswing'` |
| `is_water` | `tags->'playground'` contains `'water'` or ∈ `splash_pad`, `pump` |
| `for_wheelchair` | `wheelchair = 'yes'` on any equipment |
| `has_soccer` / `has_basketball` | `leisure = 'pitch'` with matching `sport` value |

All flag logic lives in `importer/api.sql` (the `equip_stats` CTE inside `playground_stats`).

**If you add a new flag**, add it to `playground_stats` in `api.sql` and run `make db-apply`. A full `make import` is only needed if the new flag depends on a tag not yet in the tag filter.

## Applying schema changes without a full re-import

`make db-apply` runs only the `api.sql` step (skips the osm2pgsql data load). Use it when:
- You added or changed a PostgREST function
- You changed the `playground_stats` view definition
- You added a new filter flag

Do a full `make import` when you changed the tag filter (new tags needed in the PBF) — these affect which data is stored in `planet_osm_*` tables.

## See also

- [API Reference](../reference/api.md) — PostgREST function signatures
- [Local Development](local-dev.md) — how to test changes quickly with seed data
