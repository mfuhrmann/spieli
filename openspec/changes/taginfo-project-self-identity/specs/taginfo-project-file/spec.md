## ADDED Requirements

### Requirement: Self-identifying project metadata

The `taginfo/taginfo.json` file SHALL identify spieli as the publishing project. The `project` object's `name`, `project_url`, `doc_url`, `contact_name`, and `contact_email` MUST describe spieli and its maintainer, and MUST NOT credit any upstream or downstream deployment (e.g. the Berliner Spielplatzkarte).

#### Scenario: Project name is spieli

- **WHEN** the file is read
- **THEN** `project.name` is `spieli` and `project.project_url` is `https://spieli.eu`
- **AND** `project.doc_url` resolves to spieli's own documentation (the `mfuhrmann/spieli` repository)

#### Scenario: No inherited Berlin identity remains

- **WHEN** the file is inspected for upstream identifiers
- **THEN** no field contains the upstream project name, `osmbln.uber.space` URLs, or the upstream maintainer's contact details

### Requirement: Pollable raw resource URLs

The file SHALL expose `data_url` and `icon_url` as raw-content URLs so Taginfo's periodic poll fetches the JSON document and the icon directly, not a GitHub HTML wrapper page.

#### Scenario: data_url serves raw JSON

- **WHEN** Taginfo polls `data_url`
- **THEN** the URL returns the raw `taginfo.json` document (e.g. a `raw.githubusercontent.com` path), not an HTML page

#### Scenario: icon_url serves raw image

- **WHEN** the icon at `icon_url` is requested
- **THEN** the URL returns the raw image content, not an HTML page

### Requirement: Tags reflect spieli's actual data usage

The `tags` array SHALL declare the OSM tags that spieli imports and consumes, derived from the `osmium tags-filter` in `importer/import.sh`, the columns and hstore keys read in `importer/api.sql`, and the frontend display consumers. Tags that spieli does not consume MUST NOT be declared, and tags spieli consumes MUST NOT be omitted.

#### Scenario: Shadow-calculation tags are absent

- **WHEN** the `tags` array is inspected
- **THEN** tags used only for shadow calculation by the upstream project — `building`, `building:levels`, `building:part`, `est_height`, `landcover=trees`, `landuse=forest`, `natural=wood`, `diameter_crown` — are not present

#### Scenario: POI and amenity tags are declared

- **WHEN** the `tags` array is inspected
- **THEN** the nearby-POI tags consumed by `get_pois` are present, including `amenity=toilets`, `amenity=cafe`, `amenity=restaurant`, `amenity=ice_cream`, `highway=bus_stop`, `shop=bakery|chemist|supermarket|convenience`, `emergency`, `healthcare:speciality`, and `cuisine`

#### Scenario: Framing-only tags are not advertised as feature usage

- **WHEN** the `tags` array is inspected
- **THEN** tags used only for region framing or geometry assembly (`boundary=administrative`, `type=multipolygon`) are not declared as feature-display usage

#### Scenario: Each declared tag carries a description and realistic object types

- **WHEN** any entry in the `tags` array is read
- **THEN** it has a non-empty `description` explaining how spieli uses the tag
- **AND** its `object_types` reflect the geometries the tag actually matches in spieli's import

### Requirement: Valid Taginfo Projects document

The file SHALL be valid JSON conforming to Taginfo Projects `data_format` 1, with `data_format`, `data_url`, `data_updated`, a `project` object, and a `tags` array all present.

#### Scenario: File parses and declares data_format 1

- **WHEN** the file is parsed as JSON
- **THEN** parsing succeeds
- **AND** `data_format` equals `1` and the `project` object and `tags` array are present
