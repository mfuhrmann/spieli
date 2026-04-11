#!/usr/bin/env bash
# Spielplatzkarte installer
# Downloads the production compose file and db schema, then walks through
# configuration interactively.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spielplatzkarte/main/install.sh -o install.sh
#   bash install.sh

set -euo pipefail

# ── Helpers ────────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { printf "${CYAN}==>${RESET} %s\n" "$*"; }
success() { printf "${GREEN}✓${RESET}  %s\n" "$*"; }
warn()    { printf "${YELLOW}!${RESET}  %s\n" "$*"; }
die()     { printf "${RED}error:${RESET} %s\n" "$*" >&2; exit 1; }

ask() {
    # ask <variable> <prompt> [default]
    local var="$1" prompt="$2" default="${3:-}"
    if [[ -n "$default" ]]; then
        printf "${BOLD}%s${RESET} [%s]: " "$prompt" "$default"
    else
        printf "${BOLD}%s${RESET}: " "$prompt"
    fi
    read -r input
    if [[ -z "$input" && -n "$default" ]]; then
        printf -v "$var" '%s' "$default"
    elif [[ -n "$input" ]]; then
        printf -v "$var" '%s' "$input"
    else
        die "$prompt is required."
    fi
}

ask_optional() {
    # ask_optional <variable> <prompt>
    local var="$1" prompt="$2"
    printf "${BOLD}%s${RESET} (leave empty to skip): " "$prompt"
    read -r input
    printf -v "$var" '%s' "${input:-}"
}

confirm() {
    # confirm <prompt> — returns 0 for yes, 1 for no
    printf "${BOLD}%s${RESET} [Y/n]: " "$1"
    read -r ans
    [[ "${ans:-y}" =~ ^[Yy]$ ]]
}

fetch() {
    # fetch <url> <dest>
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$1" -o "$2"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO "$2" "$1"
    else
        die "Neither curl nor wget found. Please install one and retry."
    fi
}

# ── Dependency check ───────────────────────────────────────────────────────────

for cmd in docker openssl; do
    command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' is required but not found in PATH."
done
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin is not available."
docker info >/dev/null 2>&1           || die "Docker daemon is not running."

# ── Header ─────────────────────────────────────────────────────────────────────

printf "\n"
printf "${BOLD}Spielplatzkarte — Production Installer${RESET}\n"
printf "Playground map powered by OpenStreetMap\n"
printf "https://github.com/mfuhrmann/spielplatzkarte\n\n"

# ── Deployment directory ───────────────────────────────────────────────────────

ask DEPLOY_DIR "Deployment directory" "./spielplatzkarte"
mkdir -p "$DEPLOY_DIR/db"

if [[ -f "$DEPLOY_DIR/.env" ]]; then
    warn ".env already exists in $DEPLOY_DIR"
    confirm "Overwrite it?" || die "Aborted."
fi

# ── Region configuration ───────────────────────────────────────────────────────

printf "\n${BOLD}── Region ──────────────────────────────────────────────────────${RESET}\n"
printf "Find the OSM relation ID: https://nominatim.openstreetmap.org\n"
printf "Find a PBF extract:       https://download.geofabrik.de\n\n"

ask OSM_RELATION_ID "OSM relation ID of your region (e.g. 62700 = Landkreis Fulda)"
ask PBF_URL         "Geofabrik PBF URL covering your region" \
    "https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf"

# ── Optional UI links ──────────────────────────────────────────────────────────

printf "\n${BOLD}── Optional: UI links ──────────────────────────────────────────${RESET}\n"
ask_optional REGION_PLAYGROUND_WIKI_URL "Wiki page for 'Contribute data' modal"
ask_optional REGION_CHAT_URL           "Community chat URL shown in 'Contribute data' modal"

# ── Optional: map display ──────────────────────────────────────────────────────

printf "\n${BOLD}── Optional: map display ───────────────────────────────────────${RESET}\n"
ask MAP_ZOOM      "Initial map zoom level"           "12"
ask MAP_MIN_ZOOM  "Minimum zoom level"               "10"
ask POI_RADIUS_M  "Nearby POI search radius (metres)" "5000"

# ── Optional: infrastructure ──────────────────────────────────────────────────

printf "\n${BOLD}── Optional: infrastructure ────────────────────────────────────${RESET}\n"
ask APP_PORT          "Host port to expose the app on"          "8080"
ask OSM2PGSQL_THREADS "CPU threads for the OSM import"          "4"

# ── Generate password ──────────────────────────────────────────────────────────

POSTGRES_PASSWORD="$(openssl rand -hex 32)"
success "Generated secure database password."

# ── Download files ─────────────────────────────────────────────────────────────

BASE_URL="https://raw.githubusercontent.com/mfuhrmann/spielplatzkarte/main"

printf "\n"
info "Downloading compose.prod.yml..."
fetch "$BASE_URL/compose.prod.yml" "$DEPLOY_DIR/compose.yml"

info "Downloading db/init.sql..."
fetch "$BASE_URL/db/init.sql" "$DEPLOY_DIR/db/init.sql"

success "Files downloaded."

# ── Write .env ─────────────────────────────────────────────────────────────────

cat > "$DEPLOY_DIR/.env" <<EOF
# Generated by install.sh — $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── Required: region ──────────────────────────────────────────────────────────
OSM_RELATION_ID=${OSM_RELATION_ID}
PBF_URL=${PBF_URL}

# ── Optional: UI links ────────────────────────────────────────────────────────
REGION_PLAYGROUND_WIKI_URL=${REGION_PLAYGROUND_WIKI_URL}
REGION_CHAT_URL=${REGION_CHAT_URL}

# ── Optional: map display ─────────────────────────────────────────────────────
MAP_ZOOM=${MAP_ZOOM}
MAP_MIN_ZOOM=${MAP_MIN_ZOOM}
POI_RADIUS_M=${POI_RADIUS_M}

# ── Optional: infrastructure ──────────────────────────────────────────────────
APP_PORT=${APP_PORT}
OSM2PGSQL_THREADS=${OSM2PGSQL_THREADS}

# ── Database (auto-generated — do not edit) ───────────────────────────────────
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
EOF

success "Configuration written to $DEPLOY_DIR/.env"

# ── Pull images ────────────────────────────────────────────────────────────────

printf "\n"
if confirm "Pull Docker images now? (recommended, ~500 MB)"; then
    info "Pulling images..."
    docker compose -f "$DEPLOY_DIR/compose.yml" --env-file "$DEPLOY_DIR/.env" pull
    success "Images pulled."
fi

# ── Start stack ────────────────────────────────────────────────────────────────

printf "\n"
if confirm "Start the stack now?"; then
    info "Starting db, PostgREST, and app..."
    docker compose -f "$DEPLOY_DIR/compose.yml" --env-file "$DEPLOY_DIR/.env" up -d
    success "Stack started."

    # ── Run import ─────────────────────────────────────────────────────────────
    printf "\n"
    warn "The map will be empty until you import OSM data."
    if confirm "Run the OSM import now? (downloads the PBF and may take several minutes)"; then
        info "Starting importer..."
        docker compose -f "$DEPLOY_DIR/compose.yml" --env-file "$DEPLOY_DIR/.env" \
            run --rm importer
        success "Import complete."
    else
        printf "\nRun the import later with:\n"
        printf "  ${CYAN}docker compose -f %s/compose.yml run --rm importer${RESET}\n" "$DEPLOY_DIR"
    fi
fi

# ── Done ───────────────────────────────────────────────────────────────────────

printf "\n${GREEN}${BOLD}Done!${RESET}\n\n"
printf "  App:    ${CYAN}http://localhost:${APP_PORT}${RESET}\n"
printf "  Dir:    ${CYAN}%s${RESET}\n\n" "$(cd "$DEPLOY_DIR" && pwd)"
printf "Useful commands (run from ${CYAN}%s${RESET}):\n" "$(cd "$DEPLOY_DIR" && pwd)"
printf "  docker compose up -d                   # start the stack\n"
printf "  docker compose down                    # stop the stack\n"
printf "  docker compose run --rm importer       # re-import OSM data\n"
printf "  docker compose logs -f postgrest        # watch PostgREST logs\n"
