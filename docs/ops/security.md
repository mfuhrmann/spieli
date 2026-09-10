# Security Hardening

This page covers steps to harden a spieli deployment for production. The default configuration is designed for getting started quickly — some defaults should be changed before exposing an instance to the internet.

## Checklist

- [ ] Change the database password
- [ ] Enable HTTPS with a reverse proxy
- [ ] Restrict database network exposure
- [ ] Review nginx security headers
- [ ] Keep images up to date

---

## Database password

The default `POSTGRES_PASSWORD` in `.env.example` is `change-me`. Set a strong random password before starting the stack for the first time:

```bash
openssl rand -base64 32   # generate a strong password
```

Edit `.env`:

```env
POSTGRES_PASSWORD=your-generated-password
```

The password is used only internally between PostgREST and PostgreSQL — it never leaves the Docker network. Still, a default password is a risk if the database port is accidentally exposed.

## HTTPS with a reverse proxy

The Docker stack listens on plain HTTP (port `APP_PORT`, default 8080). In production, put an HTTPS-terminating reverse proxy in front of it.

### Traefik (recommended)

Use the bundled installer — it configures Traefik with Let's Encrypt and handles certificate issuance and renewal automatically:

```bash
curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/deploy/traefik/install-traefik.sh -o install-traefik.sh
bash install-traefik.sh
```

See [HTTPS setup](https-setup.md) for the full walkthrough.

### Caddy (alternative)

```caddyfile
playground.example.com {
    reverse_proxy localhost:8080
}
```

Caddy handles HTTPS automatically with Let's Encrypt.

## Restrict database port exposure

The `compose.yml` does not publish the PostgreSQL or PostgREST ports to the host — only the app container's `APP_PORT` is published. Verify with:

```bash
docker compose ps
```

The `db` and `postgrest` services should show no host port bindings. If you see `0.0.0.0:5432->5432/tcp`, your database is accessible from the network. Remove the `ports:` entry for the `db` service from your compose file.

## nginx security headers

The bundled `oci/app/nginx.conf` sets several security headers:

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(self)
```

The Content Security Policy is **generated at container startup** by `oci/app/docker-entrypoint.sh` into `/etc/nginx/csp.conf`, which `nginx.conf` includes.
It is not a literal, because two parts of the correct policy are only knowable at runtime: in hub mode the browser connects to backends listed in an operator-supplied `registry.json`, and a basemap opt-out puts a third-party tile host back in the browser.
A literal wide enough for every deployment is a literal that protects none of them.

To see the policy your instance actually serves:

```bash
docker compose exec app cat /etc/nginx/csp.conf
```

### Two policies ship together, on purpose

During the current release the container sends **both** of these:

| Header | Host lists | Status |
|---|---|---|
| `Content-Security-Policy` | `img-src`/`connect-src` still `https:` | **Enforced** |
| `Content-Security-Policy-Report-Only` | narrowed to the hosts actually used | **Observed only** |

The narrowed policy is delivered in report-only form first because the failure mode of an over-tight CSP is silent: photos simply do not appear, with nothing but a browser console message.
The path most likely to break is therefore a rarely-taken one, in production.
Once the report set has been confirmed empty across both app modes and both basemap postures, the report-only policy becomes the enforced one and the wildcard policy is deleted.

If you see console messages beginning `Content Security Policy` while running this release, nothing is being blocked — but please report them, because they are exactly what the observation period is for.

There is deliberately **no `report-uri`**. It would collect a per-visitor record of what each browser tried to load, on your disk, which is the same shape of trail that [serving the basemap yourself](#the-basemap-is-same-origin-by-default) exists to remove.

### What the narrowed policy allows, and why

- `img-src 'self' data: https://*.wikimedia.org https://wikimedia.org https://*.wikipedia.org https://wikipedia.org https://api.panoramax.xyz` — playground photos and street-level thumbnails. The Wikimedia entries are wildcards because `app/src/lib/commons.js` accepts an OSM `image` tag on any `*.wikimedia.org` or `*.wikipedia.org` host; pinning this to `upload.` and `commons.` would silently stop rendering valid tags. The apex domains are listed separately because `*.example.org` does not match `example.org` in CSP.
- `connect-src 'self' https://nominatim.openstreetmap.org https://commons.wikimedia.org https://api.mangrove.reviews` — search and region-URL resolution, the Commons API, and reviews. Three more origins are added automatically when your configuration calls for them:
    - **A remote `API_BASE_URL`.** A `DEPLOY_MODE=ui` stack points at PostgREST on another host, and every data call goes to `${API_BASE_URL}/rpc/…`. Its origin is added, scheme and port included.
    - **Your hub backends.** Read from the `url` fields of `registry.json` when the registry is a same-origin file the entrypoint can read. Only `url` values are used — a `website` or docs link elsewhere in the registry does not widen the policy. If your registry is fetched from a URL at runtime, use `CSP_CONNECT_EXTRA`.
    - **Your basemap host**, if you opted out of same-origin delivery.
- `frame-src https://panoramax.xyz https://api.panoramax.xyz` — the street-level photo viewer. Already narrow, and the model the rest of the policy now follows.
- `frame-ancestors 'self' https:` — **still a wildcard, deliberately.** It governs who may embed spieli, not what spieli discloses, and a hub embeds standalone instances.

Why narrow `img-src` and `connect-src` at all, given the services above are all wanted: the values that reach the URL builders come from OSM tags, which are arbitrary attacker-editable strings.
`commons.js` validates that an `image` tag points at a Wikimedia host before rendering it, and with a `https:` wildcard that code check is the *only* thing between a crafted tag and a visitor's browser fetching from a host of the tagger's choosing.
The policy is the second line behind that check.
Both are tested: `tests/hostile-image-tag.spec.js` covers the code check, and the `CSP must follow the configuration` CI job covers the generated policy.

### Escape hatches

Two variables add origins the generator cannot discover. Both take a space-separated list of hosts or origins, and both reject a malformed value at startup rather than emitting a policy that blocks the origin it was meant to allow.

| Variable | Adds to | Use when |
|---|---|---|
| `CSP_CONNECT_EXTRA` | `connect-src` | Your hub fetches `registry.json` from a URL at runtime, so the entrypoint cannot read it to discover backends |
| `CSP_IMG_EXTRA` | `img-src` | You render images from an origin the generator does not know about |

A self-hosted tileserver on a **non-default port** currently needs both, because the host list feeding the policy drops the port (it is shared with the human-readable privacy page). Harmless while the narrowed policy is report-only; it will be fixed before the enforcing swap.

## External service dependencies

spieli calls several third-party services at runtime. Your users' browsers make direct requests to:

| Service | What is sent |
|---|---|
| Nominatim | Search query text, IP address |
| Basemap provider — **nothing by default**, see below | Map tile coordinates, IP address (only if you configure a third-party basemap) |
| Panoramax | Photo UUID, IP address (if photos viewed) |
| Mangrove.reviews | Playground osm_id (if reviews opened) |
| Geofabrik | Nothing — server-side download only |

No personal data, user accounts, or tracking pixels are added by spieli itself. See [External Services](../reference/external-services.md) for the full list.

### The basemap is same-origin by default

Out of the box, no basemap request leaves your server.
The bundled vector style references every asset — tiles, sprites, glyphs and webfonts — under `/basemap/` on your own instance.
nginx serves what is vendored in the image from disk and fetches the rest from `BASEMAP_UPSTREAM` server-side, caching it.
Your visitors' browsers never contact the tile server, and those proxied requests are not written to the access log.

This is the default, not something you have to switch on.
`BASEMAP_PROXY` is a separate, older mechanism for proxying a *raster* provider and is not what makes the above true.

You lose the property only by opting out: setting `BASEMAP_STYLE_URL` or `BASEMAP_URL` to a third party points visitors' browsers at that provider directly.
The container refuses to start if you do that without also setting `BASEMAP_ATTRIBUTION`.

## CORS for Hub data-nodes

Data-nodes (`data-node-ui` mode) respond with `Access-Control-Allow-Origin: *` on all `/api/` endpoints. This is intentional — the Hub's browser must be able to query data-nodes cross-origin. If you want to restrict CORS to specific Hub origins, edit the `add_header Access-Control-Allow-Origin` lines in `oci/app/nginx.conf` before building your image.

## Keeping images up to date

Pin a specific version tag in `compose.yml` and update regularly:

```yaml
image: ghcr.io/mfuhrmann/spieli:0.4.1   # pin a version
```

Subscribe to [GitHub Releases](https://github.com/mfuhrmann/spieli/releases) to be notified of new versions.

## See also

- [Configuration reference](configuration.md) — `POSTGRES_PASSWORD` and all env vars
- [Upgrading](upgrade.md) — how to update to a new release
- [Monitoring](monitoring.md) — observability for production instances
