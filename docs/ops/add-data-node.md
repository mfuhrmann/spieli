# Adding a Data-node to an Existing Hub

This page is for operators who already have a running **hub + data-node-ui** setup on one host and want to add more regional backends without touching the existing stack.

If you are setting up from scratch, see [Federated Deployment](federated-deployment.md) instead.

## How it works

The hub is client-side: browsers fetch playground data directly from each data-node URL listed in `registry.json`. Every data-node must therefore be reachable over **public HTTPS** — a backend accessible only on `localhost` cannot be reached by a user's browser.

## Prerequisites

- Existing hub + at least one data-node-ui running on the host.
- A reverse proxy (Traefik or nginx) that can front additional backends on new ports or subdomains.
- A public domain / subdomain for the new backend (e.g. `berlin.example.com`).
- OSM relation ID and Geofabrik PBF URL for the new region — see [Quick Start → Finding your region](../getting-started/quick-start.md#finding-your-region).

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

# Legal / Impressum (required under German law for public instances)
IMPRESSUM_NAME=Max Mustermann
IMPRESSUM_ADDRESS=Musterstraße 1, 12345 Berlin
IMPRESSUM_EMAIL=kontakt@example.com
```

Generate a strong password the way the installer does: `openssl rand -hex 32`. A hex password contains no characters that need escaping (see below).

!!! warning "Legal requirement (Germany)"
    Public instances in Germany require an Impressum. Set at minimum `IMPRESSUM_NAME`,
    `IMPRESSUM_ADDRESS`, and `IMPRESSUM_EMAIL`. The importer writes the generated HTML to
    `api.legal_content` and `get_meta()` exposes `impressum_url` / `privacy_url` so the Hub
    can surface legal links. Omitting these leaves the backend with `has_legal: false` in
    `get_meta()`.

    The legal text is written at the end of a **full** import only; an `API_ONLY` run does not
    rewrite it. After changing these values, run a one-shot import as in
    [Refresh Data → Daemon mode](refresh-data.md#daemon-mode).

!!! note "Passwords with special characters"
    `compose.yml` puts the password into a PostgreSQL URI
    (`postgres://osm:${POSTGRES_PASSWORD}@db:5432/osm`). Characters with a meaning in URIs
    (`/`, `+`, `=`, `@`, `#`), which `openssl rand -base64` produces, break it, and PostgREST
    fails with `could not look up local user ID`. A hex password avoids this. If you must keep
    such a password, change `PGRST_DB_URI` in the `postgrest` service to the key-value form:

    ```yaml
    PGRST_DB_URI: "host=db port=5432 dbname=osm user=osm password=${POSTGRES_PASSWORD}"
    ```

## Step 3 — Start the stack

```bash
cd ~/spieli-berlin
docker compose --profile data-node-ui up -d
```

!!! warning "Do not add --profile auto-update"
    The Watchtower instance already running on this host (in the hub's stack) watches **all**
    containers on the Docker host. Adding a second Watchtower via `--profile auto-update`
    causes both instances to fight over the same containers, killing each other on startup.

## Step 4 — Import OSM data

The importer started automatically in Step 3 (daemon mode). Watch progress:

```bash
docker logs -f spieli-berlin-importer-1
```

Berlin (~93 MB PBF) takes a few minutes. The import is complete when you see `[importer] Import completed successfully.` The importer then sleeps until the next scheduled run.

### Verify playground count

```bash
curl -s https://berlin.example.com/api/rpc/get_meta | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['playground_count'], d['relation_id'])"
```

`playground_count` must be greater than zero. If it is `0`, or `name` is missing or names the wrong region, see [Troubleshooting → Map loads but shows no playgrounds](troubleshooting.md#map-loads-but-shows-no-playgrounds) (corrupt cache, wrong relation ID).

## Step 5 — Expose via reverse proxy

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

## Step 6 — Update `registry.json` and restart hub

Edit `~/spieli/registry.json` (or wherever your hub's `registry.json` lives):

```json
{
  "instances": [
    { "slug": "hessen", "url": "https://your-domain.example.com/api", "name": "Hessen" },
    { "slug": "berlin", "url": "https://berlin.example.com/api",      "name": "Berlin" }
  ]
}
```

The file is bind-mounted, so browsers see the new entry on their next page load. Restart the
app container anyway: the Content Security Policy's `connect-src` is generated from this file
at startup, and a new backend is missing from it until then.

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
| Hub with its local data-node (e.g. Hessen) | 8080 | `spieli` |
| Second data-node (e.g. Berlin) | 8082 | `spieli-berlin` |
| Third data-node | 8083 | `spieli-<region>` |

Keep ports consecutive and project names unique.

## See also

- [Federated Deployment](federated-deployment.md) — full from-scratch walkthrough
- [`registry.json` reference](../reference/registry-json.md) — schema and slug rules
- [Troubleshooting](troubleshooting.md)
