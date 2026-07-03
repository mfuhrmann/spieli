## Why

`taginfo/taginfo.json` was inherited verbatim from the upstream Berliner Spielplatzkarte at fork time (commit `de9a8de`, authored by SupaplexOSM). Every metadata field still credits Berlin — name, project_url, doc_url, and contact all point at `osmbln.uber.space` / Alex Seidel — and the declared tag list no longer matches what spieli actually imports and consumes. Issue #701 asks to register spieli with the OSM Taginfo Projects registry; doing so with the current file would publish Berlin's identity for spieli's data usage. The file must first become a faithful, self-identified description of spieli.

## What Changes

- Rewrite `taginfo/taginfo.json` `project` metadata to spieli's own identity: `name` = `spieli`, `project_url` = `https://spieli.eu`, `doc_url` = `https://mfuhrmann.github.io/spieli/`, contact = the spieli maintainer.
- Fix `data_url` and `icon_url` to **raw** URLs (`raw.githubusercontent.com/...`) so Taginfo's daily poll fetches JSON/SVG, not a GitHub HTML page. The current `tree/` and `blob/` URLs serve HTML and would break polling.
- Regenerate the `tags` array from spieli's actual data path — the `osmium tags-filter` in `importer/import.sh` plus the columns/hstore keys read in `importer/api.sql` and the frontend. This drops Berlin-only shadow-calculation tags (`building*`, `est_height`, `landcover=trees`, `landuse=forest`, `natural=wood`, `diameter_crown`) and adds spieli's POI/amenity/shop tags (`amenity=toilets|cafe|restaurant|ice_cream`, `highway=bus_stop`, `shop=bakery|chemist|supermarket|convenience`, `emergency`, `healthcare:speciality`, `cuisine`, `natural=tree_row`).
- Document the external registration step (PR to the taginfo project-list repo, or email `jochen@remote.org`) as a manual follow-up in tasks; the change itself does not perform registration.

## Capabilities

### New Capabilities
- `taginfo-project-file`: spieli publishes a Taginfo Projects file that accurately and self-identifyingly describes the OSM tags it consumes, hosted at a raw URL suitable for Taginfo's polling.

### Modified Capabilities
<!-- None: no existing spec governs the taginfo file. -->

## Impact

- `taginfo/taginfo.json` — full rewrite (metadata, URLs, tags).
- Source of truth for the tag list: `importer/import.sh` (osmium filter), `importer/api.sql` (consumed columns/hstore keys), frontend display consumers.
- No code, schema, or runtime behavior change — this is a metadata/documentation artifact. No release labels apply.
- External: a follow-up registration action with the OSM Taginfo registry (out of band, after merge to `main`).
