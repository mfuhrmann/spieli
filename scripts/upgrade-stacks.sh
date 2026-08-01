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
  "$HOME/spieli-niedersachsen:data-node-ui:8096"
  # Port 8095 is intentionally absent: Baden-Württemberg is hosted on a
  # different operator's machine and joins the federation via registry.json,
  # so this host has no ~/spieli-bawue stack to upgrade. Do not re-add it here.
  # Note scripts/setup-germany-backends.sh allocates 8095 to bawue in its
  # federation-wide BACKENDS list and would provision it locally too —
  # SKIP_SLUGS=("bawue") is what keeps it off this host, and that opt-out is
  # manual, so confirm it before assuming the stack is absent.
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
  #
  # The profile flags are REQUIRED here: app and importer are profile-gated
  # (profiles: [ui, data-node-ui] / [data-node, data-node-ui]). Without them,
  # `config --images` and `pull` silently exclude those services, so the
  # freshly-built spieli / spieli-importer :latest tags are never pulled and
  # `up -d app` then boots the stale locally-cached image.
  #
  # Only the ghcr.io/mfuhrmann :latest tags need the manifest-cache bypass — CI
  # re-pushes those under a tag that is usually already present locally.
  # Everything else is left to `docker compose pull` below: postgis and
  # postgrest are version-pinned, and containrrr/watchtower is untagged (so
  # :latest) but is only reached by the hub's auto-update profile.
  # Force-pulling all of them would turn a stack sweep into 60+ registry
  # requests, where one anonymous Docker Hub 429 on an image that did not need
  # pulling would abort the whole run under `set -e`.
  # Capture the status explicitly: `mapfile < <(...)` cannot fail, because
  # process-substitution exit status is not propagated and pipefail does not
  # reach inside <(). A failing or empty `config --images` would leave images
  # empty, skip the loop, and let `up -d app` boot the stale cached digest —
  # the bug this block exists to prevent, failing silently. An empty result is
  # also fatal: it means the profile does not match the stack's compose file.
  images_raw=$(docker compose "${profile_flags[@]}" config --images | sort -u) \
    || fail "docker compose config --images failed for $name — later stacks were NOT upgraded"
  [[ -n "$images_raw" ]] \
    || fail "no images resolved for $name (profiles: '$profiles') — later stacks were NOT upgraded"
  mapfile -t images <<< "$images_raw"
  for img in "${images[@]}"; do
    [[ "$img" == ghcr.io/mfuhrmann/* ]] || continue
    docker pull "$img" \
      || fail "docker pull $img failed for $name — later stacks were NOT upgraded, re-run after fixing"
  done
  # Guarded for the same reason as the GHCR loop above: with the profile flags
  # this now genuinely reaches Docker Hub for postgis/postgrest, so an anonymous
  # 429 here would otherwise abort the sweep with a bare Compose error and no
  # indication that the remaining stacks were never upgraded.
  docker compose "${profile_flags[@]}" pull \
    || fail "docker compose pull failed for $name — later stacks were NOT upgraded, re-run after fixing"

  # Pure hub stacks (DEPLOY_MODE=ui) have no importer — skip importer steps.
  if [[ "$profiles" == *"data-node"* ]]; then
    # The daemon importer must be stopped for the whole apply, not merely assumed
    # idle. Its startup path applies api.sql itself (importer/import.sh), so any
    # restart during the one-shot below races it on the playground_stats
    # DROP/CREATE. Worse, until it is recreated the daemon still runs the *old*
    # image and therefore the old api.sql: when it wins that race it leaves the
    # previous schema in place, and every later check passes because the old
    # schema is internally consistent (#800 — a v0.9.0 app served the v0.8.0
    # matview, missing has_theme, with the row count and get_meta looking fine).
    echo "→ Stopping daemon importer for the schema apply..."
    docker compose "${profile_flags[@]}" stop importer

    echo "→ Applying api.sql (one-shot, never triggers full reimport)..."
    # Sole writer now: the daemon is down and this container runs the freshly
    # pulled image. Unlike the daemon's startup apply — deliberately non-fatal —
    # a failure here aborts the sweep, which is the signal the sweep relies on.
    docker compose "${profile_flags[@]}" run --rm -e API_ONLY=1 importer

    echo "→ Recreating daemon importer on the new image..."
    # --force-recreate, not a plain `up -d`: a stopped container is restarted
    # from the image it was created with, so `up -d` alone would bring the old
    # image back up (#800). Recreating re-runs the daemon's own startup apply of
    # the same api.sql — idempotent, and cheap next to leaving the stack on an
    # image whose schema no longer matches the app.
    docker compose "${profile_flags[@]}" up -d --force-recreate importer
  else
    echo "→ Pure hub — no importer, skipping api.sql step."
  fi

  # After the importer, so the app is only restarted once the schema it expects
  # is the one in the database.
  echo "→ Restarting app container..."
  docker compose "${profile_flags[@]}" up -d app

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
      # that has never imported, the daemon importer recreated above does the
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
    # The daemon importer was already recreated on the new image before the
    # schema apply — see the stop/apply/recreate sequence above. Restarting it
    # here as well would apply api.sql a third time for no benefit.

    if [[ "$playground_count" -eq 0 ]]; then
      logfile="/tmp/${name}-reimport.log"
      echo "→ No playgrounds found — triggering forced reimport in background (log: $logfile)"
      (
        docker compose "${profile_flags[@]}" run --rm \
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
