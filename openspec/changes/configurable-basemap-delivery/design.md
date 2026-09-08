## Context

`Map.svelte:135` hardcodes `https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png` with a matching hardcoded attribution string. It is the only basemap configuration in the codebase and it is not env-driven.

CARTO's API-key requirement (issue #823) is the trigger, but the analysis in that issue establishes two things that outlive CARTO: they are considering retiring raster basemaps altogether, so any key-based fix buys time rather than solving the direction of travel; and the "does not track users" claim was already overstated before the key change, because any third-party tile host receives the visitor's IP, User-Agent, `Referer` and z/x/y coordinates by construction. The disclosure half of that has already shipped separately (#825 / PR #826); this change is the delivery and configuration half.

### Deployment shape that constrains the design

`scripts/upgrade-stacks.sh:14-30` lists **15 `data-node-ui` stacks on a single VPS**, each running its own nginx, plus Baden-Württemberg on a different operator's machine joining via `registry.json`. Any per-stack resource (a tile cache) is multiplied by 15 on that host. This is why cache size must be bounded and configurable rather than assumed free.

### Scope: the federation is no longer Germany-only

The target coverage is **Germany plus Czechia and Slovakia**. This arrived after the first draft and it invalidates that draft's recommendation, so it is recorded here rather than folded in silently.

It matters more than a bounding-box change because the hub renders every backend on one map. Per-region providers cannot paper over it: a hub view with basemap.de tiles over Germany and nothing over Czechia is one map with a hole in it. Whatever the hub uses must cover the whole federation, and that constraint propagates to the data nodes for consistency.

### Comparison of prior art

[knudli](https://codeberg.org/gruessung/knudli) (Flutter playground map, same domain) was examined for precedent. It does **not** solve the provider question: `lib/core/config/constants.dart:113` hardcodes `tile.openstreetmap.org` and `docs/konzept_online_tiles.md:243` explicitly declines to revisit it. It works for them because a native app can set `User-Agent: Knudli/{version}`, which OSM's Tile Usage Policy is written around; their own `docs/web-deployment-plan.md` concedes browsers cannot set that header. So knudli offers no usable precedent for the provider axis.

Where knudli *is* instructive is the delivery axis. They route Overpass through their own caching backend by default, and the comment at `constants.dart:126` is explicit that this is a privacy boundary, not a performance one: a fallback to direct Overpass is forbidden even for a single failed request, because it "würde die Nutzer-IP an die öffentlichen Overpass-Mirrors leaken". A hard switch, not a resilience fallback. D3 below adopts that stance.

## Goals / Non-Goals

**Goals:**
- An operator changes basemap provider by editing `.env` and restarting, with no rebuild.
- An operator can eliminate third-party tile contact entirely, either by proxying or by serving a local copy (D10).
- Attribution follows the provider automatically, because it is a licence obligation, not decoration.
- The privacy disclosure follows the configuration, so it cannot silently drift from what the deployment actually does.
- Enabling proxying does not accumulate a per-visitor location trail on the operator's own disk (D8).
- The basemap covers the whole federation — Germany, Czechia and Slovakia — including on the hub, which renders every backend on one map, and the macro tier stays readable outside that extent (D6).
- The completeness colours stay distinguishable against the basemap, because hue is the app's primary encoding (D11).
- Today's behaviour is preserved for an operator who changes nothing.

**Non-Goals:**
- **Flipping the shipped default provider.** Changing the default alters the cartographic appearance of every deployment, which is a maintainer decision about visual identity rather than a technical one; see task 6.2.
- **Generating a basemap from spieli's own imported data.** D5; the import is tag-filtered to playground features and has no roads or water to draw. Serving a prebuilt extract is a different thing and is in scope (D10).
- **Designing a spieli-specific cartography from scratch.** Adopting Bright and applying the two bounded edits in D11 is in scope; an original map design is not.

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

### D4 — Cache sizing is a raster problem, and vector dissolves it

**Superseded in part by D10.** The original reasoning — that caching scales with usage while pre-seeding scales with area, so a bounded LRU cache is the only affordable option — is correct *for raster* and misleading as a general claim. Kept because the raster arithmetic is still what rules raster out.

Raster full coverage, using per-zoom sizes measured against basemap.de rather than a flat average:

```
Germany     z10-18   80.8M tiles   2,929 GB
Czechia     z10-18                   675 GB
Slovakia    z10-18                   419 GB
                                  ─────────
federation total                  4,023 GB
```

Nothing sensible caches that, so raster forces a demand-driven LRU cache, a working-set guess, and eviction tuning.

Vector removes the problem rather than shrinking it, because OpenFreeMap's tileset has **`maxzoom: 14`** and the client renders z15–21 by overzooming the same tiles. Zooming to street level costs zero additional tiles:

```
Germany     z0-14   317,618 tiles    53.3 GB
Czechia     z0-14    73,571 tiles    12.3 GB
Slovakia    z0-14    45,650 tiles     7.7 GB
                                   ────────
federation total                     73.3 GB   (generous bbox coverage,
                                                including sea and overlap)
```

At that size the cache stops being a cache. Complete, permanent coverage of the whole federation fits in well under 100 GB, so there is no eviction policy to tune, no working set to estimate, and no cold-start penalty. `BASEMAP_CACHE_MAX_SIZE` remains configurable, but on the vector path its job is a safety ceiling rather than a rationing mechanism.

Sizing note for whichever path is taken: nginx's `keys_zone` holds roughly 8,000 keys per MB, and it binds before disk does. The `keys_zone=10m` in most copy-paste examples tracks about 80,000 tiles, so a large `max_size` with a default `keys_zone` yields a cache that stays almost entirely empty. The federation's ~437k vector tiles need roughly 55 MB. `inactive` matters just as much: its 10-minute default evicts tiles regardless of free space, which is wrong by orders of magnitude for basemap tiles.

### D5 — Serving a basemap from the existing PostGIS is not viable

Recorded because it looks obviously right and is not. spieli already runs PostGIS with osm2pgsql data, so serving vector tiles via `ST_AsMVT` from `planet_osm_*` would need no planetiler, no JVM and no extra disk.

It fails on the data. `importer/import.sh:290` tag-filters the PBF to playground-domain features only: `leisure=playground`, `leisure=pitch`, `natural=tree`, benches, shelters, cafés, bus stops, shops. **No roads, no water, no landuse, no buildings.** There is nothing to draw a basemap from. Lifting the filter would destroy the ~300 MB → ~5 MB per-region reduction the entire import pipeline is built around, and inflate every operator's import time and disk.

Do not re-propose without first addressing the filter.

**Scope boundary, since D10 now recommends serving tiles ourselves.** This decision rejects *generating* a basemap from spieli's own imported data. It does not reject *serving* a prebuilt vector extract produced elsewhere, which is a different proposition: no import change, no filter change, no JVM, just a file on disk. D5 stays true; D10 does not contradict it.

### D6 — The hub macro tier needs its own basemap, and it is cheap

#823 treats basemap.de's Germany-only coverage as a blocker, because at `macroMaxZoom: 7` the hub renders a Europe-wide view that would be blank outside Germany.

But the macro tier draws one ring per backend at its bbox centroid. It needs enough context to read as "Germany", not street detail. `Map.svelte:432` already subscribes to `activeTierStore` and flips `setVisible` per tier for three layers; a macro-only basemap — plausibly a bundled Natural Earth 1:110m outline, no network request at all — is one more line in that existing block.

**Revised to in-scope, and the reason survived the scope change.** Originally deferred as only mattering for a Germany-only provider. It still matters under D10: a mirrored tileset covering Germany, Czechia and Slovakia is a three-country tileset, so at `macroMaxZoom: 7` everything outside those borders is blank exactly as it would have been with basemap.de. Mirroring narrows the coverage gap, it does not close it.

Two cheap ways to close it, to be decided during implementation: a bundled Natural Earth outline with no network request at all, or mirroring low-zoom world tiles, which is nearly free — z0–6 worldwide is 5,461 tiles, a few hundred MB. OpenFreeMap's own style already carries a `ne2_shaded` Natural Earth raster source capped at `maxzoom: 6` for precisely this purpose, which is a useful precedent either way.

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

**basemap.de is also excluded, on the multi-country scope.** An earlier revision of this decision recommended it. That was correct for a Germany-only federation and is wrong for this one, and the failure mode is bad enough to record in full: basemap.de does not 404 outside Germany, it returns `200 OK` with a blank tile.

| probe (z13) | status | bytes |
|---|---|---|
| Dresden (DE) | 200 | 148,712 |
| Berlin (DE) | 200 | 143,560 |
| Prague (CZ) | 200 | 334 |
| Brno (CZ) | 200 | 854 |
| Bratislava (SK) | 200 | 854 |
| Košice (SK) | 200 | 854 |

Nothing errors, nothing alerts, and a proxy cache would store millions of blank tiles as though they were valid. The map would show a void beginning about 60 km from Dresden. A provider that fails silently and cache-poisons on the way is worse than one that fails loudly.

**No keyless raster basemap has worldwide coverage** (probed: OpenFreeMap and VersaTiles are vector-only, OpenFreeMap's raster path 403s). Combined with the above, raster has no viable candidate for this federation: CARTO is excluded on privacy, basemap.de on coverage, OSM's tile server by its usage policy. **The multi-country scope therefore makes vector mandatory rather than optional**, which is the substance of D10.

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

### D10 — Vector is mandatory, and at vector sizes mirroring beats proxying

Two conclusions the multi-country scope forces, both reversing earlier positions in this document.

**Vector moves from non-goal to requirement.** The first draft deferred vector support as "a real frontend rework, out of scope". That was affordable while a keyless raster provider existed for the target area. For Germany + Czechia + Slovakia none does (D9), so the rework is no longer optional and the change must carry it: an `ol-mapbox-style` integration and a style-URL configuration shape alongside the XYZ template.

**Serving the tiles ourselves becomes the preferred delivery, not the heaviest option.** D4's arithmetic assumed raster, where full coverage is thousands of GB and only a demand cache is affordable. At 73 GB for the whole federation, a complete local copy is ordinary. That inverts the comparison:

```
                        raster (old assumption)      vector (measured)
full federation copy    4,023 GB   infeasible        73 GB   ordinary
delivery that follows   proxy + LRU cache            serve from disk
upstream dependency     permanent                    none, after the fetch
```

Mirroring dominates proxying on every axis that motivated proxying in the first place: no visitor data reaches a third party (same as proxy), no upstream terms-of-service question (better), no rate-limit exposure (better), no dependence on OpenFreeMap's single maintainer and donation funding (better), and no cold-cache latency (better). The only thing proxying retains is automatic freshness, and basemap data does not need to be fresh to the minute — a periodic extract refresh is sufficient and fits the pattern the importer already uses for PBFs.

So the delivery axis from D1 gains a third position, and it is the recommended one:

```
(a) direct    browser ─────────────────────▶ provider
(b) proxied   browser ─▶ nginx ─▶ cache ───▶ provider
(c) mirrored  browser ─▶ nginx ─▶ local tiles        ← recommended
                                  (periodic refresh, no request path to a provider)
```

**Kept in scope regardless:** the proxy path (b). It is the incremental step, it is what an operator with less disk uses, and it is the only option for anyone pointing at a provider whose data cannot be redistributed. D8's logging requirement applies to (b) and (c) alike, since both put the tile stream through the operator's nginx.

*Alternative considered:* keep raster and accept blank tiles outside Germany until vector lands. Rejected — silently blank maps for two of three countries is not a shippable intermediate state, and D9 shows it would also poison the cache.

### D11 — Style: OpenFreeMap Bright, tuned; the underlay is ours to edit

The style question turned out to be a correctness question wearing an aesthetic one's clothes, and then a product question on top of that.

**The constraint.** spieli encodes its primary signal — playground completeness — entirely in hue: green `rgba(34,139,34,.22)` / `#155215`, amber `rgba(234,179,8,.22)` / `#92400e`, red `rgba(239,68,68,.18)` / `#991b1b`. So the requirement on any basemap is: **it must not use the channel the data encodes in.** CARTO Voyager satisfies this today by being a desaturated data-underlay style, a property that was inherited rather than chosen and appears in no requirement anywhere. Losing it silently during the migration was a live risk.

**Measured against real data.** Five candidates rendered over 115 real playgrounds from the Hessen backend at z16, using the exact rule from `completeness.js` and the exact fills from `vectorStyles.js`:

| Style | Verdict |
|---|---|
| **Bright** (OpenFreeMap) | **Chosen.** Warm and map-like; park fills light enough that polygons hold their edge |
| Positron (OpenFreeMap) | Runner-up. Best contrast — neutral `rgb(230,233,229)` parks, no POI clutter — but austere |
| Graybeard (VersaTiles) | Viable. Maximum contrast, but greyscale water reads clinical |
| Liberty (OpenFreeMap) | Rejected. Saturated `rgb(95,208,100)` park outlines directly under green polygons |
| CARTO Voyager | Blocked. Watermarked without a key; a key makes privacy worse (D9) |

*Correction recorded deliberately:* an earlier revision rejected "Liberty / Bright" together. Bright had not been rendered at that point, only judged by name. On inspection its parks are materially lighter than Liberty's and it does not carry Liberty's saturated park outline. Grouping them was wrong.

**Why Bright over Positron.** Positron wins the contrast test outright. Bright wins the one that is not measurable here: a family-facing playground map benefits from reading as a warm, familiar map rather than a data substrate. That is a product judgement, and it is the maintainer's.

**Two edits ship with it**, because Bright does not satisfy the constraint out of the box:

1. Desaturate `park`, `landcover_grass` and `landcover_wood`, reclaiming the green channel for playground data.
2. Thin or drop the POI icon layers — the blue icons compete for attention harder than the greens do.

Both are only possible because the migration replaces a fixed raster image with a style document we own. **This is the first upside of the migration that is not damage control.** Edit 2 is also the same work as building a thinner tileset, so the legibility fix and the mobile-performance lever from D10 coincide.

*Consequence for scope:* style tuning moves from non-goal into scope as a small bounded piece, and any legibility check must run against the **tuned** style. The published comparison uses stock styles; the shipped one will not be stock.

## Risks / Trade-offs

- **Redistribution rights for a mirrored tileset.** The risk that replaces the proxying-terms question on the recommended path. OpenMapTiles-schema tiles built from OSM are ODbL, which is why mirroring looks defensible, but "we may serve a local copy of this tileset to our users" must be confirmed against the specific source before an operator does it, not assumed from the data licence.
- **Vector rework is real scope.** `ol-mapbox-style`, a style asset, glyphs and sprites, and a second configuration shape. It is larger than everything else in this change combined, and it is now on the critical path rather than deferred.
- **Upstream terms may forbid proxying.** Applies to the proxy path only. With CARTO excluded on privacy grounds and basemap.de on coverage, this no longer gates the recommendation; it gates operators who point path (b) at a provider of their own choosing.
- **Proxying concentrates the trail rather than removing it (D8).** Mitigated by making tile logging off the default, but the mitigation is a config directive, so it can be undone by an operator editing nginx or by a reverse proxy in front of the stack logging the same requests. Task 2.7 checks the second case; the first is inherent.
- **Operator egress.** Proxied tiles are served twice from the operator's perspective: inbound on a cache miss, outbound to every visitor always. On a small VPS with metered traffic this is a real cost, and it is worse with a heavy provider. Mitigation: document it; it is the operator's informed choice.
- **A proxy concentrates rate limiting.** All visitors appear to the upstream as one IP, which can trip abuse heuristics that per-visitor traffic would not. Mitigation: cache aggressively, set a truthful `User-Agent` on the proxied request, respect upstream cache headers.
- **Tile weight is unverified.** #823's 19 KB vs 125 KB is one tile at one zoom and says so. It should not carry the provider decision unmeasured, and caching changes what it means.
- **More configuration surface.** Four new env vars on a project whose selling point is a two-variable deployment. Mitigation: all four are optional with working defaults; an operator who ignores them sees today's behaviour.

## Open Questions

These bear on the *provider* decision (#823 item 3), not on this change. Recorded so it is not made on assumption.

1. ~~**Do CARTO's terms permit proxying and caching their tiles?**~~ **Moot on the recommended path.** Still unread, and still decisive if anyone wants to keep CARTO — but D9 excludes CARTO on privacy grounds independent of its terms, so this no longer gates the decision.
2. ~~**What are basemap.de's service terms under proxy load?**~~ **Moot.** basemap.de is excluded on coverage (D9), so its terms no longer bear on the decision.

2a. **May the chosen vector tileset be mirrored and served to our users?** *The new load-bearing question.* OSM-derived OpenMapTiles-schema data is ODbL, but the hosted service's own terms are a separate matter, exactly as they were for basemap.de. Must be read before an operator serves a local copy. If the answer is no for OpenFreeMap, VersaTiles and self-building from a Geofabrik extract are the fallbacks, and the last of those has no such question at all.

2b. **Which style, and how large are its glyphs and sprites?** The 73 GB figure counts tiles only. Fonts and sprite sheets are small but they are additional assets that must also be served locally, or the "no third-party contact" property leaks through the style rather than the tiles — an easy thing to miss.
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
