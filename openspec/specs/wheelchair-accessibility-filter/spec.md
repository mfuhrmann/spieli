# wheelchair-accessibility-filter Specification

## Purpose
TBD - created by archiving change wheelchair-playground-accessibility. Update Purpose after archive.
## Requirements
### Requirement: Wheelchair filter source and value set

The `wheelchair` playground filter SHALL flag a playground as wheelchair-accessible when either the playground area itself OR any device contained within it carries a `wheelchair` OSM tag whose value is one of `yes`, `limited`, or `designated`. The server SHALL expose this as the boolean `for_wheelchair` on each playground; the frontend filter, chip, and completeness logic consume that boolean unchanged.

Previously `for_wheelchair` was derived from device tags only and matched `wheelchair = 'yes'` exclusively.

#### Scenario: Playground area tagged, no tagged device

- **WHEN** a playground polygon is tagged `wheelchair=yes` (or `limited`, or `designated`) and contains no wheelchair-tagged device
- **THEN** `get_playgrounds_bbox`, `get_playground`, and cluster/polygon filtering return `for_wheelchair: true`

#### Scenario: Device tagged within playground

- **WHEN** a playground contains a device tagged `wheelchair=yes`, `limited`, or `designated` that is not `playground=sandpit`
- **THEN** `for_wheelchair` is `true`

#### Scenario: Sandpit device does not qualify on the device branch

- **WHEN** the only wheelchair-tagged item is a `playground=sandpit` device
- **THEN** the device branch does not set `for_wheelchair` (the sandpit guard is retained)

#### Scenario: No positive tag anywhere

- **WHEN** a playground has `wheelchair=no` on the area and all devices, and no positive wheelchair tag
- **THEN** `for_wheelchair` is `false`

#### Scenario: Filter hides non-matching playgrounds

- **WHEN** the `wheelchair` filter is enabled
- **THEN** playgrounds with `for_wheelchair: false` are hidden and those with `true` remain, across both cluster and polygon tiers

#### Scenario: Sensory-disability keys excluded

- **WHEN** a playground carries only sensory-accessibility keys (`blind`, `deaf`, `tactile_paving`) and no `wheelchair` tag
- **THEN** those keys do not participate in the filter and `for_wheelchair` is `false`

#### Scenario: Cluster rings honour the wheelchair filter

- **WHEN** the `wheelchair` filter is enabled at a cluster-tier zoom
- **THEN** `get_playground_clusters` is called with `filter_wheelchair=true` and the ring buckets count only playgrounds whose `for_wheelchair` is true

#### Scenario: Detail panel shows an accessibility badge

- **WHEN** a selected playground has `for_wheelchair = true`
- **THEN** the detail panel shows a wheelchair-accessible badge (`details.wheelchairAccessible`), and shows no such badge when `for_wheelchair` is false

