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

// Base URL for the PostgREST API (e.g. "/api" in Docker, empty string for local dev).
// When empty, the app falls back to Overpass for playground data.
export const apiBaseUrl = c.apiBaseUrl || '';

// Target origin for postMessage to a parent frame (hub embedding standalone via iframe — legacy).
export const parentOrigin = c.parentOrigin || '*';

// Default locale for the UI. When empty, falls back to navigator.language → 'en'.
export const defaultLocale = c.defaultLocale || '';

// --- Region metadata ---
//
// These describe the region whose OSM data this deployment serves, which is a
// different question from `defaultLocale` ("what language is the interface
// in"). A Fulda instance serving an English-speaking audience runs
// defaultLocale=en and keeps regionLang=de — its playgrounds are still called
// what they are called.

// BCP 47 language of the OSM data (playground names). Drives the `lang`
// attribute on OSM-derived text and, through it, CSS hyphenation.
export const regionLang = c.regionLang || 'de';

// ISO 3166-1 alpha-2 country used to resolve public holidays in
// `opening_hours` values.
export const regionCountry = c.regionCountry || 'de';

// Optional sub-country code for holiday calendars that vary by state (e.g.
// 'he' for Hessen). Empty means "pass no state", which is what the app did
// before this option existed — see docs/ops/configuration.md.
export const regionState = c.regionState || '';

// `address` for the `opening_hours` constructor, shared by every call site so
// they cannot drift apart. `state` is omitted unless configured: passing one
// would change holiday evaluation for deployments that never asked for it.
export const openingHoursAddress = regionState
    ? { country_code: regionCountry, state: regionState }
    : { country_code: regionCountry };

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
