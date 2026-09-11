// Default configuration for local development.
// In Docker, docker-entrypoint.app.sh overwrites this file at container startup.
window.APP_CONFIG = {
  // 'standalone' renders the full regional app; 'hub' renders the federation map.
  // Switch to 'hub' to test Hub mode locally (requires Docker stack on port 8080).
  appMode: 'standalone',

  // --- Standalone mode ---
  osmRelationId: 62700,
  regionPlaygroundWikiUrl: 'https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground',
  regionChatUrl: '',
  mapZoom: 12,
  mapMinZoom: 10,
  poiRadiusM: 5000,
  // Empty = use Overpass fallback (no PostgREST required for local dev)
  apiBaseUrl: '',
  parentOrigin: '',

  // UI language. Empty = auto-detect from browser. Supported: 'de', 'en'.
  defaultLocale: '',

  // Region metadata — what the served OSM data is, not what the UI is in.
  // regionLang is the language playgrounds are named in (drives `lang` on
  // OSM-derived text and CSS hyphenation); regionCountry/regionState resolve
  // public holidays in `opening_hours`. Empty regionState = library default.
  regionLang: 'de',
  regionCountry: 'de',
  regionState: '',

  // --- Hub mode ---
  registryUrl: './registry.json',
  hubPollInterval: 300,
  // Hub uses a wider default zoom to show all registered regions
  // mapZoom and mapMinZoom above are reused; override here if needed

  // --- Basemap ---
  // Two shapes, checked in this order:
  //   basemapStyleUrl — a MapLibre style document, rendered as vector tiles.
  //                     This is the default: the vendored style in public/basemap.
  //   basemapUrl      — an OpenLayers XYZ raster template. Placeholders are
  //                     substituted by name, so a provider using {z}/{y}/{x}
  //                     needs no code change. Setting it alone REPLACES the
  //                     vector default; it is only a fallback for a failed
  //                     style when basemapStyleUrl is also set explicitly.
  // Setting basemapStyleUrl wins.
  basemapStyleUrl: '/basemap/style.json',
  basemapUrl: '',
  basemapAttribution:
    '&copy; <a href="https://openfreemap.org/">OpenFreeMap</a> ' +
    '&copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> | ' +
    'Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',

  // --- Tiered playground delivery (standalone mode in P1) ---
  // Two tiers: cluster (zoom ≤ 13) and polygon (zoom > 13).
  clusterMaxZoom: 13,

  // --- Federated clustering (hub mode, P2) ---
  // Zoom ≤ macroMaxZoom shows the country-level macro view (one ring per
  // backend) and the orchestrator skips per-tier fetches entirely.
  macroMaxZoom: 7,
};
