## ADDED Requirements

### Requirement: Importer records successful-run timestamp

After each successful osm2pgsql run, the importer SHALL upsert `imported_at = now()` into the `meta` singleton row in the database.

#### Scenario: Successful run writes imported_at

- **WHEN** the importer completes osm2pgsql with exit code 0
- **THEN** `api.meta.imported_at` is set to the current wall-clock timestamp (UTC)

#### Scenario: Failed run does not update imported_at

- **WHEN** the importer exits with a non-zero status or is killed mid-run
- **THEN** `api.meta.imported_at` retains its previous value unchanged

---

### Requirement: Importer records OSM extract data age

After each successful osm2pgsql run, the importer SHALL extract the `osmosis_replication_timestamp` from the source PBF using `osmium fileinfo --json` and store it as `osm_data_age` in the `meta` singleton row.

#### Scenario: PBF carries replication timestamp

- **WHEN** `osmium fileinfo --json` returns a non-null `osmosis_replication_timestamp`
- **THEN** `api.meta.osm_data_age` is set to that timestamp (parsed as UTC)

#### Scenario: PBF does not carry replication timestamp

- **WHEN** `osmium fileinfo --json` returns `null` for `osmosis_replication_timestamp`
- **THEN** `api.meta.osm_data_age` is set to `NULL`
- **AND** the import run is NOT aborted

#### Scenario: osmium fileinfo fails

- **WHEN** `osmium fileinfo --json` exits with a non-zero status
- **THEN** the importer logs a warning and continues
- **AND** `api.meta.osm_data_age` is set to `NULL`

---

### Requirement: meta table is a singleton

The `meta` table SHALL contain exactly one row, enforced at the schema level.

#### Scenario: Singleton integrity on upsert

- **WHEN** the importer upserts timestamps at end of run
- **THEN** exactly one row exists in `api.meta` after the upsert

#### Scenario: Direct second-row insertion rejected

- **WHEN** any client attempts to INSERT a second row into `api.meta`
- **THEN** the insertion fails with a constraint violation
- **AND** the existing row is unaffected

---

### Requirement: get_meta() exposes both timestamps

The `api.get_meta()` RPC SHALL return `imported_at` and `osm_data_age` in its response alongside existing fields.

#### Scenario: Both timestamps present

- **WHEN** at least one successful import run has completed
- **THEN** `GET /api/rpc/get_meta` returns a JSON object including `imported_at` (ISO 8601 string) and `osm_data_age` (ISO 8601 string or `null`)

#### Scenario: No import run yet

- **WHEN** the importer has never completed a successful run
- **THEN** `GET /api/rpc/get_meta` returns `imported_at: null` and `osm_data_age: null`

---

### Requirement: InstancePanel displays both timestamps

The hub InstancePanel SHALL display `imported_at` and `osm_data_age` per backend so operators can observe import cadence and data freshness.

#### Scenario: Both timestamps available

- **WHEN** a backend's `get_meta()` returns non-null `imported_at` and `osm_data_age`
- **THEN** the InstancePanel shows both values, with `osm_data_age` displayed as a human-readable relative time (e.g. "3 days ago") and the ISO timestamp available on hover

#### Scenario: osm_data_age is null

- **WHEN** a backend's `get_meta()` returns `osm_data_age: null`
- **THEN** the InstancePanel shows "unknown" for the data age row
- **AND** `imported_at` is still displayed if available
