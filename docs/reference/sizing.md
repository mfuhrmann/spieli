# Sizing

How much memory and disk a data-node needs. Measured on the production host in November 2026: 15 German states and the hub as separate stacks on one VPS.

## Per region

RAM is the whole stack (database, PostgREST, app, idle importer) while serving; disk is the database plus the cached extract (`pbf_cache`).

| Size class | Examples | RAM while serving | Disk (`pgdata` + `pbf_cache`) |
|---|---|---|---|
| Small | Bremen, Saarland, Berlin, Hamburg | ~75–300 MiB | 0.2–0.5 GB |
| Medium | Thüringen, Mecklenburg-Vorpommern, Sachsen-Anhalt, Schleswig-Holstein | ~115–150 MiB | 0.7–0.8 GB |
| Medium-large | Hessen, Rheinland-Pfalz, Brandenburg, Sachsen | ~145–165 MiB | 1.2–1.5 GB |
| Large | Niedersachsen, Nordrhein-Westfalen, Bayern | ~165–550 MiB | 2.1–3.6 GB |

All 15 states plus the hub use about 2.6 GB of memory together while serving.

## During an import

An import is the memory peak, well above serving: for a single region, 2 GB RAM plus swap is enough in most cases, and 4 GB for the largest. That assumes the default database tuning values, which are meant for small hosts ([Configure the instance → RAM sizing](../ops/configure.md#ram-sizing)); a stack installed from an older release may still pass higher ones.

The database temporarily grows during an import (the new `playground_stats` is built next to the old one), so plan for about twice the disk in the table. The Docker images take another 1–2 GB.

### Import duration

Import time scales with the size of the extract, not with the size of your region: a district is cut out of its state's extract, so it pays for reading the whole file.

| Extract | PBF size | Approximate duration |
|---|---|---|
| City or district (cut from a state extract) | 0.2–1 GB | 5–20 min |
| State | 0.5–2 GB | 10–40 min |
| Germany | ~4.5 GB | 1–3 h |

The first run adds the download. Later runs ask Geofabrik with `If-Modified-Since` and skip the download, and the cut, when no newer extract exists; `osm2pgsql` and the schema apply still run every time. More cores help a little: raise `OSM2PGSQL_THREADS` (default `4`).

A container's `memory.peak` is no guide to the import's real need: it counts reclaimable file cache, and shows 3.7–4.6 GiB for every importer, Bremen included.

## Several regions on one host

Serving is cheap, so many regions fit on one machine; what limits it is two imports running at the same time. Plan the host for the sum of the serving memory plus **one** import, keep imports apart, and add swap. See [Single-host Federation](../ops/single-host-federation.md#prerequisites).

To see what a running host uses:

```bash
free -h
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}" | sort -k2 -h
```
