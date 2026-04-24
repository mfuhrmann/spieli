# spieli

A free, interactive web map for exploring playgrounds based on [OpenStreetMap](https://openstreetmap.org) data — configurable for any region.

> **Origin:** This project is a further development of the original [Berliner spieli](https://github.com/SupaplexOSM/spieli) by Alex Seidel.

---

## Architecture

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

Your browser loads the app from nginx. Playground data requests go to `/api/`, which nginx forwards to PostgREST. PostgREST runs a SQL function in PostgreSQL and returns JSON — no custom server code needed. The database is pre-loaded with OpenStreetMap data by the osm2pgsql importer.

---

## Where to go next

| I want to… | Go to… |
|---|---|
| Deploy for my region | [Quick Start](getting-started/quick-start.md) |
| Deploy from source | [Manual Deploy](ops/manual-deploy.md) |
| Configure environment variables | [Configuration](ops/configuration.md) |
| Fix a problem | [Troubleshooting](ops/troubleshooting.md) |
| Add a new playground device type | [Add a Device](contributing/add-device.md) |
| Understand the tech stack | [Tech Stack](reference/tech-stack.md) |
| Learn OSM terminology | [Glossary](reference/glossary.md) |
