## Architecture

### URL parsing

New module `app/src/lib/regionUrl.js` exports a single function:

```
resolveRegionFromPath(pathname) → Promise<{ name, extent, osmId } | null>
```

1. Extract first path segment: `/fulda` → `"fulda"`, `/legal/impressum` → `"legal"` (reserved, skip).
2. Check against reserved prefixes: `api`, `legal`, `metrics`. Return `null` if matched.
3. Nominatim search: `https://nominatim.openstreetmap.org/search?q={segment}&format=json&limit=5&featuretype=settlement`.
4. Pick best result: prefer `osm_type === "relation"` with `class === "boundary"` or `class === "place"`. Fall back to first result with a `boundingbox`.
5. Return `{ name: result.display_name, extent: [minLon, minLat, maxLon, maxLat], osmId: Number(result.osm_id) }`.
6. Return `null` if no results or Nominatim errors (fail-open — app loads normally).

### Integration points

**Standalone mode** (`StandaloneApp.svelte`):

The existing flow is: `onMount` → `fetchRegionInfo(osmRelationId)` → fit to region extent. Insert region-URL resolution before this:

```
const regionOverride = await resolveRegionFromPath(window.location.pathname);
if (regionOverride) {
  // Use resolved extent instead of configured OSM_RELATION_ID extent
  regionExtent = transformExtent(regionOverride.extent, ...);
} else {
  // Existing flow: fetchRegionInfo(osmRelationId)
}
```

The deeplink hash check (`parseHash(window.location.hash)`) stays before the await, unchanged.

**Hub mode** (`HubApp.svelte`):

Insert region-URL resolution into the `onMount` flow, parallel to the geolocation request. If a region URL resolves:

1. Fit the map to the resolved extent (skip the normal `tryFit` aggregated-bbox flow).
2. After backends settle, check if any backend's `relation_id` matches `regionOverride.osmId` or if the resolved center point falls within a backend's `bbox`. If matched, programmatically select that backend in the InstancePanel.

Region URL takes precedence over geolocation. Priority order:
1. Hash deeplink (specific playground)
2. Region URL path (`/fulda`)
3. Geolocation (user's current position)
4. Aggregated bbox fallback

### Legal page relocation

- nginx: `/impressum` → `/legal/impressum`, `/datenschutz` → `/legal/datenschutz`
- `docker-entrypoint.app.sh`: update output paths for generated HTML (if applicable)
- `config.js` defaults: no change needed — `impressumUrl` and `privacyUrl` are operator-configured, not hardcoded. Operators update `.env` to point to `/legal/*`.
- Maintain redirects: add `rewrite ^/(impressum|datenschutz)$ /legal/$1 permanent;` in nginx for backwards compatibility.

### Edge cases

- **Multiple Nominatim results**: `featuretype=settlement` narrows to places; prefer `osm_type=relation` (admin boundary) over `osm_type=node` (place node).
- **No results**: Fail-open — app loads as if no path was given.
- **Nominatim rate limit / timeout**: Fail-open with 3s timeout, same as existing SearchBar pattern.
- **Candidate matches reserved path**: Skip resolution, let nginx handle it.
- **Path has multiple segments**: Only process single-segment paths (`/fulda`). Multi-segment paths (`/fulda/something`) are ignored (reserved for future use).
- **URL encoding**: Decode `%C3%BC` etc. via `decodeURIComponent` before Nominatim query. Supports `spieli.eu/münchen`.

### Decisions

- **No caching**: One Nominatim call per page load. Simple. If performance becomes an issue, add a service-worker cache later.
- **No server-side resolution**: Pure client-side. Keeps the stack simple (static nginx + SPA). No need for a proxy or SSR.
- **Accept language**: Use browser's `navigator.language` for Nominatim `accept-language` header, matching SearchBar behavior.
