## Context

`taginfo/taginfo.json` exists but is a verbatim inheritance from the upstream Berliner Spielplatzkarte (commit `de9a8de`, author SupaplexOSM, Aug 2024). spieli has since diverged into a generic, per-region, multi-deployment playground engine (`mfuhrmann/spieli`). The file's `project` metadata still identifies Berlin, its `data_url`/`icon_url` point at GitHub HTML pages rather than raw resources, and its `tags` array describes Berlin's feature set (notably shadow calculation) rather than spieli's.

The authoritative description of spieli's tag usage lives in three places:
1. `importer/import.sh` — the `osmium tags-filter` expression (lines ~247–288): the coarse ingest superset (what enters the PBF).
2. `importer/api.sql` — column references and hstore key reads (`tags->'…'`) in the PostgREST functions: what the API actually serves.
3. Frontend display consumers (`PlaygroundPanel.svelte`, `EquipmentList.svelte`, `objPlaygroundEquipment.js`): what is rendered to users.

The Taginfo Projects schema (`data_format: 1`) wants the tags a project *meaningfully uses*, with `key`, optional `value`, `object_types`, and a human `description`.

## Goals / Non-Goals

**Goals:**
- `taginfo.json` self-identifies as spieli, not Berlin.
- `data_url` and `icon_url` resolve to raw content so Taginfo's daily poll succeeds.
- The `tags` array reflects what spieli actually imports and consumes — no phantom tags, no missing ones.
- The file validates against `data_format: 1` and stays valid JSON.

**Non-Goals:**
- Performing the Taginfo registry registration (external; manual follow-up only).
- Editing the existing OSM wiki pages (`Spieli.eu` / `DE:Spieli.eu`); `doc_url` just links to them.
- Changing any import, API, or frontend behavior — this is a metadata artifact.
- Per-region taginfo variants — one file describes the engine's tag usage across all deployments.

## Decisions

### D1 — Identity: `name` = `spieli`, `project_url` = `https://spieli.eu`
Matches the lowercase styling used throughout the codebase and the `spieli.eu` domain referenced in the region-URL handling. `doc_url` = `https://mfuhrmann.github.io/spieli/` (the project docs site). The OSM wiki pages (`Spieli.eu` / `DE:Spieli.eu`) exist for OSM-user visibility, not as documentation, so they are not used as `doc_url`. `contact_name`/`contact_email` = the spieli maintainer.
*Alternative considered:* keep Berlin contact — rejected, it misattributes spieli's data usage.

### D2 — Raw URLs for `data_url` and `icon_url`
Taginfo periodically polls `data_url` expecting JSON. The current `.../tree/main/taginfo/taginfo.json` and `.../blob/main/...favicon.svg` are GitHub HTML wrapper pages. Use `https://raw.githubusercontent.com/mfuhrmann/spieli/main/taginfo/taginfo.json` and the raw favicon path.
*Alternative:* serve from `spieli.eu` — viable later, but the GitHub raw URL is stable and needs no deployment wiring.

### D3 — Derive tags from import filter ∩ consumption, not the ingest superset alone
The osmium filter is over-broad (e.g. `boundary=administrative` and `type=multipolygon` are for region framing/geometry assembly, not feature display). Cross-reference against `api.sql`/frontend so each declared tag has a genuine consumption rationale. Tags to declare, grouped by role:

- **Playground identity & naming:** `leisure=playground`, `playground` (equipment subtype), `name`, `alt_name`/`loc_name`/`official_name`/`short_name` (if still consumed), `operator`, `description`, `description:de`, `note`, `fixme`, `image`, `wikimedia_commons`.
- **Accessibility / target group:** `access`, `private`, `wheelchair`, `dog`, `baby`, `provided_for:toddler`, `capacity:baby`, `barrier` (fence/gate), `fee`, `opening_hours`.
- **Equipment detail:** `sport`, `surface`, `material`, `covered`, `shade`, `capacity`, `playground:theme`, plus geometry/detail keys still read (`direction`, `height`, `width`, etc. — confirm against `api.sql`/frontend during apply).
- **Features on/around playground:** `amenity=bench|shelter`, `leisure=pitch|fitness_station|picnic_table`, `natural=tree`, `natural=tree_row`.
- **Nearby POIs (`get_pois`):** `amenity=toilets|ice_cream|cafe|restaurant`, `cuisine`, `emergency`, `healthcare:speciality`, `highway=bus_stop`, `shop=bakery|chemist|supermarket|convenience`.

Drop Berlin-only shadow tags with no spieli consumer: `building`, `building:levels`, `building:part`, `est_height`, `landcover=trees`, `landuse=forest`, `natural=wood`, `natural=shrub`, `diameter_crown`, and the shadow-calc descriptions on `height`/`genus`/`leaf_type`.

*Alternative:* declare the raw osmium superset — rejected, it would advertise framing-only tags (`boundary`) as feature usage and mislead the OSM community.

### D4 — `object_types` per tag
Keep realistic object types: playground/pitch features are `node`/`way`/`area`/`relation`; trees are `node`; `tree_row`/`highway=bus_stop` reflect their geometry. Don't blanket-apply all four types where the import filter only matches some (the existing file's uniform `["node","way","area","relation"]` is lazy and partly wrong).

### D5 — Keep the file at `taginfo/taginfo.json`
Same path the inherited file uses; no need to move it. Update `data_updated` to the change date.

## Risks / Trade-offs

- **[Tag list drifts from reality over time]** → The change documents the three sources of truth; future import/API changes should update this file. A tasks step notes adding a CONTRIBUTING/docs pointer so the next tag change touches `taginfo.json`.
- **[Raw GitHub URL ties identity to the repo host]** → Acceptable; if spieli moves to self-hosting the file under `spieli.eu`, re-register with the new `data_url`.
- **[`spieli.eu` may not be the final canonical domain]** → Confirmed against codebase region-URL references; low risk. If wrong, it's a one-line edit.
- **[Over-declaring vs under-declaring tags]** → Mitigated by D3's intersection approach; the exact final list is verified during apply against `api.sql` + frontend, not guessed.

## Migration Plan

1. Edit `taginfo/taginfo.json` in place on a feature branch from `main` (`feat/701-…`).
2. Validate JSON (`python3 -m json.tool` / `jq`).
3. PR against `mfuhrmann/spieli`, no release labels (metadata only).
4. After merge to `main`: register the raw `data_url` with the OSM Taginfo registry — PR to the taginfo project-list repo or email `jochen@remote.org`. Rollback is trivial (revert the single file); registration is idempotent (Taginfo re-polls).

## Open Questions

- Final `contact_name`/`contact_email` values for the public registry (maintainer's preferred public contact).
- Whether any naming tags (`loc_name`, `official_name`, `short_name`, `old_name`) are still consumed by the current frontend, or are leftovers from the Berlin file — resolve by grep during apply.
- Exact equipment-detail key set (`direction`, `incline`, `step_count`, `handrail*`, etc.) — confirm each against `objPlaygroundEquipment.js`/`EquipmentList.svelte` during apply rather than copying the Berlin set wholesale.
