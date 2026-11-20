# Customise your own image

Everything in [Configuration](configuration.md) is a setting in `.env`. This page is for the few changes that go further and need **your own build of the app image**: a different basemap style, a `registry.json` inside the image, a narrower CORS policy, error reporting. You stay an operator; you just build the image yourself instead of pulling it.

## Building the image

Check out the release you run, make your change, and build from the repository root:

```bash
git clone https://github.com/mfuhrmann/spieli.git
cd spieli
git checkout vX.Y.Z          # the release you run
# … your change …
docker build -f oci/app/Dockerfile -t my-spieli:vX.Y.Z .
```

Then point the `app` service in your installed `compose.yml` at it (`image: my-spieli:vX.Y.Z`) and recreate it with `docker compose --profile <mode> up -d app`. Two things follow from running your own image:

- **Watchtower cannot update it.** It only follows published images. Repeat the build for every release, on top of the new tag.
- **Keep the change small**, so it rebases cleanly onto the next release.

## Your own tileserver

`BASEMAP_UPSTREAM` in `.env` switches the cache to another tileserver. That alone is enough if the server mirrors OpenFreeMap's URL layout. The bundled style carries the provider's asset paths (`/planet`, `/sprites/ofm_f384/ofm`), and the cache only swaps the origin in front of them, so a differently laid-out server needs the style rebuilt against it, in your own image:

```bash
# in your checkout: rebuild the style against the new provider
tools/build-basemap-style.py --source https://my-tileserver/styles/foo \
                             --asset-base /basemap \
                             --out app/public/basemap/style.local.json
# build the image as above, then in the stack's .env (origin only — a path is rejected at startup):
BASEMAP_UPSTREAM=http://tileserver:8080
```

## A built-in `registry.json`

For a hub, instead of bind-mounting the file ([Federated Deployment → Replace the bundled registry.json](federated-deployment.md#replace-the-bundled-registryjson-required)): put your `registry.json` at `app/public/registry.json` in your checkout before building. No `compose.override.yml` is needed then, but every change to the list means a rebuild.

## Restrict CORS

Data-nodes answer `/api/` with `Access-Control-Allow-Origin: *` on purpose: every hub's visitors must be able to read them. To allow only specific hub origins, edit the `add_header Access-Control-Allow-Origin` lines in `oci/app/nginx.conf` before building your image.

Any hub you leave out can no longer show your region.

## Frontend error reporting

spieli ships no frontend error reporting, and adding one is a source change rather than a setting:

- The Content Security Policy allows scripts from the instance's own origin only (`script-src 'self'`), so an SDK loaded from a CDN or injected through nginx or `config.js` is blocked. It has to be bundled into the app build.
- The reporting endpoint must be added to `CSP_CONNECT_EXTRA`, or the narrowed policy (report-only today, enforced later) blocks the reports.
- Error reports carry visitor data (IP address, browser, the page) to a third party. Name the service on the privacy page; spieli's generated privacy page does not know about it.

## Build problems

### The map renders, but labels or icons are missing

**Symptom:** the basemap draws roads, water and landcover, but place names are missing, or they render in a system font that looks wrong next to the rest of the UI.

**Cause:** the webfonts the style asks for are not vendored in the image. Labels are drawn from `/basemap/fonts/<family>/<weight>.css`, not from the style's `glyphs` endpoint, and a missing weight fails silently: the renderer falls back to a system font and the map still renders. It also puts a request the tile server cannot answer on every page load.

**Fix:** check which weights the style asks for and re-vendor them.

```bash
# Lists the style's font stacks and fails if one has no vendored file
make basemap-fonts
# What is actually in the image:
docker compose exec app ls /usr/share/nginx/html/basemap/fonts/noto-sans/
```

`Noto Sans Bold` needs `700.css`, `Noto Sans Italic` needs `400-italic.css`, and so on. `make basemap-fonts` fetches all of them and then asserts the coverage, so a green run means every stack in the style resolves.

Missing *icons* rather than labels point at the sprite sheet instead: check that `/basemap/sprites/…` returns 200 and not 404.

```bash
curl -sI http://localhost:8080/basemap/sprites/ofm_f384/ofm.png | head -1
```

A 404 there usually means an nginx location-precedence problem — regex locations are matched before plain prefixes, so a `~* \.png$` block can claim these paths unless the `/basemap/` location uses `^~`.

### Container refuses to start: `style.local.json is missing from the image`

**Symptom:** the app container exits immediately with

```
[spieli] FATAL: app/public/basemap/style.local.json is missing from the image.
```

**Cause:** `style.local.json` is generated by `make basemap-style` and committed; your checkout does not have it (deleted, or a build from a modified tree). The check is deliberate: the entrypoint refuses to fall back to `style.json`, whose assets point at the public tile server, because that would silently send every visitor to a third party while the docs promise the opposite.

**Fix:** regenerate both style variants and rebuild.

```bash
make basemap-style     # writes style.json and style.local.json from one fetch
docker build -f oci/app/Dockerfile -t my-spieli:vX.Y.Z .
```
