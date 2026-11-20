# spieli

A free, interactive map of playgrounds, built from [OpenStreetMap](https://www.openstreetmap.org) data. It shows where playgrounds are, what is on them and who may use them — and, for mappers, what is still missing.

> **Origin:** spieli is a further development of the original [Berliner Spielplatzkarte](https://github.com/SupaplexOSM/spielplatzkarte) by Alex Seidel.

## See it in action

The public map runs at **[spieli.eu](https://spieli.eu)**. Two well-mapped playgrounds in Fulda, both with 360° photos:

- [Carl-Schurz-Straße](https://spieli.eu/#hessen/W818585707): 30 play devices, opening hours and operator
- [Galgengraben](https://spieli.eu/#hessen/W143374809): 25 play devices and several photos

## One map, many owners

spieli.eu holds no playground data of its own. Each region comes from its own server, a *data-node*, and visitors' browsers put the regions together on one map. Anyone can run a data-node for their city, district or country and, with it, a map of their own. Why it is built this way: [Federation: one map, many owners](concepts/federation.md).

## Where to start

| I want to… | Go to… |
|---|---|
| Use the map | [User Guide](user-guide.md) |
| Understand how spieli works | [Federation](concepts/federation.md) · [Privacy by design](concepts/privacy.md) · [Mapping detail](reference/completeness.md) |
| Put my region on spieli.eu | [Host a Region for spieli.eu](getting-started/host-a-region.md) |
| Run a map for my region | [Quick Start](getting-started/quick-start.md) |
| Run a hub over several regions | [Federated Deployment](ops/federated-deployment.md) |
| Add or fix playground data | [User Guide → Adding or improving data](user-guide.md#adding-or-improving-data) · [OSM Tags spieli Reads](reference/osm-tags.md) |
| Translate spieli | [Translation Guide](contributing/translation-guide.md) |
| Work on spieli's code | [Local Development](contributing/local-dev.md) |
| Look something up | [Configuration](ops/configuration.md) · [API](reference/api.md) · [Glossary](reference/glossary.md) |

Something broken? [Troubleshooting](ops/troubleshooting.md), or ask in [#spieli:matrix.org](https://matrix.to/#/#spieli:matrix.org).

## Spread the word

There is a printable poster with a QR code to spieli.eu, in German, English and Slovak: [User Guide → Print a poster](user-guide.md#print-a-poster).

## Translations

[![Translation status](https://hosted.weblate.org/widget/spieli/ui-strings/svg-badge.svg)](https://hosted.weblate.org/engage/spieli/)

spieli is translated on [Weblate](https://weblate.org/), which hosts the project free of charge under its [Libre plan](https://weblate.org/hosting/). No GitHub account needed: **[help translate spieli →](https://hosted.weblate.org/engage/spieli/)**

## License

The code is under the [GNU General Public License v3.0](https://github.com/mfuhrmann/spieli/blob/main/LICENSE). Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, under the Open Database License (ODbL).
