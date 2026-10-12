## 1. State

- [x] 1.1 Add `app/src/stores/mappingDetail.js`: writable boolean, default `false`, read/written to `localStorage` key `spieli.mappingDetail` with every access in try/catch
- [x] 1.2 Add `effectiveFilterStore` to `app/src/stores/filters.js` (derived from `filterStore` + `mappingDetail`; forces `showComplete/showPartial/showMissing` to `true` while off)
- [x] 1.3 `?detail=1|0` read once at startup in `mappingDetail.js` (overrides storage without writing it); manual toggles write storage and `history.replaceState` the parameter
- [x] 1.4 Unit tests: default off, persistence round-trip, throwing storage, parameter override without write, invalid parameter ignored, effective filters ignore/restore the three completeness keys

## 2. Wire effective filters

- [x] 2.1 `Map.svelte` polygon re-style reads `effectiveFilterStore`
- [x] 2.2 `StandaloneApp.svelte` and `HubApp.svelte` refetch subscriptions read `effectiveFilterStore` (so `fetchPlaygroundClusters` and the hub fan-out / `macroFiltered` / `macroCoverage` never see hidden completeness states while off)
- [x] 2.3 `FilterPanel` badge count and `FilterChips` read `effectiveFilterStore`; chip removal and reset still write `filterStore`

## 3. Neutral palette and renderers

- [x] 3.1 Add the `FINDER` palette to `completenessPalette.js`; check contrast of fill/casing/text against the basemap background, desaturated landcover, water and the GPS dot, and record the measurements in the comment as done for the completeness palette
- [x] 3.2 `clusterStyle.js`: neutral filled-disc renderer (same `radiusForCount`, same count font), bitmap cache keyed by mode; `clusterRingStyleFn` takes the mode
- [x] 3.3 Pin renderer (disc + pointer, tip-anchored, cached per pixel ratio and photo flag) with white inner dot or camera glyph; used for `count = 1` clusters in finder mode
- [x] 3.4 `vectorStyles.js`: finder variant of `playgroundStyleFn` — pin at interior point(s), no polygon fill/stroke; selected-playground outline style in the neutral palette
- [x] 3.5 `hub/macroRingStyle.js`: neutral variant for healthy backends; health variants unchanged
- [x] 3.6 Unit tests for the renderers' mode switch (cache keys distinct per mode; finder mode never draws segments; `count = 1` → pin)

## 4. Map integration

- [x] 4.1 `Map.svelte`: subscribe to `mappingDetail`, re-style cluster and polygon layers on change; pass selection so the selected polygon is outlined in finder mode
- [x] 4.2 `MacroView.svelte`: re-style macro layer on `mappingDetail` change
- [x] 4.3 Verify pin click and desktop hover select/preview the playground via the existing `forEachFeatureAtPixel` path

## 5. Mapping-detail control

- [x] 5.1 New `MappingDetailControl.svelte` (`control-btn`, `BarChart3` icon, `aria-pressed`) with popover: switch, the three detailed/basic/no-details rows (disabled while off), legend content
- [x] 5.2 Mount it in `AppShell` `controls-row` between Info and Filter; mount the on-map `CompletenessLegend` only while mapping detail is on
- [x] 5.3 Remove the "Mapping detail" section from `FilterPanel`
- [x] 5.4 New strings in `locales/en.json` + `locales/de.json` only (control label, switch label, hint)
- [x] 5.5 `PlaygroundPanel.sharePlayground` appends `?detail=1` while mapping detail is on
- [x] 5.6 Keyboard: popover opens/closes with Enter/Space, Escape closes and returns focus to the button

- [x] 5.7 Hide the panel's mapping-detail badge and use the finder colour for the nearby-list dots while mapping detail is off (found in live review)

## 6. End-to-end tests

- [x] 6.1 First visit: control present, `aria-pressed="false"`, no legend, Filter panel has no mapping-detail options
- [x] 6.2 Toggle on → reload → still on
- [x] 6.3 Hide "no details yet" with detail on, switch off → next `get_playground_clusters` request has no `filter_missing`; switch on → it is back
- [x] 6.4 Polygon tier in finder mode: clicking a pin opens the playground panel
- [x] 6.5 Phone viewport: control present and usable
- [x] 6.6 `/?detail=1#W<id>` opens with detail on and the playground selected; reload without the parameter → off; toggling rewrites the parameter; share link includes `detail=1` only while on
- [x] 6.7 Hub smoke: macro tier renders with detail off and on without errors
- [x] 6.8 Existing suites (`filter-panel`, `tiered`, `cluster-position`, `hub-*`) updated where they assumed mapping-detail rendering by default

## 7. Live review and docs

- [x] 7.1 Live check on `make docker-build` (port 8080), desktop and phone: colours against the basemap, pin size and density at z14–16 in a city, toggle round-trip; tune sizes/colours and update the palette comment
- [x] 7.2 `docs/user-guide.md`: finder map, how to switch mapping detail on, the `?detail=1` link for contributors
- [x] 7.3 `docs/reference/completeness.md`: mapping detail is opt-in; filters ignored while off
- [x] 7.4 `docs/contributing/frontend-guide.md` + CLAUDE.md: new store, new component, `effectiveFilterStore` rule ("readers that affect fetching/drawing use the effective store")
- [x] 7.5 `make docs-build` passes
