# Federation

Multiple regional instances can be aggregated into a single global map using the **Hub mode** built into this codebase. The Hub is not a separate repository — it is the same app deployed with `APP_MODE=hub`.

```
APP_MODE=standalone   →  regional map (one city / Kreis / Bundesland)
APP_MODE=hub          →  aggregation map that fetches from all registered instances
```

To run the Hub, use the same `compose.yml` and set `APP_MODE=hub`. The Hub reads a `registry.json` file listing the regional instances to aggregate.

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

- **Instance pill** (bottom-left): collapsed view shows a globe icon plus aggregated `<N> Regionen · <M> Spielplätze`. While the registry is loading the pill shows a spinner; if the registry can't be fetched the pill turns red and reads "Registry nicht erreichbar".
- **Instance drawer**: clicking the pill slides up a drawer listing each backend with its name, version badge (from `get_meta`), and individual playground count. ESC, outside-click, or re-clicking the pill collapses it.
- **Deep-link scheme**: see the [deep-link behaviour table](registry-json.md#deep-link-behaviour) in the registry reference.

The scale-line sits just below the pill in the same bottom-left corner. All other controls (search, filters, locate, zoom, contribute) are shared with standalone mode and behave identically.
