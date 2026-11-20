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
                    ┌──► hub          nginx: the app + registry.json  (no database)
                    │
  Browser ──────────┼──► data-node A  nginx /api/ ──► PostgREST ──► PostgreSQL (region A)
                    │
                    └──► data-node B  nginx /api/ ──► PostgREST ──► PostgreSQL (region B)

                         results from A and B are merged in the browser
```

The browser loads the app and `registry.json` from the hub, then fetches playground data **directly from each data-node** listed there, which is why every data-node's `/api/` must be public and send CORS headers. The hub itself never relays playground data. Why it is built this way: [Federation: one map, many owners](../concepts/federation.md). How the hub decides which data-nodes to ask: [Federation reference](federation.md). Setting one up: [Federated Deployment](../ops/federated-deployment.md).

For local development the compose file ships a second backend (`db2` / `postgrest2`) at `/api2/`, and the bundled `registry.json` lists `/api` and `/api2` on the same origin; see [Local Development → Hub mode](../contributing/local-dev.md#hub-mode).

## Deployment modes

Every role above is the same spieli release. Two settings decide which one a stack plays:

- **`DEPLOY_MODE`** picks which containers run: `data-node` (database, importer, API), `ui` (the app only) or `data-node-ui` (all of them).
- **`APP_MODE`** picks how the map behaves: `standalone` (one region) or `hub` (many regions from `registry.json`).

They are independent of each other: one decides *where* the code runs, the other *what* it does. The five combinations, and when to use which, are in [Deployment modes](deployment-modes.md).

## See also

- [API reference](api.md) — request/response shapes for the tiered playground RPCs that drive the standalone map.
- [Frontend Guide → The tiered orchestrator](../contributing/frontend-guide.md#the-tiered-orchestrator) — how the client switches between cluster and polygon tiers.
- [Local Development](../contributing/local-dev.md) — the dev-server setup and the repository layout.
