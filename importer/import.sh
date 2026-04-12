#!/bin/sh
# Full re-import of OSM data into PostGIS.
# Run via: docker compose run --rm importer
#
# Environment variables:
#   PBF_URL            Geofabrik .osm.pbf download URL
#                      Default: Hessen extract (≈ 300 MB, covers Fulda)
#   POSTGRES_HOST      Default: db
#   POSTGRES_PORT      Default: 5432
#   POSTGRES_DB        Default: osm
#   POSTGRES_USER      Default: osm
#   POSTGRES_PASSWORD  Required
#   OSM2PGSQL_THREADS  Default: 4

set -e

PBF_URL="${PBF_URL:-https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf}"
PBF_FILE="/data/region.pbf"

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
# Download PBF
# --------------------------------------------------------------------------- #
echo "[importer] Downloading $PBF_URL ..."
wget --progress=dot:giga -O "$PBF_FILE" "$PBF_URL"
echo "[importer] Download complete: $(du -sh "$PBF_FILE" | cut -f1)"

# --------------------------------------------------------------------------- #
# Import with osm2pgsql
# --------------------------------------------------------------------------- #
echo "[importer] Starting osm2pgsql import..."
osm2pgsql \
    --host     "$POSTGRES_HOST" \
    --port     "$POSTGRES_PORT" \
    --database "$POSTGRES_DB"   \
    --username "$POSTGRES_USER" \
    --slim     \
    --drop     \
    --hstore   \
    --number-processes "$OSM2PGSQL_THREADS" \
    "$PBF_FILE"

echo "[importer] osm2pgsql finished."

# --------------------------------------------------------------------------- #
# Create PostgREST API schema (views / functions)
# --------------------------------------------------------------------------- #
echo "[importer] Applying API schema..."
envsubst '$OSM_RELATION_ID' < /api.sql \
    | psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# --------------------------------------------------------------------------- #
# Notify PostgREST to reload its schema cache
# --------------------------------------------------------------------------- #
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "NOTIFY pgrst, 'reload schema';"

echo "[importer] Done. PostgREST schema reloaded."
