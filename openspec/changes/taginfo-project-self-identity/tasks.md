## 1. Establish the authoritative tag list

- [x] 1.1 Extract the full `osmium tags-filter` expression from `importer/import.sh` (the ingest superset).
- [x] 1.2 Grep `importer/api.sql` for served columns and hstore key reads (`tags->'…'`) across `get_playground*`, `get_equipment`, `get_standalone_equipment`, `get_trees`, and `get_pois`.
- [x] 1.3 Grep the frontend display consumers (`app/src/components/PlaygroundPanel.svelte`, `EquipmentList.svelte`, `app/src/lib/objPlaygroundEquipment.js`, `completeness.js`) for tag keys actually rendered.
- [x] 1.4 Build the final tag set = (import filter ∩ a genuine consumer), excluding framing-only tags (`boundary=administrative`, `type=multipolygon`). Record the include/exclude decision for each tag.

## 2. Rewrite project metadata and URLs

- [x] 2.1 Set `project.name` = `spieli`, `project.project_url` = `https://spieli.eu`, `project.doc_url` = `https://mfuhrmann.github.io/spieli/`.
- [x] 2.2 Set `project.contact_name` / `project.contact_email` to the spieli maintainer's public contact.
- [x] 2.3 Set `data_url` to `https://raw.githubusercontent.com/mfuhrmann/spieli/main/taginfo/taginfo.json`.
- [x] 2.4 Set `icon_url` to the raw favicon URL (raw.githubusercontent.com path), confirming the asset resolves.
- [x] 2.5 Set `data_updated` to the change date; keep `data_format` = `1`.

## 3. Rewrite the tags array

- [x] 3.1 Replace the inherited tags with the list from task 1.4; give each entry a `key` (and `value` where applicable), a spieli-specific `description`, and realistic `object_types`.
- [x] 3.2 Remove the Berlin shadow-calculation tags (`building*`, `est_height`, `landcover=trees`, `landuse=forest`, `natural=wood`, `natural=shrub`) and their shadow descriptions. **Correction during apply:** `diameter_crown` and `genus` are KEPT — `app/src/lib/equipmentAttributes.js` consumes both for tree detail display, so they are not Berlin-only.
- [x] 3.3 Add the POI tags from `get_pois` (`amenity=toilets|cafe|restaurant|ice_cream`, `cuisine`, `emergency`, `healthcare:speciality`, `highway=bus_stop`, `shop=bakery|chemist|supermarket|convenience`) and `natural=tree_row`.

## 4. Validate

- [x] 4.1 Validate the file is well-formed JSON (`jq . taginfo/taginfo.json` or `python3 -m json.tool`).
- [x] 4.2 Confirm against the spec scenarios: no Berlin identity remains, raw URLs only, no framing-only tags declared, every tag has a description + object_types.
- [x] 4.3 Add a pointer in `CONTRIBUTING.md` (or import-pipeline docs) noting that import/API tag changes must update `taginfo/taginfo.json`.

## 5. Ship and register

- [x] 5.1 Create branch `feat/701-taginfo-self-identity` from `main`; commit with a Conventional Commit message referencing #701.
- [ ] 5.2 Open PR against `mfuhrmann/spieli` with no release labels (metadata only).
- [ ] 5.3 After merge to `main`: register the raw `data_url` with the OSM Taginfo registry — PR to the taginfo project-list repo or email `jochen@remote.org`. (Manual follow-up, out of the code change.)
