#!/bin/sh
set -e

cat > /usr/share/nginx/html/config.js << JSEOF
window.APP_CONFIG = {
  osmRelationId: ${OSM_RELATION_ID:-62750},
  regionPlaygroundWikiUrl: '${REGION_PLAYGROUND_WIKI_URL:-}',
  regionChatUrl: '${REGION_CHAT_URL:-}' || null,
  mapZoom: ${MAP_ZOOM:-12},
  mapMinZoom: ${MAP_MIN_ZOOM:-10}
};
JSEOF

exec nginx -g 'daemon off;'
