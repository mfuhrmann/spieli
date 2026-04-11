.PHONY: install dev build serve \
        up down import docker-build db-apply db-shell \
        require-npm require-docker installer help

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

## ── Frontend ──────────────────────────────────────────────────────────────────

install: require-npm      ## Install Node dependencies
	npm ci

dev: require-npm          ## Start Vite dev server at http://localhost:5173
	npm start

build: require-npm        ## Production build → dist/
	npm run build

serve: require-npm        ## Preview production build locally
	npm run serve

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
	docker compose exec -T db psql -U osm -d osm < importer/api.sql
	docker compose exec db psql -U osm -d osm -c "NOTIFY pgrst, 'reload schema';"

db-shell: require-docker  ## Open a psql shell in the running database container
	docker compose exec db psql -U osm -d osm

## ── Production install ────────────────────────────────────────────────────────

installer: require-docker ## Run the interactive production installer (no git clone required)
	bash install.sh

## ── Help ──────────────────────────────────────────────────────────────────────

help:                     ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'
