## ADDED Requirements

### Requirement: Features deduplicated by osm_id at VectorSource insertion

When `loadBackend()` adds features from a backend to the shared VectorSource, it SHALL skip any feature whose `osm_id` is already present, unless the incoming feature's backend reports a strictly newer `osm_data_age`.

#### Scenario: Incoming feature is fresher

- **WHEN** a feature with `osm_id` X is being added and `osm_id` X already exists in the VectorSource
- **AND** the incoming backend's `osm_data_age` is strictly newer than the existing feature's backend's `osm_data_age`
- **THEN** the existing feature is replaced by the incoming feature

#### Scenario: Incoming feature is older or equal age

- **WHEN** a feature with `osm_id` X is being added and `osm_id` X already exists in the VectorSource
- **AND** the incoming backend's `osm_data_age` is equal to or older than the existing feature's backend's `osm_data_age`
- **THEN** the incoming feature is discarded and the existing feature is retained unchanged

#### Scenario: Incoming feature's backend has unknown data age

- **WHEN** a feature with `osm_id` X is being added and the incoming backend's `osm_data_age` is `null`
- **AND** `osm_id` X already exists in the VectorSource
- **THEN** the incoming feature is discarded (null age is treated as oldest possible)

#### Scenario: Existing feature's backend has unknown data age

- **WHEN** a feature with `osm_id` X is being added and `osm_id` X already exists in the VectorSource
- **AND** the existing feature's backend's `osm_data_age` is `null`
- **AND** the incoming backend's `osm_data_age` is non-null
- **THEN** the existing feature is replaced by the incoming feature

#### Scenario: No existing feature for osm_id

- **WHEN** a feature with `osm_id` X is being added and `osm_id` X does not yet exist in the VectorSource
- **THEN** the feature is added normally without any dedup check

---

### Requirement: relation_id tagged onto features

`loadBackend()` SHALL attach the `relation_id` value from `get_meta()` onto every feature it adds to the VectorSource as the property `_relationId`.

#### Scenario: relation_id available from get_meta

- **WHEN** a backend's `get_meta()` returns a non-null `relation_id`
- **THEN** every feature loaded from that backend has `feature.get('_relationId')` equal to that value

#### Scenario: relation_id absent from get_meta

- **WHEN** a backend's `get_meta()` returns `null` or omits `relation_id`
- **THEN** every feature loaded from that backend has `feature.get('_relationId')` equal to `null`

---

### Requirement: Dedup applies only in hub mode

The dedup logic SHALL be active only when the app is running in hub mode. Standalone mode SHALL be unaffected.

#### Scenario: Hub mode with overlapping backends

- **WHEN** `appMode` is `"hub"` and two backends share playground features by `osm_id`
- **THEN** exactly one feature per `osm_id` exists in the VectorSource after both backends have loaded

#### Scenario: Standalone mode unchanged

- **WHEN** `appMode` is `"standalone"`
- **THEN** `loadBackend()` is not called and no dedup logic runs
