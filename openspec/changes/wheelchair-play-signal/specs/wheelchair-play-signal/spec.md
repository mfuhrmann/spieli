## ADDED Requirements

### Requirement: Wheelchair suitability is derived from play equipment, not site access

A playground's wheelchair signal SHALL be derived only from accessibility tags on the play devices it contains. The playground area's own accessibility tag SHALL NOT contribute, because site enterability does not distinguish playgrounds for the audience the signal serves.

#### Scenario: A suitable play device sets the signal

- **WHEN** a playground contains an object tagged as a play device whose accessibility value is affirmative
- **THEN** the playground's wheelchair signal is `yes`

#### Scenario: Assisted use counts as suitable

- **WHEN** the only affirmative device value present is the one denoting partial or assisted accessibility
- **THEN** the playground's wheelchair signal is `yes`

#### Scenario: The area tag alone does not set the signal

- **WHEN** a playground's own area is tagged as wheelchair accessible but no contained play device carries an accessibility tag
- **THEN** the playground's wheelchair signal is unknown

#### Scenario: The area tag alone does not clear the signal

- **WHEN** a playground contains a suitable play device
- **THEN** the signal is `yes` regardless of the value on the playground area

#### Scenario: Street furniture cannot set the signal

- **WHEN** the only object carrying an affirmative accessibility tag is a bench, shelter, picnic table, or pitch rather than a play device
- **THEN** the playground's wheelchair signal is unknown

### Requirement: Surveyed-negative is distinguishable from unknown

The signal SHALL record separately that accessibility was surveyed and nothing suitable was found, as against never having been surveyed, because those are opposite answers for someone planning a trip.

#### Scenario: Surveyed with nothing suitable

- **WHEN** at least one play device carries an accessibility tag and none of them is affirmative
- **THEN** the playground's wheelchair signal is `no`

#### Scenario: Never surveyed

- **WHEN** no play device carries an accessibility tag
- **THEN** the playground's wheelchair signal is unknown

#### Scenario: The three states are mutually exclusive

- **WHEN** any playground is evaluated
- **THEN** its wheelchair signal is exactly one of `yes`, `no`, or unknown

#### Scenario: The boolean field agrees with the tri-state

- **WHEN** a playground's wheelchair signal is `yes`
- **THEN** the boolean wheelchair field in every payload that carries it is true
- **AND** it is false for both the `no` and the unknown state

### Requirement: All surfaces present the signal from one source

The hover preview, the detail panel and the filter SHALL derive their wheelchair presentation from the same server-computed signal, so a user cannot see one surface contradict another.

#### Scenario: Hover icon and filter agree

- **WHEN** a playground matches the wheelchair filter
- **THEN** hovering it shows the accessibility icon
- **AND** a playground that does not match shows no accessibility icon

#### Scenario: Panel states the positive case

- **WHEN** a playground with signal `yes` is selected
- **THEN** the detail panel shows a wheelchair badge

#### Scenario: Panel states the surveyed-negative case

- **WHEN** a playground with signal `no` is selected
- **THEN** the detail panel states explicitly that no wheelchair-suitable equipment was recorded

#### Scenario: Panel stays silent when unknown

- **WHEN** a playground with an unknown signal is selected
- **THEN** the detail panel makes no accessibility claim in either direction

#### Scenario: Filter matches only the positive state

- **WHEN** the wheelchair filter is active
- **THEN** exactly the playgrounds whose signal is `yes` remain visible

### Requirement: The signal does not affect mapping detail or aggregates

The wheelchair signal SHALL remain independent of the mapping-detail rating and SHALL NOT alter any aggregated payload, so accessibility tagging cannot move a playground between detail buckets.

#### Scenario: Mapping detail is unchanged

- **WHEN** a playground's wheelchair signal changes
- **THEN** its mapping-detail classification is unaffected

#### Scenario: Aggregate payloads are unchanged

- **WHEN** cluster or macro-level aggregates are requested
- **THEN** their field names and bucket structure are identical to before this change
