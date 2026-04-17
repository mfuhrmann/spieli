.PHONY: install dev build serve test \
        up down import docker-build db-apply db-shell \
        require-npm require-docker installer lan-url help

# Bail with a clear message when a required tool is missing.
define require
@command -v $(1) >/dev/null 2>&1 || \
  { printf '\033[31merror:\033[0m %s is required but not found in PATH\n' '$(1)' >&2; exit 1; }
endef

require-npm:
	$(call require,node)
	$(call require,npm)

require-docker:
	$(call require,docker)
	@docker compose version >/dev/null 2>&1 || \
	  { printf '\033[31merror:\033[0m docker compose plugin is not available\n' >&2; exit 1; }
	@docker info >/dev/null 2>&1 || \
	  { printf '\033[31merror:\033[0m docker daemon is not running\n' >&2; exit 1; }

## ── Frontend (Svelte app in app/) ─────────────────────────────────────────────

install: require-npm      ## Install Node dependencies (Svelte app + E2E test runner)
	npm ci
	npm --prefix app ci

dev: require-npm          ## Start Vite dev server (localhost:5173, hot-reload)
	npm run dev --prefix app

build: require-npm        ## Production build → app/dist/
	npm run build --prefix app

serve: require-npm        ## Preview production build locally
	npm run serve --prefix app

test: require-npm         ## Run Playwright E2E tests
	npm test

## ── Docker Compose stack ──────────────────────────────────────────────────────

up: require-docker        ## Start db + PostgREST + nginx (detached)
	docker compose up -d

down: require-docker      ## Stop and remove containers
	docker compose down

import: require-docker    ## Download PBF and import OSM data into PostGIS (run once or to refresh)
	docker compose run --rm importer

docker-build: require-docker  ## Rebuild and restart the Svelte app container (Dockerfile.app)
	docker compose up -d --build app

## ── Database ──────────────────────────────────────────────────────────────────

db-apply: require-docker  ## Apply importer/api.sql to the running database and reload PostgREST schema
	set -a && . ./.env && set +a && envsubst '$$OSM_RELATION_ID' < importer/api.sql | docker compose exec -T db psql -U osm -d osm --single-transaction
	docker compose exec db psql -U osm -d osm -c "NOTIFY pgrst, 'reload schema';"

db-shell: require-docker  ## Open a psql shell in the running database container
	docker compose exec db psql -U osm -d osm

## ── Production install ────────────────────────────────────────────────────────

installer: require-docker ## Run the interactive production installer (no git clone required)
	bash install.sh

## ── Local / mobile testing ────────────────────────────────────────────────────

lan-url:                  ## Print the LAN URLs to open the app on a phone (same WiFi)
	@LAN_IP=$$(hostname -I 2>/dev/null | awk '{print $$1}'); \
	  [ -z "$$LAN_IP" ] && LAN_IP=$$(ip route get 1 2>/dev/null | awk '{print $$7; exit}'); \
	  APP_PORT=$${APP_PORT:-8080} && \
	  if [ -z "$$LAN_IP" ]; then \
	    printf '\n  \033[33mCould not detect LAN IP.\033[0m Run: ip route get 1 | awk '"'"'{print $$7; exit}'"'"'\n\n'; \
	  else \
	    printf '\n  \033[36mLAN IP:\033[0m            %s\n' "$$LAN_IP" && \
	    printf '  \033[36mVite dev server:\033[0m   http://%s:5173\n' "$$LAN_IP" && \
	    printf '  \033[36mDocker stack:\033[0m      http://%s:%s\n\n' "$$LAN_IP" "$$APP_PORT"; \
	  fi

## ── Help ──────────────────────────────────────────────────────────────────────

help:                     ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'
