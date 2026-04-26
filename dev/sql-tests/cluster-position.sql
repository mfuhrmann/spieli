-- Regression for `position-clusters-at-member-centroid`.
--
-- Run after `make seed-load` (4-playground Fulda fixture) inside the running
-- Postgres container, e.g.:
--
--   docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
--       -f /workspace/dev/sql-tests/cluster-position.sql
--
-- (or run from a host psql with the right -h/-U/-d). Asserts:
--   1. At a zoom where ≥ 2 seeded playgrounds share a grid cell, the
--      bucket's lon/lat equals ST_Centroid(ST_Collect(centroid_3857)) over
--      that cell's members (≤ 1e-6 deg float tolerance).
--   2. The bucket's lon/lat is *not* the WGS84 reprojection of the grid
--      cell anchor — i.e. the change is in effect, not the legacy
--      grid-anchor behaviour.

DO $$
DECLARE
  v_z       int    := 7;          -- 78 km cell — Fulda's 4 playgrounds collapse into one bucket
  v_min_lon float8 := 8.5;
  v_min_lat float8 := 50.0;
  v_max_lon float8 := 10.5;
  v_max_lat float8 := 51.2;

  v_cell_size float8 := 78125;    -- mirrors api.get_playground_clusters z=7 row

  v_resp    json;
  v_bucket  json;
  v_count   int;
  v_lon     float8;
  v_lat     float8;

  v_member_centroid geometry;
  v_cell_anchor     geometry;
  v_expected_lon    float8;
  v_expected_lat    float8;
  v_anchor_lon      float8;
  v_anchor_lat      float8;
BEGIN
  v_resp := api.get_playground_clusters(v_z, v_min_lon, v_min_lat, v_max_lon, v_max_lat);

  -- Pick the largest multi-member bucket. The 4 Fulda playgrounds collapse
  -- into a single cell at z=7; if the seed grows to span a cell boundary
  -- in the future, the test still picks the densest bucket.
  SELECT b INTO v_bucket
  FROM json_array_elements(v_resp) b
  WHERE (b ->> 'count')::int >= 2
  ORDER BY (b ->> 'count')::int DESC
  LIMIT 1;

  IF v_bucket IS NULL THEN
    RAISE EXCEPTION
      'No multi-member bucket at z=%; seed must place >= 2 playgrounds in one cell. Response: %',
      v_z, v_resp;
  END IF;

  v_count := (v_bucket ->> 'count')::int;
  v_lon   := (v_bucket ->> 'lon')::float8;
  v_lat   := (v_bucket ->> 'lat')::float8;

  -- Recompute the expected mean from the *same* bucketing the function uses,
  -- and pick the cell with that exact member count nearest the reported
  -- (lon, lat). For the Fulda seed this resolves to a single 4-member cell.
  WITH bbox AS (
    SELECT ST_Transform(
      ST_MakeEnvelope(v_min_lon, v_min_lat, v_max_lon, v_max_lat, 4326),
      3857
    ) AS geom
  ),
  bucketed AS (
    SELECT
      ST_SnapToGrid(ps.centroid_3857, v_cell_size) AS cell,
      ps.centroid_3857
    FROM public.playground_stats ps, bbox b
    WHERE ST_Intersects(ps.centroid_3857, b.geom)
  ),
  picked AS (
    SELECT
      cell,
      ST_Centroid(ST_Collect(centroid_3857)) AS member_centroid,
      COUNT(*)::int                          AS n
    FROM bucketed
    GROUP BY cell
    HAVING COUNT(*) = v_count
  )
  SELECT member_centroid, cell
    INTO v_member_centroid, v_cell_anchor
    FROM picked
   ORDER BY ST_Distance(
     ST_Transform(member_centroid, 4326),
     ST_SetSRID(ST_MakePoint(v_lon, v_lat), 4326)
   )
   LIMIT 1;

  IF v_member_centroid IS NULL THEN
    RAISE EXCEPTION
      'Could not reproduce bucket: no cell with exactly % members. Response: %',
      v_count, v_resp;
  END IF;

  v_expected_lon := ST_X(ST_Transform(v_member_centroid, 4326));
  v_expected_lat := ST_Y(ST_Transform(v_member_centroid, 4326));

  IF abs(v_lon - v_expected_lon) > 1e-6 OR abs(v_lat - v_expected_lat) > 1e-6 THEN
    RAISE EXCEPTION
      'Bucket position diverges from ST_Centroid(ST_Collect(centroid_3857)): bucket=(%, %), expected=(%, %)',
      v_lon, v_lat, v_expected_lon, v_expected_lat;
  END IF;

  v_anchor_lon := ST_X(ST_Transform(v_cell_anchor, 4326));
  v_anchor_lat := ST_Y(ST_Transform(v_cell_anchor, 4326));

  IF abs(v_lon - v_anchor_lon) <= 1e-6 AND abs(v_lat - v_anchor_lat) <= 1e-6 THEN
    RAISE EXCEPTION
      'Bucket position equals the grid cell anchor — pre-change regression: bucket=(%, %), cell anchor=(%, %)',
      v_lon, v_lat, v_anchor_lon, v_anchor_lat;
  END IF;

  RAISE NOTICE
    'OK z=% bucket(% members) lon=%, lat=% — matches member centroid within 1e-6, distinct from cell anchor (%, %)',
    v_z, v_count, v_lon, v_lat, v_anchor_lon, v_anchor_lat;
END $$;
