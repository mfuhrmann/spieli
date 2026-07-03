# Using the spieli Map

spieli is a free, interactive playground map based on OpenStreetMap data. This guide explains what you can do with it.

## Navigating the map

Use your mouse (desktop) or fingers (mobile) to pan and zoom. The map shows:

- **Playground polygons** — coloured outlines of playground areas, colour-coded by data quality (see below)
- **Cluster rings** — at lower zoom levels, nearby playgrounds are grouped into ring indicators showing counts

Click or tap any playground to open its detail panel.

## Data quality colours

Each playground is colour-coded to show how completely it has been mapped in OpenStreetMap:

| Colour | What it means |
|---|---|
| Green | Well-mapped — has a photo, mapped equipment, and at least one detail (surface, opening hours, or access) |
| Orange | Partially mapped — at least one of photo, equipment, or detail is present |
| Red | Barely mapped — the playground exists in OSM but has no photo, no mapped equipment, and no details |

The colours reflect the OSM data, not the real-world quality of the playground.

## Finding playgrounds

**Search:** Type a place name, street, or city into the search box (top bar). The map moves to the matching location.

**My location:** Tap the location button to centre the map on your current position. Your position is shown as a pulsing blue dot; at high zoom a translucent circle indicates the GPS accuracy. If your browser already granted location permission, spieli auto-locates on page load (unless you opened a deeplink or region link).

> **Note:** Geolocation requires HTTPS and your browser's permission. If the button does nothing, check your browser's location settings.

**Region links:** Visit a region by name in the URL — e.g. `spieli.eu/fulda` frames the map on Fulda. spieli geocodes the single path segment via Nominatim and pans to its bounding box (works in both standalone and hub mode). Share these links like any other URL.

## Filters

Open the filter panel to show only playgrounds that match your needs:

| Filter | Shows playgrounds that have… |
|---|---|
| Water play | Water features (`is_water=yes`) |
| Baby equipment | Equipment suitable for babies |
| Toddler equipment | Equipment suitable for toddlers |
| Wheelchair | Wheelchair-accessible equipment or surface |
| Bench | At least one bench |
| Picnic table | At least one picnic table |
| Shelter | A covered shelter |
| Table tennis | A table tennis table |
| Football | A football pitch |
| Basketball | A basketball court |
| Fenced | A fence around the playground (`barrier=fence`) |
| Dogs allowed | Dogs are permitted (`dog=yes`) |
| Themed | Has a recognised theme — ship, octopus, castle, … (`playground:theme`) |
| With shade | Shaded areas (`shade=yes`) |
| Exclude private | Hide access-restricted playgrounds |

Active filters appear as chips below the search bar. Click a chip to remove that filter.

### Data quality filter

The **Datenqualität** section lets you show or hide playgrounds by their OSM data completeness:

| State | Meaning |
|---|---|
| **Complete** (green) | Has photo, mapped equipment, and at least one detail (surface, opening hours, or access) |
| **Partial** (amber) | Has at least one of the above |
| **Missing** (red) | No mapped data at all |

All three states are shown by default. Deactivate a state to hide those playgrounds — for example, uncheck **Missing** and **Partial** to see only well-documented playgrounds, or uncheck **Complete** and **Partial** to find playgrounds still needing OSM survey work.

## Playground detail panel

Click any playground to open its detail panel. The panel shows:

- Name, operator, opening hours (when mapped)
- Surface type and size
- Status pills — completeness, data age, and (when tagged) a shade pill (Shaded / No shade) plus baby / toddler suitability
- Theme highlight — a symbol for playgrounds with a theme, such as a ship or castle (see [Playground themes](#playground-themes))
- Equipment list — devices, pitches, benches, and their sub-attributes, including each item's surface when tagged
- Street-level photos (from Panoramax, when available)
- Community reviews (from Mangrove.reviews, when available)
- Nearby POIs — toilets, cafés, bus stops, and pharmacies within 500 m
- A "Take me there" button that opens navigation to the playground (geo: URL on mobile, OSM directions on desktop)
- A "Contribute data" link to add or improve information in OpenStreetMap via MapComplete

## Playground themes

Some playgrounds have a theme — they are built around a motif like a ship, castle, or octopus. When OpenStreetMap records a theme for a playground, spieli highlights it in the detail panel:

- A **banner** near the top ("Ship-themed playground") when the whole playground is themed.
- A **symbol** next to the "Equipment" heading, and beside individual pieces of equipment, for themed devices.

To keep the highlight meaningful, spieli only shows a curated set of recognised whole-playground themes: ship, castle, spider web, water, adventure, rocket, dragon, octopus, and circus. Common animal spring-rider shapes (a horse or duck rocker) are *not* treated as playground themes, since almost any spring rider can take one of those shapes.

Themes come straight from the `playground:theme` tag in OpenStreetMap — you can add or correct one via the "Contribute data" link. Themes are shown only in the detail panel, not on the map.

## Standalone pitches layer

Enable "Standalone pitches" in the filter panel's Layers section to see sports pitches that are not part of any playground (football fields, basketball courts, skate parks, etc.).

## Deeplinks

Each playground has a unique URL. When you open a playground, the URL bar updates to include a hash like `#W37808214`. Share that URL to link directly to a specific playground.

## Adding or improving data

All playground data comes from [OpenStreetMap](https://openstreetmap.org). If a playground is missing, has the wrong location, or lacks details:

1. Click the playground and open its detail panel
2. Use the **"Contribute data"** button to open [MapComplete](https://mapcomplete.org) — a beginner-friendly OSM editor focused on playgrounds
3. Or edit directly at [openstreetmap.org](https://openstreetmap.org)

Changes you make in OpenStreetMap will appear in spieli after the next data import (usually weekly).

## Data age

The "last import" date shown in the instance footer indicates when the database was last refreshed from Geofabrik's OSM extract. The OSM data itself may be up to a week older than the import date (Geofabrik's extract cadence varies by region).

## Privacy

- No user accounts, no tracking, no cookies beyond what the browser stores locally
- Your browser directly contacts Nominatim (search), CartoDB (map tiles), Panoramax (photos), and Mangrove.reviews — see [External Services](reference/external-services.md) for the full list
- spieli itself does not log search queries or playground clicks
