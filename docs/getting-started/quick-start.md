# Quick Start

The easiest way to deploy spieli is with the interactive installer. It downloads everything it needs, walks you through configuration, and optionally runs the first import.

## Which setup do you need?

| You want to… | Setup | Go to |
|---|---|---|
| Run a playground map for your region | `data-node-ui` + `standalone` (the installer's defaults) | this page |
| Put your region on spieli.eu or another hub | `data-node` or `data-node-ui` | [Host a Region for spieli.eu](host-a-region.md) — the steps are the same for any hub |
| Combine several regions on one map | a hub: `ui` + `hub`, plus a `registry.json` | [Federated Deployment](../ops/federated-deployment.md) |

All five combinations of deployment mode and app mode: [Deployment modes](../reference/deployment-modes.md). Why spieli is split this way: [Federation: one map, many owners](../concepts/federation.md).

## Requirements

- A Linux server with Docker and the Compose plugin, `bash`, `openssl`, and `sha256sum` (or `shasum -a 256` on macOS). How much memory and disk a region needs: [Sizing](../reference/sizing.md).
- For a public instance: a domain or subdomain pointing to the server, and ports 80 and 443 open.
- Your region's OSM relation ID and a Geofabrik extract that contains it (see below).

## Finding your region

**OSM relation ID** — search for your city, district or state on [Nominatim](https://nominatim.openstreetmap.org) or [openstreetmap.org](https://www.openstreetmap.org). The relation ID appears in the URL — e.g. `openstreetmap.org/relation/62700` → ID is `62700`.

**PBF extract** — browse [download.geofabrik.de](https://download.geofabrik.de) for an extract covering your region. It only needs to *contain* your region — a state extract works fine for a single district. The importer cuts your region out of it.

## Install

```bash
TAG=v0.14.0  # check https://github.com/mfuhrmann/spieli/releases for the latest tag
curl -fsSL "https://github.com/mfuhrmann/spieli/releases/download/${TAG}/install.sh" -o install.sh
curl -fsSL "https://github.com/mfuhrmann/spieli/releases/download/${TAG}/install.sh.sha256" -o install.sh.sha256
sha256sum --check install.sh.sha256 && bash install.sh
```

## What the installer does

It checks that Docker, the Compose plugin and `openssl` are available, then asks, in this order:

1. The **deployment directory** (default `./spieli`).
2. The **deployment mode** (`data-node`, `ui` or `data-node-ui`): which containers run. See [Deployment modes](../reference/deployment-modes.md).
3. The **app mode** (`standalone` or `hub`): how the map behaves. Skipped for `data-node`.
4. Depending on the mode: your region's **OSM relation ID and Geofabrik PBF URL** (if it has a database), the remote **`API_BASE_URL`** (remote frontend), or the **registry URL** and poll interval (hub).
5. A question about an **external hub origin**. Leave it empty: appearing in a hub needs nothing beyond a public `/api/`.
6. Optional links for the About dialog (a regional wiki page and a community chat), the **map's start and minimum zoom**, the radius for **nearby places**, the **port**, and the number of **CPU threads** for the import.
7. **Automatically keep data and software up to date?** (recommended). Answering yes starts Watchtower, which installs new spieli releases by itself, and sets the importer to refresh the data every 2 to 10 days.
8. Whether to set up **imprint and privacy pages**: let spieli generate them from your name and address, or link pages you already have. Either way, it asks for the instance's public URL.

Then it generates a database password, downloads `compose.yml` (and `db/init.sql` if the stack has a database), writes `.env`, creates `registry.json` for a hub, and offers to pull the images, start the stack and run the first import.

## Managing the stack

After setup, manage the stack from your deployment directory:

```bash
cd spieli

# Start the stack
docker compose --profile data-node-ui up -d

# Stop the stack
docker compose --profile data-node-ui down
```

Replace `data-node-ui` with whichever mode you chose at install time (`DEPLOY_MODE` in your `.env`). If you said yes to automatic updates, add `--profile auto-update` to both commands; otherwise Watchtower does not start with the rest.

To refresh the OSM data right now, see [Refresh Data](../ops/refresh-data.md): with automatic updates, restarting the importer does not import early.

## Before you go public

The stack answers on plain HTTP (port 8080). Before you point people at it:

1. **HTTPS** — spieli ships a Traefik stack that gets and renews a Let's Encrypt certificate: [HTTPS setup](../ops/https-setup.md).
2. **Imprint and privacy notice** — required in Germany; spieli can generate both: [Configure the instance → Legal pages](../ops/configure.md#legal-pages).
3. **Security checklist** — database password, exposed ports, headers: [Security](../ops/security.md#checklist).
4. **Know when it breaks** — [Watching your instance](../ops/watch-instance.md).
5. **Updates** — automatic or by hand: [Upgrading](../ops/upgrade.md).

Every setting with its default: [Configuration Reference](../ops/configuration.md). Something not working: [Troubleshooting](../ops/troubleshooting.md).
