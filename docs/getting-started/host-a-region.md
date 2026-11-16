# Host a region for spieli.eu

[spieli.eu](https://spieli.eu) is a public playground map. The map itself holds no data: it shows the playgrounds of regional **data-nodes**, each run by someone who wants their region on the map. Today these are the German states. If you would like your city, region or country to appear, this page tells you what that takes.

You can also have **both**: your own playground map on your own domain — say `playground.example.at` for Austria — that also feeds spieli.eu. One server, one import, two maps. See [Your own map, and on spieli.eu](#your-own-map-and-on-spielieu).

To see what your region could look like, open a well-mapped playground: [Carl-Schurz-Straße in Fulda](https://spieli.eu/#hessen/W818585707), with its play devices, details and a 360° photo.

**Talk to us first:** [#spieli:matrix.org](https://matrix.to/#/#spieli:matrix.org). We can tell you whether someone already covers your region and help you pick a good boundary.

## What a data-node does

- It downloads the OpenStreetMap extract for your region, keeps only playground-related data, and **refreshes it by itself** every few days (at a random point between 2 and 10 days, with automatic updates on).
- It serves that data read-only over HTTPS. spieli.eu lists your API URL, and visitors' browsers fetch the playgrounds **directly from your server** while they look at your region.
- It stores no user data: no accounts, no writes, no cookies. Your server does see visitors' IP addresses, like any web server. Neither PostgREST nor the bundled Traefik proxy log requests by default.
- It updates itself: with automatic updates switched on, new spieli releases are pulled and applied daily.

## What it costs you

A small VPS is enough. Measured on the production host, which runs **15 German states on one 8 GB VPS**:

| Region size | Example | RAM while serving | Disk (database + extract) |
|---|---|---|---|
| City | Bremen, Saarland | ~100 MB | 0.2–0.3 GB |
| Large city / small country | Berlin, Hamburg | ~100–300 MB | ~0.5 GB |
| Medium state / country | Hesse, Saxony, Schleswig-Holstein | ~130–200 MB | 0.7–1.5 GB |
| Large state / country | Bavaria, North Rhine-Westphalia | ~200–550 MB | 3–4 GB |

The import is the peak: for its duration it needs more memory than serving does. For one region, **2 GB RAM plus swap** is enough for most regions, **4 GB** for the largest. On disk, leave room for the Docker images (1–2 GB) and about the same again as the table, because the database grows while an import rebuilds it. CPU barely matters; a state-sized import takes 10–40 minutes.

Your ongoing effort is small: keep the server itself patched, and glance at the [release notes](https://github.com/mfuhrmann/spieli/releases) — a release labelled as needing more than "pull and restart" says what to do (see [Upgrading](../ops/upgrade.md)).

## Choosing a region

A data-node covers **one OpenStreetMap boundary relation** — a city, a district, a state or a whole country — clipped from a [Geofabrik](https://download.geofabrik.de) extract that contains it. Anything up to the size of Bavaria (13 million inhabitants) is measured above. A whole larger country works too, but needs more memory and disk; ask in the chat first.

## Your own map, and on spieli.eu

The installer asks which services to run. Both choices put your region on spieli.eu:

- **`data-node-ui`** — your own playground map for your region, on your own domain, in front of the same data. Choose this if you want a map you can promote locally — a country, a city, a community — under its own name, and still contribute to spieli.eu. When the installer then asks for the app mode, choose `standalone`.
- **`data-node`** — database and API only, no map of your own. Choose this if you only want your region to appear on spieli.eu.

Either way it is one server and one import. With `data-node-ui`, spieli.eu reads from the API of your map (`https://your-domain/api`), so the two always show the same data.

## Setting it up

You need a Linux server with Docker and the Compose plugin, and a domain or subdomain pointing at it (e.g. `spieli.example.org`), with ports 80 and 443 open.

**1. Install spieli** with the installer — the command for the latest release is in the [Quick Start](quick-start.md#install), along with how to find your region's relation ID and extract. When it asks:

- deployment mode: `data-node-ui` (own map, then app mode `standalone`) or `data-node` (API only);
- automatic updates: **yes**;
- external hub origin: leave empty, spieli.eu does not need it.

**2. Put HTTPS in front** — the Traefik installer gets a Let's Encrypt certificate. Choose the same mode as in step 1; either way the API gets the CORS headers spieli.eu needs:

```bash
curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/deploy/traefik/install-traefik.sh -o install-traefik.sh
bash install-traefik.sh
```

**3. Check it from another machine** once the first import has finished (with `data-node-ui`, also open `https://spieli.example.org` — that is your map):

```bash
curl -i https://spieli.example.org/api/rpc/get_meta
# expect: 200 OK, Access-Control-Allow-Origin: *, and "playground_count" above 0
```

**4. Tell us** in [#spieli:matrix.org](https://matrix.to/#/#spieli:matrix.org): your API URL (`https://spieli.example.org/api`), the region's name, and its country. We add it to spieli.eu.

## Legal and privacy

What you need depends on the law where you live; we cannot give legal advice. spieli helps with what is common:

- **Imprint and privacy notice.** Set `IMPRESSUM_NAME`, `IMPRESSUM_ADDRESS` and `IMPRESSUM_EMAIL` in `.env` and spieli generates both pages; or point `IMPRESSUM_URL` and `PRIVACY_URL` at pages you already have. spieli.eu links them next to your region. Germany requires an imprint for a public service; see [Configuration](../ops/configuration.md) for all settings.
- **For your privacy notice:** visitors' browsers connect to your server and send their IP address; nothing is logged or stored by default; there are no cookies.
- **The data** is © OpenStreetMap contributors under the ODbL; spieli.eu shows the attribution.

## Languages

The map is available in German, English and Slovak. French and Spanish are fully translated and wait for a technical fix ([#751](https://github.com/mfuhrmann/spieli/issues/751)); other languages are under way on [Weblate](https://hosted.weblate.org/engage/spieli/) — translating spieli into your language is another way to help.

## See also

- [Quick Start](quick-start.md) — installer, scenarios, managing the stack
- [Scheduled Import](../ops/scheduled-import.md) — how the automatic refresh and updates work
- [Federation](../reference/federation.md) — how spieli.eu talks to data-nodes
- [Troubleshooting](../ops/troubleshooting.md)
