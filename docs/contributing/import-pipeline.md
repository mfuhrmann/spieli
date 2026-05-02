# Import Pipeline

This guide explains how OSM data flows from a Geofabrik PBF extract into the PostgreSQL database. It is aimed at contributors who want to add new OSM data types or change how existing data is processed.

## Overview

```
Geofabrik PBF (~300 MB Bundesland extract)
        │
        ▼  osmium extract (bbox clip)
Bbox-clipped PBF (~50 MB)
        │
        ▼  osmium tags-filter
Tag-filtered PBF (~4–8 MB)
        │
        ▼  osm2pgsql --slim --hstore
        │  (Lua rules: processing/lua/osm_import.lua)
        │
        ▼  PostgreSQL tables (EPSG:3857)
        │   planet_osm_point
        │   planet_osm_polygon
        │   planet_osm_roads
        │   + Lua-defined tables: playgrounds, playground_equipment_*, trees, …
        │
        ▼  api.sql applied by import.sh
        │   ALTER SYSTEM (pg tuning)
        │   DROP + CREATE MATERIALIZED VIEW playground_stats
        │   CREATE/REPLACE api schema functions
        │
        ▼  PostgREST /api/rpc/* endpoints
```

The pipeline is driven by `importer/import.sh`, which is the `ENTRYPOINT` of the importer Docker image.

## osm2pgsql and the Lua rules

osm2pgsql reads the filtered PBF and calls the Lua transform script `processing/lua/osm_import.lua` for each OSM object. The Lua script defines:

- **Which OSM tags are imported** — each table (`playgrounds`, `playground_equipment_node`, `trees`, etc.) declares its column list. Only those columns are stored; everything else goes into the `other_tags` hstore column.
- **Which OSM object types** map to which tables (nodes, ways, relations; points vs polygons)
- **Custom processing** — e.g., merging playground node/polygon variants

All tables use EPSG:3857 geometry (Web Mercator), which matches OpenLayers' default projection.

### Adding a new OSM tag to an existing table

1. Find the table in `processing/lua/osm_import.lua`
2. Add the column to the table's attribute list:
   ```lua
   local attributes_playground = {
       …
       { column = 'my_new_tag' },
   }
   ```
3. Run `make import` to reload the data with the new column.

### Adding a new OSM object type

1. In `osm_import.lua`, add a new table definition (see existing tables for the pattern).
2. Register a handler for `node_tags_fn`, `way_tags_fn`, or `relation_tags_fn`.
3. In `importer/api.sql`, add a PostgREST function to expose the data, then run `make db-apply` or `make import`.

## The tag filter (`importer/import.sh`)

Before osm2pgsql runs, `osmium tags-filter` keeps only objects with tags the app actually queries. This is a performance optimisation — a Bundesland PBF goes from ~300 MB to ~4–8 MB. The current filter passes:

- `leisure=playground`, `leisure=pitch`, `leisure=fitness_station`, `leisure=picnic_table`
- `amenity=bench`, `amenity=shelter`, `amenity=toilets`, `amenity=ice_cream`, `amenity=cafe`, `amenity=restaurant`
- `natural=tree`, `playground=*`
- `highway=bus_stop`, `shop=chemist/supermarket/convenience`, `emergency=*`
- `boundary=administrative`, `type=multipolygon`

**If you add a new OSM feature type**, add its tag to the filter list in `import.sh` (the `osmium tags-filter` invocation) — otherwise the importer will silently discard those objects.

## The `playground_stats` materialised view

The most important post-import step in `importer/api.sql` is building the `playground_stats` materialized view. It pre-computes per-playground statistics (tree count, bench count, sport types, completeness state) so `get_playgrounds_bbox` is a fast indexed lookup rather than an aggregation query.

The completeness logic in `api.sql` must stay in sync with `app/src/lib/completeness.js` in the frontend. Both implement the same rule:

| Criterion | SQL column (api.sql) | JS property (completeness.js) |
|---|---|---|
| Has photo | `panoramax IS NOT NULL` or `other_tags ? 'panoramax'` | `Object.keys(props).some(k => k.startsWith('panoramax'))` |
| Has name | `name IS NOT NULL` | `!!props.name` |
| Has info | `operator \|\| opening_hours \|\| surface \|\| access != 'yes'` | `!!(props.operator \|\| …)` |

- `complete` = all three present
- `partial` = at least one present
- `missing` = none present

**If you change the completeness criteria**, update both files and rebuild the materialised view with `make db-apply`.

## Filter flags (`for_baby`, `for_toddler`, `is_water`, …)

Several boolean columns are computed from equipment present within each playground polygon. They drive both the filter UI and the `filter_attrs` payload in the centroid RPC.

| Flag | Triggers |
|---|---|
| `for_baby` | `baby=yes` on any equipment; `playground` ∈ `baby_swing`, `basketswing`, `sandpit`, `springy`; `capacity:baby` present on any equipment |
| `for_toddler` | `provided_for:toddler=yes` on any equipment; `playground=basketswing` |
| `is_water` | `playground` contains `water` or ∈ `splash_pad`, `pump` |
| `for_wheelchair` | `wheelchair=yes` on any equipment |
| `has_soccer` / `has_basketball` | `leisure=pitch` with matching `sport` value |

The logic lives in two places that must stay in sync:

- **`importer/api.sql`** — `equip_stats` CTE, `BOOL_OR(…) AS for_baby` etc. Used by `get_playgrounds_bbox` and `get_playground_clusters`.
- **`processing/sql/playground_processing.sql`** — `UPDATE playgrounds SET for_baby = …` etc. Used by the legacy materialised view path.

**If you add a new trigger**, update both files and run `make db-apply`. A full `make import` is only needed if the new trigger depends on a tag not yet stored in `planet_osm_*` (check the tag filter in `importer/import.sh` first).

> **Testing**: there are no SQL unit tests. Verify changes with a real import (`make import`) against a region that has playgrounds with the relevant equipment, then check the filter chip appears correctly in the UI.

## Applying schema changes without a full re-import

`make db-apply` runs only the `api.sql` step (skips the osm2pgsql data load). Use it when:
- You added or changed a PostgREST function
- You changed the `playground_stats` view definition

Do a full `make import` when you changed the Lua rules or the tag filter (these affect which data is stored in `planet_osm_*` tables).

## See also

- [API Reference](../reference/api.md) — PostgREST function signatures
- [Local Development](local-dev.md) — how to test changes quickly with seed data
- [Source Tree Analysis](../source-tree-analysis.md) — where all the files live
