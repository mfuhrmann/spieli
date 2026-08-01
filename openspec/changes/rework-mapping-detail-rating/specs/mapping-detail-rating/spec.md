## ADDED Requirements

### Requirement: Mapping detail is derived from equipment and info, not from photos

The system SHALL classify every playground into exactly one of three mapping-detail buckets, derived from two signals: whether any equipment is mapped inside the playground area (`hasEquipment`) and whether descriptive tags are present (`hasInfo` — `surface`, `opening_hours`, or an `access` value other than `yes`). The presence or absence of a photo tag SHALL NOT affect the bucket.

The rule is:

- `complete` (labelled "detailed") — `hasEquipment AND hasInfo`
- `partial` (labelled "basic") — `hasEquipment OR hasInfo`
- `missing` (labelled "not mapped yet") — neither

The bucket keys `complete` / `partial` / `missing` are the wire and storage identifiers and SHALL NOT be renamed; only their derivation and their user-facing label change.

#### Scenario: Equipment and info without a photo classifies as detailed

- **WHEN** a playground has at least one mapped device, bench, pitch or other equipment item, and carries `surface=sand`
- **AND** it carries no `panoramax`, `wikimedia_commons` or Wikimedia-hosted `image` tag
- **THEN** its mapping detail is `complete`
- **AND** it renders with the `complete` fill and stroke

#### Scenario: Equipment alone classifies as basic

- **WHEN** a playground has mapped equipment but no `surface`, no `opening_hours` and no `access` other than `yes`
- **THEN** its mapping detail is `partial`

#### Scenario: Info alone classifies as basic

- **WHEN** a playground has `opening_hours` but no mapped equipment
- **THEN** its mapping detail is `partial`

#### Scenario: A photo alone does not lift the bucket

- **WHEN** a playground carries a `wikimedia_commons` tag but has no mapped equipment and no descriptive tags
- **THEN** its mapping detail is `missing`
- **AND** the photo is still surfaced by the separate photo marker requirement

#### Scenario: Bare playground classifies as not mapped yet

- **WHEN** a playground has neither mapped equipment nor any descriptive tag
- **THEN** its mapping detail is `missing`

### Requirement: The JavaScript rule and the SQL matview agree exactly

The mapping-detail rule SHALL be implemented identically in the client (`app/src/lib/completeness.js`) and in the `playground_stats` materialised view (`importer/api.sql`), so a feature classified client-side from Overpass data lands in the same bucket as the same feature classified server-side. Empty-string tag values SHALL be treated as absent on both sides.

#### Scenario: Same feature, same bucket on both sides

- **WHEN** a playground's tags are evaluated by the client rule and by the matview
- **THEN** both yield the same bucket for every combination of `hasEquipment` and `hasInfo`

#### Scenario: Empty-string tags are treated as absent

- **WHEN** a playground carries `surface=""` and no other descriptive tag and no equipment
- **THEN** both the client rule and the matview classify it as `missing`

### Requirement: Photo availability is surfaced as an additive marker

The system SHALL surface the presence of a photo (`panoramax`, `wikimedia_commons`, or a Wikimedia-hosted `image` tag) as a distinct additive marker rather than as an input to the mapping-detail bucket. The marker SHALL appear as a glyph on the playground polygon and as a badge in the playground detail panel.

#### Scenario: Photo glyph on a detailed playground

- **WHEN** a playground classifies as `complete` and carries a `panoramax` tag
- **THEN** the polygon renders the `complete` fill plus a camera glyph
- **AND** the detail panel shows a photo badge

#### Scenario: Photo glyph on a basic playground

- **WHEN** a playground classifies as `partial` and carries a `wikimedia_commons` tag
- **THEN** the polygon renders the `partial` fill plus a camera glyph

#### Scenario: No photo, no glyph

- **WHEN** a playground carries no photo tag
- **THEN** no camera glyph is rendered and no photo badge appears in the detail panel
- **AND** no penalty wording is shown

### Requirement: Mapping detail is presented as a sequential ramp, not a verdict

The system SHALL present mapping detail with a sequential single-hue ramp — dark green for `complete`, mid green for `partial`, neutral grey for `missing` — and SHALL NOT use a red / amber / green traffic light. The user-facing wording SHALL describe how much has been mapped ("Mapping detail": `detailed` / `basic` / `not mapped yet`) rather than grading the playground ("Data Quality": `high` / `medium` / `low`).

The same palette SHALL apply to every surface that renders the buckets: playground polygons, cluster ring segments, hub macro ring segments, and the legend.

#### Scenario: Legend shows the ramp and the new wording

- **WHEN** the map legend is opened
- **THEN** its title reads "Mapping detail" (de: "Erfasste Details")
- **AND** its three entries read `detailed`, `basic` and `not mapped yet`
- **AND** its swatches show dark green, mid green and neutral grey
- **AND** no red swatch appears anywhere in the legend

#### Scenario: Cluster rings use the same palette as polygons

- **WHEN** a cluster ring renders segments for `complete`, `partial` and `missing`
- **THEN** each segment colour equals the corresponding polygon fill base colour
- **AND** the `missing` segment is neutral grey

#### Scenario: Macro rings use the same palette

- **WHEN** the hub macro view renders a backend's stacked ring from its `get_meta` buckets
- **THEN** the segment colours match the polygon and cluster palette

#### Scenario: The not-mapped-yet bucket invites contribution

- **WHEN** a playground in the `missing` bucket is selected
- **THEN** the panel presents the state as an invitation to contribute rather than a defect
- **AND** the existing contribution entry point remains reachable

### Requirement: The rating inputs are queryable for evaluation

The `playground_stats` materialised view SHALL persist `has_photo`, `has_equipment` and `has_info` as boolean columns alongside the derived `completeness`, so the composition of each bucket can be measured directly without re-deriving the flags.

#### Scenario: Flags are queryable per playground

- **WHEN** an operator queries `playground_stats` after `make db-apply`
- **THEN** each row exposes `has_photo`, `has_equipment` and `has_info` as booleans
- **AND** the row's `completeness` value is consistent with the rule applied to `has_equipment` and `has_info`

#### Scenario: Bucket composition can be grouped

- **WHEN** an operator groups `playground_stats` by `completeness, has_photo, has_equipment, has_info`
- **THEN** the result reports how many playgrounds fall into each combination

### Requirement: The wire contract is unchanged

The change SHALL NOT alter the shape of any API response. `get_playground_clusters`, `get_playgrounds_bbox`, `get_playground`, `get_meta` and the hub macro aggregate SHALL keep emitting the `{count, complete, partial, missing, ...}` bucket tuple with the same field names, and the client filter keys `showComplete` / `showPartial` / `showMissing` SHALL be unchanged. Applying the change SHALL require `make db-apply` only — never a full re-import.

#### Scenario: Cluster response shape survives the change

- **WHEN** a client calls `api.get_playground_clusters(z, bbox)` after the change is applied
- **THEN** each bucket object still contains `lon`, `lat`, `count`, `complete`, `partial`, `missing` and `restricted`
- **AND** `count` still equals the sum of the state buckets

#### Scenario: An un-upgraded client keeps working

- **WHEN** a client built before the change queries an upgraded backend
- **THEN** it parses the response without error
- **AND** it renders features in the buckets the backend reports, using its own older palette

#### Scenario: No re-import is required

- **WHEN** an operator applies the change with `make db-apply` against an existing database
- **THEN** `playground_stats` is rebuilt with the new rule and columns
- **AND** no OSM re-import is needed for the new buckets to appear
