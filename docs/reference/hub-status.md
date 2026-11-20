# Hub status and metrics

A hub container publishes two endpoints about the regions it lists. Both are written atomically every 60 seconds by a cron job inside the container, need no authentication, and are served with `Cache-Control: no-store`.

| Endpoint | Format | Purpose |
|---|---|---|
| `/federation-status.json` | JSON | Human-readable per-backend rollup; also read by the hub's own UI |
| `/metrics` | Prometheus text | Scrape target for Prometheus/Grafana stacks |

How to watch them — uptime checks, Prometheus alerts, the bundled Grafana dashboard: [Monitoring](../ops/monitoring.md).

## `/federation-status.json`

```json
{
  "generated_at": "2026-04-26T12:00:00Z",
  "poll_interval_seconds": 60,
  "backends": {
    "fulda": {
      "url": "https://fulda.example.com/api",
      "up": true,
      "latency_seconds": 0.043,
      "last_success": "2026-04-26T12:00:00Z",
      "last_import_at": "2026-04-25T03:12:00Z",
      "data_age_seconds": 118080,
      "osm_data_timestamp": "2026-04-24T21:00:00Z",
      "osm_data_age_seconds": 140400,
      "playground_count": 42,
      "complete": 28,
      "partial": 10,
      "missing": 4
    }
  }
}
```

**Fields:**

| Field | Notes |
|---|---|
| `generated_at` | ISO 8601 timestamp when this file was written. Use this to detect a frozen hub (`generated_at` older than `2 × poll_interval_seconds`). |
| `poll_interval_seconds` | Always `60` in the current release. |
| `backends.<slug>.up` | `true` if the backend responded to `GET /rpc/get_meta` within 3 s. |
| `backends.<slug>.latency_seconds` | Round-trip time of the last successful poll. `0` on failure. |
| `backends.<slug>.last_success` | ISO 8601 timestamp of the last successful probe, preserved across failures. `null` if the backend was never reachable. |
| `backends.<slug>.last_import_at` | Value of `api.import_status.last_import_at` from the backend DB. `null` if no import has run or backend is down. |
| `backends.<slug>.data_age_seconds` | Seconds since `last_import_at`. `null` if `last_import_at` is `null`. |
| `backends.<slug>.osm_data_timestamp` | Replication timestamp of the OSM extract the backend imported (when Geofabrik generated it). `null` if the PBF header lacks it, the backend predates the field, or it is down. |
| `backends.<slug>.osm_data_age_seconds` | Seconds since `osm_data_timestamp` — how old the served data is, which is always at least `data_age_seconds`. `null` when `osm_data_timestamp` is. |
| `backends.<slug>.playground_count` | Total playgrounds in the region. `null` on backends older than v0.4.9 or when backend is down. |
| `backends.<slug>.complete` | Playgrounds with detailed mapping: play equipment and info (opening_hours, surface or access). `null` on backends older than v0.4.9. |
| `backends.<slug>.partial` | Playgrounds with basic mapping: play equipment or info, not both. `null` on backends older than v0.4.9. |
| `backends.<slug>.missing` | Playgrounds with no details yet: neither play equipment nor info. `null` on backends older than v0.4.9. |
| `backends.<slug>.importing` | `true` while the backend's importer is running osm2pgsql. `false` on backends that predate the field. |
| `backends.<slug>.version` | The spieli release the backend runs, from its `get_meta`. `null` when down or unknown. |
| `backends.<slug>.impressum_url` / `privacy_url` | The backend's legal pages, from its `get_meta`. `null` when not configured. |
| `backends.<slug>.has_legal` | `true` when the backend stores generated legal text (`api.legal_content`); the hub then shows the legal links even without URLs. |

The cron job rewrites this file every 60 seconds; browsers re-read it every `HUB_POLL_INTERVAL` seconds (default 300) and show its freshness labels in the region list. When `generated_at` is older than `2 × poll_interval_seconds` (the hub cron has stopped writing), the list marks the data "Observation status outdated".

## `/metrics`

Prometheus text exposition format (version 0.0.4):

```
# HELP spielplatz_backend_up 1 if the backend responded to get_meta, 0 otherwise.
# TYPE spielplatz_backend_up gauge
spielplatz_backend_up{backend="fulda",url="https://fulda.example.com/api"} 1

# HELP spielplatz_backend_importing 1 while osm2pgsql is actively running on this backend, 0 otherwise.
# TYPE spielplatz_backend_importing gauge
spielplatz_backend_importing{backend="fulda",url="https://fulda.example.com/api"} 0

# HELP spielplatz_backend_latency_seconds Round-trip time for the last get_meta call.
# TYPE spielplatz_backend_latency_seconds gauge
spielplatz_backend_latency_seconds{backend="fulda",url="https://fulda.example.com/api"} 0.043

# HELP spielplatz_backend_data_age_seconds Seconds since the backend last imported data.
# TYPE spielplatz_backend_data_age_seconds gauge
spielplatz_backend_data_age_seconds{backend="fulda",url="https://fulda.example.com/api"} 118080

# HELP spielplatz_backend_osm_data_age_seconds Seconds since the OSM source data the backend serves was snapshotted (PBF replication timestamp).
# TYPE spielplatz_backend_osm_data_age_seconds gauge
spielplatz_backend_osm_data_age_seconds{backend="fulda",url="https://fulda.example.com/api"} 140400

# HELP spielplatz_backend_playgrounds_total Total number of playgrounds in the region.
# TYPE spielplatz_backend_playgrounds_total gauge
spielplatz_backend_playgrounds_total{backend="fulda",url="https://fulda.example.com/api"} 42

# HELP spielplatz_backend_playgrounds_complete Playgrounds with detailed mapping: play equipment and info (opening_hours, surface or access).
# TYPE spielplatz_backend_playgrounds_complete gauge
spielplatz_backend_playgrounds_complete{backend="fulda",url="https://fulda.example.com/api"} 28

# HELP spielplatz_backend_playgrounds_partial Playgrounds with basic mapping: play equipment or info, not both.
# TYPE spielplatz_backend_playgrounds_partial gauge
spielplatz_backend_playgrounds_partial{backend="fulda",url="https://fulda.example.com/api"} 10

# HELP spielplatz_backend_playgrounds_missing Playgrounds with no details yet: neither play equipment nor info.
# TYPE spielplatz_backend_playgrounds_missing gauge
spielplatz_backend_playgrounds_missing{backend="fulda",url="https://fulda.example.com/api"} 4

# HELP spielplatz_poll_generated_timestamp Unix timestamp when this scrape was generated.
# TYPE spielplatz_poll_generated_timestamp gauge
spielplatz_poll_generated_timestamp 1745668800
```

`spielplatz_backend_data_age_seconds`, `spielplatz_backend_osm_data_age_seconds` and the four completeness gauges are omitted for a backend when the field is `null` (backend down, backend older than v0.4.9, or no import yet). `spielplatz_backend_importing` is always emitted when the backend is reachable; it defaults to `0` for older backends that predate the `importing` field in `get_meta`.
