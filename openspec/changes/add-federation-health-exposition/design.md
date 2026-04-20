## Context

Federation shipped in v0.2.0 with zero observability infrastructure. Every answer to "is it working?" lives either in a user's browser session (the InstancePanel drawer's per-backend error/loading state) or in per-container Docker logs that nobody aggregates. The hub container itself is pure static — nginx + Svelte build + `registry.json` — so there is no server-side vantage point from which federation health can be observed, let alone persisted.

The trigger for investing now is the onboarding of **backend #2 by an external operator** — the moment a second human depends on the hub's operational state. That's the threshold where "browser is the dashboard" stops being acceptable and where the absence of federation-level telemetry becomes a trust barrier rather than a convenience gap. Federation docs (`docs/ops/federated-deployment.md`, in flight in the `document-federated-hub-deployment` change) exist precisely to enable that onboarding; this proposal closes the operational gap the docs expose.

## Goals / Non-Goals

**Goals:**

- Minimum viable observation that covers the two pains most likely to bite first: **importer failure** (silent data staleness) and **backend-down-unnoticed**.
- A scrape hook for operators who already run Prometheus/Grafana, with no in-repo dashboards or alerting.
- **Zero new services** in `compose.yml`.
- **Zero new databases.** Reuse the existing per-backend Postgres for the one timestamp we need.
- Deployment recipe unchanged from the operator's perspective — `make up` continues to work with no new prerequisites.

**Non-Goals:**

- Frontend error reporting. Docs will recommend Sentry free tier; no in-repo wiring.
- Distributed tracing across hub → backend fetches. OpenTelemetry is too heavy for this tier; revisit when a concrete debug story demands it.
- In-repo Grafana dashboards or alerting rules. BYO.
- Multi-hub coordination. The hub is single-instance.
- Historical time-series. The hub exposes current state; BYO Prometheus stores history.
- A sidecar service or embedded database (SQLite). See D1.

## Decisions

### D1 — Hub stays operationally stateless; cron + flat JSON + /metrics

The hub container gains `busybox-suid` (or equivalent cron provider) and a poll script. No long-running service, no database, no new compose entry. Output is two flat files under the nginx document root, refreshed every 60 seconds.

Rejected alternatives:

- **Sidecar service**: adds supervision, crash recovery, language runtime, and migration concerns for a capability that current scale does not justify. Reserve for when Level 1 proves insufficient (e.g. when we need rich history, webhooks, or auth-scoped endpoints).
- **Client-only observation posted to a hub ingest endpoint**: would require a POST target, auth, and abuse handling. Client browsers are untrusted observers; server-side polling from a known location is the right shape.

The cost of this decision is a small surface-area bump in the image (one binary + one shell script). If that becomes a pain, the poll loop can migrate to a tiny Go binary behind the same nginx locations without changing any external contract.

### D2 — Exporter pattern, not time-series DB

The hub exposes *current* state; history is the problem of whoever runs the scraper. This is standard Prometheus architecture. Operators without Prometheus still get a scrape-friendly flat JSON (`/federation-status.json`) that any external uptime tool can poll — so the hub serves both the "BYO metrics stack" and "BYO uptime monitor" operator paths without in-repo aggregation.

### D3 — Freshness stored in the DB, not the filesystem

`last_import_at` is written to an `api.import_status` table, not a timestamp file on disk. Rationale: the importer container is ephemeral (`docker compose run --rm importer`), so a filesystem timestamp would not survive container removal. The DB is already the durable store for imported data — co-locating the freshness marker there avoids a second persistence mechanism.

Singleton enforced via `CHECK (id = 1)`; `UPSERT` via `INSERT ... ON CONFLICT (id) DO UPDATE`.

### D4 — Prometheus text format for `/metrics`

Chosen over OpenMetrics, JSON, or a custom format:

- De-facto standard scraped by every metrics tool worth mentioning.
- Trivial to generate from shell (`printf` lines), no code generator required.
- Easy for operators to inspect manually with `curl`.
- OpenMetrics adds features (exemplars, native histograms) we don't need here; backward-compatible drift is unnecessary.

### D5 — Poll interval: 60 seconds

Balances freshness against backend load. At N backends, each sees 1 extra request per minute from the hub. Negligible at federation scales we anticipate (≤10 backends).

The hub UI's existing 5-minute refresh poll is **unchanged** — that's a per-browser mechanism for displaying up-to-date *data* to users; this new 60-second poll is a server-side mechanism for observing backend *health*. Keeping them separate avoids coupling UX freshness to ops freshness.

### D6 — `generated_at` timestamp in status JSON is mandatory

A stale `federation-status.json` (cron died, container frozen) is indistinguishable from a fresh one unless the file self-reports when it was written. External tools scraping the JSON MUST be able to compute "age of the observation" to avoid trusting stale data. The UI similarly uses this field to gate the "observation stale" banner (see `hub-ui-parity` delta).

### D7 — Scope is "minimum cut for backend #2 onboarding", not "observability v1"

Explicit scope discipline: the two in-scope pains (importer failure + backend-down-unnoticed) are the minimum an external backend operator needs to trust the federation. Latency regression is covered only as a side effect of the `/metrics` shape — no in-repo dashboards. Frontend errors and cross-boundary traces are deferred entirely. This prevents the proposal from drifting into a general-purpose observability effort that would easily absorb weeks of work.

## Risks / Trade-offs

- **Cron in the nginx container** adds surface area (busybox-cron binary + script + entrypoint hook). Mitigation: minimal image delta, poll script is <50 lines of shell, reviewable end-to-end. Migration path to a tiny Go binary exists if shell hits its limits.
- **Poll fan-out on backends.** At N=5 backends × 60 s, each backend sees 1 extra request/minute. Negligible; `get_meta` is cached-friendly and already public.
- **Data-model drift between `/federation-status.json` and `/metrics`.** Both files are generated in the same poll run; single shell function emits both to keep them in lockstep. Any schema change touches one place.
- **`api.import_status` table is one row.** Using a `CHECK (id = 1)` singleton prevents accidental multi-row drift (e.g. from a mistyped `INSERT`).
- **Cron silently dies, status freezes.** Caught by `generated_at`: external monitors alert on stale observation, UI shows a banner. The failure mode is observable rather than silent.
- **CORS on the status endpoint.** Hub UI fetches from its own origin (no CORS issue). External tools scraping cross-origin would need CORS headers; adding them matches `/registry.json` behaviour and costs nothing.
- **Freshness-banner UX noise.** If the threshold for "stale observation" is too tight, users see a banner during transient hub hiccups. Start conservative (2× poll interval = 120 s) and loosen based on observed false-positive rate.

## Open Questions

- **Should `/metrics` be gated behind a bearer token?** Current `/api/rpc/*` federation endpoints are public, so metrics are no more sensitive. Revisit if any per-user data lands in them.
- **Exponential backoff on unreachable backends?** Linear retry every 60 s is simplest; a failing backend gets scraped 1440×/day. Probably fine. Exponential backoff is a future improvement, not load-bearing for v1.
- **Should the importer also write `pbf_etag` and `source_pbf_url`?** Recommended for debugging "did this importer run pick up the right file?", but strictly optional for this proposal — defer if scope pressure mounts.
