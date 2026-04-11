.PHONY: install dev build serve \
        up down import db-apply db-shell \
        docker-build check-node check-docker help

# ── Dependency checks ─────────────────────────────────────────────────────────

check-node:
	@command -v node >/dev/null 2>&1 || { echo "Error: node is not installed (https://nodejs.org/)"; exit 1; }
	@command -v npm  >/dev/null 2>&1 || { echo "Error: npm is not installed"; exit 1; }

check-docker:
	@command -v docker >/dev/null 2>&1 || { echo "Error: docker is not installed (https://docs.docker.com/get-docker/)"; exit 1; }
	@docker compose version >/dev/null 2>&1 || { echo "Error: docker compose plugin is not available"; exit 1; }
	@docker info >/dev/null 2>&1         || { echo "Error: docker daemon is not running"; exit 1; }

# ── Frontend ──────────────────────────────────────────────────────────────────

install: check-node    ## Install Node dependencies
	npm ci

dev: check-node        ## Start Vite dev server (hot-reload at http://localhost:5173)
	npm start

build: check-node      ## Production build → dist/
	npm run build

serve: check-node      ## Preview the production build locally
	npm run serve

# ── Docker Compose stack ──────────────────────────────────────────────────────

up: check-docker           ## Start db + PostgREST + nginx (detached)
	docker compose up -d

down: check-docker         ## Stop and remove containers
	docker compose down

import: check-docker       ## Download PBF and import OSM data into PostGIS (run once or to refresh)
	docker compose run --rm importer

docker-build: check-docker ## Rebuild and restart the nginx/app container after frontend changes
	docker compose up -d --build app

# ── Database ──────────────────────────────────────────────────────────────────

db-apply: check-docker     ## Apply importer/api.sql to the running database and reload PostgREST schema
	docker compose exec -T db psql -U osm -d osm < importer/api.sql
	docker compose exec db psql -U osm -d osm -c "NOTIFY pgrst, 'reload schema';"

db-shell: check-docker     ## Open a psql shell in the running database container
	docker compose exec db psql -U osm -d osm

# ── Help ──────────────────────────────────────────────────────────────────────

help:          ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
