## 1. Backend — import status tracking

- [ ] 1.1 Add `api.import_status` table in `importer/api.sql` — columns `id int PRIMARY KEY CHECK (id = 1)`, `last_import_at timestamptz NOT NULL`, `source_pbf_url text`, `pbf_etag text`
- [ ] 1.2 Modify the importer entrypoint (shell script that invokes osm2pgsql) to `UPSERT` into `api.import_status` with `NOW()` on exit code 0 only
- [ ] 1.3 Extend `api.get_meta` to LEFT JOIN `api.import_status` and include `last_import_at` and derived `data_age_seconds` (`EXTRACT(EPOCH FROM (now() - last_import_at))::int`) in the JSON output
- [ ] 1.4 Grant SELECT on `api.import_status` to `web_anon` (only if PostgREST exposes it; otherwise inline into `get_meta` with `SECURITY DEFINER` reach)
- [ ] 1.5 Update `dev/seed/seed.sql` so `make seed-load` populates a plausible `last_import_at` (e.g. `now() - interval '3 days'`) so the dev experience matches production
- [ ] 1.6 Document the new field in `docs/reference/registry-json.md` under the `get_meta` response section

## 2. Hub container — poll + exposition

- [ ] 2.1 Add `busybox-suid` (or `dcron`, whichever is smaller on the existing base image) to `oci/app/Dockerfile`
- [ ] 2.2 Create `oci/app/poll-federation.sh` — reads `/usr/share/nginx/html/registry.json`, curls each backend's `get_meta` with a 3s timeout, measures latency, writes `/usr/share/nginx/html/federation-status.json` and `/usr/share/nginx/html/metrics` atomically (write to `.tmp`, rename)
- [ ] 2.3 Install a crontab entry (`* * * * * /usr/local/bin/poll-federation.sh >/dev/null 2>&1`) into the hub image
- [ ] 2.4 Start cron in the nginx container via `oci/app/docker-entrypoint.app.sh` (background the daemon before exec-ing nginx)
- [ ] 2.5 Add an nginx `location = /metrics` block setting `Content-Type: text/plain; version=0.0.4`
- [ ] 2.6 Ensure `/federation-status.json` is served with CORS headers matching `/registry.json`
- [ ] 2.7 Include `generated_at` ISO-8601 UTC timestamp as a top-level field in both outputs
- [ ] 2.8 On first start, generate an empty placeholder file so a hub queried before the first cron tick does not 404

## 3. Hub UI — surface freshness in the drawer

- [ ] 3.1 Extend `app/src/hub/registry.js` (or add `app/src/hub/federationStatus.js`) to fetch `/federation-status.json` on hub-mode startup, refresh on the same 5-min interval as the existing registry poll, merge into the existing `backends` readable store
- [ ] 3.2 Update `app/src/hub/InstancePanelDrawer.svelte` to render per-backend `data_age` (e.g. "data: 2 days old") and `last_ok` (e.g. "last reachable 3 min ago")
- [ ] 3.3 Show a subtle "observation stale" hint in the drawer if `generated_at` is older than 2× poll interval (default 120 s)
- [ ] 3.4 Add i18n strings for new drawer labels (`hub.dataAge`, `hub.lastReachable`, `hub.observationStale`, `hub.neverReachable`)
- [ ] 3.5 Graceful fallback: if `/federation-status.json` 404s or fails to parse, the drawer renders exactly as it does today (no freshness labels, no error noise in console beyond one-time warning)

## 4. Docs

- [ ] 4.1 Create `docs/ops/monitoring.md` with three recipes:
    - **External uptime monitor** — point UptimeRobot / healthchecks.io / similar at `https://<hub>/federation-status.json`, alert on any `ok: false` or stale `generated_at`
    - **BYO Prometheus** — example scrape config block for `/metrics`, list of emitted metrics + labels, one-paragraph Grafana panel suggestion (no in-repo dashboards)
    - **Frontend error reporting** — link to Sentry free tier; paste-ready snippet for `app.html` if the operator chooses to add it; explicitly noted as *not* wired in-repo
- [ ] 4.2 Add a "Health exposition" section to `docs/reference/federation.md` cross-linking to the new page
- [ ] 4.3 Note `last_import_at` in `docs/reference/registry-json.md` under the `get_meta` fields
- [ ] 4.4 Add `Monitoring: ops/monitoring.md` to the `mkdocs.yml` nav under Operations

## 5. Verification

- [ ] 5.1 `make docker-build && make up` locally with two-backend `registry.json`; `/federation-status.json` appears within 90s and contains both backends
- [ ] 5.2 `curl http://localhost:8080/metrics` returns well-formed Prometheus text exposition with `# HELP` and `# TYPE` lines for `spielplatz_backend_up`, `spielplatz_backend_latency_seconds`, `spielplatz_backend_data_age_seconds`, `spielplatz_poll_generated_timestamp`
- [ ] 5.3 Stop one backend container, wait one poll cycle, verify `ok: false` in status JSON and `spielplatz_backend_up{backend="..."} 0` in metrics
- [ ] 5.4 `make docs-build --strict` passes with `monitoring.md` in nav and no broken internal links
- [ ] 5.5 Manual smoke test of the drawer in hub mode: reachable backends show "data: N days old"; unreachable backend shows "last reachable N min ago"
- [ ] 5.6 Validate the change with `openspec validate add-federation-health-exposition` before archive
