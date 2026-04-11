.PHONY: install dev build serve \
        up down import db-apply db-shell \
        docker-build help

# ── Frontend ──────────────────────────────────────────────────────────────────

install:       ## Install Node dependencies
	npm ci

dev:           ## Start Vite dev server (hot-reload at http://localhost:5173)
	npm start

build:         ## Production build → dist/
	npm run build

serve:         ## Preview the production build locally
	npm run serve

# ── Docker Compose stack ──────────────────────────────────────────────────────

up:            ## Start db + PostgREST + nginx (detached)
	docker compose up -d

down:          ## Stop and remove containers
	docker compose down

import:        ## Download PBF and import OSM data into PostGIS (run once or to refresh)
	docker compose run --rm importer

docker-build:  ## Rebuild and restart the nginx/app container after frontend changes
	docker compose up -d --build app

# ── Database ──────────────────────────────────────────────────────────────────

db-apply:      ## Apply importer/api.sql to the running database and reload PostgREST schema
	docker compose exec -T db psql -U osm -d osm < importer/api.sql
	docker compose exec db psql -U osm -d osm -c "NOTIFY pgrst, 'reload schema';"

db-shell:      ## Open a psql shell in the running database container
	docker compose exec db psql -U osm -d osm

# ── Help ──────────────────────────────────────────────────────────────────────

help:          ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
