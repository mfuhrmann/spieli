#!/usr/bin/env bash
# spieli installer
# Downloads the production compose file and db schema, then walks through
# configuration interactively.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/install.sh -o install.sh
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

choose_mode() {
    while true; do
        printf "\n${BOLD}── Deployment mode ─────────────────────────────────────────────${RESET}\n"
        printf "  ${BOLD}1)${RESET} data-node     — database + PostgREST only (no UI)\n"
        printf "  ${BOLD}2)${RESET} ui            — frontend only (connects to a remote data node)\n"
        printf "  ${BOLD}3)${RESET} data-node-ui  — full stack: database + PostgREST + UI\n\n"
        printf "${BOLD}Select deployment mode${RESET} [1-3]: "
        read -r choice
        case "$choice" in
            1) DEPLOY_MODE="data-node";    break ;;
            2) DEPLOY_MODE="ui";           break ;;
            3) DEPLOY_MODE="data-node-ui"; break ;;
            *) warn "Invalid choice — please enter 1, 2, or 3." ;;
        esac
    done
    success "Deployment mode: ${BOLD}${DEPLOY_MODE}${RESET}"
}

# ── Dependency check ───────────────────────────────────────────────────────────

for cmd in docker openssl; do
    command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' is required but not found in PATH."
done
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin is not available."
docker info >/dev/null 2>&1           || die "Docker daemon is not running."

# ── Header ─────────────────────────────────────────────────────────────────────

printf "\n"
printf "${BOLD}spieli — Production Installer${RESET}\n"
printf "Playground map powered by OpenStreetMap\n"
printf "https://github.com/mfuhrmann/spieli\n\n"

# ── Deployment directory ───────────────────────────────────────────────────────

ask DEPLOY_DIR "Deployment directory" "./spieli"
mkdir -p "$DEPLOY_DIR/db"

EXISTING_PASSWORD=""
DEPLOY_MODE=""
EXISTING_ENV=false
if [[ -f "$DEPLOY_DIR/.env" ]]; then
    EXISTING_ENV=true
    warn ".env already exists in $DEPLOY_DIR"
    EXISTING_PASSWORD="$(grep '^POSTGRES_PASSWORD=' "$DEPLOY_DIR/.env" 2>/dev/null | cut -d= -f2 || true)"
    DEPLOY_MODE="$(grep '^DEPLOY_MODE=' "$DEPLOY_DIR/.env" 2>/dev/null | cut -d= -f2 || true)"
    confirm "Overwrite it?" || die "Aborted."
fi

# ── Deployment mode selection ──────────────────────────────────────────────────

if [[ -n "$DEPLOY_MODE" ]]; then
    case "$DEPLOY_MODE" in
        data-node|ui|data-node-ui) ;;
        *) die "DEPLOY_MODE='$DEPLOY_MODE' in existing .env is not valid. Edit it to one of: data-node, ui, data-node-ui." ;;
    esac
    warn "Existing DEPLOY_MODE=${DEPLOY_MODE} detected — keeping it. (Re-run to change.)"
elif [[ "$EXISTING_ENV" == "true" ]]; then
    # Old .env without DEPLOY_MODE — assume full stack for backward compatibility
    DEPLOY_MODE="data-node-ui"
    warn "No DEPLOY_MODE in existing .env — defaulting to data-node-ui for backward compatibility."
else
    choose_mode
fi

# ── Region configuration (data-node and data-node-ui only) ────────────────────

if [[ "$DEPLOY_MODE" != "ui" ]]; then
    printf "\n${BOLD}── Region ──────────────────────────────────────────────────────${RESET}\n"
    printf "Find the OSM relation ID: https://nominatim.openstreetmap.org\n"
    printf "Find a PBF extract:       https://download.geofabrik.de\n\n"

    ask OSM_RELATION_ID "OSM relation ID of your region (e.g. 62700 = Landkreis Fulda)"
    ask PBF_URL         "Geofabrik PBF URL covering your region" \
        "https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf"
else
    OSM_RELATION_ID=""
    PBF_URL=""
fi

# ── Remote API URL (ui mode only) ─────────────────────────────────────────────

if [[ "$DEPLOY_MODE" == "ui" ]]; then
    printf "\n${BOLD}── Remote data node ────────────────────────────────────────────${RESET}\n"
    printf "Enter the base URL of the PostgREST API on your data node.\n\n"

    while true; do
        printf "${BOLD}Remote API base URL${RESET} (e.g. https://data.example.com/api): "
        read -r API_BASE_URL
        [[ -n "$API_BASE_URL" ]] && break
        warn "Remote API base URL is required for UI mode."
    done
else
    API_BASE_URL="/api"
fi

# ── Optional UI links (ui and data-node-ui only) ───────────────────────────────

if [[ "$DEPLOY_MODE" != "data-node" ]]; then
    printf "\n${BOLD}── Optional: UI links ──────────────────────────────────────────${RESET}\n"
    ask_optional REGION_PLAYGROUND_WIKI_URL "Wiki page for 'Contribute data' modal"
    ask_optional REGION_CHAT_URL           "Community chat URL shown in 'Contribute data' modal"
else
    REGION_PLAYGROUND_WIKI_URL=""
    REGION_CHAT_URL=""
fi

# ── Optional: map display (ui and data-node-ui only) ──────────────────────────

if [[ "$DEPLOY_MODE" != "data-node" ]]; then
    printf "\n${BOLD}── Optional: map display ───────────────────────────────────────${RESET}\n"
    ask MAP_ZOOM      "Initial map zoom level"           "12"
    ask MAP_MIN_ZOOM  "Minimum zoom level"               "10"
    ask POI_RADIUS_M  "Nearby POI search radius (metres)" "5000"
else
    MAP_ZOOM="12"
    MAP_MIN_ZOOM="10"
    POI_RADIUS_M="5000"
fi

# ── Optional: infrastructure ──────────────────────────────────────────────────

APP_PORT=""
OSM2PGSQL_THREADS=""

printf "\n${BOLD}── Optional: infrastructure ────────────────────────────────────${RESET}\n"

if [[ "$DEPLOY_MODE" != "data-node" ]]; then
    ask APP_PORT "Host port to expose the app on" "8080"
fi

if [[ "$DEPLOY_MODE" != "ui" ]]; then
    ask OSM2PGSQL_THREADS "CPU threads for the OSM import" "4"
fi

# ── Generate password (data-node and data-node-ui only) ───────────────────────

if [[ "$DEPLOY_MODE" != "ui" ]]; then
    if [[ -n "$EXISTING_PASSWORD" ]]; then
        POSTGRES_PASSWORD="$EXISTING_PASSWORD"
        success "Reusing existing database password (database volume already initialised)."
    else
        POSTGRES_PASSWORD="$(openssl rand -hex 32)"
        success "Generated secure database password."
    fi
else
    POSTGRES_PASSWORD=""
fi

# ── Download files ─────────────────────────────────────────────────────────────

BASE_URL="https://raw.githubusercontent.com/mfuhrmann/spieli/main"

printf "\n"
info "Downloading compose.prod.yml..."
fetch "$BASE_URL/compose.prod.yml" "$DEPLOY_DIR/compose.yml"

if [[ "$DEPLOY_MODE" != "ui" ]]; then
    info "Downloading db/init.sql..."
    fetch "$BASE_URL/db/init.sql" "$DEPLOY_DIR/db/init.sql"
fi

success "Files downloaded."

# ── Write .env ─────────────────────────────────────────────────────────────────

{
    printf "# Generated by install.sh — %s\n\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf "# ── Deployment mode ─────────────────────────────────────────────\n"
    printf "DEPLOY_MODE=%s\n\n" "$DEPLOY_MODE"

    if [[ "$DEPLOY_MODE" != "ui" ]]; then
        printf "# ── Required: region ────────────────────────────────────────────\n"
        printf "OSM_RELATION_ID=%s\n" "$OSM_RELATION_ID"
        printf "PBF_URL=%s\n\n" "$PBF_URL"
    fi

    if [[ "$DEPLOY_MODE" != "data-node" ]]; then
        printf "# ── API base URL ─────────────────────────────────────────────────\n"
        printf "API_BASE_URL=%s\n\n" "$API_BASE_URL"
    fi

    if [[ "$DEPLOY_MODE" != "data-node" ]]; then
        printf "# ── Optional: UI links ──────────────────────────────────────────\n"
        printf "REGION_PLAYGROUND_WIKI_URL=%s\n" "$REGION_PLAYGROUND_WIKI_URL"
        printf "REGION_CHAT_URL=%s\n\n" "$REGION_CHAT_URL"

        printf "# ── Optional: map display ───────────────────────────────────────\n"
        printf "MAP_ZOOM=%s\n" "$MAP_ZOOM"
        printf "MAP_MIN_ZOOM=%s\n" "$MAP_MIN_ZOOM"
        printf "POI_RADIUS_M=%s\n\n" "$POI_RADIUS_M"
    fi

    printf "# ── Optional: Hub integration ───────────────────────────────────\n"
    printf "# Set to the Hub's full origin (e.g. https://hub.example.com) when embedding\n"
    printf "# this instance in a spieli Hub. Leave empty for standalone deployments.\n"
    printf "# PARENT_ORIGIN=\n\n"

    if [[ "$DEPLOY_MODE" != "data-node" ]]; then
        printf "# ── Optional: infrastructure ────────────────────────────────────\n"
        printf "APP_PORT=%s\n" "$APP_PORT"
    fi

    if [[ "$DEPLOY_MODE" != "ui" ]]; then
        printf "OSM2PGSQL_THREADS=%s\n\n" "$OSM2PGSQL_THREADS"

        printf "# ── Database (auto-generated — do not edit) ─────────────────────\n"
        printf "POSTGRES_PASSWORD=%s\n" "$POSTGRES_PASSWORD"
    fi
} > "$DEPLOY_DIR/.env"

success "Configuration written to $DEPLOY_DIR/.env"

# ── Pull images ────────────────────────────────────────────────────────────────

printf "\n"
if confirm "Pull Docker images now? (recommended, ~500 MB)"; then
    info "Pulling images..."
    docker compose -f "$DEPLOY_DIR/compose.yml" --env-file "$DEPLOY_DIR/.env" \
        --profile "$DEPLOY_MODE" pull
    success "Images pulled."
fi

# ── Start stack ────────────────────────────────────────────────────────────────

printf "\n"
if confirm "Start the stack now?"; then
    if [[ "$DEPLOY_MODE" != "ui" ]]; then
        # ── Check for stale pgdata volume ──────────────────────────────────────
        PROJECT_NAME="$(basename "$(cd "$DEPLOY_DIR" && pwd)")"
        VOLUME_NAME="${PROJECT_NAME}_pgdata"
        if docker volume ls --format '{{.Name}}' | grep -q "^${VOLUME_NAME}$"; then
            warn "A database volume '${VOLUME_NAME}' already exists."
            warn "This often means a previous install or a dev stack with the same"
            warn "directory name already initialised the database with a different password."
            warn "Starting without removing it will cause authentication failures."
            printf "\n"
            if confirm "Delete the existing volume and start fresh? (existing data will be lost)"; then
                docker volume rm "$VOLUME_NAME" >/dev/null
                success "Volume removed. Database will be initialised with the new password."
            else
                warn "Proceeding without removing the volume — authentication may fail."
            fi
            printf "\n"
        fi
    fi

    case "$DEPLOY_MODE" in
        data-node)    info "Starting db and PostgREST..." ;;
        ui)           info "Starting app..." ;;
        data-node-ui) info "Starting db, PostgREST, and app..." ;;
    esac

    docker compose -f "$DEPLOY_DIR/compose.yml" --env-file "$DEPLOY_DIR/.env" \
        --profile "$DEPLOY_MODE" up -d
    success "Stack started."

    # ── Run import (data-node and data-node-ui only) ───────────────────────────
    if [[ "$DEPLOY_MODE" != "ui" ]]; then
        printf "\n"
        warn "The map will be empty until you import OSM data."
        if confirm "Run the OSM import now? (downloads the PBF and may take several minutes)"; then
            info "Starting importer..."
            docker compose -f "$DEPLOY_DIR/compose.yml" --env-file "$DEPLOY_DIR/.env" \
                --profile "$DEPLOY_MODE" run --rm importer
            success "Import complete."
        else
            printf "\nRun the import later with:\n"
            printf "  ${CYAN}docker compose -f %s/compose.yml --profile %s run --rm importer${RESET}\n" \
                "$DEPLOY_DIR" "$DEPLOY_MODE"
        fi
    fi
fi

# ── Done ───────────────────────────────────────────────────────────────────────

printf "\n${GREEN}${BOLD}Done!${RESET}\n\n"

if [[ "$DEPLOY_MODE" != "data-node" ]]; then
    printf "  App:    ${CYAN}http://localhost:${APP_PORT}${RESET}\n"
fi
printf "  Dir:    ${CYAN}%s${RESET}\n\n" "$(cd "$DEPLOY_DIR" && pwd)"

printf "Useful commands (run from ${CYAN}%s${RESET}):\n" "$(cd "$DEPLOY_DIR" && pwd)"
printf "  docker compose --profile %s up -d        # start the stack\n" "$DEPLOY_MODE"
printf "  docker compose --profile %s down         # stop the stack\n" "$DEPLOY_MODE"

if [[ "$DEPLOY_MODE" != "ui" ]]; then
    printf "  docker compose --profile %s run --rm importer  # re-import OSM data\n" "$DEPLOY_MODE"
fi

if [[ "$DEPLOY_MODE" != "data-node" ]]; then
    printf "  docker compose logs -f app              # watch app logs\n"
fi

if [[ "$DEPLOY_MODE" != "ui" ]]; then
    printf "  docker compose logs -f postgrest        # watch PostgREST logs\n"
fi
