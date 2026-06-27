# NixOS deployment (native)

spieli can run on NixOS as **native systemd services** — PostgreSQL + PostGIS,
PostgREST, nginx, and a timer-driven importer — with no container runtime. This
is an alternative to the [Docker Compose](manual-deploy.md) path; the two are
independent.

!!! warning "Status: experimental"
    The Nix packaging (`flake.nix` + `nix/`) targets **standalone mode only**
    (single-region data node; hub federation is not yet covered). Validate on
    your host with `nix flake check` before production use. The frontend
    derivation ships with a placeholder `npmDepsHash` that must be filled in on
    first build (see [First build](#first-build)).

## What you get

`services.spieli.enable = true` brings up:

| Unit | Role |
|---|---|
| `postgresql.service` | PostgreSQL + PostGIS; database owned by the `spieli` role |
| `spieli-db-init.service` | applies `db/init.sql` (extensions, `api` schema, `web_anon`) once |
| `postgrest.service` | PostgREST over the postgres socket (peer auth), `127.0.0.1:3000` |
| `nginx` | serves the bundle, proxies `/api/`, serves `config.js` + legal pages |
| `spieli-config.service` | generates `config.js` + legal HTML from your options |
| `spieli-import.service` + `.timer` | one-shot OSM import, weekly |
| `spieli-schema.service` | re-applies `api.sql` (`API_ONLY`) — manual, for upgrades |

Postgres uses **peer authentication over the unix socket**, so there is no
database password to manage for the local-only DB.

## Enabling the module

Add the flake as an input and import the module:

```nix
{
  inputs.spieli.url = "github:mfuhrmann/spieli";

  outputs = { nixpkgs, spieli, ... }: {
    nixosConfigurations.myhost = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        spieli.nixosModules.spieli
        ({ ... }: {
          services.spieli = {
            enable = true;
            serverName = "playgrounds.example.org";
            osmRelationId = 454863;  # your region's OSM relation
            pbfUrl = "https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf";

            # Optional legal/imprint (also written to api.legal_content):
            impressum = {
              name = "Jane Doe";
              address = "Main St 1, 36037 Fulda";
              email = "kontakt@example.org";
            };
          };
        })
      ];
    };
  };
}
```

See `nix/module.nix` for the full option set (`version`, `osmBbox`,
`importTimer`, `postgrestPort`, `database.name`, …).

## First build

The frontend is built with `buildNpmPackage`, which pins dependencies by hash.
On the first build the placeholder hash fails with the real value — paste it
into `nix/frontend.nix` (`npmDepsHash`):

```console
$ nix build .#frontend
error: hash mismatch in fixed-output derivation ...
         specified: sha256-AAAA...
            got:    sha256-<real>...
```

Re-run after updating the hash. The same applies whenever
`app/package-lock.json` changes (e.g. a Dependabot bump).

## First import

The importer is one-shot and timer-driven. The API schema (`api.sql`) builds a
materialised view over the `planet_osm_*` tables, which only exist **after** the
first import — so run the import once before expecting data:

```console
# systemctl start spieli-import.service     # downloads PBF, filters, imports, applies api.sql
# journalctl -u spieli-import -f            # watch progress
```

Thereafter `spieli-import.timer` re-imports on the configured schedule
(`importTimer`, default `weekly`; `Persistent` catches up a run missed while the
host was off).

## Upgrades

For a schema-only change (a new spieli version that touches `api.sql` but not
the data model), re-apply the schema without a full re-import — the native
equivalent of the documented `API_ONLY=1` step:

```console
# systemctl start spieli-schema.service
```

For a data-model change, run a full `spieli-import.service` instead.

## Verifying

```console
# curl -fsS http://localhost/api/rpc/get_meta   # API up, returns region metadata
# curl -fsS http://localhost/                    # frontend shell
```

The flake also ships a VM smoke test:

```console
$ nix flake check          # builds everything + runs the nixosTest
```
