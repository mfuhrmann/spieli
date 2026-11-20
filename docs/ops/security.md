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

The installer generates a random password for you. If you set the stack up by hand, the default in `.env.example` is `change-me`; set a strong random one before starting the stack for the first time:

```bash
openssl rand -hex 32   # what the installer uses
```

Use hex rather than base64: the password ends up in a PostgreSQL connection URI, and the `+`, `/` and `=` that base64 produces break it.

Edit `.env`:

```env
POSTGRES_PASSWORD=your-generated-password
```

The password is used only internally between PostgREST and PostgreSQL — it never leaves the Docker network. Still, a default password is a risk if the database port is accidentally exposed.

## HTTPS with a reverse proxy

The Docker stack listens on plain HTTP (port `APP_PORT`, default 8080). In production, put an HTTPS-terminating reverse proxy in front of it. The bundled Traefik installer does this with Let's Encrypt, including renewal: [HTTPS setup](https-setup.md).

Any other reverse proxy works too. With Caddy, which obtains certificates by itself:

```caddyfile
playground.example.com {
    reverse_proxy localhost:8080
}
```

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
So the first breakage would show up in production, on a rarely used path.
Once testing in both app modes and both basemap setups shows no violations in the browser console, the report-only policy becomes the enforced one and the wildcard policy is deleted.

If you see console messages beginning `Content Security Policy` while running this release, nothing is being blocked — but please report them, because they are exactly what the observation period is for.

There is deliberately **no `report-uri`**. It would collect a per-visitor record of what each browser tried to load, on your disk, which is the same shape of trail that [serving the basemap yourself](basemap-and-services.md#basemap) exists to remove.

### What the narrowed policy allows, and why

- `img-src 'self' data: https://api.panoramax.xyz` — with every proxy on, Panoramax thumbnails are the only images the browser still fetches from a third party: the endpoint redirects to a per-instance derivative host nginx cannot follow. Narrowing that away would block the thumbnails and put a false statement on the privacy page. With `PROXY_COMMONS=false`, the Wikimedia and OSM-wiki hosts are added (`https://*.wikimedia.org https://wikimedia.org https://*.wikipedia.org https://wikipedia.org https://wiki.openstreetmap.org`). The Wikimedia entries are wildcards because `app/src/lib/commons.js` accepts an OSM `image` tag on any of those hosts; pinning it to `upload.` and `commons.` would silently stop rendering valid tags, and which host serves a file is not fixed — the API currently returns thumbnails on `thumb.wikimedia.org`. The apex domains are listed separately because `*.example.org` does not match `example.org` in CSP.
- `connect-src 'self'` — in a default deployment, nothing more. Since the external services are fetched server-side (see [External-service proxies](basemap-and-services.md#external-service-proxies)), the browser has nothing third-party to connect to. Opting a proxy out with `PROXY_NOMINATIM=false` and friends adds that service's host back. Three further origins are added automatically when your configuration calls for them:
    - **A remote `API_BASE_URL`.** A `DEPLOY_MODE=ui` stack points at PostgREST on another host, and every data call goes to `${API_BASE_URL}/rpc/…`. Its origin is added, scheme and port included.
    - **Your hub backends.** Read from the `url` fields of `registry.json` when the registry is a same-origin file the entrypoint can read. Only `url` values are used — a `website` or docs link elsewhere in the registry does not widen the policy. If your registry is fetched from a URL at runtime, use `CSP_CONNECT_EXTRA`.
    - **Your basemap host**, if you opted out of same-origin delivery.
- `frame-src https://panoramax.xyz https://api.panoramax.xyz` — the street-level photo viewer. Already narrow, and the model the rest of the policy now follows.
- `frame-ancestors 'self' https:` — **still a wildcard, deliberately.** It governs who may embed spieli, not what spieli discloses, and a hub embeds standalone instances.

Why narrow `img-src` and `connect-src` at all, when every service above is wanted? Because the values that reach the URL builders come from OSM tags, which are arbitrary attacker-editable strings.
`commons.js` validates that an `image` tag points at a Wikimedia host before rendering it, and with a `https:` wildcard that code check is the *only* thing between a crafted tag and a visitor's browser fetching from a host of the tagger's choosing.
The policy is the second line behind that check.
Both are tested: `tests/hostile-image-tag.spec.js` covers the code check, and the `CSP must follow the configuration` CI job covers the generated policy.

### Escape hatches

Two variables add origins the generator cannot discover. Both take a space-separated list of hosts or origins, and both reject a malformed value at startup rather than emitting a policy that blocks the origin it was meant to allow.

| Variable | Adds to | Use when |
|---|---|---|
| `CSP_CONNECT_EXTRA` | `connect-src` | Your hub fetches `registry.json` from a URL at runtime, so the entrypoint cannot read it to discover backends |
| `CSP_IMG_EXTRA` | `img-src` | You render images from an origin the generator does not know about |

A self-hosted tileserver does **not** need either of these, whatever port or scheme it uses: the basemap host is derived as a full origin, scheme and port intact, precisely because a CSP host-source with no port matches only the scheme's default port and one with no scheme matches only the document's own scheme. The privacy page's service table still shows the bare host, which is what reads well there.

## External service dependencies

By default spieli calls third-party services **from the server**, not from the visitor's browser: search, photos, reviews and the background map are fetched through same-origin paths and cached. Only Panoramax (thumbnails, and the viewer once a visitor opens it) and OpenStreetMap notes (when a visitor sends a hint) are contacted by the browser directly. Why, and what that does and does not protect: [Privacy by design](../concepts/privacy.md). Every service and its path: [External Services](../reference/external-services.md).

What matters for hardening is that the default is a setting you can leave. Opting any `PROXY_*` variable out, or pointing `BASEMAP_URL` / `BASEMAP_STYLE_URL` at a third party, moves that service back into the browser. The generated Content Security Policy (above) and the generated privacy page both follow that choice automatically, so neither has to be edited by hand. Settings: [Basemap and external services](basemap-and-services.md).

## CORS for Hub data-nodes

Data-nodes (`data-node-ui` mode) respond with `Access-Control-Allow-Origin: *` on all `/api/` endpoints. This is intentional — the Hub's browser must be able to query data-nodes cross-origin. Restricting it to specific hub origins needs your own image: see [Customise your own image → Restrict CORS](customise-image.md#restrict-cors).

## Keeping images up to date

Two ways, both fine:

- **Automatically** (the installer's default): the `auto-update` profile runs Watchtower, which installs new releases within a day. See [Upgrading → Automatic upgrade](upgrade.md#automatic-upgrade-watchtower).
- **By hand:** pin a version in `compose.yml` for both images and upgrade deliberately, following [Upgrading](upgrade.md):

    ```yaml
    image: ghcr.io/mfuhrmann/spieli:0.14.0
    image: ghcr.io/mfuhrmann/spieli-importer:0.14.0
    ```

Either way, subscribe to [GitHub Releases](https://github.com/mfuhrmann/spieli/releases): releases with a breaking label need a manual step even with Watchtower.

## See also

- [Configuration reference](configuration.md) — `POSTGRES_PASSWORD` and all env vars
- [Upgrading](upgrade.md) — how to update to a new release
- [Monitoring](monitoring.md) — observability for production instances
