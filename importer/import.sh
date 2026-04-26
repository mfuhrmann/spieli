#!/bin/sh
# Full re-import of OSM data into PostGIS.
# Run via: docker compose run --rm importer
#
# Environment variables:
#   PBF_URL                Geofabrik .osm.pbf download URL
#                          Default: Hessen extract (≈ 300 MB, covers Fulda)
#   OSM_RELATION_ID        OSM relation ID of the target region (used for Nominatim bbox lookup)
#   OSM_BBOX               Optional bbox override: west,south,east,north (skips Nominatim)
#   OSM_BBOX_PADDING       Degrees to pad bbox on each side (default: 0.15 ≈ 15 km)
#   OSM_PREFILTER_MIN_MB   Skip bbox pre-filter if source PBF is smaller than this (default: 20)
#   POSTGRES_HOST          Default: db
#   POSTGRES_PORT          Default: 5432
#   POSTGRES_DB            Default: osm
#   POSTGRES_USER          Default: osm
#   POSTGRES_PASSWORD      Required
#   OSM2PGSQL_THREADS      Default: 4

set -e

PBF_URL="${PBF_URL:-https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf}"
PBF_FILE="/data/$(basename "$PBF_URL")"
PBF_BASENAME=$(basename "$PBF_FILE" .pbf)

OSM_BBOX="${OSM_BBOX:-}"
OSM_BBOX_PADDING="${OSM_BBOX_PADDING:-0.15}"
OSM_PREFILTER_MIN_MB="${OSM_PREFILTER_MIN_MB:-20}"

POSTGRES_HOST="${POSTGRES_HOST:-db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-osm}"
POSTGRES_USER="${POSTGRES_USER:-osm}"
OSM2PGSQL_THREADS="${OSM2PGSQL_THREADS:-4}"

export PGPASSWORD="$POSTGRES_PASSWORD"

# --------------------------------------------------------------------------- #
# Wait for PostGIS to be ready
# --------------------------------------------------------------------------- #
echo "[importer] Waiting for PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
until pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q; do
    sleep 2
done
echo "[importer] PostgreSQL is ready."

# --------------------------------------------------------------------------- #
# Download PBF (skipped if already cached under the same filename)
# --------------------------------------------------------------------------- #
if [ -f "$PBF_FILE" ]; then
    echo "[importer] Using cached $PBF_FILE ($(du -sh "$PBF_FILE" | cut -f1)) — delete volume to force re-download"
else
    echo "[importer] Downloading $PBF_URL ..."
    wget --progress=dot:giga -O "$PBF_FILE" "$PBF_URL"
    echo "[importer] Download complete: $(du -sh "$PBF_FILE" | cut -f1)"
fi

# --------------------------------------------------------------------------- #
# Step 1 — Bbox pre-filter: clip PBF to region bounding box
# --------------------------------------------------------------------------- #
SKIP_PREFILTER=0
IMPORT_PBF="$PBF_FILE"

# Skip for already-small source PBFs (city-level extracts, etc.)
PBF_SIZE_MB=$(du -m "$PBF_FILE" | cut -f1)
if [ "$PBF_SIZE_MB" -lt "$OSM_PREFILTER_MIN_MB" ]; then
    echo "[importer] Source PBF is small (${PBF_SIZE_MB} MB < ${OSM_PREFILTER_MIN_MB} MB), skipping bbox pre-filter"
    SKIP_PREFILTER=1
fi

if [ "$SKIP_PREFILTER" -eq 0 ]; then
    if [ -n "$OSM_BBOX" ]; then
        echo "[importer] Using OSM_BBOX override: $OSM_BBOX"
        RESOLVED_BBOX="$OSM_BBOX"
    else
        echo "[importer] Querying Nominatim for bbox of relation ${OSM_RELATION_ID}..."
        NOMINATIM_RESPONSE=$(curl -sf --max-time 15 \
            "https://nominatim.openstreetmap.org/lookup?osm_ids=R${OSM_RELATION_ID}&format=json" \
            -H "User-Agent: spielplatzkarte-importer/1.0" || true)

        RAW_BBOX=$(echo "$NOMINATIM_RESPONSE" | jq -r '.[0].boundingbox // empty' 2>/dev/null || true)

        if [ -z "$RAW_BBOX" ]; then
            echo "[importer] WARNING: bbox lookup failed, importing full PBF"
            SKIP_PREFILTER=1
        else
            # Nominatim returns [south, north, west, east]; reorder and pad to west,south,east,north
            SOUTH=$(echo "$RAW_BBOX" | jq -r '.[0]')
            NORTH=$(echo "$RAW_BBOX" | jq -r '.[1]')
            WEST=$(echo "$RAW_BBOX"  | jq -r '.[2]')
            EAST=$(echo "$RAW_BBOX"  | jq -r '.[3]')
            RESOLVED_BBOX=$(awk -v w="$WEST" -v s="$SOUTH" -v e="$EAST" -v n="$NORTH" \
                -v pad="$OSM_BBOX_PADDING" \
                'BEGIN { printf "%.6f,%.6f,%.6f,%.6f", w-pad, s-pad, e+pad, n+pad }')
            echo "[importer] Resolved bbox (padded ${OSM_BBOX_PADDING}°): $RESOLVED_BBOX"
        fi
    fi
fi

if [ "$SKIP_PREFILTER" -eq 0 ]; then
    BBOX_PBF="/data/${PBF_BASENAME}_${OSM_RELATION_ID}.pbf"

    if [ -f "$BBOX_PBF" ] && [ "$BBOX_PBF" -nt "$PBF_FILE" ]; then
        echo "[importer] Bbox cache hit: $BBOX_PBF is newer than source, skipping osmium extract"
    else
        echo "[importer] Running osmium extract (bbox=$RESOLVED_BBOX)..."
        osmium extract \
            --bbox="$RESOLVED_BBOX" \
            --strategy=smart \
            -o "$BBOX_PBF" \
            "$PBF_FILE" \
            --overwrite
        echo "[importer] Bbox extract complete: $(du -sh "$BBOX_PBF" | cut -f1)"
    fi

    IMPORT_PBF="$BBOX_PBF"
fi

# --------------------------------------------------------------------------- #
# Step 2 — Tag filter: keep only objects the app actually queries
# --------------------------------------------------------------------------- #
TAGS_PBF="/data/${PBF_BASENAME}_${OSM_RELATION_ID}_tags.pbf"

if [ -f "$TAGS_PBF" ] && [ "$TAGS_PBF" -nt "$IMPORT_PBF" ]; then
    echo "[importer] Tag-filter cache hit: $TAGS_PBF is newer than source, skipping osmium tags-filter"
else
    echo "[importer] Running osmium tags-filter..."
    osmium tags-filter \
        -o "$TAGS_PBF" \
        "$IMPORT_PBF" \
        --overwrite \
        n/natural=tree \
        n/leisure=playground \
        n/leisure=pitch \
        n/leisure=fitness_station \
        n/leisure=picnic_table \
        n/amenity=bench \
        n/amenity=shelter \
        n/amenity=toilets \
        n/amenity=ice_cream \
        n/amenity=cafe \
        n/amenity=restaurant \
        n/highway=bus_stop \
        n/shop=chemist \
        n/shop=supermarket \
        n/shop=convenience \
        n/emergency \
        n/playground \
        w/leisure=playground \
        w/leisure=pitch \
        w/leisure=fitness_station \
        w/leisure=picnic_table \
        w/amenity=bench \
        w/amenity=shelter \
        w/amenity=toilets \
        w/amenity=ice_cream \
        w/amenity=cafe \
        w/amenity=restaurant \
        w/shop=chemist \
        w/shop=supermarket \
        w/shop=convenience \
        w/playground \
        r/leisure=playground \
        r/leisure=pitch \
        r/type=multipolygon \
        r/boundary=administrative
    echo "[importer] Tag-filter complete: $(du -sh "$TAGS_PBF" | cut -f1)"
fi

IMPORT_PBF="$TAGS_PBF"

# --------------------------------------------------------------------------- #
# Import with osm2pgsql
# --------------------------------------------------------------------------- #
echo "[importer] Starting osm2pgsql import on $IMPORT_PBF..."
osm2pgsql \
    --host     "$POSTGRES_HOST" \
    --port     "$POSTGRES_PORT" \
    --database "$POSTGRES_DB"   \
    --username "$POSTGRES_USER" \
    --slim     \
    --drop     \
    --hstore   \
    --number-processes "$OSM2PGSQL_THREADS" \
    "$IMPORT_PBF"

echo "[importer] osm2pgsql finished."

# --------------------------------------------------------------------------- #
# Record import timestamps (extracted now, written after api.sql creates table)
# --------------------------------------------------------------------------- #
OSM_DATA_AGE=""
if osmium_output=$(osmium fileinfo --json "$IMPORT_PBF" 2>/dev/null); then
    OSM_DATA_AGE=$(echo "$osmium_output" | jq -r '.header.option.osmosis_replication_timestamp // empty' 2>/dev/null || true)
    if [ -z "$OSM_DATA_AGE" ]; then
        echo "[importer] WARNING: osmosis_replication_timestamp not present in PBF header — osm_data_age will be NULL"
    fi
else
    echo "[importer] WARNING: osmium fileinfo failed — osm_data_age will be NULL"
fi

# --------------------------------------------------------------------------- #
# Create PostgREST API schema (views / functions)
# --------------------------------------------------------------------------- #
echo "[importer] Applying API schema..."
envsubst '$OSM_RELATION_ID' < /api.sql \
    | psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# --------------------------------------------------------------------------- #
# Upsert timestamps — api.meta is guaranteed to exist after api.sql runs above
# --------------------------------------------------------------------------- #
# Validate timestamp format before interpolating to prevent injection
if echo "$OSM_DATA_AGE" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'; then
    AGE_EXPR="'${OSM_DATA_AGE}'"
else
    AGE_EXPR="NULL"
fi
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "INSERT INTO api.meta (id, imported_at, osm_data_age) VALUES (1, now(), ${AGE_EXPR}) ON CONFLICT (id) DO UPDATE SET imported_at = EXCLUDED.imported_at, osm_data_age = EXCLUDED.osm_data_age;"
echo "[importer] Timestamps recorded (osm_data_age=${OSM_DATA_AGE:-NULL})."

# --------------------------------------------------------------------------- #
# Notify PostgREST to reload its schema cache
# --------------------------------------------------------------------------- #
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "NOTIFY pgrst, 'reload schema';"

echo "[importer] Done. PostgREST schema reloaded."
