## Why

spieli ships today only as Docker images + `compose.prod.yml`, wired together by `install.sh`. NixOS operators who want spieli on their hosts have to run Docker/Podman anyway, or hand-roll the whole topology. There is no declarative, `nixos-rebuild`-native way to stand up a spieli data node.

This change adds a dedicated `nix/` directory and a root `flake.nix` exposing a **native NixOS module** — `services.spieli.enable = true;` brings up PostgreSQL+PostGIS, PostgREST, nginx, and a timer-driven importer as first-class systemd units, no container runtime on the box.

The native path is the most NixOS-idiomatic, but also the one that most risks duplicating the project (a second source of truth for config generation, routing, and the import pipeline). The design below is built around **reusing the existing shell/SQL artifacts verbatim** and guarding the unavoidably-reimplemented seams with a VM test, so the Nix path can't silently rot across releases.

## What Changes

### New `nix/` directory + root `flake.nix`

```
flake.nix            # outputs: packages, nixosModules.spieli, devShells, checks
nix/
  frontend.nix       # buildNpmPackage → static dist/
  module.nix         # NixOS module: postgres / postgrest / nginx / importer units
  importer.nix       # wraps importer/import.sh with the right PATH + state dir
  test.nix           # nixosTest VM: boot → seed → curl /api/get_meta + /
```

### Reuse-verbatim, not reimplement

`db/init.sql`, `importer/api.sql`, and `importer/import.sh` are consumed **by path** by the systemd units — the same files Docker uses. The only edits to existing code are additive and Docker-default-preserving:

- `importer/import.sh`: parameterize the two hardcoded container paths — `DATA_DIR="${DATA_DIR:-/data}"` (PBF cache + intermediate filtered PBFs, ~6 sites) and `API_SQL="${API_SQL:-/api.sql}"` (2 sites). Defaults unchanged → the importer image is byte-for-byte identical.
- Extract config.js + legal-HTML generation from `oci/app/docker-entrypoint.sh` into a shared `oci/app/gen-runtime.sh` that both the Docker entrypoint and the NixOS `preStart` call — collapsing the config-generation drift seam to a single source of truth.

### Scope: standalone mode only (v1)

Hub mode (federation poll cron, `federation-status.json`, `/metrics` exposition) is **out of scope** for this change. The module targets a single-region data node, which is the unit a hub federates over.

## Capabilities

### New Capabilities

- `nixos-native-deployment`: a NixOS module + flake packaging that runs a standalone spieli data node as native systemd services (PostgreSQL+PostGIS, PostgREST, nginx, timer-driven importer), reusing the project's existing SQL and shell artifacts, with a `nixosTest` VM as the anti-drift guard.

## Impact

- **`flake.nix`** (new, repo root) — flake outputs; in-repo so CI can run `nix flake check`.
- **`nix/frontend.nix`** (new) — `buildNpmPackage`; `src` must include `app/` **and** `locales/` as siblings (the locale dynamic import `../../../locales/*.json` resolves to a sibling of the npm package root); `sourceRoot = app`; `npmDepsHash` tracks `app/package-lock.json`.
- **`nix/module.nix`** (new) — options + four systemd units (see design); Postgres via unix socket + peer auth; ported nginx vhost (Docker-isms removed).
- **`nix/importer.nix`** (new) — wraps `import.sh` with `osm2pgsql`, `osmium-tool`, `jq`, `curl`, `wget`, `postgresql`, `gettext`, GNU coreutils on `PATH`; `StateDirectory` for the PBF cache.
- **`nix/test.nix`** (new) — `nixosTest` boot → `seed-load` fixture → assert `/api/get_meta` + `/` respond.
- **`importer/import.sh`** — additive `DATA_DIR` / `API_SQL` params; Docker behaviour unchanged.
- **`oci/app/gen-runtime.sh`** (new) + **`oci/app/docker-entrypoint.sh`** — extract shared runtime-config generation.
- **`db/init.sql`, `importer/api.sql`** — consumed verbatim, no edits.
- **Docs** — new `docs/ops/` page for NixOS deployment; link in `mkdocs.yml`.
- No DB schema change, no API change, no new runtime dependency for existing Docker users.

## Out of scope / follow-ups

- Hub mode on NixOS (poll timer, federation-status, metrics).
- Two latent bugs surfaced during analysis, both Docker-independent, fix separately:
  - `importer/import.sh:333` calls an **undefined `fail`** function (import still aborts under `set -e`, but the operator message is lost).
  - `build.yml` passes `build-args: VERSION=` to the **app** image, which has no `ARG VERSION` → silently discarded. The app's `/version.json` nginx route serves a file nothing creates (permanent 404); the real version channel is `get_meta().version` via the importer's `SPIELI_VERSION`.
