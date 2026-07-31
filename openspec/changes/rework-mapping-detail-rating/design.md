## Context

The completeness rating is an AND across three axes — `hasPhoto`, `hasEquipment`, `hasInfo` — implemented twice: in `app/src/lib/completeness.js:42` for Overpass-fed features, and in the `playground_stats` matview in `importer/api.sql:326` for PostgREST-fed ones. `complete` requires all three.

`hasPhoto` is the bottleneck. Panoramax and `wikimedia_commons` tags are rare in OSM, so a well-surveyed playground stays amber indefinitely. In Hessen ~3k of 5.5k playgrounds sit in `partial`; the working hypothesis is that most of them are equipment ✓ + info ✓ + photo ✗. That hypothesis is currently unverifiable from the data: `playground_stats` persists only the derived `completeness`, not the three input flags.

The presentation compounds it. `locales/en.json:80-84` labels the axis "Data Quality" with `high` / `medium` / `low`, and the palette is a traffic light — `#228b22` / `#eab308` / `#ef4444` in `clusterStyle.js:15-19`, mirrored in `vectorStyles.js:44-67` and `macroRingStyle.js`. Together they read as a verdict on the playground, not a statement about map coverage.

Three constraints shape the design:

1. **Federation.** Hub mode merges `get_meta` and cluster buckets from many independently-upgraded backends. Anything that changes the bucket tuple forces a lockstep upgrade across every data node. It must not.
2. **Ops cost.** A matview rule change is `make db-apply`; a column-shape change to `planet_osm_*` would be a full re-import (hours per region, 16 German stacks).
3. **i18n ownership.** Only `locales/en.json` (Weblate source template) and `locales/de.json` may be hand-edited. The Weblate migration that blocked this work in the original plan has since settled (#795, #797 merged 2026-07-31), so the wording step is now unblocked.

## Goals / Non-Goals

**Goals:**

- Stop the photo tag from gating the top bucket; reward the survey work that actually exists.
- Keep the photo signal visible as its own reward, not as a penalty for its absence.
- Move the framing from "quality of the playground" to "detail of the mapping", in wording and in colour.
- Make the bucket composition measurable so the rule can be evaluated rather than argued about.
- Ship with `make db-apply` and no API break.

**Non-Goals:**

- Gold / silver / bronze metallics.
- A four-tier scheme.
- The "artistic vividness" tier illustration (sprite-per-equipment, colourised imagery).
- Changing what counts as `hasEquipment` or `hasInfo` — only how the three flags combine. Widening the input axes is separate work (#773, #776, #778).
- Per-user configurable palettes.

## Decisions

### D1 — Keep the bucket keys, change only the rule and the presentation

The wire keys stay `complete` / `partial` / `missing` everywhere: `get_playground_clusters`, `get_playgrounds_bbox`, `get_meta`, `hubOrchestrator`'s `macroAggregate` / `macroFiltered`, and `filterStore.showComplete` / `showPartial` / `showMissing`. Only the derivation and the user-facing label/colour move.

*Why:* a rename would touch every one of those call sites and force all federated backends to upgrade in lockstep with the hub, for zero user-visible gain. The label lives in `locales/*.json`; that is the only place the word needs to change.

*Alternative rejected:* renaming to `detailed` / `basic` / `none` on the wire. Honest naming, but it breaks mixed-version federation and buys nothing a locale string can't.

*Consequence to accept:* the identifier and the label disagree (`complete` displays as "detailed"). Mitigated with a comment block at each definition site and a note in `CLAUDE.md`.

### D2 — Equipment is the pivot, photo is a bonus

```
complete ("detailed")        = hasEquipment AND hasInfo
partial  ("basic")           = hasEquipment OR  hasInfo
missing  ("no details yet")  = neither
```

`hasPhoto` drops out of the classification entirely and is re-surfaced by D3.

*Why equipment and not info as the single pivot:* equipment is what a parent actually chooses a playground by, and it is the expensive part of the survey. `hasInfo` (`surface` / `opening_hours` / `access`) is cheap desk-mappable metadata. Requiring both for the top bucket keeps a genuine gap between "someone walked the site" and "someone walked the site and wrote it up".

*Alternative rejected:* `complete = hasEquipment` alone. Simpler, but collapses `partial` almost to empty and loses the incentive for the descriptive tags.

*Alternative rejected:* weighted score thresholded into three buckets. More tunable, but opaque to mappers — a mapper cannot tell what to add next to move a playground up. Boolean axes are self-explaining.

### D2a — `hasEquipment` counts play infrastructure only, not street furniture

Making equipment the pivot exposed how loose the existing `hasEquipment` test was. It accepted `amenity=bench`, `amenity=shelter`, `leisure=picnic_table` and the derived flags (`is_water`, `for_baby`, `for_toddler`, `for_wheelchair`) alongside actual `playground=*` objects.

That matters much more now than it did before. Under the old rule furniture could only lift a playground from `missing` to `partial`; with equipment as the pivot it can carry one all the way to `complete`, on the strength of a bench and a `surface` tag.

Measured on Fulda: **63 of 221** playgrounds registering as "has equipment" were carried by something other than a `playground=*` tag — 32 by a bench, 13 by a picnic table, 10 by a shelter, 15 by a pitch. Benches in particular are often mapped inside a playground area by someone who never mapped the play equipment, so the signal says "somebody surveyed the street furniture here", not "there is something to play on".

Narrowed to:

```
hasEquipment = device_count > 0            -- any playground=* object
            OR has_soccer OR has_basketball
            OR table_tennis_count > 0
```

*Pitches stay in.* A bolzplatz or basketball hoop is real play infrastructure; it is merely tagged `leisure=pitch` instead of `playground=*`. Excluding them would misjudge exactly the kind of place older children are looking for.

*Derived flags drop out.* A genuine device already satisfies `device_count`, so they add nothing in the true case — but `for_wheelchair` in particular can be set by a bench carrying `wheelchair=yes`, reproducing the furniture problem through a side door ([#776](https://github.com/mfuhrmann/spieli/issues/776)). They remain filter flags; they just stop feeding the rating.

Effect on Fulda (926 playgrounds), against the un-narrowed version of this same change:

| Bucket | Un-narrowed | Narrowed |
|---|---|---|
| `complete` | 128 | 118 |
| `partial` | 211 | 183 |
| `missing` | 587 | 625 |

49 playgrounds move from `partial` to `missing` — the bench-only cases, now correctly reported as unmapped.

*Alternative rejected:* strict `playground=*` only, no pitches (114 / 176 / 636). Cleaner to state, but drops ball courts, which are genuinely places to play.

### D3 — The photo becomes an additive marker on both surfaces

A camera glyph composited onto the polygon style, plus a badge in `PlaygroundPanel`. `completeness.js` gains an exported `hasPhotoSignal(props)` — the existing `hasPhoto` predicate, lifted out of the classification path and reused by the styling and panel code, so there is still exactly one definition of "has a photo".

*Why a separate marker and not a fourth bucket:* it keeps the bucket tuple at three (D1) while still making photo work pay off visually. Photos are additive information, and an additive glyph is the honest encoding.

*Placement:* glyph only at polygon zoom (`activeTierStore === 'polygon'`). Cluster and macro rings stay three-segment — a per-cluster photo count is a new aggregate and a new wire field for marginal value.

*Map only — no panel badge.* The first implementation put a "has a photo" chip in `PlaygroundPanel` as well. That is redundant: by the time the panel is open, the photos themselves are rendered in it by `CommonsGallery` / `PanoramaxViewer`, so the chip announces something already visible. The marker earns its place on the map, where it is the only way to tell which playgrounds have pictures without opening each one. The legend keeps its glyph line.

*Implementation trap:* the glyph needs an explicit `geometry` function returning the polygon's interior point. OpenLayers' `renderPolygonGeometry` handles fill, stroke and text only — an `image` style attached to a Polygon is **silently dropped**: no render, no warning, no error. The first implementation hit exactly this and shipped a legend entry for a glyph that never appeared.

### D4 — One palette module, sequential ramp, neutral zero

The palette moves to a new `app/src/lib/completenessPalette.js`, exporting fill bases, stroke colours and hatch strokes keyed by bucket. `vectorStyles.js`, `clusterStyle.js`, `macroRingStyle.js` and `CompletenessLegend.svelte` all import from it.

*Why:* the palette is currently written out four times, with a comment in `clusterStyle.js:11-13` explicitly asking the reader to keep them in sync by hand. A recolour that touches all four is exactly the change that proves the duplication is a defect.

Proposed values (final contrast check during implementation):

| Bucket | Label | Fill base | Stroke |
|---|---|---|---|
| `complete` | detailed | `#15803d` | `#14532d` |
| `partial` | basic | `#86efac` | `#3f6212` |
| `missing` | no details yet | `#64748b` | `#334155` |

Fills keep the existing `0.18` alpha; strokes stay `1.5` px.

*Why sequential over diverging:* a diverging scale encodes "good vs bad about a midpoint" — exactly the reading being complained about. A single-hue ramp encodes "more vs less", which is what the value measures. It also varies primarily in **lightness**, so it survives deuteranopia and protanopia, which the current green/amber/red does not.

*Why a neutral and not a pale green for the zero case:* a neutral reads as "no data here", not "bad playground", and pairs naturally with the contribution call-to-action. Extending the green ramp to its palest step would read as "a little bit mapped", which is untrue. (Which neutral changed later — see D8: plain grey lost against the basemap and the step is now a cool slate.)

### D5 — Rename the i18n block rather than redefine keys in place

`locales/en.json` and `locales/de.json` get a new `mappingDetail` block (`legendTitle`, `detailed`, `basic`, `noDetails`); the old `completeness` block's rating keys are removed.

The lowest step is "keine Details" / "no details yet", **not** "noch nicht erfasst" / "not mapped yet". The first wording was ambiguous in both languages: next to a legend headed "Erfasste Details" it read as "this playground is not in the map", when in fact it is on screen — that is why the reader can see it. The label has to answer *how much detail*, matching the heading, not *whether the place exists*.

*Why not keep the keys and change the English values:* every other locale would keep its existing translation ("hoch" / "mittel" / "niedrig", etc.) under a key whose meaning has changed, and Weblate would show them as translated. That ships a wrong label in ~10 locales, silently. Removing and adding keys makes the untranslated state visible and falls back to English until a translator gets to it — honest, and it is Weblate's normal workflow.

*Constraint:* `en.json` + `de.json` only, in the same commit, per `docs/contributing/translations.md`. The `i18n Guard` CI job enforces the rest.

### D6 — Persist the three flags on the matview

`playground_stats` gains `has_photo`, `has_equipment`, `has_info` as boolean columns. They are already computed in the CTE at `importer/api.sql:315-340`; the change is to select them through rather than discard them.

*Why:* it makes the Step 0 measurement a one-line `GROUP BY` instead of a re-derivation, it lets the same query verify the rule change post-deploy, and it keeps future rating debates empirical. Cost is three booleans per row on a matview that already carries geometry.

*Note:* this is what makes the change `requires-schema-update` rather than pure logic. Still `make db-apply`, still no re-import.

### D7 — Ship as three PRs

| PR | Content | Label |
|---|---|---|
| A | `has_photo` / `has_equipment` / `has_info` columns + the measurement query | `requires-schema-update` |
| B | Rule change (JS + SQL), palette module, photo marker | `requires-schema-update` |
| C | i18n rename + legend/panel wording | — |

*Why split:* PR A answers whether the hypothesis holds before PR B commits to the rule — if the `partial` bucket turns out not to be photo-blocked, the rule in D2 needs rethinking and PR B has not been written yet. PR C is isolated because it is the only piece with translation fallout, so it can be reverted alone if Weblate misbehaves.

*Order flexibility:* B is functional and C is cosmetic; B can ship first and carry the old wording for a release if C slips.

### D8 — Palette verified on the real basemap, ordered by visual weight

Checked against the live Fulda dataset at polygon zoom (2026-07-31). Findings, recorded so the next palette change starts from evidence rather than from scratch:

- **No clash with the basemap.** The greens sit clearly apart from OSM's `landuse=grass` / `leisure=park` washes at the fill alphas used. This was the open worry in D4 and it did not materialise.
- **The ramp runs bright → dark → grey, not dark → light → grey.** `complete` is the bright, saturated green (`#4ade80`) and `partial` the dark one (`#15803d`). Dark-to-light was monotonic in lightness but put the loudest colour on the middle state, so the eye landed on "basic" playgrounds while fully mapped ones receded.
- **Accepted cost:** with `partial` darker than both neighbours the ramp is not monotonic in lightness, so deuteranopic and protanopic viewers cannot recover the full ordering from lightness alone. Green-versus-grey still separates, which is what the contribution prompt depends on. If this is revisited, the thing to try is holding lightness roughly constant and ordering by saturation instead.
- **`complete` needs a higher fill alpha** (0.28 vs 0.22 for the others): bright green at 0.22 over a light basemap barely registered.
- **`missing` is a cool slate blue-grey (`#64748b`), not a plain grey.** A plain `#9ca3af` at 0.18 was tried first and was hard to pick out on the map: OSM Carto renders residential landuse (`#e0dfdf`) and buildings (`#d9d0c9`) in warm greys of its own, and a desaturated fill at low alpha sank into them. The slight blue cast separates it without making it look like a judgement, which rules out the obvious alternatives (amber, red) on the same grounds as the traffic light.
- **`missing` carries the map, so it stays quiet.** At 625 of 926 playgrounds in Fulda it is 67% of what is drawn; a loud treatment turns the map into a wall of colour. It sits at 0.24 fill with a dark stroke (`#334155`), so the outline carries "there is a playground here" — the issue's own "you will at least find it" — while the fill recedes.
- **Grey collisions, twice over.** `restricted` in `macroRingStyle` was the same `#9ca3af` as `missing`, moved to slate-600, then collided *again* when `missing` moved to slate-500. It is now violet-600 (`#7c3aed`), out of the neutral range entirely, which also reads better: restricted is about access, a different kind of thing, not "even less mapped". `OFFLINE_STROKE` and `NOMATCH_STROKE` keep `#9ca3af` and are now collision-free, since the mapping-detail palette has left plain grey behind.
- **Still unverified:** `partial` (`#15803d`, 0.22 alpha) over dark backgrounds — woodland, dark park fills. It is now the largest green group (176–211 of 926 in Fulda depending on the equipment rule), so it is the one most worth a second look.

## Risks / Trade-offs

- **The measurement disproves the hypothesis** (most `partial` is equipment ✗, not photo ✗) → PR A runs first specifically to catch this. If it lands that way, D2 is wrong and the real problem is import coverage, not the rating rule. Re-open the design rather than shipping B.
- **Bucket counts shift under operators without warning** — a region's "complete" share jumps overnight on `make db-apply` → this is the intended effect, but it will surprise anyone watching the numbers. Call it out in the release notes and in the `requires-schema-update` upgrade note.
- **Mixed-version federation shows mixed rules** — a hub aggregating upgraded and un-upgraded backends renders macro rings whose `complete` segments mean different things per backend → transient, self-resolving as stacks upgrade via `scripts/upgrade-stacks.sh`, and invisible in practice (segment proportions, not labelled counts). Not worth a version negotiation.
- **Identifier / label mismatch confuses future contributors** (`complete` renders as "detailed") → D1's accepted cost; mitigated by comments at both definition sites and a `CLAUDE.md` note.
- **~10 locales show English labels until translated** → D5's accepted cost, and the honest failure mode. The alternative silently ships wrong translations.
- **Grey `missing` polygons read as disabled or unavailable** → the contribution CTA in the panel carries the meaning; verify against the basemap during implementation and darken if the polygons disappear into it.
- **Regional palette regression on the OSM basemap** — `#86efac` at 0.18 alpha may be too faint over green landuse → contrast-check `basic` polygons over `landuse=grass` and `leisure=park` specifically, since playgrounds sit inside them.

## Migration Plan

1. **Measure (PR A).** Apply with `make db-apply` on the Hessen instance. Run the breakdown:
   ```sql
   SELECT completeness, has_equipment, has_info, has_photo, count(*)
   FROM playground_stats GROUP BY 1,2,3,4 ORDER BY 5 DESC;
   ```
   Record the result in the change folder. Decision gate for PR B.
2. **Verify fresh-volume import.** Per `CLAUDE.md`, any `api.sql` change gets `make down && docker volume rm spieli_pgdata spieli_pgdata2 && make up` — `make db-apply` on an existing volume hides ordering bugs.
3. **Ship the rule (PR B).** `make db-apply` + `make docker-build`. Re-run the breakdown query; confirm the `complete` share moved as predicted.
4. **Ship the wording (PR C).** `en.json` + `de.json` only. Let Weblate pick up the new source strings.
5. **Roll out.** `scripts/upgrade-stacks.sh` already runs `API_ONLY=1` before restarting the daemon importer, which is the correct order for a matview-only change.

**Rollback:** each PR reverts independently. Reverting PR B restores the old `CASE` in the matview; `make db-apply` rebuilds it and every bucket reverts on the next view refresh. No data is lost at any point — `playground_stats` is derived, and the three flag columns are additive.

## Open Questions

- Does the Hessen breakdown actually confirm the photo-bottleneck hypothesis? (PR A answers; blocks PR B.)
- Should the camera glyph also appear in `HoverPreview`, or is the polygon glyph plus the panel badge enough? Leaning: polygon + panel only, to keep the hover card small.
- Does `CompletenessLegend` need a fourth line explaining the camera glyph, or does the panel badge carry it? Leaning: a legend line, since the glyph appears on the map without a panel open.
- Are the `Badge` variants (`success` / `warning` / `destructive`) used anywhere outside the completeness context? If so, the neutral replacements need new variants rather than edits to the existing ones.
