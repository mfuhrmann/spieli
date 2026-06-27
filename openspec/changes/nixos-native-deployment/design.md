## Context

spieli is not a single binary — it is a four-part stack (PostgreSQL+PostGIS, an `osmium`/`osm2pgsql` importer, PostgREST, and nginx serving a Vite/Svelte static bundle), shipped today as Docker images + `compose.prod.yml`. "Install on NixOS" therefore has several non-equivalent meanings. This design records the interpretation chosen, the codebase investigation that de-risked it, and the resulting architecture.

### Interpretation chosen

Four readings of "Nix packages to install on NixOS" were weighed:

| Option | Docker still involved? | Idiomatic | Effort | Ongoing sync cost |
|---|---|---|---|---|
| **A — Native NixOS module (systemd)** | no | ★★★★★ | high | high (track import.sh, config.js, nginx.conf) |
| B — NixOS module over published OCI images | yes | ★★ | low | low (image tag + env surface) |
| C — Frontend package only (`buildNpmPackage`) | n/a | ★★★ | low | medium |
| D — Dev shell only | n/a | ★★★★ | trivial | low |

**Decision: A — native systemd module, no Docker.** It is the only option that lets a NixOS operator run spieli as first-class services. Its headline risk is the "second source of truth" sync cost; the rest of this design is structured to neutralise that risk by reusing existing artifacts and adding a VM tripwire.

## Goals / Non-Goals

**Goals:**
- `services.spieli.enable = true;` brings up a working standalone data node — postgres+postgis, postgrest, nginx, timer-driven importer — with no container runtime.
- Reuse `db/init.sql`, `importer/api.sql`, `importer/import.sh` **verbatim by path**; reimplement as little as possible in Nix.
- Make the unavoidable reimplementations (nginx routing, runtime-config generation) drift-resistant: share generators where possible, guard the rest with a `nixosTest`.
- Keep the existing Docker path byte-for-byte unchanged (all edits additive / default-preserving).

**Non-Goals:**
- Hub mode (federation poll cron, `federation-status.json`, `/metrics`).
- Removing or replacing the Docker/compose path — it remains the primary distribution.
- Doing the OSM import at Nix build time (it is network + multi-hundred-MB; it stays a runtime systemd service).

## Investigation findings (what de-risked option A)

### F1 — The importer is debian-based and already portable

`importer/Dockerfile` is `debian:bookworm-slim` (glibc + GNU coreutils + GNU wget) — the same userland NixOS provides, **not** Alpine/busybox. `import.sh` is careful POSIX sh that deliberately avoids `pipefail`. Every tool (`osm2pgsql`, `osmium-tool`, `jq`, `curl`, `wget`, `psql`/`pg_isready`, `envsubst`) is in nixpkgs. Network access (`wget` PBF, `curl` Nominatim) happens at **runtime in the service**, not build time, so there is no Nix sandbox conflict.

Only two things block verbatim reuse, both hardcoded container paths:
- `/data` (PBF cache + `mktemp -p /data` + intermediate `*.pbf`) — ~6 sites.
- `/api.sql` (`envsubst < /api.sql`) — 2 sites.

Both become `${VAR:-default}` with the current container paths as defaults → Docker unchanged, NixOS passes `DATA_DIR=/var/lib/spieli/pbf` and `API_SQL=<store>/api.sql`.

### F2 — import.sh's three modes map cleanly; daemon mode is unused on NixOS

`import.sh` has one-shot, daemon (internal `while`+random-sleep loop), and `API_ONLY` modes. systemd owns scheduling better than the script's daemon block:

| import.sh mode | NixOS native |
|---|---|
| one-shot (default) | `spieli-import.service` (oneshot), triggered by `spieli-import.timer` |
| daemon loop (L502–565) | **unused** — `OnCalendar` + `Persistent=true` + `RandomizedDelaySec` replace the grace-check/jitter/retry logic |
| `API_ONLY` (L470–493) | `spieli-schema.service` (oneshot) run on activation — mirrors `upgrade-stacks.sh`'s `API_ONLY=1`-then-restart dance |

`deploy/spieli-import.timer` already uses `OnCalendar=weekly` + `Persistent=true`; the module reproduces it natively.

### F3 — The frontend locale build has exactly one non-obvious constraint

`app/src/lib/i18n.js` does `import('../../../locales/de.json')`. Vite resolves this relative to the file at build time, so **`locales/` must be a sibling of the npm package root**. In Docker the app unpacks at `/build`, so `../../../` lands on `/` → hence `COPY locales/ /locales/`. That absolute path is a Docker artefact and does **not** port (the Nix sandbox can't write `/`). The portable invariant is the sibling relationship: the `buildNpmPackage` `src` must contain `app/` and `locales/` as siblings, with `sourceRoot` pointing at `app/`. Only `de` + `en` are actually `register()`-ed (`SUPPORTED = ['de','en']`), so only those two JSONs end up in the bundle regardless.

### F4 — `version.json` is a dead endpoint — no codegen burden

nginx serves `/version.json`, but nothing in the repo creates it: the **app** Dockerfile has no `ARG VERSION` (the `build-args: VERSION=` in `build.yml` is silently discarded), `make build` = `vite build` emits only `dist/` (and `public/` holds only `config.js` + `registry.json`), and the entrypoint never writes it. So `/version.json` is a permanent 404 in production. The real version channel is `get_meta().version`, fed by `$SPIELI_VERSION` envsubst'd into `api.sql` at importer-build time and read by `poll-federation.sh` (`.version // null`). Consequence: `frontend.nix` generates **nothing** version-related; the native module surfaces version the same way Docker does — via the importer's `SPIELI_VERSION` env → `api.sql` → `get_meta`.

## Decisions

### D1 — Native systemd module, not OCI-containers or dev-shell

See "Interpretation chosen". B/C/D are viable smaller deliverables but do not satisfy "run spieli natively on NixOS". Recorded here so the alternative is not relitigated.

### D2 — Reuse SQL + import.sh verbatim by path; parameterize the two container paths

`db/init.sql` and `importer/api.sql` are applied unchanged (the same files Docker applies), so a release editing them cannot silently break the Nix path. `import.sh` gains `DATA_DIR` / `API_SQL` env params (defaults = today's `/data` / `/api.sql`) — the entire "make it Nix-friendly" diff, under ~10 lines, zero Docker behaviour change.

### D3 — Importer = one-shot service + systemd timer; schema apply on activation

The module does **not** use `import.sh`'s daemon loop (F2). `spieli-import.service` runs one-shot, triggered by `spieli-import.timer` (`OnCalendar=weekly`, `Persistent=true`, `RandomizedDelaySec` for anti-herd). A separate `spieli-schema.service` runs `API_ONLY=1 import.sh` to re-apply `api.sql` after a spieli version bump without forcing a full reimport — the native analogue of the project's documented upgrade step. It is run **manually** on upgrade (not wired into `nixos-rebuild` activation): `api.sql`'s `playground_stats` matview is built from `planet_osm_*`, which exist only after the first full import, so auto-running it on a fresh activation would fail. Operators run it after the first `spieli-import` and on each upgrade.

### D4 — Local Postgres via unix socket + peer auth (no password)

`import.sh` connects with `-h $POSTGRES_HOST`; `psql` treats a slash-prefixed host as a socket directory. Setting `POSTGRES_HOST=/run/postgresql` and running the importer/postgrest units as a system user matching a peer-authenticated Postgres role makes `PGPASSWORD` irrelevant and removes secret management entirely for the local-only DB. PostgREST connects the same way; `NOTIFY pgrst, 'reload schema'` works natively.

### D5 — `frontend.nix` via `buildNpmPackage` with an app+locales sibling fileset

`src = lib.fileset.toSource { root = ./.; fileset = unions [ ./app ./locales ]; }` (preserves the sibling layout, F3), `sourceRoot = "source/app"`, `npmDepsHash` over `app/package-lock.json`, `nodejs_20` (Dockerfile parity), `installPhase = "cp -r dist $out"`. The bundled `dist/config.js` (Vite-copied dev default) is shadowed at runtime by the generated `config.js` served no-store from a writable dir; the static one is inert. Dependabot bumps to `app/package-lock.json` invalidate `npmDepsHash` → the build fails loudly, and `nix flake check` catches it.

### D6 — Extract `gen-runtime.sh` to kill the config-generation drift seam

config.js + legal-HTML generation currently lives only inside `oci/app/docker-entrypoint.sh` (pure `env → file`). Factor it into `oci/app/gen-runtime.sh`, sourced by the Docker entrypoint and called by the NixOS `preStart` (module options passed as env). This converts the highest-sync-cost reimplementation into a single shared generator; the only routing logic that remains Nix-specific is the nginx vhost.

### D7 — No `version.json` generation; version via `get_meta`

Per F4. The native nginx vhost drops the vestigial `/version.json` `location` block (404 parity either way) and the Docker-isms (`resolver 127.0.0.11`, `postgrest:3000` upstream → `127.0.0.1:3000`, the hub-only `/api2/` block). Version surfaces through the importer's `SPIELI_VERSION` env → `api.sql` → `get_meta`.

### D8 — `nixosTest` VM as the anti-drift tripwire (mandatory, same change)

A `nixosTest` boots the module, loads the 4-playground seed fixture (`dev/seed/seed.sql`), and asserts `/api/get_meta` and `/` respond. This is the guard that turns silent drift in the ported nginx vhost / runtime config into a red `nix flake check`. Shipping the module without it is explicitly rejected — native deployment rots within a couple of releases otherwise.

### D9 — Standalone only in v1

Hub federation plumbing (`poll-federation.sh` cron, `federation-status.json`, `/metrics`) is deferred. The data node is the federable unit; standalone is the smallest thing that proves the seam holds.

### D10 — flake at repo root, derivations in `nix/`, in-repo

`flake.nix` must sit at the flake root, so it lives at the repo root and imports `./nix/*` for the actual derivations (satisfying the "dedicated directory" intent). In-repo (not a sidecar) is required so CI's `nix flake check` — and therefore the D8 tripwire — actually runs on every change.

## Risks / Trade-offs

- **Reimplemented nginx routing can drift** from `oci/app/nginx.conf`. Mitigated by D8 (the VM test curls the routes) — but the test only covers routes it exercises; new routes need new assertions.
- **`npmDepsHash` maintenance** couples the Nix build to Dependabot lockfile bumps. Acceptable: failure is loud and caught by `nix flake check`.
- **`gen-runtime.sh` extraction touches the Docker entrypoint** — a behaviour-preserving refactor of shipped code. Must be verified against the current container output before relying on it from Nix.
- **Two pre-existing latent bugs** (undefined `fail`; dead app-image `VERSION` arg / 404 `version.json`) are documented as out-of-scope follow-ups, not silently inherited.

## Migration / Compatibility

Purely additive. Existing Docker/compose operators are unaffected: `import.sh` keeps its `/data` and `/api.sql` defaults, `db/init.sql` and `api.sql` are untouched, and the `gen-runtime.sh` extraction preserves the entrypoint's output. No DB, API, or `.env` changes for current deployments.
