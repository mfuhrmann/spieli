# Quick Start

The easiest way to deploy spieli is with the interactive installer. It downloads everything it needs, walks you through configuration, and optionally runs the first import.

## Requirements

- Docker with the Compose plugin
- `bash`
- `openssl`
- `sha256sum` (Linux) or `shasum` (macOS — use `shasum -a 256 --check` instead)

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
7. **Automatically keep data and software up to date?** (recommended). Yes starts Watchtower, which installs new spieli releases by itself, and makes the importer refresh the data every 2 to 10 days.
8. Whether to set up **imprint and privacy pages**: let spieli generate them from your name and address, or link pages you already have. Both ask for the public URL of the instance.

Then it generates a database password, downloads `compose.yml` (and `db/init.sql` if the stack has a database), writes `.env`, creates `registry.json` for a hub, and offers to pull the images, start the stack and run the first import.

### Finding your region

**OSM relation ID** — search for your city, district or state on [Nominatim](https://nominatim.openstreetmap.org) or [openstreetmap.org](https://www.openstreetmap.org). The relation ID appears in the URL — e.g. `openstreetmap.org/relation/62700` → ID is `62700`.

**PBF extract** — browse [download.geofabrik.de](https://download.geofabrik.de) for an extract covering your region. It only needs to *contain* your region — a state extract works fine for a single district. The importer cuts your region out of it.

## Installation scenarios

The installer asks for a `DEPLOY_MODE` (which containers run) and an `APP_MODE` (how the map behaves). For a single region of your own, the defaults are right: `data-node-ui` and `standalone`. All five combinations and when to use which: [Deployment modes](../reference/deployment-modes.md).

## Managing the stack

After setup, manage the stack from your deployment directory:

```bash
cd spieli

# Start the stack
docker compose --profile data-node-ui up -d

# Stop the stack
docker compose --profile data-node-ui down
```

Replace `data-node-ui` with whichever mode you chose at install time (`DEPLOY_MODE` in your `.env`). If you said yes to automatic updates, add `--profile auto-update` to both commands, or Watchtower is not started with the rest.

To refresh the OSM data right now:

- **Without automatic updates**, run the importer once: `docker compose --profile data-node run --rm importer`.
- **With automatic updates**, the importer runs permanently and restarting it does not import early. [Refresh Data → Daemon mode](../ops/refresh-data.md#daemon-mode) has the three commands that do.

## Going public with HTTPS

The stack runs on plain HTTP (port 8080) by default. For a public deployment, set up a TLS-terminating reverse proxy.

spieli ships a ready-made Docker Compose stack with Traefik and Let's Encrypt. Install spieli first, then add the proxy:

```bash
curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/deploy/traefik/install-traefik.sh -o install-traefik.sh
bash install-traefik.sh
```

Traefik handles certificate issuance and renewal automatically — no manual cert steps. See [HTTPS setup](../ops/https-setup.md) for the full walkthrough and firewall rules.

---

## Contributing your region to a Hub

To put your region on someone's Hub, run a data-node (`data-node` or `data-node-ui`), expose its `/api/` over HTTPS, and send the hub operator its URL. [Host a Region for spieli.eu](host-a-region.md) walks through exactly that, with server requirements and the check to run before sending the URL; the steps are the same for any other hub.

---

## Running a Hub

A Hub is a stack with `DEPLOY_MODE=ui` and `APP_MODE=hub`, plus a `registry.json` that lists the data-nodes. [Federated Deployment](../ops/federated-deployment.md) walks through it end to end; [`registry.json` reference](../reference/registry-json.md) has the entry format and slug rules. For why spieli works this way, see [Federation: one map, many owners](../concepts/federation.md).

---

## Next steps

- [HTTPS setup](../ops/https-setup.md) — Traefik + Let's Encrypt reverse proxy
- [Configuration reference](../ops/configuration.md) — all available environment variables
- [Troubleshooting](../ops/troubleshooting.md) — common problems and fixes
- [Uninstall](../ops/uninstall.md) — remove the stack completely
