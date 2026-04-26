# scheduled-importer Specification

## Purpose

Give operators a drop-in systemd service + timer pair so OSM data refreshes weekly without custom cron jobs or manual intervention. The service runs `docker compose run --rm importer` against the project's existing `.env`; the timer fires weekly with `Persistent=true` to catch missed runs on next boot.
## Requirements
### Requirement: Service unit runs the importer via Docker Compose
The system SHALL provide a `deploy/spieli-import.service` systemd service unit that executes `docker compose run --rm importer` in the project directory, loading credentials from the `.env` file via `EnvironmentFile=`.

#### Scenario: Service unit executes the importer container
- **WHEN** the service unit is started (manually or by the timer)
- **THEN** `docker compose run --rm importer` is invoked in the configured `WorkingDirectory`
- **THEN** the importer container runs to completion and is removed afterwards

#### Scenario: Service unit picks up environment from .env
- **WHEN** the service unit starts
- **THEN** environment variables from `.env` (e.g. `OSM_RELATION_ID`, `PBF_URL`) are available to the Docker Compose invocation

### Requirement: Timer unit triggers the importer weekly
The system SHALL provide a `deploy/spieli-import.timer` systemd timer unit that activates the service unit once a week with `Persistent=true`.

#### Scenario: Timer fires on the weekly schedule
- **WHEN** the configured weekly calendar expression elapses
- **THEN** `spieli-import.service` is started automatically

#### Scenario: Missed run is caught on next boot
- **WHEN** the system was offline during a scheduled run
- **THEN** `spieli-import.service` is started once on the next boot due to `Persistent=true`

### Requirement: Unit files are documented for installation
The project documentation SHALL describe how to copy, configure, and enable the unit files so operators can set up automated imports without prior systemd expertise.

#### Scenario: Operator follows the documented install steps
- **WHEN** an operator follows the documented procedure (copy units, edit `WorkingDirectory` and `User=`, `systemctl enable --now`)
- **THEN** the timer is active and the importer runs automatically each week

### Requirement: Importer records successful-run timestamp

The importer SHALL record the timestamp of each successful run into a persistent, SQL-queryable location so that downstream clients (federation hub, monitoring tools) can observe data freshness per backend.

#### Scenario: Successful run writes a timestamp

- **WHEN** the importer's full pipeline (osm2pgsql + schema apply via `psql … < /api.sql`) completes with exit code 0
- **THEN** the `api.import_status` singleton row is upserted with `last_import_at = now()`

> The trigger keys on the *full pipeline* succeeding, not on `osm2pgsql` alone, because the `api.import_status` table is created by the schema-apply step itself — an UPSERT issued before that step has run would fail on a fresh database. See design D3.

#### Scenario: Failed run does not update timestamp

- **WHEN** the importer exits with a non-zero status, is killed, or aborts at any point in the pipeline (PBF download, osmium prefilter, osm2pgsql, schema apply)
- **THEN** the previous `last_import_at` value is preserved unchanged
- **AND** no partial or speculative timestamp is written

#### Scenario: Singleton integrity enforced at schema level

- **WHEN** any client attempts to `INSERT` a second row into `api.import_status`
- **THEN** the insertion fails with a CHECK violation
- **AND** the existing row is unaffected

