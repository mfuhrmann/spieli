## Design & Decision Log

### Context: the feature is ~90% already shipped

A codebase sweep for issue #727 found the wheelchair filter fully wired end-to-end:

| Layer | Status | Location |
|---|---|---|
| Filter toggle | exists | `stores/filters.js` (`wheelchair: false`) |
| `matchesFilters` predicate | exists | `stores/filters.js:40` (`for_wheelchair`) |
| Removable chip | exists | `components/FilterChips.svelte:11` |
| FilterPanel entry (Accessibility icon) | exists | `components/FilterPanel.svelte:18` |
| i18n de/en/fr/es | exists | `locales/*.json` → `filter.labels.wheelchair` |
| Server filter param | exists | `importer/api.sql:466,524` (`filter_wheelchair`) |
| Completeness credit | exists | `lib/completeness.js:38` + `api.sql:289` |
| **Playground-area tag as a source** | **missing** | `api.sql:232` reads devices only |
| **`limited`/`designated` values** | **missing** | `api.sql:232` matches `= 'yes'` only |

So #727 reduces to closing the source + value gap in one aggregate expression.

### Decision 1 — value set: `{yes, limited, designated}`, not `{yes}`

Taginfo, `wheelchair` on `leisure=playground` (20,822 tagged objects):

```
wheelchair=yes        10,490
wheelchair=limited     5,715   ← 35% of positives, dropped by `= 'yes'`
no + designated + …   ~4,617
```

- `limited` is not a corner case on playgrounds — dropping it hides ~1/3 of accessible playgrounds.
- `HoverPreview.svelte:18` already counts `yes`+`limited` as accessible → including `limited` removes an existing app inconsistency rather than creating one.
- `designated` (global 0.5%) is strictly stronger than `yes`; free to include.
- The boolean filter cannot express the yes-vs-limited nuance, but it does not need to: the equipment tooltip and detail panel already render `yes`/`limited`/`no` distinctly (`equipmentAttributes.js:77`, `EquipmentTooltip.svelte:46`). Filter = "worth a look"; detail = the precise claim.

Trade-off accepted: a parent filtering on wheelchair may reach a `limited` playground. Judged better than hiding a third of real accessible sites behind a strict `yes`.

### Decision 2 — source: playground area OR device

The issue says "on a playground **and/or** on a device." Today only devices count. Add `pl.tags->'wheelchair'` as an OR source. `pl.tags` is already in scope in the same CTE (used for `has_fence`/`has_dogs`/`has_shade`, `api.sql:235-237`). No sandpit guard on the area branch — a bare `wheelchair=yes` on the whole area is a genuine accessibility claim, unlike a single sandpit device.

### Decision 3 — no sensory-disability filters (for now)

`blind`, `deaf`, `tactile_paving`, `sign_language` do not appear in the top tag combinations for `leisure=playground`. A filter over near-zero data is a permanently-empty UI. Deferred, not rejected — revisit if coverage grows.

### Decision 4 — no import change

`osmium tags-filter` (`import.sh:247`) is object-level: it keeps matched objects with **all** their tags into the hstore. The `wheelchair` tag on playgrounds and devices already reaches PostgreSQL; the fix is purely in the SQL aggregate. Verified the filter keeps `w/leisure=playground`, `w/playground`, `n/playground`, etc.

### Completeness ripple

`for_wheelchair` → `has_equipment` (`api.sql:289`, mirrored `completeness.js:38`). Widening the source means a playground whose *only* mapped attribute is `wheelchair=yes` now scores `has_equipment = true`, bumping `missing`→`partial`. Rare and defensible. The client mirror needs no edit — it consumes the server boolean, not the raw tag.
