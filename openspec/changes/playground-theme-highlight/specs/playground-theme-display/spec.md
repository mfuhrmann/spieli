## ADDED Requirements

### Requirement: Area-level theme banner

When the playground's own area tag (`leisure=playground`) carries a `playground:theme=*` value, the details panel SHALL show a prominent banner near the top reading "{theme}-themed playground" (localised), with the theme's curated symbol. The banner represents that the whole playground is themed. No banner SHALL be shown when the area tag carries no theme.

#### Scenario: Area-themed playground shows banner
- **WHEN** a playground's area tag has `playground:theme=octopus`
- **THEN** the panel shows a banner with the octopus symbol and the text "Octopus-themed playground" (localised)

#### Scenario: Playground without an area theme shows no banner
- **WHEN** a playground has no `playground:theme` on its area tag (themes only on its devices, or none)
- **THEN** no banner is shown

### Requirement: Device-level theme chips

The panel overview SHALL show a deduped, ordered row of theme symbols aggregated from the playground's themed equipment, folded onto the Equipment header row as icon-only chips beside the "Equipment" label, ordered by descending frequency, capped at 4 with a `+N` overflow indicator. Area-level themes (shown in the banner) SHALL be excluded from this chip row. Only allowlisted theme values (see "Allowlisted theme vocabulary") SHALL appear; all non-allowlisted values — tagging noise and device-shape values — SHALL be excluded. No chip row SHALL be shown when no allowlisted device themes are present.

#### Scenario: Allowlisted device themes become chips, area theme excluded
- **WHEN** a playground's area tag is `playground:theme=octopus` and its devices carry `ship` (×2) and `castle`
- **THEN** the chip row shows one ship symbol and one castle symbol, and does not repeat the octopus symbol (which is in the banner)

#### Scenario: Device-shape values are excluded
- **WHEN** a playground's only themed devices carry `horse` and `duck` (spring-rider shapes, not allowlisted)
- **THEN** no chip row is shown

#### Scenario: Overflow capped
- **WHEN** the playground has 6 distinct allowlisted device themes
- **THEN** the chip row shows the first 4 symbols followed by a `+2` overflow indicator

### Requirement: Inline device theme symbol

Each themed equipment item SHALL show its theme symbol inline alongside its other attributes, using the same curated icon as the chips/banner for a given value. The existing plain-text theme line in equipment detail SHALL be retained. Unthemed devices SHALL show no symbol.

#### Scenario: Themed device shows matching symbol
- **WHEN** an equipment item has `playground:theme=ship` (an allowlisted value)
- **THEN** the item shows the ship symbol used elsewhere, plus the existing plain-text theme line

### Requirement: Only explicit tags, never inferred

A theme symbol SHALL be derived only from an explicit `playground:theme` tag — on the area or on a device. It SHALL NOT be inferred from device type (e.g. `playground=springy`), shape, or any other tag.

#### Scenario: Untagged spring rider shows no theme
- **WHEN** a device is `playground=springy` with no `playground:theme`
- **THEN** no theme symbol is shown for it and it does not contribute to the chip row

### Requirement: Allowlisted theme vocabulary

Theme symbols SHALL be drawn only from an allowlist of documented whole-playground theme values — `ship`, `castle`, `spiderweb`, `water`, `adventure`, `rocket`, `dragon`, `octopus`, `circus` — each mapping to a dedicated curated symbol. Any value not on the allowlist SHALL be excluded from the banner, the chip row, and the inline device symbol alike: this covers tagging noise (`playground`, `play`), **device-shape values** (`horse`, `duck`, `elephant`, … typically on `playground=springy` rockers, describing one device's shape rather than a playground theme), and long-tail one-offs. The allowlist SHALL be applied at a single choke point so every surface stays consistent. The allowlist is extended by adding a value+icon pair plus its localised labels, not by widening a fallback.

#### Scenario: Allowlisted value maps to dedicated symbol
- **WHEN** a theme value is `castle`
- **THEN** the dedicated castle symbol is rendered

#### Scenario: Non-allowlisted value is dropped
- **WHEN** a value is `horse` (a spring-rider shape) or `bible` (a long-tail one-off)
- **THEN** it is not rendered as a theme anywhere — no fallback glyph, no chip, no inline symbol

### Requirement: Localised theme labels and accessibility

Theme display names SHALL be localised via an `equipAttr.themes.*` block in de, en, fr, and es, with a missing translation falling back to the raw theme value. Every rendered symbol SHALL carry an accessible label (the localised theme name, or the raw escaped value for the fallback glyph).

#### Scenario: Missing translation falls back to raw value
- **WHEN** a theme value has no entry under `equipAttr.themes`
- **THEN** the symbol's accessible label is the raw theme value

### Requirement: Map unchanged

This capability SHALL NOT render any theme symbols on the map; theme highlighting is confined to the details panel.

#### Scenario: No theme symbols on the map
- **WHEN** a themed playground is visible on the map
- **THEN** no theme symbol is drawn on the map for it
