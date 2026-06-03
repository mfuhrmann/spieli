## MODIFIED Requirements

### Requirement: Hub re-clusters merged server results across backends

At the cluster tier, merged cluster buckets from multiple backends SHALL be re-clustered client-side so that no visible seam appears at a backend boundary.

#### Scenario: Re-cluster preserves total counts

- **WHEN** backend A returns buckets summing to count 2000 and backend B returns buckets summing to count 1500 inside the viewport
- **THEN** the rendered cluster layer, after re-clustering, shows a total count of 3500 across its rings
- **AND** the sum of `complete` segments equals the sum of `complete` inputs from A and B
- **AND** likewise for `partial` and `missing` (the three-segment ring; there is no `restricted` bucket)

#### Scenario: Border clusters merge visually

- **WHEN** two clusters from different backends sit within a visual threshold distance at the border
- **THEN** the re-clusterer may merge them into a single rendered ring whose count is the sum
- **AND** the ring's segment proportions reflect the combined counts
