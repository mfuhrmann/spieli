# Configuration Reference

All variables are set in `.env` (copy from `.env.example`). The installer generates this file interactively — you can edit it afterwards to change any setting.

## Variables

| Variable | Default | Mode | Description |
|---|---|---|---|
| `DEPLOY_MODE` | — | — | Deployment mode: `data-node`, `ui`, or `data-node-ui`. Written by the installer. |
| `APP_MODE` | `standalone` | both | App mode: `standalone` (regional map) or `hub` (aggregation map). `hub` requires `REGISTRY_URL` and must be paired with `DEPLOY_MODE=ui`. See [Federated Deployment](federated-deployment.md). |
| `OSM_RELATION_ID` | `62700` | data-node, data-node-ui | OSM relation ID of the region to display |
| `OSM_RELATION_ID2` | `454881` | dev only | OSM relation ID for the second local backend (`db2`); used by `make import2` / `make seed-load2` |
| `PBF_URL` | Hessen extract | data-node, data-node-ui | Geofabrik `.osm.pbf` download URL |
| `REGISTRY_URL` | `/registry.json` | hub | URL of the registry JSON listing backends. Default is same-origin; bind-mount or bake in a custom file. See [Federated Deployment](federated-deployment.md) and [`registry.json` reference](../reference/registry-json.md). |
| `API_BASE_URL` | `/api` | ui, data-node-ui | Base URL of the PostgREST API. Set to the remote URL for `ui` mode (e.g. `https://data.example.com/api`). |
| `REGION_PLAYGROUND_WIKI_URL` | Generic OSM wiki | ui, data-node-ui | Wiki page linked in the "Contribute" modal |
| `REGION_CHAT_URL` | *(hidden)* | ui, data-node-ui | Community chat link; leave empty to hide the button |
| `MAP_ZOOM` | `12` | ui, data-node-ui | Initial map zoom level |
| `MAP_MIN_ZOOM` | `10` | ui, data-node-ui | Minimum zoom level |
| `PARENT_ORIGIN` | *(own origin)* | data-node-ui | Allowed origin for `postMessage` events — set to the Hub's full origin when embedding in a Hub |
| `APP_PORT` | `8080` | ui, data-node-ui | Host port the app is exposed on |
| `POSTGRES_PASSWORD` | `change-me` | data-node, data-node-ui | Database password — **change in production** |
| `POI_RADIUS_M` | `5000` | ui, data-node-ui | Radius in metres for nearby POI search |
| `OSM2PGSQL_THREADS` | `4` | data-node, data-node-ui | CPU threads for the import |
| `OSM_BBOX` | *(auto)* | data-node, data-node-ui | Manual bounding box for the osmium pre-filter (`west,south,east,north`). Skips Nominatim lookup when set. |
| `OSM_BBOX_PADDING` | `0.15` | data-node, data-node-ui | Degrees of padding added to each side of the Nominatim bbox (≈ 15 km). |
| `OSM_PREFILTER_MIN_MB` | `20` | data-node, data-node-ui | Source PBF files smaller than this many MB skip the osmium pre-filter step. |
| `GEOSERVER_URL` | *(disabled)* | data-node, data-node-ui | Base URL of a GeoServer instance for the shadow WMS layer; leave empty to disable |
| `GEOSERVER_WORKSPACE` | `spieli` | data-node, data-node-ui | GeoServer workspace name — only used when `GEOSERVER_URL` is set |
| `HUB_POLL_INTERVAL` | `300` | hub | Seconds between Hub re-fetches of playground data from all registered instances. Bare integer, no unit suffix. See [Federated Deployment](federated-deployment.md). |

## Applying changes

After editing `.env`, restart the relevant containers. Replace `<mode>` with your `DEPLOY_MODE` value (`data-node`, `ui`, or `data-node-ui`):

```bash
# Restart app only (config changes)
docker compose --profile <mode> up -d app

# Full restart
docker compose --profile <mode> down
docker compose --profile <mode> up -d
```
