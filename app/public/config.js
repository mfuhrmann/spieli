// Default configuration for local development.
// In Docker, docker-entrypoint.app.sh overwrites this file at container startup.
window.APP_CONFIG = {
  // 'standalone' renders the full regional app; 'hub' renders the federation map.
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

  // --- Hub mode ---
  registryUrl: './registry.json',
  hubPollInterval: 300,
  // Hub uses a wider default zoom to show all registered regions
  // mapZoom and mapMinZoom above are reused; override here if needed
};
