#!/bin/sh
set -e

# Sanitize string env vars that are interpolated directly into a JS string literal.
# Only characters valid in an origin (scheme, host, port) are allowed; everything
# else is stripped to prevent single-quote breakout / code injection.
SAFE_PARENT_ORIGIN=$(printf '%s' "${PARENT_ORIGIN:-}" | tr -cd 'A-Za-z0-9:/.+-')

cat > /usr/share/nginx/html/config.js << JSEOF
window.APP_CONFIG = {
  osmRelationId: ${OSM_RELATION_ID:-62700},
  regionPlaygroundWikiUrl: '${REGION_PLAYGROUND_WIKI_URL:-https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground}',
  regionChatUrl: '${REGION_CHAT_URL:-}' || null,
  mapZoom: ${MAP_ZOOM:-12},
  mapMinZoom: ${MAP_MIN_ZOOM:-10},
  poiRadiusM: ${POI_RADIUS_M:-5000},
  apiBaseUrl: '${API_BASE_URL:-}',
  parentOrigin: '${SAFE_PARENT_ORIGIN}'
};
JSEOF

exec nginx -g 'daemon off;'
