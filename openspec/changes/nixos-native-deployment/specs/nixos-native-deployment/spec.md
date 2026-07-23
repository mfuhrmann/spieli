## ADDED Requirements

### Requirement: Native NixOS module runs a standalone data node

The project SHALL provide a `flake.nix` (repo root) exposing a NixOS module `nixosModules.spieli` that, when enabled, runs a standalone spieli data node as native systemd services — PostgreSQL+PostGIS, PostgREST, nginx, and a timer-driven importer — with no container runtime required. The module SHALL consume `db/init.sql`, `importer/api.sql`, and `importer/import.sh` by path (the same artifacts the Docker stack uses) rather than reimplementing their logic in Nix.

#### Scenario: Module brings up a working data node

- **GIVEN** a NixOS host importing `nixosModules.spieli` with `services.spieli.enable = true` and an `osmRelationId` configured
- **WHEN** the system is built and started
- **THEN** PostgreSQL with PostGIS, PostgREST, and nginx are running as systemd units
- **AND** nginx serves the Svelte bundle at `/` and proxies `/api/` to the local PostgREST
- **AND** no Docker or Podman runtime is required

#### Scenario: Reused SQL is applied verbatim

- **WHEN** the module initialises the database and applies the API schema
- **THEN** it applies the unmodified `db/init.sql` and `importer/api.sql` files
- **AND** a release editing those files changes the Nix deployment without any Nix-side code change

### Requirement: importer/import.sh is path-portable without changing Docker behaviour

`importer/import.sh` SHALL read its working-data directory and API-schema file location from the `DATA_DIR` and `API_SQL` environment variables, each defaulting to the current container path (`/data` and `/api.sql` respectively). All other importer behaviour SHALL remain unchanged.

#### Scenario: Docker path is byte-for-byte unchanged

- **WHEN** `import.sh` runs with neither `DATA_DIR` nor `API_SQL` set (the Docker case)
- **THEN** it uses `/data` for the PBF cache and intermediate filtered PBFs
- **AND** it applies the schema from `/api.sql`
- **AND** the produced importer image and its behaviour are identical to before this change

#### Scenario: NixOS overrides the paths

- **GIVEN** the importer systemd service sets `DATA_DIR=/var/lib/spieli/pbf` and `API_SQL=<nix-store>/api.sql`
- **WHEN** `import.sh` runs
- **THEN** all PBF downloads, `mktemp`, and intermediate `*.pbf` files use the state directory
- **AND** the schema is applied from the nix-store path

### Requirement: Importer runs as a one-shot service driven by a systemd timer

The module SHALL run the importer via a one-shot `spieli-import.service` triggered by a `spieli-import.timer` (`OnCalendar=weekly`, `Persistent=true`). It SHALL NOT use `import.sh`'s internal daemon loop. The importer service SHALL have `osm2pgsql`, `osmium-tool`, `jq`, `curl`, `wget`, `psql`/`pg_isready`, `envsubst`, and GNU coreutils on its `PATH`, and a managed state directory for the PBF cache.

#### Scenario: Weekly import with catch-up after downtime

- **GIVEN** the importer timer is active
- **WHEN** the scheduled time passes while the host is up
- **THEN** `spieli-import.service` runs the full one-shot pipeline (download → osmium filter → osm2pgsql → apply schema)
- **AND** a run missed while the host was off is executed on the next boot (`Persistent=true`)

#### Scenario: Schema re-applied on upgrade without a full reimport

- **GIVEN** a `spieli-schema.service` that runs `import.sh` in `API_ONLY` mode
- **AND** the service is run manually (not wired into activation) because `api.sql`'s `playground_stats` matview is built from `planet_osm_*`, which only exist after at least one full import
- **WHEN** an operator starts `spieli-schema.service` after upgrading to a new spieli version
- **THEN** `api.sql` is re-applied and PostgREST reloads its schema cache
- **AND** no PBF download or osm2pgsql run is triggered

### Requirement: Frontend builds with buildNpmPackage preserving the locale layout

The module SHALL build the Svelte frontend with `buildNpmPackage`. Because `app/src/lib/i18n.js` imports locale JSON via a relative path that resolves to a sibling of the npm package root (`../../../locales/*.json`), the build `src` SHALL contain both `app/` and `locales/` as siblings, with the package root (`sourceRoot`) set to `app/`. The build SHALL NOT depend on the Docker-only absolute `/locales` path.

#### Scenario: Locale imports resolve at build time

- **WHEN** `buildNpmPackage` runs `vite build` with `src` containing `app/` and `locales/` as siblings and `sourceRoot` at `app/`
- **THEN** `import('../../../locales/de.json')` resolves to the bundled `locales/` directory
- **AND** the German and English locale chunks are present in the output `dist/`

#### Scenario: Lockfile drift fails loudly

- **GIVEN** `npmDepsHash` is pinned to the current `app/package-lock.json`
- **WHEN** the lockfile changes (e.g. a Dependabot bump) without updating the hash
- **THEN** the build fails with a hash mismatch rather than silently using stale dependencies

### Requirement: Runtime configuration is generated from a shared script

config.js and the legal HTML pages SHALL be generated by a single shared script `oci/app/gen-runtime.sh`, called both by the Docker entrypoint (`oci/app/docker-entrypoint.sh`) and by the NixOS module's `preStart`. The NixOS-served `config.js` SHALL be served with `Cache-Control: no-store` and SHALL shadow the static `config.js` carried in the build output.

#### Scenario: Same generator on both paths

- **WHEN** runtime config is produced under Docker and under NixOS with equivalent inputs
- **THEN** both invoke `gen-runtime.sh` and produce equivalent `config.js` / legal HTML
- **AND** neither path carries an independent copy of the generation logic

#### Scenario: Generated config overrides the bundled default

- **GIVEN** the Vite build output contains a default `config.js` (copied from `app/public/config.js`)
- **WHEN** nginx serves `/config.js`
- **THEN** the runtime-generated `config.js` is served, not the bundled default
- **AND** it is served with `Cache-Control: no-store`

### Requirement: Version is surfaced via get_meta, not a static file

The native module SHALL surface the deployment version through `get_meta().version`, fed by the `SPIELI_VERSION` environment variable substituted into `api.sql` (matching the Docker importer image). The module SHALL NOT generate a `/version.json` file, and the ported nginx vhost SHALL omit the vestigial `/version.json` route.

#### Scenario: Version flows through the API

- **GIVEN** the importer/schema service environment sets `SPIELI_VERSION`
- **WHEN** `api.sql` is applied and a client calls `get_meta`
- **THEN** the response `version` field reflects the configured version
- **AND** no `/version.json` static file is created or served

### Requirement: A nixosTest guards the deployment against drift

The change SHALL include a `nixosTest` (wired into `flake.nix` `checks`, run by `nix flake check`) that boots the module, loads the seed fixture, and asserts the API and frontend respond. The module SHALL NOT be considered complete without this test.

#### Scenario: VM test exercises the live deployment

- **WHEN** `nix flake check` runs the `nixosTest`
- **THEN** a VM boots the spieli module and loads the 4-playground seed fixture
- **AND** an HTTP request to `/api/` (e.g. `get_meta`) returns a successful response
- **AND** an HTTP request to `/` returns the Svelte app shell
