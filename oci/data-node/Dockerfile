# spieli-data — nginx CORS proxy only, no frontend.
# Exposes the PostgREST API at /api/ and serves /version.json and /healthz.
# The Svelte frontend is built and served by app/Dockerfile instead.

FROM nginx:alpine

ARG VERSION=dev

# Bake version.json into the image so /version.json returns the build version.
RUN mkdir -p /usr/share/nginx/html && \
    printf '{"version":"%s"}' "$VERSION" > /usr/share/nginx/html/version.json

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
