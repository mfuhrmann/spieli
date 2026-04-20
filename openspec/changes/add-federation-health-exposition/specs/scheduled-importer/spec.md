## ADDED Requirements

### Requirement: Importer records successful-run timestamp

The importer SHALL record the timestamp of each successful run into a persistent, SQL-queryable location so that downstream clients (federation hub, monitoring tools) can observe data freshness per backend.

#### Scenario: Successful run writes a timestamp

- **WHEN** the importer container completes an osm2pgsql run with exit code 0
- **THEN** the `api.import_status` singleton row is upserted with `last_import_at = now()`

#### Scenario: Failed run does not update timestamp

- **WHEN** the importer exits with a non-zero status, is killed, or aborts partway through osm2pgsql
- **THEN** the previous `last_import_at` value is preserved unchanged
- **AND** no partial or speculative timestamp is written

#### Scenario: Singleton integrity enforced at schema level

- **WHEN** any client attempts to `INSERT` a second row into `api.import_status`
- **THEN** the insertion fails with a CHECK violation
- **AND** the existing row is unaffected
