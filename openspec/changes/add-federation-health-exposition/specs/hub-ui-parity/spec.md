## ADDED Requirements

### Requirement: Instance drawer shows data freshness and last-reachable

The hub instance drawer SHALL display per-backend data age and last-reachable time sourced from `/federation-status.json`, alongside the existing per-session error and loading indicators.

#### Scenario: Reachable backend shows data age

- **WHEN** the drawer is opened and a backend has `ok: true` in the status endpoint
- **THEN** the backend's row shows a humanised data-age label (e.g. "data: 2 days old") derived from `data_age_seconds`

#### Scenario: Unreachable backend shows last-reachable

- **WHEN** the drawer is opened and a backend has `ok: false` in the status endpoint but a non-null `last_success`
- **THEN** the backend's row shows a humanised last-reachable label (e.g. "last reachable 8 min ago")

#### Scenario: Never-reachable backend shows explicit state

- **WHEN** the drawer is opened and a backend has `ok: false` with no prior `last_success`
- **THEN** the backend's row shows an explicit "never reachable" label (distinct from a loading state)

#### Scenario: Stale observation banner

- **WHEN** the status endpoint's `generated_at` is older than 2× `poll_interval_seconds`
- **THEN** the drawer shows a subtle banner indicating the server-side observation is stale
- **AND** the in-session browser observation remains the primary source of truth for the current drawer state (the banner is informational, not blocking)

#### Scenario: Status endpoint unavailable

- **WHEN** `/federation-status.json` is unreachable, returns non-2xx, or fails to parse
- **THEN** the drawer renders exactly as it does today — per-session error/loading state from the user's own browser polling, no freshness labels
- **AND** a single warning is logged to the console; no per-poll log spam
