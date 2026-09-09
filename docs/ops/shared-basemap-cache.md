# Shared basemap cache

**This page is only for hosts running several spieli stacks.**
A single-stack operator needs nothing here: every instance already caches basemap tiles on its own, and that is the shipped default.

## Why

Each stack fetches tiles from `BASEMAP_UPSTREAM` and caches them itself.
That is the right default — it is portable and needs no extra component — but on the federated host it multiplies:

| | Per-stack caches (default) | One shared cache |
|---|---|---|
| Disk at the 4 GB default × 15 stacks | up to 60 GB | one cache, sized once |
| Clients the tile server sees | 15 | 1 |
| Cold starts after an upgrade sweep | 15, all at once | none — the cache outlives the stacks |

The last row is the one that matters most.
`scripts/upgrade-stacks.sh` walks the stacks in sequence, and without a shared cache each one comes back empty and refills from the public tile server. Fifteen cold caches hitting a donation-funded server run by one person, in a burst, is the load pattern this whole design exists to avoid.

## How it works

The visitor's browser never touches the shared cache.
It only ever talks to its own stack's nginx, which fetches through the cache **server-side**:

```
browser ──► stack nginx ──► shared cache ──► tiles.openfreemap.org
            (per domain)     (one per host)   (one client for the host)
             /basemap/
```

This is why the shared cache needs no Traefik router, no CORS exception and no CSP allowance, and why the same-origin privacy property is preserved for free: as far as the browser is concerned nothing changed.

!!! note "One rewrite is load-bearing"
    The TileJSON document a tileserver returns carries **absolute** tile URLs pointing at itself.
    The shared cache rewrites those to the relative path `/basemap/`, which is correct for every stack regardless of its domain, because it is a path and not a host.

    Without that rewrite each stack would look for *its* configured upstream — now the cache, not the provider — find nothing to rewrite, and hand the browser `tiles.openfreemap.org` URLs directly. The map would still render perfectly while quietly undoing the same-origin property. CI asserts the rewrite for this reason.

## Set it up

### 1. Start the cache

It creates the `spieli-basemap` network the stacks join, so it goes up first.

```bash
cd deploy/basemap-cache
docker compose up -d
docker compose ps
```

Defaults are sized for a shared cache rather than fifteen small ones: 16 GB, a 128 MB `keys_zone`, and a 180-day `inactive`. Override in a `.env` next to that compose file if the host has different headroom.

`keys_zone` holds roughly 8,000 keys per MB and binds **before** disk does, so keep the two in step. A large `max_size` behind a small zone yields a cache that stays almost empty.

Set a real `BASEMAP_CACHE_UA`. This container is the single client the tile server sees for the whole host, so it is the one that has to identify a contactable operator:

```bash
BASEMAP_CACHE_UA='spieli/shared-basemap-cache (+https://spieli.eu; ops@example.org)'
```

### 2. Point each stack at it

In every stack's `.env`:

```bash
BASEMAP_UPSTREAM=http://basemap-cache
BASEMAP_CACHE_MAX_SIZE=256m
```

The second line matters.
The per-stack cache does not disappear — it becomes a small L1 in front of the shared L2. Leaving it at the 4 GB default across fifteen stacks spends 60 GB to save a sub-millisecond hop on the same host.

Then start each stack with the override that joins the network:

```bash
docker compose -f compose.yml -f compose.override.basemap-cache.yml up -d
```

To make that permanent, set it once per stack instead of typing it each time:

```bash
echo 'COMPOSE_FILE=compose.yml:compose.override.basemap-cache.yml' >> .env
```

`scripts/upgrade-stacks.sh` runs plain `docker compose` commands, so it picks `COMPOSE_FILE` up automatically and no change to the script is needed.

### 3. Check it is actually being used

```bash
# The cache should report hits, not misses, once warm
docker compose -f deploy/basemap-cache/compose.yml exec basemap-cache \
  wget -qS -O /dev/null http://127.0.0.1/planet 2>&1 | grep -i x-basemap-cache
```

A stack is wired up correctly when its TileJSON names same-origin tiles:

```bash
curl -s http://localhost:8081/basemap/planet | head -c 120
# {"tilejson":"3.0.0","tiles":["/basemap/planet/<build>/{z}/{x}/{y}.pbf"],…
```

If that shows an absolute `https://…` URL instead, the stack is not going through the shared cache, or the cache's `BASEMAP_UPSTREAM_HOST` does not match the provider it actually fetches from.

## Access logging

The cache sets `access_log off` on tile requests, for the same reason each stack does: at high zoom the z/x/y stream is not metadata about what someone looked at, it *is* what they looked at. Moving that stream onto the operator's own server and then logging it would be worse than the third-party delivery it replaces.

`error_log` still records a failing URI, which is what keeps outages diagnosable.

Traefik never sees basemap traffic in this topology — the browser fetches tiles from its own stack, and the stack reaches the cache over an internal Docker network — so there is nothing to exclude at the ingress. Traefik's access log is off by default in `deploy/traefik/`; if you enable it for other reasons, that remains true only as long as tiles do not start flowing through it.

## Exposure

Nothing is published. The cache listens only on the `spieli-basemap` Docker network, so it is not reachable from outside the host at all.

It still constrains what it will fetch — an asset-shaped path, `GET` only, no query strings — even though every request comes from a stack that has already applied the same rule. A caching proxy that will fetch arbitrary paths is a relay someone else can fill on your behalf, and defence in depth is cheap here.

## Running your own tileserver instead

The same variable does both jobs. Point the shared cache at your own server rather than the public one:

```bash
# deploy/basemap-cache/.env
BASEMAP_UPSTREAM=http://tileserver:8080
BASEMAP_UPSTREAM_HOST=tileserver:8080
```

If that server's URL layout differs from the provider's, the bundled style needs rebuilding against it too — see [Configuration](configuration.md#basemap). The stacks need no change either way.
