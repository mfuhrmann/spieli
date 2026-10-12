## Context

Mapping detail (#733) is encoded everywhere on the map today:

- **Cluster tier** — `clusterStyle.js` draws a canvas ring split into complete/partial/missing arcs (colours from `completenessPalette.js`); a `count <= 1` cluster is a 5 px dot in its completeness colour.
- **Polygon tier** — `playgroundStyleFn` (`vectorStyles.js`) fills each polygon by completeness and adds a camera glyph at its interior point when `hasPhotoSignal(props)`.
- **Hub macro tier** — `hub/macroRingStyle.js` reuses the ring renderer with `get_meta` counts.
- **Legend** — `CompletenessLegend.svelte`, mounted by `AppShell` on desktop.
- **Filters** — `showComplete` / `showPartial` / `showMissing` in `filterStore`, rendered in `FilterPanel`'s "Mapping detail" section, read client-side by `matchesFilters` (Map's polygon style) and server-side via `filter_complete|partial|missing` params in `fetchPlaygroundClusters`. `StandaloneApp` and `HubApp` subscribe to `filterStore` to refetch; `hubOrchestrator` uses `hasActiveFilters` to decide whether the macro tier needs filtered aggregates.

Above `clusterMaxZoom` playgrounds are polygons only; small ones are hard to see and there is no marker.

## Goals / Non-Goals

**Goals:**
- A visitor who never touches the new toggle sees a "finder" map: uniform emerald markers at every tier, no data-quality colours, no legend.
- Contributors get the current map back with one toggle, remembered across visits.
- Mapping-detail filters can never hide playgrounds while their controls are out of sight.
- With the toggle on, behaviour is byte-for-byte today's.

**Non-Goals:**
- Changing the completeness rule, wire values or any RPC.
- Server-side clustering changes. Pins are drawn from the polygon features the client already has.
- Replacing the GPS dot, equipment, tree or pitch layers.

## Decisions

### 1. One store, one derived "effective filters" store

New `stores/mappingDetail.js`: a writable boolean, default `false`, initialised from and written to `localStorage` (`spieli.mappingDetail`) inside try/catch — storage can throw or be empty (private mode), and the default must still render.

`stores/filters.js` gains `effectiveFilterStore = derived([filterStore, mappingDetail], …)` that forces `showComplete/showPartial/showMissing` to `true` when mapping detail is off. **Every reader that affects what is fetched or drawn switches to it**: Map's polygon style, `StandaloneApp`'s and `HubApp`'s refetch subscriptions (which feed `fetchPlaygroundClusters` and the hub fan-out), and the badge/chip counts.

*Why not clear the three keys when toggling off?* Turning detail back on should restore what the contributor had. *Why not check the flag in each consumer?* Five call sites, two of them in the hub fan-out; one derived store makes forgetting impossible and keeps `matchesFilters` / `hasActiveFilters` pure and unchanged.

Writers (`FilterPanel`, the new popover, chip removal) keep writing `filterStore`.

### 2. Rendering mode passed to style functions, not read from a store inside them

Style functions stay pure: `clusterRingStyleFn`, `playgroundStyleFn` and the macro ring style take a `{ mappingDetail }` mode (factory or argument). `Map.svelte` / `MacroView.svelte` subscribe to `mappingDetail` and call `layer.setStyle(...)` on change, exactly like the existing filter re-style. Bitmap caches are keyed by mode, so toggling does not repaint stale bitmaps.

*Alternative:* read the store with `get()` inside the renderer — rejected, it hides a dependency and breaks the existing unit tests' pure-function shape.

### 3. Neutral palette in `completenessPalette.js`

Add `FINDER = { fill: '#059669', border: '#ffffff', casing: '#065f46', text: '#ffffff' }` (emerald; first proposed as orange `#ea580c`, switched after a side-by-side live review) next to the completeness palette, so all neutral colours live in one file with their contrast rationale (orange vs. basemap `#f8f4f0`, desaturated greens, water, and the GPS blue `#007aff`). Exact casing/text values are verified against the basemap during implementation and recorded there, as was done for the completeness palette.

### 4. Cluster tier when off: filled circle, same sizes

Same `radiusForCount` scale, same count font. Filled emerald disc with a white 2 px border and a dark-emerald 1 px casing; count in white. A `count = 1` cluster renders as a **pin** (decision 5), not a dot, so zooming from the cluster tier into the polygon tier does not change the marker's shape.

### 5. Pin marker

Canvas-rendered and cached like the ring bitmaps: the disc (radius ~11 px) with a small downward triangle merged into its bottom, white border around the combined outline. The anchor is the triangle's tip, so the pin *points at* the playground. A white inner dot (or the camera glyph when `hasPhotoSignal`) sits in the disc — the photo signal stays visible but moves from the polygon interior onto the pin.

At the polygon tier the style is a `Style` with `geometry: interiorPoint` (the same geometry function the photo glyph already uses; `getInteriorPoints()` for MultiPolygons → one pin per part is acceptable, it matches today's glyph). OL hit detection works on the rendered pin, so the existing `forEachFeatureAtPixel(… layerFilter: playgroundLayer)` click/hover path selects playgrounds unchanged. Polygon fill is **not** drawn, so clicks inside a polygon but off the pin no longer select — accepted: the pin is the target in finder mode.

### 6. Selected playground's polygon

When a playground is selected and mapping detail is off, its polygon is drawn as an emerald outline with a light emerald fill beneath its pin (style function compares against the `selection` store's feature, already available to Map). On mobile the full-screen panel covers the map, so this is effectively desktop-only without a separate branch.

### 7. Mapping-detail control

New `MappingDetailControl.svelte`, a `control-btn` placed in `controls-row` between Info and Filter. Icon: lucide `BarChart3` (already the section icon for mapping detail in FilterPanel). It opens a popover (same pattern/positioning as FilterPanel) containing:
1. a switch "Show mapping detail" bound to `mappingDetail`;
2. the three detailed/basic/no-details filter rows (moved from FilterPanel), disabled while the switch is off;
3. the `CompletenessLegend` content.

The same button sits in the same place on phones and desktop — `controls-row` is already shared by both layouts (on mobile it stacks Info above Filter; the new button joins that column). The button shows a pressed state (`aria-pressed`) while detail is on. The "Mapping detail" section is removed from `FilterPanel`; `AppShell` mounts `CompletenessLegend` on the map only when detail is on (today's behaviour), never when off.

`FilterChips` hides completeness chips while off (they come from `effectiveFilterStore`, so this falls out of decision 1).

### 8. Hub macro tier

`MacroView` passes the mode to the macro ring style: neutral filled discs with the backend's total count. Offline backends keep their "outlined, muted, offline label" treatment in both modes — that is health, not mapping detail. `macroFiltered` / `macroCoverage` see effective filters, so turning detail off cannot leave a stale completeness-filtered aggregate on the rings.

### 9. Link parameter `?detail=1`

Contributors can share a link that opens with mapping detail on, e.g. `https://spieli.eu/fulda?detail=1#W123`.

- **Query, not hash.** The hash is owned by deeplinks (`#W123`, `#slug/W123`) and the pathname by region URLs (`/fulda`); a query parameter composes with both without touching `deeplink.js` or `regionUrl.js`. `selection.js` already preserves `location.search` when it clears the hash.
- **Read once at startup** in `stores/mappingDetail.js`: `detail=1` → on, `detail=0` → off, anything else ignored. The parameter **overrides** the stored preference for that page load but does **not** write it — opening a contributor's link must not permanently change a parent's map.
- **Toggling by hand** writes the preference as usual and rewrites the parameter with `history.replaceState` (set to the new value), so a reload shows what the visitor last chose and the address bar never contradicts the map.
- **Share button** (`PlaygroundPanel.sharePlayground`) appends `?detail=1` while detail is on, so a contributor sharing a playground shares the view they are looking at. With detail off the shared link stays as today (no parameter).
- Hub and standalone both get it, since the store is shared.

*Alternative:* a `#…;detail` hash suffix — rejected, every hash parser (standalone, hub slug form) would need to learn it.

## Risks / Trade-offs

- [Contributors lose the colours they are used to after upgrading] → one tap restores them and it is remembered; mention in release notes and the user guide.
- [Pins at high density (many small playgrounds in a city at z14) overlap] → pins are small (≈22 px); OL `declutter` is not used since hiding playgrounds is worse than overlap. Revisit if live review shows clutter.
- [Polygon area no longer clickable in finder mode] → the pin is the target; hover preview on desktop still triggers on the pin. Covered by an E2E test that clicks a pin.
- [Server filter params silently stale after toggling] → refetch subscriptions read `effectiveFilterStore`, which emits on toggle; E2E asserts the cluster request drops `filter_missing` when switching off.
- [localStorage unavailable] → default off, wrapped in try/catch; the control still works for the session.
- [`?detail=` reaches the server logs / caches] → it is a static flag, carries nothing about the visitor; nginx serves `index.html` for any query, so no config change.

## Migration Plan

Frontend-only, no labels required. Rollback = revert the PR; the stored `spieli.mappingDetail` key is simply ignored by older builds.

## Open Questions

None. Resolved 2026-10-12: the button ships on phones and desktop alike; the `?detail=1` link parameter is in scope (decision 9).
