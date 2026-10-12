## MODIFIED Requirements

### Requirement: Hub renders a country-level macro view at zoom 0–5

At zoom levels at or below `macroMaxZoom` (default 5; introduced as a separate config knob during implementation so the cluster tier can keep its own `clusterMaxZoom = 13` threshold), the hub SHALL render one stacked-ring feature per registered backend, sized and segmented by the backend's `get_meta` aggregate counts, without fetching any per-playground data. While mapping detail is off, each backend's ring SHALL render as a neutral filled disc with its total count instead of completeness segments; health variants (offline, importing, …) keep their own treatment in both modes.

#### Scenario: Macro view renders one ring per backend

- **WHEN** the zoom is 3 (within the macro tier) and the registry contains N backends
- **THEN** exactly N rings are rendered, one per backend
- **AND** no per-playground fetch is issued at this zoom

#### Scenario: Macro ring position and sizing

- **WHEN** backend A has `bbox = [5, 47, 15, 55]` and `playground_count = 65000`
- **THEN** A's ring is centred at approximately `(10, 51)` (bbox centroid)
- **AND** the ring's radius is drawn from the same size scale used for individual clusters (bucketed by count; large buckets for higher counts)

#### Scenario: Macro ring segments reflect completeness

- **WHEN** mapping detail is on and backend A has `{complete: 12000, partial: 30000, missing: 23000}` in its `get_meta` response (P1 `get_meta` doesn't yet ship `restricted`; macro view treats it as zero in that case)
- **THEN** A's ring displays segments proportional to 12 : 30 : 23 : 0 (the four-segment renderer collapses the empty `restricted` arc)
- **AND** colours match the playground polygon completeness colours
- **WHEN** a backend extends `get_meta` with `restricted` in a future release
- **THEN** the macro ring renders four segments including the gray-hatched restricted arc, matching the cluster ring's four-segment layout

#### Scenario: Macro ring is neutral with mapping detail off

- **WHEN** mapping detail is off and backend A is healthy with `playground_count = 65000`
- **THEN** A renders as a neutral filled disc showing its total count, with no completeness segments
- **AND** an offline backend still renders outlined, muted and labelled "offline"

#### Scenario: Macro ring click zooms to backend bbox

- **WHEN** the user clicks a macro-view ring
- **THEN** the map view animates to fit the backend's bbox with standard padding
- **AND** the zoom lands in the cluster or polygon tier (depending on bbox size — centroid tier was dropped in P1's two-tier pivot)
- **AND** a tier fetch is issued to (only) that backend after the moveend debounce
