## Tasks

### Data plumbing

- [x] Confirmed `playground:theme` already reaches the frontend on both the polygon (`get_playgrounds_bbox`/`get_playground`) and equipment (`get_equipment`) via the `hstore_to_jsonb(tags)` merge — not an osm2pgsql column, so not stripped. No `api.sql` change, no `requires-schema-update`.

### Icon set + i18n

- [x] Curated symbol set (`playgroundThemes.js` `THEME_ICONS`) covering taginfo values count ≥ 15 with sensible glyphs + aliases (`airplane`, `motorbike`, `animals`, `pirate_ship`) + generic `FALLBACK_ICON`
- [x] Emoji chosen over custom SVG (zero assets, instantly readable); SVG noted as future polish
- [x] Helpers: `themeIcon`, `themeName`, `themeOf` (per-device), `areaThemesOf` (area), `aggregatePlaygroundThemes`
- [x] `equipAttr.themes.*` extended across de/en/fr/es (taginfo long-tail) + `details.themedPlayground` banner key + `details.themes` aria label
- [x] `playlot` added to the noise list

### Area-level theme banner

- [x] `areaTheme` reactive in `PlaygroundPanel`; prominent banner "{theme}-themed playground" at top of panel body, both header modes
- [x] Symbol + localised label; fallback glyph + raw value for unknowns
- [x] No banner when the area tag carries no theme

### Device-level theme chips + inline symbols

- [x] Device chip row at top of the Equipment section; area themes excluded, deduped, frequency-sorted, cap 4 + `+N`
- [x] Inline symbol on themed equipment items in `EquipmentList.svelte` (device, fitness, pitch, group children) and `EquipmentTooltip.svelte`
- [x] Existing plain-text theme line retained (`equipmentAttributes.js` untouched)
- [x] Symbols derived only from explicit `playground:theme` — never inferred

### Equipment summary relocation (folded in)

- [x] `lib/equipmentSummary.js` `summarizeEquipment(features, groups)` — dedupe by osm_id, count grouped children
- [x] Count summary rendered in `PlaygroundPanel` overview (under quick-facts grid); removed from `EquipmentList` (+ dead count vars and `summary-list` CSS)

### Verify

- [x] Unit tests: `playgroundThemes.test.js` (aggregation/dedupe/sort/noise/fallback) — pass
- [x] Production build + `make docker-build` clean
- [x] Manual on :8080 against real region data — area banner (`bible`), device chips + dedup (horse ×4 + duck), inline symbols, fallback glyph, alias (`airplane`→✈️)

### Follow-up polish (open)

- [ ] General-info / overview structure cleanup (layout of banner + quick facts + count summary)
- [ ] German banner wording review ("…-Motto" vs "…-Themenspielplatz" vs "im …-Stil")
- [ ] Decide count-summary behaviour during equipment load (show vs wait)
