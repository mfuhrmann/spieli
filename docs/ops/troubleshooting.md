# Troubleshooting

## A stack serves the old schema after an upgrade

**Symptom:** Nothing looks wrong. `get_meta` answers, row counts are plausible, the UI loads — but a filter added in the new release returns nothing, or returns the pre-release answer.

**Cause:** Two sessions applied `api.sql` around the same time, and the one that finished last came from the **older image**. The daemon importer applies the schema on container startup, so any restart of it during an upgrade makes it a second writer; and a plain `docker compose up -d importer` *restarts* the existing container rather than recreating it, so that writer is still running the previous image. The old schema is internally consistent, so every health check passes ([#800](https://github.com/mfuhrmann/spieli/issues/800)).

This is what happened sweeping v0.9.0: a stack ran the v0.9.0 app against the v0.8.0 matview, with `has_theme` missing and `has_fence` still matching `barrier=fence` only.

**Diagnose** by comparing the version `get_meta` reports against the release you installed:

```bash
curl -sf http://localhost:<port>/api/rpc/get_meta | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['version'])"
```

That field comes from the image that last applied `api.sql`, which is exactly the question. Do **not** check for the presence of a column instead: a column added in an earlier release exists in both schemas, so the check passes on the old one.

**Fix** by recreating the daemon importer on the new image, then re-checking:

```bash
docker compose --profile <mode> up -d --force-recreate importer
docker compose logs -f importer   # wait for "Done. PostgREST schema reloaded."
```

`--force-recreate` is the point: a plain `up -d` restarts the container from the image it was created with.

**Prevention.** From v0.10.0 `api.sql` takes a session-level advisory lock, so concurrent applies queue instead of corrupting each other, and `scripts/upgrade-stacks.sh` stops the importer before applying and recreates it afterwards. The lock cannot tell an old image from a new one, though — it prevents corruption, not a stale last writer — so the stop/recreate ordering still matters when upgrading by hand. See [Upgrading](upgrade.md).

---

## Schema apply fails with `relation "public.playground_stats" does not exist`

**Symptom:** An `API_ONLY=1` run dies partway through:

```
psql:/tmp/tmp.XXXXXX:352: ERROR:  relation "public.playground_stats" does not exist
```

**Cause:** Two concurrent applies, as above — on **v0.9.0 and earlier**, where `api.sql` dropped the matview and rebuilt it in place, so the second session's `DROP` removed it while the first was still indexing.

**This should no longer happen.** From v0.10.0 the rebuild builds under a staging name and swaps it in ([#720](https://github.com/mfuhrmann/spieli/issues/720)), and the advisory lock serialises applies ([#800](https://github.com/mfuhrmann/spieli/issues/800)). If you still see it, check whether something is applying an older `api.sql` — a stack that has not been upgraded, or an importer container still on a previous image.

**Recovery on v0.9.0 and earlier:** re-run `API_ONLY=1`. If the matview is gone entirely, a full re-import recreates everything.

---
## Port 8080 is already in use

**Symptom:** `docker compose up` fails with `address already in use` or `port is already allocated`.

**Fix:** Stop whatever is using port 8080, or change the port in `.env`:

```env
APP_PORT=8081
```

Then restart the stack:

```bash
docker compose -f compose.yml --profile <mode> up -d
```

---

## Import exits immediately or fails with a database error

**Symptom:** The import finishes in seconds (normally takes minutes), or you see a `connection refused` or `role does not exist` error.

**Fix:** The database must be running before you import. Start the stack first and confirm all containers are healthy:

```bash
docker compose ps   # all containers should show "running" or "healthy"
```

If you are using the local development setup, `make import` is equivalent. If the database shows as unhealthy, try stopping and restarting the stack.

---

## Importer restart-loops on a fresh install with `relation "planet_osm_point" does not exist`

**Symptom:** On a brand-new data-node install the importer never populates the database and restarts forever:

```
importer-1  | [importer] Daemon mode: interval 2–10 days, jitter up to 6h.
importer-1  | [importer] API_ONLY mode — skipping PBF download and osm2pgsql import.
importer-1  | [importer] Applying API schema...
importer-1  | psql:/tmp/tmp.JsTPhaBgfJ:87: ERROR:  relation "planet_osm_point" does not exist
importer-1 exited with code 3 (restarting)
```

**Cause:** Fixed in spieli 0.9.0 and later. Older images applied `api.sql` on daemon startup before the first import had created the `planet_osm_*` tables, so the schema apply failed and the container restarted before it ever reached the import. The `API_ONLY mode` line in the log is misleading — that banner was printed unconditionally; `API_ONLY` was not actually set.

**Fix:** Pull a current image and restart:

```bash
docker compose pull importer
docker compose --profile <mode> up -d importer
```

The importer now defers the startup schema apply until an import has completed, and logs `No completed import on record — deferring API schema apply to first import.` instead.

**Workaround for older images** — bootstrap once in one-shot mode, which imports before applying the schema, then start the daemon:

```bash
docker compose stop importer
docker compose --profile <mode> run --rm \
  -e REIMPORT_INTERVAL_MIN_DAYS= \
  -e REIMPORT_INTERVAL_MAX_DAYS= \
  importer
docker compose --profile <mode> up -d importer
```

!!! note "`API_ONLY=1` on a never-imported database"
    `api.sql` cannot be applied before the first import. Current images exit with `No completed import on record — nothing to apply yet.` instead of failing inside `api.sql`, so the `API_ONLY=1` step of a sequential upgrade sweep ([`scripts/upgrade-stacks.sh`](https://github.com/mfuhrmann/spieli/blob/main/scripts/upgrade-stacks.sh)) is no longer aborted by a stack that has never imported. The `get_meta` verification that follows also no longer aborts the sweep: such a stack has no `api` schema, so `get_meta` answers `404`, which the script reports as "most likely never completed an import" and records rather than treating as fatal. The remaining stacks are still upgraded, and the sweep exits non-zero at the end with the list of stacks whose verification was inconclusive.

---

## Map loads but shows no playgrounds

**Symptom:** Map tiles appear (streets and buildings visible) but no playground polygons are drawn, or the detail panel is empty.

**Possible causes:**

1. **Import not run or still running** — With automatic updates (daemon mode) the importer starts the first import by itself; follow it with `docker compose logs -f importer`. Without them, run it once:
   ```bash
   docker compose --profile <mode> run --rm importer
   ```
2. **Wrong relation ID** — Check `OSM_RELATION_ID` in `.env`. The importer uses it to cut your region out of the extract, and `get_meta` uses it for the region's name and bounding box, so a wrong ID shows up as a missing or wrong `name` in `get_meta`, or as playgrounds from a different area. For a state you can check which boundary is in the database (the relation ID with a minus sign):
   ```bash
   docker compose exec -u postgres db psql -U osm osm \
     -c "SELECT osm_id, name FROM planet_osm_polygon WHERE boundary='administrative' AND admin_level='4';"
   ```
   Several commonly cited IDs for German states are off; confirmed values: Mecklenburg-Vorpommern **28322**, Sachsen-Anhalt **62607**, Schleswig-Holstein **51529**. Verify at [nominatim.openstreetmap.org](https://nominatim.openstreetmap.org), fix `.env`, then run a **full** import ([Refresh Data](refresh-data.md)) — the data was cut out with the wrong area.
3. **PBF doesn't cover the relation** — The PBF extract must geographically contain the relation. If `OSM_RELATION_ID` is a large region (e.g. a whole state), the `PBF_URL` must point to a matching extract — a district or city PBF will silently produce 0 playgrounds. Check [download.geofabrik.de](https://download.geofabrik.de) for the right extract.
4. **Docker stack not running** — The app requires a live PostgREST backend. Confirm the stack is running and healthy (`docker compose ps`).
5. **Browser cache** — Try a hard reload: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac).
6. **Corrupt PBF cache** — `get_meta` reports `playground_count: 0` although the import logged success. A file left broken by an interrupted run is reused, because the importer checks timestamps, not content. [Clear the PBF cache](refresh-data.md#clearing-the-pbf-cache) and import again.
7. **Right after an upgrade** — on v0.9.0 and earlier a failed schema apply could leave `playground_stats` broken. Run a full import ([Refresh Data](refresh-data.md)); see also [A stack serves the old schema after an upgrade](#a-stack-serves-the-old-schema-after-an-upgrade).

---

## Geolocation button does nothing on mobile

**Symptom:** Tapping the location button on a phone browser has no effect — no movement, no error.

**Cause:** Browsers block the geolocation API on plain HTTP connections (including local IPs like `http://192.168.1.42:8080`). This is a browser security policy and cannot be overridden in the app.

**Fix options:**

- Test geolocation on the **production HTTPS URL**.
- On Android with **Chrome**: go to `chrome://flags`, search for "Insecure origins treated as secure", add your local URL, and relaunch Chrome.
- DuckDuckGo and Brave do not offer this workaround — use Chrome for local geolocation testing.

---

## PostgREST returns 404 or connection refused on `/api/`

**Symptom:** The app loads but every API call fails with "Failed to fetch" or the network tab shows 502/404 on `/api/rpc/*`.

**Possible causes:**

1. **PostgREST container not running** — Check `docker compose ps`. The `postgrest` service should be running and healthy.
2. **Database not ready** — PostgREST starts before PostgreSQL finishes initialising on first launch. It retries automatically, but a `docker compose restart postgrest` usually resolves it.
3. **Schema cache stale** — After applying schema changes, PostgREST needs a schema reload. The importer sends `NOTIFY pgrst, 'reload schema'` automatically, but if that notification was missed, restart PostgREST: `docker compose restart postgrest`.
4. **`web_anon` role missing** — `db/init.sql` creates this role on first init. If you deleted and recreated the `pgdata` volume without re-running init.sql (e.g. by running `docker volume rm` but not recreating via `docker compose up`), the role is missing. Run `docker compose up -d` to let init.sql re-run, or run it manually.

---

## Import fails partway through with a PBF error

**Symptom:** The importer exits with `osmium` or `osm2pgsql` reporting a corrupt or truncated file.

**Fix:** The cached PBF may be corrupt (interrupted download). Delete the cached files and re-run:

```bash
docker compose run --rm importer sh -c "rm -f /data/*.pbf"
docker compose --profile data-node-ui run --rm importer
```

The importer validates the source PBF with `osmium fileinfo` before using it and will re-download a corrupt file automatically. If the re-download fails, check `PBF_URL` in `.env` — make sure the URL is reachable and returns a valid PBF.

---

## Hub shows all backends as red / unreachable

**Symptom:** The instance drawer shows every data-node with a red indicator.

**Possible causes:**

1. **CORS not configured** — The Hub's browser must be able to reach each data-node's `/api/` cross-origin over HTTPS. Verify with:
   ```bash
   curl -I https://your-data-node.example.com/api/rpc/get_meta
   # must include: Access-Control-Allow-Origin: *
   ```
2. **registry.json not updated** — The Hub still has the bundled dev `registry.json` pointing at `/api` and `/api2`. See [Federated Deployment](federated-deployment.md#step-3-stand-up-the-hub) for how to replace it.
3. **Data-node not reachable from browser** — The Hub serves the app; the Hub's *browser* must reach each data-node, not the Hub host. Test from a browser (not the server) by opening each data-node's `https://…/api/rpc/get_meta` URL directly.
4. **Hub cron not running** — Check `federation-status.json`: if `generated_at` is older than 5 minutes, the cron job inside the hub container has stopped. Restart the hub container: `docker compose --profile ui restart app`.

---

## Hub shows a backend as reachable but with 0 playgrounds

**Symptom:** A data-node appears in the Hub instance drawer with a green or yellow indicator, but its playground count is 0 and no playgrounds are drawn from that backend.

**Hub operator — diagnose remotely:**

```bash
curl https://the-data-node.example.com/api/rpc/get_meta
```

If `playground_count` is `0` and `bbox` is `[null,null,null,null]`, the database has no playground data. Pass the findings to the data-node operator.

If `playground_count` is `> 0` and `bbox` contains real coordinates, the data-node is healthy. The hub has stale cached state — see **Hub operator** below.

**Hub operator — stale cached state (`playground_count > 0`, valid `bbox`):**

The hub polls each backend's `get_meta` at startup and every 5 minutes. If the last poll hit the backend while it was mid-import, restarting, or transiently unreachable, the hub cached `bbox: null` and `playgroundCount: 0`. With `bbox: null` the hub's viewport router silently excludes the backend from every map query.

1. **Reload the hub page** in the browser. This triggers an immediate re-poll of every backend's `get_meta`. If playgrounds appear after reload, the cache was stale and self-healed.

2. **Check whether the hub health poller marked the backend down.** The hub container runs a 60-second cron that writes `federation-status.json`; backends that exceed the 3-second curl timeout are marked `up: false` and the hub orchestrator skips them even when `get_meta` succeeds from the browser:

   ```bash
   curl https://your-hub.example.com/federation-status.json \
     | jq '.backends | to_entries[] | select(.value.up == false) | .key'
   ```

   If the backend slug appears, it is being skipped by the orchestrator. Check whether the backend is slow to respond:

   ```bash
   curl -w '%{time_total}s\n' -o /dev/null -sf \
     https://the-data-node.example.com/api/rpc/get_meta
   ```

   Response times consistently above 3 seconds will flip `up: false` on the next hub poll cycle. Investigate slow PostgREST response times on the data-node side (see [Map loads but shows no playgrounds](#map-loads-but-shows-no-playgrounds) for database health checks). If the latency is transient, the hub recovers by itself once the backend is fast again: the cron rewrites the status every 60 seconds, and browsers re-read it every `HUB_POLL_INTERVAL` (default 300 s). If the hub container is stuck showing a backend as down despite it being healthy, restart it:

   ```bash
   docker compose restart app   # run on the hub host
   ```

**Data-node operator — possible causes:**

1. **Import not run** — The stack started but no import has completed. With automatic updates, follow it with `docker compose logs -f importer`; otherwise run it once ([Refresh Data](refresh-data.md)).
2. **PBF doesn't cover the relation** — See [Map loads but shows no playgrounds](#map-loads-but-shows-no-playgrounds), cause 3.
3. **Outdated image** — See [Hub backend returns "function not found" errors](#hub-backend-returns-function-not-found-errors).
4. **Daemon importer sleeping after a failed/corrupt previous run** — If the importer ran but was OOM-killed during preprocessing, osm2pgsql may have ingested a partial file and recorded a successful `last_import_at`. The daemon will not retry until the next scheduled interval. [Clear the PBF cache](refresh-data.md#clearing-the-pbf-cache), then force a re-import ([Daemon mode](refresh-data.md#daemon-mode)).

---

## Backend shows "No position set" in instance drawer

**Symptom:** The Hub instance drawer auto-opens and a backend shows a warning: "No position set" with a link to troubleshooting docs.

**Cause:** The backend entry in `registry.json` has neither a `centroid` field nor a valid `bbox` from its `get_meta` response. Without position data, the backend cannot be placed on the macro view map.

**Fix:** Add a `centroid` field to the backend's entry in `registry.json`:

```json
{
  "instances": [
    {
      "slug": "your-region",
      "url": "https://your-backend.example.com/api",
      "name": "Your Region",
      "centroid": [10.5, 51.2]
    }
  ]
}
```

The `centroid` should be the approximate geographic center of the region in WGS84 coordinates `[lon, lat]`. Once the first import completes, the `bbox` from `get_meta` takes over and the `centroid` is only used as a fallback.

**See also:** [registry.json Reference](../reference/registry-json.md) for the full schema.

---

## Hub backend returns "function not found" errors

**Symptom:** The hub operator checks the data-node API and gets:

```json
{"code":"PGRST202","message":"Could not find the function api.get_playgrounds_bbox(bbox) in the schema cache."}
```

The Hub shows 0 playgrounds for that backend.

**Hub operator — diagnose remotely:**

```bash
curl https://the-data-node.example.com/api/rpc/get_meta
# check "version" — if older than v0.4.9, the image needs updating
```

**Data-node operator — fix:**

The image predates the tiered-fetch functions added in v0.4.9. Update and re-import, replacing `<mode>` with the stack's `DEPLOY_MODE`:

```bash
cd ~/spieli   # or wherever spieli was installed
docker compose pull
docker compose --profile <mode> down
docker compose --profile <mode> up -d
```

Then run a full import as in [Refresh Data](refresh-data.md) (the daemon form if automatic updates are on).

**Hub operator — verify after the data-node operator confirms the update:**

```bash
curl https://the-data-node.example.com/api/rpc/get_meta
# playground_count should now be > 0
```

---

## Importer fails with "permission denied" on schema apply

**Symptom:** `psql` reports `permission denied` when the importer runs `api.sql`.

**Cause:** The SQL runs as the database user configured in `.env`. This user needs `SUPERUSER` or at minimum `pg_signal_backend` (to terminate PostgREST connections) and `CREATE` on the `public` schema. The default user (`osm`) is a superuser — if you changed `POSTGRES_USER`, verify the role has these privileges.

**Fix:**

```bash
docker compose -f compose.yml exec db psql -U osm osm
# in psql:
ALTER ROLE your_user SUPERUSER;
\q
```

Then re-run the importer:

```bash
docker compose -f compose.yml --profile <mode> run --rm importer
```

---

## Database volume is very large after repeated imports

**Symptom:** The `pgdata` Docker volume grows beyond expectations over time.

**Not the cause:** `playground_stats`. Every apply builds it under a staging name and drops the old one, and dropping a relation returns its files to the filesystem at once; there is nothing for `VACUUM` to reclaim there.

**Find out what is large:**

```bash
docker compose exec db psql -U osm osm -c "
  SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) AS size
  FROM pg_class WHERE relkind IN ('r','m')
  ORDER BY pg_total_relation_size(oid) DESC LIMIT 10;"
```

The `planet_osm_*` tables are replaced by every full import. If the total is far above the sizes in [Sizing](../reference/sizing.md), recreating the data volume and importing once is the quickest clean state.

---

## Hub drawer shows "updating" badge that never clears

**Symptom:** One or more backends in the Hub instance drawer permanently show an "updating" badge, even though no import is running.

**Cause:** The `importing` flag in `api.import_status` was left `true` by an importer that was killed with SIGKILL (bypasses the EXIT trap) or crashed before the trap could fire.

**Self-healing:** The importer clears the flag automatically at startup. Restarting the container is usually enough:

```bash
docker compose restart importer   # the daemon clears the flag on startup
```

**Manual fix** (if you need it cleared immediately without waiting for a restart):

```bash
# From the data-node host
docker compose exec db psql -U osm -d osm \
  -c "UPDATE api.import_status SET importing = false WHERE id = 1;"
```

The Hub picks up the corrected value within a few minutes: the cron rewrites the status every 60 seconds, browsers re-read it every `HUB_POLL_INTERVAL`.

---

## Legal pages missing or showing wrong contact details

**Symptom:** `/legal/impressum` or `/legal/datenschutz` returns 404, or the pages show stale contact information after updating `IMPRESSUM_*` vars.

**Cause:** The HTML files are generated by `docker-entrypoint.sh` when the app container starts, from the environment it was created with.

**Fix:** Recreate the app container (`restart` would keep the old environment):

```bash
docker compose --profile <mode> up -d app
```

If `get_meta()` still returns the old `impressum_url` / `privacy_url`, those are baked in when `api.sql` is applied. Recreate the daemon importer (`up -d importer`, it applies a changed `api.sql` on startup) or run `run --rm -e API_ONLY=1 importer`. The legal *text* a hub shows for a data-node is rewritten only by a full import. Details: [Configure the instance → Legal pages](configure.md#applying-changes).

**Symptom:** `/legal/impressum` returns 404 despite `IMPRESSUM_NAME` being set.

**Cause:** `IMPRESSUM_ADDRESS` is also required; the entrypoint skips the Impressum when either is empty. The Datenschutz page likewise needs `IMPRESSUM_NAME` and `IMPRESSUM_EMAIL`.

**Fix:** Set them in `.env`, then recreate the app container as above.

**Symptom:** PostgREST logs `relation "public.playground_stats" does not exist` after an upgrade: see [Schema apply fails](#schema-apply-fails-with-relation-publicplayground_stats-does-not-exist) at the top of this page.

---

## The map renders, but labels or icons are missing — or the container refuses to start with `style.local.json is missing from the image`

Both come from building an image yourself: the published images carry the vendored fonts and the generated style. See [Customise your own image → Build problems](customise-image.md#build-problems). On a published image, report it as a bug.

---

## Basemap tiles are slow or fail after an upgrade

**Symptom:** the map is sluggish or patchy for a while after an upgrade or a container rebuild, then recovers.

**Cause:** the tile cache lives at `/var/cache/nginx/basemap`. Without a volume it sits on the container's writable layer and is discarded on every rebuild, so the next visitors refill it from the upstream one tile at a time.

**Fix:** mount a volume so it survives rebuilds. Both `compose.yml` and `compose.prod.yml` ship one (`basemap_cache`); if you deploy from a hand-written or older compose file, add the equivalent:

```yaml
services:
  app:
    volumes:
      - basemap_cache:/var/cache/nginx/basemap
volumes:
  basemap_cache:
```

This matters most for an upgrade sweep across several stacks, which would otherwise send every one of them at the public tile server cold at the same time.

## Photos, search or reviews stopped working after an upgrade

Since the external-service proxies landed, these features are served through `/ext/` paths on your own instance rather than fetched from the third party by the browser. Three things go wrong quietly.

**A cold cache after a rebuild.** Recreating the container (an upgrade, `up -d` after a config change) replaces it, and a cache on the writable layer goes with it. `compose.yml` mounts a named volume (`ext_cache`) so this should not happen — check it is actually mounted:

```bash
docker compose exec app du -sh /var/cache/nginx/ext
docker compose config | grep -A2 ext_cache
```

**Search returns nothing under load.** The Nominatim proxy shares the OSMF limit of 1 request per second across the whole instance, and sheds beyond it rather than exceeding the policy. Cached queries are unaffected — the limiter only sees misses — so this shows up as unusual free-text searches failing while region URLs keep working. Look for `limiting requests` in the error log (the error log is the only one there is, #988; it holds the shed request line, so treat it with care):

```bash
docker compose logs app | grep "limiting requests"
```

If you see it routinely, `PROXY_NOMINATIM=false` sends each visitor's searches to the public Nominatim directly, so the limit applies per visitor instead of to your server, at the cost of that privacy property. There is no setting to point spieli at a Nominatim of your own; the upstream is fixed.

**Images render as broken.** Check whether the request 404s at your instance or at Wikimedia:

```bash
docker compose logs app | grep -i "ext/wikimedia"
```

No request is access-logged (#988), `/ext/` included, so a successful request leaves no trace by design — only errors appear. A 404 from the instance itself means the path did not match the allowlist; the most likely cause is Wikimedia serving files from a host the proxy does not know about. The proxy accepts any `*.wikimedia.org` host, so this should be rare, but it is the first thing to check if thumbnails break after a Wikimedia change.

To rule the proxies out entirely, set `PROXY_COMMONS=false` and restart: the browser then fetches from Wikimedia directly, as it did before.
