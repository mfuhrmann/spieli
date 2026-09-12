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
// for a graphical object. The brightest colour in the ramp was the least
// visible thing on the map — the intent inverted.
//
// (An earlier version of this note also cited 1.74:1 against "the white
// separator stroke the ring renderer draws between arcs". No such stroke
// exists: neither drawStackedRing nor renderHealthyMacroRing draws one, and
// the only white stroke in either renderer is on the single-child dot. The
// basemap measurements above are the whole case.)
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
// COST, recorded rather than solved:
//   1. The ramp has lost its bright end. `complete` no longer pulls the eye by
//      brightness, only by hue against slate. If that pull matters more than
//      the contrast floor, the real fix is a thin dark casing on the arcs in
//      stackedRingRenderer, which frees the palette to be bright again.
//   2. `complete` (L* 47) and `missing` (L* 48) are now near-identical in
//      lightness, separated by hue alone, so deuteranopic and protanopic
//      viewers still cannot recover the ordering. The trade-off this comment
//      used to describe has moved, not gone.
//   3. `missing` measures 2.91:1 over water — still under the 3:1 floor the
//      greens were moved to clear.
//
// (A fourth — `base` moving while `fill` stayed behind — is fixed: every
// surface colour is now derived from one `base` per bucket, below, so the two
// cannot drift apart again.)
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
/**
 * Per-bucket identity colour. Everything else is derived from it, so `base`
 * and the polygon fill cannot drift apart again.
 *
 * They had. When the ramp moved down a step to clear the contrast floor, only
 * `base` moved: `complete` rings became green-700 while `complete` polygons
 * stayed mint, so one playground changed colour crossing clusterMaxZoom. Worse,
 * `partial`'s hand-written fill was built from #15803d — the hex that is now
 * `complete`'s ring — so the same colour meant "basic" as a polygon and
 * "detailed" as an arc.
 */
const BASE = {
    complete: '#15803d',
    partial:  '#052e16',
    missing:  '#64748b',
};

/** Outline colour. Not derived: it is chosen for contrast against the fill. */
const STROKE = {
    complete: '#15803d',
    partial:  '#14532d',
    missing:  '#334155',
};

function withAlpha(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// One alpha for all three buckets, not three hand-tuned ones.
//
// Measured over the basemap background (#f8f4f0), pairwise CIE dE between the
// three composited fills:
//
//   today, hand-written fills          complete-partial 10.6   partial-missing 12.7
//   derived, today's mixed alphas      complete-partial 11.5   partial-missing  8.0
//   derived, uniform 0.30              complete-partial 12.0   partial-missing 11.8
//   derived, uniform 0.38              complete-partial 15.5   partial-missing 15.5
//
// Mixed alphas would have regressed partial-vs-missing to 8.0. 0.38 separates
// best but puts real weight on a layer that is 67% `missing` in Fulda and may
// yet become opt-in, so 0.30 takes parity with today at the lower weight.
//
// Note these are all far below the ring separation (complete-vs-partial is
// dE 42 as opaque arcs). Translucent fills over a near-white ground wash
// toward each other; the polygon tier is inherently a weaker signal than the
// legend, which shows `base`, implies.
const FILL_ALPHA  = 0.30;
const HATCH_LINE  = 0.55;
const HATCH_WASH  = 0.08;

export const COMPLETENESS_PALETTE = Object.fromEntries(
    Object.entries(BASE).map(([key, base]) => [key, {
        base,
        fill:   withAlpha(base, FILL_ALPHA),
        stroke: STROKE[key],
        hatch:  { stroke: withAlpha(base, HATCH_LINE), bg: withAlpha(base, HATCH_WASH) },
    }])
);

/** Bucket keys in ramp order (most mapped → least). Drives legend order. */
export const COMPLETENESS_ORDER = ['complete', 'partial', 'missing'];

/** Base colour per bucket — the shape clusterStyle/macroRingStyle want. */
export const COMPLETENESS_BASE = {
    complete: COMPLETENESS_PALETTE.complete.base,
    partial:  COMPLETENESS_PALETTE.partial.base,
    missing:  COMPLETENESS_PALETTE.missing.base,
};
