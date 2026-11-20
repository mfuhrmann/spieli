# Federated Deployment (Hub + data-nodes)

A **federated** deployment consists of one **Hub UI** (no local database) aggregating two or more regional **data-nodes** into a single map. Users browse at the Hub's URL; their browser talks directly to each data-node's PostgREST `/api/`, merging the results client-side.

This walkthrough stands up the topology end-to-end. For a single-region deployment, see the [Quick Start](../getting-started/quick-start.md) instead.

## Topology

```
                ┌──────────────────────────────────────────────┐
                │                                              │
                │    Hub UI (DEPLOY_MODE=ui, APP_MODE=hub)     │
  Browser ────► │    • serves the app bundle                   │
                │    • serves registry.json                    │
                │    • NO database, NO /api                    │
                │                                              │
                └──────────┬─────────────────┬─────────────────┘
                           │                 │
                           │ CORS            │ CORS
                           ▼                 ▼
      ┌───────────────────────────┐ ┌───────────────────────────┐
      │ Data-node A               │ │ Data-node B               │
      │ DEPLOY_MODE=data-node-ui  │ │ DEPLOY_MODE=data-node-ui  │
      │ • PostGIS + PostgREST     │ │ • PostGIS + PostgREST     │
      │ • nginx serves /api/+CORS │ │ • nginx serves /api/+CORS │
      └───────────────────────────┘ └───────────────────────────┘
```

Each data-node runs the full `data-node-ui` profile so the shipped nginx config serves `/api/` with the CORS headers the Hub's browser clients need. The Hub is the same frontend image flipped to `APP_MODE=hub` with a `registry.json` listing the data-node API URLs, and no database of its own.

!!! note "Pure `DEPLOY_MODE=data-node` (advanced)"
    The `data-node` profile (invoked with `--profile data-node`) ships db + PostgREST only — no HTTP server, no port publish, no CORS handling. You can use it if you run your own reverse proxy in front of the PostgREST container and add the right `Access-Control-Allow-*` headers to `/api/` responses. For the happy path, prefer `data-node-ui` — it's what this walkthrough assumes. In `data-node-ui` mode only `/api/` needs to be reachable from the Hub's origin; front the `APP_PORT` with a reverse proxy that blocks paths other than `/api/` if you don't want the secondary standalone UI publicly reachable.

## Prerequisites

- One host (or cluster) per node — the Hub and each data-node can run on the same machine or on separate ones. Each must reach the others over HTTP/HTTPS.
- Docker with the Compose plugin on every host.
- One OSM relation ID and one Geofabrik PBF URL per data-node ([how to find them](../getting-started/quick-start.md#finding-your-region)).
- HTTPS-terminating reverse proxy in front of each data-node in production — the browser must be able to fetch the data-node's `/api/` over HTTPS when the Hub itself is served over HTTPS.
- When co-locating nodes on one host, give each its own `APP_PORT` (e.g. `8080`, `8081`, `8082`) and its own `COMPOSE_PROJECT_NAME` (e.g. `spieli-fulda`, `spieli-neuhof`, `spieli-hub`) so port bindings and Docker resource names don't collide.
- **Data-node version**: each data-node must run a release that ships the tiered playground API (`get_playground_clusters`, `get_playgrounds_bbox`, `get_playground`) and the completeness fields on `get_meta` (`complete`, `partial`, `missing`). These landed in the same release that introduced this walkthrough; an older data-node still joins successfully but degrades to a legacy fallback path — see the [federation reference's Federation endpoints table](../reference/federation.md#federation-endpoints) for the degradation matrix. If you can, upgrade every data-node before pointing a current Hub at it.

## Step 1 — Stand up each data-node

Repeat on every data-node host. For this walkthrough the two backends are "Fulda" and "Neuhof".

### Data-node `.env`

Replace `<strong-random-password>` with an actual generated secret (`openssl rand -base64 24` is fine) — the angle brackets are a placeholder, not a literal value.

```env
DEPLOY_MODE=data-node-ui
OSM_RELATION_ID=454863
PBF_URL=https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf
POSTGRES_PASSWORD=<strong-random-password>
```

No `APP_MODE`, no `REGISTRY_URL` — the frontend on a data-node runs in its default standalone mode purely so nginx can serve `/api/` with CORS. `API_BASE_URL` stays at its default `/api`.

### Start the backend and import

```bash
docker compose --profile data-node-ui up -d
docker compose --profile data-node-ui run --rm importer
```

The first command starts `db`, `postgrest`, and the `app` container (which hosts nginx in front of PostgREST). The second runs the importer once — see [Scheduled Import → How long does an import take?](scheduled-import.md#how-long-does-an-import-take) for timings, and [Import Pipeline](../contributing/import-pipeline.md) for what it does.

### Expose `/api/` to the Hub

Because the Hub's browser clients hit `/api/` cross-origin, each data-node must be reachable at a stable URL (e.g. `https://fulda.example.com/api`) and respond with CORS headers. The shipped nginx config in `data-node-ui` mode adds `Access-Control-Allow-Origin: *` and the right methods on `/api/` automatically — no extra configuration needed. In production, front `APP_PORT` with an HTTPS-terminating reverse proxy.

Verify from a machine that is **not** the data-node itself:

```bash
curl -i https://fulda.example.com/api/rpc/get_meta
# expect 200 OK, JSON body with { relation_id, name, playground_count, bbox }
# response should also include: Access-Control-Allow-Origin: *
```

## Step 2 — Prepare `registry.json`

The Hub discovers its data-nodes by fetching a `registry.json` from its own origin. Create the file you'll deploy with the Hub:

```json
{
  "instances": [
    {
      "slug": "fulda",
      "url":  "https://fulda.example.com/api",
      "name": "Fulda"
    },
    {
      "slug": "neuhof",
      "url":  "https://neuhof.example.com/api",
      "name": "Neuhof"
    }
  ]
}
```

Every entry needs a `url`; set a `name` (otherwise the URL is shown) and a `slug` for stable deep links. Field rules, slug validation and the fields the hub fills in itself: [`registry.json` reference](../reference/registry-json.md).

The file is served from the **Hub's own origin** under `/registry.json` (the default value of `REGISTRY_URL`). It is *not* fetched from one of the data-nodes. CORS is not needed for the registry file itself, only for the data-node APIs it points at (handled in Step 1).

## Step 3 — Stand up the Hub

### Hub `.env`

```env
DEPLOY_MODE=ui
APP_MODE=hub
REGISTRY_URL=/registry.json
HUB_POLL_INTERVAL=300
APP_PORT=8080
```

Notes:

- `REGISTRY_URL=/registry.json` is the default and means "same origin as the Hub". Set a different value only if you host the registry elsewhere. The value is sanitized by the container entrypoint — only `A-Z a-z 0-9 : / . + _ % ~ ? # & = @ , ; -` survive, so query strings (`?v=2`) and fragments (`#anchor`) are preserved, but quotes, backslashes, angle brackets, `$`, backticks, parentheses and whitespace are dropped. Percent-encode anything outside that set.
- `HUB_POLL_INTERVAL` is seconds as a bare integer (e.g. `300`, not `300s`). Every 300 seconds by default, each open browser re-reads every data-node's `get_meta` (counts, bounding box, data age). Playground data itself is fetched as the map moves, not on this timer.
- **`API_BASE_URL` is deliberately absent** on a Hub. The Hub speaks to multiple data-nodes over CORS and reads their URLs from `registry.json`; a single `API_BASE_URL` would be meaningless.
- `OSM_RELATION_ID`, `PBF_URL`, `POSTGRES_PASSWORD` are **not** set on the Hub — it has no database.

### Replace the bundled `registry.json` (required)

The Hub's shipped image bundles a development `registry.json` pointing at `/api` and `/api2`. Those paths have no upstream in the `ui` profile, so a Hub started without this step will load with every backend marked red.

If you set the Hub up with the installer and kept `REGISTRY_URL=/registry.json`, this is already done: it writes `registry.json` next to `compose.yml` and enables the bind-mount below. Otherwise pick one of the following — **neither is optional**:

**Option A — bind-mount via `compose.override.yml` (recommended, no rebuild)**

Create `compose.override.yml` alongside `compose.yml`:

```yaml
services:
  app:
    volumes:
      - ./registry.json:/usr/share/nginx/html/registry.json:ro
```

Docker Compose merges this file automatically — no extra `-f` flags needed, and it survives future `compose.yml` upgrades.

**Option B — custom image**

Bake your `registry.json` into your own image; see [Customise your own image → A built-in registry.json](customise-image.md#a-built-in-registryjson).

### Start the Hub

```bash
docker compose --profile ui up -d
```

No rebuild required; nginx serves the file immediately.

The Hub has no importer, no database, no `run --rm importer` step.

## Step 4 — Verify

1. Open the Hub URL in a browser (e.g. `https://hub.example.com`).
2. You should see the map render, fit to the union of all configured regions, with the instance pill in the bottom-left showing the aggregated region + playground counts (localized German: e.g. `2 Regionen · <count> Spielplätze` with a globe icon).
3. Open DevTools → Network and reload. You should see:
   - One `GET /registry.json` from the Hub's origin.
   - One `GET /rpc/get_meta` per data-node, cross-origin, returning 200 with `playground_count` + `bbox` + completeness fields.
   - On the first moveend, either `GET /rpc/get_playground_clusters?...` (cluster tier, zoom ≤ 13) or `GET /rpc/get_playgrounds_bbox?...` (polygon tier, zoom ≥ 14) per data-node whose bbox intersects the viewport. A data-node whose bbox sits entirely outside the viewport receives no request — that's the bbox router (see [How the hub works internally](../contributing/hub-internals.md)) doing its job, not a bug.
   - At zoom ≤ 7 (`MACRO_MAX_ZOOM`, the country view) you should see no per-playground requests at all while no filter is active — the country-level macro view renders entirely from the cached `get_meta` response. One ring per data-node. With a filter on, one `get_playground_clusters` request per data-node is expected: that is how the rings show filtered counts.
4. Click the instance pill — the drawer lists both backends with their playground count, data age and release version (from each backend's `get_meta`).
5. Click a playground in each region — the selection panel opens with that region's data.

If any data-node request fails in DevTools, the instance drawer marks that backend red with the error message. Check the data-node's CORS headers (Step 1 verification) and that its URL in `registry.json` is reachable from the browser, not only from the Hub host.

## Running Hub and data-nodes on the same host

Hub and data-nodes can share one machine, each as its own Compose project with its own `APP_PORT` and `COMPOSE_PROJECT_NAME`. Two pages cover that case:

- [Single-host Federation](single-host-federation.md): a hub plus many data-nodes on one VPS, including hardware sizing, port allocation and keeping imports apart.
- [Add a Data-node](add-data-node.md): adding one more region to a host that already runs a hub, including the reverse-proxy routes (subdomain or path prefix) and the matching `registry.json` entry.

## See also

- [`registry.json` reference](../reference/registry-json.md) — full schema, slug rules, derived behaviours.
- [Federation: one map, many owners](../concepts/federation.md) — why spieli is federated.
- [Federation reference](../reference/federation.md) — federation endpoints, zoom tiers, ring states.
- [Configuration](configuration.md) — full variables table including `REGISTRY_URL` and `HUB_POLL_INTERVAL`.
- [Architecture](../reference/architecture.md) — the `DEPLOY_MODE` × `APP_MODE` matrix that makes the legal combinations explicit.
