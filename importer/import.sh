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

# `-e` aborts on any unchecked non-zero exit. The script's shebang is
# `#!/bin/sh` and the importer image's /bin/sh is busybox / dash, neither of
# which supports `set -o pipefail` (bash extension). The `envsubst | psql`
# pipeline that applies api.sql is therefore restructured to write to a
# tempfile via `> "$TMP_API_SQL"` so `set -e` catches envsubst failures,
# and psql is invoked with `-f "$TMP_API_SQL" -v ON_ERROR_STOP=1` so a SQL
# error inside api.sql aborts before the api.import_status UPSERT runs —
# matching the scheduled-importer spec scenario "Failed run does not
# update timestamp" without depending on `pipefail`.
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

PG_MAX_PARALLEL_WORKERS="${PG_MAX_PARALLEL_WORKERS:-2}"
PG_MAX_PARALLEL_WORKERS_PER_GATHER="${PG_MAX_PARALLEL_WORKERS_PER_GATHER:-2}"
PG_MAX_PARALLEL_MAINTENANCE_WORKERS="${PG_MAX_PARALLEL_MAINTENANCE_WORKERS:-2}"
PG_MAINTENANCE_WORK_MEM="${PG_MAINTENANCE_WORK_MEM:-256MB}"
PG_WORK_MEM="${PG_WORK_MEM:-32MB}"

# Validate PG_* before they reach envsubst → SQL. Strict regexes prevent
# both injection (the values flow into raw SQL via `SET … = '${VAR}';`) and
# silent kB-vs-MB confusion (PostgreSQL parses bare integers in memory GUCs
# as kilobytes — `PG_WORK_MEM=128` means 128 kB, not 128 MB).
for var in PG_MAX_PARALLEL_WORKERS PG_MAX_PARALLEL_WORKERS_PER_GATHER PG_MAX_PARALLEL_MAINTENANCE_WORKERS; do
    eval "value=\${$var}"
    case "$value" in
        ''|*[!0-9]*)
            echo "[importer] $var must be a positive integer (got: '$value')" >&2
            exit 1
            ;;
    esac
done
for var in PG_MAINTENANCE_WORK_MEM PG_WORK_MEM; do
    eval "value=\${$var}"
    case "$value" in
        *[0-9]kB|*[0-9]MB|*[0-9]GB|*[0-9]TB) ;;
        *)
            echo "[importer] $var must be a number followed by a unit (kB|MB|GB|TB) (got: '$value')" >&2
            exit 1
            ;;
    esac
done
if [ "$PG_MAX_PARALLEL_WORKERS_PER_GATHER" -gt "$PG_MAX_PARALLEL_WORKERS" ] \
    || [ "$PG_MAX_PARALLEL_MAINTENANCE_WORKERS" -gt "$PG_MAX_PARALLEL_WORKERS" ]; then
    echo "[importer] PG_MAX_PARALLEL_WORKERS_PER_GATHER and PG_MAX_PARALLEL_MAINTENANCE_WORKERS must each be ≤ PG_MAX_PARALLEL_WORKERS ($PG_MAX_PARALLEL_WORKERS); PostgreSQL silently caps the excess otherwise" >&2
    exit 1
fi

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
# Download PBF (skipped if already cached and intact)
# --------------------------------------------------------------------------- #
if [ -f "$PBF_FILE" ]; then
    if ! osmium fileinfo "$PBF_FILE" > /dev/null 2>&1; then
        echo "[importer] Cached $PBF_FILE is corrupt or incomplete — re-downloading..."
        rm -f "$PBF_FILE"
    else
        echo "[importer] Using cached $PBF_FILE ($(du -sh "$PBF_FILE" | cut -f1))"
    fi
fi
if [ ! -f "$PBF_FILE" ]; then
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
# Create PostgREST API schema (views / functions)
# --------------------------------------------------------------------------- #
echo "[importer] Applying API schema..."
# Stage the env-substituted SQL in a tempfile, then run psql against it with
# `-f` and `ON_ERROR_STOP=1`. POSIX sh has no `pipefail`, so a piped
# `envsubst | psql` would silently succeed on an envsubst failure — staging
# via a tempfile lets `set -e` abort us properly when envsubst fails, AND
# `ON_ERROR_STOP=1` aborts on any SQL error inside api.sql. Together these
# guarantee the api.import_status UPSERT below only runs on a fully-applied
# schema (matches scheduled-importer spec "Failed run does not update
# timestamp").
TMP_API_SQL=$(mktemp)
trap 'rm -f "$TMP_API_SQL"' EXIT
envsubst '$OSM_RELATION_ID $PG_MAX_PARALLEL_WORKERS $PG_MAX_PARALLEL_WORKERS_PER_GATHER $PG_MAX_PARALLEL_MAINTENANCE_WORKERS $PG_MAINTENANCE_WORK_MEM $PG_WORK_MEM' < /api.sql > "$TMP_API_SQL"
psql -v ON_ERROR_STOP=1 \
    -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -f "$TMP_API_SQL"

# --------------------------------------------------------------------------- #
# Record successful import timestamp (read by get_meta / federation-status).
# Two timestamps are persisted:
#   - last_import_at: when this script ran (operator-facing; "is the cron
#     healthy?")
#   - osm_data_timestamp: the `osmosis_replication_timestamp` from the source
#     PBF header (user-facing; "how old is the data I'm looking at?")
# These diverge whenever the importer runs more often than Geofabrik
# refreshes its extracts — `last_import_at` can be "5 min ago" while the
# OSM data itself is up to a week old.
# --------------------------------------------------------------------------- #

# Extract the OSM replication timestamp from the original PBF (before our
# bbox+tags filtering, which can drop the header on some osmium versions).
# `osmium fileinfo --json` emits ISO-8601 already — pass straight to psql.
# Fall back to NULL if the header is missing (some non-Geofabrik PBFs).
OSM_DATA_TS=$(osmium fileinfo --json "$PBF_FILE" 2>/dev/null \
    | jq -r '.header.option.osmosis_replication_timestamp // empty' 2>/dev/null || true)

if [ -n "$OSM_DATA_TS" ]; then
    echo "[importer] Source PBF replication timestamp: $OSM_DATA_TS"
    OSM_DATA_TS_SQL="'${OSM_DATA_TS}'::timestamptz"
else
    echo "[importer] WARNING: source PBF lacks osmosis_replication_timestamp header — osm_data_timestamp will be NULL."
    OSM_DATA_TS_SQL="NULL"
fi

psql -v ON_ERROR_STOP=1 \
    -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "INSERT INTO api.import_status (id, last_import_at, osm_data_timestamp)
        VALUES (1, now(), ${OSM_DATA_TS_SQL})
        ON CONFLICT (id) DO UPDATE
        SET last_import_at      = EXCLUDED.last_import_at,
            osm_data_timestamp  = COALESCE(EXCLUDED.osm_data_timestamp, api.import_status.osm_data_timestamp);"

# --------------------------------------------------------------------------- #
# Notify PostgREST to reload its schema cache
# --------------------------------------------------------------------------- #
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "NOTIFY pgrst, 'reload schema';"

echo "[importer] Done. PostgREST schema reloaded."
