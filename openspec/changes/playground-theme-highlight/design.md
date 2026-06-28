## Context

`playground:theme=*` lives on two object types in OSM, ~50/50: the playground area (`leisure=playground`) and individual equipment nodes (`playground=*`, e.g. spring rockers shaped like a horse). spieli already reads the device path in `equipmentAttributes.js:42` (plain text line), but the playground-area path is never plumbed into the polygon API, and there are no symbols or i18n labels. This change makes theme a playground-level **visual highlight** in the details panel.

## Goals

- Theme reads as a playful, kid-facing **highlight** at the playground level — a row of symbols — distinct from the utilitarian completeness colour language.
- Honest attribution: device-level themes stay attached to the device; the playground row is an *aggregate*, never an over-claim that the whole area is one theme.
- Robust to OSM's open, long-tailed theme vocabulary.

## Two visual tiers, one icon set

```
 ┌─ Spielplatz Sonnenwiese ─────────────────────────┐
 │  Spielplatz Sonnenwiese            ● complete     │
 │  🚢  🐴  🏰                                       │  ◄── playground theme row
 │  ─────────────────────────────────────────────── │      (aggregated + deduped)
 │  Equipment                                        │
 │   ├─ 🚢  Climbing ship                            │  ◄── inline device symbol
 │   ├─ 🐴  Spring rider                             │      (same icon, smaller)
 │   ├─ ◦   Swing                                    │
 │   └─ ◦   Sandpit                                  │
 └───────────────────────────────────────────────────┘
```

The same symbol appears at both tiers on purpose: big/aggregated at the playground level (the highlight), small/inline at the device level (the fact). One curated icon map drives both.

## Decisions

### Aggregation (playground row)

- Source = area-tag theme(s) ∪ device themes within the playground.
- Filter out `playground`, `play` (mistags/noise).
- Dedupe by theme value.
- Sort: area themes first, then device themes by frequency.
- Cap 4, overflow `+N`.

Rationale: a playground commonly has multiple themed devices; a single label would be misleading. Capping keeps the header calm.

### Icon set: custom SVG (recommended) vs emoji

| | Emoji | Custom SVG line-icons |
|---|---|---|
| Cost | free | ~15 icons to draw |
| Consistency | varies per OS | uniform |
| On-brand | clashes with clean UI | matches `bi bi-*` language |
| A11y | needs aria-label anyway | needs aria-label anyway |

Recommendation: **custom SVG** for the shipped highlight; emoji acceptable as a prototype to validate the layout first. Either way every symbol carries an accessible label (localised theme name, or raw value for the fallback glyph).

### Unknown values

Open vocabulary → a single generic "themed" glyph (e.g. a sparkle / star) plus the raw escaped value as the `title`/`aria-label`. Never drop an unknown theme silently; never invent a wrong icon for it.

### i18n

New `equipAttr.themes.*` block in de/en/fr/es. Keys = theme values (`ship`, `castle`, …). Missing key → raw value (existing `tl()` fallback pattern in `equipmentAttributes.js`). The existing `equipAttr.theme` line label is kept for the plain-text device attribute.

## Explicitly deferred

- **Map discovery.** The only map surface today is `HoverPreview` (desktop-only; mobile taps to BottomSheet), so hover-based theme display reaches none of the mobile/outdoor audience. A dedicated map-glyph layer is a separate change with no rework dependency on this one.
- **Theme filtering** ("castle playgrounds only").

## Risks

- **Data plumbing for the area path** may require an `api.sql` change (add `playground:theme` to `get_playgrounds_bbox` / `get_playground`) → `make db-apply` + `requires-schema-update`. The device path already returns it.
- Icon clutter on dense playgrounds — mitigated by the 4-symbol cap + dedupe.
