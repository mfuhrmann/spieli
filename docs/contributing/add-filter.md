# Add a Filter

How to add a filter to the filter panel, from the database flag to the removable chip. There are two kinds: a **standard** filter (off by default, narrows the map to playgrounds that have something) and a **visibility** filter (on by default, hides a category when switched off). How filter state flows through the frontend: [Frontend Guide → Filter flow](frontend-guide.md#filter-flow).


## Standard boolean filter (default off)

Most filters default to `false` (inactive). Enabling one restricts the map to playgrounds that have the feature. Example: water playground filter.

**1. `importer/api.sql`: the flag** — add a boolean column to `playground_stats` (the `equip_stats` CTE computes the existing ones from the equipment inside each playground) and run `make db-apply`. A full `make import` is only needed if the flag depends on a tag the [tag filter](import-pipeline.md#the-tag-filter-importerimportsh) does not keep yet. Which tags set the existing flags: [OSM Tags spieli Reads → Filters](../reference/osm-tags.md#filters).

**2. `app/src/stores/filters.js`** — add the key to `defaultFilters` and add match logic to `matchesFilters()`:

```js
export const defaultFilters = {
    …
    myNewFilter: false,
};

// in matchesFilters():
if (filters.myNewFilter && !props.my_flag) return false;
```

**3. `app/src/lib/api.js`** — add the cluster-tier RPC param to `clusterFilterMap`:

```js
const clusterFilterMap = {
    …
    myNewFilter: 'filter_my_new',
};
```

**4. `importer/api.sql`: the RPC parameter** — add a parameter to `get_playground_clusters()` (default `false`) and a WHERE clause. Also drop the old function signature and update the GRANT. Run `make db-apply` to apply.

**5. `app/src/components/FilterPanel.svelte`** — add the icon to `FILTER_ICONS`, and the label's translation key to `locales/en.json` and `locales/de.json` only — the other locale files belong to Weblate ([Translation Workflow](translations.md)).

**6. `app/src/components/FilterChips.svelte`** — add the key to `FILTER_KEYS`. **Don't skip this.** The chip bar is the only way to clear an active filter from outside the panel; a filter missing from `FILTER_KEYS` can be set but shows no removable chip. `FILTER_KEYS` must stay in sync with the boolean filters in `defaultFilters` (excluding the `standalonePitches` layer toggle and the `show*` completeness states, which are not chip-rendered).

**7. Unit tests** — add cases to `app/src/stores/filters.test.js`.

## Visibility filter (default on)

Use this pattern when users toggle which _categories_ to show rather than requiring a feature. Example: the completeness filter (`showComplete/showPartial/showMissing`).

**Rule: anything that affects what is fetched or drawn reads `effectiveFilterStore`, never `filterStore`.** The completeness states are only in force while mapping detail is on (#924); `effectiveFilterStore` forces them to `true` otherwise, and it also emits when mapping detail is toggled, so subscribers refetch. Only the controls that *edit* filters read `filterStore`.

Key differences from the standard pattern:

- Default value is `true` (show all); deactivating hides a category.
- `matchesFilters()` checks the prop and returns `false` to hide.
- `hasActiveFilters()` detects activity via `!filters.myVisibilityKey`.
- `activeFilterCount()` increments when `false`, not `true`.
- Each popover resets only its own keys: FilterPanel's and FilterChips' "clear all" leave the completeness states alone, and MappingDetailControl resets only those.
- Cluster RPC params default `true`; pass `'false'` only when deactivated:

```js
// api.js — in fetchPlaygroundClusters:
if (filters.showMyCategory === false) params.set('filter_my_category', 'false');
```

- SQL param defaults `true`; add a WHERE clause that ORs across all enabled states:

```sql
AND (
  (ps.my_col = 'a' AND filter_a)
  OR (ps.my_col = 'b' AND filter_b)
)
```

## Check it

Run `make test-unit`, then import a region that has playgrounds with the feature and check that the filter narrows both tiers (zoomed out and zoomed in) and shows a chip you can remove. In a hub, a backend on an older release cannot apply the new parameter; the hub then shows it as *unfiltered* ([Ring states](../reference/federation.md#ring-states)).

## Open a pull request

Branch, commit and open the pull request as described in [Local Development → Start here](local-dev.md#start-here). Tag it `requires-schema-update`, since `api.sql` changed.
