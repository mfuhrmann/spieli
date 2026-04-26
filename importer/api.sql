-- PostgREST API functions.
-- Called by import.sh after each osm2pgsql run.
-- All functions live in the "api" schema and are exposed via PostgREST /rpc/<name>.
--
-- osm2pgsql (classic schema) geometry notes:
--   - All geometries are stored in EPSG:3857 (Web Mercator)
--   - planet_osm_point  → nodes
--   - planet_osm_polygon → ways/relations rendered as polygons
--   - Uncommon tags land in other_tags (hstore)

-- Make sure web_anon can call everything we create here.
GRANT USAGE ON SCHEMA api TO web_anon;

-- =========================================================================
-- playground_stats — materialized view pre-computing per-playground stats.
-- Rebuilt on every import / db-apply so get_playgrounds is a plain lookup.
-- =========================================================================
DROP MATERIALIZED VIEW IF EXISTS public.playground_stats CASCADE;

CREATE MATERIALIZED VIEW public.playground_stats AS
  WITH region AS (
    -- osm2pgsql can emit multiple polygon rows per relation when the
    -- relation is a multipolygon (states with exclaves / lakes / etc.) or
    -- when member ways were clipped by a narrow PBF extract. ST_Union keeps
    -- every fragment; LIMIT 1 picks one and silently drops the rest, which
    -- on multipolygon relations like Baden-Württemberg (osm relation 62611,
    -- 4 fragments) collapses the MV to a tiny subset of its true size.
    -- Same pattern as get_playgrounds / get_meta below.
    SELECT ST_Union(way) AS way FROM planet_osm_polygon
    WHERE osm_id = -${OSM_RELATION_ID}
  ),
  all_playgrounds AS (
    SELECT p.osm_id, p.way, p.name, p.operator, p.access, p.surface, p.tags
    FROM planet_osm_polygon p
    JOIN region r ON ST_Within(p.way, r.way)
    WHERE p.leisure = 'playground'
  ),
  tree_counts AS (
    SELECT
      pl.osm_id,
      COUNT(t.osm_id)::int AS tree_count
    FROM all_playgrounds pl
    LEFT JOIN planet_osm_point t
      ON ST_DWithin(t.way, pl.way, 15)
      AND t.natural = 'tree'
    GROUP BY pl.osm_id
  ),
  all_equip AS (
    SELECT osm_id, amenity, leisure, sport, tags, way
    FROM planet_osm_point
    WHERE amenity IN ('bench', 'shelter')
       OR leisure IN ('picnic_table', 'pitch', 'fitness_station')
       OR tags ? 'playground'
    UNION ALL
    SELECT osm_id, amenity, leisure, sport, tags, way
    FROM planet_osm_polygon
    WHERE amenity IN ('bench', 'shelter')
       OR leisure IN ('picnic_table', 'pitch', 'fitness_station')
       OR tags ? 'playground'
  ),
  equip_stats AS (
    SELECT
      pl.osm_id,
      COUNT(CASE WHEN e.amenity = 'bench'        THEN 1 END)::int AS bench_count,
      COUNT(CASE WHEN e.amenity = 'shelter'      THEN 1 END)::int AS shelter_count,
      COUNT(CASE WHEN e.leisure = 'picnic_table' THEN 1 END)::int AS picnic_count,
      COUNT(CASE WHEN e.leisure = 'pitch'
                  AND e.tags->'sport' = 'table_tennis' THEN 1 END)::int AS table_tennis_count,
      BOOL_OR(e.leisure = 'pitch'
              AND (e.sport = 'soccer' OR e.tags->'sport' = 'soccer'))          AS has_soccer,
      BOOL_OR(e.leisure = 'pitch'
              AND (e.sport IN ('basketball','streetball')
                   OR e.tags->'sport' IN ('basketball','streetball')))          AS has_basketball,
      BOOL_OR(e.tags ? 'playground'
              AND (e.tags->'playground' ~* 'water'
                   OR e.tags->'playground' IN ('splash_pad','pump')))           AS is_water,
      BOOL_OR((e.tags->'baby' = 'yes')
              OR (e.tags->'playground' IN ('baby_swing','basketswing'))
              OR (e.tags ? 'playground' AND e.tags->'capacity:baby' IS NOT NULL)) AS for_baby,
      BOOL_OR((e.tags->'provided_for:toddler' = 'yes')
              OR (e.tags->'playground' = 'basketswing'))                        AS for_toddler,
      BOOL_OR(e.tags->'wheelchair' = 'yes'
              AND (NOT (e.tags ? 'playground')
                   OR e.tags->'playground' != 'sandpit'))                       AS for_wheelchair
    FROM all_playgrounds pl
    LEFT JOIN all_equip e ON ST_Intersects(pl.way, e.way)
    GROUP BY pl.osm_id
  ),
  -- Mirrors app/src/lib/completeness.js so the server classification and the
  -- client style function agree. Update both sides together if the rule changes.
  completeness_attrs AS (
    SELECT
      pl.osm_id,
      (pl.tags ? 'panoramax'
        OR EXISTS (SELECT 1 FROM skeys(pl.tags) k WHERE k LIKE 'panoramax:%')
      ) AS has_photo,
      (NULLIF(pl.name, '') IS NOT NULL) AS has_name,
      -- NULLIF('', '') IS NULL — matches JS truthy semantics on empty-string tags
      (
        NULLIF(pl.operator, '') IS NOT NULL
        OR NULLIF(pl.surface, '') IS NOT NULL
        OR (NULLIF(pl.access, '') IS NOT NULL AND pl.access <> 'yes')
        OR NULLIF(pl.tags->'opening_hours', '') IS NOT NULL
      ) AS has_info
    FROM all_playgrounds pl
  )
  SELECT
    tc.osm_id,
    tc.tree_count,
    COALESCE(es.bench_count,        0) AS bench_count,
    COALESCE(es.shelter_count,      0) AS shelter_count,
    COALESCE(es.picnic_count,       0) AS picnic_count,
    COALESCE(es.table_tennis_count, 0) AS table_tennis_count,
    COALESCE(es.has_soccer,     false) AS has_soccer,
    COALESCE(es.has_basketball, false) AS has_basketball,
    COALESCE(es.is_water,       false) AS is_water,
    COALESCE(es.for_baby,       false) AS for_baby,
    COALESCE(es.for_toddler,    false) AS for_toddler,
    COALESCE(es.for_wheelchair, false) AS for_wheelchair,
    -- Tiered-delivery (P1): persisted centroid + per-playground completeness
    ST_Centroid(pl.way)                           AS centroid_3857,
    (pl.access IN ('private', 'customers'))       AS access_restricted,
    CASE
      WHEN ca.has_photo AND ca.has_name AND ca.has_info THEN 'complete'
      WHEN ca.has_photo OR  ca.has_name OR  ca.has_info THEN 'partial'
      ELSE 'missing'
    END                                           AS completeness
  FROM all_playgrounds pl
  LEFT JOIN tree_counts        tc ON tc.osm_id = pl.osm_id
  LEFT JOIN equip_stats        es ON es.osm_id = pl.osm_id
  LEFT JOIN completeness_attrs ca ON ca.osm_id = pl.osm_id;

CREATE UNIQUE INDEX ON public.playground_stats (osm_id);
CREATE INDEX        ON public.playground_stats USING GIST (centroid_3857);

-- =========================================================================
-- 1. get_playgrounds(relation_id)
--    Returns all leisure=playground polygons inside the given OSM admin
--    relation as a GeoJSON FeatureCollection.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_playgrounds(bigint);

CREATE OR REPLACE FUNCTION api.get_playgrounds(relation_id bigint DEFAULT ${OSM_RELATION_ID})
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH region AS (
    -- osm2pgsql stores relation IDs as negative numbers. Union all matching
    -- rows: assembly can emit multiple polygon rows per relation when member
    -- ways are clipped (e.g. by a narrow PBF extract), and picking one at
    -- random yields inconsistent results.
    SELECT ST_Union(way) AS way FROM planet_osm_polygon
    WHERE osm_id = -relation_id
  ),
  playgrounds AS (
    SELECT
      p.osm_id,
      p.name,
      p.leisure,
      p.operator,
      p.access,
      p.surface,
      p.way_area::int AS area,
      p.tags,
      ST_Transform(p.way, 4326) AS geom
    FROM planet_osm_polygon p
    JOIN region r ON ST_Within(p.way, r.way)
    WHERE p.leisure = 'playground'
  )
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
      json_agg(
        json_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(pl.geom)::json,
          'properties', (
            jsonb_build_object(
              'osm_id',             abs(pl.osm_id),
              'osm_type',           CASE WHEN pl.osm_id < 0 THEN 'R' ELSE 'W' END,
              'name',               pl.name,
              'leisure',            pl.leisure,
              'operator',           pl.operator,
              'access',             pl.access,
              'surface',            pl.surface,
              'area',               pl.area,
              'tree_count',         COALESCE(s.tree_count, 0),
              'bench_count',        COALESCE(s.bench_count, 0),
              'shelter_count',      COALESCE(s.shelter_count, 0),
              'picnic_count',       COALESCE(s.picnic_count, 0),
              'table_tennis_count', COALESCE(s.table_tennis_count, 0),
              'has_soccer',         COALESCE(s.has_soccer, false),
              'has_basketball',     COALESCE(s.has_basketball, false),
              'is_water',           COALESCE(s.is_water, false),
              'for_baby',           COALESCE(s.for_baby, false),
              'for_toddler',        COALESCE(s.for_toddler, false),
              'for_wheelchair',     COALESCE(s.for_wheelchair, false)
            ) || COALESCE(hstore_to_jsonb(pl.tags), '{}'::jsonb)
          )
        )
      ),
      '[]'::json
    )
  )
  FROM playgrounds pl
  LEFT JOIN public.playground_stats s ON s.osm_id = pl.osm_id;
$$;

GRANT EXECUTE ON FUNCTION api.get_playgrounds(bigint) TO web_anon;

COMMENT ON FUNCTION api.get_playgrounds(bigint) IS
  'DEPRECATED: use api.get_playgrounds_bbox. Scheduled for removal in the release after next.';

-- =========================================================================
-- 1a. get_playground_clusters(z, bbox)
--     Pre-aggregated cluster buckets for the cluster tier (zoom ≤
--     clusterMaxZoom, default 13). Snaps each playground centroid to a
--     zoom-appropriate grid as the *grouping key* and counts playgrounds per
--     cell, broken down by completeness plus a separate restricted count.
--     The emitted `lon` / `lat` is the unweighted spatial mean of the
--     bucket's member centroids (`ST_Centroid(ST_Collect(centroid_3857))`),
--     not the grid anchor — so the dot tracks the geographic distribution
--     of its members rather than a lattice. The cell-size table is
--     hardcoded in metres at the equator and extends through z=13;
--     lat-dependent visual correction is the client's concern.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_playground_clusters(int, float8, float8, float8, float8);

CREATE OR REPLACE FUNCTION api.get_playground_clusters(
  z       int,
  min_lon float8,
  min_lat float8,
  max_lon float8,
  max_lat float8
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH bbox AS (
    SELECT ST_Transform(
      ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326),
      3857
    ) AS geom
  ),
  cell_size AS (
    -- Monotonic halving from 10 000 000 m at z=0. Extends through z=13 so
    -- the cluster tier can cover zoom ≤ 13 (two-tier client design).
    SELECT (CASE z
      WHEN 0  THEN 10000000
      WHEN 1  THEN  5000000
      WHEN 2  THEN  2500000
      WHEN 3  THEN  1250000
      WHEN 4  THEN   625000
      WHEN 5  THEN   312500
      WHEN 6  THEN   156250
      WHEN 7  THEN    78125
      WHEN 8  THEN    39062
      WHEN 9  THEN    19531
      WHEN 10 THEN     9766
      WHEN 11 THEN     4883
      WHEN 12 THEN     2441
      WHEN 13 THEN     1221
      ELSE              610
    END)::float8 AS m
  ),
  buckets AS (
    SELECT
      ST_SnapToGrid(ps.centroid_3857, cs.m) AS cell,
      ps.centroid_3857,
      ps.osm_id,
      ps.completeness,
      ps.access_restricted
    FROM public.playground_stats ps, bbox b, cell_size cs
    WHERE ST_Intersects(ps.centroid_3857, b.geom)
  ),
  aggregated AS (
    -- Restricted playgrounds are counted separately from the three
    -- completeness buckets so the ring renderer can paint them as a
    -- hatched "not public" segment. Invariant:
    --   count = complete + partial + missing + restricted
    -- The ST_Collect() ORDER BY guarantees bit-stable centroid output
    -- across plan changes (parallel scans, etc.) — the spec contract
    -- "each bucket's lon/lat is identical between calls" depends on it.
    SELECT
      cell,
      ST_Centroid(ST_Collect(centroid_3857 ORDER BY osm_id))                                        AS bucket_centroid_3857,
      COUNT(*)::int                                                                                 AS count,
      SUM(CASE WHEN NOT access_restricted AND completeness = 'complete' THEN 1 ELSE 0 END)::int     AS complete,
      SUM(CASE WHEN NOT access_restricted AND completeness = 'partial'  THEN 1 ELSE 0 END)::int     AS partial,
      SUM(CASE WHEN NOT access_restricted AND completeness = 'missing'  THEN 1 ELSE 0 END)::int     AS missing,
      SUM(CASE WHEN access_restricted                                   THEN 1 ELSE 0 END)::int     AS restricted
    FROM buckets
    GROUP BY cell
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'lon',        ST_X(ST_Transform(bucket_centroid_3857, 4326)),
        'lat',        ST_Y(ST_Transform(bucket_centroid_3857, 4326)),
        'count',      count,
        'complete',   complete,
        'partial',    partial,
        'missing',    missing,
        'restricted', restricted
      )
    ),
    '[]'::json
  )
  FROM aggregated;
$$;

GRANT EXECUTE ON FUNCTION api.get_playground_clusters(int, float8, float8, float8, float8) TO web_anon;

-- =========================================================================
-- 1b. get_playground_centroids(bbox)
--     Lightweight per-feature rows: osm_id, centroid lon/lat, completeness,
--     plus a `filter_attrs` object with the client filter booleans. Shipped
--     server-side for federation and future re-clustering scenarios; the
--     standalone client doesn't consume it after the two-tier pivot
--     (cluster tier covers zoom ≤ clusterMaxZoom directly).
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_playground_centroids(float8, float8, float8, float8);

CREATE OR REPLACE FUNCTION api.get_playground_centroids(
  min_lon float8,
  min_lat float8,
  max_lon float8,
  max_lat float8
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH bbox AS (
    SELECT ST_Transform(
      ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326),
      3857
    ) AS geom
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'osm_id',       abs(ps.osm_id),
        'lon',          ST_X(ST_Transform(ps.centroid_3857, 4326)),
        'lat',          ST_Y(ST_Transform(ps.centroid_3857, 4326)),
        'completeness', ps.completeness,
        'filter_attrs', json_build_object(
          'has_water',         ps.is_water,
          'for_baby',          ps.for_baby,
          'for_toddler',       ps.for_toddler,
          'for_wheelchair',    ps.for_wheelchair,
          'has_soccer',        ps.has_soccer,
          'has_basketball',    ps.has_basketball,
          'access_restricted', ps.access_restricted
        )
      )
    ),
    '[]'::json
  )
  FROM public.playground_stats ps, bbox b
  WHERE ST_Intersects(ps.centroid_3857, b.geom);
$$;

GRANT EXECUTE ON FUNCTION api.get_playground_centroids(float8, float8, float8, float8) TO web_anon;

-- =========================================================================
-- 1c. get_playgrounds_bbox(bbox)
--     Bbox-scoped counterpart of get_playgrounds. Same response shape as the
--     region-scoped version so the polygon-tier client (zoom > clusterMaxZoom)
--     can reuse its existing feature parser. Uses ST_Intersects so
--     playgrounds touching the viewport edge are still returned.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_playgrounds_bbox(float8, float8, float8, float8);

CREATE OR REPLACE FUNCTION api.get_playgrounds_bbox(
  min_lon float8,
  min_lat float8,
  max_lon float8,
  max_lat float8
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH bbox AS (
    SELECT ST_Transform(
      ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326),
      3857
    ) AS geom
  ),
  playgrounds AS (
    SELECT
      p.osm_id,
      p.name,
      p.leisure,
      p.operator,
      p.access,
      p.surface,
      p.way_area::int AS area,
      p.tags,
      ST_Transform(p.way, 4326) AS geom
    FROM planet_osm_polygon p
    JOIN bbox b ON ST_Intersects(p.way, b.geom)
    WHERE p.leisure = 'playground'
  )
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
      json_agg(
        json_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(pl.geom)::json,
          'properties', (
            jsonb_build_object(
              'osm_id',             abs(pl.osm_id),
              'osm_type',           CASE WHEN pl.osm_id < 0 THEN 'R' ELSE 'W' END,
              'name',               pl.name,
              'leisure',            pl.leisure,
              'operator',           pl.operator,
              'access',             pl.access,
              'surface',            pl.surface,
              'area',               pl.area,
              'tree_count',         COALESCE(s.tree_count, 0),
              'bench_count',        COALESCE(s.bench_count, 0),
              'shelter_count',      COALESCE(s.shelter_count, 0),
              'picnic_count',       COALESCE(s.picnic_count, 0),
              'table_tennis_count', COALESCE(s.table_tennis_count, 0),
              'has_soccer',         COALESCE(s.has_soccer, false),
              'has_basketball',     COALESCE(s.has_basketball, false),
              'is_water',           COALESCE(s.is_water, false),
              'for_baby',           COALESCE(s.for_baby, false),
              'for_toddler',        COALESCE(s.for_toddler, false),
              'for_wheelchair',     COALESCE(s.for_wheelchair, false)
            ) || COALESCE(hstore_to_jsonb(pl.tags), '{}'::jsonb)
          )
        )
      ),
      '[]'::json
    )
  )
  FROM playgrounds pl
  LEFT JOIN public.playground_stats s ON s.osm_id = pl.osm_id;
$$;

GRANT EXECUTE ON FUNCTION api.get_playgrounds_bbox(float8, float8, float8, float8) TO web_anon;

-- =========================================================================
-- 1d. get_playground(osm_id)
--     Single-feature lookup used by deeplink hydration and the nearby-list
--     "select" handler when the polygon source isn't populated for the
--     current viewport (zoom ≤ clusterMaxZoom). Same per-feature shape as
--     a single feature inside get_playgrounds_bbox.features. Prefers a
--     relation row (osm_id < 0) over a way row of the same magnitude.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_playground(bigint);

CREATE OR REPLACE FUNCTION api.get_playground(osm_id bigint)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH p AS (
    SELECT
      x.osm_id,
      x.name,
      x.leisure,
      x.operator,
      x.access,
      x.surface,
      x.way_area::int AS area,
      x.tags,
      ST_Transform(x.way, 4326) AS geom
    FROM planet_osm_polygon x
    WHERE x.leisure = 'playground'
      AND abs(x.osm_id) = abs($1)
    ORDER BY (x.osm_id < 0) DESC
    LIMIT 1
  )
  SELECT json_build_object(
    'type', 'Feature',
    'geometry', ST_AsGeoJSON(p.geom)::json,
    'properties', (
      jsonb_build_object(
        'osm_id',             abs(p.osm_id),
        'osm_type',           CASE WHEN p.osm_id < 0 THEN 'R' ELSE 'W' END,
        'name',               p.name,
        'leisure',            p.leisure,
        'operator',           p.operator,
        'access',             p.access,
        'surface',            p.surface,
        'area',               p.area,
        'tree_count',         COALESCE(s.tree_count, 0),
        'bench_count',        COALESCE(s.bench_count, 0),
        'shelter_count',      COALESCE(s.shelter_count, 0),
        'picnic_count',       COALESCE(s.picnic_count, 0),
        'table_tennis_count', COALESCE(s.table_tennis_count, 0),
        'has_soccer',         COALESCE(s.has_soccer, false),
        'has_basketball',     COALESCE(s.has_basketball, false),
        'is_water',           COALESCE(s.is_water, false),
        'for_baby',           COALESCE(s.for_baby, false),
        'for_toddler',        COALESCE(s.for_toddler, false),
        'for_wheelchair',     COALESCE(s.for_wheelchair, false)
      ) || COALESCE(hstore_to_jsonb(p.tags), '{}'::jsonb)
    )
  )
  FROM p
  LEFT JOIN public.playground_stats s ON abs(s.osm_id) = abs(p.osm_id);
$$;

GRANT EXECUTE ON FUNCTION api.get_playground(bigint) TO web_anon;

-- =========================================================================
-- 2. get_equipment(min_lon, min_lat, max_lon, max_lat)
--    Returns playground equipment and amenities within a WGS84 bounding box
--    as a GeoJSON FeatureCollection.
--    Covers nodes and polygon ways (e.g. large pitches).
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_equipment(float8, float8, float8, float8);

CREATE OR REPLACE FUNCTION api.get_equipment(
  min_lon float8,
  min_lat float8,
  max_lon float8,
  max_lat float8
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH bbox AS (
    SELECT ST_Transform(
      ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326),
      3857
    ) AS geom
  ),
  -- Nodes (playground devices, benches, shelters …)
  equip_nodes AS (
    SELECT
      p.osm_id,
      'N'::text AS osm_type,
      p.name,
      p.amenity,
      p.leisure,
      p.sport,
      p.tags,
      ST_Transform(p.way, 4326) AS geom
    FROM planet_osm_point p, bbox b
    WHERE p.way && b.geom
      AND (
        p.tags ? 'playground'              -- playground=slide / swing / …
        OR p.amenity IN ('bench', 'shelter')
        OR p.leisure IN ('picnic_table', 'pitch', 'fitness_station')
      )
  ),
  -- Ways rendered as polygons (pitches, large shelters …)
  equip_ways AS (
    SELECT
      p.osm_id,
      'W'::text AS osm_type,
      p.name,
      p.amenity,
      p.leisure,
      p.sport,
      p.tags,
      ST_Transform(p.way, 4326) AS geom
    FROM planet_osm_polygon p, bbox b
    WHERE p.way && b.geom
      AND (
        p.tags ? 'playground'
        OR p.amenity IN ('bench', 'shelter')
        OR p.leisure IN ('picnic_table', 'pitch', 'fitness_station')
      )
  ),
  -- Ways rendered as lines (zip wires, slides mapped as linear ways …)
  equip_lines AS (
    SELECT
      p.osm_id,
      'W'::text AS osm_type,
      p.name,
      p.amenity,
      p.leisure,
      p.sport,
      p.tags,
      ST_Transform(p.way, 4326) AS geom
    FROM planet_osm_line p, bbox b
    WHERE p.way && b.geom
      AND (
        p.tags ? 'playground'
        OR p.amenity IN ('bench', 'shelter')
        OR p.leisure IN ('picnic_table', 'pitch', 'fitness_station')
      )
  ),
  all_equip AS (
    SELECT * FROM equip_nodes
    UNION ALL
    SELECT * FROM equip_ways
    UNION ALL
    SELECT * FROM equip_lines
  )
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
      json_agg(
        json_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(geom)::json,
          'properties', (
            jsonb_build_object(
              'osm_id',   abs(osm_id),
              'osm_type', osm_type,
              'name',     name,
              'amenity',  amenity,
              'leisure',  leisure,
              'sport',    sport
            ) || COALESCE(hstore_to_jsonb(tags), '{}'::jsonb)
          )
        )
      ),
      '[]'::json
    )
  )
  FROM all_equip;
$$;

GRANT EXECUTE ON FUNCTION api.get_equipment(float8, float8, float8, float8) TO web_anon;

-- =========================================================================
-- 3. get_standalone_equipment(min_lon, min_lat, max_lon, max_lat)
--    Returns pitches, benches, shelters, picnic tables and fitness stations
--    (nodes and polygon ways) that do NOT lie within any
--    leisure=playground polygon.  The GeoJSON shape matches get_equipment
--    so the same frontend styles and tooltip can be reused.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_standalone_pitches(float8, float8, float8, float8);
DROP FUNCTION IF EXISTS api.get_standalone_equipment(float8, float8, float8, float8);

CREATE OR REPLACE FUNCTION api.get_standalone_equipment(
  min_lon float8,
  min_lat float8,
  max_lon float8,
  max_lat float8
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH bbox AS (
    SELECT ST_Transform(
      ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326),
      3857
    ) AS geom
  ),
  -- Standalone pitch polygons in the bbox (not intersecting any playground)
  pitch_areas AS (
    SELECT p.way
    FROM planet_osm_polygon p, bbox b
    WHERE p.way && b.geom
      AND p.leisure = 'pitch'
      AND NOT EXISTS (
        SELECT 1 FROM planet_osm_polygon pg
        WHERE pg.leisure = 'playground'
          AND ST_Intersects(p.way, pg.way)
      )
  ),
  -- The pitch polygons themselves
  pitch_ways AS (
    SELECT
      p.osm_id,
      'W'::text AS osm_type,
      p.name,
      p.amenity,
      p.leisure,
      p.sport,
      p.tags,
      ST_Transform(p.way, 4326) AS geom
    FROM planet_osm_polygon p, bbox b
    WHERE p.way && b.geom
      AND p.leisure = 'pitch'
      AND NOT EXISTS (
        SELECT 1 FROM planet_osm_polygon pg
        WHERE pg.leisure = 'playground'
          AND ST_Intersects(p.way, pg.way)
      )
  ),
  -- Standalone pitch nodes (not within any playground)
  pitch_nodes AS (
    SELECT
      p.osm_id,
      'N'::text AS osm_type,
      p.name,
      p.amenity,
      p.leisure,
      p.sport,
      p.tags,
      ST_Transform(p.way, 4326) AS geom
    FROM planet_osm_point p, bbox b
    WHERE p.way && b.geom
      AND p.leisure = 'pitch'
      AND NOT EXISTS (
        SELECT 1 FROM planet_osm_polygon pg
        WHERE pg.leisure = 'playground'
          AND ST_Within(p.way, pg.way)
      )
  ),
  -- Equipment nodes (benches, shelters, etc.) within a standalone pitch polygon
  equip_nodes AS (
    SELECT
      p.osm_id,
      'N'::text AS osm_type,
      p.name,
      p.amenity,
      p.leisure,
      p.sport,
      p.tags,
      ST_Transform(p.way, 4326) AS geom
    FROM planet_osm_point p
    JOIN pitch_areas pa ON ST_Within(p.way, pa.way)
    WHERE
      p.amenity IN ('bench', 'shelter')
      OR p.leisure IN ('picnic_table', 'fitness_station')
  ),
  all_features AS (
    SELECT * FROM pitch_ways
    UNION ALL
    SELECT * FROM pitch_nodes
    UNION ALL
    SELECT * FROM equip_nodes
  )
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
      json_agg(
        json_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(geom)::json,
          'properties', (
            jsonb_build_object(
              'osm_id',   abs(osm_id),
              'osm_type', osm_type,
              'name',     name,
              'amenity',  amenity,
              'leisure',  leisure,
              'sport',    sport
            ) || COALESCE(hstore_to_jsonb(tags), '{}'::jsonb)
          )
        )
      ),
      '[]'::json
    )
  )
  FROM all_features;
$$;

GRANT EXECUTE ON FUNCTION api.get_standalone_equipment(float8, float8, float8, float8) TO web_anon;

-- =========================================================================
-- 4. get_pois(lat, lon, radius_m)
--    Returns nearby POIs within radius_m metres of the given point.
--    Return shape matches the existing frontend: array of
--      { lat, lon, osm_id, tags: { … } }
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_pois(float8, float8, integer);

CREATE OR REPLACE FUNCTION api.get_pois(
  lat      float8,
  lon      float8,
  radius_m integer DEFAULT 500
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH center AS (
    SELECT ST_Transform(
      ST_SetSRID(ST_MakePoint(lon, lat), 4326),
      3857
    ) AS geom
  ),
  pois_point AS (
    SELECT
      p.osm_id,
      p.name,
      p.amenity,
      p.shop,
      p.highway,
      p.tags,
      ST_Y(ST_Transform(p.way, 4326)) AS poi_lat,
      ST_X(ST_Transform(p.way, 4326)) AS poi_lon
    FROM planet_osm_point p, center c
    WHERE ST_DWithin(p.way, c.geom, radius_m)
      AND (
        p.amenity IN ('toilets', 'ice_cream')
        OR (p.amenity IN ('cafe', 'restaurant') AND p.tags->'cuisine' ~* 'ice_cream')
        OR (p.tags->'emergency' = 'yes'         AND p.tags->'emergency' != 'fire_hydrant')
        OR p.tags->'healthcare:speciality' = 'emergency'
        OR p.highway = 'bus_stop'
        OR p.shop IN ('chemist', 'supermarket', 'convenience')
      )
  ),
  -- Shops/amenities mapped as polygons (e.g. supermarket buildings) — use centroid
  pois_polygon AS (
    SELECT
      p.osm_id,
      p.name,
      p.amenity,
      p.shop,
      NULL::text AS highway,
      p.tags,
      ST_Y(ST_Transform(ST_Centroid(p.way), 4326)) AS poi_lat,
      ST_X(ST_Transform(ST_Centroid(p.way), 4326)) AS poi_lon
    FROM planet_osm_polygon p, center c
    WHERE ST_DWithin(p.way, c.geom, radius_m)
      AND (
        p.amenity IN ('toilets', 'ice_cream')
        OR (p.amenity IN ('cafe', 'restaurant') AND p.tags->'cuisine' ~* 'ice_cream')
        OR p.shop IN ('chemist', 'supermarket', 'convenience')
        OR p.tags->'healthcare:speciality' = 'emergency'
      )
  ),
  pois AS (
    SELECT * FROM pois_point
    UNION ALL
    -- exclude polygons already represented by a node (same osm_id with opposite sign)
    SELECT pp.* FROM pois_polygon pp
    WHERE NOT EXISTS (
      SELECT 1 FROM pois_point pt WHERE pt.osm_id = -pp.osm_id
    )
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'lat',    poi_lat,
        'lon',    poi_lon,
        'osm_id', abs(osm_id),
        'tags', (
          jsonb_build_object(
            'name',    name,
            'amenity', amenity,
            'shop',    shop,
            'highway', highway
          ) || COALESCE(hstore_to_jsonb(tags), '{}'::jsonb)
        )
      )
    ),
    '[]'::json
  )
  FROM pois;
$$;

GRANT EXECUTE ON FUNCTION api.get_pois(float8, float8, integer) TO web_anon;

-- =========================================================================
-- 4. get_trees(min_lon, min_lat, max_lon, max_lat)
--    Returns natural=tree nodes within a WGS84 bounding box as GeoJSON.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_trees(float8, float8, float8, float8);

CREATE OR REPLACE FUNCTION api.get_trees(
  min_lon float8,
  min_lat float8,
  max_lon float8,
  max_lat float8
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH bbox AS (
    SELECT ST_Transform(
      ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326),
      3857
    ) AS geom
  )
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
      json_agg(
        json_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(ST_Transform(p.way, 4326))::json,
          'properties', jsonb_build_object(
            'osm_id', p.osm_id,
            'name',   p.name
          ) || COALESCE(hstore_to_jsonb(p.tags), '{}'::jsonb)
        )
      ),
      '[]'::json
    )
  )
  FROM planet_osm_point p, bbox b
  WHERE p.way && b.geom
    AND p.natural = 'tree';
$$;

GRANT EXECUTE ON FUNCTION api.get_trees(float8, float8, float8, float8) TO web_anon;

-- =========================================================================
-- import_status — singleton table persisting the last successful import time.
--   Written by import.sh after each successful osm2pgsql + api.sql run.
--   Read by get_meta to expose data freshness to the hub.
--   CHECK (id = 1) enforces singleton; UPSERT via ON CONFLICT (id) DO UPDATE.
-- =========================================================================
CREATE TABLE IF NOT EXISTS api.import_status (
  id                  int          PRIMARY KEY CHECK (id = 1),
  last_import_at      timestamptz  NOT NULL,
  -- osm_data_timestamp is the `osmosis_replication_timestamp` from the PBF
  -- header — i.e. when Geofabrik (or whoever produced the PBF) last
  -- snapshotted OSM. Distinct from `last_import_at` (when our importer
  -- ran): the importer can run hourly against a PBF that refreshes
  -- weekly. Surfaced to users as "OSM data is N days old"; surfaced to
  -- operators as `last_import_at` ("did the cron run").
  osm_data_timestamp  timestamptz,
  source_pbf_url      text,
  pbf_etag            text
);

-- Idempotent ALTER for upgrades from FHE-pre-osm-data-age deployments.
ALTER TABLE api.import_status
  ADD COLUMN IF NOT EXISTS osm_data_timestamp timestamptz;

GRANT SELECT ON api.import_status TO web_anon;

-- =========================================================================
-- 5. get_meta(relation_id)
--    Returns instance metadata for federation (Hub discovery).
--    Includes the OSM relation name, playground count, and bounding box.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_meta(bigint);

CREATE OR REPLACE FUNCTION api.get_meta(relation_id bigint DEFAULT ${OSM_RELATION_ID})
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH region AS (
    -- See get_playgrounds for why ST_Union is needed. Name is identical
    -- across fragments of the same relation, so max() picks any non-null.
    SELECT max(name) AS name, ST_Union(way) AS way
    FROM planet_osm_polygon
    WHERE osm_id = -relation_id
  ),
  bbox AS (
    SELECT ST_Transform(way, 4326) AS geom FROM region
  ),
  counts AS (
    -- INNER JOIN playground_stats so the invariant
    --   playground_count = complete + partial + missing
    -- holds by construction. Every playground in the configured region has
    -- a stats row because the MV is built from the same source table.
    SELECT
      COUNT(*)::int                                                        AS playground_count,
      SUM(CASE WHEN ps.completeness = 'complete' THEN 1 ELSE 0 END)::int   AS complete,
      SUM(CASE WHEN ps.completeness = 'partial'  THEN 1 ELSE 0 END)::int   AS partial,
      SUM(CASE WHEN ps.completeness = 'missing'  THEN 1 ELSE 0 END)::int   AS missing
    FROM planet_osm_polygon p
    JOIN region r ON ST_Within(p.way, r.way)
    JOIN public.playground_stats ps ON ps.osm_id = p.osm_id
    WHERE p.leisure = 'playground'
  ),
  import_status AS (
    -- NULL when no import has run yet (table empty); callers must handle NULL.
    SELECT last_import_at, osm_data_timestamp FROM api.import_status WHERE id = 1
  )
  SELECT json_build_object(
    'relation_id',           relation_id,
    'name',                  (SELECT name FROM region),
    'playground_count',      (SELECT playground_count FROM counts),
    'complete',              (SELECT complete         FROM counts),
    'partial',               (SELECT partial          FROM counts),
    'missing',               (SELECT missing          FROM counts),
    'bbox',                  ARRAY[
                               ST_XMin((SELECT geom FROM bbox)),
                               ST_YMin((SELECT geom FROM bbox)),
                               ST_XMax((SELECT geom FROM bbox)),
                               ST_YMax((SELECT geom FROM bbox))
                             ],
    'last_import_at',        (SELECT last_import_at FROM import_status),
    'data_age_seconds',      (SELECT EXTRACT(EPOCH FROM (now() - last_import_at))::int FROM import_status),
    -- `osm_data_timestamp` is the moment OSM last produced the data this
    -- backend serves (PBF replication timestamp); `osm_data_age_seconds`
    -- is the user-facing "how old is this data?" derived value.
    'osm_data_timestamp',    (SELECT osm_data_timestamp FROM import_status),
    'osm_data_age_seconds',  (SELECT EXTRACT(EPOCH FROM (now() - osm_data_timestamp))::int FROM import_status)
  );
$$;

GRANT EXECUTE ON FUNCTION api.get_meta(bigint) TO web_anon;

CREATE INDEX IF NOT EXISTS idx_osm_point_natural ON planet_osm_point ("natural") WHERE "natural" IS NOT NULL;

-- Spatial indexes to speed up bbox and radius queries (idempotent)
-- =========================================================================
-- 6. get_nearest_playgrounds(lat, lon, relation_id, max_results)
--    Returns the nearest playgrounds to a given WGS84 point,
--    ordered by distance ascending.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_nearest_playgrounds(float8, float8, bigint, int);

CREATE OR REPLACE FUNCTION api.get_nearest_playgrounds(
  lat          float8,
  lon          float8,
  relation_id  bigint DEFAULT ${OSM_RELATION_ID},
  max_results  int    DEFAULT 5
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH center AS (
    SELECT
      ST_Transform(ST_SetSRID(ST_MakePoint(lon, lat), 4326), 3857)  AS geom_3857,
      ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography            AS geog_4326
  ),
  region AS (
    SELECT ST_Union(way) AS way FROM planet_osm_polygon WHERE osm_id = -relation_id
  ),
  nearest AS (
    SELECT
      p.osm_id,
      p.name,
      p.operator,
      p.access,
      p.surface,
      p.tags,
      ST_Distance(ST_Transform(p.way, 4326)::geography, c.geog_4326)  AS distance_m,
      ST_Y(ST_Transform(ST_Centroid(p.way), 4326))                    AS centroid_lat,
      ST_X(ST_Transform(ST_Centroid(p.way), 4326))                    AS centroid_lon
    FROM planet_osm_polygon p, center c, region r
    WHERE p.leisure = 'playground'
      AND ST_Within(p.way, r.way)
    ORDER BY p.way <-> c.geom_3857
    LIMIT max_results
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'osm_id',      abs(osm_id),
        'name',        name,
        'lat',         centroid_lat,
        'lon',         centroid_lon,
        'distance_m',  round(distance_m::numeric),
        'tags', (
          jsonb_build_object(
            'name',          name,
            'operator',      operator,
            'access',        access,
            'surface',       surface
          ) || COALESCE(hstore_to_jsonb(tags), '{}'::jsonb)
        )
      )
      ORDER BY distance_m
    ),
    '[]'::json
  )
  FROM nearest;
$$;

GRANT EXECUTE ON FUNCTION api.get_nearest_playgrounds(float8, float8, bigint, int) TO web_anon;

CREATE INDEX IF NOT EXISTS idx_osm_polygon_way  ON planet_osm_polygon USING GIST (way);
CREATE INDEX IF NOT EXISTS idx_osm_point_way    ON planet_osm_point   USING GIST (way);
CREATE INDEX IF NOT EXISTS idx_osm_polygon_lei  ON planet_osm_polygon (leisure) WHERE leisure IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_osm_point_amenity ON planet_osm_point  (amenity) WHERE amenity IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_osm_point_shop    ON planet_osm_point  (shop)    WHERE shop    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_osm_point_highway ON planet_osm_point  (highway) WHERE highway IS NOT NULL;
