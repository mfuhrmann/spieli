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


# ── Basemap ───────────────────────────────────────────────────────────────────
# Sanitisers. safe_tile_url keeps everything safe_url keeps plus braces, because
# an XYZ template is "{z}/{x}/{y}" and often carries a "{a-d}" subdomain group;
# stripping braces would silently turn a valid template into a broken literal.
safe_tile_url() { printf '%s' "$1" | tr -cd 'A-Za-z0-9:/.+_%~?#&=@,{}-'; }

# The proxy origin is never a template and is interpolated into generated nginx
# config, so it gets a much tighter set than a tile URL: no braces, no
# semicolons, nothing that could close a directive or open a block.
safe_origin() { printf '%s' "$1" | tr -cd 'A-Za-z0-9:/._-'; }

# require_origin <name> <value> — reject rather than strip. Everything else in
# this feature fails closed, and stripping fails quietly-wrong: userinfo
# (https://user:pw@host -> https://userpw) and IPv6 literals
# (http://[::1]:8080 -> http://::18080) both survive as a DIFFERENT origin that
# nginx then proxies to, with nothing in the logs saying so.
require_origin() {
    _name=$1 _val=$2
    [ "$(safe_origin "$_val")" = "$_val" ] || \
        die "$_name contains characters that are not valid in an origin (scheme://host[:port]), got: $_val"
}

# Attribution is operator-supplied HTML (it must carry <a href> links), so it
# cannot be reduced to an alphanumeric set. Single quotes and backslashes are
# stripped because the value is emitted inside a single-quoted JS literal, and
# newlines because they would break that literal across lines. The value is
# TRUSTED INPUT: it reaches the DOM via OpenLayers' attribution control.
safe_attribution() { printf '%s' "$1" | tr -d "'\\\\" | tr -d '\n\r'; }

die() { printf '[spieli] FATAL: %s\n' "$1" >&2; exit 1; }

# nginx size/time values: digits with an optional unit suffix. Validated rather
# than stripped, because stripping turns 4.5g into 45g — a tenfold cache
# ceiling the operator never asked for, with no error.
# Digits, then at most one unit letter. Written as "strip one optional trailing
# suffix, then require all digits" so multi-suffix values like 4gg or 90dd are
# rejected here with a clear message instead of surviving to a generic nginx
# parse error after the config has already been written.
check_nginx_unit() {
    _name=$1 _val=$2 _units=$3 _desc=$4
    case "$_val" in
        '') die "$_name must not be empty ($_desc)" ;;
    esac
    _digits=$_val
    case "$_val" in
        *[!0-9]) _digits=${_val%?}                    # drop a single trailing unit
                 _last=${_val#"$_digits"}
                 case "$_units" in *"$_last"*) ;; *) die "$_name has an unknown unit '$_last' ($_desc, got: $_val)" ;; esac ;;
    esac
    case "$_digits" in
        ''|*[!0-9]*) die "$_name must be digits with at most one unit suffix ($_desc, got: $_val)" ;;
    esac
}
check_nginx_size() { check_nginx_unit "$1" "$2" 'kKmMgG' 'k/m/g'; }
check_nginx_time() { check_nginx_unit "$1" "$2" 'smhdwMy' 's/m/h/d/w/M/y'; }

# Where the bundled style's tiles and sprites are fetched from. Today a public
# server; point it at your own tileserver later to stop using a public one.
# That is a TWO-step swap, not one: the style document carries the provider's
# own asset paths, so a differently-shaped tileserver also needs the style
# rebuilt against it (tools/build-basemap-style.py --source ... --asset-base
# /basemap). See docs/ops/configuration.md#basemap.
SAFE_BASEMAP_UPSTREAM="${BASEMAP_UPSTREAM:-https://tiles.openfreemap.org}"
require_origin BASEMAP_UPSTREAM "$SAFE_BASEMAP_UPSTREAM"
# Scheme first, THEN trim: trimming trailing slashes first eats the "//" out of
# a bare "https://" and reports it as a missing scheme, which sends the operator
# looking in the wrong place.
case "$SAFE_BASEMAP_UPSTREAM" in
    http://*|https://*) ;;
    *) die "BASEMAP_UPSTREAM must start with http:// or https:// (got: $SAFE_BASEMAP_UPSTREAM)" ;;
esac
_bm_scheme="${SAFE_BASEMAP_UPSTREAM%%://*}://"
_bm_hostport="${SAFE_BASEMAP_UPSTREAM#*://}"
while :; do case "$_bm_hostport" in */) _bm_hostport=${_bm_hostport%/} ;; *) break ;; esac; done
# An empty host parses as a URL prefix but proxies nowhere: nginx accepts the
# config and every asset 500s at request time.
case "$_bm_hostport" in
    ''|:*) die "BASEMAP_UPSTREAM has no host (got: $SAFE_BASEMAP_UPSTREAM)" ;;
esac
SAFE_BASEMAP_UPSTREAM="${_bm_scheme}${_bm_hostport}"
# Origin only — scheme://host[:port], no path. proxy_pass with a variable that
# carries a URI part REPLACES the request URI instead of appending to it, so a
# path here silently collapses every asset onto that one path: /basemap/planet
# and /basemap/sprites/... both arrive upstream as the path and nothing renders.
# Rejected rather than trimmed, because a path is a sign the operator expected
# prefixing and the result would not be what they asked for either way.
case "${SAFE_BASEMAP_UPSTREAM#*://}" in
    */*) die "BASEMAP_UPSTREAM must be an origin with no path (scheme://host[:port]), got: $SAFE_BASEMAP_UPSTREAM. The bundled style already carries the provider's own paths; to target a differently-shaped tileserver, rebuild the style against it: tools/build-basemap-style.py --source <its style URL> --asset-base /basemap" ;;
esac

SAFE_BASEMAP_URL=$(safe_tile_url "${BASEMAP_URL:-}")
SAFE_BASEMAP_STYLE_URL=$(safe_tile_url "${BASEMAP_STYLE_URL:-}")

# Did the OPERATOR configure a source? Recorded before the default below is
# injected, because the attribution rule is about an operator pointing at a
# provider whose credit we cannot know — not about spieli's own bundled style,
# which ships with a matching default credit.
# Written as an `if` rather than `A || B && C`: that form is the canonical
# mixed-||/&& trap (it groups as (A||B)&&C, but reads as A||(B&&C)), and under
# `set -e` its exit status when nothing is configured depends on how the shell
# scopes AND-OR lists.
BASEMAP_SOURCE_CONFIGURED=""
if [ -n "$SAFE_BASEMAP_URL" ] || [ -n "$SAFE_BASEMAP_STYLE_URL" ]; then
    BASEMAP_SOURCE_CONFIGURED=1
fi

# Unless the operator names a style, serve the same-origin variant: its assets
# all resolve under /basemap/, so the browser never contacts the upstream and
# the cache absorbs the load. style.json (public URLs) exists for `make dev`,
# which has no nginx to proxy through.
if [ -z "$SAFE_BASEMAP_STYLE_URL" ] && [ -z "$SAFE_BASEMAP_URL" ]; then
    if [ -f "$WEBROOT/basemap/style.local.json" ]; then
        SAFE_BASEMAP_STYLE_URL="/basemap/style.local.json"
    else
        # Everything else in this feature fails closed. Silently dropping back
        # to style.json would send every visitor to the upstream directly while
        # the docs promise the opposite, with nothing in the logs.
        die "app/public/basemap/style.local.json is missing from the image. It is a build artefact — run 'make basemap-style'. Refusing to fall back to the upstream-pointing style, which would send every visitor to a third party."
    fi
fi
SAFE_BASEMAP_ATTRIBUTION=$(safe_attribution "${BASEMAP_ATTRIBUTION:-}")
# Four comma-separated numbers, nothing else. Validated rather than trusted
# because the value is emitted into a JS literal; the frontend ignores a
# malformed bbox, so a typo costs the notice rather than the map.
SAFE_BASEMAP_COVERAGE_BBOX=$(printf '%s' "${BASEMAP_COVERAGE_BBOX:-}" | tr -cd '0-9.,+-')

# host_of <url> — the host a browser would contact, or empty for a same-origin
# path. Handles scheme-relative URLs, ports, userinfo and {a-d} subdomain groups.
host_of() {
    case "$1" in
        # //host must be tested BEFORE /path: a case statement takes the first
        # match, so with /* first the //* branch is unreachable and a
        # scheme-relative third-party URL is reported as same-origin.
        //*) _h=${1#//} ;;
        /*) printf '' ; return ;;
        *://*) _h=${1#*://} ;;
        *) _h=$1 ;;
    esac
    _h=${_h%%/*}          # strip path
    _h=${_h##*@}          # strip userinfo
    _h=${_h%%\?*}         # strip query
    case "$_h" in \{*\}.*) _h=${_h#*\}.} ;; esac   # strip {a-d}. subdomain group
    _h=${_h%%:*}          # strip port
    printf '%s' "$_h"
}

# style_asset_hosts <style-url> — third-party hosts referenced INSIDE a style
# document (sources[*].url/tiles, sprite, glyphs), for a style this instance
# serves itself. A same-origin style URL says nothing about where the style then
# sends the browser: the bundled style.json is served from /basemap/ but points
# its tiles, glyphs and sprites at the upstream host. Checking only the URL's
# own host therefore misses the bypass entirely.
style_asset_hosts() {
    case "$1" in
        /*) _f="${WEBROOT}$1" ;;
        *) return ;;                 # remote style: its own host already counts
    esac
    [ -f "$_f" ] || return
    # Deliberately a text scan rather than a JSON parse: there is no jq in the
    # runtime image, and any http(s) URL in a style document is an asset the
    # browser will fetch, whichever key it hangs off.
    grep -o 'https\?://[A-Za-z0-9._-]*' "$_f" 2>/dev/null \
        | sed -e 's#^https\?://##' | sort -u | tr '\n' ' '
}

# Attribution is a licence obligation, not decoration. Showing the built-in
# default credit over another provider's tiles is exactly the failure the spec
# forbids, so a configured source without a matching attribution is a
# configuration error rather than something to paper over with a default.
if [ -n "$BASEMAP_SOURCE_CONFIGURED" ]; then
    [ -n "$SAFE_BASEMAP_ATTRIBUTION" ] || \
        die "BASEMAP_ATTRIBUTION must be set when BASEMAP_URL or BASEMAP_STYLE_URL is configured. Attribution is a licence obligation; refusing to display one provider's attribution over another's tiles."
fi

# BASEMAP_PROXY: serve tiles from this instance instead of sending the visitor
# to the provider. The upstream origin and the tile path are both DERIVED from
# BASEMAP_URL rather than configured separately — two variables that must agree
# about one provider is a defect generator, and the mismatch is what made the
# previously documented example unusable.
BASEMAP_PROXY_ENABLED=""
case "$(printf '%s' "${BASEMAP_PROXY:-}" | tr 'A-Z' 'a-z')" in
    1|true|yes|on) BASEMAP_PROXY_ENABLED=1 ;;
    ''|0|false|no|off) ;;
    *) die "BASEMAP_PROXY must be true or false (got: ${BASEMAP_PROXY})" ;;
esac

BASEMAP_PROXY_ORIGIN=""
BASEMAP_TILE_PATH=""
if [ -n "$BASEMAP_PROXY_ENABLED" ]; then
    [ -n "$SAFE_BASEMAP_URL" ] || \
        die "BASEMAP_PROXY is enabled but BASEMAP_URL is not set. The proxy derives both its upstream and its tile path from BASEMAP_URL."

    case "$SAFE_BASEMAP_URL" in
        http://*|https://*) ;;
        *) die "BASEMAP_URL must start with http:// or https:// to be proxied (got: $SAFE_BASEMAP_URL)" ;;
    esac

    # Split scheme://host/path. The {a-d} subdomain group is dropped: the proxy
    # is a single client, so sharding across CDN aliases buys nothing.
    _scheme=${SAFE_BASEMAP_URL%%://*}
    _rest=${SAFE_BASEMAP_URL#*://}
    _hostport=${_rest%%/*}
    _path=${_rest#*/}
    [ "$_path" = "$_rest" ] && _path=""
    case "$_hostport" in \{*\}.*) _hostport=${_hostport#*\}.} ;; esac

    BASEMAP_PROXY_ORIGIN=$(safe_origin "${_scheme}://${_hostport}")
    BASEMAP_PROXY_ORIGIN=${BASEMAP_PROXY_ORIGIN%/}
    BASEMAP_TILE_PATH="$_path"

    [ -n "$BASEMAP_TILE_PATH" ] || \
        die "BASEMAP_URL has no path to proxy (got: $SAFE_BASEMAP_URL)"

    # Split any query string off the path. It stays server-side and is
    # re-attached by nginx, so a provider key in BASEMAP_URL never reaches the
    # browser — which is the one thing proxying can do for a keyed provider
    # that direct delivery cannot.
    BASEMAP_TILE_QUERY=""
    case "$BASEMAP_TILE_PATH" in
        *\?*) BASEMAP_TILE_QUERY=${BASEMAP_TILE_PATH#*\?}
              BASEMAP_TILE_PATH=${BASEMAP_TILE_PATH%%\?*} ;;
    esac

    # The frontend now asks this instance for tiles, preserving the provider's
    # own path shape — so a {z}/{y}/{x} provider keeps its axis order and a
    # non-.png extension still works.
    SAFE_BASEMAP_URL="/tiles/${BASEMAP_TILE_PATH}"

    # A remote style would bypass the proxy entirely: the frontend prefers the
    # style, fetches it and its tiles, glyphs and sprites straight from the
    # third party, and the privacy page would then claim nobody was contacted.
    # Fail closed. A same-origin style is fine and is the supported way to run
    # vector tiles without a third party.
    if [ -n "$SAFE_BASEMAP_STYLE_URL" ]; then
        _style_host=$(host_of "$SAFE_BASEMAP_STYLE_URL")
        if [ -n "$_style_host" ]; then
            die "BASEMAP_PROXY is enabled but BASEMAP_STYLE_URL points at a third party ($_style_host). The style takes precedence over the proxy, so tiles, glyphs and sprites would be fetched directly and the proxy would sit unused. Vendor the style locally (tools/build-basemap-style.py --asset-base) or unset BASEMAP_PROXY."
        fi
        # A same-origin style URL is not enough: the document's own asset hosts
        # decide where the browser actually goes.
        _asset_hosts=$(style_asset_hosts "$SAFE_BASEMAP_STYLE_URL")
        if [ -n "$_asset_hosts" ]; then
            die "BASEMAP_PROXY is enabled but the style at $SAFE_BASEMAP_STYLE_URL still points its tiles, glyphs or sprites at: ${_asset_hosts}. The style takes precedence over the proxy, so every visitor would fetch those directly and the proxy would sit unused. Rebuild the style same-origin with: tools/build-basemap-style.py --asset-base /basemap --out app/public/basemap/style.local.json"
        fi
    fi
fi

# The host(s) the visitor's browser actually contacts, for the privacy page.
# The style wins over the raster URL, matching app/src/lib/config.js.
#
# NOTE for whoever consumes this (the privacy-page work in #826): read
# BASEMAP_TILE_PROVIDER_STATE first, never the host list alone. An empty list
# means two opposite things, and the common case is now the good one:
#
#   none     nobody is contacted — the browser only ever talks to this origin.
#            This is the DEFAULT deployment (bundled same-origin style) and
#            proxied delivery. Say so plainly; do not hedge it as "unknown".
#   hosts    BASEMAP_TILE_PROVIDER_HOST is a SPACE-SEPARATED LIST of hosts the
#            browser contacts — not a single host, because a style document can
#            reference several. Render it as a list.
#   unknown  a style is configured but its document could not be read, so where
#            it sends the browser cannot be determined. Never render this as
#            "no third party contacted".
BASEMAP_TILE_PROVIDER_HOST=""
BASEMAP_TILE_PROVIDER_STATE="none"
if [ -z "$BASEMAP_PROXY_ENABLED" ]; then
    # SAFE_BASEMAP_STYLE_URL is always set by this point (operator-set, or
    # defaulted to the bundled style above, or the entrypoint has already died),
    # so there is no "nothing configured" case left to handle here.
    _basemap_effective="${SAFE_BASEMAP_STYLE_URL:-$SAFE_BASEMAP_URL}"
    BASEMAP_TILE_PROVIDER_HOST=$(host_of "$_basemap_effective")
    if [ -n "$BASEMAP_TILE_PROVIDER_HOST" ]; then
        BASEMAP_TILE_PROVIDER_STATE="hosts"
    elif [ -n "$SAFE_BASEMAP_STYLE_URL" ]; then
        # A same-origin style still sends the browser wherever its assets live,
        # so reporting "no third party" from an empty host would put a false
        # statement on the privacy page. Read the document's own hosts.
        _style_file="${WEBROOT}${SAFE_BASEMAP_STYLE_URL%%\?*}"
        if [ -f "$_style_file" ]; then
            BASEMAP_TILE_PROVIDER_HOST=$(style_asset_hosts "$SAFE_BASEMAP_STYLE_URL" | sed 's/ *$//')
            if [ -n "$BASEMAP_TILE_PROVIDER_HOST" ]; then
                BASEMAP_TILE_PROVIDER_STATE="hosts"
            fi
        else
            BASEMAP_TILE_PROVIDER_STATE="unknown"
        fi
    fi
fi

BASEMAP_CACHE_MAX_SIZE="${BASEMAP_CACHE_MAX_SIZE:-4g}"
# keys_zone holds roughly 8000 keys per MB and binds before disk does: a large
# max_size behind a small keys_zone yields a cache that stays almost empty.
BASEMAP_CACHE_KEYS_ZONE="${BASEMAP_CACHE_KEYS_ZONE:-64m}"
BASEMAP_CACHE_INACTIVE="${BASEMAP_CACHE_INACTIVE:-90d}"
check_nginx_size BASEMAP_CACHE_MAX_SIZE   "$BASEMAP_CACHE_MAX_SIZE"
check_nginx_size BASEMAP_CACHE_KEYS_ZONE  "$BASEMAP_CACHE_KEYS_ZONE"
check_nginx_time BASEMAP_CACHE_INACTIVE   "$BASEMAP_CACHE_INACTIVE"

# The upstream sees one client per stack. Naming only the project would make 16
# federated backends indistinguishable and their operators uncontactable, which
# is the opposite of the "be a good citizen" intent — so include SITE_URL when
# it is set. Quotes and backslashes are already stripped by safe_url, and the
# value is interpolated into a double-quoted nginx string.
BASEMAP_CACHE_UA="spieli/basemap-cache (+https://github.com/mfuhrmann/spieli)"
if [ -n "$SAFE_SITE_URL" ]; then
    BASEMAP_CACHE_UA="spieli/basemap-cache (+https://github.com/mfuhrmann/spieli; ${SAFE_SITE_URL})"
fi

# ── Bundled-style asset cache (/basemap/) ─────────────────────────────────────
# Everything the bundled style references lives under /basemap/, so the visitor
# only ever talks to this origin. Vendored files (the style itself, the fonts)
# are served from disk; tiles and sprites fall through to the upstream and are
# cached — which is as much about not hammering a donation-funded public server
# as it is about the visitor's privacy.
#
# The upstream half only exists when the effective style actually routes the
# browser through /basemap/. An operator running a third-party style has the
# browser fetching assets from that provider directly, so a live proxy and a
# 4 GB cache zone pointed at tiles.openfreemap.org would sit there unused,
# reachable, and contradicting what the deployment actually does.
BASEMAP_ASSETS_LOCAL=""
case "$SAFE_BASEMAP_STYLE_URL" in
    /basemap/*) BASEMAP_ASSETS_LOCAL=1 ;;
esac

# Header block shared by both variants of the /basemap/ prefix location. ^~ is
# load-bearing: nginx evaluates regex locations before plain prefixes, so
# without it the static-asset block (~* \.(js|css|png|...)$) claims every .png
# under /basemap/ and answers try_files ... =404. That silently breaks the
# sprite sheet and the whole ne2_shaded source while the map still renders,
# because most icon layers are dropped from the tuned style.
#
# That same short-circuit means the static block no longer sets cache headers
# on the files vendored here, so they are set below instead. The style document
# gets a deliberately SHORT ttl: its URL is stable across image rebuilds but its
# content is not, so a long cache would pin a stale style — and with it a stale
# upstream build id — in returning visitors' browsers.
_bm_disk_block=$(cat <<'BMDISK'
location ^~ /basemap/ {
    add_header Cache-Control "public, max-age=300" always;
BMDISK
)
_bm_disk_immutable=$(cat <<'BMIMM'

    # Vendored content that only ever changes together with its filename. Kept
    # =404 rather than falling through: nothing under /basemap/ with these
    # extensions comes from the tile server, so a miss here is a missing build
    # artefact, and relaying it upstream would turn every page load into a
    # request the upstream can only answer with a 404 of its own.
    location ~* ^/basemap/.+\.(?:woff2?|css|svg)$ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }
}
BMIMM
)

if [ -n "$BASEMAP_ASSETS_LOCAL" ]; then
cat > /etc/nginx/basemap-location.conf <<BMEOF
# Generated by docker-entrypoint.sh.
${_bm_disk_block}
    # Vendored files (the style document, the UI webfonts) are served from
    # disk; everything else falls through to the cached upstream.
    try_files \$uri @basemap_upstream;
${_bm_disk_immutable}

location @basemap_upstream {
    # A character class is not a shape constraint. Filtering only the
    # CHARACTERS made this a general caching relay for the whole upstream
    # origin — GET /basemap/styles/bright returned 200 with 48 KB, a path the
    # style never asks for — so anyone could pull and cache arbitrary upstream
    # paths through this instance, evicting real tiles and doing it under our
    # own truthful User-Agent. Constrain the SHAPE the way the sibling /tiles/
    # block does: an asset extension, or a single extension-less segment for
    # the TileJSON pointer.
    #
    # Spaces are in the class because MapLibre glyph fontstacks contain them
    # ("Noto Sans Regular") and nginx percent-DECODES \$uri before this runs, so
    # a class without a space rejects every glyph range.
    if (\$uri !~ "^/basemap/(?:[A-Za-z0-9 /_.@,+%~-]+\.(?:pbf|mvt|png|jpg|jpeg|webp|avif|json)|[A-Za-z0-9_.@~-]+)\$") { return 404; }
    # No basemap asset carries a query string, but args DO enter the default
    # proxy_cache_key — so ?1, ?2, ?3 … is an unbounded cache-fill vector that
    # evicts real tiles while every request looks individually legitimate.
    if (\$is_args) { return 404; }
    limit_except GET { deny all; }
    # Same reasoning as /tiles/: the z/x/y stream is a per-visitor record of
    # what they looked at, so it is not written to disk here. Note this covers
    # access_log only — error_log still records the proxied URI when an
    # upstream request fails.
    access_log off;

    set \$bm_upstream ${SAFE_BASEMAP_UPSTREAM};
    # /basemap/<path> maps 1:1 onto <upstream>/<path>; the style build strips
    # only the origin, so no mapping has to be reversed here.
    #
    # proxy_pass with a variable and NO URI part forwards the rewritten URI:
    # the "break" ends rewrite processing but keeps the new \$uri, which is what
    # proxy_pass then uses. (Verified against a stub upstream: it receives
    # /planet, not /basemap/planet.)
    rewrite ^/basemap/(.*)\$ /\$1 break;
    proxy_pass \$bm_upstream;

    proxy_http_version 1.1;
    proxy_ssl_server_name on;
    proxy_ssl_name \$proxy_host;

    # Identifies the project AND this instance, so the upstream can tell the
    # federation's backends apart and reach the operator rather than seeing
    # anonymous load from N indistinguishable caches.
    proxy_set_header User-Agent      "${BASEMAP_CACHE_UA}";
    proxy_set_header Host            \$proxy_host;
    proxy_set_header Referer         "";
    proxy_set_header Cookie          "";
    proxy_set_header Accept-Language "";
    proxy_set_header X-Forwarded-For "";
    # sub_filter cannot operate on a compressed body, but that is only needed
    # for the TileJSON document. Clearing it for everything would send and store
    # every vector tile uncompressed — measured at roughly a third more bytes,
    # paid twice: on the upstream fetch this feature exists to be polite about,
    # and again on delivery. \$bm_accept_encoding is empty only for the
    # TileJSON shapes.
    proxy_set_header Accept-Encoding \$bm_accept_encoding;
    proxy_hide_header Set-Cookie;

    # The openmaptiles source is a TileJSON endpoint whose response carries
    # ABSOLUTE upstream tile URLs. Proxying the document is not enough — without
    # this the browser reads those URLs and goes straight to the upstream,
    # defeating both the cache and the same-origin property.
    #
    # text/plain is in the type list because a self-hosted tileserver may serve
    # TileJSON with a laxer Content-Type, and a sub_filter that silently does
    # not run looks exactly like one that did.
    sub_filter_types application/json text/plain;
    sub_filter_once off;
    sub_filter "${SAFE_BASEMAP_UPSTREAM}/" "/basemap/";
    # Same origin written protocol-relative.
    sub_filter "//${SAFE_BASEMAP_UPSTREAM#*://}/" "/basemap/";

    proxy_cache basemap;
    # NOTE: these are a FLOOR, not a policy. A response's own Cache-Control or
    # Expires takes priority over proxy_cache_valid in nginx, and the default
    # upstream sends one on everything (86400 on the TileJSON pointer,
    # 315360000 on tiles), so in the default deployment these values are only
    # reached by an upstream that sends no freshness headers at all. That is
    # deliberate: the upstream knows which of its own documents rotate, and
    # second-guessing it is how the pointer ends up outliving its build.
    proxy_cache_valid 200 30d;
    proxy_cache_valid 404 5m;
    proxy_cache_revalidate on;
    # A Set-Cookie or Vary from the upstream would otherwise make the response
    # uncacheable outright — a silently useless cache in front of the server
    # this exists to spare. Neither is meaningful for a tile: the request
    # carries no cookie (cleared above) and Accept-Encoding is a pure function
    # of the path, so nothing varies per visitor.
    proxy_ignore_headers Set-Cookie Vary;
    # Collapse duplicate misses into one upstream request, and keep serving
    # from cache through an upstream outage rather than amplifying it. The
    # background update is what makes "stale while updating" refresh out of
    # band instead of making one unlucky visitor wait for the upstream.
    proxy_cache_lock on;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_cache_background_update on;

    proxy_connect_timeout 5s;
    proxy_read_timeout   20s;

    proxy_hide_header X-Content-Type-Options;
    proxy_hide_header Referrer-Policy;
    proxy_hide_header Permissions-Policy;
    proxy_hide_header Content-Security-Policy;
    proxy_hide_header Cache-Control;
    add_header X-Content-Type-Options  "nosniff"                          always;
    add_header Referrer-Policy         "strict-origin-when-cross-origin"  always;
    add_header Permissions-Policy      "geolocation=(self)"               always;
    add_header Content-Security-Policy "default-src 'none'; img-src 'self' data:; sandbox" always;
    # Long-lived for content-addressed tiles, short for the mutable TileJSON
    # pointer, no-store for failures. See the maps in 09-basemap-cache.conf for
    # why this is keyed on \$status and \$request_uri and not on \$upstream_*.
    add_header Cache-Control \$bm_cache_control always;

    # A redirect would hand the browser an absolute upstream URL, undoing both
    # the cache and the same-origin property.
    proxy_redirect ~^https?://[^/]+/(.*)\$ /basemap/\$1;
}
BMEOF

cat > /etc/nginx/conf.d/09-basemap-cache.conf <<BMCEOF
# Generated by docker-entrypoint.sh. http-context directives for the style cache.
proxy_cache_path /var/cache/nginx/basemap levels=2:2 keys_zone=basemap:${BASEMAP_CACHE_KEYS_ZONE}
                 max_size=${BASEMAP_CACHE_MAX_SIZE} inactive=${BASEMAP_CACHE_INACTIVE} use_temp_path=off;

# Compression is disabled only for the TileJSON document, where sub_filter has
# to read the body. Tiles keep their gzip.
# Keyed on \$request_uri, not \$uri: the location rewrites \$uri to strip the
# /basemap/ prefix before this is read, so a \$uri pattern silently never
# matches — the TileJSON then arrives gzipped, sub_filter cannot run on it, and
# the browser is handed absolute upstream tile URLs while everything still
# looks fine.
# Two shapes, because "the TileJSON pointer" is not one shape across servers:
# OpenFreeMap serves it extension-less (/planet), tileserver-gl serves it as
# /data/<id>.json.
map \$request_uri \$bm_accept_encoding {
    default                   "gzip";
    "~^/basemap/[^.?]+\$"      "";
    "~^/basemap/[^?]+\.json\$" "";
}

# What the VISITOR's browser is told to do. Keyed on \$request_uri and \$status,
# never on \$upstream_status or \$upstream_http_*: those are EMPTY on a cache
# hit, so a status-keyed map falls to its default on every hit — which served
# cached 404s with a 30-day max-age, the exact opposite of the intent.
map \$request_uri \$bm_cache_control_ttl {
    # Tiles and sprites are content-addressed: the path carries the build id.
    default                   "public, max-age=2592000";
    # The TileJSON pointer NAMES that build id and rotates when it does.
    # Pinning it past the rotation leaves the browser asking for tile paths
    # that no longer exist, and the map goes blank with nothing in the logs.
    "~^/basemap/[^.?]+\$"      "public, max-age=86400";
    "~^/basemap/[^?]+\.json\$" "public, max-age=86400";
}
map \$status \$bm_cache_control {
    default  \$bm_cache_control_ttl;
    "~^[45]" "no-store";
}
BMCEOF
mkdir -p /var/cache/nginx/basemap
else
# No same-origin style: /basemap/ still serves what is vendored in the image
# (the macro-tier world outline, the style documents themselves), but nothing
# is proxied and no cache zone is allocated.
cat > /etc/nginx/basemap-location.conf <<BMEOF
# Generated by docker-entrypoint.sh — disk only. The configured style does not
# route the browser through /basemap/, so there is nothing to proxy or cache.
${_bm_disk_block}
    try_files \$uri =404;
${_bm_disk_immutable}
BMEOF
: > /etc/nginx/conf.d/09-basemap-cache.conf
fi

# ── Basemap proxy nginx config ────────────────────────────────────────────────
# Both files are always written so the include in nginx.conf never fails.

if [ -n "$BASEMAP_PROXY_ENABLED" ]; then
    # NOTE: this lives on the container's writable layer, so it is discarded on
    # every image rebuild. Mount a volume at /var/cache/nginx/tiles to persist.
    # The same applies to /var/cache/nginx/basemap above — and matters more
    # there, since that cache is on by default and an upgrade sweep across
    # stacks otherwise sends every one of them cold at the upstream.
    mkdir -p /var/cache/nginx/tiles
    cat > /etc/nginx/conf.d/10-tiles-cache.conf <<CACHEEOF
# Generated by docker-entrypoint.sh. http-context directives for the tile cache.
proxy_cache_path /var/cache/nginx/tiles levels=2:2 keys_zone=tiles:${BASEMAP_CACHE_KEYS_ZONE}
                 max_size=${BASEMAP_CACHE_MAX_SIZE} inactive=${BASEMAP_CACHE_INACTIVE} use_temp_path=off;
CACHEEOF

    cat > /etc/nginx/tiles-location.conf <<TILEEOF
# Generated by docker-entrypoint.sh — proxied basemap delivery.
# The capture is deliberately shaped like a tile path rather than a catch-all:
# an unconstrained (.*) would let anyone fetch and cache arbitrary paths from
# the upstream origin through this instance, evicting real tiles.
location ~ ^/tiles/(?<tile_path>[A-Za-z0-9/_.@,+%~-]+\.(?:png|jpg|jpeg|webp|avif|pbf|mvt))\$ {
    # Access logging is OFF deliberately, and this is a correctness property
    # rather than a tuning choice. Proxying moves the visitor's tile stream
    # onto this server; at high zoom that z/x/y sequence is not metadata about
    # what they viewed, it IS what they viewed. Logging it would build a
    # per-visitor location trail on the operator's disk, which is worse than
    # the third-party delivery proxying replaces. Errors are still logged.
    access_log off;

    limit_except GET { deny all; }

    # The upstream URI is built explicitly here because this location has to
    # re-attach the provider's query string and reorder nothing else.
    #
    # The rule, since the sibling /basemap/ block relies on the other half of
    # it: when proxy_pass carries a variable and NO URI part, nginx forwards
    # the CURRENT \$uri — which includes the location prefix, so a bare
    # proxy_pass here would send /tiles/... upstream and get a 404 with nothing
    # in the error log. A "rewrite ... break" does change \$uri and therefore
    # does take effect; that is how @basemap_upstream strips its own prefix.
    # (A URI part on the variable is different again: it REPLACES the request
    # URI, which is why BASEMAP_UPSTREAM is rejected if it carries a path.)
    set \$tiles_upstream ${BASEMAP_PROXY_ORIGIN};
    proxy_pass \$tiles_upstream/\$tile_path${BASEMAP_TILE_QUERY:+?${BASEMAP_TILE_QUERY}};

    # A variable in proxy_pass defers DNS to the resolver above, and nginx then
    # omits SNI unless told otherwise. Tile providers are CDN-hosted and
    # virtual-hosted, so without these the handshake lands on a default vhost.
    proxy_http_version 1.1;
    proxy_ssl_server_name on;
    proxy_ssl_name \$proxy_host;

    # The operator's server is the client here, not a browser, so it identifies
    # itself and forwards nothing that identifies the visitor. Cookie must be
    # cleared with proxy_set_header: proxy_hide_header only filters RESPONSE
    # headers, so it would leave the visitor's cookies going upstream.
    proxy_set_header User-Agent      "spieli/basemap-proxy (+https://github.com/mfuhrmann/spieli)";
    proxy_set_header Host            \$proxy_host;
    proxy_set_header Referer         "";
    proxy_set_header Cookie          "";
    proxy_set_header Accept-Language "";
    proxy_set_header X-Forwarded-For "";
    proxy_hide_header Set-Cookie;

    proxy_cache tiles;
    proxy_cache_valid 200 30d;
    proxy_cache_valid 404 1h;
    proxy_cache_revalidate on;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_cache_lock on;

    # No fallback to direct delivery exists anywhere: if the upstream is
    # unreachable the tile fails and the map renders without a basemap. A
    # fallback would leak exactly the addresses proxying was enabled to
    # protect, at the moment something is already wrong.
    proxy_connect_timeout 5s;
    proxy_read_timeout   20s;

    # Upstreams set their own copies of these, which would otherwise be passed
    # through and appear alongside ours as duplicate response headers.
    proxy_hide_header X-Content-Type-Options;
    proxy_hide_header Referrer-Policy;
    proxy_hide_header Permissions-Policy;
    proxy_hide_header Content-Security-Policy;
    proxy_hide_header Cache-Control;

    # add_header does not inherit into a level that declares its own, so the
    # server-level security headers are repeated here rather than silently
    # dropped for tile responses. Cache-Control is set once (no 'expires').
    add_header X-Content-Type-Options    "nosniff"                          always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin"  always;
    add_header Permissions-Policy        "geolocation=(self)"               always;
    add_header Content-Security-Policy    "default-src 'none'; img-src 'self' data:; sandbox" always;
    add_header Cache-Control             "public, max-age=2592000"          always;
}
TILEEOF
else
    printf '# Basemap proxying disabled (BASEMAP_PROXY unset or false).\n' \
        > /etc/nginx/tiles-location.conf
    rm -f /etc/nginx/conf.d/10-tiles-cache.conf
fi


# ── External-service proxies (/ext/) ──────────────────────────────────────────
# The remaining third parties the visitor's browser used to contact directly are
# fetched server-side instead, through one cache, so the browser only ever talks
# to this origin. Same mechanism as /basemap/, and the traps below were all
# found there first.
#
# One cache zone for all of them rather than five: sizing five zones is five
# chances to starve one, and the default proxy_cache_key already includes
# $proxy_host, so two upstreams sharing a path cannot collide. Freshness still
# differs per location via proxy_cache_valid.
#
# Each service can be turned off individually. Reasons to opt out are
# per-service — egress cost, cache disk, or an operator who already runs a
# local Nominatim — and when one is off the browser contacts it directly and
# the generated CSP names it (see the block after this one).

# ext_enabled <VAR> — a proxy is on unless explicitly disabled. Rejects a
# value that is neither, rather than quietly treating "flase" as false.
ext_enabled() {
    # Quoted: an unquoted eval word-splits a value like "true " (which an
    # operator can produce with a quoted .env line) and tries to run the second
    # word, so the container dies with "not found" instead of the intended
    # FATAL message naming the variable.
    eval "_ev=\${$1:-}"
    case "$(printf '%s' "$_ev" | tr 'A-Z' 'a-z')" in
        ''|1|true|yes|on) printf '1' ;;
        0|false|no|off) ;;
        *) die "$1 must be true or false (got: $_ev)" ;;
    esac
}
EXT_NOMINATIM=$(ext_enabled PROXY_NOMINATIM)
EXT_COMMONS=$(ext_enabled PROXY_COMMONS)
EXT_MANGROVE=$(ext_enabled PROXY_MANGROVE)

EXT_CACHE_MAX_SIZE="${EXT_CACHE_MAX_SIZE:-2g}"
EXT_CACHE_KEYS_ZONE="${EXT_CACHE_KEYS_ZONE:-16m}"
EXT_CACHE_INACTIVE="${EXT_CACHE_INACTIVE:-30d}"
check_nginx_size EXT_CACHE_MAX_SIZE  "$EXT_CACHE_MAX_SIZE"
check_nginx_size EXT_CACHE_KEYS_ZONE "$EXT_CACHE_KEYS_ZONE"
check_nginx_time EXT_CACHE_INACTIVE  "$EXT_CACHE_INACTIVE"

# Identifies the project and the instance. Not decoration: the OSMF usage
# policy requires a real identifying User-Agent, and anonymous concentrated
# traffic from N indistinguishable caches is what gets an IP blocked.
EXT_PROXY_UA="spieli/ext-cache (+https://github.com/mfuhrmann/spieli)"
if [ -n "$SAFE_SITE_URL" ]; then
    EXT_PROXY_UA="spieli/ext-cache (+https://github.com/mfuhrmann/spieli; ${SAFE_SITE_URL})"
fi

# Directives shared by every /ext/ location. Extracted rather than repeated
# per service: these are the lines that are easy to get wrong, and five copies
# is five places to forget one. What each location supplies for itself is what
# genuinely differs — the upstream, the permitted path shape, whether a query
# string is allowed, which methods, and freshness.
#
# Deliberately NOT a parameterised whole-location generator as the plan first
# had it: the shapes diverge more than they share. /basemap/ forbids query
# strings outright and rewrites a TileJSON body; Nominatim is nothing but query
# string; Mangrove needs PUT. A function taking all of that would have more
# parameters than lines.
_ext_common=$(cat <<EXTCOMMON
    # Access logging is OFF, and this is a correctness property rather than a
    # tuning choice. Proxying moves the visitor's request stream onto this
    # server; logging it would rebuild, on the operator's disk, the per-visitor
    # trail this whole change exists to remove — leaving the operator as the
    # controller of something worse than what was replaced. Errors still log.
    access_log off;

    proxy_http_version 1.1;
    # A variable in proxy_pass defers DNS to the resolver, and nginx then omits
    # SNI unless told otherwise. These upstreams are all virtual-hosted, so
    # without this the handshake lands on someone else's default vhost.
    proxy_ssl_server_name on;
    proxy_ssl_name \$proxy_host;
    proxy_set_header Host            \$proxy_host;

    # This server is the client now, not a browser. It identifies itself and
    # forwards nothing that identifies the visitor. Cookie MUST be cleared with
    # proxy_set_header: proxy_hide_header only filters RESPONSE headers, so it
    # would leave the visitor's cookies going upstream.
    proxy_set_header User-Agent      "${EXT_PROXY_UA}";
    proxy_set_header Referer         "";
    proxy_set_header Cookie          "";
    proxy_set_header Accept-Language "";
    proxy_set_header X-Forwarded-For "";
    proxy_set_header X-Real-IP       "";
    proxy_hide_header Set-Cookie;

    # Pinned so the cache key does not depend on what the first requester
    # happened to negotiate. Vary is ignored below to keep these responses
    # cacheable at all, and without pinning this that combination serves one
    # client's encoding to everyone.
    proxy_set_header Accept-Encoding "gzip";

    proxy_cache ext;
    proxy_cache_revalidate on;
    # Cache-Control and Expires are ignored deliberately, and this is the
    # difference between a cache and a decoration. A response's own freshness
    # headers take PRIORITY over proxy_cache_valid in nginx, and the MediaWiki
    # action API answers anonymous queries with
    # "Cache-Control: private, must-revalidate, max-age=0" — so without this
    # the Commons cache stores nothing and every playground selection is a
    # fresh upstream request, while the config looks correct.
    #
    # We are not a shared cache in the HTTP sense here: these are public,
    # unauthenticated documents fetched with all visitor identity stripped, and
    # the per-location proxy_cache_valid below is the policy.
    # A Set-Cookie or Vary would otherwise make the response uncacheable — a
    # silently useless cache in front of the servers this exists to spare.
    # Nothing varies per visitor here: the request carries no cookie, no
    # Referer and no Accept-Language, because they were all cleared above.
    proxy_ignore_headers Set-Cookie Vary Cache-Control Expires X-Accel-Expires;
    # Collapse duplicate misses into one upstream request, and keep serving
    # through an outage instead of amplifying it. http_429 is in the stale list
    # deliberately: being rate limited is exactly when a stale answer beats no
    # answer.
    proxy_cache_lock on;
    proxy_cache_use_stale error timeout updating http_429 http_500 http_502 http_503 http_504;
    proxy_cache_background_update on;

    proxy_connect_timeout 5s;
    proxy_read_timeout   20s;

    # Upstreams set their own copies of these, which would otherwise pass
    # through and appear as duplicate response headers alongside ours.
    proxy_hide_header X-Content-Type-Options;
    proxy_hide_header Referrer-Policy;
    proxy_hide_header Permissions-Policy;
    proxy_hide_header Content-Security-Policy;
    proxy_hide_header Cache-Control;
    # CORS from the upstream is meaningless once this is same-origin, and a
    # wildcard passed through would let any page read these responses.
    proxy_hide_header Access-Control-Allow-Origin;

    # add_header does not inherit into a level that declares its own, so the
    # server-level security headers are repeated rather than silently dropped.
    add_header X-Content-Type-Options  "nosniff"                          always;
    add_header Referrer-Policy         "strict-origin-when-cross-origin"  always;
    add_header Permissions-Policy      "geolocation=(self)"               always;
    add_header Content-Security-Policy "default-src 'none'; img-src 'self' data:; sandbox" always;

    # \$ext_cache_control is \$ext_cc on success and "no-store" on a 4xx/5xx —
    # see the map in 11-ext-cache.conf. Each location sets \$ext_cc to its own
    # TTL. 'always' is required so the header survives an error response, and
    # that is exactly why the status has to be consulted: without the map, a
    # transient upstream 404 (or one of our own allowlist rejections) is handed
    # to the browser with a 30-day max-age, pinning a broken image for a month.
    # The basemap block hit this and fixed it the same way.
    add_header Cache-Control \$ext_cache_control always;
EXTCOMMON
)

# Always written, so the include in nginx.conf cannot fail.
: > /etc/nginx/ext-locations.conf.new
: > /etc/nginx/conf.d/11-ext-cache.conf.new

if [ -n "$EXT_NOMINATIM$EXT_COMMONS$EXT_MANGROVE" ]; then
    mkdir -p /var/cache/nginx/ext
    cat > /etc/nginx/conf.d/11-ext-cache.conf.new <<EXTCACHEEOF
# Generated by docker-entrypoint.sh. http-context directives for the /ext/ cache.
proxy_cache_path /var/cache/nginx/ext levels=2:2 keys_zone=ext:${EXT_CACHE_KEYS_ZONE}
                 max_size=${EXT_CACHE_MAX_SIZE} inactive=${EXT_CACHE_INACTIVE} use_temp_path=off;

# What the VISITOR's browser is told to cache. Each /ext/ location sets
# \$ext_cc to its own TTL; this turns any 4xx/5xx into no-store.
#
# Keyed on \$status, never on \$upstream_status: that is empty on a cache hit,
# so a map keyed on it falls to its default on every hit — the bug that once
# served cached 404s with a 30-day max-age on the basemap path.
map \$status \$ext_cache_control {
    default  \$ext_cc;
    "~^[45]" "no-store";
}

EXTCACHEEOF
fi

if [ -n "$EXT_NOMINATIM" ]; then
    cat >> /etc/nginx/conf.d/11-ext-cache.conf.new <<EXTNOMCACHEEOF
# Nominatim's usage policy is an ABSOLUTE 1 req/s. Proxying concentrates onto
# this one IP the queries that used to spread across every visitor's, so the
# limit has to be respected by construction rather than by hope.
#
# Keyed on a CONSTANT, not on \$binary_remote_addr: a per-visitor limit would
# let 100 visitors send 100 req/s between them, which is exactly what the
# policy forbids. This caps the whole instance.
limit_req_zone \$server_name zone=ext_nominatim:1m rate=1r/s;

# The limiter lives on an internal loopback server, NOT on the visitor-facing
# location, and that placement is the whole point.
#
# limit_req runs in the preaccess phase, which is BEFORE the cache lookup in
# the content phase. On the visitor-facing location it therefore sheds requests
# the upstream would never have seen: measured, a query already in the cache
# got a 503 while the limiter was busy with unrelated misses. Two ordinary
# visitors are enough to exhaust a 1r/s burst, so that arrangement would have
# made search and region framing fail under trivial load — worse availability
# than before proxying, and it would have falsified the argument that a high
# hit rate is what keeps us inside the policy.
#
# Here only a cache MISS reaches the limiter, because a hit is answered before
# the outer location ever proxies. And when the limiter does shed, the outer
# location's proxy_cache_use_stale list includes http_503, so a stale answer is
# served instead of an error wherever one is held.
server {
    listen 127.0.0.1:8091;
    # server_name is NOT decoration here. The limiter is keyed on
    # \$server_name, and nginx silently skips limit_req when the key evaluates
    # to an empty string — so without this the limiter is present, parses,
    # and enforces nothing. Measured: 20 concurrent misses all returned 200.
    server_name ext-nominatim-internal;
    # Loopback only, and nothing else in the image talks to it.
    access_log off;
    resolver 127.0.0.11 ipv6=off valid=30s;

    location / {
        limit_req zone=ext_nominatim burst=10 nodelay;

        set \$nominatim_upstream "https://nominatim.openstreetmap.org";
        proxy_pass \$nominatim_upstream;

        proxy_http_version 1.1;
        proxy_ssl_server_name on;
        proxy_ssl_name \$proxy_host;
        proxy_set_header Host            \$proxy_host;
        # The OSMF usage policy requires a real identifying User-Agent. This is
        # the hop that actually talks to them, so it is set here.
        proxy_set_header User-Agent      "${EXT_PROXY_UA}";
        proxy_set_header Referer         "";
        proxy_set_header Cookie          "";
        proxy_set_header Accept-Language "";
        proxy_set_header X-Forwarded-For "";
        proxy_set_header X-Real-IP       "";
        proxy_connect_timeout 5s;
        proxy_read_timeout   20s;
    }
}
EXTNOMCACHEEOF
fi

if [ -n "$EXT_NOMINATIM" ]; then
    cat >> /etc/nginx/ext-locations.conf.new <<'EXTNOMEOF'
# ── /ext/nominatim/ → nominatim.openstreetmap.org ────────────────────────────
# ^~ is load-bearing. nginx matches regex locations BEFORE plain prefixes, so
# without it a proxied path ending .json or .png is claimed by the static-asset
# block and answered try_files =404.
location ^~ /ext/nominatim/ {
EXTNOMEOF
    cat >> /etc/nginx/ext-locations.conf.new <<EXTNOM2EOF
    # Only the two endpoints the frontend calls. A catch-all would make this a
    # general caching relay for the whole upstream origin, under our own
    # truthful User-Agent — the mistake the /basemap/ block documents.
    if (\$uri !~ "^/ext/nominatim/(?:search|lookup|reverse)\$") { return 404; }
    limit_except GET { deny all; }

    # Proxied to the loopback server in 11-ext-cache.conf, which carries the
    # rate limiter, rather than straight to Nominatim. The limiter must see
    # only cache misses — see the long comment there for why putting it on this
    # location instead breaks search for two simultaneous visitors.
    #
    # A literal address, so no resolver is involved and no variable is needed.
    # Set BEFORE the rewrite below: 'break' stops the rewrite module, and
    # 'set' is one of its directives, so a set placed after it never runs —
    # the header then renders empty and no Cache-Control is sent at all.
    set \$ext_cc "public, max-age=86400";
    rewrite ^/ext/nominatim/(.*)\$ /\$1 break;
    proxy_pass http://127.0.0.1:8091;
${_ext_common}
    # Settlement geocoding does not change on a timescale that matters, and the
    # dominant query — region-URL resolution such as /fulda — is identical for
    # every visitor of this instance. So the hit rate is what keeps the
    # instance inside the policy, and the TTL is long on purpose.
    proxy_cache_valid 200 30d;
    proxy_cache_valid 404 1h;
}

EXTNOM2EOF
fi

if [ -n "$EXT_COMMONS" ]; then
    cat >> /etc/nginx/ext-locations.conf.new <<EXTCOMEOF
# ── /ext/commons/ → commons.wikimedia.org (the API) ──────────────────────────
location ^~ /ext/commons/ {
    if (\$uri !~ "^/ext/commons/w/api\.php\$") { return 404; }
    limit_except GET { deny all; }

    set \$ext_commons "https://commons.wikimedia.org";
    # Set BEFORE the rewrite below: 'break' stops the rewrite module, and
    # 'set' is one of its directives, so a set placed after it never runs —
    # the header then renders empty and no Cache-Control is sent at all.
    set \$ext_cc "public, max-age=3600";
    rewrite ^/ext/commons/(.*)\$ /\$1 break;
    proxy_pass \$ext_commons;
${_ext_common}
    # Category listings and file metadata change when someone edits Commons.
    # A day is long enough to matter for load and short enough that a new photo
    # appears the same day.
    proxy_cache_valid 200 1d;
    proxy_cache_valid 404 10m;
}

# ── /ext/wikimedia/<host>/<path> → Wikimedia file hosts (the image bytes) ────
# A separate location because it is a separate upstream. Proxying only the API
# would leave the browser fetching every image from Wikimedia anyway, since the
# API answers with ABSOLUTE file URLs — the same trap the basemap TileJSON
# needed a sub_filter for. Here the rewrite happens in the frontend instead
# (proxiedImageUrl in app/src/lib/commons.js), which is unit-testable and beats
# rewriting a JSON body in nginx.
#
# The host is carried IN THE PATH rather than fixed to one upstream, because
# which host serves a file is Wikimedia's business and it changes: the
# imageinfo API returns thumbnails on thumb.wikimedia.org and originals on
# upload.wikimedia.org today, and a proxy hard-wired to one of them silently
# sends every thumbnail straight to Wikimedia while looking like it works.
# Constrained to *.wikimedia.org, so this cannot relay for anywhere else.
#
# A regex location, matching the sibling /tiles/ block. Note the ordering
# dependency that comes with it: regex locations are tried in the order they
# appear in the configuration, so this include must stay ABOVE the
# ~* \.(js|css|png|...)$ static block in nginx.conf, or that block claims every
# proxied image and answers try_files =404.
location ~* ^/ext/wikimedia/(?<wm_host>[a-z0-9-]+\.(?:wikimedia|wikipedia)\.org)/ {
    limit_except GET { deny all; }

    # Case-INSENSITIVE (~*) and covering wikipedia.org as well as wikimedia.org,
    # because this has to accept everything proxiedImageUrl rewrites — which is
    # everything isSafeImageUrl accepts. A narrower pattern here does not fail
    # safe: the request falls through to the /ext/ catch-all and 404s, so images
    # that render today would silently break. Commons preserves filename case,
    # so ".JPG" is common, and 'image' tags legitimately point at
    # *.wikipedia.org.
    if (\$uri !~* "\.(?:png|jpe?g|gif|webp|svg|tiff?)\$") { return 404; }

    set \$ext_wm "https://\$wm_host";
    # The prefix is stripped with 'rewrite ... break' and proxy_pass carries NO
    # URI part, so nginx forwards the rewritten \$uri and re-encodes it itself,
    # appending \$args. Building the path as "proxy_pass \$var/\$captured" instead
    # sends the PERCENT-DECODED capture: a filename like
    # Spielplatz_N%C3%BCrnberg.jpg then arrives as raw UTF-8 in the request
    # line and Wikimedia answers 400. Non-ASCII filenames are the norm in a
    # German-region deployment, so this is the common case, not an edge one.
    # Set BEFORE the rewrite below: 'break' stops the rewrite module, and
    # 'set' is one of its directives, so a set placed after it never runs —
    # the header then renders empty and no Cache-Control is sent at all.
    set \$ext_cc "public, max-age=2592000";
    rewrite ^/ext/wikimedia/[^/]+/(.*)\$ /\$1 break;
    proxy_pass \$ext_wm;
${_ext_common}
    # Content-addressed: a thumb URL names its width and its source revision.
    proxy_cache_valid 200 30d;
    proxy_cache_valid 404 1h;
}

EXTCOMEOF
fi

if [ -n "$EXT_MANGROVE" ]; then
    cat >> /etc/nginx/ext-locations.conf.new <<EXTMGEOF
# ── /ext/mangrove/ → api.mangrove.reviews ────────────────────────────────────
location ^~ /ext/mangrove/ {
    # Two shapes: the read path, and submission — which is a PUT carrying the
    # signed JWT in the path, not a body. The signature covers the JWT's own
    # claims, so a reverse proxy is transparent to verification.
    if (\$uri !~ "^/ext/mangrove/(?:reviews|submit/[A-Za-z0-9._-]+)\$") { return 404; }
    # Proxying the submit path is what lets connect-src drop this host
    # entirely. The cost is that this instance can relay a submission, so the
    # method list is exact and the body is capped. nginx caches only GET and
    # HEAD by default, so the PUT is never stored.
    limit_except GET PUT { deny all; }
    client_max_body_size 8k;

    set \$ext_mangrove "https://api.mangrove.reviews";
    # Set BEFORE the rewrite below: 'break' stops the rewrite module, and
    # 'set' is one of its directives, so a set placed after it never runs —
    # the header then renders empty and no Cache-Control is sent at all.
    set \$ext_cc "public, max-age=60";
    rewrite ^/ext/mangrove/(.*)\$ /\$1 break;
    proxy_pass \$ext_mangrove;
${_ext_common}
    # Short: a review posted by one visitor should show up for the next one
    # without a long wait. ReviewsPanel invalidates its own session cache on
    # submit, and this is the server-side half of that.
    proxy_cache_valid 200 5m;
    proxy_cache_valid 404 1m;
}

EXTMGEOF
fi

# Panoramax is deliberately NOT proxied, and this is a finding rather than an
# omission. Its thumbnail endpoint answers 308 with a Location on a per-instance
# derivative host — api.panoramax.xyz redirects to panoramax.openstreetmap.fr —
# and nginx's proxy module cannot follow a redirect. Relaying it would send the
# browser to a host nothing here has disclosed and the CSP does not name, which
# is worse than not proxying at all; rewriting it would mean a proxy location
# per derivative host, and Panoramax is a federation whose set of those is not
# ours to enumerate.
#
# So Panoramax stays a browser-contacted service for both its thumbnails and
# its viewer, is named in the CSP, and keeps both rows on the privacy page. The
# viewer was never proxiable anyway: serving a whole interactive application
# from this origin would grant it same-origin privileges here.

# Anything under /ext/ that no proxy above claimed is refused here. Without it
# such a path falls through to the SPA fallback and answers 200 with index.html
# — harmless, since nothing is proxied, but it makes the proxy surface look
# larger than it is and hides a typo behind a page that renders.
#
# Placement and form both matter. It is a REGEX location, tried after the
# /ext/wikimedia/ regex above, so it cannot shadow it. As a '^~' prefix it
# would beat every regex location and break that proxy outright. The four
# prefix proxies are unaffected either way: nginx picks the longest matching
# prefix first, and a matched '^~' stops the search before regexes are tried.
cat >> /etc/nginx/ext-locations.conf.new <<'EXTCATCHEOF'
location ~ ^/ext/ {
    access_log off;
    return 404;
}
EXTCATCHEOF

# Same atomic move as csp.conf: never visible half-written.
mv /etc/nginx/ext-locations.conf.new /etc/nginx/ext-locations.conf
mv /etc/nginx/conf.d/11-ext-cache.conf.new /etc/nginx/conf.d/11-ext-cache.conf

# What the frontend should call. A disabled proxy means the browser goes
# direct, and the CSP below has to name that host.
EXT_NOMINATIM_URL="https://nominatim.openstreetmap.org"
EXT_COMMONS_API_URL="https://commons.wikimedia.org/w/api.php"
EXT_COMMONS_FILE_BASE=""   # empty = fetch Wikimedia file bytes directly
EXT_MANGROVE_URL="https://api.mangrove.reviews"
# Written as `if` blocks rather than `[ -n x ] && assign`, matching the note
# further up this file: that form survives `set -e` here, but it is one shell
# quirk away from a silent early exit and reads as a conditional either way.
if [ -n "$EXT_NOMINATIM" ]; then
    EXT_NOMINATIM_URL="/ext/nominatim"
fi
if [ -n "$EXT_COMMONS" ]; then
    EXT_COMMONS_API_URL="/ext/commons/w/api.php"
    EXT_COMMONS_FILE_BASE="/ext/wikimedia"
fi
if [ -n "$EXT_MANGROVE" ]; then
    EXT_MANGROVE_URL="/ext/mangrove"
fi


# ── Content Security Policy ───────────────────────────────────────────────────
# The policy used to be a literal in nginx.conf with `img-src ... https:` and
# `connect-src 'self' https:` — effectively "any host". It is generated here
# instead, because two parts of the correct answer are only knowable at runtime:
# hub mode connects to backends listed in an operator-supplied registry, and a
# basemap opt-out puts a third-party tile host back in the browser. A literal
# wide enough for every deployment is a literal that protects none of them.
#
# The narrowed policy ships as REPORT-ONLY alongside the still-enforced old one.
# A too-tight CSP fails silently — photos simply do not appear, with nothing but
# a console message — so the class of bug this would otherwise introduce is "a
# rarely-taken path breaks in production". One release of observation first.

# _csp_append <list> <token> — appends once, so a host that arrives from two
# sources (a basemap host that is also a registry host) is not listed twice.
_csp_append() {
    case " $1 " in
        *" $2 "*) printf '%s' "$1" ;;
        *) if [ -n "$1" ]; then printf '%s %s' "$1" "$2"; else printf '%s' "$2"; fi ;;
    esac
}

# origin_of <url> — "scheme://host[:port]" for an absolute URL, "host[:port]"
# for a scheme-relative one, empty for a same-origin path.
#
# Deliberately NOT host_of(), whose consumer is the human-readable privacy page
# and which drops both scheme and port. Both matter here and in opposite
# directions: a CSP host-source with no port matches only the scheme's default
# port, and one with no scheme matches only the document's own scheme. So
# reducing http://lab.internal:3000 to lab.internal yields a policy that blocks
# the backend it was added for twice over — wrong port, and no http on an
# https-served page.
origin_of() {
    case "$1" in
        # //host must be tested BEFORE /path. A `case` takes the first match, so
        # with /* first the //* branch is unreachable and a scheme-relative URL
        # is misread as same-origin — the same trap host_of() documents, and one
        # this function reintroduced on its first draft.
        //*) _o=${1#//}; _o=${_o%%/*}; _o=${_o##*@}; printf '%s' "$_o" ;;
        ''|/*) ;;                       # same-origin: 'self' already covers it
        *://*) _o=${1#*://}; _o=${_o%%/*}; _o=${_o##*@}
               printf '%s://%s' "${1%%://*}" "$_o" ;;
        *) _o=${1%%/*}; _o=${_o##*@}; printf '%s' "$_o" ;;
    esac
}

# registry_hosts — the backend origins hub mode connects to. The registry is
# operator-supplied and not known at build time, so it is read here.
#
# Only the "url" values are taken, NOT every URL in the document. A text scan
# for any http(s) URL is right for a style document, where every URL really is
# an asset the browser fetches, but a registry is not: an operator adding a
# per-instance "website" or a docs link would silently re-widen the very
# directive this change exists to narrow.
#
# Still a text scan rather than a JSON parse: there is no jq in the runtime
# image.
registry_hosts() {
    case "$1" in
        //*|*://*) origin_of "$1"; return ;;   # remote registry: its own origin
                                               # counts, contents unreadable here
    esac
    _rf="${WEBROOT}${1%%\?*}"
    [ -f "$_rf" ] || return
    grep -o '"url"[^"]*"[^"]*"' "$_rf" 2>/dev/null \
        | sed -e 's/.*"\([^"]*\)"$/\1/' \
        | while IFS= read -r _ru; do origin_of "$_ru"; printf '\n'; done \
        | grep -v '^$' | sort -u | tr '\n' ' '
}

# img-src. The Wikimedia entries are wildcards on purpose: app/src/lib/commons.js
# accepts an OSM `image` tag on ANY *.wikimedia.org or *.wikipedia.org host
# (isSafeImageUrl -> isWikimediaHost), so pinning this to upload. and commons.
# as #854 proposed would silently stop rendering valid tags on the other hosts.
# The apex domains are listed separately because `*.example.org` does not match
# `example.org` in CSP. Narrowing the code's accepted host set is a separate
# decision; the policy matches what the code permits today.
#
# Each entry is present only when its service is NOT proxied, which is what
# makes the default deployment's lists nearly empty: with every proxy on, the
# browser fetches all of this from this origin and 'self' covers it.
#
# The Wikimedia image sources are UNCONDITIONAL, even though the photo gallery
# is proxied. app/src/lib/equipmentAttributes.js renders equipment-attribute
# images straight from commons.wikimedia.org/wiki/Special:FilePath/..., and
# that path is not proxied: Special:FilePath answers with a redirect chain that
# would need /w/index.php — a full MediaWiki entry point — opened up as a relay
# to follow. Narrowing img-src while that code still fetches directly would
# block those images and put a false statement on the privacy page.
# Tracked as a follow-up; see docs/reference/external-services.md.
_csp_img=""
_csp_img=$(_csp_append "$_csp_img" "https://*.wikimedia.org")
_csp_img=$(_csp_append "$_csp_img" "https://wikimedia.org")
_csp_img=$(_csp_append "$_csp_img" "https://*.wikipedia.org")
_csp_img=$(_csp_append "$_csp_img" "https://wikipedia.org")
# Unconditional: Panoramax thumbnails are always fetched by the browser,
# because the endpoint redirects to a per-instance derivative host that cannot
# be proxied. Its viewer iframe is covered by frame-src.
_csp_img=$(_csp_append "$_csp_img" "https://api.panoramax.xyz")

# connect-src. Nominatim (search and region URLs), the Commons API, and the
# Mangrove read and submit paths — each only while it is fetched by the browser.
_csp_connect=""
if [ -z "$EXT_NOMINATIM" ]; then
    _csp_connect=$(_csp_append "$_csp_connect" "https://nominatim.openstreetmap.org")
fi
if [ -z "$EXT_COMMONS" ]; then
    _csp_connect=$(_csp_append "$_csp_connect" "https://commons.wikimedia.org")
fi
if [ -z "$EXT_MANGROVE" ]; then
    _csp_connect=$(_csp_append "$_csp_connect" "https://api.mangrove.reviews")
fi

# Basemap hosts belong in BOTH directives, which is easy to get wrong: raster
# tiles and a vector style's sprite sheet are images, while the style document
# and its vector tiles are fetches. Getting only one of the two produces a map
# that half-renders.
case "$BASEMAP_TILE_PROVIDER_STATE" in
    hosts)
        # These come from host_of/style_asset_hosts, which drop BOTH scheme and
        # port because their other consumer is the human-readable privacy page.
        # A bare host-source matches only the document's own scheme (plus the
        # http->https upgrade allowance) and only that scheme's default port, so
        # a tileserver on a non-default port, or one served over http behind an
        # https instance, needs its origin adding via CSP_IMG_EXTRA *and*
        # CSP_CONNECT_EXTRA. Harmless while the narrowed policy is report-only;
        # resolve before the enforcing swap.
        for _bmh in $BASEMAP_TILE_PROVIDER_HOST; do
            [ -n "$_bmh" ] || continue
            _csp_img=$(_csp_append     "$_csp_img"     "$_bmh")
            _csp_connect=$(_csp_append "$_csp_connect" "$_bmh")
        done
        ;;
    unknown)
        # A style is configured but its document could not be read, so where it
        # sends the browser is genuinely unknown. Emitting a narrow list here
        # would blank the basemap of a deployment whose config we failed to
        # understand, so this one state stays wide and says so. It is also why
        # BASEMAP_TILE_PROVIDER_STATE must be read before the host list — an
        # empty list means "nobody" in the 'none' state and "unreadable" here.
        _csp_img=$(_csp_append     "$_csp_img"     "https:")
        _csp_connect=$(_csp_append "$_csp_connect" "https:")
        ;;
    # none: default and proxied delivery. The browser only talks to this
    # origin for the basemap, so 'self' already covers it.
esac

# The PostgREST API. Same-origin /api by default, but DEPLOY_MODE=ui points it
# at another host entirely, and every data call in app/src/lib/api.js goes to
# "${baseUrl}/rpc/...". Missing this is not a cosmetic gap: a ui-mode stack
# would lose every playground the moment the narrowed policy is enforced, which
# is the most severe way this generator can be wrong.
_api_origin=$(origin_of "$SAFE_API_BASE_URL")
if [ -n "$_api_origin" ]; then
    _csp_connect=$(_csp_append "$_csp_connect" "$_api_origin")
fi

# Hub backends.
if [ "$APP_MODE" = "hub" ]; then
    for _rh in $(registry_hosts "$SAFE_REGISTRY_URL"); do
        [ -n "$_rh" ] || continue
        _csp_connect=$(_csp_append "$_csp_connect" "$_rh")
    done
fi

# CSP_CONNECT_EXTRA / CSP_IMG_EXTRA — the documented escape hatches. The
# connect one is also the answer for a hub whose registry is fetched at runtime
# rather than baked into the image, where the file above does not exist to be
# read. Both take space-separated hosts or origins, and both exist because a
# third party can be either fetched from or rendered from: a tileserver on a
# non-default port needs to appear in BOTH directives, so one variable would
# have been an escape hatch that only half works.
#
# Validated, not stripped: a mangled host silently produces a policy that
# blocks the very origin it was added for.
# Validated in the loop rather than in a helper called through $( ): `die` runs
# `exit 1`, which inside a command substitution ends only the subshell, and
# `set -e` does not reliably abort on a failed substitution in a `for` word
# list. The check would have looked present and validated nothing.
for _ce in ${CSP_CONNECT_EXTRA:-}; do
    case "$_ce" in
        *[!A-Za-z0-9.:/*_-]*) die "CSP_CONNECT_EXTRA contains characters that are not valid in a host or origin, got: $_ce" ;;
    esac
    _csp_connect=$(_csp_append "$_csp_connect" "$_ce")
done
for _ce in ${CSP_IMG_EXTRA:-}; do
    case "$_ce" in
        *[!A-Za-z0-9.:/*_-]*) die "CSP_IMG_EXTRA contains characters that are not valid in a host or origin, got: $_ce" ;;
    esac
    _csp_img=$(_csp_append "$_csp_img" "$_ce")
done

# frame-ancestors keeps its https: wildcard: it governs who may embed spieli,
# not what spieli discloses, and the hub embeds standalone instances. Narrowing
# it is a separate decision about embedding (see #855).
_csp_common="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-src https://panoramax.xyz https://api.panoramax.xyz; frame-ancestors 'self' https:"

# Assembled here rather than inside the heredoc so that a fully proxied
# deployment yields exactly "img-src 'self' data:" and "connect-src 'self'",
# with no dangling separator. Those two strings are the visible proof that
# nothing third-party is fetched, so they are worth getting exactly right.
_csp_img_dir="img-src 'self' data:"
if [ -n "$_csp_img" ]; then
    _csp_img_dir="${_csp_img_dir} ${_csp_img}"
fi
_csp_connect_dir="connect-src 'self'"
if [ -n "$_csp_connect" ]; then
    _csp_connect_dir="${_csp_connect_dir} ${_csp_connect}"
fi

# Written to a temp file and moved into place, so the file never exists in a
# half-written state. `cat > file` creates it empty and then fills it, and a
# reader that catches that window (nginx -t in CI, an operator inspecting it
# during a restart) sees a truncated policy or an invalid config — a failure
# that looks exactly like a real regression. rename(2) within one filesystem is
# atomic, so a reader sees either the old file or the complete new one.
cat > /etc/nginx/csp.conf.new <<CSPEOF
# Generated by docker-entrypoint.sh — rewritten on every start, do not edit.
#
# TWO policies ship together on purpose. The first is the long-standing
# wildcard policy and is ENFORCED. The second is the narrowed host list and is
# REPORT-ONLY: violations appear in the visitor's browser console but nothing is
# blocked. Note what that does and does not give us: CI asserts on the GENERATED
# POLICY (the "CSP must follow the configuration" job greps this file), not on
# violations. Nothing in the repo observes securitypolicyviolation events, and
# there is deliberately no report-uri, so the observation period depends on
# operators reporting console messages. When the report set has been confirmed
# empty across both app modes and both basemap postures, the report-only header
# becomes the enforced one and the wildcard policy is deleted.
# See docs/ops/security.md.
#
# There is deliberately no report-uri: it would collect a per-visitor record of
# what the visitor's browser tried to load, on the operator's disk, which is
# the exact shape of trail #855 exists to remove.
add_header Content-Security-Policy
    "${_csp_common}; img-src 'self' data: https:; connect-src 'self' https:"
    always;
add_header Content-Security-Policy-Report-Only
    "${_csp_common}; ${_csp_img_dir}; ${_csp_connect_dir}"
    always;
CSPEOF
mv /etc/nginx/csp.conf.new /etc/nginx/csp.conf


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
  basemapCoverageBbox: '${SAFE_BASEMAP_COVERAGE_BBOX}',
  basemapUrl:        '${SAFE_BASEMAP_URL}',
  basemapAttribution:'${SAFE_BASEMAP_ATTRIBUTION}',
  parentOrigin:      '${SAFE_PARENT_ORIGIN}',
  nominatimBaseUrl:  '${EXT_NOMINATIM_URL}',
  commonsApiUrl:     '${EXT_COMMONS_API_URL}',
  commonsFileBase:   '${EXT_COMMONS_FILE_BASE}',
  mangroveApiUrl:    '${EXT_MANGROVE_URL}',
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
  basemapCoverageBbox:        '${SAFE_BASEMAP_COVERAGE_BBOX}',
  basemapUrl:                 '${SAFE_BASEMAP_URL}',
  basemapAttribution:         '${SAFE_BASEMAP_ATTRIBUTION}',
  parentOrigin:               '${SAFE_PARENT_ORIGIN}',
  nominatimBaseUrl:           '${EXT_NOMINATIM_URL}',
  commonsApiUrl:              '${EXT_COMMONS_API_URL}',
  commonsFileBase:            '${EXT_COMMONS_FILE_BASE}',
  mangroveApiUrl:             '${EXT_MANGROVE_URL}',
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
        # The basemap disclosure follows the actual delivery mode rather than
        # being written once and going stale. BASEMAP_TILE_PROVIDER_STATE is
        # produced further up; read it, never the host list alone, because an
        # empty list means two opposite things.
        BM_ROW_FILE=$(mktemp)
        BM_SECTION_FILE=$(mktemp)
        # The Grundsatz paragraph is about what third parties receive, so its
        # tile-coordinate clause has to follow the delivery mode too. Left
        # unconditional it contradicts the Hintergrundkarte section below in
        # the default same-origin mode, which is the one claim on this page a
        # visitor is most likely to check.
        BM_INTRO_FILE=$(mktemp)
        # The service table follows the proxy configuration, the same way the
        # basemap row does. With every proxy on, the only row left is the
        # Panoramax viewer iframe — which is not proxied by design, because
        # serving a whole third-party application from this origin would give
        # it same-origin privileges here.
        #
        # This is a legal document, so a row that stays on the page after the
        # service stopped being contacted is a false statement about a data
        # transfer, not a stale sentence.
        EXT_ROWS_FILE=$(mktemp)
        if [ -z "$EXT_NOMINATIM" ]; then
            cat >> "$EXT_ROWS_FILE" <<'EXTROW_NOM'
      <tr>
        <td><a href="https://nominatim.openstreetmap.org/" target="_blank" rel="noopener">Nominatim</a> (OpenStreetMap Foundation)<br><code>nominatim.openstreetmap.org</code></td>
        <td>Ortssuche und Auflösung von Regions-Adressen wie <code>/fulda</code></td>
        <td>Bei einer Suchanfrage sowie beim Aufruf einer Regions-Adresse</td>
        <td>IP-Adresse, User-Agent, Referer, eingegebener Suchbegriff</td>
      </tr>
EXTROW_NOM
        fi
        if [ -z "$EXT_COMMONS" ]; then
            cat >> "$EXT_ROWS_FILE" <<'EXTROW_COM'
      <tr>
        <td><a href="https://commons.wikimedia.org/" target="_blank" rel="noopener">Wikimedia Commons</a><br><code>commons.wikimedia.org</code>, <code>upload.wikimedia.org</code>, <code>thumb.wikimedia.org</code></td>
        <td>Spielplatzfotos aus den OSM-Tags <code>wikimedia_commons</code> und <code>image</code></td>
        <td>Beim Auswählen eines Spielplatzes, für den solche Tags hinterlegt sind</td>
        <td>IP-Adresse, User-Agent, Referer, Name der abgerufenen Bilddatei</td>
      </tr>
EXTROW_COM
        else
            # Even with the Commons proxy enabled, one image path is still
            # fetched by the browser: equipment-attribute illustrations are
            # rendered straight from Special:FilePath, which cannot be proxied
            # without opening /w/index.php as a relay. A row that omitted this
            # would be a false statement about a data transfer.
            cat >> "$EXT_ROWS_FILE" <<'EXTROW_COM_PARTIAL'
      <tr>
        <td><a href="https://commons.wikimedia.org/" target="_blank" rel="noopener">Wikimedia Commons</a><br><code>commons.wikimedia.org</code></td>
        <td>Abbildungen einzelner Ausstattungsmerkmale</td>
        <td>Beim Auswählen eines Spielplatzes, für dessen Ausstattung Abbildungen vorliegen. Die Spielplatzfotos selbst werden über diese Instanz geladen und erreichen Wikimedia nicht</td>
        <td>IP-Adresse, User-Agent, Referer, Name der abgerufenen Bilddatei</td>
      </tr>
EXTROW_COM_PARTIAL
        fi
        if [ -z "$EXT_MANGROVE" ]; then
            cat >> "$EXT_ROWS_FILE" <<'EXTROW_MG'
      <tr>
        <td><a href="https://mangrove.reviews/" target="_blank" rel="noopener">Mangrove Reviews</a><br><code>api.mangrove.reviews</code></td>
        <td>Abruf und Abgabe von Bewertungen</td>
        <td>Erst wenn Sie den Abschnitt „Bewertungen“ ausklappen; danach einmal je weiterem Spielplatz, den Sie bei ausgeklapptem Abschnitt auswählen. Nicht beim bloßen Auswählen eines Spielplatzes. Zusätzlich beim Absenden einer Bewertung</td>
        <td>IP-Adresse, User-Agent, Referer, Koordinaten des Spielplatzes. Beim Absenden zusätzlich Ihre Bewertung, ein optionaler Kommentar und Ihr öffentlicher Schlüssel (siehe „Lokale Speicherung“)</td>
      </tr>
EXTROW_MG
        fi
        # Two distinct Panoramax rows. The thumbnail is an image and is proxied
        # like anything else; the viewer is an iframe and never is. Only the
        # thumbnail half disappears when the proxy is enabled.
        cat >> "$EXT_ROWS_FILE" <<'EXTROW_PXTHUMB'
      <tr>
        <td><a href="https://panoramax.xyz/" target="_blank" rel="noopener">Panoramax</a><br><code>api.panoramax.xyz</code></td>
        <td>Vorschaubilder der Fotos auf Straßenebene</td>
        <td>Beim Auswählen eines Spielplatzes, zu dem Fotos vorliegen</td>
        <td>IP-Adresse, User-Agent, Referer, Kennung des abgerufenen Fotos</td>
      </tr>
EXTROW_PXTHUMB
        cat >> "$EXT_ROWS_FILE" <<'EXTROW_PXVIEWER'
      <tr>
        <td><a href="https://panoramax.xyz/" target="_blank" rel="noopener">Panoramax</a> — Betrachter<br><code>api.panoramax.xyz</code></td>
        <td>Anzeige der Fotos auf Straßenebene</td>
        <td>Beim Auswählen eines Spielplatzes, zu dem Fotos vorliegen</td>
        <td>IP-Adresse, User-Agent, Referer, Kennung des abgerufenen Fotos. Der Betrachter wird als <code>&lt;iframe&gt;</code> eingebettet, Panoramax erhält damit einen eigenen Browser-Kontext auf dieser Seite und kann dort eigene Daten speichern. Dieser Betrachter wird bewusst nicht über diese Instanz ausgeliefert: eine vollständige fremde Anwendung von dieser Herkunft auszuliefern würde ihr Zugriff auf die Daten dieser Website geben</td>
      </tr>
EXTROW_PXVIEWER

        case "$BASEMAP_TILE_PROVIDER_STATE" in
            hosts)
                # The operator opted out to a third party. Name it: this is the
                # one service contacted on every map movement, and the tile
                # coordinates say what the visitor was looking at.
                _bm_hosts_html=$(printf '%s' "$BASEMAP_TILE_PROVIDER_HOST" \
                    | tr -cd 'A-Za-z0-9 ._:-' | sed 's/ /<\/code>, <code>/g')
                cat > "$BM_ROW_FILE" <<BMROW
      <tr>
        <td>Kartenanbieter<br><code>${_bm_hosts_html}</code></td>
        <td>Hintergrundkarte (Kartenkacheln)</td>
        <td>Bei jedem Laden der Karte und bei jeder Bewegung des Kartenausschnitts</td>
        <td>IP-Adresse, User-Agent, Referer, Kachelkoordinaten (Zoomstufe, X, Y). Aus den Kachelkoordinaten l&auml;sst sich ableiten, welchen Kartenausschnitt Sie betrachtet haben</td>
      </tr>
BMROW
                cat > "$BM_SECTION_FILE" <<'BMSEC'
  <h2>Hintergrundkarte</h2>
  <p>Diese Instanz ist so konfiguriert, dass die Hintergrundkarte direkt von einem externen Anbieter geladen wird. Ihr Browser nimmt dabei bei jeder Kartenbewegung selbst Verbindung zu diesem Anbieter auf; der Anbieter ist in der Tabelle oben aufgef&uuml;hrt.</p>

BMSEC
                cat > "$BM_INTRO_FILE" <<'BMINTRO'
  Bei Kartenkacheln kommen die angefragten Kachelkoordinaten hinzu, aus denen sich ableiten l&auml;sst, welchen Kartenausschnitt Sie betrachten.
BMINTRO
                ;;
            unknown)
                cat > "$BM_ROW_FILE" <<'BMROW'
      <tr>
        <td>Kartenanbieter<br><code>nicht ermittelbar</code></td>
        <td>Hintergrundkarte (Kartenkacheln)</td>
        <td>Bei jedem Laden der Karte und bei jeder Bewegung des Kartenausschnitts</td>
        <td>IP-Adresse, User-Agent, Referer, Kachelkoordinaten (Zoomstufe, X, Y)</td>
      </tr>
BMROW
                cat > "$BM_SECTION_FILE" <<'BMSEC'
  <h2>Hintergrundkarte</h2>
  <p>Diese Instanz verwendet ein eigens konfiguriertes Kartenstil-Dokument, dessen Inhalt hier nicht ausgewertet werden konnte. Es ist daher nicht sichergestellt, dass keine Verbindung zu Dritten aufgebaut wird. Der Betreiber sollte diesen Abschnitt pr&uuml;fen und erg&auml;nzen.</p>

BMSEC
                # Cannot rule out a third-party tile fetch, so keep the clause:
                # over-disclosing here is the safe direction.
                cat > "$BM_INTRO_FILE" <<'BMINTRO'
  Bei Kartenkacheln kommen unter Umst&auml;nden die angefragten Kachelkoordinaten hinzu, aus denen sich ableiten l&auml;sst, welchen Kartenausschnitt Sie betrachten.
BMINTRO
                ;;
            *)
                # none: the browser only ever talks to this instance. Say so
                # plainly rather than hedging it, because it is the strongest
                # statement on this page and it is true.
                : > "$BM_ROW_FILE"
                # No third party receives tile coordinates, so the Grundsatz
                # clause saying otherwise is dropped entirely.
                : > "$BM_INTRO_FILE"
                cat > "$BM_SECTION_FILE" <<'BMSEC'
  <h2>Hintergrundkarte</h2>
  <p>Die Hintergrundkarte wird vollst&auml;ndig von dieser Instanz ausgeliefert. Kartenkacheln, Symbole und Schriften holt der Server selbst und speichert sie zwischen; Ihr Browser nimmt daf&uuml;r zu keinem Dritten Verbindung auf. Es wird deshalb auch nicht protokolliert, welchen Kartenausschnitt Sie betrachten.</p>

BMSEC
                ;;
        esac
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
        awk -v hubfile="$HUB_SECTION_FILE" \
            -v bmrowfile="$BM_ROW_FILE" -v bmsecfile="$BM_SECTION_FILE" \
            -v bmintrofile="$BM_INTRO_FILE" -v extrowsfile="$EXT_ROWS_FILE" '
            function inline(f) {
                while ((getline line < f) > 0) print line
                close(f)
            }
            /\{\{HUB_PRIVACY_SECTION\}\}/    { inline(hubfile);   next }
            /\{\{BASEMAP_SERVICE_ROW\}\}/    { inline(bmrowfile); next }
            /\{\{BASEMAP_PRIVACY_SECTION\}\}/ { inline(bmsecfile); next }
            /\{\{BASEMAP_INTRO_CLAUSE\}\}/   { inline(bmintrofile); next }
            /\{\{EXT_SERVICE_ROWS\}\}/      { inline(extrowsfile); next }
            { print }
        ' > "$WEBROOT/datenschutz.html"
        rm -f "$HUB_SECTION_FILE" "$BM_ROW_FILE" "$BM_SECTION_FILE" "$BM_INTRO_FILE" "$EXT_ROWS_FILE"
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
