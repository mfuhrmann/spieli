# Import Pipeline

This guide explains how OSM data flows from a Geofabrik PBF extract into the PostgreSQL database. It is aimed at contributors who want to add new OSM data types or change how existing data is processed.

## Overview

```
Geofabrik PBF (~300 MB state extract)
        │
        ▼  osmium extract (bbox clip — Nominatim lookup or OSM_BBOX override)
Bbox-clipped PBF (~5–20 MB)
        │
        ▼  osmium tags-filter
Tag-filtered PBF (~1–5 MB)
        │
        ▼  osm2pgsql --slim --drop --hstore
        │  (default pgsql output — no Lua script)
        │
        ▼  PostgreSQL tables (EPSG:3857)
        │   planet_osm_point    — OSM nodes
        │   planet_osm_line     — open ways (fences, boundary segments)
        │   planet_osm_polygon  — closed ways and relations as polygons
        │
        ▼  api.sql applied by import.sh
        │   ALTER SYSTEM (pg tuning)
        │   CREATE INDEX on planet_osm_* (idempotent)
        │   BUILD playground_stats under a staging name, then swap it in
        │   CREATE/REPLACE api schema functions
        │
        ▼  PostgREST /api/rpc/* endpoints
```

The pipeline is driven by `importer/import.sh`, which is the `CMD` of the importer Docker image (`importer/Dockerfile`).

## osm2pgsql and the hstore schema

osm2pgsql runs in its default **pgsql output mode** — no Lua flex script is involved. It imports the filtered PBF into standard tables (`planet_osm_point`, `planet_osm_line`, `planet_osm_polygon`), all in EPSG:3857. `planet_osm_line` matters for fences mapped as their own way (#773) and for region boundaries that do not close into a polygon.

A fixed set of common OSM keys get their own columns (`name`, `operator`, `access`, `surface`, `leisure`, `amenity`, `sport`, `natural`, `highway`, …). Every other tag is stored as a key→value pair in the `tags` **hstore** column. The `--hstore` flag enables this.

All application logic (computing completeness, deriving filter flags, building cluster counts) lives in `importer/api.sql`, which queries these standard tables.

### Adding a new attribute to an existing object type

Two distinct cases:

**The object type is already imported** (e.g. adding a new attribute to playground equipment nodes, which are already in the filter as `n/playground`):

1. The tag value is already in the `tags` hstore — access it with `tags->'my_tag'` in `importer/api.sql`.
2. Run `make db-apply` to apply the SQL change (no re-import needed).

**The tag is used on a new object type not yet in the filter** (e.g. `amenity=drinking_water`):

1. Add the tag to the `osmium tags-filter` list in `importer/import.sh`. Otherwise the importer silently discards those objects.
2. In `importer/api.sql`, add or extend a function to read the new data. Use `tags->'my_tag'` for hstore values or the named column for common keys.
3. Run `make import` — the tag filter change requires a full re-import.

### Adding a new OSM object type

1. Add its tag to the `osmium tags-filter` list in `importer/import.sh`.
2. In `importer/api.sql`, add a new PostgREST function that queries `planet_osm_point` or `planet_osm_polygon` (depending on geometry type). Follow the pattern of existing functions.
3. Expose it: `GRANT EXECUTE ON FUNCTION api.your_function(...) TO web_anon;`
4. Run `make import` to load the data. Use `make db-apply` for subsequent SQL-only iterations.

> **Testing**: there are no SQL unit tests. Verify changes with a real import (`make import`) against a region that has the relevant data, then check the feature appears correctly in the UI.

## The tag filter (`importer/import.sh`)

Before osm2pgsql runs, `osmium tags-filter` keeps only objects with tags the app actually queries. This is a performance optimisation — a state PBF goes from ~300 MB to ~1–5 MB. The current filter passes:

- `leisure=playground`, `leisure=pitch`, `leisure=fitness_station`, `leisure=picnic_table`
- `amenity=bench`, `amenity=shelter`, `amenity=toilets`, `amenity=ice_cream`, `amenity=cafe`, `amenity=restaurant`
- `natural=tree`, `natural=tree_row`, `playground=*`
- `highway=bus_stop`, `shop=bakery/chemist/supermarket/convenience`, `emergency=*`
- `barrier=fence` ways — fences drawn around a playground (#773)
- `boundary=administrative`, `type=multipolygon`

**If you add a new OSM object type**, add its tag to this filter — otherwise the importer will silently discard those objects.

The list lives in `TAG_FILTERS`, and the tag-filtered extract is cached next to a hash of it (`*_tags.pbf.filter`). Changing the list invalidates the cache on the next import, so the new tags arrive even when the source PBF has not changed. It still needs a full import — `API_ONLY` never runs osmium.

## The `playground_stats` materialised view

The most important post-import step in `importer/api.sql` is building the `playground_stats` materialised view. It pre-computes per-playground statistics (tree count, bench count, sport types, completeness state) so `get_playgrounds_bbox` is a fast indexed lookup rather than an aggregation query.

It is built entirely from the standard osm2pgsql tables:

- Playground polygons and nodes come from `planet_osm_polygon` (`leisure = 'playground'`) and `planet_osm_point`.
- Equipment and trees are joined from `planet_osm_point` and `planet_osm_polygon` using spatial containment (`ST_Intersects` / `ST_DWithin`). Trees count within 15 m of the playground. A distance in metres must go through `public.metres_to_3857(metres, lat)` before it is compared to `way`: EPSG:3857 units shrink by cos(latitude), so a bare `15` covers only ~9.5 m in Hessen.
- Less common tags (e.g. `panoramax`, `opening_hours`) are read from the `tags` hstore column.

### How the rebuild avoids an outage

The view is **not** dropped and recreated in place. `api.sql` builds it under the staging name `playground_stats_new`, indexes it, and then swaps it in inside a single `DO` block:

```sql
DROP MATERIALIZED VIEW IF EXISTS public.playground_stats CASCADE;
ALTER MATERIALIZED VIEW public.playground_stats_new RENAME TO playground_stats;
```

The build is the long statement — minutes on a state-sized region. Dropping first meant the view was absent for that whole window, and every reader of it (`get_meta`, both map tiers) failed with `relation "public.playground_stats" does not exist`. Since the daemon importer re-applies `api.sql` on every container start, that made any routine restart a multi-minute API outage ([#720](https://github.com/mfuhrmann/spieli/issues/720)). With the swap, readers keep the old view until the rename commits.

A `DO` block rather than a literal `BEGIN`/`COMMIT` because both callers must stay atomic: `import.sh` runs the file with plain `psql -f` (autocommit), `make db-apply` runs it with `--single-transaction`.

The `planet_osm_*` indexes are created *before* the build for the same reason — the build joins against those tables, so it is the statement that needs them.

The PostgREST connections are terminated inside the same transaction as the swap, not in a statement ahead of it. PostgREST reconnects on its own, so terminating separately leaves a gap in which a fresh connection can take a read lock — and the swap's pending `AccessExclusiveLock` then queues *ahead of every later reader*, stalling API traffic for as long as that straggler runs. In one transaction there is no gap.

**Disk headroom:** the staging view coexists with the live one, so peak disk use for `playground_stats` and its indexes is roughly **double** the steady-state size during a rebuild. Negligible for a city-sized region (Fulda's view is ~230 kB) but worth checking before an apply on a state-sized node with a nearly full volume.

The completeness logic in `api.sql` must stay in sync with `app/src/lib/completeness.js` in the frontend. Both implement the same rule:

| Criterion | SQL (api.sql) | JS (completeness.js) |
|---|---|---|
| Has equipment | a `playground=*` object inside the area, or a soccer / basketball / table-tennis pitch | `device_count > 0 \|\| table_tennis_count > 0 \|\| has_soccer \|\| has_basketball` |
| Has info | `surface` set, or `access` set and not `'yes'`, or `opening_hours` set | `!!(props.opening_hours \|\| props.surface \|\| (props.access && props.access !== 'yes'))` |

- `complete` = both criteria present
- `partial` = exactly one present
- `missing` = neither

### Mapping detail rule

The rule itself, and why it is what it is, is explained in [Mapping detail](../reference/completeness.md).

The identifiers `complete` / `partial` / `missing` are wire and storage values — they appear in API responses, in `playground_stats`, and in the `filterStore` keys. They deliberately differ from the labels shown to users (detailed / basic / no details yet); renaming them would break federation between backends on different versions.

The rule is maintained in two mirrored places that must stay in sync:

- **Frontend**: `app/src/lib/completeness.js` — `playgroundCompleteness(props)` and `hasPhotoSignal(props)`
- **Database**: `importer/api.sql`, CTE `completeness_attrs` feeding the `playground_stats` materialised view

Both sides are guarded. Case 17 in `app/src/lib/completeness.test.js` walks the truth table in JS. The "Assert JS/SQL rule parity" step in `.github/workflows/db-smoke.yml` does the SQL side by reading the live view definition rather than restating it: it extracts the `has_equipment` expression and fails if it stops counting any of `device_count` / `table_tennis_count` / `has_soccer` / `has_basketball`, or if it starts counting street furniture or a derived flag again ([#776](https://github.com/mfuhrmann/spieli/issues/776)). It then checks the classification `CASE` still reads `has_equipment AND has_info` and has not taken `has_photo` back as an input. `app/src/lib/completeness.js` is one of the workflow's path triggers, so a change to the JS half alone still runs it.

Run `make db-apply` after changing the SQL definition to rebuild the materialised view. No re-import is needed — the view is derived.

#### Persisted criterion columns

`playground_stats` stores the criteria alongside the derived state, as non-null booleans:

| Column | Criterion |
|---|---|
| `has_photo` | photo signal (not a state input; drives the marker) |
| `has_equipment` | **hasEquipment** above |
| `has_info` | **hasInfo** above |

They are not exposed through any API function — they exist so the composition of each state can be measured directly instead of re-derived:

```sql
SELECT completeness, has_equipment, has_info, has_photo, count(*)
FROM playground_stats
GROUP BY 1,2,3,4
ORDER BY 5 DESC;
```

This is the query to run before and after any change to the criteria, to see which criterion is actually gating a state.

**Street furniture does not count as equipment.** Benches, shelters and picnic tables are often mapped inside a playground area by someone who never mapped the play equipment, so counting them lifts playgrounds that have nothing to play on. The flags derived from equipment tags (`is_water`, `for_baby`, `for_toddler`, `for_wheelchair`) are excluded for the same reason — a bench carrying `wheelchair=yes` is the same false signal through a side door ([#776](https://github.com/mfuhrmann/spieli/issues/776)).

**A photo is not a criterion.** Photo tags are rare in OSM, so requiring one for the top bucket gated whole regions out of it. Availability is still derived — `has_photo` on `playground_stats`, `hasPhotoSignal()` in JS — but only to drive an additive marker, never the state. `name` and `operator` are not criteria either: administrative data, not useful to a parent choosing a playground.

Full rationale in [Mapping detail](../reference/completeness.md).

**If you change the completeness criteria**, update both files and rebuild the materialised view with `make db-apply`.

## Filter flags (`for_baby`, `for_toddler`, `is_water`, …)

Several boolean columns in `playground_stats` are computed from equipment found inside each playground polygon (`for_baby`, `for_toddler`, `is_water`, `wheelchair_play` / `for_wheelchair`, `has_soccer`, `has_basketball`, `has_fence`, `has_dogs`, `has_theme`, `has_shade`, `has_lit`). They drive both the filter UI and the `filter_attrs` payload in the cluster RPC. Which tags set each one: [OSM Tags spieli Reads → Filters](../reference/osm-tags.md#filters).

Two of them mirror a frontend rule. `has_lit` (`public.lit_state()` ↔ `litState()` in `app/src/lib/pitchInfo.js`) is guarded in CI: both run over the truth table `app/src/lib/litState.cases.json`. The theme allowlist (↔ `SUPPORTED_THEMES` in `app/src/lib/playgroundThemes.js`) is kept in sync by hand.

All flag logic lives in `importer/api.sql` (the `equip_stats` CTE inside `playground_stats`).

Adding a flag and the filter that uses it: [Add a Filter](add-filter.md).

## Applying schema changes without a full re-import

`make db-apply` runs only the `api.sql` step (skips the osm2pgsql data load). Use it when:
- You added or changed a PostgREST function
- You changed the `playground_stats` view definition
- You added a new filter flag

Do a full `make import` when you changed the tag filter (new object types needed in the PBF) — these affect which objects are stored in `planet_osm_*` tables.

## See also

- [API Reference](../reference/api.md) — PostgREST function signatures
- [Local Development](local-dev.md) — how to test changes quickly with seed data
- [Source Tree](../source-tree-analysis.md) — where all the files live
