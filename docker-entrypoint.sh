#!/bin/sh
set -e

cat > /usr/share/nginx/html/config.js << JSEOF
window.APP_CONFIG = {
  osmRelationId: ${OSM_RELATION_ID:-62700},
  regionPlaygroundWikiUrl: '${REGION_PLAYGROUND_WIKI_URL:-https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground}',
  regionChatUrl: '${REGION_CHAT_URL:-}' || null,
  mapZoom: ${MAP_ZOOM:-12},
  mapMinZoom: ${MAP_MIN_ZOOM:-10},
  poiRadiusM: ${POI_RADIUS_M:-5000},
  apiBaseUrl: '${API_BASE_URL:-}',
  parentOrigin: '${PARENT_ORIGIN:-}'
};
JSEOF

exec nginx -g 'daemon off;'
