# Using the spieli Map

spieli is a free, interactive playground map based on OpenStreetMap data. This guide explains what you can do with it.

| I want to… | Go to… |
|---|---|
| Find a playground near me or in a town | [Finding playgrounds](#finding-playgrounds) |
| Show only playgrounds with something specific | [Filters](#filters) |
| Send someone a link to a playground | [Sharing a playground](#sharing-a-playground) |
| Report a playground that is missing | [Reporting a missing playground](#reporting-a-missing-playground) |

## Finding a playground

### Navigating the map

Use your mouse (desktop) or fingers (mobile) to pan and zoom. The map shows:

- **Green circles** — at lower zoom levels, nearby playgrounds are grouped into a circle showing how many there are
- **Green pins** — zoom in and every playground gets its own pin; a camera on the pin means there is a photo. A **grey pin with a lock** or a **cup** tells you who may use it — see [Who can use a playground](#who-can-use-a-playground)
- **The selected playground's outline** — once you open a playground, its area is outlined on the map

This is the default view, made for finding a place to play. If you add data to OpenStreetMap, you can switch on [mapping detail](#mapping-detail-colours) instead.

Click or tap any playground to open its detail panel.

### Finding playgrounds

**Search:** Type a place name, street, or city into the search box (top bar). The map moves to the matching location.

Suggestions appear once you have typed two characters. You can work the list entirely from the keyboard — **↓** and **↑** move through the suggestions, **Enter** jumps to the highlighted one (or runs a plain search if none is highlighted), and **Esc** closes the list without leaving the box — it also cancels a search you have typed but that has not run yet, so the list does not pop back up a moment later. Screen readers announce the list, your position in it, and whether a search is still running.

**My location:** Tap the location button to centre the map on your current position. Your position is shown as a pulsing blue dot; at high zoom a translucent circle indicates the GPS accuracy. If your browser already allows spieli to see your location, the map centres on you when it opens (unless you opened a link to a playground or a region).

> **Note:** Showing your location only works on a secure (`https://`) address and with your browser's permission. If the button does nothing, check your browser's location settings.

**Region links:** Visit a region by name in the URL — e.g. `spieli.eu/fulda` frames the map on Fulda. spieli looks the name up and shows that area; this works on every spieli map. Share these links like any other address.

### Filters

Open the filter panel to show only playgrounds that match your needs:

| Filter | Shows playgrounds that have… |
|---|---|
| Water playground | Water play equipment, such as a water pump or a splash pad |
| Baby equipment | Equipment suitable for babies |
| Toddler equipment | Equipment suitable for toddlers |
| Wheelchair-friendly | At least one piece of *play equipment* tagged wheelchair-accessible — see [Wheelchair accessibility](#wheelchair-accessibility) |
| Bench | At least one bench |
| Picnic table | At least one picnic table |
| Shelter | A covered shelter |
| Table tennis | A table tennis table |
| Football | A football pitch |
| Basketball | A basketball court |
| Fenced | A fence around the playground: recorded on the playground itself, or mapped along at least three quarters of its edge. A fence on one side only (say, towards the road) does not count |
| Dogs allowed | Dogs are permitted |
| Themed | Has a recognised theme — ship, octopus, castle, … (see [Playground themes](#playground-themes)) |
| With shade | Recorded as shaded |
| Lit at night | Recorded as lit, all night or at certain times |
| Public only | Hide playgrounds that are private or for customers only — see [Who can use a playground](#who-can-use-a-playground) |
| No private ones | Hide only private playgrounds (e.g. a kindergarten's or a school's); customers-only ones stay |

Active filters appear as chips below the search bar. Click a chip to remove that filter.

Each filter only finds what has been mapped in OpenStreetMap. Which tags it reads exactly — useful if a playground you know is missing from a filter: [OSM Tags spieli Reads](reference/osm-tags.md#filters).

#### Wheelchair accessibility

This one deserves its own explanation, because it deliberately measures something narrower than the word suggests.

**It describes the equipment, not the site.** The filter, the map hover icon and the detail panel all answer one question: *is there something here a wheelchair-using child can play on?* They do not tell you whether the site can be entered or crossed.

That is a deliberate choice. With an accompanying adult, nearly every playground can be entered with a wheelchair, and playgrounds serve roughly ages 0–14 — so the entrance rarely decides anything, while the equipment always does. A playground whose *area* is tagged as accessible but whose equipment is not will therefore **not** match this filter.

**"Usable with help" counts.** Where a piece of equipment is tagged as partially accessible (`wheelchair=limited`), spieli treats it as suitable. On the objects that actually carry that value — spring riders, seesaws, swings, roundabouts — it means a transfer with assistance, which for this age group is the ordinary way a playground gets used.

**A missing badge does not mean "not accessible".** The detail panel distinguishes three states, and only two of them are statements:

| What you see | What it means |
|---|---|
| **Wheelchair-friendly** | Someone tagged at least one device as accessible |
| **No wheelchair equipment** | Someone surveyed the equipment here and none of it is tagged accessible |
| *(nothing)* | Nobody has recorded accessibility for this playground either way — unknown, not negative |

The third row is by far the most common. Accessibility tagging is patchy in OpenStreetMap and tends to exist only where a mapper has walked the site with it in mind, so entire regions can show nothing at all. That is a gap in the map, not a finding about the playgrounds.

**Please check before relying on it.** Everything above reflects what mappers recorded. It is not a substitute for looking at the playground, and "usable with assistance" covers a wide range of ability. If you find a playground tagged wrongly — in either direction — the **Edit on MapComplete** link in the detail panel opens the playground in an editor.

### Who can use a playground

Not every playground on the map is open to everyone. spieli reads this from the playground's `access` tag in OpenStreetMap and shows it the same way on the pin, in the hover preview (desktop) and at the top of the detail panel:

| On the map | In the panel | Meaning |
|---|---|---|
| Green pin | — | Public: anyone can play here. Also the case when nothing is recorded |
| Green pin with an amber **cup** | "For customers & guests only" | Belongs to a café, a restaurant, a store or a holiday park (`access=customers`). You can use it while you are a customer there |
| **Grey** pin with a **lock** | "Private – not open to the public" | Belongs to a kindergarten, a school or a residential complex (`access=private` or `access=no`). Not open to visitors. Some are usable by a particular group, for example the people living in that housing estate; the panel's details say so when it is recorded |

Every playground is shown by default. Two filters hide the ones you can't use:

- **No private ones** hides only private playgrounds; café and store playgrounds stay.
- **Public only** hides both private and customers-only playgrounds.

Many kindergarten and school playgrounds have no `access` tag in OpenStreetMap and therefore look public. If you know better, you can add the tag in [MapComplete](https://mapcomplete.org) or any OSM editor.

### Sports pitches outside playgrounds

Enable **Sports pitches (outside playgrounds)** in the filter panel's Layers section to see sports pitches that are not part of any playground (football fields, basketball courts, skate parks, etc.).

Each pitch gets a white pin with a green rim and a symbol for its sport — football, basketball, tennis, table tennis, volleyball, skating, riding, chess, cycling, archery, athletics, or a generic flag — so pitches are easy to tell apart from the solid green playground pins.

Click or tap a pitch to open its panel — in the same place as a playground's. It shows the pitch's sports and, where they are mapped, its surface, whether it is lit (and when), whether you can just walk in (public, members, fee, booking), opening hours, basketball hoops, wheelchair access, the operator and photos, plus "Take me there", a share link and a link to add missing details in MapComplete. Nothing is shown for what has not been mapped. A shared pitch link looks like `…/#P123456` (on the all-regions map `…/#region/P123456`) and opens the map with the pitch layer switched on. Pitches appear once you zoom in to about the size of a town; when the layer is on but you are zoomed out too far, the filter panel says so.

## Looking at a playground

### Playground detail panel

Click any playground to open its detail panel. The panel shows:

- Name, operator, opening hours (when mapped)
- Surface type and size, and lighting when it is mapped (most playgrounds do not record it yet, so nothing is shown then)
- Small labels — the mapping-detail badge (only while [mapping detail](#mapping-detail-colours) is on), data age, and (when tagged) a shade pill (Shaded / No shade), baby / toddler suitability, and wheelchair-friendly equipment (see [Wheelchair accessibility](#wheelchair-accessibility))
- Theme highlight — a symbol for playgrounds with a theme, such as a ship or castle (see [Playground themes](#playground-themes))
- Equipment list — devices, pitches, benches, and their details, including each item's surface when tagged
- Photos — from Wikimedia Commons when the playground links them (tap one for full screen; the author and licence are shown with it), and street-level photos from Panoramax. The street-level viewer opens only when you tap the preview
- Community reviews (from Mangrove.reviews, when available) — including reviews written in MapComplete or on mangrove.reviews, and yours show up there too
- Nearby places — toilets, bus stops, ice cream, shops (supermarket, convenience store, bakery), drugstores and emergency care near the playground (within 5 km by default; the site's operator can change the radius)
- A "Take me there" button that opens navigation to the playground (your phone's map app, or OpenStreetMap directions on a computer)
- **Share playground**, which copies a link to this playground (see [Sharing a playground](#sharing-a-playground))
- **Edit on MapComplete**, to add or improve information in OpenStreetMap

To close the panel, use its close or "back to map" button — or your browser's back: on a phone the back swipe takes you from the panel back to the map instead of leaving spieli.

#### Playground themes

Some playgrounds have a theme — they are built around a motif like a ship, castle, or octopus. When OpenStreetMap records a theme for a playground, spieli highlights it in the detail panel:

- A **banner** near the top ("Ship-themed playground") when the whole playground is themed.
- A **symbol** next to the "Equipment" heading, and beside individual pieces of equipment, for themed devices.

To keep the highlight meaningful, spieli only shows a curated set of recognised whole-playground themes: ship, castle, spider web, water, adventure, rocket, dragon, octopus, and circus. Common animal spring-rider shapes (a horse or duck rocker) are *not* treated as playground themes, since almost any spring rider can take one of those shapes.

Themes come straight from the `playground:theme` tag in OpenStreetMap — you can add or correct one via **Edit on MapComplete** in the panel. Themes are shown only in the detail panel, not on the map.

### Sharing a playground

Each playground has a unique URL. When you open a playground, the address in your browser changes to end in something like `#W37808214`. Share that URL, or use **Share playground** in the panel, to link directly to a specific playground. A sports pitch's link uses `P` instead (`#P123456`). On the all-regions map the link also names the region, e.g. `#hessen/W37808214`.

## The all-regions map

[spieli.eu](https://spieli.eu) combines many regional maps into one. Each region comes from its own server (why: [Federation: one map, many owners](concepts/federation.md)). Most things work exactly as on a single region's map; a few are added:

- **One circle per region when zoomed far out.** Its number is the region's playground count. Tap it to zoom into that region; for a region that is offline or has no data, a short note opens instead. Zoom in further and the circles give way to the usual playground circles and pins.
- **A circle can look different** when a region is not answering normally. The label tells you why: **offline** (the region's server cannot be reached; the number is the last one known), **updating** (it is importing fresh data), **no data** (it answers but has no playgrounds yet). With a filter active, **no match** means none of its playgrounds fit the filter, and **unfiltered** means the region cannot apply your filter (for example because it runs an older version), so all of its playgrounds are counted.
- **"Filter covers N of M regions"** appears at that zoom level when some regions could not apply your filter.
- **The region list.** The button at the bottom left with the number of regions and playgrounds opens a list of all regions, with each one's playground count, how old its data is, and whether it is reachable or updating, and links to its imprint and privacy policy. Regions outside Germany carry a country code such as **SK**; screen readers announce the full country name.
- **Links name the region.** A shared playground link looks like `…/#hessen/W37808214`.

If one region is offline, every other region keeps working.

## Settings and the app

### Language

spieli shows its buttons and texts in German, English or Slovak, following your browser's language; any other browser language gets English. A site can also be set to one language by whoever runs it. There is no switch in the map itself.

Playground names and other details come from OpenStreetMap and are shown as mapped, usually in the local language.

More languages are being translated on [Weblate](https://hosted.weblate.org/engage/spieli/), and help there is welcome.

### Installing spieli as an app

On a phone, spieli can sit on your home screen like an app: one tap opens the map full-screen, without the browser's address bar.

- **iPhone / iPad (Safari):** the share button → *Add to Home Screen*.
- **Android (Chrome):** **Install as app** in the About dialog (the ⓘ button), or the browser menu → *Install app*.
- **Android (Firefox):** menu → *Install* (or *Add to Home screen*).

Each spieli region installs as its own app, under its own name — the Fulda map and the all-Germany hub can sit side by side.

On a desktop, Chrome and Edge (install icon in the address bar) and Safari on a Mac (*File → Add to Dock*) can do the same; Firefox on the desktop cannot (only an experimental "Taskbar Tabs" feature on Windows).

### Keyboard and screen readers

While a dialog or a full-screen photo is open, the keyboard stays with it: focus moves into it, **Tab** cycles through its own controls only — not the map, the search or the buttons hidden behind it — and screen readers read only the dialog. Close it with **Esc** or its close button, and focus returns to where you were.

The search box can be used entirely from the keyboard, see [Finding playgrounds](#finding-playgrounds).

### About, imprint and privacy

The **ⓘ** button opens the **About** dialog: where the data comes from and how to add to it, the offer to report a missing playground, **Install as app** where your browser supports it, links to the source code and to translating spieli, and **Imprint** and **Privacy policy** for the site you are on, when its operator has provided them. The imprint names whoever runs this map. On the all-regions map, each region's own imprint and privacy policy are linked from the [region list](#the-all-regions-map).

### When the background map goes blank

Some sites use a background map that only has detail for certain countries. If you move the map outside that area, the background turns plain and a note says **No detailed map data for this area.** Playgrounds are still shown where the site has them.

## Contributing

### Reporting a missing playground

Know a playground that is not on the map? Press the green map pin with a plus at the bottom right, below the zoom buttons. You can also use the offer that appears when a search finds nothing or when no playgrounds are in view, or open it from the About dialog. The back button or gesture closes the report again.

1. **Mark the spot.** Move the map until the cross sits on the playground. If your location is known, "I'm standing in front of it" jumps there. If a known playground is right next to the spot, spieli asks whether you mean that one. Outside the area this map has data for, spieli cannot check that, so it only offers MapComplete, which shows what OpenStreetMap already has there.
2. **Choose how to report it:**
    - **Leave a hint — no account needed.** Tick what is there (swings, slide, …), add a name or a note if you like, and send. The hint becomes a public [OpenStreetMap note](https://wiki.openstreetmap.org/wiki/Notes) that local mappers review and use to add the playground. The OpenStreetMap Foundation stores your IP address with the note to prevent abuse; notes are public and you cannot delete them yourself afterwards, so don't include personal details.
    - **Add it yourself** in [MapComplete](https://mapcomplete.org), with a free OpenStreetMap account.
3. **Follow up.** If you tick "Remember this hint on this device" before sending, the hint shows up on your map as a small pin (in this browser only). Tap it to see whether a mapper has dealt with it yet. Without the tick, nothing is stored.

Nothing is sent until you press **Send hint**; opening or moving the map never contacts OpenStreetMap's notes service.

### Adding or improving data

All playground data comes from [OpenStreetMap](https://openstreetmap.org). If a playground is missing (see [above](#reporting-a-missing-playground)), has the wrong location, or lacks details:

1. Click the playground and open its detail panel
2. Use **Edit on MapComplete** to open [MapComplete](https://mapcomplete.org) — a beginner-friendly OSM editor focused on playgrounds
3. Or edit directly at [openstreetmap.org](https://openstreetmap.org)

Changes you make in OpenStreetMap appear in spieli after the next data import. How often that runs is up to whoever runs the map, typically every few days; see [Data age](#data-age).

The **About** dialog (the ⓘ button) has the same links in one place: MapComplete, the OpenStreetMap wiki, and the local mapping chat where the site names one.

### Data age

A playground's panel shows **Data as of: … ago**: how old the OpenStreetMap snapshot is that the map was built from. Tap it for an explanation. An edit you make in OpenStreetMap shows up only once a newer snapshot has been imported. How often that happens depends on the map: imports usually run every few days, and the snapshot itself can be a day or so older than the import.

On the all-regions map, the region list shows the same age per region ("OSM data: … old").

### Mapping detail colours

Mapping detail is off by default. Switch it on with the **bar-chart button** next to the info and filter buttons (on phones and desktop alike) and turn on **Show mapping detail**. The map then shows each playground's area, colour-coded by how much of it has been mapped in OpenStreetMap, and the circles split into coloured segments:

| Colour | What it means |
|---|---|
| Light green | Detailed — mapped play equipment **and** at least one detail (surface, opening hours, or access) |
| Dark green | Basic — one of the two, not both |
| Slate grey | No details yet — the playground exists in OSM but carries no equipment and no details |

With mapping detail on, the playground panel also shows the playground's mapping-detail badge; with it off, it does not.

Your choice is remembered in this browser. To send someone a link that opens with mapping detail on — say, to a fellow mapper — add `?detail=1` to the address (for example `…/fulda?detail=1`), or use the share button on a playground while mapping detail is on: the link it copies includes it. Opening such a link does not change the other person's own setting; `?detail=0` does the opposite.

Play equipment means slides, swings, climbing frames and the like, plus ball courts. A bench or picnic table on its own does not make a playground "basic" — those are useful to know about, but they say nothing about whether there is anything to play on.

With mapping detail on, a playground's panel also says under its badge what is missing for the next step — for example "Not mapped yet: the play equipment". The MapComplete links further down in the panel open this playground to add it. Detailed playgrounds get no hint.

A camera glyph marks playgrounds that also have a photo. Photos are a bonus, not part of mapping detail — a playground with everything mapped except a picture still counts as detailed.

The colours describe the OSM data, not the real-world quality of the playground. The lowest step means nobody has mapped it yet, which is an invitation to help rather than a warning.

#### Showing only some states

The mapping-detail button (not the filter panel) lets you show or hide playgrounds by how much of them is mapped:

| State | Meaning |
|---|---|
| **detailed** (light green) | Mapped play equipment **and** at least one detail (surface, opening hours, or access) |
| **basic** (dark green) | One of the two, not both |
| **no details yet** (slate grey) | Neither |

All three states are shown by default. Deactivate a state to hide those playgrounds — for example, uncheck **no details yet** and **basic** to see only well-documented playgrounds, or uncheck **detailed** and **basic** to find playgrounds still needing OSM survey work.

These choices only apply while mapping detail is switched on. Switch it off and every playground is shown again; switch it back on and your choices return.

### Print a poster

There is a poster for hanging up locally, at a kindergarten, a café or a playground noticeboard: a pixel-art scene and a QR code to [spieli.eu](https://spieli.eu), in German, English and Slovak. The print-ready files are in the repository under [`marketing/poster/print/`](https://github.com/mfuhrmann/spieli/tree/main/marketing/poster/print):

- `poster-<lang>-a4.pdf` — one poster on an A4 page
- `poster-<lang>-2up-a4.pdf` — two posters on A4 landscape with cut marks, for handing out
- `poster-<lang>.png` — for use online

Print at **actual size / 100 %**, not "fit to page", and scan the QR code off the printout before hanging it up. (Changing or rebuilding it: [Build the Poster](contributing/poster.md).)

## Privacy

- No user accounts, no analytics, no cookies. A few settings are kept in your browser itself (for example whether mapping detail is on).
- By default your browser only talks to the spieli site you opened. Search, the background map, photos and reviews are fetched by that server for you, so those services never see your address.
- The exceptions: street-level photo thumbnails (and the viewer, once you open it) come from Panoramax directly, and a "Missing a playground?" hint goes to OpenStreetMap when you send it.
- The server keeps no log of what you look at or search for.

How and why: [Privacy by design](concepts/privacy.md). The full list of services: [External Services](reference/external-services.md).
