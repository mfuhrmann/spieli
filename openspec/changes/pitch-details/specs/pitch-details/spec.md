## ADDED Requirements

### Requirement: Standalone pitches are selectable

In standalone mode, clicking or tapping a standalone pitch (a feature with `leisure=pitch` on the "pitches outside playgrounds" layer) SHALL select it and open the pitch panel in the same place the playground panel opens. A click that hits a playground SHALL still select the playground. Other features on the pitch layer (benches, shelters) SHALL NOT be selectable.

#### Scenario: Desktop click opens the panel

- **WHEN** the pitch layer is on and the user clicks a pitch's pin or polygon on desktop
- **THEN** the pitch panel opens in the side panel
- **AND** the map fits the pitch
- **AND** the URL hash becomes `#P<osm_id>`

#### Scenario: Phone tap opens the full-screen panel

- **WHEN** the user taps a pitch on a phone
- **THEN** the full-screen detail panel opens with "Back to map"
- **AND** "Back to map" closes it and clears the hash

#### Scenario: Pitch click no longer clears the selection

- **WHEN** a playground is selected and the user clicks a pitch
- **THEN** the pitch becomes the selection (the playground panel closes, the pitch panel opens)
- **AND** clicking empty map still clears the selection

#### Scenario: Only one thing is open

- **WHEN** a pitch is selected
- **THEN** no playground panel content (equipment, reviews, nearby playgrounds) is fetched or shown

### Requirement: Pitch panel content

The pitch panel SHALL show the pitch's title (OSM name, else a label for its sport), its sports, and — each only when tagged — surface, lighting, access / fee / reservation, opening hours, basketball hoops, wheelchair accessibility and operator, plus Panoramax and Commons photos when tagged. It SHALL offer "Take me there", a share link and an edit link. A field that is not tagged SHALL NOT be shown as unknown.

#### Scenario: Well-tagged pitch

- **WHEN** a pitch has `sport=soccer`, `surface=artificial_turf`, `lit=yes`, `access=yes`
- **THEN** the panel shows a football sport chip, "Artificial turf", "Lit" and "Public"

#### Scenario: Lighting with times

- **WHEN** a pitch has `lit=sunset-23:00`
- **THEN** the lighting row reads "Lit sunset–23:00"

#### Scenario: Sparse pitch

- **WHEN** a pitch has only `leisure=pitch` and `sport=basketball`
- **THEN** the panel shows the title "Basketball court", the sport chip and the action links
- **AND** no surface, lighting or access row is rendered

#### Scenario: Multi-sport pitch

- **WHEN** a pitch has `sport=soccer;basketball`
- **THEN** two sport chips are shown

#### Scenario: Photos

- **WHEN** a pitch has a `panoramax` tag
- **THEN** the Panoramax thumbnail is shown and opens the viewer on request, as for playgrounds

### Requirement: Pitch deeplinks

A selected pitch SHALL be shareable as `#P<osm_id>` in standalone mode. Opening such a link — or its slug form `#<slug>/P<osm_id>`, accepted like the playground slug form — SHALL load the pitch through `get_pitch(osm_id)`, switch the pitch layer on, select the pitch and frame it. In hub mode a pitch hash SHALL be ignored without error.

#### Scenario: Shared pitch link

- **WHEN** a visitor opens `/#P123` and pitch 123 is a standalone pitch
- **THEN** the pitch panel opens for it and the map is framed on it
- **AND** the pitch layer is switched on

#### Scenario: Unknown or non-standalone pitch

- **WHEN** `get_pitch` returns null (no such pitch, or it lies inside a playground)
- **THEN** the map opens normally without a panel

#### Scenario: Backend without get_pitch

- **WHEN** `get_pitch` answers 404
- **THEN** the map opens normally without a panel and a single warning is logged

### Requirement: Selected pitch is outlined

The selected pitch SHALL be outlined on the map while its panel is open, with its pin on top.

#### Scenario: Outline follows the selection

- **WHEN** a pitch is selected
- **THEN** its polygon is outlined
- **WHEN** the selection is cleared or moves to another feature
- **THEN** the outline is removed

### Requirement: Lighting in the playground panel

The playground panel SHALL show a lighting fact when the playground carries a `lit` tag, using the same wording as the pitch panel, and SHALL show nothing when it does not.

#### Scenario: Lit playground

- **WHEN** a playground has `lit=yes`
- **THEN** the panel shows "Lit"

#### Scenario: Untagged playground

- **WHEN** a playground has no `lit` tag
- **THEN** no lighting fact is shown

### Requirement: Pitch API

`get_standalone_equipment` SHALL include `access` and `operator` in each feature's properties. A new `get_pitch(osm_id)` RPC SHALL return the standalone pitch with that id as a GeoJSON Feature in the same property shape, or null.

#### Scenario: get_pitch for a standalone pitch

- **WHEN** `get_pitch` is called with the id of a standalone pitch way
- **THEN** it returns one Feature whose properties match that pitch's entry in `get_standalone_equipment`

#### Scenario: get_pitch for a pitch inside a playground

- **WHEN** it is called with the id of a pitch inside a playground
- **THEN** it returns null
