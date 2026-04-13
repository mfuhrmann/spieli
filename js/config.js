// Configuration is injected at runtime via window.APP_CONFIG (set by public/config.js).
// In Docker, docker-entrypoint.sh overwrites public/config.js from environment variables.
// Fallback values are used for local development without a container.
const c = (typeof window !== 'undefined' && window.APP_CONFIG) || {};

// OSM relation ID of the region to display.
// Find it at https://www.openstreetmap.org/relation/<id> or by searching on https://nominatim.openstreetmap.org
// Env var: OSM_RELATION_ID
export const osmRelationId = c.osmRelationId ?? 62700;

// Optional: shown in the "Daten ergänzen" modal.
// Defaults to the generic OSM playground wiki page if not set.
// Env var: REGION_PLAYGROUND_WIKI_URL
export const regionPlaygroundWikiUrl = c.regionPlaygroundWikiUrl ?? 'https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground';

// Optional: community chat link shown in the "Daten ergänzen" modal. Set to null to hide.
// Env var: REGION_CHAT_URL
export const regionChatUrl = c.regionChatUrl ?? null;

// --- Map display settings (less commonly changed) ---
// Env var: MAP_ZOOM
export const mapZoom = c.mapZoom ?? 12;
// Env var: MAP_MIN_ZOOM
export const mapMinZoom = c.mapMinZoom ?? 10;

// Search radius in metres for nearby POIs (toilets, bus stops, ice cream, etc.).
// Env var: POI_RADIUS_M
export const poiRadiusM = c.poiRadiusM ?? 5000;

// Base URL for the PostgREST API (e.g. "/api" in Docker, empty string for local dev).
// When empty, API calls use relative URLs (e.g. /rpc/get_playgrounds) against the same origin.
// Env var: API_BASE_URL
export const apiBaseUrl = c.apiBaseUrl || '';

// Target origin for postMessage calls to a parent iframe (e.g. Spielplatzkarte Hub).
// Defaults to window.location.origin (same-origin only) when PARENT_ORIGIN is not set.
// Set PARENT_ORIGIN to the Hub's full origin (e.g. https://hub.example.com) in production.
// Env var: PARENT_ORIGIN
export const parentOrigin = c.parentOrigin || window.location.origin;
