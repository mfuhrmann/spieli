# Adding a Data-node to an Existing Hub

This page is for operators who already have a running **hub + data-node-ui** setup on one host and want to add more regional backends without touching the existing stack.

If you are setting up from scratch, see [Federated Deployment](federated-deployment.md) instead.

## How it works

The hub is client-side: browsers fetch playground data directly from each data-node URL listed in `registry.json`. Every data-node must therefore be reachable over **public HTTPS** — a backend accessible only on `localhost` cannot be reached by a user's browser.

## Prerequisites

- Existing hub + at least one data-node-ui running on the host.
- A reverse proxy (Traefik or nginx) that can front additional backends on new ports or subdomains.
- A public domain / subdomain for the new backend (e.g. `berlin.example.com`).
- OSM relation ID and Geofabrik PBF URL for the new region — see [Manual Deploy § Step 1](manual-deploy.md#step-1-find-your-regions-osm-relation-id).

## Step 1 — Create the backend directory

Each backend is an independent Compose project in its own directory.

```bash
mkdir ~/spieli-berlin
cd ~/spieli-berlin
cp ~/spieli/compose.yml .   # copy from your existing deploy dir
cp -r ~/spieli/db .          # copy db/init.sql — required for DB initialisation
```

!!! note "Why copy db/init.sql?"
    The PostgreSQL image runs every file in `/docker-entrypoint-initdb.d/` on first start.
    `compose.yml` bind-mounts `./db/init.sql` into that directory. Without the file, Docker
    creates a directory at the mount target instead of a file, the init script silently fails,
    and PostgREST cannot connect.

## Step 2 — Write `.env`

```env
COMPOSE_PROJECT_NAME=spieli-berlin   # unique per backend — avoids Docker name collisions
DEPLOY_MODE=data-node-ui
APP_PORT=8082                         # unique port — increment for each new backend
OSM_RELATION_ID=62422
PBF_URL=https://download.geofabrik.de/europe/germany/berlin-latest.osm.pbf
POSTGRES_PASSWORD=<strong-random-password>
REIMPORT_INTERVAL_MIN_DAYS=1
REIMPORT_INTERVAL_MAX_DAYS=1
```

Generate a strong password: `openssl rand -base64 24`

!!! warning "Special characters in POSTGRES_PASSWORD"
    `compose.yml` uses the password in a PostgreSQL URI
    (`postgres://osm:${POSTGRES_PASSWORD}@db:5432/osm`).
    URI-special characters (`/`, `+`, `=`, `@`, `#`) break the URI parser, causing PostgREST
    to fail with `could not look up local user ID`. Fix: change `PGRST_DB_URI` in `compose.yml`
    to the key-value format (see Step 3).

## Step 3 — Patch `compose.yml`

Two changes are needed before the first start. Edit `~/spieli-berlin/compose.yml`:

### 3a — Fix PGRST_DB_URI (key-value format)

Find the `postgrest` service and replace the URI-format connection string:

```yaml
# Before (URI format — breaks with special-char passwords):
PGRST_DB_URI: postgres://osm:${POSTGRES_PASSWORD}@db:5432/osm

# After (key-value format — safe for any password):
PGRST_DB_URI: "host=db port=5432 dbname=osm user=osm password=${POSTGRES_PASSWORD}"
```

### 3b — Add POSTGRES_HOST_AUTH_METHOD to the db service

Without this, PostgreSQL only allows loopback connections and PostgREST (in a separate container) cannot connect.

```yaml
  db:
    environment:
      POSTGRES_DB:                osm
      POSTGRES_USER:              osm
      POSTGRES_PASSWORD:          ${POSTGRES_PASSWORD:-change-me}
      POSTGRES_HOST_AUTH_METHOD:  scram-sha-256   # ← add this line
```

## Step 4 — Start the stack

```bash
cd ~/spieli-berlin
docker compose --profile data-node-ui up -d
```

!!! warning "Do not add --profile auto-update"
    Your existing Watchtower instance (in the first backend's stack) already watches **all**
    containers on the Docker host. Adding a second Watchtower via `--profile auto-update`
    causes both instances to fight over the same containers, killing each other on startup.

Wait for the DB to become healthy before running the importer:

```bash
docker ps | grep spieli-berlin-db
# wait for (healthy) to appear
```

## Step 5 — Import OSM data

```bash
docker compose --profile data-node-ui run --rm importer
```

Berlin (~93 MB PBF) takes a few minutes. Watch progress:

```bash
docker logs -f spieli-berlin-importer-1
```

The import is complete when you see `[importer] Import completed successfully.`

### Forcing a re-import (corrupt cache)

If `get_meta` returns `playground_count: 0` after the import, the bbox/tags cache in `pbf_cache`
may be corrupt (this can happen when the importer ran against a broken DB and cached empty
osmium output). Fix:

```bash
# Replace berlin-latest with your region's PBF basename
docker run --rm -v spieli-berlin_pbf_cache:/cache alpine \
  sh -c "rm -f /cache/*_${OSM_RELATION_ID}.pbf /cache/*_${OSM_RELATION_ID}_tags.pbf"

docker exec -u postgres spieli-berlin-db-1 psql -U osm osm \
  -c "DELETE FROM api.import_status WHERE id = 1;"

docker restart spieli-berlin-importer-1
docker logs -f spieli-berlin-importer-1
```

## Step 6 — Expose via reverse proxy

The browser must reach the backend at a stable public HTTPS URL. If you use Traefik with the file provider (as set up by `install-traefik.sh`), drop a new file in the `dynamic/` directory — Traefik picks it up immediately without a restart.

### Subdomain approach (recommended)

**`~/spieli-traefik/dynamic/berlin.yml`:**

```yaml
http:
  routers:
    berlin:
      rule: "Host(`berlin.example.com`)"
      entryPoints:
        - websecure
      tls:
        certResolver: le
      service: berlin
      middlewares:
        - security-headers

  services:
    berlin:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:8082"
```

`security-headers` is defined in your existing `app.yml` and is shared across all files in the same `dynamic/` directory.

### Path-prefix approach (same domain)

Use this when you cannot add a new DNS subdomain.

**`~/spieli-traefik/dynamic/berlin.yml`:**

```yaml
http:
  routers:
    berlin-api:
      rule: "Host(`your-domain.example.com`) && PathPrefix(`/berlin/api/`)"
      entryPoints:
        - websecure
      tls:
        certResolver: le
      service: berlin
      middlewares:
        - strip-berlin
        - security-headers

  middlewares:
    strip-berlin:
      stripPrefix:
        prefixes:
          - "/berlin"

  services:
    berlin:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:8082"
```

With the path-prefix approach the registry URL must include the prefix:
`"url": "https://your-domain.example.com/berlin/api"`.

### Verify

```bash
curl -i -H "Origin: https://your-hub-domain.example.com" \
  https://berlin.example.com/api/rpc/get_meta
# expect: 200 OK, Access-Control-Allow-Origin: *
```

## Step 7 — Update `registry.json` and restart hub

Edit `~/spieli/registry.json` (or wherever your hub's `registry.json` lives):

```json
{
  "instances": [
    { "slug": "hessen", "url": "https://your-domain.example.com/api", "name": "Hessen" },
    { "slug": "berlin", "url": "https://berlin.example.com/api",      "name": "Berlin" }
  ]
}
```

The file is bind-mounted — editing it takes effect on the next hub poll. Restart the app
container to pick it up immediately:

```bash
cd ~/spieli
docker compose --profile ui restart app
```

## Verify end-to-end

Open the hub in a browser. The instance pill should show the new region. If a backend appears
red ("unreachable"), open DevTools → Network and check the `get_meta` request — the URL in the
request must match the backend's actual public path.

## Port layout reference

| Stack | `APP_PORT` | `COMPOSE_PROJECT_NAME` |
|---|---|---|
| Hub | 8080 | `spieli` (or `spieli-hub`) |
| First data-node (e.g. Hessen) | 8080 | `spieli` |
| Second data-node (e.g. Berlin) | 8082 | `spieli-berlin` |
| Third data-node | 8083 | `spieli-<region>` |

Keep ports consecutive and project names unique.

## See also

- [Federated Deployment](federated-deployment.md) — full from-scratch walkthrough
- [`registry.json` reference](../reference/registry-json.md) — schema and slug rules
- [Troubleshooting](troubleshooting.md)
