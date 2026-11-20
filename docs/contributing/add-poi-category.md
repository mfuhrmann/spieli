# Add a POI Category

Nearby POIs (toilets, shops, bus stops, etc.) are shown in the playground detail panel. To add or remove a category, touch three code files and the two source locale files:

## Step 1 — Importer: `importer/import.sh` → osmium tags-filter

The osmium `tags-filter` allowlist controls which OSM tags survive the pre-import clip. If a tag is not listed here, nodes/ways carrying it are dropped before osm2pgsql loads them and the database never sees them.

Add or remove entries for both nodes (`n/`) and ways (`w/`):

The list is `TAG_FILTERS`; nodes and ways have separate blocks:

```bash
n/shop=bakery
…
w/shop=bakery
```

After editing, a full re-import is required (`make import`). Tag the PR with `requires-reimport`.

## Step 2 — Database: `importer/api.sql` → `get_pois()`

The `pois_point` and `pois_polygon` CTEs filter OSM nodes and polygons by tag. Add or remove entries from the `WHERE` clause in both CTEs:

```sql
-- in both CTEs, pois_point and pois_polygon
OR p.shop IN ('chemist', 'supermarket', 'convenience', 'bakery')
```

After editing, run `make db-apply` to reload the function. Tag the PR with `requires-schema-update`. (When the tag filter changed too, `requires-reimport` already covers it.)

## Step 3 — Frontend: `app/src/components/POIPanel.svelte` → `CATEGORIES`

Each category in the `CATEGORIES` array has:

- `icon` — emoji displayed next to the category
- `label` — the translated category name, `$_('poi.categories.<name>')` (not the bare key)
- `match` — function that tests a POI's tags (must match the SQL filter)
- `fallback` — the translated text shown when no POIs are found, `$_('poi.fallbacks.<name>')`
- `hint` (optional) — function returning an extra line per POI, e.g. a bus stop's direction

To add a new category, add an entry to the array. To add an OSM tag to an existing category, extend its `match` function.

## Step 4 — Translations (if adding a new category)

Add `poi.categories.<name>` and `poi.fallbacks.<name>` keys to `locales/en.json` and `locales/de.json` in the same commit. The other locale files belong to Weblate; see [Translation Workflow](translations.md).

## Check it

Run `make db-apply` (and `make import` if you changed the tag filter), then open a playground near a matching place and check that the panel lists it under the new category, and shows the fallback text where there is none.

## Open a pull request

Branch, commit and open the pull request as described in [Local Development → Start here](local-dev.md#start-here). Tag it `requires-reimport` if you changed the tag filter, otherwise `requires-schema-update`.

## See also

- [Import Pipeline](import-pipeline.md): how the osmium filter and `api.sql` fit together
- [API reference → `get_pois`](../reference/api.md#get_poislat-lon-radius_m)
