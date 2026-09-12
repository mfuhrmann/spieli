# Data quality (Datenqualität)

Every playground is assigned one of three data-quality states based on how thoroughly it is documented in OpenStreetMap. The state is computed from a fixed set of OSM tag criteria — it is not a universal mapping standard but a practical indicator for the tags that make a playground entry most useful to visitors.

The label key `completeness.label` (`"Datenqualität"` / `"Data quality"`) can be used wherever the concept needs a heading.

## Criteria

Three independent criteria are evaluated per playground:

| Criterion | Satisfied when |
|---|---|
| **hasPhoto** | At least one `panoramax` / `panoramax:*` tag, a `wikimedia_commons` tag, or an `image` link on a Wikimedia/Wikipedia host is present (off-Wikimedia `image` URLs the gallery can't render do not count) |
| **hasEquipment** | At least one mapped piece of equipment exists inside the playground (devices, benches, pitches, fitness stations, etc.) |
| **hasInfo** | Any one of `opening_hours`, `surface`, or `access` (with a value other than `yes`) is present |

Each criterion is satisfied by the presence of **any** qualifying tag — `hasInfo` does not require all three tags.

## States

| State | Rule | Colour |
|---|---|---|
| `complete` | All three criteria satisfied | Green (`#15803d`) |
| `partial` | At least one criterion satisfied | Dark green (`#052e16`) |
| `missing` | No criteria satisfied | Slate blue-grey (`#64748b`) |

## Colours

The palette is a **single-hue green ramp ending in a cool slate**, not a traffic light. A diverging red/amber/green scale encodes "good versus bad", which reads as a verdict on the playground. This one encodes "more versus less", which is what the value measures.

The zero case is a cool slate rather than a plain grey: neutral enough to read as "nothing here yet" instead of "bad", but with enough blue cast to stay off the basemap's own warm greys (residential `#e0dfdf`, buildings `#d9d0c9`), which a plain grey at low alpha disappeared into. It covers most of the map — 625 of 926 playgrounds in Fulda — so it sits at 0.24 alpha with a dark stroke: the outline carries "there is a playground here" while the fill stays out of the way.

The ramp originally led with the brightest, most saturated green so the map drew the eye to the best-mapped playgrounds. That did not survive the basemap. `base` is drawn opaque for cluster and macro ring arcs, and against the OpenFreeMap Bright style `#4ade80` measures 1.59:1 on the background, 1.35:1 over grass and 1.06:1 over water — against a 3:1 floor for a graphical object. The brightest colour in the ramp was the least visible thing on the map. Since no green above 3:1 exists lighter than L\* 31, the ramp moved down a step instead: `complete` took the green-700 `partial` held, and `partial` dropped to a near-black green.

Four consequences are recorded in `app/src/lib/completenessPalette.js` and **not yet settled**:

1. The ramp has lost its bright end — `complete` no longer pulls the eye by brightness, only by hue against slate.
2. `complete` (L\* 47) and `missing` (L\* 48) are near-identical in lightness, so deuteranopic and protanopic viewers cannot recover the ordering.
3. `missing` measures 2.91:1 over water — still under the floor the greens were moved to clear.

A fourth — `base` moving while the polygon `fill` stayed behind — is resolved: `fill`, `hatch` and the ring colour are all derived from a single `base` per bucket, at one shared alpha, so they cannot drift apart again. Note that the polygon tier is inherently a weaker signal than the legend implies: as opaque ring arcs `complete` and `partial` are ΔE 42 apart, but as translucent fills over a near-white basemap they are ΔE 12.

All colours come from **`app/src/lib/completenessPalette.js`**, which documents which field each surface must use (`base` for anything opaque, `fill` only for shapes the basemap shows through or backgrounds carrying text). Every consumer reads from it: playground polygons, cluster rings, hub macro rings, the legend, the detail-panel badge, the filter dots, the nearby-playgrounds list and the hub instance drawer. Nothing may hardcode these values — picking the wrong field or a stale hex fails silently, with two surfaces simply disagreeing.

## Implementation

The logic is maintained in two mirrored places that must stay in sync:

- **Frontend**: `app/src/lib/completeness.js` — `playgroundCompleteness(props)`
- **Database**: `importer/api.sql`, CTE `completeness_attrs` (around line 110) — used to populate the `playground_stats` materialized view

Run `make db-apply` after changing the SQL definition to rebuild the materialized view.

## Locale keys

All UI strings live under the `completeness.*` namespace in `locales/de.json` and `locales/en.json` (repo root).

| Key | DE | EN |
|---|---|---|
| `completeness.legendTitle` | Datenqualität | Data Quality |
| `completeness.complete` | hoch | high |
| `completeness.partial` | mittel | medium |
| `completeness.missing` | niedrig | low |
| `completeness.dotComplete` | Daten vollständig | Data complete |
| `completeness.dotPartial` | Teilweise erfasst | Partially mapped |
| `completeness.dotMissing` | Daten fehlen | No data |
| `completeness.restrictedHint` | nicht öffentlich | not public |
