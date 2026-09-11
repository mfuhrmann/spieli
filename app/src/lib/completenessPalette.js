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
// Ordering WAS by visual weight: `complete` was the brightest, most saturated
// green (#4ade80), so the map drew the eye to well-mapped playgrounds rather
// than to the middle state. That does not survive the basemap.
//
// `base` is drawn OPAQUE — cluster and macro ring arcs. Against the
// OpenFreeMap Bright style the app now ships (desaturated, every landcover
// surface between L* 87 and L* 96), #4ade80 measured 1.59:1 on the basemap
// background, 1.35:1 over grass and 1.06:1 over water, against a 3:1 floor
// for a graphical object. It also sat at 1.74:1 against the white separator
// stroke the ring renderer draws between arcs, so the segment boundaries
// disappeared along with the arc. The brightest colour in the ramp was the
// least visible thing on the map — the intent inverted.
//
// On a near-light ground "brighter" and "≥ 3:1" pull in opposite directions,
// so this cannot be fixed by retuning one hex: a search of the green space
// returns nothing above 3:1 lighter than L* 31, which is darker than `partial`
// was. The ramp therefore moves down a step — `complete` takes the green-700
// that `partial` held, `partial` drops to a near-black green:
//
//     complete  #4ade80 → #15803d    worst-case contrast 1.06 → 3.06
//     partial   #15803d → #052e16    worst-case contrast 3.06 → 9.10
//
// Both greens now clear 3:1 on every basemap surface except `complete` over
// water, which is 3.06 and rare under a playground polygon.
//
// COST, recorded rather than solved — pick this up before merge:
//   1. The ramp has lost its bright end. `complete` no longer pulls the eye by
//      brightness, only by hue against slate. If that pull matters more than
//      the contrast floor, the real fix is a thin dark casing on the arcs in
//      stackedRingRenderer, which frees the palette to be bright again.
//   2. `complete` (L* 47) and `missing` (L* 48) are now near-identical in
//      lightness, separated by hue alone, so deuteranopic and protanopic
//      viewers still cannot recover the ordering. The trade-off this comment
//      used to describe has moved, not gone.
//   3. `base` moved but `fill` did not — `complete` polygons are still mint
//      while `complete` rings are green-700. The fills measured well over this
//      basemap (ΔE 19.3–20.9) so there was no contrast reason to move them,
//      but the two surfaces now disagree and must be reconciled.
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
        base:   '#15803d',
        fill:   'rgba(74, 222, 128, 0.28)',
        stroke: '#15803d',
        hatch:  { stroke: 'rgba(22, 163, 74, 0.55)',  bg: 'rgba(74, 222, 128, 0.08)' },
    },
    partial: {
        base:   '#052e16',
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
