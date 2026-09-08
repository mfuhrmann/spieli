## Context

`Map.svelte:135` hardcodes `https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png` with a matching hardcoded attribution string. It is the only basemap configuration in the codebase and it is not env-driven.

CARTO's API-key requirement (issue #823) is the trigger, but the analysis in that issue establishes two things that outlive CARTO: they are considering retiring raster basemaps altogether, so any key-based fix buys time rather than solving the direction of travel; and the "does not track users" claim was already overstated before the key change, because any third-party tile host receives the visitor's IP, User-Agent, `Referer` and z/x/y coordinates by construction. The disclosure half of that has already shipped separately (#825 / PR #826); this change is the delivery and configuration half.

### Deployment shape that constrains the design

`scripts/upgrade-stacks.sh:14-30` lists **15 `data-node-ui` stacks on a single VPS**, each running its own nginx, plus Baden-Württemberg on a different operator's machine joining via `registry.json`. Any per-stack resource (a tile cache) is multiplied by 15 on that host. This is why cache size must be bounded and configurable rather than assumed free.

### Comparison of prior art

[knudli](https://codeberg.org/gruessung/knudli) (Flutter playground map, same domain) was examined for precedent. It does **not** solve the provider question: `lib/core/config/constants.dart:113` hardcodes `tile.openstreetmap.org` and `docs/konzept_online_tiles.md:243` explicitly declines to revisit it. It works for them because a native app can set `User-Agent: Knudli/{version}`, which OSM's Tile Usage Policy is written around; their own `docs/web-deployment-plan.md` concedes browsers cannot set that header. So knudli offers no usable precedent for the provider axis.

Where knudli *is* instructive is the delivery axis. They route Overpass through their own caching backend by default, and the comment at `constants.dart:126` is explicit that this is a privacy boundary, not a performance one: a fallback to direct Overpass is forbidden even for a single failed request, because it "würde die Nutzer-IP an die öffentlichen Overpass-Mirrors leaken". A hard switch, not a resilience fallback. D3 below adopts that stance.

## Goals / Non-Goals

**Goals:**
- An operator changes basemap provider by editing `.env` and restarting, with no rebuild.
- An operator can eliminate third-party tile contact entirely without self-hosting a tile build.
- Attribution follows the provider automatically, because it is a licence obligation, not decoration.
- The privacy disclosure follows the configuration, so it cannot silently drift from what the deployment actually does.
- Enabling proxying does not accumulate a per-visitor location trail on the operator's own disk (D8).
- The hub macro tier renders correctly with a Germany-only provider, so coverage does not veto the provider choice (D6).
- Today's behaviour is preserved for an operator who changes nothing.

**Non-Goals:**
- **Flipping the shipped default provider.** D9 records a recommendation under a privacy-first weighting (basemap.de, proxied), but changing the default alters the cartographic appearance of every deployment. That is a maintainer decision about visual identity, not a technical one; see task 6.2.
- **Vector basemap support.** OpenFreeMap and VersaTiles are vector-only (verified in D9) and need `ol-mapbox-style` plus a real frontend rework. Out of scope; D2 keeps the config shape from foreclosing it. This is what leaves non-German operators without a keyless option for now.
- **Self-hosted tile generation** (planetiler/PMTiles in the importer). Out of scope, and D5 records why it is heavier than it looks.

## Decisions

### D1 — Two orthogonal axes, configured independently

The three options in #823 (keyless raster / keyless vector / self-hosted) mix the provider question with the delivery question. They are separable:

```
                   PROVIDER (pick one)
        ┌──────────┬──────────────┬──────────────┐
        │  CARTO   │  basemap.de  │ OpenFreeMap  │
        │  (keyed) │  (keyless)   │  (keyless)   │
        └────┬─────┴──────┬───────┴──────┬───────┘
   ═══════════════════════════════════════════════
   DELIVERY (pick one, independently)
   ═══════════════════════════════════════════════
   (a) direct   browser ──────────────▶ provider
                provider sees every visitor's IP, UA, Referer, z/x/y

   (b) proxied  browser ─▶ nginx ─────▶ provider
                proxy_cache            provider sees one server, not users
```

Configuring them separately means the provider decision does not re-open the frontend, and privacy can be fixed before the provider question is settled. This is the central structural decision of the change.

*Alternative considered:* a single `BASEMAP_MODE` enum coupling provider and delivery. Rejected: it multiplies as providers are added, and it hides that proxying is available for every provider.

### D2 — `BASEMAP_URL` is a full OpenLayers XYZ URL template

Rather than a provider name that the app maps to a URL. Two reasons.

An OL `XYZ` source substitutes named placeholders, so a raw template absorbs axis-order differences for free. basemap.de's WMTS is `{z}/{y}/{x}`, not `{z}/{x}/{y}` — a documented trap in #823 — and a template handles it with no code branch:

```
https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png
```

It also keeps a provider allowlist out of the codebase, which matters because operators outside Germany will have providers we have not anticipated. Subdomain templates (`{a-d}`) are already XYZ syntax, so today's default is expressible unchanged.

*Alternative considered:* a named-provider enum with built-in URLs. Rejected as a maintenance treadmill that helps only the providers we happen to have listed.

### D3 — Proxying is opt-in, and has no fallback to direct

`BASEMAP_PROXY_UPSTREAM` unset means direct delivery, which is today's behaviour. Set, nginx serves `/tiles/` and the frontend points at that same-origin path.

Critically, **there is no automatic fallback from proxied to direct.** If the upstream is unreachable the tiles fail and the map renders without them. Falling back would leak exactly the IP addresses the operator turned proxying on to protect, and would do so precisely when something is already wrong. This mirrors knudli's reasoning and is the same trade they made.

*Alternative considered:* fall back to direct on upstream failure. Rejected: a privacy boundary that yields under load is not a boundary. Degrading to a blank basemap is honest and recoverable; silently leaking is neither.

### D4 — Cache is bounded, because caching scales with usage and pre-seeding scales with area

The distinction matters and is easy to get backwards. Tile counts for full coverage:

```
Hessen (one Bundesland)          z≤14      25k tiles     0.5–3 GB
                                 z≤16     390k tiles     8–49 GB
                                 z≤18     6.2M tiles     125–780 GB   (mapMaxZoom is 21)
```

Pre-seeding a Bundesland as raster is infeasible, and doing it 15 times on one VPS more so. But a demand-driven cache never holds full coverage: visitors look at populated areas and around playgrounds, a small fraction of the theoretical extent. An nginx `proxy_cache_path ... max_size=` with LRU eviction bounds it directly, so `BASEMAP_CACHE_MAX_SIZE` defaults conservatively (single-digit GB) and the 15-stack host stays predictable.

This is also the reason proxy-caching is not a weaker form of self-hosting: they have different cost curves, not different amounts of the same cost.

### D5 — Serving a basemap from the existing PostGIS is not viable

Recorded because it looks obviously right and is not. spieli already runs PostGIS with osm2pgsql data, so serving vector tiles via `ST_AsMVT` from `planet_osm_*` would need no planetiler, no JVM and no extra disk.

It fails on the data. `importer/import.sh:290` tag-filters the PBF to playground-domain features only: `leisure=playground`, `leisure=pitch`, `natural=tree`, benches, shelters, cafés, bus stops, shops. **No roads, no water, no landuse, no buildings.** There is nothing to draw a basemap from. Lifting the filter would destroy the ~300 MB → ~5 MB per-region reduction the entire import pipeline is built around, and inflate every operator's import time and disk.

Do not re-propose without first addressing the filter.

### D6 — The hub macro tier needs its own basemap, and it is cheap

#823 treats basemap.de's Germany-only coverage as a blocker, because at `macroMaxZoom: 7` the hub renders a Europe-wide view that would be blank outside Germany.

But the macro tier draws one ring per backend at its bbox centroid. It needs enough context to read as "Germany", not street detail. `Map.svelte:432` already subscribes to `activeTierStore` and flips `setVisible` per tier for three layers; a macro-only basemap — plausibly a bundled Natural Earth 1:110m outline, no network request at all — is one more line in that existing block.

**Revised to in-scope.** Originally deferred on the grounds that it only matters if a Germany-only provider is chosen. D9 makes that the recommended provider, so deferring it would leave a known blocker in front of the recommendation for the sake of roughly thirty lines. A bundled outline also removes a network dependency from the macro tier rather than adding one, which suits the privacy-first framing.

### D7 — Disclosure is generated from configuration, not hardcoded

PR #826 shipped a privacy table with a hardcoded CARTO row. That was correct when the basemap was hardcoded and becomes wrong the moment it is not. Worse, in proxied mode the row would assert a third-party transfer that no longer happens, which is a different kind of wrong from an omission.

So `docker-entrypoint.sh` renders the tile row from the same env vars that configure the layer: named provider in direct mode, omitted in proxied mode with a sentence stating tiles are served by the instance itself. Deriving both from one source is what stops them drifting.

### D8 — Proxying relocates the visitor's trail; it does not delete it

The decisive correction to D3's framing, found while evaluating the options under a privacy-first weighting.

Proxied delivery removes the third party, but the tile stream still exists: it now passes through the operator's nginx instead. With default access logging, every visitor's IP and every z/x/y coordinate they request lands in `access.log`. At z16–18 that stream is not metadata about the content, it *is* the content: which street, which playground, in sequence.

So the data does not disappear, it moves — from one provider with a retention policy and a compliance function, to 15 stacks on a hobbyist-operated VPS, whose operator silently becomes the controller for a per-visitor location trail they did not ask for and may not know exists.

**Measured against the goal that motivates proxying, a proxy with default logging is a downgrade rather than an improvement.** Hence `access_log off` on the tile location is specified as a requirement of the feature rather than left to operator hardening. Error-level logging is retained so failures stay diagnosable.

*Alternative considered:* document it as a recommended hardening step. Rejected — the failure is silent, the default is wrong, and an operator enabling proxying is by definition trying to reduce exposure. A feature that quietly does the opposite of its purpose unless you read the docs is a defect.

This also applies, more weakly, to direct delivery: the operator's nginx already logs page loads. The difference is one of resolution. Page loads are coarse; a tile stream is a movement trace.

### D9 — Under a privacy-first weighting, the delivery axis decides and CARTO is excluded

Recording the outcome of evaluating the provider options with privacy as the top priority, so the reasoning is not re-derived.

**The provider axis nearly collapses.** With proxying on, the provider receives one server IP and an aggregate tile stream it cannot segment per visitor. Every exposure except aggregate area popularity is gone regardless of which provider was chosen. Privacy comes from the delivery decision, not the provider decision.

**CARTO is excluded, and not because of the watermark.** The minimal fix for #823 — obtain a key, paste it in — is the *worst* available privacy outcome. Today CARTO receives referer-attributed, account-less traffic; a key converts it into traffic attributed to a named account, per operator, 16 times over. It resolves the watermark by strictly increasing attributability.

Usefully, this means **the privacy-first path does not depend on Open Question 1.** Whether CARTO's terms permit proxying stops mattering once CARTO is not the provider.

**Verified structural constraint: there is no keyless raster basemap with worldwide coverage.** Probed directly:

| Endpoint | Result |
|---|---|
| basemap.de raster (farbe / grau), keyless | `200 image/png` — but Germany only |
| OpenFreeMap `/styles/liberty` | `200 application/json` — vector only |
| OpenFreeMap raster path | `403` |
| VersaTiles style | `200 application/json` — vector only |

So raster-and-worldwide does not exist among keyless options. Germany-only raster is a drop-in with zero frontend work; worldwide requires vector and an `ol-mapbox-style` rework. All 16 current backends are German, which makes basemap.de the right default *for this federation* and not a universal answer. The env-driven configuration this change delivers is exactly what lets both coexist.

**Recommended configuration under this weighting:** basemap.de raster, proxied, with tile logging off, plus the D6 macro outline. No third party receives visitor data, no operator accumulates a location trail, no per-operator signup, no frontend rework.

**Not decided here:** whether to flip the *shipped default* from CARTO to basemap.de. That changes the cartographic appearance of every deployment, which is a maintainer call about the project's visual identity rather than a technical one. The mechanism is provider-agnostic either way; see task 6.2.

## Risks / Trade-offs

- **Upstream terms may forbid proxying.** Still the largest external risk, but it has moved: with CARTO excluded on privacy grounds (D9), the question that matters is basemap.de's terms under proxy load, not CARTO's (Open Question 2). Mitigation: proxying is opt-in, and the docs must state that operators are responsible for checking their chosen provider's terms.
- **Proxying concentrates the trail rather than removing it (D8).** Mitigated by making tile logging off the default, but the mitigation is a config directive, so it can be undone by an operator editing nginx or by a reverse proxy in front of the stack logging the same requests. Task 2.7 checks the second case; the first is inherent.
- **Operator egress.** Proxied tiles are served twice from the operator's perspective: inbound on a cache miss, outbound to every visitor always. On a small VPS with metered traffic this is a real cost, and it is worse with a heavy provider. Mitigation: document it; it is the operator's informed choice.
- **A proxy concentrates rate limiting.** All visitors appear to the upstream as one IP, which can trip abuse heuristics that per-visitor traffic would not. Mitigation: cache aggressively, set a truthful `User-Agent` on the proxied request, respect upstream cache headers.
- **Tile weight is unverified.** #823's 19 KB vs 125 KB is one tile at one zoom and says so. It should not carry the provider decision unmeasured, and caching changes what it means.
- **More configuration surface.** Four new env vars on a project whose selling point is a two-variable deployment. Mitigation: all four are optional with working defaults; an operator who ignores them sees today's behaviour.

## Open Questions

These bear on the *provider* decision (#823 item 3), not on this change. Recorded so it is not made on assumption.

1. ~~**Do CARTO's terms permit proxying and caching their tiles?**~~ **Moot on the recommended path.** Still unread, and still decisive if anyone wants to keep CARTO — but D9 excludes CARTO on privacy grounds independent of its terms, so this no longer gates the decision.
2. **What are basemap.de's service terms under proxy load?** *Open, and now the load-bearing question*, since D9 recommends basemap.de. The data is CC BY 4.0, but the WMTS endpoint's own rate limits and acceptable-use terms are a separate matter from the data licence. Must be read before an operator points production traffic through a cache.
3. ~~**What is the real tile-weight difference across zoom levels?**~~ **Answered.** Measured over one column of tiles through Fulda, same area, both providers:

   | zoom | CARTO | basemap.de | ratio |
   |---|---|---|---|
   | 10 | 17.8 KB | 83.9 KB | 4.7x |
   | 12 | 24.2 KB | 124.6 KB | 5.1x |
   | 13 | 27.3 KB | 153.5 KB | 5.6x |
   | 15 | 29.3 KB | 100.4 KB | 3.4x |
   | 17 | 16.2 KB | 40.3 KB | 2.5x |
   | 18 | 12.6 KB | 31.5 KB | 2.5x |

   The ~6x in #823 is close to the worst case, which sits at z13. The penalty falls to **2.5x at z17–18**, which is where users actually sit when looking at a playground, and caching absorbs part of the remainder. Still one column of tiles over one town, so treat it as an order-of-magnitude correction rather than a benchmark — but the objection is materially weaker than #823 assumed.
4. **Is OpenFreeMap's "no logs, no cookies, no API keys" claim verifiable**, and what is its operational durability for 16 deployments that would depend on it? Relevant only once vector support exists, i.e. for non-German operators.
