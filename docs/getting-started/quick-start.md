# Quick Start

The easiest way to deploy spieli is with the interactive installer. It downloads everything it needs, walks you through configuration, and optionally runs the first import.

## Requirements

- Docker with the Compose plugin
- `bash`
- `openssl`

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/install.sh -o install.sh
bash install.sh
```

## What the installer does

1. Asks for a deployment directory (default: `./spieli`)
2. Asks for your deployment mode (`data-node`, `ui`, or `data-node-ui`)
3. Asks for your OSM relation ID and Geofabrik PBF URL (for data-node and data-node-ui modes)
4. Prompts for optional settings (port, UI links, zoom levels)
5. Generates a secure database password automatically
6. Downloads `compose.yml` and `db/init.sql` into the deployment directory
7. Offers to pull images, start the stack, and run the first import

!!! tip "Finding your OSM relation ID"
    Search for your city, Kreis, or district on [Nominatim](https://nominatim.openstreetmap.org). The relation ID appears in the URL — e.g. `openstreetmap.org/relation/62700` → ID is `62700`.

!!! tip "Finding a PBF extract"
    Browse [download.geofabrik.de](https://download.geofabrik.de) for an extract covering your region. The PBF only needs to *contain* your region — a Bundesland extract works fine for a single Kreis.

## Deployment modes

| Mode | What starts | Use when |
|---|---|---|
| `data-node` | DB + PostgREST only | Shared backend for multiple UI instances |
| `ui` | App only | Frontend connecting to a remote data node |
| `data-node-ui` | Full stack | Single self-contained regional deployment |

## Managing the stack

After setup, manage the stack from your deployment directory:

```bash
cd spieli

# Start the stack
docker compose --profile data-node-ui up -d

# Re-import OSM data (clips to your region with osmium, then runs osm2pgsql)
docker compose --profile data-node run --rm importer

# Stop the stack
docker compose --profile data-node-ui down
```

Replace `data-node-ui` with whichever mode you chose at install time (`DEPLOY_MODE` in your `.env`).

## Next steps

- [Configuration reference](../ops/configuration.md) — all available environment variables
- [Troubleshooting](../ops/troubleshooting.md) — common problems and fixes
