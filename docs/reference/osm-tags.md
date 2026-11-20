# OSM Tags spieli Reads

Which OpenStreetMap tags change what spieli shows, and how. This is the contract between mappers and the map: if a playground looks wrong in spieli, the tags below are what to check. All rules are implemented in `importer/api.sql` (the `playground_stats` view), some mirrored in the frontend; a change to a rule changes this page.

Why the rules are what they are is explained elsewhere: [Mapping detail](completeness.md), [User Guide → Wheelchair accessibility](../user-guide.md#wheelchair-accessibility).

## Playgrounds and what belongs to them

| What | Tag | Notes |
|---|---|---|
| A playground | `leisure=playground`, as an area or a node | A node is treated as a circle of 5 m radius, so only equipment within 5 m of it counts — map the area where you can |
| Its equipment | any object whose geometry intersects the playground area | Points inside, or ways and areas overlapping it |
| Trees | `natural=tree` nodes and `natural=tree_row` ways around the playground | Drawn when the playground is open; its tree count uses `natural=tree` within 15 m of the area |
| A fence around it | see *Fenced* below | |
| A pitch outside any playground | `leisure=pitch` not intersecting a playground area | Shown on the *Sports pitches (outside playgrounds)* layer |

What each device, fitness station and pitch is called and how it is grouped: [Equipment Types](equipment.md).

## Mapping detail

Two criteria, each met by **any one** qualifying tag:

| Criterion | Met when |
|---|---|
| **Play equipment** | Inside the area there is an object tagged `playground=*`, or a `leisure=pitch` with `sport=soccer`, `basketball`/`streetball` or `table_tennis` |
| **Info** | The playground area carries `opening_hours`, `surface`, or `access` with a value other than `yes` |

Both → *detailed*, one → *basic*, neither → *no details yet*. Not counted: benches, shelters and picnic tables (`amenity=bench`, `amenity=shelter`, `leisure=picnic_table`), and photos.

## Who may use it

From `access` on the playground area:

| `access` | spieli shows | Hidden by *Public only* | Hidden by *No private ones* |
|---|---|---|---|
| unset, `yes`, anything else | public | no | no |
| `customers` | for customers & guests only (cup badge) | yes | no |
| `private`, `no` | private (grey pin, lock) | yes | yes |

## Filters

| Filter | Matches when |
|---|---|
| Water playground | A device inside has a `playground` value containing `water`, or `playground=splash_pad` / `pump` |
| Baby-friendly | A device inside has `baby=yes`, or is `playground=baby_swing`, `basketswing`, `sandpit` or `springy`, or carries `capacity:baby` |
| Toddler-friendly | A device inside has `provided_for:toddler=yes`, or is `playground=basketswing` |
| Wheelchair-friendly | A **play device** (`playground=*`) inside carries `wheelchair=yes`, `limited` or `designated`; a `playground=sandpit` counts only with `wheelchair=yes`. The area's own `wheelchair` tag, benches and pitches do not count. If devices carry `wheelchair` tags but none qualifies, the panel says *No wheelchair equipment*; if none carries one, it says nothing |
| With bench | `amenity=bench` inside |
| With picnic table | `leisure=picnic_table` inside |
| With shelter | `amenity=shelter` inside |
| Table tennis table | `leisure=pitch` + `sport=table_tennis` inside |
| With football pitch | `leisure=pitch` + `sport=soccer` inside |
| Basketball court | `leisure=pitch` + `sport=basketball` or `streetball` inside |
| Fenced | The area has `enclosed=yes` or `barrier=fence`, **or** separately mapped `barrier=fence` ways run within 4 m of at least 75 % of its outline |
| Dogs allowed | `dog=yes` on the area |
| Themed | An allowlisted `playground:theme` on the area or on a device inside (see below) |
| With shade | `shade=yes` on the area (`shade=no` shows *No shade* in the panel; untagged shows nothing) |
| Lit at night | `lit` on the area reads as lit (see below) |

Values separated by `;` are split for `sport` and `playground:theme`.

### Lighting (`lit`)

Read case-insensitively, on playgrounds and on standalone pitches alike:

| Value | Read as |
|---|---|
| `yes`, `24/7`, `automatic`, `limited`, `interval` | lit |
| any value containing a digit, `sunset` or `sunrise` (e.g. `sunset-22:00`) | lit |
| `no`, `disused` | not lit |
| unset, or anything else | unknown — shown as nothing |

### Themes (`playground:theme`)

Only these values count: `ship`, `castle`, `spiderweb`, `water`, `adventure`, `rocket`, `dragon`, `octopus`, `circus`. Others — including the shape of a single spring rider (`horse`, `duck`, …) — are ignored. On the area they produce a banner in the panel; on a device, a symbol next to it.

## Photos

The camera marker on the map, and the panel's photo section, come from tags on the playground:

| Tag | Shown as |
|---|---|
| `panoramax`, `panoramax:*` | street-level photos (Panoramax) |
| `wikimedia_commons` | Commons gallery (a file or a category) |
| `image` pointing at a Wikimedia/Wikipedia **file** (an `upload.` URL or an image file extension) | Commons gallery |

An `image` link to anywhere else, or to a wiki *page*, is ignored. Photos are not part of mapping detail.

## Region boundary

The region of a data-node is the OSM relation in `OSM_RELATION_ID` (usually a `boundary=administrative` relation). It is used to cut the region out of the extract and for the region's name and outline in `get_meta`; playgrounds are not filtered against the boundary afterwards.
