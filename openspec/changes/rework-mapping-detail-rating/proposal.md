## Why

The three-tier completeness rating requires a photo (`panoramax` / `wikimedia_commons` / Wikimedia-hosted `image`) before a playground can reach `complete`. Photo tags are rare in OSM, so a playground with twelve mapped devices plus `surface` and `access` still renders amber — roughly 3k of Hessen's 5.5k playgrounds sit in that bucket ([#733](https://github.com/mfuhrmann/spieli/issues/733)). Combined with a traffic-light palette and the label "Data Quality: high / medium / low", the map reads as a verdict on the playground ("red = bad playground") rather than a statement about how much of it has been mapped. It misjudges the place and undersells the mapper who did the expensive survey work.

## What Changes

- **`hasEquipment` narrowed to play infrastructure**: `playground=*` objects plus soccer / basketball / table-tennis pitches. Street furniture (bench, shelter, picnic table) and the derived flags (`is_water`, `for_baby`, `for_toddler`, `for_wheelchair`) no longer count. With equipment as the pivot, a lone bench could otherwise carry a playground to the top bucket — 63 of 221 Fulda playgrounds registering as "has equipment" were carried by furniture alone.
- **Rating rule reworked**: equipment becomes the pivot, the photo becomes a bonus rather than a gate.
  - `detailed` = `hasEquipment AND hasInfo`
  - `basic` = `hasEquipment OR hasInfo`
  - `none` = neither
  - Applied identically in `app/src/lib/completeness.js` and the `playground_stats` matview in `importer/api.sql`.
- **Photo becomes an additive marker**, not a tier input: a camera glyph drawn at the playground's interior point, plus a legend line. No panel badge — the panel already shows the photos. Photo work stays visible and rewarded; its absence stops being a penalty.
- **Framing reworked**: "Data Quality" → "Mapping detail"; `high` / `medium` / `low` → `detailed` / `basic` / `not mapped yet`. The value describes the map, not the playground.
- **Palette reworked**: the diverging traffic light (green / yellow / red) is replaced by a sequential single-hue ramp — dark green → mid green → neutral grey. A sequential ramp reads as "more / less"; neutral grey for the zero case reads as "nothing here yet, help out" and links naturally into `DataContributionModal`.
- **Diagnostic columns exposed**: `playground_stats` gains `has_photo`, `has_equipment`, `has_info` as persisted columns so the `partial` breakdown is measurable before and after the rule change (Step 0 of the issue plan), and so future rating tweaks can be evaluated without a schema round-trip.
- **NOT changing**: the three-bucket wire shape `{count, complete, partial, missing}` stays as-is in `get_playground_clusters`, `get_playgrounds_bbox`, `get_meta` and the hub macro aggregate. Bucket *keys* remain `complete` / `partial` / `missing`; only their derivation rule and their user-facing label and colour change. No API break, no re-import.
- **Explicitly out of scope**: gold/silver/bronze metallics (low contrast on an OSM basemap, not colourblind-safe, and still *ranks* playgrounds — the same perception bug in nicer clothes); a four-tier scheme (changes the bucket tuple across `api.sql`, `api.js`, `clusterStyle.js`, `macroRingStyle`, `stores/filters.js`, `FilterChips`, `FilterPanel` and both hub aggregates for a fraction of the added benefit); the "artistic vividness" tier illustration.

## Capabilities

### New Capabilities

- `mapping-detail-rating`: how a playground's mapping detail is derived from its OSM tags, what the three buckets mean, how the photo signal is surfaced separately, and how the rating is labelled and coloured across polygon, cluster, macro-ring and legend surfaces. Covers the parity requirement between the JavaScript rule and the SQL matview.

### Modified Capabilities

<!-- None. `federated-playground-clustering` requires that macro ring colours match the
     playground polygon completeness colours; that requirement stays satisfied when both
     palettes move together. The bucket tuple it specifies is unchanged. -->

## Impact

**Database** (`requires-schema-update` — `make db-apply`, no re-import):
- `importer/api.sql`: `playground_stats` matview — `completeness` `CASE` (~`:326`) plus three new persisted boolean columns.

**Frontend**:
- `app/src/lib/completeness.js` — the rule (`:42`), and a new photo-signal export.
- `app/src/lib/vectorStyles.js:44-67` — polygon fills, strokes and hatch strokes; new camera glyph style.
- `app/src/lib/clusterStyle.js:15-19` — ring segment `COLOR` map.
- `app/src/hub/macroRingStyle.js` — macro ring palette.
- `app/src/components/CompletenessLegend.svelte` — labels and Badge variants (`success` / `warning` / `destructive` → neutral).
- `app/src/components/PlaygroundPanel.svelte` — photo badge.
- `app/src/components/FilterPanel.svelte`, `FilterChips.svelte` — filter labels only; `filterStore` keys `showComplete` / `showPartial` / `showMissing` are unchanged.

**i18n** (sequencing constraint): renames source strings and orphans existing translations. Only `locales/en.json` (Weblate source template) and `locales/de.json` may be hand-edited, in the same commit — every other locale belongs to Weblate. See `docs/contributing/translations.md`.

**Docs**: `docs/reference/api.md` (matview columns), `docs/contributing/import-pipeline.md` (rating rule), `CLAUDE.md` (the `completeness.js` ↔ `api.sql` mirror note).

**Tests**: `app/src/lib/completeness.test.js` and any snapshot covering legend labels or bucket colours.
