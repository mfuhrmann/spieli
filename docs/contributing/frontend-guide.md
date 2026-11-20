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
| `selection` | `{ feature: OlFeature\|null, backendUrl: string, kind: 'playground'\|'pitch' }`; derived `hasSelection`, `selectedKind`, `selectedOsmId` | Map.svelte (click), AppShell (deeplink restore) | PlaygroundPanel, PitchPanel, AppShell (panel slot) |
| `filterStore` | `{ private: bool, water: bool, baby: bool, … }` | FilterPanel, MappingDetailControl, FilterChips | the popovers' own checkboxes — everything else reads `effectiveFilterStore` |
| `modalOpen` | `boolean` (derived from a counter) | the `modal` action on each dialog element | Map.svelte (Escape handler) |
| `effectiveFilterStore` | derived from `filterStore` + `mappingDetail` | — | Map.svelte (polygon visibility), StandaloneApp/HubApp (tier refetch → cluster params, macro aggregates), FilterChips |
| `mappingDetail` | `boolean` (default `false`; `localStorage` + `?detail=1\|0`) | MappingDetailControl | Map.svelte (cluster/polygon/macro style), AppShell (legend), PlaygroundPanel (share link), `effectiveFilterStore` |
| `activeTierStore` | `null \| 'cluster' \| 'polygon' \| 'macro'` | tieredOrchestrator | Map.svelte (layer visibility) |
| `overlayFeaturesStore` | `{ equipment: [], trees: [] }` | PlaygroundPanel | Map.svelte (equipment/tree layers) |
| `playgroundSourceStore` | OL VectorSource \| null | Map.svelte | AppShell (deeplink hydration), ReportMissingFlow (duplicate check) |
| `mapStore` | OL Map \| null | Map.svelte | LocateButton, other map-interacting components |
| `location` | `{ lat, lon, accuracy } \| null` | LocateButton (manual + auto-locate) | Map.svelte (location marker), PlaygroundPanel (navigation origin) |
| `regionFramingApplied` | `null \| true \| false` (region-URL framing outcome; `false` → unresolved, map left at default extent) | StandaloneApp | LocateButton (auto-locate centering decision) |
| `hubLoadingStore` | `{ loaded, total, settling }` | hubOrchestrator | nothing at the moment — the region pill's progress comes from the registry store |
| `macroFilteredStore` | `Map<backendUrl, {count, complete, partial, missing}> \| null` | hubOrchestrator (macro tier, filter active) | MacroView |
| `macroCoverageStore` | `{ answered, total, cantFilter[], settling } \| null` | hubOrchestrator (macro tier, filter active) | MacroView, MacroCoverageBanner |
| `outsideBasemapCoverage` | `null \| boolean` (no limit declared / inside / outside `BASEMAP_COVERAGE_BBOX`) | Map.svelte (moveend) | BasemapCoverageNotice |
| `dataCoverage` | `[{ url, bbox, slug?, name? }] \| null` — where this map has data | StandaloneApp, HubApp | ReportMissingFlow (outside it: no duplicate check, MapComplete only) |
| `installPrompt` | the browser's `beforeinstallprompt` event \| null | the store module itself (listens for the event) | DataContributionModal (**Install as app**) |
| `reportStep` / `reportPlacing` | `null \| 'place' \| 'dupe' \| 'choose' \| 'form' \| 'done'` / derived boolean | `startReport()` from every entry point (AppShell button, SearchBar no-hits, About dialog, ReportMissingFlow's empty-area hint) | ReportMissingFlow (the steps), AppShell (hides controls), Map.svelte (click does not select while placing) |

### Selection flow

The selection is a playground **or** a standalone pitch (#934; in the hub too since #947): `selection.select(feature, backendUrl, kind)` with `kind` `'playground'` (default) or `'pitch'`. One store with a kind keeps "only one thing is open" true by construction. `hasSelection` means "anything is open" (it drives the shared panel slot and the mobile layout); `selectedKind` says which; `selectedOsmId` is the selected *playground's* id only. Anything that only makes sense for a playground — PlaygroundPanel's equipment, trees, POIs and reviews — must check the kind. A pitch is selected by a click on a layer the shell marks `selectable` (the pitch layer from `lib/pitchLayer.js`, not a selected playground's equipment overlay), writes `#P<osm_id>` (in the hub `#<slug>/P<osm_id>`; a slug-less hub link is resolved by asking every backend), and opens `PitchPanel` in the playground panel's slot; its display rules (every fact only when tagged) live in `lib/pitchInfo.js`.

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
User toggles filter in FilterPanel / MappingDetailControl
        │
        ▼
filterStore updated ──► effectiveFilterStore (completeness states forced on
        │                while mapping detail is off)
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
| `defaultLocale` | `''` | UI language; empty → browser language → `en` |
| `regionLang` | `'de'` | Language the served OSM data is named in |
| `regionCountry` | `'de'` | Country for `opening_hours` holiday resolution |
| `regionState` | `''` | Optional state refinement; empty → library default |
| `openingHoursAddress` | derived | `{ country_code, state? }` for the `opening_hours` constructor — use this, never a literal |

## The tiered orchestrator

`lib/tieredOrchestrator.js` is the data-fetching heart of standalone mode. `attachTieredOrchestrator()` wires to the OL map's `moveend` event and:

1. Determines the active tier from `view.getZoom()` vs `clusterMaxZoom`
2. Publishes the tier to `activeTierStore`
3. Cancels any in-flight request via `AbortController`
4. Calls the right API function (`fetchPlaygroundClusters` or `fetchPlaygroundsBbox`)
5. Populates the corresponding OL `VectorSource`

The orchestrator is created in `StandaloneApp.svelte` on mount and torn down on destroy.

### Cluster buckets: grouping, position and merging

The standalone client switches between two zoom-scoped layers at `clusterMaxZoom` (default 13). Below the boundary it calls `get_playground_clusters(z, bbox)` for pre-aggregated count buckets; above it, `get_playgrounds_bbox(bbox)` for full polygons. The cluster RPC keeps two concerns deliberately separate: **grouping** is grid-based — each playground centroid is snapped to a zoom-dependent cell that decides which features share a bucket — while **position** is the unweighted spatial mean of the bucket's member centroids, so the rendered dot tracks the geography of its members rather than the lattice.

Because a grid cell is about as wide as a marker (≈ 64 px at z12 against a ≈ 52 px disc), neighbouring buckets routinely touch: two playgrounds 300 m apart on either side of a cell border become a disc and a pin side by side. Both modes therefore merge buckets client-side before drawing them (`lib/clusterMerge.js`, #941): buckets whose markers would overlap at the current resolution are combined, counts and completeness segments summed, the position the **count-weighted** mean. Marker size follows the count (`radiusForCount`), a single playground is sized as the finder pin in both modes, and passes repeat until nothing overlaps, since a merge grows the disc. In hub mode (see [Federation](../reference/federation.md)) the same merge runs over all backends' buckets together, which is what removes the seam where two backends meet.

See [API reference — `get_playground_clusters`](../reference/api.md#get_playground_clustersz-bbox) for the response shape.

## OpenLayers layers

`Map.svelte` owns the basemap and most overlays; two more are added by the modules that own them:

| Layer | zIndex | Owner | Visible when |
|---|---|---|---|
| `macroOutlineLayer` | -1 | Map.svelte | Hub macro tier (world outline under the basemap) |
| basemap | 0 | Map.svelte | Always (vector tile or raster) |
| `pitchLayer` | 9 | `lib/pitchLayer.js` | `filterStore.standalonePitches` is on and zoom ≥ 12 |
| `playgroundLayer` | 10 | Map.svelte | `$activeTierStore === 'polygon'` |
| `clusterLayer` | 12 | Map.svelte | `$activeTierStore === 'cluster'` |
| `macroLayer` | 14 | Map.svelte | `$activeTierStore === 'macro'` (hub) |
| `treeLayer` | 15 | Map.svelte | A playground is selected |
| `equipmentLayer` | 20 | Map.svelte | A playground is selected |
| own sent hints | 25 | ReportMissingFlow.svelte | The visitor kept sent hints; zoom ≥ 11 |
| `locationLayer` | 30 | Map.svelte | A GPS position is known |

Layer visibility is driven by reactive `$:`  statements that subscribe to the stores above.

## Deeplinks

`lib/deeplink.js` handles URL hash encode/decode (`parseHash`, `writeHash`). The letter says what is selected — `W` a playground, `P` a standalone pitch:

- `#W<osm_id>` / `#P<osm_id>` — standalone (no slug)
- `#<slug>/W<osm_id>` / `#<slug>/P<osm_id>` — hub (slug identifies the backend; a slug-less pitch link is resolved by asking every backend)

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

## Internationalisation

New UI strings go into `locales/en.json` and `locales/de.json` in the same commit, and no other locale file is edited by hand. The full workflow, including how strings reach Weblate and back: [Translation Workflow → Adding new UI strings](translations.md#adding-new-ui-strings-developer-workflow).

Translations live in `locales/*.json` and are loaded by `lib/i18n.js` using svelte-i18n. In components, use the `$_` store, as every component does:

```svelte
<script>
  import { _ } from 'svelte-i18n';
</script>

<p>{$_('myKey')}</p>
```

Add new keys to `locales/en.json` and `locales/de.json`. Translation to other languages happens via [Weblate](translation-guide.md).

### Example illustrations and failed images

Device and pitch illustrations are HTML strings from `lib/equipmentAttributes.js`
(`illustrationHtml`), rendered with `{@html}`. They carry **no inline
`onerror`**: the narrowed CSP (`script-src 'self'`, #861) blocks inline
handlers. `lib/imageFallback.js`, installed once in `main.js`, listens for
`error` in the capture phase and hides a failed image's `.device-img-wrap` —
and an enclosing `[data-illustration]` section, so no empty heading is left.
New `{@html}` images should use the same wrapper rather than an inline handler.

### Modal dialogs

Every `role="dialog" aria-modal="true"` element carries `use:modal` from
`stores/modalOpen.js` (#758). While it is mounted, everything outside the
dialog — each sibling of the dialog and of its ancestors up to `<body>` — is
`inert`, focus moves into the dialog, and on close it returns to where it was.
`aria-modal` alone does none of that: before this, Tab walked from a dialog's
last control onto the focusable map behind it (arrow keys then panned a map
nobody could see), the search bar and the control buttons. Nested dialogs stack
— a lightbox over another dialog makes that dialog inert and hands it back.
`modalOpen` lets window-level handlers stand down while a dialog is up (Map's
Escape for the hub popup). `tests/modal-inert.spec.js` pins it. The hub's
instance drawer is a side panel, not an overlay, and traps Tab itself, so it
does not register.

### Codes that must be read as words

A short code shown as text — the hub drawer's country chip (`SK`, #741) — is
read letter by letter ("ess kay"). `aria-label` cannot fix that on a plain
`<span>`: ARIA forbids naming the generic role and screen readers ignore it
there. Hide the code with `aria-hidden="true"` and put the full name next to it
in a `visually-hidden` span (Bootstrap's class); a `title` can carry the same
name for mouse users. Get names from `Intl.DisplayNames` in the active locale
rather than locale keys, so Weblate translators have nothing to chase.

### Language attributes

Two languages coexist on the page, and mixing them up is a WCAG failure:

- **Interface text** is in the UI locale. `setupI18n()` writes it to
  `document.documentElement.lang`, so translated strings need no `lang` of
  their own — they inherit the right one. (`index.html` still ships a static
  `lang="de"`; it is overwritten during init, before anything renders.)
- **OSM-derived text** — playground names, and anything else read straight
  from a tag — is in the region's language, not the interface's. Every
  element rendering it carries `lang={regionLang}`.

The rule matters most where the two meet. `getPlaygroundTitle()` returns
either OSM name tags *or* the translated `nearby.defaultName` placeholder,
and the returned string cannot tell you which. Ask `hasOsmName(attr)`:

```svelte
$: titleLang = hasOsmName(attr) ? regionLang : $locale;
…
<h2 lang={titleLang}>{getPlaygroundTitle(attr, $_)}</h2>
```

Current name render sites: `HoverPreview`, `PlaygroundPanel` (both header
variants). If you add another, annotate it — an
unannotated name silently inherits the interface language.

## The search combobox

`SearchBar.svelte` implements the [ARIA 1.2 combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) over the Nominatim suggestion list. If you touch it, keep these invariants:

- **The input owns the list.** `role="combobox"` + `aria-autocomplete="list"` + `aria-controls` pointing at the results container's `id`, `aria-expanded` mirroring list visibility, `aria-busy` mirroring the in-flight request. Ids come from a module-scoped counter (`searchbar-<n>-…`) — the component is in Svelte legacy mode, so `$props.id()` is unavailable.
- **DOM focus never leaves the input.** Arrow keys move an `activeIndex` exposed via `aria-activedescendant`; options are not tab stops (`tabindex="-1"`). Roving tabindex would break continued typing. The tab order is input → clear button → out of the card.
- **Options stay real `<button>`s.** Touch screen readers (TalkBack, VoiceOver) navigate with a virtual cursor that ignores `aria-activedescendant` and activates elements in place, so options must be natively activatable. `role="option"` overrides the button role without conflict.
- **Dismissal is focus containment, never a timer.** `focusout` on `.search-card` tests `currentTarget.contains(e.relatedTarget)`. The old 200 ms hide timer raced both a mouse click in Safari and a touch scroll inside the list on iOS.
- **`mousedown`, not `pointerdown`, is prevented** on the results container. `mousedown` is synthesised after a tap completes, so suppressing it cannot break scrolling; `pointerdown` fires at touch start and would.
- **One highlight only.** `mousemove` writes `activeIndex` and only `.active` is styled — a separate `:hover` rule would let the pointer highlight a different row than the one `aria-activedescendant` announces. `activeIndex` resets on every reassignment of `results` (search, clear, error path), since the 450 ms debounce can swap the result set under a stale index.

Regression coverage: `tests/searchbar-a11y.spec.js` (stubs Nominatim via `page.route`). Safari mouse selection, iOS scroll-in-list, and TalkBack navigation are manual-only — Playwright's Chromium does not reproduce those quirks.

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

## External services: implementation notes

Which services the visitor's browser reaches, and why, is in [External Services](../reference/external-services.md) and [Privacy by design](../concepts/privacy.md). These are the implementation details behind it.

### Equipment illustrations are resolved at build time

The device and pitch tables name their illustrations as MediaWiki `File:` titles. Turning one into a URL used to mean a `Special:FilePath` request, which is a redirect chain, and that chain cannot be proxied without allowing `/w/index.php` — a full MediaWiki entry point — through the cache.

So the redirect is followed at **build time** instead. `tools/build-equipment-images.py` resolves each name against Commons and then the OSM wiki, and commits `app/src/lib/equipmentImages.generated.json` holding the real file URL plus author and licence. Rebuild it with `make equipment-images`.

Three things follow from that, and each fixed a real defect:

- **The bytes come from this instance.** The resolved URL is an ordinary image path on a MediaWiki file host, which `/ext/wikimedia/<host>/` already serves.
- **The OSM wiki is no longer an undisclosed host.** 14 of the 98 illustrations exist only there, and the frontend used to reach them through an `<img onerror>` fallback that appeared in neither this page nor the CSP. It is listed in [External Services](../reference/external-services.md) now, and it is proxied like the rest.
- **A name that resolves nowhere fails the build.** 14 of them did, all pitch illustrations, and in production each one cost two failing requests before an `onerror` handler hid the element. They were replaced with verified Commons files in #867 (hockey, which has no free pitch diagram, has no illustration), so every name now resolves and any new one that does not fails the build.

### Checking what a panel section contacts

`PlaygroundPanel.svelte` mounts each accordion section's component only while the section is open (`openSections`, default `['photos', 'equipment', 'pois']`), so a closed section's fetch code never runs. Reading a fetch call alone gives the wrong answer about when a service is contacted: check the section's default state too. Reviews start closed; photos start open.

### Reviews ask once per label

Mangrove matches a review on its coordinates *and* its `q` label, and clients file playgrounds under different labels (spieli used `osm_playground_<id>`; MapComplete and mangrove.reviews use `playground` or the place's name). The reviews section asks once per label and merges the answers by signature (#914); new reviews are written under the shared label. The submit path is a `PUT` whose signature covers the JWT's own claims, so the proxy is transparent to verification.

### Keep the privacy template in sync

`oci/app/datenschutz.template.html` carries a service table of its own. When a service is added or removed, update it together with [External Services](../reference/external-services.md). Describe what the code does rather than claiming spieli "does not track users": that depends on each deployment's configuration.

### Settled questions — recorded so they are not re-investigated

- **Commons URLs from OSM tags are host-validated** in `app/src/lib/commons.js` before rendering, so a crafted `image` tag cannot point the browser at an arbitrary host. The Content Security Policy is a second line behind that check, not a replacement for it. Both are tested: `tests/hostile-image-tag.spec.js` and the `CSP must follow the configuration` CI job.
- **Which Wikimedia host serves a file is not fixed.** The imageinfo API currently returns thumbnails on `thumb.wikimedia.org` and originals on `upload.wikimedia.org`. `proxiedImageUrl` therefore carries the original host in the proxy path rather than assuming one; a rewrite pinned to a single host silently sends every thumbnail straight to Wikimedia while appearing to work.

## Style system

The app uses Bootstrap 5 (component classes) and Tailwind CSS 4 (utility classes) side by side. The design system primitives in `src/components/ui/` (`Badge`, `Button`, `Card`, etc.) wrap Bootstrap with Tailwind utilities. Prefer these over raw Bootstrap classes in new components.

### The finder view (mapping detail off)

Mapping detail is opt-in (#924). With it off, `Map.svelte` swaps the tier styles for the ones in `src/lib/finderStyle.js` (cluster discs, pins at each playground's interior point, the selected playground's outline) and `hub/macroRingStyle.js`'s `finderMacroRingStyleFn` (neutral discs; health variants unchanged). The `FINDER` colours sit in `completenessPalette.js` with their contrast measurements. Style functions take the mode from their caller rather than reading the store, so they stay pure and unit-testable. Canvas markers draw in CSS pixels through `hidpiStyleOptions` (`lib/hidpiRenderer.js`), which also supplies their 1:1 hit-detection renderer, so the existing click/hover path selects pins — but a click inside the undrawn polygon off the pin does not.

Whether mapping detail is on lives in `stores/mappingDetail.js` (persisted in `localStorage`, overridable per page load with `?detail=1|0`). While it is off, the `showComplete` / `showPartial` / `showMissing` filters are ignored everywhere — rendering, cluster request parameters, badges, hub macro aggregates — via `effectiveFilterStore`; their stored values return when it is switched back on.

#### The hint under the badge

`PlaygroundPanel` takes the hint from `mappingDetailHintKey()` in `completeness.js`, which reads the same `mappingDetailInputs()` as `playgroundCompleteness()`, so hint and badge cannot disagree. The texts are `mappingDetail.nextStep.*`.

#### Mapping-detail locale keys

All UI strings live under the `mappingDetail.*` namespace in `locales/de.json` and `locales/en.json` (repo root).

| Key | DE | EN |
|---|---|---|
| `mappingDetail.legendTitle` | Erfasste Details | Mapping detail |
| `mappingDetail.detailed` | detailliert | detailed |
| `mappingDetail.basic` | grundlegend | basic |
| `mappingDetail.noDetails` | keine Details | no details yet |
| `mappingDetail.hasPhoto` | hat ein Foto | has a photo |

Access is a separate axis from mapping detail and has its own `access.*` namespace (#1002): `access.private` / `access.customers` for the panel badge and `access.privateShort` / `access.customersShort` for the hover chip. The rule behind them is `accessKind()` in `app/src/lib/access.js`.

The filter labels under `filter.mappingDetail.*` use the same wording (`detailliert` / `grundlegend` / `keine Details`); the filter keys themselves (`showComplete`, `showPartial`, `showMissing`) keep the identifier naming.

The label key `mappingDetail.legendTitle` (`"Erfasste Details"` / `"Mapping detail"`) can be used wherever the concept needs a heading.

### Accent colour

The UI accent is one emerald family, defined once as theme tokens in `src/styles/app.css` (#930):

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#047857` | buttons with text, links, accent text, active control icons, badges (Tailwind: `bg-primary`, `text-primary`) |
| `--color-primary-hover` | `#065f46` | hover / pressed |
| `--color-primary-soft` | `#ecfdf5` | background of an active control or checked row |

Reference them with `var(--color-primary)` and friends, never as literals. The lighter emerald-500 (`#10b981`) the app used before is only 2.54:1 behind white text — every accent pair here clears 4.5:1. Map markers are the exception: canvas renderers cannot read CSS variables, so their colours live in `completenessPalette.js`.

### The mapping-detail palette

`src/lib/completenessPalette.js` is the single source of truth for the three mapping-detail colours (`complete` / `partial` / `missing`). **Never hardcode these values anywhere else.**

Each bucket exposes `base`, `fill`, `stroke` and `hatch`. The module documents which surface uses which field; the short version is that anything opaque takes `base`, and only shapes the basemap shows through — or backgrounds carrying text — take `fill`. Getting this wrong is silent: nothing errors, two surfaces simply render the same bucket in different colours.

Consumers today: `vectorStyles.js` (polygons), `clusterStyle.js`, `hub/macroRingStyle.js`, `CompletenessLegend.svelte`, `PlaygroundPanel.svelte`, `MappingDetailControl.svelte`, `hub/InstancePanelDrawer.svelte`.

Svelte `<style>` blocks cannot import, so components that colour elements via CSS classes read the palette in `<script>` and expose it as custom properties (`--detail-complete` and friends) on the wrapping element. `InstancePanelDrawer` follows that pattern — copy it rather than reintroducing literals.

#### Why the arcs are cased

`base` is drawn opaque for cluster and macro ring arcs, and bright green cannot carry contrast on its own against this basemap: `#4ade80` measures 1.59:1 on the background, 1.35:1 over grass and 1.06:1 over water, against a 3:1 floor for a graphical object. No green above 3:1 exists lighter than L\* 31.

Moving the whole ramp down a step was tried first and cost more than it bought — the bright end disappeared, the ramp stopped being monotonic, and on the polygon tier `partial` and `missing` collapsed to ΔE 9.7, making the two lower buckets hard to separate.

Instead each arc is drawn over a dark casing one pixel proud on each side (`RING_CASING`), so the *edge* carries the contrast and the fill is free to be chosen for meaning. That is how road casings work in cartography. With the ramp restored, the same polygon pair is ΔE 20.2.

**Known cost:** the rings read heavier. `missing` is the dominant bucket — 625 of 926 playgrounds in Fulda — and slate-600 against a dark casing makes a mostly-unmapped cluster read as a near-black disc at low zoom. Kept for now. The levers are a lighter or thinner casing, or lightening `missing`, which the casing makes possible again. Note the tension there: monotonic lightness wants `missing` darkest, while "the least-mapped state should stay quiet" wants it lightest. This palette currently chooses the ordering.

Two rendering traps worth knowing:

- OpenLayers' `renderPolygonGeometry` handles fill, stroke and text only. An `image` style attached to a Polygon is **silently dropped** — no render, no warning. Give it a `geometry` function returning the polygon's interior point.
- `hub/macroRingStyle.js` colours `restricted` (violet-600) on a different axis from the mapping-detail buckets — access, not detail. `deriveMacroRing` sets `restricted: 0` whenever a backend reports completeness and routes the whole count into it only when completeness is unknown, so `restricted` and `missing` never share a ring. They do sit side by side as separate rings on the same macro view, which is why the two colours still have to stay apart.

## See also

- [Local Development](local-dev.md) — dev server setup
- [Testing Guide](testing.md) — how to write and run tests
- [Add a Device](add-device.md) — adding a new playground device type
- [Source Tree Analysis](../source-tree-analysis.md) — annotated directory map

## Basemap layers

The basemap is configuration-driven (`app/src/lib/config.js`), not hardcoded:

- `basemapStyleUrl` set → a `VectorTileLayer` styled with `ol-mapbox-style`, which is **dynamically imported** so raster deployments do not carry its ~310 kB.
- otherwise → an XYZ `TileLayer` built from `basemapUrl`.

Two things are easy to get wrong here, and both were caught in review:

- **Attribution belongs to the source, not the layer.** OpenLayers resolves it via `layer.getSource().getAttributions()`, so passing `attributions` as a layer option silently does nothing. On the vector path it must be applied after `applyStyle()` has created the source.
- **The vector fallback is gated on `basemapUrlIsExplicit`.** When a style fails to load, falling back to `basemapUrl` is only safe if the operator set it; the compiled-in default is a third party that a vector deployment may have chosen vector to avoid.

`macroOutlineLayer` (zIndex 1) draws a bundled Natural Earth world outline under the hub macro tier, fetched lazily on first use from `/basemap/world-110m.json` (absolute — a relative path breaks under region URLs). It exists because the basemap tileset covers only the federation's own countries.
