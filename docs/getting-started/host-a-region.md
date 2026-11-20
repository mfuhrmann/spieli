# Host a region for spieli.eu

[spieli.eu](https://spieli.eu) is a public playground map. It holds no data of its own. Every region on it comes from a data-node that someone runs for that region. At the moment these are the German states, and we are looking for people to add more. A region does not have to be a whole country: a single state, district or city is just as welcome.

You can see which regions are already covered on the map itself, in the list of regions on [spieli.eu](https://spieli.eu), or in [spieli.eu/registry.json](https://spieli.eu/registry.json). Before you start, please come to [#spieli:matrix.org](https://matrix.to/#/#spieli:matrix.org) anyway: someone may already be setting up your region, and we can help you choose its boundary.

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

A small VPS is enough. A city-sized region uses about 100 MB of memory while serving and a large state up to about 550 MB; an import needs more, about 2 GB plus swap for a single region. Disk needs range from 0.2 GB for a city to about 4 GB for a large state, plus room for the import. Measured figures per region, and what to watch during an import: [Sizing](../reference/sizing.md).

Once it runs, there is little to do: keep the server's operating system up to date and read the [release notes](https://github.com/mfuhrmann/spieli/releases) now and then. If a release needs more than pulling the new images, its notes say so (see also [Upgrading](../ops/upgrade.md)).

## Choosing a region

A data-node covers one OpenStreetMap boundary relation. That can be a whole country, but a state, a district or a single city of a country is fine too; other people can add the neighbouring regions later. The region is cut out of a [Geofabrik](https://download.geofabrik.de) extract that contains the region. The table above goes up to Bavaria, which has 13 million inhabitants. Larger countries work as well but need more memory and disk; please ask in the chat first.

## Setting it up

You need a Linux server with Docker and the Compose plugin, a domain or subdomain that points to it, and ports 80 and 443 open. The examples below use `my-playground-map.at` for a data-node covering Austria.

1. Run the installer. The command for the current release is in the [Quick Start](quick-start.md#install), which also explains how to find your region's relation ID and extract. Choose `data-node` or `data-node-ui`, and answer yes to automatic updates. The question about an external hub origin can stay empty.

2. Set up HTTPS with the Traefik installer, which gets a certificate from Let's Encrypt. Choose mode 1, `data-node-ui`; the app's nginx then serves the API with the CORS headers spieli.eu needs. (The installer's `data-node` mode cannot reach the API at the moment, [#1062](https://github.com/mfuhrmann/spieli/issues/1062); until that is fixed, install spieli as `data-node-ui` in step 1 too.)

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

- If you set `IMPRESSUM_NAME`, `IMPRESSUM_ADDRESS` and `IMPRESSUM_EMAIL` in `.env`, spieli generates an imprint and a privacy notice. If you already have such pages, set `IMPRESSUM_URL` and `PRIVACY_URL` instead. spieli.eu links them from your region. In Germany a public service needs an imprint. How it works and what to restart after a change: [Configure the instance → Legal pages](../ops/configure.md#legal-pages).
- For your privacy notice: visitors' browsers connect to your server, which therefore sees their IP address. By default nothing is logged or stored, and no cookies are set.

The data is © OpenStreetMap contributors and licensed under the ODbL. spieli.eu shows the attribution.

## Languages

The map is available in German, English and Slovak. French and Spanish are about 80 % translated, other languages less. Translation happens on [Weblate](https://hosted.weblate.org/engage/spieli/), and help there is welcome too.

## See also

- [Quick Start](quick-start.md): installer, deployment scenarios, managing the stack
- [Scheduled Import](../ops/scheduled-import.md): how automatic imports and updates work
- [Federation](../reference/federation.md): how spieli.eu talks to data-nodes
- [Troubleshooting](../ops/troubleshooting.md)
