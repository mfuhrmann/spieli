## ADDED Requirements

### Requirement: Backend exposes cluster aggregates scoped to zoom and bbox

Each data-node SHALL expose a function that returns pre-aggregated playground count buckets for a given zoom level and bounding box, so clients at low zoom can render cluster representations without fetching individual features.

#### Scenario: Clusters RPC returns bucketed counts

- **WHEN** a client calls `api.get_playground_clusters(z, min_lon, min_lat, max_lon, max_lat)` with a zoom level and a WGS84 bbox intersecting the configured region
- **THEN** the response is a JSON array of bucket objects, each containing `lon`, `lat`, `count`, `complete`, `partial`, and `missing` fields
- **AND** `count = complete + partial + missing` for every bucket
- **AND** bucket centres are deterministic for a given `(z, bbox)` input (grid-aligned)

#### Scenario: Clusters RPC honours bbox filter

- **WHEN** the caller supplies a bbox that covers only a subset of the region
- **THEN** only buckets whose centres fall within the bbox are returned
- **AND** no playgrounds outside the bbox contribute to any returned bucket

#### Scenario: Clusters RPC scales cell size with zoom

- **WHEN** the caller requests the same bbox at `z = 6` and at `z = 10`
- **THEN** the `z = 10` response contains more (smaller) buckets than the `z = 6` response
- **AND** the total `count` across all buckets is identical across zoom levels (no features lost to bucketing)

### Requirement: Backend exposes centroid features scoped to bbox

Each data-node SHALL expose a function returning lightweight per-playground rows (centroid + identity + completeness + filter attributes) for a bounding box, sized so that mid-zoom clients can render every playground without fetching polygon geometry.

#### Scenario: Centroids RPC returns per-feature rows

- **WHEN** a client calls `api.get_playground_centroids(min_lon, min_lat, max_lon, max_lat)` against a region with N playgrounds in the bbox
- **THEN** the response contains exactly N rows
- **AND** each row contains `osm_id`, `lon`, `lat`, `completeness` (one of `"complete"`, `"partial"`, `"missing"`), and `filter_attrs` (an object with boolean keys `has_water`, `for_baby`, `for_toddler`, `for_wheelchair`, `has_soccer`, `has_basketball`, `access_restricted`)

#### Scenario: Centroid payload is compact

- **WHEN** the response is measured for a 1000-playground bbox
- **THEN** the uncompressed JSON is under 200 KB
- **AND** no polygon geometry, no tag hstore, and no stats counts are included

### Requirement: Backend exposes bbox-scoped playground polygons

Each data-node SHALL expose a function returning full playground polygons scoped to an intersecting bbox, in the same response shape as the legacy `get_playgrounds`, so high-zoom clients can render polygons without fetching the whole region.

#### Scenario: Bbox polygons RPC matches legacy shape

- **WHEN** a client calls `api.get_playgrounds_bbox(min_lon, min_lat, max_lon, max_lat)` for a bbox intersecting the region
- **THEN** the response is a GeoJSON `FeatureCollection`
- **AND** each feature has the same properties as a feature from `api.get_playgrounds(relation_id)` — `osm_id`, `name`, `leisure`, `operator`, `access`, `surface`, `area`, `tree_count`, `bench_count`, and the rest

#### Scenario: Bbox polygons RPC honours intersection

- **WHEN** the bbox intersects only part of the region
- **THEN** only playgrounds whose geometry intersects the bbox are returned
- **AND** a playground whose polygon partially overlaps the bbox edge is still returned in full (not clipped)

### Requirement: get_meta includes completeness counts and data version

The `api.get_meta` response SHALL include per-backend aggregate completeness counts and a data-version bump timestamp, so clients can render a macro view (proposal P2) and clients can invalidate cached responses after an import.

#### Scenario: get_meta carries completeness counts

- **WHEN** a client calls `api.get_meta`
- **THEN** the response includes `complete`, `partial`, `missing` integer fields in addition to the existing `playground_count`
- **AND** `playground_count = complete + partial + missing`

#### Scenario: get_meta carries data_version

- **WHEN** the importer successfully completes
- **THEN** the next call to `api.get_meta` returns a `data_version` ISO-8601 timestamp equal to the import completion time
- **AND** repeated calls return the same `data_version` until the next successful import

### Requirement: Legacy get_playgrounds is retained one release, marked deprecated

The existing `api.get_playgrounds(relation_id)` function SHALL remain callable and correct for one release cycle after this change lands, so tests and external consumers can migrate. It SHALL be annotated as deprecated at the database level.

#### Scenario: Legacy RPC still responds

- **WHEN** a client calls `api.get_playgrounds(relation_id)` after this change is deployed
- **THEN** the response is unchanged from before this change
- **AND** a SQL `COMMENT` on the function names the intended replacement (`get_playgrounds_bbox`) and signals deprecation

### Requirement: Client orchestrates three layers by zoom

The standalone client SHALL render playground data through exactly three zoom-scoped layers (cluster, centroid, polygon) whose visibility is determined by the current map zoom, and SHALL refetch the relevant layer's source on each debounced `moveend`.

#### Scenario: Zoom ≤ 10 shows the cluster layer only

- **WHEN** the map zoom is less than or equal to `clusterMaxZoom` (default 10)
- **THEN** the cluster layer is visible
- **AND** the centroid layer and polygon layer are hidden (but not destroyed)

#### Scenario: Zoom 11–13 shows the centroid layer only

- **WHEN** the map zoom is between `clusterMaxZoom + 1` and `centroidMaxZoom` (default 11 to 13)
- **THEN** the centroid layer is visible
- **AND** the cluster layer and polygon layer are hidden

#### Scenario: Zoom ≥ 14 shows the polygon layer only

- **WHEN** the map zoom is greater than `centroidMaxZoom`
- **THEN** the polygon layer is visible, rendered with `playgroundStyleFn`
- **AND** the cluster layer and centroid layer are hidden
- **AND** `playgroundSourceStore` is set to the polygon layer's source

#### Scenario: Moveend refetches the active layer

- **WHEN** the user pans or zooms and the resulting `moveend` settles
- **THEN** within 300 ms (debounce) the active tier's fetcher is invoked with the new bbox
- **AND** any in-flight request for the same layer from a previous `moveend` is cancelled via `AbortController`

#### Scenario: Tier not available falls back

- **WHEN** the active tier's RPC returns HTTP 404 (backend older than this change)
- **THEN** the client logs a one-time warning and falls back to `api.get_playgrounds(relation_id)` for that backend
- **AND** the cluster / centroid layers remain empty for the affected backend

### Requirement: Clusters are rendered as completeness-segmented stacked rings

Cluster features SHALL be rendered on the map as a ring divided into three segments proportional to the complete / partial / missing counts, with the total count as a number at the centre.

#### Scenario: Ring segments are proportional

- **WHEN** a cluster has `complete = 6`, `partial = 19`, `missing = 22` (count = 47)
- **THEN** the rendered ring has three segments whose arc lengths are proportional to 6 : 19 : 22
- **AND** segment colours match the polygon completeness colours (`#155215`, `#92400e`, `#991b1b`)
- **AND** the centre displays `47` in bold tabular numerals

#### Scenario: Single-feature cluster collapses to a dot

- **WHEN** a cluster has `count = 1`
- **THEN** no ring is drawn
- **AND** a solid dot is rendered in the single feature's completeness colour
- **AND** the dot size matches the centroid tier's default point size

#### Scenario: Ring renders scale with count

- **WHEN** cluster counts are 5, 25, 100, and 500 respectively
- **THEN** the outer ring radius is 12, 14, 18, and 22 CSS pixels respectively
- **AND** the number remains readable at every size

#### Scenario: Filter-badge appears only when filters are active and zoom is centroid or above

- **WHEN** the filter store has any active filter and the zoom is in the centroid tier (11–13)
- **THEN** each rendered cluster shows a small "N match" pill below the count, where N is the filter-matching child count
- **WHEN** the zoom is in the cluster tier (≤ 10) or no filter is active
- **THEN** no filter badge is rendered

#### Scenario: Cluster click zooms to extent

- **WHEN** the user clicks a cluster
- **THEN** the map view animates to fit the cluster's child-feature bounding extent
- **AND** no selection is created (the hash is not modified)

### Requirement: Deeplink restore hydrates the polygon tier on demand

URL-hash restore of a specific playground SHALL work even when the polygon layer is not currently populated (i.e. the user's initial zoom is below 14).

#### Scenario: Deeplink at low zoom hydrates one feature

- **WHEN** a user opens `/#W1234567` on a page that loads at zoom 6
- **THEN** the client locates the playground's position via `api.get_nearest_playgrounds` (or equivalent lookup)
- **AND** fetches a small `get_playgrounds_bbox` response centred on that position
- **AND** selects the matched feature, fitting the view to its extent at a zoom in the polygon tier
