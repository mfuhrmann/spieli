# Contributing

All contributions are welcome — code, translations, bug reports, or documentation improvements.

Translations are managed with [Weblate](https://weblate.org/), which hosts spieli free of charge under its Libre plan: **[translate spieli on Weblate](https://hosted.weblate.org/engage/spieli/)** — no GitHub account needed. Do not hand-edit locale files other than `locales/en.json` and `locales/de.json`; see [the translation workflow](https://mfuhrmann.github.io/spieli/contributing/translations/).

## Repository layout

| Directory | Contents |
|---|---|
| `app/` | Svelte 5 frontend app (source in `app/src/`) |
| `importer/` | Import script (`import.sh`: osmium filter + osm2pgsql) and PostgREST API SQL (`api.sql`) |
| `db/` | PostgreSQL initialisation SQL |
| `oci/` | Docker build contexts — `oci/app/` (Svelte app + nginx) |
| `taginfo/` | [taginfo](https://taginfo.openstreetmap.org) metadata describing the OSM tags this project uses. Keep `taginfo/taginfo.json` in sync when you change the `osmium tags-filter` in `importer/import.sh`, the tags read in `importer/api.sql`, or the tags rendered by the frontend (e.g. `app/src/lib/equipmentAttributes.js`). |
| `locales/` | Translation files (`*.json`, one per language) — maintained on [Weblate](https://hosted.weblate.org/engage/spieli/); only `en.json` and `de.json` are hand-edited |
| `deploy/` | Traefik HTTPS stack, shared basemap cache, monitoring stack, systemd import timer |
| `docs/` | This documentation (MkDocs); `mkdocs.yml` holds the navigation |

## Step 1 — Create a GitHub issue

Before writing code, open an issue describing what you want to fix or add. This lets maintainers give early feedback and avoids duplicated effort. Skip this for tiny fixes like typos.

## Step 2 — Create a branch

```bash
git checkout main
git pull
git checkout -b fix/123-popup-scroll
```

**Branch naming:** `<type>/<issue-number>-<short-description>`, with the type from the commit types below, e.g. `feat/130-equipment-map-layer`, `fix/123-popup-scroll`, `docs/456-glossary`. Contributors without write access work on a fork and open the PR against `mfuhrmann/spieli`.

## Step 3 — Make your change and test it

For frontend changes, run `make dev` and verify the feature in your browser. For Docker stack changes, run `make docker-build` and test at `http://localhost:8080`.

If you edited documentation, run `make docs-build` before pushing — the CI deploy uses `--strict` mode and will fail on broken links or missing nav entries.

## Step 4 — Commit with a conventional commit message

```bash
git add app/src/lib/yourChangedFile.js
git commit -m "feat: add balance_beam playground device"
```

**Format:** [Conventional Commits](https://www.conventionalcommits.org/), `<type>[optional scope]: <short description>`

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`

Examples:

- `feat: add filtering by device height`
- `fix: location button not showing nearby playgrounds on mobile`
- `docs: add balance_beam to device how-to guide`

## Step 5 — Push and open a pull request

```bash
git push -u origin fix/123-popup-scroll
```

GitHub will print a link to open a pull request. Write a short description of what you changed and why, and submit. A maintainer will review it.

> **Never push directly to `main`.** All changes go through a branch and a pull request.
