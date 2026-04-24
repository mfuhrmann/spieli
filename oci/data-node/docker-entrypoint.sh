#!/bin/sh
set -e

# Data node entrypoint — no config.js generation.
# Optional: register this instance with a spieli-hub on startup.

if [ -n "${HUB_URL:-}" ] && [ -n "${INSTANCE_URL:-}" ]; then
    SAFE_INSTANCE_URL=$(printf '%s' "$INSTANCE_URL" | tr -cd 'A-Za-z0-9:/.+_%~-')
    SAFE_DISPLAY_NAME=$(printf '%s' "${DISPLAY_NAME:-spieli}" | tr -cd 'A-Za-z0-9 :/.+_%~()\-')
    printf 'Registering with hub at %s ...\n' "$HUB_URL"
    curl -sf -X POST "$HUB_URL/api/register" \
        -H 'Content-Type: application/json' \
        -d "{\"url\":\"$SAFE_INSTANCE_URL\",\"name\":\"$SAFE_DISPLAY_NAME\"}" \
        || printf 'Warning: hub registration failed (hub may not be running)\n'
fi

exec nginx -g 'daemon off;'
