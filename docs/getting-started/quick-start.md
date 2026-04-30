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

---

## Joining an existing Hub

If someone is running a spieli Hub and you want your region to appear on it, you need to stand up a data-node and send them your API URL. The hub operator then adds you to their `registry.json`.

### Backend operator (you)

**1. Run the installer**

```bash
curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/install.sh -o install.sh
bash install.sh
```

When prompted for deployment mode, choose:

- **`data-node-ui`** — easiest path; nginx is included and adds CORS headers automatically.
- **`data-node`** — db + PostgREST only, no nginx. Choose this if you run your own reverse proxy and will add CORS headers yourself.

Enter your OSM relation ID and Geofabrik PBF URL when asked, and run the import.

**2. Expose `/api/` over HTTPS**

Put an HTTPS-terminating reverse proxy (nginx, Caddy, Traefik, …) in front of your stack. The Hub's browser clients fetch your `/api/` cross-origin, so HTTPS and CORS are both required.

- With `data-node-ui`: CORS is already configured in the shipped nginx — nothing extra to do.
- With `data-node`: add `Access-Control-Allow-Origin: *` (and `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`) to your proxy's `/api/` location block.

**3. Verify**

From a different machine:

```bash
curl -i https://your-city.example.com/api/rpc/get_meta
# expect: 200 OK, JSON body, and Access-Control-Allow-Origin: * in the response headers
```

**4. Send the hub operator your API URL**: `https://your-city.example.com/api`

---

### Hub operator

Add the new backend to `registry.json` (the file your Hub serves at `/registry.json`):

```json
{
  "instances": [
    { "slug": "existing-region", "url": "https://existing.example.com/api", "name": "Existing Region" },
    { "slug": "new-city",        "url": "https://your-city.example.com/api", "name": "New City" }
  ]
}
```

The Hub re-reads `registry.json` every 5 minutes — no restart needed.

!!! tip "Choosing a slug"
    The `slug` is optional but recommended — it makes deep-links shareable and stable (e.g. `https://hub.example.com/#new-city/W123456`). Use lowercase ASCII letters, digits, and hyphens only.

For the full federation walkthrough including topology diagrams and verification steps, see [Federated Deployment](../ops/federated-deployment.md).
