## Why

OSM's `playground:theme=*` describes a playground's (or a single device's) thematic flavour — ship, castle, spiderweb, horse, water, … These themes are spieli's most *fun*, kid-facing attribute: a pirate ship is a reason to visit a playground. Today spieli surfaces theme only as a plain text line in equipment detail (`equipmentAttributes.js:42`), with no i18n labels and no symbols — and even that rarely fires because the playground-level tag is never plumbed into the polygon API.

This change makes theme a **first-class visual highlight at the playground level** in the details panel, with a curated symbol set.

### Data reality (taginfo, ~30k uses)

`playground:theme` splits almost 50/50 between two objects:

| Co-occurs with | Share | Meaning |
|---|---|---|
| `leisure` (whole playground) | 51.8% | area-level theme |
| `playground` (equipment node) | 47.9% | single themed device |

Top values: `ship` (1552), `castle` (1419), `spiderweb` (1166), `water` (1096), `adventure` (1037), `horse` (683), `swing` (407), `house` (388), `train` (340), `car` (295), `elephant` (195), `motorcycle` (161), `dog` (125). But most of that volume is **not a playground theme**:

- **Tagging noise (~53%)**: `playground` (14.2k) and `play` (2.0k) are self-referential mistags.
- **Device-shape values**: `horse`, `duck`, `elephant`, `dog`, `car`, `motorcycle`, `swing`, … overwhelmingly sit on a single `playground=springy` rocker and describe *that device's shape*. A springy can be shaped as anything, so these are noise for a playground-level highlight.
- **Whole-playground themes (the real signal)**: `ship`, `castle`, `spiderweb`, `water`, `adventure`, `rocket`, `dragon`, `octopus`, `circus`.

Decision: honour an **allowlist** of the whole-playground theme values, not the open long tail. This keeps the highlight meaningful and never guesses an icon for an unknown value. A single playground can still carry **several** allowlisted themes (e.g. a ship climber + a spiderweb net), so the highlight is an **aggregated, deduped set of symbols**, not a single label.

## What Changes

Two distinct treatments, reflecting that a theme is either an *area-level* statement ("this is an octopus playground") or a *device-level* fact ("this rocker is a horse"):

- **Area-level theme banner** in `PlaygroundPanel`: when the `leisure=playground` area tag carries an allowlisted `playground:theme`, a prominent banner near the top reads "{theme}-themed playground" with the curated symbol.
- **Device-level theme chips** folded onto the **Equipment header** in the panel overview: a deduped, frequency-ordered row of icon-only symbols aggregated from themed devices (area themes excluded — the banner owns them), left-hugging the "Equipment" label, capped at 4 + `+N`.
- **Inline device symbol** on each themed equipment item / tooltip, beside the existing attributes (surface, material, …). Same curated icon as the chips/banner.
- **Allowlisted symbol set** (`ship, castle, spiderweb, water, adventure, rocket, dragon, octopus, circus`), each with a dedicated icon. Non-allowlisted values (noise, device shapes, long-tail) are dropped at a single choke point — no fallback glyph, so nothing misleading ever renders.
- **i18n**: `equipAttr.themes.*` (de, en, fr, es) for theme names + `details.themedPlayground` banner phrasing; the existing `equipAttr.theme` line stays.
- **Only explicit `playground:theme`** drives symbols — never inferred from device type/shape.

Folded in (same PR): **equipment count summary relocated** from inside the Equipment section up to the panel overview (`equipment-summary-overview` capability), so devices/benches/picnic counts read at a glance and the Equipment section is left to chips + the detailed list. Count logic extracted to `lib/equipmentSummary.js`.

### Aggregation rule (device chips)

1. Collect themes from all themed equipment within the playground.
2. Keep only allowlisted values (drops noise and device-shape values in one step).
3. Exclude any value already shown in the area banner.
4. Dedupe identical themes (two ships → one 🚢).
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

- **Frontend**: `lib/playgroundThemes.js` (allowlist + aggregation), `PlaygroundPanel.svelte` (theme chips folded onto the Equipment header), `EquipmentList.svelte` / `EquipmentTooltip.svelte` (inline device symbol), `equipmentAttributes.js` (theme already read; reuse), i18n files (de/en/fr/es). Symbols are emoji — no icon assets.
- **Data plumbing (separate concern, assumed available)**: `playground:theme` must reach the frontend on **both** the playground polygon (`get_playgrounds_bbox` / `get_playground`) and equipment (`get_equipment` already returns it via the device path). May need an `api.sql` change → `make db-apply` + `requires-schema-update` label if the polygon path is added here.
- No new runtime dependencies (icons are static assets).

## Resolved decisions

- **Emoji, not custom SVG.** With the vocabulary reduced to a 9-value allowlist, emoji are consistent enough and need no drawn assets; the icon map *is* the allowlist, so extension is a one-line change.
- **Area themes take priority** — they render as the top banner and are excluded from (and ordered before, when aggregated) device chips.
- **No generic fallback.** The allowlist removes the open long tail, so a non-allowlisted value is dropped rather than rendered with a placeholder glyph.

## Out of Scope

- Map-level theme glyphs / discovery layer (separate future change).
- Theme-based filtering ("show only castle playgrounds") — a power-user discovery feature, deferred.
- Normalising/curating the OSM long-tail vocabulary upstream.
