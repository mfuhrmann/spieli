## Why

Standalone pitches (the optional "pitches outside playgrounds" layer) cannot be clicked or tapped: the click falls through to "empty map" and clears the selection (#934). On desktop a hover tooltip shows a little; on phones a pitch offers nothing at all. Yet pitches carry exactly what someone deciding where to go wants to know — the surface (often actively maintained), whether it is **lit**, whether you can just walk in, photos — and lighting is something the playground panel does not show either.

## What Changes

- Clicking or tapping a standalone pitch selects it and opens a **pitch panel** in the same slot as the playground panel (side panel on desktop, full-screen detail with "Back to map" on phones).
- The pitch panel shows, where tagged: sport(s), name, surface, lighting (`lit`, including times), access / fee / reservation, opening hours, basketball hoops, wheelchair, operator; Panoramax and Commons photos through the existing viewers; "Take me there", share, and "Edit in MapComplete" / OSM links.
- Pitches get shareable links: `#P<osm_id>` (standalone). Opening one hydrates the pitch from a new `get_pitch(osm_id)` RPC, switches the pitch layer on and frames it.
- The selected pitch is outlined on the map.
- The **playground panel shows lighting** too when `lit` is tagged. Unknown stays silent — it is rare (53 of 733 Fulda playgrounds) and must not read as "not lit".
- `get_standalone_equipment` additionally returns `access` and `operator` (osm2pgsql columns, so not in the merged hstore tags the RPC already ships).

## Capabilities

### New Capabilities
- `pitch-details`: selecting a standalone pitch, the pitch panel and its content, pitch deeplinks, and lighting in the playground panel.

### Modified Capabilities
<!-- none: playground selection, tiers and hub deeplinks keep their requirements -->

## Impact

- **API** (`importer/api.sql`): `get_standalone_equipment` gains `access`, `operator`; new `api.get_pitch(osm_id)`. → PR label **requires-schema-update**. `docs/reference/api.md`.
- **Frontend**: `stores/selection.js` (selection kind), `lib/deeplink.js` (`#P`), `components/Map.svelte` (click on the pitch layer), `AppShell.svelte` (panel slot by kind, `#P` restore), new `components/PitchPanel.svelte`, `PlaygroundPanel.svelte` (lighting row, render only for playgrounds), `StandaloneApp.svelte` (selected-pitch outline), `lib/api.js` (`fetchPitchByOsmId`), new `lib/pitchInfo.js` (tag → display rules, unit-tested).
- **i18n**: new strings in `locales/en.json` + `locales/de.json` only.
- **Hub**: no pitch layer today, so pitch selection and `#P` links are standalone-only; a `#slug/P…` hash is ignored in hub mode.
- **Docs**: user guide, frontend guide, CLAUDE.md, API reference.
