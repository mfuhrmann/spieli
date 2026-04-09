#!/bin/sh
set -e

cat > /usr/share/nginx/html/config.js << JSEOF
window.APP_CONFIG = {
  osmRelationId: ${OSM_RELATION_ID:-62700},
  regionPlaygroundWikiUrl: '${REGION_PLAYGROUND_WIKI_URL:-https://wiki.openstreetmap.org/wiki/Fulda#Spielpl%C3%A4tze}',
  regionChatUrl: '${REGION_CHAT_URL:-https://matrix.to/#/#osm-fulda:matrix.org}' || null,
  mapZoom: ${MAP_ZOOM:-12},
  mapMinZoom: ${MAP_MIN_ZOOM:-10}
};
JSEOF

exec nginx -g 'daemon off;'
