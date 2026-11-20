# Watching your instance

How to notice when your region stops answering or its data goes stale. This page is for the operator of a single instance (a data-node or a standalone map). Running a hub? Its endpoints and dashboard are described in [Monitoring](monitoring.md).

## If you host a region for spieli.eu

Your region is already watched: the spieli.eu hub polls every region once a minute, and its dashboard at [stats.spieli.eu](https://stats.spieli.eu) shows whether yours is reachable, when it last imported and how many playgrounds it serves. Nobody alerts you from there, though. If you want to hear about an outage before your visitors do, add your own check as below.

## Your own check

Everything you need is in `get_meta`, which every instance answers:

```bash
curl -s https://<your-domain>/api/rpc/get_meta | python3 -m json.tool
```

Point any HTTP uptime tool (UptimeRobot, Better Stack, a cron job with `curl`) at that URL and check:

| Field | Healthy | What a bad value means |
|---|---|---|
| HTTP status | `200` | Not reachable, or PostgREST is down. A `404` before the first import has completed is expected. |
| `playground_count` | greater than `0` | The import produced nothing: see [Troubleshooting → Map loads but shows no playgrounds](troubleshooting.md#map-loads-but-shows-no-playgrounds). |
| `data_age_seconds` | below your `REIMPORT_INTERVAL_MAX_DAYS`, plus `REIMPORT_JITTER_HOURS` and the import time | The scheduled import has stopped running. Check `docker compose logs importer`. |
| `importing` | `false` most of the time | `true` for hours on end: the import is stuck. See [Troubleshooting → Hub drawer shows "updating" badge that never clears](troubleshooting.md#hub-drawer-shows-updating-badge-that-never-clears). |
| `version` | the release you installed | An upgrade did not take effect: see [Troubleshooting → A stack serves the old schema after an upgrade](troubleshooting.md#a-stack-serves-the-old-schema-after-an-upgrade). |

Every field is described in the [API reference](../reference/api.md).

!!! note "`/metrics` is for hubs"
    Every instance serves `/metrics` and `/federation-status.json`, but only a hub fills them. On a data-node or standalone map they hold a placeholder written once at startup, so a Prometheus scraping them sees no backends at all. Watch `get_meta` instead.

Frontend errors (JavaScript errors in visitors' browsers) are not reported anywhere by default; adding that needs your own image: see [Customise your own image → Frontend error reporting](customise-image.md#frontend-error-reporting).
