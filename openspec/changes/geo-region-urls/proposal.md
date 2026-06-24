## Why

Cities and regions want to link directly to their playgrounds on spieli — e.g. a city website linking to `spieli.eu/fulda`. Currently the only entry point is the bare domain (which shows the hub overview) or a hash deeplink to a specific playground (`#W12345`). There is no way to link to a geographic area. Issue #661.

## What Changes

### Path-based region resolution

The app reads `window.location.pathname` on load. If a single path segment is present (e.g. `/fulda`), it resolves the name to a geographic location via Nominatim and pans the map there.

Resolution strategy:

1. Strip leading `/` → candidate name (e.g. `fulda`).
2. Skip if candidate matches a reserved path (`api`, `impressum`, `datenschutz`, `metrics`).
3. Call Nominatim: `https://nominatim.openstreetmap.org/search?q={name}&format=json&addressdetails=1&limit=5&featuretype=settlement`. The `featuretype=settlement` parameter prefers cities/villages over rivers and other features with the same name.
4. From the results, prefer the first hit with `osm_type=relation` and a `boundingbox`. Fall back to the first result with a bounding box if no relation match.
5. Transform the bounding box and fit the map view to it.
6. **Hub mode bonus**: after resolving, check if any backend's `relation_id` (from `get_meta`) matches the Nominatim result's `osm_id`, or if the result point falls inside a backend's `bbox`. If matched, treat as if that backend's region was selected (auto-open InstancePanel, highlight the backend).

### Interaction with existing deeplinks

Path and hash combine naturally: `/fulda#W12345` = resolve Fulda region, then restore playground deeplink on top. The deeplink takes precedence for map positioning (same as today's hash-vs-region-fit logic in StandaloneApp).

### Reserved paths

Move legal pages from top-level (`/impressum`, `/datenschutz`) to `/legal/impressum` and `/legal/datenschutz` to reduce namespace conflicts with region names. Update nginx config and any internal links.

## Capabilities

### New Capabilities

- `geo-region-url`: URL path segment triggers Nominatim geocode and map fit to the resolved region. Works at any OSM admin level (country, state, district, city, village). Supports any language Nominatim handles.

### Modified Capabilities

- `legal-pages`: Legal page URLs move from `/impressum` to `/legal/impressum` and `/datenschutz` to `/legal/datenschutz`.

## Impact

- **`app/src/lib/regionUrl.js`** (new) — parse pathname, Nominatim lookup, result filtering.
- **`app/src/standalone/StandaloneApp.svelte`** — call region URL resolver before region fit; resolved bbox takes precedence over configured `OSM_RELATION_ID` fit.
- **`app/src/hub/HubApp.svelte`** — call region URL resolver; match result against backends store for auto-selection.
- **`app/src/components/AppShell.svelte`** — coordinate region URL resolution with hash deeplink restore.
- **`oci/app/nginx.conf`** — move `/impressum` and `/datenschutz` to `/legal/*`. SPA fallback already handles unknown paths.
- **`oci/app/docker-entrypoint.app.sh`** — update legal page output paths if hardcoded.
- No API changes, no DB changes, no new dependencies.
- Nominatim usage follows existing `SearchBar.svelte` pattern and OSM usage policy (single request per page load, only when path segment present).
