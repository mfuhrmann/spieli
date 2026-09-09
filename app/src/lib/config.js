// Runtime configuration injected via window.APP_CONFIG (set by public/config.js or docker-entrypoint.app.sh).
// Fallback values are used for local development without a container.
const c = (typeof window !== 'undefined' && window.APP_CONFIG) || {};

// 'standalone' | 'hub'
export const appMode = c.appMode ?? 'standalone';

// --- Standalone ---

// OSM relation ID of the region to display.
export const osmRelationId = c.osmRelationId ?? 62700;

// Optional: shown in the "Daten ergänzen" modal.
export const regionPlaygroundWikiUrl = c.regionPlaygroundWikiUrl ?? 'https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground';

// Optional: community chat link shown in the "Daten ergänzen" modal. null to hide.
export const regionChatUrl = c.regionChatUrl || null;

export const mapZoom = c.mapZoom ?? 12;
export const mapMinZoom = c.mapMinZoom ?? 10;
export const mapMaxZoom = c.mapMaxZoom ?? 21;

// Search radius in metres for nearby POIs.
export const poiRadiusM = c.poiRadiusM ?? 5000;

// --- Basemap ---------------------------------------------------------------
// Two configuration shapes. `basemapStyleUrl` points at a MapLibre style
// document and renders vector tiles via ol-mapbox-style; `basemapUrl` is an
// OpenLayers XYZ raster template. OL substitutes {z}/{x}/{y} and {a-d} by name,
// so a provider using a reversed {z}/{y}/{x} axis order needs no code branch.
//
// Style wins when both are set — it is the more specific of the two, and an
// operator who adds a style URL to an existing raster config means to switch.
// The default basemap is the vendored vector style, served by this instance.
// There is no raster default: no keyless raster provider covers the
// federation's area (basemap.de is Germany-only and answers 200 with a blank
// tile outside it), so a raster default would have to be a keyed commercial
// one — which is what this change exists to remove.
const DEFAULT_BASEMAP_STYLE_URL = '/basemap/style.json';
const DEFAULT_BASEMAP_ATTRIBUTION =
    '&copy; <a href="https://openfreemap.org/">OpenFreeMap</a> ' +
    '&copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> | ' +
    'Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Precedence, in order:
//   1. an explicitly configured style   → vector
//   2. an explicitly configured raster  → raster (the style default steps aside,
//      otherwise setting BASEMAP_URL alone would silently still render vector)
//   3. neither                          → the vendored vector style
const _styleConfigured = !!c.basemapStyleUrl;
const _rasterConfigured = !!c.basemapUrl;

export const basemapStyleUrl = _styleConfigured
    ? c.basemapStyleUrl
    : (_rasterConfigured ? '' : DEFAULT_BASEMAP_STYLE_URL);
// No default: raster is opt-in, and doubles as the fallback when a configured
// style fails to load (see basemapUrlIsExplicit below).
export const basemapUrl = c.basemapUrl || '';
export const basemapAttribution = c.basemapAttribution || DEFAULT_BASEMAP_ATTRIBUTION;

// Whether the OPERATOR named a credit, as opposed to falling back to the
// default above. A vector source declares its own attribution in its TileJSON
// and that is authoritative — tiles.openfreemap.org and a self-hosted
// tileserver return different, individually correct values. Overriding that
// with a compiled-in constant credits whoever the constant happens to name,
// which is how a map built from our own Planetiler tiles ended up crediting
// OpenFreeMap. So the default is a LAST RESORT for the raster path, which has
// no TileJSON to ask, and the vector path only overrides on an explicit value.
export const basemapAttributionIsExplicit = !!c.basemapAttribution;

// Whether the operator configured a raster source at all. There is no raster
// default, so this is the only way a raster basemap exists — and it is what
// the vector path falls back to when a style fails to load. With nothing
// configured there is nothing to fall back to, and the map renders without a
// basemap rather than reaching for some third party the operator never chose.
export const basemapUrlIsExplicit = !!c.basemapUrl;

// The "a configured source carries its own attribution" rule is enforced by the
// container entrypoint, which refuses to start without it. That guard does not
// exist in `make dev` or when app/public/config.js is edited by hand, where the
// same mistake silently renders the default credit over another provider's tiles.
// Warn rather than throw: a dev server should not be bricked by a licence
// nit, but the mistake must not be invisible either.
// A same-origin style is spieli's own bundled default, which ships with a
// matching credit — the rule is about an operator pointing at a provider whose
// attribution we cannot know. Without this the warning fires on every default
// deployment, and its own text ("the entrypoint refuses to start on this")
// would be false, since the entrypoint deliberately exempts the default.
// `//host/style.json` starts with '/' but is a scheme-relative THIRD-PARTY URL,
// not a same-origin path — treating it as bundled suppresses the warning for
// exactly the case it exists to catch. The entrypoint's host_of() makes the
// same distinction server-side.
const _isSameOriginPath = (u) => u.startsWith('/') && !u.startsWith('//');
const _operatorConfiguredSource =
    !!c.basemapUrl || (!!c.basemapStyleUrl && !_isSameOriginPath(c.basemapStyleUrl));
if (_operatorConfiguredSource && !c.basemapAttribution && typeof console !== 'undefined') {
    console.warn(
        '[spieli] A basemap source is configured but basemapAttribution is empty, ' +
        'so the default OpenFreeMap + OpenStreetMap credit is being shown over it. ' +
        'Attribution is a licence obligation — set basemapAttribution to match ' +
        'the configured provider. (The container entrypoint refuses to start on this.)',
    );
}

// True when a vector style is configured. Map.svelte builds a VectorTileLayer
// in that case and a raster TileLayer otherwise.
export const basemapIsVector = !!basemapStyleUrl;

// Base URL for the PostgREST API (e.g. "/api" in Docker, empty string for local dev).
// When empty, the app falls back to Overpass for playground data.
export const apiBaseUrl = c.apiBaseUrl || '';

// Target origin for postMessage to a parent frame (hub embedding standalone via iframe — legacy).
export const parentOrigin = c.parentOrigin || '*';

// Default locale for the UI. When empty, falls back to navigator.language → 'en'.
export const defaultLocale = c.defaultLocale || '';

// Legal pages — null hides the LegalButton entirely.
export const impressumUrl = c.impressumUrl || null;
export const privacyUrl   = c.privacyUrl   || null;

// --- Hub ---

// URL of the registry JSON file listing backends.
export const registryUrl = c.registryUrl ?? './registry.json';

// How often (seconds) to re-fetch playground data from all backends.
export const hubPollInterval = c.hubPollInterval ?? 300;

// --- Tiered playground delivery (P1) ---

// Zoom threshold for the two-tier client orchestrator:
//   zoom ≤ clusterMaxZoom → cluster layer (get_playground_clusters)
//   zoom >  clusterMaxZoom → polygon layer (get_playgrounds_bbox)
export const clusterMaxZoom = c.clusterMaxZoom ?? 13;

// --- Federated clustering (P2, hub mode only) ---

// Below this zoom the hub renders a country-level macro view (one ring per
// backend at its bbox centroid, sized by playground_count) and the
// orchestrator skips per-tier fetches entirely.
//   zoom ≤ macroMaxZoom              → macro view (no fan-out)
//   macroMaxZoom < zoom ≤ clusterMaxZoom → cluster tier fan-out
//   zoom >  clusterMaxZoom            → polygon tier fan-out
export const macroMaxZoom = c.macroMaxZoom ?? 7;
