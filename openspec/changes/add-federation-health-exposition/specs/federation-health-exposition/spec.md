## ADDED Requirements

### Requirement: Backend exposes last-import timestamp

Each data-node SHALL expose the timestamp of its most recent successful import via `api.get_meta`, so the hub (and any external client) can observe data freshness per backend.

#### Scenario: `get_meta` includes `last_import_at` after an import

- **WHEN** a client calls `/api/rpc/get_meta` after at least one successful importer run
- **THEN** the response contains `last_import_at` as an ISO-8601 timestamp
- **AND** the response contains `data_age_seconds` as a non-negative integer equal to `now() - last_import_at` rounded to whole seconds

#### Scenario: `get_meta` before any import

- **WHEN** a client calls `/api/rpc/get_meta` on a freshly provisioned backend that has never completed an importer run
- **THEN** `last_import_at` is present in the response with value `null`
- **AND** `data_age_seconds` is present with value `null`
- **AND** no other fields are affected (backward-compatible extension)

### Requirement: Hub container polls backends and exposes status JSON

The hub container SHALL poll every registered backend on a fixed 60-second interval and write the aggregated observation to `/federation-status.json`, served over HTTP at the hub's origin.

#### Scenario: Status JSON is populated within 90 seconds of hub start

- **WHEN** the hub container starts with a populated `registry.json`
- **THEN** within 90 seconds `GET /federation-status.json` returns a valid JSON document with one entry per backend in the registry

#### Scenario: Status JSON records reachability

- **WHEN** a backend returns a successful `get_meta` response during a poll
- **THEN** that backend's entry includes `ok: true`, `last_success` (ISO-8601 UTC), `latency_ms` (observed round-trip in milliseconds), `data_age_seconds` (carried through from the backend's `get_meta` response)

#### Scenario: Status JSON records unreachable backends

- **WHEN** a backend fails to respond within the 3-second timeout, or returns a non-2xx HTTP status
- **THEN** that backend's entry includes `ok: false` and a short `error` string (e.g. `"timeout"`, `"http 502"`, `"dns"`)
- **AND** the previously recorded `last_success` value is preserved unchanged (not overwritten by a failed poll)

#### Scenario: Status JSON self-reports freshness

- **WHEN** a client fetches `/federation-status.json`
- **THEN** the top-level object includes `generated_at` as an ISO-8601 UTC timestamp naming the start of the most recent poll cycle
- **AND** the top-level object includes `poll_interval_seconds` as an integer (currently 60) so clients can compute staleness without hard-coding the interval

#### Scenario: CORS mirrors the registry

- **WHEN** a client fetches `/federation-status.json` cross-origin
- **THEN** the response carries the same CORS headers as `/registry.json`, so any client able to read the registry is able to read the status

### Requirement: Hub exposes Prometheus metrics endpoint

The hub container SHALL expose `/metrics` in Prometheus text exposition format, derived from the same poll as `/federation-status.json`.

#### Scenario: Metrics endpoint responds with correct content type

- **WHEN** a client calls `GET /metrics`
- **THEN** the response has content type `text/plain; version=0.0.4` and is well-formed Prometheus text exposition (each metric has `# HELP` and `# TYPE` lines)

#### Scenario: Metrics include per-backend labels

- **WHEN** the metrics endpoint is scraped
- **THEN** per-backend samples carry a `backend` label — value equal to the registry entry's `slug` when present, falling back to the entry's `url` otherwise
- **AND** labels match those exposed in `/federation-status.json` entries one-to-one

#### Scenario: Minimum metric set is emitted

- **WHEN** the metrics endpoint is scraped
- **THEN** the output includes at minimum:
    - `spielplatz_backend_up{backend}` — gauge, `1` if last poll succeeded, `0` otherwise
    - `spielplatz_backend_latency_seconds{backend}` — gauge, observed round-trip from the last successful poll
    - `spielplatz_backend_data_age_seconds{backend}` — gauge, `data_age_seconds` from the last successful poll
    - `spielplatz_poll_generated_timestamp` — gauge, unix timestamp of the last poll cycle start

#### Scenario: Metrics survive a cron gap

- **WHEN** the cron daemon has not run for longer than the poll interval
- **THEN** `/metrics` still responds with the most recent successfully generated content (not a 404), and `spielplatz_poll_generated_timestamp` reveals the staleness

### Requirement: Hub image includes cron provider and poll script

The hub container image SHALL include a cron provider (`busybox-suid`, `dcron`, or equivalent) and a poll script installed under a well-known path, without requiring any `compose.yml` changes.

#### Scenario: Cron runs in the same container as nginx

- **WHEN** the hub container is started
- **THEN** both nginx and the cron daemon are running in-container
- **AND** no additional service is declared in `compose.yml`

#### Scenario: Poll script path is stable

- **WHEN** an operator inspects the running container
- **THEN** the poll script is located at `/usr/local/bin/poll-federation.sh` and is executable
- **AND** the crontab entry invokes exactly that path
