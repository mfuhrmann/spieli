# Mapping detail (Erfasste Details)

Every playground is assigned one of three mapping-detail states, based on how much of it has been mapped in OpenStreetMap. The state describes **the map, not the playground** — a playground in the lowest state is not a bad playground, it is one nobody has written up yet.

**Mapping detail is opt-in (#924).** The default map is the neutral "finder" view — emerald cluster discs and pins, no completeness colours, no legend. Visitors switch mapping detail on with the control next to the Info and Filter buttons; the choice is remembered, and `?detail=1|0` overrides it for one page load. While it is off, the mapping-detail filters are ignored everywhere and come back as they were when it is switched on again.

How the rule is implemented and kept in sync between frontend and database: [Import Pipeline → Mapping detail rule](../contributing/import-pipeline.md#mapping-detail-rule). Store, palette and locale keys: [Frontend Guide → The finder view](../contributing/frontend-guide.md#the-finder-view-mapping-detail-off).

## Criteria

A playground is judged on two things: whether its **play equipment** is mapped (any play device inside it, or a ball court), and whether it has **any detail** — its surface, opening hours, or a restricted access. One qualifying item is enough on each side; a playground needs only one of the three details, not all of them. The exact tags: [OSM Tags spieli Reads → Mapping detail](osm-tags.md#mapping-detail).

### What does not count as equipment

**Street furniture** — `amenity=bench`, `amenity=shelter`, `leisure=picnic_table` — is excluded. These are frequently mapped inside a playground area by someone who never mapped the play equipment itself, so counting them lifted playgrounds that have nothing to play on. In Fulda, 63 of 221 playgrounds registering as "has equipment" were carried by furniture alone.

Pitches *do* count: a bolzplatz or basketball hoop is real play infrastructure, merely tagged `leisure=pitch` rather than `playground=*`.

**Derived flags** — `is_water`, `for_baby`, `for_toddler`, `for_wheelchair` — are also excluded. A genuine playground device already satisfies the `playground=*` test, so they add nothing there; on their own they can be set by a bench tagged `wheelchair=yes`, which is the same false signal ([#776](https://github.com/mfuhrmann/spieli/issues/776)). They remain available as filter flags, they just do not feed the rating.

## States

| State (identifier) | Label | Rule |
|---|---|---|
| `complete` | detailed | Both criteria satisfied |
| `partial` | basic | Exactly one satisfied |
| `missing` | no details yet | Neither satisfied |

The names in the first column are what the data carries internally; visitors only ever see the labels. How the three states are coloured is described in [Colours](#colours) below; the legend, the map and the panel all use the same colours.

## Hints in the panel

With mapping detail on, the playground panel shows a highlighted hint under the badge naming what is missing (#919). It is derived from the same rule as the badge, so the two cannot disagree:

| Badge | Missing | Hint |
|---|---|---|
| no details yet | both | Not mapped yet: play equipment, and the surface or opening hours (if it has any). |
| basic | equipment | Not mapped yet: the play equipment. |
| basic | info | Not mapped yet: the surface or opening hours (if it has any). |
| detailed | – | *(none)* |

The hint carries no link of its own: the panel's MapComplete links further down already open this playground. The list is closed on purpose: only surface and opening hours are named, because a vaguer "general details" would send mappers to `name` or `operator`, which do not count. Surface comes first because it can be checked on site and is unambiguous; opening hours carry "if it has any", since many playgrounds legitimately have none and the hint must not invite invented ones. Restricted access also counts but is not named — it describes the place, it is not something to add. By the rule's design, once one device is mapped there is no equipment hint even if more are missing, and "detailed" does not mean complete.

## Photos are not a criterion

A photo (`panoramax` / `panoramax:*`, `wikimedia_commons`, or an `image` link on a Wikimedia/Wikipedia host) is **not** an input to the state.

It used to be: the old rule required all three of photo, equipment and info for the top state. Photo tags are rare in OSM, so that gated entire regions out of it — Hessen sat at 87 of 8802 playgrounds (1.0%) in the top bucket, while a well-photographed region reached 8.0% under the identical rule. A playground with twelve mapped devices plus surface and access stayed in the middle state indefinitely because nobody had uploaded a picture, which judged the mapper rather than the map ([#733](https://github.com/mfuhrmann/spieli/issues/733)).

Photo availability is still surfaced, as an **additive marker**: a camera glyph drawn on the playground. Having a photo is a bonus; not having one is not a penalty.

The marker lives on the map only. There is no photo badge in the detail panel — by the time the panel is open the photos themselves are visible in it, so a chip announcing them would be redundant. On the map it is the only way to see which playgrounds have pictures without opening each one.

An off-Wikimedia `image` URL does not count — the gallery cannot render it.

## Colours

The palette is a **single-hue green ramp ending in a cool slate**, not a traffic light. A diverging red/amber/green scale encodes "good versus bad", which reads as a verdict on the playground. This one encodes "more versus less", which is what the value measures.

Ordering is by **lightness, and monotonic**: `complete` L\* 79, `partial` L\* 47, `missing` L\* 36. The brightest step marks the best-mapped playgrounds, and a viewer with deuteranopia or protanopia can recover the ordering without relying on the green-versus-slate hue split.

The zero case is a cool slate rather than a plain grey: neutral enough to read as "nothing here yet" instead of "bad", but with enough blue cast to stay off the basemap's own warm greys (residential `#e0dfdf`, buildings `#d9d0c9`), which a plain grey at low alpha disappeared into.

On the map, the coloured ring segments carry a thin dark outline. Bright green alone is too faint against the background map, so the outline carries the contrast and the colours can be chosen for their meaning. The measurements behind this are in [Frontend Guide → The mapping-detail palette](../contributing/frontend-guide.md#the-mapping-detail-palette).
