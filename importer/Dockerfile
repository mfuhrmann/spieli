FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    osm2pgsql \
    wget \
    postgresql-client \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY import.sh /import.sh
COPY api.sql   /api.sql
RUN chmod +x /import.sh

VOLUME ["/data"]

CMD ["/import.sh"]
