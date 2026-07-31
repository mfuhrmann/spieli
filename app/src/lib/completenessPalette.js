// Single source of truth for the mapping-detail (completeness) palette.
//
// Every surface that renders the three buckets reads from here — playground
// polygons (vectorStyles.js), cluster ring segments (clusterStyle.js), hub
// macro ring segments (macroRingStyle.js) and the legend
// (CompletenessLegend.svelte). Before this module the same colours were
// written out in all four places with a comment asking the reader to keep
// them in sync by hand.
//
// The scale is a single-hue green ramp ending in a cool slate — not a traffic
// light. A diverging red/amber/green scale encodes "good vs bad about a
// midpoint", which reads as a verdict on the playground. This one encodes
// "more vs less", which is what the value actually measures: how much of this
// playground has been mapped.
//
// Ordering is by VISUAL WEIGHT, not by lightness: the brightest, most
// saturated green marks the most detailed playgrounds, so the map draws the
// eye to them rather than to the middle state. An earlier revision ran
// dark → light instead, which was monotonic in lightness but made the middle
// state the loudest thing on the screen.
//
// Known trade-off: because `partial` is darker than both its neighbours, the
// ramp is not monotonic in lightness, so viewers with deuteranopia or
// protanopia cannot recover the full ordering from lightness alone. They can
// still separate "green of some kind" from "slate", which is the distinction
// that carries the contribution call to action.
//
// The zero case is a cool slate blue-grey, not a plain grey. A neutral colour
// is right — it reads as "nothing here yet" rather than "bad playground",
// which is the state we want to invite contributions for — but plain grey at
// low alpha disappeared into the basemap, which renders residential landuse
// (#e0dfdf) and buildings (#d9d0c9) in warm greys of its own. The slight blue
// cast separates it from those without making it look like a judgement.
//
// This bucket covers most of the map — 625 of 926 playgrounds in Fulda — so it
// has to stay quiet while remaining findable. Its fill sits at 0.24 with a
// dark stroke: the outline carries "there is a playground here", the fill
// stays out of the way.
//
// Bucket keys stay `complete` / `partial` / `missing` — those are the wire
// and storage identifiers (see get_playground_clusters, get_meta,
// playground_stats). Their user-facing labels are "detailed" / "basic" /
// "no details yet" and live in locales/*.json under `mappingDetail.*`.

/**
 * Base colours, one per bucket.
 *
 * `base`   — the bucket's identity colour, drawn opaque.
 * `fill`   — the base at low alpha, for shapes laid over the basemap.
 * `stroke` — outline / border.
 * `hatch`  — access-restricted polygons: diagonal hatch stroke over a faint
 *            background wash, both derived from the base.
 *
 * WHICH FIELD GOES WHERE — get this wrong and two surfaces showing the same
 * bucket render in visibly different colours:
 *
 *   surface                        field    why
 *   ─────────────────────────────  ───────  ──────────────────────────────────
 *   cluster ring segments          base     opaque arcs on the map
 *   macro ring segments            base     same
 *   legend swatches                base     must equal the rings beside them
 *   hub drawer dots + bar          base     opaque
 *   playground polygons            fill     translucent over the basemap
 *   panel badge background         fill     dark text must stay readable —
 *                                           the badge's dot uses `base`
 *
 * Rule of thumb: anything opaque uses `base`; only shapes the basemap shows
 * through, or backgrounds carrying text, use `fill`.
 */
export const COMPLETENESS_PALETTE = {
    complete: {
        base:   '#4ade80',
        fill:   'rgba(74, 222, 128, 0.28)',
        stroke: '#15803d',
        hatch:  { stroke: 'rgba(22, 163, 74, 0.55)',  bg: 'rgba(74, 222, 128, 0.08)' },
    },
    partial: {
        base:   '#15803d',
        fill:   'rgba(21, 128, 61, 0.22)',
        stroke: '#14532d',
        hatch:  { stroke: 'rgba(21, 128, 61, 0.55)',  bg: 'rgba(21, 128, 61, 0.08)' },
    },
    missing: {
        base:   '#64748b',
        fill:   'rgba(100, 116, 139, 0.24)',
        stroke: '#334155',
        hatch:  { stroke: 'rgba(51, 65, 85, 0.55)',   bg: 'rgba(100, 116, 139, 0.08)' },
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
