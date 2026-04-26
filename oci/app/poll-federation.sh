#!/bin/sh
# Hub federation health poll — runs every 60 s via crond.
# Reads /usr/share/nginx/html/registry.json, fetches get_meta from each
# backend, writes /usr/share/nginx/html/federation-status.json and
# /usr/share/nginx/html/metrics atomically (tmp → rename).
set -e

WEBROOT="/usr/share/nginx/html"
REGISTRY="$WEBROOT/registry.json"
STATUS_OUT="$WEBROOT/federation-status.json"
METRICS_OUT="$WEBROOT/metrics"
POLL_INTERVAL=60

# Previous status for preserving last_success on transient failures
PREV_STATUS=""
[ -f "$STATUS_OUT" ] && PREV_STATUS=$(cat "$STATUS_OUT")

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# No registry → write an empty-but-valid status and exit
if [ ! -f "$REGISTRY" ]; then
    GENERATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    printf '{"generated_at":"%s","poll_interval_seconds":%d,"backends":{}}\n' \
        "$GENERATED_AT" "$POLL_INTERVAL" > "$TMP/status.json"
    printf '# HELP spielplatz_poll_generated_timestamp Unix timestamp when this scrape was generated.\n' > "$TMP/metrics"
    printf '# TYPE spielplatz_poll_generated_timestamp gauge\n' >> "$TMP/metrics"
    printf 'spielplatz_poll_generated_timestamp %s\n' "$(date -u +%s)" >> "$TMP/metrics"
    mv "$TMP/status.json" "$STATUS_OUT"
    mv "$TMP/metrics"     "$METRICS_OUT"
    exit 0
fi

GENERATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GENERATED_TS=$(date -u +%s)

# Build JSON and Prometheus output per backend
BACKENDS_JSON=""
METRICS_LINES=""

# jq outputs: slug<TAB>url per line
jq -r '.backends[] | (.slug // (.url | gsub("[^a-z0-9]"; "_"))) + "\t" + .url' \
    "$REGISTRY" > "$TMP/backends.tsv" 2>/dev/null || true

while IFS="	" read -r SLUG URL; do
    [ -z "$URL" ] && continue

    META_TMP="$TMP/meta_${SLUG}.json"
    HTTP_CODE=0
    LATENCY="0"
    UP=0

    # curl: silent, fail on HTTP error, capture timing, 3 s timeout
    if curl -sf --max-time 3 \
            -w '%{time_total}' \
            -o "$META_TMP" \
            "${URL}/rpc/get_meta" > "$TMP/curl_time_${SLUG}.txt" 2>/dev/null; then
        LATENCY=$(cat "$TMP/curl_time_${SLUG}.txt")
        UP=1
    fi

    LAST_IMPORT_AT="null"
    DATA_AGE_SECONDS="null"
    if [ "$UP" = "1" ] && [ -f "$META_TMP" ]; then
        RAW=$(cat "$META_TMP")
        # get_meta returns a JSON array with one element
        LAST_IMPORT_AT=$(printf '%s' "$RAW" | jq -r '.[0].last_import_at // empty' 2>/dev/null)
        DATA_AGE_SECONDS=$(printf '%s' "$RAW" | jq -r '.[0].data_age_seconds // empty' 2>/dev/null)
        [ -z "$LAST_IMPORT_AT" ]   && LAST_IMPORT_AT="null"
        [ -z "$DATA_AGE_SECONDS" ] && DATA_AGE_SECONDS="null"
    fi

    # Preserve last_success from previous run if backend is currently down
    LAST_SUCCESS="null"
    if [ -n "$PREV_STATUS" ]; then
        PREV_LAST=$(printf '%s' "$PREV_STATUS" \
            | jq -r --arg slug "$SLUG" '.backends[$slug].last_success // empty' 2>/dev/null)
        [ -n "$PREV_LAST" ] && LAST_SUCCESS="\"$PREV_LAST\""
    fi
    [ "$UP" = "1" ] && LAST_SUCCESS="\"$GENERATED_AT\""

    # Append to backends JSON object
    if [ -n "$BACKENDS_JSON" ]; then BACKENDS_JSON="${BACKENDS_JSON},"; fi
    BACKENDS_JSON="${BACKENDS_JSON}\"${SLUG}\":{"
    BACKENDS_JSON="${BACKENDS_JSON}\"url\":\"${URL}\","
    BACKENDS_JSON="${BACKENDS_JSON}\"up\":$([ "$UP" = "1" ] && echo true || echo false),"
    BACKENDS_JSON="${BACKENDS_JSON}\"latency_seconds\":${LATENCY},"
    BACKENDS_JSON="${BACKENDS_JSON}\"last_success\":${LAST_SUCCESS},"
    BACKENDS_JSON="${BACKENDS_JSON}\"last_import_at\":${LAST_IMPORT_AT},"
    BACKENDS_JSON="${BACKENDS_JSON}\"data_age_seconds\":${DATA_AGE_SECONDS}"
    BACKENDS_JSON="${BACKENDS_JSON}}"

    # Append Prometheus metrics
    LABEL="backend=\"${SLUG}\",url=\"${URL}\""
    METRICS_LINES="${METRICS_LINES}spielplatz_backend_up{${LABEL}} ${UP}\n"
    METRICS_LINES="${METRICS_LINES}spielplatz_backend_latency_seconds{${LABEL}} ${LATENCY}\n"
    if [ "$DATA_AGE_SECONDS" != "null" ] && [ -n "$DATA_AGE_SECONDS" ]; then
        METRICS_LINES="${METRICS_LINES}spielplatz_backend_data_age_seconds{${LABEL}} ${DATA_AGE_SECONDS}\n"
    fi
done < "$TMP/backends.tsv"

# Write status.json
printf '{"generated_at":"%s","poll_interval_seconds":%d,"backends":{%s}}\n' \
    "$GENERATED_AT" "$POLL_INTERVAL" "$BACKENDS_JSON" > "$TMP/status.json"

# Write Prometheus metrics
{
    printf '# HELP spielplatz_backend_up 1 if the backend responded to get_meta, 0 otherwise.\n'
    printf '# TYPE spielplatz_backend_up gauge\n'
    printf '# HELP spielplatz_backend_latency_seconds Round-trip time for the last get_meta call.\n'
    printf '# TYPE spielplatz_backend_latency_seconds gauge\n'
    printf '# HELP spielplatz_backend_data_age_seconds Seconds since the backend last imported data.\n'
    printf '# TYPE spielplatz_backend_data_age_seconds gauge\n'
    printf '# HELP spielplatz_poll_generated_timestamp Unix timestamp when this scrape was generated.\n'
    printf '# TYPE spielplatz_poll_generated_timestamp gauge\n'
    printf '%b' "$METRICS_LINES"
    printf 'spielplatz_poll_generated_timestamp %s\n' "$GENERATED_TS"
} > "$TMP/metrics"

# Atomic rename
mv "$TMP/status.json" "$STATUS_OUT"
mv "$TMP/metrics"     "$METRICS_OUT"
