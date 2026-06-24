## Tasks

### 1. Create `regionUrl.js` module
- New file `app/src/lib/regionUrl.js`
- `resolveRegionFromPath(pathname)` — parse path, check reserved prefixes, Nominatim search, result filtering
- Handle URL decoding, empty paths, multi-segment paths
- 3s fetch timeout, fail-open on error
- Unit tests in `app/src/lib/regionUrl.test.js`

### 2. Integrate into StandaloneApp
- Call `resolveRegionFromPath` in `onMount` before `fetchRegionInfo`
- If resolved, use the override extent for map fit instead of `OSM_RELATION_ID`
- Preserve deeplink hash precedence (existing logic unchanged)
- Update `document.title` with resolved region name

### 3. Integrate into HubApp
- Call `resolveRegionFromPath` in `onMount`, parallel to geolocation request
- If resolved, set `fitDone` gate so `tryFit` skips its normal flow
- Fit map to resolved extent after map is ready
- After backends settle, match resolved `osmId` against backend `relation_id` values; if matched, auto-highlight that backend

### 4. Relocate legal pages in nginx
- Move `/impressum` → `/legal/impressum` and `/datenschutz` → `/legal/datenschutz`
- Add permanent redirects from old paths to new paths
- Update `docker-entrypoint.app.sh` if it writes HTML to the old paths
- Verify frontend links use `impressumUrl` / `privacyUrl` from config (no hardcoded paths)

### 5. Documentation
- Add section to `docs/ops/configuration.md` explaining region URL feature
- Document the legal page URL change in release notes (breaking label: `requires-env-update` if operators hardcoded URLs)
- Update CLAUDE.md if new stores/components are added
