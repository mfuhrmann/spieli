# Scheduled Import

Geofabrik publishes updated OSM extracts daily. Running the importer on a schedule keeps your playground data fresh without manual intervention.

## Daemon mode (recommended)

!!! note "Terminology"
    "Daemon mode" here refers to the importer container's **scheduling behaviour** — whether it loops and re-imports automatically or exits after one run. This is separate from `DEPLOY_MODE` (which services start) and `APP_MODE` (standalone vs hub frontend).

The importer container has a built-in daemon mode: set `REIMPORT_INTERVAL_MIN_DAYS` and `REIMPORT_INTERVAL_MAX_DAYS` in `.env` and the container loops forever, re-importing at a random interval within that range. No host cron, no systemd unit — the container manages its own schedule.

```env
REIMPORT_INTERVAL_MIN_DAYS=6
REIMPORT_INTERVAL_MAX_DAYS=8
```

A random interval in `[MIN, MAX]` days is chosen after each successful import, spreading load across operators who deploy at similar times. When the importer container restarts (e.g. after a Watchtower image update), it checks the last import timestamp in the database — if a recent import is on record, it sleeps the remaining interval rather than re-importing immediately.

### What happens on container startup

Every daemon-mode start runs the same three steps before the schedule takes over:

1. **Apply `api.sql`** — so schema changes carried by a new image take effect at once instead of waiting up to `REIMPORT_INTERVAL_MAX_DAYS` for the next import. Without this a Watchtower update would leave the app on the old schema. **Skipped when nothing changed** (#971): every completed apply records in `public.spieli_schema_apply` a hash of the rendered `api.sql` (settings such as `PG_WORK_MEM` and the legal URLs included) and a fingerprint of the live schema (the `api` functions and the `playground_stats` definition). A start skips only when both still match — it logs `api.sql and the live schema unchanged since the last completed apply — skipping the startup apply.` Anything else that touched the schema (a rollback image, `make db-apply` of an edited file, an import killed after `osm2pgsql` dropped the tables — the record is also cleared before every import) changes the fingerprint, and the start applies as before. Rebuilding `playground_stats` is the importer's memory peak; running it on every restart is what let an upgrade sweep's rebuilds overlap and exhaust a 7.7 GB host.

When the daemon is about to be idle for 30 minutes or more it logs `[importer] settled — idle for …s`. `scripts/upgrade-stacks.sh` waits for that line, so keep it if you change the log output.
2. **Grace check** — if a recent import is on record, sleep the remainder of the interval instead of re-importing.
3. **Import** — otherwise run the import immediately, then loop.

Step 1 is **skipped when no import has ever completed**. `api.sql` builds views over the `planet_osm_*` tables that only exist after the first import, so applying it on a fresh database would fail and restart-loop the container before the import could run. You will see this on a first start:

```
[importer] No completed import on record — deferring API schema apply to first import.
```

The import that follows applies the schema itself, so nothing is lost. Both step 1 and step 2 key off the same marker (`api.import_status`), which is what makes deferring safe: if the marker is absent, the grace check also finds no timestamp and falls straight through to the import. The only wait that can intervene is the deliberate fresh-install stagger (`REIMPORT_STARTUP_JITTER_MAX_HOURS`) — never a grace sleep.

If the importer cannot reach the database to answer that question, it retries, then says so and continues to the import rather than assuming either answer:

```
[importer] WARNING: import state unknown after 3 attempts — skipping startup API schema apply and continuing to import.
```

Seeing that line on a populated node means credentials or connectivity need attention — see [Troubleshooting](troubleshooting.md).

!!! note "When both vars are unset (default)"
    The importer runs once and exits (one-shot mode). Use this when you manage scheduling externally (systemd, cron).

### Enabling daemon mode

Add the two vars to `.env`:

```env
REIMPORT_INTERVAL_MIN_DAYS=6
REIMPORT_INTERVAL_MAX_DAYS=8
```

Then recreate the importer so it picks up the new env (`restart` would keep the old container and its old environment):

```bash
docker compose --profile data-node-ui up -d importer
```

Check that it entered daemon mode:

```bash
docker compose logs importer | grep -i daemon
# [importer] Daemon mode: interval 6–8 days, jitter up to 6h.
```

### Keeping stacks from importing at the same time

Several stacks on one host must not run `osm2pgsql` together — it is the
memory peak of the whole pipeline. Two mechanisms spread them out (#882):

- **`REIMPORT_JITTER_HOURS`** (default `6`) adds a random 0–6 h to every
  scheduled wait, and delays an import that is already overdue at startup by
  the same amount — but never past `MAX_DAYS` plus one jitter window after the
  last import, so frequent restarts cannot keep postponing it. Without it, a
  restart of every stack (an upgrade sweep, a host reboot) stamped all overdue
  stacks with nearly the same `last_import_at`; with `MIN == MAX` each stack
  then only moved by its own import duration, so stacks with similar import
  times kept their shared slot. With it, slots drift apart every cycle. Set
  it to `0` only if a single stack runs on the host.

Jitter makes overlap unlikely, not impossible: there is no lock between
stacks on one host (tracked in #961).
- **`REIMPORT_STARTUP_JITTER_MAX_HOURS`** (default `0`) staggers the *first*
  import on a fresh database, for deploying many stacks at once.

Both draw from `/dev/urandom`. Before #882 they were seeded from the clock's
current second, so containers started together drew the same "random" value.
Values that are not whole numbers are replaced by the default with a warning
in the importer log, as is `MIN > MAX` (swapped).

Every wait logs the absolute time of the next run, so the spread on a host is
one loop away:

```bash
for d in ~/spieli-*; do
  printf '%-28s ' "$(basename "$d")"
  docker compose --project-directory "$d" logs importer 2>/dev/null \
    | grep -o 'next run at .*' | tail -n 1
done
```

## Automatic image updates with Watchtower

Watchtower complements daemon mode: it installs new spieli images once a day, and the startup grace check above keeps those restarts from triggering an unplanned re-import. How to enable it and what it does: [Upgrading → Automatic upgrade](upgrade.md#automatic-upgrade-watchtower).

## How long does an import take?

See [Sizing → Import duration](../reference/sizing.md#import-duration).

## How fresh is the data?

Geofabrik refreshes most regional extracts daily. The importer stores two timestamps in the database:

- **`last_import_at`** — when the importer script ran (visible via `GET /api/rpc/get_meta`)
- **`osm_data_timestamp`** — the `osmosis_replication_timestamp` header from the source PBF, which reflects when Geofabrik generated that extract (can be up to a week old for less-trafficked regions)

Both are surfaced in [Monitoring → `/federation-status.json`](monitoring.md).

## Without daemon mode (host-managed scheduling)

If you prefer external scheduling, leave `REIMPORT_INTERVAL_MIN_DAYS` and `REIMPORT_INTERVAL_MAX_DAYS` unset. The importer exits with code 0 after a successful one-shot run.

### systemd timer

spieli ships unit files in the repository's `deploy/` directory for Linux hosts with systemd. The installer does not download them; fetch them for your release:

```bash
TAG=vX.Y.Z   # the release you run (docker compose images shows it)
RAW=https://raw.githubusercontent.com/mfuhrmann/spieli/${TAG}/deploy
sudo curl -fsSL "$RAW/spieli-import.service" -o /etc/systemd/system/spieli-import.service
sudo curl -fsSL "$RAW/spieli-import.timer"   -o /etc/systemd/system/spieli-import.timer
```

Open `/etc/systemd/system/spieli-import.service` and set:

- `WorkingDirectory=` — directory where `compose.yml` and `.env` live (e.g. `/opt/spieli`)
- `EnvironmentFile=` — path to `.env` (usually `WorkingDirectory/.env`)
- `User=` — add it, set to a user in the `docker` group that owns the deployment directory (the shipped unit has none, so it runs as root)

The shipped timer uses `OnCalendar=weekly`, which systemd reads as Monday 00:00, with `Persistent=true` so a run missed while the host was off happens at the next boot. Change the schedule in `spieli-import.timer`, for example:

```ini
[Timer]
OnCalendar=Sun 04:00      # weekly, Sunday 4 AM
# OnCalendar=daily         # every day at midnight
# OnCalendar=*-*-* 03:30  # every day at 3:30 AM
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now spieli-import.timer
systemctl list-timers spieli-import.timer
```

### Host cron

```cron
0 4 * * 0 cd /opt/spieli && docker compose --profile data-node-ui run --rm importer >> /var/log/spieli-import.log 2>&1
```

## See also

- [Refresh Data](refresh-data.md) — trigger an immediate re-import outside of the schedule
- [Monitoring](monitoring.md) — observe import freshness via federation-status and Prometheus
- [Backup and Restore](backup-restore.md) — database backups before major import runs
- [Configuration reference](configuration.md) — `OSM_RELATION_ID`, `PBF_URL`, `OSM2PGSQL_THREADS`, `REIMPORT_INTERVAL_MIN_DAYS`, `REIMPORT_INTERVAL_MAX_DAYS`
