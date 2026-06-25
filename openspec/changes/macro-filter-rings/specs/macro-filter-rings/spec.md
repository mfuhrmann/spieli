## ADDED Requirements

### Requirement: Macro tier derives filtered totals when a filter is active
When the active tier is `macro` and at least one filter is active (`hasActiveFilters` is true), the hub orchestrator SHALL fan out `get_playground_clusters` once per selected, filter-capable backend — scoped to that backend's own bbox and carrying the active filter params — sum the returned buckets' `count`, `complete`, `partial`, and `missing` into a per-backend aggregate, and publish a `Map<backendUrl, {count, complete, partial, missing}>` on `macroFilteredStore`. The map SHALL be published progressively as each backend settles, with a fresh Map reference per update.

#### Scenario: Filtered aggregate summed from buckets
- **WHEN** the macro tier is active, a filter is active, and a backend's `get_playground_clusters` returns buckets summing to `count: 12, complete: 5, partial: 4, missing: 3`
- **THEN** `macroFilteredStore` contains an entry for that backend's url with `{count: 12, complete: 5, partial: 4, missing: 3}`

#### Scenario: Per-backend bbox scoping
- **WHEN** the macro tier fans out for filtered totals
- **THEN** each backend's cluster fetch uses that backend's own bbox as the extent (not the global macro viewport)

### Requirement: Macro tier stays zero-fetch when no filter is active
When the active tier is `macro` and no filter is active, the orchestrator SHALL set `macroFilteredStore` to `null` and SHALL NOT dispatch any cluster fetch.

#### Scenario: No filter, no fetch
- **WHEN** the macro tier is active and `hasActiveFilters` is false
- **THEN** `macroFilteredStore` is `null` and no `get_playground_clusters` request is dispatched

### Requirement: Filter-incapable backend is not overridden
When a backend returns 404 on the macro-tier cluster fetch, the orchestrator SHALL mark it legacy and SHALL NOT write a filtered entry for it, leaving its ring to render from cached `get_meta`.

#### Scenario: 404 backend keeps unfiltered ring
- **WHEN** a backend returns a `failed: 404` error on the macro cluster fetch
- **THEN** no `macroFilteredStore` entry is written for that backend and `markBackendLegacy` is invoked for it

### Requirement: Macro rings reflect the filtered aggregate
`MacroView.svelte` SHALL subscribe to both the backends store and `macroFilteredStore` and rebuild its features when either changes. When `macroFilteredStore` is non-null and contains an entry for a backend, `buildFeature` SHALL override that backend's `count`, `complete`, `partial`, and `missing` with the filtered entry. When the store is null, or non-null without an entry for the backend, the backend's cached `get_meta` values SHALL be used unchanged.

#### Scenario: Non-zero filtered entry reshapes the ring
- **WHEN** `macroFilteredStore` has an entry `{count: 12, complete: 5, partial: 4, missing: 3}` for a backend
- **THEN** that backend's macro feature carries `count: 12` and the matching completeness segment values, and renders as a healthy ring sized and segmented from those filtered values

#### Scenario: No filtered entry falls back to cached meta
- **WHEN** `macroFilteredStore` is non-null but has no entry for a backend (not yet settled or legacy peer)
- **THEN** that backend's feature uses its cached `get_meta` `count`/`complete`/`partial`/`missing`

### Requirement: Zero-match backend renders a distinct grey "no match" ring
When `macroFilteredStore` has an entry for a backend whose filtered `count` is `0`, `buildFeature` SHALL set `_filteredEmpty: true` on the feature. `macroRingStyle.js` SHALL render such a feature as a grey ring with a white inner disc and the label "no match". `macroRingStyleFn` SHALL select this style after the offline and importing checks and before the degraded check, so backend-health states take precedence and the "no match" ring is distinct from the amber degraded ("no data") ring.

#### Scenario: Zero filtered matches shows grey "no match" ring
- **WHEN** a healthy, non-importing backend has a filtered entry with `count: 0`
- **THEN** the feature has `_filteredEmpty: true` and `macroRingStyleFn` returns the grey "no match" style

#### Scenario: Backend health takes precedence over no-match
- **WHEN** a backend is offline (or importing) and also has a filtered `count` of `0`
- **THEN** `macroRingStyleFn` returns the offline (or importing) style, not the "no match" style

#### Scenario: No-match is distinct from degraded
- **WHEN** a healthy backend has filtered `count: 0` (`_filteredEmpty`) and another healthy backend has unfiltered `count: 0` (`_degraded`)
- **THEN** the first renders the grey "no match" ring and the second renders the amber "no data" degraded ring

### Requirement: Macro filter path documented
`docs/contributing/frontend-guide.md` SHALL document that the macro tier fans out the cluster RPC to derive filtered totals only when a filter is active (otherwise it stays zero-fetch), and SHALL list the "no match" ring among the macro ring variants.

#### Scenario: Contributor can find the macro filter behavior
- **WHEN** a contributor consults the frontend guide's hub/macro section
- **THEN** the filter-only macro fan-out and the "no match" ring state are described

### Requirement: Every boolean playground filter renders a removable chip
`FilterChips.svelte` SHALL render a removable chip for every active boolean playground filter in `defaultFilters`, excluding the `standalonePitches` layer toggle and the `showComplete`/`showPartial`/`showMissing` completeness states. In particular `fence`, `hasDogs`, and `shade` SHALL each render a chip whose remove button clears that filter.

#### Scenario: shade filter renders a removable chip
- **WHEN** the `shade` filter is active
- **THEN** a chip labelled from `filter.labels.shade` is shown, and clicking its remove button sets `shade` to `false`

#### Scenario: fence and hasDogs filters render removable chips
- **WHEN** the `fence` or `hasDogs` filter is active
- **THEN** a corresponding removable chip is shown for each
