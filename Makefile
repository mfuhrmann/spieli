.PHONY: install dev build serve test \
        app-install app-dev app-build app-serve app-test \
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

## ── Frontend (legacy — root-level Vite app) ───────────────────────────────────

install: require-npm      ## Install Node dependencies (legacy app)
	npm ci

dev: require-npm          ## Start Vite dev server for legacy app (localhost:5173)
	npm start

build: require-npm        ## Production build for legacy app → dist/
	npm run build

serve: require-npm        ## Preview legacy production build locally
	npm run serve

test: require-npm         ## Run Playwright tests against legacy production build
	npm test

## ── Frontend (new Svelte app in app/) ─────────────────────────────────────────

app-install: require-npm  ## Install Node dependencies for the new Svelte app
	npm ci --prefix app

app-dev: require-npm      ## Start Vite dev server for new Svelte app (localhost:5173)
	npm run dev --prefix app

app-build: require-npm    ## Production build for new Svelte app → app/dist/
	npm run build --prefix app

app-serve: require-npm    ## Preview new Svelte production build locally
	npm run serve --prefix app

app-test: require-npm     ## Run Playwright tests for new Svelte app
	npm test --prefix app

## ── Docker Compose stack ──────────────────────────────────────────────────────

up: require-docker        ## Start db + PostgREST + nginx (detached)
	docker compose up -d

down: require-docker      ## Stop and remove containers
	docker compose down

import: require-docker    ## Download PBF and import OSM data into PostGIS (run once or to refresh)
	docker compose run --rm importer

docker-build: require-docker  ## Rebuild and restart the nginx/app container after frontend changes
	docker compose up -d --build app

## ── Database ──────────────────────────────────────────────────────────────────

db-apply: require-docker  ## Apply importer/api.sql to the running database and reload PostgREST schema
	set -a && . ./.env && set +a && envsubst '$$OSM_RELATION_ID' < importer/api.sql | docker compose exec -T db psql -U osm -d osm
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
