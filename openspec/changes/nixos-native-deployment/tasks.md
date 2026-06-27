## 1. Make import.sh path-portable (no Docker behaviour change)

- [x] 1.1 In `importer/import.sh`, introduce `DATA_DIR="${DATA_DIR:-/data}"` and replace the ~6 hardcoded `/data` sites (`PBF_FILE`, `wget -P /data/`, `BBOX_PBF`, `TAGS_PBF`, both `mktemp -p /data`). _(L340 help-string `/data` left intact — it's a literal `docker run -v …:/data` instruction.)_
- [x] 1.2 Introduce `API_SQL="${API_SQL:-/api.sql}"` and replace the 2 `< /api.sql` sites (`run_import` L358, `run_api_apply` L491).
- [x] 1.3 Verify defaults preserve Docker behaviour: `sh -n import.sh` passes; with no `DATA_DIR`/`API_SQL` set the values resolve to `/data` and `/api.sql` (unchanged). _Full `docker compose run --rm importer` against a live DB deferred to CI/operator — needs the importer image + a populated PostGIS volume; the change is a pure default-preserving substitution._

## 2. Extract shared runtime-config generator

- [x] 2.1 Create `oci/app/gen-runtime.sh` containing the config.js + impressum/datenschutz generation currently inline in `oci/app/docker-entrypoint.sh` (env → files; same sanitisation). Parameterized `WEBROOT` + `DATENSCHUTZ_TEMPLATE` (defaults = container paths).
- [x] 2.2 Update `oci/app/docker-entrypoint.sh` to call `gen-runtime.sh`; remove the now-duplicated inline logic. Dockerfile copies `gen-runtime.sh` to `/usr/local/bin` + chmod.
- [x] 2.3 Add SPDX header to `gen-runtime.sh` (source-headers skill). Also added headers to the two edited shell files (`import.sh`, `docker-entrypoint.sh`) which had none.
- [x] 2.4 Verify container output is unchanged: ran old (from `git show main:`) vs new generator across 5 env sets (standalone minimal/full, hub, URL-overrides, injection) — all `diff -r` byte-identical.

> **Sections 3–7 authored without a nix toolchain on the dev machine.** Files
> are written but NOT built/run here. `npmDepsHash` ships as `lib.fakeHash`;
> `nix flake check` + the VM test must run in CI / on a NixOS host to verify.
> Unchecked sub-boxes below are the deferred build/run verifications.

## 3. flake.nix + nix/ scaffolding

- [x] 3.1 Add `flake.nix` at repo root (inputs: nixpkgs; outputs: `packages`, `nixosModules.spieli`, `devShells`, `checks`), importing `./nix/*`.
- [x] 3.2 Add `nix/` as the dedicated directory; `.gitignore` ignores `result`/`result-*`. SPDX headers on all new `.nix` files + `flake.nix`.

## 4. frontend.nix (buildNpmPackage)

- [x] 4.1 `src = lib.fileset.toSource { root = ../.; fileset = unions [ ../app ../locales ]; }` — `app/` and `locales/` as siblings.
- [x] 4.2 `sourceRoot = "source/app"`, `nodejs_20`, `installPhase = cp -r dist $out`, `dontNpmInstall`.
- [~] 4.3 `npmDepsHash` set to `lib.fakeHash` placeholder. **Deferred:** run `nix build` to read the real hash and paste it (no nix here).
- [~] 4.4 **Deferred:** verify de/en locale chunks land in `dist/` (requires building).
- [x] 4.5 `dist/config.js` (dev default) noted; module shadows it via the `/config.js` no-store location.

## 5. module.nix — services + options

- [x] 5.1 `services.spieli` options: `enable`, `osmRelationId`, `pbfUrl`, `osmBbox`, `serverName`, region vars, optional `impressum.*`, `package`, `version`, `importTimer`.
- [x] 5.2 PostgreSQL + PostGIS; `db/init.sql` applied verbatim via `spieli-db-init`, plus an explicit `GRANT web_anon TO <user>` (init.sql's `current_user` is the superuser here). **VALIDATE on NixOS:** postgis extension option name + grant wiring.
- [x] 5.3 PostgREST: `systemd.services.postgrest` with generated config, socket + peer auth (`postgres://@/<db>?host=/run/postgresql`), `127.0.0.1:3000`.
- [x] 5.4 nginx vhost ported — CSP/security headers, `/api/` proxy (trailing-slash prefix strip), `/legal/*`, immutable assets, SPA fallback; dropped `resolver`, `/api2/`, `/version.json`.
- [x] 5.5 `spieli-config.service` runs `gen-runtime.sh` into `/run/spieli`; `= /config.js` (no-store) rooted there.

## 6. importer.nix — units

- [x] 6.1 `import.sh` wrapped via `makeWrapper` with the tool `PATH` + `API_SQL` default = store `api.sql`; region/`SPIELI_VERSION`/`POSTGRES_*` env set by the unit.
- [x] 6.2 `spieli-import.service` (oneshot) + `spieli-import.timer` (`OnCalendar`, `Persistent=true`, `RandomizedDelaySec=1h`); `StateDirectory=spieli/pbf`.
- [x] 6.3 `spieli-schema.service` (oneshot, `API_ONLY=1`). **Decision/VALIDATE:** kept manual (not `wantedBy multi-user`) — api.sql's matview needs `planet_osm_*`, which only exist after the first import; auto-on-activation deferred pending an ordering check on NixOS.
- [x] 6.4 importer + postgrest run as system user `spieli` (peer-authed role); no `PGPASSWORD`.

## 7. test.nix — nixosTest tripwire

- [x] 7.1 `nixosTest` boots the module + loads `dev/seed/seed.sql` as the `spieli` role.
- [x] 7.2 Asserts `curl /api/rpc/get_meta` returns JSON with expected fields.
- [x] 7.3 Asserts `curl /` contains `<div id="app"` and `/config.js` contains `APP_CONFIG`.
- [x] 7.4 Wired into `flake.nix` `checks` (Linux systems).
- [~] 7.5 **Deferred:** actually run `nix flake check` (needs nix + the real `npmDepsHash` from 4.3).

## 8. Docs

- [x] 8.1 Add `docs/ops/nixos.md` — enabling `services.spieli`, options, first build (npmDepsHash), first import, upgrade (`spieli-schema.service`), verifying.
- [x] 8.2 Added the page to `mkdocs.yml` nav; `mkdocs build` succeeds — no broken links from `nixos.md` (pre-existing INFO notes unrelated).
- [x] 8.3 Noted the native NixOS path in `CLAUDE.md` Architecture section.

## 9. Follow-ups (separate PRs, out of scope here)

- [ ] 9.1 Fix undefined `fail` in `importer/import.sh:333` (`fail() { echo "[importer] $*" >&2; exit 1; }`).
- [ ] 9.2 Resolve the dead app-image `VERSION` build-arg + permanent `/version.json` 404 (either wire `ARG VERSION` + emit the file, or drop the `build-args` line and the nginx route).
- [ ] 9.3 Hub mode on NixOS (poll timer, federation-status, metrics) — design as a follow-up change.

## Review Findings (code review 2026-06-27)

- [x] [Review][Decision] `spieli-schema.service` manual vs spec "on activation" — RESOLVED: kept manual (matview needs `planet_osm_*` from first import); updated spec.md scenario + design D3 to match.
- [x] [Review][Patch] `API_BASE_URL` empty bypassed local PostgREST (Overpass fallback) — set to `/api` [nix/module.nix:283]
- [x] [Review][Patch] importer + schema units now order `after`/`requires` `spieli-db-init.service` [nix/module.nix:225-227,256-257]
- [x] [Review][Patch] importer units switched from raw `serviceConfig.Environment` list to escaped `environment` attrset [nix/module.nix:228,258]
- [x] [Review][Patch] `securityHeaders` snippet repeated in every overriding location (legal HTML keeps CSP/nosniff) [nix/module.nix]
- [x] [Review][Patch] PBF dir created from `cfg.stateDir` via `systemd.tmpfiles`; hardcoded `StateDirectory` removed [nix/module.nix:167]
- [x] [Review][Defer] `npmDepsHash = lib.fakeHash` — needs `nix build` on a NixOS host — deferred (tasks 4.3)
- [x] [Review][Defer] nixosTest wired but cannot pass / never run — deferred, same root cause (tasks 7.5)
- [x] [Review][Defer] `services.postgresql.extensions` option name — VALIDATE on host — deferred [nix/module.nix:159]
- [x] [Review][Defer] undefined `fail` in `import.sh:343` — deferred, pre-existing (follow-up 9.1)
