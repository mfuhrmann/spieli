## MODIFIED Requirements

### Requirement: Backend exposes cluster aggregates scoped to zoom and bbox

Each data-node SHALL expose a function that returns pre-aggregated playground count buckets for a given zoom level and bounding box, so clients at low zoom can render cluster representations without fetching individual features. Buckets are grouped by snapping each playground's centroid to a zoom-dependent grid (the grouping key); the `lon`/`lat` emitted for each bucket is the unweighted spatial mean of its members' centroids — i.e. `ST_Centroid(ST_Collect(playground_stats.centroid_3857))` over the bucket's members, reprojected to WGS84 — so the bucket dot tracks the geographic distribution of the playgrounds it represents rather than a grid lattice. Every playground contributes to exactly one of the three completeness buckets (`complete` / `partial` / `missing`) by its `completeness` classification, regardless of its `access` tag.

#### Scenario: Clusters RPC returns bucketed counts

- **WHEN** a client calls `api.get_playground_clusters(z, min_lon, min_lat, max_lon, max_lat)` with a zoom level and a WGS84 bbox intersecting the configured region
- **THEN** the response is a JSON array of bucket objects, each containing `lon`, `lat`, `count`, `complete`, `partial`, and `missing` fields
- **AND** the response does NOT contain a `restricted` field
- **AND** `count = complete + partial + missing` for every bucket

#### Scenario: Clusters RPC positions buckets at the mean of member centroids

- **WHEN** a bucket aggregates two or more playgrounds whose centroids are not symmetrically placed within the grid cell
- **THEN** the returned `lon` / `lat` equal the WGS84 reprojection of `ST_Centroid(ST_Collect(playground_stats.centroid_3857))` over the bucket's members (the unweighted spatial mean of their centroid geometries)
- **AND** the position is *not* the WGS84 projection of the grid cell anchor
- **AND** for a bucket with a single member, the returned `lon` / `lat` equal that member's centroid reprojected to WGS84

#### Scenario: Clusters RPC bucketing is deterministic for a fixed dataset

- **WHEN** a client calls the RPC twice with identical `(z, bbox)` against an unchanged dataset
- **THEN** the two responses contain the same set of buckets with identical `count` / `complete` / `partial` / `missing` values
- **AND** each bucket's `lon` / `lat` is identical between the two calls

#### Scenario: Clusters RPC honours bbox filter

- **WHEN** the caller supplies a bbox that covers only a subset of the region
- **THEN** only members whose centroid lies within the bbox contribute to a bucket
- **AND** a bucket is returned only when at least one of its members satisfies that filter
- **AND** no playgrounds outside the bbox contribute to any returned bucket

#### Scenario: Clusters RPC scales cell size with zoom

- **WHEN** the caller requests the same bbox at `z = 6` and at `z = 10`
- **THEN** the `z = 10` response contains more (smaller) buckets than the `z = 6` response
- **AND** the total `count` across all buckets is identical across zoom levels (no features lost to bucketing)

### Requirement: Clusters are rendered as completeness-segmented stacked rings

Cluster features SHALL be rendered on the map as a ring divided into up to three segments proportional to the complete / partial / missing counts, with the total count as a number at the centre. Segment colours match the legend fill palette (not the darker polygon strokes). There is no restricted/"not public" segment: access-restricted playgrounds are counted into their completeness bucket like any other playground.

#### Scenario: Ring segments are proportional

- **WHEN** a cluster has `complete = 6`, `partial = 19`, `missing = 25` (count = 50)
- **THEN** the rendered ring has three segments whose arc lengths are proportional to 6 : 19 : 25
- **AND** the complete / partial / missing segments use the legend fill-base palette (`#228b22`, `#eab308`, `#ef4444`)
- **AND** no hatched / light-gray segment is drawn
- **AND** the centre displays `50`
- **AND** the invariant `count = complete + partial + missing` holds by construction (enforced in the `get_playground_clusters` RPC)

#### Scenario: Single-feature cluster collapses to a dot

- **WHEN** a cluster has `count = 1`
- **THEN** no ring is drawn
- **AND** a solid dot is rendered in the single feature's completeness colour
- **AND** the dot size is 5 CSS px

#### Scenario: Ring renders scale with count

- **WHEN** cluster counts are 5, 25, 100, and 500 respectively
- **THEN** the outer ring radius is approximately 18 / 22 / 28 / 34 CSS pixels respectively (radii retuned down during live-browser review to reduce overlap at the cluster tier's zoom range)
- **AND** the ring stroke width is 8 CSS px and the centre count is rendered at 16 px, non-bold
- **AND** the number remains readable at every size

#### Scenario: Filter-badge appears only when filters are active

- **WHEN** the filter store has any active filter
- **THEN** each rendered cluster shows a small "N match" pill below the count, where N is the filter-matching child count
- **WHEN** no filter is active
- **THEN** no filter badge is rendered

#### Scenario: Cluster click zooms to extent

- **WHEN** the user clicks a cluster
- **THEN** the map view animates toward the cluster's centre (currently +2 zoom levels — fit-to-extent of bucket children requires a follow-up since server-bucketed clusters don't carry per-child geometry)
- **AND** no selection is created (the hash is not modified)

## ADDED Requirements

### Requirement: Access classification is NULL-safe and does not drop untagged playgrounds

The `access_restricted` classification SHALL default to `false` for playgrounds that lack a `private`/`customers` `access` tag (i.e. it MUST NOT evaluate to NULL for untagged playgrounds). The `access_restricted` attribute is retained only to drive the `filter_private` toggle; it MUST NOT remove any playground from the cluster completeness aggregation.

#### Scenario: Untagged playground counts into its completeness bucket

- **WHEN** a playground has no `access` tag and a computed completeness of `missing`
- **THEN** it contributes to its bucket's `missing` count
- **AND** it is not omitted from `complete` + `partial` + `missing`

#### Scenario: filter_private keeps untagged playgrounds visible

- **WHEN** `get_playground_clusters` is called with `filter_private` enabled
- **THEN** playgrounds with `access IN ('private','customers')` are excluded from the buckets
- **AND** playgrounds without an `access` tag remain included (treated as public)
