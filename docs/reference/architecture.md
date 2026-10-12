# Architecture

## Standalone mode (default)

One region, one database. `APP_MODE=standalone` (the default).

```
                  ┌─────────────────────────────────────────────────────┐
                  │                   Production                        │
                  │                                                     │
  Browser ──────► | nginx ──────► PostgREST ──────► PostgreSQL/PostGIS  │
  (your phone     | (serves        (turns SQL          (holds all the   │
   or laptop)     | the app,       functions into      OSM playground   │
                  | proxies API    HTTP endpoints)     data)            │
                  | requests)                                           │
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
| `DEPLOY_MODE=data-node`   | N/A — no frontend, `APP_MODE` is ignored                                                              | N/A — no frontend                                                                                               |
| `DEPLOY_MODE=ui`          | Remote-frontend for one region (`API_BASE_URL` points at a remote `/api/` — that backend must enable [CORS](../ops/federated-deployment.md#expose-api-to-the-hub)) | **Hub only** — aggregates multiple remote data-nodes via `registry.json`                                    |
| `DEPLOY_MODE=data-node-ui`| **Standalone** — default single-region deployment. Add `PARENT_ORIGIN` to also register this instance as a backend in an external hub (**standalone + federated**). | **Hub + local backend** — hub UI co-located with a local data-node; `registry.json` lists `/api` plus any additional remote backends |

The installer guides all five scenarios. See [Federated Deployment](../ops/federated-deployment.md) for the hub topologies.

## Tiered playground delivery

The standalone client switches between two zoom-scoped layers at `clusterMaxZoom` (default 13). Below the boundary it calls `get_playground_clusters(z, bbox)` for pre-aggregated count buckets; above it, `get_playgrounds_bbox(bbox)` for full polygons. The cluster RPC keeps two concerns deliberately separate: **grouping** is grid-based — each playground centroid is snapped to a zoom-dependent cell that decides which features share a bucket — while **position** is the unweighted spatial mean of the bucket's member centroids, so the rendered dot tracks the geography of its members rather than the lattice.

Because a grid cell is about as wide as a marker (≈ 64 px at z12 against a ≈ 52 px disc), neighbouring buckets routinely touch: two playgrounds 300 m apart on either side of a cell border become a disc and a pin side by side. Both modes therefore merge buckets client-side before drawing them (`lib/clusterMerge.js`, #941): buckets whose markers would overlap at the current resolution are combined, counts and completeness segments summed, the position the **count-weighted** mean. Marker size follows the count (`radiusForCount`), a single playground is sized as the finder pin in both modes, and passes repeat until nothing overlaps, since a merge grows the disc. In hub mode (see [Federation](federation.md)) the same merge runs over all backends' buckets together, which is what removes the seam where two backends meet.

See [API reference — `get_playground_clusters`](api.md#get_playground_clustersz-bbox) for the response shape.

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
