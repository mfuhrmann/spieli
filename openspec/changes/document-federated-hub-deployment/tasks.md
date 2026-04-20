## 1. Walkthrough page — `docs/ops/federated-deployment.md`

- [ ] 1.1 Add an intro paragraph defining the topology: one Hub UI + ≥ 1 data-node, no UI on the backends
- [ ] 1.2 Include an ASCII topology diagram showing browser → Hub UI → N × data-node
- [ ] 1.3 Document the per-node `.env` for each data-node (`DEPLOY_MODE=data-node`, `OSM_RELATION_ID`, `PBF_URL`, `POSTGRES_PASSWORD`)
- [ ] 1.4 Document the Hub UI's `.env` (`DEPLOY_MODE=ui`, `APP_MODE=hub`, `REGISTRY_URL`, `HUB_POLL_INTERVAL`, `APP_PORT`) — note that `API_BASE_URL` is *not* set on a Hub
- [ ] 1.5 Show a copy-pasteable `registry.json` example covering two backends in the `{instances: [...]}` shape
- [ ] 1.6 Document where `registry.json` is served from (same origin as the Hub UI) and the CORS requirement on data nodes
- [ ] 1.7 Show the exact `docker compose --profile ui up -d` invocation for the Hub and `--profile data-node up -d` + `run --rm importer` for each backend
- [ ] 1.8 Add a "Verification" section: operator visits the Hub, opens DevTools, sees features loaded from each backend URL

## 2. Registry schema reference — `docs/reference/registry-json.md`

- [ ] 2.1 Document the two accepted top-level shapes: `{instances: [...]}` and bare array (source of truth: `app/src/hub/registry.js:93`)
- [ ] 2.2 Document per-entry fields read by the Hub: `url` (required), `name` (optional, falls back to meta or url)
- [ ] 2.3 Note which fields come from `/api/rpc/get_meta` at runtime (`version`, `region`) so readers don't try to set them in `registry.json`
- [ ] 2.4 Include a minimal and a full example side-by-side

## 3. Configuration reference — `docs/ops/configuration.md`

- [ ] 3.1 Add a `REGISTRY_URL` row: default unset, mode `ui` (hub), description + link to the registry-json reference page
- [ ] 3.2 Clarify the existing `APP_MODE` row so it's visible that `hub` requires `REGISTRY_URL`

## 4. Architecture reference — `docs/reference/architecture.md`

- [ ] 4.1 Under "Deployment modes", add a second subsection showing the `DEPLOY_MODE` × `APP_MODE` matrix
- [ ] 4.2 Mark the legal-and-useful cells; mark `data-node × hub` as N/A (no UI to run in hub mode)
- [ ] 4.3 Include a one-line caption pointing readers at `docs/ops/federated-deployment.md` for the hub topology

## 5. Federation page cross-link — `docs/reference/federation.md`

- [ ] 5.1 Add a "See also" link to `docs/ops/federated-deployment.md` as the stand-up walkthrough
- [ ] 5.2 Add a "See also" link to `docs/reference/registry-json.md` for the schema

## 6. `.env.example` — Hub block

- [ ] 6.1 Add a commented "Hub mode" section with `APP_MODE=hub` and `REGISTRY_URL=` (both commented out)
- [ ] 6.2 Add a one-line comment pointing at `docs/ops/federated-deployment.md`

## 7. MkDocs nav — `mkdocs.yml`

- [ ] 7.1 Add `docs/ops/federated-deployment.md` under the Ops section of the nav
- [ ] 7.2 Add `docs/reference/registry-json.md` under the Reference section of the nav

## 8. Validation

- [ ] 8.1 Run `mkdocs build --strict` and confirm no broken links / nav warnings
- [ ] 8.2 Run `openspec validate document-federated-hub-deployment --strict` and confirm it passes
- [ ] 8.3 Read the walkthrough top-to-bottom as if standing up a real cluster — sanity-check that every command is correct against `compose.prod.yml` and `install.sh`
