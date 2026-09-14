## Why

The wheelchair signal answers the wrong question, and it answers it in three mutually inconsistent ways.

**What parents actually need.** A parent of a wheelchair-using child wants to know whether a playground has *equipment their child can use*. Whether the site is enterable is close to information-free: almost any playground can be entered with a wheelchair given some help, and playgrounds serve roughly ages 0–14, so the case of an unaccompanied, physically strong teenage wheelchair user transferring themselves onto equipment is not the realistic one. Accompaniment is the norm. The site-level access tag therefore carries almost no decision value; the equipment-level tag carries all of it.

**What the code does today.** Three surfaces, no shared definition:

| Surface | Source | Meaning |
|---|---|---|
| Hover icon (`HoverPreview.svelte:18`) | raw `attr.wheelchair`, `yes\|limited` | playground **area** tag only |
| Filter (`stores/filters.js:41`) | `for_wheelchair` | **equipment** tag only, `yes` only |
| Panel badge | — | does not exist |

Measured on the local Fulda dataset (731 playgrounds): 69 playgrounds show the hover icon, 6 match the filter, and **2 do both**. 97% of the icons the user sees correspond to nothing the filter can find, and the filter returns results that mostly show no icon.

**The equipment predicate is also too loose.** `api.sql:237-239` reads

```sql
BOOL_OR(e.tags->'wheelchair' = 'yes'
        AND (NOT (e.tags ? 'playground') OR e.tags->'playground' != 'sandpit'))
```

The `NOT (e.tags ? 'playground')` branch means any object in `playground_equipment_src` — a bench, a shelter, a picnic table, a pitch — sets the flag. Of the 6 playgrounds currently flagged, one is carried by a `teenshelter` and one by a `pitch`. A wheelchair-accessible shelter is not equipment a child can play on.

**The negative data is the largest signal and is discarded entirely.** 602 playground devices in this dataset carry `wheelchair=no`, against 34 `limited` and 5 `yes`. Someone surveyed them. Today "no badge" conflates *surveyed, nothing suitable* with *nobody ever looked*, which for this audience are opposite answers.

Related: [#727](https://github.com/mfuhrmann/spieli/issues/727), [#728](https://github.com/mfuhrmann/spieli/issues/728), [#777](https://github.com/mfuhrmann/spieli/issues/777)

## What Changes

**New tri-state column** `wheelchair_play` on `playground_stats` (`importer/api.sql`), derived from contained play devices only:

```
'yes'  ← some object tagged playground=* (excluding playground=sandpit) carries
         wheelchair ∈ {yes, limited, designated}
'no'   ← not 'yes', and some object tagged playground=* carries any wheelchair value
NULL   ← no play device carries a wheelchair tag at all
```

`limited` counts as `yes`: on a spring rider or a seesaw it means "transfer with assistance", which is the realistic mode of use for this audience. The playground **area** tag is not an input.

**`for_wheelchair` is redefined** as `wheelchair_play = 'yes'`. The column name, the wire field and the `filterStore.wheelchair` key are unchanged, so the filter, the hub payloads and mixed-version federation keep working.

**Surfaces are unified.** All three read the same server value:
- Hover icon shows only on `'yes'` — closes #777 by giving both surfaces one source rather than moving the disagreement.
- `PlaygroundPanel` gains a badge on `'yes'` and an explicit line on `'no'` ("no wheelchair-suitable equipment recorded"). `NULL` renders nothing.
- Filter matches `'yes'`.

**User documentation.** `docs/user-guide.md` gains a section explaining what the signal means, what it deliberately does not mean, and why absence of a badge is not evidence of inaccessibility.

## Capabilities

### New Capabilities

- `wheelchair-play-signal`: how a playground's suitability for wheelchair-using children is derived from equipment tags, how the surveyed-negative state is distinguished from the unknown state, and how the three states are presented across map, hover, panel and filter.

### Modified Capabilities

*(none — no existing spec-level requirements change; `for_wheelchair` keeps its name, type and position in every payload)*

## Impact

**Database** (`requires-schema-update` — `make db-apply`, no re-import):
- `importer/api.sql`: `equip_stats` gains the two aggregates; `playground_stats` gains `wheelchair_play`; `for_wheelchair` is redefined in terms of it.
- Payload field added to `get_playgrounds_bbox`, `get_playground`, and the deprecated `get_playgrounds`. Not added to the cluster or centroid RPCs — the tri-state is a per-playground detail, not an aggregate.

**Frontend**:
- `HoverPreview.svelte:18` — read `attr.for_wheelchair` instead of the raw area tag.
- `PlaygroundPanel.svelte` — badge on `'yes'`, explicit line on `'no'`.
- `stores/filters.js` — unchanged.

**i18n**: two new strings in `locales/en.json` and `locales/de.json` only.

**Docs**: `docs/user-guide.md` (new section — explicitly requested), `docs/contributing/import-pipeline.md` (derived-flag table), `docs/reference/api.md` (new field), `CLAUDE.md`.

**Bucket movement**: the filter goes from 6 matches to 18 on the Fulda dataset. Nothing else moves — `wheelchair_play` is not an input to `completeness`.

## Relationship to #728

PR #728 answers #727 literally ("on a playground and/or on a device") by widening `for_wheelchair` to include the area tag and `limited`/`designated`. Measured, that takes the filter from 6 to 74 — but 59 of the 74 have no suitable equipment at all and qualify solely through the area tag. Those are exactly the matches that fail the domain test above.

#728's other three moves are correct and are kept here: accepting `limited`, accepting `designated`, and adding a panel badge. What this change rejects is only the area-tag disjunct. The PR should be reworked rather than closed — its instinct that the filter was unusably narrow is right, and this change fixes that from 6 to 18 by a route that does not overclaim.

## Out of Scope

- **Per-device accessibility in the panel.** 27 playgrounds in this dataset have an accessible-tagged area while containing at least one device explicitly tagged `wheelchair=no`. Representing that faithfully needs an accessibility column in the equipment list, which is a separate piece of UI work.
- **The area `wheelchair` tag as a displayed signal.** It is dropped from the accessibility signal rather than relabelled. If it is ever surfaced again it must be named for what it measures ("area mapped as accessible"), not as a wheelchair badge.
- **Pitches.** `leisure=pitch` objects carry no `playground=*` tag and so cannot reach `'yes'`, even when tagged `wheelchair=yes`. Deliberate for now — see design D4.
- **`wheelchair=no` on the playground area.** 15 playgrounds carry it, and no playground in this dataset combines it with a positive device, so no override rule is needed yet. Revisit if that combination ever appears.
