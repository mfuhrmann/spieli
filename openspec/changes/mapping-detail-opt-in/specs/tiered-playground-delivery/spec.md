## MODIFIED Requirements

### Requirement: Client orchestrates two layers by zoom

The standalone client SHALL render playground data through exactly two zoom-scoped layers (cluster, polygon) whose visibility is determined by the current map zoom, and SHALL refetch the relevant layer's source on each debounced `moveend`.

<!--
  Original design was three tiers (cluster ≤10, centroid 11-13, polygon ≥14).
  Pivoted to two tiers during implementation: the cluster tier now covers
  zoom ≤ clusterMaxZoom (default 13) and renders as either the stacked ring
  (multi-child bucket) or a single completeness dot (count === 1). Hub-side
  Supercluster re-clustering across backends lands in
  add-federated-playground-clustering (P2).
-->

#### Scenario: Zoom ≤ clusterMaxZoom shows the cluster layer only

- **WHEN** the map zoom is less than or equal to `clusterMaxZoom` (default 13)
- **THEN** the cluster layer is visible
- **AND** the polygon layer is hidden (but not destroyed)

#### Scenario: Zoom > clusterMaxZoom shows the polygon layer only

- **WHEN** the map zoom is greater than `clusterMaxZoom`
- **THEN** the polygon layer is visible — rendered with `playgroundStyleFn` as completeness-coloured polygons when mapping detail is on, and as one neutral pin per playground when mapping detail is off (see `mapping-detail-view`)
- **AND** the cluster layer is hidden
- **AND** `playgroundSourceStore` exposes the polygon layer's source (also non-null at cluster tier so widgets can hydrate single playgrounds on demand — see "Deeplink restore hydrates the polygon tier on demand")

#### Scenario: Moveend refetches the active layer

- **WHEN** the user pans or zooms and the resulting `moveend` settles
- **THEN** within 300 ms (debounce) the active tier's fetcher is invoked with the new bbox
- **AND** any in-flight request for the same layer from a previous `moveend` is cancelled via `AbortController`

#### Scenario: Tier not available falls back

- **WHEN** the active tier's RPC returns HTTP 404 (backend older than this change)
- **THEN** the client logs a one-time warning and falls back to `api.get_playgrounds(relation_id)` for that backend
- **AND** the cluster layer remains empty for the affected backend

### Requirement: Clusters are rendered as completeness-segmented stacked rings

While mapping detail is on, cluster features SHALL be rendered on the map as a ring divided into up to four segments proportional to the complete / partial / missing / restricted counts, with the total count as a number at the centre. The restricted segment (access-restricted playgrounds) renders with a hatched light-gray pattern mirroring the CompletenessLegend's "not public" swatch. Segment colours match the legend fill palette (not the darker polygon strokes). While mapping detail is off, clusters SHALL instead render as neutral filled discs and single-playground clusters as pins, as specified in `mapping-detail-view`.

#### Scenario: Ring segments are proportional

- **WHEN** mapping detail is on and a cluster has `complete = 6`, `partial = 19`, `missing = 22`, `restricted = 3` (count = 50)
- **THEN** the rendered ring has four segments whose arc lengths are proportional to 6 : 19 : 22 : 3
- **AND** the complete / partial / missing segments use the legend fill-base palette (`#228b22`, `#eab308`, `#ef4444`)
- **AND** the restricted segment uses a hatched light-gray pattern
- **AND** the centre displays `50` in bold tabular numerals
- **AND** the invariant `count = complete + partial + missing + restricted` holds by construction (enforced in the `get_playground_clusters` RPC)

#### Scenario: Single-feature cluster collapses to a dot

- **WHEN** mapping detail is on and a cluster has `count = 1`
- **THEN** no ring is drawn
- **AND** a solid dot is rendered in the single feature's completeness colour (or solid light gray if the feature is access-restricted)
- **AND** the dot size is 5 CSS px

#### Scenario: Ring renders scale with count

- **WHEN** cluster counts are 5, 25, 100, and 500 respectively
- **THEN** the outer ring radius is approximately 26 / 32 / 38 / 44 CSS pixels respectively (radii were retuned during live-browser review for visual prominence at the cluster tier's zoom range)
- **AND** the number remains readable at every size
- **AND** the neutral discs used while mapping detail is off follow the same size scale

#### Scenario: Filter-badge appears only when filters are active

- **WHEN** the filter store has any active filter
- **THEN** each rendered cluster shows a small "N match" pill below the count, where N is the filter-matching child count
- **WHEN** no filter is active
- **THEN** no filter badge is rendered

<!-- The filter-badge requirement is specified but deferred — task §4.6 in the change tasks list. The renderer + RPC are in place; the badge UI ships in a follow-up. -->

#### Scenario: Cluster click zooms to extent

- **WHEN** the user clicks a cluster
- **THEN** the map view animates toward the cluster's centre (currently +2 zoom levels — fit-to-extent of bucket children requires a follow-up since server-bucketed clusters don't carry per-child geometry)
- **AND** no selection is created (the hash is not modified)
