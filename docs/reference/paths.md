# Paths and ports

What a spieli instance serves, and under which path. Useful when you put your own reverse proxy, firewall or monitoring in front of it.

## Ports

| Port | What | Exposed by default |
|---|---|---|
| `APP_PORT` (default `8080`) on the host → `80` in the `app` container | Everything below: the map, the API, the proxies | Yes — the only published port |
| `5432` (PostgreSQL), `3000` (PostgREST) | Database and API server, inside the Docker network | No; nginx reaches PostgREST internally |

With the bundled Traefik ([HTTPS setup](../ops/https-setup.md)), ports 80 and 443 are Traefik's and forward to `APP_PORT`.

## Paths

| Path | What | Present on | Browser caching |
|---|---|---|---|
| `/` | The map (static build) | every instance with the `app` container | `index.html`: no cache header; scripts, styles, images and fonts: one year |
| `/api/` | PostgREST, the [API](api.md). Sends `Access-Control-Allow-Origin: *` so a hub can read it | data-nodes (`data-node-ui`) | per response |
| `/basemap/` | Background map: vendored style, fonts and sprites from disk, tiles proxied and cached ([Basemap and external services](../ops/basemap-and-services.md#basemap)) | every app | style five minutes; fonts and sprites one year |
| `/tiles/` | Raster tiles via `BASEMAP_PROXY` | only with `BASEMAP_PROXY=true` | per upstream |
| `/ext/nominatim/`, `/ext/commons/`, `/ext/wikimedia/<host>/`, `/ext/mangrove/` | Proxied external services ([External Services](external-services.md)) | every app, unless the matching `PROXY_*` is `false` | per service |
| `/legal/impressum`, `/legal/datenschutz` | Imprint and privacy notice ([Legal pages](../ops/configure.md#legal-pages)); `/impressum` and `/datenschutz` redirect here | every app | `no-store` |
| `/config.js` | Runtime configuration, written from `.env` at container start | every app | `no-store` |
| `/manifest.webmanifest`, `/icons/` | Web app manifest and its icons, for "Install app" | every app | `no-cache`; icons one day |
| `/registry.json` | The hub's list of data-nodes ([`registry.json`](registry-json.md)); path set by `REGISTRY_URL` | hubs | default |
| `/federation-status.json`, `/metrics` | Health of every listed region, as JSON and for Prometheus ([Hub status and metrics](hub-status.md)) | real values on hubs only; a placeholder elsewhere | `no-store` |

Region URLs like `/fulda` are not files: the map resolves them to a place via Nominatim. A path segment named `api`, `api2`, `ext`, `legal` or `metrics`, or one containing a dot, is never treated as a region.

Nothing is written to an access log, on any path ([Privacy by design → Nothing is written down](../concepts/privacy.md#nothing-is-written-down)).
