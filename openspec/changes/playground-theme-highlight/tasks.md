## Tasks

### Data plumbing

- [x] Confirmed `playground:theme` already reaches the frontend on both the polygon (`get_playgrounds_bbox`/`get_playground`) and equipment (`get_equipment`) via the `hstore_to_jsonb(tags)` merge — not an osm2pgsql column, so not stripped. No `api.sql` change, no `requires-schema-update`.

### Icon set + i18n

- [x] Allowlisted symbol set (`playgroundThemes.js` `THEME_ICONS`) = the 9 documented whole-playground themes (`ship, castle, spiderweb, water, adventure, rocket, dragon, octopus, circus`); the icon map *is* the allowlist. `FALLBACK_ICON` retained only as a defensive backstop, never rendered for non-allowlisted values (revised — was originally a count ≥ 15 curated set + generic fallback)
- [x] Emoji chosen over custom SVG (zero assets, instantly readable); SVG noted as future polish
- [x] Helpers: `themeIcon`, `themeName`, `themeOf` (per-device), `areaThemesOf` (area), `aggregatePlaygroundThemes`; `splitThemes` is the single allowlist choke point
- [x] `equipAttr.themes.*` across de/en/fr/es (incl. `circus`) + `details.themedPlayground` banner key + `details.themes` aria label

### Area-level theme banner

- [x] `areaTheme` reactive in `PlaygroundPanel`; prominent banner "{theme}-themed playground" at top of panel body, both header modes
- [x] Symbol + localised label; non-allowlisted area values carry no banner
- [x] No banner when the area tag carries no theme

### Device-level theme chips + inline symbols

- [x] Device chip row folded onto the Equipment header in the overview (icon-only, left-hugging the label); area themes excluded, allowlist-filtered, deduped, frequency-sorted, cap 4 + `+N` (revised — originally a row inside the collapsible Equipment section)
- [x] Inline symbol on themed equipment items in `EquipmentList.svelte` (device, fitness, pitch, group children) and `EquipmentTooltip.svelte`
- [x] Existing plain-text theme line retained (`equipmentAttributes.js` untouched)
- [x] Symbols derived only from explicit `playground:theme` — never inferred

### Equipment summary relocation (folded in)

- [x] `lib/equipmentSummary.js` `summarizeEquipment(features, groups)` — dedupe by osm_id, count grouped children
- [x] Count summary rendered in `PlaygroundPanel` overview (under quick-facts grid); removed from `EquipmentList` (+ dead count vars and `summary-list` CSS)

### Verify

- [x] Unit tests: `playgroundThemes.test.js` (aggregation/dedupe/sort/allowlist filtering) — pass
- [x] Production build + `make docker-build` clean
- [x] Manual on :8080 against real Fulda data — allowlisted device chip (`#W1287838389` ship → 🚢 on Equipment header), non-allowlisted dropped (`#W1190164411` horse/duck springy → no chips), inline symbols

### Follow-up polish (open)

- [x] General-info / overview structure cleanup — theme chips folded onto the Equipment header (icon-only, hugging the label), removing the standalone Themes section and its extra header
- [ ] German banner wording review ("…-Motto" vs "…-Themenspielplatz" vs "im …-Stil")
- [ ] Decide count-summary behaviour during equipment load (show vs wait)
