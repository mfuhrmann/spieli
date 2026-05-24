#!/usr/bin/env bash
# force-reimport-empty.sh — triggers forced reimport for every data-node stack
# that currently reports 0 playgrounds. Runs imports in the background so all
# stacks start in parallel. Logs to /tmp/<name>-reimport.log.
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
)

pids=()

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

  logfile="/tmp/${name}-reimport.log"
  echo "→ $name — 0 playgrounds, triggering forced reimport (log: $logfile)"
  (
    cd "$dir"
    docker compose --profile data-node-ui run --rm \
      -e REIMPORT_INTERVAL_MIN_DAYS= \
      -e REIMPORT_INTERVAL_MAX_DAYS= \
      importer
  ) > "$logfile" 2>&1 &
  pids+=("$!:$name:$logfile")
done

if [[ ${#pids[@]} -eq 0 ]]; then
  echo "All stacks have data — nothing to do."
  exit 0
fi

echo ""
echo "Waiting for ${#pids[@]} reimport(s) to complete..."
failed=()
for entry in "${pids[@]}"; do
  IFS=: read -r pid name logfile <<< "$entry"
  if wait "$pid"; then
    echo "✓ $name done"
  else
    echo "✗ $name FAILED — see $logfile"
    failed+=("$name")
  fi
done

echo ""
if [[ ${#failed[@]} -gt 0 ]]; then
  echo "Failed: ${failed[*]}"
  exit 1
fi
echo "All forced reimports completed."
