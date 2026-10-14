# spieli — Svelte frontend + nginx.
# Supports APP_MODE=standalone (default) and APP_MODE=hub via docker-entrypoint.sh.
# Build context must be the repo root (needs app/ source files).

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /build

# Install dependencies first (layer cache friendly)
COPY app/package*.json ./
RUN npm ci

# Build the Svelte app
COPY app/ ./
COPY locales/ /locales/
RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM nginx:alpine

# busybox-suid provides crond; jq parses registry.json in the poll script
RUN apk add --no-cache busybox-suid jq

# No access log at all (#988). The stock nginx.conf logs every request with
# the visitor's IP, user agent and full URI to stdout, i.e. into the Docker
# logs, and an API URI carries the map extent the visitor is looking at.
# error_log stays. The grep fails the build if the base image ever stops
# matching, rather than silently logging again.
RUN sed -i 's#^\(\s*\)access_log\s.*#\1access_log off;#' /etc/nginx/nginx.conf \
 && grep -q 'access_log off;' /etc/nginx/nginx.conf \
 && ! grep -E '^\s*access_log\s+/' /etc/nginx/nginx.conf

COPY --from=builder /build/dist      /usr/share/nginx/html
COPY oci/app/nginx.conf              /etc/nginx/conf.d/default.conf
COPY oci/app/docker-entrypoint.sh       /docker-entrypoint.sh
COPY oci/app/poll-federation.sh         /usr/local/bin/poll-federation.sh
COPY oci/app/datenschutz.template.html  /datenschutz.template.html
RUN chmod +x /docker-entrypoint.sh /usr/local/bin/poll-federation.sh

# Run poll script every minute as root
RUN printf '* * * * * /usr/local/bin/poll-federation.sh >/dev/null 2>&1\n' \
    > /etc/crontabs/root

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
