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
export const regionPlaygroundWikiUrl = c.regionPlaygroundWikiUrl ?? 'https://wiki.openstreetmap.org/wiki/Fulda#Spielpl%C3%A4tze';

// Optional: community chat link shown in the "Daten ergänzen" modal. Set to null to hide.
// Env var: REGION_CHAT_URL
export const regionChatUrl = c.regionChatUrl ?? 'https://matrix.to/#/#osm-fulda:matrix.org';

// --- Map display settings (less commonly changed) ---
// Env var: MAP_ZOOM
export const mapZoom = c.mapZoom ?? 12;
// Env var: MAP_MIN_ZOOM
export const mapMinZoom = c.mapMinZoom ?? 10;
