# Spielplatzkarte

A free, interactive web map for exploring playgrounds based on [OpenStreetMap](https://openstreetmap.org) data — configurable for any region.

> **Origin:** This project is a further development of the original [Berliner Spielplatzkarte](https://github.com/SupaplexOSM/spielplatzkarte) by Alex Seidel.

---

## Table of contents

- [Features](#features)
- [How the data flows](#how-the-data-flows)
- [Tech stack](#tech-stack)
- [Glossary](#glossary)
- [Deploy for your region](#deploy-for-your-region)
- [Configuration reference](#configuration-reference)
- [Local development](#local-development)
- [How-to: Add a playground device](#how-to-add-a-playground-device)
- [How-to: Edit UI strings / add a language](#how-to-edit-ui-strings--add-a-language)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Federation](#federation)
- [External services](#external-services)
- [License](#license)

---

## Features

**Map**
- Display all playgrounds in a configured OSM region on an interactive map
- Playground polygons coloured by data completeness (same logic used for polygon outline, hover tooltip dot, and detail panel badge):
  - 🟢 **Vollständig** — has at least one Panoramax photo (`panoramax` / `panoramax:*` tag) **and** a `name` **and** at least one of `operator`, `opening_hours`, `surface`, or `access` (with a value other than `yes`)
  - 🟡 **Teilweise erfasst** — has at least one of the above criteria but not all three
  - 🔴 **Daten fehlen** — none of the above are present
- Private and customers-only playgrounds (`access=private` / `access=customers`) shown with a diagonal hatch pattern and dashed border
- Hover tooltip with playground name, key attributes, and completeness indicator

**Playground detail panel**
- Name, size (m²), surface (Bodenbelag), access restrictions, opening hours (parsed live), age restrictions, operator, contact info
- Equipment list (Ausstattung): individual collapsible items with attributes; sport-specific labels for pitches (Fußball, Basketball, Volleyball, …); example images loaded from [Wikimedia Commons](https://commons.wikimedia.org) (OSM wiki as fallback); broken images are hidden automatically
- Per-device **"Add photo"** link to [MapComplete](https://mapcomplete.org) when no real Panoramax photo exists (playground devices → `playgrounds` theme, fitness stations and sport pitches → `sports` theme)
- Tree count: number of mapped `natural=tree` nodes in and around the playground, shown as a map layer when a playground is selected
- Street photos via [Panoramax](https://panoramax.xyz) — inline viewer with fullscreen modal and keyboard navigation
- Community reviews via [Mangrove.reviews](https://mangrove.reviews) — read ratings and submit your own (pseudonymous, no account required)
- Nearby POIs within a configurable radius: toilets, bus stops, ice cream, supermarkets, drugstores, emergency rooms (`emergency=yes` or `healthcare:speciality=emergency`) — with approximate distance (~) and OSM foot routing
- Permalink: every playground gets a shareable `#W<id>` URL; share button uses the Web Share API (mobile) or copies to clipboard
- Add photos and equipment directly via [MapComplete](https://mapcomplete.org/playgrounds)

**Navigation & UX**
- Location search via [Nominatim](https://nominatim.openstreetmap.org) with nearby playground suggestions — focus with **Double-Shift**
- Geolocation: show nearest playgrounds to current position
- **ESC** deselects the active playground and clears the URL hash
- Responsive layout: desktop (left sidebar card) and mobile (swipeable bottom sheet with drag-to-close)

---

## How the data flows

```
                  ┌─────────────────────────────────────────────────────┐
                  │                   Production                        │
                  │                                                     │
  Browser ──────► nginx ──────► PostgREST ──────► PostgreSQL/PostGIS   │
  (your phone      (serves        (turns SQL          (holds all the    │
   or laptop)      the app,       functions into      OSM playground    │
                   proxies API    HTTP endpoints)     data)             │
                   requests)                                            │
                  └─────────────────────────────────────────────────────┘

```

**In production**, your browser loads the app from nginx. When it needs playground data, it calls `/api/`, which nginx forwards to PostgREST. PostgREST runs a SQL function in PostgreSQL and returns the results as JSON — no custom server code needed. The database was pre-loaded with OpenStreetMap data by the osm2pgsql importer (a one-time step that you re-run whenever you want fresh data).

**During local development**, the Vite dev server serves the JavaScript with instant hot-reload. The Docker stack (database + PostgREST + nginx) still needs to be running in the background to provide the API — `make up` handles this.

---

## Tech stack

| Component | Technology |
|---|---|
| Map | [OpenLayers](https://openlayers.org/) |
| UI framework | [Bootstrap 5](https://getbootstrap.com/) + [Bootstrap Icons](https://icons.getbootstrap.com/) + [Tailwind CSS 4](https://tailwindcss.com/) |
| Icons | [lucide-svelte](https://lucide.dev/) |
| Opening hours parser | [opening_hours.js](https://github.com/opening-hours/opening_hours.js) |
| Build tool | [Vite 6](https://vitejs.dev/) |
| Internationalisation | [i18next](https://www.i18next.com/) (planned; not yet active in Svelte rewrite) |
| Language | [Svelte 5](https://svelte.dev/) (ES Modules) |
| Database | [PostgreSQL 16](https://www.postgresql.org/) + [PostGIS 3.4](https://postgis.net/) |
| OSM import | [osm2pgsql](https://osm2pgsql.org/) (classic schema, `--hstore`) |
| API layer | [PostgREST v12](https://postgrest.org/) |
| Web server | [nginx](https://nginx.org/) |
| Container runtime | [Docker](https://www.docker.com/) / Docker Compose |

---

## Glossary

These are the tools and concepts you'll encounter when working on this project. You don't need to be an expert in all of them — but knowing what they are makes the rest of this README much easier to follow.

| Term | What it is |
|---|---|
| **OpenStreetMap (OSM)** | A free, editable world map built by volunteers — the source of all the playground data in this app. |
| **OSM relation ID** | Every city, district, or region in OSM has a numeric ID. We use it to tell the app which area to show. Example: `62700` is Landkreis Fulda. |
| **PBF file** | A compressed snapshot of OSM map data for a region, available for download from Geofabrik. The importer reads this file to populate the database. |
| **Docker** | A tool that packages software and all its dependencies into isolated "containers" so it runs the same way on any machine. You don't need to install PostgreSQL, nginx, or PostgREST manually — Docker handles all of that. |
| **Docker Compose** | A companion to Docker that lets you define and start multiple containers together with one command (`docker compose up`). Our stack has four: the database, the importer, the API layer, and the web server. |
| **nginx** | A web server. In this project it serves the built frontend files (HTML/CSS/JS) and forwards API requests to PostgREST. Think of it as the front door of the app. |
| **Vite** | A build tool for JavaScript. During development it serves your JS files with instant hot-reload. For production, it bundles and optimises everything into a single small file. You run it with `make dev`. |
| **Node.js** | A JavaScript runtime that runs on your computer (not in the browser). Vite needs it. You install it once and then mostly forget about it. |
| **PostgreSQL** | A relational database — where all the playground data lives once it's been imported. |
| **PostGIS** | An extension to PostgreSQL that adds support for geographic data (points, polygons, distances). It's what lets us query "find all playgrounds within 500 m of this location". |
| **osm2pgsql** | A tool that reads a PBF file and imports the OSM data into PostgreSQL. You run it once (via `make import`) to load the data, and again whenever you want to refresh it. |
| **PostgREST** | A server that automatically turns your PostgreSQL database into a REST API. Instead of writing server-side code, you write SQL functions and PostgREST exposes them as HTTP endpoints. |
| **Svelte** | A JavaScript UI framework that compiles components to efficient vanilla JS at build time — no virtual DOM. The entire frontend (`app/src/`) is written in Svelte 5. |
| **Tailwind CSS** | A utility-first CSS framework. Instead of writing custom CSS classes, you compose styles inline using small utility classes like `p-4` or `flex`. Used alongside Bootstrap 5 in this project. |
| **OpenLayers** | A JavaScript library for interactive maps. It handles rendering the map tiles, drawing the playground polygons, and responding to clicks. |
| **i18next** | A JavaScript library for internationalisation (i18n). Listed as a dependency but not yet integrated in the Svelte rewrite — strings are currently hardcoded in German. |
| **Overpass Turbo** | A web tool ([overpass-turbo.eu](https://overpass-turbo.eu)) for running ad-hoc queries against OpenStreetMap data. Useful for finding playgrounds with a specific device when testing your changes. |

---

## Deploy for your region

### Quick install (no git clone required)

The easiest way to deploy is with the interactive installer. It downloads everything it needs, walks you through configuration, and optionally runs the first import.

**Requirements:** Docker with the Compose plugin, `bash`, `openssl`

```bash
curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spielplatzkarte/main/install.sh -o install.sh
bash install.sh
```

The installer will:

1. Ask for a deployment directory (default: `./spielplatzkarte`)
2. Ask for your OSM relation ID and Geofabrik PBF URL
3. Prompt for optional settings (port, UI links, zoom levels)
4. Generate a secure database password automatically
5. Download `compose.yml` and `db/init.sql` into the deployment directory
6. Offer to pull images, start the stack, and run the first import

After setup, manage the stack from the deployment directory:

```bash
cd spielplatzkarte
docker compose up -d                 # start
docker compose run --rm importer     # re-import OSM data
docker compose down                  # stop
```

---

### Manual deploy (from source)

### 1. Find your region's OSM relation ID

Search for your city, Kreis, or district on [Nominatim](https://nominatim.openstreetmap.org) or [openstreetmap.org](https://openstreetmap.org). The relation ID appears in the URL, e.g. `openstreetmap.org/relation/62700` → ID is `62700`.

### 2. Find a Geofabrik PBF extract

Browse [download.geofabrik.de](https://download.geofabrik.de) and find an extract that covers your region. German Bundesländer and many sub-regions are available. The PBF only needs to *contain* your region — a Bundesland extract works fine even if your region is just one Kreis within it.

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
OSM_RELATION_ID=62700   # your region's OSM relation ID
PBF_URL=https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf
```

See `.env.example` for all available options (UI links, zoom levels, port, DB password).

### 4. Start the stack and import data

```bash
# Start the database, API, and web server
make up

# Import OSM data (downloads PBF, runs osm2pgsql, sets up API functions)
# Takes a few minutes depending on extract size and hardware
make import
```

The app will be available at `http://localhost:8080` (or the port set in `APP_PORT`).

### 5. Updating data

Re-run the importer at any time to refresh from Geofabrik (extracts are updated daily):

```bash
make import
```

---

## Configuration reference

All variables can be set in `.env` (copy from `.env.example`).

| Variable | Default | Description |
|---|---|---|
| `OSM_RELATION_ID` | `62700` | OSM relation ID of the region to display |
| `PBF_URL` | Hessen extract | Geofabrik `.osm.pbf` download URL |
| `REGION_PLAYGROUND_WIKI_URL` | Generic OSM wiki | Wiki page linked in the "Contribute" modal |
| `REGION_CHAT_URL` | *(hidden)* | Community chat link; leave empty to hide the button |
| `MAP_ZOOM` | `12` | Initial map zoom level |
| `MAP_MIN_ZOOM` | `10` | Minimum zoom level |
| `PARENT_ORIGIN` | *(own origin)* | Allowed origin for `postMessage` events — set to the Hub's full origin (e.g. `https://hub.example.com`) when embedding in a Hub; leave empty for standalone deployments |
| `APP_PORT` | `8080` | Host port the app is exposed on |
| `POSTGRES_PASSWORD` | `change-me` | Database password — **change in production** |
| `POI_RADIUS_M` | `5000` | Radius in metres for nearby POI search |
| `OSM2PGSQL_THREADS` | `4` | CPU threads for the import |

---

## Local development

**Requirements:** [Node.js](https://nodejs.org/) v18 or newer, [Docker](https://www.docker.com/) with Docker Compose

All common operations are available via `make`. Run `make help` to list all targets.

### Frontend dev server

```bash
make install      # install Node dependencies (only needed once)
make up           # start db + PostgREST + nginx (required backend)
make dev          # dev server with hot-reload at http://localhost:5173
```

> **Note:** `make dev` starts the Vite dev server, which serves the JS with instant hot-reload. The Docker stack (`make up`) must be running alongside it to provide the API — the app requires a live PostgREST backend.

### Rebuild the app container after code changes

```bash
make docker-build
```

This runs the Vite build inside the container and replaces the nginx image without touching the database or PostgREST.

### Applying database changes without a full rebuild

SQL changes to `importer/api.sql` (PostgREST functions, indexes) can be applied directly to the running database:

```bash
make db-apply
```

### Testing on a phone / LAN access

To open the app on a phone or any other device on the same WiFi network:

```bash
make lan-url
```

This prints your machine's LAN IP and the ready-to-use URLs, for example:

```
  LAN IP:            192.168.1.42
  Vite dev server:   http://192.168.1.42:5173
  Docker stack:      http://192.168.1.42:8080
```

- **Vite dev server** (`make dev`): already binds to all interfaces — open the printed URL on the phone. If it doesn't load, check that port 5173 is not blocked by a firewall on the host.
- **Docker stack** (`make up`): binds to `0.0.0.0` by default, so `http://<LAN-IP>:8080` works immediately without any extra configuration.

> **Geolocation on mobile:** Browsers block the location API on plain HTTP (non-HTTPS) connections — including local IP addresses. If you need to test the location button on a phone, use Chrome and enable the "Insecure origins treated as secure" flag at `chrome://flags`, or test against the production HTTPS URL.

---

## How-to: Add a playground device

Every playground device that OSM can record — slides, swings, climbing frames, balance beams — is defined in one place: `js/objPlaygroundEquipment.js`. Adding support for a new device type is a small, self-contained change.

### Step 1 — Find the OSM tag

OSM uses the tag `playground=<value>` to describe individual devices. The full list of documented values is at [wiki.openstreetmap.org/wiki/Key:playground](https://wiki.openstreetmap.org/wiki/Key:playground).

For example, a balance beam is `playground=balance_beam`.

### Step 2 — Add an entry to `objDevices`

Open `js/objPlaygroundEquipment.js` and add a new key to the `objDevices` object. Copy an existing entry as a template:

```js
balance_beam: {
    name_de: "Balancierbalken",
    image: "File:Playground balance beam.jpg",
    category: "stationary",
    filterable: false,
},
```

**Field reference:**

| Field | Required | What it does |
|---|---|---|
| `name_de` | Yes | German display name shown in the detail panel |
| `image` | No | Wikimedia Commons filename for an example photo (see Step 3). Omit if no good image exists. |
| `category` | No | Groups the device in the filter panel. Values: `stationary`, `structure_parts`, `active`. Omit to leave ungrouped. |
| `filterable` | No | Set to `true` to make this device type appear as a filter option in the sidebar. |
| `filter_attr` | No | Array of OSM sub-attributes to show as filter controls, e.g. `["length", "height"]`. Only meaningful when `filterable: true`. |

### Step 3 — Find a Wikimedia Commons image

1. Go to [commons.wikimedia.org](https://commons.wikimedia.org) and search for the device name in English.
2. Find a clear, representative photo of the device.
3. On the image page, copy the filename — it starts with `File:` (e.g. `File:Playground balance beam.jpg`).
4. Paste that filename as the `image` value in your entry. The app first tries Wikimedia Commons, then falls back to the OSM wiki if the Commons image isn't found.

If you can't find a suitable image, simply omit the `image` field. No broken icon will appear.

### Step 4 — Verify locally

```bash
make dev
```

Open the app at `http://localhost:5173`, navigate to a playground that has the device you added (search for a street near such a playground, then click it), and expand the device's entry in the equipment list. You should see the German name, the example image, and any attributes.

If you don't know a playground with that device, you can find one using [Overpass Turbo](https://overpass-turbo.eu) — search for `playground=balance_beam` (replace with your tag value) to locate playgrounds that have it mapped.

### Step 5 — Commit and open a PR

```bash
git checkout -b feat/add-balance-beam-device
git add js/objPlaygroundEquipment.js
git commit -m "feat: add balance_beam playground device"
git push -u origin feat/add-balance-beam-device
```

Then open a pull request on GitHub. See the [Contributing](#contributing) section for the full PR walkthrough.

---

## How-to: Edit UI strings / add a language

All user-visible text in the app lives in `locales/*.json` — one file per language. The app detects the user's browser language automatically and loads the matching file.

### Edit an existing string

**Step 1 — Find the key you want to change**

Open `locales/de.json` (German, the primary language) in any text editor. The file is structured as nested JSON. For example, the text on the location button is under `"location"`:

```json
"location": {
    "yourLocation": "Dein Standort"
}
```

You can also open the app in your browser and use the browser's "Inspect" tool (right-click → Inspect) to find the element, then search for its text in the `locales/` files.

**Step 2 — Edit the value**

Change the string value (the part after the `:`), keeping the key (the part before the `:`) unchanged. Make sure the JSON stays valid — every value must be in double quotes, and every line except the last in an object must end with a comma.

**Step 3 — Test your change**

```bash
make dev
```

Open `http://localhost:5173/?lang=de` to force German regardless of your browser settings. Replace `de` with any other language code to test that language.

**Step 4 — Apply the change to all languages**

If you changed a string, update the same key in the other language files (`locales/en.json`, `locales/fr.json`, etc.) too. You can use the English value as a placeholder if you don't speak the language — native speakers can improve it later.

---

### Add a completely new language

1. **Copy the English file** as a starting point:
   ```bash
   cp locales/en.json locales/ro.json   # replace 'ro' with your language code
   ```
   Use the [BCP 47 language code](https://en.wikipedia.org/wiki/IETF_language_tag) (e.g. `ro` for Romanian, `hr` for Croatian).

2. **Translate all the string values.** Do not change the keys — only the values (the text in quotes after the `:`). Leave any value you're unsure about in English for now.

3. **Handle plural forms** (only needed for some languages). Languages like Polish and Ukrainian have multiple plural forms. If your language has this, add the appropriate plural suffixes (`_one`, `_few`, `_many`, `_other`) to equipment count strings. See [i18next pluralisation docs](https://www.i18next.com/translation-function/plurals) and the existing `locales/pl.json` for an example.

4. **Register the language** in `js/i18n.js`:
   ```js
   import ro from '../locales/ro.json';   // add this import near the top
   // …
   resources: {
       // …existing entries…
       ro: { translation: ro },           // add this line
   }
   ```

5. **Test it:**
   ```bash
   make dev
   # Open http://localhost:5173/?lang=ro
   ```

6. Commit and open a PR — see [Contributing](#contributing).

---

## Troubleshooting

### Port 8080 is already in use

**Symptom:** `make up` fails with an error like `address already in use` or `port is already allocated`.

**Fix:** Either stop whatever is using port 8080, or change the port in your `.env`:
```env
APP_PORT=8081
```
Then run `make up` again.

---

### `make import` exits immediately or fails with a database error

**Symptom:** The import finishes in seconds (normally takes minutes), or you see a `connection refused` or `role does not exist` error.

**Fix:** The database container must be running before you import. Make sure you ran `make up` first and that all containers are healthy:
```bash
docker compose ps   # all containers should show "running" or "healthy"
make import
```
If the database shows as unhealthy, try `make down && make up` to restart it cleanly.

---

### Map loads but shows no playgrounds

**Symptom:** The map tiles appear (you can see streets and buildings) but no playground polygons are drawn, or the detail panel is empty.

**Possible causes and fixes:**

1. **Import not run:** Did you run `make import` after starting the stack? Playground data is not loaded automatically.
2. **Wrong relation ID:** Check `OSM_RELATION_ID` in your `.env`. An incorrect ID means the app filters out all playgrounds. Verify your ID at [nominatim.openstreetmap.org](https://nominatim.openstreetmap.org).
3. **Docker stack not running:** The app requires the PostgREST backend. Make sure `make up` is running and healthy before starting `make dev`.
4. **Browser cache:** Try a hard reload: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac).

---

### Geolocation button does nothing on mobile

**Symptom:** Tapping the location button on a phone browser has no effect — no movement, no error.

**Cause:** Browsers block the geolocation API on plain HTTP connections (non-HTTPS). This includes local IP addresses like `http://192.168.1.42:8080`. This is a browser security policy and cannot be overridden in the app.

**Fix options:**
- Test geolocation on the **production HTTPS URL** (where it works normally in all browsers).
- On Android with **Chrome**: go to `chrome://flags`, search for "Insecure origins treated as secure", add your local URL, and relaunch Chrome.
- **DuckDuckGo** and **Brave** do not offer this workaround — use Chrome for local geolocation testing.

---

### Dev server starts but changes don't appear

**Symptom:** You edited a JS or CSS file, saved it, but the browser still shows the old version.

**Fix:** Vite hot-reload should pick up changes automatically. If it doesn't:
1. Check the terminal running `make dev` — if there's a build error, the browser won't update until it's fixed.
2. Try a hard reload in the browser: `Ctrl+Shift+R` / `Cmd+Shift+R`.
3. If you changed `index.html` or a file in `public/`, you may need to stop and restart `make dev`.

Note: if you're testing via `make docker-build` (the Docker stack), you need to run `make docker-build` again after every change — there is no hot-reload in that mode.

---

### `make lan-url` prints "Could not detect LAN IP"

**Symptom:** Running `make lan-url` outputs a warning instead of your IP address.

**Fix:** Run this command directly and use the output as your LAN IP:
```bash
ip route get 1 | awk '{print $7; exit}'
```
Then open `http://<that-ip>:8080` on your phone.

---

## Contributing

All contributions are welcome — code, translations, bug reports, or documentation improvements. Here's how to get a change into the project:

### Step 1 — Create a GitHub issue

Before writing code, open an issue on GitHub describing what you want to fix or add. This lets maintainers give early feedback and avoids duplicated effort. You can skip this for tiny fixes like typos.

### Step 2 — Create a branch

```bash
git checkout main
git pull                          # make sure you're up to date
git checkout -b fix/my-fix-name   # create a new branch
```

**Branch naming convention:**
- `feat/<description>` — new feature (e.g. `feat/add-balance-beam-device`)
- `fix/<description>` — bug fix (e.g. `fix/popup-scroll`)
- `docs/<description>` — documentation only (e.g. `docs/add-glossary`)
- `chore/<description>` — maintenance, dependency updates

### Step 3 — Make your change and test it

Edit the files you need to change. For frontend changes, run `make dev` and check the feature in your browser. For Docker stack changes, run `make docker-build` and test at `http://localhost:8080`.

### Step 4 — Commit with a conventional commit message

```bash
git add js/objPlaygroundEquipment.js   # add only the files you changed
git commit -m "feat: add balance_beam playground device"
```

**Commit message format:** `<type>: <short description>`

Types: `feat` (new feature), `fix` (bug fix), `docs` (documentation), `style` (formatting), `refactor` (code restructure, no behaviour change), `chore` (maintenance), `ci` (CI/CD changes).

Examples:
- `feat: add filtering by device height`
- `fix: location button not showing nearby playgrounds on mobile`
- `docs: add balance_beam to device how-to guide`

### Step 5 — Push and open a pull request

```bash
git push -u origin fix/my-fix-name
```

GitHub will print a link to open a pull request. Click it, write a short description of what you changed and why, and submit. A maintainer will review it.

> **Never push directly to `main`.** All changes go through a branch and a pull request.

---

## Federation

Multiple regional instances can be aggregated into a single global map using the **[Spielplatzkarte Hub](https://github.com/mfuhrmann/spielplatzkarte-hub)**.

Each instance exposes two federation endpoints (available since v0.2.1):

- `GET /api/rpc/get_playgrounds` — full GeoJSON FeatureCollection of all playgrounds in the region
- `GET /api/rpc/get_meta` — instance metadata: OSM relation name, playground count, bounding box

CORS is enabled on `/api/` so the Hub can query instances cross-origin from the browser.

---

## External services

| Service | Purpose |
|---|---|
| [Geofabrik](https://download.geofabrik.de) | Source of OSM PBF extracts for import |
| [Nominatim](https://nominatim.openstreetmap.org) | Location search and region bounding box |
| [CartoDB Voyager](https://carto.com/basemaps) | Background map tiles |
| [Panoramax](https://panoramax.xyz) | Street-level photos |
| [Mangrove.reviews](https://mangrove.reviews) | Pseudonymous community reviews |
| [MapComplete](https://mapcomplete.org) | Contribute photos and equipment |
| [Wikidata](https://wikidata.org) | Operator entity linking |

All data comes from OpenStreetMap or the free services listed above. No proprietary data, no user accounts, no tracking.

---

## Internationalisation

The UI is fully translated using [i18next](https://www.i18next.com/). The language is detected automatically from the visitor's browser settings, with English as the fallback.

### Supported languages

| Code | Language |
|---|---|
| `de` | German |
| `en` | English |
| `fr` | French |
| `es` | Spanish |
| `it` | Italian |
| `pl` | Polish |
| `nl` | Dutch |
| `cs` | Czech |
| `pt` | Portuguese |
| `sv` | Swedish |
| `uk` | Ukrainian |
| `ja` | Japanese |

> **Note:** Translations were not done by native speakers and may contain errors. Corrections and improvements are very welcome — see the [how-to guide](#how-to-edit-ui-strings--add-a-language) above.

---

## License

[GNU General Public License v3.0](LICENSE)

Map data © [OpenStreetMap](https://openstreetmap.org) contributors, available under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright).
