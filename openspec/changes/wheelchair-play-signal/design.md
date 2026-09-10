## Context

`playground_stats` derives per-playground booleans in the `equip_stats` CTE (`importer/api.sql:208-245`) by aggregating over `public.playground_equipment_src` — a view covering `playground=*` objects, pitches, benches, shelters and picnic tables across `planet_osm_point`, `_polygon` and `_line`. `for_wheelchair` lives there at `:237-239`.

Measurements below are from the running Fulda instance: 731 playgrounds, whose wheelchair tagging is concentrated in a 0.55°-wide cluster around 9.67/50.55 and is, per the maintainer, largely their own survey work. Treat the absolute counts as one region's density, not as a global rate; the *ratios* between the states are what the design rests on.

Device-level tags on `playground=*` objects:

| value | devices |
|---|---|
| `no` | 602 |
| `limited` | 34 |
| `yes` | 5 |
| `designated` | 0 |

Playground-level outcome of the rule adopted here: **18** `'yes'`, **58** `'no'`, **655** `NULL`.

## Goals / Non-Goals

**Goals:**
- Answer the question the audience actually asks: is there equipment here a wheelchair-using child can use?
- Make the three surfaces (hover, panel, filter) agree by construction.
- Preserve the surveyed-negative state instead of collapsing it into "unknown".
- Keep the wire shape and the filter key stable so mixed-version federation is unaffected.

**Non-Goals:**
- Modelling site-level physical access.
- Per-device accessibility display.
- Any change to `completeness` or the mapping-detail buckets.

## Decisions

**D1 — Equipment only; the area tag is not an input.**
Site access is close to non-discriminating: nearly every playground is enterable with a wheelchair and an accompanying adult, and the age range served (roughly 0–14) makes the unaccompanied self-transferring user an edge case rather than the norm. The area tag therefore separates almost nothing, while the equipment tag separates exactly the thing that matters.

The data agrees. 59 playgrounds would qualify on the area tag alone with no suitable equipment anywhere inside them. Admitting them takes the filter from 18 to 74 while making the badge mean "you can probably get in", which is not a claim worth a badge.

**D2 — `limited` counts as `'yes'`.**
On the objects that actually carry it here — spring riders, seesaws, swings, roundabouts, a trampoline — `limited` means "usable with assistance". Assistance is the assumed condition for this age group, so treating `limited` as a miss would discard the majority of the positive signal (34 `limited` against 5 `yes`) for a distinction the audience does not experience as one.

This is the one place where #728's instinct is adopted wholesale.

**D3 — `'no'` is a state, not an absence.**
602 devices carry `wheelchair=no`. Discarding that means "no badge" answers two opposite questions identically: *someone checked and there is nothing suitable* (58 playgrounds) versus *nobody ever checked* (655). For a parent planning a trip the first saves the journey and the second does not. The cost of keeping it is one `BOOL_OR` and one panel line.

**D4 — Only `playground=*` objects can produce `'yes'`; pitches and furniture cannot.**
The current predicate's `NOT (e.tags ? 'playground')` branch lets any object in the equipment view carry the flag. Two of the six currently-flagged playgrounds qualify through a `teenshelter` and a `pitch`. A wheelchair-accessible shelter is not something a child plays on, and this is the same class of false signal that removed the derived flags from `has_equipment` in `rework-mapping-detail-rating` (#776).

Pitches are the genuinely arguable exclusion: a wheelchair-accessible basketball court is real play infrastructure. They are left out because `leisure=pitch` accessibility usually describes court access rather than adapted play, and because no pitch in this dataset would change state. Revisit if a region shows meaningful `wheelchair` tagging on pitches.

**D5 — `playground=sandpit` stays excluded from `'yes'`, for the same reason as D1.**
Inherited from the existing predicate, where it arrived unexplained in 6ec3f98 (#67) with the original filter panel. It now has a rationale, and it is the same one: an accompanying adult can lift a child into essentially any sandpit, so `wheelchair` on a sandpit is true nearly everywhere and therefore separates nothing. Admitting it would repeat the area-tag mistake at device level.

Purpose-built roll-under sand tables genuinely are an inclusive feature and would be a real signal — but the tagging cannot express the difference. None of the 40 wheelchair-tagged sandpits in this dataset carries a `height` or description tag, so a raised table and a hole in the ground are indistinguishable to the query. Revisit if that changes.

Measured impact of the exclusion: 6 playgrounds have a positively tagged sandpit, 3 of which already reach `'yes'` through other equipment. Dropping the exclusion would move exactly 3 playgrounds from `'no'` to `'yes'` (18 → 21). Confirmed with the maintainer who surveyed them.

**D6 — Redefine `for_wheelchair` rather than replace it.**
`for_wheelchair` appears in `get_playgrounds_bbox`, `get_playground`, `get_playgrounds`, `get_playground_centroids` and `filterStore.wheelchair`, and hub mode merges backends of mixed versions. Keeping the name, the type and the position means an un-upgraded backend still answers the filter — with the old, broader meaning, which is a semantic skew rather than a break. That is the same trade `rework-mapping-detail-rating` accepts for the completeness buckets, and it is the cheaper side of the trade in both cases.

`wheelchair_play` is added as a new field for the tri-state; consumers that only need the boolean never have to know about it.

**D7 — Tri-state as a text column, not two booleans.**
`'yes' | 'no' | NULL` in one column makes the mutual exclusivity structural. Two booleans (`wheelchair_play`, `wheelchair_surveyed`) permit the incoherent combination `play=true, surveyed=false` and push the invariant into every consumer.

**D8 — The tri-state does not enter the cluster or macro aggregates.**
`get_playground_clusters` and the macro rings aggregate mapping-detail buckets. Adding an accessibility dimension there would change the bucket tuple across `clusterStyle.js`, `macroRingStyle.js` and both hub aggregates, for a signal that is only actionable once a specific playground is in view.

## Risks / Trade-offs

- [One region, one surveyor] The negative data is concentrated in Fulda and is largely one person's work. In a region without it, `'no'` is simply empty and the change degrades to "positive or unknown" — no worse than today, and the `'no'` presentation costs nothing when unused. → Stated in the user documentation so the empty state is not read as "nothing here is accessible".
- [18 matches is a thin filter] Honest but sparse. That is a data-coverage problem, not a rule problem, and the honest presentation is what makes the contribution prompt legitimate. → `NULL` state links into `DataContributionModal`, consistent with the "no details yet" framing in `rework-mapping-detail-rating`.
- [Semantic skew in mixed federation] An un-upgraded backend answers the wheelchair filter with the old predicate. Results are a superset, never a crash. → Accepted, matching D6.
- [Dropping the area tag loses information some users wanted] Anyone filtering today on the hover icon's meaning ("area mapped accessible") loses it. It was never wired to the filter, so no filter behaviour regresses — only the icon becomes stricter. → Documented in the user guide.
- [`limited` may overclaim for a specific child] "Usable with assistance" spans a wide range of ability. → The user guide says plainly that the signal reflects what mappers recorded and is not a substitute for checking.

## Testing

- SQL fixture: playground with one `playground=swing` + `wheelchair=limited` → `'yes'`; playground with only `wheelchair=no` devices → `'no'`; playground with untagged devices → `NULL`; playground with a `wheelchair=yes` bench and no tagged play device → `NULL`; playground with area `wheelchair=yes` and no tagged device → `NULL`.
- Assert `for_wheelchair = (wheelchair_play = 'yes')` holds for every row.
- Frontend: hover icon appears only when `for_wheelchair`; panel shows the badge on `'yes'`, the explicit line on `'no'`, nothing on `NULL`.
- Manual: filter for wheelchair, hover each result, confirm every result shows the icon — the check that fails today for 67 of 69 icons.

## Migration Plan

`make db-apply` rebuilds the matview; no re-import. Operators see the wheelchair filter return a different result set (6 → 18 on Fulda) — noted in the PR body for the release notes. No configuration, no data migration.
