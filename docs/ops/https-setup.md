# HTTPS setup (Traefik + Let's Encrypt)

The spieli Docker stack listens on port 8080 over plain HTTP. To serve it publicly over HTTPS, use the `deploy/traefik` stack — a single Traefik v3 container that terminates TLS and reverse-proxies to port 8080. Traefik handles certificate issuance and renewal automatically — no certbot container, no manual cert steps.

## Prerequisites

- A VM with a public IP address
- Docker Engine 20.10+ and Docker Compose v2 (`docker compose version`)
- A DNS A record pointing your domain to the server IP (e.g. `spieli.example.com → 1.2.3.4`)
- Ports 80 and 443 open in the firewall (see [Firewall](#firewall))

## 1. Download and run the installer

```bash
curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/deploy/traefik/install-traefik.sh -o install-traefik.sh
bash install-traefik.sh
```

The installer prompts for an installation directory (default `./spieli-traefik`), your domain, email address, and a mode, then:

1. Downloads the Compose file
2. Generates `traefik.yml` with your email for Let's Encrypt
3. Generates `dynamic/app.yml` with your domain and routing rules
4. Starts Traefik

Which mode to choose:

| Your spieli `DEPLOY_MODE` | Traefik mode |
|---|---|
| `data-node-ui` | 1 (`data-node-ui`, proxies to the app on port 8080) |
| `ui` (a hub, or a remote frontend) | 1 as well: the app is on port 8080 |
| `data-node` | 2 (`data-node`) — **currently broken**: it proxies to port 3000, which the installed stack does not publish ([#1062](https://github.com/mfuhrmann/spieli/issues/1062)). Run `data-node-ui` and mode 1 instead |

Traefik issues the TLS certificate on the first HTTPS request (takes ~10 seconds). If your browser shows a certificate error immediately after startup, wait a moment and reload.

## 2. Install spieli

If you haven't installed the spieli app stack yet, follow [Quick Start → Install](../getting-started/quick-start.md#install). It installs a tagged release and verifies the installer's checksum.

When the spieli installer asks for the public URL of the instance (part of the imprint and privacy setup), enter `https://spieli.example.com`.

## Renewal

Traefik renews certificates automatically before they expire. No cron jobs or manual steps needed.

## Stopping and starting

```bash
cd spieli-traefik
docker compose down   # stop
docker compose up -d  # start (cert is stored in the letsencrypt volume — no re-issue needed)
```

## Firewall

Open ports 80 (ACME challenge) and 443 (HTTPS). Block 8080 from public access — traffic should only reach it through Traefik. UFW alone does not do that: Docker opens published ports past UFW's rules, so block 8080 in your provider's firewall (or with a rule in iptables' `DOCKER-USER` chain).

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 8080/tcp
```

!!! note "Cloud provider firewalls"
    Many VPS providers (Hetzner, DigitalOcean, etc.) have a separate firewall in their control panel that acts before UFW. If the ACME challenge fails with "connection refused", check that ports 80 and 443 are open there too.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `502 Bad Gateway` | spieli stack not running on port 8080 — run `docker compose ps` from the spieli directory |
| Certificate not issued | Port 80 blocked (cloud firewall or UFW), or DNS not yet pointing to this server |
| `host.docker.internal` not resolved | Docker Engine < 20.10 — upgrade Docker |
| Imprint or privacy links open `http://` | `SITE_URL` in the spieli `.env` is set to `http://…`. Fix it and restart the app container. On a data-node that a hub lists, the hub's links come from the database: also re-apply the schema (`run --rm -e API_ONLY=1 importer`, see [Upgrading](upgrade.md)) |
| Logs | `docker compose logs -f` from the `spieli-traefik/` directory |
