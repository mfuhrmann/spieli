## ADDED Requirements

### Requirement: Equipment count summary in the overview

The playground details panel SHALL show the equipment count summary (devices, fitness stations, benches, shelters, picnic tables) in the panel overview, not inside the collapsible Equipment section. Each non-zero count SHALL render as a localised summary line; zero counts SHALL be omitted. The Equipment section SHALL contain only the theme chips and the detailed device list.

#### Scenario: Counts shown in overview
- **WHEN** a playground has 12 devices, 2 benches, and 1 picnic table
- **THEN** the overview shows "12 devices", "2 benches", and "1 picnic table", and the Equipment section no longer shows the count summary

#### Scenario: Zero counts omitted
- **WHEN** a playground has devices but no benches, shelters, or picnic tables
- **THEN** only the non-zero counts appear, and no empty count lines are shown

### Requirement: Counts dedupe rings and include grouped children

The count summary SHALL deduplicate features by `osm_id` (osm2pgsql emits one row per outer ring of a multipolygon) and SHALL count grouped structure children individually (a structure containing 3 swings counts as 3 devices).

#### Scenario: Multipolygon ring not double-counted
- **WHEN** a single equipment feature appears as multiple rows sharing one `osm_id`
- **THEN** it is counted once

#### Scenario: Structure children counted individually
- **WHEN** a `playground=structure` group contains 3 swing children
- **THEN** the device count includes those 3 swings
