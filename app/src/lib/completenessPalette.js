// Single source of truth for the mapping-detail (completeness) palette.
//
// Every surface that renders the three buckets reads from here — playground
// polygons (vectorStyles.js), cluster ring segments (clusterStyle.js), hub
// macro ring segments (macroRingStyle.js) and the legend
// (CompletenessLegend.svelte). Before this module the same colours were
// written out in all four places with a comment asking the reader to keep
// them in sync by hand.
//
// The scale is a SEQUENTIAL single-hue ramp — dark green → mid green →
// neutral grey — not a traffic light. A diverging red/amber/green scale
// encodes "good vs bad about a midpoint", which reads as a verdict on the
// playground. A sequential ramp encodes "more vs less", which is what the
// value actually measures: how much of this playground has been mapped.
//
// The ramp varies primarily in LIGHTNESS, so it survives deuteranopia and
// protanopia. The green/amber/red scale it replaces did not.
//
// Neutral grey for the zero case reads as "nothing here yet" rather than
// "bad playground", which is the state we want to invite contributions for.
//
// Bucket keys stay `complete` / `partial` / `missing` — those are the wire
// and storage identifiers (see get_playground_clusters, get_meta,
// playground_stats). Their user-facing labels are "detailed" / "basic" /
// "not mapped yet" and live in locales/*.json under `mappingDetail.*`.

/**
 * Base colours, one per bucket.
 *
 * `base`   — the swatch colour. Legend chips, cluster ring segments and macro
 *            ring segments all use this, so the legend always equals the map.
 * `fill`   — polygon fill, the base at low alpha.
 * `stroke` — polygon outline.
 * `hatch`  — access-restricted polygons: diagonal hatch stroke over a faint
 *            background wash, both derived from the base.
 */
export const COMPLETENESS_PALETTE = {
    complete: {
        base:   '#15803d',
        fill:   'rgba(21, 128, 61, 0.22)',
        stroke: '#14532d',
        hatch:  { stroke: 'rgba(21, 128, 61, 0.55)',  bg: 'rgba(21, 128, 61, 0.08)' },
    },
    partial: {
        base:   '#4ade80',
        fill:   'rgba(74, 222, 128, 0.22)',
        stroke: '#15803d',
        hatch:  { stroke: 'rgba(22, 163, 74, 0.55)',  bg: 'rgba(74, 222, 128, 0.08)' },
    },
    missing: {
        base:   '#9ca3af',
        fill:   'rgba(156, 163, 175, 0.18)',
        stroke: '#4b5563',
        hatch:  { stroke: 'rgba(107, 114, 128, 0.55)', bg: 'rgba(156, 163, 175, 0.06)' },
    },
};

/** Bucket keys in ramp order (most mapped → least). Drives legend order. */
export const COMPLETENESS_ORDER = ['complete', 'partial', 'missing'];

/** Base colour per bucket — the shape clusterStyle/macroRingStyle want. */
export const COMPLETENESS_BASE = {
    complete: COMPLETENESS_PALETTE.complete.base,
    partial:  COMPLETENESS_PALETTE.partial.base,
    missing:  COMPLETENESS_PALETTE.missing.base,
};
