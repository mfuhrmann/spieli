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
-- 1. get_playgrounds(relation_id)
--    Returns all leisure=playground polygons inside the given OSM admin
--    relation as a GeoJSON FeatureCollection.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_playgrounds(bigint);

CREATE OR REPLACE FUNCTION api.get_playgrounds(relation_id bigint DEFAULT 62700)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH region AS (
    -- osm2pgsql stores relation IDs as negative numbers
    SELECT way FROM planet_osm_polygon
    WHERE osm_id = -relation_id
    LIMIT 1
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
          'geometry', ST_AsGeoJSON(geom)::json,
          'properties', (
            jsonb_build_object(
              'osm_id',    abs(osm_id),
              'osm_type',  CASE WHEN osm_id < 0 THEN 'R' ELSE 'W' END,
              'name',      name,
              'leisure',   leisure,
              'operator',  operator,
              'access',    access,
              'surface',   surface,
              'area',      area
            ) || COALESCE(hstore_to_jsonb(tags), '{}'::jsonb)
          )
        )
      ),
      '[]'::json
    )
  )
  FROM playgrounds;
$$;

GRANT EXECUTE ON FUNCTION api.get_playgrounds(bigint) TO web_anon;

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
-- 3. get_pois(lat, lon, radius_m)
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
  pois AS (
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
        p.amenity IN ('toilets', 'hospital', 'ice_cream', 'doctors')
        OR (p.amenity IN ('cafe', 'restaurant') AND p.tags->'cuisine' ~* 'ice_cream')
        OR (p.amenity = 'doctors'               AND p.tags->'emergency' = 'yes')
        OR (p.tags->'emergency' = 'yes'         AND p.tags->'emergency' != 'fire_hydrant')
        OR p.highway = 'bus_stop'
        OR p.shop IN ('chemist', 'supermarket', 'convenience')
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

-- Spatial indexes to speed up bbox and radius queries (idempotent)
CREATE INDEX IF NOT EXISTS idx_osm_polygon_way  ON planet_osm_polygon USING GIST (way);
CREATE INDEX IF NOT EXISTS idx_osm_point_way    ON planet_osm_point   USING GIST (way);
CREATE INDEX IF NOT EXISTS idx_osm_polygon_lei  ON planet_osm_polygon (leisure) WHERE leisure IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_osm_point_amenity ON planet_osm_point  (amenity) WHERE amenity IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_osm_point_shop    ON planet_osm_point  (shop)    WHERE shop    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_osm_point_highway ON planet_osm_point  (highway) WHERE highway IS NOT NULL;
