# Mapping detail (Erfasste Details)

Every playground is assigned one of three mapping-detail states, based on how much of it has been mapped in OpenStreetMap. The state describes **the map, not the playground** — a playground in the lowest state is not a bad playground, it is one nobody has written up yet.

The label key `mappingDetail.legendTitle` (`"Erfasste Details"` / `"Mapping detail"`) can be used wherever the concept needs a heading.

## Criteria

Two criteria are evaluated per playground:

| Criterion | Satisfied when |
|---|---|
| **hasEquipment** | At least one mapped piece of equipment exists inside the playground (devices, benches, pitches, fitness stations, etc.) |
| **hasInfo** | Any one of `opening_hours`, `surface`, or `access` (with a value other than `yes`) is present |

Each criterion is satisfied by the presence of **any** qualifying tag — `hasInfo` does not require all three tags.

## States

| State (identifier) | Label | Rule | Colour |
|---|---|---|---|
| `complete` | detailed | Both criteria satisfied | Dark green |
| `partial` | basic | Exactly one satisfied | Mid green |
| `missing` | not mapped yet | Neither satisfied | Neutral grey |

The identifiers `complete` / `partial` / `missing` are wire and storage values — they appear in API responses, in `playground_stats`, and in the `filterStore` keys. They deliberately differ from the labels shown to users; renaming them would break federation between backends on different versions.

The palette is a **sequential single-hue ramp**, not a traffic light. A diverging red/amber/green scale encodes "good versus bad", which reads as a verdict on the playground. A sequential ramp encodes "more versus less", which is what the value measures. The ramp varies primarily in lightness, so it stays legible with deuteranopia and protanopia.

All colours come from `app/src/lib/completenessPalette.js`. Polygons, cluster rings, hub macro rings, the legend, the detail-panel badge and the hub instance drawer all read from it, so they cannot drift apart.

## Photos are not a criterion

A photo (`panoramax` / `panoramax:*`, `wikimedia_commons`, or an `image` link on a Wikimedia/Wikipedia host) is **not** an input to the state.

It used to be: the old rule required all three of photo, equipment and info for the top state. Photo tags are rare in OSM, so that gated entire regions out of it — Hessen sat at 87 of 8802 playgrounds (1.0%) in the top bucket, while a well-photographed region reached 8.0% under the identical rule. A playground with twelve mapped devices plus surface and access stayed in the middle state indefinitely because nobody had uploaded a picture, which judged the mapper rather than the map ([#733](https://github.com/mfuhrmann/spieli/issues/733)).

Photo availability is still surfaced, as an **additive marker**: a camera glyph on the polygon and a badge in the playground panel, driven by `hasPhotoSignal()`. Having a photo is a bonus; not having one is not a penalty.

An off-Wikimedia `image` URL does not count — the gallery cannot render it.

## Implementation

The rule is maintained in two mirrored places that must stay in sync:

- **Frontend**: `app/src/lib/completeness.js` — `playgroundCompleteness(props)` and `hasPhotoSignal(props)`
- **Database**: `importer/api.sql`, CTE `completeness_attrs` feeding the `playground_stats` materialized view

Both are pinned to the same truth table: case 18 in `app/src/lib/completeness.test.js` on the JS side, and the "Assert JS/SQL rule parity" step in `.github/workflows/db-smoke.yml` on the SQL side. That step also asserts the live view definition still carries the rule, so an edit to one side without the other fails CI.

Run `make db-apply` after changing the SQL definition to rebuild the materialized view. No re-import is needed — the view is derived.

### Persisted criterion columns

`playground_stats` stores the criteria alongside the derived state, as non-null booleans:

| Column | Criterion |
|---|---|
| `has_photo` | photo signal (not a state input; drives the marker) |
| `has_equipment` | **hasEquipment** above |
| `has_info` | **hasInfo** above |

They are not exposed through any API function — they exist so the composition of each state can be measured directly instead of re-derived:

```sql
SELECT completeness, has_equipment, has_info, has_photo, count(*)
FROM playground_stats
GROUP BY 1,2,3,4
ORDER BY 5 DESC;
```

This is the query to run before and after any change to the criteria, to see which criterion is actually gating a state.

## Locale keys

All UI strings live under the `mappingDetail.*` namespace in `locales/de.json` and `locales/en.json` (repo root).

| Key | DE | EN |
|---|---|---|
| `mappingDetail.legendTitle` | Erfasste Details | Mapping detail |
| `mappingDetail.detailed` | detailliert | detailed |
| `mappingDetail.basic` | grundlegend | basic |
| `mappingDetail.notMapped` | noch nicht erfasst | not mapped yet |
| `mappingDetail.hasPhoto` | hat ein Foto | has a photo |
| `completeness.restrictedHint` | nicht öffentlich | not public |

`completeness.restrictedHint` stays in its old namespace — access restriction is a separate axis from mapping detail.

The filter labels under `filter.completeness.*` use the same wording (`detailliert` / `grundlegend` / `noch nicht erfasst`); the filter keys themselves (`showComplete`, `showPartial`, `showMissing`) keep the identifier naming.
