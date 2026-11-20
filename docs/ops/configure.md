# Configure the instance

How the settings in `.env` work together, for the areas where that takes more than one line. Every single variable, with its default, is listed in the [Configuration Reference](configuration.md).

## Applying changes

After editing `.env`, restart the relevant containers. Replace `<mode>` with your `DEPLOY_MODE` value (`data-node`, `ui`, or `data-node-ui`):

```bash
# Restart app only (config changes)
docker compose --profile <mode> up -d app

# Full restart
docker compose --profile <mode> down
docker compose --profile <mode> up -d
```

Changing the legal settings needs more than an app restart: see [Legal pages → Applying changes](#applying-legal-changes).

## Legal pages

In Germany a public service needs an imprint (*Impressum*) and a privacy notice (*Datenschutzerklärung*); other countries have their own rules. We cannot give legal advice. What spieli does for you: the installer asks for the details (or lets you skip them), and the settings below decide what is generated.

**Option 1: let spieli generate the pages.** Set the contact details in `.env`:

| Page | Served at | Needs |
|---|---|---|
| Imprint | `/legal/impressum` | `IMPRESSUM_NAME` and `IMPRESSUM_ADDRESS`; `IMPRESSUM_ORG`, `IMPRESSUM_EMAIL`, `IMPRESSUM_PHONE` appear when set |
| Privacy notice | `/legal/datenschutz` | `IMPRESSUM_NAME` and `IMPRESSUM_EMAIL` |

The app container writes both pages at startup, in German. Without the required values a page still exists but says that the operator's details have not been configured yet. The privacy notice is generated from the actual configuration: which external services the visitor's browser contacts, and which only your server does, follows the `PROXY_*` and basemap settings ([Basemap and external services](basemap-and-services.md)), so it does not need editing by hand when those change.

**Option 2: link pages you already have.** Set `IMPRESSUM_URL` and `PRIVACY_URL`. The corresponding page is then not generated, and the app links your URL instead.

**`SITE_URL`** (for example `https://spieli.example.com`) should be set whenever the instance is public. A hub links your legal pages from absolute URLs, which `get_meta()` builds from `SITE_URL` unless `IMPRESSUM_URL` / `PRIVACY_URL` give them directly; with neither, the hub gets no URL.

**What a hub shows for your region.** In its region list a hub links the URLs from your `get_meta()`. On a data-node the importer also stores the generated imprint and privacy text in the database (when `IMPRESSUM_NAME` and `IMPRESSUM_ADDRESS` are set), so a hub can show it even when no URL is available.

### Applying legal changes

After changing `IMPRESSUM_*`, `SITE_URL`, `IMPRESSUM_URL` or `PRIVACY_URL`, three things are refreshed separately:

1. **This instance's own pages:** recreate the app container (`restart` would keep the old environment):
   ```bash
   docker compose --profile <mode> up -d app
   ```
2. **The links a hub shows** come from `get_meta()`, which bakes the URLs in when `api.sql` is applied. Recreate the daemon importer (`up -d importer`: it applies a changed `api.sql` on startup), or run `docker compose --profile <mode> run --rm -e API_ONLY=1 importer`.
3. **The legal text a hub shows for a data-node** is rewritten only at the end of a **full** import. See [Refresh Data](refresh-data.md).

## Language settings

`DEFAULT_LOCALE` and `REGION_LANG` answer different questions and are
deliberately independent:

| | Question | Affects |
|---|---|---|
| `DEFAULT_LOCALE` | What language is the **interface** in? | Every translated label, and the document's `lang` attribute |
| `REGION_LANG` | What language are the **playgrounds named** in? | The `lang` attribute on OSM-derived names |

A Fulda instance serving an English-speaking audience sets
`DEFAULT_LOCALE=en` and keeps `REGION_LANG=de`: the buttons read "Filter",
but the playgrounds are still called *Spielplatz Am Rosengarten*. Screen
readers use these attributes to pick a pronunciation, and CSS hyphenation
uses `REGION_LANG` to break long compound names correctly.

Set `REGION_LANG` to the language your OSM `name` tags are actually written
in. A bilingual region gets one value for all names — per-object language is
not derivable from OSM data.

`REGION_COUNTRY` and `REGION_STATE` are separate again: they only affect how
public holidays in `opening_hours` values are resolved. A German-language
deployment serving Austrian playgrounds sets `REGION_LANG=de` with
`REGION_COUNTRY=at`.

Only `opening_hours` values with `PH` (public holiday) are affected — 69 of
7 042 playgrounds in the Hessen extract (September 2026). A value the app
cannot resolve is ignored and logged in the browser console as
`[config] REGION_STATE "…" is not a state of …`, listing the codes it knows.

**Behaviour change in #878:** before it, a code such as `he` was ignored, so
stacks configured with the previously documented `REGION_STATE=he` evaluated
holidays without a state. After upgrading they honour their state's holidays —
a playground tagged `PH off` now shows as closed on e.g. Corpus Christi in
Hessen. No action is needed.

> **How `PG_*` values are applied.** The importer runs `ALTER SYSTEM SET …`
> at the top of `api.sql`, then `SELECT pg_reload_conf()`. The values are
> persisted to `postgresql.auto.conf` inside the data volume and apply to
> every connection — including PostgREST — without restarting the database
> container. To re-tune, edit `.env` and re-apply the schema only:
> ```bash
> docker compose --profile <mode> run --rm -e API_ONLY=1 importer
> ```
> Without `API_ONLY=1` this runs a full import — or, on a stack with
> automatic updates, starts a second importer daemon next to the running one.

## RAM sizing

!!! warning "The compose files currently pass higher values"
    The defaults below are what `importer/import.sh` and `.env.example` intend. `compose.yml` and `compose.prod.yml` still pass the older, higher values (6 / 4 / 4 · `512MB` · `128MB`, a peak of about 3 GB), and they win whenever `.env` does not set the variables, which the installer does not do. Until [#1060](https://github.com/mfuhrmann/spieli/issues/1060) is fixed, set the values from the table below in `.env` explicitly, especially on hosts with 4 GB or less.

Defaults are sized for a **2-core / 4 GB host** (peak ≈ 1.5 GB during the
heaviest single operation, `CREATE INDEX`). Recommended values per host
size:

| Host RAM / cores | `WORKERS` / `PER_GATHER` / `MAINT` | `MAINT_WORK_MEM` | `WORK_MEM` | Approx. peak |
|---|---|---|---|---|
| 4 GB / 2 core (default) | 2 / 2 / 2 | 256MB | 32MB | ~1.5 GB |
| 8 GB / 4–6 core         | 4 / 2 / 4 | 512MB | 64MB | ~3 GB |
| 16 GB / 8 core          | 8 / 4 / 4 | 1GB   | 128MB | ~6 GB |

The driver of the peak is `CREATE INDEX` parallelism (≈ `MAINT_WORK_MEM ×
(MAINT_WORKERS + 1)`) followed by the materialised view rebuild (≈
`WORK_MEM × (PER_GATHER + 1) × ~4 hash/sort nodes`). These run sequentially,
so the budget is the larger of the two plus baseline (~700 MB for
`shared_buffers` default + PostgREST pool + WAL + autovacuum).

## Scheduling OSM re-imports

Two ways, both described in [Scheduled Import](scheduled-import.md): **daemon mode** (set `REIMPORT_INTERVAL_MIN_DAYS` and `REIMPORT_INTERVAL_MAX_DAYS`; the installer does this when you choose automatic updates) or a **one-shot** importer started by a systemd timer or cron.

## Basemap and external services

Where the background map comes from, and how search, photos and reviews are fetched without the visitor's browser contacting a third party: [Basemap and external services](basemap-and-services.md). The defaults need no setting.
