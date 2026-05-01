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
| `hubLoadingStore` | `{ loaded, total, settling }` | hubOrchestrator | InstancePanel |

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

## Runtime configuration

`lib/config.js` reads `window.APP_CONFIG` (written by `oci/app/docker-entrypoint.sh` at container startup) and exports named constants. In dev (no container), the constants use hardcoded defaults.

Config constants used across the codebase:

| Constant | Default | Notes |
|---|---|---|
| `appMode` | `'standalone'` | `'standalone'` or `'hub'` |
| `apiBaseUrl` | `''` | Empty → Overpass fallback |
| `osmRelationId` | `62700` | Fulda (dev default) |
| `clusterMaxZoom` | `13` | Zoom threshold for tier switch |
| `macroMaxZoom` | `5` | Hub macro view threshold |

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

Adding a filter touches four files:

**1. `app/src/stores/filters.js`** — add the key to `filterStore`'s initial state:

```js
export const filterStore = writable({
    …
    myNewFilter: false,
});
```

Also add the match logic to `matchesFilters()`:

```js
if (filters.myNewFilter && !props.my_flag) return false;
```

**2. `app/src/lib/api.js`** — add the cluster tier filter param (if the filter should apply to cluster buckets):

```js
const clusterFilterMap = {
    …
    myNewFilter: 'filter_my_new',
};
```

**3. `importer/api.sql`** — add a filter parameter to `get_playground_clusters()` and handle it in the SQL WHERE clause. Run `make db-apply` to apply.

**4. `app/src/components/FilterPanel.svelte`** — add the toggle to the filter UI.

## Internationalisation

Translations live in `locales/*.json` and are loaded by `lib/i18n.js` using svelte-i18n. In components, use the `$t` store:

```svelte
<script>
  import { t } from 'svelte-i18n';
</script>

<p>{$t('myKey')}</p>
```

Add new keys to `locales/en.json` and `locales/de.json`. Translation to other languages happens via [Weblate](translation-guide.md).

## Style system

The app uses Bootstrap 5 (component classes) and Tailwind CSS 4 (utility classes) side by side. The design system primitives in `src/components/ui/` (`Badge`, `Button`, `Card`, etc.) wrap Bootstrap with Tailwind utilities. Prefer these over raw Bootstrap classes in new components.

## See also

- [Local Development](local-dev.md) — dev server setup
- [Testing Guide](testing.md) — how to write and run tests
- [Add a Device](add-device.md) — adding a new playground device type
- [Source Tree Analysis](../source-tree-analysis.md) — annotated directory map
