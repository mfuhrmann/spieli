## Context

`playground:theme=*` lives on two object types in OSM, ~50/50: the playground area (`leisure=playground`) and individual equipment nodes (`playground=*`, e.g. spring rockers shaped like a horse). spieli already reads the device path in `equipmentAttributes.js:42` (plain text line), but the playground-area path is never plumbed into the polygon API, and there are no symbols or i18n labels. This change makes theme a playground-level **visual highlight** in the details panel.

## Goals

- Theme reads as a playful, kid-facing **highlight** at the playground level — a row of symbols — distinct from the utilitarian completeness colour language.
- Honest attribution: device-level themes stay attached to the device; the playground row is an *aggregate*, never an over-claim that the whole area is one theme.
- Restricted to an **allowlist** of documented whole-playground themes; OSM's device-shape values (spring-rider shapes) and tagging noise are dropped, so the highlight stays meaningful.

## Two visual tiers, one icon set

```
 ┌─ Spielplatz Sonnenwiese ─────────────────────────┐
 │  Spielplatz Sonnenwiese            ● complete     │
 │  ...                                              │
 │  Equipment   🚢  🏰                               │  ◄── theme chips folded onto
 │  8 pieces of equipment   1 bench                  │      the Equipment header
 │  ─────────────────────────────────────────────── │      (aggregated + deduped)
 │   ├─ 🚢  Climbing ship                            │  ◄── inline device symbol
 │   ├─ ◦   Spring rider (theme=horse → dropped)     │      (same icon, smaller)
 │   ├─ ◦   Swing                                    │
 │   └─ ◦   Sandpit                                  │
 └───────────────────────────────────────────────────┘
```

The same symbol appears at both tiers on purpose: aggregated icon-only chips on the Equipment header (the highlight), small/inline at the device level (the fact). One allowlisted icon map drives both. A `playground=springy` shaped like a horse carries `playground:theme=horse`, which is **not** allowlisted, so it contributes no chip and no inline symbol.

## Decisions

### Aggregation (playground row)

- Source = area-tag theme(s) ∪ device themes within the playground.
- Keep only allowlisted values (this drops mistags like `playground`/`play` and device-shape values like `horse`/`duck` in one step).
- Dedupe by theme value.
- Sort: area themes first, then device themes by frequency.
- Cap 4, overflow `+N`.

Rationale: a playground commonly has multiple themed devices; a single label would be misleading. Capping keeps the header calm.

### Icon set: emoji

Shipped with **emoji**, one per allowlisted value. The allowlist (9 values) is small and stable, so per-OS emoji variance is a non-issue and no custom assets are needed; the icon map *is* the allowlist, so adding a theme is a one-line change (value → emoji, plus localised labels). Every symbol still carries an accessible label (the localised theme name). Custom SVG line-icons remain a possible future polish, not a blocker.

### Non-allowlisted values

Dropped — no chip, no inline symbol, no banner. There is **no** generic fallback glyph: with a curated allowlist an unrecognised value is far more likely device-shape noise (a horse rocker) than a real theme we lack an icon for, so rendering a sparkle would add noise, not signal. `FALLBACK_ICON` stays in code only as a defensive backstop for a newly allowlisted value that is temporarily missing an icon.

### i18n

New `equipAttr.themes.*` block in de/en/fr/es. Keys = theme values (`ship`, `castle`, …). Missing key → raw value (existing `tl()` fallback pattern in `equipmentAttributes.js`). The existing `equipAttr.theme` line label is kept for the plain-text device attribute.

## Explicitly deferred

- **Map discovery.** The only map surface today is `HoverPreview` (desktop-only; mobile taps to BottomSheet), so hover-based theme display reaches none of the mobile/outdoor audience. A dedicated map-glyph layer is a separate change with no rework dependency on this one.
- **Theme filtering** ("castle playgrounds only").

## Risks

- **Data plumbing for the area path** may require an `api.sql` change (add `playground:theme` to `get_playgrounds_bbox` / `get_playground`) → `make db-apply` + `requires-schema-update`. The device path already returns it.
- Icon clutter on dense playgrounds — mitigated by the 4-symbol cap + dedupe.
