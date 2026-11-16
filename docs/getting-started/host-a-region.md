# Host a region for spieli.eu

[spieli.eu](https://spieli.eu) is a public playground map. It holds no data of its own. Every region on it comes from a data-node that someone runs for that region. At the moment these are the German states, and we are looking for people to add more. A region does not have to be a whole country: a single state, district or city is just as welcome.

If you are interested, come to [#spieli:matrix.org](https://matrix.to/#/#spieli:matrix.org) before you start. We can tell you whether your region is already covered and help you choose its boundary.

An example of a well-mapped playground is [Carl-Schurz-Straße in Fulda](https://spieli.eu/#hessen/W818585707).

## What a data-node does

A data-node downloads the OpenStreetMap extract for your region, keeps the playground data and serves it over HTTPS. spieli.eu lists its address, and visitors' browsers load the playgrounds from your server while they look at your region. The data is read-only. There are no accounts, no cookies and nothing a visitor can write.

With automatic updates switched on, the data-node re-imports the data every 2 to 10 days and installs new spieli releases by itself.

## Your own map as well

The installer offers two modes, and both put your region on spieli.eu:

- `data-node` runs only the database and the API.
- `data-node-ui` also serves a playground map of your region on your own domain. Someone covering Austria could run it as `my-playground-map.at`. spieli.eu reads from the same API, so both maps show the same data.

Choose `data-node-ui` if you want a map you can point people to locally under its own name. When the installer then asks for the app mode, choose `standalone`.

## Server requirements

A small VPS is enough. On our production server, 15 German states run side by side on one VPS with 8 GB RAM. Per region:

| Region size | Example | RAM while serving | Disk (database and extract) |
|---|---|---|---|
| City | Bremen, Saarland | about 100 MB | 0.2–0.3 GB |
| Large city | Berlin, Hamburg | 100–300 MB | about 0.5 GB |
| Medium-sized state | Hesse, Saxony, Schleswig-Holstein | 130–200 MB | 0.7–1.5 GB |
| Large state | Bavaria, North Rhine-Westphalia | 200–550 MB | 3–4 GB |

An import needs more memory than serving. For a single region, 2 GB RAM plus swap is enough in most cases, and 4 GB for the largest. The Docker images take another 1–2 GB of disk, and the database temporarily grows during an import, so plan for about twice the disk size in the table. The CPU hardly matters. Importing a state takes 10 to 40 minutes.

Once it runs, there is little to do: keep the server's operating system up to date and read the [release notes](https://github.com/mfuhrmann/spieli/releases) now and then. If a release needs more than pulling the new images, its notes say so (see also [Upgrading](../ops/upgrade.md)).

## Choosing a region

A data-node covers one OpenStreetMap boundary relation. That can be a whole country, but a state, a district or a single city of a country is fine too; other people can add the neighbouring regions later. The region is cut out of a [Geofabrik](https://download.geofabrik.de) extract that contains the region. The table above goes up to Bavaria, which has 13 million inhabitants. Larger countries work as well but need more memory and disk; please ask in the chat first.

## Setting it up

You need a Linux server with Docker and the Compose plugin, a domain or subdomain that points to it, and ports 80 and 443 open. The examples below use `my-playground-map.at` for a data-node covering Austria.

1. Run the installer. The command for the current release is in the [Quick Start](quick-start.md#install), which also explains how to find your region's relation ID and extract. Choose `data-node` or `data-node-ui`, and answer yes to automatic updates. The question about an external hub origin can stay empty.

2. Set up HTTPS with the Traefik installer, which gets a certificate from Let's Encrypt. Choose the same mode as in the first step. In both modes the API then sends the CORS headers spieli.eu needs.

    ```bash
    curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/deploy/traefik/install-traefik.sh -o install-traefik.sh
    bash install-traefik.sh
    ```

3. When the first import has finished, check the API from another machine. The answer should be `200 OK` with the header `Access-Control-Allow-Origin: *`, and `playground_count` should be above 0. With `data-node-ui`, your map is now at `https://my-playground-map.at`.

    ```bash
    curl -i https://my-playground-map.at/api/rpc/get_meta
    ```

4. Send us the API address (`https://my-playground-map.at/api`), the name of the region and its country in [#spieli:matrix.org](https://matrix.to/#/#spieli:matrix.org), and we add it to spieli.eu.

## Legal and privacy

The legal requirements depend on your country, and we cannot give legal advice. Two things spieli can do for you:

- If you set `IMPRESSUM_NAME`, `IMPRESSUM_ADDRESS` and `IMPRESSUM_EMAIL` in `.env`, spieli generates an imprint and a privacy notice. If you already have such pages, set `IMPRESSUM_URL` and `PRIVACY_URL` instead. spieli.eu links them from your region. In Germany a public service needs an imprint. All settings are described in [Configuration](../ops/configuration.md).
- For your privacy notice: visitors' browsers connect to your server, which therefore sees their IP address. By default nothing is logged or stored, and no cookies are set.

The data is © OpenStreetMap contributors and licensed under the ODbL. spieli.eu shows the attribution.

## Languages

The map is available in German, English and Slovak. French and Spanish are translated but cannot be switched on yet ([#751](https://github.com/mfuhrmann/spieli/issues/751)). Other languages are being translated on [Weblate](https://hosted.weblate.org/engage/spieli/), and help there is welcome too.

## See also

- [Quick Start](quick-start.md): installer, deployment scenarios, managing the stack
- [Scheduled Import](../ops/scheduled-import.md): how automatic imports and updates work
- [Federation](../reference/federation.md): how spieli.eu talks to data-nodes
- [Troubleshooting](../ops/troubleshooting.md)
