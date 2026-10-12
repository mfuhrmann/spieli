## Context

- **Pitch layer** — `StandaloneApp.svelte` owns a `VectorLayer` (`kind: 'overlay'`, zIndex 9) fed by `get_standalone_equipment(bbox)` on `moveend` at zoom ≥ 12, visible only when `filterStore.standalonePitches` is on. Hub mode has no pitch layer.
- **Properties** — the RPC returns `osm_id`, `osm_type`, `name`, `amenity`, `leisure`, `sport`, `surface` **plus every hstore tag** (`|| hstore_to_jsonb(tags)`), so `lit`, `panoramax*`, `hoops`, `reservation`, `wheelchair`, `fee`, `opening_hours`, `wikimedia_commons`, `image` already arrive. `access` and `operator` are osm2pgsql *columns* and are missing.
- **Clicks** — `Map.svelte`'s `click` handler tests the playground, cluster and macro layers, then treats the click as empty map (clears the selection). Only `pointermove` hit-tests `kind: 'overlay'` layers (hover tooltip).
- **Selection** — `stores/selection.js` holds `{ feature, backendUrl }`, writes `#W<osm_id>` (or `#slug/W<osm_id>`); everything downstream assumes a playground: `AppShell` mounts `PlaygroundPanel` whenever `$hasSelection`, which then fetches equipment, trees, POIs, reviews for it.
- **Lighting** — playground properties already carry `lit` (53 of 733 in Fulda; one `yes`).

## Goals / Non-Goals

**Goals:** pitches clickable on desktop and phones; a panel with the information that decides a visit (surface, lighting, access, photos, directions); shareable pitch links; lighting in the playground panel.

**Non-Goals:** pitches in hub mode (no pitch layer there yet); pitches *inside* playgrounds (they belong to the playground's equipment list); reviews for pitches; editing; a pitch filter for "lit".

## Decisions

### 1. Selection gets a `kind`, not a second store

`selection.select(feature, backendUrl, kind = 'playground')`; the store value becomes `{ feature, backendUrl, kind }` and `clear()` resets it. `hasSelection` stays "anything selected" (it drives the shared panel slot, mobile layout, hover suppression — all correct for pitches too). New derived `selectedKind`.

*Why not a separate `pitchSelection` store?* Two stores could both be set; every consumer (panel slot, mobile layout, Escape, deselect-on-zoom-out, hash) would need to coordinate them. One selection with a kind keeps "only one thing is open" true by construction.

Playground-only consumers check the kind: `PlaygroundPanel` renders/fetches only for `kind === 'playground'`; `Map.svelte`'s click-fit and the finder selected-outline (#924) match playgrounds only; `NearbyPlaygrounds` dismissal is unaffected.

### 2. Clicks: playground first, then pitch

In `Map.svelte`'s click handler, after the playground hit-test and before clusters, hit-test layers tagged `kind: 'overlay'` **and** carrying `selectable: true` — set by `StandaloneApp` on the pitch layer only (the equipment overlay inside a selected playground must not hijack clicks). A hit whose `leisure === 'pitch'` selects it with `kind: 'pitch'` and fits the view to it (same `fitViewToSelection`). Benches etc. on that layer stay non-clickable.

Playground first: a pitch next to a playground pin should not steal a click aimed at the playground; the playground hit uses `hitTolerance: 10`, the pitch hit uses the default, so the nearer, larger target wins naturally.

### 3. Deeplinks `#P<osm_id>`

`deeplink.js` learns a kind letter: `#W…` playground (unchanged), `#P…` pitch; `#slug/P…` parses but is ignored in hub mode. `parseHash` returns `{ slug, osmId, kind }`; `writeHash` takes `kind`.

*Why a new letter instead of "try playground, fall back to pitch"?* The fallback costs a second request on every miss and makes the meaning of a link depend on data; `P` is explicit, short and cannot collide with a slug (slugs are followed by `/`).

Restore (standalone): `fetchPitchByOsmId` → new `api.get_pitch(osm_id)` (same feature shape as `get_standalone_equipment`, one row, standalone pitches only — a pitch inside a playground returns nothing). The feature is selected directly (it need not be in the layer's source), `standalonePitches` is switched on so its pin and neighbours show, and the view fits it.

### 4. `PitchPanel.svelte`, sharing building blocks with the playground panel

Same header pattern (title, "Take me there", share/close), same body sections where they apply. Reused as-is: `PanoramaxViewer`, `CommonsGallery`, `MapCompleteLink`, the navigation link and share logic. To avoid copying them, the navigation-URL and share-URL builders move from `PlaygroundPanel` into `lib/playgroundHelpers.js` (pure, unit-tested) and both panels call them.

Display rules live in `lib/pitchInfo.js` (pure, unit-tested), not in the component:

| Field | Source | Shown as |
|---|---|---|
| Title | `name`, else sport label ("Football pitch") | heading, `lang={regionLang}` when it is the OSM name |
| Sports | `sport` split on `;` | chips with the pin glyph from `sportGlyphs.js` |
| Surface | `surface` | label from `surfaceValues.*` (new keys added for pitch surfaces: `artificial_turf`, `tartan`, `clay`, …); raw value otherwise |
| Lighting | `lit` | `yes` → "Lit", `no` → "Not lit", times (`sunset-23:00`) → "Lit sunset–23:00"; **absent → nothing** |
| Access | `access`, `fee`, `reservation` | "Public" / "Members only" / "Customers"; fee; "Booking required" |
| Opening hours | `opening_hours` | existing opening-hours rendering (regional holidays) |
| Hoops | `hoops` | "2 hoops" (basketball only) |
| Wheelchair | `wheelchair` | yes / limited / no — absent → nothing |
| Operator | `operator` | text |

"Absent → nothing" is a rule, not an omission: most pitches are sparsely tagged, and a row of "unknown"s would read as "bad pitch".

### 5. Lighting in the playground panel

A "Lighting" fact in the at-a-glance grid, rendered by the same `pitchInfo.litLabel` function, shown only when `lit` is tagged.

### 6. Selected pitch on the map

`StandaloneApp`'s pitch-layer style outlines the selected pitch (matched by `osm_id` and `kind === 'pitch'`) in the selection colour; the pin stays on top. A deeplinked pitch not (yet) in the layer's source is outlined once the layer loads it.

### 7. API additions (`importer/api.sql`)

- `get_standalone_equipment`: add `'access', access, 'operator', operator` to the properties object (the columns exist on both `planet_osm_polygon` and `planet_osm_point`).
- `api.get_pitch(osm_id bigint) RETURNS json` — a single GeoJSON Feature or `null`, polygon or node, applying the same "not inside a playground" rule. Granted to the anon role like the other RPCs.

## Risks / Trade-offs

- [Playground-shaped assumptions elsewhere read `selection.feature`] → audit every `selection`/`hasSelection`/`selectedOsmId` reader (listed in tasks); unit test that `selectedOsmId` is null for pitches.
- [Older backend without `get_pitch` (404)] → the `#P` link opens the map without a panel and logs once; no crash.
- [Pitch and playground with the same numeric osm_id (node vs way)] → kind travels with the selection and the hash, so they never collide.
- [Sparse data makes the panel look empty] → header, sport chips, surface (39 %) and directions are almost always present; the panel ends with the same "add details in MapComplete" invitation as playgrounds.

## Migration Plan

Deploy with `requires-schema-update` (`API_ONLY=1`). Frontend against an old API: pitch clicks work (properties already there, minus access/operator); only `#P` restore needs `get_pitch` and degrades as above.

## Open Questions

None blocking. Later: pitches in hub mode once the hub has a pitch layer.
