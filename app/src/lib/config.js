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
const DEFAULT_BASEMAP_URL =
    'https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
const DEFAULT_BASEMAP_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
    '| &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const basemapStyleUrl = c.basemapStyleUrl || '';
export const basemapUrl = c.basemapUrl || DEFAULT_BASEMAP_URL;
export const basemapAttribution = c.basemapAttribution || DEFAULT_BASEMAP_ATTRIBUTION;

// Whether the operator configured the raster source themselves, as opposed to
// inheriting the compiled-in CARTO default. The distinction matters for the
// vector fallback below: falling back to a default the operator never chose
// would send visitors to a third party they may have picked vector precisely
// to avoid. The entrypoint refuses to start if a source is configured without
// a matching attribution, so an explicit URL always carries its own licence.
export const basemapUrlIsExplicit = !!c.basemapUrl;

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
