# Deployment modes

Every spieli stack runs the same release. Two settings decide which role it plays; the installer asks for both, and they end up in `.env`.

`DEPLOY_MODE` decides **which containers run**; `APP_MODE` decides **how the map behaves**. They are independent, which gives five combinations:

| Scenario | `DEPLOY_MODE` | `APP_MODE` | What starts | Use when |
|---|---|---|---|---|
| **Standalone** (default) | `data-node-ui` | `standalone` | database, importer, API, app | One self-contained map for your region. A hub can list it as well; nothing extra to set |
| **Backend only** | `data-node` | — | database, importer, API | Provide a region to a hub without a map of your own. Needs a reverse proxy that adds CORS to the API. The Traefik installer's `data-node` mode currently cannot reach the API ([#1062](https://github.com/mfuhrmann/spieli/issues/1062)); until that is fixed, use **Standalone** with Traefik instead |
| **Remote frontend** | `ui` | `standalone` | app | A map for one region whose data lives on another server. The installer asks for its `API_BASE_URL`; that server must send CORS headers |
| **Hub only** | `ui` | `hub` | app | One map over several regions, each on its own data-node. No database of its own |
| **Hub + local backend** | `data-node-ui` | `hub` | database, importer, API, app | A hub that also serves one region itself; `registry.json` lists the local `/api` plus any remote ones |

For the hub scenarios the installer asks for `REGISTRY_URL` and writes a starter `registry.json`; edit it afterwards to list your data-nodes. How a hub works: [Federation: one map, many owners](../concepts/federation.md).

`APP_MODE` is not asked for `data-node`, which has no frontend. The containers each `DEPLOY_MODE` starts are the compose profiles of the same name; see [Configuration → Compose profiles](../ops/configuration.md#compose-profiles).
