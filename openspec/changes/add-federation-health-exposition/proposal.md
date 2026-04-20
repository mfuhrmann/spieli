## Why

The federation architecture shipped in v0.2.0 has no way to answer operator questions like "is the Berlin backend reachable from the hub?", "when did this region last import data?", or "which backends are the slowest?" Every answer lives transiently in a user's browser memory or is unavailable entirely.

Before the first external backend operator is onboarded (i.e. before backend #2 is run by someone other than the hub operator), the federation needs a minimum-viable observation hook so that (a) outages can be detected without a support ticket, (b) stale data is visible, and (c) operators using their own Prometheus/Grafana stacks have a scrape target.

This proposal delivers exactly that minimum — covering importer-failure and backend-down-unnoticed directly, giving a hook for latency monitoring via BYO Prometheus, and explicitly deferring frontend error reporting, distributed tracing, and in-repo dashboards to future proposals.

## What Changes

- **Backend (per data-node)**:
    - Importer records a `last_import_at` timestamp after each successful osm2pgsql run (persisted in a small DB table).
    - `api.get_meta` response gains `last_import_at` (and derived `data_age_seconds`) so the hub can observe freshness.

- **Hub container**:
    - Poll script (busybox cron, every 60 seconds) reads `registry.json`, fetches `get_meta` from each backend, records reachability + latency + data age.
    - Output written to two files served by the existing nginx:
        - `/federation-status.json` — human-readable rollup (per-backend status, last success, latency sample, data age, `generated_at`).
        - `/metrics` — the same data in Prometheus text exposition format.
    - Hub container image gains `busybox-suid` (or equivalent cron provider) and the poll script (no new compose services).

- **Hub UI**:
    - `InstancePanel` drawer surfaces per-backend `data_age` and "last reachable" timestamps from the new endpoint, alongside the existing per-session error/loading state.

- **Docs**:
    - New page `docs/ops/monitoring.md` — three recipes: (a) external uptime monitor on `/federation-status.json`, (b) BYO Prometheus scrape of `/metrics`, (c) Sentry free tier for frontend errors (link only).
    - `federation.md` and `registry-json.md` cross-link the new page.

Out of scope (explicit non-goals):

- In-repo Grafana dashboards, alerting rules, or Prometheus config.
- Frontend error reporting or RUM wired in-repo.
- Distributed tracing (OpenTelemetry).
- Multi-hub coordination.
- Sidecar service or database for observation history.

## Capabilities

### New Capabilities

- `federation-health-exposition`: Hub-side polling and exposition of per-backend federation health via `/federation-status.json` and `/metrics`, plus the `last_import_at` field on backend `get_meta` responses.

### Modified Capabilities

- `scheduled-importer`: importer records a persistent last-successful-run timestamp after each import.
- `hub-ui-parity`: instance drawer displays data age and last-reachable timestamps from the federation-status endpoint.

## Impact

- `importer/api.sql` — new `api.import_status` table; `get_meta` joins it in.
- `importer/` (script/container) — writes `last_import_at` on successful run.
- `oci/app/` — Dockerfile gains cron provider; adds poll script + crontab; nginx config serves `/federation-status.json` and `/metrics`.
- `app/src/hub/registry.js` (or new `federationStatus.js`) — fetches `/federation-status.json` alongside `/registry.json`, merges into the backends store.
- `app/src/hub/InstancePanelDrawer.svelte` — renders freshness info.
- `docs/ops/monitoring.md` — new file.
- `docs/reference/federation.md`, `docs/reference/registry-json.md` — cross-links.
- `mkdocs.yml` — nav entry.
- `compose.yml` — no changes.
