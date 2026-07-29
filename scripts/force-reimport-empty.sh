#!/usr/bin/env bash
# force-reimport-empty.sh — triggers forced reimport for every data-node stack
# that currently reports 0 playgrounds. Runs imports sequentially to avoid OOM
# on a single VPS (each import can use several GB of RAM).
#
# Usage: bash scripts/force-reimport-empty.sh
set -euo pipefail

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
  "$HOME/spieli-niedersachsen:data-node-ui:8096"
  # Port 8095 is intentionally absent: Baden-Württemberg is hosted on a
  # different operator's machine and joins the federation via registry.json,
  # so this host has no ~/spieli-bawue stack to reimport. Do not re-add it here
  # — scripts/setup-germany-backends.sh reserves 8095 for it federation-wide,
  # not on this host.
)

failed=()

for entry in "${STACKS[@]}"; do
  IFS=: read -r dir profiles port <<< "$entry"
  name=$(basename "$dir")

  count=$(curl -sf "http://localhost:${port}/api/rpc/get_meta" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('playground_count', -1))" 2>/dev/null \
    || echo -1)

  if [[ "$count" -gt 0 ]]; then
    echo "✓ $name — $count playgrounds, skipping"
    continue
  fi

  echo ""
  echo "━━━ $name — 0 playgrounds, running forced reimport ━━━"
  cd "$dir"

  # Use the stack's own profiles rather than assuming data-node-ui: app and
  # importer are profile-gated, so a stack on a different profile set would
  # otherwise be run against the wrong services (see #718).
  profile_flags=()
  for p in $profiles; do
    profile_flags+=(--profile "$p")
  done

  if docker compose "${profile_flags[@]}" run --rm \
      -e REIMPORT_INTERVAL_MIN_DAYS= \
      -e REIMPORT_INTERVAL_MAX_DAYS= \
      importer; then
    echo "✓ $name done"
  else
    echo "✗ $name FAILED"
    failed+=("$name")
  fi
done

echo ""
if [[ ${#failed[@]} -gt 0 ]]; then
  echo "Failed: ${failed[*]}"
  exit 1
fi
echo "All forced reimports completed."
