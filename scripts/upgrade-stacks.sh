#!/usr/bin/env bash
# upgrade-stacks.sh — sequential upgrade of all spieli stacks on one host.
#
# Run on the VPS as the user who owns the stack directories.
# Edit STACKS below to match your deployment. List data-nodes first, hub last.
#
# Usage: bash upgrade-stacks.sh
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
# Format per entry: "DIRECTORY:SPACE-SEPARATED-PROFILES:LOCAL_PORT"
# data-nodes first, hub (ui auto-update) last.
# Pure hub stacks (DEPLOY_MODE=ui) skip the API_ONLY step — no importer.
STACKS=(
  "$HOME/spieli-hessen:data-node-ui:8081"
  "$HOME/spieli-berlin:data-node-ui:8082"
  "$HOME/spieli-bayern:data-node-ui:8083"
  "$HOME/spieli-brandenburg:data-node-ui:8084"
  "$HOME/spieli-bremen:data-node-ui:8085"
  "$HOME/spieli-hamburg:data-node-ui:8086"
  "$HOME/spieli-mv:data-node-ui:8087"
  "$HOME/spieli-nrw:data-node-ui:8088"
  "$HOME/spieli-rlp:data-node-ui:8089"
  "$HOME/spieli-saarland:data-node-ui:8090"
  "$HOME/spieli-sachsen:data-node-ui:8091"
  "$HOME/spieli-sachsen-anhalt:data-node-ui:8092"
  "$HOME/spieli-sh:data-node-ui:8093"
  "$HOME/spieli-thueringen:data-node-ui:8094"
  "$HOME/spieli:ui auto-update:8080"
)
# ─────────────────────────────────────────────────────────────────────────────

fail() { echo "ERROR: $*" >&2; exit 1; }

for entry in "${STACKS[@]}"; do
  IFS=: read -r dir profiles port <<< "$entry"
  name=$(basename "$dir")

  echo ""
  echo "━━━ $name ━━━"

  cd "$dir" || fail "Cannot cd to $dir"

  profile_flags=()
  for p in $profiles; do
    profile_flags+=(--profile "$p")
  done

  echo "→ Pulling images..."
  docker compose pull

  echo "→ Restarting app and importer containers..."
  docker compose "${profile_flags[@]}" up -d app

  # Pure hub stacks (DEPLOY_MODE=ui) have no importer — skip importer steps.
  if [[ "$profiles" == *"data-node"* ]]; then
    # Restart the daemon importer so it picks up the new image immediately.
    # Daemon mode runs api.sql on every startup, so the version in get_meta()
    # is updated without waiting for the next scheduled Watchtower restart.
    docker compose "${profile_flags[@]}" up -d importer

    echo "→ Applying api.sql (one-shot, never triggers full reimport)..."
    # API_ONLY=1 is evaluated before any reimport logic in the importer entrypoint,
    # so REIMPORT_INTERVAL_* settings have no effect here.
    docker compose --profile data-node-ui run --rm -e API_ONLY=1 importer
  else
    echo "→ Pure hub — no importer, skipping api.sql step."
  fi

  echo "→ Verifying..."
  sleep 3
  result=$(curl -sf "http://localhost:${port}/api/rpc/get_meta" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print('version:', d.get('version','?'), ' playgrounds:', d.get('playground_count','?'))") \
    || fail "get_meta unreachable for $name on port $port"
  echo "  $result"

  echo "✓ $name done"
done

echo ""
echo "All stacks upgraded."
