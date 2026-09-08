## ADDED Requirements

### Requirement: Operator-configurable basemap source

The basemap tile source SHALL be configurable through environment variables and MUST NOT be hardcoded in frontend source. `BASEMAP_URL` accepts a full OpenLayers XYZ URL template so that providers using a non-standard axis order or subdomain sharding are expressible without a code change. When the variable is unset, the application MUST fall back to the documented default so that an existing deployment upgrading without configuration changes sees no behavioural change.

#### Scenario: Operator switches provider without rebuilding

- **WHEN** an operator sets `BASEMAP_URL` in `.env` and restarts the app container
- **THEN** `app/public/config.js` is rewritten at startup to carry that value
- **AND** the map requests tiles from the configured host
- **AND** no image rebuild is required

#### Scenario: Provider with reversed axis order

- **WHEN** `BASEMAP_URL` is set to a template ending `/{z}/{y}/{x}.png`
- **THEN** tile requests substitute the coordinates in that order
- **AND** no code branch is required to distinguish it from a `{z}/{x}/{y}` provider

#### Scenario: Unset configuration preserves current behaviour

- **WHEN** `BASEMAP_URL` is not set
- **THEN** the map renders using the documented default source
- **AND** the deployment behaves as it did before this change

### Requirement: Vector basemap support

The application SHALL support vector basemaps in addition to raster, because no keyless raster provider covers the federation's target area of Germany, Czechia and Slovakia. An operator selects a vector basemap by configuring a style URL, and the application renders it client-side.

Vector tilesets cap at a lower maximum zoom than the map allows and rely on the client overzooming beyond it. The application MUST continue to render at the map's full zoom range when the configured tileset's maximum zoom is lower.

#### Scenario: Operator configures a vector style

- **WHEN** an operator configures a vector style URL instead of a raster tile template
- **THEN** the map renders the vector basemap
- **AND** no raster tile requests are made for the basemap

#### Scenario: Zooming beyond the tileset's maximum zoom

- **WHEN** the tileset declares a maximum zoom below the map's maximum zoom
- **AND** the user zooms past it
- **THEN** the basemap continues to render by overzooming the deepest available tiles
- **AND** no requests are issued for tiles beyond the tileset's maximum zoom

#### Scenario: Style assets do not leak to a third party

- **WHEN** a vector basemap is configured for local or proxied delivery
- **THEN** the style document, glyphs and sprites are served from the same origin as the tiles
- **AND** the visitor's browser contacts no third-party host for them

### Requirement: Locally served basemap tiles

The application SHALL support serving basemap tiles from a local copy held by the instance, with no request path to any provider at request time. This is distinct from proxied delivery, which contacts a provider on a cache miss.

#### Scenario: No provider is contacted at request time

- **WHEN** the basemap is configured for local delivery and a visitor browses the map
- **THEN** every basemap request is answered from the instance's own storage
- **AND** no request is made to any external provider, on a cache miss or otherwise

#### Scenario: Coverage gaps are visible, not silent

- **WHEN** a visitor pans outside the area the local copy covers
- **THEN** the deployment does not present blank tiles as though they were valid map data

### Requirement: Attribution follows the configured provider

The displayed map attribution SHALL be configurable via `BASEMAP_ATTRIBUTION` and MUST correspond to the configured source. Because attribution is a licence obligation for the providers under consideration, the application MUST NOT display an attribution belonging to a provider it is not using.

#### Scenario: Attribution changes with the provider

- **WHEN** an operator sets both `BASEMAP_URL` and `BASEMAP_ATTRIBUTION`
- **THEN** the map control displays the configured attribution
- **AND** the previous provider's attribution is no longer shown

#### Scenario: Provider set without attribution

- **WHEN** `BASEMAP_URL` is set and `BASEMAP_ATTRIBUTION` is empty
- **THEN** the deployment surfaces this as a configuration problem rather than silently displaying the default provider's attribution alongside another provider's tiles

### Requirement: Optional proxied tile delivery

The application SHALL support serving basemap tiles from its own origin so that the visitor's browser never connects to the tile provider. Proxied delivery is enabled by setting `BASEMAP_PROXY_UPSTREAM` and MUST be opt-in, with direct delivery remaining the default.

#### Scenario: Proxied mode keeps the visitor's browser on one origin

- **WHEN** `BASEMAP_PROXY_UPSTREAM` is configured
- **THEN** the frontend requests tiles from a same-origin path under `/tiles/`
- **AND** the visitor's browser issues no request to the tile provider's host
- **AND** the provider receives requests only from the operator's server

#### Scenario: Direct mode is the default

- **WHEN** `BASEMAP_PROXY_UPSTREAM` is unset
- **THEN** the frontend requests tiles directly from the configured `BASEMAP_URL` host

#### Scenario: No fallback from proxied to direct

- **WHEN** proxied delivery is configured and the upstream provider is unreachable
- **THEN** tile requests fail and the map renders without a basemap
- **AND** the browser does NOT fall back to contacting the provider directly

### Requirement: Bounded tile cache

Proxied delivery SHALL cache tiles with an operator-configurable maximum size, defaulting to a conservative bound. Because a single host may run many stacks, the cache MUST NOT be able to grow without limit.

#### Scenario: Cache respects its configured ceiling

- **WHEN** cached tiles reach `BASEMAP_CACHE_MAX_SIZE`
- **THEN** older entries are evicted rather than the cache growing beyond the limit

#### Scenario: Repeated views are served from cache

- **WHEN** a tile already held in the cache is requested again by any visitor
- **THEN** it is served without a new request to the upstream provider

### Requirement: Proxied tile requests are not logged

Proxied delivery interposes the operator's server between the visitor and the provider, which means the tile request stream — including the visitor's IP address and the z/x/y coordinates that reveal what they are looking at — passes through the operator's web server. Access logging for the tile path SHALL therefore be disabled by default, so that enabling proxying does not create a per-visitor location trail on the operator's disk. An operator who deliberately wants tile logging MUST opt in.

This is a correctness property of proxied delivery, not a hardening recommendation: proxying that writes a location trail to the operator's disk defeats the purpose for which it is enabled.

#### Scenario: Enabling the proxy creates no tile access log

- **WHEN** proxied delivery is enabled with default configuration
- **AND** a visitor pans the map, generating many tile requests
- **THEN** no entry for those tile requests appears in the server's access log
- **AND** no per-visitor record of tile coordinates is written to disk

#### Scenario: Errors remain diagnosable

- **WHEN** the upstream provider returns errors for proxied tile requests
- **THEN** the operator can still diagnose the failure from error-level logging
- **AND** that diagnostic path does not require logging successful per-visitor tile requests

### Requirement: Privacy disclosure reflects the configured delivery path

The generated Datenschutzerklärung SHALL describe the tile delivery actually in use, derived from the same configuration that drives the map layer, so that the two cannot drift apart. It MUST NOT name a tile provider as a recipient of visitor data when tiles are proxied, and MUST NOT omit the provider when they are not.

#### Scenario: Direct delivery names the provider

- **WHEN** the privacy page is generated with direct delivery configured
- **THEN** its service table contains a row for the configured tile provider
- **AND** that row states that the visitor's IP address, User-Agent, Referer and tile coordinates are transmitted

#### Scenario: Proxied delivery asserts no third-party tile transfer

- **WHEN** the privacy page is generated with proxied delivery configured
- **THEN** its service table contains no third-party row for basemap tiles
- **AND** the page states that tiles are served by this instance

#### Scenario: Disclosure cannot contradict the map

- **WHEN** the basemap configuration changes and the container restarts
- **THEN** the regenerated privacy page describes the new configuration
- **AND** no manual edit to the template is needed to keep it accurate
