#!/bin/sh
set -e

# App entrypoint — generates /usr/share/nginx/html/config.js from env vars,
# then starts nginx. Supports APP_MODE=standalone (default) and APP_MODE=hub.

APP_MODE="${APP_MODE:-standalone}"
WEBROOT="/usr/share/nginx/html"

# Sanitize string values interpolated into JS string literals.
# Strip anything that isn't safe for the expected value type to prevent
# single-quote breakout / code injection.
#
# safe_url keeps full URL syntax including query strings and fragments —
# Matrix links (https://matrix.to/#/#room:server) and wiki links with
# anchors are otherwise silently mangled. Quotes, backslashes, angle
# brackets and whitespace stay stripped, which is what makes the value
# safe inside a single-quoted JS string literal.
safe_url() { printf '%s' "$1" | tr -cd 'A-Za-z0-9:/.+_%~?#&=@,;-'; }

SAFE_API_BASE_URL=$(safe_url  "${API_BASE_URL:-}")
# PARENT_ORIGIN is an origin (scheme://host[:port]) used for postMessage
# targeting — no path, query or fragment allowed, so it keeps a tighter set.
SAFE_PARENT_ORIGIN=$(printf '%s'   "${PARENT_ORIGIN:-}"   | tr -cd 'A-Za-z0-9:/.+-')
SAFE_REGISTRY_URL=$(safe_url  "${REGISTRY_URL:-}")
SAFE_WIKI_URL=$(safe_url      "${REGION_PLAYGROUND_WIKI_URL:-}")
SAFE_CHAT_URL=$(safe_url      "${REGION_CHAT_URL:-}")

# Legal URLs — IMPRESSUM_URL / PRIVACY_URL override env vars take priority.
# If unset, construct from SITE_URL + path (assuming nginx serves the
# generated files at /legal/impressum and /legal/datenschutz).
SAFE_SITE_URL=$(safe_url "${SITE_URL:-}")
if [ -n "${IMPRESSUM_URL:-}" ]; then
    SAFE_IMPRESSUM_URL=$(safe_url "${IMPRESSUM_URL}")
elif [ -n "$SAFE_SITE_URL" ]; then
    SAFE_IMPRESSUM_URL="${SAFE_SITE_URL}/legal/impressum"
else
    SAFE_IMPRESSUM_URL="/legal/impressum"
fi
if [ -n "${PRIVACY_URL:-}" ]; then
    SAFE_PRIVACY_URL=$(safe_url "${PRIVACY_URL}")
elif [ -n "$SAFE_SITE_URL" ]; then
    SAFE_PRIVACY_URL="${SAFE_SITE_URL}/legal/datenschutz"
else
    SAFE_PRIVACY_URL="/legal/datenschutz"
fi

# safe_tile_url keeps everything safe_url keeps, plus braces: an XYZ template
# is "{z}/{x}/{y}" and often carries a "{a-d}" subdomain group, so stripping
# braces would silently turn a valid template into a broken literal URL.
safe_tile_url() { printf '%s' "$1" | tr -cd 'A-Za-z0-9:/.+_%~?#&=@,;{}-'; }

# Attribution is operator-supplied HTML (it must carry <a href> links), so it
# cannot be reduced to an alphanumeric set. Single quotes and backslashes are
# stripped because the value is emitted inside a single-quoted JS literal, and
# newlines because they would break that literal across lines.
safe_attribution() { printf '%s' "$1" | tr -d "'\\\\" | tr -d '\n\r'; }

# ── Basemap ───────────────────────────────────────────────────────────────────
# Three delivery modes, resolved here so the frontend needs no knowledge of them:
#   direct   — BASEMAP_URL / BASEMAP_STYLE_URL point at a third party.
#   proxied  — BASEMAP_PROXY_UPSTREAM set: nginx serves /tiles/, and the
#              frontend is pointed at that same-origin path instead.
#   mirrored — BASEMAP_STYLE_URL points at a locally served style.
# BASEMAP_TILE_PROVIDER_HOST is derived for the privacy page, which must name
# the host the visitor's browser actually contacts — nobody, when proxied.
SAFE_BASEMAP_URL=$(safe_tile_url "${BASEMAP_URL:-}")
SAFE_BASEMAP_STYLE_URL=$(safe_tile_url "${BASEMAP_STYLE_URL:-}")
SAFE_BASEMAP_ATTRIBUTION=$(safe_attribution "${BASEMAP_ATTRIBUTION:-}")
SAFE_BASEMAP_PROXY_UPSTREAM=$(safe_tile_url "${BASEMAP_PROXY_UPSTREAM:-}")

if [ -n "$SAFE_BASEMAP_PROXY_UPSTREAM" ]; then
    # Same-origin path; the browser never learns the upstream host.
    SAFE_BASEMAP_URL="/tiles/{z}/{x}/{y}.png"
    BASEMAP_TILE_PROVIDER_HOST=""
else
    # Host shown on the privacy page: the style URL wins when both are set,
    # matching the precedence in app/src/lib/config.js.
    _basemap_effective="${SAFE_BASEMAP_STYLE_URL:-$SAFE_BASEMAP_URL}"
    if [ -z "$_basemap_effective" ]; then
        _basemap_effective="https://basemaps.cartocdn.com/"
    fi
    BASEMAP_TILE_PROVIDER_HOST=$(printf '%s' "$_basemap_effective" \
        | sed -e 's#^[a-zA-Z]*://##' -e 's#/.*##' -e 's#^{[^}]*}\.##')
    # A relative style path means the instance serves it itself.
    case "$_basemap_effective" in /*) BASEMAP_TILE_PROVIDER_HOST="" ;; esac
fi

# ── Basemap proxy nginx config ────────────────────────────────────────────────
# Both files are always written so the include in nginx.conf never fails.
BASEMAP_CACHE_MAX_SIZE=$(printf '%s' "${BASEMAP_CACHE_MAX_SIZE:-4g}" | tr -cd 'A-Za-z0-9')
# keys_zone holds roughly 8000 keys per MB and binds before disk does: a large
# max_size behind a small keys_zone yields a cache that stays almost empty.
BASEMAP_CACHE_KEYS_ZONE=$(printf '%s' "${BASEMAP_CACHE_KEYS_ZONE:-64m}" | tr -cd 'A-Za-z0-9')
BASEMAP_CACHE_INACTIVE=$(printf '%s' "${BASEMAP_CACHE_INACTIVE:-90d}" | tr -cd 'A-Za-z0-9')

if [ -n "$SAFE_BASEMAP_PROXY_UPSTREAM" ]; then
    mkdir -p /var/cache/nginx/tiles
    cat > /etc/nginx/conf.d/10-tiles-cache.conf <<CACHEEOF
# Generated by docker-entrypoint.sh. http-context directives for the tile cache.
proxy_cache_path /var/cache/nginx/tiles levels=2:2 keys_zone=tiles:${BASEMAP_CACHE_KEYS_ZONE}
                 max_size=${BASEMAP_CACHE_MAX_SIZE} inactive=${BASEMAP_CACHE_INACTIVE} use_temp_path=off;
CACHEEOF

    cat > /etc/nginx/tiles-location.conf <<TILEEOF
# Generated by docker-entrypoint.sh — proxied basemap delivery.
location /tiles/ {
    # Access logging is OFF deliberately, and this is a correctness property
    # rather than a tuning choice. Proxying moves the visitor's tile stream
    # onto this server; at high zoom that z/x/y sequence is not metadata about
    # what they viewed, it IS what they viewed. Logging it would build a
    # per-visitor location trail on the operator's disk, which is worse than
    # the third-party delivery proxying replaces. Errors are still logged.
    access_log off;

    set \$tiles_upstream ${SAFE_BASEMAP_PROXY_UPSTREAM};
    rewrite ^/tiles/(.*)\$ /\$1 break;
    proxy_pass \$tiles_upstream;

    # The operator's server is the client here, not a browser, so it
    # identifies itself rather than forwarding the visitor's identity.
    proxy_set_header User-Agent "spieli/basemap-proxy (+https://github.com/mfuhrmann/spieli)";
    proxy_set_header Host       \$proxy_host;
    proxy_set_header Referer    "";
    proxy_hide_header Set-Cookie;
    proxy_hide_header Cookie;

    proxy_cache tiles;
    proxy_cache_valid 200 30d;
    proxy_cache_valid 404 1h;
    proxy_cache_revalidate on;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_cache_lock on;
    add_header X-Cache-Status \$upstream_cache_status;

    # No fallback to direct delivery exists anywhere: if the upstream is
    # unreachable the tile fails and the map renders without a basemap. A
    # fallback would leak exactly the addresses proxying was enabled to
    # protect, at the moment something is already wrong.
    proxy_connect_timeout 5s;
    proxy_read_timeout   20s;

    expires 30d;
    add_header Cache-Control "public, max-age=2592000";
}
TILEEOF
else
    printf '# Basemap proxying disabled (BASEMAP_PROXY_UPSTREAM unset).\n' \
        > /etc/nginx/tiles-location.conf
    rm -f /etc/nginx/conf.d/10-tiles-cache.conf
fi

# js_or_null <value> — emits a JS string literal or null.
js_or_null() { [ -n "$1" ] && printf "'%s'" "$1" || printf 'null'; }

if [ "$APP_MODE" = "hub" ]; then
    cat > "$WEBROOT/config.js" << JSEOF
window.APP_CONFIG = {
  appMode:           'hub',
  registryUrl:       '${SAFE_REGISTRY_URL}',
  hubPollInterval:   ${HUB_POLL_INTERVAL:-300},
  mapZoom:           ${MAP_ZOOM:-6},
  mapMinZoom:        ${MAP_MIN_ZOOM:-4},
  clusterMaxZoom:    ${CLUSTER_MAX_ZOOM:-13},
  macroMaxZoom:      ${MACRO_MAX_ZOOM:-7},
  basemapStyleUrl:   '${SAFE_BASEMAP_STYLE_URL}',
  basemapUrl:        '${SAFE_BASEMAP_URL}',
  basemapAttribution:'${SAFE_BASEMAP_ATTRIBUTION}',
  parentOrigin:      '${SAFE_PARENT_ORIGIN}',
  impressumUrl:      $(js_or_null "$SAFE_IMPRESSUM_URL"),
  privacyUrl:        $(js_or_null "$SAFE_PRIVACY_URL")
};
JSEOF
else
    cat > "$WEBROOT/config.js" << JSEOF
window.APP_CONFIG = {
  appMode:                    'standalone',
  osmRelationId:              ${OSM_RELATION_ID:-62700},
  regionPlaygroundWikiUrl:    '${SAFE_WIKI_URL:-https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground}',
  regionChatUrl:              '${SAFE_CHAT_URL}' || null,
  mapZoom:                    ${MAP_ZOOM:-12},
  mapMinZoom:                 ${MAP_MIN_ZOOM:-7},
  poiRadiusM:                 ${POI_RADIUS_M:-5000},
  apiBaseUrl:                 '${SAFE_API_BASE_URL}',
  clusterMaxZoom:             ${CLUSTER_MAX_ZOOM:-13},
  basemapStyleUrl:            '${SAFE_BASEMAP_STYLE_URL}',
  basemapUrl:                 '${SAFE_BASEMAP_URL}',
  basemapAttribution:         '${SAFE_BASEMAP_ATTRIBUTION}',
  parentOrigin:               '${SAFE_PARENT_ORIGIN}',
  impressumUrl:               $(js_or_null "$SAFE_IMPRESSUM_URL"),
  privacyUrl:                 $(js_or_null "$SAFE_PRIVACY_URL")
};
JSEOF
fi

# ── Generate legal pages ───────────────────────────────────────────────────────
# Sanitize legal contact vars for HTML interpolation (escape < > & ").
html_escape() { printf '%s' "$1" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g'; }

SAFE_IMP_NAME=$(html_escape "${IMPRESSUM_NAME:-}")
SAFE_IMP_ORG=$(html_escape "${IMPRESSUM_ORG:-}")
SAFE_IMP_ADDRESS=$(html_escape "${IMPRESSUM_ADDRESS:-}")
SAFE_IMP_EMAIL=$(html_escape "${IMPRESSUM_EMAIL:-}")
SAFE_IMP_PHONE=$(html_escape "${IMPRESSUM_PHONE:-}")

if [ -z "${IMPRESSUM_URL:-}" ]; then
    if [ -n "$SAFE_IMP_NAME" ] && [ -n "$SAFE_IMP_ADDRESS" ]; then
        {
            printf '<!DOCTYPE html>\n<html lang="de">\n<head>\n'
            printf '  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
            printf '  <title>Impressum</title>\n'
            printf '  <style>body{font-family:sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#222}h1{font-size:1.6rem}a{color:#1a6b3a}</style>\n'
            printf '</head>\n<body>\n  <h1>Impressum</h1>\n'
            printf '  <p>%s</p>\n' "$SAFE_IMP_NAME"
            [ -n "$SAFE_IMP_ORG" ]     && printf '  <p>%s</p>\n' "$SAFE_IMP_ORG"
            printf '  <p>%s</p>\n' "$SAFE_IMP_ADDRESS"
            [ -n "$SAFE_IMP_EMAIL" ]   && printf '  <p>E-Mail: <a href="mailto:%s">%s</a></p>\n' "$SAFE_IMP_EMAIL" "$SAFE_IMP_EMAIL"
            [ -n "$SAFE_IMP_PHONE" ]   && printf '  <p>Tel: %s</p>\n' "$SAFE_IMP_PHONE"
            printf '</body>\n</html>\n'
        } > "$WEBROOT/impressum.html"
    else
        {
            printf '<!DOCTYPE html>\n<html lang="de">\n<head>\n'
            printf '  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
            printf '  <title>Impressum</title>\n'
            printf '  <style>body{font-family:sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#222}h1{font-size:1.6rem}</style>\n'
            printf '</head>\n<body>\n  <h1>Impressum</h1>\n'
            printf '  <p>Kontaktdaten des Betreibers wurden noch nicht konfiguriert.</p>\n'
            printf '</body>\n</html>\n'
        } > "$WEBROOT/impressum.html"
    fi
fi

if [ -z "${PRIVACY_URL:-}" ]; then
    if [ -n "$SAFE_IMP_NAME" ] && [ -n "$SAFE_IMP_EMAIL" ] && [ -f /datenschutz.template.html ]; then
        # Build hub privacy section into a temp file; awk inlines it at
        # {{HUB_PRIVACY_SECTION}} — avoids sed multiline / & escaping issues.
        HUB_SECTION_FILE=$(mktemp)
        if [ "$APP_MODE" = "hub" ]; then
            cat > "$HUB_SECTION_FILE" <<'HUB_HTML'
  <h2>Hub-Modus: Mehrere Instanzen</h2>
  <p>Diese Instanz betreibt einen Hub, der Daten von mehreren unabhängigen Backends lädt. Die jeweiligen Betreiber der eingebundenen Instanzen sowie die Dienste <a href="https://www.openstreetmap.org/" target="_blank" rel="noopener">OpenStreetMap</a> und <a href="https://panoramax.xyz/" target="_blank" rel="noopener">Panoramax</a> können dabei Zugriffsdaten protokollieren. Die Datenschutzerklärungen der jeweiligen Betreiber sind maßgeblich.</p>

HUB_HTML
        fi
        # Escape & and / so they are literal in the sed replacement position.
        SAFE_IMP_NAME_FOR_SED=$(printf '%s'  "$SAFE_IMP_NAME"  | sed 's/[\/&]/\\&/g')
        SAFE_IMP_EMAIL_FOR_SED=$(printf '%s' "$SAFE_IMP_EMAIL" | sed 's/[\/&]/\\&/g')
        sed \
            -e "s/{{IMPRESSUM_NAME}}/$SAFE_IMP_NAME_FOR_SED/g" \
            -e "s/{{IMPRESSUM_EMAIL}}/$SAFE_IMP_EMAIL_FOR_SED/g" \
            /datenschutz.template.html | \
        awk -v hubfile="$HUB_SECTION_FILE" '
            /\{\{HUB_PRIVACY_SECTION\}\}/ {
                while ((getline line < hubfile) > 0) print line
                close(hubfile)
                next
            }
            { print }
        ' > "$WEBROOT/datenschutz.html"
        rm -f "$HUB_SECTION_FILE"
    else
        {
            printf '<!DOCTYPE html>\n<html lang="de">\n<head>\n'
            printf '  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
            printf '  <title>Datenschutzerkl\303\244rung</title>\n'
            printf '  <style>body{font-family:sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#222}h1{font-size:1.6rem}</style>\n'
            printf '</head>\n<body>\n'
            printf '  <h1>Datenschutzerkl\303\244rung</h1>\n'
            printf '  <p>Die Datenschutzerkl\303\244rung des Betreibers wurde noch nicht konfiguriert.</p>\n'
            printf '</body>\n</html>\n'
        } > "$WEBROOT/datenschutz.html"
    fi
fi

# Write placeholder federation-status.json and metrics so nginx can serve
# the endpoints immediately before the first cron tick (60 s).
#
# The placeholder /metrics MUST emit a valid `spielplatz_poll_generated_timestamp`
# gauge — operators alerting on `time() - spielplatz_poll_generated_timestamp > N`
# need a real value during the boot window, otherwise a crashed cron during
# startup cannot be distinguished from a healthy hub before its first tick.
INIT_TS_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
INIT_TS_UNIX=$(date -u +%s)
if [ ! -f "$WEBROOT/federation-status.json" ]; then
    printf '{"generated_at":"%s","poll_interval_seconds":60,"backends":{}}\n' \
        "$INIT_TS_ISO" > "$WEBROOT/federation-status.json"
fi
if [ ! -f "$WEBROOT/metrics" ]; then
    {
        printf '# HELP spielplatz_poll_generated_timestamp Unix timestamp when this scrape was generated.\n'
        printf '# TYPE spielplatz_poll_generated_timestamp gauge\n'
        printf 'spielplatz_poll_generated_timestamp %s\n' "$INIT_TS_UNIX"
    } > "$WEBROOT/metrics"
fi

# Start crond in background, but only when the hub is actually polling (in
# standalone mode there's nothing to poll and the placeholder above stands
# in as a "polling not configured" sentinel — the placeholder's
# `spielplatz_poll_generated_timestamp` will quickly age past any sensible
# stale-observation threshold, which is the right signal for an operator
# scraping a non-hub container by mistake). Logs go to stderr so Docker
# picks them up; foreground supervision is not used (single-process
# container with a daemonised cron is the established pattern here).
if [ "$APP_MODE" = "hub" ]; then
    crond -b -L /dev/stderr
fi

exec nginx -g 'daemon off;'
