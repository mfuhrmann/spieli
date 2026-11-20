# Upgrading spieli

## Before you upgrade

Check [GitHub Releases](https://github.com/mfuhrmann/spieli/releases) for the latest version and scan the release notes for **breaking labels**. Most releases carry none and require no manual action.

| Label | What it means | What you must do |
|---|---|---|
| `requires-env-update` | New or removed env var | Update `.env` **before** pulling the new image |
| `requires-compose-update` | `compose.yml` changed structurally | Re-run `install.sh` or update `compose.yml` manually **before** restarting |
| `requires-reimport` | OSM data model changed | Trigger a full re-import **after** the image update lands |
| `requires-schema-update` | `api.sql` changed | With Watchtower: nothing, the daemon applies it on restart. Manual upgrade: steps 2–4 below |

To check what version is currently running:

```bash
docker inspect spieli-app-1 --format '{{index .Config.Labels "org.opencontainers.image.version"}}'
# or
docker compose images
```

---

## Automatic upgrade (Watchtower)

The installer's "automatic updates" answer turns on the `auto-update` profile, which runs Watchtower. To enable it by hand, add the profile to your `up` command:

```bash
docker compose --profile <mode> --profile auto-update up -d
```

Watchtower checks the image registry (GHCR) once every 24 hours. When a new image is published it pulls it, restarts `app` and `importer`, and removes the replaced image:

- The daemon importer applies a changed `api.sql` when its container starts, so schema changes take effect right after the restart — no separate `API_ONLY=1` step needed. An unchanged `api.sql` is skipped (#971).
- The importer's startup grace check prevents an unplanned re-import: if a recent import is on record, it goes back to sleep ([Scheduled Import → What happens on container startup](scheduled-import.md#what-happens-on-container-startup)).

**Standard releases (no breaking labels): nothing to do.** A new release reaches your stack within a day.

For **breaking-label releases**, follow the [Breaking label procedures](#breaking-label-procedures) below in addition to the Watchtower restart. Subscribe to [GitHub Releases](https://github.com/mfuhrmann/spieli/releases) so you notice them.

!!! note "One Watchtower per host"
    Watchtower watches **every** container on the Docker host, not only its own stack. With several stacks on one host, only one of them (by convention the hub) runs `--profile auto-update`; a second Watchtower would fight the first over the same containers. The data-node stacks are still updated, without the profile.

---

## Manual upgrade

Use manual steps when you don't run Watchtower, or when a breaking label requires a specific action sequence.

### Hub (DEPLOY_MODE=ui)

The hub has no database and no importer — only the app container needs updating.

```bash
cd /path/to/your/spieli-hub

docker compose pull
docker compose --profile ui up -d app
```

Done. No `API_ONLY=1`, no importer, no verify step needed.

### Standalone or Data-node (DEPLOY_MODE=data-node-ui or data-node)

Replace `<mode>` with your `DEPLOY_MODE` and `<port>` with your `APP_PORT`.

**Step 1 — Pull new images**

```bash
docker compose pull
```

**Step 2 — Stop the daemon importer**

```bash
docker compose --profile <mode> stop importer
```

This is not optional, and it is not the same as "the daemon is idle". The daemon applies `api.sql` on **container startup**, so anything that restarts it — a reboot, Watchtower, `up -d` — makes it a second writer against the same schema. Stopping it removes that possibility for the duration of the apply.

**Step 3 — Apply schema changes (API_ONLY)**

```bash
docker compose --profile <mode> run --rm -e API_ONLY=1 importer
```

This updates all PostgREST functions and the version number reported by `get_meta`. It runs as a one-shot container, and with the daemon stopped it is the only writer.

!!! info "Concurrent applies queue rather than race"
    `api.sql` takes a session-level advisory lock, so if something applies the schema at the same time — a manual `make db-apply`, a Watchtower-triggered restart — the second one waits instead of corrupting the first.

    That is a safety net, not a substitute for step 2. **The last writer still wins**, and the lock cannot tell an old image from a new one: if the daemon on its *previous* image applies last, the stack ends up serving the old schema while reporting healthy. Stopping it first is what prevents that.

!!! info "If API_ONLY=1 fails mid-run"
    Since v0.10.0 the API stays up: `playground_stats` is built under a staging name and swapped in, so a crash before the swap leaves the previous view serving traffic. Re-run `API_ONLY=1` after fixing the cause — the staging view is dropped and rebuilt on the next attempt. On v0.9.0 and earlier the view was dropped first, and a crash partway through left it gone, with PostgREST logging `relation "public.playground_stats" does not exist`; recovery there is a full re-import.

**Step 4 — Recreate the daemon importer on the new image**

```bash
docker compose --profile <mode> up -d --force-recreate importer
```

`--force-recreate` matters. A plain `up -d importer` **restarts the existing container**, which leaves the daemon on the *old* image — and since its startup path applies `api.sql`, the old image then becomes the last writer and quietly restores the old schema. That is what happened during the v0.9.0 sweep ([#800](https://github.com/mfuhrmann/spieli/issues/800)): the stack ran the new app against the old schema, with two filters silently wrong while `get_meta` and row counts looked healthy.

!!! info "What the recreated daemon does on startup"
    It compares the `api.sql` it would apply with the one step 3 just applied. They match, so it skips the apply and logs `api.sql and the live schema unchanged since the last completed apply — skipping the startup apply` (#971). If it logs `Applying API schema on startup` instead, it rebuilds `playground_stats`, which takes minutes on a large region. The API keeps serving meanwhile, from the previous view, which is swapped out only at the end. Either way, check the log before verifying:

    ```bash
    docker compose --profile <mode> logs -f importer
    ```

**Step 5 — Restart the app container**

```bash
docker compose --profile <mode> up -d app
```

**Step 6 — Verify**

```bash
curl -sf http://localhost:<port>/api/rpc/get_meta | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('version:', d['version'], ' playgrounds:', d['playground_count'])"
```

Both `version` and `playground_count` should be non-zero. If `playground_count` is 0, see [If playground_count is zero after upgrade](#if-playground_count-is-zero-after-upgrade) below.

Retry it for a few minutes if it fails: the daemon's startup apply from step 4 has to finish first, and until it does the API is legitimately unavailable.

Verifying **after** step 4 is deliberate. Verifying before it checks a stack whose last writer may still be the old image, and the old schema is internally consistent enough to pass.

To confirm the schema really is the new one, compare the **version** `get_meta` reports against the release you just installed:

```bash
curl -sf http://localhost:<port>/api/rpc/get_meta | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['version'])"
```

`version` comes from the image that last applied `api.sql`, so it is the one field that distinguishes "the new schema is in place" from "an older image applied last". Do **not** check for the presence of a column instead: a column added in an earlier release is present in both schemas, so the check passes on the old one and gives false assurance in exactly the failure mode #800 is about.


---

## Breaking label procedures

### requires-env-update

1. Read the release notes to find the new or removed variable.
2. Update `.env` accordingly.
3. Then proceed with the normal upgrade steps for your deployment type.

### requires-compose-update

`compose.yml` has structural changes (new service, renamed service, removed volume).

The installed `compose.yml` is the repository's `compose.prod.yml`, renamed. Fetch it from the release you are upgrading to, not from `main`, and not the repository's own `compose.yml` (that is the development stack):

```bash
TAG=vX.Y.Z   # the release you are upgrading to
cp compose.yml compose.yml.bak
curl -fsSL "https://raw.githubusercontent.com/mfuhrmann/spieli/${TAG}/compose.prod.yml" -o compose.yml

# Recreate the stack:
docker compose --profile <mode> down
docker compose --profile <mode> up -d
```

Compare with `compose.yml.bak` for anything you changed by hand. On a hub set up by the installer that includes the `registry.json` bind-mount, which the installer enabled by uncommenting a line: uncomment it again.

Or re-run `install.sh`. It downloads the new `compose.yml` and keeps your database password and modes, but asks all other questions again and rewrites `.env`.

### requires-reimport

A new OSM tag type was added. Existing data doesn't have the new columns until a fresh import.

After the image update (Watchtower or manual steps 1–2), run one full import as described in [Refresh Data](refresh-data.md) — on a stack with automatic updates that means stopping the daemon first ([Daemon mode](refresh-data.md#daemon-mode)). A full import also applies `api.sql`, so no separate `API_ONLY=1` step is needed.

---

## Single-host federation (multiple stacks on one VPS)

When the hub and its data-nodes share a single VPS, use `scripts/upgrade-stacks.sh`. It handles the correct order (data-nodes first, hub last) and runs each stack sequentially to avoid OOM from concurrent importer runs.

Copy the script to the VPS once, then edit the `STACKS` array to match your port layout:

```bash
scp scripts/upgrade-stacks.sh user@vps:~/upgrade-stacks.sh
```

```bash
STACKS=(
  "$HOME/spieli-hessen:data-node-ui:8081"
  "$HOME/spieli-berlin:data-node-ui:8082"
  "$HOME/spieli:ui auto-update:8080"   # hub last
)
```

Run:

```bash
bash ~/upgrade-stacks.sh
```

Per stack, in this order — the order is the point, and it is not the one an
earlier version of this page described:

1. **Pull images.**
2. **Stop the daemon importer** (data-nodes only), so it cannot race the schema
   apply. The manual procedure above calls this not optional; the script does
   it for you.
3. **Apply `api.sql`** via a one-shot `API_ONLY=1` importer, which never
   triggers a full reimport. If it fails, the daemon importer is brought back
   up *before* the sweep aborts, so a failed run never leaves a stack with its
   importer stopped.
4. **Recreate the daemon importer** with `up -d --force-recreate`. The plain
   restart form is what left daemons running the old image during the v0.9.0
   sweep.
5. **Restart the app container** — last, so it never serves against a schema
   the database does not have yet.
6. **Verify** by polling `get_meta` for up to 180 s, treating only `200` and
   `404` as settled. Verifying before step 4 is precisely what made [#800]
   invisible: the old schema is internally consistent enough to pass.

[#800]: https://github.com/mfuhrmann/spieli/issues/800

The hub entry skips steps 2–4 automatically.

**The sweep runs one heavy job at a time** (#971). After a data-node's app is restarted and verified, the sweep waits until its importer logs `[importer] settled` — no schema rebuild or import running or imminent — before touching the next stack; a stack that was mid-import waits for that import to end, and the zero-playground safety-net reimport now runs in the foreground. Up to `SETTLE_TIMEOUT_MIN` (default 120) minutes each, then the sweep stops rather than overlap two stacks. Before, it moved on as soon as `get_meta` answered, which it does at once because the old view keeps serving during a rebuild; during the v0.12.0 sweep two stacks' rebuilds overlapped and the host ran out of memory. Combined with the daemon skipping an unchanged startup apply, a sweep of already-current stacks does no rebuild at all.

**A sweep restarts every import clock.** Recreating the daemon importer runs
its startup grace check, and every stack whose import is overdue imports right
then. Since #882 each such import first waits a random 0–`REIMPORT_JITTER_HOURS`
(default 6 h), so a sweep no longer stamps all of them into one window — but on
a memory-constrained host it is still worth checking the spread afterwards
(see [Scheduled import → Keeping stacks from importing at the same
time](scheduled-import.md#keeping-stacks-from-importing-at-the-same-time)).

**A stack that is mid-import is skipped, not forced.** If `get_meta` reports
`importing: true`, the script leaves the schema alone and says so: stopping the
importer there would SIGKILL `osm2pgsql` after 10 s and leave the database
partially imported. The app is still upgraded, and the stack is listed
separately at the end — re-run the sweep for it once the import has finished.

> **The script does not touch `.env` or `compose.yml`.** A release labelled
> `requires-env-update` or `requires-compose-update` needs those applied to
> every stack **before** the sweep. It is easy to miss, because the script
> otherwise looks like the whole federation procedure.

**Verification is not fatal to the sweep.** By the time a stack is verified its images are already pulled and its containers restarted, so a failed check means the upgrade worked but the stack is not serving data yet. The script records the stack, carries on with the rest, and exits non-zero at the end listing every inconclusive one. A data-node that has never completed an import answers `404` on `get_meta` and is called out as such — expected until its first import finishes.

If the sweep does abort — a failed image pull or container start — it prints which stacks were upgraded, which one it stopped on, and that everything from there onward was not reached. Completed stacks are idempotent, so re-run after fixing the cause. One caveat it will warn you about: if a forced reimport was launched in the background before the abort, wait for it to finish first, or the next run's `API_ONLY=1` step races it on the `playground_stats` rebuild.

---

## Special cases

### If playground_count is zero after upgrade

`get_meta` returns `playground_count: 0` after an upgrade when `playground_stats` was left in a broken state (see the API_ONLY race warning above), or when the database volume was wiped.

Recovery: run a full re-import, with the daemon stopped so it is the only writer.

```bash
docker compose --profile <mode> stop importer
docker compose --profile <mode> run --rm \
  -e REIMPORT_INTERVAL_MIN_DAYS= -e REIMPORT_INTERVAL_MAX_DAYS= importer
docker compose --profile <mode> up -d importer
```

The empty `REIMPORT_INTERVAL_*` overrides make the run a one-shot import that starts immediately, regardless of when data was last imported.

### If you deleted the database volume

`docker compose down -v` or `docker volume rm <stack>_pgdata` wipes all imported data. Before re-importing:

1. Check whether the PBF cache volume survived:

    ```bash
    docker volume ls | grep pbf_cache
    ```

2. If it exists, clear it — a previously interrupted import may have left a corrupt filtered PBF. The importer checks timestamps but not content; a corrupt cache causes it to process 0 objects and leave the database silently empty.

    ```bash
    docker volume rm <stack>_pbf_cache
    ```

3. Run a full re-import. With automatic updates, simply start the stack: on an empty database the daemon imports right away. Without them, run it once:

    ```bash
    docker compose --profile <mode> run --rm importer
    ```

4. Verify with `get_meta` as shown in the manual upgrade section.

### PostgreSQL major version

A release that moves to a new PostgreSQL major version (e.g. 16 → 17) carries `requires-compose-update` and `requires-reimport`, and its notes say so. The new PostgreSQL cannot read the old data directory, so the database volume is recreated and the data imported again — it all comes from OpenStreetMap, so nothing is lost:

```bash
docker compose --profile <mode> down
# fetch the new compose.yml as under requires-compose-update above
docker volume rm <project>_pgdata          # docker volume ls shows the exact name
docker compose --profile <mode> up -d
```

The import then starts as described in [Refresh Data → After deleting the database](refresh-data.md#after-deleting-the-database). Back up first only if you keep data in the database that does not come from the import.

### Downgrading

Supported only within the same minor version. Pin a specific version by editing `compose.yml`:

```yaml
# Change :latest to the version you want, for both images:
image: ghcr.io/mfuhrmann/spieli:0.4.0
image: ghcr.io/mfuhrmann/spieli-importer:0.4.0
```

```bash
docker compose pull
docker compose --profile <mode> up -d
```

The database schema is not automatically rolled back. If the new version added columns or functions, the older app typically ignores them — but this is not tested. When in doubt, re-import from scratch.

---

## See also

- [Configuration reference](configuration.md) — check for new or changed variables before upgrading
- [Troubleshooting](troubleshooting.md) — common post-upgrade issues
- [Single-host Federation](single-host-federation.md) — multi-stack setup and the upgrade script
- [RELEASING.md](https://github.com/mfuhrmann/spieli/blob/main/RELEASING.md) — how releases are cut (maintainer reference)
