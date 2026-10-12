## 1. API

- [ ] 1.1 `get_standalone_equipment`: add `access`, `operator` to the properties
- [ ] 1.2 New `api.get_pitch(osm_id)` (polygon or node, standalone only, same property shape, null when absent); grant to the anon role
- [ ] 1.3 `make db-apply`, verify both RPCs with curl; fresh-volume import check per CLAUDE.md
- [ ] 1.4 `docs/reference/api.md`

## 2. Selection and deeplinks

- [ ] 2.1 `selection.js`: `kind` in the value and in `select()`; `selectedKind`; `selectedOsmId` only for playgrounds; hash written per kind
- [ ] 2.2 `deeplink.js`: `#P` / `#slug/P` parsing and writing; unit tests
- [ ] 2.3 Audit every `selection` / `hasSelection` / `selectedOsmId` reader and make playground-only ones check the kind (PlaygroundPanel, Map click-fit and deselect, NearbyPlaygrounds, AppShell hash restore)
- [ ] 2.4 `api.js`: `fetchPitchByOsmId` (404 → one warning, null)
- [ ] 2.5 AppShell/StandaloneApp: restore `#P` — fetch, switch the pitch layer on, select, fit; ignore `P` in hub mode

## 3. Clicks and map

- [ ] 3.1 `StandaloneApp`: mark the pitch layer `selectable: true`
- [ ] 3.2 `Map.svelte` click: after the playground hit, hit-test selectable overlay layers; select `leisure=pitch` hits with `kind: 'pitch'` and fit
- [ ] 3.3 Pitch-layer style outlines the selected pitch (by `osm_id` + kind), pin on top

## 4. Pitch panel

- [ ] 4.1 `lib/pitchInfo.js`: title, sports, surface, lighting (`yes`/`no`/times), access/fee/reservation, hoops, wheelchair — "absent → nothing"; unit tests
- [ ] 4.2 Move navigation-URL and share-URL builders from PlaygroundPanel into `lib/playgroundHelpers.js`; unit tests; PlaygroundPanel uses them
- [ ] 4.3 `components/PitchPanel.svelte` (header, sport chips with pin glyphs, facts, opening hours, photos, actions, edit link), `embedded` mode for phones
- [ ] 4.4 AppShell: panel slot renders PitchPanel or PlaygroundPanel by kind (desktop and mobile)
- [ ] 4.5 Strings in `locales/en.json` + `locales/de.json` only (panel labels, sport titles, pitch surfaces, lighting, access)

## 5. Lighting in the playground panel

- [ ] 5.1 Lighting fact in PlaygroundPanel's at-a-glance grid via `pitchInfo.litLabel`, only when tagged

## 6. Tests

- [ ] 6.1 E2E: click a pitch → panel, hash `#P…`; Escape / close clears; empty-map click clears
- [ ] 6.2 E2E: phone tap → full-screen panel → Back to map
- [ ] 6.3 E2E: `/#P<id>` restore (stubbed `get_pitch`), 404 path, null path
- [ ] 6.4 E2E: sparse pitch shows no unknown rows; well-tagged pitch shows surface/lighting/access
- [ ] 6.5 E2E: playground with `lit=yes` shows lighting; without, nothing
- [ ] 6.6 Existing suites still pass (selection, hash-restore, hub deeplinks)

## 7. Docs and review

- [ ] 7.1 User guide (pitch panel, lighting), frontend guide (selection kind, pitch panel), CLAUDE.md (stores/components/API tables)
- [ ] 7.2 Live check on port 8080 (desktop + phone), `make docs-build`
