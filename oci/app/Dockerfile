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

COPY --from=builder /build/dist      /usr/share/nginx/html
COPY oci/app/nginx.conf              /etc/nginx/conf.d/default.conf
COPY oci/app/docker-entrypoint.sh    /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
