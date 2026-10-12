## Why

The map currently leads with OSM data quality: cluster rings are segmented green/slate by mapping detail, polygons are coloured by it, and the legend explains it. Most visitors are parents looking for a place to play, not OpenStreetMap contributors, so the default view should be about **finding playgrounds**. Mapping detail stays available for contributors, one tap away (#924; hide-by-default was the planned follow-up to #733).

## What Changes

- New **mapping-detail toggle** button next to the Info and Filter buttons. Default **off**; the choice is remembered per viewer (localStorage).
- The mapping-detail filters (detailed / basic / no details yet) move out of the Filter panel into the toggle's popover, together with the legend. While mapping detail is off they are **ignored**, so a filter the visitor cannot see never hides playgrounds.
- With mapping detail **off**:
  - Cluster rings render as one filled neutral circle (warm orange, white count and border) instead of completeness segments; single-playground clusters render as the same-coloured dot.
  - Above `clusterMaxZoom` (polygon tier) each playground is drawn as a **pin** — the round cluster shape with a small pointer at the bottom — at its interior point, instead of a coloured polygon. The photo glyph moves onto the pin.
  - The selected playground's polygon is outlined (desktop panel open), so its extent is still visible.
  - Hub macro rings render neutral too.
  - The completeness legend is not shown on the map.
- With mapping detail **on**: current behaviour, unchanged.
- No data, API or schema change. Wire values (`complete`/`partial`/`missing`) unchanged.

## Capabilities

### New Capabilities
- `mapping-detail-view`: the opt-in toggle, its persistence, where the mapping-detail filters and legend live, and how the neutral (finder) rendering looks at each tier.

### Modified Capabilities
- `tiered-playground-delivery`: "Clusters are rendered as completeness-segmented stacked rings" and "Client orchestrates two layers by zoom" become conditional on mapping detail being on; with it off, clusters are neutral and the polygon tier renders pins.
- `federated-playground-clustering`: "Hub renders a country-level macro view" — macro rings are neutral while mapping detail is off.

## Impact

- **Frontend only.** `app/src/lib/clusterStyle.js`, `app/src/lib/vectorStyles.js`, `app/src/lib/completenessPalette.js` (neutral colour tokens), `app/src/components/Map.svelte`, `FilterPanel.svelte`, `FilterChips.svelte`, `CompletenessLegend.svelte`, `AppShell.svelte`, `app/src/hub/MacroView.svelte`, `app/src/stores/filters.js`; new store `app/src/stores/mappingDetail.js` and a new toggle component.
- **Hub filter fan-out** (`hubOrchestrator`, `macroFiltered`, `macroCoverage`): mapping-detail filters must not count as active while the toggle is off.
- **i18n**: new strings in `locales/en.json` + `locales/de.json` only.
- **Tests**: unit tests for filter semantics and the neutral renderer; Playwright for toggle, persistence and pin rendering.
- **Docs**: `docs/user-guide.md`, `docs/reference/completeness.md`, `docs/contributing/frontend-guide.md`, CLAUDE.md store table.
- No release labels needed (no schema, env, compose or import change).
