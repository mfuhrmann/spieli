## Why

[GitHub issue #727](https://github.com/mfuhrmann/spieli/issues/727) asks for a filter and chip surfacing playgrounds "usable for disabled persons", tagged `wheelchair=yes` on a playground **and/or** on a device.

Most of this is already shipped: the `wheelchair` filter toggle, the removable chip, the FilterPanel entry, de/en/fr/es i18n, the server `filter_wheelchair` parameter, and completeness credit all exist today. The feature has two real gaps hiding inside the existing `for_wheelchair` definition (`importer/api.sql:232`):

1. **Source too narrow.** `for_wheelchair` is aggregated only from *equipment* tags (`e.tags->'wheelchair'`). A playground **polygon** tagged `wheelchair=yes` with no wheelchair-tagged device is invisible to the filter — exactly the "on a playground" half the issue names.
2. **Value set too narrow.** The rule is `wheelchair = 'yes'` only. It drops `wheelchair=limited` and `wheelchair=designated`. On `leisure=playground` objects (taginfo), `limited` is 5,715 vs `yes` 10,490 — excluding it hides ~1/3 of accessible-ish playgrounds. `HoverPreview.svelte:18` already treats `yes`+`limited` as accessible, so the app is internally inconsistent today.

## What Changes

- Widen `for_wheelchair` in `get_playground_stats` (`importer/api.sql:232`) to:
  - Match the **playground polygon's own** `wheelchair` tag (`pl.tags->'wheelchair'`), not just devices.
  - Accept `IN ('yes','limited','designated')` instead of `= 'yes'` on both sources.
- No frontend changes — filter, chip, FilterPanel, i18n (de/en/fr/es), and `matchesFilters` (`for_wheelchair`) already consume the boolean.
- No import change — `osmium tags-filter` keeps all tags of matched objects into the hstore, so the `wheelchair` tag is already present on both playgrounds and devices.

## Root Cause

`for_wheelchair` was authored as a device-only, strict-`yes` aggregate. The issue's "and/or on a playground" source and the real-world dominance of `limited` were never covered.

## Capabilities

### Modified Capabilities

- `wheelchair-accessibility-filter`: the wheelchair filter now flags a playground when either the playground area **or** any contained device carries `wheelchair` in `{yes, limited, designated}`.

## Impact

- **`importer/api.sql`**: `get_playground_stats` `for_wheelchair` definition only. Functions are dropped/recreated — no schema migration. `make db-apply` required after deploy → PR label `requires-schema-update`.
- **Completeness ripple (accepted):** `for_wheelchair` feeds `has_equipment` (`api.sql:289`, mirrored `completeness.js:38`). A playground with *only* `wheelchair=yes` and nothing else now counts as having equipment → bumps `missing`→`partial`. Rare, defensible (accessibility is real info). No mirror change needed: the client reads the server's `for_wheelchair` boolean, it does not recompute the tag.
- No frontend code, no i18n, no new dependencies.

## Out of Scope

- **Sensory-disability filters** (`blind`, `deaf`, `tactile_paving`, `sign_language`): absent from the top tag combinations on `leisure=playground` → a filter that always returns empty. Deferred until OSM coverage justifies it.
- **`wheelchair:description`** free-text: not surfaced here (detail-panel concern, separate).
- **Distinguishing `limited` from `yes` in the UI**: the boolean filter treats them equally (matching HoverPreview); nuance stays visible via the existing equipment tooltip / detail panel which already renders yes/limited/no distinctly (`equipmentAttributes.js:77`).
