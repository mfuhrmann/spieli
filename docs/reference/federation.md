# Federation

Multiple regional instances can be aggregated into a single global map using the **Hub mode** built into this codebase. The Hub is not a separate repository — it is the same app deployed with `APP_MODE=hub`.

```
APP_MODE=standalone   →  regional map (one city / Kreis / Bundesland)
APP_MODE=hub          →  aggregation map that fetches from all registered instances
```

## Production hub setup

To run the Hub, use the same `compose.yml` and set `APP_MODE=hub`. The Hub reads a `registry.json` file listing the regional instances to aggregate:

```json
{
  "instances": [
    { "slug": "fulda",      "url": "https://fulda.example.com",      "name": "Fulda" },
    { "slug": "vogelsberg", "url": "https://vogelsberg.example.com", "name": "Vogelsberg" }
  ]
}
```

Point `REGISTRY_URL` in `.env` at the URL of this file (default: `/registry.json`, served from the app container).

## Local hub development

The compose file ships with a second backend (`db2` / `postgrest2`) pre-wired at `/api2/`. This lets you test hub mode locally with two real regions without any extra configuration.

**With full OSM import (~300 MB PBF, run once):**

```bash
# In .env: set APP_MODE=hub
make up
make import    # Fulda Stadt (454863) → db
make import2   # Neuhof (454881)      → db2 (reuses cached PBF)
make docker-build
```

**With the bundled seed fixtures (fast, no download):**

```bash
# In .env: set APP_MODE=hub
make up
make seed-load   # 4 Fulda playgrounds  → db
make seed-load2  # 5 Neuhof playgrounds → db2
make docker-build
```

Open `http://localhost:8080` — the Hub shows both regions on a shared map.

The local `registry.json` (`app/public/registry.json`) points to `/api` (Fulda) and `/api2` (Neuhof). nginx proxies both to their respective PostgREST instances.

The second backend uses `OSM_RELATION_ID2` from `.env` (default: `454881` = Neuhof). To test a different second region, set `OSM_RELATION_ID2` and re-run `make import2`.

## Federation endpoints

Each regional instance exposes two endpoints (available since v0.2.1):

| Endpoint | Description |
|---|---|
| `GET /api/rpc/get_playgrounds` | Full GeoJSON FeatureCollection of all playgrounds in the region |
| `GET /api/rpc/get_meta` | Instance metadata: OSM relation name, playground count, bounding box |

CORS is enabled on `/api/` so the Hub can query instances cross-origin from the browser.

## Registry

The Hub discovers instances from a `registry.json` file — see the [`registry.json` reference](registry-json.md) for schema, slug rules, and the derived aggregate behaviours (aggregated bounding box, multi-backend nearest search).

## Hub UI

The Hub renders the same layout as a standalone regional map, with two additions:

```
┌────────────────────────────────────────────────────────────┐
│  [search]   [filters]               [filter]  [contribute] │
│                                                            │
│                                                            │
│                      ( map canvas )                        │
│                                                            │
│                                               [locate]     │
│                                               [zoom +/−]   │
│                                                            │
│  [🌐 2 Regionen · 413 Spielplätze]                         │
│   └ scale-line                                             │
└────────────────────────────────────────────────────────────┘
```

- **Instance pill** (bottom-left): collapsed view shows a globe icon plus aggregated `<N> Regionen · <M> Spielplätze`. While the registry is loading the pill shows a spinner; once the registry is known but backends are still fetching their data, the pill shows `<completed>/<total> Regionen` with a spinner until every backend has settled (success or error) — the fraction only appears on the first load, not on subsequent 5-min refresh polls. If the registry can't be fetched the pill turns red and reads "Registry nicht erreichbar".
- **Instance drawer**: clicking the pill slides up a drawer listing each backend with its name, version badge (from `get_meta`), and individual playground count. ESC, outside-click, or re-clicking the pill collapses it.
- **Deep-link scheme**: see the [deep-link behaviour table](registry-json.md#deep-link-behaviour) in the registry reference.

The scale-line sits just below the pill in the same bottom-left corner. All other controls (search, filters, locate, zoom, contribute) are shared with standalone mode and behave identically.

## See also

- [Federated Deployment](../ops/federated-deployment.md) — step-by-step walkthrough for standing up one Hub + N data-nodes.
- [`registry.json` reference](registry-json.md) — registry schema, slug rules, derived aggregate behaviours.
