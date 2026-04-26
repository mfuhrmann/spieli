#!/bin/sh
set -e

# App entrypoint — generates /usr/share/nginx/html/config.js from env vars,
# then starts nginx. Supports APP_MODE=standalone (default) and APP_MODE=hub.

APP_MODE="${APP_MODE:-standalone}"

# Sanitize string values interpolated into JS string literals.
# Strip anything that isn't safe for the expected value type to prevent
# single-quote breakout / code injection.
SAFE_API_BASE_URL=$(printf '%s'    "${API_BASE_URL:-}"    | tr -cd 'A-Za-z0-9:/.+_%~-')
SAFE_PARENT_ORIGIN=$(printf '%s'   "${PARENT_ORIGIN:-}"   | tr -cd 'A-Za-z0-9:/.+-')
SAFE_REGISTRY_URL=$(printf '%s'    "${REGISTRY_URL:-}"    | tr -cd 'A-Za-z0-9:/.+_%~-')
SAFE_WIKI_URL=$(printf '%s'        "${REGION_PLAYGROUND_WIKI_URL:-}" | tr -cd 'A-Za-z0-9:/.+_%~-')
SAFE_CHAT_URL=$(printf '%s'        "${REGION_CHAT_URL:-}" | tr -cd 'A-Za-z0-9:/.+_%~-')

if [ "$APP_MODE" = "hub" ]; then
    cat > /usr/share/nginx/html/config.js << JSEOF
window.APP_CONFIG = {
  appMode:           'hub',
  registryUrl:       '${SAFE_REGISTRY_URL}',
  hubPollInterval:   ${HUB_POLL_INTERVAL:-300},
  mapZoom:           ${MAP_ZOOM:-6},
  mapMinZoom:        ${MAP_MIN_ZOOM:-4},
  clusterMaxZoom:    ${CLUSTER_MAX_ZOOM:-13},
  macroMaxZoom:      ${MACRO_MAX_ZOOM:-5},
  parentOrigin:      '${SAFE_PARENT_ORIGIN}'
};
JSEOF
else
    cat > /usr/share/nginx/html/config.js << JSEOF
window.APP_CONFIG = {
  appMode:                    'standalone',
  osmRelationId:              ${OSM_RELATION_ID:-62700},
  regionPlaygroundWikiUrl:    '${SAFE_WIKI_URL:-https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground}',
  regionChatUrl:              '${SAFE_CHAT_URL}' || null,
  mapZoom:                    ${MAP_ZOOM:-12},
  mapMinZoom:                 ${MAP_MIN_ZOOM:-10},
  poiRadiusM:                 ${POI_RADIUS_M:-5000},
  apiBaseUrl:                 '${SAFE_API_BASE_URL}',
  clusterMaxZoom:             ${CLUSTER_MAX_ZOOM:-13},
  parentOrigin:               '${SAFE_PARENT_ORIGIN}'
};
JSEOF
fi

# Write placeholder federation-status.json and metrics so nginx can serve
# the endpoints immediately before the first cron tick (60 s).
WEBROOT="/usr/share/nginx/html"
INIT_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
if [ ! -f "$WEBROOT/federation-status.json" ]; then
    printf '{"generated_at":"%s","poll_interval_seconds":60,"backends":{}}\n' \
        "$INIT_TS" > "$WEBROOT/federation-status.json"
fi
if [ ! -f "$WEBROOT/metrics" ]; then
    printf '# spieli federation metrics — first poll pending\n' > "$WEBROOT/metrics"
fi

# Start crond in background (logs to stderr so Docker picks them up)
if [ "$APP_MODE" = "hub" ]; then
    crond -b -L /dev/stderr
fi

exec nginx -g 'daemon off;'
