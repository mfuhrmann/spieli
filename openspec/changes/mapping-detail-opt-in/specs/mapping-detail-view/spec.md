## ADDED Requirements

### Requirement: Mapping detail is an opt-in view

The map SHALL offer a mapping-detail toggle control placed next to the Info and Filter buttons, in both standalone and hub mode. Mapping detail SHALL be off by default. The toggle state SHALL be persisted per viewer in browser storage and restored on the next visit; when storage is unavailable or throws, the map SHALL render with mapping detail off and the toggle SHALL still work for the session.

#### Scenario: Same control on phones and desktop

- **WHEN** the map is shown at a phone viewport (< 1024 px) or a desktop viewport
- **THEN** the mapping-detail control is present next to the Info and Filter buttons in both

#### Scenario: First visit shows the finder map

- **WHEN** a visitor opens the map with no stored preference
- **THEN** mapping detail is off
- **AND** the toggle control is visible next to the Info and Filter buttons with `aria-pressed="false"`

#### Scenario: Preference survives a reload

- **WHEN** the visitor switches mapping detail on and reloads the page
- **THEN** mapping detail is on after the reload
- **AND** the toggle control has `aria-pressed="true"`

#### Scenario: Storage unavailable

- **WHEN** reading or writing browser storage throws
- **THEN** the map renders with mapping detail off
- **AND** switching it on changes the rendering for the current session without an error

### Requirement: Link parameter opens the map with mapping detail on or off

A `detail` query parameter SHALL set mapping detail for the page load: `detail=1` on, `detail=0` off, any other value ignored. It SHALL override the stored preference without overwriting it, and SHALL compose with region paths and deeplink hashes. Toggling the control SHALL persist the new preference and update the parameter in the address bar without a reload. While mapping detail is on, the playground share link SHALL include `detail=1`.

#### Scenario: Contributor link turns detail on

- **WHEN** a visitor with no stored preference opens `/fulda?detail=1#W123`
- **THEN** mapping detail is on, the region framing and the deeplink selection both apply
- **AND** after removing the parameter and reloading, mapping detail is off again (the stored preference was not changed)

#### Scenario: Parameter overrides a stored preference

- **WHEN** the stored preference is on and the visitor opens a URL with `detail=0`
- **THEN** mapping detail is off for that page load

#### Scenario: Toggling updates the address bar

- **WHEN** the page was opened with `detail=1` and the visitor switches mapping detail off
- **THEN** the address bar shows `detail=0` without a page reload
- **AND** the stored preference is off

#### Scenario: Share link carries the view

- **WHEN** mapping detail is on and the visitor uses the share button on a playground
- **THEN** the shared URL contains `detail=1` and the playground hash
- **WHEN** mapping detail is off
- **THEN** the shared URL contains no `detail` parameter

### Requirement: Mapping-detail filters and legend live in the toggle control

The detailed / basic / no-details-yet filters and the mapping-detail legend SHALL be presented in the mapping-detail control, not in the general Filter panel. While mapping detail is off, these filters SHALL be ignored for rendering, for server-side filter parameters, for active-filter counts and chips, and for hub macro aggregates. Their stored values SHALL be preserved and take effect again when mapping detail is switched back on.

#### Scenario: Filter panel no longer lists mapping detail

- **WHEN** the visitor opens the Filter panel
- **THEN** it contains no detailed / basic / no-details-yet options

#### Scenario: Hidden state is ignored while off

- **WHEN** mapping detail is on, the visitor hides "no details yet", then switches mapping detail off
- **THEN** playgrounds with no details are shown again
- **AND** the next `get_playground_clusters` request carries no `filter_missing` parameter
- **AND** the filter badge and chips do not count or show the hidden state

#### Scenario: Hidden state returns when switched back on

- **WHEN** the visitor then switches mapping detail on again
- **THEN** "no details yet" is still hidden and playgrounds without details are filtered out again

#### Scenario: Legend only with mapping detail on

- **WHEN** mapping detail is off
- **THEN** no completeness legend is shown on the map
- **WHEN** mapping detail is on
- **THEN** the legend is available as today

### Requirement: Finder rendering uses one neutral colour at every tier

While mapping detail is off, playgrounds SHALL be drawn without any completeness colour coding, in a single neutral emerald palette defined alongside the completeness palette.

#### Scenario: Cluster tier

- **WHEN** mapping detail is off and the cluster tier is active
- **THEN** each multi-playground cluster is a filled emerald disc with a white border and the total count in white, sized by the same count scale as the completeness rings
- **AND** no completeness segments are drawn

#### Scenario: Single-playground cluster is a pin

- **WHEN** mapping detail is off and a cluster has `count = 1`
- **THEN** it renders as the pin marker, not as a completeness-coloured dot

#### Scenario: Polygon tier shows pins

- **WHEN** mapping detail is off and the zoom is above `clusterMaxZoom`
- **THEN** each playground renders as one pin — a round disc with a small pointer at the bottom whose tip is anchored at the playground's interior point
- **AND** playground polygons are not filled or outlined
- **AND** clicking or hovering a pin selects / previews that playground as clicking its polygon does today

#### Scenario: Photo signal on the pin

- **WHEN** mapping detail is off and a playground has a photo signal
- **THEN** its pin carries the camera glyph

#### Scenario: Selected playground shows its extent

- **WHEN** mapping detail is off and a playground is selected
- **THEN** its polygon is outlined in the neutral palette beneath its pin

#### Scenario: No mapping-detail reading outside the map either

- **WHEN** mapping detail is off and a playground's detail panel is open
- **THEN** the panel shows no detailed / basic / no-details-yet badge
- **AND** the nearby-playgrounds list marks entries in the finder colour rather than by completeness
- **WHEN** mapping detail is on
- **THEN** the badge and the completeness dots are shown as before

#### Scenario: Mapping detail on is unchanged

- **WHEN** mapping detail is on
- **THEN** clusters, polygons, the photo glyph and macro rings render exactly as before this change
