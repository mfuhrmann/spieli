# Monitoring

This page is for hub operators. Watching a single data-node or standalone map works differently: see [Watching your instance](watch-instance.md).

The hub container exposes two endpoints for observing federation health:

| Endpoint | Format | Purpose |
|---|---|---|
| `/federation-status.json` | JSON | Human-readable per-backend rollup |
| `/metrics` | Prometheus text | Scrape target for Prometheus/Grafana stacks |

Both are written atomically every 60 seconds by a cron job inside the hub container. Neither endpoint requires authentication. `Cache-Control: no-store` is set on both.

Both are described field by field in [Hub status and metrics](../reference/hub-status.md). This page is about using them.

## Recipes

### Recipe 1 — External uptime monitor

Point any HTTP uptime tool (UptimeRobot, Better Stack, etc.) at:

```
GET https://<hub-host>/federation-status.json
```

Check that:

1. The response is `200 OK`.
2. `generated_at` is within the last 5 minutes (guards against cron death).
3. All expected `backends.<slug>.up` values are `true`.

### Recipe 2 — BYO Prometheus + Grafana

Add a scrape job to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: spieli_hub
    static_configs:
      - targets: ['<hub-host>:80']
    metrics_path: /metrics
    scrape_interval: 60s
```

Useful PromQL expressions:

```promql
# Is any backend currently down?
spielplatz_backend_up == 0

# Alert if a daemon-mode backend missed its reimport: REIMPORT_INTERVAL_MAX_DAYS
# plus REIMPORT_JITTER_HOURS (default 6) plus time for the import itself.
# Shown for MAX_DAYS=5; one-shot backends (no daemon) only re-import by hand.
spielplatz_backend_data_age_seconds > (5 * 86400 + 6 * 3600 + 3600)

# Alert if the hub poll has stopped writing (cron died)
time() - spielplatz_poll_generated_timestamp > 300

# Detailed share per backend (fraction of playgrounds mapped as detailed)
spielplatz_backend_playgrounds_complete / spielplatz_backend_playgrounds_total

# Playgrounds with no details yet, across all backends
sum(spielplatz_backend_playgrounds_missing)

# Alert if the detailed share drops below 50 % for any backend
spielplatz_backend_playgrounds_complete / spielplatz_backend_playgrounds_total < 0.5

# Which backends are currently importing (data in flux)?
spielplatz_backend_importing == 1

# Backend online but no data and not importing (degraded ring state)
spielplatz_backend_up == 1
  and spielplatz_backend_importing == 0
  and spielplatz_backend_playgrounds_total == 0
```

### Recipe 3 — Bundled Prometheus + Grafana dashboard

`deploy/monitoring/` is a ready-made stack: Prometheus scraping one hub, and Grafana with the datasource and a **spieli federation** dashboard provisioned.

```bash
cd deploy/monitoring
# point prometheus.yml at your hub (default: a hub-mode stack on this machine, port 8080)
docker compose up -d
```

Grafana opens at `http://127.0.0.1:3001` (read-only, no login), Prometheus at `http://127.0.0.1:9091`. Both bind to loopback only. Before exposing Grafana anywhere else, turn `GF_AUTH_ANONYMOUS_ENABLED` off in `compose.yml` and set an admin password.

Keep the job name `spieli_hub` when changing the target; every panel selects on it. A remote hub needs `scheme: https` and its host as target — the commented example in `prometheus.yml`. A standalone stack serves only `spielplatz_poll_generated_timestamp`, so most panels stay empty against it.

| Panel | Shows |
|---|---|
| Backends up / down | How many backends answered the last `get_meta` probe |
| Playgrounds (all backends) | Sum of `playgrounds_total` |
| Hub poll age | Seconds since the hub last wrote `/metrics` — high means the poll cron died and every other panel is frozen |
| Up per backend, Importing | Per-backend state over time |
| get_meta latency | Probe round-trip from the hub server |
| Import age, OSM data age | Time since the last import, and age of the OSM extract it imported |
| Detailed share, mapping-detail bars, counts table, totals | Playgrounds per backend split into detailed / basic / no details yet |

Every panel carries a description (the ⓘ next to its title) of what it shows and what an unusual value means; the data source and the mapping-detail rule are explained once, in the *About this dashboard* panel at the top.

The dashboard is a provisioned file (`grafana/dashboards/federation.json`): edits made in the Grafana UI cannot be saved over it. Export the JSON from the UI and replace the file instead.

### Recipe 4 — Frontend error monitoring

spieli ships no frontend error reporting, and adding one needs your own image: see [Customise your own image → Frontend error reporting](customise-image.md#frontend-error-reporting).

## See also

- [Federation](../reference/federation.md) — overall federation architecture, `registry.json` format.
- [registry.json reference](../reference/registry-json.md) — backend slug, URL, and metadata fields.
- [API reference](../reference/api.md) — `get_meta()` response shape including `last_import_at`.
