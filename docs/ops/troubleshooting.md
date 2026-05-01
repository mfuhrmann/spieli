# Troubleshooting

## Port 8080 is already in use

**Symptom:** `make up` fails with `address already in use` or `port is already allocated`.

**Fix:** Stop whatever is using port 8080, or change the port in `.env`:

```env
APP_PORT=8081
```

Then run `make up` again.

---

## Import exits immediately or fails with a database error

**Symptom:** The import finishes in seconds (normally takes minutes), or you see a `connection refused` or `role does not exist` error.

**Fix:** The database must be running before you import. Start the stack first and confirm all containers are healthy:

```bash
docker compose ps   # all containers should show "running" or "healthy"
# then run the importer — replace <mode> with your DEPLOY_MODE (data-node or data-node-ui)
docker compose --profile <mode> run --rm importer
```

If you are using the local development setup, `make import` is equivalent. If the database shows as unhealthy, try stopping and restarting the stack.

---

## Map loads but shows no playgrounds

**Symptom:** Map tiles appear (streets and buildings visible) but no playground polygons are drawn, or the detail panel is empty.

**Possible causes:**

1. **Import not run** — Run the importer after starting the stack (`docker compose --profile <mode> run --rm importer`, or `make import` for local dev). Playground data is not loaded automatically.
2. **Wrong relation ID** — Check `OSM_RELATION_ID` in `.env`. An incorrect ID filters out all playgrounds. Verify at [nominatim.openstreetmap.org](https://nominatim.openstreetmap.org).
3. **Docker stack not running** — The app requires a live PostgREST backend. Confirm the stack is running and healthy before starting `make dev`.
4. **Browser cache** — Try a hard reload: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac).

---

## Geolocation button does nothing on mobile

**Symptom:** Tapping the location button on a phone browser has no effect — no movement, no error.

**Cause:** Browsers block the geolocation API on plain HTTP connections (including local IPs like `http://192.168.1.42:8080`). This is a browser security policy and cannot be overridden in the app.

**Fix options:**

- Test geolocation on the **production HTTPS URL**.
- On Android with **Chrome**: go to `chrome://flags`, search for "Insecure origins treated as secure", add your local URL, and relaunch Chrome.
- DuckDuckGo and Brave do not offer this workaround — use Chrome for local geolocation testing.

---

## Dev server starts but changes don't appear

**Symptom:** You edited a JS or CSS file, but the browser still shows the old version.

**Fix:** Vite hot-reload should pick up changes automatically. If it doesn't:

1. Check the terminal running `make dev` — a build error will prevent the browser from updating.
2. Try a hard reload: `Ctrl+Shift+R` / `Cmd+Shift+R`.
3. If you changed `index.html` or a file in `public/`, stop and restart `make dev`.

!!! note
    When testing via `make docker-build` (the Docker stack), you must run `make docker-build` again after every change — there is no hot-reload in that mode.

---

## `make lan-url` prints "Could not detect LAN IP"

**Fix:** Run this command directly and use the output as your LAN IP:

```bash
ip route get 1 | awk '{print $7; exit}'
```

Then open `http://<that-ip>:8080` on your phone.

---

## PostgREST returns 404 or connection refused on `/api/`

**Symptom:** The app loads but every API call fails with "Failed to fetch" or the network tab shows 502/404 on `/api/rpc/*`.

**Possible causes:**

1. **PostgREST container not running** — Check `docker compose ps`. The `postgrest` service should be running and healthy.
2. **Database not ready** — PostgREST starts before PostgreSQL finishes initialising on first launch. It retries automatically, but a `docker compose restart postgrest` usually resolves it.
3. **Schema cache stale** — After running `make db-apply`, PostgREST needs a schema reload. The apply script sends `NOTIFY pgrst, 'reload schema'` automatically, but if that notification was missed, restart PostgREST: `docker compose restart postgrest`.
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

## `make db-apply` fails with "permission denied"

**Symptom:** `psql` reports `permission denied` when running `api.sql`.

**Cause:** The SQL runs as the database user configured in `.env`. This user needs `SUPERUSER` or at minimum `pg_signal_backend` (to terminate PostgREST connections) and `CREATE` on the `public` schema. The default `compose.yml` user (`osm`) is a superuser — if you changed `POSTGRES_USER`, verify the role has these privileges.

**Fix:**

```bash
make db-shell
# in psql:
ALTER ROLE your_user SUPERUSER;
\q
make db-apply
```

---

## Database volume is very large after repeated imports

**Symptom:** The `pgdata` Docker volume grows beyond expectations over time.

**Cause:** `api.sql` uses `DROP MATERIALIZED VIEW … CASCADE` + `CREATE MATERIALIZED VIEW` on every apply. PostgreSQL does not reclaim the space immediately — it marks pages as dead and waits for autovacuum. After many re-imports, dead tuple bloat can be significant.

**Fix:** Run VACUUM FULL (briefly locks the table):

```bash
make db-shell
# in psql:
VACUUM FULL public.playground_stats;
\q
```

Or simply recreate the data volume after a re-import — the volume will start clean.
