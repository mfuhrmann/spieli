# Architecture

## Standalone mode (default)

One region, one database. `APP_MODE=standalone` (the default).

```
                  ┌─────────────────────────────────────────────────────┐
                  │                   Production                        │
                  │                                                     │
  Browser ──────► nginx ──────► PostgREST ──────► PostgreSQL/PostGIS   │
  (your phone      (serves        (turns SQL          (holds all the    │
   or laptop)      the app,       functions into      OSM playground    │
                   proxies API    HTTP endpoints)     data)             │
                   requests)                                            │
                  └─────────────────────────────────────────────────────┘
```

Your browser loads the app from nginx. When it needs playground data, it calls `/api/`, which nginx forwards to PostgREST. PostgREST runs a SQL function in PostgreSQL and returns the results as JSON — no custom server code needed. The database was pre-loaded with OpenStreetMap data by the osm2pgsql importer (a one-time step you re-run whenever you want fresh data).

## Hub mode

Multiple regional instances aggregated onto one shared map. `APP_MODE=hub`.

```
                  ┌─ PostgREST A ──► PostgreSQL (region A) ─┐
  Browser ──► nginx                                          │ merged in browser
                  └─ PostgREST B ──► PostgreSQL (region B) ─┘
```

The Hub fetches playground data from every backend listed in `registry.json` and renders them on a shared map. The compose file ships a second backend (`db2` / `postgrest2`) at `/api2/` for local development. See [Federation](federation.md) for setup instructions.

## Local development

```
  Browser ──────► Vite dev server ──────► (hot-reload JS/CSS)
                                          ↓
                                   apiBaseUrl empty?
                                   ┌─────┴──────┐
                                  yes            no
                                   ↓              ↓
                               Overpass      PostgREST
                               (live OSM     (Docker stack
                                queries)      via make up)
```

During local development, the Vite dev server serves the JavaScript with instant hot-reload. By default (`apiBaseUrl` empty in `public/config.js`), the frontend fetches playground data directly from Overpass — no local database required. To test against the full PostgREST backend, start `make up` and set `apiBaseUrl` in `public/config.js`.

To test hub mode locally, see [Federation — Local hub development](federation.md#local-hub-development).

## Deployment modes

The compose file supports three profiles, selected at install time via `DEPLOY_MODE`:

| Mode | Services started | Use case |
|---|---|---|
| `data-node` | db, PostgREST, importer | Shared backend for multiple UI instances |
| `ui` | app (nginx) | Frontend connecting to a remote data node |
| `data-node-ui` | All of the above | Self-contained single-region deployment |

### `DEPLOY_MODE` × `APP_MODE` — legal combinations

`DEPLOY_MODE` picks which containers run. `APP_MODE` picks how the frontend behaves. They are orthogonal: one chooses *where* the code runs, the other chooses *what* the code does.

|                           | `APP_MODE=standalone`                                                                                 | `APP_MODE=hub`                                                                                                  |
|---------------------------|-------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| `DEPLOY_MODE=data-node`   | N/A — no frontend, `APP_MODE` is ignored                                                              | N/A — no frontend to run in hub mode                                                                            |
| `DEPLOY_MODE=ui`          | Remote-frontend for one region (`API_BASE_URL` points at a remote `/api/` — that backend must enable [CORS](../ops/federated-deployment.md#expose-api-to-the-hub)) | **Federated Hub** — aggregates multiple data-nodes                                                          |
| `DEPLOY_MODE=data-node-ui`| Default single-region deployment                                                                      | Hub co-located with a local data-node — replace the bundled `registry.json` (see walkthrough), or the Hub will point at dev paths |

For the federated Hub topology (`DEPLOY_MODE=ui` + `APP_MODE=hub`), see [Federated Deployment](../ops/federated-deployment.md).

## Tiered playground delivery

The standalone client switches between two zoom-scoped layers at `clusterMaxZoom` (default 13). Below the boundary it calls `get_playground_clusters(z, bbox)` for pre-aggregated count buckets; above it, `get_playgrounds_bbox(bbox)` for full polygons. The cluster RPC keeps two concerns deliberately separate: **grouping** is grid-based (each playground centroid is snapped to a zoom-dependent cell, which decides which features share a bucket) and stays grid-aligned across pans, deploys, and federation backends; **position** is the unweighted spatial mean of the bucket's member centroids, so the rendered dot tracks the geography of its members rather than the lattice. Federation cross-backend cluster merging (see [Federation](federation.md)) keys on the grouping cell, not on `lon` / `lat`, so the position semantics can change without touching the merge contract. See [API reference — `get_playground_clusters`](api.md#get_playground_clustersz-bbox) for the response shape.

## See also

- [API reference](api.md) — request/response shapes for the tiered playground RPCs that drive the standalone map.

## Key source directories

| Path | Role |
|---|---|
| `app/src/` | Svelte 5 frontend components and modules |
| `importer/` | osm2pgsql Lua rules and PostgREST API SQL (`api.sql`) |
| `db/` | PostgreSQL schema initialisation |
| `oci/` | Docker build contexts |
| `processing/` | OSM data pipeline scripts used during import |
