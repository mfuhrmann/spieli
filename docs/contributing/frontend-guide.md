# Frontend Contributor Guide

This guide explains how the Svelte 5 frontend is structured, how data flows through it, and how to make common types of changes. It assumes you have [local dev set up](local-dev.md).

## Architecture overview

```
main.js
  └── StandaloneApp.svelte  or  HubApp.svelte
        ├── Map.svelte             (OpenLayers map, all layers)
        ├── PlaygroundPanel.svelte (detail panel for selected playground)
        ├── FilterPanel.svelte     (filter dropdown)
        ├── SearchBar.svelte       (Nominatim search)
        └── ...
```

The app mounts either `StandaloneApp` or `HubApp` based on `appMode` from `lib/config.js`. The two modes share most components; the hub adds federation components in `src/hub/`.

## State management

The app uses Svelte writable stores (`src/stores/`). Components import stores directly — there is no top-down prop drilling for shared state.

| Store | Shape | Who writes | Who reads |
|---|---|---|---|
| `selection` | `{ feature: OlFeature\|null, backendUrl: string }` | Map.svelte (click), AppShell (deeplink restore) | PlaygroundPanel, NearbyPlaygrounds |
| `filterStore` | `{ private: bool, water: bool, baby: bool, … }` | FilterPanel | Map.svelte (polygon visibility), api.js (cluster params) |
| `activeTierStore` | `null \| 'cluster' \| 'polygon' \| 'macro'` | tieredOrchestrator | Map.svelte (layer visibility) |
| `overlayFeaturesStore` | `{ equipment: [], trees: [] }` | PlaygroundPanel | Map.svelte (equipment/tree layers) |
| `playgroundSourceStore` | OL VectorSource \| null | Map.svelte | NearbyPlaygrounds, AppShell |
| `mapStore` | OL Map \| null | Map.svelte | LocateButton, other map-interacting components |
| `location` | `{ lat, lon, accuracy } \| null` | LocateButton (manual + auto-locate) | Map.svelte (location marker), PlaygroundPanel (navigation origin) |
| `regionFramingApplied` | `null \| true \| false` (region-URL framing outcome; `false` → unresolved, map left at default extent) | StandaloneApp | LocateButton (auto-locate centering decision) |
| `hubLoadingStore` | `{ loaded, total, settling }` | hubOrchestrator | InstancePanel |
| `macroFilteredStore` | `Map<backendUrl, {count, complete, partial, missing}> \| null` | hubOrchestrator (macro tier, filter active) | MacroView |
| `macroCoverageStore` | `{ answered, total, cantFilter[], settling } \| null` | hubOrchestrator (macro tier, filter active) | MacroView, MacroCoverageBanner |

### Selection flow

```
User clicks playground polygon
        │
        ▼
Map.svelte click handler
  → selection.select(feature, backendUrl)
  → writes URL hash (#W<osm_id>)
        │
        ▼
PlaygroundPanel subscribes to selection
  → fetches equipment + trees + POIs + reviews
  → writes overlayFeaturesStore
        │
        ▼
Map.svelte subscribes to overlayFeaturesStore
  → updates equipment and tree OL layers
```

### Filter flow

```
User toggles filter in FilterPanel
        │
        ▼
filterStore updated
        │
        ├──► Map.svelte: polygon layer re-renders
        │    (matchesFilters() hides non-matching polygons)
        │
        └──► tieredOrchestrator.rerun()
             → re-fetches cluster tier with active filters as query params
```

Each zoom tier applies filters through a different path:

| Tier | Filter path |
|---|---|
| polygon | client-side — `matchesFilters()` hides non-matching polygons in Map.svelte |
| cluster | server-side — active filters become `filter_*` query params on `get_playground_clusters` |
| macro (hub) | derived — see below |

### Macro tier (hub) filter path

The macro tier is normally **zero-fetch**: `MacroView.svelte` renders one ring per backend straight from the cached `get_meta` totals, and panning at min zoom dispatches no requests. `get_meta` has no filter dimension, so when a filter is active those totals would ignore it.

When a filter is active, `hubOrchestrator` instead fans out the filter-aware `get_playground_clusters` RPC once per backend (scoped to each backend's own bbox), sums the returned buckets into a per-backend `{count, complete, partial, missing}`, and publishes it progressively on `macroFilteredStore`. `MacroView` overrides each ring's props from that store as entries settle; a backend with no entry yet (or a pre-tier peer that 404s) keeps its cached-meta ring. Clearing all filters sets the store back to `null` and restores the zero-fetch path.

Alongside the filtered aggregate, `hubOrchestrator` publishes **coverage** on `macroCoverageStore` — `{ answered, total, cantFilter[], settling }` where `total` is the in-scope healthy backends, `answered` is those that returned a filtered total, `cantFilter` lists backends that couldn't apply the filter (no bbox, or a 404 on the cluster RPC), and `settling` is true while the fan-out is still in flight. Those backends keep their unfiltered ring but are flagged `_cantFilter` so they render the distinct "unfiltered" variant instead of silently reading as a filtered subset, and `MacroCoverageBanner` shows "filter covers N of M regions" whenever `answered < total` once the fan-out has **settled** (`settling === false`) — so a normal load doesn't flash "covers 0 of N" mid-fetch, while an all-legacy hub still never silently presents partial coverage as complete (#688).

Macro ring variants (`hub/macroRingStyle.js`), in `macroRingStyleFn` priority order: **offline** (dashed grey) → **importing** (blue "updating") → **cantFilter** (full segments + dashed grey halo + "unfiltered" — backend couldn't apply the filter, so its whole catalogue is shown, marked as such) → **filtered-empty** (grey "no match" — healthy backend, but the filter excludes every playground) → **degraded** (amber "no data" — backend reachable but empty) → **healthy** (filled segments + count). Backend-health states outrank the filter outcome; "cant-filter" is a partial-coverage condition that outranks the filter results so it's never mistaken for a filtered ring; "no match" is distinct from the amber "no data" degraded ring.

## Runtime configuration

`lib/config.js` reads `window.APP_CONFIG` (written by `oci/app/docker-entrypoint.sh` at container startup) and exports named constants. In dev (no container), the constants use hardcoded defaults.

Config constants used across the codebase:

| Constant | Default | Notes |
|---|---|---|
| `appMode` | `'standalone'` | `'standalone'` or `'hub'` |
| `apiBaseUrl` | `''` | Empty → Overpass fallback |
| `osmRelationId` | `62700` | Fulda (dev default) |
| `clusterMaxZoom` | `13` | Zoom threshold for tier switch |
| `macroMaxZoom` | `7` | Hub macro view threshold |

## The tiered orchestrator

`lib/tieredOrchestrator.js` is the data-fetching heart of standalone mode. `attachTieredOrchestrator()` wires to the OL map's `moveend` event and:

1. Determines the active tier from `view.getZoom()` vs `clusterMaxZoom`
2. Publishes the tier to `activeTierStore`
3. Cancels any in-flight request via `AbortController`
4. Calls the right API function (`fetchPlaygroundClusters` or `fetchPlaygroundsBbox`)
5. Populates the corresponding OL `VectorSource`

The orchestrator is created in `StandaloneApp.svelte` on mount and torn down on destroy.

## OpenLayers layers

`Map.svelte` owns five OL layers beyond the basemap:

| Layer | zIndex | Visible when |
|---|---|---|
| `playgroundLayer` | 10 | `$activeTierStore === 'polygon'` |
| `clusterLayer` | 12 | `$activeTierStore === 'cluster'` |
| `treeLayer` | 15 | A playground is selected |
| `equipmentLayer` | 20 | A playground is selected |
| `pitchLayer` | 9 | `filterStore.standalonePitches === true` |

Layer visibility is driven by reactive `$:`  statements that subscribe to the stores above.

## Deeplinks

`lib/deeplink.js` handles URL hash encode/decode. Two formats:

- `#W<osm_id>` — standalone (no slug)
- `#<slug>/W<osm_id>` — hub (slug identifies the backend)

`selection.select()` automatically writes the hash. On page load, `AppShell.svelte` reads the hash and dispatches `fetchPlaygroundByOsmId` to hydrate the polygon source before selecting.

## Adding a new filter

### Standard boolean filter (default off)

Most filters default to `false` (inactive). Enabling one restricts the map to playgrounds that have the feature. Example: water playground filter.

**1. `app/src/stores/filters.js`** — add the key to `defaultFilters` and add match logic to `matchesFilters()`:

```js
export const defaultFilters = {
    …
    myNewFilter: false,
};

// in matchesFilters():
if (filters.myNewFilter && !props.my_flag) return false;
```

**2. `app/src/lib/api.js`** — add the cluster-tier RPC param to `clusterFilterMap`:

```js
const clusterFilterMap = {
    …
    myNewFilter: 'filter_my_new',
};
```

**3. `importer/api.sql`** — add a parameter to `get_playground_clusters()` (default `false`) and a WHERE clause. Also drop the old function signature and update the GRANT. Run `make db-apply` to apply.

**4. `app/src/components/FilterPanel.svelte`** — add the icon to `FILTER_ICONS` and a translation key to `locales/*.json`.

**5. `app/src/components/FilterChips.svelte`** — add the key to `FILTER_KEYS`. **Don't skip this.** The chip bar is the only way to clear an active filter from outside the panel; a filter missing from `FILTER_KEYS` can be set but shows no removable chip. `FILTER_KEYS` must stay in sync with the boolean filters in `defaultFilters` (excluding the `standalonePitches` layer toggle and the `show*` completeness states, which are not chip-rendered).

**6. Unit tests** — add cases to `app/src/stores/filters.test.js`.

### Visibility filter (default on)

Use this pattern when users toggle which _categories_ to show rather than requiring a feature. Example: the completeness filter (`showComplete/showPartial/showMissing`).

Key differences from the standard pattern:

- Default value is `true` (show all); deactivating hides a category.
- `matchesFilters()` checks the prop and returns `false` to hide.
- `hasActiveFilters()` detects activity via `!filters.myVisibilityKey`.
- `activeFilterCount()` increments when `false`, not `true`.
- `clearAll()` uses `filterStore.set({ ...defaultFilters })` — already resets visibility filters to `true` automatically.
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

## Internationalisation

Translations live in `locales/*.json` and are loaded by `lib/i18n.js` using svelte-i18n. In components, use the `$t` store:

```svelte
<script>
  import { t } from 'svelte-i18n';
</script>

<p>{$t('myKey')}</p>
```

Add new keys to `locales/en.json` and `locales/de.json`. Translation to other languages happens via [Weblate](translation-guide.md).

## Playground themes

`playground:theme=*` (OSM) is meant to describe a whole playground's motto — a ship, castle, or octopus playground. The tag reaches the frontend on both the playground polygon and equipment features via the `hstore_to_jsonb(tags)` merge in `api.sql` (it is not an osm2pgsql column, so it is not stripped).

In practice the key is dominated by two kinds of non-theme usage: tagging noise (`playground`/`play` are ~53% of all uses) and **device-shape values** — `horse`, `duck`, `elephant`, … tagged on a single `playground=springy` rider to describe its shape, not a playground theme. A springy can be shaped as anything, so those values are noise for our purposes. We therefore honour only an **allowlist** of documented whole-playground themes (`SUPPORTED_THEMES` in `lib/playgroundThemes.js`: ship, castle, spiderweb, water, adventure, rocket, dragon, octopus, circus). Everything else is dropped at the single `splitThemes` choke point, so it never reaches any consumer. Extend the allowlist by adding an entry to `THEME_ICONS` (the icon map *is* the allowlist) plus an `equipAttr.themes.*` label in each locale.

`lib/playgroundThemes.js` owns the presentation:

- `themeIcon(value)` — curated emoji per allowlisted theme value. `FALLBACK_ICON` (✨) is a defensive backstop only; it never renders for non-allowlisted values, which are filtered out upstream.
- `themeName(value, t)` — localised label from `equipAttr.themes.*`, falling back to the raw value.
- `themeOf(props)` — the first allowlisted theme on a single feature, used for the inline device symbol.
- `areaThemesOf(props)` — allowlisted themes on the playground's own area tag; drives the prominent banner near the title.
- `aggregatePlaygroundThemes(areaProps, deviceProps)` — deduped, ordered theme list for a playground (area theme first, then device themes by frequency). `PlaygroundPanel` renders this as an icon-only chip row folded onto the **Equipment** header in the overview; `EquipmentList`/`EquipmentTooltip` render the per-device symbol inline.

Themes are panel-only — no map symbols (discovery is deferred).

## Style system

The app uses Bootstrap 5 (component classes) and Tailwind CSS 4 (utility classes) side by side. The design system primitives in `src/components/ui/` (`Badge`, `Button`, `Card`, etc.) wrap Bootstrap with Tailwind utilities. Prefer these over raw Bootstrap classes in new components.

## See also

- [Local Development](local-dev.md) — dev server setup
- [Testing Guide](testing.md) — how to write and run tests
- [Add a Device](add-device.md) — adding a new playground device type
- [Source Tree Analysis](../source-tree-analysis.md) — annotated directory map
