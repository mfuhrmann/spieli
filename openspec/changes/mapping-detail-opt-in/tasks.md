## 1. State

- [ ] 1.1 Add `app/src/stores/mappingDetail.js`: writable boolean, default `false`, read/written to `localStorage` key `spieli.mappingDetail` with every access in try/catch
- [ ] 1.2 Add `effectiveFilterStore` to `app/src/stores/filters.js` (derived from `filterStore` + `mappingDetail`; forces `showComplete/showPartial/showMissing` to `true` while off)
- [ ] 1.3 Unit tests: default off, persistence round-trip, throwing storage, effective filters ignore/restore the three completeness keys

## 2. Wire effective filters

- [ ] 2.1 `Map.svelte` polygon re-style reads `effectiveFilterStore`
- [ ] 2.2 `StandaloneApp.svelte` and `HubApp.svelte` refetch subscriptions read `effectiveFilterStore` (so `fetchPlaygroundClusters` and the hub fan-out / `macroFiltered` / `macroCoverage` never see hidden completeness states while off)
- [ ] 2.3 `FilterPanel` badge count and `FilterChips` read `effectiveFilterStore`; chip removal and reset still write `filterStore`

## 3. Neutral palette and renderers

- [ ] 3.1 Add the `FINDER` palette to `completenessPalette.js`; check contrast of fill/casing/text against the basemap background, desaturated landcover, water and the GPS dot, and record the measurements in the comment as done for the completeness palette
- [ ] 3.2 `clusterStyle.js`: neutral filled-disc renderer (same `radiusForCount`, same count font), bitmap cache keyed by mode; `clusterRingStyleFn` takes the mode
- [ ] 3.3 Pin renderer (disc + pointer, tip-anchored, cached per pixel ratio and photo flag) with white inner dot or camera glyph; used for `count = 1` clusters in finder mode
- [ ] 3.4 `vectorStyles.js`: finder variant of `playgroundStyleFn` — pin at interior point(s), no polygon fill/stroke; selected-playground outline style in the neutral palette
- [ ] 3.5 `hub/macroRingStyle.js`: neutral variant for healthy backends; health variants unchanged
- [ ] 3.6 Unit tests for the renderers' mode switch (cache keys distinct per mode; finder mode never draws segments; `count = 1` → pin)

## 4. Map integration

- [ ] 4.1 `Map.svelte`: subscribe to `mappingDetail`, re-style cluster and polygon layers on change; pass selection so the selected polygon is outlined in finder mode
- [ ] 4.2 `MacroView.svelte`: re-style macro layer on `mappingDetail` change
- [ ] 4.3 Verify pin click and desktop hover select/preview the playground via the existing `forEachFeatureAtPixel` path

## 5. Mapping-detail control

- [ ] 5.1 New `MappingDetailControl.svelte` (`control-btn`, `BarChart3` icon, `aria-pressed`) with popover: switch, the three detailed/basic/no-details rows (disabled while off), legend content
- [ ] 5.2 Mount it in `AppShell` `controls-row` between Info and Filter; mount the on-map `CompletenessLegend` only while mapping detail is on
- [ ] 5.3 Remove the "Mapping detail" section from `FilterPanel`
- [ ] 5.4 New strings in `locales/en.json` + `locales/de.json` only (control label, switch label, hint)
- [ ] 5.5 Keyboard: popover opens/closes with Enter/Space, Escape closes and returns focus to the button

## 6. End-to-end tests

- [ ] 6.1 First visit: control present, `aria-pressed="false"`, no legend, Filter panel has no mapping-detail options
- [ ] 6.2 Toggle on → reload → still on
- [ ] 6.3 Hide "no details yet" with detail on, switch off → next `get_playground_clusters` request has no `filter_missing`; switch on → it is back
- [ ] 6.4 Polygon tier in finder mode: clicking a pin opens the playground panel
- [ ] 6.5 Hub smoke: macro tier renders with detail off and on without errors
- [ ] 6.6 Existing suites (`filter-panel`, `tiered`, `cluster-position`, `hub-*`) updated where they assumed mapping-detail rendering by default

## 7. Live review and docs

- [ ] 7.1 Live check on `make docker-build` (port 8080), desktop and phone: colours against the basemap, pin size and density at z14–16 in a city, toggle round-trip; tune sizes/colours and update the palette comment
- [ ] 7.2 `docs/user-guide.md`: finder map, how to switch mapping detail on
- [ ] 7.3 `docs/reference/completeness.md`: mapping detail is opt-in; filters ignored while off
- [ ] 7.4 `docs/contributing/frontend-guide.md` + CLAUDE.md: new store, new component, `effectiveFilterStore` rule ("readers that affect fetching/drawing use the effective store")
- [ ] 7.5 `make docs-build` passes
