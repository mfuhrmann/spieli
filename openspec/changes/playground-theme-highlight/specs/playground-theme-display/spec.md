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

The Equipment section SHALL show a deduped, ordered row of theme symbols aggregated from the playground's themed equipment, ordered by descending frequency, capped at 4 with a `+N` overflow indicator. Area-level themes (shown in the banner) SHALL be excluded from this chip row. Noise values `playground`, `play`, and `playlot` SHALL be excluded. No chip row SHALL be shown when no device themes are present.

#### Scenario: Device themes become chips, area theme excluded
- **WHEN** a playground's area tag is `playground:theme=ship` and its devices carry `horse` (×3) and `duck`
- **THEN** the Equipment section chip row shows one horse symbol and one duck symbol, and does not repeat the ship symbol (which is in the banner)

#### Scenario: Overflow capped
- **WHEN** the playground has 6 distinct device themes
- **THEN** the chip row shows the first 4 symbols followed by a `+2` overflow indicator

### Requirement: Inline device theme symbol

Each themed equipment item SHALL show its theme symbol inline alongside its other attributes, using the same curated icon as the chips/banner for a given value. The existing plain-text theme line in equipment detail SHALL be retained. Unthemed devices SHALL show no symbol.

#### Scenario: Themed device shows matching symbol
- **WHEN** an equipment item has `playground:theme=horse`
- **THEN** the item shows the horse symbol used elsewhere, plus the existing plain-text theme line

### Requirement: Only explicit tags, never inferred

A theme symbol SHALL be derived only from an explicit `playground:theme` tag — on the area or on a device. It SHALL NOT be inferred from device type (e.g. `playground=springy`), shape, or any other tag.

#### Scenario: Untagged spring rider shows no theme
- **WHEN** a device is `playground=springy` with no `playground:theme`
- **THEN** no theme symbol is shown for it and it does not contribute to the chip row

### Requirement: Curated symbols with generic fallback

Common theme values (the taginfo set with count ≥ 15 that have a sensible glyph, e.g. `ship`, `castle`, `spiderweb`, `water`, `horse`, `octopus`, `dolphin`, `dinosaur`, `airplane`, …) SHALL map to dedicated symbols, including spelling/synonym aliases (`airplane`→plane glyph, `motorbike`→motorcycle, `animals`→animal, `pirate_ship`→pirate). An unknown or long-tail value SHALL render a generic fallback symbol and SHALL never be dropped silently nor assigned a misleading icon.

#### Scenario: Known value maps to dedicated symbol
- **WHEN** a theme value is `castle`
- **THEN** the dedicated castle symbol is rendered

#### Scenario: Unknown value uses fallback
- **WHEN** a theme value is `bible` (not in the curated set)
- **THEN** the generic fallback symbol is rendered with `bible` as its accessible label / banner text

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
