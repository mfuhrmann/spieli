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

# ── Sweep bookkeeping ─────────────────────────────────────────────────────────
# Recorded as the sweep progresses so that any abort — a planned fail() or an
# unexpected death under `set -e` — can say how far it got. Without this, a run
# that died at stack 5 of 15 looks like a completed run apart from the error
# text, and the ten stacks left on the old image are never mentioned.
upgraded=()        # stacks that finished every step
verify_failed=()   # stacks upgraded, but whose post-upgrade check was inconclusive
current=""         # stack being processed right now
reimport_pids=()   # "name:pid" for forced reimports launched in the background

# $1 = exit code, rest = reason.
report_abort() {
  local rc=$1; shift
  echo "" >&2
  echo "ERROR: $*" >&2
  echo "" >&2
  if [[ ${#upgraded[@]} -gt 0 ]]; then
    echo "  Upgraded before the abort: ${upgraded[*]}" >&2
  else
    echo "  Upgraded before the abort: (none)" >&2
  fi
  echo "  Aborted while processing:  ${current:-<before the first stack>}" >&2
  echo "  NOT upgraded:              that stack and every one after it." >&2
  echo "                             Re-run after fixing — completed stacks are idempotent." >&2

  # A forced reimport is launched detached, so it outlives this script. Re-running
  # the sweep while one is in flight makes the next api.sql step race it on the
  # playground_stats DROP/CREATE — the race documented at the API_ONLY step below.
  local entry pid
  for entry in "${reimport_pids[@]:-}"; do
    [[ -n "$entry" ]] || continue
    pid=${entry##*:}
    if kill -0 "$pid" 2>/dev/null; then
      echo "" >&2
      echo "  WARNING: a forced reimport for ${entry%%:*} is still running (PID $pid)." >&2
      echo "           Wait for it to finish before re-running, or the api.sql step" >&2
      echo "           will race it and fail." >&2
    fi
  done
  exit "$rc"
}

fail() { report_abort 1 "$*"; }

# Catch the abort points that are not guarded by an explicit `|| fail`: image
# pulls, container starts, the API_ONLY importer run. Without this they die bare
# under `set -e` and the operator gets a raw Compose error with no indication
# that later stacks were skipped.
trap 'report_abort $? "unexpected failure while processing ${current:-<startup>}"' ERR

for entry in "${STACKS[@]}"; do
  IFS=: read -r dir profiles port <<< "$entry"
  name=$(basename "$dir")
  current="$name"

  echo ""
  echo "━━━ $name ━━━"

  cd "$dir" || fail "Cannot cd to $dir"

  profile_flags=()
  for p in $profiles; do
    profile_flags+=(--profile "$p")
  done

  echo "→ Pulling images..."
  # Explicitly pull each image by name to bypass the Docker daemon's manifest
  # cache, which can cause `docker compose pull` to skip a freshly-pushed tag
  # it already has locally (observed with rapid CI push + immediate upgrade run).
  docker compose config --images | sort -u | xargs -I{} docker pull {}
  docker compose pull

  echo "→ Restarting app container..."
  docker compose "${profile_flags[@]}" up -d app

  # Pure hub stacks (DEPLOY_MODE=ui) have no importer — skip importer steps.
  if [[ "$profiles" == *"data-node"* ]]; then
    echo "→ Applying api.sql (one-shot, never triggers full reimport)..."
    # Run API_ONLY=1 before restarting the daemon. The daemon only runs api.sql
    # on container startup; while it is idle between reimport cycles it won't
    # touch playground_stats. Running both concurrently races on the DROP/CREATE
    # of that materialized view and reliably fails on large datasets.
    docker compose --profile data-node-ui run --rm -e API_ONLY=1 importer
  else
    echo "→ Pure hub — no importer, skipping api.sql step."
  fi

  echo "→ Verifying..."
  sleep 3
  # Verification is deliberately NOT fatal to the sweep. By this point the images
  # are pulled and the containers restarted, so the upgrade itself succeeded; only
  # the check is inconclusive. Aborting here would leave every later stack on the
  # old image over a stack that is merely not serving data yet. Inconclusive
  # results are collected and reported with a non-zero exit at the very end.
  #
  # The status code is read explicitly rather than relying on `curl -sf`, which
  # collapses "nothing is listening" and "PostgREST answered 404" into one exit
  # status. That distinction matters: a data-node that has never completed an
  # import has no api schema, so get_meta does not exist and 404 is the expected
  # answer, not a fault (#759, #779).
  body=$(mktemp)
  if [[ "$profiles" == *"data-node"* ]]; then
    # `|| true` then a separate emptiness check: curl already reports 000 in
    # %{http_code} when it never got a response, so overwriting a code it did
    # print would throw away the 404-vs-unreachable distinction this relies on.
    code=$(curl -s -o "$body" -w '%{http_code}' \
      "http://localhost:${port}/api/rpc/get_meta") || true
    [[ -n "$code" ]] || code=000
    if [[ "$code" == "200" ]]; then
      result=$(python3 -c "import sys,json; d=json.load(sys.stdin); print('version:', d.get('version','?'), ' playgrounds:', d.get('playground_count','?'))" < "$body")
      playground_count=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('playground_count', 0))" < "$body")
      echo "  $result"
    else
      # -1 (not 0) so the forced-reimport trigger below is skipped: on a stack
      # that has never imported, the daemon importer restarted above does the
      # first import itself, and a second concurrent importer would race it.
      playground_count=-1
      verify_failed+=("$name (HTTP $code)")
      if [[ "$code" == "404" ]]; then
        echo "  get_meta returned 404 — no api schema, so this stack has most likely never"
        echo "  completed an import. The daemon importer applies api.sql on its first import"
        echo "  run. Upgrade succeeded; not treating this as a sweep failure."
      else
        echo "  WARNING: get_meta check failed (HTTP $code) on port $port."
        echo "  Images were upgraded and containers restarted; verification was inconclusive."
      fi
    fi
  else
    # Pure hub has no PostgREST — verify the app is serving HTTP instead.
    code=$(curl -s -o "$body" -w '%{http_code}' "http://localhost:${port}/") || true
    [[ -n "$code" ]] || code=000
    if [[ "$code" == "200" ]]; then
      echo "  app responding on port ${port}"
    else
      verify_failed+=("$name (HTTP $code)")
      echo "  WARNING: app check failed (HTTP $code) on port $port."
    fi
    playground_count=-1
  fi
  rm -f "$body"

  if [[ "$profiles" == *"data-node"* ]]; then
    echo "→ Restarting daemon importer on new image..."
    # Restart after verify so the daemon's api.sql startup run does not race
    # with the API_ONLY=1 container above.
    docker compose "${profile_flags[@]}" up -d importer

    if [[ "$playground_count" -eq 0 ]]; then
      logfile="/tmp/${name}-reimport.log"
      echo "→ No playgrounds found — triggering forced reimport in background (log: $logfile)"
      (
        docker compose --profile data-node-ui run --rm \
          -e REIMPORT_INTERVAL_MIN_DAYS= \
          -e REIMPORT_INTERVAL_MAX_DAYS= \
          importer
      ) > "$logfile" 2>&1 &
      reimport_pids+=("$name:$!")
      echo "  PID $! — check log when done: tail -f $logfile"
    fi
  fi

  echo "✓ $name done"
  upgraded+=("$name")
done

current=""

echo ""
if [[ ${#verify_failed[@]} -gt 0 ]]; then
  echo "All ${#upgraded[@]} stacks upgraded, but verification was inconclusive for:"
  for v in "${verify_failed[@]}"; do
    echo "  - $v"
  done
  echo ""
  echo "Every stack's image was pulled and its containers restarted. A fresh data-node"
  echo "with no completed import is expected to show HTTP 404 until its first import"
  echo "finishes — check the daemon importer's log for those."
  exit 1
fi
echo "All ${#upgraded[@]} stacks upgraded."
