# Mapping detail (Erfasste Details)

Every playground is assigned one of three mapping-detail states, based on how much of it has been mapped in OpenStreetMap. The state describes **the map, not the playground** — a playground in the lowest state is not a bad playground, it is one nobody has written up yet.

The label key `mappingDetail.legendTitle` (`"Erfasste Details"` / `"Mapping detail"`) can be used wherever the concept needs a heading.

## Criteria

Two criteria are evaluated per playground:

| Criterion | Satisfied when |
|---|---|
| **hasEquipment** | Play infrastructure exists inside the playground: any object tagged `playground=*`, or a `leisure=pitch` for soccer, basketball or table tennis |
| **hasInfo** | Any one of `opening_hours`, `surface`, or `access` (with a value other than `yes`) is present |

Each criterion is satisfied by the presence of **any** qualifying tag — `hasInfo` does not require all three tags.

### What does not count as equipment

**Street furniture** — `amenity=bench`, `amenity=shelter`, `leisure=picnic_table` — is excluded. These are frequently mapped inside a playground area by someone who never mapped the play equipment itself, so counting them lifted playgrounds that have nothing to play on. In Fulda, 63 of 221 playgrounds registering as "has equipment" were carried by furniture alone.

Pitches *do* count: a bolzplatz or basketball hoop is real play infrastructure, merely tagged `leisure=pitch` rather than `playground=*`.

**Derived flags** — `is_water`, `for_baby`, `for_toddler`, `for_wheelchair` — are also excluded. A genuine playground device already satisfies the `playground=*` test, so they add nothing there; on their own they can be set by a bench tagged `wheelchair=yes`, which is the same false signal ([#776](https://github.com/mfuhrmann/spieli/issues/776)). They remain available as filter flags, they just do not feed the rating.

## States

| State (identifier) | Label | Rule |
|---|---|---|
| `complete` | detailed | Both criteria satisfied |
| `partial` | basic | Exactly one satisfied |
| `missing` | no details yet | Neither satisfied |

The identifiers `complete` / `partial` / `missing` are wire and storage values — they appear in API responses, in `playground_stats`, and in the `filterStore` keys. They deliberately differ from the labels shown to users; renaming them would break federation between backends on different versions.

How the three states are coloured is a separate concern; see the map legend and `app/src/lib/vectorStyles.js`.

## Photos are not a criterion

A photo (`panoramax` / `panoramax:*`, `wikimedia_commons`, or an `image` link on a Wikimedia/Wikipedia host) is **not** an input to the state.

It used to be: the old rule required all three of photo, equipment and info for the top state. Photo tags are rare in OSM, so that gated entire regions out of it — Hessen sat at 87 of 8802 playgrounds (1.0%) in the top bucket, while a well-photographed region reached 8.0% under the identical rule. A playground with twelve mapped devices plus surface and access stayed in the middle state indefinitely because nobody had uploaded a picture, which judged the mapper rather than the map ([#733](https://github.com/mfuhrmann/spieli/issues/733)).

Photo availability is still surfaced, as an **additive marker**: a camera glyph drawn at the playground's interior point, driven by `hasPhotoSignal()`. Having a photo is a bonus; not having one is not a penalty.

The marker lives on the map only. There is no photo badge in the detail panel — by the time the panel is open the photos themselves are visible in it, so a chip announcing them would be redundant. On the map it is the only way to see which playgrounds have pictures without opening each one.

Implementation note: the glyph needs an explicit `geometry` function pointing at the polygon's interior point. OpenLayers' `renderPolygonGeometry` handles fill, stroke and text only — an `image` style attached to a Polygon is silently dropped, with no warning.

An off-Wikimedia `image` URL does not count — the gallery cannot render it.

## Implementation

The rule is maintained in two mirrored places that must stay in sync:

- **Frontend**: `app/src/lib/completeness.js` — `playgroundCompleteness(props)` and `hasPhotoSignal(props)`
- **Database**: `importer/api.sql`, CTE `completeness_attrs` feeding the `playground_stats` materialized view

Both sides are guarded. Case 17 in `app/src/lib/completeness.test.js` walks the truth table in JS. The "Assert JS/SQL rule parity" step in `.github/workflows/db-smoke.yml` does the SQL side by reading the live view definition rather than restating it: it extracts the `has_equipment` expression and fails if it stops counting any of `device_count` / `table_tennis_count` / `has_soccer` / `has_basketball`, or if it starts counting street furniture or a derived flag again ([#776](https://github.com/mfuhrmann/spieli/issues/776)). It then checks the classification `CASE` still reads `has_equipment AND has_info` and has not taken `has_photo` back as an input. `app/src/lib/completeness.js` is one of the workflow's path triggers, so a change to the JS half alone still runs it.

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
| `mappingDetail.noDetails` | keine Details | no details yet |
| `mappingDetail.hasPhoto` | hat ein Foto | has a photo |
| `completeness.restrictedHint` | nicht öffentlich | not public |

`completeness.restrictedHint` stays in its old namespace — access restriction is a separate axis from mapping detail.

The filter labels under `filter.mappingDetail.*` use the same wording (`detailliert` / `grundlegend` / `keine Details`); the filter keys themselves (`showComplete`, `showPartial`, `showMissing`) keep the identifier naming.
