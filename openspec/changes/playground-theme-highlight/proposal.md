## Why

OSM's `playground:theme=*` describes a playground's (or a single device's) thematic flavour — ship, castle, spiderweb, horse, water, … These themes are spieli's most *fun*, kid-facing attribute: a pirate ship is a reason to visit a playground. Today spieli surfaces theme only as a plain text line in equipment detail (`equipmentAttributes.js:42`), with no i18n labels and no symbols — and even that rarely fires because the playground-level tag is never plumbed into the polygon API.

This change makes theme a **first-class visual highlight at the playground level** in the details panel, with a curated symbol set.

### Data reality (taginfo, ~30k uses)

`playground:theme` splits almost 50/50 between two objects:

| Co-occurs with | Share | Meaning |
|---|---|---|
| `leisure` (whole playground) | 51.8% | area-level theme |
| `playground` (equipment node) | 47.9% | single themed device |

Top real values: `ship` (1552), `castle` (1419), `spiderweb` (1166), `water` (1096), `adventure` (1037), `horse` (683), `swing` (407), `house` (388), `train` (340), `car` (295), `elephant` (195), `motorcycle` (161), `dog` (125). The long tail (`horse`, `motorcycle`, `elephant`, `dog`, `car`) is clearly **device-level** (spring rockers). The vocabulary is **open and long-tailed** — not the wiki's tidy 9. Values `playground` and `play` are noise/mistags and are ignored.

Consequence: a single playground often carries **several** themes at once (a horse rocker + a ship climber). The playground-level highlight must be an **aggregated, deduped set of symbols**, not a single label.

## What Changes

Two distinct treatments, reflecting that a theme is either an *area-level* statement ("this is an octopus playground") or a *device-level* fact ("this rocker is a horse"):

- **Area-level theme banner** in `PlaygroundPanel`: when the `leisure=playground` area tag carries `playground:theme`, a prominent banner near the top reads "{theme}-themed playground" with the curated symbol.
- **Device-level theme chips** in the Equipment section: a deduped, frequency-ordered row of symbols aggregated from themed devices (area themes excluded — the banner owns them), capped at 4 + `+N`.
- **Inline device symbol** on each themed equipment item / tooltip, beside the existing attributes (surface, material, …). Same curated icon as the chips/banner.
- **Curated symbol set** covering the taginfo values with count ≥ 15 that have a sensible glyph, plus spelling/synonym aliases, with a generic fallback glyph + raw (escaped) label for unknown long-tail values.
- **i18n**: `equipAttr.themes.*` (de, en, fr, es) for theme names + `details.themedPlayground` banner phrasing; the existing `equipAttr.theme` line stays.
- **Only explicit `playground:theme`** drives symbols — never inferred from device type/shape.

Folded in (same PR): **equipment count summary relocated** from inside the Equipment section up to the panel overview (`equipment-summary-overview` capability), so devices/benches/picnic counts read at a glance and the Equipment section is left to chips + the detailed list. Count logic extracted to `lib/equipmentSummary.js`.

### Aggregation rule (device chips)

1. Collect themes from all themed equipment within the playground.
2. Drop noise values `playground`, `play`, `playlot`.
3. Exclude any value already shown in the area banner.
4. Dedupe identical themes (three horses → one 🐴).
5. Sort device themes by descending frequency.
6. Cap at 4 symbols; overflow renders as `+N`.

## Capabilities

### New Capabilities

- `playground-theme-display`: A playground shows an area-level theme banner and a device-level theme chip row in the details panel; individual themed devices show their theme symbol inline.
- `equipment-summary-overview`: The equipment count summary moves from the Equipment section into the panel overview.

### Modified Capabilities

*(none — no existing spec-level requirement changes; the current plain-text theme line in equipment detail is retained.)*

## Scope: v1 is panel-only

- **No map discovery in v1.** Themes are a *reward for tapping*, not a *magnet for tapping*. The only existing map surface is `HoverPreview`, which is **desktop-only** (mobile uses tap → BottomSheet) — so theme-on-hover would reach zero of the mobile/outdoor users who most need discovery. A proper map-glyph discovery layer is deferred to a separate change; it is fully separable and requires no rework here.

## Impact

- **Frontend**: `PlaygroundPanel.svelte` (new theme row), `EquipmentList.svelte` / `EquipmentTooltip.svelte` (inline device symbol), `equipmentAttributes.js` (theme already read; reuse), new icon assets, i18n files (de/en/fr/es).
- **Data plumbing (separate concern, assumed available)**: `playground:theme` must reach the frontend on **both** the playground polygon (`get_playgrounds_bbox` / `get_playground`) and equipment (`get_equipment` already returns it via the device path). May need an `api.sql` change → `make db-apply` + `requires-schema-update` label if the polygon path is added here.
- No new runtime dependencies (icons are static assets).

## Open Questions

- **Emoji vs custom SVG** for the symbol set. Emoji = free, instant, but inconsistent across OS and off-brand. Custom line-icons match the existing `bi bi-*` language but need ~15 drawn. Recommendation: custom SVG for the shipped highlight; emoji acceptable for a prototype.
- Whether area-level themes get visual priority (larger / always-first) over device-derived themes in the row.

## Out of Scope

- Map-level theme glyphs / discovery layer (separate future change).
- Theme-based filtering ("show only castle playgrounds") — a power-user discovery feature, deferred.
- Normalising/curating the OSM long-tail vocabulary upstream.
