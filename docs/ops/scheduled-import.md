# Scheduled Import

Geofabrik publishes updated OSM extracts daily. Running the importer on a schedule keeps your playground data fresh without manual intervention.

spieli ships systemd unit files in `deploy/` for automated weekly imports on Linux servers.

## Using the bundled systemd units

### 1. Copy the unit files

```bash
sudo cp deploy/spieli-import.service /etc/systemd/system/
sudo cp deploy/spieli-import.timer   /etc/systemd/system/
```

### 2. Configure the service

Open `/etc/systemd/system/spieli-import.service` and set:

- **`WorkingDirectory=`** — the directory where your `compose.prod.yml` and `.env` live (e.g. `/opt/spieli`)
- **`EnvironmentFile=`** — path to your `.env` file (should match `WorkingDirectory` + `/.env`)
- **`User=`** — uncomment and set to the user that owns the deployment directory and is in the `docker` group

The `ExecStart` command runs `docker compose run --rm importer` using whichever `DEPLOY_MODE` is set in your `.env`. Both `data-node` and `data-node-ui` profiles include the importer container.

### 3. Configure the timer

The default timer (`spieli-import.timer`) fires weekly on Sunday at 04:00. To change the schedule, edit `OnCalendar=`:

```ini
[Timer]
OnCalendar=Sun 04:00      # weekly, Sunday 4 AM
# OnCalendar=daily         # every day at midnight
# OnCalendar=*-*-* 03:30  # every day at 3:30 AM
```

See `man systemd.time` for the full calendar syntax.

### 4. Enable and start the timer

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now spieli-import.timer
```

Verify:

```bash
systemctl status spieli-import.timer
systemctl list-timers spieli-import.timer
```

### 5. Test a manual run

```bash
sudo systemctl start spieli-import.service
journalctl -u spieli-import.service -f
```

The import typically finishes in 20–30 seconds (PBF cached), or 2–5 minutes on the first run.

## How long does an import take?

| Scenario | Typical duration |
|---|---|
| First run, PBF not cached | 2–5 min (dominated by ~300 MB download) |
| First run, PBF already cached | 30–60 s |
| Re-run, both filtered PBFs cached | 20–30 s |

All three files (source PBF, bbox-clipped PBF, tag-filtered PBF) are stored in the `pbf_cache` Docker volume and reused automatically. Only the final osm2pgsql + api.sql step runs every time.

## How fresh is the data?

Geofabrik refreshes most regional extracts daily. The importer stores two timestamps in the database:

- **`last_import_at`** — when the importer script ran (visible via `GET /api/rpc/get_meta`)
- **`osm_data_timestamp`** — the `osmosis_replication_timestamp` header from the source PBF file, which reflects when Geofabrik last generated that extract (can be up to a week old for less-trafficked regions)

Both are surfaced in [Monitoring → `/federation-status.json`](monitoring.md).

## Without systemd (Docker-based scheduler)

If your host does not use systemd, you can schedule imports using the host's cron:

```cron
0 4 * * 0 cd /opt/spieli && docker compose -f compose.prod.yml --profile data-node-ui run --rm importer >> /var/log/spieli-import.log 2>&1
```

Or use a scheduled container (e.g. `mcuadros/ofelia`) within the Compose stack.

## See also

- [Monitoring](monitoring.md) — how to observe import freshness via federation-status and Prometheus
- [Backup and Restore](backup-restore.md) — database backups before major import runs
- [Configuration reference](configuration.md) — `OSM_RELATION_ID`, `PBF_URL`, `OSM2PGSQL_THREADS`
