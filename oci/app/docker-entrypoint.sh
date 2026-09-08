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
