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

// Search radius in metres for nearby POIs.
export const poiRadiusM = c.poiRadiusM ?? 5000;

// Base URL for the PostgREST API (e.g. "/api" in Docker, empty string for local dev).
// When empty, the app falls back to Overpass for playground data.
export const apiBaseUrl = c.apiBaseUrl || '';

// Target origin for postMessage to a parent frame (hub embedding standalone via iframe — legacy).
export const parentOrigin = c.parentOrigin || '*';

// Default locale for the UI. When empty, falls back to navigator.language → 'en'.
export const defaultLocale = c.defaultLocale || '';

// --- Hub ---

// URL of the registry JSON file listing backends.
export const registryUrl = c.registryUrl ?? './registry.json';

// How often (seconds) to re-fetch playground data from all backends.
export const hubPollInterval = c.hubPollInterval ?? 300;

// --- Tiered playground delivery (P1) ---

// Zoom thresholds for the three-tier client orchestrator:
//   zoom ≤ clusterMaxZoom  → cluster layer (get_playground_clusters)
//   clusterMaxZoom+1 … centroidMaxZoom → centroid layer (get_playground_centroids)
//   zoom > centroidMaxZoom → polygon layer (get_playgrounds_bbox)
export const clusterMaxZoom  = c.clusterMaxZoom  ?? 10;
export const centroidMaxZoom = c.centroidMaxZoom ?? 13;
